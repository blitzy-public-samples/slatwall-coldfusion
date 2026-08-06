// ---------------------------------------------------------------------------
// The SKU resolution Lambda entrypoint.
//
// A THIN PRIMARY ADAPTER over five already-ported read operations. Its whole job, in order: lift the
// method and path off the event and resolve them through `./router.js`; select ONE operation and
// validate the arguments that operation needs; await the memoized composition root from
// `./bootstrap.js` and open EXACTLY ONE request scope; invoke EXACTLY ONE ported service method;
// project the result onto JSON; map anything thrown through `./errorMapper.js`.
//
// DELEGATION IS VERBATIM AND RESULT ORDER IS PRESERVED. Every argument reaches the ported service
// exactly as the request supplied it - `selectedOptions` stays a comma-delimited string all the way
// to the statement builder, and no value is trimmed, split, sorted, de-duplicated, case-folded or
// bounded on the way through. Whatever array the service returns is projected in the order it
// returned it, never re-sorted or re-ranked.
//
// ABSENCE IS SERIALIZED AS ABSENCE, AND THIS IS THE LAST PLACE IT COULD BE LOST.
// `getPriceByCurrencyCode` [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, so an
// unknown currency yields nothing; `getListPriceByCurrencyCode` [:L275-L279] and
// `getRenewalPriceByCurrencyCode` [:L281-L285] add a SECOND key check on the sub-key and therefore
// yield nothing even for a currency that IS in the map. Substituting `0` anywhere along that chain
// would silently sell products for free. An absent monetary value is OMITTED from the document rather
// than rendered as `0`, `null` or an empty object, and `Money.zero` is never a fallback. See
// {@link projectCurrencyDetail}.
//
// NO SQL AND NO BUSINESS LOGIC LIVE HERE. This capability fronts a must-preserve behaviour - product
// / SKU / option-to-SKU resolution, entered at
// `getProductSkusBySelectedOptions(selectedOptions, productID)`
// [model/service/ProductService.cfc:L104] - whose correctness rests on the AND-of-EXISTS option
// matching at [model/dao/SkuDAO.cfc:L107-L128]: a SKU qualifies only if EVERY selected option is
// present on it. Neither the matching nor the statement lives here; both are reached unmodified
// through the ported service surface the composition root hands over. No option-combination building,
// no price or `Money` arithmetic, no entity construction and no settings resolution either, and no
// service, repository, port or connection pool is constructed - `./bootstrap.js` is the only
// composition root in this subtree.
//
// DEPENDENCY DIRECTION. This module imports `./router.js`; the router imports no handler, because the
// router owns RESOLUTION and a handler owns INVOCATION. `src/handlers/` is the inversion point:
// nothing in `src/domain/**`, `src/services/**` or `src/repositories/**` imports from here, and the
// ESLint `no-restricted-imports` layer boundary makes a back-edge from `src/domain/**` a build
// failure. No other capability handler is imported.
//
// The Lambda artifact is emitted CommonJS because bundling this dependency set to ESM builds cleanly
// and then fails at run time with `Dynamic require of "node:buffer"` through `mysql2` ->
// `sql-escaper`. The consequence here is concrete: no `import.meta` and no top-level `await` appear
// anywhere in this file. `esbuild.config.mjs` owns that decision and nothing here duplicates it.
// ---------------------------------------------------------------------------

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';

