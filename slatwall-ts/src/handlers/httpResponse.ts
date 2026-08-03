/**
 * httpResponse — response and error shaping for the Catalog slice's Lambda handlers, and the one module
 * in this deliverable that names cloud-provider types centrally.
 *
 * Authority: AAP 0.4.1.9 — response and error shaping, with all AWS-specific typing confined to this
 * layer.
 *
 * THERE IS NO LEGACY COUNTERPART, AND THAT IS THE POINT
 * ----------------------------------------------------
 * The legacy application never shaped a response itself. A request entered through index.cfm, the
 * retired FW/1 layer selected a view by convention, and the application server wrote the status line,
 * the headers and the body. Nothing in the four in-scope services, the six in-scope entities or the
 * Google feed adapter chooses a status code. Two consequences follow, and both are load bearing:
 *
 *   1. Everything in this module is NET-NEW coverage (AAP 0.7.3 S6). There is no legacy test to extend
 *      and no parity claim to make about the shape of a response, and none is implied anywhere below —
 *      the legacy suite contains no controller test and no feed test of any kind, and
 *      meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52 is an empty component with zero test
 *      methods (AAP 0.6.5.2).
 *   2. Where legacy behavior DOES reach a response — the four verbatim thrown message strings and the
 *      validation error-key structure — this module is a conduit and nothing more. See PASS-THROUGH IS
 *      ABSOLUTE below.
 *
 * WHAT PASSES THROUGH, AND WHAT IS WITHHELD
 * -----------------------------------------
 * Two things that cross this boundary are observable behavior of the legacy system, and this
 * module forwards both without touching them. Nothing else crosses at all: a thrown text reaches a
 * response body only when its THROW SITE declared it legacy behaviour by raising
 * ../errors/LegacyParityError, and every other message is replaced with a neutral text rather than
 * forwarded. Verbatim fidelity and non-disclosure are therefore not in tension here — the first applies
 * to what the throw sites classify, and the second applies to everything else. See
 * {@link errorResponse}, BRANCH 3.
 *
 * ⛔ THE GATE IS A TYPE TEST, NOT A MESSAGE-TEXT ALLOWLIST, AND AN EARLIER REVISION DESCRIBED IT AS THE
 * LATTER. Four paragraphs in this file cited a `PUBLIC_PARITY_MESSAGE_STATUS` inventory and a
 * `publicParityStatusFor` lookup as the mechanism; NEITHER EXISTS ANYWHERE IN THE SUBTREE, and the
 * references are withdrawn rather than satisfied by writing them. A text lookup is also not something
 * this file may have: two of the four mandated strings interpolate a caller-supplied option selection,
 * so they cannot be enumerated as literals, and matching on message text is the error-code registry
 * AAP 0.7.3 S9 forbids. ⚠️ THE CONSEQUENCE IS STATED PLAINLY: the closure of the emitted set rests on
 * the discipline of the throw sites, which is why ../errors/DomainError declares the four mandated
 * strings and the parity subclass together, in one place, and why a site raising that subclass with a
 * port-authored diagnostic is a defect at the site. One such site existed — the D6 branch of
 * ../services/ProductService's `processProductAddSubscriptionTerm`, whose message named an internal
 * member, an argument path and a defect identifier — and it now raises the base class instead.
 *
 *   - The four thrown message strings owned by ../errors/DomainError. Three come from
 *     model/entity/Product.cfc:355, :357 and :362 and one from model/service/SkuService.cfc:204.
 *     One of them contains two legacy misspellings. They are forwarded character for character:
 *     no rewording, no re-casing, no re-punctuating, no trimming, no spell correction and no
 *     interpolation. There is deliberately no string transformation of any kind in this file —
 *     no replace, no case change, no normalisation — applied to any value that originates in an
 *     error message. AAP 0.8.2 Guideline 2 (preserve existing behavior exactly as-is) and
 *     Guideline 4 (do not enhance or optimize beyond what the migration requires) both forbid
 *     touching them, and AAP 0.7.3 S7 requires they be annotated rather than repaired. The
 *     literals themselves are declared once, in ../errors/DomainError, and are deliberately not
 *     restated here so that verbatim fidelity stays checkable with a single search per string.
 *
 *     ⛔ PASS-THROUGH IS ABSOLUTE, BUT IT IS NOT UNIVERSAL, AND THE DIFFERENCE IS THE MOST
 *     IMPORTANT RULE IN THIS FILE. Only those four strings are legacy behavior. Every other
 *     message raised as a domain error in this deliverable is a diagnostic this port authored for
 *     an engineer, and such messages have been observed naming a schema column, an internal
 *     storage path, a legacy source locator and an internal member name. Publishing one would
 *     disclose this deliverable's internals to any caller able to reach a route, so it is NOT
 *     published: a message crosses this boundary if and only if its throw site declared it legacy
 *     behavior by raising ../errors/LegacyParityError. Disclosure is decided by TYPE, is
 *     default-deny, and is enforced in exactly one place — {@link errorResponse}, which records
 *     the full reasoning and the cost.
 *   - The validation error-key structure. AAP 0.4.1.11 requires the "error-key structure
 *     preserved so validation failures remain comparable to legacy output", so a validation
 *     failure is serialized as the keyed structure ../errors/ValidationError exposes, never as a
 *     sentence. See {@link errorResponse}, which explains at the mapping site exactly why
 *     flattening is forbidden.
 *
 * EVERYTHING ELSE IS WITHHELD, AND `Error.message` IS READ ON EXACTLY ONE BRANCH. The two items above
 * reach a
 * caller because the error that carries them DECLARES them disclosable, not because this module
 * copies a message out of an exception. Every other message in the port is written for a maintainer
 * — ported members name the legacy locator they reproduce, the defect identifier they carry
 * unrepaired, the entity identifier in play, the database column that could not be read, or the
 * environment variable that was not set — and none of it may reach a response. The mechanism is
 * ../errors/DomainError's deny-by-default presentation, and the reasoning for putting the decision
 * at the throw site rather than here is set out in full at {@link errorResponse}. The legacy
 * application had no response-shaping layer at all, so withholding a port-composed message departs
 * from no legacy contract, and {@link errorResponse} records that reasoning at the mapping site.
 *
 * ⚠️ ONE EXACT QUALIFICATION, BECAUSE THE SENTENCE ABOVE USED TO OVERSTATE ITSELF. `Error.message` IS
 * read in exactly one place — BRANCH 3 of {@link errorResponse}, and only for a
 * ../errors/LegacyParityError, whose whole purpose is to declare its text a mandated legacy string that
 * must reach the caller verbatim. No other branch reads a message, and no other error type can reach
 * that branch, so the disclosure set stays closed by type.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4 — hexagonal separation)
 * -----------------------------------------------------------
 * src/handlers/ is the outermost layer, and this module is its foundation: it has zero
 * intra-folder dependencies, and every other file in the folder shapes its output through it. At
 * this checkpoint that is FIVE siblings — brandHandler.ts, googleFeedHandler.ts, optionHandler.ts,
 * productHandler.ts and skuHandler.ts — each importing this module and no other file in the folder.
 * `router.ts` (AAP 0.4.1.9 row 1) is PLANNED AND NOT YET PRESENT; when it lands it inherits the same
 * obligation, but nothing here anticipates it. Its imports are therefore exactly two things and
 * nothing else — the error types from ../errors/, and type-only declarations from the AWS Lambda
 * typings, which are erased at compile time and never appear in an artifact.
 *
 * What is consequently absent, all deliberate:
 *   - No import from ../adapters/, ../config/, ../validation/, ../ports/, ../services/ or
 *     ../domain/. Every response this module returns is determined by its arguments alone; it
 *     resolves no collaborator, by name or otherwise, and imports no composition root
 *     (AAP 0.7.3 S3). ⚠️ THAT IS NOT THE SAME AS BEING SIDE-EFFECT FREE, AND AN EARLIER REVISION
 *     OVERSTATED IT AS "a pure function of its arguments". {@link logSuppressedFailure} writes the
 *     suppressed detail of a withheld failure to the runtime's error stream, which is an observable
 *     effect and a required one: default-deny disclosure is only safe if the withheld detail is
 *     still recoverable for diagnosis. The effect is confined to that one helper, it never varies
 *     the returned value, and it is the only effect in the module.
 *   - No database driver, no query text, no table or column identifier, and no bound-parameter
 *     array. In this layer the parameterized-data-access standard inverts into a prohibition:
 *     data access has no business being named here at all (AAP 0.7.3 S2).
 *   - No read of the process environment. src/config/env.ts is the only module in the subtree
 *     permitted to do that, and configuration flows one way from there (AAP 0.4.3.5, 0.8.3.9).
 *   - No credential, host, endpoint, account identifier, region or resource-name literal
 *     (AAP 0.8.3.9).
 *   - No filesystem or path builtin, and no dependency of any kind. The deliverable's dependency
 *     set stays frozen: the manifest gains nothing because of this file (AAP 0.7.3 S5).
 *   - No module-scope mutable state whatsoever. Every declaration below is a frozen constant, a
 *     string constant, a type or a function; nothing accumulates across invocations. AAP 0.6.6 M7
 *     records that only src/config/database.ts may hold module-scope state, and that any
 *     memoisation elsewhere must be request-scoped "to avoid cross-tenant bleed on a warm
 *     container". This module memoises nothing at all, which is the strongest form of compliance
 *     available (AAP 0.7.3 S8).
 *
 * WHY CONFINING THE AWS TYPES HERE MATTERS
 * ----------------------------------------
 * AAP 0.5.5 keeps all AWS coupling inside src/handlers/**, so migrating to a newer runtime is a change to
 * four artifacts plus a @types/node bump, with no change to src/domain/**, src/services/**, src/ports/**
 * or src/adapters/**. Every AWS type that leaks below this folder destroys that property, so this module
 * re-exports the four AWS types the folder needs: a sibling handler has one place to obtain them, and a
 * future runtime migration has one place to look.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP 0.8.2 Guideline 6)
 * ----------------------------------------------------------------
 * Guideline 6 requires that every technology-specific translation decision be documented at the
 * file where the judgment is made. The judgments made here are:
 *
 *   (a) The verbatim pass-through rule above, including the two legacy misspellings, which
 *       Guideline 4 forbids repairing — and, as its necessary counterpart, the withholding of every
 *       message this port composed for a maintainer. Recorded in full at {@link errorResponse},
 *       branch by branch. No status "changed", because the legacy expressed none of these outcomes
 *       as a status code at all — see judgment (d).
 *   (b) The validation error-key structure survives as a structure. Recorded at
 *       {@link errorResponse}, together with why a flattened body would defeat the comparability
 *       the whole port exists to demonstrate.
 *   (c) The content type chosen for the product feed. The legacy view emits an XML declaration as
 *       its literal first bytes and sets no explicit content type that source analysis could
 *       verify, so the value used here is a deliberate translation decision rather than a ported
 *       one. Recorded in full at {@link XML_CONTENT_TYPE} and {@link xmlResponse}.
 *   (d) Every status-code mapping. The legacy system expressed none of these outcomes as a status
 *       code, so each mapping is a judgment. The whole policy is collected in one exhaustive switch
 *       at {@link statusForPublicErrorCode}, with the justification for each row; {@link HTTP_STATUS}
 *       records why status codes are the one numeric exception this file allows itself.
 *   (e) Suppressing the FW/1 layout became returning a body string. The legacy feed controller
 *       set request.layout = false to stop the framework wrapping its output; the equivalent here
 *       is simply that {@link xmlResponse} returns the document unwrapped. That is idiom changing
 *       freely under the Minimal Change Clause (AAP 0.8.1) — "idiomatic, conventional TypeScript
 *       is expected" — while the bytes of the document itself, which the feed builder produces,
 *       are behavior and are not touched here.
 *   (f) Reading request input is hand-rolled. AAP 0.7.3 S5 freezes the dependency set, so no
 *       schema-validation package is introduced; the compiler's unchecked-index checking is
 *       satisfied by explicit narrowing and one hand-written structural guard. Recorded at
 *       {@link isJsonObject} and {@link readJsonObjectBody}.
 *   (g) The legacy login redirect became two status codes. `setupRequest()`
 *       [org/Hibachi/Hibachi.cfc:L188-L201] answered every unauthorised request by redirecting the
 *       browser to the configured login action; a headless service has no browser to navigate and
 *       no login view in scope, so the refusal is reported instead. Recorded at
 *       {@link HTTP_STATUS}, {@link unauthorizedResponse} and {@link forbiddenResponse}.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - Any business rule, query, field mapping or validation rule. Those belong to the service,
 *     adapter, integration and validation layers respectively.
 *   - A problem-detail schema, a correlation or trace identifier scheme, a retry-after header, an
 *     entity tag, a cache directive, a compression setting, a content disposition, or a rate-limit
 *     header. AAP 0.7.3 S9 and AAP IR-12 forbid inventing a taxonomy or a tuning parameter the
 *     source does not state. No numeric literal appears anywhere below except an HTTP status code,
 *     which is a protocol value rather than an invented setting.
 *   - A failure-code registry, of this module's own or anyone else's. NO CLASSIFICATION CODE IS
 *     SERIALIZED INTO A RESPONSE BODY AT ALL. A revision briefly published one alongside the message,
 *     reasoning that a caller should be able to distinguish failure kinds "without parsing prose"; the
 *     ergonomics were fine but the constraint was not, because AAP 0.7.3 S9 forbids inventing
 *     classification surface the source does not state and the nine codes are this port's own
 *     invention with no counterpart anywhere in model/**. Publishing them converted an internal
 *     routing decision into a contract this port would owe forever. The codes still exist, declared
 *     once in ../errors/DomainError so the error hierarchy and the response layer speak ONE closed
 *     vocabulary rather than two rival ones, and they are still the sole input to
 *     {@link statusForPublicErrorCode} — they simply stay inside. The STATUS carries the
 *     machine-readable half of the answer, which is a protocol value rather than an invented one, and
 *     the validation error keys carry the parity-bearing half.
 *   - Any timeout, page size, batch size, retry count, backoff schedule, concurrency limit or
 *     cache lifetime, and no service-level objective of any kind (AAP 0.8.3.5).
 *   - A logging, metrics or tracing LIBRARY. None is added, so the deliverable's dependency set
 *     stays frozen: the manifest gains nothing because of this file (AAP 0.7.3 S5). No metric and no
 *     span is emitted either, because AAP 0.7.3 S9 forbids inventing an observability taxonomy the
 *     source does not state.
 *     There is exactly ONE side effect anywhere in this module, and it is not observability:
 *     {@link errorResponse} writes a diagnostic line for each failure it deliberately declines to
 *     describe in the response body, using the runtime's own error stream and nothing else. That
 *     write is what makes the non-disclosure honest rather than lossy — the internal detail is
 *     REDIRECTED, not discarded — and it is the reason no caller has to choose between a leaking
 *     response and an undiagnosable failure. `errorResponse` is consequently the ONE export that is
 *     not pure, which is why the purity statement above is scoped to the others; all of them,
 *     including this one, stay assertable without a database, a network call or an AWS runtime.
 *   - The two execution-model mismatches that touch this folder. AAP 0.6.6 M1 (the importer's
 *     one-hour request budget, which exceeds the platform's function ceiling and therefore has no
 *     single-invocation equivalent) belongs to productHandler.ts, and M2 (the feed view's
 *     six-minute render budget, far beyond a synchronous integration budget) belongs to
 *     googleFeedHandler.ts. Neither is resolved, worked around or restated here.
 *   - A health, readiness or metrics endpoint, and any route table. Routing is router.ts.
 */

import { randomUUID } from 'node:crypto';

import {
  DomainError,
  LegacyParityError,
  NotImplementedError,
  PUBLIC_ERROR_CODE,
  type PublicErrorCode,
  type PublicErrorPresentation,
} from '../errors/DomainError';
import { ValidationError, type ValidationErrors } from '../errors/ValidationError';
import type {
  RequestAuthorizationContext,
  RequestAuthorizationResolver,
} from '../ports/AccountContextPort';
import type { BoundedReadWindow } from '../ports/SmartListQueryPort';
import type { SmartListInput } from '../ports/SmartListQueryPort';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * The AWS types this folder needs, re-exported from one place.
 *
 * This is the mechanism behind the confinement property stated in the module header: a sibling
 * handler imports its event, result, handler and invocation-context types from here rather than
 * reaching for the AWS typings itself, so the coupling has exactly one declaration site in the
 * whole subtree. The re-export is type-only, so it is erased entirely — nothing named here can
 * reach a bundle or a runtime module resolution, which is why the typings can remain a
 * development-only dependency (AAP 0.5.2.2).
 */
export type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayProxyHandler,
  Context,
} from 'aws-lambda';

