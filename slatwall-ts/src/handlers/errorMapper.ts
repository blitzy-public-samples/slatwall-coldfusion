// ---------------------------------------------------------------------------
// slatwall-ts - error mapping for the primary (Lambda) adapters
//
// PURPOSE
//   Turn a thrown value into an API Gateway proxy response. This is the one
//   place in the subtree that decides which failures are describable to a
//   caller, which are not, and what HTTP status each carries. Centralizing that
//   decision here is the whole point: the router and the five capability
//   handlers consume this module rather than each re-deriving a status and a
//   body of its own.
//
// ENTRY-POINT STATUS: NO.
//   This is a SHARED INTERNAL of `src/handlers/`, not a bundle entry point, and
//   it deliberately exports NO Lambda `handler`. The bundler enumerates its
//   candidate entrypoints explicitly - `router.ts`, `catalogQueryHandler.ts`,
//   `skuResolutionHandler.ts`, `promotionApplicationHandler.ts`,
//   `priceResolutionHandler.ts`, `productFeedHandler.ts` - and this file is not
//   among them. It is also the FIRST file authored in this folder and has zero
//   intra-folder dependencies, which is what lets every sibling import it
//   without a cycle.
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
//   its own message; an unrecognized one returns a GENERIC message and the real
//   detail goes to the structured logger instead, which the Lambda runtime
//   captures from stdout natively.
//
//   The reason is concrete and was verified against the pinned driver rather
//   than assumed. The MySQL driver builds its errors from the server's own error
//   text and then hangs the failing statement off the error object:
//
//     node_modules/mysql2/lib/packets/packet.js:833-838
//         const err = new Error(message); ... err.sqlMessage = message;
//     node_modules/mysql2/lib/commands/command.js:30
//         err.sql = this.sql || this.query;
//
//   For a syntax or constraint failure that server text embeds the failing SQL
//   fragment, so `error.message` is itself a leak vector, quite apart from the
//   attached statement and its bound values. A mapper that blanket-returned
//   `error.message` would publish schema detail, and potentially connection
//   detail, straight into a response body. So it does not.
//
//   That cuts the other way too, and it is exactly why the missing-method
//   contract must be an EXPLICITLY RECOGNIZED case: without recognition it would
//   be swallowed into a generic server-shaped response and the must-preserve
//   contract would be silently lost.
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
 * The JSON document every response from this module carries.
 *
 * Published as a type so the router, the capability handlers and the net-new
 * suites can parse a body without restating its shape. The envelope holds no
 * legacy error code, no framework exception type and no stack trace.
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
 * selective-mapping note in the module header for the driver locators that make
 * a pass-through unacceptable.
 */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/** Body message for a request that matched no route. */
const ROUTE_NOT_FOUND_MESSAGE = 'The requested route does not exist.';

/** Body message for a schema-rejected request input. */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

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
 * The recognized shape, anchored at both ends.
 *
 * Every distinguishing feature of the legacy statement is load-bearing and
 * therefore literal in the pattern: the opening clause, the empty argument list
 * `()` after the method name, the grammatical error "does not exists", and the
 * trailing " entity." - which the service tier emits as well.
 *
 * Both capture groups are non-greedy and the pattern is fully anchored, so the
 * method name and class name are recovered exactly rather than by longest match.
 * There is no `g` flag: this pattern is reused across invocations, and a global
 * regex would carry `lastIndex` between them.
 */
const MISSING_METHOD_MESSAGE_PATTERN =
  /^You have called a method (.+?)\(\) which does not exists in the (.+?) entity\.$/;

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
 * Read a message off an arbitrary thrown value.
 *
 * Three arms, in order:
 *
 *   * a bare string. The legacy construct is `throw('<message>')`, which throws
 *     the string itself, so a thrown string is the shape a caller reproducing
 *     that construct most plausibly produces. Accepting it is defensive rather
 *     than inventive - without this arm the contract would be lost to the
 *     generic arm for exactly the callers most faithful to the source.
 *   * a real `Error`, which is the shape the annotated decision above settles
 *     on for the throwing domain module.
 *   * anything else carrying a string `message`, reached through `in`-operator
 *     narrowing so no cast is needed and nothing widens to `any`.
 *
 * Returning a message here grants NOTHING: only a successful match against the
 * anchored pattern above lets a message reach a response body.
 */
