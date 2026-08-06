// ---------------------------------------------------------------------------
// The SKU resolution Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: no legacy test file reaches the handler tier. The two
// legacy-extended suites in this subtree are the brand and product entity suites, and neither is this
// one. What IS legacy here is the BEHAVIOUR each case pins - every locator cited below was read in the
// source.
//
// A handler is a primary adapter, so every case serves exactly one of four concerns: routing and
// request validation, delegation to an already-ported service method, API Gateway response shaping,
// and domain/error mapping. There is no fifth, because a fifth concern in a handler would be business
// logic - and that is asserted rather than claimed: every collaborator the route is not entitled to
// touch is a getter that THROWS ON FIRST TOUCH.
//
// THE SQL BOUNDARY IS THE MOST IMPORTANT NON-ASSERTION IN THIS FILE. The must-preserve AND-of-EXISTS
// semantics at [model/dao/SkuDAO.cfc:L107-L128] - one `and exists (...)` clause per selected option,
// an intersection over all of them, executed with positional parameters - are owned by
// `tests/integration/repositories`. This suite asserts only that the caller's criteria reach the
// service VERBATIM and that the collection the service answers is published UNMODIFIED, so no
// recording pool or statement-executor double appears below.
//
// The subject is driven through `createSkuResolutionHandler({ bootstrap, logger })`, the seam the
// module publishes on {@link SkuResolutionHandlerDependencies}. No composition root is built and no
// connection pool is created, nothing reads `process.env`, and every collaborator is a hand-written,
// fully typed, in-memory double - no mocking library, no database, no network, no filesystem, no
// credential and no mutable module state. The suite passes with a completely empty environment.
//
// ---------------------------------------------------------------------------
// THE ROUTED SURFACE IS TWO OPERATIONS, WHICH IS FEWER THAN A READER MIGHT EXPECT
// ---------------------------------------------------------------------------
//   JUDGMENT CALL: this suite asserts the surface the module ACTUALLY SHIPS rather than
//   the wider surface the two ported services declare, and the difference is worth
//   stating up front because it looks like an omission and is not one.
//
//   ★★★ IT WAS FIVE AND IS NOW TWO. Three operations were WITHDRAWN from the Lambda
//   surface by review, and this suite was rewritten around the narrower surface rather
//   than kept pointing at actions that no longer exist:
//
//     * `getTransactionExistsFlag` - FINDING F18. The route advertised a boolean it could
//       never return. `SkuService.getTransactionExistsFlag()` forwards no arguments
//       [model/service/SkuService.cfc:L285-L287] and `MysqlSkuRepository` raises a named
//       `SkuColumnError` when neither identifier is supplied - correct parity, because
//       [model/dao/SkuDAO.cfc:L59-L63] executes with an UNDEFINED `arguments.productID`
//       and the legacy cannot serve that call either. THIS SUITE WAS PART OF THE EVIDENCE:
//       its scripted double returned a configured boolean and it asserted HTTP 200, so it
//       could not see the real composition's throw. A double that answers where production
//       raises does not prove the route works; it proves the double does. The route is gone
//       and the cases that drove it through the double are gone with it.
//     * `searchSkusByProductType` and `findSkus` - FINDING F10. Both return complete,
//       unpaged collections and neither signature can be bounded without a reshaping this
//       tier may not allocate; `SkuQueryCriteria` declares no paging members at all.
//
//   Every withdrawal is asserted from the OTHER DIRECTION in the final `describe`: naming
//   one now earns the same client-shaped rejection as naming a nonsense string, and each
//   appears in `NON_EXPOSED_SURFACE_NOTES` with its reason. Nothing was reshaped to achieve
//   it - all three service members still exist, unchanged, with their own service-tier
//   coverage.
//
//   The published set is exactly `getProductSkusBySelectedOptions` and `getSkuBySkuCode`. Also absent
//   are `getProductSkus` [model/service/SkuService.cfc:L220], `getSortedProductSkus`
//   [L246], `processImageUpload` [L210], `createSkus` [L58] and the two entity-level
//   resolvers `Product.getSkuBySelectedOptions` [model/entity/Product.cfc:L349] and
//   `Product.getSkusBySelectedOptions` [L366] - EVERY ONE of which takes a HYDRATED
//   ENTITY. The exclusion is structural rather than a preference: `RequestScope`
//   publishes no repository, no ported service publishes a load-by-identifier, and a
//   primary adapter constructs no entity, so no `Product` or `Sku` instance can be
//   obtained at this tier. The module enumerates each absence with its reason, and this
//   suite therefore asserts NON-EXPOSURE for them - see the final `describe` - rather
//   than asserting a forwarding that could not exist. `getSortedProductSkus`' ordering
//   contract [model/dao/SkuDAO.cfc:L172-L202] is still guarded here, from the other
//   direction: nothing in this module sorts, re-sorts or re-orders any collection.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE PRESENTED AS
// PARITY.
// ---------------------------------------------------------------------------
//   The legacy `meta/tests` tree holds 32 `.cfc` components and NOT ONE of them
//   reaches a handler tier, because the legacy architecture has no handler tier to
//   have tested: `meta/tests/unit/service/` carries only AccountServiceTest,
//   HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, and
//   `meta/tests/unit/dao/` only AccountDAOTest and PaymentDAOTest - none of them in
//   scope. The only legacy suites extended anywhere in this port are
//   [meta/tests/unit/entity/BrandTest.cfc] and
//   [meta/tests/unit/entity/ProductTest.cfc]; the third file that touches the slice,
//   [meta/tests/functional/admin/entity/ProductTest.cfc], is an EMPTY STUB
//   contributing zero coverage and is acknowledged rather than counted.
//
//   No case in this file has a legacy antecedent. What IS legacy here is the
//   BEHAVIOUR each case pins - every locator cited below was read in the source -
//   and the distinction between inherited behaviour and net-new coverage of it is
//   kept explicit throughout.
//
//   The one legacy convention carried over is naming: a regression case would be
//   named `issue_<ticket#>` after [meta/tests/unit/IssuesTest.cfc], whose own cases
//   are `issue_1097` and siblings. No such case is needed here, because no ticket
//   describes this module.
//
// ---------------------------------------------------------------------------
// HOW THE SUBJECT IS DRIVEN, AND WHY NOT THROUGH THE REAL COMPOSITION ROOT
// ---------------------------------------------------------------------------
//   Through `createSkuResolutionHandler({ bootstrap, logger })`, which is the seam
//   the module publishes on {@link SkuResolutionHandlerDependencies} for exactly
//   this purpose. `bootstrap` is a closure of this suite's own, so:
//
//     * NO composition root is built and NO connection pool is created - not by
//       importing the module and not by invoking it. Importing constructs the
//       exported `handler` through the same factory with no arguments, which is
//       synchronous wiring: no configuration read, no connection, no `await`.
//     * NOTHING reads `process.env`. The suite passes with a completely empty
//       environment, which is also why `src/lib/config.ts` is not imported here in
//       any form and why the process logger is never used as a sink.
//     * every collaborator is a HAND-WRITTEN, FULLY TYPED, IN-MEMORY double. No
//       mocking library, no container, no database, no network, no filesystem, no
//       `.env`, no credential, and no mutable module state.
//
//   JUDGMENT CALL: two techniques make that possible without a single `any`, cast-to-any
//   or non-null assertion, and both are worth naming because they are load-bearing. The
//   alternative - composing the real graph through `bootstrapCompositionRoot` with an
//   executor override - was rejected on evidence rather than on taste: it builds every
//   statement module, and one of those resolves a dialect from the global environment at
//   build time, which would make this suite fail in the empty environment it is required
//   to pass in:
//
//     * A member the route must never touch is a GETTER THAT THROWS, declared with
//       the exact type an indexed access yields (`RequestScope['brandService']`
//       and so on). It satisfies the interface, needs no import of the thing it
//       stands in for, and converts "the handler does not reach this" from an
//       assertion someone has to remember to write into a property of the double.
//     * A collaborator port is enumerated member by member with
//       {@link unreachable}, typed through `ConstructorParameters<typeof Service>`
//       so no port module is named here at all.
//
//   `SkuService` and `ProductService` hold `private readonly` fields, so neither
//   is satisfiable structurally. The two the route genuinely calls are therefore
//   REAL INSTANCES of recording subclasses, wired to those unreachable ports, with
//   `override` on every substituted member so a renamed service method breaks this
//   file at compile time instead of silently recording nothing.
//
// ---------------------------------------------------------------------------
// THE SQL BOUNDARY - THE MOST IMPORTANT NON-ASSERTION IN THIS FILE
// ---------------------------------------------------------------------------
//   The must-preserve AND-of-EXISTS semantics live at [model/dao/SkuDAO.cfc:L107-L128]:
//   [L109-L112] seed the HQL with a `0 = 0` tautology, [L113-L121] append one
//   `and exists (from SlatwallOption o join o.skus s where s.id = sku.id and
//   o.optionID = ?)` clause PER selected option - an intersection over ALL of them,
//   exactly as the [L106] comment says - and [L127] executes with positional
//   parameters.
//
//   NONE OF THAT IS ASSERTED HERE, DELIBERATELY. Statement text, the `0 = 0` seed,
//   the `?` bindings and their order belong to `tests/integration/repositories`,
//   which owns them; this file asserts only that the caller's criteria reach the
//   service VERBATIM and that the collection the service answers is published
//   UNMODIFIED. The omission is recorded so a reviewer does not read it as a gap,
//   and no recording pool or statement-executor double appears below.
//
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import type {
  CompositionRoot,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import type { ErrorResponseBody, SuccessResponseBody } from '../../../src/handlers/errorMapper.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import type {
  SkuResolutionOperation,
  SkuResolutionOutcome,
  SkuResolutionResultDocument,
} from '../../../src/handlers/skuResolutionHandler.js';
import {
  createSkuResolutionHandler,
  handler,
  NON_EXPOSED_SURFACE_NOTES,
} from '../../../src/handlers/skuResolutionHandler.js';
// The branded decimal-string type and the by-VALUE comparison helper. Imported rather
// than restated: redeclaring the brand would produce a second type that looks identical
// and compares against nothing, and comparing two rendered prices with `toBe` would pin
// a presentation detail this suite has no authority over.
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
// JUDGMENT CALL: the entity CLASS is imported for exactly ONE reason - `Sku.hydrate` is the only public
// boundary that runs the four-step currency cascade [model/entity/Sku.cfc:L367-L433],
// and `makeSkuFixture` deliberately answers an UNHYDRATED sku whose
// `getCurrencyDetails()` is `{}` until it has run. The fixture's own documentation
// prescribes `await Sku.hydrate(sku)` as the way in, and without it the load-bearing
// null semantics at [L269-L285] could not be exercised through the response document at
// all. No other entity member is touched here and no entity behaviour is re-implemented.
import { Sku } from '../../../src/domain/entities/sku.js';
import type { LogContext, Logger, LogLevel, LogSink } from '../../../src/lib/logger.js';
// ★ THE PRODUCTION LOGGER, IMPORTED FOR ONE PURPOSE. Finding F7 was invisible to this suite's
// recording logger, which captures a context object as given and therefore cannot see the real
// logger's key-based redaction policy - under which `capability` and `operation` were REDACTED. One
// case drives the handler through this instance with stdout captured, which is the only way to
// observe what an operator would actually receive.
import { logger as productionLogger } from '../../../src/lib/logger.js';
import type { SkuPage, SkuQueryCriteria } from '../../../src/services/skuService.js';
import { SkuService } from '../../../src/services/skuService.js';
import { ProductService } from '../../../src/services/productService.js';
// ★ THE REAL WRITING ADAPTER, IMPORTED FOR ONE CASE. Review named this suite's scripted
// `SkuService` as the reason finding F18 went unnoticed - it ANSWERED where production RAISES. One
// case therefore builds the real `SkuService` over the real `MysqlSkuRepository` and drives the
// withdrawn call, proving the refusal with no double standing in for it. It needs no connection: the
// repository refuses before it would issue a statement, and the case asserts exactly that.
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ===========================================================================
// SECTION 1 - THE SKU ENTITY TYPE, TAKEN FROM THE SERVICE SURFACE
// ===========================================================================

/**
 * The SKU entity as the ported service tier publishes it.
 *
 * JUDGMENT CALL: derived from `SkuPage.skus` rather than named through an entity import,
 * which is the same reasoning the subject module records for its own aliases: the
 * double is then typed to WHAT THE SERVICE RETURNS, so a change to the service
 * surface breaks this file rather than letting the double drift away from it. It
 * also keeps the entity module out of this suite's import list entirely.
 *
 * `NonNullable` is applied because `noUncheckedIndexedAccess` is on and an indexed
 * access type is the one place that flag can widen a definite element type.
 */
type ResolvedSku = NonNullable<SkuPage['skus'][number]>;

// ===========================================================================
// SECTION 2 - SENTINELS AND PLANTED DATA
//
// Every identifier below is INVENTED AND NON-SENSITIVE. Nothing here is shaped like
// a credential, a host, a connection string or a data-source name, because a fixture
// that looks like a live credential trains a reader to ignore a real one.
// ===========================================================================

/** The canonical route this capability answers, from the shared table. */
const SKU_RESOLUTION_PATH = '/catalog/skus';

/** A correlation identifier shaped like the one API Gateway supplies. */
const GATEWAY_REQUEST_ID = 'a1b2c3d4-0000-4444-8888-aaaabbbbcccc';

/** The platform invocation identifier, used only when the gateway supplies none. */
const INVOCATION_REQUEST_ID = 'f0f0f0f0-1111-4444-8888-ddddeeeeffff';

/**
 * The fixed marker published when there is nothing to correlate with.
 *
 * ★★ THE VALUE MOVED WITH THE RESOLVER. It used to be this module's own `'uncorrelated'`;
 * finding F8 collapsed five correlation policies into `resolveServerRequestId` in
 * `../../../src/handlers/errorMapper.js`, whose token is `'unattributed'`. Restated here
 * rather than imported because the shared module keeps it module-private - a test that
 * imported it could not detect the constant being changed to an empty string, which is
 * exactly the regression this catches.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/**
 * One instant, spelled as an explicit UTC ISO-8601 literal.
 *
 * No `new Date()` and no `Date.now()` appears anywhere in this file. The legacy
 * engine followed whatever timezone the server was set to; this port pins every
 * comparison to an injected instant, and a suite that read the wall clock would pass
 * or fail by accident.
 */
const REQUEST_INSTANT = '2024-05-01T00:00:00.000Z';

/** The same instant as the epoch milliseconds an API Gateway event carries. */
const REQUEST_INSTANT_EPOCH = new Date(REQUEST_INSTANT).getTime();

/** Identifiers for the option-based resolution cases. */
const PRODUCT_ID = 'catalog-product-0001';
const OPTION_ID_SMALL = 'option-size-small';
const OPTION_ID_RED = 'option-colour-red';

/**
 * A SKU code used wherever a case needs a request the module WILL serve but is not about
 * what the request asks for - routing, correlation, scope discipline, logging.
 *
 * ★ `getSkuBySkuCode` IS THE RIGHT VEHICLE FOR THOSE CASES AND `getTransactionExistsFlag`
 * WAS THE WRONG ONE. The withdrawn operation was convenient because it took no arguments,
 * which is precisely why it was misleading: it also could not be served by the real
 * composition (finding F18), so every case that used it as scaffolding was standing on a
 * route that only worked because a double answered. A SKU-code MISS needs no script either
 * - the double answers `undefined` and the module serves a 200 with the member omitted -
 * and it is a path production can actually take.
 */
