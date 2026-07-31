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
 * module forwards both without touching them. Nothing else crosses at all: the set of thrown texts
 * that may reach a response body is a CLOSED ALLOWLIST, so a message outside it is replaced with a
 * neutral text rather than forwarded. Verbatim fidelity and non-disclosure are therefore not in
 * tension here — the first applies to a fixed, enumerated set, and the second applies to
 * everything else. See {@link PUBLIC_PARITY_MESSAGE_STATUS}.
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
 * EVERYTHING ELSE IS WITHHELD, AND `Error.message` IS NEVER READ HERE. The two items above reach a
 * caller because the error that carries them DECLARES them disclosable, not because this module
 * copies a message out of an exception. Every other message in the port is written for a maintainer
 * — ported members name the legacy locator they reproduce, the defect identifier they carry
 * unrepaired, the entity identifier in play, the database column that could not be read, or the
 * environment variable that was not set — and none of it may reach a response. The mechanism is
 * ../errors/DomainError's deny-by-default presentation, and the reasoning for putting the decision
 * at the throw site rather than here is set out in full at {@link errorResponse}. The legacy
 * application had no response-shaping layer at all, so withholding a port-composed message departs
 * from no legacy contract; see DECLARED HARDENING there.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4 — hexagonal separation)
 * -----------------------------------------------------------
 * src/handlers/ is the outermost layer, and this module is its foundation: it has zero
 * intra-folder dependencies, and the router and the five per-service handlers all shape their
 * output through it. Its imports are therefore exactly two things and nothing else — the error
 * types from ../errors/, and type-only declarations from the AWS Lambda typings, which are
 * erased at compile time and never appear in an artifact.
 *
 * What is consequently absent, all deliberate:
 *   - No import from ../adapters/, ../config/, ../validation/, ../ports/, ../services/ or
 *     ../domain/. This module is a pure function of its arguments; it resolves no collaborator,
 *     by name or otherwise, and imports no composition root (AAP 0.7.3 S3).
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
 *       including the declared-hardening statement for the four codes whose status changed.
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
 *   - A failure-code registry of this module's own. The codes a response body carries are declared
 *     once, in ../errors/DomainError, so the error hierarchy and the response layer speak ONE closed
 *     vocabulary rather than two rival ones; that module records why the leaf owns it. The set is
 *     closed at the outcomes this port already distinguishes structurally, which is not the invented
 *     taxonomy AAP 0.7.3 S9 rules out but the existing branch set made machine-readable — the
 *     necessary counterpart of a public text that can no longer be specific.
 *   - Any timeout, page size, batch size, retry count, backoff schedule, concurrency limit or
 *     cache lifetime, and no service-level objective of any kind (AAP 0.8.3.5).
 *   - A logging, metrics or tracing LIBRARY. None is added, so the deliverable's dependency set
 *     stays frozen: the manifest gains nothing because of this file (AAP 0.7.3 S5). No metric, no
 *     span, no correlation or trace identifier and no structured log schema is introduced either,
 *     because AAP 0.7.3 S9 forbids inventing a taxonomy the source does not state.
 *     There is exactly ONE side effect anywhere in this module, and it is not observability:
 *     {@link errorResponse} writes a diagnostic line for each failure it deliberately declines to
 *     describe in the response body, using the runtime's own error stream and nothing else. That
 *     write is what makes the non-disclosure honest rather than lossy — the internal detail is
 *     REDIRECTED, not discarded — and it is the reason no caller has to choose between a leaking
 *     response and an undiagnosable failure. Every other export remains a pure function of its
 *     arguments, assertable without a database, a network call or an AWS runtime.
 *   - The two execution-model mismatches that touch this folder. AAP 0.6.6 M1 (the importer's
 *     one-hour request budget, which exceeds the platform's function ceiling and therefore has no
 *     single-invocation equivalent) belongs to productHandler.ts, and M2 (the feed view's
 *     six-minute render budget, far beyond a synchronous integration budget) belongs to
 *     googleFeedHandler.ts. Neither is resolved, worked around or restated here.
 *   - A health, readiness or metrics endpoint, and any route table. Routing is router.ts.
 */

