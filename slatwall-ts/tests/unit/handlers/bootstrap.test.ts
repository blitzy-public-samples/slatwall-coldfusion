// The composition root, under test.
//
// What this suite owns, and what it deliberately does not: - it owns the wiring and the
// composition.
//
// JUDGMENT CALL: the composition step is isolated by substituting the collaborators one ASSEMBLY
// produced - `scope.priceGroupService`, which the scope publishes, and the concrete
// `priceGroupRepository`, which comes back beside it from `createInspectableRequestScope` - with
// `vi.spyOn`.
//
// JUDGMENT CALL: the executor is a hand-written recording double keyed by statement text rather
// than by call ordinal.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PriceGroup } from '../../../src/domain/entities/priceGroup.js';
import type { PriceGroupRate } from '../../../src/domain/entities/priceGroupRate.js';
import { PromotionQualifier } from '../../../src/domain/entities/promotionQualifier.js';
import type { PromotionAppliedIntent } from '../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { ShippingAddressView } from '../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import {
  EuropeanCentralBankCurrencyConverter,
  bootstrapCompositionRoot,
  OrderViewDocumentDataError,
  resetCompositionRoot,
  UntrustedFeedHostError,
} from '../../../src/handlers/bootstrap.js';
import type {
  AppliedPromotionDocument,
  CompositionRoot,
  OrderFulfillmentDocument,
  OrderItemDocument,
  OrderViewDocument,
  RequestScope,
  RequestScopeAdapters,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import { appConfig } from '../../../src/lib/config.js';
import { logger } from '../../../src/lib/logger.js';
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
// Three type-only imports for the third suite's guard cases.
import type { SettingKey } from '../../../src/domain/ports/settingsProvider.js';
import type {
  UrlTitleGenerator,
  UrlTitleTableName,
} from '../../../src/domain/ports/urlTitleGenerator.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
// PRODUCT and SKU the hydrator's two repository reads answer with, so those cases assert entity
// IDENTITY - the very instance the repository handed back is the one on the view - rather than
// structural equality.
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';
import type { Product } from '../../../src/domain/entities/product.js';
import type { Sku } from '../../../src/domain/entities/sku.js';
import { Brand } from '../../../src/domain/entities/brand.js';
import { RoundingRule } from '../../../src/domain/entities/roundingRule.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyConverter } from '../../../src/domain/ports/currencyConverter.js';
// The port's own folding helper, so this suite's doubles key their maps exactly as the adapters
// do.
import { cfFoldKey } from '../../../src/lib/cfml/struct.js';
import { CfmlBooleanConversionError } from '../../../src/lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../../src/lib/cfml/truthiness.js';

// No `BrandPersistenceUnavailableError` import any more.
import { MySqlPriceGroupRepository } from '../../../src/repositories/mysql/mysqlPriceGroupRepository.js';
// The other five ADAPTER CLASSES, imported for one case: the assertion that no member of a
// published `RequestScope` is an instance of any of them.
import { MysqlOptionRepository } from '../../../src/repositories/mysql/mysqlOptionRepository.js';
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
import { MysqlPromotionRepository } from '../../../src/repositories/mysql/mysqlPromotionRepository.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';

// The statements this suite observes, quoted from the subject verbatim.

/**
 * `SELECT_CURRENCY_RECORDS_SQL`, the one EAGER read tier 1 performs.
 */
const CURRENCY_RECORDS_SQL = 'SELECT currencyCode, activeFlag FROM SwCurrency';

/**
 * `buildSelectGeneralSettingsSql(7)`, the SECOND eager read tier 1 performs.
 */
const PER_SKU_SETTINGS_PREDICATE = 'WHERE LOWER(settingName) IN (?, ?)';

const GENERAL_SETTINGS_SQL =
  'SELECT settingName, settingValue, accountID, contentID, cmsContentID, brandID, emailID, ' +
  'emailTemplateID, fulfillmentMethodID, paymentMethodID, productID, productTypeID, ' +
  'shippingMethodID, shippingMethodRateID, siteID, skuID, subscriptionTermID, ' +
  'subscriptionUsageID, taskID FROM SwSetting ' +
  'WHERE LOWER(settingName) IN (?, ?, ?, ?, ?, ?, ?)';

/**
 * `SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL`, the first statement the price-group pass issues.
 */
const ACCOUNT_PRICE_GROUP_IDS_SQL =
  'SELECT priceGroupID FROM SwAccountPriceGroup WHERE accountID = ?';

/**
 * `SELECT_ADDRESS_ZONE_LOCATIONS_SQL`, the one PER-REQUEST read opening a scope performs.
 *
 * Quoted verbatim, including the join, because the join is the load-bearing part: there is no
 * `AddressZoneLocation` entity in the legacy model, `SwAddressZoneLocation` is a LINK TABLE
 * [model/entity/AddressZone.cfc:L61].
 */
const ADDRESS_ZONE_LOCATIONS_SQL =
  'SELECT zoneLocation.addressZoneID, ' +
  'location.postalCode, location.city, location.stateCode, location.countryCode ' +
  'FROM SwAddressZoneLocation zoneLocation ' +
  'INNER JOIN SwAddress location ON zoneLocation.addressID = location.addressID';

// The recording executor.

/**
 * One statement, exactly as the recording executor received it.
 */
interface RecordedStatement {
  readonly sql: string;
  readonly params: readonly unknown[] | undefined;
}

/**
 * An empty result set. Frozen, so a caller cannot grow one double's answer into another's.
 */
const NO_ROWS: readonly SqlRow[] = Object.freeze([]);

/**
 * What a mutation would answer if one were ever issued.
 */
const UNUSED_MUTATION_RESULT: SqlMutationResult = Object.freeze({
  affectedRows: 0,
  warningStatus: 0,
});

/**
 * A hand-written `PreparedStatementExecutor` that records every statement and answers from a
 * text-keyed table.
 *
 * Hand-written because the thirteen exact pins include no mocking library and none may be added.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  /**
   * Every result-set statement, in the order it was issued.
   */
  public readonly calls: RecordedStatement[] = [];

  /**
   * Every data-modifying statement. Expected to stay empty.
   */
  public readonly mutationCalls: RecordedStatement[] = [];

  private readonly rowsBySql = new Map<string, readonly SqlRow[]>();

  private readonly rowsByFragment: { fragment: string; rows: readonly SqlRow[] }[] = [];

  /**
   * Answer `sql` with `rows`. Every unseeded statement answers no rows.
   */
  public seed(sql: string, rows: readonly SqlRow[]): this {
    this.rowsBySql.set(sql, rows);

    return this;
  }

  /**
   * Answer any statement containing `fragment` with `rows`.
   *
   * Needed for the one statement this file cannot name exactly.
   *
   * Consulted only after the exact map, so an exact seed always wins.
   */
  public seedMatching(fragment: string, rows: readonly SqlRow[]): this {
    this.rowsByFragment.push({ fragment, rows });

    return this;
  }

  public execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params });

    const exact = this.rowsBySql.get(sql);
    if (exact !== undefined) {
      return Promise.resolve(exact);
    }

    const matched = this.rowsByFragment.find((candidate) => sql.includes(candidate.fragment));

    return Promise.resolve(matched?.rows ?? NO_ROWS);
  }

  public executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    this.mutationCalls.push({ sql, params });

    return Promise.resolve(UNUSED_MUTATION_RESULT);
  }

  /**
   * Join rather than nest, which is what the port itself does: the callback receives this
   * executor, so every statement it issues is recorded in the same sequence as every other.
   */
  public transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }

  /**
   * How many times `sql` was issued, by exact text.
   */
  public countOf(sql: string): number {
    return this.calls.filter((call) => call.sql === sql).length;
  }

  /**
   * The index of the first issue of `sql`, or `-1`.
   */
  public firstIndexOf(sql: string): number {
    return this.calls.findIndex((call) => call.sql === sql);
  }
}

// Configuration, supplied explicitly and never read from a file.

/**
 * The value standing in for the two variables the credential group requires.
 *
 * It is not a credential and is not credential-shaped: nothing in this suite opens a connection,
 * an executor override means no pool is ever created.
 */
const UNUSED_PLACEHOLDER = 'unused-by-this-suite';

/**
 * A NAMED host that can never resolve, which is what `DB_TLS_MODE=verify-identity` requires.
 */
const UNRESOLVABLE_HOST = 'slatwall-database.invalid';

/**
 * Every variable `src/lib/config.ts` requires with no default, with a MIS-CASED dialect spelling.
 */
const BASE_ENVIRONMENT: EnvironmentSource = Object.freeze({
  DB_HOST: UNRESOLVABLE_HOST,
  DB_USER: UNUSED_PLACEHOLDER,
  DB_PASSWORD: UNUSED_PLACEHOLDER,
  DB_TLS_MODE: 'verify-identity',
  // `mySql` rather than `MySQL`: three legacy sites spell the product name three different ways,
  // so the case-folding normalization in `src/lib/config.ts` is part of the contract, not a
  // nicety.
  DB_DIALECT: 'mySql',
});

/**
 * The same contract with a product-feed allow-list configured.
 */
const FEED_ENVIRONMENT: EnvironmentSource = Object.freeze({
  ...BASE_ENVIRONMENT,
  FEED_ALLOWED_HOSTS: 'shop.example.com',
});

/**
 * The same contract with a recognized-but-unimplemented dialect.
 */
const ORACLE_ENVIRONMENT: EnvironmentSource = Object.freeze({
  ...BASE_ENVIRONMENT,
  DB_DIALECT: 'Oracle10g',
});

/**
 * Three currency rows, one of them INACTIVE.
 *
 * The inactive row is the whole point: `getAllActiveCurrencyIDList` applies the
 * `addFilter('activeFlag', 1)` the legacy applies [model/service/CurrencyService.cfc:L60].
 */
const CURRENCY_ROWS: readonly SqlRow[] = Object.freeze([
  Object.freeze({ currencyCode: 'USD', activeFlag: 1 }),
  Object.freeze({ currencyCode: 'EUR', activeFlag: 0 }),
  Object.freeze({ currencyCode: 'GBP', activeFlag: 1 }),
]);
const INACTIVE_CURRENCY_ROWS: readonly SqlRow[] = Object.freeze([
  Object.freeze({ currencyCode: 'USD', activeFlag: 0 }),
  Object.freeze({ currencyCode: 'EUR', activeFlag: 0 }),
]);

/**
 * Every relationship column of `SwSetting`, in the order the subject selects them.
 *
 * The list is the predicate: a global probe requires every one of them to be NULL
 * [model/service/SettingService.cfc:L768-L870].
 */
const SETTING_RELATIONSHIP_COLUMN_NAMES: readonly string[] = Object.freeze([
  'accountID',
  'contentID',
  'cmsContentID',
  'brandID',
  'emailID',
  'emailTemplateID',
  'fulfillmentMethodID',
  'paymentMethodID',
  'productID',
  'productTypeID',
  'shippingMethodID',
  'shippingMethodRateID',
  'siteID',
  'skuID',
  'subscriptionTermID',
  'subscriptionUsageID',
  'taskID',
]);

/**
 * One GLOBAL `SwSetting` row: the named setting, its value, and every relationship column NULL.
 *
 * Relationship-free is what makes the row global, and it is the only shape the composition root's
 * probe can match - see `GENERAL_SETTINGS_SQL`.
 */
function generalSettingRow(settingName: string, settingValue: string | null): SqlRow {
  const row: Record<string, unknown> = { settingName, settingValue };

  for (const columnName of SETTING_RELATIONSHIP_COLUMN_NAMES) {
    row[columnName] = null;
  }

  return row;
}

// Narrowing helpers. `noUncheckedIndexedAccess` is on, so every indexed read is narrowed rather
// than asserted - there is no postfix `!` anywhere in this file.

function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new Error(`the suite required ${description}, which was absent`);
  }

  return value;
}

/**
 * The order item at `index`, narrowed.
 */
function itemAt(order: OrderView, index: number): OrderItemView {
  return requirePresent(order.orderItems[index], `order item ${String(index)}`);
}

/**
 * The `Error` a rejected promise carries.
 *
 * JUDGMENT CALL: the module keeps every one of its five error classes non-exported -
 * `CompositionColumnError` `src/handlers/bootstrap.ts`, `CompositionDataError`
 * [model/service/SettingService.cfc:L648], `CompositionWiringError`
 * [model/service/SettingService.cfc:L663], `ImageStoreNotConfiguredError`
 * [model/service/SettingService.cfc:L674] and `SubscriptionTermsNotConfiguredError`
 * [model/service/SettingService.cfc:L687].
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
 * Narrow a caught `Error` to the one refusal class this module does export.
 *
 * Why this one is `instanceof`-ABLE when the five in the note above are not.
 */
function requireDocumentDataError(raised: Error): OrderViewDocumentDataError {
  if (!(raised instanceof OrderViewDocumentDataError)) {
    throw new Error(
      `the suite expected an OrderViewDocumentDataError and the call raised ${raised.name}`,
    );
  }

  return raised;
}

/**
 * Everything a refusal could put in front of a caller or an operator, as one string.
 *
 * The no-echo assertions have to cover both channels, because they fail differently: a published
 * `fields` entry reaches the response body, and the `Error` message reaches the log stream.
 */
function publishedTextOf(raised: Error): string {
  const fields =
    raised instanceof OrderViewDocumentDataError
      ? raised.fields.map((field) => `${field.path} ${field.message}`).join(' ')
      : '';

  return `${raised.message} ${fields}`;
}

/**
 * Every primitive reachable from `subject` by walking own enumerable members, transitively.
 *
 * Functions are descended into as well as objects, because own enumerable properties hung off a
 * function are reachable exactly like object members.
 *
 * A visited set makes the walk safe against the cycles the wiring legitimately contains, and each
 * member is read defensively because a member that refuses to be read cannot be leaking a value.
 */
function deepValues(subject: unknown): readonly unknown[] {
  const collected: unknown[] = [];
  const seen = new Set<unknown>();

  const walk = (value: unknown): void => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'object' && typeof value !== 'function') {
      collected.push(value);

      return;
    }

    if (seen.has(value)) {
      return;
    }

    seen.add(value);

    // Narrowed once into a keyed view.
    const members = value as Record<string, unknown>;

    for (const key of Object.keys(members)) {
      try {
        walk(members[key]);
      } catch {
        // The lazy `valueRounder` forward refuses to answer until its binding closes, and a member
        // that throws on read is not a member that hands a credential to a caller.
        continue;
      }
    }
  };

  walk(subject);

  return collected;
}

/**
 * Every property NAME reachable from a subject, breadth-first, de-duplicated and sorted per level.
 *
 * The companion to `deepValues` above, and it exists because the least-privilege diagnostics case
 * needs to assert that a name is ABSENT.
 */
function deepKeys(subject: unknown): readonly string[] {
  const collected: string[] = [];
  const seen = new Set<unknown>();
  let frontier: readonly unknown[] = [subject];

  while (frontier.length > 0) {
    const level: string[] = [];
    const next: unknown[] = [];

    for (const value of frontier) {
      if (value === null || typeof value !== 'object' || seen.has(value)) {
        continue;
      }

      seen.add(value);

      const members = value as Record<string, unknown>;

      for (const key of Object.keys(members)) {
        if (!level.includes(key)) {
          level.push(key);
        }

        next.push(members[key]);
      }
    }

    collected.push(...level.sort());
    frontier = next;
  }

  return collected;
}

// There is no `raisedBy` helper any more, and its own documentation is why.
//
// It read, verbatim: "The `Error` a synchronous call raises.
//
// The premise was false, and the composition root's own defect proved it.

/**
 * A recording executor already seeded with the two statements tier 1 issues.
 *
 * The settings read is seeded with no ROWS by default, which is the ordinary case: an installation
 * with no `SwSetting` override resolves every key from its declared default.
 */
function makeExecutor(
  currencyRows: readonly SqlRow[] = CURRENCY_ROWS,
  settingRows: readonly SqlRow[] = NO_ROWS,
): RecordingExecutor {
  return new RecordingExecutor()
    .seed(CURRENCY_RECORDS_SQL, currencyRows)
    .seed(GENERAL_SETTINGS_SQL, settingRows);
}

/**
 * The two order passes, restored for observation only.
 *
 * The composition root withdraws `updateOrderAmountsWithPriceGroups` and
 * `updateOrderAmountsWithPromotions` from the PUBLISHED TYPES - `RequestScope.priceGroupService`
 * is `Omit<PriceGroupService, 'updateOrderAmountsWithPriceGroups'>` and
 * `RequestScope.promotionService` is the promotion equivalent - so no caller can run either pass
 * alone.
 */
function observableOrderPass(published: RequestScope['priceGroupService']): PriceGroupService {
  return published as PriceGroupService;
}

/**
 * The promotion half of {@link observableOrderPass}.
 */
function observablePromotionPass(published: RequestScope['promotionService']): PromotionService {
  return published as PromotionService;
}

/**
 * The SET-BASED by-key price-group read, reached through the port-typed member that publishes it.
 */
function observableSetLoader(
  assembled: RequestScopeAdapters['priceGroupRepository'],
): MySqlPriceGroupRepository {
  if (!(assembled instanceof MySqlPriceGroupRepository)) {
    throw new TypeError(
      'The assembled priceGroupRepository is expected to be the MySQL adapter, which is what ' +
        'carries the set-based by-key read the composed pricing operation uses.',
    );
  }

  return assembled;
}

/**
 * Arms the set loader with the price groups a case wants resolvable, keyed the way the real loader
 * keys its answer.
 *
 * CASE-FOLDED KEYS, because the real loader folds: CFML identifiers are case-insensitive and the
 * intent's spelling need not match the stored row's.
 */
