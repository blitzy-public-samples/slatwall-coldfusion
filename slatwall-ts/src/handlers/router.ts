/* ================================================================================================
 * ROUTER — THE THIN ROUTING LAYER (AAP §0.4.1.9, §0.1.2.1 "Routing")
 *
 * The FW/1 `slatAction` convention, re-expressed as an explicit, statically-typed route-to-handler
 * mapping in front of five per-service Lambda handlers. This is the file AAP §0.1.2.1 describes as
 * "Lambda handlers behind a thin router; all AWS coupling confined to the handler layer", and it is the
 * AGGREGATE Lambda entry point: the one module that mounts the whole address space.
 *
 * ⚠️ IT IS NOT THE ONLY MODULE THAT EXPORTS A `handler`, AND THIS HEADER USED TO SAY IT WAS. All SIX
 * modules named in `build/esbuild.mjs`'s entry list export one — this file plus `./productHandler`,
 * `./skuHandler`, `./brandHandler`, `./optionHandler` and `./googleFeedHandler` — because each is
 * independently deployable, serving only its own addresses. A review measured the old claim as false and
 * recorded it as finding **F8**. The distinction that IS true, and the one the rest of this header turns
 * on, is aggregate versus per-surface: this file answers all 34 addresses, each sibling answers its own
 * subset and 404s the rest, and (e) below records the one behavioural difference between them.
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
 * compile-checked declaration", so the split-and-invoke is replaced by the frozen record
 * {@link createRouteTable} builds, whose keys are the closed literal union {@link RouteKey}. A route
 * that is not declared cannot be reached, a
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
 * (c) BEHAVIOUR PRESERVED — FW/1's CASE-INSENSITIVITY IS CARRIED ACROSS (G2, G6)
 * ------------------------------------------------------------------------------------------------
 * The legacy matched actions case-INSENSITIVELY, and it did so on the default path. Verbatim from
 * `org/Hibachi/FW1/framework.cfc:L1957-L1961`:
 *
 *     if ( variables.framework.noLowerCase ) {
 *         request.action = validateAction( request.context[variables.framework.action] );
 *     } else {
 *         request.action = validateAction( lCase(request.context[variables.framework.action]) );
 *     }
 *
 * `noLowerCase` is false by default (`framework.cfc:L1876-L1877` initialises it) and
 * `config/configFramework.cfm` never sets it, so the DEFAULT branch — the one that lower-cases the action
 * before validating it — is the branch Slatwall ran. The same tolerance existed one layer down:
 * `org/Hibachi/HibachiService.cfc:L256` opens `onMissingMethod` with
 * `var lCaseMissingMethodName = lCase( missingMethodName );`, and DI/1's `getService("name")` lookup was
 * itself case-insensitive — AAP §0.4.3.2 records the legacy exploiting that inconsistently, with both
 * `getService("productService")` and `getService("ProductService")` appearing inside the in-scope entities.
 *
 * ⚠️ AN EARLIER REVISION OF THIS FILE DROPPED THAT TOLERANCE ON PURPOSE AND ARGUED FOR THE DROP HERE.
 * The argument was that a static table keyed by a literal union is naturally case-sensitive, that
 * lower-casing would "re-admit the very fuzziness the port exists to retire", and that the loss was the
 * honest treatment. A review rejected it and recorded finding **F4**, and the review is right on the
 * governing rule: AAP §0.8.1 licenses the IDIOM to change and Refactor Discipline Guideline 2 requires
 * observable behaviour to be preserved exactly. `?slatAction=Google:Feed.Product` reached the feed in the
 * legacy; a port that answers 404 for it has changed behaviour, not idiom, and no AAP exception covers it.
 *
 * SO THE TOLERANCE IS BACK, AND THE TABLE IS STILL CLOSED. `./httpResponse.ts`'s
 * `createCanonicalActionLookup` builds one frozen, null-prototype map from THIS FILE'S OWN DECLARED KEYS —
 * each key's lower-cased form to the key itself — once, at dispatcher construction. An incoming action is
 * lower-cased, looked up there, and only the canonical key it yields is ever used to index
 * {@link CATALOG_ROUTES}. Three consequences, because they are what the earlier argument was worried about:
 *
 *   * NO FUZZINESS IS RE-ADMITTED. The reachable set is unchanged — exactly the declared 34 addresses. The
 *     lookup's members ARE the table's keys, so nothing that was unreachable becomes reachable, and no
 *     prefix, no partial match and no heuristic is involved. TR-3 asked for resolution by explicit
 *     compile-checked declaration and that is still what happens: `CATALOG_ROUTES` is the declaration.
 *   * THE ROUTE KEYS STILL SPELL THE PRESERVED MEMBER NAMES EXACTLY. `product.saveProduct` remains
 *     `product.saveProduct` in the declaration, so §0.4.2's interface-parity claim is still readable
 *     straight off the table. Lower-casing happens to the incoming string, never to the keys.
 *   * TWO KEYS DIFFERING ONLY IN CASE ARE A CONSTRUCTION-TIME ERROR, not a silent winner. No such pair
 *     exists, and the guard makes sure one cannot be added quietly.
 *
 * The rule for a reader: this file declares the address space in canonical spelling; the shared dispatcher
 * owns how an incoming spelling is matched against it.
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
 * {@link RouteKey}: a member reachable from outside is a member with a route, and nothing else is.
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
 * ⚠️ THE RULE, STATED SO IT IS NOT LOST: NO REQUEST-DERIVED STATE IS EVER HELD ACROSS INVOCATIONS, AND
 * ANY MEMOISATION OF SUCH STATE IN THE HANDLER LAYER IS REQUEST-SCOPED. AAP §0.6.6 M7 is explicit that
 * nothing survives between Lambda invocations except module-scope state, and that memoisation must
 * therefore be scoped to the request "to avoid cross-tenant bleed on a warm container". Do not add a
 * warm-container cache here — not a route hit counter, not a memoised principal, not a cached feed, not
 * a "last event" reference.
 *
 * ⭐ WHAT IS SHARED AT MODULE SCOPE IS DELIBERATE AND ENUMERATED, AND AN EARLIER REVISION OF THIS NOTE
 * UNDERSTATED IT BY NAMING ONLY THE POOL. Four things live at module scope across the subtree, and what
 * they have in common is that NONE derives from an event, a caller or a tenant — which is exactly why
 * sharing them is safe and why warm reuse is the point of them:
 *   1. the `mysql2` pool in `src/config/database.ts` — created outside any handler so a warm container
 *      reuses one pool rather than one per invocation;
 *   2. the validated immutable configuration in `src/config/env.ts` — built once at load, with no
 *      reload, override or reset entry point;
 *   3. the memo cell in `src/config/container.ts` holding the one wired service graph — mutable exactly
 *      once, on first resolution, and never keyed by anything;
 *   4. the dispatcher each of the five PER-SURFACE handler modules memoises over that graph — a single
 *      `let dispatch<Surface>Action` populated on first invocation, because those modules defer their
 *      graph rather than resolving it at load. This file does not need one: it resolves the graph at
 *      load and binds its dispatcher into an immutable `const`.
 * The distinction is REQUEST-DERIVED versus not, not module-scope versus not. A cached principal fails
 * that test; a connection pool does not.
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
 * edge, never captured by the graph — which makes the handler layer the place one must be supplied. The
 * unauthenticated, deny-all resolver described in (d) is declared once for all six entry points in
 * `./httpResponse.ts` §8 and is passed to each handler from there.
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
 * KIND: no reflective invocation, no prefix guessing, no "closest match" heuristic, no default route.
 * Prefix synthesis is precisely what IR-1 retires, and reproducing it in a router would re-create
 * `onMissingMethod` in a new idiom while the rest of the port was declaring its way out of it.
 *
 * ⚠️ CASE-INSENSITIVE MATCHING IS NOT A FALLBACK AND IS NOT IN THAT LIST. It is one deterministic lookup
 * over the declared keys, performed BEFORE the recognition test rather than after a failed one, and it is
 * carried across from `framework.cfc:L1957-L1961` — see (c). Nothing is retried, and an action that is not
 * a declared address in any casing still lands here.
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
 *   - State any number other than an HTTP status code. The one calendar-unit constant the feed's clock
 *     needs is argued and declared in `./googleFeedHandler.ts`, not here. No timeout, memory size,
 *     retry count, backoff,
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
 *
 * ⭐ AND THE FIVE PER-SURFACE ENTRIES DELIBERATELY DO THE OPPOSITE, WHICH IS A RECORDED DECISION RATHER
 * THAN AN INCONSISTENCY. A QA pass measured the asymmetry and asked for it to be settled either way; it
 * is settled here, in favour of keeping both behaviours, because the two entry kinds are answerable to
 * different requirements:
 *
 *   THIS FILE is the primary deployment — one function serving the whole address space — so it is the one
 *   that must not come up half-working. It resolves the graph at module load and a misconfiguration
 *   fails the cold start, naming the offending variable in the initialisation error. Nothing about that
 *   is relaxed by what follows.
 *
 *   `./productHandler`, `./skuHandler`, `./brandHandler`, `./optionHandler` and `./googleFeedHandler`
 *   defer the graph to their first invocation, so importing one of them constructs no container and reads
 *   no environment. Each also resolves a NARROWER graph than this file does — through its own
 *   `get*SurfaceGraph` accessor on the composition root, composing what its own routes can reach, after a
 *   review pass (PERF-01) measured all six artifacts constructing the whole catalog. That changes WHAT they
 *   construct, not when they require it: both properties below are unaffected, and both are still asserted. That property is not an accident of implementation: it is asserted by
 *   `test/handlers/entrySurface.test.ts`, it is what lets those modules be loaded by their own unit
 *   suites and by any reader inspecting an artifact, and it is why the emitted per-surface bundles can be
 *   required with an empty environment at all. The cost is that a misconfigured deployment of one of
 *   those five answers `500 "The service is not correctly configured"` per invocation instead of failing
 *   at initialisation — CLASSIFIED, never opaque. The offending variable is not published on that path
 *   at all: the response carries one message, and the server-side diagnostic carries the failure class,
 *   the classification code and a correlation ID. That is a safe failure, not a silent one, and
 *   `test/handlers/entrySurface.test.ts` §5 pins it so neither half can drift.
 *
 * The consequence a reader should carry away: a misconfigured deployment is loud on this entry and
 * classified-per-request on the other five, both are fail-safe, and neither behaviour is accidental.
 * README §4 states the same thing for a reader who never opens this file.
 * ============================================================================================== */