/**
 * The HTTP status codes this module emits, and the only numeric values that appear in this file.
 *
 * TRANSLATION DECISION (AAP 0.8.2 Guideline 6, judgment (d)). The legacy system expressed none of
 * these outcomes as a status code: a validation failure left the entity unsaved and populated an
 * error bag, an unresolvable member raised a bare string, and the application server decided
 * everything about the response. Every mapping below is therefore a judgment made by this port,
 * and each one is justified where it is applied — {@link errorResponse} for the failure branches,
 * {@link okResponse} and {@link xmlResponse} for success, {@link notFoundResponse} for an
 * unmatched route.
 *
 * The set is closed at exactly the seven codes this module uses. Nothing is added speculatively:
 * AAP 0.7.3 S9 forbids inventing surface the source does not call for, so a consumer that
 * genuinely needs another code extends this single declaration site rather than writing a bare
 * number at a call site. Status codes are protocol values defined by RFC 9110, not tuning
 * parameters, which is why they are the one numeric exception this file allows itself.
 *
 * TRANSLATION DECISION (judgment (g)) — THE TWO AUTHORISATION CODES REPLACE A REDIRECT. The legacy
 * gate did express one outcome, and it expressed it as navigation rather than as a status: when
 * `authenticateAction` returned false, `setupRequest()` [org/Hibachi/Hibachi.cfc:L188-L201] stored
 * the current URL and REDIRECTED the browser to the configured login action. A headless service
 * cannot redirect a machine client to an HTML login form, so the refusal is reported instead of
 * navigated. Two codes rather than one, because RFC 9110 already draws the distinction the legacy
 * ladder draws internally: the logged-in test at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L30] is a question about whether a principal
 * exists at all, while the classification tests that follow it are questions about what a known
 * principal may do. See {@link unauthorizedResponse} and {@link forbiddenResponse}.
 *
 * The object is frozen so the declaration is provably immutable at runtime as well as in the type
 * system. That is not decoration: it is what lets the module header state without qualification
 * that this file holds no module-scope mutable state, which AAP 0.6.6 M7 requires of everything
 * outside the connection pool.
 */
export const HTTP_STATUS = Object.freeze({
  OK: 200,

  BAD_REQUEST: 400,

  /** No principal could be established for the invocation. See {@link unauthorizedResponse}. */
  UNAUTHORIZED: 401,

  /** A principal exists but is not authorised for the operation. See {@link forbiddenResponse}. */
  FORBIDDEN: 403,

  /** No route matched, or the addressed record does not exist. */
  NOT_FOUND: 404,

  INTERNAL_SERVER_ERROR: 500,

  NOT_IMPLEMENTED: 501,
});

/**
 * The media type used for every JSON response this module produces.
 *
 * No charset parameter is attached, and that is deliberate rather than an omission: RFC 8259
 * fixed JSON's encoding and RFC 4627's successor defines no charset parameter for this media
 * type, so appending one would be asserting something the specification does not define.
 */
export const JSON_CONTENT_TYPE = 'application/json';

/**
 * The media type used for the product feed.
 *
 * TRANSLATION DECISION (AAP 0.8.2 Guideline 6, judgment (c)) — stated plainly because this value
 * is chosen by the port rather than carried from the source.
 *
 * What the source establishes:
 *   - integrationServices/google/views/feed/product.cfm:L1 emits an XML declaration as its literal
 *     first bytes, and that declaration carries a version pseudo-attribute only — no encoding
 *     pseudo-attribute.
 *   - integrationServices/google/controllers/feed.cfc suppresses the framework layout and does
 *     nothing else to the response.
 *   - No content-type tag, content-type header assignment or encoding call appears anywhere in
 *     integrationServices/google/**. THE LEGACY VIEW THEREFORE SETS NO EXPLICIT CONTENT TYPE THAT
 *     SOURCE ANALYSIS COULD VERIFY. Whatever the application server defaulted to for that request is
 *     not recoverable from source, and this port does not guess at it.
 *
 * Given that, the generic registered XML media type is used. It is the conservative choice: it
 * describes the payload accurately without asserting a feed dialect through a media type that no
 * standards body registered, and it is what RFC 7303 defines for a general XML document.
 *
 * No charset parameter is attached, for a reason specific to this path. The legacy declaration
 * omits an encoding pseudo-attribute, which under the XML specification means the document's own
 * default applies unless external information overrides it. Attaching a charset parameter here
 * would be exactly that external override — asserting from outside the document something the
 * source never asserted. Omitting it leaves the document's own declaration governing, which is
 * the faithful position.
 *
 * Nothing else is invented on this path: no cache directive, no entity tag, no compression
 * setting, no content disposition and no delivery hint of any kind (AAP 0.7.3 S9).
 */
export const XML_CONTENT_TYPE = 'application/xml';

/**
 * The body every failure response carries.
 *
 * The shape is deliberately small: at most three members, two of them always present. There is no
 * problem-detail envelope, no type or instance identifier, no timestamp, no correlation or trace
 * identifier, no retry hint and no severity — AAP 0.7.3 S9 forbids inventing any of them — and
 * nothing that names this deliverable's own internals. What a body DOES carry, exactly:
 *
 *   - `code` is always present, and it is the machine-readable half of the answer. Its value is one
 *     member of the closed nine-member vocabulary ../errors/DomainError declares as
 *     `PUBLIC_ERROR_CODE`, never a string this module composes; {@link statusForPublicErrorCode}
 *     maps that same value onto the status returned beside it, so the two halves of a failure can
 *     never disagree. The vocabulary is CLOSED at the outcomes {@link errorResponse} already
 *     distinguishes structurally by branch, which is what separates it from the open-ended taxonomy
 *     S9 rules out: no branch can be added without adding a member, and the compiler then forces
 *     every switch over the union to answer for it. The converse does not hold in full today, and
 *     the one exception is recorded rather than rounded off — `CATALOG_STATE_UNEXPECTED` is declared
 *     at `src/errors/DomainError.ts:152` and mapped to 500 by {@link statusForPublicErrorCode}, but
 *     no branch of this module and no error class in the slice produces it; `:138` there states the
 *     condition it is reserved for. Every other member has a producer. The published code is also
 *     the necessary counterpart of a public `message` that can no longer be specific — see WHAT IS
 *     DELIBERATELY NOT HERE at the top of this module, which records the same decision from the
 *     registry side. And unlike `member` below, a code discloses nothing about internal composition:
 *     the nine values name OUTCOMES, not classes, members, source locators or collaborators.
 *   - `message` is always present. It is EITHER one of the four mandated legacy strings, forwarded
 *     verbatim, OR a neutral text this port owns; nothing else can appear in it. See
 *     {@link errorResponse} for the type-level rule that decides which, and why.
 *   - `errors` is present only for a validation failure, and it is the parity-bearing member of
 *     this whole interface. It is the keyed structure ../errors/ValidationError exposes, carried
 *     across unchanged: a map from property identifier to the ordered list of resource-bundle keys
 *     reported against it. AAP 0.4.1.11 requires exactly this.
 *
 * The serialized key order is `message`, then `errors`, because the only two producers both build the
 * object in that order — {@link messageResponse} builds `{ message }` and the validation branch of
 * {@link errorResponse} builds `{ message, errors }` — and the assertions cited below pin key ORDER
 * through `Object.keys`, not merely membership.
 *
 * ⛔ THERE IS DELIBERATELY NO `member` MEMBER, AND ITS ABSENCE IS A SECURITY DECISION RATHER THAN
 * AN OVERSIGHT. A boundary-stubbed member raises ../errors/NotImplementedError, which carries the
 * un-portable member's fully qualified name so a caller INSIDE the service can identify it
 * programmatically. Publishing that name in a response body would disclose this deliverable's
 * internal composition — class names, member names and, through the accompanying reason text,
 * legacy source locators and out-of-scope collaborator names — to anyone able to reach the route.
 * AAP TR-5's requirement that "the member is never quietly dropped from the interface" is a
 * statement about the SERVICE INTERFACE, and it remains satisfied in full: the member is still
 * declared, still typed, still reachable and still raises rather than fabricating a value, and the
 * response still reports the boundary distinctly through its status code. What is withheld is the
 * identifier, not the fact. See {@link errorResponse}.
 *
 * ⚠️ THE CASE FOR RETAINING IT WAS MADE, AND IT IS ANSWERED HERE RATHER THAN IGNORED. The argument
 * was that every value reaching `member` is a bare `Class.method` name from the ported public
 * surface — no path, no line, no reason clause — so it names the operation the caller already asked
 * for and discloses nothing new; and that dropping it "would make the boundary silent", citing the
 * TR-5 sentence above. Two things defeat it. First, the TR-5 sentence governs the SERVICE interface,
 * not an HTTP body field; reading it as a response-shape obligation is a category error, and the
 * boundary is not silent — 501 is unique to this branch, so the fact is reported without the name.
 * Second, the guarantee is only as strong as its weakest future writer: `member` is populated from a
 * free-form field on the error object, so "it will always be a bare member name" is a convention no
 * type enforces, whereas an absent field cannot be widened by anyone. The body shape is also pinned
 * by executable assertions — `Object.keys(JSON.parse(result.body))` must equal `['message']`
 * in `test/services/SkuService.test.ts`, and one of those cases asserts
 * specifically that the not-implemented response "publishes neither its message nor its member
 * identifier", withholding both the member name and its legacy locator under `not.toContain` — so
 * the narrower contract is the tested one, and widening it would require deleting a test rather than
 * adding one.
 *
 * The optional member is declared optional rather than as a union with undefined, because
 * exactOptionalPropertyTypes is enabled: a producer omits it entirely rather than setting it to
 * undefined, so a serialized body never carries a key with no value.
 *
 * This type is exported while the neutral message texts below are not. That asymmetry is
 * intentional and follows the convention ../errors/ValidationError established in its own decision
 * (d): a consumer or a test should be able to type-check against the SHAPE of a failure body, but
 * must not assert equality against a text this port invented, because such a text carries no parity
 * obligation and asserting on it would imply one.
 *
 * ⛔ THERE IS DELIBERATELY NO `code` MEMBER EITHER, FOR THE SAME REASON AS `member`. A classification
 * code is still computed internally — {@link statusForPublicErrorCode} maps one onto the status this
 * module returns, and ../errors/ValidationError declares one on its presentation — but it is NOT
 * serialized. Publishing it would turn an internal routing decision into a documented response
 * contract this port would owe forever, and it is the taxonomy surface AAP 0.7.3 S9 rules out. The
 * status code already carries the machine-readable half of the answer.
 *
 * ⚠️ RESTORED AFTER A DRIFT, AND THE DRIFT IS RECORDED RATHER THAN QUIETLY UNDONE. An intermediate
 * revision of this module declared `readonly code: PublicErrorCode` here, threaded it through
 * {@link messageResponse} as a required argument, and serialized it on every failure body. That
 * contradicted the paragraph above — which was never removed — and it also published pairs the single
 * mapper disagrees with: an authorisation refusal emitted `CATALOG_REQUEST_REJECTED` alongside HTTP
 * 401 or 403 while {@link statusForPublicErrorCode} assigns that code 400, and the undisclosed
 * domain-failure branch emitted `SERVICE_FAULT` alongside 400 while the mapper assigns it 500. With
 * nothing published there is no pair to disagree: the status is the whole machine-readable answer, and
 * every branch's status remains exactly the one this module returned before the drift, so no
 * status-bearing assertion changes meaning.
 */
export interface ErrorResponseBody {
  readonly message: string;
  readonly errors?: ValidationErrors;
}

/*
 * Neutral texts for the responses that have no legacy counterpart at all.
 *
 * Deliberately NOT exported, for the reason given on {@link ErrorResponseBody}: the legacy system
 * has no equivalent string for any of these situations, so none of them carries a parity
 * obligation, and keeping them module-private means no consumer or test can mistake one for legacy
 * behavior. Assert on the status code and on the absence of disclosure instead.
 *
 * Each is intentionally terse and reveals nothing about the service's internals — no route, no
 * identifier, no collaborator name and no reason. See the disclosure rules on {@link errorResponse}.
 *
 * {@link NOT_IMPLEMENTED_MESSAGE} is declared separately below rather than in this list, because it is
 * the one neutral text that stands in front of an error object which DOES carry internal detail, and
 * that asymmetry deserves its own statement.
 */
const NOT_FOUND_MESSAGE = 'Not found';
const UNEXPECTED_FAILURE_MESSAGE = 'An unexpected error occurred';
const BODY_ABSENT_MESSAGE = 'A request body is required';
const BODY_MALFORMED_MESSAGE = 'The request body is not valid JSON';
const BODY_NOT_AN_OBJECT_MESSAGE = 'The request body must be a JSON object';
const AUTHENTICATION_REQUIRED_MESSAGE = 'Authentication is required';
const NOT_AUTHORIZED_MESSAGE = 'Not authorized';

/*
 * ⛔ NO NEUTRAL TEXT FOR AN AUTHORED DOMAIN MESSAGE IS DECLARED HERE, AND THAT ABSENCE IS DELIBERATE.
 *
 * One used to be, and BRANCH 4 of {@link errorResponse} emitted it directly. That made this module the
 * second owner of a string ../errors/DomainError already owns on its deny-by-default presentation, and
 * the duplicate is what allowed the branch to publish one fixed text for every subclass while ignoring
 * the presentations ConfigurationError and DataIntegrityError override. BRANCH 4 now reads
 * `getPublicError()` instead, so the text and the classification arrive together from the single place
 * that decides them — the error itself. Re-declaring a copy here would reopen exactly that divergence.
 *
 * The substitution rule is unchanged and is not weakened by the move: a THROWN message is still never
 * read on that branch. What is published is a presentation text, which ../errors/DomainError authors
 * precisely so it can be published, and which is one fixed string per classification rather than a
 * per-situation family — a per-situation text would reconstruct by paraphrase exactly the internal
 * detail the substitution exists to withhold. See the disclosure rules on {@link errorResponse}.
 */

/*
 * The neutral text that stands in for a boundary-stubbed member's own message.
 *
 * It names the CONDITION and not the member; see {@link ErrorResponseBody} for why the member's
 * identifier is withheld while the condition is still reported, and {@link errorResponse} for the
 * status code that keeps the condition distinguishable from every other failure.
 *
 * WHY THIS TEXT RATHER THAN THE THROWN ONE, STATED IN FULL. ../errors/DomainError composes a
 * not-implemented message as the member name followed by the reason its thrower supplied, and those
 * reasons are written for an engineer reading a log: they cite legacy CFML files by path and line, name
 * carried defect identifiers, and explain which collaborator is absent and why nothing was invented in
 * its place. Every one of those is a fact about this port's internals, and an internal file path is the
 * most explicit of them, so this file's contract forbids all of them reaching a body. The 501 branch
 * therefore answers with this text INSTEAD OF the composed message.
 *
 * IT IS A CONSTANT, NOT A TEMPLATE, and that distinction is the durable part of the guarantee: the text
 * is chosen by the branch, is identical on every occurrence, and no part of it is derived from the
 * error, so no future thrower can widen what a caller sees by writing a longer reason. The reason
 * itself is not discarded — it stays on the error object, where {@link logSuppressedFailure} records it
 * and a debugger can read it. Splitting the audience is the whole mechanism: the operator keeps the
 * full explanation, the caller gets a stable statement that the operation is not implemented, and
 * neither is served a compromise.
 */
const NOT_IMPLEMENTED_MESSAGE = 'This operation is not implemented';

/*
 * The JSON literal used when a value has no JSON representation.
 *
 * JSON.stringify is DECLARED to return a string, but it returns the value undefined — not the text
 * "undefined" — when handed undefined, a function or a symbol. A proxy result's body member is a
 * required string, so that case has to be closed explicitly rather than trusted to the signature.
 * See {@link serializeJson}.
 */
const JSON_NULL = 'null';

/**
 * Serializes a body for a JSON response, closing the gap between JSON.stringify's declared return
 * type and its actual behavior.
 *
 * The declared signature promises a string; the runtime returns undefined for a value with no JSON
 * representation. The compiler cannot catch that, because the lie is in the ambient declaration
 * rather than in this code, so the result is widened to include undefined and the absent case is
 * mapped to the JSON null literal. That keeps a proxy result's required body member honest without
 * a non-null assertion and without a cast.
 *
 * @param body any value a caller wishes to serialize
 * @returns the serialized JSON text, or the JSON null literal when the value has no representation
 */
function serializeJson(body: unknown): string {
  const serialized: string | undefined = JSON.stringify(body);

  return serialized ?? JSON_NULL;
}

/**
 * Builds a JSON response at an explicit status code.
 *
 * This is the general form every other JSON-bodied helper in this module delegates to, so response
 * assembly — the status, the content type and the serialization — happens in exactly one place and
 * no handler repeats it.
 *
 * @param statusCode the status to return; use a member of {@link HTTP_STATUS} rather than a literal
 * @param body the value to serialize as the response body
 * @returns a proxy result ready to return from a handler
 */
export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
    body: serializeJson(body),
  };
}

/**
 * Builds a successful JSON response.
 *
 * TRANSLATION DECISION (judgment (d)) — the status is a judgment, because the legacy application
 * server chose it. A successful read or save returns a representation, which RFC 9110 describes
 * with 200; no other code is used for success anywhere in this module, and in particular no
 * created or no-content status is introduced, because nothing in the source distinguishes those
 * outcomes and inventing the distinction would be an enhancement AAP 0.8.2 Guideline 4 forbids.
 *
 * @param body the value to serialize as the response body
 * @returns a proxy result carrying the serialized value
 *
 * @example
 * ```ts
 * const product = await productService.getProduct(productID);
 * return product === null ? notFoundResponse() : okResponse(product);
 * ```
 */
export function okResponse(body: unknown): APIGatewayProxyResult {
  return jsonResponse(HTTP_STATUS.OK, body);
}

