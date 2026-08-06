/**
 * `src/handlers/promotionApplicationHandler.ts` - the promotion-application Lambda entrypoint.
 *
 * ★★★ WHAT THIS SUITE OWNS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It owns the HANDLER SEAM and nothing beyond it: the request envelope, the wire order document and
 * its refusals, the account trust boundary, the delegation to ONE composed operation on ONE request
 * scope, the serialisation of the intents that come back, and the response shaping and error mapping
 * on the way out. Every case below drives the SHIPPED `createPromotionApplicationHandler` over
 * hand-written doubles of the composition root and the request scope.
 *
 * ★★ IT NO LONGER RE-DERIVES THE ENGINE, AND THE REMOVAL IS THE POINT. An earlier revision of this
 * file carried suite-local replicas of both order passes - `runPriceGroupPass`, `runPromotionPass`,
 * `makeComposedPricingOperation` with an `ordering` switch, and a written-out `getDiscountAmount`
 * contract - and asserted the pass ORDERING, the REVERSAL consequence, the non-vacuous price
 * difference, the order-type gates, the five order-dependence vectors and the reference money
 * calculation against those replicas. A code review raised it as assertion-on-a-double, and the
 * demonstration was concrete rather than theoretical: `src/services/promotion/overUseStripping.ts`
 * changed BEHAVIOUR in the same commit range - bracket indexing became `structGet(...)` and `===`
 * became `cfEquals(...)`, adopting CFML case-insensitive semantics - while this file published a case
 * claiming to cover exactly that vector and was structurally incapable of observing the change. A
 * replica and the module it copies can never disagree, so a case that asserts the replica cannot
 * fail; coverage was CLAIMED rather than obtained.
 *
 * WHERE THAT COVERAGE ACTUALLY LIVES, verified rather than assumed:
 *   - the price-group-pass-BEFORE-promotion-pass ordering, against the REAL composition root:
 *     `tests/unit/handlers/bootstrap.test.ts`, `describe('updateOrderAmountsWithPriceGroupsThenPromotions')`;
 *   - that REVERSING the two passes changes the money, against the REAL services:
 *     `tests/unit/services/promotionService.test.ts`, `'★★★ REVERSING the two passes produces a
 *     DIFFERENT discount'`, which measures 3.01 forward against 4.01 reversed;
 *   - the [model/service/PromotionService.cfc:L241-L252] discriminator and its correction term:
 *     `tests/unit/services/promotionService.test.ts` and `tests/unit/services/priceGroupService.test.ts`;
 *   - the five order-dependence vectors: `tests/unit/services/promotion/twoPassRewardIterator.test.ts`,
 *     `overUseStripping.test.ts`, `rewardUsageLedger.test.ts`, `discountAmount.test.ts`,
 *     `promotionApplication.test.ts`;
 *   - the `issue_1766` return/exchange no-op regression and the order-type gates:
 *     `tests/unit/services/promotionService.test.ts`;
 *   - the reference calculation (19.99 × 3 less 12.5 percent presenting as `'52.47'`):
 *     `tests/unit/services/promotion/discountAmount.test.ts` and
 *     `tests/unit/domain/valueObjects/money.test.ts`.
 * Each of those drives production code. This file defers to them by name instead of shadowing them,
 * and what it keeps is the handler-tier consequence: that the composed operation is reached exactly
 * once, that whatever it decided is serialised faithfully, and that neither individual pass is
 * reachable from here at all.
 *
 * ★ THE COMPOSED OPERATION IS PROGRAMMED WITH DATA, NEVER COMPUTED. The double below returns the
 * intents a case hands it and records the order view it was given. That is the honest shape for a
 * handler double: it makes the DELEGATION and the SERIALISATION observable without pretending to
 * decide anything, and a case that asserts a discount amount is asserting that the handler rendered
 * the amount it was given rather than that an engine computed it correctly.
 *
 * ---------------------------------------------------------------------------
 * COVERAGE PROVENANCE: NET-NEW, IN FULL.
 *
 * `meta/tests/` contains no handler-tier test of any kind - the legacy has no handler tier to test -
 * and only three legacy files touch the in-scope slice at all, one of which
 * (`meta/tests/functional/admin/entity/ProductTest.cfc`) is an empty stub. Nothing in this file is
 * legacy-extended and nothing here is presented as parity. AAP 0.6.6 requires that distinction be
 * stated rather than blurred, and `tests/traceability/legacyTestMap.ts` records it machine-readably.
 * The `issue_<ticket#>` regression convention borrowed from [meta/tests/unit/IssuesTest.cfc] is used
 * by the SERVICES suite that owns the preserved no-op, not here.
 *
 * ---------------------------------------------------------------------------
 * THE SIBLING SUITES IN THIS FOLDER, STATED CORRECTLY.
 *
 * `tests/unit/handlers/` carries eight suites: the five capability entrypoints plus
 * `bootstrap.test.ts`, `bootstrapStatements.test.ts` and `errorMapper.test.ts`. Only `router.ts` has
 * no dedicated suite; it is frozen route data plus one pure function, and every one of the five
 * capability suites exercises it transitively. An earlier note in this folder asserted that
 * bootstrap, router and error mapping had no separate suites - that premise was false and is not
 * repeated here.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE CONTAINS NONE OF.
 *
 *   - No mocking library. `vi` is vitest itself and is used for one thing: `vi.restoreAllMocks()` in
 *     the local `afterEach`. There is no `vi.mock`, no `vi.doMock`, no `vi.resetModules`, no
 *     `vi.stubEnv`, no `vi.stubGlobal`, no module patching and no global stream replacement - the
 *     logger is redirected through its own published `withSink` seam.
 *   - No credential-shaped value, no host name, no network address, no data-source string. Nothing
 *     reads `process.env`, so the suite passes under a completely empty environment, which is the
 *     guarantee `tests/setup.ts` states for this tier.
 *   - No `any`, no `as` type assertion, no non-null assertion and no type-checker suppression
 *     directive. Every withheld collaborator is a getter typed by indexed access off the shipped
 *     surface and returning `never`, which is what makes a nominal service class satisfiable without
 *     a cast.
 *   - No shared mutable module state. Every double, recorder, logger and fixture is built inside the
 *     case that uses it.
 *   - No new interface reshaping, visibility widening or deliberate divergence. The `void`-to-intents
 *     reshaping of `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58] is
 *     ALREADY ALLOCATED to the services tier; this suite consumes it and claims no slot of its own.
 * ---------------------------------------------------------------------------
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_DOCUMENT_LIMITS,
  OrderViewAdmissionError,
  admitMaterializedOrderView,
  createPromotionApplicationHandler,
  handler as productionHandler,
} from '../../../src/handlers/promotionApplicationHandler.js';
// A namespace import alongside the named ones, for the single assertion a named import cannot
// express: that the module's runtime export set is exactly what it publishes and carries no default.
import * as promotionApplicationHandlerModule from '../../../src/handlers/promotionApplicationHandler.js';
// The caller-shaped hydration refusal the composition root raises, and the SECOND class this
// handler's catch chain recognizes. Imported so the cases below construct the shipped error rather
// than imitating it - the recognition is `instanceof`, so an imitation would prove nothing.
import { OrderViewDocumentDataError } from '../../../src/handlers/bootstrap.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listLen } from '../../../src/lib/cfml/list.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
import { logger } from '../../../src/lib/logger.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type {
  CompositionRoot,
  OrderPricingResult,
  OrderViewDocument,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import type {
  ApplyPromotionsRequest,
  PromotionApplicationDependencies,
  PromotionApplicationResultDocument,
} from '../../../src/handlers/promotionApplicationHandler.js';
import type { PromotionAppliedIntentDocument } from '../../../src/handlers/promotionApplicationHandler.js';
import type { PromotionAppliedType } from '../../../src/domain/entities/promotionApplied.js';
import type { PromotionAppliedIntent } from '../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type { SalePriceDetail } from '../../../src/domain/ports/promotionRepository.js';
import type { AppliedPromotionView } from '../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import type { LogSink, Logger } from '../../../src/lib/logger.js';
import type { PriceGroupAppliedIntent } from '../../../src/services/priceGroupService.js';

// ===========================================================================
// SECTION 1 - SUITE-LOCAL TYPED DOUBLES AND SENTINELS
// ===========================================================================

/**
 * One applied-promotion intent, reached STRUCTURALLY off the shipped result type.
 *
 * `src/domain/promotionEngine/qualifiedDiscountTypes.ts` owns the union, and this is exactly the
 * indexed access the handler itself uses to reach it, so no module edge is added here.
 */
type PromotionIntent = OrderPricingResult['promotionIntents'][number];

/**
 * Raised when the handler reaches a collaborator this capability has no business touching.
 *
 * ★ THIS IS AN ASSERTION, NOT A PLACEHOLDER. Every withheld member of the composition root and of
 * the request scope is a getter that calls {@link refuse}, so "the handler never touches the
 * price-resolution surface", "it never calls either individual order pass" and "it never reads the
 * process configuration" are enforced by the doubles themselves rather than by a reviewer's eye.
 */
class WithheldCollaboratorError extends Error {
  public readonly member: string;

  public constructor(member: string) {
    super(
      `The promotion-application handler reached ${member}, which this capability does not use. ` +
        'Order pricing goes through the ONE composed operation ' +
        'updateOrderAmountsWithPriceGroupsThenPromotions and through nothing else.',
    );
    this.name = 'WithheldCollaboratorError';
    this.member = member;
  }
}

/**
 * Refuse a withheld collaborator, and type the refusal as `never`.
 *
 * `never` is assignable to every type, which is what lets a throwing getter satisfy a member typed to
 * a NOMINAL service class whose module is outside this file's dependency set - with no cast, no
 * unsafe type, no suppression directive and no non-null assertion.
 */
function refuse(member: string): never {
  throw new WithheldCollaboratorError(member);
}

/** Require a fixture or recorded value that a preceding action must have produced. */
function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new TypeError(`${description} was not produced`);
  }

  return value;
}

/** The ordered invocation log's labels. */
const ROOT_OPENED = 'compositionRoot.open';
const SCOPE_OPENED = 'createRequestScope';
const ORDER_ADMITTED = 'admitOrderView';
const ORDER_MATERIALIZED = 'materializeOrderView';
const SALE_PRICE_RESOLVED = 'getSalePriceDetailsForProductSkus';

/** The ONE composed operation - `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions`. */
const COMPOSED_PRICING = 'updateOrderAmountsWithPriceGroupsThenPromotions';

/** The single instant every date in this suite resolves against. Explicit UTC ISO-8601. */
const EVALUATED_AT = '2024-06-01T12:00:00.000Z';

/** Invented, non-sensitive sentinels. Nothing here resembles a credential or a connection value. */
const PLATFORM_REQUEST_ID = 'req-promotion-application-0001';

const PRODUCT_ID = 'prod-golden-0001';
const SALE_PRICE_SKU_ID = 'sku-golden-0001';
const SALE_PRICE_PROMOTION_ID = 'promo-sale-price-0001';
const PROMOTION_ID = 'promo-applied-0001';

/**
 * The account an authorizer establishes, and a DIFFERENT one a caller might name.
 *
 * Two opaque identifiers and nothing more: no name, no email address and nothing else a person could
 * be identified by. The pair exists because the trust-boundary cases have to be able to state
 * "account A is authenticated and the caller named account B", which one identifier cannot express.
 */
const AUTHENTICATED_ACCOUNT_ID = 'acct-authenticated-0001';
const OTHER_ACCOUNT_ID = 'acct-someone-else-0002';

/** The route this capability answers on, taken from the shipped frozen table rather than retyped. */
const CAPABILITY_ROUTE = ROUTE_TABLE.promotionApplication;

/** Everything one test wants to observe about how the handler drove its graph. */
interface PricingRecorder {
  /** Labels in invocation order. */
  readonly log: string[];
  /** Every `RequestScopeInput` the handler opened a scope with. */
  readonly scopeInputs: RequestScopeInput[];
  /** Every order view handed to the composed operation. */
  readonly composedInputs: OrderView[];
  /** Every decoded request an INJECTED admission was handed. */
  readonly admissionRequests: ApplyPromotionsRequest[];
  /** Every wire document the scope's materializer was handed. */
  readonly materializedDocuments: OrderViewDocument[];
  /** Every product identifier the sale-price operation was asked for. */
  readonly salePriceRequests: string[];
}

/** A fresh recorder. Arrays are read back after the invocation; nothing is shared between tests. */
function makeRecorder(): PricingRecorder {
  return {
    log: [],
    scopeInputs: [],
    composedInputs: [],
    admissionRequests: [],
    materializedDocuments: [],
    salePriceRequests: [],
  };
}

/**
 * A recording logger built from the REAL module logger through its published sink seam.
 *
 * The shipped logger is used rather than a hand-written stand-in precisely because its mandatory,
 * non-disableable redaction list is part of what the safety cases prove is live. That list is
 * enumerated in `src/lib/logger.ts`, which is its single source of truth - it is deliberately NOT
 * transcribed here, so this file contains no credential-shaped literal of any kind. The level is
 * PINNED so filtering cannot depend on an ambient variable, and the sink replaces stdout so the
 * console is never globally silenced and never polluted.
 */
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

interface RecordingLogger {
  readonly logger: Logger;
  /** Raw emitted lines, asserted as text so nothing can leak inside a field nobody inspected. */
  readonly lines: readonly string[];
}

function makeRecordingLogger(): RecordingLogger {
  const lines: string[] = [];
  const sink: LogSink = (line: string): void => {
    lines.push(line);
  };

  return { logger: logger.withSink(sink).withLevel('debug'), lines };
}

// ===========================================================================
// SECTION 2 - THE COMPOSED PRICING OPERATION, PROGRAMMED WITH DATA
// ===========================================================================

/**
 * What the composed operation is programmed to return, or to fail with.
 *
 * DATA, NOT AN ALGORITHM. Both intent arrays are supplied by the case, so a case that reads a
 * discount out of a response body is asserting that the handler RENDERED what the engine decided -
 * which is the handler's job - rather than that the engine decided correctly, which is the services
 * tier's job and is covered there.
 */
interface ProgrammedPricing {
  readonly priceGroupIntents: readonly PriceGroupAppliedIntent[];
  readonly promotionIntents: readonly PromotionIntent[];
  /** A failure to raise INSTEAD of pricing, for the error-mapping cases. */
  readonly failure: Error | undefined;
}

/**
 * `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions`, as a recording double.
 *
 * It records the order view it was handed - which is what makes "the handler forwarded exactly what
 * the admission produced, unsorted and unfiltered" checkable - and hands back the programmed intents.
 * `pricedOrder` is the view it received, because the shipped member publishes the view pass two
 * consumed and this double consumes exactly what it was given.
 *
 * ★ ONE MEMBER, AND NO WAY TO REACH EITHER PASS THROUGH IT. There is no `ordering`, `sequence`,
 * `phase` or `runAfter` parameter here, and there is none on the shipped member either: the two
 * passes are composed inside a module-private function in `src/handlers/bootstrap.ts`, which
 * withholds both individual passes from `RequestScope` behind `Omit<>` capability types. A suite
 * cannot invert an order the type system does not expose, and it should not pretend to.
 */
function makeComposedPricingOperation(
  programmed: ProgrammedPricing,
  recorder: PricingRecorder,
): (order: OrderView) => Promise<OrderPricingResult> {
  return (order: OrderView): Promise<OrderPricingResult> => {
    recorder.log.push(COMPOSED_PRICING);
    recorder.composedInputs.push(order);

    if (programmed.failure !== undefined) {
      return Promise.reject(programmed.failure);
    }

    return Promise.resolve({
      priceGroupIntents: [...programmed.priceGroupIntents],
      promotionIntents: [...programmed.promotionIntents],
      pricedOrder: order,
    });
  };
}

// ===========================================================================
// SECTION 3 - THE REQUEST SCOPE AND COMPOSITION ROOT DOUBLES
// ===========================================================================

/** Everything the request-scope double needs to answer this capability, and nothing more. */
interface ScopeConfiguration {
  readonly now: Date;
  readonly pricing: ProgrammedPricing;
  readonly salePriceDetails: Record<string, SalePriceDetail>;
  /** What `materializeOrderView` hands back, when a case drives the wire path. */
  readonly materialized: OrderView | undefined;
  /** A hydration failure to raise instead, for the refusal cases. */
  readonly materializationFailure: Error | undefined;
}

/**
 * A `RequestScope` double.
 *
 * ★ EVERY MEMBER THIS CAPABILITY MUST NOT REACH IS A THROWING GETTER. Five of them -
 * `roundingRuleService`, `brandService`, `optionService`, `skuService`, `productService` - are typed
 * to CONCRETE service classes carrying `private` members, so no object literal could supply them; a
 * getter declared `RequestScope['roundingRuleService']` and returning `never` satisfies the compiler
 * with no cast. The other four are reachable in principle and withheld on purpose:
 *
 *   `priceGroupService` and `promotionService` are the NARROWED capabilities. Neither even declares
 *   an order pass, so the withheld passes cannot be called in the wrong order by code that compiles -
 *   and these getters additionally prove the handler calls no QUERY member either.
 *
 *   `currentAccountContext` is the explicit replacement for `getHibachiScope()` /
 *   `getSlatwallScope()`. The handler threads the account identifier through `RequestScopeInput` and
 *   never reads an ambient scope, so touching this member would be the ambient-state regression the
 *   port exists to prevent.
 *
 *   `currencyConverter` and `productFeedPort` belong to other capabilities.
 */
