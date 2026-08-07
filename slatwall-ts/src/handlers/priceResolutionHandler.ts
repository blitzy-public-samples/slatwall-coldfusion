// The price resolution Lambda entrypoint.
//
// A NET-NEW primary adapter over the price-group and currency resolution surface of
// `../services/priceGroupService.js` and `../domain/ports/currencyConverter.js`.
//
// The five-level cascade [model/service/PriceGroupService.cfc:L140-L181] is neither reordered,
// short-circuited, memoized nor "optimised" here.
//
// Three deliberate non-exposures, each argued where it is decided:.

import { z } from 'zod';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { bootstrapCompositionRoot } from './bootstrap.js';
import type {
  CompositionRoot,
  PriceResolutionCapability,
  RequestScope,
  RequestScopeInput,
  SkuIdentity,
} from './bootstrap.js';
import {
  containsPrototypeMemberKey,
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  PROTOTYPE_MEMBER_FIELD_ISSUE,
  resolveRequestPrincipal,
  resolveServerRequestId,
  routeDiagnosticLabel,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import type { ErrorMappingContext, InvalidRequestReason, MappedFieldIssue } from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import type { RouteAction } from './router.js';
import type { CurrencyConverter } from '../domain/ports/currencyConverter.js';
import type { CurrentAccountContext } from '../domain/ports/priceGroupRepository.js';
import { toCurrencyCode } from '../domain/valueObjects/currencyCode.js';
import { Money } from '../domain/valueObjects/money.js';
import { cfEquals } from '../lib/cfml/struct.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';

// Section 1 - the request contract.
//
// Closed, typed criteria - and nothing resembling a smart list.

/**
 * The operations this entrypoint exposes.
 *
 * A string-literal union rather than the TypeScript enumeration construct, matching `./router.js`:
 * a union is erased on emit, so nothing survives into the bundle as a runtime object.
 *
 * No `sequence`, `phase`, `runAfter`, `pipeline` or `skipPriceGroups` member exists anywhere in
 * this file.
 */
export type PriceResolutionOperation =
  | 'getRateForProductTypeBasedOnPriceGroup'
  | 'getRateForProductBasedOnPriceGroup'
  | 'getRateForSkuBasedOnPriceGroup'
  | 'calculateSkuPriceBasedOnCurrentAccount'
  | 'calculateSkuPriceBasedOnAccount'
  | 'calculateSkuPriceBasedOnPriceGroup'
  | 'calculateSkuPriceBasedOnPriceGroupRate'
  | 'getBestPriceGroupDetailsBasedOnSkuAndAccount'
  | 'getPriceByCurrencyCode'
  | 'getListPriceByCurrencyCode'
  | 'getRenewalPriceByCurrencyCode'
  | 'convertCurrency';

// The two defects behind it are neither repaired nor hidden, only taken off the http surface.

/**
 * How a request names the SKU every SKU-taking operation needs: by identifier.
 *
 * Both identifiers are OPAQUE: they are keys, never handles, and nothing derives anything from
 * their content.
 */
export type PriceResolutionSkuIdentity = SkuIdentity;

/**
 * Whether a decimal numeral is one `Money` will accept.
 *
 * The reason to ask at all is the STATUS a malformed numeral earns.
 */
function isMoneyNumeral(value: string): boolean {
  try {
    Money.fromDecimalString(value);

    return true;
  } catch {
    return false;
  }
}

/**
 * The SKU identity, as a schema. Both identifiers are required and neither may be empty.
 */
const SKU_IDENTITY_SCHEMA = z.strictObject({
  productID: z.string().min(1),
  skuID: z.string().min(1),
});

/**
 * An identifier a caller names to bind one entity argument.
 */
const IDENTIFIER_SCHEMA = z.string().min(1);

/**
 * A currency code as the three SKU accessors take one: any string, present.
 *
 * `Sku.getPriceByCurrencyCode(currencyCode)` [model/entity/Sku.cfc:L269-L273] takes a plain string
 * and answers a struct lookup: a code that is not in the SKU's currency map yields nothing.
 *
 * PRESENCE is still REQUIRED, because the ported signature declares the parameter: a request that
 * omits `currencyCode` entirely is refused with that member path.
 */
const ACCESSOR_CURRENCY_CODE_SCHEMA = z.string();

/**
 * A currency code as `CurrencyConverter.convertCurrency` takes one: exactly three characters.
 *
 * That parameter is typed `CurrencyCode`, a brand `toCurrencyCode` only mints for a
 * three-character value and otherwise REJECTS.
 */
const CONVERTER_CURRENCY_CODE_SCHEMA = z.string().length(3);

/**
 * The whole request surface, as one strict discriminated union.
 *
 * Discriminating on `operation` is what makes the per-operation criteria CLOSED: a body naming
 * `convertCurrency` and carrying a `sku` is rejected.
 */
const PRICE_RESOLUTION_REQUEST_SCHEMA = z.discriminatedUnion('operation', [
  // All three are SYNCHRONOUS on the service and are consumed synchronously - see section.
  z.strictObject({
    operation: z.literal('getRateForProductTypeBasedOnPriceGroup'),
    productTypeID: IDENTIFIER_SCHEMA,
    priceGroupID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getRateForProductBasedOnPriceGroup'),
    productID: IDENTIFIER_SCHEMA,
    priceGroupID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getRateForSkuBasedOnPriceGroup'),
    sku: SKU_IDENTITY_SCHEMA,
    priceGroupID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnPriceGroup'),
    sku: SKU_IDENTITY_SCHEMA,
    priceGroupID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnPriceGroupRate'),
    sku: SKU_IDENTITY_SCHEMA,
    priceGroupRateID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnCurrentAccount'),
    sku: SKU_IDENTITY_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnAccount'),
    sku: SKU_IDENTITY_SCHEMA,
    accountID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getBestPriceGroupDetailsBasedOnSkuAndAccount'),
    sku: SKU_IDENTITY_SCHEMA,
    accountID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getPriceByCurrencyCode'),
    sku: SKU_IDENTITY_SCHEMA,
    currencyCode: ACCESSOR_CURRENCY_CODE_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getListPriceByCurrencyCode'),
    sku: SKU_IDENTITY_SCHEMA,
    currencyCode: ACCESSOR_CURRENCY_CODE_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getRenewalPriceByCurrencyCode'),
    sku: SKU_IDENTITY_SCHEMA,
    currencyCode: ACCESSOR_CURRENCY_CODE_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('convertCurrency'),
    amount: z.string().min(1).refine(isMoneyNumeral, { message: 'not a plain decimal numeral' }),
    originalCurrencyCode: CONVERTER_CURRENCY_CODE_SCHEMA,
    convertToCurrencyCode: CONVERTER_CURRENCY_CODE_SCHEMA,
  }),
]);

/**
 * One validated request.
 *
 * Inferred from the schema rather than declared alongside it, so the validator and the type cannot
 * disagree.
 */
export type PriceResolutionRequest = z.infer<typeof PRICE_RESOLUTION_REQUEST_SCHEMA>;

/**
 * The one operation this route serves to a caller it cannot identify.
 */
const ANONYMOUS_PERMITTED_OPERATIONS: readonly PriceResolutionOperation[] = Object.freeze([
  'calculateSkuPriceBasedOnCurrentAccount',
]);

// Section 2 - the response contract.
//
// `getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, so an
// unknown currency yields nothing.
//
// Not `0`, and not any other number. * not `null`, which a consumer can turn into `0` with a
// single `??`. * not an empty or zero `Money`.

/**
 * Why an operation produced no value.
 *
 * A CLOSED union of tokens, for the same reason `./errorMapper.js` closes `InvalidRequestReason`:
 * a caller-supplied or free-text reason string is how an internal detail - a driver message, a
 * resolved path.
 */
export type UnresolvedReason =
  /**
   * No authenticated account was established for this request, and the operation needs one.
   *
   * The target's representation of the legacy `else` arm at
   * [model/service/PriceGroupService.cfc:L266].
   */
  | 'noAuthenticatedAccount'
  /**
   * The request named an account other than the one established by the authorizer.
   *
   * Kept distinct from `noAuthenticatedAccount`: one means no principal exists, while this one
   * means a principal exists and the explicit service argument does not name it.
   */
  | 'accountNotTheAuthenticatedAccount'
  /**
   * No price group was resolved for this SKU and account, so the best-price-group report names
   * none.
   *
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` seeds its report with the SKU's own price and
   * leaves the price group unset unless one beat it
   * [model/service/PriceGroupService.cfc:L347-L358].
   */
  | 'noPriceGroupResolvedForSkuAndAccount'
  /**
   * The cascade ran and no rate applies.
   *
   * The legacy contract, exactly: [model/service/PriceGroupService.cfc:L96-L98],
   * [model/service/PriceGroupService.cfc:L135-L137] and
   * [model/service/PriceGroupService.cfc:L178-L180] each read
   * `if(!isNull(returnRate)) return returnRate;` with no `else`.
   */
  | 'noRateApplies'
  /**
   * An identifier the request named matches no row.
   *
   * Each token names which identifier failed, so a caller supplying two identifiers in one body
   * learns which to correct without either being echoed back.
   */
  | 'productTypeNotFound'
  | 'productNotFound'
  | 'skuNotFound'
  | 'priceGroupNotFound'
  | 'priceGroupRateNotFound';

/**
 * A monetary value on the wire.
 */
export interface SerializedMoney {
  readonly amount: string;
}

// It was `{resolved: true, amount} | {resolved: false, reason}`, and the section header above
// argued for it on the grounds that a load-bearing absence must survive the wire.
//
// A monetary value that may not exist is now `SerializedMoney | undefined`, and `JSON.stringify`
// omits it.

/**
 * The winning price group, as an opaque identifier.
 *
 * The identifier and nothing else, for the same reason `PriceGroupAppliedIntent` carries one:
 * publishing the entity would reopen the boundary the intent types exist to close.
 */
export type OptionalSerializedPriceGroup =
  | { readonly resolved: true; readonly priceGroupID: string }
  | { readonly resolved: false; readonly reason: UnresolvedReason };

/**
 * A price-group rate the cascade selected, projected onto the four facts a caller can act on plus
 * the two that make the rounding asymmetry auditable.
 *
 * `roundingRuleConfigured` is a boolean, and no rounding is performed to produce it.
 *
 * `amountType` is reported as the service reports it - the raw column value, which may hold any
 * spelling the database holds, and which is `undefined` when the column is null.
 */
export interface SerializedPriceGroupRate {
  /**
   * The rate's identifier.
   */
  readonly priceGroupRateID: string;

  /**
   * Whether this is the price group's global rate [model/entity/PriceGroupRate.cfc:L57].
   */
  readonly globalFlag: boolean;

  /**
   * The rate's amount, OMITTED when the `big_decimal` column is null.
   */
  readonly amount?: SerializedMoney | undefined;

  /**
   * The amount type, or `undefined` when the column is null.
   */
  readonly amountType: string | undefined;

  /**
   * `PriceGroupRate.getAmountFormatted()` [model/entity/PriceGroupRate.cfc:L262], verbatim.
   */
  readonly amountFormatted: string;

  /**
   * `PriceGroupRate.getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95], verbatim.
   *
   * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: the three `excluded*` collections are
   * counted by `getAppliesTo()` yet never consulted by the cascade.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly appliesTo: string;

  /**
   * Whether a rounding rule is attached to this rate. See the type's own note.
   */
  readonly roundingRuleConfigured: boolean;
}

/**
 * A rate, or the documented absence of one.
 */
export type OptionalSerializedPriceGroupRate =
  | { readonly resolved: true; readonly rate: SerializedPriceGroupRate }
  | { readonly resolved: false; readonly reason: UnresolvedReason };

/**
 * What one operation produced.
 */
export type PriceResolutionResult =
  /**
   * A price the service computed.
   */
  | { readonly outcome: 'price'; readonly price: SerializedMoney }
  /**
   * One of the three currency accessors, whose absence is load-bearing.
   *
   * Both legacy causes of a miss produce the same absence, deliberately: the currency may be
   * absent from the SKU's map [model/entity/Sku.cfc:L270], or present with the `listPrice` /
   * `renewalPrice` sub-key unset [model/service/PriceGroupService.cfc:L276].
   */
  | { readonly outcome: 'currencyPrice'; readonly price?: SerializedMoney | undefined }
  /**
   * The best-price-group report [model/service/PriceGroupService.cfc:L343-L362].
   */
  | {
      readonly outcome: 'bestPriceGroupDetails';
      readonly price: SerializedMoney;
      readonly priceGroup: OptionalSerializedPriceGroup;
    }
  /**
   * A cascade entry point's selection.
   */
  | { readonly outcome: 'priceGroupRate'; readonly rate: OptionalSerializedPriceGroupRate }

  /**
   * Nothing was produced, and this is why. Answered successfully, with no status invented.
   */
  | { readonly outcome: 'unresolved'; readonly reason: UnresolvedReason };

/**
 * The capability-specific payload of a successful response.
 *
 * `requestId` is not duplicated here: the shared envelope carries it once, at the top level, and
 * echoing it twice would let the two copies disagree.
 */
export interface PriceResolutionResultDocument {
  /**
   * The operation that ran, echoed so a response is self-describing.
   */
  readonly operation: PriceResolutionOperation;

  /**
   * The instant this request resolved against, as UTC ISO-8601.
   */
  readonly resolvedAt: string;

  /**
   * What the operation produced.
   */
  readonly result: PriceResolutionResult;
}

// Section 3 - the request-tier surface this module reads.
//
// `updateOrderAmountsWithPriceGroupsThenPromotions` - the composed operation that owns the
// cross-service ordering constraint - is not on this interface.
//
// No domain entity type is imported, and that is deliberate.

/**
 * Exactly what this entrypoint reads from one request scope.
 *
 * `RequestScope` satisfies it structurally, so `handler` passes the real scope straight in.
 */
export interface PriceResolutionScope {
  /**
   * The instant this request resolves against. See {@link PriceResolutionResponseBody.resolvedAt}.
   */
  readonly now: RequestScope['now'];

  /**
   * The explicit replacement for the legacy ambient request scope.
   *
   * [model/service/PriceGroupService.cfc:L263-L264] reaches the request scope through two
   * accessors in adjacent lines - `getSlatwallScope().getLoggedInFlag()` at L263 and
   * `getHibachiScope().getAccount()` at L264.
   */
  readonly currentAccountContext: CurrentAccountContext;

  /**
   * The READ-ONLY loads by identifier this entrypoint binds its service arguments from.
   *
   * `RequestEntityLoaders`' count, not this module's, and it moved to seven when the catalog
   * capability needed a brand and an option set.
   *
   * `RequestEntityLoaders` publishes exactly what binding needs and nothing else: a load per
   * entity a handler has to bind, each answering one identifier, with no save.
   */
  readonly entityLoaders: RequestScope['entityLoaders'];

  /**
   * The member the loaders above deliberately do not carry.
   */
  readonly priceGroupEntitlements: RequestScope['priceGroupEntitlements'];

  /**
   * The eight price-group members this entrypoint exposes, and no others.
   */
  readonly priceGroupService: Pick<
    PriceResolutionCapability,
    | 'getRateForProductTypeBasedOnPriceGroup'
    | 'getRateForProductBasedOnPriceGroup'
    | 'getRateForSkuBasedOnPriceGroup'
    | 'calculateSkuPriceBasedOnCurrentAccount'
    | 'calculateSkuPriceBasedOnAccount'
    | 'calculateSkuPriceBasedOnPriceGroup'
    | 'calculateSkuPriceBasedOnPriceGroupRate'
    | 'getBestPriceGroupDetailsBasedOnSkuAndAccount'
  >;

  /**
   * One of the currency port's three members - see section 6.13 for why the other two are
   * withheld.
   */
  readonly currencyConverter: Pick<CurrencyConverter, 'convertCurrency'>;
}

/**
 * The product entity type, derived from the load that returns one.
 */
type ResolvedProduct = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getProductByProductID']>>
>;

/**
 * The product-type entity type, derived from the load that returns one.
 */
type ResolvedProductType = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getProductTypeByProductTypeID']>>
>;

/**
 * The SKU entity type, derived from the load that returns one with its product wired through.
 */
type ResolvedSku = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getSkuBySkuIdentity']>>
>['sku'];

/**
 * The price-group entity type, derived from the load that returns one.
 */
type ResolvedPriceGroup = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getPriceGroup']>>
>;

/**
 * The rate entity type, derived from the load that returns one.
 */
type ResolvedPriceGroupRate = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getPriceGroupRate']>>
>;

// Section 4 - argument binding.
//
// Turning the identifiers a request names into the entities a ported signature already declares.
//
// What replaces them is four one-line loads and no control flow worth naming.

/**
 * The SKU a request named, with its product, or nothing.
 */
async function loadSku(
  scope: PriceResolutionScope,
  identity: PriceResolutionSkuIdentity,
): Promise<{ readonly product: ResolvedProduct; readonly sku: ResolvedSku } | undefined> {
  return scope.entityLoaders.getSkuBySkuIdentity(identity);
}

/**
 * The price group a request named and is entitled to, or nothing.
 *
 * The order is load-then-decide, and the cost of that is stated.
 */
async function resolveNamedPriceGroup(
  scope: PriceResolutionScope,
  priceGroupID: string,
): Promise<ResolvedPriceGroup | undefined> {
  const priceGroup = await scope.entityLoaders.getPriceGroup(priceGroupID);

  if (priceGroup === undefined) {
    return undefined;
  }

  // Tested against the identifier the LOADED ROW carries rather than the caller's argument, so the
  // decision is keyed on what the database resolved.
  return (await scope.priceGroupEntitlements.isEntitledToPriceGroup(priceGroup.getPriceGroupID()))
    ? priceGroup
    : undefined;
}

/**
 * The price-group rate a request named and is entitled to, or nothing.
 *
 * Entitlement is decided by the rate's OWNING price group, which the rate already carries
 * [model/entity/PriceGroupRate.cfc:L67] - see {@link
 * PriceGroupEntitlements.isEntitledToPriceGroupRate}.
 */
async function resolveNamedPriceGroupRate(
  scope: PriceResolutionScope,
  priceGroupRateID: string,
): Promise<ResolvedPriceGroupRate | undefined> {
  const rate = await scope.entityLoaders.getPriceGroupRate(priceGroupRateID);

  if (rate === undefined) {
    return undefined;
  }

  return (await scope.priceGroupEntitlements.isEntitledToPriceGroupRate(rate)) ? rate : undefined;
}

/**
 * The product type a request named, or nothing.
 */
async function loadProductType(
  scope: PriceResolutionScope,
  productTypeID: string,
): Promise<ResolvedProductType | undefined> {
  return scope.entityLoaders.getProductTypeByProductTypeID(productTypeID);
}

/**
 * The product a request named, or nothing.
 */
async function loadProduct(
  scope: PriceResolutionScope,
  productID: string,
): Promise<ResolvedProduct | undefined> {
  return scope.entityLoaders.getProductByProductID(productID);
}

/**
 * The SKU and the price group a request named, or the reason one of them is missing.
 *
 * Revision ordered its work so that an account failure pre-empted a selector failure, on the
 * grounds that it saved two statements; there is nothing to trade off here.
 */
async function resolveCascadeInputs(
  scope: PriceResolutionScope,
  identity: PriceResolutionSkuIdentity,
  priceGroupID: string,
): Promise<
  | {
      readonly bound: true;
      readonly sku: ResolvedSku;
      readonly priceGroup: ResolvedPriceGroup;
    }
  | { readonly bound: false; readonly reason: UnresolvedReason }
> {
  const loaded = await loadSku(scope, identity);

  if (loaded === undefined) {
    return { bound: false, reason: 'skuNotFound' };
  }

  const priceGroup = await resolveNamedPriceGroup(scope, priceGroupID);

  if (priceGroup === undefined) {
    return { bound: false, reason: 'priceGroupNotFound' };
  }

  return { bound: true, sku: loaded.sku, priceGroup };
}

/**
 * The result of binding an explicit account argument to the authenticated request principal.
 */
type AdmittedAccount =
  | { readonly admitted: true; readonly accountID: string }
  | {
      readonly admitted: false;
      readonly reason: 'noAuthenticatedAccount' | 'accountNotTheAuthenticatedAccount';
    };

/**
 * Admit an explicit account argument only when it names the server-established principal.
 *
 * The ported methods declare this argument, so the wire contract represents it rather than
 * silently substituting another value.
 */
function admitNamedAccount(scope: PriceResolutionScope, claimed: string): AdmittedAccount {
  const authenticated = scope.currentAccountContext.accountID;

  if (authenticated === undefined) {
    return { admitted: false, reason: 'noAuthenticatedAccount' };
  }

  if (!cfEquals(claimed, authenticated)) {
    return { admitted: false, reason: 'accountNotTheAuthenticatedAccount' };
  }

  return { admitted: true, accountID: authenticated };
}

// Section 5 - the explicit request context (T6), and the injected clock.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L266, L274]: `sku` is referenced UNSCOPED at
// both lines while the surrounding code uses `arguments.sku`. Recorded, and not repaired: it is
// latent legacy sloppiness in a body this module does not own.

/**
 * Build the per-invocation scope input.
 *
 * Reads the wall clock once at its own creation and binds that single instant across every
 * date-dependent read of the request, so this file calls no `new Date()` at all.
 *
 * The direction is unchanged, which is the part that matters: absent still means `false`, and
 * `false` is still the closed arm.
 */
function buildRequestScopeInput(
  accountID: string | undefined,
  adminAccountFlag: boolean,
): RequestScopeInput {
  return { accountID, adminAccountFlag };
}

// Section 6 - the dispatcher.

/**
 * Serialise a monetary value at full precision, through `Money`'s own surface.
 */
function serializeMoney(value: Money): SerializedMoney {
  return { amount: value.toDecimalString() };
}

/**
 * Serialise a monetary value that may legitimately not exist.
 */
function serializeOptionalMoney(value: Money | undefined): SerializedMoney | undefined {
  return value === undefined ? undefined : serializeMoney(value);
}

/**
 * Project a rate onto the wire. Reads the entity's own accessors and computes nothing.
 */
function serializePriceGroupRate(rate: ResolvedPriceGroupRate): SerializedPriceGroupRate {
  return {
    priceGroupRateID: rate.getPriceGroupRateID(),
    globalFlag: rate.getGlobalFlag(),
    // The rate's `amount` column is nullable, so its absence is carried structurally too - under
    // its own reason token, because a rate that applied without an amount is not the same state as
    // no rate applying.
    amount: serializeOptionalMoney(rate.getAmount()),
    amountType: rate.getAmountType(),
    amountFormatted: rate.getAmountFormatted(),
    appliesTo: rate.getAppliesTo(),
    // A BOOLEAN, and no rounding is invoked to produce it - see {@link SerializedPriceGroupRate}.
    roundingRuleConfigured: rate.getRoundingRule() !== undefined,
  };
}

/**
 * Serialise a cascade selection, preserving the legacy's no-`else` null contract.
 */
function serializeOptionalPriceGroupRate(
  rate: ResolvedPriceGroupRate | undefined,
): OptionalSerializedPriceGroupRate {
  return rate === undefined
    ? { resolved: false, reason: 'noRateApplies' }
    : { resolved: true, rate: serializePriceGroupRate(rate) };
}

/**
 * Run one validated request against one request scope.
 */
export async function dispatchPriceResolution(
  scope: PriceResolutionScope,
  request: PriceResolutionRequest,
): Promise<PriceResolutionResult> {
  switch (request.operation) {
    case 'getRateForProductTypeBasedOnPriceGroup': {
      const productType = await loadProductType(scope, request.productTypeID);

      if (productType === undefined) {
        return { outcome: 'unresolved', reason: 'productTypeNotFound' };
      }

      const priceGroup = await resolveNamedPriceGroup(scope, request.priceGroupID);

      if (priceGroup === undefined) {
        return { outcome: 'unresolved', reason: 'priceGroupNotFound' };
      }

      return {
        outcome: 'priceGroupRate',
        rate: serializeOptionalPriceGroupRate(
          scope.priceGroupService.getRateForProductTypeBasedOnPriceGroup(productType, priceGroup),
        ),
      };
    }
    case 'getRateForProductBasedOnPriceGroup': {
      const product = await loadProduct(scope, request.productID);

      if (product === undefined) {
        return { outcome: 'unresolved', reason: 'productNotFound' };
      }

      const priceGroup = await resolveNamedPriceGroup(scope, request.priceGroupID);

      if (priceGroup === undefined) {
        return { outcome: 'unresolved', reason: 'priceGroupNotFound' };
      }

      return {
        outcome: 'priceGroupRate',
        rate: serializeOptionalPriceGroupRate(
          scope.priceGroupService.getRateForProductBasedOnPriceGroup(product, priceGroup),
        ),
      };
    }

    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: level five recurses into the
    // parent price group through the PRODUCT variant rather than the SKU variant.
    // Preserved deliberately; do not fix without a product decision.
    //
    // So a rate that includes the SKU on an ANCESTOR price group is never found.
    case 'getRateForSkuBasedOnPriceGroup': {
      const bound = await resolveCascadeInputs(scope, request.sku, request.priceGroupID);

      if (!bound.bound) {
        return { outcome: 'unresolved', reason: bound.reason };
      }

      return {
        outcome: 'priceGroupRate',
        rate: serializeOptionalPriceGroupRate(
          scope.priceGroupService.getRateForSkuBasedOnPriceGroup(bound.sku, bound.priceGroup),
        ),
      };
    }
    case 'calculateSkuPriceBasedOnPriceGroup': {
      const bound = await resolveCascadeInputs(scope, request.sku, request.priceGroupID);

      if (!bound.bound) {
        return { outcome: 'unresolved', reason: bound.reason };
      }

      // No absence arm: [model/service/PriceGroupService.cfc:L312] falls back to `sku.getPrice()`
      // when the cascade finds no rate, so this always produces a price.
      return {
        outcome: 'price',
        price: serializeMoney(
          scope.priceGroupService.calculateSkuPriceBasedOnPriceGroup(bound.sku, bound.priceGroup),
        ),
      };
    }

    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: the rounding rule is applied
    // only on the `percentageOff` branch, so `amountOff` and `amount` ignore it.
    // Preserved deliberately; do not fix without a product decision.
    case 'calculateSkuPriceBasedOnPriceGroupRate': {
      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      const rate = await resolveNamedPriceGroupRate(scope, request.priceGroupRateID);

      if (rate === undefined) {
        return { outcome: 'unresolved', reason: 'priceGroupRateNotFound' };
      }

      return {
        outcome: 'price',
        price: serializeMoney(
          scope.priceGroupService.calculateSkuPriceBasedOnPriceGroupRate(loaded.sku, rate),
        ),
      };
    }
    case 'calculateSkuPriceBasedOnCurrentAccount': {
      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      // No ACCOUNT TEST here, DELIBERATELY. The whole point of this member is that it OWNS the
      // signed-in test: [model/service/PriceGroupService.cfc:L263] branches,
      // [model/service/PriceGroupService.cfc:L264] resolves through the account, and
      // [model/service/PriceGroupService.cfc:L265-L266] answers `sku.getPrice()` otherwise.
      return {
        outcome: 'price',
        price: serializeMoney(
          await scope.priceGroupService.calculateSkuPriceBasedOnCurrentAccount(
            loaded.sku,
            scope.currentAccountContext,
          ),
        ),
      };
    }

    case 'calculateSkuPriceBasedOnAccount': {
      const account = admitNamedAccount(scope, request.accountID);

      if (!account.admitted) {
        return { outcome: 'unresolved', reason: account.reason };
      }

      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      return {
        outcome: 'price',
        price: serializeMoney(
          await scope.priceGroupService.calculateSkuPriceBasedOnAccount(
            loaded.sku,
            account.accountID,
          ),
        ),
      };
    }
    case 'getBestPriceGroupDetailsBasedOnSkuAndAccount': {
      const account = admitNamedAccount(scope, request.accountID);

      if (!account.admitted) {
        return { outcome: 'unresolved', reason: account.reason };
      }

      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      const details = await scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
        loaded.sku,
        account.accountID,
      );

      return {
        outcome: 'bestPriceGroupDetails',
        // [model/service/PriceGroupService.cfc:L347] seeds this with `sku.getPrice()`, never with
        // zero, so it is always present.
        price: serializeMoney(details.price),
        priceGroup:
          details.priceGroup === undefined
            ? { resolved: false, reason: 'noPriceGroupResolvedForSkuAndAccount' }
            : { resolved: true, priceGroupID: details.priceGroup.getPriceGroupID() },
      };
    }

    // The cascade's own steps are untouched: the eligibility gate at
    // [model/service/PriceGroupService.cfc:L373], the base-currency step at
    // [model/service/PriceGroupService.cfc:L385-L397].
    case 'getPriceByCurrencyCode': {
      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      return {
        outcome: 'currencyPrice',
        price: serializeOptionalMoney(loaded.sku.getPriceByCurrencyCode(request.currencyCode)),
      };
    }

    case 'getListPriceByCurrencyCode': {
      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      return {
        outcome: 'currencyPrice',
        price: serializeOptionalMoney(loaded.sku.getListPriceByCurrencyCode(request.currencyCode)),
      };
    }

    case 'getRenewalPriceByCurrencyCode': {
      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      return {
        outcome: 'currencyPrice',
        price: serializeOptionalMoney(
          loaded.sku.getRenewalPriceByCurrencyCode(request.currencyCode),
        ),
      };
    }

    // `convertCurrency` never throws and is treated as never throwing.
    //
    // The port's `//
    // TODO: add integration support` carry-forward [model/service/CurrencyService.cfc:L81] stays
    // where it is, flagged and not silently completed, and this module adds nothing that would
    // pretend it had been.
    case 'convertCurrency': {
      // Both codes were length-checked by the schema, which is what lets `toCurrencyCode` mint the
      // brand the port's parameters declare without its rejection reaching a caller as a server
      // error.
      return {
        outcome: 'price',
        price: serializeMoney(
          await scope.currencyConverter.convertCurrency(
            Money.fromDecimalString(request.amount),
            toCurrencyCode(request.originalCurrencyCode),
            toCurrencyCode(request.convertToCurrencyCode),
          ),
        ),
      };
    }
  }
}

