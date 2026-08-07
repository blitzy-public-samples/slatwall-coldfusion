// The price-resolution Lambda entrypoint, under test.
//
// NET-NEW COVERAGE, never presented as parity: there is no `.cfc` antecedent for a Lambda
// entrypoint and no legacy test file reaches the handler tier.
//
// Four concerns and no others: parsing and validation of the wire document, delegation to one
// already-ported member per operation, response shaping, and mapping of anything thrown.
//
// The only legacy suites extended anywhere in this port are `meta/tests/unit/entity/BrandTest.cfc`
// and `meta/tests/unit/entity/ProductTest.cfc`.

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
// `bootstrapCompositionRoot` with an INJECTED executor and an EXPLICIT environment source, which
// is the same construction `tests/unit/handlers/bootstrap.test.ts` uses.
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

// Invented sentinels and explicit instants.

/**
 * The instant every scope below resolves against. Rendered back by the response's `resolvedAt`.
 */
const RESOLVED_AT = '2024-06-15T12:30:00.000Z';

/**
 * A second, distinct instant, so "the response echoes this scope's clock" is falsifiable.
 */
const ALTERNATE_RESOLVED_AT = '2025-01-02T03:04:05.678Z';

/**
 * Correlation identifier, shaped like the one the Lambda runtime supplies.
 */
const REQUEST_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

/**
 * The identifier the EVENT carries, distinct from the one the CONTEXT carries.
 *
 * Distinct on purpose: this entrypoint reads the correlation token from the Lambda context alone -
 * unlike `./promotionApplicationHandler.js`, which falls back to the event.
 */
const PLATFORM_REQUEST_ID = 'a1b2c3d4-0000-4000-8000-0000000000e5';

/**
 * The authenticated account, reduced to an opaque identifier - never a name and never an address.
 */
const ACCOUNT_ID = 'account-9f13c7';

/**
 * Planted internal detail, long and unique and free of regular-expression metacharacters so a
 * substring search cannot produce a false result either way.
 */
const PLANTED_INTERNAL_DETAIL = 'PLANTED-INTERNAL-DETAIL-6d20f4b91c3e';

/**
 * A caller-authored ANCESTOR key, deliberately named like a credential.
 */
const PLANTED_ANCESTOR_KEY = 'planted_api_token_value_4c17ea';

/**
 * The secondary eligible currency the SKU fixture generates rows for.
 */
const SECONDARY_CURRENCY_CODE = 'EUR';

/**
 * A currency the SKU fixture never makes eligible, so the cascade never records a price for it.
 */
const INELIGIBLE_CURRENCY_CODE = 'JPY';

/**
 * A two-character currency code: refused by the converter arm, ANSWERED by the accessor arms.
 */
const SHORT_CURRENCY_CODE = 'EU';

/**
 * Zero, as a decimal string, used for exactly one purpose: building the value object's own
 * rendering of zero so a test can assert it never reaches the wire.
 */
const ZERO_DECIMAL = '0';

/**
 * The exact wording `./errorMapper.js` publishes for a schema-rejected or unusable input.
 */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/**
 * The exact wording published for a failure the mapper does not recognise.
 */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/**
 * The framework's terminal dead-call-target message, reproduced EXACTLY as both tiers throw it -
 * including the grammatical error "does not exists" and the word "entity".
 *
 * LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the
 * framework's `onMissingMethod` throw is ungrammatical and the service-tier copy still says
 * "entity".
 * Preserved deliberately; do not fix without a product decision.
 */
const MISSING_METHOD_CONTRACT_MESSAGE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

/**
 * The DIFFERENT variant thrown by `invokeMethod` rather than by an `onMissingMethod`.
 *
 * It diverges on four independent counts - different opening clause, no `()`, correct grammar, no
 * trailing " entity." - so the recogniser cannot match it even by accident.
 */
const UNRECOGNISED_FRAMEWORK_MESSAGE =
  'You have attempted to call the method calculateSkuPriceBasedOnPromotion which does not exist in Slatwall.model.entity.Sku';

/**
 * Obviously-fabricated identifiers for the raw-body cases in concern.
 *
 * Those cases drive `handler` with hand-written JSON to exercise the SCHEMA, and never reach a
 * loader, so the identifiers need only be well-formed strings.
 */
const SENTINEL_PRICE_GROUP_ID = 'pricegroup-0000-not-loaded';
const SENTINEL_PRICE_GROUP_RATE_ID = 'pricegrouprate-0000-not-loaded';
const SENTINEL_PRODUCT_ID = 'product-0000-not-loaded';
const SENTINEL_PRODUCT_TYPE_ID = 'producttype-0000-not-loaded';
const SENTINEL_SKU_ROW_ID = 'sku-0000-not-loaded';

/**
 * A well-formed SKU identity for the raw-body cases.
 */
const SENTINEL_SKU_IDENTITY = {
  productID: SENTINEL_PRODUCT_ID,
  skuID: SENTINEL_SKU_ROW_ID,
} as const;

/**
 * Every operation the subject publishes, in the order its own union declares them.
 */
const ALL_OPERATIONS: readonly PriceResolutionOperation[] = [
  'getRateForProductTypeBasedOnPriceGroup',
  'getRateForProductBasedOnPriceGroup',
  'getRateForSkuBasedOnPriceGroup',
  'calculateSkuPriceBasedOnCurrentAccount',
  'calculateSkuPriceBasedOnAccount',
  'calculateSkuPriceBasedOnPriceGroup',
  'calculateSkuPriceBasedOnPriceGroupRate',
  'getBestPriceGroupDetailsBasedOnSkuAndAccount',
  'getPriceByCurrencyCode',
  'getListPriceByCurrencyCode',
  'getRenewalPriceByCurrencyCode',
  'convertCurrency',
];

/**
 * The eight price-group members the subject's scope exposes.
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
 * [model/service/PromotionService.cfc:L241].
 */
const WITHHELD_PRICE_GROUP_MEMBERS: readonly string[] = [
  'updateOrderAmountsWithPriceGroups',
  'updatePriceGroupSKUSettings',
  'savePriceGroupRate',
  'deletePriceGroup',
  'getPriceGroupDataJSON',
];

// Entity types, DERIVED from the published surface rather than imported.

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
 * Both `overrides` interfaces are declared locally inside their factory and are not exported,
 * which is correct - the shape is an implementation detail of the factory.
 */
type SkuOverrides = NonNullable<Parameters<typeof makeSkuFixture>[0]>;
type PriceGroupOverrides = NonNullable<Parameters<typeof makePriceGroupFixtures>[0]>;

/**
 * One complete, independent price-group graph, as its factory hands it back.
 */
type PriceGroupGraph = ReturnType<typeof makePriceGroupFixtures>;

// Every read of an unknown value below narrows with a `typeof` or shape probe and RAISES on a
// mismatch.

/**
 * Narrow a value that must be defined, naming what was missing.
 */
function requireDefined<TValue>(value: TValue | undefined, what: string): TValue {
  if (value === undefined) {
    throw new Error(`the fixture graph carried no ${what}`);
  }

  return value;
}

/**
 * Narrow a value that must be a plain object, naming where it was read from.
 */
function readObject(value: unknown, what: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }

  return { ...value };
}

/**
 * Narrow a value that must be a string, naming where it was read from.
 */
function readString(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${what} is not a string`);
  }

  return value;
}

/**
 * The six categories `./errorMapper.js` publishes, and no others.
 */
const MAPPED_CATEGORIES: readonly ErrorResponseBody['error']['category'][] = [
  'missingMethod',
  'routeNotFound',
  'invalidRequest',
  'unauthenticated',
  'forbidden',
  'unrecognized',
];

/**
 * Narrow the envelope's category against the closed union rather than asserting it into shape.
 */
function readCategory(value: unknown): ErrorResponseBody['error']['category'] {
  const text = readString(value, 'error.category');
  const matched = MAPPED_CATEGORIES.find((candidate) => candidate === text);

  if (matched === undefined) {
    throw new Error(`error.category is outside the published set: ${text}`);
  }

  return matched;
}

/**
 * What one mapped response says, plus the raw body so a leak anywhere in it is detectable.
 */
interface ReadErrorEnvelope {
  readonly category: ErrorResponseBody['error']['category'];
  readonly message: string;
  readonly requestId: string;
  /**
   * The member names present on `error`, so "never present and empty" is checkable.
   */
  readonly memberNames: readonly string[];
  /**
   * The body exactly as it would travel.
   */
  readonly raw: string;
}

/**
 * Read a mapped error response, proving the envelope shape on the way.
 */
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
 * Compare two decimal numerals by VALUE, never by string identity.
 *
 * `'12.350'` and `'12.35'` are the same amount of money and different strings, so a string
 * comparison is the wrong test for "did this value survive".
 */
function expectSameDecimalValue(actual: string, expected: DecimalString): void {
  expect(cfNumericEquals(actual, expected)).toBe(true);
}

/**
 * Narrow a dispatch result to the `price` outcome, failing loudly on anything else.
 */
function expectPriceOutcome(result: PriceResolutionResult): string {
  if (result.outcome !== 'price') {
    throw new Error(`expected the price outcome, received ${result.outcome}`);
  }

  return result.price.amount;
}

/**
 * Narrow a dispatch result to the `unresolved` outcome and hand back its reason.
 */
function expectUnresolvedOutcome(result: PriceResolutionResult): UnresolvedReason {
  if (result.outcome !== 'unresolved') {
    throw new Error(`expected the unresolved outcome, received ${result.outcome}`);
  }

  return result.reason;
}

/**
 * Narrow a dispatch result to the `priceGroupRate` outcome.
 */
function expectRateOutcome(
  result: PriceResolutionResult,
): Extract<PriceResolutionResult, { outcome: 'priceGroupRate' }>['rate'] {
  if (result.outcome !== 'priceGroupRate') {
    throw new Error(`expected the priceGroupRate outcome, received ${result.outcome}`);
  }

  return result.rate;
}

/**
 * Narrow a dispatch result to the `currencyPrice` outcome.
 */
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
 * Refusing loudly rather than answering is the point: a double that quietly returned a plausible
 * value would let an unexpected call pass as a success.
 */
function refuse(member: string): never {
  throw new Error(`this suite's double refuses ${member}: the subject must not reach it`);
}

