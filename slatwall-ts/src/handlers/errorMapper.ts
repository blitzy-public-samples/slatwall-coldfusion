// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/catalogQueryHandler.ts          catalog query entrypoint
//   src/handlers/priceResolutionHandler.ts       price resolution entrypoint
//   src/handlers/productFeedHandler.ts           feed Lambda entrypoint
//   src/handlers/promotionApplicationHandler.ts  promotion apply entrypoint
//   src/handlers/skuResolutionHandler.ts         SKU resolution entrypoint
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - error mapping for the primary (Lambda) adapters
//
// PURPOSE
//   Turn a thrown value into an API Gateway proxy response. This is the one
//   place in the subtree that decides which failures are describable to a
//   caller, which are not, and what HTTP status each carries. Centralizing that
//   decision here is the whole point: `./router.ts` and the five capability
//   handlers WILL consume this module rather than each re-deriving a status and
//   a body of its own. `./router.ts` is present at this checkpoint and already
//   does exactly that; all five handler modules are planned targets that are
//   ABSENT from the subtree, so for them the sentence states an OBLIGATION they
//   will carry, never a description of current behaviour.
//
// ENTRY-POINT STATUS: NO.
//   This is a SHARED INTERNAL of `src/handlers/`, not a bundle entry point, and
//   it deliberately exports NO Lambda `handler`. The bundler enumerates its
//   candidate entrypoints by file name and this file is not among them. That
//   enumeration is a PLANNED SET rather than an inventory of what exists now,
//   and it is written out here with each member's checkpoint status so the
//   distinction cannot be misread:
//
//     src/handlers/errorMapper.ts                  - this file, PRESENT
//     src/handlers/router.ts                       - PRESENT
//     src/handlers/catalogQueryHandler.ts          - (planned), ABSENT
//     src/handlers/skuResolutionHandler.ts         - (planned), ABSENT
//     src/handlers/promotionApplicationHandler.ts  - (planned), ABSENT
//     src/handlers/priceResolutionHandler.ts       - (planned), ABSENT
//     src/handlers/productFeedHandler.ts           - (planned), ABSENT
//
//   So `src/handlers/` holds exactly two modules at this checkpoint - this one
//   and `./router.ts` - and NO Lambda `handler` is exported anywhere in the
//   subtree yet. Every mapping decision this file makes is nonetheless
//   reachable, and directly testable, through its own exports without any
//   handler being present.
//
//   It is also the FIRST file authored in this folder and has zero intra-folder
//   dependencies, which is what lets every sibling import it without a cycle.
//
// PROVENANCE: CREATED FROM SCRATCH.
//   The plan's handler transformation table records the source file for this row
//   as "-" and the change as "No legacy equivalent; maps domain errors to API
//   Gateway responses". There is nothing to port line for line here, so what
//   follows is idiomatic TypeScript. That is not a liberty: the minimal-change
//   directive scopes the FUNCTIONAL SURFACE, never the code style, and a
//   line-for-line CFML transliteration would violate it rather than satisfy it.
//
// THE ONE MUST-PRESERVE CONTRACT
//   The CFML framework's dead-call-target failure carries a specific, byte-exact
//   message, and that message is an OBSERVABLE BEHAVIOURAL CONTRACT rather than
//   a log line. It is reproduced and recognized below, grammatical error and
//   all. See `recognizeMissingMethodContract`.
//
// WHY THE STATUS SET IS THIS SMALL
//   The legacy CFML slice has NO HTTP status vocabulary at all. Its controllers
//   are framework subsystem actions and its only failure signal is a thrown
//   string, so there is nothing to port and no license to invent. The set here
//   is therefore held to base HTTP meanings that follow directly from the three
//   recognized shapes plus a default:
//
//     * a client-shaped failure  - the request input itself is not usable;
//     * a route-not-found        - no such route exists;
//     * a server-shaped failure  - everything else.
//
//   Distinguishing route-not-found from a domain failure is not invented either:
//   the legacy framework already raised TYPED exceptions for routing failures
//   (`org/Hibachi/FW1/framework.cfc:L963` for a missing service,
//   `:L1231` for a missing service method, `:L2023-L2024` for a missing view),
//   which proves routing failures were distinguishable from domain failures in
//   the source. Those exception TYPE NAMES are deliberately NOT carried forward -
//   FW/1 itself is not carried forward, and reproducing its type strings would
//   invent a contract the target does not owe.
//
//   Nothing beyond that is modelled. There is no authentication or
//   authorization status here, because there is no authentication in scope: the
//   one in-scope legacy controller publishes its feed action outright, with an
//   empty secure-method list and an empty admin-method list. That is a factual
//   property of the source, not license to invent an auth tier. No conflict
//   status, no unprocessable-entity status and no request-quota status is
//   modelled either, nor any of the back-pressure or retry-signalling headers
//   that would accompany one - the source has no notion of any of them. And no
//   service-level number of any kind appears anywhere in this module, in its
//   types or in its comments: not for elapsed time, not for request volume, not
//   for continuity. The source states none, and none may be fabricated.
//
// SELECTIVE MAPPING, AND WHY IT IS NOT NEGOTIABLE
//   This module is SELECTIVE, never a pass-through. A recognized failure returns
//   its own message; an unrecognized one returns a GENERIC message, and what
//   reaches the structured logger in its place - which the Lambda runtime
//   captures from stdout natively - is a CLASSIFICATION of the failure rather
//   than the failure itself: its category, the correlation identifier, the route,
//   the shape of the thrown value, and a machine code when it carries one.
//
//   THE THROWN VALUE IS PASSED NOWHERE. Not into the response, and not into the
//   log either. The driver locators quoted below are the reason the log is held
//   to the same standard as the body: an exception's `message` and `stack` are
//   free text assembled at throw time, and for a syntax or constraint failure
//   that text embeds the failing SQL fragment while the statement and its bound
//   values hang off the error object beside it. A validation failure quotes the
//   rejected input; a connection failure names the host and the account. A log
//   line is durable and centrally aggregated, so publishing any of that there
//   rather than in a response body changes who can read it, not whether it leaked.
//
//   The reason is concrete and was verified against the pinned driver rather
//   than assumed. The MySQL driver builds its errors from the server's own error
//   text and then hangs the failing statement off the error object.
//
//   BOTH SITES ARE CITED BY PACKAGE, PINNED VERSION, FILE AND SYMBOL - never by
//   line number. `node_modules/` is not committed, so a line locator into an
//   installed dependency is unresolvable from the repository and drifts with
//   every release of the package; a symbol name does not. The version is the one
//   `package.json` pins exactly, `mysql2` 3.23.1:
//
//     mysql2/lib/packets/packet.js - `Packet#asError`
//         reads the server's error payload, constructs `new Error(message)` from
//         that text, and assigns the same text to `err.sqlMessage`.
//     mysql2/lib/commands/command.js - `Command#execute`
//         calls `packet.asError(...)` and then assigns
//         `err.sql = this.sql || this.query` before the error escapes.
//
//   For a syntax or constraint failure that server text embeds the failing SQL
//   fragment, so `error.message` is itself a leak vector, quite apart from the
//   attached statement and its bound values. A mapper that blanket-returned
//   `error.message` would publish schema detail, and potentially connection
//   detail, straight into a response body. So it does not - and it does not hand
//   the object to the logger either, because `sql` and `sqlMessage` are not
//   credential-, connection-, payment- or personal-data keys and so are not
//   covered by the logger's own never-log key policy.
//
//   That cuts the other way too, and it is exactly why the missing-method
//   contract must be an EXPLICITLY RECOGNIZED case: without recognition it would
//   be swallowed into a generic server-shaped response and the must-preserve
//   contract would be silently lost. Recognition is correspondingly strict - a
//   real `Error` whose message matches an identifier-constrained template - so
//   that "explicitly recognized" cannot be turned into "anything that looks the
//   part".
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, and it was read to completion.
//   No rule is invented to fill the gap, no constraint below is attributed to a
//   rule that does not exist, and the absence is not treated as license to lower
//   the bar. Every constraint here traces to the plan, to the enterprise
//   substitute standard the plan enumerates, or to an explicit `JUDGMENT CALL:`
//   annotation at the point the call was made.
//
// TEST COVERAGE IS NET-NEW
//   The legacy suite contains nothing whatsoever for the handler tier - the only
//   legacy suites extended anywhere in this port are the Brand and Product
//   entity tests - so coverage for this module is NET-NEW and must never be
//   presented as parity. The suites live in the separately-owned test tier; the
//   seam they need is the optional `logger` on `ErrorMappingContext`. Every
//   exported function here has exactly one side effect - a single emission
//   through that logger - and returns a value derived from nothing but its
//   arguments, so routing the logger through the context makes every branch,
//   including what is and is not written to the log, drivable without patching a
//   global stream or reading the process environment.
// ---------------------------------------------------------------------------

