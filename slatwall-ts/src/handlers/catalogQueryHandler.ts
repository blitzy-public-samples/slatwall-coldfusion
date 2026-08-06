// ---------------------------------------------------------------------------
// The catalog Lambda entrypoint.
//
// A THIN PRIMARY ADAPTER over the ported Product, Brand and Option service methods. It parses the
// API Gateway event, lets `./router.js` decide whether the request belongs to this capability,
// resolves which ONE method the request names, binds that method's entity arguments through the
// request scope's read-only loaders, opens exactly one per-request scope from `./bootstrap.js`,
// invokes the method, projects the result onto JSON, and funnels every thrown value through
// `./errorMapper.js`.
//
// One route, `queryCatalog`, and exactly FOURTEEN operations. Method names are carried over verbatim
// in CFML camelCase because method-level interface parity is this migration's acceptance contract.
//
// ★★★ IT PUBLISHED THREE OF THE FOURTEEN, AND THE ELEVEN THAT WERE MISSING ARE A CRITICAL REVIEW
// FINDING. A code review measured this entrypoint against AAP 0.4.2's mapping and found that
// "eleven mapped actions have no transport schema, dispatch, DTO or test", leaving catalog
// persistence and the WHOLE of `BrandService` unreachable from Lambda - the catalog route was
// therefore not complete end to end. The eleven are now published, and the ground this file gave for
// omitting them is quoted and answered in the non-exposure register below, because it was FALSE by
// the time it was read rather than merely debatable.
//
// THE FIVE READS, served on `GET` with a query string:
//
//   findProducts                  -> ProductService.findProducts
//                                    [model/service/ProductService.cfc:L342]
//   getFormattedOptionGroups      -> ProductService.getFormattedOptionGroups
//                                    [model/service/ProductService.cfc:L70]
//   getUnusedProductOptions       -> OptionService.getUnusedProductOptions
//                                    [model/service/OptionService.cfc:L72]
//   getUnusedProductOptionGroups  -> OptionService.getUnusedProductOptionGroups
//                                    [model/service/OptionService.cfc:L76]
//   getOptionsForSelect           -> OptionService.getOptionsForSelect
//                                    [model/service/OptionService.cfc:L55]
//
// THE NINE MUTATIONS, served on `POST` with a JSON body:
//
//   processProduct_addOptionGroup           -> [model/service/ProductService.cfc:L113]
//   processProduct_addOption                -> [model/service/ProductService.cfc:L128]
//   processProduct_updateSkus               -> [model/service/ProductService.cfc:L216]
//   processProduct_deleteDefaultImage       -> [model/service/ProductService.cfc:L198]
//   processProduct_updateDefaultImageFileNames -> [model/service/ProductService.cfc:L208]
//   saveProduct                             -> [model/service/ProductService.cfc:L264]
//   saveProductType                         -> [model/service/ProductService.cfc:L294]
//   deleteProduct                           -> [model/service/ProductService.cfc:L317]
//   saveBrand                               -> [model/service/BrandService.cfc:L67]
//
// `findProducts` is the already-allocated replacement for `getProductSmartList`
// [model/service/ProductService.cfc:L342-L358]; that rename belongs to the services tier and is
// consumed here. The framework's generic, string-keyed, dynamically-filtered smart list is NOT
// reopened: what a caller may send is the closed, typed `ProductQueryCriteria` shape, and anything
// else is refused rather than ignored.
//
// NO BUSINESS LOGIC LIVES HERE. No price or discount arithmetic, no `Money` value, no SQL, no entity
// CONSTRUCTION, no setting resolution, no option-combination building and no URL-title generation. It
// constructs no service, no repository, no port and no connection pool either - `./bootstrap.js` is
// the only composition root in this subtree. Entity HYDRATION is likewise not done here: an
// identifier is handed to a request-scope loader, which is a repositories-tier act performed behind
// that boundary.
//
// ---------------------------------------------------------------------------
// HOW AN OPERATION IS NAMED, AND WHY THERE IS ONLY ONE PLACE TO NAME IT
//
// JUDGMENT CALL: the operation travels in the `operation` QUERY-STRING PARAMETER for all fourteen,
// including the nine that carry a JSON body. The obvious alternative - discriminating the body on an
// `operation` member, as `./priceResolutionHandler.js` does - was rejected for one specific reason:
// this capability already had a query-string selector, bounded at one per invocation and refused
// rather than truncated, so adding a second selector location would give a caller TWO places to name
// an operation and this file a disagreement to resolve. One location keeps the bound meaningful.
//
// The consequence is that the body carries the PAYLOAD only. A mutation body is a `z.strictObject`
// with no `operation` member, so a body that tries to name one is refused as an unrecognized member.
//
// EACH OPERATION IS SERVED ON EXACTLY ONE METHOD, and the pairing is checked here rather than by the
// router. `./router.js` matches a route on a comma list of methods, so it can admit `GET,POST` for
// this path but cannot know that `saveProduct` is a `POST` and `findProducts` is a `GET` - the
// operation is not part of the path. A wrong pairing is a 400 carrying a fixed sentence, NOT a 405:
// the router records why this subtree emits no 405 anywhere - FW/1 dispatched an action by any method,
// so there is no method-not-allowed concept in the source to port - and a 405 here would additionally
// confirm which operations exist.
//
// A WRITE IS NOT SERVED ON `GET`, and that is the whole reason the route now admits two methods. `GET`
// is defined as safe; an intermediary may retry or cache it, and a retried `GET` that repriced a
// catalogue would reprice it twice.
//
// ---------------------------------------------------------------------------
// THE TRANSPORT POLICY FOR A MUTATION: AN EXISTING ROW, NAMED BY IDENTIFIER
//
// JUDGMENT CALL, and it is a deliberate narrowing rather than an oversight. Every one of the nine
// mutations names an entity that ALREADY EXISTS, by identifier, and none of them creates a row. The
// services keep their full insert-capable contract for in-process callers - `Product.isNew()`,
// `ProductType.isNew()` and `Brand.isNew()` are untouched, and the repositories' insert paths still
// run - but a ROUTED creation protocol is not published, because deciding how a caller states a
// brand-new aggregate over HTTP is an entity-construction transport concern the AAP describes
// nowhere, and inventing one would be inventing a contract rather than porting one.
//
// So `saveProduct` UPDATES the product it names. A caller naming an identifier that matches no row is
// told so, and no row is minted on its behalf.
//
// ---------------------------------------------------------------------------
// AN IDENTIFIER THAT NAMES NOTHING IS A DOMAIN OUTCOME, NOT A TRANSPORT FAILURE
//
// A miss is answered as a SUCCESSFUL response carrying an `unresolved` outcome that names WHICH
// identifier failed. That is the posture `RequestEntityLoaders` documents for its loads - "a miss is
// `undefined`, never an empty entity and never a throw" - and the posture
// `./priceResolutionHandler.js` already publishes across five not-found tokens.
//
// A 404 WAS CONSIDERED AND REJECTED, on two concrete grounds rather than by preference. First,
// `./errorMapper.js`'s only 404 is `routeNotFoundResponse`, whose body category is `routeNotFound`;
// publishing it for a missing product would either state a category that is untrue or require widening
// a deliberately closed failure vocabulary. Second, the router already answers 404 for an unmatched
// path or method, so a caller receiving one could not tell "no such URL" from "no such product".
//
// ---------------------------------------------------------------------------
// A SAVE THAT FAILS A PORTED VALIDATION RULE IS A 400, AND THE SERVICE STILL RETURNS
//
// `saveProduct`, `saveProductType` and `saveBrand` do not throw for a failed save-context rule: the
// legacy `HibachiService.save` [org/Hibachi/HibachiService.cfc:L151-L167] RETURNS THE SAME ENTITY
// whether it validated or not, leaving its errors on the entity, and the ported services reproduce
// that exactly - which is why `ProductValidationError` and its sibling were removed from the services
// tier. This adapter therefore READS `hasErrors()` and turns the register into a 400. Deciding a
// status from a returned value is transport work; the service's contract is untouched.
//
// WHAT REACHES THE RESPONSE BODY FROM THAT REGISTER IS SERVER-AUTHORED. `getErrors()` is keyed by
// PROPERTY IDENTIFIER - a name declared in `model/validation/*.json` and ported into the services -
// and its values are the rule messages, never the value that failed the rule. So a field issue built
// from it names a member of the schema and a constraint description, which is precisely what
// `MappedFieldIssue` requires and what its own invariant forbids widening.
//
// ---------------------------------------------------------------------------
// MUTATION SAFETY: WHERE THE BOUNDS ARE, AND WHY NONE OF THEM IS HERE
//
// AAP 0.6.5 requires bulk mutation paths to carry explicit batch limits, retry semantics and a
// compensation story. All three exist, and NOT ONE of them is invented in this file:
//
//   * THE BATCH BOUNDS ARE THE SERVICES' OWN, supplied by the composition root.
//     `ProductService` refuses a repricing run above `maximumSkuUpdateBatchSize` and `SkuService`
//     refuses a creation run above `maximumSkuCreationBatchSize`, both defaulting to 1000. A second
//     bound here would refuse work the service has already proved it can carry atomically, and would
//     put the same decision in two places.
//   * COMPENSATION IS THE REPOSITORY'S TRANSACTION. A multi-statement aggregate write runs inside the
//     executor's transaction, so a failure part-way leaves no half-written aggregate and there is
//     nothing for this adapter to compensate.
//   * RETRY SEMANTICS ARE STATED PER OPERATION on {@link CATALOG_OPERATION_TRANSPORT}, which is
//     the honest form: three of the nine are naturally idempotent, and the other six are not, and
//     saying so is more useful to a caller than a mechanism that pretends otherwise.
//
// AND THERE IS STILL NO IDEMPOTENCY LEDGER. Security and API review (finding F5, CWE-400 / cache
// confusion) withdrew one from this file, and the reasoning is recorded where it stood. The remedy
// review offered in its place was a durable record keyed by caller plus canonical request digest -
// which means a new durable store, and AAP 0.2.2 excludes infrastructure outright. Publishing nine
// mutations does not change that: it changes which operations are non-idempotent, which is why the
// retry semantics are DOCUMENTED rather than a ledger being reintroduced.
//
// ---------------------------------------------------------------------------
// SCOPE EXCLUSIONS, so that "this handler does not publish X" is auditable rather than inferred
//
// (1) OUT OF SCOPE BY AAP 0.9.5, though reachable from an in-scope file:
//     `processProduct_addProductReview` [model/service/ProductService.cfc:L157],
//     `processProduct_addSubscriptionTerm` [:L173], `processProduct_uploadDefaultImage` [:L235], the
//     subscription and content-access SKU branches [model/service/SkuService.cfc:L139-L202], and
//     `loadDataFromFile` [:L65-L68], whose legacy body opens by raising the CFML request timeout to
//     3600 seconds - a budget no Lambda invocation has, since the runtime's maximum invocation
//     duration is 15 minutes. No job queue, state machine or chunked-upload protocol is invented in
//     its place, because the source had none.
//
// (2) OWNED BY ANOTHER CAPABILITY: `getProductSkusBySelectedOptions`
//     [model/service/ProductService.cfc:L104] and its AND-of-EXISTS matching
//     [model/dao/SkuDAO.cfc:L107-L128] belong to `./skuResolutionHandler.js`.
//
// (3) ★★★ "UNREACHABLE AT THIS TIER" WAS THIS FILE'S THIRD CATEGORY, AND IT IS GONE BECAUSE IT WAS
//     NOT TRUE. Quoted in full, because it is the premise the CRITICAL finding overturned:
//
//       "Unreachable at this tier - `RequestScope` publishes no entity and no entity loader, so every
//        service member whose first parameter is an entity has no admissible argument here:
//        `getFormattedOptionGroups`, `processProduct_addOptionGroup`, `processProduct_addOption`,
//        `processProduct_deleteDefaultImage`, `processProduct_updateDefaultImageFileNames`,
//        `processProduct_updateSkus`, `saveProduct`, `saveProductType`, `deleteProduct`,
//        `getOptionsForSelect` and `saveBrand`. Constructing an entity is not a transport concern;
//        the repository owns hydration."
//
//     THE SECOND SENTENCE WAS AND REMAINS CORRECT, and nothing below violates it: this file still
//     constructs no entity. THE FIRST SENTENCE WAS TRUE WHEN WRITTEN AND FALSE WHEN READ.
//     `RequestScope.entityLoaders` was added for `./priceResolutionHandler.js` (finding F3) and
//     publishes read-only loads by identifier; the catalog claim was simply never revisited. Nine of
//     the eleven take a `Product` or a `ProductType`, which those loads already answered; the other
//     two needed a `Brand` and a set of `Option`s, which are now two further loads on the same
//     read-only member. So the correct conclusion from the correct premise is the opposite of the one
//     drawn: hydration IS the repository's, this file ASKS for it by identifier, and the eleven
//     methods are reachable without a single entity being constructed here.
//
//     ★★ AND `saveBrand` DESERVES ITS OWN SENTENCE, because the same passage concluded that this
//     capability publishes NO brand operation whatsoever. `saveBrand` at
//     [model/service/BrandService.cfc:L67] IS THE ONLY FUNCTION THE LEGACY COMPONENT DECLARES - every
//     brand read a caller might expect arrived by inheritance from the framework base, which is
//     deliberately not ported - so there is no brand QUERY method in existence to publish. That
//     remains exactly true. What did not follow is that the one method that DOES exist should be
//     unreachable: a capability with no brand read still has a brand write, and withholding it made
//     `src/services/brandService.ts` dead code behind an HTTP boundary.
//
// (4) NOT THIS SERVICE'S TO PUBLISH AT ALL. Nothing from `OrderService`, checkout, cart, payment,
//     shipping, fulfillment, account, subscription, vendor or tax is reachable from here; neither is
//     the Taffy REST layer under `frontend/api/`, the Mura CMS bridge, any integration adapter other
//     than Google, or any capability of `org/Hibachi/**` - 938 files that are a boundary to extract
//     FROM and never to modify.
//
// ---------------------------------------------------------------------------
// WHAT REACHES A RESPONSE BODY
//
// An entity is never serialized: the ported entities hold injected collaborators, so handing one to
// `JSON.stringify` would walk from a product into a repository. Every response is an explicit
// projection over published accessors, and the product projection publishes exactly the two columns
// the executed search statement selects, `productID` and `productName`
// [model/dao/ProductDAO.cfc:L421]. The three SAVE projections additionally publish the resolved
// `urlTitle`, because the service GENERATES it when the payload omits one
// [model/service/ProductService.cfc:L269] and a caller cannot otherwise learn the slug its own row was
// given - a server-computed value, not an echo.
//
// Absence survives as absence - an absent value is represented by the member being OMITTED, never by
// `0`, `''` or `null`, the same discipline that keeps `getPriceByCurrencyCode`
// [model/entity/Sku.cfc:L269-L273] from silently selling products for free.
//
// `./errorMapper.js` owns the closed failure vocabulary. This ADMINISTRATIVE route reaches 400 for
// unusable input, 401 for an unidentified caller, 403 for an identified caller carrying no
// administrative claim, 404 for an unmatched route and 500 for a server-shaped failure. It invents no
// conflict, semantic-validation or request-quota status and no retry-after, rate-limit, challenge or
// circuit-breaker header.
//
// ★ THE 403 USED TO BE DENIED HERE. This paragraph read "It has no administrative operation and
// therefore emits no 403", which stopped being true when finding F45 (CWE-862) established that none
// of this capability's operations has a non-administrative legacy antecedent and the admission gate
// grew its second step. The gate has emitted 403 ever since; only the sentence lagged. Every one of
// the nine mutations reinforces the same conclusion - `saveProduct`, `deleteProduct` and `saveBrand`
// are administrative by any reading - so the gate is unchanged by their arrival and the claim is now
// stated the way the code behaves.
//
// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/service/ProductService.cfc:L220]: the repricing loop declares its counter as
// `for(i=1; i <= arrayLen(skus); i++)` with no `var`, so it leaks into the component variables scope.
// Preserved deliberately; do not fix without a product decision.
//
// The leak belongs to `src/services/productService.ts`, where block scoping already makes it
// unreproducible, and nothing in this file attempts to repair it.
//
// LEGACY-DEFECT [model/service/ProductService.cfc:L119]: `processProduct_addOptionGroup` gives every
// existing SKU `options[1]` - the first option of the newly added group - rather than an option matched
// to that SKU. Preserved deliberately; do not fix without a product decision.
//
// It is reproduced in `src/services/productService.ts` and is now REACHABLE through this route, which
// is the point of recording it here: publishing the operation publishes the defect with it, and that
// is the behaviour-preservation contract rather than a regression.
//
// The `cfthread`-to-`worker_threads` translation rule is UNEXERCISED - a sweep of the in-scope slice
// finds zero `cfthread` usages - and the legacy runtime's three lock timeouts are noted in the plan
// and deliberately not implemented.
// ---------------------------------------------------------------------------

