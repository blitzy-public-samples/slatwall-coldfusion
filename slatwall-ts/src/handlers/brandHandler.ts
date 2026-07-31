/**
 * brandHandler — the AWS boundary for the extracted Catalog brand surface.
 *
 * Authority: AAP 0.4.1.9 — exposes the `BrandService` surface. The member surface is fixed by
 * AAP 0.4.2.3 (the one declared member) and AAP 0.4.2.5 (the three synthesized members).
 *
 * WHAT THIS FILE IS
 * -----------------
 * Each member below narrows the proxy event, calls the brand service, and shapes the outcome through
 * ./httpResponse (AAP 0.3.2). There is no query, no combination enumeration, no validation rule, no
 * field mapping and no SQL anywhere in this file, because every one of those belongs to a layer beneath
 * it.
 *
 * It is a THIN, INJECTABLE FUNCTION OF THE SERVICE: {@link createBrandHandler} takes the service and
 * returns the four bound operations. Nothing is constructed here, nothing is resolved by name, and
 * ../config/container is never imported — the planned src/handlers/router.ts is to call the composition
 * root and pass the service in. That is also what makes this file assertable with a hand-written double, without a
 * database, a network call or an AWS runtime (AAP 0.7.3 S6).
 *
 * FOUR MEMBERS, AND THE COUNT IS THE POINT
 * ----------------------------------------
 * model/service/BrandService.cfc declares EXACTLY ONE public function, and AAP 0.6.3.3 records the
 * consequence — it has no dead injections and is the cleanest of the four services. A one-member
 * service produces a small handler, and that is correct rather than incomplete.
 *
 * The injected SERVICE surface is four members, because `saveBrand`'s creation path genuinely needs
 * the synthesized factory. The ROUTED surface is three, because `newBrand` has no legacy action
 * behind it and is therefore not something a caller may invoke directly. {@link BrandHandler}
 * records the evidence for that split, and {@link BRAND_ACCESS_MATRIX} classifies the three that
 * remain using the legacy's own vocabulary.
 *
 * EVERY ROUTED MEMBER IS AUTHORISED BEFORE IT DOES ANYTHING
 * --------------------------------------------------------
 * The legacy authorised every request in one place, before any controller method ran —
 * `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203], refusing at [:L188]. That gate is framework
 * code and does not cross the boundary (AAP 0.8.3.2), so its CONTRACT is declared as a port instead
 * and consulted here. Restoring it is PARITY, not invented policy; judgment (k) records what
 * changed, which is only the failure mode.
 *
 * The injected SERVICE surface is four members, because `saveBrand`'s creation path genuinely needs
 * the synthesized factory. The ROUTED surface is three, because `newBrand` has no legacy action
 * behind it and is therefore not something a caller may invoke directly. {@link BrandHandler}
 * records the evidence for that split, and {@link BRAND_ACCESS_MATRIX} classifies the three that
 * remain using the legacy's own vocabulary.
 *
 * EVERY ROUTED MEMBER IS AUTHORISED BEFORE IT DOES ANYTHING
 * --------------------------------------------------------
 * The legacy authorised every request in one place, before any controller method ran —
 * `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203], refusing at [:L188]. That gate is framework
 * code and does not cross the boundary (AAP 0.8.3.2), so its CONTRACT is declared as a port instead
 * and consulted here. Restoring it is PARITY, not invented policy; judgment (k) records what
 * changed, which is only the failure mode.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP 0.8.2 Guideline 6)
 * ----------------------------------------------------------------
 * The four mandated groups are (a) to (d); (e) to (j) are the judgments this file makes on its own
 * account and are each restated at the member that makes them.
 *
 * (a) THREE OF THE FOUR SERVICE MEMBERS HAD NO CFML DECLARATION AT ALL. `newBrand`, `getBrand` and
 *     `deleteBrand` appear in no source file anywhere in the legacy repository. They existed only
 *     because org/Hibachi/HibachiService.cfc:L255-L281 fabricated a service's entire implicit CRUD
 *     surface at call time by matching a lower-cased method-name prefix — `get` at :L258,
 *     `get*smartlist` at :L259, `new` at :L264, `list` at :L266, `save` at :L268, `delete` at :L270,
 *     `count` at :L272, `export` at :L274 and `process` at :L276 — and raised a bare string at :L280
 *     for anything else. IR-1 states that TypeScript under `strict` "has no equivalent facility", so
 *     each such call site becomes an explicitly declared, typed method; TR-3 puts the same rule
 *     generally: "Every runtime-synthesized method, every string-keyed service lookup and every
 *     metadata-driven behavior becomes an explicit, compile-checked declaration." All three are
 *     declared literally on {@link BrandHandlerService} below, and the dispatcher is emulated by
 *     NOTHING — no Proxy, no Reflect, no index signature, no string-keyed dispatch map, no prefix
 *     helper and no decorator (AAP 0.7.3 S3). Re-creating `onMissingMethod` in a new idiom would
 *     defeat the exercise. DECLARED IS NOT THE SAME AS ROUTED: see THREE ROUTED MEMBERS OVER A
 *     FOUR-MEMBER SERVICE above for which of the four reach the boundary and which does not.
 *
 * (b) THE RESTRAINT IS AS BINDING AS THE DECLARATION. AAP 0.4.2.5 ends with "synthesis is not
 *     reproduced wholesale, only where used", so there is deliberately no `countBrand`, no
 *     `listBrand`, no `exportBrand`, no `processBrand` and no `getBrandSmartList` here — nor any
 *     compound `getBrandByXxx` form, which :L296-L298 shows the dispatcher would also have
 *     fabricated. The slice calls none of them. Adding one because the dispatcher COULD have
 *     produced it is precisely the enhancement AAP 0.8.2 Guideline 4 forbids. The same restraint is
 *     what withdraws exactly ONE of the four declared members — `newBrand` — from the ROUTE surface:
 *     the slice calls it, so it is declared, but no legacy action ever addressed it from outside, so
 *     nothing here publishes it. {@link BrandHandler} carries that evidence.
 *
 *     ⚠️ THE RESTRAINT STOPS THERE, AND THE STOPPING POINT IS EVIDENCE-LED RATHER THAN ARBITRARY.
 *     An earlier revision of this file read judgment (b) more widely and withdrew `getBrand` and
 *     `deleteBrand` as well, leaving `saveBrand` as the only closure. That reading was withdrawn,
 *     for four reasons recorded here rather than in a commit message:
 *       - AAP 0.4.2.3's "exactly 1 public member" is a statement about the OBSERVABLE SERVICE
 *         CONTRACT — Goal B's 28 members, the surface AAP 0.8.3.1 requires be "checkable
 *         method-by-method". It tabulates `model/service/BrandService.cfc`'s `public … function`
 *         declarations. It says nothing about which operations a boundary mounts.
 *       - AAP 0.4.2.5 INDEPENDENTLY REQUIRES all three synthesized members. It names
 *         `brandService.newBrand()`, `brandService.getBrand(id)` and
 *         `brandService.deleteBrand(entity)` as real call sites in the slice and states each "must
 *         be declared explicitly" (IR-1). A file that both declares them and refuses to let anything
 *         reach them satisfies the letter of 0.4.2.5 and none of its purpose.
 *       - THE AAP ENUMERATES NO ROUTES ANYWHERE. AAP 0.4.1.9 assigns this file "the BrandService
 *         surface" and assigns routing itself to src/handlers/router.ts, which is a separate target
 *         file. There is therefore no route list to be in breach of, in either direction.
 *       - THE ORIGINAL OBJECTION WAS TO AN UNGATED SURFACE, NOT TO A WIDE ONE. Reaching a brand by
 *         identifier and deleting one are the two operations that need a principal; publishing them
 *         with no gate is what was wrong. {@link BRAND_ACCESS_MATRIX} now classifies all three, and
 *         `resolveAuthorization` is a REQUIRED parameter of {@link createBrandHandler}, so an
 *         ungated routed brand operation is not a state a caller can construct. The gate is the
 *         remedy; amputation was a proxy for it.
 *     What both readings agree on is preserved exactly: `newBrand` stays unrouted, and the reason it
 *     stays unrouted is evidence about the legacy application rather than a preference.
 *
 * (c) THE URL-TITLE DERIVATION AND THE `SwBrand` TABLE NAME BELONG TO THE SERVICE, NOT HERE. The legacy
 *     body at model/service/BrandService.cfc:L67-L78 tests the entity's and the payload's URL title at
 *     :L68, prefers the payload's `brandName` at :L69-L70, falls back to the entity's at :L71-L72, and
 *     in both arms calls `createUniqueURLTitle(titleString=…, tableName="SwBrand")`. AAP 0.4.1.8 assigns
 *     all of that to the service, so this handler does NOT compute a URL title, does NOT inspect
 *     `brandName`, does NOT mutate the payload and does NOT name `SwBrand` or any other table —
 *     AAP 0.7.3 S2 inverts into a prohibition at this layer.
 *
 * (d) `super.save()` RESOLVED TO SLATWALL CODE, AND IS NOW COMPOSITION RATHER THAN INHERITANCE. IR-8
 *     names this exact line as its worked example: the `super.save()` at
 *     model/service/BrandService.cfc:L76 resolves to the LOCAL override at
 *     model/service/HibachiService.cfc:L86 — not to the framework base — because :L49 of the service
 *     says `extends="HibachiService"` with no package prefix, and the local base's own :L49 is what
 *     declares `extends="Slatwall.org.Hibachi.HibachiService"`. The distinction is load-bearing: the
 *     local override adds the activeFlag and settings post-processing block at :L91-L101 that the
 *     framework base does not have, and the local `delete()` at :L68 likewise adds cleanup the framework
 *     base lacks. R3 (AAP 0.4.3.3) replaces that template-method reuse with an injected BaseService
 *     collaborator; that wiring lives in src/services/ and src/config/container.ts, and this file
 *     imports neither.
 *
 * (e) THE UPDATE PATH MUST RESOLVE AN IDENTIFIER INTO AN ENTITY BEFORE IT CAN CALL THE SERVICE.
 *     Recorded at {@link createBrandHandler}'s `saveBrand`.
 * (f) AN UNBOUND IDENTIFIER MEANS CREATE. Recorded at `saveBrand`.
 * (g) THE DELETE VERDICT IS FORWARDED AS A BOOLEAN AND NEVER BECOMES A STATUS. Recorded at
 *     `deleteBrand`.
 * (h) `newBrand` IS DECLARED ON THE INJECTED SERVICE BUT IS NOT ROUTED, BECAUSE NO LEGACY ACTION
 *     EVER REACHED IT. Recorded at {@link BrandHandler}.
 * (i) THE REQUEST BODY IS REQUIRED BECAUSE THE LEGACY PARAMETER IS. Recorded at `saveBrand`.
 * (j) AN EMPTY IDENTIFIER IS THE LEGACY UNSAVED-VALUE SENTINEL. Recorded at
 *     {@link UNSAVED_BRAND_ID}.
 * (k) THE LEGACY REQUEST GATE BECAME AN INJECTED, PER-INVOCATION POLICY, AND ITS LOGIN REDIRECT
 *     BECAME A STATUS CODE. Recorded at {@link BRAND_ACCESS_MATRIX} and at
 *     {@link createBrandHandler}'s `refuseUnauthorized`; the status choice itself is recorded in
 *     ./httpResponse, which owns every status in this folder.
 * (l) A ROUTE RETURNS AN EXPLICIT MINIMAL PROJECTION, NEVER A DOMAIN INSTANCE. Recorded at
 *     {@link BrandResponse} and {@link toBrandResponse}.
 *
 * The list is (a) to (l) with no gaps, and one letter changed its subject rather than being retired.
 * An earlier revision withdrew `getBrand` and `deleteBrand` from the route surface and consequently
 * declared (g) and (h) "deliberately absent". Judgment (b) above records why that withdrawal was
 * itself withdrawn, so (g) is made again at `deleteBrand` — the delete verdict is forwarded as a
 * boolean and never becomes a status — and (h) now records the one member that really is unrouted,
 * `newBrand`, in place of the earlier note about the promise on its routed form. Nothing about the
 * underlying contracts moved: the boolean delete verdict is still owned by ../services/BaseService
 * and ../services/BrandService, and `newBrand` is still deliberately synchronous there because the
 * legacy `new` branch only instantiates in memory. The history is recorded rather than smoothed over
 * so a reader comparing revisions sees a re-decision instead of inferring a renumbering.
 *
 * Imports are exactly four modules — ./httpResponse, ../domain/product/Brand,
 * ../ports/AccountContextPort and ../services/BrandService — all relative and extensionless, because
 * tsconfig.json declares no `paths` or `baseUrl`. AAP 0.4.3.5 requires that so "tsc and esbuild
 * resolve identically and no runtime resolver shim is needed"; an alias that type-checks can still
 * throw MODULE_NOT_FOUND on a Lambda cold start.
 *
 * THE PORT IMPORT IS TYPE-ONLY, WHICH IS WHAT MAKES IT ADMISSIBLE. S4 permits this folder to import
 * from ../ports/** type-only, and ../ports/AccountContextPort is a type-only module in its own right
 * — four interfaces, three type aliases, no class, no function body and no import statement — so it
 * contributes not one runtime byte to a packaged artifact and creates no runtime coupling. What
 * crosses is a contract, which is the entire purpose of a port.
 *
 * WHAT IS DELIBERATELY ABSENT, ALL OF IT ON PURPOSE
 * ------------------------------------------------
 *   - Any import from ../adapters/**, ../validation/**, ../config/database or ../config/env, and no
 *     mysql2, no SQL fragment, no bound-parameter array, no table or column identifier
 *     (AAP 0.7.3 S2, S4). The one ../ports/** import is type-only and is discussed above.
 *   - Any read of the process environment. src/config/env.ts is the only module in the subtree
 *     permitted to do that (AAP 0.4.3.5, 0.8.3.9), and no credential, host, endpoint, region,
 *     account identifier or resource-name literal appears either.
 *   - Any import of ../errors/DomainError or ../errors/ValidationError. That omission is a
 *     DECISION, not a gap: a validation failure raised by the base collaborator and every legacy
 *     thrown message string travel THROUGH this file as thrown values and are recognised and shaped
 *     exclusively by {@link errorResponse}, which is the single error-to-response mapping in the
 *     folder and which preserves the keyed error structure AAP 0.4.1.11 requires. Naming either
 *     class here would duplicate that mapping and would add an unused import.
 *   - Any validation rule or delete guard. model/validation/Brand.json declares `brandName`
 *     required on save, `brandWebsite` typed as a url, `urlTitle` required and unique, and
 *     `maxCollection: 0` delete guards on `products` and `physicalCounts`. Those are evaluated by
 *     src/validation/ through the base collaborator; nothing is pre-checked, duplicated or
 *     anticipated here.
 *   - Any module-scope mutable state, cache or memo — and, specifically, ANY CAPTURED PRINCIPAL.
 *     AAP 0.6.6 M7 permits module-scope state only in src/config/database.ts and requires any
 *     memoisation elsewhere to be request-scoped "to avoid cross-tenant bleed on a warm container".
 *     This file memoises nothing at all: its module-scope declarations are three immutable string
 *     constants, one frozen access matrix, the types, and two functions. The authorisation context
 *     is resolved per invocation rather than captured, precisely because a captured principal WOULD
 *     be such bleed — the second caller on a warm container would be authorised as the first.
 *   - The execution-model mismatches owned elsewhere. AAP 0.6.6 M1 (the importer's one-hour request
 *     budget) belongs to productHandler.ts and M2 (the feed's six-minute render budget) to
 *     googleFeedHandler.ts; neither is restated or worked around here. M5's implicit request-end
 *     flush is replaced by an explicit UnitOfWork in the adapter layer, which this file never
 *     imports. The legacy 60s/45s session locks in OrderService/PaymentService are noted by
 *     AAP 0.8.3.5 and deliberately not implemented anywhere, here included.
 *   - Any route table, and any port of the legacy FW/1 route at config/configFramework.cfm:L9,
 *     `{"$GET/brand/:urlTitle" = "/public:main/brand/urlTitle/:urlTitle/"}`. That route targets the
 *     excluded `public:` subsystem (AAP 0.2.2.2), so it is carried nowhere — recorded only so its
 *     omission reads as a decision. Routing itself is src/handlers/router.ts.
 *   - Any service-level objective, timeout, page size, batch size, retry count, backoff schedule,
 *     rate limit, concurrency limit or cache lifetime, and any health, readiness or metrics
 *     endpoint (AAP 0.7.3 S9, IR-12). NO NUMERIC LITERAL APPEARS IN THIS FILE AT ALL — not even a
 *     status code, because every status is chosen inside ./httpResponse.
 *   - Any logging, metrics or tracing library, any HTTP client, any schema-validation package and
 *     any framework adapter. The dependency set stays frozen: package.json gains nothing because
 *     of this file (AAP 0.7.3 S5). The AWS SDK is intentionally absent — AAP 0.5.2.1 records that
 *     it already ships inside the Lambda runtime.
 *   - Any Dxx defect annotation. AAP 0.6.3.3 confirms BrandService has no dead injections and the
 *     AAP 0.6.7 register lists no brand-service defect, so this file surfaces none and mints no new
 *     register number (AAP 0.7.3 S7).
 *   - Any user interface. This handler returns data, never markup: AAP 0.3.4 and 0.9.1 record that
 *     no design system applies, there are zero attachments and zero Figma frames, and the target is
 *     a headless service.
 *   - Any AUTHENTICATION MECHANISM. This file names no header, no scheme, no token format, no cookie
 *     and no claim; it parses no credential, decodes nothing and verifies no signature. It decides
 *     only what happens when the injected resolver reports no principal or a negative verdict — HOW
 *     a principal is established is the resolver's concern, and inventing a mechanism the source
 *     never described (the legacy used a form post and a session, not an HTTP scheme) would breach
 *     AAP 0.7.3 S9 and IR-12. Nor is any role, permission, permission group, scope or claim name
 *     declared anywhere: {@link BRAND_ACCESS_MATRIX} uses the four classifications the legacy itself
 *     declares on a controller, and the permission model behind `'secure'` stays entirely behind the
 *     port — the twenty-one `Account*` components are out of scope (AAP 0.2.2.1).
 *   - Any whole-entity response. Every successful brand body is {@link BrandResponse}, an explicit
 *     projection; see judgment (l) for what it excludes and why.
 *
 * TEST PROVENANCE (AAP 0.6.5, AAP 0.7.3 S6) — EVERYTHING HERE IS NET-NEW
 * ---------------------------------------------------------------------
 * No BrandServiceTest exists anywhere under meta/tests/, there is no legacy controller test of any kind,
 * and meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52 is an empty component with zero test
 * methods (AAP 0.6.5.2). Every member below is net-new coverage and no parity with any legacy test is
 * implied. In particular this file claims NO traceability from meta/tests/unit/entity/BrandTest.cfc:
 * that legacy test covers the ENTITY, and its port is test/domain/Brand.test.ts. S6 manifests here as
 * testability-by-design — every member is a pure function of its arguments and the injected service, so
 * a plain object literal is a sufficient double, which matters because the legacy repository vendors no
 * mocking library at all (AAP 0.4.3.6).
 */