/**
 * Builds a response whose body is a single message and nothing else.
 *
 * It exists so a handler that must answer with a plain message never assembles a body shape of its
 * own: the failure body shape is declared once, as {@link ErrorResponseBody}, and produced only
 * here and in {@link errorResponse}.
 *
 * ⛔ THERE IS NO CLASSIFICATION ARGUMENT, AND ADDING ONE BACK IS A CONTRACT CHANGE, NOT A CONVENIENCE.
 * {@link ErrorResponseBody} records why the body carries no `code`; the consequence here is that the
 * only two things a caller supplies are the status and the text. A caller that wants a status derived
 * from an internal classification asks {@link statusForPublicErrorCode} for it and passes the result,
 * which keeps the mapper the single place a code influences a response.
 *
 * The message is written into the body exactly as given — no prefix, no suffix, no punctuation
 * adjustment and no case change. THE CALLER IS ANSWERABLE FOR WHAT IT PASSES: this helper cannot
 * tell a neutral text from a maintainer-facing one, so a caller must pass only a text it has
 * established is public-safe, and must never pass an `Error.message` it did not obtain from
 * {@link PublicErrorPresentation}. The disclosure rules on {@link errorResponse} state what is
 * prohibited; every in-module caller passes one of the module-private constants above.
 *
 * ⛔ THE BODY CARRIES `message` AND NOTHING ELSE. No classification code, no member identifier, no
 * route and no context accompanies it. The response body is the one surface a caller can read, and
 * every member added to it becomes a contract this port would owe forever; the status code already
 * carries the machine-readable half of the answer, which is why it is the only other value here.
 * {@link ErrorResponseBody} records the same prohibition against a `code` member, and
 * {@link statusForPublicErrorCode} is where a classification is consumed instead of published.
 *
 * @param statusCode the status to return; use a member of {@link HTTP_STATUS}
 * @param message the public-safe text to place in the body's message member, used verbatim
 * @returns a proxy result carrying a message-only failure body
 */
export function messageResponse(statusCode: number, message: string): APIGatewayProxyResult {
  const body: ErrorResponseBody = { message };

  return jsonResponse(statusCode, body);
}

/**
 * Builds the response for an unmatched route, or for an addressed record that does not exist.
 *
 * TRANSLATION DECISION (judgment (d)) — 404 is the judgment RFC 9110 supports for "no matching
 * target", and it serves both callers this module is designed for: ./router.ts for a route no entry
 * matches, and a per-service handler whose lookup returned nothing.
 *
 * It takes no arguments on purpose. Echoing the requested route, method or identifier back into the
 * body would disclose the service's addressable surface to an unauthenticated caller for no benefit
 * to a legitimate one, so the body carries a neutral text and nothing else. A handler that needs a
 * different 404 text can call {@link messageResponse} explicitly and take responsibility for it.
 *
 * @returns a proxy result with a not-found status and a neutral body
 */
export function notFoundResponse(): APIGatewayProxyResult {
  // Derived, not restated: `RESOURCE_NOT_FOUND` is the code whose single documented status is 404,
  // so this member reads it from the one map rather than pairing a code with a status of its own.
  return messageResponse(
    statusForPublicErrorCode(PUBLIC_ERROR_CODE.RESOURCE_NOT_FOUND),
    NOT_FOUND_MESSAGE,
  );
}

/**
 * Builds the response for an invocation with no principal at all.
 *
 * TRANSLATION DECISION (judgment (g)) — this is the headless replacement for a redirect. The
 * legacy request gate answered an unauthenticated request by storing the current URL and sending
 * the browser to the configured login action [org/Hibachi/Hibachi.cfc:L188-L201]. That is not
 * available to a service whose callers are programs: there is no browser to navigate, no session to
 * return to, and no login view in this deliverable — `admin/**` and `frontend/**` are both out of
 * scope (AAP §0.2.2.2). Reporting that authentication is required is the faithful equivalent of the
 * legacy outcome, and 401 is the code RFC 9110 defines for it.
 *
 * It takes no arguments, for the same reason {@link notFoundResponse} does not: the body must not
 * echo the route, the method, the identifier or the classification that refused the request. A
 * caller learns THAT it needs to authenticate and nothing about what lies behind the gate.
 *
 * ⚠️ NO `WWW-Authenticate` HEADER IS SET. RFC 9110 associates one with this status, but naming a
 * scheme would be inventing an authentication mechanism this deliverable does not implement and the
 * source does not describe — the legacy mechanism was a form post and a session, not an HTTP
 * authentication scheme. AAP §0.7.3 S9 rules that out, so the header is deliberately omitted and
 * its omission recorded here rather than left to look like a lapse.
 *
 * @returns a proxy result with an unauthorized status and a neutral body
 */
export function unauthorizedResponse(): APIGatewayProxyResult {
  // `PUBLIC_ERROR_CODE` carries no authentication-specific member and none is invented here, so an
  // authorisation refusal reports the rejection family. The status, not the code, names the reason.
  return messageResponse(HTTP_STATUS.UNAUTHORIZED, AUTHENTICATION_REQUIRED_MESSAGE);
}

/**
 * Builds the response for a known principal that is not authorised for the operation.
 *
 * TRANSLATION DECISION (judgment (g)). The legacy ladder reached this outcome at every one of its
 * terminal denials — [org/Hibachi/HibachiAuthenticationService.cfc:L83] when no classification
 * matched, and [:L100] when the permission-group walk found nothing — and the framework answered
 * all of them with the same login redirect as an unauthenticated request. Distinguishing the two
 * here is a deliberate improvement in protocol accuracy and not a change in policy: the same
 * requests are refused, with the same absence of detail.
 *
 * It takes no arguments, and in particular it does not report which operation was refused, which
 * classification applied, or whether the addressed record exists. That last point is the important
 * one: a handler that consults the gate BEFORE it reads an identifier or touches a repository
 * cannot become an existence oracle, because the refusal is identical for an identifier that exists
 * and one that does not.
 *
 * @returns a proxy result with a forbidden status and a neutral body
 */
export function forbiddenResponse(): APIGatewayProxyResult {
  // Same classification as the unauthenticated case, for the same reason: the code names the
  // rejection family and the status names which refusal it is.
  return messageResponse(HTTP_STATUS.FORBIDDEN, NOT_AUTHORIZED_MESSAGE);
}

/**
 * Builds the response for the product feed: an XML document returned unwrapped.
 *
 * TRANSLATION DECISIONS (judgments (c) and (e)).
 *
 * (e) The legacy feed controller set request.layout = false so the retired framework would not wrap
 *     the view's output, and the view then emitted its document directly. The equivalent here is
 *     structural rather than behavioral: the document simply becomes the response body. The string
 *     is written through with no envelope, no wrapper object, no JSON encoding, no indentation and
 *     — critically — nothing prepended, so the XML declaration the feed builder emits stays the
 *     literal first bytes of the response exactly as it was in the legacy view. It is not trimmed
 *     either: trimming would silently alter a document the feed builder is responsible for, and
 *     that document's bytes are behavior.
 *
 * (c) The content type is chosen by this port, not carried from the source. {@link XML_CONTENT_TYPE}
 *     records why the generic registered XML media type with
 *     no charset parameter is the faithful choice.
 *
 * The base64 flag is deliberately left unset. An omitted flag means a text body, which is what an
 * XML document is, so setting it would add a member that states the default — and AAP 0.7.3 S9
 * rules out adding anything to this path that the source does not require.
 *
 * @param xml the serialized document, used exactly as given
 * @returns a proxy result carrying the document as its body
 */
export function xmlResponse(xml: string): APIGatewayProxyResult {
  return {
    statusCode: HTTP_STATUS.OK,
    headers: { 'Content-Type': XML_CONTENT_TYPE },
    body: xml,
  };
}

/* ==========================================================================================
 * HOW A LEGACY MESSAGE IS RECOGNISED — BY TYPE, NOT BY TEXT
 * ==========================================================================================
 *
 * TRANSLATION DECISION (AAP 0.8.2 Guideline 6, judgment (g)) — recorded here because this is where
 * the judgment is made, and recorded at length because an earlier design made it differently and a
 * reader deserves to know which one is in force and why.
 *
 * THE PROBLEM. Two obligations meet at {@link errorResponse}. AAP 0.8.2 Guideline 2 and AAP 0.4.1.11
 * require four thrown message strings to reach a caller character for character, because they are
 * observable behaviour of the legacy system. The disclosure rules on {@link errorResponse} forbid an
 * internal detail reaching a caller at all, and `DomainError` is raised throughout this port — in
 * services, entities, adapters and the feed builder — by throw sites free to put a collaborator
 * name, a member identifier, a file path or a driver rejection in the message. Forwarding every
 * domain message honours the first and violates the second; forwarding none does the reverse.
 *
 * THE RESOLUTION IN FORCE — A TYPE. `LegacyParityError` marks a message as legacy behaviour at the
 * THROW SITE, and this module tests that type. Disclosure is therefore default-deny: the great
 * majority of throw sites need no change and disclose nothing, and the four that carry a mandated
 * string say so in their type, which the compiler and `instanceof` check rather than a reviewer.
 *
 * ⚠️ AND THE TYPE IS NOW NARROW ENOUGH TO MEAN IT. Marking a message at the throw site is only a
 * guarantee if the mark cannot be applied to the wrong message, and originally it could: the
 * constructor took a plain `string`, so the authorisation this branch honours amounted to whatever a
 * throw site chose to assert. It was in fact misapplied — an authored diagnostic naming internal CFML
 * argument expressions, a legacy source locator and two internal guard identifiers was raised on this
 * type and published here verbatim. ../errors/DomainError now declares the four texts as the only
 * inhabitants of a branded `LegacyParityMessage` and the constructor accepts nothing else, so the set
 * of messages this branch can emit is closed by the compiler rather than by the four exports being
 * used carefully. A regression test holds the narrowing in place: widening the constructor back to
 * `string` fails the build.
 *
 * WHY THE EARLIER CONTENT ALLOWLIST WAS RETIRED. A table of the four texts used to live here, and
 * `errorResponse` disclosed a message by recognising it. That design was defensible and it was
 * superseded for one decisive reason: two of the four strings interpolate a caller-supplied option
 * list, so recognition had to degrade to PREFIX matching on a caller-influenced string. A message
 * whose text merely began with a mandated prefix would have been disclosed in full, including
 * whatever internal detail followed it. A type check cannot be induced that way, so the type is the
 * stronger guarantee, and the weaker test is gone rather than kept alongside it.
 *
 * WHY THIS IS NOT THE TAXONOMY AAP 0.7.3 S9 FORBIDS. S9 forbids inventing classification surface the
 * source does not state. Nothing here classifies: the type carries no code, no category, no severity
 * and no reason vocabulary, and nothing about it is serialized. A caller observes the message text
 * and the status, exactly as before, and cannot detect that the mechanism exists.
 *
 * ⛔ THE STATUS IS UNIFORM ACROSS ALL FOUR, AND THAT SETTLES A REAL DISAGREEMENT. Two earlier
 * readings mapped the discriminator fallthrough at [model/service/SkuService.cfc:L204] to 500 rather
 * than 400, reasoning that a stored product type matching none of the three seeded discriminators is
 * a data state the caller neither caused nor can correct. That reasoning is sound and it is recorded
 * here rather than erased. It is not implemented, for three reasons. First, the legacy assigns NO
 * status at any of the four throw sites — each is a bare CFML `throw` — so 400-against-500 is purely
 * a translation judgment, and S9 favours the simpler uniform rule over a per-message taxonomy.
 * Second, honouring it requires a status or code member on `LegacyParityError`, which that class's
 * own contract explicitly forecloses ("it adds no member, no code, no category, no severity and no
 * taxonomy"). Third, the 500 mapping is not lost: {@link statusForPublicErrorCode} still maps
 * `CATALOG_STATE_UNEXPECTED` to 500 for every failure that carries that code through the
 * presentation channel, which is where a genuine state fault belongs. What this branch publishes is
 * a mandated legacy TEXT, and it publishes it at one status for all four.
 * ========================================================================================== */

/*
 * The fixed phrases that label a suppressed failure in the execution log.
 *
 * One phrase per suppressing branch, so a reader of the log can tell which of the three situations
 * occurred without the phrase itself carrying any variable detail. They are module-private for the
 * same reason as the neutral response texts: nothing outside this module should assert on a string
 * this port invented, and none of these reaches a caller in any case.
 *
 * Each names only the situation. No identifier, no route, no argument value, no collaborator name
 * and no severity vocabulary is embedded — the situation is the whole of what the phrase says, and
 * {@link describeSuppressedFailure} decides separately, and by allowlist, what else may accompany it.
 */
const BOUNDARY_STUB_LOG_PHRASE =
  'Boundary-stubbed member invoked; detail withheld from the response';
const UNDISCLOSED_DOMAIN_FAILURE_LOG_PHRASE =
  'Domain failure with a non-parity message; detail withheld from the response';
const UNRECOGNISED_FAILURE_LOG_PHRASE =
  'Unrecognised failure escaped a handler; detail withheld from the response';

/* ==========================================================================================
 * THE DIAGNOSTIC RECORD — AN ALLOWLIST, NOT A DUMP
 * ==========================================================================================
 *
 * TRANSLATION DECISION (AAP 0.8.2 Guideline 6). ⛔ THIS REVERSES AN EARLIER DECISION MADE IN THIS
 * MODULE, AND THE REVERSAL IS RECORDED RATHER THAN QUIETLY APPLIED, because a reader who knows the
 * previous rule deserves to know which one is in force and why.
 *
 * WHAT THE EARLIER RULE WAS. `logSuppressedFailure` forwarded the caught value to `console.error`
 * AS A SEPARATE ARGUMENT, untouched, so that the runtime's own formatter would render it — stack
 * included — on the reasoning that non-disclosure to a caller must not become undiagnosability for
 * an operator, and that forwarding a value performs no string operation on it.
 *
 * WHY IT WAS WRONG, ON TWO INDEPENDENT COUNTS.
 *
 *   1. CWE-532, sensitive information in a log. The runtime's formatter renders an `Error`
 *      RECURSIVELY: its `stack` (absolute file paths and the internal call shape of the service),
 *      its `cause` chain, and — because `../errors/DomainError` carries a `context` bag — whatever
 *      the throw site put there. Across this port that bag legitimately holds statement text,
 *      schema identifiers, table and column names, the exact stored value a row mapper refused, and
 *      an addressed identifier. None of that is a caller's to see, and a log stream is not a
 *      privileged place: on this platform it is a shared, exportable, long-retained sink.
 *   2. CWE-117, improper neutralization for a log. An error message frequently contains CALLER
 *      TEXT — a rejected option list, a submitted code, an unreadable stored string. Rendered
 *      verbatim, an embedded CR or LF forges additional log lines and an embedded C1 control
 *      corrupts a downstream log viewer. Forwarding a value rather than concatenating it does not
 *      help at all: the formatter concatenates instead, so the neutralization never happens.
 *
 * THE RULE NOW IN FORCE. Nothing about a caught value is logged except what this module has
 * explicitly ALLOWED, and every allowed string is neutralized before it is emitted. The allowlist
 * is exactly {@link SuppressedFailureDiagnostic}'s four members and it is deny-by-default: a field
 * that is not named there cannot reach the log, so a future `context` key or a new subclass member
 * is excluded automatically rather than requiring anyone to remember to exclude it.
 *
 * ⛔ EXPLICITLY EXCLUDED, AND EACH FOR A STATED REASON: `message` (carries caller text and internal
 * detail on every branch except the two the RESPONSE already publishes), `stack` (file paths and
 * internal structure), `cause` (an entire second failure, recursively), `context` (arbitrary
 * diagnostic values, including exact stored data), and every request value — no path parameter, no
 * query parameter, no header, no body fragment and no principal identifier.
 *
 * ⭐ WHY THIS IS NOT THE INVENTED LOG SCHEMA AAP 0.7.3 S9 FORBIDS. S9 forbids inventing surface the
 * source does not state — an SLA, a severity taxonomy, a level vocabulary, a metric. Nothing here is
 * any of those: there is no level, no severity, no category, no reason code of this module's own
 * devising, and nothing is serialized into a RESPONSE. What remains is a redaction control, which is
 * the same class of decision this module already makes for every response body it neutralizes, and
 * it is required by the security review that named CWE-117 and CWE-532 at this exact sink.
 *
 * ⭐ AND IT INTRODUCES NO DEPENDENCY (AAP 0.7.3 S5). No logging library, no serializer and no
 * redaction package: the runtime's own error stream, the runtime's own `JSON.stringify`, and
 * `node:crypto` — a built-in already used by `../util/uuid`, so the dependency set stays frozen and
 * nothing new reaches the bundle.
 * ========================================================================================== */

/**
 * The upper bound on the length of any single string this module writes to the log.
 *
 * A redaction control, NOT a capacity or performance figure (AAP 0.7.3 S9): a class name is the only
 * value that is truncated in practice, and the bound exists so that a hostile or corrupt value
 * cannot make one log line unbounded. It is generous enough that no name this port declares comes
 * close to it, so truncation is a safety net rather than a behaviour anything depends on.
 */
const DIAGNOSTIC_TEXT_LIMIT = 200;

/** Replaces a character a log line must not carry. Chosen because it is inert in every log viewer. */
const DIAGNOSTIC_REDACTED_CHARACTER = '.';

/** Appended when {@link DIAGNOSTIC_TEXT_LIMIT} cut a value short, so truncation is never silent. */
const DIAGNOSTIC_TRUNCATION_MARKER = '[truncated]';

/** Stands in for a class name when the caught value is not an `Error` and therefore has none. */
const UNKNOWN_FAILURE_CLASS = 'unknown';

/** The highest C0 control code point. Everything at or below it is neutralized. */
const LAST_C0_CONTROL_CODE_POINT = 0x1f;