// IMPORT DISCIPLINE. Explicit relative specifiers carrying the `.js` extension NodeNext resolution
// requires, named imports only, and `import type` for every type-only import so that nothing
// type-only survives into the bundle. There is no barrel and no `index.ts` anywhere in this subtree,
// so each symbol is taken from the module that declares it. The four internal modules below are the
// whole of this file's internal dependency surface: its three siblings in this folder plus the
// structured logger, with two SERVICE modules imported for their published TYPES alone - the
// instances themselves arrive on the request scope and are never constructed here.
//
// `@types/aws-lambda` supplies the event, result, context and handler types; `zod` validates request
// input and is the same library that carries the ported declarative rules from `model/validation/`.
// Nothing else is imported: no dependency-injection container, no HTTP client, no logging library,
// no XML parser, no AWS SDK and no routing library.
//
// THE BUNDLE FORMAT IS A SETTLED QUESTION AND IS NOT REVISITED HERE. `esbuild.config.mjs` emits
// CommonJS because bundling this dependency set to ESM builds cleanly and then fails at run time
// with `Dynamic require of "node:buffer" is not supported` through `mysql2/promise.js` ->
// `sql-escaper/lib/index.js`. The consequence for this file is concrete and observed: it uses neither
// the ESM import-metadata expression nor a top-level `await`, because neither exists in a CommonJS
// bundle. TypeScript source stays NodeNext; only the emitted bundle format differs.

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { z } from 'zod';

