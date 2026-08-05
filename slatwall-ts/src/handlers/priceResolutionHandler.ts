// ===========================================================================
// The price resolution Lambda entrypoint.
//
// A NET-NEW primary adapter over the price-group and currency resolution surface of
// `../services/priceGroupService.js` and `../domain/ports/currencyConverter.js`. Its whole job: parse
// the API Gateway event; resolve the action through `./router.js`; obtain the wired graph from
// `./bootstrap.js` through its memoized initializer; open exactly ONE request scope; invoke ONE
// already-ported member; serialise; map anything thrown through `./errorMapper.js`.
//
// ★★ THIS ENTRYPOINT FRONTS THE MUST-PRESERVE PRICE-GROUP AND CURRENCY RESOLUTION CASCADE, so it does
// the least it can. NO COERCION, NO DEFAULTING, NO REORDERING, NO CLAMPING AND NO ROUNDING
// "CORRECTION" HAPPENS IN TRANSIT. In particular:
//
//   * The five-level cascade [model/service/PriceGroupService.cfc:L140-L181] is neither reordered,
//     short-circuited, memoized nor "optimised" here. Its two documented asymmetries - the parent
//     recursion at [:L174] and the rounding rule applied only on the `percentageOff` branch
//     [:L316-L340] - are service-tier behaviour and are left alone.
//   * `RoundingRuleService.roundValue()` [model/service/RoundingRuleService.cfc:L88-L175] is
//     decimal-STRING manipulation and its measured outputs are counter-intuitive by design - `12.30`
//     with `.99` yields `12.99`, `7.42` with `9.99` yields `9.99`, `2.30` with `0.99` yields `0.99`,
//     and the default expression `"0.00"` turns `12.3456` into `10.00`. NO PRICE THIS MODULE
//     SERIALISES IS POST-PROCESSED, SANITY-CHECKED, CLAMPED OR REJECTED FOR LOOKING WRONG.
//   * `Sku.getPriceByCurrencyCode` and its two siblings answer NOTHING for a currency they have no
//     price for [model/entity/Sku.cfc:L269-L285]. That absence is serialised STRUCTURALLY - never as
//     `0`, never as a `null` a consumer can default, and never as an empty `Money`; it is represented
//     by omitting the optional `price` member, which is JSON's structural form of `undefined`.
//     Substituting zero would sell products for free.
//
// NO BUSINESS LOGIC LIVES HERE. No cascade walking, no rate selection, no rounding, no percentage
// arithmetic, no currency conversion, no `Money` arithmetic, no SQL, no entity construction and no
// settings resolution - every one of those lives in `../services/**` or `../domain/**`. It constructs
// no service, repository, port or connection pool - `./bootstrap.js` is the only composition root -
// and it never reads request state from `../lib/config.js`, which is STATIC PROCESS CONFIGURATION.
//
// THREE DELIBERATE NON-EXPOSURES, each argued where it is decided:
//   1. `updateOrderAmountsWithPriceGroups` - section 6.11, the cross-service ordering constraint.
//   2. The service's three WRITE members - section 6.12.
//   3. Two of the currency port's three members - section 6.13.
//
// DEPENDENCY DIRECTION. This module imports `./router.js`; the router never imports a handler, because
// the router owns RESOLUTION and a handler owns INVOCATION. `src/handlers/` is the inversion point of
// the subtree: nothing imports from it, so there is no back-edge and no cycle. No other capability
// handler is imported.
//
// `esbuild.config.mjs` emits CommonJS (`format: 'cjs'`) because bundling this dependency set to ESM
// builds cleanly and then fails at run time with `Dynamic require of "node:buffer"` through mysql2 ->
// sql-escaper. The consequence here is load-bearing: NO `import.meta` AND NO TOP-LEVEL `await`, so the
// memoized initializer is awaited INSIDE the handler.
//
// NO HTTP STATUS SEMANTICS THE SOURCE NEVER HAD ARE INVENTED. The shared mapper owns every status
// this module can produce: 400 for unusable input, 401 for an unidentified caller, 404 for an
// unmatched route and 500 for a server-shaped failure. The administrative whole-document operation
// was withdrawn, so this route has no permission-gated arm and emits no 403; it also mints no 409,
// 422 or 429 and no retry-after, rate-limit, challenge or circuit-breaker header. A DOMAIN outcome
// that resolved to nothing is answered successfully, with the absence stated in the body. No
// service-level objective, latency, throughput, uptime or availability figure appears anywhere in
// this file; the legacy 60-second, 45-second and 30-second lock timeouts are NOTED AND DELIBERATELY
// NOT IMPLEMENTED, and `cfthread` usage across the in-scope slice is zero.
// ===========================================================================

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
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  resolveRequestPrincipal,
  resolveServerRequestId,
  routeDiagnosticLabel,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import type { ErrorMappingContext, InvalidRequestReason } from './errorMapper.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';
import type { RouteAction } from './router.js';
import type { CurrencyConverter } from '../domain/ports/currencyConverter.js';
import type { CurrentAccountContext } from '../domain/ports/priceGroupRepository.js';
import { toCurrencyCode } from '../domain/valueObjects/currencyCode.js';
import { Money } from '../domain/valueObjects/money.js';
import { cfEquals } from '../lib/cfml/struct.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';

// ★ `cfEquals` NO LONGER PARTICIPATES IN SKU SELECTION (finding F3). It remains only at the account
// trust boundary, where CFML string comparison makes differently-cased spellings of the same opaque
// account identifier equal; entity identifiers themselves are bound to repository reads unchanged.

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
  | 'getPriceByCurrencyCode'
  | 'getListPriceByCurrencyCode'
  | 'getRenewalPriceByCurrencyCode'
  | 'convertCurrency';

// ★★★ `getPriceGroupDataJSON` USED TO BE THE THIRTEENTH OPERATION AND IS WITHDRAWN (finding F10,
// and the withdrawal arm expressly permitted by security finding V-03).
//
// `getPriceGroupDataJSON()` [model/service/PriceGroupService.cfc:L230-L257] takes NO arguments and
// answers a document covering EVERY price group and EVERY rate the smart list pages over. There is no
// member of the signature a routed contract could bound, so a single unauthenticated request obliged
// the process to build the whole thing in memory and stringify it into one API Gateway body. Adding a
// paging or ordering parameter is not available either: it would reshape a ported signature, and AAP
// 0.4.1 assigns this entrypoint the price-group and currency RESOLUTION surface - a document dump of
// the framework's administrative view is not resolution, and its legacy home is the `admin/`
// subsystem AAP 0.2.2 places entirely out of scope. Withdrawal closes both the unbounded-document
// finding and the missing-administrative-authorization finding without reintroducing either surface.
//
// THE TWO DEFECTS BEHIND IT ARE NEITHER REPAIRED NOR HIDDEN, only taken off the HTTP surface. They
// remain reproduced, flagged and covered at `../services/priceGroupService.js`:
//   CFML parity [model/service/PriceGroupService.cfc:L236]: the loop reads
//   `priceGroupSmartList.getPageRecords()[local.i]` while the counter declared at [:L235] is `i`.
//   `local` IS the implicit function scope in CFML, so `local.i` resolves to that same counter - the
//   line misleads a reader rather than misbehaving, and the port indexes by the counter faithfully.
//   LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the inner loop calls
//   `thisRate.getAmountRepresentation()`, which no in-scope component declares, so the method RAISES
//   for any page holding at least one rate and succeeds only in the degenerate case where every price
//   group on the page has none.
// Preserved deliberately; do not fix without a product decision.

