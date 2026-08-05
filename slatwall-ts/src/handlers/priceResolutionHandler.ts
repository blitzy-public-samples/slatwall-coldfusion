// ===========================================================================
// PRICE RESOLUTION - LAMBDA ENTRY POINT (bundle entry point 3 of 5)
//
// A NET-NEW primary adapter over the price-group and currency resolution surface of
// `../services/priceGroupService.js` and `../domain/ports/currencyConverter.js`. AAP 0.4.1's
// handler table records this row with source file "-" and change "Net-new entrypoint exposing the
// price-group and currency resolution surface", so NOTHING HERE IS A PORT OF A LEGACY FILE: there
// is no `.cfc` antecedent for a Lambda entrypoint, no FW/1 controller behind it, and no legacy
// route. Every legacy citation below is PROVENANCE for a decision, never a transformation of a
// file this module owns.
//
// ★ COVERAGE IS NET-NEW AND IS FLAGGED AS NET-NEW, NEVER AS PARITY (B8). The whole handler tier is
//   net-new coverage: the only three legacy test files touching the in-scope slice are
//   `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc` and the EMPTY
//   `meta/tests/functional/admin/entity/ProductTest.cfc`, none of which asserts anything about a
//   handler. Assertions for this module live in `tests/unit/handlers/priceResolutionHandler.test.ts`
//   and are authored by the test tier; no test file is authored here.
//
// ★★ THIS ENTRYPOINT FRONTS MUST-PRESERVE AREA 2 - THE PRICE-GROUP AND CURRENCY RESOLUTION
//    CASCADE (B2). It therefore does the least it can: it translates a request into the domain
//    inputs a ported service already accepts, calls ONE outcome-producing member, and serialises
//    what came back. NO COERCION, NO DEFAULTING, NO REORDERING, NO CLAMPING AND NO ROUNDING
//    "CORRECTION" HAPPENS IN TRANSIT. In particular:
//
//      * The five-level cascade [model/service/PriceGroupService.cfc:L140-L181] is neither
//        reordered, short-circuited, memoized nor "optimised" here. Its two documented
//        asymmetries - the parent recursion at [L174] and the rounding rule applied only on the
//        `percentageOff` branch [L316-L340] - are service-tier behaviour and are left alone.
//      * `RoundingRuleService.roundValue()` [model/service/RoundingRuleService.cfc:L88-L175] is
//        decimal-STRING manipulation and its measured outputs are counter-intuitive by design -
//        `12.30` with `.99` yields `12.99`, `7.42` with `9.99` yields `9.99`, `2.30` with `0.99`
//        yields `0.99`, and the default expression `"0.00"` turns `12.3456` into `10.00`. NO PRICE
//        THIS MODULE SERIALISES IS POST-PROCESSED, SANITY-CHECKED, CLAMPED OR REJECTED FOR LOOKING
//        WRONG.
//      * `Sku.getPriceByCurrencyCode` and its two siblings answer NOTHING for a currency they have
//        no price for [model/entity/Sku.cfc:L269-L285]. That absence is serialised STRUCTURALLY -
//        never as `0`, never as a `null` a consumer can default, never as an empty `Money`, and
//        never as an omitted key. Substituting zero would sell products for free.
//
// ★ WHAT THIS MODULE IS. Parse the API Gateway event; resolve the action through `./router.js`;
//   obtain the wired graph from `./bootstrap.js` through its idempotent memoized initializer;
//   open exactly ONE request scope; invoke ONE already-ported member; serialise; map anything
//   thrown through `./errorMapper.js`.
//
// ★ WHAT THIS MODULE IS NOT. It contains NO BUSINESS LOGIC. No cascade walking, no rate selection,
//   no rounding, no percentage arithmetic, no currency conversion, no `Money` arithmetic, no SQL,
//   no entity construction and no settings resolution. Every one of those lives in
//   `../services/**` or `../domain/**`. If a line here made a pricing decision it would be in the
//   wrong file. It also constructs no service, no repository, no port and no connection pool -
//   `./bootstrap.js` is the only composition root - and it never reads request state from
//   `../lib/config.js`, which is STATIC PROCESS CONFIGURATION and never a request scope.
//
// ★ DEPENDENCY DIRECTION. This module IMPORTS `./router.js`; the router never imports a handler.
//   The router owns RESOLUTION, a handler owns INVOCATION. `src/handlers/` is the inversion point
//   of the whole subtree: it imports its siblings and NOTHING imports from it, so there is no
//   back-edge and no cycle. Nor does it import another capability handler.
//
// ★★ THE THREE THINGS THIS MODULE DELIBERATELY DOES NOT EXPOSE, each argued where it is decided:
//      1. `updateOrderAmountsWithPriceGroups` - section 6.11, the cross-service ordering constraint.
//      2. The service's three WRITE members - section 6.12.
//      3. Two of the currency port's three members - section 6.13.
//
// ★ BUNDLE FORMAT IS A SOLVED PROBLEM AND IS NOT RE-LITIGATED HERE. `esbuild.config.mjs` emits
//   CommonJS (`format: 'cjs'`) because bundling this dependency set to ESM builds cleanly and then
//   fails at run time with `Dynamic require of "node:buffer"` through mysql2 -> sql-escaper. The
//   consequence for this file is concrete and load-bearing: NO `import.meta` AND NO TOP-LEVEL
//   `await`. The memoized initializer is therefore awaited INSIDE the handler, never at module
//   scope. TypeScript source stays `NodeNext`; only the emitted bundle format differs. No bundler,
//   manifest or configuration file is authored, edited or duplicated here - they all live one level
//   above this folder.
//
// ★ NO USER RULES EXIST FOR THIS PROJECT. `review_rules` returns the single line "No user rules
//   provided." for both a default read and an explicit whole-document read, so there is no rules
//   document to comply with and NO RULE IS INVENTED, IMPLIED OR CITED anywhere in this file. Every
//   constraint traces to the AAP, to a cited legacy locator, or to an explicit `// JUDGMENT CALL:`.
//   Their absence is not licence to lower the bar: the enterprise standards this subtree already
//   holds itself to - maximal strictness, one arithmetic surface, parameterised SQL,
//   environment-driven configuration with no credential in source, annotated judgment calls - are
//   applied here in full.
//
// ★ NO INVENTED NON-FUNCTIONAL REQUIREMENT APPEARS IN THIS FILE OR ITS COMMENTS (B7). No SLA, no
//   latency, throughput, uptime or availability figure, and no performance claim. Lambda's 15-minute
//   ceiling and API Gateway's 29-second ceiling are PLATFORM FACTS and neither is restated as a
//   target. The legacy 60-second, 45-second and 30-second lock timeouts are NOTED AND DELIBERATELY
//   NOT IMPLEMENTED. `cfthread` usage across the in-scope slice is zero, so no worker thread is
//   introduced.
//
// ★ NO HTTP STATUS SEMANTICS THE SOURCE NEVER HAD ARE INVENTED. The legacy slice has no HTTP status
//   vocabulary at all. `./errorMapper.js` owns every status this module can produce - 400, 404 and
//   500 - and nothing here mints a 401, 403, 409, 422 or 429, a retry-after, a rate limit or a
//   circuit breaker. A request that names something unresolvable is answered with the mapper's own
//   invalid-request vocabulary; a DOMAIN outcome that resolved to nothing is answered successfully,
//   with the absence stated in the body.
// ===========================================================================

import { z } from 'zod';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { bootstrapCompositionRoot } from './bootstrap.js';
import type { PriceResolutionCapability, RequestScope, RequestScopeInput } from './bootstrap.js';
import { invalidRequestResponse, mapErrorToApiGatewayResponse } from './errorMapper.js';
import type { ErrorMappingContext, InvalidRequestReason } from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import type { CurrencyConverter } from '../domain/ports/currencyConverter.js';
import type { CurrentAccountContext } from '../domain/ports/priceGroupRepository.js';
import { toCurrencyCode } from '../domain/valueObjects/currencyCode.js';
import { Money } from '../domain/valueObjects/money.js';
import { cfEquals, structGet } from '../lib/cfml/struct.js';
import { logger } from '../lib/logger.js';

// Two declared dependencies of this module are deliberately NOT imported, and each absence is a
// decision rather than an omission:
//
//   * `../services/roundingRuleService.js`. Rounding on the `percentageOff` branch is invoked
//     through the ENTITY - [model/service/PriceGroupService.cfc:L326-L328] calls
//     `arguments.priceGroupRate.getRoundingRule().roundValue(newPrice)`, and
//     `RoundingRule.roundValue(value)` is a ONE-ARGUMENT entity method
//     [model/entity/RoundingRule.cfc:L66-L68]. That is exactly why `PriceGroupService.cfc` declares
//     only three collaborators at [L51], [L53] and [L54] and never injects `roundingRuleService`.
//     Routing rounding through the service from here would invent a dependency the source does not
//     have.
//   * `../domain/ports/settingsProvider.js`. `skuCurrency` and `skuEligibleCurrencies` are resolved
//     ONLY through the settings provider `./bootstrap.js` already holds - `skuEligibleCurrencies`
//     eagerly, inside the memoized initializer, because its own default is a LIVE DATA LOOKUP
//     [model/service/SettingService.cfc:L222]. This module must not resolve either, must not cache
//     either and must not supply a fallback list. It also contains NO hardcoded `'USD'`: that
//     default lives in the setting declaration
//     `skuCurrency = {fieldType="select", defaultValue="USD"}`
//     [model/service/SettingService.cfc:L221], and `Sku.getCurrencyCode()`
//     [model/entity/Sku.cfc:L360-L365] merely memoizes it.