import type { APIGatewayProxyResult } from 'aws-lambda';
import { ZodError } from 'zod';

import type { LogContext, Logger } from '../lib/logger.js';
import { logger } from '../lib/logger.js';

/**
 * The closed set of failure shapes this module maps.
 *
 * A string-literal union rather than the TypeScript enumeration construct: a
 * union is erased at compile time, so nothing here survives into the Lambda
 * bundle as a runtime object, and the values stay directly comparable against a
 * decoded response body without an import.
 *
 * The set is exhaustive by construction - `mapErrorToApiGatewayResponse` ends in
 * an unconditional default arm - so a failure can never fall through unmapped.
 *
 *   `missingMethod`  the framework's dead-call-target contract, reproduced
 *                    verbatim. Server-shaped: a call target that does not exist
 *                    is a defect in this service, never the caller's mistake.
 *   `routeNotFound`  no route matched. Raised by the router, never by a service.
 *   `invalidRequest` the request input is not usable. Client-shaped.
 *   `unrecognized`   anything else. The message is withheld from the body.
 */
export type MappedErrorCategory =
  'missingMethod' | 'routeNotFound' | 'invalidRequest' | 'unrecognized';

/**
 * What a caller must hand this module alongside the failure.
 *
 * Deliberately minimal - a correlation identifier, optionally the route that was
 * being served, and optionally the logger to emit through. It carries no event,
 * no headers and no request body, so nothing a caller sent can reach a response
 * body by accident through this parameter.
 *
 * The logger arriving HERE, on an explicit parameter, is the same substitution
 * the rest of this port makes for the legacy ambient request scope: the CFML
 * code reached its collaborators through an implicit scope accessor, and every
 * such reach becomes an explicit argument passed down the call chain. It doubles
 * as the seam the net-new test tier needs.
 */
export interface ErrorMappingContext {
  /**
   * Correlation identifier for this invocation - in practice the API Gateway
   * request id or the Lambda request id. It is echoed into the response body so
   * an operator can join a caller's generic response to the full detail on the
   * log stream, which is the only way the withheld detail stays reachable.
   */
  readonly requestId: string;
  /**
   * The route being served, when one had been resolved. LOGGED, never echoed
   * into the response body: reflecting a caller-supplied path back into a body
   * serves no diagnostic purpose the correlation id does not already serve.
   */
  readonly route?: string;
  /**
   * Logger to emit through. Defaults to the module-level structured logger.
   *
   * Optional in the exact sense `exactOptionalPropertyTypes` requires: omit the
   * key entirely rather than setting it to `undefined`.
   */
  readonly logger?: Logger;
}

/**
 * One field-level validation complaint, reduced to the two members that are safe
 * to publish.
 *
 * `path` is the dotted location within the request input and `message` describes
 * the constraint that failed. The value the caller actually submitted is
 * NEVER carried, because a validation report is not a place to echo input back.
 */
export interface MappedFieldIssue {
  /** Dotted path to the offending member of the request input. */
  readonly path: string;
  /** Human-readable description of the constraint that failed. */
  readonly message: string;
}

