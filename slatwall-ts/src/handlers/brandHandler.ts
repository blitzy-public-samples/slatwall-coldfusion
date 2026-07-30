/**
 * brandHandler — the AWS boundary for the extracted Catalog brand surface.
 *
 * Authority: AAP 0.4.1.9 row 4 — "slatwall-ts/src/handlers/brandHandler.ts | CREATE |
 * model/service/BrandService.cfc | Exposes the brand surface." AAP 0.3.1 lists it in the target
 * tree as `brandHandler.ts <- BrandService public surface`. The member surface is fixed by
 * AAP 0.4.2.3 (the one declared member) and AAP 0.4.2.5 (the three synthesized members).
 *
 * WHAT THIS FILE IS
 * -----------------
 * AAP 0.3.2, quoting AWS's own reference layout: "the handler responsible only for translating
 * AWS-specific input into domain calls." That is the whole job. Each member below narrows the
 * proxy event, calls the brand service, and shapes the outcome through ./httpResponse. There is
 * no query, no combination enumeration, no validation rule, no field mapping and no SQL anywhere
 * in this file, because every one of those belongs to a layer beneath it.
 *
 * It is a THIN, INJECTABLE FUNCTION OF THE SERVICE: {@link createBrandHandler} takes the service
 * and returns the four bound operations. Nothing is constructed here, nothing is resolved by name,
 * and ../config/container is never imported — src/handlers/router.ts calls the composition root
 * and passes the service in. That is also what makes this file assertable with a hand-written
 * double, without a database, a network call or an AWS runtime (AAP 0.7.3 S6).
 *
 * FOUR MEMBERS, AND THE COUNT IS THE POINT
 * ----------------------------------------
 * model/service/BrandService.cfc is 90 lines and declares EXACTLY ONE public function. AAP 0.6.3.3
 * records the consequence — it has no dead injections and is "the cleanest of the four services".
 * A one-member service produces a small handler, and that is correct rather than incomplete.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP 0.8.2 Guideline 6)
 * ----------------------------------------------------------------
 * Guideline 6 requires every technology-specific judgment to be documented where it is made. The
 * four mandated groups are (a) to (d); (e) to (j) are the judgments this file makes on its own
 * account and are each restated at the member that makes them.
 *
 * (a) THREE OF THE FOUR MEMBERS HAD NO CFML DECLARATION AT ALL. `newBrand`, `getBrand` and
 *     `deleteBrand` appear in no source file anywhere in the legacy repository. They existed only
 *     because org/Hibachi/HibachiService.cfc:L255-L281 fabricated a service's entire implicit CRUD
 *     surface at call time by matching a lower-cased method-name prefix — `get` at :L258,
 *     `get*smartlist` at :L259, `new` at :L264, `list` at :L266, `save` at :L268, `delete` at :L270,
 *     `count` at :L272, `export` at :L274 and `process` at :L276 — and raised a bare string at :L280
 *     for anything else. IR-1 states that TypeScript under `strict` "has no equivalent facility", so
 *     each such call site becomes an explicitly declared, typed method; TR-3 puts the same rule
 *     generally: "Every runtime-synthesized method, every string-keyed service lookup and every
 *     metadata-driven behavior becomes an explicit, compile-checked declaration." All three are
 *     declared literally below, and the dispatcher is emulated by NOTHING — no Proxy, no Reflect,
 *     no index signature, no string-keyed dispatch map, no prefix helper and no decorator
 *     (AAP 0.7.3 S3). Re-creating `onMissingMethod` in a new idiom would defeat the exercise.
 *
 * (b) THE RESTRAINT IS AS BINDING AS THE DECLARATION. AAP 0.4.2.5 ends with "synthesis is not
 *     reproduced wholesale, only where used", so there is deliberately no `countBrand`, no
 *     `listBrand`, no `exportBrand`, no `processBrand` and no `getBrandSmartList` here — nor any
 *     compound `getBrandByXxx` form, which :L296-L298 shows the dispatcher would also have
 *     fabricated. The slice calls none of them. Adding one because the dispatcher COULD have
 *     produced it is precisely the enhancement AAP 0.8.2 Guideline 4 forbids.
 *
 * (c) THE URL-TITLE DERIVATION AND THE `SwBrand` TABLE NAME BELONG TO THE SERVICE, NOT HERE. The
 *     legacy body at model/service/BrandService.cfc:L67-L78 tests the entity's and the payload's
 *     URL title at :L68, prefers the payload's `brandName` at :L69-L70, falls back to the entity's
 *     at :L71-L72, and in both arms calls `createUniqueURLTitle(titleString=…, tableName="SwBrand")`.
 *     AAP 0.4.1.8 assigns all of that to the service, which "assigns a unique URL title against
 *     table SwBrand, then delegates to the injected BaseService.save". This handler therefore does
 *     NOT compute a URL title, does NOT inspect `brandName`, does NOT mutate the payload, and does
 *     NOT name `SwBrand` or any other table anywhere — AAP 0.7.3 S2 inverts into a prohibition at
 *     this layer, where data access has no business being named at all.
 *
 * (d) `super.save()` RESOLVED TO SLATWALL CODE, AND IS NOW COMPOSITION RATHER THAN INHERITANCE.
 *     IR-8 names this exact line as its worked example: the `super.save()` at
 *     model/service/BrandService.cfc:L76 resolves to the LOCAL override at
 *     model/service/HibachiService.cfc:L86 — not to the framework base — because :L49 of the
 *     service says `extends="HibachiService"` with no package prefix, and the local base's own :L49
 *     is what declares `extends="Slatwall.org.Hibachi.HibachiService"`. The distinction is
 *     load-bearing: the local override adds the activeFlag and settings post-processing block at
 *     :L91-L101 that the framework base does not have, and the local `delete()` at :L68 likewise
 *     adds cleanup the framework base lacks. R3 (AAP 0.4.3.3) replaces that template-method reuse
 *     with an injected BaseService collaborator. All of that wiring lives in src/services/ and
 *     src/config/container.ts; this file neither reproduces nor references it, and imports neither.
 *
 * (e) TWO MEMBERS MUST RESOLVE AN IDENTIFIER INTO AN ENTITY BEFORE THEY CAN CALL THE SERVICE.
 *     Recorded at {@link createBrandHandler}'s `deleteBrand` and `saveBrand`.
 * (f) AN UNBOUND IDENTIFIER MEANS CREATE. Recorded at `saveBrand`.
 * (g) THE DELETE VERDICT IS FORWARDED AS A BOOLEAN AND NEVER BECOMES A STATUS. Recorded at
 *     `deleteBrand`.
 * (h) THE PROMISE ON `newBrand` IS BOUNDARY UNIFORMITY, NOT DEFERRED WORK. Recorded at `newBrand`.
 * (i) THE REQUEST BODY IS REQUIRED BECAUSE THE LEGACY PARAMETER IS. Recorded at `saveBrand`.
 * (j) AN EMPTY IDENTIFIER IS THE LEGACY UNSAVED-VALUE SENTINEL. Recorded at
 *     {@link UNSAVED_BRAND_ID}.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4 — hexagonal separation)
 * -----------------------------------------------------------
 * src/handlers/ is the outermost layer and the ONLY folder in src/** permitted to name a
 * cloud-provider type. AAP 0.5.5, verbatim: "The hexagonal boundary confines all AWS coupling to
 * src/handlers/**, so migrating to a newer runtime is a change to those four artifacts plus a
 * @types/node bump — with no change to src/domain/**, src/services/**, src/ports/** or
 * src/adapters/**." Even inside the folder the coupling is centralised: the two AWS types used
 * below are imported FROM ./httpResponse, which re-exports them type-only, so this file adds no
 * second declaration site for them. None of the four version-coupled artifacts AAP 0.5.5 enumerates
 * lives here, and no infrastructure definition or runtime identifier string appears (AAP 0.2.2.5).
 *
 * Imports are exactly three modules — ./httpResponse, ../domain/product/Brand and
 * ../services/BrandService — all relative and extensionless, because tsconfig.json declares no
 * `paths` or `baseUrl`. AAP 0.4.3.5 requires that so "tsc and esbuild resolve identically and no
 * runtime resolver shim is needed"; an alias that type-checks can still throw MODULE_NOT_FOUND on a
 * Lambda cold start.
 *
 * WHAT IS DELIBERATELY ABSENT, ALL OF IT ON PURPOSE
 * ------------------------------------------------
 *   - Any import from ../adapters/**, ../validation/**, ../config/database, ../config/env or
 *     ../ports/**, and no mysql2, no SQL fragment, no bound-parameter array, no table or column
 *     identifier (AAP 0.7.3 S2, S4).
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
 *   - Any module-scope mutable state, cache or memo. AAP 0.6.6 M7 permits module-scope state only
 *     in src/config/database.ts and requires any memoisation elsewhere to be request-scoped "to
 *     avoid cross-tenant bleed on a warm container". This file memoises nothing at all: the only
 *     module-scope declarations are two immutable string constants, four types and one function.
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
 *
 * TEST PROVENANCE (AAP 0.6.5, AAP 0.7.3 S6) — EVERYTHING HERE IS NET-NEW
 * ---------------------------------------------------------------------
 * AAP 0.6.5.2 is decisive: no BrandServiceTest exists anywhere under meta/tests/, there is no
 * legacy controller test of any kind, and meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52
 * is an empty component with zero test methods. EVERY MEMBER BELOW IS NET-NEW COVERAGE AND NO
 * PARITY WITH ANY LEGACY TEST IS IMPLIED. In particular this file claims NO traceability from
 * meta/tests/unit/entity/BrandTest.cfc: that legacy test covers the ENTITY and its port is
 * test/domain/Brand.test.ts. AAP 0.4.1.12 defines no test directory for this folder, so S6
 * manifests here as testability-by-design — every member is a pure function of its arguments and
 * the injected service, so a plain object literal is a sufficient double. The legacy repository
 * vendors no mocking library at all (AAP 0.4.3.6), which is exactly why the seam is a typed
 * interface rather than a class.
 */

