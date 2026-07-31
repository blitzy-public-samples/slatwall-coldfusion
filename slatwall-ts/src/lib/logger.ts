// ---------------------------------------------------------------------------
// slatwall-ts - structured logging
//
// PURPOSE
//   One JSON object per line, written to stdout. That is the entire transport:
//   the AWS Lambda `nodejs20.x` runtime captures stdout natively, so there is
//   nothing here to connect, append to or flush.
//
// TWO GUARANTEES THIS MODULE MAKES ABOUT ITSELF
//   1. EMISSION NEVER THROWS, AND NEITHER DOES THE STREAM BEHIND IT. Every path
//      from `debug`/`info`/`warn`/`error` through to the write is total.
//      Serialization is guarded, and so is the sink invocation itself: a
//      caller-supplied sink that throws, or a `process.stdout.write` that fails
//      SYNCHRONOUSLY, is absorbed and reported through a fallback that writes to
//      the stream DIRECTLY and can neither re-enter the failing sink nor throw.
//      This is not a nicety. Call sites log and then return - the error mapper
//      logs and returns a mapped API response - and a throw escaping from a log
//      call would displace that return with an unhandled failure, converting a
//      handled error into an unhandled one.
//
//      A GUARD AROUND THE WRITE IS NOT SUFFICIENT ON ITS OWN, and an earlier
//      revision of this module claimed it was. When `process.stdout` is backed by
//      a PIPE - which is what it is under the Lambda runtime, and what it is
//      whenever a local command is piped into `head` or `grep -m1` - Node does
//      not report a broken pipe by throwing from `write()`. It reports it
//      ASYNCHRONOUSLY, as an `'error'` event on the underlying socket, long after
//      the `try` block around the dispatching call has exited. `EventEmitter`
//      rethrows an unhandled `'error'` event as an uncaught exception, so the
//      outcome was the exact opposite of this guarantee: the process died with
//      status 1 and printed a stack trace publishing the application's absolute
//      file path - the same disclosure class this module scrubs out of every line
//      it emits. A synchronous guard cannot intercept an asynchronous event, so
//      the event is answered where it is actually delivered, by
//      `absorbAsynchronousStdoutFailure` registered once at module load. The
//      write itself stays deliberately unguarded, because synchronous failures
//      SHOULD keep reaching `emitThroughSink`, which reports them.
//   2. NOTHING IS EMITTED THAT WAS NOT SANITIZED. Redaction by key NAME is
//      necessary but structurally insufficient, because the things worth
//      protecting arrive as string CONTENT: a driver error's statement text and
//      the values bound into it, a credential inside a connection URI, a bearer
//      token, an absolute deployment path in a stack frame. Both the message and
//      every string reachable in the context therefore go through content
//      sanitization, and an `Error` is never emitted as its raw
//      `name`/`message`/`stack` triple - it is reduced to a closed safe summary.
//
// WHY THERE IS NO LOGGING LIBRARY
//   A deliberate rejection recorded in the plan, quoted verbatim:
//
//     "No logging library: the logger writes structured JSON to stdout, which
//      Lambda captures natively."
//
//   The dependency set is closed at the thirteen exactly-pinned packages
//   `package.json` declares - 3 runtime and 10 development - and this module
//   imports none of them. It has zero imports of any kind - no
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
// WHAT THIS MODULE WILL NOT EMIT
//   A never-log policy enforced in code rather than described in prose, with no
//   option to switch it off. It has two halves, because one alone is not enough:
//
//     * a KEY-based half - the value under any forbidden key name is replaced
//       with a fixed marker before serialization, matched exactly on a
//       normalized key so `apiKey`, `API-KEY` and `api_key` cannot diverge;
//     * a CONTENT-based half - an error is summarized to a shape-validated class
//       name and machine code, and its `message` and `stack` are replaced with
//       that same marker. Both are free text composed at throw time, so the
//       key-based half structurally cannot inspect them, and both routinely
//       carry the very data the first half exists to withhold.
//
//   Neither half is configurable, and no diagnostic mode reinstates either.
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
 * One of the two environment variables this module reads. It reads no other, and
 * in particular it reads nothing about a datasource.
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
// Enforced in code, not merely documented: the value held under any key the
// policy matches is replaced with `REDACTED` before serialization, and there is
// deliberately NO option to switch that off.
//
// Every entry is written in NORMALIZED form - lowercase, letters and digits
// only - because that is the form `normalizeKey` produces and therefore the
// only form that can ever match.
//
// THE POLICY FAILS CLOSED, AND IT DID NOT ALWAYS.
// An earlier revision matched ONLY the exact normalized key. That decided the
// question the wrong way round: the outcome for a key nobody had thought to
// enumerate was EMISSION. Runtime testing found forty-six such spellings going
// out in cleartext - `dbPass`, `dbSecret`, `secretKey`, `signingKey`,
// `jwtSecret`, `mysqlUser`, `awsSecretAccessKey`, `passwordHash` and the rest -
// and the list was internally inconsistent in a way no reader could have
// predicted: `dbpassword` was listed but `dbpass` was not, `clientsecret` was
// listed but `secretkey` was not, `bearertoken` was listed but `bearer` was
// not. A caller who reached for a near-miss name got no warning of any kind,
// and the disclosure was invisible in review because the surrounding code is
// scrupulous about non-disclosure. So the default outcome for an unrecognized
// key is now REDACTION, reached through four rules applied in a fixed order:
//
//   1. ALLOW-LIST, and it wins. An explicitly enumerated business identifier -
//      `orderID`, `skuID`, `promotionRewardID` - stays legible no matter what
//      any later rule would say about it. This is what keeps the ported engines
//      traceable, and it is a CLOSED list, so widening it is a deliberate edit
//      rather than an accident of spelling.
//   2. EXACT match on the normalized key. The fast path, and still the primary
//      statement of intent: `order` names a whole aggregate and is redacted,
//      while `orderID` from rule 1 names an opaque identifier and is not. The
//      promotion and price-group engines address the out-of-scope order
//      aggregate through opaque `orderID` / `orderItemID` /
//      `orderFulfillmentID` values and never through the aggregate itself, and
//      that distinction is preserved exactly.
//   3. FRAGMENT match anywhere in the normalized key. This is what closes the
//      near-miss hole: any key CONTAINING `password`, `secret`, `token`,
//      `apikey`, `privatekey`, `signingkey`, `credential` and their siblings is
//      redacted regardless of what surrounds it. The fragment set is
//      deliberately restricted to compounds that are unambiguous in English -
//      see the register of fragments NOT included, and why, below the set.
//   4. SEGMENT match against one word of the key. `dbPass` splits into
//      `db` + `pass` and is redacted; `bypass` is one segment and is not. This
//      catches the short bare credential words that rule 3 cannot use as
//      substrings without redacting ordinary vocabulary.
//
// Matching is insensitive to case and to `_`, `-` and whitespace, because
// CFML struct keys are case-insensitive and the ported code base carries that
// habit forward. `apiKey`, `API-KEY` and `api_key` must not be three different
// keys, or the list would be defeated by nothing more than a shift key.
//
// A FIFTH SET, WITH DIFFERENT SEMANTICS: OPAQUE CONTAINERS
// `headers`, `env`, `config`, `body`, `payload` and their siblings name a
// CONTAINER rather than a value. Redacting such a key outright would throw away
// the legitimate diagnostics inside it, and passing it through would publish
// whatever it happens to hold. Neither is right, so the rule is decided by the
// SHAPE of the value: a plain object or an array is RECURSED, and each child is
// policed on its own name by the four rules above; a SCALAR is redacted,
// because a header map, an environment dump or a request body flattened into one
// string is an opaque blob that no key-name rule can see into. See
// `OPAQUE_CONTAINER_KEYS` and `redactPlainObject`.
//
// THE ONE STRUCTURAL LIMIT OF A KEY-BASED POLICY, AND HOW IT IS CLOSED
// Matching on key names cannot see inside a string, so any value that is itself
// FREE TEXT sits outside the reach of the sets above. Exactly one kind of free
// text arrives here routinely and unavoidably: the `message` and `stack` of a
// thrown error, which are assembled at throw time out of whatever data was in
// hand - a server error text carrying a SQL fragment, a rejected input value, a
// host name, an account name. Listing a key cannot help, because the exposure is
// in the content rather than in the name.
// That gap is closed structurally instead: an error is never traversed and never
// copied wholesale. It is SUMMARIZED down to a shape-validated class name and a
// shape-validated machine code, and its message and stack are replaced with the
// marker below. See `normalizeError`. Like the sets above, it has no off switch.
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
  // An OAuth client identifier. Semi-public by design, and listed here anyway:
  // it is one half of a client-credentials pair, it identifies the integration
  // rather than any business object in this port, and nothing in the ported
  // slice has a diagnostic reason to publish it.
  'clientid',
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