function armSetLoader(scope: RequestScope, resolvable: readonly PriceGroup[]) {
  const answer = new Map<string, PriceGroup>(
    resolvable.map((priceGroup) => [priceGroup.getPriceGroupID().toLowerCase(), priceGroup]),
  );

  return vi
    .spyOn(observableSetLoader(adaptersOf(scope).priceGroupRepository), 'getPriceGroupsByID')
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

/**
 * Boot with both overrides supplied.
 *
 * Supplying `executor` means `getPreparedStatementExecutor()` in `src/handlers/bootstrap.ts` is
 * never reached, so no `mysql2` pool is created and no socket is opened.
 */
function bootWith(
  executor: RecordingExecutor,
  environment: EnvironmentSource = BASE_ENVIRONMENT,
): Promise<CompositionRoot> {
  return bootstrapCompositionRoot({ executor, environment });
}

/**
 * The adapters each opened scope was assembled with, remembered by the SUITE.
 *
 * That the suite has to keep a record at all is the property under test: there is no route from a
 * scope to an adapter.
 */
const adaptersByScope = new WeakMap<RequestScope, RequestScopeAdapters>();

/**
 * Opens a scope through the inspection hook and remembers the adapters it was assembled with.
 *
 * One assembly, so the adapters recorded here are by IDENTITY the ones the returned scope's
 * services and composed pricing operation closed over.
 */
async function openScopeWithAdapters(
  root: CompositionRoot,
  input?: RequestScopeInput,
): Promise<RequestScope> {
  const opened = await root.createInspectableRequestScope(input);

  adaptersByScope.set(opened.scope, opened.adapters);

  return opened.scope;
}

/**
 * The adapters `scope` was assembled with, narrowed.
 */
function adaptersOf(scope: RequestScope): RequestScopeAdapters {
  return requirePresent(
    adaptersByScope.get(scope),
    'a scope opened through openScopeWithAdapters; a scope from createRequestScope has no ' +
      'recorded adapters, because nothing on it leads to one',
  );
}

beforeEach(() => {
  // The memo is module state and `appConfig` carries its own. Both are cleared on the way in as
  // well as on the way out, so a case cannot inherit either from a sibling file that ran earlier
  // in the same worker.
  resetCompositionRoot();
  appConfig.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetCompositionRoot();
  appConfig.reset();
});

// Tier-one initialization - what happens exactly once, before any request.

describe('bootstrapCompositionRoot tier-one initialization', () => {
  it('publishes exactly the six module-scope members and nothing else', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // The published surface is asserted as a SET, not member by member, so that a member silently
    // added or dropped fails here rather than passing quietly.
    expect(Object.keys(root).sort()).toEqual([
      'createInspectableRequestScope',
      'createRequestScope',
      'diagnostics',
      'dialect',
      'integration',
      'settingsProvider',
    ]);
    expect(typeof root.createRequestScope).toBe('function');
  });

  it('normalizes the configured dialect spelling and republishes it as its own member', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // BASE_ENVIRONMENT spells it `mySql`.
    //
    // The first two assertions read `root.diagnostics` where they once read `root.config`.
    expect(root.diagnostics.dialect).toBe('MySQL');
    expect(root.dialect).toBe('MySQL');
    expect(root.dialect).toBe(root.diagnostics.dialect);
  });

  it('★★ PUBLISHES NEITHER THE DEFAULTED SCHEMA NAME NOR THE DEFAULTED PORT', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // The defaults themselves are still pinned - `Slatwall` and `3306` - in
    // `tests/unit/lib/config.test.ts`, against the configuration object that legitimately carries
    // them.
    expect(Object.keys(root.diagnostics)).not.toContain('database');
    expect(JSON.stringify(root.diagnostics)).not.toContain('Slatwall');
    expect(JSON.stringify(root.diagnostics)).not.toContain('3306');
    expect(deepValues(root).filter((value) => String(value) === 'Slatwall')).toStrictEqual([]);
    expect(deepValues(root).filter((value) => String(value) === '3306')).toStrictEqual([]);
  });

  it('★★ REDUCES THE DIAGNOSTIC SURFACE TO CLOSED ENUMERATIONS, A BOOLEAN AND TWO COUNTS', async () => {
    // Raised the published diagnostics as MINOR / Security - Least Privilege: the exported record
    // "exposes database/port, all pool limits, feed allow-list, and complete rate table to every
    // root consumer".
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // `database` and `pool` are GONE rather than redacted. A record of five identical markers is
    // not a diagnostic, and there is no reduced form of a capacity number that is not one.
    expect(Object.keys(root.diagnostics).sort()).toStrictEqual([
      'currency',
      'dialect',
      'environment',
      'feed',
      'tls',
    ]);

    // What survives, and the shape of each: two closed enumerations, a posture triple whose third
    // member is a boolean, and two counts.
    expect(root.diagnostics.environment).toBe('development');
    expect(root.diagnostics.dialect).toBe('MySQL');
    expect(Object.keys(root.diagnostics.tls).sort()).toStrictEqual([
      'certificateAuthorityConfigured',
      'minimumVersion',
      'mode',
    ]);
    expect(root.diagnostics.tls.certificateAuthorityConfigured).toBe(false);
    expect(Object.keys(root.diagnostics.feed)).toStrictEqual(['allowedHostCount']);
    expect(Object.keys(root.diagnostics.currency).sort()).toStrictEqual([
      'ratesRetrievedAtConfigured',
      'referenceRateCount',
    ]);

    // And every withdrawn fact is absent at every depth, not merely absent from the member it used
    // to sit on.
    expect(deepKeys(root.diagnostics)).toStrictEqual([
      'currency',
      'dialect',
      'environment',
      'feed',
      'tls',
      'allowedHostCount',
      'certificateAuthorityConfigured',
      'minimumVersion',
      'mode',
      'ratesRetrievedAtConfigured',
      'referenceRateCount',
    ]);
    for (const withdrawn of [
      'database',
      'host',
      'port',
      'user',
      'password',
      'pool',
      'connectionLimit',
      'connectTimeoutMs',
      'maxIdle',
      'idleTimeoutMs',
      'allowedHosts',
      'europeanCentralBankRates',
      'ratesRetrievedAt',
      'certificateAuthority',
    ]) {
      expect(deepKeys(root.diagnostics)).not.toContain(withdrawn);
    }
  });

  it('reports the two optional data sets as counts, so a caller can tell loaded from empty', async () => {
    // The counts exist to answer two questions and no others: did the allow-list load, and did
    // rates arrive.
    const executor = makeExecutor();

    const root = await bootWith(executor, {
      ...BASE_ENVIRONMENT,
      FEED_ALLOWED_HOSTS: 'shop.example.com, feeds.example.com',
      ECB_REFERENCE_RATES: 'USD=1.0850,GBP=0.8400,CHF=0.9500',
      ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
    });

    expect(root.diagnostics.feed.allowedHostCount).toBe(2);
    expect(root.diagnostics.currency.referenceRateCount).toBe(3);
    expect(root.diagnostics.currency.ratesRetrievedAtConfigured).toBe(true);

    // And not one of the five supplied values is readable through the count. This is the half of
    // the reduction that a count alone would not prove: a member could carry both a length and the
    // list it was taken from.
    const surface = JSON.stringify(root.diagnostics);
    for (const supplied of ['shop.example.com', 'feeds.example.com', '1.0850', '0.8400']) {
      expect(surface).not.toContain(supplied);
    }
  });

  it('reports an unconfigured deployment as two zeroes rather than as absent members', async () => {
    // `0` and `false` are meaningful readings, not missing data: both keys are optional, an empty
    // allow-list means this deployment serves no feed.
    const executor = makeExecutor();

    const root = await bootWith(executor);

    expect(root.diagnostics.feed.allowedHostCount).toBe(0);
    expect(root.diagnostics.currency.referenceRateCount).toBe(0);
    expect(root.diagnostics.currency.ratesRetrievedAtConfigured).toBe(false);
  });

  it('★★★ PUBLISHES NO DATABASE CREDENTIAL, HOST OR ACCOUNT ANYWHERE ON THE ROOT', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // There is no `database` member on the root to read markers out of, which is a stronger outcome
    // than asserting each individual marker is absent from one.
    expect(root.diagnostics).not.toHaveProperty('database');
    expect(JSON.stringify(root.diagnostics)).not.toContain(UNUSED_PLACEHOLDER);
    expect(JSON.stringify(root.diagnostics)).not.toContain(UNRESOLVABLE_HOST);
    expect(
      deepValues(root).filter((value) => String(value).includes(UNUSED_PLACEHOLDER)),
    ).toStrictEqual([]);
    expect(
      deepValues(root).filter((value) => String(value).includes(UNRESOLVABLE_HOST)),
    ).toStrictEqual([]);

    // And `config` is gone rather than renamed. A root that kept the member and added the
    // projection beside it would satisfy every assertion above.
    expect(Object.keys(root)).not.toContain('config');
  });

  it('reads SwCurrency and SwSetting exactly once each, eagerly, and issues no other statement', async () => {
    const executor = makeExecutor();

    await bootWith(executor);

    // EAGERLY: the count is taken before any request scope exists, so the read cannot have been
    // triggered by request-time work.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    // The second eager read. `setting()` is SYNCHRONOUS and returns a non-optional string, so
    // every configured value must exist before the provider reaches the domain - see
    // `GENERAL_SETTINGS_SQL`.
    expect(executor.countOf(GENERAL_SETTINGS_SQL)).toBe(1);
    expect(executor.calls).toHaveLength(2);
    expect(executor.mutationCalls).toHaveLength(0);

    // No PARAMETERS: `readCurrencyRecords` calls `execute(sql)` with one argument
    // `src/handlers/bootstrap.ts`, so the recorded params are `undefined` rather than an empty
    // array.
    const recorded = requirePresent(executor.calls[0], 'the recorded currency read');
    expect(recorded.sql).toBe(CURRENCY_RECORDS_SQL);
    expect(recorded.params).toBeUndefined();
  });

  it('resolves skuEligibleCurrencies from the ACTIVE rows only, preserving the order the rows arrived in', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // The seeded rows are USD (active), eur (inactive), gbp (active).
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('USD,GBP');

    // Both ways this could go wrong are named explicitly, so the assertion above cannot be
    // satisfied by an implementation that skips the filter or one that sorts the result.
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).not.toBe('USD,EUR,GBP');
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).not.toBe('GBP,USD');
  });

  it('carries the three non-currency settings at their documented defaults', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // CFML parity: `skuCurrency` defaults to `USD` [model/service/SettingService.cfc:L221] - the
    // default lives in the setting declaration, never in the entity - and the two URL keys default
    // to `sp` and `spt` [model/service/SettingService.cfc:L178-L179].
    expect(root.settingsProvider.setting('skuCurrency')).toBe('USD');
    expect(root.settingsProvider.setting('globalURLKeyProduct')).toBe('sp');
    expect(root.settingsProvider.setting('globalURLKeyProductType')).toBe('spt');
  });

  it('★★★ prefers a CONFIGURED SwSetting row over the declared default, for every key', async () => {
    // CFML parity [model/service/SettingService.cfc:L595-L608]: with no object in hand the
    // relationship-free probe is the resolution, and its row wins over the seeded default
    // [model/service/SettingService.cfc:L481-L486].
    const executor = makeExecutor(CURRENCY_ROWS, [
      generalSettingRow('skuCurrency', 'GBP'),
      generalSettingRow('globalURLKeyProduct', 'shop'),
      generalSettingRow('globalURLKeyProductType', 'dept'),
      generalSettingRow('skuEligibleCurrencies', 'GBP,EUR'),
    ]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuCurrency')).toBe('GBP');
    expect(root.settingsProvider.setting('globalURLKeyProduct')).toBe('shop');
    expect(root.settingsProvider.setting('globalURLKeyProductType')).toBe('dept');

    // The configured list beats the RUNTIME-COMPUTED default too - the active-currency list is the
    // setting's `defaultValue` [model/service/SettingService.cfc:L222], not its answer.
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('GBP,EUR');
  });

  it('★★★ honours a CONFIGURED EMPTY skuEligibleCurrencies, closing the cascade gate', async () => {
    // Empty is not absent.
    const executor = makeExecutor(CURRENCY_ROWS, [generalSettingRow('skuEligibleCurrencies', '')]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('');

    // And the runtime-computed default is genuinely non-empty for these rows, so the assertion
    // above cannot be satisfied by an installation that simply has no active currency.
    const unconfigured = await bootWith(makeExecutor());
    expect(unconfigured.settingsProvider.setting('skuEligibleCurrencies')).toBe('USD,GBP');
  });

  it('★★ matches the setting name WITHOUT REGARD TO CASE, as every legacy probe does', async () => {
    // CFML parity [model/service/SettingService.cfc:L783]: every probe opens with
    // `LOWER(allSettings.settingName) = <cfqueryparam LCASE(settingName)>`, so a row stored as
    // `SKUCURRENCY` answered a request for `skuCurrency`.
    const executor = makeExecutor(CURRENCY_ROWS, [generalSettingRow('SKUCURRENCY', 'JPY')]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuCurrency')).toBe('JPY');
  });

  it('★★ ignores a row that carries any relationship column, because such a row is not global', async () => {
    // CFML parity [model/service/SettingService.cfc:L768-L870]: the probe emits
    // `AND <col> IS NULL` for every non-participating column, so a row scoped to a product, a
    // brand or an account is INVISIBLE to a relationship-free lookup.
    const executor = makeExecutor(CURRENCY_ROWS, [
      { ...generalSettingRow('skuCurrency', 'CHF'), productID: 'product-1' },
    ]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuCurrency')).toBe('USD');
  });

  it('yields an EMPTY eligible list when no currency row is active, which is the gate the cascade honours', async () => {
    const executor = makeExecutor(INACTIVE_CURRENCY_ROWS);

    const root = await bootWith(executor);

    // CFML parity [model/entity/Sku.cfc:L373]: the whole currency-details body is wrapped in
    // `if(len(setting('skuEligibleCurrencies')))`. An empty list is therefore load-bearing - it
    // closes the gate and every `getPriceByCurrencyCode` call then answers undefined.
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

    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component's own
    // `displayname` attribute reads "USA epay" while `getDisplayName()` returns "Google"
    // [integrationServices/google/Integration.cfc:L59-L61].
    // Preserved deliberately; do not fix without a product decision.
    expect(root.integration.getDisplayName()).toBe('Google');

    // The interface's documented type vocabulary carries no product-feed type, and the legacy
    // adapter registers as `fw1` [integrationServices/google/Integration.cfc:L55-L57].
    expect(root.integration.getIntegrationTypes()).toBe('fw1');
  });

  it('refuses a recognized but unimplemented dialect BEFORE issuing any statement', async () => {
    const executor = makeExecutor();

    const error = await rejectionOf(() => bootWith(executor, ORACLE_ENVIRONMENT));

    expect(error.name).toBe('UnsupportedDialectError');
    expect(error.message).toContain('Oracle10g');
    // The refusal names the decision site, which is what makes the message actionable:
    // `DIALECT_DECISION_SITE` `src/handlers/bootstrap.ts`.
    expect(error.message).toContain('bootstrap.ts composition root');

    // ORDERING, and the reason this case is not redundant with dialect.ts's own suite: the gate
    // runs at step 2 of `createModuleScopeGraph`.
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

    // Configuration validation is step 1, so an unrecognized spelling never reaches
    // `resolveDialect` at all - it is refused by the environment contract, with the aggregate
    // diagnostic that file produces.
    expect(error.name).toBe('ConfigurationError');
    expect(executor.calls).toHaveLength(0);
  });

  it('refuses a required environment variable that is absent, and names it', async () => {
    const executor = makeExecutor();
    // Rebuilt member by member rather than by rest-destructuring BASE_ENVIRONMENT, so that no
    // binding is declared only to be discarded.
    const incomplete: EnvironmentSource = Object.freeze({
      DB_HOST: BASE_ENVIRONMENT.DB_HOST,
      DB_USER: BASE_ENVIRONMENT.DB_USER,
      DB_TLS_MODE: BASE_ENVIRONMENT.DB_TLS_MODE,
      DB_DIALECT: BASE_ENVIRONMENT.DB_DIALECT,
    });

    const error = await rejectionOf(() => bootWith(executor, incomplete));

    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toContain('DB_PASSWORD');
    // The credential itself must never appear in a diagnostic. BASE_ENVIRONMENT uses a placeholder
    // rather than a credential-shaped literal, and the message is checked for its absence
    // regardless.
    expect(error.message).not.toContain(UNUSED_PLACEHOLDER);
    expect(executor.calls).toHaveLength(0);
  });

  it('refuses a currency row that is missing the currencyCode column, as a schema violation', async () => {
    const executor = makeExecutor([Object.freeze({ activeFlag: 1 })]);

    const error = await rejectionOf(() => bootWith(executor));

    // The `Sw*` schema is unchanged by this migration, so a column the statement selected but the
    // driver did not return is a driver or statement problem, not a data condition - which is
    // exactly what the message says.
    expect(error.name).toBe('CompositionColumnError');
    expect(error.message).toContain('bootstrapSelectCurrencyRecords');
    expect(error.message).toContain('currencyCode');
    expect(error.message).toContain('absent');

    // The read was issued: this refusal happens after step 4 begins, unlike the two configuration
    // refusals above.
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
    // `src/handlers/bootstrap.ts`, and for a plain object that is the bare `typeof` result.
    expect(error.message).toContain('a object');
  });

  it('accepts the three flag encodings a MySQL driver can return for activeFlag', async () => {
    // `readFlag` accepts string, number, boolean and Uint8Array, because `SwCurrency.activeFlag`
    // is a bit-ish column and which of those arrives depends on driver options rather than on the
    // schema.
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

// The memo - warm-container idempotence, and the two ways out of it.
//
// The memo is consulted only when no overrides are supplied `src/handlers/bootstrap.ts`.

describe('bootstrapCompositionRoot memoization', () => {
  /**
   * Blank a required variable that has no default, so a no-override boot is guaranteed to refuse
   * at step 1 on any host, database present or not.
   */
  function forceInvalidProcessEnvironment(): void {
    vi.stubEnv('DB_HOST', '');
    appConfig.reset();
  }

  it('hands two synchronous no-override callers the SAME in-flight promise', async () => {
    forceInvalidProcessEnvironment();

    // No `await` between them, which is the concurrent-cold-start case: the first call assigns the
    // memo, the second finds it already assigned.
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

    // A warm container must not inherit a permanently rejected promise. A DIFFERENT promise object
    // is the proof that the `.catch` arm cleared the memo rather than leaving the rejected one in
    // place.
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

    // Every promise handed out is still settled, so none of them becomes an unhandled rejection -
    // and the reset did not cancel the in-flight one.
    await expect(first).rejects.toThrow(/DB_HOST/);
    await expect(afterReset).rejects.toThrow(/DB_HOST/);
  });

  it('bypasses the memo entirely when ANY overrides are supplied', async () => {
    const executor = makeExecutor();

    const first = bootstrapCompositionRoot({ executor, environment: BASE_ENVIRONMENT });
    const second = bootstrapCompositionRoot({ executor, environment: BASE_ENVIRONMENT });

    // Distinct promises, and therefore distinct graphs: an override caller must never be served a
    // root that another caller composed.
    expect(second).not.toBe(first);

    const [firstRoot, secondRoot] = await Promise.all([first, second]);
    expect(secondRoot).not.toBe(firstRoot);
    expect(secondRoot.settingsProvider).not.toBe(firstRoot.settingsProvider);

    // Two independent graphs each performed their own eager read. One read would mean the memo had
    // leaked into the override path.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(2);
  });

  it('leaves the memo untouched after an override boot, so a no-override caller still initializes itself', async () => {
    const executor = makeExecutor();

    const overridden = await bootWith(executor);
    expect(overridden.dialect).toBe('MySQL');

    forceInvalidProcessEnvironment();

    // If the override boot had populated the memo, this would resolve to `overridden`. It must
    // refuse instead.
    await expect(bootstrapCompositionRoot()).rejects.toThrow(/DB_HOST/);

    // And the override boot's own executor saw exactly its own one read - the refused no-override
    // attempt issued nothing at all.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
  });

  it('creates no pool and opens no socket on the override path, which is what makes this a unit suite', async () => {
    const executor = makeExecutor();

    await bootWith(executor);
    expect(executor.calls).toHaveLength(2);
    expect(executor.calls.map((recorded: RecordedStatement): string => recorded.sql)).toEqual([
      CURRENCY_RECORDS_SQL,
      GENERAL_SETTINGS_SQL,
    ]);
  });

  it('is safe to reset when nothing was ever memoized', () => {
    // `resetCompositionRoot` is called from this suite's own hooks and from every handler test; it
    // must be a no-op rather than a fault when the memo is already empty.
    expect(() => {
      resetCompositionRoot();
      resetCompositionRoot();
    }).not.toThrow();
  });
});

// Request scopes - what is fresh per request, and what is refused at the door.

describe('createRequestScope', () => {
  const PINNED_INSTANT = new Date('2024-03-01T12:00:00.000Z');
  const FEED_HOST = 'shop.example.com';
  // Declared here rather than reused from the order fixtures, whose golden account identifier is
  // module-local to that file and carries a per-call prefix. This suite needs a value it controls,
  // not one it inherits.
  const ACCOUNT_ID = 'account-bootstrap-scope-1';

  it('★★ publishes exactly the EIGHTEEN documented members, and NOT ONE RAW REPOSITORY', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();

    // Asserted as a set for the same reason the module-scope surface is: a member quietly added or
    // dropped must fail here.
    expect(Object.keys(scope).sort()).toEqual([
      'brandService',
      'currencyConverter',
      'currentAccountContext',
      'entityLoaders',
      'feedCriteria',
      'getSalePriceDetailsForProductSkus',
      'materializeOrderView',
      'now',
      'optionService',
      'prepareAddressZoneEvaluation',
      'priceGroupEntitlements',
      'priceGroupService',
      'productFeedPort',
      'productService',
      'promotionService',
      'roundingRuleService',
      'skuService',
      'updateOrderAmountsWithPriceGroupsThenPromotions',
    ]);
  });

  it('★★★ publishes exactly SEVEN READ-ONLY LOADS on `entityLoaders`, and NO mutation', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();

    expect(Object.keys(scope.entityLoaders).sort()).toEqual([
      'getBrandByBrandID',
      'getOptionsByOptionIDList',
      'getPriceGroup',
      'getPriceGroupRate',
      'getProductByProductID',
      'getProductTypeByProductTypeID',
      'getSkuBySkuIdentity',
    ]);

    // Named individually as well as counted, because a set assertion alone would pass for a
    // surface that had renamed a mutation into one of these slots.
    for (const forbidden of [
      'saveProduct',
      'deleteProduct',
      'saveSku',
      'saveProductType',
      'savePriceGroup',
      'savePriceGroupRate',
      'deletePriceGroup',
      'loadDataFromFile',
      // The two the brand and option additions would be paired with if either had brought a write.
      'saveBrand',
      'deleteBrand',
      'saveOption',
    ]) {
      expect(scope.entityLoaders).not.toHaveProperty(forbidden);
    }

    // And frozen, like every other object this root publishes: substituting a load on a scope
    // another consumer holds is what freezing refuses.
    expect(Object.isFrozen(scope.entityLoaders)).toBe(true);
  });

  it('hands back `undefined` for an identifier that names nothing, rather than throwing', async () => {
    // A miss is a DOMAIN OUTCOME a caller reports, not an exception - the same posture
    // `Sku.getPriceByCurrencyCode` takes [model/entity/Sku.cfc:L269-L273].
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();

    await expect(
      scope.entityLoaders.getProductByProductID('no-such-product'),
    ).resolves.toBeUndefined();
    await expect(scope.entityLoaders.getPriceGroup('no-such-price-group')).resolves.toBeUndefined();
    await expect(scope.entityLoaders.getPriceGroupRate('no-such-rate')).resolves.toBeUndefined();
    await expect(
      scope.entityLoaders.getSkuBySkuIdentity({
        productID: 'no-such-product',
        skuID: 'no-such-sku',
      }),
    ).resolves.toBeUndefined();
    await expect(scope.entityLoaders.getBrandByBrandID('no-such-brand')).resolves.toBeUndefined();
    // The option load answers a MAP rather than an entity, so its miss is an ABSENT KEY rather
    // than an `undefined` return - the caller walks its own list and reports one outcome for the
    // request.
    await expect(scope.entityLoaders.getOptionsByOptionIDList(['no-such-option'])).resolves.toEqual(
      new Map(),
    );
  });

  it('★★★ hydrates a brand from the ONE read in this file with no repository behind it', async () => {
    const executor = makeExecutor().seedMatching('FROM SwBrand', [
      {
        brandID: 'brand-0001',
        activeFlag: 1,
        publishedFlag: 0,
        urlTitle: 'test-brand',
        brandName: 'Test Brand',
        brandWebsite: null,
        remoteID: null,
        createdDateTime: null,
        createdByAccountID: null,
        modifiedDateTime: null,
        modifiedByAccountID: null,
      },
    ]);
    const root = await bootWith(executor);

    const scope = await root.createRequestScope();
    const brand = await scope.entityLoaders.getBrandByBrandID('brand-0001');

    expect(brand?.getBrandID()).toBe('brand-0001');
    expect(brand?.getBrandName()).toBe('Test Brand');
    expect(brand?.getUrlTitle()).toBe('test-brand');
    // The two `bit` columns arrive as CFML's `1`/`0`, which is what the entity's own boolean input
    // union accepts, and both renderings are read rather than only the truthy one.
    expect(brand?.getActiveFlag()).toBe(true);
    expect(brand?.getPublishedFlag()).toBe(false);
    // A SAVED ROW, not A NEW one. Every mutation this load serves names an EXISTING row, so a
    // hydrated brand must answer `false` to `isNew()` - the property the routed transport policy
    // rests on.
    expect(brand?.isNew()).toBe(false);
    // And the identifier is bound, not interpolated, which is what preserves `cfqueryparam`
    // semantics.
    const brandRead = executor.calls.find((call) => call.sql.includes('FROM SwBrand'));
    expect(brandRead?.params).toEqual(['brand-0001']);
    expect(brandRead?.sql).toContain('WHERE brandID = ?');
    expect(executor.mutationCalls).toEqual([]);
  });

  it('★★ forwards the option-list load verbatim, and issues NO statement for an empty request', async () => {
    // The sibling addition, and it is a FORWARD rather than an implementation: the module-private
    // option loader `SkuService`'s option resolution already used owns the de-duplication, the
    // case folding.
    const executor = makeExecutor().seedMatching('FROM SwOption swOption', [
      {
        optionID: 'option-A',
        optionCode: 'red',
        optionName: 'Red',
        optionDescription: null,
        sortOrder: 1,
        optionGroupID: 'group-colour',
        defaultImageID: null,
        remoteID: null,
        createdDateTime: null,
        createdByAccountID: null,
        modifiedDateTime: null,
        modifiedByAccountID: null,
        optionGroup_optionGroupID: 'group-colour',
        optionGroup_optionGroupName: 'Colour',
        optionGroup_optionGroupCode: 'colour',
        optionGroup_optionGroupImage: null,
        optionGroup_optionGroupDescription: null,
        optionGroup_imageGroupFlag: 0,
        optionGroup_sortOrder: 1,
        optionGroup_remoteID: null,
        optionGroup_createdDateTime: null,
        optionGroup_createdByAccountID: null,
        optionGroup_modifiedDateTime: null,
        optionGroup_modifiedByAccountID: null,
      },
    ]);
    const root = await bootWith(executor);

    const scope = await root.createRequestScope();

    const before = executor.calls.length;
    await expect(scope.entityLoaders.getOptionsByOptionIDList([])).resolves.toEqual(new Map());
    expect(executor.calls).toHaveLength(before);

    // A populated request does issue one, and it binds one placeholder per element rather than
    // interpolating a list into the text.
    const loaded = await scope.entityLoaders.getOptionsByOptionIDList(['option-A', 'option-B']);
    const optionRead = executor.calls
      .slice(before)
      .find((call) => call.sql.includes('FROM SwOption swOption'));

    expect(optionRead?.params).toEqual(['option-A', 'option-B']);
    expect(optionRead?.sql).toContain('IN (?, ?)');
    // The map is keyed by the folded identifier, which is what lets a caller that named `option-A`
    // find the row the database matched under any casing.
    expect([...loaded.keys()]).toEqual(['option-a']);
    expect(loaded.get('option-a')?.getOptionID()).toBe('option-A');
    expect(loaded.has('option-b')).toBe(false);
    expect(executor.mutationCalls).toEqual([]);
  });

  it('★★★ resolves a SKU whose identifier is cased differently, as CFML identifiers are', async () => {
    // This is the loader four handler operations reach for a SKU, so the case drives it directly.
    const root = await bootWith(makeExecutor());
    const scope = await openScopeWithAdapters(root);
    const adapters = adaptersOf(scope);

    const product = makeProductFixture({ idPrefix: 'folded-', productID: 'prod-Folded-0001' });
    const sku = makeSkuFixture({ idPrefix: 'folded-', skuID: 'sku-Folded-0001', product });

    // The product read is answered as the DATABASE would answer it - folding the key - because
    // `SwProduct.productID` is compared by MySQL under its own collation, not in this process.
    vi.spyOn(adapters.productRepository, 'getProductByProductID').mockImplementation(
      (productID: string): Promise<Product | undefined> =>
        Promise.resolve(
          productID.toLowerCase() === product.getProductID().toLowerCase() ? product : undefined,
        ),
    );
    vi.spyOn(adapters.skuRepository, 'getProductSkus').mockResolvedValue([sku]);

    for (const spelling of [
      'sku-Folded-0001',
      'SKU-FOLDED-0001',
      'sku-folded-0001',
      'sKu-FoLdEd-0001',
    ]) {
      const loaded = await scope.entityLoaders.getSkuBySkuIdentity({
        productID: 'PROD-FOLDED-0001',
        skuID: spelling,
      });

      expect(loaded?.sku).toBe(sku);
      expect(loaded?.product).toBe(product);
    }

    // And a genuinely different identifier is still a miss, so the folding widened the comparison
    // rather than defeating it.
    await expect(
      scope.entityLoaders.getSkuBySkuIdentity({
        productID: 'prod-Folded-0001',
        skuID: 'sku-folded-0002',
      }),
    ).resolves.toBeUndefined();
  });

  it('★★★ EXPOSES NO ROUTE FROM A SCOPE TO A REPOSITORY, UNDER ANY NAME', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();
    const adapterClasses = [
      MysqlProductRepository,
      MysqlSkuRepository,
      MysqlOptionRepository,
      MysqlProductTypeRepository,
      MysqlPromotionRepository,
      MySqlPriceGroupRepository,
    ];

    const reachable = Object.entries(scope).filter(([, value]) =>
      adapterClasses.some((adapterClass) => value instanceof adapterClass),
    );

    expect(reachable).toStrictEqual([]);

    // And the HOOK still REACHES THEM, so this case is asserting a narrowed surface rather than a
    // broken assembly. A scope with no adapters at all would satisfy the assertion above.
    const inspectable = await root.createInspectableRequestScope();

    expect(inspectable.adapters.priceGroupRepository).toBeInstanceOf(MySqlPriceGroupRepository);
    expect(inspectable.adapters.productRepository).toBeInstanceOf(MysqlProductRepository);
  });

  it('hands every request its OWN service and repository instances', async () => {
    const root = await bootWith(makeExecutor());

    // Opened through the inspection hook because the repository half of this case's claim can no
    // longer be read off a scope.
    const first = await openScopeWithAdapters(root);
    const second = await openScopeWithAdapters(root);

    expect(second).not.toBe(first);
    expect(second.roundingRuleService).not.toBe(first.roundingRuleService);
    expect(second.priceGroupService).not.toBe(first.priceGroupService);
    expect(second.promotionService).not.toBe(first.promotionService);
    expect(second.productService).not.toBe(first.productService);
    expect(second.skuService).not.toBe(first.skuService);
    expect(second.brandService).not.toBe(first.brandService);
    expect(second.optionService).not.toBe(first.optionService);
    expect(adaptersOf(second).priceGroupRepository).not.toBe(
      adaptersOf(first).priceGroupRepository,
    );
    expect(adaptersOf(second).skuRepository).not.toBe(adaptersOf(first).skuRepository);
    expect(adaptersOf(second).promotionRepository).not.toBe(adaptersOf(first).promotionRepository);
    expect(second.currencyConverter).not.toBe(first.currencyConverter);
  });

  it('★★ opening a scope issues NO statement of its own, however many scopes are opened', async () => {
    // The zone index must exist before a synchronous evaluator CONSULTS it, not before that
    // evaluator is CONSTRUCTED. Deferring the read restores pure scope assembly while keeping the
    // index per request.
    const executor = makeExecutor();
    const root = await bootWith(executor);

    await root.createRequestScope();
    await root.createRequestScope();
    await root.createRequestScope();

    // Three scopes, ZERO zone reads, and the two tier-one reads still exactly once each.
    expect(executor.calls).toHaveLength(2);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    expect(executor.countOf(GENERAL_SETTINGS_SQL)).toBe(1);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);

    // And nothing else crept in. Asserted as a SET so a per-scope read added later fails here
    // rather than passing quietly.
    expect(new Set(executor.calls.map((call: RecordedStatement): string => call.sql))).toEqual(
      new Set([CURRENCY_RECORDS_SQL, GENERAL_SETTINGS_SQL]),
    );
  });

  it('★★ issues the zone read ONLY when a request asks for zone evaluation', async () => {
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, []);
    const root = await bootWith(executor);

    const silent = await root.createRequestScope();
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);

    const asking = await root.createRequestScope();
    await asking.prepareAddressZoneEvaluation();

    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(1);
    expect(silent).not.toBe(asking);
  });

  it('★★ is SINGLE-FLIGHT: repeated and concurrent preparation issues one read', async () => {
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, []);
    const scope = await bootWith(executor).then((root) => root.createRequestScope());

    await Promise.all([scope.prepareAddressZoneEvaluation(), scope.prepareAddressZoneEvaluation()]);
    await scope.prepareAddressZoneEvaluation();

    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(1);
  });

  it('adopts an injected instant rather than minting one', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope({ now: PINNED_INSTANT });

    // Value, and deliberately not identity.
    expect(scope.now.getTime()).toBe(PINNED_INSTANT.getTime());
    expect(scope.now).toStrictEqual(PINNED_INSTANT);
    expect(scope.now).not.toBe(PINNED_INSTANT);
  });

  it('mints its own instant when none is injected, and a distinct one per scope', async () => {
    const root = await bootWith(makeExecutor());
    const before = Date.now();

    const scope = await root.createRequestScope();
    const scopeFromEmptyInput = await root.createRequestScope({});

    const after = Date.now();

    expect(scope.now).toBeInstanceOf(Date);
    expect(scope.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(scope.now.getTime()).toBeLessThanOrEqual(after);
    expect(scope.now).not.toBe(PINNED_INSTANT);

    // An empty input object and no input at all take the same arm
    // [src/handlers/bootstrap.ts collapses `undefined` to `{}`], and each mints its
    // own Date rather than sharing one.
    expect(scopeFromEmptyInput.now).not.toBe(scope.now);
  });

  it('reflects an absent accountID as an EMPTY current-account context', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();

    // `exactOptionalPropertyTypes` is on, so "absent" means the key is not present at all rather
    // than present-and-undefined. Both are asserted, because only the second distinguishes the
    // two.
    expect(scope.currentAccountContext).toEqual({});
    expect('accountID' in scope.currentAccountContext).toBe(false);
    expect(scope.currentAccountContext.accountID).toBeUndefined();
  });

  it('reflects a supplied accountID as a populated current-account context', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope({ accountID: ACCOUNT_ID });

    expect(scope.currentAccountContext.accountID).toBe(ACCOUNT_ID);
    expect('accountID' in scope.currentAccountContext).toBe(true);

    // The ambient `getSlatwallScope()` this replaces
    // [model/service/PriceGroupService.cfc:L262-L268] was reached from inside the service; here it
    // is a parameter the scope carries.
  });

  it('omits productFeedPort entirely unless a feed host is requested', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope({ accountID: ACCOUNT_ID, now: PINNED_INSTANT });

    // Undefined rather than a port that refuses on use: the feed capability is simply not present
    // on a scope that did not ask for it.
    expect(scope.productFeedPort).toBeUndefined();
  });

  it('publishes productFeedPort for a host on the allow-list, folding case and trimming', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const scope = await root.createRequestScope({
      now: PINNED_INSTANT,
      feedHost: '  Shop.Example.COM  ',
    });

    // `toTrustedFeedHost` normalizes with `trim().toLowerCase()` before it compares, so a host
    // that differs from the allow-list entry only by surrounding whitespace and letter case is
    // admitted.
    const feedPort = requirePresent(scope.productFeedPort, 'the product feed port');
    expect(typeof feedPort.generateProductFeed).toBe('function');
  });

  it('refuses a feed host that is not on the allow-list, and says so', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const error = await rejectionOf(() =>
      root.createRequestScope({ feedHost: 'attacker.example.net' }),
    );

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('authorized-host list');
  });

  it('refuses a feed host that is empty or only whitespace', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const error = await rejectionOf(() => root.createRequestScope({ feedHost: '   ' }));

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('empty');
  });

  it('refuses a URL where a host belongs, by membership rather than by grammar', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    // The candidate is still refused, and refused for a reason that cannot be bypassed: an
    // allow-list holds bare authorities, so a URL cannot equal an entry in it.
    const error = await rejectionOf(() =>
      root.createRequestScope({ feedHost: `https://${FEED_HOST}/feed/product` }),
    );

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('authorized-host list');
    expect(error.message).not.toContain('bare host authority');
  });

  it('describes a refused candidate WITHOUT reproducing it', async () => {
    // The refusal must not echo the rejected candidate. A message of the shape
    // `The feed host ${JSON.stringify(candidate)}...` would republish whatever credential or token
    // the candidate carried, which is what this case rules out.
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);
    const secretBearingCandidate = 'admin:sup3rs3cret@feed.example.invalid?token=abc123';

    const error = await rejectionOf(() =>
      root.createRequestScope({ feedHost: secretBearingCandidate }),
    );

    expect(error.name).toBe('UntrustedFeedHostError');

    // Not the value, and not any part of it that could carry the secret.
    expect(error.message).not.toContain(secretBearingCandidate);
    expect(error.message).not.toContain('sup3rs3cret');
    expect(error.message).not.toContain('abc123');

    // What it says instead: the reason, plus a summary built only from DERIVED facts - a length
    // and trait names that are constants in the source rather than substrings of the input.
    expect(error.message).toContain('authorized-host list');
    expect(error.message).toContain('The value itself is not reproduced');
    expect(error.message).toContain(String(secretBearingCandidate.length));
    expect(error.message).toContain('credentials');
    expect(error.message).toContain('a query');

    // And the two halves are separately reachable, for a caller that logs the diagnosis, or
    // branches on the ground of the refusal, without parsing a sentence.
    const raised = error as unknown as {
      readonly candidateSummary?: unknown;
      readonly reason?: unknown;
    };

    expect(typeof raised.candidateSummary).toBe('string');
    expect(String(raised.candidateSummary)).not.toContain('sup3rs3cret');
    expect(String(raised.candidateSummary)).toContain('credentials');
    expect(raised.reason).toBe('it is not on this deployment\u2019s authorized-host list');
  });

  it('refuses BEFORE it builds anything, so no feed port holds an unlisted origin', async () => {
    // Moved here with the refusal, from the case that asserted the withdrawn constructor guard
    // "refuses before constructing, so no instance holds a bad origin and no read is issued".
    const executor = makeExecutor();
    const root = await bootWith(executor, FEED_ENVIRONMENT);
    const statementsBefore = executor.calls.length;

    await expect(root.createRequestScope({ feedHost: 'attacker.example.net' })).rejects.toThrow(
      UntrustedFeedHostError,
    );

    // What the case is for survives intact and is asserted directly rather than inferred from a
    // total: no FEED statement was issued.
    expect(executor.calls).toHaveLength(statementsBefore);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);
    expect(
      executor.calls.filter((call: RecordedStatement): boolean => call.sql.includes('SwSku')),
    ).toStrictEqual([]);
  });

  it('★★★ settles the feed host before graph publication and never starts a zone read', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor, FEED_ENVIRONMENT);
    const statementsBefore = executor.calls.length;

    await expect(root.createRequestScope({ feedHost: 'attacker.example.net' })).rejects.toThrow(
      UntrustedFeedHostError,
    );

    expect(executor.calls).toHaveLength(statementsBefore);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);

    const admitted = makeExecutor();
    const admittingRoot = await bootWith(admitted, FEED_ENVIRONMENT);
    const admittedBefore = admitted.calls.length;

    const scope = await admittingRoot.createRequestScope({ feedHost: FEED_HOST });

    expect(scope.productFeedPort).toBeDefined();
    expect(admitted.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);
    expect(admitted.calls.length).toBe(admittedBefore);
  });

  it('refuses a feed host against an EXPLICITLY empty allow-list, rather than admitting everything', async () => {
    const explicitlyEmpty = await bootWith(
      makeExecutor(),
      Object.freeze({ ...BASE_ENVIRONMENT, FEED_ALLOWED_HOSTS: '' }),
    );

    const explicitError = await rejectionOf(() =>
      explicitlyEmpty.createRequestScope({ feedHost: FEED_HOST }),
    );

    expect(explicitError.name).toBe('UntrustedFeedHostError');
    expect(explicitError.message).toContain('authorizes no feed host at all');

    // And the UNSET spelling, which is the default deployment, refuses identically.
    const unset = await bootWith(makeExecutor());

    const unsetError = await rejectionOf(() => unset.createRequestScope({ feedHost: FEED_HOST }));

    expect(unsetError.name).toBe('UntrustedFeedHostError');
    expect(unsetError.message).toContain('authorizes no feed host at all');
  });

  it('★★★ publishes NO feed when no allow-list is configured, rather than serving the request authority', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);

    const error = await rejectionOf(() => root.createRequestScope({ feedHost: FEED_HOST }));

    expect(error.name).toBe('UntrustedFeedHostError');

    // The REFUSAL is ACTIONABLE, which is what answers the objection the previous version raised:
    // an operator is told the variable to set rather than left with a capability that silently
    // does nothing.
    expect(error.message).toContain('FEED_ALLOWED_HOSTS');
    expect(error.message).not.toContain(FEED_HOST);
  });

  it('normalizes the admitted authority against the configured list, and still refuses a blank one', async () => {
    // Normalization is not membership, and both happen.
    const root = await bootWith(
      makeExecutor(),
      Object.freeze({ ...BASE_ENVIRONMENT, FEED_ALLOWED_HOSTS: FEED_HOST }),
    );

    const scope = await root.createRequestScope({ feedHost: `  ${FEED_HOST.toUpperCase()}  ` });

    expect(scope.feedCriteria?.feedHost).toBe(FEED_HOST);

    const error = await rejectionOf(() => root.createRequestScope({ feedHost: '   ' }));

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('empty or contains only whitespace');
  });

  it('★★★ admits a DEFAULT port form of an authorized host, and publishes the ENTRY not the request', async () => {
    // FINDING F-10. Runtime acceptance testing drove `Host: shop.example.com:443` against a
    // deployment that authorized `shop.example.com` and measured a 400. It filed the result as an
    // operational note - "exact-match/fail-closed is the documented posture and an operator can list
    // the port form" - and both halves of that are true. It is still the wrong answer, because
    // `shop.example.com:443` and `shop.example.com` name ONE authority under RFC 3986 section 3.2.3,
    // and a hardening control that refuses an authority the deployment DID authorize over an
    // insignificant spelling difference teaches an operator to widen the list. A list widened to
    // silence a false refusal is worse security than the false refusal was.
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    for (const candidate of [`${FEED_HOST}:443`, `${FEED_HOST}:80`, `  ${FEED_HOST}:443  `]) {
      const scope = await root.createRequestScope({ now: PINNED_INSTANT, feedHost: candidate });

      expect(scope.productFeedPort, candidate).toBeDefined();
      // AND THE PUBLISHED AUTHORITY IS THE DEPLOYMENT'S OWN SPELLING. The host reaches the five URL
      // sites of a merchant feed, so it must be an entry the operator wrote - never the caller's
      // spelling, and never a form the fold invented. The fold decides MEMBERSHIP only.
      expect(scope.feedCriteria?.feedHost, candidate).toBe(FEED_HOST);
    }
  });

  it('★★★ admits the BARE form when the deployment listed the port form, and publishes THAT entry', async () => {
    // The fold is symmetric, so the remedy the finding named - "an operator can list the port form" -
    // keeps working and now also admits the bare spelling. The answer is still the entry, which here
    // CARRIES the port: a deployment that authorized `:443` gets `:443` written into its feed.
    const root = await bootWith(
      makeExecutor(),
      Object.freeze({ ...BASE_ENVIRONMENT, FEED_ALLOWED_HOSTS: `${FEED_HOST}:443` }),
    );

    for (const candidate of [FEED_HOST, `${FEED_HOST}:443`, FEED_HOST.toUpperCase()]) {
      const scope = await root.createRequestScope({ now: PINNED_INSTANT, feedHost: candidate });

      expect(scope.feedCriteria?.feedHost, candidate).toBe(`${FEED_HOST}:443`);
    }
  });

  it('★★★ keeps every NON-default port significant, and every other host refused', async () => {
    // THE FOLD MUST NOT BE A LOOSENING, AND THIS IS WHERE THAT IS PROVED RATHER THAN ASSERTED.
    // Only `:80` and `:443` are folded, and the fold removes ONLY a default-port suffix - so the host
    // half must still be equal for a candidate to be admitted. Every hostile candidate the acceptance
    // run refused is re-driven here WITH a default port attached, because attaching one is the cheapest
    // thing an attacker can do to a rejected value.
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    for (const candidate of [
      // A port the deployment never authorized. This is the whole of what the fold does not admit.
      `${FEED_HOST}:8443`,
      `${FEED_HOST}:8080`,
      `${FEED_HOST}:0`,
      // A different host, with and without a default port.
      'evil.example.com',
      'evil.example.com:443',
      // The suffix attack, which a naive `endsWith` would admit.
      `${FEED_HOST}.evil.com`,
      `${FEED_HOST}.evil.com:443`,
      // A prefix of an authorized host is not that host.
      'shop.example.co:443',
      // Loopback, which no deployment authorized here.
      '127.0.0.1:443',
      // A newline-injected candidate: `parseHostAuthority` cannot parse it, so it folds to itself and
      // stays reachable by exact match alone - which it never is.
      `${FEED_HOST}\n${FEED_HOST}:443`,
      `${FEED_HOST}:443\r\nX-Injected: 1`,
      // A URL is not a bare authority, whatever port it names.
      `https://${FEED_HOST}:443/feed/product`,
      // Two ports are not one port.
      `${FEED_HOST}:443:443`,
    ]) {
      const error = await rejectionOf(() => root.createRequestScope({ feedHost: candidate }));

      expect(error.name, candidate).toBe('UntrustedFeedHostError');
      expect(error.message, candidate).toContain('authorized-host list');
    }
  });

  it('★★★ folds nothing into an EMPTY allow-list, so the default deployment still serves no feed', async () => {
    // The fold runs BEFORE membership and changes only what two spellings are compared as. An empty
    // list has nothing to compare against, so a default-port candidate is refused for the same reason
    // and with the same actionable message as any other - the fail-closed default is untouched by
    // the fold.
    const root = await bootWith(makeExecutor());

    for (const candidate of [FEED_HOST, `${FEED_HOST}:443`, `${FEED_HOST}:80`]) {
      const error = await rejectionOf(() => root.createRequestScope({ feedHost: candidate }));

      expect(error.name, candidate).toBe('UntrustedFeedHostError');
      expect(error.message, candidate).toContain('authorizes no feed host at all');
      expect(error.message, candidate).toContain('FEED_ALLOWED_HOSTS');
    }
  });

  it('★★★ authorizes a NON-default port when the deployment lists it, and only then', async () => {
    // The other side of the significance claim: `:8443` is refused above against a portless list and
    // admitted here against a list that names it, byte for byte. Nothing was folded either way.
    const root = await bootWith(
      makeExecutor(),
      Object.freeze({ ...BASE_ENVIRONMENT, FEED_ALLOWED_HOSTS: `${FEED_HOST}:8443` }),
    );

    const scope = await root.createRequestScope({
      now: PINNED_INSTANT,
      feedHost: `${FEED_HOST}:8443`,
    });

    expect(scope.feedCriteria?.feedHost).toBe(`${FEED_HOST}:8443`);

    // And the bare form is NOT admitted by it, because `:8443` is part of the authority.
    const error = await rejectionOf(() => root.createRequestScope({ feedHost: FEED_HOST }));

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('authorized-host list');
  });

  it('resolves both construction cycles before returning, so no wiring fault is reachable', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope({ now: PINNED_INSTANT });

    // The rounding-rule binding and the three-method price-group delegate are both `undefined`
    // while the graph is being built and are assigned before the scope is returned.
    //
    // 12.3456 with the expression `.99`, Closest, is one of the nine cases AAP 0.6.4 measured
    // against the legacy algorithm: the two-decimal mask makes it 12.35.
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

    const scope = await root.createRequestScope();
    const activeCurrencies = await scope.currencyConverter.getAllActiveCurrencyIDList();
    expect(activeCurrencies.map(String)).toEqual(['USD', 'GBP']);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);

    // CFML parity [model/service/SettingService.cfc:L222]: the setting's default is
    // `getCurrencyService().getAllActiveCurrencyIDList()`, and the legacy returns a
    // comma-delimited list string rather than an array.
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe(
      activeCurrencies.map(String).join(','),
    );
  });
});