import { structGet, structKeyList } from '../lib/cfml/struct.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';
import type { CompositionRoot, RequestScope } from './bootstrap.js';
import { bootstrapCompositionRoot } from './bootstrap.js';
import type { ErrorMappingContext, MappedFieldIssue } from './errorMapper.js';
import {
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  resolveServerRequestId,
  routeDiagnosticLabel,
  resolveRequestPrincipal,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import type { RouteAction, RoutedCapability } from './router.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';

// ===========================================================================
// SECTION 1 - THE OPERATION SET
// ===========================================================================

/**
 * The operations this capability publishes, under their VERBATIM legacy CFML names.
 *
 * ★ THE NAMES ARE THE ACCEPTANCE CONTRACT (B4) AND ARE NOT MODERNISED. A reviewer diffing the two
 * surfaces method by method must find `getProductSkusBySelectedOptions` spelled exactly as
 * [model/service/ProductService.cfc:L104] spells it, not a tidier `resolveSkusByOptions`. The same
 * holds for the other four. A string-literal union rather than the TypeScript enumeration
 * construct, so nothing survives into the Lambda bundle as a runtime object and each value stays
 * directly comparable against a decoded log line.
 *
 * ★ WHY EXACTLY THESE FIVE, AND WHY THE OPERATION IS SELECTED HERE RATHER THAN BY THE ROUTER.
 * `./router.js` deliberately publishes ONE route per capability and no operation-selection surface
 * of its own; its own documentation places that decision with "the handler deciding which of its own
 * service methods a given payload calls for". So the route names the CAPABILITY and this union names
 * the OPERATION, selected from the request by the `operation` query parameter.
 *
 * The set is not a preference. Two structural boundaries decide it, and both are recorded rather than
 * left to inference.
 *
 * FIRST, WHAT IS REACHABLE AT ALL. `./bootstrap.js` publishes {@link RequestScope} WITHOUT the six
 * MySQL repositories - a withdrawal its own documentation explains at length - and no ported service
 * publishes a load-by-identifier that this capability needs. A primary adapter therefore cannot obtain
 * a hydrated `Product` or `Sku` instance, and it may not construct one. Every member of `SkuService`
 * and `ProductService` whose signature takes an ENTITY is consequently unreachable from here.
 *
 * ★★★ SECOND, AND THIS IS WHAT NARROWED THE SET FROM FIVE TO TWO. Three operations that WERE published
 * here have been WITHDRAWN, and each withdrawal is a review finding rather than a preference:
 *
 *   * `getTransactionExistsFlag` - FINDING F18. The route advertised a boolean it could never return.
 *     `SkuService.getTransactionExistsFlag()` declares no parameters and forwards none
 *     [model/service/SkuService.cfc:L285-L287], and `MysqlSkuRepository.getTransactionExistsFlag`
 *     raises a named `SkuColumnError` when neither `productID` nor `skuID` is supplied - which is
 *     CORRECT PARITY, because [model/dao/SkuDAO.cfc:L59-L63] takes its `<cfelse>` arm and executes
 *     with an UNDEFINED `arguments.productID`, and the legacy cannot serve that call either. Against
 *     the real composition the action could only ever produce a 500. It is withdrawn rather than
 *     repaired: supplying an identifier would mean widening the service signature, and the AAP fixes
 *     it at `getTransactionExistsFlag(): Promise<boolean>` (AAP 0.4.2) with every ledger slot already
 *     allocated, so this tier has no authority to reshape it. The service keeps its faithful raise and
 *     its own coverage of it.
 *   * `searchSkusByProductType` - FINDING F10. Returns `Sku[]`, complete and unpaged, with no member
 *     of the signature able to bound it. Bounding it would mean adding a parameter the legacy
 *     [model/service/SkuService.cfc:L271-L273] does not have.
 *   * `findSkus` - FINDING F10. Returns a whole `SkuPage`, and `SkuQueryCriteria` declares NO paging
 *     members at all, so there is nothing for a routed contract to bound. Adding them would reshape a
 *     signature the AAP has already spent its smart-list allocation on.
 *
 * WITHDRAWAL IS THE AAP-ALIGNED ANSWER RATHER THAN A REDUCTION IN SCOPE. AAP 0.4.1 specifies this
 * entrypoint as "Net-new entrypoint exposing `getProductSkusBySelectedOptions` and SKU lookup" -
 * exactly the two below. The three withdrawn actions were never AAP-named, so publishing them was the
 * deviation and removing them restores the specified surface. Each remains reachable in-process by any
 * caller that holds the service, and each keeps its own service-tier coverage; what is withdrawn is
 * the LAMBDA surface, which is the only thing this module owns.
 *
 * See {@link NON_EXPOSED_SURFACE_NOTES} for the enumerated other side of that boundary, member by
 * member, with the reason each is absent - the three withdrawals included.
 */
export type SkuResolutionOperation = 'getProductSkusBySelectedOptions' | 'getSkuBySkuCode';

/**
 * The capability this handler answers for, and only this one.
 *
 * Passed to `resolveRouteForCapability` so that a request whose path belongs to one of the other
 * four capabilities is reported exactly as an unmatched route. Typed to the router's own union, so
 * a renamed capability breaks this file at compile time instead of silently answering nothing.
 */
const SKU_RESOLUTION_CAPABILITY: RoutedCapability = 'skuResolution';

/**
 * The action `ROUTE_TABLE.skuResolution` declares.
 *
 * Checked explicitly rather than assumed. The table is keyed by capability today, so the capability
 * check already implies this one - but the router's own note records that adding a second route to a
 * capability later is additive, and an action this module does not implement must then fall out as a
 * non-route rather than reaching the operation switch. Typed to the router's union for the same
 * compile-time reason as the capability above.
 */
const SKU_RESOLUTION_ACTION: RouteAction = 'resolveSkus';

/**
 * The query parameter that names the operation.
 *
 * A single explicit discriminator, rather than inferring the operation from WHICH other parameters
 * happen to be present. JUDGMENT CALL: inference would make the request surface ambiguous the moment
 * two operations share a parameter name - `productTypeID` is on two of the five - and would put a
 * selection decision inside a handler that is meant to hold none. An explicit discriminator also
 * makes the verbatim CFML method name part of the published request, which is what makes B4
 * interface parity observable from outside the process rather than only in the source.
 */
const OPERATION_QUERY_PARAMETER = 'operation';

/** A query parameter is singular on this transport; repeats are refused rather than collapsed. */
const MAXIMUM_VALUES_PER_PARAMETER = 1;

// ★★ THE SUCCESS HEADER SET, THE SUCCESS STATUS AND THE UNCORRELATED-IDENTIFIER TOKEN THAT USED TO
// SIT HERE ARE ALL GONE, AND THEIR REMOVAL IS THE FIX FOR TWO FINDINGS AT ONCE.
//
// This module declared its own `JSON_SUCCESS_HEADERS`, its own `OK_STATUS` and its own
// `'uncorrelated'` token, and argued - reasonably at the time - that `./errorMapper.js` owned only the
// FAILURE half so the success half belonged here. API review measured the consequence across all five
// entrypoints and found exactly what splitting one contract in half produces: four differently-shaped
// success envelopes, two of them with no correlation identifier at all (finding F13), and five
// different answers to which correlation identifier wins (finding F8) - of which THIS module's was the
// outlier, preferring the gateway's identifier where its peers preferred the runtime's.
//
// All three decisions now live once, in `./errorMapper.js`, beside the failure half of the same
// contract it already owned - the response construction, the header set, the correlation echo and the
// route sanitizer were all there already. This module consumes `jsonSuccessResponse`,
// `resolveServerRequestId` and `routeDiagnosticLabel` and derives none of them. The `no-store`
// reasoning survives verbatim at the shared header set: the legacy slice published no caching
// semantics for any of these reads and choosing a freshness lifetime would invent one, which is a
// decision with product consequences for a price-bearing document.

// ===========================================================================
// SECTION 2 - THE TYPES THE SERVICE TIER HANDS OVER
//
// ★ DERIVED FROM THE SERVICE SURFACE RATHER THAN IMPORTED FROM `src/domain/entities/`.
//
// JUDGMENT CALL, with two reasons and one cost, all stated. The declared dependency set for this
// module is `./bootstrap.js`, `./router.js`, `./errorMapper.js`, `../services/productService.js`,
// `../services/skuService.js`, `../domain/ports/skuRepository.js` and `../lib/logger.js` (plus the
// locked CFML parity helpers under `../lib/cfml/`). Naming the entity module directly would widen
// that set for a type this module can obtain from inside it, so the entity type is taken from the
// PUBLISHED SERVICE SURFACE - specifically from the return type of the SKU lookup this capability
// dispatches.
//
// ★ IT USED TO BE TAKEN FROM `SkuPage`, and the source of the alias moved with finding F10. When
// `findSkus` was withdrawn from this routed surface, `SkuPage` stopped being a shape this module
// consumes, and keeping a type import solely to reach an element type would have left a dangling
// reference to a withdrawn operation. Deriving it from `getSkuBySkuCode` instead ties the alias to an
// operation that IS published, so the compile-time coupling below still points at something this file
// actually serializes.
//
// The second reason is the better one: this projection is then typed to WHAT THE SERVICE RETURNS
// rather than to what the entity module happens to declare. If the service surface ever changes
// shape, this file stops compiling - which is the outcome that keeps a serializer from drifting away
// from the thing it serializes.
//
// The cost is that the aliases below read indirectly, which is why they are named and documented
// instead of being inlined at each use.
// ===========================================================================

/**
 * The SKU entity as the ported service tier publishes it.
 *
 * `SkuService.getSkuBySkuCode` is declared `Promise<Sku | undefined>`, so unwrapping the promise and
 * stripping the miss arm yields exactly the `Sku` class. `NonNullable` is doing real work here rather
 * than being merely defensive: the `undefined` it removes is the load-bearing miss value this module
 * deliberately carries through to an OMITTED response member (AAP 0.4.2), so the projection type must
 * exclude it while the outcome type keeps it.
 */
type ResolvedSku = NonNullable<Awaited<ReturnType<RequestScope['skuService']['getSkuBySkuCode']>>>;

/**
 * One per-currency entry of the four-step cascade [model/entity/Sku.cfc:L367-L433], as the entity
 * publishes it.
 *
 * Derived from the accessor's return type for the reason recorded on the section header. The three
 * money members and the three presentation members are all OPTIONAL on the entity's own declaration,
 * and that optionality is the contract: an entry can exist for a currency and still carry no list
 * price, which is precisely why [model/entity/Sku.cfc:L275-L279] and [L281-L285] test the sub-key a
 * second time.
 */
type ResolvedCurrencyDetail = NonNullable<ReturnType<ResolvedSku['getCurrencyDetails']>[string]>;

// ===========================================================================
// SECTION 3 - THE PUBLISHED RESPONSE SHAPE
// ===========================================================================

/**
 * One per-currency price entry, rendered for transport.
 *
 * ★ EVERY MONEY MEMBER IS A STRING, AND AN ABSENT ONE IS OMITTED RATHER THAN ZEROED.
 * `Money` publishes no `toJSON`, no `toString` and no `valueOf` - deliberately, so that an accidental
 * interpolation or a bare `JSON.stringify` cannot emit a monetary numeral - so every crossing is an
 * explicit call. `Money.toDecimalString()` is the call used, NOT `Money.toFixed2()`: see
 * {@link renderMoney}.
 *
 * The three `*Formatted` members are carried through VERBATIM. They are strings the cascade itself
 * produced [model/entity/Sku.cfc:L388, L392, L395, L403, L407, L410, L419, L423, L426], not values
 * this module formats, so passing them along adds no presentation decision of its own.
 *
 * Each optional member spells `| undefined` alongside the `?`, which is what
 * `exactOptionalPropertyTypes` requires in order for an absent value to be assignable at all.
 */
export interface CurrencyDetailProjection {
  /**
   * The `SwSkuCurrency` row the prices came from, or `''` when they came from the SKU's own columns
   * or from a conversion [model/entity/Sku.cfc:L382, L412].
   */
  readonly skuCurrencyID: string;

  /** The price in this currency, at full precision. Omitted when the cascade recorded none. */
  readonly price?: string | undefined;

  /** The cascade's own presentation string for `price`, verbatim. */
  readonly priceFormatted?: string | undefined;

  /** The list price in this currency, at full precision. Omitted when the cascade recorded none. */
  readonly listPrice?: string | undefined;

  /** The cascade's own presentation string for `listPrice`, verbatim. */
  readonly listPriceFormatted?: string | undefined;

  /**
   * The renewal price in this currency, at full precision. Omitted when the cascade recorded none.
   */
  readonly renewalPrice?: string | undefined;

  /** The cascade's own presentation string for `renewalPrice`, verbatim. */
  readonly renewalPriceFormatted?: string | undefined;

  /**
   * `false` when the price came from the SKU's own columns or an override row, `true` when it was
   * converted on the fly [model/entity/Sku.cfc:L396, L411, L427]. Omitted when the currency matched
   * no step of the cascade at all - a state the cascade genuinely reaches.
   */
  readonly converted?: boolean | undefined;
}

/**
 * A SKU, rendered for transport.
 *
 * ★ WHAT IS DELIBERATELY NOT ON IT, because five members of the entity THROW BY DESIGN and reaching
 * any of them from a serializer would turn a read into a failure:
 *
 *   - `getPriceByPromotion(promotion)` - register defect 16. [model/entity/Sku.cfc:L258] calls
 *     `calculateSkuPriceBasedOnPromotion`, which does not exist, so the legacy raises every time.
 *     Reproduced as a throwing stub. It is not called here, not caught here, and not silenced here.
 *   - `getStocksDeletableFlag()` - register defect 28, the entity half. See
 *     {@link NON_EXPOSED_SURFACE_NOTES}.
 *   - `getImage()`, `getResizedImagePath()`, `getImageExistsFlag()` - the image surface, out of
 *     scope, published as throwing stubs.
 *
 * `getCurrencyCode()` is also absent, for a different reason: it resolves `skuCurrency` through the
 * settings port and raises when no provider was injected. A primary adapter performs no settings
 * resolution, so the base currency code is not published; the per-currency map below already keys
 * every price by its currency, which is the fact a consumer needs.
 *
 * Everything present is a synchronous, total accessor over already-materialized state. No accessor
 * used here issues a query, and none can raise.
 */
export interface SkuProjection {
  /** [model/entity/Sku.cfc:L52] the primary key. */
  readonly skuID: string;

  /**
   * [model/entity/Sku.cfc:L54]. OMITTED when the SKU carries none - never `''` and never `null`.
   */
  readonly skuCode?: string | undefined;

  /** [model/entity/Sku.cfc:L53]. */
  readonly activeFlag: boolean;

  /** [model/entity/Sku.cfc:L56] `price`, at full precision. */
  readonly price: string;

  /** [model/entity/Sku.cfc:L55] `listPrice`, at full precision. */
  readonly listPrice: string;

  /** [model/entity/Sku.cfc:L57] `renewalPrice`, at full precision. */
  readonly renewalPrice: string;

  /** [model/entity/Sku.cfc:L58]. Omitted when the SKU carries no image file name. */
  readonly imageFile?: string | undefined;

  /** [model/entity/Sku.cfc:L59]. */
  readonly userDefinedPriceFlag: boolean;

  /**
   * The SKU's option identifiers as a CFML COMMA-DELIMITED LIST, exactly as the entity builds it.
   *
   * Carried in list form rather than as an array, because that is the shape the legacy accessor
   * publishes and because it is the shape `getProductSkusBySelectedOptions` CONSUMES - a consumer
   * can feed this value straight back into a subsequent option-based resolution without
   * re-assembling it, which an array would force it to do and would give it a second chance to
   * disagree with the SQL about what a delimiter is.
   */
  readonly optionIDList: string;

  /**
   * The owning product's identifier [model/entity/Sku.cfc:L65]. Omitted when the association is
   * absent, which is reachable: the entity publishes `Product | undefined` because
   * `removeProduct()` deletes the association outright.
   */
  readonly productID?: string | undefined;

  /**
   * The materialized per-currency price map [model/entity/Sku.cfc:L367-L433].
   *
   * `{}` when the eligibility gate at [model/entity/Sku.cfc:L373] was closed, or when this SKU was
   * hydrated for a path that needs no currency-aware price. AN EMPTY MAP IS THE LEGACY'S OWN STATE
   * and is published as such: it means every currency accessor answers nothing, and it must not be
   * mistaken for a serialization gap.
   */
  readonly currencyDetails: Readonly<Record<string, CurrencyDetailProjection>>;
}

// ★★ `SkuKeywordPropertyProjection` AND `SkuPageProjection` USED TO SIT HERE AND ARE WITHDRAWN WITH
// THE OPERATION THAT PRODUCED THEM. Both were the transport form of `SkuPage`, the typed query result
// the AAP substitutes for `getSkuSmartList` [model/service/SkuService.cfc:L309-L325], and both existed
// solely to serialize the `findSkus` outcome. Finding F10 withdrew that operation from this routed
// surface because `SkuQueryCriteria` declares no paging members and therefore nothing a routed
// contract could bound. Removing the shapes with it keeps the published contract honest: a consumer
// reading this module's exports cannot find a page type for a page it can no longer request.
//
// NOTHING WAS RESHAPED TO ACHIEVE THIS. `SkuPage` still exists exactly as the services tier declares
// it, still carries its keyword properties and its empty join list, and is still returned by
// `SkuService.findSkus` to any in-process caller. The service tier owns its own coverage of it.

/**
 * What one dispatched operation produced, discriminated by the operation that produced it.
 *
 * A discriminated union on `operation` rather than a single loose envelope, so a consumer - and the
 * compiler - cannot read `skus` off a response that answered a single SKU. The discriminant values
 * are the verbatim legacy method names, which is what makes the published contract diffable against
 * the CFML surface.
 */
export type SkuResolutionOutcome =
  | {
      /** ★ MUST-PRESERVE: AND-of-EXISTS option matching [model/dao/SkuDAO.cfc:L107-L128]. */
      readonly operation: 'getProductSkusBySelectedOptions';
      /** Every matching SKU, IN THE ORDER THE SERVICE RETURNED THEM. Never re-ordered here. */
      readonly skus: readonly SkuProjection[];
    }
  | {
      readonly operation: 'getSkuBySkuCode';
      /**
       * The matching SKU, or NOTHING. On a miss this member is OMITTED from the serialized document
       * - see {@link serializeOutcome} for why omission is the faithful encoding and why neither
       * `null`, `0` nor `{}` is used.
       */
      readonly sku?: SkuProjection | undefined;
    };

// ★★ THREE ARMS WERE REMOVED FROM THIS UNION, AND THE COMPILER IS WHAT MADE THAT SAFE. `searchSkusByProductType`
// and `findSkus` went with finding F10, `getTransactionExistsFlag` with finding F18; the reasoning for
// each is on {@link SkuResolutionOperation}. Because the dispatcher switches over this closed union
// with no default branch, deleting an arm here turned every site that produced or consumed it into a
// compile error rather than into dead code that still answered - which is the property that makes a
// withdrawal auditable instead of merely intended.

/**
 * The CAPABILITY-SPECIFIC payload of a successful response.
 *
 * ★★ THIS USED TO BE `SkuResolutionResponseBody`, A WHOLE-DOCUMENT `{requestId, outcome}` OF THIS
 * MODULE'S OWN. Finding F13 measured all four JSON entrypoints and found four differently-shaped
 * success envelopes - this one nested its payload under `outcome`, its siblings under `result`, and two
 * of them carried no correlation identifier at all. The OUTER document now comes from
 * `./errorMapper.js`'s `jsonSuccessResponse`, which publishes `{requestId, capability, action, result}`
 * for every capability, and this type is what travels inside `result`.
 *
 * The `requestId` member is GONE FROM HERE rather than duplicated: the shared envelope carries it once,
 * at the top level, and echoing it twice would let the two copies disagree.
 *
 * Published as a type so the net-new test tier can parse a body without restating its shape, exactly
 * as `./errorMapper.js` publishes `ErrorResponseBody` for the failure side. It carries no legacy error
 * code, no framework exception type, no SQL, no connection detail and no echo of the caller's path.
 */
export interface SkuResolutionResultDocument {
  /** What the dispatched operation produced. */
  readonly outcome: SkuResolutionOutcome;
}

// ===========================================================================
// SECTION 4 - REQUEST VALIDATION
//
// ★★ THE ONE RULE THAT GOVERNS EVERY SCHEMA BELOW: PRESENCE IS CHECKED, EMPTINESS IS NOT.
//
// CFML `required string x` rejects a MISSING argument and accepts an EMPTY one. So
// `getProductSkusBySelectedOptions(required string selectedOptions, required string productID)`
// [model/service/ProductService.cfc:L104] legitimately accepts `selectedOptions=""`, and the
// AND-of-EXISTS loop at [model/dao/SkuDAO.cfc:L112] then runs `listLen("")` = 0 times, emitting NO
// `exists` clause and leaving the product filter as the only restriction. THAT IS THE LEGACY
// BEHAVIOUR OF A MUST-PRESERVE PATH. Adding a minimum length to any schema here would narrow it and
// would be a behavioural change disguised as input hygiene, so no schema below carries one.
//
// What the schemas DO enforce is that the parameters an operation needs are PRESENT, which is the
// direct analogue of the legacy `required` declaration and is the whole of a primary adapter's
// validation job. NOTHING FROM THE LEGACY DECLARATIVE VALIDATION FILES IS REPRODUCED HERE, and
// nothing is invented from them either: `model/validation/Sku.json` constrains ENTITY SAVE AND DELETE
// contexts - `price` required and numeric with a minimum of 0, `skuCode` required and unique,
// `options` checked by `hasUniqueOptions` and `hasOneOptionPerOptionGroup`, `defaultFlag`,
// `transactionExistsFlag` and `physicalCounts` on delete - and not one of those rules describes a
// READ request's query string. Applying them here would invent a constraint the source never had;
// the deliberate absences the plan records - there is no `Category.json`, no `PromotionQualifier.json`,
// no `PromotionApplied.json`, no `PromotionAccount.json`, no `Product_AddOption.json` and no
// `Product_AddOptionGroup.json` - are likewise not filled in.
//
// `zod` 4.4.3, the pinned validator, is the only validation dependency.
//
// ★★★ UNKNOWN AND REPEATED QUERY PARAMETERS ARE NOW REJECTED, AND THE PREVIOUS PARAGRAPH WAS WRONG.
// It read: "Unknown query parameters are STRIPPED rather than rejected, which is `z.object`'s default:
// refusing an unrecognized parameter would be inventing a strictness the source never expressed."
// Request-binding review (finding F11) established that the analogy to CFML does not hold, in both
// directions:
//
//   * A CFML function call CANNOT carry an argument the function does not declare - `cffunction`
//     rejects an unknown named argument at invocation. Silently DROPPING one is therefore not the
//     permissive legacy behaviour; it is a NEW behaviour with no legacy counterpart, and the more
//     faithful reading of "no strictness the source expressed" is that a misspelled parameter should
//     not be quietly ignored either.
//   * A repeated parameter has no legacy counterpart AT ALL, and the previous revision resolved one by
//     reading whichever value the single-valued map happened to keep. That is a silent, undocumented
//     choice between two things the caller asked for, made where the caller cannot see it.
//
// Each per-operation schema below declares `operation`, while a separate closed-set check refuses an
// unpublished key with a fixed message that does not echo caller-authored text. The handler also
// refuses any parameter supplied more than once BEFORE validation.
//
// THE PRESENCE-NOT-EMPTINESS RULE ABOVE IS UNAFFECTED. Strictness governs WHICH keys may appear; it
// adds no length, pattern, trim, case fold or de-duplication to any value, and an empty string is
// still admitted everywhere the legacy admitted one.
// ===========================================================================

/**
 * The operation name, validated against the closed set.
 *
 * A `z.enum` over the same two literals {@link SkuResolutionOperation} declares, so an unrecognized
 * value fails validation with the field path `operation` and reaches the caller as a client-shaped
 * rejection rather than as a server failure. The array is spelled out rather than derived from the
 * type, because a type cannot be enumerated at run time and deriving it from a runtime constant would
 * invert the direction the compiler can check.
 *
 * ★ THREE LITERALS WERE REMOVED - `searchSkusByProductType`, `getTransactionExistsFlag` and
 * `findSkus`. A caller naming one of them now receives the SAME client-shaped rejection as a caller
 * naming a nonsense string, with the field path `operation`, and that uniformity is deliberate: a
 * distinct "withdrawn" outcome would advertise that the operation once existed and invite a caller to
 * wait for it to return. The reason each was withdrawn is on {@link SkuResolutionOperation}.
 */
const operationSchema = z.enum(['getProductSkusBySelectedOptions', 'getSkuBySkuCode']);

/**
 * The operation name in the position it actually occupies: a member of the query struct.
 *
 * ★ WRAPPED IN AN OBJECT DELIBERATELY, AND NOT AS A STYLISTIC PREFERENCE. Validating the bare string
 * would report a failure with an EMPTY field path, because a scalar parse has no path to report -
 * observed, not assumed - so a caller sending an unrecognized operation would receive a rejection that
 * named no field. Validating the struct reports the path `operation`, which is the member the caller
 * can actually correct.
 *
 * ★ THIS ONE STAYS NON-STRICT WHILE EVERY SCHEMA BELOW IS STRICT, and the asymmetry is required rather
 * than an oversight. This is a PRE-PARSE whose only job is to read the discriminator out of a struct
 * that still holds the operation's own parameters; making it strict would reject every well-formed
 * request that carried any. Strictness is applied once, by the operation-specific schema that knows the
 * complete key set - which is the only place it CAN be applied correctly.
 */
const operationEnvelopeSchema = z.object({
  operation: operationSchema,
});

/**
 * ★ MUST-PRESERVE ARGUMENTS. Both `required string` in the legacy, so both keys must be present -
 * and neither carries a length, a pattern, a trim, a case fold or a de-duplication step.
 *
 * `selectedOptions` STAYS A COMMA-DELIMITED STRING all the way to the SQL. It is not split here, not
 * widened to `string[]`, not sorted and not de-duplicated. The AND-of-EXISTS statement builds one
 * `exists` clause per element with a bound parameter each [model/dao/SkuDAO.cfc:L112-L121], so
 * element parsing belongs to the repository tier where the binding happens - the same ruling the
 * service tier already applied to this parameter and to `existingOptionGroupIDList`.
 *
 * ★★★ NO ELEMENT CEILING IS APPLIED HERE, AND THE 64-ELEMENT ONE THAT USED TO BE WAS A FIDELITY
 * DEFECT. It was introduced as "a transport safety bound", refused a 65-element list with a 400 and
 * was defended by citing AAP 0.6.5's explicit-batch-limit requirement. A code review rejected the
 * citation and the bound, on two grounds that both hold:
 *
 *   1. AAP 0.6.5's batch limits govern UNBOUNDED BULK MUTATION - `processProduct_updateSkus`
 *      [model/service/ProductService.cfc:L216-L233], which saves per SKU, and `createSkus`
 *      [model/service/SkuService.cfc:L109-L121], whose odometer runs the full cartesian product of
 *      every option group and is therefore unbounded BY CONSTRUCTION. This operation is a READ. It
 *      issues one statement whose size is linear in the caller's own list, mutates nothing, and has
 *      no compensation story to need.
 *   2. It contradicted a MUST-PRESERVE behaviour. `getProductSkusBySelectedOptions` is one of the
 *      three areas AAP 0.8.1 names as behaviour that must survive unchanged, and the legacy service
 *      and DAO answer a list of ANY length: the loop at [model/dao/SkuDAO.cfc:L112] emits one
 *      `exists` clause per element with no count test anywhere. Refusing at 65 made this route answer
 *      differently from the surface it is a port of.
 *
 * THE ONLY BOUND IS THE ONE THE DATABASE PROTOCOL IMPOSES, AND IT LIVES WHERE IT IS TRUE.
 * `../repositories/mysql/sql/skusBySelectedOptions.sql.ts` counts the placeholders the statement
 * would carry - one per element plus the optional `productID` - and refuses at
 * `MAX_PLACEHOLDER_COUNT`, because MySQL encodes a prepared statement's placeholder count in a
 * TWO-BYTE field and a statement above that CANNOT BE PREPARED. That is a fact about the wire
 * protocol rather than a policy this adapter invented, it is 65535 rather than 64, and it applies to
 * every caller - routed or in-process - which is exactly why it is not duplicated here.
 *
 * So this schema carries no count, no length, no pattern, no trim, no case fold and no
 * de-duplication, and the comma-list the caller sent is the comma-list the service receives.
 */
const getProductSkusBySelectedOptionsSchema = z.object({
  operation: z.literal('getProductSkusBySelectedOptions'),
  selectedOptions: z.string(),
  productID: z.string(),
});

/**
 * `getSkuBySkuCode` [model/service/SkuService.cfc:L289-L291].
 *
 * ★★★ `skuCode` IS OPTIONAL, AND THIS IS THE RECORD OF IT BEING MADE REQUIRED AND THEN RESTORED. The
 * legacy declares `public any function getSkuBySkuCode( string skuCode )` - `string`, with NO
 * `required` attribute - and the AAP's own interface mapping carries that verbatim as
 * `getSkuBySkuCode(skuCode?: string)`. Absence is therefore forwarded as absence: the service and
 * repository tiers retain responsibility for the legacy raise an absent DAO argument reaches
 * [model/dao/SkuDAO.cfc:L102].
 *
 * ⚠ IT WAS BRIEFLY REQUIRED HERE, AND THE ARGUMENT FOR THAT IS WORTH KEEPING IN VIEW BECAUSE IT WAS A
 * GOOD ONE. QA testing exercised an omission end to end: it reached the service, hit the reproduced
 * raise, and came back as an opaque **500** - a response that tells the caller nothing it can act on
 * and that inflates the 5xx signal operators alarm on. So a required-`skuCode` rule was added here to
 * answer 400 instead.
 *
 * ★★ A CODE REVIEW REVERSED IT, AND THE REVERSAL GOVERNS. Interface parity at the mapped surface is
 * this migration's acceptance contract (AAP 0.4.2), and AAP 0.9.2 closes the budget explicitly: THREE
 * signature reshapings are permitted and no fourth, "any fourth reshaping discovered during execution
 * must be added to 0.4.2 with justification before it is accepted". Narrowing an optional parameter
 * into a required one at the transport is exactly such a reshaping - it makes a request the mapped
 * surface accepts un-sendable - and it was neither budgeted nor added. A boundary does not get to
 * redefine exact parity on its own authority, however reasonable the local outcome; that is a product
 * decision about the SERVICE's contract, to be taken there and recorded in the plan.
 *
 * So the pass-through is restored, and with it the downstream behaviour: a routed caller that omits
 * `skuCode` reaches the service exactly as an in-process caller does, and receives whatever the
 * service does with an absent argument.
 *
 * An EMPTY `skuCode` is ADMITTED, unchanged and independent of all of the above: `z.string()` accepts
 * `''`, the legacy would bind `''` and match nothing, and this handler must not decide otherwise.
 */
const getSkuBySkuCodeSchema = z.object({
  operation: z.literal('getSkuBySkuCode'),
  skuCode: z.string().optional(),
});

/** The closed parameter set for each surviving routed operation. */
const PUBLISHED_PARAMETER_NAMES: Readonly<Record<SkuResolutionOperation, readonly string[]>> =
  Object.freeze({
    getProductSkusBySelectedOptions: Object.freeze(
      Object.keys(getProductSkusBySelectedOptionsSchema.shape),
    ),
    getSkuBySkuCode: Object.freeze(Object.keys(getSkuBySkuCodeSchema.shape)),
  });

/** Whether every caller-supplied key belongs to the named operation's published parameter set. */
function hasClosedParameterSet(
  operation: SkuResolutionOperation,
  parameters: Readonly<Record<string, string | undefined>>,
): boolean {
  const published = PUBLISHED_PARAMETER_NAMES[operation];

  for (const supplied of Object.keys(parameters)) {
    if (supplied !== OPERATION_QUERY_PARAMETER && !published.includes(supplied)) {
      return false;
    }
  }

  return true;
}

/** Fixed, non-reflective refusal for a key outside the named operation's closed set. */
const UNPUBLISHED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: 'queryStringParameters',
  message:
    'carries a parameter the named operation does not publish; the query surface is closed, and ' +
    'an unrecognized parameter is refused rather than silently dropped',
});