/**
 * How a request names the SKU every SKU-taking operation needs: by identifier.
 *
 * ★★★ THIS REPLACED AN INVENTED `{productName, skuCode}` SELECTOR, AND THE REPLACEMENT IS THE FIX FOR
 * FINDING F3. The previous shape existed for a reason that was true when it was written and is no
 * longer true, and it is worth recording both halves.
 *
 * WHY IT EXISTED. `./bootstrap.js` had withdrawn the six MySQL repositories from `RequestScope`,
 * because they carried seven durable mutations onto the request-tier surface. That left no
 * load-by-identifier for a SKU, a product, a product type, a price group or a rate anywhere a handler
 * could reach, so this module resolved a SKU the only way the published reads allowed: a
 * `productName LIKE ?` search through `findProducts`, an exact-name filter, then `getProductSkus` and
 * an exact-code filter.
 *
 * WHY THAT WAS WRONG ANYWAY. AAP review (finding F3) found three consequences, and they compound:
 *   1. The named service operations did NOT accept the arguments their names declare. An operation
 *      called `...BasedOnPriceGroup` could not be given a price group; one is chosen for it.
 *   2. A single request could load a whole product result set and then all of a product's SKUs to
 *      reach one row - the static-performance half, raised as finding F10.
 *   3. The price group came from `getBestPriceGroupDetailsBasedOnSkuAndAccount`, so the handler
 *      silently substituted THE ACCOUNT'S BEST GROUP for the group the caller asked about, and
 *      `calculateSkuPriceBasedOnPriceGroupRate` ran a SECOND cascade to invent its rate argument.
 *      Both are selection decisions, and a primary adapter has no business making either.
 *
 * WHAT CHANGED UNDERNEATH. The composition root now publishes `RequestScope.entityLoaders`: five
 * READ-ONLY loads by identifier, each delegating to one repository read, with no save, no delete and
 * no entity-taking member reachable through them. The withdrawal that motivated the selector is
 * therefore still in force - the repositories are still not published - and the load a handler needs
 * is available without it. So every operation below binds EXACTLY the arguments its ported signature
 * declares, and this module makes no selection of any kind.
 *
 * Both identifiers are OPAQUE: they are keys, never handles, and nothing derives anything from their
 * content. The product identifier is not redundant - the only published read that returns a SKU with
 * its `product` WIRED THROUGH is `getProductSkus(product, ...)`, and a SKU without a product is
 * unusable for price-group resolution because cascade level two passes `sku.getProduct()` into a
 * parameter the legacy declares `required` [model/service/PriceGroupService.cfc:L154, L102].
 */
export type PriceResolutionSkuIdentity = SkuIdentity;

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

/**
 * The SKU identity, as a schema. Both identifiers are required and neither may be empty.
 *
 * NO FORMAT IS IMPOSED beyond non-emptiness. `SwSku.skuID` and `SwProduct.productID` are 32-character
 * hex strings in practice, but the legacy binds them with `cfqueryparam` and no pattern test, so an
 * identifier that matches nothing must answer NOTHING rather than earning a 400 - see
 * {@link UnresolvedReason}. Adding a pattern here would refuse input the legacy answered.
 */
const SKU_IDENTITY_SCHEMA = z.strictObject({
  productID: z.string().min(1),
  skuID: z.string().min(1),
});

/**
 * An identifier a caller names to bind one entity argument.
 *
 * The same restraint as above: presence is required, format is not.
 */
const IDENTIFIER_SCHEMA = z.string().min(1);

/**
 * A currency code as the three SKU accessors take one: ANY string, present.
 *
 * ★★ DELIBERATELY NOT LENGTH-CHECKED AND DELIBERATELY NOT NON-EMPTY, AND THE RESTRAINT IS THE POINT.
 * `Sku.getPriceByCurrencyCode(currencyCode)` [model/entity/Sku.cfc:L269-L273] takes a plain string
 * and answers a struct lookup: a code that is not in the SKU's currency map yields NOTHING, and a
 * two-character code is simply one such code. Refusing it with a 400 here would turn an input the
 * legacy ANSWERED into an error, which is a behavioural divergence dressed up as validation. The
 * accessor answers, and the absence is reported as an absence.
 *
 * ★★★ `.min(1)` WAS REMOVED, AND ITS PRESENCE CONTRADICTED THE PARAGRAPH ABOVE. A code review
 * measured the consequence: CFML `required string currencyCode` rejects a MISSING argument and
 * accepts an EMPTY one, so the legacy accessor was reachable with `''`, missed the case-insensitive
 * currency map exactly as any unknown code does, and answered NOTHING. This route turned that
 * answer - an omitted `price` on a 200 - into a 400, which is the single semantic the plan names as
 * highest-consequence (AAP 0.9.2) inverted at the boundary: the caller could no longer distinguish
 * "no price for that code" from "your request was wrong".
 *
 * PRESENCE IS STILL REQUIRED, because the ported signature declares the parameter: a request that
 * omits `currencyCode` entirely is refused with that member path, which is the direct analogue of
 * `required`. This is the same presence-not-emptiness rule the SKU-resolution entrypoint applies to
 * `selectedOptions`.
 */
const ACCESSOR_CURRENCY_CODE_SCHEMA = z.string();

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
 * ★★★ EVERY ARM NAMES EXACTLY THE ARGUMENTS ITS PORTED SIGNATURE DECLARES, WHICH IS FINDING F3'S
 * ACCEPTANCE TEST. Read the pairs off against `../services/priceGroupService.js`:
 * `getRateForProductTypeBasedOnPriceGroup(productType, priceGroup)` takes a product type and a price
 * group, so its arm carries `productTypeID` and `priceGroupID`;
 * `calculateSkuPriceBasedOnPriceGroupRate(sku, rate)` takes a SKU and a RATE, so its arm carries
 * `sku` and `priceGroupRateID` - it does not re-run a cascade to invent one. The two signatures that
 * explicitly declare an account also carry `accountID`; section 5 admits that value only when it is
 * identical to the SERVER-ESTABLISHED principal.
 *
 * Discriminating on `operation` is what makes the per-operation criteria CLOSED: a body naming
 * `convertCurrency` and carrying a `sku` is rejected, and so is one naming
 * `getRateForProductBasedOnPriceGroup` and carrying a `priceGroupRateID`. No arm admits an
 * unrecognised key.
 */
