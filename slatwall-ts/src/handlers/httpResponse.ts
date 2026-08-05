/**
 * httpResponse — response and error shaping for the Catalog slice's Lambda handlers, and the one module
 * in this deliverable that names cloud-provider types centrally.
 *
 * Authority: AAP §0.4.1.9 — response and error shaping, with all AWS-specific typing confined to this
 * layer.
 *
 * There is no legacy counterpart, and that is the point
 * The legacy application never shaped a response itself. A request entered through index.cfm, the
 * retired FW/1 layer selected a view by convention, and the application server wrote the status line,
 * the headers and the body. Nothing in the four in-scope services, the six in-scope entities or the
 * Google feed adapter chooses a status code. Two consequences follow, and both are load bearing:
 *
 * 1. Everything in this module is net-new coverage (AAP §0.7.3). There is no legacy test to extend
 * and no parity claim to make about the shape of a response, and none is implied anywhere below —
 * the legacy suite contains no controller test and no feed test of any kind, and
 * meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52 is an empty component with zero test
 * methods (AAP §0.6.5.2).
 * 2. where legacy behavior does reach a response — the four verbatim thrown message strings and the
 * validation error-key structure — this module is a conduit and nothing more. See pass-through is
 * absolute below.
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
  EntityCrudType,
  InvocationSecurityRequest,
  RequestAuthorizationContext,
  RequestAuthorizationResolver,
} from '../ports/AccountContextPort';
import type { BoundedReadWindow } from '../ports/SmartListQueryPort';
import type { SmartListInput } from '../ports/SmartListQueryPort';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/** The AWS types this folder needs, re-exported from one place. */
export type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayProxyHandler,
  Context,
} from 'aws-lambda';

/**
 * The HTTP status codes this module emits, and the only numeric values that appear in this file.
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

  /**
   * A transient lock conflict rolled a write back. The condition is temporary and the identical request
   * may succeed if it is made again — see `TransientWriteConflictError` for why this is a `5xx` rather
   * than the `400` a duplicate key gets, and why no `Retry-After` accompanies it.
   */
  SERVICE_UNAVAILABLE: 503,
});

/** The media type used for every JSON response this module produces. */
export const JSON_CONTENT_TYPE = 'application/json';

/** The media type used for the product feed. */
export const XML_CONTENT_TYPE = 'application/xml';

/** The body every failure response carries. */
export interface ErrorResponseBody {
  readonly message: string;
  readonly errors?: ValidationErrors;
}

/* Neutral texts for the responses that have no legacy counterpart at all. */
const NOT_FOUND_MESSAGE = 'Not found';
const UNEXPECTED_FAILURE_MESSAGE = 'An unexpected error occurred';
const BODY_ABSENT_MESSAGE = 'A request body is required';
const BODY_MALFORMED_MESSAGE = 'The request body is not valid JSON';
const BODY_NOT_AN_OBJECT_MESSAGE = 'The request body must be a JSON object';
const AUTHENTICATION_REQUIRED_MESSAGE = 'Authentication is required';
const NOT_AUTHORIZED_MESSAGE = 'Not authorized';

/*
 * No neutral text for an authored domain message is declared here, and that absence is deliberate.
 */

/* The neutral text that stands in for a boundary-stubbed member's own message. */
const NOT_IMPLEMENTED_MESSAGE = 'This operation is not implemented';

/* The JSON literal used when a value has no JSON representation. */
const JSON_NULL = 'null';

/**
 * Serializes a body for a JSON response, closing the gap between JSON.stringify's declared return
 * type and its actual behavior.
 */
function serializeJson(body: unknown): string {
  const serialized: string | undefined = JSON.stringify(body);

  return serialized ?? JSON_NULL;
}

/**
 * Builds a JSON response at an explicit status code.
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
 * @param body the value to serialize as the response body
 * @returns a proxy result carrying the serialized value
 *
 * @example
 * ```ts
 * const product = await productService.getProduct(productID);
 * Return product === null ? notFoundResponse : okResponse(product);
 * ```
 */
export function okResponse(body: unknown): APIGatewayProxyResult {
  return jsonResponse(HTTP_STATUS.OK, body);
}

/**
 * Builds a response whose body is a single message and nothing else.
 */
export function messageResponse(statusCode: number, message: string): APIGatewayProxyResult {
  const body: ErrorResponseBody = { message };

  return jsonResponse(statusCode, body);
}