function makeRequestScopeDouble(
  config: ScopeConfiguration,
  recorder: PricingRecorder,
): RequestScope {
  const composed = makeComposedPricingOperation(config.pricing, recorder);

  return {
    // A FRESH `Date` on every read, carrying the one instant this request bound - the same contract
    // the shipped scope documents, so a caller mutating what it read moves nothing.
    get now(): Date {
      return new Date(config.now.getTime());
    },

    get currentAccountContext(): RequestScope['currentAccountContext'] {
      return refuse('RequestScope.currentAccountContext');
    },
    get entityLoaders(): RequestScope['entityLoaders'] {
      return refuse('RequestScope.entityLoaders');
    },
    // The promotion pass names no price group of its own - the price-group pass that precedes it
    // resolves them from the order - so an entitlement decision has nothing to decide here.
    get priceGroupEntitlements(): RequestScope['priceGroupEntitlements'] {
      return refuse('RequestScope.priceGroupEntitlements');
    },
    get roundingRuleService(): RequestScope['roundingRuleService'] {
      return refuse('RequestScope.roundingRuleService');
    },
    get brandService(): RequestScope['brandService'] {
      return refuse('RequestScope.brandService');
    },
    get optionService(): RequestScope['optionService'] {
      return refuse('RequestScope.optionService');
    },
    get skuService(): RequestScope['skuService'] {
      return refuse('RequestScope.skuService');
    },
    get productService(): RequestScope['productService'] {
      return refuse('RequestScope.productService');
    },
    get priceGroupService(): RequestScope['priceGroupService'] {
      return refuse('RequestScope.priceGroupService');
    },
    get promotionService(): RequestScope['promotionService'] {
      return refuse('RequestScope.promotionService');
    },
    get currencyConverter(): RequestScope['currencyConverter'] {
      return refuse('RequestScope.currencyConverter');
    },
    get productFeedPort(): RequestScope['productFeedPort'] {
      return refuse('RequestScope.productFeedPort');
    },
    // The AAP 0.4.2 argument of `generateProductFeed`, published beside the port it is passed to.
    // Refused here for the same reason the port is: the feed is a different capability.
    get feedCriteria(): RequestScope['feedCriteria'] {
      return refuse('RequestScope.feedCriteria');
    },

    /**
     * The hydration member the WIRE admission reaches.
     *
     * It records the document it was handed - which is how "the schema's output is what the
     * repositories tier receives" becomes checkable - and hands back the view the case programmed.
     * The REAL hydration, over the wired repositories and a recording statement executor, is asserted
     * where it lives, in `tests/unit/handlers/bootstrap.test.ts`; substituting it here is what keeps
     * this a handler unit suite with no database and no product graph to build.
     */
    materializeOrderView: (document: OrderViewDocument): Promise<OrderView> => {
      recorder.log.push(ORDER_MATERIALIZED);
      recorder.materializedDocuments.push(document);

      if (config.materializationFailure !== undefined) {
        return Promise.reject(config.materializationFailure);
      }

      if (config.materialized === undefined) {
        return Promise.reject(
          new TypeError('the harness was not given an order view to materialize'),
        );
      }

      return Promise.resolve(config.materialized);
    },

    // [model/service/PromotionService.cfc:L1022] - the one other already-ported service method this
    // adapter reaches. Its input is a plain string, so there is nothing to materialise.
    getSalePriceDetailsForProductSkus: (
      productID: string,
    ): Promise<Record<string, SalePriceDetail>> => {
      recorder.log.push(SALE_PRICE_RESOLVED);
      recorder.salePriceRequests.push(productID);

      return Promise.resolve(config.salePriceDetails);
    },

    updateOrderAmountsWithPriceGroupsThenPromotions: composed,

    // The composed operation owns zone preparation. If the handler reaches this
    // member directly, the test double refuses and the case fails.
    prepareAddressZoneEvaluation: (): Promise<void> =>
      refuse('RequestScope.prepareAddressZoneEvaluation'),
  };
}

/**
 * A `CompositionRoot` double.
 *
 * `diagnostics`, `dialect`, `settingsProvider`, `integration` and `createInspectableRequestScope` are
 * all withheld through {@link refuse}: an order-pricing invocation reads no process configuration, no
 * dialect, no setting, no integration adapter and no assembled adapter, and the double is what proves
 * it. `diagnostics` matters most - it is the REDACTED replacement for a member that once exposed a
 * database credential as a readable `string`, and this capability has no business reading it.
 */
function makeCompositionRootDouble(
  config: ScopeConfiguration,
  recorder: PricingRecorder,
): CompositionRoot {
  return {
    get diagnostics(): CompositionRoot['diagnostics'] {
      return refuse('CompositionRoot.diagnostics');
    },
    get dialect(): CompositionRoot['dialect'] {
      return refuse('CompositionRoot.dialect');
    },
    get settingsProvider(): CompositionRoot['settingsProvider'] {
      return refuse('CompositionRoot.settingsProvider');
    },
    get integration(): CompositionRoot['integration'] {
      return refuse('CompositionRoot.integration');
    },

    createRequestScope: (scopeInput?: RequestScopeInput): Promise<RequestScope> => {
      recorder.log.push(SCOPE_OPENED);

      if (scopeInput !== undefined) {
        recorder.scopeInputs.push(scopeInput);
      }

      return Promise.resolve(makeRequestScopeDouble(config, recorder));
    },

    createInspectableRequestScope: (): Promise<never> =>
      refuse('CompositionRoot.createInspectableRequestScope'),
  };
}

// ===========================================================================
// SECTION 4 - THE PLATFORM EVENT, THE DOCUMENTS, AND THE HARNESS
// ===========================================================================

/**
 * A complete API Gateway proxy event, version 1.0 payload.
 *
 * Written out in full rather than narrowed, because the handler's parameter type is the platform's own
 * and a partial literal would not compile. Every value is an invented, non-sensitive sentinel: there
 * is no credential, no account name, no host name, no network address a reader could mistake for
 * real, and every caller-identity field the platform permits to be null IS null.
 */
function makeProxyEvent(overrides: {
  readonly httpMethod?: string;
  readonly path?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestId?: string;
  /**
   * The authorizer context, which is the ONLY part of this event a caller cannot author.
   *
   * Three states, all reachable and all meaningful:
   *   * OMITTED - the suite default: an authenticated session for {@link AUTHENTICATED_ACCOUNT_ID},
   *     which is the account {@link makeGoldenOrder} names. That is the ORDINARY request, so it is
   *     what a case gets when it is testing something other than the account.
   *   * `null` - no authorizer context at all, i.e. an ANONYMOUS request.
   *   * an object - whatever claims the case wants, including a differently-cased claim name, a blank
   *     identifier or a non-string one.
   */
  readonly authorizer?: Readonly<Record<string, unknown>> | null;
}): APIGatewayProxyEvent {
  return {
    body: overrides.body === undefined ? null : overrides.body,
    headers: { 'content-type': 'application/json' },
    multiValueHeaders: { 'content-type': ['application/json'] },
    httpMethod: overrides.httpMethod ?? CAPABILITY_ROUTE.methods,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
    path: overrides.path ?? CAPABILITY_ROUTE.path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: overrides.path ?? CAPABILITY_ROUTE.path,
    requestContext: {
      accountId: 'fixture-account-id',
      apiId: 'fixture-api-id',
      // THE TRUST BOUNDARY, AND THE ONLY PART OF THIS EVENT AN API GATEWAY CALLER CANNOT AUTHOR.
      // An omitted override is the AUTHENTICATED session; an explicit `null` is the anonymous request.
      authorizer:
        overrides.authorizer === undefined
          ? authorizerFor(AUTHENTICATED_ACCOUNT_ID)
          : overrides.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod: overrides.httpMethod ?? CAPABILITY_ROUTE.methods,
      // JUDGMENT CALL: every member of `identity` below is REQUIRED by `@types/aws-lambda`'s
      // `APIGatewayEventIdentity` and none is optional, so the two credential-NAMED members must be
      // written for this literal to type-check. Both are `null`, and nothing in this file assigns
      // either of them a value - they are the platform's own event shape, not this suite's data.
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
      path: overrides.path ?? CAPABILITY_ROUTE.path,
      stage: 'fixture',
      requestId: overrides.requestId ?? PLATFORM_REQUEST_ID,
      requestTimeEpoch: new Date(EVALUATED_AT).getTime(),
      resourceId: 'fixture-resource-id',
      resourcePath: overrides.path ?? CAPABILITY_ROUTE.path,
    },
  };
}

/**
 * An authorizer context establishing one TRUSTED SERVICE caller, under the claim names the handler
 * reads.
 *
 * ★★★ IT CARRIES THE ADMINISTRATIVE CLAIM NOW, AND THAT IS SEC-I. This used to return `{ accountID }`
 * alone, which is exactly the caller the finding is about: the route admitted ANY identified account,
 * so a customer could submit a wholly caller-authored economic document - its own prices, its own
 * extended prices, its own subtotals, and the `promotionAppliedID` of any applied-promotion row it
 * cared to name, each of which becomes a REMOVE intent. The route is now restricted to a trusted
 * service principal, the strangler-fig stand-in for the in-process `OrderService` caller
 * [model/service/OrderService.cfc:L60-L61].
 *
 * Every case in this suite that is about something OTHER than the gate therefore needs a caller the
 * route serves, and gets one here. The gate itself is asserted explicitly by the cases that use
 * {@link untrustedAuthorizerFor}, and by the admission block that walks the whole claim vocabulary.
 */
function authorizerFor(accountID: string): Readonly<Record<string, unknown>> {
  return { accountID, adminAccountFlag: true };
}

/**
 * An authorizer context establishing an ORDINARY account: identified, and not trusted.
 *
 * This is the caller the route used to serve and now refuses. Kept as its own named helper so a case
 * asserting the refusal reads as a deliberate choice of caller rather than as an omitted member.
 */
function untrustedAuthorizerFor(accountID: string): Readonly<Record<string, unknown>> {
  return { accountID };
}

/** The envelope for `applyPromotions`. `order` is whatever the caller is putting on the wire. */
function applyPromotionsDocument(
  orderMember: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    operation: 'applyPromotions',
    order: orderMember,
    ...extra,
  };
}

/** A POST to the capability route carrying `document` as its JSON body. */
function postDocument(
  document: unknown,
  authorizer?: Readonly<Record<string, unknown>> | null,
): APIGatewayProxyEvent {
  return makeProxyEvent({
    body: JSON.stringify(document),
    ...(authorizer === undefined ? {} : { authorizer }),
  });
}

/** One applied-promotion view, in the shape the wire document carries it. */
function wireAppliedPromotion(applied: AppliedPromotionView): Readonly<Record<string, unknown>> {
  const promotion = applied.promotion;

  return {
    promotionAppliedID: applied.promotionAppliedID,
    // `null`, never `0`: the column is nullable [model/entity/PromotionApplied.cfc:L51] and a zero
    // discount is a different fact from no discount.
    discountAmount:
      applied.discountAmount === undefined ? null : applied.discountAmount.toDecimalString(),
    promotion: promotion === undefined ? null : { promotionID: promotion.promotionID },
  };
}

/**
 * The PERSISTED product handle one order item names on the wire.
 *
 * ★ WHY A HELPER RATHER THAN `product.getProductID()` DIRECTLY. The shared product fixture leaves
 * `productID` EMPTY on purpose - it models an UNSAVED product so that `isNew()` is honest and the four
 * cases inherited from [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] stay expressible -
 * and that default is documented on `makeProductFixture` in `tests/fixtures/productFixtures.ts`. A
 * wire document, by contrast, must name a product the hydration tier can LOAD, so an empty handle is
 * refused by the schema rather than accepted and defaulted.
 *
 * This projection therefore uses the product's own identifier whenever the fixture supplies one, and
 * otherwise derives a DETERMINISTIC persisted-looking handle from the SKU's identifier. Deriving it
 * rather than hard-coding one keeps the projection total: an order of any shape projects, and two
 * items on different SKUs never collide on one product handle.
 */
function wireProductID(item: OrderItemView): string {
  const product = item.sku.getProduct();

  if (product === undefined) {
    throw new TypeError(
      `the fixture sku ${item.sku.getSkuID()} carries no product, so no wire document can name one`,
    );
  }

  const declared = product.getProductID();

  return declared === '' ? `${item.sku.getSkuID()}-product` : declared;
}

/**
 * The order document a caller PUTs on the wire, projected from a materialised fixture.
 *
 * ★★ THIS IS THE SHAPE THE DEPLOYED ROUTE ACTUALLY RECEIVES, and building it from a fixture rather
 * than by hand is deliberate: the projection is total, so a member the schema requires and the fixture
 * carries cannot be forgotten here, and a member RENAMED on the view breaks this function.
 *
 * Note what it does and does not carry. Every monetary value is a decimal STRING, every absence is
 * `null` - JSON has no `undefined` - and each entity is reduced to an IDENTIFIER: `sku` becomes
 * `skuID` plus the `productID` it hangs off, and `appliedPriceGroup` becomes `appliedPriceGroupID`.
 * Nothing about the catalogue travels, which is what stops a caller describing a product type, a
 * brand or an eligibility that would decide a discount in its favour.
 */
function wireOrderDocument(order: OrderView): Readonly<Record<string, unknown>> {
  return {
    orderID: order.orderID,
    orderType: { systemCode: order.orderType.systemCode },
    accountID: order.accountID ?? null,
    promotionCodeList: order.promotionCodeList,
    totalSaleQuantity: order.totalSaleQuantity,
    subtotal: order.subtotal.toDecimalString(),
    subtotalAfterItemDiscounts: order.subtotalAfterItemDiscounts.toDecimalString(),
    fulfillmentChargeAfterDiscountTotal:
      order.fulfillmentChargeAfterDiscountTotal.toDecimalString(),
    currencyCode: order.currencyCode,
    appliedPromotions: order.appliedPromotions.map(wireAppliedPromotion),
    orderItems: order.orderItems.map((item): Readonly<Record<string, unknown>> => {
      const appliedPriceGroup = item.appliedPriceGroup;

      return {
        orderItemID: item.orderItemID,
        productID: wireProductID(item),
        skuID: item.sku.getSkuID(),
        quantity: item.quantity,
        price: item.price.toDecimalString(),
        skuPrice: item.skuPrice.toDecimalString(),
        extendedPrice: item.extendedPrice.toDecimalString(),
        extendedSkuPrice: item.extendedSkuPrice.toDecimalString(),
        appliedPriceGroupID:
          appliedPriceGroup === undefined ? null : appliedPriceGroup.getPriceGroupID(),
        orderItemType: { systemCode: item.orderItemType.systemCode },
        orderFulfillmentID: item.orderFulfillmentID,
        appliedPromotions: item.appliedPromotions.map(wireAppliedPromotion),
      };
    }),
    orderFulfillments: order.orderFulfillments.map(
      (fulfillment): Readonly<Record<string, unknown>> => {
        const shippingMethod = fulfillment.shippingMethod;
        const address = fulfillment.address;

        return {
          orderFulfillmentID: fulfillment.orderFulfillmentID,
          fulfillmentCharge: fulfillment.fulfillmentCharge.toDecimalString(),
          fulfillmentMethod: {
            fulfillmentMethodID: fulfillment.fulfillmentMethod.fulfillmentMethodID,
            fulfillmentMethodType: fulfillment.fulfillmentMethod.fulfillmentMethodType,
          },
          // `null` is a REAL STATE here, not a missing value: the gate at
          // [model/service/PromotionService.cfc:L701] tests `isNull(getShippingMethod())`, so a
          // pickup fulfillment states it.
          shippingMethod:
            shippingMethod === undefined
              ? null
              : { shippingMethodID: shippingMethod.shippingMethodID },
          appliedPromotions: fulfillment.appliedPromotions.map(wireAppliedPromotion),
          totalShippingWeight: fulfillment.totalShippingWeight,
          address:
            address === undefined
              ? null
              : {
                  postalCode: address.postalCode ?? null,
                  city: address.city ?? null,
                  stateCode: address.stateCode ?? null,
                  countryCode: address.countryCode ?? null,
                  isNew: address.isNew,
                },
        };
      },
    ),
  };
}

/**
 * A POST of the `applyPromotions` envelope carrying the real wire document.
 *
 * ★★★ THE ACCOUNT TRAVELS ON THE AUTHORIZER, NOT IN THE BODY (finding F2). The previous revision spread
 * `{accountID: order.accountID}` into the envelope, which is precisely the caller-controlled identity
 * the finding is about; the identifier the order fixture carries is now presented as an authorizer
 * claim, which is where a server establishes one.
 */
function postApplyPromotions(
  order: OrderView,
  extra: Readonly<Record<string, unknown>> = {},
  authorizer?: Readonly<Record<string, unknown>> | null,
): APIGatewayProxyEvent {
  return postDocument(applyPromotionsDocument(wireOrderDocument(order), extra), authorizer);
}

/** A POST of the `applyPromotions` envelope carrying the full WIRE document. */
function postWireOrder(
  order: OrderView,
  extra: Readonly<Record<string, unknown>> = {},
  authorizer?: Readonly<Record<string, unknown>> | null,
): APIGatewayProxyEvent {
  return postDocument(applyPromotionsDocument(wireOrderDocument(order), extra), authorizer);
}

/** How one test configures the whole graph behind the handler. */
interface HarnessOptions {
  readonly now?: Date;
  /** The injected clock. Absent means the handler passes no `now` and the scope binds its own. */
  readonly clock?: () => Date;
  /** What the composed operation is programmed to hand back. */
  readonly promotionIntents?: readonly PromotionIntent[];
  readonly priceGroupIntents?: readonly PriceGroupAppliedIntent[];
  /** A failure the composed operation raises instead of pricing. */
  readonly failure?: Error;
  readonly salePriceDetails?: Record<string, SalePriceDetail>;
  /**
   * Installs an admission that vouches for this MATERIALISED view and records what it was asked.
   *
   * The documented in-process seam: a strangler-fig proxy holding a live aggregate injects its own
   * resolution, and a case that is testing the handler rather than the document uses this so the
   * document is out of the way. When neither this member nor {@link HarnessOptions.refuseAdmission}
   * is supplied, the PRODUCTION (wire) admission runs - which is how every document case below is
   * driven.
   */
  readonly admit?: OrderView;
  /** Installs an admission that REFUSES, so the client-shaped refusal arm is drivable. */
  readonly refuseAdmission?: OrderViewAdmissionError;
  /** What the scope's `materializeOrderView` hands back on the wire path. */
  readonly materialize?: OrderView;
  /** A hydration failure the scope's materializer raises instead. */
  readonly materializationFailure?: Error;
}

/** One handler, one recorder, one recording logger - all fresh, none shared. */
interface Harness {
  readonly recorder: PricingRecorder;
  readonly emitted: RecordingLogger;
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: Context,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Build a handler over suite-local doubles.
 *
 * A FRESH SUBJECT PER CALL, and every collaborator is constructed inside this function - no module
 * state, no shared graph, no memo. `compositionRoot` is a function the handler awaits ONCE per
 * invocation, and the harness records that opening so the delegation cases can prove the memoized
 * production initializer is not being bypassed per request.
 */
function makeHarness(options: HarnessOptions = {}): Harness {
  const recorder = makeRecorder();
  const emitted = makeRecordingLogger();

  const config: ScopeConfiguration = {
    now: options.now ?? new Date(EVALUATED_AT),
    salePriceDetails: options.salePriceDetails ?? {},
    materialized: options.materialize,
    materializationFailure: options.materializationFailure,
    pricing: {
      priceGroupIntents: options.priceGroupIntents ?? [],
      promotionIntents: options.promotionIntents ?? [],
      failure: options.failure,
    },
  };

  const root = makeCompositionRootDouble(config, recorder);
  const admitted = options.admit;
  const refusal = options.refuseAdmission;

  const admitOrderView: PromotionApplicationDependencies['admitOrderView'] =
    admitted === undefined && refusal === undefined
      ? undefined
      : (request: ApplyPromotionsRequest): Promise<OrderView> => {
          recorder.log.push(ORDER_ADMITTED);
          recorder.admissionRequests.push(request);

          // Narrowed to a concrete `Error` before it is rejected with, rather than rejected with a
          // possibly-absent value: an admission that refuses always refuses WITH the shipped
          // `OrderViewAdmissionError`, which is what the handler's catch arm discriminates on.
          if (refusal !== undefined) {
            return Promise.reject(refusal);
          }

          if (admitted === undefined) {
            return Promise.reject(
              new TypeError('the harness installed an admission with nothing to admit'),
            );
          }

          return Promise.resolve(admitted);
        };

  const invoke = createPromotionApplicationHandler({
    compositionRoot: (): Promise<CompositionRoot> => {
      recorder.log.push(ROOT_OPENED);

      return Promise.resolve(root);
    },
    logger: emitted.logger,
    admitOrderView,
    clock: options.clock,
  });

  return { recorder, emitted, invoke };
}

// ===========================================================================
// SECTION 5 - RESPONSE READERS
// ===========================================================================

/** A non-null, non-array object. The only shape the readers below descend into. */
function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An array of JSON objects, narrowed by a genuine predicate.
 *
 * `Array.isArray` alone narrows an `unknown` to `any[]`, and destructuring THAT reintroduces `any`
 * into a file that permits none. This predicate carries the element type through, so the cases that
 * rebuild one member of a projected document stay fully typed.
 */
function isJsonObjectArray(value: unknown): value is readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value) && value.every(isJsonObject);
}