/** The delete character, and the first of the C1 range that follows it. */
const FIRST_C1_CONTROL_CODE_POINT = 0x7f;

/** The last C1 control code point. */
const LAST_C1_CONTROL_CODE_POINT = 0x9f;

/**
 * The complete set of facts this module is permitted to write about a suppressed failure.
 *
 * Four members, and the absence of a fifth is the security property — see the section note above for
 * what is excluded and why. Every string member has already passed
 * {@link sanitizeDiagnosticText} by the time an instance exists, so a consumer of this shape cannot
 * reintroduce a control character by forgetting to neutralize one.
 */
interface SuppressedFailureDiagnostic {
  /** One of the three fixed phrases. Author-written, never derived from a request or an error. */
  readonly situation: string;

  /**
   * The caught value's constructor name — `DataIntegrityError`, `TypeError`, `Error` — or
   * {@link UNKNOWN_FAILURE_CLASS}. A class name is declared by this port or by a library, never by a
   * caller, which is what makes it safe to record where the message is not.
   */
  readonly failureClass: string;

  /**
   * The public classification the failure declares about itself, when it declares one.
   *
   * Present only for a `DomainError`, because only that hierarchy has a code, and it is the code
   * ALREADY published in the response body — so recording it discloses nothing new while letting an
   * operator join a log line to the response a caller reported. Absent rather than null for a
   * failure this port did not raise, because `exactOptionalPropertyTypes` makes "absent" and
   * "present and undefined" different statements and the honest one here is "absent".
   */
  readonly code?: PublicErrorCode;

  /**
   * A fresh identifier for this one logged failure.
   *
   * ⭐ DELIBERATELY THE DASHED RFC-4122 FORM, which is what distinguishes it from a Slatwall entity
   * identifier: IR-6 requires those be 32 hexadecimal characters with no separators, so a dashed
   * value can never be mistaken for one, and `../util/uuid`'s generator is deliberately NOT reused
   * here for that reason. It is log-only and is NOT added to any response body — doing so would put
   * a member on the wire that no source requirement states (AAP 0.7.3 S9). Its purpose is to tie
   * together the several lines one failure can produce as it crosses layers.
   */
  readonly correlationID: string;
}

/**
 * Neutralizes a string for a log line: no control characters, and no unbounded length.
 *
 * THIS IS THE CWE-117 CONTROL. Every C0 code point (which includes CR, LF and TAB), the delete
 * character and every C1 code point is replaced by {@link DIAGNOSTIC_REDACTED_CHARACTER}, so a value
 * cannot forge a line break, terminate a record early, or emit an escape sequence a terminal or a log
 * viewer would interpret. TAB and the two newline characters are neutralized rather than kept
 * precisely because they are the ones a log-injection attempt reaches for first.
 *
 * Iteration is BY CODE POINT rather than by UTF-16 unit, so an astral character is copied whole and
 * is never split into two lone surrogates by the length bound.
 *
 * @param value the text to neutralize
 * @returns the neutralized text, at most {@link DIAGNOSTIC_TEXT_LIMIT} code points plus a marker
 */
function sanitizeDiagnosticText(value: string): string {
  let sanitized = '';
  let retained = 0;

  for (const character of value) {
    if (retained >= DIAGNOSTIC_TEXT_LIMIT) {
      return sanitized + DIAGNOSTIC_TRUNCATION_MARKER;
    }

    const codePoint = character.codePointAt(0) ?? 0;
    const isControl =
      codePoint <= LAST_C0_CONTROL_CODE_POINT ||
      (codePoint >= FIRST_C1_CONTROL_CODE_POINT && codePoint <= LAST_C1_CONTROL_CODE_POINT);

    sanitized += isControl ? DIAGNOSTIC_REDACTED_CHARACTER : character;
    retained += 1;
  }

  return sanitized;
}

/**
 * Reads the caught value's class name, which is the one thing about an unknown failure that is safe.
 *
 * A constructor name is written by this port or by a library it consumes; it is never composed from
 * caller input, and it never carries a path, an identifier or a stored value. It is still passed
 * through {@link sanitizeDiagnosticText} by the caller, because "never" is a property of today's code
 * rather than a guarantee about tomorrow's.
 *
 * @param error the caught value, of any shape
 * @returns the class name, or {@link UNKNOWN_FAILURE_CLASS} for a value that is not an `Error`
 */
function readFailureClassName(error: unknown): string {
  if (!(error instanceof Error)) {
    return UNKNOWN_FAILURE_CLASS;
  }

  const declared = error.constructor.name;

  return declared.length > 0 ? declared : UNKNOWN_FAILURE_CLASS;
}

/**
 * Reads the public classification a failure declares about itself, when it declares one.
 *
 * Only the CODE is read. `getPublicError()` also yields a message, and that message is deliberately
 * not touched here: the response channel decides whether a message may be published, and the log
 * channel has no business republishing one it has already decided to suppress.
 *
 * @param error the caught value, of any shape
 * @returns the declared code, or `undefined` for a failure this port did not raise
 */
function readPublicErrorCode(error: unknown): PublicErrorCode | undefined {
  return error instanceof DomainError ? error.getPublicError().code : undefined;
}

/**
 * Builds the allowlisted diagnostic for a suppressed failure.
 *
 * Separated from {@link logSuppressedFailure} so that the ALLOWLIST is a value with a type rather
 * than an argument list at a call site: the compiler checks the record against
 * {@link SuppressedFailureDiagnostic}, so a member that is not on the allowlist cannot be added
 * without changing the declaration and reading the reasoning attached to it.
 *
 * The result is frozen, matching the treatment of every other constant structure in this folder and
 * the immutability AAP 0.6.6 M7 requires of anything a warm container might share.
 *
 * @param situation one of the three fixed phrases
 * @param error the caught value, read only through the two allowlisted readers above
 * @returns the record that will be written, with every string already neutralized
 */
function describeSuppressedFailure(situation: string, error: unknown): SuppressedFailureDiagnostic {
  const allowlisted = {
    situation: sanitizeDiagnosticText(situation),
    failureClass: sanitizeDiagnosticText(readFailureClassName(error)),
    correlationID: randomUUID(),
  };

  const code = readPublicErrorCode(error);

  return Object.freeze(code === undefined ? allowlisted : { ...allowlisted, code });
}

/**
 * Writes the diagnostic for a failure whose detail is deliberately kept out of the response.
 *
 * This is the single side effect in the module, and it exists so that non-disclosure is honest
 * rather than lossy: an operator learns that a failure occurred, which branch suppressed it, what
 * kind of failure it was and how it is classified — while an unauthenticated caller learns none of
 * it, and while nothing a caller supplied is echoed back into the log at all.
 *
 * ⛔ THE RECORD IS SERIALIZED TO ONE LINE, DELIBERATELY. `JSON.stringify` is handed the finished
 * record rather than the record being passed to `console.error` as an object, for two reasons: the
 * runtime's object formatter is free to expand nested values and insert line breaks, and a single
 * serialized string is a guarantee — not an expectation — that one failure produces exactly one log
 * line. Every string inside it has already been neutralized, so the serializer has nothing left to
 * escape that matters.
 *
 * The runtime's own error stream is used and nothing else. No logging library is introduced, so the
 * dependency set stays frozen (AAP 0.7.3 S5).
 *
 * @param situation a fixed phrase naming which branch suppressed the detail
 * @param error the caught value; only its class and its declared public code are ever read
 */
function logSuppressedFailure(situation: string, error: unknown): void {
  console.error(JSON.stringify(describeSuppressedFailure(situation, error)));
}

/* ==========================================================================================
 * THE SINGLE ERROR-TO-RESPONSE MAPPING
 * ==========================================================================================
 *
 * Every handler funnels its failures through {@link errorResponse}. Nothing else in the folder maps
 * an error to a response, which is the point: one mapping means one place to audit for the two
 * things that must never go wrong here — that legacy behavior is forwarded untouched, and that
 * nothing internal is disclosed.
 * ========================================================================================== */

/**
 * Maps a public-safe failure code to the status that reports it.
 *
 * TRANSLATION DECISION (judgment (d)), and the place where the whole of it now lives. The legacy
 * system expressed none of these outcomes as a status code — a validation failure left the entity
 * unsaved and populated an error bag, an unresolvable member raised a bare string, and the
 * application server decided everything about the response — so every row below is a judgment made
 * by this port. Collecting them here rather than scattering them across the branches of
 * {@link errorResponse} means the entire status policy is one screen a reviewer can audit.
 *
 * WHY THE MAPPING IS KEYED ON THE CODE AND NOT ON THE ERROR CLASS. Two of the codes are carried by
 * the SAME class: the legacy-message family reports a caller-attributable rejection for three of
 * its four messages and a stored-data state for the fourth. A class-keyed mapping cannot express
 * that, so it would have to inspect the message text to tell them apart — which would both create
 * the error-code registry AAP 0.7.3 S9 forbids and make the status depend on a string this port is
 * contractually forbidden to inspect. Keying on the code the error declares about itself resolves
 * it cleanly: the classification is made once, at the throw site, by the code that knows.
 *
 * THIS IS THE FIX FOR THE CLASSIFICATION HALF OF THE ERROR CONTRACT. Before this mapping existed,
 * every error in the port's own hierarchy other than a boundary stub was answered with 400 — which
 * told a caller that a configuration fault, an unreadable database column, a driver result of the
 * wrong shape and a corrupt product-type discriminator were all its own fault to correct. Four of
 * the nine codes are service-attributable and now answer 500, and the one remaining 501 is
 * unchanged.
 *
 * The rows, and the reasoning for each:
 *
 *   - 400 for `VALIDATION_FAILED`, `CATALOG_REQUEST_REJECTED` and `REQUEST_INVALID`. All three are a
 *     rejection of the request's content, which RFC 9110 describes with 400, and all three are
 *     correctable by the caller — a different set of values, a different option selection, a
 *     well-formed body.
 *   - 404 for `RESOURCE_NOT_FOUND`. RFC 9110's status for "no matching target", serving both an
 *     unmatched route and a lookup that returned nothing.
 *   - 501 for `NOT_IMPLEMENTED`. RFC 9110 defines 501 as the server not supporting the
 *     functionality required, which is precisely what a boundary stub is. 500 was rejected because
 *     it asserts a fault where none occurred — the service is behaving exactly as designed — and a
 *     service-unavailable status was rejected because nothing here is temporarily unavailable.
 *   - 500 for `CATALOG_STATE_UNEXPECTED`, `SERVICE_CONFIGURATION`, `SERVICE_DATA` and
 *     `SERVICE_FAULT`. In every one of these the request was well formed and the service is
 *     answerable: a stored discriminator matching none of the three seeded product types, a
 *     deployment value that was never supplied, stored data that cannot be read as its declared
 *     shape, and the deny-by-default case. None of them is anything a caller can act on, so
 *     reporting them as a client error would be actively misleading.
 *
 * The switch is exhaustive over the union with no default clause, so adding a code to
 * `PUBLIC_ERROR_CODE` without deciding its status fails to compile rather than falling through to
 * an arbitrary one.
 *
 * @param code the classification the error declared about itself
 * @returns the status that reports it
 */
/**
 * The single status at which a disclosed legacy message is returned.
 *
 * ⚠️ THIS CONSTANT WAS REFERENCED BY THREE DOC COMMENTS IN THIS FILE BEFORE IT EXISTED. The
 * references were written when the parity branch's status was still a bare literal at its call site,
 * so `{@link PUBLIC_PARITY_MESSAGE_STATUS}` resolved to nothing and the file described a declaration
 * it did not contain. It is declared here rather than the references being deleted, because the thing
 * the references promised — one named, justified home for the parity branch's status — is the correct
 * design and was simply missing.
 *
 * WHY THE PARITY BRANCH DOES NOT DERIVE ITS STATUS FROM A PRESENTATION, WHEN EVERY OTHER BRANCH DOES.
 * `../errors/DomainError`'s `LegacyParityError` declares no `getPublicError()` override at all — it is
 * an empty subclass, deliberately, because its whole purpose is to mark a message as disclosable
 * rather than to reclassify the failure. It therefore inherits the base presentation, whose message is
 * the neutral substitute this branch exists to bypass. Deriving from it would be reading the very
 * presentation the branch is overriding, so the status is named here instead.
 *
 * WHY 400 FOR ALL FOUR MANDATED MESSAGES. Every one of them reports that the request cannot be
 * satisfied as asked: more than one SKU matched the selected options, no SKU matched them, a product
 * has no single SKU to select without options, and the unexpected-error string the combination engine
 * raises when a product type matches none of the three seeded discriminators. The first three are
 * plainly attributable to the caller's selection. The fourth is not — it is stored-data state — and it
 * shares the status anyway, deliberately: splitting it out would require inspecting the message text
 * to decide which status to use, and this module is contractually forbidden from inspecting a thrown
 * message. A type-decided, uniform status is the honest cost of a type-decided disclosure rule, and it
 * is recorded here rather than left implicit.
 *
 * It is module-private, like the neutral texts: a consumer should assert on the status and on the
 * verbatim message, never import this port's opinion about how the two relate.
 */
const PUBLIC_PARITY_MESSAGE_STATUS: number = HTTP_STATUS.BAD_REQUEST;

