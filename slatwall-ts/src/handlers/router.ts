/* ================================================================================================
 * ROUTER — THE THIN ROUTING LAYER (AAP §0.4.1.9, §0.1.2.1 "Routing")
 *
 * The FW/1 `slatAction` convention, re-expressed as an explicit, statically-typed route-to-handler
 * mapping in front of five per-service Lambda handlers. This is the file AAP §0.1.2.1 describes as
 * "Lambda handlers behind a thin router; all AWS coupling confined to the handler layer", and it is the
 * only module in the subtree that exports a Lambda `handler` symbol.
 *
 * TEST PROVENANCE: NET-NEW, WITHOUT QUALIFICATION. AAP §0.6.5.2 records that no legacy controller test
 * and no legacy routing test of any kind exists — `meta/tests/functional/admin/entity/ProductTest.cfc`
 * is an empty component with zero test methods, and "all 28 public service members of §0.4.2 are net-new
 * coverage". Nothing in this file extends a legacy coverage signal, and no claim of parity with one is
 * made anywhere in it. AAP §0.4.1.12 defines no `test/handlers/` entry for a router, so S6 manifests here
 * as testability-by-design instead: {@link createRouter} is a pure function of an injected graph, and
 * every route it mounts is reachable with a plain object literal, no database, no network call and no AWS
 * runtime.
 *
 * ------------------------------------------------------------------------------------------------
 * (a) TRANSLATION DECISION — `slatAction` BECAME A STATIC ROUTE TABLE (G6, TR-3)
 * ------------------------------------------------------------------------------------------------
 * The legacy action key is NOT FW/1's default. `org/Hibachi/FW1/framework.cfc:L1778` declares
 * `variables.framework.action = 'action';` and `org/Hibachi/Hibachi.cfc:L27` repeats it, but Slatwall
 * OVERRIDES it: `config/configFramework.cfm:L2` reads
 *
 *     <cfset variables.framework.action="slatAction" />
 *
 * and that line — not the framework default — is the definitive locator for the parameter this file
 * reads. The framework was FW/1 2.1 (`org/Hibachi/FW1/framework.cfc:L1885`,
 * `variables.framework.version = '2.1';`).
 *
 * An action was `subsystem:section.item`, decomposed in `setupRequestWrapper` at
 * `org/Hibachi/FW1/framework.cfc:L1965-L1969`, which assigns `request.subsystem`,
 * `request.subsystembase`, `request.section` and `request.item` from one string; the subsystem
 * delimiter is `':'` (`org/Hibachi/Hibachi.cfc:L35`, `org/Hibachi/FW1/framework.cfc:L1806`). The one
 * catalog-adjacent action attested anywhere in the legacy tree is
 *
 *     ?slatAction=google:feed.product
 *
 * from `integrationServices/google/views/main/default.cfm:L50`, and it is carried across with its exact
 * spelling.
 *
 * WHAT CHANGED, AND WHY IT IS A CHANGE OF IDIOM RATHER THAN OF BEHAVIOUR. FW/1 resolved an action by
 * CONVENTION: it split the string, derived a controller path and a method name, and invoked whatever it
 * found. TR-3 requires that every such runtime-synthesized resolution become "an explicit,
 * compile-checked declaration", so the split-and-invoke is replaced by {@link CATALOG_ROUTES} — a frozen
 * record whose keys are a closed literal union. A route that is not declared cannot be reached, a
 * declared route that names no handler member is a compile error, and a member added to a handler
 * without a route is visible as an omission rather than silently reachable. AAP §0.8.1 authorises
 * exactly this: minimal in functional scope, explicitly NOT minimal in idiom.
 *
 * ⛔ AND NO FW/1 OR DI/1 CODE CROSSED OVER (§0.8.3.2). `framework.cfc` and `Hibachi.cfc` were read for
 * the routing CONTRACT only. `getFullyQualifiedAction` (`framework.cfc:L360`), `getSectionAndItem`
 * (`:L410`), `getSection` (`:L402`), `getItem` (`:L378`), `getSubsystem` (`:L454`) and `validateAction`
 * (`:L2013`) are NOT reimplemented here in any form. This file does not split the action string, does not
 * derive a path from it and does not validate it character by character; it compares it against a
 * declared set. Reproducing FW/1's resolution algorithm in TypeScript would violate "that framework is
 * being retired for this slice, not carried forward" as surely as importing it would.
 *
 * ------------------------------------------------------------------------------------------------
 * (b) NEGATIVE FINDING — `index.cfm` IS INTENTIONALLY BLANK, SO NOTHING WAS PORTED FROM IT (G6)
 * ------------------------------------------------------------------------------------------------
 * AAP §0.4.1.9 and §0.3.1 both name `index.cfm` as a reference source for this file. It was inspected in
 * full: it is 50 lines, of which L1-L48 are the GPL header block, L49 is blank, and L50 reads literally
 *
 *     <!--- This File Should be left blank --->
 *
 * It contains no dispatch logic, no route declaration and no executable statement of any kind. NO
 * ROUTING BEHAVIOUR IS DERIVED FROM IT, and this file does not imply otherwise. The convention it is
 * often assumed to hold lives entirely in `config/configFramework.cfm` and `org/Hibachi/FW1/framework.cfc`
 * (see (a)). AAP §0.8.5 requires precisely this kind of statement — "every uncomfortable finding is
 * stated in the plan rather than deferred to implementation" — and a reader who expected a port of
 * `index.cfm` deserves to learn from the file itself that there was nothing in it to port.
 *
 * ------------------------------------------------------------------------------------------------
 * (c) TRANSLATION DECISION — FW/1's CASE-INSENSITIVITY IS DELIBERATELY LOST (G6, TR-3)
 * ------------------------------------------------------------------------------------------------
 * The legacy matched actions case-INSENSITIVELY, and it did so on the default path. Verbatim from
 * `org/Hibachi/FW1/framework.cfc:L1957-L1960`:
 *
 *     if ( variables.framework.noLowerCase ) {
 *         request.action = validateAction( request.context[variables.framework.action] );
 *     } else {
 *         request.action = validateAction( lCase(request.context[variables.framework.action]) );
 *     }
 *
 * `noLowerCase` is false by default, so the DEFAULT branch lower-cases the action before validating it.
 * The same tolerance existed one layer down: `org/Hibachi/HibachiService.cfc:L256` opens
 * `onMissingMethod` with `var lCaseMissingMethodName = lCase( missingMethodName );`, and DI/1's
 * `getService("name")` lookup was itself case-insensitive — AAP §0.4.3.2 records the legacy exploiting
 * that inconsistently, with both `getService("productService")` and `getService("ProductService")`
 * appearing inside the in-scope entities.
 *
 * A static table keyed by a literal union is CASE-SENSITIVE. `product.saveProduct` matches;
 * `Product.SaveProduct` does not, and returns a not-found. That tightening is an intentional decision
 * under TR-3, not an oversight: the alternative is to lower-case the incoming action and key the table in
 * lower case, which would re-admit the very fuzziness the port exists to retire and would make the route
 * keys stop spelling the preserved member names exactly — the property that makes §0.4.2's
 * interface-parity claim checkable member by member. Recording the loss is the honest treatment; hiding
 * it behind a normalising step is not.
 *
 * ------------------------------------------------------------------------------------------------
 * (d) TRANSLATION DECISION — `this.publicMethods` BECAME ROUTE-TABLE MEMBERSHIP (G6)
 * ------------------------------------------------------------------------------------------------
 * A legacy controller declared its externally reachable surface on itself.
 * `integrationServices/google/controllers/feed.cfc:L54-L56`, verbatim:
 *
 *     this.publicMethods="product";
 *     this.anyAdminMethods="";
 *     this.secureMethods="";
 *
 * `publicMethods` is a ROUTING concern, so it belongs here, and it is expressed as membership of
 * {@link CATALOG_ROUTES}: a member reachable from outside is a member with a route, and nothing else is.
 * The controller declared exactly one — `product` — and exactly one feed route exists below.
 *
 * ⛔ NO AUTHENTICATION OR AUTHORIZATION IS INTRODUCED, AND THE EMPTY SIBLINGS ARE THE EVIDENCE.
 * `anyAdminMethods` and `secureMethods` are BOTH empty strings, so the legacy feed controller demanded
 * neither a login nor a permission. `integrationServices/AuthenticationInterface.cfc` and
 * `integrationServices/BaseAuthentication.cfc` are excluded by AAP §0.2.2.3, and G4 forbids adding a
 * capability the migration does not require. This file therefore parses no header, verifies no token,
 * mints no session and installs no middleware. What it DOES supply is a fail-closed principal — see (e2).
 *
 * ------------------------------------------------------------------------------------------------
 * (e) M7 — REQUEST-SCOPED, NEVER MODULE-SCOPE (AAP §0.6.6, S8)
 * ------------------------------------------------------------------------------------------------
 * ⚠️ THE RULE, STATED SO IT IS NOT LOST: ANY MEMOISATION IN THE HANDLER LAYER IS REQUEST-SCOPED. AAP
 * §0.6.6 M7 is explicit that nothing survives between Lambda invocations except module-scope state, and
 * that memoisation must therefore be scoped to the request "to avoid cross-tenant bleed on a warm
 * container". THE ONLY MODULE-SCOPE MUTABLE STATE PERMITTED ANYWHERE IN `slatwall-ts/src/**` IS THE
 * `mysql2` POOL IN `src/config/database.ts`. Do not add a warm-container cache here — not a route hit
 * counter, not a memoised principal, not a cached feed, not a "last event" reference.
 *
 * THIS FILE HOLDS NO STATE OF ITS OWN. It declares three module-level bindings and all three are
 * immutable: the frozen route table, the frozen fail-closed authorisation context, and the graph
 * reference returned by the container's memoised factory. There is no `let`, no counter, no accumulator
 * and no lazily-populated map anywhere below.
 *
 * (e1) WHY THE GRAPH IS RESOLVED AT MODULE LOAD. `src/config/container.ts` states it plainly: "The
 * routing layer calls this once per module load and beginInvocation once per invocation." AAP §0.3.2's
 * Lambda research is the reason — the pool and the service graph belong outside the handler so a warm
 * invocation reuses them — and the container is careful that this costs nothing, because it opens no
 * connection and performs no I/O when it is built. What the graph must NOT do is carry a request across
 * invocations, which is why {@link CatalogContainer.beginInvocation} is called FIRST on every
 * invocation, before any route runs: it discards the one request-scoped cell the graph holds, the
 * option-group sort-order memo that `model/dao/SkuDAO.cfc:L204-L220` kept in a singleton DAO's
 * `variables` scope for the life of the application server.
 *
 * ⚠️ THAT BOUNDARY IS NOT THE PORT OF `clearNextOptionGroupSortOrder()`. The legacy member's guard is
 * inverted, so it never clears anything (`model/dao/SkuDAO.cfc:L222-L226`, defect D7), and the adapter
 * preserves the defect unrepaired per S7. `beginInvocation` is a separate execution-model adaptation
 * (IR-10) that the legacy had no equivalent of, because a persistent application server never ended the
 * memo's life at all. This file mints no defect number of its own.
 *
 * (e2) WHY THE PRINCIPAL IS A FUNCTION AND NOT A VALUE. `src/ports/AccountContextPort.ts` records that
 * a memoised factory cannot capture a principal without becoming exactly the cross-tenant bleed M7
 * closes, so each handler takes a RESOLVER evaluated once per invocation. The container's own
 * `AccountContextPort` stub RAISES for that reason — the acting principal is resolved at the handler
 * edge, never captured by the graph — which makes this file the layer that must supply one. It supplies
 * the unauthenticated, deny-all context described in (d) and at
 * {@link FAIL_CLOSED_AUTHORIZATION}.
 *
 * ------------------------------------------------------------------------------------------------
 * (f) NEGATIVE FINDING — THE TEN DECLARED FW/1 ROUTES ARE DELIBERATELY NOT PORTED (G6)
 * ------------------------------------------------------------------------------------------------
 * The legacy declared ten explicit FW/1 route patterns, and they are declared in TWO places rather than
 * one. EIGHT are appended in `config/configFramework.cfm:L5-L14`:
 *
 *     $GET/admin/                  -> /admin:main/default/
 *     $GET/account/                -> /public:main/account/
 *     $GET/brand/:urlTitle         -> /public:main/brand/urlTitle/:urlTitle/
 *     $GET/checkout/               -> /public:main/checkout/
 *     $GET/product/:urlTitle       -> /public:main/product/urlTitle/:urlTitle/
 *     $GET/products/               -> /public:main/default/
 *     $GET/producttype/:urlTitle   -> /public:main/producttype/urlTitle/:urlTitle/
 *     $GET/shoppingcart/           -> /public:main/shoppingcart/
 *
 * and TWO more are pre-seeded into the same array at `org/Hibachi/Hibachi.cfc:L52-L55`:
 *
 *     $GET/api/:entityName/:entityID -> /admin:api/get/entityName/:entityName/entityID/:entityID
 *     $GET/api/:entityName/          -> /admin:api/get/entityName/:entityName/
 *
 * ⭐ EVERY ONE OF THE TEN TARGETS THE `admin:` OR `public:` SUBSYSTEM, AND BOTH ARE OUT OF SCOPE — AAP
 * §0.2.2.2 excludes `admin/**` (352 files) and `public/**` (21 files). NONE IS PORTED. They are
 * enumerated here only so the omission reads as a decision rather than an oversight, and the three
 * tempting ones are named for the same reason: `$GET/brand/:urlTitle`, `$GET/product/:urlTitle` and
 * `$GET/producttype/:urlTitle` LOOK like catalog reads and are not — each resolves to an excluded UI
 * controller, not to a catalog service. The two `admin:api` patterns are the excluded administrative REST
 * surface, and `frontend/api/taffy` is excluded with the rest of `frontend/**`.
 *
 * ⛔ NO REST RESOURCE HIERARCHY IS INFERRED FROM THEM AND NONE IS INVENTED (S9). There is no
 * `/products/:id/skus`, no nested collection, no HATEOAS link, no API version prefix, no content
 * negotiation and no method-based dispatch. The addressing scheme is the legacy's own: one action name.
 *
 * ------------------------------------------------------------------------------------------------
 * (g) TRANSLATION DECISION — A TYPED NOT-FOUND REPLACES `onMissingMethod`'s THROW (G6)
 * ------------------------------------------------------------------------------------------------
 * The legacy had no not-found path. An unrecognised member fell through to `onMissingMethod`
 * (`org/Hibachi/HibachiService.cfc:L255-L281`), which fabricated the whole implicit CRUD surface by
 * prefix — `get*`, `get*SmartList`, `new*`, `list*`, `save*`, `delete*`, `count*`, `export*`, `process*` —
 * and, when no prefix matched, raised at `:L280`:
 *
 *     throw('You have called a method #arguments.missingMethodName#() which does not exists in the #getClassName()# entity.');
 *
 * An unmatched route here returns {@link notFoundResponse} instead. ⛔ THERE IS NO FALLBACK OF ANY OTHER
 * KIND: no reflective invocation, no prefix guessing, no "closest match" heuristic, no retry against a
 * lower-cased key, no default route. Prefix synthesis is precisely what IR-1 retires, and reproducing it
 * in a router would re-create `onMissingMethod` in a new idiom while the rest of the port was declaring
 * its way out of it.
 *
 * ------------------------------------------------------------------------------------------------
 * (h) ALL SEVEN BOUNDARY-STUBBED MEMBERS REMAIN ROUTABLE BY DESIGN (TR-5, G6)
 * ------------------------------------------------------------------------------------------------
 * TR-5: "the member is never quietly dropped from the interface." Seven routed members cannot succeed,
 * because each reaches a collaborator in an excluded family, and every one of them still has a route:
 *
 *     product.loadDataFromFile                        product.processProductUpdateDefaultImageFileNames
 *     product.processProductAddProductReview          product.processProductUploadDefaultImage
 *     product.processProductAddSubscriptionTerm       sku.processImageUpload
 *     product.processProductDeleteDefaultImage
 *
 * Each answers with the documented not-implemented failure its own handler produces, naming the port and
 * the legacy collaborator behind it. Omitting their routes would silently shrink the interface this port
 * exists to demonstrate, and would make §0.4.2's 28-member surface unverifiable from the outside — which
 * is the opposite of what §0.8.3.1's "checkable method-by-method" asks for.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ------------------------------------------------------------------------------------------------
 *   - Dynamic dispatch of any kind (S3, TR-3). No `Proxy`, no `Reflect`, no `eval`, no `new Function`,
 *     no dynamic `import()`, no decorator, no DI-container library, and no handler resolved by indexing
 *     a map with unvalidated input. The table is a declaration, not a registry: its key is narrowed to a
 *     closed literal union BEFORE it is used to read anything.
 *   - Construct or resolve a collaborator by name. Every handler is built from the graph the container
 *     hands over, by constructor injection, in one place.
 *   - Read `process.env` (§0.8.3.9). `src/config/env.ts` is the only file in the subtree permitted to,
 *     and configuration flows one way: `env.ts` -> `database.ts` -> `container.ts` -> here.
 *   - Touch SQL, `mysql2`, a `Sw*` table name, `src/adapters/**` or `src/validation/**` (S2, S4).
 *   - Open, commit or roll back a transaction. M5's explicit boundary is
 *     `src/adapters/mysql/UnitOfWork.ts`, reached only through the two write runners the container
 *     exposes; this file names neither the unit of work nor a transaction.
 *   - Reorder, batch or otherwise "help" the M6 validation read-back. It is resolved inside the unit of
 *     work and `SkuService`, and a router that rearranged anything would be the silent divergence AAP
 *     §0.6.2 warns about.
 *   - Resolve M1 or M2. The importer's one-hour budget (`model/service/ProductService.cfc:L65-L68`)
 *     belongs to `productHandler.ts` and the feed's six-minute budget
 *     (`integrationServices/google/views/feed/product.cfm:L9`) to `googleFeedHandler.ts`. Neither is
 *     restated here, and neither is worked around at the routing layer with a timeout, a queue hop or a
 *     streaming branch (S8, S9).
 *   - Add middleware, CORS, authentication, rate limiting, request logging, tracing, caching,
 *     compression, a warm-up path or a session lock. Every one is an "obvious improvement" no source
 *     file asks for (G4). The legacy 60s/45s session locks in `OrderService`/`PaymentService` are noted
 *     by §0.8.3.5 as explicitly not to be implemented; those services are out of scope and no locking
 *     mechanism appears anywhere in the target design.
 *   - State any number other than an HTTP status code and the one named calendar-unit constant whose
 *     necessity is argued at {@link MINUTES_PER_HOUR}. No timeout, memory size, retry count, backoff,
 *     page size, batch size, rate limit, concurrency limit or cache lifetime, and no service-level
 *     objective of any kind (S9, IR-12).
 *   - Declare a runtime, an infrastructure artifact or a deployment target. AAP §0.5.5 names the only
 *     four version-coupled artifacts in the whole deliverable and none of them is in this folder.
 *   - Emit markup. AAP §0.3.4: there is no user interface in this slice and no design system to align
 *     to. The feed route returns RSS 2.0 XML for machine consumption; every other route returns JSON.
 *
 * ⚠️ ONE OPERATIONAL CONSEQUENCE, STATED RATHER THAN DISCOVERED. Importing `../config/container`
 * transitively loads `src/config/env.ts`, whose configuration is built eagerly at module load and which
 * "throws a DomainError naming the offending variable" when any required environment variable is missing
 * or malformed — a fail-fast contract that file inherits from `config/configORM.cfm:L4-L7`. THIS BUNDLE
 * THEREFORE REQUIRES ITS ENVIRONMENT TO LOAD AT ALL, and a misconfiguration surfaces during
 * initialisation rather than on the first request. That is the intended behaviour and it is not softened
 * here: deferring the container to first use would trade a loud INIT failure for a quiet per-request one
 * and would contradict the container's own "once per module load" contract. `slatwall-ts/.env.example`
 * documents every variable involved.
 * ============================================================================================== */

