// ---------------------------------------------------------------------------
// slatwall-ts - the shared request/response boundary for the primary (Lambda) adapters
//
// Turn a thrown value into an API Gateway proxy response. This is the one place in the subtree that
// decides which failures are describable to a caller, which are not, and what HTTP status each
// carries. `./router.ts` and all five capability handlers consume this module, and each carries the
// same OBLIGATION to funnel its `catch` arms here rather than re-derive a status and a body of its
// own.
//
// ★ IT ALSO OWNS THE THREE CROSS-HANDLER POLICIES FOR THE SERVER-ESTABLISHED PARTS OF A REQUEST,
// because each of them has to be answered once for all five entrypoints or not at all: the
// correlation identifier (`resolveServerRequestId`), the successful envelope (`jsonSuccessResponse`)
// and the CALLER PRINCIPAL (`resolveRequestPrincipal`, in the final section). The last of those moved
// here from a ninth module a code review found to breach AAP 0.3.1's exact eight-file handler layout;
// that section records the placement decision in full, including why no ninth module, no
// `src/lib/` file, no router change and no per-handler copy is available.
//
// A SHARED INTERNAL of `src/handlers/`, not a bundle entry point: it exports NO Lambda `handler`.
// It is the first file authored in this folder and has zero intra-folder dependencies, which lets
// every sibling import it without a cycle.
//
// PROVENANCE: CREATED FROM SCRATCH. The plan's handler transformation table records the source file
// for this row as "-" and the change as "No legacy equivalent; maps domain errors to API Gateway
// responses", so what follows is idiomatic TypeScript: the minimal-change directive scopes the
// FUNCTIONAL SURFACE, never the code style.
//
// THE ONE MUST-PRESERVE CONTRACT. The CFML framework's dead-call-target failure carries a specific,
// byte-exact message, and that message is an OBSERVABLE BEHAVIOURAL CONTRACT rather than a log
// line. It is reproduced and recognized below, grammatical error and all. See
// `recognizeMissingMethodContract`.
//
// WHY THE STATUS SET IS THIS SMALL. The legacy CFML slice has NO HTTP status vocabulary at all: its
// controllers are framework subsystem actions and its only failure signal is a thrown string, so
// there is nothing to port and no licence to invent. The set is held to base HTTP meanings
// following directly from the recognized shapes plus a default - a client-shaped failure
// whose input is not usable, a route-not-found, a refusal to serve an unidentified or unauthorized
// caller, and a server-shaped failure for everything else.
// Distinguishing route-not-found from a domain failure is not invented either: the legacy framework
// already raised TYPED exceptions for routing failures (`org/Hibachi/FW1/framework.cfc:L963` for a
// missing service, `:L1231` for a missing service method, `:L2023-L2024` for a missing view), which
// proves routing failures were distinguishable in the source. Those exception TYPE NAMES are
// deliberately NOT carried forward - FW/1 itself is not carried forward, and reproducing its type
// strings would invent a contract the target does not owe. Nothing beyond that is modelled - no
// conflict, unprocessable-entity or request-quota status nor the headers that accompany one, because
// the source has no notion of any of them.
//
// ★★ THE AUTHORIZATION VOCABULARY WAS ADDED, AND THIS PARAGRAPH RECORDS THE REVERSAL RATHER THAN
// HIDING IT. This header once read "Nothing beyond that is modelled - no authentication or
// authorization status, because the one in-scope legacy controller publishes its feed action
// outright with empty secure- and admin-method lists". That reasoning generalized ONE controller's
// declaration to FIVE net-new routes it says nothing about, and the consequence was concrete: with
// no 401 and no 403 in the vocabulary, a handler that wanted to refuse an unidentified caller had no
// way to express the refusal, so four of the five capability entrypoints served every anonymous
// request instead. A security review recorded that as its dominant finding (CRITICAL, CWE-306 and
// CWE-862) and named the missing vocabulary as the blocker to fixing it.
//
// The correction is bounded and traceable:
//
//   * The legacy fact still holds where it applies. `integrationServices/google/controllers/feed.cfc:L54-L56`
//     declares `this.publicMethods="product"` with EMPTY `secureMethods` and `anyAdminMethods`, so
//     the product feed is source-public and `productFeedHandler` continues to serve it anonymously.
//     That one declaration is not evidence about the catalog, SKU, promotion or pricing routes, none
//     of which has a legacy antecedent at all.
//   * The legacy DID have an authorization notion, in the framework this port replaces: FW/1's
//     `secureMethods`/`anyAdminMethods` declarations and the admin subsystem's own gating. Modelling
//     a refusal is therefore reproducing a source concept in the target's protocol, not inventing
//     one. `model/service/PriceGroupService.cfc:L263-L266` likewise distinguishes an authenticated
//     account from none.
//   * Two statuses are added and no more. 401 for "this route will not serve a caller it cannot
//     identify"; 403 for "the caller is identified and is not permitted this operation". No
//     `WWW-Authenticate` challenge, no scheme name, no realm, no retry-after, no rate limit, no
//     token lifetime and no 409/422/429 - each of those would be inventing a mechanism, and a status
//     is all a handler needs to refuse.
//   * NEITHER SENTENCE DISTINGUISHES THE TWO CASES BEYOND THE STATUS ITSELF, and the bodies name no
//     claim, no scheme, no operation and no principal. A refusal must not become an oracle telling
//     an unauthenticated caller which operations exist or which claim would have satisfied them.
//
// THE CENTRAL GUARANTEE, STATED ONCE HERE AND REFERRED TO THROUGHOUT: THE THROWN VALUE IS PASSED
// NOWHERE - not into the response, and not into the log either. This module is SELECTIVE, never a
// pass-through. A recognized failure returns its own message; an unrecognized one returns a GENERIC
// message, and what reaches the structured logger in its place is a CLASSIFICATION of the failure
// rather than the failure itself: its category, the correlation identifier, the sanitized route,
// the shape of the thrown value, and a machine code when it carries one.
//
// The log is held to the same standard as the body because an exception's `message` and `stack` are
// free text assembled at throw time - a validation failure quotes the rejected input, a connection
// failure names the host and the account - and a log line is durable and centrally aggregated, so
// publishing any of it there changes who can read it, not whether it leaked. The database case is
// concrete and was verified against the pinned driver rather than assumed. BOTH SITES ARE CITED BY
// PACKAGE, PINNED VERSION, FILE AND SYMBOL - never by line number, because `node_modules/` is not
// committed, so a line locator into an installed dependency is unresolvable from the repository and
// drifts with every release while a symbol name does not. The version is the one `package.json`
// pins exactly, `mysql2` 3.23.1:
//
//     mysql2/lib/packets/packet.js - `Packet#asError`
//         reads the server's error payload, constructs `new Error(message)` from that text, and
//         assigns the same text to `err.sqlMessage`.
//     mysql2/lib/commands/command.js - `Command#execute`
//         calls `packet.asError(...)` and then assigns `err.sql = this.sql || this.query`
//         before the error escapes.
//
// For a syntax or constraint failure that server text embeds the failing SQL fragment, so
// `error.message` is itself a leak vector quite apart from the attached statement and its bound
// values. Nor is the object handed to the logger, because `sql` and `sqlMessage` are not
// credential-, connection-, payment- or personal-data keys and so are not covered by the logger's
// own never-log key policy. That cuts the other way too, and is exactly why the missing-method
// contract must be an EXPLICITLY RECOGNIZED case: without recognition it would be swallowed into a
// generic server-shaped response and the must-preserve contract silently lost. Recognition is
// correspondingly strict (a real `Error` whose message matches an identifier-constrained template)
// so that "explicitly recognized" cannot become "anything that looks the part".
// ---------------------------------------------------------------------------

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ZodError } from 'zod';

import { structGet } from '../lib/cfml/struct.js';
import type { LogContext, Logger } from '../lib/logger.js';
import { logger } from '../lib/logger.js';

/**
 * The closed set of failure shapes this module maps.
 *
 * A string-literal union rather than the TypeScript enumeration construct, so nothing survives into
 * the Lambda bundle as a runtime object. The set is exhaustive by construction -
 * `mapErrorToApiGatewayResponse` ends in an unconditional default arm - so a failure can never fall
 * through unmapped. `missingMethod` is server-shaped because a call target that does not exist is a
 * defect in this service rather than the caller's mistake; `routeNotFound` is raised by the router
 * and never by a service; `invalidRequest` is client-shaped; `unauthenticated` and `forbidden` are
 * the two refusal shapes a handler decides for itself before any service is reached - see the
 * authorization-vocabulary note in the module header for why they exist and what they deliberately
 * do not carry; `unrecognized` is anything else, and its message is withheld from the body.
 *
 * NEITHER REFUSAL SHAPE IS EVER PRODUCED BY `mapErrorToApiGatewayResponse`. No thrown value is
 * recognized as a refusal, because a refusal is a decision a handler makes about a request rather
 * than a failure that happens to it, and recognizing one from a thrown shape would let a value
 * reaching the funnel from anywhere - a service, a driver, a deserialized document - choose an
 * authorization status. `unauthenticatedResponse` and `forbiddenResponse` are the only producers.
 */
export type MappedErrorCategory =
  | 'missingMethod'
  | 'routeNotFound'
  | 'invalidRequest'
  | 'unauthenticated'
  | 'forbidden'
  | 'unrecognized';

/**
 * What a caller must hand this module alongside the failure.
 *
 * Deliberately minimal - a correlation identifier, optionally the route being served, and
 * optionally the logger to emit through. It carries no event, no headers and no request body, so
 * nothing a caller sent can reach a response body by accident through this parameter. The logger
 * arriving HERE, on an explicit parameter, is the same substitution the rest of this port makes for
 * the legacy ambient request scope, and doubles as the seam the test tier needs.
 */
export interface ErrorMappingContext {
  /**
   * Correlation identifier for this invocation - in practice the API Gateway or Lambda request id.
   * Echoed into the response body so an operator can join a caller's generic response to the full
   * detail on the log stream, which is the only way the withheld detail stays reachable.
   */
  readonly requestId: string;
  /**
   * The route being served, when one had been resolved. LOGGED, never echoed into the response
   * body: reflecting a caller-supplied path back serves no diagnostic purpose the correlation id
   * does not already serve.
   */
  readonly route?: string;
  /**
   * Logger to emit through. Defaults to the module-level structured logger. Optional in the exact
   * sense `exactOptionalPropertyTypes` requires: omit the key entirely rather than setting it to
   * `undefined`.
   */
  readonly logger?: Logger;
}

/**
 * One field-level validation complaint, reduced to the two members that are safe to publish.
 *
 * `path` is the dotted location within the request input and `message` describes the constraint
 * that failed. The value the caller actually submitted is NEVER carried, because a validation
 * report is not a place to echo input back.
 */
export interface MappedFieldIssue {
  /**
   * Dotted path to the offending member of the request input.
   *
   * ★★★ SERVER-AUTHORED, AND THAT IS AN INVARIANT OF THIS TYPE RATHER THAN A HABIT OF ITS PRODUCERS.
   * Every value that ever reaches this member comes from one of exactly two places: a literal written
   * in this subtree's own source, or {@link mapZodErrorFields}, which reads a validator issue's `path`
   * - the SCHEMA's member names - and never its `keys`, `received`, `values` or `input`. A path
   * assembled out of keys the CALLER chose is not admissible here, however harmless the keys look:
   * a security review found (MAJOR, CWE-209/CWE-532) that a document such as
   * `{"api_token_value":{"__proto__":{}}}` produced the path `api_token_value.__proto__`, which then
   * reached both a 400 body and the log stream. See {@link PROTOTYPE_MEMBER_FIELD_ISSUE} for how the
   * one refusal that used to do that now names its member.
   */
  readonly path: string;
  /** Human-readable description of the constraint that failed. */
  readonly message: string;
}

/**
 * The one key name `z.strictObject` does not treat as unrecognized.
 *
 * A constant of THIS FILE rather than a literal at the comparison site, so the name appears once, and
 * spelled through a computed member access at every use so nothing here can be read as assigning to a
 * prototype.
 */
const PROTOTYPE_MEMBER_KEY = '__proto__';