import { listFindNoCase, listToArray } from '../lib/cfml/list.js';
// The published CFML case-folding primitive. It is imported rather than re-derived because the option
// load answers a map keyed by a CASE-FOLDED identifier, and folding a lookup key with a second
// implementation of the same rule is precisely how two copies of one rule drift apart.
import { cfFoldKey } from '../lib/cfml/struct.js';
import type { Logger } from '../lib/logger.js';
import { logger as processLogger } from '../lib/logger.js';
import type { OptionService } from '../services/optionService.js';
import type { ProductPage, ProductQueryCriteria } from '../services/productService.js';
import type { CompositionRoot, RequestScope } from './bootstrap.js';
import { bootstrapCompositionRoot } from './bootstrap.js';
import {
  MAX_PLACEHOLDER_COUNT,
  isPreparablePlaceholderCount,
} from '../repositories/mysql/connection.js';
import type { ErrorMappingContext, InvalidRequestReason, MappedFieldIssue } from './errorMapper.js';
import {
  PROTOTYPE_MEMBER_FIELD_ISSUE,
  containsPrototypeMemberKey,
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  resolveServerRequestId,
  routeDiagnosticLabel,
  forbiddenResponse,
  resolveRequestPrincipal,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from './errorMapper.js';
import type { RouteAction, RoutedCapability } from './router.js';
import { resolveRouteForCapability, routeRequestFromEvent } from './router.js';

// ---------------------------------------------------------------------------
// The capability this entrypoint owns, and the one action it implements
// ---------------------------------------------------------------------------

/**
 * The capability this handler answers for, and no other.
 *
 * Handed to `resolveRouteForCapability` so that a request whose path belongs to one of the other
 * four capabilities is reported exactly as an unmatched route. Reading the shared table is what
 * keeps five independently deployable bundles on one agreed URL surface; checking the capability is
 * what stops them answering for each other.
 */
const OWNED_CAPABILITY: RoutedCapability = 'catalogQuery';

/**
 * The route action this handler implements.
 *
 * `./router.js` owns RESOLUTION and this file owns INVOCATION, so the action arrives as DATA on the
 * matched descriptor and is checked here before anything is invoked. The check cannot fail while the
 * shared table assigns `queryCatalog` to `catalogQuery`, and it is written out anyway for the reason
 * `./router.js` gives for handling its own impossible `undefined` arm: this file does not own that
 * table, non-null assertions are banned throughout `src/**`, and an impossible case that is handled
 * stays visible instead of being asserted away. If the table ever assigned a different action to
 * this capability, refusing is correct and guessing is not.
 */
const IMPLEMENTED_ACTION: RouteAction = 'queryCatalog';

// ---------------------------------------------------------------------------
// The entity and payload types this file names, ALL DERIVED FROM THE REQUEST SCOPE
//
// ★★★ NOT ONE OF THEM IS IMPORTED FROM `src/domain/entities/**` OR RESTATED HERE, and that is the same
// discipline the product projection below already follows. Two reasons, and both are about drift rather
// than tidiness. A restated payload shape keeps compiling when the service's own input type gains or
// loses a member, so a schema built against it would silently stop matching; and importing the entity
// modules would add four internal dependencies to a file whose whole job is to forward, without
// gaining anything a derived alias does not already give.
//
// Every alias below therefore reads THROUGH `RequestScope`, which is the one boundary this file is
// entitled to depend on. A service signature change is consequently a compile error in this file, which
// is exactly where it should surface.
// ---------------------------------------------------------------------------

/** The seven read-only entity loads, as the scope publishes them. */
type CatalogEntityLoaders = RequestScope['entityLoaders'];

/** A product, as the loader answers one. `NonNullable` because a miss is handled separately. */
type CatalogProduct = NonNullable<
  Awaited<ReturnType<CatalogEntityLoaders['getProductByProductID']>>
>;

/** A product type, on the same terms. */
type CatalogProductType = NonNullable<
  Awaited<ReturnType<CatalogEntityLoaders['getProductTypeByProductTypeID']>>
>;

/** A brand, on the same terms. */
type CatalogBrand = NonNullable<Awaited<ReturnType<CatalogEntityLoaders['getBrandByBrandID']>>>;

/**
 * An option, inferred out of the map the option load answers.
 *
 * The load publishes `ReadonlyMap<string, Option>` rather than an array - see the loader for why a map
 * is what lets a caller tell WHICH identifier missed - so the element type is recovered with `infer`
 * rather than indexed.
 */
type CatalogOption =
  Awaited<ReturnType<CatalogEntityLoaders['getOptionsByOptionIDList']>> extends ReadonlyMap<
    string,
    infer TOption
  >
    ? TOption
    : never;

/** The `ProductService` surface the scope publishes, whole. */
type CatalogProductService = RequestScope['productService'];

/** The `BrandService` surface the scope publishes: one method. */
type CatalogBrandService = RequestScope['brandService'];

/** [model/process/Product_AddOptionGroup.cfc:L49-L57], as the service declares it. */
type AddOptionGroupPayload = Parameters<CatalogProductService['processProduct_addOptionGroup']>[1];

/** [model/process/Product_AddOption.cfc:L49-L57], as the service declares it. */
type AddOptionPayload = Parameters<CatalogProductService['processProduct_addOption']>[1];

/** [model/process/Product_UpdateSkus.cfc:L49-L60], as the service declares it. */
type UpdateSkusPayload = Parameters<CatalogProductService['processProduct_updateSkus']>[1];

/** The `required struct data` of [model/service/ProductService.cfc:L198]. */
type DeleteDefaultImagePayload = Parameters<
  CatalogProductService['processProduct_deleteDefaultImage']
>[1];

/** The save payload of [model/service/ProductService.cfc:L264]. */
type SaveProductPayload = Parameters<CatalogProductService['saveProduct']>[1];

/** The save payload of [model/service/ProductService.cfc:L294]. */
type SaveProductTypePayload = Parameters<CatalogProductService['saveProductType']>[1];

/** The save payload of [model/service/BrandService.cfc:L67]. */
type SaveBrandPayload = Parameters<CatalogBrandService['saveBrand']>[1];

// ---------------------------------------------------------------------------
// The published operation vocabulary
// ---------------------------------------------------------------------------

/**
 * The operations this capability publishes, named VERBATIM after the ported service methods they
 * invoke.
 *
 * A string-literal union rather than the TypeScript enumeration construct, so nothing survives into
 * the bundle as a runtime object and each value stays directly comparable against a decoded log line
 * without an import. The union is what makes "exactly these fourteen, and no fifteenth" a compile-time
 * property: {@link CATALOG_QUERY_OPERATIONS} is typed by it, and the dispatch below is an exhaustive
 * switch over it, so adding a member without publishing and dispatching it is a compile error.
 *
 * The names are not TypeScript-idiomatic and are not meant to be. Interface parity is the acceptance
 * contract, so `getUnusedProductOptionGroups` is spelled exactly as
 * [model/service/OptionService.cfc:L76] spells it, and `findProducts` is spelled exactly as the
 * services tier publishes the allocated smart-list replacement.
 */
export type CatalogQueryOperation =
  // The five reads, served on `GET`.
  | 'findProducts'
  | 'getFormattedOptionGroups'
  | 'getUnusedProductOptions'
  | 'getUnusedProductOptionGroups'
  | 'getOptionsForSelect'
  // The nine mutations, served on `POST`.
  | 'processProduct_addOptionGroup'
  | 'processProduct_addOption'
  | 'processProduct_updateSkus'
  | 'processProduct_deleteDefaultImage'
  | 'processProduct_updateDefaultImageFileNames'
  | 'saveProduct'
  | 'saveProductType'
  | 'deleteProduct'
  | 'saveBrand';

/**
 * The published operations as data, in the order they are documented.
 *
 * Frozen because this module is instantiated once per container and shared across every invocation
 * it serves, and `readonly` is a compile-time claim only.
 */
const CATALOG_QUERY_OPERATIONS: readonly CatalogQueryOperation[] = Object.freeze([
  'findProducts',
  'getFormattedOptionGroups',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
  'getOptionsForSelect',
  'processProduct_addOptionGroup',
  'processProduct_addOption',
  'processProduct_updateSkus',
  'processProduct_deleteDefaultImage',
  'processProduct_updateDefaultImageFileNames',
  'saveProduct',
  'saveProductType',
  'deleteProduct',
  'saveBrand',
]);

/**
 * THE TRANSPORT FACTS ABOUT EACH OPERATION: the one method it answers on, and whether re-sending it
 * converges.
 *
 * ★★★ ONE TABLE RATHER THAN TWO, so a row cannot exist in one and not the other. Both facts are
 * per-operation, both are consumed at the transport boundary, and keeping them together is what makes
 * "every operation declares both" a compile-time property: the record is keyed by the operation union,
 * so adding an operation without stating its method AND its retry behaviour does not compile.
 *
 * ---------------------------------------------------------------------------
 * `method` - THE ROUTE ADMITS TWO AND AN OPERATION ANSWERS TO ONE
 *
 * `./router.js` matches a route on a comma list, so it can admit `GET,POST` for this path - but the
 * operation is not part of the path, so the router cannot know that `saveProduct` is a write and
 * `findProducts` is not. This is where that is known, and the check it drives is what stops a write
 * being served on a method HTTP defines as safe: a `GET` may be retried or cached by any intermediary,
 * and a retried `GET` that repriced a catalogue would reprice it twice.
 *
 * THERE IS DELIBERATELY NO DEFAULT. `'POST'` as a fallback would make a new read writable and `'GET'`
 * as a fallback would make a new write retryable, so each row states its own.
 *
 * ★ THE SPLIT IS THE SERVICES', NOT A CHOICE. Every operation whose ported body performs no durable
 * write is a `GET`; every operation that reaches `saveSku`, `saveProduct`, `saveProductType`,
 * `saveBrand` or `deleteProduct` is a `POST`. `getFormattedOptionGroups` and `getOptionsForSelect` are
 * on the read side because both are SYNCHRONOUS pure transformations in the services tier
 * [model/service/ProductService.cfc:L70], [model/service/OptionService.cfc:L55] - once their arguments
 * are bound they reach nothing at all.
 *
 * ---------------------------------------------------------------------------
 * `resendable` - DOCUMENTATION, NOT A MECHANISM, AND THAT IS THE HONEST FORM
 *
 * AAP 0.6.5 requires bulk mutation paths to state their retry semantics; it does not require a replay
 * ledger, and finding F5 withdrew one from this file because it was keyed on a raw caller header and
 * answered the wrong question. The remedy offered in its place - a durable record keyed by caller plus
 * canonical request digest - means a new durable store, and AAP 0.2.2 excludes infrastructure outright.
 *
 * So this member says which operations a caller may safely re-send and which it may not, which is
 * information a caller can act on. A mechanism that claimed to make the six unsafe ones safe would be
 * claiming more than a per-container map can deliver.
 *
 * `true` means the operation CONVERGES: re-running it with the same input reaches the same end state.
 * `false` means it ACCUMULATES or answers differently the second time, and the reason is recorded
 * beside it.
 */
export const CATALOG_OPERATION_TRANSPORT: Readonly<
  Record<CatalogQueryOperation, { readonly method: 'GET' | 'POST'; readonly resendable: boolean }>
> = Object.freeze({
  // --- The five reads. They write nothing at all, so re-running one is not merely safe but strictly
  // more correct than replaying a recorded body.
  findProducts: { method: 'GET', resendable: true },
  getFormattedOptionGroups: { method: 'GET', resendable: true },
  getUnusedProductOptions: { method: 'GET', resendable: true },
  getUnusedProductOptionGroups: { method: 'GET', resendable: true },
  getOptionsForSelect: { method: 'GET', resendable: true },

  // ACCUMULATES. `processProduct_addOptionGroup` appends the group's first option to every existing
  // SKU [model/service/ProductService.cfc:L119] and `processProduct_addOption` extends the option list
  // and rebuilds SKUs from it [L145], so a second run adds a second time.
  processProduct_addOptionGroup: { method: 'POST', resendable: false },
  processProduct_addOption: { method: 'POST', resendable: false },

  // CONVERGES. It ASSIGNS the supplied price to every SKU rather than adjusting by it
  // [model/service/ProductService.cfc:L222-L227], so a second run with the same payload writes the
  // same values.
  processProduct_updateSkus: { method: 'POST', resendable: true },

  // DOES NOT CONVERGE IN THE SENSE THAT MATTERS: the first run removes the named image and the second
  // finds nothing to remove, so the two runs do not answer identically even where the end state is the
  // same. Reported as non-resendable so a caller does not read a second response as confirmation.
  processProduct_deleteDefaultImage: { method: 'POST', resendable: false },

  // CONVERGES. It recomputes each SKU's default image file name from the SKU's own options
  // [model/service/ProductService.cfc:L208-L214], which is a pure function of state already stored.
  processProduct_updateDefaultImageFileNames: { method: 'POST', resendable: true },

  // ACCUMULATES. Both saves GENERATE a unique URL title when the payload omits one
  // [model/service/ProductService.cfc:L269], [L297], and the generator appends a discriminator to
  // avoid collision - so a re-send can produce a DIFFERENT slug from the first.
  saveProduct: { method: 'POST', resendable: false },
  saveProductType: { method: 'POST', resendable: false },

  // Same asymmetry as the image deletion: the second run answers `false` where the first answered
  // `true`, because the row is gone.
  deleteProduct: { method: 'POST', resendable: false },

  // ACCUMULATES. Same URL-title generation as the two product saves
  // [model/service/BrandService.cfc:L70, L72].
  saveBrand: { method: 'POST', resendable: false },
});

/**
 * The query-string parameter that names the operation.
 *
 * JUDGMENT CALL: the operation travels as a query-string parameter and is REQUIRED, with no default.
 * The shared route table gives this capability exactly one route, deliberately - it records that
 * enumerating a sub-surface there would invent a URL vocabulary this migration was never asked to
 * design - so something in the request has to say which of the FOURTEEN ported methods a caller wants,
 * and the legacy slice has no HTTP vocabulary to copy. Requiring the parameter rather than defaulting
 * it is the choice that invents least: a default would silently answer a different question than the
 * one asked, and `./errorMapper.js` already publishes `missingQueryParameter` as the reason for
 * exactly this refusal.
 *
 * ★★ AND IT IS THE SELECTOR FOR THE NINE MUTATIONS TOO, WHICH CARRY A BODY. The obvious alternative -
 * discriminating the body on an `operation` member, as `./priceResolutionHandler.js` does - was
 * rejected because this capability already had this selector, bounded at one per invocation and refused
 * rather than truncated: a second selector location would give a caller TWO places to name an operation
 * and this file a disagreement to resolve, which is exactly what the bound exists to prevent. The
 * mutation schemas are consequently strict objects with NO `operation` member, so a body that tries to
 * name one is refused as an unrecognized member.
 */
const OPERATION_PARAMETER = 'operation';

// ---------------------------------------------------------------------------
// Response projections
//
// Each shape below is a PROJECTION built from published accessors, never a serialized entity. See the
// module header for why an entity must never reach `JSON.stringify`.
// ---------------------------------------------------------------------------

/**
 * One matched product, reduced to the two columns the executed statement selects.
 *
 * `productID` is always present: the ported entity answers it as a definite `string`, empty for an
 * unsaved product. `productName` is OPTIONAL because the column is nullable and the accessor answers
 * `string | undefined`; an absent name is published by OMITTING the member, which is what keeps
 * absence distinguishable from an empty name. Nothing else is published, because
 * [model/dao/ProductDAO.cfc:L421] selects `productID` and `productName` from `SwProduct` and joins
 * nothing - publishing a brand or a product-type member would tell a caller that a value was
 * selected when it was not.
 */
export interface CatalogProductProjection {
  /** [model/entity/Product.cfc:L52] via `Product.getProductID()`. */
  readonly productID: string;

  /** [model/entity/Product.cfc:L55] via `Product.getProductName()`. Omitted when absent. */
  readonly productName?: string;
}

/**
 * The projection of one `ProductPage`.
 *
 * The paging members and the query contract are carried through exactly as the service published
 * them. `joins` and `keywordProperties` are plain data the service deliberately publishes ON THE
 * RESULT - a returned array cannot be inspected the way the framework's live smart-list object could,
 * so the shape of the statement that ran travels with the records - and their types are taken from
 * `ProductPage` itself so the two cannot drift.
 *
 * `pageRecordsShow` is OPTIONAL here where the service declares it `number | undefined`, because
 * `undefined` on that member means THE WHOLE RESULT SET and the JSON document says so by omitting it.
 * Publishing a `0` in its place would claim an empty window.
 */
export interface CatalogProductPageProjection {
  /** The matched products, in repository order. Never reordered here. */
  readonly records: readonly CatalogProductProjection[];

  /** How many products matched before the paging window was applied. */
  readonly recordsCount: number;

  /** The zero-based start index the service actually applied. */
  readonly pageRecordsStart: number;

  /** The window size actually applied. Omitted when the whole result set was returned. */
  readonly pageRecordsShow?: number;

  /** The entity the legacy smart list was built against [model/service/ProductService.cfc:L343]. */
  readonly entityName: ProductPage['entityName'];

  /** The related-property joins the executed statement performs. Empty, and published as such. */
  readonly joins: ProductPage['joins'];

  /** The properties the executed statement matches the keyword against. */
  readonly keywordProperties: ProductPage['keywordProperties'];
}

/**
 * One select row, exactly as the option port publishes it.
 *
 * Derived from the ported method's own return type rather than redeclared, so this file cannot drift
 * from the contract it forwards. The element type is `SelectOption` - a label and an identifier -
 * and it is deliberately NOT `Option` or `OptionGroup`: neither legacy DAO function hydrates an
 * entity, both build a two-key structure per row [model/dao/OptionDAO.cfc:L88, L113], and the
 * option-GROUP query publishes group rows under the same row shape.
 */
export type CatalogSelectOptionProjection = Awaited<
  ReturnType<OptionService['getUnusedProductOptions']>
>[number];

/**
 * What one served operation returns, discriminated by the operation that produced it.
 *
 * A union rather than a widened bag, so a caller - and the suite that asserts on it - can tell from
 * the `operation` member alone which payload shape `result` carries.
 */
export type CatalogQueryResult =
  | {
      readonly operation: 'findProducts';
      readonly result: CatalogProductPageProjection;
    }
  | {
      readonly operation:
        'getUnusedProductOptions' | 'getUnusedProductOptionGroups' | 'getOptionsForSelect';
      readonly result: readonly CatalogSelectOptionProjection[];
    }
  | {
      readonly operation: 'getFormattedOptionGroups';
      readonly result: readonly CatalogFormattedOptionGroupProjection[];
    }
  | {
      readonly operation:
        | 'processProduct_addOptionGroup'
        | 'processProduct_addOption'
        | 'processProduct_updateSkus'
        | 'processProduct_deleteDefaultImage'
        | 'processProduct_updateDefaultImageFileNames'
        | 'saveProduct';
      readonly result: CatalogSavedProductProjection;
    }
  | {
      readonly operation: 'saveProductType';
      readonly result: CatalogSavedProductTypeProjection;
    }
  | {
      readonly operation: 'saveBrand';
      readonly result: CatalogSavedBrandProjection;
    }
  | {
      readonly operation: 'deleteProduct';
      readonly result: CatalogDeletionProjection;
    }
  | {
      readonly operation: CatalogQueryOperation;
      readonly unresolved: CatalogUnresolvedReason;
    }
  | {
      /**
       * A ported SAVE-CONTEXT RULE refused the payload, and these are the properties it named.
       *
       * ★★ A THIRD KIND RATHER THAN A STATUS DECIDED INSIDE THE DISPATCH. Only the three saves can
       * produce it, only they read an entity error register, and keeping the decision here means
       * {@link invokeCatalogOperation} stays one service call plus at most one register read per arm and
       * makes no status choice of its own. {@link servedOrRefused} turns this arm into the 400.
       */
      readonly operation: 'saveProduct' | 'saveProductType' | 'saveBrand';
      readonly refusedRules: readonly MappedFieldIssue[];
    };

/**
 * One formatted option group, exactly as `ProductService.getFormattedOptionGroups` publishes it.
 *
 * Derived from the service's own return type rather than redeclared, on the same terms
 * {@link CatalogSelectOptionProjection} is: a restated shape is a shape that can drift, and
 * `FormattedOptionGroup` already documents why an absent group name keys the EMPTY STRING rather than
 * being omitted - a CFML struct key is always a string, and the value is a name rather than a price so
 * no monetary hazard attaches to the substitution.
 */
export type CatalogFormattedOptionGroupProjection = ReturnType<
  CatalogProductService['getFormattedOptionGroups']
>[number];

/**
 * A product after a mutation, reduced to the identifier, the name and the resolved URL title.
 *
 * ★★ THE THIRD MEMBER IS THE ONE THIS SURFACE ADDS BEYOND THE READ PROJECTION, AND IT IS ADDED FOR A
 * REASON RATHER THAN FOR COMPLETENESS. `saveProduct` GENERATES a unique URL title when the payload
 * omits one [model/service/ProductService.cfc:L269], appending a discriminator to avoid collision, so
 * the slug the row actually received is a value only the server knows. Omitting it would leave a caller
 * unable to address its own product. It is a server-COMPUTED value, not an echo of submitted input.
 *
 * NOTHING ELSE IS PUBLISHED. No SKU list, no option list, no brand, no product type and no timestamp:
 * the mutation's contract is that it happened, and a caller wanting the product's current state asks
 * for it. Each optional member is OMITTED when absent rather than nulled, which is the whole of how
 * absence is represented on this surface.
 */
export interface CatalogSavedProductProjection {
  /** [model/entity/Product.cfc:L52] via `Product.getProductID()`. */
  readonly productID: string;

  /** [model/entity/Product.cfc:L55] via `Product.getProductName()`. Omitted when absent. */
  readonly productName?: string;

  /** [model/entity/Product.cfc:L54] via `Product.getUrlTitle()`. Omitted when absent. */
  readonly urlTitle?: string;
}

/** A product type after `saveProductType`, on the same three-member terms. */
export interface CatalogSavedProductTypeProjection {
  /** [model/entity/ProductType.cfc:L52] via `ProductType.getProductTypeID()`. */
  readonly productTypeID: string;

  /** [model/entity/ProductType.cfc:L57] via `ProductType.getProductTypeName()`. Omitted when absent. */
  readonly productTypeName?: string;

  /** [model/entity/ProductType.cfc:L56] via `ProductType.getUrlTitle()`. Omitted when absent. */
  readonly urlTitle?: string;
}

/** A brand after `saveBrand`, on the same three-member terms. */
export interface CatalogSavedBrandProjection {
  /** [model/entity/Brand.cfc:L52] via `Brand.getBrandID()`. */
  readonly brandID: string;

  /** [model/entity/Brand.cfc:L56] via `Brand.getBrandName()`. Omitted when absent. */
  readonly brandName?: string;

  /** [model/entity/Brand.cfc:L55] via `Brand.getUrlTitle()`. Omitted when absent. */
  readonly urlTitle?: string;
}

/**
 * What `deleteProduct` answered.
 *
 * ★ A `false` HERE IS A SUCCESSFUL RESPONSE, AND THAT IS THE PORTED CONTRACT RATHER THAN A LENIENCY.
 * `ProductService.deleteProduct` answers `false` when the enforceable delete-context rule refuses -
 * a product with transactions may not be deleted - and it does NOT throw, "because a delete blocked by
 * validation was never an exception in the legacy". Publishing that as a 200 carrying `deleted: false`
 * reports the outcome the service reported; mapping it to a 4xx would invent a status for a value.
 */
export interface CatalogDeletionProjection {
  /** Whether the row was removed. `false` means a delete-context rule refused it. */
  readonly deleted: boolean;
}

/**
 * An identifier the request named matches no row.
 *
 * ★★★ FOUR TOKENS, ONE PER ENTITY THIS ADAPTER BINDS, AND A MISS IS A SUCCESSFUL RESPONSE. The
 * reasoning is the module header's and is the same reasoning `./priceResolutionHandler.js` records
 * across its own five tokens: `RequestEntityLoaders` answers a miss with `undefined` rather than a
 * throw, an identifier either names a row or it does not, and "it does not" is a domain outcome a
 * caller is told about rather than an exception. A 404 was considered and rejected on two concrete
 * grounds - `./errorMapper.js`'s only 404 carries the category `routeNotFound`, and the router already
 * answers 404 for an unmatched path.
 *
 * ★★ THERE IS NO `optionGroupNotFound` AND NO `optionNotFound` FOR THE TWO ADD OPERATIONS, and the
 * absence is deliberate. `processProduct_addOptionGroup` and `processProduct_addOption` load their own
 * option group and option INSIDE the service, at [model/service/ProductService.cfc:L115] and [L130],
 * where the legacy chains straight through the loader WITH NO NULL CHECK - so an identifier naming
 * nothing raises there, at the same point the legacy fails. Pre-checking it here would turn a preserved
 * raise into a refusal and move the failure to a different tier, which is a behaviour change dressed as
 * a courtesy. `optionNotFound` below is for `getOptionsForSelect` alone, where THIS adapter does the
 * loading.
 */
export type CatalogUnresolvedReason =
  'productNotFound' | 'productTypeNotFound' | 'brandNotFound' | 'optionNotFound';

/**
 * The payload this capability places in the shared success envelope's `result` member.
 *
 * ★★ THE ENVELOPE ITSELF IS NO LONGER DECLARED HERE, AND THAT IS FINDING F13's FIX. This file used
 * to export a `CatalogQueryResponseBody` of `{operation, requestId, result}`, on the reasoning that
 * "matching the failure envelope means a caller parses one document shape instead of two". The
 * reasoning was right and the execution was local: API review found all four JSON entrypoints had
 * each derived their OWN envelope, two of them without a correlation identifier at all, so a caller
 * parsed four shapes rather than one. The envelope is now `SuccessResponseBody` in
 * `./errorMapper.js` - `{requestId, capability, action, result}` - built by `jsonSuccessResponse`,
 * which also owns the header set. `operation` travels INSIDE this payload, because it is a
 * capability-specific selector rather than part of the cross-handler contract.
 */
export type CatalogQueryResultDocument =
  | {
      /** The operation that produced `result`. */
      readonly operation: CatalogQueryOperation;

      /** The projected payload. */
      readonly result: CatalogServedPayload;
    }
  | {
      /** The operation that could not be bound. */
      readonly operation: CatalogQueryOperation;

      /**
       * Which identifier the request named that matches no row.
       *
       * ★ A SECOND ARM RATHER THAN AN OPTIONAL MEMBER ON THE FIRST, so `result` and `unresolved` are
       * mutually exclusive by construction. A single arm carrying both as optional would let a document
       * be built with neither, or with both, and a consumer would have to test for a state this
       * capability never produces.
       */
      readonly unresolved: CatalogUnresolvedReason;
    };

/**
 * Every payload shape a served catalog operation can place in `result`.
 *
 * A UNION OF THE PROJECTIONS RATHER THAN A WIDENED BAG, and each member is the projection its own
 * operation produces. Enumerated rather than derived from {@link CatalogQueryResult} because that type
 * is discriminated by operation, which is what a CONSUMER wants; this alias is what the DOCUMENT
 * carries, where the discriminator is the sibling `operation` member.
 */
export type CatalogServedPayload =
  | CatalogProductPageProjection
  | readonly CatalogSelectOptionProjection[]
  | readonly CatalogFormattedOptionGroupProjection[]
  | CatalogSavedProductProjection
  | CatalogSavedProductTypeProjection
  | CatalogSavedBrandProjection
  | CatalogDeletionProjection;

// ---------------------------------------------------------------------------
// Response construction
// ---------------------------------------------------------------------------

// ★ THE LOCAL HEADER SET AND SUCCESS STATUS THAT USED TO SIT HERE ARE GONE. Both were duplicates
// of `./errorMapper.js`'s, which is now the single construction path for a successful response as
// well as a failed one (finding F13). Duplicating them was how the four JSON entrypoints came to
// disagree about what a success looks like.

// ---------------------------------------------------------------------------
// The bound on the work one invocation may request
// ---------------------------------------------------------------------------

/**
 * How many operations one invocation may name.
 *
 * ONE. A request carrying the operation parameter twice is REFUSED, not truncated to the first and
 * not answered twice, so a caller cannot ask one invocation to answer for several. The bounds that
 * govern the ported services' own loops stay where they belong - on the two service constructors,
 * supplied by the composition root - and no parameter this file forwards can raise either.
 *
 * JUDGMENT CALL: the count is a target-chosen SAFETY bound. It is not a target, not a quota, not a
 * rate and not a capacity figure, and it carries no time dimension of any kind.
 */
const MAXIMUM_OPERATIONS_PER_INVOCATION = 1;

// ---------------------------------------------------------------------------
// Duplicate-request replay
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ★★★ THE IDEMPOTENCY LEDGER THAT USED TO SIT HERE IS GONE, AND ITS ABSENCE IS THE FIX.
//
// This block declared an `idempotency-key` header, a 256-character key bound, a 256-entry
// per-container ledger of completed responses, `throughIdempotencyLedger` and
// `evictOldestRecordedOutcomes`. Security and API review (finding F5, CWE-400 / cache
// confusion) established three defects in it, and they share one cause:
//
//   THE LEDGER WAS KEYED ON THE RAW CALLER KEY AND NOTHING ELSE - no operation, no
//   parameters, no caller identity, no request digest. So a caller reusing one key for a
//   DIFFERENT action received the FIRST action's body, complete with the first request's
//   correlation identifier, and had no way to tell. That is not idempotency; it is a cache
//   answering the wrong question, and the 256-entry bound was a COUNT bound that retained
//   256 COMPLETE RESPONSE BODIES.
//
// ★★ AND THE SECOND HALF OF THAT ARGUMENT NO LONGER HOLDS, WHICH IS ITSELF A REVIEW FINDING. Quoted,
// because the conclusion is unchanged and the reasoning behind it is not:
//
//   "AND THE MECHANISM WAS NEVER NEEDED ON THIS ENDPOINT. The route is `GET /catalog/products` and all
//    three operations it publishes are READS - `findProducts`, `getUnusedProductOptions`,
//    `getUnusedProductOptionGroups`. A read performs no durable write, so re-running it cannot
//    double-write anything [...] AAP 0.6.5's idempotency obligation is stated for BULK MUTATION paths,
//    and this capability exposes none - the non-exposure record above lists the mutating product
//    operations it deliberately does not publish."
//
// THE READS ARE STILL IDEMPOTENT BY CONSTRUCTION, and there are five of them now. But this capability
// DOES expose bulk mutation paths: a later code review recorded (CRITICAL) that withholding eleven
// mapped Product/Brand/Option actions left catalog persistence unreachable from Lambda, and nine of
// those eleven are writes - two of which rebuild a product's SKUs. So the clause "this capability
// exposes none" is no longer true and the 0.6.5 obligation now genuinely applies.
//
// ★★★ IT IS MET WITHOUT REINTRODUCING THIS MECHANISM, AND THAT IS THE WHOLE POINT OF RE-EXAMINING IT
// RATHER THAN QUIETLY RESTORING IT. 0.6.5 asks for batch limits, retry semantics and a compensation
// story. All three exist elsewhere and none of them is a response ledger:
//
//   * THE BATCH LIMITS ARE THE SERVICES' OWN, supplied by the composition root - `ProductService`
//     refuses a repricing run above its `maximumSkuUpdateBatchSize` and `SkuService` refuses a creation
//     run above its `maximumSkuCreationBatchSize`. Both are transactional-integrity bounds on one unit
//     of work, both default to 1000, and duplicating either here would refuse work a service has
//     already proved it can carry atomically.
//   * COMPENSATION IS THE REPOSITORY'S TRANSACTION. A multi-statement aggregate write runs inside the
//     executor's transaction, so a failure part-way leaves no half-written aggregate and there is
//     nothing for this adapter to compensate.
//   * RETRY SEMANTICS ARE STATED PER OPERATION on {@link CATALOG_OPERATION_TRANSPORT}, as data rather
//     than as a mechanism - because that is the honest form. TWO of the nine mutations converge and
//     seven do not, and telling a caller which is which is more useful than a per-container map that
//     claims to make the seven safe.
//
// THE ALTERNATIVE WAS CONSIDERED AND REJECTED, AND IS REJECTED AGAIN ON THE SAME GROUND. Review offered
// a second remedy: a durable record keyed by caller plus canonical request digest, with key/digest
// mismatch refusal and TTL and byte bounds. That means a NEW DURABLE STORE, which AAP 0.2.2 excludes
// outright. Publishing nine mutations changes which operations are non-idempotent; it does not change
// what infrastructure this migration is permitted to add.
//
// WHAT REPLACES IT FOR A RETRY: the request runs again. Nothing is recorded, nothing is
// evicted, and every response carries THIS invocation's own correlation identifier.
//
// The request grammar and transport bounds above continue to constrain each invocation; none of
// them is presented as a substitute for the three obligations above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reading the request
//
// Every lookup into a header, query or path map yields `T | undefined` under
// `noUncheckedIndexedAccess`, and every one of them is handled explicitly below. There is no non-null
// assertion and no cast anywhere in this file.
// ---------------------------------------------------------------------------

// ★ THE HEADER READER THAT USED TO SIT HERE IS GONE WITH ITS ONE CONSUMER. It existed to read the
// `idempotency-key` header case-insensitively; finding F5 withdrew that mechanism, and this handler
// still reads no header of its own. Nothing in the fourteen published operations is carried on one:
// the selector is a query parameter, a read's criteria are query parameters, and a mutation's payload is
// the request body. `event.httpMethod` is read - which is a request LINE member rather than a header -
// and only to check the pairing the route table cannot check for itself.

/**
 * How many times the operation parameter was supplied.
 *
 * API Gateway reports a repeated query parameter on `multiValueQueryStringParameters`, and the
 * single-valued map keeps only one of them - so counting there is the only way to notice a caller
 * asking for two operations at once. An event built without the multi-value map is handled by falling
 * back to the single-valued one, which can only ever report zero or one.
 */
function countSuppliedOperations(event: APIGatewayProxyEvent): number {
  const repeated = event.multiValueQueryStringParameters;
  if (repeated !== null) {
    const values = repeated[OPERATION_PARAMETER];
    if (values !== undefined) {
      return values.length;
    }
  }

  const single = event.queryStringParameters;
  if (single !== null && single[OPERATION_PARAMETER] !== undefined) {
    return 1;
  }

  return 0;
}

/**
 * The supplied query parameters, minus the operation selector.
 *
 * The selector is removed because it names the operation rather than being an input to it, and each
 * operation's parameter set is closed - see {@link hasClosedParameterSet}. A key present with no
 * value at all is dropped rather than admitted as `undefined`: the schemas below distinguish "absent"
 * from "present and empty", and an undefined value is the former.
 */
function readOperationParameters(event: APIGatewayProxyEvent): Record<string, string> {
  const supplied = event.queryStringParameters;
  const parameters: Record<string, string> = {};

  if (supplied === null) {
    return parameters;
  }

  for (const [name, value] of Object.entries(supplied)) {
    if (name === OPERATION_PARAMETER || value === undefined) {
      continue;
    }
    defineOwnParameter(parameters, name, value);
  }

  return parameters;
}

/**
 * Define one query parameter as an enumerable own property.
 *
 * Assignment is not equivalent for the reserved name `__proto__`: on an ordinary object it reaches
 * the inherited setter instead of creating a key, which would let that caller-authored name disappear
 * before the closed-parameter check. Defining the property explicitly keeps every supplied name visible
 * to `Object.keys` and therefore subject to the same refusal.
 */
function defineOwnParameter(target: Record<string, string>, name: string, value: string): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/**
 * Recognize the operation a caller named, exactly.
 *
 * JUDGMENT CALL: the comparison is CASE-SENSITIVE, unlike the path matching in `./router.js`, and the
 * difference is deliberate. That module folds case because it is reproducing two CFML comparisons that
 * fold case [Application.cfc:L130, L133]. This token has no legacy antecedent at all: it is a
 * published name whose whole purpose is that it is the ported method's name character for character,
 * which is what makes the interface-parity diff mechanical. Admitting `FINDPRODUCTS` would loosen the
 * one thing the token exists to pin.
 */
function recognizeOperation(candidate: string): CatalogQueryOperation | undefined {
  for (const operation of CATALOG_QUERY_OPERATIONS) {
    if (operation === candidate) {
      return operation;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Request validation
//
// ★ WHAT THESE SCHEMAS ARE, AND WHAT THEY ARE EMPHATICALLY NOT.
//
// They validate the WIRE FORM of a query string - every value in one is a string, so an integer
// parameter has to be recognized as a numeral and converted before a service that declares `number`
// can be handed it. That is a transport concern and it lives here.
//
// They restate NO business rule, and one case makes the distinction concrete. The declarative rules
// of [model/validation/Product_UpdateSkus.json] - the conditions `showPrice{updatePriceFlag eq 1}`
// and `showListPrice{updateListPriceFlag eq 1}` gating `price` and `listPrice` - are ALREADY PORTED,
// as a module-private zod schema inside `src/services/productService.ts` that
// `processProduct_updateSkus` parses with before any mutation. That schema is the single source of
// truth for those rules and this file does not duplicate it, restate it or wrap it: it is consumed by
// invoking the service, which is also why the conditional requiredness cannot drift between the two
// tiers. (That operation is in any case not published here - see non-exposure (3) in the module
// header.)
//
// NOR IS ANY RULE INVENTED. Six in-scope entities have NO validation file at all - `Category`,
// `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption` and
// `Product_AddOptionGroup` - and those absences are by design and are not filled in from here. Where
// the legacy declares no constraint, none is added: the paging members below are checked for their
// WIRE SHAPE only, and `ProductService`'s own S-08 bound on a supplied paging value stays
// authoritative.
//
// AN EMPTY VALUE IS NOT A MISSING VALUE, and that fidelity point is load-bearing twice over.
// `searchProductsByProductType` binds its term UNCONDITIONALLY as `%<term>%`
// [model/dao/ProductDAO.cfc:L422], so an empty keyword is a search that matches every row rather than
// an error; and neither option query guards an empty list, so an empty
// `existingOptionGroupIDList` leaves one query excluding nothing while it leaves the other matching
// nothing [model/dao/OptionDAO.cfc:L68, L107]. Both outcomes belong to the caller. These schemas
// therefore require the parameter to be PRESENT and accept an empty value.
// ---------------------------------------------------------------------------

/**
 * A query-string value that carries a non-negative integer.
 *
 * The pattern admits digits only - no sign, no decimal point, no exponent and no whitespace - so a
 * value that would reach `slice` as a negative offset or a fraction is refused at the boundary rather
 * than reinterpreted. The radix is explicit, as it must be everywhere in this subtree.
 *
 * This is a WIRE-FORM parse and not a restatement of the service's rule.
 * `ProductService.findProducts` independently rejects a supplied bound that is not a non-negative
 * safe integer, and that check remains the authoritative one; parsing here is what turns a malformed
 * numeral into a described field issue instead of an unrecognized server-shaped failure.
 */
const nonNegativeIntegerParameter = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer with no sign, decimal point or exponent')
  .transform((value: string): number => Number.parseInt(value, 10))
  .refine((value: number): boolean => Number.isSafeInteger(value), {
    message: 'must not exceed the largest integer this runtime can represent exactly',
  });

/**
 * How many records one routed `findProducts` request may ask for.
 *
 * ★★★ A BOUND ON THE ROUTED CONTRACT, AND DELIBERATELY NOT ON THE SERVICE. Static-performance review
 * (finding F10) established that omitting `pageRecordsShow` means THE WHOLE PRODUCT RESULT SET
 * [src/services/productService.ts, the paging block of `findProducts`], which this handler then
 * projects and `JSON.stringify`s into one response body. `ProductService` is right to define absence
 * that way - the legacy declared no page size at that call site and inventing one would silently
 * truncate a caller's results - so the bound belongs to the LAMBDA SURFACE, which is a different
 * caller with a different contract, and NOT to the service. Nothing about
 * `ProductService.findProducts` changes, and no other consumer of it is truncated.
 *
 * THE ROUTED CONTRACT THEREFORE REQUIRES A PAGE SIZE rather than defaulting one. A default would be
 * this file choosing how many records a caller wanted; requiring it makes the caller say, and makes
 * "the whole result set" unexpressible through this route rather than merely discouraged.
 *
 * A SAFETY BOUND ON ALLOCATION, stated as one. It bounds how large a single response document this
 * process will build; it is not a target, a quota, a rate, a page-per-second figure or a capacity
 * claim, and it carries no time dimension of any kind. Zero is admitted, because a caller asking for
 * a count is asking a legitimate question and `recordsCount` answers it without any records.
 */
const MAXIMUM_PAGE_RECORDS = 500;

/**
 * A page size: a non-negative integer, required, and at most {@link MAXIMUM_PAGE_RECORDS}.
 *
 * Refused rather than clamped. Clamping would answer a different question than the one asked and
 * would tell the caller nothing, which is the same reason an over-long list is refused whole rather
 * than shortened.
 */
const boundedPageSizeParameter = nonNegativeIntegerParameter.refine(
  (value: number): boolean => value <= MAXIMUM_PAGE_RECORDS,
  { message: `must be at most ${String(MAXIMUM_PAGE_RECORDS)} records for one routed request` },
);

/**
 * The closed criteria shape `findProducts` accepts.
 *
 * One member per member of `ProductQueryCriteria`, and no index signature: the framework smart list's
 * open-ended, string-keyed filter surface is not reopened here (AAP 0.6.2).
 *
 * `keyword` is REQUIRED because the service declares it required, and the service declares it
 * required because the statement binds it unconditionally - omitting it in CFML reached an
 * undefined-variable raise rather than a broader search. `productTypeIDs` stays OPTIONAL because its
 * guard at [model/dao/ProductDAO.cfc:L423] gives absence a meaning, and it stays a COMMA-DELIMITED
 * STRING rather than being modernised into an array, because the adapter binds it as a CFML list and
 * the string form is what signature parity preserves.
 */
const findProductsParameters = z.object({
  keyword: z.string(),
  productTypeIDs: z.string().optional(),
  pageRecordsStart: nonNegativeIntegerParameter.optional(),
  pageRecordsShow: boundedPageSizeParameter,
  currentURL: z.string().optional(),
});

/**
 * The closed shape `getUnusedProductOptions` accepts [model/service/OptionService.cfc:L72].
 *
 * Both parameters are declared `required` in the legacy signature, so both must be PRESENT here -
 * present and empty included, for the reason given above. `existingOptionGroupIDList` stays a
 * `string`: the DAO binds it with `cfqueryparam ... list="true"`, so the comma-delimited form is what
 * the contract carries, and splitting it is the adapter's job exactly as it was the DAO's.
 */
const getUnusedProductOptionsParameters = z.object({
  productID: z.string(),
  existingOptionGroupIDList: z.string(),
});

/**
 * The closed shape `getUnusedProductOptionGroups` accepts [model/service/OptionService.cfc:L76].
 *
 * ONE parameter, and no product identifier. The asymmetry against its sibling is the source's own -
 * [model/dao/OptionDAO.cfc:L95] versus [model/dao/OptionDAO.cfc:L52-L53] - and adding an optional
 * `productID` here would invent a requirement and quietly change the result set.
 */
const getUnusedProductOptionGroupsParameters = z.object({
  existingOptionGroupIDList: z.string(),
});

/**
 * The empty published-parameter list every mutation carries.
 *
 * One frozen instance rather than nine literals, so the nine rows below say the same thing by
 * construction and a reader can see at a glance that they are identical rather than nine coincidences.
 */
const NO_QUERY_PARAMETERS: readonly string[] = Object.freeze([]);

/**
 * The closed shape `getFormattedOptionGroups` accepts [model/service/ProductService.cfc:L70].
 *
 * ONE PARAMETER, and it is the product the formatted groups are read FROM. The ported method declares
 * `(required any product)` and is SYNCHRONOUS - it traverses the product's already-materialized option
 * groups and reaches nothing - so the only transport work is turning the identifier into the product,
 * which {@link RequestEntityLoaders.getProductByProductID} does behind the composition root.
 */
const getFormattedOptionGroupsParameters = z.object({
  productID: z.string(),
});

/**
 * The closed shape `getOptionsForSelect` accepts [model/service/OptionService.cfc:L55].
 *
 * ★ THE PORTED SIGNATURE TAKES `readonly Option[]`, NOT A LIST, and this is the one operation where
 * the transport shape and the service shape genuinely differ. The legacy `(required any options)`
 * receives an array of already-materialised entities from its callers
 * [model/entity/Product.cfc:L635-L646] - there is no identifier form of it anywhere in the source - so
 * a routed caller has to name them somehow. It names them as a COMMA LIST, which is the same form
 * every other identifier list on this surface takes and the form CFML list semantics parse, and the
 * entities are then loaded through {@link RequestEntityLoaders.getOptionsByOptionIDList}.
 *
 * NO PARAMETER IS INVENTED BEYOND THAT. There is no sort member, no group filter and no page bound:
 * the method projects the options it is given, in the order it is given them, and the routed contract
 * preserves that by preserving the caller's own list order.
 */
const getOptionsForSelectParameters = z.object({
  optionIDs: z.string(),
});

/**
 * The parameter names each operation publishes, derived from the schema that consumes them.
 *
 * Keyed by the operation union, so an operation without a parameter set is a compile error rather than
 * a silent hole. The names come from each schema's own shape, which keeps ONE source of truth: a
 * member added to a schema is admitted by the closed-set check without a second edit.
 *
 * ★★ THE NINE MUTATIONS PUBLISH NO QUERY PARAMETER AT ALL, AND THE EMPTY LIST IS THE POINT. Their
 * payload travels in the JSON body, so any query parameter beyond the operation selector itself is
 * refused rather than ignored - a caller that puts `productID` in the query string of a `saveProduct`
 * request is told, instead of having it silently dropped and then failing schema validation for a
 * reason that names the wrong container.
 */
const PUBLISHED_PARAMETER_NAMES: Readonly<Record<CatalogQueryOperation, readonly string[]>> =
  Object.freeze({
    findProducts: Object.freeze(Object.keys(findProductsParameters.shape)),
    getFormattedOptionGroups: Object.freeze(Object.keys(getFormattedOptionGroupsParameters.shape)),
    getUnusedProductOptions: Object.freeze(Object.keys(getUnusedProductOptionsParameters.shape)),
    getUnusedProductOptionGroups: Object.freeze(
      Object.keys(getUnusedProductOptionGroupsParameters.shape),
    ),
    getOptionsForSelect: Object.freeze(Object.keys(getOptionsForSelectParameters.shape)),
    processProduct_addOptionGroup: NO_QUERY_PARAMETERS,
    processProduct_addOption: NO_QUERY_PARAMETERS,
    processProduct_updateSkus: NO_QUERY_PARAMETERS,
    processProduct_deleteDefaultImage: NO_QUERY_PARAMETERS,
    processProduct_updateDefaultImageFileNames: NO_QUERY_PARAMETERS,
    saveProduct: NO_QUERY_PARAMETERS,
    saveProductType: NO_QUERY_PARAMETERS,
    deleteProduct: NO_QUERY_PARAMETERS,
    saveBrand: NO_QUERY_PARAMETERS,
  });

// ---------------------------------------------------------------------------
// The nine mutation payloads
//
// ★★★ EVERY ONE IS A `z.strictObject`, AND THAT IS SAFE HERE FOR A REASON THE QUERY-STRING CHECK
// ABOVE COULD NOT RELY ON. {@link hasClosedParameterSet} exists because a strict schema's own
// unrecognized-key message QUOTES THE KEY NAME, which is caller-authored text. That is no longer how
// such a rejection is published: `./errorMapper.js`'s `mapZodErrorFields` recognizes an
// unrecognized-member issue BY ISSUE CODE, keeps only the schema-authored container path, substitutes
// a fixed sentence, and never reads the library's `keys`, `received`, `values` or `input` members. So a
// strict body schema refuses an unrecognized member and names nothing the caller wrote - which is why
// `./priceResolutionHandler.js` validates its own body with strict objects throughout.
//
// NO SCHEMA BELOW RESTATES A BUSINESS RULE. The declarative rules of
// [model/validation/Product_UpdateSkus.json] - `showPrice{updatePriceFlag eq 1}` and
// `showListPrice{updateListPriceFlag eq 1}` - are ALREADY PORTED, as a module-private zod schema inside
// `src/services/productService.ts` that `processProduct_updateSkus` parses with before any mutation.
// That schema is the single source of truth for those rules and this file does not duplicate, restate
// or wrap it: it is consumed by invoking the service, which is also why the conditional requiredness
// cannot drift between the two tiers. Likewise the `required`, `unique` and `regex` rules of
// [model/validation/Product.json], [model/validation/ProductType.json] and
// [model/validation/Brand.json] are decided by the services, and a failure comes back on the entity's
// own error register rather than from a schema here.
//
// NOR IS ANY RULE INVENTED. Six in-scope entities have NO validation file at all - `Category`,
// `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption` and
// `Product_AddOptionGroup` - and those absences are by design and are not filled in from here. Where
// the legacy declares no constraint, none is added: `productDescription` carries no length bound
// because the column owns it, and no markup is sanitised because nothing in the source sanitises it.
//
// ★ THE TWO DELIBERATELY WIDE MEMBER TYPES ARE PRESERVED AS WIDE. `ProductUpdateSkusInput` declares
// both flags `string | number | boolean` and both prices `string | number`, because the legacy DTO
// declares no type, the declarative rule compares the flag to the LITERAL NUMBER 1, and the runtime
// branch applies a bare numeric truthiness test - three readings that a narrowed type would collapse.
// The unions below carry all three JSON forms through unchanged so the service decides, at the line
// CFML decides.
// ---------------------------------------------------------------------------

/**
 * An identifier naming a row that must already exist.
 *
 * NON-EMPTY, unlike the query-string identifiers above, and the asymmetry is deliberate rather than
 * inconsistent. An empty query value is a MEANINGFUL input on the read side - the keyword binds
 * unconditionally as `%%` [model/dao/ProductDAO.cfc:L422] and an empty exclusion list changes which
 * rows match [model/dao/OptionDAO.cfc:L68, L107] - so those schemas accept it. An empty identifier on
 * the write side names no row and never can: `''` is precisely the value `isNew()` tests for
 * [model/entity/Brand.cfc:L52, `unsavedvalue=""`], so admitting it would let a caller ask this
 * capability to save an unsaved entity, which is the routed creation protocol the module header
 * declines to invent. Refused with a fixed, server-authored sentence.
 */
const EXISTING_ROW_IDENTIFIER_RULE = 'is required and must name an existing row';

/**
 * ★★ THE SENTENCE IS SUPPLIED TWICE, so an ABSENT identifier and an EMPTY one are refused identically.
 * Zod's default type-error sentence ("Invalid input: expected string, received undefined") describes the
 * VALIDATOR's disappointment rather than the rule the caller broke, and leaving it in place would have
 * made a request omitting `productID` read differently from one sending `productID: ""` - even though the
 * transport policy treats the two the same way, because every mutation names an EXISTING row and row
 * creation is not published. Both renderings name the rule and neither names the value, which is the
 * invariant {@link MappedFieldIssue} requires.
 */
const existingRowIdentifier = z
  .string(EXISTING_ROW_IDENTIFIER_RULE)
  .min(1, EXISTING_ROW_IDENTIFIER_RULE);

/** A CFML flag as JSON carries one: a string, a number or a boolean, all three admitted. */
const cfmlFlagMember = z.union([z.string(), z.number(), z.boolean()]);

/** A decimal amount as JSON carries one. NOT converted to `Money` here - see the module header. */
const decimalAmountMember = z.union([z.string(), z.number()]);

/** [model/process/Product_AddOptionGroup.cfc:L49-L57] plus the product the method's first parameter names. */
const addOptionGroupBody = z.strictObject({
  productID: existingRowIdentifier,
  optionGroup: existingRowIdentifier,
});

/** [model/process/Product_AddOption.cfc:L49-L57] plus the product. */
const addOptionBody = z.strictObject({
  productID: existingRowIdentifier,
  option: existingRowIdentifier,
});

/**
 * [model/process/Product_UpdateSkus.cfc:L49-L60] plus the product.
 *
 * All four payload members are OPTIONAL here because all four are optional on the ported input, and
 * the conditional requiredness between them is the service's schema to enforce, at the line the legacy
 * enforces it.
 */
const updateSkusBody = z.strictObject({
  productID: existingRowIdentifier,
  updatePriceFlag: cfmlFlagMember.optional(),
  price: decimalAmountMember.optional(),
  updateListPriceFlag: cfmlFlagMember.optional(),
  listPrice: decimalAmountMember.optional(),
});

/**
 * The one sibling whose second parameter is `required struct data` rather than a process object
 * [model/service/ProductService.cfc:L198].
 *
 * `imageFile` is OPTIONAL because the legacy body gates every use of it behind
 * `structKeyExists(arguments.data, "imageFile")` [L199]. The asymmetry against its siblings is the
 * source's own and is preserved rather than harmonised.
 */
const deleteDefaultImageBody = z.strictObject({
  productID: existingRowIdentifier,
  imageFile: z.string().optional(),
});

/** [model/service/ProductService.cfc:L208] takes the product and nothing else. */
const updateDefaultImageFileNamesBody = z.strictObject({
  productID: existingRowIdentifier,
});

/**
 * The `saveProduct` payload [model/service/ProductService.cfc:L264].
 *
 * ★★★ EIGHT OF THE ELEVEN MEMBERS OF `ProductSaveInput`, AND THE THREE OMITTED ARE OMITTED ON
 * PRINCIPLE. `options`, `listPrice` and `price` are the SKU-CREATION COLLABORATION members: they are
 * seeded and extended in place by `processProduct_addOptionGroup` at
 * [model/service/ProductService.cfc:L132-L145] and read by the collaborator, not supplied by a caller.
 * Two of them are typed `Money`, and minting a `Money` is a domain act this file states outright that
 * it does not perform - admitting them would put currency parsing in the transport tier and would let
 * a caller drive SKU creation through a method whose name says it saves a product. The eight admitted
 * members are exactly the scalar columns `populateProduct` writes.
 */
const saveProductBody = z.strictObject({
  productID: existingRowIdentifier,
  urlTitle: z.string().optional(),
  productName: z.string().optional(),
  productCode: z.string().optional(),
  productDescription: z.string().optional(),
  activeFlag: z.boolean().optional(),
  publishedFlag: z.boolean().optional(),
  sortOrder: z.number().optional(),
  remoteID: z.string().optional(),
});

/**
 * The `saveProductType` payload [model/service/ProductService.cfc:L294].
 *
 * `activeFlag` and `publishedFlag` are typed `boolean` rather than the CFML input union, matching
 * `ProductTypeSaveInput`, which states the resolved value so no coercion table has to be reproduced
 * and no caller can submit a string the entity would silently read as true.
 */
const saveProductTypeBody = z.strictObject({
  productTypeID: existingRowIdentifier,
  urlTitle: z.string().optional(),
  productTypeName: z.string().optional(),
  productTypeDescription: z.string().optional(),
  systemCode: z.string().optional(),
  activeFlag: z.boolean().optional(),
  publishedFlag: z.boolean().optional(),
});

/** [model/service/ProductService.cfc:L317] takes the product and nothing else. */
const deleteProductBody = z.strictObject({
  productID: existingRowIdentifier,
});

/**
 * The `saveBrand` payload [model/service/BrandService.cfc:L67].
 *
 * ★ THE TWO FLAGS TAKE THE CFML INPUT UNION HERE AND A PLAIN `boolean` ON THE PRODUCT-TYPE SAVE, AND
 * THAT DIFFERENCE IS THE SERVICES'. `BrandSaveInput` declares both `CfBooleanInput` because the legacy
 * `populate` passed `trim(value)` - a STRING - and left coercion to the engine
 * [org/Hibachi/HibachiTransient.cfc:L194], so `'1'`, `'true'` and `'yes'` all had to work and the
 * ported entity's constructor accepts the same union. `ProductTypeSaveInput` declares resolved
 * booleans. Neither is harmonised here: each transport schema admits exactly what its service declares.
 */
const saveBrandBody = z.strictObject({
  brandID: existingRowIdentifier,
  urlTitle: z.string().optional(),
  brandName: z.string().optional(),
  activeFlag: cfmlFlagMember.optional(),
  publishedFlag: cfmlFlagMember.optional(),
  brandWebsite: z.string().optional(),
  remoteID: z.string().optional(),
});

/**
 * Whether every supplied parameter belongs to the operation's published set.
 *
 * ★ WHY THIS IS A SEPARATE CHECK RATHER THAN A STRICT SCHEMA. A strict object schema would reject an
 * unrecognized key with a message that QUOTES THE KEY NAME, and `./errorMapper.js` publishes a
 * validation issue's message into the response body. A key name is caller-authored text, so that
 * would reflect submitted input back to the sender - a hole straight through the guarantee that no
 * response body echoes what a caller sent. Checking membership here lets the refusal carry a FIXED
 * sentence that names nothing, while the schemas themselves stay non-strict and can only ever produce
 * messages about members THIS FILE declared.
 *
 * The grammar is genuinely closed: an unrecognized parameter is refused rather than ignored, so a
 * caller mis-spelling `pageRecordsShow` is told, instead of silently receiving the whole result set.
 */
function hasClosedParameterSet(
  operation: CatalogQueryOperation,
  parameters: Readonly<Record<string, string>>,
): boolean {
  const published = PUBLISHED_PARAMETER_NAMES[operation];

  for (const supplied of Object.keys(parameters)) {
    if (!published.includes(supplied)) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// The refusals this file decides for itself
//
// Every sentence below is FIXED and handler-authored, and none of them names a submitted value, a
// submitted key, a route, a host, a credential or a statement. `./errorMapper.js` owns the top-level
// message for each reason and publishes these as field-level constraint descriptions; the reason
// literal a handler passes is one of a closed union, so no free-form sentence can reach the envelope
// from here.
// ---------------------------------------------------------------------------

/** The dotted label the operation selector is reported under. */
const OPERATION_ISSUE_PATH = OPERATION_PARAMETER;

/** The label an unpublished query parameter is reported under. Names the container, never the key. */
const QUERY_STRING_ISSUE_PATH = 'queryStringParameters';

/** The published operations, rendered once for the refusal sentences that list them. */
const PUBLISHED_OPERATION_LIST = CATALOG_QUERY_OPERATIONS.join(', ');

/** No operation was named at all. */
const MISSING_OPERATION_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message: `is required and must name exactly one of: ${PUBLISHED_OPERATION_LIST}`,
});

/**
 * More operations were named than one invocation may serve.
 *
 * The sentence states the refusal AND that nothing was truncated, because a caller that sent two
 * operations needs to know it received neither rather than silently the first.
 */
const TOO_MANY_OPERATIONS_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message:
    `may be supplied at most ${String(MAXIMUM_OPERATIONS_PER_INVOCATION)} time per request; ` +
    'a request naming more is refused whole and is never truncated to the first',
});

/** The named operation is not one this capability publishes. The submitted token is not echoed. */
const UNKNOWN_OPERATION_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message: `must name one of the operations this capability publishes: ${PUBLISHED_OPERATION_LIST}`,
});

