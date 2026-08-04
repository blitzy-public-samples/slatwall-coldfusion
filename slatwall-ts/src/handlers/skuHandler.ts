/**
 * skuHandler — the AWS boundary for the extracted Catalog SKU surface.
 *
 * Authority: AAP 0.4.1.9 row 3 — "slatwall-ts/src/handlers/skuHandler.ts | CREATE |
 * model/service/SkuService.cfc | Exposes the SKU surface." The member surface is fixed by
 * AAP 0.4.2.2 (the nine declared members) and AAP 0.4.2.5 (the one synthesized member).
 *
 * WHAT THIS FILE IS
 * -----------------
 * Each member below narrows the proxy event, calls ONE service member, and shapes the outcome
 * through ./httpResponse (AAP 0.3.2, quoting AWS's own reference layout: "the handler responsible
 * only for translating AWS-specific input into domain calls"). There is no query, no combination
 * enumeration, no validation rule, no field mapping and no SQL anywhere in this file, because every
 * one of those belongs to a layer beneath it.
 *
 * It is a THIN, INJECTABLE FUNCTION OF THE SERVICE AND TWO COLLABORATORS: {@link createSkuHandler}
 * takes the SKU service, a product resolver and an authorisation resolver, and returns the nine
 * ROUTED operations. Nothing is constructed by {@link createSkuHandler}, nothing is resolved by name,
 * and everything above the LAMBDA ENTRY POINT section at the foot of this file is a pure function of what
 * it was handed — which is what makes it assertable with hand-written doubles, without a database, a
 * network call or an AWS runtime (AAP 0.7.3 S6).
 *
 * That entry section is the one place ../config/container's `getSkuSurfaceGraph` is reached, through a DEFERRED
 * CommonJS require evaluated on first invocation, because the bundle built from this file has to carry a
 * `handler` the runtime can address. It reaches the composition root's NARROW accessor
 * `getSkuSurfaceGraph` rather than the aggregate `getCatalogContainer`, because a review pass (PERF-01)
 * measured this artifact constructing the whole catalog graph on its first invocation; the accessor builds
 * and memoises only what this entry's own routes can reach. Both accessors live in the same module
 * (AAP §0.3.1's file inventory admits no separate surface modules), so what differs is WHAT is
 * constructed rather than which file is required; the section itself records the measurement. A native dynamic `import()` was measured to be unusable here and
 * the section itself records why. Module LOAD still touches no configuration and opens no pool; the
 * reasoning is recorded at the section itself. src/handlers/router.ts reaches the same composition root
 * for the aggregate surface.
 *
 * ⚠️ THE SERVICE FILE IS THE CONTRACT, NOT THE PLAN'S PROSE, AND FOR THIS FILE THE TWO DIVERGE
 * -------------------------------------------------------------------------------------------
 * Every signature this handler calls was read from ../services/SkuService rather than from a table,
 * and where AAP 0.4.2.2's target column and that file disagree, the file wins. Two of those
 * divergences are recorded below as judgments (a) and (b), and both were re-adjudicated by a code review:
 * in each case the legacy BODY, not the plan's target column, states the contract, and TR-1 is the rule
 * that resolves a loose legacy signature to its observed shape. Nothing here "corrects" the service (AAP
 * 0.8.2 Guideline 4) — the service was corrected first, and this file follows it.
 *
 * NINE ROUTED MEMBERS OVER A TEN-MEMBER SERVICE, AND BOTH COUNTS ARE THE POINT
 * ---------------------------------------------------------------------------
 * model/service/SkuService.cfc declares NINE public functions across 334 lines, and the port adds
 * exactly one more that the legacy fabricated at run time (IR-1). The PARITY seam
 * {@link SkuSurface} is therefore ten members, because the parity check can only check what is
 * declared. The ROUTED surface {@link SkuHandler} is nine, because `newSku` has no legacy action
 * behind it and is consumed only from INSIDE `createSkus`' own combination engine. That is the same
 * adjudication ./brandHandler made for `newBrand`, reached the same way and for the same reason:
 * declared is not the same as routed, and publishing a factory for an unpersisted in-memory instance
 * would be an invented route (AAP 0.7.3 S9).
 *
 * ⛔ AND THE RESTRAINT STOPS THERE (AAP 0.4.2.5: "synthesis is not reproduced wholesale, only where
 * used"). There is deliberately no `countSku`, no `listSku`, no `exportSku`, no `processSku` and no
 * compound `getSkuByXxx` form, even though org/Hibachi/HibachiService.cfc:L255-L281 would have
 * fabricated every one of them on demand. The slice calls none of them, and adding one because the
 * dispatcher COULD have produced it is precisely the enhancement AAP 0.8.2 Guideline 4 forbids.
 *
 * ⭐ THE INJECTED SEAM IS NARROWER THAN THE PARITY SEAM, AND THAT GAP IS DELIBERATE
 * {@link createSkuHandler} does NOT receive {@link SkuSurface}. It receives
 * {@link RoutedSkuSurface} — the same ten-member projection with `createSkus` REMOVED — plus a
 * separate {@link ProductSkuCreationBoundary}. The parity count is unaffected, because `Omit` of a
 * projection is still a projection of the same service and {@link SkuSurface} remains declared and
 * checkable above. What the narrowing buys is that the one WRITING member cannot be called from a
 * route without first crossing a transaction boundary: the seam simply does not carry it. See
 * "THE WRITING BOUNDARY" below for why that had to be structural rather than conventional.
 *
 * EVERY ROUTED MEMBER IS AUTHORISED BEFORE IT DOES ANYTHING
 * --------------------------------------------------------
 * The legacy authorised every request in one place, before any controller method ran —
 * `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203], refusing at [:L188]. That gate is framework
 * code and does not cross the boundary (AAP 0.8.3.2), so its CONTRACT is declared as a port instead
 * and consulted here. Restoring it is PARITY, not invented policy; the only thing that changes is
 * the failure mode, from a browser redirect to a status code. {@link SKU_ACCESS_MATRIX} carries the
 * per-row evidence.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP 0.8.2 Guideline 6)
 * ----------------------------------------------------------------
 * Guideline 6 requires every technology-specific judgment to be documented where it is made. The
 * seven groups the file's own brief mandates are (a) to (g); (h) to (o) are the judgments this file
 * makes on its own account. Each is restated at the declaration or member that makes it.
 *
 * (a) TODO(parity) `getTransactionExistsFlag` DECLARES NO ARGUMENTS AND IS PASSED TWO, SO THE LEGACY IS
 *     ZERO-ARG AND EFFECTIVELY TWO-ARG AT ONCE. The declaration at
 *     model/service/SkuService.cfc:L285 is literally `public boolean function
 *     getTransactionExistsFlag()`, with no formal parameter of any kind, yet its body at [:L286]
 *     forwards `argumentCollection=arguments` to a DAO member that
 *     DOES declare two — `<cfargument name="productID" />` and `<cfargument name="skuID" />` at
 *     [model/dao/SkuDAO.cfc:L54-L55]. CFML permits a caller to pass named arguments a signature never
 *     declared, and BOTH real callers exploit exactly that:
 *
 *         model/entity/Sku.cfc:L594      -> getTransactionExistsFlag( skuID = this.getSkuID() )
 *         model/entity/Product.cfc:L626  -> getTransactionExistsFlag( productID = this.getProductID() )
 *
 *     ADJUDICATION. AAP §0.4.2.2's Discrepancy 4 records the DECLARATION accurately — "the service
 *     member takes no arguments while the underlying DAO member accepts optional productID and skuID" —
 *     and TR-1 is the rule that says what the port then declares: "Where a legacy signature is loose …
 *     the target signature is tightened to the OBSERVED contract." The observed contract is the one
 *     above, in which every call scopes the probe. ../services/SkuService therefore declares
 *     `(skuID?, productID?)`, and this handler binds both from the query string, optionally. That is
 *     also IR-1 applied to this member: the argument CFML passes implicitly becomes an explicit, typed
 *     declaration — here, on `SkuRepository.transactionExists(productID?, skuID?)` (AAP §0.4.2.6), and
 *     on the two entity checker contracts served by `createTransactionExistenceChecker` in
 *     ../adapters/mysql/MySqlSkuRepository.
 *
 *     ⚠️ A REVISION NARROWED THE SERVICE MEMBER TO ZERO PARAMETERS, NARROWED THIS ROUTE'S EVENT SLICE TO
 *     THE HEADERS ALONE, AND ANSWERED A PERMANENT NOT-IMPLEMENTED STATUS. Review finding F1 withdrew all
 *     three. The narrowing read Discrepancy 4 as freezing the SIGNATURE, when what it records is the
 *     DECLARATION; the effect was a public route that could never answer the scoped question its two
 *     legacy callers ask on every product and SKU delete. The two identifiers are restored, and the
 *     repository's refusal for an unscoped probe is forwarded rather than reclassified (IR-9). See
 *     {@link SkuHandler.getTransactionExistsFlag}.
 *
 *     ⛔ THE TWO ORDERS ARE NOT THE SAME AND ARE CROSSED EXACTLY ONCE. This route and the service are
 *     SKU-FIRST; the repository is PRODUCT-FIRST, because [model/dao/SkuDAO.cfc:L54-L55] declares
 *     `productID` first. The service body crosses them on one commented line; this file crosses nothing.
 *
 * (b) TODO(parity) `processImageUpload` ANSWERS THE IMAGE-WRITE BOOLEAN, BECAUSE THAT IS WHAT THE LEGACY
 *     BODY ANSWERS. The declaration at model/service/SkuService.cfc:L210 is `returntype="any"` — loose —
 *     and the body at [:L213-L217] settles it in the plainest possible way: `return true;` at [:L214],
 *     `return false;` at [:L216], and the entity never at all. TR-1 tightens a loose signature to the
 *     OBSERVED contract, so ../services/SkuService declares `Promise<boolean>` and this route publishes
 *     that verdict RAW. A revision typed the member `Promise<Sku>` on the reading that AAP §0.4.2.2's
 *     tabulated cell outranks TR-1; review finding F2 withdrew it, because a member answering a different
 *     KIND of value than the legacy body answers is not the interface-boundary preservation Goal B asks
 *     for. The service's own block carries the adjudication.
 *
 *     ⚠️ THE LEGACY BODY DOES DEPART FROM ITS OWN FRAMEWORK'S CONVENTION — [org/Hibachi/HibachiService.cfc:L117]
 *     states that "all process methods should return an entity" — and that departure is the legacy's, not
 *     this port's. It is annotated by locator rather than repaired. The dispatcher that would enforce the
 *     convention cannot reach this member anyway: [org/Hibachi/HibachiService.cfc:L114] composes
 *     `processSku_imageUpload`, a name the component does not declare.
 *
 *     THE LEGACY PARAMETER IS ALSO SPELLED WITH A CAPITAL S — `required any Sku` at [:L210], read back as
 *     `arguments.Sku` at [:L211] — which is CFML idiom rather than behavior; the service renamed it `sku`
 *     and this file uses the same spelling, which AAP 0.8.1 expressly permits ("It does not mean
 *     preserving CFML idioms in TypeScript").
 *
 * (c) TODO(parity) D4 — `getSkuStocksDeletableFlag` DELEGATES TO A DAO MEMBER THAT DOES NOT EXIST,
 *     AND THIS BOUNDARY REPORTS THAT HONESTLY. model/service/SkuService.cfc:L281-L283 forwards to
 *     `getSkuDAO().getSkuStocksDeletableFlag(...)`, and that member is declared NOWHERE IN THE
 *     REPOSITORY — model/dao/SkuDAO.cfc declares six public members and none of them is it — so the
 *     only path that reaches it, `Sku.getStocksDeletableFlag()` at model/entity/Sku.cfc:L567-L572,
 *     has never been able to resolve. AAP 0.4.2.2 ports the member "as an explicit not-implemented
 *     boundary that documents the defect", and AAP 0.8.2 Guideline 4 names it specifically as one of
 *     the twenty-one items "a competent engineer would instinctively fix". It is not fixed. The route
 *     stays present and mounted (TR-5: "The member is never quietly dropped from the interface"), and
 *     no `true`, `false`, `null`, empty value or fabricated result is ever substituted on that path.
 *
 * (d) TODO(parity) D13 — THE INDEX-ZERO FAILURE IN THE TWO SORTING MEMBERS IS PRESERVED, NOT GUARDED.
 *     model/service/SkuService.cfc:L234-L238 and again [:L262-L266] compute
 *     `var index = arrayFind(sortedArray, skuID)` and then assign `sortedArrayReturn[index] = skus[i]`.
 *     `arrayFind` returns 0 on a miss and CFML arrays are ONE-BASED, so position 0 does not exist and
 *     the assignment throws. AAP 0.6.7.4 records why a miss is reachable rather than hypothetical:
 *     `getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172] returns ONLY option-bearing SKUs, so an
 *     option-less SKU in the collection is not in the sorted list and its lookup misses. This handler
 *     adds NO guard, NO skip, NO filter, NO fallback and NO retry: the failure travels out of the
 *     service and is shaped by {@link errorResponse} like any other. Repairing it here would make the
 *     port's output incomparable to the legacy's, which is the whole point of IR-9.
 *
 * (e) M6 — `createSkus` RECEIVES ITS `data` PAYLOAD UNRESHAPED, AND THIS IS THE HIGHEST-RISK LINE IN
 *     THE FILE. AAP 0.6.2 calls the validation read-back loop "the single most dangerous thing in the
 *     slice", and AAP 0.6.7.8 explains why the payload is part of it: the odometer at
 *     model/service/SkuService.cfc:L89-L122 enumerates option combinations in an order derived from
 *     `data.options`, and that order "determines both the generated SKU set and … the order in which
 *     uniqueness validation observes its siblings". Re-keying, sorting, normalising, trimming,
 *     defaulting or filtering the payload here would therefore change which SKUs get created WITH NO
 *     ERROR AND NO COMPILE FAILURE. The parsed body object is handed to the service exactly as
 *     ./httpResponse produced it. See {@link SkuHandler.createSkus}.
 *
 * (f) DISCREPANCY 6 — THE SINGULAR/PLURAL ASYMMETRY IS CARRIED, NOT HARMONISED.
 *     `searchSkusByProductType` declares a SINGULAR `productTypeID` at
 *     model/service/SkuService.cfc:L271 and again at [model/dao/SkuDAO.cfc:L130], while the product
 *     side of the same feature declares a PLURAL `productTypeIDs` at
 *     [model/dao/ProductDAO.cfc:L419]. The divergence is in the legacy source, AAP 0.4.2.6 records it
 *     as Discrepancy 6, and this file preserves it: the query parameter, the local binding and the
 *     argument passed to the service are all singular. Harmonising the two spellings would make the
 *     two surfaces look like one feature when the legacy treats them as two.
 *
 * (g) TR-5 — THE TWO BOUNDARY GAPS THIS FILE ROUTES OVER, NAMED RATHER THAN HIDDEN.
 *     `processImageUpload` is boundary-stubbed behind `ImagePathPort`: the image write at
 *     model/service/SkuService.cfc:L212 goes through `getService("imageService")`, which AAP 0.6.3.2
 *     calls the HIDDEN dependency — "resolved dynamically and NEVER declared as a property", so any
 *     dependency analysis based on component metadata misses it entirely. And `getProductSkus`'
 *     sorting path reaches an inventory-derived ordering through the repository. Neither port is
 *     imported here; both are the service's constructor parameters. This file names the gaps so a
 *     reader knows a 501 from either route is a declared boundary rather than a bug.
 *
 * (h) A REQUIRED LEGACY ARGUMENT IS REJECTED AT THE BOUNDARY; AN OPTIONAL ONE IS FORWARDED ABSENT.
 *     The two treatments are not an inconsistency — they are the legacy's own distinction, applied
 *     mechanically. CFML raises before a function body runs when a `required` argument is missing, so
 *     an absent input for `required any product` [:L58, :L220, :L246], `required boolean sorted`
 *     [:L220] or `required string skuID` [:L281] is answered here with a bad request and the service
 *     is never called. An argument the legacy declares WITHOUT `required` — `string skuCode` [:L289],
 *     `string term` and `string productTypeID` [:L271], `struct data` and `currentURL` [:L309] — is
 *     forwarded as absent, so whatever the legacy would have done with the omission still happens
 *     where the legacy does it. ../services/SkuService relies on exactly that for `getSkuBySkuCode`:
 *     "the DAO's own requirement is reproduced as an explicit failure at the point the legacy fails".
 *
 * (i) THE WIRE CARRIES IDENTIFIERS AND THREE SERVICE MEMBERS TAKE ENTITIES, SO A RESOLVER IS
 *     UNAVOIDABLE. Recorded at {@link ProductResolver}.
 *
 * (j) A SKU IS ADDRESSED BY ITS SKU CODE, BECAUSE THAT IS THE ONLY LOOKUP THE PORTED SURFACE HAS.
 *     Recorded at {@link SkuHandler.processImageUpload}.
 *
 * (k) EVERY SKU LEAVING THIS FILE IS PROJECTED, NEVER SERIALISED WHOLE. Recorded at
 *     {@link SkuResponse}.
 *
 * (l) THE SMART LIST FORWARDS ONLY THE KEYS THE LEGACY INTERPRETER RECOGNISES, AND INVENTS NO
 *     PAGINATION. Recorded at {@link readSmartListInput}.
 *
 * (m) A BOOLEAN ARRIVES AS TEXT, SO THE LEGACY'S BOOLEAN LITERALS ARE THE ACCEPTED SET. Recorded at
 *     {@link readCfmlBoolean}.
 *
 * (n) `createSkus` ALWAYS ANSWERS `true`, AND THAT IS REPORTED RATHER THAN REINTERPRETED. Recorded at
 *     {@link SkuHandler.createSkus}.
 *
 * (o) M5 — THE IMPLICIT REQUEST-END COMMIT BECOMES ONE EXPLICIT, INJECTED BOUNDARY AROUND EXACTLY ONE
 *     MEMBER. The legacy flushed the ORM session once per request and only when the session carried no
 *     errors [org/Hibachi/Hibachi.cfc:L455-L459]; a stateless invocation has no request-end hook, so
 *     AAP 0.6.6 M5 requires the boundary to be made explicit. It is drawn around `createSkus` alone —
 *     the file's only member that writes — and it is drawn around BOTH the product resolution and the
 *     service call, because AAP 0.6.2's read-back loop is only faithful if the read and the write share
 *     one connection. Recorded at {@link SkuWriteGraph}, {@link TransactionalWriteRunner} and
 *     {@link SkuHandler.createSkus}.
 *
 * TEST PROVENANCE: NET-NEW, IN FULL — NO PARITY WITH ANY LEGACY TEST IS CLAIMED OR IMPLIED
 * ---------------------------------------------------------------------------------------
 * AAP 0.6.5.2 is decisive and is stated here rather than softened, because AAP 0.8.3.7 exists to
 * answer precisely this question honestly: no `SkuServiceTest` exists anywhere under meta/tests/, no
 * `SkuTest` entity test exists, no `SkuDAOTest` exists, and there is no legacy controller test of any
 * kind. Everything about this file is therefore net-new coverage. AAP 0.4.1.12 defines no
 * test/handlers/ directory, so S6 manifests here as testability-by-design instead: every member is a
 * pure function of its arguments and its four injected collaborators, so a plain object literal is a
 * sufficient double — even for the write runner, whose contract a two-line pass-through satisfies —
 * which matters because the legacy repository vendors no mocking library at all and its suite boots the
 * whole FW/1 application (AAP 0.4.3.6).
 */

import type { CatalogContainer } from '../config/container';
import type { Sku } from '../domain/sku/Sku';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../config/container';
import type { ProductWithErrorState, SkuService } from '../services/SkuService';
import { collectSkuBatchErrors, skuBatchHasErrors } from '../services/SkuService';

/*
 * A TYPE-ONLY REFERENCE TO THE TRANSACTION BOUNDARY, AND THE ONE REASON IT IS HERE.
 *
 * The commit gate this file supplies must be the same shape `UnitOfWork.run` demands of its commit gate, and
 * the honest way to state "the same shape" is to have the compiler check it rather than to restate the
 * signature and hope. The guard below {@link TransactionalWriteRunner} does exactly that.
 *
 * ⛔ IT IS NOT A DEPENDENCY. The import is `import type`, so it is erased entirely: nothing in the
 * emitted bundle resolves src/adapters/mysql/UnitOfWork.ts, this file never constructs one, never calls
 * one, and never reaches src/config/database.ts through it — which is what keeps the boundary class's own
 * configuration-time failure modes out of this module. Nor is there a cycle: UnitOfWork imports no
 * handler.
 */
import type { UnitOfWork } from '../adapters/mysql/UnitOfWork';

/*
 * THE ONE ERROR CLASS THIS BOUNDARY CONSTRUCTS, AND IT IS NOT A CLASSIFICATION DECISION.
 *
 * {@link ValidationError} is raised where a request's own payload is refused. Every mapping from a
 * failure to a status and to a body belongs to ./httpResponse, and this file never chooses a status for a
 * failure directly.
 *
 * ⛔ NO `NotImplementedError` IS CONSTRUCTED HERE ANY MORE. A revision built one in
 * {@link SkuHandler.getTransactionExistsFlag} to present that route's then-permanent failure as a fixed
 * not-implemented status; review finding F1 restored the route's two optional identifiers, so there is no
 * permanent failure left to present and the class is not imported. Where a service member genuinely
 * cannot resolve — judgment (c)'s `getSkuStocksDeletableFlag`, defect D4 — the SERVICE raises it and this
 * boundary merely forwards, which is where that decision belongs.
 */
import { ValidationError } from '../errors/ValidationError';

import {
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  messageResponse,
  notFoundResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  readSmartListInput,
  resolveRequestAuthorization,
  toInvocationSecurityRequest,
  unauthorizedResponse,
  createActionDispatcher,
  HTTP_STATUS,
  type ActionRoute,
  type ActionRouteTable,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
  type CatalogAuthorizationEvent,
} from './httpResponse';
import type { ExactDecimal } from '../util/formatting';

/* ================================================================================================
 * REQUEST PARAMETER NAMES
 *
 * Every name below is a LEGACY name — an ORM property declaration or a declared argument — and none
 * is coined here. The ROUTE TEMPLATES that bind them belong to src/handlers/router.ts, which is why
 * no path, verb or route string appears anywhere in this file (AAP 0.7.3 S9).
 * ============================================================================================== */

/**
 * The path parameter carrying a product's primary identifier.
 *
 * `property name="productID" ormtype="string" length="32" fieldtype="id" generator="uuid"
 * unsavedvalue="" default="";` — [model/entity/Product.cfc:L52]. It is also the spelling
 * AAP 0.4.2.5 uses for the synthesized `productService.getProduct(productID: string)`.
 */
const PRODUCT_ID_PATH_PARAMETER = 'productID';

/**
 * The path parameter carrying a SKU's primary identifier.
 *
 * `property name="skuID" ormtype="string" length="32" fieldtype="id" generator="uuid"
 * unsavedvalue="" default="";` — [model/entity/Sku.cfc:L52]. It is also the argument name declared at
 * [model/service/SkuService.cfc:L281], which is the one member that consumes it.
 */