/**
 * The success body, narrowed by a genuine type predicate rather than asserted.
 *
 * The four echoed members are proven present and of the right kind, which is what every case below
 * reads.
 */
function isServedEnvelope(
  value: unknown,
): value is SuccessResponseBody<PromotionApplicationResultDocument> {
  if (
    !isJsonObject(value) ||
    typeof value['requestId'] !== 'string' ||
    typeof value['capability'] !== 'string' ||
    typeof value['action'] !== 'string'
  ) {
    return false;
  }

  const result: unknown = value['result'];

  return (
    isJsonObject(result) &&
    typeof result['operation'] === 'string' &&
    typeof result['evaluatedAt'] === 'string'
  );
}

/** The whole served envelope of a 200 response. Throws rather than returning a half-checked value. */
function servedEnvelopeOf(
  result: APIGatewayProxyResult,
): SuccessResponseBody<PromotionApplicationResultDocument> {
  const body = result.body;
  const parsed: unknown = JSON.parse(body);

  if (!isServedEnvelope(parsed)) {
    throw new TypeError('the response body is not the shared success envelope');
  }

  return parsed;
}

/**
 * This capability's own document, read out of the shared envelope's `result` member.
 *
 * Kept as a separate reader so a case asserting on the DOCUMENT does not have to know it is nested, and
 * a case asserting on the ENVELOPE reaches {@link servedEnvelopeOf} instead.
 */
function successBodyOf(result: APIGatewayProxyResult): PromotionApplicationResultDocument {
  return servedEnvelopeOf(result).result;
}

/** The error envelope, narrowed the same way. */
function isErrorBody(value: unknown): value is ErrorResponseBody {
  if (!isJsonObject(value)) {
    return false;
  }

  const error = value['error'];

  return (
    isJsonObject(error) &&
    typeof error['category'] === 'string' &&
    typeof error['message'] === 'string' &&
    typeof error['requestId'] === 'string'
  );
}

/** The error envelope of a non-200 response. */
function errorBodyOf(result: APIGatewayProxyResult): ErrorResponseBody['error'] {
  const parsed: unknown = JSON.parse(result.body);

  if (!isErrorBody(parsed)) {
    throw new TypeError('the response body is not the documented error envelope');
  }

  return parsed.error;
}

/** The promotion intents a success body carried, or an empty list when it carried none. */
function promotionIntentsOf(body: PromotionApplicationResultDocument): readonly {
  readonly appliedType: string;
  readonly operation: string;
  readonly orderItemID?: string;
  readonly orderID?: string;
  readonly discountAmount?: string;
}[] {
  return body.promotionIntents ?? [];
}

/**
 * The `discountAmount` an intent carried for one order item, as the DECIMAL STRING it crossed the
 * wire as.
 *
 * Returned as a `DecimalString` so every comparison below goes through `cfNumericEquals` and never
 * through string identity: `'12.00'` and `'12'` are the same amount of money and a character
 * comparison would call them different.
 */
function wireDiscountForItem(
  body: PromotionApplicationResultDocument,
  orderItemID: string,
): DecimalString {
  const intent = promotionIntentsOf(body).find(
    (candidate): boolean => candidate.orderItemID === orderItemID,
  );

  if (intent === undefined || intent.discountAmount === undefined) {
    throw new TypeError(`no applied-promotion intent carried a discount for ${orderItemID}`);
  }

  return Money.fromDecimalString(intent.discountAmount).toDecimalString();
}

/** Assert two monetary decimal strings are the SAME AMOUNT, by value. */
function expectSameAmount(actual: string, expected: string): void {
  expect(
    cfNumericEquals(actual, expected),
    `expected ${actual} to be the same amount of money as ${expected}`,
  ).toBe(true);
}

/** The field paths a client-shaped refusal published, or an empty list. */
function fieldPathsOf(result: APIGatewayProxyResult): readonly string[] {
  return (errorBodyOf(result).fields ?? []).map((field): string => field.path);
}

// Complementary to the global `afterEach` in `tests/setup.ts`, which already restores spies and the
// real clock. Kept here deliberately: a suite that installs its own spy must not depend on a sibling
// file's hook still being registered, and `vitest.config.ts` sets `restoreMocks` as a third belt.
afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// SECTION 6 - FIXTURE HELPERS
// ===========================================================================

/** The fixture's own overrides and capture shapes, reached structurally - neither is exported. */
type OrderViewFixtureOverridesRef = NonNullable<Parameters<typeof makeOrderViewFixture>[0]>;
type OrderViewCaptureRef = NonNullable<OrderViewFixtureOverridesRef['capture']>;

/**
 * The golden order and its capture sink.
 *
 * A FRESH GRAPH PER CALL. `makeOrderViewFixture` builds independent entities, independent reward
 * arrays and independent `Date` instances every time, which is what lets three levels of
 * `getCurrentFlag` memoization be re-evaluated per test instead of one test freezing another's answer.
 */
function makeGoldenOrder(overrides: OrderViewFixtureOverridesRef = {}): {
  readonly order: OrderView;
  readonly capture: OrderViewCaptureRef;
} {
  const capture: OrderViewCaptureRef = {};
  // ★ THE ACCOUNT DEFAULT, AND WHY IT IS SET HERE RATHER THAN LEFT TO THE FIXTURE. The fixture names
  // its own golden account, and the handler now refuses an order whose account disagrees with the
  // authenticated one - which is the whole point of the trust boundary. So unless a case says
  // otherwise, the golden order names the SAME account the default authorizer establishes, and an
  // ordinary case therefore describes an ordinary authenticated request.
  //
  // Tested with `in` rather than `!== undefined` on purpose: `{ accountID: undefined }` is a case
  // stating that the order names NO account, which is a different request from one that never
  // mentioned the member, and `exactOptionalPropertyTypes` makes that distinction load-bearing.
  const withAccount: OrderViewFixtureOverridesRef =
    'accountID' in overrides ? overrides : { ...overrides, accountID: AUTHENTICATED_ACCOUNT_ID };
  const order = makeOrderViewFixture({ ...withAccount, capture });

  return { order, capture };
}

/** One order item of the golden order, index-checked rather than asserted. */
function itemAt(order: OrderView, index: number): OrderItemView {
  const item = order.orderItems[index];

  if (item === undefined) {
    throw new TypeError(`the golden order carries no item at index ${String(index)}`);
  }

  return item;
}

/** Build a copy of an order document with one member removed, for the refusal cases. */
function documentWithout(
  document: Readonly<Record<string, unknown>>,
  member: string,
): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = { ...document };
  delete copy[member];

  return copy;
}

/** Build a copy of an order document with one member replaced. */
function documentWith(
  document: Readonly<Record<string, unknown>>,
  member: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  return { ...document, [member]: value };
}

/**
 * One programmed order-item intent, at the amount a case names.
 *
 * DATA. The amount is whatever the case says it is; nothing here computes a discount, and the
 * arithmetic that would have is asserted by the suites named in the file header.
 */
function itemIntent(orderItemID: string, discountAmount: string): PromotionIntent {
  return {
    operation: 'add',
    appliedType: 'orderItem',
    orderItemID,
    promotionID: PROMOTION_ID,
    discountAmount: Money.fromDecimalString(discountAmount),
  };
}

// ===========================================================================
// CONCERN 1 - THE PUBLISHED MODULE SURFACE
// ===========================================================================

describe('the promotion-application module surface (NET-NEW)', () => {
  it('publishes the entrypoint, the factory and both admissions, with no default export', () => {
    const exported = Object.keys(promotionApplicationHandlerModule).sort();

    // The runtime export set. Types and interfaces emit nothing, so what remains is the four values
    // this module publishes plus the two frozen constants and the error class.
    expect(exported).toContain('handler');
    expect(exported).toContain('createPromotionApplicationHandler');
    expect(exported).toContain('admitMaterializedOrderView');
    expect(exported).toContain('ORDER_DOCUMENT_LIMITS');
    expect(exported).toContain('OrderViewAdmissionError');
    expect(exported).not.toContain('default');
  });

  it('builds the production entrypoint through the same factory a suite calls', () => {
    // Both are functions of two declared parameters - the event and the context - so the runtime's
    // third completion-callback argument cannot arrive as one this handler would have to ignore.
    expect(typeof productionHandler).toBe('function');
    expect(productionHandler.length).toBe(2);
    expect(createPromotionApplicationHandler().length).toBe(2);
  });

  it('publishes the document bounds it enforces, frozen', () => {
    expect(Object.isFrozen(ORDER_DOCUMENT_LIMITS)).toBe(true);
    expect(ORDER_DOCUMENT_LIMITS.maximumOrderItems).toBeGreaterThan(0);
    expect(ORDER_DOCUMENT_LIMITS.maximumOrderFulfillments).toBeGreaterThan(0);
    expect(ORDER_DOCUMENT_LIMITS.maximumIdentifierLength).toBeGreaterThan(0);
  });
});

// ===========================================================================
// CONCERN 2 - THE WIRE ORDER DOCUMENT
//
// ★★★ THE DEPLOYED ROUTE'S ONLY INPUT, AND THE FINDING THESE CASES EXIST FOR.
//
// API Gateway delivers `event.body` as TEXT. The production admission used to be the
// STRUCTURAL one, which requires a method-bearing order graph - `Money`, `Sku` and
// `PriceGroup` accessors - and `JSON.parse` produces none of those, so the deployed
// `applyPromotions` route refused every request that could physically be sent to it. A
// code review raised it as CRITICAL, and an earlier revision of this suite CODIFIED the
// refusal as expected behaviour while reaching 200 only by injecting an in-process
// fixture - so the defect was masked by its own test.
//
// The default now parses `ORDER_VIEW_DOCUMENT_SCHEMA` and hydrates through
// `RequestScope.materializeOrderView`. The first case below is the one the review
// required: a plain JSON body through the factory handler with NO injected admission,
// answering 200 with the intents the engine decided.
// ===========================================================================

describe('the wire order document (NET-NEW)', () => {
  it('serves a PLAIN JSON ORDER DOCUMENT with no admission injected at all', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      // NOTHING is injected but the graph itself: no `admit`, no `refuseAdmission`. The PRODUCTION
      // admission runs, parses the body, and asks the scope to hydrate it.
      materialize: order,
      promotionIntents: [itemIntent(firstItem.orderItemID, '7.49625')],
      priceGroupIntents: [
        {
          orderItemID: firstItem.orderItemID,
          price: Money.fromDecimalString('11.00'),
          priceGroupID: 'pg-wire-0001',
        },
      ],
    });

    const result = await harness.invoke(postWireOrder(order));
    const body = successBodyOf(result);

    expect(result.statusCode).toBe(200);
    // The document reached the hydration tier, and the composed operation ran on what came back.
    expect(harness.recorder.materializedDocuments).toHaveLength(1);
    expect(harness.recorder.composedInputs).toHaveLength(1);
    expect(harness.recorder.log).toEqual([
      ROOT_OPENED,
      SCOPE_OPENED,
      ORDER_MATERIALIZED,
      COMPOSED_PRICING,
    ]);
    // And the intents the engine decided are what the caller received.
    expect(promotionIntentsOf(body)).toHaveLength(1);
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
    expect(body.priceGroupIntents).toHaveLength(1);
  });

  it('serves that document with EVERY dependency but the root left at its production default', async () => {
    // ★★★ THE CLOSEST A UNIT SUITE CAN STAND TO THE DEPLOYED ENTRYPOINT. The production line is
    // `export const handler = createPromotionApplicationHandler()` - no arguments at all - and the
    // only argument supplied here is the composition root, because the real one opens a `mysql2`
    // pool. Admission, logger and clock are ALL left to default, so the arm under test is the exact
    // arm the deployed route takes: parse the body, hydrate through the scope, price, answer 200.
    //
    // Under the finding this case exists for, this construction answered 400 `unsupportedBodyShape`
    // for every possible request, because the defaulted admission required a method-bearing order
    // graph that no JSON body can carry.
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const recorder = makeRecorder();
    const root = makeCompositionRootDouble(
      {
        now: new Date(EVALUATED_AT),
        salePriceDetails: {},
        materialized: order,
        materializationFailure: undefined,
        pricing: {
          priceGroupIntents: [],
          promotionIntents: [itemIntent(firstItem.orderItemID, '7.49625')],
          failure: undefined,
        },
      },
      recorder,
    );
    const subject = createPromotionApplicationHandler({
      compositionRoot: (): Promise<CompositionRoot> => Promise.resolve(root),
    });

    const result = await subject(postWireOrder(order));
    const body = successBodyOf(result);

    expect(result.statusCode).toBe(200);
    expect(recorder.materializedDocuments).toHaveLength(1);
    expect(promotionIntentsOf(body)).toHaveLength(1);
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
  });

  it('hands the hydration tier the document verbatim, identifiers and decimal strings alike', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });
    const firstItem = itemAt(order, 0);
    // The document is built ONCE and compared against what the materializer received, so the property
    // under test is genuine PASS-THROUGH rather than a restatement of the projection: any member this
    // tier renamed, coerced, rounded or dropped on the way through fails the comparison.
    const sent = wireOrderDocument(order);

    await harness.invoke(postDocument(applyPromotionsDocument(sent)));

    const [document] = harness.recorder.materializedDocuments;

    if (document === undefined) {
      throw new TypeError('the wire document never reached the materializer');
    }

    expect(document).toEqual(sent);
    expect(document.orderID).toBe(order.orderID);
    expect(document.currencyCode).toBe(order.currencyCode);
    // A decimal STRING on the wire, and the same amount of money the fixture holds.
    expectSameAmount(document.subtotal, order.subtotal.toDecimalString());

    const [item] = document.orderItems;

    if (item === undefined) {
      throw new TypeError('the wire document carried no order items');
    }

    // BOTH handles travel, each NON-EMPTY, and the SKU is named rather than described: no price, no
    // product type, no brand and no option list, because each of those decides whether a promotion
    // applies and none of them is the caller's to state.
    expect(item.skuID).toBe(firstItem.sku.getSkuID());
    expect(item.skuID).not.toBe('');
    expect(item.productID).not.toBe('');
    expect(Object.keys(item)).not.toContain('sku');
    expectSameAmount(item.price, firstItem.price.toDecimalString());
    expectSameAmount(item.extendedSkuPrice, firstItem.extendedSkuPrice.toDecimalString());
  });

  it('carries a pickup fulfillment whose shipping method is STATED as absent', async () => {
    const { order } = makeGoldenOrder({ includePickupFulfillment: true });
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(postWireOrder(order));
    const [document] = harness.recorder.materializedDocuments;

    expect(result.statusCode).toBe(200);

    if (document === undefined) {
      throw new TypeError('the wire document never reached the materializer');
    }

    // `null` rather than an omitted key. [model/service/PromotionService.cfc:L701] tests
    // `isNull(orderFulfillment.getShippingMethod())` explicitly, so "no shipping method" is a state
    // the document must be able to state - and the schema requires the KEY, so a document that
    // forgot it is a different, refused document.
    const stated = document.orderFulfillments.some(
      (fulfillment): boolean => fulfillment.shippingMethod === null,
    );
    expect(stated).toBe(true);
  });

  it('REFUSES a document whose monetary member is not a plain decimal numeral', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    // `'1,234.50'` is a formatted number, not a numeral. Coercing it would put a silent zero or a
    // truncated `1` into a price path, and a wrong price is money.
    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'subtotal', '1,234.50')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.subtotal');
    // The submitted value is NEVER echoed - only the path and the constraint.
    expect(result.body).not.toContain('1,234.50');
    // Nothing was hydrated and nothing was priced.
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('REFUSES a document that omits a required member, naming the member', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWithout(wireOrderDocument(order), 'totalSaleQuantity')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.totalSaleQuantity');
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('REFUSES an unknown member rather than ignoring it', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });
    const callerAuthoredKey = 'x-PLANTED-ORDER-KEY-9f2c41ab';

    // Ignoring an unknown member would let the caller believe it stated something the engine read.
    // Its NAME is caller-authored too, so the refusal keeps only the safe containing path.
    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(wireOrderDocument(order), callerAuthoredKey, {
            skuID: 'sku-not-a-member',
          }),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order');
    expect(result.body).not.toContain(callerAuthoredKey);
    expect(result.body).not.toContain('sku-not-a-member');
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
  });

  it('REFUSES a per-item member that is the wrong kind, naming the indexed path', async () => {
    const { order } = makeGoldenOrder();
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const harness = makeHarness({ materialize: order });
    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(document, 'orderItems', [{ ...firstItem, quantity: 'three' }, ...rest]),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.orderItems.0.quantity');
    expect(result.body).not.toContain('three');
  });

  it('reports an ABSENT order member differently from an unusable one', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const absent = await harness.invoke(postDocument({ operation: 'applyPromotions' }));
    const unusable = await harness.invoke(
      postDocument(applyPromotionsDocument({ orderID: 'order-with-nothing-else' })),
    );

    expect(absent.statusCode).toBe(400);
    expect(fieldPathsOf(absent)).toEqual(['order']);
    expect(errorBodyOf(absent).message).toBe('The request body is not the expected shape.');

    expect(unusable.statusCode).toBe(400);
    // Several member paths, because a caller fixing one shape wants every complaint at once.
    expect(fieldPathsOf(unusable).length).toBeGreaterThan(1);
    expect(errorBodyOf(unusable).message).toBe('The request body is not the expected shape.');
  });

  it('REFUSES an over-large order document and never truncates it', async () => {
    const { order } = makeGoldenOrder();
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const overLarge = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumOrderItems + 1 },
      (_unused, index): Readonly<Record<string, unknown>> => ({
        ...firstItem,
        orderItemID: `${String(firstItem['orderItemID'])}-${String(index)}`,
      }),
    );

    const harness = makeHarness({ materialize: order });
    const result = await harness.invoke(
      postDocument(applyPromotionsDocument(documentWith(document, 'orderItems', overLarge))),
    );

    // REFUSED, not silently shortened: the bound is published on `ORDER_DOCUMENT_LIMITS` so a caller
    // can split its own work deliberately rather than discovering a truncated result.
    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.orderItems');
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
  });

  it('lets an UNRECOGNIZED hydration failure reach the mapper, publishing none of its detail', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      materialize: order,
      // NOT the caller-shaped document error - an arbitrary failure from inside the hydration tier,
      // whose message happens to carry identifiers. It must land on the generic arm: this handler
      // recognizes exactly two client-shaped classes and reduces everything else to a fixed sentence.
      materializationFailure: new Error(
        'sku "sku-does-not-exist" is not carried by product "prod-golden-0001"',
      ),
    });

    const result = await harness.invoke(postWireOrder(order));

    expect(result.statusCode).toBe(500);
    expect(errorBodyOf(result).message).toBe('The request could not be completed.');
    expect(result.body).not.toContain('sku-does-not-exist');
    expect(result.body).not.toContain('prod-golden-0001');
    // The detail reaches the log stream under the same correlation identifier instead.
    expect(harness.emitted.lines.join('\n')).toContain(PLATFORM_REQUEST_ID);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  // =========================================================================
  // ★★★ THE CALLER-SHAPED HYDRATION REFUSAL - A RUNTIME FINDING, INVERTED
  //
  // The case above used to be titled "lets a HYDRATION refusal reach the mapper rather than
  // relabelling it as the caller mistake", and its comment argued that republishing the refusal
  // "would tell a caller whether a row exists". The DISCLOSURE half of that argument survives and is
  // asserted below; the CLASSIFICATION half was wrong, and QA testing measured the cost: an order
  // item naming an unknown `productID`, and one naming a SKU its named product does not carry, both
  // answered `500 unrecognized` with no `fields`. A caller was told the service had failed when the
  // caller had, and an operator's 5xx alarm counted client mistakes as service faults.
  //
  // `src/handlers/bootstrap.ts` now raises `OrderViewDocumentDataError` for exactly those two
  // conditions, carrying MEMBER PATHS and no identifiers, and this handler reports it as a 400. Both
  // halves are asserted here so neither the classification nor the no-echo rule can regress.
  // =========================================================================

  it('★ reports a caller-shaped document-data refusal as 400 with member paths', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      materialize: order,
      materializationFailure: new OrderViewDocumentDataError([
        {
          path: 'order.orderItems.0.productID',
          message: 'does not name a product this request can price',
        },
      ]),
    });

    const result = await harness.invoke(postWireOrder(order));

    expect(result.statusCode).toBe(400);
    expect(errorBodyOf(result).category).toBe('invalidRequest');
    expect(fieldPathsOf(result)).toStrictEqual(['order.orderItems.0.productID']);
    // ★ THE SENTENCE IS THE MAPPER'S FIXED ONE, so choosing `unusableRequestInput` withheld detail
    // rather than inventing any.
    expect(errorBodyOf(result).message).toBe('The request input is not valid.');
    // Neither pass ran, so nothing was priced against a catalogue that could not be resolved.
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('★ publishes no submitted identifier when it refuses a document-data mistake', async () => {
    const { order } = makeGoldenOrder();
    // The two paths `loadDocumentSkus` emits for the sku/product disagreement, which is the condition
    // whose old 500 named BOTH identifiers in its message.
    const harness = makeHarness({
      materialize: order,
      materializationFailure: new OrderViewDocumentDataError([
        {
          path: 'order.orderItems.0.skuID',
          message: 'does not name a sku carried by the product named on the same order item',
        },
        {
          path: 'order.orderItems.0.productID',
          message: 'names a product that does not carry the sku named on the same order item',
        },
      ]),
    });

    const result = await harness.invoke(postWireOrder(order));

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toStrictEqual([
      'order.orderItems.0.skuID',
      'order.orderItems.0.productID',
    ]);
    // The golden order's own identifiers are what a real refusal would have been tempted to echo.
    const firstItem = itemAt(order, 0);
    expect(result.body).not.toContain(firstItem.sku.getSkuID());
    expect(result.body).not.toContain(PRODUCT_ID);
  });
});