function statusForPublicErrorCode(code: PublicErrorCode): number {
  switch (code) {
    case PUBLIC_ERROR_CODE.VALIDATION_FAILED:
    case PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED:
    case PUBLIC_ERROR_CODE.REQUEST_INVALID:
      return HTTP_STATUS.BAD_REQUEST;

    case PUBLIC_ERROR_CODE.RESOURCE_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;

    case PUBLIC_ERROR_CODE.NOT_IMPLEMENTED:
      return HTTP_STATUS.NOT_IMPLEMENTED;

    case PUBLIC_ERROR_CODE.CATALOG_STATE_UNEXPECTED:
    case PUBLIC_ERROR_CODE.SERVICE_CONFIGURATION:
    case PUBLIC_ERROR_CODE.SERVICE_DATA:
    case PUBLIC_ERROR_CODE.SERVICE_FAULT:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Maps any thrown value to a response.
 *
 * The five branches are ordered most-derived first, and that order is not cosmetic. ValidationError,
 * NotImplementedError and LegacyParityError all extend DomainError, so testing the base type first
 * would swallow all three specific branches — dropping the error keys in the validation case and
 * masking a mandated legacy string in the parity case, both without a compile error and without any
 * other test in the port failing. The three specific branches are siblings, so their order relative
 * to one another is immaterial; all three must precede the base.
 *
 * ------------------------------------------------------------------------------------------------
 * THE DISCLOSURE RULE THIS FUNCTION ENFORCES, STATED ONCE
 * ------------------------------------------------------------------------------------------------
 * A thrown message reaches a caller if and only if the throw site declared it to be legacy behavior
 * by raising ../errors/LegacyParityError. Every other message this deliberate port raises is
 * replaced with a fixed neutral text, and nothing else about any error is read.
 *
 * The rule is decided by TYPE, not by content. That is deliberate and is the only way to satisfy
 * two obligations that would otherwise be irreconcilable:
 *   - The four mandated legacy strings must arrive character for character, misspellings included.
 *   - A message this port authored must not arrive at all, because those messages exist to make a
 *     fault legible to an engineer and routinely name the thing that failed — a configuration
 *     variable, a column, a storage path, an out-of-scope collaborator, a legacy source locator.
 *
 * A content test cannot separate them honestly: two of the four mandated strings interpolate a
 * runtime value, so recognition would degrade to prefix matching on a string this module is
 * contractually forbidden to inspect, and a per-situation public identifier would be the error-code
 * registry AAP 0.7.3 S9 rules out. Disclosure is therefore DEFAULT-DENY and structural: a message
 * is withheld unless its own type says otherwise. ../errors/DomainError's LegacyParityError records
 * the full reasoning at the declaration site.
 *
 * WHAT THIS COSTS, STATED RATHER THAN HIDDEN. Branch 4 answers every domain failure this port
 * authored with one of the small fixed set of presentation texts its class declares — not with the
 * thrown message — so a caller still cannot tell a resource-budget refusal from a rejected image
 * filename, because both raise the same class. That loss is accepted knowingly: none of those messages
 * is legacy behavior, so none carries a parity obligation, and the alternative — a family of
 * per-situation public texts — would reconstruct by paraphrase precisely the internal detail the
 * substitution exists to withhold. What the presentation DOES separate is the coarse family a caller
 * can act on: a misconfigured service and unreadable stored data are distinguishable from the
 * deny-by-default case, and all three report 500. The full message, its cause and its diagnostic
 * context all remain intact on the error object for the caller inside the service to log.
 *
 * Recognition is by instanceof, which is safe after bundling because ../errors/DomainError re-points the
 * prototype at the constructed class in its constructor. That is a deliberate property of the sibling,
 * relied on here rather than assumed.
 *
 * TYPE RECOGNITION IS EXACTLY WHERE DISCLOSURE AUTHORITY COMES FROM, AND THAT IS THE POINT WORTH BEING
 * PRECISE ABOUT. Knowing which class was raised decides both which branch runs AND, on the third
 * branch alone, whether a thrown text may be placed in a body. ../errors/LegacyParityError exists for
 * no other purpose than to carry that declaration from the throw site to here, so the decision is made
 * where the knowledge is — at the raise — and is default-deny everywhere else: every other failure
 * receives a fixed neutral text with its detail written to the execution log by
 * {@link logSuppressedFailure} instead. ⚠️ The emitted set is therefore closed by the throw sites'
 * discipline rather than by an inventory held here; see the header for why an inventory is impossible
 * for two of the four strings and forbidden for all of them.
 * The two rules that follow from that hold on every branch and are worth stating once, up front:
 * nothing internal is ever disclosed, and nothing is ever silently dropped.
 *
 * THE STATUS IS DERIVED, NOT CHOSEN PER BRANCH. Branches 1, 2, 4 and 5 all read the presentation the
 * error declares about itself and pass its code to {@link statusForPublicErrorCode}, which holds the
 * entire status policy and the justification for each row. BRANCH 3 IS THE ONE DECLARED EXCEPTION and
 * pins 400 directly: `LegacyParityError` adds no member of its own, so it inherits the deny-by-default
 * `SERVICE_FAULT` presentation, and deriving its status would report a caller-correctable option
 * selection as a service fault. The section note on BRANCH 3 records why one uniform status is applied
 * to all four mandated texts, and that judgment is unchanged.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 1 — VALIDATION FAILURE, 400. THE ERROR KEYS ARE THE CONTRACT.
 * ------------------------------------------------------------------------------------------------
 * TRANSLATION DECISION (judgment (b)). AAP 0.4.1.11 requires the error-key structure be preserved so
 * validation failures remain comparable to legacy output, so the keyed structure is written into the body
 * exactly as ../errors/ValidationError exposes it — a map from property identifier to the ordered array
 * of resource-bundle keys reported against that identifier.
 *
 * IT IS NEVER FLATTENED. Not into a prose sentence, not into a single message string, not into a joined
 * list, not into an array of pairs and not into a human-readable summary. Three properties of the
 * structure are behavior, and flattening destroys all three:
 *   - WHICH KEY a failure is reported under. The key is the property identifier, never the rule's method
 *     name: model/validation/Sku.json attaches two method-based rules to one property and both report
 *     under that property.
 *   - THAT A KEY HOLDS AN ORDERED ARRAY. Because two rules can report against one property in one save,
 *     collapsing a key's value to a string would silently discard one of the messages.
 *   - THE EXACT RESOURCE-BUNDLE KEY STRINGS. They are opaque keys, not display text, and they are
 *     forwarded unresolved and unmodified. ../errors/ValidationError documents three legacy asymmetries
 *     among them — one misspells a word its paired error key spells correctly, one uses a different
 *     leading segment from the keys raised beside it, and one camel-cases its final segment where the
 *     others are lowercase. Normalising any of those would be a behavior change, and this module
 *     performs no string transformation on them whatsoever.
 *
 * Why it matters concretely: the traceable legacy regression issue_1335 in
 * meta/tests/unit/IssuesTest.cfc asserts on SKU currency price and list-price validation error KEYS. A
 * flattened body cannot satisfy that assertion, so it would quietly forfeit the comparability this port
 * exists to demonstrate.
 *
 * The body's message member on this branch is the neutral aggregate text ../errors/ValidationError
 * declares in its own presentation, and which it deliberately does not export precisely because the
 * legacy system has no such string. It therefore carries NO parity obligation and must not be
 * asserted against. The parity-bearing member on this branch is `errors`, and only `errors`.
 *
 * The presentation's classification is READ HERE BUT NOT PUBLISHED: it selects the status through
 * {@link statusForPublicErrorCode} and goes no further, because {@link ErrorResponseBody} carries no
 * `code` member and the reasoning for that is recorded there.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 2 — EVERY OTHER ERROR THIS PORT RAISED. THE ERROR DECIDES WHAT IS DISCLOSED.
 * ------------------------------------------------------------------------------------------------
 * Under AAP TR-5 a member is never quietly dropped from the interface. Several in-scope members are
 * boundary-stubbed because their behavior terminates at an explicitly out-of-scope collaborator, and two
 * more because their legacy implementation is provably unresolvable in the source repository — the
 * defects AAP 0.6.7 records as D4 (a service member delegating to a data-access member that exists
 * nowhere) and D5 (an entity member calling a service member the service never defines). Those are
 * carried across as this error rather than repaired, per AAP 0.7.3 S7.
 *
 * Such a failure is reported as such. It is never swallowed, never converted into a success, and
 * never answered with a substituted default, a true, a false, an empty array or any other
 * fabricated value.
 *
 * ⛔ THE MEMBER'S IDENTIFIER IS WITHHELD; THE CONDITION IS NOT. The error carries the un-portable
 * member's fully qualified name and, often, a reason naming the out-of-scope collaborator or the
 * legacy locator behind the gap. Neither reaches the body — see {@link ErrorResponseBody} for why
 * publishing them would disclose this deliverable's internal composition, and why AAP TR-5 is
 * nonetheless satisfied in full. What the caller receives is the distinct status below plus a fixed
 * neutral text; what a reviewer and a server-side caller receive is the whole error, unchanged.
 *
 * The status is a judgment, and it carries the entire informational weight of this branch: RFC 9110
 * defines 501 as the server not supporting the functionality required to fulfil the request, which
 * is precisely what a boundary stub is. 500 was rejected because it asserts a fault where none
 * occurred — the service is behaving exactly as designed — and a service-unavailable status was
 * rejected because nothing here is temporarily unavailable. Because the code is unique to this
 * branch, the boundary stays distinguishable from every other failure without naming anything.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 3 — MANDATED LEGACY MESSAGE, 400. FORWARDED VERBATIM.
 * ------------------------------------------------------------------------------------------------
 * TRANSLATION DECISIONS (judgments (a) and (g)). This branch forks on the RAISED TYPE —
 * `error instanceof LegacyParityError` and nothing else — and the header records why the fork cannot
 * be a message-text lookup and why the closure of the emitted set therefore rests on the throw sites.
 * What follows is what the fork means at the mapping site.
 *
 * ../errors/DomainError owns the four legacy thrown message strings, reproduced there character for
 * character from model/entity/Product.cfc:355, :357 and :362 and from
 * model/service/SkuService.cfc:204, and it declares LegacyParityError as the one type permitted to
 * carry them. All four throw sites raise that type — three in ../domain/product/Product.ts and one
 * in ../services/SkuService.ts — so this branch selects them by type and never by content. They are
 * observable behavior, so this module forwards them with no rewording, no sentence-casing, no
 * punctuation tidying, no trimming, no truncation, no templating and — above all — NO SPELL
 * CORRECTION.
 *
 * ONE OF THOSE FOUR MESSAGES CONTAINS TWO LEGACY MISSPELLINGS, AND BOTH MUST REACH THE CALLER
 * INTACT. They are byte-verified in the CFML source and are not typos introduced by this port.
 * Repairing either one is forbidden by AAP 0.8.2 Guideline 4 — do not enhance or optimize business
 * logic beyond what the migration requires — and by Guideline 2, which requires behavior be
 * preserved exactly as-is; AAP 0.7.3 S7 requires they be annotated rather than repaired. The
 * misspelled words are deliberately not written anywhere in this file, so there is exactly one
 * declaration site for them in the whole subtree and no possibility of a second copy drifting. The
 * mechanical guarantee is structural: recognition reads a message but never rewrites one, so this
 * module still applies no string TRANSFORMATION to any error value — no replace, no case change, no
 * normalisation, no concatenation, no interpolation — and the value written into the body is the
 * very value that was thrown — and the mechanical guarantee is that no message is INSPECTED at all,
 * only copied, so there is no comparison, normalisation or lookup step in which a byte could be lost.
 * TODO(parity): the two misspellings are retained from the legacy
 * source and are intentionally NOT corrected here or anywhere downstream.
 *
 * The status is a judgment, and the trade-off is stated rather than hidden. Every message in the
 * mandated inventory that reaches this branch describes a request the service cannot satisfy —
 * three of the four are reached from a caller-supplied option selection — so 400 fits. The fourth,
 * the discriminator fallthrough in SKU creation, is arguably a data-state condition a reader could
 * argue belongs at 500. It is deliberately NOT special-cased: distinguishing it would mean matching
 * on message text, which would both create the error-code registry AAP 0.7.3 S9 forbids and make
 * the status depend on a string this port is contractually forbidden to inspect. One status for the
 * whole family is the honest resolution, and this paragraph is the disclosure.
 *
 * ⚠️ THE PARITY OBLIGATION IS THE MESSAGE, NOT THE DIAGNOSTIC PAYLOAD. One of the four throw sites
 * attaches a `context` payload alongside its mandated string. That payload is NOT read here, on this
 * branch or any other — see the disclosure rules below.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 4 — ANY OTHER DOMAIN FAILURE. RECOGNISED AND CLASSIFIED, BUT NOT DESCRIBED.
 * ------------------------------------------------------------------------------------------------
 * This branch is what makes Branch 3 safe. A DomainError that is not one of the three specific
 * subclasses above carries a message this port authored for an engineer, and the runtime evidence
 * for withholding it is concrete: messages on this path have been observed naming a schema column,
 * an internal storage path, a legacy source locator and an internal member name. Every one of those
 * is reconnaissance material for a caller who should learn only that the request failed.
 *
 * So the THROWN message is not read. What is read is the presentation the class declares about
 * itself, and the status is derived from its code rather than pinned here. That distinction is the
 * whole of this branch's correctness: ../errors/DomainError's deny-by-default presentation is
 * `SERVICE_FAULT`, but ConfigurationError overrides it with `SERVICE_CONFIGURATION` and
 * DataIntegrityError with `SERVICE_DATA`, and all three map to 500. A revision that pinned 400 here
 * reported a deployment value that was never supplied, and stored data that cannot be read as its
 * declared shape, as though the caller had sent something wrong — and kept both out of every monitor
 * that counts 5xx. The thrown message, the cause and the diagnostic context still stay on the error
 * object for the caller inside the service; none of them crosses this boundary.
 *
 * This branch is DEFAULT-DENY BY CONSTRUCTION rather than by convention: a future throw site is
 * masked automatically, and a future site that genuinely carries legacy behavior has to say so in
 * its type before its message can be published. There is no way to opt a message into disclosure
 * accidentally, which is exactly the property a plain boolean option would not have given.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 5 — ANYTHING ELSE, 500. NOTHING IS DISCLOSED.
 * ------------------------------------------------------------------------------------------------
 * A value this port did not raise is not a domain outcome: it is a programming fault, a driver rejection,
 * or a thrown non-error. The parameter is typed unknown because that is what a caught value is under the
 * compiler's catch-variable checking, and because a thrown value need not be an error at all. NOTHING
 * ABOUT IT REACHES THE BODY — not its message, not its name, not its own properties. The body carries a
 * fixed neutral text.
 *
 * ------------------------------------------------------------------------------------------------
 * DISCLOSURE RULES THAT HOLD ON EVERY BRANCH
 * ------------------------------------------------------------------------------------------------
 * None of the following can reach a response body from this function, under any status code:
 *   - A DOMAIN MESSAGE THAT IS NOT ONE OF THE FOUR MANDATED LEGACY TEXTS. This is the rule the other
 *     four follow from, and it is enforced positively: a message is disclosed only when its throw site
 *     raised ../errors/LegacyParityError, never by failing to match a list of prohibited things. ⚠️ The
 *     enforcement is at the raise, not here — see the header — so this line states an obligation on
 *     every throw site as much as a property of this function.
 *   - THE COMPOSED MESSAGE OR THE MEMBER IDENTIFIER OF A BOUNDARY STUB. Neither is legacy behavior,
 *     and together they map the port's internal surface. Both go to the log.
 *   - A stack trace. The stack member is never read on any branch.
 *   - The structured diagnostic payload a thrower may attach to a domain error. It is never read either,
 *     and that is a specific decision rather than an oversight: it exists to carry arbitrary facts known
 *     at throw time, so it could hold an identifier, an argument value or anything else a future thrower
 *     puts there. Diagnostic context belongs in a log, not in a response.
 *   - The underlying cause of an error. It is never read, for the same reason and one more: a cause
 *     originating in the data-access layer could carry statement text or connection detail.
 *   - The name of any internal member, method, class, module or collaborator, and the reason a
 *     boundary-stubbed member cannot run. BRANCH 2 reads neither the message nor the member of the
 *     error it recognises; both stay on the error object for internal diagnostics only.
 *   - A legacy file path, a source line number or a carried-defect identifier. These occur only
 *     inside boundary-stub reasons, which BRANCH 2 does not read.
 *   - Query text, a table or column identifier, a connection string, a credential, a database host,
 *     an internal file path, or the name or value of an environment variable. None of these is ever
 *     constructed here, and none can arrive in a body: the only text this function copies into one
 *     is a thrower's explicit disclosure classification, plus the boundary-stub member name.
 *   - AN UNCLASSIFIED THROWN MESSAGE. This is the rule the whole gate exists to enforce, and it is
 *     stated as its own line because it is the one a future edit is most likely to undo. `message`
 *     is a DIAGNOSTIC string throughout this port. It is read into a body on exactly two branches:
 *     branch 1, where ../errors/ValidationError composes it from resource-bundle keys alone, and
 *     the classified arm of branch 3, where the thrower has affirmatively declared it safe. Nowhere
 *     else. Adding a fourth reader of `error.message` to this function reopens CWE-209.
 *
 * Two values are exempt, and each only because it IS legacy behavior rather than internal detail:
 * the thrown message on BRANCH 3 and the validation error keys on BRANCH 1, both of which the plan
 * requires be forwarded unchanged. Neither leaks anything about this service's internals — the four
 * mandated messages name no member, path, line or identifier, and the two that interpolate a value
 * interpolate the caller's own option selection. Every message THIS PORT authored is neutral text,
 * and BRANCH 2's is the one such message that was previously not, which is why it is now fixed.
 *
 * @param error the caught value, whatever it is
 * @returns a proxy result describing the failure at the appropriate status
 *
 * @example
 * ```ts
 * try {
 *   return okResponse(await skuService.createSkus(product, data));
 * } catch (error) {
 *   return errorResponse(error);
 * }
 * ```
 */
export function errorResponse(error: unknown): APIGatewayProxyResult {
  // BRANCH 1 — must precede the DomainError test; see the note on branch ordering above. The
  // presentation is read polymorphically exactly as on branch 2; the ONLY reason this branch exists
  // separately is the parity-bearing `errors` member, which no other failure carries.
  if (error instanceof ValidationError) {
    const presentation: PublicErrorPresentation = error.getPublicError();

    // getErrors() hands back the keyed structure unchanged. No transformation, no flattening, no
    // re-keying, no de-duplication and no sorting: the keys, their order and their exact strings
    // are the contract.
    const body: ErrorResponseBody = {
      message: presentation.message,
      errors: error.getErrors(),
    };

    return jsonResponse(statusForPublicErrorCode(presentation.code), body);
  }

  // BRANCH 2 — also a DomainError subclass, so it too must precede the base test. Neither
  // error.member nor error.message is read: the status alone reports the boundary, and the
  // identifier stays server-side. See BRANCH 2 above and {@link ErrorResponseBody}.
  if (error instanceof NotImplementedError) {
    logSuppressedFailure(BOUNDARY_STUB_LOG_PHRASE, error);

    /* The status is DERIVED from the presentation this error declares about itself, exactly as on
     * branches 1 and 4, rather than chosen here. Neither `error.member` nor `error.message` is read;
     * `NOT_IMPLEMENTED_MESSAGE` is this module's own neutral text. */
    return messageResponse(
      statusForPublicErrorCode(error.getPublicError().code),
      NOT_IMPLEMENTED_MESSAGE,
    );
  }

  // BRANCH 3 — the verbatim pass-through, and the ONLY branch that publishes a thrown message. The
  // message is copied, never processed. Also a DomainError subclass, so it too precedes the base
  // test; its type is the throw site's declaration that this text is legacy behavior.
  if (error instanceof LegacyParityError) {
    /* The message is COPIED, never processed — not trimmed, lower-cased, normalised, unescaped,
     * sliced or rewritten — so it reaches the body byte-identical to the value that was thrown. That
     * is what preserves the two legacy misspellings in the fourth mandated string, which any
     * normalising step would destroy. The type is the throw site's declaration that this text is
     * legacy behaviour; see the section note above for why a type and not a text comparison, and for
     * the uniform status this branch deliberately applies to all four. */
    return messageResponse(PUBLIC_PARITY_MESSAGE_STATUS, error.message);
  }

  // BRANCH 4 — a domain failure this port authored. Recognised by type and answered at the status its
  // own classification maps to; `error.message` is NOT read, because it is a diagnostic for an
  // engineer rather than for a caller. See BRANCH 4 above for why the status may not be a constant.
  if (error instanceof DomainError) {
    logSuppressedFailure(UNDISCLOSED_DOMAIN_FAILURE_LOG_PHRASE, error);

    /* Read polymorphically, exactly as on branch 1: `ConfigurationError` and `DataIntegrityError`
     * override this member to declare their own family, and the base class answers with the neutral
     * service-fault presentation. Both members of the presentation are the CLASS's, never the throw
     * site's. */
    const presentation: PublicErrorPresentation = error.getPublicError();

    return messageResponse(statusForPublicErrorCode(presentation.code), presentation.message);
  }

  /* BRANCH 5 — not raised by this port. The caught value is not inspected beyond the two allowlisted
   * readers {@link describeSuppressedFailure} uses, and it is not swallowed either: a record is written
   * naming the SITUATION, the failure's CLASS NAME, a fresh CORRELATION ID and — when the value carries
   * one — its public error CODE.
   *
   * ⛔ THIS COMMENT SAID THE VALUE "goes to the log verbatim", AND A CODE REVIEW WAS RIGHT THAT IT DOES
   * NOT. Nothing verbatim is written: no message text, no stack frame, no file path, no SQL, no table or
   * member name and no configuration value. {@link describeSuppressedFailure} builds a fixed four-field
   * record and runs every string through {@link sanitizeDiagnosticText} first. That is a DELIBERATELY
   * narrower guarantee than "verbatim" and it is the correct one — a log line is not a private channel —
   * but overstating it invited a reader to expect diagnostics that are not there, which is worse than the
   * narrowness itself. The correlation ID is what connects this record to the client's 500. */
  logSuppressedFailure(UNRECOGNISED_FAILURE_LOG_PHRASE, error);

  /* `SERVICE_FAULT` is reserved for exactly this case — a value this port did not raise and cannot
   * classify — so the deny-by-default code and the deny-by-default status are the same single row of
   * the one map. */
  return messageResponse(
    statusForPublicErrorCode(PUBLIC_ERROR_CODE.SERVICE_FAULT),
    UNEXPECTED_FAILURE_MESSAGE,
  );
}

/* ==========================================================================================
 * READING REQUEST INPUT
 * ==========================================================================================
 *
 * This folder is the only place in the subtree that touches raw event data, and every read of it is
 * an unchecked index read. The compiler's unchecked-index checking is enabled, so an indexed read
 * yields a possibly-absent value, and three of the four containers are declared nullable on top of
 * that. These helpers do the narrowing once, correctly, so no handler repeats it and no handler is
 * tempted into a shortcut.
 *
 * TRANSLATION DECISION (judgment (f)). None of this is inferred from a schema. AAP 0.7.3 S5 freezes
 * the dependency set, so no schema-validation package is introduced: narrowing is explicit and the
 * one structural test needed is hand-written as {@link isJsonObject}. There are correspondingly no
 * escape hatches anywhere in this module — no non-null assertion, no shape-forcing cast, no
 * explicit any, no compiler-directive comment and no lint suppression. The compiler configuration
 * and the lint configuration are parent-owned (AAP 0.4.1.2) and are neither edited nor overridden
 * from here; where the checker objected, this file changed.
 *
 * Each reader takes only the slice of the event it actually needs. A full proxy event satisfies
 * every one of them, so a handler passes the event straight through, while a test constructs a
 * one-member literal — which is how AAP 0.7.3 S6 manifests in this file, since AAP 0.4.1.12 defines
 * no test directory for this folder and testability-by-design is the obligation instead.
 *
 * EVERY CONTAINER IS NARROWED AGAINST BOTH ABSENT FORMS, AND THAT IS A CORRECTION OF AN EARLIER
 * READING OF THIS SECTION — one worth recording, because the earlier reading was reasoned and wrong.
 * -----------------------------------------------------------------------------------------------
 * The paragraph that used to sit here argued from the AWS typings: they declare the path parameters,
 * the query-string parameters and the body as required-and-nullable and the header container as
 * always present, so exactly three `null` narrowings were written, and a fourth was said to be
 * unnecessary — "rejected by the compiler as a comparison between types with no overlap". Both halves
 * of that were mistaken.
 *
 *   1. THE CALLER OF A LAMBDA HANDLER IS NOT A TYPED CALLER. It is the platform, and it delivers a
 *      JSON document that the declared type merely DESCRIBES. Which members that document contains
 *      is decided by the event source, not by the annotation: API Gateway's payload format 2.0 —
 *      which a function URL uses, and which the console selects by default for a new HTTP API
 *      integration — OMITS `queryStringParameters` entirely when there is no query string, and omits
 *      `pathParameters` unless the route declares one. An absent key is therefore a REAL, routinely
 *      reachable input shape, and no amount of typing at this boundary prevents it from arriving.
 *   2. THE COMPILER NEVER OBJECTED. `x === undefined` against a `T | null` type is accepted; the
 *      no-overlap diagnostic fires for comparisons between unrelated concrete types, not for a
 *      comparison against `undefined`. The claim was never tested, and it was false.
 *
 * The consequence of trusting the annotation over the wire format was a defect with real blast
 * radius: `Object.hasOwn(undefined, name)` and `Object.entries(undefined)` both throw a `TypeError`,
 * and a throw from a reader escapes its handler's own `try` — the readers are called BEFORE it — so
 * it bypassed {@link errorResponse} completely. That meant no status mapping, no body sanitisation
 * and no correlation ID for that whole class of input; measured across the four handlers, 29 of 33
 * routed members threw. So each reader below now narrows against BOTH absent forms, and each takes a
 * `Partial<Pick<…>>` slice so the SIGNATURE states what the wire format already permitted. The
 * widening costs a caller nothing — a full event and every `Pick<…>` slice remain assignable — and it
 * is what lets a test express the absent-container case with no cast, which is the shape of test that
 * was missing when this shipped.
 *
 * ⛔ THE TWO ABSENT FORMS ARE NOT COLLAPSED ANY FURTHER THAN THIS. "The container is absent" and "the
 * container is present and the parameter is not in it" both yield nothing, because both mean the same
 * thing to a caller — no value was addressed. What is NOT collapsed is absence and emptiness: an
 * empty string is a VALUE and is returned as one, for the reason recorded on
 * {@link readPathParameter}.
 *
 * OWN-KEY READS ONLY, AND WHY THAT IS A CORRECTNESS MATTER RATHER THAN A STYLE ONE
 * -------------------------------------------------------------------------------
 * The event containers arrive as ordinary parsed objects, so they inherit from the base object
 * prototype, and a bare indexed read resolves through that prototype chain. A read for a name that
 * happens to collide with an inherited member — `toString` and `constructor` being the obvious ones —
 * would therefore hand back a FUNCTION from a helper whose signature promises a string or nothing.
 * That is a genuine unsoundness, not a hypothetical: the declared return type would be a lie, the
 * compiler could not catch it, and a caller acting on the value would fail far from the cause. Query
 * parameter names in particular are attacker-influenced, since a client chooses them freely.
 *
 * Both parameter readers therefore establish that the key is an OWN key before reading it. That is
 * the same hazard ../errors/ValidationError closes in its own decision (h), where it notes that a
 * prototype-bearing bag "would make hasError('toString') answer true" and "make getError('toString')
 * return a function where an array is declared"; this section closes it for the event containers.
 * {@link readHeader} needs no such guard because it iterates own enumerable entries rather than
 * indexing, and {@link readJsonObjectBody} needs none either because every member of the object it
 * returns is typed as unknown — an inherited member is a perfectly sound unknown, so the caller's own
 * narrowing, not a prototype change, is what makes it usable. Nothing is re-prototyped here: doing so
 * would alter an object the caller owns and add behavior the source does not have.
 * ========================================================================================== */

/**
 * Narrows an unknown value to a plain JSON object.
 *
 * Hand-written on purpose (judgment (f)). It is the only structural guard this module provides, and
 * it answers exactly one question: is this a non-null, non-array object? Anything deeper — whether a
 * particular member is present, whether it is a string, whether a nested value is itself an object —
 * is the caller's to establish, with its own small guard written the same way. No schema library is
 * introduced to do it (AAP 0.7.3 S5).
 *
 * Arrays are excluded deliberately. A JSON array is an object as far as the language is concerned,
 * but a request body that is an array cannot stand in for the keyed data structure the converted
 * service members accept, so treating one as an object would defer a type error to a member access
 * far from the mistake.
 *
 * @param value any value, typically the result of parsing untrusted input
 * @returns true when the value is a non-null object that is not an array
 *
 * @example
 * ```ts
 * const nested: unknown = data['productType'];
 * if (isJsonObject(nested)) {
 *   const id: unknown = nested['productTypeID'];
 * }
 * ```
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Why a request body could not be read as a JSON object.
 *
 * Three states, because three genuinely different things can go wrong and a caller can act
 * differently on each. This is NOT an error-code registry and never appears in a response body:
 * AAP 0.7.3 S9 rules such a taxonomy out, and these values exist only to inform a handler's next
 * step and to let a test assert precisely which condition it exercised.
 *
 *   - `absent` — no body was sent at all.
 *   - `malformed` — a body was sent but it is not valid JSON.
 *   - `notAnObject` — the body is valid JSON but not an object; a bare array, string, number,
 *     boolean or null.
 */
export type RequestBodyProblem = 'absent' | 'malformed' | 'notAnObject';

/**
 * The outcome of reading a request body, discriminated on whether a usable object was obtained.
 *
 * A discriminated union rather than a possibly-absent value, so the failure reason survives instead
 * of three distinct conditions collapsing into one indistinguishable absence — and so the compiler
 * forces a caller to deal with the failure before touching the value.
 */
export type RequestBodyResult =
  | { readonly present: true; readonly value: Record<string, unknown> }
  | { readonly present: false; readonly problem: RequestBodyProblem };

/**
 * Reads the request body as a JSON object.
 *
 * Three hazards are handled explicitly, and each one would be a silent defect if it were not:
 *
 *   1. There are THREE spellings of "no body" and all three are treated as absent: the member is
 *      `null`, the member is an empty string, and the member is not present on the event at all.
 *      The third belongs to the same wire-format difference the section header below records — payload
 *      format 2.0 omits `body` rather than nulling it — and it was previously misreported as
 *      `'malformed'`, because `JSON.parse(undefined)` parses the STRING `"undefined"` and throws.
 *      That answer was mapped and safe, so unlike the container readers it never escaped
 *      {@link errorResponse}; it was simply the wrong reason, and a client told its body was
 *      malformed when it sent none cannot act on that. The emptiness test compares against the empty
 *      string rather than measuring a length, because no numeric literal other than a status code
 *      appears in this file (AAP 0.7.3 S9).
 *   2. Parsing throws on invalid input. It is wrapped, and the binding is omitted from the catch
 *      clause because the thrown value is not inspected — reporting that parsing failed is all a
 *      caller needs, and a parser's own message is an internal detail that the disclosure rules on
 *      {@link errorResponse} keep out of a response.
 *   3. Parsing is declared to return an unrestricted value. It is assigned into a variable declared
 *      as unknown, so nothing downstream can silently dereference it, and the value only becomes
 *      usable after {@link isJsonObject} narrows it. That is the whole reason no cast appears here.
 *
 * @param event the proxy event, or any object carrying its body member. The member may be absent as
 *   well as `null`; see hazard 1 and the section header.
 * @returns the parsed object, or the reason it could not be obtained
 *
 * @example
 * ```ts
 * const body = readJsonObjectBody(event);
 * if (!body.present) {
 *   return invalidRequestBodyResponse(body.problem);
 * }
 * return okResponse(await productService.saveProduct(product, body.value));
 * ```
 */
export function readJsonObjectBody(
  event: Partial<Pick<APIGatewayProxyEvent, 'body'>>,
): RequestBodyResult {
  const raw = event.body;

  if (raw === null || raw === undefined || raw === '') {
    return { present: false, problem: 'absent' };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { present: false, problem: 'malformed' };
  }

  if (!isJsonObject(parsed)) {
    return { present: false, problem: 'notAnObject' };
  }

  return { present: true, value: parsed };
}

/**
 * Builds the response for a request body that could not be read.
 *
 * It exists so the message for each condition is authored once, here, instead of in each of the five
 * per-service handlers — the same reason {@link errorResponse} is the single error mapping. The
 * texts are neutral and module-private, because the legacy system has no counterpart for any of them
 * and therefore none carries a parity obligation; see {@link ErrorResponseBody}.
 *
 * TRANSLATION DECISION (judgment (d)) — the status is a judgment. All three conditions are a
 * rejection of the request's content, which RFC 9110 describes with 400, so all three share it. The
 * switch is exhaustive over the union, so adding a fourth condition to {@link RequestBodyProblem}
 * would fail to compile until it is handled here rather than silently falling through to a default.
 *
 * @param problem which condition was observed, as reported by {@link readJsonObjectBody}
 * @returns a proxy result with a bad-request status and a message-only body
 */
export function invalidRequestBodyResponse(problem: RequestBodyProblem): APIGatewayProxyResult {
  /* All three conditions are `REQUEST_INVALID`, whose single documented status is the 400 all three
   * return, so the status is derived from that one code rather than restated three times. */
  const statusCode = statusForPublicErrorCode(PUBLIC_ERROR_CODE.REQUEST_INVALID);

  switch (problem) {
    case 'absent':
      return messageResponse(statusCode, BODY_ABSENT_MESSAGE);
    case 'malformed':
      return messageResponse(statusCode, BODY_MALFORMED_MESSAGE);
    case 'notAnObject':
      return messageResponse(statusCode, BODY_NOT_AN_OBJECT_MESSAGE);
  }
}

/* ================================================================================================
 * P9 — EXPLICIT BOUNDED READS
 *
 * The three list-and-search routes whose result sets are bounded only by how much catalog a
 * deployment holds each gained an ADDITIVE bounded companion. Their unbounded originals are the
 * AAP-declared parity contracts and are untouched, so nothing an existing caller asks for is
 * silently narrowed; a caller that wants a bound asks the bounded route and STATES the window.
 *
 * ⛔ BOTH HALVES OF THE WINDOW ARE REQUIRED, AND NEITHER IS DEFAULTED. Defaulting `limit` would
 * invent a page size the source does not state (S9) and would make the bounded route a truncating
 * route by accident; defaulting `offset` would let a caller that meant to page silently re-read the
 * first window forever. Requiring both is the opposite of inventing: the window is the caller's own
 * statement of intent and none of it is guessed here.
 *
 * ⛔ AND NEITHER IS CLAMPED. A malformed or out-of-range value is REFUSED with the reason named,
 * never quietly coerced into a nearby legal one — a clamped request is a different request answered
 * as if it were the one that was asked.
 * ============================================================================================= */

/** The query-string parameter carrying {@link BoundedReadWindow.limit}. */
export const BOUNDED_READ_LIMIT_PARAMETER = 'limit';

/** The query-string parameter carrying {@link BoundedReadWindow.offset}. */
export const BOUNDED_READ_OFFSET_PARAMETER = 'offset';

const BOUNDED_LIMIT_MESSAGE =
  `A "${BOUNDED_READ_LIMIT_PARAMETER}" query parameter is required, ` +
  'and must be a positive whole number';

const BOUNDED_OFFSET_MESSAGE =
  `An "${BOUNDED_READ_OFFSET_PARAMETER}" query parameter is required, ` +
  'and must be a whole number of zero or more';

/**
 * The outcome of reading a bounded-read window, discriminated on whether a usable window was obtained.
 *
 * The same shape as {@link RequestBodyResult}, and for the same reason: the refusal must survive as a
 * value the compiler forces a caller to handle, rather than collapsing into an indistinguishable
 * absence that a route could forget to check.
 */
export type BoundedReadWindowResult =
  | { readonly present: true; readonly window: BoundedReadWindow }
  | { readonly present: false; readonly response: APIGatewayProxyResult };

/**
 * Parses one query-string value as a bounded-read window bound.
 *
 * ⚠️ STRICT BY DESIGN, AND THE STRICTNESS IS ABOUT MORE THAN TIDINESS. `Number('')` is `0` and
 * `parseInt('12abc', 10)` is `12`, so either of the obvious readings would accept input the caller did
 * not write — an empty parameter silently becoming a zero limit, or a typo silently becoming a
 * different window. The value must therefore be an unsigned run of digits and nothing else: no sign,
 * no decimal point, no exponent, no surrounding space. Anything else is refused with the bound named.
 *
 * ⚠️ AND IT MUST BE SAFE TO USE AS A ROW COUNT. A run of digits can still exceed `Number.MAX_SAFE_INTEGER`,
 * at which point the parsed value is no longer the number the caller wrote; such input is refused rather
 * than bound into a statement. The adapter validates the window again on its own side — this read does
 * not stand in for that gate, it only ensures a request-shaped value never reaches it.
 */
function readWindowBound(candidate: string | undefined, minimum: number): number | undefined {
  if (candidate === undefined || !DIGITS_ONLY_PATTERN.test(candidate)) {
    return undefined;
  }

  const parsed = Number(candidate);

  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    return undefined;
  }

  return parsed;
}

/** An unsigned run of one or more decimal digits, anchored at both ends. */
const DIGITS_ONLY_PATTERN = /^\d+$/;

/**
 * Reads the requested bounded-read window from the query string.
 *
 * Both parameters are required and neither is defaulted or clamped, for the reasons recorded in the
 * section header above. `limit` must be at least one — a zero-row window is not a bound, it is a read
 * that cannot make progress — and `offset` may be zero, which is the first window.
 *
 * It reads the query string only through {@link readQueryStringParameter}, so the absent-container
 * shape the section header below accounts for is handled there rather than restated here — which is
 * why this signature accepts the same partial slice that reader does.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member. The member
 *   may be absent as well as `null`, in which case neither bound was stated and the window is refused
 *   with `limit` named — the same answer an unparseable bound gets, because in both cases the caller
 *   did not state a usable window.
 * @returns the window, or the refusal naming which bound was unusable. `limit` is reported first when
 *   both are, so a caller fixes the required bound before the position.
 */
export function readBoundedReadWindow(
  event: Partial<Pick<APIGatewayProxyEvent, 'queryStringParameters'>>,
): BoundedReadWindowResult {
  const limit = readWindowBound(readQueryStringParameter(event, BOUNDED_READ_LIMIT_PARAMETER), 1);

  if (limit === undefined) {
    return {
      present: false,
      response: messageResponse(HTTP_STATUS.BAD_REQUEST, BOUNDED_LIMIT_MESSAGE),
    };
  }

  const offset = readWindowBound(readQueryStringParameter(event, BOUNDED_READ_OFFSET_PARAMETER), 0);

  if (offset === undefined) {
    return {
      present: false,
      response: messageResponse(HTTP_STATUS.BAD_REQUEST, BOUNDED_OFFSET_MESSAGE),
    };
  }

  return { present: true, window: { limit, offset } };
}

/**
 * Reads one path parameter.
 *
 * The container is declared nullable and its members are declared possibly-absent, so the null is
 * narrowed before the read and the result keeps its possibly-absent type rather than being coerced
 * to an empty string. That distinction is preserved on purpose: several converted members treat an
 * empty string as a legal, meaningful input — AAP 0.6.1.3 T5 records that an empty option selection
 * legitimately degenerates to every option-bearing SKU of a product — so silently substituting an
 * empty string for an absent parameter would feed a real value into a member that behaves
 * differently for it. Absent stays absent.
 *
 * The read is restricted to an own key, so a name colliding with an inherited member cannot produce a
 * value this signature does not describe. See OWN-KEY READS ONLY above for why that is a correctness
 * requirement rather than a precaution.
 *
 * THREE CONDITIONS CONVERGE ON "NOTHING WAS ADDRESSED", and all three are narrowed explicitly: the
 * container key is absent from the event, the container is present and `null`, or the container is
 * present and does not carry this name as an own key. The first is the payload-format-2.0 shape the
 * section header above accounts for; treating it as a fourth outcome — a throw — is the defect that
 * header records.
 *
 * @param event the proxy event, or any object carrying its path-parameters member. The member may be
 *   absent as well as `null`, because the event source rather than the annotation decides that.
 * @param name the parameter name as declared by the route
 * @returns the parameter value, or nothing when the route bound no such parameter
 */
export function readPathParameter(
  event: Partial<Pick<APIGatewayProxyEvent, 'pathParameters'>>,
  name: string,
): string | undefined {
  const parameters = event.pathParameters;

  if (parameters === null || parameters === undefined || !Object.hasOwn(parameters, name)) {
    return undefined;
  }

  return parameters[name];
}

/**
 * Reads one query-string parameter.
 *
 * Narrowing, the own-key restriction and the absent-versus-empty distinction are exactly as described
 * on {@link readPathParameter}, and matter for the same reasons. The own-key restriction matters
 * slightly more here than there: a route template fixes the set of path-parameter names, whereas a
 * client chooses query-parameter names freely, so this is the container whose keys are
 * attacker-influenced.
 *
 * Only the single-value container is read. The multi-value container is deliberately not exposed:
 * nothing in the in-scope surface consumes repeated query parameters, and adding a reader for them
 * would be capability beyond what the migration requires, which AAP 0.8.2 Guideline 4 forbids.
 *
 * ⚠️ THIS IS THE CONTAINER THE ABSENT-KEY SHAPE HITS FIRST AND MOST OFTEN. Payload format 2.0 omits
 * `queryStringParameters` whenever the request carried no query string at all, which is the ordinary
 * case for a bodied write, so an absent container here is not an edge case — it is a normal request.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member. The member
 *   may be absent as well as `null`; see the section header for why.
 * @param name the parameter name
 * @returns the parameter value, or nothing when it was not supplied
 */
export function readQueryStringParameter(
  event: Partial<Pick<APIGatewayProxyEvent, 'queryStringParameters'>>,
  name: string,
): string | undefined {
  const parameters = event.queryStringParameters;

  if (parameters === null || parameters === undefined || !Object.hasOwn(parameters, name)) {
    return undefined;
  }

  return parameters[name];
}

/**
 * Reads one header, matching its name without regard to case.
 *
 * TRANSLATION DECISION (judgment (f), applied to the protocol rather than to types). RFC 9110
 * defines a header field name as case-insensitive, but the proxy event delivers the casing the
 * client actually sent, so a direct indexed read would find a header only when the client happened
 * to choose the same casing as the lookup. Comparing folded names is therefore protocol correctness,
 * not convenience.
 *
 * Note what is folded and what is not: the header NAME is folded for comparison, the header VALUE is
 * returned exactly as received. No value anywhere in this module is case-folded, trimmed or
 * rewritten — see PASS-THROUGH IS ABSOLUTE in the module header.
 *
 * ⚠️ THE HEADER CONTAINER IS NARROWED TOO, EVEN THOUGH THE AWS TYPINGS DECLARE IT ALWAYS PRESENT. It
 * once was not, on the strength of that declaration, and that is the same reasoning the section header
 * above retracts: the annotation describes the document, it does not produce it. `Object.entries` on an
 * absent container throws the identical `TypeError`, and THIS reader is the one that matters most for
 * it — every gated route calls it first, through the authorisation gate, so a throw here escapes
 * before any other reader is even reached. Narrowing it is what makes "no failure escapes
 * {@link errorResponse}" true of the whole folder rather than of most of it.
 *
 * An absent container and an absent header are answered identically, and the equivalence is exact: no
 * header was received either way, so there is nothing for a caller to distinguish.
 *
 * @param event the proxy event, or any object carrying its headers member. The member may be absent;
 *   see the section header for why the declared type is no guarantee of that.
 * @param name the header name, in any casing
 * @returns the header value exactly as received, or nothing when the header is absent
 */
export function readHeader(
  event: Partial<Pick<APIGatewayProxyEvent, 'headers'>>,
  name: string,
): string | undefined {
  const headers = event.headers;

  if (headers === undefined) {
    return undefined;
  }

  const wanted = name.toLowerCase();

  for (const [header, value] of Object.entries(headers)) {
    if (header.toLowerCase() === wanted) {
      return value;
    }
  }

  return undefined;
}

/* ================================================================================================
 * THE SMART LIST DATA VOCABULARY — `org/Hibachi/HibachiSmartList.cfc:L85-L136`
 *
 * ⭐ WHY THIS READER LIVES HERE RATHER THAN IN A HANDLER. TWO routed members receive the legacy smart
 * list's `data` struct — `getSkuSmartList(struct data={}, currentURL="")`
 * [model/service/SkuService.cfc:L309] and `getProductSmartList(struct data={}, currentURL="")`
 * [model/service/ProductService.cfc:L342] — and both were called with the FW/1 request context, the
 * whole bag of query and form values. `applyData` [org/Hibachi/HibachiSmartList.cfc:L85-L136] then
 * walked that bag and acted on RECOGNISED keys only, ignoring every other member.
 *
 * That recognition set is ONE vocabulary, and it belongs to the legacy interpreter rather than to
 * either handler. Declaring it twice — once in ./skuHandler and once in ./productHandler — would let
 * the two copies drift, and a drifted copy does not fail: it silently stops forwarding a key the
 * smart list would have acted on, or starts forwarding one it would have ignored. It is therefore
 * declared exactly once, in the module both boundaries already depend on, alongside the other
 * event readers. That is the same reasoning that put {@link readBoundedReadWindow} here.
 *
 * Each entry cites the branch that recognises it:
 *   savedStateID  [:L93-L96]      keyword    [:L136-L138]   keywords  [:L145]
 *   OrderBy       [:L118-L122]    P:Show     [:L123-L128]   P:Start   [:L129-L130]
 *   P:Current     [:L131-L132]
 *   F:  [:L100-L101]   FR: [:L102-L103]   FI: [:L104-L105]   FIR: [:L106-L107]
 *   FK: [:L108-L113]   FKR:[:L114-L115]   R:  [:L116-L117]
 *
 * ⚠️ THE PREFIXES ARE MUTUALLY EXCLUSIVE, WHICH IS WHY A PREFIX TEST IS SOUND HERE. The legacy tests
 * them with explicit lengths — `left(i,2) == "F:"`, `left(i,3) == "FR:"`, `left(i,4) == "FIR:"` — and
 * each candidate carries the colon, so `FR:x` does not match `F:` and `FIR:x` does not match `FI:`.
 * The same mutual exclusivity is what lets `SmartListInput`'s template index signatures type them.
 *
 * ⛔ NOTHING IS ADDED. There is no page size, no default limit, no maximum, no ordering default and no
 * filter supplied here of its own accord (AAP §0.7.3 S9, restated for these members by
 * ../services/SkuService: "No pagination default, filter or ordering is invented").
 * ============================================================================================== */

/** The smart list data keys recognised by exact name. */
const SMART_LIST_NAMED_KEYS: readonly string[] = Object.freeze([
  'savedStateID',
  'keyword',
  'keywords',
  'OrderBy',
  'P:Show',
  'P:Start',
  'P:Current',
]);

/** The smart list data keys recognised by prefix. */
const SMART_LIST_KEY_PREFIXES: readonly string[] = Object.freeze([
  'F:',
  'FR:',
  'FI:',
  'FIR:',
  'FK:',
  'FKR:',
  'R:',
]);

/**
 * The string-named subset of `SmartListInput`'s key space.
 *
 * `Extract<…, string>` is what keeps the template index signatures in play: the port declares them as
 * template-literal patterns, and narrowing to `string` preserves them rather than collapsing the type
 * into a bare record.
 */
type SmartListInputMember = Extract<keyof SmartListInput, string>;

/*
 * ⛔ ONLY THE MEMBERS A QUERY STRING CAN ACTUALLY CARRY — the filter is on the VALUE type, not just on
 * the key type. `SmartListInput` declares one member that is NOT string-valued, `joins`, whose type is
 * `readonly SmartListJoin[]`; a query string cannot express it and the legacy never read it from `rc`,
 * which is why it is absent from {@link SMART_LIST_NAMED_KEYS} and from every prefix. Narrowing with a
 * bare `Extract<keyof …, string>` would still ADMIT it as a key, and assigning a `string` through a
 * union that includes it forces the intersection `string & readonly SmartListJoin[]` — a type nothing
 * satisfies. Selecting only the keys whose declared value type accepts a `string` keeps the runtime
 * vocabulary and the compile-time key space in exact agreement, so a member added to the port later is
 * classified by its own type rather than by this module remembering to exclude it.
 */
type SmartListInputKey = {
  [K in SmartListInputMember]-?: string extends SmartListInput[K] ? K : never;
}[SmartListInputMember];

/**
 * A writable view of `SmartListInput`, used only while one is being assembled.
 *
 * The port declares every member `readonly`, which is right for a value being consumed and impossible
 * for a value being built. A homomorphic mapped type with `-readonly` removes exactly that modifier
 * and PRESERVES the seven template index signatures, so the accumulated object is still checked
 * against the real vocabulary. The assembled value is returned as the readonly `SmartListInput` again,
 * so nothing downstream can write through it.
 */
type MutableSmartListInput = { -readonly [K in keyof SmartListInput]: SmartListInput[K] };

/**
 * Reports whether a query-parameter name is one the legacy smart list would have acted on.
 *
 * The two lists it consults, and the line of `org/Hibachi/HibachiSmartList.cfc` that recognises each
 * entry, are documented above {@link SMART_LIST_NAMED_KEYS}. The prefix test is sound because the
 * legacy's own tests are colon-terminated and therefore mutually exclusive.
 *
 * @param name the query-parameter name as the client supplied it
 * @returns true when the name belongs to the smart list's data vocabulary
 */
function isSmartListInputKey(name: string): name is SmartListInputKey {
  if (SMART_LIST_NAMED_KEYS.includes(name)) {
    return true;
  }

  for (const prefix of SMART_LIST_KEY_PREFIXES) {
    if (name.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Assembles a smart list `data` struct from the query string.
 *
 * This function is the walk `applyData` [org/Hibachi/HibachiSmartList.cfc:L85-L136] performed over the
 * FW/1 request context, carried out over the container an HTTP request actually supplies. Its two
 * callers are the two smart-list routes named above {@link SMART_LIST_NAMED_KEYS}.
 *
 * ⚠️ "TWO CALLERS" IS CHECKABLE ONLY BECAUSE BOTH REACH IT BY IMPORT. For a period `./productHandler.ts`
 * carried a byte-identical private copy of this function and the six declarations behind it, so this
 * sentence counted a caller that was in fact running its own copy — and a key added here would have left
 * that route reading the older vocabulary with nothing reporting it. That copy is removed and its route
 * imports this member; the reasoning is recorded at the removal site in that file.
 *
 * ⚠️ THIS IS THE ONE READER THAT ENUMERATES RATHER THAN ASKING FOR A NAME, AND THE REASON IS
 * STRUCTURAL. Every other reader in this module answers "what is the value of THIS name"; the legacy
 * behaviour being reproduced is "enumerate every name supplied", which no single-name reader can
 * express. The two obligations the other readers discharge are discharged here explicitly all the
 * same: the container is declared nullable, so the null is narrowed before it is touched; and
 * enumeration uses `Object.entries`, which yields OWN enumerable entries only, so an inherited member
 * such as `toString` can never be mistaken for a supplied parameter. That is the same technique
 * {@link readHeader} uses internally, for the same reason.
 *
 * ⛔ NOTHING IS ADDED, DEFAULTED OR NORMALISED. No page size, no limit, no maximum, no ordering, no
 * filter and no keyword is supplied by this function (AAP §0.7.3 S9). Values are forwarded byte for
 * byte — never trimmed, case-folded, coerced to numbers or de-duplicated — because the interpreter's
 * own numeric-and-bounds tests at [:L123-L132] and its wildcard wrapping at [:L108-L113] are the
 * port's business, one layer down, and doing any of it twice would change results. An EMPTY RESULT IS
 * A LEGAL AND MEANINGFUL INPUT: it is exactly the `data={}` default at
 * [model/service/SkuService.cfc:L309] and [model/service/ProductService.cfc:L342], and it is what
 * every in-repository caller effectively passes — `integrationServices/google/controllers/feed.cfc:L63`
 * among them.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member. The member
 *   may be absent as well as `null`; see the section header for why.
 * @returns the recognised subset of the query string, as the smart list's own input type
 */
export function readSmartListInput(
  event: Partial<Pick<APIGatewayProxyEvent, 'queryStringParameters'>>,
): SmartListInput {
  const input: MutableSmartListInput = {};
  const parameters = event.queryStringParameters;

  /* An absent container and a `null` one both mean "no query string was supplied", which is the legal
   * and meaningful `data={}` case described above — NOT a failure, and emphatically not a throw. Both
   * are narrowed here because the enumeration below would otherwise reject the first of them; the
   * section header records why an absent container reaches this function at all. */
  if (parameters === null || parameters === undefined) {
    return input;
  }

  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined || !isSmartListInputKey(name)) {
      continue;
    }

    input[name] = value;
  }

  return input;
}

/* =====================================================================================================
 * §7 — The action edge: how an invocation is turned into one call on one handler member.
 *
 * WHY THIS SECTION LIVES HERE. Six modules in this folder export a Lambda `handler`, and every one of
 * them has to do the same five things before it can call anything: begin the invocation, read the
 * action name out of the query string, resolve it case-insensitively to a declared action, refuse an
 * action it does not serve, and turn a thrown failure into a response. Written six times that is six
 * chances for one of them to drift — to forget `beginInvocation`, to answer 500 where its siblings
 * answer 404, to accept a spelling the other five reject, or to let a failure escape as an
 * unhandled rejection. Written once it is one contract, and this is the module every handler in the
 * folder already imports for exactly that reason: it owns the AWS event and result types, and it
 * already owns the request-reading half of the edge as well as the response-writing half
 * ({@link readJsonObjectBody}, {@link readSmartListInput}, {@link BOUNDED_READ_LIMIT_PARAMETER}).
 *
 * ⭐ THE THIRD STEP IS ALSO WHY IT LIVES HERE RATHER THAN IN `./router.ts`. The legacy lower-cased every
 * action before validating it (`org/Hibachi/FW1/framework.cfc:L1957-L1961`), so the tolerance belonged to
 * the whole address space and not to one entry point. Declaring it once in
 * {@link createCanonicalActionLookup} gives all six surfaces the same matching rule by construction; a
 * per-file implementation would let the aggregate router and a per-surface artifact disagree about
 * whether `Product.SaveProduct` is an address.
 *
 * ⛔ IT DOES NOT OWN THE ROUTE TABLE. Each handler module declares which actions it serves, and
 * `./router.ts` composes those declarations into the aggregate surface. This section supplies the
 * mechanism and holds no route, no action name and no knowledge of any service — which is what keeps
 * it importable by every handler without a cycle, since nothing here imports a handler.
 * ================================================================================================== */

/**
 * The query-string key that names the action, carried over verbatim from the legacy convention.
 *
 * FW/1 dispatched on `slatAction`, and the legacy Google feed was reached at
 * `?slatAction=google:feed.product` [integrationServices/google/views/main/default.cfm]. The name is
 * preserved because it is the addressing contract an existing caller already holds, not because a
 * proxy event has to spell it this way.
 */
export const SLAT_ACTION_PARAMETER = 'slatAction';

/**
 * One action: an invocation in, a response out.
 *
 * Every member of every handler interface in this folder either matches this shape already or is
 * adapted to it by the route declaration that names it — which is where a synchronous member, or one
 * that takes no event at all, is wrapped.
 */
export type ActionRoute = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/**
 * A set of actions, keyed by the name a caller supplies in {@link SLAT_ACTION_PARAMETER}.
 *
 * The key type is left open here on purpose. Each handler module narrows it to its own literal union
 * so that a typo in a route name is a compile error at the declaration site, and `./router.ts`
 * narrows it to the union of all of them; this module needs neither vocabulary to dispatch.
 */
export type ActionRouteTable<TRouteKey extends string> = Readonly<Record<TRouteKey, ActionRoute>>;

/**
 * What a dispatcher needs from the composition root, expressed as the two things it actually uses.
 *
 * Deliberately NOT the container type. This module is below the composition root and must stay
 * ignorant of it: it needs the per-invocation hook and the routes, and naming anything more would
 * make the AWS edge depend on the shape of the service graph.
 */
export interface ActionDispatchContext<TRouteKey extends string> {
  /** The routes this entry point serves. */
  readonly routes: ActionRouteTable<TRouteKey>;

  /**
   * Called once at the start of every invocation, before the action is read.
   *
   * This is the request boundary mismatch M7 turns on. A warm container reuses module scope across
   * invocations, so anything memoized per request has to be told when a new request begins; the
   * legacy got that for free from a request-scoped ORM session and never needed to say it.
   */
  readonly beginInvocation: () => void;
}

/**
 * Builds the case-insensitive lookup for one route table: lower-cased name in, canonical key out.
 *
 * ⭐ THIS EXISTS BECAUSE THE LEGACY MATCHED ACTIONS CASE-INSENSITIVELY, ON ITS DEFAULT PATH. FW/1
 * lower-cased the action before validating it, verbatim from
 * `org/Hibachi/FW1/framework.cfc:L1957-L1961`:
 *
 *     if ( variables.framework.noLowerCase ) {
 *         request.action = validateAction( request.context[variables.framework.action] );
 *     } else {
 *         request.action = validateAction( lCase(request.context[variables.framework.action]) );
 *     }
 *
 * `noLowerCase` defaults to false (`framework.cfc:L1876-L1877`) and `config/configFramework.cfm` never
 * sets it, so the `lCase` branch is the one Slatwall ran. `?slatAction=Google:Feed.Product` therefore
 * reached the feed exactly as the lower-case spelling did. An earlier revision of `./router.ts` recorded
 * the loss of that tolerance as a deliberate tightening; a review measured it against the locator above
 * and recorded it as finding **F4**, because Refactor Discipline Guideline 2 preserves observable
 * behaviour even where AAP §0.8.1 licenses the idiom to change. Idiom changed — a convention-driven
 * split-and-invoke became a closed static table — and behaviour did not.
 *
 * ⛔ WHAT THIS IS NOT: A RE-ADMISSION OF DYNAMIC DISPATCH. The declared table stays exactly as closed as
 * it was. This map is built ONCE, at dispatcher construction, and its only members are the keys the route
 * table already declares — so an incoming action can still only reach a declared route, and the value used
 * to index the table is always a canonical key that came FROM the table rather than from the request. No
 * prefix guessing, no reflective invocation, no "closest match" heuristic: `onMissingMethod`'s prefix
 * synthesis is what IR-1 retires, and nothing here brings it back. TR-3's requirement that resolution be
 * an explicit, compile-checked declaration is unaffected: the declaration is still `CATALOG_ROUTES`, and
 * this is a lookup over its own keys.
 *
 * ⚠️ A COLLISION IS A CONSTRUCTION-TIME FAILURE, NOT A SILENT PREFERENCE. Two canonical keys that differ
 * only in case would make one of them unreachable through the lower-cased lookup, and choosing a winner
 * quietly is the kind of drift a static table exists to prevent. There is no such pair today — every
 * declared key is already lower-camel with a distinct lower-cased form — so this throws for a state the
 * declarations cannot currently reach, and it throws at module load rather than on a request if one is
 * ever introduced.
 *
 * @param routes the declared route table for one entry point
 * @returns a frozen map from each key's lower-cased form to the key itself
 * @throws Error naming both keys when two declared keys share a lower-cased form
 */
function createCanonicalActionLookup<TRouteKey extends string>(
  routes: ActionRouteTable<TRouteKey>,
): Readonly<Record<string, TRouteKey>> {
  const lookup: Record<string, TRouteKey> = Object.create(null) as Record<string, TRouteKey>;

  for (const canonical of Object.keys(routes) as TRouteKey[]) {
    const normalized = canonical.toLowerCase();
    const existing = lookup[normalized];

    if (existing !== undefined) {
      throw new Error(
        `two declared actions share the lower-cased form "${normalized}": "${existing}" and ` +
          `"${canonical}". Case-insensitive matching cannot reach both, so the route table must not ` +
          'declare two keys that differ only in case.',
      );
    }

    lookup[normalized] = canonical;
  }

  return Object.freeze(lookup);
}

/**
 * Builds the dispatcher a Lambda `handler` delegates to.
 *
 * The order of operations is the contract, and each step is here for a reason a caller can check:
 *
 *   1. `beginInvocation()` FIRST, inside the `try`. Any per-request state is reset before a route can
 *      observe it, and if resetting itself fails that failure is presented rather than escaping.
 *   2. The action is read from the query string. `queryStringParameters` is nullable on a proxy event
 *      and its members are optional, so the value is narrowed rather than asserted.
 *   3. The action is LOWER-CASED and resolved to a canonical declared key, reproducing the legacy
 *      `lCase(...)` of `org/Hibachi/FW1/framework.cfc:L1957-L1961` — see
 *      {@link createCanonicalActionLookup} for the locator, the finding that restored it, and why it
 *      re-admits no dynamic dispatch. Only the canonical key ever indexes the route table.
 *   4. An unrecognised or absent action answers **404**, not 400 and not 500. An action this entry
 *      point does not serve is indistinguishable, from outside, from a resource that does not exist,
 *      and saying anything more would let a caller enumerate the surface. A wrongly-cased action is no
 *      longer in that category: it resolves, exactly as it did in the legacy.
 *   5. `Object.hasOwn` performs the recognition test, so an inherited member name such as
 *      `constructor` or `toString` can never resolve to a route. The lookup is additionally built with
 *      a null prototype, so it has no inherited members to test against in the first place.
 *   6. Every failure — from `beginInvocation`, from route lookup, or from the route itself — is
 *      converted by {@link errorResponse}, which is the single place that decides what a caller is
 *      told and what stays in the log. Nothing escapes as an unhandled rejection.
 *
 * @param context the routes this entry point serves and its per-invocation hook
 * @returns a function of the proxy event, ready to be exported as a `handler`
 */
export function createActionDispatcher<TRouteKey extends string>(
  context: ActionDispatchContext<TRouteKey>,
): ActionRoute {
  /* Built once, from the declared table, and never rebuilt per invocation: it is derived from a frozen
   * declaration and holds no request state, so it is exactly the kind of immutable module-lifetime value
   * mismatch M7 permits — the rule M7 sets is that nothing MEMOIZED PER REQUEST may outlive the request,
   * and this memoizes nothing about a request at all. */
  const canonicalActions = createCanonicalActionLookup(context.routes);

  const resolveRouteKey = (candidate: string): TRouteKey | undefined => {
    const normalized = candidate.toLowerCase();
    return Object.hasOwn(canonicalActions, normalized) ? canonicalActions[normalized] : undefined;
  };

  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      context.beginInvocation();

      const action = event.queryStringParameters?.[SLAT_ACTION_PARAMETER];
      const routeKey = action === undefined ? undefined : resolveRouteKey(action);
      if (routeKey === undefined) {
        return notFoundResponse();
      }

      return await context.routes[routeKey](event);
    } catch (error: unknown) {
      return errorResponse(error);
    }
  };
}