/**
 * Personally identifiable fields carried by account and customer records.
 *
 * THE POSTURE, STATED EXPLICITLY because the alternative is for a reader to
 * infer it from the list: a natural person's NAME, POSTAL ADDRESS and NETWORK
 * ADDRESS are personal data in exactly the way an email address is, and none of
 * them is a diagnostic this port needs. The promotion engine's address-zone
 * qualifier is the one place an address is even in play, and it decides
 * membership from a zone - so `addressID` and `addressZoneID` remain legible
 * through the allow-list while the address itself does not. Nothing here is
 * configurable, and there is no diagnostic mode that reinstates any of it.
 *
 * `name` alone is deliberately NOT listed: `brandName`, `productName` and
 * `optionGroupName` are catalog labels rather than personal data, and redacting
 * them would blind the catalog paths for no gain. The person-specific spellings
 * are enumerated instead.
 */
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
  'firstname',
  'lastname',
  'middlename',
  'fullname',
  'company',
  'address',
  'address1',
  'address2',
  'streetaddress',
  'streetaddressline1',
  'streetaddressline2',
  'locality',
  'postalcode',
  'zipcode',
  'ipaddress',
  'remoteaddr',
  'remoteaddress',
  'clientip',
  'useragent',
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

/**
 * Statement text and bound parameter values.
 *
 * A driver hangs the failing statement, and often the values bound into it, off
 * the error object it throws - `mysql2` populates `sql`, `sqlMessage`,
 * `sqlState`, `code` and `errno`. A statement is the one payload that can carry
 * a credential, a card number and a whole aggregate at once, in a single string
 * that no key-name policy can see into, so the name is listed here and the
 * value never leaves this module.
 *
 * These names are also the explicit suppression list applied to a thrown
 * `Error`'s own fields; see `normalizeError`.
 */
const SQL_AND_BINDING_KEYS: readonly string[] = [
  'sql',
  'sqltext',
  'sqlquery',
  'sqlmessage',
  'sqlstate',
  'statement',
  'preparedstatement',
  'query',
  'bindings',
  'bindparams',
  'bindparameters',
  'boundparameters',
  'boundvalues',
  'queryparams',
  'queryparameters',
  'queryvalues',
  'parametervalues',
  // The two bare spellings, listed for the same reason as their qualified
  // siblings above. In this port a `params` or `values` member alongside a
  // statement IS the bound parameter list - that is the shape `mysql2` takes and
  // the shape `getPreparedStatementExecutor` passes - and a bound parameter list
  // is the one payload that can carry a credential, a card number and a whole
  // aggregate at once. They are NOT treated as opaque containers, because
  // recursing into them would publish exactly those values one element at a
  // time.
  'params',
  'values',
];

/** The six groups above, flattened once, for constant-time membership tests. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  ...CREDENTIAL_KEYS,
  ...CONNECTION_KEYS,
  ...PAYMENT_CARD_KEYS,
  ...PERSONAL_DATA_KEYS,
  ...AGGREGATE_PAYLOAD_KEYS,
  ...SQL_AND_BINDING_KEYS,
]);

/**
 * The keys that stay legible, whatever any later rule would say about them.
 *
 * Rule 1 of the policy, and the reason a fail-closed default is affordable at
 * all. Every entry is an OPAQUE IDENTIFIER: a 32-character UUID-backed primary
 * key, or a correlation identifier minted by the platform. None of them
 * discloses anything on its own, and all of them are how the ported services are
 * traced - the promotion and price-group engines address the out-of-scope order
 * aggregate exclusively through `orderID` / `orderItemID` /
 * `orderFulfillmentID`, so redacting those would make the engines untraceable
 * while protecting nothing.
 *
 * The list is CLOSED and enumerated rather than derived from a suffix rule such
 * as "anything ending in ID". A derived rule would silently admit the next
 * `apiKeyID`-shaped name someone invents; an enumerated list makes every
 * exemption a deliberate edit to this file.
 */
const LEGIBLE_IDENTIFIER_KEYS: ReadonlySet<string> = new Set([
  // Catalog
  'productid',
  'producttypeid',
  'skuid',
  'skucurrencyid',
  'brandid',
  'categoryid',
  'optionid',
  'optiongroupid',
  // Promotions and pricing
  'promotionid',
  'promotioncodeid',
  'promotionperiodid',
  'promotionqualifierid',
  'promotionrewardid',
  'promotionappliedid',
  'promotionaccountid',
  'pricegroupid',
  'pricegrouprateid',
  'roundingruleid',
  // The out-of-scope order aggregate, reachable only as an opaque identifier
  'orderid',
  'orderitemid',
  'orderfulfillmentid',
  'accountid',
  // Fulfillment and address, whose PII-bearing bodies stay redacted
  'addressid',
  'addresszoneid',
  'shippingmethodid',
  'shippingmethodoptionid',
  // Platform correlation
  'requestid',
  'correlationid',
  'traceid',
  'invocationid',
  'awsrequestid',
]);

/**
 * Rule 3: fragments that make a key sensitive wherever they appear inside it.
 *
 * Each entry is a compound that has no innocent meaning in English or in this
 * domain, so a plain substring test is safe: `dbSecret`, `secretKey` and
 * `awsSecretAccessKey` all contain `secret`, and nothing a catalog or promotion
 * path legitimately logs does.
 *
 * THE REGISTER OF FRAGMENTS DELIBERATELY NOT INCLUDED, each with the key that
 * disqualifies it. These stay EXACT-match entries in the groups above instead,
 * and the omission is a decision rather than an oversight:
 *
 *   `auth`  - `author` / `authorName`. Product reviews carry an author, so a
 *             bare `auth` fragment would redact a catalog field. The qualified
 *             forms `authorization`, `authtoken`, `authkey`, `authsecret`,
 *             `oauth` and `xauth` are listed instead.
 *   `key`   - `cacheKey`, `keyCount`, `optionGroupIDKey`. Only the qualified
 *             compounds (`apikey`, `privatekey`, `accesskey`, `signingkey`,
 *             `encryptionkey`, `sessionkey`, `clientkey`, `sharedkey`,
 *             `hmackey`) are listed.
 *   `pass`  - `bypass`, `compass`, `passedQualification`. Handled by rule 4,
 *             which requires `pass` to be a whole word of the key.
 *   `user`  - `userID`, `userAgent`. Only the database-account compounds
 *             (`dbuser`, `databaseuser`, `datasourceuser`, `mysqluser`) are
 *             listed, because a database account name is a connection detail.
 *   `name`  - `brandName`, `productName`. Person-specific spellings are
 *             enumerated in `PERSONAL_DATA_KEYS` instead.
 *   `code`  - `skuCode`, `currencyCode`, `errorCode`, `statusCode`. `cvv`,
 *             `securitycode` and `passcode` are listed instead.
 *   `host`  - `hostname` is already exact, and a bare fragment would redact
 *             nothing extra while risking `hostedFlag`-shaped names.
 */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  // Credentials, in every compound spelling
  'password',
  'passwd',
  'passphrase',
  'passcode',
  'pwd',
  'secret',
  'credential',
  // Key material, qualified so `cacheKey` survives
  'apikey',
  'apitoken',
  'accesskey',
  'privatekey',
  'signingkey',
  'encryptionkey',
  'sessionkey',
  'clientkey',
  'sharedkey',
  'hmackey',
  // Bearer material and the schemes that carry it
  'authorization',
  'authtoken',
  'authkey',
  'authsecret',
  'oauth',
  'xauth',
  'token',
  'jwt',
  'bearer',
  // Payment instruments and government identifiers
  'creditcard',
  'cardnumber',
  'securitycode',
  'socialsecurity',
  // Database connection details, which the policy forbids by name
  'dbpass',
  'dbpwd',
  'dbuser',
  'databasepass',
  'databaseuser',
  'datasourcepass',
  'datasourceuser',
  'mysqlpass',
  'mysqlpwd',
  'mysqluser',
  'connectionstring',
  'connectionuri',
  'connectionurl',
];

/**
 * Rule 4: short words that are sensitive only when they are a WHOLE WORD of the
 * key.
 *
 * These cannot be used as substrings without redacting ordinary vocabulary, so
 * they are matched against the key's own word boundaries instead - the
 * camelCase transitions, the digits and the `_` / `-` / `.` / space separators
 * that `splitKeyWords` reads. `dbPass` is `db` + `pass` and is redacted;
 * `bypass` is one word and is not; `passedQualification` yields `passed`, which
 * is a different word, and is not.
 */