// ===========================================================================
// CONCERN 3 - THE IN-PROCESS ADMISSION, STILL AVAILABLE AND STILL STRICT
// ===========================================================================

describe('the in-process order-view admission (NET-NEW)', () => {
  it('vouches for a MATERIALISED view and hands it on untouched, hydrating nothing', async () => {
    const { order } = makeGoldenOrder();

    const admitted = await admitMaterializedOrderView({
      operation: 'applyPromotions',
      requestId: 'req',
      order,
    });

    // THE SAME OBJECT, by identity: no copy, no freeze, no re-sort. The reward iteration order is
    // legacy-non-deterministic by construction [model/dao/PromotionDAO.cfc:L51-L132 declares no
    // `ORDER BY`], so the collections must arrive exactly as the caller composed them.
    expect(admitted).toBe(order);
    // ONE declared parameter, which is how it says it reaches no hydration tier at all: the port
    // hands every admission a materializer and this arm has no place to receive one.
    expect(admitMaterializedOrderView.length).toBe(1);
  });

  it('still REFUSES a plain JSON projection, which is why it is not the default any more', async () => {
    const { order } = makeGoldenOrder();

    const refusal = await admitMaterializedOrderView({
      operation: 'applyPromotions',
      requestId: 'req',
      order: wireOrderDocument(order),
    }).then(
      (): OrderViewAdmissionError | undefined => undefined,
      (thrown: unknown): OrderViewAdmissionError | undefined =>
        thrown instanceof OrderViewAdmissionError ? thrown : undefined,
    );

    // The refusal is CORRECT for this arm and always was: a wire document's `price` is a string with
    // no accessors, and admitting it would let the engine read `undefined` out of a missing accessor
    // and put a silent zero into a discount calculation. What was wrong was making this the arm a
    // WIRE request took. Both arms now exist and each is reached by the caller it was written for.
    expect(refusal?.reason).toBe('unsupportedBodyShape');
    expect((refusal?.fields ?? []).map((field): string => field.path)).toContain(
      'order.orderItems[0].price',
    );
  });

  it('is injectable through the shipped dependency bundle and is then the arm that runs', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);
    // The injected admission ran and the scope's hydration was never reached.
    expect(harness.recorder.log).toEqual([
      ROOT_OPENED,
      SCOPE_OPENED,
      ORDER_ADMITTED,
      COMPOSED_PRICING,
    ]);
    expect(harness.recorder.materializedDocuments).toHaveLength(0);
    // It was handed the WHOLE decoded request, not just the order member.
    const [request] = harness.recorder.admissionRequests;
    expect(request?.operation).toBe('applyPromotions');
    expect(request?.requestId).toBe(PLATFORM_REQUEST_ID);
    expect(request).not.toHaveProperty('idempotencyKey');
  });

  it('maps an admission refusal onto the shipped client-shaped response with its member paths', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      refuseAdmission: new OrderViewAdmissionError('unsupportedBodyShape', [
        { path: 'order.orderItems[0].sku', message: 'must expose the entity accessors: getSkuID' },
      ]),
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(400);
    expect(errorBodyOf(result).category).toBe('invalidRequest');
    expect(fieldPathsOf(result)).toEqual(['order.orderItems[0].sku']);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });
});

// ===========================================================================
// CONCERN 4 - THE ACCOUNT TRUST BOUNDARY
//
// ★★★ THE ACCOUNT IS A PRICING AUTHORITY, AND IT USED TO BE CALLER-SUPPLIED.
//
// `PriceGroupService.updateOrderAmountsWithPriceGroups` resolves the account's price
// groups from `order.accountID` - the ported equivalent of the `!isNull(getAccount())`
// test at [model/service/PriceGroupService.cfc:L365] - `calculateSkuPriceBasedOnAccount`
// [:L271] reaches the subscription price-group query with it, and the promotion side keys
// account use counts by it [model/service/PromotionService.cfc:L1098]. Whoever chooses the
// account chooses which rates and which use-limits apply.
//
// A code review raised the state of this file as CWE-639, authorization bypass through a
// user-controlled key: the envelope's top-level `accountID` flowed straight into
// `createRequestScope`, the handler read the authorizer NOWHERE, and nothing compared the
// body's account with the order's. The cases below are the ones the review required, plus
// the two the ORDER-side authority makes necessary.
//
// ★★★ A SECOND REVIEW THEN FOUND THE OTHER HALF, AS CRITICAL: comparison was applied and
// correct, but ABSENCE was carried through, so an AUTHENTICATED caller that omitted the
// member priced an accountless order - skipping the account price-group read at
// [model/service/PriceGroupService.cfc:L365] and measuring every per-account use limit
// [model/service/PromotionService.cfc:L1098] against nobody, which makes a per-account cap
// unenforceable. The two BINDS cases below are the inversion of what this file used to
// assert, and they are deliberately paired: one per admission arm, because the wire arm and
// the in-process arm fill the absence in different places.
// ===========================================================================

/**
 * What a WIRE order document states about its account, read back out of a decoded request.
 *
 * The admission arm receives the PARSED DOCUMENT rather than a materialised view - money is still a
 * decimal string in it and a stated absence is `null` - so a case proving "the admission saw exactly
 * what was sent" reads the document member rather than comparing object identity with a fixture.
 * Narrowed by a predicate rather than asserted, like every other reader in this file.
 */
function wireAccountStatementOf(document: unknown): unknown {
  if (!isJsonObject(document)) {
    throw new TypeError('the admission was handed something other than an order document');
  }

  return document['accountID'];
}