// 6.11 `updateOrderAmountsWithPriceGroups` is not exposed, and that is structural.
//
// JUDGMENT CALL: `public void function updateOrderAmountsWithPriceGroups(required any order)`
// [model/service/PriceGroupService.cfc:L364-L375] is the WRITER half of a cross-service ordering
// constraint, and it is deliberately absent from every schema arm.
//
// LEGACY-DEFECT [model/service/PriceGroupService.cfc:L465-L467]: `deletePriceGroup` loops on a
// collection captured at [model/service/PriceGroupService.cfc:L463] and always removes index one.
// Preserved deliberately; do not fix without a product decision.
//
// LEGACY-NOTE [model/entity/Sku.cfc:L371, L375]: `getCurrenciesByCurrencyCodeList` applies no
// `activeFlag` filter, mirroring the legacy reads.
//
// LEGACY-NOTE: AAP 0.5.1 and 0.6.2 name a `getCurrencySmartList()` on `CurrencyService.cfc`. No
// such method exists in the source, so none is called and none is invented.

// Section 7 - the lambda entry point.
//
// The only exported unit that AWS invokes, and the thinnest part of the file: route, read the
// body, validate it, open one scope, dispatch, serialise.

/**
 * The one route action this module implements.
 */
const IMPLEMENTED_ROUTE_ACTION: RouteAction = 'resolvePrices';