const SKU_ID_PATH_PARAMETER = 'skuID';

/**
 * The path parameter carrying a SKU's code.
 *
 * `property name="skuCode" ormtype="string" unique="true" length="50";` —
 * [model/entity/Sku.cfc:L54]. The `unique="true"` attribute is load-bearing rather than decorative:
 * it is why a SKU code addresses at most one row, which is what makes judgment (j) sound. It is also
 * the argument name declared at [model/service/SkuService.cfc:L289].
 */
const SKU_CODE_PATH_PARAMETER = 'skuCode';

/**
 * The query parameter carrying the sorting flag.
 *
 * `required boolean sorted` — [model/service/SkuService.cfc:L220]. REQUIRED, per AAP 0.4.2.2
 * Discrepancy 2, which is why {@link SkuHandler.getProductSkus} rejects its absence instead of
 * defaulting it.
 */
const SORTED_QUERY_PARAMETER = 'sorted';

/**
 * The query parameter carrying the eager-fetch flag.
 *
 * `boolean fetchOptions=false` — [model/service/SkuService.cfc:L220]. The DEFAULT LIVES ON THE
 * SERVICE, and this file never restates it: when the parameter is absent the argument is omitted
 * entirely, so `false` continues to come from the one declaration that owns it.
 */
const FETCH_OPTIONS_QUERY_PARAMETER = 'fetchOptions';

/**
 * The query parameter carrying the search term.
 *
 * `string term` — [model/service/SkuService.cfc:L271], declared WITHOUT `required` (AAP 0.4.2.2
 * Discrepancy 3), so its absence is forwarded rather than rejected. See judgment (h).
 */
const TERM_QUERY_PARAMETER = 'term';

/**
 * The query parameter carrying the product-type identifier — SINGULAR, and deliberately so.
 *
 * `string productTypeID` — [model/service/SkuService.cfc:L271] and [model/dao/SkuDAO.cfc:L130], both
 * singular and both without `required`. The product-side twin is PLURAL
 * (`productTypeIDs` at [model/dao/ProductDAO.cfc:L419]); judgment (f) records why the asymmetry is
 * carried across rather than reconciled.
 */
const PRODUCT_TYPE_ID_QUERY_PARAMETER = 'productTypeID';

/**
 * The query parameter carrying the SKU identifier the transaction probe is scoped to.
 *
 * ⭐ IT IS A QUERY PARAMETER RATHER THAN A PATH PARAMETER BECAUSE IT IS OPTIONAL. The DAO declares it
 * `<cfargument name="skuID" />` with no `required` [model/dao/SkuDAO.cfc:L55], and the service forwards
 * whatever the caller named [model/service/SkuService.cfc:L286], so the probe may legitimately arrive
 * scoped to a SKU, scoped to a product, or scoped to neither — and a path segment cannot be absent.
 * The NAME is the legacy's own, taken from [model/entity/Sku.cfc:L594]'s `skuID=` keyword.
 *
 * ⚠️ THE `unsavedvalue` SENTINEL IS APPLIED HERE TOO, through {@link readTransactionScopeIdentifier}:
 * [model/entity/Sku.cfc:L52] declares `unsavedvalue=""`, so an empty identifier cannot address a
 * persisted row and is treated exactly as an absent one — the same rule
 * {@link readSkuIdentifier} applies to the path form.
 */
const SKU_ID_QUERY_PARAMETER = 'skuID';

/**
 * The query parameter carrying the product identifier the transaction probe is scoped to.
 *
 * Optional for the same reason as {@link SKU_ID_QUERY_PARAMETER} — `<cfargument name="productID" />` at
 * [model/dao/SkuDAO.cfc:L54] carries no `required` — and named after
 * [model/entity/Product.cfc:L626]'s `productID=` keyword. [model/entity/Product.cfc:L52] declares the
 * same `unsavedvalue=""`, so the same sentinel rule applies.
 */
const PRODUCT_ID_QUERY_PARAMETER = 'productID';

/**
 * The identifier value that means "this record has never been persisted".
 *
 * Not a placeholder chosen here: `unsavedvalue=""` together with `default=""` is declared verbatim on
 * BOTH primary keys this file reads — [model/entity/Product.cfc:L52] and [model/entity/Sku.cfc:L52] —
 * so one constant states the fact once rather than twice. A persisted row therefore never carries it,
 * which is why an empty inbound identifier cannot address a stored record and is treated exactly as an
 * absent one.
 *
 * ./httpResponse deliberately keeps "absent" and "empty" distinguishable ("Absent stays absent"),
 * precisely so a member for which an empty string is meaningful can still see it. For a primary
 * identifier the empty string IS meaningful and what it means is "unsaved", which is why the two cases
 * converge here rather than in the reader. Compared by equality rather than by measuring a length,
 * following the convention ./httpResponse sets: no numeric literal other than a status code appears in
 * this layer.
 */
const UNSAVED_IDENTIFIER = '';

/* ================================================================================================
 * ENTITY NAMES FOR THE AUTHORISATION GATE
 *
 * ⭐ BOTH ARE MODULE CONSTANTS, NEVER REQUEST VALUES, AND THAT IS THE POINT.
 * `EntityAuthorizationPort` declares `entityName` as an unconstrained `string` because the legacy
 * declares it `required string` and enumerates nothing — the type is closed BY THE CALLER rather than
 * by the port. This is that closure: every authorisation question this file asks names one of exactly
 * two compile-time constants, so no value from a request can ever reach that member.
 *
 * ⚠️ TWO NAMES RATHER THAN ONE, WHICH IS A DIFFERENCE FROM ./brandHandler AND ./optionHandler AND IS
 * EVIDENCE-LED. Those two files each expose members reached through items named for a single entity,
 * so each declares one constant. Eight of this file's nine routed members are likewise reached through
 * Sku items — but `createSkus` is not: its only legacy call sites are inside
 * ProductService.saveProduct [model/service/ProductService.cfc:L279] and
 * ProductService.processProduct_addOption [:L150], both of which are PRODUCT actions. The legacy
 * derives the entity name from the ITEM name by substring arithmetic
 * [org/Hibachi/HibachiAuthenticationService.cfc:L54, :L56, :L58, :L60, :L66, :L75], so a `saveProduct`
 * item asks about `Product`, not about `Sku`. Asking the wrong entity's question would silently
 * authorise SKU creation against SKU permissions the legacy never consulted.
 * ============================================================================================== */

/** The legacy CFML component name — `model/entity/Sku.cfc`. */
const SKU_ENTITY_NAME = 'Sku';

/** The legacy CFML component name — `model/entity/Product.cfc`. */
const PRODUCT_ENTITY_NAME = 'Product';

/**
 * The prefix every routed SKU action carries, so the resolver is told which action it is gating.
 *
 * ⭐ ADDED BY REVIEW FINDING SEC-AUTH-03. Concatenated with the routed member name it reproduces the
 * addresses {@link createSkuRoutes} declares — `sku.createSkus`, `sku.processImageUpload`.
 */
const SKU_ACTION_PREFIX = 'sku.';

/**
 * What the gate answers: either the refusal to return, or the authorised invocation context.
 *
 * ⭐ A DISCRIMINATED PAIR RATHER THAN `APIGatewayProxyResult | undefined` — review finding SEC-AUTH-03.
 * Returning the context is what lets the writing route hand the transaction boundary the principal this
 * gate approved, instead of leaving population and audit on whatever the composition root memoised.
 */
type SkuAuthorizationOutcome =
  | { readonly refusal: APIGatewayProxyResult; readonly authorization?: undefined }
  | { readonly refusal?: undefined; readonly authorization: RequestAuthorizationContext };

/* ================================================================================================
 * CFML BOOLEAN LITERALS
 *
 * G6 TRANSLATION DECISION (m). A query string carries text, and two legacy arguments are declared
 * `boolean` — `required boolean sorted` and `boolean fetchOptions=false`, both at
 * [model/service/SkuService.cfc:L220]. CFML would have coerced the inbound value itself, so the
 * coercion has to happen somewhere in the port, and the honest place is the boundary that receives the
 * text.
 *
 * THE ACCEPTED SET IS CFML'S OWN BOOLEAN LITERALS AND NOTHING MORE: `true`/`false`, `yes`/`no` and
 * `1`/`0`, matched without regard to case because CFML's comparisons are case-insensitive. CFML's
 * WIDER numeric coercion — where any non-zero number reads as true — is deliberately NOT reproduced,
 * for two reasons stated rather than assumed:
 *   - It is unreachable on every legacy path. The only caller of `getProductSkus` is
 *     `Product.getSkus(boolean sorted=false, boolean fetchOptions=false)`
 *     [model/entity/Product.cfc:L155-L159], which passes two already-typed CFML booleans. No legacy
 *     call site ever hands this member the string `"2"`.
 *   - Reproducing it would require parsing a number and comparing it against zero, and this file owns
 *     NO source-declared numeric constant — the only numbers permitted in it are HTTP status codes
 *     (AAP 0.7.3 S9).
 * A value outside the set is a bad request rather than a silent `false`, because silently reading an
 * unrecognised value as `false` would flip `sorted` for a caller that asked for sorting.
 *
 * Both sets are frozen readonly tuples so nothing can extend the accepted vocabulary at run time
 * (AAP 0.6.6 M7).
 * ============================================================================================== */

/** The values CFML reads as boolean true. */
const CFML_TRUE_LITERALS: readonly string[] = Object.freeze(['true', 'yes', '1']);

/** The values CFML reads as boolean false. */
const CFML_FALSE_LITERALS: readonly string[] = Object.freeze(['false', 'no', '0']);

/* ================================================================================================
 * THE SMART LIST DATA VOCABULARY — MOVED, NOT DELETED
 *
 * G6 TRANSLATION DECISION (l), part one. The recognition set `applyData`
 * [org/Hibachi/HibachiSmartList.cfc:L85-L136] walked — seven exact names and seven prefixes, each with
 * the branch that recognises it — now lives in ./httpResponse beside the other event readers and is
 * consumed here through its exported `readSmartListInput`. Every locator, the mutual-exclusivity
 * argument for the prefix test, and the "nothing is added, defaulted or normalised" statement are
 * carried verbatim at the new site.
 *
 * ⭐ WHY IT MOVED. It is ONE vocabulary, belonging to the legacy interpreter rather than to either
 * boundary, and TWO routed members receive that struct: `getSkuSmartList`
 * [model/service/SkuService.cfc:L309] here, and `getProductSmartList`
 * [model/service/ProductService.cfc:L342] on ./productHandler. A second private copy could drift from
 * this one, and a drifted copy does not fail loudly — it silently stops forwarding a key the smart
 * list would have acted on, or starts forwarding one it would have ignored. Declaring it once is the
 * same reasoning that put `readBoundedReadWindow` in ./httpResponse.
 * ============================================================================================== */

/* ================================================================================================
 * BAD-REQUEST TEXTS
 *
 * Each names the input it is about and nothing else — no route, no identifier, no collaborator, no
 * internal detail — following the disclosure rules ./httpResponse sets for this layer. They are
 * module-private because the legacy system has no counterpart for any of them, so none carries a
 * parity obligation: assert on the status code, never on these strings.
 *
 * Each is composed from the parameter-name constant above rather than repeating the literal, so a text
 * cannot drift away from the name it describes.
 * ============================================================================================== */

const PRODUCT_ID_REQUIRED_MESSAGE = `A "${PRODUCT_ID_PATH_PARAMETER}" path parameter is required`;

const SKU_ID_REQUIRED_MESSAGE = `A "${SKU_ID_PATH_PARAMETER}" path parameter is required`;

/*
 * ⚠️ USED BY EXACTLY ONE MEMBER, AND NOT BY THE OTHER THAT READS THE SAME PARAMETER.
 * {@link SkuHandler.processImageUpload} refuses an unaddressed code with this text, because its SERVICE
 * contract takes `required any Sku` [model/service/SkuService.cfc:L210] — an ENTITY this boundary must
 * resolve before it can call. {@link SkuHandler.getSkuBySkuCode} does NOT, because there the code IS the
 * argument and [:L289] declares it WITHOUT `required`, so judgment (h) forwards the absence. A revision
 * used it in both places; review finding F5 withdrew the second use.
 */
const SKU_CODE_REQUIRED_MESSAGE = `A "${SKU_CODE_PATH_PARAMETER}" path parameter is required`;

const SORTED_REQUIRED_MESSAGE = `A "${SORTED_QUERY_PARAMETER}" query parameter is required`;

const SORTED_NOT_BOOLEAN_MESSAGE = `The "${SORTED_QUERY_PARAMETER}" query parameter must be a boolean`;

const FETCH_OPTIONS_NOT_BOOLEAN_MESSAGE = `The "${FETCH_OPTIONS_QUERY_PARAMETER}" query parameter must be a boolean`;

/* ================================================================================================
 * THE INJECTION SEAMS
 * ============================================================================================== */

/**
 * The SKU-service surface this handler consumes — the injection seam, and the parity check itself.
 *
 * TEN MEMBERS: the NINE declared in model/service/SkuService.cfc plus the ONE the legacy fabricated.
 * TR-1 governs every one of them — "Preserve the public method name, arity and argument order of every
 * in-scope service member" — and AAP 0.8.3.1 states why that is written as something a compiler
 * checks: "so interface parity is checkable method-by-method".
 *
 * ⭐ IT IS A `Pick` OF THE REAL CLASS, NOT A HAND-COPIED INTERFACE, AND THAT IS THE STRONGEST FORM OF
 * THE PARITY CHECK AVAILABLE. A restated interface can drift from the service it describes and would
 * need a separate assignability guard to catch it; a projection of the class CANNOT drift, because it
 * has no independent declaration to drift from. Rename an argument, add one, reorder two or change a
 * return type in ../services/SkuService and every call site in this file stops compiling immediately.
 * The same technique ./optionHandler uses for `OptionSurface`, chosen here for the same reason and
 * spelled the same way so the pattern is recognisable across the folder.
 *
 * ⭐ AND IT IS WHAT MAKES THE NET-NEW COVERAGE PRACTICAL (S6). `SkuService` holds TEN private readonly
 * collaborators, so its type is nominal and no object literal can stand in for the class itself.
 * `Pick` drops the private state and keeps the ten public members, so a test drives this handler from
 * a ten-member literal — no repository, no query port, no validator, no database, no network call and
 * no AWS runtime. No cast is used to achieve that, here or in any consumer: the narrowing IS the type,
 * not a bypass of it. The legacy repository vendors no mocking library at all (AAP 0.4.3.6), which is
 * exactly the gap the ports were introduced to close.
 *
 * THE TEN MEMBERS, WITH THE SOURCE LOCATOR AND THE CARRIED FINDING FOR EACH:
 *   createSkus                [:L58]  the combination engine; `data` unreshaped — judgment (e), M6
 *   processImageUpload        [:L210] answers the image-write BOOLEAN, as [:L213-L217] does — judgment (b)
 *   getProductSkus            [:L220] `sorted` REQUIRED — Discrepancy 2; carries D13
 *   getSortedProductSkus      [:L246] carries D13
 *   searchSkusByProductType   [:L271] BOTH arguments optional — Discrepancy 3; SINGULAR — judgment (f)
 *   getSkuStocksDeletableFlag [:L281] delegates to an absent DAO member — judgment (c), D4
 *   getTransactionExistsFlag  [:L285] ZERO declared, TWO observed, TWO ported — judgment (a)
 *   getSkuBySkuCode           [:L289] optional argument, `null` on a miss
 *   getSkuSmartList           [:L309] entity, three joins, five keyword properties
 *   newSku                    no legacy declaration at all — IR-1; DECLARED HERE, NOT ROUTED
 *
 * `newSku` earns its place in this list even though {@link SkuHandler} does not publish it: IR-1
 * requires every runtime-synthesized member the slice actually calls to become "an explicitly declared,
 * typed method", the legacy calls it five times inside this very component
 * [model/service/SkuService.cfc:L92, :L127, :L154, :L182, :L192], and including it here is what proves
 * the ported service still declares it. Membership of this seam is a parity statement; membership of
 * {@link SkuHandler} is a routing statement. The two are deliberately different.
 */
export type SkuSurface = Pick<
  SkuService,
  | 'createSkus'
  | 'processImageUpload'
  | 'getProductSkus'
  | 'getSortedProductSkus'
  | 'searchSkusByProductType'
  | 'getSkuStocksDeletableFlag'
  | 'getTransactionExistsFlag'
  | 'getSkuBySkuCode'
  | 'getSkuSmartList'
  | 'newSku'
>;

/**
 * What {@link createSkuHandler} is actually GIVEN: the parity seam minus the writing member.
 *
 * ⭐ THE OMISSION IS THE ENFORCEMENT, AND IT IS THE POINT. `createSkus` is the file's only writing
 * member, and it must run inside a transaction whose scope also built the product read it depends on —
 * see {@link ProductSkuCreationBoundary} for why. While the factory was handed a seam that DECLARED
 * `createSkus`, the untransacted call was one line away and nothing but prose discouraged it; the review
 * that prompted this change found exactly that call in place. Dropping the member from what the factory
 * receives makes the mistake a type error instead of a habit.
 *
 * ⛔ AND IT DOES NOT WEAKEN THE PARITY STATEMENT. {@link SkuSurface} still names all ten members and is
 * still a `Pick` of the real class, so a rename, an added argument or a changed return type in
 * ../services/SkuService still breaks this file immediately. `Omit` of a projection is still a projection:
 * it has no independent declaration to drift from. The two counts stay distinct exactly as this file's
 * header says — ten DECLARED for parity, nine ROUTED, and now nine INJECTED because the tenth is reached
 * through the boundary that owns its transaction rather than through this seam.
 */
export type RoutedSkuSurface = Omit<SkuSurface, 'createSkus'>;

/**
 * Resolves an addressed product identifier into the product entity three service members require.
 *
 * G6 TRANSLATION DECISION (i) — THE WIRE CARRIES AN IDENTIFIER AND THE CONTRACT DEMANDS AN ENTITY, SO
 * A BRIDGE IS UNAVOIDABLE. `createSkus(required any product, …)` [model/service/SkuService.cfc:L58],
 * `getProductSkus(required any product, …)` [:L220] and `getSortedProductSkus(required any product)`
 * [:L246] all take the PRODUCT ITSELF as their first argument, and TR-1 forbids replacing it with an
 * identifier. An HTTP request, by contrast, can only carry the identifier. Something has to turn one
 * into the other, and there are exactly three candidates:
 *
 *   1. Import `ProductService` and call its synthesized `getProduct(productID)` (AAP 0.4.2.5).
 *      REJECTED: that module is not among this file's declared dependencies, and reaching for an
 *      import outside the declared set is precisely the failure mode the dependency discipline exists
 *      to prevent. It would also couple two handlers' service graphs together for no gain.
 *   2. Deserialise a product out of the request body. REJECTED: population is owned by the base
 *      collaborator's descriptor-driven step (../domain/base/populate) — a JSON object is a payload,
 *      not an entity — and a handler that built domain objects would stop being a boundary.
 *   3. Accept the resolution as an injected, typed function. CHOSEN.
 *
 * ⭐ IT IS A PARAMETER, NOT AN IMPORT, WHICH IS WHAT KEEPS S3 AND S4 INTACT. AAP 0.7.3 S3 requires
 * "Constructor injection only. No service locator, no dynamic method synthesis, no string-keyed runtime
 * resolution", and this is that: src/handlers/router.ts obtains the resolver from the composition root
 * and hands it over, exactly as it hands over the service. Nothing is constructed here and no
 * collaborator is named by string. It is also the same shape ./brandHandler's authorisation resolver
 * takes, so the folder has one idiom for "a capability this boundary needs and does not own".
 *
 * ⭐ `null` MEANS "NO SUCH PRODUCT" AND IS NOT AN EXCEPTION, mirroring the synthesized reader it stands
 * in for: the dispatcher's `get` branch [org/Hibachi/HibachiService.cfc:L258, handler at :L305-L328]
 * returns nothing when no row matches, and AAP 0.4.2.5 types it `Promise<Product | null>`. A miss is
 * therefore answered with a not-found response, never quietly upgraded into a creation and never
 * reported as a server fault.
 *
 * THE RESOLVED TYPE IS `ProductWithErrorState`, WHICH IS THE WIDER OF THE TWO SHAPES THE THREE MEMBERS
 * NEED. `createSkus` requires it, because its three branch preconditions land on the product's own
 * error bag exactly as [:L143], [:L148] and [:L176] put them there; the two read members declare the
 * plain `Product`, which `ProductWithErrorState` extends. One resolver therefore serves all three, and
 * typing it at the narrower shape would have made `createSkus` unreachable.
 */
export type ProductResolver = (productID: string) => Promise<ProductWithErrorState | null>;

/**
 * The transaction-scoped capabilities {@link SkuHandler.createSkus} runs against.
 *
 * ⭐ IT RESTATES `resolveProduct` AND `createSkus` RATHER THAN REUSING THE CAPTURED ONES, AND THAT
 * DUPLICATION IS THE ENTIRE POINT. A service holds its repository and a repository holds its executor from
 * construction, so the `skuService` and `resolveProduct` this handler captured are bound to the POOL.
 * Calling them inside an open transaction would run their statements on a DIFFERENT connection — the
 * writes would succeed, sit outside the unit being committed, and survive a roll-back. Nothing would
 * report a problem. The members here are the ones built FOR the transaction, and they are the only ones
 * the write path may touch.
 *
 * ⚠️ THE PRODUCT READ IS INSIDE THE TRANSACTION DELIBERATELY, NOT INCIDENTALLY. AAP §0.6.2 is explicit
 * that `Sku.hasUniqueOptions` is a validation rule that EXECUTES A QUERY against the sibling SKUs the same
 * operation is writing, and AAP §0.6.6 M6 names that read-back as the likeliest place for the port to
 * diverge silently. If the product and its existing SKUs were read on the pool while the new SKUs were
 * written in the transaction, the uniqueness rule would interrogate a sibling set that does not include
 * them, and the batch would validate against the wrong world. Reading the aggregate through the same
 * scope that writes it is what makes the rule observe what the legacy's ORM session showed it.
 */
export interface SkuWriteGraph {
  /** Loads the aggregate the batch mutates, through the transaction's own scope. */
  readonly resolveProduct: ProductResolver;

  /** The one write member this graph exists for — see {@link SkuSurface} for the full service surface. */
  readonly skuService: Pick<SkuSurface, 'createSkus'>;
}

/* ================================================================================================
 * COMPILE-TIME GUARDS — TWO PAIRINGS THAT A COMMENT COULD ONLY ASSERT
 * ================================================================================================ */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/*
 * The concrete service must satisfy the surface this boundary mounts. Without this, dropping or
 * renaming a member on `SkuService` would not be caught here — the boundary would simply mount a
 * narrower surface and the parity claim in the header would quietly stop being true.
 */
type _SkuServiceSatisfiesSkuSurface = AssertAssignable<SkuService, SkuSurface>;

