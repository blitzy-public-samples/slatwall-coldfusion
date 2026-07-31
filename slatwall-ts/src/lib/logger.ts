// ---------------------------------------------------------------------------
// slatwall-ts - structured logging
//
// PURPOSE
//   One JSON object per line, written to stdout. That is the entire transport:
//   the AWS Lambda `nodejs20.x` runtime captures stdout natively, so there is
//   nothing here to connect, append to or flush.
//
// WHY THERE IS NO LOGGING LIBRARY
//   A deliberate rejection recorded in the plan, quoted verbatim:
//
//     "No logging library: the logger writes structured JSON to stdout, which
//      Lambda captures natively."
//
//   The dependency set is closed at fourteen exactly-pinned packages, and this
//   module imports none of them. It has zero imports of any kind - no
//   third-party module, no Node built-in, and no sibling module. `src/lib/` is
//   the base of the domain-inward dependency flow that the ESLint
//   `no-restricted-imports` boundary enforces, so it reaches into no other
//   folder.
//
// LEGACY PROVENANCE
//   The CFML application had no logger module. It called the engine built-in
//   `writeLog()` directly, with unstructured plain text, into a CF log file
//   named "Slatwall". Every call site, all four of them:
//
//     Application.cfc:L93   "General Log - Default Data Has Been Confirmed"
//     Application.cfc:L97   "General Log - Setting Cache has been cleared"
//     Application.cfc:L101  "General Log - Update Service Scripts Have been Run"
//     Application.cfc:L107  "General Log - Integrations have been updated"
//
//   Those four lines carry no severity, no timestamp field and no structured
//   payload, so this module replaces a framework facility rather than porting a
//   component. The legacy `file="Slatwall"` log-NAME concept is dropped
//   outright: under Lambda there is no log file, only one stdout stream per
//   invocation, so no `logFile` or `logName` option is offered here. Naming is
//   idiomatic TypeScript for the same reason - nothing in this module is called
//   `writeLog`, because a line-for-line transliteration of a CFML idiom would
//   violate the minimal-change directive rather than satisfy it: that directive
//   scopes the functional surface, never the code style.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, and the plan states it
//   outright. No rule is invented to fill the gap, and the absence is not
//   treated as license to lower the bar - the enterprise substitute standard
//   applies at full strength: maximal strictness, no `any` and no suppression
//   comment, one exported unit per file, no barrel, environment-driven
//   configuration with no credential of any kind, and every judgment call
//   annotated at the point where it was made.
//
// TEST COVERAGE IS NET-NEW
//   No legacy test touches logging - `writeLog()` was an engine built-in, and
//   the only legacy suites extended anywhere in this port are
//   meta/tests/unit/entity/BrandTest.cfc and
//   meta/tests/unit/entity/ProductTest.cfc. Coverage for this module is
//   therefore net-new, and must never be presented as parity. The test tier is
//   authored separately; the seams it needs are `withSink()` and `withLevel()`
//   on the exported logger, both of which make every branch drivable without
//   monkey-patching a global or mutating the process environment.
// ---------------------------------------------------------------------------

/**
 * Severity of a single entry.
 *
 * The set is closed at four values, matching the accepted values documented for
 * `LOG_LEVEL` in `.env.example`, which records that this level is the only
 * logging control that exists.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured payload accompanying an entry.
 *
 * Values are `unknown` rather than a loose `any`: the serializer narrows each
 * one explicitly, and a value JSON cannot represent is described rather than
 * silently dropped.
 */
export type LogContext = Readonly<Record<string, unknown>>;

/**
 * Destination for one already-serialized entry.
 *
 * The line arrives WITHOUT a trailing newline - terminating it belongs to the
 * sink. That split is what lets a test collect entries as clean, parseable
 * strings while the default sink still emits exactly one newline-terminated
 * line per entry.
 */
export type LogSink = (line: string) => void;

/**
 * The emitting surface.
 *
 * Level method names are idiomatic TypeScript because helpers inside `src/lib/`
 * are internal; the verbatim legacy CFML method names are the acceptance
 * contract for the service and entity layers, not for this one.
 */