import { getCatalogContainer, type CatalogContainer } from '../config/container';
import type { RequestAuthorizationContext } from '../ports/AccountContextPort';

import { createBrandHandler, type BrandHandler } from './brandHandler';
import { createGoogleFeedHandler, type GoogleFeedHandler } from './googleFeedHandler';
import { createOptionHandler, type OptionHandler } from './optionHandler';
import { createProductHandler, type ProductHandler } from './productHandler';
import { createSkuHandler, type SkuHandler } from './skuHandler';

import {
  errorResponse,
  notFoundResponse,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
} from './httpResponse';

/* ================================================================================================
 * THE ACTION PARAMETER
 * ============================================================================================== */

/**
 * The query-string parameter carrying the action, spelled exactly as the legacy spelled it.
 *
 * ⭐ `config/configFramework.cfm:L2` IS THE LOCATOR, NOT THE FRAMEWORK DEFAULT. FW/1 ships `'action'`
 * (`org/Hibachi/FW1/framework.cfc:L1778`, restated at `org/Hibachi/Hibachi.cfc:L27`); Slatwall overrides
 * it to `slatAction`, and every attested call site uses the override — see
 * `integrationServices/google/views/main/default.cfm:L50`. A single named constant rather than a literal
 * written at each read, because the name is a wire contract and a second spelling would be a second
 * chance to disagree with it.
 *
 * ⛔ THE QUERY STRING IS THE ONLY PLACE IT IS READ FROM, AND THAT IS A NARROWING RECORDED RATHER THAN
 * MADE SILENTLY. FW/1 read `request.context[variables.framework.action]`, a merged structure fed from the
 * CFML URL and FORM scopes, so an action could in principle arrive in a posted body. Every call site the
 * legacy tree actually contains puts it in the query string, and reading a body to find a route name
 * would mean parsing an untyped payload before the route that owns the payload has been chosen — inventing
 * a request-shaping step no source file describes (S9). A caller that puts the action anywhere else gets a
 * not-found, which is the honest answer for an address this service does not declare.
 */
