// ---------------------------------------------------------------------------
// The price-resolution Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: there is no `.cfc` antecedent for a Lambda entrypoint
// and no legacy test file reaches the handler tier. The two legacy-extended suites in this subtree are
// the brand and product entity suites, and neither is this one. What IS legacy here is the BEHAVIOUR
// the cases assert - the five-level cascade, the amount-type asymmetry, the measured rounding outputs,
// the load-bearing absences - and every one of those is cited to the line it was read from.
//
// Four concerns and no others: parsing and validation of the wire document, delegation to one
// already-ported member per operation, response shaping, and mapping of anything thrown. The
// highest-value cases prove the entrypoint owns NO business logic: no cascade walking, no rate
// selection, no rounding, no percentage arithmetic, no currency conversion, no defaulting and no
// clamping happens in transit - whatever the ported service answered is what leaves, byte for byte.
//
// THE SYNC/ASYNC BOUNDARY IS PART OF WHAT IS UNDER TEST. A ported member is `async` if and only if its
// legacy body reached the DAO or the ORM, so the three `getRateFor*` members and
// `calculateSkuPriceBasedOnPriceGroup[Rate]` are driven synchronously while
// `calculateSkuPriceBasedOn[Current]Account`, `getBestPriceGroupDetailsBasedOnSkuAndAccount`,
// and `convertCurrency` are awaited. `getPriceGroupDataJSON` remains asynchronous on the service but
// is withdrawn from this routed surface. A published member that changed side of the sync/async line
// would fail here.
//
// TWO SEAMS, DELIBERATELY. `dispatchPriceResolution(scope, request)` takes the request scope as a
// PARAMETER, so a suite builds a six-member fake and drives all twelve routed operations with no
// composition root, database, pool, network, filesystem or environment - everything about delegation,
// absence and serialisation is asserted through it. `handler(event, lambdaContext)` obtains its scope
// from the memoized composition root instead, so it is driven ONLY on the paths that resolve BEFORE
// that call - routing, body reading and schema rejection - and each such case additionally asserts that
// nothing was wired. Every case passes with a completely empty environment.
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
// HOW THE SUBJECT IS DRIVEN, AND WHY IT IS DRIVEN THREE WAYS
//   `dispatchPriceResolution(scope, request)` is the seam the module publishes for exactly this
//   purpose: it takes the request scope as a PARAMETER, so a suite builds a six-member fake and
//   drives all twelve routed operations with no composition root, no database, no pool, no network, no
//   filesystem and no environment. Everything about delegation, absence and serialisation is
//   asserted through it.
//
//   The exported `handler` - built with NO arguments, exactly as the deployed entrypoint is - obtains
//   its scope from the MEMOIZED composition root, so it is driven only on the paths that resolve
//   BEFORE that call: routing, body reading and schema rejection. Reaching the memoized root would
//   make those cases depend on five environment variables and could open a connection pool, and both
//   are forbidden here.
//
//   ★★ QUOTE-THEN-REVISE, AND THIS IS THE SENTENCE A CODE REVIEW OVERTURNED. The paragraph above used
//   to end "That is a deliberate boundary, not a gap", and it was a gap. The review measured that NOT
//   ONE of the then-thirteen valid operations crossed the entrypoint - "price 13/13 at the dispatcher
//   but 0/13 through `handler`" - because the entrypoint published no substitution seam at all: it called
//   the module-imported `bootstrapCompositionRoot()` and emitted through the module-imported logger.
//   `createPriceResolutionHandler({ compositionRoot, logger })` is now that seam, and it is the THIRD
//   way the subject is driven: concern 7 builds the REAL composition root over an injected statement
//   executor and an explicit environment source and puts all twelve surviving routed operations, the
//   success log and the 500-on-a-valid-route path through the entrypoint. The thirteenth operation,
//   `getPriceGroupDataJSON`, was subsequently withdrawn. The environment contract below is unchanged
//   by the seam - the source is handed over explicitly, so `process.env` is still never read.
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
//   * `src/lib/logger.ts`. NEVER SUBSTITUTED, because the module-level logger is `Object.freeze`d
//     precisely so its emitting surface cannot be reshaped at run time. Emissions are observed where
//     they actually land instead - at `process.stdout.write`, which is the sink `writeLineToStdout`
//     uses - and the capture DELEGATES to the original write, so nothing is silenced and no stream is
//     globally patched.
//
//     ★ IT IS IMPORTED FOR EXACTLY ONE PURPOSE, AND FINDING F7 IS THAT PURPOSE. The logger applies a
//     MANDATORY, NON-DISABLEABLE key-based redaction policy, and four of the six keys the subject's
//     success line carries were being redacted by it - leaving an operator a served-request line with
//     a correlation identifier and little else. That is invisible to any test double, because a double
//     records the context object AS GIVEN. It is equally invisible through `handler`, whose success
//     path runs past the composition root this suite never wires. So one case emits the subject's own
//     success context through the real instance with stdout captured, which is the only way to observe
//     what an operator would actually receive.
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import type { CurrentAccountContext } from '../../../src/domain/ports/priceGroupRepository.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import { jsonSuccessResponse } from '../../../src/handlers/errorMapper.js';
import type {
  PriceResolutionOperation,
  PriceResolutionRequest,
  PriceResolutionResult,
  PriceResolutionResultDocument,
  PriceResolutionScope,
  PriceResolutionSkuIdentity,
  UnresolvedReason,
} from '../../../src/handlers/priceResolutionHandler.js';
import {
  createPriceResolutionHandler,
  dispatchPriceResolution,
  handler,
  REQUIRED_SUCCESS_RESPONSE_HEADERS,
} from '../../../src/handlers/priceResolutionHandler.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
import { logger as productionLogger } from '../../../src/lib/logger.js';
import { PriceGroupService } from '../../../src/services/priceGroupService.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';
// ★★★ THE FIVE IMPORTS THE ENTRYPOINT CASES NEED, AND THE FINDING THAT PUT THEM HERE.
//
// A code review measured that NOT ONE of the then-thirteen valid operations crossed this module's
// Lambda entrypoint: `handler` called the module-imported `bootstrapCompositionRoot()` directly, so
// the only paths a suite could drive through it were the ones that refuse BEFORE a composition root
// exists. Twelve remain routed after the whole-document operation was withdrawn.
// `createPriceResolutionHandler` is the seam that fixes it, and these are what a case supplies to it:
//
//   * `bootstrapCompositionRoot` with an INJECTED executor and an EXPLICIT environment source, which
//     is the same construction `tests/unit/handlers/bootstrap.test.ts` uses. It opens no `mysql2`
//     pool, reads no `process.env` and issues no statement this suite does not answer - so the graph
//     behind these cases is the REAL one, assembled by the real composition root, with no cast.
//   * `resetCompositionRoot`, because the module memo is module state. Overrides bypass it, but a
//     suite that leaves it populated would hand a sibling file a graph it did not build.
//   * the two service CLASSES whose members the price paths reach, so a case can programme an answer
//     on the prototype the real scope's instances inherit from. That is what keeps this a unit suite
//     while still exercising the real wiring: nothing about the graph is faked, only the two catalogue
//     reads and the nine price-group members are answered from data.
//   * the process `logger`, used only through its published `withSink` seam.
import { bootstrapCompositionRoot, resetCompositionRoot } from '../../../src/handlers/bootstrap.js';
import type {
  CompositionRoot,
  InspectableRequestScope,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import { appConfig } from '../../../src/lib/config.js';
import type { EnvironmentSource } from '../../../src/lib/config.js';
import { logger as processLogger } from '../../../src/lib/logger.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { MySqlPriceGroupRepository } from '../../../src/repositories/mysql/mysqlPriceGroupRepository.js';
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';

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

/**
 * The identifier the EVENT carries, distinct from the one the CONTEXT carries.
 *
 * Distinct on purpose: this entrypoint reads the correlation token from the Lambda context alone -
 * unlike `./promotionApplicationHandler.js`, which falls back to the event - so every case that
 * asserts `requestId` is asserting the context was read and this member was NOT.
 */
const PLATFORM_REQUEST_ID = 'a1b2c3d4-0000-4000-8000-0000000000e5';

/** The authenticated account, reduced to an opaque identifier - never a name and never an address. */
const ACCOUNT_ID = 'account-9f13c7';

/**
 * Planted internal detail, long and unique and free of regular-expression metacharacters so a
 * substring search cannot produce a false result either way. It stands in for the class of text a
 * failure legitimately carries and a response body must never publish: a driver message, a resolved
 * path, an echo of submitted input.
 */
const PLANTED_INTERNAL_DETAIL = 'PLANTED-INTERNAL-DETAIL-6d20f4b91c3e';

/**
 * A caller-authored ANCESTOR key, deliberately named like a credential.
 *
 * It exists for one purpose: proving that a refusal which names an offending member does not repeat the
 * member names the caller chose to wrap it in. A security review found (MAJOR, CWE-209/CWE-532) that the
 * prototype-key refusal published the whole dotted location, ancestors included, so a body such as
 * `{"api_token_value":{"__proto__":{}}}` had this class of name echoed into a 400 and persisted in the
 * logs.
 */
const PLANTED_ANCESTOR_KEY = 'planted_api_token_value_4c17ea';

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

/**
 * Obviously-fabricated identifiers for the raw-body cases in concern 1.
 *
 * Those cases drive `handler` with hand-written JSON to exercise the SCHEMA, and never reach a loader,
 * so the identifiers need only be well-formed strings. Cases that reach a loader read their identifiers
 * off the fixtures instead - see {@link SkuWorld.identity}.
 */
const SENTINEL_PRICE_GROUP_ID = 'pricegroup-0000-not-loaded';
const SENTINEL_PRICE_GROUP_RATE_ID = 'pricegrouprate-0000-not-loaded';
const SENTINEL_PRODUCT_ID = 'product-0000-not-loaded';
const SENTINEL_PRODUCT_TYPE_ID = 'producttype-0000-not-loaded';
const SENTINEL_SKU_ROW_ID = 'sku-0000-not-loaded';

/** A well-formed SKU identity for the raw-body cases. */
const SENTINEL_SKU_IDENTITY = {
  productID: SENTINEL_PRODUCT_ID,
  skuID: SENTINEL_SKU_ROW_ID,
} as const;

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
  // ★★★ `getPriceGroupDataJSON` USED TO SIT HERE AND IS WITHDRAWN (finding F10). It took NO arguments
  // and answered a document covering every price group and every rate the framework smart list pages
  // over, so a routed contract had nothing to bound and one request obliged the process to build the
  // whole thing and stringify it into a single API Gateway body. It is asserted from the OUTSIDE now,
  // in the withdrawal block below.
  'getPriceByCurrencyCode',
  'getListPriceByCurrencyCode',
  'getRenewalPriceByCurrencyCode',
  'convertCurrency',
];

/**
 * The eight price-group members the subject's scope exposes.
 *
 * Typed as the scope's own key union, so a member added to or removed from
 * `PriceResolutionScope['priceGroupService']` fails to compile here rather than passing silently -
 * which is how the withdrawal of `getPriceGroupDataJSON` (finding F10) is enforced at compile time
 * rather than only at run time.
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
  // ★★ THE FIFTH IS NEW AND IS A WITHDRAWAL RATHER THAN A BOUNDARY (finding F10). The other four
  // were never routable here; this one WAS, and was removed from the schema, the result union, the
  // scope's `Pick` and the dispatcher. It is still ported in full at
  // `../../../src/services/priceGroupService.js`, where its two legacy defects remain reproduced,
  // flagged and covered - withdrawing it takes them off an HTTP surface without repairing or hiding
  // them.
  'getPriceGroupDataJSON',
];

// ---------------------------------------------------------------------------
// Entity types, DERIVED from the published surface rather than imported
//
// `src/domain/entities/**` is not among this file's declared dependencies, and deriving each type
// from the signature that produces it is better than importing anyway: the compiler recomputes them
// from the subject's own scope type, so this suite cannot drift from the shapes it actually feeds in.
// It is the same derivation the subject performs on itself.
// ---------------------------------------------------------------------------

// ★★★ EVERY TYPE BELOW NOW DERIVES FROM `entityLoaders` RATHER THAN FROM TWO SEARCH READS.
// The subject used to publish `productService.findProducts` and `skuService.getProductSkus` on its
// scope, because those were the only published reads that could reach a SKU, and it searched product
// NAMES to find one. Finding F3 replaced that with five READ-ONLY loads by identifier, so the entity
// types come off the loads and the two search reads are gone from the scope entirely - which is what
// makes the removed selector a compile error rather than merely unused.

type ResolvedProduct = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getProductByProductID']>>
>;

type ResolvedSku = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getSkuBySkuIdentity']>>
>['sku'];

type ResolvedPriceGroup = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getPriceGroup']>>
>;

type ResolvedPriceGroupRate = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getPriceGroupRate']>>
>;

type ResolvedProductType = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getProductTypeByProductTypeID']>>
>;

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

/** The six categories `./errorMapper.js` publishes, and no others. */
const MAPPED_CATEGORIES: readonly ErrorResponseBody['error']['category'][] = [
  'missingMethod',
  'routeNotFound',
  'invalidRequest',
  'unauthenticated',
  'forbidden',
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

    // ★★★ NO `getPriceGroupDataJSON` MEMBER. The scope's `Pick` no longer lists it (finding F10), so
    // declaring one here would not compile - which is the compile-time half of the withdrawal.
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

/** One recorded entity load, by the loader that was asked and the identifier it was given. */
interface RecordedLoad {
  readonly loader:
    | 'getProductByProductID'
    | 'getProductTypeByProductTypeID'
    | 'getSkuBySkuIdentity'
    | 'getPriceGroup'
    | 'getPriceGroupRate';
  readonly identifier: string;
}

/** What the five loaders answer, and the record of what was asked of them. */
interface EntityLoadersDouble {
  readonly loaders: PriceResolutionScope['entityLoaders'];
  readonly loads: readonly RecordedLoad[];
}

/** What one case wants the loaders to hold. Anything absent answers a MISS. */
interface LoadableWorld {
  readonly product?: ResolvedProduct | undefined;
  readonly productType?: ResolvedProductType | undefined;
  readonly sku?: ResolvedSku | undefined;
  readonly priceGroup?: ResolvedPriceGroup | undefined;
  readonly priceGroupRate?: ResolvedPriceGroupRate | undefined;
}

/**
 * Build the five READ-ONLY loads.
 *
 * ★★★ THIS REPLACED `makeCatalogReadsDouble`, AND THE REPLACEMENT IS THE STRUCTURAL HALF OF FINDING
 * F3. That double answered `findProducts` and `getProductSkus` UNFILTERED, deliberately, because
 * narrowing a `{productName, skuCode}` selector down to one candidate was the SUBJECT's work - and
 * that was precisely the work a primary adapter should never have been doing. There is nothing left to
 * narrow: each loader is asked for ONE identifier and either holds the row or does not.
 *
 * ★★ EVERY LOADER MATCHES ON THE IDENTIFIER IT IS GIVEN, RATHER THAN ANSWERING UNCONDITIONALLY. A
 * double that answered any identifier would let a case pass while the subject forwarded the WRONG one,
 * which is the exact class of defect finding F3 was about. So a mismatch is a MISS, and the recorded
 * identifier is available for a case that wants to assert the forwarding directly.
 *
 * A MISS IS `undefined`, never a throw and never a fabricated entity - the posture
 * `RequestEntityLoaders` documents, and the same posture `Sku.getPriceByCurrencyCode` takes.
 */
function makeEntityLoadersDouble(world: LoadableWorld = {}): EntityLoadersDouble {
  const loads: RecordedLoad[] = [];

  return {
    loads,
    loaders: {
      getProductByProductID: (productID: string): Promise<ResolvedProduct | undefined> => {
        loads.push({ loader: 'getProductByProductID', identifier: productID });

        const held = world.product;

        return Promise.resolve(
          held !== undefined && held.getProductID() === productID ? held : undefined,
        );
      },

      getProductTypeByProductTypeID: (
        productTypeID: string,
      ): Promise<ResolvedProductType | undefined> => {
        loads.push({ loader: 'getProductTypeByProductTypeID', identifier: productTypeID });

        const held = world.productType;

        return Promise.resolve(
          held !== undefined && held.getProductTypeID() === productTypeID ? held : undefined,
        );
      },

      getSkuBySkuIdentity: (
        identity: PriceResolutionSkuIdentity,
      ): Promise<{ readonly product: ResolvedProduct; readonly sku: ResolvedSku } | undefined> => {
        loads.push({
          loader: 'getSkuBySkuIdentity',
          identifier: `${identity.productID}/${identity.skuID}`,
        });

        const heldSku = world.sku;
        const heldProduct = world.product;

        if (
          heldSku === undefined ||
          heldProduct === undefined ||
          heldSku.getSkuID() !== identity.skuID ||
          heldProduct.getProductID() !== identity.productID
        ) {
          return Promise.resolve(undefined);
        }

        // The product is the SKU'S OWN, exactly as the real loader wires it: `getProductSkus` puts
        // this instance onto every SKU it builds, which is what makes the cascade's product entry
        // point reproduce [model/service/PriceGroupService.cfc:L154] rather than pairing the SKU with
        // a second product a caller named independently.
        return Promise.resolve({ product: heldProduct, sku: heldSku });
      },

      getPriceGroup: (priceGroupID: string): Promise<ResolvedPriceGroup | undefined> => {
        loads.push({ loader: 'getPriceGroup', identifier: priceGroupID });

        const held = world.priceGroup;

        return Promise.resolve(
          held !== undefined && held.getPriceGroupID() === priceGroupID ? held : undefined,
        );
      },

      getPriceGroupRate: (
        priceGroupRateID: string,
      ): Promise<ResolvedPriceGroupRate | undefined> => {
        loads.push({ loader: 'getPriceGroupRate', identifier: priceGroupRateID });

        const held = world.priceGroupRate;

        return Promise.resolve(
          held !== undefined && held.getPriceGroupRateID() === priceGroupRateID ? held : undefined,
        );
      },
    },
  };
}

/** Everything one scope needs, with the doubles a case usually wants to reach afterwards. */
interface ScopeParts {
  readonly entityLoaders: EntityLoadersDouble;
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
    entityLoaders: parts.entityLoaders.loaders,
    priceGroupService: parts.priceGroupService,
    currencyConverter: parts.currencyConverter ?? makeCurrencyConverterDouble().converter,
  };
}