function readThrownMessage(thrown: unknown): string | undefined {
  if (typeof thrown === 'string') {
    return thrown;
  }
  if (thrown instanceof Error) {
    return thrown.message;
  }
  if (typeof thrown !== 'object' || thrown === null) {
    return undefined;
  }
  if (!('message' in thrown)) {
    return undefined;
  }
  const { message } = thrown;
  return typeof message === 'string' ? message : undefined;
}

/**
 * Recognize the framework's dead-call-target contract, or decline.
 *
 * Matching is performed on the trimmed message and the trimmed message is what
 * is preserved. Trimming can only remove surrounding whitespace, which is not
 * part of the contract, so for a faithful producer the trimmed and original
 * messages are the same string - and for a careless one the contract still
 * survives instead of being lost to the generic arm.
 */
function recognizeMissingMethodContract(thrown: unknown): MissingMethodContract | undefined {
  const raw = readThrownMessage(thrown);
  if (raw === undefined) {
    return undefined;
  }
  const message = raw.trim();
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
  return { message, methodName, className };
}

// ---------------------------------------------------------------------------
// Schema-rejected request input
// ---------------------------------------------------------------------------

// JUDGMENT CALL: a schema validation failure is recognized STRUCTURALLY - by its
// `name` and the shape of its `issues` - and NOT with `instanceof`, so this module
// imports no validation library at all. Two reasons, both practical. First,
// `instanceof` compares constructor identity, and a bundle that ends up holding
// two copies of a library would make an otherwise-valid failure unrecognisable;
// a structural probe cannot fail that way. Second, keeping the import list at one
// internal module plus one type-only runtime typing package means the error
// mapper stays the lightest thing in the folder, which matters because every
// sibling depends on it.
//
// This is also the reason the recognized set is CLOSED at the three shapes the
// plan names. In particular a `SyntaxError` - the shape a JSON body parse
// produces - is DELIBERATELY NOT treated as client-shaped: a syntax error is
// equally producible by this service's own code, and inferring "the caller sent
// bad bytes" from it would be inventing a semantic the source never had. A
// handler that has itself established the input is unusable calls
// `invalidRequestResponse` and says so directly.

/**
 * The `name` a schema validation failure carries.
 *
 * Verified against the pinned validation library rather than assumed: its error
 * reports this `name`, is a real `Error`, and exposes an `issues` array whose
 * entries carry a `path` and a `message`.
 */
const VALIDATION_ERROR_NAME = 'ZodError';

/**
 * Render one issue's location as a dotted path.
 *
 * The library reports a path as an array of property names and array indices.
 * Only string and finite numeric segments are rendered; anything else is
 * dropped, so a symbol-keyed or otherwise unrenderable segment cannot turn into
 * a meaningless fragment in a published body. An absent or unusable path yields
 * the empty string, which names the root of the input.
 */
function readIssuePath(issue: object): string {
  if (!('path' in issue)) {
    return '';
  }
  const { path } = issue;
  if (typeof path === 'string') {
    return path;
  }
  if (!Array.isArray(path)) {
    return '';
  }
  const segments: readonly unknown[] = path;
  const rendered: string[] = [];
  for (const segment of segments) {
    if (typeof segment === 'string' && segment.length > 0) {
      rendered.push(segment);
    } else if (typeof segment === 'number' && Number.isFinite(segment)) {
      rendered.push(String(segment));
    }
  }
  return rendered.join('.');
}

/**
 * Reduce one raw issue to the two members that are safe to publish.
 *
 * Reads `path` and `message` and NOTHING else. The library also records what it
 * received, and that member is never read here: a validation report describes
 * the constraint that failed, it does not echo the input back.
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
  return { path: readIssuePath(raw), message };
}

/**
 * Recognize a schema validation failure and reduce it to publishable issues, or
 * decline.
 *
 * An empty array is a meaningful result and is NOT the same as declining: it says
 * the failure was recognized as client-shaped but produced no renderable field
 * detail. `undefined` says the value is not a validation failure at all, and it
 * then falls through to the generic arm.
 *
 * The array-narrowing sequence - narrow to `object`, then `Array.isArray`, then
 * bind to a `readonly unknown[]` - is the same one the logger uses, and it is
 * what keeps the linter's driver-boundary safety checks satisfied without a cast.
 */