const SERVABLE_SKU_CODE = 'TESTSKU-SERVABLE-0001';

/**
 * A planted value used to prove a failure's detail never reaches a response body.
 * Long, unique and free of regular-expression metacharacters, so a substring search
 * cannot produce a false result in either direction.
 */
const PLANTED_INTERNAL_DETAIL = 'PLANTED-INTERNAL-DETAIL-7d41ac93b6e2';

/**
 * A statement fragment shaped like the one the pinned MySQL driver embeds in its own
 * error messages, together with a bound value. Planted for the same reason.
 */
const PLANTED_STATEMENT = "select skuID from SwSku where skuCode = 'TESTSKUXXX'";

// ===========================================================================
// SECTION 3 - THE UNREACHABLE HELPER
// ===========================================================================

/**
 * A collaborator member this route is not entitled to reach.
 *
 * Returns a zero-parameter function whose return type is `never`, which is
 * assignable to ANY function type - fewer parameters are always acceptable and
 * `never` is assignable to every return type - so one helper types every port
 * member without a cast and without naming the port's module.
 *
 * The value of it is not brevity. A member that is silently absent proves nothing; a
 * member that FAILS LOUDLY turns "this adapter reaches nothing it should not" into a
 * property the suite enforces on every single case, including cases written later by
 * someone who never read this comment.
 *
 * @param member - the member being stood in for, named for the failure message.
 * @returns a function that throws when called.
 */
function unreachable(member: string): () => never {
  return (): never => {
    throw new Error(
      `${member} was reached. The SKU resolution route publishes five read operations and none ` +
        'of them touches this member, so reaching it means the handler acquired logic, state or a ' +
        'collaborator it is not entitled to.',
    );
  };
}

// ===========================================================================
// SECTION 4 - THE COLLABORATOR PORTS THE TWO SERVICES ARE CONSTRUCTED WITH
//
// Enumerated member by member, every one of them unreachable. The types come from
// `ConstructorParameters<typeof Service>`, so no port module is imported here: the
// declared dependency set for this suite stays exactly what the plan gives it, and a
// port that gains or loses a member breaks this file at compile time.
//
// NOT ONE of these is a database, a pool, a statement executor or a recorder of
// either. There is nothing here for SQL to be asserted against, which is the SQL
// boundary from the header expressed as code rather than as a promise.
// ===========================================================================

/** The positional collaborator types `SkuService` declares. */
type SkuServiceCollaborators = ConstructorParameters<typeof SkuService>;

/** The positional collaborator types `ProductService` declares. */
type ProductServiceCollaborators = ConstructorParameters<typeof ProductService>;

/**
 * `SkuRepository`, all seven members unreachable.
 *
 * Seven, not eight: `getSkuStocksDeletableFlag` is deliberately absent from the port.
 *
 * LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag` delegates at [L282]
 * to a SkuDAO member that does not exist, so the legacy raises on every call.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Verified four ways rather than assumed: `model/dao/SkuDAO.cfc` declares no such
 * method across its 228 lines; the whole repository holds exactly three references
 * to the name ([model/entity/Sku.cfc:L569], [model/service/SkuService.cfc:L281] and
 * its delegation at [L282]); there is no match anywhere under `org/Hibachi/`; and
 * `org/Hibachi/HibachiDAO.cfc` declares no `onMissingMethod` across its 266 lines,
 * so nothing can dispatch it and the failure surfaces as a RAW CFML ENGINE ERROR
 * rather than as a framework message. No replacement query is authored here or
 * anywhere, and the error mapper has nothing to map for it.
 */
const unreachableSkuRepository: SkuServiceCollaborators[0] = {
  getTransactionExistsFlag: unreachable('SkuRepository.getTransactionExistsFlag'),
  getSkuBySkuCode: unreachable('SkuRepository.getSkuBySkuCode'),
  getSkusBySelectedOptions: unreachable('SkuRepository.getSkusBySelectedOptions'),
  searchSkusByProductType: unreachable('SkuRepository.searchSkusByProductType'),
  getProductSkus: unreachable('SkuRepository.getProductSkus'),
  getSortedProductSkusID: unreachable('SkuRepository.getSortedProductSkusID'),
  saveSku: unreachable('SkuRepository.saveSku'),
};

/** The image store, a STUB port in the target and unreachable from this route. */
const unreachableImageStore: SkuServiceCollaborators[1] = {
  saveImageFile: unreachable('ImageStore.saveImageFile'),
  deleteImageFile: unreachable('ImageStore.deleteImageFile'),
  generateSkuImageFileName: unreachable('ImageStore.generateSkuImageFileName'),
};

/** The subscription term provider, likewise a stub port and likewise unreachable. */
const unreachableSubscriptionTermProvider: SkuServiceCollaborators[2] = {
  getSubscriptionTerm: unreachable('SubscriptionTermProvider.getSubscriptionTerm'),
  getSubscriptionBenefit: unreachable('SubscriptionTermProvider.getSubscriptionBenefit'),
};

/** `ProductRepository`, all six members unreachable. */
const unreachableProductRepository: ProductServiceCollaborators[0] = {
  getAttributeSets: unreachable('ProductRepository.getAttributeSets'),
  loadDataFromFile: unreachable('ProductRepository.loadDataFromFile'),
  searchProductsByProductType: unreachable('ProductRepository.searchProductsByProductType'),
  getProductByProductID: unreachable('ProductRepository.getProductByProductID'),
  saveProduct: unreachable('ProductRepository.saveProduct'),
  deleteProduct: unreachable('ProductRepository.deleteProduct'),
};

/** `ProductTypeRepository`, all four members unreachable. */
const unreachableProductTypeRepository: ProductServiceCollaborators[2] = {
  getProductTypeQuery: unreachable('ProductTypeRepository.getProductTypeQuery'),
  getProductTypeByProductTypeID: unreachable('ProductTypeRepository.getProductTypeByProductTypeID'),
  getProductTypesByProductTypeIDPath: unreachable(
    'ProductTypeRepository.getProductTypesByProductTypeIDPath',
  ),
  saveProductType: unreachable('ProductTypeRepository.saveProductType'),
};

/** The URL-title generator that replaced the legacy `dataService` dependency. */
const unreachableUrlTitleGenerator: ProductServiceCollaborators[3] = {
  createUniqueURLTitle: unreachable('UrlTitleGenerator.createUniqueURLTitle'),
};

/**
 * The SKU-creation collaborator.
 *
 * Unreachable for three independent reasons, each sufficient and each recorded by the
 * subject module: `createSkus` takes a hydrated `Product` this tier cannot obtain, the
 * shared route table declares this capability GET-only, and its odometer over the full
 * cartesian product of option groups [model/service/SkuService.cfc:L105-L121] is
 * unbounded by construction.
 */
const unreachableSkuCreation: ProductServiceCollaborators[6] = {
  createSkus: unreachable('SkuCreationCollaborator.createSkus'),
};

/** The option-loading collaborator, all three members unreachable. */
const unreachableOptionLoading: ProductServiceCollaborators[7] = {
  getOptionsForSelect: unreachable('OptionLoadingCollaborator.getOptionsForSelect'),
  getOptionGroup: unreachable('OptionLoadingCollaborator.getOptionGroup'),
  getOption: unreachable('OptionLoadingCollaborator.getOption'),
};

/**
 * The ninth `ProductService` collaborator, refused like the rest.
 *
 * It commits a repriced SKU set as ONE unit of work (F3) and this route reprices nothing, so reaching
 * it would mean the SKU-resolution handler had grown a write path it must not have.
 */
const unreachableSkuBatchWrite: ProductServiceCollaborators[8] = {
  saveMutatedSkus: unreachable('SkuBatchWriteCollaborator.saveMutatedSkus'),
};

// ===========================================================================
// SECTION 5 - THE RECORDED CALL LOG AND THE SCRIPTED ANSWERS
// ===========================================================================

/**
 * One service call the handler made, as the service received it.
 *
 * `args` is the ARGUMENT LIST, positionally, which is what makes parameter ORDER
 * assertable rather than merely parameter presence. That matters on this route above
 * all others: `getProductSkusBySelectedOptions(required string selectedOptions,
 * required string productID)` [model/service/ProductService.cfc:L104] declares
 * `selectedOptions` FIRST, the legacy caller at [model/entity/Product.cfc:L367]
 * passes them positionally in that order, and two same-typed string parameters
 * silently swapped would resolve a different set of SKUs while every type still
 * checked.
 */
interface RecordedCall {
  /** `<Service>.<member>`, so one log can carry calls from both services. */
  readonly member: string;

  /** Exactly what was passed, in order, with nothing normalised. */
  readonly args: readonly unknown[];
}

/**
 * How a scripted service member fails, when a case asks it to.
 *
 * A discriminated union rather than a single `thrown` member, because the two arms
 * reach the handler's one `catch` by DIFFERENT routes and both are real: a service
 * that raises synchronously and a service whose promise rejects. Keeping them
 * distinct is also what lets a non-`Error` value be thrown without rejecting a
 * promise with a non-`Error`, which the lint profile forbids for good reason.
 */
type ScriptedFailure =
  | { readonly kind: 'throw'; readonly thrown: unknown }
  | { readonly kind: 'reject'; readonly reason: Error };

/**
 * What the scripted services answer, per operation.
 *
 * Every member is optional; a case sets only what it exercises. Reaching a member the
 * case did not script is a failure rather than a silent `undefined`, for the same
 * reason {@link unreachable} exists.
 */
interface ServiceScript {
  /** The answer to `ProductService.getProductSkusBySelectedOptions`. */
  readonly productSkusBySelectedOptions?: readonly ResolvedSku[] | undefined;

  /** The answer to `SkuService.getSkuBySkuCode`; absent means a MISS. */
  readonly skuBySkuCode?: ResolvedSku | undefined;

  // ★ NO MEMBER FOR `searchSkusByProductType`, `getTransactionExistsFlag` OR `findSkus`. All three
  // were withdrawn from the routed surface (findings F10 and F18), and their overrides on
  // {@link RecordingSkuService} now REJECT rather than answer - so there is nothing left to script,
  // and a case that tried to script one would not compile.

  /** When present, the scripted member fails instead of answering. */
  readonly failure?: ScriptedFailure | undefined;
}

/**
 * Record a call and either fail as scripted or answer.
 *
 * Shared by both recording services so the failure semantics cannot diverge between
 * them. The call is recorded BEFORE the failure is raised, deliberately: a case that
 * asserts a failure was mapped should still be able to assert the arguments that
 * produced it.
 *
 * @param calls - the shared log.
 * @param member - the member being invoked.
 * @param args - the arguments it received, in order.
 * @param failure - the scripted failure, when the case asked for one.
 * @returns nothing; it either returns normally or raises.
 */
function recordAndMaybeFail(
  calls: RecordedCall[],
  member: string,
  args: readonly unknown[],
  failure: ScriptedFailure | undefined,
): void {
  calls.push({ member, args });

  if (failure !== undefined && failure.kind === 'throw') {
    throw failure.thrown;
  }
}

/**
 * The scripted value, or a failure naming the member the case forgot to script.
 *
 * @param member - the member being invoked.
 * @param value - the scripted answer, when the case supplied one.
 * @returns the scripted answer.
 */
function scripted<TValue>(member: string, value: TValue | undefined): TValue {
  if (value === undefined) {
    throw new Error(
      `${member} was invoked but this case scripted no answer for it. Script one, or assert that ` +
        'the operation is not reached.',
    );
  }

  return value;
}

// ===========================================================================
// SECTION 6 - THE TWO SERVICES THE ROUTE ACTUALLY CALLS
//
// Real subclasses rather than object literals, because `SkuService` and
// `ProductService` hold `private readonly` fields and are therefore NOT satisfiable
// structurally. `override` is spelled on every substituted member - `noImplicitOverride`
// is on - so a renamed or re-signatured service method breaks this file at compile
// time instead of quietly recording nothing and passing.
//
// Neither override is `async`. Each returns `Promise.resolve(...)`, which is the same
// awaited path the handler takes against the real services, and each raises
// synchronously when scripted to `throw` - both shapes reach the handler's single
// `catch`, which is the point.
// ===========================================================================

/** `ProductService`, with the one member this route reaches recorded. */
class RecordingProductService extends ProductService {
  public constructor(
    private readonly script: ServiceScript,
    private readonly calls: RecordedCall[],
  ) {
    super(
      unreachableProductRepository,
      unreachableSkuRepository,
      unreachableProductTypeRepository,
      unreachableUrlTitleGenerator,
      unreachableImageStore,
      unreachableSubscriptionTermProvider,
      unreachableSkuCreation,
      unreachableOptionLoading,
      unreachableSkuBatchWrite,
    );
  }

  /**
   * ★★ THE MUST-PRESERVE ENTRY POINT. Both parameters are captured EXACTLY as
   * received: `selectedOptions` is still the caller's comma-delimited string,
   * unparsed, untrimmed, unsorted, un-deduplicated and not case-folded, and
   * `productID` is still second.
   */
  public override getProductSkusBySelectedOptions(
    selectedOptions: string,
    productID: string,
  ): Promise<ResolvedSku[]> {
    recordAndMaybeFail(
      this.calls,
      'ProductService.getProductSkusBySelectedOptions',
      [selectedOptions, productID],
      this.script.failure,
    );

    if (this.script.failure?.kind === 'reject') {
      return Promise.reject(this.script.failure.reason);
    }

    return Promise.resolve([
      ...scripted(
        'ProductService.getProductSkusBySelectedOptions',
        this.script.productSkusBySelectedOptions,
      ),
    ]);
  }
}

/** `SkuService`, with the one member this route reaches recorded and three tripwires. */
class RecordingSkuService extends SkuService {
  public constructor(
    private readonly script: ServiceScript,
    private readonly calls: RecordedCall[],
  ) {
    super(unreachableSkuRepository, unreachableImageStore, unreachableSubscriptionTermProvider);
  }

  /**
   * `getSkuBySkuCode` [model/service/SkuService.cfc:L289].
   *
   * A MISS ANSWERS `undefined` AND NOTHING ELSE - not `0`, not `null`, not an empty
   * object and not a SKU with zeroed prices. [model/dao/SkuDAO.cfc:L103] executes with
   * the `ormExecuteQuery` unique flag, which answers one entity or nothing at all.
   */
  public override getSkuBySkuCode(skuCode?: string): Promise<ResolvedSku | undefined> {
    recordAndMaybeFail(this.calls, 'SkuService.getSkuBySkuCode', [skuCode], this.script.failure);

    if (this.script.failure?.kind === 'reject') {
      return Promise.reject(this.script.failure.reason);
    }

    return Promise.resolve(this.script.skuBySkuCode);
  }