/** One SKU, its product, that product's product type, and the identifiers naming them. */
interface SkuWorld {
  readonly sku: ResolvedSku;
  readonly product: ResolvedProduct;
  readonly productType: ResolvedProductType;

  /**
   * How a request names this SKU: by identifier.
   *
   * ★★★ THIS USED TO BE A `selector` OF `{productName, skuCode}` (finding F3). The name and the code
   * were read off the fixtures and the subject searched for them - a `productName LIKE ?` scan, an
   * exact-name filter, then every SKU of the matched product and an exact-code filter. The identifiers
   * are still read off the fixtures for the same reason the name and code were, so no case can drift
   * from what the loaders hold; what changed is that the subject now LOADS rather than SEARCHES.
   */
  readonly identity: PriceResolutionSkuIdentity;

  readonly entityLoaders: EntityLoadersDouble;
}

/**
 * Build one SKU world.
 *
 * The identifiers are read OFF the entities rather than written as literals, so no case can drift from
 * the fixture, and the product the loaders hold is the SKU'S OWN - which is what makes the three
 * `getRateFor*` entry points coherent rather than merely callable, reproducing
 * [model/service/PriceGroupService.cfc:L154], where the argument is `arguments.sku.getProduct()`.
 */
function makeSkuWorld(overrides?: SkuOverrides): SkuWorld {
  const sku = makeSkuFixture(overrides);
  const product = requireDefined(sku.getProduct(), 'product on the sku fixture');
  const productType = requireDefined(
    product.getProductType(),
    'productType on the product fixture',
  );

  const identity: PriceResolutionSkuIdentity = {
    productID: product.getProductID(),
    skuID: sku.getSkuID(),
  };

  return {
    sku,
    product,
    productType,
    identity,
    entityLoaders: makeEntityLoadersDouble({ product, productType, sku }),
  };
}

// ---------------------------------------------------------------------------
// The Lambda invocation surface
//
// The exported `handler` is driven only on the paths that resolve before the MEMOIZED composition root
// is reached; the handler CONCERN 7 builds over an injected root is driven on all twelve valid
// operations. One event builder serves both, and it now constructs the platform event in full rather
// than converting a five-member partial into one - see its own note.
// ---------------------------------------------------------------------------

/**
 * The parts of a version 1.0 proxy event this entrypoint actually reads.
 *
 * Verified by reading the subject: `routeRequestFromEvent` takes `httpMethod` and `path`,
 * `resolveRequestPrincipal` takes `requestContext.authorizer`, and `readRequestDocument` takes
 * `body` and `isBase64Encoded`. Nothing else is touched - no header, no query string, no path
 * parameter, no stage variable, and never the legacy identity block.
 */
interface ProxyEventFacts {
  readonly httpMethod?: string | undefined;
  readonly path?: string | undefined;
  readonly body?: string | null | undefined;
  readonly isBase64Encoded?: boolean | undefined;
  readonly authorizer?: Readonly<Record<string, unknown>> | null | undefined;
}

/**
 * Build a proxy event carrying those five members.
 *
 * ★★ QUOTE-THEN-REVISE: THE ONE CONVERSION THIS FUNCTION USED TO PERFORM IS GONE.
 *
 * It ended `return partial as unknown as APIGatewayProxyEvent;`, justified like this: "ONE
 * narrowly-scoped conversion, confined to this function, rather than fabricating the twenty-odd
 * members the subject never reads. First, several of the unread members belong to the event's
 * caller-identity block, whose member names are credential-shaped; writing them into a suite that must
 * contain no credential-shaped text would be worse than not writing them. Second, a fabricated
 * identity block, stage variable map and multi-value header map would be twenty lines of noise that no
 * case reads."
 *
 * A code review rejected both halves, and correctly. A double cast "bypasses the checkpoint's
 * no-unsafe-casts requirement" and lets the double "silently drift from the AWS event contract" - and
 * the credential-shaped-name argument does not survive contact with the platform type: every member of
 * `APIGatewayEventIdentity` that NAMES a credential is written below as `null`, which is a statement
 * that no credential is present rather than a credential-shaped value. The whole event is now
 * constructed, so a platform type that grows a required member breaks this file at compile time -
 * which is precisely the drift detection the cast suppressed.
 *
 * Every value is an invented, non-sensitive sentinel: a documentation-range source address
 * [RFC 5737], a zeroed account number in the ARN, and no host name a reader could mistake for real.
 */