/** Fixed refusal for any parameter supplied more than once. */
const REPEATED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: 'multiValueQueryStringParameters',
  message:
    'carries a parameter more than once; each parameter of this capability admits exactly one ' +
    'value, and a repeated parameter is refused whole rather than collapsed to one of the values',
});

// ★★ THE `searchSkusByProductType` AND `findSkus` SCHEMAS USED TO SIT HERE AND WENT WITH THEIR
// OPERATIONS (finding F10). Both carried a genuinely useful note that is preserved rather than lost,
// because the asymmetry it recorded is a source fact and outlives the schemas:
//
//   ⚠️ `productTypeID` IS SINGULAR ON THE SKU SIDE AND PLURAL ON THE PRODUCT SIDE.
//   `searchSkusByProductType(term, productTypeID)` [model/dao/SkuDAO.cfc:L130] against
//   `searchProductsByProductType(term?, productTypeIDs?)` [model/dao/ProductDAO.cfc]. Both spellings
//   are the legacy's own, both are preserved verbatim at the service tier, and the cross-service
//   asymmetry is deliberately NOT harmonised in either direction. The absent-versus-empty distinction
//   it depended on is likewise a source fact: the DAO gates its restriction on `structKeyExists` plus a
//   non-blank test [model/dao/SkuDAO.cfc:L134], so an empty string and an absent value are NOT the same
//   request. `../services/skuService.ts` holds both facts and its suite exercises them.