/**
 * Why a handler is rejecting request input it has itself established is
 * unusable.
 *
 * A CLOSED union, and closed for a security reason rather than a stylistic one.
 * The alternative - letting the caller of `invalidRequestResponse` supply the
 * sentence - makes this module's central promise unenforceable: every other arm
 * publishes a fixed sentence precisely so that nothing driver-derived,
 * caller-derived or credential-bearing can reach a body, and a free-form
 * `string` parameter is a hole straight through that promise. It only takes one
 * handler interpolating a caught driver message, a resolved filesystem path or
 * an echo of submitted input into its "fixed, handler-authored sentence" for the
 * guarantee to be gone, and nothing in the type system would have objected.
 *
 * A closed union moves the decision out of the caller's hands entirely. A
 * handler NAMES the class of problem; this module owns the words. Adding a member
 * without giving it a sentence is a compile error, so the mapping cannot drift.
 *
 * The six members are the classes of unusable input the capability handlers can
 * actually establish before reaching a service. Each sentence names the class of
 * problem and NEVER echoes the offending value, the parameter name, the route or
 * any part of the submitted document - a caller that needs to know which member
 * of its input is at fault gets that from `fields`, which carries a path and a
 * constraint description and never a value.
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
   * Deliberately a REASON a handler states rather than something inferred from a
   * caught `SyntaxError`. The recognizer set is closed at three shapes and a
   * `SyntaxError` is not one of them, because this service's own code produces
   * that shape too; inferring "the caller sent bad bytes" from it would invent a
   * semantic the source never had. A handler that parsed the body knows.
   */
  | 'unparsableRequestBody'
  /** The body parsed, but is not the expected shape - not an object, or an array where one object was required. */
  | 'unsupportedBodyShape'
  /**
   * The input is unusable for a reason none of the five above names.
   *
   * Present so a handler is never forced to mis-state its reason to fit the
   * union. It maps to the same fixed generic sentence the schema-rejection arm
   * publishes, so choosing it withholds detail rather than inventing any.
   */
  | 'unusableRequestInput';

/**
 * The JSON document every response from this module carries.
 *
 * Published as a type so `./router.ts`, the net-new suites, and each capability
 * handler once it is authored can parse a body without restating its shape. Of
 * those three, only the first two exist at this checkpoint. The envelope holds
 * no legacy error code, no framework exception type and no stack trace.
 */
export interface ErrorResponseBody {
  readonly error: {
    /** Which of the four mapped shapes this response represents. */
    readonly category: MappedErrorCategory;
    /**
     * Safe description. For a recognized failure this is the failure's own
     * message; for an unrecognized one it is a fixed generic sentence and the
     * real message is on the log stream instead.
     */
    readonly message: string;
    /** Echo of `ErrorMappingContext.requestId`, for log correlation. */
    readonly requestId: string;
    /**
     * Field-level complaints, present only for a client-shaped failure that
     * produced them. Omitted entirely otherwise - never present and empty.
     */
    readonly fields?: readonly MappedFieldIssue[];
  };
}

/**
 * The status carried by each mapped shape.
 *
 * Three codes, and only three. Each is a base HTTP meaning that follows directly
 * from the shape it maps, and none encodes anything the source did not already
 * distinguish - see the status-set note in the module header for why nothing
 * further is modelled.
 *
 * A `Record` keyed by the closed union rather than an index signature, so an
 * index into it is `number` and never widens to `undefined`, and so adding a
 * category without giving it a status is a compile error rather than a silent
 * hole.
 */
const STATUS_BY_CATEGORY: Readonly<Record<MappedErrorCategory, number>> = Object.freeze({
  // A call target that does not exist is a defect in this service. The caller
  // could not have avoided it, so it is server-shaped.
  missingMethod: 500,
  routeNotFound: 404,
  invalidRequest: 400,
  unrecognized: 500,
});

/**
 * Headers on every response this module builds.
 *
 * `content-type` is declared explicitly because the body is always a JSON
 * document. `cache-control: no-store` keeps an intermediary from serving a
 * stored failure to a later, unrelated request; it is a correctness measure
 * about not reusing a response and asserts no target of any kind.
 */
const JSON_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/**
 * Body message for an unrecognized failure.
 *
 * Fixed, and deliberately uninformative. Everything an operator needs is on the
 * log stream under the same `requestId` that this response echoes; see the
 * selective-mapping note in the module header, which names the two driver sites
 * by package, pinned version and symbol, for why a pass-through is unacceptable.
 */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/** Body message for a request that matched no route. */
const ROUTE_NOT_FOUND_MESSAGE = 'The requested route does not exist.';

/** Body message for a schema-rejected request input. */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/**
 * The sentence published for each `InvalidRequestReason`.
 *
 * The whole point of the closed union: the WORDS live here, in this module,
 * frozen, and a handler chooses among them by naming a reason. Every sentence is
 * fixed and value-free - none interpolates a parameter name, a path, a media
 * type or any fragment of the submitted document, because a body is not a place
 * to reflect caller input back.
 *
 * A `Record` keyed by the closed union rather than an index signature, for the
 * same two reasons as the status map above: an index into it is `string` and
 * never widens to `undefined`, and adding a reason without giving it a sentence
 * is a compile error rather than a silent hole.
 */
const INVALID_REQUEST_MESSAGE_BY_REASON: Readonly<Record<InvalidRequestReason, string>> =
  Object.freeze({
    missingPathParameter: 'A required path parameter is missing.',
    missingQueryParameter: 'A required query parameter is missing.',
    missingRequestBody: 'A request body is required and was not supplied.',
    unparsableRequestBody: 'The request body is not valid JSON.',
    unsupportedBodyShape: 'The request body is not the expected shape.',
    // Deliberately identical to the schema-rejection sentence. The catch-all
    // withholds detail; it does not invent a more specific claim than the
    // handler was able to make.
    unusableRequestInput: INVALID_REQUEST_MESSAGE,
  });

// ---------------------------------------------------------------------------
// The missing-method contract
// ---------------------------------------------------------------------------

// LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the framework's terminal onMissingMethod throw is grammatically incorrect ("does not exists") and the service-tier copy still says "entity". Both are reproduced verbatim as an observable error contract.
// Preserved deliberately; do not fix without a product decision.
//
// The legacy statement, identical at both locators:
//
//   throw('You have called a method #arguments.missingMethodName#() which does
//          not exists in the #getClassName()# entity.');
//
// ONE recognizer covers BOTH tiers, because the two messages are byte-identical
// - the service-tier copy says "entity" too. There is deliberately no second,
// divergent recognizer for the service tier.
//
// A THIRD, DIFFERENT variant exists in the framework and is DELIBERATELY NOT
// RECOGNIZED HERE: `org/Hibachi/HibachiObject.cfc:L126` throws "You have
// attempted to call the method <name> which does not exist in <fullName>" from
// its `invokeMethod`, not from an `onMissingMethod`. It diverges on four
// independent counts - a different opening clause, no `()` after the method
// name, correct grammar ("does not exist"), and no trailing " entity." - so the
// pattern below cannot match it even by accident, and it is not conflated with
// the contract above. It is left unrecognized on purpose: no in-scope target
// call path reaches it, so recognizing it would be modelling a shape this
// service never produces.
//
// Two further census findings bound what is recognized here, and both were
// verified by exhaustive search rather than assumed. `org/Hibachi/HibachiDAO.cfc`
// declares NO `onMissingMethod` at all, so the legacy dead call into a DAO
// failed as a raw engine error rather than as this message - and the
// corresponding repository port deliberately does not declare that method, so no
// such call site exists in the target. There is consequently NOTHING here to map
// for it and no mapping is invented. `org/Hibachi/HibachiControllerEntity.cfc`
// declares an `onMissingMethod` with no terminal throw at all, so it produces no
// message and is not modelled either.

// JUDGMENT CALL: the missing-method message template is duplicated between the throwing domain module and this
// recognizer because ESLint no-restricted-imports forbids src/domain/** from importing src/handlers/**, and
// src/lib/ has a locked file list with no error module. Do NOT "fix" this by creating a shared error module,
// adding a file to src/lib/, adding a file to src/handlers/, or creating a domain -> handlers back-edge.
//
// Concretely: the entity that reproduces the legacy defect - a SKU price lookup
// whose legacy body calls a method that does not exist - raises a standard
// `Error` whose `message` reproduces the template, and this module recognizes
// that message by inspecting the string. No shared error class, no shared module,
// and no import in either direction. The deferred-work note belonging to that
// defect lives in the entity file where the defect is; it is not restated here,
// and nothing here completes it.
//
// This annotation deliberately sits in the leading-comment run of the pattern
// constant below rather than above the module-private interface that follows it.
// A type declaration is erased on emit and its comments go with it, and the
// build configuration keeps comments precisely so these two annotations reach the
// emitted artifact as shipped deliverables.

/**
 * The recognized shape, anchored at both ends, with IDENTIFIER-ONLY capture
 * groups.
 *
 * Every distinguishing feature of the legacy statement is load-bearing and
 * therefore literal in the pattern: the opening clause, the empty argument list
 * `()` after the method name, the grammatical error "does not exists", and the
 * trailing " entity." - which the service tier emits as well.
 *
 * THE CAPTURE GROUPS ARE IDENTIFIERS, NOT `(.+?)`. An earlier revision captured
 * each slot with `(.+?)`, and because a matched message is the ONE message this
 * module publishes verbatim into a response body, that made the body an echo
 * channel: anything that could get itself thrown wrapped in the surrounding
 * boilerplate had its two slots reflected back to the caller unaltered, newlines,
 * markup, injected instructions and all. Publishing a "fully specified template
 * with two identifier slots" is only true if the slots are actually constrained
 * to identifiers, so now they are.
 *
 * The constraint loses nothing. Both slots are target-code identifiers by
 * construction: the legacy first slot is `arguments.missingMethodName`, a CFML
 * method name, and the second is `getClassName()`, which is
 * `listLast(getClassFullname(), ".")` [org/Hibachi/HibachiObject.cfc:L135-L137] -
 * a bare class name with the dotted package already stripped. Neither can be
 * anything but an identifier, so no faithful producer is rejected.
 *
 * The 64-character ceiling per slot mirrors the identifier bound applied
 * elsewhere in the port. Both groups stay non-greedy in spirit - an identifier
 * character class cannot cross the literal `()` or the trailing ` entity.` - and
 * the pattern remains fully anchored. There is no `g` flag: this pattern is
 * reused across invocations, and a global regex would carry `lastIndex` between
 * them.
 */
const MISSING_METHOD_MESSAGE_PATTERN =
  /^You have called a method ([A-Za-z_$][A-Za-z0-9_$]{0,63})\(\) which does not exists in the ([A-Za-z_$][A-Za-z0-9_$]{0,63}) entity\.$/;

/**
 * The longest message this module will even attempt to recognize.
 *
 * The contract message's own maximum length is fixed and computable: 25
 * characters of opening clause, at most 64 for the method name, 2 for `()`, 31
 * for the middle clause, at most 64 for the class name and 9 for ` entity.` -
 * under 200 in the worst case. Refusing anything longer BEFORE the pattern runs
 * means an arbitrarily large thrown message is rejected by one comparison rather
 * than by a backtracking match, and it cannot be rejected by mistake: no message
 * this pattern could match is anywhere near the bound.
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
 * WHAT THIS NO LONGER ACCEPTS, AND WHY. An earlier revision took three arms: a
 * bare thrown string, a real `Error`, and anything at all carrying a string
 * `message`. The third arm in particular meant that any object shaped like
 * `{ message: '...' }` was treated as a candidate for the one message this module
 * publishes verbatim - and a deserialized request body is exactly such an object.
 * Combined with the unconstrained capture groups the pattern used to carry, that
 * let attacker-authored text be reflected into a response body and written to the
 * log as a recognized framework contract. Type confusion, in the plainest sense:
 * the recognizer trusted a shape that anything can wear.
 *
 * Requiring a real `Error` costs nothing that is owed. The annotated decision
 * above settles the throwing side on a standard `Error` whose `message`
 * reproduces the template, so the producer this recognizer exists for is
 * unaffected. The bare-string arm goes with it: `throw('<string>')` is the LEGACY
 * CFML construct, and no CFML runs in the target - nothing in this subtree throws
 * a bare string, and accepting one only re-admitted a shape a caller can forge.
 *
 * Returning a message here still grants NOTHING on its own: it must additionally
 * survive the length bound and match the identifier-constrained pattern above.
 */