  // -------------------------------------------------------------------------
  // ★★★ THE THREE WITHDRAWN MEMBERS ARE TRIPWIRES NOW, NOT SCRIPTED ANSWERS.
  //
  // Each of the three used to be a recording override that ANSWERED from a script, and the
  // `getTransactionExistsFlag` one was named by review as evidence for finding F18: it returned a
  // configured boolean while the real `MysqlSkuRepository` raises `SkuColumnError` on the same call,
  // so the suite asserted HTTP 200 for a route production could never serve. A double that answers
  // where production raises does not prove the route works - it proves the double does.
  //
  // The overrides are kept rather than deleted, and inverted: reaching one now FAILS. The routed
  // surface publishes only two operations, so any of these being invoked means a withdrawn action was
  // reintroduced, and this is the loudest place for that to surface. Neither service signature is
  // touched - each override matches its parent exactly.
  // -------------------------------------------------------------------------

  /** WITHDRAWN by finding F10. Reaching this means the route came back. */
  public override searchSkusByProductType(
    term?: string,
    productTypeID?: string,
  ): Promise<ResolvedSku[]> {
    this.calls.push({ member: 'SkuService.searchSkusByProductType', args: [term, productTypeID] });

    return Promise.reject(
      new Error(
        'SkuService.searchSkusByProductType was invoked. It was WITHDRAWN from the routed surface ' +
          'by finding F10 because it returns a complete, unpaged collection that no member of its ' +
          'signature can bound. Reaching it means the action was reintroduced.',
      ),
    );
  }

  /** WITHDRAWN by finding F18. Reaching this means the unservable route came back. */
  public override getTransactionExistsFlag(): Promise<boolean> {
    this.calls.push({ member: 'SkuService.getTransactionExistsFlag', args: [] });

    return Promise.reject(
      new Error(
        'SkuService.getTransactionExistsFlag was invoked. It was WITHDRAWN from the routed surface ' +
          'by finding F18 because the real service forwards NO arguments and ' +
          'MysqlSkuRepository.getTransactionExistsFlag then raises SkuColumnError - correct parity ' +
          'with [model/dao/SkuDAO.cfc:L59-L63], which executes with an UNDEFINED arguments.productID. ' +
          'Answering here from a script is precisely the defect the finding named.',
      ),
    );
  }

  /** WITHDRAWN by finding F10. Reaching this means the route came back. */
  public override findSkus(criteria: SkuQueryCriteria): Promise<SkuPage> {
    this.calls.push({ member: 'SkuService.findSkus', args: [criteria] });

    return Promise.reject(
      new Error(
        'SkuService.findSkus was invoked. It was WITHDRAWN from the routed surface by finding F10 ' +
          'because SkuQueryCriteria declares no paging members, so a routed contract has nothing to ' +
          'bound. Reaching it means the action was reintroduced.',
      ),
    );
  }
}

// ===========================================================================
// SECTION 7 - THE REQUEST SCOPE AND THE COMPOSITION ROOT
//
// ★★ EVERY MEMBER THIS ROUTE MUST NOT TOUCH IS A GETTER THAT THROWS.
//
// The declared return type of each getter is taken by indexed access from the
// interface itself, so the double is type-correct without importing - or
// constructing - a single one of the things it stands in for: no rounding-rule
// service, no brand or option service, no narrowed pricing capability, no currency
// converter, no feed port, no Google integration, no settings provider and, above
// all, no `CompositionDiagnostics` - which would have dragged the process
// configuration types into a suite that must pass with an empty environment and
// contain no host, credential, connection string or data-source name.
//
// The mechanism earns its keep twice. It keeps the double small, and it makes
// "a primary adapter reaches exactly one service method and nothing else" ENFORCED on
// every case in this file rather than asserted in one.
// ===========================================================================

/** One opening of a request scope, with the input the handler supplied. */
interface ScopeOpening {
  /** What the handler passed. The subject passes NOTHING, which is the assertion. */
  readonly input: RequestScopeInput | undefined;
}

/** Everything one case needs to drive the subject and then interrogate it. */
interface Harness {
  /** The subject: a handler wired to this harness and to nothing else. */
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: { readonly awsRequestId: string },
  ) => Promise<APIGatewayProxyResult>;

  /** Every service call the handler made, in order. */
  readonly calls: readonly RecordedCall[];

  /** Every request scope the handler opened, in order. */
  readonly scopeOpenings: readonly ScopeOpening[];

  /** How many times the handler asked for the composed graph. */
  readonly bootstrapCount: () => number;

  /** Every line the handler or the error mapper emitted. */
  readonly emissions: readonly CapturedEmission[];
}

/** One captured emission, in the form the subject handed to the logger. */
interface CapturedEmission {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext | undefined;

  /** The serialized form, so a leak anywhere in the payload is detectable. */
  readonly serialized: string;
}

/**
 * A logger that records rather than emits.
 *
 * Hand-written, holding nothing but its own array, and built fresh inside every case.
 * That last part is not fastidiousness: module-level state surviving between unrelated
 * invocations on a warm container is precisely the hazard this port re-scopes four
 * legacy component-level caches to avoid, and a shared recorder here would reproduce
 * it inside the suite.
 *
 * `withLevel` and `withSink` answer the same recorder. Neither is exercised by the
 * subject, and returning a divergent object would let the double lie about what the
 * subject did.
 *
 * @returns the logger and the array it records into.
 */
function createRecordingLogger(): {
  readonly logger: Logger;
  readonly emissions: CapturedEmission[];
} {
  const emissions: CapturedEmission[] = [];

  const record = (level: LogLevel, message: string, context?: LogContext): void => {
    emissions.push({
      level,
      message,
      context,
      // `undefined` members vanish under serialization exactly as they do in the real
      // logger, so the recorded string is what would have been emitted.
      serialized: JSON.stringify({ level, message, context }),
    });
  };

  const recorder: Logger = {
    debug: (message: string, context?: LogContext): void => record('debug', message, context),
    info: (message: string, context?: LogContext): void => record('info', message, context),
    warn: (message: string, context?: LogContext): void => record('warn', message, context),
    error: (message: string, context?: LogContext): void => record('error', message, context),
    withLevel: (_level: LogLevel): Logger => recorder,
    withSink: (_sink: LogSink): Logger => recorder,
  };

  return { logger: recorder, emissions };
}

/**
 * One request's scope, carrying the two services the route reaches and nothing else
 * that can be read without failing.
 *
 * @param script - what the scripted services answer.
 * @param calls - the shared call log.
 * @returns a scope satisfying the published interface.
 */
function createScopeDouble(script: ServiceScript, calls: RecordedCall[]): RequestScope {
  return {
    // An explicit UTC instant, threaded rather than read from the wall clock. The
    // subject never reads it - none of the five operations is date-dependent - but a
    // `Date` costs nothing and spelling it here keeps the injected-clock discipline
    // visible at the seam where the legacy engine read the server's timezone.
    now: new Date(REQUEST_INSTANT),

    get currentAccountContext(): RequestScope['currentAccountContext'] {
      throw new Error(
        'RequestScope.currentAccountContext was read. This route resolves no account-scoped ' +
          'price and derives no caller identity, so reaching the explicit replacement for ' +
          'the legacy ambient request scope [model/service/PriceGroupService.cfc:L262-L268] ' +
          'would mean it had acquired an authorization tier.',
      );
    },

    get entityLoaders(): RequestScope['entityLoaders'] {
      throw new Error(
        'RequestScope.entityLoaders was read. Every operation on this route binds its service ' +
          'arguments from the query string directly - `selectedOptions` and `productID` are ' +
          'strings and `skuCode` is a string - so no identifier here has to become an entity.',
      );
    },

    get roundingRuleService(): RequestScope['roundingRuleService'] {
      throw new Error('RequestScope.roundingRuleService was read; this route rounds nothing.');
    },

    get brandService(): RequestScope['brandService'] {
      throw new Error(
        'RequestScope.brandService was read; brands belong to the catalog capability.',
      );
    },

    get optionService(): RequestScope['optionService'] {
      throw new Error('RequestScope.optionService was read; this route builds no option surface.');
    },

    skuService: new RecordingSkuService(script, calls),

    productService: new RecordingProductService(script, calls),

    get priceGroupService(): RequestScope['priceGroupService'] {
      throw new Error(
        'RequestScope.priceGroupService was read; price-group resolution is a different capability.',
      );
    },

    get promotionService(): RequestScope['promotionService'] {
      throw new Error(
        'RequestScope.promotionService was read. This route applies no promotion and resolves no ' +
          'sale price, and it must not reach Sku.getPriceByPromotion either - see the defect ' +
          'annotation on the non-exposed surface.',
      );
    },

    get currencyConverter(): RequestScope['currencyConverter'] {
      throw new Error(
        'RequestScope.currencyConverter was read. The per-currency map is materialized during ' +
          'hydration; a serializer that converted a price would be doing arithmetic.',
      );
    },

    get productFeedPort(): RequestScope['productFeedPort'] {
      throw new Error('RequestScope.productFeedPort was read; the feed is a different capability.');
    },
    // The AAP 0.4.2 argument of `generateProductFeed`, published beside the port it is passed to.
    get feedCriteria(): RequestScope['feedCriteria'] {
      throw new Error('RequestScope.feedCriteria was read; the feed is a different capability.');
    },

    getSalePriceDetailsForProductSkus: unreachable(
      'RequestScope.getSalePriceDetailsForProductSkus',
    ),

    // Wire-document hydration belongs to the promotion-application capability, which is the one
    // entrypoint that accepts an order. SKU resolution names a product and a SKU and prices
    // neither, so reading this member here would mean this entrypoint had grown an order-shaped
    // input it has no business holding.
    materializeOrderView: unreachable('RequestScope.materializeOrderView'),

    updateOrderAmountsWithPriceGroupsThenPromotions: unreachable(
      'RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions',
    ),

    prepareAddressZoneEvaluation: unreachable('RequestScope.prepareAddressZoneEvaluation'),
  };
}

/**
 * Assemble a harness: a subject wired to fresh doubles, and the recorders to
 * interrogate afterwards.
 *
 * A FRESH SUBJECT, A FRESH SCOPE FACTORY, A FRESH LOG AND A FRESH LOGGER PER CALL.
 * Nothing is shared between cases and nothing is memoized here, which is what lets
 * the scope-per-invocation guarantee be asserted at all.
 *
 * @param script - what the scripted services answer.
 * @param rootFailure - a scripted failure of the composed graph itself, when a case
 *   exercises one: `bootstrap` rejects for `'bootstrap'`, and `createRequestScope`
 *   rejects for `'scope'`.
 * @param loggerOverride - a logger to use INSTEAD of the recording one. Supplied by the single case
 *   that must observe the PRODUCTION logger's redaction policy (finding F7); every other case leaves
 *   it absent and interrogates `emissions`. When it is supplied, `emissions` stays empty - which is
 *   correct, because the substituted logger reports nowhere this suite can read structurally.
 * @returns the harness.
 */
function createHarness(
  script: ServiceScript = {},
  rootFailure?: 'bootstrap' | 'scope',
  loggerOverride?: Logger,
): Harness {
  const calls: RecordedCall[] = [];
  const scopeOpenings: ScopeOpening[] = [];
  const { logger: recordingLogger, emissions } = createRecordingLogger();
  const logger = loggerOverride ?? recordingLogger;

  let bootstrapCalls = 0;

  const root: CompositionRoot = {
    get diagnostics(): CompositionRoot['diagnostics'] {
      throw new Error(
        'CompositionRoot.diagnostics was read. It carries the resolved process configuration, ' +
          'redacted, and a response document must never be derived from it.',
      );
    },

    get dialect(): CompositionRoot['dialect'] {
      throw new Error('CompositionRoot.dialect was read; a primary adapter issues no statement.');
    },

    get settingsProvider(): CompositionRoot['settingsProvider'] {
      throw new Error(
        'CompositionRoot.settingsProvider was read. A primary adapter performs no settings ' +
          "resolution; the skuCurrency default lives in the setting's own declaration at " +
          '[model/service/SettingService.cfc:L221], not in a handler.',
      );
    },

    get integration(): CompositionRoot['integration'] {
      throw new Error(
        'CompositionRoot.integration was read; the Google adapter is not on this route.',
      );
    },

    createRequestScope: (input?: RequestScopeInput): Promise<RequestScope> => {
      scopeOpenings.push({ input });

      if (rootFailure === 'scope') {
        return Promise.reject(
          new Error(`the request scope could not be opened: ${PLANTED_INTERNAL_DETAIL}`),
        );
      }

      return Promise.resolve(createScopeDouble(script, calls));
    },

    createInspectableRequestScope: unreachable('CompositionRoot.createInspectableRequestScope'),
  };

  const invoke = createSkuResolutionHandler({
    bootstrap: (): Promise<CompositionRoot> => {
      bootstrapCalls += 1;

      if (rootFailure === 'bootstrap') {
        return Promise.reject(
          new Error(`the composition root could not be built: ${PLANTED_INTERNAL_DETAIL}`),
        );
      }

      return Promise.resolve(root);
    },
    logger,
  });

  return {
    invoke,
    calls,
    scopeOpenings,
    bootstrapCount: (): number => bootstrapCalls,
    emissions,
  };
}

// ===========================================================================
// SECTION 8 - THE REQUEST
// ===========================================================================

/** What a case varies about a request. Everything else is fixed and inert. */
interface EventOptions {
  /** Defaults to the method the shared route table declares for this capability. */
  readonly method?: string;

  /** Defaults to the canonical path the shared route table declares. */
  readonly path?: string;

  /**
   * The single-valued query parameters. `null` reproduces what API Gateway supplies
   * when a request carries no query string at all, which is a DIFFERENT input from an
   * empty object and is exercised as such.
   */
  readonly query?: Readonly<Record<string, string | undefined>> | null;

  /** The gateway's correlation identifier. `''` reproduces the gateway supplying none. */
  readonly requestId?: string;

  /** The repeated-parameter map, which the subject documents that it IGNORES. */
  readonly multiValueQuery?: Readonly<Record<string, string[] | undefined>> | null;

  /** Omitted means the ordinary authenticated caller; `null` means anonymous. */
  readonly authorizer?: Readonly<Record<string, unknown>> | null;
}

/** The opaque account identifier the default authorizer context establishes. */
const AUTHENTICATED_ACCOUNT_ID = 'account-sku-resolution-0001';

/**
 * Build an API Gateway proxy event.
 *
 * ★ `requestContext.identity` IS A GETTER THAT THROWS. Authentication comes from
 * `requestContext.authorizer`; reaching the legacy identity block would be a
 * regression to a different trust source.
 *
 * Nothing else in the event is interesting on purpose. No body, no headers, no path
 * parameters and no stage variables: none of the five operations reads any of them.
 *
 * @param options - what this case varies.
 * @returns the event.
 */
function apiGatewayEvent(options: EventOptions = {}): APIGatewayProxyEvent {
  const method = options.method ?? ROUTE_TABLE.skuResolution.methods;
  const path = options.path ?? SKU_RESOLUTION_PATH;

  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters: null,
    queryStringParameters: options.query === undefined ? null : options.query,
    multiValueQueryStringParameters:
      options.multiValueQuery === undefined ? null : options.multiValueQuery,
    stageVariables: null,
    resource: path,
    requestContext: {
      accountId: '',
      apiId: 'sku-resolution-suite',
      authorizer:
        options.authorizer === undefined
          ? { accountID: AUTHENTICATED_ACCOUNT_ID }
          : options.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod: method,

      get identity(): APIGatewayProxyEvent['requestContext']['identity'] {
        throw new Error(
          'event.requestContext.identity was read. This route resolves its principal from the ' +
            'authorizer context and must not derive identity from the legacy identity block.',
        );
      },

      path,
      stage: 'suite',
      requestId: options.requestId ?? GATEWAY_REQUEST_ID,
      requestTimeEpoch: REQUEST_INSTANT_EPOCH,
      resourceId: 'sku-resolution-suite-resource',
      resourcePath: path,
    },
  };
}

