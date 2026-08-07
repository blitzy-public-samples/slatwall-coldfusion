// The SKU resolution Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: no legacy test file reaches the handler tier.
//
// JUDGMENT CALL: this suite asserts the surface the module ACTUALLY SHIPS rather than the wider
// surface the two ported services declare, and the difference is worth stating up front because it
// looks like an omission and is not one.
//
// JUDGMENT CALL: two techniques make that possible without a single `any`, cast-to-any or non-null
// assertion, and both are worth naming because they are load-bearing.
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
  MAXIMUM_SELECTED_OPTION_ELEMENTS,
  MAXIMUM_SELECTED_OPTION_SUBQUERIES,
  MAXIMUM_SELECTED_OPTIONS_BYTES,
  NON_EXPOSED_SURFACE_NOTES,
} from '../../../src/handlers/skuResolutionHandler.js';
// The branded decimal-string type and the by-VALUE comparison helper.
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
// JUDGMENT CALL: the entity CLASS is imported for exactly one reason - `Sku.hydrate` is the only
// public boundary that runs the four-step currency cascade [model/entity/Sku.cfc:L367-L433].
import { Sku } from '../../../src/domain/entities/sku.js';
import type { LogContext, Logger, LogLevel, LogSink } from '../../../src/lib/logger.js';
import { logger as productionLogger } from '../../../src/lib/logger.js';
import type { SkuPage, SkuQueryCriteria } from '../../../src/services/skuService.js';
import { SkuService } from '../../../src/services/skuService.js';
import { ProductService } from '../../../src/services/productService.js';
import { MysqlSkuRepository } from '../../../src/repositories/mysql/mysqlSkuRepository.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// Section 1 - the sku entity type, taken from the service surface.

/**
 * The SKU entity as the ported service tier publishes it.
 *
 * JUDGMENT CALL: derived from `SkuPage.skus` rather than named through an entity import, which is
 * the same reasoning the subject module records for its own aliases: the double is then typed to
 * what the SERVICE RETURNS.
 *
 * `NonNullable` is applied because `noUncheckedIndexedAccess` is on and an indexed access type is
 * the one place that flag can widen a definite element type.
 */
type ResolvedSku = NonNullable<SkuPage['skus'][number]>;

// Section 2 - sentinels and planted data.

/**
 * The canonical route this capability answers, from the shared table.
 */
const SKU_RESOLUTION_PATH = '/catalog/skus';

/**
 * A correlation identifier shaped like the one API Gateway supplies.
 */
const GATEWAY_REQUEST_ID = 'a1b2c3d4-0000-4444-8888-aaaabbbbcccc';

/**
 * The platform invocation identifier, used only when the gateway supplies none.
 */
const INVOCATION_REQUEST_ID = 'f0f0f0f0-1111-4444-8888-ddddeeeeffff';

/**
 * The fixed marker published when there is nothing to correlate with.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/**
 * One instant, spelled as an explicit UTC ISO-8601 literal.
 *
 * No `new Date()` and no `Date.now()` appears anywhere in this file.
 */
const REQUEST_INSTANT = '2024-05-01T00:00:00.000Z';

/**
 * The same instant as the epoch milliseconds an API Gateway event carries.
 */
const REQUEST_INSTANT_EPOCH = new Date(REQUEST_INSTANT).getTime();

/**
 * Identifiers for the option-based resolution cases.
 */
const PRODUCT_ID = 'catalog-product-0001';
const OPTION_ID_SMALL = 'option-size-small';
const OPTION_ID_RED = 'option-colour-red';

/**
 * An identifier of the width the source column declares: `optionID` is
 * `ormtype="string" length="32"` [model/entity/Option.cfc:L52].
 *
 * Lists at the byte bound are built out of WELL-FORMED elements of this width rather than filler.
 */
const WELL_FORMED_OPTION_ID = 'abcdef0123456789abcdef0123456789';

/**
 * Build a `selectedOptions` list of exactly `byteCount` UTF-8 bytes.
 *
 * Well-formed 32-character identifiers joined by single commas, with the final element truncated
 * so the result lands precisely on the requested count.
 *
 * @param byteCount the exact byte length wanted.
 * @returns the list.
 */
function selectedOptionsOfBytes(byteCount: number): string {
  let list = '';

  while (list.length < byteCount) {
    list += list.length === 0 ? WELL_FORMED_OPTION_ID : `,${WELL_FORMED_OPTION_ID}`;
  }

  return list.slice(0, byteCount);
}

/**
 * Build the DENSEST list a byte bound can admit: single-character elements, single commas.
 *
 * `listToArray` ignores empty elements [`splitOnDelimiters` in `../../../src/lib/cfml/list.js`],
 * so `n` elements cannot occupy fewer than `2n - 1` characters.
 *
 * @param elementCount how many elements.
 * @returns the list.
 */
function densestSelectedOptions(elementCount: number): string {
  return Array.from({ length: elementCount }, (): string => 'x').join(',');
}

/**
 * A SKU code used wherever a case needs a request the module WILL serve but is not about what the
 * request asks for - routing, correlation, scope discipline, logging.
 */
const SERVABLE_SKU_CODE = 'TESTSKU-SERVABLE-0001';

/**
 * A planted value used to prove a failure's detail never reaches a response body.
 */
const PLANTED_INTERNAL_DETAIL = 'PLANTED-INTERNAL-DETAIL-7d41ac93b6e2';

/**
 * A statement fragment shaped like the one the pinned MySQL driver embeds in its own error
 * messages, together with a bound value. Planted for the same reason.
 */
const PLANTED_STATEMENT = "select skuID from SwSku where skuCode = 'TESTSKUXXX'";

// Section 3 - the unreachable helper.

/**
 * A collaborator member this route is not entitled to reach.
 *
 * Returns a zero-parameter function whose return type is `never`, which is assignable to any
 * function type - fewer parameters are always acceptable and `never` is assignable to every return
 * type.
 *
 * @param member the member being stood in for, named for the failure message.
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

// Section 4 - the collaborator ports the two services are constructed with.
//
// Enumerated member by member, every one of them unreachable.
//
// Not one of these is a database, a pool, a statement executor or a recorder of either.

/**
 * The positional collaborator types `SkuService` declares.
 */
type SkuServiceCollaborators = ConstructorParameters<typeof SkuService>;

/**
 * The positional collaborator types `ProductService` declares.
 */
type ProductServiceCollaborators = ConstructorParameters<typeof ProductService>;

/**
 * `SkuRepository`, all seven members unreachable.
 *
 * Seven, not eight: `getSkuStocksDeletableFlag` is deliberately absent from the port.
 *
 * LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag` delegates at
 * [model/service/SkuService.cfc:L282] to a SkuDAO member that does not exist, so the legacy raises
 * on every call.
 * Preserved deliberately; do not fix without a product decision.
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

/**
 * The image store, a STUB port in the target and unreachable from this route.
 */