// 3b. The address-zone evaluator resolves a zone it was given only the ID of.
//
// The route through the published surface is `getQualifierQualificationDetails`, which is
// synchronous and takes both of its arguments directly.
//
// Why the qualifier must also name a shipping method: legacy-defect.

describe('the wired address-zone evaluator resolves locations by identifier', () => {
  const ZONE_ID = 'address-zone-west';

  /**
   * One `SwAddressZoneLocation` join row, as the executor would answer it.
   */
  function zoneLocationRow(zoneID: string, columns: Readonly<Record<string, unknown>>): SqlRow {
    return {
      addressZoneID: zoneID,
      postalCode: null,
      city: null,
      stateCode: null,
      countryCode: null,
      ...columns,
    };
  }

  /**
   * Open a scope whose zone read answers `rows`, and hand back the pieces a case asserts on.
   *
   * The qualifier is built directly rather than through `makePromotionFixtures`, because what
   * these cases need is a MINIMAL qualifier: zones configured.
   */
  async function openZoneScope(
    rows: readonly SqlRow[],
    qualifierZoneID: string = ZONE_ID,
  ): Promise<{
    readonly qualifier: PromotionQualifier;
    readonly order: OrderView;
    readonly fulfillmentID: string;
    readonly address: ShippingAddressView;
    evaluate(): readonly string[];
  }> {
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, rows);
    const scope = await bootWith(executor).then((root) => root.createRequestScope());

    // Direct promotion queries are synchronous, so callers prepare the deferred index explicitly.
    // The composed order-pricing operation performs this step itself.
    await scope.prepareAddressZoneEvaluation();

    // The single SHIPPING fulfillment. The pickup one carries no shipping method and no address,
    // so it is dropped rather than reasoned about.
    const order = makeOrderViewFixture({ includePickupFulfillment: false });
    const fulfillment = requirePresent(order.orderFulfillments[0], 'the shipping fulfillment');
    const shippingMethod = requirePresent(fulfillment.shippingMethod, 'its shipping method');
    const address = requirePresent(fulfillment.address, 'its shipping address');

    const qualifier = new PromotionQualifier({
      promotionQualifierID: 'pq-zone',
      qualifierType: 'fulfillment',
      shippingAddressZoneIDs: [qualifierZoneID],
      shippingMethodIDs: [shippingMethod.shippingMethodID],
    });

    return {
      qualifier,
      order,
      fulfillmentID: fulfillment.orderFulfillmentID,
      address,
      evaluate: (): readonly string[] =>
        scope.promotionService.getQualifierQualificationDetails(qualifier, order)
          .qualifiedFulfillmentIDs,
    };
  }

  it('★★★ ADMITS a fulfillment whose address matches a zone supplied only as an ID', async () => {
    const scope = await openZoneScope([]);
    const configured = await openZoneScope([
      zoneLocationRow(ZONE_ID, {
        stateCode: scope.address.stateCode,
        countryCode: scope.address.countryCode,
      }),
    ]);
    expect(configured.evaluate()).toStrictEqual([configured.fulfillmentID]);
    expect(scope.evaluate()).toStrictEqual([]);
  });

  it('★★★ THROWS rather than answering "not in zone" when preparation was forgotten', async () => {
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, [
      zoneLocationRow(ZONE_ID, { countryCode: 'US' }),
    ]);
    const scope = await bootWith(executor).then((root) => root.createRequestScope());

    const order = makeOrderViewFixture({ includePickupFulfillment: false });
    const fulfillment = requirePresent(order.orderFulfillments[0], 'the shipping fulfillment');
    const shippingMethod = requirePresent(fulfillment.shippingMethod, 'its shipping method');

    const qualifier = new PromotionQualifier({
      promotionQualifierID: 'pq-zone-unprepared',
      qualifierType: 'fulfillment',
      shippingAddressZoneIDs: [ZONE_ID],
      shippingMethodIDs: [shippingMethod.shippingMethodID],
    });

    expect(() => scope.promotionService.getQualifierQualificationDetails(qualifier, order)).toThrow(
      /address-zone test was reached before this request loaded/u,
    );

    let refusalMessage = '';
    try {
      scope.promotionService.getQualifierQualificationDetails(qualifier, order);
    } catch (thrown: unknown) {
      refusalMessage = thrown instanceof Error ? thrown.message : String(thrown);
    }

    expect(refusalMessage).toContain('prepareAddressZoneEvaluation');
    expect(refusalMessage).toContain('updateOrderAmountsWithPriceGroupsThenPromotions');
    expect(refusalMessage).not.toContain(ZONE_ID);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);

    await scope.prepareAddressZoneEvaluation();
    expect(
      scope.promotionService.getQualifierQualificationDetails(qualifier, order)
        .qualifiedFulfillmentIDs,
    ).toStrictEqual([fulfillment.orderFulfillmentID]);
  });

  it('★★ keeps a GENUINELY empty zone restrictive rather than softening it into a match', async () => {
    // The third rule of the port's obligation: resolving by identifier must not turn "this zone
    // has no locations" into "this zone admits everything".
    const other = await openZoneScope([zoneLocationRow('some-other-zone', { stateCode: 'ZZ' })]);

    expect(other.evaluate()).toStrictEqual([]);
  });

  it('★★ folds case on the ZONE IDENTIFIER, on BOTH sides of the lookup', async () => {
    // The identifier travels verbatim from a link row on one side and verbatim from a promotion
    // link table on the other.
    const base = await openZoneScope([]);

    // (a) The STORED row is upper-case; the qualifier names it lower-case.
    const foldedIndexKey = await openZoneScope([
      zoneLocationRow(ZONE_ID.toUpperCase(), { countryCode: base.address.countryCode }),
    ]);

    // (b) The STORED row is lower-case; the qualifier names it upper-case.
    const foldedLookupKey = await openZoneScope(
      [zoneLocationRow(ZONE_ID, { countryCode: base.address.countryCode })],
      ZONE_ID.toUpperCase(),
    );

    expect(foldedIndexKey.evaluate()).toStrictEqual([foldedIndexKey.fulfillmentID]);
    expect(foldedLookupKey.evaluate()).toStrictEqual([foldedLookupKey.fulfillmentID]);
  });

  it('★★ folds case on the four COMPARED FIELDS, because CFML `!=` on strings ignores case', async () => {
    const base = await openZoneScope([]);
    const scope = await openZoneScope([
      zoneLocationRow(ZONE_ID, {
        city: requirePresent(base.address.city, 'the fixture city').toUpperCase(),
        stateCode: requirePresent(base.address.stateCode, 'the fixture state').toLowerCase(),
      }),
    ]);

    expect(scope.evaluate()).toStrictEqual([scope.fulfillmentID]);
  });

  it('★★ REFUSES when any field the location DOES set disagrees, and skips the ones it leaves NULL', async () => {
    // The asymmetric guard at [model/service/AddressService.cfc:L63-L74], observed through the
    // wired evaluator: a NULL location column constrains nothing, a set one that disagrees rejects
    // that location outright.
    const base = await openZoneScope([]);
    const mismatch = await openZoneScope([
      zoneLocationRow(ZONE_ID, {
        countryCode: base.address.countryCode,
        postalCode: 'definitely-not-the-fixture-postal-code',
      }),
    ]);

    expect(mismatch.evaluate()).toStrictEqual([]);
  });

  it('★★ ADMITS on the FIRST matching location when the zone carries several', async () => {
    const base = await openZoneScope([]);
    const scope = await openZoneScope([
      zoneLocationRow(ZONE_ID, { stateCode: 'no-such-state' }),
      zoneLocationRow(ZONE_ID, { countryCode: base.address.countryCode }),
    ]);

    // Grouped in arrival order, and the walk stops at the first location whose set fields all
    // match [model/service/AddressService.cfc:L75-L78]. A single non-matching location must not
    // veto the zone.
    expect(scope.evaluate()).toStrictEqual([scope.fulfillmentID]);
  });

  it('★★ issues the zone read PARAMETERLESS, as one statement joining the link table to SwAddress', async () => {
    const executor = makeExecutor();

    await bootWith(executor)
      .then((root) => root.createRequestScope())
      .then((scope) => scope.prepareAddressZoneEvaluation());

    const recorded = requirePresent(
      executor.calls.find(
        (call: RecordedStatement): boolean => call.sql === ADDRESS_ZONE_LOCATIONS_SQL,
      ),
      'the recorded address-zone read',
    );

    // No PARAMETER, because the zone identifiers are discovered mid-algorithm inside a synchronous
    // predicate; binding a key set would mean guessing it, and guessing low is the failure this
    // read exists to repair.
    expect(recorded.params).toBeUndefined();

    // An INNER JOIN, deliberately: a LEFT JOIN would answer an orphaned link row as a location
    // constraining no field, and a location that constrains nothing matches every address.
    expect(recorded.sql).toContain('INNER JOIN SwAddress location');
    expect(recorded.sql).not.toContain('LEFT JOIN');
    expect(recorded.sql).not.toContain('WHERE');
    expect(recorded.sql).not.toContain('ORDER BY');
  });

  it('★★ materializes the index PER REQUEST, so a warm container cannot serve a stale zone', async () => {
    // Zone membership decides a discount. An administrator who removes a zone location must not
    // keep seeing the promotion apply, which is why this read is tier 2 and the evaluator is no
    // longer a module-scope adapter.
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, []);
    const root = await bootWith(executor);

    const first = await root.createRequestScope();
    const second = await root.createRequestScope();

    await first.prepareAddressZoneEvaluation();
    await second.prepareAddressZoneEvaluation();

    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(2);
  });
});

// The composed pricing operation.
//
// `updateOrderAmountsWithPromotions` chooses its discount base differently depending on whether
// the item is price-group eligible [model/service/PromotionService.cfc:L241-L254]: an ineligible
// item uses `getPrice()`.
//
// JUDGMENT CALL - why spies are legitimate here.

describe('updateOrderAmountsWithPriceGroupsThenPromotions', () => {
  /**
   * A scope over a recording executor, plus the fixtures the cases price against.
   */
  async function openScope(): Promise<{
    readonly scope: RequestScope;
    readonly order: OrderView;
    readonly priceGroup: PriceGroup;
    readonly otherPriceGroup: PriceGroup;
  }> {
    const root = await bootWith(makeExecutor());
    const fixtures = makePriceGroupFixtures();

    return {
      // THROUGH the INSPECTION HOOK, because `armSetLoader` needs the concrete adapter this
      // scope's composed operation closed over and no member of the scope leads to it any more.
      scope: await openScopeWithAdapters(root),
      order: makeOrderViewFixture(),
      priceGroup: fixtures.rootPriceGroup,
      otherPriceGroup: fixtures.siblingPriceGroup,
    };
  }

  /**
   * Substitutes the promotion pass with one that records the view it was handed.
   *
   * The capture is an ARRAY rather than a reassigned `let` on purpose: control-flow analysis
   * cannot see that a callback ran.
   */
  function capturePromotionPassInput(scope: RequestScope): readonly OrderView[] {
    const captured: OrderView[] = [];

    // Not an `async` arrow: there is nothing to await, and an `async` function with no `await` is
    // a lint error here. `Promise.resolve` satisfies the signature honestly instead.
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

    // Recorded rather than inferred: reversing the two lines in the composed operation flips this
    // array and nothing else in the suite would notice.
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
    // Identity, so neither array can have been rebuilt, filtered or reordered on the way out.
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
    // The L241 discriminator reads both of these, so both must be present on the view pass two
    // receives.
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
    // `extendedPrice` is derived and never stored [model/entity/OrderItem.cfc:L200], so a changed
    // price necessarily changes it: 15.00 x.
    expect(projectedItem.extendedPrice.toFixed2()).toBe(
      projectedPrice.times(originalItem.quantity).toFixed2(),
    );
    expect(projectedItem.appliedPriceGroup).toBe(priceGroup);

    // The sku-price pair is the other half of the L241-L254 correction term. If the projection
    // touched it, the correction would double-count.
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
    // Fulfillments are handed across by identity - the projection is an item-level operation and
    // touches nothing else.
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

    // IDENTITY, not a rebuilt equal: an empty intent list is a NORMAL outcome - the L369
    // conditional declining for every item - and the view is handed on untouched so nothing
    // downstream sees a disturbed reference.
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(order);
    expect(result.pricedOrder).toBe(order);
    // And no price group is resolved, because there is no intent to resolve one from - the
    // repository is never reached at all.
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

    // Three intents, two distinct price groups, one keyed read.
    expect(load).toHaveBeenCalledTimes(1);

    // Where the de-duplication happens, stated exactly.
    const requested = requirePresent(load.mock.calls[0], 'the set-loader call')[0];
    expect(requested).toHaveLength(3);
    expect([...new Set(requested)].sort()).toEqual([sharedID, otherID].sort());

    // And the shared group is the same object on both items it was applied to.
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

    // CFML parity: the legacy L366 loop calls `setPrice` repeatedly on one object, so the last
    // write is what persists. The map reproduces that.
    expect(projectedItem.price.toFixed2()).toBe('11.00');
    expect(projectedItem.appliedPriceGroup).toBe(otherPriceGroup);
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

    // The price group is still resolved - resolution is driven by the intents, not by the items -
    // but no item matches, so every item is handed across by identity and no price is disturbed.
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
    // Nothing is resolvable, so the loader answers a map without the requested key - which is how
    // the set read reports a miss. It neither throws nor substitutes; the caller decides.
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

    // Why REFUSAL and not A SKIP: dropping the intent would move the L241 discriminator to its
    // other arm and change the discount the customer is charged. The promotion pass must therefore
    // not run at all.
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

    // The anti-corruption boundary is read-only in both directions: the engine consumes a view and
    // emits intents.
    expect(itemAt(order, 0).price.toFixed2()).toBe(originalPrice);
    expect(itemAt(order, 0).extendedPrice.toFixed2()).toBe(originalExtended);
    expect(itemAt(order, 0).appliedPriceGroup).toBe(originalItem.appliedPriceGroup);
    expect(itemAt(order, 0)).toBe(originalItem);
  });

  it('issues no statement of its own beyond what the collaborators it calls would', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = await root.createRequestScope();

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(makeOrderViewFixture());

    // The composed operation performs the deferred zone read before either pass, even when both
    // passes are substituted. Three statements in total: the two eager tier-one reads plus the one
    // deferred zone read.
    expect(executor.calls).toHaveLength(3);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    expect(executor.countOf(GENERAL_SETTINGS_SQL)).toBe(1);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(1);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('drives the REAL price-group pass through the wired repository, parameterized by the account', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = await root.createRequestScope();
    const order = makeOrderViewFixture();
    const accountID = requirePresent(order.accountID, 'the fixture order account');
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
    // PARAMETERIZED, never interpolated: this is the property `cfqueryparam` carried in the legacy
    // and the reason the port uses prepared statements exclusively.
    expect(recorded.params).toEqual([accountID]);

    // No `SwAccountPriceGroup` row was seeded, so the pass declines for every item - the
    // `cfLen(accountPriceGroups) > 0` gate - and the view is handed on by identity.
    expect(result.priceGroupIntents).toEqual([]);
    expect(result.pricedOrder).toBe(order);
  });

  it('★★★ issues NO account read for an accountless order, which is why the account is bound first', async () => {
    // Pass rather than argued.
    //
    // That is CORRECT for a genuinely anonymous caller - it is the legacy logged-out arm - and it
    // was a BYPASS for an authenticated one.
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = await root.createRequestScope();
    const accountless = makeOrderViewFixture({ accountID: undefined });

    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(accountless);

    expect(accountless.accountID).toBeUndefined();
    expect(executor.countOf(ACCOUNT_PRICE_GROUP_IDS_SQL)).toBe(0);
    expect(result.priceGroupIntents).toEqual([]);

    // And the same order, bound to an account, does issue the read - so the binding is provably
    // what restores it rather than merely relabelling the view.
    const boundExecutor = makeExecutor();
    const boundScope = await bootWith(boundExecutor).then((opened) => opened.createRequestScope());

    vi.spyOn(
      observablePromotionPass(boundScope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    await boundScope.updateOrderAmountsWithPriceGroupsThenPromotions({
      ...accountless,
      accountID: 'acct-bound-from-the-authorizer',
    });

    expect(boundExecutor.countOf(ACCOUNT_PRICE_GROUP_IDS_SQL)).toBe(1);
    expect(
      requirePresent(
        boundExecutor.calls[boundExecutor.firstIndexOf(ACCOUNT_PRICE_GROUP_IDS_SQL)],
        'the account price-group read',
      ).params,
    ).toEqual(['acct-bound-from-the-authorizer']);
  });

  it('★★★ loads the address-zone index itself before either pass runs', async () => {
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, []);
    const scope = await bootWith(executor).then((root) => root.createRequestScope());
    const order = makeOrderViewFixture();

    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(0);

    const zoneReadsWhenPassOneBegan: number[] = [];
    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockImplementation((): Promise<PriceGroupAppliedIntent[]> => {
      zoneReadsWhenPassOneBegan.push(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL));
      return Promise.resolve([]);
    });
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    expect(zoneReadsWhenPassOneBegan).toStrictEqual([1]);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(1);

    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);
    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(1);
  });
});
// 4b. wire-document hydration.
//
// The remedy put the hydration here rather than in the handler, because rule T3 of the plan gives
// the repository tier sole authority to turn identifiers into entities.
//
// What these cases own, and what they deliberately do not.