/**
 * A well-formed request for one operation.
 *
 * @param operation - the operation, under its verbatim legacy CFML name.
 * @param parameters - that operation's arguments.
 * @returns the event.
 */
function requestFor(
  operation: SkuResolutionOperation,
  parameters: Readonly<Record<string, string | undefined>> = {},
): APIGatewayProxyEvent {
  return apiGatewayEvent({ query: { operation, ...parameters } });
}

/**
 * A request the module WILL serve, for cases whose subject is not the request.
 *
 * A `getSkuBySkuCode` lookup that MISSES: it needs no script, it reaches exactly one service
 * member, and it answers 200 with the `sku` member omitted. See {@link SERVABLE_SKU_CODE} for
 * why this replaced the withdrawn no-argument operation these cases used to lean on.
 */
function servableRequest(): APIGatewayProxyEvent {
  return requestFor('getSkuBySkuCode', { skuCode: SERVABLE_SKU_CODE });
}

// ===========================================================================
// SECTION 9 - READING THE RESPONSE
//
// The error mapper publishes `ErrorResponseBody` and `SuccessResponseBody`, and the
// subject publishes `SkuResolutionResultDocument` for the payload inside the latter,
// precisely so this tier can parse a document without restating its shape. Each reader
// below checks the envelope structurally and only then narrows to the published type,
// which is the idiom the sibling suite for the error mapper already established.
//
// ★★ THE SUCCESS ENVELOPE MOVED, AND THIS SECTION MOVED WITH IT. The subject used to
// publish a whole-document `SkuResolutionResponseBody` of `{requestId, outcome}`.
// Finding F13 found four JSON entrypoints each publishing a differently-shaped success -
// this one nesting its payload under `outcome`, its siblings under `result`, two of them
// with no correlation identifier at all - so the OUTER document is now the shared
// `{requestId, capability, action, result}` and the capability payload travels inside
// `result`. The readers below therefore descend one extra level.
// ===========================================================================

/** The shared success envelope, with this capability's payload inside it. */
type ServedEnvelope = SuccessResponseBody<SkuResolutionResultDocument>;

/** Parse a success document. */
function successBodyOf(response: APIGatewayProxyResult): ServedEnvelope {
  const parsed: unknown = JSON.parse(response.body);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('the success response body is not a JSON object');
  }

  if (
    !('requestId' in parsed) ||
    !('capability' in parsed) ||
    !('action' in parsed) ||
    !('result' in parsed)
  ) {
    throw new Error('the success response body is not the shared envelope');
  }

  return parsed as ServedEnvelope;
}

/**
 * Parse a success document and select the outcome arm the case expects.
 *
 * @param response - the response.
 * @param operation - the arm expected, by its discriminant.
 * @returns that arm, narrowed.
 */
function outcomeFor<TOperation extends SkuResolutionOperation>(
  response: APIGatewayProxyResult,
  operation: TOperation,
): Extract<SkuResolutionOutcome, { readonly operation: TOperation }> {
  const { outcome } = successBodyOf(response).result;

  if (outcome.operation !== operation) {
    throw new Error(
      `expected the ${operation} outcome but the document carried ${outcome.operation}`,
    );
  }

  return outcome as Extract<SkuResolutionOutcome, { readonly operation: TOperation }>;
}

/** Parse a failure document, narrowing rather than casting blindly. */
function errorBodyOf(response: APIGatewayProxyResult): ErrorResponseBody['error'] {
  const parsed: unknown = JSON.parse(response.body);

  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    throw new Error('the failure response body is not the documented envelope');
  }

  const { error } = parsed;

  if (typeof error !== 'object' || error === null) {
    throw new Error('the failure envelope carries no error object');
  }

  return error as ErrorResponseBody['error'];
}

/** The field paths a rejection published, in order. */
function fieldPathsOf(response: APIGatewayProxyResult): readonly string[] {
  const { fields } = errorBodyOf(response);

  return fields === undefined ? [] : fields.map((field) => field.path);
}

/** Read the single emission a call is documented to produce. */
function soleEmission(emissions: readonly CapturedEmission[]): CapturedEmission {
  expect(emissions).toHaveLength(1);

  const [emission] = emissions;

  if (emission === undefined) {
    throw new Error('nothing was emitted');
  }

  return emission;
}

/**
 * Assert two monetary strings are equal BY VALUE rather than by string identity.
 *
 * JUDGMENT CALL: `'19.990'` and `'19.99'` are the same amount and different strings, so a `toBe`
 * against a rendered price would pin a presentation detail this module has no
 * authority over. The comparison therefore goes through the CFML parity helper, which
 * is the same substrate the ported rounding algorithm uses for exactly this reason -
 * and no float arithmetic is performed on either side, including on the expected value.
 *
 * @param actual - the rendered value from the response document.
 * @param expected - the expected amount, as a decimal string.
 */
function expectSameAmount(actual: string | undefined, expected: DecimalString | string): void {
  if (actual === undefined) {
    throw new Error(`expected the amount ${expected} but the document carried no value`);
  }

  expect(cfNumericEquals(actual, expected)).toBe(true);
}

// ===========================================================================
// THE SUITE
// ===========================================================================