/**
 * Headers on a successful response.
 */
export const REQUIRED_SUCCESS_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/**
 * A decoded request document, or the mapper's own reason for refusing to decode one.
 */
type RequestDocumentReading =
  | { readonly decoded: true; readonly document: object }
  | {
      readonly decoded: false;
      readonly reason: InvalidRequestReason;
      readonly fields?: readonly MappedFieldIssue[] | undefined;
    };

/**
 * Maximum decoded request document admitted by this compact operation grammar.
 */
const MAXIMUM_REQUEST_DOCUMENT_BYTES = 8 * 1024;

/**
 * Encoded length above which a base64 body cannot decode within the byte ceiling.
 */
const MAXIMUM_ENCODED_BODY_LENGTH = Math.ceil((MAXIMUM_REQUEST_DOCUMENT_BYTES * 4) / 3) + 4;

/**
 * Decode the request body into a JSON object.
 *
 * Each refusal NAMES a reason from `./errorMapper.js`'s closed union and lets that module own the
 * sentence.
 *
 * A base64 body is decoded first - API Gateway sets `isBase64Encoded` for a binary media type, and
 * a caller that does so is not making a different request.
 */
function readRequestDocument(event: APIGatewayProxyEvent): RequestDocumentReading {
  const rawBody = event.body;

  if (rawBody === null || rawBody.trim().length === 0) {
    return { decoded: false, reason: 'missingRequestBody' };
  }

  if (event.isBase64Encoded && rawBody.length > MAXIMUM_ENCODED_BODY_LENGTH) {
    return { decoded: false, reason: 'unusableRequestInput' };
  }

  const text = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;

  if (Buffer.byteLength(text, 'utf8') > MAXIMUM_REQUEST_DOCUMENT_BYTES) {
    return { decoded: false, reason: 'unusableRequestInput' };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { decoded: false, reason: 'unparsableRequestBody' };
  }

  // An array and a bare scalar are both well-formed JSON and neither is a request document. The
  // schema would reject them, but naming the shape here produces the more precise reason.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { decoded: false, reason: 'unsupportedBodyShape' };
  }

  // The one unrecognized key `z.strictObject` does not refuse, refused here instead.
  //
  // And the refusal publishes a frozen constant rather than a location.
  if (containsPrototypeMemberKey(parsed)) {
    return {
      decoded: false,
      reason: 'unusableRequestInput',
      fields: [PROTOTYPE_MEMBER_FIELD_ISSUE],
    };
  }

  return { decoded: true, document: parsed };
}