import { getCatalogContainer, type CatalogContainer } from '../config/container';

import {
  createBrandHandlerFromContainer,
  createBrandRoutes,
  type BrandHandler,
  type BrandRouteKey,
} from './brandHandler';
import {
  createGoogleFeedHandlerFromContainer,
  createGoogleFeedRoutes,
  type GoogleFeedHandler,
  type GoogleFeedRouteKey,
} from './googleFeedHandler';
import {
  createOptionHandlerFromContainer,
  createOptionRoutes,
  type OptionHandler,
  type OptionRouteKey,
} from './optionHandler';
import {
  createProductHandlerFromContainer,
  createProductRoutes,
  type ProductHandler,
  type ProductRouteKey,
} from './productHandler';
import {
  createSkuHandlerFromContainer,
  createSkuRoutes,
  type SkuHandler,
  type SkuRouteKey,
} from './skuHandler';

import {
  createActionDispatcher,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
  type CatalogAuthorizationResolver,
} from './httpResponse';

/* ================================================================================================
 * THE EDGE VALUES THIS FILE NO LONGER DECLARES — WHERE THEY WENT, AND WHY
 *
 * Four values used to be declared here: the action parameter name, the fail-closed authorisation
 * resolver, and the feed's clock and image reader. All six Lambda entry points in this folder need the
 * first two, and this file is no longer the only one that mounts the feed, so declaring them here made
 * this file the accidental owner of things every sibling also required.
 *
 *   `SLAT_ACTION_PARAMETER` and `resolveFailClosedAuthorization` now live in `./httpResponse.ts`, §7
 *   and §8, together with `createActionDispatcher` — the shared edge module every handler in this
 *   folder already imports. Their full reasoning travelled with them: the `config/configFramework.cfm:L2`
 *   locator for the parameter name, and the deny-all remainder argument for the principal. §8.1 of that
 *   module additionally owns the DEPLOYMENT SEAM — the registration cell and the per-invocation reader
 *   this file's `resolveAuthorization` parameter falls back to — because all six entry points need it and
 *   none of them may hold a second copy of the fallback rule.
 *
 *   `FEED_RENDER_CLOCK` and the empty image reader now live in `./googleFeedHandler.ts`, in its own
 *   entry-point section, because that file owns the feed and is what knows which collaborators the feed
 *   needs. This file asks it for a wired handler instead of assembling one.
 *
 * ⭐ WHAT THIS FILE STILL OWNS, AND IT IS THE POINT OF THE FILE: the AGGREGATE surface. Each handler
 * module declares the actions it serves; this file is where all five declarations are composed into one
 * address space, and where {@link RouteKey} proves the composition is complete.
 * ============================================================================================== */

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
 * ⭐ COMPOSED FROM FIVE PER-SURFACE UNIONS, EACH DECLARED IN THE MODULE THAT SERVES IT. Every key was
 * written out here once, beside a table that restated all 34 of them a second time; a route could then be
 * spelled one way in a per-service handler's own vocabulary and another way here, and only a reader
 * comparing the two would notice. Now each handler module declares its own keys — `ProductRouteKey` and
 * the four beside it — and this union is their sum, so an action is named in exactly ONE place and the
 * aggregate cannot drift from the surface it aggregates.
 *
 * ⭐ THE TWO-DIRECTION GUARANTEE IS UNCHANGED, AND IT IS STILL THE REASON THE UNION EXISTS. Each
 * per-surface table is typed `ActionRouteTable<ThatSurface'sRouteKey>`, so within a surface a declared key
 * with no entry is a compile error and an entry with no declared key is rejected as an unknown property.
 * {@link createRouteTable} then annotates the merged literal `Record<RouteKey, RouteEntry>`, which
 * re-checks both directions across the whole address space: a surface whose table was forgotten in the
 * merge is reported as a set of missing keys. Both directions were verified by deliberately breaking each
 * one and reading the compiler's answer.
 *
 * ⭐ AND THE PARITY ARTIFACT SURVIVES THE MOVE. §0.8.3.1's "interface parity is checkable
 * method-by-method" is still cashed in by an enumeration a reviewer can read — it is now read per surface,
 * against the service each surface exposes, which is if anything the more direct comparison. The count is
 * unchanged at 34: 18 product, 9 SKU, 3 brand, 3 option and the single legacy-attested feed action.
 */