const SENSITIVE_KEY_WORDS: ReadonlySet<string> = new Set([
  'pass',
  'pwd',
  'secret',
  'token',
  'jwt',
  'bearer',
  'cvv',
  'cvc',
  'otp',
  'salt',
]);

/**
 * The fifth set: keys that name a CONTAINER rather than a value.
 *
 * A plain object or array under one of these names is recursed, so each child is
 * policed on its own name; a SCALAR under one of these names is redacted,
 * because a header map, an environment dump, a settings blob or a request body
 * flattened into a single string is opaque to every key-name rule there is.
 *
 * This is the shape a caller reaches for when handing over "everything I have",
 * which is exactly when the never-log policy has to be at its strongest.
 */
const OPAQUE_CONTAINER_KEYS: ReadonlySet<string> = new Set([
  'env',
  'environment',
  'config',
  'configuration',
  'settings',
  'setting',
  'headers',
  'requestheaders',
  'responseheaders',
  'body',
  'requestbody',
  'responsebody',
  'payload',
  'requestcontext',
  // The legacy FW/1 request context, which arrived as `rc` at every controller
  // entry point - `integrationServices/google/controllers/feed.cfc:L58` takes
  // `required struct rc`. A caller porting one of those call sites is likely to
  // keep the name.
  'rc',
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
 * How many array elements or object keys are traversed at any one level.
 *
 * The companion to `MAX_REDACTION_DEPTH`, and it exists because depth alone does
 * not bound the work. A context object four levels deep is cheap; an array of a
 * hundred thousand elements is not, and it is FLAT - so every depth check passes
 * and the traversal walks the whole thing, allocating a redacted copy of it, on a
 * path whose entire purpose is to be safe to call from a `catch` arm. Breadth is
 * the second dimension of the same bound.
 *
 * Like the depth bound, this bounds the work. It is not a tuning knob and encodes
 * no target of any kind.
 */
const MAX_REDACTION_BREADTH = 64;

/**
 * How long a serialized entry may be before it is replaced by a bounded summary.
 *
 * The third dimension, and the one the other two cannot cover. Depth and breadth
 * bound the SHAPE of a structure, but neither bounds the SIZE of a leaf: a single
 * string property holding a multi-megabyte payload sits at depth one and breadth
 * one, passes both checks untouched, and becomes a multi-megabyte log line. This
 * is checked on the finished document, after redaction, which is the only place
 * the true emitted size is known.
 *
 * Bounds the work; not a tuning knob, and no target of any kind.
 */
const MAX_SERIALIZED_ENTRY_CHARACTERS = 16384;

/**
 * Lowercase, then drop everything that is not a letter or a digit, so that
 * `apiKey`, `API-KEY`, `api_key` and `Api Key` all collapse onto the single
 * entry `apikey`.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Where one word of a key ends and the next begins.
 *
 * Three boundaries, which together cover every spelling convention this port
 * meets: an explicit separator (`_`, `-`, `.`, whitespace and anything else that
 * is not a letter or a digit), a lower-to-upper camelCase transition (`dbPass`),
 * and the tail of an acronym run followed by a capitalized word
 * (`AWSSecretKey` -> `AWS` + `Secret` + `Key`).
 */
const KEY_WORD_BOUNDARY_PATTERN = /[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

/**
 * Split a key into its lowercase words for rule 4.
 *
 * Empty fragments are dropped, so a leading, trailing or doubled separator
 * cannot produce an empty word that would then match nothing and cost a lookup.
 */
function splitKeyWords(key: string): readonly string[] {
  return key
    .split(KEY_WORD_BOUNDARY_PATTERN)
    .filter((word: string): boolean => word.length > 0)
    .map((word: string): string => word.toLowerCase());
}

/**
 * The never-log decision, in the fixed order the policy documents.
 *
 * The default is REDACTION: an unrecognized key reaches the end of this function
 * only if none of the four rules claims it, and every rule that could claim it is
 * written to claim MORE than the exact name. That is the whole point - the
 * failure mode of the earlier exact-match-only version was that an unenumerated
 * credential name was emitted in cleartext with no signal of any kind.
 *
 * Total by construction: every operation is a string test or a set lookup, so
 * there is no throwing path. It runs inside the emission path that must never
 * throw, and it is also called by `redactSensitiveAssignments` on string
 * CONTENT, which is why the allow-list keeps `productID=abc123` legible inside a
 * message as well as inside a context object.
 */
function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized.length === 0) {
    // A key made entirely of separators normalizes to nothing. There is no name
    // to police, so there is nothing to match; the VALUE still goes through
    // `redactValue` like any other.
    return false;
  }
  // Rule 1. The allow-list wins outright, before any rule that could claim the
  // key, so an enumerated opaque identifier can never be captured by a fragment
  // or a word rule.
  if (LEGIBLE_IDENTIFIER_KEYS.has(normalized)) {
    return false;
  }
  // Rule 2. The exact fast path.
  if (FORBIDDEN_KEYS.has(normalized)) {
    return true;
  }
  // Rule 3. Fragments, matched anywhere in the normalized key.
  for (const fragment of SENSITIVE_KEY_FRAGMENTS) {
    if (normalized.includes(fragment)) {
      return true;
    }
  }
  // Rule 4. Whole words of the key, for the short bare credential names.
  for (const word of splitKeyWords(key)) {
    if (SENSITIVE_KEY_WORDS.has(word)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a key names a container whose treatment depends on the shape of its
 * value.
 *
 * Consulted only after `isForbiddenKey` has declined the key, so a name that is
 * both - `requestBody` is a container, `bindParams` is forbidden outright - is
 * decided by the stricter rule.
 */
function isOpaqueContainerKey(key: string): boolean {
  return OPAQUE_CONTAINER_KEYS.has(normalizeKey(key));
}

// ---------------------------------------------------------------------------
// String-content sanitization
//
// A key-name policy can only protect a value that arrived under a name. It
// cannot protect anything embedded INSIDE a string, and the two highest-volume
// string channels in this service - a log call's own `message` and a thrown
// error's `message` and `stack` - carry no key at all. `errorMapper.ts` reaches
// this module with `error: <the raw thrown value>` on its unrecognized arm, so a
// driver error's statement text, the values bound into it, the credential in a
// connection URI and the absolute path of every stack frame all arrive as string
// CONTENT rather than as named fields.
//
// Every rule below is therefore applied to string content, not to key names, and
// each is deliberately narrow enough to state what it does and does not catch.
// Sanitization is total: `sanitizeText` has no throwing path, because it runs
// inside the emission path that must never throw.
// ---------------------------------------------------------------------------

/** Substituted for a statement, because a statement cannot be partly scrubbed. */
const SQL_REDACTED = '[SQL REDACTED]';

/** Substituted for an absolute filesystem path. */
const PATH_REDACTED = '[PATH REDACTED]';

/** Appended when a string is cut to `MAX_LOGGED_TEXT_LENGTH`. */
const TRUNCATION_MARKER = '...[truncated]';

/**
 * Length beyond which a string is cut.
 *
 * A bound on how much text this module will emit from any single string, so that
 * a whole statement, a whole document or a whole stack cannot arrive as one
 * value. It bounds the output; it is not a tuning knob and encodes no target of
 * any kind.
 */
const MAX_LOGGED_TEXT_LENGTH = 512;

/**
 * Statement shapes, matched case-insensitively - the arms that need no help.
 *
 * WHY TWO ANCHORS ARE NOT ENOUGH, AND WHAT REPLACED THEM. An earlier revision
 * required only two keywords in sequence: `select` followed anywhere by `from`,
 * `update` followed anywhere by `set`. Two keywords sounds specific and is not.
 * It replaced ordinary sentences wholesale - "user chose to select a sku from the
 * catalog list" and "update the pricing set for this price group" both became
 * `[SQL REDACTED]`, which is a total loss of the message. This rule SHORT-CIRCUITS
 * and replaces the ENTIRE string, so a false positive here is the most expensive
 * one in the module, and the bar for it is correspondingly high.
 *
 * Every arm below therefore requires a STATEMENT SHAPE rather than a keyword
 * sequence: the object being acted on, and the syntax that must follow it.
 *
 *   * `insert into <object>` must be followed by a column list, `values`, `set`
 *     or a sub-`select` - "insert into the feed document" is followed by a second
 *     ordinary word and matches nothing.
 *   * `update <object> [alias] set <column> =` requires the assignment. This is
 *     what rejects "update the pricing set for this price group": the word after
 *     `set` is not being assigned to.
 *   * `delete from <object>` must be followed by end-of-statement or a clause -
 *     "delete from the cart" is followed by a second ordinary word.
 *   * A DDL verb must name both an object type and an object.
 *   * `union [all] select` is left as a bare keyword pair on purpose. It is the
 *     canonical injection signature, it does not occur in English, and this is
 *     the one place where a false positive is the acceptable direction of error.
 *
 * The object matcher below accepts an optional backtick, double quote or bracket,
 * because that is how each supported quoting style introduces an identifier, and
 * an optional `schema.object` or `alias.column` qualifier, because both forms are
 * ordinary in a real statement - `INSERT INTO Slatwall.SwSku`, `UPDATE SwSku s SET
 * s.price =`. It accepts ONE reference only: a second bare word cannot be absorbed
 * into it, which is what keeps "the cart" and "the pricing" out.
 */
const SQL_OBJECT_REFERENCE =
  '[`"[]?[A-Za-z_][\\w$]{0,63}[`"\\]]?(?:\\s*\\.\\s*[`"[]?[A-Za-z_][\\w$]{0,63}[`"\\]]?)?';

/** An optional single alias token, as `FROM t alias` and `UPDATE t alias SET` allow. */
const SQL_OPTIONAL_ALIAS = '(?:\\s+(?:as\\s+)?[A-Za-z_]\\w{0,31})?';

/**
 * A determiner may not stand where a table name is expected.
 *
 * The one test that separates `FROM SwSku` from "from the catalog": no table in
 * the `Sw*` schema is named `the`, `a`, `this` or `each`, and English puts one of
 * these words after "from" almost without exception. Shared by every arm that has
 * to read a `FROM` target, so the list lives in one place and each arm cites it.
 */
const SQL_TABLE_DETERMINER_VETO =
  '(?!(?:the|a|an|this|that|these|those|each|every|all|any|some|my|your|his|her|its|our|their|it|them|us|which|what|here|there|both|either|neither|no|none|other|another|being|one|two)\\b)';

const SQL_STATEMENT_PATTERNS: readonly RegExp[] = [
  new RegExp(
    `\\binsert\\s+into\\s+${SQL_OBJECT_REFERENCE}\\s*(?:\\(|\\bvalues\\b|\\bset\\b|\\bselect\\b)`,
    'i',
  ),
  new RegExp(
    `\\bupdate\\s+${SQL_OBJECT_REFERENCE}${SQL_OPTIONAL_ALIAS}\\s+set\\s+${SQL_OBJECT_REFERENCE}\\s*=`,
    'i',
  ),
  // Two optional alias slots, because both the multi-table form
  // (`DELETE t1 FROM SwSku t1 JOIN ...`) and a plain aliased target are ordinary.
  // Prose is kept out by the determiner veto on the target rather than by the
  // clause requirement, which an aliased sentence could otherwise satisfy:
  // "delete rows from the table where needed" reads as a statement to every test
  // except that one. ACCEPTED CONSEQUENCE: "delete records from catalog" with
  // nothing after it is genuinely indistinguishable from `DELETE FROM catalog` and
  // is redacted. A `DELETE` with no clause carries no value, so the cost is a
  // short sentence, and erring toward withholding is the right direction here.
  new RegExp(
    `\\bdelete\\s+(?:${SQL_OBJECT_REFERENCE}\\s+)?from\\s+${SQL_TABLE_DETERMINER_VETO}${SQL_OBJECT_REFERENCE}${SQL_OPTIONAL_ALIAS}\\s*(?:;|$|\\bwhere\\b|\\bjoin\\b|\\busing\\b|\\border\\s+by\\b|\\blimit\\b)`,
    'i',
  ),
  new RegExp(
    `\\b(?:drop|alter|truncate|create)\\s+(?:table|index|view|database|schema)\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?${SQL_OBJECT_REFERENCE}`,
    'i',
  ),
  /\bunion\s+(?:all\s+)?select\b/i,
];

/**
 * `SELECT ... FROM <target>`, where the statement starts where a statement can.
 *
 * A projection list cannot be told apart from two English words by shape alone,
 * because `SELECT column alias FROM t` is legal SQL and "select a sku from t" has
 * exactly that shape. POSITION is what separates them: a statement begins at the
 * start of a string, or after a statement separator, an opening quote or bracket,
 * a comma, an assignment or a colon - which is also how a driver embeds one in a
 * message ("...syntax near 'SELECT ...'") and how a caller labels one
 * ("query: SELECT ..."). A `select` sitting mid-sentence after an ordinary word
 * is prose, and this pattern does not reach it.
 *
 * The `FROM` target carries the shared determiner veto. Because the engine
 * backtracks, a string carrying BOTH a real statement and a prose "from the" still
 * matches on the real one - the veto is scoped to the window that matched, not to
 * the whole string, which is the difference between narrowing this rule and
 * weakening it.
 */
const SQL_SELECT_STATEMENT_PATTERN = new RegExp(
  `(?:^|[\\n\\r\\t;('"\`,=:[])\\s*select\\b[\\s\\S]{0,4000}?\\bfrom\\s+${SQL_TABLE_DETERMINER_VETO}`,
  'i',
);

/**
 * Syntax that a statement carries and a sentence does not.
 *
 * Required IN ADDITION to the two conditions above, as a third independent test,
 * so that a sentence which happens to open with "select" and name a non-determiner
 * after "from" still has to look like syntax to be redacted.
 *
 * ACCEPTED CONSEQUENCE, STATED PLAINLY: a bare two-identifier projection with no
 * operator, literal, placeholder, punctuation or clause - `SELECT skuCode FROM
 * SwSku` - carries no signal and is therefore NOT redacted. It also carries no
 * data: both tokens are schema identifiers, and this port publishes its schema
 * identifiers in `src/repositories/mysql/sql/**` as source. Every statement that
 * can carry a VALUE - a literal, a bound placeholder, a predicate, an insert list -
 * brings a signal with it.
 */
const SQL_SHAPE_SIGNAL_PATTERN =
  /[*(),;?='"`]|\b\w+\.\w+|\b(?:where|join|group\s+by|order\s+by|having|limit|offset|union|values|distinct)\b/i;

/**
 * Whether a string contains something that has to be treated as a statement.
 *
 * The `SELECT` arm is a conjunction of three independent tests rather than one
 * pattern, which is why it is expressed here and not in the array above.
 */
function containsSqlStatement(text: string): boolean {
  for (const pattern of SQL_STATEMENT_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return SQL_SELECT_STATEMENT_PATTERN.test(text) && SQL_SHAPE_SIGNAL_PATTERN.test(text);
}

/**
 * `<identifier><separator><value>`, where the value may be quoted.
 *
 * The identifier capture deliberately excludes spaces and dots, so it can only
 * match the single token immediately left of the separator. Allowing spaces
 * would let the match start further left - `identified by password=x` would
 * capture `identified by password`, which normalizes to a name that is not on
 * the policy list, and the redaction would silently not happen.
 */
const SENSITIVE_ASSIGNMENT_PATTERN =
  /([A-Za-z][A-Za-z0-9_-]{0,63})(\s*(?:=>|=|:)\s*)(?:"[^"\n]{0,512}"|'[^'\n]{0,512}'|[^\s,;)\]}]{1,512})/g;

/**
 * `scheme://user:secret@host` - the credential half of a connection URI.
 *
 * The CREDENTIAL half, and deliberately no more: the authority that follows it
 * survives, so `mysql://user:pw@db.internal:3306/Slatwall` becomes
 * `mysql://[REDACTED]@db.internal:3306/Slatwall`. That is the authored scope of
 * this rule. The host was already outside its reach before the path rules below
 * were narrowed, so nothing about the host changed with them; what did change is
 * that the trailing database name is no longer swept up incidentally by a path
 * rule that was never meant to be reading URIs. Config-derived connection details
 * never travel this way in the first place - `connection.ts` logs its pool line
 * with no context at all, precisely so they cannot.
 */
const URI_CREDENTIAL_PATTERN = /:\/\/[^\s/:@]{1,128}(?::[^\s/@]{0,128})?@/g;

// ---------------------------------------------------------------------------
// Absolute paths
//
// This is what removes the private paths that every stack frame carries, and it
// is why the stack summary below can keep function names: the frame's shape
// survives, only the location is replaced.
//
// WHY THIS IS THREE ANCHORED RULES AND NOT ONE. An earlier revision used a single
// pattern - a drive letter or ANY slash, followed by two or more non-space
// characters. In a language whose messages routinely contain a slash that is not a
// path, that matches far more than it was aimed at, and every hit destroys the
// text from the slash to the next space. Measured against ordinary diagnostics it
// mangled `and/or`, `verify-ca/verify-identity`, `TLSv1.2/1.3`, `50/50`,
// `10/second`, `GET /catalog/products?...`, `config/configORM.cfm:L9-L15` and -
// through the drive-letter arm reading a URL scheme as a drive - turned
// `https://host/docs` into `http[PATH REDACTED]`. It also reached inside this
// service's own context: `errorMapper.ts` publishes `route` and `fieldPaths`, so
// `POST /skus/resolve` and `body/selectedOptions` were being redacted on every
// mapped error, which is the diagnostic these lines exist to provide.
//
// Each rule below therefore requires a path ANCHOR, not merely a slash:
//
//   1. A drive letter that is genuinely a drive letter. The negative lookbehind
//      is the whole point - without it the `s` of `https:` is a drive.
//   2. A rooted POSIX path whose first segment is a REAL filesystem root. A slash
//      that begins an HTTP route or separates two words fails on the root, so a
//      route stays legible while `/var/task/...` does not.
//   3. A POSIX path of two or more segments ending in a dotted filename, which
//      catches a stack frame or a key file under a root the list above does not
//      enumerate (`/workspaces/repo/src/lib/logger.ts`) without accepting an
//      extension-less route.
//
// In all three the leading slash must begin a TOKEN: the lookbehind rejects a
// slash preceded by a letter, digit, underscore, dot, backslash, colon or dash, so
// an infix slash is never a path. A slash preceded by a slash IS accepted, which
// is what lets `file:///var/task/index.js` be caught while `https://host/docs`
// still fails on the root test.
// ---------------------------------------------------------------------------

/** Everything that may not precede the leading slash of a path. */
const NON_PATH_PREFIX = '(?<![A-Za-z0-9_.\\\\:-])';

/** Characters that terminate a path token in prose, a stack frame or JSON. */
const PATH_BODY = '[^\\s"\'()[\\],;]';

/** A drive-letter path, where the letter is not the tail of a longer word. */
const WINDOWS_ABSOLUTE_PATH_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])[A-Za-z]:[\\\\/]${PATH_BODY}{1,512}`,
  'g',
);

/**
 * Segments that are filesystem roots rather than the first segment of a route.
 *
 * The Linux FHS roots, the macOS ones, and `node_modules` - which is not a root
 * but appears at the head of a bundled frame often enough to belong here. No
 * application-specific segment is included: an application root is reached by the
 * dotted-filename rule instead, which needs no enumeration to keep current.
 */
const FILESYSTEM_ROOT_SEGMENTS =
  'tmp|var|home|usr|opt|etc|proc|sys|dev|run|root|srv|mnt|media|bin|sbin|lib|lib64|boot|private|snap|node_modules|Users|Volumes|System|Library|Applications';

/** `/var/task/index.js`, `/home/deploy/.ssh/id_rsa` - a path from a known root. */
const ROOTED_ABSOLUTE_PATH_PATTERN = new RegExp(
  `${NON_PATH_PREFIX}/(?:${FILESYSTEM_ROOT_SEGMENTS})(?![A-Za-z0-9])${PATH_BODY}{0,512}`,
  'g',
);

/** `/workspaces/repo/src/lib/logger.ts:1158:18` - a path proven by its filename. */
const FILENAME_ABSOLUTE_PATH_PATTERN = new RegExp(
  `${NON_PATH_PREFIX}/(?:[^\\s"'()[\\],;/]{1,64}/){1,32}[^\\s"'()[\\],;/]{1,64}\\.[A-Za-z0-9]{1,12}(?![A-Za-z0-9])${PATH_BODY}{0,128}`,
  'g',
);

/** The path rules, applied in order. Each replacement is slash-free, so no rule feeds the next. */
const ABSOLUTE_PATH_PATTERNS: readonly RegExp[] = [
  WINDOWS_ABSOLUTE_PATH_PATTERN,
  ROOTED_ABSOLUTE_PATH_PATTERN,
  FILENAME_ABSOLUTE_PATH_PATTERN,
];

/** `Authorization: Bearer <material>` and its `Basic` sibling. */
const AUTH_SCHEME_PATTERN = /\b(bearer|basic|digest)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/**
 * Replace the value in every `sensitiveKey <sep> value` pair, and nothing else.
 *
 * A pair whose key is not on the policy list is returned byte-for-byte, so an
 * ordinary `orderID=4f3c...` or `status: active` stays legible.
 */
function redactSensitiveAssignments(text: string): string {
  return text.replace(
    SENSITIVE_ASSIGNMENT_PATTERN,
    (whole: string, key: string, separator: string): string =>
      isForbiddenKey(key) ? `${key}${separator}${REDACTED}` : whole,
  );
}

/** Cut to the bound, and say so, so a reader never mistakes a cut for the end. */
function truncateText(text: string): string {
  return text.length <= MAX_LOGGED_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_LOGGED_TEXT_LENGTH)}${TRUNCATION_MARKER}`;
}

/**
 * Make one string safe to emit.
 *
 * Order matters. The statement test runs FIRST and short-circuits, because a
 * statement is replaced whole: its bound values sit inside the statement text,
 * where no `key=value` rule can reach them, so partial scrubbing would leave the
 * interesting half behind. Everything that survives that test is then scrubbed
 * rule by rule and finally bounded.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it does not redact long opaque runs of
 * alphanumerics. Slatwall primary keys are 32-character UUID-backed strings, and
 * this module's policy is explicitly that an opaque identifier stays legible
 * while the aggregate beside it does not. A length-based rule would redact every
 * `orderID` and `skuID` in the service and destroy the diagnostic value of the
 * log stream to catch material that the assignment, URI and auth-scheme rules
 * already name precisely.
 *
 * AND IT DOES NOT PAY FOR PRECISION WITH BREADTH. Every rule here is anchored to a
 * shape it can name, because the cost of a false positive is a destroyed
 * diagnostic and the cost of enough of them is a log stream nobody can read - at
 * which point the module has failed at its actual job while appearing to do it
 * thoroughly. Withholding a credential and publishing a legible message are not in
 * tension; treating "contains a slash" as "is a path" was.
 */
function sanitizeText(text: string): string {
  if (containsSqlStatement(text)) {
    return SQL_REDACTED;
  }
  const withoutUriCredentials = text.replace(URI_CREDENTIAL_PATTERN, `://${REDACTED}@`);
  const withoutAuthMaterial = withoutUriCredentials.replace(
    AUTH_SCHEME_PATTERN,
    (_whole: string, scheme: string): string => `${scheme} ${REDACTED}`,
  );
  let sanitized = redactSensitiveAssignments(withoutAuthMaterial);
  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, PATH_REDACTED);
  }
  return truncateText(sanitized);
}

/**
 * Raised when the traversal meets a container that contains itself.
 *
 * A distinct TYPE rather than a generic `Error` carrying a distinguishing
 * message, so that the fallback reporter can recognize this case by
 * `instanceof` and never has to read a message off a thrown value to find out
 * what happened. That is what allows the reporter to be content-blind: the
 * information is in the type, where a caller cannot forge or influence it, and
 * the message never has to be published to convey it.
 *
 * Module-private. It is a signal between two functions in this file and is not
 * part of any contract outside it.
 */
class LogContextCycleError extends Error {
  constructor() {
    super('circular reference in log context');
    this.name = 'LogContextCycleError';
  }
}

/**
 * The key under which an object's breadth truncation is recorded.
 *
 * Bracketed, so it is not a valid JavaScript identifier and cannot be confused
 * with - or silently overwrite - a property the caller actually supplied. It
 * matches the bracketed style of `[Function]`, `[Symbol]` and `[depth limit]`
 * already used for the other in-band descriptions in this module.
 */
const BREADTH_LIMIT_KEY = '[breadth limit]';

/**
 * Describe what a breadth bound left out, in counts only.
 *
 * Deliberately carries NO content from the omitted elements - not a sample, not a
 * first value, not a key name. The counts are what a reader needs in order to
 * know the line is incomplete, and anything more would reintroduce the
 * caller-controlled data this bound exists to keep out of the stream.
 */
function describeBreadthLimit(omitted: number, total: number, unit: string): string {
  return `[breadth limit: ${String(omitted)} of ${String(total)} ${unit} omitted]`;
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
 * A class-name shape: what an `Error.name` legitimately is, and nothing else.
 *
 * A JavaScript `name` is an ordinary writable property, so any value at all can
 * end up there - including a whole sentence, a stringified payload, or a
 * credential. Only a value shaped like a class identifier is emitted; anything
 * else is replaced, because the point of the name field is to say WHICH failure
 * occurred, never to carry free text. Dots are admitted so a namespaced class
 * name survives intact; nothing else beyond letters, digits, `_` and `$` is.
 *
 * There is no `g` flag on this pattern or on the error-code pattern below: both
 * are reused across invocations, and a global regex would carry `lastIndex`
 * between them.
 */
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/;

/**
 * An error's `name` is a class name, so it is emitted only when it looks like
 * one. A subclass free to assign anything to `name` cannot use it as a channel.
 */
function safeErrorName(name: unknown): string {
  return typeof name === 'string' && SAFE_ERROR_NAME_PATTERN.test(name) ? name : '[Error]';
}

/**
 * The shape an error CODE may take before it is emitted.
 *
 * Sized to the machine tokens the pinned dependency set and the Node runtime
 * actually produce - a Node `ERR_*` / `ECONNREFUSED` code, or a MySQL driver
 * `ER_*` code - and capped at the same 64 characters for the same reason.
 * Whitespace, quotes, parentheses and every other punctuation mark are excluded,
 * which is what makes it structurally impossible for a SQL fragment, a
 * connection string or a sentence to pass as a code.
 */
const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Substituted for a name that does not have the shape of a class identifier. */
const UNSAFE_ERROR_NAME = '[unsafe name]';

/**
 * Read a machine code off an error, or decline.
 *
 * Reached through `in`-operator narrowing so nothing widens and no cast is
 * needed. Declining is the default: a code is emitted only when it is a string
 * AND has the machine-token shape above.
 */
function readSafeErrorCode(error: Error): string | undefined {
  if (!('code' in error)) {
    return undefined;
  }
  const { code } = error;
  if (typeof code !== 'string' || !SAFE_ERROR_CODE_PATTERN.test(code)) {
    return undefined;
  }
  return code;
}

/**
 * Reduce an error to the metadata that is safe to publish.
 *
 * `JSON.stringify(new Error('x'))` yields `{}`, because an Error's own fields
 * are not enumerable. Converting explicitly is the only way an error survives
 * into the emitted line at all - but WHAT survives is deliberately narrow.
 *
 * `message` AND `stack` ARE NEVER EMITTED. Both are free text, and the never-log
 * policy above is KEY-based: it inspects key names, so it can never inspect the
 * inside of a string. An exception's message is routinely built out of data the
 * policy exists to keep out of the stream - the MySQL driver composes its
 * message from the server's own error text and hangs the failing statement off
 * the error object, so a syntax or constraint failure embeds the failing SQL
 * fragment and its bound values directly in `message`. A validation failure
 * quotes the rejected input. A connection failure names the host and the
 * account. A stack can carry the same content in its header line, and `stack`
 * is itself writable, so its contents are not even structurally guaranteed.
 * Emitting either would let a credential, a token, a connection detail or
 * personally identifiable data past a policy that cannot see inside it.
 *
 * Both keys are therefore RETAINED carrying the redaction marker rather than
 * dropped. That keeps the emitted object recognizably an error rather than the
 * empty `{}` plain serialization produces, and - exactly as for a forbidden key -
 * it puts the omission ON THE RECORD instead of leaving a reader to wonder
 * whether the field was absent or withheld.
 *
 * What remains is enough to classify a failure without describing it: the error
 * class name, and a machine code when the error carries one. The narrative
 * belongs to the caller's own `message` argument, which is authored in this code
 * base rather than assembled from data, and to the correlation identifier the
 * call site supplies alongside it.
 *
 * There is deliberately NO option, environment variable or override that turns
 * any of this off, for the same reason the forbidden-key list has none.
 *
 * Copying only these fields also drops everything else the error carries -
 * `cause`, an aggregate's nested `errors`, and the driver-attached statement and
 * parameter fields - none of which reaches a log line from here.
 */
function normalizeError(error: Error): Record<string, unknown> {
  const name = SAFE_ERROR_NAME_PATTERN.test(error.name) ? error.name : UNSAFE_ERROR_NAME;
  const code = readSafeErrorCode(error);
  const summary: Record<string, unknown> = { name, message: REDACTED, stack: REDACTED };
  // Omitted rather than set to `undefined`, so an error without a usable code
  // simply has no `code` member instead of a null-shaped one.
  if (code !== undefined) {
    summary['code'] = code;
  }
  // DRIVER FIELDS ARE NOT NAMED HERE EITHER. An earlier form of this function
  // listed the statement- and binding-bearing keys it had declined to copy, so
  // that the suppression was visible on the record. The shape is CLOSED instead:
  // `sql`, `sqlMessage` and `values` are never read, and no key derived from the
  // error's own property names reaches the line - not even as a name. That is
  // strictly less disclosing, and it keeps the emitted shape fixed, which is what
  // lets a reader tell a driver error from a plain one by its `code` rather than
  // by a field list. Those same keys remain in the key-based half of the policy
  // (`SQL_AND_BINDING_KEYS`), which still redacts them wherever a CONTEXT object
  // carries them under a key.
  return summary;
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
  // A string is the one primitive that can carry a payload the key-name policy
  // cannot see - a statement, a connection URI, a bearer token, an absolute
  // path - so it is the one primitive that is NOT passed through untouched.
  // Sanitizing here rather than only at the top level is what makes the policy
  // reach a string nested inside the caller's context object.
  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  // Everything remaining that is not an object is a number, boolean or
  // undefined: representable as-is, and passed through untouched.
  if (typeof value !== 'object') {
    return value;
  }
  if (value === null) {
    return null;
  }
  // An error is SUMMARIZED, never traversed. It is reduced to its class name and
  // a machine code, with its message and stack replaced by the redaction marker -
  // see `normalizeError` for why both are free text the key-based policy cannot
  // inspect. This arm therefore does not weaken the policy; it is the one place
  // that closes the hole a key-based policy would otherwise leave open.
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
    throw new LogContextCycleError();
  }
  // A cycle longer than the depth bound is truncated here instead, because
  // traversal stops before the repetition becomes reachable. The emitted line
  // stays well-formed, finite and redacted either way.
  if (depth >= MAX_REDACTION_DEPTH) {
    return '[depth limit]';
  }
  const nextAncestors: ReadonlySet<object> = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return redactArray(value, depth, nextAncestors);
  }
  if (isPlainObject(value)) {
    return redactPlainObject(value, depth, nextAncestors);
  }
  return describeOpaqueObject(value);
}