describe('the account trust boundary (NET-NEW)', () => {
  it('threads the AUTHENTICATED account into the request scope, and never the body member', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      // The body ALSO names the account, and names it correctly, so the request is admitted - but the
      // value the scope receives comes from the authorizer either way.
      postApplyPromotions(
        order,
        { accountID: AUTHENTICATED_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs).toHaveLength(1);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('★★★ REFUSES an envelope and an order that name DIFFERENT accounts (SEC-I)', async () => {
    // ★★★ THIS CASE USED TO ASSERT THE OPPOSITE RULE, AND THE CHANGE IS SEC-I'S TRUST BOUNDARY MOVING.
    // It was titled "REFUSES a body accountID that disagrees with the authenticated account" and
    // expected the refusal at path `accountID`, on the ground that "a caller that believes it is
    // pricing for another account must not be handed this account's discounts". That ground was right
    // for the caller population the route then admitted - ANY identified account - and is the wrong
    // shape for the one it admits now: a TRUSTED SERVICE PRINCIPAL exists precisely to price on behalf
    // of an account other than its own, standing in for the in-process `OrderService` caller
    // [model/service/OrderService.cfc:L60-L61].
    //
    // So the envelope member is no longer a claim measured against the sender - it NAMES THE SUBJECT -
    // and the agreement test moved one level down, onto the document. What is asserted here is that the
    // test still exists and still refuses: an envelope naming one account carrying an order naming
    // another is refused, now at `order.accountID`.
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        { accountID: OTHER_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.accountID']);
    // Neither identifier is echoed - unchanged, and it was never the part that was wrong.
    expect(result.body).not.toContain(OTHER_ACCOUNT_ID);
    expect(result.body).not.toContain(AUTHENTICATED_ACCOUNT_ID);
    // Refused BEFORE the composed operation could price anything.
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('★★★ PRICES ON BEHALF OF the subject the trusted caller names, not the caller itself (SEC-I)', async () => {
    // The capability the moved boundary buys, and the reason the old rule could not simply be kept: a
    // trusted service submits an order belonging to a DIFFERENT account and the whole request - the
    // scope's account and the order it prices - is that subject's.
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        { accountID: OTHER_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(200);
    // ★★ AND THE SCOPE WAS OPENED FOR THE SUBJECT. This is the assertion that matters: every
    // per-account read behind this request - the account price groups, and both account use-count
    // queries - keys on the scope's account, so a scope opened for the SENDER would price one account's
    // order against another account's limits.
    expect(harness.recorder.scopeInputs).toHaveLength(1);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(OTHER_ACCOUNT_ID);
    expect(harness.recorder.composedInputs).toHaveLength(1);
  });

  it('★★ falls back to the TRUSTED CALLER\u2019s own account when the envelope names no subject', async () => {
    // The clause that carries the earlier CRITICAL adoption fix forward. A request naming no subject
    // anywhere must still price for a REAL account, or every per-account use-limit read counts the uses
    // of nobody - which is what made a per-account cap uncapped.
    const { order } = makeGoldenOrder({});
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('REFUSES an order document naming a DIFFERENT account from the authenticated one', async () => {
    // ★ THE CASE THE REVIEW NAMED: `order.accountID = 'A'` with a top-level `accountID = 'B'`. Here
    // the order names the OTHER account while the session and the envelope agree, which is the same
    // bypass reached through the document instead of the envelope - and the document is what the
    // price-group pass actually reads.
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(
        order,
        { accountID: AUTHENTICATED_ACCOUNT_ID },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.accountID']);
    expect(result.body).not.toContain(OTHER_ACCOUNT_ID);
    // The order was admitted - that is where the account became visible - and then refused BEFORE the
    // composed operation could price it.
    expect(harness.recorder.log).toEqual([ROOT_OPENED, SCOPE_OPENED, ORDER_ADMITTED]);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('lets the 401 admission gate win before inspecting an anonymous body account', async () => {
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    // No authorizer context AT ALL - stated explicitly, because the suite default is an authenticated
    // session - and a document naming an account. Under the defect this priced that account's rates
    // for an unauthenticated caller.
    const result = await harness.invoke(postApplyPromotions(order, {}, null));

    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).category).toBe('unauthenticated');
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    expect(harness.recorder.log).toEqual([]);
  });

  it('REFUSES an anonymous order even when the body names no account', async () => {
    const { order } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ admit: order });

    // Anonymous on BOTH sides, stated explicitly: no authorizer context and no account on the order.
    const result = await harness.invoke(postApplyPromotions(order, {}, null));

    // The logged-out pricing arm still exists below the boundary, but this HTTP route no longer
    // exposes it anonymously. Authentication is established before any order is admitted.
    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).category).toBe('unauthenticated');
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★★ BINDS an authenticated session to its own account when the order names none', async () => {
    // ★★★ INVERTED DEFECT-PINNING CASE. This case previously asserted only that the request was
    // SERVED (200) and that the SCOPE carried the account, and it ended with the sentence "while the
    // order stays on the logged-out arm of the price-group pass". A code review established that
    // sentence as the CRITICAL defect itself rather than the contract: the order view is what
    // `PriceGroupService.updateOrderAmountsWithPriceGroups` reads its account from
    // [model/service/PriceGroupService.cfc:L365] and what every per-account promotion use-limit is
    // measured against [model/service/PromotionService.cfc:L1098], so an ACCOUNTLESS view priced for
    // an AUTHENTICATED caller skips the account price-group read entirely and counts the promotion
    // uses of nobody - making a per-account use cap unenforceable by simply omitting one member.
    //
    // The logged-out arm is real and still exercised, but it belongs to a genuinely anonymous caller.
    // This route has none: it refuses before anything else runs, and the case below that pairs with
    // this one proves that. So an order naming no account ADOPTS the proved identity.
    const { order } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);

    // ★★ THE ASSERTION THE OLD CASE LACKED, AND THE ONLY ONE THAT ACTUALLY CLOSES THE FINDING: the
    // view the COMPOSED OPERATION received names the authenticated account, so both account-sensitive
    // paths behind it have an account to read.
    const [priced] = harness.recorder.composedInputs;
    expect(priced?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);

    // The admission itself was handed the caller's request UNCHANGED, stating no account - the
    // reconciliation happens AFTER admission, so an admission still sees exactly what was sent.
    expect(harness.recorder.admissionRequests).toHaveLength(1);
    expect(wireAccountStatementOf(harness.recorder.admissionRequests[0]?.order)).toBeNull();

    // AND NOTHING ELSE WAS REWRITTEN. Every other member is carried across by reference or by value,
    // so binding the account cannot disturb the reward iteration order, an amount, or a collection.
    expect(priced?.orderID).toBe(order.orderID);
    expect(priced?.orderItems).toBe(order.orderItems);
    expect(priced?.orderFulfillments).toBe(order.orderFulfillments);
    expect(priced?.appliedPromotions).toBe(order.appliedPromotions);
    expect(priced?.subtotal).toBe(order.subtotal);
    expect(priced?.subtotalAfterItemDiscounts).toBe(order.subtotalAfterItemDiscounts);
    expect(priced?.promotionCodeList).toBe(order.promotionCodeList);
    expect(priced?.currencyCode).toBe(order.currencyCode);

    // The caller's own object is NOT mutated: the binding is a fresh shallow view, so an in-process
    // strangler-fig proxy that injected a live aggregate still holds exactly what it composed.
    expect(order.accountID).toBeUndefined();
  });

  it('★★★ binds the same account on the WIRE path, inside the hydration', async () => {
    // ★★★ THE OTHER HALF OF THE SAME FINDING, AND IT NEEDS ITS OWN CASE BECAUSE IT IS A DIFFERENT
    // MECHANISM. The wire arm hydrates an `OrderViewDocument` through
    // `RequestScope.materializeOrderView`, which `./bootstrap.js` owns; an injected admission never
    // reaches that hydration and a hydrated document never reaches an injected admission, so the
    // composition root fills the absence there and this handler fills it here. Neither alone covers
    // both arms.
    //
    // The harness's materializer is programmed with data, so what this case can prove at THIS tier is
    // that the document the hydration received states no account and that the priced view carries the
    // authenticated one regardless. The bootstrap suite proves the hydration's own half against the
    // real composition root - see `tests/unit/handlers/bootstrap.test.ts`, 'adopts the request scope's
    // established account when the document states none'.
    const { order } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postWireOrder(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.materializedDocuments[0]?.accountID).toBeNull();
    expect(harness.recorder.composedInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('reads the authorizer claim CASE-INSENSITIVELY, as a CFML struct key read does', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    // An authorizer emitting `accountId` names the same claim as one emitting `accountID`. A
    // case-sensitive index would let a deployment's key casing silently decide whether a request is
    // treated as signed in - which would refuse this order rather than price it.
    //
    // ★★ BOTH CLAIMS ARE SPELLED UNCONVENTIONALLY HERE, AND THE SECOND IS SEC-I's. The trusted-service
    // claim is read through the same case-folding struct read, so a deployment emitting
    // `ADMINACCOUNTFLAG` names the same permission as one emitting `adminAccountFlag`. Getting that
    // wrong in the other direction would be worse than a refusal: it would silently deny the one caller
    // population this route serves, and the symptom would be a 403 nobody could explain.
    const result = await harness.invoke(
      postApplyPromotions(
        order,
        {},
        {
          accountId: AUTHENTICATED_ACCOUNT_ID,
          ADMINACCOUNTFLAG: true,
        },
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(AUTHENTICATED_ACCOUNT_ID);
  });

  it('compares the two accounts case-insensitively, as CFML string comparison does', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID.toUpperCase() });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    // The same account in a different casing IS the same account, so this is not a conflict. CFML
    // identifiers are case-insensitive and reporting a conflict here would refuse a legitimate
    // request.
    expect(result.statusCode).toBe(200);
  });

  it('REFUSES a blank or non-string account claim as unusable authentication', async () => {
    const { order } = makeGoldenOrder({ accountID: undefined });
    const blank = makeHarness({ admit: order });
    const nonString = makeHarness({ admit: order });

    const blankResult = await blank.invoke(postApplyPromotions(order, {}, { accountID: '   ' }));
    const nonStringResult = await nonString.invoke(
      postApplyPromotions(order, {}, { accountID: 12345 }),
    );

    // Neither value can establish a principal. Refusal happens before a scope could coerce either
    // value into an account-scoped read.
    expect(blankResult.statusCode).toBe(401);
    expect(blank.recorder.log).toEqual([]);
    expect(nonStringResult.statusCode).toBe(401);
    expect(nonString.recorder.log).toEqual([]);
  });

  it('applies the same rule to the WIRE path, where the document is the only account statement', async () => {
    const { order } = makeGoldenOrder({ accountID: OTHER_ACCOUNT_ID });
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postWireOrder(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    // The document hydrated - the account only becomes readable once it has - and then the request was
    // refused before pricing. Hydration is a read; pricing is what the account decides.
    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.accountID']);
    expect(harness.recorder.materializedDocuments).toHaveLength(1);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('carries the account on getSalePriceDetailsForProductSkus too, from the authorizer alone', async () => {
    const harness = makeHarness({ salePriceDetails: {} });

    const result = await harness.invoke(
      postDocument(
        {
          operation: 'getSalePriceDetailsForProductSkus',
          productID: PRODUCT_ID,
          accountID: OTHER_ACCOUNT_ID,
        },
        authorizerFor(AUTHENTICATED_ACCOUNT_ID),
      ),
    );

    // ★★★ SERVED NOW, AND THE REVERSAL IS SEC-I'S. This case used to assert `400` at path `accountID`
    // with the note "the same refusal on the same grounds: the operation differs, the authority does
    // not". The authority genuinely does not differ between the two operations - that clause was right
    // and still is - but the RULE it applied has moved: the envelope's account is the SUBJECT a trusted
    // service names, not a claim measured against the sender. So a trusted caller naming another
    // account's subject is served here exactly as it is on the apply-promotions arm.
    //
    // Nothing about this operation reads the account: `getSalePriceDetailsForProductSkus` takes a
    // productID and the sale-price statement is account-independent [model/dao/PromotionDAO.cfc:L298].
    // The subject still travels to the scope, because the scope is opened before the operation is
    // dispatched and one request has one account.
    expect(result.statusCode).toBe(200);
    expect(harness.recorder.salePriceRequests).toEqual([PRODUCT_ID]);
    expect(harness.recorder.scopeInputs[0]?.accountID).toBe(OTHER_ACCOUNT_ID);
  });
});

// ===========================================================================
// THE TRUSTED-SERVICE TRUST BOUNDARY, AND DOCUMENT SELF-CONSISTENCY (SEC-I, CWE-20/CWE-345/CWE-639)
//
// ★★★ WHAT THE FINDING WAS. Every economically decisive member of this request is caller-authored -
// item prices, extended prices, subtotals, the applied-price-group handle, the promotion-code list -
// and the route admitted ANY identified account. Two consequences, both live: a customer could price
// an order describing prices its cart does not have, and it could name the `promotionAppliedID` of
// applied-promotion rows belonging to orders it does not own, each of which the engine turns into a
// REMOVE intent [model/service/PromotionService.cfc:L64-L80].
//
// ★★★ WHY THE BLANKET CLEAR IS NOT WHAT CHANGED. That clear is AAP-MANDATED: the legacy pass begins by
// removing every applied promotion before recomputing, and reproducing it is required [AAP 0.6.1]. The
// intents stay. What was missing is any reason to believe the document describes an order the caller
// may act on, and there are exactly two places that can be established - the CALLER (a permission) and
// the DOCUMENT (its own internal consistency). Both are asserted here.
//
// ★★ WHY NOT SERVER-SIDE CANONICALIZATION, which the finding also offered. It requires loading the
// order aggregate, and `OrderService` and every order entity are explicitly out of scope [AAP 0.2.2].
// The anti-corruption inversion that makes this slice independently deployable is the decision that
// the order arrives as an INPUT [AAP 0.1.1], so there is no in-scope read that could fetch one to
// compare against.
// ===========================================================================

describe('the trusted-service trust boundary (SEC-I)', () => {
  it('★★★ REFUSES an identified but UNTRUSTED account with 403, before parsing the body', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      postApplyPromotions(order, {}, untrustedAuthorizerFor(AUTHENTICATED_ACCOUNT_ID)),
    );

    // 403 and not 401: an identity WAS established and is insufficient. Not 404 either - pretending
    // the route is absent would also hide it from a trusted caller misconfigured to omit its claim.
    expect(result.statusCode).toBe(403);
    expect(errorBodyOf(result).category).toBe('forbidden');
    // A FIXED sentence with no `fields`: nothing about the gate's shape, the claim it reads or the
    // principal that failed it is disclosed.
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    expect(result.body).not.toContain('adminAccountFlag');
    expect(result.body).not.toContain(AUTHENTICATED_ACCOUNT_ID);

    // ★★ NOTHING WAS OPENED, ADMITTED OR PRICED. The refusal precedes the decode, so an unauthorized
    // caller costs no parse, no composition root, no scope and no statement.
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★★ refuses an untrusted caller even when the body is MALFORMED, so the gate wins', async () => {
    // Ordering assertion: a caller that is not permitted here must learn that, rather than learning
    // about its JSON - which would confirm the route's schema to a caller it does not serve.
    const harness = makeHarness({});

    const result = await harness.invoke(
      makeProxyEvent({
        body: '{ this is not json',
        authorizer: untrustedAuthorizerFor(AUTHENTICATED_ACCOUNT_ID),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(harness.recorder.log).toEqual([]);
  });

  it('★★ refuses every non-admitted rendering of the trusted claim, and admits the closed set', async () => {
    // The vocabulary is `errorMapper`'s and is not widened for this route: a real `boolean true`, or one
    // of the two truthy STRINGS an authorizer can carry. A NUMBER is refused - including `1`, admitted
    // as the string `'1'` and refused as the numeral - because a permission arriving untyped is not one
    // this route will guess at.
    for (const refused of [false, 'false', '0', 0, 1, '', ' ', 'no', 'yes', null, {}, []]) {
      const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
      const harness = makeHarness({ admit: order });

      const result = await harness.invoke(
        postApplyPromotions(
          order,
          {},
          {
            accountID: AUTHENTICATED_ACCOUNT_ID,
            adminAccountFlag: refused,
          },
        ),
      );

      expect(result.statusCode).toBe(403);
      expect(harness.recorder.log).toEqual([]);
    }

    for (const admitted of [true, 'true', '1', ' TRUE ', 'True']) {
      const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
      const harness = makeHarness({ admit: order });

      const result = await harness.invoke(
        postApplyPromotions(
          order,
          {},
          {
            accountID: AUTHENTICATED_ACCOUNT_ID,
            adminAccountFlag: admitted,
          },
        ),
      );

      expect(result.statusCode).toBe(200);
    }
  });

  it('★★★ cannot be granted the claim by the REQUEST - only the authorizer establishes it', async () => {
    // The BODY asserts the permission while the authorizer withholds it. The body is the only
    // caller-authored surface this suite's event builder models - and it is the one that matters, since
    // the envelope is the sole caller-authored structure this route reads at all. If it were consulted,
    // this would be served.
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(
      makeProxyEvent({
        body: JSON.stringify({
          ...applyPromotionsDocument(wireOrderDocument(order)),
          adminAccountFlag: true,
        }),
        authorizer: untrustedAuthorizerFor(AUTHENTICATED_ACCOUNT_ID),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(harness.recorder.log).toEqual([]);
  });
});

describe('order-document self-consistency (SEC-I)', () => {
  /** The golden document, with one member of its FIRST order item replaced. */
  function documentWithFirstItemMember(
    order: OrderView,
    member: string,
    value: unknown,
  ): Readonly<Record<string, unknown>> {
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    return documentWith(document, 'orderItems', [{ ...firstItem, [member]: value }, ...rest]);
  }

  it('★★★ REFUSES an extendedPrice that is not price x quantity', async () => {
    // The identity is the legacy entity's own: `getExtendedPrice()` is exactly
    // `precisionEvaluate('getPrice() * val(getQuantity())')` [model/entity/OrderItem.cfc:L200-L202].
    // The promotion pass subtracts `getExtendedSkuPrice() - getExtendedPrice()` as a correction term
    // [model/service/PromotionService.cfc:L249, L252], so a caller controlling the pair controls the
    // discount directly.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWithFirstItemMember(order, 'extendedPrice', '0.01')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.orderItems.0.extendedPrice']);
    // ★★ REFUSED BEFORE THE HYDRATION, so an inconsistent document costs no entity load, and CERTAINLY
    // before the passes: no intent of any kind is emitted for it.
    expect(harness.recorder.materializedDocuments).toEqual([]);
    expect(harness.recorder.composedInputs).toEqual([]);
    // Nothing submitted is echoed - not the value, not the product it was computed from.
    expect(result.body).not.toContain('0.01');
  });

  it('★★★ REFUSES an extendedSkuPrice that is not skuPrice x quantity', async () => {
    // `getExtendedSkuPrice()` is `precisionEvaluate('getSkuPrice() * getQuantity()')`
    // [model/entity/OrderItem.cfc:L204-L206] - note it carries NO `val()`, unlike its sibling, and the
    // asymmetry is preserved by reproducing neither coercion.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWithFirstItemMember(order, 'extendedSkuPrice', '999.99')),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.orderItems.0.extendedSkuPrice']);
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★★ ADMITS the identity computed at full decimal precision, not at two places', async () => {
    // The comparison goes through `Money`, so a price with more than two decimal places multiplies
    // exactly. A check that had rounded to cents would refuse this document - which the legacy
    // `precisionEvaluate` would have produced happily.
    const { order } = makeGoldenOrder();
    const document = documentWithFirstItemMember(order, 'price', '1.005');
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const quantity = firstItem['quantity'];

    if (typeof quantity !== 'number') {
      throw new TypeError('the wire projection did not produce a numeric quantity');
    }

    const consistent = documentWith(document, 'orderItems', [
      { ...firstItem, extendedPrice: (1.005 * quantity).toFixed(3) },
      ...rest,
    ]);
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(postDocument(applyPromotionsDocument(consistent)));

    expect(result.statusCode).toBe(200);
  });

  it('★★★ REFUSES an item naming a fulfillment the document does not carry', async () => {
    // `OrderItem.orderFulfillment` is a many-to-one, so an item always belonged to a fulfillment of its
    // own order. A document whose item points elsewhere describes an impossible graph - and the
    // shipping-level qualification walks exactly that link
    // [model/service/PromotionService.cfc:L752-L781].
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWithFirstItemMember(order, 'orderFulfillmentID', 'fulfillment-not-in-this-order'),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toEqual(['order.orderItems.0.orderFulfillmentID']);
    expect(result.body).not.toContain('fulfillment-not-in-this-order');
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★ folds identifier case on the fulfillment reference, so a valid reference is not refused', async () => {
    const { order } = makeGoldenOrder();
    const fulfillmentID = itemAt(order, 0).orderFulfillmentID;
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWithFirstItemMember(order, 'orderFulfillmentID', fulfillmentID.toUpperCase()),
        ),
      ),
    );

    expect(result.statusCode).toBe(200);
  });

  it('★★★ REFUSES the same promotionAppliedID claimed under two owners', async () => {
    // Each already-applied promotion becomes a REMOVE intent
    // [model/service/PromotionService.cfc:L64-L80], and a row is attached to exactly ONE owner. The
    // same identifier claimed at the order level and again on an item would emit two intents for one
    // row, which is a detach a caller could not otherwise express.
    const { order } = makeGoldenOrder();
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    const duplicated = {
      promotionAppliedID: 'applied-claimed-twice',
      discountAmount: null,
      promotion: null,
    };
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(documentWith(document, 'appliedPromotions', [duplicated]), 'orderItems', [
            { ...firstItem, appliedPromotions: [duplicated] },
            ...rest,
          ]),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    // Reported at the SECOND claim, which is the one that cannot be honoured; the first is a legitimate
    // statement until the second contradicts it.
    expect(fieldPathsOf(result)).toEqual([
      'order.orderItems.0.appliedPromotions.0.promotionAppliedID',
    ]);
    expect(result.body).not.toContain('applied-claimed-twice');
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★★★ DOES NOT validate totalSaleQuantity against the items, because the legacy cannot', async () => {
    // ★★★ THE CHECK THAT IS DELIBERATELY ABSENT, AND THE MOST IMPORTANT CASE IN THIS BLOCK.
    // `getTotalSaleQuantity()` [model/entity/Order.cfc:L624-L632] tests
    // `getOrderItems()[1].getOrderItemType().getSystemCode()` inside a loop that then adds
    // `getOrderItems()[i].getQuantity()` - the FIRST item's type decides whether EVERY item's quantity
    // is counted. That is a registered legacy defect [AAP 0.6.7], so a real aggregate routinely emits a
    // total that disagrees with any correct recomputation. A consistency check here would refuse
    // documents the legacy engine genuinely produces, which is why adding one would be a fidelity
    // defect dressed up as hardening.
    const { order } = makeGoldenOrder();
    const document = documentWith(wireOrderDocument(order), 'totalSaleQuantity', 4242);
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(postDocument(applyPromotionsDocument(document)));

    expect(result.statusCode).toBe(200);
  });
});

describe('caller-controlled statement and arithmetic bounds (SEC-J, SEC-K)', () => {
  /** The golden document with one member of its first order item replaced. */
  function withFirstItemQuantity(
    order: OrderView,
    quantity: unknown,
  ): Readonly<Record<string, unknown>> {
    const document = wireOrderDocument(order);
    const items = document['orderItems'];

    if (!isJsonObjectArray(items)) {
      throw new TypeError('the wire projection did not produce an order-item array');
    }

    const [firstItem, ...rest] = items;

    if (firstItem === undefined) {
      throw new TypeError('the wire projection produced no order items');
    }

    return documentWith(document, 'orderItems', [{ ...firstItem, quantity }, ...rest]);
  }

  it.each([
    ['just past the safe-integer boundary', 9_007_199_254_740_992],
    ['far past it', 1e300],
    ['negative and past it', -9_007_199_254_740_992],
  ])(
    '★★★ REFUSES a quantity %s with a 400 naming the member, never a 500 (SEC-K)',
    async (_label, quantity) => {
      // ★★★ THE DEFECT THIS CLOSES. `z.number().int()` admitted every one of these, and each then
      // reached `fromInteger` [src/lib/cfml/precision.ts:L387], which accepts ONLY
      // `Number.isSafeInteger` and throws `PrecisionError`. A `PrecisionError` is not a validation
      // failure, so it bypassed the request-contract mapper and surfaced as a GENERIC 500 naming
      // nothing - a caller-controlled internal error, and a caller-controlled way to make the request
      // fail without ever being told which field was at fault.
      const { order } = makeGoldenOrder();
      const harness = makeHarness({ materialize: order });

      const result = await harness.invoke(
        postDocument(applyPromotionsDocument(withFirstItemQuantity(order, quantity))),
      );

      expect(result.statusCode).toBe(400);
      expect(fieldPathsOf(result)).toContain('order.orderItems.0.quantity');
      // Nothing was hydrated and nothing was priced: the refusal is at admission.
      expect(harness.recorder.materializedDocuments).toEqual([]);
    },
  );

  it('★★ REFUSES a quantity beyond the persisted INT range, which is the business bound (SEC-K)', async () => {
    // `OrderItem.quantity` is `ormtype="integer"` [model/entity/OrderItem.cfc:L56] - a MySQL signed
    // INT - so 2_147_483_648 cannot describe a persisted order line even though it IS a safe integer.
    // The two constraints are independent, which is why both are applied.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(applyPromotionsDocument(withFirstItemQuantity(order, 2_147_483_648))),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.orderItems.0.quantity');
  });

  it('★★ REFUSES a promotionCodeList naming more codes than the published bound (SEC-J)', async () => {
    // ★★★ THE DEFECT THIS CLOSES. Every code is emitted into TWO `EXISTS` arms of
    // `getActivePromotionRewards`, so N codes cost 2N placeholders against a 65_535 protocol ceiling.
    // Roughly 32_766 codes - a string well inside this route's own size bound - drove the statement past
    // it, and the refusal then arrived from the DRIVER as a 500, after the whole array had been built.
    const { order } = makeGoldenOrder();
    const codes = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumPromotionCodes + 1 },
      (_unused, index) => `code${String(index)}`,
    ).join(',');
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'promotionCodeList', codes)),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.promotionCodeList');
    expect(harness.recorder.materializedDocuments).toEqual([]);
  });

  it('★★ REFUSES an over-long promotionCodeList even when it names few codes (SEC-J)', async () => {
    // The two bounds are independent: the element count is what the placeholder budget is a function
    // of, and the total length is what stops the same budget being asked for with pathological members.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          documentWith(wireOrderDocument(order), 'promotionCodeList', 'x'.repeat(20_000)),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect(fieldPathsOf(result)).toContain('order.promotionCodeList');
  });

  it('★★ SERVES a promotionCodeList AT the bound, and forwards it VERBATIM (SEC-J)', async () => {
    // At the bound is accepted, and - the part that matters for fidelity - the list is not rewritten to
    // fit: no trimming, no de-duplication, no re-ordering and no case folding, each of which would
    // change which rows the statement matches. A previous code review established that the
    // comma-delimited form reaches the service exactly as the caller wrote it.
    const { order } = makeGoldenOrder();
    const codes = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumPromotionCodes },
      // Deliberately including a repeat and a mixed casing, so a de-duplicating or folding
      // implementation would be caught by the verbatim assertion below.
      (_unused, index) => (index === 0 ? 'DUP' : index === 1 ? 'dup' : `code${String(index)}`),
    ).join(',');
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'promotionCodeList', codes)),
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.materializedDocuments[0]?.promotionCodeList).toBe(codes);
  });

  it('★ SERVES an EMPTY promotionCodeList, which is an order carrying no codes', async () => {
    // `split(',')` on an empty string yields one element, so a naive count would report 1 for a list
    // that names none. The empty case is answered before the count.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(documentWith(wireOrderDocument(order), 'promotionCodeList', '')),
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.materializedDocuments[0]?.promotionCodeList).toBe('');
  });
});

describe('the authenticated admission gate (NET-NEW)', () => {
  it('refuses a request carrying no authorizer context before wiring the graph', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order, {}, null));

    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).category).toBe('unauthenticated');
    expect(harness.recorder.log).toEqual([]);
  });

  it('refuses every context that names no usable account', async () => {
    const unusable: readonly Readonly<Record<string, unknown>>[] = [
      {},
      { unrelated: 'x' },
      { accountID: '' },
      { accountID: '  ' },
      { accountID: 42 },
    ];

    for (const authorizer of unusable) {
      const { order } = makeGoldenOrder();
      const harness = makeHarness({ admit: order });

      const result = await harness.invoke(postApplyPromotions(order, {}, authorizer));

      expect(result.statusCode).toBe(401);
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('refuses before reading or parsing the body', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      makeProxyEvent({ body: '{ not json at all', authorizer: null }),
    );

    expect(result.statusCode).toBe(401);
    expect(errorBodyOf(result).message).not.toBe(UNPARSABLE_BODY_SENTENCE);
    expect(harness.recorder.log).toEqual([]);
  });

  it('still resolves the route first, so a wrong path is a 404 rather than a 401', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      makeProxyEvent({ path: '/promotions/not-a-route', authorizer: null }),
    );

    expect(result.statusCode).toBe(404);
    expect(harness.recorder.log).toEqual([]);
  });

  it('publishes no claim name, internal reason, field detail or challenge', async () => {
    const result = await makeHarness().invoke(makeProxyEvent({ authorizer: null }));
    const headerNames = Object.keys(result.headers ?? {})
      .map((name): string => name.toLowerCase())
      .sort();

    expect(result.statusCode).toBe(401);
    expect(result.body).not.toContain('accountID');
    expect(result.body).not.toContain('noAuthorizerContext');
    expect(result.body).not.toContain('authoriz');
    expect(errorBodyOf(result)).not.toHaveProperty('fields');
    expect(headerNames).toEqual(['cache-control', 'content-type']);
    expect(headerNames).not.toContain('www-authenticate');
  });
});

// ===========================================================================
// CONCERN 5 - DELEGATION: ONE ROOT, ONE SCOPE, ONE COMPOSED OPERATION
// ===========================================================================