/*
 * The write runner's commit gate must be EXACTLY what `UnitOfWork.run` demands of its own gate. The
 * runner is injected as a port, so nothing else in this module forces the two to agree; if the unit
 * of work ever changed the shape of its gate, every handler that supplies one would keep compiling
 * against the stale shape and the divergence would surface only at run time.
 */
type _WriteRunnerGateMatchesUnitOfWork = AssertAssignable<
  /* Index 2, not 1: `runWrite` takes the invocation's authorised security context FIRST as of review
   * finding SEC-AUTH-03, so the gate is the THIRD parameter. `UnitOfWork.run` is unchanged — it never saw
   * a principal and still does not — which is why only the left index moved. */
  Parameters<TransactionalWriteRunner<SkuWriteGraph>['runWrite']>[2],
  Parameters<UnitOfWork['run']>[1]
>;

/* ================================================================================================
 * THE WRITING BOUNDARY — ONE TRANSACTION PER SKU-CREATION INVOCATION (M5, M6)
 *
 * ⚠️ THIS SECTION EXISTS BECAUSE THE WRITING ROUTE PREVIOUSLY HAD NO TRANSACTION AT ALL. It resolved
 * the product through the injected resolver and then called `createSkus` on the injected service — two
 * collaborators the composition root had already bound to whatever executor it built them with. Nothing
 * in that arrangement made the product read, the sibling SKU inserts and the uniqueness read-back share
 * one connection, and nothing could roll a failed batch back as a unit. AAP 0.6.2 calls that read-back
 * "the single most dangerous thing in the slice" precisely because the divergence is silent: the wrong
 * arrangement compiles, runs, and produces a different set of SKUs with no error anywhere.
 *
 * ⭐ SO THE ROUTE NO LONGER HOLDS THE WRITING COLLABORATORS AT ALL. It is given ONE function,
 * {@link ProductSkuCreationBoundary}, and that function is the only way it can create anything. The
 * collaborators live inside the boundary, built from the transaction's own scope, so "every read and
 * write in this unit of work shares one executor" is a property of who holds what rather than of a
 * convention someone has to remember. The service seam this file is given is narrowed to match
 * ({@link RoutedSkuSurface}), which makes the old direct call unwritable rather than merely discouraged.
 *
 * ⛔ AND NO TRANSACTION VOCABULARY CROSSES INTO THIS LAYER. `src/adapters/mysql/**` is not among this
 * file's permitted dependencies, so the runner is declared here STRUCTURALLY and GENERICALLY over its
 * scope type: the real `UnitOfWork` satisfies it without this file importing it, naming it, or knowing
 * what an executor is. That is the same technique ../domain/sku/Sku uses for its boundary contracts, and
 * it is a scope rule rather than a preference (AAP 0.7.3 S4).
 * ============================================================================================== */

/**
 * The transaction runner this boundary needs, declared structurally so no adapter is imported.
 *
 * Mirrors `UnitOfWork.runScoped` exactly — the member that builds the collaborator graph FROM the
 * transaction scope, rather than wrapping a graph that was built elsewhere. The distinction is the whole
 * point: every repository in `src/adapters/mysql/**` takes its executor at construction, so a graph
 * captured from outside a boundary runs on a different connection than the boundary owns, and M6's
 * visibility guarantee silently does not hold.
 *
 * @typeParam TScope - The runner's scope type, left open so this file never names one. The real
 *   implementation supplies `TransactionScope`; a test supplies whatever its double hands out.
 */
export interface ScopedTransactionRunner<TScope> {
  runScoped<TGraph, TResult>(
    buildGraph: (scope: TScope) => TGraph,
    work: (graph: TGraph) => Promise<TResult>,
    reportErrors: (result: TResult) => boolean,
  ): Promise<TResult>;
}

/**
 * The two collaborators SKU creation needs, both bound to one transaction's scope.
 *
 * Deliberately the SMALLEST graph that can serve the route: the product read, and the one service member
 * that writes. Adding anything else here would widen what runs inside the transaction without a legacy
 * step calling for it.
 */
export interface SkuCreationGraph {
  /** Scope-bound product read — the same bridge {@link ProductResolver} describes, inside the boundary. */
  readonly resolveProduct: ProductResolver;
  /** Scope-bound writing service, narrowed to the single member the boundary invokes. */
  readonly skuService: Pick<SkuSurface, 'createSkus'>;
}

/**
 * What one SKU-creation transaction produced, and the object the M5 gate is asked about.
 *
 * ⚠️ THE PRODUCT IS CARRIED OUT OF THE BOUNDARY FOR ONE REASON ONLY: the gate. `[:L207]` returns an
 * unconditional `true` even after `[:L143]`, `[:L148]` and `[:L176]` have recorded findings ON THE
 * PRODUCT, so the boolean says nothing about whether the work should be kept and the product's own error
 * bag is the only thing that does. That is the same re-read `model/service/ProductService.cfc:L286-L288`
 * performs after SKU creation has had its chance to add findings.
 */
export interface SkuCreationOutcome {
  /** The resolved product, or `null` when no row matched the addressed identifier. */
  readonly product: ProductWithErrorState | null;
  /** The service's unconditional `true`, or `null` when no product was found and nothing was attempted. */
  readonly created: boolean | null;
}

/**
 * The route's only route to a write: one product identifier and one unreshaped payload in, one settled
 * transaction out.
 *
 * `null` means NO SUCH PRODUCT, exactly as {@link ProductResolver} does, and is answered with a not-found
 * response rather than upgraded into a creation. Anything else the boundary can do — a roll-back on
 * accumulated findings, the fallthrough throw at `[model/service/SkuService.cfc:L204]` — arrives as a
 * rejection and is shaped by {@link errorResponse}.
 */
export type ProductSkuCreationBoundary = (
  productID: string,
  data: Record<string, unknown>,
) => Promise<boolean | null>;

/**
 * Compose the writing boundary: one transaction per invocation, over collaborators built for it.
 *
 * ⭐ WHAT IS AND IS NOT DECIDED HERE. This function fixes the SEQUENCE and the GATE — resolve the
 * product, then create its SKUs, then keep the work only if NEITHER the product NOR any SKU it produced
 * carries a finding — because those are behaviour, ported from
 * `model/service/ProductService.cfc:L273-L288` and from the three branch preconditions
 * `SkuService.createSkus` records at `[:L143]`, `[:L148]` and `[:L176]`. "Still clean" means the whole
 * batch, not the product alone; the gate below carries the full reasoning and the withdrawal of the
 * narrower reading an earlier revision shipped. It fixes NOTHING
 * about which repositories exist or how they are constructed: `buildGraph` is supplied by the composition
 * root, which is the only layer that may name a concrete adapter (AAP 0.4.1.3).
 *
 * ⛔ THE ORDER OF THE TWO STEPS IS NOT AN IMPLEMENTATION DETAIL. The product must be resolved INSIDE the
 * boundary, not before it: resolving outside would put the read on a different connection from the
 * writes, which is the M6 divergence this whole section exists to remove.
 *
 * ⛔ A MISSING PRODUCT COMMITS AN EMPTY TRANSACTION RATHER THAN ROLLING BACK, and that is deliberate.
 * Nothing was written, so there is nothing to undo; reporting a roll-back would describe a failure that
 * did not occur, and raising would turn the legacy's "no such row" answer into a fault. The gate below
 * reads `false` on that path for exactly that reason.
 *
 * ⛔ NO RETRY, NO TIMEOUT, NO ISOLATION LEVEL AND NO BATCH LIMIT IS INTRODUCED (AAP 0.7.3 S9). The
 * settle sequence belongs entirely to the runner.
 *
 * @typeParam TScope - The runner's scope type; inferred, never named in this file.
 * @typeParam TGraph - The concrete graph the composition root builds. Constrained to
 *   {@link SkuCreationGraph} so the boundary can use it while the root stays free to build more.
 * @param runner - The transaction runner, structurally `UnitOfWork.runScoped`.
 * @param buildGraph - Builds the scope-bound collaborators. It MUST pass the scope's executor to every
 *   repository it constructs; that single obligation is what M6's visibility guarantee rests on.
 * @returns The boundary {@link createSkuHandler} requires.
 */
export function createProductSkuCreationBoundary<TScope, TGraph extends SkuCreationGraph>(
  runner: ScopedTransactionRunner<TScope>,
  buildGraph: (scope: TScope) => TGraph,
): ProductSkuCreationBoundary {
  return async (productID: string, data: Record<string, unknown>): Promise<boolean | null> => {
    const outcome = await runner.runScoped(
      buildGraph,
      async (graph): Promise<SkuCreationOutcome> => {
        const product = await graph.resolveProduct(productID);

        if (product === null) {
          return { product: null, created: null };
        }

        /* M6: the payload reaches the service unreshaped, and the call runs on the same executor the
         * read above used, so each insert is visible to the next SKU's uniqueness read (AAP 0.6.2). */
        return { product, created: await graph.skuService.createSkus(product, data) };
      },
      /*
       * The M5 gate — `model/service/ProductService.cfc:L286-L288` re-read, over the WHOLE batch.
       *
       * ⛔ THE COMPLETE PREDICATE, AND AN EARLIER REVISION OF THIS FACTORY GOT IT WRONG. This gate read
       * `settled.product.hasErrors()` and described itself as a re-read "on the product itself". That
       * withdrawn reading commits an invalid batch for the commonest failure there is. Per-SKU rule
       * findings deliberately never merge upward — `HibachiValidationService.validate(…, setErrors=true)`
       * writes the error bean back onto the entity it validated
       * [org/Hibachi/HibachiValidationService.cfc:L193] and never onto its parent — so a batch in which
       * every SKU failed its `skuCode` uniqueness rule leaves `product.hasErrors()` FALSE. Meanwhile
       * `createSkus` returns an unconditional `true` at [model/service/SkuService.cfc:L207], so neither
       * the product's bag nor the return value carries the failure. The SKUs do, and only
       * `skuBatchHasErrors` looks there.
       *
       * ⚠️ THE GROUND THE WITHDRAWN VERSION STOOD ON WAS REAL BUT NARROWER THAN IT CLAIMED.
       * `:L286-L288` does re-read the product, and the product's bag IS one of the two places a finding
       * can land — the three branch preconditions at [model/service/SkuService.cfc:L143], `[:L148]` and
       * `[:L176]` write there via `product.addError(…)`. `skuBatchHasErrors` checks the product FIRST for
       * exactly that reason, so nothing the old gate caught is lost; it adds the second place. What the
       * legacy actually gated on at request end was `getORMHasErrors()`, which saw the WHOLE ORM session
       * — every entity in the graph, not one of them (AAP §0.6.6 M5).
       *
       * ⚠️ AND THE SIBLING LIVE ROUTE IN THIS FILE ALREADY DID IT CORRECTLY, which is what made the
       * divergence a latent trap rather than a uniform behaviour: `createSkuHandler` gates on
       * `skuBatchHasErrors` and lifts `collectSkuBatchErrors` on the failure path, so the delivered
       * factory and the route it exists to serve disagreed about when to roll back. They now agree.
       */
      (settled: SkuCreationOutcome): boolean =>
        settled.product !== null && skuBatchHasErrors(settled.product),
    );

    return outcome.created;
  };
}

/* ================================================================================================
 * EVENT SLICES
 *
 * Each member declares only the part of the proxy event it actually reads, following the convention
 * ./httpResponse establishes for its own readers. Two properties follow, and both are deliberate: a
 * full proxy event satisfies every one of these types, so src/handlers/router.ts passes it straight
 * through unchanged; and a test constructs a one-member or two-member literal instead of fabricating an
 * entire AWS event, which is how S6 manifests in a folder for which AAP 0.4.1.12 defines no test
 * directory.
 *
 * The slices also make each member's request contract legible in the type system rather than only in
 * prose: two members read a body, five read a path parameter, three read the query string, and one
 * reads neither a path parameter nor a body.
 *
 * ⚠️ EVERY SLICE ALSO CARRIES `headers`, AND NO MEMBER READS IT. It is present for one reason only —
 * the injected authorisation resolver is given the event, and a function parameter is contravariant, so
 * each member's own slice has to be assignable to what the resolver accepts. The reasoning, and the
 * reason `headers` rather than another container was chosen, is recorded once at
 * {@link SkuAuthorizationEvent} and is not repeated on the slices below.
 * ============================================================================================== */

/**
 * The slice {@link SkuHandler.createSkus} reads: the product identifier from the path and the `data`
 * payload from the body.
 */
export type CreateSkusEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.processImageUpload} reads: the SKU code from the path and the
 * `imageUploadResult` payload from the body.
 */
export type ProcessImageUploadEvent = Pick<
  APIGatewayProxyEvent,
  'body' | 'pathParameters' | 'headers'
>;

/**
 * The slice {@link SkuHandler.getProductSkus} reads: the product identifier from the path and the two
 * boolean flags from the query string.
 */
export type ProductSkusEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters' | 'headers'
>;

/**
 * The slice {@link SkuHandler.getSortedProductSkus} reads: the product identifier from the path.
 */
export type SortedProductSkusEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.searchSkusByProductType} reads: the two optional query parameters.
 */
export type SearchSkusEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.getSkuStocksDeletableFlag} reads: the SKU identifier from the path.
 */
export type SkuIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.getSkuBySkuCode} reads: the SKU code from the path.
 */
export type SkuCodeEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice {@link SkuHandler.getTransactionExistsFlag} reads: the two optional query identifiers.
 *
 * ⭐ THE QUERY STRING IS PRESENT BECAUSE THE SERVICE MEMBER TAKES TWO OPTIONAL ARGUMENTS. The legacy
 * DECLARATION at [model/service/SkuService.cfc:L285] names none, but `[:L286]` forwards
 * `argumentCollection=arguments` and both real callers name an identifier —
 * [model/entity/Sku.cfc:L594] passes `skuID=` and [model/entity/Product.cfc:L626] passes `productID=` —
 * so the OBSERVED contract takes both, optionally. TR-1 tightens the port's signature to that observed
 * contract, and this slice carries the two inputs the boundary now has somewhere to send.
 *
 * ⚠️ A REVISION NARROWED THIS SLICE TO `Pick<…,'headers'>` AND THE ROUTE ANSWERED A PERMANENT 501. It is
 * withdrawn under review finding F1: a route that can never carry an identifier can never answer the
 * scoped question the two legacy callers ask, so it published a member that no request shape could
 * satisfy. Both identifiers are OPTIONAL here, exactly as they are on the DAO
 * [model/dao/SkuDAO.cfc:L54-L55]; supplying neither still reaches the legacy's own refusal at `[:L90]`
 * rather than a boundary-authored substitute (IR-9).
 */
export type TransactionExistsEvent = Pick<
  APIGatewayProxyEvent,
  'queryStringParameters' | 'headers'
>;

/**
 * The slice {@link SkuHandler.getSkuSmartList} reads: the whole query-string container, which stands in
 * for the FW/1 request context the legacy member received.
 */
export type SkuSmartListEvent = Pick<APIGatewayProxyEvent, 'queryStringParameters' | 'headers'>;

/**
 * The slice of the proxy event the injected authorisation resolver is given.
 *
 * ⭐ WHY A PRINCIPAL HAS TO ARRIVE WITH THE REQUEST. The legacy read it off the framework scope —
 * `getAccount()` [org/Hibachi/HibachiScope.cfc:L134-L135] returns the SESSION's account — and a
 * stateless invocation has neither a session nor an application scope (AAP 0.6.6 M7, M8). The principal
 * must therefore be resolved at the edge, per invocation, from something the request carries. This
 * handler must be able to hand the resolver something, and because a function parameter is
 * contravariant, every member's own event slice has to be assignable to whatever the resolver accepts —
 * which is the only reason `headers` appears on the nine slices above.
 *
 * `headers` is the container chosen because it is the only one the platform typings declare ALWAYS
 * PRESENT — both parameter containers are declared nullable — so no member is forced to narrow a null
 * before it can even ask the authorisation question, and a hand-written double stays a one-member
 * literal.
 *
 * ⛔ AND THIS FILE NEVER READS IT. It does not call `readHeader`, name a header, name a scheme, parse a
 * token or implement authentication of any kind. Doing any of those would invent an authentication
 * mechanism the source does not describe — the legacy mechanism was a form post and a session, not an
 * HTTP scheme — which AAP 0.7.3 S9 forbids. The resolver decides how a principal is ESTABLISHED; this
 * handler decides only what happens when there is none, or when there is one without permission.
 *
 * A deployment that carries its principal somewhere else — an authorizer context, for instance — widens
 * THIS single declaration, and the nine members widen with it.
 */
export type SkuAuthorizationEvent = CatalogAuthorizationEvent;

/* ================================================================================================
 * RESPONSE SHAPES
 * ============================================================================================== */

/**
 * The SKU representation a route returns: an explicit, minimal projection of the domain object.
 *
 * G6 TRANSLATION DECISION (k). Nothing in the legacy system published a SKU as JSON — the Taffy REST
 * surface at frontend/api/taffy is explicitly out of scope (AAP 0.2.2.2) and is neither ported nor
 * re-created — so every member of this shape is a judgment made by this port, and the judgment is to
 * publish as little as possible.
 *
 * ⭐ WHY A PROJECTION AND NOT THE ENTITY, REASON ONE: WHOLE-OBJECT SERIALISATION WOULD PUBLISH
 * OUT-OF-SCOPE STRUCTURE. Reading ../domain/sku/Sku's own declarations, an instance carries — beyond
 * the persistent scalars a caller legitimately wants — `remoteID` [model/entity/Sku.cfc:L60], the audit
 * quartet `createdDateTime`/`createdByAccount`/`modifiedDateTime`/`modifiedByAccount`, and TWELVE
 * relationship collections whose collaborators are every one of them EXPLICITLY OUT OF SCOPE
 * (AAP 0.2.2.1): `orderItems` (Order*, 18 files), `stocks` (Stock*, 11), `skuCurrencies` (Currency*, 2),
 * `physicals` (Physical*, 6), `priceGroupRates` (PriceGroup*, 4), `attributeValues` (Attribute*, 6) and
 * the four promotion collections (Promotion*, 9). This deliverable does not even model most of them.
 *
 * ⭐ WHY A PROJECTION, REASON TWO, AND IT IS A CORRECTNESS ONE RATHER THAN A DISCLOSURE ONE. `Sku.product`
 * holds a live `Product`, and `Product.skus` holds the SKU back — the pair maintained by
 * `Product.addSku` / `Sku.setProduct`. `Sku.options` holds live `Option` instances, and `Option.skus`
 * holds the SKU back too. Serialising a SKU whole is therefore a CYCLE in two independent directions,
 * and `JSON.stringify` throws on one — which this handler's own failure path would then answer with an
 * opaque server error for a request that was perfectly valid. Projecting removes the cycle by
 * construction rather than by defending against it.
 *
 * WHAT IS INCLUDED, AND WHY EACH MEMBER EARNS ITS PLACE — the SKU's own persistent scalar columns, and
 * only those:
 *   - `skuID` [model/entity/Sku.cfc:L52], because it is the addressed resource's OWN primary key and a
 *     caller that has just created SKUs needs the identifiers it must use to address them afterwards.
 *   - `skuCode` [:L54], the entity's simple representation and the value
 *     {@link SkuHandler.getSkuBySkuCode} addresses a SKU by.
 *   - `price` [:L56], `listPrice` [:L55] and `renewalPrice` [:L57], the three persistent price columns.
 *     These are the STORED values, not the calculated ones: `salePrice`, `livePrice`,
 *     `currentAccountPrice` and the whole sale-price family are excluded by AAP 0.2.2.6 and reach the
 *     out-of-scope pricing and promotion services through `PricingPort`.
 *   - `activeFlag` [:L53] and `userDefinedPriceFlag` [:L59], the SKU's own boolean state.
 *   - `imageFile` [:L58], the stored file NAME. Deliberately NOT the composed image PATH: the path is
 *     produced behind `ImagePathPort`, and ../services/SkuService records why that distinction is
 *     load-bearing — the column carries no validation rule in model/validation/Sku.json, so it is the
 *     caller-supplied half of a path and never a destination this port composes for a write.
 *
 * WHAT IS EXCLUDED, EXPLICITLY: `calculatedQATS` (a calculated inventory quantity — Inventory* and
 * Stock* are out of scope, and AAP 0.2.2.6 names `qats` in the excluded list), `remoteID` (an
 * integration key for a remote system, which is not this deliverable's to disclose), the four audit
 * members (../domain/base/AuditableEntity records that response minimisation must prevent their
 * unintended publication), `subscriptionTerm` and the three subscription/content collections (the
 * Subscription* and Content* families are out of scope and reach the port through
 * `SubscriptionTermPort` and `AccessContentPort`), `alternateSkuCodes`, and all twelve relationship
 * collections named above.
 *
 * The two optional members are declared optional rather than as unions with `undefined` because
 * `exactOptionalPropertyTypes` is enabled and because the underlying declarations really are optional
 * with no default — [model/entity/Sku.cfc:L54] and [:L58] declare neither `default` nor `notnull`, so
 * "absent" is a genuinely different state from an empty string and the projection must not invent one.
 * The six non-optional members are non-optional because ../domain/sku/Sku gives each a field
 * initialiser, so an instance always carries them.
 *
 * NOT AN INVENTED ENVELOPE. There is no wrapper object, no `data` member, no type discriminator, no
 * link section and no embedded resource (AAP 0.7.3 S9). The body is the SKU's own fields and nothing
 * else.
 */
export interface SkuResponse {
  readonly skuID: string;
  readonly skuCode?: string;
  /* ⭐ F07 — THE THREE PRICES SERIALISE AS JSON STRINGS, AND THAT IS THE POINT. They are
   * {@link ExactDecimal}: `ormtype="big_decimal"` [model/entity/Sku.cfc:L55-L57], carried as exact digits
   * everywhere else in this port. Declaring them `number` here would put the rounding back at the very
   * last step, because `JSON.stringify` would emit a bare numeric literal and every mainstream JSON
   * parser reads one as an IEEE-754 double — so `9007199254740993.01` would reach the client as
   * `9007199254740994` after surviving the database, the mapper, the domain and the service intact.
   *
   * NO LEGACY JSON CONTRACT IS BROKEN BY THIS, because none exists: the legacy exposes FW/1
   * `?slatAction=` routes rendering CFML views, not this envelope, and this handler layer is net-new in
   * its entirety (AAP §0.4.1.9). The choice is therefore free, and exactness is the only defensible one.
   * A consumer needing arithmetic parses the string with a decimal library of its own choosing — which is
   * the same decision this port made internally, for the same reason. */
  readonly price: ExactDecimal;
  readonly listPrice: ExactDecimal;
  readonly renewalPrice: ExactDecimal;
  readonly activeFlag: boolean;
  readonly userDefinedPriceFlag: boolean;
  readonly imageFile?: string;
}