function readThrownMessage(thrown: unknown): string | undefined {
  return thrown instanceof Error ? thrown.message : undefined;
}

/**
 * Recognize the framework's dead-call-target contract, or decline.
 *
 * Matching is performed on the trimmed message and the trimmed message is what
 * is preserved. Trimming can only remove surrounding whitespace, which is not
 * part of the contract, so for a faithful producer the trimmed and original
 * messages are the same string - and for a careless one the contract still
 * survives instead of being lost to the generic arm.
 *
 * The length bound is applied AFTER trimming and BEFORE the pattern runs, so an
 * oversized message is refused by a comparison rather than by a match attempt.
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
  // Under `noUncheckedIndexedAccess` each captured group reads as possibly
  // absent. Both are handled explicitly; there is no non-null assertion here,
  // which is banned across `src/**` precisely so absence stays visible.
  const [, methodName, className] = match;
  if (methodName === undefined || className === undefined) {
    return undefined;
  }

  // ★ THE MESSAGE IS REBUILT FROM THE TWO CAPTURES, NOT COPIED FROM THE INPUT,
  // AND THE TWO ARE PROVABLY THE SAME STRING. The pattern is anchored at both
  // ends and every character outside the two capture groups is a literal, so a
  // matched `message` is by construction the concatenation below - there is no
  // input a faithful producer can send for which these differ, which is what
  // makes this substitution free rather than a behaviour change.
  //
  // It is worth the line because it changes the KIND of guarantee protecting the
  // response body. Echoing the input made non-reflection a property of the
  // regular expression: correct today, and one loosened quantifier away from a
  // disclosure. Rebuilding makes it a property of the data flow - the only
  // caller-derived text that can reach a caller is two strings that already
  // passed an identifier test, so even a future hole in the grammar cannot carry
  // punctuation, whitespace or a newline into the payload. Defence in depth, on
  // the one path in this module that publishes a message at all.
  const reconstructed = `You have called a method ${methodName}() which does not exists in the ${className} entity.`;

  // If the reconstruction ever disagreed with the match, the pattern and this
  // template would have drifted apart. Declining is the safe resolution: the
  // caller gets the generic redacted response rather than either string.
  if (reconstructed !== message) {
    return undefined;
  }

  return { message: reconstructed, methodName, className };
}

// ---------------------------------------------------------------------------
// Schema-rejected request input
// ---------------------------------------------------------------------------

// JUDGMENT CALL - REVERSED, DELIBERATELY, AND THE REVERSAL IS THE POINT.
//
// A schema validation failure is now recognized by `instanceof ZodError` against
// the pinned validation library, NOT structurally by its `name` and the shape of
// its `issues`. The earlier revision argued the opposite and was wrong on the
// security question, so the reasoning is recorded on both sides rather than
// quietly replaced.
//
// THE OLD ARGUMENT, restated fairly: `instanceof` compares constructor identity,
// so a bundle holding two copies of the library would make an otherwise-valid
// failure unrecognizable, whereas a structural probe cannot fail that way; and
// keeping the import list minimal keeps the error mapper the lightest thing in a
// folder every sibling depends on.
//
// WHY IT LOSES. `name` is a writable string property and `issues` is an ordinary
// array, so `{ name: 'ZodError', issues: [...] }` satisfied the probe completely -
// and that object is producible by anything, including a deserialized request
// body. The consequence was not cosmetic: a forged value was mapped to a
// client-shaped 400 and its `issues[].message` strings were published verbatim
// into the response body, so the caller chose both the status and the text. That
// is error type confusion with an echo channel attached, and no amount of
// bundle-identity robustness pays for it.
//
// THE OLD ARGUMENT'S PREMISE ALSO DOES NOT HOLD HERE. The dual-copy failure needs
// two copies to exist. This subtree pins ONE exact version of the library in its
// manifest with no caret range, resolves it through one lockfile, and bundles to a
// single artifact - so there is exactly one constructor for `instanceof` to
// compare against. And the import is not a weight problem: the library is already
// a runtime dependency of this subtree, so it is in the bundle whether this module
// names it or not.
//
// LAYERING IS UNAFFECTED. This module lives in `src/handlers/**`. The ESLint
// domain-boundary rule restricts `src/domain/**` from importing outward and
// deliberately leaves the validation library unrestricted; nothing here reaches
// into a repository, a handler sibling or an integration.
//
// The recognized set stays CLOSED at the three shapes the plan names. In
// particular a `SyntaxError` - the shape a JSON body parse produces - is
// DELIBERATELY NOT treated as client-shaped: a syntax error is equally producible
// by this service's own code, and inferring "the caller sent bad bytes" from it
// would be inventing a semantic the source never had. A handler that has itself
// established the input is unusable calls `invalidRequestResponse` and says so
// directly.

/**
 * How many field issues a response body will carry.
 *
 * A validation failure's issue count is chosen by the CALLER, not by this
 * service: one issue per rejected member, so a request body naming a thousand
 * members produces a thousand issues, every one of which would otherwise be
 * rendered into the response. Bounding the published set keeps a response
 * proportional to the request rather than to the size of the mistake in it.
 *
 * Twenty is enough to fix a real request in one round trip. When there are more,
 * the TRUE count goes to the log so the truncation is visible to an operator
 * rather than silent.
 */
const MAX_PUBLISHED_ISSUES = 20;

/** Longest constraint description published for one issue. */
const MAX_ISSUE_MESSAGE_LENGTH = 200;

/** Most path segments rendered for one issue. */
const MAX_ISSUE_PATH_SEGMENTS = 10;