/** A parameter outside the named operation's closed set was supplied. The key is not echoed. */
const UNPUBLISHED_PARAMETER_ISSUE: MappedFieldIssue = Object.freeze({
  path: QUERY_STRING_ISSUE_PATH,
  message:
    'carries a parameter the named operation does not publish; the criteria shape is closed, and ' +
    'an unrecognized parameter is refused rather than ignored',
});

/**
 * The named operation is not served on the request's method.
 *
 * ★★ THE SENTENCE NAMES NEITHER THE METHOD SENT NOR THE OPERATION NAMED, and it deliberately does not
 * say which method WOULD have worked. `event.httpMethod` is caller-controlled text and the operation
 * token is caller-submitted, so neither may be echoed; and disclosing the correct method would let a
 * caller enumerate which of the fourteen operations are writes without being authorized for any of them.
 * The published vocabulary in the module documentation is where a legitimate caller learns the pairing.
 *
 * NOT A 405, for the reason `./router.js` records for the whole subtree: FW/1 dispatched an action by
 * ANY method, so there is no method-not-allowed concept in the source to port, and a 405 additionally
 * confirms that the thing exists.
 */
const OPERATION_METHOD_MISMATCH_ISSUE: MappedFieldIssue = Object.freeze({
  path: OPERATION_ISSUE_PATH,
  message:
    'names an operation this capability does not serve on the request method; each operation is ' +
    'served on exactly one method, and a request using the other one is refused rather than ' +
    'reinterpreted',
});