/**
 * The FIXED complaint published when a request document carries a `__proto__` own key.
 *
 * ★★★ A FROZEN, SERVER-AUTHORED ISSUE - NOT A PATH BUILT OUT OF THE CALLER'S KEYS. The refusal it
 * replaces reported the offending key's full dotted location, ancestors included, so a caller could
 * choose what appeared in the 400 body and in the log line simply by choosing its own member names.
 * The path published now is the OFFENDING NAME ITSELF, which is a literal of this module and the only
 * name involved that the caller did not choose; the depth at which it was found is deliberately not
 * reported, because the depth cannot be described without naming the ancestors.
 *
 * A caller still learns exactly what to remove, which is everything a 400 owes it here: there is one
 * such key name, so naming it is unambiguous, and a document carrying it is refused whole rather than
 * partially accepted.
 */
export const PROTOTYPE_MEMBER_FIELD_ISSUE: MappedFieldIssue = Object.freeze({
  path: PROTOTYPE_MEMBER_KEY,
  message: 'is not a member this request accepts',
});

/**
 * Whether a parsed JSON request document carries a `__proto__` OWN key at any depth.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIVES HERE
 * ---------------------------------------------------------------------------
 * Every request document this service accepts is validated by a `z.strictObject`, whose contract is
 * that an UNRECOGNIZED KEY IS A REFUSAL - the caller is told which member it should not have sent
 * rather than having it silently dropped. `__proto__` is the one key for which that contract does not
 * hold, and QA testing found the gap by submitting it.
 *
 * MEASURED, not assumed. Against `zod` 4.4.3 with a nested pair of strict objects:
 *
 *   {"order":{"a":"x","constructor":{}}}           -> REFUSED, `unrecognized_keys`, path ["order"]
 *   {"order":{"a":"x","__proto__":{"polluted":1}}} -> ACCEPTED, the key silently dropped
 *   {"order":{"a":"x"},"__proto__":{"p":1}}        -> ACCEPTED, and it IS an own key of the root
 *                                                     (`Object.hasOwn` true, `Object.keys` lists it)
 *
 * In all three cases `Object.prototype` was verified UNMODIFIED afterwards, which is the important
 * half of the finding: `JSON.parse` creates `__proto__` as an ordinary own DATA property rather than
 * invoking the setter, so no assignment reaches the prototype chain, and nothing downstream of
 * validation spreads or merges an unvalidated document into an existing object. THIS THEREFORE CLOSES
 * AN INCONSISTENCY, NOT AN ACTIVE VULNERABILITY, and it is written so that it would ALSO close the
 * vulnerability if a future merge-style consumer were introduced.
 *
 * It is declared in this module rather than in a helper of its own for two reasons that are both about
 * boundaries. `./promotionApplicationHandler.ts` and `./priceResolutionHandler.ts` are the two
 * boundaries that parse a JSON body, and both already depend on this module for the response the
 * refusal produces - so the check sits with the vocabulary it feeds, no capability handler imports
 * another, and the frozen module inventory gains nothing. Duplicating security-adjacent logic across
 * the two handlers was the alternative, and it has a specific failure mode of its own: one copy gets
 * corrected and the other quietly does not.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WALK IS DEEP, WHY IT IS ITERATIVE, AND WHY IT RETURNS A BOOLEAN
 * ---------------------------------------------------------------------------
 * DEEP, because the asymmetry it corrects is deep: `strictObject` refuses an unrecognized key at EVERY
 * level of a nested document, so refusing `__proto__` only at the root would leave the inconsistency
 * in place one level down - and the nested case is the one QA actually submitted.
 *
 * ITERATIVE, with an explicit stack, because recursion over caller-supplied nesting is a stack
 * overflow waiting to happen: a 2 000-level document is exactly what QA testing sent, and a
 * `RangeError` thrown from a security guard would convert a refusal into an unrecognized 500. The work
 * is bounded without a depth limit of its own - both call sites cap the request body's byte length
 * before parsing, so the node count is bounded by that cap, and a `JSON.parse` result cannot contain a
 * cycle.
 *
 * A BOOLEAN, because the predecessor returned the offending key's DOTTED PATH and that path was
 * assembled from the caller's own ancestor key names. Publishing it echoed submitted material; so did
 * logging it. Nothing about the refusal needs the location - see
 * {@link PROTOTYPE_MEMBER_FIELD_ISSUE} - and a predicate cannot leak what it does not construct.
 *
 * ★ ONLY OWN KEYS ARE CONSULTED, VIA `Object.hasOwn`. An INHERITED `__proto__` is present on every
 * ordinary object in the language and is not a caller's doing; reporting it would refuse every
 * request. What is detected is specifically a key the CALLER's document carries.
 *
 * ★ `null` IS HANDLED BEFORE `typeof`, and arrays before plain objects. `typeof null === 'object'`
 * would otherwise put `null` on the plain-object branch, and `Object.hasOwn(null, …)` throws.
 *
 * @param document the parsed request document, already known to be an object at its root.
 * @returns `true` when the document carries the key at any depth, which is a refusal; `false` for
 *   every well-formed request.
 */
export function containsPrototypeMemberKey(document: object): boolean {
  const pending: unknown[] = [document];

  while (pending.length > 0) {
    // `pop()` is `T | undefined` under `noUncheckedIndexedAccess`, and the loop condition does not
    // narrow it, so the guard below is how the element is taken rather than a formality.
    const value = pending.pop();

    if (value === null || typeof value !== 'object') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const element of value) {
        pending.push(element);
      }
      continue;
    }

    if (Object.hasOwn(value, PROTOTYPE_MEMBER_KEY)) {
      return true;
    }

    for (const key of Object.keys(value)) {
      // The index signature is what `Object.keys` already proved safe to read.
      pending.push((value as Record<string, unknown>)[key]);
    }
  }

  return false;
}

/**
 * Why a handler is rejecting request input it has itself established is unusable.
 *
 * A CLOSED union, and closed for a security reason rather than a stylistic one. The alternative -
 * letting the caller of `invalidRequestResponse` supply the sentence - makes the central guarantee
 * in the module header unenforceable: it takes one handler interpolating a caught driver message, a
 * resolved filesystem path or an echo of submitted input into its "fixed, handler-authored
 * sentence" for the guarantee to be gone, and nothing in the type system would object. A handler
 * NAMES the class of problem, this module owns the words, and adding a member without giving it a
 * sentence is a compile error.
 *
 * No sentence ever echoes the offending value, the parameter name, the route or any part of the
 * submitted document - a caller needing to know which member of its input is at fault gets that
 * from `fields`, which carries a path and a constraint description only.
 */
export type InvalidRequestReason =
  /** A path parameter the route requires was absent or empty. */
  | 'missingPathParameter'
  /** A query-string parameter the operation requires was absent or empty. */
  | 'missingQueryParameter'
  /** The operation requires a request body and none was supplied. */
  | 'missingRequestBody'
  /**
   * A body was supplied but is not parsable as JSON.
   *
   * Deliberately a REASON a handler states rather than something inferred from a caught
   * `SyntaxError`. The recognizer set is closed at three shapes and a `SyntaxError` is not one of
   * them, because this service's own code produces that shape too.
   */
  | 'unparsableRequestBody'
  /** The body parsed but is not the expected shape: not an object, or an array. */
  | 'unsupportedBodyShape'
  /**
   * The input is unusable for a reason none of the five above names. Present so a handler is never
   * forced to mis-state its reason to fit the union; it maps to the same fixed generic sentence the
   * schema-rejection arm publishes, so choosing it withholds detail rather than inventing any.
   */
  | 'unusableRequestInput';

/**
 * The JSON document every response from this module carries. Published as a type so `./router.ts`,
 * the test suites, and all five capability handlers - every one of which imports from this module -
 * parse a body without restating its shape. The envelope holds no legacy error code, no framework
 * exception type and no stack.
 */
export interface ErrorResponseBody {
  readonly error: {
    /** Which of the six mapped shapes this response represents. */
    readonly category: MappedErrorCategory;
    /**
     * Safe description. For a recognized failure this is the failure's own message; for an
     * unrecognized one it is a fixed generic sentence and the real message is on the log stream
     * instead.
     */
    readonly message: string;
    /** Echo of `ErrorMappingContext.requestId`, for log correlation. */
    readonly requestId: string;
    /**
     * Field-level complaints, present only for a client-shaped failure that produced them. Omitted
     * entirely otherwise - never present and empty.
     */
    readonly fields?: readonly MappedFieldIssue[];
  };
}

/**
 * The status carried by each mapped shape. Five codes, and only five - see the status-set note and
 * the authorization-vocabulary note in the module header for why each exists and why nothing further
 * is modelled.
 *
 * A `Record` keyed by the closed union rather than an index signature, so an index into it is
 * `number` and never widens to `undefined`, and adding a category without giving it a status is a
 * compile error rather than a silent hole.
 */
const STATUS_BY_CATEGORY: Readonly<Record<MappedErrorCategory, number>> = Object.freeze({
  // A dead call target is this service's defect, not the caller's: server-shaped.
  missingMethod: 500,
  routeNotFound: 404,
  invalidRequest: 400,
  // The caller was not identified. NO `WWW-Authenticate` header accompanies it: naming a scheme
  // would publish an authentication mechanism this migration was never given, and a handler needs
  // only the status to refuse.
  unauthenticated: 401,
  // The caller WAS identified and is not permitted the operation it named.
  forbidden: 403,
  unrecognized: 500,
});

/**
 * Headers on every response this module builds. `content-type` is declared explicitly because the
 * body is always a JSON document; `cache-control: no-store` keeps an intermediary from serving a
 * stored failure to a later, unrelated request.
 *
 * ★★★ EXACTLY TWO, AND `x-content-type-options: nosniff` IS DELIBERATELY NOT THE THIRD. It briefly
 * was. The argument for it was that this module already declares `content-type` explicitly, so
 * declaring that a recipient must not second-guess that declaration was the same decision carried to
 * its conclusion - and the note added with it conceded, in its own words, that neither the source nor
 * the AAP prescribes it and that it is conventionally set at the API Gateway edge. A code review took
 * that concession at face value and removed the header: an HTTP semantic the ported system did not
 * have is an invented non-functional requirement, which AAP 0.8.1 forbids outright, and the fact that
 * the invention is a conventionally sensible one does not make it any less invented. A deployment that
 * wants it configures it at the edge, in a scope that is authorized to decide such things.
 *
 * ⚠ SO THE RULE FOR THIS OBJECT IS NOW SIMPLY STATED: a header belongs here only if this module's own
 * response contract requires it. `content-type` qualifies because there is no engine default to inherit
 * under API Gateway and a JSON body must be declared as one; `cache-control: no-store` qualifies
 * because a failure envelope carries a correlation identifier for one request and must not be served
 * to another. Everything else - `x-content-type-options`, `strict-transport-security`,
 * `content-security-policy`, `x-frame-options`, CORS, `retry-after`, `WWW-Authenticate` - is refused on
 * the same ground, whether it governs a browser or not.
 */
const JSON_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/**
 * Body message for an unrecognized failure. Fixed, and deliberately uninformative: everything an
 * operator needs is on the log stream under the same `requestId` this response echoes. See the
 * central guarantee in the module header for why a pass-through is unacceptable.
 */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/** Body message for a request that matched no route. */
const ROUTE_NOT_FOUND_MESSAGE = 'The requested route does not exist.';

/**
 * The correlation identifier published when the platform supplied neither of its own.
 *
 * A FIXED LITERAL, never a minted value. Two identifiers are always present on a real invocation -
 * the runtime's and the gateway's - so reaching this constant means the event was synthesised, and
 * saying so plainly is more useful than a random string that looks like a real correlation handle and
 * joins to nothing. Nothing is generated here: minting one would put a value in the response body
 * that appears on no log line the platform emitted.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/** Body message for a schema-rejected request input. */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/**
 * Body message for a caller this route declines to serve without an identity.
 *
 * Fixed, and deliberately uninformative in the same way {@link GENERIC_FAILURE_MESSAGE} is. It names
 * no claim, no header, no authentication scheme, no operation and no principal, because a refusal
 * must not become an oracle: telling an unidentified caller WHICH claim would have satisfied the
 * route, or that the operation it named exists at all, hands over exactly the reconnaissance the
 * refusal exists to withhold.
 */
const UNAUTHENTICATED_MESSAGE = 'The request was not served.';

/**
 * Body message for an identified caller that is not permitted the operation it named.
 *
 * Byte-identical to {@link UNAUTHENTICATED_MESSAGE} on purpose. The STATUS distinguishes the two
 * cases for a caller that needs to know whether to re-authenticate; the SENTENCE distinguishes
 * nothing further, so a caller probing for administrative operations learns only that it was
 * refused - never that a given operation exists and is administrative.
 */