// ===========================================================================
// SECTION 1 - THE REQUEST CONTRACT
//
// ★ ONE ROUTE, PAYLOAD-SELECTED OPERATIONS. `./router.js` publishes exactly one route per
// capability - `POST /prices/resolution`, action `resolvePrices` - and states the division
// explicitly: the router resolves WHICH capability owns a request, and "the handler decides which
// of its own service methods a given payload calls for". The operation is therefore named in the
// body, against a CLOSED literal union, and the router is left free of any operation vocabulary.
//
// ★★ CLOSED, TYPED CRITERIA - AND NOTHING RESEMBLING A SMART LIST. `HibachiSmartList` is
// deliberately not reproduced anywhere in this target (AAP 0.6.2), so there is no
// `filter[field]=value` passthrough here, no free-form ordering key, no unbounded property
// projection and no dynamic predicate surface. Every schema below is a `z.strictObject`, so an
// unrecognised key is REJECTED rather than ignored: a caller cannot smuggle a filter in.
//
// ★ NO VALIDATION RULE IS INVENTED. `model/validation/PriceGroup.json` and
// `model/validation/PriceGroupRate.json` exist and are ported by the tier that owns those
// entities; they are consumed there, not duplicated here. The six in-scope entities that
// deliberately have NO validation file - `Category`, `PromotionQualifier`, `PromotionApplied`,
// `PromotionAccount`, `Product_AddOption`, `Product_AddOptionGroup` - get no rule invented for them
// here either. What this section validates is exactly and only what it takes to turn a wire
// document into the arguments a ported signature already declares.
// ===========================================================================

/**
 * The operations this entrypoint exposes.
 *
 * ★★ EVERY NAME IS THE LEGACY CFML METHOD NAME, CARRIED OVER VERBATIM IN camelCase. B4 interface
 * parity is the acceptance contract, so a reviewer can diff this union against
 * `model/service/PriceGroupService.cfc` and `model/service/CurrencyService.cfc` directly. Nothing
 * is renamed, abbreviated, pluralised or made "more idiomatic" - see
 * [model/service/PriceGroupService.cfc:L57], [L102], [L140], [L262], [L271], [L301], [L316],
 * [L343], [L230] and [model/entity/Sku.cfc:L269], [L275], [L281] and
 * [model/service/CurrencyService.cfc:L84].
 *
 * A string-literal union rather than the TypeScript enumeration construct, matching `./router.js`:
 * a union is erased on emit, so nothing survives into the bundle as a runtime object.
 *
 * ★ NO `sequence`, `phase`, `runAfter`, `pipeline` OR `skipPriceGroups` MEMBER EXISTS ANYWHERE IN
 * THIS FILE. The cross-service ordering constraint is enforced STRUCTURALLY, by
 * `./bootstrap.js`'s single composed operation, never parametrically - see section 6.11.
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
  | 'getPriceGroupDataJSON'
  | 'getPriceByCurrencyCode'
  | 'getListPriceByCurrencyCode'
  | 'getRenewalPriceByCurrencyCode'
  | 'convertCurrency';

/**
 * How a request names the SKU every SKU-taking operation needs.
 *
 * ★★★ WHY A PRODUCT NAME AND A SKU CODE, AND NOT A `skuID`. This is the single most consequential
 * shape in the file and it is dictated by what the request tier publishes, so it is argued in full
 * rather than asserted.
 *
 * `./bootstrap.js` deliberately WITHDREW the six MySQL repositories from `RequestScope`, because
 * they carried seven durable mutations onto the request-tier surface. One consequence is that there
 * is no load-by-identifier for a SKU, a product, a product type, a price group or a rate anywhere
 * on the surface a handler holds, and reaching for the composition root's assembly-inspection hook
 * to get one would put those same seven mutations back within reach of an HTTP-facing module -
 * which is precisely the arrangement the withdrawal exists to prevent.
 *
 * That leaves two published reads, and only one of them yields a SKU the cascade can price:
 *
 *   * `skuService.getSkuBySkuCode(skuCode)` hydrates with the bare fetch shape - options, option
 *     groups and the per-currency price rows WITH THE FOUR-STEP CASCADE RUN, but `product` UNSET.
 *     A SKU with no product is unusable for price-group resolution: level two of the cascade
 *     [model/service/PriceGroupService.cfc:L154] passes `sku.getProduct()` into a parameter the
 *     legacy declares `required` at [L102], and the ported service reproduces that by RAISING. So
 *     that read would answer the currency operations and throw on almost every price-group one.
 *   * `skuService.getProductSkus(product, sorted, fetchOptions)` wires `product` THROUGH from its
 *     argument, and the only published way to obtain a product is
 *     `productService.findProducts(criteria)`, whose records carry their `brand` and `productType`
 *     eagerly. Its keyword matches `productName` and only `productName`, which is why this selector
 *     names a product NAME.
 *
 * So one resolution path serves everything - and it makes all THREE `getRateFor*` entry points
 * COHERENT rather than merely callable, because the product and product type they are given are the
 * resolved SKU's OWN, not a second thing a caller named independently.
 */
export interface PriceResolutionSkuSelector {
  /**
   * The exact product name.
   *
   * Matched case-insensitively through `cfEquals`, because CFML string comparison folds case and
   * this target reproduces that rather than introducing a case-sensitive boundary the source never
   * had. The published search is a `productName LIKE ?` scan, so `'Shirt'` also matches
   * `'T-Shirt'`; the exact-name test narrows that back down, and a name matching two or more
   * distinct products is REFUSED rather than resolved by picking one - the same
   * refuse-rather-than-choose posture `MysqlSkuRepository` takes when a `LEFT JOIN` multiplies a
   * unique-result read.
   */
  readonly productName: string;

  /**
   * The SKU code, within that product's SKUs.
   *
   * Also compared through `cfEquals`. `SwSku.skuCode` is unique per product in the legacy schema,
   * so this identifies one SKU; a code matching two or more DISTINCT SKUs is refused rather than
   * resolved.
   */
  readonly skuCode: string;
}

/**
 * Whether a decimal numeral is one `Money` will accept.
 *
 * ★ THE ADMITTED LANGUAGE IS PROBED, NOT RESTATED. `Money.fromDecimalString` validates through
 * `assertPlainDecimalNumeral`, and duplicating that grammar here as a second regular expression
 * would create two definitions of "a monetary numeral" that can drift apart - the boundary would
 * then either refuse a value `Money` accepts or admit one it does not. Asking the value object
 * itself makes the two provably identical.
 *
 * The reason to ask at all is the STATUS a malformed numeral earns. Left to construction time, the
 * failure is an unrecognised throw and `./errorMapper.js` maps it to a generic server-shaped
 * response; asked here, it is a field-level validation issue on a client-shaped 400 that names the
 * offending path and no submitted value.
 */
function isMoneyNumeral(value: string): boolean {
  try {
    Money.fromDecimalString(value);

    return true;
  } catch {
    return false;
  }
}

/** The SKU selector, as a schema. Both members are required and neither may be empty. */
const SKU_SELECTOR_SCHEMA = z.strictObject({
  productName: z.string().min(1),
  skuCode: z.string().min(1),
});

/**
 * A currency code as the three SKU accessors take one: ANY non-empty string.
 *
 * ★★ DELIBERATELY NOT LENGTH-CHECKED, AND THE RESTRAINT IS THE POINT.
 * `Sku.getPriceByCurrencyCode(currencyCode)` [model/entity/Sku.cfc:L269-L273] takes a plain string
 * and answers a struct lookup: a code that is not in the SKU's currency map yields NOTHING, and a
 * two-character code is simply one such code. Refusing it with a 400 here would turn an input the
 * legacy ANSWERED into an error, which is a behavioural divergence dressed up as validation. The
 * accessor answers, and the absence is reported as an absence.
 */
const ACCESSOR_CURRENCY_CODE_SCHEMA = z.string().min(1);

/**
 * A currency code as `CurrencyConverter.convertCurrency` takes one: exactly three characters.
 *
 * ★ THE OPPOSITE DECISION FROM {@link ACCESSOR_CURRENCY_CODE_SCHEMA}, AND FOR THE OPPOSITE REASON.
 * That parameter is typed `CurrencyCode`, a brand `toCurrencyCode` only mints for a three-character
 * value and otherwise REJECTS. The length test here is therefore satisfying a contract the target
 * already declares - not inventing a refusal - and doing it in the schema is what turns the
 * rejection into a field-level 400 instead of an unrecognised throw.
 */
const CONVERTER_CURRENCY_CODE_SCHEMA = z.string().length(3);

/**
 * The whole request surface, as one strict discriminated union.
 *
 * Discriminating on `operation` is what makes the per-operation criteria CLOSED: a body naming
 * `getPriceGroupDataJSON` and carrying a `sku` is rejected, and so is one naming
 * `convertCurrency` and carrying a `currencyCode`. No arm admits an unrecognised key.
 */