// ---------------------------------------------------------------------------
// The invocation plan
//
// Validation produces a PLAN, and the plan is what the service call consumes. Splitting the two keeps
// every schema rejection outside the idempotency ledger - a malformed request is a deterministic
// refusal, so it is neither recorded nor replayed - and it makes "exactly one ported service method
// per invocation" a property a reader can see rather than infer.
// ---------------------------------------------------------------------------

/**
 * One validated request, discriminated by the operation it will invoke.
 *
 * ★ EVERY ENTITY ARGUMENT IS STILL AN IDENTIFIER AT THIS POINT. A plan is what validation produced; it
 * holds no entity, because binding one requires the request scope and the scope is not opened until the
 * plan exists. {@link invokeCatalogOperation} is where an identifier becomes the entity a ported
 * signature declares, through the scope's read-only loaders.
 */
type CatalogQueryInvocation =
  // --- The five reads ------------------------------------------------------
  | {
      readonly operation: 'findProducts';
      readonly criteria: ProductQueryCriteria;
    }
  | {
      readonly operation: 'getFormattedOptionGroups';
      readonly productID: string;
    }
  | {
      readonly operation: 'getUnusedProductOptions';
      readonly productID: string;
      readonly existingOptionGroupIDList: string;
    }
  | {
      readonly operation: 'getUnusedProductOptionGroups';
      readonly existingOptionGroupIDList: string;
    }
  | {
      readonly operation: 'getOptionsForSelect';
      readonly optionIDs: string;
    }
  // --- The nine mutations --------------------------------------------------
  | {
      readonly operation: 'processProduct_addOptionGroup';
      readonly productID: string;
      readonly input: AddOptionGroupPayload;
    }
  | {
      readonly operation: 'processProduct_addOption';
      readonly productID: string;
      readonly input: AddOptionPayload;
    }
  | {
      readonly operation: 'processProduct_updateSkus';
      readonly productID: string;
      readonly input: UpdateSkusPayload;
    }
  | {
      readonly operation: 'processProduct_deleteDefaultImage';
      readonly productID: string;
      readonly input: DeleteDefaultImagePayload;
    }
  | {
      readonly operation: 'processProduct_updateDefaultImageFileNames';
      readonly productID: string;
    }
  | {
      readonly operation: 'saveProduct';
      readonly productID: string;
      readonly input: SaveProductPayload;
    }
  | {
      readonly operation: 'saveProductType';
      readonly productTypeID: string;
      readonly input: SaveProductTypePayload;
    }
  | {
      readonly operation: 'deleteProduct';
      readonly productID: string;
    }
  | {
      readonly operation: 'saveBrand';
      readonly brandID: string;
      readonly input: SaveBrandPayload;
    };

/**
 * Which caller comma-lists one plan carries, and what else the statement binds alongside each.
 *
 * FOUR OF THE FOURTEEN OPERATIONS CARRY ONE; the other ten carry none and answer an empty list, which
 * is why the tuple table is built here rather than inline: an `if`-chain over fourteen arms would make
 * "these four and no others" something a reader has to reconstruct.
 *
 * Each tuple is `[parameterName, value, additionalPlaceholderCount, emptyListBindsOne]`, and the last
 * two members are read off the adapter that binds the list rather than chosen:
 *
 *   * `findProducts` - `productTypeIDs` becomes `productTypeID in (...)` and the statement also binds
 *     the required keyword [model/dao/ProductDAO.cfc:L422-L425], so ONE further placeholder. An empty
 *     list is guarded there, so it binds nothing.
 *   * `getUnusedProductOptions` - `existingOptionGroupIDList` becomes a `NOT IN (...)` exclusion and
 *     the statement also binds the trailing product identifier [model/dao/OptionDAO.cfc:L68]. The DAO
 *     has NO emptiness guard, so an empty list binds ONE empty string, and that is reproduced.
 *   * `getUnusedProductOptionGroups` - the same exclusion with no trailing bind
 *     [model/dao/OptionDAO.cfc:L107].
 *   * `getOptionsForSelect` - `optionIDs` becomes the `IN (...)` of the option load. An empty request
 *     issues NO STATEMENT at all there, so an empty list binds nothing and MUST NOT be counted as one:
 *     that adapter's empty case means "the caller asked for nothing", which is the opposite of the
 *     option-exclusion adapter's empty case, and harmonising the two would change which rows match.
 */
function describeCommaLists(
  invocation: CatalogQueryInvocation,
): readonly (readonly [
  parameterName: string,
  value: string | undefined,
  additionalPlaceholderCount: number,
  emptyListBindsOne: boolean,
])[] {
  switch (invocation.operation) {
    case 'findProducts':
      return [['productTypeIDs', invocation.criteria.productTypeIDs, 1, false]];

    case 'getUnusedProductOptions':
      return [['existingOptionGroupIDList', invocation.existingOptionGroupIDList, 1, true]];

    case 'getUnusedProductOptionGroups':
      return [['existingOptionGroupIDList', invocation.existingOptionGroupIDList, 0, true]];

    case 'getOptionsForSelect':
      return [['optionIDs', invocation.optionIDs, 0, false]];

    // The ten remaining operations bind identifiers one at a time and no caller-expanded list, so
    // there is no placeholder count a caller can influence. Enumerated rather than defaulted, so an
    // operation that later grew a list could not inherit "no bound" silently.
    case 'getFormattedOptionGroups':
    case 'processProduct_addOptionGroup':
    case 'processProduct_addOption':
    case 'processProduct_updateSkus':
    case 'processProduct_deleteDefaultImage':
    case 'processProduct_updateDefaultImageFileNames':
    case 'saveProduct':
    case 'saveProductType':
    case 'deleteProduct':
    case 'saveBrand':
      return [];
  }
}