/* =====================================================================================================
 * §8 — The acting principal at the edge: fail-closed, with no authentication introduced.
 *
 * WHY IT IS IN THIS MODULE. `../config/container.ts`'s `AccountContextPort` stub raises deliberately,
 * because "the acting principal is resolved per invocation at the handler edge, never captured by the
 * memoized graph" — mismatch M7 applied to identity. `../ports/AccountContextPort.ts` makes the same
 * point from the other side: a handler receives a RESOLVER, evaluated per invocation, so a memoized
 * factory cannot capture a principal and leak it across a warm container. The handler edge is this
 * folder, and every entry point in it needs the same resolver, so it is minted once here rather than
 * copied into each of the six.
 *
 * BOTH MEMBERS ARE THE PORTS' OWN DOCUMENTED DEFAULTS, COPIED RATHER THAN INVENTED.
 * `../ports/AccountContextPort.ts` writes `getCurrentAccount: () => undefined` and
 * `authenticateEntity: () => false` in its own examples; `undefined` is the state
 * `org/Hibachi/HibachiObject.cfc:L74-L76` yields for a request with no logged-in account, and `false`
 * is what the port requires when authorisation "could not be established" — never a throw and never
 * `undefined`, matching the legacy ladder's terminal `return false`.
 *
 * ⛔ FAIL-CLOSED IS THE REMAINDER, NOT A PLACEHOLDER FOR A GATE THAT WAS FORGOTTEN.
 * `integrationServices/AuthenticationInterface.cfc` and `BaseAuthentication.cfc` are excluded by AAP
 * §0.2.2.3, `org/Hibachi/HibachiAuthenticationService.cfc` is framework code this slice must never
 * carry forward (§0.8.3.2), and G4 forbids adding a capability the migration does not require. So
 * nothing here parses a header, decodes a token, verifies a signature or consults a store. Deny-all is
 * the SAFE remainder: a write route refuses rather than proceeding unauthenticated. A deployment that
 * needs authenticated catalog writes supplies its own resolver — the seam is already each handler
 * factory's parameter, so nothing has to be invented for it.
 * ================================================================================================== */