describe('RequestScope.materializeOrderView', () => {
  /**
   * The identifiers the documents below name, all invented and all non-sensitive.
   */
  const DOCUMENT_PRODUCT_ID = 'prod-wire-0001';
  /**
   * The account an IDENTIFIED request establishes, for the two account-binding cases.
   */
  const REQUEST_ACCOUNT_ID = 'acct-established-by-the-authorizer';
  const DOCUMENT_SECOND_PRODUCT_ID = 'prod-wire-0002';
  const DOCUMENT_SKU_ID = 'sku-wire-0001';
  const DOCUMENT_SECOND_SKU_ID = 'sku-wire-0002';
  const DOCUMENT_ORDER_ID = 'order-wire-0001';
  const DOCUMENT_ITEM_ID = 'oi-wire-0001';
  const DOCUMENT_SECOND_ITEM_ID = 'oi-wire-0002';
  const DOCUMENT_FULFILLMENT_ID = 'of-wire-0001';

  /**
   * The catalogue one case hydrates against, and the scope that will read it.
   *
   * The two spies are installed on the adapters this scope was assembled with, reached through
   * `adaptersOf` for the reason that helper documents: nothing on a scope leads to an adapter any
   * more.
   */
  async function openHydration(
    options: {
      /**
       * The products the repository can answer, keyed by the identifier the document names.
       */
      readonly products?: ReadonlyMap<string, Product>;
      /**
       * The SKUs each product carries, keyed by product identifier.
       */
      readonly skusByProductID?: ReadonlyMap<string, readonly Sku[]>;
      /**
       * The price groups the set loader can resolve.
       */
      readonly priceGroups?: readonly PriceGroup[];
      /**
       * The scope input the hydration runs under.
       *
       * Absent means an ANONYMOUS request, which is what every case that is not about the account
       * uses.
       */
      readonly scopeInput?: RequestScopeInput;
    } = {},
  ): Promise<{
    readonly scope: RequestScope;
    readonly productReads: readonly string[];
    readonly skuReads: readonly { readonly productID: string; readonly fetchOptions: boolean }[];
  }> {
    const root = await bootWith(makeExecutor());
    const scope = await openScopeWithAdapters(root, options.scopeInput);
    const adapters = adaptersOf(scope);
    const productReads: string[] = [];
    const skuReads: { readonly productID: string; readonly fetchOptions: boolean }[] = [];
    const products = options.products ?? new Map<string, Product>();
    const skusByProductID = options.skusByProductID ?? new Map<string, readonly Sku[]>();

    // A spy installed on the SINGULAR reads would now record nothing at all, so these two lines
    // are also what keeps the batching honest: if the hydration ever went back to looping.
    vi.spyOn(adapters.productRepository, 'getProductsByProductID').mockImplementation(
      (productIDs: readonly string[]): Promise<ReadonlyMap<string, Product>> => {
        const resolved = new Map<string, Product>();

        for (const productID of productIDs) {
          productReads.push(productID);

          const product = products.get(productID);

          if (product !== undefined) {
            // Keyed the way the real adapter keys it: FOLDED, so a caller spelling that differs in
            // case from the stored identifier still finds its product.
            resolved.set(cfFoldKey(productID), product);
          }
        }

        return Promise.resolve(resolved);
      },
    );
    vi.spyOn(adapters.skuRepository, 'getProductSkusForProducts').mockImplementation(
      // Two parameters, and the second is `fetchOptions`: the set-based twin carries the singular
      // read's own flag `src/domain/ports/skuRepository.ts`.
      (
        requested: readonly Product[],
        fetchOptions: boolean,
      ): Promise<ReadonlyMap<string, Sku[]>> => {
        const resolved = new Map<string, Sku[]>();

        for (const product of requested) {
          const productID = product.getProductID();
          skuReads.push({ productID, fetchOptions });

          resolved.set(cfFoldKey(productID), [...(skusByProductID.get(productID) ?? [])]);
        }

        return Promise.resolve(resolved);
      },
    );
    armSetLoader(scope, options.priceGroups ?? []);

    return { scope, productReads, skuReads };
  }

  /**
   * One product the repository can answer, at the identifier a document names.
   */
  function documentProduct(productID: string): Product {
    return makeProductFixture({ idPrefix: `${productID}-`, productID });
  }

  /**
   * One SKU hanging off `product`, at the identifier a document names.
   */
  function documentSku(skuID: string, product: Product): Sku {
    return makeSkuFixture({ idPrefix: `${skuID}-`, skuID, product });
  }

  /**
   * One order-item document, every member stated.
   */
  function itemDocument(
    overrides: Partial<{
      readonly orderItemID: string;
      readonly productID: string;
      readonly skuID: string;
      readonly appliedPriceGroupID: string | null;
      readonly price: string;
      readonly extendedPrice: string;
      readonly extendedSkuPrice: string;
      readonly appliedPromotions: readonly AppliedPromotionDocument[];
    }> = {},
  ): OrderItemDocument {
    return {
      orderItemID: overrides.orderItemID ?? DOCUMENT_ITEM_ID,
      productID: overrides.productID ?? DOCUMENT_PRODUCT_ID,
      skuID: overrides.skuID ?? DOCUMENT_SKU_ID,
      quantity: 3,
      price: overrides.price ?? '19.99',
      skuPrice: '21.50',
      extendedPrice: overrides.extendedPrice ?? '59.97',
      extendedSkuPrice: overrides.extendedSkuPrice ?? '64.50',
      appliedPriceGroupID:
        overrides.appliedPriceGroupID === undefined ? null : overrides.appliedPriceGroupID,
      orderItemType: { systemCode: 'oitSale' },
      orderFulfillmentID: DOCUMENT_FULFILLMENT_ID,
      appliedPromotions: overrides.appliedPromotions ?? [],
    };
  }

  /**
   * One whole order document, every member stated, defaults hydratable.
   */
  function orderDocument(
    overrides: Partial<{
      readonly accountID: string | null;
      readonly subtotal: string;
      readonly orderItems: readonly OrderItemDocument[];
      readonly orderFulfillments: readonly OrderFulfillmentDocument[];
      readonly appliedPromotions: readonly AppliedPromotionDocument[];
      readonly currencyCode: string;
    }> = {},
  ): OrderViewDocument {
    return {
      orderID: DOCUMENT_ORDER_ID,
      orderType: { systemCode: 'otSalesOrder' },
      accountID: overrides.accountID === undefined ? null : overrides.accountID,
      promotionCodeList: '',
      totalSaleQuantity: 3,
      subtotal: overrides.subtotal ?? '59.97',
      subtotalAfterItemDiscounts: '59.97',
      fulfillmentChargeAfterDiscountTotal: '0.00',
      currencyCode: overrides.currencyCode ?? 'USD',
      appliedPromotions: overrides.appliedPromotions ?? [],
      orderItems: overrides.orderItems ?? [itemDocument()],
      orderFulfillments: overrides.orderFulfillments ?? [
        {
          orderFulfillmentID: DOCUMENT_FULFILLMENT_ID,
          fulfillmentCharge: '5.00',
          fulfillmentMethod: { fulfillmentMethodID: 'fm-0001', fulfillmentMethodType: 'shipping' },
          shippingMethod: { shippingMethodID: 'sm-0001' },
          appliedPromotions: [],
          totalShippingWeight: 2,
          address: {
            postalCode: '90210',
            city: null,
            stateCode: null,
            countryCode: 'US',
            isNew: false,
          },
        },
      ],
    };
  }

  it('hydrates a plain JSON document into the view the two passes consume', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope, productReads, skuReads } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    const view = await scope.materializeOrderView(orderDocument());

    // The identifiers travelled; the CATALOGUE was read.
    expect(productReads).toEqual([DOCUMENT_PRODUCT_ID]);
    // `fetchOptions` is TRUE, because option membership is one of the reward gates
    // [model/service/PromotionService.cfc:L808-L818] and a SKU fetched without its options would
    // silently fail every option-gated reward.
    expect(skuReads).toEqual([{ productID: DOCUMENT_PRODUCT_ID, fetchOptions: true }]);

    const item = itemAt(view, 0);
    // By IDENTITY: the SKU on the view is the repository's own instance, not a reconstruction.
    // That is what lets the engine walk
    // `sku.getProduct().getProductType().getProductTypeIDPath()`.
    expect(item.sku).toBe(sku);
    expect(item.sku.getProduct()).toBe(product);
    // Every monetary member is a MINTED `Money`, carrying the document's own amount.
    expect(item.price.toDecimalString()).toBe('19.99');
    // `toFixed2` here because `Money` drops the trailing zero from `'64.50'`, exactly as CFML does
    // when it stringifies a number [model/service/RoundingRuleService.cfc:L101-L102].
    expect(item.extendedSkuPrice.toFixed2()).toBe('64.50');
    expect(view.orderID).toBe(DOCUMENT_ORDER_ID);
    expect(view.currencyCode).toBe(toCurrencyCode('USD'));
    expect(view.orderType.systemCode).toBe('otSalesOrder');
  });

  it('reads each distinct product ONCE, however many items name it', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const first = documentSku(DOCUMENT_SKU_ID, product);
    const second = documentSku(DOCUMENT_SECOND_SKU_ID, product);
    const { scope, productReads, skuReads } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [first, second]]]),
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        orderItems: [
          itemDocument(),
          itemDocument({ orderItemID: DOCUMENT_SECOND_ITEM_ID, skuID: DOCUMENT_SECOND_SKU_ID }),
        ],
      }),
    );

    // Two items, one product read and one sku read.
    expect(view.orderItems).toHaveLength(2);
    expect(productReads).toEqual([DOCUMENT_PRODUCT_ID]);
    expect(skuReads).toHaveLength(1);
    expect(itemAt(view, 0).sku).toBe(first);
    expect(itemAt(view, 1).sku).toBe(second);
  });

  it('resolves a case-folded identifier, as a CFML key read does', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      // The repository answers the spelling the document used, which is the upper-cased one here.
      products: new Map([[DOCUMENT_PRODUCT_ID.toUpperCase(), product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        orderItems: [
          itemDocument({
            productID: DOCUMENT_PRODUCT_ID.toUpperCase(),
            skuID: DOCUMENT_SKU_ID.toUpperCase(),
          }),
        ],
      }),
    );

    // The stored row's spelling and the caller's need not match: CFML identifiers are
    // case-insensitive, and a case-sensitive lookup here would refuse a legitimate order.
    expect(itemAt(view, 0).sku).toBe(sku);
  });

  it('hands two items naming ONE price group the SAME instance', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const first = documentSku(DOCUMENT_SKU_ID, product);
    const second = documentSku(DOCUMENT_SECOND_SKU_ID, product);
    const priceGroup = makePriceGroupFixtures().rootPriceGroup;
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [first, second]]]),
      priceGroups: [priceGroup],
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        orderItems: [
          itemDocument({ appliedPriceGroupID: priceGroup.getPriceGroupID() }),
          itemDocument({
            orderItemID: DOCUMENT_SECOND_ITEM_ID,
            skuID: DOCUMENT_SECOND_SKU_ID,
            appliedPriceGroupID: priceGroup.getPriceGroupID(),
          }),
        ],
      }),
    );

    // One INSTANCE, because the reward-eligibility comparison at
    // [model/service/PromotionService.cfc:L241] compares price-group identity.
    const applied = itemAt(view, 0).appliedPriceGroup;
    expect(applied).toBe(priceGroup);
    expect(itemAt(view, 1).appliedPriceGroup).toBe(applied);
  });

  it('leaves an item that states NO price group on the other arm of the discriminator', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    const view = await scope.materializeOrderView(orderDocument());

    // `undefined`, and no price group INVENTED for it: a stated `null` is the `isNull(...)` arm at
    // [model/service/PromotionService.cfc:L241], where the discount is computed from `getPrice()`.
    expect(itemAt(view, 0).appliedPriceGroup).toBeUndefined();
  });

  it('carries the three totals VERBATIM rather than recomputing any of them', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    // A subtotal that DISAGREES with `price × quantity`, deliberately: it is the aggregate's own
    // state, the L252 correction term measures the gap between the two extended pairs.
    const view = await scope.materializeOrderView(orderDocument({ subtotal: '1.23' }));

    expect(view.subtotal.toDecimalString()).toBe('1.23');
    expect(view.subtotalAfterItemDiscounts.toDecimalString()).toBe('59.97');
    // `toFixed2` rather than `toDecimalString` for this one: `Money` normalises `'0.00'` to `'0'`,
    // which is the same AMOUNT - CFML drops trailing zeros when it stringifies a number too
    // [model/service/RoundingRuleService.cfc:L101-L102].
    expect(view.fulfillmentChargeAfterDiscountTotal.toFixed2()).toBe('0.00');
  });

  it('turns every stated absence into undefined, and NEVER into a zero or a wildcard', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        accountID: null,
        appliedPromotions: [
          { promotionAppliedID: 'pa-0001', discountAmount: null, promotion: null },
          {
            promotionAppliedID: 'pa-0002',
            discountAmount: '0.00',
            promotion: { promotionID: 'promo-0001' },
          },
        ],
      }),
    );

    // No discount and a zero discount are different facts.
    const [absent, zero] = view.appliedPromotions;
    expect(absent?.discountAmount).toBeUndefined();
    expect(absent?.promotion).toBeUndefined();
    expect(zero?.discountAmount?.toFixed2()).toBe('0.00');
    expect(zero?.promotion?.promotionID).toBe('promo-0001');
    // A stated-absent account is absent, not an empty string: the price-group pass reads it to
    // decide whether to resolve any price groups at all.
    expect(view.accountID).toBeUndefined();

    const fulfillment = requirePresent(view.orderFulfillments[0], 'the shipping fulfillment');
    const address: ShippingAddressView = requirePresent(fulfillment.address, 'its address');
    // The zone evaluator SKIPS an absent comparison member
    // [model/service/AddressService.cfc:L63, L66, L69, L72], so an absent member must stay absent.
    expect(address.city).toBeUndefined();
    expect(address.stateCode).toBeUndefined();
    expect(address.postalCode).toBe('90210');
    expect(address.countryCode).toBe('US');
  });

  it('states a pickup fulfillment absent shipping method as undefined', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        orderFulfillments: [
          {
            orderFulfillmentID: DOCUMENT_FULFILLMENT_ID,
            fulfillmentCharge: '0.00',
            fulfillmentMethod: { fulfillmentMethodID: 'fm-0002', fulfillmentMethodType: 'pickup' },
            shippingMethod: null,
            appliedPromotions: [],
            totalShippingWeight: 0,
            address: null,
          },
        ],
      }),
    );

    // [model/service/PromotionService.cfc:L701] tests
    // `isNull(orderFulfillment.getShippingMethod())` explicitly, so "no shipping method" has to be
    // expressible - and it is a state, not a gap.
    const fulfillment = requirePresent(view.orderFulfillments[0], 'the pickup fulfillment');
    expect(fulfillment.shippingMethod).toBeUndefined();
    expect(fulfillment.address).toBeUndefined();
  });

  it('REFUSES an order item whose product cannot be loaded, naming the member path', async () => {
    const { scope, skuReads } = await openHydration({ products: new Map<string, Product>() });

    const raised = await rejectionOf(() => scope.materializeOrderView(orderDocument()));

    // Refused, never skipped: an item whose product cannot be loaded is an item whose product-type
    // ancestry, brand and option list are unknown.
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    expect(requireDocumentDataError(raised).fields).toEqual([
      {
        path: 'order.orderItems.0.productID',
        message: 'does not name a product this request can price',
      },
    ]);
    // Nothing SUBMITTED is ECHOED - not in the published fields and not in the message a log line
    // would carry either.
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_PRODUCT_ID);
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_ITEM_ID);
    // And it refused before reaching for SKUs.
    expect(skuReads).toEqual([]);
  });

  it('REFUSES a SKU the named product does not carry, naming both member paths', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const stranger = documentSku(DOCUMENT_SECOND_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      // The product carries a DIFFERENT SKU from the one the document names.
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [stranger]]]),
    });

    const raised = await rejectionOf(() => scope.materializeOrderView(orderDocument()));

    // The two identifiers disagree about the catalogue. Both MEMBERS are named - which of the pair
    // is wrong is exactly what the caller has to decide - and neither value is repeated back.
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    expect(requireDocumentDataError(raised).fields.map((field) => field.path)).toEqual([
      'order.orderItems.0.skuID',
      'order.orderItems.0.productID',
    ]);
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_SKU_ID);
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_PRODUCT_ID);
  });

  it('REFUSES a price group that cannot be resolved rather than dropping it', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
      priceGroups: [],
    });

    const raised = await rejectionOf(() =>
      scope.materializeOrderView(
        orderDocument({ orderItems: [itemDocument({ appliedPriceGroupID: 'pg-missing-0001' })] }),
      ),
    );

    // DROPPING it WOULD CHANGE the MONEY, not merely lose a reference: an item with no applied
    // price group takes the FIRST arm of the [model/service/PromotionService.cfc:L241]
    // discriminator.
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    expect(requireDocumentDataError(raised).fields).toEqual([
      {
        path: 'order.orderItems.0.appliedPriceGroupID',
        message: 'does not name a price group this request can price against',
      },
    ]);
    expect(publishedTextOf(raised)).not.toContain('pg-missing-0001');
  });

  it('REFUSES a monetary member that is not a plain decimal numeral', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    });

    const raised = await rejectionOf(() =>
      // A grouped numeral, which `Money` refuses.
      scope.materializeOrderView(
        orderDocument({ orderItems: [itemDocument({ price: '1,234.50' })] }),
      ),
    );

    expect(raised.message.length).toBeGreaterThan(0);
    // No `Money` was minted from it and nothing was rounded into range.
    expect(raised.message).not.toContain('1234.50');
  });

  it('hydrates through ONE scope only, so two requests share no catalogue read', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const root = await bootWith(makeExecutor());
    const first = await openScopeWithAdapters(root);
    const second = await openScopeWithAdapters(root);

    // Only the FIRST scope's repository is armed. Both spies target the SET-BASED reads, because
    // those are what the hydration calls - see the note in `openHydration`.
    vi.spyOn(adaptersOf(first).productRepository, 'getProductsByProductID').mockImplementation(
      (): Promise<ReadonlyMap<string, Product>> =>
        Promise.resolve(new Map([[cfFoldKey(DOCUMENT_PRODUCT_ID), product]])),
    );
    vi.spyOn(adaptersOf(first).skuRepository, 'getProductSkusForProducts').mockImplementation(
      (): Promise<ReadonlyMap<string, Sku[]>> =>
        Promise.resolve(new Map([[cfFoldKey(DOCUMENT_PRODUCT_ID), [sku]]])),
    );
    const secondProductReads: string[] = [];
    vi.spyOn(adaptersOf(second).productRepository, 'getProductsByProductID').mockImplementation(
      (productIDs: readonly string[]): Promise<ReadonlyMap<string, Product>> => {
        secondProductReads.push(...productIDs);

        return Promise.resolve(new Map<string, Product>());
      },
    );

    const view = await first.materializeOrderView(orderDocument());
    const raised = await rejectionOf(() => second.materializeOrderView(orderDocument()));

    // PER-REQUEST ISOLATION is the PROPERTY. The first scope hydrated; the second refused, because
    // it holds its own adapters and inherits nothing the first read.
    expect(itemAt(view, 0).sku).toBe(sku);
    expect(secondProductReads).toEqual([DOCUMENT_PRODUCT_ID]);
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    // Two DISTINCT scopes, which is what "one per request" means: the root hands back a new one
    // each time rather than a memoized singleton, so nothing either hydrated can be reached from
    // the other.
    expect(second).not.toBe(first);
  });

  it('runs NEITHER pricing pass, and issues no statement of its own', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const root = await bootWith(makeExecutor());
    const scope = await openScopeWithAdapters(root);
    const adapters = adaptersOf(scope);

    vi.spyOn(adapters.productRepository, 'getProductsByProductID').mockImplementation(
      (): Promise<ReadonlyMap<string, Product>> =>
        Promise.resolve(new Map([[cfFoldKey(DOCUMENT_PRODUCT_ID), product]])),
    );
    vi.spyOn(adapters.skuRepository, 'getProductSkusForProducts').mockImplementation(
      (): Promise<ReadonlyMap<string, Sku[]>> =>
        Promise.resolve(new Map([[cfFoldKey(DOCUMENT_PRODUCT_ID), [sku]]])),
    );
    const priceGroupPass = vi
      .spyOn(observableOrderPass(scope.priceGroupService), 'updateOrderAmountsWithPriceGroups')
      .mockImplementation((): Promise<PriceGroupAppliedIntent[]> => Promise.resolve([]));
    const promotionPass = vi
      .spyOn(observablePromotionPass(scope.promotionService), 'updateOrderAmountsWithPromotions')
      .mockImplementation((): Promise<PromotionAppliedIntent[]> => Promise.resolve([]));

    await scope.materializeOrderView(orderDocument());

    // Hydration is a READ. It applies no rate, computes no discount and rounds nothing - the
    // passes are the composed operation's business, and running one here would price an order
    // twice.
    expect(priceGroupPass).not.toHaveBeenCalled();
    expect(promotionPass).not.toHaveBeenCalled();
  });

  it('reads no second product when every item names the same one, across two documents', async () => {
    const first = documentProduct(DOCUMENT_PRODUCT_ID);
    const second = documentProduct(DOCUMENT_SECOND_PRODUCT_ID);
    const firstSku = documentSku(DOCUMENT_SKU_ID, first);
    const secondSku = documentSku(DOCUMENT_SECOND_SKU_ID, second);
    const { scope, productReads, skuReads } = await openHydration({
      products: new Map([
        [DOCUMENT_PRODUCT_ID, first],
        [DOCUMENT_SECOND_PRODUCT_ID, second],
      ]),
      skusByProductID: new Map([
        [DOCUMENT_PRODUCT_ID, [firstSku]],
        [DOCUMENT_SECOND_PRODUCT_ID, [secondSku]],
      ]),
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        orderItems: [
          itemDocument(),
          itemDocument({
            orderItemID: DOCUMENT_SECOND_ITEM_ID,
            productID: DOCUMENT_SECOND_PRODUCT_ID,
            skuID: DOCUMENT_SECOND_SKU_ID,
          }),
        ],
      }),
    );

    // Two distinct products means two reads, and each item's SKU comes from its own product -
    // which is what makes the "sku is not carried by product" refusal above a real check rather
    // than a formality.
    expect(productReads).toEqual([DOCUMENT_PRODUCT_ID, DOCUMENT_SECOND_PRODUCT_ID]);
    expect(skuReads).toHaveLength(2);
    expect(itemAt(view, 0).sku).toBe(firstSku);
    expect(itemAt(view, 1).sku).toBe(secondSku);
  });

  it('★★★ REFUSES a CROSSED pair - product A with a SKU that belongs to product B', async () => {
    // Resolution keys each SKU to its OWN product rather than pooling every named product's SKUs
    // into one map by SKU identifier alone.
    //
    // What WOULD FOLLOW from ADMITTING a crossed pair, stated because "malformed input accepted"
    // understates it: the item would be priced against a SKU whose product-type ancestry belongs to
    // a different product, so every qualifier and reward that walks that ancestry answers for the
    // wrong product.
    const first = documentProduct(DOCUMENT_PRODUCT_ID);
    const second = documentProduct(DOCUMENT_SECOND_PRODUCT_ID);
    const firstSku = documentSku(DOCUMENT_SKU_ID, first);
    const secondSku = documentSku(DOCUMENT_SECOND_SKU_ID, second);
    const { scope } = await openHydration({
      products: new Map([
        [DOCUMENT_PRODUCT_ID, first],
        [DOCUMENT_SECOND_PRODUCT_ID, second],
      ]),
      // Each product carries exactly its own sku. Neither carries the other's, which is what makes
      // the document below crossed rather than merely unusual.
      skusByProductID: new Map([
        [DOCUMENT_PRODUCT_ID, [firstSku]],
        [DOCUMENT_SECOND_PRODUCT_ID, [secondSku]],
      ]),
    });

    const raised = await rejectionOf(() =>
      scope.materializeOrderView(
        orderDocument({
          orderItems: [
            // Item 0 is correct, so the refusal cannot be an artefact of a document that is wrong
            // throughout - the first item resolves and the SECOND is the crossed one.
            itemDocument(),
            itemDocument({
              orderItemID: DOCUMENT_SECOND_ITEM_ID,
              productID: DOCUMENT_SECOND_PRODUCT_ID,
              // The CROSSING: the SECOND product named with the FIRST product's SKU. Both
              // identifiers exist, and both are named elsewhere in this very document - a map
              // pooled by SKU identifier alone would make that enough.
              skuID: DOCUMENT_SKU_ID,
            }),
          ],
        }),
      ),
    );

    // The same refusal the single-product mismatch earns, indexed to the offending item: both
    // members named, because which half of the pair is wrong is the caller's decision, and neither
    // value repeated back.
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    expect(requireDocumentDataError(raised).fields).toEqual([
      {
        path: 'order.orderItems.1.skuID',
        message: 'does not name a sku carried by the product named on the same order item',
      },
      {
        path: 'order.orderItems.1.productID',
        message: 'names a product that does not carry the sku named on the same order item',
      },
    ]);
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_SKU_ID);
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_SECOND_PRODUCT_ID);
  });

  it('★★ still admits the SAME two products when each item names its OWN sku, in either order', async () => {
    const first = documentProduct(DOCUMENT_PRODUCT_ID);
    const second = documentProduct(DOCUMENT_SECOND_PRODUCT_ID);
    const firstSku = documentSku(DOCUMENT_SKU_ID, first);
    const secondSku = documentSku(DOCUMENT_SECOND_SKU_ID, second);
    const { scope } = await openHydration({
      products: new Map([
        [DOCUMENT_PRODUCT_ID, first],
        [DOCUMENT_SECOND_PRODUCT_ID, second],
      ]),
      skusByProductID: new Map([
        [DOCUMENT_PRODUCT_ID, [firstSku]],
        [DOCUMENT_SECOND_PRODUCT_ID, [secondSku]],
      ]),
    });

    const view = await scope.materializeOrderView(
      orderDocument({
        orderItems: [
          itemDocument({
            orderItemID: DOCUMENT_SECOND_ITEM_ID,
            productID: DOCUMENT_SECOND_PRODUCT_ID,
            skuID: DOCUMENT_SECOND_SKU_ID,
          }),
          itemDocument(),
        ],
      }),
    );

    expect(itemAt(view, 0).sku).toBe(secondSku);
    expect(itemAt(view, 1).sku).toBe(firstSku);
  });

  it('★★★ reads TWO products in ONE call and their SKUs in ONE call, not one call each', async () => {
    // The loader underneath always took a list - `materializeProducts` binds an `IN` list and has
    // since it was written - so nothing about the fetch shape changes here.
    const first = documentProduct(DOCUMENT_PRODUCT_ID);
    const second = documentProduct(DOCUMENT_SECOND_PRODUCT_ID);
    const firstSku = documentSku(DOCUMENT_SKU_ID, first);
    const secondSku = documentSku(DOCUMENT_SECOND_SKU_ID, second);
    const root = await bootWith(makeExecutor());
    const scope = await openScopeWithAdapters(root);
    const adapters = adaptersOf(scope);

    const productLoads = vi
      .spyOn(adapters.productRepository, 'getProductsByProductID')
      .mockImplementation((): Promise<ReadonlyMap<string, Product>> =>
        Promise.resolve(
          new Map([
            [cfFoldKey(DOCUMENT_PRODUCT_ID), first],
            [cfFoldKey(DOCUMENT_SECOND_PRODUCT_ID), second],
          ]),
        ),
      );
    const skuLoads = vi
      .spyOn(adapters.skuRepository, 'getProductSkusForProducts')
      .mockImplementation((): Promise<ReadonlyMap<string, Sku[]>> =>
        Promise.resolve(
          new Map([
            [cfFoldKey(DOCUMENT_PRODUCT_ID), [firstSku]],
            [cfFoldKey(DOCUMENT_SECOND_PRODUCT_ID), [secondSku]],
          ]),
        ),
      );
    armSetLoader(scope, []);

    const view = await scope.materializeOrderView(
      orderDocument({
        orderItems: [
          itemDocument(),
          itemDocument({
            orderItemID: DOCUMENT_SECOND_ITEM_ID,
            productID: DOCUMENT_SECOND_PRODUCT_ID,
            skuID: DOCUMENT_SECOND_SKU_ID,
          }),
        ],
      }),
    );

    // One call each, whatever the product count.
    expect(productLoads).toHaveBeenCalledTimes(1);
    expect(skuLoads).toHaveBeenCalledTimes(1);

    // And both identifiers travelled in that one call, so this is not passing because a product
    // was dropped.
    expect(productLoads).toHaveBeenCalledWith([DOCUMENT_PRODUCT_ID, DOCUMENT_SECOND_PRODUCT_ID]);
    expect(skuLoads).toHaveBeenCalledWith([first, second], true);

    // And the view is the same view the per-product loop produced: each item's SKU by identity,
    // from its own product.
    expect(itemAt(view, 0).sku).toBe(firstSku);
    expect(itemAt(view, 1).sku).toBe(secondSku);
  });

  // The account is the one member this hydration does not take verbatim from the document.
  it('★★★ adopts the request scope established account when the document states none', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const { scope } = await openHydration({
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
      scopeInput: { accountID: REQUEST_ACCOUNT_ID },
    });

    const view = await scope.materializeOrderView(orderDocument({ accountID: null }));

    expect(view.accountID).toBe(REQUEST_ACCOUNT_ID);
    // The same identity the pricing context carries, so the two cannot disagree within one
    // request.
    expect(scope.currentAccountContext.accountID).toBe(REQUEST_ACCOUNT_ID);
  });

  it('keeps the account the document states, and stays accountless for an anonymous request', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const catalogue = {
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    };

    // A STATED account WINS. Whether it is the caller's to state is the primary adapter's
    // judgment, and substituting the scope's over it here would hide a disagreement the adapter
    // must refuse.
    const identified = await openHydration({
      ...catalogue,
      scopeInput: { accountID: REQUEST_ACCOUNT_ID },
    });
    const stated = await identified.scope.materializeOrderView(
      orderDocument({ accountID: 'acct-stated-by-document' }),
    );

    expect(stated.accountID).toBe('acct-stated-by-document');

    // And the logged-out arm survives.
    const anonymous = await openHydration(catalogue);
    const accountless = await anonymous.scope.materializeOrderView(
      orderDocument({ accountID: null }),
    );

    expect(accountless.accountID).toBeUndefined();
  });
});