export type RouteKey =
  ProductRouteKey | SkuRouteKey | BrandRouteKey | OptionRouteKey | GoogleFeedRouteKey;

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
 * ⭐ THE AUTHORISATION RESOLVER TRAVELS THROUGH HERE, AND AN EARLIER REVISION GAVE IT NOWHERE TO ENTER.
 * Each per-surface factory hard-wired the deny-all resolver and this function accepted none, so the
 * aggregate router — the natural single-function deployment — could not supply a principal by any means,
 * and all thirty-three catalog actions answered `401` permanently while README claimed a seam existed. A
 * code review classified that as a CRITICAL callable-boundary defect. The parameter below is the
 * aggregate half of the remedy: the four gated surfaces receive whatever this router was given, and what
 * they receive when it was given nothing is `./httpResponse.ts` §8.1's registered-resolver reader, which
 * is evaluated per invocation and is fail-closed until a deployment registers.
 *
 * @param container the wired graph, from the composition root
 * @param resolveAuthorization the per-invocation resolver for the four gated surfaces; omitted means
 *   each surface applies its own fail-closed default
 * @returns the five façades, ready to mount
 */
function createCatalogHandlers(
  container: CatalogContainer,
  resolveAuthorization?: CatalogAuthorizationResolver,
): CatalogHandlers {
  return {
    /* ⭐ EACH FAÇADE IS BUILT BY THE MODULE THAT OWNS IT, from the same graph this function received.
     * The wiring used to be written out here — which service, which resolver, which runner, per surface —
     * and each per-service module then had to repeat it for its own entry point. Asking each module for a
     * wired handler instead leaves exactly one place per surface that knows what that surface needs, and
     * this function is left doing what a router should: naming the five surfaces it mounts. */
    product: createProductHandlerFromContainer(container, resolveAuthorization),
    sku: createSkuHandlerFromContainer(container, resolveAuthorization),
    brand: createBrandHandlerFromContainer(container, resolveAuthorization),
    option: createOptionHandlerFromContainer(container, resolveAuthorization),

    /* ⛔ NO AUTHORISATION RESOLVER REACHES THE FEED, AND ITS ABSENCE IS THE PORT OF `feed.cfc:L54-L56`.
     * The legacy feed controller declared `this.publicMethods="product";` with `this.anyAdminMethods=""`
     * and `this.secureMethods=""` both EMPTY, so the feed demanded neither a login nor a permission. Its
     * collaborator set carries no resolver slot for exactly that reason, and adding a gate would be
     * introducing authorisation the legacy did not have (G4). This is the one route reachable end to end. */
    googleFeed: createGoogleFeedHandlerFromContainer(container),
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
     * Five per-surface tables, merged. Each is declared in the handler module that serves it, in the
     * source order of the legacy service it ports, and each carries the disclosures that belong to its
     * own members — M1 behind `product.loadDataFromFile`, M2 behind the feed, the D4 boundary behind
     * `sku.getSkuStocksDeletableFlag`, and the synchronous adaptation of
     * `option.getOptionsForSelect`. Restating those keys here would mean restating those disclosures
     * too, in a file that does not implement any of them.
     *
     * The spread order is immaterial to behaviour — the five key sets are disjoint by construction,
     * since each is prefixed with its own surface — and the annotation on this binding is what proves
     * the merge covers {@link RouteKey} exactly, in both directions.
     * ---------------------------------------------------------------------------------------- */
    ...createProductRoutes(handlers.product),
    ...createSkuRoutes(handlers.sku),
    ...createBrandRoutes(handlers.brand),
    ...createOptionRoutes(handlers.option),
    ...createGoogleFeedRoutes(handlers.googleFeed),
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
 * (`meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79`), and the legacy repository vendored no mocking
 * library at all. Because the graph arrives as an argument, every route here is reachable with an object
 * literal — no database, no network call, no AWS runtime and no fake timers, since even the feed's clock
 * is injected one layer down.
 *
 * ⚠️ IT HOLDS NO STATE. The closure captures exactly two immutable things — the graph and the frozen
 * route table — and nothing accumulates across calls. M7's rule is that any memoisation in this layer is
 * request-scoped, never module-scope; the way this file honours it is by memoising nothing whatsoever.
 *
 * ⭐ IT ACCEPTS THE DEPLOYMENT'S AUTHORISATION RESOLVER, WHICH IS WHAT MAKES THE AGGREGATE SURFACE
 * CALLABLE. A deployment that builds its own entry module — `createRouter(getCatalogContainer(), myResolver)`
 * — gates every catalog route on its own principal without touching this file, and a deployment that
 * takes the packaged artifact as it stands registers the same resolver through
 * `./httpResponse.ts`'s `registerRequestAuthorizationResolver` instead. Both routes end at the
 * same per-invocation call; neither captures a context (AAP §0.6.6 M7). Supplying nothing keeps the
 * deny-all answer, which is the only thing this port decides about identity.
 *
 * @param container the wired graph, from the composition root
 * @param resolveAuthorization the deployment's per-invocation resolver for the four gated surfaces;
 *   omitted means fail-closed until one is registered
 * @returns a dispatcher that answers one invocation
 */
export function createRouter(
  container: CatalogContainer,
  resolveAuthorization?: CatalogAuthorizationResolver,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  /*
   * ⭐ THE DISPATCH MECHANICS ARE SHARED, AND SHARING THEM IS THE POINT. `./httpResponse.ts` §7 owns the
   * four steps every entry point in this folder performs — begin the invocation, read
   * `SLAT_ACTION_PARAMETER` from the query string, answer a neutral 404 for an action this surface does
   * not serve, and convert every failure through `errorResponse` — together with the reasoning for each:
   * why the invocation hook runs first and unconditionally, why `Object.hasOwn` is the membership test
   * (so `__proto__`, `constructor` and `toString` can never resolve to a route), why an absent and an
   * unrecognised action are answered identically, and why nothing is reworded on the way out. This file
   * used to carry that loop itself while five sibling entry points needed the same one; a second copy is
   * a second chance for one of them to answer differently, so there is now exactly one.
   *
   * ⛔ WHAT IS NOT SHARED IS THE SURFACE. The routes below are this file's own: the aggregate of all five
   * per-surface tables, which is what makes this the address space for the whole slice rather than for
   * one service.
   */
  return createActionDispatcher<RouteKey>({
    routes: createRouteTable(createCatalogHandlers(container, resolveAuthorization)),
    beginInvocation: () => {
      container.beginInvocation();
    },
  });
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
 *
 * ⚠️ READ THAT LAST SENTENCE AS A STATEMENT ABOUT *THIS* ENTRY, NOT AS A RULE THE SIBLINGS BREAK. The five
 * per-surface entries do defer, deliberately, and the module header records the full decision: their
 * failure is neither indefinite nor quiet but a classified per-invocation configuration failure, and
 * their deferral is what keeps them loadable with no environment — a property their suites assert. This
 * file is the primary entry and fails loudest; that division is the settled answer to the asymmetry a QA
 * pass raised, not an oversight in either direction.
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

/* ================================================================================================
 * THE DEPLOYMENT REGISTRATION SEAM, RE-EXPORTED SO IT IS REACHABLE FROM THE PACKAGED ARTIFACT
 * ============================================================================================== */

/*
 * ⭐ THIS IS THE AGGREGATE ARTIFACT, SO IT IS THE ONE A SINGLE-FUNCTION DEPLOYMENT HOLDS. `handler` above
 * serves all thirty-four addresses, four of whose surfaces are gated; a deployment that mounts only this
 * module needs the registration seam here or it has no way to reach it at all.
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