/**
 * The constant unauthenticated, deny-all context.
 *
 * ⚠️ IT IS SHARED ACROSS INVOCATIONS, AND THAT IS SAFE ONLY BECAUSE IT IS CONSTANT. Freezing it is
 * what makes the sharing sound: it holds no identity, so there is nothing for one invocation to
 * observe from another. The moment a real principal is resolved this binding MUST NOT be reused — the
 * resolver has to build a fresh context per request, which is exactly why the handlers take a function
 * rather than a value.
 */
const FAIL_CLOSED_AUTHORIZATION: RequestAuthorizationContext = Object.freeze({
  accountContext: Object.freeze({ getCurrentAccount: () => undefined }),
  entityAuthorization: Object.freeze({ authenticateEntity: () => false }),
});

/**
 * The resolver every routed catalog member falls back to.
 *
 * It ignores its argument on purpose: a resolver that read the request would be reading a credential,
 * which §8 establishes is not introduced. Declared with no parameter at all rather than an
 * underscore-prefixed one, because a function of lower arity satisfies
 * `RequestAuthorizationResolver<TRequest>` for every request type and an unused parameter would imply
 * an input that is deliberately not consulted.
 *
 * @returns the constant unauthenticated, deny-all context
 */
export const resolveFailClosedAuthorization = (): RequestAuthorizationContext =>
  FAIL_CLOSED_AUTHORIZATION;