/**
 * The two production dependencies the price-resolution entrypoint allows a suite to substitute.
 */
export interface PriceResolutionHandlerDependencies {
  /**
   * Resolve the wired graph. Defaults to the memoized production composition root.
   */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;
  /**
   * Structured diagnostic sink. Defaults to the process logger.
   */
  readonly logger?: Logger | undefined;
}

/**
 * The two-parameter async Lambda shape emitted by this module.
 */
export type PriceResolutionLambdaHandler = (
  event: APIGatewayProxyEvent,
  lambdaContext?: Context,
) => Promise<APIGatewayProxyResult>;

/**
 * Build the price-resolution Lambda entry point over explicit substitution seams.
 *
 * `bootstrapCompositionRoot()` is idempotent: the first invocation on a container starts
 * initialization, concurrent callers await the same in-flight promise, a warm container resolves
 * immediately.
 *
 * @param dependencies optional composition-root and logger substitutions.
 * @returns the serialised Lambda handler.
 */
export function createPriceResolutionHandler(
  dependencies: PriceResolutionHandlerDependencies = {},
): PriceResolutionLambdaHandler {
  const openCompositionRoot =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const logger = dependencies.logger ?? processLogger;

  return async (
    event: APIGatewayProxyEvent,
    lambdaContext?: Context,
  ): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, lambdaContext);

    // One object, read by every refusal and by the single `catch`.
    let mappingContext: ErrorMappingContext = { requestId, logger };

    // The router owns resolution and hands back a READY response when nothing matched, so no
    // status, header set or body envelope for an unmatched request is decided here.
    const resolution = resolveRouteForCapability(
      routeRequestFromEvent(event),
      'priceResolution',
      mappingContext,
    );

    if (!resolution.matched) {
      return resolution.response;
    }

    const route = resolution.route;
    mappingContext = {
      requestId,
      route: routeDiagnosticLabel(route.methods, route.path),
      logger,
    };
    if (route.action !== IMPLEMENTED_ROUTE_ACTION) {
      return routeNotFoundResponse(mappingContext);
    }

    const reading = readRequestDocument(event);

    if (!reading.decoded) {
      // `fields` is forwarded when the refusal could name a member and omitted otherwise, so a
      // whole-body refusal publishes exactly the empty field list it always did.
      return invalidRequestResponse(reading.reason, mappingContext, reading.fields);
    }

    try {
      // A `ZodError` from here is RECOGNIZED by `./errorMapper.js` and published as a
      // client-shaped response carrying field PATHS and constraint descriptions only - never the
      // submitted values.
      const request = PRICE_RESOLUTION_REQUEST_SCHEMA.parse(reading.document);

      // The account requirement is applied here, per operation, and the position is the fix.
      const principalResolution = resolveRequestPrincipal(event);

      if (
        !principalResolution.identified &&
        !ANONYMOUS_PERMITTED_OPERATIONS.includes(request.operation)
      ) {
        return unauthenticatedResponse(mappingContext);
      }

      // `buildRequestScopeInput(undefined, false)` produces `{accountID: undefined}` alongside the
      // closed administrative flag, and the composition root publishes the account half as an
      // EMPTY `CurrentAccountContext` - the key OMITTED, not present-and-undefined.
      const accountID = principalResolution.identified
        ? principalResolution.principal.accountID
        : undefined;

      // Unidentified caller has no principal to carry a claim, so it resolves to `false` - the
      // closed arm - which is also why the one anonymously-permitted operation cannot acquire the
      // bypass.
      const adminAccountFlag = principalResolution.identified
        ? principalResolution.principal.adminAccountFlag
        : false;

      const compositionRoot = await openCompositionRoot();
      const scope = await compositionRoot.createRequestScope(
        buildRequestScopeInput(accountID, adminAccountFlag),
      );

      const result = await dispatchPriceResolution(scope, request);

      const document: PriceResolutionResultDocument = {
        operation: request.operation,
        // The injected clock, rendered UTC. See {@link PriceResolutionResultDocument.resolvedAt}.
        resolvedAt: scope.now.toISOString(),
        result,
      };
      logger.info('price resolution request served', {
        requestId,
        route: mappingContext.route,
        action: route.action,
        operation: request.operation,
        outcome: result.outcome,
        accountEstablished: accountID !== undefined,
      });
      return jsonSuccessResponse(requestId, route.capability, route.action, document);
    } catch (thrown: unknown) {
      // Narrowing is by the mapper's own `instanceof` probes, never by a cast here.
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * The production Lambda entrypoint.
 */
export const handler: PriceResolutionLambdaHandler = createPriceResolutionHandler();