describe('the SKU resolution Lambda entry point', () => {
  let harness: Harness;

  beforeEach(() => {
    // A FRESH SUBJECT, A FRESH GRAPH, A FRESH CALL LOG AND A FRESH LOGGER BEFORE EVERY
    // CASE. Nothing is shared and nothing is memoized across cases, which is the same
    // request-scoping this port applies to four legacy component-level caches - the
    // option-group sort-order memo whose legacy clear can never fire among them.
    harness = createHarness();
  });

  afterEach(() => {
    // `tests/setup.ts` already registers a global `afterEach` restoring mocks and real
    // timers. This one is complementary rather than redundant: it keeps the guarantee
    // local to this file, so the suite does not silently depend on a shared setup file
    // continuing to provide it.
    vi.restoreAllMocks();
  });

  // =========================================================================
  describe('the published module surface', () => {
    it('exports a Lambda entry point that is constructed without any initialisation', () => {
      // The production symbol is `handler`, built at module load by calling the factory
      // with no arguments. Module load is SYNCHRONOUS FACTORY WIRING: no composition
      // root is built, no configuration is read, no connection is opened and no `await`
      // runs until an invocation arrives - which is why this file can be imported, and
      // this suite can run, with a completely empty environment.
      expect(typeof handler).toBe('function');
    });

    it('exposes the dependency seam so a suite can drive it without the real composition root', () => {
      const substituted = createSkuResolutionHandler({ logger: createRecordingLogger().logger });

      expect(typeof substituted).toBe('function');

      // Overrides are shallow-merged over the defaults, so substituting one collaborator
      // leaves the other at its production value. Asserted by construction succeeding
      // with a partial override rather than by reaching into the closure.
      expect(typeof createSkuResolutionHandler()).toBe('function');
    });

    it('answers the one route the shared table declares for this capability', () => {
      // The route table is CONSUMED, not extended. Reading it here documents the contract
      // this suite drives without asserting anything about how the router resolves it -
      // that belongs to the router, which is exercised transitively by every case below.
      expect(ROUTE_TABLE.skuResolution.capability).toBe('skuResolution');
      expect(ROUTE_TABLE.skuResolution.action).toBe('resolveSkus');
      expect(ROUTE_TABLE.skuResolution.path).toBe(SKU_RESOLUTION_PATH);
      expect(ROUTE_TABLE.skuResolution.methods).toBe('GET');
    });
  });

  // =========================================================================
  // CONCERN 1 - ROUTING AND REQUEST VALIDATION
  // =========================================================================
  describe('routing and request validation', () => {
    it('resolves a request on its own canonical route', async () => {
      const response = await createHarness().invoke(servableRequest());

      expect(response.statusCode).toBe(200);
    });

    it('matches the path case-insensitively, as the legacy eq comparison does', async () => {
      // CFML parity [Application.cfc:L133]: subsystem membership is `listFindNoCase` over
      // a comma-delimited literal and path comparison is `eq`, both case-insensitive. The
      // casing in the route table is therefore a readability choice, not a contract.
      const response = await createHarness().invoke(
        apiGatewayEvent({
          path: '/CATALOG/SKUS',
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
        }),
      );

      expect(response.statusCode).toBe(200);
    });

    it('reports a path belonging to another capability as an unmatched route', async () => {
      // Folded into the SAME outcome as a path that matches nothing, deliberately: a
      // distinct outcome here would leak the existence of the other four capabilities.
      const response = await harness.invoke(apiGatewayEvent({ path: '/catalog/products' }));

      expect(response.statusCode).toBe(404);
      expect(errorBodyOf(response).category).toBe('routeNotFound');
      expect(errorBodyOf(response).message).toBe('The requested route does not exist.');
    });

    it('reports a method this route does not answer as an unmatched route', async () => {
      const response = await harness.invoke(apiGatewayEvent({ method: 'POST' }));

      expect(response.statusCode).toBe(404);
      expect(errorBodyOf(response).category).toBe('routeNotFound');
    });

    it('reports a path that matches nothing as an unmatched route', async () => {
      const response = await harness.invoke(apiGatewayEvent({ path: '/catalog/sku' }));

      expect(response.statusCode).toBe(404);
    });

    it('never echoes the requested path into a response body', async () => {
      const probePath = '/catalog/skus-not-a-route';

      const response = await harness.invoke(apiGatewayEvent({ path: probePath }));

      expect(response.body).not.toContain(probePath);

      // The route diagnostic goes to the LOG STREAM, under the caller's correlation
      // identifier, which is where an operator can act on it.
      const emission = soleEmission(harness.emissions);

      expect(emission.level).toBe('warn');
      expect(emission.context?.route).toBe('GET /catalog/skus-not-a-route');
    });

    it('rejects a request that names no operation', async () => {
      // `queryStringParameters` is `null` rather than `{}` when a request carries no
      // query string at all, which is what API Gateway actually supplies.
      const response = await harness.invoke(apiGatewayEvent({ query: null }));

      expect(response.statusCode).toBe(400);
      expect(errorBodyOf(response).category).toBe('invalidRequest');
      expect(errorBodyOf(response).message).toBe('A required query parameter is missing.');
    });

    it('rejects a request whose operation is present but empty', async () => {
      const response = await harness.invoke(apiGatewayEvent({ query: { operation: '' } }));

      expect(response.statusCode).toBe(400);
      expect(errorBodyOf(response).message).toBe('A required query parameter is missing.');
    });

    it('rejects an unrecognised operation and names the field the caller can correct', async () => {
      const response = await harness.invoke(
        apiGatewayEvent({ query: { operation: 'resolveSkusByOptions' } }),
      );

      expect(response.statusCode).toBe(400);
      expect(errorBodyOf(response).category).toBe('invalidRequest');
      expect(fieldPathsOf(response)).toContain('operation');
    });

    it('requires productID for the option-based resolution, as the service does', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L107]: productID is OPTIONAL at the DAO but
      // REQUIRED at the service [model/service/ProductService.cfc:L104], and the service
      // signature is the contract this route publishes.
      const response = await harness.invoke(
        requestFor('getProductSkusBySelectedOptions', { selectedOptions: OPTION_ID_SMALL }),
      );

      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('productID');
    });

    it('requires selectedOptions for the option-based resolution', async () => {
      const response = await harness.invoke(
        requestFor('getProductSkusBySelectedOptions', { productID: PRODUCT_ID }),
      );

      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('selectedOptions');
    });

    it('admits an EMPTY selectedOptions rather than inventing a minimum length', async () => {
      // ★ CFML `required string x` rejects a MISSING argument and accepts an EMPTY one.
      // With `selectedOptions=""` the AND-of-EXISTS loop at [model/dao/SkuDAO.cfc:L113]
      // runs `listLen("")` = 0 times, emits no `exists` clause, and leaves the product
      // filter as the only restriction. THAT IS THE LEGACY BEHAVIOUR OF A MUST-PRESERVE
      // PATH, so a length, trim or membership constraint here would be a behavioural
      // change disguised as input hygiene. DO NOT ADD ONE.
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: '',
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(populated.calls).toHaveLength(1);
      expect(populated.calls[0]?.args).toEqual(['', PRODUCT_ID]);
    });

    it('\u2605\u2605\u2605 FORWARDS an absent skuCode as absence, because the mapped surface declares it optional', async () => {
      // \u2605\u2605\u2605 THIS ASSERTION HAS BEEN RESTORED, AND THE FULL ROUND TRIP IS RECORDED HERE SO
      // NOBODY REPEATS IT. Its original form asserted exactly what it asserts again now, under the
      // reasoning: "`SkuService.getSkuBySkuCode(skuCode?)` is the authoritative contract. The
      // repository may reproduce the legacy required-argument raise, but this transport must not narrow
      // the service signature by manufacturing a boundary-only requiredness rule."
      //
      // It was then INVERTED to require a 400, because QA testing exercised an omission end to end and
      // saw it come back as an opaque 500 - a response a caller cannot act on, and one that inflates the
      // 5xx rate operators alarm on. That observation is real and the motivation was sound.
      //
      // \u2605\u2605 A CODE REVIEW REVERSED THE INVERSION, AND THAT RULING GOVERNS. The legacy declares
      // `string skuCode` with NO `required` attribute [model/service/SkuService.cfc:L289] and the AAP's
      // interface mapping carries that verbatim; making it required at the transport is a signature
      // reshaping, and AAP 0.9.2 budgets exactly three of those with the requirement that any fourth be
      // added to the mapping table WITH JUSTIFICATION before it is accepted. This one was not. Improving
      // the answer a caller gets is a product decision about the SERVICE's contract, taken there and
      // recorded in the plan - not something a boundary may decide for itself.
      //
      // So absence is forwarded as absence, and the service receives exactly what an in-process caller
      // would give it.
      const missingSkuCode = createHarness();
      const response = await missingSkuCode.invoke(requestFor('getSkuBySkuCode'));

      expect(response.statusCode).toBe(200);
      expect(missingSkuCode.calls).toHaveLength(1);
      expect(missingSkuCode.calls[0]?.args).toEqual([undefined]);
    });

    it('\u2605\u2605 still ADMITS an EMPTY skuCode, because the legacy binds it and matches nothing', async () => {
      // The distinction the schema draws is PRESENT-BUT-EMPTY versus ABSENT, which is exactly the
      // distinction the legacy signature draws: `string skuCode` with no `required` attribute admits
      // `''` and binds it, and [model/dao/SkuDAO.cfc:L102] raises only when the argument is not passed
      // at all. Refusing `''` here would narrow the service signature - the thing the previous case's
      // original reasoning was rightly worried about - so it is admitted, forwarded verbatim, and
      // matches nothing.
      const empty = createHarness();
      const response = await empty.invoke(requestFor('getSkuBySkuCode', { skuCode: '' }));

      expect(response.statusCode).toBe(200);
      expect(empty.calls).toHaveLength(1);
      expect(empty.calls[0]?.args).toEqual(['']);
    });

    it('★★★ REFUSES an unrecognised query parameter instead of silently dropping it', async () => {
      // ★★★ THIS ASSERTION IS INVERTED, AND THE INVERSION IS THE FIX. It used to read
      // `toBe(200)` under the comment "Refusing one would invent a strictness the source
      // never expressed." Request-binding review (finding F11) established that the analogy
      // runs the other way: a CFML `cffunction` REJECTS an unknown named argument at
      // invocation, so silently DROPPING one is not the permissive legacy behaviour - it is a
      // new behaviour with no legacy counterpart, and it turns a caller's typo into a
      // different question answered with a confident 200.
      const response = await createHarness().invoke(
        requestFor('getSkuBySkuCode', {
          skuCode: SERVABLE_SKU_CODE,
          // A unique planted value. It is deliberately NOT a word that appears in the mapper's own
          // sentence, so the "never echoed" assertion below cannot pass or fail by coincidence.
          unexpectedParameter: PLANTED_INTERNAL_DETAIL,
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('queryStringParameters');
      // Neither the caller-authored key nor its value is reflected by the fixed refusal.
      expect(response.body).not.toContain('unexpectedParameter');
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
    });

    it('refuses a misspelled parameter without guessing or reflecting its name', async () => {
      const response = await createHarness().invoke(
        apiGatewayEvent({ query: { operation: 'getSkuBySkuCode', skucode: SERVABLE_SKU_CODE } }),
      );

      // \u2605 THE STATUS IS UNCHANGED AND THE FIELD PATH IS THE CLOSED-SET ONE AGAIN, because `skuCode`
      // is optional once more (the reshaping that briefly made it required was reversed - see the
      // forwarding case above). `validateInvocation` runs ahead of the closed-parameter-set check and
      // now ADMITS this request, so the lower-cased `skucode` is caught where it belongs: as the
      // PRESENCE of a key this operation does not publish. Still a 400, and still refused rather than
      // silently dropped.
      //
      // What this case is really about is UNCHANGED and still asserted: the caller's own misspelling is
      // not echoed back, and no correction is guessed at.
      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('queryStringParameters');
      expect(response.body).not.toContain('skucode');
    });

    it('★★★ REFUSES a repeated query parameter rather than resolving it silently', async () => {
      // ★★★ ALSO INVERTED, AND FOR THE SHARPER HALF OF FINDING F11. The previous case was
      // titled "ignores the repeated-parameter map entirely" and rested on the reasoning that
      // a repeated parameter "has no meaning". That is true and is exactly why it must be
      // REFUSED: ignoring the multi-value map means the single-valued map has already
      // discarded one of the caller's two values, so the module answers ONE of two questions
      // and never says which. No schema can notice, because by the time a schema runs the
      // other value is gone.
      const response = await createHarness().invoke(
        apiGatewayEvent({
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
          multiValueQuery: { skuCode: [SERVABLE_SKU_CODE, 'A-DIFFERENT-CODE'] },
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('multiValueQueryStringParameters');
      // Neither submitted value reaches the caller.
      expect(response.body).not.toContain('A-DIFFERENT-CODE');
    });

    it('refuses a repeated operation selector before reading either value', async () => {
      const response = await createHarness().invoke(
        apiGatewayEvent({
          query: null,
          multiValueQuery: { operation: ['getSkuBySkuCode', 'getProductSkusBySelectedOptions'] },
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('multiValueQueryStringParameters');
    });

    it('admits a parameter supplied exactly once through the multi-value map alone', async () => {
      // The refusal is on REPETITION, not on the map's presence: a single-element multi-value
      // entry is a well-formed request and must still be served.
      const response = await createHarness().invoke(
        apiGatewayEvent({
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
          multiValueQuery: { skuCode: [SERVABLE_SKU_CODE] },
        }),
      );

      expect(response.statusCode).toBe(200);
    });

    it('opens no connection and no request scope for any unusable request', async () => {
      // ★★ THE STRUCTURAL GUARANTEE, ASSERTED ACROSS EVERY REJECTION SHAPE AT ONCE.
      // Validation is total and runs before anything is awaited, so a request the module
      // has already established it cannot serve does no work in the database tier.
      const rejections: readonly APIGatewayProxyEvent[] = [
        apiGatewayEvent({ path: '/catalog/products' }),
        apiGatewayEvent({ method: 'POST' }),
        apiGatewayEvent({ query: null }),
        apiGatewayEvent({ query: { operation: '' } }),
        apiGatewayEvent({ query: { operation: 'getSkuStocksDeletableFlag' } }),
        requestFor('getProductSkusBySelectedOptions', { selectedOptions: OPTION_ID_RED }),
        // The three withdrawn actions (findings F10 and F18) are refused as unrecognized
        // operations, and they open nothing either.
        apiGatewayEvent({ query: { operation: 'searchSkusByProductType', term: 'TESTSKU' } }),
        apiGatewayEvent({ query: { operation: 'findSkus', keyword: 'TESTSKU' } }),
        apiGatewayEvent({ query: { operation: 'getTransactionExistsFlag' } }),
        // A misspelled and a repeated parameter are refused at admission too (finding F11).
        requestFor('getSkuBySkuCode', { skuCode: SERVABLE_SKU_CODE, notAParameter: 'x' }),
        apiGatewayEvent({
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
          multiValueQuery: { skuCode: [SERVABLE_SKU_CODE, 'OTHER'] },
        }),
      ];

      for (const event of rejections) {
        const isolated = createHarness();

        const response = await isolated.invoke(event);

        expect(response.statusCode).not.toBe(200);
        expect(isolated.bootstrapCount()).toBe(0);
        expect(isolated.scopeOpenings).toHaveLength(0);
        expect(isolated.calls).toHaveLength(0);
      }
    });
  });

  // =========================================================================
  // CONCERN 2 - DELEGATION TO THE PORTED SERVICE SURFACE
  //
  // ★ THE OPERATION NAMES ARE THE ACCEPTANCE CONTRACT. Every request below names its
  // operation with the VERBATIM legacy CFML method name, because a reviewer diffing the
  // two surfaces method by method must find `getProductSkusBySelectedOptions` spelled
  // exactly as [model/service/ProductService.cfc:L104] spells it - not a tidier
  // `resolveSkusByOptions`, which the previous section proves is rejected.
  // =========================================================================
  describe('delegation to the ported service surface', () => {
    it('forwards selectedOptions FIRST and productID SECOND, in declaration order', async () => {
      // ★★ MUST-PRESERVE. Two same-typed string parameters silently swapped would resolve
      // a DIFFERENT set of SKUs while every type still checked, which is why the argument
      // list is asserted positionally rather than by name. The legacy caller at
      // [model/entity/Product.cfc:L367] passes them positionally in this same order.
      const selectedOptions = `${OPTION_ID_SMALL},${OPTION_ID_RED}`;
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', { selectedOptions, productID: PRODUCT_ID }),
      );

      expect(populated.calls).toHaveLength(1);
      expect(populated.calls[0]?.member).toBe('ProductService.getProductSkusBySelectedOptions');
      expect(populated.calls[0]?.args).toEqual([selectedOptions, PRODUCT_ID]);
    });

    it('forwards selectedOptions untrimmed, unsorted, uncase-folded and un-deduplicated', async () => {
      // ★★ ANY NORMALISATION HERE CHANGES WHICH SKUS MATCH. The AND-of-EXISTS statement
      // builds one `exists` clause per element with a bound parameter each
      // [model/dao/SkuDAO.cfc:L113-L121], so element parsing belongs to the repository
      // tier where the binding happens - not to a primary adapter.
      //
      // The value below is deliberately hostile on all four axes at once: leading and
      // trailing whitespace, descending rather than ascending order, mixed case, and a
      // repeated element.
      const hostile = ` ${OPTION_ID_RED} ,${OPTION_ID_SMALL.toUpperCase()},${OPTION_ID_RED} `;
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: hostile,
          productID: PRODUCT_ID,
        }),
      );

      const forwarded = populated.calls[0]?.args[0];

      // Byte-for-byte, which is the only assertion that rules out all four at once.
      expect(forwarded).toBe(hostile);
      expect(forwarded).not.toBe(hostile.trim());
      expect(forwarded).not.toBe(hostile.toLowerCase());
    });

    it('forwards an EMPTY productID verbatim and answers an empty collection', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L123]: the productID clause is guarded by
      // structKeyExists, NOT len(), so an empty-string productID still appends
      // `and sku.product.id = ?` and matches NOTHING. The empty answer is therefore the
      // legacy outcome, and an adapter that read `''` as "no product filter" would turn
      // "no SKU matches" into "every SKU matches".
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: '',
        }),
      );

      expect(populated.calls[0]?.args).toEqual([OPTION_ID_SMALL, '']);
      expect(response.statusCode).toBe(200);
      expect(outcomeFor(response, 'getProductSkusBySelectedOptions').skus).toEqual([]);
    });

    it('forwards a sku code verbatim and answers undefined on a miss', async () => {
      // ★ `undefined`, AND NOTHING ELSE. Not `0`, not `null`, not an empty object and not
      // a SKU with zeroed prices: [model/dao/SkuDAO.cfc:L103] executes with the
      // `ormExecuteQuery` unique flag, which answers one entity or nothing.
      const skuCode = 'TESTSKUXXX';

      const response = await harness.invoke(requestFor('getSkuBySkuCode', { skuCode }));

      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0]?.member).toBe('SkuService.getSkuBySkuCode');
      expect(harness.calls[0]?.args).toEqual([skuCode]);
      expect(outcomeFor(response, 'getSkuBySkuCode').sku).toBeUndefined();
    });

    it('routes an alternate sku code to the same service member as a primary one', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the lookup matches `skuCode` OR
      // `alternateSkuCode` through a LEFT JOIN on `ss.alternateSkuCodes`, binding ONE
      // parameter to both sides. The two are therefore not two routes, and an adapter that
      // restricted itself to the primary code would silently withdraw half the contract.
      const alternate = 'LEGACY-ALT-0001';

      await harness.invoke(requestFor('getSkuBySkuCode', { skuCode: alternate }));

      expect(harness.calls[0]?.member).toBe('SkuService.getSkuBySkuCode');
      expect(harness.calls[0]?.args).toEqual([alternate]);
    });

    // ★★ FOUR DELEGATION CASES USED TO SIT HERE AND WENT WITH THEIR OPERATIONS. They covered
    // `searchSkusByProductType`'s singular-versus-plural `productTypeID` and its absent-versus-empty
    // distinction, `getTransactionExistsFlag`'s no-argument call, and `findSkus`' single typed
    // criteria object. All three operations were withdrawn from this routed surface by findings F10
    // and F18, so there is no forwarding left here to assert.
    //
    // ★★★ AND THE `getTransactionExistsFlag` CASE IS THE ONE WORTH NAMING. It read "invokes the
    // transaction-exists flag with no arguments at all" and asserted `args` was `[]` - which was
    // TRUE of the double and true of the service, and was precisely the defect: the service forwards
    // no arguments, so `MysqlSkuRepository.getTransactionExistsFlag` receives neither identifier and
    // raises `SkuColumnError`. The case passed because a scripted double answered where production
    // throws. That is the shape of test that hides an integration gap rather than closing it, and it
    // is recorded here so the same case is not reintroduced.
    //
    // The three service members are unchanged and each keeps its own service-tier coverage: the
    // singular/plural asymmetry [model/dao/SkuDAO.cfc:L130] versus [model/dao/ProductDAO.cfc], the
    // `structKeyExists`-plus-non-blank gate [model/dao/SkuDAO.cfc:L134], and the smart-list
    // substitution [model/service/SkuService.cfc:L309] all live where the signatures do.

    it('invokes EXACTLY ONE service member and opens EXACTLY ONE request scope', async () => {
      const populated = createHarness();

      await populated.invoke(servableRequest());

      expect(populated.bootstrapCount()).toBe(1);
      expect(populated.scopeOpenings).toHaveLength(1);
      expect(populated.calls).toHaveLength(1);
    });

    it('opens the request scope with the authenticated account and no fabricated route state', async () => {
      // The admission gate establishes the one request-scoped value this route owns. It
      // still fabricates no date, feed host, administrative flag or address-zone request.
      const populated = createHarness();

      await populated.invoke(servableRequest());

      expect(populated.scopeOpenings[0]?.input).toEqual({
        accountID: AUTHENTICATED_ACCOUNT_ID,
      });
    });

    it('opens a FRESH scope per invocation and holds none between them', async () => {
      // A module-scope cache of a request scope would carry one caller's memoized state -
      // a currency map, a rounding-rule memo, the option-group sort-order memo whose
      // legacy clear at [model/dao/SkuDAO.cfc:L222-L226] can never fire - into another
      // caller's request on a warm container.
      const populated = createHarness();

      await populated.invoke(servableRequest());
      await populated.invoke(servableRequest());

      expect(populated.scopeOpenings).toHaveLength(2);
      expect(populated.bootstrapCount()).toBe(2);
      expect(populated.calls).toHaveLength(2);
    });
  });

  // =========================================================================
  // CONCERN 3 - API GATEWAY RESPONSE SHAPING
  // =========================================================================
  describe('API Gateway response shaping', () => {
    it('answers 200 with an explicit JSON content type and no-store caching', async () => {
      // `cache-control: no-store` is the non-inventing choice: the legacy slice published
      // no caching semantics for any of these reads, and choosing a freshness lifetime
      // would invent one - a decision with product consequences for a price-bearing
      // document. It is not a performance setting and nothing here asserts one.
      //
      // ★ THE HEADER SET IS NOW THE SHARED ONE (finding F13). The values are identical to the
      // ones this module used to declare for itself; what changed is that they are declared
      // once, in `../../../src/handlers/errorMapper.js`, for the success and failure halves of
      // the same contract. The `no-store` reasoning above travelled with them verbatim.
      const response = await createHarness().invoke(servableRequest());

      expect(response.statusCode).toBe(200);
      // ★ A THIRD BRIEFLY JOINED THEM - `nosniff` - and a code review withdrew it as an HTTP semantic
      // the ported system never had and the AAP never prescribed (0.8.1). Still an EXACT set, which is
      // what keeps it withdrawn.
      expect(response.headers).toEqual({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
    });

    it('publishes the SHARED success envelope, with the outcome inside it', async () => {
      // ★★★ FINDING F13. The envelope used to be `{requestId, outcome}` - this module's own -
      // and its three siblings each had a different one, two of them with no correlation
      // identifier at all. The outer document is now `{requestId, capability, action, result}`
      // for every capability, and the capability payload travels inside `result`. Both key sets
      // are pinned exactly so an added member fails here rather than widening silently.
      const response = await createHarness().invoke(servableRequest());
      const body = successBodyOf(response);

      expect(Object.keys(body).sort()).toEqual(['action', 'capability', 'requestId', 'result']);
      expect(body.capability).toBe('skuResolution');
      expect(body.action).toBe('resolveSkus');
      expect(Object.keys(body.result)).toEqual(['outcome']);
      expect(body.result.outcome.operation).toBe('getSkuBySkuCode');
    });

    it('★★★ prefers the INVOCATION correlation identifier over the gateway one', async () => {
      // ★★★ THIS PRECEDENCE IS REVERSED, AND THIS MODULE WAS THE OUTLIER. It used to prefer
      // `event.requestContext.requestId` on the reasoning that "that is the value a caller sees
      // and can quote", and it was the only one of the five entrypoints in that order.
      // Correlation review (finding F8) settled it on a concrete argument rather than on
      // uniformity: the runtime's `awsRequestId` is the identifier the platform's own
      // START/END/REPORT lines carry for THIS execution, so an operator joining a response to a
      // log stream lands on the right invocation even when the gateway retried and produced TWO
      // executions under ONE gateway identifier - the exact case the old order resolved wrongly.
      const populated = createHarness();

      const bothPresent = await populated.invoke(servableRequest(), {
        awsRequestId: INVOCATION_REQUEST_ID,
      });
      const gatewayOnly = await populated.invoke(servableRequest());
      const invocationOnly = await populated.invoke(
        apiGatewayEvent({
          requestId: '',
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
        }),
        { awsRequestId: INVOCATION_REQUEST_ID },
      );
      const neither = await populated.invoke(
        apiGatewayEvent({
          requestId: '',
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
        }),
      );

      expect(successBodyOf(bothPresent).requestId).toBe(INVOCATION_REQUEST_ID);
      expect(successBodyOf(gatewayOnly).requestId).toBe(GATEWAY_REQUEST_ID);
      expect(successBodyOf(invocationOnly).requestId).toBe(INVOCATION_REQUEST_ID);
      // A fixed, obviously-synthetic marker is the honest value for "there was nothing to
      // correlate with"; a fabricated random identifier would look real and correlate with
      // nothing. The token moved to the shared resolver with the precedence.
      expect(successBodyOf(neither).requestId).toBe(UNATTRIBUTED_REQUEST_ID);
    });

    it('publishes the collection in the order the service returned it, unmodified', async () => {
      // ★★ NO FILTERING, NARROWING, WIDENING, DE-DUPLICATION, SORTING OR RE-ORDERING.
      // Any of those would silently change must-preserve behaviour: this collection is
      // derived from AND-of-EXISTS matching [model/dao/SkuDAO.cfc:L107-L128], and the
      // ordering contract of the sorted-SKU path is the option-group sort order
      // established in SQL at [model/dao/SkuDAO.cfc:L172-L202]. Whatever the service
      // answered is what is published.
      //
      // The input is deliberately NOT in identifier order and carries a repeated element,
      // so a hidden sort and a hidden de-duplication each fail this case on their own.
      const skuA = makeSkuFixture({ andOfExistsMember: 'A' });
      const skuB = makeSkuFixture({ andOfExistsMember: 'B' });
      const skuC = makeSkuFixture({ andOfExistsMember: 'C' });
      const populated = createHarness({
        productSkusBySelectedOptions: [skuC, skuA, skuB, skuA],
      });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: PRODUCT_ID,
        }),
      );

      const { skus } = outcomeFor(response, 'getProductSkusBySelectedOptions');

      expect(skus.map((sku) => sku.skuID)).toEqual([
        skuC.getSkuID(),
        skuA.getSkuID(),
        skuB.getSkuID(),
        skuA.getSkuID(),
      ]);
    });

    it('publishes an empty collection as an empty array rather than as an absent member', async () => {
      // Moved onto `getProductSkusBySelectedOptions` when `searchSkusByProductType` was withdrawn
      // (finding F10). The behaviour asserted is unchanged and belongs to whichever collection
      // operation survives: a NO-MATCH is an empty array, present, and NOT an omitted member.
      // Omission is reserved for the single-SKU miss, where it means "the service answered
      // `undefined`"; using it for an empty collection would conflate two different answers.
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: 'no-such-option',
          productID: PRODUCT_ID,
        }),
      );

      const outcome = outcomeFor(response, 'getProductSkusBySelectedOptions');

      expect(outcome.skus).toEqual([]);
      expect('skus' in outcome).toBe(true);
    });

    it('renders money at FULL PRECISION rather than through the two-decimal mask', async () => {
      // ★ `Money.toDecimalString()`, NOT `Money.toFixed2()`. The two-decimal mask is the
      // presentation step the legacy performs at the END of a calculating function
      // [model/service/PromotionService.cfc:L1017]; a response body is a machine-readable
      // document, and rounding a price in transit would be lossy in exactly the case that
      // matters - a converted price from step 3 of the cascade can carry more than two
      // decimals and the SKU's own columns are `big_decimal`.
      const price = Money.fromDecimalString('19.9925');
      const sku = makeSkuFixture({ price });
      const populated = createHarness({ productSkusBySelectedOptions: [sku] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: PRODUCT_ID,
        }),
      );

      const [projected] = outcomeFor(response, 'getProductSkusBySelectedOptions').skus;

      if (projected === undefined) {
        throw new Error('the document carried no sku');
      }

      // Compared BY VALUE through the CFML parity helper, never by string identity.
      expectSameAmount(projected.price, '19.9925');
      expect(cfNumericEquals(projected.price, price.toFixed2())).toBe(false);
    });

    it('omits skuCode, imageFile and productID when the entity carries none', async () => {
      // OMITTED, never `''` and never `null`. `JSON.stringify` drops a member whose value
      // is `undefined`, so the consumer reads back the exact absence the entity holds
      // rather than a second absence marker it has to translate.
      const sku = makeSkuFixture({ skuCode: undefined, product: undefined });
      const populated = createHarness({ productSkusBySelectedOptions: [sku] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: PRODUCT_ID,
        }),
      );

      const [projected] = outcomeFor(response, 'getProductSkusBySelectedOptions').skus;

      if (projected === undefined) {
        throw new Error('the document carried no sku');
      }

      expect('skuCode' in projected).toBe(false);
      expect('imageFile' in projected).toBe(false);
      expect('productID' in projected).toBe(false);
      expect(response.body).not.toContain('"skuCode":null');
      expect(response.body).not.toContain('"productID":""');
    });

    it('publishes the owning product identifier when the association is present', async () => {
      const sku = makeSkuFixture({ product: makeProductFixture({ productID: PRODUCT_ID }) });
      const populated = createHarness({ productSkusBySelectedOptions: [sku] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: PRODUCT_ID,
        }),
      );

      expect(outcomeFor(response, 'getProductSkusBySelectedOptions').skus[0]?.productID).toBe(
        PRODUCT_ID,
      );
    });

    it('carries the option identifiers as the CFML comma-delimited list the entity builds', async () => {
      // List form rather than an array, because that is the shape the legacy accessor
      // publishes AND the shape `getProductSkusBySelectedOptions` CONSUMES: a consumer can
      // feed this value straight back into a subsequent resolution without re-assembling
      // it, which an array would force it to do and would give it a second chance to
      // disagree with the SQL about what a delimiter is.
      const sku = makeSkuFixture({ andOfExistsMember: 'A' });
      const populated = createHarness({ productSkusBySelectedOptions: [sku] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: sku.getOptionsIDList(),
          productID: PRODUCT_ID,
        }),
      );

      const [projected] = outcomeFor(response, 'getProductSkusBySelectedOptions').skus;

      expect(projected?.optionIDList).toBe(sku.getOptionsIDList());
      expect(projected?.optionIDList).toContain(',');
    });

    it('omits the sku member entirely on a lookup miss', async () => {
      const response = await harness.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'NO-SUCH-CODE' }),
      );

      const outcome = outcomeFor(response, 'getSkuBySkuCode');

      expect('sku' in outcome).toBe(false);
      expect(response.body).not.toContain('"sku":null');
      expect(response.body).not.toContain('"sku":{}');
    });

    it('publishes an unmaterialized per-currency map as {} - the legacy own state', async () => {
      // `{}` means the eligibility gate at [model/entity/Sku.cfc:L373] was closed, or that
      // the SKU was hydrated for a path that needs no currency-aware price. It is a
      // legitimate state and is published as such; it must not be mistaken for a
      // serialization gap, and no accessor invents a zero to cover it.
      const sku = makeSkuFixture();
      const populated = createHarness({ skuBySkuCode: sku });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(outcomeFor(response, 'getSkuBySkuCode').sku?.currencyDetails).toEqual({});
    });

    it('publishes the materialized cascade with its own presentation strings verbatim', async () => {
      const sku = makeSkuFixture({ price: Money.fromDecimalString('19.9925') });

      // The fixture answers an UNHYDRATED sku; this is the documented boundary that runs
      // the four-step cascade [model/entity/Sku.cfc:L367-L433] once.
      await Sku.hydrate(sku);

      const populated = createHarness({ skuBySkuCode: sku });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      const details = outcomeFor(response, 'getSkuBySkuCode').sku?.currencyDetails;
      const base = details?.USD;

      if (base === undefined) {
        throw new Error('the document carried no base-currency entry');
      }

      // Step 1 wrote the SKU's own columns, so nothing was converted and no override row
      // was involved [model/entity/Sku.cfc:L382, L396].
      expect(base.converted).toBe(false);
      expect(base.skuCurrencyID).toBe('');

      // The money member is full precision; the `*Formatted` member is the CASCADE'S OWN
      // string, copied verbatim. The two differing is exactly the point: this module
      // formats nothing, and it rounds nothing.
      expectSameAmount(base.price, '19.9925');
      expect(base.priceFormatted).toBe('19.99');
    });

    it('OMITS a stranded currency sub-key rather than coercing it to zero', async () => {
      // ★★ THE HIGHEST-CONSEQUENCE ASSERTION IN THIS FILE.
      //
      // `getPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L273] performs ONE
      // `structKeyExists` and has no `else` and no return outside the `if`, so an unknown
      // currency yields nothing. `getListPriceByCurrencyCode` [L275-L279] and
      // `getRenewalPriceByCurrencyCode` [L281-L285] perform a SECOND check on the sub-key,
      // so they yield nothing even for a currency that IS in the map. SUBSTITUTING `0`
      // ANYWHERE ALONG THAT CHAIN WOULD SILENTLY SELL PRODUCTS FOR FREE, and this module
      // is the last place those semantics could be lost.
      const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });

      await Sku.hydrate(sku);

      // The state the projection is handed: a real amount for one accessor and NOTHING for
      // the other two, on the same present currency. Contract-honest data, not a defect.
      expect(sku.getPriceByCurrencyCode('EUR')).toBeInstanceOf(Money);
      expect(sku.getListPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getRenewalPriceByCurrencyCode('EUR')).toBeUndefined();
      expect(sku.getPriceByCurrencyCode('GBP')).toBeUndefined();

      const populated = createHarness({ skuBySkuCode: sku });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      const stranded = outcomeFor(response, 'getSkuBySkuCode').sku?.currencyDetails.EUR;

      if (stranded === undefined) {
        throw new Error('the document carried no override-currency entry');
      }

      expectSameAmount(stranded.price, '17.49');
      expect('listPrice' in stranded).toBe(false);
      expect('renewalPrice' in stranded).toBe(false);
      expect('listPriceFormatted' in stranded).toBe(false);
      expect('renewalPriceFormatted' in stranded).toBe(false);

      // And nowhere in the raw document, which is the assertion a named-field check would
      // pass while a zero still shipped inside a field this suite did not think to read.
      expect(response.body).not.toContain('"listPrice":0');
      expect(response.body).not.toContain('"renewalPrice":0');
      expect(response.body).not.toContain('"listPrice":"0"');
      expect(response.body).not.toContain('"renewalPrice":"0"');
      expect(response.body).not.toContain('"listPrice":null');
      expect(response.body).not.toContain('"renewalPrice":null');
    });

    it('preserves currency-code key casing exactly as the cascade stored it', async () => {
      const sku = makeSkuFixture();

      await Sku.hydrate(sku);

      const populated = createHarness({ skuBySkuCode: sku });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      const details = outcomeFor(response, 'getSkuBySkuCode').sku?.currencyDetails ?? {};

      // Folding these would change a published document on a case convention this module
      // has no authority over.
      expect(Object.keys(details).sort()).toEqual(['EUR', 'USD']);
    });

    // ★★ THE TYPED-PAGE CASE WENT WITH `findSkus` (finding F10). It asserted that the page's
    // `keywordProperties` and `joins` were published exactly as the service built them -
    // `skuCode like` against one table [model/dao/SkuDAO.cfc:L132] and NO joins, because the
    // product-type restriction at [L135] is an `IN` SUBQUERY rather than a join. That narrowing
    // always belonged to the service tier, which owns, documents and covers it; this suite only
    // ever asserted that nothing was added on the way out. With the operation withdrawn there is
    // no page to publish, and `SkuPageProjection` was removed from the module's exports with it.

    it('emits ONE structured line carrying a count, and no measurement of any kind', async () => {
      const skuA = makeSkuFixture({ andOfExistsMember: 'A' });
      const skuB = makeSkuFixture({ andOfExistsMember: 'B' });
      const populated = createHarness({ productSkusBySelectedOptions: [skuA, skuB] });

      await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: PRODUCT_ID,
        }),
      );

      const emission = soleEmission(populated.emissions);

      expect(emission.level).toBe('info');
      expect(emission.message).toBe('sku resolution operation completed');

      // ★ THE KEY SET IS ASSERTED EXHAUSTIVELY, which is what rules out a duration, a
      // rate, a size or any other measurement having been added: a count is legible and
      // carries nothing confidential, and nothing in this port asserts a service level.
      //
      // ★★ `route` IS NEW AND IS THE FIFTH KEY. Finding F8 found the route absent from this
      // module's success AND failure lines, so an operator could not group either by endpoint.
      // It is built from the matched route row's own frozen members - never from
      // `event.httpMethod`, which the caller controls and which the router matches
      // case-insensitively - so it is one of a CLOSED set of five labels.
      expect(Object.keys(emission.context ?? {}).sort()).toEqual([
        'capability',
        'operation',
        'requestId',
        'resultCount',
        'route',
      ]);
      expect(emission.context?.capability).toBe('skuResolution');
      expect(emission.context?.operation).toBe('getProductSkusBySelectedOptions');
      expect(emission.context?.requestId).toBe(GATEWAY_REQUEST_ID);
      expect(emission.context?.resultCount).toBe(2);
      expect(emission.context?.route).toBe(
        `${ROUTE_TABLE.skuResolution.methods} ${ROUTE_TABLE.skuResolution.path}`,
      );
    });
  });

  // =========================================================================
  // CONCERN 4 - DOMAIN AND ERROR MAPPING
  //
  // One mapping point, the closed status set this authenticated route can reach, and one
  // message published verbatim. Everything else is withheld from the body AND from the log
  // line, because a log line is durable and centrally aggregated: publishing detail there
  // rather than in a body changes who can read it, not whether it leaked.
  // =========================================================================
  describe('domain and error mapping', () => {
    it('maps an unrecognised failure to a generic response and leaks nothing', async () => {
      // The pinned MySQL driver composes its message out of the server's own error text
      // and hangs the failing statement off the error object, so for a syntax or
      // constraint failure the message itself embeds the statement AND its bound values.
      const failure = new Error(
        `Unknown column in ${PLANTED_STATEMENT} :: ${PLANTED_INTERNAL_DETAIL}`,
      );
      const populated = createHarness({ failure: { kind: 'throw', thrown: failure } });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).category).toBe('unrecognized');
      expect(errorBodyOf(response).message).toBe('The request could not be completed.');
      expect(errorBodyOf(response).requestId).toBe(GATEWAY_REQUEST_ID);

      // Asserted against the RAW body, not only against named fields: a check that read
      // one field would pass while the statement still shipped inside another.
      expect(response.body).not.toContain(PLANTED_STATEMENT);
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
      expect(response.body).not.toContain('SwSku');

      // The failure IS reported - to the log stream, under the caller's correlation
      // identifier - as a CLASSIFICATION rather than as the thrown value. The mapper is
      // selective by design, so the detail is withheld from both surfaces; what an
      // operator gets is the correlation identifier and the shape.
      const emission = soleEmission(populated.emissions);

      expect(emission.level).toBe('error');
      expect(emission.context?.category).toBe('unrecognized');
      expect(emission.context?.statusCode).toBe(500);
      expect(emission.context?.requestId).toBe(GATEWAY_REQUEST_ID);
      expect(emission.context?.thrownShape).toBe('Error');
      expect(emission.serialized).not.toContain(PLANTED_STATEMENT);
      expect(emission.serialized).not.toContain(PLANTED_INTERNAL_DETAIL);
    });

    it('maps a REJECTED service promise through the same single point', async () => {
      // Both shapes reach the handler's one `catch`: a service that raises synchronously
      // and a service whose promise rejects. A second mapping point would let one failure
      // be classified twice.
      const populated = createHarness({
        failure: {
          kind: 'reject',
          reason: new Error(`rejected: ${PLANTED_INTERNAL_DETAIL}`),
        },
        productSkusBySelectedOptions: [],
      });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: OPTION_ID_SMALL,
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).category).toBe('unrecognized');
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
    });

    it('reproduces the framework dead-call-target message VERBATIM, grammar and all', async () => {
      // ★ THE ONE MESSAGE PUBLISHED VERBATIM. Identical at
      // [org/Hibachi/HibachiEntity.cfc:L565] and [org/Hibachi/HibachiService.cfc:L280], it
      // is an OBSERVABLE BEHAVIOURAL CONTRACT.
      //
      // LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565]: the framework's terminal
      // `onMissingMethod` throw reads "does not exists", which is grammatically incorrect.
      // Preserved deliberately; do not fix without a product decision.
      //
      // It is server-shaped rather than client-shaped because a dead call target is this
      // service's defect and not the caller's.
      const contractMessage =
        'You have called a method getSomeAbsentMember() which does not exists in the ' +
        'SlatwallSku entity.';
      const populated = createHarness({
        failure: { kind: 'throw', thrown: new Error(contractMessage) },
      });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).category).toBe('missingMethod');
      expect(errorBodyOf(response).message).toBe(contractMessage);
      expect(errorBodyOf(response).message).toContain('does not exists');
    });

    it('does NOT conflate the grammatically correct framework variant with that contract', async () => {
      // [org/Hibachi/HibachiObject.cfc:L126] throws a DISTINCT message - "You have
      // attempted to call the method X which does not exist in Y" - and it is not the
      // recognised contract. Folding the two together would publish a message the
      // recogniser never verified, so the correct outcome is the generic response.
      const distinctVariant =
        'You have attempted to call the method getSomeAbsentMember which does not exist in ' +
        'Slatwall.model.entity.Sku';
      const populated = createHarness({
        failure: { kind: 'throw', thrown: new Error(distinctVariant) },
      });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).category).toBe('unrecognized');
      expect(errorBodyOf(response).message).toBe('The request could not be completed.');
      expect(response.body).not.toContain('does not exist in');
    });

    it('maps a thrown non-Error without echoing it', async () => {
      const populated = createHarness({
        failure: { kind: 'throw', thrown: `raw string failure: ${PLANTED_INTERNAL_DETAIL}` },
      });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).message).toBe('The request could not be completed.');
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
      expect(soleEmission(populated.emissions).context?.thrownShape).toBe('string');
    });

    it('maps a failure to build the composed graph, without reaching any service', async () => {
      // The composition root is awaited INSIDE the invocation rather than at module load
      // precisely so this failure is attributable to a request and correlatable on the log
      // stream, instead of being a container-level fault with no request to attribute.
      const populated = createHarness({}, 'bootstrap');

      const response = await populated.invoke(servableRequest());

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).category).toBe('unrecognized');
      expect(errorBodyOf(response).requestId).toBe(GATEWAY_REQUEST_ID);
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
      expect(populated.bootstrapCount()).toBe(1);
      expect(populated.scopeOpenings).toHaveLength(0);
      expect(populated.calls).toHaveLength(0);
    });

    it('maps a failure to open the request scope, without reaching any service', async () => {
      const populated = createHarness({}, 'scope');

      const response = await populated.invoke(servableRequest());

      expect(response.statusCode).toBe(500);
      expect(errorBodyOf(response).category).toBe('unrecognized');
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
      expect(populated.scopeOpenings).toHaveLength(1);
      expect(populated.calls).toHaveLength(0);
    });

    it('never publishes a stack trace, a statement or an internal exception detail', async () => {
      const failure = new Error(`boom :: ${PLANTED_INTERNAL_DETAIL}`);
      const populated = createHarness({ failure: { kind: 'throw', thrown: failure } });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(response.body).not.toContain('stack');
      expect(response.body).not.toContain('    at ');
      expect(response.body).not.toContain('Error:');
      expect(response.body).not.toContain('select ');
      expect(response.body).not.toContain('.ts:');
    });

    it('produces only the closed status set, and no header beyond the three declared', async () => {
      // ★ CLIENT-SHAPED, UNAUTHENTICATED, SERVER-SHAPED, ROUTE-NOT-FOUND, AND SUCCESS.
      // No 403, 409, 422 or 429 is reachable because this route has no administrative
      // operation, conflict tier, semantic-validation tier or rate limiter. No
      // `retry-after`, rate-limit, challenge or circuit-breaker header is emitted.
      const observed = new Set<number>();
      const populatedResponses: readonly APIGatewayProxyResult[] = [
        await createHarness().invoke(servableRequest()),
        await createHarness().invoke(apiGatewayEvent({ authorizer: null })),
        await createHarness().invoke(apiGatewayEvent({ path: '/catalog/products' })),
        await createHarness().invoke(apiGatewayEvent({ query: null })),
        await createHarness({ failure: { kind: 'throw', thrown: new Error('boom') } }).invoke(
          requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
        ),
      ];

      for (const response of populatedResponses) {
        observed.add(response.statusCode);

        expect(Object.keys(response.headers ?? {}).sort()).toEqual([
          'cache-control',
          'content-type',
        ]);
      }

      expect([...observed].sort((left, right) => left - right)).toEqual([200, 400, 401, 404, 500]);
    });
  });

  // =========================================================================
  // THE SURFACE THIS ROUTE DELIBERATELY DOES NOT PUBLISH
  //
  // "This handler does not publish X" is only auditable if X is named, so the subject
  // names every one in source and this section holds that inventory to its documented
  // size. A key added there cannot make anything reachable - the dispatcher is a `switch`
  // over a closed union - which is exactly why the negative half needs its own coverage.
  // =========================================================================
  describe('the deliberately non-exposed surface', () => {
    it('names every absent member, and the inventory has neither grown nor shrunk', async () => {
      // ★★ THREE ENTRIES WERE ADDED, one per WITHDRAWN operation (findings F10 and F18). They are
      // recorded in the same inventory as the never-published members, because "this route does not
      // answer for X" is only auditable if X is named - and a caller that used to reach one of them
      // deserves to find the reason in the shipped artifact rather than in a changelog.
      expect(Object.keys(NON_EXPOSED_SURFACE_NOTES).sort()).toEqual([
        'createSkus',
        'findSkus',
        'getProductSkus',
        'getSkuStocksDeletableFlag',
        'getSortedProductSkus',
        'getTransactionExistsFlag',
        'outOfScopeModules',
        'outOfScopeProductProcesses',
        'processImageUpload',
        'searchSkusByProductType',
        'subscriptionAndContentAccessSkuCreation',
      ]);

      // ★ TWO PREFIXES, AND THE DISTINCTION IS DELIBERATE. A member that was NEVER published reads
      // "Not exposed."; one that WAS published and has been removed reads "WITHDRAWN (finding Fnn)."
      // Flattening them into one prefix would erase the difference between a boundary and a
      // correction, which is the thing a reviewer most needs to see.
      const withdrawn = ['findSkus', 'getTransactionExistsFlag', 'searchSkusByProductType'];

      for (const [member, reason] of Object.entries(NON_EXPOSED_SURFACE_NOTES)) {
        if (withdrawn.includes(member)) {
          expect(reason.startsWith('WITHDRAWN (finding F')).toBe(true);
        } else {
          expect(reason.startsWith('Not exposed.')).toBe(true);
        }
      }

      // LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag` delegates at
      // [L282] to a SkuDAO member that does not exist, so the legacy raises on every call.
      // Preserved deliberately; do not fix without a product decision.
      //
      // NO REPLACEMENT QUERY IS AUTHORED ANYWHERE, the seven-member SkuRepository port
      // omits the member deliberately, and the error mapper has NOTHING TO MAP for it: its
      // missing-method recogniser answers for the framework's dead-call-target contract,
      // which this defect never reaches because `org/Hibachi/HibachiDAO.cfc` declares no
      // `onMissingMethod` at all and the failure surfaces as a raw CFML engine error.
      expect(NON_EXPOSED_SURFACE_NOTES.getSkuStocksDeletableFlag).toContain(
        'model/service/SkuService.cfc:L281',
      );

      // And it is genuinely unroutable, not merely undocumented.
      const isolated = createHarness();
      const response = await isolated.invoke(
        apiGatewayEvent({ query: { operation: 'getSkuStocksDeletableFlag', skuID: 'sku-0001' } }),
      );

      expect(response.statusCode).toBe(400);
      expect(isolated.calls).toHaveLength(0);
    });

    it('publishes no route to any member that takes a hydrated entity', async () => {
      // A primary adapter can obtain no hydrated `Product` or `Sku` - `RequestScope`
      // publishes no repository and no service publishes a load-by-identifier - and it may
      // construct none. Every one of these therefore fails validation rather than being
      // half-wired to something that could not work.
      //
      // `getSkuBySelectedOptions` [model/entity/Product.cfc:L349] and
      // `getSkusBySelectedOptions` [L366] are entity receivers for the same reason; the
      // identifier-taking route to that behaviour is `getProductSkusBySelectedOptions`,
      // which this suite exercises at length.
      const entityTakingMembers: readonly string[] = [
        'getProductSkus',
        'getSortedProductSkus',
        'createSkus',
        'processImageUpload',
        'getSkuBySelectedOptions',
        'getSkusBySelectedOptions',
        'getSkuSmartList',
      ];

      for (const member of entityTakingMembers) {
        const isolated = createHarness();

        const response = await isolated.invoke(apiGatewayEvent({ query: { operation: member } }));

        expect(response.statusCode).toBe(400);
        expect(fieldPathsOf(response)).toContain('operation');
        expect(isolated.bootstrapCount()).toBe(0);
        expect(isolated.calls).toHaveLength(0);
      }
    });

    it('publishes no route to the two members that raise by design', async () => {
      // LEGACY-DEFECT [model/entity/Sku.cfc:L258]: `getPriceByPromotion` calls
      // `calculateSkuPriceBasedOnPromotion`, which does not exist, so the legacy raises every time.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Reproduced at the entity as a throwing stub. It is NOT called here, NOT caught
      // here, NOT silenced here and NOT replaced by a substituted value - and this route
      // reaches neither it nor the stocks-deletable defect above. Nothing is
      // caught-and-defaulted anywhere in this module: a raise that IS the observable legacy
      // behaviour would be reported.
      for (const member of ['getPriceByPromotion', 'getStocksDeletableFlag']) {
        const isolated = createHarness();

        const response = await isolated.invoke(apiGatewayEvent({ query: { operation: member } }));

        expect(response.statusCode).toBe(400);
        expect(isolated.calls).toHaveLength(0);
      }
    });

    it('records that no SKU-creation path exists on the read-only route', async () => {
      expect(NON_EXPOSED_SURFACE_NOTES.createSkus).toContain('Not exposed');
      expect(NON_EXPOSED_SURFACE_NOTES.createSkus).toContain('durable mutation');

      // The declared method is the shared table's, and it admits no write.
      expect(ROUTE_TABLE.skuResolution.methods).toBe('GET');

      const isolated = createHarness();
      const response = await isolated.invoke(
        apiGatewayEvent({ method: 'PUT', query: { operation: 'getTransactionExistsFlag' } }),
      );

      expect(response.statusCode).toBe(404);
      expect(isolated.calls).toHaveLength(0);
    });
  });

  // =========================================================================
  // CONCERN 6 - THE THREE WITHDRAWN OPERATIONS, AND THE TWO ADMISSION BOUNDS
  //
  // ★★★ ASSERTED FROM THE OUTSIDE, WHICH IS THE ONLY DIRECTION THAT PROVES A WITHDRAWAL.
  // Deleting a `case` arm makes an operation unreachable; it does not prove that a caller
  // asking for it gets a sensible answer, that nothing was constructed on the way to the
  // refusal, or that the reason is discoverable in the shipped artifact. Each case below
  // asserts one of those.
  // =========================================================================
  describe('the withdrawn operations and the admission bounds', () => {
    const WITHDRAWN: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
      ['getTransactionExistsFlag', {}],
      ['searchSkusByProductType', { term: 'TESTSKU' }],
      ['findSkus', { keyword: 'TESTSKU' }],
    ];

    it.each(WITHDRAWN)(
      'refuses the withdrawn operation %s as unrecognized',
      async (operation, parameters) => {
        const isolated = createHarness();

        const response = await isolated.invoke(
          apiGatewayEvent({ query: { operation, ...parameters } }),
        );

        // The SAME rejection a nonsense operation earns, with the field path `operation`. A distinct
        // "withdrawn" outcome would advertise that the action once existed and invite a caller to wait
        // for it to come back.
        expect(response.statusCode).toBe(400);
        expect(fieldPathsOf(response)).toContain('operation');
        // Nothing was constructed, and no service member was reached - the three tripwire overrides on
        // the recording service would have rejected loudly if one had been.
        expect(isolated.calls).toHaveLength(0);
        expect(isolated.scopeOpenings).toHaveLength(0);
        expect(isolated.bootstrapCount()).toBe(0);
      },
    );

    it.each(WITHDRAWN)(
      'publishes the reason %s is absent, in the shipped artifact',
      (operation) => {
        const reason = NON_EXPOSED_SURFACE_NOTES[operation];

        if (reason === undefined) {
          throw new Error(`no non-exposure note is published for ${operation}`);
        }

        // `tsconfig.build.json` sets `removeComments: false` and this constant is exported, so the
        // reason travels with the artifact rather than living only in a review comment.
        expect(reason.startsWith('WITHDRAWN (finding F')).toBe(true);
        expect(reason.length).toBeGreaterThan(80);
      },
    );

    it('★★★ proves the F18 route was unservable, against the REAL service and repository', async () => {
      // ★★★ NO DOUBLE ANSWERS HERE, AND THAT IS THE ENTIRE POINT. The suite's own scripted
      // `SkuService` was named by review as the reason finding F18 went unnoticed: it returned a
      // configured boolean, so the route looked serviceable. This case builds the REAL `SkuService`
      // over the REAL `MysqlSkuRepository` and drives the same call.
      //
      // The statement executor is a counting stand-in for the database and nothing else - the
      // assertion is that it is NEVER REACHED, because the repository refuses before it would issue a
      // statement. So this needs no connection, no schema and no credential, and it still exercises
      // the production code path end to end.
      let statementsIssued = 0;
      const refuseStatement = (): never => {
        statementsIssued += 1;

        throw new Error('a statement was issued, and this case asserts none is');
      };
      const countingExecutor: PreparedStatementExecutor = {
        execute: (): Promise<readonly SqlRow[]> => Promise.resolve(refuseStatement()),
        executeMutation: (): Promise<SqlMutationResult> => Promise.resolve(refuseStatement()),
        transaction: <T>(): Promise<T> => Promise.resolve(refuseStatement()),
      };

      // `adminAccountFlag` is REQUIRED by the audit-actor contract rather than defaulted, precisely so
      // a construction site cannot omit it; `false` is the honest value for a suite with no account.
      const realRepository = new MysqlSkuRepository(countingExecutor, { adminAccountFlag: false });
      const realService = new SkuService(
        realRepository,
        unreachableImageStore,
        unreachableSubscriptionTermProvider,
      );

      await expect(realService.getTransactionExistsFlag()).rejects.toThrow(/productID/);
      // CFML parity [model/dao/SkuDAO.cfc:L59-L63]: the legacy takes its `<cfelse>` arm and executes
      // with an UNDEFINED `arguments.productID`, so it cannot serve this call either. The refusal is
      // PARITY, not a divergence - which is why the fix was to withdraw the route rather than to
      // change the service.
      expect(statementsIssued).toBe(0);
    });

    it('★★★ ADMITS a selectedOptions list past 64 elements and forwards it byte for byte', async () => {
      // ★★★ INVERTED DEFECT-PINNING CASE. This case read 'REFUSES a selectedOptions list past the
      // 64-element HTTP ceiling' and asserted a 400, on the grounds that "every option expands the
      // downstream statement". A code review rejected the bound and the reasoning behind it:
      //
      //   * `getProductSkusBySelectedOptions` is one of the three MUST-PRESERVE behaviours (AAP
      //     0.8.1), and the legacy answers a list of ANY length - the loop at
      //     [model/dao/SkuDAO.cfc:L112] emits one `exists` clause per element with no count test
      //     anywhere - so refusing at 65 made this route answer differently from the surface it ports.
      //   * AAP 0.6.5's explicit-batch-limit requirement is written about the UNBOUNDED BULK MUTATION
      //     loops, `processProduct_updateSkus` [model/service/ProductService.cfc:L216-L233] and the
      //     cartesian-product odometer in `createSkus` [model/service/SkuService.cfc:L109-L121]. This
      //     operation is a READ that mutates nothing.
      //
      // The only bound that remains is the MySQL PROTOCOL ceiling, and it lives in the statement
      // builder that knows the placeholder count - see the assertion at the end of this case.
      const overWide = Array.from({ length: 65 }, (unused, index) => String(index)).join(',');
      const isolated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await isolated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: overWide,
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(200);
      // FORWARDED BYTE FOR BYTE: no count, no trim, no sort, no de-duplication and no truncation -
      // truncating would select a DIFFERENT SKU, which is the one outcome worse than refusing.
      expect(isolated.calls).toHaveLength(1);
      expect(isolated.calls[0]?.args).toEqual([overWide, PRODUCT_ID]);
    });

    it('admits a 64-element list too, so the former boundary value is not special', async () => {
      const atFormerBound = Array.from({ length: 64 }, (unused, index) => String(index)).join(',');
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: atFormerBound,
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(populated.calls[0]?.args).toEqual([atFormerBound, PRODUCT_ID]);
    });

    it('★★★ admits the hundreds-of-elements magnitude the review measured, unchanged', async () => {
      // ★ INVERTED DEFECT-PINNING ASSERTION. This case was 'REINSTATES the reviewed 64-element cap at
      // the HTTP boundary' and asserted a 400 for 200 elements. The list below is deliberately UNTIDY -
      // padded and repeating - because the fidelity claim is not merely that it is admitted but that
      // nothing about it is normalized on the way through: CFML `listLen` semantics, element trimming,
      // case folding and de-duplication all belong to the tiers that own them, and none of them
      // belongs to a transport adapter.
      const wide = Array.from(
        { length: 200 },
        (unused, index) => ` opt-${String(index % 7)} `,
      ).join(',');
      const populated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: wide,
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(populated.scopeOpenings).toHaveLength(1);
      expect(populated.calls[0]?.args).toEqual([wide, PRODUCT_ID]);
    });

    it('★★★ emits its diagnostic keys LEGIBLY through the REAL process logger', async () => {
      // ★★★ FINDING F7, AND IT CAN ONLY BE PROVEN THROUGH THE PRODUCTION LOGGER. The suite's
      // recording logger captures the context object as given, so it cannot see the real logger's
      // key-based redaction policy - under which `capability` and `operation` were being REDACTED,
      // leaving an operator a line with a correlation identifier and nothing else. This case drives
      // the handler through `../../../src/lib/logger.js` itself, with stdout captured, and asserts the
      // serialized line is legible.
      //
      // `route` and `resultCount` are asserted with them, because a policy change that admitted two
      // of the four and not the others would be a half-fix.
      const written: string[] = [];
      const restore = vi.spyOn(process.stdout, 'write').mockImplementation((chunk): boolean => {
        written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));

        return true;
      });

      try {
        const productionLogged = createHarness({}, undefined, productionLogger);

        await productionLogged.invoke(servableRequest(), {
          awsRequestId: INVOCATION_REQUEST_ID,
        });
      } finally {
        restore.mockRestore();
      }

      const line = written.join('');

      expect(line).toContain('sku resolution operation completed');
      expect(line).toContain('"capability":"skuResolution"');
      expect(line).toContain('"operation":"getSkuBySkuCode"');
      expect(line).toContain(
        `"route":"${ROUTE_TABLE.skuResolution.methods} ${ROUTE_TABLE.skuResolution.path}"`,
      );
      expect(line).toContain('"resultCount":0');
      // And the correlation identifier, which was the ONLY legible member before the policy change.
      expect(line).toContain(INVOCATION_REQUEST_ID);
      // Nothing was redacted on this line.
      expect(line).not.toContain('[REDACTED]');
    });
  });
});