// The scope-level convenience delegate.
//
// One member of `RequestScope` is neither a collaborator nor the composed pricing operation:
// `getSalePriceDetailsForProductSkus` forwards to the promotion service.

describe('RequestScope.getSalePriceDetailsForProductSkus', () => {
  it('forwards to the wired promotion service, which reaches the injected executor', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = await root.createRequestScope();

    const details = await scope.getSalePriceDetailsForProductSkus('product-with-no-sale-prices');

    // No sale-price row was seeded, so the reduced result is empty - which is the normal outcome
    // for a product carrying no active sale-price reward, not a failure.
    expect(details).toEqual({});

    // The forwarding is what is proven: at least one statement beyond the eager tier-one currency
    // read was issued, and it went to this executor.
    expect(executor.calls.length).toBeGreaterThan(1);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('forwards to the same promotion service instance the scope published', async () => {
    const root = await bootWith(makeExecutor());
    const scope = await root.createRequestScope();
    const forwarded = vi
      .spyOn(scope.promotionService, 'getSalePriceDetailsForProductSkus')
      .mockResolvedValue({});

    await scope.getSalePriceDetailsForProductSkus('product-1');

    // Substituting the PUBLISHED instance changes what the delegate calls, which is only true if
    // the delegate closed over that same instance. A second instance constructed privately would
    // leave this spy uncalled.
    expect(forwarded).toHaveBeenCalledTimes(1);
    expect(forwarded).toHaveBeenCalledWith('product-1');
  });
});

// Second suite in this file: the trust-boundary cases.
//
// The cases above own the WIRING of the composition root.

/**
 * The five variables with no default. Every case adds only what it is about.
 */
const BASE_ENV: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'slatwall-database.invalid',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'unit-test-password',
  DB_TLS_MODE: 'verify-identity',
  DB_DIALECT: 'MySQL',
});

const ALLOWED_FEED_HOST = 'shop.example.com';

/**
 * An executor that answers a caller-chosen row set for every statement.
 */
class StubExecutor implements PreparedStatementExecutor {
  readonly statements: string[] = [];
  readonly mutations: { readonly sql: string; readonly params: readonly unknown[] }[] = [];

  /**
   * Every read, with its bound values.
   */
  readonly reads: RecordedStatement[] = [];

  /**
   * Why the row count is now settable, defaulting to the old fixed `0`.
   *
   * And that is no longer only the framework collaborators.
   *
   * @param answer Rows to answer each read with, from the statement and its bound values.
   * @param affectedRows What every write reports back.
   */
  constructor(
    private readonly answer: (
      sql: string,
      params: readonly unknown[],
    ) => readonly SqlRow[] = () => [],
    private readonly affectedRows = 0,
  ) {}

  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.statements.push(sql);
    this.reads.push({ sql, params: [...params] });

    return Promise.resolve(this.answer(sql, params));
  }

  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutations.push({ sql, params: [...params] });

    return Promise.resolve({ affectedRows: this.affectedRows, warningStatus: 0 });
  }

  /**
   * How many real UNITS of WORK were begun - outermost `transaction` calls only.
   *
   * Recorded because atomicity is otherwise invisible from outside.
   *
   * Why this counts outermost calls only, which is not what it first counted.
   */
  transactionsOpened = 0;

  /**
   * Every `transaction` call, joins included.
   *
   * Kept alongside {@link transactionsOpened} so a case can prove that joining actually HAPPENED -
   * more calls than units begun.
   */
  transactionCalls = 0;

  /**
   * The deepest `transaction` call nesting reached - `1` when nothing joined.
   */
  maximumTransactionDepth = 0;

  private openTransactions = 0;

  async transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;

    if (this.openTransactions === 0) {
      this.transactionsOpened += 1;
    }

    this.openTransactions += 1;
    this.maximumTransactionDepth = Math.max(this.maximumTransactionDepth, this.openTransactions);

    try {
      // The same executor is handed to the callback, matching the real one's documented JOINING
      // behaviour: MySQL has no nested transactions.
      return await work(this);
    } finally {
      this.openTransactions -= 1;
    }
  }
}

interface RootOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly executor?: StubExecutor;
  readonly rates?: Readonly<Record<string, string>>;
  /**
   * Pairs with `rates`: when the overridden table was retrieved. Unvalidated, by design.
   */
  readonly ratesRetrievedAt?: Date;
}

async function makeRoot(options: RootOptions = {}): Promise<CompositionRoot> {
  return bootstrapCompositionRoot({
    executor: options.executor ?? new StubExecutor(),
    environment: { ...BASE_ENV, ...options.env },
    ...(options.rates === undefined ? {} : { europeanCentralBankRates: options.rates }),
    ...(options.ratesRetrievedAt === undefined
      ? {}
      : { europeanCentralBankRatesRetrievedAt: options.ratesRetrievedAt }),
  });
}

/**
 * Captures the structured JSON lines the logger writes, parsed.
 */
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
    return expect(makeRoot()).resolves.toBeDefined();
  });

  describe('the order-pricing trust boundary', () => {
    let scope: RequestScope;

    beforeEach(async () => {
      scope = await (await makeRoot()).createRequestScope();
    });

    it('publishes the composed fixed-order command', () => {
      expect(typeof scope.updateOrderAmountsWithPriceGroupsThenPromotions).toBe('function');
    });

    it('★★ REFUSES TO TYPE either individual pass, so neither can be called alone', () => {
      // published type is what enforces it. `@ts-expect-error` is therefore the honest
      // AAP 0.9.1 permits the directive for exactly this - "no `@ts-expect-error`
      // EXPRESSED AS A KEY-MEMBERSHIP PROBE RATHER THAN AS `@ts-expect-error`. The
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
      const survivingMemberIsPresent: Absent<
        'calculateSkuPriceBasedOnPriceGroup',
        RequestScope['priceGroupService']
      > = false;

      expect(survivingMemberIsPresent).toBe(false);
    });

    it('keeps every OTHER price-group and promotion capability reachable', () => {
      // The narrowing has to be surgical.
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

  describe('the product-feed host allow-list', () => {
    it('reads the allow-list from configuration', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      // The claim this case makes - the allow-list comes from configuration - is not weakened by
      // that, because the count alone would be satisfied by a list read from anywhere.
      expect(root.diagnostics.feed.allowedHostCount).toBe(1);
      expect(JSON.stringify(root.diagnostics)).not.toContain(ALLOWED_FEED_HOST);
    });

    it('mints a feed port for a host that IS on the deployment allow-list', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });

      expect(scope.productFeedPort).toBeDefined();
    });

    it('★★ REFUSES A CALLER-SUPPLIED HOST that is not on the deployment allow-list', () => {
      return expect(async () => {
        const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

        await root.createRequestScope({ feedHost: 'attacker.example.invalid' });
      }).rejects.toBeInstanceOf(UntrustedFeedHostError);
    });

    it('refuses every host against an EXPLICITLY empty allow-list, publishing no feed at all', () => {
      return expect(async () => {
        const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: '' } });

        await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });
      }).rejects.toBeInstanceOf(UntrustedFeedHostError);
    });

    it('★★★ publishes no feed when the deployment configured no list, rather than admitting the request authority', async () => {
      const root = await makeRoot();

      await expect(root.createRequestScope({ feedHost: ALLOWED_FEED_HOST })).rejects.toBeInstanceOf(
        UntrustedFeedHostError,
      );
    });

    it('mints no feed port when the request names no host', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      expect((await root.createRequestScope()).productFeedPort).toBeUndefined();
    });
  });

  // A zero-row feed is deliberately enough to assert this: a feed with no items is still a
  // complete document carrying the channel `<link>`.

  describe('the frozen legacy feed origin reaches the document (S-09 declined)', () => {
    /**
     * A root whose feed host is allowed, under the given environment.
     */
    async function feedPortUnder(
      env: Readonly<Record<string, string>>,
    ): Promise<{ readonly document: Promise<string> }> {
      const root = await makeRoot({
        env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST, ...env },
        executor: new StubExecutor(),
      });
      const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });
      const port = scope.productFeedPort;
      const criteria = scope.feedCriteria;

      if (port === undefined || criteria === undefined) {
        throw new Error('expected a feed port and its criteria for an allow-listed host');
      }

      // AAP 0.4.2: the origin authority and the instant are the METHOD ARGUMENT, and the root is
      // what assembles them - it holds the allow-list this criteria's host was matched against.
      return { document: port.generateProductFeed(criteria) };
    }

    it('★★ publishes http URLs from the shipped wiring, with nothing configured', async () => {
      // The path every deployment takes. The legacy emitted `http://#CGI.HTTP_HOST#`
      // [integrationServices/google/views/feed/product.cfm:L14], and the composed graph must
      // reproduce it without being asked.
      const { document } = await feedPortUnder({});

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
      await expect(document).resolves.not.toContain(`<link>https://${ALLOWED_FEED_HOST}</link>`);
    });

    it('★★ publishes http URLs even when a LEFTOVER FEED_URL_SCHEME=https is set', async () => {
      const { document } = await feedPortUnder({ FEED_URL_SCHEME: 'https' });

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
      await expect(document).resolves.not.toContain(`<link>https://${ALLOWED_FEED_HOST}</link>`);
    });

    it('★★ publishes http URLs in PRODUCTION, and starts normally', async () => {
      // The frozen contract publishes the legacy cleartext origin in every environment: there is no
      // start-up refusal for `NODE_ENV=production` together with an `http` feed origin.
      const { document } = await feedPortUnder({
        NODE_ENV: 'production',
        DB_TLS_MODE: 'verify-identity',
      });

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
    });

    it('writes the SAME origin at both channel sites, so no half of the wiring is stale', async () => {
      // Two of the five legacy sites, built from one composed origin
      // [integrationServices/google/views/feed/product.cfm:L14, L15]. A root that composed the
      // origin twice, differently, would pass a single-site assertion and fail this one.
      const { document } = await feedPortUnder({});
      const resolved = await document;

      expect(resolved).toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
      expect(resolved).toContain(
        `<description>Google Product Feed for http://${ALLOWED_FEED_HOST}</description>`,
      );
    });

    it('leaves the xmlns:g namespace URI alone, as it always did', async () => {
      // `http://base.google.com/ns/1.0` is an XML namespace NAME compared byte for byte by
      // consumers, never dereferenced.
      const { document } = await feedPortUnder({});

      await expect(document).resolves.toContain('xmlns:g="http://base.google.com/ns/1.0"');
    });
  });

  describe('the currency rate table', () => {
    it('★★ COMPOSES RATES FROM CONFIGURATION, which production previously could not', () => {
      // The defect was that `EMPTY_EUROPEAN_CENTRAL_BANK_RATES` was the only production
      // possibility: the sole other route was a test-seam override.
      const { lines } = captureLogLines();

      return makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
        },
      }).then(async (root) => {
        expect(root.diagnostics.currency.referenceRateCount).toBe(1);
        expect(root.diagnostics.currency.ratesRetrievedAtConfigured).toBe(true);
        expect(JSON.stringify(root.diagnostics)).not.toContain('1.0850');

        // EUR is the implicit pivot and is deliberately absent from the table, so a EUR-to-USD
        // conversion exercises the multiply-out half against a configured rate: 100 EUR * 1.0850.
        const converted = await (
          await root.createRequestScope()
        ).currencyConverter.convertCurrency(
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
      // [model/service/CurrencyService.cfc:L105]. It REPORTS rather than refuses - see the next
      // case for why that is deliberate.
      const { lines } = captureLogLines();
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();

      await makeRoot({
        env: { ECB_REFERENCE_RATES: 'USD=1.0850', ECB_RATES_RETRIEVED_AT: threeDaysAgo },
      });

      const warned = lines.filter(
        (line) => line.level === 'warn' && line.message.includes('older'),
      );
      expect(warned).toHaveLength(1);

      // And the age is legible rather than redacted.
      expect(warned[0]?.context['ageInDays']).toBe(3);
      expect(warned[0]?.context['rowCount']).toBe(1);
    });

    it('★★★ REPORTS A FUTURE RETRIEVAL INSTANT INSTEAD OF CALLING THE TABLE CURRENT', async () => {
      // The age is a subtraction, so an instant ahead of this host's clock makes it NEGATIVE - and
      // a negative age is LESS THAN the one-day window.
      const { lines } = captureLogLines();
      const overriddenTable = Object.freeze({ USD: '1.0850' });

      // The control half first, so the assertion below is a difference in the INSTANT and not in
      // the override: the same overridden table with a PAST instant reports its age normally.
      await makeRoot({
        rates: overriddenTable,
        ratesRetrievedAt: new Date(Date.now() - 3 * 86_400_000),
      });

      expect(
        lines.filter((line) => line.message.includes('retrieval instant in the future')),
      ).toStrictEqual([]);
      expect(
        lines.filter((line) => line.message.includes('older than the one-day refresh window')),
      ).toHaveLength(1);

      lines.length = 0;

      // Instant was `Date.now() + 86_400_000`, which made the assertion below race on a SINGLE
      // MILLISECOND: the age is `reportInstant - retrievedAt`, so any time elapsed between this
      // line and the report pushed it from exactly -86_400_000 ms to slightly more.
      await makeRoot({
        rates: overriddenTable,
        ratesRetrievedAt: new Date(Date.now() + 2 * 86_400_000 + 1_000),
      });

      const warned = lines.filter((line) =>
        line.message.includes('retrieval instant in the future'),
      );

      expect(warned).toHaveLength(1);
      expect(warned[0]?.level).toBe('warn');
      // A negative age, rounded toward zero, so an operator sees the direction rather than a
      // redacted marker. `ageInDays` is in the logger's diagnostic allow-list; `rowCount` too.
      expect(warned[0]?.context['ageInDays']).toBe(-2);
      expect(warned[0]?.context['rowCount']).toBe(1);
      // And it did not also claim the table was resolved normally.
      expect(
        lines.filter((line) => line.message.includes('resolved from configuration')),
      ).toStrictEqual([]);
    });

    it('reports an OVERRIDDEN table with no paired instant as being of unknown age', async () => {
      // The arm whose own comment always claimed this was what it was for.
      const { lines } = captureLogLines();

      await makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        },
        rates: Object.freeze({ GBP: '0.8520' }),
      });

      const reported = lines.filter((line) => line.message.includes('without a retrieval instant'));

      expect(reported).toHaveLength(1);
      expect(reported[0]?.context).toStrictEqual({ rowCount: 1 });
      // The configured instant is three days old; nothing claims the OVERRIDDEN table is.
      expect(
        lines.filter((line) => line.message.includes('older than the one-day refresh window')),
      ).toStrictEqual([]);
    });

    it('treats a few seconds of clock skew as an age of zero rather than as a future instant', async () => {
      // The allowance exists so that two unsynchronized clocks do not make a routine cold start
      // look alarming. Thirty seconds ahead is skew; it reports the ordinary line with an age of
      // zero, not the future warning.
      const { lines } = captureLogLines();

      await makeRoot({
        rates: Object.freeze({ USD: '1.0850' }),
        ratesRetrievedAt: new Date(Date.now() + 30_000),
      });

      expect(
        lines.filter((line) => line.message.includes('retrieval instant in the future')),
      ).toStrictEqual([]);

      const resolved = lines.filter((line) => line.message.includes('resolved from configuration'));

      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.context['ageInDays']).toBe(0);
    });

    it('★★ STILL USES a stale table, which is the deliberately declined half of S-20', () => {
      captureLogLines();
      const yearAgo = new Date(Date.now() - 400 * 86_400_000).toISOString();

      return makeRoot({
        env: { ECB_REFERENCE_RATES: 'USD=1.0850', ECB_RATES_RETRIEVED_AT: yearAgo },
      })
        .then(async (root) =>
          (await root.createRequestScope()).currencyConverter.convertCurrency(
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
      const { lines } = captureLogLines();
      // A table is configured, and the case now says so.
      const root = await makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
        },
      });

      const converted = await (
        await root.createRequestScope()
      ).currencyConverter.convertCurrency(
        Money.fromDecimalString('100.00'),
        toCurrencyCode('USD'),
        toCurrencyCode('GBP'),
      );

      // Must-preserve: the amount is answered unchanged.
      expect(converted.toFixed2()).toBe('100.00');

      const warned = lines.filter((line) => line.message.includes('passed through'));
      expect(warned).toHaveLength(1);

      // Both codes legible, and the AMOUNT deliberately absent - it is a customer's price, and the
      // codes are the whole operator-actionable signal.
      expect(warned[0]?.context['originalCurrencyCode']).toBe('USD');
      expect(warned[0]?.context['convertToCurrencyCode']).toBe('GBP');
      expect(Object.keys(warned[0]?.context ?? {})).toStrictEqual([
        'originalCurrencyCode',
        'convertToCurrencyCode',
      ]);
    });

    it('★ REPORTS EVEN A SAME-CURRENCY CALL when that currency has no rate, because the legacy gate is not about sameness', async () => {
      // Asks only whether each code is quotable - present in the table, or the euro pivot itself.
      const { lines } = captureLogLines();
      // The table quotes USD and not GBP, so the same-currency call under test is GBP-to-GBP: the
      // gate fails on a code that is not quotable, exactly as a cross-currency call would.
      const root = await makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
        },
      });

      const converted = await (
        await root.createRequestScope()
      ).currencyConverter.convertCurrency(
        Money.fromDecimalString('100.00'),
        toCurrencyCode('GBP'),
        toCurrencyCode('GBP'),
      );

      expect(converted.toFixed2()).toBe('100.00');

      const reported = lines.filter((line) => line.message.includes('passed through'));
      expect(reported).toHaveLength(1);
      expect(reported[0]?.context['originalCurrencyCode']).toBe('GBP');
      expect(reported[0]?.context['convertToCurrencyCode']).toBe('GBP');
    });

    it('★★★ PASSES THROUGH a cross-currency conversion when NO rate table is available at all', async () => {
      // It read "REFUSES a cross-currency conversion when no rate table is available at all" and
      // pinned a `CurrencyRateTableUnavailableError`, on this reasoning.
      //
      // The MISCONFIGURATION is still VISIBLE, which is what keeps this from being a silent
      // mispricing: every pass-through notifies the observer - asserted below.
      const { lines } = captureLogLines();
      const root = await makeRoot();
      const scope = await root.createRequestScope();

      const converted = await scope.currencyConverter.convertCurrency(
        Money.fromDecimalString('100.00'),
        toCurrencyCode('USD'),
        toCurrencyCode('GBP'),
      );

      // The amount is returned as RECEIVED - not rounded, not scaled, not marked.
      expect(converted.toFixed2()).toBe('100.00');

      // And the event is reported, naming the two codes and nothing else - no amount, no
      // configuration value.
      const reported = lines.filter((line) => line.message.includes('passed through'));
      expect(reported).toHaveLength(1);
      expect(reported[0]?.context['originalCurrencyCode']).toBe('USD');
      expect(reported[0]?.context['convertToCurrencyCode']).toBe('GBP');

      // The wiring-time line is emitted too, so an operator learns of the empty table before any
      // request reaches a conversion.
      expect(
        lines.filter((line) => line.message.includes('No currency conversion rates are configured'))
          .length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('★★ still converts the EURO PIVOT to itself with no table, because that needs no rate', async () => {
      // Both sides of a EUR-to-EUR call resolve as the pivot
      // [model/service/CurrencyService.cfc:L87, L93], so the guard never fails and the
      // pass-through branch is never reached at all - the conversion is performed.
      const root = await makeRoot();

      const converted = await (
        await root.createRequestScope()
      ).currencyConverter.convertCurrency(
        Money.fromDecimalString('100.00'),
        toCurrencyCode('EUR'),
        toCurrencyCode('EUR'),
      );

      expect(converted.toFixed2()).toBe('100.00');
    });

    it('converts a same-currency call through the pivot, and reports nothing, once it has a rate', async () => {
      // The other side of the case above, and what makes the distinction observable: with USD in
      // the table the gate PASSES, so the legacy divides into euros
      // [model/service/CurrencyService.cfc:L90] and multiplies straight back out
      // [model/service/CurrencyService.cfc:L96].
      const { lines } = captureLogLines();
      const root = await makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
        },
      });

      const converted = await (
        await root.createRequestScope()
      ).currencyConverter.convertCurrency(
        Money.fromDecimalString('100.00'),
        toCurrencyCode('USD'),
        toCurrencyCode('USD'),
      );

      expect(converted.toFixed2()).toBe('100.00');
      expect(lines.filter((line) => line.message.includes('passed through'))).toStrictEqual([]);
    });
  });

  // The logging threshold this root hands to `src/lib/logger.ts`
  //
  // It replaces a logger-side arrangement that echoed the rejected value.

  describe('the adopted logging threshold', () => {
    /**
     * The composition adopts a process-wide threshold, so it is restored after every case here for
     * the same reason `tests/unit/lib/logger.test.ts` restores it: `isolate: true` keeps it inside
     * this file.
     */
    afterEach(() => {
      logger.adoptConfiguredThreshold(undefined);
    });

    /**
     * Emit one entry at `level` through the process-wide logger with no pinned threshold, and
     * report whether it survived the filter.
     */
    function survivesThreshold(level: 'debug' | 'info'): boolean {
      const lines: string[] = [];
      logger.withSink((line) => lines.push(line))[level]('threshold probe');
      return lines.length > 0;
    }

    it('★★★ ADOPTS THE CONFIGURED LEVEL, so a deployment can actually see debug lines', async () => {
      // The reason the handover exists at all. Nothing in the subtree reads `LOG_LEVEL` from the
      // environment any more, so without this adoption a deployment could set the variable and
      // change nothing whatsoever.
      const { lines } = captureLogLines();

      expect(survivesThreshold('debug')).toBe(false);

      await makeRoot({ env: { LOG_LEVEL: 'debug' } });

      expect(survivesThreshold('debug')).toBe(true);
      // And a correctly configured level is not announced.
      expect(lines.filter((line) => line.message.includes('LOG_LEVEL'))).toStrictEqual([]);
    });

    it('leaves the built-in floor in force when the level is unset, and says nothing about it', async () => {
      const { lines } = captureLogLines();

      await makeRoot();

      expect(survivesThreshold('info')).toBe(true);
      expect(survivesThreshold('debug')).toBe(false);
      expect(lines.filter((line) => line.message.includes('LOG_LEVEL'))).toStrictEqual([]);
    });

    it('adopts a level that raises the floor as readily as one that lowers it', async () => {
      await makeRoot({ env: { LOG_LEVEL: 'error' } });

      expect(survivesThreshold('info')).toBe(false);
    });

    it('★★★ ANNOUNCES A MISTYPED LEVEL EXACTLY ONCE, FROM A CLASSIFIER, ECHOING NO PART OF IT', async () => {
      // Cases, because the suppression makes them inseparable.
      //
      // The mistyped value is deliberately shaped like an access key.
      const planted = 'AKIAPLANTEDNOTALEVEL9';
      const { lines } = captureLogLines();

      await makeRoot({ env: { LOG_LEVEL: planted } });

      const announcements = lines.filter((line) => line.message.includes('LOG_LEVEL'));

      // It announces, from a fixed classifier.
      expect(announcements).toHaveLength(1);
      expect(announcements[0]?.level).toBe('warn');
      expect(announcements[0]?.context).toStrictEqual({
        logThresholdSource: 'defaulted-unrecognized',
        thresholdInForce: 'info',
      });
      // The recognized vocabulary is named, so the report is actionable without a second lookup.
      expect(announcements[0]?.message).toContain('debug, info, warn, error');

      // The service still serves, at the default threshold.
      expect(lines.filter((line) => line.message.includes('Composition root wired'))).toHaveLength(
        1,
      );
      expect(survivesThreshold('info')).toBe(true);
      expect(survivesThreshold('debug')).toBe(false);

      // No PART of the rejected value appears anywhere. Asserted over every captured line rather
      // than over the announcement alone, so an edit that threaded the raw token through some
      // other line would fail here too.
      expect(JSON.stringify(lines)).not.toContain(planted);
      expect(JSON.stringify(lines)).not.toContain('AKIA');

      // And it is once per PROCESS, not once per composition. A suite builds many; a container
      // builds one.
      await makeRoot({ env: { LOG_LEVEL: 'verbose' } });
      await makeRoot({ env: { LOG_LEVEL: 'trace' } });

      expect(lines.filter((line) => line.message.includes('LOG_LEVEL'))).toHaveLength(1);
    });
  });

  // `alwaysCollidingExecutor` is gone, and its absence is itself evidence.

  describe('the URL-title next-suffix walk', () => {
    /**
     * One bound value, folded, or `''` when it is anything but a string.
     *
     * `params` is `readonly unknown[]`, so a `String(...)` coercion would stringify an object as
     * `[object Object]` - which the lint rule that forbids it is right about.
     */
    function boundText(value: unknown): string {
      return typeof value === 'string' ? value.toLowerCase() : '';
    }

    /**
     * An executor that models a real `urlTitle` column instead of a fixed answer.
     *
     * It resolves the family read from its BOUND VALUES - the bare slug and the `slug-%` pattern -
     * so a case can state which titles are taken and let the subject work out the rest.
     *
     * It matches case-insensitively and then answers the row as stored, and getting that
     * distinction wrong once is why it is spelled out at this length.
     */
    function tableWithTitles(takenTitles: readonly string[], affectedRows = 1): StubExecutor {
      return new StubExecutor((sql, params) => {
        if (!sql.includes('OR urlTitle LIKE ?')) {
          return [];
        }

        const exact = boundText(params[0]);
        const pattern = boundText(params[1]);
        const prefix = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern;

        return takenTitles
          .filter((title) => {
            const comparisonKey = title.toLowerCase();
            return comparisonKey === exact || (prefix !== '' && comparisonKey.startsWith(prefix));
          })
          .map((title) => ({ urlTitle: title }));
      }, affectedRows);
    }

    /**
     * The family statement, isolated from the brand writer's own uniqueness probe.
     */
    function familyReads(executor: StubExecutor): readonly RecordedStatement[] {
      return executor.reads.filter((read) => read.sql.includes('OR urlTitle LIKE ?'));
    }

    /**
     * Resolves a title through `saveBrand`, which is the caller AAP 0.4.1 gives the generator.
     *
     * The payload is handed back so a case can read the resolved title off it - the legacy route
     * [model/service/BrandService.cfc:L70] - and the brand is PERSISTED so the write path is an
     * update.
     */
    async function resolveThrough(
      executor: StubExecutor,
      brandName: string,
      env: Readonly<Record<string, string>> = {},
    ): Promise<{ readonly urlTitle: string | undefined; readonly saved: Brand }> {
      const scope = await (await makeRoot({ executor, env })).createRequestScope();
      const payload: { brandName: string; urlTitle?: string } = { brandName };
      const saved = await scope.brandService.saveBrand(
        new Brand({ brandID: 'b-resolving-a-title' }),
        payload,
      );

      return { urlTitle: payload.urlTitle, saved };
    }

    it('★★★ RESOLVES A FAMILY FAR BEYOND THE RETIRED 100 CEILING instead of refusing it', async () => {
      // The AAP citation was right about the construct and wrong about the remedy.
      const taken = [
        'acme',
        ...Array.from({ length: 249 }, (_unused, index) => `acme-${String(index + 2)}`),
      ];
      const executor = tableWithTitles(taken);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      // 250 taken titles are `acme` and `acme-2`... `acme-250`, so the first free candidate is
      // `acme-251` - a suffix the retired ceiling could not reach and would have refused at 101.
      expect(urlTitle).toBe('acme-251');
    });

    it('★★ issues EXACTLY ONE family statement, however large the family is', async () => {
      const executor = tableWithTitles([
        'acme',
        ...Array.from({ length: 299 }, (_unused, index) => `acme-${String(index + 2)}`),
      ]);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-301');
      expect(familyReads(executor)).toHaveLength(1);
    });

    it('walks candidates ASCENDING, so a gap is reused rather than skipped', async () => {
      // The legacy tested `slug`, `slug-2`, `slug-3`,... In order and stopped at the first free
      // one [model/service/DataService.cfc:L64-L68], so a hole left by a deletion is filled.
      const executor = tableWithTitles(['acme', 'acme-2', 'acme-5']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-3');
    });

    it('answers the unsuffixed slug when nothing in the family is taken', async () => {
      // [model/service/DataService.cfc:L60] `var returnTitle = urlTitle;` - the bare slug is
      // the FIRST candidate, so an empty family must not produce `acme-2`.
      const executor = tableWithTitles([]);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme');
    });

    it('starts at -2 and never at -1 when only the bare slug is taken', async () => {
      // `addon` starts at 1 and is incremented before use
      // [model/service/DataService.cfc:L55, L65], so the first suffix the legacy can ever emit
      // is `-2`.
      const executor = tableWithTitles(['acme']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-2');
    });

    it('treats a differently-cased stored title as taken, as the column collation does', async () => {
      // `SwBrand.urlTitle` is a `varchar` under a case-insensitive collation, so the legacy
      // `WHERE urlTitle = 'acme'` matched a stored `ACME` and the caller treated the slug as
      // taken.
      const executor = tableWithTitles(['ACME', 'Acme-2']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-3');

      // And a guard on the double, which this case needs and the others do not.
      const answered = await executor.execute(
        'SELECT urlTitle FROM SwBrand WHERE urlTitle = ? OR urlTitle LIKE ?',
        ['acme', 'acme-%'],
      );

      expect(answered).toStrictEqual([{ urlTitle: 'ACME' }, { urlTitle: 'Acme-2' }]);
    });

    it('ignores family rows that are not candidates it could ever propose', async () => {
      // The `slug-%` pattern is deliberately BROADER than the candidate sequence, so a genuine
      // neighbouring title is read and must then be disregarded.
      const executor = tableWithTitles(['acme', 'acme-deluxe', 'acme-2-old', 'acme-042']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      // `acme-042` is worth naming: it is not `acme-42`, so it occupies no suffix. The legacy
      // tested the unpadded string too, and parsing digits out of rows would have wrongly treated
      // it as taken.
      expect(urlTitle).toBe('acme-2');
    });

    it('★★ binds the slug and the family pattern, splicing neither into the statement', async () => {
      // The `cfqueryparam` property AAP 0.8.3 makes unconditional.
      const executor = tableWithTitles([]);

      await resolveThrough(executor, 'Acme Widgets & Co.');

      const read = familyReads(executor)[0];

      // Sanitization first: `&` and `.` are outside `[a-z0-9 -]` and are stripped, then the space
      // run collapses to a hyphen [model/service/DataService.cfc:L57-L58].
      expect(read?.params).toStrictEqual(['acme-widgets-co', 'acme-widgets-co-%']);
      expect(read?.sql).not.toContain('acme');
      expect(read?.sql).toContain('WHERE urlTitle = ? OR urlTitle LIKE ?');
    });

    it('scopes the family read to the table the caller named', async () => {
      // `tableName="SwBrand"` is handed through verbatim [model/service/BrandService.cfc:L70]
      // because slug uniqueness is scoped to that table's column.
      const executor = tableWithTitles([]);

      await resolveThrough(executor, 'Acme');

      expect(familyReads(executor)[0]?.sql).toContain('FROM SwBrand');
      expect(familyReads(executor)[0]?.sql).not.toContain('SwProduct');
    });

    it('discloses neither the candidate title nor the table in anything it emits', async () => {
      // `LOG_LEVEL` travels in the composition's own ENVIRONMENT rather than being stubbed onto
      // `process.env`.
      const { lines } = captureLogLines();
      const executor = tableWithTitles(['acme-widgets', 'acme-widgets-2']);

      const { urlTitle } = await resolveThrough(executor, 'Acme Widgets', { LOG_LEVEL: 'debug' });

      expect(urlTitle).toBe('acme-widgets-3');

      const familyLines = lines.filter((line) => line.message.includes('urlTitle family'));

      expect(familyLines).toHaveLength(1);
      expect(familyLines[0]?.context).toStrictEqual({ rowCount: 2 });
      expect(JSON.stringify(familyLines[0])).not.toContain('acme');
      expect(JSON.stringify(familyLines[0])).not.toContain('SwBrand');
    });

    it('★★★ settles on the first free suffixed candidate AND WRITES IT, preserving the legacy -2 start', async () => {
      const executor = tableWithTitles(['acme', 'acme-2']);

      const { urlTitle, saved } = await resolveThrough(executor, 'Acme');

      // The legacy route: the generated slug is written into the payload
      // [model/service/DataService.cfc:L70] and populate folds it onto the entity.
      expect(urlTitle).toBe('acme-3');

      // And it REACHED the STATEMENT. One write was issued, it is the brand update, and `acme-3`
      // is among its bound values - which is the assertion no amount of payload inspection can
      // substitute for.
      const brandWrites = executor.mutations.filter((mutation) => mutation.sql.includes('SwBrand'));

      expect(brandWrites).toHaveLength(1);
      expect(brandWrites[0]?.sql).toContain('UPDATE SwBrand');
      expect(brandWrites[0]?.params).toContain('acme-3');
      expect(saved.getBrandID()).toBe('b-resolving-a-title');
      expect(saved.getUrlTitle()).toBe('acme-3');
      expect(saved.getModifiedDateTime()).toBeInstanceOf(Date);
      expect(saved.getModifiedByAccountID()).toBeUndefined();
    });
  });

  describe('the audit actor', () => {
    // The five MySQL repositories each own the assertions about how they stamp; what belongs here
    // is the WIRING - that the actor is built from request-scope input, reaches the adapters.

    /**
     * Position of `modifiedByAccountID` in the price-group update's bound values.
     */
    const UPDATE_MODIFIED_BY_POSITION = 6;

    /**
     * An account the CALLER put on the entity, which must never be written.
     */
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
      // `affectedRows: 1` says the update matched its row - see the note above. Without it the
      // adapter refuses before these cases can read the bound account back.
      const executor = new StubExecutor(() => [], 1);
      // The adapter comes from the inspection hook now.
      const opened = await (await makeRoot({ executor })).createInspectableRequestScope(input);

      await opened.adapters.priceGroupRepository.savePriceGroup(makePersistedPriceGroup());

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
      // The fail-safe property.
      const executor = await saveThrough({ accountID: REQUEST_ACCOUNT_ID });

      expect(executor.mutations[0]?.params[UPDATE_MODIFIED_BY_POSITION]).toBeNull();
      expect(executor.mutations[0]?.params).not.toContain(REQUEST_ACCOUNT_ID);
    });

    it('stamps nothing for a request carrying no account at all', async () => {
      // The `!account.isNew()` half: no identifier means no persisted account, so there is nothing
      // to attribute the row to and none is invented.
      const executor = await saveThrough({ adminAccountFlag: true });

      expect(executor.mutations[0]?.params[UPDATE_MODIFIED_BY_POSITION]).toBeNull();
    });

    it('keeps the audit actor off the published scope, so no caller can restate it', () => {
      return expect(
        makeRoot().then(async (root) => {
          const scope = await root.createRequestScope({ accountID: REQUEST_ACCOUNT_ID });

          return Object.keys(scope);
        }),
      ).resolves.not.toContain('auditActor');
    });

    it('gives two request scopes independent actors', async () => {
      // Per-request construction, not process state: the whole reason the legacy memo families
      // were re-scoped. One request's attribution cannot leak into another's.
      const root = await makeRoot({ executor: new StubExecutor() });
      const first = await openScopeWithAdapters(root, {
        accountID: 'acct-first',
        adminAccountFlag: true,
      });
      const second = await openScopeWithAdapters(root, {
        accountID: 'acct-second',
        adminAccountFlag: true,
      });

      // The adapter identity claim is RETAINED VERBATIM and reached through the recorded assembly,
      // because the actor is constructed per adapter and two scopes sharing one adapter would
      // share one actor.
      expect(adaptersOf(first).priceGroupRepository).not.toBe(
        adaptersOf(second).priceGroupRepository,
      );
      expect(first.currentAccountContext.accountID).toBe('acct-first');
      expect(second.currentAccountContext.accountID).toBe('acct-second');
    });
  });
});

