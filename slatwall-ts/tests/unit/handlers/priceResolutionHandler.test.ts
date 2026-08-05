// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the price-resolution primary adapter
//
// WHAT THIS PINS
//   src/handlers/priceResolutionHandler.ts - the Lambda entrypoint fronting the price-group and
//   currency resolution surface of the TypeScript / AWS Lambda `nodejs20.x` port of the Slatwall
//   3.1.39 catalog + promotions/pricing slice (`version.txt` = `3.1.39`).
//
//   The entrypoint owns FOUR concerns and this suite is organised around exactly those four:
//     1. parsing and validation of the wire document,
//     2. delegation to one already-ported member per operation,
//     3. shaping of the response,
//     4. mapping of anything thrown.
//
//   It owns NO business logic, and the highest-value cases below are the ones proving that: no
//   cascade walking, no rate selection, no rounding, no percentage arithmetic, no currency
//   conversion, no defaulting and no clamping happens in transit. Whatever the ported service
//   answered is what leaves, byte for byte.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE PRESENTED AS PARITY.
// ---------------------------------------------------------------------------
//   The plan's handler transformation table records this row with source file "-" and change
//   "Net-new entrypoint exposing the price-group and currency resolution surface", so there is no
//   `.cfc` antecedent for the subject and none for its tests. The legacy tree holds 32 test
//   components and NOT ONE of them tests a handler, because the legacy architecture has no handler
//   tier: `meta/tests/unit/service/` contains only AccountServiceTest, HibachiServiceTest,
//   PaymentServiceTest and UtilityRBServiceTest, none of them in scope.
//
//   The only legacy suites extended anywhere in this port are [meta/tests/unit/entity/BrandTest.cfc]
//   and [meta/tests/unit/entity/ProductTest.cfc], and
//   [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing zero
//   coverage. NO CASE BELOW HAS A LEGACY ANTECEDENT. What IS legacy here is the BEHAVIOUR the cases
//   assert - the five-level cascade, the amount-type asymmetry, the measured rounding outputs, the
//   load-bearing absences - and every one of those is cited to the line it was read from.
//
//   The one convention carried over from the legacy harness is naming: [meta/tests/unit/Helper.cfc]
//   builds its subject per test, which is what the per-test construction below reproduces, and
//   [meta/tests/unit/IssuesTest.cfc] names ticket regressions `issue_<ticket#>`. No such ticket
//   exists for this entrypoint, so none is invented.
//
// NO USER RULES WERE PROVIDED
//   The project rules source returns exactly "No user rules provided." for both a default read and
//   an explicit whole-document read, and the plan records the same. NO RULE IS INVENTED, IMPLIED OR
//   CITED anywhere in this file, and their absence is not licence to lower the bar: the standards
//   this subtree already holds itself to - maximal strictness, one arithmetic surface, no credential
//   in source, environment-independent tests, annotated judgment calls - are applied here in full.
//
// HOW THE SUBJECT IS DRIVEN, AND WHY IT IS DRIVEN TWO WAYS
//   `dispatchPriceResolution(scope, request)` is the seam the module publishes for exactly this
//   purpose: it takes the request scope as a PARAMETER, so a suite builds a six-member fake and
//   drives all thirteen operations with no composition root, no database, no pool, no network, no
//   filesystem and no environment. Everything about delegation, absence and serialisation is
//   asserted through it.
//
//   `handler(event, lambdaContext)` obtains its scope from the memoized composition root instead, so
//   it is driven ONLY on the paths that resolve BEFORE that call - routing, body reading and schema
//   rejection. That is a deliberate boundary, not a gap: reaching the composition root would make
//   these cases depend on five environment variables and could open a connection pool, and both are
//   forbidden here. Each such case additionally asserts that NOTHING was wired, by reading the
//   process's own log stream.
//
// THE ENVIRONMENT CONTRACT
//   Every case passes with a COMPLETELY EMPTY environment. Nothing here reads `process.env`,
//   nothing imports `src/lib/config.ts`, no `.env` is required, no host name, network address,
//   account name or authentication value appears, and no value resembling a credential is written.
//   Identifiers are invented, obviously-fake sentinels.
//
// THREE DECLARED DEPENDENCIES ARE DELIBERATELY NOT IMPORTED, AND EACH ABSENCE IS A FINDING
//   * `src/services/roundingRuleService.ts`. THE SUBJECT DOES NOT EXPOSE IT AT ALL, so there is no
//     `roundValue`, `roundValueByRoundingRule`, `roundValueByRoundingRuleID` or
//     `getRoundingRuleDetailsByID` on this surface to assert against. That is correct rather than
//     an omission: rounding is reached through the ENTITY - [model/service/PriceGroupService.cfc:L327]
//     calls `arguments.priceGroupRate.getRoundingRule().roundValue(newPrice)` and
//     `RoundingRule.roundValue(value)` is a ONE-ARGUMENT entity method
//     [model/entity/RoundingRule.cfc:L66-L68] - which is why `PriceGroupService.cfc` declares only
//     three collaborators and never injects the rounding service. What this suite asserts instead is
//     stronger and belongs to this tier: that the boundary NEVER ROUNDS, proven by a recording value
//     rounder that must still hold zero calls after a rate has been serialised, and that the
//     measured decimal outputs pass through unaltered. The service's own algorithm, including its
//     request-scoped memo, is pinned by `tests/unit/services/roundingRuleService.test.ts`.
//   * `src/handlers/bootstrap.ts`. Never imported and never called - see above.
//   * `src/lib/logger.ts`. Never imported because the module-level logger is `Object.freeze`d
//     precisely so its emitting surface cannot be reshaped at run time, so it cannot be substituted
//     from here. Emissions are observed where they actually land instead - at
//     `process.stdout.write`, which is the sink `writeLineToStdout` uses - and the capture DELEGATES
//     to the original write, so nothing is silenced and no stream is globally patched.
//     `src/domain/ports/settingsProvider.ts` is likewise not imported: the subject resolves no
//     setting, and the seven-key provider reaches the SKU through the fixture that builds it.
//
// NO INVENTED NON-FUNCTIONAL REQUIREMENT APPEARS ANYWHERE IN THIS FILE
//   No service-level objective, no timing, duration, rate or availability figure, and no benchmark.
//   The legacy runtime's three lock timeouts are noted in the plan and deliberately not implemented,
//   so nothing here asserts one. Where a legacy defect is a potential non-terminating loop the case
//   is framed as CORRECTNESS - which member is reachable, and what a caller is told - never as a
//   measured duration.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import type { CurrentAccountContext } from '../../../src/domain/ports/priceGroupRepository.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { ErrorResponseBody } from '../../../src/handlers/errorMapper.js';
import type {
  PriceResolutionOperation,
  PriceResolutionRequest,
  PriceResolutionResult,
  PriceResolutionScope,
  PriceResolutionSkuSelector,
  UnresolvedReason,
} from '../../../src/handlers/priceResolutionHandler.js';
import { dispatchPriceResolution, handler } from '../../../src/handlers/priceResolutionHandler.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
import { PriceGroupService } from '../../../src/services/priceGroupService.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// Invented sentinels and explicit instants
//
// Every identifier below is obviously fabricated and resembles no credential. Every instant is an
// explicit UTC ISO-8601 literal: there is no bare `new Date()` and no `Date.now()` in this file, so
// no case can pass or fail by the clock. `tests/setup.ts` additionally pins the process to UTC and
// proves it before any suite imports a subject.
// ---------------------------------------------------------------------------

/** The instant every scope below resolves against. Rendered back by the response's `resolvedAt`. */
const RESOLVED_AT = '2024-06-15T12:30:00.000Z';

/** A second, distinct instant, so "the response echoes THIS scope's clock" is falsifiable. */
const ALTERNATE_RESOLVED_AT = '2025-01-02T03:04:05.678Z';

/** Correlation identifier, shaped like the one the Lambda runtime supplies. */
const REQUEST_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

/** The authenticated account, reduced to an opaque identifier - never a name and never an address. */
const ACCOUNT_ID = 'account-9f13c7';

/**
 * Planted internal detail, long and unique and free of regular-expression metacharacters so a
 * substring search cannot produce a false result either way. It stands in for the class of text a
 * failure legitimately carries and a response body must never publish: a driver message, a resolved
 * path, an echo of submitted input.
 */
const PLANTED_INTERNAL_DETAIL = 'PLANTED-INTERNAL-DETAIL-6d20f4b91c3e';

/** The secondary eligible currency the SKU fixture generates rows for. */
const SECONDARY_CURRENCY_CODE = 'EUR';

/** A currency the SKU fixture never makes eligible, so the cascade never records a price for it. */
const INELIGIBLE_CURRENCY_CODE = 'JPY';

/** A two-character currency code: refused by the converter arm, ANSWERED by the accessor arms. */
const SHORT_CURRENCY_CODE = 'EU';

/**
 * Zero, as a decimal string, used for exactly one purpose: building the value object's own rendering
 * of zero so a test can assert it NEVER reaches the wire. A missing price must survive serialisation
 * as an absence [model/entity/Sku.cfc:L269-L285], and zero is the substitution that would silently
 * sell product for nothing, so zero appears in this suite only ever as a prohibition.
 */
const ZERO_DECIMAL = '0';

/** The exact wording `./errorMapper.js` publishes for a schema-rejected or unusable input. */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/** The exact wording published for a failure the mapper does not recognise. */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/**
 * The framework's terminal dead-call-target message, reproduced EXACTLY as both tiers throw it -
 * including the grammatical error "does not exists" and the word "entity", which the service tier
 * emits too because its copy is byte-identical.
 *
 * LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the
 * framework's `onMissingMethod` throw is ungrammatical and the service-tier copy still says
 * "entity". It is an OBSERVABLE ERROR CONTRACT and is reproduced verbatim rather than corrected.
 * Preserved deliberately; do not fix without a product decision.
 *
 * The method named is the real dead target behind DEFECT 16 [model/entity/Sku.cfc:L258], where
 * `getPriceByPromotion` calls a `calculateSkuPriceBasedOnPromotion` that no component declares.
 */
const MISSING_METHOD_CONTRACT_MESSAGE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

/**
 * The DIFFERENT variant thrown by `invokeMethod` rather than by an `onMissingMethod`.
 *
 * It diverges on four independent counts - different opening clause, no `()`, correct grammar, no
 * trailing " entity." - so the recogniser cannot match it even by accident, and it must therefore
 * reach a caller as the generic sentence. Conflating the two is exactly the mistake this case
 * exists to catch [org/Hibachi/HibachiObject.cfc:L126].
 */
const UNRECOGNISED_FRAMEWORK_MESSAGE =
  'You have attempted to call the method calculateSkuPriceBasedOnPromotion which does not exist in Slatwall.model.entity.Sku';

/** Every operation the subject publishes, in the order its own union declares them. */
const ALL_OPERATIONS: readonly PriceResolutionOperation[] = [
  'getRateForProductTypeBasedOnPriceGroup',
  'getRateForProductBasedOnPriceGroup',
  'getRateForSkuBasedOnPriceGroup',
  'calculateSkuPriceBasedOnCurrentAccount',
  'calculateSkuPriceBasedOnAccount',
  'calculateSkuPriceBasedOnPriceGroup',
  'calculateSkuPriceBasedOnPriceGroupRate',
  'getBestPriceGroupDetailsBasedOnSkuAndAccount',
  'getPriceGroupDataJSON',
  'getPriceByCurrencyCode',
  'getListPriceByCurrencyCode',
  'getRenewalPriceByCurrencyCode',
  'convertCurrency',
];

/**
 * The nine price-group members the subject's scope exposes.
 *
 * Typed as the scope's own key union, so a member added to or removed from
 * `PriceResolutionScope['priceGroupService']` fails to compile here rather than passing silently.
 */
type ExposedPriceGroupMember = keyof PriceResolutionScope['priceGroupService'];

const EXPOSED_PRICE_GROUP_MEMBERS: readonly ExposedPriceGroupMember[] = [
  'getRateForProductTypeBasedOnPriceGroup',
  'getRateForProductBasedOnPriceGroup',
  'getRateForSkuBasedOnPriceGroup',
  'calculateSkuPriceBasedOnCurrentAccount',
  'calculateSkuPriceBasedOnAccount',
  'calculateSkuPriceBasedOnPriceGroup',
  'calculateSkuPriceBasedOnPriceGroupRate',
  'getBestPriceGroupDetailsBasedOnSkuAndAccount',
  'getPriceGroupDataJSON',
];

/**
 * The four members of the ported service that this entrypoint withholds.
 *
 * JUDGMENT CALL: `updateOrderAmountsWithPriceGroups` is deliberately not routable here; it is the
 * writer half consumed by the promotion base-price branch at
 * [model/service/PromotionService.cfc:L241]. It is withheld TWICE OVER - `PriceResolutionCapability`
 * is `PriceGroupService` minus that member, so naming it would not compile, and the scope's `Pick`
 * never lists it either. The other three are the service's WRITE members
 * [model/service/PriceGroupService.cfc:L184, L397, L461]; a resolution surface is a read surface,
 * and price-group administration lives in the `admin/` subsystem the plan places entirely out of
 * scope. Their names are carried VERBATIM, mid-name capital `SKU` included.
 */
const WITHHELD_PRICE_GROUP_MEMBERS: readonly string[] = [
  'updateOrderAmountsWithPriceGroups',
  'updatePriceGroupSKUSettings',
  'savePriceGroupRate',
  'deletePriceGroup',
];

// ---------------------------------------------------------------------------
// Entity types, DERIVED from the published surface rather than imported
//
// `src/domain/entities/**` is not among this file's declared dependencies, and deriving each type
// from the signature that produces it is better than importing anyway: the compiler recomputes them
// from the subject's own scope type, so this suite cannot drift from the shapes it actually feeds in.
// It is the same derivation the subject performs on itself.
// ---------------------------------------------------------------------------

type ResolvedProduct = Awaited<
  ReturnType<PriceResolutionScope['productService']['findProducts']>
>['records'][number];

type ResolvedProductPage = Awaited<
  ReturnType<PriceResolutionScope['productService']['findProducts']>
>;

type ProductQuery = Parameters<PriceResolutionScope['productService']['findProducts']>[0];

type ResolvedSku = Awaited<
  ReturnType<PriceResolutionScope['skuService']['getProductSkus']>
>[number];

type ResolvedPriceGroup = NonNullable<
  Awaited<
    ReturnType<
      PriceResolutionScope['priceGroupService']['getBestPriceGroupDetailsBasedOnSkuAndAccount']
    >
  >['priceGroup']
>;

type ResolvedPriceGroupRate = NonNullable<
  ReturnType<PriceResolutionScope['priceGroupService']['getRateForSkuBasedOnPriceGroup']>
>;

type ResolvedProductType = NonNullable<ReturnType<ResolvedProduct['getProductType']>>;

/**
 * The two fixture options bags, derived from the factory signatures.
 *
 * Both `overrides` interfaces are declared locally inside their factory and are NOT exported, which
 * is correct - the shape is an implementation detail of the factory. Reading them off
 * `Parameters<typeof …>` is not importing them; it is asking the published signature what it accepts,
 * so a member renamed in a fixture fails to compile here instead of being silently ignored.
 */
type SkuOverrides = NonNullable<Parameters<typeof makeSkuFixture>[0]>;
type PriceGroupOverrides = NonNullable<Parameters<typeof makePriceGroupFixtures>[0]>;

/** One complete, independent price-group graph, as its factory hands it back. */
type PriceGroupGraph = ReturnType<typeof makePriceGroupFixtures>;

// ---------------------------------------------------------------------------
// Narrowing readers
//
// Every read of an unknown value below narrows with a `typeof` or shape probe and RAISES on a
// mismatch. Nothing is asserted into place: a response that is not the documented envelope fails the
// case that read it rather than producing a confusing downstream comparison.
// ---------------------------------------------------------------------------

/** Narrow a value that must be defined, naming what was missing. */
function requireDefined<TValue>(value: TValue | undefined, what: string): TValue {
  if (value === undefined) {
    throw new Error(`the fixture graph carried no ${what}`);
  }

  return value;
}

/** Narrow a value that must be a plain object, naming where it was read from. */
function readObject(value: unknown, what: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }

  return { ...value };
}