// ===========================================================================
// SECTION 5 - WHAT IS DELIBERATELY NOT EXPOSED
//
// Enumerated in source rather than left to inference, because "this handler does not publish X" is
// only auditable if X is named. THE SOURCE IS THE AUDIT RECORD. `tsconfig.build.json` sets
// `removeComments: false`, so an annotation also survives into the `tsc` output in `build/` whenever
// the declaration it sits on survives type erasure - but NOT into the deployable artifact: none of
// this file's own annotations appears in `dist/skuResolutionHandler.cjs`, so a bundled artifact is
// never where one is read.
// ===========================================================================

/**
 * The members of the two ported services that this routed surface does NOT publish, each with the
 * reason it is absent.
 *
 * ★ A DOCUMENTATION CONSTANT, not a dispatch table. It is never read for control flow - the operation
 * switch is a `switch` over a closed union, and adding a key here cannot make anything reachable.
 * It exists so a reviewer can check the negative half of the surface against the source, and it is
 * exported for the net-new test tier, which can assert the set has not silently grown or shrunk.
 *
 * DEFECT 28 is the reason `getSkuStocksDeletableFlag` is absent below, and its marker is carried in
 * the canonical two-line form immediately above that entry rather than restated here.
 *
 * The defect is verified four ways and is the reason the member is absent from the ROUTED surface
 * and from the repository PORT alike: there are exactly three call sites in the whole repository
 * ([model/entity/Sku.cfc:L571], [model/service/SkuService.cfc:L281] and its DAO delegation at
 * [L282]); `model/dao/SkuDAO.cfc` declares no such method across its 228 lines; there is no match
 * anywhere under `org/Hibachi/`; and `org/Hibachi/HibachiDAO.cfc` declares no `onMissingMethod` at
 * all, so nothing can dispatch it and the failure surfaces as a raw CFML engine error rather than a
 * framework message. NO REPLACEMENT QUERY IS AUTHORED HERE OR ANYWHERE, the seven-member
 * `SkuRepository` port omits the member deliberately, and `./errorMapper.js` has nothing to map for
 * it - its missing-method recognizer is for the FRAMEWORK's dead-call-target contract, which this
 * defect never reaches. The service tier keeps the signature for interface parity and rejects when
 * called; the entity keeps `getStocksDeletableFlag(): never` for the same reason.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: `var hql &= "WHERE ..."` re-declares a variable already
 * declared at L152, which is not valid CFML.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Recorded because it sits on the `getProductSkus` path this module declines to publish. It is not
 * repaired here and nothing here depends on it.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` deletes the memo
 * only when the memo does NOT exist, so the condition is inverted and the clear can never fire.
 * Preserved deliberately; do not fix without a product decision.
 *
 * In the legacy that memo was component state on a long-lived DAO. In the target the whole graph
 * that would hold it is REQUEST-SCOPED, established by `./bootstrap.js`'s per-request scope factory,
 * so a memo cannot outlive the invocation that filled it. That is what neutralizes the inverted
 * clear without repairing it, and it is why {@link createSkuResolutionHandler} opens a FRESH scope on
 * every invocation and holds none across invocations. A module-scope cache of a request scope in this
 * file would re-open the defect and carry one caller's state into another's request.
 *
 * TODO CARRY-FORWARD [model/dao/SkuDAO.cfc:L177]: "test to see if this query works with DB's other
 * than MSSQL and MySQL" - the legacy TODO on `getSortedProductSkusID`, whose `ORDER BY` branches on
 * the database product name. Carried forward as a flagged TODO and NOT silently completed: the
 * dialect-parameterized statement lives in `src/repositories/mysql/sql/sortedProductSkus.sql.ts`,
 * only the MySQL branch is targeted, and no portability work is performed anywhere in this module.
 */