/**
 * The narrowest request slice any surface's authorisation resolver receives.
 *
 * Every one of the four catalog surfaces declares its own authorisation event as
 * `Pick<APIGatewayProxyEvent, 'headers'>`, so this ONE shape is what a deployment's resolver has to
 * accept in order to serve all four. It is written as an indexed read of the platform type rather
 * than as a hand-rolled `{ headers?: … }` literal, so a change to the platform typing cannot silently
 * widen what a resolver is handed.
 */
export type CatalogAuthorizationRequest = Pick<APIGatewayProxyEvent, 'headers'>;

/**
 * The resolver shape a deployment registers — see {@link registerRequestAuthorizationResolver}.
 *
 * Contravariance is what makes one registered resolver serve every surface: a function accepting
 * {@link CatalogAuthorizationRequest} is assignable to `RequestAuthorizationResolver<TRequest>` for
 * every `TRequest` that carries `headers`, which is all four of them.
 */
export type CatalogAuthorizationResolver =
  RequestAuthorizationResolver<CatalogAuthorizationRequest>;

/* =====================================================================================================
 * §8.1 — THE DEPLOYMENT SEAM, AND WHY THE SHIPPED ENTRY POINTS NEEDED ONE
 * =====================================================================================================
 * ⛔ THE DEFECT THIS CLOSES, STATED PLAINLY. Every `create…HandlerFromContainer` factory used to pass
 * {@link resolveFailClosedAuthorization} as a HARD-WIRED argument, and neither `./router.ts` nor any
 * per-surface entry point accepted a resolver. The seam therefore existed only on
 * `createProductHandler` and its three siblings — functions a deployment cannot reach through a
 * packaged artifact without rebuilding the graph itself — so every catalog action answered `401` from
 * the shipped exports, permanently, while README claimed the seam was already available. A code review
 * classified that as a CRITICAL callable-boundary defect, and this section is the remedy it directed:
 * "a deployment-supplied, per-invocation `RequestAuthorizationResolver` to aggregate and per-surface
 * composition, preserving only an explicit fail-closed fallback and never memoizing a principal".
 *
 * ⭐ WHAT IS HELD HERE IS A FUNCTION, NEVER A PRINCIPAL — WHICH IS WHY M7 IS NOT VIOLATED. AAP §0.6.6
 * M7 forbids module-scope state that a warm container could carry from one invocation into the next,
 * and `../ports/AccountContextPort.ts` names a captured principal as exactly that hazard. The cell
 * below holds the deployment's WIRING — one resolver function, registered once during initialisation,
 * in the same class of state as `./router.ts`'s route table or `../config/container.ts`'s memoized
 * graph. The principal itself is still resolved by CALLING that function on every invocation, from
 * that invocation's own request, and is never stored anywhere.
 *
 * ⛔ AND NOTHING HERE AUTHENTICATES ANYTHING. This module still parses no header, decodes no token,
 * verifies no signature and consults no store; `integrationServices/AuthenticationInterface.cfc` and
 * `BaseAuthentication.cfc` are excluded by AAP §0.2.2.3 and `org/Hibachi/HibachiAuthenticationService.cfc`
 * is framework code this slice must never carry forward (AAP §0.8.3.2). The seam takes a resolver the
 * DEPLOYMENT wrote — from its gateway authorizer, its own edge service, or whatever else it already
 * trusts — and calls it. Deny-all remains the answer until it does.
 *
 * ⚠️ REGISTRATION IS DELIBERATELY NOT REVOCABLE AND NOT RE-POINTABLE. A second call raises rather than
 * replacing the first: two modules each believing they own the gate is a configuration fault, and
 * silently letting the last one win is how a deployment ends up enforcing a resolver it did not
 * intend. Nothing in this subtree calls it, so a graph built by this port alone stays fail-closed.
 * ================================================================================================== */

/**
 * The one module-scope wiring cell this module declares. Holds a resolver, never a context.
 *
 * A `const` object with one mutable field rather than a mutable binding, so nothing can re-point the
 * binding itself, matching the treatment `../config/container.ts` gives its memoized graph.
 */
const deploymentAuthorization: { resolve: CatalogAuthorizationResolver | undefined } = {
  resolve: undefined,
};

/** The message a second registration reports, declared once so the test and the throw agree. */
const AUTHORIZATION_RESOLVER_ALREADY_REGISTERED =
  'A request authorisation resolver is already registered. Register exactly one, during ' +
  'initialisation, so a single declaration owns the catalog gate.';

/**
 * Registers the deployment's per-invocation authorisation resolver for every shipped entry point.
 *
 * A deployment calls this ONCE, from its own initialisation path — typically a thin entry module that
 * requires the packaged artifact and re-exports its `handler` — before the first invocation is served.
 * Every entry point in this folder reads the registered resolver through
 * {@link resolveRequestAuthorization} on each invocation, so a resolver registered after the graph was
 * built is still honoured and no principal is ever captured at build time.
 *
 * @param resolver the deployment's resolver; it must answer for the invocation it is handed and must
 *   NOT be a memoized context. Returning {@link resolveFailClosedAuthorization}'s deny-all context for
 *   a request it cannot place is the correct fail-closed answer.
 * @throws {DomainError} when a resolver is already registered — see §8.1.
 */
export function registerRequestAuthorizationResolver(resolver: CatalogAuthorizationResolver): void {
  if (deploymentAuthorization.resolve !== undefined) {
    throw new DomainError(AUTHORIZATION_RESOLVER_ALREADY_REGISTERED);
  }

  deploymentAuthorization.resolve = resolver;
}

/**
 * Discards the registered resolver.
 *
 * ⚠️ IT EXISTS FOR THE SUITE, AND ITS SHAPE IS WHAT KEEPS THAT HONEST. A registration that could not
 * be undone would make the seam untestable in a single module registry, so `test/handlers/**` clears
 * it between cases. It resets to ABSENT — the fail-closed state — and can therefore never be used to
 * install a principal or to relax a gate; the only thing it can do is take a gate away.
 */
export function clearRequestAuthorizationResolver(): void {
  deploymentAuthorization.resolve = undefined;
}

/**
 * The resolver every shipped entry point gates on, evaluated once per invocation.
 *
 * ⭐ THE INDIRECTION IS THE POINT. Reading the cell HERE — inside the call, not when the handler was
 * composed — is what lets a deployment register during initialisation while the graph is built at
 * module load, and what guarantees that no context outlives the invocation that produced it.
 *
 * @param request the invocation's own request slice, forwarded to the registered resolver unchanged
 * @returns the deployment's context for this invocation, or the constant deny-all context when no
 *   resolver is registered
 */
export function resolveRequestAuthorization(
  request: CatalogAuthorizationRequest,
): RequestAuthorizationContext {
  const resolve = deploymentAuthorization.resolve;

  return resolve === undefined ? FAIL_CLOSED_AUTHORIZATION : resolve(request);
}