/** Narrow a value that must be a string, naming where it was read from. */
function readString(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${what} is not a string`);
  }

  return value;
}

/** The four categories `./errorMapper.js` publishes, and no others. */
const MAPPED_CATEGORIES: readonly ErrorResponseBody['error']['category'][] = [
  'missingMethod',
  'routeNotFound',
  'invalidRequest',
  'unrecognized',
];

/** Narrow the envelope's category against the closed union rather than asserting it into shape. */
function readCategory(value: unknown): ErrorResponseBody['error']['category'] {
  const text = readString(value, 'error.category');
  const matched = MAPPED_CATEGORIES.find((candidate) => candidate === text);

  if (matched === undefined) {
    throw new Error(`error.category is outside the published set: ${text}`);
  }

  return matched;
}

/** What one mapped response says, plus the raw body so a leak anywhere in it is detectable. */
interface ReadErrorEnvelope {
  readonly category: ErrorResponseBody['error']['category'];
  readonly message: string;
  readonly requestId: string;
  /** The member names present on `error`, so "never present and empty" is checkable. */
  readonly memberNames: readonly string[];
  /** The body exactly as it would travel. */
  readonly raw: string;
}

/** Read a mapped error response, proving the envelope shape on the way. */
function readErrorEnvelope(response: APIGatewayProxyResult): ReadErrorEnvelope {
  const raw = response.body;
  const envelope = readObject(JSON.parse(raw), 'the response body');
  const error = readObject(envelope.error, 'the response envelope');

  return {
    category: readCategory(error.category),
    message: readString(error.message, 'error.message'),
    requestId: readString(error.requestId, 'error.requestId'),
    memberNames: Object.keys(error),
    raw,
  };
}

/**
 * Compare two decimal numerals BY VALUE, never by string identity.
 *
 * `'12.350'` and `'12.35'` are the same amount of money and different strings, so a string
 * comparison is the wrong test for "did this value survive". `cfNumericEquals` performs the
 * comparison the rounding algorithm's own candidate test performs
 * [model/service/RoundingRuleService.cfc:L120], through the arbitrary-precision decimal that is this
 * port's single arithmetic surface - no `Number()`, no `parseFloat`, no subtraction of floats.
 */
function expectSameDecimalValue(actual: string, expected: DecimalString): void {
  expect(cfNumericEquals(actual, expected)).toBe(true);
}

/** Narrow a dispatch result to the `price` outcome, failing loudly on anything else. */
function expectPriceOutcome(result: PriceResolutionResult): string {
  if (result.outcome !== 'price') {
    throw new Error(`expected the price outcome, received ${result.outcome}`);
  }

  return result.price.amount;
}

/** Narrow a dispatch result to the `unresolved` outcome and hand back its reason. */
function expectUnresolvedOutcome(result: PriceResolutionResult): UnresolvedReason {
  if (result.outcome !== 'unresolved') {
    throw new Error(`expected the unresolved outcome, received ${result.outcome}`);
  }

  return result.reason;
}

/** Narrow a dispatch result to the `priceGroupRate` outcome. */
function expectRateOutcome(
  result: PriceResolutionResult,
): Extract<PriceResolutionResult, { outcome: 'priceGroupRate' }>['rate'] {
  if (result.outcome !== 'priceGroupRate') {
    throw new Error(`expected the priceGroupRate outcome, received ${result.outcome}`);
  }

  return result.rate;
}

/** Narrow a dispatch result to the `currencyPrice` outcome. */
function expectCurrencyPriceOutcome(
  result: PriceResolutionResult,
): Extract<PriceResolutionResult, { outcome: 'currencyPrice' }>['price'] {
  if (result.outcome !== 'currencyPrice') {
    throw new Error(`expected the currencyPrice outcome, received ${result.outcome}`);
  }

  return result.price;
}

/**
 * The resolved rate a `priceGroupRate` outcome carries, or a raise.
 *
 * Kept separate from {@link expectRateOutcome} so a case can assert the ABSENCE arm without this
 * helper narrowing it away.
 */
function expectResolvedRate(
  result: PriceResolutionResult,
): Extract<
  Extract<PriceResolutionResult, { outcome: 'priceGroupRate' }>['rate'],
  { resolved: true }
>['rate'] {
  const rate = expectRateOutcome(result);

  if (!rate.resolved) {
    throw new Error(`expected a resolved rate, received ${rate.reason}`);
  }

  return rate.rate;
}

/**
 * A member the suite proves is never reached.
 *
 * Refusing loudly rather than answering is the point: a double that quietly returned a plausible
 * value would let an unexpected call pass as a success, and the properties this suite exists to
 * establish - one outcome-producing call per operation, no write member on a read surface, no
 * repository touched at the boundary - are exactly the ones that failure mode would hide.
 */
function refuse(member: string): never {
  throw new Error(`this suite's double refuses ${member}: the subject must not reach it`);
}

/** Settle on a later microtask, so "the subject awaited this" is falsifiable. */
async function settleLater<TValue>(value: TValue): Promise<TValue> {
  await Promise.resolve();
  await Promise.resolve();

  return value;
}

// ---------------------------------------------------------------------------
// Suite-local hand-written doubles
//
// Every one is written by hand: no mocking library, no factory library, no container, no generated
// stub. Each is built INSIDE the case that uses it, holds only its own arrays, and is discarded with
// the case - which matters in this port specifically, because module-level state surviving between
// unrelated invocations on a warm container is the hazard four legacy component-level caches are
// re-scoped to avoid.
//
// The only pre-built collaborators used anywhere here are the two fixture factories, and both hand
// back A FRESH GRAPH ON EVERY CALL, so two calls share no mutable object.
// ---------------------------------------------------------------------------

/** One recorded invocation of the price-group surface. */
interface RecordedServiceCall {
  readonly member: ExposedPriceGroupMember;
  readonly args: readonly unknown[];
}

/**
 * What the price-group double answers, member by member.
 *
 * Members are optional AND admit an explicit `undefined`, which differ under
 * `exactOptionalPropertyTypes`: this is an options bag, so omitting a member and stating it absent
 * mean the same thing. The DEFAULTS are the legacy's own answers, not conveniences - a `getRateFor*`
 * with nothing configured answers NOTHING, reproducing the no-`else` fall-off at
 * [model/service/PriceGroupService.cfc:L96-L98], [L135-L137] and [L178-L180], and a calculation with
 * nothing configured answers the SKU's OWN price, reproducing the pass-through at [L312] and the
 * not-signed-in arm at [L266]. Neither default is ever zero.
 */
interface PriceGroupAnswers {
  readonly rateForProductType?: ResolvedPriceGroupRate | undefined;
  readonly rateForProduct?: ResolvedPriceGroupRate | undefined;
  readonly rateForSku?: ResolvedPriceGroupRate | undefined;
  readonly priceForPriceGroup?: Money | undefined;
  readonly priceForRate?: Money | undefined;
  readonly priceForCurrentAccount?: Money | undefined;
  readonly priceForAccount?: Money | undefined;
  readonly bestPrice?: Money | undefined;
  readonly bestPriceGroup?: ResolvedPriceGroup | undefined;
  readonly priceGroupDataJSON?: string | undefined;
  /** A failure to raise from one named member, so the mapping paths are drivable. */
  readonly failing?: { readonly member: ExposedPriceGroupMember; readonly thrown: unknown };
  /** Settle the four asynchronous answers on a later microtask. */
  readonly deferred?: boolean | undefined;
}

/** The price-group double, and the record of what the subject asked it. */
interface PriceGroupServiceDouble {
  readonly service: PriceResolutionScope['priceGroupService'];
  readonly calls: readonly RecordedServiceCall[];
}

/**
 * Build the price-group double.
 *
 * ★ THE SYNCHRONOUS AND ASYNCHRONOUS MEMBERS ARE WRITTEN AS WHAT THEY ARE, AND THAT IS THE
 * CONTRACT UNDER TEST. Five members return a value directly -
 * `getRateForProductTypeBasedOnPriceGroup` [model/service/PriceGroupService.cfc:L57],
 * `getRateForProductBasedOnPriceGroup` [L102], `getRateForSkuBasedOnPriceGroup` [L140],
 * `calculateSkuPriceBasedOnPriceGroup` [L301] and `calculateSkuPriceBasedOnPriceGroupRate` [L316] -
 * because their legacy bodies traverse already-materialised associations and perform pure
 * arithmetic, and the async-boundary rule makes a member asynchronous if and only if its legacy body
 * reached the DAO or the ORM. Four return promises: `calculateSkuPriceBasedOnCurrentAccount` [L262],
 * `calculateSkuPriceBasedOnAccount` [L271], `getBestPriceGroupDetailsBasedOnSkuAndAccount` [L343]
 * and `getPriceGroupDataJSON` [L230]. Writing a sync member as a promise-returning one would not
 * compile against the scope type, which is what makes the split a compile-time fact.
 */
function makePriceGroupServiceDouble(answers: PriceGroupAnswers = {}): PriceGroupServiceDouble {
  const calls: RecordedServiceCall[] = [];

  const record = (member: ExposedPriceGroupMember, ...args: readonly unknown[]): void => {
    calls.push({ member, args: [...args] });

    if (answers.failing !== undefined && answers.failing.member === member) {
      throw answers.failing.thrown;
    }
  };

  const settle = <TValue>(value: TValue): Promise<TValue> =>
    answers.deferred === true ? settleLater(value) : Promise.resolve(value);

  const service: PriceResolutionScope['priceGroupService'] = {
    getRateForProductTypeBasedOnPriceGroup: (
      productType: ResolvedProductType,
      priceGroup: ResolvedPriceGroup,
    ): ResolvedPriceGroupRate | undefined => {
      record('getRateForProductTypeBasedOnPriceGroup', productType, priceGroup);

      return answers.rateForProductType;
    },

    getRateForProductBasedOnPriceGroup: (
      product: ResolvedProduct,
      priceGroup: ResolvedPriceGroup,
    ): ResolvedPriceGroupRate | undefined => {
      record('getRateForProductBasedOnPriceGroup', product, priceGroup);

      return answers.rateForProduct;
    },

    getRateForSkuBasedOnPriceGroup: (
      sku: ResolvedSku,
      priceGroup: ResolvedPriceGroup,
    ): ResolvedPriceGroupRate | undefined => {
      record('getRateForSkuBasedOnPriceGroup', sku, priceGroup);

      return answers.rateForSku;
    },

    calculateSkuPriceBasedOnPriceGroup: (
      sku: ResolvedSku,
      priceGroup: ResolvedPriceGroup,
    ): Money => {
      record('calculateSkuPriceBasedOnPriceGroup', sku, priceGroup);

      // [L312]: the legacy returns `sku.getPrice()` when no rate applied. Never zero.
      return answers.priceForPriceGroup ?? sku.getPrice();
    },

    calculateSkuPriceBasedOnPriceGroupRate: (
      sku: ResolvedSku,
      priceGroupRate: ResolvedPriceGroupRate,
    ): Money => {
      record('calculateSkuPriceBasedOnPriceGroupRate', sku, priceGroupRate);

      // [L319]: the seed is the SKU's own price, which is also what an unrecognised `amountType`
      // passes straight through, there being no `default:` arm.
      return answers.priceForRate ?? sku.getPrice();
    },

    calculateSkuPriceBasedOnCurrentAccount: (
      sku: ResolvedSku,
      context: CurrentAccountContext,
    ): Promise<Money> => {
      record('calculateSkuPriceBasedOnCurrentAccount', sku, context);

      // [L263-L266]: this member OWNS the signed-in test - the adapter hands the context over whole
      // and does not short-circuit on it - and its else arm answers the SKU's own price.
      return settle(answers.priceForCurrentAccount ?? sku.getPrice());
    },

    calculateSkuPriceBasedOnAccount: (sku: ResolvedSku, accountID: string): Promise<Money> => {
      record('calculateSkuPriceBasedOnAccount', sku, accountID);

      return settle(answers.priceForAccount ?? sku.getPrice());
    },

    getBestPriceGroupDetailsBasedOnSkuAndAccount: (
      sku: ResolvedSku,
      accountID: string,
    ): Promise<{ readonly price: Money; readonly priceGroup: ResolvedPriceGroup | undefined }> => {
      record('getBestPriceGroupDetailsBasedOnSkuAndAccount', sku, accountID);

      // [L347]: seeded with the SKU's own price, so `price` is always present.
      return settle({
        price: answers.bestPrice ?? sku.getPrice(),
        priceGroup: answers.bestPriceGroup,
      });
    },

    getPriceGroupDataJSON: (): Promise<string> => {
      record('getPriceGroupDataJSON');

      return settle(answers.priceGroupDataJSON ?? '{}');
    },
  };

  return { service, calls };
}

/** One recorded conversion request. */
interface RecordedConversion {
  readonly amount: Money;
  readonly originalCurrencyCode: string;
  readonly convertToCurrencyCode: string;
}

/** The currency-converter double, narrowed to the one member the subject exposes. */
interface CurrencyConverterDouble {
  readonly converter: PriceResolutionScope['currencyConverter'];
  readonly conversions: readonly RecordedConversion[];
}

/**
 * Build the currency-converter double.
 *
 * CFML parity [model/service/CurrencyService.cfc:L100-L101]: with no answer configured this returns
 * the amount UNCONVERTED, which is exactly what the legacy does when it holds no rate for either
 * code. It NEVER THROWS - the legacy has no failure path at all here, and the legacy
 * `// TODO: Add integration support` at [L81] stays a carried-forward note rather than becoming an
 * invented error mode. A caller cannot tell a converted amount from an unconverted one, and nothing
 * here pretends otherwise.
 */
function makeCurrencyConverterDouble(answer?: Money): CurrencyConverterDouble {
  const conversions: RecordedConversion[] = [];

  return {
    conversions,
    converter: {
      convertCurrency: (
        amount: Money,
        originalCurrencyCode: string,
        convertToCurrencyCode: string,
      ): Promise<Money> => {
        conversions.push({ amount, originalCurrencyCode, convertToCurrencyCode });

        return Promise.resolve(answer ?? amount);
      },
    },
  };
}

/** One recorded SKU read. */
interface RecordedSkuRead {
  readonly product: ResolvedProduct;
  readonly sorted: boolean;
  readonly fetchOptions: boolean | undefined;
}

/** The two published catalog reads the subject uses to resolve a selector. */
interface CatalogReadsDouble {
  readonly productService: PriceResolutionScope['productService'];
  readonly skuService: PriceResolutionScope['skuService'];
  readonly productQueries: readonly ProductQuery[];
  readonly skuReads: readonly RecordedSkuRead[];
}

/**
 * Build the catalog reads.
 *
 * Both doubles answer UNFILTERED, and that is deliberate: the published product search is a
 * `productName LIKE ?` scan and the published SKU read adds no `DISTINCT`, so narrowing a selector
 * down to one candidate is the SUBJECT's work. A double that filtered would do the subject's job for
 * it and the refuse-rather-than-choose cases below would all pass vacuously.
 */
function makeCatalogReadsDouble(
  products: readonly ResolvedProduct[],
  skus: readonly ResolvedSku[],
): CatalogReadsDouble {
  const productQueries: ProductQuery[] = [];
  const skuReads: RecordedSkuRead[] = [];

  const page: ResolvedProductPage = {
    records: [...products],
    recordsCount: products.length,
    pageRecordsStart: 0,
    pageRecordsShow: undefined,
    entityName: 'SlatwallProduct',
    // [model/dao/ProductDAO.cfc:L421] selects from `SwProduct` alone, so the executed statement
    // joins nothing and the keyword matches `productName` and only `productName`, at weight 1.
    joins: [],
    keywordProperties: [{ propertyIdentifier: 'productName', weight: 1 }],
  };

  return {
    productQueries,
    skuReads,
    productService: {
      findProducts: (criteria: ProductQuery): Promise<ResolvedProductPage> => {
        productQueries.push(criteria);

        return Promise.resolve(page);
      },
    },
    skuService: {
      getProductSkus: (
        product: ResolvedProduct,
        sorted: boolean,
        fetchOptions?: boolean,
      ): Promise<ResolvedSku[]> => {
        skuReads.push({ product, sorted, fetchOptions });

        return Promise.resolve([...skus]);
      },
    },
  };
}

/** Everything one scope needs, with the two doubles a case usually wants to reach afterwards. */
interface ScopeParts {
  readonly catalog: CatalogReadsDouble;
  readonly priceGroupService: PriceResolutionScope['priceGroupService'];
  readonly currencyConverter?: PriceResolutionScope['currencyConverter'] | undefined;
  readonly accountID?: string | undefined;
  readonly now?: string | undefined;
}

/**
 * Assemble one request scope.
 *
 * ★ THE ACCOUNT IS EXPRESSED AS THE EXPLICIT CONTEXT AND NOTHING ELSE (T6). The legacy body reaches
 * the request scope through TWO ambient accessors in adjacent lines
 * [model/service/PriceGroupService.cfc:L263-L264], and the target replaces both with this parameter.
 * `CurrentAccountContext` carries an OPTIONAL ACCOUNT IDENTIFIER AND NOTHING ELSE - no session, no
 * locale, no currency, no time zone, no permission, no correlation identifier and no logger - so
 * "signed in with no account" and "not signed in but here is an account" are both unrepresentable.
 * Under `exactOptionalPropertyTypes` an absent account is an OMITTED KEY rather than a present
 * `undefined`, which is why the two arms are built separately below.
 */
function makeScope(parts: ScopeParts): PriceResolutionScope {
  const currentAccountContext: CurrentAccountContext =
    parts.accountID === undefined ? {} : { accountID: parts.accountID };

  return {
    now: new Date(parts.now ?? RESOLVED_AT),
    currentAccountContext,
    productService: parts.catalog.productService,
    skuService: parts.catalog.skuService,
    priceGroupService: parts.priceGroupService,
    currencyConverter: parts.currencyConverter ?? makeCurrencyConverterDouble().converter,
  };
}

/** One SKU, its product, that product's product type, and the selector naming them. */
interface SkuWorld {
  readonly sku: ResolvedSku;
  readonly product: ResolvedProduct;
  readonly productType: ResolvedProductType;
  readonly selector: PriceResolutionSkuSelector;
  readonly catalog: CatalogReadsDouble;
}

/**
 * Build one SKU world.
 *
 * The selector is read OFF the entities rather than written as literals, so no case can drift from
 * the fixture, and the product handed to the catalog double is the SKU'S OWN - which is what makes
 * the three `getRateFor*` entry points coherent rather than merely callable, reproducing
 * [model/service/PriceGroupService.cfc:L154], where the argument is `arguments.sku.getProduct()`.
 */
function makeSkuWorld(overrides?: SkuOverrides): SkuWorld {
  const sku = makeSkuFixture(overrides);
  const product = requireDefined(sku.getProduct(), 'product on the sku fixture');
  const productType = requireDefined(
    product.getProductType(),
    'productType on the product fixture',
  );

  const selector: PriceResolutionSkuSelector = {
    productName: requireDefined(product.getProductName(), 'productName on the product fixture'),
    skuCode: requireDefined(sku.getSkuCode(), 'skuCode on the sku fixture'),
  };

  return { sku, product, productType, selector, catalog: makeCatalogReadsDouble([product], [sku]) };
}