export const NON_EXPOSED_SURFACE_NOTES: Readonly<Record<string, string>> = Object.freeze({
  // LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag` calls a DAO
  // method that does not exist; it fails as a raw engine error, not a Hibachi message.
  // Preserved deliberately; do not fix without a product decision.
  getSkuStocksDeletableFlag:
    'Not exposed. [model/service/SkuService.cfc:L281] delegates to a SkuDAO method that does not ' +
    'exist and cannot be dispatched, so the legacy raises on every call. Reproduced at the service ' +
    'tier, deliberately omitted from the seven-member SkuRepository port, and no replacement query ' +
    'is authored anywhere.',

  /**
   * Takes a hydrated `Product`. Unreachable at this tier, and that is a property of the composition
   * root rather than a choice made here.
   */
  getProductSkus:
    'Not exposed. [model/service/SkuService.cfc:L220] takes a hydrated Product entity. ' +
    'RequestScope publishes no repository and no service publishes a load-by-identifier, and a ' +
    'primary adapter constructs no entity, so no Product instance can be obtained here. The ' +
    'option-based SKU resolution the AAP assigns to this capability is reached through ' +
    'getProductSkusBySelectedOptions, which takes identifiers.',

  /** Same entity-argument boundary, plus an ordering contract that must not be re-derived. */
  getSortedProductSkus:
    'Not exposed. [model/service/SkuService.cfc:L246] takes a hydrated Product entity, for the same ' +
    'reason as getProductSkus. Its ordering by option-group sort order ' +
    '[model/dao/SkuDAO.cfc:L172-L202] is CONTRACT and is reproduced in the repository statement; no ' +
    'sorting, re-sorting or re-ordering of any returned collection happens in this module.',

  /** The unbounded creation path is not published by this read-only capability. */
  createSkus:
    'Not exposed. Three independent reasons, each sufficient: it takes a hydrated Product entity; ' +
    'it is a durable mutation and the shared route table declares this capability GET-only, so a ' +
    'mutation behind it would invent HTTP semantics the source never had; and its odometer over the ' +
    'full cartesian product of option groups [model/service/SkuService.cfc:L105-L121] is unbounded ' +
    'by construction.',

  /** A durable mutation delegating to a STUB port. Absent for the same route-shape reason. */
  processImageUpload:
    'Not exposed. [model/service/SkuService.cfc:L210] is a durable write that delegates to the ' +
    'imageStore STUB port, whose stub behaviour is documented at the composition root. The route ' +
    'table declares this capability GET-only, so no write is routable here; publishing a stubbed ' +
    'write would let a caller mistake stub output for a real successful write. No image business ' +
    'logic is added anywhere in this module.',

  /** Out of scope, and one branch of it raises where a sibling branch is guarded. */
  subscriptionAndContentAccessSkuCreation:
    'Not exposed. The subscription branch [model/service/SkuService.cfc:L139-L170] and the ' +
    'contentAccess branch [L172-L202] are out of scope; the contentAccess branch has NO port and ' +
    'none is invented. The missing-guard asymmetry is preserved as written: [L142] and [L147] test ' +
    'for their input before reading it while [L163-L165] reads renewalSubscriptionBenefits with no ' +
    'guard and therefore raises. The guard is NOT added.',

  /** Out-of-scope features that happen to live in an in-scope service file. */
  outOfScopeProductProcesses:
    'Not exposed. processProduct_addProductReview [model/service/ProductService.cfc:L157], ' +
    'processProduct_addSubscriptionTerm [L173], processProduct_uploadDefaultImage [L235] and ' +
    'loadDataFromFile [L65] serve out-of-scope features. loadDataFromFile additionally sets a ' +
    'one-hour request timeout at [L66], which no request behind an API gateway can be given; no ' +
    'job queue, step function or queue hop is invented to work around that, because the source had ' +
    'none.',

  /**
   * ★★★ WITHDRAWN BY FINDING F18, NOT ABSENT BY DESIGN. This entry differs in kind from the others
   * above: the operation was PUBLISHED on this routed surface and has been removed, so it is recorded
   * here with the reason rather than simply disappearing.
   */
  getTransactionExistsFlag:
    'WITHDRAWN (finding F18). Was published as a routed operation and could never have answered. ' +
    '[model/service/SkuService.cfc:L285-L287] declares no parameters and forwards none, and ' +
    'MysqlSkuRepository.getTransactionExistsFlag raises a named SkuColumnError when neither ' +
    'productID nor skuID is supplied - which is CORRECT PARITY, because ' +
    '[model/dao/SkuDAO.cfc:L59-L63] takes its <cfelse> arm and executes with an UNDEFINED ' +
    'arguments.productID, so the legacy cannot serve that call either. Against the real composition ' +
    'the route could only ever produce a 500. Withdrawn rather than repaired: supplying an ' +
    'identifier means widening a signature the AAP fixes at getTransactionExistsFlag(): ' +
    'Promise<boolean> (AAP 0.4.2), and this tier holds no authority to reshape it. The service keeps ' +
    'its faithful raise and its own coverage; no test double papers over it here.',

  /**
   * ★★ WITHDRAWN BY FINDING F10. Unpaged and unboundable at this tier.
   */
  searchSkusByProductType:
    'WITHDRAWN (finding F10). Returns Sku[] complete and unpaged ' +
    '[model/service/SkuService.cfc:L271-L273], and no member of that signature can bound it. ' +
    'Bounding it means adding a parameter the legacy does not have, which is a signature reshaping ' +
    'this tier may not allocate. AAP 0.4.1 specifies this entrypoint as exposing ' +
    'getProductSkusBySelectedOptions and SKU lookup, so the action was never AAP-named. Still ' +
    'reachable in-process by any caller holding the service, with its own service-tier coverage.',

  /**
   * ★★ WITHDRAWN BY FINDING F10. A whole page, over criteria that declare no paging.
   */
  findSkus:
    'WITHDRAWN (finding F10). Returns a whole SkuPage, and SkuQueryCriteria declares NO paging ' +
    'members at all, so a routed contract has nothing to bound - a page size cannot be required of a ' +
    'caller and then forwarded to a criteria object with nowhere to put it. Adding paging members ' +
    'reshapes a signature the AAP has already spent its smart-list allocation on (AAP 0.6.2). Never ' +
    'AAP-named for this entrypoint. Still reachable in-process, with its own service-tier coverage.',

  /** The whole of the excluded pipeline, named so the boundary is explicit. */
  outOfScopeModules:
    'Not exposed. Nothing from OrderService, checkout, cart, payment, shipping, fulfillment, ' +
    'account, subscription, vendor or tax; nothing from the Taffy REST layer; nothing from the Mura ' +
    'CMS bridge; no integration adapter other than Google, which belongs to a different capability; ' +
    'and no org/Hibachi/** capability, which is a boundary to extract from and never modify.',
});

// ===========================================================================
// SECTION 6 - PROJECTION
//
// Pure, synchronous, total functions from an entity to a transport shape. No query, no arithmetic, no
// mutation and no accessor that can raise. Every one of them is a candidate for direct assertion by
// the net-new test tier without a composition root.
// ===========================================================================

/**
 * Render a monetary value for transport, at FULL PRECISION.
 *
 * ★ `toDecimalString()`, NOT `toFixed2()`, AND THE CHOICE IS DELIBERATE. `Money.toFixed2()` applies
 * CFML's `'0.00'` mask and therefore ROUNDS - it is a presentation step the legacy performs at the END
 * of a calculating function [model/service/PromotionService.cfc:L1017],
 * [model/service/PriceGroupService.cfc:L339], on a value it is about to display.
 * `Money.toDecimalString()` imposes no scale and renders every significant digit the value carries.
 *
 * A response body is a machine-readable document, not a display surface. Rounding a price on the way
 * out would be a coercion applied IN TRANSIT by a module whose whole obligation is to apply none, and
 * it would be lossy in exactly the case that matters: a converted price produced by step 3 of the
 * currency cascade [model/entity/Sku.cfc:L416-L428] can carry more than two decimals, and the SKU's
 * own columns are `big_decimal`. A consumer that wants two decimals can apply the mask; a consumer
 * given two decimals cannot recover what was dropped.
 *
 * The `Money` surface is CLOSED and is used exactly as published: no `Number()`, no `parseFloat`, no
 * `toFixed` on a raw number, no arithmetic, and `Money.zero` is never substituted for an absent
 * value anywhere in this module.
 *
 * @param amount - the monetary value to render.
 * @returns every significant digit of the value as a plain decimal numeral.
 */