export interface Logger {
  /** Diagnostic detail. Suppressed unless the resolved threshold is `debug`. */
  debug(message: string, context?: LogContext): void;
  /** Ordinary operational milestone - the closest analogue of the legacy calls. */
  info(message: string, context?: LogContext): void;
  /** A recoverable irregularity. Emitted on stdout like every other level. */
  warn(message: string, context?: LogContext): void;
  /** A failure. Emitted on stdout like every other level. */
  error(message: string, context?: LogContext): void;
  /**
   * A sibling logger with the threshold pinned, bypassing `LOG_LEVEL` entirely.
   * Exists so every filtering branch is deterministically drivable.
   */
  withLevel(level: LogLevel): Logger;
  /**
   * A sibling logger writing to `sink` instead of stdout. Exists so emission is
   * interceptable without patching a global stream.
   */
  withSink(sink: LogSink): Logger;
}

/**
 * The single environment variable this module reads. It reads no other, and in
 * particular it reads nothing about a datasource.
 */
const LOG_LEVEL_ENV_VAR = 'LOG_LEVEL';

/** Threshold applied when `LOG_LEVEL` is unset or unrecognized. */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * Ordered severity, so filtering is a single comparison rather than a chain of
 * conditionals. The keys are the closed union, so an index into this map never
 * widens to `undefined` under `noUncheckedIndexedAccess`.
 */
const LEVEL_SEVERITY: Readonly<Record<LogLevel, number>> = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});

/** Substituted for the value held under any forbidden key. */
const REDACTED = '[REDACTED]';

// ---------------------------------------------------------------------------
// The never-log policy
//
// Enforced in code, not merely documented: the value held under any key below
// is replaced with `REDACTED` before serialization, and there is deliberately
// NO option to switch that off.
//
// Every entry is written in NORMALIZED form - lowercase, letters and digits
// only - because that is the form `normalizeKey` produces and therefore the
// only form that can ever match.
//
// Matching is EXACT on the normalized key, never a substring, and that
// distinction is load-bearing. `order` names a whole aggregate and is
// redacted; `orderID` names an opaque identifier and stays legible. That is
// already the convention the ported services follow, since the promotion and
// price-group engines address the out-of-scope order aggregate through opaque
// `orderID` / `orderItemID` / `orderFulfillmentID` values and never through the
// aggregate itself. Substring matching would redact those identifiers too and
// make the engines untraceable.
//
// Matching is also insensitive to case and to `_`, `-` and whitespace, because
// CFML struct keys are case-insensitive and the ported code base carries that
// habit forward. `apiKey`, `API-KEY` and `api_key` must not be three different
// keys, or the list would be defeated by nothing more than a shift key.
// ---------------------------------------------------------------------------

/** Anything that authenticates or authorizes a caller. */
const CREDENTIAL_KEYS: readonly string[] = [
  'password',
  'passwd',
  'pass',
  'pwd',
  'passphrase',
  'currentpassword',
  'newpassword',
  'oldpassword',
  'secret',
  'clientsecret',
  'apisecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'sessiontoken',
  'csrftoken',
  'authtoken',
  'apikey',
  'xapikey',
  'apitoken',
  'privatekey',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'cookie',
  'setcookie',
  'sessionid',
];

/**
 * Anything describing how to reach the database.
 *
 * The first four names mirror the values the legacy application published at
 * Application.cfc:L78-L87 - the datasource name, its connecting account and
 * that account's credential. Their NAMES are listed here so their VALUES can
 * never be emitted; no value of any of them appears anywhere in this file.
 */
const CONNECTION_KEYS: readonly string[] = [
  'datasource',
  'datasourcename',
  'datasourceusername',
  'datasourcepassword',
  'connectionstring',
  'connectionuri',
  'connectionurl',
  'dsn',
  'dburl',
  'databaseurl',
  'dbhost',
  'databasehost',
  'host',
  'hostname',
  'dbuser',
  'dbusername',
  'databaseuser',
  'dbpassword',
  'databasepassword',
];

/** Payment instrument data, which must never reach a log stream. */
const PAYMENT_CARD_KEYS: readonly string[] = [
  'creditcard',
  'creditcardnumber',
  'cardnumber',
  'cardsecuritycode',
  'securitycode',
  'cvv',
  'cvv2',
  'cvc',
];

/** Personally identifiable fields carried by account and customer records. */
const PERSONAL_DATA_KEYS: readonly string[] = [
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'ssn',
  'socialsecuritynumber',
  'taxid',
  'dateofbirth',
  'dob',
  'bankaccount',
  'bankroutingnumber',
  'iban',
];