// ---------------------------------------------------------------------------
// The Lambda invocation surface
//
// `handler` is driven only on the paths that resolve before the composition root is reached, so the
// event carries exactly the five members the subject reads and the context carries the one it reads.
// ---------------------------------------------------------------------------

/**
 * The parts of a version 1.0 proxy event this entrypoint actually reads.
 *
 * Verified by reading the subject: `routeRequestFromEvent` takes `httpMethod` and `path`,
 * `readRequestDocument` takes `body` and `isBase64Encoded`, and `readAuthenticatedAccountID` takes
 * `requestContext.authorizer`. Nothing else is touched - no header, no query string, no path
 * parameter, no stage variable, no caller identity.
 */
interface ProxyEventFacts {
  readonly httpMethod?: string | undefined;
  readonly path?: string | undefined;
  readonly body?: string | null | undefined;
  readonly isBase64Encoded?: boolean | undefined;
  readonly authorizer?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Build a proxy event carrying those five members.
 *
 * ★ JUDGMENT CALL: ONE narrowly-scoped conversion, confined to this function, rather than
 * fabricating the twenty-odd members the subject never reads. Two reasons, and either would do on
 * its own. First, several of the unread members belong to the event's caller-identity block, whose
 * member names are credential-shaped; writing them into a suite that must contain no
 * credential-shaped text would be worse than not writing them. Second, a fabricated identity block,
 * stage variable map and multi-value header map would be twenty lines of noise that no case reads and
 * that would quietly rot as the platform type evolves. The conversion is honest about what it is: the
 * object below IS the event as far as this subject is concerned, and if the subject ever grew a sixth
 * read the case driving it would fail rather than silently see an absent member.
 */
function makeProxyEvent(facts: ProxyEventFacts = {}): APIGatewayProxyEvent {
  const partial = {
    httpMethod: facts.httpMethod ?? ROUTE_TABLE.priceResolution.methods,
    path: facts.path ?? ROUTE_TABLE.priceResolution.path,
    body: facts.body === undefined ? null : facts.body,
    isBase64Encoded: facts.isBase64Encoded ?? false,
    requestContext: { authorizer: facts.authorizer ?? null },
  };

  return partial as unknown as APIGatewayProxyEvent;
}

/**
 * Build the Lambda context.
 *
 * `awsRequestId` is the only member the subject reads - it is the correlation identifier the mapper
 * echoes so an operator can join a caller's generic response to the full detail on the log stream.
 * Every other member refuses, which proves the claim rather than asserting it: had the subject read
 * one, the case driving it would fail loudly. `getRemainingTimeInMillis` refuses for the same reason
 * AND because answering it would mean inventing a duration this migration is required not to state.
 */
function makeLambdaContext(requestId: string = REQUEST_ID): Context {
  return {
    awsRequestId: requestId,
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'price-resolution',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:price-resolution',
    memoryLimitInMB: '512',
    logGroupName: '/aws/lambda/price-resolution',
    logStreamName: '2024/06/15/[$LATEST]000000000000',
    getRemainingTimeInMillis: (): number => refuse('Context.getRemainingTimeInMillis'),
    done: (): void => refuse('Context.done'),
    fail: (): void => refuse('Context.fail'),
    succeed: (): void => refuse('Context.succeed'),
  };
}

/** One captured line from the process's own log stream, already parsed. */
interface CapturedLogLine {
  readonly level: string;
  readonly message: string;
  readonly raw: string;
}

/** A capture of everything the subject emitted while a case ran. */
interface LogStreamCapture {
  readonly lines: readonly CapturedLogLine[];
  /** Every captured line joined, so a leak anywhere in any payload is detectable. */
  readonly text: () => string;
}

/**
 * Capture the log lines the subject emits, WITHOUT silencing anything.
 *
 * ★ WHY THE STREAM AND NOT THE LOGGER. `src/lib/logger.ts` publishes an injectable sink through
 * `withSink`, and `./errorMapper.js` accepts a logger on its context - but the subject emits through
 * the MODULE-LEVEL logger, which is `Object.freeze`d precisely so its emitting surface cannot be
 * reshaped at run time. So the recording sink is installed where that logger's own sink writes:
 * `writeLineToStdout` calls `process.stdout.write`, one newline-terminated JSON object per entry.
 *
 * The capture DELEGATES to the original write, so this is not a global silencing of the console -
 * every line still reaches the stream - and the spy is per-case and is restored by the hooks. The
 * logger's mandatory, non-disableable redaction policy therefore applies to everything captured here,
 * which is what makes "the detail is on the log stream and not in the body" a checkable statement
 * rather than a claim.
 */
function captureLogStream(): LogStreamCapture {
  const lines: CapturedLogLine[] = [];
  const original = process.stdout.write.bind(process.stdout);

  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: Uint8Array | string): boolean => {
    if (typeof chunk === 'string') {
      for (const candidate of chunk.split('\n')) {
        if (candidate.startsWith('{') && candidate.endsWith('}')) {
          const parsed: unknown = JSON.parse(candidate);
          const entry = readObject(parsed, 'a captured log line');

          if (typeof entry.level === 'string' && typeof entry.message === 'string') {
            lines.push({ level: entry.level, message: entry.message, raw: candidate });
          }
        }
      }
    }

    return original(chunk);
  });

  return { lines, text: (): string => lines.map((line) => line.raw).join('\n') };
}

// Per-suite hygiene, COMPLEMENTARY to the global hook in `tests/setup.ts`, which already restores
// spies and returns the clock to real time after every test. Keeping a local hook means this file
// stays correct if it is ever run with a different setup module, and it is where the stream capture
// is guaranteed to be handed back even when a case failed before its own assertions ran.
afterEach(() => {
  vi.restoreAllMocks();
});

/** Serialise a well-typed request, so a valid body cannot drift from the published request type. */
function bodyOf(request: PriceResolutionRequest): string {
  return JSON.stringify(request);
}

/** The message every schema-rejected or unusable input earns, and no other. */
const INVALID_BODY_MESSAGES = {
  missingRequestBody: 'A request body is required and was not supplied.',
  unparsableRequestBody: 'The request body is not valid JSON.',
  unsupportedBodyShape: 'The request body is not the expected shape.',
  routeNotFound: 'The requested route does not exist.',
} as const;

// ===========================================================================
// CONCERN 1 - PARSING AND VALIDATION
//
// Driven through `handler`, because reading and validating the wire document is what `handler` does
// before anything else exists. Every case here resolves BEFORE the composition root is reached, which
// each case also proves: nothing is wired, no pool is opened, and no environment variable is read.
// ===========================================================================

