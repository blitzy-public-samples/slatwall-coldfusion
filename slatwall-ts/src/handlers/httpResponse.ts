/**
 * httpResponse — response and error shaping for the Catalog slice's Lambda handlers, and the
 * one module in this deliverable that names cloud-provider types centrally.
 *
 * Authority: AAP 0.4.1.9 row 7 — "slatwall-ts/src/handlers/httpResponse.ts | CREATE | — (no
 * legacy counterpart) | Response and error shaping; all AWS-specific typing confined to this
 * layer." AAP 0.3.1 lists it in the target tree as the "response shaping helper".
 *
 * THERE IS NO LEGACY COUNTERPART, AND THAT IS THE POINT
 * ----------------------------------------------------
 * The legacy application never shaped a response itself. A request entered through index.cfm,
 * the retired FW/1 layer selected a view by convention, and the application server wrote the
 * status line, the headers and the body. Nothing in the four in-scope services, the six in-scope
 * entities or the Google feed adapter chooses a status code. Two consequences follow, and both
 * are load bearing:
 *
 *   1. Everything in this module is NET-NEW coverage (AAP 0.7.3 S6). There is no legacy test to
 *      extend and no parity claim to make about the shape of a response, and none is implied
 *      anywhere below. AAP 0.6.5.2 records that the legacy suite contains no controller test and
 *      no feed test of any kind, and that meta/tests/functional/admin/entity/ProductTest.cfc:49-52
 *      is an empty component with zero test methods.
 *   2. Where legacy behavior DOES reach a response — the four verbatim thrown message strings and
 *      the validation error-key structure — this module is a conduit and nothing more. See
 *      PASS-THROUGH IS ABSOLUTE below.
 *
 * PASS-THROUGH IS ABSOLUTE
 * ------------------------
 * Two things that cross this boundary are observable behavior of the legacy system, and this
 * module forwards both without touching them:
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
 *   - The validation error-key structure. AAP 0.4.1.11 requires the "error-key structure
 *     preserved so validation failures remain comparable to legacy output", so a validation
 *     failure is serialized as the keyed structure ../errors/ValidationError exposes, never as a
 *     sentence. See {@link errorResponse}, which explains at the mapping site exactly why
 *     flattening is forbidden.
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
 * AAP 0.5.5, verbatim: "The hexagonal boundary confines all AWS coupling to src/handlers/**, so
 * migrating to a newer runtime is a change to those four artifacts plus a @types/node bump — with
 * no change to src/domain/**, src/services/**, src/ports/** or src/adapters/**." Every AWS type
 * that leaks below this folder destroys that property. This module therefore re-exports the four
 * AWS types the folder needs, so a sibling handler has one place to obtain them and a future
 * runtime migration has one place to look. None of the four version-coupled artifacts AAP 0.5.5
 * enumerates lives in this folder, and no infrastructure definition appears here (AAP 0.2.2.5).
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS (AAP 0.8.2 Guideline 6)
 * ----------------------------------------------------------------
 * Guideline 6 requires that every technology-specific translation decision be documented at the
 * file where the judgment is made. The judgments made here are:
 *
 *   (a) The verbatim pass-through rule above, including the two legacy misspellings, which
 *       Guideline 4 forbids repairing. Recorded in full at {@link errorResponse}.
 *   (b) The validation error-key structure survives as a structure. Recorded at
 *       {@link errorResponse}, together with why a flattened body would defeat the comparability
 *       the whole port exists to demonstrate.
 *   (c) The content type chosen for the product feed. The legacy view emits an XML declaration as
 *       its literal first bytes and sets no explicit content type that source analysis could
 *       verify, so the value used here is a deliberate translation decision rather than a ported
 *       one. Recorded in full at {@link XML_CONTENT_TYPE} and {@link xmlResponse}.
 *   (d) Every status-code mapping. The legacy system expressed none of these outcomes as a status
 *       code, so each mapping is a judgment. Recorded at {@link HTTP_STATUS} and, per branch, at
 *       {@link errorResponse}.
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
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - Any business rule, query, field mapping or validation rule. Those belong to the service,
 *     adapter, integration and validation layers respectively.
 *   - A problem-detail schema, an error-code registry, a correlation or trace identifier scheme,
 *     a retry-after header, an entity tag, a cache directive, a compression setting, a content
 *     disposition, or a rate-limit header. AAP 0.7.3 S9 and AAP IR-12 forbid inventing a taxonomy
 *     or a tuning parameter the source does not state. No numeric literal appears anywhere below
 *     except an HTTP status code, which is a protocol value rather than an invented setting.
 *   - Any timeout, page size, batch size, retry count, backoff schedule, concurrency limit or
 *     cache lifetime, and no service-level objective of any kind (AAP 0.8.3.5).
 *   - Logging, metrics and tracing. No such library is added (AAP 0.7.3 S5), and no side effect
 *     is performed either: every export stays a pure function of its arguments so it is
 *     assertable without a database, a network call or an AWS runtime. Observability is the
 *     caller's concern, deliberately, because purity here is what makes this module trivially
 *     testable.
 *   - The two execution-model mismatches that touch this folder. AAP 0.6.6 M1 (the importer's
 *     one-hour request budget, which exceeds the platform's function ceiling and therefore has no
 *     single-invocation equivalent) belongs to productHandler.ts, and M2 (the feed view's
 *     six-minute render budget, far beyond a synchronous integration budget) belongs to
 *     googleFeedHandler.ts. Neither is resolved, worked around or restated here.
 *   - A health, readiness or metrics endpoint, and any route table. Routing is router.ts.
 */