/**
 * Settle on a later microtask, so "the subject awaited this" is falsifiable.
 */
async function settleLater<TValue>(value: TValue): Promise<TValue> {
  await Promise.resolve();
  await Promise.resolve();

  return value;
}

// Suite-local hand-written doubles.
//
// Every one is written by hand: no mocking library, no factory library, no container, no generated
// stub.
//
// The only pre-built collaborators used anywhere here are the two fixture factories, and both hand
// back A FRESH GRAPH on every CALL, so two calls share no mutable object.

/**
 * One recorded invocation of the price-group surface.
 */
interface RecordedServiceCall {
  readonly member: ExposedPriceGroupMember;
  readonly args: readonly unknown[];
}

/**
 * What the price-group double answers, member by member.
 *
 * Members are optional and admit an explicit `undefined`, which differ under
 * `exactOptionalPropertyTypes`: this is an options bag.
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
  /**
   * A failure to raise from one named member, so the mapping paths are drivable.
   */
  readonly failing?: { readonly member: ExposedPriceGroupMember; readonly thrown: unknown };
  /**
   * Settle the four asynchronous answers on a later microtask.
   */
  readonly deferred?: boolean | undefined;
}

/**
 * The price-group double, and the record of what the subject asked it.
 */
interface PriceGroupServiceDouble {
  readonly service: PriceResolutionScope['priceGroupService'];
  readonly calls: readonly RecordedServiceCall[];
}

/**
 * Build the price-group double.
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

      // [model/service/PriceGroupService.cfc:L312]: the legacy returns `sku.getPrice()` when no
      // rate applied. Never zero.
      return answers.priceForPriceGroup ?? sku.getPrice();
    },

    calculateSkuPriceBasedOnPriceGroupRate: (
      sku: ResolvedSku,
      priceGroupRate: ResolvedPriceGroupRate,
    ): Money => {
      record('calculateSkuPriceBasedOnPriceGroupRate', sku, priceGroupRate);

      // [model/service/PriceGroupService.cfc:L319]: the seed is the SKU's own price, which is also
      // what an unrecognised `amountType` passes straight through, there being no `default:` arm.
      return answers.priceForRate ?? sku.getPrice();
    },

    calculateSkuPriceBasedOnCurrentAccount: (
      sku: ResolvedSku,
      context: CurrentAccountContext,
    ): Promise<Money> => {
      record('calculateSkuPriceBasedOnCurrentAccount', sku, context);

      // [model/service/PriceGroupService.cfc:L263-L266]: this member OWNS the signed-in test - the
      // adapter hands the context over whole and does not short-circuit on it - and its else arm
      // answers the SKU's own price.
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

      // [model/service/PriceGroupService.cfc:L347]: seeded with the SKU's own price, so `price` is
      // always present.
      return settle({
        price: answers.bestPrice ?? sku.getPrice(),
        priceGroup: answers.bestPriceGroup,
      });
    },
  };

  return { service, calls };
}

/**
 * One recorded conversion request.
 */
interface RecordedConversion {
  readonly amount: Money;
  readonly originalCurrencyCode: string;
  readonly convertToCurrencyCode: string;
}

/**
 * The currency-converter double, narrowed to the one member the subject exposes.
 */
interface CurrencyConverterDouble {
  readonly converter: PriceResolutionScope['currencyConverter'];
  readonly conversions: readonly RecordedConversion[];
}

/**
 * Build the currency-converter double.
 *
 * CFML parity [model/service/CurrencyService.cfc:L100-L101]: with no answer configured this
 * returns the amount UNCONVERTED, which is exactly what the legacy does when it holds no rate for
 * either code.
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

/**
 * One recorded entity load, by the loader that was asked and the identifier it was given.
 *
 * The union is DERIVED from the interface rather than transcribed, so it cannot fall behind it:
 * when `RequestEntityLoaders` grew from five loads to seven.
 */
interface RecordedLoad {
  readonly loader: keyof PriceResolutionScope['entityLoaders'];
  readonly identifier: string;
}

/**
 * What the loaders answer, and the record of what was asked of them.
 */
interface EntityLoadersDouble {
  readonly loaders: PriceResolutionScope['entityLoaders'];
  readonly loads: readonly RecordedLoad[];
}

/**
 * What one case wants the loaders to hold. Anything absent answers a MISS.
 */
interface LoadableWorld {
  readonly product?: ResolvedProduct | undefined;
  readonly productType?: ResolvedProductType | undefined;
  readonly sku?: ResolvedSku | undefined;
  readonly priceGroup?: ResolvedPriceGroup | undefined;
  readonly priceGroupRate?: ResolvedPriceGroupRate | undefined;
}

/**
 * Build the READ-ONLY loads this capability binds through, plus a raising tripwire on each of the
 * two it must never reach.
 *
 * A MISS is `undefined`, never a throw and never a fabricated entity - the posture
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

        // The product is the SKU'S own, exactly as the real loader wires it: `getProductSkus` puts
        // this instance onto every SKU it builds.
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

      // `RequestEntityLoaders` grew from five loads to seven when the catalog capability needed a
      // `Brand` and a set of `Option`s.
      getBrandByBrandID: (brandID: string): Promise<never> => {
        loads.push({ loader: 'getBrandByBrandID', identifier: brandID });

        return Promise.reject(
          new Error(
            'priceResolutionHandler reached getBrandByBrandID; no pricing operation names a brand',
          ),
        );
      },

      getOptionsByOptionIDList: (optionIDs: readonly string[]): Promise<never> => {
        loads.push({ loader: 'getOptionsByOptionIDList', identifier: optionIDs.join(',') });

        return Promise.reject(
          new Error(
            'priceResolutionHandler reached getOptionsByOptionIDList; no pricing operation names ' +
              'an option entity',
          ),
        );
      },
    },
  };
}

/**
 * One question put to the entitlement surface, in the order it was asked.
 */
interface RecordedEntitlementDecision {
  readonly member: 'isEntitledToPriceGroup' | 'isEntitledToPriceGroupRate';

  /**
   * The price-group identifier the decision turned on - for a rate, its OWNING group.
   */
  readonly priceGroupID: string | undefined;

  readonly entitled: boolean;
}

/**
 * The entitlement double, plus the log a case asserts against.
 */
interface EntitlementsDouble {
  readonly entitlements: PriceResolutionScope['priceGroupEntitlements'];
  readonly decisions: RecordedEntitlementDecision[];
}

/**
 * How a case configures the account's price-group entitlement.
 */
interface EntitlementOverrides {
  /**
   * The administrative bypass. Defaults to `true` - see {@link makeEntitlementsDouble}.
   */
  readonly admin?: boolean | undefined;

  /**
   * The exact price groups this account holds, when `admin` is false. Defaults to none.
   */
  readonly entitledPriceGroupIDs?: readonly string[] | undefined;
}

/**
 * Roughly sixty existing cases in this file are about the CASCADE - its five levels, its two
 * documented asymmetries, its rounding, its serialisation - and none of them is about
 * authorization.
 *
 * Permissive default means a dispatch arm that FORGOT to consult the entitlement surface would
 * still pass every cascade case.
 *
 * The double mirrors the shipped implementation's two rules exactly: an administrative caller is
 * entitled to everything.
 */
function makeEntitlementsDouble(overrides?: EntitlementOverrides): EntitlementsDouble {
  const admin = overrides?.admin ?? true;
  const entitledFolded = new Set(
    (overrides?.entitledPriceGroupIDs ?? []).map((identifier) => identifier.toLowerCase()),
  );
  const decisions: RecordedEntitlementDecision[] = [];

  const decide = (priceGroupID: string | undefined): boolean => {
    if (admin) {
      return true;
    }

    return priceGroupID !== undefined && entitledFolded.has(priceGroupID.toLowerCase());
  };

  return {
    decisions,
    entitlements: {
      isEntitledToPriceGroup: (priceGroupID: string): Promise<boolean> => {
        const entitled = decide(priceGroupID);

        decisions.push({ member: 'isEntitledToPriceGroup', priceGroupID, entitled });

        return Promise.resolve(entitled);
      },

      isEntitledToPriceGroupRate: (rate: ResolvedPriceGroupRate): Promise<boolean> => {
        // The owner comes off the RATE, never from an argument - the property that stops a caller
        // pairing another account's rate with a price group of its own.
        const owningPriceGroupID = rate.getPriceGroup()?.getPriceGroupID();
        const entitled =
          owningPriceGroupID === undefined || owningPriceGroupID === ''
            ? admin
            : decide(owningPriceGroupID);

        decisions.push({
          member: 'isEntitledToPriceGroupRate',
          priceGroupID: owningPriceGroupID,
          entitled,
        });

        return Promise.resolve(entitled);
      },
    },
  };
}