describe('the request contract, and what it refuses (concern 1)', () => {
  it('refuses a request carrying no body at all, in the mapper vocabulary', async () => {
    const response = await handler(makeProxyEvent(), makeLambdaContext());
    const envelope = readErrorEnvelope(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.category).toBe('invalidRequest');
    expect(envelope.message).toBe(INVALID_BODY_MESSAGES.missingRequestBody);
    expect(envelope.requestId).toBe(REQUEST_ID);
  });

  it('treats a whitespace-only body as no body', async () => {
    const response = await handler(makeProxyEvent({ body: '   \n\t ' }), makeLambdaContext());

    expect(response.statusCode).toBe(400);
    expect(readErrorEnvelope(response).message).toBe(INVALID_BODY_MESSAGES.missingRequestBody);
  });

  it('refuses a body that is not parsable, without echoing the body', async () => {
    const response = await handler(
      makeProxyEvent({ body: `{"operation": ${PLANTED_INTERNAL_DETAIL}` }),
      makeLambdaContext(),
    );
    const envelope = readErrorEnvelope(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.message).toBe(INVALID_BODY_MESSAGES.unparsableRequestBody);
    expect(envelope.raw).not.toContain(PLANTED_INTERNAL_DETAIL);
  });

  it('decodes a base64 body before parsing it, because that is the same request', async () => {
    const document = bodyOf({ operation: 'getPriceGroupDataJSON' });

    const response = await handler(
      makeProxyEvent({
        body: Buffer.from(document, 'utf8').toString('base64'),
        isBase64Encoded: true,
      }),
      makeLambdaContext(),
    );

    // The document is valid, so it is NOT refused for its shape; it stops at the composition root
    // instead, which this suite deliberately never reaches - see the boundary cases below. What is
    // asserted here is only that the base64 form was not mistaken for an unparsable body.
    expect(readErrorEnvelope(response).message).not.toBe(
      INVALID_BODY_MESSAGES.unparsableRequestBody,
    );
  });

  it('reports invalid base64 as an unparsable body, which is what it decodes to', async () => {
    const response = await handler(
      makeProxyEvent({ body: '!!!not-base64!!!', isBase64Encoded: true }),
      makeLambdaContext(),
    );

    expect(readErrorEnvelope(response).message).toBe(INVALID_BODY_MESSAGES.unparsableRequestBody);
  });

  it('refuses an array body and a scalar body as the wrong shape, not as unparsable', async () => {
    for (const body of ['[]', '"a string"', '42', 'null', 'true']) {
      const response = await handler(makeProxyEvent({ body }), makeLambdaContext());

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_BODY_MESSAGES.unsupportedBodyShape);
    }
  });

  it('refuses an operation outside the closed union, publishing paths and never values', async () => {
    const response = await handler(
      makeProxyEvent({
        body: JSON.stringify({
          operation: 'deletePriceGroup',
          undeclaredMember: PLANTED_INTERNAL_DETAIL,
        }),
      }),
      makeLambdaContext(),
    );
    const envelope = readErrorEnvelope(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.category).toBe('invalidRequest');
    expect(envelope.message).toBe(INVALID_REQUEST_MESSAGE);
    expect(envelope.raw).toContain('"path":"operation"');
    expect(envelope.raw).not.toContain(PLANTED_INTERNAL_DETAIL);
  });

  it('refuses each withheld service member by name, because none is an operation', async () => {
    for (const member of WITHHELD_PRICE_GROUP_MEMBERS) {
      const response = await handler(
        makeProxyEvent({ body: JSON.stringify({ operation: member }) }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('requires both members of the SKU selector, and refuses either one empty', async () => {
    const bodies = [
      { operation: 'getRateForSkuBasedOnPriceGroup' },
      { operation: 'getRateForSkuBasedOnPriceGroup', sku: {} },
      { operation: 'getRateForSkuBasedOnPriceGroup', sku: { productName: 'A product' } },
      { operation: 'getRateForSkuBasedOnPriceGroup', sku: { skuCode: 'A-CODE' } },
      { operation: 'getRateForSkuBasedOnPriceGroup', sku: { productName: '', skuCode: 'A-CODE' } },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: { productName: 'A product', skuCode: '' },
      },
    ];

    for (const body of bodies) {
      const response = await handler(
        makeProxyEvent({ body: JSON.stringify(body) }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('rejects an unrecognised member instead of ignoring it, so no filter can be smuggled in', async () => {
    // ★★ THIS IS THE CASE THAT PROVES THERE IS NO SMART LIST HERE. The framework's
    // `HibachiSmartList` was a generic, string-keyed, dynamically-filtered query builder, and the
    // plan withdraws it deliberately rather than cloning it (AAP 0.6.2). Each schema arm is a strict
    // object, so a caller cannot reach an open-ended filter surface, an ordering key or a property
    // projection by adding a member - the request is REFUSED.
    const smuggled = [
      { filter: { activeFlag: 1 } },
      { orderBy: 'price|desc' },
      { properties: 'skuID,price' },
      { pageRecordsShow: 500 },
      { priceGroupID: 'pg-1' },
    ];

    for (const extra of smuggled) {
      const response = await handler(
        makeProxyEvent({ body: JSON.stringify({ operation: 'getPriceGroupDataJSON', ...extra }) }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('closes each arm against the others, so a member cannot cross operations', async () => {
    const crossArm = [
      // `getPriceGroupDataJSON()` [model/service/PriceGroupService.cfc:L230] takes NO arguments.
      { operation: 'getPriceGroupDataJSON', sku: { productName: 'A product', skuCode: 'A-CODE' } },
      // The three accessors take a currency code; the cascade entry points do not.
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: { productName: 'A product', skuCode: 'A-CODE' },
        currencyCode: SECONDARY_CURRENCY_CODE,
      },
      // Conversion takes an amount and two codes, and no SKU.
      {
        operation: 'convertCurrency',
        amount: '10.00',
        originalCurrencyCode: SECONDARY_CURRENCY_CODE,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
        sku: { productName: 'A product', skuCode: 'A-CODE' },
      },
    ];

    for (const body of crossArm) {
      const response = await handler(
        makeProxyEvent({ body: JSON.stringify(body) }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('refuses a conversion amount that is not a plain decimal numeral', async () => {
    // The admitted language is PROBED against the value object rather than restated as a second
    // regular expression, so the boundary cannot admit a numeral `Money` would refuse or refuse one
    // it would accept. Being refused here is what turns a malformed numeral into a field-level 400
    // instead of an unrecognised failure.
    const malformed = ['', ' ', '10,00', '1e3', 'NaN', 'Infinity', '0x10', '10.00abc', '--1'];

    for (const amount of malformed) {
      const response = await handler(
        makeProxyEvent({
          body: JSON.stringify({
            operation: 'convertCurrency',
            amount,
            originalCurrencyCode: SECONDARY_CURRENCY_CODE,
            convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
          }),
        }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('names the offending path for a malformed amount and never the submitted value', async () => {
    const response = await handler(
      makeProxyEvent({
        body: JSON.stringify({
          operation: 'convertCurrency',
          amount: PLANTED_INTERNAL_DETAIL,
          originalCurrencyCode: SECONDARY_CURRENCY_CODE,
          convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
        }),
      }),
      makeLambdaContext(),
    );
    const envelope = readErrorEnvelope(response);

    expect(response.statusCode).toBe(400);
    expect(envelope.raw).toContain('"path":"amount"');
    expect(envelope.raw).not.toContain(PLANTED_INTERNAL_DETAIL);
  });

  it('refuses a short code for conversion while ANSWERING a short code for an accessor', async () => {
    // ★ THE OPPOSITE DECISION ON EACH ARM, AND BOTH ARE DELIBERATE. `convertCurrency`'s parameters
    // are typed `CurrencyCode`, a brand only minted for a three-character value, so length-checking
    // the conversion arm satisfies a contract the target already declares. The three accessors take a
    // PLAIN STRING and answer a keyed lookup [model/entity/Sku.cfc:L269-L273], so a two-character
    // code is simply a code the SKU has no price for - refusing it would turn an input the legacy
    // ANSWERED into an error.
    const conversion = await handler(
      makeProxyEvent({
        body: JSON.stringify({
          operation: 'convertCurrency',
          amount: '10.00',
          originalCurrencyCode: SHORT_CURRENCY_CODE,
          convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
        }),
      }),
      makeLambdaContext(),
    );

    expect(conversion.statusCode).toBe(400);
    expect(readErrorEnvelope(conversion).message).toBe(INVALID_REQUEST_MESSAGE);

    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const result = await dispatchPriceResolution(
      makeScope({ catalog: world.catalog, priceGroupService: priceGroups.service }),
      {
        operation: 'getPriceByCurrencyCode',
        sku: world.selector,
        currencyCode: SHORT_CURRENCY_CODE,
      },
    );

    // Answered, not refused - and the answer is an absence, which is the whole point.
    expect(expectCurrencyPriceOutcome(result).resolved).toBe(false);
  });
});

describe('routing, and the boundary this suite stops at', () => {
  it('serves only the method and path the route table publishes for this capability', () => {
    const route = ROUTE_TABLE.priceResolution;

    expect(route.capability).toBe('priceResolution');
    expect(route.action).toBe('resolvePrices');
    expect(route.methods).toBe('POST');
    expect(route.path).toBe('/prices/resolution');
  });

  it('answers an unmatched method with the router-built response, not with a handler-built one', async () => {
    const response = await handler(
      makeProxyEvent({ httpMethod: 'GET', body: bodyOf({ operation: 'getPriceGroupDataJSON' }) }),
      makeLambdaContext(),
    );
    const envelope = readErrorEnvelope(response);

    expect(response.statusCode).toBe(404);
    expect(envelope.category).toBe('routeNotFound');
    expect(envelope.message).toBe(INVALID_BODY_MESSAGES.routeNotFound);
  });

  it('answers a path belonging to another capability as unmatched, never by serving it', async () => {
    // Resolution is scoped to THIS capability, so a request that matched the catalog or feed route is
    // reported as unmatched rather than being answered by the wrong entrypoint.
    for (const other of [
      ROUTE_TABLE.catalogQuery,
      ROUTE_TABLE.skuResolution,
      ROUTE_TABLE.promotionApplication,
      ROUTE_TABLE.productFeed,
    ]) {
      const response = await handler(
        makeProxyEvent({ httpMethod: other.methods, path: other.path }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(404);
      expect(readErrorEnvelope(response).category).toBe('routeNotFound');
    }
  });

  it('does not echo the unmatched path into the body, and does log it', async () => {
    const capture = captureLogStream();

    const response = await handler(
      makeProxyEvent({ path: '/prices/resolution/../../etc/self' }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(404);
    expect(readErrorEnvelope(response).raw).not.toContain('etc/self');
    expect(capture.text()).toContain('etc/self');
  });

  it('resolves every refusal above WITHOUT wiring the composition root', async () => {
    // ★ THE BOUNDARY, ASSERTED RATHER THAN ASSUMED. `bootstrapCompositionRoot()` announces itself on
    // the log stream when it wires a graph, so its ABSENCE from the capture is the proof that these
    // paths never reached it - which is why they need no environment variable, open no pool and touch
    // no database. The composition root is exercised by its own suite, not by this one.
    const capture = captureLogStream();

    await handler(makeProxyEvent(), makeLambdaContext());
    await handler(makeProxyEvent({ body: '{' }), makeLambdaContext());
    await handler(makeProxyEvent({ body: '[]' }), makeLambdaContext());
    await handler(makeProxyEvent({ body: '{"operation":"nope"}' }), makeLambdaContext());
    await handler(makeProxyEvent({ httpMethod: 'DELETE' }), makeLambdaContext());

    expect(capture.lines.length).toBeGreaterThan(0);
    expect(capture.text()).not.toContain('Composition root wired');
    expect(capture.text()).not.toContain('conversion rates');
  });
});

// ===========================================================================
// CONCERN 2 - DELEGATION
//
// One operation, one outcome-producing call, arguments handed over unchanged. Driven through the
// published seam with a six-member fake scope, so there is no composition root, no repository, no
// pool and no environment anywhere in this section.
// ===========================================================================

/** One doubled world: a SKU, a fresh rate graph, the recording service, and a scope over both. */
interface DoubledCascade {
  readonly world: SkuWorld;
  readonly graph: PriceGroupGraph;
  readonly priceGroups: PriceGroupServiceDouble;
  readonly scope: PriceResolutionScope;
}

/**
 * Build a doubled world whose account resolves to the graph's child price group.
 *
 * The default `bestPriceGroup` is the child group because that is how the subject obtains a price
 * group at all: `getBestPriceGroupDetailsBasedOnSkuAndAccount`
 * [model/service/PriceGroupService.cfc:L343-L362] is the only member of the request-tier surface that
 * hands one back, there being no published load-by-identifier for one. A caller can state
 * `bestPriceGroup: undefined` to reach the absence arm.
 */
function makeDoubledCascade(
  answers: PriceGroupAnswers = {},
  skuOverrides?: SkuOverrides,
): DoubledCascade {
  const world = makeSkuWorld(skuOverrides);
  const graph = makePriceGroupFixtures({ skuLevelRateSkus: [world.sku] });
  const priceGroups = makePriceGroupServiceDouble({
    bestPriceGroup: graph.childPriceGroup,
    ...answers,
  });

  return {
    world,
    graph,
    priceGroups,
    scope: makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    }),
  };
}

describe('delegation: one already-ported member per operation (concern 2)', () => {
  it('resolves the selector through the two published catalog reads and nothing else', async () => {
    const { world, scope, priceGroups } = makeDoubledCascade();

    await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.selector,
    });

    // The product search matches `productName` and only `productName`, so the selector names a
    // product NAME and the criteria carry a keyword and nothing else - no filter, no ordering, no
    // paging window.
    expect(world.catalog.productQueries).toStrictEqual([{ keyword: world.selector.productName }]);

    // `getProductSkus(product, false)` - `sorted` FALSE and `fetchOptions` left at its default,
    // because neither changes WHICH SKU carries the requested code. The product handed over is the
    // one the search returned, which is the SKU's own.
    expect(world.catalog.skuReads).toHaveLength(1);
    expect(world.catalog.skuReads[0]?.product).toBe(world.product);
    expect(world.catalog.skuReads[0]?.sorted).toBe(false);
    expect(world.catalog.skuReads[0]?.fetchOptions).toBeUndefined();

    // The price group arrived through the one published affordance, before the cascade entry point.
    expect(priceGroups.calls.map((call) => call.member)).toStrictEqual([
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      'getRateForSkuBasedOnPriceGroup',
    ]);
  });

  it('hands the product type belonging to the resolved SKU to the product-type entry point', async () => {
    const { world, graph, scope, priceGroups } = makeDoubledCascade();

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductTypeBasedOnPriceGroup',
      sku: world.selector,
    });

    const call = priceGroups.calls[1];

    expect(call?.member).toBe('getRateForProductTypeBasedOnPriceGroup');
    // CFML parity [model/service/PriceGroupService.cfc:L159]: the legacy passes
    // `arguments.sku.getProduct().getProductType()`, so the argument must be THE RESOLVED PRODUCT'S
    // product type - identity, not an equal-looking second one a caller named independently.
    expect(call?.args[0]).toBe(world.productType);
    expect(call?.args[1]).toBe(graph.childPriceGroup);
    expect(expectRateOutcome(result).resolved).toBe(false);
  });

  it('hands the resolved product to the product entry point', async () => {
    const { world, graph, scope, priceGroups } = makeDoubledCascade({
      rateForProduct: makePriceGroupFixtures().productLevelRate,
    });

    await dispatchPriceResolution(scope, {
      operation: 'getRateForProductBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(priceGroups.calls[1]?.member).toBe('getRateForProductBasedOnPriceGroup');
    expect(priceGroups.calls[1]?.args[0]).toBe(world.product);
    expect(priceGroups.calls[1]?.args[1]).toBe(graph.childPriceGroup);
  });

  it('hands the resolved SKU to the SKU entry point and to the price calculation', async () => {
    const { world, graph, scope, priceGroups } = makeDoubledCascade();

    await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(priceGroups.calls[1]?.member).toBe('calculateSkuPriceBasedOnPriceGroup');
    expect(priceGroups.calls[1]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[1]?.args[1]).toBe(graph.childPriceGroup);
  });

  it('obtains the rate through the SKU cascade before calculating a price from it', async () => {
    const graph = makePriceGroupFixtures();
    const { world, scope, priceGroups } = makeDoubledCascade({
      rateForSku: graph.percentageOffRateWithRoundingRule,
      priceForRate: Money.fromDecimalString('9.99'),
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroupRate',
      sku: world.selector,
    });

    // The rate is this operation's INPUT and the cascade is how one is obtained at all. Both calls
    // are synchronous members and neither is deferred, wrapped or re-entered asynchronously.
    expect(priceGroups.calls.map((call) => call.member)).toStrictEqual([
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      'getRateForSkuBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
    ]);
    expect(priceGroups.calls[2]?.args[1]).toBe(graph.percentageOffRateWithRoundingRule);
    expect(expectPriceOutcome(result)).toBe('9.99');
  });

  it('reports no rate rather than pricing one when the cascade selected nothing', async () => {
    const { world, scope, priceGroups } = makeDoubledCascade();

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroupRate',
      sku: world.selector,
    });

    expect(expectUnresolvedOutcome(result)).toBe('noRateApplies');
    expect(priceGroups.calls.map((call) => call.member)).not.toContain(
      'calculateSkuPriceBasedOnPriceGroupRate',
    );
  });

  it('reports the absent product type rather than fabricating the argument', async () => {
    const { world, scope, priceGroups } = makeDoubledCascade();

    // JUDGMENT CALL: the product this fixture builds always carries a product type, and the entity's
    // column is `private readonly`, so the absent state is reached by making the resolved product
    // ANSWER nothing for it - which is exactly what an adapter hydrating a product whose
    // `productTypeID` is null produces. CFML parity
    // [model/service/PriceGroupService.cfc:L159]: the legacy chains the accessor with no null test
    // and passes the result into a parameter declared `required` at [L57], so CFML raises there. The
    // boundary reports it instead ONLY because it is the layer that would otherwise have to invent
    // the argument; the service's own behaviour when called with an absent product type is untouched.
    vi.spyOn(world.product, 'getProductType').mockReturnValue(undefined);

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductTypeBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(expectUnresolvedOutcome(result)).toBe('productTypeAbsent');
    expect(priceGroups.calls.map((call) => call.member)).not.toContain(
      'getRateForProductTypeBasedOnPriceGroup',
    );
  });

  it('reports the best-price-group absence without ever pricing a group it did not resolve', async () => {
    const { world, scope, priceGroups } = makeDoubledCascade({ bestPriceGroup: undefined });

    for (const operation of [
      'getRateForProductTypeBasedOnPriceGroup',
      'getRateForProductBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
    ] as const) {
      const result = await dispatchPriceResolution(scope, { operation, sku: world.selector });

      expect(expectUnresolvedOutcome(result)).toBe('noPriceGroupResolvedForSkuAndAccount');
    }

    expect(priceGroups.calls.every((call) => call.member.startsWith('getBestPriceGroup'))).toBe(
      true,
    );
  });

  it('awaits every asynchronous member, and the four are the four the contract names', async () => {
    // ★ THE ASYNC BOUNDARY, MADE FALSIFIABLE. Each asynchronous answer settles two microtasks late,
    // so a caller that failed to await would hand a promise to the serialiser and the amount below
    // would not be a numeral at all. The five synchronous members answer directly, which is a
    // compile-time fact: the scope type declares them returning a value, not a promise, because their
    // legacy bodies never reached the DAO or the ORM.
    const { world, scope } = makeDoubledCascade({
      deferred: true,
      priceForAccount: Money.fromDecimalString('12.34'),
      priceForCurrentAccount: Money.fromDecimalString('13.45'),
      bestPrice: Money.fromDecimalString('14.56'),
      priceGroupDataJSON: '{"deferred":true}',
    });

    const account = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.selector,
    });
    const currentAccount = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnCurrentAccount',
      sku: world.selector,
    });
    const best = await dispatchPriceResolution(scope, {
      operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      sku: world.selector,
    });
    const data = await dispatchPriceResolution(scope, { operation: 'getPriceGroupDataJSON' });

    expect(expectPriceOutcome(account)).toBe('12.34');
    expect(expectPriceOutcome(currentAccount)).toBe('13.45');
    expect(best.outcome).toBe('bestPriceGroupDetails');
    expect(data.outcome).toBe('priceGroupData');
  });

  it('carries the price-group document through as the string the service returned', async () => {
    // ★ NOT RE-PARSED AND NOT RE-SERIALISED. The ported signature answers a string because the legacy
    // returns `serializeJSON(priceGroupData)` [model/service/PriceGroupService.cfc:L256], and
    // reformatting it here would be exactly the coercion in transit that behaviour preservation
    // forbids - the key order, the spacing and the omission of a null `priceGroupName` are all the
    // service's to decide.
    const document = '{"pg-1":{"priceGroupRates":[]},"pg-2":{"priceGroupName":"Wholesale"}}';
    const { scope } = makeDoubledCascade({ priceGroupDataJSON: document });

    const result = await dispatchPriceResolution(scope, { operation: 'getPriceGroupDataJSON' });

    if (result.outcome !== 'priceGroupData') {
      throw new Error(`expected the priceGroupData outcome, received ${result.outcome}`);
    }

    expect(result.priceGroupDataJSON).toBe(document);
  });

  it('takes no argument for the price-group document, because the ported member takes none', async () => {
    const { scope, priceGroups } = makeDoubledCascade();

    await dispatchPriceResolution(scope, { operation: 'getPriceGroupDataJSON' });

    expect(priceGroups.calls).toHaveLength(1);
    expect(priceGroups.calls[0]?.member).toBe('getPriceGroupDataJSON');
    expect(priceGroups.calls[0]?.args).toStrictEqual([]);
  });

  it('reads no catalog and no price-group member for a conversion', async () => {
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const converter = makeCurrencyConverterDouble();
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      currencyConverter: converter.converter,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'convertCurrency',
      amount: '19.99',
      originalCurrencyCode: 'GBP',
      convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
    });

    expect(world.catalog.productQueries).toStrictEqual([]);
    expect(world.catalog.skuReads).toStrictEqual([]);
    expect(priceGroups.calls).toStrictEqual([]);

    // Three positional arguments, in the order the port declares them, with both codes minted through
    // the brand the parameters require.
    expect(converter.conversions).toHaveLength(1);
    expect(converter.conversions[0]?.amount.toDecimalString()).toBe('19.99');
    expect(converter.conversions[0]?.originalCurrencyCode).toBe(toCurrencyCode('GBP'));
    expect(converter.conversions[0]?.convertToCurrencyCode).toBe(
      toCurrencyCode(SECONDARY_CURRENCY_CODE),
    );
    expect(expectPriceOutcome(result)).toBe('19.99');
  });

  it('answers an unconverted amount when the converter holds no rate, and never fails', async () => {
    // CFML parity [model/service/CurrencyService.cfc:L100-L101]: the legacy silently returns the
    // amount UNCONVERTED when either code is missing from its rate table. There is therefore no error
    // path, no warning in the response, no availability indicator and no rate-source member - a
    // caller cannot tell a converted amount from an unconverted one, exactly as in the legacy.
    const world = makeSkuWorld();
    const converter = makeCurrencyConverterDouble();
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: makePriceGroupServiceDouble().service,
      currencyConverter: converter.converter,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'convertCurrency',
      amount: '7.25',
      originalCurrencyCode: 'GBP',
      convertToCurrencyCode: INELIGIBLE_CURRENCY_CODE,
    });

    expect(expectPriceOutcome(result)).toBe('7.25');
  });

  it('refuses rather than choosing when a selector names more than one candidate', async () => {
    // ★ REFUSE RATHER THAN CHOOSE, at the boundary a caller cannot see behind. The published product
    // search is a `LIKE` scan and the published SKU read adds no `DISTINCT`, so both reads can return
    // several rows; picking one would decide which SKU is priced.
    const first = makeSkuWorld({ idPrefix: 'firstsku' });
    const second = makeSkuWorld({ idPrefix: 'secondsku' });

    expect(first.product.getProductID()).not.toBe(second.product.getProductID());
    expect(first.product.getProductName()).toBe(second.product.getProductName());

    const ambiguousProduct = makeScope({
      catalog: makeCatalogReadsDouble([first.product, second.product], [first.sku]),
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });

    await expect(
      dispatchPriceResolution(ambiguousProduct, {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: first.selector,
      }),
    ).rejects.toThrow('the request named no single resolvable sku');

    expect(first.sku.getSkuID()).not.toBe(second.sku.getSkuID());
    expect(first.sku.getSkuCode()).toBe(second.sku.getSkuCode());

    const ambiguousSku = makeScope({
      catalog: makeCatalogReadsDouble([first.product], [first.sku, second.sku]),
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });

    await expect(
      dispatchPriceResolution(ambiguousSku, {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: first.selector,
      }),
    ).rejects.toThrow('the request named no single resolvable sku');
  });

  it('accepts the same product or SKU arriving twice, because a repeated row is not an ambiguity', async () => {
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const scope = makeScope({
      // A search join can report one product twice and the SKU read deliberately adds no `DISTINCT`,
      // so distinctness is judged by identifier rather than by array position.
      catalog: makeCatalogReadsDouble([world.product, world.product], [world.sku, world.sku]),
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.selector,
    });

    expect(expectPriceOutcome(result)).toBe(world.sku.getPrice().toDecimalString());
  });

  it('refuses when the selector matches nothing, naming no product and no code', async () => {
    const world = makeSkuWorld();
    const emptyProducts = makeScope({
      catalog: makeCatalogReadsDouble([], [world.sku]),
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });

    await expect(
      dispatchPriceResolution(emptyProducts, {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: world.selector,
      }),
    ).rejects.toThrow('the request named no single resolvable sku');

    const emptySkus = makeScope({
      catalog: makeCatalogReadsDouble([world.product], []),
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });

    await expect(
      dispatchPriceResolution(emptySkus, {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: world.selector,
      }),
    ).rejects.toThrow('the request named no single resolvable sku');
  });

  it('folds case when matching a product name and a SKU code, as CFML comparison does', async () => {
    // CFML string comparison folds case, and this target reproduces that rather than introducing a
    // case-sensitive boundary the source never had.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: {
        productName: world.selector.productName.toUpperCase(),
        skuCode: world.selector.skuCode.toLowerCase(),
      },
    });

    expect(expectPriceOutcome(result)).toBe(world.sku.getPrice().toDecimalString());
  });

  it('skips a product that answers no name instead of comparing against nothing', async () => {
    // `getProductName()` is nullable in the schema and the case-folding comparison raises on a
    // nullish operand by design, so an unnamed candidate must be skipped BEFORE it is compared.
    const named = makeSkuWorld({ idPrefix: 'namedsku' });
    const unnamed = makeSkuWorld({ idPrefix: 'unnamedsku' });

    vi.spyOn(unnamed.product, 'getProductName').mockReturnValue(undefined);

    const scope = makeScope({
      catalog: makeCatalogReadsDouble([unnamed.product, named.product], [named.sku]),
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: named.selector,
    });

    expect(expectPriceOutcome(result)).toBe(named.sku.getPrice().toDecimalString());
  });
});

/** Build the request one operation takes, so every published operation can be driven uniformly. */
function requestFor(
  operation: PriceResolutionOperation,
  selector: PriceResolutionSkuSelector,
): PriceResolutionRequest {
  switch (operation) {
    case 'getPriceGroupDataJSON':
      return { operation };
    case 'getPriceByCurrencyCode':
      return { operation, sku: selector, currencyCode: SECONDARY_CURRENCY_CODE };
    case 'getListPriceByCurrencyCode':
      return { operation, sku: selector, currencyCode: SECONDARY_CURRENCY_CODE };
    case 'getRenewalPriceByCurrencyCode':
      return { operation, sku: selector, currencyCode: SECONDARY_CURRENCY_CODE };
    case 'convertCurrency':
      return {
        operation,
        amount: '19.99',
        originalCurrencyCode: SECONDARY_CURRENCY_CODE,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      };
    case 'getRateForProductTypeBasedOnPriceGroup':
      return { operation, sku: selector };
    case 'getRateForProductBasedOnPriceGroup':
      return { operation, sku: selector };
    case 'getRateForSkuBasedOnPriceGroup':
      return { operation, sku: selector };
    case 'calculateSkuPriceBasedOnCurrentAccount':
      return { operation, sku: selector };
    case 'calculateSkuPriceBasedOnAccount':
      return { operation, sku: selector };
    case 'calculateSkuPriceBasedOnPriceGroup':
      return { operation, sku: selector };
    case 'calculateSkuPriceBasedOnPriceGroupRate':
      return { operation, sku: selector };
    case 'getBestPriceGroupDetailsBasedOnSkuAndAccount':
      return { operation, sku: selector };
  }
}

describe('the surface this entrypoint exposes, and the four members it withholds', () => {
  it('publishes thirteen operations, every one named for its legacy method', () => {
    // B4 interface parity is the acceptance contract, so a reviewer can diff this list against
    // `model/service/PriceGroupService.cfc`, `model/entity/Sku.cfc` and
    // `model/service/CurrencyService.cfc` directly. Nothing is renamed, abbreviated, pluralised or
    // made "more idiomatic", and the mid-name capitalisation of every legacy name survives.
    expect(ALL_OPERATIONS).toHaveLength(13);
    expect(new Set(ALL_OPERATIONS).size).toBe(13);
  });

  it('dispatches every published operation to a real outcome', async () => {
    const graph = makePriceGroupFixtures();

    for (const operation of ALL_OPERATIONS) {
      const world = makeSkuWorld();
      const priceGroups = makePriceGroupServiceDouble({ bestPriceGroup: graph.childPriceGroup });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, requestFor(operation, world.selector));

      // Every arm of the dispatcher answers; none falls through, and none of the six absence reasons
      // is an error or carries a status other than the successful one.
      expect(result.outcome).toBeDefined();
    }
  });

  it('exposes exactly the nine price-group members, no more and no fewer', () => {
    // ★ THIS IS A COMPILE-TIME FACT AS MUCH AS A RUN-TIME ONE. The double below is annotated with the
    // subject's own `PriceResolutionScope['priceGroupService']`, so an object literal missing a member
    // or carrying an extra one fails to type-check - which means the key list here cannot drift from
    // the published surface even if this assertion were deleted.
    const { service } = makePriceGroupServiceDouble();

    expect(Object.keys(service).sort()).toStrictEqual([...EXPOSED_PRICE_GROUP_MEMBERS].sort());
  });

  it('withholds the order pass and the three write members', () => {
    // JUDGMENT CALL: `updateOrderAmountsWithPriceGroups` is deliberately not routable here; it is the
    // writer half consumed by the promotion base-price branch at
    // [model/service/PromotionService.cfc:L241]. Running the two passes in the wrong order changes the
    // amount a customer is charged, and in the legacy the ordering held only because `OrderService`
    // happened to call them in sequence [model/service/OrderService.cfc:L60-L61]. Non-exposure is the
    // enforcement: the composition root publishes the pair ONLY as one composed operation, so there is
    // no member to call in the wrong order. Enforcement is structural, never parametric - no
    // sequencing, phase, ordering or skip member exists on any request arm.
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L461-L470]: `deletePriceGroup` loops on the
    // length of a collection captured at [L463] and always removes index one, so the loop can fail to
    // terminate. It is reproduced at the services tier WITH a bounded-iteration safeguard and a
    // flagged note, and withholding the member here neither repairs it, hides it nor removes that
    // guard - it simply keeps the defect off an HTTP surface. The guard itself is pinned by
    // `tests/unit/services/priceGroupService.test.ts`, which is where the member lives.
    // Preserved deliberately; do not fix without a product decision.
    const { service } = makePriceGroupServiceDouble();
    const exposed: readonly string[] = Object.keys(service);

    for (const withheld of WITHHELD_PRICE_GROUP_MEMBERS) {
      expect(exposed).not.toContain(withheld);
      expect(ALL_OPERATIONS.map((operation): string => operation)).not.toContain(withheld);
    }
  });

  it('exposes one currency-port member, and neither eligible-currency read', () => {
    // `getAllActiveCurrencyIDList` is the DEFAULT SOURCE of the `skuEligibleCurrencies` setting
    // [model/service/SettingService.cfc:L222] and `getCurrenciesByCurrencyCodeList` is what the
    // cascade reads that setting into [model/entity/Sku.cfc:L371, L375]. The composition root resolves
    // that setting eagerly, once, so publishing either here would put a second, unmemoized
    // eligible-currency resolution on an HTTP surface.
    const { converter } = makeCurrencyConverterDouble();

    expect(Object.keys(converter)).toStrictEqual(['convertCurrency']);
  });

  it('never round-trips a rounding-rule member, because none is exposed at all', () => {
    // The rounding service is reached through the ENTITY - [model/service/PriceGroupService.cfc:L327]
    // calls `arguments.priceGroupRate.getRoundingRule().roundValue(newPrice)`, a one-argument entity
    // method [model/entity/RoundingRule.cfc:L66-L68] - which is why `PriceGroupService.cfc` declares
    // only three collaborators and never injects it. So `roundValue`, `roundValueByRoundingRule`,
    // `roundValueByRoundingRuleID` and `getRoundingRuleDetailsByID` are absent from this surface by
    // construction, and a request naming one is simply not an operation.
    const roundingMembers: readonly string[] = [
      'roundValue',
      'roundValueByRoundingRule',
      'roundValueByRoundingRuleID',
      'getRoundingRuleDetailsByID',
    ];
    const { service } = makePriceGroupServiceDouble();

    for (const member of roundingMembers) {
      expect(Object.keys(service)).not.toContain(member);
      expect(ALL_OPERATIONS.map((operation): string => operation)).not.toContain(member);
    }
  });
});

describe('the explicit request context that replaced the ambient scope (T6)', () => {
  it('carries an account identifier and nothing else', () => {
    // The legacy body reaches the request scope through TWO accessors in adjacent lines
    // [model/service/PriceGroupService.cfc:L263-L264], one of them the only use of its kind in the
    // codebase, and the target normalises both into this one context. It must carry EXACTLY the two
    // things that body reads - whether a user is signed in, and which account - collapsed into one
    // optional identifier. No session, locale, currency, time zone, permission, correlation identifier
    // or logger member belongs on it.
    const signedIn = makeScope({
      catalog: makeSkuWorld().catalog,
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });
    const signedOut = makeScope({
      catalog: makeSkuWorld().catalog,
      priceGroupService: makePriceGroupServiceDouble().service,
    });

    expect(Object.keys(signedIn.currentAccountContext)).toStrictEqual(['accountID']);
    expect(signedIn.currentAccountContext.accountID).toBe(ACCOUNT_ID);
    // Absence is an OMITTED key rather than a present `undefined`, which is what makes "signed in with
    // no account" unrepresentable.
    expect(Object.keys(signedOut.currentAccountContext)).toStrictEqual([]);
    expect(signedOut.currentAccountContext.accountID).toBeUndefined();
  });

  it('hands the context to the current-account member whole, without testing it first', async () => {
    // ★ THE MEMBER OWNS THE SIGNED-IN TEST. [L263] branches, [L264] resolves through the account and
    // [L265-L266] answers `sku.getPrice()` otherwise. Testing the context at the boundary and
    // short-circuiting would move that decision out of the service and into an adapter, so the
    // adapter passes the context over and the service decides - which is exactly what T6 asks for.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const scope = makeScope({ catalog: world.catalog, priceGroupService: priceGroups.service });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnCurrentAccount',
      sku: world.selector,
    });

    expect(priceGroups.calls[0]?.member).toBe('calculateSkuPriceBasedOnCurrentAccount');
    expect(priceGroups.calls[0]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[0]?.args[1]).toBe(scope.currentAccountContext);
    // The legacy else arm answers the SKU's own price - not zero, and not an absence.
    expect(expectPriceOutcome(result)).toBe(world.sku.getPrice().toDecimalString());
  });

  it('reports the missing account for every member the legacy declares it required for', async () => {
    // [L271] and [L343] declare the account REQUIRED, so unlike the member above there is no fallback
    // arm to reproduce and the absence is a domain outcome answered successfully.
    const requiring: readonly PriceResolutionOperation[] = [
      'calculateSkuPriceBasedOnAccount',
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      'getRateForProductTypeBasedOnPriceGroup',
      'getRateForProductBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
    ];

    for (const operation of requiring) {
      const world = makeSkuWorld();
      const priceGroups = makePriceGroupServiceDouble();
      const scope = makeScope({ catalog: world.catalog, priceGroupService: priceGroups.service });

      const result = await dispatchPriceResolution(scope, requestFor(operation, world.selector));

      expect(expectUnresolvedOutcome(result)).toBe('noAuthenticatedAccount');
      // The account is tested BEFORE the selector is resolved, so no read is issued on behalf of a
      // request that could not have run anyway.
      expect(world.catalog.productQueries).toStrictEqual([]);
      expect(world.catalog.skuReads).toStrictEqual([]);
      expect(priceGroups.calls).toStrictEqual([]);
    }
  });

  it('passes the scope account identifier to the account-scoped members, verbatim', async () => {
    const { world, scope, priceGroups } = makeDoubledCascade();

    await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.selector,
    });
    await dispatchPriceResolution(scope, {
      operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      sku: world.selector,
    });

    for (const call of priceGroups.calls) {
      expect(call.args[1]).toBe(ACCOUNT_ID);
    }
  });

  it('answers the currency accessors with no account established at all', async () => {
    // The three accessors read the SKU's own currency map, so they are not account-scoped and must
    // not become so.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const scope = makeScope({ catalog: world.catalog, priceGroupService: priceGroups.service });

    for (const operation of [
      'getPriceByCurrencyCode',
      'getListPriceByCurrencyCode',
      'getRenewalPriceByCurrencyCode',
    ] as const) {
      const result = await dispatchPriceResolution(scope, requestFor(operation, world.selector));

      expect(result.outcome).toBe('currencyPrice');
    }

    expect(priceGroups.calls).toStrictEqual([]);
  });
});

// ===========================================================================
// THE PORTED CASCADE REACHES THE WIRE UNCHANGED
//
// This section wires the REAL `PriceGroupService` behind the entrypoint, with hand-written doubles
// for its three collaborators and nothing else. The cascade's own behaviour is pinned by
// `tests/unit/services/priceGroupService.test.ts`; what is at stake HERE is different and cannot be
// asserted there - that the boundary neither reorders, short-circuits, memoizes, "optimises" nor
// repairs any of it on the way out.
//
// No repository is real, no statement is emitted, no database is contacted and no environment
// variable is read: the two data-tier members the service can reach are doubles that record.
// ===========================================================================

type PriceGroupServiceDependencies = ConstructorParameters<typeof PriceGroupService>;

/** The ported service, plus what its collaborators were asked. */
interface PortedServiceHarness {
  readonly service: PriceResolutionScope['priceGroupService'];
  /** Account identifiers handed to the one deliberate subscription reach-through. */
  readonly subscriptionReads: readonly string[];
  /** Account identifiers handed to the direct price-group association read. */
  readonly accountPriceGroupReads: readonly string[];
}

/**
 * Wire the real service over recording collaborators.
 *
 * ★ THE ACCOUNT'S ASSOCIATION IS ONE ARRAY INSTANCE, RETURNED FOR EVERY READ, AND THAT IS THE PORT'S
 * OWN CONTRACT rather than a shortcut. `calculateSkuPriceBasedOnAccount`
 * [model/service/PriceGroupService.cfc:L276-L284] captures the collection with no defensive copy and
 * appends the account's subscription price groups INTO it, and CFML arrays are by reference, so the
 * appended members stay visible to every later reader within the same request - which is a documented
 * legacy behaviour the port keeps observable. The safety property that matters for a test tier is
 * satisfied a different way: the array is built INSIDE this call, so it cannot outlive the case, and
 * two cases share nothing.
 *
 * ★ EVERY OTHER MEMBER REFUSES. The three write members of the price-group repository and all six of
 * the product repository are unreachable from a resolution surface, and a refusing double proves it
 * instead of letting an unexpected call answer plausibly.
 */
function makePortedPriceGroupService(options: {
  readonly accountPriceGroups?: readonly ResolvedPriceGroup[] | undefined;
  readonly subscriptionPriceGroups?: readonly ResolvedPriceGroup[] | undefined;
  readonly pageRecords?: readonly ResolvedPriceGroup[] | undefined;
}): PortedServiceHarness {
  const subscriptionReads: string[] = [];
  const accountPriceGroupReads: string[] = [];
  const liveAccountAssociation: ResolvedPriceGroup[] = [...(options.accountPriceGroups ?? [])];

  const priceGroupRepository: PriceGroupServiceDependencies[0] = {
    // ★ THE ONE DELIBERATE, READ-ONLY REACH-THROUGH IN THE WHOLE MIGRATION.
    // [model/dao/PriceGroupDAO.cfc:L52-L100] queries six subscription-owned tables and is called from
    // [model/service/PriceGroupService.cfc:L277]. It is reached ONLY through this port; NO SUBSCRIPTION
    // BUSINESS LOGIC IS PORTED, none is exercised here, and no statement is emitted by this double.
    getAccountSubscriptionPriceGroups: (accountID: string): Promise<ResolvedPriceGroup[]> => {
      subscriptionReads.push(accountID);

      return Promise.resolve([...(options.subscriptionPriceGroups ?? [])]);
    },
    getPriceGroup: (): never => refuse('PriceGroupRepository.getPriceGroup'),
    getPriceGroupRate: (): never => refuse('PriceGroupRepository.getPriceGroupRate'),
    savePriceGroup: (): never => refuse('PriceGroupRepository.savePriceGroup'),
    savePriceGroupRate: (): never => refuse('PriceGroupRepository.savePriceGroupRate'),
    deletePriceGroup: (): never => refuse('PriceGroupRepository.deletePriceGroup'),
  };

  const productRepository: PriceGroupServiceDependencies[1] = {
    getAttributeSets: (): never => refuse('ProductRepository.getAttributeSets'),
    loadDataFromFile: (): never => refuse('ProductRepository.loadDataFromFile'),
    searchProductsByProductType: (): never =>
      refuse('ProductRepository.searchProductsByProductType'),
    getProductByProductID: (): never => refuse('ProductRepository.getProductByProductID'),
    saveProduct: (): never => refuse('ProductRepository.saveProduct'),
    deleteProduct: (): never => refuse('ProductRepository.deleteProduct'),
  };

  const frameworkReads: PriceGroupServiceDependencies[2] = {
    getAccountPriceGroups: (accountID: string): Promise<ResolvedPriceGroup[]> => {
      accountPriceGroupReads.push(accountID);

      return Promise.resolve(liveAccountAssociation);
    },
    // CFML parity [model/service/PriceGroupService.cfc:L233-L236]: the legacy iterates one PAGE of a
    // framework smart list, not the whole collection.
    getPriceGroupPageRecords: (): Promise<readonly ResolvedPriceGroup[]> =>
      Promise.resolve([...(options.pageRecords ?? [])]),
  };

  return {
    service: new PriceGroupService(priceGroupRepository, productRepository, frameworkReads),
    subscriptionReads,
    accountPriceGroupReads,
  };
}

/** A scope over the ported service, the one SKU world it prices, and the graph it prices against. */
interface PortedCascade {
  readonly world: SkuWorld;
  readonly graph: PriceGroupGraph;
  readonly harness: PortedServiceHarness;
  readonly scope: PriceResolutionScope;
}

/**
 * Build a ported cascade over one account price group.
 *
 * `roundValueAnswer` is deliberately BELOW the SKU's own price, because
 * `getBestPriceGroupDetailsBasedOnSkuAndAccount` [model/service/PriceGroupService.cfc:L347-L358]
 * seeds its report with the SKU's price and keeps a price group only when one BEAT it. An answer above
 * the SKU price would leave the report empty and every case below would assert against an absence.
 */
function makePortedCascade(
  graphOverrides: PriceGroupOverrides,
  pick: (graph: PriceGroupGraph) => readonly ResolvedPriceGroup[],
  skuOverrides?: SkuOverrides,
): PortedCascade {
  const world = makeSkuWorld(skuOverrides);
  const graph = makePriceGroupFixtures({ roundValueAnswer: '9.99', ...graphOverrides });
  const harness = makePortedPriceGroupService({ accountPriceGroups: pick(graph) });

  return {
    world,
    graph,
    harness,
    scope: makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    }),
  };
}

describe('the five-level cascade reaches the wire unchanged', () => {
  it('answers the LAST matching SKU rate, because the SKU loop carries no break', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L146-L150]: the loop reassigns `returnRate` on
    // every match and never breaks, so a LATER matching rate overwrites an earlier one. This is the
    // single most breakable property of the cascade - a first-match search would pass a
    // single-match fixture and be silently wrong here - so it is asserted with a fixture in which BOTH
    // SKU-level rates match the very same SKU.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      // BOTH SKU-level rates are given the very same SKU, so both match on the same pass.
      skuLevelRateSkus: [world.sku],
    });

    expect(graph.skuLevelRateFirstMatch.getPriceGroupRateID()).not.toBe(
      graph.skuLevelRateLastMatch.getPriceGroupRateID(),
    );

    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(expectResolvedRate(result).priceGroupRateID).toBe(
      graph.skuLevelRateLastMatch.getPriceGroupRateID(),
    );
    expect(expectResolvedRate(result).priceGroupRateID).not.toBe(
      graph.skuLevelRateFirstMatch.getPriceGroupRateID(),
    );
  });

  it('answers the LAST global rate, because that loop carries no break either', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L83-L87]: the product-type variant's global scan
    // has the same shape and the same absent break, so the last rate carrying the global flag wins.
    const { world, graph, scope } = makePortedCascade({}, (built) => [built.globalRatePriceGroup]);

    expect(graph.globalRateFirstMatch.getGlobalFlag()).toBe(true);
    expect(graph.globalRateLastMatch.getGlobalFlag()).toBe(true);

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductTypeBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(expectResolvedRate(result).priceGroupRateID).toBe(
      graph.globalRateLastMatch.getPriceGroupRateID(),
    );
  });

  it('walks SKU, then product, then product type - in that order and no other', async () => {
    // The chain is ordered and each level is only consulted when the one before it found nothing
    // [model/service/PriceGroupService.cfc:L146-L160]. Three runs over the SAME graph shape, removing
    // one level of membership at a time, show the order rather than assuming it.
    const world = makeSkuWorld();

    const skuLevel = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      skuLevelRateSkus: [world.sku],
      productLevelRateProducts: [world.product],
      productTypeLevelRateProductTypes: [world.productType],
    });
    const productLevel = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      productLevelRateProducts: [world.product],
      productTypeLevelRateProductTypes: [world.productType],
    });
    const productTypeLevel = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      productTypeLevelRateProductTypes: [world.productType],
    });

    const expectations: readonly { graph: PriceGroupGraph; rateID: string }[] = [
      { graph: skuLevel, rateID: skuLevel.skuLevelRateLastMatch.getPriceGroupRateID() },
      { graph: productLevel, rateID: productLevel.productLevelRate.getPriceGroupRateID() },
      {
        graph: productTypeLevel,
        rateID: productTypeLevel.productTypeLevelRate.getPriceGroupRateID(),
      },
    ];

    for (const expectation of expectations) {
      const harness = makePortedPriceGroupService({
        accountPriceGroups: [expectation.graph.childPriceGroup],
      });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: harness.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.selector,
      });

      expect(expectResolvedRate(result).priceGroupRateID).toBe(expectation.rateID);
    }
  });

  it('never finds a SKU rate on an ancestor price group, and the boundary reports what it got', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: level five recurses into the parent
    // price group by calling `getRateForProductBasedOnPriceGroup` - the PRODUCT variant, not the SKU
    // variant - so a rate that includes the SKU on an ANCESTOR group is never tested for and never
    // found. The walk continues past it and answers whatever the product-shaped search reaches, which
    // for this graph is the root group's global rate.
    // Preserved deliberately; do not fix without a product decision.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      parentSkuLevelRateSkus: [world.sku],
    });
    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(expectResolvedRate(result).priceGroupRateID).not.toBe(
      graph.parentSkuLevelRate.getPriceGroupRateID(),
    );

    // ★ THE ANCESTOR CHAIN IS WALKED - it is only SKU membership that is never tested on the way. The
    // answer comes from the ROOT group, two levels above the one the account holds, which is what makes
    // this a defect in WHAT the recursion asks rather than in WHETHER it recurses.
    expect(expectResolvedRate(result).priceGroupRateID).toBe(
      graph.rootGlobalRate.getPriceGroupRateID(),
    );
    expect(expectResolvedRate(result).globalFlag).toBe(true);
  });

  it('DOES test product membership where it never tests SKU membership', async () => {
    // The contrast that makes the asymmetry concrete rather than merely asserted. The SAME rate array
    // the previous case skipped over is searched by `hasProduct` perfectly well: the parent's
    // product-level rate is found, on the very group whose SKU-level rate was invisible.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      parentSkuLevelRateSkus: [world.sku],
      parentProductLevelRateProducts: [world.product],
    });
    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.parentPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(expectResolvedRate(result).priceGroupRateID).toBe(
      graph.parentProductLevelRate.getPriceGroupRateID(),
    );
  });

  it('selects the same rate whether or not the SKU is listed as excluded on it', async () => {
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
    // `excludedProducts` and `excludedSkus` are declared, persisted through three link tables and
    // COUNTED BY `getAppliesTo()` [L95-L146] - and the cascade NEVER consults any of them, not at the
    // SKU level [model/service/PriceGroupService.cfc:L146-L150], the product level [L108-L112] or the
    // product-type level [L63-L78]. A SKU listed as excluded is still selected, and the `appliesTo`
    // text this entrypoint publishes therefore DESCRIBES EXCLUSIONS THAT DID NOT APPLY.
    // Preserved deliberately; do not fix without a product decision.
    const world = makeSkuWorld();

    const withoutExclusion = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      skuLevelRateSkus: [world.sku],
    });
    const withExclusion = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      skuLevelRateSkus: [world.sku],
      excludedSkus: [world.sku],
      excludedProducts: [world.product],
      excludedProductTypes: [world.productType],
    });

    const selectedIDs: string[] = [];
    const appliesToText: string[] = [];

    for (const graph of [withoutExclusion, withExclusion]) {
      const harness = makePortedPriceGroupService({
        accountPriceGroups: [graph.siblingPriceGroup],
      });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: harness.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.selector,
      });

      selectedIDs.push(expectResolvedRate(result).priceGroupRateID);
      appliesToText.push(expectResolvedRate(result).appliesTo);
    }

    // The very same rate is selected either way: populating an exclusion changed no selection at all.
    expect(selectedIDs[0]).toBe(
      withoutExclusion.appliesToIncludingAndExcludingRate.getPriceGroupRateID(),
    );
    expect(selectedIDs[1]).toBe(
      withExclusion.appliesToIncludingAndExcludingRate.getPriceGroupRateID(),
    );

    // And the published description DID change, which is the gap: it now names exclusions the
    // selection ignored. The boundary reports the entity's own answer verbatim rather than filtering it.
    expect(appliesToText[0]).not.toBe(appliesToText[1]);
    expect(appliesToText[1]).toBe(withExclusion.appliesToIncludingAndExcludingRate.getAppliesTo());
  });

  it('lets the service apply the rate rounding rule, and applies none of its own', async () => {
    // Two properties in one case, and they pull in opposite directions. The SERVICE must still round
    // on the `percentageOff` branch [model/service/PriceGroupService.cfc:L326-L328] - a boundary that
    // suppressed it would change money - and the BOUNDARY must never round, because the algorithm is
    // decimal-string manipulation whose measured outputs are counter-intuitive by design and a second
    // application would move the price again.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      skuLevelRateSkus: [world.sku],
    });
    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(graph.roundingRuleValueRounder.calls.length).toBeGreaterThan(0);

    for (const call of graph.roundingRuleValueRounder.calls) {
      expect(call.rule).toBe(graph.skuLevelRateLastMatch.getRoundingRule());
    }

    // The rounder answers a constant unrelated to its input, so "applied" and "skipped" are
    // distinguishable outcomes, and the two-decimal presentation at [L339] is the service's own last
    // step - not a second one taken here.
    expectSameDecimalValue(
      expectPriceOutcome(result),
      graph.roundValueDoubleAnswer.toDecimalString(),
    );
  });

  it('reaches the subscription price-group query only through the repository port', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      skuLevelRateSkus: [world.sku],
    });
    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.selector,
    });

    // The account identifier crosses the boundary as an opaque identifier and nothing else: the
    // out-of-scope account entity is never modelled, named or read.
    expect(harness.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
    expect(harness.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);

    // CFML parity [model/service/PriceGroupService.cfc:L274-L297]: the candidate array is seeded with
    // `sku.getPrice()`, sorted ascending and answered at index one, so THE LOWEST PRICE WINS and the
    // account price can never exceed the SKU's own. Here the group's rate produces the rounder's
    // constant, which is below the SKU price, so that is the answer.
    expectSameDecimalValue(
      expectPriceOutcome(result),
      graph.roundValueDoubleAnswer.toDecimalString(),
    );
  });

  it('keeps the SKU price when every price group is dearer, never a lower invented one', async () => {
    // The seed is load-bearing: a zero seed would make every price group look worse than "no price
    // group" and sell the SKU for nothing.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '99.99',
      skuLevelRateSkus: [world.sku],
    });
    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.selector,
    });

    expectSameDecimalValue(expectPriceOutcome(result), world.sku.getPrice().toDecimalString());
  });

  it('answers the price-group document for a page the source also answers on', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236]: the loop reads
    // `priceGroupSmartList.getPageRecords()[local.i]` while the counter declared at [L235] is `i`.
    // `local` IS the implicit function scope in CFML, so `local.i` resolves to the counter and the line
    // misleads rather than misbehaves - which is why the port indexes by the counter, faithfully, and
    // makes no source-failing input succeed.
    // Preserved deliberately; do not fix without a product decision.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({});
    const harness = makePortedPriceGroupService({
      // The isolated group carries NO rates, which is the only shape the source returns on.
      pageRecords: [graph.isolatedPriceGroup],
    });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, { operation: 'getPriceGroupDataJSON' });

    if (result.outcome !== 'priceGroupData') {
      throw new Error(`expected the priceGroupData outcome, received ${result.outcome}`);
    }

    expect(result.priceGroupDataJSON).toContain(graph.isolatedPriceGroup.getPriceGroupID());
    expect(result.priceGroupDataJSON).toContain('"priceGroupRates":[]');
  });

  it('lets the price-group document raise rather than repairing it at the boundary', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the inner loop calls
    // `thisRate.getAmountRepresentation()`, which no in-scope component declares, so the method RAISES
    // for any page holding at least one rate and succeeds only in the degenerate case above.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ THE RAISE IS NOT CAUGHT HERE. Wrapping this call to answer an empty document, a partial
    // document or an absence arm would REPAIR the defect at the boundary and hide it from every
    // caller - which is precisely what preserving behaviour forbids. It leaves as a failure and is
    // mapped like any other, and the mapping is asserted in the error-mapping section below.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({});
    const harness = makePortedPriceGroupService({ pageRecords: [graph.childPriceGroup] });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: harness.service,
      accountID: ACCOUNT_ID,
    });

    await expect(
      dispatchPriceResolution(scope, { operation: 'getPriceGroupDataJSON' }),
    ).rejects.toThrow('getAmountRepresentation');
  });
});