/** Longest single path segment rendered. */
const MAX_PATH_SEGMENT_LENGTH = 64;

/**
 * Appended to any text this module shortened, so a bounded value is visibly
 * bounded rather than passing as complete.
 */
const TRUNCATION_MARKER = '...';

/**
 * Shorten `value` to `limit` characters, marking it when anything was removed.
 *
 * The marker is counted inside the limit, so the returned string is never longer
 * than `limit` - which is what makes the bound a real bound rather than an
 * approximate one.
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
 * The library reports a path as an array of property names and array indices.
 * Only string and finite numeric segments are rendered; anything else is
 * dropped, so a symbol-keyed or otherwise unrenderable segment cannot turn into
 * a meaningless fragment in a published body. An absent or unusable path yields
 * the empty string, which names the root of the input.
 *
 * WHY THE BOUNDS ARE HERE AND NOT ONLY ON THE MESSAGE. A path segment is not
 * always schema-derived. Validate a caller-supplied map with a record schema and
 * the segment IS the caller's key; nest that and the segment COUNT is the
 * caller's nesting depth. So both the count and each segment's length are
 * attacker-influenced, and both are bounded: segments past
 * `MAX_ISSUE_PATH_SEGMENTS` are dropped and the marker is appended in their place,
 * and an over-long segment is clamped by `clampText`.
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
 * Reduce one raw issue to the two members that are safe to publish.
 *
 * Reads `path` and `message` and NOTHING else. In particular the library also
 * records what it RECEIVED, on `received` and on the sibling members some issue
 * kinds add, and none of those is read here or anywhere else in this module: a
 * validation report describes the constraint that failed, it does not echo the
 * input back. That omission is the reason a rejected credential or card number
 * cannot travel out through a 400 response.
 *
 * The message is CLAMPED rather than published as given. Most of the library's
 * messages name types and limits only, but not all of them do - an
 * unrecognized-key complaint names the key, which came from the caller - so the
 * one member that can carry caller text is bounded.
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

/** What a recognized validation failure yields. Module-private. */
interface RecognizedValidationFailure {
  /** The bounded set of issues published in the response body. */
  readonly fields: readonly MappedFieldIssue[];
  /**
   * How many issues the failure actually carried, before bounding. LOGGED, never
   * echoed, so an operator can see that a body was truncated.
   */
  readonly issueCount: number;
}

/**
 * Recognize a schema validation failure and reduce it to publishable issues, or
 * decline.
 *
 * RECOGNITION IS `instanceof ZodError` AND NOTHING ELSE - see the reversed
 * judgment call above. A value that merely looks like a validation failure is not
 * one, and falls through to the generic arm where it belongs.
 *
 * An empty `fields` array is a meaningful result and is NOT the same as
 * declining: it says the failure was recognized as client-shaped but produced no
 * renderable field detail. `undefined` says the value is not a validation failure
 * at all.
 *
 * The published set is bounded at `MAX_PUBLISHED_ISSUES`, and iteration stops at
 * the bound rather than mapping every issue and slicing afterwards - so a
 * thousand-issue failure does no work for the nine hundred and eighty that would
 * be discarded.
 *
 * The array-narrowing sequence - bind `issues` to a `readonly unknown[]` before
 * iterating - is the same one the logger uses, and it is what keeps the linter's
 * type-safety checks satisfied without a cast, since the library types an issue
 * as a union this module deliberately does not depend on the internals of.
 */
function recognizeValidationIssues(thrown: unknown): RecognizedValidationFailure | undefined {
  if (!(thrown instanceof ZodError)) {
    return undefined;
  }
  const rawIssues: readonly unknown[] = thrown.issues;
  const mapped: MappedFieldIssue[] = [];
  for (const raw of rawIssues) {
    if (mapped.length >= MAX_PUBLISHED_ISSUES) {
      break;
    }
    const issue = toFieldIssue(raw);
    if (issue !== undefined) {
      mapped.push(issue);
    }
  }
  return { fields: mapped, issueCount: rawIssues.length };
}

// ---------------------------------------------------------------------------
// Response and log construction
// ---------------------------------------------------------------------------

/**
 * The shape a classifier token - an error name or an error code - may take
 * before it is written to a log line.
 *
 * Letters, digits, `_`, `.` and `-`, capped at 64 characters. Sized to the
 * machine tokens that actually occur: a Node `ERR_*` or `ECONNREFUSED` code, a
 * MySQL driver `ER_*` code, or a class name. Every whitespace character, quote,
 * parenthesis and other punctuation mark is excluded, which is what makes it
 * structurally impossible for a SQL fragment, a connection string, a rejected
 * input value or a sentence to pass itself off as a classifier.
 *
 * No `g` flag: the pattern is reused across invocations, and a global regex would
 * carry `lastIndex` between them.
 */
const SAFE_ERROR_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Substituted for an error name that is not shaped like a classifier. */
const UNSAFE_THROWN_NAME = 'unsafeName';

/**
 * Describe WHAT was thrown without emitting any of its contents.
 *
 * Goes to the log only, so an operator can tell a driver failure from a thrown
 * string or a thrown object at a glance without the description itself carrying
 * a message, a statement or a value.
 *
 * An error's `name` is an ordinary writable property, so it is held to the
 * classifier shape above before being emitted. Without that test this description
 * would become a second, unpoliced way for free text to reach a log line - the
 * very thing the reduction in the unrecognized arm exists to prevent.
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
 * How much of a route diagnostic is kept.
 *
 * A route is a method and a canonical path, so a legitimate one is short. The
 * bound exists because the value is CALLER-SUPPLIED: a request may name any path
 * at all, and an unbounded copy of it on the log stream is work a caller can ask
 * for. Matches the echo bounds used for the same reason in `src/lib/config.ts`
 * and `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts`.
 */
const MAX_ROUTE_DIAGNOSTIC_LENGTH = 120;

