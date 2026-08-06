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
// JUDGMENT CALL: the composition step is isolated by substituting the collaborators one ASSEMBLY
// produced - `scope.priceGroupService`, which the scope publishes, and the concrete
// `priceGroupRepository`, which comes back beside it from `createInspectableRequestScope` - with
// `vi.spyOn`, rather than by seeding the several statements a full price-group hydration would need.
// This is legitimate precisely because ONE assembly hands back both halves, so substituting either
// is substituting the collaborator the subject actually calls, not a lookalike. (This sentence used
// to say "the collaborators the SCOPE ITSELF PUBLISHES - `scope.priceGroupService` and
// `scope.priceGroupRepository`". Finding F18 withdrew the six raw repositories from `RequestScope`
// because publishing them put seven durable mutations within reach of anything holding a scope; the
// instance identity this reasoning depends on is unchanged, and only the route to it moved.) `vi` is vitest itself, already one of the thirteen exact pins; NO MOCKING
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
import { PromotionQualifier } from '../../../src/domain/entities/promotionQualifier.js';
import type { PromotionAppliedIntent } from '../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { ShippingAddressView } from '../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
// ★ NO `UrlTitleCollisionLimitError` IMPORT ANY MORE. This file used to import that class and assert
// `createUniqueURLTitle` rejected with it on the hundred-and-first colliding suffix. Finding F9
// established that a valid state was being refused, so the generator now reads the whole slug family
// in one statement and walks the legacy candidate sequence in memory - a walk that cannot fail - and
// the class is retired. The cases that named it are inverted in the walk's own describe block below.
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
// ★ THREE TYPE-ONLY IMPORTS FOR THE THIRD SUITE'S GUARD CASES. `SettingKey` and `UrlTitleTableName`
// are the two CLOSED UNIONS whose runtime refusals that suite pins, and they are named as types so a
// case can express the out-of-union input an untyped caller supplies without inventing a shape.
// `UrlTitleGenerator` is the port the composition root wires; the concrete adapter is module-local to
// the root and has no exported name.
import type { SettingKey } from '../../../src/domain/ports/settingsProvider.js';
import type {
  UrlTitleGenerator,
  UrlTitleTableName,
} from '../../../src/domain/ports/urlTitleGenerator.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
// ★ THE TWO CATALOGUE FIXTURES THE WIRE-DOCUMENT HYDRATION CASES READ AGAINST. They build the
// PRODUCT and SKU the hydrator's two repository reads answer with, so those cases assert entity
// IDENTITY - the very instance the repository handed back is the one on the view - rather than
// structural equality, which is what the promotion engine's `sku.getProduct().getProductType()` walk
// depends on.
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';
import type { Product } from '../../../src/domain/entities/product.js';
import type { Sku } from '../../../src/domain/entities/sku.js';
import { Brand } from '../../../src/domain/entities/brand.js';
import { RoundingRule } from '../../../src/domain/entities/roundingRule.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyConverter } from '../../../src/domain/ports/currencyConverter.js';
// The port's own folding helper, so this suite's doubles key their maps exactly as the adapters do.
import { cfFoldKey } from '../../../src/lib/cfml/struct.js';
import { CfmlBooleanConversionError } from '../../../src/lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../../src/lib/cfml/truthiness.js';
// ★ IMPORTED FROM THE COMPOSITION ROOT, NOT FROM THE FEED SERVICE. This type used to be exported
// from `src/integrations/google/googleFeedService.js` beside a branded `TrustedFeedHost` and the
// `toTrustedFeedHost` mint that produced it. A completeness review withdrew all of that from the feed
// module - its authority excludes an allow-list by name - and its own guidance keeps origin policy
// "at the request-handler/configuration boundary" when it is separately authorized, which security
// finding S-15 is. So the refusal now lives in `bootstrap.ts`, reads a list only a deployment can
// write, and is imported from there.

// ★ NO `BrandPersistenceUnavailableError` IMPORT ANY MORE. This file used to import that
// class and assert `saveBrand` rejected with it, on the reading that the durable half of
// `super.save` [model/service/BrandService.cfc:L76] did not exist in the subtree. It does
// now: the composition root supplies it as a narrow module-local write collaborator over
// the request's executor, so the class is retired and the assertion that named it is
// inverted below into an end-to-end write.
import { MySqlPriceGroupRepository } from '../../../src/repositories/mysql/mysqlPriceGroupRepository.js';
// ★ THE OTHER FIVE ADAPTER CLASSES, imported for ONE case: the assertion that no member of a
// published `RequestScope` is an instance of any of them. The set-of-member-names assertion beside
// it cannot make that claim, because a renamed member satisfies it - so the classes themselves are
// what the walk looks for. Note the casing is NOT uniform in the subject: five spell the prefix
// `Mysql` and the price-group adapter spells it `MySql`. They are quoted as they are declared.
import { MysqlOptionRepository } from '../../../src/repositories/mysql/mysqlOptionRepository.js';
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
import { MysqlPromotionRepository } from '../../../src/repositories/mysql/mysqlPromotionRepository.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';

// ---------------------------------------------------------------------------
// The statements this suite observes, quoted from the subject verbatim
// ---------------------------------------------------------------------------

/** `SELECT_CURRENCY_RECORDS_SQL`, the one EAGER read tier 1 performs. */
const CURRENCY_RECORDS_SQL = 'SELECT currencyCode, activeFlag FROM SwCurrency';

/**
 * `buildSelectGeneralSettingsSql(7)`, the SECOND eager read tier 1 performs.
 *
 * ★ IT IS WHY TIER ONE ISSUES TWO STATEMENTS RATHER THAN ONE. The composition root used to build
 * `BootstrapSettingsProvider` from the DECLARED DEFAULTS ALONE, so `SwSetting` was never consulted for
 * a general setting: `skuCurrency` answered the literal `'USD'` however the installation was
 * configured, and an explicitly emptied `skuEligibleCurrencies` could not close the cascade gate
 * [model/entity/Sku.cfc:L373]. Code review recorded that as a CRITICAL money defect. This is the
 * legacy's own relationship-free probe [model/service/SettingService.cfc:L490, L595-L608], quoted
 * verbatim including all seventeen relationship columns - the column list IS the predicate, because
 * the empty candidate requires every one of them to be NULL.
 */
const PER_SKU_SETTINGS_PREDICATE = 'WHERE LOWER(settingName) IN (?, ?)';

const GENERAL_SETTINGS_SQL =
  'SELECT settingName, settingValue, accountID, contentID, cmsContentID, brandID, emailID, ' +
  'emailTemplateID, fulfillmentMethodID, paymentMethodID, productID, productTypeID, ' +
  'shippingMethodID, shippingMethodRateID, siteID, skuID, subscriptionTermID, ' +
  'subscriptionUsageID, taskID FROM SwSetting ' +
  'WHERE LOWER(settingName) IN (?, ?, ?, ?, ?, ?, ?)';

/** `SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL`, the first statement the price-group pass issues. */
const ACCOUNT_PRICE_GROUP_IDS_SQL =
  'SELECT priceGroupID FROM SwAccountPriceGroup WHERE accountID = ?';

/**
 * `SELECT_ADDRESS_ZONE_LOCATIONS_SQL`, the one PER-REQUEST read opening a scope performs.
 *
 * Quoted verbatim, including the join, because the join is the load-bearing part: there is no
 * `AddressZoneLocation` entity in the legacy model, `SwAddressZoneLocation` is a LINK TABLE
 * [model/entity/AddressZone.cfc:L61], and a zone's locations ARE `SwAddress` rows.
 */
const ADDRESS_ZONE_LOCATIONS_SQL =
  'SELECT zoneLocation.addressZoneID, ' +
  'location.postalCode, location.city, location.stateCode, location.countryCode ' +
  'FROM SwAddressZoneLocation zoneLocation ' +
  'INNER JOIN SwAddress location ON zoneLocation.addressID = location.addressID';

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
 * Hand-written because the thirteen exact pins include no mocking library and none may be added,
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

  private readonly rowsByFragment: { fragment: string; rows: readonly SqlRow[] }[] = [];

  /** Answer `sql` with `rows`. Every unseeded statement answers no rows. */
  public seed(sql: string, rows: readonly SqlRow[]): this {
    this.rowsBySql.set(sql, rows);

    return this;
  }

  /**
   * Answer any statement CONTAINING `fragment` with `rows`.
   *
   * ★★ NEEDED FOR THE ONE STATEMENT THIS FILE CANNOT NAME EXACTLY. `seed` matches by exact text, which
   * is the right default - it makes a seeded statement a precise claim about what the graph issues - but
   * `SELECT_BRAND_BY_BRAND_ID_SQL` is module-private and is ASSEMBLED from `BRAND_COLUMNS`, deliberately
   * so that the brand read and the brand write cannot project different column sets. Restating its text
   * here would defeat exactly that: the copy would keep passing after the projection widened. Matching
   * on the table name instead means this seed keeps working when the projection changes and stops working
   * when the TABLE does, which is the property worth having.
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

/**
 * A NAMED host that can never resolve, which is what `DB_TLS_MODE=verify-identity` requires.
 *
 * Two rules in `src/lib/config.ts` constrain this value from opposite directions, and only a named
 * host satisfies the pair the fixture below actually sets:
 *
 * * cleartext (`disabled`) is admitted ONLY for a provable loopback destination, in every
 *   environment - which is why this fixture does not use `disabled`; and
 * * `verify-identity` REFUSES AN IP LITERAL (F47, CWE-295), because a certificate binds to host
 *   NAMES and an address would silently reduce the mode to a chain-only check.
 *
 * So the loopback literal an earlier revision carried here is precisely what the mode below
 * rejects. `.invalid` is the reserved never-resolvable TLD [RFC 2606]: it is a NAME, so the
 * identity rule is satisfied, and nothing in this suite opens a connection for it to fail to
 * resolve. The value is distinctive on purpose - the non-disclosure cases below search the whole
 * root for it, so it deliberately shares no substring with `UNUSED_PLACEHOLDER`, which covers the
 * account pair - two needles that cannot alias are two independent assertions.
 */
const UNRESOLVABLE_HOST = 'slatwall-database.invalid';