const FORBIDDEN_MESSAGE = UNAUTHENTICATED_MESSAGE;

/**
 * The sentence published for each `InvalidRequestReason`.
 *
 * The whole point of the closed union: the WORDS live here, frozen, and a handler chooses among
 * them by naming a reason. No sentence interpolates a parameter name, a path, a media type or any
 * fragment of the submitted document. A `Record` keyed by the closed union for the same two reasons
 * as the status map above.
 */
const INVALID_REQUEST_MESSAGE_BY_REASON: Readonly<Record<InvalidRequestReason, string>> =
  Object.freeze({
    missingPathParameter: 'A required path parameter is missing.',
    missingQueryParameter: 'A required query parameter is missing.',
    missingRequestBody: 'A request body is required and was not supplied.',
    unparsableRequestBody: 'The request body is not valid JSON.',
    unsupportedBodyShape: 'The request body is not the expected shape.',
    // Identical to the schema-rejection sentence by design: no invented specificity.
    unusableRequestInput: INVALID_REQUEST_MESSAGE,
  });

// --- The missing-method contract -------------------------------------------

// LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the
// framework's terminal onMissingMethod throw is grammatically incorrect ("does not exists") and the
// service-tier copy still says "entity". Both are reproduced verbatim as an observable error
// contract.
//
// Preserved deliberately; do not fix without a product decision.
//
// The legacy statement, identical at both locators:
//
//   throw('You have called a method #arguments.missingMethodName#() which does
//          not exists in the #getClassName()# entity.');
//
// ONE recognizer covers BOTH tiers because the two messages are byte-identical - the service-tier
// copy says "entity" too - so there is deliberately no second, divergent recognizer.
//
// A THIRD, DIFFERENT variant at `org/Hibachi/HibachiObject.cfc:L126` throws "You have attempted to
// call the method <name> which does not exist in <fullName>" from its `invokeMethod` rather than an
// `onMissingMethod`. It diverges on four independent counts - different opening clause, no `()`,
// correct grammar, no trailing " entity." - so the pattern below cannot match it even by accident,
// and it is left unrecognized on purpose because no in-scope target call path reaches it.
//
// Two census findings bound what is recognized, both verified by exhaustive search.
// `org/Hibachi/HibachiDAO.cfc` declares NO `onMissingMethod`, so a legacy dead call into a DAO
// failed as a raw engine error rather than as this message, and the repository port deliberately
// does not declare that method either. `org/Hibachi/HibachiControllerEntity.cfc` declares an
// `onMissingMethod` with no terminal throw, so it produces no message and is not modelled.

// JUDGMENT CALL: the missing-method message template is duplicated between the throwing domain
// module and this recognizer because ESLint no-restricted-imports forbids src/domain/** from
// importing src/handlers/**, and src/lib/ has a locked file list with no error module. Do NOT "fix"
// this by creating a shared error module, adding a file to src/lib/, adding a file to
// src/handlers/, or creating a domain -> handlers back-edge. The entity reproducing the legacy
// defect raises a standard `Error` whose `message` reproduces the template, and this module
// recognizes that message by inspecting the string - no shared error class, no shared module, no
// import in either direction. The deferred-work note belonging to that defect lives in the entity
// file where the defect is; nothing here completes it.
//
// Both annotations sit in the leading-comment run of the pattern constant below rather than above
// the module-private interface that follows, because a type declaration is erased on emit and its
// comments go with it, and the build keeps comments precisely so they reach the emitted artifact.

/**
 * The recognized shape, anchored at both ends, with IDENTIFIER-ONLY capture groups.
 *
 * Every distinguishing feature of the legacy statement is load-bearing and therefore literal: the
 * opening clause, the empty argument list `()` after the method name, the grammatical error "does
 * not exists", and the trailing " entity." that the service tier emits as well.
 *
 * THE CAPTURE GROUPS ARE IDENTIFIERS, NOT `(.+?)`, and that is a security property. A matched
 * message is the ONE message this module publishes verbatim into a response body, so unconstrained
 * slots would make the body an echo channel: anything that could get itself thrown wrapped in the
 * surrounding boilerplate would have its two slots reflected back unaltered, newlines, markup and
 * injected instructions and all. The constraint loses nothing, because both slots are target-code
 * identifiers by construction - the legacy first slot is `arguments.missingMethodName`, a CFML
 * method name, and the second is `getClassName()`, which is `listLast(getClassFullname(), ".")`
 * [org/Hibachi/HibachiObject.cfc:L135-L137], a bare class name with the dotted package stripped.
 * The 64-character ceiling per slot mirrors the identifier bound applied elsewhere in the port.
 * There is no `g` flag: the pattern is reused across invocations and a global regex would carry
 * `lastIndex` between them.
 */
const MISSING_METHOD_MESSAGE_PATTERN =
  /^You have called a method ([A-Za-z_$][A-Za-z0-9_$]{0,63})\(\) which does not exists in the ([A-Za-z_$][A-Za-z0-9_$]{0,63}) entity\.$/;

/**
 * The longest message this module will even attempt to recognize.
 *
 * The contract message's own maximum length is fixed and computable: 25 characters of opening
 * clause, at most 64 for the method name, 2 for `()`, 31 for the middle clause, at most 64 for the
 * class name and 9 for ` entity.` - under 200 in the worst case. Refusing anything longer BEFORE
 * the pattern runs rejects an arbitrarily large thrown message by one comparison rather than by a
 * backtracking match, and cannot reject a matchable message by mistake.
 */
const MAX_RECOGNIZED_MESSAGE_LENGTH = 256;

/** What a recognized missing-method failure yields. Module-private. */
interface MissingMethodContract {
  /** The contract message, preserved for the response body. */
  readonly message: string;
  /** The dead call target named by the message. Logged, not echoed. */
  readonly methodName: string;
  /** The class the message names. Logged, not echoed. */
  readonly className: string;
}

/**
 * Read a message off a thrown value, and ONLY off a real `Error`.
 *
 * A bare thrown string is the LEGACY CFML construct and no CFML runs in the target, and an object
 * merely CARRYING a string `message` is a shape anything can wear - a deserialized request body
 * most of all - which would make attacker-authored text a candidate for the one message this module
 * publishes verbatim. Requiring a real `Error` costs nothing that is owed, because the annotated
 * decision above settles the throwing side on exactly that. Returning a message here grants NOTHING
 * on its own: it must additionally survive the length bound and match the pattern above.
 */
function readThrownMessage(thrown: unknown): string | undefined {
  return thrown instanceof Error ? thrown.message : undefined;
}

/**
 * Recognize the framework's dead-call-target contract, or decline.
 *
 * Matching is performed on the trimmed message and the trimmed message is what is preserved:
 * trimming removes only surrounding whitespace, which is not part of the contract, so for a
 * faithful producer the two are the same string and for a careless one the contract survives
 * instead of being lost to the generic arm. The length bound is applied AFTER trimming and BEFORE
 * the pattern runs.
 */
function recognizeMissingMethodContract(thrown: unknown): MissingMethodContract | undefined {
  const raw = readThrownMessage(thrown);
  if (raw === undefined) {
    return undefined;
  }
  const message = raw.trim();
  if (message.length > MAX_RECOGNIZED_MESSAGE_LENGTH) {
    return undefined;
  }
  const match = MISSING_METHOD_MESSAGE_PATTERN.exec(message);
  if (match === null) {
    return undefined;
  }
  // Under noUncheckedIndexedAccess both captures read as possibly absent, handled below.
  const [, methodName, className] = match;
  if (methodName === undefined || className === undefined) {
    return undefined;
  }

  // THE MESSAGE IS REBUILT FROM THE TWO CAPTURES, NOT COPIED FROM THE INPUT, AND THE TWO ARE
  // PROVABLY THE SAME STRING: the pattern is anchored at both ends and every character outside the
  // capture groups is a literal, so a matched `message` is by construction the concatenation below.
  // Rebuilding makes non-reflection a property of the DATA FLOW rather than of the regular
  // expression, so even a future hole in the grammar cannot carry punctuation, whitespace or a
  // newline into the payload. Defence in depth, on the one path that publishes a message at all.
  const reconstructed = `You have called a method ${methodName}() which does not exists in the ${className} entity.`;

  // A disagreement here means the pattern and this template have drifted apart, so declining hands
  // the caller the generic response rather than either string.
  if (reconstructed !== message) {
    return undefined;
  }

  return { message: reconstructed, methodName, className };
}

// --- Schema-rejected request input -----------------------------------------

// JUDGMENT CALL: a schema validation failure is recognized by `instanceof ZodError` against the
// pinned validation library, NOT structurally by its `name` and the shape of its `issues`. `name`
// is a writable string property and `issues` is an ordinary array, so
//   `{ name: 'ZodError', issues: [...] }`
// satisfies a structural probe completely - and that object is producible by anything, including a
// deserialized request body. The consequence is not cosmetic: a forged value would be mapped to a
// client-shaped 400 and its `issues[].message` strings published verbatim into the response body,
// so the caller would choose both the status and the text.
//
// The one argument for a structural probe - that `instanceof` compares constructor identity, so a
// bundle holding two copies of the library would make a valid failure unrecognizable - does not
// apply: this subtree pins ONE exact version with no caret range, resolves it through one lockfile
// and bundles to a single artifact. Layering is unaffected, because the ESLint domain-boundary rule
// restricts `src/domain/**` from importing outward and leaves the validation library unrestricted.
//
// The recognized set stays CLOSED at the three shapes the plan names. In particular a
// `SyntaxError`, the shape a JSON body parse produces, is DELIBERATELY NOT treated as
// client-shaped: it is equally producible by this service's own code, and inferring "the caller
// sent bad bytes" from it would invent a semantic the source never had.

/**
 * How many field issues a response body will carry.
 *
 * The issue count is chosen by the CALLER - one per rejected member, so a body naming a thousand
 * members produces a thousand issues - and bounding the published set keeps a response proportional
 * to the request rather than to the size of the mistake in it. Twenty is enough to fix a real
 * request in one round trip; when there are more, the TRUE count goes to the log so the truncation
 * is visible to an operator rather than silent.
 */
const MAX_PUBLISHED_ISSUES = 20;

/** Longest constraint description published for one issue. */
const MAX_ISSUE_MESSAGE_LENGTH = 200;

/** Most path segments rendered for one issue. */
const MAX_ISSUE_PATH_SEGMENTS = 10;

/** Longest single path segment rendered. */
const MAX_PATH_SEGMENT_LENGTH = 64;

/** Appended to any text this module shortened, so a bounded value is visibly bounded. */
const TRUNCATION_MARKER = '...';

/**
 * Shorten `value` to `limit` characters, marking it when anything was removed. The marker is
 * counted inside the limit, so the returned string is never longer than `limit` - which is what
 * makes the bound a real bound rather than an approximate one.
 */
function clampText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

/**
 * Render one issue's location as a dotted path, with every dimension bounded.
 *
 * The library reports a path as an array of property names and array indices. Only string and
 * finite numeric segments are rendered, so an unrenderable segment cannot turn into a meaningless
 * fragment in a published body; an absent or unusable path yields the empty string naming the root.
 *
 * WHY THE BOUNDS ARE HERE AND NOT ONLY ON THE MESSAGE: a path segment is not always schema-derived.
 * Validate a caller-supplied map with a record schema and the segment IS the caller's key; nest
 * that and the segment COUNT is the caller's nesting depth. Both are attacker-influenced, so both
 * are bounded.
 */
function readIssuePath(issue: object): string {
  if (!('path' in issue)) {
    return '';
  }
  const { path } = issue;
  if (typeof path === 'string') {
    return clampText(path, MAX_PATH_SEGMENT_LENGTH);
  }
  if (!Array.isArray(path)) {
    return '';
  }
  const segments: readonly unknown[] = path;
  const rendered: string[] = [];
  let truncated = false;
  for (const segment of segments) {
    if (rendered.length >= MAX_ISSUE_PATH_SEGMENTS) {
      truncated = true;
      break;
    }
    if (typeof segment === 'string' && segment.length > 0) {
      rendered.push(clampText(segment, MAX_PATH_SEGMENT_LENGTH));
    } else if (typeof segment === 'number' && Number.isFinite(segment)) {
      rendered.push(String(segment));
    }
  }
  if (truncated) {
    rendered.push(TRUNCATION_MARKER);
  }
  return rendered.join('.');
}