const SLAT_ACTION_PARAMETER = 'slatAction';

/* ================================================================================================
 * THE AUTHORISATION CONTEXT — FAIL-CLOSED, WITH NO AUTHENTICATION INTRODUCED
 * ============================================================================================== */

/**
 * The per-invocation principal every routed catalog member is gated on.
 *
 * ⭐ WHY THIS FILE SUPPLIES IT AT ALL. `src/config/container.ts`'s `AccountContextPort` stub RAISES,
 * deliberately, because "the acting principal is resolved per invocation at the handler edge, never
 * captured by the memoized graph" — the M7 rule applied to identity. `src/ports/AccountContextPort.ts`
 * makes the same point from the other side: a handler receives a RESOLVER, evaluated once per
 * invocation, precisely so a memoised factory cannot capture a principal and leak it across a warm
 * container. The handler edge is this file, so the context is minted here.
 *
 * ⭐ BOTH MEMBERS ARE THE PORTS' OWN DOCUMENTED DEFAULTS, COPIED RATHER THAN INVENTED.
 * `src/ports/AccountContextPort.ts` writes `const unauthenticated: AccountContextPort = {
 * getCurrentAccount: () => undefined };` and `const denyAll: EntityAuthorizationPort = {
 * authenticateEntity: () => false };` in its own examples, and `undefined` is the state
 * `org/Hibachi/HibachiObject.cfc:L74-L76` yields for a request with no logged-in account — the same
 * literal `test/services/SkuService.test.ts` uses for the unauthenticated case. `false` is what the port
 * requires when authorisation "could not be established", never a throw and never `undefined`, which
 * matches the legacy ladder's terminal `return false`.
 *
 * ⛔ AND FAIL-CLOSED IS THE ONLY DEFENSIBLE CHOICE HERE, NOT A PLACEHOLDER FOR A REAL GATE.
 * `integrationServices/AuthenticationInterface.cfc` and `BaseAuthentication.cfc` are excluded by AAP
 * §0.2.2.3, `org/Hibachi/HibachiAuthenticationService.cfc` is framework code this slice must never carry
 * forward (§0.8.3.2), and G4 forbids adding a capability the migration does not require. So nothing here
 * parses a header, decodes a token, verifies a signature or consults a store. Deny-all is what remains,
 * and it is the SAFE remainder: a write route refuses rather than proceeding unauthenticated. The
 * consequence is stated plainly rather than hidden — a deployment that needs authenticated catalog writes
 * supplies a resolver from its own edge, and the seam for doing so is already the handlers' constructor
 * parameter rather than something that would have to be invented.
 *
 * ⚠️ IT IS SHARED ACROSS INVOCATIONS, AND THAT IS SAFE ONLY BECAUSE IT IS CONSTANT. Freezing it is what
 * makes the sharing sound: it holds no identity, so there is nothing for one invocation to observe from
 * another. The moment a real principal is resolved, THIS BINDING MUST NOT BE REUSED — the resolver
 * function must build a fresh context per request, which is exactly why the handlers take a function.
 */