describe('promotion-application delegation (NET-NEW)', () => {
  it('opens the root once, opens ONE scope, and invokes the composed operation exactly once', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);
    // ONE fresh scope per invocation, never held, cached or reused: that is what stops a warm
    // container from carrying one invocation's state - and therefore one customer's price - into
    // another's.
    expect(harness.recorder.log.filter((label): boolean => label === ROOT_OPENED)).toHaveLength(1);
    expect(harness.recorder.log.filter((label): boolean => label === SCOPE_OPENED)).toHaveLength(1);
    expect(
      harness.recorder.log.filter((label): boolean => label === COMPOSED_PRICING),
    ).toHaveLength(1);
  });

  it('takes a FRESH scope for every invocation and reuses nothing between them', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    await harness.invoke(postApplyPromotions(order));
    await harness.invoke(postApplyPromotions(order));

    expect(harness.recorder.log.filter((label): boolean => label === SCOPE_OPENED)).toHaveLength(2);
    expect(harness.recorder.composedInputs).toHaveLength(2);
  });

  it('threads the injected clock into the request scope', async () => {
    const { order } = makeGoldenOrder();
    const pinned = new Date('2024-02-29T00:00:00.000Z');
    const harness = makeHarness({ admit: order, now: pinned, clock: (): Date => pinned });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    expect(harness.recorder.scopeInputs[0]?.now?.toISOString()).toBe(pinned.toISOString());
    // Rendered through `toISOString`, hence UTC by definition, and read from the SCOPE rather than
    // from a clock this handler owns.
    expect(body.evaluatedAt).toBe(pinned.toISOString());
  });

  it('passes NO clock in the production configuration, so the scope binds the instant itself', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    // `now` absent, not present-and-undefined: the scope reads the wall clock ONCE at its own creation
    // and publishes that single instant, which is what makes every date comparison in one invocation
    // resolve against the same moment.
    expect(harness.recorder.scopeInputs[0]?.now).toBeUndefined();
    expect(body.evaluatedAt).toBe(EVALUATED_AT);
  });

  it('imposes NO ordering of its own on the order items it forwards', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    await harness.invoke(postApplyPromotions(order));

    const [forwarded] = harness.recorder.composedInputs;

    // Item order is preserved exactly. The engine's own selection ordering is load-bearing and the
    // reward collection is deliberately unordered [model/dao/PromotionDAO.cfc:L51-L132 declares no
    // `ORDER BY`]; a handler that sorted on the way in would be making an engine decision.
    expect(forwarded?.orderItems.map((item): string => item.orderItemID)).toEqual(
      order.orderItems.map((item): string => item.orderItemID),
    );
    expect(forwarded).toBe(order);
  });

  it('forwards the order type verbatim and gates nothing on it', async () => {
    const { order } = makeGoldenOrder({ orderTypeSystemCode: 'otReturnOrder' });
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    // The two order-type conditionals at [model/service/PromotionService.cfc:L61] and [:L542] are the
    // ENGINE's, and `tests/unit/services/promotionService.test.ts` owns them - including the preserved
    // `issue_1766` no-op. What this tier owes is that the code arrives unexamined and unaltered, and
    // that an empty intent array is served as an ordinary 200 rather than as an error.
    expect(result.statusCode).toBe(200);
    expect(harness.recorder.composedInputs[0]?.orderType.systemCode).toBe('otReturnOrder');
    expect(promotionIntentsOf(successBodyOf(result))).toEqual([]);
  });

  it('reaches NEITHER individual order pass, and neither the price-resolution nor promotion queries', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    // Every withheld member of the scope and the root is a throwing getter, so a 200 here is itself
    // the assertion: had the handler touched `priceGroupService`, `promotionService`,
    // `currentAccountContext`, `diagnostics` or any other withheld member, this invocation would have
    // produced a 500 and a `WithheldCollaboratorError` on the log.
    expect(result.statusCode).toBe(200);
    expect(harness.emitted.lines.join('\n')).not.toContain('WithheldCollaboratorError');
  });

  it('and that guard is LIVE rather than vacuous - a withheld member really does throw', () => {
    const recorder = makeRecorder();
    const scope = makeRequestScopeDouble(
      {
        now: new Date(EVALUATED_AT),
        salePriceDetails: {},
        materialized: undefined,
        materializationFailure: undefined,
        pricing: { priceGroupIntents: [], promotionIntents: [], failure: undefined },
      },
      recorder,
    );

    // Proven by reading one, so the negative assertions above cannot be passing because the getters
    // are inert.
    expect((): unknown => scope.priceGroupService).toThrow(WithheldCollaboratorError);
    expect((): unknown => scope.promotionService).toThrow(/does not use/);
  });

  it('refuses every caller-authored ordering member before opening the graph', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    // There is no `sequence`, `phase`, `runAfter`, `pipeline`, `order` or `skipPriceGroups` member on
    // this contract, and a caller inventing one is sending an unknown envelope member. The strict
    // envelope refuses it rather than silently pretending it was honoured.
    const result = await harness.invoke(
      postApplyPromotions(order, {
        sequence: 'promotionsThenPriceGroups',
        skipPriceGroups: true,
      }),
    );

    expect(result.statusCode).toBe(400);
    // The unknown member names are caller-authored and are therefore not reflected. The safe path
    // identifies their containing object: the request envelope itself.
    expect(fieldPathsOf(result)).toEqual(['']);
    expect(result.body).not.toContain('sequence');
    expect(result.body).not.toContain('skipPriceGroups');
    expect(result.body).not.toContain('promotionsThenPriceGroups');
    expect(harness.recorder.log).toEqual([]);
  });
});

// ===========================================================================
// CONCERN 6 - THE ANTI-CORRUPTION BOUNDARY: VIEWS IN, INTENTS OUT
// ===========================================================================

describe('the anti-corruption boundary (NET-NEW)', () => {
  it('never mutates or persists the order, its items or its fulfillments', async () => {
    const { order } = makeGoldenOrder();
    const before = JSON.stringify({
      orderID: order.orderID,
      subtotal: order.subtotal.toDecimalString(),
      items: order.orderItems.map((item): readonly string[] => [
        item.orderItemID,
        item.price.toDecimalString(),
        item.extendedPrice.toDecimalString(),
      ]),
      appliedPromotions: order.appliedPromotions.length,
    });
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });

    await harness.invoke(postApplyPromotions(order));

    // The submitted view is READ and handed on. There is no setter to call, no `save`, no `delete` and
    // no `removeAppliedPromotions` on any of these shapes - the legacy's three backwards clear-out
    // loops [model/service/PromotionService.cfc:L64-L80] are REPLACED by emitted intents, not
    // reproduced - so a consumer reconciles against what it already stores.
    expect(
      JSON.stringify({
        orderID: order.orderID,
        subtotal: order.subtotal.toDecimalString(),
        items: order.orderItems.map((item): readonly string[] => [
          item.orderItemID,
          item.price.toDecimalString(),
          item.extendedPrice.toDecimalString(),
        ]),
        appliedPromotions: order.appliedPromotions.length,
      }),
    ).toBe(before);
  });

  it('emits intents keyed ONLY by opaque identifiers, across all three applied types', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const fulfillment = order.orderFulfillments[0];

    if (fulfillment === undefined) {
      throw new TypeError('the golden order carries no fulfillment');
    }

    const harness = makeHarness({
      admit: order,
      promotionIntents: [
        itemIntent(firstItem.orderItemID, '3.01'),
        {
          operation: 'add',
          appliedType: 'order',
          orderID: order.orderID,
          promotionID: PROMOTION_ID,
          discountAmount: Money.fromDecimalString('5.00'),
        },
        {
          operation: 'add',
          appliedType: 'orderFulfillment',
          orderFulfillmentID: fulfillment.orderFulfillmentID,
          promotionID: PROMOTION_ID,
          discountAmount: Money.fromDecimalString('1.25'),
        },
      ],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const intents = promotionIntentsOf(body);

    expect(intents.map((intent): string => intent.appliedType)).toEqual([
      'orderItem',
      'order',
      'orderFulfillment',
    ]);
    // `model/entity/PromotionApplied.cfc` holds real foreign keys into the out-of-scope Order,
    // OrderItem and OrderFulfillment [:L58, L59, L61]; this boundary reaches all three as OPAQUE
    // strings only. No entity, no association and no ORM handle crosses the wire.
    const serialized = JSON.stringify(intents);
    expect(serialized).toContain(firstItem.orderItemID);
    expect(serialized).toContain(order.orderID);
    expect(serialized).toContain(fulfillment.orderFulfillmentID);
    expect(serialized).not.toContain('getSkuID');
    expect(serialized).not.toContain('_orm');
  });

  it('renders discountAmount at FULL PRECISION, never rounded to a presentation form', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(firstItem.orderItemID, '7.49625')],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    // `Money.toDecimalString()` and NOT `toFixed2()`, and the difference is money: an intent is a
    // write-side instruction destined for a `big_decimal` column [model/entity/PromotionApplied.cfc:L51],
    // and a `big_decimal` column is precisely one that declines to round on the caller's behalf. The
    // legacy's own `numberFormat(discountAmount,"0.00")` [model/service/PromotionService.cfc:L1017] is
    // return-value PRESENTATION at the end of a calculating function, not a persistence step.
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
    // The presentation form the legacy's own `numberFormat` would have produced is ABSENT from the
    // wire: a rounded amount reaching a `big_decimal` column is money quietly lost.
    expect(JSON.stringify(body.promotionIntents)).not.toContain('7.50');
  });

  it('OMITS discountAmount on a removal rather than rendering a zero', async () => {
    const { order } = makeGoldenOrder();
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      admit: order,
      promotionIntents: [
        {
          operation: 'remove',
          appliedType: 'orderItem',
          orderItemID: firstItem.orderItemID,
          promotionAppliedID: 'pa-existing-0001',
          // NULLABLE on the persisted-row removal shape alone: the legacy's blanket clear never reads
          // the association and the foreign key declares no `notnull`
          // [model/entity/PromotionApplied.cfc:L58], so a row it clears must stay representable. It is
          // carried here because a consumer auditing what it detached should not have to re-read the row.
          promotionID: PROMOTION_ID,
        },
      ],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const [intent] = promotionIntentsOf(body);

    // A removal carries no amount at all: `discountAmount` is `?: never` on that variant, and a zero
    // would state a discount of nothing rather than the absence of one.
    expect(intent?.operation).toBe('remove');
    expect(intent === undefined ? true : 'discountAmount' in intent).toBe(false);
  });

  it('renders price-group intents alongside them, in the order the pass emitted', async () => {
    const { order } = makeGoldenOrder();
    const first = itemAt(order, 0);
    const second = itemAt(order, 1);
    const harness = makeHarness({
      admit: order,
      priceGroupIntents: [
        {
          orderItemID: second.orderItemID,
          price: Money.fromDecimalString('9.50'),
          priceGroupID: 'pg-second-0002',
        },
        {
          orderItemID: first.orderItemID,
          price: Money.fromDecimalString('11.00'),
          priceGroupID: 'pg-first-0001',
        },
      ],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    // EMITTED ORDER, with no sort, re-rank, filter or de-duplication: the descending insert-sort of
    // qualified discounts [model/service/PromotionService.cfc:L266-L294] and the single-best-per-item
    // application [:L524-L537] are decisions the engine already made.
    expect((body.priceGroupIntents ?? []).map((intent): string => intent.orderItemID)).toEqual([
      second.orderItemID,
      first.orderItemID,
    ]);
    expectSameAmount((body.priceGroupIntents ?? [])[0]?.price ?? '', '9.50');
  });

  it('serves an EMPTY intent set as an ordinary 200', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));
    const body = successBodyOf(result);

    // An empty array is a valid result and, for a return order, the CORRECT one - see the preserved
    // `issue #1766` no-op, which the services suite owns.
    expect(result.statusCode).toBe(200);
    expect(body.promotionIntents).toEqual([]);
    expect(body.priceGroupIntents).toEqual([]);
  });

  it('exposes nothing whatsoever for PromotionAccount, which is inert in this slice', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.body.toLowerCase()).not.toContain('promotionaccount');
  });
});

// ===========================================================================
// SECTION 7 - SAFE DIAGNOSTICS AT THE HANDLER SEAM
//
// Engine arithmetic and ordering belong to the services tier. This suite programs
// the composed operation with data and verifies only what the handler owns.
// ===========================================================================

describe('safe handler diagnostics (NET-NEW)', () => {
  it('logs COUNTS about the priced order and no identifier or amount', async () => {
    const { order } = makeGoldenOrder({ accountID: AUTHENTICATED_ACCOUNT_ID });
    const firstItem = itemAt(order, 0);
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(firstItem.orderItemID, '3.01')],
    });

    await harness.invoke(postApplyPromotions(order, {}, authorizerFor(AUTHENTICATED_ACCOUNT_ID)));

    const emitted = harness.emitted.lines.join('\n');

    // An order document is caller-authored and a log stream is not the place to reproduce one. The
    // whole capture is asserted as TEXT, so a leak inside a field nobody inspected still fails.
    expect(emitted).toContain('orderItemCount');
    expect(emitted).toContain('promotionIntentCount');
    expect(emitted).not.toContain(order.orderID);
    expect(emitted).not.toContain(firstItem.orderItemID);
    expect(emitted).not.toContain(AUTHENTICATED_ACCOUNT_ID);
    expect(emitted).not.toContain('3.01');
  });
});

// ===========================================================================
// CONCERN 7 - THE SALE-PRICE OPERATION
// ===========================================================================

describe('the sale-price operation reachable through this adapter (NET-NEW)', () => {
  it('serves getSalePriceDetailsForProductSkus and renders every member safely', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.49375'),
          originalPrice: Money.fromDecimalString('19.99'),
          promotionID: SALE_PRICE_PROMOTION_ID,
          roundingRuleID: 'rr-closest-0001',
          salePriceExpirationDateTime: new Date('2024-12-31T23:59:59.000Z'),
        },
      },
    });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.salePriceRequests).toEqual([PRODUCT_ID]);
    // No order view is involved: the legacy signature takes a plain string
    // [model/service/PromotionService.cfc:L1022], so there is nothing to materialise and nothing to
    // hydrate.
    expect(harness.recorder.composedInputs).toHaveLength(0);
    expect(harness.recorder.materializedDocuments).toHaveLength(0);

    const detail = successBodyOf(result).salePriceDetails?.[SALE_PRICE_SKU_ID];
    expect(detail?.skuID).toBe(SALE_PRICE_SKU_ID);
    expectSameAmount(detail?.salePrice ?? '', '17.49375');
    expectSameAmount(detail?.originalPrice ?? '', '19.99');
    expect(detail?.roundingRuleID).toBe('rr-closest-0001');
    // ISO-8601, hence UTC by definition.
    expect(detail?.salePriceExpirationDateTime).toBe('2024-12-31T23:59:59.000Z');
  });

  it('preserves a reserved opaque SKU key as an own sale-price member', async () => {
    const reservedSkuID = '__proto__';
    const salePriceDetails: Record<string, SalePriceDetail> = {};
    Object.defineProperty(salePriceDetails, reservedSkuID, {
      configurable: true,
      enumerable: true,
      value: {
        skuID: reservedSkuID,
        discountLevel: 'sku',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString('8.50'),
        promotionID: SALE_PRICE_PROMOTION_ID,
      },
      writable: true,
    });
    const harness = makeHarness({ salePriceDetails });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );
    const rendered = successBodyOf(result).salePriceDetails;

    expect(result.statusCode).toBe(200);
    expect(rendered).toBeDefined();
    expect(rendered === undefined ? false : Object.hasOwn(rendered, reservedSkuID)).toBe(true);
    expect(rendered?.[reservedSkuID]?.skuID).toBe(reservedSkuID);
    expect(Object.getPrototypeOf(rendered)).toBe(Object.prototype);
  });

  it('OMITS an absent sale-price member rather than coercing it to zero or the epoch', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'global',
          salePriceDiscountType: 'amount',
          salePrice: Money.fromDecimalString('9.99'),
          promotionID: SALE_PRICE_PROMOTION_ID,
        },
      },
    });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );

    const detail = successBodyOf(result).salePriceDetails?.[SALE_PRICE_SKU_ID];

    // An absent `originalPrice` is not zero - that would understate a saving - and an absent expiration
    // is not the epoch, which would expire a live sale. Both keys are simply ABSENT.
    expect(detail).toBeDefined();
    expect(detail === undefined ? true : 'originalPrice' in detail).toBe(false);
    expect(detail === undefined ? true : 'salePriceExpirationDateTime' in detail).toBe(false);
    expect(detail === undefined ? true : 'roundingRuleID' in detail).toBe(false);
    expect(result.body).not.toContain('1970-01-01');
  });

  it('serves an empty detail map without inventing a member', async () => {
    const harness = makeHarness({ salePriceDetails: {} });

    const result = await harness.invoke(
      postDocument({
        operation: 'getSalePriceDetailsForProductSkus',
        productID: PRODUCT_ID,
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(successBodyOf(result).salePriceDetails).toEqual({});
    // The comma-list helper is exercised on the empty string precisely because `listLen('')` is 0 and a
    // naive `split(',').length` would answer 1 - the CFML semantics this subtree preserves.
    expect(listLen('')).toBe(0);
  });

  it('refuses a getSalePriceDetailsForProductSkus payload with no productID, by member path', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      postDocument({ operation: 'getSalePriceDetailsForProductSkus' }),
    );

    // The discriminated envelope refuses it before the dispatcher, which is why the dispatcher has no
    // "selected this operation but sent no product" branch to test.
    expect(result.statusCode).toBe(400);
    expect(harness.recorder.salePriceRequests).toEqual([]);
  });
});

// ===========================================================================
// CONCERN 8 - RESPONSE SHAPING AND SAFE ERROR MAPPING
// ===========================================================================

/**
 * Internal diagnostic text that must reach the LOG and never a caller.
 *
 * Deliberately shaped like the thing that actually leaks in practice - a driver failure that has
 * embedded statement text - and deliberately INVENTED: it names a table this schema really has and
 * nothing else. It carries no host, no account, no credential and no connection value of any kind,
 * because a test that needed a real one to make its point would be a worse test.
 */
const WITHHELD_INTERNAL_DETAIL =
  'SELECT skuID FROM SwSku WHERE skuID = ? -- invented diagnostic text, callers must never see this';

/**
 * The framework's dead-call-target sentence, byte for byte.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]:
 * `'You have called a method #arguments.missingMethodName#() which does not exists in the
 * #getClassName()# entity.'` - and "does not exists" is REPRODUCED, not corrected, because it is an
 * observable contract a legacy consumer may already match on.
 *
 * The method named here is the real one: LEGACY-DEFECT [model/entity/Sku.cfc:L258]
 * `getPriceByPromotion` calls `calculateSkuPriceBasedOnPromotion`, which does not exist on the
 * service, so this sentence is what that call site produces at runtime.
 * Preserved deliberately; do not fix without a product decision.
 *   The target reproduces it as a throwing stub on the entity tier. This adapter neither calls it nor
 *   silences it - it recognises the sentence and republishes it, which is the whole of its obligation.
 */
const MISSING_METHOD_SENTENCE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

/** An error whose NAME is identifier-shaped and whose MESSAGE is the detail that must be withheld. */
class WithheldDetailError extends Error {
  public constructor() {
    super(WITHHELD_INTERNAL_DETAIL);
    this.name = 'WithheldDetailError';
  }
}