import type { Brand } from '../domain/product/Brand';
import type { BrandService } from '../services/BrandService';

import {
  errorResponse,
  invalidRequestBodyResponse,
  notFoundResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
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
 */
export type BrandIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters'>;

/**
 * The slice of the proxy event the save member needs: the payload, plus the optional identifier that
 * decides whether the save is an update or a creation.
 */
export type BrandSaveEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters'>;

/**
 * The brand-service surface this handler consumes — the injection seam.
 *
 * FOUR MEMBERS, REPRODUCING ../services/BrandService's DECLARATIONS EXACTLY. Each signature was read
 * from that file rather than from prose, and TR-1 governs all four: "Preserve the public method name,
 * arity and argument order of every in-scope service member." AAP 0.8.3.1 states why it is written as
 * a declaration a compiler checks — "so interface parity is checkable method-by-method":
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
 */
export interface BrandHandlerService {
  saveBrand(brand: Brand, data: Record<string, unknown>): Promise<Brand>;
  newBrand(): Brand;
  getBrand(brandID: string): Promise<Brand | null>;
  deleteBrand(brand: Brand): Promise<boolean>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and
 * fails the build otherwise. Type-only, so it contributes nothing to the bundle. The same helper
 * ../services/BrandService uses for its own two guards, spelled identically so the pattern is
 * recognisable across the subtree.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * THE PARITY GUARD. The real `BrandService` really does satisfy {@link BrandHandlerService}, checked
 * here so that any drift in a service member's name, arity, argument order or return type breaks the
 * build in this file rather than silently at the composition root — or worse, only in a test double
 * that was updated while production wiring was not.
 *
 * This is the whole mechanism behind AAP 0.8.3.1's "interface parity is checkable method-by-method":
 * the check is performed by the compiler on every `npm run typecheck`, not by a reviewer reading two
 * files side by side. The import is type-only and therefore erased, so proving the relationship costs
 * the bundle nothing and introduces no runtime coupling to the service module.
 */
type _BrandServiceSatisfiesBrandHandlerService = AssertAssignable<
  BrandService,
  BrandHandlerService
>;

/**
 * The four bound brand operations, ready to be mounted by src/handlers/router.ts.
 *
 * EXACTLY FOUR MEMBERS, NAMED FOR THE SERVICE MEMBERS THEY EXPOSE — the naming is what makes the
 * mapping from AAP 0.4.2.3 and AAP 0.4.2.5 to this file checkable by inspection. Per judgment (b)
 * there is no `countBrand`, no `listBrand`, no `exportBrand`, no `processBrand` and no
 * `getBrandSmartList`, because the slice calls none of them.
 *
 * Members are declared as `readonly` function-valued properties rather than as methods, and that is
 * deliberate: {@link createBrandHandler} implements them as closures over the injected service, so
 * none of them depends on a `this` binding. A router may therefore pass any of them around as a bare
 * reference — the ordinary way a route table is built — with no risk of an unbound receiver.
 *
 * ALL FOUR RESOLVE A PROMISE, including the one whose service member is synchronous. See judgment
 * (h) at `newBrand` in {@link createBrandHandler} for why the boundary is uniform where the domain is
 * not.
 */
export interface BrandHandler {
  readonly saveBrand: (event: BrandSaveEvent) => Promise<APIGatewayProxyResult>;
  readonly newBrand: () => Promise<APIGatewayProxyResult>;
  readonly getBrand: (event: BrandIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteBrand: (event: BrandIdentifierEvent) => Promise<APIGatewayProxyResult>;
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
 * Binds the brand service to the four AWS-facing operations it backs.
 *
 * THE INJECTION SEAM, AND THE ONLY ONE. AAP 0.7.3 S3 requires "Constructor injection only. No
 * service locator, no dynamic method synthesis, no string-keyed runtime resolution." The service
 * arrives as a typed parameter and is captured by four closures; nothing is constructed here, no
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
 * @param brandService - The brand service. Typed as {@link BrandHandlerService} so a hand-written
 * double satisfies it; the guard above proves the real `BrandService` does too.
 * @returns The four bound operations, frozen.
 *
 * @example
 * ```ts
 * // src/handlers/router.ts wires it once, from the composition root:
 * const brandHandler = createBrandHandler(brandService);
 * const response = await brandHandler.getBrand(event);
 * ```
 */
export function createBrandHandler(brandService: BrandHandlerService): BrandHandler {
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
    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    const brandID: string | undefined = readBrandIdentifier(event);

    try {
      // Judgment (f): no identifier addressed is a creation; an addressed identifier is an update and
      // must resolve to a real row. `newBrand()` never yields null, so the single null test below
      // rejects exactly the missing-row case and nothing else.
      const brand: Brand | null =
        brandID === undefined ? brandService.newBrand() : await brandService.getBrand(brandID);

      if (brand === null) {
        return notFoundResponse();
      }

      // model/service/BrandService.cfc:L67 — brand first, payload second, positional, unaltered.
      return okResponse(await brandService.saveBrand(brand, body.value));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Returns a newly instantiated, unpersisted brand.
   *
   * An IR-1 declaration (judgment (a)): this member exists in no legacy source file, only as the
   * `new` branch of the dispatcher at org/Hibachi/HibachiService.cfc:L264-L265, whose handler at
   * :L544-L549 calls `new(entityName)`. AAP 0.4.2.5 declares the service target as `newBrand():
   * Brand` and this member is its boundary face.
   *
   * NO EVENT PARAMETER, because the legacy branch consumes none. The handler's arity mirrors the
   * service member's arity of zero rather than accepting an event it would never read, and a
   * zero-parameter function stays assignable to a uniform route entry that supplies one. Nothing
   * about the request can influence the result, which is precisely why nothing about the request is
   * read: population is the save path's job.
   *
   * G6 TRANSLATION DECISION (h) — THE PROMISE IS BOUNDARY UNIFORMITY, NOT DEFERRED WORK.
   * ../services/BrandService keeps its `newBrand` SYNCHRONOUS on purpose, recording that the legacy
   * branch performs in-memory instantiation only and that "a promise-returning signature would
   * compile and would then oblige every caller, production and double alike, to await something that
   * never yields." That reasoning governs the domain, where a caller has a choice. It does not govern
   * this layer: the platform's own handler contract is promise-based and a router awaits every route
   * uniformly, so resolving a promise here costs no caller anything and keeps all four members
   * mountable through one route-entry type. The synchronous call is therefore made directly and its
   * already-computed result is resolved — this member is deliberately NOT declared `async`, because
   * there is nothing to await and marking it so would assert otherwise.
   *
   * The failure path is kept for a real reason rather than for symmetry: the service delegates to the
   * repository's factory, so a wiring or hydration fault surfaces as a thrown value, and it is shaped
   * by the same single mapping every other member uses.
   *
   * NET-NEW coverage (AAP 0.6.5.2). No traceability is claimed from
   * meta/tests/unit/entity/BrandTest.cfc even though :L55 builds its subject through this service
   * member — that assertion is about the ENTITY's defaults and its port is test/domain/Brand.test.ts.
   *
   * @returns the new brand, or the response describing why one could not be produced
   */
  const newBrand = (): Promise<APIGatewayProxyResult> => {
    try {
      return Promise.resolve(okResponse(brandService.newBrand()));
    } catch (error) {
      return Promise.resolve(errorResponse(error));
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
    const brandID: string | undefined = readBrandIdentifier(event);

    if (brandID === undefined) {
      return notFoundResponse();
    }

    try {
      const brand: Brand | null = await brandService.getBrand(brandID);

      return brand === null ? notFoundResponse() : okResponse(brand);
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
    const brandID: string | undefined = readBrandIdentifier(event);

    if (brandID === undefined) {
      return notFoundResponse();
    }

    try {
      // Judgment (e): the service contract takes the entity, so the identifier is resolved first.
      const brand: Brand | null = await brandService.getBrand(brandID);

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

  return Object.freeze({ saveBrand, newBrand, getBrand, deleteBrand });
}