/**
 * Whole aggregates. A full order, customer or account payload is never
 * emitted, so the aggregate-shaped key itself is redacted while the opaque
 * identifier beside it - `orderID`, `accountID` - survives exact matching and
 * remains legible.
 */
const AGGREGATE_PAYLOAD_KEYS: readonly string[] = [
  'order',
  'orders',
  'orderpayload',
  'orderitem',
  'orderitems',
  'orderfulfillment',
  'orderfulfillments',
  'account',
  'accountpayload',
  'customer',
  'customerpayload',
];

/** The five groups above, flattened once, for constant-time membership tests. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  ...CREDENTIAL_KEYS,
  ...CONNECTION_KEYS,
  ...PAYMENT_CARD_KEYS,
  ...PERSONAL_DATA_KEYS,
  ...AGGREGATE_PAYLOAD_KEYS,
]);

/**
 * Depth beyond which a nested structure is described rather than traversed.
 *
 * A bound on how far this module walks a caller's object graph, so that a
 * deeply nested or self-referential structure cannot drive unbounded
 * recursion. It bounds the work; it is not a tuning knob and encodes no target
 * of any kind.
 */
const MAX_REDACTION_DEPTH = 4;

/**
 * Lowercase, then drop everything that is not a letter or a digit, so that
 * `apiKey`, `API-KEY`, `api_key` and `Api Key` all collapse onto the single
 * entry `apikey`.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Membership test against the never-log policy. */
function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(normalizeKey(key));
}

/**
 * True only for an object literal or a null-prototype object.
 *
 * A class instance, `Map`, `Set`, `RegExp` or buffer is NOT plain and is
 * deliberately not traversed. This module cannot know whether such an object's
 * internals hold a credential or a whole aggregate, and walking an entity graph
 * would defeat the never-log policy from the inside. Describing the object
 * instead keeps the policy intact and the work bounded.
 */
function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/** A non-traversable object rendered as a bracketed constructor name. */
function describeOpaqueObject(value: object): string {
  const { constructor } = value as { readonly constructor?: { readonly name?: unknown } };
  const name = constructor?.name;
  return typeof name === 'string' && name.length > 0 ? `[${name}]` : '[Object]';
}

/**
 * `JSON.stringify(new Error('x'))` yields `{}`, because an Error's own fields
 * are not enumerable. Converting explicitly is the only way an error survives
 * into the emitted line at all.
 *
 * The shape is exactly the three fields the plan names. Copying nothing else
 * also drops driver-attached fields - a database driver can hang the failing
 * statement off its error object, and that never reaches a log line from here.
 */
function normalizeError(error: Error): Record<string, unknown> {
  return { name: error.name, message: error.message, stack: error.stack };
}

/**
 * Apply the never-log policy and reshape whatever is left into something JSON
 * can represent. Runs before `JSON.stringify` so the policy reaches nested
 * structures, not just the top level of the context object.
 *
 * `ancestors` holds the containers currently being traversed - the chain from
 * the context object down to `value`, and nothing else. Tracking ancestors
 * rather than every object already seen matches `JSON.stringify` exactly: a
 * value referenced twice from different branches is a shared reference and is
 * rendered twice, while a value that contains itself is a cycle and is
 * reported. The chain is bounded by `MAX_REDACTION_DEPTH`, so the set never
 * holds more entries than that.
 */