// ===========================================================================
// CONCERN 7 - THE AUTHENTICATED BOUNDARY AND THE OPTION-LIST CEILING
//
// These controls are net-new at the HTTP boundary. The lower service and SQL
// fidelity tiers remain total; this suite proves the route rejects unidentified
// callers and unbounded query expansion before constructing either tier.
// ===========================================================================

describe('the admission gate (NET-NEW)', () => {
  it('refuses a request carrying no authorizer context', async () => {
    const populated = createHarness({ skuBySkuCode: undefined });

    const response = await populated.invoke(
      apiGatewayEvent({
        authorizer: null,
        query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
      }),
    );

    expect(response.statusCode).toBe(401);
    expect(errorBodyOf(response).category).toBe('unauthenticated');
    expect(populated.bootstrapCount()).toBe(0);
    expect(populated.scopeOpenings).toHaveLength(0);
    expect(populated.calls).toHaveLength(0);
  });

  it('refuses every context that names no usable account', async () => {
    for (const authorizer of [
      {},
      { unrelated: 'x' },
      { accountID: '' },
      { accountID: '  ' },
      { accountID: 42 },
    ]) {
      const populated = createHarness({ skuBySkuCode: undefined });

      const response = await populated.invoke(
        apiGatewayEvent({
          authorizer,
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
        }),
      );

      expect(response.statusCode).toBe(401);
      expect(populated.bootstrapCount()).toBe(0);
      expect(populated.scopeOpenings).toHaveLength(0);
      expect(populated.calls).toHaveLength(0);
    }
  });

  it('refuses before the query document is validated', async () => {
    const populated = createHarness();

    const response = await populated.invoke(
      apiGatewayEvent({ authorizer: null, query: { operation: 'nonsense' } }),
    );

    expect(response.statusCode).toBe(401);
    expect(populated.bootstrapCount()).toBe(0);
  });

  it('still resolves the route first, so a wrong path is a 404 rather than a 401', async () => {
    const response = await createHarness().invoke(
      apiGatewayEvent({ authorizer: null, path: '/catalog/products' }),
    );

    expect(response.statusCode).toBe(404);
  });

  it('publishes no claim name, internal reason or field detail in the refusal', async () => {
    const response = await createHarness().invoke(apiGatewayEvent({ authorizer: null }));

    expect(response.body).not.toContain('accountID');
    expect(response.body).not.toContain('noAuthorizerContext');
    expect(response.body).not.toContain('authoriz');
    expect(errorBodyOf(response)).not.toHaveProperty('fields');
  });

  it('emits no authentication challenge because this route declares no challenge scheme', async () => {
    const response = await createHarness().invoke(apiGatewayEvent({ authorizer: null }));

    expect(Object.keys(response.headers ?? {}).map((name) => name.toLowerCase())).toEqual([
      'content-type',
      'cache-control',
    ]);
  });

  it('serves an identified caller past the gate', async () => {
    const populated = createHarness({ skuBySkuCode: undefined });

    const response = await populated.invoke(servableRequest());

    expect(response.statusCode).toBe(200);
    expect(populated.calls).toHaveLength(1);
    expect(populated.scopeOpenings[0]?.input).toEqual({
      accountID: AUTHENTICATED_ACCOUNT_ID,
    });
  });
});