function renderMoney(amount: { toDecimalString(): string }): string {
  return amount.toDecimalString();
}

/**
 * Render one per-currency cascade entry.
 *
 * ★ AN ABSENT MONEY MEMBER STAYS ABSENT. Each of the three money members is rendered only when the
 * cascade actually recorded one; otherwise the member is carried as `undefined`, which
 * `JSON.stringify` omits from the document. That is the faithful encoding of a CFML null return, and
 * the three alternatives are each wrong in a way that matters: `0` would silently price a product at
 * nothing, `null` would force every consumer to distinguish two absence markers where the domain has
 * one, and an empty object would look like a present-but-blank price.
 *
 * The `*Formatted` members are the cascade's OWN presentation strings and are copied verbatim - this
 * module formats nothing. `converted` is copied as the tri-state it is: `true`, `false`, or absent
 * when the currency matched no step of the cascade at all.
 *
 * @param detail - one entry of the materialized per-currency map.
 * @returns the transport form of that entry.
 */
function projectCurrencyDetail(detail: ResolvedCurrencyDetail): CurrencyDetailProjection {
  return {
    skuCurrencyID: detail.skuCurrencyID,
    price: detail.price === undefined ? undefined : renderMoney(detail.price),
    priceFormatted: detail.priceFormatted,
    listPrice: detail.listPrice === undefined ? undefined : renderMoney(detail.listPrice),
    listPriceFormatted: detail.listPriceFormatted,
    renewalPrice: detail.renewalPrice === undefined ? undefined : renderMoney(detail.renewalPrice),
    renewalPriceFormatted: detail.renewalPriceFormatted,
    converted: detail.converted,
  };
}

/**
 * Render the whole materialized per-currency map.
 *
 * ★ ENUMERATED THROUGH THE CFML STRUCT HELPERS RATHER THAN WITH AN AD-HOC OBJECT WALK. CFML struct
 * keys are matched case-insensitively and TypeScript's are not, so every struct read in this subtree
 * goes through `../lib/cfml/struct.js`: `structKeyList` hands back the keys exactly as stored, with
 * their original casing intact, and `structGet` reads back with CFML's case-insensitive matching and
 * reports absence as `undefined` rather than substituting a value. The semantics are never
 * re-derived locally, and `src/lib/cfml/` - locked at five files with no barrel - is not extended.
 *
 * The `undefined` arm of the read is handled explicitly even though a key just returned by
 * `structKeyList` must be present: `noUncheckedIndexedAccess` is on, a non-null assertion is banned
 * throughout `src/**`, and stating the impossible case is better than asserting it away.
 *
 * KEY CASING IS PRESERVED. Currency codes are published exactly as the cascade stored them; folding
 * them here would change a published document on a case convention this module has no authority over.
 *
 * @param sku - the SKU whose map is to be rendered.
 * @returns the transport form of the map; `{}` when the map is empty, which is a legitimate state.
 */
function projectCurrencyDetails(
  sku: ResolvedSku,
): Readonly<Record<string, CurrencyDetailProjection>> {
  const details = sku.getCurrencyDetails();
  const projected: Record<string, CurrencyDetailProjection> = {};

  for (const currencyCode of structKeyList(details)) {
    const detail = structGet(details, currencyCode);

    if (detail === undefined) {
      continue;
    }

    projected[currencyCode] = projectCurrencyDetail(detail);
  }

  return projected;
}

/**
 * Render one SKU.
 *
 * Reads only synchronous, total accessors over already-materialized state. None of the five
 * throwing members of the entity is touched, and no accessor used here issues a query - so this
 * function cannot fail and cannot turn a successful read into a failure response.
 *
 * `skuCode`, `imageFile` and `productID` are carried as `undefined` when absent and are therefore
 * omitted from the serialized document, for the reason recorded on {@link projectCurrencyDetail}.
 *
 * @param sku - the SKU to render.
 * @returns its transport form.
 */
function projectSku(sku: ResolvedSku): SkuProjection {
  const product = sku.getProduct();

  return {
    skuID: sku.getSkuID(),
    skuCode: sku.getSkuCode(),
    activeFlag: sku.getActiveFlag(),
    price: renderMoney(sku.getPrice()),
    listPrice: renderMoney(sku.getListPrice()),
    renewalPrice: renderMoney(sku.getRenewalPrice()),
    imageFile: sku.getImageFile(),
    userDefinedPriceFlag: sku.getUserDefinedPriceFlag(),
    optionIDList: sku.getOptionsIDList(),
    productID: product === undefined ? undefined : product.getProductID(),
    currencyDetails: projectCurrencyDetails(sku),
  };
}

/**
 * Render a collection of SKUs.
 *
 * ★★ ORDER IS PRESERVED EXACTLY, AND NOTHING ELSE HAPPENS TO THE COLLECTION. No filtering, no
 * narrowing, no widening, no de-duplication, no sorting and no re-ordering - a plain positional map.
 * Any of those applied here would silently change must-preserve behaviour:
 * `getProductSkusBySelectedOptions` derives its result from AND-of-EXISTS matching
 * [model/dao/SkuDAO.cfc:L107-L128] and `getSortedProductSkus`' ordering contract is the option-group
 * sort order [model/dao/SkuDAO.cfc:L172-L202]. Whatever the service returned is what is published,
 * in the order it was returned.
 *
 * @param skus - the collection exactly as the service returned it.
 * @returns the same collection, same length, same order, in transport form.
 */
function projectSkus(skus: readonly ResolvedSku[]): readonly SkuProjection[] {
  return skus.map((sku) => projectSku(sku));
}

// ★ `projectSkuPage` USED TO SIT HERE AND WENT WITH `findSkus` (finding F10). It copied the page's
// three non-SKU members straight through; nothing it did is needed by either surviving operation.

// ===========================================================================
// SECTION 7 - VALIDATION AND DISPATCH, AS TWO STEPS
//
// ★★ THE SPLIT IS LOAD-BEARING. VALIDATION IS TOTAL AND COMES FIRST, ahead of any wiring.
//
// {@link validateInvocation} is pure, synchronous and reaches nothing: it either produces a
// fully-typed invocation or throws, and it validates the operation NAME and the arguments that
// operation declares in the same step. {@link invokeOperation} then takes that value and calls exactly
// one service method.
//
// Interleaving the two - validating each operation's arguments inside its dispatch arm - would put the
// composition root and an open request scope ahead of an argument-level rejection, so a request naming
// a valid operation while omitting a required argument would reach the database tier before being
// refused. Keeping them separate is what makes "an unusable request opens no connection and no request
// scope" a STRUCTURAL property rather than a claim about ordering.
// ===========================================================================

/**
 * One validated invocation: the operation, plus exactly the arguments that operation takes.
 *
 * A discriminated union on `operation`, so the dispatcher reads only arguments the operation actually
 * declares, and the compiler rejects a reference to any other. Every member is the ARGUMENT LIST of a
 * ported method, spelled in the legacy's own parameter names.
 */
type ValidatedInvocation =
  | {
      readonly operation: 'getProductSkusBySelectedOptions';
      /** ★ Comma-delimited, verbatim. Never parsed, split, trimmed, sorted or de-duplicated. */
      readonly selectedOptions: string;
      readonly productID: string;
    }
  | {
      readonly operation: 'getSkuBySkuCode';
      readonly skuCode?: string | undefined;
    };

/**
 * Validate a request into an invocation, or throw.
 *
 * PURE, SYNCHRONOUS AND TOTAL. It reaches no collaborator, opens no scope, awaits nothing and has no
 * side effect, which is what lets it run before any wiring and makes it directly assertable on its own.
 *
 * The operation is validated first, through the struct-shaped envelope so the failure carries the field
 * path `operation`; then the arguments that operation declares are validated by its own schema, so a
 * failure names the field the caller can correct. Every schema throws its validator error, which the
 * single `catch` in {@link createSkuResolutionHandler} hands to `./errorMapper.js` - whose validation
 * arm publishes field paths and constraint descriptions and NEVER the submitted values.
 *
 * @param parameters - the request's query parameters, unvalidated.
 * @returns a fully-typed invocation.
 * @throws the validator's error when the operation is unrecognized, or when an argument the operation
 *   requires is absent or ill-typed.
 */
function validateInvocation(
  parameters: Readonly<Record<string, string | undefined>>,
): ValidatedInvocation {
  const { operation } = operationEnvelopeSchema.parse(parameters);

  switch (operation) {
    case 'getProductSkusBySelectedOptions': {
      const input = getProductSkusBySelectedOptionsSchema.parse(parameters);

      return {
        operation,
        selectedOptions: input.selectedOptions,
        productID: input.productID,
      };
    }

    case 'getSkuBySkuCode': {
      const input = getSkuBySkuCodeSchema.parse(parameters);

      return { operation, skuCode: input.skuCode };
    }
  }
}

/**
 * Invoke EXACTLY ONE ported service method and project its result.
 *
 * ★ ONE `switch` OVER A CLOSED UNION, ONE SERVICE CALL PER ARM, AND NO LOGIC BETWEEN THEM. Each arm
 * forwards its already-validated arguments UNCHANGED and IN DECLARATION ORDER, and projects what comes
 * back. Nothing is computed, defaulted, coerced, combined, filtered or reordered on either side of the
 * call. Because the union is closed and every member has an arm, the compiler rejects both a missing
 * arm and a member that is not an operation - there is no fall-through and no default branch to hide
 * one.
 *
 * @param invocation - the validated operation and its arguments.
 * @param scope - THIS invocation's request scope. Opened once by the caller and never reused.
 * @returns what the invoked operation produced, in transport form.
 * @throws whatever the invoked service method throws. It is NOT caught here: the handler has exactly
 *   one mapping point, and adding a second would let a failure be classified twice.
 */