/**
 * The paginated SKU representation {@link SkuHandler.getSkuSmartList} returns.
 *
 * The SEVEN members are `SmartListResult`'s seven, unchanged in name and meaning — `records`,
 * `pageRecords`, `recordsCount`, `pageRecordsStart`, `pageRecordsEnd`, `currentPage` and `totalPages` —
 * each of which ../ports/SmartListQueryPort traces to the line of org/Hibachi/HibachiSmartList.cfc that
 * produces it. Nothing is added, renamed, reordered or omitted, so a reader comparing this shape against
 * the legacy smart list finds a one-to-one correspondence.
 *
 * The ONLY difference from `SmartListResult<Sku>` is that the two record collections carry
 * {@link SkuResponse} instead of `Sku`, for the two reasons judgment (k) gives: a whole `Sku` would
 * publish out-of-scope structure, and it would be a reference cycle that `JSON.stringify` throws on.
 * The five numeric members are copied across as the smart list computed them — never recomputed,
 * clamped, re-based or defaulted — because this file owns no source-declared numeric constant
 * (AAP 0.7.3 S9).
 */
export interface SkuSmartListResponse {
  readonly records: readonly SkuResponse[];
  readonly pageRecords: readonly SkuResponse[];
  readonly recordsCount: number;
  readonly pageRecordsStart: number;
  readonly pageRecordsEnd: number;
  readonly currentPage: number;
  readonly totalPages: number;
}

/* ================================================================================================
 * THE AUTHORISATION MATRIX
 * ============================================================================================== */

/**
 * What one routed SKU operation requires of a principal, in the legacy's own vocabulary.
 *
 * ⭐ THE LITERAL IS TIED TO THE PORT'S UNION RATHER THAN RE-TYPED. `Extract` resolves against
 * `HandlerAccessClassification`, so if a classification is ever renamed there the extraction yields
 * `never` and every literal below stops compiling. Restating `'secure'` as a bare literal would let the
 * two vocabularies drift silently in opposite directions.
 *
 * ⭐ `crudType` IS SINGULAR AS OF REVIEW FINDING SEC-AUTH-01. It was `crudTypes`, an ordered non-empty
 * tuple asked until one grant answered; the withdrawal record sits immediately below this interface,
 * above {@link SECURE_SKU_IMAGE_WRITE_REQUIREMENT}.
 *
 * ⭐ `entityName` IS PART OF THE ROW BECAUSE THIS FILE ASKS ABOUT TWO ENTITIES. See the note above
 * {@link SKU_ENTITY_NAME} for the evidence; it is the one structural difference between this matrix and
 * ./optionHandler's.
 *
 * ⛔ ONE CLASSIFICATION, BECAUSE EVERY ROW NEEDS EXACTLY ONE. The set is exactly as wide as the
 * evidence in {@link SKU_ACCESS_MATRIX}, which is the same rule that keeps a `'public'` arm out: a
 * `'public'` arm would put "reachable with no account at all" one keystroke away from a row that has no
 * evidence for it — and the only public action anywhere in this slice is `this.publicMethods="product"`
 * at [integrationServices/google/controllers/feed.cfc:L54], which belongs to ./googleFeedHandler. An
 * `'anyAdmin'` arm is absent for the same reason.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — AND THE `'anyLogin'` ARM IS ABSENT BY THE SAME RULE, AS OF REVIEW
 * FINDING F2. This was a two-arm discriminated union while `processImageUpload` was classified
 * `'anyLogin'`, and its rationale read: "A DISCRIMINATED UNION, BECAUSE THE TWO CLASSIFICATIONS ASK
 * DIFFERENT NUMBERS OF QUESTIONS. An `'anyLogin'` item is decided by the logged-in gate alone: the branch
 * that authorises it [org/Hibachi/HibachiAuthenticationService.cfc:L63-L70] returns true without ever
 * naming a CRUD type or an entity." That reasoning was sound and its citation is accurate; what changed is
 * the matrix. With the image write reclassified, NO SKU ROW is decided by the logged-in gate alone, so
 * keeping the arm would leave an arm no row selects and a gate branch that can never execute — dead code
 * carrying a comment explaining why it is unreachable. Removing it also makes an any-login SKU row a
 * COMPILE ERROR rather than a one-word edit, which is the same protective property the missing `'public'`
 * arm already provides.
 *
 * ⚠️ NOTHING IS LOST FROM THE PORT, AND THIS IS MEASURED RATHER THAN ASSUMED. `'anyLogin'` remains in
 * `../ports/AccountContextPort`'s `HandlerAccessClassification`, and ./optionHandler keeps its own
 * `'anyLogin'` arm with FOUR live rows — `getUnusedProductOptions`, `getUnusedProductOptionsBounded`,
 * `getUnusedProductOptionGroups` and `getUnusedProductOptionGroupsBounded` — each carrying its own traced
 * evidence. The classification is therefore still exercised by the deliverable; it is simply not
 * exercised by any SKU row, and AAP 0.4.2.5's rule that surface is reproduced "only where used" applies to
 * a classification arm as much as to a synthesized method.
 */
type SkuAccessRequirement = {
  readonly classification: Extract<HandlerAccessClassification, 'secure'>;
  readonly entityName: string;

  /** The ONE operation this route performs, and therefore the one question it asks (SEC-AUTH-01). */
  readonly crudType: EntityCrudType;

  /**
   * A SECOND, subordinate question, asked only after the primary one is granted — SEC-AUTH-02's
   * conjunctive half.
   *
   * `createSkus` addresses an existing PRODUCT and CREATES SKUs under it, so `update` on `Product`
   * alone is not authority for the SKU inserts: both grants are required. This is a conjunction, never
   * an alternative — the withdrawn tuple expressed the opposite.
   */
  readonly subordinate?: {
    readonly entityName: string;
    readonly crudType: EntityCrudType;
  };
};

/**
 * ⛔ THE ORDERED CRUD-QUESTION TUPLE IS WITHDRAWN — REVIEW FINDING SEC-AUTH-01 (CWE-862, CWE-639).
 *
 * A `SkuCrudQuestions` alias stood here — `readonly [EntityCrudType, ...EntityCrudType[]]` — with three
 * frozen instances (`READ_CRUD_QUESTIONS`, `SAVE_CRUD_QUESTIONS`, `IMAGE_WRITE_CRUD_QUESTIONS`), and the
 * gate walked each row's tuple accepting the FIRST grant. Its rationale was the legacy `save` branch at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L71-L77], which asks `create`, returns true if granted,
 * and only then asks `update`.
 *
 * ⛔ WHY IT IS GONE. On `createSkus` the pair authorised the operation the caller HELD rather than the one
 * the route PERFORMS: a principal granted only `create` on `Product` could name an existing product,
 * satisfy the `create` question asked first, and have the route resolve that product and write SKUs into
 * it. The `update` question — the only one describing what actually happens — was unreachable in exactly
 * the case where it mattered.
 *
 * ⭐ WHAT REPLACES IT. One primary question per row ({@link SkuAccessRequirement.crudType}), plus an
 * optional CONJUNCTIVE {@link SkuAccessRequirement.subordinate} question where a second resource is
 * written. The four CRUD literals are unchanged: they are still the legacy's, read from the same prefix
 * branch, and the `read` rows and the image-write row ask exactly what they asked before.
 *
 * ⚠️ THE PARITY COST, NAMED. A `create`-only principal can no longer drive `sku.createSkus` against an
 * existing product. That is a caller whose grant does not cover the operation performed; the legacy gate
 * is framework code AAP §0.8.3.2 forbids carrying forward, so what stands here is a reconstruction of its
 * CONTRACT, and reconstructing it to authorise the operation actually performed is the enterprise standard
 * AAP §0.7.3 binds this port to in the absence of user Rules.
 */

const SECURE_SKU_IMAGE_WRITE_REQUIREMENT: SkuAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: SKU_ENTITY_NAME,
  crudType: 'update',
});

/**
 * The requirement every SKU READ states: a logged-in account whose permission groups grant `read` on
 * `Sku`.
 *
 * The question it asks is the legacy's own: the `detail` and `list` branches of
 * [org/Hibachi/HibachiAuthenticationService.cfc:L55-L56, :L61-L62] both resolve to `read`. Shared by the
 * seven read rows because all seven carry the identical requirement.
 */
const SECURE_SKU_READ_REQUIREMENT: SkuAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: SKU_ENTITY_NAME,
  crudType: 'read',
});

/**
 * The requirement SKU CREATION states: a logged-in account whose permission groups grant `update` on
 * `Product` AND `create` on `Sku`.
 *
 * THE ENTITY of the primary question comes from the item name that reaches `createSkus`: its only legacy
 * call sites are `ProductService.saveProduct` [model/service/ProductService.cfc:L279] and
 * `ProductService.processProduct_addOption` [:L150], and the ladder derives the entity name from the item
 * name at [org/Hibachi/HibachiAuthenticationService.cfc:L75]. A `saveProduct` item therefore asks about
 * `Product`.
 *
 * ⭐ THE PRIMARY QUESTION IS `update`, NOT `create`, AND THAT IS SEC-AUTH-01's WHOLE POINT. This route
 * ADDRESSES an existing product — `productID` is a required path parameter and the product is resolved
 * inside the transaction before `createSkus` runs — so the operation performed on the `Product` is an
 * update in every reachable case. Asking `create` first (the withdrawn tuple did) authorised the
 * operation the caller HELD rather than the one the route PERFORMS; the record above
 * {@link SkuAccessRequirement} sets out the escalation that made possible.
 *
 * ⭐ AND THE SUBORDINATE QUESTION IS CONJUNCTIVE, NEVER AN ALTERNATIVE. The route writes SKU rows, so
 * `create` on `Sku` is required in addition to the product update. `../handlers/skuHandler`'s image write
 * asks `update` on the same entity, which keeps one resource governed by one permission wherever it is
 * reached from.
 */
const SECURE_PRODUCT_SAVE_REQUIREMENT: SkuAccessRequirement = Object.freeze({
  classification: 'secure',
  entityName: PRODUCT_ENTITY_NAME,
  crudType: 'update',
  /* SEC-AUTH-02's subordinate half: the route CREATES SKUs under the product it updates, and ./skuHandler
   * asks the same `Sku` question for its own image write, so one resource stays governed by one
   * permission wherever it is reached from. */
  subordinate: Object.freeze({ entityName: SKU_ENTITY_NAME, crudType: 'create' }),
});

/**
 * The access classification of every routed SKU operation, and the evidence for each row.
 *
 * ⭐ WHY THIS EXISTS AT ALL. The legacy application authorised EVERY request in one place, before any
 * controller method ran: `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203] opens with the comment
 * "Verify Authentication before anything happens" and refuses at [:L188]. No legacy controller repeated
 * that check because none needed to. That gate is framework code and does not cross the boundary
 * (AAP 0.8.3.2), so its CONTRACT had to be declared instead — see ../ports/AccountContextPort. Restoring
 * the gate here is PARITY, not invented policy; the only thing that changes is the failure mode, from a
 * browser redirect to a status code.
 *
 * ⭐ THE MATRIX IS WIRED INTO THE GATE, NOT MERELY DOCUMENTED BESIDE IT. {@link createSkuHandler}'s
 * `refuseUnauthorized` takes a MEMBER NAME and reads its requirement from here, so a member cannot be
 * enforced as something other than what this table declares. Because the key type is
 * `keyof SkuHandler`, a member added to the routed surface without a row here does not compile, and a
 * member removed from that surface takes its rows and its call sites down with it.
 *
 * ⭐ WHY NO ROW IS `'public'`, ESTABLISHED BY EVIDENCE RATHER THAN BY CAUTION. Every legacy
 * administrative SKU item lives on the admin entity controller, and [admin/controllers/entity.cfc:L66-L68]
 * declares `this.publicMethods=''`, `this.anyAdminMethods=''` AND `this.secureMethods=''` — all three
 * EMPTY. Not one SKU operation is public, and none is named in an explicit list either, so every SKU item
 * falls through to the entity-CRUD branch at [org/Hibachi/HibachiAuthenticationService.cfc:L51-L79],
 * which is the permission-checked path.
 *
 * THE ROWS, AND THE EVIDENCE FOR EACH
 * -----------------------------------
 *   `createSkus` — SECURE, `update` on `Product` AND `create` on `Sku`. Reached only from a Product
 *     `save` item; see {@link SECURE_PRODUCT_SAVE_REQUIREMENT}. It is the one row that asks about a SECOND
 *     ENTITY, and the one that asks TWO questions — conjunctively as of SEC-AUTH-01, where the two were
 *     once alternatives. An earlier wording called it "the one row in this file that WRITES",
 *     which was true while `processImageUpload` was classified as `'anyLogin'` and is not true now that
 *     the image write is a permission-checked write too.
 *
 *   `processImageUpload` — SECURE, `update` on `Sku`; see {@link SECURE_SKU_IMAGE_WRITE_REQUIREMENT}. It
 *     is the second row in this file that WRITES, and the only row whose classification was re-derived
 *     rather than transcribed, so the whole derivation is set out here.
 *
 *     ⭐ SEC-HARDENING (D18-CLASS) — review finding F2 (CWE-434, least-privilege write authorization).
 *     An earlier reading of this row said ANY LOGIN, and argued it thus: "The member's legacy name begins
 *     with `process`, and the ladder's `process` branch
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L69-L70] is a bare `return true` — it asks NO
 *     permission question and names NO entity. That branch sits INSIDE the logged-in gate at [:L30], so a
 *     principal is still required; what is not required is a CRUD grant. Asking an entity question here
 *     would REFUSE callers the legacy admitted, which is a behavior change dressed up as caution
 *     (AAP 0.8.2 Guideline 4)." Every CITATION in that argument is accurate and has been re-verified line
 *     by line. Its CONCLUSION does not follow, for two measured reasons.
 *
 *     REASON ONE — THE SET OF CALLERS THE LEGACY ADMITTED IS EMPTY, so a tighter requirement refuses
 *     nobody. `grep -rn processImageUpload --include=*.cfc --include=*.cfm` over the whole legacy tree
 *     returns EXACTLY ONE line, and it is the declaration itself at
 *     [model/service/SkuService.cfc:L210]. No controller invokes it, no view links to it and no item
 *     names it. The earlier reading recorded this fact in its own closing sentence — "the member has ZERO
 *     callers anywhere in the legacy repository and sits outside the dispatcher's
 *     `process<Class>_<context>` convention, so no legacy item existed for it at all" — and then treated
 *     it as a reason to reach for the nearest analogy. It is the opposite: "would refuse callers the
 *     legacy admitted" is a claim about a non-empty set, and this set is empty. That is exactly the D18
 *     licensing shape (AAP 0.6.7.7) — a divergence that changes no outcome for any input the legacy was
 *     designed to accept — which is why this tightening is licensed where refusing a stored display path
 *     is not.
 *
 *     REASON TWO — THE LADDER TESTS AN ITEM NAME, NOT A SERVICE METHOD NAME. `left(itemName, 7)` at
 *     [:L69] reads the FW/1 *item* (a subsystem:section.item action), and every branch around it —
 *     `create`, `detail`, `delete`, `edit`, `list`, `save` at [:L53-L77] — reads the same variable. A
 *     service member is not an item and never reaches that switch, so the `process` prefix branch is not
 *     weak evidence about this member; it is evidence about a different namespace. Applying it here was an
 *     analogy, and it is the analogy that is withdrawn, not any of its citations.
 *
 *     ⚠️ WHAT THIS ROW DOES *NOT* CLAIM. No new classification, vocabulary or grant is invented: `update`
 *     and `Sku` are both the legacy's own values, taken from the `edit` branch at [:L59-L60]. The 401/403
 *     ladder is unchanged. The `'anyLogin'` arm of {@link SkuAccessRequirement} and the gate step that
 *     served it are GONE, because this row was the only one that reached either — that consequence is
 *     reasoned out at {@link SkuAccessRequirement}, including the measurement that ./optionHandler keeps
 *     the classification alive with four live rows of its own, so the legacy branch remains ported
 *     somewhere it is actually used.
 *
 *   The seven READ rows — SECURE, `read` on `Sku`; see {@link SECURE_SKU_READ_REQUIREMENT}. Each is
 *     reached through a `detail` or `list` item, both of which resolve to `read`
 *     [org/Hibachi/HibachiAuthenticationService.cfc:L55-L56, :L61-L62], and the corresponding admin views
 *     that exist on disk are exactly `admin/views/entity/detailsku.cfm` and
 *     `admin/views/entity/listsku.cfm` — there is no `createsku.cfm` and no `editsku.cfm`, which is
 *     independent confirmation that the SKU's own legacy surface is read-only.
 *     `getSkuStocksDeletableFlag` and `getTransactionExistsFlag` are included among them deliberately:
 *     both are FLAG READS consumed by the SKU detail view through
 *     `Sku.getStocksDeletableFlag()` [model/entity/Sku.cfc:L567-L572] and
 *     `Sku.getTransactionExistsFlag()` [:L592-L596], and neither deletes or modifies anything, so `read`
 *     is the honest CRUD type even though one of them informs a later delete decision.
 *
 * ⛔ `newSku` HAS NO ROW BECAUSE IT HAS NO ROUTE. See {@link SkuHandler}.
 *
 * The object is frozen, so the matrix is provably immutable at run time as well as in the type system —
 * the same requirement AAP 0.6.6 M7 places on everything outside the connection pool, because a warm
 * Lambda container is shared across invocations and therefore potentially across tenants.
 */
export const SKU_ACCESS_MATRIX: Readonly<Record<keyof SkuHandler, SkuAccessRequirement>> =
  Object.freeze({
    createSkus: SECURE_PRODUCT_SAVE_REQUIREMENT,
    processImageUpload: SECURE_SKU_IMAGE_WRITE_REQUIREMENT,
    getProductSkus: SECURE_SKU_READ_REQUIREMENT,
    getSortedProductSkus: SECURE_SKU_READ_REQUIREMENT,
    searchSkusByProductType: SECURE_SKU_READ_REQUIREMENT,
    getSkuStocksDeletableFlag: SECURE_SKU_READ_REQUIREMENT,
    getTransactionExistsFlag: SECURE_SKU_READ_REQUIREMENT,
    getSkuBySkuCode: SECURE_SKU_READ_REQUIREMENT,
    getSkuSmartList: SECURE_SKU_READ_REQUIREMENT,
  });

/* ================================================================================================
 * THE ROUTED SURFACE
 * ============================================================================================== */

/**
 * The routed SKU operations, ready to be mounted by src/handlers/router.ts.
 *
 * EVERY MEMBER IS NAMED FOR THE SERVICE MEMBER IT EXPOSES — the naming is what makes the mapping from
 * AAP 0.4.2.2 to this file checkable by inspection, which is the whole of AAP 0.8.3.1's requirement that
 * interface parity be "checkable method-by-method". THIS INTERFACE IS ALSO THE DEFINITION OF "MOUNTED":
 * {@link SKU_ACCESS_MATRIX} is keyed on `keyof SkuHandler`, so every routed member is REQUIRED to carry a
 * classification and no member can be added here without one.
 *
 * EXACTLY NINE MEMBERS, AND THE COUNT IS DERIVED RATHER THAN CHOSEN. AAP 0.4.2.2 tabulates the public
 * surface of model/service/SkuService.cfc and it has NINE rows; AAP 0.4.2.5 then names `skuService.newSku()`
 * as a real call site the slice depends on, which IR-1 requires be "declared explicitly". The service
 * therefore declares ten ({@link SkuSurface}); the boundary mounts the nine that a caller outside the
 * application can address, and withholds the one that it cannot.
 *
 * ⛔ NINE MEMBERS, NOT TEN: `newSku` IS DELIBERATELY NOT ROUTED, AND ITS ABSENCE HERE IS THE MECHANISM
 * RATHER THAN A NOTE. Because {@link createSkuHandler} returns a frozen object typed as this interface,
 * router.ts cannot mount it — there is no member to mount, and an attempt to add one fails to compile in
 * this file first. The evidence for leaving it unrouted is specific rather than stylistic:
 *   - It has NO legacy declaration at all. It existed only because org/Hibachi/HibachiService.cfc:L255-L281
 *     fabricated a service's implicit CRUD surface from a lower-cased name prefix — `new` at [:L264],
 *     whose handler at [:L544-L549] strips the prefix and calls `new(entityName)` with no arguments — for
 *     callers INSIDE the application.
 *   - All five of its legacy call sites are inside the component itself
 *     [model/service/SkuService.cfc:L92, :L127, :L154, :L182, :L192], plus one in ProductService
 *     [model/service/ProductService.cfc:L176]. Not one is a controller.
 *   - What it returns is an UNPERSISTED in-memory instance. Publishing a route that manufactures one and
 *     discards it at the end of the invocation would be an invented operation with no legacy counterpart
 *     (AAP 0.7.3 S9), and it would answer with an entity that does not exist in the database.
 * ./brandHandler reached the identical conclusion about `newBrand` on the identical evidence, so the
 * folder is consistent rather than each file inventing its own rule.
 *
 * ⛔ AND THERE IS NO `countSku`, `listSku`, `exportSku`, `processSku` or compound `getSkuByXxx` MEMBER,
 * because AAP 0.4.2.5 ends with "synthesis is not reproduced wholesale, only where used" and the slice
 * calls none of them.
 *
 * ALL NINE RESOLVE A PROMISE, so a router awaits every route uniformly. That is true even of
 * `getSkuStocksDeletableFlag`, whose service member never resolves at all: ../services/SkuService returns
 * `Promise.reject(...)` rather than throwing synchronously, precisely so that the declared contract and
 * the observed behavior agree — see judgment (c).
 */