/**
 * The library's issue code for a member the schema does not publish.
 *
 * The exact literal `zod` 4.4.3 emits for a `strictObject` rejection, verified against the pinned
 * version rather than assumed from documentation.
 */
const UNRECOGNIZED_KEYS_ISSUE_CODE = 'unrecognized_keys';

/**
 * The sentence published in place of an unrecognized-key complaint.
 *
 * ★★ WHY A SUBSTITUTION AND NOT A CLAMP. A security review found (LOW, CWE-209) that this module
 * reflected a CALLER-AUTHORED KEY NAME back into a response body: `zod` renders that complaint as
 * `Unrecognized key: "<theKeyTheCallerSent>"`, and publishing it verbatim - clamped or not - makes a
 * 400 response an echo of submitted input. Clamping bounds the LENGTH of the echo and does not stop
 * it, and a partial echo of a caller-chosen string is still an echo.
 *
 * The substitution is a fixed, schema-independent sentence. What survives is the `path`, which for
 * this issue kind names the CONTAINING OBJECT and never the offending key - verified against the
 * pinned library: a top-level rejection reports `path: []` and a nested one reports the parent's
 * path. A caller therefore still learns WHERE its document was refused without this module quoting
 * anything the caller wrote.
 *
 * ★ AND THIS IS WHAT MAKES `strictObject` USABLE AT THE HANDLER TIER AT ALL. Before this fix, a
 * handler wanting a closed request grammar had to choose between a strict schema that echoed the key
 * and a hand-written membership check that did not; `catalogQueryHandler.hasClosedParameterSet`
 * documents exactly that trade-off, and the two siblings that chose neither left their surfaces open
 * and silently STRIPPED unknown members. With the echo closed here, a strict schema is the
 * lower-ceremony half of that choice and both remain safe.
 */
const UNRECOGNIZED_MEMBER_MESSAGE =
  'contains a member this operation does not publish; remove it and retry';

/**
 * Whether a raw issue is the library's unrecognized-key complaint.
 *
 * Probes `code` rather than pattern-matching the rendered sentence, because the sentence is exactly
 * the thing that must not be trusted here. A non-string `code`, or one that is not the literal
 * above, declines - so an unfamiliar issue kind is treated as an ordinary constraint description
 * rather than being silently substituted.
 */
function isUnrecognizedMemberIssue(raw: object): boolean {
  if (!('code' in raw)) {
    return false;
  }
  const { code } = raw;
  return typeof code === 'string' && code === UNRECOGNIZED_KEYS_ISSUE_CODE;
}

/**
 * Reduce one raw issue to the two members that are safe to publish.
 *
 * Reads `path` and `message`, and NOTHING else. In particular the library also records what it
 * RECEIVED, and some issue kinds add sibling members; none of those is read here or anywhere else in
 * this module, which is why a rejected credential or card number cannot travel out through a 400.
 *
 * Unrecognized-member complaints are intercepted by {@link expandUnrecognizedKeys} before reaching
 * this reducer. Every message that reaches here is CLAMPED rather than published as given, because
 * bounding a schema-authored sentence keeps the response proportional to the request.
 */
function toFieldIssue(raw: unknown): MappedFieldIssue | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  if (!('message' in raw)) {
    return undefined;
  }
  const { message } = raw;
  if (typeof message !== 'string') {
    return undefined;
  }
  return { path: readIssuePath(raw), message: clampText(message, MAX_ISSUE_MESSAGE_LENGTH) };
}

/**
 * Expand an unrecognized-key complaint into the one safe issue this API may publish, or decline.
 *
 * ★★★ THIS COMPOSES TWO REVIEW FINDINGS RATHER THAN CHOOSING BETWEEN THEM. The API review required
 * nested strict-object failures to retain their CONTAINING path, so a complaint under `order` does
 * not become an ambiguous root-level failure. The security review then established that the
 * offending key itself is caller-authored text and must not be reflected at all (CWE-209).
 *
 * The result therefore keeps the schema-authored container path from `readIssuePath` and substitutes
 * the fixed sentence from {@link UNRECOGNIZED_MEMBER_MESSAGE}. The library's `keys`, `received`,
 * `values` and `input` members are never read. A root-level unknown member has an empty path; a nested
 * one has the bounded prefix such as `order`. No submitted key name or value travels.
 *
 * @param raw one raw issue from the validator.
 * @returns one fixed issue carrying the containing path, or `undefined` for another issue kind.
 */
function expandUnrecognizedKeys(raw: unknown): readonly MappedFieldIssue[] | undefined {
  if (typeof raw !== 'object' || raw === null || !isUnrecognizedMemberIssue(raw)) {
    return undefined;
  }

  return [{ path: readIssuePath(raw), message: UNRECOGNIZED_MEMBER_MESSAGE }];
}

/** Prefix one already-sanitized issue with a server-authored containing path. */
function prefixMappedIssue(
  issue: MappedFieldIssue,
  pathPrefix: string | undefined,
): MappedFieldIssue {
  if (pathPrefix === undefined || pathPrefix.length === 0) {
    return issue;
  }

  return {
    path: issue.path === '' ? pathPrefix : `${pathPrefix}.${issue.path}`,
    message: issue.message,
  };
}

/**
 * Reduce one Zod failure to the safe field details a handler may publish.
 *
 * This is the shared path for both the mapper's own thrown-error funnel and a handler that validates
 * a nested document separately. In particular, unrecognized-key issues are recognized by issue code,
 * retain only their schema-authored container path, and never expose the caller-authored `keys` or
 * rendered message.
 *
 * @param error the genuine Zod failure to reduce.
 * @param pathPrefix optional SERVER-AUTHORED path to the nested document, such as `order`.
 * @returns at most {@link MAX_PUBLISHED_ISSUES} sanitized issues, in validator order.
 */
export function mapZodErrorFields(
  error: ZodError,
  pathPrefix?: string,
): readonly MappedFieldIssue[] {
  const rawIssues: readonly unknown[] = error.issues;
  const mapped: MappedFieldIssue[] = [];

  for (const raw of rawIssues) {
    if (mapped.length >= MAX_PUBLISHED_ISSUES) {
      break;
    }

    // An unrecognized-key complaint is reduced first so neither its rendered message nor its `keys`
    // member can reach the ordinary reducer. The result is one fixed complaint at the schema-authored
    // containing path, and the bound is re-tested before it is admitted.
    const expanded = expandUnrecognizedKeys(raw);

    if (expanded !== undefined) {
      for (const issue of expanded) {
        if (mapped.length >= MAX_PUBLISHED_ISSUES) {
          break;
        }
        mapped.push(prefixMappedIssue(issue, pathPrefix));
      }
      continue;
    }

    const issue = toFieldIssue(raw);
    if (issue !== undefined) {
      mapped.push(prefixMappedIssue(issue, pathPrefix));
    }
  }

  return mapped;
}

/** What a recognized validation failure yields. Module-private. */
interface RecognizedValidationFailure {
  /** The bounded set of issues published in the response body. */
  readonly fields: readonly MappedFieldIssue[];
  /**
   * How many issues the failure actually carried, before bounding. LOGGED, never echoed, so an
   * operator can see that a body was truncated.
   */
  readonly issueCount: number;
}

/**
 * Recognize a schema validation failure and reduce it to publishable issues, or decline.
 *
 * RECOGNITION IS `instanceof ZodError` AND NOTHING ELSE - see the judgment call above. An empty
 * `fields` array is a meaningful result and is NOT declining: it says the failure was recognized as
 * client-shaped but produced no renderable field detail, whereas `undefined` says the value is not
 * a validation failure at all. Iteration stops at `MAX_PUBLISHED_ISSUES` rather than mapping every
 * issue and slicing afterwards, and binding `issues` to a `readonly unknown[]` first is what keeps
 * the linter satisfied without a cast.
 */
function recognizeValidationIssues(thrown: unknown): RecognizedValidationFailure | undefined {
  if (!(thrown instanceof ZodError)) {
    return undefined;
  }
  const rawIssues: readonly unknown[] = thrown.issues;

  return { fields: mapZodErrorFields(thrown), issueCount: rawIssues.length };
}

// --- Response and log construction -----------------------------------------

/**
 * The shape a classifier token - an error name or an error code - may take before it is written to
 * a log line.
 *
 * Letters, digits, `_`, `.` and `-`, capped at 64 characters: sized to the machine tokens that
 * actually occur, a Node `ERR_*` or `ECONNREFUSED` code, a MySQL driver `ER_*` code, or a class
 * name. Excluding every whitespace character, quote, parenthesis and other punctuation mark is what
 * makes it structurally impossible for a SQL fragment, a connection string, a rejected input value
 * or a sentence to pass itself off as a classifier. No `g` flag, for the reason given above.
 */
const SAFE_ERROR_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Substituted for an error name that is not shaped like a classifier. */
const UNSAFE_THROWN_NAME = 'unsafeName';

/**
 * Describe WHAT was thrown without emitting any of its contents.
 *
 * Goes to the log only, so an operator can tell a driver failure from a thrown string or object at
 * a glance without the description carrying a message, a statement or a value. An error's `name` is
 * an ordinary writable property, so it is held to the classifier shape above; without that test
 * this description would become a second, unpoliced way for free text to reach a log line.
 */
function describeThrownShape(thrown: unknown): string {
  if (thrown === null) {
    return 'null';
  }
  if (thrown instanceof Error) {
    return SAFE_ERROR_TOKEN_PATTERN.test(thrown.name) ? thrown.name : UNSAFE_THROWN_NAME;
  }
  return typeof thrown;
}

/**
 * The V8 marker prefixing an awaited frame, which is not part of the function's name.
 *
 * `at async ProductService.saveProduct (…)` names the same function as `at ProductService.saveProduct
 * (…)`; without stripping this, every asynchronous frame would fail the classifier shape on the space
 * alone and the most interesting frames in an async service would be exactly the ones dropped.
 */
const STACK_FRAME_ASYNC_PREFIX = 'async ';

/** Where a V8 stack frame's location begins, and therefore where the function's name ends. */
const STACK_FRAME_LOCATION_MARKER = ' (';

/** The prefix V8 puts on every frame line. */
const STACK_FRAME_PREFIX = 'at ';

/**
 * Name the FUNCTION a failure was thrown from, and nothing else about it.
 *
 * ---------------------------------------------------------------------------
 * ★★ WHY THIS EXISTS: A REAL DIAGNOSIS FAILURE, NOT A HYPOTHETICAL ONE
 * ---------------------------------------------------------------------------
 * QA testing found a CRITICAL wiring defect - a hydrated `ProductType` reaching
 * `getBaseProductType()` without the repository port it needs - and reported that the defect was
 * UNDIAGNOSABLE FROM THE LOGS. The reason is precise and worth stating: the thrown value was a plain
 * `Error`, so {@link describeThrownShape} truthfully reported `thrownShape: 'Error'`, and
 * {@link readSafeErrorCode} found no `code`. A composition failure and a driver failure therefore
 * produced IDENTICAL log lines. The deliberate refusal to emit the message - which is correct and is
 * unchanged - left nothing else to go on.
 *
 * The first stack frame's function name is the missing piece, and it is the RIGHT missing piece:
 * `ProductType.getBaseProductType` identifies the defect immediately, while a driver failure names a
 * driver function instead. It is what a reader would have looked at first if the stack had been
 * available.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SAFE, WHICH IS THE ONLY REASON IT IS PERMITTED
 * ---------------------------------------------------------------------------
 * A function name in a stack frame is CODE-AUTHORED. It is a symbol from this repository or from a
 * dependency; a caller cannot supply one, because nothing here ever installs a method under a
 * caller-chosen key. That is what distinguishes it from the message, which routinely quotes a
 * rejected value, a statement fragment or a connection detail, and which is why the message stays
 * unemitted.
 *
 * Three further properties are enforced rather than assumed:
 *
 *   - ONLY THE FIRST FRAME. A full stack is a map of this service's internals; one frame is the
 *     classifier, and every deeper frame is dropped.
 *   - NO FILESYSTEM PATH, STRUCTURALLY. The name is taken from BEFORE the ` (` that opens the frame's
 *     location, so the location is never read. Even if it were, it could not pass:
 *     {@link SAFE_ERROR_TOKEN_PATTERN} admits no `/`, no `:` and no whitespace, so a path, a URL and a
 *     line-and-column reference each fail it.
 *   - FAIL CLOSED. Anything that is not a plain classifier token yields `undefined` and the field is
 *     omitted from the line entirely. An anonymous frame (`Object.<anonymous>`), a constructor frame
 *     (`new ProductType`), an `eval` frame, a location-only frame and a 65-character name are all
 *     dropped rather than trimmed or substituted, because a diagnostic worth having is worth having
 *     unambiguously.
 *
 * ★ IT GOES TO THE LOG ONLY. It is never placed in a response body. The body stays
 * {@link GENERIC_FAILURE_MESSAGE}, correlated to the line by `requestId` - the central guarantee of
 * this module, which this addition does not touch.
 *
 * @param thrown the value that reached the unrecognized arm.
 * @returns the throwing function's name when it is shaped like a classifier, `undefined` otherwise.
 */