const unreachableImageStore: SkuServiceCollaborators[1] = {
  saveImageFile: unreachable('ImageStore.saveImageFile'),
  deleteImageFile: unreachable('ImageStore.deleteImageFile'),
  generateSkuImageFileName: unreachable('ImageStore.generateSkuImageFileName'),
};

/**
 * The subscription term provider, likewise a stub port and likewise unreachable.
 */
const unreachableSubscriptionTermProvider: SkuServiceCollaborators[2] = {
  getSubscriptionTerm: unreachable('SubscriptionTermProvider.getSubscriptionTerm'),
  getSubscriptionBenefit: unreachable('SubscriptionTermProvider.getSubscriptionBenefit'),
};

/**
 * `ProductRepository`, all six members unreachable.
 */
const unreachableProductRepository: ProductServiceCollaborators[0] = {
  getAttributeSets: unreachable('ProductRepository.getAttributeSets'),
  loadDataFromFile: unreachable('ProductRepository.loadDataFromFile'),
  searchProductsByProductType: unreachable('ProductRepository.searchProductsByProductType'),
  getProductByProductID: unreachable('ProductRepository.getProductByProductID'),
  saveProduct: unreachable('ProductRepository.saveProduct'),
  deleteProduct: unreachable('ProductRepository.deleteProduct'),
};

/**
 * `ProductTypeRepository`, all four members unreachable.
 */
const unreachableProductTypeRepository: ProductServiceCollaborators[2] = {
  getProductTypeQuery: unreachable('ProductTypeRepository.getProductTypeQuery'),
  getProductTypeByProductTypeID: unreachable('ProductTypeRepository.getProductTypeByProductTypeID'),
  getProductTypesByProductTypeIDPath: unreachable(
    'ProductTypeRepository.getProductTypesByProductTypeIDPath',
  ),
  saveProductType: unreachable('ProductTypeRepository.saveProductType'),
};

/**
 * The URL-title generator that replaced the legacy `dataService` dependency.
 */
const unreachableUrlTitleGenerator: ProductServiceCollaborators[3] = {
  createUniqueURLTitle: unreachable('UrlTitleGenerator.createUniqueURLTitle'),
};

/**
 * The SKU-creation collaborator.
 *
 * Unreachable for three independent reasons, each sufficient and each recorded by the subject
 * module: `createSkus` takes a hydrated `Product` this tier cannot obtain.
 */
const unreachableSkuCreation: ProductServiceCollaborators[6] = {
  createSkus: unreachable('SkuCreationCollaborator.createSkus'),
};

/**
 * The option-loading collaborator, all three members unreachable.
 */
const unreachableOptionLoading: ProductServiceCollaborators[7] = {
  getOptionsForSelect: unreachable('OptionLoadingCollaborator.getOptionsForSelect'),
  getOptionGroup: unreachable('OptionLoadingCollaborator.getOptionGroup'),
  getOption: unreachable('OptionLoadingCollaborator.getOption'),
};

/**
 * The ninth `ProductService` collaborator, refused like the rest.
 *
 * It commits a repriced SKU set as one unit of work and this route reprices nothing, so
 * reaching it would mean the SKU-resolution handler had grown a write path it must not have.
 */
const unreachableSkuBatchWrite: ProductServiceCollaborators[8] = {
  saveMutatedSkus: unreachable('SkuBatchWriteCollaborator.saveMutatedSkus'),
};

// Section 5 - the recorded call log and the scripted answers.

/**
 * One service call the handler made, as the service received it.
 *
 * `args` is the ARGUMENT LIST, positionally, which is what makes parameter ORDER assertable rather
 * than merely parameter presence.
 */
interface RecordedCall {
  /**
   * `<Service>.<member>`, so one log can carry calls from both services.
   */
  readonly member: string;

  /**
   * Exactly what was passed, in order, with nothing normalised.
   */
  readonly args: readonly unknown[];
}

/**
 * How a scripted service member fails, when a case asks it to.
 */
type ScriptedFailure =
  | { readonly kind: 'throw'; readonly thrown: unknown }
  | { readonly kind: 'reject'; readonly reason: Error };

/**
 * What the scripted services answer, per operation.
 *
 * Every member is optional; a case sets only what it exercises.
 */
interface ServiceScript {
  /**
   * The answer to `ProductService.getProductSkusBySelectedOptions`.
   */
  readonly productSkusBySelectedOptions?: readonly ResolvedSku[] | undefined;

  /**
   * The answer to `SkuService.getSkuBySkuCode`; absent means a MISS.
   */
  readonly skuBySkuCode?: ResolvedSku | undefined;

  /**
   * When present, the scripted member fails instead of answering.
   */
  readonly failure?: ScriptedFailure | undefined;
}

/**
 * Record a call and either fail as scripted or answer.
 *
 * Shared by both recording services so the failure semantics cannot diverge between them.
 *
 * @param calls the shared log.
 * @param member the member being invoked.
 * @param args the arguments it received, in order.
 * @param failure the scripted failure, when the case asked for one.
 * @returns nothing ; it either returns normally or raises.
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
 * @param member the member being invoked.
 * @param value the scripted answer, when the case supplied one.
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

// Section 6 - the two services the route actually calls.
//
// Real subclasses rather than object literals, because `SkuService` and `ProductService` hold
// `private readonly` fields and are therefore not satisfiable structurally.

/**
 * `ProductService`, with the one member this route reaches recorded.
 */
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
   * The must-preserve entry point.
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

/**
 * `SkuService`, with the one member this route reaches recorded and three tripwires.
 */
class RecordingSkuService extends SkuService {
  public constructor(
    private readonly script: ServiceScript,
    private readonly calls: RecordedCall[],
  ) {
    super(unreachableSkuRepository, unreachableImageStore, unreachableSubscriptionTermProvider);
  }

  /**
   * A miss answers `undefined` and nothing else - not `0`, not `null`, not an empty object and not
   * a sku with zeroed prices.
   */
  public override getSkuBySkuCode(skuCode?: string): Promise<ResolvedSku | undefined> {
    recordAndMaybeFail(this.calls, 'SkuService.getSkuBySkuCode', [skuCode], this.script.failure);

    if (this.script.failure?.kind === 'reject') {
      return Promise.reject(this.script.failure.reason);
    }

    return Promise.resolve(this.script.skuBySkuCode);
  }