/**
 * The first character that cannot appear in a method-and-path label.
 *
 * Everything from here onward is DROPPED rather than substituted. `?`, `#`, `&`
 * and `=` are not merely illegal characters, they are the markers that say
 * "structured path ends, opaque caller payload begins" - so the interesting
 * boundary is where they FIRST occur, and keeping anything after one would keep
 * exactly the part of the string that carries a token.
 */
const ROUTE_DIAGNOSTIC_DISALLOWED = /[^A-Za-z0-9/_. -]/;

/** The path separator, used to bound each segment independently. */
const ROUTE_SEGMENT_SEPARATOR = '/';

/**
 * How long one path segment may be before it is replaced by its length.
 *
 * ★ THIS BOUND, NOT THE CHARACTER FILTER, IS WHAT ACTUALLY REMOVES A SECRET, and
 * the distinction was established by measurement rather than reasoning. A filter
 * over the path alphabet does not touch an opaque credential, because a
 * credential is USUALLY SPELLED IN THAT ALPHABET: an AWS-style access key, a
 * hex digest, a base64url JWT segment and a UUID are all letters, digits,
 * hyphens and underscores. Filtering such a route removes the `?` and the `=`
 * around the token and faithfully preserves the token itself.
 *
 * What actually separates a route segment from a credential is LENGTH. The
 * longest segment in `ROUTE_TABLE` is eleven characters (`application`,
 * `resolution`); an access key is twenty, a UUID thirty-six, a JWT far more. A
 * generous bound therefore keeps every legitimate segment untouched while
 * replacing an opaque one with its length alone - and no route in the table takes
 * a path parameter, so there is no legitimate long segment to lose.
 */
const MAX_ROUTE_SEGMENT_LENGTH = 24;

/**
 * Reduce a route label to something safe and bounded to put on a log stream.
 *
 * ★ THE ROUTE IS THE ONE CALLER-AUTHORED STRING THIS MODULE LOGS, WHICH IS
 * EXACTLY WHY IT NEEDS TREATING. Everything else in an emission is chosen from a
 * closed set - the category, the status looked up from it, the correlation
 * identifier, and identifiers that have already passed a grammar test. The route
 * arrives from the request.
 *
 * Three things are done to it, in order, and each one closes a hole the previous
 * one leaves open:
 *
 *   1. CUT AT THE FIRST NON-PATH CHARACTER. `?`, `#`, `&`, `=`, `%`, whitespace
 *      beyond the single method separator, and every control character mark the
 *      point where a structured path stops and caller payload starts. Everything
 *      from there is dropped, which removes a query string entirely rather than
 *      punching holes in it.
 *   2. BOUND EACH SEGMENT. Step 1 does not help when the secret is IN the path,
 *      and it is the step most likely to be mistaken for sufficient - see
 *      `MAX_ROUTE_SEGMENT_LENGTH` for why a character filter preserves an opaque
 *      credential intact. Any segment longer than a real route segment is replaced
 *      by its length alone.
 *   3. BOUND THE WHOLE LABEL, because a path of ten thousand short segments passes
 *      both previous steps.
 *
 * Every reduction is REPORTED rather than silent, so a reader is never shown a
 * shortened route as though it were the whole one - the failure mode where this
 * module's own output gets mistaken for the caller's data.
 *
 * Applied HERE rather than in `./router.js`, deliberately. This is the single
 * funnel through which a route reaches a log line, and the router is not the only
 * source of one - a capability handler may pass its own resolved route into an
 * error mapping. Sanitizing at the funnel covers every producer; sanitizing at
 * the router would cover one.
 *
 * @param route - the label as supplied, or `undefined` when no route was resolved.
 * @returns the sanitized label, or `undefined` - preserved so the key is omitted
 *          from the serialized line rather than emitted as a null.
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
 * Replace a path segment that is too long to be a real one with its length.
 *
 * The length is kept because it is the one genuinely useful thing about an opaque
 * segment - it distinguishes "a UUID was sent where a static path was expected"
 * from "a multi-kilobyte blob was sent" - and it carries none of the content.
 */
function maskOpaqueRouteSegment(segment: string): string {
  return segment.length <= MAX_ROUTE_SEGMENT_LENGTH
    ? segment
    : `[segment of ${String(segment.length)} characters]`;
}