// ===========================================================================
// THE AMOUNT-TYPE STRATEGY IS REPORTED, NEVER RE-DERIVED
//
// Driven with the service doubled, which is what makes these cases decisive: with nothing computing
// anything behind the boundary, ANY rounding, formatting or defaulting observed here could only have
// come from the boundary itself.
// ===========================================================================

describe('the amount-type strategy is reported, never re-derived', () => {
  /** Serialise one rate through the entrypoint and hand back both the projection and the graph. */
  async function serialiseRate(
    graph: PriceGroupGraph,
    rate: ResolvedPriceGroupRate,
  ): Promise<{
    readonly serialised: ReturnType<typeof expectResolvedRate>;
    readonly json: string;
  }> {
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      rateForSku: rate,
    });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.selector,
    });

    return { serialised: expectResolvedRate(result), json: JSON.stringify(result) };
  }

  it('reports each recognised amount type exactly as the column holds it', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: the rounding rule is applied on the
    // `percentageOff` branch [L326-L328] and ONLY there - `amountOff` [L330-L332] and `amount`
    // [L333-L335] skip it - and the switch closes at [L336] with NO `default:` arm, so an unrecognised
    // `amountType` passes through with the SKU's own price [L319]. The strategy key that the whole
    // asymmetry turns on is therefore published VERBATIM rather than normalised, so the asymmetry stays
    // auditable from outside.
    // Preserved deliberately; do not fix without a product decision.
    const graph = makePriceGroupFixtures();
    const [percentageOff, amountOff, amount] = graph.recognisedAmountTypes;

    const cases: readonly { readonly rate: ResolvedPriceGroupRate; readonly amountType: string }[] =
      [
        { rate: graph.percentageOffRateWithRoundingRule, amountType: percentageOff },
        { rate: graph.amountOffRateWithRoundingRule, amountType: amountOff },
        { rate: graph.fixedAmountRateWithRoundingRule, amountType: amount },
        { rate: graph.percentageOffRateWithoutRoundingRule, amountType: percentageOff },
      ];

    for (const entry of cases) {
      const { serialised } = await serialiseRate(graph, entry.rate);

      expect(serialised.amountType).toBe(entry.amountType);
      expect(serialised.amountType).toBe(entry.rate.getAmountType());
      expect(serialised.priceGroupRateID).toBe(entry.rate.getPriceGroupRateID());
      expect(serialised.globalFlag).toBe(entry.rate.getGlobalFlag());
      // Both presentation values are the ENTITY's own answers, carried through unaltered.
      expect(serialised.amountFormatted).toBe(entry.rate.getAmountFormatted());
      expect(serialised.appliesTo).toBe(entry.rate.getAppliesTo());
    }
  });

  it('reports whether a rounding rule is attached WITHOUT invoking it', async () => {
    // ★ THE DECISIVE ASSERTION OF THIS WHOLE SECTION. `roundingRuleConfigured` is a BOOLEAN and the
    // recording value rounder every fixture rounding rule delegates to must still hold ZERO calls after
    // a rate carrying one has been serialised. Reporting the fact lets a caller see the asymmetry;
    // invoking the rule to produce the fact would round a value at a boundary that must not, and the
    // algorithm's measured outputs are counter-intuitive enough that a second application would move
    // real money.
    const graph = makePriceGroupFixtures();

    const withRule = await serialiseRate(graph, graph.percentageOffRateWithRoundingRule);
    const withoutRule = await serialiseRate(graph, graph.percentageOffRateWithoutRoundingRule);

    expect(withRule.serialised.roundingRuleConfigured).toBe(true);
    expect(withoutRule.serialised.roundingRuleConfigured).toBe(false);
    expect(graph.percentageOffRateWithRoundingRule.getRoundingRule()).toBeDefined();
    expect(graph.percentageOffRateWithoutRoundingRule.getRoundingRule()).toBeUndefined();
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
  });

  it('reports a rule attached to a branch that would skip it, which is what makes it auditable', async () => {
    // The `amountOff` and `amount` branches carry a rounding rule that their own arithmetic never
    // applies. Publishing the flag anyway is deliberate: it is the only way a caller can see that the
    // rule exists and did not fire, and suppressing it would hide the asymmetry rather than preserve it.
    const graph = makePriceGroupFixtures();

    for (const rate of [
      graph.amountOffRateWithRoundingRule,
      graph.fixedAmountRateWithRoundingRule,
    ]) {
      const { serialised } = await serialiseRate(graph, rate);

      expect(serialised.roundingRuleConfigured).toBe(true);
    }

    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
  });

  it('publishes no amount type at all for an unrecognised column value, and invents no default', async () => {
    // ★ NO `default:` ARM IS INVENTED ANYWHERE FOR THIS VALUE. The legacy switch has none, so an
    // unrecognised `amountType` silently passes the seed value through. The boundary adds no
    // unrecognised-type error, no thrown failure, no logged warning and no substituted spelling: the
    // member is simply absent from the document, which is what an absent column looks like on the wire.
    const graph = makePriceGroupFixtures();
    const { serialised, json } = await serialiseRate(graph, graph.unrecognisedAmountTypeRate);

    expect(graph.unrecognisedAmountTypeRate.getAmountType()).toBeUndefined();
    expect(serialised.amountType).toBeUndefined();
    expect(json).not.toContain('"amountType"');
    expect(json).not.toContain(graph.unrecognisedAmountTypeColumnValue);
    // The rate still RESOLVED - an unrecognised type is not an error, and nothing here made it one.
    expect(serialised.priceGroupRateID).toBe(
      graph.unrecognisedAmountTypeRate.getPriceGroupRateID(),
    );
  });

  it('separates a rate that applied without an amount from no rate applying at all', async () => {
    // `PriceGroupRate.amount` is a NULLABLE `big_decimal` [model/entity/PriceGroupRate.cfc:L54] and
    // `savePriceGroupRate` clears it outright on the `"new amount"` path
    // [model/service/PriceGroupService.cfc:L399-L400], so the state is reachable rather than
    // theoretical. Conflating the two would tell a caller that no rate matched when one did.
    //
    // JUDGMENT CALL: the fixture always builds an amount, and the column is `private readonly` on the
    // entity, so the null state is reached by making the rate ANSWER nothing for it - which is exactly
    // what an adapter hydrating a null column produces.
    const graph = makePriceGroupFixtures();
    const rate = graph.percentageOffRateWithRoundingRule;

    vi.spyOn(rate, 'getAmount').mockReturnValue(undefined);

    const { serialised } = await serialiseRate(graph, rate);

    expect(serialised.amount.resolved).toBe(false);

    if (serialised.amount.resolved) {
      throw new Error('the amount should not have resolved');
    }

    expect(serialised.amount.reason).toBe<UnresolvedReason>('rateCarriesNoAmount');
    expect(serialised.amount.reason).not.toBe<UnresolvedReason>('noRateApplies');
  });

  it('reports the amount at full precision when the column holds one', async () => {
    const graph = makePriceGroupFixtures();
    const rate = graph.fixedAmountRateWithRoundingRule;
    const { serialised } = await serialiseRate(graph, rate);

    if (!serialised.amount.resolved) {
      throw new Error(`the amount should have resolved: ${serialised.amount.reason}`);
    }

    expectSameDecimalValue(
      serialised.amount.amount,
      requireDefined(rate.getAmount(), 'amount on the fixed-amount rate').toDecimalString(),
    );
  });
});