  // The three withdrawn members are tripwires now, not scripted answers.
  //
  // The overrides are kept rather than deleted, and inverted: reaching one now FAILS.
  public override searchSkusByProductType(
    term?: string,
    productTypeID?: string,
  ): Promise<ResolvedSku[]> {
    this.calls.push({ member: 'SkuService.searchSkusByProductType', args: [term, productTypeID] });

    return Promise.reject(
      new Error(
        'SkuService.searchSkusByProductType was invoked. It is WITHDRAWN from the routed surface ' +
          'because it returns a complete, unpaged collection that no member of its signature can ' +
          'bound. Reaching it means the action was reintroduced.',
      ),
    );
  }
  public override getTransactionExistsFlag(): Promise<boolean> {
    this.calls.push({ member: 'SkuService.getTransactionExistsFlag', args: [] });

    return Promise.reject(
      new Error(
        'SkuService.getTransactionExistsFlag was invoked. It is WITHDRAWN from the routed surface ' +
          'because the real service forwards NO arguments and ' +
          'MysqlSkuRepository.getTransactionExistsFlag then raises SkuColumnError - correct parity ' +
          'with [model/dao/SkuDAO.cfc:L59-L63], which executes with an UNDEFINED arguments.productID. ' +
          'Answering here from a script would hide that.',
      ),
    );
  }
  public override findSkus(criteria: SkuQueryCriteria): Promise<SkuPage> {
    this.calls.push({ member: 'SkuService.findSkus', args: [criteria] });

    return Promise.reject(
      new Error(
        'SkuService.findSkus was invoked. It is WITHDRAWN from the routed surface because ' +
          'SkuQueryCriteria declares no paging members, so a routed contract has nothing to bound. ' +
          'Reaching it means the action was reintroduced.',
      ),
    );
  }
}

// Section 7 - the request scope and the composition root.
//
// The declared return type of each getter is taken by indexed access from the interface itself, so
// the double is type-correct without importing - or constructing.

/**
 * One opening of a request scope, with the input the handler supplied.
 */
interface ScopeOpening {
  /**
   * What the handler passed. The subject passes nothing, which is the assertion.
   */
  readonly input: RequestScopeInput | undefined;
}

/**
 * Everything one case needs to drive the subject and then interrogate it.
 */
interface Harness {
  /**
   * The subject: a handler wired to this harness and to nothing else.
   */
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: { readonly awsRequestId: string },
  ) => Promise<APIGatewayProxyResult>;

  /**
   * Every service call the handler made, in order.
   */
  readonly calls: readonly RecordedCall[];

  /**
   * Every request scope the handler opened, in order.
   */
  readonly scopeOpenings: readonly ScopeOpening[];

  /**
   * How many times the handler asked for the composed graph.
   */
  readonly bootstrapCount: () => number;

  /**
   * Every line the handler or the error mapper emitted.
   */
  readonly emissions: readonly CapturedEmission[];
}

/**
 * One captured emission, in the form the subject handed to the logger.
 */
interface CapturedEmission {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext | undefined;

  /**
   * The serialized form, so a leak anywhere in the payload is detectable.
   */
  readonly serialized: string;
}

/**
 * A logger that records rather than emits.
 *
 * Hand-written, holding nothing but its own array, and built fresh inside every case.
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
      // `undefined` members vanish under serialization exactly as they do in the real logger, so
      // the recorded string is what would have been emitted.
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
 * One request's scope, carrying the two services the route reaches and nothing else that can be
 * read without failing.
 *
 * @param script what the scripted services answer.
 * @param calls the shared call log.
 * @returns a scope satisfying the published interface.
 */
