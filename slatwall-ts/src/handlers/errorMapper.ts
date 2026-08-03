// ---------------------------------------------------------------------------
// slatwall-ts - error mapping for the primary (Lambda) adapters
//
// Turn a thrown value into an API Gateway proxy response. This is the one place in the subtree that
// decides which failures are describable to a caller, which are not, and what HTTP status each
// carries. `./router.ts` consumes this module today; the five capability handlers are AAP targets
// the subtree does not yet contain, and each carries the same OBLIGATION to funnel its `catch` arms
// here rather than re-derive a status and a body of its own.
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
// following directly from the three recognized shapes plus a default - a client-shaped failure
// whose input is not usable, a route-not-found, and a server-shaped failure for everything else.
// Distinguishing route-not-found from a domain failure is not invented either: the legacy framework
// already raised TYPED exceptions for routing failures (`org/Hibachi/FW1/framework.cfc:L963` for a
// missing service, `:L1231` for a missing service method, `:L2023-L2024` for a missing view), which
// proves routing failures were distinguishable in the source. Those exception TYPE NAMES are
// deliberately NOT carried forward - FW/1 itself is not carried forward, and reproducing its type
// strings would invent a contract the target does not owe. Nothing beyond that is modelled - no
// authentication or authorization status, because the one in-scope legacy controller publishes its
// feed action outright with empty secure- and admin-method lists, and no conflict,
// unprocessable-entity or request-quota status nor the headers that accompany one, because the
// source has no notion of any of them.
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

import type { APIGatewayProxyResult } from 'aws-lambda';
import { ZodError } from 'zod';

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
 * and never by a service; `invalidRequest` is client-shaped; `unrecognized` is anything else, and
 * its message is withheld from the body.
 */
export type MappedErrorCategory =
  'missingMethod' | 'routeNotFound' | 'invalidRequest' | 'unrecognized';

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
  /** Dotted path to the offending member of the request input. */
  readonly path: string;
  /** Human-readable description of the constraint that failed. */
  readonly message: string;
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
 * the test suites, and each capability handler once authored can parse a body without restating its
 * shape. The envelope holds no legacy error code, no framework exception type and no stack.
 */
export interface ErrorResponseBody {
  readonly error: {
    /** Which of the four mapped shapes this response represents. */
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
 * The status carried by each mapped shape. Three codes, and only three - see the status-set note in
 * the module header for why nothing further is modelled.
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
  unrecognized: 500,
});

/**
 * Headers on every response this module builds. `content-type` is declared explicitly because the
 * body is always a JSON document; `cache-control: no-store` keeps an intermediary from serving a
 * stored failure to a later, unrelated request.
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

/** Body message for a schema-rejected request input. */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

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
 * Reduce one raw issue to the two members that are safe to publish.
 *
 * Reads `path` and `message` and NOTHING else. In particular the library also records what it
 * RECEIVED, on `received` and on the sibling members some issue kinds add, and none of those is
 * read here or anywhere else in this module - which is the reason a rejected credential or card
 * number cannot travel out through a 400 response. The message is CLAMPED rather than published as
 * given, because an unrecognized-key complaint names the key, which came from the caller.
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
 */
const ROUTE_DIAGNOSTIC_DISALLOWED = /[^A-Za-z0-9/_. -]/;

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

// --- Exported surface ------------------------------------------------------

/**
 * Map an arbitrary thrown value onto an API Gateway proxy response.
 *
 * THE PRIMARY UNIT OF THIS MODULE. `./router.ts` funnels its `catch` arms through it today, and
 * each capability handler carries the same obligation once authored, so the recognition decisions,
 * the status choice and the envelope shape are decided in one place.
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
      // Paths only, and only the bounded set. `issueCount` is the TRUE count.
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
 * @param reason  Which class of unusable input the handler established.
 * @param context Correlation identifier, optional route, optional logger.
 * @param fields  Field-level complaints. Omit when there are none; an empty array is treated the
 *                same as omitting it and is not published.
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