/**
 * Rebuild an array, bounded in width, recording anything it left out.
 *
 * The elements beyond the bound are DESCRIBED rather than dropped, and the
 * distinction matters more than it looks. A silently shortened array is
 * indistinguishable from an array that was genuinely that short, so a reader
 * diagnosing an incident would draw a conclusion about the caller's data from an
 * artefact of this module. The trailing marker says plainly that a bound was
 * reached and how much is missing, which keeps the line honest while still
 * bounding the work.
 */
function redactArray(
  source: readonly unknown[],
  depth: number,
  ancestors: ReadonlySet<object>,
): readonly unknown[] {
  const kept = source
    .slice(0, MAX_REDACTION_BREADTH)
    .map((item) => redactValue(item, depth + 1, ancestors));

  if (source.length <= MAX_REDACTION_BREADTH) {
    return kept;
  }
  return [
    ...kept,
    describeBreadthLimit(source.length - MAX_REDACTION_BREADTH, source.length, 'items'),
  ];
}

/**
 * Decide what one member of a caller's object becomes, from its key and the
 * shape of its value.
 *
 * Three outcomes, in order:
 *
 *   1. A key the never-log policy claims is replaced with the marker outright.
 *      The value is not traversed, not measured and not described - a description
 *      of a credential is still a statement about a credential.
 *   2. A key that names an OPAQUE CONTAINER is decided by the shape of its value.
 *      TEXT is redacted: a header map, an environment dump or a request body
 *      flattened into one string can hold anything, and content sanitization is
 *      not a sufficient answer because it catches credential-SHAPED text while a
 *      bare opaque secret - a raw token with no scheme prefix - has no shape to
 *      catch. Everything else falls through to rule 3, where a plain object or an
 *      array is recursed and each child is policed on its own name
 *      (`headers.authorization`, `env.DB_PASSWORD`), a number, boolean or null
 *      is emitted because it can hide no payload, and a class instance is
 *      described by name only.
 *   3. Anything else is redacted value-first by `redactValue`, which still
 *      sanitizes strings, summarizes errors and enforces the depth and breadth
 *      bounds.
 *
 * Total, like everything else on this path: the only operations are set lookups,
 * a `typeof` test and a recursive call that is itself total.
 */