async function invokeOperation(
  invocation: ValidatedInvocation,
  scope: RequestScope,
): Promise<SkuResolutionOutcome> {
  switch (invocation.operation) {
    case 'getProductSkusBySelectedOptions': {
      // ★★ MUST-PRESERVE. Both arguments forwarded verbatim, in declaration order, with
      // `selectedOptions` still the comma-delimited string the caller sent - unparsed, untrimmed,
      // unsorted, un-deduplicated and not case-folded. The AND-of-EXISTS matching and its parameter
      // binding live behind the repository; this arm adds nothing to either side of the call.
      const skus = await scope.productService.getProductSkusBySelectedOptions(
        invocation.selectedOptions,
        invocation.productID,
      );

      return { operation: invocation.operation, skus: projectSkus(skus) };
    }

    case 'getSkuBySkuCode': {
      const sku = await scope.skuService.getSkuBySkuCode(invocation.skuCode);

      // ★ `undefined` ON A MISS, CARRIED THROUGH. Not `0`, not `null`, not an empty object, and not a
      // SKU with zeroed prices. The member is set to `undefined` and `JSON.stringify` omits it.
      return {
        operation: invocation.operation,
        sku: sku === undefined ? undefined : projectSku(sku),
      };
    }
  }
}

// ===========================================================================
// SECTION 8 - THE HANDLER
// ===========================================================================

/**
 * The one member of the Lambda invocation context this module reads.
 *
 * JUDGMENT CALL: a minimal structural shape rather than the full `Context` interface. Only the
 * invocation identifier is ever read, and taking the whole interface would force the net-new test tier
 * to fabricate a dozen unrelated members - a fake with more surface than the thing it stands in for.
 * The platform's own context object satisfies this shape structurally, so nothing is lost at the real
 * boundary. Nothing else about the invocation is read: no remaining time, no function name, no
 * identity, no client context.
 */
export interface InvocationIdentity {
  /** The platform's identifier for this invocation. */
  readonly awsRequestId: string;
}

/**
 * The signature this module publishes as its Lambda entry point.
 *
 * The invocation context is OPTIONAL because it is only a fallback source of the correlation
 * identifier, and because a suite driving this handler should not have to supply one to exercise the
 * ordinary path. The callback-style third parameter of the platform's own handler type is deliberately
 * not modelled: this handler always returns a promise, which is the supported form, and modelling a
 * callback would publish a second protocol nobody uses.
 */
export type SkuResolutionHandler = (
  event: APIGatewayProxyEvent,
  context?: InvocationIdentity,
) => Promise<APIGatewayProxyResult>;

/**
 * The two collaborators this handler reaches outside itself.
 *
 * ★ THE INJECTION SEAM, AND THE REASON IT EXISTS. The handler tier's own suite must be able to drive
 * this module against an isolated graph WITHOUT patching module state - no module mock, no
 * monkey-patched import, no reset hook. Supplying a `bootstrap` closure that itself calls
 * `bootstrapCompositionRoot` with overrides is the whole mechanism: any overrides bypass the module
 * memo entirely, which is what the composition root publishes as its test seam.
 *
 * Deliberately only two members. Nothing else in this module is a collaborator: the router and the
 * error mapper are pure functions over data, and the projection functions are pure. Widening this
 * interface would create seams that let a suite pass while asserting nothing real.
 */
export interface SkuResolutionHandlerDependencies {
  /**
   * Obtain the wired graph.
   *
   * Defaults to `bootstrapCompositionRoot` with no overrides, which is the production path: idempotent
   * and memoized, so the first invocation on a cold container performs the wiring, every concurrent
   * caller awaits the same in-flight promise, a warm container resolves immediately, and a FAILED
   * initialization clears the memo so a later invocation can retry rather than inheriting a
   * permanently rejected promise.
   *
   * ★ AWAITED INSIDE THE HANDLER, NEVER AT MODULE TOP LEVEL. The Lambda artifact is CommonJS, so a
   * top-level `await` is not available - but the reason to avoid it is not the bundle format: an
   * initialization failure at module load is a container-level fault with no request to attribute it
   * to, whereas the same failure inside an invocation is mapped to a response and logged under the
   * caller's correlation identifier.
   */
  readonly bootstrap: () => Promise<CompositionRoot>;

  /**
   * Where this module's own structured lines go, and where `./errorMapper.js` emits through.
   *
   * Defaults to the process logger. Passed explicitly into the error-mapping context, which is the
   * same substitution this port makes everywhere for the legacy ambient request scope, and which is
   * what lets a suite observe an emission without this module importing a second sink.
   */
  readonly logger: Logger;
}

// ★★★ THE LOCAL `resolveRequestId` IS GONE, AND ITS PRECEDENCE WAS THE ONE THAT WAS WRONG.
// It preferred `event.requestContext.requestId` - the gateway's identifier - on the reasoning that
// "that is the value a caller sees and can quote", then fell back to the runtime's `awsRequestId`,
// then to a local `'uncorrelated'` token. Correlation review (finding F8) measured all five
// entrypoints and found THIS module was the only one in that order; its three siblings preferred the
// runtime identifier.
//
// THE SHARED POLICY WINS ON A CONCRETE ARGUMENT RATHER THAN ON UNIFORMITY ALONE. The runtime's
// `awsRequestId` is the identifier the platform's own START/END/REPORT lines carry for THIS execution,
// so an operator joining a response to a log stream lands on the right invocation even when the
// gateway retried and produced TWO executions under ONE gateway identifier - which is exactly the case
// the old precedence resolved the wrong way. `resolveServerRequestId` in `./errorMapper.js` owns it
// now, along with the fallback token, and reads nothing from a header in either module.

/**
 * The query parameters of the request, as a struct.
 *
 * API Gateway supplies `null` rather than an empty object when a request carries no query string, so
 * the two cases are collapsed to one empty struct here - which lets every schema below report an
 * absent parameter in the same way whether the query string was empty or missing altogether.
 *
 * ★★ THE PREVIOUS REVISION IGNORED THE MULTI-VALUED MAP, AND THAT WAS THE DEFECT. It read: "ONLY the
 * single-valued parameter map is read. The multi-valued map is deliberately ignored: a repeated
 * parameter has no meaning in either published operation, and giving one a meaning would be inventing a
 * request grammar the source never had." The first clause of that reasoning is right and the conclusion
 * does not follow from it: a repeated parameter having NO meaning is precisely why it must be REFUSED
 * rather than silently resolved to whichever value the single-valued map happened to keep. Request-binding
 * review (finding F11) named that silent resolution as an undocumented choice made where the caller
 * cannot see it. {@link countSuppliedValues} performs the refusal; this function still reads
 * only the single-valued map, because by the time it runs the two maps are known to agree.
 *
 * @param event - the proxy event.
 * @returns the query parameters, or an empty struct.
 */
function readQueryParameters(
  event: APIGatewayProxyEvent,
): Readonly<Record<string, string | undefined>> {
  return event.queryStringParameters ?? {};
}

/**
 * The largest number of values any one query parameter carried.
 *
 * API Gateway reports every value of a repeated parameter on `multiValueQueryStringParameters` while
 * the single-valued map keeps only one of them, so counting there is the only way to notice. An event
 * synthesized without the multi-value map reports one rather than pretending that a repeat occurred.
 *
 * @param event - the proxy event.
 * @returns the maximum multiplicity across supplied parameters; `1` when nothing repeated.
 */
function countSuppliedValues(event: APIGatewayProxyEvent): number {
  const repeated = event.multiValueQueryStringParameters;

  if (repeated === null || repeated === undefined) {
    return 1;
  }

  let widest = 1;
  for (const values of Object.values(repeated)) {
    if (values !== undefined && values.length > widest) {
      widest = values.length;
    }
  }

  return widest;
}

/**
 * Serialize a success body.
 *
 * ★ THE ONE PLACE AN ABSENT VALUE BECOMES AN ABSENT MEMBER, and the encoding is deliberate.
 * `JSON.stringify` OMITS a member whose value is `undefined`, so a `getSkuBySkuCode` miss produces a
 * document with no `sku` member at all. A consumer then reads `undefined` - the exact value the
 * service answered - rather than a second absence marker it has to translate. `null` would introduce
 * that translation step, `0` would price a product at nothing, and `{}` would look like a
 * present-but-blank SKU. The same encoding applies to every optional member of
 * {@link SkuProjection} and {@link CurrencyDetailProjection}.
 *
 * ★ THE OUTER DOCUMENT IS NO LONGER BUILT HERE. This function used to assemble a whole response - its
 * own status, its own header set and its own `{requestId, outcome}` body. Finding F13 moved the outer
 * document to `./errorMapper.js`'s `jsonSuccessResponse`, which every capability now shares, so what
 * remains here is the capability payload and the omission semantics that are genuinely this module's.
 * The omission behaviour is unchanged and is the reason this function still exists at all rather than
 * being inlined: `JSON.stringify` runs inside the shared builder, so `undefined` still becomes an
 * ABSENT member exactly as before.
 *
 * @param outcome - what the dispatched operation produced.
 * @param requestId - the correlation identifier the shared envelope echoes.
 * @returns the response, with the shared success status, header set and envelope.
 */
function serializeOutcome(outcome: SkuResolutionOutcome, requestId: string): APIGatewayProxyResult {
  const document: SkuResolutionResultDocument = { outcome };

  return jsonSuccessResponse(requestId, SKU_RESOLUTION_CAPABILITY, SKU_RESOLUTION_ACTION, document);
}

/**
 * How many results an outcome carried, for the log line only.
 *
 * A COUNT, which is legible and carries no secret - the same reasoning the composition root applies
 * when it logs a row count. It is emitted so an operator can tell an empty result from a populated
 * one without re-running the request. NO DURATION, RATE OR SIZE IS MEASURED OR EMITTED anywhere in
 * this module.
 *
 * @param outcome - what the dispatched operation produced.
 * @returns the number of SKUs the outcome carried; `0` for the boolean operation and for a miss.
 */
function countResults(outcome: SkuResolutionOutcome): number {
  switch (outcome.operation) {
    case 'getProductSkusBySelectedOptions':
      return outcome.skus.length;

    case 'getSkuBySkuCode':
      return outcome.sku === undefined ? 0 : 1;
  }
}