// ===========================================================================
// THE SELECTED-OPTIONS LIST: TOTAL AT THIS BOUNDARY (NET-NEW)
//
// ★★★ THIS BLOCK WAS 'the selectedOptions element ceiling' AND EVERY REFUSAL CASE IN IT IS
// INVERTED. It admitted 64 elements, refused 65, refused 500 and 1000, and asserted the
// refusal text 'must not name more than 64 options'. A code review found the ceiling itself
// to be the defect: `getProductSkusBySelectedOptions` is one of the three MUST-PRESERVE
// behaviours (AAP 0.8.1), the legacy loop at [model/dao/SkuDAO.cfc:L112] emits one `exists`
// clause per element with NO count test, and AAP 0.6.5's batch-limit clause is about
// unbounded bulk MUTATION rather than about a read.
//
// WHAT REPLACES IT IS THE SAME MAGNITUDES, ADMITTED, plus the property that actually matters
// at a transport boundary: the string the caller sent is the string the service receives.
// The protocol ceiling that DOES exist is asserted where it is true - one per element plus
// the optional `productID`, refused at `MAX_PLACEHOLDER_COUNT` because MySQL encodes the
// count in two bytes - by
// `tests/integration/repositories/skusBySelectedOptions.test.ts` and
// `tests/integration/repositories/mysqlSkuRepository.test.ts`.
// ===========================================================================