/**
 * The first admitted comma-list too wide for a preparable statement, or nothing.
 *
 * ★★★ THE HANDLER HALF OF FINDING F17, AND ITS WHOLE VALUE IS THE STATUS IT PRODUCES. Two of this
 * capability's fourteen operations forward a comma-delimited identifier list that becomes one SQL
 * placeholder PER ELEMENT - `existingOptionGroupIDList` at [model/dao/OptionDAO.cfc:L68, L107] - and
 * `findProducts` forwards a third, `productTypeIDs`, at [model/dao/ProductDAO.cfc:L423]. The adapters
 * now refuse a list above the protocol's own placeholder ceiling, but a refusal raised down there is
 * an unrecognized throw that `./errorMapper.js` reduces to a generic 500. Asked HERE, the same
 * refusal is a client-shaped 400 carrying the offending parameter's name.
 *
 * IT IS A COUNT TEST AND NOTHING ELSE. The list is parsed the way the adapter parses it - CFML list
 * semantics, so empty elements are dropped - and its placeholder count is combined with the
 * statement's other binds: the required keyword for `findProducts`, the trailing product identifier
 * for `getUnusedProductOptions`, and none for `getUnusedProductOptionGroups`. The two option
 * operations also reproduce their adapter's one-empty-string bind when the parsed list is empty.
 * No element is trimmed, sorted, deduplicated, case-folded, reordered or dropped to fit, because
 * each of those changes which rows the statement matches. Every complete statement that IS
 * preparable is forwarded byte for byte, exactly as before.
 *
 * THE BOUND IS THE PROTOCOL'S OWN. `COM_STMT_PREPARE_OK` reports a prepared statement's placeholder
 * count in a two-byte field, so a list above the ceiling could not be prepared by the server however
 * it was sent: nothing the legacy could have answered is refused, and no throughput, capacity or
 * latency figure is involved.
 *
 * @returns the field-level issue to publish, or `undefined` when every list is preparable.
 */
function firstUnpreparableCommaList(
  invocation: CatalogQueryInvocation,
): MappedFieldIssue | undefined {
  const lists: readonly (readonly [
    parameterName: string,
    value: string | undefined,
    additionalPlaceholderCount: number,
    emptyListBindsOne: boolean,
  ])[] = describeCommaLists(invocation);

  for (const [parameterName, value, additionalPlaceholderCount, emptyListBindsOne] of lists) {
    if (value === undefined) {
      continue;
    }

    const elementCount = listToArray(value).length;
    const listPlaceholderCount = emptyListBindsOne ? Math.max(1, elementCount) : elementCount;
    const placeholderCount = listPlaceholderCount + additionalPlaceholderCount;

    if (!isPreparablePlaceholderCount(placeholderCount)) {
      const maximumListElements = MAX_PLACEHOLDER_COUNT - additionalPlaceholderCount;

      return Object.freeze({
        path: parameterName,
        message:
          `must name at most ${String(maximumListElements)} identifiers for this operation, which ` +
          'with the statement’s other bound values is the most MySQL can prepare; a longer list is ' +
          'refused whole rather than shortened, because dropping an element would change which ' +
          'records match',
      });
    }
  }

  return undefined;
}

/**
 * Validate the supplied parameters for one operation and produce the plan.
 *
 * Throws the schema's own rejection, which `./errorMapper.js` recognizes as a validation failure and
 * publishes as field paths plus constraint descriptions - never the submitted values.
 *
 * The switch is exhaustive over the closed operation union, so adding an operation without planning it
 * is a compile error rather than a runtime fall-through.
 */
function planInvocation(
  operation: CatalogQueryOperation,
  parameters: Readonly<Record<string, string>>,
  document: object | undefined,
): CatalogQueryInvocation {
  switch (operation) {
    case 'findProducts': {
      const supplied = findProductsParameters.parse(parameters);

      // Built member by member rather than forwarded wholesale, so that each member of the ported
      // criteria shape is visible at the seam. Absence is forwarded AS absence: every optional member
      // of `ProductQueryCriteria` declares `| undefined`, and the service gives absence a meaning.
      //
      // ★ `pageRecordsShow` IS THE ONE MEMBER THIS SURFACE WILL NOT LEAVE ABSENT. Absent means THE
      // WHOLE RESULT SET to the service, which is correct for a service caller and is a whole-catalog
      // buffer for an HTTP one, so the routed contract requires it (finding F10). It is always
      // present here and always at or below {@link MAXIMUM_PAGE_RECORDS}.
      const criteria: ProductQueryCriteria = {
        keyword: supplied.keyword,
        productTypeIDs: supplied.productTypeIDs,
        pageRecordsStart: supplied.pageRecordsStart,
        pageRecordsShow: supplied.pageRecordsShow,
        currentURL: supplied.currentURL,
      };

      return { operation, criteria };
    }

    case 'getUnusedProductOptions': {
      const supplied = getUnusedProductOptionsParameters.parse(parameters);

      return {
        operation,
        productID: supplied.productID,
        existingOptionGroupIDList: supplied.existingOptionGroupIDList,
      };
    }

    case 'getUnusedProductOptionGroups': {
      const supplied = getUnusedProductOptionGroupsParameters.parse(parameters);

      return { operation, existingOptionGroupIDList: supplied.existingOptionGroupIDList };
    }

    case 'getFormattedOptionGroups': {
      const supplied = getFormattedOptionGroupsParameters.parse(parameters);

      return { operation, productID: supplied.productID };
    }

    case 'getOptionsForSelect': {
      const supplied = getOptionsForSelectParameters.parse(parameters);

      return { operation, optionIDs: supplied.optionIDs };
    }

    // ★ FROM HERE ON THE PAYLOAD COMES FROM `document`, AND `parameters` IS PROVABLY EMPTY. Every
    // mutation publishes `NO_QUERY_PARAMETERS`, so {@link hasClosedParameterSet} has already refused a
    // request carrying any query parameter beyond the operation selector. Nothing below reads
    // `parameters`, which is what makes "the body is the payload" a property rather than a convention.
    //
    // ★★ `document` IS TYPED `object | undefined` AND IS PARSED RATHER THAN ASSERTED. The handler
    // refuses `missingRequestBody` before it reaches this function, so `undefined` cannot arrive on a
    // mutation arm - and if it ever did, `z.strictObject.parse(undefined)` produces an ordinary
    // validation rejection that `./errorMapper.js` publishes as a 400 naming the document root. That is
    // the correct outcome for an impossible case, reached without a non-null assertion, a cast or an
    // impossible-case throw of this file's own devising.

    case 'processProduct_addOptionGroup': {
      const supplied = addOptionGroupBody.parse(document);

      return {
        operation,
        productID: supplied.productID,
        input: { optionGroup: supplied.optionGroup },
      };
    }

    case 'processProduct_addOption': {
      const supplied = addOptionBody.parse(document);

      return { operation, productID: supplied.productID, input: { option: supplied.option } };
    }

    case 'processProduct_updateSkus': {
      const supplied = updateSkusBody.parse(document);

      // Built member by member, and every absence forwarded AS ABSENCE under
      // `exactOptionalPropertyTypes`: `ProductUpdateSkusInput` declares all four members optional, and
      // the service's own schema decides the conditional requiredness between them at the line the
      // legacy decides it. Substituting a `0`, a `''` or a `false` for an omitted flag would answer the
      // service's question on the caller's behalf.
      const input: UpdateSkusPayload = {
        ...(supplied.updatePriceFlag === undefined
          ? {}
          : { updatePriceFlag: supplied.updatePriceFlag }),
        ...(supplied.price === undefined ? {} : { price: supplied.price }),
        ...(supplied.updateListPriceFlag === undefined
          ? {}
          : { updateListPriceFlag: supplied.updateListPriceFlag }),
        ...(supplied.listPrice === undefined ? {} : { listPrice: supplied.listPrice }),
      };

      return { operation, productID: supplied.productID, input };
    }

    case 'processProduct_deleteDefaultImage': {
      const supplied = deleteDefaultImageBody.parse(document);

      // `imageFile` absent is what the legacy `structKeyExists(arguments.data, "imageFile")` guard at
      // [model/service/ProductService.cfc:L199] tests for, so the key is omitted rather than set to
      // `undefined` - the two are different states under `exactOptionalPropertyTypes` and only the
      // first reproduces the guard.
      const input: DeleteDefaultImagePayload =
        supplied.imageFile === undefined ? {} : { imageFile: supplied.imageFile };

      return { operation, productID: supplied.productID, input };
    }

    case 'processProduct_updateDefaultImageFileNames': {
      const supplied = updateDefaultImageFileNamesBody.parse(document);

      return { operation, productID: supplied.productID };
    }

    case 'saveProduct': {
      const supplied = saveProductBody.parse(document);

      // The eight scalar columns `populateProduct` writes, each omitted when absent. The three
      // SKU-creation collaboration members of `ProductSaveInput` are NOT built here at all - see
      // {@link saveProductBody} for why two of them would require this tier to mint a `Money`.
      const input: SaveProductPayload = {
        ...(supplied.urlTitle === undefined ? {} : { urlTitle: supplied.urlTitle }),
        ...(supplied.productName === undefined ? {} : { productName: supplied.productName }),
        ...(supplied.productCode === undefined ? {} : { productCode: supplied.productCode }),
        ...(supplied.productDescription === undefined
          ? {}
          : { productDescription: supplied.productDescription }),
        ...(supplied.activeFlag === undefined ? {} : { activeFlag: supplied.activeFlag }),
        ...(supplied.publishedFlag === undefined ? {} : { publishedFlag: supplied.publishedFlag }),
        ...(supplied.sortOrder === undefined ? {} : { sortOrder: supplied.sortOrder }),
        ...(supplied.remoteID === undefined ? {} : { remoteID: supplied.remoteID }),
      };

      return { operation, productID: supplied.productID, input };
    }

    case 'saveProductType': {
      const supplied = saveProductTypeBody.parse(document);

      const input: SaveProductTypePayload = {
        ...(supplied.urlTitle === undefined ? {} : { urlTitle: supplied.urlTitle }),
        ...(supplied.productTypeName === undefined
          ? {}
          : { productTypeName: supplied.productTypeName }),
        ...(supplied.productTypeDescription === undefined
          ? {}
          : { productTypeDescription: supplied.productTypeDescription }),
        ...(supplied.systemCode === undefined ? {} : { systemCode: supplied.systemCode }),
        ...(supplied.activeFlag === undefined ? {} : { activeFlag: supplied.activeFlag }),
        ...(supplied.publishedFlag === undefined ? {} : { publishedFlag: supplied.publishedFlag }),
      };

      return { operation, productTypeID: supplied.productTypeID, input };
    }

    case 'deleteProduct': {
      const supplied = deleteProductBody.parse(document);

      return { operation, productID: supplied.productID };
    }

    case 'saveBrand': {
      const supplied = saveBrandBody.parse(document);

      const input: SaveBrandPayload = {
        ...(supplied.urlTitle === undefined ? {} : { urlTitle: supplied.urlTitle }),
        ...(supplied.brandName === undefined ? {} : { brandName: supplied.brandName }),
        ...(supplied.activeFlag === undefined ? {} : { activeFlag: supplied.activeFlag }),
        ...(supplied.publishedFlag === undefined ? {} : { publishedFlag: supplied.publishedFlag }),
        ...(supplied.brandWebsite === undefined ? {} : { brandWebsite: supplied.brandWebsite }),
        ...(supplied.remoteID === undefined ? {} : { remoteID: supplied.remoteID }),
      };

      return { operation, brandID: supplied.brandID, input };
    }
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * The element type of a matched product page, taken from the service's own published shape.
 *
 * Derived rather than imported: `src/domain/entities/product.ts` is not among this file's
 * dependencies, and deriving the type from `ProductPage` keeps the projection pinned to whatever the
 * service actually returns.
 */
type MatchedProduct = ProductPage['records'][number];

/**
 * Rename one matched row's two members onto the two this surface publishes.
 *
 * ★★★ IT IS A RENAME NOW, NOT A PROJECTION OF AN ENTITY (F38). The service used to answer hydrated
 * products here and this function read `getProductID()` and `getProductName()` off each one - the ONLY
 * two members it ever read, which is precisely why code review recorded the graph hydration behind
 * them as unasked-for work. The service now answers the two columns
 * [model/dao/ProductDAO.cfc:L421] selects, keyed as the legacy keys them - `"id"` and `"value"`
 * [L429-L436] - and this function maps them onto the names this HTTP surface has always published.
 * THE RESPONSE SHAPE IS THEREFORE UNCHANGED: `productID` and an optional `productName`, exactly as
 * before, which is why no consumer of this endpoint sees the difference.
 *
 * The member is OMITTED when the row carries no name, which is the whole of how absence is
 * represented on this surface. Nothing is substituted - no empty string, no `null`, no zero - because
 * a substituted value is indistinguishable from a real one and this subtree treats that distinction as
 * load-bearing.
 */
function projectProduct(match: MatchedProduct): CatalogProductProjection {
  const productName = match.value;

  return productName === undefined ? { productID: match.id } : { productID: match.id, productName };
}

/**
 * Project one product page, preserving repository order exactly.
 *
 * `records` is mapped in place order and never sorted, filtered or de-duplicated here: reordering a
 * service's result in transit would change observable behaviour, and this file changes none.
 * `pageRecordsShow` is omitted when the service returned the whole result set, for the reason given on
 * {@link CatalogProductPageProjection}.
 */
function projectProductPage(page: ProductPage): CatalogProductPageProjection {
  const projected: CatalogProductPageProjection = {
    records: page.records.map(projectProduct),
    recordsCount: page.recordsCount,
    pageRecordsStart: page.pageRecordsStart,
    entityName: page.entityName,
    joins: page.joins,
    keywordProperties: page.keywordProperties,
  };

  return page.pageRecordsShow === undefined
    ? projected
    : { ...projected, pageRecordsShow: page.pageRecordsShow };
}

/**
 * Invoke EXACTLY ONE ported service method for the planned operation and project its result.
 *
 * Every arm is a single `await` on a single service member, and no arm computes, adjusts, combines or
 * re-derives anything the service returned. The options arms forward their comma-delimited list
 * parameter as the `string` the ported signature declares, and their results are published in the
 * order the repository produced them.
 *
 * The switch is exhaustive over the plan union, so an unplanned arm is a compile error.
 */
async function invokeCatalogOperation(
  scope: RequestScope,
  invocation: CatalogQueryInvocation,
): Promise<CatalogQueryResult> {
  switch (invocation.operation) {
    case 'findProducts': {
      const page = await scope.productService.findProducts(invocation.criteria);

      return { operation: invocation.operation, result: projectProductPage(page) };
    }

    case 'getUnusedProductOptions': {
      const rows = await scope.optionService.getUnusedProductOptions(
        invocation.productID,
        invocation.existingOptionGroupIDList,
      );

      return { operation: invocation.operation, result: rows };
    }

    case 'getUnusedProductOptionGroups': {
      const rows = await scope.optionService.getUnusedProductOptionGroups(
        invocation.existingOptionGroupIDList,
      );

      return { operation: invocation.operation, result: rows };
    }

    case 'getFormattedOptionGroups': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // SYNCHRONOUS, and awaited nowhere, because the ported method is synchronous: it traverses the
      // product's already-materialized option groups and reaches nothing
      // [model/service/ProductService.cfc:L70]. Wrapping it in an `await` would suggest a round trip
      // that does not happen.
      return {
        operation: invocation.operation,
        result: scope.productService.getFormattedOptionGroups(product),
      };
    }

    case 'getOptionsForSelect': {
      // The caller's list, parsed with CFML list semantics - the SAME parse the option adapters apply,
      // so an untidy list is read here exactly as it would be read there. Empty elements are dropped
      // and nothing is trimmed, sorted, deduplicated or case-folded: each of those would change which
      // options the projection carries or the order it carries them in.
      const requestedOptionIDs = listToArray(invocation.optionIDs);
      const loaded = await scope.entityLoaders.getOptionsByOptionIDList(requestedOptionIDs);

      // ★★ THE CALLER'S OWN ORDER IS PRESERVED, AND A SINGLE MISS REFUSES THE WHOLE REQUEST. The load
      // answers an unordered map keyed by case-folded identifier, so the list is walked rather than the
      // map: the projection then carries the options in the order the caller named them, which is what
      // makes `getOptionsForSelect`'s "in repository order" promise the caller's order here - it is the
      // caller that supplies the sequence, not a query. A missing key is reported as one outcome for
      // the request rather than as a silently shorter array, because a shorter array cannot be aligned
      // with the list that was asked for.
      const options: CatalogOption[] = [];

      for (const optionID of requestedOptionIDs) {
        const option = loaded.get(cfFoldKey(optionID));

        if (option === undefined) {
          return { operation: invocation.operation, unresolved: 'optionNotFound' };
        }

        options.push(option);
      }

      // SYNCHRONOUS for the same reason as above: the ported body is a pure transformation
      // [model/service/OptionService.cfc:L55].
      return {
        operation: invocation.operation,
        result: scope.optionService.getOptionsForSelect(options),
      };
    }

    case 'processProduct_addOptionGroup': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // The option group named in the payload is loaded by the SERVICE, not here - see
      // {@link CatalogUnresolvedReason} for why pre-checking it would move a preserved raise.
      const saved = await scope.productService.processProduct_addOptionGroup(
        product,
        invocation.input,
      );

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_addOption': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const saved = await scope.productService.processProduct_addOption(product, invocation.input);

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_updateSkus': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // THE BATCH BOUND IS THE SERVICE'S. `ProductService` refuses a repricing run above
      // `maximumSkuUpdateBatchSize`, supplied by the composition root and defaulting to 1000, and that
      // refusal funnels through `./errorMapper.js` like any other service throw. No second bound is
      // applied here - see the module header for why one would refuse work the service has already
      // proved it can carry atomically.
      const saved = await scope.productService.processProduct_updateSkus(product, invocation.input);

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_deleteDefaultImage': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const saved = await scope.productService.processProduct_deleteDefaultImage(
        product,
        invocation.input,
      );

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'processProduct_updateDefaultImageFileNames': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const saved = await scope.productService.processProduct_updateDefaultImageFileNames(product);

      return { operation: invocation.operation, result: projectSavedProduct(saved) };
    }

    case 'saveProduct': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      // ★ THE SAVE RETURNS WHETHER OR NOT IT VALIDATED, exactly as the legacy returns
      // [model/service/ProductService.cfc:L291]. The caller of THIS function does not decide the
      // status; {@link servedOrRefused} reads the entity's error register afterwards and turns a failed
      // rule into a 400. Keeping that decision out of here is what keeps this switch to one service
      // call per arm.
      const saved = await scope.productService.saveProduct(product, invocation.input);
      const refusedRules = failedSaveIssues(saved);

      return refusedRules === undefined
        ? { operation: invocation.operation, result: projectSavedProduct(saved) }
        : { operation: invocation.operation, refusedRules };
    }

    case 'saveProductType': {
      const productType = await scope.entityLoaders.getProductTypeByProductTypeID(
        invocation.productTypeID,
      );

      if (productType === undefined) {
        return { operation: invocation.operation, unresolved: 'productTypeNotFound' };
      }

      const saved = await scope.productService.saveProductType(productType, invocation.input);
      const refusedRules = failedSaveIssues(saved);

      return refusedRules === undefined
        ? { operation: invocation.operation, result: projectSavedProductType(saved) }
        : { operation: invocation.operation, refusedRules };
    }

    case 'deleteProduct': {
      const product = await scope.entityLoaders.getProductByProductID(invocation.productID);

      if (product === undefined) {
        return { operation: invocation.operation, unresolved: 'productNotFound' };
      }

      const deleted = await scope.productService.deleteProduct(product);

      return { operation: invocation.operation, result: { deleted } };
    }

    case 'saveBrand': {
      const brand = await scope.entityLoaders.getBrandByBrandID(invocation.brandID);

      if (brand === undefined) {
        return { operation: invocation.operation, unresolved: 'brandNotFound' };
      }

      const saved = await scope.brandService.saveBrand(brand, invocation.input);
      const refusedRules = failedSaveIssues(saved);

      return refusedRules === undefined
        ? { operation: invocation.operation, result: projectSavedBrand(saved) }
        : { operation: invocation.operation, refusedRules };
    }
  }
}