// ===========================================================================
// MEASURED ROUNDING OUTPUTS SURVIVE THE BOUNDARY
//
// `RoundingRuleService.roundValue()` [model/service/RoundingRuleService.cfc:L88-L175] is decimal-STRING
// manipulation rather than numeric rounding, and its measured outputs are counter-intuitive BY DESIGN.
// A boundary that "tidied" one of them would fail the acceptance gate, so every measured row is pushed
// through this entrypoint and compared to the value the legacy actually produces.
// ===========================================================================

describe('measured rounding outputs survive the boundary unaltered', () => {
  it('carries all ten measured outputs through byte for byte', async () => {
    const graph = makePriceGroupFixtures();

    expect(graph.roundValueCases).toHaveLength(10);

    for (const measured of graph.roundValueCases) {
      const world = makeSkuWorld();
      const priceGroups = makePriceGroupServiceDouble({
        bestPriceGroup: graph.childPriceGroup,
        rateForSku: graph.percentageOffRateWithRoundingRule,
        // The service answers the MEASURED legacy output for this row; the boundary's only job is to
        // hand it over unchanged.
        priceForRate: Money.fromDecimalString(measured.expected),
      });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, {
        operation: 'calculateSkuPriceBasedOnPriceGroupRate',
        sku: world.selector,
      });

      const amount = expectPriceOutcome(result);

      // BY VALUE, because `'12.350'` and `'12.35'` are the same amount of money and a string comparison
      // is the wrong test for "did this value survive".
      expectSameDecimalValue(amount, measured.expected);

      // AND byte for byte against the value object's own rendering, which is the stricter half of the
      // claim: the boundary neither adds nor removes a digit of its own.
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L88] versus
      // [model/service/PriceGroupService.cfc:L339]: the legacy answers the STRING `numberFormat`
      // produces, so a measured row reads `10.00`, while the ported service answers a `Money` built
      // from that string, whose canonical rendering carries every SIGNIFICANT digit and therefore reads
      // `10`. Same amount, different presentation, and the presentation is the value object's decision
      // rather than this boundary's - which is exactly what is being pinned.
      expect(amount).toBe(Money.fromDecimalString(measured.expected).toDecimalString());
    }
  });

  it('does not tidy the counter-intuitive rows into what arithmetic would suggest', async () => {
    // The four rows a "corrected" implementation gets wrong: `12.30` with `.99` yields `12.99` rather
    // than `11.99`, `7.42` with `9.99` yields `9.99`, `2.30` with `0.99` yields `0.99`, and the DEFAULT
    // expression `"0.00"` - which looks inert and is not - turns `12.3456` into `10.00`. Each is a real
    // money risk, and each must arrive exactly as measured.
    const graph = makePriceGroupFixtures();
    const counterIntuitive = graph.roundValueCases.filter(
      (measured) =>
        (measured.input === '12.30' && measured.roundingExpression === '.99') ||
        (measured.input === '7.42' && measured.roundingExpression === '9.99') ||
        (measured.input === '2.30' && measured.roundingExpression === '0.99') ||
        (measured.input === '12.3456' && measured.roundingExpression === '0.00'),
    );

    expect(counterIntuitive).toHaveLength(4);

    for (const measured of counterIntuitive) {
      const world = makeSkuWorld();
      const priceGroups = makePriceGroupServiceDouble({
        bestPriceGroup: graph.childPriceGroup,
        priceForPriceGroup: Money.fromDecimalString(measured.expected),
      });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.selector,
      });

      expectSameDecimalValue(expectPriceOutcome(result), measured.expected);
      // The boundary did not fall back to the input, and did not clamp toward it either.
      expect(cfNumericEquals(expectPriceOutcome(result), measured.input)).toBe(false);
    }
  });

  it('keeps every significant digit, and applies no second two-decimal presentation', async () => {
    // ★ THE TWO EGRESS METHODS ARE NOT INTERCHANGEABLE, and this is where that matters. The reference
    // calculation's net amount carries FIVE decimal places; presenting it to two at the boundary would
    // round a value the service returned unrounded, and the two-decimal step belongs where the legacy
    // puts it - at the END of the calculating function [model/service/PriceGroupService.cfc:L339].
    const graph = makePriceGroupFixtures();
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      priceForPriceGroup: Money.fromDecimalString(graph.referenceCalculation.netAmount),
    });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(expectPriceOutcome(result)).toBe(graph.referenceCalculation.netAmount);
    expect(expectPriceOutcome(result)).not.toBe(graph.referenceCalculation.presentedNetAmount);
  });

  it('serialises a monetary value as a decimal string, never as a JSON number', async () => {
    // A string, never a number: binary floating point is exactly what the value object exists to keep
    // away from a price, and a JSON number would reintroduce it at the last possible moment.
    const graph = makePriceGroupFixtures();
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      priceForPriceGroup: Money.fromDecimalString('19.99'),
    });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.selector,
    });
    const json = JSON.stringify(result);

    expect(json).toContain('"amount":"19.99"');
    expect(json).not.toContain('"amount":19.99');
    expect(typeof expectPriceOutcome(result)).toBe('string');
  });
});