describe('the selectedOptions list is total at this boundary (NET-NEW)', () => {
  /** A comma-delimited list of `count` distinct option identifiers. */
  function optionList(count: number): string {
    return Array.from({ length: count }, (_unused, index) => `option-${String(index)}`).join(',');
  }

  it('admits a 64-element list and forwards the submitted string byte for byte', async () => {
    const populated = createHarness({ productSkusBySelectedOptions: [] });
    const submitted = optionList(64);

    const response = await populated.invoke(
      requestFor('getProductSkusBySelectedOptions', {
        selectedOptions: submitted,
        productID: PRODUCT_ID,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(populated.calls).toHaveLength(1);
    expect(populated.calls[0]?.args).toEqual([submitted, PRODUCT_ID]);
  });

  it('★★★ ADMITS a 65-element list, which the former ceiling refused', async () => {
    const populated = createHarness({ productSkusBySelectedOptions: [] });
    const submitted = optionList(65);

    const response = await populated.invoke(
      requestFor('getProductSkusBySelectedOptions', {
        selectedOptions: submitted,
        productID: PRODUCT_ID,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(populated.calls[0]?.args).toEqual([submitted, PRODUCT_ID]);
  });

  it('★★★ admits the hundreds-of-elements magnitudes the review measured', async () => {
    const populated = createHarness({ productSkusBySelectedOptions: [] });

    for (const count of [500, 1000]) {
      const submitted = optionList(count);
      const response = await populated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: submitted,
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(200);
      // Each one reaches the service with its own list intact - so the admission is not merely
      // "not a 400", it is a faithful forward.
      expect(populated.calls.at(-1)?.args).toEqual([submitted, PRODUCT_ID]);
    }

    expect(populated.calls).toHaveLength(2);
  });

  it('★★★ publishes NO element-count refusal text anywhere in a served response', async () => {
    // The old case asserted that a 70-element list produced 'must not name more than 64 options'
    // while withholding the submitted values. Both halves are inverted and kept: there is no such
    // sentence to publish, and the list is STILL not echoed - a served response reports SKUs, and
    // reflecting a caller's option list back would serve no purpose the request did not already
    // serve.
    const populated = createHarness({ productSkusBySelectedOptions: [] });
    const submitted = optionList(70);

    const response = await populated.invoke(
      requestFor('getProductSkusBySelectedOptions', {
        selectedOptions: submitted,
        productID: PRODUCT_ID,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('must not name more than');
    expect(response.body).not.toContain('option-69');
    expect(populated.calls[0]?.args).toEqual([submitted, PRODUCT_ID]);
  });

  it('counts nothing, so trailing empty positions change no outcome', async () => {
    // The old case proved that the COUNT used CFML `listLen` semantics, dropping empty positions.
    // With no count at all, the property that remains is the stronger one: the padded string is
    // forwarded exactly as sent, and the tier that parses it applies `listLen` itself
    // [model/dao/SkuDAO.cfc:L112].
    const populated = createHarness({ productSkusBySelectedOptions: [] });
    const submitted = `${optionList(64)}${',,,,,,,,,,'.repeat(4)}`;

    const response = await populated.invoke(
      requestFor('getProductSkusBySelectedOptions', {
        selectedOptions: submitted,
        productID: PRODUCT_ID,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(populated.calls[0]?.args).toEqual([submitted, PRODUCT_ID]);
  });

  it('leaves empty and untidy values total while forwarding both verbatim', async () => {
    const populated = createHarness({ productSkusBySelectedOptions: [] });
    const untidy = ' Option-2 ,option-1,OPTION-1,';

    const empty = await populated.invoke(
      requestFor('getProductSkusBySelectedOptions', {
        selectedOptions: '',
        productID: PRODUCT_ID,
      }),
    );
    const forwarded = await populated.invoke(
      requestFor('getProductSkusBySelectedOptions', {
        selectedOptions: untidy,
        productID: PRODUCT_ID,
      }),
    );

    expect(empty.statusCode).toBe(200);
    expect(populated.calls[0]?.args).toEqual(['', PRODUCT_ID]);
    expect(forwarded.statusCode).toBe(200);
    expect(populated.calls[1]?.args).toEqual([untidy, PRODUCT_ID]);
  });
});