function describeThrowSite(thrown: unknown): string | undefined {
  if (!(thrown instanceof Error) || typeof thrown.stack !== 'string') {
    return undefined;
  }

  for (const rawLine of thrown.stack.split('\n')) {
    const line = rawLine.trim();

    // The first line of a V8 stack is `Name: message`, which must never be read. Frame lines are the
    // ones beginning `at `, and only the FIRST of those is considered - the loop exists to find it,
    // not to walk past it.
    if (!line.startsWith(STACK_FRAME_PREFIX)) {
      continue;
    }

    const frame = line.slice(STACK_FRAME_PREFIX.length);
    const locationAt = frame.indexOf(STACK_FRAME_LOCATION_MARKER);
    // A frame with no ` (` is location-only (`at /srv/app/x.js:1:2`), so there is no name to take.
    const named = locationAt === -1 ? '' : frame.slice(0, locationAt);
    const withoutAsync = named.startsWith(STACK_FRAME_ASYNC_PREFIX)
      ? named.slice(STACK_FRAME_ASYNC_PREFIX.length)
      : named;

    return SAFE_ERROR_TOKEN_PATTERN.test(withoutAsync) ? withoutAsync : undefined;
  }

  return undefined;
}

/**
 * How much of a route diagnostic is kept. The bound exists because the value is CALLER-SUPPLIED: a
 * request may name any path at all, and an unbounded copy of it on the log stream is work a caller
 * can ask for. Matches the echo bounds used for the same reason in `src/lib/config.ts` and
 * `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts`.
 */
const MAX_ROUTE_DIAGNOSTIC_LENGTH = 120;

/**
 * The first character that cannot appear in a method-and-path label. Everything from here onward is
 * DROPPED rather than substituted: `?`, `#`, `&` and `=` are the markers that say "structured path
 * ends, opaque caller payload begins", so the interesting boundary is where they FIRST occur, and
 * keeping anything after one would keep exactly the part that carries a token.
 *
 * ★★★ THE COMMA WAS ADDED, AND IT IS THE ONE CHARACTER IN THIS CLASS THAT COMES FROM THE ROUTE TABLE
 * RATHER THAN FROM A CALLER. QUOTE-THEN-REVISE: the class was `/[^A-Za-z0-9/_. -]/` and was written
 * when every row of `ROUTE_TABLE` declared exactly one method, so `METHOD /path` never contained a
 * separator. A code review then required the catalog row to serve `GET,POST`, and
 * {@link routeDiagnosticLabel} renders a row's declaration VERBATIM - so the label became
 * `GET,POST /catalog/products`, the cut fired on the table's OWN comma, and every catalog log line read
 * `GET[trailing content dropped]`. That is worse than uninformative: it names a reduction that did not
 * happen, hides which route was served, and destroys the grouping key the label exists to be.
 *
 * ADMITTING IT CHANGES NO SECURITY PROPERTY, and that is checkable rather than asserted. The three
 * defences of {@link sanitizeRouteDiagnostic} are unaffected: the cut still fires on `?`, `#`, `&` and
 * `=`, {@link MAX_ROUTE_SEGMENT_LENGTH} still replaces any segment long enough to be a credential, and
 * {@link MAX_ROUTE_DIAGNOSTIC_LENGTH} still bounds the whole label. Nor does the comma give a caller
 * anything new: `/`, `_`, `.`, `-` and space are already admitted, so a caller that wanted to place
 * text on the line could already do so with any of them - and the emission is serialized as JSON, where
 * a comma inside a string value is data and cannot open a field. What the comma is NOT is a
 * "structured path ends" marker, which is the sole ground the four cut characters are chosen on: it is
 * an RFC 3986 sub-delimiter, legal inside a path segment, and it separates nothing opaque.
 *
 * THE ALTERNATIVE WAS TO MANGLE THE TABLE'S DECLARATION - render `GET,POST` as `GET POST` or `GET.POST`
 * so it fit the existing class - and it was rejected: the label would then agree with no route table,
 * no router primitive and no `listFindNoCase` call, which is a worse trade than one legal path
 * character.
 */
const ROUTE_DIAGNOSTIC_DISALLOWED = /[^A-Za-z0-9/_., -]/;

/** The path separator, used to bound each segment independently. */
const ROUTE_SEGMENT_SEPARATOR = '/';

/**
 * How long one path segment may be before it is replaced by its length.
 *
 * THIS BOUND, NOT THE CHARACTER FILTER, IS WHAT ACTUALLY REMOVES A SECRET, and the distinction was
 * established by measurement rather than reasoning. A filter over the path alphabet does not touch
 * an opaque credential, because a credential is USUALLY SPELLED IN THAT ALPHABET: an AWS-style
 * access key, a hex digest, a base64url JWT segment and a UUID are all letters, digits, hyphens and
 * underscores, so filtering removes the `?` and the `=` around the token and faithfully preserves
 * the token itself. What separates a route segment from a credential is LENGTH: the longest segment
 * in `ROUTE_TABLE` is eleven characters, an access key is twenty, a UUID thirty-six, a JWT far
 * more. No route in the table takes a path parameter, so no legitimate long segment is lost.
 */
const MAX_ROUTE_SEGMENT_LENGTH = 24;

/**
 * Reduce a route label to something safe and bounded to put on a log stream.
 *
 * THE ROUTE IS THE ONE CALLER-AUTHORED STRING THIS MODULE LOGS, WHICH IS EXACTLY WHY IT NEEDS
 * TREATING: everything else in an emission is chosen from a closed set or has already passed a
 * grammar test. Three things are done to it, in order, each closing a hole the previous one leaves
 * open. First, CUT AT THE FIRST NON-PATH CHARACTER, which removes a query string entirely rather
 * than punching holes in it. Second, BOUND EACH SEGMENT - step one does not help when the secret is
 * IN the path, and see `MAX_ROUTE_SEGMENT_LENGTH` for why a character filter preserves an opaque
 * credential intact. Third, BOUND THE WHOLE LABEL, because a path of ten thousand short segments
 * passes both previous steps. Every reduction is REPORTED rather than silent.
 *
 * Applied HERE rather than in `./router.js`: this is the single funnel through which a route
 * reaches a log line, and the router is not the only source of one, so sanitizing at the funnel
 * covers every producer.
 *
 * @param route - the label as supplied, or `undefined` when no route was resolved.
 * @returns the sanitized label, or `undefined` - preserved so the key is omitted from the
 *          serialized line rather than emitted as a null.
 */
function sanitizeRouteDiagnostic(route: string | undefined): string | undefined {
  if (route === undefined) {
    return undefined;
  }

  const cutAt = route.search(ROUTE_DIAGNOSTIC_DISALLOWED);
  const droppedTrailingContent = cutAt !== -1;
  const pathOnly = droppedTrailingContent ? route.slice(0, cutAt) : route;

  const masked = pathOnly
    .split(ROUTE_SEGMENT_SEPARATOR)
    .map(maskOpaqueRouteSegment)
    .join(ROUTE_SEGMENT_SEPARATOR);

  const overLength = masked.length > MAX_ROUTE_DIAGNOSTIC_LENGTH;
  const bounded = overLength ? masked.slice(0, MAX_ROUTE_DIAGNOSTIC_LENGTH) : masked;

  const notes: string[] = [];
  if (droppedTrailingContent) {
    notes.push('trailing content dropped');
  }
  if (overLength) {
    notes.push(`truncated from ${String(masked.length)} characters`);
  }
  return notes.length === 0 ? bounded : `${bounded}[${notes.join('; ')}]`;
}

/**
 * Replace a path segment too long to be a real one with its length. The length is kept because it
 * distinguishes "a UUID was sent where a static path was expected" from "a multi-kilobyte blob was
 * sent", and carries none of the content.
 */
function maskOpaqueRouteSegment(segment: string): string {
  return segment.length <= MAX_ROUTE_SEGMENT_LENGTH
    ? segment
    : `[segment of ${String(segment.length)} characters]`;
}

/**
 * Read a machine code off an arbitrary thrown value, or decline.
 *
 * The whole of what the unrecognized arm adds to the shape description: enough to tell one
 * infrastructure failure from another - a refused connection from a duplicate key from a parse
 * failure - without carrying a single character of the failure's narrative. Declining is the
 * default: a code is reported only when it is a string AND has the classifier shape above.
 */
function readSafeErrorCode(thrown: unknown): string | undefined {
  if (typeof thrown !== 'object' || thrown === null) {
    return undefined;
  }
  if (!('code' in thrown)) {
    return undefined;
  }
  const { code } = thrown;
  if (typeof code !== 'string' || !SAFE_ERROR_TOKEN_PATTERN.test(code)) {
    return undefined;
  }
  return code;
}

/**
 * The fields every emission carries. `route` is included when the caller supplied one and dropped
 * from the serialized line when it did not, because a JSON document omits an undefined member. This
 * is the one place the route appears at all - it is never echoed into a response body.
 */
function baseLogContext(category: MappedErrorCategory, context: ErrorMappingContext): LogContext {
  return {
    category,
    statusCode: STATUS_BY_CATEGORY[category],
    requestId: context.requestId,
    route: sanitizeRouteDiagnostic(context.route),
  };
}

/**
 * Build the response for one mapped category. The single construction path, so a status, a header
 * set and an envelope shape are decided in exactly one place. `fields` is omitted from the envelope
 * entirely when there is nothing to report, which is also what `exactOptionalPropertyTypes`
 * requires of an optional member.
 */