describe('the framework write collaborators', () => {
  /**
   * A 32-character hyphen-free identifier, which is what `generator="uuid" length="32"` produces.
   */
  const MINTED_ID_PATTERN = /^[0-9a-f]{32}$/;

  const WRITER_ACCOUNT_ID = 'acct-that-may-be-attributed';

  /**
   * A rounding rule the save-context rules accept.
   *
   * `'0.99'` satisfies `hasExpressionWithListOfNumericValuesOnly`
   * [model/entity/RoundingRule.cfc:L78-L86] - two characters after the decimal point and numeric.
   *
   * The value rounder is a pass-through: this block asserts what is WRITTEN, and no assertion here
   * rounds anything.
   */
  function makeRoundingRule(roundingRuleID: string): RoundingRule {
    return new RoundingRule(
      {
        roundingRuleID,
        roundingRuleName: 'Ninety-nine cents',
        roundingRuleExpression: '0.99',
        roundingRuleDirection: 'Closest',
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
        priceGroupRates: [],
      },
      { roundValueByRoundingRule: (value: Money): Money => value },
    );
  }

  /**
   * Opens a scope over an executor whose writes report one affected row.
   *
   * `affectedRows: 1` matters: both writers refuse a count other than one, transcribing the
   * `StaleObjectStateException` Hibernate raised on a zero-match flush.
   */
  async function openWritingScope(
    affectedRows = 1,
    input: { accountID?: string; adminAccountFlag?: boolean } = {},
  ): Promise<{ readonly scope: RequestScope; readonly executor: StubExecutor }> {
    const executor = new StubExecutor(() => [], affectedRows);
    const scope = await (await makeRoot({ executor })).createRequestScope(input);

    return { scope, executor };
  }

  describe('SwRoundingRule', () => {
    it('★★★ INSERTS a new rule, mints its identifier and answers the persisted row', async () => {
      const { scope, executor } = await openWritingScope(1, {
        accountID: WRITER_ACCOUNT_ID,
        adminAccountFlag: true,
      });
      const unsaved = makeRoundingRule('');

      const saved = await scope.roundingRuleService.saveRoundingRule(unsaved);

      // One statement, and it is the insert. Asserted on the SQL rather than on a count alone, so
      // an update issued against an unsaved rule could not pass here.
      expect(executor.mutations).toHaveLength(1);
      expect(executor.mutations[0]?.sql).toContain('INSERT INTO SwRoundingRule');

      // Eight columns, eight placeholders, eight bound values - and no value interpolated into the
      // statement text.
      const insert = executor.mutations[0];

      expect(insert?.params).toHaveLength(8);
      expect(insert?.sql.match(/\?/g)).toHaveLength(8);
      expect(insert?.sql).not.toContain('Ninety-nine');
      expect(insert?.sql).not.toContain('0.99');

      // The minted key, in the shape `generator="uuid" length="32"`
      // [model/entity/RoundingRule.cfc:L52] produced - hyphens stripped, which is the 36-to-32
      // reduction the writing repositories already perform.
      expect(insert?.params[0]).toMatch(MINTED_ID_PATTERN);
      expect(insert?.params[1]).toBe('Ninety-nine cents');
      expect(insert?.params[2]).toBe('0.99');
      expect(insert?.params[3]).toBe('Closest');

      // One captured instant serves both timestamps.
      expect(insert?.params[4]).toBeInstanceOf(Date);
      expect(insert?.params[4]).toStrictEqual(insert?.params[6]);
      expect(insert?.params[5]).toBe(WRITER_ACCOUNT_ID);
      expect(insert?.params[7]).toBe(WRITER_ACCOUNT_ID);
      expect(saved).not.toBe(unsaved);
      expect(saved.isNew()).toBe(false);
      expect(saved.getRoundingRuleID()).toBe(insert?.params[0]);
      expect(saved.getCreatedByAccountID()).toBe(WRITER_ACCOUNT_ID);
      expect(saved.getModifiedByAccountID()).toBe(WRITER_ACCOUNT_ID);

      // The caller's instance is untouched - the entity publishes no setter, so the persisted
      // state is a fresh instance.
      expect(unsaved.isNew()).toBe(true);
      expect(unsaved.getRoundingRuleID()).toBe('');
    });

    it('★★ UPDATES a persisted rule and never restamps the created-* columns', async () => {
      const { scope, executor } = await openWritingScope(1, {
        accountID: WRITER_ACCOUNT_ID,
        adminAccountFlag: true,
      });

      const saved = await scope.roundingRuleService.saveRoundingRule(
        makeRoundingRule('rr-00000000000000000000000000001'),
      );

      const update = executor.mutations[0];

      expect(update?.sql).toContain('UPDATE SwRoundingRule');
      expect(update?.sql).toContain('WHERE roundingRuleID = ?');

      // `HibachiEntity.preUpdate` [org/Hibachi/HibachiEntity.cfc:L651-L679] restamps only the
      // modified pair; `setCreatedByAccount` appears in `preInsert` alone
      // [org/Hibachi/HibachiEntity.cfc:L628-L630].
      expect(update?.sql).not.toContain('createdDateTime =');
      expect(update?.sql).not.toContain('createdByAccountID =');
      expect(update?.sql).toContain('modifiedDateTime =');

      // Five bound values for the SET list plus the key in the WHERE clause.
      expect(update?.params).toHaveLength(6);
      expect(update?.params[5]).toBe('rr-00000000000000000000000000001');

      // The identifier is the caller's: an update mints nothing.
      expect(saved.getRoundingRuleID()).toBe('rr-00000000000000000000000000001');
      expect(saved.getModifiedByAccountID()).toBe(WRITER_ACCOUNT_ID);
    });

    it('★★ leaves attribution to the audit gate, stamping NULL when elevation was never established', async () => {
      const { scope, executor } = await openWritingScope(1, { accountID: WRITER_ACCOUNT_ID });

      const saved = await scope.roundingRuleService.saveRoundingRule(makeRoundingRule(''));

      expect(executor.mutations[0]?.params[5]).toBeNull();
      expect(executor.mutations[0]?.params[7]).toBeNull();
      expect(executor.mutations[0]?.params).not.toContain(WRITER_ACCOUNT_ID);
      expect(saved.getCreatedByAccountID()).toBeUndefined();

      // The timestamps are still stamped: the gate governs WHO, never WHETHER.
      expect(executor.mutations[0]?.params[4]).toBeInstanceOf(Date);
    });

    it('★★ REFUSES rather than reporting success when the statement matched no row', async () => {
      const { scope } = await openWritingScope(0);

      await expect(
        scope.roundingRuleService.saveRoundingRule(makeRoundingRule('rr-vanished')),
      ).rejects.toThrow(/roundingRule/i);
    });

    it('does not reach the write at all when a save-context rule refuses', async () => {
      // The order `super.save` used: validate [org/Hibachi/HibachiService.cfc:L151], and flush
      // only when `hasErrors()` is false [org/Hibachi/HibachiService.cfc:L155].
      const { scope, executor } = await openWritingScope(1);
      const nameless = new RoundingRule(
        {
          roundingRuleID: '',
          roundingRuleName: undefined,
          roundingRuleExpression: '0.99',
          roundingRuleDirection: 'Closest',
          createdDateTime: undefined,
          createdByAccountID: undefined,
          modifiedDateTime: undefined,
          modifiedByAccountID: undefined,
          priceGroupRates: [],
        },
        { roundValueByRoundingRule: (value: Money): Money => value },
      );

      // The refusal comes back on the entity, not as a throw.
      const refused = await scope.roundingRuleService.saveRoundingRule(nameless);

      expect(refused.getError('roundingRuleName')).toStrictEqual(['roundingRuleName is required']);
      expect(executor.mutations).toStrictEqual([]);
    });
  });

  describe('SwBrand', () => {
    it('★★★ INSERTS a new brand across all eleven columns and answers the persisted row', async () => {
      const { scope, executor } = await openWritingScope(1, {
        accountID: WRITER_ACCOUNT_ID,
        adminAccountFlag: true,
      });

      const saved = await scope.brandService.saveBrand(new Brand({}), {
        brandName: 'Acme Athletics',
        brandWebsite: 'https://example.invalid/acme',
        remoteID: 'legacy-remote-identifier',
      });

      const insert = executor.mutations[0];

      expect(executor.mutations).toHaveLength(1);
      expect(insert?.sql).toContain('INSERT INTO SwBrand');

      // Eleven columns, not the two the legacy branch logic reads. A partial write was the hazard
      // the earlier fail-closed reading correctly identified; this is the assertion that rules it
      // out.
      expect(insert?.params).toHaveLength(11);
      expect(insert?.sql.match(/\?/g)).toHaveLength(11);
      expect(insert?.params[0]).toMatch(MINTED_ID_PATTERN);
      expect(insert?.params[3]).toBe('acme-athletics');
      expect(insert?.params[4]).toBe('Acme Athletics');
      expect(insert?.params[5]).toBe('https://example.invalid/acme');
      expect(insert?.params[6]).toBe('legacy-remote-identifier');
      expect(insert?.params[7]).toBeInstanceOf(Date);
      expect(insert?.params[8]).toBe(WRITER_ACCOUNT_ID);
      expect(insert?.sql).not.toContain('Acme');
      expect(insert?.sql).not.toContain('example.invalid');

      expect(saved.isNew()).toBe(false);
      expect(saved.getBrandID()).toBe(insert?.params[0]);
      expect(saved.getUrlTitle()).toBe('acme-athletics');
      expect(saved.getRemoteID()).toBe('legacy-remote-identifier');
    });

    it('★★ evaluates the uniqueness rule BEFORE the write, and refuses without writing on a collision', async () => {
      // `model/validation/Brand.json` declares `"urlTitle": {"unique":true}` in the SAVE context,
      // so the legacy answered it through `validate` [org/Hibachi/HibachiService.cfc:L151] and
      // never reached the DAO - a duplicate title was a refused save.
      const executor = new StubExecutor(
        (sql) => (sql.includes('SELECT brandID FROM SwBrand') ? [{ brandID: 'other-brand' }] : []),
        1,
      );
      const scope = await (await makeRoot({ executor })).createRequestScope();

      // And the refusal is a validation refusal, on the entity - which is the second half of the
      // sentence this case's own title makes.
      const refused = await scope.brandService.saveBrand(new Brand({ brandID: 'b-colliding' }), {
        brandName: 'Acme Athletics',
        urlTitle: 'acme-athletics',
      });

      expect(refused.hasError('urlTitle')).toBe(true);
      expect(refused.getError('urlTitle')[0]).toMatch(/unique/i);

      // And not one STATEMENT was WRITTEN. An errored entity alone would also be satisfied by a
      // writer that inserted the row and reported the collision afterwards.
      expect(executor.mutations).toStrictEqual([]);
      expect(executor.statements.some((sql) => sql.includes('SELECT brandID FROM SwBrand'))).toBe(
        true,
      );
    });

    it('excludes the row being saved from its own uniqueness probe', async () => {
      // The ported `!=:entityID` term.
      const { scope, executor } = await openWritingScope(1);

      await scope.brandService.saveBrand(
        new Brand({ brandID: 'b-keeping-its-title', urlTitle: 'acme-athletics' }),
        { brandName: 'Acme Athletics' },
      );

      const probe = executor.statements.find((sql) => sql.includes('SELECT brandID FROM SwBrand'));

      expect(probe).toContain('AND brandID <> ?');
      expect(executor.mutations[0]?.sql).toContain('UPDATE SwBrand');
    });

    it('★★ REFUSES rather than reporting success when the statement matched no row', async () => {
      const { scope } = await openWritingScope(0);

      await expect(
        scope.brandService.saveBrand(new Brand({ brandID: 'b-vanished' }), {
          brandName: 'Acme Athletics',
        }),
      ).rejects.toThrow(/brand/i);
    });

    it('does not reach the write at all when a save-context rule refuses', async () => {
      // `brandWebsite` carries `"dataType":"url"` in the save context, answered by
      // `validate_dataType` [org/Hibachi/HibachiValidationService.cfc:L256-L262].
      const { scope, executor } = await openWritingScope(1);

      const refused = await scope.brandService.saveBrand(new Brand({ brandID: 'b-bad-website' }), {
        brandName: 'Acme Athletics',
        brandWebsite: '/relative/path',
      });

      expect(refused.getError('brandWebsite')).toStrictEqual(['brandWebsite must be a valid URL']);
      expect(executor.mutations).toStrictEqual([]);
    });

    it('★★★ refuses a javascript: brandWebsite through the REAL wiring, not just in isolation', async () => {
      const { scope, executor } = await openWritingScope(1);

      // The scheme is COMPOSED rather than written as a literal so that ESLint's `no-script-url`
      // is satisfied without a suppression: the rule is correct in general, this is a rejection
      // fixture rather than a sink.
      const refused = await scope.brandService.saveBrand(
        new Brand({ brandID: 'b-script-website' }),
        {
          brandName: 'Acme Athletics',
          brandWebsite: `${'java'}${'script'}:alert(document.cookie)`,
        },
      );

      expect(refused.getError('brandWebsite')).toStrictEqual(['brandWebsite must be a valid URL']);

      // Nothing was written, so the stored column can never reach `formatValue_url`, which
      // interpolates it into an anchor unencoded [org/Hibachi/HibachiUtilityService.cfc:L66-L68].
      expect(executor.mutations).toStrictEqual([]);
    });
  });

  it('★★ builds both writers PER REQUEST, so one request cannot stamp another request\u2019s row', async () => {
    // The writers close over the request's audit actor, so a container-scoped writer would carry
    // one invocation's attribution into the next - the whole hazard AAP 0.6.5 re-scopes the legacy
    // memo families for.
    const executor = new StubExecutor(() => [], 1);
    const root = await makeRoot({ executor });

    const first = await root.createRequestScope({
      accountID: 'acct-first',
      adminAccountFlag: true,
    });
    const second = await root.createRequestScope({
      accountID: 'acct-second',
      adminAccountFlag: true,
    });

    await first.roundingRuleService.saveRoundingRule(makeRoundingRule(''));
    await second.roundingRuleService.saveRoundingRule(makeRoundingRule(''));

    expect(executor.mutations[0]?.params[5]).toBe('acct-first');
    expect(executor.mutations[1]?.params[5]).toBe('acct-second');

    // And the services themselves are per-scope instances, which is what makes that possible.
    expect(second.roundingRuleService).not.toBe(first.roundingRuleService);
    expect(second.brandService).not.toBe(first.brandService);
  });
});

// The ceiling therefore bounds the hydration, not the statement.