function createScopeDouble(script: ServiceScript, calls: RecordedCall[]): RequestScope {
  return {
    // An explicit UTC instant, threaded rather than read from the wall clock.
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

    get priceGroupEntitlements(): RequestScope['priceGroupEntitlements'] {
      throw new Error(
        'RequestScope.priceGroupEntitlements was read. This route resolves SKUs, not prices, so it ' +
          'names no price group and has no entitlement to decide.',
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
    // entrypoint that accepts an order.
    materializeOrderView: unreachable('RequestScope.materializeOrderView'),

    updateOrderAmountsWithPriceGroupsThenPromotions: unreachable(
      'RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions',
    ),

    prepareAddressZoneEvaluation: unreachable('RequestScope.prepareAddressZoneEvaluation'),
  };
}

/**
 * Assemble a harness: a subject wired to fresh doubles, and the recorders to interrogate
 * afterwards.
 *
 * @param script what the scripted services answer.
 * @param rootFailure a scripted failure of the composed graph itself, when a case exercises one:
 * `bootstrap` rejects for `'bootstrap'`, and `createRequestScope` rejects for `'scope'`.
 * @param loggerOverride a logger to use INSTEAD of the recording one.
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

// Section 8 - the request.

/**
 * What a case varies about a request. Everything else is fixed and inert.
 */
interface EventOptions {
  /**
   * Defaults to the method the shared route table declares for this capability.
   */
  readonly method?: string;

  /**
   * Defaults to the canonical path the shared route table declares.
   */
  readonly path?: string;

  /**
   * The single-valued query parameters. `null` reproduces what API Gateway supplies when a request
   * carries no query string at all, which is a DIFFERENT input from an empty object and is
   * exercised as such.
   */
  readonly query?: Readonly<Record<string, string | undefined>> | null;

  /**
   * The gateway's correlation identifier. `''` reproduces the gateway supplying none.
   */
  readonly requestId?: string;

  /**
   * The repeated-parameter map, which the subject documents that it IGNORES.
   */
  readonly multiValueQuery?: Readonly<Record<string, string[] | undefined>> | null;

  /**
   * Omitted means the ordinary authenticated caller; `null` means anonymous.
   */
  readonly authorizer?: Readonly<Record<string, unknown>> | null;
}

/**
 * The opaque account identifier the default authorizer context establishes.
 */
const AUTHENTICATED_ACCOUNT_ID = 'account-sku-resolution-0001';

/**
 * Build an API Gateway proxy event.
 *
 * @param options what this case varies.
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
 * @param operation the operation, under its verbatim legacy CFML name.
 * @param parameters that operation's arguments.
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
 * member, and it answers 200 with the `sku` member omitted.
 */
function servableRequest(): APIGatewayProxyEvent {
  return requestFor('getSkuBySkuCode', { skuCode: SERVABLE_SKU_CODE });
}

// Section 9 - reading the response.
//
// The error mapper publishes `ErrorResponseBody` and `SuccessResponseBody`, and the subject
// publishes `SkuResolutionResultDocument` for the payload inside the latter.

/**
 * The shared success envelope, with this capability's payload inside it.
 */
type ServedEnvelope = SuccessResponseBody<SkuResolutionResultDocument>;

/**
 * Parse a success document.
 */
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
 * @param response the response.
 * @param operation the arm expected, by its discriminant.
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

/**
 * Parse a failure document, narrowing rather than casting blindly.
 */
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

/**
 * The field paths a rejection published, in order.
 */
function fieldPathsOf(response: APIGatewayProxyResult): readonly string[] {
  const { fields } = errorBodyOf(response);

  return fields === undefined ? [] : fields.map((field) => field.path);
}

/**
 * Read the single emission a call is documented to produce.
 */
function soleEmission(emissions: readonly CapturedEmission[]): CapturedEmission {
  expect(emissions).toHaveLength(1);

  const [emission] = emissions;

  if (emission === undefined) {
    throw new Error('nothing was emitted');
  }

  return emission;
}

/**
 * Assert two monetary strings are equal by VALUE rather than by string identity.
 *
 * JUDGMENT CALL: `'19.990'` and `'19.99'` are the same amount and different strings, so a `toBe`
 * against a rendered price would pin a presentation detail this module has no authority over.
 *
 * @param actual the rendered value from the response document.
 * @param expected the expected amount, as a decimal string.
 */
function expectSameAmount(actual: string | undefined, expected: DecimalString | string): void {
  if (actual === undefined) {
    throw new Error(`expected the amount ${expected} but the document carried no value`);
  }

  expect(cfNumericEquals(actual, expected)).toBe(true);
}

describe('the SKU resolution Lambda entry point', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    // `tests/setup.ts` already registers a global `afterEach` restoring mocks and real timers.
    vi.restoreAllMocks();
  });
  describe('the published module surface', () => {
    it('exports a Lambda entry point that is constructed without any initialisation', () => {
      // The production symbol is `handler`, built at module load by calling the factory with no
      // arguments.
      expect(typeof handler).toBe('function');
    });

    it('exposes the dependency seam so a suite can drive it without the real composition root', () => {
      const substituted = createSkuResolutionHandler({ logger: createRecordingLogger().logger });

      expect(typeof substituted).toBe('function');

      // Overrides are shallow-merged over the defaults, so substituting one collaborator leaves
      // the other at its production value.
      expect(typeof createSkuResolutionHandler()).toBe('function');
    });

    it('answers the one route the shared table declares for this capability', () => {
      // The route table is CONSUMED, not extended.
      expect(ROUTE_TABLE.skuResolution.capability).toBe('skuResolution');
      expect(ROUTE_TABLE.skuResolution.action).toBe('resolveSkus');
      expect(ROUTE_TABLE.skuResolution.path).toBe(SKU_RESOLUTION_PATH);
      expect(ROUTE_TABLE.skuResolution.methods).toBe('GET');
    });
  });

  // Concern 1 - routing and request validation.
  describe('routing and request validation', () => {
    it('resolves a request on its own canonical route', async () => {
      const response = await createHarness().invoke(servableRequest());

      expect(response.statusCode).toBe(200);
    });

    it('matches the path case-insensitively, as the legacy eq comparison does', async () => {
      // CFML parity [Application.cfc:L133]: subsystem membership is `listFindNoCase` over a
      // comma-delimited literal and path comparison is `eq`, both case-insensitive. The casing in
      // the route table is therefore a readability choice, not a contract.
      const response = await createHarness().invoke(
        apiGatewayEvent({
          path: '/CATALOG/SKUS',
          query: { operation: 'getSkuBySkuCode', skuCode: SERVABLE_SKU_CODE },
        }),
      );

      expect(response.statusCode).toBe(200);
    });

    it('reports a path belonging to another capability as an unmatched route', async () => {
      // Folded into the same outcome as a path that matches nothing, deliberately: a distinct
      // outcome here would leak the existence of the other four capabilities.
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

      // The route diagnostic goes to the LOG STREAM, under the caller's correlation identifier,
      // which is where an operator can act on it.
      const emission = soleEmission(harness.emissions);

      expect(emission.level).toBe('warn');
      expect(emission.context?.route).toBe('GET /catalog/skus-not-a-route');
    });

    it('rejects a request that names no operation', async () => {
      // `queryStringParameters` is `null` rather than `{}` when a request carries no query string
      // at all, which is what API Gateway actually supplies.
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
      // CFML parity [model/dao/SkuDAO.cfc:L107]: productID is OPTIONAL at the DAO but REQUIRED at
      // the service [model/service/ProductService.cfc:L104], and the service signature is the
      // contract this route publishes.
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
      // CFML `required string x` rejects a missing argument and accepts an empty one.
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
    describe('the selectedOptions admission bound', () => {
      it('admits a list of EXACTLY the published byte bound and forwards it byte-for-byte', async () => {
        const atBound = selectedOptionsOfBytes(MAXIMUM_SELECTED_OPTIONS_BYTES);
        const populated = createHarness({ productSkusBySelectedOptions: [] });

        // The fixture is asserted before the subject is, so a builder that drifted could not make
        // this case pass by testing a shorter list than it claims.
        expect(Buffer.byteLength(atBound, 'utf8')).toBe(MAXIMUM_SELECTED_OPTIONS_BYTES);

        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: atBound,
            productID: PRODUCT_ID,
          }),
        );

        expect(response.statusCode).toBe(200);

        // \u2605\u2605 the bound refuses or admits; it never rewrites.
        expect(populated.calls).toHaveLength(1);
        expect(populated.calls[0]?.args).toEqual([atBound, PRODUCT_ID]);
      });

      it('admits 248 well-formed option identifiers, which is what the bound costs a real caller', async () => {
        // The figure the schema publishes as its justification, asserted rather than asserted in
        // prose: `optionID` is 32 characters [model/entity/Option.cfc:L52].
        const identifiers = Array.from({ length: 248 }, (): string => WELL_FORMED_OPTION_ID).join(
          ',',
        );
        const populated = createHarness({ productSkusBySelectedOptions: [] });

        expect(Buffer.byteLength(identifiers, 'utf8')).toBeLessThanOrEqual(
          MAXIMUM_SELECTED_OPTIONS_BYTES,
        );

        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: identifiers,
            productID: PRODUCT_ID,
          }),
        );

        expect(response.statusCode).toBe(200);
        expect(populated.calls[0]?.args).toEqual([identifiers, PRODUCT_ID]);
      });

      it('refuses ONE byte past the bound and names the field the caller can correct', async () => {
        const overBound = selectedOptionsOfBytes(MAXIMUM_SELECTED_OPTIONS_BYTES + 1);
        const populated = createHarness({ productSkusBySelectedOptions: [] });

        expect(Buffer.byteLength(overBound, 'utf8')).toBe(MAXIMUM_SELECTED_OPTIONS_BYTES + 1);

        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: overBound,
            productID: PRODUCT_ID,
          }),
        );

        expect(response.statusCode).toBe(400);
        expect(errorBodyOf(response).category).toBe('invalidRequest');
        expect(fieldPathsOf(response)).toContain('selectedOptions');

        // A refusal, not a truncation: the service is never reached with a shortened list, which
        // would answer a DIFFERENT question from the one the caller asked.
        expect(populated.calls).toHaveLength(0);
      });

      it('withholds the submitted list from the refusal body and from the log line alike', async () => {
        const overBound = selectedOptionsOfBytes(MAXIMUM_SELECTED_OPTIONS_BYTES + 1);
        const marker = overBound.slice(0, WELL_FORMED_OPTION_ID.length);
        const populated = createHarness();

        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: overBound,
            productID: PRODUCT_ID,
          }),
        );

        // The mapper publishes field paths and constraint descriptions and never the submitted
        // values, and a bound whose refusal echoed a 4-kibibyte list back would hand a caller an
        // amplifier instead of taking one away.
        expect(response.statusCode).toBe(400);
        expect(response.body).not.toContain(marker);

        for (const emission of populated.emissions) {
          expect(emission.serialized).not.toContain(marker);
        }
      });

      it('counts UTF-8 BYTES rather than code units', async () => {
        // \u2605\u2605 the assertion that distinguishes the implementation from
        // `z.string().max()`.
        const multiByte = '\u00e9'.repeat(MAXIMUM_SELECTED_OPTION_ELEMENTS + 1);
        const populated = createHarness();

        expect(multiByte.length).toBeLessThan(MAXIMUM_SELECTED_OPTIONS_BYTES);
        expect(Buffer.byteLength(multiByte, 'utf8')).toBeGreaterThan(
          MAXIMUM_SELECTED_OPTIONS_BYTES,
        );

        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: multiByte,
            productID: PRODUCT_ID,
          }),
        );

        expect(response.statusCode).toBe(400);
        expect(fieldPathsOf(response)).toContain('selectedOptions');
      });

      // Synchronous on purpose: this case asserts the relationship between two published constants
      // and invokes nothing, so there is nothing to await.
      it('publishes an element figure DERIVED from the byte bound, not declared beside it', () => {
        // The byte bound is defended in its own right and the element figure is computed from it.
        // Asserted as arithmetic so a future change to either cannot leave the two disagreeing
        // while every other case still passes.
        expect(MAXIMUM_SELECTED_OPTIONS_BYTES).toBe(8 * 1024);
        expect(MAXIMUM_SELECTED_OPTION_ELEMENTS).toBe(
          Math.floor((MAXIMUM_SELECTED_OPTIONS_BYTES + 1) / 2),
        );
        expect(MAXIMUM_SELECTED_OPTION_ELEMENTS).toBe(4096);
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES).toBeLessThan(MAXIMUM_SELECTED_OPTION_ELEMENTS);
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES * 4).toBe(MAXIMUM_SELECTED_OPTION_ELEMENTS);
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES * 64).toBe(65_536);
      });

      it('\u2605\u2605\u2605 counts BYTES and not ELEMENTS, which is why no count policy was reinstated', async () => {
        const thousandCheap = densestSelectedOptions(1_000);
        const thousandWellFormed = Array.from(
          { length: 1_000 },
          (): string => WELL_FORMED_OPTION_ID,
        ).join(',');

        const served = createHarness({ productSkusBySelectedOptions: [] });
        const servedResponse = await served.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: thousandCheap,
            productID: PRODUCT_ID,
          }),
        );

        expect(servedResponse.statusCode).toBe(200);
        expect(served.calls[0]?.args).toEqual([thousandCheap, PRODUCT_ID]);

        const refused = createHarness({ productSkusBySelectedOptions: [] });
        const refusedResponse = await refused.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: thousandWellFormed,
            productID: PRODUCT_ID,
          }),
        );

        expect(refusedResponse.statusCode).toBe(400);
        expect(fieldPathsOf(refusedResponse)).toContain('selectedOptions');

        // And the refusal says nothing about a NUMBER of options, because no element-count ceiling
        // exists to report.
        expect(refusedResponse.body).not.toContain('must not name more than');
        expect(refusedResponse.body).not.toContain('option');
      });

      it('admits the densest list the bound allows and refuses one element more', async () => {
        // \u2605 the derived figure is tight in both directions, which is the only way to show it
        // was derived correctly.
        const densest = densestSelectedOptions(MAXIMUM_SELECTED_OPTION_ELEMENTS);
        const oneMore = densestSelectedOptions(MAXIMUM_SELECTED_OPTION_ELEMENTS + 1);

        expect(Buffer.byteLength(densest, 'utf8')).toBeLessThanOrEqual(
          MAXIMUM_SELECTED_OPTIONS_BYTES,
        );
        expect(Buffer.byteLength(oneMore, 'utf8')).toBeGreaterThan(MAXIMUM_SELECTED_OPTIONS_BYTES);
        for (const overWorkBound of [densest, oneMore]) {
          const refused = createHarness({ productSkusBySelectedOptions: [] });
          const refusedResponse = await refused.invoke(
            requestFor('getProductSkusBySelectedOptions', {
              selectedOptions: overWorkBound,
              productID: PRODUCT_ID,
            }),
          );

          expect(refusedResponse.statusCode).toBe(400);
          expect(fieldPathsOf(refusedResponse)).toContain('selectedOptions');
          // Nothing reached the service, so the statement was never built and no subquery was ever
          // commissioned - the refusal is what makes the bound worth having.
          expect(refused.calls).toHaveLength(0);
        }
      });

      it('★★★ admits EXACTLY the work bound and refuses one element more', async () => {
        // The regression case for the work bound, pinned in both directions so the number is
        // reachable and not exceedable.
        const atBound = densestSelectedOptions(MAXIMUM_SELECTED_OPTION_SUBQUERIES);
        const overBound = densestSelectedOptions(MAXIMUM_SELECTED_OPTION_SUBQUERIES + 1);

        // Both are comfortably inside the byte bound, which is what makes this case about WORK
        // rather than about length: if the byte bound were doing the refusing, neither would reach
        // the count.
        expect(Buffer.byteLength(atBound, 'utf8')).toBeLessThan(MAXIMUM_SELECTED_OPTIONS_BYTES);
        expect(Buffer.byteLength(overBound, 'utf8')).toBeLessThan(MAXIMUM_SELECTED_OPTIONS_BYTES);

        const admitted = createHarness({ productSkusBySelectedOptions: [] });
        const admittedResponse = await admitted.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: atBound,
            productID: PRODUCT_ID,
          }),
        );

        // Served, and served VERBATIM: the bound refuses or it forwards, and it never trims,
        // thins, re-orders or de-duplicates what it forwards.
        expect(admittedResponse.statusCode).toBe(200);
        expect(admitted.calls[0]?.args).toEqual([atBound, PRODUCT_ID]);

        const refused = createHarness({ productSkusBySelectedOptions: [] });
        const refusedResponse = await refused.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: overBound,
            productID: PRODUCT_ID,
          }),
        );

        expect(refusedResponse.statusCode).toBe(400);
        expect(fieldPathsOf(refusedResponse)).toContain('selectedOptions');
        expect(refused.calls).toHaveLength(0);

        // The earlier element ceiling published 'must not name more than 64 options'; this bound
        // makes no claim about a number of options at all, and a caller's list is never echoed.
        expect(refusedResponse.body).not.toContain('must not name more than');
        expect(refusedResponse.body).not.toContain('option');
        expect(refusedResponse.body).not.toContain(overBound);
      });

      it('★★ counts elements the way the STATEMENT counts them, so empty positions cost nothing', async () => {
        // The unit is the statement's.
        const padded = `${densestSelectedOptions(MAXIMUM_SELECTED_OPTION_SUBQUERIES)}${','.repeat(
          200,
        )}`;

        const populated = createHarness({ productSkusBySelectedOptions: [] });
        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: padded,
            productID: PRODUCT_ID,
          }),
        );

        expect(response.statusCode).toBe(200);
        // Forwarded with its padding intact: the tier that parses the list applies `listLen`
        // itself.
        expect(populated.calls[0]?.args).toEqual([padded, PRODUCT_ID]);
      });

      it('★★★ keeps the work bound clear of every selection the CATALOG can express', async () => {
        // Arithmetic rather than argued in prose.
        const wellFormedCapacity = Math.floor(
          (MAXIMUM_SELECTED_OPTIONS_BYTES + 1) / (WELL_FORMED_OPTION_ID.length + 1),
        );

        expect(wellFormedCapacity).toBe(248);
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES).toBeGreaterThan(wellFormedCapacity * 4);

        // And it is a real reduction in the work a caller may commission, stated against the two
        // figures it sits between rather than as a bare constant.
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES).toBe(1_024);
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES * 4).toBe(MAXIMUM_SELECTED_OPTION_ELEMENTS);
        expect(MAXIMUM_SELECTED_OPTION_SUBQUERIES * 64).toBe(65_536);

        // Hundreds of elements are still served, which is the same claim from the serving side:
        // this list is far wider than a 64-element list and well inside the work bound.
        const wellFormedList = Array.from(
          { length: wellFormedCapacity },
          (): string => WELL_FORMED_OPTION_ID,
        ).join(',');
        const populated = createHarness({ productSkusBySelectedOptions: [] });
        const response = await populated.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: wellFormedList,
            productID: PRODUCT_ID,
          }),
        );

        expect(response.statusCode).toBe(200);
        expect(populated.calls[0]?.args).toEqual([wellFormedList, PRODUCT_ID]);
      });

      it('bounds ONLY the parameter that multiplies statement work, and leaves the rest alone', async () => {
        // \u2605\u2605 the scope of the fix, asserted from the other direction.
        const longCode = `${SERVABLE_SKU_CODE}-${'C'.repeat(MAXIMUM_SELECTED_OPTIONS_BYTES)}`;
        const populated = createHarness();

        const response = await populated.invoke(
          requestFor('getSkuBySkuCode', { skuCode: longCode }),
        );

        expect(response.statusCode).toBe(200);
        expect(populated.calls[0]?.args).toEqual([longCode]);

        // The same for `productID`, on the operation that does carry the bounded parameter: a long
        // product identifier is forwarded, because it costs the statement nothing.
        const longProductID = 'P'.repeat(MAXIMUM_SELECTED_OPTIONS_BYTES);
        const productCase = createHarness({ productSkusBySelectedOptions: [] });

        const productResponse = await productCase.invoke(
          requestFor('getProductSkusBySelectedOptions', {
            selectedOptions: OPTION_ID_SMALL,
            productID: longProductID,
          }),
        );

        expect(productResponse.statusCode).toBe(200);
        expect(productCase.calls[0]?.args).toEqual([OPTION_ID_SMALL, longProductID]);
      });
    });

    it('\u2605\u2605\u2605 FORWARDS an absent skuCode as absence, because the mapped surface declares it optional', async () => {
      // NOBODY REPEATS it. Its original form asserted exactly what it asserts again now, under the
      // reasoning: "`SkuService.getSkuBySkuCode(skuCode?)` is the authoritative contract.
      //
      // So absence is forwarded as absence, and the service receives exactly what an in-process
      // caller would give it.
      const missingSkuCode = createHarness();
      const response = await missingSkuCode.invoke(requestFor('getSkuBySkuCode'));

      expect(response.statusCode).toBe(200);
      expect(missingSkuCode.calls).toHaveLength(1);
      expect(missingSkuCode.calls[0]?.args).toEqual([undefined]);
    });

    it('\u2605\u2605 still ADMITS an EMPTY skuCode, because the legacy binds it and matches nothing', async () => {
      // The distinction the schema draws is PRESENT-BUT-EMPTY versus ABSENT, which is exactly the
      // distinction the legacy signature draws: `string skuCode` with no `required` attribute
      // admits `''` and binds it.
      const empty = createHarness();
      const response = await empty.invoke(requestFor('getSkuBySkuCode', { skuCode: '' }));

      expect(response.statusCode).toBe(200);
      expect(empty.calls).toHaveLength(1);
      expect(empty.calls[0]?.args).toEqual(['']);
    });

    it('★★★ REFUSES an unrecognised query parameter instead of silently dropping it', async () => {
      const response = await createHarness().invoke(
        requestFor('getSkuBySkuCode', {
          skuCode: SERVABLE_SKU_CODE,
          // A unique planted value. It is deliberately not a word that appears in the mapper's own
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

      // \u2605 the status is unchanged and the field path is the closed-set one again, because
      // `skuCode` is optional once more (the reshaping that briefly made it required was reversed
      // see the forwarding case above).
      expect(response.statusCode).toBe(400);
      expect(fieldPathsOf(response)).toContain('queryStringParameters');
      expect(response.body).not.toContain('skucode');
    });

    it('★★★ REFUSES a repeated query parameter rather than resolving it silently', async () => {
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
      // Validation is total and runs before anything is awaited, so a request the module has
      // already established it cannot serve does no work in the database tier.
      const rejections: readonly APIGatewayProxyEvent[] = [
        apiGatewayEvent({ path: '/catalog/products' }),
        apiGatewayEvent({ method: 'POST' }),
        apiGatewayEvent({ query: null }),
        apiGatewayEvent({ query: { operation: '' } }),
        apiGatewayEvent({ query: { operation: 'getSkuStocksDeletableFlag' } }),
        requestFor('getProductSkusBySelectedOptions', { selectedOptions: OPTION_ID_RED }),
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: selectedOptionsOfBytes(MAXIMUM_SELECTED_OPTIONS_BYTES + 1),
          productID: PRODUCT_ID,
        }),
        apiGatewayEvent({ query: { operation: 'searchSkusByProductType', term: 'TESTSKU' } }),
        apiGatewayEvent({ query: { operation: 'findSkus', keyword: 'TESTSKU' } }),
        apiGatewayEvent({ query: { operation: 'getTransactionExistsFlag' } }),
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

  // Concern 2 - delegation to the ported service surface.
  describe('delegation to the ported service surface', () => {
    it('forwards selectedOptions FIRST and productID SECOND, in declaration order', async () => {
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
      // Any normalisation here changes which skus match.
      //
      // The value below is deliberately hostile on all four axes at once: leading and trailing
      // whitespace, descending rather than ascending order, mixed case, and a repeated element.
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
      // structKeyExists, not len(), so an empty-string productID still appends
      // `and sku.product.id = ?` and matches nothing.
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
      // `undefined`, and nothing else.
      const skuCode = 'TESTSKUXXX';

      const response = await harness.invoke(requestFor('getSkuBySkuCode', { skuCode }));

      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0]?.member).toBe('SkuService.getSkuBySkuCode');
      expect(harness.calls[0]?.args).toEqual([skuCode]);
      expect(outcomeFor(response, 'getSkuBySkuCode').sku).toBeUndefined();
    });

    it('routes an alternate sku code to the same service member as a primary one', async () => {
      // CFML parity [model/dao/SkuDAO.cfc:L103]: the lookup matches `skuCode` or
      // `alternateSkuCode` through a LEFT JOIN on `ss.alternateSkuCodes`, binding one parameter to
      // both sides.
      const alternate = 'LEGACY-ALT-0001';

      await harness.invoke(requestFor('getSkuBySkuCode', { skuCode: alternate }));

      expect(harness.calls[0]?.member).toBe('SkuService.getSkuBySkuCode');
      expect(harness.calls[0]?.args).toEqual([alternate]);
    });

    // And the `getTransactionExistsFlag` case is the one worth naming.
    //
    // The three service members are unchanged and each keeps its own service-tier coverage: the
    // singular/plural asymmetry [model/dao/SkuDAO.cfc:L130] versus `model/dao/ProductDAO.cfc`, the
    // `structKeyExists`-plus-non-blank gate [model/dao/SkuDAO.cfc:L134].

    it('invokes EXACTLY ONE service member and opens EXACTLY ONE request scope', async () => {
      const populated = createHarness();

      await populated.invoke(servableRequest());

      expect(populated.bootstrapCount()).toBe(1);
      expect(populated.scopeOpenings).toHaveLength(1);
      expect(populated.calls).toHaveLength(1);
    });

    it('opens the request scope with the authenticated account and no fabricated route state', async () => {
      // The admission gate establishes the one request-scoped value this route owns. It still
      // fabricates no date, feed host, administrative flag or address-zone request.
      const populated = createHarness();

      await populated.invoke(servableRequest());

      expect(populated.scopeOpenings[0]?.input).toEqual({
        accountID: AUTHENTICATED_ACCOUNT_ID,
      });
    });

    it('opens a FRESH scope per invocation and holds none between them', async () => {
      // A module-scope cache of a request scope would carry one caller's memoized state - a
      // currency map, a rounding-rule memo, the option-group sort-order memo whose legacy clear at
      // [model/dao/SkuDAO.cfc:L222-L226] can never fire.
      const populated = createHarness();

      await populated.invoke(servableRequest());
      await populated.invoke(servableRequest());

      expect(populated.scopeOpenings).toHaveLength(2);
      expect(populated.bootstrapCount()).toBe(2);
      expect(populated.calls).toHaveLength(2);
    });
  });

  // Concern 3 - API gateway response shaping.
  describe('API Gateway response shaping', () => {
    it('answers 200 with an explicit JSON content type and no-store caching', async () => {
      // `cache-control: no-store` is the non-inventing choice: the legacy slice published no
      // caching semantics for any of these reads, and choosing a freshness lifetime would invent
      // one.
      const response = await createHarness().invoke(servableRequest());

      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
    });

    it('publishes the SHARED success envelope, with the outcome inside it', async () => {
      const response = await createHarness().invoke(servableRequest());
      const body = successBodyOf(response);

      expect(Object.keys(body).sort()).toEqual(['action', 'capability', 'requestId', 'result']);
      expect(body.capability).toBe('skuResolution');
      expect(body.action).toBe('resolveSkus');
      expect(Object.keys(body.result)).toEqual(['outcome']);
      expect(body.result.outcome.operation).toBe('getSkuBySkuCode');
    });

    it('★★★ prefers the INVOCATION correlation identifier over the gateway one', async () => {
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
      // nothing.
      expect(successBodyOf(neither).requestId).toBe(UNATTRIBUTED_REQUEST_ID);
    });

    it('publishes the collection in the order the service returned it, unmodified', async () => {
      // Any of those would silently change must-preserve behaviour: this collection is derived
      // from AND-of-EXISTS matching [model/dao/SkuDAO.cfc:L107-L128].
      //
      // The input is deliberately not in identifier order and carries a repeated element, so a
      // hidden sort and a hidden de-duplication each fail this case on their own.
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
      // `Money.toDecimalString()`, not `Money.toFixed2()`.
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

      // Compared by VALUE through the CFML parity helper, never by string identity.
      expectSameAmount(projected.price, '19.9925');
      expect(cfNumericEquals(projected.price, price.toFixed2())).toBe(false);
    });

    it('omits skuCode, imageFile and productID when the entity carries none', async () => {
      // Omitted, never `''` and never `null`.
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
      // `{}` means the eligibility gate at [model/entity/Sku.cfc:L373] was closed, or that the SKU
      // was hydrated for a path that needs no currency-aware price.
      const sku = makeSkuFixture();
      const populated = createHarness({ skuBySkuCode: sku });

      const response = await populated.invoke(
        requestFor('getSkuBySkuCode', { skuCode: 'TESTSKUXXX' }),
      );

      expect(outcomeFor(response, 'getSkuBySkuCode').sku?.currencyDetails).toEqual({});
    });

    it('publishes the materialized cascade with its own presentation strings verbatim', async () => {
      const sku = makeSkuFixture({ price: Money.fromDecimalString('19.9925') });

      // The fixture answers an UNHYDRATED sku; this is the documented boundary that runs the
      // four-step cascade [model/entity/Sku.cfc:L367-L433] once.
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

      // Step 1 wrote the SKU's own columns, so nothing was converted and no override row was
      // involved [model/entity/Sku.cfc:L382, L396].
      expect(base.converted).toBe(false);
      expect(base.skuCurrencyID).toBe('');

      // The money member is full precision; the `*Formatted` member is the CASCADE'S own string,
      // copied verbatim. The two differing is exactly the point: this module formats nothing, and
      // it rounds nothing.
      expectSameAmount(base.price, '19.9925');
      expect(base.priceFormatted).toBe('19.99');
    });

    it('OMITS a stranded currency sub-key rather than coercing it to zero', async () => {
      // The highest-consequence assertion in this file.
      //
      // `getPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L273] performs one `structKeyExists`
      // and has no `else` and no return outside the `if`, so an unknown currency yields nothing.
      const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });

      await Sku.hydrate(sku);

      // The state the projection is handed: a real amount for one accessor and nothing for the
      // other two, on the same present currency. Contract-honest data, not a defect.
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

      // And nowhere in the raw document, which is the assertion a named-field check would pass
      // while a zero still shipped inside a field this suite did not think to read.
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

      // Folding these would change a published document on a case convention this module has no
      // authority over.
      expect(Object.keys(details).sort()).toEqual(['EUR', 'USD']);
    });

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

      // The KEY SET is ASSERTED EXHAUSTIVELY, which is what rules out a duration, a rate, a size
      // or any other measurement having been added: a count is legible and carries nothing
      // confidential.
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

  // Concern 4 - domain and error mapping.
  //
  // One mapping point, the closed status set this authenticated route can reach, and one message
  // published verbatim.
  describe('domain and error mapping', () => {
    it('maps an unrecognised failure to a generic response and leaks nothing', async () => {
      // The pinned MySQL driver composes its message out of the server's own error text and hangs
      // the failing statement off the error object.
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

      // Asserted against the RAW body, not only against named fields: a check that read one field
      // would pass while the statement still shipped inside another.
      expect(response.body).not.toContain(PLANTED_STATEMENT);
      expect(response.body).not.toContain(PLANTED_INTERNAL_DETAIL);
      expect(response.body).not.toContain('SwSku');

      // The failure is reported - to the log stream, under the caller's correlation identifier -
      // as a CLASSIFICATION rather than as the thrown value.
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
      // Both shapes reach the handler's one `catch`: a service that raises synchronously and a
      // service whose promise rejects. A second mapping point would let one failure be classified
      // twice.
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
      // The one message published verbatim. Identical at [org/Hibachi/HibachiEntity.cfc:L565] and
      // [org/Hibachi/HibachiService.cfc:L280], it is an observable behavioural contract.
      //
      // LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565]: the framework's terminal
      // `onMissingMethod` throw reads "does not exists", which is grammatically incorrect.
      // Preserved deliberately; do not fix without a product decision.
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
      // [org/Hibachi/HibachiObject.cfc:L126] throws a DISTINCT message - "You have attempted to
      // call the method X which does not exist in Y" - and it is not the recognised contract.
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
      // The composition root is awaited INSIDE the invocation rather than at module load precisely
      // so this failure is attributable to a request and correlatable on the log stream.
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
      // No 403, 409, 422 or 429 is reachable because this route has no administrative operation,
      // conflict tier, semantic-validation tier or rate limiter.
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

  // The surface this route deliberately does not publish.
  //
  // "This handler does not publish X" is only auditable if X is named, so the subject names every
  // one in source and this section holds that inventory to its documented size.
  describe('the deliberately non-exposed surface', () => {
    it('names every absent member, and the inventory has neither grown nor shrunk', async () => {
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
      const withdrawn = ['findSkus', 'getTransactionExistsFlag', 'searchSkusByProductType'];

      for (const [member, reason] of Object.entries(NON_EXPOSED_SURFACE_NOTES)) {
        if (withdrawn.includes(member)) {
          expect(reason.startsWith('WITHDRAWN from the routed surface')).toBe(true);
        } else {
          expect(reason.startsWith('Not exposed.')).toBe(true);
        }
      }

      // LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag` delegates
      // at [model/service/SkuService.cfc:L282] to a SkuDAO member that does not exist, so the
      // legacy raises on every call.
      // Preserved deliberately; do not fix without a product decision.
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
      // A primary adapter can obtain no hydrated `Product` or `Sku` - `RequestScope` publishes no
      // repository and no service publishes a load-by-identifier - and it may construct none.
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
      // `calculateSkuPriceBasedOnPromotion`, which does not exist, so the legacy raises every
      // time.
      // Preserved deliberately; do not fix without a product decision.
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

  // Concern 6 - the three withdrawn operations, and the two admission bounds.
  //
  // Deleting a `case` arm makes an operation unreachable; it does not prove that a caller asking
  // for it gets a sensible answer, that nothing was constructed on the way to the refusal.
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

        // The same rejection a nonsense operation earns, with the field path `operation`. A
        // distinct "withdrawn" outcome would advertise that the action once existed and invite a
        // caller to wait for it to come back.
        expect(response.statusCode).toBe(400);
        expect(fieldPathsOf(response)).toContain('operation');
        // Nothing was constructed, and no service member was reached - the three tripwire
        // overrides on the recording service would have rejected loudly if one had been.
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
        // reason travels with the artifact rather than living only in this repository.
        expect(reason.startsWith('WITHDRAWN from the routed surface')).toBe(true);
        expect(reason.length).toBeGreaterThan(80);
      },
    );

    it('★★★ proves the withheld route would have been unservable, against the REAL service and repository', async () => {
      // The statement executor is a counting stand-in for the database and nothing else - the
      // assertion is that it is never REACHED, because the repository refuses before it would
      // issue a statement.
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

      // `adminAccountFlag` is REQUIRED by the audit-actor contract rather than defaulted,
      // precisely so a construction site cannot omit it; `false` is the honest value for a suite
      // with no account.
      const realRepository = new MysqlSkuRepository(countingExecutor, { adminAccountFlag: false });
      const realService = new SkuService(
        realRepository,
        unreachableImageStore,
        unreachableSubscriptionTermProvider,
      );

      await expect(realService.getTransactionExistsFlag()).rejects.toThrow(/productID/);
      // CFML parity [model/dao/SkuDAO.cfc:L59-L63]: the legacy takes its `<cfelse>` arm and
      // executes with an UNDEFINED `arguments.productID`, so it cannot serve this call either.
      expect(statementsIssued).toBe(0);
    });

    it('★★★ ADMITS a selectedOptions list past 64 elements and forwards it byte for byte', async () => {
      // `getProductSkusBySelectedOptions` is one of the three MUST-PRESERVE behaviours (AAP
      // 0.8.1), and the legacy answers a list of any length - the loop at
      // [model/dao/SkuDAO.cfc:L112] emits one `exists` clause per element with no count test
      // anywhere.
      const overWide = Array.from({ length: 65 }, (unused, index) => String(index)).join(',');
      const isolated = createHarness({ productSkusBySelectedOptions: [] });

      const response = await isolated.invoke(
        requestFor('getProductSkusBySelectedOptions', {
          selectedOptions: overWide,
          productID: PRODUCT_ID,
        }),
      );

      expect(response.statusCode).toBe(200);
      // FORWARDED BYTE for BYTE: no count, no trim, no sort, no de-duplication and no truncation -
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
      // Recording logger captures the context object as given, so it cannot see the real logger's
      // key-based redaction policy - under which `capability` and `operation` were being REDACTED.
      //
      // `route` and `resultCount` are asserted with them, because a policy change that admitted
      // two of the four and not the others would be a half-fix.
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
      // And the correlation identifier, which was the only legible member before the policy
      // change.
      expect(line).toContain(INVOCATION_REQUEST_ID);
      // Nothing was redacted on this line.
      expect(line).not.toContain('[REDACTED]');
    });
  });
});

// Concern 7 - the authenticated boundary and the option-list ceiling.

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

// The selected-options list: total at this boundary (net-new)
//
// What REPLACES it is the same MAGNITUDES, ADMITTED, plus the property that actually matters at a
// transport boundary: the string the caller sent is the string the service receives.

describe('the selectedOptions list is total at this boundary (NET-NEW)', () => {
  /**
   * A comma-delimited list of `count` distinct option identifiers.
   */
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

    for (const count of [500, 700]) {
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
    // while withholding the submitted values.
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