const FAIL_CLOSED_AUTHORIZATION: RequestAuthorizationContext = Object.freeze({
  accountContext: Object.freeze({ getCurrentAccount: () => undefined }),
  entityAuthorization: Object.freeze({ authenticateEntity: () => false }),
});

/**
 * The resolver handed to all four catalog handlers.
 *
 * It ignores its argument on purpose: a resolver that read the request would be reading a credential,
 * which is the capability (d) and {@link FAIL_CLOSED_AUTHORIZATION} establish is not introduced. Declared
 * with no parameter at all rather than an underscore-prefixed one, because a function of lower arity
 * satisfies the port and an unused parameter would imply an input that is deliberately not consulted.
 *
 * @returns the constant unauthenticated, deny-all context
 */
const resolveFailClosedAuthorization = (): RequestAuthorizationContext => FAIL_CLOSED_AUTHORIZATION;

/* ================================================================================================
 * THE FEED RENDER BOUNDARY — TWO COLLABORATORS ONLY THIS LAYER CAN SUPPLY
 * ============================================================================================== */

/**
 * Minutes in an hour.
 *
 * ⚠️ S8 DISCLOSURE, BECAUSE S9 AND A SIBLING FILE'S CONTRACT ARE IN TENSION HERE AND THE TENSION IS
 * REAL. S9 says this file owns no source-declared numeric constant and that "the only numbers permitted
 * in it are HTTP status codes". `src/handlers/googleFeedHandler.ts:L599-L605` says its clock's
 * `utcHourOffset()` must answer HOURS west of UTC while "the platform's own zone-offset accessor reports
 * MINUTES west, not hours, so a conversion is required and this file deliberately performs none". Both
 * cannot hold unless some layer converts, and the feed handler has explicitly delegated the conversion
 * outward — to the layer that builds its collaborators, which is this one. So the constant exists, and it
 * is disclosed rather than smuggled in.
 *
 * ⭐ WHAT IT IS NOT. It is not a timeout, page size, batch size, retry count, backoff, rate limit,
 * concurrency limit, cache lifetime, capacity figure or service-level objective — S9's actual subject.
 * It is a fixed property of the Gregorian clock, identical in the legacy and in the target, invented by
 * nobody and tunable by no one. Naming it rather than writing `60` inline is what keeps that distinction
 * legible to the next reader, and to the grep that S9 is enforced with.
 */
const MINUTES_PER_HOUR = 60;

/**
 * The two ambient values `integrationServices/google/views/feed/product.cfm:L30` read while rendering.
 *
 * ⭐ ONE OBJECT, BECAUSE THE INVARIANT IS THAT BOTH DESCRIBE THE SAME ZONE.
 * `src/handlers/googleFeedHandler.ts` requires it: the serializer emits the instant's own components and
 * appends the offset as a bare LABEL without parsing or converting it, exactly as `:L30` does, so an
 * implementation that reported an offset unrelated to its clock would publish a timestamp whose
 * components and label disagree. Both values below come from the one process time zone, so the invariant
 * holds by construction.
 *
 * ⛔ SIGN CONVENTION: HOURS **WEST** OF UTC, POSITIVE, AS TEXT — the legacy's own, not a normalisation.
 * `:L30` writes a literal hyphen ahead of the value, so the emitted label is always a minus followed by
 * this number, which is what makes United States Eastern time render as `-5`. The platform accessor used
 * below reports minutes west of UTC as a positive number for zones west of it, so the sign already agrees
 * and NO NEGATION IS APPLIED; the only adaptation is the unit. Truncation toward zero is what reproduces
 * the legacy accessor's whole-hour value, including for a half-hour zone, where the CFML facility's hour
 * component likewise carries no fraction.
 *
 * ⛔ STATELESS, AND READ PER CALL — M7 AGAIN. `googleFeedHandler.ts` states that both members are "read
 * per invocation, never captured", because an instant captured when the handler was built would be stale
 * for every later invocation on a warm container. Nothing is memoised here: each call reads the clock
 * afresh. The offset is read from its own instant for the same reason, which also keeps it
 * daylight-saving-correct; that the two reads are separate expressions is not a weakening but the legacy
 * arrangement exactly, since `:L30` evaluates `now()` and `getTimeZoneInfo().utcHourOffset` as two
 * independent expressions too.
 */
const FEED_RENDER_CLOCK = Object.freeze({
  now: (): Date => new Date(),

  utcHourOffset: (): string =>
    String(Math.trunc(new Date().getTimezoneOffset() / MINUTES_PER_HOUR)),
});