/**
 * Builds the response for an unmatched route, or for an addressed record that does not exist.
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
 */
export function unauthorizedResponse(): APIGatewayProxyResult {
  // `PUBLIC_ERROR_CODE` carries no authentication-specific member and none is invented here, so an
  // authorisation refusal reports the rejection family. The status, not the code, names the reason.
  return messageResponse(HTTP_STATUS.UNAUTHORIZED, AUTHENTICATION_REQUIRED_MESSAGE);
}

/**
 * Builds the response for a known principal that is not authorised for the operation.
 */
export function forbiddenResponse(): APIGatewayProxyResult {
  // Same classification as the unauthenticated case, for the same reason: the code names the
  // rejection family and the status names which refusal it is.
  return messageResponse(HTTP_STATUS.FORBIDDEN, NOT_AUTHORIZED_MESSAGE);
}

/**
 * Builds the response for the product feed: an XML document returned unwrapped.
 */
export function xmlResponse(xml: string): APIGatewayProxyResult {
  return {
    statusCode: HTTP_STATUS.OK,
    headers: { 'Content-Type': XML_CONTENT_TYPE },
    body: xml,
  };
}

/* How a legacy message is recognised — by type, not by text. */

/* The fixed phrases that label a suppressed failure in the execution log. */
const BOUNDARY_STUB_LOG_PHRASE =
  'Boundary-stubbed member invoked; detail withheld from the response';
const UNDISCLOSED_DOMAIN_FAILURE_LOG_PHRASE =
  'Domain failure with a non-parity message; detail withheld from the response';
const UNRECOGNISED_FAILURE_LOG_PHRASE =
  'Unrecognised failure escaped a handler; detail withheld from the response';

/* The diagnostic record — an allowlist, not a dump. */

/** The upper bound on the length of any single string this module writes to the log. */
const DIAGNOSTIC_TEXT_LIMIT = 200;

/**
 * Replaces a character a log line must not carry. Chosen because it is inert in every log viewer.
 */
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

/** The complete set of facts this module is permitted to write about a suppressed failure. */
interface SuppressedFailureDiagnostic {
  /** One of the three fixed phrases. Author-written, never derived from a request or an error. */
  readonly situation: string;

  /**
   * The caught value's constructor name — `DataIntegrityError`, `TypeError`, `Error` — or
   * {@link UNKNOWN_FAILURE_CLASS}. A class name is declared by this port or by a library, never by a
   * caller, which is what makes it safe to record where the message is not.
   */
  readonly failureClass: string;

  /** The public classification the failure declares about itself, when it declares one. */
  readonly code?: PublicErrorCode;

  /** A fresh identifier for this one logged failure. */
  readonly correlationID: string;
}

/**
 * Neutralizes a string for a log line: no control characters, and no unbounded length.
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
 */
function readPublicErrorCode(error: unknown): PublicErrorCode | undefined {
  return error instanceof DomainError ? error.getPublicError().code : undefined;
}

/**
 * Builds the allowlisted diagnostic for a suppressed failure.
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
 */
function logSuppressedFailure(situation: string, error: unknown): void {
  console.error(JSON.stringify(describeSuppressedFailure(situation, error)));
}

/* The single error-to-response mapping. */

/**
 * Maps a public-safe failure code to the status that reports it.
 */
/** The single status at which a disclosed legacy message is returned. */
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

    /*
     * The one `5xx` that is not a fault. It shares the series with the four above because a rolled-back
     * transaction is the service failing to complete the work, not the request being wrong — but it is
     * `503` rather than `500` because the condition is temporary and re-sending is the correct response.
     * An operator watching the 5xx rate therefore sees deadlocks as their own status rather than mixed
     * into either the generic-fault count or, as before, the request-rejection count.
     */
    case PUBLIC_ERROR_CODE.TRANSIENT_WRITE_CONFLICT:
      return HTTP_STATUS.SERVICE_UNAVAILABLE;
  }
}

/**
 * Maps any thrown value to a response.
 *
 * @param error the caught value, whatever it is
 * @returns a proxy result describing the failure at the appropriate status
 *
 * @example
 * ```ts
 * try {
 * return okResponse(await skuService.createSkus(product, data));
 * } catch (error) {
 * return errorResponse(error);
 * ```
 */