// ===========================================================================
// CONCERN 3 - CURRENCY RESOLUTION, AND ABSENCES THAT MUST NEVER BECOME ZERO
//
// The three accessors read through the four-step cascade `Sku.getCurrencyDetails()`
// [model/entity/Sku.cfc:L367-L433], whose memo is INSTANCE-scoped and whose instances are
// REQUEST-scoped. The boundary performs no lookup of its own into the resulting map, adds no second
// key-existence probe and supplies no eligible-currency list.
//
// ★★★ THIS IS THE HIGHEST-CONSEQUENCE SECTION IN THE FILE. Substituting `0` for any absence below
// would silently sell products for free.
// ===========================================================================

/** Drive one currency accessor over one SKU, with no account established. */
async function resolveCurrency(
  sku: ResolvedSku,
  operation:
    'getPriceByCurrencyCode' | 'getListPriceByCurrencyCode' | 'getRenewalPriceByCurrencyCode',
  currencyCode: string,
): Promise<{
  readonly price: ReturnType<typeof expectCurrencyPriceOutcome>;
  readonly json: string;
}> {
  const product = requireDefined(sku.getProduct(), 'product on the sku fixture');
  const selector: PriceResolutionSkuSelector = {
    productName: requireDefined(product.getProductName(), 'productName on the product fixture'),
    skuCode: requireDefined(sku.getSkuCode(), 'skuCode on the sku fixture'),
  };
  const scope = makeScope({
    catalog: makeCatalogReadsDouble([product], [sku]),
    priceGroupService: makePriceGroupServiceDouble().service,
  });

  const result = await dispatchPriceResolution(scope, { operation, sku: selector, currencyCode });

  return { price: expectCurrencyPriceOutcome(result), json: JSON.stringify(result) };
}

/** One entry of the materialised currency map, derived from the accessor that answers it. */
type CurrencyDetailView = NonNullable<ReturnType<ResolvedSku['getCurrencyDetails']>[string]>;

/**
 * Materialise the currency map a hydrated SKU carries.
 *
 * ★ WHY THIS SEAM, AND WHAT IT DOES *NOT* REPLACE. The cascade's own inputs are asynchronous - every
 * member of the currency port is - while the three accessors [model/entity/Sku.cfc:L269-L285] must stay
 * synchronous to preserve the legacy contract, so the port resolves that exactly as the entity
 * documents: the cascade runs during HYDRATION and the accessors read the instance memo synchronously.
 * The synchronous fixture therefore hands back a SKU with no materialised map, and an empty map carries
 * only the two meanings the legacy gives it - the eligibility gate at [L373] was closed, or this
 * hydration materialised none.
 *
 * So the map is supplied here exactly as an adapter would have supplied it, and THE REAL ACCESSORS THEN
 * APPLY THEIR REAL GUARDS - which is the whole point: the guard asymmetry below is produced by the
 * ported accessors, not by this helper. The four cascade steps that decide what a hydration puts in the
 * map are the entity tier's to pin, and are pinned there.
 */
function materialiseCurrencyDetails(
  sku: ResolvedSku,
  entries: Readonly<Record<string, CurrencyDetailView>>,
): Readonly<Record<string, CurrencyDetailView>> {
  const map: Readonly<Record<string, CurrencyDetailView>> = { ...entries };

  vi.spyOn(sku, 'getCurrencyDetails').mockReturnValue(map);

  return map;
}

describe('currency resolution, and the absences that are load-bearing (concern 3)', () => {
  it('answers nothing for every currency when the SKU carries no currency map', async () => {
    // ★ STEP 0 - THE GATE AT [model/entity/Sku.cfc:L373]. The whole cascade body is wrapped in
    // `if(len(setting('skuEligibleCurrencies')))`, so when that setting resolves EMPTY the memo stays
    // `{}` and EVERY accessor answers nothing for EVERY currency. The setting's own default is the
    // runtime-computed active-currency list [model/service/SettingService.cfc:L222], so a normal
    // installation has it populated - but the gate is real and a port that dropped it would change
    // behaviour in exactly the case where a caller can least afford a fabricated price.
    //
    // [L375] also applies NO active-flag restriction when it does filter the currency list, and its
    // sibling `getAllActiveCurrencyIDList` is the member that does; adding one would be a money bug.
    // Neither read is exposed by this entrypoint, so the boundary cannot filter a currency list at all -
    // it never reads one.
    const sku = makeSkuFixture({ skuEligibleCurrencies: '' });

    expect(sku.getCurrencyDetails()).toStrictEqual({});

    for (const currencyCode of [
      sku.getCurrencyCode(),
      SECONDARY_CURRENCY_CODE,
      INELIGIBLE_CURRENCY_CODE,
    ]) {
      for (const operation of [
        'getPriceByCurrencyCode',
        'getListPriceByCurrencyCode',
        'getRenewalPriceByCurrencyCode',
      ] as const) {
        const { price, json } = await resolveCurrency(sku, operation, currencyCode);

        expect(price.resolved).toBe(false);
        // NOT zero, not an empty amount, not a null a consumer can default with a single operator, and
        // not an omitted member either: the absence arm is PRESENT and explicit.
        expect(json).not.toContain('"amount"');
        expect(json).not.toContain('0.00');
      }
    }
  });

  it('distinguishes an ineligible currency from a currency lacking that particular price', async () => {
    // ★★ THE TWO DISTINCT ABSENCE PATHS, AND THE MECHANICAL REASON THEY DIFFER. Every cascade step sets
    // `.price` UNCONDITIONALLY [model/entity/Sku.cfc:L394, L409, L425] while `listPrice` and
    // `renewalPrice` are written only under `!isNull(...)` guards [L386/L390, L401/L405, L417/L421].
    // `getPriceByCurrencyCode` [L269-L273] therefore performs ONE key check and answers nothing only for
    // a currency the map does not hold, whereas `getListPriceByCurrencyCode` [L275-L279] and
    // `getRenewalPriceByCurrencyCode` [L281-L285] perform TWO and answer nothing for a currency the map
    // DOES hold when that sub-price was never recorded.
    //
    // The map below is precisely that state: one entry for the non-base currency whose price is present
    // and whose list and renewal prices are absent, which strands both permanently because Step 3's gate
    // is keyed on `"price"` ONLY [L416] - so once a price is recorded, the conversion step is skipped
    // ENTIRELY, including its own list-price and renewal-price writes.
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });

    materialiseCurrencyDetails(sku, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: 'skucurrency-4a71b0',
        price: Money.fromDecimalString('17.99'),
        priceFormatted: '17.99',
        converted: false,
      },
    });

    const present = await resolveCurrency(sku, 'getPriceByCurrencyCode', SECONDARY_CURRENCY_CODE);
    const strandedList = await resolveCurrency(
      sku,
      'getListPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE,
    );
    const strandedRenewal = await resolveCurrency(
      sku,
      'getRenewalPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE,
    );
    const ineligible = await resolveCurrency(
      sku,
      'getPriceByCurrencyCode',
      INELIGIBLE_CURRENCY_CODE,
    );

    // Path one: the currency IS in the map and carries a price.
    expect(present.price.resolved).toBe(true);

    // Path two: the same currency, in the same map, with no list or renewal price recorded.
    expect(strandedList.price.resolved).toBe(false);
    expect(strandedRenewal.price.resolved).toBe(false);

    // Path three: a currency the map never held at all.
    expect(ineligible.price.resolved).toBe(false);

    // The published reason is ONE value for both causes, deliberately: the accessor answers the same
    // nothing either way, and distinguishing them at this tier would mean re-implementing its second
    // key-existence check here, which is business logic this file must not contain.
    if (strandedList.price.resolved || ineligible.price.resolved) {
      throw new Error('both absences should have been reported');
    }

    expect(strandedList.price.reason).toBe<UnresolvedReason>('noPriceForCurrencyCode');
    expect(ineligible.price.reason).toBe<UnresolvedReason>('noPriceForCurrencyCode');
  });

  it('never substitutes zero, an empty amount or a defaultable null for an absence', async () => {
    const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });

    materialiseCurrencyDetails(sku, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: 'skucurrency-4a71b0',
        price: Money.fromDecimalString('17.99'),
        priceFormatted: '17.99',
        converted: false,
      },
    });

    const { price, json } = await resolveCurrency(
      sku,
      'getListPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE,
    );

    expect(price.resolved).toBe(false);
    expect(json).toBe(
      '{"outcome":"currencyPrice","price":{"resolved":false,"reason":"noPriceForCurrencyCode"}}',
    );
    // Stated three ways because each is a distinct way of getting this wrong: a numeric zero, the value
    // object's own rendering of zero, and the two-decimal presentation of zero. The middle expectation
    // builds zero through the value object rather than naming its zero constant, so that the only
    // mention of a zero Money in this suite is the one proving a zero never reaches the wire.
    expect(json).not.toContain(':0');
    expect(json).not.toContain(Money.fromDecimalString(ZERO_DECIMAL).toDecimalString());
    expect(json).not.toContain('"0.00"');
  });

  it('resolves the base currency through the setting rather than a literal in the boundary', async () => {
    // `getCurrencyCode()` [model/entity/Sku.cfc:L360-L365] merely memoises `this.setting('skuCurrency')`
    // and the default lives in the setting DECLARATION at [model/service/SettingService.cfc:L221]. There
    // is therefore no base-currency literal in the entity, none in this suite, and none in the boundary:
    // the code is read off the SKU, which read it from the settings provider the fixture built.
    const sku = makeSkuFixture();
    const baseCurrencyCode = sku.getCurrencyCode();

    expect(baseCurrencyCode.length).toBe(3);

    materialiseCurrencyDetails(sku, {
      [baseCurrencyCode]: {
        // [L382]: the base-currency entry's prices come from the SKU's own columns, so the row
        // identifier is empty - [L412] is the cascade's only non-empty write.
        skuCurrencyID: '',
        price: sku.getPrice(),
        priceFormatted: sku.getPrice().toFixed2(),
        converted: false,
      },
    });

    const base = await resolveCurrency(sku, 'getPriceByCurrencyCode', baseCurrencyCode);
    const other = await resolveCurrency(sku, 'getPriceByCurrencyCode', INELIGIBLE_CURRENCY_CODE);

    expect(base.price.resolved).toBe(true);
    expect(other.price.resolved).toBe(false);
  });

  it('folds case on the currency key, as a CFML struct lookup does', async () => {
    // CFML struct keys are case-insensitive and TypeScript object keys are not, so every ported
    // struct-keyed lookup is audited rather than assumed. The accessor keeps the legacy semantics.
    const sku = makeSkuFixture();

    materialiseCurrencyDetails(sku, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: 'skucurrency-4a71b0',
        price: Money.fromDecimalString('17.99'),
        priceFormatted: '17.99',
        converted: false,
      },
    });

    const upper = await resolveCurrency(
      sku,
      'getPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE.toUpperCase(),
    );
    const lower = await resolveCurrency(
      sku,
      'getPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE.toLowerCase(),
    );

    expect(upper.price.resolved).toBe(true);
    expect(lower.price.resolved).toBe(true);
    expect(upper.json).toBe(lower.json);
  });

  it('publishes the amount the map holds, at full precision and as a string', async () => {
    const sku = makeSkuFixture();
    // Chosen so the two-decimal presentation is NOT a prefix of the full rendering: `17.996` presents as
    // `18.00`, so a boundary that presented instead of publishing would be caught rather than hidden by a
    // substring match.
    const converted = Money.fromDecimalString('17.996');

    materialiseCurrencyDetails(sku, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: '',
        price: converted,
        priceFormatted: converted.toFixed2(),
        // [L427]: a conversion marks the entry converted, and a caller cannot tell a converted amount
        // from an unconverted one - the legacy publishes no such indicator and neither does this.
        converted: true,
      },
    });

    const { price, json } = await resolveCurrency(
      sku,
      'getPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE,
    );

    if (!price.resolved) {
      throw new Error('the secondary currency should have resolved');
    }

    expectSameDecimalValue(price.amount, converted.toDecimalString());
    expect(price.amount).toBe(converted.toDecimalString());
    // The presentation string the cascade recorded alongside the amount is NOT published: it is a
    // formatted view, and the two-decimal mask would round.
    expect(json).not.toContain(converted.toFixed2());
    expect(json).not.toContain('"converted"');
    expect(json).not.toContain('"priceFormatted"');
  });

  it('cannot let a response reach the live currency map', async () => {
    // [model/entity/Sku.cfc:L432] returns the LIVE memo reference rather than a copy, which is why the
    // ported accessor answers a `Readonly` projection and why instances are request-scoped. What the wire
    // carries is a PRIMITIVE STRING, so there is no reference to the map in a response at all - the
    // strongest form of the property, since it then holds however a consumer treats the document.
    const sku = makeSkuFixture();
    const map = materialiseCurrencyDetails(sku, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: 'skucurrency-4a71b0',
        price: Money.fromDecimalString('17.99'),
        priceFormatted: '17.99',
        converted: false,
      },
    });

    const before = JSON.stringify(Object.keys(map));
    const { price } = await resolveCurrency(sku, 'getPriceByCurrencyCode', SECONDARY_CURRENCY_CODE);

    if (!price.resolved) {
      throw new Error('the secondary currency should have resolved');
    }

    expect(typeof price.amount).toBe('string');
    expect(Object.keys(price)).toStrictEqual(['resolved', 'amount']);
    // The map is answered by identity on every read and is unchanged by having been read through.
    expect(sku.getCurrencyDetails()).toBe(map);
    expect(JSON.stringify(Object.keys(map))).toBe(before);
  });

  it('gives two freshly built SKUs two separate maps', async () => {
    // A2: nothing is shared between invocations. On a warm container a module-scoped currency map would
    // carry one request's state - and therefore one customer's price - into another's.
    const first = makeSkuFixture({ idPrefix: 'firstmemo' });
    const second = makeSkuFixture({ idPrefix: 'secondmemo' });

    materialiseCurrencyDetails(first, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: 'skucurrency-4a71b0',
        price: Money.fromDecimalString('17.99'),
        priceFormatted: '17.99',
        converted: false,
      },
    });

    expect(first.getCurrencyDetails()).not.toBe(second.getCurrencyDetails());
    expect(second.getCurrencyDetails()).toStrictEqual({});

    const populated = await resolveCurrency(
      first,
      'getPriceByCurrencyCode',
      SECONDARY_CURRENCY_CODE,
    );
    const empty = await resolveCurrency(second, 'getPriceByCurrencyCode', SECONDARY_CURRENCY_CODE);

    expect(populated.price.resolved).toBe(true);
    expect(empty.price.resolved).toBe(false);
  });
});