import type { Brand } from '../domain/product/Brand';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  RequestAuthorizationContext,
  RequestAuthorizationResolver,
} from '../ports/AccountContextPort';
import type { BrandService, ManagedBrand } from '../services/BrandService';

import {
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  notFoundResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  unauthorizedResponse,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from './httpResponse';

/**
 * The name of the path parameter carrying a brand's primary identifier.
 *
 * NOT an invented name and NOT a route. It is the legacy property name, declared at
 * model/entity/Brand.cfc:L52 as
 *
 *     property name="brandID" ormtype="string" length="32" fieldtype="id" generator="uuid"
 *              unsavedvalue="" default="";
 *
 * and it is the same spelling AAP 0.4.2.5 uses for the synthesized member's parameter,
 * `getBrand(brandID: string)`. The ROUTE TEMPLATE that binds this parameter is owned by
 * src/handlers/router.ts, which is why no path, method or route string appears in this file
 * (AAP 0.7.3 S9).
 */
const BRAND_ID_PATH_PARAMETER = 'brandID';

/**
 * The identifier value that means "this brand has never been persisted".
 *
 * G6 TRANSLATION DECISION (j). The empty string is not a placeholder chosen here: it is the legacy
 * `unsavedvalue=""` and `default=""` declared verbatim at model/entity/Brand.cfc:L52, carried into
 * ../domain/product/Brand as the initialiser of `brandID` and used there as the sentinel `isNew()`
 * tests. A brand row therefore never carries it, so an empty inbound identifier cannot address a
 * persisted record and is treated exactly as an absent one by {@link readBrandIdentifier}.
 *
 * The distinction matters because ./httpResponse deliberately preserves the difference between an
 * absent parameter and an empty one — "Absent stays absent" — precisely so that a member for which
 * an empty string is meaningful can see it. For this identifier the empty string IS meaningful, and
 * what it means is "unsaved", which is why the two cases converge here rather than in the reader.
 *
 * Declared as a named constant, and compared by equality rather than by measuring a length,
 * following the convention ./httpResponse sets: no numeric literal appears in this layer.
 */
const UNSAVED_BRAND_ID = '';

/**
 * The entity name every authorisation question from this handler is asked about.
 *
 * NOT an invented identifier. It is the legacy CFML component name — `model/entity/Brand.cfc` — and
 * it is exactly the string the legacy authorisation ladder produces: for an entity controller,
 * `authenticateActionByAccount` derives the entity name from the action's item name by substring
 * arithmetic, `right(itemName, len(itemName)-6)` for a `detail` item at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L56] and the corresponding forms at [:L54], [:L58],
 * [:L60], [:L66] and [:L75], and then hands it to `authenticateEntityCrudByAccount`.
 *
 * ⭐ IT IS A MODULE CONSTANT, NEVER A REQUEST VALUE, AND THAT IS THE POINT. `EntityAuthorizationPort`
 * declares `entityName` as `string` because the legacy declares it `required string` and enumerates
 * nothing, so the type is closed BY THE CALLER rather than by the port. This is that closure: one
 * handler asks about one entity, and no value from a request can ever reach that member. The same
 * discipline `../ports/SmartListQueryPort` applies to identifiers that reach a query.
 */
const BRAND_ENTITY_NAME = 'Brand';

/**
 * The slice of the proxy event a member needs in order to address one brand.
 *
 * A `Pick` rather than the whole event, following the convention ./httpResponse establishes for its
 * own readers: "Each reader takes only the slice of the event it actually needs. A full proxy event
 * satisfies every one of them, so a handler passes the event straight through, while a test
 * constructs a one-member literal." That is how AAP 0.7.3 S6 manifests in this folder, since
 * AAP 0.4.1.12 defines no test directory for it. A router may still hand these members a complete
 * event: a function declaring a narrower parameter accepts a wider argument, so every member below
 * remains assignable to a uniform `(event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>`
 * route entry.
 *
 * MODULE-PRIVATE, AND THAT IS A CONSEQUENCE OF JUDGMENT (k) RATHER THAN AN OVERSIGHT. This alias was
 * exported while `getBrand` and `deleteBrand` were bound operations, because it was their parameter
 * type and an external caller needed to name it. With those withdrawn from the route surface its only
 * remaining consumer is {@link readBrandIdentifier}, which is itself module-private, so exporting it
 * would publish a shape describing an operation this module no longer offers. {@link BrandSaveEvent}
 * stays exported because it is the parameter type of the one member that IS bound.
 */
export type BrandIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice of the proxy event the save member needs: the payload, plus the optional identifier that
 * decides whether the save is an update or a creation.
 */
export type BrandSaveEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/**
 * The slice of the proxy event the injected authorisation resolver is given.
 *
 * ⭐ WHY `headers`, AND WHY THIS FILE NEVER READS IT. A stateless invocation has no session and no
 * application scope (AAP 0.6.6 M8), so the principal the legacy read from `getHibachiScope()` must
 * arrive with the request and be resolved at the edge. This handler must therefore be able to hand
 * the resolver something, and — because a function parameter is contravariant — every member's own
 * event slice has to be assignable to whatever the resolver accepts. That is the only reason
 * `headers` appears on {@link BrandIdentifierEvent} and {@link BrandSaveEvent} at all.
 *
 * `headers` is the container chosen because it is the only one the platform typings declare ALWAYS
 * PRESENT — the two parameter containers are declared nullable — so no member is forced to narrow a
 * null before it can even ask the authorisation question, and a hand-written double stays a
 * one-member literal.
 *
 * ⛔ AND THIS FILE NEVER READS IT. It does not call `readHeader`, does not name a header, does not
 * name a scheme, does not parse a token and does not implement authentication. Doing any of those
 * would be inventing an authentication mechanism the source does not describe — the legacy mechanism
 * was a form post and a session, not an HTTP scheme — which AAP 0.7.3 S9 forbids. The resolver
 * decides how a principal is established; this handler decides only what happens when there is none.
 *
 * A deployment that carries its principal somewhere else — an authorizer context, for instance —
 * widens THIS single declaration, and the three members widen with it.
 */
export type BrandAuthorizationEvent = Pick<APIGatewayProxyEvent, 'headers'>;

/**
 * The access classification of every routed brand operation, and the evidence for each row.
 *
 * ⭐ WHY THIS EXISTS AT ALL. The legacy application authorised EVERY request in one place, before any
 * controller method ran: `setupRequest()` [org/Hibachi/Hibachi.cfc:L182-L203] opens with the comment
 * "Verify Authentication before anything happens" and refuses at [:L188]. No legacy controller
 * repeated that check because none needed to. That gate is framework code and does not cross the
 * boundary (AAP 0.8.3.2), so its CONTRACT had to be declared instead — see
 * `../ports/AccountContextPort`. Restoring the gate here is PARITY, not invented policy; the only
 * thing that changes is the failure mode, from a browser redirect to a status code.
 *
 * ⭐ THE VOCABULARY IS THE LEGACY'S, VERBATIM. `'secure'` is not a word chosen here: it names the
 * `this.secureMethods` declaration a legacy controller writes and the ladder reads at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L43-L49]. See
 * {@link HandlerAccessClassification} for all four and their locators.
 *
 * ⭐ WHY ALL THREE ROWS ARE `'secure'`, ESTABLISHED BY EVIDENCE RATHER THAN BY CAUTION. Brand's
 * legacy administrative surface lives on the admin entity controller, and
 * [admin/controllers/entity.cfc:L66] declares `this.publicMethods=''` — an EMPTY list. Not one
 * Brand operation is public. Contrast the only public action anywhere in this slice,
 * [integrationServices/google/controllers/feed.cfc:L54] `this.publicMethods="product"`. Nothing
 * appears in that controller's `anyLoginMethods` or `anyAdminMethods` either, so every Brand item
 * falls through to the entity-CRUD branch at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L52-L80], which is the permission-checked path.
 *
 * ⭐ THE CRUD TYPE PER ROW IS ALSO THE LEGACY'S, DERIVED FROM THE ITEM-NAME PREFIX BRANCH:
 *
 *   | routed member | legacy item prefix | legacy crudType                | locator          |
 *   | ------------- | ------------------ | ------------------------------ | ---------------- |
 *   | `getBrand`    | `detail`           | `read`                         | [:L55-L56]       |
 *   | `saveBrand`   | `save`             | `create`, THEN `update`         | [:L71-L77]       |
 *   | `deleteBrand` | `delete`           | `delete`                       | [:L57-L58]       |
 *
 * The `save` row is a pair rather than a single value, and the order is the legacy's: it asks for
 * `create` first and only asks for `update` if that fails. See {@link createBrandHandler}, which
 * reproduces that sequence exactly rather than choosing between the two by inspecting the request.
 *
 * ⛔ `newBrand` HAS NO ROW BECAUSE IT HAS NO ROUTE. See {@link BrandHandler}.
 *
 * The object is frozen, so the matrix is provably immutable at runtime as well as in the type
 * system — the same requirement AAP 0.6.6 M7 places on everything outside the connection pool.
 */
export const BRAND_ACCESS_MATRIX: Readonly<
  Record<keyof BrandHandler, HandlerAccessClassification>
> = Object.freeze({
  saveBrand: 'secure',
  getBrand: 'secure',
  deleteBrand: 'secure',
});

/**
 * The brand representation a route returns: an explicit, minimal projection of the domain object.
 *
 * ⭐ WHY A PROJECTION AND NOT THE ENTITY. `../domain/product/Brand`'s `Brand` is a rich internal
 * model, and serialising an instance of it publishes every enumerable field it happens to carry.
 * Reading that class's own declarations, an instance carries — beyond the six persistent properties
 * a caller legitimately wants — `remoteID` [model/entity/Brand.cfc:L75], the audit account
 * identifiers `createdByAccount` and `modifiedByAccount` [:L78, :L80], and EIGHT relationship
 * collections: `attributeValues` [:L60], `products` [:L61], and the six inverse many-to-many sides
 * at [:L66-L71] whose collaborators — promotion rewards, promotion qualifiers, vendors and physical
 * counts — are every one of them EXPLICITLY OUT OF SCOPE (AAP §0.2.2.1). Whole-object serialisation
 * would therefore publish out-of-scope internal structure that this deliverable does not even model,
 * plus the account identifiers `../domain/base/AuditableEntity` stamps and
 * `../adapters/mysql/rowMappers` hydrates.
 *
 * ⭐ A SECOND, INDEPENDENT REASON, AND IT IS A CORRECTNESS ONE. `products` holds live `Product`
 * instances and `Product` carries a `brand` back-reference that `Brand.addProduct` and
 * `Product.setBrand` maintain. Serialising a brand that has products is therefore a CYCLE, and
 * `JSON.stringify` throws on one — which this handler's own failure path would then answer with an
 * opaque server error. Projecting removes the cycle by construction rather than by defending against
 * it.
 *
 * WHAT IS INCLUDED, AND WHY EACH MEMBER EARNS ITS PLACE. Exactly the six persistent properties
 * AAP §0.4.1.4 names as this entity's port — "Six persistent properties and the products
 * relationship" — minus the relationship:
 *   - `brandID` [model/entity/Brand.cfc:L52], because a caller that has just created a brand needs
 *     the identifier it must use to address it afterwards. This is the addressed resource's OWN key,
 *     not a foreign key into an out-of-scope collaborator, and withholding it would make the create
 *     path unusable.
 *   - `brandName` [:L56], `brandWebsite` [:L57], `urlTitle` [:L55], `activeFlag` [:L53] and
 *     `publishedFlag` [:L54] — the brand's own descriptive state, and the same six columns the
 *     legacy admin's own brand views displayed.
 *
 * WHAT IS EXCLUDED, EXPLICITLY: `remoteID`, `createdDateTime`, `createdByAccount`,
 * `modifiedDateTime`, `modifiedByAccount`, and all eight relationship collections. The audit members
 * are excluded on the strength of `../domain/base/AuditableEntity`'s own note that response
 * minimisation must prevent their unintended publication; `remoteID` is an integration key for a
 * remote system, which is not this deliverable's to disclose.
 *
 * The five optional members are declared optional rather than as unions with `undefined` because
 * `exactOptionalPropertyTypes` is enabled, and because the underlying declarations really are
 * optional with no default — `../domain/product/Brand` records that `activeFlag` and `publishedFlag`
 * carry no `default` attribute, so "absent" is a genuinely different state from `false` and the
 * projection must not invent one. A member absent on the entity stays absent in the body rather than
 * appearing as a null.
 *
 * NOT AN INVENTED ENVELOPE. There is no wrapper object, no `data` member, no type discriminator, no
 * link section, no embedded resource and no pagination shell (AAP 0.7.3 S9). The body is the brand's
 * own fields and nothing else.
 */
export interface BrandResponse {
  readonly brandID: string;
  readonly brandName?: string;
  readonly brandWebsite?: string;
  readonly urlTitle?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
}

/**
 * The brand-service surface this handler consumes — the injection seam.
 *
 * FOUR MEMBERS, REPRODUCING ../services/BrandService's DECLARATIONS EXACTLY. Each signature was read
 * from that file rather than from prose, and TR-1 governs all four: "Preserve the public method name,
 * arity and argument order of every in-scope service member." AAP 0.8.3.1 states why it is written as
 * a declaration a compiler checks — "so interface parity is checkable method-by-method".
 *
 * ⚠️ THIS IS THE SERVICE SEAM, NOT THE ROUTE SURFACE, AND THE TWO COUNTS DIFFER ON PURPOSE. All four
 * members are declared here because IR-1 requires every runtime-synthesized member the slice actually
 * calls to become "an explicitly declared, typed method", and because the parity guard below can only
 * check what is declared. THREE of them — `saveBrand`, `getBrand` and `deleteBrand` — are bound to
 * the boundary by {@link BrandHandler}, each behind the classification {@link BRAND_ACCESS_MATRIX}
 * gives it. The fourth, `newBrand`, is bound to nothing: it is consumed only from INSIDE the save
 * closure, to resolve create-versus-update. `getBrand` is reached both ways — from a route of its own
 * and from that same internal resolution — which is why its presence here is not evidence either way
 * about routing. See judgment (b), judgment (k) and THREE ROUTED MEMBERS OVER A FOUR-MEMBER SERVICE
 * in the module header.
 *
 *   `saveBrand`   the ONE member declared in legacy source, at model/service/BrandService.cfc:L67 as
 *                 `public any function saveBrand(required any brand, required struct data)`. Both
 *                 parameters are required and positional, ENTITY FIRST and PAYLOAD SECOND, which the
 *                 dispatcher's own save branch independently confirms at
 *                 org/Hibachi/HibachiService.cfc:L556 by reading argument 1 as the entity and
 *                 argument 2 as the data.
 *   `newBrand`    synthesized, from the `new` branch at org/Hibachi/HibachiService.cfc:L264-L265
 *                 whose handler at :L544-L549 calls `new(entityName)` with NO entity arguments —
 *                 which is why the arity here is zero. SYNCHRONOUS, because the legacy branch only
 *                 instantiates in memory and ../services/BrandService deliberately declares it
 *                 without a promise.
 *   `getBrand`    synthesized, from the `get` branch at org/Hibachi/HibachiService.cfc:L258 whose
 *                 handler at :L305-L328 reads the identifier as positional argument 1 at :L325.
 *                 `null` means "no such row" and is not an exception.
 *   `deleteBrand` synthesized, from the `delete` branch at org/Hibachi/HibachiService.cfc:L270-L271
 *                 whose handler at :L286-L288 reads positional argument 1 by NUMERIC INDEX and hands
 *                 that value straight to `delete(entity)`. THE ENTITY IS THE ARGUMENT, NOT ITS
 *                 IDENTIFIER — settled by that read rather than inferred.
 *
 * ARGUMENTS ARE POSITIONAL EVERYWHERE, never named-argument bags or options objects.
 * org/Hibachi/HibachiService.cfc:L253 and :L303 both state "Ordered arguments only--named arguments
 * not supported", and the numeric-index reads prove it structurally.
 *
 * DECLARED AS A NARROW STRUCTURAL VIEW RATHER THAN AS THE CONCRETE CLASS, and the reason is
 * mechanical rather than stylistic: ../services/BrandService's `BrandService` carries private
 * members, and TypeScript does not admit an object literal as an instance of a class with private
 * state. Typing the parameter as the class would therefore make a hand-written double impossible and
 * force a test to build the real service, its repository and its base collaborator — exactly the
 * boot-the-application shape AAP 0.4.3.6 records the legacy suite had and that the ports exist to
 * retire. The interface keeps the double a plain object literal, and the guard immediately below
 * keeps it honest by failing the build if the real class ever stops satisfying it.
 *
 * TWO DELIBERATE CHOICES IN THE MEMBER TYPES, AND BOTH ARE LOAD-BEARING.
 *
 * EVERY BRAND HERE IS `ManagedBrand`, NOT THE BARE DOMAIN CLASS. `../services/BrandService` deals in
 * the shape `manageEntity` produces — the entity plus the seven framework introspection members and
 * the six error members declared in `../domain/base/populate` — because that is what a Hibachi entity
 * carried and what the base collaborator and the ported rule set read. This is a TR-1 tightening of
 * the `Brand` that AAP 0.4.2.3 and 0.4.2.5 name, recorded here and on the service rather than made
 * silently. It changes nothing this file emits: the members added by `manageEntity` are functions, so
 * `JSON.stringify` omits them and the serialized response body is byte-identical.
 *
 * ARROW-TYPED PROPERTIES RATHER THAN METHOD SYNTAX, WHICH IS THE WHOLE POINT OF THE TIGHTENING.
 * TypeScript compares METHOD parameters bivariantly, so had these stayed methods a service declaring
 * `saveBrand(brand: Brand, …)` would still have satisfied this interface and a brand with none of the
 * introspection surface could still have been handed to it — the very gap the managed shape closes
 * one layer down. Written as properties the parameters are checked contravariantly under
 * `strictFunctionTypes`, so that substitution is rejected. `readonly` additionally states that the
 * frozen object at the end of {@link createBrandHandler} is not reassigned through.
 */
export interface BrandHandlerService {
  readonly saveBrand: (brand: ManagedBrand, data: Record<string, unknown>) => Promise<ManagedBrand>;
  readonly newBrand: () => ManagedBrand;
  readonly getBrand: (brandID: string) => Promise<ManagedBrand | null>;
  readonly deleteBrand: (brand: ManagedBrand) => Promise<boolean>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and
 * fails the build otherwise. Type-only, so it contributes nothing to the bundle. The same helper
 * ../services/BrandService uses for its own two guards, spelled identically so the pattern is
 * recognisable across the subtree.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * THE PARITY GUARD — the real `BrandService` really does satisfy {@link BrandHandlerService}.
 *
 * Checked here so that any drift in a service member's name, arity, argument order or return type breaks
 * the build in this file rather than silently at the composition root. This is the mechanism behind
 * AAP 0.8.3.1's method-by-method interface parity: the compiler performs the check on every typecheck
 * run. The import is type-only and therefore erased, so proving the relationship costs the bundle
 * nothing and introduces no runtime coupling to the service module.
 */
type _BrandServiceSatisfiesBrandHandlerService = AssertAssignable<
  BrandService,
  BrandHandlerService
>;

/**
 * The routed brand operations, ready to be mounted by src/handlers/router.ts.
 *
 * EVERY MEMBER IS NAMED FOR THE SERVICE MEMBER IT EXPOSES — the naming is what makes the mapping from
 * AAP 0.4.2.3 and AAP 0.4.2.5 to this file checkable by inspection. THIS INTERFACE IS ALSO THE
 * DEFINITION OF "MOUNTED": {@link BRAND_ACCESS_MATRIX} is keyed on `keyof BrandHandler`, so every
 * routed member is required to carry a classification and no member can be added here without one.
 *
 * EXACTLY THREE MEMBERS, AND THE COUNT IS DERIVED RATHER THAN CHOSEN — but it is derived from two
 * AAP sections, not one, and reading either alone gives the wrong number. AAP 0.4.2.3 tabulates the
 * public surface of model/service/BrandService.cfc and it has ONE row, `saveBrand` at :L67, the only
 * `public … function` declaration in the 90-line component; that is the SERVICE contract AAP 0.8.2
 * Guideline 2 requires be preserved "exactly as-is", and ../services/BrandService preserves it.
 * AAP 0.4.2.5 then names three further members — `newBrand()`, `getBrand(id)` and
 * `deleteBrand(entity)` — as real call sites the slice depends on, each of which "must be declared
 * explicitly" because `onMissingMethod` fabricated it. The service therefore declares four; the
 * boundary mounts the three that a caller outside the application has a legacy action for, and
 * withholds the one that does not. Judgment (b) in the module header records that adjudication in
 * full, including why the narrower one-closure reading was withdrawn.
 *
 * ALL THREE RESOLVE A PROMISE. Each of their service members is asynchronous, and a router awaits
 * every route uniformly.
 *
 * ⛔ THREE MEMBERS, NOT FOUR: `newBrand` IS DELIBERATELY NOT ROUTED, AND ITS ABSENCE HERE IS THE
 * MECHANISM RATHER THAN A NOTE. The other three synthesized members each have an observable legacy
 * action behind them; `newBrand` has none, and the evidence is specific:
 *   - `admin/views/entity/` contains exactly `detailbrand.cfm` and `listbrand.cfm` for this entity.
 *     There is NO `createbrand.cfm` and NO `editbrand.cfm`, so no legacy admin action rendered a
 *     new-brand form.
 *   - `admin/controllers/entity.cfc` declares no Brand member at all, so nothing routed to one.
 *   - AAP §0.4.2.3 records that `BrandService` declares EXACTLY ONE public member, `saveBrand`;
 *     `newBrand` exists only because `onMissingMethod` fabricated it
 *     [org/Hibachi/HibachiService.cfc:L264-L265], for callers INSIDE the application.
 * It therefore stays what it always was — an internal factory — and it is reachable only where it is
 * genuinely needed: `saveBrand`'s creation path calls it through the injected service. Because
 * {@link createBrandHandler} returns a frozen object typed as this interface, `router.ts` cannot
 * mount it: there is no member to mount, and an attempt to add one fails to compile here first. That
 * is a stronger statement than an unrouted-by-convention comment, and it is exactly the discipline
 * `./optionHandler` already applies to its own four synthesized members.
 *
 * Per judgment (b) there is likewise no `countBrand`, no `listBrand`, no `exportBrand`, no
 * `processBrand` and no `getBrandSmartList`, because the slice calls none of them.
 */
export interface BrandHandler {
  readonly saveBrand: (event: BrandSaveEvent) => Promise<APIGatewayProxyResult>;
  readonly getBrand: (event: BrandIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteBrand: (event: BrandIdentifierEvent) => Promise<APIGatewayProxyResult>;
}

/**
 * Projects a brand onto the minimal representation a route returns.
 *
 * The whole of {@link BrandResponse}'s reasoning applies here; this function is its enforcement. It
 * is written as an explicit member-by-member construction rather than as a spread-and-delete or a
 * key filter, deliberately: a projection built by REMOVING members silently republishes anything a
 * future field adds to the entity, whereas one built by NAMING members cannot. A new persistent
 * property therefore stays out of every response until somebody decides otherwise here.
 *
 * Values are copied exactly as the entity holds them — never trimmed, re-cased, formatted, rounded,
 * localised or defaulted — following the pass-through rule `./httpResponse` sets for this layer. An
 * absent optional member is OMITTED rather than emitted as a null, which `exactOptionalPropertyTypes`
 * makes the compiler check: `../domain/product/Brand` records that `activeFlag` and `publishedFlag`
 * declare no legacy default, so "absent" and `false` are genuinely different states and collapsing
 * them would invent behaviour (AAP 0.7.3 S9).
 *
 * @param brand the domain instance, which is not mutated
 * @returns the minimal representation, with absent members omitted
 */
function toBrandResponse(brand: Brand): BrandResponse {
  const response: BrandResponse = {
    brandID: brand.brandID,
    ...(brand.brandName !== undefined ? { brandName: brand.brandName } : {}),
    ...(brand.brandWebsite !== undefined ? { brandWebsite: brand.brandWebsite } : {}),
    ...(brand.urlTitle !== undefined ? { urlTitle: brand.urlTitle } : {}),
    ...(brand.activeFlag !== undefined ? { activeFlag: brand.activeFlag } : {}),
    ...(brand.publishedFlag !== undefined ? { publishedFlag: brand.publishedFlag } : {}),
  };

  return response;
}

/**
 * Reads the addressed brand identifier, or reports that none was addressed.
 *
 * Two conditions converge on "none", and both are narrowed explicitly because the compiler's
 * unchecked-index checking makes the read possibly-absent and ./httpResponse's reader keeps it that
 * way:
 *   - the parameter is absent, because the route bound no such parameter; and
 *   - the parameter is present but empty, which per {@link UNSAVED_BRAND_ID} is the legacy
 *     unsaved-value sentinel from model/entity/Brand.cfc:L52 and can never identify a persisted row.
 *
 * No non-null assertion, no shape-forcing cast, no `any` and no compiler-directive comment is used to
 * get here, and none appears anywhere in this file: where the checker objected, the code changed
 * (AAP 0.7.3 S1). The value is returned exactly as received — never trimmed, case-folded, padded or
 * validated against a format — because ./httpResponse's pass-through rule holds for inputs as well as
 * for messages, and because a 32-character identifier check belongs to the persistence layer that
 * owns the column.
 *
 * @param event the proxy event, or any object carrying its path-parameters member
 * @returns the addressed identifier, or nothing when no brand was addressed
 */
function readBrandIdentifier(event: BrandIdentifierEvent): string | undefined {
  const brandID: string | undefined = readPathParameter(event, BRAND_ID_PATH_PARAMETER);

  if (brandID === undefined || brandID === UNSAVED_BRAND_ID) {
    return undefined;
  }

  return brandID;
}

/**
 * Binds the brand service to the AWS-facing operations it backs.
 *
 * THREE CLOSURES OVER FOUR DECLARED MEMBERS, AND THE ARITHMETIC IS THE DESIGN. The parameter type
 * {@link BrandHandlerService} declares all four service members — IR-1 requires every synthesized
 * member the slice calls to be declared, and the guard above needs them declared in order to check
 * them. `saveBrand`, `getBrand` and `deleteBrand` each get a closure, because each has an observable
 * legacy action behind it and each is classified by {@link BRAND_ACCESS_MATRIX}. `newBrand` gets
 * none: it is reached only from INSIDE the `saveBrand` closure, to resolve create-versus-update, and
 * {@link BrandHandler} records the admin-view and controller evidence for leaving it there. Judgment
 * (b) and THREE ROUTED MEMBERS OVER A FOUR-MEMBER SERVICE in the module header record why the count
 * is three rather than one, and judgment (k) records the gate every one of the three passes through
 * first.
 *
 * THE INJECTION SEAM, AND THE ONLY ONE. AAP 0.7.3 S3 requires "Constructor injection only. No
 * service locator, no dynamic method synthesis, no string-keyed runtime resolution." The service
 * arrives as a typed parameter and is captured by one closure; nothing is constructed here, no
 * collaborator is resolved by name, ../config/container is not imported, and no `Proxy`, `Reflect`,
 * index signature, decorator or dispatch map appears. R1 and R2 (AAP 0.4.3.1, 0.4.3.2) are what this
 * replaces: DI/1 0.4.2 populated `property name="dataService"` at
 * model/service/BrandService.cfc:L51 by NAME during a runtime bean scan, and `getService("name")`
 * resolved collaborators from a string. Neither survives anywhere in this file.
 *
 * The returned object is frozen, so its shape is provably immutable at runtime as well as in the type
 * system. Combined with the closures holding nothing but the injected reference, that is what lets
 * this module state without qualification that it holds no mutable state — which AAP 0.6.6 M7
 * requires of everything outside the connection pool, because a warm Lambda container is shared
 * across invocations and therefore potentially across tenants.
 *
 * EVERY MEMBER FUNNELS FAILURES THROUGH {@link errorResponse} AND NOTHING ELSE. That single mapping
 * recognises a validation failure and serialises its keyed error structure unchanged — which
 * AAP 0.4.1.11 requires so "validation failures remain comparable to legacy output" — recognises a
 * boundary stub, forwards a legacy thrown message VERBATIM including any legacy misspelling, and
 * discloses nothing whatsoever about any other thrown value. No error is caught and reshaped here, no
 * message is inspected, rewritten or matched against, and no status is chosen in this file.
 *
 * ⭐ THE AUTHORISATION RESOLVER IS A REQUIRED PARAMETER, AND THAT IS THE DEFAULT-DENY MECHANISM.
 * It is not optional, it has no default, and there is no unauthenticated construction path: a call
 * that omits it does not compile, so "a routed brand operation with no policy" is not a state a
 * caller can reach. That is deliberately stronger than a default-deny default value, which a caller
 * could still forget to consider, and it is the same discipline `../ports/AccountContextPort` already
 * applies to population authorisation.
 *
 * ⭐ IT IS A RESOLVER RATHER THAN A CONTEXT, FOR A REASON AAP 0.6.6 M7 MAKES NON-NEGOTIABLE.
 * `../config/container` is a memoised factory (AAP §0.4.1.3), so anything captured when this handler
 * is built survives across warm invocations of the same container — and M7 requires memoisation to
 * be request-scoped, never module-scope, "to avoid cross-tenant bleed on a warm container". A
 * principal captured at build time would be precisely such bleed: the second caller would be
 * authorised as the first. The resolver is therefore evaluated ONCE PER INVOCATION, against that
 * invocation's own event, and this module holds no principal of its own.
 *
 * @param brandService - The brand service. Typed as {@link BrandHandlerService} so a hand-written
 * double satisfies it; the guard above proves the real `BrandService` does too.
 * @param resolveAuthorization - Resolves this invocation's principal and its entity-authorisation
 * verdict. Required; see above.
 * @returns The three routed operations, frozen.
 *
 * @example
 * ```ts
 * // src/handlers/router.ts wires it once, from the composition root:
 * const brandHandler = createBrandHandler(brandService, resolveAuthorization);
 * const response = await brandHandler.getBrand(event);
 * ```
 */
export function createBrandHandler(
  brandService: BrandHandlerService,
  resolveAuthorization: RequestAuthorizationResolver<BrandAuthorizationEvent>,
): BrandHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one CRUD type.
   *
   * The ladder is reproduced in the legacy's own order, and each step cites the line it comes from:
   *
   *   1. NO PRINCIPAL AT ALL -> unauthorised. The legacy read the account off the framework scope
   *      [org/Hibachi/HibachiScope.cfc:L134-L135] and, with no logged-in session, fell through every
   *      classification test to the terminal `return false` at
   *      [org/Hibachi/HibachiAuthenticationService.cfc:L83].
   *   2. A PRINCIPAL THAT IS NOT LOGGED IN -> unauthorised. [:L30] gates every remaining test on
   *      `getHibachiScope().getLoggedInFlag()`, whose body is `if(!getSession().getAccount().isNew())`
   *      [org/Hibachi/HibachiScope.cfc:L40-L45]. THE LEGACY PREDICATE IS THE NEGATION OF "NEW", which
   *      is why the test below is on `newFlag` being true rather than false —
   *      `AccountReference.newFlag` carries `isNew()` itself, not the logged-in flag derived from it.
   *      Getting that inversion wrong would admit exactly the callers the legacy refused.
   *   3. NOT AUTHORISED FOR THE OPERATION -> forbidden. Every Brand item is `'secure'`
   *      ({@link BRAND_ACCESS_MATRIX}), so the verdict comes from the injected port, which resolves
   *      the super-user bypass at [:L88-L90] and the permission-group walk at [:L93-L98] behind the
   *      boundary and returns one boolean.
   *
   * Steps 1 and 2 both answer 401 and step 3 answers 403, and the distinction is about the PRINCIPAL
   * rather than about the resource: see {@link unauthorizedResponse} and {@link forbiddenResponse},
   * where the translation from the legacy login redirect is recorded.
   *
   * ⭐ IT RETURNS THE REFUSAL, NOT A BOOLEAN, AND CALLERS RETURN IT IMMEDIATELY. A boolean would let
   * a member forget to return and fall through into the operation it was supposed to guard; a
   * response value cannot be ignored without the compiler noticing that a branch produces nothing.
   *
   * ⭐ IT TAKES A NON-EMPTY SEQUENCE OF CRUD TYPES, NOT ONE, BECAUSE ONE LEGACY ITEM ASKS TWICE. The
   * `save` prefix branch at [org/Hibachi/HibachiAuthenticationService.cfc:L71-L77] grants when EITHER
   * `create` or `update` is granted, asking `create` first. Expressing that as a sequence keeps two
   * properties the legacy has and a caller-side pair of calls would lose: the context is resolved
   * EXACTLY ONCE per invocation, so both questions are asked of the same principal and a resolver is
   * never invoked twice for one request; and the order is fixed at the call site rather than emerging
   * from control flow. The tuple type requires at least one member, so an empty sequence — which
   * would silently refuse everything — does not compile.
   *
   * @param event the invocation's event, or any object carrying its headers member
   * @param crudTypes the operations that would each satisfy this request, in the legacy's own
   *   vocabulary and in the legacy's own order; the invocation is authorised if ANY is granted
   * @returns the refusal to return to the caller, or nothing when the invocation is authorised
   */
  const refuseUnauthorized = (
    event: BrandAuthorizationEvent,
    crudTypes: readonly [EntityCrudType, ...EntityCrudType[]],
  ): APIGatewayProxyResult | undefined => {
    const authorization: RequestAuthorizationContext = resolveAuthorization(event);
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2 of the ladder. `newFlag` is `isNew()`, so TRUE means "not logged in".
    if (account === undefined || account.newFlag) {
      return unauthorizedResponse();
    }

    // Step 3. The port answers; the permission model stays behind the boundary. Asked in the given
    // order, and the first grant wins — exactly as the legacy `createOK`-then-`updateOK` pair does.
    for (const crudType of crudTypes) {
      if (
        authorization.entityAuthorization.authenticateEntity({
          crudType,
          entityName: BRAND_ENTITY_NAME,
        })
      ) {
        return undefined;
      }
    }

    return forbiddenResponse();
  };
  /**
   * Saves a brand, creating it when no identifier was addressed and updating it otherwise.
   *
   * The AWS-facing face of `saveBrand` at model/service/BrandService.cfc:L67 — the component's one
   * declared public member. Everything inside its legacy body stays in the service (judgment (c)):
   * this member computes no URL title, reads no `brandName`, mutates no payload and names no table.
   *
   * G6 TRANSLATION DECISION (i) — THE REQUEST BODY IS REQUIRED BECAUSE THE LEGACY PARAMETER IS.
   * `required struct data` at :L67 is not optional and has no default, so a request that carries no
   * payload cannot satisfy the member's contract. The three ways a body can fail to be a JSON object
   * are distinguished by ./httpResponse and reported by it, so no payload is ever fabricated here: an
   * empty object is NOT substituted for an absent body, because that would hand the service a
   * payload the caller never sent and would silently turn a malformed request into a validation
   * failure attributed to the brand.
   *
   * G6 TRANSLATION DECISION (f) — AN UNBOUND IDENTIFIER MEANS CREATE, AND THE CHOICE IS EXPLICIT AT
   * THE BOUNDARY. The legacy dispatcher's read branch accepted a second argument,
   * `isReturnNewOnNotFound`, which org/Hibachi/HibachiService.cfc:L306 defaults to `false`;
   * ../services/BrandService deliberately did not fold that flag into `getBrand`, because a member
   * whose return type flips between "the row, or nothing" and "always an entity" cannot be typed
   * honestly. The decision therefore surfaces HERE, where the request either addresses an existing
   * brand or does not, and it is made from the addressed identifier alone:
   *   - no identifier addressed -> `newBrand()`, the unpersisted instance the service's own
   *     synthesized factory yields, which the service then populates from the payload;
   *   - an identifier addressed but matching no row -> a not-found response. It is NOT quietly
   *     upgraded into a creation, because that would let a caller's stale or mistyped identifier
   *     produce a second brand instead of an error.
   * Nothing else about the request participates in the choice: no verb is inspected, because HTTP
   * method matching belongs to src/handlers/router.ts, and no header or query parameter is consulted.
   *
   * G6 TRANSLATION DECISION (e) — THE UPDATE PATH NECESSARILY CALLS TWO SERVICE MEMBERS. The wire
   * carries an identifier; TR-1 fixes the first parameter of `saveBrand` as the ENTITY. Resolving
   * one into the other through the service's own `getBrand` is the only faithful bridge available.
   * The rejected alternative is worth naming: deserialising a brand out of the request body would
   * mean this layer populating a domain object, and population is owned by the base collaborator's
   * descriptor-driven step — a JSON object is a payload, not an entity.
   *
   * THE PAYLOAD IS PASSED THROUGH UNTOUCHED, AND THE ARGUMENT ORDER IS THE CONTRACT. `body.value`
   * reaches the service exactly as parsed: no key is added, removed, renamed, defaulted, coerced or
   * filtered, and in particular no `urlTitle` is precomputed. The service documents that it MUTATES
   * that object in place when it derives a URL title, faithfully reproducing the by-reference struct
   * write at :L70 and :L72; this member neither anticipates nor undoes that. The call is positional
   * with the brand FIRST and the payload SECOND, matching :L67 and the dispatcher's own read of
   * arguments 1 and 2 at org/Hibachi/HibachiService.cfc:L556.
   *
   * A validation failure — `brandName` required, `brandWebsite` a url, `urlTitle` required and
   * unique, per model/validation/Brand.json — is raised by the base collaborator as a keyed failure
   * and shaped by {@link errorResponse}, keys intact. Nothing is pre-checked here.
   *
   * NET-NEW coverage (AAP 0.6.5.2): no legacy BrandServiceTest and no legacy controller test exist.
   *
   * @param event the proxy event, or any object carrying its body and path-parameters members
   * @returns the saved brand, or the response describing why it could not be saved
   */
  const saveBrand = async (event: BrandSaveEvent): Promise<APIGatewayProxyResult> => {
    /*
     * THE GATE RUNS FIRST, BEFORE THE BODY IS EVEN PARSED. The legacy order is not negotiable:
     * `setupRequest()` refuses at [org/Hibachi/Hibachi.cfc:L188] before a controller method runs at
     * all, so nothing about the request is examined on an unauthorised invocation. Keeping that order
     * here also means an unauthorised caller learns nothing from the shape of its own payload — the
     * three body-problem responses ./httpResponse distinguishes are never reached.
     *
     * THE CREATE-THEN-UPDATE SEQUENCE IS THE LEGACY'S, REPRODUCED EXACTLY. The `save` prefix branch
     * at [org/Hibachi/HibachiAuthenticationService.cfc:L71-L77] asks for `create` first, returns true
     * if that is granted, and only then asks for `update`. Two details are load-bearing:
     *   - THE ORDER. `create` is asked first, always.
     *   - IT DOES NOT DEPEND ON WHETHER AN IDENTIFIER WAS ADDRESSED. The legacy action name carried
     *     no such information, so the legacy asked both questions regardless. Deriving the CRUD type
     *     from the presence of a path parameter would be tidier and would be a DIFFERENT policy:
     *     an account permitted only to create could no longer save an addressed brand it would
     *     previously have been allowed to, and vice versa. Judgment (f) still decides create-versus-
     *     update for the OPERATION below; it deliberately does not decide it for the AUTHORISATION.
     */
    const refusal = refuseUnauthorized(event, ['create', 'update']);

    if (refusal !== undefined) {
      return refusal;
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    const brandID: string | undefined = readBrandIdentifier(event);

    try {
      // Judgment (f): no identifier addressed is a creation; an addressed identifier is an update and
      // must resolve to a real row. `newBrand()` never yields null, so the single null test below
      // rejects exactly the missing-row case and nothing else.
      const brand: ManagedBrand | null =
        brandID === undefined ? brandService.newBrand() : await brandService.getBrand(brandID);

      if (brand === null) {
        return notFoundResponse();
      }

      // model/service/BrandService.cfc:L67 — brand first, payload second, positional, unaltered.
      // The saved entity is PROJECTED, never serialised whole; see {@link BrandResponse}.
      return okResponse(toBrandResponse(await brandService.saveBrand(brand, body.value)));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Reads one brand by its primary identifier.
   *
   * An IR-1 declaration (judgment (a)), from the `get` branch at
   * org/Hibachi/HibachiService.cfc:L258 whose handler at :L305-L328 reads the identifier as
   * positional argument 1 at :L325. AAP 0.4.2.5 declares the service target as `getBrand(brandID:
   * string): Promise<Brand | null>`, and the identifier is forwarded to it verbatim.
   *
   * `null` MEANS "NO SUCH ROW" AND IS NOT AN EXCEPTION. ../services/BrandService resolves `null`
   * rather than rejecting, and no throw-on-missing behaviour is invented anywhere along the path
   * (AAP 0.7.3 S9). The two ways this request can fail to identify a brand — no identifier addressed
   * at all, and an identifier that matches nothing — are answered identically and with the neutral
   * body ./httpResponse provides, which echoes back neither the identifier nor the route. That is a
   * deliberate non-disclosure: distinguishing the two would tell an unauthenticated caller whether a
   * given identifier exists.
   *
   * NET-NEW coverage (AAP 0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters member
   * @returns the addressed brand, or the response describing why it could not be returned
   */
  const getBrand = async (event: BrandIdentifierEvent): Promise<APIGatewayProxyResult> => {
    /*
     * THE GATE RUNS BEFORE THE IDENTIFIER IS EVEN READ, AND THAT ORDER IS THE ANTI-ENUMERATION
     * PROPERTY. It reproduces the legacy order — `setupRequest()` refuses at
     * [org/Hibachi/Hibachi.cfc:L188] before a controller method runs — and it has a specific
     * consequence worth stating: because the refusal is decided without consulting the identifier or
     * the repository, an unauthorised caller receives the SAME response for an identifier that
     * exists and one that does not. Gating after the lookup would have turned this member into an
     * existence oracle, which is exactly the non-disclosure the paragraph above is about.
     *
     * `read` is the legacy crudType for a `detail` item [org/Hibachi/HibachiAuthenticationService.cfc
     * :L55-L56], not `detail`; see {@link EntityCrudType} for why two prefixes collapse onto one.
     */
    const refusal = refuseUnauthorized(event, ['read']);

    if (refusal !== undefined) {
      return refusal;
    }

    const brandID: string | undefined = readBrandIdentifier(event);

    if (brandID === undefined) {
      return notFoundResponse();
    }

    try {
      const brand: ManagedBrand | null = await brandService.getBrand(brandID);

      // PROJECTED, never serialised whole; see {@link BrandResponse}.
      return brand === null ? notFoundResponse() : okResponse(toBrandResponse(brand));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Removes a brand, subject to the delete guards the validation layer owns.
   *
   * An IR-1 declaration (judgment (a)), from the `delete` branch at
   * org/Hibachi/HibachiService.cfc:L270-L271 whose handler at :L286-L288 reads positional argument 1
   * by NUMERIC INDEX and hands that value straight to `delete(entity)` — which for this service is
   * the LOCAL override at model/service/HibachiService.cfc:L68, not the framework base (IR-8,
   * judgment (d)). AAP 0.4.2.5 declares the service target as `deleteBrand(brand: Brand):
   * Promise<boolean>`.
   *
   * G6 TRANSLATION DECISION (e) — THE ENTITY IS RESOLVED BEFORE THE REMOVAL, BECAUSE THE ENTITY IS
   * THE ARGUMENT. That numeric-index read settles what the legacy member received, and
   * ../services/BrandService keeps the parameter as the entity rather than narrowing it to an
   * identifier: "Narrowing the parameter to a `brandID` string would look tidier, would change the
   * contract, and would be a silent change since both forms are strings at the boundary." The wire
   * carries only the identifier, so this member resolves it through the service's own `getBrand` and
   * passes the resulting entity positionally. A missing row is answered as not found and no removal
   * is attempted.
   *
   * G6 TRANSLATION DECISION (g) — THE BOOLEAN VERDICT IS FORWARDED AND NEVER BECOMES A STATUS OR A
   * RAISE. `public boolean function delete(required any entity)` at
   * model/service/HibachiService.cfc:L68 returns `true` when the entity was removed and `false` when
   * delete-context validation blocked it, and it never raises for that failure —
   * ../services/BaseService preserves exactly that asymmetry against `save`, deliberately, because
   * model/service/ProductService.cfc:L326-L333 depends on receiving `false` in order to restore state
   * it cleared before calling. This member therefore serialises the verdict as it received it:
   *   - it is not inverted, and it is not translated into a rejection status. The legacy system
   *     expressed the outcome in the RETURN VALUE with no status involvement at all, so mapping
   *     `false` onto a client-error status would invent a mapping the source does not state
   *     (AAP 0.7.3 S9) and would contradict the "never a raise" contract the service documents;
   *   - it is not wrapped in an invented envelope, because a bespoke body shape would be surface the
   *     source does not call for;
   *   - the blocking guards themselves are not reported through it, because the legacy `boolean`
   *     return did not report them either. model/validation/Brand.json caps `products` and
   *     `physicalCounts` at `maxCollection: 0` for the delete context, and those guards are evaluated
   *     by the validation layer before anything is removed — never pre-checked here.
   * A caller distinguishes "removed" from "blocked" by the verdict, exactly as the legacy caller did.
   *
   * NET-NEW coverage (AAP 0.6.5.2).
   *
   * @param event the proxy event, or any object carrying its path-parameters member
   * @returns the removal verdict, or the response describing why it could not be attempted
   */
  const deleteBrand = async (event: BrandIdentifierEvent): Promise<APIGatewayProxyResult> => {
    // The gate runs before the identifier is read, for the reason recorded on `getBrand`. `delete` is
    // the legacy crudType for a `delete` item [org/Hibachi/HibachiAuthenticationService.cfc:L57-L58].
    const refusal = refuseUnauthorized(event, ['delete']);

    if (refusal !== undefined) {
      return refusal;
    }

    const brandID: string | undefined = readBrandIdentifier(event);

    if (brandID === undefined) {
      return notFoundResponse();
    }

    try {
      // Judgment (e): the service contract takes the entity, so the identifier is resolved first.
      const brand: ManagedBrand | null = await brandService.getBrand(brandID);

      if (brand === null) {
        return notFoundResponse();
      }

      // Judgment (g): the verdict is serialised exactly as returned — not inverted, not restated as a
      // status, not wrapped.
      return okResponse(await brandService.deleteBrand(brand));
    } catch (error) {
      return errorResponse(error);
    }
  };

  return Object.freeze({ saveBrand, getBrand, deleteBrand });
}