/**
 * Build the SKU resolution handler.
 *
 * ★ THE PRIMARY UNIT'S FACTORY. {@link handler} is this function called with no arguments, which is
 * the production path; a suite calls it with a `bootstrap` closure of its own and drives the whole
 * module without touching module state. Overrides are shallow-merged over the defaults, so a suite
 * substituting one collaborator keeps the real other one.
 *
 * THE INVOCATION, IN ORDER, AND NOTHING ELSE:
 *
 *   1. Resolve the correlation identifier and build the error-mapping context. The context is built
 *      FIRST so that every subsequent failure - including one from the composition root - is reported
 *      under the caller's identifier.
 *   2. Resolve the route through `./router.js`, restricted to this capability. A path belonging to
 *      another capability, or a method this route does not answer, is reported exactly as an unmatched
 *      route: the response comes from `./errorMapper.js`, which also emits the single log line for it.
 *      Leaking the existence of the other four capabilities through a distinct outcome is precisely
 *      what that folding prevents.
 *   3. Verify the resolved action is the one this module implements, and treat anything else as a
 *      non-route. Unreachable while the shared table holds one route per capability, and stated
 *      anyway because the table is additive by design.
 *   4. REFUSE A REPEATED QUERY PARAMETER. Asked before anything reads one, because a repeat is
 *      invisible to the single-valued map every schema reads - by then one of the caller's two values
 *      has already been discarded and no schema can notice (finding F11).
 *   5. Read the operation. Its absence is a rejection the handler ITSELF establishes, so it is
 *      reported through `invalidRequestResponse` with the reason named from the error mapper's closed
 *      union - the words belong to that module, not to this one. An operation that is present but
 *      unrecognized fails validation instead and reaches the same client-shaped status with the field
 *      path `operation` attached.
 *   6. VALIDATE COMPLETELY, BEFORE ANY WIRING. Both the operation AND the arguments it declares are
 *      validated while nothing has been awaited, so AN UNUSABLE REQUEST OPENS NO CONNECTION AND NO
 *      REQUEST SCOPE. That is a structural property of the ordering here plus the purity of
 *      {@link validateInvocation}, not a claim about intent.
 *   7. Await the memoized composition root, then open EXACTLY ONE request scope, then invoke EXACTLY
 *      ONE service method.
 *   8. Serialize through the SHARED success envelope. One `catch` maps anything thrown, through the
 *      ROUTED mapping context so the failure is logged against the endpoint that produced it.
 *
 * ★ EXACTLY ONE REQUEST SCOPE PER INVOCATION, AND NONE HELD BETWEEN THEM. The scope is a local, it is
 * created after validation and discarded when the invocation returns, and nothing in this module
 * caches one at module scope. That is what keeps a warm container from carrying one caller's memoized
 * state - a currency map, a rounding-rule memo, the option-group sort-order memo whose legacy clear
 * can never fire - into another caller's request. The COMPOSITION ROOT is memoized across warm
 * invocations, deliberately, and the two are different things: the root holds stateless wiring, the
 * scope holds one request's state.
 *
 * ★ NO REQUEST STATE IS READ FROM `../lib/config.js`. That module is STATIC PROCESS CONFIGURATION and
 * is never a request scope; this module does not import it. The scope receives only the account
 * identifier established by `resolveRequestPrincipal`; `adminAccountFlag`, `now` and `feedHost` stay
 * omitted because this route performs no administrative write, owns no clock policy and renders no
 * feed. A missing principal is refused before validation or wiring rather than represented as a
 * logged-out scope.
 *
 * @param overrides - collaborators to substitute. Omit for the production path.
 * @returns the Lambda entry point.
 */
export function createSkuResolutionHandler(
  overrides?: Partial<SkuResolutionHandlerDependencies>,
): SkuResolutionHandler {
  const dependencies: SkuResolutionHandlerDependencies = {
    bootstrap: overrides?.bootstrap ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot()),
    logger: overrides?.logger ?? processLogger,
  };

  return async (
    event: APIGatewayProxyEvent,
    context?: InvocationIdentity,
  ): Promise<APIGatewayProxyResult> => {
    // ★ THE SHARED CORRELATION POLICY, NOT THIS MODULE'S OWN (finding F8). Runtime identifier first,
    // then the gateway's, then the shared fallback token - and nothing from a header in either case.
    const requestId = resolveServerRequestId(event, context);

    // ★★ ONE MAPPING CONTEXT FOR THE WHOLE INVOCATION, REASSIGNED ONCE WHEN THE ROUTE IS KNOWN. It
    // starts without a route because none has been resolved yet, and it is the SAME object the single
    // `catch` below reads - so a failure raised after routing is logged WITH the route rather than
    // through a separate unrouted context. Finding F8 named the route's absence from error and success
    // lines as the defect; carrying it on one mutable local is what fixes both at once without
    // introducing a second mapping point.
    let mappingContext: ErrorMappingContext = {
      requestId,
      logger: dependencies.logger,
    };

    try {
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        SKU_RESOLUTION_CAPABILITY,
        mappingContext,
      );

      if (!resolution.matched) {
        return resolution.response;
      }

      // ★ BUILT FROM THE MATCHED ROW'S OWN FROZEN MEMBERS AND FROM NOTHING THE CALLER SENT. The router
      // matches the method with `listFindNoCase`, so `event.httpMethod` may differ from the table's
      // declaration in case and would put a caller-controlled string on the log line for no diagnostic
      // gain. Using the row instead keeps the label one of a CLOSED set of five. It reaches the log
      // stream only and is never echoed into a response body.
      mappingContext = {
        requestId,
        route: routeDiagnosticLabel(resolution.route.methods, resolution.route.path),
        logger: dependencies.logger,
      };

      if (resolution.route.action !== SKU_RESOLUTION_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // Fail closed after routing and before query parsing or graph construction. Identity comes only
      // from the authorizer context; `requestContext.identity` remains deliberately unread.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        return unauthenticatedResponse(mappingContext);
      }

      // ★★ REPEATED PARAMETERS ARE REFUSED BEFORE ANYTHING READS ONE (finding F11). Asked here rather
      // than inside a schema because a repeat is invisible to the single-valued map every schema reads:
      // by the time `readQueryParameters` runs, one of the caller's two values has already been
      // discarded, and no schema can notice that it happened.
      if (countSuppliedValues(event) > MAXIMUM_VALUES_PER_PARAMETER) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          REPEATED_PARAMETER_ISSUE,
        ]);
      }

      const parameters = readQueryParameters(event);
      const requestedOperation = parameters[OPERATION_QUERY_PARAMETER];

      if (requestedOperation === undefined || requestedOperation === '') {
        return invalidRequestResponse('missingQueryParameter', mappingContext);
      }

      // TOTAL VALIDATION, BEFORE ANY WIRING. Nothing below this line runs for a request whose
      // operation is unrecognized or whose arguments are unusable - see the section 7 header.
      const invocation = validateInvocation(parameters);

      if (!hasClosedParameterSet(invocation.operation, parameters)) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNPUBLISHED_PARAMETER_ISSUE,
        ]);
      }

      const compositionRoot = await dependencies.bootstrap();
      const scope = await compositionRoot.createRequestScope({
        accountID: principalResolution.principal.accountID,
      });

      const outcome = await invokeOperation(invocation, scope);

      // A count, the operation name and the route only. The operation name and the route label are
      // closed literals of this module's and the route table's own making, and the count is a number -
      // none can carry a caller-supplied value, a credential, a connection string or a statement
      // fragment. The route is emitted on the SUCCESS line as well as the failure one (finding F8), so
      // an operator can group both by endpoint.
      dependencies.logger.info('sku resolution operation completed', {
        capability: SKU_RESOLUTION_CAPABILITY,
        operation: outcome.operation,
        requestId,
        route: mappingContext.route,
        resultCount: countResults(outcome),
      });

      return serializeOutcome(outcome, requestId);
    } catch (thrown: unknown) {
      // THE SINGLE MAPPING POINT. The caught value is passed as `unknown` and is narrowed inside
      // `./errorMapper.js` by `instanceof` and bounded property probes - never cast here, never
      // inspected here, and never interpolated into a message here. That module is SELECTIVE rather
      // than a pass-through for a concrete reason: the MySQL driver's errors routinely embed statement
      // text and bound parameter values, so echoing a caught message into a body would leak both.
      //
      // Three failure shapes reach this arm and are each handled there, not here: a validator error
      // becomes a client-shaped rejection carrying field paths and constraint descriptions but never
      // the submitted values; the framework's dead-call-target contract becomes a server-shaped
      // response reproducing that contract's message, which is the one message published verbatim;
      // and everything else becomes a fixed generic sentence with the real detail on the log stream
      // under this same correlation identifier.
      //
      // ★ NOTHING IS CAUGHT-AND-DEFAULTED. A raise that IS the observable legacy behaviour - the dead
      // `calculateSkuPriceBasedOnPromotion` call behind `Sku.getPriceByPromotion`
      // [model/entity/Sku.cfc:L258], or `getSkuStocksDeletableFlag`'s missing DAO member
      // [model/service/SkuService.cfc:L281] - is reported, never silenced and never replaced by a
      // substituted value. This module reaches neither of them, and if one arrived it would surface.
      //
      // ★ THE ROUTED CONTEXT, not an unrouted one. `mappingContext` carries the route from the moment
      // the router matched, so a failure classified here is logged against the endpoint that produced
      // it (finding F8).
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * THE LAMBDA ENTRY POINT.
 *
 * The primary exported unit of this module and the symbol the bundle publishes. Constructed at module
 * load, which is synchronous factory wiring and NOT initialization: no composition root is built, no
 * configuration is read, no connection is opened and no `await` runs until an invocation arrives.
 *
 * There is no barrel and no `index.ts` anywhere in this subtree, and nothing imports from this
 * module - `src/handlers/` is the inversion point.
 */
export const handler: SkuResolutionHandler = createSkuResolutionHandler();