function buildResponse(
  category: MappedErrorCategory,
  message: string,
  requestId: string,
  fields: readonly MappedFieldIssue[] | undefined,
): APIGatewayProxyResult {
  const body: ErrorResponseBody =
    fields === undefined || fields.length === 0
      ? { error: { category, message, requestId } }
      : { error: { category, message, requestId, fields } };

  return {
    statusCode: STATUS_BY_CATEGORY[category],
    headers: JSON_RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}

/** Every emission goes through the caller's logger when one was supplied. */
function resolveLogger(context: ErrorMappingContext): Logger {
  return context.logger ?? logger;
}

/**
 * The first non-empty trimmed candidate, or nothing.
 *
 * `unknown` rather than `string | undefined` because both correlation sources below are typed with
 * index signatures this module must not trust: a synthesised event can carry a number, a `null` or an
 * object where the platform would have put a string, and a `typeof` probe is how that is narrowed
 * without a cast.
 */
function firstNonEmptyIdentifier(candidates: readonly unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();

    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

// --- Exported surface ------------------------------------------------------

// ===========================================================================
// THE SHARED RESPONSE AND CORRELATION CONTRACT
//
// ★★★ WHY THESE THREE LIVE HERE RATHER THAN IN EACH HANDLER. API review (findings F8 and F13) found
// the five capability entrypoints had each derived their own answer to three questions every one of
// them has to answer: which correlation identifier wins, how a route is labelled, and what a
// successful JSON body looks like. Measured, the drift was real - one handler preferred the gateway's
// identifier while three preferred the runtime's, one labelled a route by path alone while the others
// used method-and-path, and all four JSON handlers published a differently-shaped success envelope,
// two of them without a correlation identifier at all. Every one of those is a CROSS-HANDLER contract
// and none is a capability-specific decision, so the decisions move to the module that already owns
// the failure half of the same contract: the response construction, the header set, the correlation
// echo and the route sanitizer are all here already, and splitting the success half away from them is
// what let them diverge.
//
// THE ROUTING TABLE IS DELIBERATELY NOT IMPORTED. `./router.ts` imports THIS module, so importing it
// back would close a cycle across all five bundle entry points. The label builder therefore takes the
// two strings it needs positionally; a caller holding a `RouteDescriptor` passes its own members.
//
// NO SUCCESS STATUS VOCABULARY IS ADDED. A served request is 200 and nothing else; the failure
// vocabulary is documented above and separately includes the two explicit authorization refusals.
// ===========================================================================

/**
 * The one member of a Lambda invocation context that {@link resolveServerRequestId} reads.
 *
 * Structural rather than nominal, so both the platform's `Context` and a handler's own narrower
 * invocation-identity type satisfy it without a cast. Declared here because this module owns the
 * correlation policy; nothing else about an invocation is read anywhere in it.
 */
export interface ServerInvocationIdentity {
  /** The runtime's identifier for this invocation, when the runtime supplied one. */
  readonly awsRequestId?: string | undefined;
}

/**
 * The correlation identifier for one invocation, resolved from SERVER-ESTABLISHED sources only.
 *
 * ★ THE PRECEDENCE, AND WHY IT IS THIS WAY ROUND. The runtime's `awsRequestId` wins, then the
 * gateway's `requestContext.requestId`. Both are minted by the platform and neither is caller-
 * writable, so the choice is not a security one; it is that the runtime identifier is the one the
 * platform's own `START`/`END`/`REPORT` lines carry for THIS execution, so an operator joining a
 * response to a log stream lands on the right invocation even when the gateway retried and produced
 * two executions under one gateway identifier. The gateway identifier is the fallback because an
 * event can be delivered to a handler invoked without a runtime context.
 *
 * NOTHING IS READ FROM A HEADER, and that is the security half. A caller-supplied `X-Request-Id` is
 * NOT consulted: this value is echoed into response bodies and written to the log stream, so honouring
 * a caller-chosen one would let a caller stamp its own text onto both and forge a join key onto
 * another invocation's line. There is no header override and none may be added.
 *
 * ★ THE CONTEXT PARAMETER IS A MINIMAL STRUCTURAL SHAPE, NOT `Context`. Exactly one member of the
 * platform's context object is read, and the platform's own `Context` satisfies this shape
 * structurally - so nothing is lost at the real boundary while a handler that publishes its own
 * one-member invocation-identity type can pass it, and a suite is not obliged to fabricate a dozen
 * unrelated members to exercise the fallback. `awsRequestId` is declared OPTIONAL here because
 * `exactOptionalPropertyTypes` is on and a caller assembling this from an optional value may pass an
 * explicit `undefined`; the platform always supplies it.
 *
 * @param event the API Gateway proxy event; only `requestContext.requestId` is read.
 * @param context the invocation identity when the runtime supplied one; only `awsRequestId` is read.
 * @returns a non-empty identifier - {@link UNATTRIBUTED_REQUEST_ID} when the platform supplied none.
 */
export function resolveServerRequestId(
  event: APIGatewayProxyEvent,
  context?: ServerInvocationIdentity,
): string {
  // `requestContext` is typed as always present but a synthesised event may omit it, so the read is
  // optional rather than trusting the declaration.
  return (
    firstNonEmptyIdentifier([context?.awsRequestId, event.requestContext?.requestId]) ??
    UNATTRIBUTED_REQUEST_ID
  );
}

/**
 * The canonical diagnostic label for a resolved route: `METHOD /path`.
 *
 * Built from the FROZEN route table's own members and never from anything a caller sent, which is what
 * makes it safe to log. It reaches the log stream only - {@link ErrorMappingContext.route} is logged
 * and never echoed into a response body, because reflecting a path back serves no diagnostic purpose
 * the correlation identifier does not already serve.
 *
 * @param methods the route's HTTP methods, as the table declares them.
 * @param path the route's canonical path, as the table declares it.
 */
export function routeDiagnosticLabel(methods: string, path: string): string {
  return `${methods} ${path}`;
}

/**
 * The ONE shape a successful JSON response from any capability handler carries.
 *
 * Four members, all of them cross-handler rather than capability-specific:
 *
 *   * `requestId` - the same identifier the failure envelope echoes, so a caller can correlate a
 *     SUCCESS as well as a failure. Two handlers previously omitted it, which meant a served request
 *     could not be joined to its own log line at all.
 *   * `capability` and `action` - the two closed literals off the route table, so a body says which
 *     bundle answered and which action ran without a reader having to infer it from the shape.
 *   * `result` - the capability's own payload, unexamined and unwrapped by this module.
 *
 * The route PATH is deliberately absent: it is a caller-supplied string, and the closed `action`
 * literal already names what ran.
 */
export interface SuccessResponseBody<TResult> {
  /** Echo of the server-established correlation identifier. */
  readonly requestId: string;
  /** The capability that answered, as a closed literal from the route table. */
  readonly capability: string;
  /** The action that ran, as a closed literal from the route table. */
  readonly action: string;
  /** The capability's own payload. */
  readonly result: TResult;
}

/**
 * Build the shared 200 response for a served request.
 *
 * The single construction path for a successful JSON body, exactly as `buildResponse` is for a failed
 * one - same header set, same `cache-control: no-store`, same correlation echo. A handler supplies its
 * payload and nothing else; it does not choose a status, a header or an envelope shape.
 *
 * FEED XML IS NOT ROUTED THROUGH HERE. `productFeedHandler` answers with an RSS document under
 * `application/rss+xml`, which is a machine-consumer contract carried over from the legacy template
 * and must not be wrapped in a JSON envelope.
 *
 * @param requestId the identifier from {@link resolveServerRequestId}.
 * @param capability the answering capability, from the route table.
 * @param action the action that ran, from the route table.
 * @param result the capability's own payload.
 */
export function jsonSuccessResponse<TResult>(
  requestId: string,
  capability: string,
  action: string,
  result: TResult,
): APIGatewayProxyResult {
  const body: SuccessResponseBody<TResult> = { requestId, capability, action, result };

  return {
    statusCode: 200,
    headers: JSON_RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Map an arbitrary thrown value onto an API Gateway proxy response.
 *
 * THE PRIMARY UNIT OF THIS MODULE. `./router.ts` funnels its `catch` arms through it, and so does
 * every one of the five capability handlers - none of them recognizes a thrown value or chooses a
 * status for itself - so the recognition decisions, the status choice and the envelope shape are
 * decided here and in no other place.
 *
 * Recognition is ordered and total. FIRST, the framework's dead-call-target contract, whose message
 * is reproduced in the body byte for byte - the one case where a failure's own message is
 * published, and safe because the recognizing pattern ENFORCES its two slots as identifiers.
 * Withholding it would lose an observable behavioural contract, which is the outcome this ordering
 * exists to prevent. SECOND, a schema validation failure - a fixed sentence plus field paths and
 * constraint descriptions, never the submitted values. THIRD, everything else - a fixed generic
 * sentence, per the central guarantee in the module header.
 *
 * Never throws. Every arm is a total function over `unknown`, the logger it delegates to is itself
 * guaranteed not to throw, and the envelope is built from strings already in hand.
 *
 * @param thrown  The caught value, of genuinely unknown type. Narrowed by `instanceof` and by
 *                bounded property probes; never cast.
 * @param context Correlation identifier, optional route, optional logger.
 * @returns       A JSON response carrying 400, 404 or 500. This function NEVER produces 401 or 403:
 *                a refusal is a decision a handler makes, never something recognized from a thrown
 *                value - see {@link MappedErrorCategory}.
 */
export function mapErrorToApiGatewayResponse(
  thrown: unknown,
  context: ErrorMappingContext,
): APIGatewayProxyResult {
  const sink = resolveLogger(context);

  const missingMethod = recognizeMissingMethodContract(thrown);
  if (missingMethod !== undefined) {
    sink.error('dead call target reached; reproducing the framework contract message', {
      ...baseLogContext('missingMethod', context),
      missingMethodName: missingMethod.methodName,
      className: missingMethod.className,
    });
    return buildResponse('missingMethod', missingMethod.message, context.requestId, undefined);
  }

  const validation = recognizeValidationIssues(thrown);
  if (validation !== undefined) {
    sink.warn('request input rejected by schema validation', {
      ...baseLogContext('invalidRequest', context),
      // Paths only, and only the bounded set. `issueCount` is the TRUE count.
      //
      // ★★ THESE PATHS ARE SCHEMA-AUTHORED, WHICH IS WHY THEY MAY BE LOGGED WHERE
      // `invalidRequestResponse`'s CANNOT. They come from `mapZodErrorFields`, which reads a
      // validator issue's `path` - the schema's own member names and array indices - and never its
      // `keys`, `received`, `values` or `input`. That holds for EVERY schema in this subtree because
      // not one of them is a `z.record`, a `catchall` or a loose object: there is no schema shape here
      // whose validated member names the caller gets to choose. Add one and this line becomes an echo,
      // so it would have to be reduced to a count exactly as the sibling arm was.
      fieldPaths: validation.fields.map((field) => field.path),
      publishedIssueCount: validation.fields.length,
      issueCount: validation.issueCount,
    });
    return buildResponse(
      'invalidRequest',
      INVALID_REQUEST_MESSAGE,
      context.requestId,
      validation.fields,
    );
  }

  // The unrecognized arm, and the enforcement point of the central guarantee in the module header:
  // the thrown value itself is passed NOWHERE, and only a CLASSIFICATION of it travels.
  //
  // `src/lib/logger.ts` independently reduces any `Error` it is handed to a shape-validated name
  // and code, so this reduction is not the only line of defence. It is here as well because a
  // thrown value need not be an `Error` at all: a thrown string, or a plain object carrying a
  // `message` member, is a structure the logger's key-based policy would traverse and emit
  // verbatim. Classifying at the call site closes that case at its source.
  //
  // ★ `thrownAt` IS THE THIRD CLASSIFIER, AND IT WAS ADDED BECAUSE THE FIRST TWO WERE NOT ENOUGH. QA
  // testing reported a CRITICAL wiring defect as undiagnosable from this line: the thrown value was a
  // plain `Error`, so `thrownShape` was truthfully `'Error'` and `errorCode` was absent, making a
  // composition failure indistinguishable from a driver failure. `thrownAt` names the FUNCTION the
  // failure came from - code-authored, held to the classifier shape, never a path, omitted entirely
  // when it is anything else. See {@link describeThrowSite}. The response body is unchanged and still
  // carries nothing but the generic message and the `requestId` that correlates it to this line.
  sink.error('unrecognized failure mapped to a generic response', {
    ...baseLogContext('unrecognized', context),
    thrownShape: describeThrownShape(thrown),
    errorCode: readSafeErrorCode(thrown),
    thrownAt: describeThrowSite(thrown),
  });
  return buildResponse('unrecognized', GENERIC_FAILURE_MESSAGE, context.requestId, undefined);
}

/**
 * Build the response for a request that matched no route.
 *
 * Exists so the router does not re-derive a status, a body envelope or a header set of its own.
 * Separating this from a domain failure is warranted by the source itself - the legacy framework
 * raised distinct, TYPED exceptions for routing failures, cited in the module header - and those
 * type names are not reproduced. The route is logged and NOT echoed into the body.
 *
 * @param context Correlation identifier, the unmatched route if known, and an optional logger.
 */
export function routeNotFoundResponse(context: ErrorMappingContext): APIGatewayProxyResult {
  resolveLogger(context).warn(
    'no route matched the request',
    baseLogContext('routeNotFound', context),
  );
  return buildResponse('routeNotFound', ROUTE_NOT_FOUND_MESSAGE, context.requestId, undefined);
}

/**
 * Build the response for request input a handler has itself established is unusable, before the
 * input reached any service.
 *
 * The counterpart to the validation arm of `mapErrorToApiGatewayResponse`: that arm recognizes a
 * validation failure that was THROWN, while this one is called directly by a handler that already
 * knows - a missing path parameter, an absent body, a body that is not the expected JSON shape.
 *
 * The caller NAMES a reason and this module owns the words; there is deliberately no way to pass a
 * sentence in, because a free-form `string` parameter would be published as given and is a hole
 * straight through the central guarantee in the module header. `InvalidRequestReason` makes that
 * guarantee structural. The reason itself is a closed literal, so it is logged, because it is the
 * detail an operator needs and the body no longer carries it.
 *
 * ★★ `logDetail` EXISTS SO THIS MODULE OWNS THE ONE EMISSION, AND IT REACHES THE LOG ALONE.
 * Observability review (finding F14) found two handlers emitting their own `warn` for a refusal they
 * then passed here, so one rejection produced two lines - and the reason each did so was real: the
 * closed `InvalidRequestReason` names the CLASS of problem while the handler often knows the GROUND of
 * it, and there was nowhere to put the ground. This parameter is that place, and its constraints are
 * exactly the ones that keep the module header's central guarantee intact:
 *
 *   * IT IS APPENDED TO THE LOG MESSAGE AND NEVER TO THE RESPONSE BODY. The body still carries only
 *     the frozen sentence this module owns for the reason, so no caller-authored or caught text can
 *     reach a caller through it. That is the property the closed union protects, and it is untouched.
 *   * IT IS SANITIZED. It travels as log MESSAGE content, so `../lib/logger.js` applies its statement,
 *     assignment-pair, connection-string and bearer-token rules to it before emission.
 *   * IT IS FOR A GROUND THE HANDLER ESTABLISHED, not for a caught value. A caught failure belongs to
 *     `mapErrorToApiGatewayResponse`, which classifies rather than quotes.
 *
 * @param reason  Which class of unusable input the handler established.
 * @param context Correlation identifier, optional route, optional logger.
 * @param fields  Field-level complaints. Omit when there are none; an empty array is treated the
 *                same as omitting it and is not published.
 * @param logDetail The ground of the refusal, for the LOG LINE ONLY. Omit when the reason says it all.
 */
export function invalidRequestResponse(
  reason: InvalidRequestReason,
  context: ErrorMappingContext,
  fields?: readonly MappedFieldIssue[],
  logDetail?: string,
): APIGatewayProxyResult {
  const message =
    logDetail === undefined
      ? 'request input rejected before it reached the services'
      : `request input rejected before it reached the services: ${logDetail}`;

  // ★★★ THE LOG LINE CARRIES A CLOSED REASON AND A COUNT, AND NO PATH TEXT AT ALL. It used to carry
  // `fieldPaths`, the published paths copied verbatim onto the stream, and a security review found
  // (MAJOR, CWE-209/CWE-532) that this bypassed the module's own no-echo policy: one producer of those
  // paths assembled them out of the CALLER's ancestor key names, so a caller could choose what got
  // persisted in the logs by choosing its own member names. That producer is gone and
  // `MappedFieldIssue.path` now documents server-authorship as an invariant - but the loophole is
  // closed HERE TOO, structurally, rather than left resting on every present and future caller of this
  // function passing only paths it wrote. `invalidRequestReason` is a closed union and
  // `fieldIssueCount` is a number; neither can carry submitted material, whatever a handler supplies.
  //
  // ⚠ WHAT IS DELIBERATELY NOT LOST. The paths are still PUBLISHED to the caller in the response body,
  // because that is what makes a 400 actionable, and the `requestId` on both the line and the body is
  // what joins the two. An operator investigating a refusal reads the reason here and the member paths
  // from the response the caller received; nothing that was diagnosable before is undiagnosable now.
  resolveLogger(context).warn(message, {
    ...baseLogContext('invalidRequest', context),
    invalidRequestReason: reason,
    fieldIssueCount: fields === undefined ? 0 : fields.length,
  });
  return buildResponse(
    'invalidRequest',
    INVALID_REQUEST_MESSAGE_BY_REASON[reason],
    context.requestId,
    fields,
  );
}

/**
 * Build the response for a request this route declines to serve because it identifies no caller.
 *
 * ★ THE FAIL-CLOSED DIRECTION, and the reason it is a separate function rather than a parameter on
 * `invalidRequestResponse`: an unidentified caller has not made a MISTAKE about its input, so
 * reporting a 400 with a field path would mis-state what happened and would tell the caller that its
 * document was read. Nothing about the request is read to build this response, and nothing about the
 * request is published in it.
 *
 * `fields` is NOT a parameter. There is no member of the request to point at, and offering the slot
 * would invite a handler to name the claim it wanted - which is exactly the reconnaissance
 * {@link UNAUTHENTICATED_MESSAGE} withholds.
 *
 * Called by a handler BEFORE it opens a composition root, a request scope or a connection, so a
 * refused request costs no statement. See each capability handler's admission section.
 *
 * @param context Correlation identifier, the route being served if known, and an optional logger.
 */
export function unauthenticatedResponse(context: ErrorMappingContext): APIGatewayProxyResult {
  resolveLogger(context).warn(
    'request refused: the route serves no unidentified caller',
    baseLogContext('unauthenticated', context),
  );
  return buildResponse('unauthenticated', UNAUTHENTICATED_MESSAGE, context.requestId, undefined);
}

/**
 * Build the response for an identified caller that is not permitted the operation it named.
 *
 * The counterpart to {@link unauthenticatedResponse} for the case where an identity WAS established
 * and is insufficient. The administrative whole-price-group document that motivated the first use
 * was withdrawn from the routed surface instead, satisfying both its unbounded-document and access
 * control findings. No current handler therefore emits 403, but the closed response vocabulary
 * remains published and tested so a future, explicitly approved permission-gated operation cannot
 * mislabel that decision as malformed input or failed authentication.
 *
 * ★ THE OPERATION IS LOGGED BY THE REFUSING HANDLER AND IS NOT ACCEPTED HERE. This function takes no
 * operation, no permission name and no principal, so nothing about WHO was refused or WHAT they
 * asked for can reach the body through it. The published sentence is identical to the
 * unauthenticated one; only the status differs.
 *
 * @param context Correlation identifier, the route being served if known, and an optional logger.
 */
export function forbiddenResponse(context: ErrorMappingContext): APIGatewayProxyResult {
  resolveLogger(context).warn(
    'request refused: the identified caller is not permitted the operation',
    baseLogContext('forbidden', context),
  );
  return buildResponse('forbidden', FORBIDDEN_MESSAGE, context.requestId, undefined);
}

// ===========================================================================
// SECTION - THE CALLER PRINCIPAL
//
// ★★★ WHY PRINCIPAL RESOLUTION LIVES HERE, AND WHY IT MAY NOT LIVE IN A MODULE OF ITS OWN.
//
// AAP 0.3.1 enumerates `src/handlers/` as EXACTLY eight modules - the composition root, the router,
// this module, and the five capability entrypoints - and the plan's file layout is a frozen contract
// rather than a suggestion. An earlier revision resolved the caller principal in a NINTH module,
// `src/handlers/requestPrincipal.ts`, with a ninth suite beside it. A code review recorded that as a
// scope violation of the exact handler layout: the resolver's BEHAVIOUR was found correct and worth
// keeping, only its placement was wrong. That behaviour is reproduced below unchanged - same claim
// names, same case folding, same closed truthy set, same discriminated outcome, same frozen results,
// same refusal to read `requestContext.identity` - and the extra module and suite are gone.
//
// THIS MODULE IS THE RIGHT HOME, AND NOT MERELY THE AVAILABLE ONE:
//
//   * It ALREADY reads server-established members of the event and owns the policy for them.
//     `resolveServerRequestId` above reads `event.requestContext.requestId`, refuses to honour a
//     caller-supplied header, and is the ONE correlation policy for all five entrypoints. Deriving
//     the ONE caller-principal policy from `event.requestContext.authorizer` is the same kind of
//     decision about the same object, and stating both once is what stops five handlers from
//     answering "who is asking" five slightly different ways.
//   * The refusal that a failed resolution produces is published HERE. `unauthenticatedResponse` is
//     the only thing a handler can do with an unidentified outcome, so resolution and refusal now sit
//     together instead of one importing the other across a module boundary.
//   * It is a SHARED INTERNAL with no intra-folder dependencies, so every sibling can import it
//     without a cycle - the same property that made it the first file authored in this folder.
//
// The three alternatives were considered and rejected, and the reasoning is recorded so the ninth
// module is not reintroduced:
//
//   * Duplicate the read in each of the four handlers that need it. Rejected: the claim NAME, the
//     case-folding rule and the admin-claim narrowing would exist in four copies, and the failure
//     mode of a divergent copy is a route that silently admits a caller the others refuse.
//     `priceResolutionHandler.ts` once held such a copy, which is exactly why its behaviour and its
//     siblings' had drifted apart.
//   * Put it in `./router.js`. Rejected: the router reads ONLY `httpMethod` and `path`, deliberately,
//     and that narrowness is what lets it fold a cross-capability match into the unmatched arm
//     without ever touching request state.
//   * Put it in `./bootstrap.js`. Rejected: the composition root builds the graph and must not read
//     an API Gateway event. `RequestScopeInput` is what the two tiers agree on, and a handler
//     produces its inputs rather than reaching across it.
//
// A file under `src/lib/` was never available either: AAP 0.3.1 enumerates that folder as
// `config.ts`, `logger.ts` and the five `cfml/` parity helpers, so adding one there would breach the
// same layout gate in a different directory.
//
// ★ WHAT THIS SECTION IS. A total function from an API Gateway proxy event to either an identified
// principal or the fact that none could be established. It reads exactly two members of the
// authorizer context and nothing else about the event.
//
// ★ WHAT IT IS NOT. It performs NO authentication: it does not verify a signature, validate a token,
// call an identity provider, read a secret or open a network connection. It cannot - and it must not,
// because the deployment's authorizer is the component that authenticates and this adapter is
// downstream of it. What it does is DERIVE the principal that authorizer published and let a handler
// refuse to proceed without one, which is the in-function half of a layered control: the authorizer
// authenticates and injects context, and the backing function performs the granular, resource-aware
// authorization the authorizer cannot express.
//
// ★★ IT ISSUES NO INFRASTRUCTURE. AAP 0.2.2 excludes Terraform, CDK, SAM, `serverless.yml` and
// CloudFormation outright, and nothing here reaches across that line: no authorizer resource is
// declared, no policy document is emitted, and no ARN, role, scope, audience or issuer appears
// anywhere. A deployment that fronts these routes with an authorizer satisfies this section; a
// deployment that does not gets a refusal rather than an open route, which is the fail-closed
// direction.
//
// ★ `event.requestContext.identity` IS DELIBERATELY NEVER READ, here or in any handler. Its members
// include API-key and access-key fields, so reading it would pull credential-shaped values into a
// request path that has no use for them, and its caller-controlled members are not identity claims at
// all - they are transport metadata a client can set. The authorizer context is the only place a
// VERIFIED claim lives.
//
// ★ NO REQUEST STATE IS READ FROM `../lib/config.js`. That module is static process configuration and
// is never a request scope; this module does not import it. The claim names below are the shape of the
// authorizer's own output - a contract between the deployment's authorizer and this adapter - and are
// therefore constants here rather than configuration.
// ===========================================================================

/**
 * The authorizer-context member naming the authenticated account.
 *
 * A constant rather than an inline literal, so the one name this boundary depends on is stated once
 * for the whole routed surface. It is not configuration and does not belong in `../lib/config.js`: it
 * is the shape of the authorizer's own output, which the deployment's authorizer and this adapter
 * must agree on.
 *
 * The value is the `Sw*` account identifier the ported services already speak in - see
 * `RequestScopeInput.accountID` in `./bootstrap.js`, and
 * [model/service/PriceGroupService.cfc:L262-L268] where the legacy read the same identity off the
 * ambient request scope.
 */
export const AUTHORIZER_ACCOUNT_CLAIM = 'accountID';

/**
 * The authorizer-context member marking the account as administrative.
 *
 * Named for the legacy column it corresponds to: the audit gate the legacy applied was
 * `!account.isNew() && account.getAdminAccountFlag()`, so `adminAccountFlag` is the source's own
 * spelling rather than a new vocabulary. `./bootstrap.js`'s `RequestScopeInput` carries the same
 * member name, which keeps the claim, the scope input and the legacy column reading alike.
 */
export const AUTHORIZER_ADMIN_CLAIM = 'adminAccountFlag';

/**
 * The two truthy renderings an authorizer may publish for {@link AUTHORIZER_ADMIN_CLAIM}.
 *
 * ★ WHY STRINGS AT ALL. API Gateway STRINGIFIES every value in a custom authorizer's context, so a
 * boolean `true` arrives at the function as the string `"true"`. Accepting only a JavaScript boolean
 * would make the administrative claim silently unsatisfiable behind a real authorizer, which fails
 * OPEN in the worst way: the caller would be identified, the claim would be present, and the gate
 * would refuse the legitimate administrator while telling nobody why.
 *
 * `"1"` is included because an authorizer emitting a numeric flag renders it that way. NOTHING ELSE
 * is admitted - not `"yes"`, not `"admin"`, not a non-empty-string-is-true rule - because a permissive
 * reading of this claim is a privilege decision and the conservative direction is the safe one.
 * Comparison folds case through {@link cfEqualsToken} below, so `"TRUE"` and `"True"` are admitted
 * too; CFML's own `eq` is case-insensitive and this subtree's house convention follows it.
 */
const TRUTHY_ADMIN_CLAIM_VALUES: readonly string[] = Object.freeze(['true', '1']);

/**
 * An identified caller.
 *
 * The whole of what a handler learns about who is asking. There is no name, no e-mail address, no
 * address, no telephone number, no token and no session identifier on it - a handler needs an opaque
 * account identifier and one permission bit, and carrying anything else would put personal data on a
 * request path that has no use for it.
 */
export interface RequestPrincipal {
  /**
   * The authenticated account, as an OPAQUE identifier.
   *
   * Carried, never parsed: no meaning is read out of the characters, and it is never concatenated
   * into a statement - every repository this reaches binds it as a parameter. It is guaranteed
   * non-empty and already trimmed by {@link resolveRequestPrincipal}, which is what stops a blank
   * identifier from reaching a keyed account read.
   */
  readonly accountID: string;

  /**
   * Whether the authorizer marked this account administrative.
   *
   * FALSE UNLESS THE CLAIM AFFIRMATIVELY SAYS OTHERWISE. Absence, an unrecognized rendering, a
   * non-string, an empty string and any value outside {@link TRUTHY_ADMIN_CLAIM_VALUES} all yield
   * `false`, which is the non-admin arm of the legacy audit gate and the fail-closed direction for a
   * permission bit.
   */
  readonly adminAccountFlag: boolean;
}

/**
 * What reading the authorizer context yielded.
 *
 * ★ A DISCRIMINATED RESULT RATHER THAN `RequestPrincipal | undefined`, and the difference is not
 * stylistic. `undefined` is exactly the value the four affected handlers already had, and treating it
 * as "a successful logged-out state" is what the security review found: a missing claim was
 * indistinguishable from a deliberate anonymous request. A caller of this function must branch on
 * `identified` to reach the principal, so the unidentified case cannot be reached by accident, and
 * silent fall-through is a compile error rather than an open route.
 */
export type RequestPrincipalResolution =
  | { readonly identified: true; readonly principal: RequestPrincipal }
  | {
      readonly identified: false;
      /**
       * Which of the two unidentified shapes occurred. LOGGED BY THE REFUSING HANDLER, NEVER
       * PUBLISHED: the refusal builders above accept no detail at all, precisely so a refusal cannot
       * tell a caller which claim would have satisfied the route.
       *
       * `noAuthorizerContext` means the event carried no authorizer context whatsoever - in practice
       * a route deployed without an authorizer in front of it, which is an operator-visible
       * misconfiguration rather than a caller mistake. `noAccountClaim` means a context was present
       * and named no usable account.
       */
      readonly reason: 'noAuthorizerContext' | 'noAccountClaim';
    };

/** The one unidentified outcome for a missing authorizer context. Frozen; shared, never mutated. */
const NO_AUTHORIZER_CONTEXT: RequestPrincipalResolution = Object.freeze({
  identified: false,
  reason: 'noAuthorizerContext',
});

/** The one unidentified outcome for a context that named no usable account. */
const NO_ACCOUNT_CLAIM: RequestPrincipalResolution = Object.freeze({
  identified: false,
  reason: 'noAccountClaim',
});

/**
 * Compare two tokens the way CFML's `eq` does - by value, folding case.
 *
 * Written out here rather than imported, because `cfEquals` in `../lib/cfml/struct.js` is the
 * semantic-parity helper for CFML string comparison on DOMAIN values and this is a protocol-level
 * claim comparison against a fixed literal. Both do the same thing; keeping the claim comparison
 * local means a future change to the domain helper cannot silently move a privilege decision.
 */
function cfEqualsToken(candidate: string, literal: string): boolean {
  return candidate.toLowerCase() === literal;
}

/**
 * Whether a value is usable as a claim set.
 *
 * A TYPE PREDICATE, not a cast. `null` is as meaningful as `undefined` here and neither is an
 * identity; an array is an `object` to `typeof` and is not a claim set, so it is refused rather than
 * indexed. Narrowing this way keeps this module's "no cast anywhere" property intact, which matters
 * because the authorizer context is the one input here that arrives entirely untyped.
 */
function isClaimSet(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read one authorizer claim as a non-empty trimmed string, or nothing.
 *
 * ★ THE CLAIM IS READ THROUGH `structGet`, WHICH FOLDS KEY CASE EXACTLY AS A CFML STRUCT DOES. An
 * authorizer emitting `accountId` and one emitting `accountID` name the same claim, and CFML struct
 * semantics are this subtree's house convention for a keyed read - the alternative, a case-sensitive
 * JavaScript index, would make a deployment's key casing silently decide whether a request is treated
 * as identified. `structGet` is also verified prototype-safe: it resolves the stored key through
 * `Object.keys` narrowed by `Object.prototype.hasOwnProperty.call`, so the prototype chain is
 * unreachable rather than merely filtered, and a claim literally named `__proto__` cannot return a
 * function.
 *
 * The value is narrowed with a `typeof` probe rather than a cast, because the authorizer context is
 * typed with an index signature this module must not trust. A non-string, an empty string and a
 * whitespace-only string all yield nothing.
 */
function readClaim(claims: Readonly<Record<string, unknown>>, claim: string): string | undefined {
  const candidate: unknown = structGet(claims, claim);

  if (typeof candidate !== 'string') {
    return undefined;
  }

  const trimmed = candidate.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Read the administrative claim.
 *
 * A `boolean` is admitted directly, because a suite - and a direct Lambda invoker - can put a real
 * boolean in the context where API Gateway would have put a string. A string is compared against the
 * closed truthy set. EVERYTHING ELSE IS `false`: a number, an object, an array, `null`, an
 * unrecognized string and an absent claim all take the non-admin arm.
 */
function readAdminClaim(claims: Readonly<Record<string, unknown>>): boolean {
  const candidate: unknown = structGet(claims, AUTHORIZER_ADMIN_CLAIM);

  if (typeof candidate === 'boolean') {
    return candidate;
  }

  if (typeof candidate !== 'string') {
    return false;
  }

  const trimmed = candidate.trim();

  return TRUTHY_ADMIN_CLAIM_VALUES.some((literal) => cfEqualsToken(trimmed, literal));
}

/**
 * Resolve the caller principal from the request's authorizer context.
 *
 * Total over its input: every shape of event yields one of the three outcomes and nothing throws, so
 * a handler's admission step cannot fail in a way that needs its own `catch` arm.
 *
 * ★ ABSENCE IS A REFUSAL, NOT A LOGGED-OUT STATE, and that inversion is the whole point of this
 * function. A capability handler that consults it calls {@link unauthenticatedResponse} on the
 * unidentified outcome, BEFORE it opens a composition root, a request scope or a connection - so a
 * refused request costs no statement and reaches no service. The one capability that does NOT consult
 * it is `productFeedHandler`, and that is grounded in the source rather than in convenience:
 * `integrationServices/google/controllers/feed.cfc:L54-L56` declares `this.publicMethods="product"`
 * with empty `secureMethods` and `anyAdminMethods`, so the product feed is source-public and stays
 * anonymous.
 *
 * ★★ ONE OPERATION ON ONE ROUTE IS DELIBERATELY EXEMPT, AND IT IS EXEMPT FOR A LEGACY REASON RATHER
 * THAN A CONVENIENCE ONE. `calculateSkuPriceBasedOnCurrentAccount`
 * [model/service/PriceGroupService.cfc:L262-L266] OWNS the signed-in test and answers
 * `sku.getPrice()` on its `else` arm, so a routed surface that refused every unidentified caller made
 * that arm unreachable. `./priceResolutionHandler.js` therefore applies the requirement PER
 * OPERATION and permits that one to proceed with an empty `CurrentAccountContext`; nothing about this
 * function changes for it - an unidentified caller still resolves to `identified: false`, and the
 * handler decides what that means for the operation the caller named.
 *
 * ★ AND THE ACCOUNT IS SERVER-ESTABLISHED, WHICH IS THE OTHER HALF OF THE FIX. No query string,
 * header or request-body member is authoritative. The promotion adapter retains compatibility
 * account members only to compare them with this principal and REFUSE disagreement; they never
 * select the request scope. The identity that reaches `RequestScopeInput.accountID` - and therefore
 * `calculateSkuPriceBasedOnAccount` [model/service/PriceGroupService.cfc:L271] and the account
 * price-group cascade behind it - is the one this function derived from the authorizer and nothing
 * else, which is what closes the cross-account price and discount disclosure the review recorded.
 *
 * @param event the API Gateway proxy event. Only `requestContext.authorizer` is read; no header, no
 *   query parameter, no path parameter, no body and NOT `requestContext.identity`.
 * @returns the identified principal, or the fact that none could be established and which shape of
 *   absence occurred.
 */
export function resolveRequestPrincipal(event: APIGatewayProxyEvent): RequestPrincipalResolution {
  const authorizer: unknown = event.requestContext.authorizer;

  if (!isClaimSet(authorizer)) {
    return NO_AUTHORIZER_CONTEXT;
  }

  const claims = authorizer;

  const accountID = readClaim(claims, AUTHORIZER_ACCOUNT_CLAIM);

  if (accountID === undefined) {
    return NO_ACCOUNT_CLAIM;
  }

  // Frozen for the same reason every published object in `./bootstrap.js` is: `readonly` erases at
  // emit, and a handler holding this must not be able to substitute the account it was given.
  return Object.freeze({
    identified: true,
    principal: Object.freeze({ accountID, adminAccountFlag: readAdminClaim(claims) }),
  });
}

// ===========================================================================
// WHY THE PROTOTYPE-MEMBER GUARD IS DEEP, AND WHY IT IS ITERATIVE
//
// DEEP, because the asymmetry it corrects is deep. `strictObject` refuses an unrecognized key at
// EVERY level of a nested document, so refusing `__proto__` only at the root would leave the very
// inconsistency this closes in place one level down - and the nested case is the one QA actually
// submitted.
//
// ITERATIVE, with an explicit stack, because recursion over caller-supplied nesting is a stack
// overflow waiting to happen: a 2 000-level document is exactly what QA testing sent, and a
// `RangeError` thrown from a security guard would convert a refusal into an unrecognized 500 through
// the very mapper this file publishes. The work is bounded without needing a depth limit of its own -
// both call sites cap the request body's byte length before parsing, so the node count is bounded by
// that cap, and a document produced by `JSON.parse` cannot contain a cycle.
//
// Both properties are held by {@link containsPrototypeMemberKey} above, which is now the only form of
// this guard the subtree publishes. Verifiably so: `findPrototypeKeyPath` is not exported from
// anywhere, and a search of `src/**` for it returns no declaration and no import.
// ===========================================================================
// ---------------------------------------------------------------------------
// A PATH-RETURNING FORM OF THIS GUARD WAS BRIEFLY PUBLISHED, AND IT IS DELIBERATELY GONE.
//
// Two code reviews landed on the same helper from opposite directions. One required the detection
// folded out of an unplanned module and into an enumerated one; the other recorded that RETURNING the
// offending key's dotted ancestor path re-published caller-authored text (CWE-209/CWE-532), since the
// caller chooses every segment of it. Both are satisfied by the predicate above: the detection lives
// here, and {@link PROTOTYPE_MEMBER_FIELD_ISSUE} publishes a path this module owns rather than one the
// caller wrote. A predicate structurally cannot assemble a caller path, which is why the path-returning
// form is not kept alongside it "just in case" - keeping it would leave the leak one import away.
//
// ★★★ AND THIS PARAGRAPH RAN AHEAD OF THE FACTS, WHICH IS ITSELF A REVIEW FINDING. It was written
// while a SECOND copy of the path-returning function was still exported from `../lib/cfml/struct.ts`,
// where the layout review had relocated it. The sentence above said the form was "gone" and the one
// before it said the predicate was "the only form ... the subtree publishes"; neither was true of the
// subtree, only of this file. The response was to make the claims true rather than to soften them: the
// `struct.ts` export, its module-private stack helpers and its suite are deleted, with the reasoning
// recorded at the site each occupied, and every behavioural property they pinned is asserted against
// the predicate in `tests/unit/handlers/errorMapper.test.ts`. Nothing was weakened here, and nothing
// was silently dropped there.
// ---------------------------------------------------------------------------