export function errorResponse(error: unknown): APIGatewayProxyResult {
  // branch 1 — must precede the DomainError test; see the note on branch ordering above. The
  // presentation is read polymorphically exactly as on branch 2; the only reason this branch exists
  // separately is the parity-bearing `errors` member, which no other failure carries.
  if (error instanceof ValidationError) {
    const presentation: PublicErrorPresentation = error.getPublicError();

    // GetErrors hands back the keyed structure unchanged. No transformation, no flattening, no
    // re-keying, no de-duplication and no sorting: the keys, their order and their exact strings
    // are the contract.
    const body: ErrorResponseBody = {
      message: presentation.message,
      errors: error.getErrors(),
    };

    return jsonResponse(statusForPublicErrorCode(presentation.code), body);
  }

  // Branch 2 — also a DomainError subclass, so it too must precede the base test. Neither
  // error.member nor error.message is read: the status alone reports the boundary, and the
  // identifier stays server-side. See branch 2 above and {@link ErrorResponseBody}.
  if (error instanceof NotImplementedError) {
    logSuppressedFailure(BOUNDARY_STUB_LOG_PHRASE, error);

    /*
     * The status is derived from the presentation this error declares about itself, exactly as on
     * branches 1 and 4, rather than chosen here. Neither `error.member` nor `error.message` is read;
     * `NOT_IMPLEMENTED_MESSAGE` is this module's own neutral text.
     */
    return messageResponse(
      statusForPublicErrorCode(error.getPublicError().code),
      NOT_IMPLEMENTED_MESSAGE,
    );
  }

  // Branch 3 — the verbatim pass-through, and the only branch that publishes a thrown message. The
  // message is copied, never processed. Also a DomainError subclass, so it too precedes the base
  // test; its type is the throw site's declaration that this text is legacy behavior.
  if (error instanceof LegacyParityError) {
    /*
     * The message is copied, never processed — not trimmed, lower-cased, normalised, unescaped,
     * sliced or rewritten — so it reaches the body byte-identical to the value that was thrown. That
     * is what preserves the two legacy misspellings in the fourth mandated string, which any
     * normalising step would destroy. The type is the throw site's declaration that this text is
     * legacy behaviour; see the section note above for why a type and not a text comparison, and for
     * the uniform status this branch deliberately applies to all four.
     */
    return messageResponse(PUBLIC_PARITY_MESSAGE_STATUS, error.message);
  }

  // Branch 4 — a domain failure this port authored. Recognised by type and answered at the status its
  // own classification maps to; `error.message` is not read, because it is a diagnostic for an
  // engineer rather than for a caller. See branch 4 above for why the status may not be a constant.
  if (error instanceof DomainError) {
    logSuppressedFailure(UNDISCLOSED_DOMAIN_FAILURE_LOG_PHRASE, error);

    /*
     * Read polymorphically, exactly as on branch 1: `ConfigurationError` and `DataIntegrityError`
     * override this member to declare their own family, and the base class answers with the neutral
     * service-fault presentation. Both members of the presentation are the class's, never the throw
     * site's.
     */
    const presentation: PublicErrorPresentation = error.getPublicError();

    return messageResponse(statusForPublicErrorCode(presentation.code), presentation.message);
  }

  /*
   * Branch 5 — not raised by this port. The caught value is not inspected beyond the two allowlisted
   * readers {@link describeSuppressedFailure} uses, and it is not swallowed either: a record is written
   * naming the situation, the failure's class name, a fresh correlation ID and — when the value carries
   * one — its public error code.
   */
  logSuppressedFailure(UNRECOGNISED_FAILURE_LOG_PHRASE, error);

  /*
   * `SERVICE_FAULT` is reserved for exactly this case — a value this port did not raise and cannot
   * classify — so the deny-by-default code and the deny-by-default status are the same single row of
   * the one map.
   */
  return messageResponse(
    statusForPublicErrorCode(PUBLIC_ERROR_CODE.SERVICE_FAULT),
    UNEXPECTED_FAILURE_MESSAGE,
  );
}

/* Reading request input. */

/**
 * Narrows an unknown value to a plain JSON object.
 *
 * @param value any value, typically the result of parsing untrusted input
 * @returns true when the value is a non-null object that is not an array
 *
 * @example
 * ```ts
 * const nested: unknown = data['productType'];
 * if (isJsonObject(nested)) {
 * const id: unknown = nested['productTypeID'];
 * ```
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why a request body could not be read as a JSON object. */
export type RequestBodyProblem = 'absent' | 'malformed' | 'notAnObject';