describe('the price-group page ceiling', () => {
  /**
   * The exact page statement, so no sibling read is mistaken for it - `LIMIT 10` included, because
   * that is the statement `src/handlers/bootstrap.ts` emits.
   */
  const PAGE_STATEMENT = 'SELECT priceGroupID FROM SwPriceGroup LIMIT 10';

  /**
   * An executor answering the page statement with `count` identifiers and nothing else.
   */
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
   * The statements one CALL issued, excluding everything composition had already read.
   *
   * `bootstrapCompositionRoot` reads `SwCurrency` once at composition time - see
   * `readCurrencyRecords`, whose eagerness is itself deliberate.
   */
  function statementsSince(executor: StubExecutor, mark: number): readonly string[] {
    return executor.statements.slice(mark);
  }

  it('★★ refuses a page ABOVE the ceiling before hydrating a single group', async () => {
    const executor = pageOf(1_001);
    const scope = await (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    await expect(scope.priceGroupService.getPriceGroupDataJSON()).rejects.toThrow(
      /returned 1001 price groups and at most 1000/u,
    );

    // The call issued exactly one statement - the identifier read - and not one of the 1,001
    // per-group hydration statements.
    expect(statementsSince(executor, mark)).toStrictEqual([PAGE_STATEMENT]);
  });

  it('proceeds past a page AT the ceiling, so the limit is inclusive', async () => {
    const executor = pageOf(1_000);
    const scope = await (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    // It gets PAST the ceiling and into hydration, which then fails for an unrelated and honest
    // reason: this stub answers no price-group row, so the first identifier names nothing.
    await expect(scope.priceGroupService.getPriceGroupDataJSON()).rejects.toThrow(
      /which SwPriceGroup does not contain/u,
    );

    // And it genuinely REACHED hydration: the page read was followed by a further statement, which
    // is precisely the per-group cost the ceiling exists to bound.
    const issued = statementsSince(executor, mark);

    expect(issued[0]).toBe(PAGE_STATEMENT);
    expect(issued.length).toBeGreaterThan(1);
  });

  it('leaves the page statement carrying the source-declared LIMIT and no invented ORDER BY', async () => {
    const executor = pageOf(1);
    const scope = await (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    await expect(scope.priceGroupService.getPriceGroupDataJSON()).rejects.toThrow();

    // The CEILING is enforced in the adapter and never in the statement: the 1,000 does not appear
    // in the SQL.
    const page = statementsSince(executor, mark).find((sql) => sql === PAGE_STATEMENT);

    expect(page).toBeDefined();
    expect(page).toBe('SELECT priceGroupID FROM SwPriceGroup LIMIT 10');
    expect(page?.toUpperCase()).not.toContain('ORDER BY');
    expect(page).not.toContain(String(1_000));
  });
});

describe('RequestScope.priceGroupEntitlements', () => {
  /**
   * The direct-assignment statement, verbatim, so no sibling price-group read is mistaken for it.
   *
   * It is the statement the composition root ALREADY emitted for
   * `PriceGroupFrameworkReads.getAccountPriceGroups`; the entitlement read reuses it rather than
   * authoring a second one.
   */
  const DIRECT_ASSIGNMENT_STATEMENT =
    'SELECT priceGroupID FROM SwAccountPriceGroup WHERE accountID = ?';

  const ENTITLED_GROUP_ID = 'pg-held-by-this-account';
  const ANOTHER_GROUP_ID = 'pg-held-by-someone-else';
  const REQUEST_ACCOUNT = 'acct-entitlement-subject';

  /**
   * An executor answering the direct-assignment statement with `priceGroupIDs`, and nothing else.
   */
  function accountHolding(priceGroupIDs: readonly string[]): StubExecutor {
    return new StubExecutor((sql) =>
      sql === DIRECT_ASSIGNMENT_STATEMENT
        ? priceGroupIDs.map((priceGroupID) => ({ priceGroupID }))
        : [],
    );
  }

  /**
   * The statements one call issued, past everything composition had already read.
   */
  function statementsSince(executor: StubExecutor, mark: number): readonly string[] {
    return executor.statements.slice(mark);
  }

  it('★★★ ADMITS a group the account holds and REFUSES one it does not, from the same read', async () => {
    // Both halves in one case, off one executor, because the interesting property is that the two
    // answers come from the same entitlement set rather than from two differently-configured
    // worlds.
    const executor = accountHolding([ENTITLED_GROUP_ID]);
    const scope = await (
      await makeRoot({ executor })
    ).createRequestScope({ accountID: REQUEST_ACCOUNT });

    await expect(
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID),
    ).resolves.toBe(true);
    await expect(
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ANOTHER_GROUP_ID),
    ).resolves.toBe(false);
  });

  it('★★ reads the direct assignment with the REQUEST account bound, never a caller-supplied one', async () => {
    const executor = accountHolding([ENTITLED_GROUP_ID]);
    const scope = await (
      await makeRoot({ executor })
    ).createRequestScope({ accountID: REQUEST_ACCOUNT });
    const mark = executor.statements.length;

    await scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID);

    // The link-table read is the statement declared for it, and the only account it can name is
    // the one the scope was opened with - nothing about the entitlement query takes an argument.
    const direct = executor.reads.find((read) => read.sql === DIRECT_ASSIGNMENT_STATEMENT);

    expect(direct).toBeDefined();
    expect(direct?.params).toStrictEqual([REQUEST_ACCOUNT]);
    expect(statementsSince(executor, mark)).toContain(DIRECT_ASSIGNMENT_STATEMENT);
  });

  it('★★ unions the SUBSCRIPTION-derived groups, so an account keeps the tier its subscription grants', async () => {
    // `calculateSkuPriceBasedOnAccount` unions exactly these two sources when it PRICES for an
    // account [model/service/PriceGroupService.cfc:L276-L284].
    const subscriptionGroupID = 'pg-granted-by-subscription';
    // The subscription half goes through `PriceGroupRepository.getAccountSubscriptionPriceGroups`,
    // which hydrates a CASCADE-READY group - rates, ancestry and direct children.
    const subscriptionPriceGroupRow = {
      priceGroupID: subscriptionGroupID,
      priceGroupIDPath: subscriptionGroupID,
      activeFlag: 1,
      priceGroupName: 'Subscriber',
      priceGroupCode: 'subscriber',
      parentPriceGroupID: null,
      createdDateTime: null,
      createdByAccountID: null,
      modifiedDateTime: null,
      modifiedByAccountID: null,
    };
    const executor = new StubExecutor((sql) => {
      if (sql === DIRECT_ASSIGNMENT_STATEMENT) {
        return [];
      }

      // The subscription statement names the benefit-account link table; the group read names
      // `SwPriceGroup` itself.
      const namesSubscriptionBenefit = sql.includes('SwSubsUsageBenefitAccount');
      const namesPriceGroupTable =
        sql.includes('FROM SwPriceGroup ') &&
        !sql.includes('SwPriceGroupRate') &&
        // The child read selects by PARENT, and answering it with this row would hand the
        // hydration a child whose `parentPriceGroupID` is null - which it correctly refuses.
        !sql.includes('parentPriceGroupID IN') &&
        !sql.includes('parentPriceGroupID =');

      return namesSubscriptionBenefit || namesPriceGroupTable ? [subscriptionPriceGroupRow] : [];
    });
    const scope = await (
      await makeRoot({ executor })
    ).createRequestScope({ accountID: REQUEST_ACCOUNT });

    await expect(
      scope.priceGroupEntitlements.isEntitledToPriceGroup(subscriptionGroupID),
    ).resolves.toBe(true);
  });

  it('★★★ ISSUES NO STATEMENT AT ALL for an administrative caller', async () => {
    // The bypass short-circuits before the read, which is what keeps an admin request from paying
    // two statements for a decision that was already made by the authorizer.
    const executor = accountHolding([]);
    const scope = await (
      await makeRoot({ executor })
    ).createRequestScope({ accountID: REQUEST_ACCOUNT, adminAccountFlag: true });
    const mark = executor.statements.length;

    await expect(
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ANOTHER_GROUP_ID),
    ).resolves.toBe(true);
    expect(statementsSince(executor, mark)).toStrictEqual([]);
  });

  it('★★ IS LAZY: opening a scope reads no entitlement until one is asked for', async () => {
    // Four of the nine price-resolution operations name no price group. Resolving the set in the
    // constructor would charge every one of them two statements for a decision they never make.
    const executor = accountHolding([ENTITLED_GROUP_ID]);
    const root = await makeRoot({ executor });
    const mark = executor.statements.length;

    const scope = await root.createRequestScope({ accountID: REQUEST_ACCOUNT });

    expect(statementsSince(executor, mark)).not.toContain(DIRECT_ASSIGNMENT_STATEMENT);

    await scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID);

    expect(statementsSince(executor, mark)).toContain(DIRECT_ASSIGNMENT_STATEMENT);
  });

  it('★★ resolves the set ONCE PER REQUEST, even for concurrent questions', async () => {
    // Single-flight: the set is held as the PROMISE of a set, so two questions arriving before the
    // first read settles share it. Three sequential and two concurrent questions, one read.
    const executor = accountHolding([ENTITLED_GROUP_ID]);
    const scope = await (
      await makeRoot({ executor })
    ).createRequestScope({ accountID: REQUEST_ACCOUNT });
    const mark = executor.statements.length;

    await Promise.all([
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID),
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ANOTHER_GROUP_ID),
    ]);
    await scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID);

    expect(
      statementsSince(executor, mark).filter((sql) => sql === DIRECT_ASSIGNMENT_STATEMENT),
    ).toHaveLength(1);
  });

  it('★★★ gives two scopes off ONE root independent entitlement sets', async () => {
    const executor = new StubExecutor((sql, params) =>
      sql === DIRECT_ASSIGNMENT_STATEMENT && params[0] === 'acct-first'
        ? [{ priceGroupID: ENTITLED_GROUP_ID }]
        : [],
    );
    const root = await makeRoot({ executor });

    const first = await root.createRequestScope({ accountID: 'acct-first' });
    const second = await root.createRequestScope({ accountID: 'acct-second' });

    await expect(
      first.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID),
    ).resolves.toBe(true);
    await expect(
      second.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID),
    ).resolves.toBe(false);
  });

  it('★★ REFUSES every group for a request carrying no account', async () => {
    const executor = accountHolding([ENTITLED_GROUP_ID]);
    const scope = await (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    await expect(
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID),
    ).resolves.toBe(false);
    // And it costs nothing: there is no account to bind, so no statement is issued.
    expect(statementsSince(executor, mark)).toStrictEqual([]);
  });

  it('★ folds identifier case, matching every other identifier comparison in this module', async () => {
    const executor = accountHolding([ENTITLED_GROUP_ID.toUpperCase()]);
    const scope = await (
      await makeRoot({ executor })
    ).createRequestScope({ accountID: REQUEST_ACCOUNT });

    await expect(
      scope.priceGroupEntitlements.isEntitledToPriceGroup(ENTITLED_GROUP_ID),
    ).resolves.toBe(true);
  });

  describe('the rate arm, decided by the owning group', () => {
    /**
     * A rate owned by `owner`, or by nothing at all.
     */
    function rateOwnedBy(owner: PriceGroup | undefined): PriceGroupRate {
      const graph = makePriceGroupFixtures();
      const rate = graph.rootGlobalRate;

      if (owner === undefined) {
        rate.removePriceGroup(requirePresent(rate.getPriceGroup(), 'the fixture rate owner'));
      } else {
        owner.addPriceGroupRate(rate);
      }

      return rate;
    }

    it('★★★ admits a rate whose OWNING group the account holds', async () => {
      const graph = makePriceGroupFixtures();
      const owner = graph.childPriceGroup;
      const executor = accountHolding([owner.getPriceGroupID()]);
      const scope = await (
        await makeRoot({ executor })
      ).createRequestScope({ accountID: REQUEST_ACCOUNT });

      await expect(
        scope.priceGroupEntitlements.isEntitledToPriceGroupRate(rateOwnedBy(owner)),
      ).resolves.toBe(true);
    });

    it('★★★ refuses a rate whose owning group the account does NOT hold, even holding another', async () => {
      // The arm a naive gate gets wrong: `calculateSkuPriceBasedOnPriceGroupRate` names a RATE and
      // no group, so a gate testing "some group this caller holds" would admit every rate in the
      // store.
      const graph = makePriceGroupFixtures();
      const executor = accountHolding([graph.siblingPriceGroup.getPriceGroupID()]);
      const scope = await (
        await makeRoot({ executor })
      ).createRequestScope({ accountID: REQUEST_ACCOUNT });

      await expect(
        scope.priceGroupEntitlements.isEntitledToPriceGroupRate(rateOwnedBy(graph.childPriceGroup)),
      ).resolves.toBe(false);
    });

    it('★★★ refuses an ORPHAN rate, because there is no owner to test', async () => {
      // Guessing permissively here is how a null foreign key becomes a bypass.
      const executor = accountHolding([ENTITLED_GROUP_ID]);
      const scope = await (
        await makeRoot({ executor })
      ).createRequestScope({ accountID: REQUEST_ACCOUNT });
      const orphan = rateOwnedBy(undefined);

      expect(orphan.getPriceGroup()).toBeUndefined();
      await expect(scope.priceGroupEntitlements.isEntitledToPriceGroupRate(orphan)).resolves.toBe(
        false,
      );
    });

    it('★★ admits an orphan rate for an ADMINISTRATIVE caller, which is the bypass and not an accident', async () => {
      const executor = accountHolding([]);
      const scope = await (
        await makeRoot({ executor })
      ).createRequestScope({ accountID: REQUEST_ACCOUNT, adminAccountFlag: true });

      await expect(
        scope.priceGroupEntitlements.isEntitledToPriceGroupRate(rateOwnedBy(undefined)),
      ).resolves.toBe(true);
    });
  });
});

