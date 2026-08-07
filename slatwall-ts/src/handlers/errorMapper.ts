// slatwall-ts - the shared request/response boundary for the primary (Lambda) adapters.
//
// Turn a thrown value into an API Gateway proxy response.
//
// A shared internal of `src/handlers/`, not a bundle entry point: it exports no Lambda `handler`.
//
// NOWHERE - not into the response, and not into the log either.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ZodError } from 'zod';

import { listFindNoCase } from '../lib/cfml/list.js';
import { structGet } from '../lib/cfml/struct.js';
import type { LogContext, Logger } from '../lib/logger.js';
import { logger } from '../lib/logger.js';

/**
 * The closed set of failure shapes this module maps.
 *
 * A string-literal union rather than the TypeScript enumeration construct, so nothing survives
 * into the Lambda bundle as a runtime object.
 *
 * `notImplemented` is the seventh member. AAP 0.2.1 designates the image service and the
 * subscription-term provider stub ports, and `./bootstrap.js` wires implementations that refuse
 * rather than answer plausibly, so a routed operation reaching one has a permanent, by-design
 * limitation to report rather than a fault. 501 is the registered status for that, and the handler
 * decides it the same way it decides 400, 401 and 403 - no thrown value picks its own status.
 */
export type MappedErrorCategory =
  | 'missingMethod'
  | 'routeNotFound'
  | 'invalidRequest'
  | 'notImplemented'
  | 'unauthenticated'
  | 'forbidden'
  | 'unrecognized';

/**
 * What a caller must hand this module alongside the failure.
 *
 * Deliberately minimal - a correlation identifier, optionally the route being served, and
 * optionally the logger to emit through.
 */
export interface ErrorMappingContext {
  /**
   * Correlation identifier for this invocation - in practice the API Gateway or Lambda request id.
   */
  readonly requestId: string;
  /**
   * The route being served, when one had been resolved. LOGGED, never echoed into the response
   * body: reflecting a caller-supplied path back serves no diagnostic purpose the correlation id
   * does not already serve.
   */
  readonly route?: string;
  /**
   * Logger to emit through. Defaults to the module-level structured logger.
   */
  readonly logger?: Logger;
}

/**
 * One field-level validation complaint, reduced to the two members that are safe to publish.
 *
 * `path` is the dotted location within the request input and `message` describes the constraint
 * that failed.
 */
export interface MappedFieldIssue {
  /**
   * Dotted path to the offending member of the request input.
   */
  readonly path: string;
  /**
   * Human-readable description of the constraint that failed.
   */
  readonly message: string;
}

/**
 * The one key name `z.strictObject` does not treat as unrecognized.
 *
 * A constant of this FILE rather than a literal at the comparison site, so the name appears once.
 */
const PROTOTYPE_MEMBER_KEY = '__proto__';

/**
 * The FIXED complaint published when a request document carries a `__proto__` own key.
 *
 * A frozen, server-authored issue - not a path built out of the caller's keys.
 *
 * A caller still learns exactly what to remove, which is everything a 400 owes it here: there is
 * one such key name, so naming it is unambiguous.
 */
export const PROTOTYPE_MEMBER_FIELD_ISSUE: MappedFieldIssue = Object.freeze({
  path: PROTOTYPE_MEMBER_KEY,
  message: 'is not a member this request accepts',
});

/**
 * Whether a parsed JSON request document carries a `__proto__` own key at any depth.
 *
 * Every request document this service accepts is validated by a `z.strictObject`, whose contract
 * is that an UNRECOGNIZED KEY is A REFUSAL.
 *
 * @param document the parsed request document, already known to be an object at its root.
 * @returns `true` when the document carries the key at any depth, which is a refusal; `false` for
 * every well-formed request.
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
 * A CLOSED union, and closed for a security reason rather than a stylistic one.
 *
 * No sentence ever echoes the offending value, the parameter name, the route or any part of the
 * submitted document.
 */