/** Every variable `src/lib/config.ts` requires with no default, with a MIS-CASED dialect spelling. */
const BASE_ENVIRONMENT: EnvironmentSource = Object.freeze({
  DB_HOST: UNRESOLVABLE_HOST,
  DB_USER: UNUSED_PLACEHOLDER,
  DB_PASSWORD: UNUSED_PLACEHOLDER,
  // F48: this fixture paired a non-loopback host with `disabled` transport, which the configuration
  // contract refuses outright - cleartext is admitted only for a provable loopback destination, in
  // every environment. The fixture describes a suite that never connects, so the mode is raised to
  // the recommended `verify-identity`, which a NAMED host satisfies and which needs no trust
  // anchor. F47 is the other half of that bargain: `verify-identity` refuses an IP literal, so the
  // host above is a name rather than the loopback address.
  DB_TLS_MODE: 'verify-identity',
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

/**
 * Every relationship column of `SwSetting`, in the order the subject selects them.
 *
 * The list IS the predicate: a global probe requires every one of them to be NULL
 * [model/service/SettingService.cfc:L768-L870], so a row must carry all seventeen columns for the
 * index to classify it correctly. Omitting one would make the row look scoped and hide it.
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
 * probe can match - see `GENERAL_SETTINGS_SQL`. A case that wants a SCOPED row spreads a column over
 * the result, which is how the "not global" case below builds one.
 */
function generalSettingRow(settingName: string, settingValue: string | null): SqlRow {
  const row: Record<string, unknown> = { settingName, settingValue };

  for (const columnName of SETTING_RELATIONSHIP_COLUMN_NAMES) {
    row[columnName] = null;
  }

  return row;
}

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
 * Narrow a caught `Error` to the one refusal class this module DOES export.
 *
 * ★ WHY THIS ONE IS `instanceof`-ABLE WHEN THE FIVE IN THE NOTE ABOVE ARE NOT.
 * `OrderViewDocumentDataError` is exported deliberately, because a primary adapter has to RECOGNISE
 * it to report a caller-shaped 400 with its member paths - that recognition is the whole point of the
 * class, and a class nobody can name cannot be recognised. So here the strongest assertion is
 * available and it is used: the type, and then its `fields` exactly.
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
 * The no-echo assertions have to cover BOTH channels, because they fail differently: a published
 * `fields` entry reaches the response body, and the `Error` message reaches the log stream. Joining
 * the two means one `not.toContain` covers the pair, so a value that migrated from one to the other
 * would still be caught.
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
 * ★★ THIS EXISTS FOR ONE ASSERTION, AND ITS SHAPE IS THE WHOLE ARGUMENT. F17's decisive sentence
 * was "Serialization redaction does not prevent direct access", so a case proving the leak is
 * closed cannot prove it by SERIALIZING the root - serialization is the very check the finding
 * says is insufficient. It has to WALK, reaching members a `toJSON` would have replaced and
 * members no `toJSON` covers at all.
 *
 * Functions are descended into as well as objects, because own enumerable properties hung off a
 * function are reachable exactly like object members. What the walk CANNOT see is a variable
 * captured in a closure - and that asymmetry is the point of the fix rather than a limitation of
 * the helper: `graph.config` is now reachable only from inside `createCompositionRoot`'s closure,
 * which is precisely why no walk of the published root finds it.
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

    // Narrowed once into a keyed view. `Object.keys` accepts the `object | Function` the guards
    // above leave, so asserting at the call would be the redundant kind; the indexed READ is what
    // needs the view, and one named const serves both without repeating it.
    const members = value as Record<string, unknown>;

    for (const key of Object.keys(members)) {
      try {
        walk(members[key]);
      } catch {
        // The lazy `valueRounder` forward refuses to answer until its binding closes, and a
        // member that throws on read is not a member that hands a credential to a caller.
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
 * needs to assert that a name is ABSENT. Searching the serialized text for an absent name is unsound
 * in both directions: `ratesRetrievedAt` is a substring of the surviving `ratesRetrievedAtConfigured`,
 * so a text search reports a withdrawn key as still present; and a key whose value happens to be
 * `undefined` disappears from `JSON.stringify` output entirely, so a text search reports a published
 * key as withdrawn. Walking keys is exact in both cases.
 *
 * Breadth-first with each level sorted, rather than one flat sorted list, so the assertion reads in the
 * order a reviewer thinks about the shape: the top-level members first, then everything nested below
 * them. The visited set makes the walk safe against cycles, exactly as in `deepValues`.
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

// ---------------------------------------------------------------------------
// ★★ THERE IS NO `raisedBy` HELPER ANY MORE, AND ITS OWN DOCUMENTATION IS WHY.
//
// It read, verbatim: "The `Error` a synchronous call raises. `createRequestScope` is
// deliberately SYNCHRONOUS - every read it needs was already performed once at tier one -
// so its refusals are thrown, not rejected, and they need their own helper."
//
// The premise was false, and the composition root's own defect proved it. One read had NOT
// been performed at tier one: the address-zone locations that gate every shipping-related
// promotion are per-request state, and because the `AddressZoneEvaluator` port is
// SYNCHRONOUS by contract the read cannot happen inside the predicate either - so it
// happens in `createRequestScope`, which is therefore `async`. Every refusal that helper
// existed for is consequently a REJECTION now, and `rejectionOf` above already covered
// that case. Keeping a second helper whose stated reason for existing had been withdrawn
// would have been the more misleading of the two options.
//
// What the five converted cases assert has not changed: an unlisted product-feed host is
// still refused with `UntrustedFeedHostError`, still before any `GoogleFeedService` is
// constructed, and still without a single feed statement being issued.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared construction.
//
// Every case builds its OWN executor. `RecordingExecutor` is a ledger, and a
// shared one would let an earlier case's statements satisfy a later case's count
// assertion - which is the exact vacuity this suite exists to avoid.
// ---------------------------------------------------------------------------

/**
 * A recording executor already seeded with the TWO statements tier 1 issues.
 *
 * The settings read is seeded with NO ROWS by default, which is the ordinary case: an installation
 * with no `SwSetting` override resolves every key from its declared default, exactly as the legacy
 * did [model/service/SettingService.cfc:L481-L486]. A case that needs a configured value seeds its
 * own rows over this one.
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
 * it. The adapter handed back beside the scope IS THE VERY SAME INSTANCE the composed operation
 * closes over, narrowed to the port - so spying here intercepts exactly the call it makes.
 *
 * ★★ QUOTE-THEN-REVISE, AND THE SENTENCE THAT CHANGED IS THE ONE F18 WAS ABOUT. The paragraph above
 * used to read "`RequestScope.priceGroupRepository` publishes THE VERY SAME INSTANCE the composed
 * operation closes over". It did, and that was the finding: publishing the adapter on the
 * request-tier surface to make it observable also made `savePriceGroup` callable by anything
 * holding a scope. The instance identity this reader depends on is preserved - it is what
 * `createInspectableRequestScope` guarantees by performing one assembly - while the request-tier
 * route to it is gone.
 *
 * The narrowing is an `instanceof` test rather than an assertion, so if composition ever assembles
 * something else this fails loudly at the seam instead of silently mocking a method nobody calls.
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
 * intent's spelling need not match the stored row's. A key that matches nothing is ABSENT from the
 * map rather than `undefined`-valued, which is the contract the refusal path depends on.
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

function bootWith(
  executor: RecordingExecutor,
  environment: EnvironmentSource = BASE_ENVIRONMENT,
): Promise<CompositionRoot> {
  return bootstrapCompositionRoot({ executor, environment });
}

/**
 * The adapters each opened scope was assembled with, remembered by the SUITE.
 *
 * ★★★ THIS SIDE TABLE IS FINDING F18 MADE VISIBLE, AND IT IS DELIBERATELY NOT A WORKAROUND FOR IT.
 * `RequestScope` used to publish all six raw repositories, so a case that needed the concrete
 * `MySqlPriceGroupRepository` simply read `scope.priceGroupRepository` - and so could any future
 * handler, which is what the finding objected to. The adapters now come back beside the scope from
 * `createInspectableRequestScope`, once per assembly, and this table is where the suite keeps its
 * own record of the pairing.
 *
 * That the suite has to keep a record at all is the property under test: there is no route FROM a
 * scope TO an adapter, which is exactly why a lookup table is the only way to express "the adapter
 * this scope was built with". A `WeakMap` rather than a `Map` so a scope a case has finished with
 * is collectable, and keyed by the scope object so two scopes opened in one case cannot be
 * confused for one another - which the per-request-identity cases depend on.
 */
const adaptersByScope = new WeakMap<RequestScope, RequestScopeAdapters>();

/**
 * Opens a scope through the inspection hook and remembers the adapters it was assembled with.
 *
 * ONE assembly, so the adapters recorded here are BY IDENTITY the ones the returned scope's
 * services and composed pricing operation closed over. Opening the scope with
 * `createRequestScope` and the adapters with a second call would produce two graphs, and a spy
 * installed on the second graph's adapter would mock a method the first graph's operation never
 * calls - passing for the wrong reason. See the hook's own documentation, which rules that out for
 * the same reason.
 */
async function openScopeWithAdapters(
  root: CompositionRoot,
  input?: RequestScopeInput,
): Promise<RequestScope> {
  const opened = await root.createInspectableRequestScope(input);

  adaptersByScope.set(opened.scope, opened.adapters);

  return opened.scope;
}

/** The adapters `scope` was assembled with, narrowed. */
function adaptersOf(scope: RequestScope): RequestScopeAdapters {
  return requirePresent(
    adaptersByScope.get(scope),
    'a scope opened through openScopeWithAdapters; a scope from createRequestScope has no ' +
      'recorded adapters, because nothing on it leads to one',
  );
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
  it('publishes exactly the six module-scope members and nothing else', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // The published surface is asserted as a SET, not member by member, so that
    // a member silently added or dropped fails here rather than passing quietly.
    //
    // ★★ THE FIRST ELEMENT WAS `'config'` UNTIL F17. This case is why the set form was chosen and
    // it is the case that earned its keep: the member was RENAMED and narrowed, not removed, and a
    // member-by-member assertion would have gone on passing on the four it still names while
    // saying nothing about the fifth. The fifth is now a redacted projection rather than the live
    // `AppConfig`.
    //
    // ★★ AND THERE ARE SIX MEMBERS RATHER THAN FIVE, WHICH IS F18'S HALF OF THE CHANGE. F18
    // withdrew the six raw repositories from `RequestScope`, and its remedy sanctioned "a separate
    // test assembly hook if required" - `createInspectableRequestScope`, which performs one
    // assembly and returns the scope beside the adapters it was built with. Growing the TIER-ONE
    // surface by one named member in order to shrink the REQUEST-TIER surface by six raw
    // repositories is the trade the finding asked for: request-tier code is handed a scope, not
    // this root.
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

    // BASE_ENVIRONMENT spells it `mySql`. `resolveDatabaseDialect` matches
    // without regard to case and then normalizes to the canonical spelling
    // [config/configORM.cfm:L1-L15 is the source of the roster], so BOTH the
    // diagnostic member and the republished `dialect` member read `MySQL`.
    //
    // ★ THE FIRST TWO ASSERTIONS READ `root.diagnostics` WHERE THEY ONCE READ `root.config`.
    // The claim is unchanged - two members, one value, normalized once - and only the surface
    // moved. `dialect` is one of the four facts the redacted projection deliberately keeps.
    expect(root.diagnostics.dialect).toBe('MySQL');
    expect(root.dialect).toBe('MySQL');
    expect(root.dialect).toBe(root.diagnostics.dialect);
  });

  it('★★ PUBLISHES NEITHER THE DEFAULTED SCHEMA NAME NOR THE DEFAULTED PORT', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // ★★ QUOTE-THEN-REVISE, TWICE OVER. This case first read `root.config.database` and asserted
    // the two non-secret defaults came through. F17 moved it to `root.diagnostics.database` and it
    // went on asserting them, on the ground quoted in its own note - the two defaults are visible
    // "because those two are what make a misconfiguration diagnosable".
    //
    // ⚠ THAT GROUND WAS BORROWED FROM `src/repositories/mysql/connection.ts`, WHICH NOW SAYS THE
    // OPPOSITE: it withdrew the port and the database name from its pool-created log line and named
    // them "reconnaissance" together. `src/lib/logger.ts` redacts a context key called `port` for
    // the same reason, and a sibling case in that suite pins it. So this case is inverted rather
    // than deleted: what it asserts now is that the defaults the environment contract supplies are
    // resolved and USED without being published back out.
    //
    // The defaults themselves are still pinned - `Slatwall` and `3306` - in
    // `tests/unit/lib/config.test.ts`, against the configuration object that legitimately carries
    // them. Their absence HERE is what this case is for.
    expect(Object.keys(root.diagnostics)).not.toContain('database');
    expect(JSON.stringify(root.diagnostics)).not.toContain('Slatwall');
    expect(JSON.stringify(root.diagnostics)).not.toContain('3306');
    expect(deepValues(root).filter((value) => String(value) === 'Slatwall')).toStrictEqual([]);
    expect(deepValues(root).filter((value) => String(value) === '3306')).toStrictEqual([]);
  });

  it('★★ REDUCES THE DIAGNOSTIC SURFACE TO CLOSED ENUMERATIONS, A BOOLEAN AND TWO COUNTS', async () => {
    // ★★★ THE LEAST-PRIVILEGE SHAPE, ASSERTED AS A SET SO A MEMBER CANNOT CREEP BACK. Code review
    // raised the published diagnostics as MINOR / Security - Least Privilege: the exported record
    // "exposes database/port, all pool limits, feed allow-list, and complete rate table to every
    // root consumer", and asked for it to be reduced "to fixed booleans/classifiers needed by
    // actual handlers". No handler in this tree reads `root.diagnostics` at all, so the reduction
    // costs no caller anything.
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
    // `development`, because `BASE_ENVIRONMENT` omits `NODE_ENV` and that is the documented default.
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

    // ★ AND EVERY WITHDRAWN FACT IS ABSENT AT EVERY DEPTH, not merely absent from the member it used
    // to sit on. A root that dropped `pool` and republished `connectionLimit` beside `dialect` would
    // satisfy the key-set assertions above. The check walks keys rather than searching the serialized
    // text so that `ratesRetrievedAt` can be named as withdrawn without the surviving
    // `ratesRetrievedAtConfigured` matching it as a substring.
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
    // rates arrive. Both answers must distinguish "configured" from "empty" WITHOUT enumerating,
    // so this case supplies one of each and asserts the arithmetic rather than the contents.
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

    // ★ AND NOT ONE OF THE FIVE SUPPLIED VALUES IS READABLE THROUGH THE COUNT. This is the half of
    // the reduction that a count alone would not prove: a member could carry both a length and the
    // list it was taken from.
    const surface = JSON.stringify(root.diagnostics);
    for (const supplied of ['shop.example.com', 'feeds.example.com', '1.0850', '0.8400']) {
      expect(surface).not.toContain(supplied);
    }
  });

  it('reports an unconfigured deployment as two zeroes rather than as absent members', async () => {
    // `0` and `false` are meaningful readings, not missing data: both keys are optional, an empty
    // allow-list means this deployment serves no feed, and an empty rate table means every
    // non-pivot conversion passes through. A surface that omitted the members when unset would make
    // "unconfigured" indistinguishable from "member not implemented".
    const executor = makeExecutor();

    const root = await bootWith(executor);

    expect(root.diagnostics.feed.allowedHostCount).toBe(0);
    expect(root.diagnostics.currency.referenceRateCount).toBe(0);
    expect(root.diagnostics.currency.ratesRetrievedAtConfigured).toBe(false);
  });

  it('★★★ PUBLISHES NO DATABASE CREDENTIAL, HOST OR ACCOUNT ANYWHERE ON THE ROOT', async () => {
    // ★★★ THE INVERSION OF `expect(root.config.database.host).toBe(...)`, AND THE CASE F17 ASKED
    // FOR. The finding's decisive sentence was "Serialization redaction does not prevent direct
    // access": `DatabaseConnectionConfig.toJSON()` has always replaced the credential, the host
    // and the account with a marker, and `root.config.database.password` has always read straight
    // past it. So the property under test is not "does the projection redact" - it did - but "is
    // the unredacted object reachable at all".
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // ★ THERE IS NO LONGER A `database` MEMBER TO READ MARKERS OUT OF, and that is a stronger
    // outcome than the three marker assertions this case used to make. `toJSON()` still replaces
    // all five of its fields - `tests/unit/lib/config.test.ts` pins that - but the projection is no
    // longer republished here at all, so the question "is the marker correct" does not arise on
    // this surface.
    expect(root.diagnostics).not.toHaveProperty('database');

    // ★★ AND NEITHER THE ACCOUNT THIS SUITE SUPPLIED NOR THE HOST IS ANYWHERE ON THE ROOT,
    // serialized or walked. Asserting on the marker alone would pass for a root that ALSO published
    // the live config beside it, so the real assertion is the absence of the values across the whole
    // surface. `UNUSED_PLACEHOLDER` is what `BASE_ENVIRONMENT` sets `DB_USER` and `DB_PASSWORD`
    // from, which is what makes one search cover both; the host is searched for separately because
    // `DB_TLS_MODE=verify-identity` REQUIRES a NAMED host there (F47), so it carries its own
    // distinctive value and cannot share the placeholder.
    expect(JSON.stringify(root.diagnostics)).not.toContain(UNUSED_PLACEHOLDER);
    expect(JSON.stringify(root.diagnostics)).not.toContain(UNRESOLVABLE_HOST);
    expect(
      deepValues(root).filter((value) => String(value).includes(UNUSED_PLACEHOLDER)),
    ).toStrictEqual([]);
    expect(
      deepValues(root).filter((value) => String(value).includes(UNRESOLVABLE_HOST)),
    ).toStrictEqual([]);

    // ★ AND `config` IS GONE RATHER THAN RENAMED. A root that kept the member and added the
    // projection beside it would satisfy every assertion above.
    expect(Object.keys(root)).not.toContain('config');
  });

  it('reads SwCurrency and SwSetting exactly once each, eagerly, and issues no other statement', async () => {
    const executor = makeExecutor();

    await bootWith(executor);

    // EAGERLY: the count is taken before any request scope exists, so the read
    // cannot have been triggered by request-time work.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    // ★ THE SECOND EAGER READ. `setting()` is SYNCHRONOUS and returns a non-optional string, so
    // every configured value must exist before the provider reaches the domain - see
    // `GENERAL_SETTINGS_SQL`. One read for all seven names, whatever the request goes on to do.
    expect(executor.countOf(GENERAL_SETTINGS_SQL)).toBe(1);
    expect(executor.calls).toHaveLength(2);
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

  // -------------------------------------------------------------------------
  // ★★★ THE CONFIGURED VALUES. `SwSetting` was never consulted for a general setting until this
  // revision, which code review recorded as a CRITICAL money defect: `skuCurrency` answered the
  // literal `'USD'` however the installation was configured, so a shop trading in another currency
  // had every price read out of the SKU's own base columns as though it were dollars.
  // -------------------------------------------------------------------------

  it('★★★ prefers a CONFIGURED SwSetting row over the declared default, for every key', async () => {
    // CFML parity [model/service/SettingService.cfc:L595-L608]: with no object in hand the
    // relationship-free probe IS the resolution, and its row wins over the seeded default
    // [L481-L486]. All seventeen relationship columns are NULL, which is what makes the row global.
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
    // ★ EMPTY IS NOT ABSENT. The legacy sets `foundValue = true` in the same breath as the
    // assignment [model/service/SettingService.cfc:L525-L527], so a row that blanks a setting
    // SUPPRESSES the default rather than falling through to it. For this key that is the difference
    // between a closed cascade gate [model/entity/Sku.cfc:L373] - every price accessor answering
    // nothing - and a fully priced catalog. A `||` fallback would silently reopen it.
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
    // `SKUCURRENCY` answered a request for `skuCurrency`. The names are bound folded and the index
    // is keyed folded, so both halves of that comparison are reproduced.
    const executor = makeExecutor(CURRENCY_ROWS, [generalSettingRow('SKUCURRENCY', 'JPY')]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuCurrency')).toBe('JPY');
  });

  it('★★ ignores a row that carries any relationship column, because such a row is not global', async () => {
    // CFML parity [model/service/SettingService.cfc:L768-L870]: the probe emits `AND <col> IS NULL`
    // for every non-participating column, so a row scoped to a product, a brand or an account is
    // INVISIBLE to a relationship-free lookup. Promoting one into the global answer would apply one
    // product's currency to the whole catalog.
    const executor = makeExecutor(CURRENCY_ROWS, [
      { ...generalSettingRow('skuCurrency', 'CHF'), productID: 'product-1' },
    ]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuCurrency')).toBe('USD');
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
    expect(executor.calls).toHaveLength(2);
    expect(executor.calls.map((recorded: RecordedStatement): string => recorded.sql)).toEqual([
      CURRENCY_RECORDS_SQL,
      GENERAL_SETTINGS_SQL,
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

  it('★★ publishes exactly the SEVENTEEN documented members, and NOT ONE RAW REPOSITORY', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();

    // Asserted as a set for the same reason the module-scope surface is: a
    // member quietly added or dropped must fail here.
    //
    // ★★ THIS CASE WAS CALLED "publishes exactly the nineteen documented members" AND ITS LIST
    // NAMED ALL SIX RAW REPOSITORIES - `optionRepository`, `priceGroupRepository`,
    // `productRepository`, `productTypeRepository`, `promotionRepository`, `skuRepository`. F18
    // established that publishing them let anything holding a scope reach seven durable mutations
    // without the services that own their invariants, including `saveProduct` without the
    // unique-URL-title resolution `ProductService.saveProduct` performs. Nineteen minus six is
    // thirteen, and the six are on the module-private `RequestGraph` now.
    //
    // ★★ THIRTEEN BECAME FOURTEEN WITH `entityLoaders`, WHICH IS THE OPPOSITE MOVE TO THE ONE
    // ABOVE RATHER THAN A PARTIAL REVERSAL OF IT. API review finding F3 established that a
    // boundary publishing NO way to turn an identifier into an entity forced
    // `priceResolutionHandler` to invent one - a `productName LIKE ?` catalog scan behind a
    // `{productName, skuCode}` selector, plus a silent substitution of the account's best price
    // group for the price group the operation's own name says the caller chooses. The member added
    // here is FIVE LOADS AND NOTHING ELSE, so it publishes strictly less than any one of the six
    // struck names did; the case below proves the loads reach no mutation.
    //
    // ★★ FOURTEEN BECAME FIFTEEN WITH `materializeOrderView`: a
    // code review found the deployed `applyPromotions` route had no successful wire path, because a
    // primary adapter cannot receive anything but JSON TEXT and nothing in the request tier turned
    // that text into entities. `materializeOrderView` is that member. It ADDS NO ROUTE TO AN
    // ADAPTER - it is a function, and the case below proves the walk still finds no adapter class.
    //
    // ★★ FIFTEEN BECAME SIXTEEN WITH `prepareAddressZoneEvaluation`. The address-zone
    // index is now deferred so catalog, SKU, price and feed scopes do not pay for an
    // unbounded read they cannot consult. The composed order-pricing operation prepares
    // it itself; this explicit member supports direct synchronous promotion queries.
    //
    // ★★ SIXTEEN BECAME SEVENTEEN WITH `feedCriteria` (F26). AAP 0.4.2 freezes the ported feed
    // method as `generateProductFeed(criteria: FeedCriteria)`, so the origin authority and the
    // request instant are the METHOD ARGUMENT rather than the port's constructor state - and this
    // tier is what must assemble them, because it alone holds the deployment-owned allow-list the
    // host is matched against and this request's single instant. The member PUBLISHES NO NEW
    // CAPABILITY: it is a two-member frozen data object, it reaches no adapter and no repository,
    // and it is `undefined` for every request that carried no feed host - which is the same
    // condition that leaves `productFeedPort` undefined, so the pair travels together. It replaces
    // the per-request port FACTORY the previous design forced onto the module-private graph, so the
    // composition root publishes strictly less machinery than before.
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
    // ★★★ THE GUARD THAT KEEPS F3's ANSWER FROM BECOMING F18's DEFECT AGAIN. The loads exist so a
    // handler can bind a service argument exactly; if a save or a delete ever appeared beside them, the
    // seven durable mutations withdrawn from this surface would be back under a new name.
    //
    // ★★ FIVE BECAME SEVEN, AND THE TWO ADDITIONS ARE THE OTHER HALF OF A CRITICAL FINDING'S FIX. A code
    // review found `catalogQueryHandler` publishing three reads and withholding eleven AAP-0.4.2-mapped
    // Product/Brand/Option actions, on the stated ground that "the composition root publishes no entity
    // and no entity loader" - a premise this very object contradicted. Nine of those eleven bind a
    // product or a product type, which the five loads above already covered; the remaining two bind a
    // BRAND and a LIST OF OPTIONS, and neither had a load. `getBrandByBrandID` is the only load in this
    // object with no repository behind it - `BrandService` declares one method
    // [model/service/BrandService.cfc:L67] and everything else it had arrived by framework inheritance -
    // so the statement is hosted here and projects the same `BRAND_COLUMNS` the brand WRITE projects,
    // which is what keeps the read set and the write set from drifting. `getOptionsByOptionIDList`
    // forwards the module-private option loader the two add-option process methods already used.
    //
    // BOTH ARE READS AND NEITHER WIDENS THE PORT INVENTORY. AAP 0.3.1 freezes that inventory at thirteen
    // port files and no fourteenth appears: the brand load is a statement in this file and the option
    // load forwards an existing loader, so the addition is to THIS object alone.
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
    // `Sku.getPriceByCurrencyCode` takes [model/entity/Sku.cfc:L269-L273], and for the same
    // reason: substituting a fabricated entity would price something that does not exist.
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
    // The option load answers a MAP rather than an entity, so its miss is an ABSENT KEY rather than an
    // `undefined` return - the caller walks its own list and reports one outcome for the request.
    await expect(scope.entityLoaders.getOptionsByOptionIDList(['no-such-option'])).resolves.toEqual(
      new Map(),
    );
  });

  it('★★★ hydrates a brand from the ONE read in this file with no repository behind it', async () => {
    // ★★★ THE LOAD A CRITICAL FINDING ADDED, AND THE ONLY ENTITY LOAD HOSTED HERE RATHER THAN
    // FORWARDED. `BrandService.cfc` declares exactly one method [model/service/BrandService.cfc:L67] and
    // every read it appeared to have arrived by framework inheritance, so there is no brand repository
    // and no brand port - AAP 0.3.1 freezes the inventory at thirteen and no fourteenth was added. The
    // statement therefore lives beside the brand WRITES that already lived here, projecting the same
    // `BRAND_COLUMNS`, and this case is the only place `hydrateBrand` is exercised at all.
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
    // The two `bit` columns arrive as CFML's `1`/`0`, which is what the entity's own boolean input union
    // accepts, and both renderings are read rather than only the truthy one.
    expect(brand?.getActiveFlag()).toBe(true);
    expect(brand?.getPublishedFlag()).toBe(false);
    // ★ A SAVED ROW, NOT A NEW ONE. Every mutation this load serves names an EXISTING row, so a hydrated
    // brand must answer `false` to `isNew()` - the property the routed transport policy rests on.
    expect(brand?.isNew()).toBe(false);
    // AND THE IDENTIFIER IS BOUND, NOT INTERPOLATED, which is what preserves `cfqueryparam` semantics.
    const brandRead = executor.calls.find((call) => call.sql.includes('FROM SwBrand'));
    expect(brandRead?.params).toEqual(['brand-0001']);
    expect(brandRead?.sql).toContain('WHERE brandID = ?');
    expect(executor.mutationCalls).toEqual([]);
  });

  it('★★ forwards the option-list load verbatim, and issues NO statement for an empty request', async () => {
    // The sibling addition, and it is a FORWARD rather than an implementation: the module-private option
    // loader `SkuService`'s option resolution already used owns the de-duplication, the case folding, the
    // empty-request short circuit and the fetch shape. Reproducing any of them beside it would be a
    // second copy that could drift, so what this case pins is that nothing was reproduced - an empty
    // request costs no statement, and a populated one keys the map by the FOLDED identifier.
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

    // A populated request DOES issue one, and it binds one placeholder per element rather than
    // interpolating a list into the text. The identifiers are bound VERBATIM - the fold happens where
    // the MAP is keyed, because it is MySQL's own collation that folds the comparison, exactly as
    // `cfqueryparam` left it to.
    const loaded = await scope.entityLoaders.getOptionsByOptionIDList(['option-A', 'option-B']);
    const optionRead = executor.calls
      .slice(before)
      .find((call) => call.sql.includes('FROM SwOption swOption'));

    expect(optionRead?.params).toEqual(['option-A', 'option-B']);
    expect(optionRead?.sql).toContain('IN (?, ?)');
    // ★ THE MAP IS KEYED BY THE FOLDED IDENTIFIER, which is what lets a caller that named
    // `option-A` find the row the database matched under any casing. Only `option-A` was seeded, so
    // `option-B` is ABSENT rather than present-and-undefined - the miss posture the load documents.
    expect([...loaded.keys()]).toEqual(['option-a']);
    expect(loaded.get('option-a')?.getOptionID()).toBe('option-A');
    expect(loaded.has('option-b')).toBe(false);
    expect(executor.mutationCalls).toEqual([]);
  });

  it('★★★ resolves a SKU whose identifier is cased differently, as CFML identifiers are', async () => {
    // ★★★ INVERTED DEFECT-PINNING CASE. `getSkuBySkuIdentity` narrowed the rows a product read
    // returned with `candidate.getSkuID() === identity.skuID`, and a code review recorded the strict
    // comparison as a CFML-parity defect: identifiers are case-insensitive in the legacy - the engine
    // folds case in `eq` and in every struct key, and the DAO binds the value into a `cfqueryparam`
    // that MySQL's own collation folds again - so a differently-cased but VALID identifier answered
    // `skuNotFound`, and five of the price route's operations lost their SKU to a casing difference.
    //
    // This is the loader four handler operations reach for a SKU, so the case drives it directly.
    const root = await bootWith(makeExecutor());
    const scope = await openScopeWithAdapters(root);
    const adapters = adaptersOf(scope);

    const product = makeProductFixture({ idPrefix: 'folded-', productID: 'prod-Folded-0001' });
    const sku = makeSkuFixture({ idPrefix: 'folded-', skuID: 'sku-Folded-0001', product });

    // The product read is answered as the DATABASE would answer it - folding the key - because
    // `SwProduct.productID` is compared by MySQL under its own collation, not in this process. What
    // this case is about is the narrowing that happens AFTER the rows arrive.
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

    // AND A GENUINELY DIFFERENT IDENTIFIER IS STILL A MISS, so the folding widened the comparison
    // rather than defeating it.
    await expect(
      scope.entityLoaders.getSkuBySkuIdentity({
        productID: 'prod-Folded-0001',
        skuID: 'sku-folded-0002',
      }),
    ).resolves.toBeUndefined();
  });

  it('★★★ EXPOSES NO ROUTE FROM A SCOPE TO A REPOSITORY, UNDER ANY NAME', async () => {
    // ★★★ THE INVERSION OF THE SIX NAMES STRUCK FROM THE SET ABOVE. Asserting the shortened set
    // alone would pass for a scope that had merely RENAMED the members - `repositories`, `adapters`,
    // `daos` - which is the failure the F17 sibling case guards against on the root and the same
    // one applies here. So this walks what the scope actually carries and looks for the adapter
    // CLASSES, whatever member name might lead to them.
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope();

    // The six ports resolve to these six adapter classes and nothing else, so finding an instance
    // of any of them anywhere on the published surface means a route exists.
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

    // ★ AND THE HOOK STILL REACHES THEM, so this case is asserting a narrowed surface rather than a
    // broken assembly. A scope with no adapters at all would satisfy the assertion above.
    const inspectable = await root.createInspectableRequestScope();

    expect(inspectable.adapters.priceGroupRepository).toBeInstanceOf(MySqlPriceGroupRepository);
    expect(inspectable.adapters.productRepository).toBeInstanceOf(MysqlProductRepository);
  });

  it('hands every request its OWN service and repository instances', async () => {
    const root = await bootWith(makeExecutor());

    // ★ OPENED THROUGH THE INSPECTION HOOK because the repository half of this case's claim can no
    // longer be read off a scope. The claim itself is UNCHANGED and none of its eleven assertions
    // is dropped - which is why the hook exists rather than the three repository lines being
    // quietly deleted along with the members they read.
    const first = await openScopeWithAdapters(root);
    const second = await openScopeWithAdapters(root);

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
    expect(adaptersOf(second).priceGroupRepository).not.toBe(
      adaptersOf(first).priceGroupRepository,
    );
    expect(adaptersOf(second).skuRepository).not.toBe(adaptersOf(first).skuRepository);
    expect(adaptersOf(second).promotionRepository).not.toBe(adaptersOf(first).promotionRepository);
    expect(second.currencyConverter).not.toBe(first.currencyConverter);
  });

  it('★★ opening a scope issues NO statement of its own, however many scopes are opened', async () => {
    // The zone index must exist before a synchronous evaluator CONSULTS it, not
    // before that evaluator is CONSTRUCTED. Deferring the read restores pure scope
    // assembly while keeping the index per request.
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

    const scope = await root.createRequestScope();
    const scopeFromEmptyInput = await root.createRequestScope({});

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

    const scope = await root.createRequestScope();

    // `exactOptionalPropertyTypes` is on, so "absent" means the key is not
    // present at all rather than present-and-undefined. Both are asserted,
    // because only the second distinguishes the two.
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
    // [model/service/PriceGroupService.cfc:L262-L268] was reached from inside the
    // service; here it is a parameter the scope carries, which is transformation
    // rule T6 and also normalizes the legacy divergence between the two scope
    // accessors.
  });

  it('omits productFeedPort entirely unless a feed host is requested', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope({ accountID: ACCOUNT_ID, now: PINNED_INSTANT });

    // Undefined rather than a port that refuses on use: the feed capability is
    // simply not present on a scope that did not ask for it.
    expect(scope.productFeedPort).toBeUndefined();
  });

  it('publishes productFeedPort for a host on the allow-list, folding case and trimming', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const scope = await root.createRequestScope({
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
    const error = await rejectionOf(() =>
      root.createRequestScope({ feedHost: `https://${FEED_HOST}/feed/product` }),
    );

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('authorized-host list');
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
    // branches on the ground of the refusal, without parsing a sentence. The suite that pinned
    // this on the withdrawn mint asserted both members, so both are asserted here.
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
    // "refuses BEFORE constructing, so no instance holds a bad origin and no read is issued". The
    // property is the same one and it is now this root's: the check runs inside
    // `createProductFeedPort`, so a refused candidate yields no `GoogleFeedService` at all, and
    // because the port is built lazily per request nothing was read to find that out.
    const executor = makeExecutor();
    const root = await bootWith(executor, FEED_ENVIRONMENT);
    const statementsBefore = executor.calls.length;

    await expect(root.createRequestScope({ feedHost: 'attacker.example.net' })).rejects.toThrow(
      UntrustedFeedHostError,
    );

    // ★ QUOTE-THEN-REVISE TWICE, AND THE ORIGINAL CLAIM IS RESTORED.
    // This read `toHaveLength(statementsBefore)` under the claim "nothing was read to find that
    // out"; it was then revised to `statementsBefore + 1` because opening ANY scope materialized
    // that request's address-zone locations first. Finding F9 removed that unconditional read - a
    // feed request cannot reach zone state, so it no longer pays for it - which makes the ORIGINAL
    // assertion true again, for the original reason.
    //
    // What the case is FOR survives intact and is asserted directly rather than inferred from a
    // total: no FEED statement was issued, and no `GoogleFeedService` holds an unlisted origin
    // because none was constructed.
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
    // QUOTE-THEN-REVISE, TWICE. This case first booted with NO `FEED_ALLOWED_HOSTS` at all, annotated
    // "so the configured list is EMPTY - the deliberate default". It was then changed to set the
    // variable to a value naming no host, because "F40: an UNSET variable is no longer an empty
    // list". Both spellings mean the same thing again, so BOTH are asserted here.
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
    // ★★★ THIS CASE ASSERTED THE OPPOSITE AND WAS NAMED FOR IT: "serves the feed on the request
    // authority when NO allow-list is configured (F40)", reasoning that
    // "`integrationServices/google/controllers/feed.cfc:L54` declares `this.publicMethods="product"`
    // and the view renders `http://#CGI.HTTP_HOST#`, so the legacy served the feed for whatever
    // authority the request carried and had no allow-list to consult. A deployment that sets nothing
    // must therefore get a WORKING feed."
    //
    // Every legacy fact there is accurate. What it omits is that CFML read `CGI.HTTP_HOST` from a
    // request that had already reached a web server bound to the hostnames the deployment owns, so the
    // deployment constrained the value before the application saw it. An API Gateway proxy event
    // carries whatever `Host` a client writes, so reproducing the READ without a list does not
    // reproduce the legacy's provenance - it lets a caller choose the authority written into every
    // link of a merchant feed a third party fetches and follows. Code review recorded it as CWE-346,
    // Major. The deployment states its authorities; the request may only select among them.
    const executor = makeExecutor();
    const root = await bootWith(executor);

    const error = await rejectionOf(() => root.createRequestScope({ feedHost: FEED_HOST }));

    expect(error.name).toBe('UntrustedFeedHostError');

    // ★ THE REFUSAL IS ACTIONABLE, which is what answers the objection the previous version raised:
    // an operator is told the variable to set rather than left with a capability that silently does
    // nothing. The candidate itself is never reproduced.
    expect(error.message).toContain('FEED_ALLOWED_HOSTS');
    expect(error.message).not.toContain(FEED_HOST);
  });

  it('normalizes the admitted authority against the configured list, and still refuses a blank one', async () => {
    // Normalization is not membership, and both happen. The candidate is trimmed and case-folded, so
    // the origin the renderer composes is canonical and matches an entry written in any casing; and a
    // candidate with nothing in it is refused before the list is consulted at all, because there is
    // nothing to serve.
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

  it('resolves both construction cycles before returning, so no wiring fault is reachable', async () => {
    const root = await bootWith(makeExecutor());

    const scope = await root.createRequestScope({ now: PINNED_INSTANT });

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

    const scope = await root.createRequestScope();
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
// 3b. THE ADDRESS-ZONE EVALUATOR RESOLVES A ZONE IT WAS GIVEN ONLY THE ID OF.
//
// ★★★ WHY THIS BLOCK EXISTS. `CfmlAddressZoneEvaluator` used to test ONLY the location
// array its caller supplied, and no in-scope caller can supply one: `AddressZone` is not
// among the eighteen in-scope entities, so `PromotionQualifier.getShippingAddressZoneIDs()`
// [model/entity/PromotionQualifier.cfc:L75] and
// `PromotionReward.getShippingAddressZoneIDs()` [model/entity/PromotionReward.cfc:L77]
// publish OPAQUE IDENTIFIERS and all three call sites hand over an EMPTY list. Every
// configured zone therefore answered `false`, which silently disabled every
// address-zone restriction in the promotion engine and changed what customers are
// charged. `src/domain/ports/addressZoneEvaluator.ts` had already stated the obligation
// the implementation was missing, in terms, on `AddressZoneProjection`.
//
// THE ROUTE THROUGH THE PUBLISHED SURFACE IS `getQualifierQualificationDetails`, which is
// SYNCHRONOUS and takes both of its arguments directly - so these cases reach the real
// wired evaluator with no repository read to seed and no double substituted anywhere. It
// is the shipping-address-zone qualifier gate at [model/service/PromotionService.cfc:L684].
//
// WHY THE QUALIFIER MUST ALSO NAME A SHIPPING METHOD: LEGACY-DEFECT 11. The clause at
// [model/service/PromotionService.cfc:L703] re-tests `hasShippingMethod` instead of a zone
// condition, so a qualifier with zones and NO shipping methods excludes every fulfillment
// regardless of the zone verdict. That defect is preserved, so naming the fulfillment's own
// shipping method is what makes `addressZoneOk` the discriminator these cases observe -
// exactly as it would be in the legacy.
//
// COVERAGE HERE IS NET-NEW. No legacy test touches `AddressService`, and only three legacy
// test files reach the in-scope slice at all - `BrandTest.cfc`, `ProductTest.cfc` and an
// empty functional scaffold. None covers `isAddressInZone`.
// ===========================================================================

describe('the wired address-zone evaluator resolves locations by identifier', () => {
  const ZONE_ID = 'address-zone-west';

  /** One `SwAddressZoneLocation` join row, as the executor would answer it. */
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
   * these cases need is a MINIMAL qualifier: zones configured, the fulfillment's own shipping
   * method named so DEFECT 11 does not swallow the verdict, and no other gate engaged.
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

    // Direct promotion queries are synchronous, so callers prepare the deferred index
    // explicitly. The composed order-pricing operation performs this step itself.
    await scope.prepareAddressZoneEvaluation();

    // The single SHIPPING fulfillment. The pickup one carries no shipping method and no
    // address, so it is dropped rather than reasoned about.
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

    // THE WHOLE OF THE FINDING IN TWO LINES. The caller supplies `addressZoneLocations: []`
    // in both runs and the ONLY difference is whether `SwAddressZoneLocation` carries a row
    // for this zone. Before the repair both answered the empty list, because the evaluator
    // tested the supplied array and nothing else.
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
    // The third rule of the port's obligation: resolving by identifier must not turn "this
    // zone has no locations" into "this zone admits everything". A zone the index does not
    // carry is NOT entered - `addressInZone` starts false [model/service/AddressService.cfc:L58]
    // and the loop body never runs.
    const other = await openZoneScope([zoneLocationRow('some-other-zone', { stateCode: 'ZZ' })]);

    expect(other.evaluate()).toStrictEqual([]);
  });

  it('★★ folds case on the ZONE IDENTIFIER, on BOTH sides of the lookup', async () => {
    // The identifier travels verbatim from a link row on one side and verbatim from a
    // promotion link table on the other, so the two spellings are independent and CFML would
    // have compared them without regard to case either way. BOTH directions are asserted,
    // because folding only one side leaves the other broken and a single-direction case
    // cannot tell the difference: an index keyed on the raw value passes a test whose
    // qualifier happens to be lower-case, and a raw lookup passes a test whose row happens
    // to be.
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
    // wired evaluator: a NULL location column constrains nothing, a set one that disagrees
    // rejects that location outright.
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
    // match [model/service/AddressService.cfc:L75-L78]. A single non-matching location must
    // not veto the zone.
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

    // NO PARAMETER, because the zone identifiers are discovered mid-algorithm inside a
    // synchronous predicate; binding a key set would mean guessing it, and guessing low is
    // the failure this read exists to repair. `params` is `undefined` rather than `[]`
    // because the reader calls `execute(sql)` with one argument.
    expect(recorded.params).toBeUndefined();

    // An INNER JOIN, deliberately: a LEFT JOIN would answer an orphaned link row as a
    // location constraining NO field, and a location that constrains nothing matches EVERY
    // address - so one orphan row would admit everybody into that zone.
    expect(recorded.sql).toContain('INNER JOIN SwAddress location');
    expect(recorded.sql).not.toContain('LEFT JOIN');
    expect(recorded.sql).not.toContain('WHERE');
    expect(recorded.sql).not.toContain('ORDER BY');
  });

  it('★★ materializes the index PER REQUEST, so a warm container cannot serve a stale zone', async () => {
    // Zone membership decides a discount. An administrator who removes a zone location must
    // not keep seeing the promotion apply, which is why this read is tier 2 and the evaluator
    // is no longer a module-scope adapter.
    const executor = makeExecutor().seed(ADDRESS_ZONE_LOCATIONS_SQL, []);
    const root = await bootWith(executor);

    const first = await root.createRequestScope();
    const second = await root.createRequestScope();

    await first.prepareAddressZoneEvaluation();
    await second.prepareAddressZoneEvaluation();

    expect(executor.countOf(ADDRESS_ZONE_LOCATIONS_SQL)).toBe(2);
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
// JUDGMENT CALL - WHY SPIES ARE LEGITIMATE HERE. ONE assembly produces the very
// `priceGroupService`, `promotionService` and `priceGroupRepository` instances
// that the composed closure captured, so `vi.spyOn` on any of the three
// substitutes the collaborator the subject actually calls. No mocking library is
// added - `vi` is vitest itself - and the suite-level `afterEach` restores every
// spy. The alternative, a hand-written double, cannot be injected at all:
// `CompositionOverrides` exposes an executor, an environment and a rate table,
// and deliberately no service seam.
//
// ★ TWO OF THE THREE ARE PUBLISHED ON THE SCOPE AND THE THIRD IS NOT, WHICH IS WHY
// `openScope` BELOW GOES THROUGH `createInspectableRequestScope`. This paragraph
// used to open "`createRequestScope` publishes the very ... `priceGroupRepository`
// instances". Finding F18 withdrew the six raw repositories from `RequestScope`,
// so the adapter now arrives beside the scope from a single assembly rather than
// on it. The identity these cases rely on is the same identity; only the route is.
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
      // ★ THROUGH THE INSPECTION HOOK, because `armSetLoader` needs the concrete adapter this
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

    // The composed operation performs the deferred zone read before either pass,
    // even when both passes are substituted. Three statements in total: the two eager tier-one
    // reads plus the one deferred zone read.
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

  it('★★★ issues NO account read for an accountless order, which is why the account is bound first', async () => {
    // ★★★ THE MEASUREMENT BEHIND A CRITICAL AUTHORIZATION FIX, TAKEN AGAINST THE REAL
    // PASS RATHER THAN ARGUED. An order that names no account reaches
    // [model/service/PriceGroupService.cfc:L365]'s `isNull(order.getAccount())` arm,
    // so `SwAccountPriceGroup` is never queried at all - and by the same absence every
    // per-account promotion use limit [model/service/PromotionService.cfc:L1098] counts
    // the uses of nobody, which is no limit.
    //
    // That is CORRECT for a genuinely anonymous caller - it is the legacy logged-out arm
    // - and it was a BYPASS for an authenticated one, because the routed surface let a
    // caller reach it by omitting one member. The fix is upstream of this pass, in two
    // places, and this case is the reason both exist: `materializeOrderView` binds the
    // scope's established account into the hydrated view, and
    // `promotionApplicationHandler` binds it into an injected one. Neither changes this
    // pass, and this pass is what makes the omission consequential.
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

    // AND THE SAME ORDER, BOUND TO AN ACCOUNT, DOES ISSUE THE READ - so the binding is
    // provably what restores it rather than merely relabelling the view.
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
// ===========================================================================
// 4b. WIRE-DOCUMENT HYDRATION.
//
// ★★★ WHY THIS BLOCK EXISTS AT ALL, STATED AS THE FINDING THAT PRODUCED IT.
//
// A code review found the deployed `applyPromotions` route had NO successful wire
// path: `export const handler = createPromotionApplicationHandler()` passes no
// arguments, so admission defaulted to the structural probe that requires a
// method-bearing `Money`, `Sku` and `PriceGroup` - and API Gateway can only ever
// deliver `event.body` as JSON TEXT. Every real request was refused as
// `unsupportedBodyShape`.
//
// The remedy put the hydration HERE rather than in the handler, because rule T3 of
// the plan gives the repository tier sole authority to turn identifiers into
// entities, and because a primary adapter that constructed a `Sku` would be a
// primary adapter deciding what the catalogue says. So
// `RequestScope.materializeOrderView` is a member of the request tier, and this is
// its suite.
//
// ★ WHAT THESE CASES OWN, AND WHAT THEY DELIBERATELY DO NOT. They own: which reads
// the hydrator issues and how many, WHOSE instance ends up on the view, what it
// REFUSES rather than defaults, and that no total is recomputed on the way in. They
// do not own the ADMISSION schema that guards it - member paths, decimal grammar,
// bounds and the account trust boundary all belong to
// `tests/unit/handlers/promotionApplicationHandler.test.ts`, which drives them
// through the deployed entrypoint.
// ===========================================================================

describe('RequestScope.materializeOrderView', () => {
  /** The identifiers the documents below name, all invented and all non-sensitive. */
  const DOCUMENT_PRODUCT_ID = 'prod-wire-0001';
  /** The account an IDENTIFIED request establishes, for the two account-binding cases. */
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
   * ★ THE TWO SPIES ARE INSTALLED ON THE ADAPTERS THIS SCOPE WAS ASSEMBLED WITH, reached through
   * `adaptersOf` for the reason that helper documents: nothing on a scope leads to an adapter any
   * more, so a spy installed on a second assembly would mock a method this scope's hydrator never
   * calls. Recording the calls rather than counting them lets a case assert WHICH product was asked
   * for and with what, not merely how often.
   */
  async function openHydration(
    options: {
      /** The products the repository can answer, keyed by the identifier the document names. */
      readonly products?: ReadonlyMap<string, Product>;
      /** The SKUs each product carries, keyed by product identifier. */
      readonly skusByProductID?: ReadonlyMap<string, readonly Sku[]>;
      /** The price groups the set loader can resolve. */
      readonly priceGroups?: readonly PriceGroup[];
      /**
       * The scope input the hydration runs under.
       *
       * Absent means an ANONYMOUS request, which is what every case that is not about the account
       * uses. A case supplies one to prove that the hydration binds the account the request
       * established when the document states none - see the two account cases below.
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

    // ★★★ THE SPIES TARGET THE SET-BASED READS, WHICH IS WHAT THE HYDRATION CALLS NOW (F5).
    // QUOTE-THEN-REVISE: they used to be installed on `getProductByProductID` and `getProductSkus`,
    // the SINGULAR reads, because the hydration called each of them once per product - which code
    // review recorded as at least 2P graph-load paths for P products. Both are now one call for the
    // whole distinct set. THE RECORDED FACTS ARE DELIBERATELY UNCHANGED - `productReads` is still the
    // identifiers asked for, in order, and `skuReads` is still one entry per product with the
    // `fetchOptions` flag it was read under - so every case below asserts exactly what it asserted
    // before, and a regression to per-product reads would show up as repeated entries rather than as a
    // silently different shape.
    //
    // A spy installed on the SINGULAR reads would now record nothing at all, so these two lines are
    // also what keeps the batching honest: if the hydration ever went back to looping, these counters
    // would report one entry per call and the "ONCE, however many items name it" cases would fail.
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
      // TWO parameters, and the second IS `fetchOptions`: the set-based twin carries the singular
      // read's own flag [src/domain/ports/skuRepository.ts], which is the legacy's eager-fetch
      // decision surfaced [model/dao/SkuDAO.cfc:L152-L163]. There is no `sorted` parameter on either.
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

  /** One product the repository can answer, at the identifier a document names. */
  function documentProduct(productID: string): Product {
    return makeProductFixture({ idPrefix: `${productID}-`, productID });
  }

  /** One SKU hanging off `product`, at the identifier a document names. */
  function documentSku(skuID: string, product: Product): Sku {
    return makeSkuFixture({ idPrefix: `${skuID}-`, skuID, product });
  }

  /** One order-item document, every member stated. */
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

  /** One whole order document, every member stated, defaults hydratable. */
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
    // ★ BY IDENTITY: the SKU on the view is the repository's own instance, not a reconstruction. That
    // is what lets the engine walk `sku.getProduct().getProductType().getProductTypeIDPath()`.
    expect(item.sku).toBe(sku);
    expect(item.sku.getProduct()).toBe(product);
    // Every monetary member is a MINTED `Money`, carrying the document's own amount.
    expect(item.price.toDecimalString()).toBe('19.99');
    // `toFixed2` here because `Money` drops the trailing zero from `'64.50'`, exactly as CFML does
    // when it stringifies a number [model/service/RoundingRuleService.cfc:L101-L102]. Same amount,
    // and the presentation form is what a caller reads.
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

    // TWO items, ONE product read and ONE SKU read. A ten-line order selling ten variants of one
    // product must not degenerate into an N+1 walk, which is why the hydrator keys by folded
    // identifier rather than reading per item.
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
      // The repository answers the SPELLING THE DOCUMENT USED, which is the upper-cased one here.
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

    // ONE INSTANCE, because the reward-eligibility comparison at
    // [model/service/PromotionService.cfc:L241] compares price-group identity - two equal-but-distinct
    // instances would answer differently for two items that named the same group.
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
    // state, the L252 correction term measures the gap between the two extended pairs, and
    // recomputing either side here would be this tier deciding a number the order already decided.
    const view = await scope.materializeOrderView(orderDocument({ subtotal: '1.23' }));

    expect(view.subtotal.toDecimalString()).toBe('1.23');
    expect(view.subtotalAfterItemDiscounts.toDecimalString()).toBe('59.97');
    // `toFixed2` rather than `toDecimalString` for this one: `Money` normalises `'0.00'` to `'0'`,
    // which is the SAME AMOUNT - CFML drops trailing zeros when it stringifies a number too
    // [model/service/RoundingRuleService.cfc:L101-L102] - so the presentation form is what pins the
    // value here without asserting a spelling the value object never promised.
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

    // ★ NO DISCOUNT and A ZERO DISCOUNT ARE DIFFERENT FACTS. The column is nullable
    // [model/entity/PromotionApplied.cfc:L51], so `null` becomes `undefined` and a stated `'0.00'`
    // becomes a `Money` that IS zero - substituting one for the other would invent a discount row.
    const [absent, zero] = view.appliedPromotions;
    expect(absent?.discountAmount).toBeUndefined();
    expect(absent?.promotion).toBeUndefined();
    expect(zero?.discountAmount?.toFixed2()).toBe('0.00');
    expect(zero?.promotion?.promotionID).toBe('promo-0001');
    // A stated-absent account is absent, not an empty string: the price-group pass reads it to decide
    // whether to resolve any price groups at all.
    expect(view.accountID).toBeUndefined();

    const fulfillment = requirePresent(view.orderFulfillments[0], 'the shipping fulfillment');
    const address: ShippingAddressView = requirePresent(fulfillment.address, 'its address');
    // The zone evaluator SKIPS an absent comparison member
    // [model/service/AddressService.cfc:L63, L66, L69, L72], so an absent member must stay absent -
    // widening it into a wildcard or narrowing it into a match would both change which zone matches.
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

    // [model/service/PromotionService.cfc:L701] tests `isNull(orderFulfillment.getShippingMethod())`
    // explicitly, so "no shipping method" has to be expressible - and it is a state, not a gap.
    const fulfillment = requirePresent(view.orderFulfillments[0], 'the pickup fulfillment');
    expect(fulfillment.shippingMethod).toBeUndefined();
    expect(fulfillment.address).toBeUndefined();
  });

  // ★★★ THE THREE CASES BELOW WERE INVERTED BY A RUNTIME FINDING, AND WHAT CHANGED IS WORTH STATING.
  // Each used to assert `raised.name === 'CompositionDataError'` AND that the failing IDENTIFIER
  // appeared in the message. QA testing found the consequence of the first half: `CompositionDataError`
  // is unexported and lands on the mapper's generic arm, so a document naming an unknown product
  // answered `500 unrecognized` with no `fields` - a caller-fixable mistake reported as a service
  // fault, inflating the 5xx signal. The refusal is now an exported, caller-shaped
  // `OrderViewDocumentDataError` carrying MEMBER PATHS, and the second half of each old assertion is
  // inverted with it: the identifier must now be ABSENT from everything publishable, because a path
  // says which member to fix without repeating what was sent. Both halves are asserted, so neither the
  // classification nor the no-echo rule can regress unnoticed.

  it('REFUSES an order item whose product cannot be loaded, naming the member path', async () => {
    const { scope, skuReads } = await openHydration({ products: new Map<string, Product>() });

    const raised = await rejectionOf(() => scope.materializeOrderView(orderDocument()));

    // Refused, never skipped: an item whose product cannot be loaded is an item whose product-type
    // ancestry, brand and option list are unknown - and those are exactly what reward and qualifier
    // membership is decided by, so pricing it would be pricing against an unknown catalogue.
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    expect(requireDocumentDataError(raised).fields).toEqual([
      {
        path: 'order.orderItems.0.productID',
        message: 'does not name a product this request can price',
      },
    ]);
    // NOTHING SUBMITTED IS ECHOED - not in the published fields and not in the message a log line
    // would carry either.
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_PRODUCT_ID);
    expect(publishedTextOf(raised)).not.toContain(DOCUMENT_ITEM_ID);
    // And it refused BEFORE reaching for SKUs.
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

    // The two identifiers disagree about the catalogue. BOTH MEMBERS are named - which of the pair is
    // wrong is exactly what the caller has to decide - and neither value is repeated back.
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

    // ★ DROPPING IT WOULD CHANGE THE MONEY, not merely lose a reference: an item with no applied
    // price group takes the FIRST arm of the [model/service/PromotionService.cfc:L241] discriminator,
    // which computes the discount from a different base price.
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
      // A grouped numeral, which `Money` refuses. The primary adapter's schema refuses it first in
      // production - this asserts the hydrator does not accept one either, so the guarantee does not
      // depend on which caller reached it.
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

    // Only the FIRST scope's repository is armed. Both spies target the SET-BASED reads, because those
    // are what the hydration calls (F5) - see the note in `openHydration`.
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

    // ★ PER-REQUEST ISOLATION IS THE PROPERTY. The first scope hydrated; the second refused, because
    // it holds its OWN adapters and inherits nothing the first read. On a warm container that is what
    // stops one invocation's catalogue - and therefore one customer's price - reaching another's.
    expect(itemAt(view, 0).sku).toBe(sku);
    expect(secondProductReads).toEqual([DOCUMENT_PRODUCT_ID]);
    expect(raised).toBeInstanceOf(OrderViewDocumentDataError);
    // Two DISTINCT scopes, which is what "one per request" means: the root hands back a new one each
    // time rather than a memoized singleton, so nothing either hydrated can be reached from the other.
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

    // Hydration is a READ. It applies no rate, computes no discount and rounds nothing - the passes
    // are the composed operation's business, and running one here would price an order twice.
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

    // TWO distinct products means two reads, and each item's SKU comes from ITS OWN product - which
    // is what makes the "sku is not carried by product" refusal above a real check rather than a
    // formality.
    expect(productReads).toEqual([DOCUMENT_PRODUCT_ID, DOCUMENT_SECOND_PRODUCT_ID]);
    expect(skuReads).toHaveLength(2);
    expect(itemAt(view, 0).sku).toBe(firstSku);
    expect(itemAt(view, 1).sku).toBe(secondSku);
  });

  it('★★★ REFUSES a CROSSED pair - product A with a SKU that belongs to product B', async () => {
    // ★★★ THE CASE A CODE REVIEW ASKED FOR, AND THE ONE THE TWO CASES ABOVE COULD NOT CATCH. SKU
    // resolution used to pool every named product's SKUs into ONE map keyed by SKU identifier alone,
    // so the per-item check answered "is this SKU carried by ANY product in this document" instead of
    // "by the product named on THIS item". With one product in the document the two questions coincide,
    // which is why the single-product refusal case above passed while the defect stood; with TWO they
    // diverge, and a crossed pair walked straight through (CWE-20).
    //
    // WHAT WOULD FOLLOW FROM ADMITTING IT, stated because "malformed input accepted" understates it:
    // the item would be priced against a SKU whose product-type ancestry, brand and option membership
    // belong to a product the caller never named on that line - and those are precisely the gates
    // reward and qualifier membership are decided by [model/service/PromotionService.cfc:L864-L865,
    // L808-L818]. A discount would be computed against the wrong catalogue.
    const first = documentProduct(DOCUMENT_PRODUCT_ID);
    const second = documentProduct(DOCUMENT_SECOND_PRODUCT_ID);
    const firstSku = documentSku(DOCUMENT_SKU_ID, first);
    const secondSku = documentSku(DOCUMENT_SECOND_SKU_ID, second);
    const { scope } = await openHydration({
      products: new Map([
        [DOCUMENT_PRODUCT_ID, first],
        [DOCUMENT_SECOND_PRODUCT_ID, second],
      ]),
      // Each product carries exactly its OWN sku. Neither carries the other's, which is what makes the
      // document below crossed rather than merely unusual.
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
              // ★ THE CROSSING: the SECOND product named with the FIRST product's SKU. Both
              // identifiers exist, and both are named elsewhere in this very document - the pooled map
              // is exactly what used to make that enough.
              skuID: DOCUMENT_SKU_ID,
            }),
          ],
        }),
      ),
    );

    // The same refusal the single-product mismatch earns, indexed to the offending item: BOTH members
    // named, because which half of the pair is wrong is the caller's decision, and NEITHER value
    // repeated back.
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
    // The complement of the crossed case, and it is not a duplicate of the two-product case above: it
    // states the SKUs in the opposite order to the products so the pair lookup cannot be passing by
    // positional coincidence. A guard that refused this would have broken every legitimate multi-product
    // order, which is the regression the crossed-pair fix must not introduce.
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

  it('★★★ reads TWO products in ONE call and their SKUs in ONE call, not one call each (F5)', async () => {
    // ★★★ THE FINDING, ASSERTED AT THE COUNT OF CALLS RATHER THAN THE COUNT OF IDENTIFIERS. Every case
    // above pins WHICH products and SKUs were asked for; none of them could distinguish "one call
    // carrying two identifiers" from "two calls carrying one each", and that distinction IS the
    // finding: code review recorded at least 2P graph-load paths for P products, because the hydration
    // looped `getProductByProductID` and then `getProductSkus`. Each of those calls is a graph read, a
    // SKU read, an option read and a sale-price resolution, so a ten-product order paid for up to
    // forty statements to hydrate ten products.
    //
    // The loader underneath ALWAYS took a list - `materializeProducts` binds an `IN` list and has since
    // it was written - so nothing about the fetch shape changes here; what changed is that this file
    // stopped calling it one identifier at a time.
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

    // ONE call each, whatever the product count.
    expect(productLoads).toHaveBeenCalledTimes(1);
    expect(skuLoads).toHaveBeenCalledTimes(1);

    // AND BOTH IDENTIFIERS TRAVELLED IN THAT ONE CALL, so this is not passing because a product was
    // dropped. The SKU call receives the PRODUCTS - it needs each one's base type to choose its
    // eager-fetch join [model/dao/SkuDAO.cfc:L150-L168] - and the eager flag is still TRUE.
    expect(productLoads).toHaveBeenCalledWith([DOCUMENT_PRODUCT_ID, DOCUMENT_SECOND_PRODUCT_ID]);
    expect(skuLoads).toHaveBeenCalledWith([first, second], true);

    // And the view is the same view the per-product loop produced: each item's SKU by identity, from
    // its own product.
    expect(itemAt(view, 0).sku).toBe(firstSku);
    expect(itemAt(view, 1).sku).toBe(secondSku);
  });

  // ★★★ THE ACCOUNT IS THE ONE MEMBER THIS HYDRATION DOES NOT TAKE VERBATIM FROM THE DOCUMENT.
  //
  // A code review recorded the previous behaviour - `document.accountID ?? undefined` - as one half
  // of a CRITICAL authorization defect. `updateOrderAmountsWithPriceGroups` resolves account price
  // groups from the view's account [model/service/PriceGroupService.cfc:L365] and every per-account
  // promotion use limit is measured against it [model/service/PromotionService.cfc:L1098], so an
  // AUTHENTICATED request whose document simply omitted the member priced an ACCOUNTLESS order: no
  // `SwAccountPriceGroup` read at all, and a per-account use cap measured against nobody, which is
  // no cap. The scope's own established account - derived by the primary adapter from the API
  // Gateway authorizer, never from a body - now fills that absence here.
  //
  // The division with the primary adapter is exact and both halves are tested: ADOPT an absence
  // here, REFUSE a disagreement there (`tests/unit/handlers/promotionApplicationHandler.test.ts`,
  // 'the account trust boundary'). This tier does not refuse, because a mismatch is a caller error
  // and a `CompositionDataError` could only be reported as a server-shaped failure.
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
    // The same identity the pricing context carries, so the two cannot disagree within one request.
    expect(scope.currentAccountContext.accountID).toBe(REQUEST_ACCOUNT_ID);
  });

  it('keeps the account the document states, and stays accountless for an anonymous request', async () => {
    const product = documentProduct(DOCUMENT_PRODUCT_ID);
    const sku = documentSku(DOCUMENT_SKU_ID, product);
    const catalogue = {
      products: new Map([[DOCUMENT_PRODUCT_ID, product]]),
      skusByProductID: new Map([[DOCUMENT_PRODUCT_ID, [sku]]]),
    };

    // A STATED account WINS. Whether it is the caller's to state is the primary adapter's judgment,
    // and substituting the scope's over it here would hide a disagreement the adapter must refuse.
    const identified = await openHydration({
      ...catalogue,
      scopeInput: { accountID: REQUEST_ACCOUNT_ID },
    });
    const stated = await identified.scope.materializeOrderView(
      orderDocument({ accountID: 'acct-stated-by-document' }),
    );

    expect(stated.accountID).toBe('acct-stated-by-document');

    // AND THE LOGGED-OUT ARM SURVIVES. An anonymous request establishes no account, so an
    // accountless document still hydrates accountless - which is the legacy `else` arm at
    // [model/service/PriceGroupService.cfc:L265-L266] and must stay reachable.
    const anonymous = await openHydration(catalogue);
    const accountless = await anonymous.scope.materializeOrderView(
      orderDocument({ accountID: null }),
    );

    expect(accountless.accountID).toBeUndefined();
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
   * QUOTE-THEN-REVISE - THE REACH-THROUGH THIS BLOCK DOCUMENTED IS GONE.
   *
   * A helper named `stubProcessEnvironmentForDialectFragments` used to stand here,
   * populating five `DB_*` variables in `process.env` before the case below could
   * run, under this rationale: "The sale-price statement is dialect-parameterized …
   * and the fragment builder resolves that dialect by calling
   * `resolveConfiguredDialect()`, which reads `appConfig.load()` and therefore the
   * PROCESS environment. It does not read the `environment` this suite hands to
   * `bootstrapCompositionRoot`, and it does not read the dialect the composed root
   * already resolved and published. So the process environment has to be populated
   * for this one case, and stating that plainly is the point: … the difference marks
   * exactly where the composition root's configuration stops being the single source
   * of it."
   *
   * The comment was accurate about the code and the behaviour it described was a
   * MAJOR defect - QA testing recorded it as such, because the same read made 19
   * cases in the per-SKU feed cascade below fail on a bare checkout, and left the
   * product feed, this sale-price surface and sorted-SKU retrieval unreachable under
   * the only composition a committed suite may use.
   *
   * THE STUB IS GONE BECAUSE THE READ IS GONE. The dialect is now an ARGUMENT that
   * `MysqlPromotionRepository` and `MysqlSkuRepository` supply from their own
   * `STATEMENT_DIALECT` constants, each checked by `assertMySqlDialect` at module
   * load, so composing the statement needs no configuration and no credential and
   * the composition root's configuration never stops being the single source of it.
   * EVERY case in this file - with no exception left to declare - therefore proves
   * its behaviour with `process.env` untouched, and the delegate below is the
   * end-to-end evidence: it reaches the promotion service, the repository and the
   * injected executor with an empty environment.
   */

  it('forwards to the wired promotion service, which reaches the injected executor', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = await root.createRequestScope();

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
    const scope = await root.createRequestScope();
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
  // A NAMED host, because `DB_TLS_MODE` below is `verify-identity` and `src/lib/config.ts` refuses
  // that mode against an IP literal (F47) - a certificate binds to names, so an address would
  // silently reduce the mode to a chain-only check. `.invalid` never resolves [RFC 2606] and
  // nothing here connects.
  DB_HOST: 'slatwall-database.invalid',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'unit-test-password',
  // F48: this fixture paired a non-loopback host with `disabled` transport, which the configuration
  // contract refuses outright - cleartext is admitted only for a provable loopback destination, in
  // every environment. The fixture describes a suite that never connects, so the mode is raised to
  // the recommended `verify-identity`, which the NAMED host above satisfies and which needs no
  // trust anchor.
  DB_TLS_MODE: 'verify-identity',
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

  /**
   * Every read, with its bound values.
   *
   * ★ WHY `statements` IS NOT ENOUGH ANY MORE. It records only the SQL text, which serves the
   * many cases that just count or match statements. The URL-title family read cannot be
   * checked that way: all three of its literals are fixed, and the interesting facts - which
   * slug was asked about and what `LIKE` pattern was built from it - live entirely in the
   * parameters. `statements` is kept untouched so no existing case changes.
   */
  readonly reads: RecordedStatement[] = [];

  /**
   * @param answer - Rows to answer each read with, from the statement and its bound values.
   * @param affectedRows - What every write reports back.
   *
   * ★ WHY THE ROW COUNT IS NOW SETTABLE, DEFAULTING TO THE OLD FIXED `0`. Most cases here
   * read a write's BOUND VALUES and never its result, so `0` served them and still does -
   * the default keeps every existing call site behaving exactly as before. But the two
   * framework write collaborators the composition root builds refuse a write whose count is
   * not `1`, transcribing Hibernate's own `StaleObjectStateException` on a zero-match flush.
   * A case that means to drive one of those to completion has to be able to say the row
   * matched, and forcing it to say so is better than having the writers skip the check.
   *
   * ★ AND THAT IS NO LONGER ONLY THE FRAMEWORK COLLABORATORS. The five MySQL adapters' UPDATE
   * paths now refuse a zero-count mutation for the same reason: the pool runs with mysql2's
   * default `FOUND_ROWS` client flag, so `affectedRows` on an UPDATE reports rows MATCHED
   * rather than rows CHANGED, and a `0` therefore means the row the caller believes it holds
   * is gone. Any case here that drives an adapter's update to completion - rather than
   * asserting the refusal - must pass `1`.
   *
   * ★ AND WHY `answer` NOW RECEIVES THE PARAMETERS TOO. A double that models a column rather
   * than a fixed answer has to see what was asked. Widening the callback is backwards
   * compatible - a one-parameter function is assignable to a two-parameter type - so every
   * existing `(sql) => …` call site is unchanged.
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
   * How many real UNITS OF WORK were begun - outermost `transaction` calls only.
   *
   * ★ RECORDED BECAUSE ATOMICITY IS OTHERWISE INVISIBLE FROM OUTSIDE (F3). A double that merely
   * ran the callback could not distinguish "one unit of work carrying three writes" from "three
   * units of work carrying one each" - the `mutations` log looks identical either way, and the
   * difference is exactly what a partial-failure defect turns on. Additive: no existing case reads
   * these, so none changes.
   *
   * ★★ WHY THIS COUNTS OUTERMOST CALLS ONLY, WHICH IS NOT WHAT IT FIRST COUNTED. The first version
   * incremented on every call and read `5` for a four-SKU repricing wrapped in one transaction,
   * because each adapter write wraps its own statements too. That number was an artefact of the
   * double, not of the code under test: the REAL executor JOINS rather than nests - documented at
   * `src/repositories/mysql/connection.ts` - so an inner `transaction` call issues no `BEGIN` and
   * runs `work` inline on the outer connection, and the true unit count was always one. Counting
   * every call would have made this metric report a defect that does not exist while being unable
   * to report the one that did.
   */
  transactionsOpened = 0;

  /**
   * Every `transaction` call, joins included.
   *
   * Kept alongside {@link transactionsOpened} so a case can prove that joining actually HAPPENED -
   * more calls than units begun - rather than inferring it from a single number that would read the
   * same way if the inner adapters had stopped wrapping their writes.
   */
  transactionCalls = 0;

  /** The deepest `transaction` call nesting reached - `1` when nothing joined. */
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
      // The SAME executor is handed to the callback, matching the real one's documented JOINING
      // behaviour: MySQL has no nested transactions, so an inner `transaction` call participates
      // in the outer one rather than opening a second.
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
  /** Pairs with `rates`: when the overridden table was retrieved. Unvalidated, by design. */
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
      scope = await (await makeRoot()).createRequestScope();
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

      // ★ `root.config` UNTIL F17, THEN `root.diagnostics.feed.allowedHosts` UNTIL THE
      // LEAST-PRIVILEGE REDUCTION. The published member is now a COUNT: the list is deployment
      // topology, and "how many hosts loaded" is what a diagnostic surface was ever needed for.
      //
      // The claim this case makes - the allow-list comes from configuration - is not weakened by
      // that, because the count alone would be satisfied by a list read from anywhere. It is the two
      // cases immediately below that pin the CONTENT, and they pin it behaviourally, through the only
      // consumer that matters: the configured host mints a feed port and any other host is refused.
      // That is a stronger proof of provenance than reading the list back out of a diagnostic.
      expect(root.diagnostics.feed.allowedHostCount).toBe(1);
      expect(JSON.stringify(root.diagnostics)).not.toContain(ALLOWED_FEED_HOST);
    });

    it('mints a feed port for a host that IS on the deployment allow-list', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      const scope = await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });

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

        await root.createRequestScope({ feedHost: 'attacker.example.invalid' });
      }).rejects.toBeInstanceOf(UntrustedFeedHostError);
    });

    it('refuses every host against an EXPLICITLY empty allow-list, publishing no feed at all', () => {
      // QUOTE-THEN-REVISE, TWICE. This booted with no `FEED_ALLOWED_HOSTS` and called that "the
      // intended default rather than a degraded mode"; it was then changed to set the variable empty,
      // because "F40 reversed which state is the default: UNSET is now no policy at all and serves the
      // request's authority". Unset and empty mean the same thing again - no authority is authorized -
      // so this asserts the explicit spelling and the case below asserts the default one. The variable
      // stays OPTIONAL either way, which is what keeps every feed-less deployment starting.
      return expect(async () => {
        const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: '' } });

        await root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });
      }).rejects.toBeInstanceOf(UntrustedFeedHostError);
    });

    it('★★★ publishes no feed when the deployment configured no list, rather than admitting the request authority', async () => {
      // ★★★ THIS ASSERTED THE OPPOSITE - "admits the request authority when the deployment configured
      // no list (F40)" - which made a caller-authored `Host` the DEFAULT origin of a merchant feed.
      // Code review recorded it as CWE-346, Major. The full argument, including why the legacy's
      // `CGI.HTTP_HOST` read is not reproducible as-is on API Gateway, is at the `createRequestScope`
      // case of the same name earlier in this file; this is the composition-root-level pin of it.
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

  // -------------------------------------------------------------------------
  // The FROZEN legacy feed origin reaches the document (S-09, declined)
  //
  // ★★ THIS BLOCK EXISTS BECAUSE MUTATION TESTING FOUND ITS ABSENCE, and that reason
  // survives the reversal intact. The renderer suite proves the renderer emits `http://`
  // and the service suite proves the service forwards only the host, but NOTHING proved
  // the COMPOSITION ROOT's own wiring - and this is the only wiring that ships. When the
  // scheme was briefly configurable, replacing `graph.config.feed.scheme` here with a
  // hardcoded `'http'` left all 5,168 tests passing; the mirror hazard now is a root that
  // reaches for a scheme that no longer exists, or one that grows an `https` upgrade of its
  // own. These cases fail either way.
  //
  // WHAT CHANGED: the earlier version of this block asserted that a configured
  // `FEED_URL_SCHEME` reached the document, accepting finding S-09 (MEDIUM, CWE-319). That
  // acceptance is reversed - AAP 0.1.1 and 0.8.1 freeze the product-feed contract and AAP
  // 0.6.7 admits no fourth divergence - so the cases are inverted rather than deleted.
  //
  // A zero-row feed is deliberately enough to assert this: a feed with no items is still a
  // complete document carrying the channel `<link>`, which is one of the five sites the
  // legacy built from `http://#CGI.HTTP_HOST#`
  // [integrationServices/google/views/feed/product.cfm:L14]. So the origin is observable
  // without fabricating catalog rows, and the case stays about wiring.
  // -------------------------------------------------------------------------

  describe('the frozen legacy feed origin reaches the document (S-09 declined)', () => {
    /** A root whose feed host is allowed, under the given environment. */
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
      // [.../product.cfm:L14], and the composed graph must reproduce it without being asked.
      const { document } = await feedPortUnder({});

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
      await expect(document).resolves.not.toContain(`<link>https://${ALLOWED_FEED_HOST}</link>`);
    });

    it('★★ publishes http URLs even when a LEFTOVER FEED_URL_SCHEME=https is set', async () => {
      // The realistic upgrade hazard: an environment still carrying the removed variable from
      // the accepted-S-09 revision. It must be inert here as it is in the config module - not a
      // start-up refusal, which would block the upgrade, and not honoured, which would leave the
      // divergence in place through a variable nobody reads on purpose.
      const { document } = await feedPortUnder({ FEED_URL_SCHEME: 'https' });

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
      await expect(document).resolves.not.toContain(`<link>https://${ALLOWED_FEED_HOST}</link>`);
    });

    it('★★ publishes http URLs in PRODUCTION, which the accepted revision refused to start under', async () => {
      // The sharpest case of the reversal. Under the accepted revision, `NODE_ENV=production`
      // plus `http` was a start-up refusal; the frozen contract means production publishes the
      // legacy origin and starts normally. `DB_TLS_MODE` is raised to a valid production value so
      // this cannot pass or fail on the transport rule, which DOES still refuse in production.
      const { document } = await feedPortUnder({
        NODE_ENV: 'production',
        DB_TLS_MODE: 'verify-identity',
      });

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
    });

    it('writes the SAME origin at both channel sites, so no half of the wiring is stale', async () => {
      // Two of the five legacy sites, built from one composed origin
      // [.../product.cfm:L14, L15]. A root that composed the origin twice, differently, would
      // pass a single-site assertion and fail this one.
      const { document } = await feedPortUnder({});
      const resolved = await document;

      expect(resolved).toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
      expect(resolved).toContain(
        `<description>Google Product Feed for http://${ALLOWED_FEED_HOST}</description>`,
      );
    });

    it('leaves the xmlns:g namespace URI alone, as it always did', async () => {
      // `http://base.google.com/ns/1.0` is an XML namespace NAME compared byte for byte by
      // consumers, never dereferenced. It was the one thing an https sweep would have broken
      // while the scheme was configurable, and it is asserted here for the same reason still.
      const { document } = await feedPortUnder({});

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
        // ★ `root.config` UNTIL F17, THEN THE WHOLE TABLE UNTIL THE LEAST-PRIVILEGE REDUCTION. The
        // published members are now a count and a boolean. As with the feed allow-list above, that
        // costs this case nothing: the rate's VALUE is proved below by converting with it, which is
        // the only thing a rate table is for and cannot be satisfied by a table read back out of a
        // diagnostic.
        expect(root.diagnostics.currency.referenceRateCount).toBe(1);
        expect(root.diagnostics.currency.ratesRetrievedAtConfigured).toBe(true);
        expect(JSON.stringify(root.diagnostics)).not.toContain('1.0850');

        // EUR is the implicit pivot and is deliberately absent from the table, so a
        // EUR-to-USD conversion exercises the multiply-out half against a configured
        // rate: 100 EUR * 1.0850.
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

    it('★★★ REPORTS A FUTURE RETRIEVAL INSTANT INSTEAD OF CALLING THE TABLE CURRENT', async () => {
      // ★★★ A REPORTING INVERSION, NOT A PARSE ERROR, AND THE CASE THAT PROVES THE ARM. The age
      // is a subtraction, so an instant ahead of this host's clock makes it NEGATIVE - and a
      // negative age is LESS THAN the one-day window, so before this arm existed the table sailed
      // past the staleness branch and was announced as "resolved from configuration". The one
      // value collected to make a stale table visible instead guaranteed it looked current.
      //
      // ★ IT IS DRIVEN THROUGH THE OVERRIDE SEAM BECAUSE THAT IS THE ROUTE THAT CAN STILL REACH
      // IT. `src/lib/config.ts` now refuses a future `ECB_RATES_RETRIEVED_AT` outright, so a
      // fully configured table cannot get here; `CompositionOverrides.europeanCentralBankRates`
      // supplies a table DIRECTLY and bypasses that resolver, while the instant still comes from
      // configuration - so the pairing is reachable and the arm is not dead code. A configured
      // instant one day ahead is used, which config would refuse on its own; here it arrives
      // beside an overridden table.
      const { lines } = captureLogLines();
      const overriddenTable = Object.freeze({ USD: '1.0850' });

      // THE CONTROL HALF FIRST, so the assertion below is a difference in the INSTANT and not in
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

      // ★ TWO DAYS AND ONE SECOND AHEAD, NOT EXACTLY ONE DAY, AND THE MARGIN IS THE POINT. The
      // instant was `Date.now() + 86_400_000`, which made the assertion below race on a SINGLE
      // MILLISECOND: the age is `reportInstant - retrievedAt`, so any time elapsed between this
      // line and the report pushed it from exactly -86_400_000 ms to slightly more, and truncation
      // toward zero then yielded `-0` instead of `-1`. A whole-day margin plus one second of slack
      // makes the truncated value deterministic while asserting exactly the same property.
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
      // And it did NOT also claim the table was resolved normally.
      expect(
        lines.filter((line) => line.message.includes('resolved from configuration')),
      ).toStrictEqual([]);
    });

    it('reports an OVERRIDDEN table with no paired instant as being of unknown age', async () => {
      // The arm whose own comment always claimed this was what it was for. It used not to be:
      // the CONFIGURED instant was reported whatever the table's provenance, so a composition
      // that overrode the table and configured an instant had one table's freshness reported for
      // another's rates. The instant now travels with the table it describes.
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
      // The observability half of S-20, and the reason the pass-through VALUE could
      // not change: `model/service/CurrencyService.cfc:L100-L101` returns the amount
      // unchanged when no conversion is possible, and step 3 of the SKU cascade
      // [model/entity/Sku.cfc:L416-L428] consumes that value as a price. What the fix
      // could change is whether the event is visible - and now it is.
      const { lines } = captureLogLines();
      // ★ A TABLE IS CONFIGURED, AND THE CASE NOW SAYS SO. It used to boot with NO rates at all,
      // which is a DIFFERENT legacy state: an absent table makes the legacy read an unassigned
      // variable and raise [model/service/CurrencyService.cfc:L104-L131], and the port now
      // reproduces that refusal - see the empty-table case below. The pass-through this case is
      // about is the OTHER state, [L100-L101]: a table that is present but does not quote one of
      // the two codes. `GBP` is deliberately absent from it.
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
      // The table quotes USD and NOT GBP, so the same-currency call under test is GBP-to-GBP: the
      // gate fails on a code that is not quotable, exactly as a cross-currency call would, and
      // there is no same-currency short-circuit to rescue it. Booting with no table at all takes the
      // SAME pass-through - the converter is a total function - which the case below pins.
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
      // ★★★ THIS CASE ASSERTED THE OPPOSITE, AND THE REVERSAL IS A REVIEW FINDING'S RESOLUTION.
      // It read "REFUSES a cross-currency conversion when NO rate table is available at all" and
      // pinned a `CurrencyRateTableUnavailableError`, on this reasoning, which is quoted rather than
      // deleted because the legacy reading in it is correct: the legacy actively fetched and
      // daily-refreshed the ECB table [model/service/CurrencyService.cfc:L102-L131], and read to its
      // end that function's `catch` swallows a failed fetch while the NEXT statement returns
      // `variables.europeanCentralBankRates`, which on a cold start was never assigned - CFML refuses
      // that at runtime. So the legacy engine does raise when it has no table.
      //
      // WHAT THAT REASONING DID NOT WEIGH IS THE CONTRACT THE PORT PUBLISHES.
      // `src/domain/ports/currencyConverter.ts` declares `convertCurrency` a TOTAL function -
      // "@returns the converted amount, or `amount` unchanged when no rate is available" - and
      // `src/handlers/priceResolutionHandler.ts` documents its `convertCurrency` operation as having
      // no error path on the strength of it. Rejecting one of the two unavailable-rate states made the
      // sole adapter disagree with both, and the rejection reached a routed operation as an
      // unrecognised throw that `errorMapper` reduced to a generic 500. Code review recorded the
      // caller/callee disagreement; the frozen contract is the total function, so the ADAPTER moved.
      //
      // THE MISCONFIGURATION IS STILL VISIBLE, which is what keeps this from being a silent
      // mispricing: every pass-through notifies the observer - asserted below - and the composition
      // root logs once at wiring time when it is handed an empty table.
      const { lines } = captureLogLines();
      const root = await makeRoot();
      const scope = await root.createRequestScope();

      const converted = await scope.currencyConverter.convertCurrency(
        Money.fromDecimalString('100.00'),
        toCurrencyCode('USD'),
        toCurrencyCode('GBP'),
      );

      // The amount is returned AS RECEIVED - not rounded, not scaled, not marked.
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
      // [model/service/CurrencyService.cfc:L87, L93], so the guard never fails and the pass-through
      // branch is never reached at all - the conversion is performed, by arithmetic that needs no
      // quote. A single-currency installation is therefore unaffected either way: step 3 of the
      // cascade [model/entity/Sku.cfc:L416-L428] only converts currencies that need converting.
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

  // -------------------------------------------------------------------------
  // The logging threshold this root hands to `src/lib/logger.ts`
  //
  // ★★ THE COMPOSITION ROOT IS THE SEAM BETWEEN CONFIGURATION AND LOGGING, AND THAT IS WHY THESE
  // CASES LIVE HERE RATHER THAN IN `tests/unit/lib/logger.test.ts`. `src/lib/config.ts` and
  // `src/lib/logger.ts` deliberately import nothing - configuration must be able to fail before
  // logging exists, and logging must be able to report that failure - so the resolved `LOG_LEVEL`
  // cannot travel between them directly. This module holds both and performs the handover, which
  // makes the handover this file's property to assert.
  //
  // ★ IT REPLACES A LOGGER-SIDE ARRANGEMENT THAT ECHOED THE REJECTED VALUE. The earlier report was
  // emitted by the logger and carried the raw token under `configuredLogLevel`, admitting anything
  // matching `[A-Za-z0-9_.-]{1,32}` verbatim and retaining it in a process-global set - the shape of
  // an access key or a short bearer token. The value is now discarded at resolution, so the only
  // strings these cases can observe are members of a closed classifier union.
  // -------------------------------------------------------------------------

  describe('the adopted logging threshold', () => {
    /**
     * The composition adopts a process-wide threshold, so it is restored after every case here for
     * the same reason `tests/unit/lib/logger.test.ts` restores it: `isolate: true` keeps it inside
     * this file, and this keeps it inside one case.
     */
    afterEach(() => {
      logger.adoptConfiguredThreshold(undefined);
    });

    /**
     * Emit one entry at `level` through the process-wide logger with NO pinned threshold, and report
     * whether it survived the filter. This is how the HANDOVER is observed: the composition adopts a
     * threshold into `src/lib/logger.ts`, and the only way to see that it landed is to emit against
     * it.
     */
    function survivesThreshold(level: 'debug' | 'info'): boolean {
      const lines: string[] = [];
      logger.withSink((line) => lines.push(line))[level]('threshold probe');
      return lines.length > 0;
    }

    it('★★★ ADOPTS THE CONFIGURED LEVEL, so a deployment can actually see debug lines', async () => {
      // The reason the handover exists at all. Nothing in the subtree reads `LOG_LEVEL` from the
      // environment any more, so without this adoption a deployment could set the variable and change
      // nothing whatsoever.
      const { lines } = captureLogLines();

      expect(survivesThreshold('debug')).toBe(false);

      await makeRoot({ env: { LOG_LEVEL: 'debug' } });

      expect(survivesThreshold('debug')).toBe(true);
      // And a correctly configured level is not announced. The suppression set is keyed by
      // CLASSIFIER, so this cannot be masked by another case having announced a coerced one - a build
      // that started announcing `configured` would key separately and would still emit here.
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
      // ★★★ THE THREE PROPERTIES OF THE REPLACEMENT REPORT, ASSERTED TOGETHER RATHER THAN IN THREE
      // CASES, BECAUSE THE SUPPRESSION MAKES THEM INSEPARABLE. Splitting them would leave the second
      // and third cases asserting an absence that the FIRST case's announcement had already
      // guaranteed - a vacuous pass dressed up as coverage. One case, three compositions, and every
      // assertion below fails if the behaviour regresses.
      //
      // The mistyped value is deliberately shaped like an access key. That shape is what the retired
      // logger-side report ADMITTED verbatim - it matched `[A-Za-z0-9_.-]{1,32}` - so it is the exact
      // input the disclosure half has to answer.
      const planted = 'AKIAPLANTEDNOTALEVEL9';
      const { lines } = captureLogLines();

      await makeRoot({ env: { LOG_LEVEL: planted } });

      const announcements = lines.filter((line) => line.message.includes('LOG_LEVEL'));

      // 1. IT ANNOUNCES, from a fixed classifier. Both context keys are in the logger's closed
      //    diagnostic allow-list, so neither is redacted, and both values are members of compile-time
      //    unions rather than operator-supplied text.
      expect(announcements).toHaveLength(1);
      expect(announcements[0]?.level).toBe('warn');
      expect(announcements[0]?.context).toStrictEqual({
        logThresholdSource: 'defaulted-unrecognized',
        thresholdInForce: 'info',
      });
      // The recognized vocabulary is named, so the report is actionable without a second lookup.
      expect(announcements[0]?.message).toContain('debug, info, warn, error');

      // 2. THE SERVICE STILL SERVES, at the default threshold. The coercion is the whole reason this
      //    key is resolved leniently: a threshold able to abort a cold start would leave a
      //    misconfigured service unable to explain itself.
      expect(lines.filter((line) => line.message.includes('Composition root wired'))).toHaveLength(
        1,
      );
      expect(survivesThreshold('info')).toBe(true);
      expect(survivesThreshold('debug')).toBe(false);

      // 3. NO PART OF THE REJECTED VALUE APPEARS ANYWHERE. Asserted over EVERY captured line rather
      //    than over the announcement alone, so an edit that threaded the raw token through some
      //    other line would fail here too.
      expect(JSON.stringify(lines)).not.toContain(planted);
      expect(JSON.stringify(lines)).not.toContain('AKIA');

      // 4. AND IT IS ONCE PER PROCESS, not once per composition. A suite builds many; a container
      //    builds one. Two further coerced compositions - with DIFFERENT values, so a per-value
      //    suppression would not catch them - add nothing.
      await makeRoot({ env: { LOG_LEVEL: 'verbose' } });
      await makeRoot({ env: { LOG_LEVEL: 'trace' } });

      expect(lines.filter((line) => line.message.includes('LOG_LEVEL'))).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // The URL-title next-suffix walk (S-19 discharged, F9 resolved)
  //
  // ★★★ THIS BLOCK WAS `the URL-title collision bound (S-19)` AND EVERY CASE IN IT HAS BEEN
  // INVERTED OR REPLACED, SO THE HISTORY IS RECORDED HERE RATHER THAN CASE BY CASE.
  //
  // Security finding S-19 objected that the generator "loops indefinitely and issues one serial
  // query per suffix", and the accepted remedy was a 100-attempt cap raising
  // `UrlTitleCollisionLimitError`. Code review then raised F9, MAJOR, against exactly that remedy:
  // the callers "require the next available suffix and the legacy loop continues until success",
  // and the required resolution was "a set-based/deterministic next-suffix implementation that
  // still succeeds for every valid state; do not expose a 101st-collision error."
  //
  // THE TWO FINDINGS OBJECT TO DIFFERENT THINGS, WHICH IS WHY BOTH CAN HOLD. S-19 is about ROUND
  // TRIPS; F9 is about REFUSING A VALID STATE. The generator now reads the slug family in ONE
  // statement and walks the legacy candidate sequence against that set, so the round-trip count is
  // 1 - stronger than the cap's "at most 101", and no longer a function of the data - while the
  // answer is the legacy's for every input. The cases below assert both halves.
  //
  // `alwaysCollidingExecutor` IS GONE, AND ITS ABSENCE IS ITSELF EVIDENCE. It answered
  // `[{ urlTitle: 'taken' }]` to every probe so the loop could never settle. No executor can do
  // that any more: the walk terminates on the SIZE of the set it read, so an executor that wanted
  // to lengthen the walk would have to volunteer more rows, and each row it volunteers is one more
  // candidate the walk skips rather than one more it retries.
  // -------------------------------------------------------------------------

  describe('the URL-title next-suffix walk (S-19, F9)', () => {
    /**
     * One bound value, folded, or `''` when it is anything but a string.
     *
     * `params` is `readonly unknown[]`, so a `String(...)` coercion would stringify an object as
     * `[object Object]` - which the lint rule that forbids it is right about. Narrowing instead
     * means a case that accidentally bound a non-string sees an empty slug and fails loudly rather
     * than matching something by coincidence.
     */
    function boundText(value: unknown): string {
      return typeof value === 'string' ? value.toLowerCase() : '';
    }

    /**
     * An executor that models a real `urlTitle` column instead of a fixed answer.
     *
     * It resolves the family read from its BOUND VALUES - the bare slug and the `slug-%` pattern -
     * so a case can state which titles are taken and let the subject work out the rest. That is
     * what makes the dense-family and gap-reuse cases meaningful: a stub keyed only on SQL text
     * could not distinguish `acme-2` from `acme-40`.
     *
     * ★★★ IT MATCHES CASE-INSENSITIVELY AND THEN ANSWERS THE ROW AS STORED, and getting that
     * distinction wrong once is why it is spelled out at this length. An earlier version of this
     * double folded the taken titles BEFORE answering, so the subject never received a mixed-case
     * row - and a mutation that deleted the subject's own `toLowerCase()` fold passed every case in
     * the block, INCLUDING the one named for that fold. The double was doing the subject's work and
     * therefore proving nothing.
     *
     * A double must reproduce the collation, not pre-apply the behaviour under test. MySQL under the
     * schema's case-insensitive default collation MATCHES a bound `'acme'` against a stored `'ACME'`
     * and then returns `'ACME'` - the stored bytes, not the folded comparison key. So matching folds
     * both sides here, while the answered row carries the title exactly as the case supplied it.
     * That is what leaves the subject's own fold load-bearing: drop it and `'ACME'` stops counting
     * as taken.
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

    /** The family statement, isolated from the brand writer's own uniqueness probe. */
    function familyReads(executor: StubExecutor): readonly RecordedStatement[] {
      return executor.reads.filter((read) => read.sql.includes('OR urlTitle LIKE ?'));
    }

    /**
     * Resolves a title through `saveBrand`, which is the caller AAP 0.4.1 gives the generator.
     *
     * The payload is handed back so a case can read the resolved title off it - the legacy route
     * [model/service/BrandService.cfc:L70] - and the brand is PERSISTED so the write path is an
     * update, whose bound values the write assertions read.
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
      // ★★★ THE INVERSION OF `★★ REFUSES rather than looping forever when every candidate
      // collides`, which asserted `rejects.toBeInstanceOf(UrlTitleCollisionLimitError)` and argued:
      // "The legacy loop is genuinely unbounded ... Under Lambda that is a correctness problem
      // rather than merely slow, which is what AAP 0.6.5 requires 'explicit batch limits' for."
      //
      // The AAP citation was right about the CONSTRUCT and wrong about the REMEDY. A batch limit
      // bounds work; it does not license answering a different question. Two hundred and fifty
      // taken titles is ordinary catalog data - a retailer with that many "T-Shirt" variants is not
      // an attacker - and the legacy resolved it. So does this, and the answer is exact.
      const taken = [
        'acme',
        ...Array.from({ length: 249 }, (_unused, index) => `acme-${String(index + 2)}`),
      ];
      const executor = tableWithTitles(taken);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      // 250 taken titles are `acme` and `acme-2` ... `acme-250`, so the first free candidate is
      // `acme-251` - a suffix the retired ceiling could not reach and would have refused at 101.
      expect(urlTitle).toBe('acme-251');
    });

    it('★★ issues EXACTLY ONE family statement, however large the family is', async () => {
      // ★★ THE INVERSION OF `issues a bounded number of probes, not an unbounded one`, which
      // asserted `expect(probes).toHaveLength(101)` and argued: "100 suffixed attempts plus the
      // unsuffixed candidate tried before the loop is 101 reads - a number a reviewer can multiply
      // out, which is why the bound is a COUNT rather than a wall-clock deadline."
      //
      // A reviewer can still multiply it out, and the number is now ONE. This is S-19's own resource
      // concern discharged more completely than its accepted remedy discharged it: 101 was a
      // ceiling on serial round trips, and 1 is a constant that does not move with the data at all.
      const executor = tableWithTitles([
        'acme',
        ...Array.from({ length: 299 }, (_unused, index) => `acme-${String(index + 2)}`),
      ]);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-301');
      expect(familyReads(executor)).toHaveLength(1);
    });

    it('walks candidates ASCENDING, so a gap is reused rather than skipped', async () => {
      // The legacy tested `slug`, `slug-2`, `slug-3`, ... in order and stopped at the first free one
      // [model/service/DataService.cfc:L64-L68], so a hole left by a deletion is filled. Deriving
      // the answer from `MAX(suffix) + 1` would have been simpler, would pass the dense cases
      // above, and would answer `acme-6` here - a difference visible in the column a customer sees.
      const executor = tableWithTitles(['acme', 'acme-2', 'acme-5']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-3');
    });

    it('answers the unsuffixed slug when nothing in the family is taken', async () => {
      // [L60] `var returnTitle = urlTitle;` - the bare slug is the FIRST candidate, so an empty
      // family must not produce `acme-2`. This is the case a `MAX(suffix) + 1` implementation
      // would also fail, in the opposite direction.
      const executor = tableWithTitles([]);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme');
    });

    it('starts at -2 and never at -1 when only the bare slug is taken', async () => {
      // `addon` starts at 1 and is incremented BEFORE use [L55, L65], so the first suffix the
      // legacy can ever emit is `-2`. An implementation that initialized it to 0 would answer
      // `acme-1` here and pass every other case in this block.
      const executor = tableWithTitles(['acme']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-2');
    });

    it('treats a differently-cased stored title as taken, as the column collation does', async () => {
      // `SwBrand.urlTitle` is a `varchar` under a case-insensitive collation, so the legacy
      // `WHERE urlTitle = 'acme'` matched a stored `ACME` and the caller treated the slug as taken.
      // Comparing case-sensitively would answer `acme` as free and then fail the write on the
      // `unique="true"` constraint [model/entity/Brand.cfc:L55] - a refusal moved one layer later
      // rather than avoided.
      const executor = tableWithTitles(['ACME', 'Acme-2']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      expect(urlTitle).toBe('acme-3');

      // ★★★ AND A GUARD ON THE DOUBLE, WHICH THIS CASE NEEDS AND THE OTHERS DO NOT. This assertion
      // exists because the case above once passed for the wrong reason: the double folded the taken
      // titles before answering, so deleting the subject's own fold changed nothing and the case
      // proved only that the DOUBLE was case-insensitive. Pinning the answered rows to their stored
      // casing means a double that ever starts folding again fails here, loudly, instead of quietly
      // hollowing out the case it is meant to support.
      const answered = await executor.execute(
        'SELECT urlTitle FROM SwBrand WHERE urlTitle = ? OR urlTitle LIKE ?',
        ['acme', 'acme-%'],
      );

      expect(answered).toStrictEqual([{ urlTitle: 'ACME' }, { urlTitle: 'Acme-2' }]);
    });

    it('ignores family rows that are not candidates it could ever propose', async () => {
      // The `slug-%` pattern is deliberately BROADER than the candidate sequence, so a genuine
      // neighbouring title is read and must then be disregarded. `acme-deluxe` and `acme-2-old` are
      // both matched by the pattern and neither equals `acme-2`, so the walk stops there - which is
      // what the legacy did, since it compared whole strings and never parsed a suffix.
      const executor = tableWithTitles(['acme', 'acme-deluxe', 'acme-2-old', 'acme-042']);

      const { urlTitle } = await resolveThrough(executor, 'Acme');

      // `acme-042` is worth naming: it is not `acme-42`, so it occupies no suffix. The legacy
      // tested the unpadded string too, and parsing digits out of rows would have wrongly treated
      // it as taken.
      expect(urlTitle).toBe('acme-2');
    });

    it('★★ binds the slug and the family pattern, splicing neither into the statement', async () => {
      // The `cfqueryparam` property AAP 0.8.3 makes unconditional. It is asserted on the BOUND
      // VALUES rather than by reading the SQL for absence, because the pattern is the interesting
      // parameter: `%` belongs to the pattern the subject builds and must not arrive from a title.
      const executor = tableWithTitles([]);

      await resolveThrough(executor, 'Acme Widgets & Co.');

      const read = familyReads(executor)[0];

      // Sanitization first: `&` and `.` are outside `[a-z0-9 -]` and are stripped, then the space
      // run collapses to a hyphen [L57-L58].
      expect(read?.params).toStrictEqual(['acme-widgets-co', 'acme-widgets-co-%']);
      expect(read?.sql).not.toContain('acme');
      expect(read?.sql).toContain('WHERE urlTitle = ? OR urlTitle LIKE ?');
    });

    it('scopes the family read to the table the caller named', async () => {
      // `tableName="SwBrand"` is handed through verbatim [model/service/BrandService.cfc:L70]
      // because slug uniqueness is scoped to that table's column. The three statements are fixed
      // literals selected by a closed union, so no identifier is ever spliced.
      const executor = tableWithTitles([]);

      await resolveThrough(executor, 'Acme');

      expect(familyReads(executor)[0]?.sql).toContain('FROM SwBrand');
      expect(familyReads(executor)[0]?.sql).not.toContain('SwProduct');
    });

    it('discloses neither the candidate title nor the table in anything it emits', async () => {
      // ★ THE DISCLOSURE HALF OF S-19, AND IT IS NOW STRUCTURAL. The old case asserted the ERROR's
      // message named neither the title nor the table: "A caller able to submit titles and read
      // errors must not be able to learn, one refusal at a time, which slugs are crowded." There is
      // no error to inspect, which is the strongest form of that property - but the log line
      // remains, so it is the log that is asserted. `../lib/logger.js` fails closed on any context
      // key it does not recognize as legible, and the generator passes only `rowCount`.
      //
      // `LOG_LEVEL` travels in the composition's own ENVIRONMENT rather than being stubbed onto
      // `process.env`, because `src/lib/logger.ts` reads no environment variable: the threshold is
      // resolved by `src/lib/config.ts` and adopted by `bootstrapCompositionRoot`. It has to be
      // `debug` because the family line is emitted at that level and the built-in floor is `info`, so
      // without it the line is suppressed and the assertion would pass vacuously - proving nothing
      // about what the line CARRIES.
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
      // ★★★ QUOTE-THEN-REVISE, AND THIS IS THE ONE CASE IN THIS FILE THAT PROVES THE BRAND
      // WRITE END TO END THROUGH THE COMPOSITION ROOT. It used to assert a rejection, with
      // the note: "`saveBrand` still fails closed on the absent durable write (S-06), so the
      // resolved title is read from the payload it was handed - the same route the legacy
      // `super.save` read the column from."
      //
      // The route claim was right and is still asserted. The premise was not: "no port is
      // available" was read as "no write is possible", and only the first was ever
      // established. `super.save` [model/service/BrandService.cfc:L76] is now performed by a
      // narrow write collaborator this file's subject builds per request over the executor -
      // so the resolved title is observable where it actually belongs, in the bound values of
      // an `UPDATE SwBrand`, and reading it from the payload is now the WEAKER of the two
      // available assertions rather than the only one.
      const executor = tableWithTitles(['acme', 'acme-2']);

      const { urlTitle, saved } = await resolveThrough(executor, 'Acme');

      // The legacy route: the generated slug is written into the payload [L70] and populate
      // folds it onto the entity.
      expect(urlTitle).toBe('acme-3');

      // ★★ AND IT REACHED THE STATEMENT. One write was issued, it is the brand update, and
      // `acme-3` is among its bound values - which is the assertion no amount of payload
      // inspection can substitute for.
      const brandWrites = executor.mutations.filter((mutation) => mutation.sql.includes('SwBrand'));

      expect(brandWrites).toHaveLength(1);
      expect(brandWrites[0]?.sql).toContain('UPDATE SwBrand');
      expect(brandWrites[0]?.params).toContain('acme-3');

      // ★ AND THE ANSWER DESCRIBES THE PERSISTED ROW. `brandID` is the caller's, because an
      // update never mints one; `modifiedByAccountID` is absent because `BASE_ENV` configures
      // no audit actor and the gate refuses rather than inventing attribution (S-07).
      expect(saved.getBrandID()).toBe('b-resolving-a-title');
      expect(saved.getUrlTitle()).toBe('acme-3');
      expect(saved.getModifiedDateTime()).toBeInstanceOf(Date);
      expect(saved.getModifiedByAccountID()).toBeUndefined();
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
    // PERSISTED price group is chosen because it is the shortest route from a request
    // scope to a bound `modifiedByAccountID`.
    //
    // ★ THIS NOTE PREVIOUSLY READ: "`savePriceGroup` on a PERSISTED price group is chosen
    // because its update path inspects no row count, so the stub's `affectedRows: 0` is not
    // mistaken for a failure." THAT PREMISE NO LONGER HOLDS, and it was never safe to rely
    // on. `MysqlPriceGroupRepository`'s update path now refuses a mutation that matched no
    // row, because the pool runs with mysql2's default `FOUND_ROWS` flag and therefore
    // reports rows MATCHED - so `affectedRows: 0` means the row is gone, which is exactly
    // the `StaleObjectStateException` the legacy flush raised. These cases are about WHICH
    // ACCOUNT reaches the bound position, not about a lost update, so `saveThrough` now says
    // the row matched (`affectedRows: 1`) and the bound values are read back unchanged.

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
      // `affectedRows: 1` says the update matched its row - see the note above. Without it the
      // adapter refuses before these cases can read the bound account back.
      const executor = new StubExecutor(() => [], 1);
      // ★ THE ADAPTER COMES FROM THE INSPECTION HOOK NOW. This case is about what the ADAPTER
      // stamps into the audit columns, so it has to call `savePriceGroup` on the adapter itself -
      // there is no service member that wraps it, because the legacy `savePriceGroup` was
      // `HibachiService`'s generic `save<Entity>` rather than a declared method on
      // `PriceGroupService`. Withdrawing the repositories from `RequestScope` therefore removes the
      // only route this case had, and the hook is the sanctioned replacement.
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
        makeRoot().then(async (root) => {
          const scope = await root.createRequestScope({ accountID: REQUEST_ACCOUNT_ID });

          return Object.keys(scope);
        }),
      ).resolves.not.toContain('auditActor');
    });

    it('gives two request scopes independent actors', async () => {
      // Per-request construction, not process state: the whole reason the legacy memo
      // families were re-scoped. One request's attribution cannot leak into another's.
      const root = await makeRoot({ executor: new StubExecutor() });
      const first = await openScopeWithAdapters(root, {
        accountID: 'acct-first',
        adminAccountFlag: true,
      });
      const second = await openScopeWithAdapters(root, {
        accountID: 'acct-second',
        adminAccountFlag: true,
      });

      // ★ THE ADAPTER IDENTITY CLAIM IS RETAINED VERBATIM and reached through the recorded
      // assembly, because the actor is constructed per adapter and two scopes sharing one adapter
      // would share one actor - which is precisely what this case exists to rule out.
      expect(adaptersOf(first).priceGroupRepository).not.toBe(
        adaptersOf(second).priceGroupRepository,
      );
      expect(first.currentAccountContext.accountID).toBe('acct-first');
      expect(second.currentAccountContext.accountID).toBe('acct-second');
    });
  });
});

// ---------------------------------------------------------------------------
// The two framework WRITE collaborators (F13, F14)
//
// A code review raised two findings against durable writes this subtree performed nowhere:
//
//   F13, CRITICAL - `RoundingRuleService.saveRoundingRule` evicted its memo entry and then
//   ANSWERED THE ARGUMENT, so the ported `super.save`
//   [model/service/RoundingRuleService.cfc:L63] did nothing.
//
//   F14, MAJOR - `BrandService.saveBrand` resolved the URL title and then raised an
//   unavailable-capability error, so `super.save` [model/service/BrandService.cfc:L76] did
//   nothing either.
//
// ★★★ WHY THE ASSERTIONS LIVE HERE AND NOT IN THE SERVICE SUITES. Both services are typed
// against a single-method contract they DECLARE, and the two service suites double it - which
// proves each service reaches its collaborator, populates, validates and answers the
// collaborator's result, and nothing at all about the SQL. The implementations are module-local
// classes in the subject of this file, reached only through the graph it assembles, so this is
// the only place the statements, the bound values and the audit stamps are observable. Both
// halves are needed: a suite that only doubled the writer would pass against a writer that
// wrote the wrong columns.
//
// ★★ AND WHY THEY ARE NOT PORTS. The thirteen-port set is closed (AAP 0.2.1) and
// `ProductRepository` is locked at six members, so a fourteenth port or a seventh member is not
// available. Neither is it wanted: `super.save` is framework-inherited generic Hibachi CRUD
// that AAP 0.5.3 deliberately does not carry forward, and the composition root is where that
// document puts every replaced framework responsibility. The precedent is already in the file -
// `SqlPriceGroupFrameworkReads` and `SqlPromotionFrameworkReads` are structural collaborators
// over the same executor, satisfied without an `implements` clause.
// ---------------------------------------------------------------------------

describe('the framework write collaborators (F13, F14)', () => {
  /** A 32-character hyphen-free identifier, which is what `generator="uuid" length="32"` produces. */
  const MINTED_ID_PATTERN = /^[0-9a-f]{32}$/;

  const WRITER_ACCOUNT_ID = 'acct-that-may-be-attributed';

  /**
   * A rounding rule the save-context rules accept.
   *
   * `'0.99'` satisfies `hasExpressionWithListOfNumericValuesOnly`
   * [model/entity/RoundingRule.cfc:L78-L86] - two characters after the decimal point and numeric -
   * so validation reaches the write rather than refusing before it.
   *
   * The value rounder is a pass-through: this block asserts what is WRITTEN, and no assertion here
   * rounds anything. The parameter is typed to a non-exported interface, so an object literal
   * satisfies it structurally, which is also how the composition root satisfies it.
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
   * Opens a scope over an executor whose writes report ONE affected row.
   *
   * `affectedRows: 1` matters: both writers refuse a count other than one, transcribing the
   * `StaleObjectStateException` Hibernate raised on a zero-match flush. The default `0` is what
   * the refusal cases below use.
   */
  async function openWritingScope(
    affectedRows = 1,
    input: { accountID?: string; adminAccountFlag?: boolean } = {},
  ): Promise<{ readonly scope: RequestScope; readonly executor: StubExecutor }> {
    const executor = new StubExecutor(() => [], affectedRows);
    const scope = await (await makeRoot({ executor })).createRequestScope(input);

    return { scope, executor };
  }

  describe('SwRoundingRule (F13)', () => {
    it('★★★ INSERTS a new rule, mints its identifier and answers the persisted row', async () => {
      const { scope, executor } = await openWritingScope(1, {
        accountID: WRITER_ACCOUNT_ID,
        adminAccountFlag: true,
      });
      const unsaved = makeRoundingRule('');

      const saved = await scope.roundingRuleService.saveRoundingRule(unsaved);

      // ONE statement, and it is the insert. Asserted on the SQL rather than on a count alone,
      // so an update issued against an unsaved rule could not pass here.
      expect(executor.mutations).toHaveLength(1);
      expect(executor.mutations[0]?.sql).toContain('INSERT INTO SwRoundingRule');

      // ★★ EIGHT COLUMNS, EIGHT PLACEHOLDERS, EIGHT BOUND VALUES - and no value interpolated into
      // the statement text. That is the `cfqueryparam` property AAP 0.8.3 makes unconditional, and
      // it is asserted structurally rather than by eyeballing the SQL: a writer that concatenated
      // one value would bind seven.
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

      // ★★ ONE CAPTURED INSTANT SERVES BOTH TIMESTAMPS. `preInsert`
      // [org/Hibachi/HibachiEntity.cfc:L609-L630] stamped created and modified from the same
      // `now()`, so two different values here would be a divergence a reader could not see.
      expect(insert?.params[4]).toBeInstanceOf(Date);
      expect(insert?.params[4]).toStrictEqual(insert?.params[6]);
      expect(insert?.params[5]).toBe(WRITER_ACCOUNT_ID);
      expect(insert?.params[7]).toBe(WRITER_ACCOUNT_ID);

      // ★★★ AND THE ANSWER IS THE PERSISTED ROW, NOT THE ARGUMENT. This is the finding itself:
      // the method used to answer `rule` unchanged, so `isNew()` stayed true and the caller had
      // no identifier for the row it believed it had saved.
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

      // ★★ WRITE-ONCE, READ OFF THE MAPPING RATHER THAN CHOSEN.
      // `HibachiEntity.preUpdate` [org/Hibachi/HibachiEntity.cfc:L651-L679] restamps only the
      // modified pair; `setCreatedByAccount` appears in `preInsert` alone [:L628-L630]. So the SET
      // list omits both created columns, and an update that carried them would silently rewrite
      // the row's origin.
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
      // The same fail-safe property the S-07 block pins for the repositories, asserted for the
      // writers because they stamp on their own. An omitted `adminAccountFlag` is the non-admin
      // arm of the legacy gate [org/Hibachi/HibachiEntity.cfc:L628, L633], under which `preInsert`
      // never reached its setter - so no attribution is invented for an unelevated request.
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
      // Reproducing the ORM's own refusal, not adding a guarantee: Hibernate raised
      // `StaleObjectStateException` when a flush matched zero rows, so a writer that shrugged at
      // `affectedRows: 0` would be MORE forgiving than the framework it replaces - and would
      // reintroduce exactly the finding, one layer down, by answering a persisted-looking entity
      // for a row that does not exist.
      const { scope } = await openWritingScope(0);

      await expect(
        scope.roundingRuleService.saveRoundingRule(makeRoundingRule('rr-vanished')),
      ).rejects.toThrow(/roundingRule/i);
    });

    it('does not reach the write at all when a save-context rule refuses', async () => {
      // The order `super.save` used: validate [org/Hibachi/HibachiService.cfc:L151], and flush
      // only when `hasErrors()` is false [:L155]. A rule missing its name is refused before any
      // statement, which is what makes the refusal equivalent to the legacy's skipped DAO call.
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

      // ★ THE REFUSAL COMES BACK ON THE ENTITY, not as a throw. `HibachiService.save` returns the
      // same entity either way [org/Hibachi/HibachiService.cfc:L167]; only the FLUSH is skipped, and
      // that skip is what this case is really about.
      const refused = await scope.roundingRuleService.saveRoundingRule(nameless);

      expect(refused.getError('roundingRuleName')).toStrictEqual(['roundingRuleName is required']);
      expect(executor.mutations).toStrictEqual([]);
    });
  });

  describe('SwBrand (F14)', () => {
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

      // ★★ ELEVEN COLUMNS, NOT THE TWO THE LEGACY BRANCH LOGIC READS. A partial write was the
      // hazard the earlier fail-closed reading correctly identified; this is the assertion that
      // rules it out.
      expect(insert?.params).toHaveLength(11);
      expect(insert?.sql.match(/\?/g)).toHaveLength(11);
      expect(insert?.params[0]).toMatch(MINTED_ID_PATTERN);
      expect(insert?.params[3]).toBe('acme-athletics');
      expect(insert?.params[4]).toBe('Acme Athletics');
      expect(insert?.params[5]).toBe('https://example.invalid/acme');
      expect(insert?.params[6]).toBe('legacy-remote-identifier');
      expect(insert?.params[7]).toBeInstanceOf(Date);
      expect(insert?.params[8]).toBe(WRITER_ACCOUNT_ID);

      // Nothing interpolated.
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
      // never reached the DAO - a duplicate title was a refused save, not a driver error on a
      // column constraint. The probe transcribes `HibachiDAO.isUniqueProperty`
      // [org/Hibachi/HibachiDAO.cfc:L130-L147].
      const executor = new StubExecutor(
        (sql) => (sql.includes('SELECT brandID FROM SwBrand') ? [{ brandID: 'other-brand' }] : []),
        1,
      );
      const scope = await (await makeRoot({ executor })).createRequestScope();

      // ★★★ AND THE REFUSAL IS A VALIDATION REFUSAL, ON THE ENTITY - which is the second half of the
      // sentence this case's own title makes. The probe used to run inside the WRITER and throw
      // `BrandUrlTitleNotUniqueError`, so a rule declared beside `required` in the same JSON file was
      // reported by a different mechanism from its sibling. It is now asked during validation, by
      // `SqlBrandFrameworkWrites.isUrlTitleUnique`, and recorded where every other failed rule is.
      const refused = await scope.brandService.saveBrand(new Brand({ brandID: 'b-colliding' }), {
        brandName: 'Acme Athletics',
        urlTitle: 'acme-athletics',
      });

      expect(refused.hasError('urlTitle')).toBe(true);
      expect(refused.getError('urlTitle')[0]).toMatch(/unique/i);

      // ★★★ AND NOT ONE STATEMENT WAS WRITTEN. An errored entity alone would also be satisfied by a
      // writer that inserted the row and reported the collision afterwards.
      expect(executor.mutations).toStrictEqual([]);
      expect(executor.statements.some((sql) => sql.includes('SELECT brandID FROM SwBrand'))).toBe(
        true,
      );
    });

    it('excludes the row being saved from its own uniqueness probe', async () => {
      // The ported `!= :entityID` term. Without it, re-saving an existing brand whose title is
      // unchanged would collide with ITSELF and refuse every update - which is exactly why the
      // legacy carried the term rather than testing the column alone.
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
      // `validate_dataType` [org/Hibachi/HibachiValidationService.cfc:L256-L262]. A relative path
      // is not an absolute URL, so `isValid("url", ...)` refused it and the DAO was skipped.
      const { scope, executor } = await openWritingScope(1);

      const refused = await scope.brandService.saveBrand(new Brand({ brandID: 'b-bad-website' }), {
        brandName: 'Acme Athletics',
        brandWebsite: '/relative/path',
      });

      expect(refused.getError('brandWebsite')).toStrictEqual(['brandWebsite must be a valid URL']);
      expect(executor.mutations).toStrictEqual([]);
    });
  });

  it('★★ builds both writers PER REQUEST, so one request cannot stamp another request\u2019s row', async () => {
    // The writers close over the request's audit actor, so a container-scoped writer would carry
    // one invocation's attribution into the next - the whole hazard AAP 0.6.5 re-scopes the legacy
    // memo families for. Two scopes off ONE root, two different accounts, and each write must
    // carry its own.
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
    const scope = await (await makeRoot({ executor })).createRequestScope();
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
    const scope = await (await makeRoot({ executor })).createRequestScope();
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
    const scope = await (await makeRoot({ executor })).createRequestScope();
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

// -------------------------------------------------------------------------
// The per-SKU feed setting cascade (F10)
//
// ★★★ THIS BLOCK IS NET-NEW, AND THE BEHAVIOUR IT PINS REPLACES A CONSTANT.
//
// `DeclaredDefaultSkuFeedSettingResolver` answered `1 lb` for every SKU and defended that with a
// sentence from the port's own docblock: a resolver "is free to answer ... FROM DECLARED DEFAULTS".
// Code review raised F10, MAJOR: the resolver "ignores product/product-type/brand precedence and
// returns `1 lb` for every SKU, while `googleFeedRepository.ts:342-415,2446-2481` requires effective
// per-SKU settings", and required either "a batched resolver with the legacy precedence" or a refusal,
// with the instruction "Do not masquerade defaults as resolved overrides."
//
// THE BATCHED RESOLVER WAS BUILT AND THE REFUSAL WAS REJECTED, on the evidence of F1, F2 and F8 -
// three refusals of valid states that this same review cycle required removing. A catalog with no
// `SwSetting` overrides is the ordinary case and the legacy served it from the declared default
// without complaint, so refusing it would have traded a wrong answer for no answer.
//
// EVERY CASE DRIVES THE COMPOSED GRAPH END TO END, through `productFeedPort.generateProductFeed()`,
// and reads the resolved pair out of the emitted `<g:shipping_weight>` element
// [integrationServices/google/views/feed/product.cfm:L58]. Asserting on the rendered document rather
// than on the resolver in isolation is deliberate: the resolver is module-local and unexported, and
// what the finding is about is the value a merchant reads in the feed.
// -------------------------------------------------------------------------

describe('the per-SKU feed setting cascade (F10)', () => {
  /**
   * Every column `SwSetting` discriminates on, restated INDEPENDENTLY of the subject.
   *
   * ★★ THE DUPLICATION IS THE POINT. The subject narrows a probe by requiring these columns NULL, so
   * a row must carry all seventeen for the narrowing to be observable at all. Deriving this list from
   * the subject's own constant would make a case that dropped a column pass by agreeing with the bug.
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

  /** One `SwSetting` row: the named relationships populated, every other column SQL NULL. */
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

  /** A `skuShippingWeight` row, which is the key every case below varies. */
  function weightRow(value: string | null, relationships: Readonly<Record<string, string>> = {}) {
    return settingRow('skuShippingWeight', value, relationships);
  }

  /**
   * One feed selection row, complete.
   *
   * Mirrors `makeSelectionRow` in `tests/unit/integrations/google/googleFeedRepository.test.ts`:
   * the subject proves each column exists before reading it, so an omitted column would fail for the
   * wrong reason and hide what the case meant to assert.
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
    /** Leaf product-type identifier to its STORED path - root first, leaf last. */
    readonly paths?: Readonly<Record<string, string | null>>;
  }

  /**
   * An executor answering the three statements the cascade depends on, routed by SQL text.
   *
   * ★★★ EACH DISCRIMINATOR IS VERIFIED UNIQUE ACROSS `src/`, AND THE FIRST ATTEMPT WAS NOT.
   * Routing the path read on `productTypeIDPath` alone matched the SALE-PRICE UNION as well - that
   * statement mentions the column four times, walking it for product-type-scoped rewards
   * [model/dao/PromotionDAO.cfc:L482-L488] - so a path-shaped answer reached a reader expecting nine
   * promotion columns and every case in this block failed on a missing `originalPrice`. The routes
   * below are the full projection prefixes, each of which occurs exactly once in the source tree:
   *
   *   `FROM SwSetting`                              the resolver's candidate-row read
   *   `SELECT productTypeID, productTypeIDPath`     the resolver's ancestry-path read
   *   `AS skuActiveFlag`                            the feed's own selection
   *
   * Everything unrouted answers no rows, which is what the image and sale-price statements want here.
   * A double that answers the WRONG statement is worse than one that answers nothing, because it fails
   * somewhere else and points at the wrong subject.
   */
  function feedExecutor(world: FeedWorld): StubExecutor {
    return new StubExecutor((sql: string, params: readonly unknown[]): readonly SqlRow[] => {
      // ★ TWO STATEMENTS NOW READ `SwSetting`, AND THEY MUST NOT BE CONFLATED. Tier one reads the
      // seven GENERAL setting names [see GENERAL_SETTINGS_SQL], and the feed cascade reads the two
      // per-SKU shipping-weight names. Only the second is this world's business, so the first is
      // answered with no rows - the ordinary state of an installation with no global override. The
      // discriminator is the placeholder count spelled with its closing paren: `IN (?, ?)` cannot
      // match the seven-placeholder list.
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

  /** Generates the feed through the composed graph and answers the document. */
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

  /** The emitted `<g:shipping_weight>` bodies, in document order. */
  function shippingWeights(document: string): readonly string[] {
    return [...document.matchAll(/<g:shipping_weight>([^<]*)<\/g:shipping_weight>/g)].map(
      (match) => match[1] ?? '',
    );
  }

  it('★★★ ANSWERS A PRODUCT-TYPE OVERRIDE instead of the declared default', async () => {
    // ★★★ THE LITERAL INVERSION OF F10. Nothing about this catalog is unusual - a merchant set a
    // shipping weight on a product type - and the retired resolver answered `1 lb` for it, because it
    // answered `1 lb` for everything. The cascade's fourth step
    // [model/service/SettingService.cfc:L104, entry 3] is what finds it.
    const document = await feedFrom({
      settings: [weightRow('12', { productTypeID: 'pt-leaf' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['12 lb']);
  });

  it('falls back to the declared default only when every probe misses', async () => {
    // ★★ THE OTHER HALF, AND WHY THE DEFAULTS ARE NOT DELETED. The legacy seeds them before any probe
    // runs [model/service/SettingService.cfc:L482-L487] and they survive an empty table, so `1 lb` is
    // still the right answer HERE. What F10 objected to was answering it everywhere; a default that is
    // reachable only by exhausting the cascade is not masquerading as anything.
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
    // Step 2, lookup entry 1 [model/service/SettingService.cfc:L104]. Same table as above minus the
    // SKU row, so the winner moves exactly one step down the cascade.
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
    // [model/service/SettingService.cfc:L104] and is strictly more specific than entry 3.
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
    // ★★★ THE DIRECTION CASE, AND THE ONE MOST WORTH GETTING WRONG SLOWLY. The stored path runs ROOT
    // FIRST because `buildIDPathList` prepends [org/Hibachi/HibachiEntity.cfc:L315], and the legacy
    // indexes it DOWNWARDS from `listLen` [model/service/SettingService.cfc:L552-L557] - so the walk
    // starts at the leaf. A resolver that iterated the stored order instead would answer `90`, the
    // root's value, while the leaf override sat unread. Both rows exist here precisely so the
    // direction, and not the availability, decides.
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
    // ★★ THE STEP-ORDERING CASE. The legacy advances `nextLookupOrderIndex` only once
    // `nextPathListIndex` reaches 0 [model/service/SettingService.cfc:L586-L589], so EVERY segment is
    // tried with the brand before ANY segment is tried alone. Here the brand row sits on the ROOT and
    // the plain row on the LEAF, which puts the two orderings in direct conflict: interleaving the
    // steps segment by segment would answer `11`, the nearer plain row. The legacy answers `90`.
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
    // ★★ THE `IS NULL` HALF OF THE PREDICATE, WHICH IS EASY TO LOSE AND EXPENSIVE TO LOSE.
    // `getSettingRecordBySettingRelationships` emits `AND <col> IS NULL` for every NON-participating
    // column [model/service/SettingService.cfc:L768-L870], so a row scoped to an account is invisible
    // to a lookup that names no account - even though its `skuID` matches perfectly. A resolver
    // matching only the columns it asked about would answer `77` here and leak one account's setting
    // into every other account's feed.
    const document = await feedFrom({
      settings: [weightRow('77', { skuID: 'sku-one', accountID: 'acct-other' }), weightRow('40')],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['40 lb']);
  });

  it('finds no brand-only row, because the sku lookup order has no brand-only step', async () => {
    // The brand appears ONLY as entry 2's conjunct [model/service/SettingService.cfc:L104], never
    // alone, so a brand-scoped row is unreachable from a SKU and the cascade falls through to the
    // installation row. Counter-intuitive, and reproduced rather than repaired: inventing the missing
    // step would answer settings the legacy never found.
    const document = await feedFrom({
      settings: [weightRow('55', { brandID: 'brand-one' }), weightRow('40')],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['40 lb']);
  });

  it('★★ lets a blanked row short-circuit the cascade rather than inherit', async () => {
    // A row whose `settingValue` is NULL still sets `foundValue` [model/service/SettingService.cfc:
    // L525-L527] and a NULL query column reads as `''` in CFML, so a merchant who blanks a setting at
    // SKU level suppresses the product-level value rather than falling through to it. Mapping NULL to
    // `undefined` would have inverted this and answered `20`.
    const document = await feedFrom({
      settings: [weightRow(null, { skuID: 'sku-one' }), weightRow('20', { productID: 'prod-one' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual([' lb']);
  });

  it('matches setting names and identifiers case-insensitively, as the legacy LOWER() pair does', async () => {
    // Both sides of every comparison are wrapped in `LOWER(...)`
    // [model/service/SettingService.cfc:L783 onwards], so a row stored in a different case than the
    // column the selection returned is still the same row.
    const document = await feedFrom({
      settings: [settingRow('SKUSHIPPINGWEIGHT', '13', { skuID: 'SKU-ONE' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['13 lb']);
  });

  it('resolves the two keys independently, so one override does not drag the other', async () => {
    // The view reads two settings [integrationServices/google/views/feed/product.cfm:L58] and each
    // runs its OWN cascade. A weight set at SKU level with no unit row must answer the overridden
    // weight beside the DECLARED unit, not a pair drawn from one level.
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
    // ★★★ THE PORT'S WHOLE REASON FOR EXISTING, quoted from its docblock: "Two SKUs of the same
    // product can answer differently, because the very first lookup step is a value bound to the
    // SKU's own identifier." A pair of strings resolved once and copied onto every row cannot express
    // this, and the retired resolver did exactly that.
    const document = await feedFrom({
      selections: [selectionRow(), selectionRow({ skuID: 'sku-two', skuCode: 'SKU-TWO' })],
      settings: [weightRow('5', { skuID: 'sku-one' }), weightRow('50', { skuID: 'sku-two' })],
      paths: { 'pt-leaf': 'pt-leaf' },
    });

    expect(shippingWeights(document)).toStrictEqual(['5 lb', '50 lb']);
  });

  it('★★ issues EXACTLY ONE settings read and ONE path read, whatever the batch size', async () => {
    // ★★ THE BATCHING HALF OF THE FINDING, which the port states as a requirement: "a per-row call
    // would issue one lookup per SKU, which is the N+1 shape the repository boundary exists to make
    // impossible." Three SKUs across two product types, and the statement count does not move. The
    // legacy's own shape agrees - it read the table ONCE [model/dao/SettingDAO.cfc:L51-L62] and
    // probed in-engine.
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

    // And the path read is DEDUPLICATED: three SKUs mention two distinct product types, so it binds
    // two keys rather than three.
    expect(pathReads[0]?.params).toStrictEqual(['pt-leaf', 'pt-other']);
  });

  it('★★ binds both setting names and every product-type key, splicing neither', async () => {
    // The `cfqueryparam` property AAP 0.8.3 makes unconditional. The names are bound FOLDED because
    // the legacy compared `LOWER(settingName)` [model/service/SettingService.cfc:L783], and the
    // statement selects all seventeen relationship columns because it must require sixteen of them
    // NULL.
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
    // `IN ()` is a MySQL syntax error, so a batch with nothing to ask about must not ask. A product
    // with no type also reaches no path probe: the legacy set `relationshipValue = ""`
    // [model/service/SettingService.cfc:L558-L560] and probed `LOWER(productTypeID) = ''`, which no
    // NULL or populated column satisfies - so the cascade lands on the installation row either way.
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
    // A leaf whose materialized column is empty still has ONE known segment: itself.
    // `getProductTypeIDPath` [model/entity/ProductType.cfc:L251-L253] rebuilt the list from the live
    // parent chain whenever the column was null, and `buildIDPathList` always includes the entity it
    // starts from [org/Hibachi/HibachiEntity.cfc:L315], so the legacy could not observe an empty path
    // here. Seeding the leaf reproduces the floor of that guarantee without inventing an ancestry the
    // column did not record.
    const document = await feedFrom({
      settings: [weightRow('19', { productTypeID: 'pt-leaf' })],
      paths: { 'pt-leaf': null },
    });

    expect(shippingWeights(document)).toStrictEqual(['19 lb']);
  });

  it('discloses no setting value and no identifier in what it logs', async () => {
    // The same disclosure property the other bootstrap collaborators hold. `../lib/logger.js` fails
    // closed on any context key it does not recognize as legible, and the resolver passes only the two
    // counts. `LOG_LEVEL` is supplied in the composition's ENVIRONMENT - not stubbed onto
    // `process.env`, which the logger does not read - because the line is emitted at `debug` and the
    // built-in floor is `info`, so without it the assertion would pass vacuously.
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

// ===========================================================================
// THIRD SUITE IN THIS FILE: THE FIVE RUNTIME GUARDS QA TESTING ASKED FOR.
//
// Each case below pins a refusal that did not exist when this module was tested at runtime, and each
// names the finding that produced it. They share the subject and the scaffolding of the two suites
// above rather than splitting the module's coverage across a third file.
//
// The common shape of all five: a TYPE this module declares is not a guarantee at a boundary the
// compiler cannot police - a closed string union arriving from an untyped caller, the return value of
// an injected port, a `Date` that is an instance of `Date` and still not an instant, a struct key
// spelled in another case, and a `readonly` member that erases at emit. Every one of them was found
// by driving the shipped exports, not by reading the source.
// ===========================================================================

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
   * ★ REACHED BY RUNTIME MEMBER READ, AND THE REASON IS THE SUBJECT ITSELF. `SqlUrlTitleGenerator`
   * is module-local to the composition root and `BrandService.urlTitleGenerator` is `private`, so
   * there is no exported name to import and no typed accessor to call - which is precisely the
   * position an untyped caller is in, and the position the guard under test defends. The keyed view
   * is the same narrow pattern the credential-escape walk at the top of this file uses.
   */
  function wiredUrlTitleGenerator(scope: RequestScope): UrlTitleGenerator {
    const holder = scope.brandService as unknown as Record<string, unknown>;

    return holder['urlTitleGenerator'] as UrlTitleGenerator;
  }

  it('refuses a url-title table outside the three-member union, issuing no statement', async () => {
    // QA Issue 2, with its eight reproduction inputs verbatim. The read used to index a frozen
    // three-key statement table with no membership test, so `executor.execute(undefined, [...])` was
    // issued and the method RETURNED an unsuffixed `'nike'` - "this title is unique", with the
    // database never consulted. Against the real pool the driver raised an opaque Buffer-type
    // `TypeError` instead of a named refusal.
    //
    // NO INJECTION WAS EVER POSSIBLE and none is now: the name is not interpolated, the three
    // statements are frozen literals and both values are bound. What is asserted is the silent wrong
    // answer, and that nothing reaches the executor.
    const executor = makeExecutor();
    const scope = await (await bootWith(executor)).createRequestScope();
    const generator = wiredUrlTitleGenerator(scope);
    const readsBefore = executor.calls.length;

    const rejected: readonly unknown[] = [
      'SwSku',
      'SwBrand; DROP TABLE SwBrand--',
      'information_schema.tables',
      '',
      // Rejected in effect, where CFML identifier comparison was case-insensitive: the union spells
      // the three physical tables exactly, and choosing a statement by a folded comparison is not
      // something this port does anywhere.
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
    // QA Issue 6. An invalid `Date` was accepted, `scope.now.getTime()` was `NaN`, and the
    // subscription price-group query bound `[null, 'a', null]` - because the repository's
    // date-to-parameter conversion maps a non-finite instant to `null` BEFORE binding, so
    // `connection.ts`'s own `SqlParameterError` guard never fired. Both date predicates of the
    // eligibility window [model/dao/PriceGroupDAO.cfc:L65,L70] then compared against SQL NULL,
    // which is never true, and the account silently lost its subscription price group.
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
      // QA INFO-3. `PreparedStatementExecutor.execute` declares `Promise<readonly SqlRow[]>`, and a
      // substituted implementation that broke it produced `Cannot read properties of null (reading
      // 'map')` and `rows.map is not a function` from inside a tier-1 read - naming neither the port
      // nor the statement.
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
    // QA INFO-4. The lookup was a plain index, so `setting('SKUCURRENCY')` answered `undefined` under
    // a signature promising `string`. CFML matched struct keys without regard to case, and AAP 0.1.1
    // requires every ported struct-keyed lookup to be audited rather than assumed. The union is NOT
    // widened - no new name became askable - so each spelling below names a declared setting.
    const provider = (await bootWith(makeExecutor())).settingsProvider;

    for (const spelling of ['skuCurrency', 'SKUCURRENCY', 'skucurrency', 'SkuCurrency'] as const) {
      expect(provider.setting(spelling as SettingKey)).toBe('USD');
    }

    expect(provider.setting('GLOBALURLKEYPRODUCT' as SettingKey)).toBe('sp');
    expect(provider.setting('globalURLKeyProduct')).toBe('sp');
  });

  it('freezes the root, its diagnostics, the scope, its account context and the adapters', async () => {
    // QA INFO-2. `appConfig`, `config.database`, the settings table, the pool executor and
    // `UNATTRIBUTED_AUDIT_ACTOR` were all frozen while the request tier was not:
    // `scope.currentAccountContext.accountID = 'HACK'` succeeded, with the compile-time `readonly` as
    // the only boundary. There was no isolation impact - each request gets its own objects - and the
    // point is that one rule now holds on both halves.
    const root = await bootWith(makeExecutor());
    const { scope, adapters } = await root.createInspectableRequestScope({ accountID: 'acct-1' });

    // `root.diagnostics.database` USED TO APPEAR IN THIS LIST and is not withdrawn from the freeze
    // check by oversight: the member itself is gone, along with `pool`. The three built members that
    // remain are each frozen individually, so the whole projection is frozen at every depth it has.
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

// ===========================================================================
// THE EUROPEAN CENTRAL BANK CURRENCY CONVERTER
//
// ★★★ MOVED HERE WITH ITS SUBJECT, NOT REWRITTEN. These cases shipped as
// `tests/unit/integrations/europeanCentralBankCurrencyConverter.test.ts`, against
// `src/integrations/europeanCentralBankCurrencyConverter.ts`. Code review recorded that module as a
// SCOPE violation - the plan's target layout enumerates `src/integrations/` as `integrationInterface.ts`
// plus the four Google modules, and the scope gate admits "no adapter other than Google" - so the
// implementation moved into the composition root, which is where the plan puts the ports that have no
// adapter file. The suite followed it here rather than being deleted or thinned: every case, every
// citation and every fixture below is the text that shipped, indented one level into a wrapping
// `describe` so its module-scope constants cannot collide with this file's.
//
// The original file header's orientation still applies, with its one stale path corrected:
// slatwall-ts - characterisation suite for the European Central Bank currency
// converter
//
// WHAT THIS SUITE PINS
// The module-private converter class inside `src/handlers/bootstrap.ts` - the shipped
// implementation of the `CurrencyConverter` port - against
// `model/service/CurrencyService.cfc` read line by line. It read
// `src/integrations/europeanCentralBankCurrencyConverter.ts`, the withdrawn module
// named above, which is the one sentence of the moved header that could not survive
// the move unchanged. The currency cascade
// this adapter feeds is one of the three named MUST-PRESERVE areas (AAP 0.6.3),
// so every assertion below cites the legacy line it holds in place.
//
// ******************************************************************************
// ** THIS COVERAGE IS NET-NEW. IT IS NOT LEGACY PARITY.                       **
// **                                                                          **
// ** AAP 0.6.6 records that exactly three legacy test files reach the         **
// ** in-scope slice - `meta/tests/unit/entity/BrandTest.cfc`,                 **
// ** `meta/tests/unit/entity/ProductTest.cfc`, and                            **
// ** `meta/tests/functional/admin/entity/ProductTest.cfc`, the last of which  **
// ** is an empty stub contributing zero coverage. NONE of them covers         **
// ** `CurrencyService.cfc`, and `meta/tests/unit/service/` contains only      **
// ** AccountServiceTest, HibachiServiceTest, PaymentServiceTest and           **
// ** UtilityRBServiceTest - none in scope.                                    **
// **                                                                          **
// ** So there is no legacy assertion to carry forward here and none is        **
// ** claimed. Every expectation below was derived by READING                  **
// ** [model/service/CurrencyService.cfc:L57-L101] and then EXECUTING the      **
// ** ported implementation to record what it answers, which is what makes     **
// ** this a characterisation suite rather than a specification.               **
// ******************************************************************************
//
// THE FIVE THINGS MOST WORTH GUARDING, AND WHY EACH IS HERE
// 1. THE SILENT PASS-THROUGH. [L100-L101] returns the amount UNCONVERTED when
// either code has no reachable rate. Turning that into a rejection looks
// safer and is not: the cascade awaits each conversion inside the body that
// builds the price map, so one unlisted currency would fail
// `getCurrencyDetails()` outright. Turning it into a zero would sell the
// product for free.
// 2. THE FALLBACK IS NOT ROUNDED while both converted paths are. Asserted by
// identity - `toBe(amount)` - which is the strongest available statement:
// the very instance that went in comes back.
// 3. NO EQUAL-CODE SHORT-CIRCUIT. [L79-L101] has no `original eq convertTo`
// test, so a same-code conversion with a known rate divides, multiplies and
// ROUNDS. `USD -> USD` and `CHF -> CHF` on the same amount therefore answer
// DIFFERENTLY, and that pair of tests is what proves the guard is presence-
// based rather than an identity rule.
// 4. THE GUARD RUNS BEFORE ANY ARITHMETIC. [L86] resolves both halves before
// [L90] divides, so a zero or malformed SOURCE rate paired with an
// unreachable target is a pass-through and not a raise.
// 5. THE `activeFlag` ASYMMETRY. [L60] and [L72] filter on active status;
// [model/entity/Sku.cfc:L375] does not. An inactive-but-eligible currency
// must still be priced.
//
// EVERY EXPECTED AMOUNT IS A DECIMAL STRING
// No assertion computes a monetary value with JavaScript arithmetic. Rates and
// amounts are chosen so the exact result is stated as a literal - `21.70 / 1.0850`
// is exactly `20`, and `20 * 0.8500` is exactly `17` - so a reader can check
// the expectation by hand rather than trusting a second implementation written
// in the test.
//
// MONEY IS COMPARED THROUGH `toFixed2()`, NOT `toDecimalString()`
// `toDecimalString()` renders full precision with TRAILING ZEROS DROPPED, so a
// converted `17.00` renders as `17`. `toFixed2()` is the two-decimal form and is
// what the rounding assertions need. `toDecimalString()` is used deliberately
// in the pass-through tests, where the point is that a third decimal SURVIVED.
//
// NO DATABASE, NO NETWORK, NO CLOCK
// The adapter takes its currency records and its rate table as constructor
// arguments, so this suite needs no fixture module, no executor double and no
// environment. That is a property of the design under test, not a convenience:
// the legacy rate retrieval at [L104-L131] performs a live HTTP GET and memoizes
// the result on the component, and neither is ported.
// ===========================================================================

describe('the European Central Bank currency converter, moved into the composition root', () => {
  // The two shapes the converter's constructor takes. They are declared HERE, structurally, rather
  // than imported: the composition root keeps its rate-table type, its record projection and its
  // pass-through observer module-local, because nothing outside that file names them. Only the class
  // itself is exported, and only so these cases can construct it. Structural typing means these
  // declarations are checked against the real constructor on every build - a drift in either shape
  // fails the typecheck gate rather than this suite.
  type EuropeanCentralBankRateTable = Readonly<Record<string, string>>;

  interface CurrencyRecordProjection {
    readonly currencyCode: CurrencyCode;
    readonly activeFlag: CfBooleanInput;
  }

  // ---------------------------------------------------------------------------
  // Currency codes
  // ---------------------------------------------------------------------------

  /** The pivot. Deliberately NOT a key of the rate table - see `ECB_RATES`. */
  const EUR: CurrencyCode = toCurrencyCode('EUR');

  const USD: CurrencyCode = toCurrencyCode('USD');
  const GBP: CurrencyCode = toCurrencyCode('GBP');
  const JPY: CurrencyCode = toCurrencyCode('JPY');

  /** Present as a `SwCurrency` record but ABSENT from every rate table below. */
  const CHF: CurrencyCode = toCurrencyCode('CHF');

  // ---------------------------------------------------------------------------
  // Rates, chosen so every expected result is exact
  // ---------------------------------------------------------------------------

  const USD_RATE = '1.0850';
  const GBP_RATE = '0.8500';
  const JPY_RATE = '160.50';

  /**
   * A European Central Bank reference-rate table in its real shape.
   *
   * CFML parity [model/service/CurrencyService.cfc:L118-L119]: the legacy copies
   * the `currency` and `rate` XML attributes of each `Cube` element, so there is
   * NO `EUR` KEY - the table is quoted per euro, so the euro has no rate of its
   * own. Every pivot assertion below therefore also proves that the euro converts
   * without an entry.
   */
  const ECB_RATES: EuropeanCentralBankRateTable = {
    USD: USD_RATE,
    GBP: GBP_RATE,
    JPY: JPY_RATE,
  };

  // ---------------------------------------------------------------------------
  // Amounts. Each is exact under the rates above.
  // ---------------------------------------------------------------------------

  /** 20 EUR. */
  const TWENTY_EUR = '20.00';

  /** Exactly 20 EUR at `USD_RATE`, because 1.0850 * 20 = 21.70. */
  const TWENTY_EUR_IN_USD = '21.70';

  /** Exactly 20 EUR at `GBP_RATE`, because 0.8500 * 20 = 17. */
  const TWENTY_EUR_IN_GBP = '17.00';

  /** Exactly 20 EUR at `JPY_RATE`, because 160.50 * 20 = 3210. */
  const TWENTY_EUR_IN_JPY = '3210.00';

  /**
   * A three-decimal amount, which is the whole point of it.
   *
   * A sub-cent third decimal is what makes the difference between the rounded
   * converted paths and the unrounded pass-through OBSERVABLE.
   */
  const SUB_CENT_AMOUNT = '19.999';

  /** `SUB_CENT_AMOUNT` after the cent rounding at [L94] / [L96]. */
  const SUB_CENT_AMOUNT_ROUNDED = '20.00';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** A monetary amount from a decimal string. Never from a JavaScript number. */
  function money(value: string): Money {
    return Money.fromDecimalString(value);
  }

  /** A `SwCurrency` projection row. */
  function currencyRecord(
    currencyCode: CurrencyCode,
    activeFlag: CfBooleanInput,
  ): CurrencyRecordProjection {
    return { currencyCode, activeFlag };
  }

  /** A converter over the real-shaped rate table and no currency records. */
  function converterWithRates(
    rates: EuropeanCentralBankRateTable = ECB_RATES,
  ): EuropeanCentralBankCurrencyConverter {
    return new EuropeanCentralBankCurrencyConverter([], rates);
  }

  /** A converter over currency records and no rates - for the listing suites. */
  function converterWithRecords(
    records: readonly CurrencyRecordProjection[],
  ): EuropeanCentralBankCurrencyConverter {
    return new EuropeanCentralBankCurrencyConverter(records, {});
  }

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter - the euro pivot [model/service/CurrencyService.cfc:L87-L97]', () => {
    it('scales OUT of the euro by the target rate [L96]', async () => {
      // [L93] is false, so [L96] multiplies `amountInEUR` by the target rate.
      // 20 * 1.0850 = 21.70, exactly.
      const converted = await converterWithRates().convertCurrency(money(TWENTY_EUR), EUR, USD);

      expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_USD);
    });

    it('scales INTO the euro by dividing by the source rate [L90, L94]', async () => {
      // [L87] is false so [L90] divides; [L93] is true so [L94] returns without a
      // second scaling. 21.70 / 1.0850 = 20, exactly.
      const converted = await converterWithRates().convertCurrency(
        money(TWENTY_EUR_IN_USD),
        USD,
        EUR,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR);
    });

    it('pivots between two non-euro currencies, dividing then multiplying [L90, L96]', async () => {
      // Both scalings run: 21.70 / 1.0850 = 20, then 20 * 0.8500 = 17.
      const converted = await converterWithRates().convertCurrency(
        money(TWENTY_EUR_IN_USD),
        USD,
        GBP,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_GBP);
    });

    it('handles a rate far from unity in both directions', async () => {
      // A three-figure rate is the case where a float implementation would start to
      // drift. 20 * 160.50 = 3210, and 3210 / 160.50 = 20.
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
      // CFML parity [model/service/CurrencyService.cfc:L86]: each half of the guard
      // is `structKeyExists(cbRates, code) || code eq "EUR"`, and the pivot test is
      // the half that answers for the euro. The real table has no `EUR` entry, so an
      // implementation that only consulted the table would refuse every euro
      // conversion - which is to say, all of them.
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
      // [L87] takes the assignment branch and [L93] takes the early return, so
      // NEITHER rate is consulted - yet [L94] still rounds. A same-currency
      // conversion is therefore not the identity.
      const converted = await converterWithRates().convertCurrency(
        money(SUB_CENT_AMOUNT),
        EUR,
        EUR,
      );

      expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });
  });

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter - the silent pass-through [model/service/CurrencyService.cfc:L100-L101]', () => {
    it('★★ returns the very amount it received when the TARGET has no rate', async () => {
      // `toBe` rather than a value comparison: the instance is returned untouched,
      // which is the strongest form of "unconverted" available.
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
      // THE ASYMMETRY AT [L101] vs [L94]/[L96], stated as one assertion pair.
      // [L101] hands back `arguments.amount` verbatim; both return paths round.
      const converter = converterWithRates();
      const amount = money(SUB_CENT_AMOUNT);

      const passedThrough = await converter.convertCurrency(amount, CHF, CHF);
      const converted = await converter.convertCurrency(amount, EUR, EUR);

      expect(passedThrough.toDecimalString()).toBe(SUB_CENT_AMOUNT);
      expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });

    it('★★★ answers at par when the rate table is EMPTY, on the same terms as an unlisted code', async () => {
      // ★★★ THIS CASE HAS BEEN WRITTEN BOTH WAYS, AND THE FULL RECORD IS KEPT BECAUSE THE
      // DISTINCTION IT TURNS ON IS MONEY.
      //
      // It first asserted par, reasoning that "[L127-L128] the retrieval's `catch` IS EMPTY, so a
      // failed fetch leaves the table as it was - possibly never populated at all". It was then
      // reversed to assert a refusal, on the correct observation that the reasoning read the legacy
      // one line short: after the `catch`, [L130] is
      // `return variables.europeanCentralBankRates;`, and on a cold start that variable was NEVER
      // ASSIGNED, which CFML refuses at runtime. The legacy engine does raise when it has no table
      // at all, and it prices at par when the table it HAS does not quote a code [L100-L101].
      //
      // IT IS PAR AGAIN, AND NOT BECAUSE THAT LEGACY READING WAS WRONG. What the refusal broke is the
      // CONTRACT the port publishes and its consumers are written against:
      // `src/domain/ports/currencyConverter.ts` declares `convertCurrency` a TOTAL function, and
      // `src/handlers/priceResolutionHandler.ts` documents its routed `convertCurrency` operation as
      // having no error path on the strength of that. A partial implementation behind a total contract
      // sent an unrecognised throw to a generic 500 on an operation documented as unable to fail; code
      // review recorded the caller/callee disagreement and the frozen contract is the total function.
      //
      // SO THE MISCONFIGURATION IS SURFACED WHERE SURFACING BELONGS. Every pass-through notifies the
      // observer, and the composition root logs once at wiring time when it is handed an empty table -
      // both asserted in this file. An observability channel reports a wrong configuration; a throw
      // from a total function reports a broken contract.
      const converter = converterWithRates({});
      const amount = money(TWENTY_EUR);

      // The SAME INSTANCE comes back, unrounded, exactly as it does for an unlisted code - so the
      // two unavailable-rate states are now indistinguishable to a caller, which is what "total"
      // means here.
      expect(await converter.convertCurrency(amount, EUR, USD)).toBe(amount);
      expect(await converter.convertCurrency(amount, USD, EUR)).toBe(amount);
      expect(await converter.convertCurrency(amount, USD, GBP)).toBe(amount);
    });

    it('★★ answers at par for an UNLISTED code when the table is NON-EMPTY, which is [L100-L101]', async () => {
      // The must-preserve pass-through, isolated from the empty-table case above. `CHF` is a
      // `SwCurrency` record and is deliberately absent from every rate table in this suite, so the
      // guard [L86] fails on the target alone while the source resolves normally.
      const converter = converterWithRates();
      const amount = money(TWENTY_EUR);

      // Returned as RECEIVED - the same instance, unrounded - which is what makes the
      // pass-through distinguishable from a conversion that happens to be 1:1.
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

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter - there is no equal-code short-circuit', () => {
    it('★★ USD to USD with a known rate divides, multiplies and ROUNDS [L90, L96]', async () => {
      // CFML parity [model/service/CurrencyService.cfc:L79-L101]: there is no
      // `original eq convertTo` test anywhere in the legacy body. So the same code
      // on both sides still takes the full arithmetic path, and a sub-cent amount
      // comes back rounded rather than intact.
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, USD, USD);

      expect(answered).not.toBe(amount);
      expect(answered.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
    });

    it('★★ CHF to CHF with NO rate answers differently, which is what proves the guard', async () => {
      // Same amount, same-code pair, OPPOSITE answer - and the only difference is
      // whether the code has a rate. An identity short-circuit would make these two
      // tests agree, so this pair is the one that would catch it.
      const amount = money(SUB_CENT_AMOUNT);
      const answered = await converterWithRates().convertCurrency(amount, CHF, CHF);

      expect(answered).toBe(amount);
      expect(answered.toDecimalString()).toBe(SUB_CENT_AMOUNT);
    });
  });

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter - the guard runs before any arithmetic [model/service/CurrencyService.cfc:L86]', () => {
    it('★★ a ZERO source rate with an unreachable target is a pass-through, not a division error', async () => {
      // THE ORDERING TEST. [L86] tests both halves before [L90] divides, so the
      // legacy never divides here. An implementation that divided first and checked
      // the target afterwards would raise instead - and would agree with this one on
      // every other input, which is exactly why this case is pinned.
      const converter = converterWithRates({ USD: '0' });
      const amount = money(SUB_CENT_AMOUNT);

      const answered = await converter.convertCurrency(amount, USD, CHF);

      expect(answered).toBe(amount);
    });

    it('★★ a MALFORMED source rate with an unreachable target is also a pass-through', async () => {
      // The guard is PRESENCE-based, exactly as `structKeyExists` is: it never looks
      // at the value. So a corrupt rate that is never consulted is harmless.
      const converter = converterWithRates({ USD: 'not-a-number' });
      const amount = money(SUB_CENT_AMOUNT);

      expect(await converter.convertCurrency(amount, USD, CHF)).toBe(amount);
    });

    it('a zero source rate DOES fail once the target is reachable, as CFML division did', async () => {
      // Not a pass-through: this is malformed data, and swallowing it would turn a
      // corrupt rate table into silently wrong prices. Rejecting rather than
      // throwing synchronously is the promise contract the port declares.
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
      // [L96] multiplies by the target rate, and multiplying by zero is defined.
      // The asymmetry with the source position is the division, not the value.
      const converted = await converterWithRates({ USD: '0' }).convertCurrency(
        money(TWENTY_EUR),
        EUR,
        USD,
      );

      expect(converted.toFixed2()).toBe('0.00');
    });
  });

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter - cent rounding [model/service/CurrencyService.cfc:L94, L96]', () => {
    it('rounds half AWAY FROM ZERO, which is what CFML round() does', async () => {
      // 1.00 * 1.005 = 1.005 exactly, which sits on the half cent. Half-up takes it
      // to 1.01; a half-to-even implementation would answer 1.00.
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

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter.getAllActiveCurrencyIDList [model/service/CurrencyService.cfc:L57-L67]', () => {
    it('answers only the active codes, in record order', async () => {
      // [L60] filters `activeFlag` to 1 and [L63-L65] appends each surviving record
      // in the order the query returned it. There is no `ORDER BY`, so record order
      // is the contract.
      const converter = converterWithRecords([
        currencyRecord(JPY, true),
        currencyRecord(USD, false),
        currencyRecord(EUR, true),
      ]);

      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([JPY, EUR]);
    });

    it('treats an ABSENT flag as inactive, matching the `activeFlag = 1` predicate', async () => {
      // [model/entity/Currency.cfc:L53] declares `ormtype="boolean"` with no
      // default, so the column can hydrate as SQL NULL, and SQL NULL fails `= 1`.
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
      // A `tinyint` column cannot hold `'maybe'`, so this is a schema surprise
      // rather than a data variation, and failing fast at the boundary beats
      // surfacing it from a listing call several layers away. Asserted on the
      // constructor, which is where the resolution happens.
      expect(() => converterWithRecords([currencyRecord(USD, 'maybe')])).toThrow(
        CfmlBooleanConversionError,
      );

      // And the well-formed neighbour still constructs, so the refusal is about the
      // value and not about the shape.
      await expect(
        converterWithRecords([currencyRecord(USD, true)]).getAllActiveCurrencyIDList(),
      ).resolves.toStrictEqual([USD]);
    });
  });

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter.getCurrenciesByCurrencyCodeList [model/entity/Sku.cfc:L371-L375]', () => {
    it('★★ applies NO active filter, so an inactive-but-eligible currency is still returned', async () => {
      // ★ THE ASYMMETRY, AND THE SINGLE MOST CONSEQUENTIAL ASSERTION IN THIS FILE.
      // [model/entity/Sku.cfc:L375] narrows the currency list with
      // `addInFilter('currencyCode', setting('skuEligibleCurrencies'))` and NOTHING
      // ELSE - there is no `activeFlag` clause on the cascade's path, unlike
      // [model/service/CurrencyService.cfc:L60] and [L72]. Adding one here is how an
      // inactive-but-eligible currency silently stops being priced.
      const converter = converterWithRecords([
        currencyRecord(USD, true),
        currencyRecord(GBP, false),
        currencyRecord(JPY, null),
      ]);

      expect(await converter.getCurrenciesByCurrencyCodeList(`${USD},${GBP},${JPY}`)).toStrictEqual(
        [USD, GBP, JPY],
      );

      // The contrast that makes the point: the SAME records, the other method.
      expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
    });

    it('★ omits a listed code that has no currency record at all', async () => {
      // The legacy narrows a smart list over the Currency ENTITY, so it answers with
      // RECORDS - not with the codes the setting happened to name. A code present in
      // `skuEligibleCurrencies` but absent from `SwCurrency` yields no record, the
      // cascade never seeds an entry for it at [model/entity/Sku.cfc:L381], and
      // `getPriceByCurrencyCode` answers `undefined` for it.
      const converter = converterWithRecords([currencyRecord(USD, true)]);

      expect(await converter.getCurrenciesByCurrencyCodeList(`${USD},${CHF}`)).toStrictEqual([USD]);
    });

    it('★ answers in RECORD order, not in the order the list names them', async () => {
      // An `IN` predicate does not reorder a table, and the cascade seeds one outer
      // key per returned record, so record order becomes the key order of the
      // currency-details map.
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
      // [model/entity/Sku.cfc:L373]'s eligibility gate never opens for an empty
      // setting, so this call would not be reached with one - but answering nothing
      // is the only consistent reading if it ever were.
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

  // ===========================================================================
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
      // The table is built from XML attributes, so its casing is the source's, not
      // this port's. Both directions of the mismatch have to work.
      const converted = await converterWithRates({ usd: USD_RATE }).convertCurrency(
        money(TWENTY_EUR),
        EUR,
        USD,
      );

      expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_USD);
    });
  });

  // ===========================================================================
  describe('EuropeanCentralBankCurrencyConverter - construction, isolation and surface', () => {
    it('satisfies the CurrencyConverter port', () => {
      // Compile-time as much as run-time: the annotation is the assertion, and it
      // fails the typecheck gate rather than this suite if the surface drifts.
      const port: CurrencyConverter = converterWithRates();

      expect(typeof port.getAllActiveCurrencyIDList).toBe('function');
      expect(typeof port.getCurrenciesByCurrencyCodeList).toBe('function');
      expect(typeof port.convertCurrency).toBe('function');
    });

    it('★ snapshots the currency records, so a later mutation cannot reach in', async () => {
      // A caller keeps ownership of its own array. Reading it live would let a
      // mutation between two calls change which currencies get priced.
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
      // The correctness property behind the instance scoping: two converters built
      // from different rate tables must never agree by accident. This is what makes
      // one instance per request safe and a module-level memo unsafe.
      const cheap = converterWithRates({ USD: '1.0000' });
      const dear = converterWithRates({ USD: '2.0000' });

      expect((await cheap.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe('20.00');
      expect((await dear.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe('40.00');
    });

    it('★ exposes no cache control and no state accessor', () => {
      // The port has no `refreshRates` and no `clearCache`, and neither does this
      // class: a cache it does not own is a cache it cannot mismanage. Pinning the
      // prototype is what catches an accidental widening of the surface.
      //
      // `resolveScaling` is `private` in TypeScript, which is a compile-time
      // guarantee and not a runtime one, so it appears here. It is not part of the
      // port and no consumer can name it.
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
   * Whether a plain object carries a key, without the case-insensitive matching the
   * production lookup applies.
   *
   * Declared here rather than imported so that the `EUR`-absence assertion says
   * something about the FIXTURE, in plain JavaScript terms, instead of restating
   * the very lookup it is meant to constrain.
   */
  function structKeyPresent(struct: Readonly<Record<string, string>>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(struct, key);
  }
});

// ---------------------------------------------------------------------------
// The batch-write collaborator: ONE unit of work for a repriced SKU set (F3)
// ---------------------------------------------------------------------------

describe('the SKU batch-write collaborator the root supplies to ProductService (F3)', () => {
  // ★★★ WHAT THIS BLOCK IS FOR, AND WHY IT CANNOT LIVE IN THE SERVICE SUITE.
  // `tests/unit/services/productService.test.ts` proves the SERVICE hands its whole repriced set to
  // ONE collaborator call, against a double. It cannot prove what the REAL collaborator does with
  // that call, because the transaction is the composition root's - `SkuRepository` is locked at seven
  // members and refuses a bulk save, and a port member naming a `PreparedStatementExecutor` would put
  // a `src/repositories/**` type on a `src/domain/**` interface, which the layer-boundary rule
  // refuses. So the root supplies the capability and this block asserts the root's half: exactly one
  // transaction, every write inside it, and none at all for an empty set.
  //
  // CFML parity [model/service/ProductService.cfc:L216-L233]: the legacy method persists nothing
  // itself - `HibachiService.process()` [org/Hibachi/HibachiService.cfc:L84-L129] never saves - and
  // [L232] handed back MANAGED entities whose Hibernate session flushed every dirtied SKU as ONE unit
  // inside the request's `cftransaction`. One transaction here is that flush, written down.

  /** A product carrying `count` SKUs, all hydrated off the shared fixtures. */
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
   * default `FOUND_ROWS` flag, so a `0` means the row the caller believes it holds is gone - which is
   * why `1` is passed rather than left at the stub's default.
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

    // ONE unit of work, not four. This is the assertion the defect turned on: with one unit per SKU,
    // a PERMANENT failure on the third left the first two durably repriced and every retry
    // reproduced that identical split, because idempotency by key makes a retry SAFE without making
    // an unreachable write SUCCEED.
    expect(executor.transactionsOpened).toBe(1);

    // AND THE ADAPTER'S OWN PER-SKU TRANSACTIONS JOINED IT rather than opening units of their own,
    // which is what makes the count above trustworthy: there were MORE `transaction` calls than
    // units begun, and they nested, exactly as the real executor documents. Asserted as a relation
    // rather than as a fixed pair so it cannot be broken by an unrelated adapter gaining or losing
    // a wrapper.
    expect(executor.transactionCalls).toBeGreaterThan(executor.transactionsOpened);
    expect(executor.maximumTransactionDepth).toBeGreaterThan(1);

    // EVERY SKU WAS ACTUALLY WRITTEN INSIDE IT, so this is not passing because nothing happened.
    // Four SKUs mean at least four `SwSku` updates; the adapter also reconciles each SKU's
    // `SwSkuOption` membership, so the count is asserted as a floor on the SKU updates rather than
    // as an exact total.
    const skuUpdates = executor.mutations.filter((mutation) => mutation.sql.includes('SwSku'));

    expect(skuUpdates.length).toBeGreaterThanOrEqual(4);

    // [L232] the argument product comes back.
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
    // unconditionally, and the collaborator returns before reaching the executor. A Hibernate
    // session that dirtied no entity opened no transaction either.
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