describe('the per-SKU feed setting cascade', () => {
  /**
   * Every column `SwSetting` discriminates on, restated INDEPENDENTLY of the subject.
   */
  const SETTING_COLUMNS = [
    'accountID',
    'contentID',
    'cmsContentID',
    'brandID',
    'emailID',
    'emailTemplateID',
    'fulfillmentMethodID',
    'paymentMethodID',
    'productID',
    'productTypeID',
    'shippingMethodID',
    'shippingMethodRateID',
    'siteID',
    'skuID',
    'subscriptionTermID',
    'subscriptionUsageID',
    'taskID',
  ] as const;

  /**
   * One `SwSetting` row: the named relationships populated, every other column SQL NULL.
   */
  function settingRow(
    settingName: string,
    settingValue: string | null,
    relationships: Readonly<Record<string, string>> = {},
  ): SqlRow {
    const row: Record<string, unknown> = { settingName, settingValue };

    for (const columnName of SETTING_COLUMNS) {
      row[columnName] = relationships[columnName] ?? null;
    }

    return row;
  }

  /**
   * A `skuShippingWeight` row, which is the key every case below varies.
   */
  function weightRow(value: string | null, relationships: Readonly<Record<string, string>> = {}) {
    return settingRow('skuShippingWeight', value, relationships);
  }

  /**
   * One feed selection row, complete.
   */
  function selectionRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
    return {
      skuID: 'sku-one',
      skuCode: 'SKU-ONE',
      skuActiveFlag: 1,
      skuPrice: '19.99',
      skuImageFile: null,
      productID: 'prod-one',
      productCode: 'PROD-ONE',
      calculatedTitle: 'A Product',
      productDescription: 'A description.',
      productUrlTitle: 'a-product',
      productActiveFlag: 1,
      productPublishedFlag: 1,
      productCalculatedQATS: 7,
      productTypeID: 'pt-leaf',
      brandID: 'brand-one',
      productPrice: '19.99',
      joinedBrandID: 'brand-one',
      brandName: 'A Brand',
      ...overrides,
    };
  }

  interface FeedWorld {
    readonly selections?: readonly SqlRow[];
    readonly settings?: readonly SqlRow[];
    /**
     * Leaf product-type identifier to its STORED path - root first, leaf last.
     */
    readonly paths?: Readonly<Record<string, string | null>>;
  }

  /**
   * An executor answering the three statements the cascade depends on, routed by SQL text.
   *
   * Everything unrouted answers no rows, which is what the image and sale-price statements want
   * here.
   */
  function feedExecutor(world: FeedWorld): StubExecutor {
    return new StubExecutor((sql: string, params: readonly unknown[]): readonly SqlRow[] => {
      // Two statements now read `SwSetting`, and they must not be conflated. Tier one reads the
      // seven general setting names [see GENERAL_SETTINGS_SQL], and the feed cascade reads the two
      // per-SKU shipping-weight names.
      if (sql.includes(PER_SKU_SETTINGS_PREDICATE)) {
        return world.settings ?? [];
      }

      if (sql.includes('FROM SwSetting')) {
        return [];
      }

      if (sql.includes('SELECT productTypeID, productTypeIDPath')) {
        return params
          .filter((param): param is string => typeof param === 'string')
          .map((productTypeID) => ({
            productTypeID,
            productTypeIDPath: world.paths?.[productTypeID] ?? null,
          }));
      }

      if (sql.includes('AS skuActiveFlag')) {
        return world.selections ?? [selectionRow()];
      }

      return [];
    });
  }

  /**
   * Generates the feed through the composed graph and answers the document.
   */
  async function feedFrom(
    world: FeedWorld,
    env: Readonly<Record<string, string>> = {},
  ): Promise<string> {
    const executor = feedExecutor(world);
    const root = await makeRoot({
      env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST, ...env },
      executor,
    });
    const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });
    const port = requirePresent(scope.productFeedPort, 'the product feed port');

    return await port.generateProductFeed(requirePresent(scope.feedCriteria, 'the feed criteria'));
  }

  /**
   * The emitted `<g:shipping_weight>` bodies, in document order.
   */
  function shippingWeights(document: string): readonly string[] {
    return [...document.matchAll(/<g:shipping_weight>([^<]*)<\/g:shipping_weight>/g)].map(
      (match) => match[1] ?? '',
    );
  }

  it('★★★ ANSWERS A PRODUCT-TYPE OVERRIDE instead of the declared default', async () => {
    const document = await feedFrom({
      settings: [weightRow('12', { productTypeID: 'pt-leaf' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['12 lb']);
  });

  it('falls back to the declared default only when every probe misses', async () => {
    const document = await feedFrom({ settings: [], paths: { 'pt-leaf': 'pt-leaf' } });

    expect(shippingWeights(document)).toStrictEqual(['1 lb']);
  });

  it('prefers the SKU-level row over every less specific one', async () => {
    // Step 1, the object's own identifier [model/service/SettingService.cfc:L519-L523]. All four
    // levels are populated at once so the ORDER decides rather than availability.
    const document = await feedFrom({
      settings: [
        weightRow('40'),
        weightRow('30', { productTypeID: 'pt-leaf' }),
        weightRow('20', { productID: 'prod-one' }),
        weightRow('10', { skuID: 'sku-one' }),
      ],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['10 lb']);
  });

  it('prefers the product-level row over the product-type and installation rows', async () => {
    const document = await feedFrom({
      settings: [
        weightRow('40'),
        weightRow('30', { productTypeID: 'pt-leaf' }),
        weightRow('20', { productID: 'prod-one' }),
      ],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['20 lb']);
  });

  it('prefers the product-type-and-brand row over the product-type row alone', async () => {
    // Step 3 before step 4: lookup entry 2 carries the `&product.brand.brandID` conjunct
    // [model/service/SettingService.cfc:L104] and is strictly more specific than entry.
    const document = await feedFrom({
      settings: [
        weightRow('30', { productTypeID: 'pt-leaf' }),
        weightRow('25', { productTypeID: 'pt-leaf', brandID: 'brand-one' }),
      ],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['25 lb']);
  });

  it('★★★ WALKS THE PRODUCT-TYPE PATH LEAF FIRST, so the nearest type wins', async () => {
    // The direction case, and the one most worth getting wrong slowly.
    const document = await feedFrom({
      settings: [
        weightRow('90', { productTypeID: 'pt-root' }),
        weightRow('11', { productTypeID: 'pt-leaf' }),
      ],
      paths: { 'pt-leaf': 'pt-root,pt-mid,pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['11 lb']);
  });

  it('inherits an ancestor product type when nearer ones carry no row', async () => {
    // The same path with only the ROOT populated. This is what makes the walk an inheritance chain
    // rather than a leaf test: the two nearer segments miss and the walk keeps going outwards.
    const document = await feedFrom({
      settings: [weightRow('90', { productTypeID: 'pt-root' })],
      paths: { 'pt-leaf': 'pt-root,pt-mid,pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['90 lb']);
  });

  it('★★ exhausts the whole path WITH the brand before trying any segment without it', async () => {
    // The step-ordering case.
    const document = await feedFrom({
      settings: [
        weightRow('11', { productTypeID: 'pt-leaf' }),
        weightRow('90', { productTypeID: 'pt-root', brandID: 'brand-one' }),
      ],
      paths: { 'pt-leaf': 'pt-root,pt-mid,pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['90 lb']);
  });

  it('★★ ignores a row carrying a relationship the lookup never mentions', async () => {
    // `getSettingRecordBySettingRelationships` emits `AND <col> IS NULL` for every
    // NON-participating column [model/service/SettingService.cfc:L768-L870], so a row scoped to an
    // account is invisible to a lookup that names no account.
    const document = await feedFrom({
      settings: [weightRow('77', { skuID: 'sku-one', accountID: 'acct-other' }), weightRow('40')],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['40 lb']);
  });

  it('finds no brand-only row, because the sku lookup order has no brand-only step', async () => {
    // The brand appears only as entry 2's conjunct [model/service/SettingService.cfc:L104], never
    // alone, so a brand-scoped row is unreachable from a SKU and the cascade falls through to the
    // installation row.
    const document = await feedFrom({
      settings: [weightRow('55', { brandID: 'brand-one' }), weightRow('40')],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['40 lb']);
  });

  it('★★ lets a blanked row short-circuit the cascade rather than inherit', async () => {
    // A row whose `settingValue` is NULL still sets `foundValue`
    // [model/service/SettingService.cfc:L525-L527] and a NULL query column reads as `''` in CFML.
    const document = await feedFrom({
      settings: [weightRow(null, { skuID: 'sku-one' }), weightRow('20', { productID: 'prod-one' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual([' lb']);
  });

  it('matches setting names and identifiers case-insensitively, as the legacy LOWER() pair does', async () => {
    // Both sides of every comparison are wrapped in `LOWER(...)`
    // [model/service/SettingService.cfc:L783 onwards], so a row stored in a different case than
    // the column the selection returned is still the same row.
    const document = await feedFrom({
      settings: [settingRow('SKUSHIPPINGWEIGHT', '13', { skuID: 'SKU-ONE' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['13 lb']);
  });

  it('resolves the two keys independently, so one override does not drag the other', async () => {
    // The view reads two settings [integrationServices/google/views/feed/product.cfm:L58] and each
    // runs its own cascade.
    const document = await feedFrom({
      settings: [
        weightRow('7', { skuID: 'sku-one' }),
        settingRow('skuShippingWeightUnitCode', 'kg', { productTypeID: 'pt-leaf' }),
      ],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['7 kg']);
  });

  it('★★★ answers two SKUs of ONE product differently, which is why the resolver is per-SKU', async () => {
    // The port's whole reason for existing, quoted from its docblock: "Two SKUs of the same
    // product can answer differently.
    const document = await feedFrom({
      selections: [selectionRow(), selectionRow({ skuID: 'sku-two', skuCode: 'SKU-TWO' })],
      settings: [weightRow('5', { skuID: 'sku-one' }), weightRow('50', { skuID: 'sku-two' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['5 lb', '50 lb']);
  });

  it('★★ issues EXACTLY ONE settings read and ONE path read, whatever the batch size', async () => {
    const executor = feedExecutor({
      selections: [
        selectionRow(),
        selectionRow({ skuID: 'sku-two', skuCode: 'SKU-TWO' }),
        selectionRow({ skuID: 'sku-three', skuCode: 'SKU-THREE', productTypeID: 'pt-other' }),
      ],
      settings: [weightRow('40')],
      paths: { 'pt-leaf': 'pt-root,pt-leaf', 'pt-other': 'pt-other' },
    });
    const root = await makeRoot({
      env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST },
      executor,
    });
    const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });

    await requirePresent(scope.productFeedPort, 'the product feed port').generateProductFeed(
      requirePresent(scope.feedCriteria, 'the feed criteria'),
    );

    const settingReads = executor.reads.filter((read) =>
      read.sql.includes(PER_SKU_SETTINGS_PREDICATE),
    );
    const pathReads = executor.reads.filter((read) =>
      read.sql.includes('SELECT productTypeID, productTypeIDPath'),
    );

    expect(settingReads).toHaveLength(1);
    expect(pathReads).toHaveLength(1);

    // And the path read is DEDUPLICATED: three SKUs mention two distinct product types, so it
    // binds two keys rather than three.
    expect(pathReads[0]?.params).toStrictEqual(['pt-leaf', 'pt-other']);
  });

  it('★★ binds both setting names and every product-type key, splicing neither', async () => {
    // The `cfqueryparam` property AAP 0.8.3 makes unconditional.
    const executor = feedExecutor({
      settings: [weightRow('40')],
      paths: { 'pt-leaf': 'pt-leaf' },
    });
    const root = await makeRoot({
      env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST },
      executor,
    });
    const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });

    await requirePresent(scope.productFeedPort, 'the product feed port').generateProductFeed(
      requirePresent(scope.feedCriteria, 'the feed criteria'),
    );

    const settingRead = executor.reads.find((read) =>
      read.sql.includes(PER_SKU_SETTINGS_PREDICATE),
    );

    expect(settingRead?.params).toStrictEqual(['skushippingweight', 'skushippingweightunitcode']);
    expect(settingRead?.sql).toContain('WHERE LOWER(settingName) IN (?, ?)');
    expect(settingRead?.sql).not.toContain('skuShippingWeight');

    for (const columnName of SETTING_COLUMNS) {
      expect(settingRead?.sql).toContain(columnName);
    }
  });

  it('skips the path read entirely when no selected product has a product type', async () => {
    // `IN ()` is a MySQL syntax error, so a batch with nothing to ask about must not ask.
    const executor = feedExecutor({
      selections: [selectionRow({ productTypeID: null })],
      settings: [weightRow('40'), weightRow('30', { productTypeID: 'pt-leaf' })],
    });
    const root = await makeRoot({
      env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST },
      executor,
    });
    const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });

    const document = await requirePresent(
      scope.productFeedPort,
      'the product feed port',
    ).generateProductFeed(requirePresent(scope.feedCriteria, 'the feed criteria'));

    expect(
      executor.reads.filter((read) => read.sql.includes('SELECT productTypeID, productTypeIDPath')),
    ).toStrictEqual([]);
    expect(shippingWeights(document)).toStrictEqual(['40 lb']);
  });

  it('still finds a leaf-level row when the stored path column is NULL', async () => {
    // A leaf whose materialized column is empty still has one known segment: itself.
    const document = await feedFrom({
      settings: [weightRow('19', { productTypeID: 'pt-leaf' })],
      paths: { 'pt-leaf': null },
    });

    expect(shippingWeights(document)).toStrictEqual(['19 lb']);
  });

  it('discloses no setting value and no identifier in what it logs', async () => {
    // The same disclosure property the other bootstrap collaborators hold. `../lib/logger.js`
    // fails closed on any context key it does not recognize as legible, and the resolver passes
    // only the two counts.
    const { lines } = captureLogLines();

    await feedFrom(
      {
        settings: [weightRow('12', { skuID: 'sku-one' })],
        paths: { 'pt-leaf': 'pt-leaf' },
      },
      { LOG_LEVEL: 'debug' },
    );

    const resolved = lines.filter((line) => line.message.includes('shipping-weight settings'));

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.context).toStrictEqual({ rowCount: 1, resultCount: 1 });
    expect(JSON.stringify(resolved[0])).not.toContain('sku-one');
    expect(JSON.stringify(resolved[0])).not.toContain('12');
  });
});

// Third suite in this file: the five runtime guards this module carries.
//
// The common shape of all five: a TYPE this module declares is not a guarantee at a boundary the
// compiler cannot police - a closed string union arriving from an untyped caller.

describe('the runtime guards behind this module type declarations', () => {
  beforeEach(() => {
    resetCompositionRoot();
  });

  afterEach(() => {
    resetCompositionRoot();
    vi.unstubAllEnvs();
  });

  /**
   * The url-title generator this composition wired, reached through the service that holds it.
   *
   * Reached by runtime member read, and the reason is the subject itself.
   */
  function wiredUrlTitleGenerator(scope: RequestScope): UrlTitleGenerator {
    const holder = scope.brandService as unknown as Record<string, unknown>;

    return holder['urlTitleGenerator'] as UrlTitleGenerator;
  }

  it('refuses a url-title table outside the three-member union, issuing no statement', async () => {
    // No INJECTION was EVER POSSIBLE and none is now: the name is not interpolated, the three
    // statements are frozen literals and both values are bound.
    const executor = makeExecutor();
    const scope = await (await bootWith(executor)).createRequestScope();
    const generator = wiredUrlTitleGenerator(scope);
    const readsBefore = executor.calls.length;

    const rejected: readonly unknown[] = [
      'SwSku',
      'SwBrand; DROP TABLE SwBrand--',
      'information_schema.tables',
      '',
      // Rejected in effect, where CFML identifier comparison was case-insensitive: the union
      // spells the three physical tables exactly.
      'swbrand',
      undefined,
      null,
      42,
    ];

    for (const candidate of rejected) {
      const raised = await generator
        .createUniqueURLTitle('Nike', candidate as UrlTitleTableName)
        .then(
          (answer: string) => ({ name: 'NO REFUSAL', answer }),
          (error: unknown) => ({ name: (error as Error).name, answer: undefined }),
        );

      expect(raised.name).toBe('CompositionContractError');
      expect(raised.answer).toBeUndefined();
    }

    expect(executor.calls).toHaveLength(readsBefore);
  });

  it('still answers for each of the three tables the union does declare', async () => {
    const executor = makeExecutor();
    const scope = await (await bootWith(executor)).createRequestScope();
    const generator = wiredUrlTitleGenerator(scope);

    for (const tableName of ['SwBrand', 'SwProduct', 'SwProductType'] as const) {
      await expect(generator.createUniqueURLTitle('Nike', tableName)).resolves.toBe('nike');
    }

    expect(executor.calls.filter((call) => call.sql.includes('OR urlTitle LIKE ?'))).toHaveLength(
      3,
    );
  });

  it('refuses an invalid RequestScopeInput.now at both published entry points', async () => {
    const root = await bootWith(makeExecutor());

    await expect(root.createRequestScope({ now: new Date('nonsense') })).rejects.toThrow(TypeError);
    await expect(
      root.createInspectableRequestScope({ now: new Date(Number.NaN), accountID: 'a' }),
    ).rejects.toThrow(/RequestScopeInput\.now is an invalid Date/u);
  });

  it('binds real instants for a valid clock, so the eligibility window is a comparison', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const { adapters } = await root.createInspectableRequestScope({
      now: new Date('2026-03-04T05:06:07.000Z'),
      accountID: 'a',
    });
    const readsBefore = executor.calls.length;

    await adapters.priceGroupRepository.getAccountSubscriptionPriceGroups('a');

    const bound = executor.calls[readsBefore]?.params ?? [];

    expect(bound.filter((value) => value instanceof Date)).toHaveLength(2);
    expect(bound).not.toContain(null);
  });

  it.each([null, 'not-an-array', 42])(
    'refuses an injected executor whose execute answers %j',
    async (answer) => {
      const hostile: PreparedStatementExecutor = {
        execute: (): Promise<readonly SqlRow[]> =>
          Promise.resolve(answer as unknown as readonly SqlRow[]),
        executeMutation: (): Promise<SqlMutationResult> =>
          Promise.resolve({ affectedRows: 0, warningStatus: 0 }),
        transaction: <T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> =>
          work(hostile),
      };

      await expect(
        bootstrapCompositionRoot({ executor: hostile, environment: BASE_ENVIRONMENT }),
      ).rejects.toThrow(/is not an array/u);
    },
  );

  it('resolves a setting name case-insensitively, as a CFML struct key was', async () => {
    const provider = (await bootWith(makeExecutor())).settingsProvider;

    for (const spelling of ['skuCurrency', 'SKUCURRENCY', 'skucurrency', 'SkuCurrency'] as const) {
      expect(provider.setting(spelling as SettingKey)).toBe('USD');
    }

    expect(provider.setting('GLOBALURLKEYPRODUCT' as SettingKey)).toBe('sp');
    expect(provider.setting('globalURLKeyProduct')).toBe('sp');
  });

  it('freezes the root, its diagnostics, the scope, its account context and the adapters', async () => {
    const root = await bootWith(makeExecutor());
    const { scope, adapters } = await root.createInspectableRequestScope({ accountID: 'acct-1' });

    // Neither `root.diagnostics.database` nor `pool` is listed, because neither member exists on
    // the root at all - not because either is exempt from the freeze check.
    for (const frozen of [
      root,
      root.diagnostics,
      root.diagnostics.tls,
      root.diagnostics.feed,
      root.diagnostics.currency,
      scope,
      scope.currentAccountContext,
      adapters,
    ]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }

    const writeToScope = (): void => {
      (scope.currentAccountContext as { accountID?: string }).accountID = 'HACK';
    };

    expect(writeToScope).toThrow(TypeError);
    expect(scope.currentAccountContext.accountID).toBe('acct-1');
  });
});

// The european central bank currency converter.
//
// The module-private converter class inside `src/handlers/bootstrap.ts` - the shipped
// implementation of the `CurrencyConverter` port.
//
// No assertion computes a monetary value with JavaScript arithmetic.

describe('the European Central Bank currency converter, moved into the composition root', () => {
  // The two shapes the converter's constructor takes.
  type EuropeanCentralBankRateTable = Readonly<Record<string, string>>;

  interface CurrencyRecordProjection {
    readonly currencyCode: CurrencyCode;
    readonly activeFlag: CfBooleanInput;
  }

  /**
   * The pivot. Deliberately not a key of the rate table - see `ECB_RATES`.
   */
  const EUR: CurrencyCode = toCurrencyCode('EUR');

  const USD: CurrencyCode = toCurrencyCode('USD');
  const GBP: CurrencyCode = toCurrencyCode('GBP');
  const JPY: CurrencyCode = toCurrencyCode('JPY');

  /**
   * Present as a `SwCurrency` record but ABSENT from every rate table below.
   */
  const CHF: CurrencyCode = toCurrencyCode('CHF');

  // Rates, chosen so every expected result is exact.

  const USD_RATE = '1.0850';
  const GBP_RATE = '0.8500';
  const JPY_RATE = '160.50';

  /**
   * A European Central Bank reference-rate table in its real shape.
   *
   * CFML parity [model/service/CurrencyService.cfc:L118-L119]: the legacy copies the `currency`
   * and `rate` XML attributes of each `Cube` element, so there is no `EUR` KEY - the table is
   * quoted per euro, so the euro has no rate of its own.
   */
  const ECB_RATES: EuropeanCentralBankRateTable = {
    USD: USD_RATE,
    GBP: GBP_RATE,
    JPY: JPY_RATE,
  };

  // Amounts. Each is exact under the rates above.
  const TWENTY_EUR = '20.00';

  /**
   * Exactly 20 EUR at `USD_RATE`, because 1.0850 * 20 = 21.70.
   */
  const TWENTY_EUR_IN_USD = '21.70';

  /**
   * Exactly 20 EUR at `GBP_RATE`, because 0.8500 * 20 =.
   */
  const TWENTY_EUR_IN_GBP = '17.00';

  /**
   * Exactly 20 EUR at `JPY_RATE`, because 160.50 * 20 = 3210.
   */
  const TWENTY_EUR_IN_JPY = '3210.00';

  /**
   * A three-decimal amount, which is the whole point of it.
   *
   * A sub-cent third decimal is what makes the difference between the rounded converted paths and
   * the unrounded pass-through OBSERVABLE.
   */
  const SUB_CENT_AMOUNT = '19.999';

  /**
   * `SUB_CENT_AMOUNT` after the cent rounding at [model/service/CurrencyService.cfc:L94] /
   * [model/service/CurrencyService.cfc:L96].
   */
  const SUB_CENT_AMOUNT_ROUNDED = '20.00';

  /**
   * A monetary amount from a decimal string. Never from a JavaScript number.
   */
  function money(value: string): Money {
    return Money.fromDecimalString(value);
  }

  /**
   * A `SwCurrency` projection row.
   */
  function currencyRecord(
    currencyCode: CurrencyCode,
    activeFlag: CfBooleanInput,
  ): CurrencyRecordProjection {
    return { currencyCode, activeFlag };
  }

  /**
   * A converter over the real-shaped rate table and no currency records.
   */
  function converterWithRates(
    rates: EuropeanCentralBankRateTable = ECB_RATES,
  ): EuropeanCentralBankCurrencyConverter {
    return new EuropeanCentralBankCurrencyConverter([], rates);
  }

  /**
   * A converter over currency records and no rates - for the listing suites.
   */
  function converterWithRecords(
    records: readonly CurrencyRecordProjection[],
  ): EuropeanCentralBankCurrencyConverter {
    return new EuropeanCentralBankCurrencyConverter(records, {});
  }
  describe('EuropeanCentralBankCurrencyConverter - the euro pivot [model/service/CurrencyService.cfc:L87-L97]', () => {
    it('scales OUT of the euro by the target rate [L96]', async () => {
      // [model/service/CurrencyService.cfc:L93] is false, so [model/service/CurrencyService.cfc:L96]
      // multiplies `amountInEUR` by the target rate. 20 * 1.0850 = 21.70, exactly.
      const converted = await converterWithRates().convertCurrency(money(TWENTY_EUR), EUR, USD);

      expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_USD);
    });

    it('scales INTO the euro by dividing by the source rate [L90, L94]', async () => {
      // [model/service/CurrencyService.cfc:L87] is false so [model/service/CurrencyService.cfc:L90]
      // divides; [model/service/CurrencyService.cfc:L93] is true so
      // [model/service/CurrencyService.cfc:L94] returns without a second scaling. 21.70 / 1.0850 =
      // 20, exactly.
      const converted = await converterWithRates().convertCurrency(
        money(TWENTY_EUR_IN_USD),
        USD,
        EUR,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR);
    });

    it('pivots between two non-euro currencies, dividing then multiplying [L90, L96]', async () => {
      // Both scalings run: 21.70 / 1.0850 = 20, then 20 * 0.8500 =.
      const converted = await converterWithRates().convertCurrency(
        money(TWENTY_EUR_IN_USD),
        USD,
        GBP,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_GBP);
    });

    it('handles a rate far from unity in both directions', async () => {
      // A three-figure rate is the case where a float implementation would start to drift. 20 *
      // 160.50 = 3210, and 3210 / 160.50 =.
      const converter = converterWithRates();

      expect((await converter.convertCurrency(money(TWENTY_EUR), EUR, JPY)).toFixed2()).toBe(
        TWENTY_EUR_IN_JPY,
      );
      expect((await converter.convertCurrency(money(TWENTY_EUR_IN_JPY), JPY, EUR)).toFixed2()).toBe(
        TWENTY_EUR,
      );
      expect((await converter.convertCurrency(money(TWENTY_EUR_IN_JPY), JPY, USD)).toFixed2()).toBe(
        TWENTY_EUR_IN_USD,
      );
    });

    it('★ pivots through the euro even though the rate table carries no EUR key', async () => {
      // CFML parity [model/service/CurrencyService.cfc:L86]: each half of the guard is
      // `structKeyExists(cbRates, code) || code eq "EUR"`, and the pivot test is the half that
      // answers for the euro.
      const converter = converterWithRates();

      expect(structKeyPresent(ECB_RATES, 'EUR')).toBe(false);
      expect((await converter.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe(
        TWENTY_EUR_IN_USD,
      );
      expect((await converter.convertCurrency(money(TWENTY_EUR_IN_USD), USD, EUR)).toFixed2()).toBe(
        TWENTY_EUR,
      );
    });

    it('★ converts euro to euro through the no-scaling path, and still rounds [L88, L94]', async () => {
      // [model/service/CurrencyService.cfc:L87] takes the assignment branch and
      // [model/service/CurrencyService.cfc:L93] takes the early return, so neither rate is
      // consulted - yet [model/service/CurrencyService.cfc:L94] still rounds. A same-currency
      // conversion is therefore not the identity.
      const converted = await converterWithRates().convertCurrency(
        money(SUB_CENT_AMOUNT),
        EUR,
        EUR,
      );

      expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter - the silent pass-through [model/service/CurrencyService.cfc:L100-L101]', () => {
    it('★★ returns the very amount it received when the TARGET has no rate', async () => {
      // `toBe` rather than a value comparison: the instance is returned untouched, which is the
      // strongest form of "unconverted" available.
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, EUR, CHF);

      expect(answered).toBe(amount);
    });

    it('★★ returns the very amount it received when the SOURCE has no rate', async () => {
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, CHF, EUR);

      expect(answered).toBe(amount);
    });

    it('★★ returns the very amount it received when NEITHER side has a rate', async () => {
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, CHF, USD);

      expect(answered).toBe(amount);

      const bothUnlisted = await converterWithRates().convertCurrency(amount, CHF, CHF);

      expect(bothUnlisted).toBe(amount);
    });

    it('★★ does NOT round the pass-through, while every converted path does', async () => {
      // The ASYMMETRY at [model/service/CurrencyService.cfc:L101] vs
      // [model/service/CurrencyService.cfc:L94]/[model/service/CurrencyService.cfc:L96], stated as
      // one assertion pair. [model/service/CurrencyService.cfc:L101] hands back `arguments.amount`
      // verbatim; both return paths round.
      const converter = converterWithRates();
      const amount = money(SUB_CENT_AMOUNT);

      const passedThrough = await converter.convertCurrency(amount, CHF, CHF);
      const converted = await converter.convertCurrency(amount, EUR, EUR);

      expect(passedThrough.toDecimalString()).toBe(SUB_CENT_AMOUNT);
      expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });

    it('★★★ answers at par when the rate table is EMPTY, on the same terms as an unlisted code', async () => {
      // It first asserted par, reasoning that "[model/service/CurrencyService.cfc:L127-L128] the
      // retrieval's `catch` is EMPTY, so a failed fetch leaves the table as it was - possibly
      // never populated at all".
      const converter = converterWithRates({});
      const amount = money(TWENTY_EUR);

      // The same INSTANCE comes back, unrounded, exactly as it does for an unlisted code - so the
      // two unavailable-rate states are now indistinguishable to a caller, which is what "total"
      // means here.
      expect(await converter.convertCurrency(amount, EUR, USD)).toBe(amount);
      expect(await converter.convertCurrency(amount, USD, EUR)).toBe(amount);
      expect(await converter.convertCurrency(amount, USD, GBP)).toBe(amount);
    });

    it('★★ answers at par for an UNLISTED code when the table is NON-EMPTY, which is [L100-L101]', async () => {
      // The must-preserve pass-through, isolated from the empty-table case above.
      const converter = converterWithRates();
      const amount = money(TWENTY_EUR);

      // Returned as RECEIVED - the same instance, unrounded - which is what makes the pass-through
      // distinguishable from a conversion that happens to be 1:1.
      expect(await converter.convertCurrency(amount, EUR, CHF)).toBe(amount);
      expect(await converter.convertCurrency(amount, CHF, USD)).toBe(amount);
    });

    it('★ still converts euro to euro with an empty table, because the pivot needs no rate', async () => {
      const converter = converterWithRates({});
      const amount = money(SUB_CENT_AMOUNT);
      const converted = await converter.convertCurrency(amount, EUR, EUR);

      expect(converted).not.toBe(amount);
      expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter - there is no equal-code short-circuit', () => {
    it('★★ USD to USD with a known rate divides, multiplies and ROUNDS [L90, L96]', async () => {
      // CFML parity [model/service/CurrencyService.cfc:L79-L101]: there is no
      // `original eq convertTo` test anywhere in the legacy body. So the same code on both sides
      // still takes the full arithmetic path, and a sub-cent amount comes back rounded rather than
      // intact.
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, USD, USD);

      expect(answered).not.toBe(amount);
      expect(answered.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });

    it('★★ CHF to CHF with NO rate answers differently, which is what proves the guard', async () => {
      // Same amount, same-code pair, OPPOSITE answer - and the only difference is whether the code
      // has a rate. An identity short-circuit would make these two tests agree, so this pair is
      // the one that would catch it.
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, CHF, CHF);

      expect(answered).toBe(amount);
      expect(answered.toDecimalString()).toBe(SUB_CENT_AMOUNT);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter - the guard runs before any arithmetic [model/service/CurrencyService.cfc:L86]', () => {
    it('★★ a ZERO source rate with an unreachable target is a pass-through, not a division error', async () => {
      // The ORDERING TEST. [model/service/CurrencyService.cfc:L86] tests both halves before
      // [model/service/CurrencyService.cfc:L90] divides, so the legacy never divides here.
      const converter = converterWithRates({ USD: '0' });
      const amount = money(SUB_CENT_AMOUNT);

      const answered = await converter.convertCurrency(amount, USD, CHF);

      expect(answered).toBe(amount);
    });

    it('★★ a MALFORMED source rate with an unreachable target is also a pass-through', async () => {
      // The guard is PRESENCE-based, exactly as `structKeyExists` is: it never looks at the value.
      // So a corrupt rate that is never consulted is harmless.
      const converter = converterWithRates({ USD: 'not-a-number' });
      const amount = money(SUB_CENT_AMOUNT);

      expect(await converter.convertCurrency(amount, USD, CHF)).toBe(amount);
    });

    it('a zero source rate DOES fail once the target is reachable, as CFML division did', async () => {
      // Not a pass-through: this is malformed data, and swallowing it would turn a corrupt rate
      // table into silently wrong prices. Rejecting rather than throwing synchronously is the
      // promise contract the port declares.
      const converter = converterWithRates({ USD: '0' });

      await expect(converter.convertCurrency(money(TWENTY_EUR), USD, EUR)).rejects.toThrow(
        /zero divisor/,
      );
    });

    it('a malformed rate fails once it is CONSULTED, in either position', async () => {
      const converter = converterWithRates({ USD: 'not-a-number' });

      await expect(converter.convertCurrency(money(TWENTY_EUR), EUR, USD)).rejects.toThrow(
        /plain decimal numeral/,
      );
      await expect(converter.convertCurrency(money(TWENTY_EUR), USD, EUR)).rejects.toThrow(
        /plain decimal numeral/,
      );
    });

    it('★ a ZERO TARGET rate is legitimate arithmetic and answers zero, not a failure', async () => {
      // [model/service/CurrencyService.cfc:L96] multiplies by the target rate, and multiplying by
      // zero is defined. The asymmetry with the source position is the division, not the value.
      const converted = await converterWithRates({ USD: '0' }).convertCurrency(
        money(TWENTY_EUR),
        EUR,
        USD,
      );

      expect(converted.toFixed2()).toBe('0.00');
    });
  });
  describe('EuropeanCentralBankCurrencyConverter - cent rounding [model/service/CurrencyService.cfc:L94, L96]', () => {
    it('rounds half AWAY FROM ZERO, which is what CFML round() does', async () => {
      // 1.00 * 1.005 = 1.005 exactly, which sits on the half cent. Half-up takes it to 1.01; a
      // half-to-even implementation would answer 1.00.
      const converted = await converterWithRates({ USD: '1.005' }).convertCurrency(
        money('1.00'),
        EUR,
        USD,
      );

      expect(converted.toFixed2()).toBe('1.01');
    });

    it('normalises a value that rounds to zero from below, as round(-0.1)/100 does', async () => {
      const converted = await converterWithRates().convertCurrency(money('-0.001'), EUR, EUR);

      expect(converted.toFixed2()).toBe('0.00');
      expect(converted.equals(Money.zero)).toBe(true);
    });

    it('leaves the amount handed in untouched - Money is immutable', async () => {
      const amount = money(TWENTY_EUR);

      await converterWithRates().convertCurrency(amount, EUR, JPY);

      expect(amount.toFixed2()).toBe(TWENTY_EUR);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter.getAllActiveCurrencyIDList [model/service/CurrencyService.cfc:L57-L67]', () => {
    it('answers only the active codes, in record order', async () => {
      // [model/service/CurrencyService.cfc:L60] filters `activeFlag` to 1 and
      // [model/service/CurrencyService.cfc:L63-L65] appends each surviving record in the order the
      // query returned it. There is no `ORDER BY`, so record order is the contract.
      const converter = converterWithRecords([
        currencyRecord(JPY, true),
        currencyRecord(USD, false),
        currencyRecord(EUR, true),
      ]);

      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([JPY, EUR]);
    });

    it('treats an ABSENT flag as inactive, matching the `activeFlag = 1` predicate', async () => {
      // [model/entity/Currency.cfc:L53] declares `ormtype="boolean"` with no default, so the
      // column can hydrate as SQL NULL, and SQL NULL fails `= 1`.
      const converter = converterWithRecords([
        currencyRecord(USD, null),
        currencyRecord(GBP, undefined),
        currencyRecord(EUR, true),
      ]);

      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([EUR]);
    });

    it('reads the CFML boolean literals a persisted flag can carry, in any casing', async () => {
      const active = converterWithRecords([
        currencyRecord(USD, '1'),
        currencyRecord(GBP, 'TRUE'),
        currencyRecord(JPY, 'Yes'),
        currencyRecord(EUR, 1),
      ]);

      expect(await active.getAllActiveCurrencyIDList()).toStrictEqual([USD, GBP, JPY, EUR]);

      const inactive = converterWithRecords([
        currencyRecord(USD, '0'),
        currencyRecord(GBP, 'False'),
        currencyRecord(JPY, 'no'),
        currencyRecord(EUR, ''),
      ]);

      expect(await inactive.getAllActiveCurrencyIDList()).toStrictEqual([]);
    });

    it('answers an empty array for an empty record set', async () => {
      expect(await converterWithRecords([]).getAllActiveCurrencyIDList()).toStrictEqual([]);
    });

    it('hands back a FRESH array each call, so a caller cannot reach the internal state', async () => {
      const converter = converterWithRecords([currencyRecord(USD, true)]);

      const first = await converter.getAllActiveCurrencyIDList();
      first.push(GBP);

      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
    });

    it('★ refuses a flag that carries no boolean meaning, at CONSTRUCTION', async () => {
      // A `tinyint` column cannot hold `'maybe'`, so this is a schema surprise rather than a data
      // variation, and failing fast at the boundary beats surfacing it from a listing call several
      // layers away.
      expect(() => converterWithRecords([currencyRecord(USD, 'maybe')])).toThrow(
        CfmlBooleanConversionError,
      );

      // And the well-formed neighbour still constructs, so the refusal is about the value and not
      // about the shape.
      await expect(
        converterWithRecords([currencyRecord(USD, true)]).getAllActiveCurrencyIDList(),
      ).resolves.toStrictEqual([USD]);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter.getCurrenciesByCurrencyCodeList [model/entity/Sku.cfc:L371-L375]', () => {
    it('★★ applies NO active filter, so an inactive-but-eligible currency is still returned', async () => {
      // [model/entity/Sku.cfc:L375] narrows the currency list with
      // `addInFilter('currencyCode', setting('skuEligibleCurrencies'))` and nothing ELSE - there
      // is no `activeFlag` clause on the cascade's path.
      const converter = converterWithRecords([
        currencyRecord(USD, true),
        currencyRecord(GBP, false),
        currencyRecord(JPY, null),
      ]);

      expect(await converter.getCurrenciesByCurrencyCodeList(`${USD},${GBP},${JPY}`)).toStrictEqual(
        [USD, GBP, JPY],
      );

      // The contrast that makes the point: the same records, the other method.
      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
    });

    it('★ omits a listed code that has no currency record at all', async () => {
      // The legacy narrows a smart list over the Currency ENTITY, so it answers with RECORDS - not
      // with the codes the setting happened to name.
      const converter = converterWithRecords([currencyRecord(USD, true)]);

      expect(await converter.getCurrenciesByCurrencyCodeList(`${USD},${CHF}`)).toStrictEqual([USD]);
    });

    it('★ answers in RECORD order, not in the order the list names them', async () => {
      // An `IN` predicate does not reorder a table, and the cascade seeds one outer key per
      // returned record, so record order becomes the key order of the currency-details map.
      const converter = converterWithRecords([
        currencyRecord(USD, true),
        currencyRecord(GBP, true),
        currencyRecord(JPY, true),
      ]);

      expect(await converter.getCurrenciesByCurrencyCodeList(`${JPY},${USD},${GBP}`)).toStrictEqual(
        [USD, GBP, JPY],
      );
    });

    it('matches case-insensitively, as the IN predicate does against a ci collation', async () => {
      const converter = converterWithRecords([
        currencyRecord(USD, true),
        currencyRecord(GBP, true),
      ]);

      expect(await converter.getCurrenciesByCurrencyCodeList('usd,gbp')).toStrictEqual([USD, GBP]);
    });

    it('omits every record for an empty list, which is the gate-shut shape', async () => {
      // [model/entity/Sku.cfc:L373]'s eligibility gate never opens for an empty setting, so this
      // call would not be reached with one - but answering nothing is the only consistent reading
      // if it ever were.
      const converter = converterWithRecords([currencyRecord(USD, true)]);

      expect(await converter.getCurrenciesByCurrencyCodeList('')).toStrictEqual([]);
    });

    it('omits a record the list does not name', async () => {
      const converter = converterWithRecords([
        currencyRecord(USD, true),
        currencyRecord(GBP, true),
      ]);

      expect(await converter.getCurrenciesByCurrencyCodeList(GBP)).toStrictEqual([GBP]);
    });

    it('hands back a FRESH array each call', async () => {
      const converter = converterWithRecords([currencyRecord(USD, true)]);

      const first = await converter.getCurrenciesByCurrencyCodeList(USD);
      first.length = 0;

      expect(await converter.getCurrenciesByCurrencyCodeList(USD)).toStrictEqual([USD]);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter - case-insensitive currency codes', () => {
    it('matches the euro pivot case-insensitively, as CFML `eq` does [L87, L93]', async () => {
      const converter = converterWithRates();

      expect(
        (await converter.convertCurrency(money(TWENTY_EUR), toCurrencyCode('eur'), USD)).toFixed2(),
      ).toBe(TWENTY_EUR_IN_USD);
      expect(
        (
          await converter.convertCurrency(money(TWENTY_EUR_IN_USD), USD, toCurrencyCode('eur'))
        ).toFixed2(),
      ).toBe(TWENTY_EUR);
    });

    it('finds a rate for a lower-cased code, as CFML struct keys are case-insensitive [L86]', async () => {
      const converted = await converterWithRates().convertCurrency(
        money(TWENTY_EUR_IN_USD),
        toCurrencyCode('usd'),
        EUR,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR);
    });

    it('finds a lower-cased TABLE KEY from an upper-cased code', async () => {
      // The table is built from XML attributes, so its casing is the source's, not this port's.
      // Both directions of the mismatch have to work.
      const converted = await converterWithRates({ usd: USD_RATE }).convertCurrency(
        money(TWENTY_EUR),
        EUR,
        USD,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_USD);
    });
  });
  describe('EuropeanCentralBankCurrencyConverter - construction, isolation and surface', () => {
    it('satisfies the CurrencyConverter port', () => {
      // Compile-time as much as run-time: the annotation is the assertion, and it fails the
      // typecheck gate rather than this suite if the surface drifts.
      const port: CurrencyConverter = converterWithRates();

      expect(typeof port.getAllActiveCurrencyIDList).toBe('function');
      expect(typeof port.getCurrenciesByCurrencyCodeList).toBe('function');
      expect(typeof port.convertCurrency).toBe('function');
    });

    it('★ snapshots the currency records, so a later mutation cannot reach in', async () => {
      // A caller keeps ownership of its own array. Reading it live would let a mutation between
      // two calls change which currencies get priced.
      const records: CurrencyRecordProjection[] = [currencyRecord(USD, true)];
      const converter = new EuropeanCentralBankCurrencyConverter(records, ECB_RATES);

      records.push(currencyRecord(GBP, true));
      records.length = 0;

      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
    });

    it('★ snapshots the rate table, so a later mutation cannot change a price', async () => {
      const rates: Record<string, string> = { USD: USD_RATE };
      const converter = new EuropeanCentralBankCurrencyConverter([], rates);

      rates.USD = '99.0000';
      delete rates.USD;

      expect((await converter.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe(
        TWENTY_EUR_IN_USD,
      );
    });

    it('★ shares no state between two instances', async () => {
      // The correctness property behind the instance scoping: two converters built from different
      // rate tables must never agree by accident.
      const cheap = converterWithRates({ USD: '1.0000' });
      const dear = converterWithRates({ USD: '2.0000' });

      expect((await cheap.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe('20.00');
      expect((await dear.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe('40.00');
    });

    it('★ exposes no cache control and no state accessor', () => {
      // The port has no `refreshRates` and no `clearCache`, and neither does this class: a cache
      // it does not own is a cache it cannot mismanage.
      //
      // `resolveScaling` is `private` in TypeScript, which is a compile-time guarantee and not a
      // runtime one, so it appears here.
      const names = Object.getOwnPropertyNames(
        Object.getPrototypeOf(converterWithRates()) as object,
      ).sort();

      expect(names).toStrictEqual([
        'constructor',
        'convertCurrency',
        'getAllActiveCurrencyIDList',
        'getCurrenciesByCurrencyCodeList',
        'resolveScaling',
      ]);
    });
  });

  /**
   * Whether a plain object carries a key, without the case-insensitive matching the production
   * lookup applies.
   *
   * Declared here rather than imported so that the `EUR`-absence assertion says something about
   * the FIXTURE, in plain JavaScript terms.
   */
  function structKeyPresent(struct: Readonly<Record<string, string>>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(struct, key);
  }
});

// The batch-write collaborator: one unit of work for a repriced SKU set

describe('the SKU batch-write collaborator the root supplies to ProductService', () => {
  // CFML parity [model/service/ProductService.cfc:L216-L233]: the legacy method persists nothing
  // itself - `HibachiService.process()` [org/Hibachi/HibachiService.cfc:L84-L129] never saves.

  /**
   * A product carrying `count` SKUs, all hydrated off the shared fixtures.
   */
  function productWithSkus(count: number): Product {
    const product = makeProductFixture({
      idPrefix: 'batch-',
      productID: 'prod-batch-0001',
      productCode: 'BATCH',
    });

    for (let index = 1; index <= count; index += 1) {
      const skuID = `sku-batch-${String(index).padStart(4, '0')}`;
      product.addSku(makeSkuFixture({ idPrefix: `${skuID}-`, skuID, product }));
    }

    return product;
  }

  /**
   * A root whose every write reports one matched row, so an UPDATE path runs to completion.
   *
   * The adapters refuse a zero-count mutation - `affectedRows` reports rows MATCHED under mysql2's
   * default `FOUND_ROWS` flag, so a `0` means the row the caller believes it holds is gone.
   */
  async function rootOverWritableExecutor(): Promise<{
    readonly scope: RequestScope;
    readonly executor: StubExecutor;
  }> {
    const executor = new StubExecutor(() => [], 1);
    const root = await makeRoot({ executor });
    const scope = await root.createRequestScope();

    return { scope, executor };
  }

  it('★★★ opens EXACTLY ONE transaction for a whole repriced set, never one per SKU', async () => {
    const { scope, executor } = await rootOverWritableExecutor();
    const product = productWithSkus(4);

    const answered = await scope.productService.processProduct_updateSkus(product, {
      updatePriceFlag: 1,
      price: '8.40',
      updateListPriceFlag: 0,
    });

    // One unit of work, not four.
    expect(executor.transactionsOpened).toBe(1);

    // And the ADAPTER'S own per-sku transactions joined it rather than opening units of their own,
    // which is what makes the count above trustworthy: there were MORE `transaction` calls than
    // units begun, and they nested.
    expect(executor.transactionCalls).toBeGreaterThan(executor.transactionsOpened);
    expect(executor.maximumTransactionDepth).toBeGreaterThan(1);

    // Every sku was actually written inside it, so this is not passing because nothing happened.
    const skuUpdates = executor.mutations.filter((mutation) => mutation.sql.includes('SwSku'));

    expect(skuUpdates.length).toBeGreaterThanOrEqual(4);

    // [model/service/ProductService.cfc:L232] the argument product comes back.
    expect(answered).toBe(product);
  });

  it('opens NO transaction and issues NO write when both flags are falsy', async () => {
    const { scope, executor } = await rootOverWritableExecutor();
    const product = productWithSkus(3);
    const mutationsBefore = executor.mutations.length;

    await scope.productService.processProduct_updateSkus(product, {
      updatePriceFlag: 0,
      updateListPriceFlag: 0,
    });

    // The empty-set guard is the ROOT's, which is why it is asserted here: the service asks
    // unconditionally, and the collaborator returns before reaching the executor.
    expect(executor.transactionsOpened).toBe(0);
    expect(executor.mutations).toHaveLength(mutationsBefore);
  });

  it('opens NO transaction for a product carrying no SKUs at all', async () => {
    const { scope, executor } = await rootOverWritableExecutor();
    const skuless = productWithSkus(0);

    await scope.productService.processProduct_updateSkus(skuless, {
      updatePriceFlag: 1,
      price: '2.00',
      updateListPriceFlag: 0,
    });

    // The flags ask for work, but there is no SKU to do it to, so the write set is empty and the
    // guard still holds.
    expect(executor.transactionsOpened).toBe(0);
  });
});