// ===========================================================================
// CONCERN 3 (continued) - RESPONSE SHAPING
// ===========================================================================

describe('response shaping (concern 3)', () => {
  it('binds one instant per invocation and renders it as UTC', () => {
    // ★ THE INJECTED CLOCK, AND THE EXPLICIT UTC POLICY. The response body's `resolvedAt` is
    // `RequestScope.now` rendered through `toISOString`, which always carries the `Z` designator - never
    // server local time and never a caller-supplied instant, because a caller able to move the pricing
    // clock could move a promotion window or a sale-price expiry. There is no bare `new Date()` and no
    // ambient clock read anywhere in the subject.
    //
    // The response ASSEMBLY itself lives past the composition root and is therefore out of this suite's
    // reach by the boundary decision recorded in the file header; what is pinned here is the value it
    // assembles from, and that two scopes bind two different instants rather than sharing one.
    const first = makeScope({
      catalog: makeSkuWorld().catalog,
      priceGroupService: makePriceGroupServiceDouble().service,
    });
    const second = makeScope({
      catalog: makeSkuWorld().catalog,
      priceGroupService: makePriceGroupServiceDouble().service,
      now: ALTERNATE_RESOLVED_AT,
    });

    expect(first.now.toISOString()).toBe(RESOLVED_AT);
    expect(second.now.toISOString()).toBe(ALTERNATE_RESOLVED_AT);
    expect(first.now.toISOString().endsWith('Z')).toBe(true);
    expect(first.now.getTime()).not.toBe(second.now.getTime());
  });

  it('never reads an ambient clock while dispatching', async () => {
    // Pinning the system clock to a third instant changes nothing, because nothing in the dispatch path
    // asks the process what time it is: every date-dependent read of a request resolves against the one
    // instant the scope bound.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('1999-12-31T23:59:59.000Z'));

    const { world, scope } = makeDoubledCascade();
    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.selector,
    });

    expect(JSON.stringify(result)).not.toContain('1999');
    expect(scope.now.toISOString()).toBe(RESOLVED_AT);
  });

  it('answers a mapped failure with a JSON document and no-store caching', async () => {
    // `no-store` is not a performance decision and carries no target of any kind: a resolved price is
    // account-scoped, so a shared cache must not be permitted to serve one account's price to another.
    const response = await handler(makeProxyEvent(), makeLambdaContext());

    expect(response.headers).toStrictEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
  });

  it('publishes exactly the documented envelope members and nothing else', async () => {
    const withoutFields = await handler(makeProxyEvent(), makeLambdaContext());
    const withFields = await handler(
      makeProxyEvent({ body: '{"operation":"nope"}' }),
      makeLambdaContext(),
    );

    // `fields` is present ONLY for a client-shaped failure that produced field-level complaints, and is
    // omitted entirely otherwise - never present and empty.
    expect([...readErrorEnvelope(withoutFields).memberNames].sort()).toStrictEqual([
      'category',
      'message',
      'requestId',
    ]);
    expect([...readErrorEnvelope(withFields).memberNames].sort()).toStrictEqual([
      'category',
      'fields',
      'message',
      'requestId',
    ]);
  });

  it('echoes the correlation identifier the runtime supplied, and no other request state', async () => {
    const distinct = 'b7e5c1a2-0000-4000-8000-0000000000ff';
    const response = await handler(makeProxyEvent(), makeLambdaContext(distinct));
    const envelope = readErrorEnvelope(response);

    expect(envelope.requestId).toBe(distinct);
    expect(envelope.raw).not.toContain(ROUTE_TABLE.priceResolution.path);
  });
});

// ===========================================================================
// CONCERN 4 - ERROR MAPPING
//
// Two halves, and the split follows the composition-root boundary. Through `handler`: the statuses,
// sentences and headers a caller actually receives on the reachable paths. Through the dispatcher: that
// a failure raised behind the boundary LEAVES IT UNTOUCHED, so the mapper - and nothing else - decides
// what a caller is told.
// ===========================================================================

describe('error mapping (concern 4)', () => {
  it('uses a minimal status set, and mints nothing the source never had', async () => {
    // The legacy slice has no HTTP status vocabulary at all, so the mapper's three codes are the whole
    // range: client-shaped, route-not-found and server-shaped. Nothing here mints a 401, 403, 409, 422 or
    // 429, and no retry-after, rate-limit or circuit-breaker member exists on any response.
    const responses: readonly APIGatewayProxyResult[] = [
      await handler(makeProxyEvent(), makeLambdaContext()),
      await handler(makeProxyEvent({ body: '{' }), makeLambdaContext()),
      await handler(makeProxyEvent({ body: '[]' }), makeLambdaContext()),
      await handler(makeProxyEvent({ body: '{"operation":"nope"}' }), makeLambdaContext()),
      await handler(makeProxyEvent({ httpMethod: 'PUT' }), makeLambdaContext()),
      await handler(makeProxyEvent({ path: '/prices' }), makeLambdaContext()),
    ];

    for (const response of responses) {
      expect([400, 404]).toContain(response.statusCode);
      expect(response.body).not.toContain('retry');
      expect(response.body).not.toContain('rate-limit');
      expect(response.body).not.toContain('circuit');
      // A client-shaped refusal never publishes the server-shaped generic sentence.
      expect(readErrorEnvelope(response).message).not.toBe(GENERIC_FAILURE_MESSAGE);
    }
  });

  it('publishes no stack, no statement text, no host name and no environment value', async () => {
    const response = await handler(
      makeProxyEvent({ body: `{"operation":"${PLANTED_INTERNAL_DETAIL}"}` }),
      makeLambdaContext(),
    );
    const envelope = readErrorEnvelope(response);

    expect(envelope.raw).not.toContain(PLANTED_INTERNAL_DETAIL);
    for (const forbidden of ['at Object.', 'SELECT ', 'Error:', 'localhost', '127.0.0.1', 'DB_']) {
      expect(envelope.raw).not.toContain(forbidden);
    }
  });

  it('logs the reason and the route while publishing neither', async () => {
    // ★ THE DETAIL IS ON THE LOG STREAM AND THE BODY CARRIES THE FIXED SENTENCE. The reason a handler
    // NAMED is a closed literal and is the detail an operator needs; the route is diagnostic and
    // reflecting a caller-supplied path back serves no purpose the correlation identifier does not
    // already serve. Captured at the stream the module logger writes to, with the original write still
    // delegated to, so nothing is silenced.
    const capture = captureLogStream();

    const response = await handler(makeProxyEvent({ body: '[]' }), makeLambdaContext());
    const envelope = readErrorEnvelope(response);

    expect(envelope.message).toBe(INVALID_BODY_MESSAGES.unsupportedBodyShape);
    expect(envelope.raw).not.toContain('unsupportedBodyShape');
    expect(envelope.raw).not.toContain(ROUTE_TABLE.priceResolution.path);

    expect(capture.text()).toContain('unsupportedBodyShape');
    expect(capture.text()).toContain(ROUTE_TABLE.priceResolution.path);
    expect(capture.lines.some((line) => line.level === 'warn')).toBe(true);
  });

  it('logs field paths only, never a submitted value', async () => {
    const capture = captureLogStream();

    await handler(
      makeProxyEvent({
        body: JSON.stringify({
          operation: 'getRateForSkuBasedOnPriceGroup',
          sku: { productName: PLANTED_INTERNAL_DETAIL, skuCode: '' },
        }),
      }),
      makeLambdaContext(),
    );

    expect(capture.text()).toContain('fieldPaths');
    expect(capture.text()).not.toContain(PLANTED_INTERNAL_DETAIL);
  });

  it('lets a failure raised behind the boundary leave it untouched', async () => {
    // ★ THE DISPATCHER CATCHES NOTHING, CLASSIFIES NOTHING AND REPAIRS NOTHING. Wrapping a service
    // failure to answer an empty document, a partial one or an absence arm would repair a defect at the
    // boundary and hide it from every caller. Classification belongs to the mapper alone, which is
    // SELECTIVE rather than a pass-through - the pinned MySQL driver's messages routinely embed the
    // failing statement and its bound values.
    const failures: readonly unknown[] = [
      new Error(MISSING_METHOD_CONTRACT_MESSAGE),
      new Error(UNRECOGNISED_FRAMEWORK_MESSAGE),
      new Error(`connection failed reaching ${PLANTED_INTERNAL_DETAIL}`),
      'a thrown string, which is not an Error at all',
    ];

    for (const thrown of failures) {
      const world = makeSkuWorld();
      const priceGroups = makePriceGroupServiceDouble({
        failing: { member: 'getPriceGroupDataJSON', thrown },
      });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      await expect(
        dispatchPriceResolution(scope, { operation: 'getPriceGroupDataJSON' }),
      ).rejects.toStrictEqual(thrown);
    }
  });

  it('preserves the framework dead-call-target message exactly as thrown', async () => {
    // LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the
    // framework's terminal throw is ungrammatical - "does not exists" - and the service-tier copy still
    // says "entity". It is an OBSERVABLE ERROR CONTRACT, so the dispatcher must not normalise, reword or
    // wrap it on the way out; the mapper recognises it by that exact shape and publishes it verbatim.
    // Preserved deliberately; do not fix without a product decision.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble({
      failing: {
        member: 'calculateSkuPriceBasedOnAccount',
        thrown: new Error(MISSING_METHOD_CONTRACT_MESSAGE),
      },
    });
    const scope = makeScope({
      catalog: world.catalog,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const raised: unknown = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.selector,
    }).then(
      (): unknown => undefined,
      (error: unknown): unknown => error,
    );

    if (!(raised instanceof Error)) {
      throw new Error('the dispatcher should have raised the failure it was handed');
    }

    // Narrowed by `instanceof`, never by a conversion, and read off the error itself: `message` is a
    // non-enumerable own property, so a structural read would silently miss it.
    expect(raised.message).toBe(MISSING_METHOD_CONTRACT_MESSAGE);
    expect(MISSING_METHOD_CONTRACT_MESSAGE).toContain('does not exists');
    // The DIFFERENT variant thrown by `invokeMethod` diverges on four counts - a different opening
    // clause, no `()`, correct grammar and no trailing " entity." - so it is not the same contract and
    // must not be conflated with it.
    expect(UNRECOGNISED_FRAMEWORK_MESSAGE).not.toContain('does not exists');
    expect(UNRECOGNISED_FRAMEWORK_MESSAGE).not.toContain(' entity.');
  });

  it('lets a failure from any exposed member out, not just from one', async () => {
    for (const member of EXPOSED_PRICE_GROUP_MEMBERS) {
      const world = makeSkuWorld();
      const graph = makePriceGroupFixtures();
      const priceGroups = makePriceGroupServiceDouble({
        bestPriceGroup: graph.childPriceGroup,
        rateForSku: graph.percentageOffRateWithRoundingRule,
        failing: { member, thrown: new Error(`${member} failed: ${PLANTED_INTERNAL_DETAIL}`) },
      });
      const scope = makeScope({
        catalog: world.catalog,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      // Whichever operation reaches this member first, the failure must surface rather than being
      // absorbed into an absence arm. `getPriceGroupDataJSON` is the one member reached by exactly one
      // operation; every other member is reached by the operation named after it.
      const operation: PriceResolutionOperation =
        member === 'getBestPriceGroupDetailsBasedOnSkuAndAccount'
          ? 'getBestPriceGroupDetailsBasedOnSkuAndAccount'
          : member;

      await expect(
        dispatchPriceResolution(scope, requestFor(operation, world.selector)),
      ).rejects.toThrow(PLANTED_INTERNAL_DETAIL);
    }
  });
});

// ===========================================================================
// ISOLATION (A2)
//
// No mutable module state, a fresh subject per case, a fresh fixture graph per call, and no object
// shared across invocations. On a warm container shared state is one customer's price reaching another's
// request, which is why this is asserted rather than assumed.
// ===========================================================================

describe('isolation between invocations (A2)', () => {
  it('builds a fresh, unshared graph on every fixture call', () => {
    const first = makePriceGroupFixtures();
    const second = makePriceGroupFixtures();

    expect(first.childPriceGroup).not.toBe(second.childPriceGroup);
    expect(first.skuLevelRateLastMatch).not.toBe(second.skuLevelRateLastMatch);
    expect(first.roundingRuleValueRounder).not.toBe(second.roundingRuleValueRounder);
    // Identifiers collide by design - the prefix defaults - so identity, not equality, is the test.
    expect(first.childPriceGroup.getPriceGroupID()).toBe(second.childPriceGroup.getPriceGroupID());
  });

  it('keeps the history of each recording double to itself', async () => {
    const firstWorld = makeSkuWorld({ idPrefix: 'firstrec' });
    const secondWorld = makeSkuWorld({ idPrefix: 'secondrec' });
    const firstDouble = makePriceGroupServiceDouble();
    const secondDouble = makePriceGroupServiceDouble();

    await dispatchPriceResolution(
      makeScope({ catalog: firstWorld.catalog, priceGroupService: firstDouble.service }),
      { operation: 'getPriceGroupDataJSON' },
    );

    expect(firstDouble.calls).toHaveLength(1);
    expect(secondDouble.calls).toHaveLength(0);
    expect(secondWorld.catalog.productQueries).toStrictEqual([]);
  });

  it('does not let the answers of one invocation reach another', async () => {
    // The same doubled world, driven twice with different answers, produces two independent results -
    // and the second invocation sees nothing the first put anywhere.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();

    const dear = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      priceForPriceGroup: Money.fromDecimalString('49.95'),
    });
    const cheap = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      priceForPriceGroup: Money.fromDecimalString('4.95'),
    });

    const dearResult = await dispatchPriceResolution(
      makeScope({
        catalog: world.catalog,
        priceGroupService: dear.service,
        accountID: ACCOUNT_ID,
      }),
      { operation: 'calculateSkuPriceBasedOnPriceGroup', sku: world.selector },
    );
    const cheapResult = await dispatchPriceResolution(
      makeScope({
        catalog: world.catalog,
        priceGroupService: cheap.service,
        accountID: 'account-1a2b3c',
      }),
      { operation: 'calculateSkuPriceBasedOnPriceGroup', sku: world.selector },
    );

    expect(expectPriceOutcome(dearResult)).toBe('49.95');
    expect(expectPriceOutcome(cheapResult)).toBe('4.95');
    expect(dear.calls[0]?.args[1]).toBe(ACCOUNT_ID);
    expect(cheap.calls[0]?.args[1]).toBe('account-1a2b3c');
  });

  it('holds the account association per harness, so no mutation can outlive a request', async () => {
    // ★ THE CFML-TO-TYPESCRIPT TRAP THIS GUARDS. [model/service/PriceGroupService.cfc:L276] takes the
    // account's price groups BY VALUE - CFML copies arrays - and [L282] appends the account's subscription
    // price groups into that copy, so the legacy mutates a copy while a TypeScript reference would mutate
    // the source. The port's own contract goes the other way DELIBERATELY, keeping one live array per
    // request so the documented legacy visibility stays observable - and the safety property is provided
    // by SCOPE instead: the array is built inside each harness, so two harnesses over the same graph share
    // nothing and no mutation can outlive one request.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      skuLevelRateSkus: [world.sku],
    });

    const first = makePortedPriceGroupService({
      accountPriceGroups: [graph.childPriceGroup],
      subscriptionPriceGroups: [graph.siblingPriceGroup],
    });
    const second = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });

    await dispatchPriceResolution(
      makeScope({
        catalog: world.catalog,
        priceGroupService: first.service,
        accountID: ACCOUNT_ID,
      }),
      { operation: 'calculateSkuPriceBasedOnAccount', sku: world.selector },
    );

    const secondWorld = makeSkuWorld({ idPrefix: 'secondassoc' });
    const secondResult = await dispatchPriceResolution(
      makeScope({
        catalog: secondWorld.catalog,
        priceGroupService: second.service,
        accountID: ACCOUNT_ID,
      }),
      { operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount', sku: secondWorld.selector },
    );

    // The first harness saw the subscription reach-through; the second never did, and its report is not
    // influenced by the first harness's appended member.
    expect(first.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
    expect(second.subscriptionReads).toStrictEqual([]);
    expect(secondResult.outcome).toBe('bestPriceGroupDetails');
  });

  it('never mutates a fixture through a response', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = graph.percentageOffRateWithRoundingRule;
    const before = JSON.stringify({
      appliesTo: rate.getAppliesTo(),
      amountFormatted: rate.getAmountFormatted(),
      amountType: rate.getAmountType(),
    });

    const priceGroups = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      rateForSku: rate,
    });
    const result = await dispatchPriceResolution(
      makeScope({
        catalog: world.catalog,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      }),
      { operation: 'getRateForSkuBasedOnPriceGroup', sku: world.selector },
    );

    expect(expectResolvedRate(result).priceGroupRateID).toBe(rate.getPriceGroupRateID());
    expect(
      JSON.stringify({
        appliesTo: rate.getAppliesTo(),
        amountFormatted: rate.getAmountFormatted(),
        amountType: rate.getAmountType(),
      }),
    ).toBe(before);
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
  });
});