/** The sentences `src/handlers/errorMapper.ts` owns, restated here so a drift in either side fails. */
const GENERIC_FAILURE_SENTENCE = 'The request could not be completed.';
const ROUTE_NOT_FOUND_SENTENCE = 'The requested route does not exist.';
const INVALID_INPUT_SENTENCE = 'The request input is not valid.';
const MISSING_BODY_SENTENCE = 'A request body is required and was not supplied.';
const UNPARSABLE_BODY_SENTENCE = 'The request body is not valid JSON.';
const UNSUPPORTED_SHAPE_SENTENCE = 'The request body is not the expected shape.';

/**
 * Every status this handler is permitted to return, and nothing else.
 *
 * ★★ 403 JOINED THE SET WITH SEC-I. The route is restricted to a TRUSTED SERVICE PRINCIPAL, and an
 * identified caller without that permission is refused with 403 rather than 401 - an identity WAS
 * established and is insufficient - and rather than 404, which would also hide the route from a trusted
 * caller misconfigured to omit its claim.
 */
const PERMITTED_STATUSES: readonly number[] = [200, 400, 401, 403, 404, 500];

/** Header names that would invent a semantic the source never had. */
const FORBIDDEN_HEADER_NAMES: readonly string[] = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-circuit-state',
  'www-authenticate',
];

/** Assert a response carries the two frozen headers and no invented third semantic. */
function expectSafeResponseEnvelope(result: APIGatewayProxyResult): void {
  expect(PERMITTED_STATUSES).toContain(result.statusCode);

  const headers = result.headers ?? {};
  expect(headers['content-type']).toBe('application/json; charset=utf-8');
  // `no-store`, because a priced order belongs to one account at one instant and an intermediary
  // caching it would serve one customer's discount to another.
  expect(headers['cache-control']).toBe('no-store');
  // ★ AND NO THIRD. `x-content-type-options: nosniff` briefly joined the shared builder's set and a
  // code review withdrew it: the ported system had no such HTTP semantic and the AAP prescribes none,
  // so emitting it invented a non-functional requirement (0.8.1). The exact list below is what keeps
  // every invented header out, this one included.
  expect(headers['x-content-type-options']).toBeUndefined();

  const headerNames = Object.keys(headers).map((name): string => name.toLowerCase());
  expect(headerNames).toEqual(['content-type', 'cache-control']);
  for (const forbidden of FORBIDDEN_HEADER_NAMES) {
    expect(headerNames).not.toContain(forbidden);
  }
}

describe('response shaping and safe error mapping (NET-NEW)', () => {
  it('★★★ shapes a 200 as the SHARED envelope, with this capability nested under `result`', async () => {
    // ★★★ THIS CASE WAS NAMED "the four echoed envelope members" AND IT ENCODED F13 AND F6.
    // It asserted `{operation, idempotencyKey, requestId, evaluatedAt}` at the TOP of the body, under a
    // note reading "the idempotency key and the correlation id so a retry can be joined to the decision
    // it already received". Two things were wrong with that. The top level is now the ONE envelope all
    // five entrypoints answer with - `{requestId, capability, action, result}` - so a caller no longer
    // has to know which capability it called in order to find the correlation identifier (F13). And the
    // key it echoed was honoured by nothing: no ledger, no receipt, no stable instant, so echoing it
    // asserted a retry guarantee the code never made (F6). What survives is the pair that IS
    // load-bearing: the operation, so a caller knows which arm answered, and `evaluatedAt`, so the
    // promotion-period window [model/entity/PromotionPeriod.cfc:L78] this invocation resolved against
    // is auditable afterwards.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order));
    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(200);

    const served = servedEnvelopeOf(result);
    const body = served.result;

    // The shared envelope, member for member, in the order the mapper writes them.
    expect(Object.keys(served)).toEqual(['requestId', 'capability', 'action', 'result']);
    expect(served.requestId).toBe(PLATFORM_REQUEST_ID);
    expect(served.capability).toBe('promotionApplication');
    expect(served.action).toBe('applyPromotions');

    expect(body.operation).toBe('applyPromotions');
    // GONE, not moved: nothing in the served document names an idempotency key any more.
    expect(body).not.toHaveProperty('idempotencyKey');
    // And the correlation identifier is the ENVELOPE's, not the document's.
    expect(body).not.toHaveProperty('requestId');
    expect(body.evaluatedAt).toBe(EVALUATED_AT);
    // ISO-8601 IN UTC, which is the whole point of an explicit instant rather than a server-local one.
    expect(body.evaluatedAt.endsWith('Z')).toBe(true);
    expect(new Date(body.evaluatedAt).toISOString()).toBe(EVALUATED_AT);

    // Both intent collections are reported, and BOTH are arrays even when a pass decided nothing -
    // an empty result is a decision, never an absence.
    expect(Array.isArray(body.promotionIntents)).toBe(true);
    expect(Array.isArray(body.priceGroupIntents)).toBe(true);
    // The `salePriceDetails` member belongs to the OTHER operation and is omitted here rather than
    // sent as an empty object: `exactOptionalPropertyTypes` is on and absence is expressible. Read off
    // the SERIALISED body rather than the narrowed reader, so an omitted key cannot be confused with a
    // key present and undefined.
    expect(Object.hasOwn(served.result, 'salePriceDetails')).toBe(false);

    // No status the source never had, and no 201/202 either: both operations are DECISIONS rather
    // than durable writes, so there is no resource created to report and no acceptance to acknowledge.
    expect(result.statusCode).not.toBe(201);
    expect(result.statusCode).not.toBe(202);
  });

  it('★★★ is retry-safe BY CONSTRUCTION: the same document decides identically with NO key', async () => {
    // ★★★ THIS CASE WAS AN INVERSION, NOT A REPAIR. It was named "echoes each caller idempotency key
    // and decides IDENTICALLY on a replay", and the review said of it: "The replay case ... compares two
    // independently executed requests with DIFFERENT keys; it does not establish idempotency, supporting
    // F6". That is exactly right, and it is worth being precise about why. The case asserted
    //
    //   * `expect(firstBody.idempotencyKey).toBe(IDEMPOTENCY_KEY)`
    //   * `expect(replayBody.idempotencyKey).toBe(REPLAY_IDEMPOTENCY_KEY)`
    //   * `expect(firstBody.idempotencyKey).not.toBe(replayBody.idempotencyKey)`
    //
    // under a note reading "That is why the key is echoed rather than looked up". Every one of those
    // three assertions is about ECHO, and echo is not idempotency: a key that is copied from the request
    // into the response and consulted nowhere in between constrains nothing. Worse, the two arms sent
    // DIFFERENT keys, so even a handler that DID maintain a ledger would legitimately have recomputed -
    // the case could not have detected the presence or absence of one either way.
    //
    // What is actually true, and what this case now proves, is stronger and needs no key at all: this
    // entrypoint is retry-safe BY CONSTRUCTION. Both operations are DECISIONS - `updateOrderAmounts...`
    // emits intents and persists nothing [model/service/PromotionService.cfc:L58, and the
    // anti-corruption inversion in AAP 0.6.1] - so re-sending the same document recomputes the same
    // answer. Sameness is asserted on the SERIALISED document, byte for byte, with the per-invocation
    // correlation identifier deliberately made to DIFFER so that the comparison cannot pass by accident
    // of both arms having been handed the same one.
    const first = makeGoldenOrder();
    const firstHarness = makeHarness({
      admit: first.order,
      promotionIntents: [itemIntent(itemAt(first.order, 0).orderItemID, '3.01')],
    });
    const document = applyPromotionsDocument(wireOrderDocument(first.order));
    const firstResult = await firstHarness.invoke(
      makeProxyEvent({
        body: JSON.stringify(document),
        requestId: 'req-promotion-application-first',
        ...(first.order.accountID === undefined
          ? {}
          : { authorizer: authorizerFor(first.order.accountID) }),
      }),
    );

    const replay = makeGoldenOrder();
    const replayHarness = makeHarness({
      admit: replay.order,
      promotionIntents: [itemIntent(itemAt(replay.order, 0).orderItemID, '3.01')],
    });
    // THE VERY SAME BYTES, re-sent. Not a second document that happens to look similar.
    const replayResult = await replayHarness.invoke(
      makeProxyEvent({
        body: JSON.stringify(document),
        requestId: 'req-promotion-application-replay',
        ...(replay.order.accountID === undefined
          ? {}
          : { authorizer: authorizerFor(replay.order.accountID) }),
      }),
    );

    expectSafeResponseEnvelope(replayResult);
    expect(replayResult.statusCode).toBe(200);

    const firstServed = servedEnvelopeOf(firstResult);
    const replayServed = servedEnvelopeOf(replayResult);

    // NEITHER response names a key, so there is nothing to echo and nothing to look up.
    expect(firstResult.body).not.toContain('idempotencyKey');
    expect(replayResult.body).not.toContain('idempotencyKey');

    // The correlation identifier is PER INVOCATION, which is the one member that legitimately differs.
    expect(firstServed.requestId).toBe('req-promotion-application-first');
    expect(replayServed.requestId).toBe('req-promotion-application-replay');
    expect(firstServed.requestId).not.toBe(replayServed.requestId);

    // And the DECISION is byte-identical. Compared on the serialised document rather than field by
    // field, so an added, dropped or reordered member fails this too.
    expect(JSON.stringify(replayServed.result)).toBe(JSON.stringify(firstServed.result));
    expect(promotionIntentsOf(replayServed.result)).toEqual(promotionIntentsOf(firstServed.result));
    expect(replayServed.result.priceGroupIntents).toEqual(firstServed.result.priceGroupIntents);

    // The replay RECOMPUTED - it drove the composed operation once, in the same order - rather than
    // being answered from a cached receipt. Recomputation is the mechanism; identity is the guarantee.
    expect(replayHarness.recorder.composedInputs).toHaveLength(1);
    expect(replayHarness.recorder.log).toEqual(firstHarness.recorder.log);
  });

  it('answers 404 for an unmatched route WITHOUT ever opening a composition root', async () => {
    // ★ THE ONE PATH THE PRODUCTION HANDLER CAN BE DRIVEN THROUGH IN A UNIT SUITE. Route resolution
    // happens BEFORE the memoized composition root is awaited, so an unmatched route never touches a
    // database, a pool, a credential or `src/lib/config.ts`. This suite runs with NO environment at
    // all, so had the root been opened the configuration contract would have refused and the answer
    // would have been a 500 instead - which is precisely what makes the 404 below load-bearing rather
    // than incidental.
    const result = await productionHandler(
      makeProxyEvent({ path: '/promotions/not-a-route', httpMethod: 'POST' }),
    );

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(404);

    const error = errorBodyOf(result);
    expect(error.category).toBe('routeNotFound');
    expect(error.message).toBe(ROUTE_NOT_FOUND_SENTENCE);
    expect(error.requestId).toBe(PLATFORM_REQUEST_ID);
    // The submitted path is LOGGED, never echoed: reflecting a caller-authored path back serves no
    // diagnostic purpose the correlation identifier does not already serve.
    expect(result.body).not.toContain('not-a-route');
    expect(Object.hasOwn(error, 'fields')).toBe(false);
  });

  it('answers 404 for a route belonging to ANOTHER capability, disclosing nothing about it', async () => {
    // The four sibling capabilities are separate deployables. A request for one of their routes folds
    // into the SAME arm as a route that exists nowhere, so no response ever confirms which other
    // routes this service knows about.
    const otherCapabilityRoute = ROUTE_TABLE.priceResolution;
    expect(otherCapabilityRoute.path).not.toBe(CAPABILITY_ROUTE.path);

    const result = await productionHandler(
      makeProxyEvent({ path: otherCapabilityRoute.path, httpMethod: otherCapabilityRoute.methods }),
    );

    expect(result.statusCode).toBe(404);
    const error = errorBodyOf(result);
    expect(error.category).toBe('routeNotFound');
    expect(error.message).toBe(ROUTE_NOT_FOUND_SENTENCE);
    expect(result.body).not.toContain(otherCapabilityRoute.path);
    expect(result.body).not.toContain(otherCapabilityRoute.capability);
    expect(result.body).not.toContain(otherCapabilityRoute.action);
  });

  it('answers 400 with the shipped sentence for an absent, blank or unparsable body', async () => {
    // Three DISTINCT reasons, three DISTINCT frozen sentences, and not one of them interpolates a
    // media type, a parser position or a fragment of what was sent. A blank body is treated as ABSENT
    // rather than as an empty document, which is the honest reading: whitespace is not a document.
    const absent = makeHarness();
    const absentResult = await absent.invoke(makeProxyEvent({}));
    expectSafeResponseEnvelope(absentResult);
    expect(absentResult.statusCode).toBe(400);
    expect(errorBodyOf(absentResult).category).toBe('invalidRequest');
    expect(errorBodyOf(absentResult).message).toBe(MISSING_BODY_SENTENCE);

    const blank = makeHarness();
    const blankResult = await blank.invoke(makeProxyEvent({ body: '   \n\t  ' }));
    expect(blankResult.statusCode).toBe(400);
    expect(errorBodyOf(blankResult).message).toBe(MISSING_BODY_SENTENCE);

    const unparsable = makeHarness();
    const unparsableResult = await unparsable.invoke(
      makeProxyEvent({ body: '{"operation":"applyPromotions",' }),
    );
    expect(unparsableResult.statusCode).toBe(400);
    expect(errorBodyOf(unparsableResult).message).toBe(UNPARSABLE_BODY_SENTENCE);
    // The truncated fragment is not quoted back, and no parser position is disclosed.
    expect(unparsableResult.body).not.toContain('applyPromotions"');
    expect(unparsableResult.body.toLowerCase()).not.toContain('position');

    // None of the three reached the graph: no root, no scope, no pass.
    for (const harness of [absent, blank, unparsable]) {
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('answers 400 for a body that parsed but is not this document', async () => {
    // An array IS a JSON document; it is not THIS document. `null` and a scalar fold into the same
    // reason, because the distinction a caller needs is "not the expected shape" and nothing finer.
    for (const body of ['[]', 'null', '42', '"applyPromotions"']) {
      const harness = makeHarness();
      const result = await harness.invoke(makeProxyEvent({ body }));

      expectSafeResponseEnvelope(result);
      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).category).toBe('invalidRequest');
      expect(errorBodyOf(result).message).toBe(UNSUPPORTED_SHAPE_SENTENCE);
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('★★ answers 400 for a `__proto__` own key, at the ROOT and NESTED alike (QA-I3)', async () => {
    // ★★ THE ONE UNRECOGNIZED KEY `z.strictObject` DOES NOT REFUSE. QA testing submitted it and
    // measured both halves: zod ACCEPTS an own `__proto__` and silently drops it, at every nesting
    // level, while rejecting a `constructor` key in the same position - and `Object.prototype` is left
    // unmodified either way. So this is an INCONSISTENCY being closed rather than an active
    // vulnerability: a caller sending a member this request does not accept is now told so, exactly as
    // it is told about every other unrecognized member.
    //
    // ⚠ EVERY FIXTURE HERE IS RAW JSON TEXT, WHICH IS THE ONLY CONSTRUCTION THAT REPRODUCES THE INPUT.
    // An object literal `{ __proto__: {} }` invokes the prototype SETTER and creates no own property,
    // so a fixture built that way would contain nothing to detect and this case would pass while the
    // guard did nothing. API Gateway delivers text; `JSON.parse` makes it an own data property.
    //
    // ★★★ THE NESTED ROW NO LONGER EXPECTS `order.__proto__`, AND THAT REVISION IS THE POINT OF THIS
    // CASE NOW. It used to, and a security review found (MAJOR, CWE-209/CWE-532) that the ancestor
    // segments of such a path are member names THE CALLER CHOSE, reaching both the 400 body and the log
    // stream. The third row is the proof: its ancestor is named like a credential, and neither the
    // response nor the diagnostic may repeat it. What is published instead is one frozen issue naming
    // the offending key - the only member name involved that the caller did not choose.
    const bodies: readonly string[] = [
      '{"operation":"updateOrderAmountsWithPromotions","__proto__":{"p":1}}',
      '{"operation":"updateOrderAmountsWithPromotions","order":{"orderID":"o-1","__proto__":{"p":1}}}',
      `{"operation":"updateOrderAmountsWithPromotions","${PLANTED_ANCESTOR_KEY}":{"__proto__":{"p":1}}}`,
    ];

    for (const body of bodies) {
      const harness = makeHarness();
      const result = await harness.invoke(makeProxyEvent({ body }));

      expectSafeResponseEnvelope(result);
      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).category).toBe('invalidRequest');
      // ONE fixed issue, whatever the depth. No ancestor, no value, no depth.
      expect(fieldPathsOf(result)).toStrictEqual(['__proto__']);
      expect(result.body).not.toContain(PLANTED_ANCESTOR_KEY);
      // ★★ AND NOTHING THE CALLER WROTE REACHES THE DIAGNOSTIC EITHER. The refusal is logged by
      // `errorMapper.invalidRequestResponse`, which used to copy every published path onto the stream
      // under `fieldPaths`; it now carries a closed reason and a count.
      expect(harness.emitted.lines.join('\n')).not.toContain(PLANTED_ANCESTOR_KEY);
      expect(harness.emitted.lines.join('\n')).not.toContain('fieldPaths');
      // ★ AND THE REFUSAL IS TOTAL: no composition root was opened, so nothing was priced and no
      // connection was taken from the pool.
      expect(harness.recorder.log).toEqual([]);
    }

    // The finding's own central observation, re-asserted rather than taken on trust.
    expect(Object.prototype).not.toHaveProperty('p');
  });

  it('honours a base64-encoded body, because the platform sets that flag', async () => {
    // Ignoring `isBase64Encoded` would turn a perfectly well-formed document into an unparsable one
    // and answer 400 to a valid request, so it is honoured rather than assumed absent.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ materialize: order });
    // The REAL wire document, base64-encoded whole. The previous revision encoded a bare `{orderID}`
    // reference plus a body `accountID`; both of those are gone, so what is encoded here is the same
    // document every other admitted case posts and the account travels on the authorizer (finding F2).
    const document = applyPromotionsDocument(wireOrderDocument(order));

    const result = await harness.invoke(
      makeProxyEvent({
        body: Buffer.from(JSON.stringify(document), 'utf8').toString('base64'),
        isBase64Encoded: true,
        ...(order.accountID === undefined ? {} : { authorizer: authorizerFor(order.accountID) }),
      }),
    );

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(200);
    // Decoded, admitted and PRICED - asserted on the operation the document named rather than on an
    // echoed key, which no longer exists (finding F6).
    expect(successBodyOf(result).operation).toBe('applyPromotions');
    expect(harness.recorder.composedInputs).toHaveLength(1);
  });

  it('answers 400 with safe schema paths and never with caller-authored unknown names or values', async () => {
    // ★★★ TWO OF THESE FOUR ROWS USED TO ASSERT THAT AN IDEMPOTENCY KEY WAS REQUIRED AND
    // CHARACTER-FILTERED - "The key is REQUIRED on both envelopes: without it a retry cannot be joined
    // to its decision" - which is finding F6: nothing joined anything, because nothing stored anything.
    // The key is withdrawn, so the first row now carries the OTHER caller-supplied field this handler
    // must never honour (finding F2), and the second keeps the property the case exists for - a refused
    // VALUE is never quoted back - now that the key is refused as an unrecognized member instead.
    const { order } = makeGoldenOrder();
    const forbiddenKey = 'idem key with spaces and a slash/';
    const smuggledAccountID = 'account-smuggled-in-the-body-0001';

    const cases: readonly {
      readonly document: Readonly<Record<string, unknown>>;
      readonly safePath: string;
      readonly absentFromBody: readonly string[];
    }[] = [
      {
        // `accountID` is a server-known compatibility member with an explicit refusal, so its fixed
        // path remains actionable. Only the submitted identifier is absent from the response.
        document: applyPromotionsDocument(wireOrderDocument(order), {
          accountID: smuggledAccountID,
        }),
        safePath: 'accountID',
        absentFromBody: [smuggledAccountID, 'smuggled'],
      },
      {
        // The key is refused as an unrecognized member, and neither its NAME nor its VALUE reaches
        // the response body.
        document: applyPromotionsDocument(wireOrderDocument(order), {
          idempotencyKey: forbiddenKey,
        }),
        safePath: '',
        absentFromBody: ['idempotencyKey', forbiddenKey, 'spaces'],
      },
      {
        // The discriminated union makes "a getSalePriceDetailsForProductSkus request with no productID" a validation
        // failure carrying a member path, rather than a value some later branch has to re-check.
        document: { operation: 'getSalePriceDetailsForProductSkus' },
        safePath: 'productID',
        absentFromBody: [],
      },
      {
        // A third operation nobody published: the discriminator itself fails, and the offending value
        // is not quoted back.
        document: { operation: 'deleteEverything' },
        safePath: 'operation',
        absentFromBody: ['deleteEverything'],
      },
    ];

    for (const testCase of cases) {
      const harness = makeHarness({ materialize: order });
      const result = await harness.invoke(postDocument(testCase.document));

      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).message).toBe(INVALID_INPUT_SENTENCE);
      expect(fieldPathsOf(result)).toContain(testCase.safePath);
      for (const submittedValue of testCase.absentFromBody) {
        expect(result.body).not.toContain(submittedValue);
      }
    }
  });

  it('answers 500 with ONLY the generic sentence for an unrecognised failure', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, failure: new WithheldDetailError() });

    const result = await harness.invoke(postApplyPromotions(order));
    const failure = errorBodyOf(result);

    expect(result.statusCode).toBe(500);
    expectSafeResponseEnvelope(result);
    expect(failure.category).toBe('unrecognized');
    expect(failure.message).toBe(GENERIC_FAILURE_SENTENCE);
    expect(failure.requestId).toBe(PLATFORM_REQUEST_ID);
    // Three members exactly, and `fields` omitted rather than present and empty.
    expect(Object.keys(failure).sort()).toEqual(['category', 'message', 'requestId']);
    // A driver failure routinely embeds statement text and bound values, and NONE of it may reach a
    // caller. The classification goes to the log stream under the same correlation identifier.
    expect(result.body).not.toContain(WITHHELD_INTERNAL_DETAIL);
    expect(result.body).not.toContain('SwSku');
    expect(result.body).not.toContain('WithheldDetailError');
    expect(harness.emitted.lines.join('\n')).toContain('WithheldDetailError');
  });

  it('reproduces the framework dead-call-target sentence byte for byte, as a 500', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, failure: new Error(MISSING_METHOD_SENTENCE) });

    const result = await harness.invoke(postApplyPromotions(order));

    // The mapper recognises the framework's own contract by message shape - grammatical error included
    // - and republishes it. This handler neither calls the dead target nor silences it.
    expect(result.statusCode).toBe(500);
    expect(errorBodyOf(result).category).toBe('missingMethod');
    expect(errorBodyOf(result).message).toBe(MISSING_METHOD_SENTENCE);
  });

  it('returns nothing but the permitted statuses, over every failure this suite can drive', async () => {
    const { order } = makeGoldenOrder();
    const statuses = [
      (await productionHandler(makeProxyEvent({ path: '/nowhere' }))).statusCode,
      (await makeHarness().invoke(makeProxyEvent({}))).statusCode,
      (await makeHarness().invoke(makeProxyEvent({ body: '{' }))).statusCode,
      (await makeHarness().invoke(makeProxyEvent({ body: '[]' }))).statusCode,
    ];
    statuses.push(
      // A document that PARSES and then fails the schema. This used to be a bare `{orderID}` reference,
      // refused because the withdrawn idempotency key was missing; it is now a complete, admissible
      // document carrying ONE smuggled control member, which `z.strictObject` refuses by name.
      (
        await makeHarness({ admit: order }).invoke(
          postDocument(
            applyPromotionsDocument(wireOrderDocument(order), { accountID: 'account-smuggled' }),
          ),
        )
      ).statusCode,
      (
        await makeHarness({
          refuseAdmission: new OrderViewAdmissionError('unsupportedBodyShape', []),
        }).invoke(postApplyPromotions(order))
      ).statusCode,
      (await makeHarness().invoke(makeProxyEvent({ authorizer: null }))).statusCode,
    );

    for (const status of statuses) {
      expect(PERMITTED_STATUSES).toContain(status);
    }
    // The handler owns one explicit unauthenticated arm, but invents no permission, conflict,
    // semantic-validation or rate-limit status and publishes no authentication challenge.
    expect(statuses).toContain(401);
    expect(statuses).not.toContain(403);
    expect(statuses).not.toContain(429);
  });

  it('correlates on the runtime request id when one is supplied, and the event id otherwise', async () => {
    const { order } = makeGoldenOrder();
    const runtime = makeHarness({ admit: order });
    const gateway = makeHarness({ admit: order });

    const runtimeContext: Context = {
      awsRequestId: 'runtime-0000-0000-0000-000000000009',
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'promotion-application',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:promotion-application',
      memoryLimitInMB: '512',
      logGroupName: '/aws/lambda/promotion-application',
      logStreamName: '2024/06/01/[$LATEST]000000000000',
      getRemainingTimeInMillis: (): number => refuse('Context.getRemainingTimeInMillis'),
      done: (): void => refuse('Context.done'),
      fail: (): void => refuse('Context.fail'),
      succeed: (): void => refuse('Context.succeed'),
    };

    const withRuntime = servedEnvelopeOf(
      await runtime.invoke(postApplyPromotions(order), runtimeContext),
    );
    const withoutRuntime = servedEnvelopeOf(await gateway.invoke(postApplyPromotions(order)));

    expect(withRuntime.requestId).toBe('runtime-0000-0000-0000-000000000009');
    expect(withoutRuntime.requestId).toBe(PLATFORM_REQUEST_ID);
  });

  it('TRIMS a padded platform correlation identifier before publishing it', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const body = servedEnvelopeOf(
      await harness.invoke(
        makeProxyEvent({
          requestId: `  ${PLATFORM_REQUEST_ID}  `,
          body: JSON.stringify(applyPromotionsDocument(wireOrderDocument(order))),
        }),
      ),
    );

    expect(body.requestId).toBe(PLATFORM_REQUEST_ID);
  });
});