/**
 * Project one product after a mutation.
 *
 * Three members, each read off a published accessor, and each optional one OMITTED when absent. See
 * {@link CatalogSavedProductProjection} for why `urlTitle` is published here and not on the read
 * projection.
 */
function projectSavedProduct(product: CatalogProduct): CatalogSavedProductProjection {
  const productName = product.getProductName();
  const urlTitle = product.getUrlTitle();

  return {
    productID: product.getProductID(),
    ...(productName === undefined ? {} : { productName }),
    ...(urlTitle === undefined ? {} : { urlTitle }),
  };
}

/** Project one product type after `saveProductType`, on the same three-member terms. */
function projectSavedProductType(
  productType: CatalogProductType,
): CatalogSavedProductTypeProjection {
  const productTypeName = productType.getProductTypeName();
  const urlTitle = productType.getUrlTitle();

  return {
    productTypeID: productType.getProductTypeID(),
    ...(productTypeName === undefined ? {} : { productTypeName }),
    ...(urlTitle === undefined ? {} : { urlTitle }),
  };
}

/** Project one brand after `saveBrand`, on the same three-member terms. */
function projectSavedBrand(brand: CatalogBrand): CatalogSavedBrandProjection {
  const brandName = brand.getBrandName();
  const urlTitle = brand.getUrlTitle();

  return {
    brandID: brand.getBrandID(),
    ...(brandName === undefined ? {} : { brandName }),
    ...(urlTitle === undefined ? {} : { urlTitle }),
  };
}

/**
 * How many records a served result carries. Reported on the log line, never inferred from it.
 *
 * A result that is not a collection reports ONE, and an unresolved outcome reports ZERO. Both are the
 * honest answers to "how many records did this response carry", and neither is a measurement of
 * anything else: no duration, no rate and no size is derived here or anywhere in this file.
 */
function countServedRecords(served: CatalogQueryResult): number {
  if ('unresolved' in served || 'refusedRules' in served) {
    return 0;
  }

  if (served.operation === 'findProducts') {
    return served.result.records.length;
  }

  return Array.isArray(served.result) ? served.result.length : 1;
}

/**
 * Build the response for one served result: the shared success envelope, or the 400 a failed ported
 * save rule earns.
 *
 * ★★ TWO OUTCOMES AND ONE FUNCTION, because the choice between them is a single question about the
 * result and nothing else. The success status, the header set and the envelope shape are all
 * `./errorMapper.js`'s - the same module that decides them for a failure - so this function's whole
 * remaining job is to name the capability, the action and the payload, or to hand the failed-rule issues
 * to the same module's refusal arm.
 *
 * `unresolved` IS A SUCCESS and `refusedRules` IS NOT, and the difference is not arbitrary: an
 * identifier that names no row is a domain outcome the request asked about and got an answer to, while a
 * payload that failed a ported validation rule is input this service could not use. See
 * {@link CatalogUnresolvedReason} for the two concrete grounds on which a 404 was rejected for the
 * former.
 */
function servedOrRefused(
  served: CatalogQueryResult,
  requestId: string,
  context: ErrorMappingContext,
): APIGatewayProxyResult {
  if ('refusedRules' in served) {
    return invalidRequestResponse('unusableRequestInput', context, served.refusedRules);
  }

  const document: CatalogQueryResultDocument =
    'unresolved' in served
      ? { operation: served.operation, unresolved: served.unresolved }
      : { operation: served.operation, result: served.result };

  return jsonSuccessResponse(requestId, OWNED_CAPABILITY, IMPLEMENTED_ACTION, document);
}

// ---------------------------------------------------------------------------
// Reading the request body, for the nine mutations
// ---------------------------------------------------------------------------

/**
 * A decoded request document, or this handler's own reason for refusing to decode one.
 *
 * Each refusal NAMES a reason from `./errorMapper.js`'s closed union and lets that module own the
 * sentence, which is what keeps the wording out of this file and the submitted value out of the
 * response. `unparsableRequestBody` is a reason this module STATES rather than something inferred from a
 * caught `SyntaxError`, because this service's own code can produce that shape too.
 */
type CatalogDocumentReading =
  | { readonly decoded: true; readonly document: object }
  | {
      readonly decoded: false;
      readonly reason: InvalidRequestReason;
      readonly fields?: readonly MappedFieldIssue[] | undefined;
    };

/**
 * Maximum decoded request document this compact payload grammar admits.
 *
 * JUDGMENT CALL: a target-chosen SAFETY bound on how much text one invocation will parse, stated as one.
 * It is not a target, a quota, a rate or a capacity figure and carries no time dimension. The largest
 * payload published here is `saveProduct`'s eight scalar columns, one of which is a 4000-character
 * `wysiwyg` description [model/entity/Product.cfc:L57], so 8 KiB admits every legitimate body with room
 * to spare - and the ceiling ALSO bounds the prototype-key walk below, which is why that walk needs no
 * depth limit of its own.
 */
const MAXIMUM_REQUEST_DOCUMENT_BYTES = 8 * 1024;

/** Encoded length above which a base64 body cannot decode within the byte ceiling. */
const MAXIMUM_ENCODED_BODY_LENGTH = Math.ceil((MAXIMUM_REQUEST_DOCUMENT_BYTES * 4) / 3) + 4;

/**
 * Decode a mutation's request body into a JSON object.
 *
 * A base64 body is decoded first - API Gateway sets `isBase64Encoded` for a binary media type, and a
 * caller that does so is not making a different request. Invalid base64 decodes to bytes that then fail
 * to parse, which lands on `unparsableRequestBody`, correctly.
 */
function readRequestDocument(event: APIGatewayProxyEvent): CatalogDocumentReading {
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

  // An array and a bare scalar are both well-formed JSON and neither is a request document. The schemas
  // would reject them, but naming the shape here produces the more precise reason.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { decoded: false, reason: 'unsupportedBodyShape' };
  }

  // ★★★ THE ONE UNRECOGNIZED KEY `z.strictObject` DOES NOT REFUSE, REFUSED HERE INSTEAD. Every mutation
  // schema in this file is strict, so an unrecognized member comes back as a 400 - except `__proto__`,
  // which the pinned validator ACCEPTS and silently drops at every nesting level. QA testing submitted
  // it to the two body-parsing entrypoints and confirmed both halves: admitted, and `Object.prototype`
  // unmodified afterwards. The measurements, the reason the walk is deep and iterative, and the reason it
  // is PREDICATE-SHAPED rather than path-returning are all recorded on `./errorMapper.js`; this closes the
  // same inconsistency here, and is defence in depth against a future merge-style consumer.
  //
  // THE REFUSAL PUBLISHES A FROZEN CONSTANT, NOT A LOCATION. `PROTOTYPE_MEMBER_FIELD_ISSUE` names the
  // offending key itself - a literal of that module, and the only name involved the caller did not
  // choose - because a security review found (MAJOR, CWE-209/CWE-532) that reporting the key's dotted
  // ancestor path let a caller choose what reached a 400 body and the log stream.
  if (containsPrototypeMemberKey(parsed)) {
    return {
      decoded: false,
      reason: 'unusableRequestInput',
      fields: [PROTOTYPE_MEMBER_FIELD_ISSUE],
    };
  }

  return { decoded: true, document: parsed };
}

// ---------------------------------------------------------------------------
// A ported save rule that failed
// ---------------------------------------------------------------------------

/**
 * The entity error register `HibachiTransient` published and the three ported saves reproduce.
 *
 * Structural, and derived from nothing: it is the shape the entities publish, and this file names only
 * the two members it reads. Declaring it structurally rather than importing the entity keeps the same
 * no-domain-import discipline every other type in this module follows.
 */
interface CatalogErrorRegister {
  hasErrors(): boolean;
  getErrors(): Readonly<Record<string, readonly string[]>>;
}

/**
 * The at-most-{@link MAXIMUM_PUBLISHED_SAVE_ISSUES} field issues one failed save publishes, or nothing.
 *
 * ★★★ THIS IS WHY A FAILED SAVE IS A 400 RATHER THAN A 200 OR A THROW. The three ported saves do NOT
 * throw for a failed save-context rule: the legacy `HibachiService.save`
 * [org/Hibachi/HibachiService.cfc:L151-L167] RETURNS THE SAME ENTITY whether it validated or not,
 * leaving its errors on the entity, and `src/services/productService.ts` records that its two throwing
 * classes were REMOVED for exactly that reason. So the service's contract is a returned entity, and
 * deciding a status from a returned value is transport work - which is this function.
 *
 * ★★ EVERYTHING PUBLISHED IS SERVER-AUTHORED, AND THAT IS CHECKABLE RATHER THAN ASSERTED.
 * `getErrors()` is keyed by PROPERTY IDENTIFIER - a name declared in `model/validation/*.json` and
 * ported into the services, so a literal of this subtree's own source - and its values are the RULE
 * messages. `ProductSaveContextError` states the invariant in terms: "The rule that failed. Never the
 * value that failed it." That is precisely what `MappedFieldIssue` requires, whose own invariant admits
 * only a literal of this subtree or a schema-authored path.
 *
 * ★ BOUNDED, on the same terms `./errorMapper.js` bounds a validator's issues. A register keyed by
 * property cannot be large in practice, but the bound is stated rather than assumed, and the messages
 * for one property are joined rather than emitted as separate issues so one property yields one issue.
 *
 * @returns the issues to publish, or `undefined` when the entity validated.
 */
function failedSaveIssues(entity: CatalogErrorRegister): readonly MappedFieldIssue[] | undefined {
  if (!entity.hasErrors()) {
    return undefined;
  }

  const issues: MappedFieldIssue[] = [];

  for (const [propertyIdentifier, messages] of Object.entries(entity.getErrors())) {
    if (issues.length >= MAXIMUM_PUBLISHED_SAVE_ISSUES) {
      break;
    }

    issues.push(
      Object.freeze({
        path: propertyIdentifier,
        message: messages.join('; '),
      }),
    );
  }

  return issues;
}

/**
 * How many failed-rule issues one refusal publishes.
 *
 * JUDGMENT CALL: a target-chosen bound on RESPONSE SIZE, matching the discipline `./errorMapper.js`
 * applies to a validator's issue list. It is not a target, a quota, a rate or a capacity figure and
 * carries no time dimension. Nothing is truncated silently in a way that changes an outcome: the
 * request is refused whole either way, and a caller that corrects the reported properties learns about
 * any remainder on its next attempt - which is what the validator's own bound already does.
 */
const MAXIMUM_PUBLISHED_SAVE_ISSUES = 20;

// ---------------------------------------------------------------------------
// The exported surface
// ---------------------------------------------------------------------------

/**
 * What this handler may be built over, for a suite that needs to drive it without a database.
 *
 * Both members are optional and both default to the production wiring, so the exported `handler` needs
 * no arguments. They exist because AAP 0.6.6 requires this tier to be tested and the coverage is
 * NET-NEW: a suite supplies a composition root built over a fake statement executor and a logger built
 * over a collecting sink, and it does so WITHOUT patching module state, replacing a global or
 * monkey-patching an import.
 *
 * `exactOptionalPropertyTypes` is on, so each member spells `| undefined` rather than relying on the
 * `?` alone - a caller assembling this object from optional values may pass an explicit `undefined`.
 */
export interface CatalogQueryHandlerDependencies {
  /**
   * Resolve the wired composition root. Defaults to `bootstrapCompositionRoot` with no overrides,
   * which is memoized per container, so a warm invocation reuses the graph and its connection pool
   * rather than assembling a second one.
   *
   * This handler NEVER constructs a service, a repository, a port or a pool of its own; it asks this
   * function for the root and asks the root for one request scope.
   */
  readonly compositionRoot?: (() => Promise<CompositionRoot>) | undefined;

  /**
   * Where structured lines are emitted. Defaults to the process logger, which writes JSON to stdout
   * for the platform to collect. It is passed on to `./errorMapper.js` so that a mapped failure is
   * emitted through the same sink as a served request.
   */
  readonly logger?: Logger | undefined;
}

/**
 * The shape this module's Lambda entrypoint takes.
 *
 * Two parameters rather than the runtime's three: the callback form is not used, because an `async`
 * handler returns its result. It remains assignable to `APIGatewayProxyHandler`, and the exported
 * `handler` is annotated with that type so the entry-point claim is checked by the compiler rather
 * than asserted in a comment.
 */
export type CatalogQueryLambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult>;

// ★ THE LOCAL CORRELATION READER THAT USED TO SIT HERE IS GONE. It implemented the
// invocation-then-gateway-then-placeholder precedence for this handler alone, and observability
// review (finding F8) found the five entrypoints had each implemented their own - one of them the
// other way round. The policy now lives once, in `./errorMapper.js` as `resolveServerRequestId`,
// beside the envelope that echoes it. Its precedence is the one this reader used; only the
// substituted literal differs, and that literal is now `./errorMapper.js`'s to name.