import { DomainError, NotImplementedError } from '../errors/DomainError';
import { ValidationError, type ValidationErrors } from '../errors/ValidationError';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * The AWS types this folder needs, re-exported from one place.
 *
 * This is the mechanism behind the confinement property quoted in the module header: a sibling
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
 * The set is closed at exactly the five codes this module uses. Nothing is added speculatively:
 * AAP 0.7.3 S9 forbids inventing surface the source does not call for, so a consumer that
 * genuinely needs another code extends this single declaration site rather than writing a bare
 * number at a call site. Status codes are protocol values defined by RFC 9110, not tuning
 * parameters, which is why they are the one numeric exception this file allows itself.
 *
 * The object is frozen so the declaration is provably immutable at runtime as well as in the type
 * system. That is not decoration: it is what lets the module header state without qualification
 * that this file holds no module-scope mutable state, which AAP 0.6.6 M7 requires of everything
 * outside the connection pool.
 */
export const HTTP_STATUS = Object.freeze({
  /** The request succeeded and the response carries a representation. */
  OK: 200,

  /** The request was rejected on its content. Used for validation and domain failures. */
  BAD_REQUEST: 400,

  /** No route matched, or the addressed record does not exist. */
  NOT_FOUND: 404,

  /** An unrecognised failure escaped a handler. Nothing about it is disclosed. */
  INTERNAL_SERVER_ERROR: 500,

  /** A boundary-stubbed member was invoked. See {@link errorResponse}. */
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
 * What source analysis established, by reading the two files and then searching the whole
 * integration directory:
 *   - integrationServices/google/views/feed/product.cfm:1 emits an XML declaration as its literal
 *     first bytes, and that declaration carries a version pseudo-attribute only — no encoding
 *     pseudo-attribute.
 *   - integrationServices/google/controllers/feed.cfc suppresses the framework layout and does
 *     nothing else to the response.
 *   - A case-insensitive search of integrationServices/google/** for a content-type tag, a
 *     content-type header assignment or an encoding call returns no match at all. THE LEGACY VIEW
 *     THEREFORE SETS NO EXPLICIT CONTENT TYPE THAT SOURCE ANALYSIS COULD VERIFY. Whatever the
 *     application server defaulted to for that request is not recoverable from source, and this
 *     port does not guess at it.
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

/* ==========================================================================================
 * RESPONSE BODY SHAPES
 * ========================================================================================== */

/**
 * The body every failure response carries.
 *
 * The shape is deliberately small. AAP 0.7.3 S9 forbids inventing a taxonomy, so there is no
 * error code, no problem-detail envelope, no type or instance identifier, no timestamp and no
 * trace identifier — only the three members that carry information a caller can actually act on:
 *
 *   - `message` is always present. On a domain failure it is the thrown message forwarded
 *     verbatim; see {@link errorResponse} for what that guarantees and why.
 *   - `errors` is present only for a validation failure, and it is the parity-bearing member of
 *     this whole interface. It is the keyed structure ../errors/ValidationError exposes, carried
 *     across unchanged: a map from property identifier to the ordered list of resource-bundle keys
 *     reported against it. AAP 0.4.1.11 requires exactly this.
 *   - `member` is present only when a boundary-stubbed member was invoked, and it names that
 *     member so the gap is legible instead of silent. See {@link errorResponse}.
 *
 * Both optional members are declared optional rather than as a union with undefined, because
 * exactOptionalPropertyTypes is enabled: a producer omits a member entirely rather than setting it
 * to undefined, so a serialized body never carries a key with no value.
 *
 * This type is exported while the neutral message texts below are not. That asymmetry is
 * intentional and follows the convention ../errors/ValidationError established in its own decision
 * (d): a consumer or a test should be able to type-check against the SHAPE of a failure body, but
 * must not assert equality against a text this port invented, because such a text carries no
 * parity obligation and asserting on it would imply one.
 */
export interface ErrorResponseBody {
  readonly message: string;
  readonly errors?: ValidationErrors;
  readonly member?: string;
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
 */
const NOT_FOUND_MESSAGE = 'Not found';
const UNEXPECTED_FAILURE_MESSAGE = 'An unexpected error occurred';
const BODY_ABSENT_MESSAGE = 'A request body is required';
const BODY_MALFORMED_MESSAGE = 'The request body is not valid JSON';
const BODY_NOT_AN_OBJECT_MESSAGE = 'The request body must be a JSON object';

/*
 * The JSON literal used when a value has no JSON representation.
 *
 * JSON.stringify is DECLARED to return a string, but it returns the value undefined — not the text
 * "undefined" — when handed undefined, a function or a symbol. A proxy result's body member is a
 * required string, so that case has to be closed explicitly rather than trusted to the signature.
 * See {@link serializeJson}.
 */
const JSON_NULL = 'null';

/* ==========================================================================================
 * SUCCESS AND RAW RESPONSES
 * ========================================================================================== */

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
 * The message is written into the body exactly as given — no prefix, no suffix, no punctuation
 * adjustment and no case change. A caller is responsible for the message it passes, and must not
 * pass anything the disclosure rules on {@link errorResponse} prohibit.
 *
 * @param statusCode the status to return; use a member of {@link HTTP_STATUS}
 * @param message the text to place in the body's message member, used verbatim
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
 * target", and it serves both callers this module has: router.ts for a route no entry matches, and
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
  return messageResponse(HTTP_STATUS.NOT_FOUND, NOT_FOUND_MESSAGE);
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
 *     records what source analysis established and why the generic registered XML media type with
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
 * THE SINGLE ERROR-TO-RESPONSE MAPPING
 * ==========================================================================================
 *
 * Every handler funnels its failures through {@link errorResponse}. Nothing else in the folder maps
 * an error to a response, which is the point: one mapping means one place to audit for the two
 * things that must never go wrong here — that legacy behavior is forwarded untouched, and that
 * nothing internal is disclosed.
 * ========================================================================================== */

/**
 * Maps any thrown value to a response.
 *
 * The four branches are ordered most-derived first, and that order is not cosmetic. Both
 * ValidationError and NotImplementedError extend DomainError, so testing the base type first would
 * swallow the two specific branches and, in the validation case, would drop the error keys — a
 * failure with no compile error and no other failing test anywhere in the port. The two specific
 * branches are siblings, so their order relative to each other is immaterial; both must precede the
 * base.
 *
 * Recognition is by instanceof, which is safe after bundling because ../errors/DomainError
 * re-points the prototype at the constructed class in its constructor. That is a deliberate
 * property of the sibling, relied on here rather than assumed.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 1 — VALIDATION FAILURE, 400. THE ERROR KEYS ARE THE CONTRACT.
 * ------------------------------------------------------------------------------------------------
 * TRANSLATION DECISION (judgment (b)). AAP 0.4.1.11, verbatim: "Error-key structure preserved so
 * validation failures remain comparable to legacy output." The keyed structure is therefore written
 * into the body exactly as ../errors/ValidationError exposes it — a map from property identifier to
 * the ordered array of resource-bundle keys reported against that identifier.
 *
 * IT IS NEVER FLATTENED. Not into a prose sentence, not into a single message string, not into a
 * joined list, not into an array of pairs and not into a human-readable summary. Three specific
 * properties of the structure are behavior, and flattening destroys all three:
 *   - WHICH KEY a failure is reported under. The key is the property identifier, never the rule's
 *     method name: model/validation/Sku.json attaches two method-based rules to one property and
 *     both report under that property.
 *   - THAT A KEY HOLDS AN ORDERED ARRAY. Because two rules can report against one property in one
 *     save, collapsing a key's value to a string would silently discard one of the messages.
 *   - THE EXACT RESOURCE-BUNDLE KEY STRINGS. They are opaque keys, not display text, and they are
 *     forwarded unresolved and unmodified. ../errors/ValidationError documents three legacy
 *     asymmetries among them — one misspells a word its paired error key spells correctly, one uses
 *     a different leading segment from the keys raised beside it, and one camel-cases its final
 *     segment where the others are lowercase. Normalising any of those would be a behavior change,
 *     and this module performs no string transformation on them whatsoever.
 *
 * Why it matters concretely: the traceable legacy regression issue_1335 in
 * meta/tests/unit/IssuesTest.cfc asserts on SKU currency price and list-price validation error KEYS.
 * A flattened body cannot satisfy that assertion, so a flattened body would quietly forfeit the
 * comparability this port exists to demonstrate.
 *
 * The body's message member on this branch is the inherited aggregate text, which
 * ../errors/ValidationError deliberately does not export precisely because the legacy system has no
 * such string. It therefore carries NO parity obligation and must not be asserted against. The
 * parity-bearing member on this branch is `errors`, and only `errors`.
 *
 * The status is a judgment: a validation failure is a rejection of the request's content, which
 * RFC 9110 describes with 400. The legacy system expressed the same outcome by leaving the entity
 * unsaved and populating the error bag, with no status involvement at all.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 2 — BOUNDARY STUB, 501. SURFACED HONESTLY, NEVER SWALLOWED.
 * ------------------------------------------------------------------------------------------------
 * AAP TR-5, verbatim: "Cross the scope boundary only through a declared port. … The member is never
 * quietly dropped from the interface." Several in-scope members are boundary-stubbed because their
 * behavior terminates at an explicitly out-of-scope collaborator, and two more because their legacy
 * implementation is provably unresolvable in the source repository — the defects AAP 0.6.7 records
 * as D4 (a service member delegating to a data-access member that exists nowhere) and D5 (an entity
 * member calling a service member the service never defines). Those are carried across as this
 * error rather than repaired, per AAP 0.7.3 S7.
 *
 * Such a failure is reported as such. It is never swallowed, never converted into a success, and
 * never answered with a substituted default, a true, a false, an empty array or any other
 * fabricated value. The response names the member, taken from the field the sibling exposes for
 * exactly this purpose, so the gap is legible to a caller and to a reviewer instead of silent.
 *
 * The status is a judgment: RFC 9110 defines 501 as the server not supporting the functionality
 * required to fulfil the request, which is precisely what a boundary stub is. 500 was rejected
 * because it asserts a fault where none occurred — the service is behaving exactly as designed —
 * and a service-unavailable status was rejected because nothing here is temporarily unavailable.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 3 — DOMAIN FAILURE, 400. THE MESSAGE IS FORWARDED VERBATIM.
 * ------------------------------------------------------------------------------------------------
 * TRANSLATION DECISION (judgment (a)) — the single most important line of code in this file is the
 * one that copies the message across without touching it.
 *
 * ../errors/DomainError owns the four legacy thrown message strings, reproduced there character for
 * character from model/entity/Product.cfc:355, :357 and :362 and from
 * model/service/SkuService.cfc:204. They are observable behavior, so this module forwards them with
 * no rewording, no sentence-casing, no punctuation tidying, no trimming, no truncation, no
 * templating and — above all — NO SPELL CORRECTION.
 *
 * ONE OF THOSE FOUR MESSAGES CONTAINS TWO LEGACY MISSPELLINGS, AND BOTH MUST REACH THE CALLER
 * INTACT. They are byte-verified in the CFML source and are not typos introduced by this port.
 * Repairing either one is forbidden by AAP 0.8.2 Guideline 4 — do not enhance or optimize business
 * logic beyond what the migration requires — and by Guideline 2, which requires behavior be
 * preserved exactly as-is; AAP 0.7.3 S7 requires they be annotated rather than repaired. The
 * misspelled words are deliberately not written anywhere in this file, so there is exactly one
 * declaration site for them in the whole subtree and no possibility of a second copy drifting. The
 * mechanical guarantee is structural: this module applies no string operation of any kind to a
 * message — no replace, no case change, no normalisation, no concatenation — it only copies the
 * reference. TODO(parity): the two misspellings are retained from the legacy source and are
 * intentionally NOT corrected here or anywhere downstream.
 *
 * The status is a judgment, and the trade-off is stated rather than hidden. A DomainError is raised
 * deliberately by ported code that recognised the situation, and every message in the mandated
 * inventory that reaches this branch describes a request the service cannot satisfy — three of the
 * four are reached from a caller-supplied option selection — so 400 fits. The fourth, the
 * discriminator fallthrough in SKU creation, is arguably a data-state condition a reader could
 * argue belongs at 500. It is deliberately NOT special-cased: distinguishing it would mean matching
 * on message text, which would both create the error-code registry AAP 0.7.3 S9 forbids and make
 * the status depend on a string this port is contractually forbidden to inspect. One status for the
 * whole family is the honest resolution, and this paragraph is the disclosure.
 *
 * ------------------------------------------------------------------------------------------------
 * BRANCH 4 — ANYTHING ELSE, 500. NOTHING IS DISCLOSED.
 * ------------------------------------------------------------------------------------------------
 * A value this port did not raise is not a domain outcome: it is a programming fault, a driver
 * rejection, or a thrown non-error. The parameter is typed unknown because that is what a caught
 * value is under the compiler's catch-variable checking, and because a thrown value need not be an
 * error at all.
 *
 * NOTHING ABOUT IT REACHES THE BODY. Not its message, not its name, not its own properties. The
 * body carries a fixed neutral text.
 *
 * ------------------------------------------------------------------------------------------------
 * DISCLOSURE RULES THAT HOLD ON EVERY BRANCH
 * ------------------------------------------------------------------------------------------------
 * None of the following can reach a response body from this function, under any status code:
 *   - A stack trace. The stack member is never read on any branch.
 *   - The structured diagnostic payload a thrower may attach to a domain error. It is never read
 *     either, and that is a specific decision rather than an oversight: it exists to carry
 *     arbitrary facts known at throw time, so it could hold an identifier, an argument value or
 *     anything else a future thrower puts there. Diagnostic context belongs in a log, not in a
 *     response.
 *   - The underlying cause of an error. It is never read, for the same reason and one more: a cause
 *     originating in the data-access layer could carry statement text or connection detail.
 *   - Query text, a table or column identifier, a connection string, a credential, a database host,
 *     an internal file path, or the name or value of an environment variable. None of these is ever
 *     constructed, received or forwarded here — this module never touches them at all.
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
  // BRANCH 1 — must precede the DomainError test; see the note on branch ordering above.
  if (error instanceof ValidationError) {
    // getErrors() hands back the keyed structure unchanged. No transformation, no flattening, no
    // re-keying, no de-duplication and no sorting: the keys, their order and their exact strings
    // are the contract.
    const body: ErrorResponseBody = { message: error.message, errors: error.getErrors() };

    return jsonResponse(HTTP_STATUS.BAD_REQUEST, body);
  }

  // BRANCH 2 — also a DomainError subclass, so it too must precede the base test.
  if (error instanceof NotImplementedError) {
    const body: ErrorResponseBody = { message: error.message, member: error.member };

    return jsonResponse(HTTP_STATUS.NOT_IMPLEMENTED, body);
  }

  // BRANCH 3 — the verbatim pass-through. The message is copied, never processed.
  if (error instanceof DomainError) {
    const body: ErrorResponseBody = { message: error.message };

    return jsonResponse(HTTP_STATUS.BAD_REQUEST, body);
  }

  // BRANCH 4 — not raised by this port. The caught value is not inspected in any way.
  return messageResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, UNEXPECTED_FAILURE_MESSAGE);
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
      return messageResponse(HTTP_STATUS.BAD_REQUEST, BODY_ABSENT_MESSAGE);
    case 'malformed':
      return messageResponse(HTTP_STATUS.BAD_REQUEST, BODY_MALFORMED_MESSAGE);
    case 'notAnObject':
      return messageResponse(HTTP_STATUS.BAD_REQUEST, BODY_NOT_AN_OBJECT_MESSAGE);
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