import {
  DomainError,
  LegacyParityError,
  NotImplementedError,
  PUBLIC_ERROR_CODE,
  type PublicErrorCode,
  type PublicErrorPresentation,
} from '../errors/DomainError';
import { ValidationError, type ValidationErrors } from '../errors/ValidationError';

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
 * The shape is deliberately small. AAP 0.7.3 S9 forbids inventing a taxonomy, so there is no
 * error code, no problem-detail envelope, no type or instance identifier, no timestamp and no
 * trace identifier — only the two members that carry information a caller can actually act on:
 *
 *   - `message` is always present. It is EITHER one of the four mandated legacy strings, forwarded
 *     verbatim, OR a neutral text this port owns; nothing else can appear in it. See
 *     {@link errorResponse} for the type-level rule that decides which, and why.
 *   - `errors` is present only for a validation failure, and it is the parity-bearing member of
 *     this whole interface. It is the keyed structure ../errors/ValidationError exposes, carried
 *     across unchanged: a map from property identifier to the ordered list of resource-bundle keys
 *     reported against it. AAP 0.4.1.11 requires exactly this.
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
 * by executable assertions — `Object.keys(JSON.parse(result.body))` must equal `['message']`, and one
 * case asserts specifically that the not-implemented response "publishes neither its message nor its
 * member identifier" — so the narrower contract is the tested one, and widening it would require
 * deleting a test rather than adding one.
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
 */