const PRICE_RESOLUTION_REQUEST_SCHEMA = z.discriminatedUnion('operation', [
  // --- The three cascade entry points, and the two calculations over them ----------------------
  //
  // All five are SYNCHRONOUS on the service and are consumed synchronously - see section 6.
  z.strictObject({
    operation: z.literal('getRateForProductTypeBasedOnPriceGroup'),
    sku: SKU_SELECTOR_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getRateForProductBasedOnPriceGroup'),
    sku: SKU_SELECTOR_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getRateForSkuBasedOnPriceGroup'),
    sku: SKU_SELECTOR_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnPriceGroup'),
    sku: SKU_SELECTOR_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnPriceGroupRate'),
    sku: SKU_SELECTOR_SCHEMA,
  }),

  // --- The two account-scoped calculations, and the best-price-group report --------------------
  //
  // None of the three takes an account from the payload. The account is server-established - see
  // section 5.
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnCurrentAccount'),
    sku: SKU_SELECTOR_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnAccount'),
    sku: SKU_SELECTOR_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getBestPriceGroupDetailsBasedOnSkuAndAccount'),
    sku: SKU_SELECTOR_SCHEMA,
  }),

  // --- The price-group data document ----------------------------------------------------------
  //
  // `getPriceGroupDataJSON()` [model/service/PriceGroupService.cfc:L230] takes NO arguments, so
  // this arm carries none. Adding a paging or ordering member would model a capability no in-scope
  // code exercises.
  z.strictObject({ operation: z.literal('getPriceGroupDataJSON') }),

  // --- The currency resolution surface --------------------------------------------------------
  z.strictObject({
    operation: z.literal('getPriceByCurrencyCode'),
    sku: SKU_SELECTOR_SCHEMA,
    currencyCode: ACCESSOR_CURRENCY_CODE_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getListPriceByCurrencyCode'),
    sku: SKU_SELECTOR_SCHEMA,
    currencyCode: ACCESSOR_CURRENCY_CODE_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('getRenewalPriceByCurrencyCode'),
    sku: SKU_SELECTOR_SCHEMA,
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
 * disagree. Published because the test tier drives {@link dispatchPriceResolution} directly.
 */
export type PriceResolutionRequest = z.infer<typeof PRICE_RESOLUTION_REQUEST_SCHEMA>;

// ===========================================================================
// SECTION 2 - THE RESPONSE CONTRACT
//
// ★★★ THE ONE PROPERTY THIS SECTION EXISTS TO GUARANTEE: A LOAD-BEARING ABSENCE SURVIVES
// SERIALISATION INTACT.
//
// `getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, so an
// unknown currency yields nothing. `getListPriceByCurrencyCode()` [L275-L279] and
// `getRenewalPriceByCurrencyCode()` [L281-L285] perform a SECOND key-existence check on the
// sub-key, so they yield nothing even for a currency that IS present in the map. The cascade itself
// can produce an empty map outright: its entire body is wrapped in
// `if(len(setting('skuEligibleCurrencies')))` [model/entity/Sku.cfc:L373], and if that setting
// resolves empty the memo stays `{}` and EVERY accessor answers nothing. Substituting `0` for any
// of that would silently sell products for free.
//
// So absence is carried by a DISCRIMINATOR, never by an omission and never by a magic value:
//
//   * NOT `0`, and not any other number.
//   * NOT `null`, which a consumer can turn into `0` with a single `??`.
//   * NOT an empty or zero `Money` - `Money.zero` is never a fallback anywhere in this file.
//   * NOT an omitted key that a consumer would then default. `JSON.stringify` drops an `undefined`
//     member, which is exactly the omitted-then-defaulted field this contract forbids, so no
//     optional member carries a monetary value: the `resolved: false` arm is present and explicit.
//
// ★ MONETARY VALUES ARE SERIALISED AT FULL PRECISION, THROUGH `Money`'S OWN SURFACE.
// `Money.toDecimalString()` renders every significant digit; `Money.toFixed2()` applies CFML's
// `'0.00'` mask and therefore ROUNDS. Presenting to two decimals in transit would round a value the
// service returned unrounded, which B2 forbids - the two-decimal step belongs where the legacy puts
// it, at the END of the calculating function [model/service/PriceGroupService.cfc:L339], and
// `calculateSkuPriceBasedOnPriceGroupRate` has already applied it before this module sees the value.
// No `Number()`, no `parseFloat` and no `toFixed` on a raw number appears anywhere in this file.
//
// ★ THE `numeric`-DECLARED / STRING-RETURNED MISMATCH IS NOT REPAIRED HERE.
// [model/service/PriceGroupService.cfc:L316] declares `numeric` while [L339] returns
// `numberFormat(newPrice, "0.00")`, a STRING - the same family of type dishonesty as
// `roundValue`, which declares `returntype="string"` while both its callers declare `numeric`
// [model/service/RoundingRuleService.cfc:L88 versus L79, L84]. That is preserved at the services
// tier, and this module neither coerces, parses nor re-formats what it is handed.
// ===========================================================================

/**
 * Why an operation produced no value.
 *
 * A CLOSED union of six tokens, for the same reason `./errorMapper.js` closes
 * `InvalidRequestReason`: a caller-supplied or free-text reason string is how an internal detail -
 * a driver message, a resolved path, an echo of submitted input - reaches a response body. Each
 * token names a DOMAIN outcome the legacy also produced; none is an error, and none carries a
 * status other than the successful one.
 */
export type UnresolvedReason =
  /**
   * No authenticated account was established for this request, and the operation needs one.
   *
   * The target's representation of the legacy `else` arm at
   * [model/service/PriceGroupService.cfc:L266]. `CurrentAccountContext` carries `accountID` and
   * nothing else, so its absence IS "not signed in" - see section 5. Note which operation this can
   * and cannot reach: `calculateSkuPriceBasedOnCurrentAccount` NEVER reports it, because the else
   * arm inside the service answers `sku.getPrice()`; `calculateSkuPriceBasedOnAccount` and the
   * price-group operations do, because [L271] and [L343] declare the account required.
   */
  | 'noAuthenticatedAccount'
  /**
   * The SKU has no price recorded for the requested currency.
   *
   * ★ ONE TOKEN FOR BOTH LEGACY CAUSES, DELIBERATELY. A miss can mean the currency is absent from
   * the map [model/entity/Sku.cfc:L270] or that the currency is present and the `listPrice` /
   * `renewalPrice` sub-key is not [L276], [L282] - and the published accessor answers the same
   * nothing either way. Distinguishing them here would mean re-implementing the accessor's second
   * key-existence check at this tier, which is business logic this file must not contain.
   */
  | 'noPriceForCurrencyCode'
  /**
   * No price group was resolved for this SKU and account, so no cascade input exists.
   *
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` seeds its report with the SKU's own price and
   * leaves the price group unset unless one beat it [model/service/PriceGroupService.cfc:L347-L358].
   * An account with no price groups, and an account whose price groups are all dearer than the
   * SKU's own price, both land here.
   */
  | 'noPriceGroupResolvedForSkuAndAccount'
  /**
   * The cascade ran and no rate applies.
   *
   * The legacy contract, exactly: [L96-L98], [L135-L137] and [L178-L180] each read
   * `if(!isNull(returnRate)) return returnRate;` with NO `else`, and a CFML function that falls off
   * the end returns null. A synthesised default rate, a zero or a thrown error would each change
   * behaviour.
   */
  | 'noRateApplies'
  /**
   * The rate the cascade selected carries no amount.
   *
   * A DISTINCT STATE FROM `noRateApplies`, and worth its own token rather than reusing that one: the
   * rate DID apply, and its `amount` column is null. `PriceGroupRate.amount`
   * [model/entity/PriceGroupRate.cfc:L54] is a nullable `big_decimal`, and
   * `savePriceGroupRate` clears it outright on the `"new amount"` path
   * [model/service/PriceGroupService.cfc:L399-L400], so the state is reachable rather than
   * theoretical. Conflating the two would tell a caller that no rate matched when one did.
   */
  | 'rateCarriesNoAmount'
  /**
   * The resolved SKU's product carries no product type, so the product-type entry point has no
   * argument.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L159]: the legacy chains
   * `sku.getProduct().getProductType()` with no null test and passes the result into a parameter
   * declared `required` at [L57], so CFML raises there. Reported rather than raised ONLY because
   * this is the boundary that would otherwise have to fabricate the argument: the service's own
   * behaviour when it is called with an absent product type is untouched.
   */
  | 'productTypeAbsent';

/**
 * A monetary value on the wire.
 *
 * `amount` is `Money.toDecimalString()` output - a `DecimalString`, hence a `string`. Typed as
 * `string` because `DecimalString` is published by `../lib/cfml/numberFormat.js`, which is not among
 * this module's declared dependencies; the brand refines `string`, so nothing is lost by widening it
 * at the wire boundary. A string, never a JSON number: IEEE-754 is exactly what the `Money` value
 * object exists to keep away from a price.
 */
export interface SerializedMoney {
  readonly amount: string;
}

/** A monetary value that may legitimately not exist. See the section header. */
export type OptionalSerializedMoney =
  | { readonly resolved: true; readonly amount: string }
  | { readonly resolved: false; readonly reason: UnresolvedReason };

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
 * ★ `roundingRuleConfigured` IS A BOOLEAN, AND NO ROUNDING IS PERFORMED TO PRODUCE IT.
 * [model/service/PriceGroupService.cfc:L326-L328] applies the rate's rounding rule on the
 * `percentageOff` branch and ONLY there; `amountOff` [L330-L332] and `amount` [L333-L335] skip it.
 * Reporting whether a rule is attached lets a caller see that asymmetry without this module
 * invoking, re-deriving or second-guessing the rounding - which it must not do, since the algorithm
 * is decimal-string manipulation whose measured outputs are counter-intuitive by design.
 *
 * `amountType` is reported as the service reports it - the raw column value, which may hold any
 * spelling the database holds, and which is `undefined` when the column is null. That is the
 * strategy key the whole asymmetry turns on, so it is published verbatim rather than normalised.
 */
export interface SerializedPriceGroupRate {
  /** The rate's identifier. */
  readonly priceGroupRateID: string;

  /** Whether this is the price group's global rate [model/entity/PriceGroupRate.cfc:L57]. */
  readonly globalFlag: boolean;

  /** The rate's amount, absent when the `big_decimal` column is null. */
  readonly amount: OptionalSerializedMoney;

  /**
   * The amount type, or `undefined` when the column is null.
   *
   * ★ NO `default:` ARM IS INVENTED ANYWHERE FOR THIS VALUE. The legacy switch closes at
   * [model/service/PriceGroupService.cfc:L336] with NO `default:` case, so an unrecognised
   * `amountType` silently passes through with `newPrice = arguments.sku.getPrice()` [L319]. That is
   * preserved at the services tier, and this module adds no unrecognised-type error, no thrown
   * exception and no logged warning the source never had.
   */
  readonly amountType: string | undefined;

  /** `PriceGroupRate.getAmountFormatted()` [model/entity/PriceGroupRate.cfc:L262], verbatim. */
  readonly amountFormatted: string;

  /**
   * `PriceGroupRate.getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95], verbatim.
   *
   * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
   * `excludedProducts` and `excludedSkus` are declared, persisted and COUNTED BY `getAppliesTo()` -
   * and never consulted by the five-level cascade at
   * [model/service/PriceGroupService.cfc:L140-L181]. This value therefore describes exclusions that
   * do not affect the rate the cascade selected.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly appliesTo: string;

  /** Whether a rounding rule is attached to this rate. See the type's own note. */
  readonly roundingRuleConfigured: boolean;
}

/** A rate, or the documented absence of one. */
export type OptionalSerializedPriceGroupRate =
  | { readonly resolved: true; readonly rate: SerializedPriceGroupRate }
  | { readonly resolved: false; readonly reason: UnresolvedReason };

/**
 * What one operation produced.
 *
 * Discriminated on `outcome` so a consumer narrows before reading, and named per operation FAMILY
 * rather than per operation: the three currency accessors share one shape because they share one
 * contract, and the four money-producing calculations share another.
 */
export type PriceResolutionResult =
  /**
   * A price the service computed. Always present - the legacy paths behind it fall back to
   * `sku.getPrice()` rather than to nothing [model/service/PriceGroupService.cfc:L266], [L312],
   * [L319] - so no absence arm exists here, deliberately.
   */
  | { readonly outcome: 'price'; readonly price: SerializedMoney }
  /** One of the three currency accessors, whose absence is load-bearing. */
  | { readonly outcome: 'currencyPrice'; readonly price: OptionalSerializedMoney }
  /** The best-price-group report [model/service/PriceGroupService.cfc:L343-L362]. */
  | {
      readonly outcome: 'bestPriceGroupDetails';
      readonly price: SerializedMoney;
      readonly priceGroup: OptionalSerializedPriceGroup;
    }
  /** A cascade entry point's selection. */
  | { readonly outcome: 'priceGroupRate'; readonly rate: OptionalSerializedPriceGroupRate }
  /**
   * `getPriceGroupDataJSON()` [model/service/PriceGroupService.cfc:L230-L257], as the string the
   * service returned.
   *
   * ★ CARRIED AS A STRING, NOT RE-PARSED AND NOT RE-SERIALISED. The ported signature is
   * `Promise<string>` because the legacy returns `serializeJSON(priceGroupData)` at [L256], and
   * re-formatting it here would be exactly the coercion in transit B2 forbids.
   *
   * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236]: the loop reads
   * `priceGroupSmartList.getPageRecords()[local.i]` while the loop variable declared at [L235] is
   * `i`, so the subscript resolves against an unset `local` struct key.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the inner loop calls
   * `thisRate.getAmountRepresentation()`, which no in-scope component declares, so this method
   * RAISES for any page holding at least one rate and succeeds only in the degenerate case where
   * every price group on the page has none. That was confirmed at run time against a seeded database:
   * the operation answers a mapped server-shaped response rather than a document.
   * Preserved deliberately; do not fix without a product decision.
   *
   * ★ THE THROW IS MAPPED, NOT CAUGHT. Wrapping this call to return an empty document, a partial
   * document or an `unresolved` outcome would REPAIR the defect at the boundary and hide it from
   * every caller - which is precisely what preserving behaviour forbids. It leaves through
   * `./errorMapper.js` like any other failure, so the detail reaches the log stream and the caller
   * receives the module's fixed sentence.
   */
  | { readonly outcome: 'priceGroupData'; readonly priceGroupDataJSON: string }
  /** Nothing was produced, and this is why. Answered successfully, with no status invented. */
  | { readonly outcome: 'unresolved'; readonly reason: UnresolvedReason };

/**
 * The document a successful invocation returns.
 *
 * Three members and no more. There is no envelope version, no pagination cursor, no diagnostic
 * block and no rate-source status: the currency converter answers unconverted rather than
 * complaining when no rate is available [model/service/CurrencyService.cfc:L100-L101], so a
 * "conversion unavailable" indicator would be an invention this contract has no right to make.
 */
export interface PriceResolutionResponseBody {
  /** The operation that ran, echoed so a response is self-describing. */
  readonly operation: PriceResolutionOperation;

  /**
   * The instant this request resolved against, as UTC ISO-8601.
   *
   * ★ THE INJECTED CLOCK, AND THE EXPLICIT UTC POLICY. This is `RequestScope.now` rendered through
   * `Date.prototype.toISOString`, which always renders UTC with a `Z` designator - never server
   * local time, and never a value derived from a caller-supplied instant. NO AMBIENT `new Date()`
   * IS CALLED ANYWHERE IN THIS FILE: the scope binds ONE instant per invocation and every
   * date-dependent read of this request - the promotion-period window, the sale-price reduction, the
   * subscription-eligibility window at [model/dao/PriceGroupDAO.cfc:L65], [L70] - resolves against
   * that same instant. Publishing it is what makes the binding observable.
   */
  readonly resolvedAt: string;

  /** What the operation produced. */
  readonly result: PriceResolutionResult;
}

// ===========================================================================
// SECTION 3 - THE REQUEST-TIER SURFACE THIS MODULE READS
//
// ★★ THE EXPOSED SET IS A COMPILE-TIME FACT, NOT A REVIEW CONVENTION. `RequestScope` publishes
// thirteen members; this module reads six of them, and it says so in a type. Two consequences
// follow, and both are the reason the narrowing is written out rather than the whole scope being
// passed around:
//
//   1. `updateOrderAmountsWithPriceGroupsThenPromotions` - the composed operation that owns the
//      cross-service ordering constraint - is NOT on this interface, so it is unreachable from
//      anything below. `updateOrderAmountsWithPriceGroups` is unreachable twice over: it is absent
//      from `PriceResolutionCapability` to begin with, so naming it is a compile error before this
//      `Pick` is even considered. See section 6.11.
//   2. The test tier can build a fake with six members instead of thirteen, which is what makes the
//      clock and the account context injectable WITHOUT module-level monkey-patching (B8).
//
// ★ NO DOMAIN ENTITY TYPE IS IMPORTED, AND THAT IS DELIBERATE. `src/domain/entities/**` is not among
// this module's declared dependencies, so the entity-shaped types below are DERIVED from the
// published surface rather than imported. The derivation is not a workaround: a primary adapter has
// no business naming an entity class, and deriving the types means this file cannot drift from the
// signatures it actually calls, because the compiler recomputes them from those signatures.
// ===========================================================================

/**
 * Exactly what this entrypoint reads from one request scope.
 *
 * `RequestScope` satisfies it structurally, so `handler` passes the real scope straight in.
 */
export interface PriceResolutionScope {
  /** The instant this request resolves against. See {@link PriceResolutionResponseBody.resolvedAt}. */
  readonly now: RequestScope['now'];

  /**
   * The explicit replacement for the legacy ambient request scope.
   *
   * [model/service/PriceGroupService.cfc:L263-L264] reaches the request scope through TWO
   * accessors in adjacent lines - `getSlatwallScope().getLoggedInFlag()` at L263 and
   * `getHibachiScope().getAccount()` at L264 - the only site in the codebase that uses the first.
   * Both resolve to the same per-request scope, and transformation rule T6 replaces both with this
   * explicit parameter, which normalises the naming divergence out of existence.
   */
  readonly currentAccountContext: CurrentAccountContext;

  /** One published read: the product search that anchors SKU resolution. */
  readonly productService: Pick<RequestScope['productService'], 'findProducts'>;

  /** One published read: the only one that wires a SKU's `product` association through. */
  readonly skuService: Pick<RequestScope['skuService'], 'getProductSkus'>;

  /**
   * The nine price-group members this entrypoint exposes, and no others.
   *
   * `PriceResolutionCapability` is already `PriceGroupService` MINUS its order pass; this `Pick`
   * additionally withholds the three write members - see section 6.12.
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
    | 'getPriceGroupDataJSON'
  >;

  /**
   * One of the currency port's three members - see section 6.13 for why the other two are withheld.
   */
  readonly currencyConverter: Pick<CurrencyConverter, 'convertCurrency'>;
}

/** The product entity type, derived from `findProducts`. */
type ResolvedProduct = Awaited<
  ReturnType<PriceResolutionScope['productService']['findProducts']>
>['records'][number];

/** The SKU entity type, derived from `getProductSkus`. */
type ResolvedSku = Awaited<
  ReturnType<PriceResolutionScope['skuService']['getProductSkus']>
>[number];

/** The price-group entity type, derived from the one member that hands one back. */
type ResolvedPriceGroup = NonNullable<
  Awaited<
    ReturnType<
      PriceResolutionScope['priceGroupService']['getBestPriceGroupDetailsBasedOnSkuAndAccount']
    >
  >['priceGroup']
>;

/** The rate entity type, derived from the SKU cascade entry point. */
type ResolvedPriceGroupRate = NonNullable<
  ReturnType<PriceResolutionScope['priceGroupService']['getRateForSkuBasedOnPriceGroup']>
>;

// ===========================================================================
// SECTION 4 - INPUT RESOLUTION
//
// Turning the wire selector into the entities a ported signature already declares. Every step
// delegates to a published read and NONE OF THEM DECIDES A PRICE: resolution answers "which SKU did
// the caller name", never "what is it worth".
//
// ★ REFUSE RATHER THAN CHOOSE. Where a selector matches more than one candidate, resolution refuses
// instead of picking one. That is the posture the data tier already takes - `MysqlSkuRepository`
// raises rather than adding a `DISTINCT` or a row limit to a unique-result read, because either
// would decide WHICH SKU is returned - and the same reasoning applies with more force at an
// HTTP boundary, where the caller cannot see which candidate was picked.
// ===========================================================================

/**
 * Why a selector could not be resolved. Logged, never echoed into a response body.
 *
 * `./errorMapper.js` owns every sentence a caller reads; these tokens exist so the log line an
 * operator joins by `requestId` says which of the four cases occurred. None of them carries a
 * submitted value.
 */
type SkuSelectorRefusal =
  | 'productNameMatchedNoProduct'
  | 'productNameMatchedMoreThanOneProduct'
  | 'skuCodeMatchedNoSkuOfProduct'
  | 'skuCodeMatchedMoreThanOneSkuOfProduct';

/**
 * A selector that named nothing resolvable.
 *
 * Module-local and un-exported: it is a private protocol between {@link dispatchPriceResolution} and
 * {@link handler}, which turns it into the mapper's own client-shaped invalid-request response. Its
 * message is FIXED TEXT and interpolates no submitted value - not the product name, not the SKU
 * code, not a query, not a driver message - so it is safe even though it never reaches a body.
 */
class UnresolvableSkuSelectorError extends Error {
  /** Which of the four cases occurred. */
  readonly refusal: SkuSelectorRefusal;

  constructor(refusal: SkuSelectorRefusal) {
    super('the request named no single resolvable sku');
    this.name = 'UnresolvableSkuSelectorError';
    this.refusal = refusal;
  }
}

/**
 * Resolve the one product a selector names.
 *
 * The published search matches `productName LIKE ?` and reports its own keyword configuration on
 * the returned page, so `'Shirt'` matches `'T-Shirt'` too. The exact-name test narrows that to the
 * product the caller actually named, folding case through `cfEquals` because CFML string comparison
 * folds case. `getProductName()` is nullable in the schema, and `cfEquals` RAISES on a nullish
 * operand by design, so an unnamed product is skipped before it can be compared rather than being
 * compared and throwing.
 *
 * @throws {UnresolvableSkuSelectorError} when no product, or more than one distinct product,
 *   carries the exact name.
 */
async function resolveProduct(
  scope: PriceResolutionScope,
  productName: string,
): Promise<ResolvedProduct> {
  const page = await scope.productService.findProducts({ keyword: productName });

  const exactMatches: ResolvedProduct[] = [];
  const matchedProductIDs = new Set<string>();

  for (const candidate of page.records) {
    const candidateName = candidate.getProductName();

    if (candidateName === undefined || !cfEquals(candidateName, productName)) {
      continue;
    }

    // De-duplicated by identifier rather than by array position: a search join can report the same
    // product twice, and two rows for one product is not an ambiguous selector.
    if (!matchedProductIDs.has(candidate.getProductID())) {
      matchedProductIDs.add(candidate.getProductID());
      exactMatches.push(candidate);
    }
  }

  const [product] = exactMatches;

  if (product === undefined) {
    throw new UnresolvableSkuSelectorError('productNameMatchedNoProduct');
  }

  if (exactMatches.length > 1) {
    throw new UnresolvableSkuSelectorError('productNameMatchedMoreThanOneProduct');
  }

  return product;
}

/**
 * Resolve the one SKU of a product that a selector names.
 *
 * `getProductSkus(product, false)` is called with `sorted` FALSE and `fetchOptions` left at its
 * default. Both are deliberate. Sorting would take the dialect-dependent option-group ordering path
 * for a read whose result is filtered down to one row, and eager option fetching would branch on the
 * product's base type - neither changes WHICH SKU carries the requested code, so neither is asked
 * for. The read still materialises the per-currency price rows with the four-step cascade run, which
 * is what the currency operations need, and it wires `product` through, which is what the price-group
 * cascade needs.
 *
 * Row multiplication is expected and is NOT an ambiguity: that read deliberately adds no `DISTINCT`,
 * so one SKU can arrive as several instances. Distinctness is therefore judged by `skuID`.
 *
 * @throws {UnresolvableSkuSelectorError} when no SKU, or more than one distinct SKU, of the product
 *   carries the exact code.
 */
async function resolveSkuOfProduct(
  scope: PriceResolutionScope,
  product: ResolvedProduct,
  skuCode: string,
): Promise<ResolvedSku> {
  const skus = await scope.skuService.getProductSkus(product, false);

  const matchedSkuIDs = new Set<string>();
  let match: ResolvedSku | undefined = undefined;

  for (const candidate of skus) {
    const candidateCode = candidate.getSkuCode();

    if (candidateCode === undefined || !cfEquals(candidateCode, skuCode)) {
      continue;
    }

    matchedSkuIDs.add(candidate.getSkuID());
    match ??= candidate;
  }

  if (match === undefined) {
    throw new UnresolvableSkuSelectorError('skuCodeMatchedNoSkuOfProduct');
  }

  if (matchedSkuIDs.size > 1) {
    throw new UnresolvableSkuSelectorError('skuCodeMatchedMoreThanOneSkuOfProduct');
  }

  return match;
}

/** One resolved selector: the SKU, and the product it belongs to. */
interface ResolvedSkuSelection {
  readonly product: ResolvedProduct;
  readonly sku: ResolvedSku;
}

/**
 * Resolve a selector into the SKU and its product.
 *
 * ★ THE PRODUCT IS RETURNED ALONGSIDE THE SKU BECAUSE THE CASCADE'S PRODUCT AND PRODUCT-TYPE ENTRY
 * POINTS NEED IT, AND BECAUSE IT IS THE SKU'S OWN. `getProductSkus` wires this exact product onto
 * every SKU it builds, so handing it to `getRateForProductBasedOnPriceGroup` reproduces
 * [model/service/PriceGroupService.cfc:L154], which passes `arguments.sku.getProduct()`, rather than
 * pairing the SKU with some second product a caller named independently.
 */
async function resolveSkuSelection(
  scope: PriceResolutionScope,
  selector: PriceResolutionSkuSelector,
): Promise<ResolvedSkuSelection> {
  const product = await resolveProduct(scope, selector.productName);
  const sku = await resolveSkuOfProduct(scope, product, selector.skuCode);

  return { product, sku };
}

/**
 * Resolve the price group the cascade operations take as their second argument.
 *
 * ★★★ JUDGMENT CALL: THE PRICE GROUP IS RESOLVED THROUGH THE ONE PUBLISHED AFFORDANCE THAT YIELDS
 * ONE, AND A CALLER CANNOT NAME AN ARBITRARY ONE.
 *
 * `getBestPriceGroupDetailsBasedOnSkuAndAccount` [model/service/PriceGroupService.cfc:L343-L362] is
 * the only member of the request-tier surface that hands back a `PriceGroup` entity. A
 * load-by-identifier does exist on `../domain/ports/priceGroupRepository.js`, but that port is not
 * published to the request tier: `./bootstrap.js` withdrew the six repositories precisely because
 * they carried seven durable mutations, and the only remaining route to one is the composition
 * root's assembly-inspection hook - which a handler must not use, because doing so would put
 * `savePriceGroup`, `savePriceGroupRate`, `deletePriceGroup`, `saveProduct`, `deleteProduct`,
 * `saveSku` and `saveProductType` back within reach of an HTTP-facing module. The two alternatives
 * to this resolution are therefore inventing a fourteenth port member, whose count is explicitly
 * locked at six, or opening that bypass. Neither is acceptable, so the surface is narrowed instead
 * and the narrowing is stated here rather than hidden.
 *
 * WHAT THAT MEANS FOR A CALLER, PLAINLY: these operations answer "for this SKU and this request's
 * account, which rate did the cascade select, and what price does it produce" - the question the
 * cascade exists to answer - and they cannot be pointed at a price group the account does not hold.
 *
 * NOTHING ABOUT THE CASCADE IS PRE-EMPTED HERE. The price group is an INPUT, exactly as the SKU is;
 * the selection among the account's price groups is made INSIDE the service, at [L351-L358], and
 * this function neither repeats nor second-guesses it.
 *
 * @returns the resolved price group, or `undefined` when none was resolved, which is a domain
 *   outcome and not an error - see {@link UnresolvedReason}.
 */
async function resolvePriceGroup(
  scope: PriceResolutionScope,
  sku: ResolvedSku,
  accountID: string,
): Promise<ResolvedPriceGroup | undefined> {
  const details = await scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
    sku,
    accountID,
  );

  return details.priceGroup;
}

/** Everything the five cascade operations need, or the reason they have nothing to run on. */
type CascadeInputs =
  | {
      readonly resolved: true;
      readonly selection: ResolvedSkuSelection;
      readonly priceGroup: ResolvedPriceGroup;
    }
  | { readonly resolved: false; readonly reason: UnresolvedReason };

/**
 * Resolve a SKU, its product and a price group for the cascade operations.
 *
 * The account is read from {@link PriceResolutionScope.currentAccountContext} and NEVER from the
 * payload - see section 5. Its absence is the legacy's not-signed-in state and is reported as a
 * domain outcome rather than as an error.
 *
 * THE ACCOUNT IS TESTED BEFORE THE SELECTOR IS RESOLVED, which decides what a request with BOTH
 * problems is told: it hears about the account, and no read is issued on its behalf. Ordering it the
 * other way would spend two statements establishing that a caller named a real SKU before answering
 * that the operation could not have run anyway.
 *
 * @throws {UnresolvableSkuSelectorError} when the selector names no single SKU.
 */
async function resolveCascadeInputs(
  scope: PriceResolutionScope,
  selector: PriceResolutionSkuSelector,
): Promise<CascadeInputs> {
  const accountID = scope.currentAccountContext.accountID;

  if (accountID === undefined) {
    return { resolved: false, reason: 'noAuthenticatedAccount' };
  }

  const selection = await resolveSkuSelection(scope, selector);
  const priceGroup = await resolvePriceGroup(scope, selection.sku, accountID);

  if (priceGroup === undefined) {
    return { resolved: false, reason: 'noPriceGroupResolvedForSkuAndAccount' };
  }

  return { resolved: true, selection, priceGroup };
}

// ===========================================================================
// SECTION 5 - THE EXPLICIT REQUEST CONTEXT (T6), AND THE INJECTED CLOCK
//
// ★★★ THE LEGACY SITE, VERBATIM [model/service/PriceGroupService.cfc:L262-L266]:
//
//     public numeric function calculateSkuPriceBasedOnCurrentAccount(required any sku) {
//       if(getSlatwallScope().getLoggedInFlag()) {
//         return calculateSkuPriceBasedOnAccount(sku=arguments.sku, account=getHibachiScope().getAccount());
//       } else {
//         return sku.getPrice();
//
// Two ambient accessors in adjacent lines, and the ONLY use of `getSlatwallScope()` in the codebase.
// Transformation rule T6 replaces BOTH with an explicit context threaded down the call chain, which
// retires the naming divergence rather than porting it. `CurrentAccountContext` expresses exactly the
// two things that body reads - whether a user is signed in, and which account - collapsed into one
// optional identifier, so "signed in with no account" and "not signed in but here is an account" are
// both unrepresentable. NO SESSION, LOCALE, CURRENCY, TIMEZONE, PERMISSION, REQUEST-IDENTIFIER OR
// LOGGER MEMBER BELONGS ON IT, and none is added here.
//
// ★ THE ADDED `context` PARAMETER ON `calculateSkuPriceBasedOnCurrentAccount` IS THE MANDATED T6
// REPLACEMENT OF AMBIENT STATE - NOT A BUDGETED SIGNATURE WIDENING. It consumes no interface-parity
// ledger slot, and `src/handlers/**` owns no slot of any ledger: no signature reshaping, no
// visibility widening, no entity-signature widening and no deliberate divergence originates in this
// file.
//
// ★★ THE ACCOUNT IS SERVER-ESTABLISHED AND IS NEVER READ FROM THE PAYLOAD. `./bootstrap.js` records
// the reasoning at length: `HibachiScope.getAccount()` is `getSession().getAccount()`, and a session
// only holds an account after `loginAccount(...)`, so the legacy actor was established from an
// AUTHENTICATED SESSION and never taken from request content. The corresponding trust boundary here
// is the API Gateway authorizer, whose context a caller cannot write; the request body is untrusted
// payload and no schema arm above accepts an account identifier. Whether the deployment's authorizer
// authenticates correctly is an authorizer concern outside this AAP.
//
// ★ NOTHING IS READ FROM `../lib/config.js`. That module is STATIC PROCESS CONFIGURATION and must
// never be used as a request scope. Nor is the context built at module scope: it is built here, ONCE
// PER INVOCATION, from the per-invocation scope factory.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L266, L274]: `sku` is referenced UNSCOPED at both
// lines while the surrounding code uses `arguments.sku`. Recorded, and not repaired: it is latent
// legacy sloppiness in a body this module does not own.
// ===========================================================================

/**
 * The authorizer-context member naming the authenticated account.
 *
 * A constant rather than an inline literal so the one name this boundary depends on is stated once.
 * It is not configuration and does not belong in `../lib/config.js`: it is the shape of the
 * authorizer's own output, which the deployment's authorizer and this adapter must agree on.
 */
const AUTHORIZER_ACCOUNT_CLAIM = 'accountID';

/**
 * Read the authenticated account identifier from the request's authorizer context.
 *
 * ★ JUDGMENT CALL: the claim is read through `structGet`, which folds key case exactly as a CFML
 * struct does. An authorizer emitting `accountId` and one emitting `accountID` name the same claim,
 * and CFML struct semantics are this subtree's house convention for a keyed read - the alternative,
 * a case-sensitive JavaScript index, would make a deployment's key casing silently decide whether a
 * request is treated as signed in.
 *
 * A non-string, an empty string and a whitespace-only string all yield NOTHING, which is the
 * logged-out arm. Absence is the safe direction: it routes
 * `calculateSkuPriceBasedOnCurrentAccount` to `sku.getPrice()`
 * [model/service/PriceGroupService.cfc:L266] and leaves every account-scoped operation reporting
 * `noAuthenticatedAccount`, whereas admitting a blank identifier would send an empty string into a
 * keyed account read.
 *
 * The value is narrowed with a `typeof` probe rather than a cast, because the authorizer context is
 * typed with an index signature this module must not trust.
 */
function readAuthenticatedAccountID(event: APIGatewayProxyEvent): string | undefined {
  const claims: Readonly<Record<string, unknown>> = event.requestContext.authorizer ?? {};
  const candidate: unknown = structGet(claims, AUTHORIZER_ACCOUNT_CLAIM);

  if (typeof candidate !== 'string') {
    return undefined;
  }

  const trimmed = candidate.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Build the per-invocation scope input.
 *
 * THREE OF THE FOUR MEMBERS ARE DELIBERATELY NOT SUPPLIED, and each omission is a decision:
 *
 *   * `now` - OMITTED, WHICH IS WHAT MAKES THE CLOCK INJECTED RATHER THAN AMBIENT HERE. The scope
 *     reads the wall clock ONCE at its own creation and binds that single instant across every
 *     date-dependent read of the request, so this file calls NO `new Date()` at all. Supplying one
 *     from the payload was considered and rejected: a caller able to move the pricing clock could
 *     move a promotion window or a sale-price expiry, and letting the checked party choose the input
 *     is the same hazard `./bootstrap.js` closes for the product-feed host allow-list.
 *   * `adminAccountFlag` - OMITTED, because this entrypoint performs NO durable write (section 6.12),
 *     so there is no audit stamp to attribute. Absent means false, which is the non-admin arm of the
 *     legacy gate `!account.isNew() && account.getAdminAccountFlag()`; nothing here defaults it true.
 *   * `feedHost` - OMITTED, because the product feed is another capability's entrypoint. Omitting it
 *     leaves `RequestScope.productFeedPort` undefined, which is the safe outcome rather than a
 *     degraded one.
 */
function buildRequestScopeInput(accountID: string | undefined): RequestScopeInput {
  return { accountID };
}

// ===========================================================================
// SECTION 6 - THE DISPATCHER
//
// One operation, one outcome-producing call. Input resolution (section 4) precedes it and decides
// nothing; serialisation (section 2) follows it and changes nothing.
//
// ★★ THE FIVE SYNCHRONOUS MEMBERS ARE CONSUMED SYNCHRONOUSLY. `getRateForProductTypeBasedOnPriceGroup`
// [model/service/PriceGroupService.cfc:L57], `getRateForProductBasedOnPriceGroup` [L102],
// `getRateForSkuBasedOnPriceGroup` [L140], `calculateSkuPriceBasedOnPriceGroup` [L301] and
// `calculateSkuPriceBasedOnPriceGroupRate` [L316] traverse already-materialised associations and
// perform pure arithmetic, so the ported signatures are synchronous by the async-boundary rule - a
// method is async if and only if its legacy body reached the DAO or the ORM. None of them is awaited,
// wrapped in a promise, deferred or re-entered asynchronously here.
// ===========================================================================

/** Serialise a monetary value at full precision, through `Money`'s own surface. */
function serializeMoney(value: Money): SerializedMoney {
  return { amount: value.toDecimalString() };
}

/**
 * Serialise a monetary value that may legitimately not exist.
 *
 * The absent arm carries the reason and no amount - never a zero, never a null and never an omitted
 * key. See the section 2 header for why that matters on a price.
 */
function serializeOptionalMoney(
  value: Money | undefined,
  reason: UnresolvedReason,
): OptionalSerializedMoney {
  return value === undefined
    ? { resolved: false, reason }
    : { resolved: true, ...serializeMoney(value) };
}

/** Project a rate onto the wire. Reads the entity's own accessors and computes nothing. */
function serializePriceGroupRate(rate: ResolvedPriceGroupRate): SerializedPriceGroupRate {
  return {
    priceGroupRateID: rate.getPriceGroupRateID(),
    globalFlag: rate.getGlobalFlag(),
    // The rate's `amount` column is nullable, so its absence is carried structurally too - under its
    // OWN reason token, because a rate that applied without an amount is not the same state as no
    // rate applying. See {@link UnresolvedReason}.
    amount: serializeOptionalMoney(rate.getAmount(), 'rateCarriesNoAmount'),
    amountType: rate.getAmountType(),
    amountFormatted: rate.getAmountFormatted(),
    appliesTo: rate.getAppliesTo(),
    // A BOOLEAN, and no rounding is invoked to produce it - see {@link SerializedPriceGroupRate}.
    roundingRuleConfigured: rate.getRoundingRule() !== undefined,
  };
}

/** Serialise a cascade selection, preserving the legacy's no-`else` null contract. */
function serializeOptionalPriceGroupRate(
  rate: ResolvedPriceGroupRate | undefined,
): OptionalSerializedPriceGroupRate {
  return rate === undefined
    ? { resolved: false, reason: 'noRateApplies' }
    : { resolved: true, rate: serializePriceGroupRate(rate) };
}

/**
 * Run one validated request against one request scope.
 *
 * ★ THE TEST SEAM, AND THE REASON IT IS EXPORTED. B8 requires this entrypoint's dependencies - the
 * clock and the account context above all - to be injectable WITHOUT module-level monkey-patching.
 * `handler` obtains its scope from the memoized composition root, which a suite cannot substitute
 * without patching this module; this function takes the scope as a parameter, so a suite builds a
 * six-member fake and drives every operation directly. That is the same test-seam idiom
 * `resetCompositionRoot` already publishes, and it keeps the PRIMARY exported unit - the Lambda
 * `handler` - singular.
 *
 * @throws {UnresolvableSkuSelectorError} when a selector names no single resolvable SKU. `handler`
 *   turns it into `./errorMapper.js`'s client-shaped invalid-request response; nothing else in this
 *   module interprets it.
 */
export async function dispatchPriceResolution(
  scope: PriceResolutionScope,
  request: PriceResolutionRequest,
): Promise<PriceResolutionResult> {
  switch (request.operation) {
    // --- 6.1 The product-type cascade entry point [model/service/PriceGroupService.cfc:L57] -----
    case 'getRateForProductTypeBasedOnPriceGroup': {
      const inputs = await resolveCascadeInputs(scope, request.sku);

      if (!inputs.resolved) {
        return { outcome: 'unresolved', reason: inputs.reason };
      }

      // CFML parity [model/service/PriceGroupService.cfc:L159]: the legacy chains
      // `sku.getProduct().getProductType()`. The product here IS the resolved SKU's own, wired
      // through by the read that produced the SKU, and an absent product type is reported rather
      // than fabricated.
      const productType = inputs.selection.product.getProductType();

      if (productType === undefined) {
        return { outcome: 'unresolved', reason: 'productTypeAbsent' };
      }

      return {
        outcome: 'priceGroupRate',
        rate: serializeOptionalPriceGroupRate(
          scope.priceGroupService.getRateForProductTypeBasedOnPriceGroup(
            productType,
            inputs.priceGroup,
          ),
        ),
      };
    }

    // --- 6.2 The product cascade entry point [model/service/PriceGroupService.cfc:L102] ---------
    case 'getRateForProductBasedOnPriceGroup': {
      const inputs = await resolveCascadeInputs(scope, request.sku);

      if (!inputs.resolved) {
        return { outcome: 'unresolved', reason: inputs.reason };
      }

      return {
        outcome: 'priceGroupRate',
        rate: serializeOptionalPriceGroupRate(
          scope.priceGroupService.getRateForProductBasedOnPriceGroup(
            inputs.selection.product,
            inputs.priceGroup,
          ),
        ),
      };
    }

    // --- 6.3 The SKU cascade entry point [model/service/PriceGroupService.cfc:L140] -------------
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: level five of this cascade recurses
    // into the parent price group by calling `getRateForProductBasedOnPriceGroup` rather than the SKU
    // variant, so a rate that includes the SKU on an ANCESTOR price group is never found.
    // Preserved deliberately; do not fix without a product decision.
    case 'getRateForSkuBasedOnPriceGroup': {
      const inputs = await resolveCascadeInputs(scope, request.sku);

      if (!inputs.resolved) {
        return { outcome: 'unresolved', reason: inputs.reason };
      }

      return {
        outcome: 'priceGroupRate',
        rate: serializeOptionalPriceGroupRate(
          scope.priceGroupService.getRateForSkuBasedOnPriceGroup(
            inputs.selection.sku,
            inputs.priceGroup,
          ),
        ),
      };
    }

    // --- 6.4 The price for a price group [model/service/PriceGroupService.cfc:L301] -------------
    case 'calculateSkuPriceBasedOnPriceGroup': {
      const inputs = await resolveCascadeInputs(scope, request.sku);

      if (!inputs.resolved) {
        return { outcome: 'unresolved', reason: inputs.reason };
      }

      // No absence arm: [L312] falls back to `sku.getPrice()` when the cascade finds no rate, so
      // this always produces a price.
      return {
        outcome: 'price',
        price: serializeMoney(
          scope.priceGroupService.calculateSkuPriceBasedOnPriceGroup(
            inputs.selection.sku,
            inputs.priceGroup,
          ),
        ),
      };
    }

    // --- 6.5 The price for one rate [model/service/PriceGroupService.cfc:L316] ------------------
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: the rounding rule is applied
    // ONLY on the `percentageOff` branch [L326-L328]; `amountOff` [L330-L332] and `amount`
    // [L333-L335] skip it, and the switch closes at [L336] with no `default:` arm, so an
    // unrecognised `amountType` passes through with the SKU's own price [L319].
    // Preserved deliberately; do not fix without a product decision.
    case 'calculateSkuPriceBasedOnPriceGroupRate': {
      const inputs = await resolveCascadeInputs(scope, request.sku);

      if (!inputs.resolved) {
        return { outcome: 'unresolved', reason: inputs.reason };
      }

      // The rate is this operation's INPUT, and the SKU cascade entry point is how a rate is
      // obtained at all - there is no published load-by-identifier for one, for the reason recorded
      // on `resolvePriceGroup`. Both calls are synchronous and neither is awaited.
      const rate = scope.priceGroupService.getRateForSkuBasedOnPriceGroup(
        inputs.selection.sku,
        inputs.priceGroup,
      );

      if (rate === undefined) {
        return { outcome: 'unresolved', reason: 'noRateApplies' };
      }

      return {
        outcome: 'price',
        price: serializeMoney(
          scope.priceGroupService.calculateSkuPriceBasedOnPriceGroupRate(
            inputs.selection.sku,
            rate,
          ),
        ),
      };
    }

    // --- 6.6 The two account-scoped prices [model/service/PriceGroupService.cfc:L262, L271] -----
    case 'calculateSkuPriceBasedOnCurrentAccount': {
      const selection = await resolveSkuSelection(scope, request.sku);

      // ★ NO ACCOUNT TEST HERE, DELIBERATELY. The whole point of this member is that it OWNS the
      // signed-in test: [L263] branches, [L264] resolves through the account, and [L265-L266]
      // answers `sku.getPrice()` otherwise. Testing the context here and short-circuiting would move
      // that decision out of the service and into an adapter. The context is handed over whole and
      // the service decides - which is exactly what T6 asks for.
      return {
        outcome: 'price',
        price: serializeMoney(
          await scope.priceGroupService.calculateSkuPriceBasedOnCurrentAccount(
            selection.sku,
            scope.currentAccountContext,
          ),
        ),
      };
    }

    case 'calculateSkuPriceBasedOnAccount': {
      const accountID = scope.currentAccountContext.accountID;

      // [L271] declares the account REQUIRED, so unlike the member above there is no fallback arm to
      // reproduce. The absence is reported as the domain outcome it is.
      if (accountID === undefined) {
        return { outcome: 'unresolved', reason: 'noAuthenticatedAccount' };
      }

      const selection = await resolveSkuSelection(scope, request.sku);

      return {
        outcome: 'price',
        price: serializeMoney(
          await scope.priceGroupService.calculateSkuPriceBasedOnAccount(selection.sku, accountID),
        ),
      };
    }

    // --- 6.7 The best-price-group report [model/service/PriceGroupService.cfc:L343] -------------
    case 'getBestPriceGroupDetailsBasedOnSkuAndAccount': {
      const accountID = scope.currentAccountContext.accountID;

      if (accountID === undefined) {
        return { outcome: 'unresolved', reason: 'noAuthenticatedAccount' };
      }

      const selection = await resolveSkuSelection(scope, request.sku);
      const details = await scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
        selection.sku,
        accountID,
      );

      return {
        outcome: 'bestPriceGroupDetails',
        // [L347] seeds this with `sku.getPrice()`, never with zero, so it is always present.
        price: serializeMoney(details.price),
        priceGroup:
          details.priceGroup === undefined
            ? { resolved: false, reason: 'noPriceGroupResolvedForSkuAndAccount' }
            : { resolved: true, priceGroupID: details.priceGroup.getPriceGroupID() },
      };
    }

    // --- 6.8 The price-group data document [model/service/PriceGroupService.cfc:L230] -----------
    case 'getPriceGroupDataJSON': {
      // Carried through as the string the service returned. Not parsed, not re-serialised, not
      // re-formatted - and NOT guarded: this member raises for any page holding a rate, and that
      // throw is mapped rather than caught. See {@link PriceResolutionResult} for both annotations.
      return {
        outcome: 'priceGroupData',
        priceGroupDataJSON: await scope.priceGroupService.getPriceGroupDataJSON(),
      };
    }

    // --- 6.9 The three currency accessors [model/entity/Sku.cfc:L269, L275, L281] --------------
    //
    // ★★ ALL THREE READ THROUGH THE FOUR-STEP CASCADE `Sku.getCurrencyDetails()`
    // [model/entity/Sku.cfc:L367-L433], whose memo is INSTANCE-SCOPED and whose instances are
    // REQUEST-SCOPED: the SKU was built by a read issued through this invocation's own scope and is
    // discarded with it. NOTHING HERE CACHES A CURRENCY MAP, a SKU, a price group or a rate across
    // invocations - module-scoping any of them on a warm container would let one request's state, and
    // therefore one customer's price, reach another's.
    //
    // The cascade's own steps are untouched: the eligibility gate at [L373], the base-currency step
    // at [L385-L397], the `SwSkuCurrency` overrides that OVERWRITE it at [L399-L414] and the
    // on-the-fly conversion "mechinism" at [L416-L428] all run inside the entity. This module
    // performs no lookup of its own into the resulting map, adds no second key-existence probe, and
    // supplies no eligible-currency list.
    case 'getPriceByCurrencyCode': {
      const selection = await resolveSkuSelection(scope, request.sku);

      return {
        outcome: 'currencyPrice',
        price: serializeOptionalMoney(
          selection.sku.getPriceByCurrencyCode(request.currencyCode),
          'noPriceForCurrencyCode',
        ),
      };
    }

    case 'getListPriceByCurrencyCode': {
      const selection = await resolveSkuSelection(scope, request.sku);

      return {
        outcome: 'currencyPrice',
        price: serializeOptionalMoney(
          selection.sku.getListPriceByCurrencyCode(request.currencyCode),
          'noPriceForCurrencyCode',
        ),
      };
    }

    case 'getRenewalPriceByCurrencyCode': {
      const selection = await resolveSkuSelection(scope, request.sku);

      return {
        outcome: 'currencyPrice',
        price: serializeOptionalMoney(
          selection.sku.getRenewalPriceByCurrencyCode(request.currencyCode),
          'noPriceForCurrencyCode',
        ),
      };
    }

    // --- 6.10 Conversion [model/service/CurrencyService.cfc:L84] --------------------------------
    //
    // ★★ `convertCurrency` NEVER THROWS AND IS TREATED AS NEVER THROWING.
    // [model/service/CurrencyService.cfc:L100-L101] silently returns the amount UNCONVERTED when
    // either code is missing from the rate table, so there is no error path here, no warning in the
    // response, no "conversion unavailable" status and no rate-source indicator. A caller cannot tell
    // a converted amount from an unconverted one, exactly as in the legacy.
    //
    // The port's `// TODO: add integration support` carry-forward [model/service/CurrencyService.cfc:L81]
    // stays where it is, flagged and NOT silently completed, and this module adds nothing that would
    // pretend it had been. `getEuropeanCentralBankRates()` [model/service/CurrencyService.cfc:L104] is
    // a live outbound HTTP call and is NOT ported - `./bootstrap.js` resolves that with its own
    // annotated judgment call. NO HTTP FETCH, NO XML PARSING AND NO ADDED PACKAGE APPEARS HERE.
    case 'convertCurrency': {
      // Both codes were length-checked by the schema, which is what lets `toCurrencyCode` mint the
      // brand the port's parameters declare without its rejection reaching a caller as a server
      // error. `Money.fromDecimalString` re-validates the numeral the schema already probed - the
      // value object is the single arithmetic surface and it validates its own ingress.
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

// ---------------------------------------------------------------------------
// 6.11 ★★★ `updateOrderAmountsWithPriceGroups` IS NOT EXPOSED, AND THAT IS STRUCTURAL
//
// JUDGMENT CALL: `public void function updateOrderAmountsWithPriceGroups(required any order)`
// [model/service/PriceGroupService.cfc:L364-L375] is the WRITER half of a cross-service ordering
// constraint, and it is deliberately absent from every schema arm, from
// {@link PriceResolutionScope.priceGroupService} and from the dispatcher above.
//
// THE CONSTRAINT. It must run BEFORE `updateOrderAmountsWithPromotions`
// [model/service/PromotionService.cfc:L58], because the promotion pass chooses its discount BASE
// PRICE from price-group state in its branch condition at [model/service/PromotionService.cfc:L241]
// through [L254]: an ineligible order item discounts from `getPrice()` while an eligible one
// discounts from `getSkuPrice()` plus the correction term
// `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`. Run the two in the wrong
// order and the amount a customer is charged changes. In the legacy that ordering held only because
// `OrderService` happened to call them in sequence [model/service/OrderService.cfc:L60-L61] - an
// obligation carried by convention.
//
// WHY NON-EXPOSURE IS THE ENFORCEMENT. `./bootstrap.js` publishes the two passes ONLY as a single
// composed operation, `updateOrderAmountsWithPriceGroupsThenPromotions`, and withholds both
// individual passes from the request tier by TYPE - `PriceResolutionCapability` is
// `PriceGroupService` MINUS this member, so naming it here would not compile. Exposing it as an
// independently callable operation from this entrypoint would hand a caller the ability to invert the
// sequence, which is precisely what the composed operation exists to make impossible. The composed
// operation is driven by `promotionApplicationHandler.ts`, the entrypoint that owns the order-shaped
// document; it is not this entrypoint's to call.
//
// ENFORCEMENT IS STRUCTURAL, NEVER PARAMETRIC. There is no `sequence`, `phase`, `runAfter`,
// `pipeline` or `skipPriceGroups` parameter anywhere in this file - such a parameter would restore
// exactly the convention-carried obligation that the constraint's history shows to be unsafe.
//
// ---------------------------------------------------------------------------
// 6.12 JUDGMENT CALL: THE SERVICE'S THREE WRITE MEMBERS ARE NOT EXPOSED
//
// `updatePriceGroupSKUSettings` [model/service/PriceGroupService.cfc:L184] - whose mid-name `SKU`
// capitalisation is preserved verbatim wherever this migration names it - `savePriceGroupRate` [L397]
// and `deletePriceGroup` [L461] are ported in full at the services tier and are reachable from the
// capability type. They are not published here, for two reasons that both stand alone:
//
//   1. AAP 0.4.1 assigns this entrypoint the price-group and currency RESOLUTION surface, and a
//      resolution surface is a read surface. None of the five capability handlers the AAP enumerates
//      - catalog query, SKU resolution, promotion application, price resolution, product feed - is
//      price-group administration, whose legacy home is the `admin/` subsystem that AAP 0.2.2 places
//      entirely out of scope.
//   2. Two of the three cannot be driven from the published request-tier surface in any case:
//      `savePriceGroupRate` requires a `PriceGroupRate` and `deletePriceGroup` a `PriceGroup`, and
//      there is no request-tier load-by-identifier for either - see `resolvePriceGroup` for why
//      inventing one, or reaching for the composition root's assembly-inspection hook to borrow one,
//      is not available.
//
// LEGACY-DEFECT [model/service/PriceGroupService.cfc:L465-L467] (register DEFECT 6): `deletePriceGroup`
// loops on the length of a collection captured at [L463] and always removes index one, so the loop
// can fail to terminate. It is reproduced at the services tier WITH a bounded-iteration termination
// safeguard and a flagged note, and withholding the member here neither repairs it, hides it nor
// removes that guard - it simply does not put the defect on an HTTP surface. Verified present at
// `../services/priceGroupService.js`.
// Preserved deliberately; do not fix without a product decision.
//
// B4 INTERFACE PARITY IS UNAFFECTED, and it is worth being precise about why: parity is a property of
// `../services/priceGroupService.js`, which still declares all thirteen members with their legacy
// names and signatures. This is a narrowing of REACH, exactly as `./bootstrap.js` argues for its own
// `Omit`, and never a narrowing of the ported surface. Keeping this entrypoint read-only is also what
// makes the omission of `adminAccountFlag` in section 5 correct rather than convenient: with no
// durable write there is no audit stamp to attribute, and no authorization vocabulary has to be
// invented for a mutation the source guarded in a subsystem this migration does not port.
//
// ---------------------------------------------------------------------------
// 6.13 JUDGMENT CALL: TWO OF THE CURRENCY PORT'S THREE MEMBERS ARE NOT EXPOSED
//
// `../domain/ports/currencyConverter.js` publishes three async members. Only `convertCurrency` is
// exposed. `getAllActiveCurrencyIDList` is the DEFAULT SOURCE of the `skuEligibleCurrencies` setting
// [model/service/SettingService.cfc:L222], and `getCurrenciesByCurrencyCodeList` is what the cascade
// reads that setting into [model/entity/Sku.cfc:L371, L375]. `./bootstrap.js` resolves that setting
// EAGERLY, once, inside the memoized initializer, precisely so no request-time path re-resolves it;
// publishing either member here would put a second, unmemoized eligible-currency resolution on an
// HTTP surface, and this module is required not to resolve, cache or supply a fallback for it.
//
// LEGACY-NOTE [model/entity/Sku.cfc:L371, L375]: `getCurrenciesByCurrencyCodeList` applies NO
// `activeFlag` filter, mirroring the legacy reads. Adding one would be a money bug, and nothing here
// filters, re-orders or post-processes a currency list - because nothing here reads one.
//
// LEGACY-NOTE: AAP 0.5.1 and 0.6.2 name a `getCurrencySmartList()` on `CurrencyService.cfc`. No such
// method exists in the source, so none is called and none is invented.
// ---------------------------------------------------------------------------

// ===========================================================================
// SECTION 7 - THE LAMBDA ENTRY POINT
//
// The only exported unit that AWS invokes, and the thinnest part of the file: route, read the body,
// validate it, open one scope, dispatch, serialise. Every failure leaves through `./errorMapper.js`,
// which is SELECTIVE and never a pass-through - `mysql2` errors routinely embed SQL text and bound
// parameter values, so a thrown value is CLASSIFIED for the log and a fixed sentence is published to
// the caller. No credential, connection string, SQL fragment, resolved path or echo of submitted
// input can reach a response body through this module.
// ===========================================================================

/**
 * Headers on a successful response.
 *
 * The same pair `./errorMapper.js` puts on every response it builds, restated because that constant
 * is module-private there. `no-store` is not a performance decision and carries no target: a resolved
 * price is account-scoped, so a shared cache must not be permitted to serve one account's price to
 * another.
 */
const SUCCESS_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/** A decoded request document, or the mapper's own reason for refusing to decode one. */
type RequestDocumentReading =
  | { readonly decoded: true; readonly document: object }
  | { readonly decoded: false; readonly reason: InvalidRequestReason };

/**
 * Decode the request body into a JSON object.
 *
 * Each refusal NAMES a reason from `./errorMapper.js`'s closed union and lets that module own the
 * sentence, which is what keeps the wording out of this file and the submitted value out of the
 * response. `unparsableRequestBody` is a reason this module STATES rather than something inferred
 * from a caught `SyntaxError`, because this service's own code can produce that shape too.
 *
 * A base64 body is decoded first - API Gateway sets `isBase64Encoded` for a binary media type, and a
 * caller that does so is not making a different request. Invalid base64 decodes to bytes that then
 * fail to parse, which lands on `unparsableRequestBody`, correctly.
 */
function readRequestDocument(event: APIGatewayProxyEvent): RequestDocumentReading {
  const rawBody = event.body;

  if (rawBody === null || rawBody.trim().length === 0) {
    return { decoded: false, reason: 'missingRequestBody' };
  }

  const text = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;

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

  return { decoded: true, document: parsed };
}

/**
 * The price-resolution Lambda entry point.
 *
 * ★ THE MEMOIZED INITIALIZER IS AWAITED INSIDE THE HANDLER, NEVER AT MODULE SCOPE.
 * `bootstrapCompositionRoot()` is idempotent: the first invocation on a container starts
 * initialization, concurrent callers await the same in-flight promise, a warm container resolves
 * immediately, and a FAILED initialization clears the memo so a later invocation can retry. A
 * top-level `await` is also impossible in the CommonJS bundle this file is emitted into.
 *
 * ★ EXACTLY ONE REQUEST SCOPE PER INVOCATION. Everything reachable from it that holds a memo - the
 * SKU's currency-detail map above all - was constructed for THIS request and is discarded with it.
 * Nothing is promoted to module scope: on a warm container that would carry one invocation's state,
 * and therefore one customer's price, into another's.
 *
 * @param event the API Gateway proxy event.
 * @param lambdaContext the Lambda context, read ONLY for its request identifier, which is the
 *   correlation token `./errorMapper.js` echoes so an operator can join a caller's generic response
 *   to the full detail on the log stream.
 * @returns the serialised outcome, or a mapped error response. This function does not reject:
 *   every failure is mapped.
 */
export async function handler(
  event: APIGatewayProxyEvent,
  lambdaContext: Context,
): Promise<APIGatewayProxyResult> {
  const baseErrorContext: ErrorMappingContext = {
    requestId: lambdaContext.awsRequestId,
    logger,
  };

  // The router owns resolution and hands back a READY response when nothing matched, so no status,
  // header set or body envelope for an unmatched request is decided here. Resolution is scoped to
  // THIS capability, so a request that matched another capability's route is reported as unmatched
  // rather than served by the wrong handler.
  const resolution = resolveRouteForCapability(
    routeRequestFromEvent(event),
    'priceResolution',
    baseErrorContext,
  );

  if (!resolution.matched) {
    return resolution.response;
  }

  const route = resolution.route;
  const errorContext: ErrorMappingContext = { ...baseErrorContext, route: route.path };

  const reading = readRequestDocument(event);

  if (!reading.decoded) {
    return invalidRequestResponse(reading.reason, errorContext);
  }

  try {
    // A `ZodError` from here is RECOGNIZED by `./errorMapper.js` and published as a client-shaped
    // response carrying field PATHS and constraint descriptions only - never the submitted values.
    const request = PRICE_RESOLUTION_REQUEST_SCHEMA.parse(reading.document);

    const accountID = readAuthenticatedAccountID(event);

    const compositionRoot = await bootstrapCompositionRoot();
    const scope = await compositionRoot.createRequestScope(buildRequestScopeInput(accountID));

    const result = await dispatchPriceResolution(scope, request);

    const body: PriceResolutionResponseBody = {
      operation: request.operation,
      // The injected clock, rendered UTC. See {@link PriceResolutionResponseBody.resolvedAt}.
      resolvedAt: scope.now.toISOString(),
      result,
    };

    // Only closed-vocabulary values are logged: the route and action come from the route table, the
    // operation from the schema's literal union, the outcome from the result union. The account is
    // reported as a BOOLEAN rather than as an identifier, and no part of the request document is
    // logged.
    logger.info('price resolution request served', {
      requestId: lambdaContext.awsRequestId,
      route: route.path,
      action: route.action,
      operation: request.operation,
      outcome: result.outcome,
      accountEstablished: accountID !== undefined,
    });

    return {
      statusCode: 200,
      headers: SUCCESS_RESPONSE_HEADERS,
      body: JSON.stringify(body),
    };
  } catch (thrown: unknown) {
    // Narrowed by `instanceof`, never by a cast. A selector that named nothing resolvable is the
    // caller's mistake, so it earns the mapper's client-shaped invalid-request response; the refusal
    // token is logged and is NOT published, because which of the four cases occurred is diagnostic
    // rather than actionable and reporting it would confirm the existence of a product or SKU the
    // caller guessed at.
    if (thrown instanceof UnresolvableSkuSelectorError) {
      logger.warn('the request named no single resolvable sku', {
        requestId: lambdaContext.awsRequestId,
        route: route.path,
        skuSelectorRefusal: thrown.refusal,
      });

      return invalidRequestResponse('unusableRequestInput', errorContext);
    }

    // Everything else - a validation failure, a driver error, a cascade association the legacy also
    // raised on - is classified by the mapper. Nothing thrown is passed into a response body.
    return mapErrorToApiGatewayResponse(thrown, errorContext);
  }
}