/** The outcome of reading a request body, discriminated on whether a usable object was obtained. */
export type RequestBodyResult =
  | { readonly present: true; readonly value: Record<string, unknown> }
  | { readonly present: false; readonly problem: RequestBodyProblem };

/**
 * Reads the request body as a JSON object.
 *
 * @param event the proxy event, or any object carrying its body member. The member may be absent as
 * well as `null`; see hazard 1 and the section header.
 *
 * @returns the parsed object, or the reason it could not be obtained
 *
 * @example
 * ```ts
 * const body = readJsonObjectBody(event);
 * if (!body.present) {
 * return invalidRequestBodyResponse(body.problem);
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
 */
export function invalidRequestBodyResponse(problem: RequestBodyProblem): APIGatewayProxyResult {
  /*
   * All three conditions are `REQUEST_INVALID`, whose single documented status is the 400 all three
   * return, so the status is derived from that one code rather than restated three times.
   */
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

/* Explicit bounded reads. */

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
 */
export type BoundedReadWindowResult =
  | { readonly present: true; readonly window: BoundedReadWindow }
  | { readonly present: false; readonly response: APIGatewayProxyResult };

/** Parses one query-string value as a bounded-read window bound. */
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
 * @param event the proxy event, or any object carrying its query-string-parameters member. The member
 * may be absent as well as `null`, in which case neither bound was stated and the window is refused
 * with `limit` named — the same answer an unparseable bound gets, because in both cases the caller
 * did not state a usable window.
 *
 * @returns the window, or the refusal naming which bound was unusable. `limit` is reported first when
 * both are, so a caller fixes the required bound before the position.
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
 * @param event the proxy event, or any object carrying its path-parameters member. The member may be
 * absent as well as `null`, because the event source rather than the annotation decides that.
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
 * @param event the proxy event, or any object carrying its query-string-parameters member. The member
 * may be absent as well as `null`; see the section header for why.
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
 * @param event the proxy event, or any object carrying its headers member. The member may be absent;
 * See the section header for why the declared type is no guarantee of that.
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

/* The smart list data vocabulary — `org/Hibachi/HibachiSmartList.cfc:L85-L136` */

/** The string-named subset of `SmartListInput`'s key space. */
type SmartListInputMember = Extract<keyof SmartListInput, string>;

/*
 * Only the members a query string can actually carry — the filter is on the value type, not just on
 * the key type. `SmartListInput` declares one member that is not string-valued, `joins`, whose type is
 * `readonly SmartListJoin[]`; a query string cannot express it and the legacy never read it from `rc`,
 * which is why it is absent from {@link SMART_LIST_NAMED_KEYS} and from every prefix. Narrowing with a
 * bare `Extract<keyof …, string>` would still admit it as a key, and assigning a `string` through a
 * union that includes it forces the intersection `string & readonly SmartListJoin[]` — a type nothing
 * satisfies. Selecting only the keys whose declared value type accepts a `string` keeps the runtime
 * vocabulary and the compile-time key space in exact agreement, so a member added to the port later is
 * admitted here only if a query string can actually carry it.
 */
type SmartListInputKey = {
  [K in SmartListInputMember]-?: string extends SmartListInput[K] ? K : never;
}[SmartListInputMember];

/** The smart list data keys recognised by exact name. */
const SMART_LIST_NAMED_KEYS = Object.freeze([
  'savedStateID',
  'keyword',
  'keywords',
  'OrderBy',
  'P:Show',
  'P:Start',
  'P:Current',
] as const satisfies readonly SmartListInputKey[]);

/** The smart list data keys recognised by prefix. */
const SMART_LIST_KEY_PREFIXES = Object.freeze([
  'F:',
  'FR:',
  'FI:',
  'FIR:',
  'FK:',
  'FKR:',
  'R:',
] as const);

/** A writable view of `SmartListInput`, used only while one is being assembled. */
type MutableSmartListInput = { -readonly [K in keyof SmartListInput]: SmartListInput[K] };

/**
 * Resolves a query-parameter name to the canonical key the downstream translator recognises.
 *
 * CFML struct keys and the `==` comparisons at `org/Hibachi/HibachiSmartList.cfc:L85-L136` are
 * case-insensitive. The AWS event is not, and the TypeScript translator deliberately compares the
 * canonical vocabulary exactly, so this edge performs the same case-insensitive recognition and then
 * restores only the key/prefix casing. The property path after a prefix remains byte-identical.
 */
function canonicalSmartListInputKey(name: string): SmartListInputKey | undefined {
  const foldedName = name.toLowerCase();
  const namedKey = SMART_LIST_NAMED_KEYS.find(
    (candidate) => candidate.toLowerCase() === foldedName,
  );

  if (namedKey !== undefined) {
    return namedKey;
  }

  for (const prefix of SMART_LIST_KEY_PREFIXES) {
    if (foldedName.startsWith(prefix.toLowerCase())) {
      /*
       * The matched prefix is one of the seven template-literal key families in `SmartListInput`.
       * Replacing only those leading bytes therefore constructs a member of SmartListInputKey; the
       * suffix is intentionally not normalised because property identifiers remain case-sensitive.
       */
      return `${prefix}${name.slice(prefix.length)}` as SmartListInputKey;
    }
  }

  return undefined;
}

/**
 * Assembles a smart list `data` struct from the query string.
 *
 * @param event the proxy event, or any object carrying its query-string-parameters member. The member
 * may be absent as well as `null`; see the section header for why.
 */
export function readSmartListInput(
  event: Partial<Pick<APIGatewayProxyEvent, 'queryStringParameters'>>,
): SmartListInput {
  const input: MutableSmartListInput = {};
  const parameters = event.queryStringParameters;

  /*
   * An absent container and a `null` one both mean "no query string was supplied", which is the legal
   * and meaningful `data={}` case described above — not a failure, and emphatically not a throw. Both
   * are narrowed here because the enumeration below would otherwise reject the first of them; the
   * section header records why an absent container reaches this function at all.
   */
  if (parameters === null || parameters === undefined) {
    return input;
  }

  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined) {
      continue;
    }

    const canonicalName = canonicalSmartListInputKey(name);
    if (canonicalName !== undefined) {
      input[canonicalName] = value;
    }
  }

  return input;
}