/**
 * The operation the request names, from whichever query-string map carries it.
 *
 * The single-valued map is consulted first because it is what API Gateway always populates; the
 * multi-value map is the fallback for an event that carries only that one. Blank is treated as absent,
 * so `?operation=` is a missing selector rather than an unrecognized one.
 */
function readNamedOperation(event: APIGatewayProxyEvent): string | undefined {
  const single = event.queryStringParameters;
  if (single !== null) {
    const named = single[OPERATION_PARAMETER];
    if (named !== undefined && named.trim().length > 0) {
      return named.trim();
    }
  }

  const repeated = event.multiValueQueryStringParameters;
  if (repeated !== null) {
    const values = repeated[OPERATION_PARAMETER];
    if (values !== undefined) {
      for (const value of values) {
        if (value.trim().length > 0) {
          return value.trim();
        }
      }
    }
  }

  return undefined;
}

/**
 * Build a catalog-query Lambda entrypoint.
 *
 * THE ORDER OF WORK, and every step of it is transport work:
 *
 *   1. ADMISSION. `./router.js` decides whether this method and path belong to THIS capability, and a
 *      miss returns the ready response it built - no status, header set or envelope is derived here.
 *      The action carried on the matched descriptor is then checked against the one this file
 *      implements, and the caller is then required to be IDENTIFIED and ADMINISTRATIVE.
 *   2. THE OPERATION SELECTOR, bounded at one per invocation and refused rather than truncated.
 *   3. THE METHOD THE NAMED OPERATION IS SERVED ON. The route admits `GET,POST`; an operation answers
 *      to one of them, and the router cannot check that because the operation is not part of the path.
 *      Asked BEFORE the body is read, so a `GET` naming a mutation costs no parse.
 *   4. THE CLOSED PARAMETER SET, then - for a mutation only - the request body, then the schema, then
 *      the plan. A rejection at any of those is a deterministic refusal and is neither recorded nor
 *      replayed.
 *   5. THE COMMA-LIST FEASIBILITY BOUND, asked at admission so an over-wide identifier list is a 400
 *      naming the offending member rather than the generic 500 an escaped statement-builder throw
 *      would produce (finding F17). No idempotency guard sits at this step; the ledger that used to
 *      occupy it was withdrawn under finding F5, and the block where it stood records how AAP 0.6.5's
 *      three obligations are met for the nine mutations without it.
 *   6. ONE REQUEST SCOPE. Each entity argument is then bound by handing its identifier to one of the
 *      scope's read-only loaders, ONE ported service method is invoked, and the result is projected
 *      onto JSON. An identifier that names no row ends here as an `unresolved` outcome in a successful
 *      response, and a ported save-context rule that refused the payload ends here as a 400.
 *
 * Every thrown value from step 4 onward - a schema rejection, a service refusal such as the SKU batch
 * bound, a preserved legacy raise such as the unchecked option-group dereference at
 * [model/service/ProductService.cfc:L115], a repository failure - funnels through `./errorMapper.js`,
 * which is selective and never a pass-through: a driver error's text can embed a statement and its
 * bound parameters, so what reaches the response is a classification and never the failure itself.
 *
 * @param dependencies Optional test seams. Omit for production wiring.
 * @returns A handler holding NO per-request state of its own - only the resolved logger and the
 *          memoized composition-root accessor, both of which are read-only for the container's life.
 */
export function createCatalogQueryHandler(
  dependencies: CatalogQueryHandlerDependencies = {},
): CatalogQueryLambdaHandler {
  const resolveCompositionRoot =
    dependencies.compositionRoot ?? ((): Promise<CompositionRoot> => bootstrapCompositionRoot());
  const log = dependencies.logger ?? processLogger;

  // ★ NO LEDGER. The per-handler idempotency record that used to be created here is gone with the
  // mechanism it served - see the block where it was declared for why keying it on the raw caller key
  // alone was a defect (finding F5), and for how AAP 0.6.5's three obligations are met for the nine
  // mutations WITHOUT it. Nothing in this factory holds state that outlives an invocation.

  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const requestId = resolveServerRequestId(event, context);

    // ★★★ ONE MUTABLE CONTEXT, PROMOTED THE MOMENT A ROUTE IS RESOLVED, AND THAT IS FINDING F8's
    // FIX. This used to be two separate constants - an unrouted one built here and a routed one
    // built inside the `try` - and the `catch` at the bottom mapped through the UNROUTED one. So
    // every failure raised AFTER route resolution, which is every service failure this handler can
    // see, reached the log stream with no route on it: the one diagnostic that says which URL
    // surface was being served. The context is now a single binding that GAINS the route and is the
    // same object the catch reads.
    let mappingContext: ErrorMappingContext = { requestId, logger: log };

    try {
      // --- 1. Admission ---------------------------------------------------
      const resolution = resolveRouteForCapability(
        routeRequestFromEvent(event),
        OWNED_CAPABILITY,
        mappingContext,
      );

      if (!resolution.matched) {
        return resolution.response;
      }

      // From here on the diagnostic label is built ENTIRELY from the matched row's own frozen members
      // - its declared methods and its canonical path - and from NOTHING the caller sent. That
      // distinction is the reason `routeDiagnosticLabel` documents itself as safe to log: the router
      // matches the method with `listFindNoCase`, so `event.httpMethod` may differ from the table's
      // declaration in case and would put a caller-controlled string on the log line for no
      // diagnostic gain. Using the row instead means the label is one of a CLOSED set of five, so an
      // operator can group by it and a caller cannot influence it. It reaches the log stream only and
      // is never echoed into a response body; the shared helper is what makes all five entrypoints
      // label a route identically.
      mappingContext = {
        requestId,
        route: routeDiagnosticLabel(resolution.route.methods, resolution.route.path),
        logger: log,
      };

      if (resolution.route.action !== IMPLEMENTED_ACTION) {
        return routeNotFoundResponse(mappingContext);
      }

      // ★★ THE ADMISSION GATE, IN TWO STEPS: IDENTIFIED, THEN ADMINISTRATIVE. This route once served
      // every anonymous request, and security review recorded the exposure as CRITICAL
      // (CWE-306/CWE-862) together with the consequence it enabled (HIGH, CWE-200): `keyword` is
      // required-but-may-be-empty, so an empty keyword matches every row, while the ported catalog
      // statement intentionally preserves the legacy predicates and carries no
      // `activeFlag`/`publishedFlag` restriction. Inactive and unpublished rows were therefore
      // anonymously enumerable.
      //
      // ★★★ AUTHENTICATION ALONE DID NOT CLOSE IT (F45, CWE-862). QUOTE-THEN-REVISE: this block
      // ended "Authentication closes that enumeration at the route entrance without changing the
      // must-preserve result set." It does not. It closes it to ANONYMOUS callers and leaves it open
      // to every identified one - and the source opens NONE of these operations to a
      // non-administrator:
      //
      //   * `getUnusedProductOptions` and `getUnusedProductOptionGroups` are consumed at exactly two
      //     sites, `admin/views/entity/preprocessproduct_addoption.cfm:L60` and
      //     `admin/views/entity/preprocessproduct_addoptiongroup.cfm:L60` - both inside `admin/`,
      //     whose controllers declare `this.publicMethods=''`. They are administrative by
      //     construction, reached through `Product.getUnusedProductOptions()`
      //     [model/entity/Product.cfc:L635-L646].
      //   * `findProducts` stands in for `searchProductsByProductType`
      //     [model/dao/ProductDAO.cfc:L419-L437], which has NO CALLER ANYWHERE in the legacy tree,
      //     so there is no public antecedent to preserve - and its statement is the one that carries
      //     no `activeFlag`/`publishedFlag` predicate. The only surface the legacy DOES publish
      //     publicly is the product FEED, which applies four filters of its own
      //     [integrationServices/google/controllers/feed.cfc:L68-L72].
      //   * `getFormattedOptionGroups` and `getOptionsForSelect` are the option-editing reads the two
      //     admin views above are built out of [model/service/ProductService.cfc:L70],
      //     [model/service/OptionService.cfc:L55] - the same `admin/` subsystem, the same
      //     `this.publicMethods=''`.
      //   * ★★ THE NINE MUTATIONS SETTLE THE QUESTION RATHER THAN REOPENING IT. Saving a product,
      //     saving a product type, saving a brand, deleting a product, repricing every SKU on a product
      //     and rebuilding a product's SKU set are administrative by any reading, and every one of them
      //     is reached in the legacy through `admin/` alone. Publishing them therefore strengthens the
      //     conclusion this gate already drew; it does not require the gate to change, and the gate did
      //     not change.
      //
      // So the claim is REQUIRED, which is this finding's first suggested resolution, and it changes
      // no result set: nothing about the statement, its predicates or its projection moves. Adding
      // `activeFlag`/`publishedFlag` to [model/dao/ProductDAO.cfc:L420-L427] would instead be a new
      // catalog filter, and AAP 0.6.7 permits no such divergence - which is precisely why the gate
      // has to sit at the ENTRANCE rather than in the query.
      //
      // ★ WHY ALL OF THEM AND NOT A SPLIT. The finding offers "or split truly public reads from admin
      // operations". There is no truly public read among them to split off: two are
      // admin-view-only and the third has no caller and no filters. A split would therefore have to
      // INVENT a public capability the source does not publish.
      //
      // THE TWO REFUSALS ARE DISTINCT AND BOTH ARE FIXED RESPONSES from `./errorMapper.js`, whose
      // published sentences are identical and whose statuses differ - 401 for no identity, 403 for an
      // insufficient one. Neither body names the claim, the operation or the principal, so an
      // attacker learns which of the two occurred and nothing else. Both precede the selector,
      // parameter closure, schema and graph construction, so a refused request costs no parse, no
      // connection and no statement; and a path this capability does not own remains a 404 rather
      // than a revealing 401.
      const principalResolution = resolveRequestPrincipal(event);
      if (!principalResolution.identified) {
        // The reason is a closed literal from `./errorMapper.js`, carried in the message rather than
        // widening the logger's default-deny context allow-list. No claim name or caller text appears.
        log.warn(`catalog query refused: no caller principal (${principalResolution.reason})`, {
          requestId,
          route: mappingContext.route,
        });

        return unauthenticatedResponse(mappingContext);
      }

      if (!principalResolution.principal.adminAccountFlag) {
        // NO ACCOUNT IDENTIFIER AND NO CLAIM NAME ON THE LOG LINE. The refusal is worth counting and
        // the identity is not worth recording here: `accountID` would put a caller-supplied value in
        // the log stream for no diagnostic gain, and the claim name is already a published constant.
        log.warn('catalog query refused: the caller principal carries no administrative claim', {
          requestId,
          route: mappingContext.route,
        });

        return forbiddenResponse(mappingContext);
      }

      // --- 2. The operation selector, bounded at one ----------------------
      if (countSuppliedOperations(event) > MAXIMUM_OPERATIONS_PER_INVOCATION) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          TOO_MANY_OPERATIONS_ISSUE,
        ]);
      }

      const named = readNamedOperation(event);
      if (named === undefined) {
        return invalidRequestResponse('missingQueryParameter', mappingContext, [
          MISSING_OPERATION_ISSUE,
        ]);
      }

      const operation = recognizeOperation(named);
      if (operation === undefined) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNKNOWN_OPERATION_ISSUE,
        ]);
      }

      // --- 3. The method the named operation is served on -----------------
      // ★★★ THE ROUTE ADMITS `GET,POST` AND AN OPERATION ANSWERS TO ONE OF THEM. The router matched the
      // method against the row's comma list, which is all it can do: the operation is not part of the
      // path, so only this file knows that `saveProduct` is a write and `findProducts` is not. Checked
      // with `listFindNoCase` over a single-member list - the SAME primitive and the same case-folding
      // the router applies [Application.cfc:L133] - so a lower-case `post` is admitted here exactly as
      // it is admitted there, and the two cannot disagree about what a method name means.
      //
      // ASKED BEFORE THE BODY IS READ AND BEFORE ANY SCHEMA RUNS, so a `GET` naming a mutation costs no
      // parse, and a `POST` naming a read is refused without its body being decoded.
      if (listFindNoCase(CATALOG_OPERATION_TRANSPORT[operation].method, event.httpMethod) === 0) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          OPERATION_METHOD_MISMATCH_ISSUE,
        ]);
      }

      // --- 4. The closed parameter set, then the body, then the schema, then the plan ----
      const parameters = readOperationParameters(event);
      if (!hasClosedParameterSet(operation, parameters)) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [
          UNPUBLISHED_PARAMETER_ISSUE,
        ]);
      }

      // A READ CARRIES NO BODY AND NONE IS READ FOR ONE. `document` stays `undefined` on the five read
      // arms, which is what `planInvocation` documents: those arms never touch it, and a body sent with a
      // read is ignored rather than refused, because refusing it would invent a rule the source has no
      // counterpart for and no read schema could describe.
      let document: object | undefined;

      if (CATALOG_OPERATION_TRANSPORT[operation].method === 'POST') {
        const reading = readRequestDocument(event);

        if (!reading.decoded) {
          return invalidRequestResponse(reading.reason, mappingContext, reading.fields);
        }

        document = reading.document;
      }

      const invocation = planInvocation(operation, parameters, document);

      // --- 5. The comma-list feasibility bound ---------------------------
      // ★★★ ASKED HERE SO THE ANSWER IS A CLIENT-SHAPED 400 NAMING THE FIELD. Security review
      // (finding F17) established that a caller comma-list becomes one SQL predicate and one
      // placeholder PER ELEMENT. The statement builders now refuse above the protocol's own
      // ceiling - see `isPreparablePlaceholderCount` - but a refusal raised down there arrives
      // as an unrecognized throw and `./errorMapper.js` maps it to a GENERIC 500, which tells a
      // caller its request failed and nothing about why. Asked at admission, the same refusal is
      // a 400 carrying the offending member's path.
      //
      // THE BOUND IS THE PROTOCOL'S, NOT A POLICY: above it MySQL cannot prepare the statement
      // however it is sent, so this rejects nothing the legacy could have answered. No element is
      // trimmed, sorted, deduplicated, case-folded, reordered or dropped to fit.
      const overWideList = firstUnpreparableCommaList(invocation);
      if (overWideList !== undefined) {
        return invalidRequestResponse('unusableRequestInput', mappingContext, [overWideList]);
      }

      // --- 6. One scope, the entity binding, one ported service method, one projection -------
      {
        // The per-request scope factory, invoked EXACTLY ONCE per invocation. Everything reachable
        // from the returned scope was constructed for this request alone, which is what stops a warm
        // container carrying one request's state into another's.
        //
        // The authenticated account is carried into the scope even though no operation this capability
        // publishes consults it, so the scope cannot represent a logged-out caller after this route
        // admitted one.
        // The remaining omissions are deliberate:
        //   * `now` - omitted, so the scope reads the wall clock ONCE at construction and every date
        //     comparison in the request sees the same instant. Supplying one would substitute this
        //     file's clock for the scope's own policy.
        //   * `feedHost` - supplied only by `productFeedHandler`, which is the sole holder of the
        //     event a feed host is observed on. Passing one from here would mint an origin for a
        //     capability that renders no feed.
        const root = await resolveCompositionRoot();
        const scope = await root.createRequestScope({
          accountID: principalResolution.principal.accountID,
        });

        const served = await invokeCatalogOperation(scope, invocation);

        // The operation name travels in the MESSAGE. The structured context carries only keys the
        // logger's allow-list authorizes - a scalar under an unrecognized key is redacted, by design -
        // so `requestId`, `route` and `resultCount` are named here and nothing else is. No duration,
        // no rate and no size is measured or reported.
        log.info(`catalog query served: ${served.operation}`, {
          requestId,
          route: mappingContext.route,
          resultCount: countServedRecords(served),
        });

        return servedOrRefused(served, requestId, mappingContext);
      }
    } catch (thrown: unknown) {
      // THE ONE FUNNEL. The caught value is of genuinely unknown type and is passed nowhere: it goes
      // to `./errorMapper.js`, which narrows it by `instanceof` and by bounded property probes, and
      // publishes a classification rather than the value. Nothing is re-thrown, so a Lambda
      // invocation always answers with a response.
      // ★ THE ROUTED CONTEXT, not an unrouted one. `mappingContext` carries the route from the
      // moment resolution succeeded, so a service failure is logged against the URL surface that
      // was being served rather than against nothing (finding F8).
      return mapErrorToApiGatewayResponse(thrown, mappingContext);
    }
  };
}

/**
 * THE LAMBDA ENTRY POINT for the catalog-query capability.
 *
 * Created once, when the container loads this module, so the memoized composition graph and its
 * connection pool span the container's warm invocations. THAT IS THE ONLY STATE THAT SPANS THEM: no
 * response body, no caller-supplied key and no per-request value is retained between invocations
 * (finding F5). Annotated as `APIGatewayProxyHandler` so that "this module is a bundle entry point" is
 * a fact the compiler checks.
 */
export const handler: APIGatewayProxyHandler = createCatalogQueryHandler();