/**
 * Everything one scope needs, with the doubles a case usually wants to reach afterwards.
 */
interface ScopeParts {
  readonly entityLoaders: EntityLoadersDouble;
  readonly priceGroupService: PriceResolutionScope['priceGroupService'];
  readonly currencyConverter?: PriceResolutionScope['currencyConverter'] | undefined;
  readonly accountID?: string | undefined;
  readonly now?: string | undefined;

  /**
   * The entitlement double. Omitted means the administrative default - see {@link
   * makeEntitlementsDouble}.
   */
  readonly entitlements?: EntitlementsDouble | undefined;
}

/**
 * Assemble one request scope.
 *
 * The account is expressed as the explicit context and nothing else (T6).
 */
function makeScope(parts: ScopeParts): PriceResolutionScope {
  const currentAccountContext: CurrentAccountContext =
    parts.accountID === undefined ? {} : { accountID: parts.accountID };

  return {
    now: new Date(parts.now ?? RESOLVED_AT),
    currentAccountContext,
    entityLoaders: parts.entityLoaders.loaders,
    // The entitlement surface is a separate member from the account context, exactly as the
    // shipped scope publishes it: `CurrentAccountContext` above answers "whose prices" and its
    // contract refuses permission members.
    priceGroupEntitlements: (parts.entitlements ?? makeEntitlementsDouble()).entitlements,
    priceGroupService: parts.priceGroupService,
    currencyConverter: parts.currencyConverter ?? makeCurrencyConverterDouble().converter,
  };
}

/**
 * One SKU, its product, that product's product type, and the identifiers naming them.
 */
interface SkuWorld {
  readonly sku: ResolvedSku;
  readonly product: ResolvedProduct;
  readonly productType: ResolvedProductType;

  /**
   * How a request names this SKU: by identifier.
   */
  readonly identity: PriceResolutionSkuIdentity;

  readonly entityLoaders: EntityLoadersDouble;
}

/**
 * Build one SKU world.
 *
 * The identifiers are read OFF the entities rather than written as literals, so no case can drift
 * from the fixture, and the product the loaders hold is the SKU'S own.
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

// The Lambda invocation surface.
//
// The exported `handler` is driven only on the paths that resolve before the MEMOIZED composition
// root is reached.

/**
 * The parts of a version 1.0 proxy event this entrypoint actually reads.
 *
 * Verified by reading the subject: `routeRequestFromEvent` takes `httpMethod` and `path`,
 * `resolveRequestPrincipal` takes `requestContext.authorizer`.
 */
interface ProxyEventFacts {
  readonly httpMethod?: string | undefined;
  readonly path?: string | undefined;
  readonly body?: string | null | undefined;
  readonly isBase64Encoded?: boolean | undefined;
  readonly authorizer?: Readonly<Record<string, unknown>> | null | undefined;
}

/**
 * It ended `return partial as unknown as APIGatewayProxyEvent;`, justified like this: "one
 * narrowly-scoped conversion, confined to this function.
 *
 * Every value is an invented, non-sensitive sentinel: a documentation-range source address
 * [RFC 5737], a zeroed account number in the ARN, and no host name a reader could mistake for
 * real.
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
      // The TRUST BOUNDARY. An omitted override is the ordinary authenticated caller; an explicit
      // `null` is the anonymous request.
      authorizer: facts.authorizer === undefined ? { accountID: ACCOUNT_ID } : facts.authorizer,
      protocol: 'HTTP/1.1',
      httpMethod,
      // JUDGMENT CALL: every member of `identity` is REQUIRED by `@types/aws-lambda`'s
      // `APIGatewayEventIdentity` and none is optional, so the credential-NAMED members must
      // appear for this literal to type-check.
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

/**
 * One captured line from the process's own log stream, already parsed.
 */
interface CapturedLogLine {
  readonly level: string;
  readonly message: string;
  readonly raw: string;
}

/**
 * A capture of everything the subject emitted while a case ran.
 */
interface LogStreamCapture {
  readonly lines: readonly CapturedLogLine[];
  /**
   * Every captured line joined, so a leak anywhere in any payload is detectable.
   */
  readonly text: () => string;
}

/**
 * Capture the log lines the subject emits, without silencing anything.
 *
 * The capture DELEGATES to the original write, so this is not a global silencing of the console -
 * every line still reaches the stream - and the spy is per-case and is restored by the hooks.
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
// spies and returns the clock to real time after every test.
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Serialise a well-typed request, so a valid body cannot drift from the published request type.
 */
function bodyOf(request: PriceResolutionRequest): string {
  return JSON.stringify(request);
}

/**
 * The message every schema-rejected or unusable input earns, and no other.
 */
const INVALID_BODY_MESSAGES = {
  missingRequestBody: 'A request body is required and was not supplied.',
  unparsableRequestBody: 'The request body is not valid JSON.',
  unsupportedBodyShape: 'The request body is not the expected shape.',
  unusableRequestInput: INVALID_REQUEST_MESSAGE,
  routeNotFound: 'The requested route does not exist.',
} as const;