// ===========================================================================
// SECTION 10 - THE FOUR REVIEW FINDINGS THAT HAVE NO OTHER HOME
//
// F7 (diagnostic legibility through the REAL logger), F9's deferred zone-read
// boundary, F12 (the resolved action is verified
// before anything is decoded) and F15 (the two closed domain unions) each pin a
// property that no other case in this file is about. They are collected here
// rather than scattered so that a reviewer checking the findings can read them
// as a block.
// ===========================================================================

/**
 * Mutual assignability, as a compile-time proposition.
 *
 * `true` only when the two types are the SAME type. One-way `extends` would be satisfied by a widening
 * - `'order' | 'orderItem' | 'orderFulfillment'` extends `string` - which is exactly the widening
 * finding F15 is about, so the test has to run in both directions.
 */
type IsExactly<TLeft, TRight> = [TLeft] extends [TRight]
  ? [TRight] extends [TLeft]
    ? true
    : false
  : false;

describe('the four findings with no other home (NET-NEW)', () => {
  // -------------------------------------------------------------------------
  // ★★★ F15: THE TWO MEMBERS ARE THE CLOSED DOMAIN UNIONS, NOT `string`.
  //
  // Both `operation` and `appliedType` were declared `string` on the rendered intent, under comments
  // asserting that the union was "NOT widened here" and that "no fourth applied type is invented" -
  // documentation that claimed a closed vocabulary the type system had already discarded. The two
  // propositions below are the claim made checkable: revert either declaration to `string` and this
  // file stops compiling.
  // -------------------------------------------------------------------------

  it('★★★ declares `appliedType` and `operation` as the DOMAIN unions (finding F15)', async () => {
    const appliedTypeIsTheDomainUnion: IsExactly<
      PromotionAppliedIntentDocument['appliedType'],
      PromotionAppliedType
    > = true;
    const operationIsTheDomainUnion: IsExactly<
      PromotionAppliedIntentDocument['operation'],
      PromotionAppliedIntent['operation']
    > = true;

    // Read so the two are not merely declared: a `noUnusedLocals` build would otherwise reject them,
    // and a reader deserves to see the proposition asserted rather than left as a bare annotation.
    expect(appliedTypeIsTheDomainUnion).toBe(true);
    expect(operationIsTheDomainUnion).toBe(true);

    // ★ AND THE VOCABULARY IS EXHAUSTIVE IN BOTH DIRECTIONS. The two maps below are
    // `Record<Union, true>` literals, so ADDING a member to either domain union makes this file fail to
    // compile until the map is extended - which is what stops a fourth applied type from appearing on
    // the wire silently. The keys are then used as the runtime membership set, so the compile-time and
    // runtime accountings cannot disagree.
    const everyAppliedType: Record<PromotionAppliedType, true> = {
      order: true,
      orderItem: true,
      orderFulfillment: true,
    };
    const everyIntentOperation: Record<PromotionAppliedIntent['operation'], true> = {
      add: true,
      update: true,
      remove: true,
    };

    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });
    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);

    const intents = promotionIntentsOf(successBodyOf(result));
    // NON-VACUITY: an empty collection would satisfy every membership test below.
    expect(intents.length).toBeGreaterThan(0);

    for (const intent of intents) {
      expect(Object.keys(everyAppliedType)).toContain(intent.appliedType);
      expect(Object.keys(everyIntentOperation)).toContain(intent.operation);
    }
  });

  // -------------------------------------------------------------------------
  // ★★★ F7: EVERY DIAGNOSTIC KEY THIS HANDLER EMITS IS LEGIBLE THROUGH THE REAL LOGGER.
  //
  // The logger's redaction list is MANDATORY and non-disableable, and it applies to KEY NAMES. A
  // handler that emits a key the list does not admit writes `[REDACTED]` into its own success line, so
  // an operator reading the stream learns nothing - which is the failure the finding describes. This
  // suite's recording logger is built from the SHIPPED logger through its sink seam, so the policy
  // under test here is the production one rather than a stand-in.
  // -------------------------------------------------------------------------

  it('★★★ renders every diagnostic key it emits, not `[REDACTED]` (finding F7)', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      promotionIntents: [itemIntent(itemAt(order, 0).orderItemID, '3.01')],
    });

    expect((await harness.invoke(postApplyPromotions(order))).statusCode).toBe(200);

    const successLine = requirePresent(
      harness.emitted.lines.find((line): boolean => line.includes('priced an order')),
      'the success log line',
    );

    // THE VALUES, rendered. Asserted as serialised JSON fragments so a key present with a redacted
    // value fails: `"capability":"[REDACTED]"` does not contain `"capability":"promotionApplication"`.
    expect(successLine).toContain('"capability":"promotionApplication"');
    expect(successLine).toContain('"action":"applyPromotions"');
    expect(successLine).toContain('"operation":"applyPromotions"');
    expect(successLine).toContain('"route":"POST /promotions/application"');
    expect(successLine).toContain(`"requestId":"${PLATFORM_REQUEST_ID}"`);
    expect(successLine).toContain('"accountEstablished":true');
    // The four COUNTS, which are what makes a line diagnostically useful without reproducing an order.
    expect(successLine).toContain('"orderItemCount":3');
    expect(successLine).toContain('"orderFulfillmentCount":2');
    expect(successLine).toContain('"promotionIntentCount":');
    expect(successLine).toContain('"priceGroupIntentCount":');
    // ★ THE WHOLE LINE, free of the marker. The assertion is on the UPPERCASE marker the logger
    // actually writes - a lowercase `[redacted]` could never match and would make this vacuous.
    expect(successLine).not.toContain('[REDACTED]');

    // ★ AND NOTHING FROM THE ORDER ITSELF. Counts only: no order identifier, no item identifier, no
    // monetary amount. A log stream is not the place to reproduce a caller-authored document.
    expect(successLine).not.toContain(order.orderID);
    expect(successLine).not.toContain(itemAt(order, 0).orderItemID);
    expect(successLine).not.toContain(order.subtotal.toDecimalString());
  });

  it('★★★ renders the OTHER log line too - the sale-price one (finding F7)', async () => {
    // This handler emits TWO info lines and the finding covers both. The sale-price arm publishes a
    // different count member, `resolvedSkuCount`, so proving the first line legible proves nothing
    // about this one.
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.49375'),
          promotionID: SALE_PRICE_PROMOTION_ID,
        },
      },
    });

    const result = await harness.invoke(
      postDocument({ operation: 'getSalePriceDetailsForProductSkus', productID: PRODUCT_ID }),
    );
    expect(result.statusCode).toBe(200);

    const line = requirePresent(
      harness.emitted.lines.find((candidate): boolean =>
        candidate.includes('resolved sale-price details'),
      ),
      'the sale-price log line',
    );

    expect(line).toContain('"capability":"promotionApplication"');
    expect(line).toContain('"action":"applyPromotions"');
    expect(line).toContain('"operation":"getSalePriceDetailsForProductSkus"');
    expect(line).toContain('"route":"POST /promotions/application"');
    expect(line).toContain('"resolvedSkuCount":1');
    expect(line).not.toContain('[REDACTED]');
    // A COUNT, never the identifiers or the amounts behind it.
    expect(line).not.toContain(SALE_PRICE_SKU_ID);
    expect(line).not.toContain('17.49375');
  });

  it('★★★ still REDACTS a key the allow-list does not admit, so the proof above is live (finding F7)', () => {
    // Without this the case above could pass because the logger admits everything. It does not: a
    // credential-shaped name is redacted whatever emits it, and `password` is the shortest way to show
    // that the policy is a real filter rather than a formality. Nothing in `src/` emits this key; it is
    // written straight to the recording logger.
    const probe = makeRecordingLogger();

    probe.logger.info('a probe line', {
      capability: 'promotionApplication',
      password: 'not-a-real-secret',
    });

    const line = requirePresent(probe.lines[0], 'the probe log line');

    expect(line).toContain('"capability":"promotionApplication"');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('not-a-real-secret');
  });

  // -------------------------------------------------------------------------
  // ★★★ F9's CONSUMER HALF: THIS HANDLER DOES NOT PREPARE ZONES ITSELF.
  //
  // The root now defers the unbounded zone read and the composed pricing operation
  // prepares it before either pass. The handler therefore opens a plain scope and
  // must never call `prepareAddressZoneEvaluation` itself; the double above throws
  // if it does.
  // -------------------------------------------------------------------------

  it('★★★ leaves address-zone preparation to the composed pricing operation (finding F9)', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    expect((await harness.invoke(postApplyPromotions(order))).statusCode).toBe(200);

    const scopeInput = requirePresent(harness.recorder.scopeInputs[0], 'a request-scope input');
    expect(Object.keys(scopeInput).sort()).toStrictEqual(['accountID', 'now']);
    expect(harness.recorder.log).toContain(COMPOSED_PRICING);
  });

  // -------------------------------------------------------------------------
  // ★★★ F12: THE RESOLVED ACTION IS VERIFIED BEFORE ANYTHING IS DECODED.
  //
  // The previous revision read `route.action` only as a log value and never compared it. The shared
  // table publishes ONE row per capability today, so the comparison cannot currently fail - and the
  // router's own note records that adding a second route to a capability later is ADDITIVE, at which
  // point an action this module does not implement must fall out as a non-route rather than reaching
  // the dispatcher. Both halves are pinned: the table's shape today, and the ORDER of the two steps.
  // -------------------------------------------------------------------------

  it('★★★ publishes exactly ONE route for this capability, whose action the module implements (finding F12)', () => {
    const route = ROUTE_TABLE.promotionApplication;

    expect(route.capability).toBe('promotionApplication');
    expect(route.action).toBe('applyPromotions');
    expect(route.methods).toBe('POST');
    expect(route.path).toBe('/promotions/application');

    // ONE row, so the guard is a forward-compatibility check rather than a currently reachable branch -
    // stated here so a reader does not go looking for a case that drives it.
    const rowsForThisCapability = Object.values(ROUTE_TABLE).filter(
      (candidate): boolean => candidate.capability === 'promotionApplication',
    );
    expect(rowsForThisCapability).toHaveLength(1);
  });

  it('★★★ does ROUTE work before BODY work, so an unusable request costs no parse (finding F12)', async () => {
    // The ordering is observable without a second action: send a syntactically broken body to a route
    // that does NOT match. Had the body been decoded first the answer would be a 400 about the body;
    // because route resolution runs first - and the action check sits immediately after it, before
    // `decodeRequestEnvelope` - the answer is a 404 about the route, and nothing was parsed.
    const harness = makeHarness();
    const result = await harness.invoke(
      makeProxyEvent({ httpMethod: 'GET', path: '/promotions/application', body: '{' }),
    );

    expect(result.statusCode).toBe(404);
    expect(errorBodyOf(result).category).toBe('routeNotFound');
    // No composition root, no scope, no pass - and no parse.
    expect(harness.recorder.log).toEqual([]);
    expect(harness.recorder.scopeInputs).toHaveLength(0);

    // And the SAME broken body on the MATCHED route is answered as a body failure, which is what makes
    // the 404 above attributable to ordering rather than to the body being ignored everywhere.
    const matched = makeHarness();
    const matchedResult = await matched.invoke(makeProxyEvent({ body: '{' }));

    expect(matchedResult.statusCode).toBe(400);
    expect(matched.recorder.scopeInputs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // ★★★ F13 / F8: THE ENVELOPE AND THE CORRELATION IDENTIFIER ARE THE SHARED ONES.
  // -------------------------------------------------------------------------

  it('★★★ falls back to the SHARED unattributed identifier when the platform supplies none (finding F8)', async () => {
    // The module used to carry its own `unidentifiedRequest` literal and its own precedence walk. Both
    // are the mapper's now, so this capability answers with the same token the other four do - which is
    // the point of the finding: an operator joining a response to a log line should not have to know
    // which entrypoint produced it.
    const { order } = makeGoldenOrder();
    const harness = makeHarness({ admit: order });

    const result = await harness.invoke(postApplyPromotions(order, {}));
    expect(result.statusCode).toBe(200);
    expect(servedEnvelopeOf(result).requestId).toBe(PLATFORM_REQUEST_ID);

    // With the platform identifier withheld, the SHARED fallback is used rather than an empty string,
    // a generated value or a caller-supplied header.
    const anonymous = makeHarness({ materialize: order });
    const anonymousResult = await anonymous.invoke(
      makeProxyEvent({
        body: JSON.stringify(applyPromotionsDocument(wireOrderDocument(order))),
        requestId: '',
        ...(order.accountID === undefined ? {} : { authorizer: authorizerFor(order.accountID) }),
      }),
    );

    expect(anonymousResult.statusCode).toBe(200);
    expect(servedEnvelopeOf(anonymousResult).requestId).toBe('unattributed');
  });
});