export interface SkuHandler {
  /**
   * Creates a product's SKUs from a submitted payload.
   *
   * The AWS-facing face of `createSkus` at [model/service/SkuService.cfc:L58] — the largest single
   * business rule in the slice. Reads the product identifier from the path, resolves it to an entity,
   * reads the JSON object body, and passes the two to the service positionally with the PRODUCT FIRST and
   * the PAYLOAD SECOND.
   *
   * Responses: the service's boolean at an OK status — see judgment (n) for why that value carries no
   * success semantics; unauthorised or forbidden per {@link SKU_ACCESS_MATRIX}, decided BEFORE anything
   * about the request is examined; a bad request when no product identifier is addressed or the body is
   * absent, malformed or not a JSON object; not found when the addressed product does not exist.
   */
  readonly createSkus: (event: CreateSkusEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Records the result of an image upload against a SKU.
   *
   * The AWS-facing face of `processImageUpload` at [model/service/SkuService.cfc:L210]. Addresses the SKU
   * by its code — judgment (j) — and forwards the upload-result payload unchanged.
   *
   * Responses: the image-write VERDICT — a bare `true` or `false` — at an OK status, reproducing
   * [model/service/SkuService.cfc:L213-L217] (judgment (b)); unauthorised when no logged-in principal is
   * established; a bad request when no SKU code is addressed or the body is absent, malformed or not a
   * JSON object; not found when no SKU carries that code; and not implemented when the image boundary
   * RAISES rather than declining — judgment (g). ⚠️ A DECLINED write is `false` at an OK status, not a
   * failure status: [:L216] returns `false` and records nothing.
   */
  readonly processImageUpload: (event: ProcessImageUploadEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Lists a product's SKUs, optionally in option-group order.
   *
   * The AWS-facing face of `getProductSkus` at [model/service/SkuService.cfc:L220]. Three arguments, in
   * the legacy's order: the PRODUCT, then `sorted`, then `fetchOptions`.
   *
   * ⚠️ `sorted` IS REQUIRED AND IS NOT DEFAULTED HERE — AAP 0.4.2.2 Discrepancy 2. `fetchOptions` is the
   * only optional argument, and when it is absent the argument is OMITTED so the service's own
   * `fetchOptions=false` default applies.
   *
   * Responses: the projected SKUs at an OK status; unauthorised or forbidden per
   * {@link SKU_ACCESS_MATRIX}; a bad request when the product identifier is absent, when `sorted` is
   * absent, or when either flag is not a boolean; not found when the addressed product does not exist.
   * ⚠️ A sorted request over a product with an option-less SKU raises inside the service and is answered
   * as a failure, UNGUARDED — judgment (d), carried defect D13.
   */
  readonly getProductSkus: (event: ProductSkusEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Lists a product's SKUs in option-group order.
   *
   * The AWS-facing face of `getSortedProductSkus` at [model/service/SkuService.cfc:L246]. One argument,
   * the product. Unlike {@link SkuHandler.getProductSkus} it reads the product's OWN collection rather
   * than querying [:L248], and it returns a short collection unreordered [:L250-L252].
   *
   * Responses: the projected SKUs at an OK status; unauthorised or forbidden per
   * {@link SKU_ACCESS_MATRIX}; a bad request when no product identifier is addressed; not found when the
   * addressed product does not exist. ⚠️ It carries the SAME unguarded D13 failure — judgment (d).
   */
  readonly getSortedProductSkus: (event: SortedProductSkusEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Searches SKUs, optionally narrowed to one product type.
   *
   * The AWS-facing face of `searchSkusByProductType` at [model/service/SkuService.cfc:L271]. BOTH
   * arguments are optional — AAP 0.4.2.2 Discrepancy 3 — and both are passed in the legacy's order,
   * `term` then `productTypeID`. The parameter name is SINGULAR and stays singular — judgment (f).
   *
   * Responses: the search rows at an OK status, forwarded exactly as the service produced them;
   * unauthorised or forbidden per {@link SKU_ACCESS_MATRIX}. There is no bad-request path, because there
   * is no required input to be missing — judgment (h).
   */
  readonly searchSkusByProductType: (event: SearchSkusEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Reports whether a SKU's stock records may be deleted — and never actually answers.
   *
   * The AWS-facing face of `getSkuStocksDeletableFlag` at [model/service/SkuService.cfc:L281], whose
   * delegate DOES NOT EXIST ANYWHERE IN THE LEGACY REPOSITORY. Judgment (c) carries the whole account.
   *
   * Responses: unauthorised or forbidden per {@link SKU_ACCESS_MATRIX}; a bad request when no SKU
   * identifier is addressed, because the legacy argument is `required`; and otherwise NOT IMPLEMENTED,
   * always. ⚠️ No `true`, no `false`, no `null` and no fabricated value is ever returned from this route.
   */
  readonly getSkuStocksDeletableFlag: (event: SkuIdentifierEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Publishes the transaction-existence probe, scoped by either optional identifier the legacy accepts.
   *
   * The AWS-facing face of `getTransactionExistsFlag` at [model/service/SkuService.cfc:L285]. That
   * DECLARATION names no formal parameter, but `[:L286]` forwards `argumentCollection=arguments` and both
   * real callers name an identifier — [model/entity/Sku.cfc:L594] passes `skuID=` and
   * [model/entity/Product.cfc:L626] passes `productID=` — so TR-1 tightens the ported signature to the
   * observed `(skuID?, productID?)` and this boundary binds exactly those two from the query string.
   * Judgment (a) carries the full adjudication, including why a revision's zero-parameter reading of AAP
   * §0.4.2.2's Discrepancy 4 was withdrawn by review finding F1.
   *
   * ⚠️ AN UNSCOPED REQUEST STILL SURFACES THE LEGACY'S OWN REFUSAL. With neither identifier supplied, the
   * DAO's else-branch dereferences an unbound `arguments.productID` at [model/dao/SkuDAO.cfc:L90] after
   * the `structKeyExists` test at [:L58] has failed — which is what a literal zero-argument legacy
   * invocation does. That failure is left to surface from the repository rather than pre-empted here, and
   * nothing is substituted for it: a fabricated `false` would PERMIT a delete
   * ([model/validation/Product.json:L12], [model/validation/Sku.json]).
   *
   * Responses: unauthorised or forbidden per {@link SKU_ACCESS_MATRIX}; the scoped boolean for a scoped
   * probe; otherwise the refusal the repository raises, shaped by {@link errorResponse}.
   */
  readonly getTransactionExistsFlag: (
    event: TransactionExistsEvent,
  ) => Promise<APIGatewayProxyResult>;

  /**
   * Finds one SKU by its code, falling back to alternate codes.
   *
   * The AWS-facing face of `getSkuBySkuCode` at [model/service/SkuService.cfc:L289]. The argument is
   * OPTIONAL there — no `required` keyword — so an unaddressed code is forwarded as absent rather than
   * rejected here, and the failure the service documents happens where the legacy's happens
   * (judgment (h)).
   *
   * Responses: the projected SKU at an OK status; not found when no SKU carries the code, because the
   * service returns `null` for a miss and MUST NOT be made to throw — the out-of-scope caller
   * [model/service/PhysicalService.cfc:L199] counts misses as a data-quality tally; unauthorised or
   * forbidden per {@link SKU_ACCESS_MATRIX}; and, when no code was addressed at all, the SERVICE's own
   * explicit failure surfacing through {@link errorResponse} rather than a status invented here — which is
   * what the legacy produces for the same omission, since [:L289] admits it and
   * [model/dao/SkuDAO.cfc:L102]'s `required` is what fails.
   */
  readonly getSkuBySkuCode: (event: SkuCodeEvent) => Promise<APIGatewayProxyResult>;

  /**
   * Returns a paginated, filterable SKU list.
   *
   * The AWS-facing face of `getSkuSmartList` at [model/service/SkuService.cfc:L309]. The query string
   * stands in for the FW/1 request context the legacy member received, and only the keys the legacy
   * interpreter recognises are forwarded — judgment (l), {@link readSmartListInput}.
   *
   * Responses: the projected page at an OK status; unauthorised or forbidden per
   * {@link SKU_ACCESS_MATRIX}. There is no bad-request path: `struct data={}` is optional with a default
   * at [:L309], and an unrecognised query key was silently ignored by
   * [org/Hibachi/HibachiSmartList.cfc:L98-L135] rather than rejected.
   */
  readonly getSkuSmartList: (event: SkuSmartListEvent) => Promise<APIGatewayProxyResult>;
}

/* ================================================================================================
 * INPUT NARROWING
 *
 * Every read below goes through ./httpResponse's readers, which do the null narrowing and the own-key
 * restriction once and correctly, except for the one place a single-name reader cannot express what is
 * needed — see {@link readSmartListInput}. There is no non-null assertion, no shape-forcing cast, no
 * `any`, no compiler-directive comment and no lint suppression anywhere in this file: where the checker
 * objected, the code changed (AAP 0.7.3 S1).
 * ============================================================================================== */

/**
 * Reads the addressed product identifier, or reports that none was addressed.
 *
 * Two conditions converge on "none", and both are narrowed explicitly because the compiler's
 * unchecked-index checking makes the read possibly-absent and ./httpResponse's reader keeps it that way:
 * the parameter is absent because the route bound no such parameter, or it is present but equal to
 * {@link UNSAVED_IDENTIFIER}, the legacy `unsavedvalue=""` from [model/entity/Product.cfc:L52], which can
 * never identify a persisted row.
 *
 * The value is returned exactly as received — never trimmed, case-folded, padded or validated against a
 * format — because ./httpResponse's pass-through rule holds for inputs as well as for messages, and
 * because a 32-character-identifier check belongs to the persistence layer that owns the column.
 *
 * @param event the proxy event, or any object carrying its path-parameters member
 * @returns the addressed product identifier, or nothing when no product was addressed
 */
function readProductIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const productID: string | undefined = readPathParameter(event, PRODUCT_ID_PATH_PARAMETER);

  if (productID === undefined || productID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return productID;
}

/**
 * Reads the addressed SKU identifier, or reports that none was addressed.
 *
 * Identical in shape and reasoning to {@link readProductIdentifier}; the sentinel is the same
 * `unsavedvalue=""` declared on this entity's own primary key at [model/entity/Sku.cfc:L52].
 *
 * @param event the proxy event, or any object carrying its path-parameters member
 * @returns the addressed SKU identifier, or nothing when no SKU was addressed
 */
function readSkuIdentifier(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
): string | undefined {
  const skuID: string | undefined = readPathParameter(event, SKU_ID_PATH_PARAMETER);

  if (skuID === undefined || skuID === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return skuID;
}

/**
 * Reads the addressed SKU code, or reports that none was addressed.
 *
 * ⚠️ THE EMPTY-STRING CASE IS TREATED DIFFERENTLY HERE THAN FOR THE TWO IDENTIFIERS, AND THAT IS
 * DELIBERATE. `skuCode` is NOT a primary key: [model/entity/Sku.cfc:L54] declares
 * `ormtype="string" unique="true" length="50"` with NO `unsavedvalue` and NO `default`, so the empty
 * string is not a sentinel for anything and nothing in the legacy treats it as one. Only genuine ABSENCE
 * is reported as "none"; an empty code is forwarded as the value it is, and the lookup simply finds no
 * row. Collapsing the two would suppress a real, if unproductive, query the legacy would have run.
 *
 * @param event the proxy event, or any object carrying its path-parameters member
 * @returns the addressed SKU code, or nothing when the route bound no such parameter
 */
function readSkuCode(event: Pick<APIGatewayProxyEvent, 'pathParameters'>): string | undefined {
  return readPathParameter(event, SKU_CODE_PATH_PARAMETER);
}

/**
 * Reads one of the transaction probe's two optional scope identifiers from the query string.
 *
 * Both slots are OPTIONAL, so "absent" is a legal and meaningful input rather than a fault: the DAO
 * declares neither argument `required` [model/dao/SkuDAO.cfc:L54-L55], and the service forwards whatever
 * the caller named. Nothing is refused here.
 *
 * ⚠️ THE `unsavedvalue` SENTINEL COLLAPSES INTO ABSENCE, exactly as {@link readProductIdentifier} and
 * {@link readSkuIdentifier} collapse it for the path forms. Both primary keys declare
 * `unsavedvalue=""` — [model/entity/Product.cfc:L52] and [model/entity/Sku.cfc:L52] — so an empty
 * identifier can never address a persisted row. Forwarding it instead would scope the probe to a row that
 * cannot exist and answer `false`, and a `false` from this flag PERMITS A DELETE
 * ([model/validation/Product.json:L12], [model/validation/Sku.json]). Reporting it as absent instead
 * lets the repository's own refusal decide, which is where the legacy decides.
 *
 * The value is otherwise returned exactly as received — never trimmed, case-folded or format-checked,
 * following ./httpResponse's pass-through rule.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member
 * @param name the parameter name, {@link SKU_ID_QUERY_PARAMETER} or {@link PRODUCT_ID_QUERY_PARAMETER}
 * @returns the identifier, or nothing when it was not supplied or is the unsaved sentinel
 */
function readTransactionScopeIdentifier(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
  name: string,
): string | undefined {
  const identifier: string | undefined = readQueryStringParameter(event, name);

  if (identifier === undefined || identifier === UNSAVED_IDENTIFIER) {
    return undefined;
  }

  return identifier;
}

/**
 * Reads one query parameter as a boolean, distinguishing "absent" from "not a boolean".
 *
 * G6 TRANSLATION DECISION (m). The accepted vocabulary, and why CFML's wider numeric coercion is
 * deliberately not reproduced, are recorded above {@link CFML_TRUE_LITERALS}.
 *
 * A THREE-STATE RESULT RATHER THAN A `boolean | undefined`, because three genuinely different things can
 * happen and the caller must act differently on each: the parameter was not supplied, it was supplied and
 * is a boolean, or it was supplied and is not one. Collapsing the last two would turn a malformed request
 * into a silent `false` — and for `sorted` that would answer an explicit request for sorted output with
 * unsorted output, which is exactly the kind of silent behaviour change AAP 0.6.2 warns about.
 *
 * The comparison folds case because CFML's own boolean and string comparisons are case-insensitive, so
 * `TRUE` and `True` were both accepted by the legacy engine. Nothing else about the value is altered: it
 * is not trimmed, and a value with surrounding whitespace is reported as not-a-boolean rather than
 * silently repaired, following ./httpResponse's pass-through rule.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member
 * @param name the parameter name
 * @returns `undefined` when absent, the boolean when recognised, and `null` when present but unrecognised
 */
function readCfmlBoolean(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
  name: string,
): boolean | null | undefined {
  const raw: string | undefined = readQueryStringParameter(event, name);

  if (raw === undefined) {
    return undefined;
  }

  const folded = raw.toLowerCase();

  if (CFML_TRUE_LITERALS.includes(folded)) {
    return true;
  }

  if (CFML_FALSE_LITERALS.includes(folded)) {
    return false;
  }

  return null;
}

/*
 * THE SMART-LIST QUERY-STRING READER LIVES IN ./httpResponse, NOT HERE.
 *
 * Both smart-list routes on this boundary and ./productHandler's own smart-list route need the same
 * recognised query-string vocabulary, so the reader and the two key lists it consults are declared
 * ONCE in ./httpResponse and imported. A second private copy here is what would let the two
 * boundaries drift apart on which parameters the legacy interpreter would have acted on.
 */

/* ================================================================================================
 * RESPONSE PROJECTION
 * ============================================================================================== */

/**
 * Projects a SKU onto the minimal representation a route returns.
 *
 * The whole of {@link SkuResponse}'s reasoning applies here; this function is its enforcement. It is
 * written as an explicit member-by-member construction rather than as a spread-and-delete or a key filter,
 * deliberately: a projection built by REMOVING members silently republishes anything a future field adds
 * to the entity, whereas one built by NAMING members cannot. A new persistent property therefore stays out
 * of every response until somebody decides otherwise here — which matters more for this entity than for
 * most, because `Sku` carries twelve relationship collections into out-of-scope domains.
 *
 * Values are copied exactly as the entity holds them — never trimmed, re-cased, formatted, rounded,
 * localised or defaulted — following the pass-through rule ./httpResponse sets for this layer. In
 * particular the three price members are the STORED DIGITS AT THE STORED SCALE (F07) and no currency
 * formatting is applied: that is the feed serializer's business, and the settings it would need reach an
 * out-of-scope resolver. `../util/formatting` owns the value type itself, but it is asked to render
 * nothing here — an `ExactDecimal` already IS its own textual form, so the pass-through is literal.
 *
 * An absent optional member is OMITTED rather than emitted as a null, which `exactOptionalPropertyTypes`
 * makes the compiler check: [model/entity/Sku.cfc:L54] and [:L58] declare no default, so "absent" and
 * "empty string" are genuinely different states and collapsing them would invent behaviour
 * (AAP 0.7.3 S9).
 *
 * @param sku the domain instance, which is not mutated
 * @returns the minimal representation, with absent members omitted
 */
function toSkuResponse(sku: Sku): SkuResponse {
  const response: SkuResponse = {
    skuID: sku.skuID,
    ...(sku.skuCode !== undefined ? { skuCode: sku.skuCode } : {}),
    price: sku.price,
    listPrice: sku.listPrice,
    renewalPrice: sku.renewalPrice,
    activeFlag: sku.activeFlag,
    userDefinedPriceFlag: sku.userDefinedPriceFlag,
    ...(sku.imageFile !== undefined ? { imageFile: sku.imageFile } : {}),
  };

  return response;
}

/**
 * Projects a collection of SKUs, preserving order and cardinality exactly.
 *
 * ⚠️ NOTHING IS SORTED, FILTERED, DE-DUPLICATED OR COMPACTED HERE, AND THAT MATTERS MORE THAN IT LOOKS.
 * The ORDER of the two sorting members' results IS their behavior — it is what
 * [model/service/SkuService.cfc:L232-L240] and [:L260-L268] exist to produce — so a projection that
 * reordered or dropped an element would silently undo the very computation the caller asked for. The
 * mapping is positional and total.
 *
 * @param skus the domain instances, which are not mutated
 * @returns the projections, in the same order and of the same length
 */
function toSkuResponses(skus: readonly Sku[]): readonly SkuResponse[] {
  return skus.map(toSkuResponse);
}

/**
 * Projects a smart list page, carrying its five paging numbers across untouched.
 *
 * The reasoning is recorded on {@link SkuSmartListResponse}: the seven members are the smart list's own
 * seven, and the only change is that the two record collections carry projections instead of entities.
 *
 * @param result the smart list page the service produced
 * @returns the same page, with both record collections projected
 */
function toSkuSmartListResponse(result: SmartListResult<Sku>): SkuSmartListResponse {
  /*
   * ⭐ P12 — EACH SKU IS PROJECTED ONCE, NOT ONCE PER COLLECTION IT APPEARS IN. `pageRecords` is a
   * WINDOW OVER `records` — `../adapters/mysql/SmartListQueryBuilder` derives both from one selection —
   * so projecting the two collections independently built a second, identical `SkuResponse` for every
   * SKU inside the current page and threw one of the two away. The memo below is filled on first
   * encounter and read on every later one.
   *
   * ⚠️ KEYED BY INSTANCE IDENTITY, NOT BY `skuID`, AND THAT IS DELIBERATE. A `skuID` key would assume
   * the two collections cannot carry two distinct instances bearing one identifier — an assumption this
   * layer is not entitled to make about a hydration path it does not own, and one that would silently
   * substitute one SKU's projection for another's if it were ever false. Instance identity is exact and
   * assumes nothing.
   *
   * ⚠️ THE EMITTED BODY IS BYTE-IDENTICAL. A shared reference is not observable in JSON: `JSON.stringify`
   * has no reference syntax and writes every occurrence out in full, so a SKU present in both collections
   * still appears in both, with the same fields, in the same order. Order and cardinality are preserved
   * by construction because both collections are still mapped positionally and totally.
   *
   * ⛔ NOT A DE-DUPLICATION AND NOT A SHAPE CHANGE. Both collections remain present, both remain complete,
   * and the five paging numbers cross untouched — `SkuSmartListResponse` still declares the smart list's
   * own seven members. Introducing a page-only response, or replacing `pageRecords` with index ranges into
   * `records`, would be a NEW contract; if that is ever wanted it must be versioned explicitly rather than
   * arrived at here.
   *
   * ⛔ AND NOTHING IS RETAINED BEYOND THIS CALL (M7). The memo is a local, built per response and
   * unreachable once the body is shaped, so no projection survives into another invocation on a warm
   * container.
   */
  const projectionBySku = new Map<Sku, SkuResponse>();
  const project = (sku: Sku): SkuResponse => {
    const remembered = projectionBySku.get(sku);

    if (remembered !== undefined) {
      return remembered;
    }

    const projection = toSkuResponse(sku);
    projectionBySku.set(sku, projection);
    return projection;
  };

  return {
    records: result.records.map(project),
    pageRecords: result.pageRecords.map(project),
    recordsCount: result.recordsCount,
    pageRecordsStart: result.pageRecordsStart,
    pageRecordsEnd: result.pageRecordsEnd,
    currentPage: result.currentPage,
    totalPages: result.totalPages,
  };
}

/* ================================================================================================
 * THE FACTORY
 * ============================================================================================== */

/**
 * Builds the routed SKU boundary over an already-constructed service.
 *
 * ⭐ IT CONSTRUCTS NOTHING AND RESOLVES NOTHING BY NAME, WHICH IS THE WHOLE OF AAP 0.7.3 S3 —
 * "Constructor injection only. No service locator, no dynamic method synthesis, no string-keyed runtime
 * resolution." All four collaborators arrive as parameters, from src/handlers/router.ts, which obtains
 * them from the memoized composition root. There is no `new` in this file, no `getService("name")`, no
 * `Proxy`, no `Reflect`, no decorator, no container import and no indexer dispatch over a name — because
 * re-creating `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281] in a new idiom would defeat
 * the exercise rather than complete it (TR-3).
 *
 * ⭐ EVERY COLLABORATOR IS REQUIRED, SO "MOUNTED WITHOUT A POLICY" IS NOT A REACHABLE STATE. None of the
 * four parameters is optional and none has a default, so a caller cannot omit the authorisation resolver
 * and silently get an open boundary, nor omit the write runner and silently get an unbounded commit.
 * That is the structural default-deny discipline ../ports/AccountContextPort states for its own ports
 * and that ./brandHandler and ./optionHandler apply to their factories: a missing policy is a compile
 * error rather than a permissive default.
 *
 * ⚠️ THE FOURTH PARAMETER IS PRESENT HERE AND ABSENT FROM ./brandHandler AND ./optionHandler, AND THE
 * ASYMMETRY IS EVIDENCE-LED RATHER THAN AN OVERSIGHT. A transaction boundary belongs where a write can
 * leave the database in a state the legacy could not reach, and only two of the four catalog boundaries
 * can: this one, through `createSkus`, whose combination batch is read back mid-flight by its own
 * validation (AAP 0.6.2); and ./productHandler, whose eleven writing members include the three
 * `Product` mutations. `saveBrand` [model/service/BrandService.cfc:L67] and the option members write a
 * single row through the base collaborator with no read-back and no multi-statement sequence, so
 * wrapping them would add a boundary the legacy's request-scoped flush already subsumed — and it would
 * change two factory signatures that ../../test/services/BrandService.test.ts and
 * ../../test/services/OptionService.test.ts already call with two arguments.
 *
 * ⛔ NO STATE AT EITHER SCOPE (AAP 0.6.6 M7). The returned object is created per call and frozen; the
 * nine closures capture only the three injected values. Nothing is memoized, cached, counted, batched or
 * carried between invocations, so a warm container cannot leak one invocation's principal or data into
 * another's. Module scope holds only string constants, frozen literals, types and pure functions — the
 * only module-scope mutable state permitted anywhere in the subtree is the connection pool in
 * src/config/database.ts, which this file does not touch.
 *
 * ⭐ THE PRINCIPAL IS RESOLVED PER INVOCATION, NEVER CAPTURED HERE. `resolveAuthorization` is a
 * FUNCTION rather than an already-resolved context for exactly that reason: the composition root is
 * memoized (AAP 0.4.1.3), so anything captured when the handler is built survives across warm
 * invocations, which is the cross-tenant bleed M7 forbids.
 *
 * ⭐ THE SERVICE IS IMPORTED TYPE-ONLY, SO THE CLASS IS UNREACHABLE FROM HERE AT RUN TIME. Nothing in
 * this module calls its constructor, the import is erased at compile time, and the parameter is narrowed
 * to {@link RoutedSkuSurface} — so the boundary can reach the nine READ-AND-PROCESS members and nothing
 * else. That also keeps the bundled artifact free of service code this entry point does not itself
 * execute.
 *
 * ⛔ AND THE WRITING MEMBER IS NOT AMONG THEM, BY CONSTRUCTION. `createSkus` arrives as
 * {@link ProductSkuCreationBoundary} instead, because it must run inside a transaction whose scope also
 * built the product read it depends on (M5, M6, AAP 0.6.2). Handing this factory a seam that declared
 * `createSkus` is what allowed the untransacted call the review found here; {@link RoutedSkuSurface}
 * removes the possibility rather than warning about it.
 *
 * STRANGLER-FIG INDEPENDENCE (AAP 0.8.3.8). Because all four parameters are types, this module builds,
 * type-checks, bundles and can be exercised with no unconverted Slatwall code present at all: "new
 * TypeScript services must be callable and deployable without requiring the rest of Slatwall to be
 * converted." This folder is where "callable" is realised.
 *
 * TEST PROVENANCE: NET-NEW, in full. No legacy controller test of any kind exists (AAP 0.6.5.2).
 *
 * @param skuService - The SKU service to delegate to, narrowed to the nine members this boundary reads
 *        or processes through. A full service instance satisfies it, and so does an object literal —
 *        which is what makes every member below assertable without a repository, a database, a network
 *        call or an AWS runtime, in a repository that vendors no mocking library (AAP 0.4.3.6).
 * @param createProductSkus - The writing boundary: one transaction per invocation, over collaborators
 *        built from that transaction's scope. Required, and the ONLY way this handler can create
 *        anything; see {@link createProductSkuCreationBoundary}.
 * @param resolveProduct - Turns an addressed product identifier into the entity the two READ members
 *        require. Required; see {@link ProductResolver} for why this is a parameter and not an import.
 *        ⚠️ It is NOT the resolver the writing path uses — that one is built inside the boundary, on the
 *        transaction's own executor.
 * @param resolveAuthorization - Resolves this invocation's principal and its entity-authorisation
 *        verdict from the request. Required: there is no unauthorised construction of this handler.
 * @param runWrite - Runs `createSkus` inside a transaction boundary, against collaborators bound to the
 *        checked-out connection. Required; see {@link TransactionalWriteRunner} and {@link SkuWriteGraph} for why
 *        it is a parameter, why it takes BOTH collaborators, and why the other eight members do not use
 *        it.
 * @returns The nine request-shaped members, frozen.
 *
 * @example
 * ```ts
 * // In router.ts, which owns every route:
 * const skuHandler = createSkuHandler(
 *   container.skuService,
 *   createProductSkuCreationBoundary(container.unitOfWork, container.buildSkuCreationGraph),
 *   resolveProduct,
 *   resolveAuthorization,
 * );
 * const result = await skuHandler.getSkuSmartList(event);
 * ```
 */
export function createSkuHandler(
  skuService: RoutedSkuSurface,
  resolveProduct: ProductResolver,
  resolveAuthorization: InvocationSecurityResolver,
  writeRunner: TransactionalWriteRunner<SkuWriteGraph>,
): SkuHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one routed member.
   *
   * The ladder is reproduced in the legacy's own order, and each step cites the line it comes from:
   *
   *   1. NO PRINCIPAL AT ALL -> unauthorised. The legacy read the account off the framework scope
   *      [org/Hibachi/HibachiScope.cfc:L134-L135] and, with no logged-in session, fell through every
   *      classification test to the terminal `return false` at
   *      [org/Hibachi/HibachiAuthenticationService.cfc:L83].
   *   2. A PRINCIPAL THAT IS NOT LOGGED IN -> unauthorised. [:L30] gates every remaining test on
   *      `getHibachiScope().getLoggedInFlag()`, whose body is `if(!getSession().getAccount().isNew())`
   *      [org/Hibachi/HibachiScope.cfc:L40-L45]. ⚠️ THE LEGACY PREDICATE IS THE NEGATION OF "NEW", so
   *      the test below is on `newFlag` being TRUE rather than false — `AccountReference.newFlag`
   *      carries `isNew()` itself, not the logged-in flag derived from it. Inverting that would admit
   *      exactly the callers the legacy refused.
   *   3. EVERY MEMBER CONTINUES TO THE ENTITY QUESTION at [:L43-L49], whose verdict comes from
   *      the injected port. That port resolves the super-user bypass at [:L88-L90] and the
   *      permission-group walk at [:L93-L98] behind the boundary and returns one boolean.
   *
   * ⭐ SEC-HARDENING (D18-CLASS) — THERE USED TO BE A STEP BETWEEN 2 AND 3, AND REVIEW FINDING F2
   * REMOVED THE ONLY ROW THAT REACHED IT. It read: "AN `'anyLogin'` MEMBER IS ALREADY DECIDED HERE. The
   * branch that authorises its legacy item [:L63-L70] `return true`s outright, asking no permission
   * question and naming no entity, so this gate must stop for that row." That is a faithful reading of
   * [:L63-L70] and ./optionHandler still implements it, for the four rows it still has evidence for. This
   * file no longer has such a row, so the step is gone rather than retained as an unreachable branch — see
   * {@link SkuAccessRequirement} for why the classification arm went with it.
   *
   * ⛔ THE CRUD TYPES WERE ONCE ASKED IN ORDER WITH THE FIRST GRANT WINNING — REVIEW FINDING SEC-AUTH-01
   * (CWE-862, CWE-639). That reading came from the `save` branch's own shape: [:L71-L77] asks for
   * `create` first, returns true if that is granted, and only then asks for `update`. The gate looped over
   * a non-empty tuple so the single-question rows and the two-question row took the same path.
   *
   * ⛔ WHY IT IS GONE. On `createSkus` the loop authorised the operation the caller HELD rather than the
   * one the route PERFORMS: a `create`-only principal named an existing product, satisfied the `create`
   * question asked first, and had the route write SKUs into it. What replaces the loop is ONE primary
   * question per row plus an optional CONJUNCTIVE subordinate one — steps 3 and 4 below — so a row can no
   * longer express "either grant will do", and a row still cannot silently authorise nothing because
   * `crudType` is required by {@link SkuAccessRequirement}.
   *
   * ⭐ THE SUBORDINATE QUESTION IS A CONJUNCTION, NOT AN ALTERNATIVE, and it is asked of the SAME
   * resolved context, so the resolver is still invoked exactly once per invocation.
   *
   * ⭐ THE ENTITY NAME COMES FROM THE MATRIX ROW, NEVER FROM THE REQUEST. ../ports/AccountContextPort
   * requires exactly that of every call site: "no request-supplied value ever reaches this member". The
   * two names it can be are the module constants {@link SKU_ENTITY_NAME} and
   * {@link PRODUCT_ENTITY_NAME}.
   *
   * Steps 1 and 2 answer 401 and step 3 answers 403, and the distinction is about the PRINCIPAL rather
   * than the resource: see {@link unauthorizedResponse} and {@link forbiddenResponse}, where the
   * translation from the legacy login redirect is recorded.
   *
   * ⭐ IT TAKES THE MEMBER NAME, NOT A REQUIREMENT, SO A CALL SITE CANNOT DISAGREE WITH THE MATRIX. The
   * requirement is read from {@link SKU_ACCESS_MATRIX} here, which makes that table the single source of
   * truth for what each member enforces rather than a comment beside the code that enforces it. Because
   * the parameter is `keyof SkuHandler`, a name that is not a routed member does not compile, and a
   * member removed from the surface takes its call sites down with it.
   *
   * ⭐ IT RETURNS THE REFUSAL, NOT A BOOLEAN, AND CALLERS RETURN IT IMMEDIATELY. A boolean would let a
   * member forget to return and fall through into the operation it was supposed to guard; a response
   * value cannot be ignored without the compiler noticing that a branch produces nothing.
   *
   * SYNCHRONOUS, because both port members are — ../ports/AccountContextPort records why — so no
   * member's declared return type changes on its account.
   *
   * @param event the invocation's event, or any object carrying its headers member
   * @param member the routed member being invoked, whose requirement is read from the matrix
   * @param entityID the addressed row, when the route addresses one; it names the PRIMARY question's
   *   entity and is deliberately not forwarded to the subordinate question
   * @returns the refusal to return to the caller, or the authorised context when it is admitted
   */
  const refuseUnauthorized = (
    event: SkuAuthorizationEvent,
    member: keyof SkuHandler,
    entityID?: string,
  ): SkuAuthorizationOutcome => {
    const requirement: SkuAccessRequirement = SKU_ACCESS_MATRIX[member];

    /* ⭐ SEC-AUTH-03 — ONE RESOLUTION, CARRYING THE WHOLE QUESTION: the routed action, the single
     * operation attempted, the entity from this file's own constants, and the addressed identifier when
     * the route addresses one. Still exactly once per invocation, including for the row that also asks a
     * subordinate question below. */
    const authorization: RequestAuthorizationContext = resolveAuthorization(
      toInvocationSecurityRequest(event, {
        action: `${SKU_ACTION_PREFIX}${member}`,
        crudType: requirement.crudType,
        entityName: requirement.entityName,
        ...(entityID === undefined ? {} : { entityID }),
      }),
    );
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2. `newFlag` is `isNew()`, so TRUE means "not logged in".
    if (account === undefined || account.newFlag) {
      return { refusal: unauthorizedResponse() };
    }

    /* Step 3 — the row's single primary question (SEC-AUTH-01). The addressed identifier travels with it
     * so a deployment may scope the grant to the row being acted on. */
    if (
      !authorization.entityAuthorization.authenticateEntity({
        crudType: requirement.crudType,
        entityName: requirement.entityName,
        ...(entityID === undefined ? {} : { entityID }),
      })
    ) {
      return { refusal: forbiddenResponse() };
    }

    /* Step 4 — SEC-AUTH-02's subordinate question, a CONJUNCTION with step 3. Asked of the SAME resolved
     * context, so the resolver is still invoked once. The addressed identifier is deliberately NOT
     * forwarded: it identifies the PRODUCT, and attaching it to a question about `Sku` would tell a
     * resolver something untrue. */
    if (
      requirement.subordinate !== undefined &&
      !authorization.entityAuthorization.authenticateEntity({
        crudType: requirement.subordinate.crudType,
        entityName: requirement.subordinate.entityName,
      })
    ) {
      return { refusal: forbiddenResponse() };
    }

    /* ⭐ THE AUTHORISED CONTEXT IS RETURNED, NOT DISCARDED — SEC-AUTH-03; see ./productHandler's gate. */
    return { authorization };
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L58]
   * `public boolean function createSkus(required any product, required struct data )`.
   *
   * TWO ARGUMENTS, IN THE LEGACY'S ORDER: the PRODUCT first, the PAYLOAD second. Both are `required`
   * there, so both absences are answered here rather than forwarded — judgment (h).
   *
   * ⚠️⚠️ THE PAYLOAD IS FORWARDED EXACTLY AS PARSED — G6 TRANSLATION DECISION (e), MISMATCH M6. The
   * object the body reader produced is handed to the service unchanged: NOT re-keyed, NOT sorted, NOT
   * lower-cased, NOT trimmed, NOT filtered, NOT defaulted, NOT deep-copied and NOT normalised in any
   * other way. AAP 0.6.7.8 is the reason: the odometer at [:L89-L122] enumerates option combinations in
   * an order derived from the payload, and that order "determines both the generated SKU set and … the
   * order in which uniqueness validation observes its siblings" through the read-back loop AAP 0.6.2
   * calls "the single most dangerous thing in the slice". A reshaping here would change the SKUs
   * created WITH NO ERROR AND NO COMPILE FAILURE — which is precisely why the forwarding is one
   * expression with nothing between the reader and the call.
   *
   * ⛔ AND NO BATCH SIZE, CHUNK SIZE OR LIMIT IS IMPOSED ON IT EITHER (AAP 0.7.3 S9). The service owns
   * its own combination budget and states its own reasoning for it; this boundary invents no second one.
   *
   * G6 TRANSLATION DECISION (n) — THE `true` IS REPORTED, NOT REINTERPRETED. [:L207] is an
   * unconditional `return true;`, reached even after the branch preconditions at [:L143], [:L148] and
   * [:L176] have recorded errors on the product, so the value carries NO success semantics. It is
   * serialised as the boolean it is: not translated into a status code, not inverted, not wrapped in an
   * invented envelope, and not replaced by a synthesised outcome. A caller learns what happened the way
   * the legacy caller did — from the product's error state, which the service records where [:L143],
   * [:L148] and [:L176] put it. The one genuinely exceptional path is the discriminator fallthrough at
   * [model/service/SkuService.cfc:L204]; its text is owned by `../errors/DomainError` as
   * `UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE` and is deliberately NOT restated here, so verbatim
   * fidelity stays checkable with a single search per string and no second copy can drift from the
   * first. It travels out as a failure through {@link errorResponse} with its message preserved by the
   * service, which raises it as `LegacyParityError` so the pass-through applies.
   *
   * ⛔ THE GATE RUNS BEFORE ANYTHING IS DONE WITH THE REQUEST, AND BEFORE THE BODY IS PARSED. This is
   * the file's one WRITING row and the only one that asks about `Product` ({@link SKU_ACCESS_MATRIX});
   * refusing first reproduces the legacy order and means an unauthorised caller cannot use the distinct
   * bad-request texts below to discover the request shape, nor learn whether a product exists.
   *
   * ⭐ THE ADDRESSED IDENTIFIER IS *READ* BEFORE THE GATE AS OF REVIEW FINDING SEC-AUTH-01, WHICH IS NOT
   * THE SAME AS BEING ACTED ON. It is read so the question can name the row about to be written, and
   * nothing else observes it until the refusal has been returned: no table is touched, no body is parsed
   * and no distinct message is emitted for a malformed identifier. The anti-enumeration property is
   * therefore intact — an unauthorised caller receives the same 401 or 403 whatever it addresses, which a
   * test pins by asking for a product identifier that exists in no fixture.
   *
   * ⭐ AND IT IS THE ONE MEMBER THAT RUNS INSIDE A TRANSACTION BOUNDARY — judgment (o), MISMATCH M5.
   * The product resolution and the service call BOTH run against the connection the injected
   * {@link TransactionalWriteRunner} checked out, because the batch is read back by its own validation while it is
   * still being written (AAP 0.6.2); the commit is gated on the product's error bag, because [:L207]
   * answers `true` even when [:L143], [:L148] or [:L176] have rejected the batch. The eight other
   * members take no boundary: seven are reads, and `processImageUpload` reaches no table.
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the service's unconditional `true`, or the response describing why it was not attempted
   */
  const createSkus = async (event: CreateSkusEvent): Promise<APIGatewayProxyResult> => {
    /* SEC-AUTH-01 — the addressed product is read FIRST so the gate asks about the operation
     * actually performed (an UPDATE of that product, plus the SKU creations under it) and can name
     * the row it is performed on. Nothing is DONE with it until after the refusal. */
    const productID: string | undefined = readProductIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(event, 'createSkus', productID);

    if (refusal !== undefined) {
      return refusal;
    }

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    /*
     * ⭐ THE BATCH RUNS INSIDE ONE TRANSACTION, AND AN EARLIER REVISION CALLED THE CAPTURED SERVICE
     * DIRECTLY INSTEAD.
     *
     * ../services/SkuService states the requirement in its own words: the persist is unconditional and
     * "the enclosing transaction — opened and closed by the caller, never here — is what discards a
     * failed batch". There was no such caller. Every SKU was written on the pool and every write was
     * already durable by the time validation had an opinion, so an invalid batch COMMITTED: `createSkus`
     * returns `true` unconditionally [model/service/SkuService.cfc:L207], the product's own bag stays
     * empty when the findings are per-SKU, and nothing anywhere rolled anything back. That is the legacy's
     * request-end gate (AAP §0.6.6 M5) simply missing.
     *
     * ⚠️ `batchProduct` IS CAPTURED SO THE GATE CAN SEE WHAT THE WORK BUILT. `runWrite` evaluates the gate
     * after the work settles, and the graph the work used is out of scope by then. The product is the root
     * of everything the batch touched, so holding it is enough to reach both error bags.
     */
    let batchProduct: ProductWithErrorState | null = null;

    /*
     * READ THROUGH A FUNCTION, NOT DIRECTLY, AND THE REASON IS TYPE-SYSTEM RATHER THAN STYLISTIC.
     * `batchProduct` is assigned only INSIDE the work callback, so at the `catch` below the compiler's
     * control-flow analysis still holds the initialiser's `null` and narrows any direct test against it
     * to `never`. Reading it through a function body — where the declared type applies rather than the
     * narrowed one — recovers the real type with no cast and no assertion, which is what the strict
     * settings this package pins are there to force.
     */
    const capturedBatch = (): ProductWithErrorState | null => batchProduct;

    try {
      const created: boolean | null = await writeRunner.runWrite(
        /* SEC-AUTH-03 — the gate's own context, so the SKU inserts, their property population and their
         * audit stamps all run as the principal this route just authorised. */
        authorization,
        async (graph: SkuWriteGraph): Promise<boolean | null> => {
          /* Read through the TRANSACTION's scope, never the captured resolver — see {@link SkuWriteGraph}
           * for why the sibling set the uniqueness rule observes depends on it (M6). */
          const product = await graph.resolveProduct(productID);

          if (product === null) {
            /* A missing product is NOT a failed batch. Nothing has been written, so the gate below finds
             * no findings and the empty transaction commits; the 404 is shaped after it returns. */
            return null;
          }

          batchProduct = product;

          /* M6: `body.value` is passed straight through. Do not interpose a transformation here — see the
           * warning above this member. Judgment (n): the boolean is serialised exactly as returned. */
          return graph.skuService.createSkus(product, body.value);
        },
        /*
         * ⛔ THE COMPLETE PREDICATE, NOT `product.hasErrors()`. `skuBatchHasErrors` reads the product's bag
         * AND every SKU's, because per-SKU rule findings deliberately never merge upward — its own contract
         * carries the full reasoning. Narrowing this to the product alone would silently reinstate exactly
         * the defect above for the commonest failure there is: a batch whose SKU codes collide.
         */
        () => batchProduct !== null && skuBatchHasErrors(batchProduct),
      );

      return created === null ? notFoundResponse() : okResponse(created);
    } catch (error) {
      /*
       * THE ERROR SURFACE IS ASYMMETRIC AND BOTH HALVES CONVERGE HERE. When the gate reports findings
       * the boundary REJECTS, because declining to commit is the only way a boundary can express the
       * legacy's "settled as a rollback" branch — but the findings themselves live on the product, not
       * on the rejection. They are lifted into a ../errors/ValidationError so a caller sees the keys the
       * rule sets declare, copied UNCHANGED as AAP 0.4.1.11 requires. Any other rejection, including
       * the fallthrough `throw("There was an unexpected error when creating this product")` at
       * [model/service/SkuService.cfc:L204], travels out untouched with its message preserved.
       */
      const failedBatch = capturedBatch();

      if (failedBatch !== null && skuBatchHasErrors(failedBatch)) {
        const failure = new ValidationError();

        /*
         * THE COMPLETE BAG, MATCHING THE COMPLETE GATE. `skuBatchHasErrors` above refuses on a finding
         * that lives on a SKU rather than on the product, so lifting `failedBatch.getErrors()` alone
         * would publish an EMPTY `errors` member for exactly that case — a refusal with nothing said
         * about what was refused. The collector merges the product's bag with every SKU's.
         */
        failure.addErrors(collectSkuBatchErrors(failedBatch));

        return errorResponse(failure);
      }

      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L210]
   * `public any function processImageUpload(required any Sku, required struct imageUploadResult)`.
   *
   * TWO ARGUMENTS, IN THE LEGACY'S ORDER: the SKU first, the upload result second. The legacy parameter
   * is spelled with a CAPITAL S and read back as `arguments.Sku` at [:L211]; the service renamed it
   * `sku` and this file follows, which AAP 0.8.1 expressly permits because a parameter name is idiom
   * rather than behavior — judgment (b).
   *
   * ⭐ IT ANSWERS WITH THE IMAGE-WRITE VERDICT, RAW — a bare `true` or `false`. The legacy declaration is
   * `returntype="any"` and its body settles what that means: `return true;` at [:L214] and
   * `return false;` at [:L216], never the entity. TR-1 tightens a loose signature to the observed
   * contract, so ../services/SkuService declares `Promise<boolean>` and this line forwards it unwrapped.
   * A revision projected an entity here instead, on the reading that AAP §0.4.2.2's tabulated
   * `Promise<Sku>` cell outranks TR-1; review finding F2 withdrew it. TODO(parity)
   * [org/Hibachi/HibachiService.cfc:L117] states that "all process methods should return an entity", so the
   * legacy body departs from its own framework — that departure is the legacy's and is carried, and the
   * service's own block holds the full adjudication.
   *
   * ⚠️ A DECLINED WRITE IS AN OUTCOME, NOT A FAILURE, AND IT ANSWERS 200 WITH `false`. [:L213-L217] neither
   * raises nor records on the entity for a declined write, so no status is substituted here either. What a
   * failing PORT raises — as distinct from a declining one — still travels through {@link errorResponse}.
   *
   * G6 TRANSLATION DECISION (g) — THE HIDDEN DYNAMIC DEPENDENCY AND THE BOUNDARY STUB, TR-5. [:L212]
   * reaches the image service through `getService("imageService")`, which is NEVER DECLARED AS A
   * PROPERTY on the component — AAP 0.6.3.2 calls it the "hidden genuine" dependency that "any
   * dependency analysis based on component metadata misses entirely", and a port built from that
   * analysis would compile and then fail at the first image operation. AAP 0.4.1.6 declares it as
   * `ImagePathPort`, which is out of scope, so the write is boundary-stubbed BEHIND THE SERVICE. When
   * that port declines, its not-implemented failure travels out through {@link errorResponse} as a
   * not-implemented status. Nothing about that boundary is reachable from, or duplicated in, this file.
   *
   * G6 TRANSLATION DECISION (j) — THE SKU IS ADDRESSED BY CODE, NOT BY IDENTIFIER, AND THE SERVICE'S OWN
   * READER RESOLVES IT. The contract takes the ENTITY, and this member's only route to one within its
   * declared collaborators is `getSkuBySkuCode` [:L289] — the SKU's own service declares no
   * `getSku(skuID)` reader in {@link SkuSurface}, because AAP 0.4.2.5 lists none for this service and
   * "synthesis is not reproduced wholesale, only where used". Using the code is therefore the honest
   * option rather than a preference: the column is `unique="true"` [model/entity/Sku.cfc:L54], so it
   * addresses exactly one row, and no new dependency is introduced to reach it.
   *
   * ⛔ THERE IS NO STORED-FILE-NAME GATE IN EITHER LAYER, AND ITS REMOVAL IS DELIBERATE (review finding
   * F4). A revision of the service refused a stored `imageFile` that was not a single path segment with a
   * permitted extension, and this paragraph used to describe that refusal arriving here as a verdict. The
   * gate refused input the legacy ACCEPTS — [:L212] composes the path and asks the image service to write
   * it whatever the column holds — so AAP §0.6.7.7, which makes D18 the sole declared hardening
   * exception, and AAP §0.8.2 Guideline 4 both exclude it. Nothing is pre-empted here either: this layer
   * adds no check of its own, because inventing one would put a policy the legacy never had into a second
   * place as well. The residual exposure is flagged on {@link ImagePathPort.saveImageFile}, where an
   * adapter that knows its own storage root can confine the write.
   *
   * ⛔ THE GATE RUNS FIRST, AND THIS ROW IS `'secure'`: `update` on `Sku`. It was `'anyLogin'` until
   * review finding F2; {@link SKU_ACCESS_MATRIX} carries the full derivation, including the measurement
   * that the member has zero callers anywhere in the legacy tree and therefore no callers for a tighter
   * requirement to refuse.
   *
   * @param event the proxy event, or any object carrying its body, path-parameters and headers members
   * @returns the addressed SKU, PROJECTED per judgment (k), or the response describing why the write was
   *          not reached
   */
  const processImageUpload = async (
    event: ProcessImageUploadEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'processImageUpload');

    if (refusal !== undefined) {
      return refusal;
    }

    const skuCode: string | undefined = readSkuCode(event);

    if (skuCode === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SKU_CODE_REQUIRED_MESSAGE);
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      // Judgment (j): the contract takes the entity, so the addressed code is resolved first.
      const sku: Sku | null = await skuService.getSkuBySkuCode(skuCode);

      if (sku === null) {
        return notFoundResponse();
      }

      /* THE VERDICT IS THE ANSWER, RAW. [model/service/SkuService.cfc:L213-L217] contains exactly two
       * returns, `return true;` and `return false;`, so the boolean IS the member's observable value and
       * this boundary publishes it unwrapped — no envelope, no `{ saved: … }` object and no status
       * substitution, none of which the legacy has any counterpart for (AAP §0.7.3 S9). ./httpResponse
       * serialises a bare boolean exactly as it serialises a projected entity.
       *
       * ⛔ DO NOT REPLACE THE VERDICT WITH A PROJECTED SKU. A revision did, on the reading that AAP
       * §0.4.2.2's tabulated `Promise<Sku>` outranks TR-1's tightening of a loose `any` to the observed
       * contract; review finding F2 withdrew it, and ../services/SkuService carries the full adjudication.
       * Judgment (k)'s projection rule governs the members that DO answer with an entity, and this is not
       * one of them.
       *
       * ⚠️ A DECLINED WRITE IS STILL 200. [:L216] returns `false` and records nothing, so `false` is a
       * reported OUTCOME rather than a failure; answering 4xx or 5xx for it would invent a status the
       * legacy never produced.
       *
       * The upload result is forwarded opaquely, because the port consumes it and this layer does not
       * read it. */
      return okResponse(await skuService.processImageUpload(sku, body.value));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L220]
   * `public array function getProductSkus(required any product, required boolean sorted, boolean
   * fetchOptions=false)`.
   *
   * THREE ARGUMENTS, IN THE LEGACY'S ORDER: the PRODUCT, then `sorted`, then `fetchOptions`.
   *
   * ⚠️ `sorted` IS REQUIRED AND IS NOT DEFAULTED HERE — AAP 0.4.2.2 DISCREPANCY 2, which corrects the
   * casual reading that would have made it optional and also records that the member is at [:L220]
   * rather than where a declaration scan tends to place it. An absent `sorted` is a BAD REQUEST, not a
   * silent `false`: defaulting it would answer an explicit request for sorted output with unsorted
   * output, and TR-1 preserves arity as well as order. `fetchOptions` is the ONLY optional argument
   * [:L220], and when it is absent the argument is OMITTED from the call so the service's own
   * `fetchOptions = false` default applies — rather than passing an explicit `false`, which would make
   * this boundary the place the default lives.
   *
   * ⚠️ TODO(parity) D13 — A SORTED REQUEST CAN FAIL, AND THE FAILURE IS PRESERVED UNGUARDED.
   * [:L234-L238] computes `var index = arrayFind(sortedArray, skuID)` and assigns
   * `sortedArrayReturn[index] = skus[i]`. `arrayFind` answers 0 on a miss and CFML arrays are ONE-BASED,
   * so position 0 does not exist and the assignment throws. AAP 0.6.7.4 records why the miss is
   * reachable rather than hypothetical: `getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172] returns
   * ONLY option-bearing SKUs, so an option-less SKU in the collection is absent from the sorted list.
   * THIS MEMBER ADDS NO GUARD, NO SKIP, NO FILTER, NO FALLBACK, NO RETRY AND NO PRE-CHECK — judgment
   * (d). The failure travels out of the service and is shaped by {@link errorResponse} like any other,
   * because repairing it would make the port's output incomparable to the legacy's (IR-9), and
   * AAP 0.8.2 Guideline 4 forbids the repair outright.
   *
   * ⛔ ORDER IS THE ANSWER HERE, SO THE PROJECTION PRESERVES IT EXACTLY. {@link toSkuResponses} maps
   * positionally and totally: nothing is reordered, dropped, de-duplicated or compacted, because doing
   * any of those would silently undo the very computation `sorted` asked for.
   *
   * ⛔ THE GATE RUNS BEFORE ANY PARAMETER IS READ. `read` on `Sku` ({@link SKU_ACCESS_MATRIX}), and
   * refusing first means an unauthorised caller cannot use the three distinct bad-request texts below to
   * probe the request shape, nor learn whether a product exists.
   *
   * @param event the proxy event, or any object carrying its path-parameters, query-string-parameters
   *        and headers members
   * @returns the projected SKUs, or the response describing why they could not be returned
   */
  const getProductSkus = async (event: ProductSkusEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getProductSkus');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    /* Discrepancy 2: `sorted` is REQUIRED, so absence is refused rather than defaulted. The reader's
     * three states are all distinguished — see {@link readCfmlBoolean}. */
    const sorted: boolean | null | undefined = readCfmlBoolean(event, SORTED_QUERY_PARAMETER);

    if (sorted === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SORTED_REQUIRED_MESSAGE);
    }

    if (sorted === null) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SORTED_NOT_BOOLEAN_MESSAGE);
    }

    const fetchOptions: boolean | null | undefined = readCfmlBoolean(
      event,
      FETCH_OPTIONS_QUERY_PARAMETER,
    );

    /* Present but unrecognised is refused; ABSENT is forwarded as absence, so the service's own
     * `fetchOptions = false` default at [:L220] remains the single place that default lives. */
    if (fetchOptions === null) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, FETCH_OPTIONS_NOT_BOOLEAN_MESSAGE);
    }

    try {
      const product = await resolveProduct(productID);

      if (product === null) {
        return notFoundResponse();
      }

      /* D13: nothing here guards the sorted path. Two call shapes rather than one, so that omitting
       * `fetchOptions` really omits the argument instead of supplying a value on the legacy's behalf. */
      const skus =
        fetchOptions === undefined
          ? await skuService.getProductSkus(product, sorted)
          : await skuService.getProductSkus(product, sorted, fetchOptions);

      return okResponse(toSkuResponses(skus));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L246]
   * `public array function getSortedProductSkus(required any product)`.
   *
   * ONE ARGUMENT, the product, which is `required` — so an unaddressed product is refused here rather
   * than forwarded (judgment (h)).
   *
   * IT IS NOT A SPECIAL CASE OF {@link SkuHandler.getProductSkus}, AND CONFLATING THEM WOULD CHANGE
   * BEHAVIOR. This member reads the product's OWN collection at [:L248] rather than querying, and it
   * returns a collection of fewer than two elements UNREORDERED at [:L250-L252]. Routing it through the
   * three-argument member with `sorted = true` would take a different path, so both stay declared and
   * both stay routed — TR-1 preserves the member, not merely the capability.
   *
   * ⚠️ TODO(parity) D13 — IT CARRIES THE SAME UNGUARDED INDEX-ZERO FAILURE at [:L262-L266], for the same
   * reason and with the same treatment as the sibling member: no guard, no skip, no filter, no fallback,
   * no pre-check. Judgment (d) records the full account once.
   *
   * ⛔ ORDER IS THE ANSWER, SO THE PROJECTION PRESERVES IT EXACTLY — {@link toSkuResponses}.
   *
   * ⛔ THE GATE RUNS FIRST. `read` on `Sku` ({@link SKU_ACCESS_MATRIX}).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the projected SKUs in option-group order, or the response describing why they could not be
   *          returned
   */
  const getSortedProductSkus = async (
    event: SortedProductSkusEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSortedProductSkus');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID: string | undefined = readProductIdentifier(event);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_REQUIRED_MESSAGE);
    }

    try {
      const product = await resolveProduct(productID);

      if (product === null) {
        return notFoundResponse();
      }

      // D13: unguarded, deliberately. Judgment (d).
      return okResponse(toSkuResponses(await skuService.getSortedProductSkus(product)));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L271]
   * `public any function searchSkusByProductType(string term,string productTypeID)`.
   *
   * ⚠️ BOTH ARGUMENTS ARE OPTIONAL — AAP 0.4.2.2 DISCREPANCY 3. Neither carries `required` at [:L271],
   * so neither absence is an error and THERE IS NO BAD-REQUEST PATH ON THIS MEMBER AT ALL: an absent
   * value is forwarded as absence and the search behaves as the legacy's did with nothing bound
   * (judgment (h)). Inventing a requirement here would reject calls the legacy accepted.
   *
   * THE ORDER IS `term` THEN `productTypeID`, exactly as declared. Both are strings, so transposing them
   * would compile cleanly and return wrong rows with no error anywhere — which is why the order is
   * called out rather than assumed.
   *
   * G6 TRANSLATION DECISION (f) — THE SINGULAR NAME IS PRESERVED, AND THE ASYMMETRY WITH THE PRODUCT
   * SIDE IS DELIBERATELY NOT HARMONISED. AAP 0.4.2.2 Discrepancy 6 records that this service's argument
   * is SINGULAR `productTypeID` [:L271] while `ProductDAO.searchProductsByProductType`
   * [model/dao/ProductDAO.cfc:L419] takes the PLURAL `productTypeIDs`. The divergence is in the legacy
   * source; renaming either side would be a silent contract change, and TR-1 preserves the argument name
   * as declared. So the query parameter, the constant that names it and the argument all stay singular.
   *
   * THE RESULT IS FORWARDED AS THE SERVICE PRODUCED IT, NOT PROJECTED. The rows are the flat
   * `{ id, value }` select projection the repository port declares — no entity, no relationship, no
   * reference cycle — so there is nothing to narrow and nothing to break by serialising it. Order and
   * cardinality are preserved: nothing is sorted, filtered, de-duplicated or truncated, and no result
   * limit is imposed (AAP 0.7.3 S9).
   *
   * ⛔ THE GATE RUNS FIRST. `read` on `Sku` ({@link SKU_ACCESS_MATRIX}). Because this member has no
   * bad-request path, the gate is the ONLY thing standing between an anonymous caller and a catalog-wide
   * search, which is why it is not conditional on the parameters being present.
   *
   * @param event the proxy event, or any object carrying its query-string-parameters and headers members
   * @returns the search rows exactly as produced, or the refusal
   */
  const searchSkusByProductType = async (
    event: SearchSkusEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'searchSkusByProductType');

    if (refusal !== undefined) {
      return refusal;
    }

    /* Both optional (Discrepancy 3): read, and forward whatever came — including nothing. Values are
     * not trimmed, case-folded or wildcard-wrapped here; the repository owns the term's treatment. */
    const term: string | undefined = readQueryStringParameter(event, TERM_QUERY_PARAMETER);
    const productTypeID: string | undefined = readQueryStringParameter(
      event,
      PRODUCT_TYPE_ID_QUERY_PARAMETER,
    );

    try {
      // Judgment (f): SINGULAR `productTypeID`, second, exactly as [:L271] declares it.
      return okResponse(await skuService.searchSkusByProductType(term, productTypeID));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L281]
   * `public boolean function getSkuStocksDeletableFlag( required string skuID )`.
   *
   * ⚠️⚠️ TODO(parity) D4 — THIS ROUTE CAN NEVER SUCCEED, AND IT SAYS SO INSTEAD OF PRETENDING.
   * [:L282] forwards to `getSkuDAO().getSkuStocksDeletableFlag(...)`, and that DAO member IS DECLARED
   * NOWHERE IN THE LEGACY REPOSITORY — model/dao/SkuDAO.cfc declares six public members and none of them
   * is it — so the only legacy path that reaches it, `Sku.getStocksDeletableFlag()`
   * [model/entity/Sku.cfc:L567-L572], has never been able to resolve. ../services/SkuService therefore
   * returns a rejected promise carrying a not-implemented failure, which AAP 0.4.2.2 requires: the member
   * is ported "as an explicit not-implemented boundary that documents the defect".
   *
   * ⛔ NO SUBSTITUTE VALUE IS EVER RETURNED FROM THIS PATH. Not `true`, not `false`, not `null`, not an
   * empty body, not an empty collection and not a fabricated flag of any kind. The failure is shaped by
   * {@link errorResponse} into a not-implemented status, so a caller learns the capability is absent
   * rather than being handed an answer nobody computed. Substituting `true` would authorise a delete the
   * legacy never authorised; substituting `false` would block one it never blocked. Both are inventions,
   * and AAP 0.8.2 Guideline 4 names this defect specifically as one a competent engineer "would
   * instinctively fix". It is not fixed.
   *
   * ⭐ AND THE ROUTE STAYS MOUNTED, WHICH IS TR-5: "The member is never quietly dropped from the
   * interface." Deleting it would hide a real gap in the legacy system behind a missing route, which is
   * the opposite of the honesty AAP 0.6.7 asks for.
   *
   * THE ARGUMENT IS `required` [:L281], so an unaddressed SKU is refused here — judgment (h) — and the
   * refusal is a bad request rather than the not-implemented failure, because "you addressed no SKU" and
   * "this capability does not exist" are different facts and collapsing them would obscure the second.
   * The success expression is written out even though it is unreachable today: it is the honest
   * expression of the declared contract, and it is what would carry the answer if the absent DAO member
   * were ever supplied.
   *
   * ⛔ THE GATE RUNS FIRST. `read` on `Sku` ({@link SKU_ACCESS_MATRIX}) — see the matrix for why a flag
   * that informs a later delete decision is still a `read`.
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the not-implemented failure, always — or the refusal, or the bad request
   */
  const getSkuStocksDeletableFlag = async (
    event: SkuIdentifierEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSkuStocksDeletableFlag');

    if (refusal !== undefined) {
      return refusal;
    }

    const skuID: string | undefined = readSkuIdentifier(event);

    if (skuID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, SKU_ID_REQUIRED_MESSAGE);
    }

    try {
      /* D4: the service's promise always rejects, so control always leaves through the catch below and
       * the not-implemented failure reaches the caller intact. Nothing is substituted for it. */
      return okResponse(await skuService.getSkuStocksDeletableFlag(skuID));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L285]
   * `public boolean function getTransactionExistsFlag()`.
   *
   * ⚠️ ZERO ARGUMENTS DECLARED, TWO ARGUMENTS ACCEPTED — AND THIS ROUTE CARRIES BOTH. Judgment (a) holds
   * the full account. In short: `[:L285]` names no formal parameter, `[:L286]` forwards
   * `argumentCollection=arguments`, and CFML puts an UNDECLARED named argument into that collection, so
   * both real callers scope the probe through a signature that names neither —
   * [model/entity/Sku.cfc:L594] with `skuID=` and [model/entity/Product.cfc:L626] with `productID=`.
   * ../services/SkuService therefore declares `(skuID?, productID?)` under TR-1 ("the target signature is
   * tightened to the observed contract"), and this boundary binds exactly those two, optionally.
   *
   * =================================================================================================
   * ⭐ A REVISION PUBLISHED THIS ROUTE AS A PERMANENT 501, AND REVIEW FINDING F1 WITHDREW IT
   * =================================================================================================
   * That revision narrowed the service member to zero parameters, narrowed {@link TransactionExistsEvent}
   * to the headers alone, and translated the repository's inevitable refusal into a fixed
   * not-implemented status. The reasoning was internally consistent and rested on a false premise: that
   * AAP §0.4.2.2's Discrepancy 4 froze the member at zero arguments. Discrepancy 4 records the
   * DECLARATION, and TR-1 is the rule that governs what the port declares when a legacy signature is
   * looser than its observed contract. The consequence of getting that wrong was a public route that could
   * never answer the scoped question its two legacy callers ask — a member published as permanently
   * unusable when the legacy uses it on every product and SKU delete.
   *
   * ⛔ SO NO STATUS IS MANUFACTURED HERE ANY MORE. A scoped probe answers the repository's boolean. An
   * UNSCOPED probe — neither identifier supplied — reaches the refusal
   * ../adapters/mysql/MySqlSkuRepository raises before it composes any statement, which reproduces
   * [model/dao/SkuDAO.cfc:L90]'s dereference of a key that is not there, and {@link errorResponse} shapes
   * it exactly as it shapes any other service failure. Nothing is pre-empted and nothing is
   * reclassified (IR-9).
   *
   * ⛔ AND NO IDENTIFIER IS DEFAULTED TO MAKE THE UNSCOPED CASE "WORK". Substituting an empty string
   * would match no row and answer `false` — and a `false` from this flag PERMITS A DELETE
   * ([model/validation/Product.json:L12], [model/validation/Sku.json]), so a fabricated answer here would
   * authorise a deletion the legacy refuses to authorise. {@link readTransactionScopeIdentifier} moves in
   * the same direction for the same reason: the `unsavedvalue=""` sentinel collapses to ABSENT rather than
   * being forwarded as a scope no row can satisfy.
   *
   * ⭐ BOTH IDENTIFIERS ARE FORWARDED SKU-FIRST, MATCHING THE SERVICE. The service crosses them onto the
   * repository's product-first order [model/dao/SkuDAO.cfc:L54-L55] on one line of its own body; this
   * boundary performs NO crossing, which is why the argument order here is the service's and not the
   * DAO's. Both are 32-character strings (IR-6), so a transposition would type-check — which is why the
   * order is stated at every layer and asserted in `test/services/SkuService.test.ts`.
   *
   * ⛔ THE PRECEDENCE BETWEEN THE TWO IS NOT REPRODUCED HERE EITHER. [model/dao/SkuDAO.cfc:L58] lets
   * `skuID` win when both are present; that belongs to the repository, and this boundary forwards both
   * slots untouched rather than dropping one.
   *
   * ⛔ THE GATE STILL RUNS FIRST, WHICH IS THE ANTI-ENUMERATION PROPERTY. Because the refusal is decided
   * before any identifier is read, an unauthorised caller cannot tell this route's failure apart from any
   * other, and cannot use it to discover which SKUs or products exist. `read` on `Sku`
   * ({@link SKU_ACCESS_MATRIX}).
   *
   * @param event the invocation's event, or any object carrying its query-string-parameters and headers
   *   members
   * @returns the scoped boolean, the refusal, or — for an unscoped probe — the service failure the legacy
   *   itself produces for that call shape
   */
  const getTransactionExistsFlag = async (
    event: TransactionExistsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getTransactionExistsFlag');

    if (refusal !== undefined) {
      return refusal;
    }

    /* Both optional, both forwarded as received — including as nothing. Judgment (h): an argument the
     * legacy declares without `required` is forwarded absent rather than refused here. */
    const skuID: string | undefined = readTransactionScopeIdentifier(event, SKU_ID_QUERY_PARAMETER);
    const productID: string | undefined = readTransactionScopeIdentifier(
      event,
      PRODUCT_ID_QUERY_PARAMETER,
    );

    try {
      /* SKU-FIRST, matching ../services/SkuService's own parameter order. The single crossing onto the
       * repository's product-first order happens inside that service, not here. */
      return okResponse(await skuService.getTransactionExistsFlag(skuID, productID));
    } catch (error) {
      /* An unscoped probe lands here, carrying the repository's own refusal. It is shaped like any other
       * service failure — deliberately not reclassified into a fixed status, because the failure belongs
       * to the legacy [model/dao/SkuDAO.cfc:L90] rather than to this boundary. */
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L289]
   * `public any function getSkuBySkuCode( string skuCode )`.
   *
   * ONE ARGUMENT, AND IT IS OPTIONAL — there is no `required` keyword at [:L289] — while the lookup one
   * layer down declares it `required` [model/dao/SkuDAO.cfc:L102]. ../services/SkuService preserves that
   * looseness deliberately and raises at the point the legacy raises.
   *
   * =================================================================================================
   * ⭐ AN UNADDRESSED CODE IS FORWARDED, NOT REFUSED HERE — JUDGMENT (h) APPLIED WITHOUT EXCEPTION
   * =================================================================================================
   * Judgment (h) states the rule this file follows everywhere: an argument the legacy declares `required`
   * is answered here with a bad request, and an argument it declares WITHOUT `required` is forwarded as
   * absent, "so whatever the legacy would have done with the omission still happens where the legacy does
   * it." `skuCode` is in the second class.
   *
   * ⚠️ A REVISION ADDED A `400` PRECHECK HERE, and review finding F5 withdrew it. Its reasoning was that a
   * plain `DomainError` presents as a SERVICE FAULT, so a caller who forgot the path parameter received
   * **500**, and that every sibling answers **400** and names the parameter. The observation about the
   * status was accurate; the remedy was not. The precheck advertised a REQUIRED route over an OPTIONAL
   * service parameter, so the published contract contradicted the member it publishes — and 500 is in fact
   * the faithful answer, because the legacy fails exactly this way: the omission passes the loose service
   * signature at [:L289] and dies at the DAO's `required string skuCode` [model/dao/SkuDAO.cfc:L102],
   * which under CFML is a server-side error page. The failure layer stays authoritative.
   *
   * ⛔ WHICH DOES NOT MAKE `processImageUpload`'s OWN `400` INCONSISTENT WITH THIS, and the distinction is
   * worth stating because both members read the same parameter through the same {@link readSkuCode}. That
   * member's SERVICE contract is `required any Sku` [model/service/SkuService.cfc:L210] — an ENTITY, not a
   * code — so this boundary must resolve one before it can call at all, and a request that addressed no
   * code has failed to address the required argument. Here the code IS the argument, and it is optional.
   * The two answers differ because the two legacy signatures differ.
   *
   * ⚠️ THE EMPTY CODE IS FORWARDED TOO, AND FOR A SEPARATE REASON. {@link readSkuCode} records the
   * evidence: [model/entity/Sku.cfc:L54] declares `skuCode` with `unique="true"` and NO `unsavedvalue` and
   * NO `default`, so the empty string is a VALUE rather than a sentinel and the legacy would have run the
   * lookup for it. It reaches the repository and comes back as a miss, which is the 404 below.
   *
   * ⚠️ A MISS IS `null` AND MUST STAY `null` — IT IS NOT AN ERROR AND MUST NOT BECOME ONE. The
   * out-of-scope caller [model/service/PhysicalService.cfc:L199] does
   * `if(!isNull(sku)){ … } else { skuCodeError++; }` — it counts misses as a data-quality tally — so
   * raising on a miss would convert a benign import warning into a failed import. This member answers a
   * miss with a not-found status and nothing else: it does not create, it does not retry with a different
   * predicate, and it does not fall back to an alternate lookup. The alternate-code fallback the legacy
   * DAO performs at [model/dao/SkuDAO.cfc:L102-L104] is already inside the repository, one layer down,
   * and is not repeated here.
   *
   * ⛔ THE GATE RUNS BEFORE THE CODE IS READ, WHICH IS THE ANTI-ENUMERATION PROPERTY. Because the
   * refusal is decided without consulting the code or the repository, an unauthorised caller receives the
   * SAME response for a code that exists and one that does not — gating after the lookup would have made
   * this member an existence oracle over a unique business key. `read` on `Sku`
   * ({@link SKU_ACCESS_MATRIX}).
   *
   * @param event the proxy event, or any object carrying its path-parameters and headers members
   * @returns the projected SKU, the not-found response for a miss, or — for an unaddressed code — the
   *   service failure the legacy itself produces for that call shape
   */
  const getSkuBySkuCode = async (event: SkuCodeEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSkuBySkuCode');

    if (refusal !== undefined) {
      return refusal;
    }

    /* `readSkuCode` reports only GENUINE absence; an empty code is a value, not a sentinel. BOTH are
     * forwarded, because [:L289] declares the argument without `required` — judgment (h). */
    const skuCode: string | undefined = readSkuCode(event);

    try {
      /* ⛔ NO PRECHECK. `undefined` is forwarded, and the service's own `DomainError` — raised at the point
       * [model/dao/SkuDAO.cfc:L102]'s `required` fails in the legacy — is what answers. See the ⭐ section
       * above for why a boundary-authored 400 was withdrawn under review finding F5. */
      const sku: Sku | null = await skuService.getSkuBySkuCode(skuCode);

      // A miss stays a miss. PROJECTED, never serialised whole; see {@link SkuResponse}.
      return sku === null ? notFoundResponse() : okResponse(toSkuResponse(sku));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/SkuService.cfc:L309]
   * `public any function getSkuSmartList(struct data={}, currentURL="")`.
   *
   * TWO ARGUMENTS, BOTH OPTIONAL WITH DEFAULTS at [:L309], so there is NO BAD-REQUEST PATH on this
   * member: an empty query string is the legal, meaningful `data={}` case, and it is what all six
   * in-repository callers effectively pass — `integrationServices/google/controllers/feed.cfc:L63` among
   * them. An unrecognised query key is IGNORED rather than rejected, exactly as
   * [org/Hibachi/HibachiSmartList.cfc:L98-L135] ignored it.
   *
   * G6 TRANSLATION DECISION (l) — ONLY THE KEYS THE LEGACY INTERPRETER RECOGNISED ARE FORWARDED, AND NO
   * PAGINATION IS INVENTED. {@link readSmartListInput} carries the reasoning and cites the line that
   * recognises each key. Nothing is added: no page size, no default limit, no maximum, no ordering and no
   * keyword (AAP 0.7.3 S9) — and the service states the same rule from its own side, that "No pagination
   * default, filter or ordering is invented".
   *
   * `currentURL` IS DELIBERATELY NOT PASSED, AND ITS ABSENCE IS NOT A DROPPED ARGUMENT. The service
   * declares it — preserving the legacy arity — and documents that it accepts and does not forward it,
   * because [:L312] used it only to build saved-state and paging URLs for the CFML view layer
   * [org/Hibachi/HibachiSmartList.cfc:L39], and a headless service has no view layer (AAP 0.3.4).
   * Supplying a request path here would invent a value the port cannot consume; the argument is optional,
   * so omitting it is the faithful call.
   *
   * ⛔ THE PAGE IS PROJECTED, NOT SERIALISED WHOLE — {@link toSkuSmartListResponse}. Both record
   * collections carry {@link SkuResponse}, and the five paging numbers are copied across exactly as the
   * smart list computed them: never recomputed, clamped, re-based or defaulted.
   *
   * ⛔ THE GATE RUNS BEFORE THE QUERY STRING IS EVEN ENUMERATED. `read` on `Sku`
   * ({@link SKU_ACCESS_MATRIX}). This is the widest read in the file — with no filter supplied it
   * describes every SKU in the catalog — so the gate is the one thing that must not be reachable without
   * a principal, and it is not conditional on any parameter being present.
   *
   * @param event the proxy event, or any object carrying its query-string-parameters and headers members
   * @returns the projected page, or the refusal
   */
  const getSkuSmartList = async (event: SkuSmartListEvent): Promise<APIGatewayProxyResult> => {
    const { refusal } = refuseUnauthorized(event, 'getSkuSmartList');

    if (refusal !== undefined) {
      return refusal;
    }

    // Judgment (l): the recognised subset of the query string, and nothing invented.
    const data: SmartListInput = readSmartListInput(event);

    try {
      // `currentURL` omitted deliberately; see the note above. The page is projected, never whole.
      return okResponse(toSkuSmartListResponse(await skuService.getSkuSmartList(data)));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /*
   * ⛔ FROZEN, AND EXACTLY NINE MEMBERS. `newSku` is declared on {@link SkuSurface} and deliberately not
   * published here — {@link SkuHandler} records the three pieces of evidence for that, and because the
   * returned object is typed as that interface, router.ts has no member to mount even by accident. There
   * is no `countSku*`, `listSku*`, `exportSku*` or compound reader either: AAP 0.4.2.5 reproduces
   * synthesis "only where used", and the slice uses none of them.
   *
   * Freezing is the run-time half of what the readonly members state in the type system, and it is the
   * same requirement AAP 0.6.6 M7 places on everything outside the connection pool — a warm Lambda
   * container is shared across invocations and therefore potentially across tenants, so a mounted
   * boundary that could be reassigned in flight would be exactly the bleed M7 forbids.
   */
  return Object.freeze({
    createSkus,
    processImageUpload,
    getProductSkus,
    getSortedProductSkus,
    searchSkusByProductType,
    getSkuStocksDeletableFlag,
    getTransactionExistsFlag,
    getSkuBySkuCode,
    getSkuSmartList,
  });
}

/* =====================================================================================================
 * THE LAMBDA ENTRY POINT
 *
 * Everything above this line is a pure function of its dependencies and stays that way: it constructs
 * nothing, resolves nothing by name, and is assertable with hand-written doubles and no database
 * (AAP §0.7.3 S6). Everything below is the boundary that makes the emitted artifact invocable — one
 * `handler` export built from the composition root, for the bundle `build/esbuild.mjs` writes from this
 * file. The AAP declares six Lambda entry artifacts and this file is one of them, so the artifact has
 * to carry an entry symbol the runtime can address.
 *
 * ⭐ THE COMPOSITION ROOT IS REACHED THROUGH A DEFERRED REQUIRE, and that is the one subtle thing here.
 * `../config/container` reaches `../config/database`, whose `mysql2` pool is created at module scope,
 * and `../config/env`, which validates the environment as a module-load side effect. A STATIC import
 * would run both when this module is loaded — including by `test/services/SkuService.test.ts`'s folded `skuHandler` block, which has
 * neither an environment nor a database. Deferring it to the first invocation keeps module load free of
 * side effects while the pool still lives at module scope of the module that owns it, created once and
 * reused across warm invocations exactly as AAP §0.3.2 requires.
 *
 * ⚠️ THE DEFERRAL IS EXPRESSED AS A CommonJS `require`, AND AN EARLIER REVISION GOT THIS WRONG. It read
 * `await import('../config/container.js')`, on the reasoning that a dynamic import inside a CommonJS
 * module is a real ECMAScript import, that `moduleResolution: NodeNext` requires the extension there,
 * and that `tsc` and esbuild both resolve it to this subtree's TypeScript source. The last clause held
 * for type-checking and for the packaged artifact, and failed at runtime for the sources: NodeNext
 * PRESERVES the native `import()` in CommonJS output, so the ESM resolver demanded an on-disk
 * `src/config/container.js` that only an emit produces — so running the source answered `500` for every
 * action while the artifact answered correctly. The measurement and the rejected alternatives are
 * recorded at the require itself.
 *
 * ⚠️ THE READ-BACK ORDERING OF §0.6.2 IS NOT WEAKENED BY THIS SECTION. `sku.createSkus` is routed
 * through the same creation boundary the router uses — the container's SKU write runner — so each
 * sibling insert stays visible to the next uniqueness read inside one transaction. This section adds an
 * address for the member; it does not add a second path into it.
 *
 * ⛔ THE ROUTE NAMES ARE DECLARED HERE, ONCE. `./router.ts` composes {@link createSkuRoutes} into the
 * aggregate surface rather than restating these nine keys.
 * ================================================================================================== */

/**
 * The actions this entry point serves, in the legacy `slatAction` vocabulary.
 *
 * `sku.` is the surface prefix and the suffix is the member name. All nine public members of
 * AAP §0.4.2.2 are routed, including the two whose implementations are declared boundaries —
 * `processImageUpload` (the image port) and `getSkuStocksDeletableFlag` (defect D4, a DAO member that
 * exists nowhere in the legacy repository). Both answer with the boundary's own classified failure
 * rather than being omitted from the surface, which is what AAP TR-5 requires: the member stays on the
 * interface and the gap is flagged.
 */
export type SkuRouteKey =
  | 'sku.createSkus'
  | 'sku.processImageUpload'
  | 'sku.getProductSkus'
  | 'sku.getSortedProductSkus'
  | 'sku.searchSkusByProductType'
  | 'sku.getSkuStocksDeletableFlag'
  | 'sku.getTransactionExistsFlag'
  | 'sku.getSkuBySkuCode'
  | 'sku.getSkuSmartList';

/**
 * Builds the SKU handler from the composition root.
 *
 * The wiring lives here rather than in `./router.ts` because this file knows which collaborators the SKU
 * surface needs. The product resolver is a one-member delegation to the product service rather than the
 * whole service, which keeps the SKU surface's dependency on it as narrow as the legacy call it replaces.
 *
 * ⚠️ THE PARAMETER IS NARROWED TO THE MEMBERS THIS SURFACE READS, AND THE NARROWING IS LOAD-BEARING.
 * It used to be the whole `CatalogContainer`, which meant only the aggregate graph could satisfy it — and
 * the aggregate graph is every collaborator of the slice. Asking for just these members lets BOTH the
 * aggregate root (`../config/container.ts`, which `./router.ts` passes) and this entry's own narrow graph
 * (`../config/container.ts`'s `getSkuSurfaceGraph`) satisfy it, which is what keeps this factory
 * exercisable with an object literal instead of a whole graph (PERF-01). The type import of the container
 * stays: a `type` position is erased at emit, so it adds no load-time edge.
 *
 * ⚠️ WHAT THE NARROWING NO LONGER BUYS, STATED SO THE CLAIM MATCHES THE TREE. An earlier revision put the
 * narrow graph in its own module, `src/config/surfaces/skuSurface.ts`, and this note said the narrowing
 * removed this artifact's module EDGE to collaborators no route here can reach. AAP §0.3.1 enumerates 102
 * files and that module was not among them, so it is folded into the composition root: requiring the root
 * now reaches the whole of it, and the bundler can no longer drop the unreached half per artifact. That is a
 * package-SIZE consequence and nothing more — the finding itself labelled the figure a disclosure rather
 * than a budget, and IR-12 forbids restating it as a threshold. What survives is the load-bearing half: the
 * accessor still composes and memoises only this surface's collaborators, so a warm invocation constructs
 * exactly what this entry can reach, and this parameter still accepts a literal.
 * ⭐ THE AUTHORISATION RESOLVER IS A PARAMETER, AND AN EARLIER REVISION HARD-WIRED IT. It passed
 * `resolveFailClosedAuthorization` as a literal argument, so no deployment could supply a principal
 * through anything it can reach and every SKU action answered `401` permanently. A code review
 * classified that as a CRITICAL callable-boundary defect; the remedy it directed is this parameter plus
 * the registration seam in `./httpResponse.ts` §8.1, which the default consults on EVERY invocation, so
 * no principal is captured while this factory's own memoized graph lives on.
 *
 * @param container the memoized service graph
 * @param resolveAuthorization the per-invocation authorisation resolver. Defaults to
 *   `./httpResponse.ts`'s registered-resolver reader — the deployment's resolver when one is
 *   registered, the constant deny-all context otherwise, so the default remains fail-closed.
 * @returns the nine routed SKU operations
 */
export function createSkuHandlerFromContainer(
  container: Pick<CatalogContainer, 'skuService' | 'skuWriteRunner'> & {
    /* ONE product member, not the service. `../config/container.ts`'s folded sku-surface section records why the narrow
     * aggregate read it supplies is the SAME statement `ProductService.getProduct` compiles. */
    readonly productService: Pick<CatalogContainer['productService'], 'getProduct'>;
  },
  resolveAuthorization: InvocationSecurityResolver = resolveRequestAuthorization,
): SkuHandler {
  return createSkuHandler(
    container.skuService,
    (productID: string) => container.productService.getProduct(productID),
    resolveAuthorization,
    container.skuWriteRunner,
  );
}

/**
 * Maps each served action name onto the member that answers it.
 *
 * Each entry is an arrow rather than a method reference, so the receiver cannot be lost and a member
 * that narrows the event to a subset of the proxy shape still type-checks against the full event.
 *
 * @param handlers the SKU handler whose members the actions resolve to
 * @returns the frozen action table for the SKU surface
 */
export function createSkuRoutes(handlers: SkuHandler): ActionRouteTable<SkuRouteKey> {
  /*
   * ⚠️ THE LITERAL IS ANNOTATED BEFORE IT IS FROZEN, AND THE ORDER IS LOAD-BEARING. `Object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<SkuRouteKey, ActionRoute> = {
    'sku.createSkus': (event: APIGatewayProxyEvent) => handlers.createSkus(event),
    'sku.processImageUpload': (event: APIGatewayProxyEvent) => handlers.processImageUpload(event),
    'sku.getProductSkus': (event: APIGatewayProxyEvent) => handlers.getProductSkus(event),
    'sku.getSortedProductSkus': (event: APIGatewayProxyEvent) =>
      handlers.getSortedProductSkus(event),
    'sku.searchSkusByProductType': (event: APIGatewayProxyEvent) =>
      handlers.searchSkusByProductType(event),
    'sku.getSkuStocksDeletableFlag': (event: APIGatewayProxyEvent) =>
      handlers.getSkuStocksDeletableFlag(event),
    'sku.getTransactionExistsFlag': (event: APIGatewayProxyEvent) =>
      handlers.getTransactionExistsFlag(event),
    'sku.getSkuBySkuCode': (event: APIGatewayProxyEvent) => handlers.getSkuBySkuCode(event),
    'sku.getSkuSmartList': (event: APIGatewayProxyEvent) => handlers.getSkuSmartList(event),
  };

  return Object.freeze(routes);
}

/**
 * The dispatcher, built once per container and reused for every later invocation.
 *
 * The only mutable module-scope binding in this file. It holds the wiring and nothing else — no
 * account, no request, no query result and no setting — so a warm container sharing it cannot leak
 * anything from one invocation into the next, which is the boundary mismatch M7 is about.
 */
let dispatchSkuAction: ActionRoute | undefined;

/**
 * The shape `../config/container`'s `getSkuSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 *
 * `typeof import(...)` is a TYPE position only. It is erased at emit, so it adds no load-time edge from
 * this file to the composition root — which is the entire point of resolving the graph lazily.
 *
 * ⭐ IT NAMES THIS SURFACE, NOT THE AGGREGATE ROOT, AND THAT ONE SPECIFIER IS THE WHOLE OF PERF-01 ON THIS
 * ENTRY. `../config/container.ts` names all thirty-one collaborators of the slice, so a `require` of it
 * made every one of them reachable from this artifact and constructed every one of them on the first
 * invocation. `../config/container.ts`'s folded sku-surface section composes only what these routes can reach — and it does so
 * by calling the SAME `compose*Surface` function the aggregate root calls, so the two cannot diverge on how
 * any service is assembled.
 */
type SkuSurfaceModule = typeof import('../config/container');

/**
 * The Lambda entry point for the SKU surface.
 *
 * A configuration failure surfaces through {@link errorResponse} rather than escaping as an unhandled
 * rejection. `./router.ts` deliberately differs — it resolves the graph at module load, so a
 * misconfiguration fails its cold start outright — and the two behaviours are complementary: the
 * router is the primary entry and fails loudest, while each per-surface entry stays loadable and
 * answerable — a missing or malformed variable answers `500 "The service is not correctly configured"`
 * on every invocation, classified rather than opaque, and the offending variable is published nowhere —
 * the server-side diagnostic carries the failure class, the classification code and a correlation ID, and
 * nothing else. The full decision, and why the asymmetry is deliberate on both sides, is recorded in
 * `./router.ts` and in README §4.
 *
 * @param event the proxy event, carrying the action in its query string
 * @returns the response for the addressed action, or a not-found for one this surface does not serve
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchSkuAction === undefined) {
      /*
       * ⭐ A DEFERRED CommonJS `require`, DELIBERATELY NOT A DYNAMIC `import()`. The difference was
       * MEASURED, not assumed, and it decided this line.
       *
       * This expression read `await import('../config/container.js')` until a QA pass invoked the five
       * per-surface entries from their TypeScript sources. TypeScript's NodeNext emit PRESERVES a native
       * `import()` inside a CommonJS output file — deliberately, so a CJS module can load ESM — which
       * hands the specifier to Node's ESM resolver. That resolver takes a relative specifier literally
       * and requires an on-disk `.js`: the packaged bundle has one and a plain `tsc` emit has one, but
       * the `.ts` source tree has not. Running the source therefore failed with ERR_MODULE_NOT_FOUND,
       * the catch below classified it as an unclassified fault, and EVERY action on this entry —
       * including the ones that need no container at all — answered `500` where the artifact answered
       * `404`. Under ts-jest it failed one step earlier still, with "A dynamic import callback was
       * invoked without --experimental-vm-modules", because a native `import()` is executed by the host
       * and never reaches Jest's module registry. That is why no `moduleNameMapper` entry could have
       * repaired it and why none is declared: jest.config.ts §6 records the same measurement, and a
       * resolver alias understood by one tool and not the others is the exact failure mode AAP §0.4.3.5
       * rules out.
       *
       * A `require` is resolved by the CommonJS algorithm instead, from an EXTENSIONLESS specifier
       * matching every other relative import in this subtree, so esbuild, `tsc` emit, ts-node and
       * ts-jest all reach the same module and the source and the artifact answer identically.
       *
       * ⚠️ THE DEFERRAL ITSELF IS UNCHANGED, AND IT IS LOAD-BEARING. The call sits inside this one-time
       * initialisation branch, so importing this module still constructs no container and reads no
       * environment — the property `test/regression/issues.test.ts`'s folded `entrySurface` block asserts, and the reason
       * `./router.ts`, which resolves the graph at module load, fails a misconfigured deployment at cold
       * start while this entry stays loadable and answers the classified configuration failure per
       * invocation. The read-back ordering of AAP §0.6.2 is untouched: the creation boundary this entry
       * routes `sku.createSkus` through is the container's own write runner, exactly as before.
       */
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above
      const { getSkuSurfaceGraph } = require('../config/container') as SkuSurfaceModule;
      const container = getSkuSurfaceGraph();

      dispatchSkuAction = createActionDispatcher<SkuRouteKey>({
        routes: createSkuRoutes(createSkuHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchSkuAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/**
 * Compile-time proof that the export above satisfies the runtime's handler contract.
 *
 * Assignability is asserted rather than annotating `handler` with `APIGatewayProxyHandler`, because
 * that type permits a callback-style signature and a void return; asserting keeps the narrower
 * promise-returning shape while still proving the artifact is invocable.
 */
type _SkuHandlerSatisfiesLambdaContract = AssertAssignable<typeof handler, APIGatewayProxyHandler>;

/* ================================================================================================
 * THE DEPLOYMENT REGISTRATION SEAM, RE-EXPORTED SO IT IS REACHABLE FROM THE PACKAGED ARTIFACT
 * ============================================================================================== */

/*
 * ⭐ THIS ARTIFACT SERVES THE GATED SKU SURFACE, so a deployment that mounts `handler` above — rather than
 * `./router.ts`'s aggregate — needs the registration seam on THIS module. Every SKU route is gated,
 * including the creation route that owns AAP §0.6.2's read-back ordering, so without a registered
 * resolver this artifact answers `401` and nothing else.
 */
/*
 * ⛔ WHY A RE-EXPORT IS NECESSARY AND NOT MERELY TIDY. `registerRequestAuthorizationResolver` is declared
 * in `./httpResponse.ts` §8.1, which is NOT a build entry point — `build/esbuild.mjs` lists it under
 * `NON_ENTRY_HANDLER_MODULES` precisely because it is a shared helper. esbuild therefore INLINES it into
 * every entry it bundles, and an inlined module's exports do not survive: a deployment that requires the
 * emitted artifact sees only what the ENTRY module exports. Measured before this block existed,
 * `Object.keys(require('./dist/handlers/router.js'))` was exactly `['createRouter', 'handler']`, and the
 * registration function appeared nowhere in any of the five gated bundles.
 *
 * ⛔ THAT IS THE SAME DEFECT SHAPE THE REVIEW RAISED, ONE LAYER OUT. CQ-1's first remedy — the optional
 * `resolveAuthorization` parameter this module already accepts — serves a deployment that compiles its own
 * entry module against the SOURCE. It does nothing for one that takes a packaged bundle as it stands, and
 * `README.md` §7.2 promises that second route in as many words. A seam documented as callable that no
 * caller can reach is what CQ-1 was about; leaving the registrar unexported would have reproduced it.
 *
 * ⭐ WHAT THE RE-EXPORT MAKES REACHABLE IS A REGISTRAR, NOT A PRINCIPAL. §8.1 holds one module-scope cell
 * containing the deployment's resolver FUNCTION, read inside every invocation's call rather than when the
 * graph was composed, so nothing is memoized across invocations and AAP §0.6.6 M7 is untouched. The four
 * gated factories already default their resolver to §8.1's `resolveRequestAuthorization`, which is the
 * reader of that cell — so a resolver registered during initialisation is honoured by this artifact even
 * though its dispatcher was built at module load.
 *
 * ⚠️ AND IT CHANGES NO ANSWER BY ITSELF. Nothing in this subtree calls either function, so a graph built
 * by this port alone still resolves no principal and every gated route still answers `401`. Re-exporting a
 * registrar is not registering one, and this module still parses no header, decodes no token and verifies
 * no signature — AAP §0.2.2.3 excludes the legacy authentication adapters and §0.8.3.2 forbids carrying
 * `org/Hibachi/**` forward, so the identity itself remains the deployment's to supply.
 *
 * `clearRequestAuthorizationResolver` travels with it because the only thing it can do is take a gate
 * AWAY: it resets the cell to absent, which is the fail-closed state, so exposing it cannot relax
 * anything. A deployment able to register must be able to unwind that registration — in a harness, or
 * between two configuration attempts — without discarding the module registry.
 *
 * The two types are re-exported for the same reason the functions are: a deployment writing a resolver
 * against a packaged artifact needs the shape it must satisfy, and `CatalogAuthorizationRequest` is the
 * one request slice — `Pick<APIGatewayProxyEvent, 'headers'>` — that serves all four gated surfaces.
 */
export {
  clearRequestAuthorizationResolver,
  registerRequestAuthorizationResolver,
} from './httpResponse';

export type { CatalogAuthorizationRequest, CatalogAuthorizationResolver } from './httpResponse';