function redactMember(
  key: string,
  value: unknown,
  depth: number,
  ancestors: ReadonlySet<object>,
): unknown {
  if (isForbiddenKey(key)) {
    return REDACTED;
  }
  if (isOpaqueContainerKey(key) && isOpaqueTextPayload(value)) {
    return REDACTED;
  }
  return redactValue(value, depth + 1, ancestors);
}

/**
 * Whether a value is free text, and therefore capable of hiding an entire
 * payload inside one member.
 *
 * A `bigint` counts because it is emitted as its decimal string, and a long
 * digit run is still text this module cannot see into. Numbers, booleans, `null`
 * and `undefined` do not count: whatever a caller meant by `settings: 42`, it
 * cannot be a credential dump.
 */
function isOpaqueTextPayload(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'bigint';
}

/**
 * Rebuild a plain object, applying the never-log policy key by key and recursing
 * into what survives, bounded in the number of keys it will walk.
 *
 * The truncation marker is added under a key that is not a valid identifier, so
 * it cannot collide with a real property the caller supplied.
 */
function redactPlainObject(
  source: object,
  depth: number,
  ancestors: ReadonlySet<object>,
): Record<string, unknown> {
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(source);

  // THE RECORD IS BUILT ON A NULL PROTOTYPE, AND CALLER KEYS ARE WRITTEN WITH
  // `defineProperty` RATHER THAN `[key] =`. Both halves are required, and the
  // reason is a defect rather than defensiveness:
  //
  //   * `{}` inherits `Object.prototype`, which still exposes the legacy
  //     `__proto__` accessor. `redacted['__proto__'] = value` therefore CALLS THE
  //     SETTER instead of creating a property, so a context key literally named
  //     `__proto__` was silently discarded while every key around it was
  //     recorded. An audit record that drops one specific, nameable key is worse
  //     than one that never had it, because the entry still looks complete. Worse,
  //     when the value was an object the setter reassigned the prototype of the
  //     record being built.
  //   * `Object.create(null)` removes the accessor, so `__proto__` becomes an
  //     ordinary key with no special meaning; `defineProperty` then states the
  //     intent explicitly - an own, enumerable data property - so the write cannot
  //     be intercepted at all.
  //
  // The keys reaching here are not this port's to choose: a context object can be
  // assembled from a request body, a header map, or the fields of a `JSON.parse`
  // result, and `JSON.parse` produces `__proto__` as an ordinary own property - so
  // a caller can put that key in front of this loop without the port's
  // cooperation. `JSON.stringify` serializes a null-prototype object exactly as it
  // serializes `{}`, so the emitted line is unchanged for every ordinary key.
  const redacted = Object.create(null) as Record<string, unknown>;

  // The breadth bound stays on the iteration. The null prototype governs HOW each
  // surviving key is written; it says nothing about how many are walked, so the
  // two controls are independent and both apply.
  for (const [key, nested] of entries.slice(0, MAX_REDACTION_BREADTH)) {
    Object.defineProperty(redacted, key, {
      value: redactMember(key, nested, depth, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  if (entries.length > MAX_REDACTION_BREADTH) {
    // `BREADTH_LIMIT_KEY` is authored by this module rather than supplied by a
    // caller, and it is deliberately not a valid identifier, so it can collide
    // with neither a real property nor `__proto__`. It is still written through
    // `defineProperty` so that every write into this record goes through one
    // mechanism - there is no second, weaker path for a future edit to reach for.
    Object.defineProperty(redacted, BREADTH_LIMIT_KEY, {
      value: describeBreadthLimit(entries.length - MAX_REDACTION_BREADTH, entries.length, 'keys'),
      enumerable: true,
      writable: true,
      configurable: true,
    });
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

/**
 * Name the reason serialization failed, carrying none of its content.
 *
 * ★ CONTENT-BLIND, AND THAT IS THE WHOLE POINT OF THE FUNCTION. It previously
 * interpolated `thrown.message`, which made the fallback line the one path in
 * this module that published unstructured text having bypassed redaction
 * entirely - the redaction pass is what threw, so nothing it would have scrubbed
 * had been scrubbed yet. Two of the three failures it reports are raised while
 * READING the caller's own object, so that message could be caller-authored: an
 * accessor that throws `new Error(connectionString)` had its argument copied
 * straight onto the log stream.
 *
 * The return value is now one of exactly two fixed sentences chosen by TYPE, so
 * no span of any thrown value reaches the output. Distinguishing the cycle case
 * is still worth doing, because that one is this module's own controlled signal
 * rather than anything the caller produced, and it tells an operator something
 * actionable: a live object graph was handed to the logger instead of a flat
 * context.
 *
 * Total by construction - two returns, no property reads on `thrown` beyond an
 * `instanceof` test - which is what lets the caller treat it as unable to throw
 * while it is reporting a throw.
 *
 * THE STRONGER-LOOKING ALTERNATIVE IS NOT TO BIND THE THROWN VALUE AT ALL - a
 * bare `catch {}` in the caller, with a single fixed sentence here - on the
 * argument that a binding invites a later edit to put content back on the record.
 * That is a real hazard and it is answered rather than dismissed: the binding is
 * reachable by exactly one operation, an `instanceof` test against a class this
 * module defines and raises itself, and the two return values are literals with
 * no interpolation anywhere in the function. Non-disclosure is therefore a
 * property of the function body, which a reviewer can read in six lines, rather
 * than of the caller's `catch` clause. What the binding buys is the cycle
 * distinction above, which is actionable and cannot be recovered once the value
 * is discarded.
 */
function describeSerializationFailure(thrown: unknown): string {
  if (thrown instanceof LogContextCycleError) {
    return 'circular reference in log context';
  }
  return 'log context could not be serialized';
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
 * never silently lost and the reason is on the record. The name is all it gets:
 * see `describeSerializationFailure` for why the reason is chosen by type and
 * carries no content from the thrown value.
 *
 * A FOURTH outcome is not a failure at all and so does not go through the `catch`:
 * a serialized entry over `MAX_SERIALIZED_ENTRY_CHARACTERS` is replaced by the
 * same minimal shape, reporting the measured size. It is checked after
 * stringification because that is the only point where the true emitted size is
 * known - depth and breadth bound a structure's shape, and neither can see the
 * length of a single leaf string.
 *
 * Neither replacement needs a guard of its own. Every field of both is a string
 * or a number already in hand, so the second call cannot fail in turn - which is
 * precisely what makes the guarantee absolute rather than merely likely.
 *
 * The message is sanitized on BOTH paths, and it is sanitized here rather than
 * at the four call sites. A caller composes a message by interpolation - the
 * driver's own text, a connection URI, a resolved filesystem path - so the
 * message is string content that the key-name policy structurally cannot see.
 * Doing it once, at the single point where an entry is built, is what makes the
 * guarantee hold for every level and every caller rather than for the callers
 * that remembered.
 */
function serializeEntry(
  timestamp: string,
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
): string {
  const safeMessage = sanitizeText(message);
  try {
    const entry: LogEntry =
      context === undefined
        ? { timestamp, level, message: safeMessage }
        : {
            timestamp,
            level,
            message: safeMessage,
            context: redactValue(context, 0, new Set<object>()),
          };
    const line = JSON.stringify(entry);

    // The size bound is applied to the FINISHED document, because that is the
    // only point at which the emitted size is actually known: depth and breadth
    // bound the shape, and neither can see how long a single leaf string is.
    //
    // An over-long entry is replaced rather than sliced. Slicing a JSON document
    // yields a truncated one that no longer parses, which would break every
    // downstream structured consumer for exactly the entries most likely to
    // matter. The replacement keeps the three fields that are known-bounded and
    // known-safe - they are this module's own arguments, not caller context - and
    // reports the measured size in place of the context, so the entry stays valid
    // JSON, stays parseable, and still says on the record that something oversized
    // was dropped and how large it was.
    if (line.length > MAX_SERIALIZED_ENTRY_CHARACTERS) {
      return JSON.stringify({
        timestamp,
        level,
        message: safeMessage,
        contextSizeLimit: `context omitted: serialized entry was ${String(line.length)} characters, over the ${String(MAX_SERIALIZED_ENTRY_CHARACTERS)}-character bound`,
      });
    }
    return line;
  } catch (thrown) {
    return JSON.stringify({
      timestamp,
      level,
      message: safeMessage,
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
 *
 * This function is deliberately UNGUARDED, and it stays that way. It is a sink
 * like any other, and a sink that swallows its own failure hides that failure
 * from the guard around the call. `process.stdout.write` can fail
 * SYNCHRONOUSLY - a destroyed stream, a closed file descriptor - and when it does
 * the failure is caught one level up, by `emitThroughSink`, which reports it and
 * then makes exactly one direct attempt of its own.
 *
 * WHAT THIS GUARD CANNOT REACH, AND WHERE THAT IS HANDLED INSTEAD. On a
 * pipe-backed stream a broken pipe is not a synchronous failure at all: the write
 * is dispatched successfully and the `EPIPE` arrives later as an `'error'` event
 * on the socket. No `try` around this call can intercept that, and an unhandled
 * `'error'` event is rethrown by `EventEmitter` as an uncaught exception. That
 * case is answered by `absorbAsynchronousStdoutFailure`, registered once below.
 * The two mechanisms are complementary rather than alternative, and both are
 * required: this call stays bare so synchronous failures are still REPORTED,
 * while the listener stops asynchronous ones from killing the process.
 */
function writeLineToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Answer an asynchronous failure of the stdout stream, and deliberately do
 * nothing else.
 *
 * The body is empty on purpose, and the reason is not indifference: on the only
 * path that reaches here, THE OUTPUT CHANNEL IS THE THING THAT FAILED. There is
 * no second channel to escalate to. Writing the failure back to `process.stdout`
 * would attempt the very write that just failed, and would keep failing for the
 * rest of the process's life on a pipe whose reader is gone. Writing it to
 * stderr would break a documented property of this module - every level shares
 * one stream, and stderr carries nothing during normal operation - and it would
 * do so at the moment a consumer is least able to make use of a second stream.
 * Rethrowing, or letting the event go unhandled, is what the defect was.
 *
 * So the event is consumed and the process continues. Registering ONE listener is
 * what turns a fatal unhandled `'error'` event into a handled one; that is the
 * entire mechanism, and it is the whole of what this function has to accomplish.
 *
 * The parameter list is empty although the event carries an `Error`: reading it
 * would only invite the temptation to publish it, and a stream error's message
 * carries the same free text every other error message does.
 */
function absorbAsynchronousStdoutFailure(): void {
  // Intentionally empty. See the reasoning above. Exactly three blocks in this
  // module are deliberately empty and no more: this body, the guard in
  // `absorbAsynchronousStdoutFailures` immediately below, and the `catch` in
  // `writeLineDirectly`. Each is empty for the same reason - either the output
  // channel is already gone, or the code runs before any caller exists to report
  // to - and each says so at the point where it is empty.
}

/**
 * Register the absorber on `process.stdout`, once, at module load.
 *
 * THREE PROPERTIES, EACH LOAD-BEARING:
 *
 *   * IDEMPOTENT. Registration is skipped when the absorber is already among the
 *     stream's `'error'` listeners, so a module instance that is somehow
 *     evaluated more than once - or a future caller that invokes this directly -
 *     cannot accumulate listeners. Identity of the named function is the test,
 *     which needs no marker property on the stream and no state outside it. Two
 *     genuinely separate module instances in one process (a bundled copy beside a
 *     source copy, say) each hold their own function identity and would therefore
 *     each register once; that is harmless by construction, because both are
 *     no-ops and one handled listener is all `EventEmitter` needs.
 *   * TOTAL. The whole body sits inside a guard. Registration reads and mutates a
 *     stream this module does not own, and on an exotic or already-torn-down
 *     stream either step can fail. A module whose IMPORT can throw would be
 *     unusable in exactly the situation it exists for - `config.ts` logging its
 *     own fatal startup error - so a failure to register is absorbed and the
 *     module loads anyway.
 *   * NARROW. This adds a listener for ONE event on ONE stream. It installs no
 *     `process` signal handler and no `exit` / `beforeExit` /
 *     `uncaughtException` / `unhandledRejection` hook: shutdown stays entirely
 *     caller-driven, which is the same judgment `connection.ts` records for the
 *     connection pool.
 */
function absorbAsynchronousStdoutFailures(): void {
  try {
    const stream = process.stdout;
    if (!stream.listeners('error').includes(absorbAsynchronousStdoutFailure)) {
      stream.on('error', absorbAsynchronousStdoutFailure);
    }
  } catch {
    // Absorbing the absorber's own installation failure. There is nothing to
    // report it through - this runs at module load, before any caller exists -
    // and a throw from here would make importing the logger fatal.
  }
}

absorbAsynchronousStdoutFailures();

/**
 * The last word: write one line to stdout and, if even that fails, stop.
 *
 * This carries the only deliberately empty `catch` on the EMISSION path - the
 * module's other one guards listener registration at load time, before any caller
 * exists - and it is empty because there is genuinely nothing left to report
 * through on this path. It is
 * reached only after a sink has already failed, and it writes to the stream
 * DIRECTLY rather than through the sink reference - that is the whole point.
 * Routing the fallback back through `sink` would re-enter the code that just
 * threw, and a sink that throws every time would then throw again from inside the
 * handler for its own failure. This function is what makes the fallback
 * non-recursive by construction rather than by convention.
 */
function writeLineDirectly(line: string): void {
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    // Intentionally empty, and intentionally last. The output channel is gone;
    // there is no second channel to escalate to and nothing a throw from here
    // could accomplish except to propagate into the caller's request handling,
    // which is precisely the failure this whole path exists to prevent.
  }
}

/** Message on the line that reports a sink failure. */
const SINK_FAILURE_MESSAGE = 'log sink failed; entry emitted through the direct fallback';

/**
 * Pre-built, structurally valid line for the case where even DESCRIBING the sink
 * failure fails.
 *
 * A frozen constant rather than something composed on demand: it is the floor of
 * the fallback chain, so it must involve no work that could itself fail.
 */
const SINK_FAILURE_FLOOR_LINE = '{"level":"error","message":"log sink failed"}';

/**
 * Describe a sink failure without letting the description throw in turn, and
 * without describing its contents.
 *
 * The class NAME only, held to the same shape test every other emitted name is.
 * A sink is caller-supplied, so its failure message is caller-derived free text
 * and carries exactly the exposure of any other message - and this line is
 * written on the fallback path, where the redaction pass has already been
 * bypassed. Naming the failure is what an operator needs; the text is not.
 */
function describeSinkFailure(thrown: unknown): string {
  if (thrown instanceof Error) {
    return safeErrorName(thrown.name);
  }
  return 'unknown sink failure';
}

/**
 * Report a sink failure and carry the entry it dropped, without throwing.
 *
 * The dropped entry travels verbatim in `droppedEntry`. It is safe to carry
 * because it has already been through `serializeEntry`, so its message is
 * sanitized and its context is redacted - nothing here re-exposes what that pass
 * removed, and the record of what would otherwise have been lost is kept.
 *
 * The composition sits inside its own guard because `describeSinkFailure` reads
 * `name` and `message` off a value the caller controls, and an accessor on a
 * hostile or merely broken `Error` subclass can throw when it is read.
 */
function writeSinkFailureLine(droppedEntry: string, thrown: unknown): void {
  let line: string;
  try {
    line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: SINK_FAILURE_MESSAGE,
      sinkFailure: describeSinkFailure(thrown),
      droppedEntry,
    });
  } catch {
    line = SINK_FAILURE_FLOOR_LINE;
  }
  writeLineDirectly(line);
}

/**
 * Hand one serialized line to the sink, and absorb the sink's failure if it has
 * one.
 *
 * This is the guarantee the module makes about itself: a logger that throws while
 * reporting a failure is worse than no logger, because the throw displaces
 * whatever the caller was doing. A sink is caller-supplied through `withSink`,
 * and the default sink writes to a stream that can break, so "the sink does not
 * throw" is not a property this module is in a position to assume - it has to
 * enforce it.
 *
 * `serializeEntry` is already total, so the line handed in here is always a
 * well-formed string. Everything that remains is the sink itself, and it is
 * wrapped. The fallback path never re-enters `sink`, and cannot throw.
 */
function emitThroughSink(sink: LogSink, line: string): void {
  try {
    sink(line);
  } catch (thrown) {
    writeSinkFailureLine(line, thrown);
  }
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

    // Serialization is total and the sink invocation is guarded, so `emit` has
    // no throwing path of its own, and the stream's asynchronous failures are
    // absorbed where they are delivered rather than left to surface as an
    // uncaught exception after this line has returned. That matters at the call
    // sites: the error mapper logs and then returns a response, and either kind
    // of failure escaping from this line would replace that response with an
    // unhandled one.
    emitThroughSink(sink, serializeEntry(timestamp, level, message, context));
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