const PRICE_RESOLUTION_REQUEST_SCHEMA = z.discriminatedUnion('operation', [
  // --- The three cascade entry points, each bound to the two arguments it declares --------------
  //
  // All three are SYNCHRONOUS on the service and are consumed synchronously - see section 6.
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

  // --- The two calculations over the cascade ----------------------------------------------------
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnPriceGroup'),
    sku: SKU_IDENTITY_SCHEMA,
    priceGroupID: IDENTIFIER_SCHEMA,
  }),
  z.strictObject({
    operation: z.literal('calculateSkuPriceBasedOnPriceGroupRate'),
    sku: SKU_IDENTITY_SCHEMA,
    // ★ THE RATE IS NAMED, NOT DERIVED. The previous revision ran `getRateForSkuBasedOnPriceGroup`
    // to manufacture this argument, which meant an operation declared over ONE rate answered about
    // whichever rate a second cascade selected (finding F3).
    priceGroupRateID: IDENTIFIER_SCHEMA,
  }),

  // --- The two account-scoped calculations, and the best-price-group report --------------------
  //
  // None of the three takes an account from the payload. The account is server-established - see
  // section 5. None takes a price group either: these are the three members whose whole purpose is
  // to SELECT one, and selecting it here is what finding F3 objected to.
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

  // --- The currency resolution surface --------------------------------------------------------
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
 * disagree. Published because the test tier drives {@link dispatchPriceResolution} directly.
 */
export type PriceResolutionRequest = z.infer<typeof PRICE_RESOLUTION_REQUEST_SCHEMA>;

/**
 * The ONE operation this route serves to a caller it cannot identify.
 *
 * ★★★ THIS SET EXISTS BECAUSE A ROUTE-WIDE REFUSAL MADE A PORTED LEGACY BRANCH UNREACHABLE, AND THAT
 * WAS A FIDELITY DEFECT RATHER THAN A HARDENING DECISION. The legacy body, verbatim
 * [model/service/PriceGroupService.cfc:L262-L266]:
 *
 *     public numeric function calculateSkuPriceBasedOnCurrentAccount(required any sku) {
 *       if(getSlatwallScope().getLoggedInFlag()) {
 *         return calculateSkuPriceBasedOnAccount(sku=arguments.sku, account=getHibachiScope().getAccount());
 *       } else {
 *         return sku.getPrice();
 *
 * The member OWNS the signed-in test, and its `else` arm is the price an anonymous storefront visitor
 * is quoted. A previous revision of this file refused every unidentified caller BEFORE it read the
 * body, so no request could ever reach that arm through the routed surface: `CurrentAccountContext`
 * was non-empty on every invocation, the branch was dead, and a code review recorded exactly that.
 * The requirement is therefore applied PER OPERATION, and the decode moved ahead of it so the
 * operation is known when the decision is made.
 *
 * ★★ EXACTLY ONE OPERATION IS EXEMPT, AND THE ELEVEN OTHERS ARE NOT. The narrowness is the whole
 * safety argument: an earlier security review found (CRITICAL, CWE-306 and CWE-862) that four of the
 * five capability entrypoints served every anonymous request, and this route's catalogue, rate and
 * conversion surface was part of what that closed. Restoring the ONE branch the source makes
 * anonymous does not reopen the rest, and each retained requirement has its own reason:
 *
 *   * `calculateSkuPriceBasedOnAccount` and `getBestPriceGroupDetailsBasedOnSkuAndAccount` DECLARE an
 *     account [model/service/PriceGroupService.cfc:L271], [L343]. Without a principal there is
 *     nothing for {@link admitNamedAccount} to admit the caller's argument against, so the honest
 *     answer is a refusal rather than an `unresolved` outcome that reports the absence of the very
 *     thing the caller supplied.
 *   * The three cascade reads, the two price-group calculations and the three currency accessors
 *     expose price-group and per-currency PRICING DATA for a named SKU, product or product type.
 *     None has an anonymous legacy antecedent - the legacy reached them through the admin subsystem
 *     and through an order the checkout owned, both out of scope - so serving them anonymously would
 *     be a NEW permission, not a preserved one.
 *   * `convertCurrency` reads the configured rate table. Same reasoning: no anonymous antecedent.
 *
 * ONE LIST RATHER THAN A BOOLEAN MEMBER ON EACH ARM, so the exemption is stated in ONE place a
 * reviewer can read whole, and so adding an operation cannot silently inherit it: an operation is
 * anonymous only by being named here. FROZEN rather than a `Set`, matching every other constant in
 * this subtree: a `Set` is mutable at run time even behind a `ReadonlySet` annotation, and module
 * state that one invocation can change is precisely what a warm container carries into the next.
 */