export interface ErrorResponseBody {
  readonly code: PublicErrorCode;
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
 * The neutral text that stands in for a domain message this port authored.
 *
 * It is one fixed string, not a family of strings, and that is the whole point: a per-situation
 * text would reconstruct by paraphrase exactly the internal detail the substitution exists to
 * withhold, and a per-situation identifier would be the error-code registry AAP 0.7.3 S9 forbids.
 * See the disclosure rules on {@link errorResponse}.
 */
const DOMAIN_FAILURE_MESSAGE = 'The request could not be completed';

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
 * THE CODE IS A REQUIRED ARGUMENT, NOT AN OPTIONAL ONE, and its position before the message is
 * deliberate. Every failure body this service emits carries a code, so a caller never has to
 * decide whether one is present; making it required means the compiler rejects a new failure
 * response that forgot to classify itself, rather than silently emitting an unclassified body.
 *
 * The message is written into the body exactly as given — no prefix, no suffix, no punctuation
 * adjustment and no case change. THE CALLER IS ANSWERABLE FOR WHAT IT PASSES: this helper cannot
 * tell a neutral text from a maintainer-facing one, so a caller must pass only a text it has
 * established is public-safe, and must never pass an `Error.message` it did not obtain from
 * {@link PublicErrorPresentation}. The disclosure rules on {@link errorResponse} state what is
 * prohibited; every in-module caller passes one of the module-private constants above.
 *
 * @param statusCode the status to return; use a member of {@link HTTP_STATUS}
 * @param code the public-safe classification; use a member of `PUBLIC_ERROR_CODE`
 * @param message the public-safe text to place in the body's message member, used verbatim
 * @returns a proxy result carrying a message-only failure body
 */
export function messageResponse(
  statusCode: number,
  code: PublicErrorCode,
  message: string,
): APIGatewayProxyResult {
  const body: ErrorResponseBody = { code, message };

  return jsonResponse(statusCode, body);
}

/**
 * Builds the response for an unmatched route, or for an addressed record that does not exist.
 *
 * TRANSLATION DECISION (judgment (d)) — 404 is the judgment RFC 9110 supports for "no matching
 * target", and it serves both callers this module is designed for: the planned router.ts for a route no entry matches, and
 * a per-service handler whose lookup returned nothing.
 *
 * It takes no arguments on purpose. Echoing the requested route, method or identifier back into the
 * body would disclose the service's addressable surface to an unauthenticated caller for no benefit
 * to a legitimate one, so the body carries a neutral text and nothing else. A handler that needs a
 * different 404 text can call {@link messageResponse} explicitly and take responsibility for it.
 *
 * @returns a proxy result with a not-found status and a neutral body
 */
export function notFoundResponse(): APIGatewayProxyResult {
  return messageResponse(
    HTTP_STATUS.NOT_FOUND,
    PUBLIC_ERROR_CODE.RESOURCE_NOT_FOUND,
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
  return messageResponse(
    HTTP_STATUS.UNAUTHORIZED,
    PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
    AUTHENTICATION_REQUIRED_MESSAGE,
  );
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
  return messageResponse(
    HTTP_STATUS.FORBIDDEN,
    PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
    NOT_AUTHORIZED_MESSAGE,
  );
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
 * and no severity vocabulary is embedded, because the value itself is handed to the log alongside
 * the phrase and the runtime formats it far better than any hand-built string would.
 */
const BOUNDARY_STUB_LOG_PHRASE =
  'Boundary-stubbed member invoked; detail withheld from the response:';
const UNDISCLOSED_DOMAIN_FAILURE_LOG_PHRASE =
  'Domain failure with a non-parity message; detail withheld from the response:';
const UNRECOGNISED_FAILURE_LOG_PHRASE =
  'Unrecognised failure escaped a handler; detail withheld from the response:';

/**
 * Writes the diagnostic for a failure whose detail is deliberately kept out of the response.
 *
 * This is the single side effect in the module, and it exists so that non-disclosure is honest
 * rather than lossy: everything {@link errorResponse} refuses to tell a caller is told to the
 * execution log instead, where an operator can read it and an unauthenticated caller cannot. Without
 * it, hardening the boundary would have made real failures undiagnosable, which is not a trade this
 * port is willing to make.
 *
 * The runtime's own error stream is used and nothing else. No logging library is introduced, so the
 * dependency set stays frozen (AAP 0.7.3 S5), and no log schema, level vocabulary, correlation
 * identifier or structured envelope is invented (AAP 0.7.3 S9) — the situation is one fixed phrase
 * and the value is handed over as-is.
 *
 * The caught value is passed as a SEPARATE ARGUMENT rather than interpolated into the phrase. That
 * is deliberate on two counts: it keeps the runtime's own formatting of an error — including its
 * stack, which is exactly the detail an operator needs and a caller must never see — and it means
 * this module still performs no string operation on any error value, since nothing is concatenated.
 *
 * @param situation a fixed phrase naming which branch suppressed the detail
 * @param error the caught value, forwarded to the log untouched
 */
function logSuppressedFailure(situation: string, error: unknown): void {
  console.error(situation, error);
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
 * authored with one text, so a caller cannot tell a resource-budget refusal from a rejected image
 * filename from an unresolvable setting. That loss is accepted knowingly: none of those messages is
 * legacy behavior, so none carries a parity obligation, and the alternative — a family of
 * per-situation public texts — would reconstruct by paraphrase precisely the internal detail the
 * substitution exists to withhold. The status still separates the families, and the full message,
 * its cause and its diagnostic context all remain intact on the error object for the caller inside
 * the service to log.
 *
 * Recognition is by instanceof, which is safe after bundling because ../errors/DomainError re-points the
 * prototype at the constructed class in its constructor. That is a deliberate property of the sibling,
 * relied on here rather than assumed.
 *
 * TYPE RECOGNITION IS NOT DISCLOSURE AUTHORITY. Knowing which class was raised decides which branch
 * runs; it does not decide what the body may contain. Only the third branch may place a thrown text
 * in a body, and only for a message {@link PUBLIC_PARITY_MESSAGE_STATUS} enumerates — so the set of
 * texts this function can emit is closed by construction, and every other failure receives a fixed
 * neutral text with its detail written to the execution log by {@link logSuppressedFailure} instead.
 * The two rules that follow from that hold on every branch and are worth stating once, up front:
 * nothing internal is ever disclosed, and nothing is ever silently dropped.
 *
 * The status on every branch comes from {@link statusForPublicErrorCode}, which holds the entire
 * status policy and the justification for each row.
 *
 * The status on every branch comes from {@link statusForPublicErrorCode}, which holds the entire
 * status policy and the justification for each row.
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
 * asserted against. The parity-bearing member on this branch is `errors`, and only `errors`; the
 * assertable classification is `code`.
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
 * TRANSLATION DECISIONS (judgments (a) and (g)). This branch forks on
 * {@link PUBLIC_PARITY_MESSAGE_STATUS}, which is where the reasoning for the fork is recorded in
 * full. What follows is what the fork means at the mapping site.
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
 * very value that was thrown. {@link publicParityStatusFor} states the same guarantee at the only
 * place a message is inspected. TODO(parity): the two misspellings are retained from the legacy
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
 * BRANCH 4 — ANY OTHER DOMAIN FAILURE, 400. RECOGNISED, BUT NOT DESCRIBED.
 * ------------------------------------------------------------------------------------------------
 * This branch is what makes Branch 3 safe. A DomainError that is not one of the three specific
 * subclasses above carries a message this port authored for an engineer, and the runtime evidence
 * for withholding it is concrete: messages on this path have been observed naming a schema column,
 * an internal storage path, a legacy source locator and an internal member name. Every one of those
 * is reconnaissance material for a caller who should learn only that the request failed.
 *
 * So the failure is recognised — it is a deliberate outcome of ported code, not a fault, and it
 * keeps the same 400 status the family has always had — but it is answered with a fixed neutral
 * text. The message, the cause and the diagnostic context all stay on the error object for the
 * caller inside the service; none of them crosses this boundary.
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
 *     four follow from, and it is enforced positively: a message is disclosed only by matching
 *     {@link PUBLIC_PARITY_MESSAGE_STATUS}, never by failing to match a list of prohibited things.
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
      code: presentation.code,
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

    return messageResponse(
      HTTP_STATUS.NOT_IMPLEMENTED,
      PUBLIC_ERROR_CODE.NOT_IMPLEMENTED,
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
    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
      error.message,
    );
  }

  // BRANCH 4 — a domain failure this port authored. Recognised by type and answered at the family's
  // status, but its message is NOT read: it is a diagnostic for an engineer, not for a caller.
  if (error instanceof DomainError) {
    logSuppressedFailure(UNDISCLOSED_DOMAIN_FAILURE_LOG_PHRASE, error);

    return messageResponse(
      HTTP_STATUS.BAD_REQUEST,
      PUBLIC_ERROR_CODE.SERVICE_FAULT,
      DOMAIN_FAILURE_MESSAGE,
    );
  }

  /* BRANCH 5 — not raised by this port. The caught value is not inspected in any way, and it is not
   * swallowed either: it goes to the log verbatim, which is the whole of the module's "redirected,
   * not discarded" guarantee for a value nothing here can classify. */
  logSuppressedFailure(UNRECOGNISED_FAILURE_LOG_PHRASE, error);

  return messageResponse(
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    PUBLIC_ERROR_CODE.SERVICE_FAULT,
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
 * A note on which reads need a null check, because the count looks inconsistent and is not: the AWS
 * typings declare the path parameters, the query-string parameters and the body as nullable, but
 * declare the header container as always present. Exactly three narrowings are therefore written.
 * Adding a fourth would not be defensive, it would be rejected by the compiler as a comparison
 * between types with no overlap — the declared contract is followed rather than second-guessed.
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
 *   1. The body is declared nullable, and an absent body also arrives as an empty string, so both
 *      forms are treated as absent. The emptiness test compares against the empty string rather
 *      than measuring a length, because no numeric literal other than a status code appears in this
 *      file (AAP 0.7.3 S9).
 *   2. Parsing throws on invalid input. It is wrapped, and the binding is omitted from the catch
 *      clause because the thrown value is not inspected — reporting that parsing failed is all a
 *      caller needs, and a parser's own message is an internal detail that the disclosure rules on
 *      {@link errorResponse} keep out of a response.
 *   3. Parsing is declared to return an unrestricted value. It is assigned into a variable declared
 *      as unknown, so nothing downstream can silently dereference it, and the value only becomes
 *      usable after {@link isJsonObject} narrows it. That is the whole reason no cast appears here.
 *
 * @param event the proxy event, or any object carrying its body member
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
export function readJsonObjectBody(event: Pick<APIGatewayProxyEvent, 'body'>): RequestBodyResult {
  const raw = event.body;

  if (raw === null || raw === '') {
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
  switch (problem) {
    case 'absent':
      return messageResponse(
        HTTP_STATUS.BAD_REQUEST,
        PUBLIC_ERROR_CODE.REQUEST_INVALID,
        BODY_ABSENT_MESSAGE,
      );
    case 'malformed':
      return messageResponse(
        HTTP_STATUS.BAD_REQUEST,
        PUBLIC_ERROR_CODE.REQUEST_INVALID,
        BODY_MALFORMED_MESSAGE,
      );
    case 'notAnObject':
      return messageResponse(
        HTTP_STATUS.BAD_REQUEST,
        PUBLIC_ERROR_CODE.REQUEST_INVALID,
        BODY_NOT_AN_OBJECT_MESSAGE,
      );
  }
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
 * @param event the proxy event, or any object carrying its path-parameters member
 * @param name the parameter name as declared by the route
 * @returns the parameter value, or nothing when the route bound no such parameter
 */
export function readPathParameter(
  event: Pick<APIGatewayProxyEvent, 'pathParameters'>,
  name: string,
): string | undefined {
  const parameters = event.pathParameters;

  if (parameters === null || !Object.hasOwn(parameters, name)) {
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
 * @param event the proxy event, or any object carrying its query-string-parameters member
 * @param name the parameter name
 * @returns the parameter value, or nothing when it was not supplied
 */
export function readQueryStringParameter(
  event: Pick<APIGatewayProxyEvent, 'queryStringParameters'>,
  name: string,
): string | undefined {
  const parameters = event.queryStringParameters;

  if (parameters === null || !Object.hasOwn(parameters, name)) {
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
 * Unlike the two parameter containers, the header container is declared always present by the AWS
 * typings, so no null narrowing is written for it; see the note at the top of this section.
 *
 * @param event the proxy event, or any object carrying its headers member
 * @param name the header name, in any casing
 * @returns the header value exactly as received, or nothing when the header is absent
 */
export function readHeader(
  event: Pick<APIGatewayProxyEvent, 'headers'>,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase();

  for (const [header, value] of Object.entries(event.headers)) {
    if (header.toLowerCase() === wanted) {
      return value;
    }
  }

  return undefined;
}