// Concern 1 - parsing and validation.

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

    // The document is valid, so it is not refused for its shape; it stops at the composition root
    // instead, which this suite deliberately never reaches - see the boundary cases below.
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

  it('★★ refuses a `__proto__` own key at the root and nested alike, naming ONLY that key', async () => {
    // The one unrecognized key `z.strictObject` does not refuse.
    //
    // Raw JSON text, not an object literal, and that is not a style choice.
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
      // One fixed issue, whatever the depth: the offending key, which is the only member name
      // involved that the caller did not choose. No ancestor, no value, no depth.
      expect(envelope.raw).toContain('"path":"__proto__"');
      expect(envelope.raw).not.toContain('sku.__proto__');
      expect(envelope.raw).not.toContain(PLANTED_ANCESTOR_KEY);
    }
    expect(Object.prototype).not.toHaveProperty('p');
  });

  it('★★★ persists NO caller-authored ancestor key on the log stream either', async () => {
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
      // The three account-scoped operations take no price group, because selecting one is their
      // whole job.
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
    const smuggled = [
      { filter: { activeFlag: 1 } },
      { orderBy: 'price|desc' },
      { properties: 'skuID,price' },
      { pageRecordsShow: 500 },
      { skuCode: 'A-CODE' },
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
    // regular expression, so the boundary cannot admit a numeral `Money` would refuse or refuse
    // one it would accept.
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
    // The opposite decision on each arm, and both are deliberate.
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
    // Resolution is scoped to this capability, so a request that matched the catalog or feed route
    // is reported as unmatched rather than being answered by the wrong entrypoint.
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

// Concern 1b - authenticated admission and the request-size ceiling.

describe('authenticated admission and request-size bounds (concern 1b)', () => {
  const ORDINARY_REQUEST = bodyOf({
    operation: 'convertCurrency',
    amount: '10.00',
    originalCurrencyCode: SECONDARY_CURRENCY_CODE,
    convertToCurrencyCode: SECONDARY_CURRENCY_CODE,
  });

  it('refuses a caller carrying no usable authorizer account', async () => {
    // `ORDINARY_REQUEST` names `convertCurrency`, one of the ELEVEN operations that retain the
    // account requirement, so every shape below is still refused.
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
    // `calculateSkuPriceBasedOnCurrentAccount` OWNS the signed-in test
    // [model/service/PriceGroupService.cfc:L262-L266] and answers `sku.getPrice()` when nobody is
    // signed in.
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
    // This case was 'runs admission before body parsing' and the order it pinned is the defect.
    //
    // What did not change is the order of the other two steps: the route still resolves first, so
    // a path this capability does not own is a 404 rather than a revealing 401 or 400.
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

    // And a DECODABLE request naming an operation that requires an account is still refused with
    // 401, before any composition root, scope or connection exists.
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

// Concern 2 - delegation.
//
// One operation, one outcome-producing call, arguments handed over unchanged.

/**
 * One doubled world: a SKU, a fresh rate graph, the recording service, and a scope over both.
 */
interface DoubledCascade {
  readonly world: SkuWorld;
  readonly graph: PriceGroupGraph;
  readonly priceGroups: PriceGroupServiceDouble;
  readonly scope: PriceResolutionScope;

  /**
   * The price group the loaders hold, and therefore the one a request may name.
   */
  readonly priceGroup: ResolvedPriceGroup;

  /**
   * The rate the loaders hold, and therefore the one a request may name.
   */
  readonly priceGroupRate: ResolvedPriceGroupRate;

  /**
   * What was asked of the five loaders while the case ran.
   */
  readonly entityLoaders: EntityLoadersDouble;
}

/**
 * Build a doubled world whose loaders hold the SKU, its product, its product type, one price group
 * and one rate.
 *
 * `bestPriceGroup` is still seeded, because `getBestPriceGroupDetailsBasedOnSkuAndAccount` is a
 * published operation in its own right and is the member whose job is to select one.
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
    // "resolves the selector through the two published catalog reads and nothing else" and pinned
    // a `productName LIKE ?` scan followed by a read of all of the matched product's SKUs.
    //
    // What is pinned now: exactly two loads, both by primary key, and exactly one service call -
    // the cascade entry point itself.
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
    expect(priceGroups.calls.map((call) => call.member)).toStrictEqual([
      'getRateForSkuBasedOnPriceGroup',
    ]);

    // The two arguments handed over are the loaded entities themselves, by identity.
    expect(priceGroups.calls[0]?.args[0]).toBe(world.sku);
    expect(priceGroups.calls[0]?.args[1]).toBe(priceGroup);
  });

  it("★★★ answers about the price group the caller NAMED, never the account's best one", async () => {
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
    const call = priceGroups.calls[0];

    expect(priceGroups.calls).toHaveLength(1);
    expect(call?.member).toBe('getRateForProductTypeBasedOnPriceGroup');
    // The product type handed over is the one the LOADER answered for the identifier the request
    // named - identity, not an equal-looking second instance.
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
    // One CALL now, and its second argument is the rate the loader answered for the identifier the
    // request named.
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
    // `noRateApplies` still exists and is still correct - for the three `getRateFor*` operations,
    // whose legacy bodies genuinely fall off the end when no rate matches
    // [model/service/PriceGroupService.cfc:L96-L98],
    // [model/service/PriceGroupService.cfc:L135-L137].
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
    // The first was titled "reports the absent product type rather than fabricating the argument".
    //
    // What is pinned instead: each of the five identifiers a request may name reports its own
    // miss, and a miss reaches no service member at all.
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
    // The async boundary, made falsifiable.
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
  });

  it('★★★ refuses the whole-document operation at the schema, and does not expose the member', async () => {
    // Nothing about the member changed - including its two carried-forward defects.
    const response = await handler(
      makeProxyEvent({ body: JSON.stringify({ operation: 'getPriceGroupDataJSON' }) }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(400);
    expect(readErrorEnvelope(response).message).toBe(INVALID_REQUEST_MESSAGE);
    // Refused before the composition root, so an unpaged whole-catalogue read is unreachable
    // rather than merely undocumented.
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

    // No entity is loaded and no price-group member is called: a conversion names an amount and
    // two codes, so there is nothing to load and nothing to cascade.
    expect(world.entityLoaders.loads).toStrictEqual([]);
    expect(priceGroups.calls).toStrictEqual([]);

    // Three positional arguments, in the order the port declares them, with both codes minted
    // through the brand the parameters require.
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
    // amount UNCONVERTED when either code is missing from its rate table.
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
    // "refuses rather than choosing when a selector names more than one candidate" * "accepts the
    // same product or SKU arriving twice.
    //
    // What is pinned in their place is the only obligation this boundary still has for an
    // identifier: hand it to the loader exactly as it arrived.
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
    // The SKU identity is a PAIR - `{productID, skuID}` - because `RequestEntityLoaders` publishes
    // the SKU through its product.
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
 */
interface OperationBindings {
  readonly sku: PriceResolutionSkuIdentity;
  readonly productID: string;
  readonly productTypeID: string;
  readonly priceGroupID: string;
  readonly priceGroupRateID: string;
  readonly accountID: string;
}

/**
 * Read every identifier off one doubled world, so no case writes an identifier as a literal.
 */
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

/**
 * Build the request one operation takes, so every published operation can be driven uniformly.
 */
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

// The gate is asserted through the published surface, not through the helper.

describe('price-group entitlement, and the outcomes it is indistinguishable from', () => {
  /**
   * A price group the account does not hold, so every non-admin decision below is a refusal.
   */
  const UNENTITLED_ACCOUNT_GROUP_ID = 'pricegroup-held-by-another-account';

  it.each([
    ['getRateForProductTypeBasedOnPriceGroup', 'priceGroupNotFound'],
    ['getRateForProductBasedOnPriceGroup', 'priceGroupNotFound'],
    ['getRateForSkuBasedOnPriceGroup', 'priceGroupNotFound'],
    ['calculateSkuPriceBasedOnPriceGroup', 'priceGroupNotFound'],
    ['calculateSkuPriceBasedOnPriceGroupRate', 'priceGroupRateNotFound'],
  ])(
    '★★★ REFUSES %s for an account that does not hold the named group, with %s',
    async (operation, expectedReason) => {
      // The row EXISTS and the loader holds it - this is not a missing-identifier case. What the
      // account lacks is the entitlement, and the operation must answer as though the row were not
      // there at all.
      const { world, graph, priceGroups, priceGroup, priceGroupRate, entityLoaders } =
        makeDoubledCascade();
      const entitlements = makeEntitlementsDouble({
        admin: false,
        entitledPriceGroupIDs: [UNENTITLED_ACCOUNT_GROUP_ID],
      });
      const scope = makeScope({
        entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      });

      const request =
        operation === 'getRateForProductTypeBasedOnPriceGroup'
          ? {
              operation,
              productTypeID: world.productType.getProductTypeID(),
              priceGroupID: priceGroup.getPriceGroupID(),
            }
          : operation === 'getRateForProductBasedOnPriceGroup'
            ? {
                operation,
                productID: world.product.getProductID(),
                priceGroupID: priceGroup.getPriceGroupID(),
              }
            : operation === 'calculateSkuPriceBasedOnPriceGroupRate'
              ? {
                  operation,
                  sku: world.identity,
                  priceGroupRateID: priceGroupRate.getPriceGroupRateID(),
                }
              : { operation, sku: world.identity, priceGroupID: priceGroup.getPriceGroupID() };

      const result = await dispatchPriceResolution(
        scope,
        request as Parameters<typeof dispatchPriceResolution>[1],
      );

      expect(result).toStrictEqual({ outcome: 'unresolved', reason: expectedReason });

      // And the SERVICE was never CALLED. The refusal happens at binding, so no cascade ran, no
      // rate was selected and no price was computed for a caller that may not have them.
      expect(priceGroups.calls).toStrictEqual([]);

      // The decision was actually taken, and it turned on the group the caller named - or, for the
      // rate arm, on the rate's OWNING group rather than on any identifier the caller supplied.
      expect(entitlements.decisions).toHaveLength(1);
      expect(entitlements.decisions[0]?.entitled).toBe(false);
      expect(entitlements.decisions[0]?.priceGroupID).toBe(
        operation === 'calculateSkuPriceBasedOnPriceGroupRate'
          ? graph.rootPriceGroup.getPriceGroupID()
          : priceGroup.getPriceGroupID(),
      );
    },
  );

  it('★★★ answers an UNENTITLED group EXACTLY as it answers a missing one, so nothing can be probed', async () => {
    // "real but not yours" were reported differently from "no such group", a caller could
    // enumerate a store's price groups one identifier at a time without ever being entitled to any
    // of them.
    const missing = makeDoubledCascade();
    const unentitled = makeDoubledCascade();
    const entitlements = makeEntitlementsDouble({
      admin: false,
      entitledPriceGroupIDs: [UNENTITLED_ACCOUNT_GROUP_ID],
    });

    // (a) An identifier no row carries. The loader answers nothing.
    const missingResult = await dispatchPriceResolution(
      makeScope({
        entityLoaders: missing.entityLoaders,
        priceGroupService: missing.priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements: makeEntitlementsDouble({
          admin: false,
          entitledPriceGroupIDs: [UNENTITLED_ACCOUNT_GROUP_ID],
        }),
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: missing.world.identity,
        priceGroupID: SENTINEL_PRICE_GROUP_ID,
      },
    );

    // (b) A real row the account is not entitled to. The loader answers the entity; the gate
    // refuses.
    const unentitledResult = await dispatchPriceResolution(
      makeScope({
        entityLoaders: unentitled.entityLoaders,
        priceGroupService: unentitled.priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: unentitled.world.identity,
        priceGroupID: unentitled.priceGroup.getPriceGroupID(),
      },
    );

    expect(unentitledResult).toStrictEqual(missingResult);
    expect(unentitledResult).toStrictEqual({ outcome: 'unresolved', reason: 'priceGroupNotFound' });

    // Neither produced a service call, so the two are indistinguishable by timing-of-work as well
    // as by value: the same amount of work was done for each.
    expect(missing.priceGroups.calls).toStrictEqual([]);
    expect(unentitled.priceGroups.calls).toStrictEqual([]);
  });

  it('★★ SERVES the operation when the account DOES hold the named group', async () => {
    // The gate must not be a blanket refusal. A non-administrative account entitled to exactly the
    // group it names is served in full, which is what makes the negatives above meaningful.
    const { world, priceGroups, priceGroup, entityLoaders } = makeDoubledCascade();
    const entitlements = makeEntitlementsDouble({
      admin: false,
      entitledPriceGroupIDs: [priceGroup.getPriceGroupID()],
    });

    const result = await dispatchPriceResolution(
      makeScope({
        entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      }),
      {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    );

    expect(result.outcome).toBe('priceGroupRate');
    expect(priceGroups.calls.map((call) => call.member)).toStrictEqual([
      'getRateForSkuBasedOnPriceGroup',
    ]);
    // The named entity reached the service unchanged - the gate decides admission, never
    // substitution.
    expect(priceGroups.calls[0]?.args[1]).toBe(priceGroup);
    expect(entitlements.decisions[0]?.entitled).toBe(true);
  });

  it('★★ ADMITS an administrative caller to a group it does not hold, and asks nothing else', async () => {
    const { world, priceGroups, priceGroup, entityLoaders } = makeDoubledCascade();
    const entitlements = makeEntitlementsDouble({ admin: true, entitledPriceGroupIDs: [] });

    const result = await dispatchPriceResolution(
      makeScope({
        entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    );

    expect(result.outcome).toBe('price');
    expect(entitlements.decisions).toStrictEqual([
      {
        member: 'isEntitledToPriceGroup',
        priceGroupID: priceGroup.getPriceGroupID(),
        entitled: true,
      },
    ]);
  });

  it('★★ decides the RATE arm on the rate\u2019s OWNING group, not on a group the caller holds', async () => {
    // The arm a naive gate gets wrong.
    //
    // The account is entitled to the CHILD group while the loaded rate belongs to the ROOT group,
    // so a gate reading the wrong side would serve the request.
    const { world, graph, priceGroups, priceGroup, priceGroupRate, entityLoaders } =
      makeDoubledCascade();

    expect(priceGroupRate.getPriceGroup()?.getPriceGroupID()).toBe(
      graph.rootPriceGroup.getPriceGroupID(),
    );
    expect(graph.rootPriceGroup.getPriceGroupID()).not.toBe(priceGroup.getPriceGroupID());

    const entitlements = makeEntitlementsDouble({
      admin: false,
      entitledPriceGroupIDs: [priceGroup.getPriceGroupID()],
    });

    const result = await dispatchPriceResolution(
      makeScope({
        entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroupRate',
        sku: world.identity,
        priceGroupRateID: priceGroupRate.getPriceGroupRateID(),
      },
    );

    expect(result).toStrictEqual({ outcome: 'unresolved', reason: 'priceGroupRateNotFound' });
    expect(entitlements.decisions).toStrictEqual([
      {
        member: 'isEntitledToPriceGroupRate',
        priceGroupID: graph.rootPriceGroup.getPriceGroupID(),
        entitled: false,
      },
    ]);
    expect(priceGroups.calls).toStrictEqual([]);
  });

  it('★★★ CONSULTS the entitlement surface on every one of the five group-named operations', async () => {
    // The tripwire that makes the permissive default safe.
    const operations = [
      'getRateForProductTypeBasedOnPriceGroup',
      'getRateForProductBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
    ] as const;

    for (const operation of operations) {
      const { world, priceGroups, priceGroup, priceGroupRate, entityLoaders } =
        makeDoubledCascade();
      const entitlements = makeEntitlementsDouble({ admin: true });
      const scope = makeScope({
        entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      });

      const request =
        operation === 'getRateForProductTypeBasedOnPriceGroup'
          ? {
              operation,
              productTypeID: world.productType.getProductTypeID(),
              priceGroupID: priceGroup.getPriceGroupID(),
            }
          : operation === 'getRateForProductBasedOnPriceGroup'
            ? {
                operation,
                productID: world.product.getProductID(),
                priceGroupID: priceGroup.getPriceGroupID(),
              }
            : operation === 'calculateSkuPriceBasedOnPriceGroupRate'
              ? {
                  operation,
                  sku: world.identity,
                  priceGroupRateID: priceGroupRate.getPriceGroupRateID(),
                }
              : { operation, sku: world.identity, priceGroupID: priceGroup.getPriceGroupID() };

      // No assertion needed here: `operations` is `as const`, so `request` is already the
      // discriminated union the dispatcher declares.
      await dispatchPriceResolution(scope, request);

      expect(entitlements.decisions, `${operation} consulted no entitlement`).toHaveLength(1);
      expect(entitlements.decisions[0]?.member).toBe(
        operation === 'calculateSkuPriceBasedOnPriceGroupRate'
          ? 'isEntitledToPriceGroupRate'
          : 'isEntitledToPriceGroup',
      );
    }
  });

  it('★★ ASKS NOTHING of the entitlement surface for the operations that name no price group', async () => {
    // The three account-scoped operations SELECT a price group rather than accepting one - that
    // selection is their whole job [model/service/PriceGroupService.cfc:L343-L362].
    const { world, priceGroups, entityLoaders } = makeDoubledCascade();
    const entitlements = makeEntitlementsDouble({ admin: false, entitledPriceGroupIDs: [] });
    const scope = makeScope({
      entityLoaders,
      priceGroupService: priceGroups.service,
      accountID: ACCOUNT_ID,
      entitlements,
    });

    await dispatchPriceResolution(scope, {
      operation: 'calculateSkuPriceBasedOnCurrentAccount',
      sku: world.identity,
    });
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

    expect(entitlements.decisions).toStrictEqual([]);
    // All three were nonetheless served, so this is not an assertion about them failing early.
    expect(priceGroups.calls).toHaveLength(3);
  });

  it('★ folds identifier case when deciding, so a differently-cased entitled group still resolves', async () => {
    // Every other identifier comparison in this subtree is case-folded - the SKU load, the
    // order-view hydration and the price-group hydration alike.
    const { world, priceGroups, priceGroup, entityLoaders } = makeDoubledCascade();
    const entitlements = makeEntitlementsDouble({
      admin: false,
      entitledPriceGroupIDs: [priceGroup.getPriceGroupID().toUpperCase()],
    });

    const result = await dispatchPriceResolution(
      makeScope({
        entityLoaders,
        priceGroupService: priceGroups.service,
        accountID: ACCOUNT_ID,
        entitlements,
      }),
      {
        operation: 'calculateSkuPriceBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    );

    expect(result.outcome).toBe('price');
    expect(entitlements.decisions[0]?.entitled).toBe(true);
  });
});

describe('the surface this entrypoint exposes, and the members it withholds', () => {
  it('publishes twelve operations, every one named for its legacy method', () => {
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

      // Every arm of the dispatcher answers; none falls through, and none of the absence reasons
      // is an error or carries a status other than the successful one.
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
    // This is a compile-time fact as much as a run-time one.
    const { service } = makePriceGroupServiceDouble();

    expect(Object.keys(service).sort()).toStrictEqual([...EXPOSED_PRICE_GROUP_MEMBERS].sort());
  });

  it('withholds the order pass and the three write members', () => {
    // JUDGMENT CALL: `updateOrderAmountsWithPriceGroups` is deliberately not routable here; it is
    // the writer half consumed by the promotion base-price branch at
    // [model/service/PromotionService.cfc:L241].
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L461-L470]: `deletePriceGroup` loops on a
    // collection captured at [model/service/PriceGroupService.cfc:L463] and always removes index
    // one.
    // Preserved deliberately; do not fix without a product decision.
    const { service } = makePriceGroupServiceDouble();
    const exposed: readonly string[] = Object.keys(service);

    for (const withheld of WITHHELD_PRICE_GROUP_MEMBERS) {
      expect(exposed).not.toContain(withheld);
      expect(ALL_OPERATIONS.map((operation): string => operation)).not.toContain(withheld);
    }
  });

  it('exposes one currency-port member, and neither eligible-currency read', () => {
    const { converter } = makeCurrencyConverterDouble();

    expect(Object.keys(converter)).toStrictEqual(['convertCurrency']);
  });

  it('never round-trips a rounding-rule member, because none is exposed at all', () => {
    // The rounding service is reached through the ENTITY -
    // [model/service/PriceGroupService.cfc:L327] calls
    // `arguments.priceGroupRate.getRoundingRule().roundValue(newPrice)`, a one-argument entity
    // method [model/entity/RoundingRule.cfc:L66-L68].
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
    // The legacy body reaches the request scope through two accessors in adjacent lines
    // [model/service/PriceGroupService.cfc:L263-L264], one of them the only use of its kind in the
    // codebase.
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
    // Absence is an OMITTED key rather than a present `undefined`, which is what makes "signed in
    // with no account" unrepresentable.
    expect(Object.keys(signedOut.currentAccountContext)).toStrictEqual([]);
    expect(signedOut.currentAccountContext.accountID).toBeUndefined();
  });

  it('hands the context to the current-account member whole, without testing it first', async () => {
    // The member owns the signed-in test. [model/service/PriceGroupService.cfc:L263] branches,
    // [model/service/PriceGroupService.cfc:L264] resolves through the account and
    // [model/service/PriceGroupService.cfc:L265-L266] answers `sku.getPrice()` otherwise.
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
    // The five are now driven without an account by the sibling case below, which is the positive
    // half of the same property.
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
      // The account is tested before anything is loaded, so no read is issued on behalf of a
      // request that could not have run anyway.
      expect(cascade.entityLoaders.loads).toStrictEqual([]);
      expect(cascade.priceGroups.calls).toStrictEqual([]);
    }
  });

  it('★★★ answers the five group-scoped operations with NO account established', async () => {
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
    // identifier differently, but the trusted authorizer spelling is the one a keyed read
    // receives.
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

// The ported cascade reaches the wire unchanged.
//
// This section wires the REAL `PriceGroupService` behind the entrypoint, with hand-written doubles
// for its three collaborators and nothing else.

type PriceGroupServiceDependencies = ConstructorParameters<typeof PriceGroupService>;

/**
 * The ported service, plus what its collaborators were asked.
 */
interface PortedServiceHarness {
  readonly service: PriceResolutionScope['priceGroupService'];
  /**
   * Account identifiers handed to the one deliberate subscription reach-through.
   */
  readonly subscriptionReads: readonly string[];
  /**
   * Account identifiers handed to the direct price-group association read.
   */
  readonly accountPriceGroupReads: readonly string[];
}

/**
 * Wire the real service over recording collaborators.
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
    // [model/dao/PriceGroupDAO.cfc:L52-L100] queries six subscription-owned tables and is called
    // from [model/service/PriceGroupService.cfc:L277].
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
    // CFML parity [model/service/PriceGroupService.cfc:L233-L236]: the legacy iterates one PAGE of
    // a framework smart list, not the whole collection.
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
 * Wire a scope over the ported service whose loaders hold the price group and rate a request may
 * name.
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

/**
 * A scope over the ported service, the one SKU world it prices, and the graph it prices against.
 */
interface PortedCascade {
  readonly world: SkuWorld;
  readonly graph: PriceGroupGraph;
  readonly harness: PortedServiceHarness;
  readonly scope: PriceResolutionScope;

  /**
   * The price group the loaders hold, and therefore the one a request may name.
   */
  readonly priceGroup: ResolvedPriceGroup;
}

/**
 * Build a ported cascade over one account price group.
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
    // CFML parity [model/service/PriceGroupService.cfc:L146-L150]: the loop reassigns `returnRate`
    // on every match and never breaks, so a LATER matching rate overwrites an earlier one.
    const world = makeSkuWorld();
    const graph = makePriceGroupFixtures({
      roundValueAnswer: '9.99',
      // Both SKU-level rates are given the very same SKU, so both match on the same pass.
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
    // CFML parity [model/service/PriceGroupService.cfc:L83-L87]: the product-type variant's global
    // scan has the same shape and the same absent break, so the last rate carrying the global flag
    // wins.
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
    // [model/service/PriceGroupService.cfc:L146-L160].
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
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: level five recurses into the
    // parent price group through the PRODUCT variant rather than the SKU variant.
    // Preserved deliberately; do not fix without a product decision.
    //
    // So a rate that includes the SKU on an ANCESTOR group is never tested for and never found.
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

    // The ancestor chain is walked - it is only sku membership that is never tested on the way.
    expect(expectResolvedRate(result).priceGroupRateID).toBe(
      graph.rootGlobalRate.getPriceGroupRateID(),
    );
    expect(expectResolvedRate(result).globalFlag).toBe(true);
  });

  it('DOES test product membership where it never tests SKU membership', async () => {
    // The contrast that makes the asymmetry concrete rather than merely asserted.
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
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: the three `excluded*` collections
    // are counted by `getAppliesTo()` yet never consulted by the cascade.
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
      const scope = makePortedScope(world, harness, graph.siblingPriceGroup);

      const result = await dispatchPriceResolution(scope, {
        operation: 'getRateForSkuBasedOnPriceGroup',
        sku: world.identity,
        priceGroupID: graph.siblingPriceGroup.getPriceGroupID(),
      });

      selectedIDs.push(expectResolvedRate(result).priceGroupRateID);
      appliesToText.push(expectResolvedRate(result).appliesTo);
    }

    // The very same rate is selected either way: populating an exclusion changed no selection at
    // all.
    expect(selectedIDs[0]).toBe(
      withoutExclusion.appliesToIncludingAndExcludingRate.getPriceGroupRateID(),
    );
    expect(selectedIDs[1]).toBe(
      withExclusion.appliesToIncludingAndExcludingRate.getPriceGroupRateID(),
    );

    // And the published description did change, which is the gap: it now names exclusions the
    // selection ignored. The boundary reports the entity's own answer verbatim rather than
    // filtering it.
    expect(appliesToText[0]).not.toBe(appliesToText[1]);
    expect(appliesToText[1]).toBe(withExclusion.appliesToIncludingAndExcludingRate.getAppliesTo());
  });

  it('lets the service apply the rate rounding rule, and applies none of its own', async () => {
    // Two properties in one case, and they pull in opposite directions.
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
    // distinguishable outcomes, and the two-decimal presentation at
    // [model/service/PriceGroupService.cfc:L339] is the service's own last step.
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

    // CFML parity [model/service/PriceGroupService.cfc:L274-L297]: the candidate array is seeded
    // with `sku.getPrice()`, sorted ascending and answered at index one, so the lowest price wins
    // and the account price can never exceed the SKU's own.
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
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236]: the loop reads
    // `priceGroupSmartList.getPageRecords()[local.i]` while the counter declared at
    // [model/service/PriceGroupService.cfc:L235] is `i`.
    // Preserved deliberately; do not fix without a product decision.
    const { service } = makePriceGroupServiceDouble();

    expect(Object.keys(service)).not.toContain('getPriceGroupDataJSON');
    expect(ALL_OPERATIONS.map((operation): string => operation)).not.toContain(
      'getPriceGroupDataJSON',
    );
    expect(WITHHELD_PRICE_GROUP_MEMBERS).toContain('getPriceGroupDataJSON');
  });
});

// The amount-type strategy is reported, never re-derived.
//
// Driven with the service doubled, which is what makes these cases decisive: with nothing
// computing anything behind the boundary, any rounding.

describe('the amount-type strategy is reported, never re-derived', () => {
  /**
   * Serialise one rate through the entrypoint and hand back both the projection and the graph.
   */
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
    // only on the `percentageOff` branch.
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
    // The decisive assertion of this whole section.
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
    // applies.
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
    // No `default:` arm is invented anywhere for this value. The legacy switch has none, so an
    // unrecognised `amountType` silently passes the seed value through.
    const graph = makePriceGroupFixtures();
    const { serialised, json } = await serialiseRate(graph, graph.unrecognisedAmountTypeRate);

    expect(graph.unrecognisedAmountTypeRate.getAmountType()).toBeUndefined();
    expect(serialised.amountType).toBeUndefined();
    expect(json).not.toContain('"amountType"');
    expect(json).not.toContain(graph.unrecognisedAmountTypeColumnValue);
    // The rate still RESOLVED - an unrecognised type is not an error, and nothing here made it
    // one.
    expect(serialised.priceGroupRateID).toBe(
      graph.unrecognisedAmountTypeRate.getPriceGroupRateID(),
    );
  });

  it('separates a rate that applied without an amount from no rate applying at all', async () => {
    // `PriceGroupRate.amount` is a NULLABLE `big_decimal` [model/entity/PriceGroupRate.cfc:L54]
    // and `savePriceGroupRate` clears it outright on the `"new amount"` path
    // [model/service/PriceGroupService.cfc:L399-L400].
    //
    // JUDGMENT CALL: the fixture always builds an amount, and the column is `private readonly` on
    // the entity, so the null state is reached by making the rate ANSWER nothing for it - which is
    // exactly what an adapter hydrating a null column produces.
    const graph = makePriceGroupFixtures();
    const rate = graph.percentageOffRateWithRoundingRule;

    vi.spyOn(rate, 'getAmount').mockReturnValue(undefined);

    const { serialised, json } = await serialiseRate(graph, rate);
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

// Measured rounding outputs survive the boundary.
//
// `RoundingRuleService.roundValue()` [model/service/RoundingRuleService.cfc:L88-L175] is
// decimal-STRING manipulation rather than numeric rounding.

describe('measured rounding outputs survive the boundary unaltered', () => {
  it('carries all ten measured outputs through byte for byte', async () => {
    const graph = makePriceGroupFixtures();

    expect(graph.roundValueCases).toHaveLength(10);

    for (const measured of graph.roundValueCases) {
      const world = makeSkuWorld();
      const priceGroups = makePriceGroupServiceDouble({
        bestPriceGroup: graph.childPriceGroup,
        rateForSku: graph.percentageOffRateWithRoundingRule,
        // The service answers the MEASURED legacy output for this row; the boundary's only job is
        // to hand it over unchanged.
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

      // By VALUE, because `'12.350'` and `'12.35'` are the same amount of money and a string
      // comparison is the wrong test for "did this value survive".
      expectSameDecimalValue(amount, measured.expected);

      // And byte for byte against the value object's own rendering, which is the stricter half of
      // the claim: the boundary neither adds nor removes a digit of its own.
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L88] versus
      // [model/service/PriceGroupService.cfc:L339]: the legacy answers the STRING `numberFormat`
      // produces, so a measured row reads `10.00`, while the ported service answers a `Money`
      // built from that string.
      expect(amount).toBe(Money.fromDecimalString(measured.expected).toDecimalString());
    }
  });

  it('does not tidy the counter-intuitive rows into what arithmetic would suggest', async () => {
    // The four rows a "corrected" implementation gets wrong: `12.30` with `.99` yields `12.99`
    // rather than `11.99`, `7.42` with `9.99` yields `9.99`, `2.30` with `0.99` yields `0.99`, and
    // the DEFAULT expression `"0.00"`.
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
    // The two egress methods are not interchangeable, and this is where that matters.
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
    // A string, never a number: binary floating point is exactly what the value object exists to
    // keep away from a price, and a JSON number would reintroduce it at the last possible moment.
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

// Concern 3 - currency resolution, and absences that must never become zero.
//
// The three accessors read through the four-step cascade `Sku.getCurrencyDetails()`
// [model/entity/Sku.cfc:L367-L433], whose memo is INSTANCE-scoped and whose instances are
// REQUEST-scoped.

/**
 * Drive one currency accessor over one SKU, with no account established.
 */
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

/**
 * One entry of the materialised currency map, derived from the accessor that answers it.
 */
type CurrencyDetailView = NonNullable<ReturnType<ResolvedSku['getCurrencyDetails']>[string]>;

/**
 * Materialise the currency map a hydrated SKU carries.
 *
 * So the map is supplied here exactly as an adapter would have supplied it, and the real accessors
 * then apply their real guards.
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
    // Step 0 - the gate at [model/entity/Sku.cfc:L373].
    //
    // [model/entity/Sku.cfc:L375] also applies no active-flag restriction when it does filter the
    // currency list, and its sibling `getAllActiveCurrencyIDList` is the member that does; adding
    // one would be a money bug.
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
        expect(price).toBeUndefined();
        // Not zero, not an empty amount, and not a null a consumer can default away with one
        // operator.
        expect(json).not.toContain('"amount"');
        expect(json).not.toContain('"price"');
        expect(json).not.toContain('0.00');
      }
    }
  });

  it('distinguishes an ineligible currency from a currency lacking that particular price', async () => {
    // The two distinct absence paths, and the mechanical reason they differ.
    //
    // The map below is precisely that state: one entry for the non-base currency whose price is
    // present and whose list and renewal prices are absent.
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

    // Path one: the currency is in the map and carries a price.
    expect(present.price?.amount).toBeDefined();

    // Path two: the same currency, in the same map, with no list or renewal price recorded.
    expect(strandedList.price).toBeUndefined();
    expect(strandedRenewal.price).toBeUndefined();

    // Path three: a currency the map never held at all.
    expect(ineligible.price).toBeUndefined();
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
    expect(json).toBe('{"outcome":"currencyPrice"}');
    // Stated three ways because each is a distinct way of getting this wrong: a numeric zero, the
    // value object's own rendering of zero, and the two-decimal presentation of zero.
    expect(json).not.toContain(':0');
    expect(json).not.toContain(Money.fromDecimalString(ZERO_DECIMAL).toDecimalString());
    expect(json).not.toContain('"0.00"');
  });

  it('resolves the base currency through the setting rather than a literal in the boundary', async () => {
    // `getCurrencyCode()` [model/entity/Sku.cfc:L360-L365] merely memoises
    // `this.setting('skuCurrency')` and the default lives in the setting DECLARATION at
    // [model/service/SettingService.cfc:L221].
    const sku = makeSkuFixture();
    const baseCurrencyCode = sku.getCurrencyCode();

    expect(baseCurrencyCode.length).toBe(3);

    materialiseCurrencyDetails(sku, {
      [baseCurrencyCode]: {
        // [model/service/PriceGroupService.cfc:L382]: the base-currency entry's prices come from
        // the SKU's own columns, so the row identifier is empty -
        // [model/service/PriceGroupService.cfc:L412] is the cascade's only non-empty write.
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
    // Chosen so the two-decimal presentation is not a prefix of the full rendering: `17.996`
    // presents as `18.00`.
    const converted = Money.fromDecimalString('17.996');

    materialiseCurrencyDetails(sku, {
      [SECONDARY_CURRENCY_CODE]: {
        skuCurrencyID: '',
        price: converted,
        priceFormatted: converted.toFixed2(),
        // [model/service/PriceGroupService.cfc:L427]: a conversion marks the entry converted, and
        // a caller cannot tell a converted amount from an unconverted one - the legacy publishes
        // no such indicator and neither does this.
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
    // The presentation string the cascade recorded alongside the amount is not published: it is a
    // formatted view, and the two-decimal mask would round.
    expect(json).not.toContain(converted.toFixed2());
    expect(json).not.toContain('"converted"');
    expect(json).not.toContain('"priceFormatted"');
  });

  it('cannot let a response reach the live currency map', async () => {
    // [model/entity/Sku.cfc:L432] returns the LIVE memo reference rather than a copy, which is why
    // the ported accessor answers a `Readonly` projection and why instances are request-scoped.
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
    expect(Object.keys(price)).toStrictEqual(['amount']);
    // The map is answered by identity on every read and is unchanged by having been read through.
    expect(sku.getCurrencyDetails()).toBe(map);
    expect(JSON.stringify(Object.keys(map))).toBe(before);
  });

  it('gives two freshly built SKUs two separate maps', async () => {
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

// Concern 3 (continued) - response shaping.

describe('response shaping (concern 3)', () => {
  it('binds one instant per invocation and renders it as UTC', () => {
    // The injected clock, and the explicit UTC policy.
    //
    // The response ASSEMBLY itself lives past the composition root and is therefore out of this
    // suite's reach by the boundary decision recorded in the file header.
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
    // `no-store` is not a performance decision and carries no target of any kind: a resolved price
    // is account-scoped, so a shared cache must not be permitted to serve one account's price to
    // another.
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

    // `fields` is present only for a client-shaped failure that produced field-level complaints,
    // and is omitted entirely otherwise - never present and empty.
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
    // Why this is driven through the helper rather than through `handler`.
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
    // The same header set a mapped failure carries: the JSON content type and the account-scoped
    // `no-store`, and nothing invented alongside them.
    expect(served.headers).toStrictEqual(REQUIRED_SUCCESS_RESPONSE_HEADERS);

    const body: SuccessResponseBody<PriceResolutionResultDocument> = JSON.parse(
      requireDefined(served.body, 'body on the served response'),
    ) as SuccessResponseBody<PriceResolutionResultDocument>;

    // Four envelope members, no more: the correlation identifier a caller can quote, the two
    // closed route literals, and the capability's own payload nested under `result`.
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

// Concern 4 - error mapping.
//
// Two halves, and the split follows the composition-root boundary.

describe('error mapping (concern 4)', () => {
  it('uses the minimal status set for this authenticated, non-administrative surface', async () => {
    // 401 joins the client-shaped, route-not-found and server-shaped statuses. 403 does not: the
    // administrative document operation is withdrawn.
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
    // The detail is on the log stream and the body carries the fixed sentence.
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
          // A well-formed identity pair with an EMPTY `skuID`, so the schema complains about a
          // path the log may name while the planted product identifier is a value it must not.
          sku: { productID: PLANTED_INTERNAL_DETAIL, skuID: '' },
          priceGroupID: SENTINEL_PRICE_GROUP_ID,
        }),
      }),
      makeLambdaContext(),
    );

    expect(capture.text()).toContain('fieldPaths');
    expect(capture.text()).not.toContain(PLANTED_INTERNAL_DETAIL);
  });

  it('★★★ emits every diagnostic key on its served-request line LEGIBLY', async () => {
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
    // A BOOLEAN, deliberately: whether an account was established is the diagnostic an operator
    // needs, and the identifier itself is never a log value.
    expect(line).toContain('"accountEstablished":true');
    // The correlation identifier, which was one of only two legible members before the policy
    // change.
    expect(line).toContain(REQUEST_ID);
    expect(line).not.toContain('[REDACTED]');
  });

  it('★★★ still redacts what must stay redacted, on the very same policy', () => {
    // Admitting four diagnostic keys must not have widened the policy into "log whatever a handler
    // hands over".
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
    // The dispatcher catches nothing, classifies nothing and repairs nothing.
    const failures: readonly unknown[] = [
      new Error(MISSING_METHOD_CONTRACT_MESSAGE),
      new Error(UNRECOGNISED_FRAMEWORK_MESSAGE),
      new Error(`connection failed reaching ${PLANTED_INTERNAL_DETAIL}`),
      'a thrown string, which is not an Error at all',
    ];

    for (const thrown of failures) {
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

    // Narrowed by `instanceof`, never by a conversion, and read off the error itself: `message` is
    // a non-enumerable own property, so a structural read would silently miss it.
    expect(raised.message).toBe(MISSING_METHOD_CONTRACT_MESSAGE);
    expect(MISSING_METHOD_CONTRACT_MESSAGE).toContain('does not exists');
    // The DIFFERENT variant thrown by `invokeMethod` diverges on four counts - a different opening
    // clause, no `()`, correct grammar and no trailing " entity.".
    expect(UNRECOGNISED_FRAMEWORK_MESSAGE).not.toContain('does not exists');
    expect(UNRECOGNISED_FRAMEWORK_MESSAGE).not.toContain(' entity.');
  });

  it('lets a failure from any exposed member out, not just from one', async () => {
    for (const member of EXPOSED_PRICE_GROUP_MEMBERS) {
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

describe('isolation between invocations (A2)', () => {
  it('builds a fresh, unshared graph on every fixture call', () => {
    const first = makePriceGroupFixtures();
    const second = makePriceGroupFixtures();

    expect(first.childPriceGroup).not.toBe(second.childPriceGroup);
    expect(first.skuLevelRateLastMatch).not.toBe(second.skuLevelRateLastMatch);
    expect(first.roundingRuleValueRounder).not.toBe(second.roundingRuleValueRounder);
    // Identifiers collide by design - the prefix defaults - so identity, not equality, is the
    // test.
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
    // The same doubled world, driven twice with different answers, produces two independent
    // results - and the second invocation sees nothing the first put anywhere.
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
    // The price group each invocation was answered about is the one it named, loaded per
    // invocation.
    expect(dear.calls[0]?.args[1]).toBe(graph.childPriceGroup);
    expect(cheap.calls[0]?.args[1]).toBe(graph.childPriceGroup);
  });

  it('holds the account association per harness, so no mutation can outlive a request', async () => {
    // The cfml-to-typescript trap this guards.
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

    // The first harness saw the subscription reach-through; the second never did, and its report
    // is not influenced by the first harness's appended member.
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

// Concern 7 - the lambda entrypoint, driven into the real graph.
//
// How the graph behind these cases is built, because it is not a hand-written double.
//
// What is answered from data is exactly the two catalogue reads and the nine price-group members,
// installed on the CLASS PROTOTYPES the real instances inherit from.

/**
 * A configuration source that answers the five keys with no default, and nothing else.
 */
const ENTRYPOINT_ENVIRONMENT: EnvironmentSource = Object.freeze({
  DB_HOST: '127.0.0.1',
  DB_USER: 'unused-by-this-suite',
  DB_PASSWORD: 'unused-by-this-suite',
  // `verify-ca`, not `disabled`: the executor is injected so no pool is built, and `disabled`
  // would be a cleartext claim this fixture does not need to make.
  DB_TLS_MODE: 'verify-ca',
  DB_TLS_CA: '-----BEGIN CERTIFICATE-----\nZmFrZS1jZXJ0aWZpY2F0ZS1ib2R5\n-----END CERTIFICATE-----',
  DB_DIALECT: 'mySql',
  // `convertCurrency` with no table at all now REFUSES rather than answering at par: an absent
  // table is the legacy's own cold-start failure state
  // [model/service/CurrencyService.cfc:L104-L131].
  ECB_REFERENCE_RATES: 'USD=1.0850,GBP=0.8520,JPY=163.41',
  // Required whenever the table is set, so its age can be assessed. A fixed instant keeps the
  // suite deterministic; staleness reporting is pinned in the bootstrap suite, not here.
  ECB_RATES_RETRIEVED_AT: '2026-08-04T00:00:00Z',
});

/**
 * The statement executor the real graph is assembled over.
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
 * The recorded inputs are what let one case assert that the root receives EXACTLY `{ accountID }`
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

/**
 * One captured log line, as the sink received it and as it parses.
 */
interface SinkLine {
  readonly raw: string;
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

/**
 * A per-case recording sink, and the lines it collected.
 */
interface SinkRecorder {
  readonly logger: ReturnType<typeof processLogger.withSink>;
  readonly lines: readonly SinkLine[];
  /**
   * Every RAW line joined, so a leak anywhere in any payload is detectable.
   */
  readonly text: () => string;
}

/**
 * Build a recording logger through the published sink seam.
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

/**
 * Everything one entrypoint case drives the handler with.
 */
interface EntrypointBed {
  readonly invoke: PriceResolutionLambdaHandlerRef;
  readonly root: RecordingCompositionRoot;
  readonly executor: EntrypointExecutor;
  readonly emitted: SinkRecorder;
}

/**
 * The entrypoint's own published shape, reached structurally so it cannot drift from the subject.
 */
type PriceResolutionLambdaHandlerRef = ReturnType<typeof createPriceResolutionHandler>;

/**
 * Assemble the real graph, wrap it in the recorder, and build the handler over both.
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
 * Programme the read-only entity loads the current request scope publishes.
 *
 * The real composition root owns the repository instances and closes over them in
 * `RequestScope.entityLoaders`.
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

/**
 * The success envelope, narrowed by a predicate rather than asserted.
 */
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

// The composition memo is module state, and `appConfig` carries its own.
beforeEach(() => {
  resetCompositionRoot();
  appConfig.reset();
});

afterEach(() => {
  resetCompositionRoot();
  appConfig.reset();
});

describe('the Lambda entrypoint, through its dependency seam', () => {
  it('publishes the factory, the entrypoint built from it, and the dispatcher', () => {
    // The seam itself: a two-parameter handler, buildable with no arguments, which is exactly how
    // the production line at the foot of the subject builds it.
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
    // Scope reads the instant once itself - no feed host, and no allow-list: a price request
    // cannot mint an origin for a capability that renders no feed.
    expect(bed.root.scopeInputs).toHaveLength(1);
    expect(bed.root.scopeInputs[0]).toStrictEqual({
      accountID: ACCOUNT_ID,
      adminAccountFlag: false,
    });
    // The account reached the service, which is what makes the plumbing assertion above
    // non-vacuous.
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
    // A BOOLEAN, never AN IDENTIFIER. The account is reported as established or not; the
    // identifier itself appears in no line, in no payload, at no level.
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
        // `accountId`, not `accountID`. A case-sensitive index would treat this request as
        // anonymous and answer `noAuthenticatedAccount`, so the assertion below is what pins the
        // CFML struct-key read the subject performs.
        authorizer: { accountId: ACCOUNT_ID },
      }),
      makeLambdaContext(),
    );

    expect(response.statusCode).toBe(200);
    expect(bed.root.scopeInputs[0]).toStrictEqual({
      accountID: ACCOUNT_ID,
      adminAccountFlag: false,
    });
    expect(readSuccessEnvelope(response).result['outcome']).toBe('price');
  });

  it('★★★ serves the LOGGED-OUT current-account arm through the REAL service and composition', async () => {
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
        // No AUTHORIZER CONTEXT at all, stated explicitly because the event builder's default is
        // an authenticated session.
        authorizer: null,
      }),
      makeLambdaContext(),
    );
    const envelope = readSuccessEnvelope(response);

    expect(response.statusCode).toBe(200);
    // The scope opened with an empty account, which is what makes the service take the else arm.
    expect(bed.root.scopeInputs).toHaveLength(1);
    expect(bed.root.scopeInputs[0]).toStrictEqual({
      accountID: undefined,
      adminAccountFlag: false,
    });
    // The sku's own price, not a zero and not an absence.
    expect(envelope.result['outcome']).toBe('price');
    expect(readObject(envelope.result['price'], 'the served price')['amount']).toBe(
      world.sku.getPrice().toDecimalString(),
    );

    // The log line reports the account as not established, and no identifier appears anywhere.
    const served = requireDefined(
      bed.emitted.lines.find((line): boolean => line.message === 'price resolution request served'),
      'the success log line',
    );
    expect(served.context['accountEstablished']).toBe(false);
    expect(bed.emitted.text()).not.toContain(ACCOUNT_ID);
  });

  it('★★★ answers an EMPTY currencyCode with an omitted price rather than a refusal', async () => {
    // All three accessors are driven, because all three shared the schema.
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
    const world = makeSkuWorld();
    const bed = await openEntrypoint();

    // The two READS are answered the way the database answers them - folding the key - because
    // `SwProduct.productID` is compared by MySQL under its own collation and not in this process.
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
    expect(bed.root.scopeInputs[0]).toStrictEqual({
      accountID: ACCOUNT_ID,
      adminAccountFlag: false,
    });
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
    // Every request body the schema admits, one per arm of the discriminated union.
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
          // A failure carrying everything a leak would expose: statement text, a bound value, a
          // file path and a stack. None of it may reach the response body.
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

    // A valid route that failed inside, which is the arm no case could reach before this seam
    // existed.
    expect(response.statusCode).toBe(500);
    expect(envelope.category).toBe('unrecognized');
    expect(envelope.message).toBe(GENERIC_FAILURE_MESSAGE);
    expect(envelope.requestId).toBe(REQUEST_ID);
    // Nothing about the failure crosses into the body: not the statement, not the bound value, not
    // the path, not the stack, not the class name.
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

    // Recorded before the request: whatever tier one issued while the graph was assembled is not
    // this request's doing, and the delta is what the assertion below is about.
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
    // No STATEMENT for the WHOLE REQUEST. Address-zone state is promotion-scoped, and every entity
    // read plus each price-group member is answered through the injected seams above.
    const requestStatements = bed.executor.statements.slice(afterBoot);
    expect(requestStatements).toEqual([]);
    // No pool exists to open either: the executor was injected, so
    // `getPreparedStatementExecutor()` is never reached, no socket is created and no `DB_*`
    // variable is read from the process environment.
    expect(bed.executor.statements.filter((sql): boolean => sql.includes('SwSku'))).toEqual([]);
  });
});