function redactValue(value: unknown, depth: number, ancestors: ReadonlySet<object>): unknown {
  // JSON has no bigint and `JSON.stringify` throws when it meets one. The exact
  // decimal digits are preserved as a string: no rounding and no arithmetic, so
  // the rule that all money arithmetic passes through the domain's single
  // arithmetic surface is untouched by this module. A monetary value reaching a
  // log line is already a formatted string, and nothing here reformats it.
  if (typeof value === 'bigint') {
    return value.toString();
  }
  // Neither survives `JSON.stringify` - a function-valued or symbol-valued
  // property is silently omitted. Describing it keeps the key visible instead
  // of quietly losing it.
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (typeof value === 'symbol') {
    return '[Symbol]';
  }
  // Everything remaining that is not an object is a string, number, boolean or
  // undefined: representable as-is, and passed through untouched.
  if (typeof value !== 'object') {
    return value;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Error) {
    return normalizeError(value);
  }
  // UTC, explicitly: `toISOString()` always renders in UTC with the `Z`
  // designator, so a date in a context object cannot pick up an ambient
  // timezone the way the legacy engine's date handling did.
  if (value instanceof Date) {
    return value.toISOString();
  }
  // A container that contains itself. Reported rather than quietly truncated:
  // a cycle means the caller handed the logger a live object graph - an entity,
  // or the order aggregate - instead of a flat context, and a half-walked
  // rendering of such a graph would be presented as if it were the caller's
  // data while risking exactly the nested payload the policy above forbids.
  // The throw is caught by the total guard in `serializeEntry`, which emits the
  // fallback line, so this never escapes the logger.
  if (ancestors.has(value)) {
    throw new Error('circular reference in log context');
  }
  // A cycle longer than the depth bound is truncated here instead, because
  // traversal stops before the repetition becomes reachable. The emitted line
  // stays well-formed, finite and redacted either way.
  if (depth >= MAX_REDACTION_DEPTH) {
    return '[depth limit]';
  }
  const nextAncestors: ReadonlySet<object> = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item) => redactValue(item, depth + 1, nextAncestors));
  }
  if (isPlainObject(value)) {
    return redactPlainObject(value, depth, nextAncestors);
  }
  return describeOpaqueObject(value);
}

/** Rebuild a plain object, redacting forbidden keys and recursing into the rest. */
function redactPlainObject(
  source: object,
  depth: number,
  ancestors: ReadonlySet<object>,
): Record<string, unknown> {
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(source);
  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of entries) {
    redacted[key] = isForbiddenKey(key) ? REDACTED : redactValue(nested, depth + 1, ancestors);
  }
  return redacted;
}

// ---------------------------------------------------------------------------
// Threshold resolution
//
// THIS MODULE IMPORTS NOTHING, AND THAT INCLUDES ITS SIBLING `./config.ts`.
//
// `config.ts` is required to fail hard at startup when the database dialect is
// unset or unrecognized, reproducing config/configORM.cfm:L4-L7 - a conditional
// chain with no `<cfelse>` whose failure path ends in an outright abort. A
// logger that depended on configuration could not report a configuration
// failure. Keeping the two modules mutually independent is what leaves
// `config.ts` free to log its own fatal error, and what guarantees a missing or
// invalid configuration can never silence logging.
//
// The asymmetry therefore runs the other way here, deliberately: an unset or
// unrecognized `LOG_LEVEL` MUST NOT throw. It falls back to `info`, because
// logging must never be the thing that breaks a cold start.
//
// The threshold is resolved lazily, on every call, and is NOT cached at module
// scope. A module-scope cache would be captured once per container and then
// frozen for the whole life of that container, and it would make a test suite
// order-dependent on whichever suite imported this module first. `withLevel()`
// is the explicit override, so a test pins the threshold directly rather than
// mutating the process environment and hoping the cache agrees.
// ---------------------------------------------------------------------------

/**
 * Parse a raw environment value into a level, case-insensitively.
 *
 * Returns `undefined` for anything unrecognized - including the empty string -
 * so the caller applies the default. Every arm returns a literal from the
 * closed union, so no type assertion is needed to prove the narrowing.
 */
function parseLogLevel(raw: string | undefined): LogLevel | undefined {
  if (raw === undefined) {
    return undefined;
  }
  switch (raw.trim().toLowerCase()) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    default:
      return undefined;
  }
}

/**
 * The threshold in force for one emission: the pinned override if there is one,
 * otherwise `LOG_LEVEL`, otherwise the default.
 *
 * `process.env` is an index signature, so the read is `string | undefined` under
 * `noUncheckedIndexedAccess`. Both cases are handled explicitly - there is no
 * non-null assertion anywhere in this module.
 */
function resolveThreshold(pinnedLevel: LogLevel | undefined): LogLevel {
  if (pinnedLevel !== undefined) {
    return pinnedLevel;
  }
  return parseLogLevel(process.env[LOG_LEVEL_ENV_VAR]) ?? DEFAULT_LOG_LEVEL;
}

/**
 * One emitted record.
 *
 * `context` is optional in the exact sense that `exactOptionalPropertyTypes`
 * requires: an entry without a context OMITS the key rather than setting it to
 * `undefined`, which is why it is built by a conditional expression below and
 * never mutated into place.
 */
interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: unknown;
}

/** Describe a thrown value without risking a second throw while describing it. */
function describeSerializationFailure(thrown: unknown): string {
  if (thrown instanceof Error) {
    return `${thrown.name}: ${thrown.message}`;
  }
  return 'unknown serialization failure';
}

/**
 * Build and serialize one entry, and never throw while doing it.
 *
 * A logger that throws while reporting a failure is worse than no logger, so
 * this guard is deliberately TOTAL, and that is why redaction happens inside
 * the `try` rather than before it. Three failures land here:
 *
 *   * a circular reference, reported by the traversal above;
 *   * an accessor on the caller's context that throws when it is read, which
 *     `Object.entries` would otherwise let escape into the caller;
 *   * anything `JSON.stringify` itself refuses.
 *
 * In every case the entry is replaced by a minimal, well-formed line that keeps
 * the timestamp, level and message and names the failure, so the emission is
 * never silently lost and the reason is on the record.
 *
 * The fallback needs no guard of its own. Every one of its four fields is a
 * string already in hand, so the second call cannot fail in turn - which is
 * precisely what makes the guarantee absolute rather than merely likely.
 */
function serializeEntry(
  timestamp: string,
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
): string {
  try {
    const entry: LogEntry =
      context === undefined
        ? { timestamp, level, message }
        : { timestamp, level, message, context: redactValue(context, 0, new Set<object>()) };
    return JSON.stringify(entry);
  } catch (thrown) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      contextSerializationFailure: describeSerializationFailure(thrown),
    });
  }
}

/**
 * The default sink: one entry, one newline-terminated line, straight to stdout,
 * which the Lambda runtime captures natively.
 *
 * Writing to the stream directly rather than through `console` keeps the
 * emitted line byte-for-byte the JSON document, with no runtime-added
 * decoration wrapped around it.
 *
 * Emission is synchronous and per call, and nothing is buffered across
 * invocations. A warm container freezes between invocations, so anything left
 * sitting in a buffer would simply be lost. That is an argument about not
 * losing data, and nothing beyond that is claimed by it.
 *
 * Every level shares this one stream, `warn` and `error` included. Splitting
 * `error` onto stderr would interleave two streams that a downstream consumer
 * then has to reassemble, which complicates structured parsing for no gain.
 */
function writeLineToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Build a logger over a pinned threshold and a sink.
 *
 * Module-private on purpose. The exported unit is a ready-to-use logger, and
 * the two `with*` methods return siblings through this same function, so there
 * is exactly one construction path and no second exported entry point.
 */
function createLogger(pinnedLevel: LogLevel | undefined, sink: LogSink): Logger {
  const emit = (level: LogLevel, message: string, context: LogContext | undefined): void => {
    // Filtering is one comparison against the ordered severity map.
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[resolveThreshold(pinnedLevel)]) {
      return;
    }

    // `toISOString()` is UTC by definition and always carries the `Z`
    // designator. That is how the explicit UTC policy is met with no timezone
    // handling at all: the legacy engine's date handling followed whatever
    // timezone the server was set to, and none of that is carried forward.
    const timestamp = new Date().toISOString();

    sink(serializeEntry(timestamp, level, message, context));
  };

  // Frozen so the emitting surface cannot be reshaped at run time.
  return Object.freeze({
    debug: (message: string, context?: LogContext): void => {
      emit('debug', message, context);
    },
    info: (message: string, context?: LogContext): void => {
      emit('info', message, context);
    },
    warn: (message: string, context?: LogContext): void => {
      emit('warn', message, context);
    },
    error: (message: string, context?: LogContext): void => {
      emit('error', message, context);
    },
    withLevel: (level: LogLevel): Logger => createLogger(level, sink),
    withSink: (nextSink: LogSink): Logger => createLogger(pinnedLevel, nextSink),
  });
}

/**
 * The single exported unit of this module: a ready-to-use logger whose
 * threshold comes from `LOG_LEVEL` on every call and whose lines go to stdout.
 *
 * Import it narrowly and by name - `import { logger } from '../lib/logger.js'`.
 * There is no default export and no barrel file anywhere in this subtree, which
 * is what keeps each regenerated file's diff small.
 */
export const logger: Logger = createLogger(undefined, writeLineToStdout);