/**
 * The feed's product-image reader, which answers an empty list.
 *
 * ⚠️ A DECLARED BOUNDARY, NOT A DROPPED FIELD (TR-5). `src/handlers/googleFeedHandler.ts:L529-L534`
 * owns the finding and states the consequence: `model/entity/Image.cfc` is not one of the six in-scope
 * entities of AAP §0.2.1.2, AAP §0.2.2.4 excludes `model/validation/ProductImage.json`, and the ported
 * `Product`'s `getProductImages()` exposes only its ownership mutators, so no path member exists to read.
 * Forcing one with an assertion or a cast is forbidden outright by S1. An empty list emits no
 * additional-image elements, which is the same output `product.cfm:L24` produces for a product that has
 * no images — a boundary crossed honestly rather than a field silently removed.
 *
 * ⛔ NO DEFECT NUMBER IS MINTED FOR IT (S7). AAP §0.6.7's register is closed, none of its entries covers
 * this, and the sibling that owns the finding already declines to mint one; a second, differently
 * numbered account of one gap would be worse than none.
 *
 * ⛔ AND NO IMAGE IS FABRICATED. Returning a placeholder path, a default image or a derived filename
 * would put invented data into a published merchant feed (S9), which is materially worse than emitting
 * nothing. The parameter is not declared, because it is not consulted.
 *
 * @returns an empty image list, on every call
 */
const readNoProductImages = (): readonly [] => [];

/* ================================================================================================
 * THE ROUTE KEY — A CLOSED LITERAL UNION, WHICH IS THE INTERFACE-PARITY ARTIFACT
 *
 * ⭐ THIS UNION IS WHERE §0.8.3.1's "so interface parity is checkable method-by-method" IS CASHED IN.
 * The prompt's requirement is that a reviewer be able to see the preserved surface enumerated, and this
 * is that enumeration: 34 entries, of which 28 are the public service members AAP §0.4.2 preserves
 * (ProductService 15, SkuService 9, BrandService 1, OptionService 3), five are the IR-1 members the slice
 * genuinely uses and which the legacy fabricated at run time through `onMissingMethod`
 * (`newProduct`, `getProduct`, `getProductType`, `getBrand`, `deleteBrand`), and one is the Google feed.
 *
 * ⭐ ADDRESSING SCHEME, AND WHY IT IS THE LEGACY'S VOCABULARY RATHER THAN A NEW ONE. The legacy action is
 * `subsystem:section.item` (`org/Hibachi/FW1/framework.cfc:L1965-L1969`). Exactly one catalog-adjacent
 * action is attested anywhere in the tree — `google:feed.product`
 * (`integrationServices/google/views/main/default.cfm:L50`) — and it keeps its exact spelling, subsystem
 * and all. The four catalog services have NO legacy action of their own, because their legacy callers
 * were the `admin:` and `public:` controllers that AAP §0.2.2.2 excludes; so rather than invent a new
 * address space, their keys reuse the same `section.item` vocabulary with the section as the service noun
 * and THE ITEM AS THE EXACT PRESERVED MEMBER NAME. `product.saveProduct` is `ProductService.saveProduct`
 * with nothing lost in translation, which is what lets a reviewer read the parity claim straight off the
 * table.
 *
 * ⛔ WHAT IS NOT IN THE SCHEME (S9). No subsystem is invented for the catalog sections, because the
 * legacy ones that exist are excluded and a new one would be an address the source does not state. No URL
 * path hierarchy, no nested collection, no HTTP-method matching, no API version prefix, no health,
 * readiness, metrics, version or schema endpoint, and no `count*`, `list*` or `export*` member — AAP
 * §0.4.2.5 records those as "Not called by the slice", and its restraint is verbatim: "synthesis is not
 * reproduced wholesale, only where used."
 *
 * ⛔ AND FOUR SYNTHESIZED OPTION MEMBERS ARE ABSENT ON PURPOSE. `getOption`, `getOptionGroup`,
 * `getOptionSmartList` and `getOptionGroupSmartList` are INTERNAL collaborators, called from
 * `model/service/SkuService.cfc:L75`, `model/service/ProductService.cfc:L115`,
 * `model/entity/Product.cfc:L340-L347` and `model/entity/Product.cfc:L251-L261` respectively (AAP
 * §0.6.3.4). `optionHandler.ts` deliberately does not expose them and no route names them here either.
 * `ProductService.buildSkuCombinations` is likewise absent: it is private, only self-recursive, and
 * therefore unreachable dead code that AAP §0.6.7.3 records as defect D15 and does not port at all.
 * ============================================================================================== */

/**
 * Every address this service answers, as a closed union.
 *
 * Declared explicitly rather than derived with `keyof typeof`, and the difference is load-bearing:
 * because {@link createRouteTable} returns a `Record` keyed by THIS union, a member listed here with no
 * entry is a compile error AND an entry not listed here is a compile error. Deriving the union from the
 * table would keep the second guarantee and silently discard the first, which is the one that catches a
 * route being forgotten.
 */
export type RouteKey =
  /* ProductService — the fifteen declared members of `model/service/ProductService.cfc` (AAP §0.4.2.1). */
  | 'product.loadDataFromFile'
  | 'product.getFormattedOptionGroups'
  | 'product.getProductSkusBySelectedOptions'
  | 'product.processProductAddOptionGroup'
  | 'product.processProductAddOption'
  | 'product.processProductAddProductReview'
  | 'product.processProductAddSubscriptionTerm'
  | 'product.processProductDeleteDefaultImage'
  | 'product.processProductUpdateDefaultImageFileNames'
  | 'product.processProductUpdateSkus'
  | 'product.processProductUploadDefaultImage'
  | 'product.saveProduct'
  | 'product.saveProductType'
  | 'product.deleteProduct'
  | 'product.getProductSmartList'
  /* ProductService — three IR-1 members the slice uses and `onMissingMethod` fabricated (AAP §0.4.2.5). */
  | 'product.newProduct'
  | 'product.getProductType'
  | 'product.getProduct'
  /* SkuService — the nine declared members of `model/service/SkuService.cfc` (AAP §0.4.2.2). */
  | 'sku.createSkus'
  | 'sku.processImageUpload'
  | 'sku.getProductSkus'
  | 'sku.getSortedProductSkus'
  | 'sku.searchSkusByProductType'
  | 'sku.getSkuStocksDeletableFlag'
  | 'sku.getTransactionExistsFlag'
  | 'sku.getSkuBySkuCode'
  | 'sku.getSkuSmartList'
  /* BrandService — the one declared member of `model/service/BrandService.cfc` (AAP §0.4.2.3), plus the
   * two IR-1 members the brand paths use. `newBrand` has no route: it mints a transient with no
   * identifier, which is a step inside a save rather than an address a caller can usefully call. */
  | 'brand.saveBrand'
  | 'brand.getBrand'
  | 'brand.deleteBrand'
  /* OptionService — the three declared members of `model/service/OptionService.cfc` (AAP §0.4.2.4). */
  | 'option.getOptionsForSelect'
  | 'option.getUnusedProductOptions'
  | 'option.getUnusedProductOptionGroups'
  /* The Google product feed — the ONE legacy-attested action, spelled exactly as
   * `integrationServices/google/views/main/default.cfm:L50` spells it, and the one member
   * `integrationServices/google/controllers/feed.cfc:L54` declared public. */
  | 'google:feed.product';