function recognizeValidationIssues(thrown: unknown): readonly MappedFieldIssue[] | undefined {
  if (typeof thrown !== 'object' || thrown === null) {
    return undefined;
  }
  if (!('name' in thrown)) {
    return undefined;
  }
  if (thrown.name !== VALIDATION_ERROR_NAME) {
    return undefined;
  }
  if (!('issues' in thrown)) {
    return undefined;
  }
  const { issues } = thrown;
  if (!Array.isArray(issues)) {
    return undefined;
  }
  const rawIssues: readonly unknown[] = issues;
  const mapped: MappedFieldIssue[] = [];
  for (const raw of rawIssues) {
    const issue = toFieldIssue(raw);
    if (issue !== undefined) {
      mapped.push(issue);
    }
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// Response and log construction
// ---------------------------------------------------------------------------

/**
 * Describe WHAT was thrown without emitting any of its contents.
 *
 * Goes to the log only, so an operator can tell a driver failure from a thrown
 * string or a thrown object at a glance without the description itself carrying
 * a message, a statement or a value.
 */
function describeThrownShape(thrown: unknown): string {
  if (thrown === null) {
    return 'null';
  }
  if (thrown instanceof Error) {
    return thrown.name;
  }
  return typeof thrown;
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
    route: context.route,
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
 * THE PRIMARY UNIT OF THIS MODULE. The router and the five capability handlers
 * funnel their `catch` arms through it so that the recognition decisions, the status
 * choice and the envelope shape are decided in one place instead of being
 * re-derived per handler.
 *
 * Recognition is ordered and total:
 *
 *   1. the framework's dead-call-target contract - the message is PRESERVED
 *      verbatim in the body. This is the one case where a failure's own message
 *      is published, and it is safe because the message is a fully specified
 *      template with exactly two identifier slots: a method name and a class
 *      name, both of them target-code identifiers. Withholding it would lose an
 *      observable behavioural contract, which is the outcome this ordering
 *      exists to prevent.
 *   2. a schema validation failure - a fixed sentence plus the field paths and
 *      constraint descriptions, never the submitted values.
 *   3. everything else - a fixed generic sentence. The real detail, including the
 *      thrown value itself, goes to the logger and NOTHING driver-derived
 *      reaches the body. A database driver attaches the failing statement to its
 *      error and builds the error's own message out of the server's error text,
 *      so a pass-through here would publish schema detail; the module header
 *      cites both driver locators.
 *
 * Never throws. Every arm is a total function over `unknown`, the logger it
 * delegates to is itself guaranteed not to throw, and the envelope is built from
 * strings already in hand - so a failure while reporting a failure is not
 * possible.
 *
 * @param thrown  The caught value, of genuinely unknown type. Narrowed by
 *                `instanceof` and by property probes; never cast.
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

  const fields = recognizeValidationIssues(thrown);
  if (fields !== undefined) {
    sink.warn('request input rejected by schema validation', {
      ...baseLogContext('invalidRequest', context),
      fieldPaths: fields.map((field) => field.path),
    });
    return buildResponse('invalidRequest', INVALID_REQUEST_MESSAGE, context.requestId, fields);
  }

  // The unrecognized arm. The thrown value goes to the LOG, where the logger
  // reduces an error to its name, message and stack and copies nothing else - so
  // the statement a driver attached to it is dropped even there - and the
  // RESPONSE carries the fixed generic sentence instead.
  sink.error('unrecognized failure mapped to a generic response', {
    ...baseLogContext('unrecognized', context),
    thrownShape: describeThrownShape(thrown),
    error: thrown,
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
 * `message` must be a fixed, handler-authored sentence. It is published as
 * given, so it must never be an interpolated driver message, an echo of caller
 * input, or anything carrying a credential, a connection detail or a SQL
 * fragment - the module header explains why that prohibition is absolute.
 *
 * @param message A fixed, handler-authored description of what is unusable.
 * @param context Correlation identifier, optional route, optional logger.
 * @param fields  Field-level complaints. Omit when there are none; an empty
 *                array is treated the same as omitting it and is not published.
 */
export function invalidRequestResponse(
  message: string,
  context: ErrorMappingContext,
  fields?: readonly MappedFieldIssue[],
): APIGatewayProxyResult {
  resolveLogger(context).warn('request input rejected before it reached the services', {
    ...baseLogContext('invalidRequest', context),
    fieldPaths: fields === undefined ? [] : fields.map((field) => field.path),
  });
  return buildResponse('invalidRequest', message, context.requestId, fields);
}