function makeProxyEvent(facts: ProxyEventFacts = {}): APIGatewayProxyEvent {
  const httpMethod = facts.httpMethod ?? ROUTE_TABLE.priceResolution.methods;
  const path = facts.path ?? ROUTE_TABLE.priceResolution.path;

  return {
    body: facts.body === undefined ? null : facts.body,
    headers: { 'content-type': 'application/json' },
    multiValueHeaders: { 'content-type': ['application/json'] },
    httpMethod,
    isBase64Encoded: facts.isBase64Encoded ?? false,
    path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: path,
    requestContext: {
      accountId: 'fixture-account-id',
      apiId: 'fixture-api-id',
      // THE TRUST BOUNDARY. An omitted override is the ordinary authenticated
      // caller; an explicit `null` is the anonymous request.
      authorizer: facts.authorizer === undefined ? { accountID: ACCOUNT_ID } : facts.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod,
      // JUDGMENT CALL: every member of `identity` is REQUIRED by `@types/aws-lambda`'s
      // `APIGatewayEventIdentity` and none is optional, so the credential-NAMED members must appear
      // for this literal to type-check. All of them are `null` - the absence of a credential, stated -
      // and nothing in this file ever assigns one a value.
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '198.51.100.7',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path,
      stage: 'fixture',
      requestId: PLATFORM_REQUEST_ID,
      requestTimeEpoch: new Date(RESOLVED_AT).getTime(),
      resourceId: 'fixture-resource-id',
      resourcePath: path,
    },
  };
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
 * ★ WHY THE STREAM AND NOT THE LOGGER, FOR THE CASES BELOW SPECIFICALLY. `src/lib/logger.ts` publishes
 * an injectable sink through `withSink`, and `./errorMapper.js` accepts a logger on its context - and
 * since a code review added `createPriceResolutionHandler`, the subject ACCEPTS one too. Concern 7 uses
 * that seam and patches nothing at all.
 *
 * ★★ QUOTE-THEN-REVISE. This paragraph used to justify the stream capture with "the subject emits
 * through the MODULE-LEVEL logger, which is `Object.freeze`d precisely so its emitting surface cannot
 * be reshaped at run time", and that premise is now only half true: the module-level logger is still
 * the DEFAULT, and the cases in this section deliberately drive the exported `handler`, which takes it.
 * So the capture is retained for exactly those cases - where the production default is the point - and
 * the recording sink is installed where that logger's own sink writes: `writeLineToStdout` calls
 * `process.stdout.write`, one newline-terminated JSON object per entry.
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
  unusableRequestInput: INVALID_REQUEST_MESSAGE,
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
    const document = bodyOf({
      operation: 'convertCurrency',
      amount: '10.00',
      originalCurrencyCode: SECONDARY_CURRENCY_CODE,
      convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
    });

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

  it('★★ refuses a `__proto__` own key at the root and nested alike, naming ONLY that key (QA-I3)', async () => {
    // ★★ THE ONE UNRECOGNIZED KEY `z.strictObject` DOES NOT REFUSE. This endpoint is where QA testing
    // submitted it, and measured both halves: zod ACCEPTS an own `__proto__` and silently drops it at
    // every nesting level, while rejecting a `constructor` key in the same position - and
    // `Object.prototype` is left unmodified either way. The inconsistency is what is closed here, plus
    // defence in depth if a merge-style consumer is ever added downstream.
    //
    // ⚠ RAW JSON TEXT, NOT AN OBJECT LITERAL, and that is not a style choice. `{ __proto__: {} }`
    // invokes the prototype SETTER and creates no own property, so a literal fixture would contain
    // nothing to detect and this case would pass against a guard that did nothing. `JSON.parse` - which
    // is what the handler runs on the body API Gateway delivers - makes it an own data property.
    //
    // ★★★ THE NESTED CASE NO LONGER EXPECTS `sku.__proto__`, AND THAT REVISION IS THE POINT. It used
    // to, and a security review found (MAJOR, CWE-209/CWE-532) that the ancestor segment of such a path
    // is a member name THE CALLER CHOSE, reaching both this body and the log stream. The third fixture
    // below is the proof: its ancestor is named like a credential, and the refusal must not repeat it.
    const bodies: readonly string[] = [
      '{"operation":"calculateSkuPriceBasedOnPriceGroup","__proto__":{"p":1}}',
      '{"operation":"calculateSkuPriceBasedOnPriceGroup","sku":{"skuID":"s-1","__proto__":{"p":1}}}',
      `{"operation":"calculateSkuPriceBasedOnPriceGroup","${PLANTED_ANCESTOR_KEY}":{"__proto__":{"p":1}}}`,
    ];

    for (const body of bodies) {
      const response = await handler(makeProxyEvent({ body }), makeLambdaContext());
      const envelope = readErrorEnvelope(response);

      expect(response.statusCode).toBe(400);
      expect(envelope.category).toBe('invalidRequest');
      expect(envelope.message).toBe(INVALID_BODY_MESSAGES.unusableRequestInput);
      // ONE fixed issue, whatever the depth: the offending key, which is the only member name involved
      // that the caller did not choose. No ancestor, no value, no depth.
      expect(envelope.raw).toContain('"path":"__proto__"');
      expect(envelope.raw).not.toContain('sku.__proto__');
      expect(envelope.raw).not.toContain(PLANTED_ANCESTOR_KEY);
    }

    // The finding's own central observation, re-asserted rather than taken on trust.
    expect(Object.prototype).not.toHaveProperty('p');
  });

  it('★★★ persists NO caller-authored ancestor key on the log stream either (CWE-532)', async () => {
    // The body arm above proves the response says nothing; this proves the same of the diagnostic. The
    // refusal is logged by `errorMapper.invalidRequestResponse`, which used to copy every published
    // path into a `fieldPaths` member and therefore re-published the caller's key names on the stream.
    const capture = captureLogStream();

    const response = await handler(
      makeProxyEvent({
        body: `{"operation":"calculateSkuPriceBasedOnPriceGroup","${PLANTED_ANCESTOR_KEY}":{"__proto__":{"p":1}}}`,
      }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(400);
    expect(capture.text()).not.toContain(PLANTED_ANCESTOR_KEY);
    expect(capture.text()).not.toContain('fieldPaths');
    expect(capture.text()).toContain('invalidRequestReason');
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

  it('requires both members of the SKU IDENTITY, and refuses either one empty', async () => {
    // ★★★ THE MEMBERS CHANGED WITH FINDING F3: this used to require `{productName, skuCode}`, the
    // invented selector the subject SEARCHED for. It now requires `{productID, skuID}`, which the
    // subject LOADS. The requiredness rule is unchanged and so is the reason for it - a CFML
    // `required string` rejects a MISSING argument and accepts an EMPTY one, so presence is enforced
    // and emptiness is refused only because an identifier is a key rather than a search term.
    const bodies = [
      { operation: 'getRateForSkuBasedOnPriceGroup', priceGroupID: SENTINEL_PRICE_GROUP_ID },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: {},
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: { productID: SENTINEL_PRODUCT_ID },
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: { skuID: SENTINEL_SKU_ROW_ID },
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: { productID: '', skuID: SENTINEL_SKU_ROW_ID },
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: { productID: SENTINEL_PRODUCT_ID, skuID: '' },
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      // ★★ AND THE SECOND ENTITY ARGUMENT IS REQUIRED TOO, which is the half finding F3 added: the
      // operation is named `...BasedOnPriceGroup`, so a body that names no price group cannot be
      // served by choosing one.
      { operation: 'getRateForSkuBasedOnPriceGroup', sku: SENTINEL_SKU_IDENTITY },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: '',
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

  it('★★★ requires the exact entity argument EACH operation declares, and no other', async () => {
    // ★★★ THIS CASE IS FINDING F3'S ACCEPTANCE TEST AT THE SCHEMA. Each arm below names the argument
    // its ported signature does NOT declare, and each must be refused - which is what stops the
    // handler from being handed an argument it would then have to choose a meaning for.
    const wrongArgument = [
      // Takes a productTypeID; a SKU identity is not one.
      {
        operation: 'getRateForProductTypeBasedOnPriceGroup',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      // Takes a productID; a SKU identity is not one.
      {
        operation: 'getRateForProductBasedOnPriceGroup',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      // Takes a RATE, not a price group.
      {
        operation: 'calculateSkuPriceBasedOnPriceGroupRate',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      // Takes a price group, not a rate.
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupRateID: SENTINEL_PRICE_GROUP_RATE_ID,
      },
      // ★★ THE THREE ACCOUNT-SCOPED OPERATIONS TAKE NO PRICE GROUP, because selecting one is their
      // whole job. A body naming one is refused rather than honoured - honouring it would let a caller
      // pre-empt the very selection [model/service/PriceGroupService.cfc:L343-L362] performs.
      {
        operation: 'calculateSkuPriceBasedOnCurrentAccount',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
    ];

    for (const body of wrongArgument) {
      const response = await handler(
        makeProxyEvent({ body: JSON.stringify(body) }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('requires the explicit account argument on the two signatures that declare it', async () => {
    for (const body of [
      { operation: 'calculateSkuPriceBasedOnAccount', sku: SENTINEL_SKU_IDENTITY },
      { operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount', sku: SENTINEL_SKU_IDENTITY },
      {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: SENTINEL_SKU_IDENTITY,
        accountID: '',
      },
    ]) {
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
      { skuCode: 'A-CODE' },
      // ★ AND THE TWO MEMBERS OF THE REMOVED SELECTOR, which finding F3 replaced with identifiers. A
      // body still naming them is refused, so the name-search path cannot be reached by a caller that
      // remembers the old contract.
      { productName: 'A product' },
      { productNameKeyword: 'A product' },
    ];

    for (const extra of smuggled) {
      const response = await handler(
        makeProxyEvent({
          body: JSON.stringify({
            operation: 'calculateSkuPriceBasedOnCurrentAccount',
            sku: SENTINEL_SKU_IDENTITY,
            ...extra,
          }),
        }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    }
  });

  it('closes each arm against the others, so a member cannot cross operations', async () => {
    const crossArm = [
      // The three accessors take a currency code; the cascade entry points do not.
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: SENTINEL_SKU_IDENTITY,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
        currencyCode: SECONDARY_CURRENCY_CODE,
      },
      // Conversion takes an amount and two codes, and no SKU.
      {
        operation: 'convertCurrency',
        amount: '10.00',
        originalCurrencyCode: SECONDARY_CURRENCY_CODE,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
        sku: SENTINEL_SKU_IDENTITY,
      },
      // The product-type entry point takes a productTypeID; the product one takes a productID.
      {
        operation: 'getRateForProductTypeBasedOnPriceGroup',
        productID: SENTINEL_PRODUCT_ID,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
      {
        operation: 'getRateForProductBasedOnPriceGroup',
        productTypeID: SENTINEL_PRODUCT_TYPE_ID,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
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
      makeScope({ entityLoaders: world.entityLoaders, priceGroupService: priceGroups.service }),
      {
        operation: 'getPriceByCurrencyCode',
        sku: world.identity,
        currencyCode: SHORT_CURRENCY_CODE,
      },
    );

    // Answered, not refused - and the answer is an OMITTED price member, which is the whole point
    // (finding F4). Not a `{resolved:false}` sentinel, not a zero and not a null.
    expect(expectCurrencyPriceOutcome(result)).toBeUndefined();
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
      makeProxyEvent({
        httpMethod: 'GET',
        body: JSON.stringify({
          operation: 'calculateSkuPriceBasedOnCurrentAccount',
          sku: SENTINEL_SKU_IDENTITY,
        }),
      }),
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
// CONCERN 1b - AUTHENTICATED ADMISSION AND THE REQUEST-SIZE CEILING
// ===========================================================================

describe('authenticated admission and request-size bounds (concern 1b)', () => {
  const ORDINARY_REQUEST = bodyOf({
    operation: 'convertCurrency',
    amount: '10.00',
    originalCurrencyCode: SECONDARY_CURRENCY_CODE,
    convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
  });

  it('refuses a caller carrying no usable authorizer account', async () => {
    // `ORDINARY_REQUEST` names `convertCurrency`, one of the ELEVEN operations that retain the account
    // requirement, so every shape below is still refused. The one exempt operation is
    // `calculateSkuPriceBasedOnCurrentAccount`, and the case beneath this one drives exactly the same
    // authorizer shapes against it to prove the exemption is real rather than incidental.
    for (const authorizer of [
      null,
      {},
      { unrelated: 'value' },
      { accountID: '' },
      { accountID: '   ' },
      { accountID: 42 },
    ]) {
      const response = await handler(
        makeProxyEvent({ authorizer, body: ORDINARY_REQUEST }),
        makeLambdaContext(),
      );

      expect(response.statusCode).toBe(401);
      expect(readErrorEnvelope(response).category).toBe('unauthenticated');
      expect(readErrorEnvelope(response).raw).not.toContain('accountID');
    }
  });

  it('★★★ does NOT refuse the current-account operation for an unidentified caller', async () => {
    // ★★★ THE LOGGED-OUT ARM IS REACHABLE AGAIN, AND THIS IS THE ADMISSION HALF OF THE PROOF.
    // `calculateSkuPriceBasedOnCurrentAccount` OWNS the signed-in test
    // [model/service/PriceGroupService.cfc:L262-L266] and answers `sku.getPrice()` when nobody is
    // signed in, so a route that refuses every unidentified caller makes that arm dead code. The same
    // six authorizer shapes the case above refuses are admitted here.
    //
    // WHAT THIS CASE CAN AND CANNOT SEE. `handler` is the PRODUCTION entrypoint, so it reaches the
    // production composition root, which refuses to configure without the `DB_*` contract and lands on
    // the generic 500 - deliberately, because this suite reads no environment and opens no pool. The
    // admission is upstream of that, so "not 401" is exactly the fact this case owns: the request got
    // PAST the account requirement. The value the arm answers is asserted end to end through the
    // injected seam, in 'serves the LOGGED-OUT current-account arm ...' further down this file.
    for (const authorizer of [
      null,
      {},
      { unrelated: 'value' },
      { accountID: '' },
      { accountID: '   ' },
      { accountID: 42 },
    ]) {
      const response = await handler(
        makeProxyEvent({
          authorizer,
          body: bodyOf({
            operation: 'calculateSkuPriceBasedOnCurrentAccount',
            sku: { productID: 'prod-anonymous-0001', skuID: 'sku-anonymous-0001' },
          }),
        }),
        makeLambdaContext(),
      );

      expect(response.statusCode).not.toBe(401);
    }
  });

  it('resolves the route first, then decodes, then applies the account requirement', async () => {
    // ★★★ THIS CASE WAS 'runs admission before body parsing' AND THE ORDER IT PINNED IS THE DEFECT.
    // A route-wide refusal ahead of the decode is why the `else` arm of
    // `calculateSkuPriceBasedOnCurrentAccount` [model/service/PriceGroupService.cfc:L265-L266] could
    // never be reached through this route: the requirement has to know WHICH operation was asked for,
    // and that lives in the body. The decode therefore precedes the requirement, and the requirement
    // is per operation - see `ANONYMOUS_PERMITTED_OPERATIONS` in the subject.
    //
    // What did NOT change is the order of the other two steps: the route still resolves first, so a
    // path this capability does not own is a 404 rather than a revealing 401 or 400.
    const unparsable = await handler(
      makeProxyEvent({ authorizer: null, body: '{ not json' }),
      makeLambdaContext(),
    );
    const unmatched = await handler(
      makeProxyEvent({ authorizer: null, path: '/prices' }),
      makeLambdaContext(),
    );
    const identifiedRequirement = await handler(
      makeProxyEvent({ authorizer: null, body: ORDINARY_REQUEST }),
      makeLambdaContext(),
    );

    // A body that cannot be decoded is reported as such: the operation is unknowable, so the
    // per-operation requirement has nothing to apply. Nothing about the refusal names a claim.
    expect(unparsable.statusCode).toBe(400);
    expect(readErrorEnvelope(unparsable).category).toBe('invalidRequest');
    expect(readErrorEnvelope(unparsable).raw).not.toContain('accountID');
    expect(readErrorEnvelope(unparsable).raw).not.toContain('authoriz');

    expect(unmatched.statusCode).toBe(404);

    // And a DECODABLE request naming an operation that requires an account is still refused with 401,
    // before any composition root, scope or connection exists.
    expect(identifiedRequirement.statusCode).toBe(401);
    expect(readErrorEnvelope(identifiedRequirement).category).toBe('unauthenticated');
  });

  it('refuses decoded and base64 request documents above 8 KiB without echoing them', async () => {
    const planted = PLANTED_INTERNAL_DETAIL.repeat(600);
    const oversized = JSON.stringify({ operation: 'convertCurrency', padding: planted });

    const plain = await handler(makeProxyEvent({ body: oversized }), makeLambdaContext());
    const encoded = await handler(
      makeProxyEvent({
        body: Buffer.from(oversized, 'utf8').toString('base64'),
        isBase64Encoded: true,
      }),
      makeLambdaContext(),
    );

    for (const response of [plain, encoded]) {
      expect(response.statusCode).toBe(400);
      expect(readErrorEnvelope(response).message).toBe(INVALID_BODY_MESSAGES.unusableRequestInput);
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
    }
  });

  it('counts UTF-8 bytes rather than characters', async () => {
    const response = await handler(
      makeProxyEvent({
        body: JSON.stringify({ operation: 'convertCurrency', padding: '\u4e2d'.repeat(3000) }),
      }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(400);
    expect(readErrorEnvelope(response).message).toBe(INVALID_BODY_MESSAGES.unusableRequestInput);
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

  /** The price group the loaders hold, and therefore the one a request may name. */
  readonly priceGroup: ResolvedPriceGroup;

  /** The rate the loaders hold, and therefore the one a request may name. */
  readonly priceGroupRate: ResolvedPriceGroupRate;

  /** What was asked of the five loaders while the case ran. */
  readonly entityLoaders: EntityLoadersDouble;
}

/**
 * Build a doubled world whose loaders hold the SKU, its product, its product type, one price group and
 * one rate.
 *
 * ★★★ THE PRICE GROUP IS LOADED BY IDENTIFIER NOW, AND THAT IS FINDING F3. The previous revision
 * seeded this builder with `bestPriceGroup: graph.childPriceGroup` and explained that
 * `getBestPriceGroupDetailsBasedOnSkuAndAccount` [model/service/PriceGroupService.cfc:L343-L362] "is
 * the only member of the request-tier surface that hands one back, there being no published
 * load-by-identifier for one". That was true and is no longer: `RequestScope.entityLoaders` publishes
 * `getPriceGroup`, so the five operations named `...BasedOnPriceGroup` take the price group they
 * declare instead of having the account's BEST group substituted for it.
 *
 * `bestPriceGroup` is still seeded, because `getBestPriceGroupDetailsBasedOnSkuAndAccount` is a
 * published operation in its own right and IS the member whose job is to select one - it is simply no
 * longer used as a resolution helper for its eight siblings.
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

  const priceGroup = graph.childPriceGroup;
  const priceGroupRate = graph.rootGlobalRate;
  const entityLoaders = makeEntityLoadersDouble({
    product: world.product,
    productType: world.productType,
    sku: world.sku,
    priceGroup,
    priceGroupRate,
  });

  return {
    // The world's own ledger IS the composed one, so a case may reach either name and observe the
    // loaders the scope actually holds - there is no second, silently unread ledger to assert against.
    world: { ...world, entityLoaders },
    graph,
    priceGroups,
    priceGroup,
    priceGroupRate,
    entityLoaders,
    scope: makeScope({
      entityLoaders,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    }),
  };
}

describe('delegation: one already-ported member per operation (concern 2)', () => {
  it('★★★ BINDS both declared arguments by identifier, and searches for NEITHER', async () => {
    // ★★★ THIS CASE IS THE HEART OF FINDING F3, AND IT USED TO ASSERT THE OPPOSITE. It was titled
    // "resolves the selector through the two published catalog reads and nothing else" and pinned a
    // `productName LIKE ?` scan followed by a read of ALL of the matched product's SKUs - then
    // asserted that the price group arrived from `getBestPriceGroupDetailsBasedOnSkuAndAccount`,
    // which it described as "the one published affordance". Every one of those assertions described
    // the defect.
    //
    // What is pinned now: exactly TWO loads, both by primary key, and exactly ONE service call - the
    // cascade entry point itself. No search, and no second cascade run to manufacture an argument.
    const { world, scope, priceGroups, priceGroup } = makeDoubledCascade();

    await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: priceGroup.getPriceGroupID(),
    });

    expect(world.entityLoaders.loads).toStrictEqual([
      {
        loader: 'getSkuBySkuIdentity',
        identifier: `${world.identity.productID}/${world.identity.skuID}`,
      },
      { loader: 'getPriceGroup', identifier: priceGroup.getPriceGroupID() },
    ]);

    // ★★ ONE SERVICE CALL, AND IT IS THE OPERATION THE CALLER ASKED FOR. The previous revision
    // recorded TWO - `getBestPriceGroupDetailsBasedOnSkuAndAccount` first, to obtain a price group,
    // then the cascade entry point. That first call was an unrequested selection AND an extra cascade
    // run charged to a caller who had already named the group it wanted.
    expect(priceGroups.calls.map((call) => call.member)).toStrictEqual([
      'getRateForSkuBasedOnPriceGroup',
    ]);

    // The two arguments handed over are the loaded entities themselves, by identity.
    expect(priceGroups.calls[0]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[0]?.args[1]).toBe(priceGroup);
  });

  it("★★★ answers about the price group the caller NAMED, never the account's best one", async () => {
    // ★★★ THE SHARPEST HALF OF FINDING F3, ASSERTED DIRECTLY. Under the previous revision the group
    // handed to `getRateForSkuBasedOnPriceGroup` came from the best-price-group report, so a caller
    // naming group A could be answered about group B - plausibly, and with no way to tell. Here the
    // loaders hold the group the caller names while the service double's best-group answer is a
    // DIFFERENT group, and the assertion is that the named one is what arrives.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({ skuLevelRateSkus: [world.sku] });
    const named = graph.childPriceGroup;
    const accountsBest = graph.siblingPriceGroup;

    expect(named.getPriceGroupID()).not.toBe(accountsBest.getPriceGroupID());

    const priceGroups = makePriceGroupServiceDouble({ bestPriceGroup: accountsBest });
    const entityLoaders = makeEntityLoadersDouble({
      product: world.product,
      productType: world.productType,
      sku: world.sku,
      priceGroup: named,
    });

    await dispatchPriceResolution(
      makeScope({ entityLoaders, priceGroupService: priceGroups.service, accountID: ACCOUNT_ID }),
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: named.getPriceGroupID(),
      },
    );

    expect(priceGroups.calls[0]?.args[1]).toBe(named);
    // And the best-group report was never consulted at all.
    expect(priceGroups.calls.map((call) => call.member)).not.toContain(
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
    );
  });

  it('hands the product type belonging to the resolved SKU to the product-type entry point', async () => {
    const { world, graph, scope, priceGroups, priceGroup } = makeDoubledCascade();

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductTypeBasedOnPriceGroup',
      productTypeID: world.productType.getProductTypeID(),
      priceGroupID: priceGroup.getPriceGroupID(),
    });

    // INDEX ZERO, because there is no longer a best-price-group call ahead of it (finding F3).
    const call = priceGroups.calls[0];

    expect(priceGroups.calls).toHaveLength(1);
    expect(call?.member).toBe('getRateForProductTypeBasedOnPriceGroup');
    // The product type handed over is the one the LOADER answered for the identifier the request named -
    // identity, not an equal-looking second instance. CFML parity
    // [model/service/PriceGroupService.cfc:L57]: the parameter is declared `required any productType`,
    // and [L159] is the SKU cascade's own way of reaching one, not this operation's.
    expect(call?.args[0]).toBe(world.productType);
    expect(call?.args[1]).toBe(graph.childPriceGroup);
    expect(expectRateOutcome(result).resolved).toBe(false);
  });

  it('hands the resolved product to the product entry point', async () => {
    const { world, graph, scope, priceGroups, priceGroup } = makeDoubledCascade({
      rateForProduct: makePriceGroupFixtures().productLevelRate,
    });

    await dispatchPriceResolution(scope, {
      operation: 'getRateForProductBasedOnPriceGroup',
      productID: world.product.getProductID(),
      priceGroupID: priceGroup.getPriceGroupID(),
    });

    expect(priceGroups.calls).toHaveLength(1);
    expect(priceGroups.calls[0]?.member).toBe('getRateForProductBasedOnPriceGroup');
    expect(priceGroups.calls[0]?.args[0]).toBe(world.product);
    expect(priceGroups.calls[0]?.args[1]).toBe(graph.childPriceGroup);
  });

  it('hands the resolved SKU to the SKU entry point and to the price calculation', async () => {
    const { world, graph, scope, priceGroups, priceGroup } = makeDoubledCascade();

    await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: priceGroup.getPriceGroupID(),
    });

    expect(priceGroups.calls).toHaveLength(1);
    expect(priceGroups.calls[0]?.member).toBe('calculateSkuPriceBasedOnPriceGroup');
    expect(priceGroups.calls[0]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[0]?.args[1]).toBe(graph.childPriceGroup);
  });

  it('★★★ prices the rate the caller NAMED, running no cascade to invent one', async () => {
    // ★★★ THIS CASE WAS TITLED "obtains the rate through the SKU cascade before calculating a price from
    // it", AND THAT TITLE WAS THE DEFECT (finding F3). It asserted THREE service calls in sequence -
    // `getBestPriceGroupDetailsBasedOnSkuAndAccount` to obtain a price group, `getRateForSkuBasedOnPriceGroup`
    // to run the five-level cascade over it, and only then `calculateSkuPriceBasedOnPriceGroupRate` - and
    // explained that "the cascade is how one is obtained at all". It was not: the ported signature
    // [model/service/PriceGroupService.cfc:L316] declares `required any priceGroupRate`, so the rate is the
    // caller's to name, and manufacturing it meant an operation declared over ONE rate answered about
    // whichever rate a second cascade run happened to select - at the caller's expense, and with no way for
    // the caller to tell.
    //
    // ONE CALL now, and its second argument is the rate the loader answered for the identifier the request
    // named.
    const { world, scope, priceGroups, priceGroupRate } = makeDoubledCascade({
      priceForRate: Money.fromDecimalString('9.99'),
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroupRate',
      sku: world.identity,
      priceGroupRateID: priceGroupRate.getPriceGroupRateID(),
    });

    expect(priceGroups.calls.map((call) => call.member)).toStrictEqual([
      'calculateSkuPriceBasedOnPriceGroupRate',
    ]);
    expect(priceGroups.calls[0]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[0]?.args[1]).toBe(priceGroupRate);
    expect(expectPriceOutcome(result)).toBe('9.99');
  });

  it('★★★ reports the missing RATE, where it used to report a cascade that found none', async () => {
    // ★★★ THE SIBLING INVERSION. The previous revision's companion case was titled "reports no rate rather
    // than pricing one when the cascade selected nothing" and expected `noRateApplies` - a token that
    // describes the CASCADE's outcome, reported by an operation that never should have run one. With the
    // rate named by identifier there is exactly one way for it to be absent, and the report says so:
    // `priceGroupRateNotFound`.
    //
    // `noRateApplies` still exists and is still correct - for the three `getRateFor*` operations, whose
    // legacy bodies genuinely fall off the end when no rate matches [L96-L98], [L135-L137], [L178-L180].
    const { world, scope, priceGroups } = makeDoubledCascade();

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroupRate',
      sku: world.identity,
      priceGroupRateID: SENTINEL_PRICE_GROUP_RATE_ID,
    });

    expect(expectUnresolvedOutcome(result)).toBe<UnresolvedReason>('priceGroupRateNotFound');
    expect(expectUnresolvedOutcome(result)).not.toBe<UnresolvedReason>('noRateApplies');
    expect(priceGroups.calls).toStrictEqual([]);
  });

  it('★★★ names WHICH identifier missed, and calls no service member when one did', async () => {
    // ★★★ THIS CASE REPLACED TWO, AND BOTH OF THEM DESCRIBED FINDING F3.
    //
    // The first was titled "reports the absent product type rather than fabricating the argument". It
    // reached the absent state by making the RESOLVED PRODUCT answer nothing for `getProductType()` -
    // which was only reachable because the product-type entry point derived its argument by chaining
    // `sku.getProduct().getProductType()` off a SKU the subject had found by searching product names.
    // The operation now takes a `productTypeID` and loads it, so there is no derivation left to fail
    // and `productTypeAbsent` is gone with it.
    //
    // The second was titled "reports the best-price-group absence without ever pricing a group it did
    // not resolve", and it drove FIVE operations - including the three that name a `priceGroupID` -
    // asserting each answered `noPriceGroupResolvedForSkuAndAccount`. That assertion was the defect
    // stated as a requirement: those five reached the best-group report to MANUFACTURE the price group
    // they were asked about, so of course they failed when it named none. They now bind the group the
    // caller named, and that report is reachable from exactly one operation - its own.
    //
    // What is pinned instead: each of the five identifiers a request may name reports its OWN miss, and
    // a miss reaches no service member at all.
    const world = makeSkuWorld();

    for (const probe of [
      {
        request: {
          operation: 'getRateForProductTypeBasedOnPriceGroup',
          productTypeID: SENTINEL_PRODUCT_TYPE_ID,
          priceGroupID: SENTINEL_PRICE_GROUP_ID,
        },
        reason: 'productTypeNotFound',
      },
      {
        request: {
          operation: 'getRateForProductBasedOnPriceGroup',
          productID: SENTINEL_PRODUCT_ID,
          priceGroupID: SENTINEL_PRICE_GROUP_ID,
        },
        reason: 'productNotFound',
      },
      {
        request: {
          operation: 'getRateForSkuBasedOnPriceGroup',
          sku: SENTINEL_SKU_IDENTITY,
          priceGroupID: SENTINEL_PRICE_GROUP_ID,
        },
        reason: 'skuNotFound',
      },
      {
        request: {
          operation: 'getRateForSkuBasedOnPriceGroup',
          sku: world.identity,
          priceGroupID: SENTINEL_PRICE_GROUP_ID,
        },
        reason: 'priceGroupNotFound',
      },
      {
        request: {
          operation: 'calculateSkuPriceBasedOnPriceGroupRate',
          sku: world.identity,
          priceGroupRateID: SENTINEL_PRICE_GROUP_RATE_ID,
        },
        reason: 'priceGroupRateNotFound',
      },
    ] as const) {
      const priceGroups = makePriceGroupServiceDouble();
      const result = await dispatchPriceResolution(
        makeScope({
          entityLoaders: world.entityLoaders,
          priceGroupService: priceGroups.service,
          accountID: ACCOUNT_ID,
        }),
        probe.request,
      );

      expect(expectUnresolvedOutcome(result)).toBe<UnresolvedReason>(probe.reason);
      expect(priceGroups.calls).toStrictEqual([]);
    }
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
    });

    const account = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
    });
    const currentAccount = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnCurrentAccount',
      sku: world.identity,
    });
    const best = await dispatchPriceResolution(scope, {
      operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
    });

    expect(expectPriceOutcome(account)).toBe('12.34');
    expect(expectPriceOutcome(currentAccount)).toBe('13.45');
    expect(best.outcome).toBe('bestPriceGroupDetails');

    // ★★★ THE FOURTH PROBE WAS `getPriceGroupDataJSON`, AND IT IS WITHDRAWN (finding F10). The
    // contract's fourth asynchronous member is still a member of the SERVICE - `./bootstrap.js` still
    // composes it and `../../services/priceGroupService.ts` still answers it - it is simply no longer
    // reachable through this HTTP surface, so this suite can no longer drive it. The three above are
    // the three asynchronous members this entrypoint reaches, which is what the assertion now says.
  });

  it('★★★ refuses the whole-document operation at the schema, and does not expose the member', async () => {
    // ★★★ THIS CASE REPLACED TWO, AND BOTH ASSERTED A ROUTE THAT SHOULD NOT HAVE EXISTED (finding
    // F10). One was titled "carries the price-group document through as the string the service
    // returned" and one "takes no argument for the price-group document, because the ported member
    // takes none". Both were accurate about the PORT and wrong about the SURFACE: the legacy member
    // [model/service/PriceGroupService.cfc:L230-L260] walks EVERY price group and EVERY rate of each
    // into one string with no filter, no window and no cursor, so a single unauthenticated call
    // returns the entire pricing configuration and grows without bound as a catalogue grows.
    //
    // Nothing about the member changed - including its two carried-forward defects, which
    // `../../../src/handlers/priceResolutionHandler.ts` records at the withdrawal site so they travel
    // with the reason. What changed is that no request can name it here.
    const response = await handler(
      makeProxyEvent({ body: JSON.stringify({ operation: 'getPriceGroupDataJSON' }) }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(400);
    expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    // Refused BEFORE the composition root, so an unpaged whole-catalogue read is unreachable rather
    // than merely undocumented.
    expect(readErrorEnvelope(response).raw).not.toContain('priceGroupDataJSON');

    // And the member is withheld from the scope contract itself, so naming it would not compile.
    expect(WITHHELD_PRICE_GROUP_MEMBERS).toContain('getPriceGroupDataJSON');
    expect(EXPOSED_PRICE_GROUP_MEMBERS).not.toContain('getPriceGroupDataJSON');
  });

  it('reads no catalog and no price-group member for a conversion', async () => {
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const converter = makeCurrencyConverterDouble();
    const scope = makeScope({
      entityLoaders: world.entityLoaders,
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

    // No entity is loaded and no price-group member is called: a conversion names an amount and two
    // codes, so there is nothing to load and nothing to cascade.
    expect(world.entityLoaders.loads).toStrictEqual([]);
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
      entityLoaders: world.entityLoaders,
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

  it('★★★ names each identifier VERBATIM, folding no case and trimming nothing', async () => {
    // ★★★ THIS CASE REPLACED FIVE, AND ALL FIVE PINNED THE SEARCH FINDING F3 REMOVED. They were
    // titled:
    //
    //   * "refuses rather than choosing when a selector names more than one candidate"
    //   * "accepts the same product or SKU arriving twice, because a repeated row is not an ambiguity"
    //   * "refuses when the selector matches nothing, naming no product and no code"
    //   * "folds case when matching a product name and a SKU code, as CFML comparison does"
    //   * "skips a product that answers no name instead of comparing against nothing"
    //
    // Every one of them was a correct test of the WRONG THING. A boundary that resolves a
    // `{productName, skuCode}` selector by scanning product names needs an ambiguity rule, a
    // distinctness rule, a no-match refusal, a case-folding rule and an unnamed-candidate skip - five
    // pieces of selection logic, all of it invented, none of it in `model/service/PriceGroupService.cfc`
    // or `model/entity/Sku.cfc`, and all of it deciding WHICH SKU GETS PRICED behind a caller's back.
    // With the request naming identifiers, none of those five questions exists: an identifier names one
    // row or none, "several" is unrepresentable, and there is nothing to compare and therefore no case
    // to fold.
    //
    // What is pinned in their place is the only obligation this boundary still has for an identifier:
    // hand it to the loader exactly as it arrived. No trim, no case fold, no normalisation - because a
    // boundary that "helpfully" adjusted an identifier would be choosing a row again, quietly.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const untouched = '  Mixed-Case ID  ';

    await dispatchPriceResolution(
      makeScope({
        entityLoaders: world.entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      }),
      {
        operation: 'getRateForProductTypeBasedOnPriceGroup',
        productTypeID: untouched,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
    );

    expect(world.entityLoaders.loads).toStrictEqual([
      { loader: 'getProductTypeByProductTypeID', identifier: untouched },
    ]);
  });

  it('★★★ answers a miss as a domain outcome rather than raising a refusal', async () => {
    // ★★★ THE POSTURE CHANGE FINDING F3 CARRIED WITH IT. Three of the five deleted cases above
    // asserted `rejects.toThrow('the request named no single resolvable sku')` - a module-local
    // `UnresolvableSkuSelectorError` that became a client-shaped 400. That error existed because a NAME
    // matching nothing, or matching several things, genuinely is a bad request. An IDENTIFIER matching
    // nothing is not: it is the same "no row for that key" the loaders document and the same posture
    // `Sku.getPriceByCurrencyCode` takes for an unknown currency [model/entity/Sku.cfc:L269-L273].
    //
    // So the class is gone and nothing here raises. The proof is that the promise RESOLVES.
    const world = makeSkuWorld();
    const result = await dispatchPriceResolution(
      makeScope({
        entityLoaders: makeEntityLoadersDouble({}),
        priceGroupService: makePriceGroupServiceDouble().service,
        accountID: ACCOUNT_ID,
      }),
      { operation: 'calculateSkuPriceBasedOnAccount', sku: world.identity, accountID: ACCOUNT_ID },
    );

    expect(expectUnresolvedOutcome(result)).toBe<UnresolvedReason>('skuNotFound');
    expect(JSON.stringify(result)).not.toContain('resolvable');
  });

  it('★★★ requires BOTH halves of the SKU identity to name the same row', async () => {
    // The SKU identity is a PAIR - `{productID, skuID}` - because `RequestEntityLoaders` publishes the
    // SKU through its product, which is what puts the SKU'S OWN product on the instance and makes
    // [model/service/PriceGroupService.cfc:L154]'s `arguments.sku.getProduct()` coherent. A pair that
    // names a real product and a foreign SKU, or the reverse, therefore names no row.
    const mine = makeSkuWorld({ idPrefix: 'minesku' });
    const theirs = makeSkuWorld({ idPrefix: 'theirssku' });

    for (const identity of [
      { productID: mine.identity.productID, skuID: theirs.identity.skuID },
      { productID: theirs.identity.productID, skuID: mine.identity.skuID },
    ]) {
      const priceGroups = makePriceGroupServiceDouble();
      const result = await dispatchPriceResolution(
        makeScope({
          entityLoaders: mine.entityLoaders,
          priceGroupService: priceGroups.service,
          accountID: ACCOUNT_ID,
        }),
        { operation: 'calculateSkuPriceBasedOnAccount', sku: identity, accountID: ACCOUNT_ID },
      );

      expect(expectUnresolvedOutcome(result)).toBe<UnresolvedReason>('skuNotFound');
      expect(priceGroups.calls).toStrictEqual([]);
    }
  });
});

/**
 * Every identifier a request arm can name, gathered from one doubled world.
 *
 * ★★★ THIS TYPE IS THE SHAPE OF FINDING F3'S FIX. The previous revision's `requestFor` took ONE
 * argument - a `{productName, skuCode}` selector - and handed it to twelve of the thirteen arms, which
 * is exactly why the subject had to derive a product type, a product, a price group and a rate from it.
 * Each arm now names the identifiers ITS ported signature declares, so driving all twelve uniformly
 * takes five identifiers rather than one.
 */
interface OperationBindings {
  readonly sku: PriceResolutionSkuIdentity;
  readonly productID: string;
  readonly productTypeID: string;
  readonly priceGroupID: string;
  readonly priceGroupRateID: string;
  readonly accountID: string;
}

/** Read every identifier off one doubled world, so no case writes an identifier as a literal. */
function bindingsFor(cascade: DoubledCascade): OperationBindings {
  return {
    sku: cascade.world.identity,
    productID: cascade.world.product.getProductID(),
    productTypeID: cascade.world.productType.getProductTypeID(),
    priceGroupID: cascade.priceGroup.getPriceGroupID(),
    priceGroupRateID: cascade.priceGroupRate.getPriceGroupRateID(),
    accountID: ACCOUNT_ID,
  };
}

/** Build the request one operation takes, so every published operation can be driven uniformly. */
function requestFor(
  operation: PriceResolutionOperation,
  bindings: OperationBindings,
): PriceResolutionRequest {
  switch (operation) {
    case 'getPriceByCurrencyCode':
      return { operation, sku: bindings.sku, currencyCode: SECONDARY_CURRENCY_CODE };
    case 'getListPriceByCurrencyCode':
      return { operation, sku: bindings.sku, currencyCode: SECONDARY_CURRENCY_CODE };
    case 'getRenewalPriceByCurrencyCode':
      return { operation, sku: bindings.sku, currencyCode: SECONDARY_CURRENCY_CODE };
    case 'convertCurrency':
      return {
        operation,
        amount: '19.99',
        originalCurrencyCode: SECONDARY_CURRENCY_CODE,
        convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
      };
    case 'getRateForProductTypeBasedOnPriceGroup':
      return {
        operation,
        productTypeID: bindings.productTypeID,
        priceGroupID: bindings.priceGroupID,
      };
    case 'getRateForProductBasedOnPriceGroup':
      return { operation, productID: bindings.productID, priceGroupID: bindings.priceGroupID };
    case 'getRateForSkuBasedOnPriceGroup':
      return { operation, sku: bindings.sku, priceGroupID: bindings.priceGroupID };
    case 'calculateSkuPriceBasedOnPriceGroup':
      return { operation, sku: bindings.sku, priceGroupID: bindings.priceGroupID };
    case 'calculateSkuPriceBasedOnPriceGroupRate':
      return { operation, sku: bindings.sku, priceGroupRateID: bindings.priceGroupRateID };
    case 'calculateSkuPriceBasedOnCurrentAccount':
      return { operation, sku: bindings.sku };
    case 'calculateSkuPriceBasedOnAccount':
      return { operation, sku: bindings.sku, accountID: bindings.accountID };
    case 'getBestPriceGroupDetailsBasedOnSkuAndAccount':
      return { operation, sku: bindings.sku, accountID: bindings.accountID };
  }
}

describe('the surface this entrypoint exposes, and the members it withholds', () => {
  it('publishes twelve operations, every one named for its legacy method', () => {
    // B4 interface parity is the acceptance contract, so a reviewer can diff this list against
    // `model/service/PriceGroupService.cfc`, `model/entity/Sku.cfc` and
    // `model/service/CurrencyService.cfc` directly. Nothing is renamed, abbreviated, pluralised or
    // made "more idiomatic", and the mid-name capitalisation of every legacy name survives.
    //
    // ★★★ THIRTEEN BECAME TWELVE, AND THE ONE THAT LEFT IS FINDING F10. `getPriceGroupDataJSON` walks
    // EVERY price group and EVERY rate of each into one string [model/service/PriceGroupService.cfc:L230-L260]
    // with no filter, no window and no cursor. Interface parity is about the SERVICE surface, which is
    // unchanged - the member is still composed and still answered; what parity never required is that
    // every ported member be reachable over HTTP, and an unpaged whole-configuration read is the one
    // that must not be.
    expect(ALL_OPERATIONS).toHaveLength(12);
    expect(new Set(ALL_OPERATIONS).size).toBe(12);
  });

  it('dispatches every published operation to a real outcome', async () => {
    for (const operation of ALL_OPERATIONS) {
      const cascade = makeDoubledCascade();

      const result = await dispatchPriceResolution(
        cascade.scope,
        requestFor(operation, bindingsFor(cascade)),
      );

      // Every arm of the dispatcher answers; none falls through, and none of the absence reasons is an
      // error or carries a status other than the successful one. Each arm is driven with the exact
      // identifiers ITS ported signature declares, all five of them held by the loaders - so no arm
      // reaches this assertion by way of a miss.
      expect(result.outcome).toBeDefined();
      if (result.outcome === 'unresolved') {
        expect(result.reason).not.toBe<UnresolvedReason>('productTypeNotFound');
        expect(result.reason).not.toBe<UnresolvedReason>('productNotFound');
        expect(result.reason).not.toBe<UnresolvedReason>('skuNotFound');
        expect(result.reason).not.toBe<UnresolvedReason>('priceGroupNotFound');
        expect(result.reason).not.toBe<UnresolvedReason>('priceGroupRateNotFound');
      }
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
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L461-L470]: `deletePriceGroup` loops on a
    // collection captured at [:L463] and always removes index one.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The AAP's defect register carries that shape as a potential non-termination concern rather than an
    // established source failure: the captured array is the SAME array `removeChildPriceGroup` ->
    // `removeParentPriceGroup` -> `arrayDeleteAt` [model/entity/PriceGroup.cfc:L116-L123, L139-L140]
    // mutates, so in the source the length does shrink. The services tier reproduces the loop WITH a
    // bounded-iteration safeguard, pinned by `tests/unit/services/priceGroupService.test.ts`;
    // withholding the member here neither repairs it, hides it nor removes that guard.
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
      entityLoaders: makeSkuWorld().entityLoaders,
      priceGroupService: makePriceGroupServiceDouble().service,
      accountID: ACCOUNT_ID,
    });
    const signedOut = makeScope({
      entityLoaders: makeSkuWorld().entityLoaders,
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
    //
    // ★★★ THIS CASE IS NECESSARY AND WAS NOT SUFFICIENT, AND THE DISTINCTION IS A REVIEW FINDING. It
    // drives `dispatchPriceResolution` DIRECTLY, so it proves the dispatcher hands an empty context
    // over - and for a while that was the only proof of the logged-out arm anywhere, while the routed
    // entrypoint refused every unidentified caller before a dispatch could occur. The arm was
    // simultaneously correct and unreachable. The ROUTED proof now lives at
    // '★★★ serves the LOGGED-OUT current-account arm through the REAL service and composition' in the
    // entrypoint section, and the two are complementary rather than duplicative: this one pins the
    // hand-over, that one pins the admission and the value.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble();
    const scope = makeScope({
      entityLoaders: world.entityLoaders,
      priceGroupService: priceGroups.service,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnCurrentAccount',
      sku: world.identity,
    });

    expect(priceGroups.calls[0]?.member).toBe('calculateSkuPriceBasedOnCurrentAccount');
    expect(priceGroups.calls[0]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[0]?.args[1]).toBe(scope.currentAccountContext);
    // The legacy else arm answers the SKU's own price - not zero, and not an absence.
    expect(expectPriceOutcome(result)).toBe(world.sku.getPrice().toDecimalString());
  });

  it('★★★ reports the missing account for the TWO members the legacy declares it required for', async () => {
    // ★★★ THIS LIST WAS SEVEN AND IS NOW TWO, AND THE FIVE THAT LEFT ARE FINDING F3. [L271] and [L343]
    // declare the account REQUIRED, and they are the only two that do; the five named
    // `...BasedOnPriceGroup` and `...BasedOnPriceGroupRate` take a price group or a rate and never
    // mention an account. They appeared here only because the previous revision resolved their price
    // group through `getBestPriceGroupDetailsBasedOnSkuAndAccount`, which made an account MANDATORY for
    // five operations whose ported signatures do not take one - so an unauthenticated caller naming a
    // price group explicitly was refused a rate the service would have answered.
    //
    // The five are now driven WITHOUT an account by the sibling case below, which is the positive half
    // of the same property.
    const requiring: readonly PriceResolutionOperation[] = [
      'calculateSkuPriceBasedOnAccount',
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
    ];

    for (const operation of requiring) {
      const cascade = makeDoubledCascade();
      const scope = makeScope({
        entityLoaders: cascade.entityLoaders,
        priceGroupService: cascade.priceGroups.service,
      });

      const result = await dispatchPriceResolution(
        scope,
        requestFor(operation, bindingsFor(cascade)),
      );

      expect(expectUnresolvedOutcome(result)).toBe('noAuthenticatedAccount');
      // The account is tested BEFORE anything is loaded, so no read is issued on behalf of a request
      // that could not have run anyway.
      expect(cascade.entityLoaders.loads).toStrictEqual([]);
      expect(cascade.priceGroups.calls).toStrictEqual([]);
    }
  });

  it('★★★ answers the five group-scoped operations with NO account established', async () => {
    // ★★★ THE POSITIVE HALF OF FINDING F3'S ACCOUNT PROPERTY. Under the previous revision every one of
    // these five answered `noAuthenticatedAccount` without an account, because each obtained its price
    // group from the account's best-group report. Each now binds the group or rate the caller named, so
    // each answers - and none of them consults the report at all.
    for (const operation of [
      'getRateForProductTypeBasedOnPriceGroup',
      'getRateForProductBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
    ] as const) {
      const cascade = makeDoubledCascade({
        rateForSku: makePriceGroupFixtures().skuLevelRateFirstMatch,
      });
      const scope = makeScope({
        entityLoaders: cascade.entityLoaders,
        priceGroupService: cascade.priceGroups.service,
      });

      const result = await dispatchPriceResolution(
        scope,
        requestFor(operation, bindingsFor(cascade)),
      );

      expect(result.outcome).not.toBe('unresolved');
      expect(cascade.priceGroups.calls.map((call) => call.member)).not.toContain(
        'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      );
    }
  });

  it('passes the scope account identifier to the account-scoped members, verbatim', async () => {
    const { world, scope, priceGroups } = makeDoubledCascade();

    await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
    });
    await dispatchPriceResolution(scope, {
      operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
    });

    for (const call of priceGroups.calls) {
      expect(call.args[1]).toBe(ACCOUNT_ID);
    }
  });

  it('admits a case-only account variant and forwards the server-established spelling', async () => {
    // CFML string comparison folds case. The payload may therefore spell the same opaque account
    // identifier differently, but the trusted authorizer spelling is the one a keyed read receives.
    const { world, scope, priceGroups } = makeDoubledCascade();
    const callerSpelling = ACCOUNT_ID.toUpperCase();

    expect(callerSpelling).not.toBe(ACCOUNT_ID);

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.identity,
      accountID: callerSpelling,
    });

    expect(result.outcome).toBe('price');
    expect(priceGroups.calls[0]?.args[1]).toBe(ACCOUNT_ID);
    expect(priceGroups.calls[0]?.args[1]).not.toBe(callerSpelling);
  });

  it('distinguishes a missing principal from an explicit account mismatch', async () => {
    const cascade = makeDoubledCascade();

    const mismatchedPrice = await dispatchPriceResolution(cascade.scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: cascade.world.identity,
      accountID: 'account-other',
    });
    const mismatchedDetails = await dispatchPriceResolution(cascade.scope, {
      operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      sku: cascade.world.identity,
      accountID: 'account-other',
    });

    expect(expectUnresolvedOutcome(mismatchedPrice)).toBe('accountNotTheAuthenticatedAccount');
    expect(expectUnresolvedOutcome(mismatchedDetails)).toBe('accountNotTheAuthenticatedAccount');
    expect(cascade.entityLoaders.loads).toStrictEqual([]);
    expect(cascade.priceGroups.calls).toStrictEqual([]);
  });

  it('answers the currency accessors with no account established at all', async () => {
    // The three accessors read the SKU's own currency map, so they are not account-scoped and must
    // not become so.
    const cascade = makeDoubledCascade();
    const scope = makeScope({
      entityLoaders: cascade.entityLoaders,
      priceGroupService: cascade.priceGroups.service,
    });

    for (const operation of [
      'getPriceByCurrencyCode',
      'getListPriceByCurrencyCode',
      'getRenewalPriceByCurrencyCode',
    ] as const) {
      const result = await dispatchPriceResolution(
        scope,
        requestFor(operation, bindingsFor(cascade)),
      );

      expect(result.outcome).toBe('currencyPrice');
    }

    expect(cascade.priceGroups.calls).toStrictEqual([]);
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

/**
 * Wire a scope over the ported service whose loaders hold the price group and rate a request may name.
 *
 * ★★★ THIS HELPER EXISTS BECAUSE OF FINDING F3. Under the previous revision every case in this section
 * built its scope with `makeScope({catalog, priceGroupService, accountID})` and named no price group at
 * all - the subject reached `getBestPriceGroupDetailsBasedOnSkuAndAccount` to obtain one, which is why
 * `makePortedPriceGroupService` is seeded with `accountPriceGroups` and why every case here still is.
 * The account association is STILL what the cascade reads inside the service; what changed is that the
 * REQUEST now names the group it wants priced, so the loaders must hold it.
 */
function makePortedScope(
  world: SkuWorld,
  harness: PortedServiceHarness,
  priceGroup: ResolvedPriceGroup,
  priceGroupRate?: ResolvedPriceGroupRate,
): PriceResolutionScope {
  const loaders = makeEntityLoadersDouble({
    product: world.product,
    productType: world.productType,
    sku: world.sku,
    priceGroup,
    ...(priceGroupRate === undefined ? {} : { priceGroupRate }),
  });

  return makeScope({
    entityLoaders: loaders,
    priceGroupService: harness.service,
    accountID: ACCOUNT_ID,
  });
}

/** A scope over the ported service, the one SKU world it prices, and the graph it prices against. */
interface PortedCascade {
  readonly world: SkuWorld;
  readonly graph: PriceGroupGraph;
  readonly harness: PortedServiceHarness;
  readonly scope: PriceResolutionScope;

  /** The price group the loaders hold, and therefore the one a request may name. */
  readonly priceGroup: ResolvedPriceGroup;
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
  const picked = pick(graph);
  const harness = makePortedPriceGroupService({ accountPriceGroups: picked });
  const priceGroup = requireDefined(picked[0], 'at least one picked price group');

  return {
    world,
    graph,
    harness,
    priceGroup,
    scope: makePortedScope(world, harness, priceGroup),
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
    const scope = makePortedScope(world, harness, graph.childPriceGroup);

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: graph.childPriceGroup.getPriceGroupID(),
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
    const { world, graph, scope, priceGroup } = makePortedCascade({}, (built) => [
      built.globalRatePriceGroup,
    ]);

    expect(graph.globalRateFirstMatch.getGlobalFlag()).toBe(true);
    expect(graph.globalRateLastMatch.getGlobalFlag()).toBe(true);

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductTypeBasedOnPriceGroup',
      productTypeID: world.productType.getProductTypeID(),
      priceGroupID: priceGroup.getPriceGroupID(),
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
      const scope = makePortedScope(world, harness, expectation.graph.childPriceGroup);

      const result = await dispatchPriceResolution(scope, {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: expectation.graph.childPriceGroup.getPriceGroupID(),
      });

      expect(expectResolvedRate(result).priceGroupRateID).toBe(expectation.rateID);
    }
  });

  it('never finds a SKU rate on an ancestor price group, and the boundary reports what it got', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: level five recurses into the parent
    // price group through the PRODUCT variant rather than the SKU variant.
    // Preserved deliberately; do not fix without a product decision.
    //
    // So a rate that includes the SKU on an ANCESTOR group is never tested for and never found. The
    // walk continues past it and answers whatever the product-shaped search reaches, which for this
    // graph is the root group's global rate.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      parentSkuLevelRateSkus: [world.sku],
    });
    const harness = makePortedPriceGroupService({ accountPriceGroups: [graph.childPriceGroup] });
    const scope = makePortedScope(world, harness, graph.childPriceGroup);

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: graph.childPriceGroup.getPriceGroupID(),
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
    const scope = makePortedScope(world, harness, graph.parentPriceGroup);

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForProductBasedOnPriceGroup',
      productID: world.product.getProductID(),
      priceGroupID: graph.parentPriceGroup.getPriceGroupID(),
    });

    expect(expectResolvedRate(result).priceGroupRateID).toBe(
      graph.parentProductLevelRate.getPriceGroupRateID(),
    );
  });

  it('selects the same rate whether or not the SKU is listed as excluded on it', async () => {
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: the three `excluded*` collections are
    // counted by `getAppliesTo()` yet never consulted by the cascade.
    // Preserved deliberately; do not fix without a product decision.
    //
    // `excludedProductTypes`, `excludedProducts` and `excludedSkus` are declared, persisted through
    // three link tables and counted at [model/entity/PriceGroupRate.cfc:L95-L146], and the cascade
    // reads none of them - not at the SKU level [model/service/PriceGroupService.cfc:L146-L150], the
    // product level [:L108-L112] or the product-type level [:L63-L78]. A SKU listed as excluded is
    // still selected, and the `appliesTo` text this entrypoint publishes therefore DESCRIBES
    // EXCLUSIONS THAT DID NOT APPLY.
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
      const scope = makePortedScope(world, harness, graph.siblingPriceGroup);

      const result = await dispatchPriceResolution(scope, {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.siblingPriceGroup.getPriceGroupID(),
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
    const scope = makePortedScope(world, harness, graph.childPriceGroup);

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: graph.childPriceGroup.getPriceGroupID(),
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
    const scope = makePortedScope(world, harness, graph.childPriceGroup);

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
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
    const scope = makePortedScope(world, harness, graph.childPriceGroup);

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
    });

    expectSameDecimalValue(expectPriceOutcome(result), world.sku.getPrice().toDecimalString());
  });

  it('★★★ leaves BOTH price-group-document defects to the tier that still owns the member', () => {
    // ★★★ THIS REPLACED TWO CASES, AND BOTH OF THEM DROVE AN OPERATION FINDING F10 WITHDREW. They were
    // titled "answers the price-group document for a page the source also answers on" and "lets the
    // price-group document raise rather than repairing it at the boundary", and between them they pinned
    // the two carried-forward defects of `getPriceGroupDataJSON`:
    //
    //   LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236]: the loop reads
    //   `priceGroupSmartList.getPageRecords()[local.i]` while the counter declared at [L235] is `i`.
    //   `local` IS the implicit function scope in CFML, so `local.i` resolves to the counter and the line
    //   misleads rather than misbehaves.
    //   LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the inner loop calls
    //   `thisRate.getAmountRepresentation()`, which no in-scope component declares, so the method RAISES
    //   for any page holding at least one rate and succeeds only on a page whose groups carry no rates.
    //   Preserved deliberately; do not fix without a product decision.
    //
    // ★★ WITHDRAWING THE ROUTE NEITHER REPAIRS NOR HIDES EITHER DEFECT, and that is the whole point of
    // asserting it here rather than deleting the cases silently. The member is untouched, both defects
    // are untouched, and both remain pinned by `tests/unit/services/priceGroupService.test.ts` - which is
    // the tier the member lives on, and the only tier that can still reach it now.
    //
    // What is asserted at THIS tier is the withdrawal itself: the member is off the request-scope
    // contract, so no arm of the dispatcher can name it and no compiling call site can reach it.
    const { service } = makePriceGroupServiceDouble();

    expect(Object.keys(service)).not.toContain('getPriceGroupDataJSON');
    expect(ALL_OPERATIONS.map((operation): string => operation)).not.toContain(
      'getPriceGroupDataJSON',
    );
    expect(WITHHELD_PRICE_GROUP_MEMBERS).toContain('getPriceGroupDataJSON');
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
      entityLoaders: makeEntityLoadersDouble({
        product: world.product,
        productType: world.productType,
        sku: world.sku,
        priceGroup: graph.childPriceGroup,
        priceGroupRate: rate,
      }),
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'getRateForSkuBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: graph.childPriceGroup.getPriceGroupID(),
    });

    return { serialised: expectResolvedRate(result), json: JSON.stringify(result) };
  }

  it('reports each recognised amount type exactly as the column holds it', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: the rounding rule is applied
    // ONLY on the `percentageOff` branch.
    // Preserved deliberately; do not fix without a product decision.
    //
    // `percentageOff` rounds at [:L326-L328]; `amountOff` [:L330-L332] and `amount` [:L333-L335] skip
    // it, and the switch closes at [:L336] with NO `default:` arm, so an unrecognised `amountType`
    // passes through with the SKU's own price [:L319]. The strategy key the whole asymmetry turns on is
    // therefore published VERBATIM rather than normalised, so the asymmetry stays auditable.
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

    const { serialised, json } = await serialiseRate(graph, rate);

    // ★★★ THIS ASSERTION WAS INVERTED BY FINDING F4. It read `expect(serialised.amount.resolved)
    // .toBe(false)` and then `expect(serialised.amount.reason).toBe('rateCarriesNoAmount')`. The reason
    // token was a boundary invention: `PriceGroupRate.getAmount()` answers `Money | undefined`
    // [model/entity/PriceGroupRate.cfc], the whole rate projection is a REPORT of what the entity holds,
    // and a nullable column reported as an absent member is that report. A `{resolved:false, reason}`
    // object was a third representation of nothing, sitting inside a rate that HAD resolved.
    expect(serialised.amount).toBeUndefined();
    expect(json).not.toContain('rateCarriesNoAmount');
    // The rate itself resolved - it is only its AMOUNT column that is null - so the surrounding
    // projection is intact and the two absences remain distinguishable.
    expect(serialised.priceGroupRateID).toBe(rate.getPriceGroupRateID());
    expect(serialised.amountType).toBe(rate.getAmountType());
  });

  it('reports the amount at full precision when the column holds one', async () => {
    const graph = makePriceGroupFixtures();
    const rate = graph.fixedAmountRateWithRoundingRule;
    const { serialised } = await serialiseRate(graph, rate);

    expectSameDecimalValue(
      requireDefined(serialised.amount, 'amount on the serialised rate').amount,
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
        entityLoaders: makeEntityLoadersDouble({
          product: world.product,
          productType: world.productType,
          sku: world.sku,
          priceGroup: graph.childPriceGroup,
          priceGroupRate: graph.percentageOffRateWithRoundingRule,
        }),
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, {
        operation: 'calculateSkuPriceBasedOnPriceGroupRate',
        sku: world.identity,
        priceGroupRateID: graph.percentageOffRateWithRoundingRule.getPriceGroupRateID(),
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
        entityLoaders: makeEntityLoadersDouble({
          product: world.product,
          productType: world.productType,
          sku: world.sku,
          priceGroup: graph.childPriceGroup,
        }),
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      });

      const result = await dispatchPriceResolution(scope, {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
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
      entityLoaders: makeEntityLoadersDouble({
        product: world.product,
        productType: world.productType,
        sku: world.sku,
        priceGroup: graph.childPriceGroup,
      }),
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: graph.childPriceGroup.getPriceGroupID(),
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
      entityLoaders: makeEntityLoadersDouble({
        product: world.product,
        productType: world.productType,
        sku: world.sku,
        priceGroup: graph.childPriceGroup,
      }),
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: graph.childPriceGroup.getPriceGroupID(),
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
  const identity: PriceResolutionSkuIdentity = {
    productID: product.getProductID(),
    skuID: sku.getSkuID(),
  };
  const scope = makeScope({
    entityLoaders: makeEntityLoadersDouble({ product, sku }),
    priceGroupService: makePriceGroupServiceDouble().service,
  });

  const result = await dispatchPriceResolution(scope, { operation, sku: identity, currencyCode });

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

        // ★★★ THIS ASSERTION WAS INVERTED BY FINDING F4. It read `expect(price.resolved).toBe(false)`
        // under a comment insisting the absence arm was "PRESENT and explicit" and specifically "not an
        // omitted member either". That sentinel WAS the finding: the ported accessor's contract is
        // `Money | undefined` [model/entity/Sku.cfc:L269-L273], an absence is an ABSENT MEMBER, and a
        // `{resolved:false, reason}` object is a third value the legacy never had.
        expect(price).toBeUndefined();
        // NOT zero, not an empty amount, and not a null a consumer can default away with one operator.
        expect(json).not.toContain('"amount"');
        expect(json).not.toContain('"price"');
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
    expect(present.price?.amount).toBeDefined();

    // Path two: the same currency, in the same map, with no list or renewal price recorded.
    expect(strandedList.price).toBeUndefined();
    expect(strandedRenewal.price).toBeUndefined();

    // Path three: a currency the map never held at all.
    expect(ineligible.price).toBeUndefined();

    // ★★★ WHAT THIS CASE USED TO CLOSE WITH, AND WHY IT NO LONGER CAN (finding F4). It asserted that
    // BOTH absences published the same `reason` of `'noPriceForCurrencyCode'`, arguing that one value
    // for two causes was deliberate. The argument was sound and the vehicle was not: the accessor's own
    // contract has no reason channel, so `noPriceForCurrencyCode` was a boundary invention. The property
    // it was reaching for survives intact and is asserted directly below - the two causes are
    // INDISTINGUISHABLE on the wire, which is exactly what an omitted member gives, and gives without
    // inventing a vocabulary the legacy never published.
    expect(strandedList.json).toBe(ineligible.json);
    expect(strandedList.json).not.toContain('noPriceForCurrencyCode');
    expect(ineligible.json).not.toContain('reason');
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

    expect(price).toBeUndefined();
    // The whole document, byte for byte. Under finding F4 the `price` member is OMITTED on an absence
    // rather than carrying a `{resolved:false, reason}` sentinel, so the outcome discriminant is all
    // that is left - which is the point: `'currencyPrice'` with no price IS the absence.
    expect(json).toBe('{"outcome":"currencyPrice"}');
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

    expect(base.price?.amount).toBeDefined();
    expect(other.price).toBeUndefined();
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

    expect(upper.price?.amount).toBeDefined();
    expect(lower.price?.amount).toBeDefined();
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

    if (price === undefined) {
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

    if (price === undefined) {
      throw new Error('the secondary currency should have resolved');
    }

    expect(typeof price.amount).toBe('string');
    // ONE member, and it is the amount. The previous revision expected `['resolved', 'amount']`; the
    // discriminant went with the sentinel under finding F4.
    expect(Object.keys(price)).toStrictEqual(['amount']);
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

    expect(populated.price?.amount).toBeDefined();
    expect(empty.price).toBeUndefined();
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
      entityLoaders: makeSkuWorld().entityLoaders,
      priceGroupService: makePriceGroupServiceDouble().service,
    });
    const second = makeScope({
      entityLoaders: makeSkuWorld().entityLoaders,
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

    const { world, scope, priceGroup } = makeDoubledCascade();
    const result = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: world.identity,
      priceGroupID: priceGroup.getPriceGroupID(),
    });

    expect(JSON.stringify(result)).not.toContain('1999');
    expect(scope.now.toISOString()).toBe(RESOLVED_AT);
  });

  it('answers a mapped failure with a JSON document and no-store caching', async () => {
    // `no-store` is not a performance decision and carries no target of any kind: a resolved price is
    // account-scoped, so a shared cache must not be permitted to serve one account's price to another.
    //
    // ★ AND THERE IS NO THIRD. `x-content-type-options: nosniff` briefly joined the shared builder's
    // set and a code review withdrew it: the ported system had no such HTTP semantic and the AAP
    // prescribes none, so emitting it invented a non-functional requirement (0.8.1). The set is
    // asserted EXACTLY, which is what keeps every invented header - that one included - out.
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

  it('★★★ serves a successful body through the SHARED envelope, correlation and all', async () => {
    // ★★★ FINDING F13, ASSERTED AT THE ONE SEAM THIS SUITE CAN REACH IT. The previous revision built
    // its own successful body - `{operation, resolvedAt, result}` - with its own header pair and its own
    // 200, and that body carried NO `requestId`: a caller who received a price had nothing to quote when
    // reporting a problem with it, while a caller who received an error did. The subject now hands its
    // document to `jsonSuccessResponse`, which owns the status, the headers and the four envelope
    // members for all five entrypoints.
    //
    // ★★ WHY THIS IS DRIVEN THROUGH THE HELPER RATHER THAN THROUGH `handler`. The 200 path runs PAST the
    // composition root, which this suite deliberately never wires - the boundary decision recorded in the
    // file header, and asserted by the "resolves every refusal WITHOUT wiring the composition root" case
    // above. So the pieces are assembled exactly as the subject assembles them: a REAL dispatch result,
    // wrapped in the subject's own published document type, handed to the shared helper with the route
    // table's own capability and action. What is pinned is the contract the subject adopted, using the
    // subject's types, so a divergence in either would fail to compile here.
    const cascade = makeDoubledCascade();
    const result = await dispatchPriceResolution(cascade.scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: cascade.world.identity,
      priceGroupID: cascade.priceGroup.getPriceGroupID(),
    });

    const document: PriceResolutionResultDocument = {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      resolvedAt: cascade.scope.now.toISOString(),
      result,
    };
    const route = ROUTE_TABLE.priceResolution;
    const served = jsonSuccessResponse(REQUEST_ID, route.capability, route.action, document);

    expect(served.statusCode).toBe(200);
    // The SAME header set a mapped failure carries: the JSON content type and the account-scoped
    // `no-store`, and nothing invented alongside them.
    expect(served.headers).toStrictEqual(REQUIRED_SUCCESS_RESPONSE_HEADERS);

    const body: SuccessResponseBody<PriceResolutionResultDocument> = JSON.parse(
      requireDefined(served.body, 'body on the served response'),
    ) as SuccessResponseBody<PriceResolutionResultDocument>;

    // Four envelope members, no more: the correlation identifier a caller can quote, the two closed
    // route literals, and the capability's own payload nested under `result`.
    expect(Object.keys(body).sort()).toStrictEqual(['action', 'capability', 'requestId', 'result']);
    expect(body.requestId).toBe(REQUEST_ID);
    expect(body.capability).toBe('priceResolution');
    expect(body.action).toBe('resolvePrices');

    // The document is nested WHOLE rather than spread into the envelope, so `operation` and
    // `resolvedAt` stay where the subject puts them and cannot collide with an envelope member.
    expect(Object.keys(body.result).sort()).toStrictEqual(['operation', 'resolvedAt', 'result']);
    expect(body.result.operation).toBe('calculateSkuPriceBasedOnPriceGroup');
    expect(body.result.resolvedAt).toBe(RESOLVED_AT);
    expect(body.result.result).toStrictEqual(result);
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
  it('uses the minimal status set for this authenticated, non-administrative surface', async () => {
    // 401 joins the client-shaped, route-not-found and server-shaped statuses.
    // 403 does not: the administrative document operation is withdrawn.
    const responses: readonly APIGatewayProxyResult[] = [
      await handler(makeProxyEvent(), makeLambdaContext()),
      await handler(makeProxyEvent({ body: '{' }), makeLambdaContext()),
      await handler(makeProxyEvent({ body: '[]' }), makeLambdaContext()),
      await handler(makeProxyEvent({ body: '{"operation":"nope"}' }), makeLambdaContext()),
      await handler(makeProxyEvent({ httpMethod: 'PUT' }), makeLambdaContext()),
      await handler(makeProxyEvent({ path: '/prices' }), makeLambdaContext()),
      await handler(makeProxyEvent({ authorizer: null }), makeLambdaContext()),
    ];

    for (const response of responses) {
      expect([400, 401, 404]).toContain(response.statusCode);
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
          // A well-formed identity pair with an EMPTY `skuID`, so the schema complains about a path the
          // log may name while the planted product identifier is a value it must not.
          sku: { productID: PLANTED_INTERNAL_DETAIL, skuID: '' },
          priceGroupID: SENTINEL_PRICE_GROUP_ID,
        }),
      }),
      makeLambdaContext(),
    );

    expect(capture.text()).toContain('fieldPaths');
    expect(capture.text()).not.toContain(PLANTED_INTERNAL_DETAIL);
  });

  it('★★★ emits every diagnostic key on its served-request line LEGIBLY (finding F7)', async () => {
    // ★★★ FINDING F7, AND IT CAN ONLY BE PROVEN THROUGH THE PRODUCTION LOGGER. The logger applies a
    // mandatory, non-disableable key-based redaction policy, and it did not admit `action`, `operation`,
    // `outcome` or `accountEstablished` - so the one line an operator receives for a SERVED price
    // resolution carried a correlation identifier, a route, and `[REDACTED]` four times over. A test
    // double cannot see that, because it records the context object as given.
    //
    // ★★ WHY THE CONTEXT IS EMITTED HERE RATHER THAN OBSERVED THROUGH `handler`. The success line is
    // written past the composition root, which this suite never wires - the boundary decision recorded
    // in the file header, asserted by the "resolves every refusal WITHOUT wiring the composition root"
    // case above. So the exact context the subject builds is emitted through the real instance instead.
    // Two guards keep this from drifting away from the subject: every VALUE below is read from the route
    // table, the operation union or a real dispatch result rather than written as a literal, and the
    // sibling case above already proves `route` legible end to end THROUGH the subject on a refusal
    // line, which is the one key both lines share.
    const cascade = makeDoubledCascade();
    const result = await dispatchPriceResolution(cascade.scope, {
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      sku: cascade.world.identity,
      priceGroupID: cascade.priceGroup.getPriceGroupID(),
    });
    const route = ROUTE_TABLE.priceResolution;
    const routeLabel = `${route.methods} ${route.path}`;

    const capture = captureLogStream();

    productionLogger.info('price resolution request served', {
      requestId: REQUEST_ID,
      route: routeLabel,
      action: route.action,
      operation: 'calculateSkuPriceBasedOnPriceGroup',
      outcome: result.outcome,
      accountEstablished: true,
    });

    const line = capture.text();

    expect(line).toContain('price resolution request served');
    expect(line).toContain(`"route":"${routeLabel}"`);
    expect(line).toContain('"action":"resolvePrices"');
    expect(line).toContain('"operation":"calculateSkuPriceBasedOnPriceGroup"');
    expect(line).toContain(`"outcome":"${result.outcome}"`);
    // A BOOLEAN, deliberately: whether an account was established is the diagnostic an operator needs,
    // and the identifier itself is never a log value.
    expect(line).toContain('"accountEstablished":true');
    // The correlation identifier, which was one of only two legible members before the policy change.
    expect(line).toContain(REQUEST_ID);
    // ★ AND NOTHING ON THE LINE WAS REDACTED. A policy change admitting two of the four and not the
    // others would be a half-fix, so the whole line is asserted rather than each key in isolation.
    expect(line).not.toContain('[REDACTED]');
  });

  it('★★★ still redacts what must stay redacted, on the very same policy', () => {
    // ★★★ THE OTHER HALF OF FINDING F7, AND THE REASON THE ALLOW-LIST IS CLOSED RATHER THAN OPEN.
    // Admitting four diagnostic keys must not have widened the policy into "log whatever a handler
    // hands over". A credential-shaped key and a body-shaped key are still redacted by the same
    // instance, on the same call, so the change is provably an ADDITION of named keys rather than a
    // relaxation.
    const capture = captureLogStream();

    productionLogger.info('price resolution request served', {
      requestId: REQUEST_ID,
      action: ROUTE_TABLE.priceResolution.action,
      password: PLANTED_INTERNAL_DETAIL,
      requestBody: PLANTED_INTERNAL_DETAIL,
    });

    const line = capture.text();

    expect(line).toContain('"action":"resolvePrices"');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain(PLANTED_INTERNAL_DETAIL);
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
      // The vehicle was `getPriceGroupDataJSON`, which finding F10 withdrew from this surface; any
      // reachable member proves the same property, so the SKU cascade entry point carries it now.
      const cascade = makeDoubledCascade({
        failing: { member: 'getRateForSkuBasedOnPriceGroup', thrown },
      });

      await expect(
        dispatchPriceResolution(cascade.scope, {
          operation: 'getRateForSkuBasedOnPriceGroup',
          sku: cascade.world.identity,
          priceGroupID: cascade.priceGroup.getPriceGroupID(),
        }),
      ).rejects.toStrictEqual(thrown);
    }
  });

  it('preserves the framework dead-call-target message exactly as thrown', async () => {
    // LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the
    // framework's terminal throw is ungrammatical - "does not exists" - and the service-tier copy
    // still says "entity".
    // Preserved deliberately; do not fix without a product decision.
    //
    // It is an OBSERVABLE ERROR CONTRACT, so the dispatcher must not normalise, reword or wrap it on
    // the way out; the mapper recognises it by that exact shape and publishes it verbatim.
    const world = makeSkuWorld();
    const priceGroups = makePriceGroupServiceDouble({
      failing: {
        member: 'calculateSkuPriceBasedOnAccount',
        thrown: new Error(MISSING_METHOD_CONTRACT_MESSAGE),
      },
    });
    const scope = makeScope({
      entityLoaders: world.entityLoaders,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
    });

    const raised: unknown = await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnAccount',
      sku: world.identity,
      accountID: ACCOUNT_ID,
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
      // ★ EVERY EXPOSED MEMBER IS NOW REACHED BY THE OPERATION NAMED AFTER IT, with no special case.
      // The previous revision needed one - `getPriceGroupDataJSON` was reached by exactly one operation
      // while `getBestPriceGroupDetailsBasedOnSkuAndAccount` was reached by NINE, because it was the
      // resolution helper for the eight others (finding F3). With every operation binding its own
      // declared arguments, the member-to-operation mapping is one to one.
      const cascade = makeDoubledCascade({
        rateForSku: makePriceGroupFixtures().percentageOffRateWithRoundingRule,
        failing: { member, thrown: new Error(`${member} failed: ${PLANTED_INTERNAL_DETAIL}`) },
      });

      await expect(
        dispatchPriceResolution(cascade.scope, requestFor(member, bindingsFor(cascade))),
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
      makeScope({
        entityLoaders: firstWorld.entityLoaders,
        priceGroupService: firstDouble.service,
      }),
      { operation: 'calculateSkuPriceBasedOnCurrentAccount', sku: firstWorld.identity },
    );

    expect(firstDouble.calls).toHaveLength(1);
    expect(secondDouble.calls).toHaveLength(0);
    // The second world's loaders were never asked anything either.
    expect(secondWorld.entityLoaders.loads).toStrictEqual([]);
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

    const loaders = (): EntityLoadersDouble =>
      makeEntityLoadersDouble({
        product: world.product,
        productType: world.productType,
        sku: world.sku,
        priceGroup: graph.childPriceGroup,
      });

    const dearResult = await dispatchPriceResolution(
      makeScope({
        entityLoaders: loaders(),
        priceGroupService: dear.service,
        accountID: ACCOUNT_ID,
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
    );
    const cheapResult = await dispatchPriceResolution(
      makeScope({
        entityLoaders: loaders(),
        priceGroupService: cheap.service,
        accountID: 'account-1a2b3c',
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
    );

    expect(expectPriceOutcome(dearResult)).toBe('49.95');
    expect(expectPriceOutcome(cheapResult)).toBe('4.95');
    // The price group each invocation was answered about is the one IT named, loaded per invocation.
    expect(dear.calls[0]?.args[1]).toBe(graph.childPriceGroup);
    expect(cheap.calls[0]?.args[1]).toBe(graph.childPriceGroup);
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
        entityLoaders: world.entityLoaders,
        priceGroupService: first.service,
        accountID: ACCOUNT_ID,
      }),
      { operation: 'calculateSkuPriceBasedOnAccount', sku: world.identity, accountID: ACCOUNT_ID },
    );

    const secondWorld = makeSkuWorld({ idPrefix: 'secondassoc' });
    const secondResult = await dispatchPriceResolution(
      makeScope({
        entityLoaders: secondWorld.entityLoaders,
        priceGroupService: second.service,
        accountID: ACCOUNT_ID,
      }),
      {
        operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
        sku: secondWorld.identity,
        accountID: ACCOUNT_ID,
      },
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
        entityLoaders: makeEntityLoadersDouble({
          product: world.product,
          productType: world.productType,
          sku: world.sku,
          priceGroup: graph.childPriceGroup,
        }),
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
      }),
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
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

// ===========================================================================
// CONCERN 7 - THE LAMBDA ENTRYPOINT, DRIVEN INTO THE REAL GRAPH
//
// ★★★ THIS SECTION IS A CODE-REVIEW FINDING, AND THE MEASUREMENT IS WORTH QUOTING.
//
// The review counted, on this file, thirty-six references to `handler` of which EVERY
// `await handler(` fell inside the parse-and-refuse block, against fifty-eight direct
// `dispatchPriceResolution(` calls - and concluded: "price 13/13 at the dispatcher but
// **0/13** through `handler`". The dispatcher was thoroughly proven; the entrypoint that
// must reach it was proven only on the paths that refuse before a composition root exists.
//
// The cause was a missing seam, not a missing test: `handler` was an `async function` that
// called the module-imported `bootstrapCompositionRoot()`, so reaching a valid operation
// through it required a live MySQL pool. `createPriceResolutionHandler` is now that seam,
// and the cases below are the four groups the review required.
//
// ★★ HOW THE GRAPH BEHIND THESE CASES IS BUILT, because it is NOT a hand-written double.
// `bootstrapCompositionRoot({ executor, environment })` assembles the REAL composition root
// - the real request scope, the real `PriceGroupService`, the real currency converter, the
// real `buildRequestScopeInput` - over an injected statement executor and an explicit
// environment source. No pool is created, no socket is opened and `process.env` is not read,
// which is the same construction `tests/unit/handlers/bootstrap.test.ts` is built on.
//
// What is answered from data is exactly the two catalogue reads and the nine price-group
// members, installed on the CLASS PROTOTYPES the real instances inherit from. That choice is
// deliberate: it is typed - a signature change breaks these installers at compile time - it
// needs no cast, and it leaves the wiring under test rather than replacing it. The
// alternative, an object literal standing in for `RequestScope`, is IMPOSSIBLE without a
// cast, because `RequestScope` publishes `productService` and `skuService` as the class types
// and both classes hold `private readonly` collaborators.
// ===========================================================================

/**
 * A configuration source that answers the five keys with no default, and nothing else.
 *
 * NOT A CREDENTIAL. `.invalid` is the reserved never-resolvable TLD [RFC 2606] and the two
 * account-shaped values are the literal string that says what they are. No pool is ever created from
 * this - the injected executor is what every statement goes to - so nothing here is dialled, bound or
 * authenticated. `DB_DIALECT` is spelled `mySql` on purpose: three legacy sites spell the product name
 * three different ways, so the case-folding normalization in `src/lib/config.ts` is part of the
 * contract.
 */
const ENTRYPOINT_ENVIRONMENT: EnvironmentSource = Object.freeze({
  // An IP literal, which is exactly the case `verify-ca` below exists to serve: `verify-identity`
  // refuses an address (F47), because a certificate binds to host NAMES and an address would reduce
  // the mode to a chain-only check while still calling itself verified.
  DB_HOST: '127.0.0.1',
  DB_USER: 'unused-by-this-suite',
  DB_PASSWORD: 'unused-by-this-suite',
  // `verify-ca`, not `disabled`: the executor is injected so no pool is built, and `disabled` would
  // be a cleartext claim this fixture does not need to make (CWE-319).
  DB_TLS_MODE: 'verify-ca',
  // Required BY `verify-ca` (F47): that mode omits the host-name check, so the pinned anchor is the
  // only thing left binding the connection to the intended server, and the contract refuses the mode
  // without one. Never dialled - the injected executor answers every statement - so this is a
  // syntactically valid PEM and nothing more.
  DB_TLS_CA: '-----BEGIN CERTIFICATE-----\nZmFrZS1jZXJ0aWZpY2F0ZS1ib2R5\n-----END CERTIFICATE-----',
  DB_DIALECT: 'mySql',
  // ★ A REFERENCE-RATE TABLE IS CONFIGURED, BECAUSE ONE OF THE THIRTEEN OPERATIONS CONVERTS.
  // `convertCurrency` with no table at all now REFUSES rather than answering at par: an absent
  // table is the legacy's own cold-start failure state [model/service/CurrencyService.cfc:L104-L131],
  // not its pass-through state [L100-L101]. A suite proving the ENTRYPOINT reaches the dispatcher
  // must therefore configure the deployment the way a deployment is configured; the refusal itself
  // is pinned where it belongs, in `tests/unit/handlers/bootstrap.test.ts`.
  ECB_REFERENCE_RATES: 'USD=1.0850,GBP=0.8520,JPY=163.41',
  // Required whenever the table is set, so its age can be assessed. A fixed instant keeps the
  // suite deterministic; staleness reporting is pinned in the bootstrap suite, not here.
  ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00:00Z',
});

/**
 * The statement executor the real graph is assembled over.
 *
 * It answers every statement with NO ROWS and records what it was asked. Recording is the point:
 * "this valid request opened no pool and issued no statement of its own" is asserted by reading this
 * ledger, and the one statement tier one does issue - the currency-records read - is visible in it
 * rather than assumed. `executeMutation` refuses outright: a resolution surface is a READ surface, and
 * a mutation reaching it would be a finding rather than a variation.
 */
class EntrypointExecutor implements PreparedStatementExecutor {
  public readonly statements: string[] = [];

  public execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.statements.push(sql);
    void params;

    return Promise.resolve([]);
  }

  public executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    void params;

    throw new Error(
      `a mutation reached the price-resolution capability, which publishes reads only: ${sql}`,
    );
  }

  /**
   * Refuses, for the same reason `executeMutation` does.
   *
   * A transaction exists to make a set of WRITES atomic, and this capability performs none. A
   * resolution path that opened one would be a finding rather than a variation, so this states that
   * loudly instead of quietly running the work.
   */
  public transaction<TValue>(
    work: (tx: PreparedStatementExecutor) => Promise<TValue>,
  ): Promise<TValue> {
    void work;

    throw new Error(
      'a transaction was opened by the price-resolution capability, which performs no writes',
    );
  }
}

/**
 * A composition root that DELEGATES to a real one and records the scope input it was asked for.
 *
 * ★ A DELEGATING DECORATOR, NOT A CAST AND NOT A STUB. The published root is `Object.freeze`d, so a
 * spy cannot be installed on it; and an object literal cannot be a `CompositionRoot` while
 * `createRequestScope` must hand back a real `RequestScope`. A class that `implements CompositionRoot`
 * and forwards every member solves both, and the forwarding is total - every member below reaches the
 * real root, so nothing about the graph is simulated.
 *
 * The recorded inputs are what let one case assert that the root receives EXACTLY `{ accountID }` -
 * one key, from the authorizer - and no clock, no feed host and no allow-list.
 */
class RecordingCompositionRoot implements CompositionRoot {
  public readonly scopeInputs: RequestScopeInput[] = [];

  public constructor(private readonly inner: CompositionRoot) {}

  public get diagnostics(): CompositionRoot['diagnostics'] {
    return this.inner.diagnostics;
  }

  public get dialect(): CompositionRoot['dialect'] {
    return this.inner.dialect;
  }

  public get settingsProvider(): CompositionRoot['settingsProvider'] {
    return this.inner.settingsProvider;
  }

  public get integration(): CompositionRoot['integration'] {
    return this.inner.integration;
  }

  public createRequestScope(input?: RequestScopeInput): Promise<RequestScope> {
    this.scopeInputs.push(input ?? {});

    return this.inner.createRequestScope(input);
  }

  public createInspectableRequestScope(
    input?: RequestScopeInput,
  ): Promise<InspectableRequestScope> {
    return this.inner.createInspectableRequestScope(input);
  }
}

/** One captured log line, as the sink received it and as it parses. */
interface SinkLine {
  readonly raw: string;
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/** A per-case recording sink, and the lines it collected. */
interface SinkRecorder {
  readonly logger: ReturnType<typeof processLogger.withSink>;
  readonly lines: readonly SinkLine[];
  /** Every RAW line joined, so a leak anywhere in any payload is detectable. */
  readonly text: () => string;
}

/**
 * Build a recording logger through the published sink seam.
 *
 * ★ NO GLOBAL STREAM IS TOUCHED. `Logger.withSink` is the seam `src/lib/logger.ts` publishes for
 * exactly this, so nothing patches `process.stdout.write`, nothing is silenced for a sibling file, and
 * the logger's mandatory redaction policy still applies to everything captured. Every raw line is
 * kept in addition to the parsed view, because a leak assertion has to be able to fail on text that
 * did not parse as the expected envelope.
 */
function makeSinkRecorder(): SinkRecorder {
  const lines: SinkLine[] = [];
  const logger = processLogger.withSink((line: string): void => {
    const parsed: unknown = JSON.parse(line);
    const entry = readObject(parsed, 'a captured log line');
    const context = entry['context'];

    lines.push({
      raw: line,
      level: readString(entry['level'], 'the captured level'),
      message: readString(entry['message'], 'the captured message'),
      context: context === undefined ? {} : readObject(context, 'the captured context'),
    });
  });

  return { logger, lines, text: (): string => lines.map((line): string => line.raw).join('\n') };
}

/** Everything one entrypoint case drives the handler with. */
interface EntrypointBed {
  readonly invoke: PriceResolutionLambdaHandlerRef;
  readonly root: RecordingCompositionRoot;
  readonly executor: EntrypointExecutor;
  readonly emitted: SinkRecorder;
}

/** The entrypoint's own published shape, reached structurally so it cannot drift from the subject. */
type PriceResolutionLambdaHandlerRef = ReturnType<typeof createPriceResolutionHandler>;

/**
 * Assemble the real graph, wrap it in the recorder, and build the handler over both.
 *
 * A FRESH GRAPH AND A FRESH HANDLER PER CALL. The composition memo is bypassed by construction -
 * `./bootstrap.js` documents that ANY override does so - and it is reset by this suite's hooks anyway,
 * so no case can inherit another's graph or leave one behind.
 */
async function openEntrypoint(): Promise<EntrypointBed> {
  const executor = new EntrypointExecutor();
  const emitted = makeSinkRecorder();
  const root = new RecordingCompositionRoot(
    await bootstrapCompositionRoot({ executor, environment: ENTRYPOINT_ENVIRONMENT }),
  );

  return {
    executor,
    emitted,
    root,
    invoke: createPriceResolutionHandler({
      compositionRoot: (): Promise<CompositionRoot> => Promise.resolve(root),
      logger: emitted.logger,
    }),
  };
}

/**
 * Programme the five read-only entity loads the current request scope publishes.
 *
 * The real composition root owns the repository instances and closes over them in
 * `RequestScope.entityLoaders`. Installing answers on the concrete repository prototypes therefore
 * leaves the production wiring under test while keeping this suite database-free. Every answer
 * verifies the identifier it receives; a wrong identifier is a miss rather than an unconditional
 * success.
 */
function installEntityReads(
  world: SkuWorld,
  priceGroup: ResolvedPriceGroup,
  priceGroupRate: ResolvedPriceGroupRate,
): void {
  vi.spyOn(MysqlProductRepository.prototype, 'getProductByProductID').mockImplementation(
    (productID: string): Promise<ResolvedProduct | undefined> =>
      Promise.resolve(productID === world.product.getProductID() ? world.product : undefined),
  );
  vi.spyOn(
    MysqlProductTypeRepository.prototype,
    'getProductTypeByProductTypeID',
  ).mockImplementation((productTypeID: string): Promise<ResolvedProductType | undefined> =>
    Promise.resolve(
      productTypeID === world.productType.getProductTypeID() ? world.productType : undefined,
    ),
  );
  vi.spyOn(MysqlSkuRepository.prototype, 'getProductSkus').mockImplementation(
    (product: ResolvedProduct, fetchOptions: boolean): Promise<ResolvedSku[]> => {
      void fetchOptions;

      return Promise.resolve(
        product.getProductID() === world.product.getProductID() ? [world.sku] : [],
      );
    },
  );
  vi.spyOn(MySqlPriceGroupRepository.prototype, 'getPriceGroup').mockImplementation(
    (priceGroupID: string): Promise<ResolvedPriceGroup | undefined> =>
      Promise.resolve(priceGroupID === priceGroup.getPriceGroupID() ? priceGroup : undefined),
  );
  vi.spyOn(MySqlPriceGroupRepository.prototype, 'getPriceGroupRate').mockImplementation(
    (priceGroupRateID: string): Promise<ResolvedPriceGroupRate | undefined> =>
      Promise.resolve(
        priceGroupRateID === priceGroupRate.getPriceGroupRateID() ? priceGroupRate : undefined,
      ),
  );
}

/**
 * Programme the published price-resolution service members from one double.
 *
 * Explicit installations rather than a loop over member names: a loop would need an index into
 * the class type and would lose the per-member signature check that makes this honest. The five
 * synchronous members and the four asynchronous ones are installed as what they are, so writing one as
 * the other would not compile - which is the same compile-time split
 * {@link makePriceGroupServiceDouble} depends on.
 */
function installPriceGroupService(double: PriceGroupServiceDouble): void {
  const service = double.service;

  vi.spyOn(
    PriceGroupService.prototype,
    'getRateForProductTypeBasedOnPriceGroup',
  ).mockImplementation(service.getRateForProductTypeBasedOnPriceGroup);
  vi.spyOn(PriceGroupService.prototype, 'getRateForProductBasedOnPriceGroup').mockImplementation(
    service.getRateForProductBasedOnPriceGroup,
  );
  vi.spyOn(PriceGroupService.prototype, 'getRateForSkuBasedOnPriceGroup').mockImplementation(
    service.getRateForSkuBasedOnPriceGroup,
  );
  vi.spyOn(PriceGroupService.prototype, 'calculateSkuPriceBasedOnPriceGroup').mockImplementation(
    service.calculateSkuPriceBasedOnPriceGroup,
  );
  vi.spyOn(
    PriceGroupService.prototype,
    'calculateSkuPriceBasedOnPriceGroupRate',
  ).mockImplementation(service.calculateSkuPriceBasedOnPriceGroupRate);
  vi.spyOn(
    PriceGroupService.prototype,
    'calculateSkuPriceBasedOnCurrentAccount',
  ).mockImplementation(service.calculateSkuPriceBasedOnCurrentAccount);
  vi.spyOn(PriceGroupService.prototype, 'calculateSkuPriceBasedOnAccount').mockImplementation(
    service.calculateSkuPriceBasedOnAccount,
  );
  vi.spyOn(
    PriceGroupService.prototype,
    'getBestPriceGroupDetailsBasedOnSkuAndAccount',
  ).mockImplementation(service.getBestPriceGroupDetailsBasedOnSkuAndAccount);
}

/** The success envelope, narrowed by a predicate rather than asserted. */
function readSuccessEnvelope(response: APIGatewayProxyResult): {
  readonly operation: string;
  readonly resolvedAt: string;
  readonly result: Readonly<Record<string, unknown>>;
} {
  const parsed: unknown = JSON.parse(response.body);
  const envelope = readObject(parsed, 'the shared success envelope');
  const body = readObject(envelope['result'], 'the price-resolution result document');

  return {
    operation: readString(body['operation'], 'the echoed operation'),
    resolvedAt: readString(body['resolvedAt'], 'the resolution instant'),
    result: readObject(body['result'], 'the result'),
  };
}

// The composition memo is module state, and `appConfig` carries its own. Both are cleared on the way
// in as well as on the way out, so no case can inherit either from a sibling file that ran earlier in
// the same worker - and none is left behind for one that runs later.
beforeEach(() => {
  resetCompositionRoot();
  appConfig.reset();
});

afterEach(() => {
  resetCompositionRoot();
  appConfig.reset();
});

describe('the Lambda entrypoint, through its dependency seam (F3)', () => {
  it('publishes the factory, the entrypoint built from it, and the dispatcher', () => {
    // The seam itself: a two-parameter handler, buildable with NO arguments, which is exactly how the
    // production line at the foot of the subject builds it.
    expect(typeof createPriceResolutionHandler).toBe('function');
    expect(createPriceResolutionHandler().length).toBe(2);
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(2);
  });

  it('serves an ACCOUNT-SCOPED operation end to end, on the account the authorizer established', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const priceGroups = makePriceGroupServiceDouble({
      bestPriceGroup: graph.childPriceGroup,
      priceForAccount: Money.fromDecimalString('7.25'),
    });
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    const bed = await openEntrypoint();

    installEntityReads(world, graph.childPriceGroup, rate);
    installPriceGroupService(priceGroups);

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'calculateSkuPriceBasedOnAccount',
          sku: world.identity,
          accountID: ACCOUNT_ID,
        }),
        authorizer: { accountID: ACCOUNT_ID },
      }),
      makeLambdaContext(),
    );
    const envelope = readSuccessEnvelope(response);

    expect(response.statusCode).toBe(200);
    // ★ THE SCOPE INPUT CARRIES EXACTLY ONE KEY, AND IT CAME FROM THE AUTHORIZER. No clock - the scope
    // reads the instant once itself - no feed host, and no allow-list: a price request cannot mint an
    // origin for a capability that renders no feed. `toStrictEqual` rather than `toMatchObject`, so a
    // second key appearing here fails rather than passing unnoticed.
    expect(bed.root.scopeInputs).toHaveLength(1);
    expect(bed.root.scopeInputs[0]).toStrictEqual({ accountID: ACCOUNT_ID });
    // The account reached the service, which is what makes the plumbing assertion above non-vacuous.
    expect(
      priceGroups.calls.filter(
        (call): boolean => call.member === 'calculateSkuPriceBasedOnAccount',
      ),
    ).toHaveLength(1);
    expect(envelope.operation).toBe('calculateSkuPriceBasedOnAccount');
    expect(envelope.result['outcome']).toBe('price');
    // The response is shaped by the two frozen headers and nothing else.
    expect(response.headers).toStrictEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    // A parseable instant, and the CONTEXT's correlation identifier rather than the event's.
    expect(Number.isNaN(Date.parse(envelope.resolvedAt))).toBe(false);

    const served = bed.emitted.lines.filter(
      (line): boolean => line.message === 'price resolution request served',
    );
    expect(served).toHaveLength(1);
    const context = requireDefined(served[0], 'the success log line').context;
    expect(context['requestId']).toBe(REQUEST_ID);
    expect(context['route']).toBe('POST /prices/resolution');
    // ★ A BOOLEAN, NEVER AN IDENTIFIER. The account is reported as established or not; the identifier
    // itself appears in no line, in no payload, at no level. A boolean is admitted in the clear
    // because a boolean cannot be customer data.
    expect(context['accountEstablished']).toBe(true);
    expect(bed.emitted.text()).not.toContain(ACCOUNT_ID);
    // Closed-vocabulary diagnostic values remain legible through the logger's bounded allow-list.
    expect(context['operation']).toBe('calculateSkuPriceBasedOnAccount');
    expect(context['outcome']).toBe('price');
  });

  it('reads the authorizer claim CASE-INSENSITIVELY on the way through', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    const bed = await openEntrypoint();

    installEntityReads(world, graph.childPriceGroup, rate);
    installPriceGroupService(
      makePriceGroupServiceDouble({ bestPriceGroup: graph.childPriceGroup }),
    );

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'calculateSkuPriceBasedOnCurrentAccount',
          sku: world.identity,
        }),
        // `accountId`, not `accountID`. A case-sensitive index would treat this request as anonymous
        // and answer `noAuthenticatedAccount`, so the assertion below is what pins the CFML struct-key
        // read the subject performs.
        authorizer: { accountId: ACCOUNT_ID },
      }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(bed.root.scopeInputs[0]).toStrictEqual({ accountID: ACCOUNT_ID });
    expect(readSuccessEnvelope(response).result['outcome']).toBe('price');
  });

  it('★★★ serves the LOGGED-OUT current-account arm through the REAL service and composition', async () => {
    // ★★★ THE CASE THE REVIEW REQUIRED, AND THE REASON IT HAD TO BE HERE RATHER THAN AT THE DISPATCHER.
    // The T6 section above proves the logged-out arm by calling `dispatchPriceResolution` directly with
    // a scope carrying an empty context - which is true, and was FALSE CONFIDENCE, because the routed
    // entrypoint refused every unidentified caller before a dispatch could happen. So the arm was
    // provably correct and provably unreachable at the same time, and only a case that drives the real
    // handler over the real composition root can tell those two apart.
    //
    // NO PRICE-GROUP SERVICE DOUBLE IS INSTALLED. The REAL `PriceGroupService` runs, takes the
    // `accountID === undefined` branch of `calculateSkuPriceBasedOnCurrentAccount` and answers
    // `sku.getPrice()` [model/service/PriceGroupService.cfc:L266] - so the value in the response body is
    // the SKU's own price, arrived at by the ported service rather than asserted by the harness.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    const bed = await openEntrypoint();

    installEntityReads(world, graph.childPriceGroup, rate);

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'calculateSkuPriceBasedOnCurrentAccount',
          sku: world.identity,
        }),
        // NO AUTHORIZER CONTEXT AT ALL, stated explicitly because the event builder's default is an
        // authenticated session.
        authorizer: null,
      }),
      makeLambdaContext(),
    );
    const envelope = readSuccessEnvelope(response);

    expect(response.statusCode).toBe(200);
    // ★★ THE SCOPE OPENED WITH AN EMPTY ACCOUNT, which is what makes the service take the else arm.
    // `toStrictEqual({accountID: undefined})` rather than `{}`: the handler passes the member as an
    // explicit `undefined`, and the composition root is what turns that into the OMITTED key on
    // `CurrentAccountContext` - asserted in `tests/unit/handlers/bootstrap.test.ts`.
    expect(bed.root.scopeInputs).toHaveLength(1);
    expect(bed.root.scopeInputs[0]).toStrictEqual({ accountID: undefined });
    // ★★★ THE SKU'S OWN PRICE, NOT A ZERO AND NOT AN ABSENCE.
    expect(envelope.result['outcome']).toBe('price');
    expect(readObject(envelope.result['price'], 'the served price')['amount']).toBe(
      world.sku.getPrice().toDecimalString(),
    );

    // The log line reports the account as NOT established, and no identifier appears anywhere.
    const served = requireDefined(
      bed.emitted.lines.find((line): boolean => line.message === 'price resolution request served'),
      'the success log line',
    );
    expect(served.context['accountEstablished']).toBe(false);
    expect(bed.emitted.text()).not.toContain(ACCOUNT_ID);
  });

  it('★★★ answers an EMPTY currencyCode with an omitted price rather than a refusal', async () => {
    // ★★★ THE SECOND CASE THE REVIEW REQUIRED. CFML `required string currencyCode` rejects a MISSING
    // argument and accepts an EMPTY one, so `Sku.getPriceByCurrencyCode('')`
    // [model/entity/Sku.cfc:L269-L273] is a legitimate call: it misses the currency map exactly as any
    // unknown code does and answers NOTHING. A `.min(1)` on the schema turned that answer into a 400,
    // which inverted the one semantic AAP 0.9.2 calls the highest-consequence parity check in the plan.
    //
    // All THREE accessors are driven, because all three shared the schema.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );

    for (const operation of [
      'getPriceByCurrencyCode',
      'getListPriceByCurrencyCode',
      'getRenewalPriceByCurrencyCode',
    ] as const) {
      const bed = await openEntrypoint();

      installEntityReads(world, graph.childPriceGroup, rate);
      installPriceGroupService(makePriceGroupServiceDouble());

      const response = await bed.invoke(
        makeProxyEvent({ body: bodyOf({ operation, sku: world.identity, currencyCode: '' }) }),
        makeLambdaContext(),
      );
      const envelope = readSuccessEnvelope(response);

      expect(response.statusCode).toBe(200);
      expect(envelope.operation).toBe(operation);
      expect(envelope.result['outcome']).toBe('currencyPrice');
      // OMITTED, not `0`, not `null` and not a sentinel: `JSON.stringify` drops the member, so the
      // absence a consumer reads is the exact `undefined` the accessor answered.
      expect(envelope.result['price']).toBeUndefined();
      expect('price' in envelope.result).toBe(false);
      expect(response.body).not.toContain('"price"');

      vi.restoreAllMocks();
    }
  });

  it('★★★ resolves a SKU identity cased differently from the stored row', async () => {
    // ★★★ THE THIRD CASE THE REVIEW REQUIRED, and it exercises the composition root's SKU loader
    // through this route. CFML identifiers are case-insensitive - the engine folds case in `eq` and in
    // every struct key, and the DAO binds the identifier into a `cfqueryparam` that MySQL's own
    // collation folds again - so a differently-cased but VALID identifier must resolve. The loader used
    // a strict `===` when narrowing the rows a product read returned, which made five of this route's
    // operations answer `skuNotFound` for a SKU that exists.
    const world = makeSkuWorld();
    const bed = await openEntrypoint();

    // The two READS are answered the way the database answers them - folding the key - because
    // `SwProduct.productID` is compared by MySQL under its own collation and not in this process. The
    // narrowing of the returned rows to one SKU is what happens in process, and that is the subject.
    vi.spyOn(MysqlProductRepository.prototype, 'getProductByProductID').mockImplementation(
      (productID: string): Promise<ResolvedProduct | undefined> =>
        Promise.resolve(
          productID.toLowerCase() === world.product.getProductID().toLowerCase()
            ? world.product
            : undefined,
        ),
    );
    vi.spyOn(MysqlSkuRepository.prototype, 'getProductSkus').mockResolvedValue([world.sku]);
    installPriceGroupService(makePriceGroupServiceDouble());

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'getPriceByCurrencyCode',
          sku: {
            productID: world.product.getProductID().toUpperCase(),
            skuID: world.sku.getSkuID().toUpperCase(),
          },
          currencyCode: SECONDARY_CURRENCY_CODE,
        }),
      }),
      makeLambdaContext(),
    );
    const envelope = readSuccessEnvelope(response);

    // RESOLVED, not `skuNotFound`: the outcome is a currency answer about the SKU that was named.
    expect(response.statusCode).toBe(200);
    expect(envelope.result['outcome']).toBe('currencyPrice');
  });

  it('serves a CURRENCY operation end to end for the authenticated caller', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    const bed = await openEntrypoint();

    installEntityReads(world, graph.childPriceGroup, rate);
    installPriceGroupService(makePriceGroupServiceDouble());

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'getPriceByCurrencyCode',
          sku: world.identity,
          currencyCode: SECONDARY_CURRENCY_CODE,
        }),
      }),
      makeLambdaContext(),
    );
    const envelope = readSuccessEnvelope(response);

    expect(response.statusCode).toBe(200);
    expect(bed.root.scopeInputs[0]).toStrictEqual({ accountID: ACCOUNT_ID });
    expect(envelope.operation).toBe('getPriceByCurrencyCode');
    expect(envelope.result['outcome']).toBe('currencyPrice');

    const served = requireDefined(
      bed.emitted.lines.find((line): boolean => line.message === 'price resolution request served'),
      'the success log line',
    );
    expect(served.context['accountEstablished']).toBe(true);
  });

  it('crosses the entrypoint for every published operation', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    // Every request body the schema admits, one per arm of the discriminated union. Typed as the
    // published request, so an arm added to the subject makes this list fail to compile rather than
    // quietly leaving an operation undriven.
    const requests: readonly PriceResolutionRequest[] = [
      {
        operation: 'getRateForProductTypeBasedOnPriceGroup',
        productTypeID: world.productType.getProductTypeID(),
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
      {
        operation: 'getRateForProductBasedOnPriceGroup',
        productID: world.product.getProductID(),
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.childPriceGroup.getPriceGroupID(),
      },
      {
        operation: 'calculateSkuPriceBasedOnPriceGroupRate',
        sku: world.identity,
        priceGroupRateID: rate.getPriceGroupRateID(),
      },
      { operation: 'calculateSkuPriceBasedOnCurrentAccount', sku: world.identity },
      {
        operation: 'calculateSkuPriceBasedOnAccount',
        sku: world.identity,
        accountID: ACCOUNT_ID,
      },
      {
        operation: 'getBestPriceGroupDetailsBasedOnSkuAndAccount',
        sku: world.identity,
        accountID: ACCOUNT_ID,
      },
      {
        operation: 'getPriceByCurrencyCode',
        sku: world.identity,
        currencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        operation: 'getListPriceByCurrencyCode',
        sku: world.identity,
        currencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        operation: 'getRenewalPriceByCurrencyCode',
        sku: world.identity,
        currencyCode: SECONDARY_CURRENCY_CODE,
      },
      {
        operation: 'convertCurrency',
        amount: '19.99',
        originalCurrencyCode: SECONDARY_CURRENCY_CODE,
        convertToCurrencyCode: INELIGIBLE_CURRENCY_CODE,
      },
    ];

    // The union's own arm count, read from the published operation type rather than hard-coded, so
    // "thirteen" cannot drift from the subject.
    const published: readonly PriceResolutionOperation[] = requests.map(
      (request): PriceResolutionOperation => request.operation,
    );
    expect(new Set(published).size).toBe(requests.length);

    for (const request of requests) {
      const bed = await openEntrypoint();

      installEntityReads(world, graph.childPriceGroup, rate);
      installPriceGroupService(
        makePriceGroupServiceDouble({ bestPriceGroup: graph.childPriceGroup, rateForSku: rate }),
      );

      const response = await bed.invoke(
        makeProxyEvent({ body: bodyOf(request), authorizer: { accountID: ACCOUNT_ID } }),
        makeLambdaContext(),
      );
      const envelope = readSuccessEnvelope(response);

      // Each one CROSSES the entrypoint: 200, the operation echoed, one scope opened, and an outcome
      // the dispatcher decided. What each outcome MEANS is owned by the dispatcher-driven sections
      // above; what is asserted here is that the entrypoint reaches the dispatcher at all, which is
      // the closure the review found missing.
      expect(response.statusCode).toBe(200);
      expect(envelope.operation).toBe(request.operation);
      expect(typeof envelope.result['outcome']).toBe('string');
      expect(bed.root.scopeInputs).toHaveLength(1);
      vi.restoreAllMocks();
    }
  });

  it('answers a FAILING service on a valid route with the generic 500 and discloses nothing', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    const bed = await openEntrypoint();

    installEntityReads(world, graph.childPriceGroup, rate);
    installPriceGroupService(
      makePriceGroupServiceDouble({
        bestPriceGroup: graph.childPriceGroup,
        failing: {
          member: 'calculateSkuPriceBasedOnAccount',
          // A failure carrying everything a leak would expose: statement text, a bound value, a file
          // path and a stack. None of it may reach the response body.
          thrown: new Error(
            `SELECT price FROM SwSku WHERE skuID = ? -- bound ${PLANTED_INTERNAL_DETAIL} ` +
              'at /var/task/src/repositories/mysql/mysqlSkuRepository.cjs:1:1',
          ),
        },
      }),
    );

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'calculateSkuPriceBasedOnAccount',
          sku: world.identity,
          accountID: ACCOUNT_ID,
        }),
        authorizer: { accountID: ACCOUNT_ID },
      }),
      makeLambdaContext(),
    );
    const envelope = readErrorEnvelope(response);

    // ★ A VALID ROUTE THAT FAILED INSIDE, which is the arm no case could reach before this seam
    // existed. The status is 500, the sentence is the generic one, and the correlation token is the
    // only thing a caller can use to ask an operator what happened.
    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('unrecognized');
    expect(envelope.message).toBe(GENERIC_FAILURE_MESSAGE);
    expect(envelope.requestId).toBe(REQUEST_ID);
    // Nothing about the failure crosses into the body: not the statement, not the bound value, not the
    // path, not the stack, not the class name.
    expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
    expect(response.body).not.toContain('SwSku');
    expect(response.body).not.toContain('SELECT');
    expect(response.body).not.toContain('mysqlSkuRepository');
    expect(response.body).not.toContain('at /var/task');
    expect(response.body).not.toContain(ACCOUNT_ID);

    // And the OPERATOR's side carries the route, so the diagnostic is actionable.
    const failure = requireDefined(
      bed.emitted.lines.find((line): boolean => line.level === 'error'),
      'the failure log line',
    );
    expect(failure.context['route']).toBe('POST /prices/resolution');
    expect(failure.context['requestId']).toBe(REQUEST_ID);
  });

  it('issues NO statement of its own on the valid path, and opens no pool', async () => {
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures();
    const rate = requireDefined(
      graph.childPriceGroup.getPriceGroupRates()[0],
      'a rate on the child price group',
    );
    const bed = await openEntrypoint();

    // Recorded BEFORE the request: whatever tier one issued while the graph was assembled is not this
    // request's doing, and the delta is what the assertion below is about.
    const afterBoot = bed.executor.statements.length;

    installEntityReads(world, graph.childPriceGroup, rate);
    installPriceGroupService(makePriceGroupServiceDouble());

    const response = await bed.invoke(
      makeProxyEvent({
        body: bodyOf({
          operation: 'getListPriceByCurrencyCode',
          sku: world.identity,
          currencyCode: SECONDARY_CURRENCY_CODE,
        }),
      }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    // NO STATEMENT FOR THE WHOLE REQUEST. Address-zone state is promotion-scoped, and every entity
    // read plus each price-group member is answered through the injected seams above. Any statement
    // here would therefore be one this capability issued on its own.
    const requestStatements = bed.executor.statements.slice(afterBoot);
    expect(requestStatements).toEqual([]);
    // No pool exists to open either: the executor was injected, so `getPreparedStatementExecutor()` is
    // never reached, no socket is created and no `DB_*` variable is read from the process environment.
    expect(bed.executor.statements.filter((sql): boolean => sql.includes('SwSku'))).toEqual([]);
  });
});