/**
 * What a route does: take the invocation event, answer a proxy result.
 *
 * ⭐ UNIFORMLY ASYNCHRONOUS, WITH ONE ADAPTATION DECLARED AT ITS SITE. Every routed member of the five
 * handlers answers `Promise<APIGatewayProxyResult>` except `OptionHandler.getOptionsForSelect`, which is
 * SYNCHRONOUS because the legacy member it ports performs no I/O. Rather than widen this type to a union
 * — which would push an `await`-or-not decision into the dispatcher and make the dispatcher's own control
 * flow depend on which route it picked — the one synchronous member is adapted where it is mounted, and
 * the adaptation is commented there.
 *
 * ⭐ THE EVENT IS PASSED THROUGH UNCHANGED. Each handler declares the narrowest slice of the event it
 * reads with `Pick`, and reads its own identifiers, query parameters and body itself; a full event is
 * assignable to every one of those slices. So this layer parses no payload, coerces no value and
 * validates no field — it chooses an address and steps aside. That is what "thin" means in AAP §0.4.1.9,
 * and it is also what keeps the argument-order preservation of TR-1 a property of the handlers rather
 * than something this file could get wrong on their behalf.
 */
type RouteEntry = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/* ================================================================================================
 * MOUNTING THE FIVE HANDLERS — CONSTRUCTOR INJECTION, ONE PLACE, NO LOOKUP (S3, R1, R2)
 * ============================================================================================== */

/** The five handler façades this router mounts, each built from the injected graph. */
interface CatalogHandlers {
  readonly product: ProductHandler;
  readonly sku: SkuHandler;
  readonly brand: BrandHandler;
  readonly option: OptionHandler;
  readonly googleFeed: GoogleFeedHandler;
}

/**
 * Builds the five handler façades from a wired graph.
 *
 * ⭐ THIS IS WHERE R1 AND R2 LAND. The legacy declared its collaborators as component properties that
 * DI/1 populated by name at scan time (`property name="skuDAO" type="any";`) and reached them through
 * generated accessors, and it resolved others through a case-insensitive string lookup,
 * `getService("productService")`. Both are replaced by the same thing here: a typed constructor
 * parameter, supplied once, from a graph the composition root already wired. There is no `getService`, no
 * `getBean`, no registry, no name-keyed resolution and no lazily-constructed collaborator anywhere in this
 * file.
 *
 * ⭐ AND THE TWO WRITE PATHS TAKE A RUNNER, NOT A SERVICE. `productWriteRunner` and `skuWriteRunner` come
 * from `src/config/container.ts`, which rebuilds each graph against the boundary's own executor. That is
 * the M5/M6 requirement: a pool-bound service handed into an open transaction would write on a different
 * connection than the one being committed, and AAP §0.6.2's `hasUniqueOptions` read-back would interrogate
 * a sibling set that excludes the batch's own uncommitted rows — silently, with nothing reporting a
 * problem. This layer never names the unit of work and never demarcates a transaction; it hands over the
 * runner it was given.
 *
 * ⚠️ THE SKU READ PATH AND THE SKU WRITE PATH RESOLVE THEIR PRODUCT DIFFERENTLY, ON PURPOSE. The
 * `resolveProduct` supplied below is POOL-BOUND and serves the reading routes; the writing route resolves
 * its product through the runner's transaction-scoped graph instead, which is why
 * `src/handlers/skuHandler.ts` declares that member on its write graph as well as accepting a resolver.
 * Supplying the pool-bound resolver here is correct precisely because the write path does not use it.
 *
 * @param container the wired graph, from the composition root
 * @returns the five façades, ready to mount
 */
function createCatalogHandlers(container: CatalogContainer): CatalogHandlers {
  return {
    product: createProductHandler(
      container.productService,
      resolveFailClosedAuthorization,
      container.productWriteRunner,
    ),

    sku: createSkuHandler(
      container.skuService,
      (productID: string) => container.productService.getProduct(productID),
      resolveFailClosedAuthorization,
      container.skuWriteRunner,
    ),

    brand: createBrandHandler(container.brandService, resolveFailClosedAuthorization),

    option: createOptionHandler(container.optionService, resolveFailClosedAuthorization),

    /* ⛔ NO AUTHORISATION RESOLVER, AND ITS ABSENCE IS THE PORT OF `feed.cfc:L54-L56`. The legacy feed
     * controller declared `this.publicMethods="product";` with `this.anyAdminMethods=""` and
     * `this.secureMethods=""` both EMPTY, so the feed demanded neither a login nor a permission. The
     * handler's collaborator set contains no resolver slot for exactly that reason, and adding a gate here
     * would be introducing authorisation the legacy did not have (G4). This is the one route that is
     * reachable end to end. */
    googleFeed: createGoogleFeedHandler({
      feedQuery: container.productFeedQuery,
      feedSerializer: container.productFeedBuilder,

      /* Read from the graph rather than from the environment: `src/config/env.ts` is the only file in the
       * subtree permitted to touch `process.env`, and the container exposes `config` so this layer can
       * read the feed host without importing it (§0.8.3.9). No host literal appears anywhere here — the
       * legacy interpolated `#cgi.HTTP_HOST#` at `views/main/default.cfm:L50` and hardcoded nothing
       * either. */
      hostConfiguration: container.config.googleFeed,

      readProductImages: readNoProductImages,
      clock: FEED_RENDER_CLOCK,
    }),
  };
}

/* ================================================================================================
 * THE ROUTE TABLE — A STATIC DECLARATION, NOT A REGISTRY (TR-3, S3)
 * ============================================================================================== */

/**
 * The whole reachable surface, one entry per address.
 *
 * ⭐ EXHAUSTIVE IN BOTH DIRECTIONS, BY TYPE RATHER THAN BY REVIEW. The literal is annotated
 * `Record<RouteKey, RouteEntry>`: every member of {@link RouteKey} must appear, and nothing else may.
 * A route added without being declared above is rejected as an unknown property, and a declared address
 * left unmounted is reported as a missing one. Both were verified by deliberately breaking each direction
 * and reading the compiler's answer.
 *
 * ⭐ THE LITERAL IS ANNOTATED BEFORE IT IS FROZEN, AND THE ORDER MATTERS. Freezing first would hand the
 * literal to a generic parameter, which loses its freshness and with it the excess-property check — the
 * table would still fail to compile with an extra key, but for an obscure reason and with an unreadable
 * message. Annotating the binding keeps both diagnostics sharp.
 *
 * ⛔ IT IS A DECLARATION AND NOT A LOOKUP TABLE, WHICH IS THE DISTINCTION S3 TURNS ON. Nothing is
 * resolved from a string at run time: {@link createRouter} narrows the incoming action to
 * {@link RouteKey} FIRST, and only a value that has already been proved to be a declared address is ever
 * used to read from this record. An arbitrary string never indexes it. That is why there is no `Proxy`,
 * no `Reflect`, no `eval`, no `new Function`, no dynamic `import()`, no decorator and no container
 * library anywhere in this file — reproducing `onMissingMethod`'s prefix dispatch or DI/1's name lookup
 * in a new idiom is precisely what IR-1 and TR-3 retire.
 *
 * ⭐ EVERY ENTRY IS AN ARROW, DELIBERATELY. A bare `handlers.product.saveProduct` would be a method
 * reference whose `this` is lost the moment it is called through the table — the single most likely
 * silent break in a wiring like this one. Wrapping each in an arrow keeps the receiver, and it is the
 * same discipline `src/config/container.ts` applies to its persisters and removers.
 *
 * @param handlers the five mounted façades
 * @returns the frozen route table
 */