/* §7 — The action edge: how an invocation is turned into one call on one handler member. */

/** The query-string key that names the action, carried over verbatim from the legacy convention. */
export const SLAT_ACTION_PARAMETER = 'slatAction';

/** One action: an invocation in, a response out. */
export type ActionRoute = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/** A set of actions, keyed by the name a caller supplies in {@link SLAT_ACTION_PARAMETER}. */
export type ActionRouteTable<TRouteKey extends string> = Readonly<Record<TRouteKey, ActionRoute>>;

/**
 * What a dispatcher needs from the composition root, expressed as the two things it actually uses.
 */
export interface ActionDispatchContext<TRouteKey extends string> {
  /** The routes this entry point serves. */
  readonly routes: ActionRouteTable<TRouteKey>;

  /** Called once at the start of every invocation, before the action is read. */
  readonly beginInvocation: () => void;
}

/**
 * Builds the case-insensitive lookup for one route table: lower-cased name in, canonical key out.
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
 * @param context the routes this entry point serves and its per-invocation hook
 * @returns a function of the proxy event, ready to be exported as a `handler`
 */
export function createActionDispatcher<TRouteKey extends string>(
  context: ActionDispatchContext<TRouteKey>,
): ActionRoute {
  /*
   * Built once, from the declared table, and never rebuilt per invocation: it is derived from a frozen
   * declaration and holds no request state, so it is exactly the kind of immutable module-lifetime value
   * mismatch M7 permits — the rule M7 sets is that nothing memoized per request may outlive the request,
   * and this memoizes nothing about a request at all.
   */
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

/* §8 — The acting principal at the edge: fail-closed, with no authentication introduced. */

/** The constant unauthenticated, deny-all context. */
const FAIL_CLOSED_AUTHORIZATION: RequestAuthorizationContext = Object.freeze({
  accountContext: Object.freeze({ getCurrentAccount: () => undefined }),
  entityAuthorization: Object.freeze({ authenticateEntity: () => false }),
  /*
   * The third member answers two questions, and both are the
   * fail-closed ones `../ports/AccountContextPort.ts` states for the port: `false` for the
   * public-populate flag, because [org/Hibachi/HibachiScope.cfc:L22] initialises it false and only a
   * public or frontend route sets it true, and `false` for the property verdict, because
   * [org/Hibachi/HibachiTransient.cfc:L186] defaults to denial. Deny-all population is what makes
   * "no principal" mean "writes no persistent property" rather than "writes with whatever rights the
   * composition root happened to memoise".
   */
  populationAuthorization: Object.freeze({
    getPublicPopulateFlag: () => false,
    authenticateEntityProperty: () => false,
  }),
});

/**
 * The resolver every routed catalog member falls back to.
 *
 * @returns the constant unauthenticated, deny-all context.
 */
export const resolveFailClosedAuthorization = (): RequestAuthorizationContext =>
  FAIL_CLOSED_AUTHORIZATION;

/** The request every surface's authorisation resolver receives. */
export type CatalogAuthorizationRequest = InvocationSecurityRequest;

/** The resolver shape a deployment registers — see {@link registerRequestAuthorizationResolver}. */
export type CatalogAuthorizationResolver =
  RequestAuthorizationResolver<CatalogAuthorizationRequest>;

/** The event slice every surface reads in order to build a {@link CatalogAuthorizationRequest}. */
export type CatalogAuthorizationEvent = Pick<APIGatewayProxyEvent, 'headers'> &
  Partial<Pick<APIGatewayProxyEvent, 'httpMethod' | 'requestContext'>>;

/** The question one routed member asks, as its own access matrix declares it. */
export interface InvocationSecurityQuestion {
  /** The routed action, as the routing layer addresses it — `product.saveProduct`. */
  readonly action: string;

  /** The single operation this route attempts. See `EntityCrudType`. */
  readonly crudType: EntityCrudType;

  /** The entity the route targets, from the handler's own constant. */
  readonly entityName: string;

  /** The addressed resource, when the request addresses one. Absent means a creation. */
  readonly entityID?: string;
}

/**
 * Assembles the invocation's security request from its event and its route's own question.
 */
export function toInvocationSecurityRequest(
  event: CatalogAuthorizationEvent,
  question: InvocationSecurityQuestion,
): CatalogAuthorizationRequest {
  const authorizer: unknown = event.requestContext?.authorizer;
  const method: unknown = event.httpMethod;

  return Object.freeze({
    action: question.action,
    crudType: question.crudType,
    entityName: question.entityName,
    ...(question.entityID === undefined ? {} : { entityID: question.entityID }),
    ...(typeof method === 'string' ? { httpMethod: method } : {}),
    ...(typeof authorizer === 'object' && authorizer !== null
      ? { authorizerClaims: authorizer as Readonly<Record<string, unknown>> }
      : {}),
    headers: event.headers ?? {},
  });
}

/*
 * §8.1 — the deployment seam, and why the shipped entry points needed one
 * the defect this closes, stated plainly. Every `create…HandlerFromContainer` factory used to pass
 * {@link resolveFailClosedAuthorization}. this section is what makes the seam reachable from a packaged
 * artifact: a deployment registers its own resolver here, so the shipped exports can answer something
 * other than `401` without the caller rebuilding the graph.
 */

/** The one module-scope wiring cell this module declares. Holds a resolver, never a context. */
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
 * @param resolver the deployment's resolver; it must answer for the invocation it is handed and must
 * not be a memoized context. Returning {@link resolveFailClosedAuthorization}'s deny-all context for
 * a request it cannot place is the correct fail-closed answer.
 *
 * @throws {DomainError} when a resolver is already registered — see §8.1.
 */
export function registerRequestAuthorizationResolver(resolver: CatalogAuthorizationResolver): void {
  if (deploymentAuthorization.resolve !== undefined) {
    throw new DomainError(AUTHORIZATION_RESOLVER_ALREADY_REGISTERED);
  }

  deploymentAuthorization.resolve = resolver;
}

/**
 * Discards the registered resolver. Test-only: reachable from this module, and from no shipped entry point.
 */
export function clearRequestAuthorizationResolver(): void {
  deploymentAuthorization.resolve = undefined;
}

/**
 * The resolver every shipped entry point gates on, evaluated once per invocation.
 */
export function resolveRequestAuthorization(
  request: CatalogAuthorizationRequest,
): RequestAuthorizationContext {
  const resolve = deploymentAuthorization.resolve;

  return resolve === undefined ? FAIL_CLOSED_AUTHORIZATION : resolve(request);
}