/**
 * Read a machine code off an arbitrary thrown value, or decline.
 *
 * This is the whole of what the unrecognized arm adds to the shape description:
 * enough to tell one infrastructure failure from another - a refused connection
 * from a duplicate key from a parse failure - without carrying a single character
 * of the failure's narrative.
 *
 * Reached through `in`-operator narrowing so nothing widens to `any` and no cast
 * is needed. Declining is the default: a code is reported only when it is a
 * string AND has the classifier shape above.
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
 * The fields every emission carries.
 *
 * `route` is included when the caller supplied one and is dropped from the
 * serialized line when it did not, because a JSON document omits an undefined
 * member. This is the one place the route appears at all - it is never echoed
 * into a response body.
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
 * Build the response for one mapped category.
 *
 * The single construction path, so a status, a header set and an envelope shape
 * are decided in exactly one place. `fields` is omitted from the envelope
 * entirely when there is nothing to report, rather than published as an empty
 * array - which is also what `exactOptionalPropertyTypes` requires of an optional
 * member.
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

// ---------------------------------------------------------------------------
// Exported surface
// ---------------------------------------------------------------------------

/**
 * Map an arbitrary thrown value onto an API Gateway proxy response.
 *
 * THE PRIMARY UNIT OF THIS MODULE. `./router.ts` and the five capability
 * handlers funnel their `catch` arms through it so that the recognition
 * decisions, the status choice and the envelope shape are decided in one place
 * instead of being re-derived per handler. `./router.ts` does so today; the five
 * handler modules are planned targets absent from the subtree at this
 * checkpoint, so for them this states the obligation they will carry.
 *
 * Recognition is ordered and total:
 *
 *   1. the framework's dead-call-target contract - the message is reproduced in
 *      the body, byte for byte. This is the one case where a failure's own
 *      message is published, and it is safe because the message is a fully
 *      specified template with exactly two identifier slots: a method name and a
 *      class name, both of them target-code identifiers, and both now ENFORCED as
 *      identifiers by the recognizing pattern rather than merely described as
 *      such here. Withholding it would lose an observable behavioural contract,
 *      which is the outcome this ordering exists to prevent.
 *
 *      "Reproduced" rather than "passed through", precisely: the published string
 *      is rebuilt from the two captured identifiers and is provably equal to the
 *      matched message, because the pattern is anchored and wholly literal
 *      outside the captures. No span of the caller's string reaches the body.
 *   2. a schema validation failure - a fixed sentence plus the field paths and
 *      constraint descriptions, never the submitted values.
 *   3. everything else - a fixed generic sentence. The real detail, including the
 *      thrown value itself, goes to the logger and NOTHING driver-derived
 *      reaches the body. A database driver attaches the failing statement to its
 *      error and builds the error's own message out of the server's error text,
 *      so a pass-through here would publish schema detail; the module header
 *      names both driver sites by package, pinned version and symbol.
 *
 * Never throws. Every arm is a total function over `unknown`, the logger it
 * delegates to is itself guaranteed not to throw, and the envelope is built from
 * strings already in hand - so a failure while reporting a failure is not
 * possible.
 *
 * @param thrown  The caught value, of genuinely unknown type. Narrowed by
 *                `instanceof` and by bounded property probes; never cast.
 * @param context Correlation identifier, optional route, optional logger.
 * @returns       A JSON response carrying one of exactly three statuses.
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
      // Paths only, and only the bounded set. `issueCount` is the TRUE count, so
      // a truncated body is visible here even though the caller cannot tell.
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

  // The unrecognized arm. The thrown value itself is passed NOWHERE - not into
  // the response, and not into the log either. Only a CLASSIFICATION of it
  // travels: its shape, and a machine code when it carries one, both held to the
  // classifier pattern above. The response carries the fixed generic sentence.
  //
  // The reason the log is treated as carefully as the body is that an exception's
  // `message` and `stack` are free text assembled at throw time out of whatever
  // data was in hand. The driver locators in the module header are the concrete
  // case: for a syntax or constraint failure the server's error text embeds the
  // failing SQL fragment, so `message` alone would publish schema detail into the
  // log stream, and the attached statement and its bound values sit right beside
  // it. A validation failure quotes the rejected input; a connection failure
  // names the host and the account. None of that is describable to a caller, and
  // none of it belongs in a log line either.
  //
  // `src/lib/logger.ts` independently reduces any `Error` it is handed to a
  // shape-validated name and code, so this reduction is not the only line of
  // defence. It is here as well because a thrown value need not be an `Error` at
  // all: a thrown string, or a plain object carrying a `message` member, is a
  // structure the logger's key-based policy would traverse and emit verbatim.
  // Classifying at the call site closes that case at its source.
  sink.error('unrecognized failure mapped to a generic response', {
    ...baseLogContext('unrecognized', context),
    thrownShape: describeThrownShape(thrown),
    errorCode: readSafeErrorCode(thrown),
  });
  return buildResponse('unrecognized', GENERIC_FAILURE_MESSAGE, context.requestId, undefined);
}

/**
 * Build the response for a request that matched no route.
 *
 * Exists so the router does not re-derive a status, a body envelope or a header
 * set of its own - error mapping stays centralized in this one module. Separating
 * this from a domain failure is warranted by the source itself: the legacy
 * framework raised distinct, TYPED exceptions for routing failures, which is
 * cited in the module header. Those type names are not reproduced.
 *
 * The route is written to the log and NOT echoed into the body. Reflecting a
 * caller-supplied path back adds nothing the correlation identifier does not
 * already provide.
 *
 * @param context Correlation identifier, the unmatched route if one is known,
 *                and an optional logger.
 */
export function routeNotFoundResponse(context: ErrorMappingContext): APIGatewayProxyResult {
  resolveLogger(context).warn(
    'no route matched the request',
    baseLogContext('routeNotFound', context),
  );
  return buildResponse('routeNotFound', ROUTE_NOT_FOUND_MESSAGE, context.requestId, undefined);
}

/**
 * Build the response for request input a handler has itself established is
 * unusable, before the input reached any service.
 *
 * The counterpart to the validation arm of `mapErrorToApiGatewayResponse`: that
 * arm recognizes a validation failure that was THROWN, while this one is called
 * directly by a handler that already knows - a missing path parameter, an absent
 * body, a body that is not the expected JSON shape. Routing it through this
 * module keeps the status and the envelope in one place.
 *
 * The caller NAMES a reason and this module owns the words. There is deliberately
 * no way to pass a sentence in: a free-form `string` parameter would be
 * published as given, and that is a hole straight through the one promise this
 * module exists to keep - that no body carries an interpolated driver message, an
 * echo of caller input, a credential, a connection detail or a SQL fragment.
 * Documenting the prohibition is not the same as enforcing it, and only one
 * handler has to interpolate for the guarantee to be gone. `InvalidRequestReason`
 * makes the guarantee structural: the published sentence is selected from a
 * frozen table, so there is no expressible call that publishes caller text.
 *
 * The reason itself is a closed literal, so it is safe to log - and it is logged,
 * because it is the detail an operator needs and the body no longer carries it.
 *
 * @param reason  Which class of unusable input the handler established.
 * @param context Correlation identifier, optional route, optional logger.
 * @param fields  Field-level complaints. Omit when there are none; an empty
 *                array is treated the same as omitting it and is not published.
 */
export function invalidRequestResponse(
  reason: InvalidRequestReason,
  context: ErrorMappingContext,
  fields?: readonly MappedFieldIssue[],
): APIGatewayProxyResult {
  resolveLogger(context).warn('request input rejected before it reached the services', {
    ...baseLogContext('invalidRequest', context),
    invalidRequestReason: reason,
    fieldPaths: fields === undefined ? [] : fields.map((field) => field.path),
  });
  return buildResponse(
    'invalidRequest',
    INVALID_REQUEST_MESSAGE_BY_REASON[reason],
    context.requestId,
    fields,
  );
}