const ANONYMOUS_PERMITTED_OPERATIONS: readonly PriceResolutionOperation[] = Object.freeze([
  'calculateSkuPriceBasedOnCurrentAccount',
]);

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
 * A CLOSED union of tokens, for the same reason `./errorMapper.js` closes
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
   * arm inside the service answers `sku.getPrice()`; `calculateSkuPriceBasedOnAccount` and
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` do, because [L271] and [L343] declare the account
   * required.
   */
  | 'noAuthenticatedAccount'
  /**
   * The request named an account other than the one established by the authorizer.
   *
   * Kept distinct from `noAuthenticatedAccount`: one means no principal exists, while this one
   * means a principal exists and the explicit service argument does not name it. The submitted value
   * is never echoed.
   */
  | 'accountNotTheAuthenticatedAccount'
  /**
   * No price group was resolved for this SKU and account, so the best-price-group report names none.
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
   * An identifier the request named matches no row.
   *
   * ★★★ FIVE TOKENS RATHER THAN ONE, AND THEY REPLACED A REFUSAL. The previous revision resolved a
   * SKU by searching product names, and a name matching nothing or matching several distinct products
   * was a client-shaped 400 built from a module-local `UnresolvableSkuSelectorError`. With the request
   * naming identifiers instead (finding F3), there is no ambiguity to refuse: an identifier either
   * names a row or it does not, and "it does not" is a DOMAIN OUTCOME the caller is told about in a
   * successful response - the same posture `Sku.getPriceByCurrencyCode` takes for an unknown currency,
   * and the same posture `RequestEntityLoaders` documents for a miss.
   *
   * Each token names WHICH identifier failed, so a caller supplying two identifiers in one body learns
   * which to correct without either being echoed back.
   */
  | 'productTypeNotFound'
  | 'productNotFound'
  | 'skuNotFound'
  | 'priceGroupNotFound'
  | 'priceGroupRateNotFound';

// ★★★ THREE TOKENS WERE REMOVED, AND EACH REMOVAL IS A FINDING RATHER THAN A TIDY-UP.
//
//   * `noPriceForCurrencyCode` - FINDING F4. It was the `reason` on a `{resolved:false, reason}`
//     sentinel published where a SKU had no price for the requested currency. AAP 0.4.2 declares
//     `Sku.getPriceByCurrencyCode` as `Money | undefined` and AAP 0.9.2 calls the `undefined` return
//     "the single highest-consequence parity check in the plan"; a sentinel is a THIRD absence
//     representation a consumer must learn to translate, and inventing one at the wire boundary is
//     what the parity check exists to prevent. The price member is now OMITTED, so a consumer reads
//     `undefined` - the exact value the accessor answered.
//   * `rateCarriesNoAmount` - FINDING F4, same reasoning applied to `PriceGroupRate.amount`, which is
//     a nullable `big_decimal` [model/entity/PriceGroupRate.cfc:L54] that `savePriceGroupRate` clears
//     outright on the `"new amount"` path [model/service/PriceGroupService.cfc:L399-L400]. The state
//     the token existed to distinguish is still expressible and still distinguishable: the rate is
//     PRESENT and its `amount` member is ABSENT, which says "a rate applied and carries no amount"
//     structurally rather than through a token.
//   * `productTypeAbsent` - obsolete under finding F3. It reported that the RESOLVED SKU'S product
//     carried no product type, which only arose because the product type was derived by chaining
//     `sku.getProduct().getProductType()` off a searched-for SKU. The request now names the product
//     type directly, so the only failure is `productTypeNotFound`.

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

// ★★★ `OptionalSerializedMoney` IS GONE, AND ITS REMOVAL IS FINDING F4.
//
// It was `{resolved: true, amount} | {resolved: false, reason}`, and the section header above argued
// for it on the grounds that a load-bearing absence must survive the wire. That premise is right and
// the mechanism was wrong: a discriminated sentinel is a THIRD representation of absence, alongside
// the `undefined` the accessor actually returned and the omitted member JSON already has a convention
// for. AAP 0.4.2 declares the three currency accessors as `Money | undefined`, and AAP 0.9.2 names
// preserving that `undefined` - "rather than `0`" - as the single highest-consequence parity check in
// the plan.
//
// A MONETARY VALUE THAT MAY NOT EXIST IS NOW `SerializedMoney | undefined`, AND `JSON.stringify` OMITS
// IT. A consumer reads `undefined` for the member, which is the exact value the accessor answered, and
// has nothing to translate. The three prohibitions the header states are unchanged and are now
// STRUCTURALLY unreachable rather than merely forbidden: there is no `0` arm, no `null` arm and no
// sentinel object to mistake for a present-but-blank price.

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

  /**
   * The rate's amount, OMITTED when the `big_decimal` column is null.
   *
   * ★ OMITTED RATHER THAN CARRIED UNDER A SENTINEL (finding F4). `PriceGroupRate.amount`
   * [model/entity/PriceGroupRate.cfc:L54] is nullable and `savePriceGroupRate` clears it outright on
   * the `"new amount"` path [model/service/PriceGroupService.cfc:L399-L400], so the state is reachable
   * rather than theoretical - and it is still fully distinguishable from "no rate applied": the RATE
   * is present here and this member is absent, which says both facts structurally.
   */
  readonly amount?: SerializedMoney | undefined;

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
   * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: the three `excluded*` collections are
   * counted by `getAppliesTo()` yet never consulted by the cascade.
   * Preserved deliberately; do not fix without a product decision.
   *
   * `excludedProductTypes`, `excludedProducts` and `excludedSkus` are declared and persisted, and the
   * five-level cascade at [model/service/PriceGroupService.cfc:L140-L181] does not read any of them -
   * so this value describes exclusions that do not affect the rate the cascade selected.
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
  /**
   * One of the three currency accessors, whose absence is load-bearing.
   *
   * ★★★ `price` IS OMITTED ON A MISS (finding F4), never `0`, never `null` and never a sentinel
   * object. AAP 0.4.2 declares all three accessors `Money | undefined` and AAP 0.9.2 names preserving
   * that `undefined` the single highest-consequence parity check in the plan: substituting a zero here
   * would sell products for free, and substituting a sentinel would oblige every consumer to learn a
   * translation JSON already has a convention for.
   *
   * BOTH LEGACY CAUSES OF A MISS PRODUCE THE SAME ABSENCE, deliberately: the currency may be absent
   * from the SKU's map [model/entity/Sku.cfc:L270], or present with the `listPrice` / `renewalPrice`
   * sub-key unset [L276], [L282]. The published accessor answers the same nothing either way, and
   * distinguishing them here would mean re-implementing its second key-existence check at this tier.
   */
  | { readonly outcome: 'currencyPrice'; readonly price?: SerializedMoney | undefined }
  /** The best-price-group report [model/service/PriceGroupService.cfc:L343-L362]. */
  | {
      readonly outcome: 'bestPriceGroupDetails';
      readonly price: SerializedMoney;
      readonly priceGroup: OptionalSerializedPriceGroup;
    }
  /** A cascade entry point's selection. */
  | { readonly outcome: 'priceGroupRate'; readonly rate: OptionalSerializedPriceGroupRate }
  // ★★★ THE `priceGroupData` ARM IS GONE WITH ITS OPERATION (finding F10). It carried the whole
  // administrative price-group document as one string. Removing the arm rather than leaving it
  // unreachable is what stops a consumer from finding a shape in this module's published types for a
  // response it can no longer obtain - see the withdrawal note on {@link PriceResolutionOperation}
  // for the reasoning, and `../services/priceGroupService.js` for the two defects that remain
  // reproduced, flagged and covered there.

  /** Nothing was produced, and this is why. Answered successfully, with no status invented. */
  | { readonly outcome: 'unresolved'; readonly reason: UnresolvedReason };

/**
 * The CAPABILITY-SPECIFIC payload of a successful response.
 *
 * ★★ THIS USED TO BE `PriceResolutionResponseBody`, THE WHOLE DOCUMENT, AND IT CARRIED NO
 * CORRELATION IDENTIFIER (finding F13). API review measured all four JSON entrypoints and found four
 * differently-shaped success envelopes, two of them - this one included - with no `requestId` at all,
 * so a caller could correlate a FAILURE to a log line and not a SUCCESS. The outer document now comes
 * from `./errorMapper.js`'s `jsonSuccessResponse`, which publishes `{requestId, capability, action,
 * result}` for every capability, and this type is what travels inside `result`.
 *
 * `requestId` is NOT duplicated here: the shared envelope carries it once, at the top level, and
 * echoing it twice would let the two copies disagree.
 *
 * Two members and no more. There is no envelope version, no pagination cursor, no diagnostic block and
 * no rate-source status: the currency converter answers unconverted rather than complaining when no
 * rate is available [model/service/CurrencyService.cfc:L100-L101], so a "conversion unavailable"
 * indicator would be an invention this contract has no right to make.
 */
export interface PriceResolutionResultDocument {
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

  /**
   * The five READ-ONLY loads by identifier this entrypoint binds its service arguments from.
   *
   * ★★★ THIS MEMBER REPLACED `productService.findProducts` AND `skuService.getProductSkus`, AND THE
   * REPLACEMENT IS THE STRUCTURAL HALF OF FINDING F3. Those two reads were the ONLY published way to
   * reach a SKU when this module was written, which is why it searched product names to find one; the
   * consequence was that a request naming a product could load a whole result set and then all of a
   * product's SKUs to reach one row, and that an operation named `...BasedOnPriceGroup` had its price
   * group chosen for it because nothing could load one.
   *
   * `RequestEntityLoaders` publishes exactly what binding needs and nothing else: five loads, each
   * delegating to ONE repository read, with no save, no delete and no entity-taking member reachable
   * through it. The withdrawal of the six MySQL repositories from `RequestScope` - made because they
   * carried seven durable mutations - therefore still holds in full.
   *
   * THE SEARCH READS ARE GONE RATHER THAN KEPT ALONGSIDE, deliberately: leaving `findProducts` on this
   * interface would leave the name-search path reachable, and a later change could quietly resurrect
   * the selector this finding removed. Their absence makes that a compile error.
   */
  readonly entityLoaders: RequestScope['entityLoaders'];

  /**
   * The eight price-group members this entrypoint exposes, and no others.
   *
   * `PriceResolutionCapability` is already `PriceGroupService` MINUS its order pass; this `Pick`
   * additionally withholds the three write members - see section 6.12 - and, since finding F10,
   * `getPriceGroupDataJSON` as well. Withholding that member by TYPE rather than only by schema is
   * what makes the withdrawal structural: naming it below would not compile.
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
   * One of the currency port's three members - see section 6.13 for why the other two are withheld.
   */
  readonly currencyConverter: Pick<CurrencyConverter, 'convertCurrency'>;
}

/** The product entity type, derived from the load that returns one. */
type ResolvedProduct = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getProductByProductID']>>
>;

/** The product-type entity type, derived from the load that returns one. */
type ResolvedProductType = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getProductTypeByProductTypeID']>>
>;

/** The SKU entity type, derived from the load that returns one with its product wired through. */
type ResolvedSku = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getSkuBySkuIdentity']>>
>['sku'];

/** The price-group entity type, derived from the load that returns one. */
type ResolvedPriceGroup = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getPriceGroup']>>
>;

/** The rate entity type, derived from the load that returns one. */
type ResolvedPriceGroupRate = NonNullable<
  Awaited<ReturnType<PriceResolutionScope['entityLoaders']['getPriceGroupRate']>>
>;

// ===========================================================================
// SECTION 4 - ARGUMENT BINDING
//
// Turning the identifiers a request names into the entities a ported signature already declares.
// Every step is ONE load by primary key through `RequestScope.entityLoaders`, and NONE OF THEM DECIDES
// A PRICE, A PRICE GROUP OR A RATE: binding answers "which row did the caller name", never "which row
// should apply".
//
// ★★★ THIS SECTION USED TO BE 200 LINES OF SEARCHING, AND ALL OF IT IS GONE (finding F3). It held
// `resolveProduct` - a `productName LIKE ?` scan followed by an exact-name filter and an ambiguity
// refusal - `resolveSkuOfProduct`, `resolveSkuSelection`, `resolvePriceGroup`, `CascadeInputs`,
// `resolveCascadeInputs`, a `SkuSelectorRefusal` token union and an `UnresolvableSkuSelectorError`
// class. Every one of them existed to work around the absence of a load-by-identifier, and every one
// introduced a decision this tier had no authority to make:
//
//   * `resolveProduct` searched, then chose - or refused - among candidates. A caller could not see
//     which candidate was picked, and a name matching two products was a 400 for a request that named
//     nothing wrong.
//   * `resolveSkuOfProduct` read ALL of a product's SKUs to select one by code.
//   * `resolvePriceGroup` called `getBestPriceGroupDetailsBasedOnSkuAndAccount` and handed its answer
//     to operations named `...BasedOnPriceGroup`. That silently substituted THE ACCOUNT'S BEST GROUP
//     for the group the caller asked about - the sharpest half of the finding, because the operation
//     still answered, plausibly, about something else.
//   * `resolveCascadeInputs` bundled all of the above and tested the account BEFORE the selector,
//     which made the account failure pre-empt a selector failure for reasons of statement economy.
//
// WHAT REPLACES THEM IS FOUR ONE-LINE LOADS AND NO CONTROL FLOW WORTH NAMING. A miss is `undefined`
// and becomes an `unresolved` outcome naming which identifier failed; nothing is searched, nothing is
// filtered, nothing is chosen and nothing is refused for ambiguity, because a primary key admits none.
// ===========================================================================

/** The SKU a request named, with its product, or nothing. */
async function loadSku(
  scope: PriceResolutionScope,
  identity: PriceResolutionSkuIdentity,
): Promise<{ readonly product: ResolvedProduct; readonly sku: ResolvedSku } | undefined> {
  return scope.entityLoaders.getSkuBySkuIdentity(identity);
}

/** The price group a request named, or nothing. */
async function resolveNamedPriceGroup(
  scope: PriceResolutionScope,
  priceGroupID: string,
): Promise<ResolvedPriceGroup | undefined> {
  return scope.entityLoaders.getPriceGroup(priceGroupID);
}

/** The price-group rate a request named, or nothing. */
async function resolveNamedPriceGroupRate(
  scope: PriceResolutionScope,
  priceGroupRateID: string,
): Promise<ResolvedPriceGroupRate | undefined> {
  return scope.entityLoaders.getPriceGroupRate(priceGroupRateID);
}

/** The product type a request named, or nothing. */
async function loadProductType(
  scope: PriceResolutionScope,
  productTypeID: string,
): Promise<ResolvedProductType | undefined> {
  return scope.entityLoaders.getProductTypeByProductTypeID(productTypeID);
}

/** The product a request named, or nothing. */
async function loadProduct(
  scope: PriceResolutionScope,
  productID: string,
): Promise<ResolvedProduct | undefined> {
  return scope.entityLoaders.getProductByProductID(productID);
}

/**
 * The SKU and the price group a request named, or the reason one of them is missing.
 *
 * ★ BOTH IDENTIFIERS ARE THE CALLER'S, SO BOTH LOADS ARE UNCONDITIONAL AND INDEPENDENT. The previous
 * revision ordered its work so that an account failure pre-empted a selector failure, on the grounds
 * that it saved two statements; there is nothing to trade off here, because neither load depends on
 * the other and neither depends on an account. The SKU is reported first when both are missing, which
 * is arbitrary and stated as such rather than dressed up as a policy.
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

/** The result of binding an explicit account argument to the authenticated request principal. */
type AdmittedAccount =
  | { readonly admitted: true; readonly accountID: string }
  | {
      readonly admitted: false;
      readonly reason: 'noAuthenticatedAccount' | 'accountNotTheAuthenticatedAccount';
    };

/**
 * Admit an explicit account argument only when it names the server-established principal.
 *
 * The ported methods declare this argument, so the wire contract represents it rather than silently
 * substituting another value. Authorization remains server-owned: absence and mismatch are distinct
 * closed outcomes, and the caller-authored identifier is never reflected.
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
// ★★ THE ACCOUNT IS SERVER-ESTABLISHED EVEN WHERE A PORTED SIGNATURE EXPLICITLY NAMES IT.
// `calculateSkuPriceBasedOnAccount` and `getBestPriceGroupDetailsBasedOnSkuAndAccount` carry the
// declared argument on the wire, but {@link admitNamedAccount} accepts it only when it equals the
// API Gateway authorizer's account claim. A missing principal and a mismatched explicit argument are
// separate closed outcomes; neither lets request content choose another account's pricing context.
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
 * ★★★ ABSENCE IS CARRIED AS ABSENCE (finding F4). This function used to take a `reason` token and
 * answer `{resolved: false, reason}` on a miss; the section 2 note records why that was wrong. It now
 * answers `undefined`, which `JSON.stringify` OMITS from the enclosing document - so a consumer reads
 * the exact value the accessor answered. Never a zero, never a null, never a sentinel object.
 */
function serializeOptionalMoney(value: Money | undefined): SerializedMoney | undefined {
  return value === undefined ? undefined : serializeMoney(value);
}

/** Project a rate onto the wire. Reads the entity's own accessors and computes nothing. */
function serializePriceGroupRate(rate: ResolvedPriceGroupRate): SerializedPriceGroupRate {
  return {
    priceGroupRateID: rate.getPriceGroupRateID(),
    globalFlag: rate.getGlobalFlag(),
    // The rate's `amount` column is nullable, so its absence is carried structurally too - under its
    // OWN reason token, because a rate that applied without an amount is not the same state as no
    // rate applying. See {@link UnresolvedReason}.
    // Omitted when the nullable column is null - see {@link SerializedPriceGroupRate.amount}.
    amount: serializeOptionalMoney(rate.getAmount()),
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
 * five-member fake and drives every operation directly. That is the same test-seam idiom
 * `resetCompositionRoot` already publishes, and it keeps the PRIMARY exported unit - the Lambda
 * `handler` - singular.
 *
 * ★★★ IT NO LONGER THROWS FOR AN UNRESOLVABLE INPUT, AND THAT IS FINDING F3. The previous revision
 * documented `@throws {UnresolvableSkuSelectorError} when a selector names no single resolvable SKU`,
 * because a product-NAME search could match nothing or match several. An identifier admits neither
 * outcome: it names a row or it does not, and "it does not" is reported as an `unresolved` outcome in a
 * SUCCESSFUL response naming which identifier failed. This function therefore has no `throws` clause of
 * its own; whatever a SERVICE throws is still propagated untouched and classified by the mapper.
 */
export async function dispatchPriceResolution(
  scope: PriceResolutionScope,
  request: PriceResolutionRequest,
): Promise<PriceResolutionResult> {
  switch (request.operation) {
    // --- 6.1 The product-type cascade entry point [model/service/PriceGroupService.cfc:L57] -----
    //
    // ★★ BOUND TO THE TWO ARGUMENTS THE SIGNATURE DECLARES: a product type and a price group, each
    // loaded by the identifier the caller named. The previous revision derived the product type by
    // chaining `sku.getProduct().getProductType()` off a SKU it had found by searching product names,
    // and took the price group from the account's best-group report - so the operation answered about
    // a product type and a price group the caller had not named (finding F3).
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

    // --- 6.2 The product cascade entry point [model/service/PriceGroupService.cfc:L102] ---------
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

    // --- 6.3 The SKU cascade entry point [model/service/PriceGroupService.cfc:L140] -------------
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: level five recurses into the parent
    // price group through the PRODUCT variant rather than the SKU variant.
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

    // --- 6.4 The price for a price group [model/service/PriceGroupService.cfc:L301] -------------
    case 'calculateSkuPriceBasedOnPriceGroup': {
      const bound = await resolveCascadeInputs(scope, request.sku, request.priceGroupID);

      if (!bound.bound) {
        return { outcome: 'unresolved', reason: bound.reason };
      }

      // No absence arm: [L312] falls back to `sku.getPrice()` when the cascade finds no rate, so
      // this always produces a price.
      return {
        outcome: 'price',
        price: serializeMoney(
          scope.priceGroupService.calculateSkuPriceBasedOnPriceGroup(bound.sku, bound.priceGroup),
        ),
      };
    }

    // --- 6.5 The price for one rate [model/service/PriceGroupService.cfc:L316] ------------------
    //
    // ★★★ THE RATE IS THE CALLER'S, LOADED BY IDENTIFIER (finding F3). The previous revision called
    // `getRateForSkuBasedOnPriceGroup` here to MANUFACTURE this argument, which meant an operation
    // declared over ONE rate answered about whichever rate a second cascade run happened to select -
    // and ran that cascade at the caller's expense to do it. Binding the declared argument makes the
    // operation answer the question its name asks.
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: the rounding rule is applied
    // ONLY on the `percentageOff` branch.
    // Preserved deliberately; do not fix without a product decision.
    //
    // `percentageOff` rounds at [:L326-L328]; `amountOff` [:L330-L332] and `amount` [:L333-L335] skip
    // it, and the switch closes at [:L336] with no `default:` arm, so an unrecognised `amountType`
    // passes through with the SKU's own price [:L319].
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

    // --- 6.6 The two account-scoped prices [model/service/PriceGroupService.cfc:L262, L271] -----
    case 'calculateSkuPriceBasedOnCurrentAccount': {
      const loaded = await loadSku(scope, request.sku);

      if (loaded === undefined) {
        return { outcome: 'unresolved', reason: 'skuNotFound' };
      }

      // ★ NO ACCOUNT TEST HERE, DELIBERATELY. The whole point of this member is that it OWNS the
      // signed-in test: [L263] branches, [L264] resolves through the account, and [L265-L266]
      // answers `sku.getPrice()` otherwise. Testing the context here and short-circuiting would move
      // that decision out of the service and into an adapter. The context is handed over whole and
      // the service decides - which is exactly what T6 asks for.
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

    // --- 6.7 The best-price-group report [model/service/PriceGroupService.cfc:L343] -------------
    //
    // ★ THIS IS THE ONE OPERATION WHOSE JOB IS TO SELECT A PRICE GROUP, so it names no group or rate.
    // It still carries the account argument its ported signature declares, and that argument must match
    // the server-established principal. The previous revision used this operation as a resolution
    // helper for the five operations above, silently substituting the account's best group.
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
        // [L347] seeds this with `sku.getPrice()`, never with zero, so it is always present.
        price: serializeMoney(details.price),
        priceGroup:
          details.priceGroup === undefined
            ? { resolved: false, reason: 'noPriceGroupResolvedForSkuAndAccount' }
            : { resolved: true, priceGroupID: details.priceGroup.getPriceGroupID() },
      };
    }

    // --- 6.8 The three currency accessors [model/entity/Sku.cfc:L269, L275, L281] --------------
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
    //
    // ★★★ A MISS OMITS `price` (finding F4). Not `0`, not `null`, not a sentinel - see the
    // `currencyPrice` arm of {@link PriceResolutionResult} for why AAP 0.9.2 makes this the single
    // highest-consequence parity check in the plan.
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

    // --- 6.9 Conversion [model/service/CurrencyService.cfc:L84] ---------------------------------
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
// 6.10 ★★★ `getPriceGroupDataJSON` IS NO LONGER EXPOSED (finding F10 and V-03)
//
// It was operation 6.8 of the previous revision, dispatched as
// `{outcome: 'priceGroupData', priceGroupDataJSON: await ...getPriceGroupDataJSON()}`. The member
// takes NO arguments and answers a document covering every price group and every rate the framework
// smart list pages over, so a routed contract had nothing to bound and a single request obliged the
// process to build the whole thing and stringify it into one API Gateway body. It is withdrawn from
// the schema, from the result union, from `PriceResolutionScope.priceGroupService` and from the
// dispatcher - four places, so that naming it anywhere no longer compiles.
//
// The member is untouched at `../services/priceGroupService.js`, where it is still ported in full and
// where its two legacy defects remain reproduced, flagged and covered. Withdrawing it neither repairs
// them nor hides them; it takes them off an HTTP surface. See the note on
// {@link PriceResolutionOperation} for the full argument, including why a paging parameter was not
// available as an alternative.
//
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
// through [:L254]. The polarity, as the source states it: a NULL applied price group, OR a reward that
// DOES list the applied group as eligible, discounts from `getPrice()` with NO correction term
// ([:L241] -> [:L244]); OTHERWISE the discount comes from `getSkuPrice()` and then SUBTRACTS the
// extended-price delta, `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`
// ([:L246] -> [:L249], [:L252]). Run the two in the wrong order and the amount a customer is charged
// changes. In the legacy that ordering held only because `OrderService` happened to call them in
// sequence [model/service/OrderService.cfc:L60-L61] - an obligation carried by convention.
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
// LEGACY-DEFECT [model/service/PriceGroupService.cfc:L465-L467]: `deletePriceGroup` loops on a
// collection captured at [:L463] and always removes index one.
// Preserved deliberately; do not fix without a product decision.
//
// The AAP's defect register carries that shape as a potential non-termination concern, and it is a
// REGISTERED CONCERN rather than an established source failure: the captured array is the SAME array
// `removeChildPriceGroup` -> `removeParentPriceGroup` -> `arrayDeleteAt`
// [model/entity/PriceGroup.cfc:L116-L123, L139-L140] mutates, so in the source the length does shrink.
// The services tier reproduces the loop WITH a bounded-iteration safeguard and a flagged note, and
// withholding the member here neither repairs it, hides it nor removes that guard - it simply does not
// put it on an HTTP surface.
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
 * The one route action this module implements.
 *
 * ★ CHECKED RATHER THAN ASSUMED (finding F12). Typed to the router's own union, so a renamed action
 * breaks this file at compile time instead of silently answering nothing, and compared explicitly in
 * {@link handler} before any body is parsed. The capability check the router already performs implies
 * this one while the table holds one route per capability - and the table is additive by design, so an
 * action this module does not implement must be able to fall out as a non-route.
 */
const IMPLEMENTED_ROUTE_ACTION: RouteAction = 'resolvePrices';

/**
 * Headers on a successful response.
 *
 * ★★ RETAINED ONLY AS THE ASSERTION THIS MODULE'S OWN CONTRACT MAKES; THE RESPONSE IS BUILT BY THE
 * SHARED BUILDER NOW (finding F13). `jsonSuccessResponse` in `./errorMapper.js` emits exactly this
 * pair for every capability, and this constant is no longer read - it is kept as the place the
 * `no-store` reasoning lives, because that reasoning is specific to THIS capability and would be lost
 * in a shared module: `no-store` is not a performance decision and carries no target, but a resolved
 * price is ACCOUNT-SCOPED, so a shared cache must not be permitted to serve one account's price to
 * another. If the shared builder ever stopped emitting it, this capability would have to reintroduce
 * it, and the suite asserts the header pair on a served response for exactly that reason.
 */
export const REQUIRED_SUCCESS_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/** A decoded request document, or the mapper's own reason for refusing to decode one. */
type RequestDocumentReading =
  | { readonly decoded: true; readonly document: object }
  | { readonly decoded: false; readonly reason: InvalidRequestReason };

/** Maximum decoded request document admitted by this compact operation grammar. */
const MAXIMUM_REQUEST_DOCUMENT_BYTES = 8 * 1024;

/** Encoded length above which a base64 body cannot decode within the byte ceiling. */
const MAXIMUM_ENCODED_BODY_LENGTH = Math.ceil((MAXIMUM_REQUEST_DOCUMENT_BYTES * 4) / 3) + 4;

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

  return { decoded: true, document: parsed };
}

/** The two production dependencies the price-resolution entrypoint allows a suite to substitute. */
export interface PriceResolutionHandlerDependencies {
  /** Resolve the wired graph. Defaults to the memoized production composition root. */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;
  /** Structured diagnostic sink. Defaults to the process logger. */
  readonly logger?: Logger | undefined;
}

/** The two-parameter async Lambda shape emitted by this module. */
export type PriceResolutionLambdaHandler = (
  event: APIGatewayProxyEvent,
  lambdaContext?: Context,
) => Promise<APIGatewayProxyResult>;

/**
 * Build the price-resolution Lambda entry point over explicit substitution seams.
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
 * @param dependencies optional composition-root and logger substitutions. Omit in production.
 * @returns the serialised Lambda handler. It never rejects: every failure is mapped.
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
    // ★★ THE SHARED CORRELATION POLICY, NOT THIS MODULE'S OWN (finding F8). It used to read
    // `lambdaContext.awsRequestId` and nothing else, which meant an event delivered without a runtime
    // context - synthesisable, and the reason the parameter is now optional - produced `undefined` in a
    // response body and on every log line. `resolveServerRequestId` prefers the runtime identifier, falls
    // back to the gateway's, and substitutes a fixed obviously-synthetic token when the platform supplied
    // neither. Nothing is read from a header in any of the three arms.
    const requestId = resolveServerRequestId(event, lambdaContext);

    // ★★ ONE MAPPING CONTEXT FOR THE WHOLE INVOCATION, REASSIGNED ONCE WHEN THE ROUTE IS KNOWN, and it
    // is the same object every refusal and the single `catch` read.
    let mappingContext: ErrorMappingContext = { requestId, logger };

    // The router owns resolution and hands back a READY response when nothing matched, so no status,
    // header set or body envelope for an unmatched request is decided here. Resolution is scoped to
    // THIS capability, so a request that matched another capability's route is reported as unmatched
    // rather than served by the wrong handler.
    const resolution = resolveRouteForCapability(
      routeRequestFromEvent(event),
      'priceResolution',
      mappingContext,
    );

    if (!resolution.matched) {
      return resolution.response;
    }

    const route = resolution.route;

    // ★ THE LABEL IS `METHOD /path`, BUILT FROM THE MATCHED ROW'S OWN FROZEN MEMBERS (finding F8). It
    // used to be `route.path` alone - this module was the only one of the five labelling a route without
    // its method, so an operator could not group failures across the five endpoints by one convention.
    // `event.httpMethod` is deliberately NOT used: the router matches the method with `listFindNoCase`,
    // so a caller-supplied casing would reach the log line for no diagnostic gain.
    mappingContext = {
      requestId,
      route: routeDiagnosticLabel(route.methods, route.path),
      logger,
    };

    // ★★★ THE RESOLVED ACTION IS VERIFIED BEFORE ANY BODY IS READ (finding F12). The previous revision
    // never compared it at all and used it only as a log value. The shared table declares one route per
    // capability today, so this is unreachable - and it is written anyway because the router's own note
    // records that adding a second route to a capability later is ADDITIVE, at which point an action this
    // module does not implement must fall out as a non-route rather than reaching the dispatcher. Placed
    // before `readRequestDocument` so an unimplemented action costs no parse and no service work.
    if (route.action !== IMPLEMENTED_ROUTE_ACTION) {
      return routeNotFoundResponse(mappingContext);
    }

    const reading = readRequestDocument(event);

    if (!reading.decoded) {
      return invalidRequestResponse(reading.reason, mappingContext);
    }

    try {
      // A `ZodError` from here is RECOGNIZED by `./errorMapper.js` and published as a client-shaped
      // response carrying field PATHS and constraint descriptions only - never the submitted values.
      // Every arm is a `z.strictObject`, so an unrecognised key is refused and named rather than dropped.
      const request = PRICE_RESOLUTION_REQUEST_SCHEMA.parse(reading.document);

      // ★★★ THE ACCOUNT REQUIREMENT IS APPLIED HERE, PER OPERATION, AND THE POSITION IS THE FIX.
      //
      // It used to sit ABOVE the decode and refuse every unidentified caller outright, which made the
      // `else` arm of `calculateSkuPriceBasedOnCurrentAccount`
      // [model/service/PriceGroupService.cfc:L265-L266] unreachable through this route - see
      // {@link ANONYMOUS_PERMITTED_OPERATIONS} for the whole finding and for why exactly one operation
      // is exempt. Knowing WHICH operation was asked for requires the body, so the decision cannot
      // precede the parse.
      //
      // ★★ WHAT THE REORDERING COSTS, STATED RATHER THAN GLOSSED. An unidentified caller can now make
      // this function read and parse a body before being refused. That cost is bounded by the same
      // ceiling every caller is held to - {@link MAXIMUM_REQUEST_DOCUMENT_BYTES}, 8 KiB, checked before
      // `JSON.parse` - and it buys nothing else: a refused request still opens NO composition root, NO
      // request scope and NO connection, and issues no statement.
      //
      // ★★ AND IT DISCLOSES NOTHING NEW. The refusal is still `unauthenticatedResponse`, whose sentence
      // names no claim, no operation and no principal, and whose body carries no `fields`. A caller
      // that sends a malformed body now learns that its body was malformed before learning it is
      // unidentified; both facts were already available to it - the route's existence from the
      // 401-versus-404 distinction, and the schema from the published contract - so the order in which
      // it learns them tells it nothing more.
      const principalResolution = resolveRequestPrincipal(event);

      if (
        !principalResolution.identified &&
        !ANONYMOUS_PERMITTED_OPERATIONS.includes(request.operation)
      ) {
        return unauthenticatedResponse(mappingContext);
      }

      // ★★★ AN ANONYMOUS REQUEST OPENS ITS SCOPE WITH NO ACCOUNT, AND THAT IS THE POINT.
      // `buildRequestScopeInput(undefined)` produces `{accountID: undefined}`, which the composition
      // root publishes as an EMPTY `CurrentAccountContext` - the key OMITTED, not present-and-undefined
      // - so `calculateSkuPriceBasedOnCurrentAccount` receives the falsy `getLoggedInFlag()` state the
      // legacy `else` arm is written for and answers `sku.getPrice()`. Nothing is substituted for the
      // absent account: no default account, no guest identifier and no empty string, any of which
      // would make the service take the WRONG arm.
      const accountID = principalResolution.identified
        ? principalResolution.principal.accountID
        : undefined;

      const compositionRoot = await openCompositionRoot();
      const scope = await compositionRoot.createRequestScope(buildRequestScopeInput(accountID));

      const result = await dispatchPriceResolution(scope, request);

      const document: PriceResolutionResultDocument = {
        operation: request.operation,
        // The injected clock, rendered UTC. See {@link PriceResolutionResultDocument.resolvedAt}.
        resolvedAt: scope.now.toISOString(),
        result,
      };

      // Only closed-vocabulary values are logged: the route label and action come from the route table,
      // the operation from the schema's literal union, the outcome from the result union. The account is
      // reported as a BOOLEAN rather than as an identifier, and no part of the request document is
      // logged. Every key here is in the logger's closed diagnostic allow-list, which finding F7
      // established was not previously true of `action`, `operation`, `outcome` and `accountEstablished`.
      logger.info('price resolution request served', {
        requestId,
        route: mappingContext.route,
        action: route.action,
        operation: request.operation,
        outcome: result.outcome,
        accountEstablished: accountID !== undefined,
      });

      // ★ THE SHARED SUCCESS ENVELOPE, WHICH IS WHAT PUTS `requestId` IN A SUCCESSFUL BODY AT ALL
      // (finding F13). It also owns the status and the header set, so neither is decided here.
      return jsonSuccessResponse(requestId, route.capability, route.action, document);
    } catch (thrown: unknown) {
      // ★★★ ONE EMISSION, OWNED BY THE MAPPER (finding F14). The previous revision caught a
      // module-local `UnresolvableSkuSelectorError`, emitted its OWN `warn` line carrying the refusal
      // token, and then called `invalidRequestResponse` - which logs the same refusal again. Two lines
      // for one event makes a log stream count refusals twice and forces an operator to recognise that
      // the pair is one occurrence.
      //
      // That whole arm is gone for a second reason as well: the error class it caught no longer exists.
      // It was raised only by the product-name search this module performed to find a SKU, and finding
      // F3 replaced that search with a load by identifier - so there is no ambiguity to refuse and no
      // local classification left to emit. A miss is now an `unresolved` outcome in a SUCCESSFUL
      // response, and the only remaining refusals are the schema's, which the mapper already owns.
      //
      // Narrowing is by the mapper's own `instanceof` probes, never by a cast here. Nothing thrown is
      // passed into a response body: a driver error's text can embed a statement and its bound values.
      // The context is the ROUTED one, so the classification is logged against the endpoint that
      // produced it.
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/** The production Lambda entrypoint. */
export const handler: PriceResolutionLambdaHandler = createPriceResolutionHandler();