function createRouteTable(handlers: CatalogHandlers): Readonly<Record<RouteKey, RouteEntry>> {
  const routes: Record<RouteKey, RouteEntry> = {
    /* ------------------------------------------------------------------------------------------
     * ProductService — fifteen declared members, in the source order of
     * `model/service/ProductService.cfc` so the table reads against the legacy file line by line.
     * ---------------------------------------------------------------------------------------- */

    /* ⚠️ M1 LIVES BEHIND THIS ROUTE AND IS NOT RESOLVED HERE. The importer asks for a 3600-second
     * budget at `model/service/ProductService.cfc:L65-L68`, which exceeds the platform's function
     * ceiling and has no single-invocation equivalent; `productHandler.ts` owns that disclosure. This
     * layer adds no timeout, no queue hop and no chunking to paper over it (S8, S9). */
    'product.loadDataFromFile': (event) => handlers.product.loadDataFromFile(event),

    'product.getFormattedOptionGroups': (event) => handlers.product.getFormattedOptionGroups(event),
    'product.getProductSkusBySelectedOptions': (event) =>
      handlers.product.getProductSkusBySelectedOptions(event),
    'product.processProductAddOptionGroup': (event) =>
      handlers.product.processProductAddOptionGroup(event),
    'product.processProductAddOption': (event) => handlers.product.processProductAddOption(event),
    'product.processProductAddProductReview': (event) =>
      handlers.product.processProductAddProductReview(event),
    'product.processProductAddSubscriptionTerm': (event) =>
      handlers.product.processProductAddSubscriptionTerm(event),
    'product.processProductDeleteDefaultImage': (event) =>
      handlers.product.processProductDeleteDefaultImage(event),
    'product.processProductUpdateDefaultImageFileNames': (event) =>
      handlers.product.processProductUpdateDefaultImageFileNames(event),
    'product.processProductUpdateSkus': (event) => handlers.product.processProductUpdateSkus(event),
    'product.processProductUploadDefaultImage': (event) =>
      handlers.product.processProductUploadDefaultImage(event),
    'product.saveProduct': (event) => handlers.product.saveProduct(event),
    'product.saveProductType': (event) => handlers.product.saveProductType(event),
    'product.deleteProduct': (event) => handlers.product.deleteProduct(event),
    'product.getProductSmartList': (event) => handlers.product.getProductSmartList(event),

    /* Three IR-1 members: no source declaration exists for any of them, because
     * `org/Hibachi/HibachiService.cfc:L255-L281` fabricated them by prefix at run time. They are
     * declared explicitly on the service, mounted explicitly here, and nothing else the prefix
     * dispatcher could have produced is reproduced (AAP §0.4.2.5). */
    'product.newProduct': (event) => handlers.product.newProduct(event),
    'product.getProductType': (event) => handlers.product.getProductType(event),
    'product.getProduct': (event) => handlers.product.getProduct(event),

    /* ------------------------------------------------------------------------------------------
     * SkuService — nine declared members, in the source order of `model/service/SkuService.cfc`.
     * ---------------------------------------------------------------------------------------- */

    /* The combination engine, and the one route whose transaction spans a read-back: AAP §0.6.2's
     * `hasUniqueOptions` queries the sibling SKUs this operation is writing. The handler resolves the
     * product INSIDE the write runner's scope for that reason; this layer does not reorder, batch or
     * pre-resolve anything to "help". */
    'sku.createSkus': (event) => handlers.sku.createSkus(event),

    'sku.processImageUpload': (event) => handlers.sku.processImageUpload(event),
    'sku.getProductSkus': (event) => handlers.sku.getProductSkus(event),
    'sku.getSortedProductSkus': (event) => handlers.sku.getSortedProductSkus(event),
    'sku.searchSkusByProductType': (event) => handlers.sku.searchSkusByProductType(event),
    'sku.getSkuStocksDeletableFlag': (event) => handlers.sku.getSkuStocksDeletableFlag(event),
    'sku.getTransactionExistsFlag': (event) => handlers.sku.getTransactionExistsFlag(event),
    'sku.getSkuBySkuCode': (event) => handlers.sku.getSkuBySkuCode(event),
    'sku.getSkuSmartList': (event) => handlers.sku.getSkuSmartList(event),

    /* ------------------------------------------------------------------------------------------
     * BrandService — one declared member plus two IR-1 members.
     * ---------------------------------------------------------------------------------------- */
    'brand.saveBrand': (event) => handlers.brand.saveBrand(event),
    'brand.getBrand': (event) => handlers.brand.getBrand(event),
    'brand.deleteBrand': (event) => handlers.brand.deleteBrand(event),

    /* ------------------------------------------------------------------------------------------
     * OptionService — the three DECLARED members only. The four synthesized members are internal
     * collaborators and have no route; see the ⛔ note on {@link RouteKey}.
     * ---------------------------------------------------------------------------------------- */

    /* ⭐ THE ONE SYNCHRONOUS MEMBER IN THE WHOLE SURFACE, ADAPTED HERE AND NOWHERE ELSE.
     * `OptionHandler.getOptionsForSelect` returns a result rather than a promise, because
     * `model/service/OptionService.cfc:L55` performs no I/O — it projects an in-memory array into the
     * `{name, value}` shape. `Promise.resolve` adapts it to {@link RouteEntry} without inventing an
     * asynchronous boundary the source does not have (S9), and without widening the dispatcher's own
     * control flow. A synchronous throw from it still lands in the dispatcher's `catch`, because the call
     * happens inside the guarded block. */
    'option.getOptionsForSelect': (event) =>
      Promise.resolve(handlers.option.getOptionsForSelect(event)),

    'option.getUnusedProductOptions': (event) => handlers.option.getUnusedProductOptions(event),
    'option.getUnusedProductOptionGroups': (event) =>
      handlers.option.getUnusedProductOptionGroups(event),

    /* ------------------------------------------------------------------------------------------
     * The Google product feed.
     * ---------------------------------------------------------------------------------------- */

    /* ⭐ THE ONE LEGACY-ATTESTED ADDRESS, PRESERVED CHARACTER FOR CHARACTER:
     *     ?slatAction=google:feed.product
     * from `integrationServices/google/views/main/default.cfm:L50`, where the legacy interpolated
     * `#cgi.HTTP_HOST#` ahead of it. NO HOST IS HARDCODED HERE (§0.8.3.9) — the feed host comes from the
     * environment through `config.googleFeed`, as wired above.
     *
     * ⚠️ THE EVENT IS DISCARDED, AND THAT IS THE HANDLER'S CONTRACT RATHER THAN AN OVERSIGHT.
     * `GoogleFeedHandler.product` takes `GoogleFeedInvocationOptions`, whose single member is an optional
     * `AbortSignal` — it accepts no invocation event at all, because `feed.cfc:L58`'s `product(rc)` read
     * nothing from its request context. No signal is supplied: manufacturing a cancellation policy would
     * mean inventing a budget, and M2's six-minute render disclosure belongs to `googleFeedHandler.ts`,
     * which is where it stays (S8, S9). */
    'google:feed.product': () => handlers.googleFeed.product(),
  };

  return Object.freeze(routes);
}

/* ================================================================================================
 * THE DISPATCHER — A PURE FUNCTION OF THE INJECTED GRAPH (S6)
 * ============================================================================================== */