export type InvalidRequestReason =
  /**
   * A path parameter the route requires was absent or empty.
   */
  | 'missingPathParameter'
  /**
   * A query-string parameter the operation requires was absent or empty.
   */
  | 'missingQueryParameter'
  /**
   * The operation requires a request body and none was supplied.
   */
  | 'missingRequestBody'
  /**
   * A body was supplied but is not parsable as JSON.
   *
   * Deliberately a REASON a handler states rather than something inferred from a caught
   * `SyntaxError`.
   */
  | 'unparsableRequestBody'
  /**
   * The body parsed but is not the expected shape: not an object, or an array.
   */
  | 'unsupportedBodyShape'
  /**
   * The input is unusable for a reason none of the five above names.
   */
  | 'unusableRequestInput';

/**
 * The JSON document every response from this module carries.
 */
export interface ErrorResponseBody {
  readonly error: {
    /**
     * Which of the six mapped shapes this response represents.
     */
    readonly category: MappedErrorCategory;
    /**
     * Safe description. For a recognized failure this is the failure's own message; for an
     * unrecognized one it is a fixed generic sentence and the real message is on the log stream
     * instead.
     */
    readonly message: string;
    /**
     * Echo of `ErrorMappingContext.requestId`, for log correlation.
     */
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
 * the authorization-vocabulary note in the module header for why each exists and why nothing
 * further is modelled.
 *
 * A `Record` keyed by the closed union rather than an index signature, so an index into it is
 * `number` and never widens to `undefined`.
 */
const STATUS_BY_CATEGORY: Readonly<Record<MappedErrorCategory, number>> = Object.freeze({
  // A dead call target is this service's defect, not the caller's: server-shaped.
  missingMethod: 500,
  routeNotFound: 404,
  invalidRequest: 400,
  // Published and routed, and not implemented by this deployment: a permanent limitation rather
  // than a failure. No `Retry-After` accompanies it, because the limitation is not temporal.
  notImplemented: 501,
  // The caller was not identified.
  unauthenticated: 401,
  // The caller was identified and is not permitted the operation it named.
  forbidden: 403,
  unrecognized: 500,
});

/**
 * Headers on every response this module builds.
 *
 * So the rule for this object is now simply stated: a header belongs here only if this module's
 * own response contract requires it.
 */
const JSON_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/**
 * Body message for an unrecognized failure. Fixed, and deliberately uninformative: everything an
 * operator needs is on the log stream under the same `requestId` this response echoes.
 */
const GENERIC_FAILURE_MESSAGE = 'The request could not be completed.';

/**
 * Body message for a request that matched no route.
 */
const ROUTE_NOT_FOUND_MESSAGE = 'The requested route does not exist.';

/**
 * The correlation identifier published when the platform supplied neither of its own.
 */
const UNATTRIBUTED_REQUEST_ID = 'unattributed';

/**
 * Body message for a schema-rejected request input.
 */
const INVALID_REQUEST_MESSAGE = 'The request input is not valid.';

/**
 * Body message for a caller this route declines to serve without an identity.
 *
 * Fixed, and deliberately uninformative in the same way {@link GENERIC_FAILURE_MESSAGE} is.
 */
const UNAUTHENTICATED_MESSAGE = 'The request was not served.';

/**
 * Body message for an identified caller that is not permitted the operation it named.
 */
const FORBIDDEN_MESSAGE = UNAUTHENTICATED_MESSAGE;

/**
 * Body message for an operation this deployment does not implement.
 *
 * IT IS ACTIONABLE, AND THAT IS WHY IT IS NOT BYTE-IDENTICAL TO ITS NEIGHBOURS. The two
 * authorization sentences are deliberately uninformative because a refusal must not become a
 * reconnaissance oracle - a caller learning WHICH claim would have worked, or that an operation
 * exists, is exactly what they withhold. NONE of that applies here: the operation is PUBLISHED in the
 * closed selector list a 400 already enumerates, the caller has already been identified and admitted
 * as administrative before this refusal is reachable, and the limitation is permanent rather than
 * conditional on anything about the caller. So there is no fact left to withhold, and the one thing
 * the caller needs - stop retrying, this is not built - is stated.
 *
 * ⚠ IT NAMES NO OPERATION, NO PORT, NO CLASS AND NO CONFIGURATION KEY. Finding F-04 was raised
 * against a 500 whose LOG line read `ImageStoreNotConfiguredError @ RefusingImageStore.deleteImageFile`;
 * that detail stays on the log stream under the same `requestId` this body echoes, exactly as every
 * other withheld detail in this module does. A body naming `imageStore` would publish this service's
 * internal composition to anyone who can reach the route.
 */
const NOT_IMPLEMENTED_MESSAGE =
  'This deployment does not implement the operation. It is published for interface parity and no ' +
  'retry will succeed.';

/**
 * The sentence published for each `InvalidRequestReason`.
 *
 * The whole point of the closed union: the WORDS live here, frozen, and a handler chooses among
 * them by naming a reason.
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

// LEGACY-DEFECT [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]: the
// framework's terminal onMissingMethod throw is grammatically incorrect ("does not exists") and
// the service-tier copy still says "entity".
// Preserved deliberately; do not fix without a product decision.

// JUDGMENT CALL: the missing-method message template is duplicated between the throwing domain
// module and this recognizer because ESLint no-restricted-imports forbids src/domain/** from
// importing src/handlers/**.

/**
 * The recognized shape, anchored at both ends, with IDENTIFIER-ONLY capture groups.
 *
 * Every distinguishing feature of the legacy statement is load-bearing and therefore literal: the
 * opening clause, the empty argument list `()` after the method name.
 *
 * The capture groups are identifiers, not `(.+?)`, and that is a security property.
 */
const MISSING_METHOD_MESSAGE_PATTERN =
  /^You have called a method ([A-Za-z_$][A-Za-z0-9_$]{0,63})\(\) which does not exists in the ([A-Za-z_$][A-Za-z0-9_$]{0,63}) entity\.$/;

/**
 * The longest message this module will even attempt to recognize.
 *
 * The contract message's own maximum length is fixed and computable: 25 characters of opening
 * clause, at most 64 for the method name, 2 for `()`, 31 for the middle clause.
 */
const MAX_RECOGNIZED_MESSAGE_LENGTH = 256;

/**
 * What a recognized missing-method failure yields. Module-private.
 */
interface MissingMethodContract {
  /**
   * The contract message, preserved for the response body.
   */
  readonly message: string;
  /**
   * The dead call target named by the message. Logged, not echoed.
   */
  readonly methodName: string;
  /**
   * The class the message names. Logged, not echoed.
   */
  readonly className: string;
}

/**
 * Read a message off a thrown value, and only off a real `Error`.
 *
 * A bare thrown string is the LEGACY CFML construct and no CFML runs in the target, and an object
 * merely CARRYING a string `message` is a shape anything can wear.
 */
function readThrownMessage(thrown: unknown): string | undefined {
  return thrown instanceof Error ? thrown.message : undefined;
}

/**
 * Recognize the framework's dead-call-target contract, or decline.
 *
 * Matching is performed on the trimmed message and the trimmed message is what is preserved:
 * trimming removes only surrounding whitespace, which is not part of the contract.
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

  // PROVABLY the same STRING: the pattern is anchored at both ends and every character outside the
  // capture groups is a literal, so a matched `message` is by construction the concatenation
  // below.
  const reconstructed = `You have called a method ${methodName}() which does not exists in the ${className} entity.`;

  // A disagreement here means the pattern and this template have drifted apart, so declining hands
  // the caller the generic response rather than either string.
  if (reconstructed !== message) {
    return undefined;
  }

  return { message: reconstructed, methodName, className };
}

// JUDGMENT CALL: a schema validation failure is recognized by `instanceof ZodError` against the
// pinned validation library, not structurally by its `name` and the shape of its `issues`.
//
// The recognized set stays CLOSED at the three shapes the plan names.

/**
 * How many field issues a response body will carry.
 *
 * The issue count is chosen by the CALLER - one per rejected member, so a body naming a thousand
 * members produces a thousand issues.
 */
const MAX_PUBLISHED_ISSUES = 20;

/**
 * Longest constraint description published for one issue.
 */
const MAX_ISSUE_MESSAGE_LENGTH = 200;

/**
 * Most path segments rendered for one issue.
 */
const MAX_ISSUE_PATH_SEGMENTS = 10;

/**
 * Longest single path segment rendered.
 */
const MAX_PATH_SEGMENT_LENGTH = 64;

/**
 * Appended to any text this module shortened, so a bounded value is visibly bounded.
 */
const TRUNCATION_MARKER = '...';

/**
 * Shorten `value` to `limit` characters, marking it when anything was removed.
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
 *
 * Why the bounds are here and not only on the message: a path segment is not always
 * schema-derived.
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
 */
const UNRECOGNIZED_KEYS_ISSUE_CODE = 'unrecognized_keys';

/**
 * The sentence published in place of an unrecognized-key complaint.
 *
 * And this is what makes `strictObject` usable at the handler tier at all.
 */
const UNRECOGNIZED_MEMBER_MESSAGE =
  'contains a member this operation does not publish; remove it and retry';

/**
 * Whether a raw issue is the library's unrecognized-key complaint.
 *
 * Probes `code` rather than pattern-matching the rendered sentence, because the sentence is
 * exactly the thing that must not be trusted here.
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
 * Unrecognized-member complaints are intercepted by {@link expandUnrecognizedKeys} before reaching
 * this reducer.
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
 * The result therefore keeps the schema-authored container path from `readIssuePath` and
 * substitutes the fixed sentence from {@link UNRECOGNIZED_MEMBER_MESSAGE}.
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

/**
 * Prefix one already-sanitized issue with a server-authored containing path.
 */
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
 * This is the shared path for both the mapper's own thrown-error funnel and a handler that
 * validates a nested document separately.
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

    // An unrecognized-key complaint is reduced first so neither its rendered message nor its
    // `keys` member can reach the ordinary reducer.
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

/**
 * What a recognized validation failure yields. Module-private.
 */
interface RecognizedValidationFailure {
  /**
   * The bounded set of issues published in the response body.
   */
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
 * Recognition is `instanceof ZodError` and nothing else - see the judgment call above.
 */
function recognizeValidationIssues(thrown: unknown): RecognizedValidationFailure | undefined {
  if (!(thrown instanceof ZodError)) {
    return undefined;
  }
  const rawIssues: readonly unknown[] = thrown.issues;

  return { fields: mapZodErrorFields(thrown), issueCount: rawIssues.length };
}

/**
 * The shape a classifier token - an error name or an error code - may take before it is written to
 * a log line.
 *
 * Letters, digits, `_`, `.` and `-`, capped at 64 characters: sized to the machine tokens that
 * actually occur, a Node `ERR_*` or `ECONNREFUSED` code, a MySQL driver `ER_*` code.
 */
const SAFE_ERROR_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Substituted for an error name that is not shaped like a classifier.
 */
const UNSAFE_THROWN_NAME = 'unsafeName';

/**
 * Describe what was thrown without emitting any of its contents.
 *
 * Goes to the log only, so an operator can tell a driver failure from a thrown string or object at
 * a glance without the description carrying a message, a statement or a value.
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
 */
const STACK_FRAME_ASYNC_PREFIX = 'async ';

/**
 * Where a V8 stack frame's location begins, and therefore where the function's name ends.
 */
const STACK_FRAME_LOCATION_MARKER = ' (';

/**
 * The prefix V8 puts on every frame line.
 */
const STACK_FRAME_PREFIX = 'at ';

/**
 * Name the FUNCTION a failure was thrown from, and nothing else about it.
 *
 * The first stack frame's function name is the missing piece, and it is the RIGHT missing piece:
 * `ProductType.getBaseProductType` identifies the defect immediately.
 *
 * @param thrown the value that reached the unrecognized arm.
 * @returns the throwing function's name when it is shaped like a classifier, `undefined`
 * otherwise.
 */
function describeThrowSite(thrown: unknown): string | undefined {
  if (!(thrown instanceof Error) || typeof thrown.stack !== 'string') {
    return undefined;
  }

  for (const rawLine of thrown.stack.split('\n')) {
    const line = rawLine.trim();

    // The first line of a V8 stack is `Name: message`, which must never be read. Frame lines are
    // the ones beginning `at `, and only the FIRST of those is considered - the loop exists to
    // find it, not to walk past it.
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
 * can ask for.
 */
const MAX_ROUTE_DIAGNOSTIC_LENGTH = 120;

/**
 * The first character that cannot appear in a method-and-path label.
 *
 * The class admits exactly what a route label needs. Anything narrower would produce a label that
 * agrees with no route table, no router primitive and no `listFindNoCase` call.
 */
const ROUTE_DIAGNOSTIC_DISALLOWED = /[^A-Za-z0-9/_., -]/;

/**
 * The path separator, used to bound each segment independently.
 */
const ROUTE_SEGMENT_SEPARATOR = '/';

/**
 * How long one path segment may be before it is replaced by its length.
 *
 * This bound, not the character filter, is what actually removes a secret, and the distinction was
 * established by measurement rather than reasoning.
 */
const MAX_ROUTE_SEGMENT_LENGTH = 24;

/**
 * Reduce a route label to something safe and bounded to put on a log stream.
 *
 * TREATING: everything else in an emission is chosen from a closed set or has already passed a
 * grammar test.
 *
 * @param route the label as supplied, or `undefined` when no route was resolved.
 * @returns the sanitized label, or `undefined` - preserved so the key is omitted from the
 * serialized line rather than emitted as a null.
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
 * Replace a path segment too long to be a real one with its length.
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
 * infrastructure failure from another.
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
 * from the serialized line when it did not, because a JSON document omits an undefined member.
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
 * set and an envelope shape are decided in exactly one place.
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

/**
 * Every emission goes through the caller's logger when one was supplied.
 */
function resolveLogger(context: ErrorMappingContext): Logger {
  return context.logger ?? logger;
}

/**
 * The first non-empty trimmed candidate, or nothing.
 *
 * `unknown` rather than `string | undefined` because both correlation sources below are typed with
 * index signatures this module must not trust: a synthesised event can carry a number.
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

// The shared response and correlation contract.

/**
 * The one member of a Lambda invocation context that {@link resolveServerRequestId} reads.
 *
 * Structural rather than nominal, so both the platform's `Context` and a handler's own narrower
 * invocation-identity type satisfy it without a cast.
 */
export interface ServerInvocationIdentity {
  /**
   * The runtime's identifier for this invocation, when the runtime supplied one.
   */
  readonly awsRequestId?: string | undefined;
}

/**
 * The correlation identifier for one invocation, resolved from SERVER-ESTABLISHED sources only.
 *
 * Nothing is read from a header, and that is the security half.
 *
 * @param event the API Gateway proxy event; only `requestContext.requestId` is read.
 * @param context the invocation identity when the runtime supplied one; only `awsRequestId` is
 * read.
 * @returns a non-empty identifier - {@link UNATTRIBUTED_REQUEST_ID} when the platform supplied
 * none.
 */
export function resolveServerRequestId(
  event: APIGatewayProxyEvent,
  context?: ServerInvocationIdentity,
): string {
  // `requestContext` is typed as always present but a synthesised event may omit it, so the read
  // is optional rather than trusting the declaration.
  return (
    firstNonEmptyIdentifier([context?.awsRequestId, event.requestContext?.requestId]) ??
    UNATTRIBUTED_REQUEST_ID
  );
}

/**
 * The canonical diagnostic label for a resolved route: `METHOD /path`.
 *
 * Built from the FROZEN route table's own members and never from anything a caller sent, which is
 * what makes it safe to log.
 *
 * @param methods the route's HTTP methods, as the table declares them.
 * @param path the route's canonical path, as the table declares it.
 */
export function routeDiagnosticLabel(methods: string, path: string): string {
  return `${methods} ${path}`;
}

/**
 * The one shape a successful JSON response from any capability handler carries.
 *
 * `requestId` - the same identifier the failure envelope echoes, so a caller can correlate a
 * SUCCESS as well as a failure.
 *
 * The route PATH is deliberately absent: it is a caller-supplied string, and the closed `action`
 * literal already names what ran.
 */
export interface SuccessResponseBody<TResult> {
  /**
   * Echo of the server-established correlation identifier.
   */
  readonly requestId: string;
  /**
   * The capability that answered, as a closed literal from the route table.
   */
  readonly capability: string;
  /**
   * The action that ran, as a closed literal from the route table.
   */
  readonly action: string;
  /**
   * The capability's own payload.
   */
  readonly result: TResult;
}

/**
 * Build the shared 200 response for a served request.
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
 * @param thrown The caught value, of genuinely unknown type.
 * @param context Correlation identifier, optional route, optional logger.
 * @returns A JSON response carrying 400, 404 or 500.
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
  // and code, so this reduction is not the only line of defence.
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
 * It is appended to the log message and never to the response body.
 *
 * @param reason Which class of unusable input the handler established.
 * @param context Correlation identifier, optional route, optional logger.
 * @param fields Field-level complaints.
 * @param logDetail The ground of the refusal, for the LOG LINE ONLY.
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
 * The FAIL-CLOSED DIRECTION, and the reason it is a separate function rather than a parameter on
 * `invalidRequestResponse`: an unidentified caller has not made a MISTAKE about its input.
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
 * The operation is logged by the refusing handler and is not accepted here.
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

/**
 * Build the response for a published operation this deployment does not implement.
 *
 * A producer rather than a recognizer, which is the whole design: the recognizer set in
 * `mapErrorToApiGatewayResponse` stays closed at three shapes so a value arriving from a service, a
 * driver or a deserialized document can never choose its own status. The handler narrows the
 * stub-port refusal itself, with `instanceof` against the class `./bootstrap.js` exports - the
 * mechanism `./promotionApplicationHandler.js` already uses for `OrderViewDocumentDataError` - and
 * then decides 501.
 *
 * `fields` is not a parameter, for the same reason the two authorization producers omit it: the
 * caller's input was not the problem, and every member it sent may have been well formed.
 *
 * The operation stays in the route table rather than being withdrawn, because AAP 0.4.2 publishes
 * `processProduct_deleteDefaultImage(product, data)` on the interface-parity table that is this
 * migration's acceptance contract. Withdrawing it would shrink the published surface and leave a
 * caller unable to tell an unimplemented operation from a misspelled one.
 *
 * @param context Correlation identifier, the route being served if known, and an optional logger.
 */
export function notImplementedResponse(context: ErrorMappingContext): APIGatewayProxyResult {
  resolveLogger(context).warn(
    'request refused: the operation is published but not implemented in this deployment',
    baseLogContext('notImplemented', context),
  );
  return buildResponse('notImplemented', NOT_IMPLEMENTED_MESSAGE, context.requestId, undefined);
}

// Section - the caller principal.
//
// It ALREADY reads server-established members of the event and owns the policy for them.
//
// Duplicate the read in each of the four handlers that need it.

/**
 * The authorizer-context member naming the authenticated account.
 *
 * A constant rather than an inline literal, so the one name this boundary depends on is stated
 * once for the whole routed surface.
 *
 * The value is the `Sw*` account identifier the ported services already speak in - see
 * `RequestScopeInput.accountID` in `./bootstrap.js`.
 */
export const AUTHORIZER_ACCOUNT_CLAIM = 'accountID';

/**
 * The authorizer-context member marking the account as administrative.
 *
 * Named for the legacy column it corresponds to: the audit gate the legacy applied was
 * `!account.isNew() && account.getAdminAccountFlag()`.
 */
export const AUTHORIZER_ADMIN_CLAIM = 'adminAccountFlag';

/**
 * The two truthy renderings an authorizer may publish for {@link AUTHORIZER_ADMIN_CLAIM}.
 *
 * `"1"` is included because an authorizer emitting a numeric flag renders it that way.
 */
const TRUTHY_ADMIN_CLAIM_VALUES: readonly string[] = Object.freeze(['true', '1']);

/**
 * The authorizer-context member naming the SERVICE capabilities this caller may drive.
 *
 * No new security mechanism is invented, and that boundary matters.
 */
export const AUTHORIZER_SERVICE_SCOPE_CLAIM = 'serviceScope';

/**
 * An identified caller.
 *
 * The whole of what a handler learns about who is asking.
 */
export interface RequestPrincipal {
  /**
   * The authenticated account, as an OPAQUE identifier.
   *
   * Carried, never parsed: no meaning is read out of the characters, and it is never concatenated
   * into a statement - every repository this reaches binds it as a parameter.
   */
  readonly accountID: string;

  /**
   * Whether the authorizer marked this account administrative.
   */
  readonly adminAccountFlag: boolean;

  /**
   * The service capabilities this caller is granted, as the authorizer published them.
   *
   * A CFML list - comma-delimited, tested only through {@link principalHasServiceScope} so the
   * comparison rule exists once.
   */
  readonly serviceScope: string;
}

/**
 * What reading the authorizer context yielded.
 */
export type RequestPrincipalResolution =
  | { readonly identified: true; readonly principal: RequestPrincipal }
  | {
      readonly identified: false;
      /**
       * Which of the two unidentified shapes occurred.
       *
       * `noAuthorizerContext` means the event carried no authorizer context whatsoever - in
       * practice a route deployed without an authorizer in front of it.
       */
      readonly reason: 'noAuthorizerContext' | 'noAccountClaim';
    };

/**
 * The one unidentified outcome for a missing authorizer context. Frozen; shared, never mutated.
 */
const NO_AUTHORIZER_CONTEXT: RequestPrincipalResolution = Object.freeze({
  identified: false,
  reason: 'noAuthorizerContext',
});

/**
 * The one unidentified outcome for a context that named no usable account.
 */
const NO_ACCOUNT_CLAIM: RequestPrincipalResolution = Object.freeze({
  identified: false,
  reason: 'noAccountClaim',
});

/**
 * Compare two tokens the way CFML's `eq` does - by value, folding case.
 */
function cfEqualsToken(candidate: string, literal: string): boolean {
  return candidate.toLowerCase() === literal;
}

/**
 * Whether a value is usable as a claim set.
 */
function isClaimSet(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read one authorizer claim as a non-empty trimmed string, or nothing.
 *
 * Authorizer emitting `accountId` and one emitting `accountID` name the same claim, and CFML
 * struct semantics are this subtree's house convention for a keyed read - the alternative.
 *
 * The value is narrowed with a `typeof` probe rather than a cast, because the authorizer context
 * is typed with an index signature this module must not trust.
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
 * boolean in the context where API Gateway would have put a string.
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
 * Total over its input: every shape of event yields one of the three outcomes and nothing throws,
 * so a handler's admission step cannot fail in a way that needs its own `catch` arm.
 *
 * @param event the API Gateway proxy event.
 * @returns the identified principal, or the fact that none could be established and which shape of
 * absence occurred.
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
  // emit, and a handler holding this must not be able to substitute the account.
  return Object.freeze({
    identified: true,
    principal: Object.freeze({
      accountID,
      adminAccountFlag: readAdminClaim(claims),
      // `readClaim` yields nothing for an absent claim, a non-string and a blank string, and trims
      // the value it does yield.
      serviceScope: readClaim(claims, AUTHORIZER_SERVICE_SCOPE_CLAIM) ?? '',
    }),
  });
}

/**
 * Whether an identified caller is granted one SERVICE capability.
 *
 * @param principal the identified caller, from {@link resolveRequestPrincipal}.
 * @param capability the capability being driven - a `RoutedCapability` name from `./router.js`,
 * passed as its frozen route-table value so no route invents a token of its own.
 * @returns whether the grant names that capability.
 */
export function principalHasServiceScope(principal: RequestPrincipal, capability: string): boolean {
  // `listFindNoCase` returns a 1-based position, or CFML's `0` for absent. An empty grant splits
  // to no elements, so it answers 0 for every capability without needing a branch of its own.
  return listFindNoCase(principal.serviceScope, capability) > 0;
}

// Why the prototype-member guard is deep, and why it is iterative.
//
// ITERATIVE, with an explicit stack, because recursion over caller-supplied nesting is a stack
// overflow waiting to happen, and a 2 000-level document is well within what a caller can send.