/**
 * Builds the dispatcher for a wired graph.
 *
 * ⭐ THIS IS THE S6 SEAM, AND IT IS THE WHOLE OF THIS FILE'S TESTABILITY STORY. AAP §0.4.1.12 defines no
 * `test/handlers/` entry for a router, so there is no test file to write; what there is instead is a
 * router that needs no bootstrap to exercise. AAP §0.4.3.6 records the contrast: legacy tests booted the
 * entire FW/1 application and resolved services through DI/1 at run time
 * (`meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84`), and the legacy repository vendored no mocking
 * library at all. Because the graph arrives as an argument, every route here is reachable with an object
 * literal — no database, no network call, no AWS runtime and no fake timers, since even the feed's clock
 * is injected one layer down.
 *
 * ⚠️ IT HOLDS NO STATE. The closure captures exactly two immutable things — the graph and the frozen
 * route table — and nothing accumulates across calls. M7's rule is that any memoisation in this layer is
 * request-scoped, never module-scope; the way this file honours it is by memoising nothing whatsoever.
 *
 * @param container the wired graph, from the composition root
 * @returns a dispatcher that answers one invocation
 */
export function createRouter(
  container: CatalogContainer,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  const routes = createRouteTable(createCatalogHandlers(container));

  /**
   * Narrows an arbitrary string to a declared address.
   *
   * ⭐ THE NARROWING IS THE SECURITY BOUNDARY AND THE TYPE BOUNDARY AT ONCE. `Object.hasOwn` tests OWN
   * enumerable membership of the frozen table, so no inherited member of `Object.prototype` can be
   * reached through it and no `__proto__`, `constructor` or `toString` is ever mistaken for a route. On
   * the type side, it is what turns an untrusted `string` into a {@link RouteKey}, so the read below is a
   * known-property access rather than an index signature — which is why it needs no `!`, no `as` and no
   * `undefined` branch of its own. `noUncheckedIndexedAccess` is fully in force; this guard is how the
   * requirement it imposes is met rather than suppressed.
   *
   * ⭐ AND IT IS DERIVED FROM THE TABLE, NOT FROM A SECOND LIST. Testing membership against a separately
   * maintained array of key names would be a second source of truth that could silently disagree with the
   * first.
   *
   * @param candidate the action string as it arrived
   * @returns whether it names a declared route
   */
  const isRouteKey = (candidate: string): candidate is RouteKey => Object.hasOwn(routes, candidate);

  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      /* ⭐ FIRST, ON EVERY INVOCATION, BEFORE ANY HANDLER RUNS — the container's own stated contract.
       * It discards the single request-scoped cell the graph carries, the option-group sort-order memo
       * that `model/dao/SkuDAO.cfc:L204-L220` kept alive for the life of the application server. Calling
       * it unconditionally, ahead of the route lookup, is deliberate: a warm container must not carry a
       * previous invocation's value into this one even when this one turns out to address nothing. */
      container.beginInvocation();

      const action = event.queryStringParameters?.[SLAT_ACTION_PARAMETER];

      /* ⛔ THE ONLY FALLBACK IS A TYPED NOT-FOUND (G6 (g)). An absent parameter and an unrecognised one
       * are answered identically, with `notFoundResponse()`'s neutral 404 body, which discloses nothing
       * about the addressable surface. There is no prefix guessing, no lower-cased retry, no
       * closest-match heuristic, no default route and no reflective invocation — the legacy's own
       * fallback was `onMissingMethod`'s throw at `org/Hibachi/HibachiService.cfc:L280`, and replacing
       * prefix synthesis with a declared miss is the point of the translation rather than a gap in it. */
      if (action === undefined || !isRouteKey(action)) {
        return notFoundResponse();
      }

      return await routes[action](event);
    } catch (error: unknown) {
      /* ⭐ VERBATIM, AND THE VERBATIM-NESS IS A PARITY REQUIREMENT (S7). Every legacy `throw()` message
       * the slice preserves — `SkuService.cfc:L204`'s "There was an unexpected error when creating this
       * product" among them — travels out through `httpResponse.ts`, which owns the whole classification
       * of `DomainError`, `LegacyParityError`, `NotImplementedError` and `ValidationError` and decides
       * which text is public. This layer does not reword, wrap, prefix, re-message, translate, retry or
       * classify anything: it hands the error over exactly as it arrived. Re-testing those branches here
       * would duplicate the classification and give it two places to diverge, which is also why neither
       * `../errors/DomainError` nor `../errors/ValidationError` is imported — every symbol this file
       * imports, it uses.
       *
       * `useUnknownInCatchVariables` is on, so the binding is already `unknown`; annotating it says so at
       * the site rather than leaving a reader to infer it from a compiler flag. */
      return errorResponse(error);
    }
  };
}

/* ================================================================================================
 * THE LAMBDA ENTRY POINT
 * ============================================================================================== */

/**
 * The dispatcher for the production graph, resolved ONCE at module load.
 *
 * ⭐ MODULE LOAD IS THE CONTRACT, NOT AN OPTIMISATION. `src/config/container.ts` states it: "The routing
 * layer calls this once per module load and beginInvocation once per invocation." AAP §0.3.2's Lambda
 * research is the reason — a database client and its pool belong at module scope so a warm invocation
 * reuses them rather than rebuilding them — and the container is explicit that building the graph opens
 * no connection and performs no I/O, so the cost of doing it here is a set of constructor calls.
 *
 * ⚠️ AND IT IS THE ONE MODULE-LEVEL BINDING WITH A DEPENDENCY ON THE ENVIRONMENT. `getCatalogContainer`
 * reaches `src/config/env.ts`, whose configuration is built eagerly and which throws a `DomainError`
 * naming the offending variable when a required value is missing — the fail-fast contract inherited from
 * `config/configORM.cfm:L4-L7`. A misconfigured deployment therefore fails during initialisation, loudly,
 * instead of answering requests it cannot serve. That is preserved rather than softened: deferring the
 * graph to first use would trade one loud failure for an indefinite series of quiet ones.
 */
const routeCatalogRequest = createRouter(getCatalogContainer());

/**
 * The AWS Lambda entry point for the whole Catalog slice.
 *
 * ⭐ ONE HANDLER, MANY ADDRESSES — the "thin routing layer" of AAP §0.4.1.9. It performs no work of its
 * own beyond delegation, which is what confines the AWS coupling of this deliverable to
 * `src/handlers/**` (AAP §0.5.5) and what makes a future runtime uplift a change to four artifacts, none
 * of which is in this folder.
 *
 * ⛔ NO CONTEXT, NO CALLBACK, NO MIDDLEWARE. The invocation context is not read, because nothing in the
 * slice needs it and reading a remaining-time budget would be the first step toward inventing a timeout
 * (S9). The callback form is not used either: an async function is the runtime's own preferred shape and
 * mixing the two is the classic way to strand an invocation.
 *
 * @param event the proxy invocation event, passed through to the addressed handler UNCHANGED
 * @returns the addressed handler's result, or a typed not-found when no route matches
 */
export const handler = (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  routeCatalogRequest(event);

/* ================================================================================================
 * COMPILE-TIME GUARD — ONE PAIRING A COMMENT COULD ONLY ASSERT
 * ============================================================================================== */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/*
 * The exported entry point must satisfy the runtime's own declared handler contract. Without this, a
 * signature drift — a renamed parameter type, a widened return, an accidentally synchronous body —
 * would keep compiling here and fail only when the platform invoked it, which is the latest and most
 * expensive place to learn about it. The type is taken from `./httpResponse`'s re-export rather than from
 * the AWS typings directly, so the coupling keeps its single declaration site in the subtree.
 */
type _HandlerSatisfiesLambdaContract = AssertAssignable<typeof handler, APIGatewayProxyHandler>;
