// ---------------------------------------------------------------------------
// slatwall-ts - structured logging
//
// One JSON object per line, written to stdout. That is the entire transport, and it is what the
// plan prescribes: "No logging library: the logger writes structured JSON to stdout, which Lambda
// captures natively." The `nodejs20.x` runtime does the capturing, so there is nothing here to
// connect, append to or flush, and no import of any kind: no third-party module, no Node built-in,
// no sibling.
//
// ★ ONE BUILT-IN IMPORT BRIEFLY STOOD HERE and is gone with the machinery that needed it. A security
// review removed the raw `LOG_LEVEL` echo, and an interim form kept a per-value suppression record
// keyed by a `node:crypto` digest; the threshold classifier now arrives PRE-RESOLVED from
// `./config.ts` through `src/handlers/bootstrap.ts`, so there is no external value left to dedup and
// no digest to take. The zero-import property this line originally recorded is restored, and it
// matters: `./config.ts` reports its own fatal misconfiguration THROUGH this module, so a sibling
// import here could close a cycle and make a cold-start abort unreportable.
//
// GUARANTEE 1 - EMISSION NEVER THROWS, AND NEITHER DOES THE STREAM BEHIND IT. Every path from
// `debug`/`info`/`warn`/`error` to the write is total: serialization is guarded, and so is the sink
// invocation, so a caller-supplied sink that throws or a `process.stdout.write` that fails
// SYNCHRONOUSLY is absorbed and reported through a fallback that writes to the stream DIRECTLY and
// can neither re-enter the failing sink nor throw. Call sites log and then return, so a throw
// escaping a log call would displace that return and turn a handled error into an unhandled one.
//
// A synchronous guard is not sufficient on its own. When `process.stdout` is backed by a PIPE - as
// it is under the Lambda runtime - Node reports a broken pipe (`EPIPE`) ASYNCHRONOUSLY, as an
// `'error'` event on the underlying socket long after the `try` around the dispatching call has
// exited, and `EventEmitter` rethrows an unhandled `'error'` event as an uncaught exception: the
// process dies printing a stack trace that publishes the application's absolute file path, the
// disclosure class this module scrubs. So the event is answered where it is delivered, by
// `absorbAsynchronousStdoutFailure` registered once at module load, while the write itself stays
// unguarded so synchronous failures still reach `emitThroughSink`.
//
// GUARANTEE 2 - NOTHING IS EMITTED THAT WAS NOT SANITIZED. Redaction by key NAME is necessary but
// structurally insufficient: THE KEY-NAME POLICY CANNOT SEE INSIDE A STRING, and the things worth
// protecting arrive as string CONTENT assembled at throw time - a driver error's statement text and
// the values bound into it, a credential inside a connection URI, a bearer token, an absolute
// deployment path in a stack frame, a host or account name. THAT SENTENCE IS THE REASON FOR EVERY
// CONTENT RULE BELOW AND IS NOT RESTATED AT EACH ONE. So the message and every string reachable in
// the context go through content sanitization, and an `Error` is never emitted as its raw
// `name`/`message`/`stack` triple but reduced to a closed safe summary.
//
// THREE BOUNDS - depth, breadth and serialized size - keep the traversal and the emitted line
// finite on a path whose whole purpose is to be safe to call from a `catch` arm. Each bounds the
// work; none is a tuning knob and none encodes a target of any kind. Stated once here for all
// three.
//
// THREE DELIBERATELY EMPTY BLOCKS, AND NO MORE: the body of `absorbAsynchronousStdoutFailure`, the
// guard in `absorbAsynchronousStdoutFailures`, and the `catch` in `writeLineDirectly`. Each is
// empty because the output channel is already gone and a throw could only propagate into the
// caller's request handling, or because the code runs at module load before any caller exists - and
// each says so at the point where it is empty.
//
// LEGACY PROVENANCE. The CFML application had no logger module. It called the engine built-in
// `writeLog()` directly, with unstructured plain text, into a CF log file named "Slatwall". All
// four call sites:
//
//     Application.cfc:L93   "General Log - Default Data Has Been Confirmed"
//     Application.cfc:L97   "General Log - Setting Cache has been cleared"
//     Application.cfc:L101  "General Log - Update Service Scripts Have been Run"
//     Application.cfc:L107  "General Log - Integrations have been updated"
//
// None carries a severity, a timestamp field or a structured payload, so this module replaces a
// framework facility rather than porting a component. The `file="Slatwall"` log-NAME concept is
// dropped: under Lambda there is one stdout stream per invocation and no log file, so no `logFile`
// or `logName` option is offered.
// ---------------------------------------------------------------------------

/**
 * Severity of a single entry. Closed at four values, matching the accepted values documented for
 * `LOG_LEVEL` in `.env.example`, which records that this level is the only logging control there
 * is.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured payload accompanying an entry. Values are `unknown` rather than a loose `any`: the
 * serializer narrows each one explicitly, and a value JSON cannot represent is described rather
 * than silently dropped.
 */
export type LogContext = Readonly<Record<string, unknown>>;

/**
 * Destination for one already-serialized entry. The line arrives WITHOUT a trailing newline -
 * terminating it belongs to the sink. That split lets a test collect entries as clean parseable
 * strings while the default sink still emits exactly one newline-terminated line per entry.
 */
export type LogSink = (line: string) => void;

/**
 * The emitting surface. Level method names are idiomatic TypeScript because helpers inside
 * `src/lib/` are internal; the verbatim legacy CFML method names are the acceptance contract for
 * the service and entity layers, not for this one.
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
   * A sibling logger with the threshold pinned, taking precedence over the adopted one. Exists so
   * every filtering branch is deterministically drivable.
   */
  withLevel(level: LogLevel): Logger;
  /**
   * A sibling logger writing to `sink` instead of stdout. Exists so emission is interceptable
   * without patching a global stream.
   */
  withSink(sink: LogSink): Logger;
}

/**
 * The process-wide logger: everything a {@link Logger} does, plus the one seam by which validated
 * configuration reaches this module.
 *
 * ★ THIS TYPE EXISTS SO THAT THE SEAM IS NARROW. `./config.ts` owns `LOG_LEVEL` and this file
 * imports nothing, so the resolved threshold has to be handed over by whoever holds both - which is
 * `src/handlers/bootstrap.ts`, and only it. Declaring the setter on a SUPERTYPE of `Logger`, rather
 * than on `Logger` itself, means the exported binding carries it while every logger derived from it
 * and every injected-logger parameter in the subtree does not. That is what keeps a process-wide
 * mutator out of the hands of the eight modules that log.
 */
export interface ProcessLogger extends Logger {
  /**
   * Adopt the emission threshold resolved by `./config.ts`, for the remaining life of the process.
   *
   * Called once, by the composition root, immediately after it resolves configuration and before it
   * wires anything that logs. Idempotent, total, and deliberately without a return value: there is
   * nothing to report, because there is nothing this can reject - the argument is already a member
   * of the closed union, having been validated and case-folded by configuration.
   *
   * @param level the validated threshold, or `undefined` to restore {@link DEFAULT_LOG_LEVEL}. The
   *   `undefined` case is what a test uses to leave no residue behind it, and what a composition
   *   root would use if it were ever torn down; it is not a way to express "use the default level"
   *   in configuration, which is spelled by leaving `LOG_LEVEL` unset.
   */
  adoptConfiguredThreshold(level: LogLevel | undefined): void;
}

/**
 * Threshold applied until a configured one is adopted, and whenever the adopted one is cleared.
 *
 * Deliberately a literal rather than a read of `LOG_LEVEL`: this module reads NO environment
 * variable - see the threshold-resolution section - and this value is the floor that keeps a process
 * loggable before `src/handlers/bootstrap.ts` has resolved configuration at all. It must stay equal
 * to `DEFAULT_LOG_THRESHOLD` in `./config.ts`, which documents the same obligation from its side.
 */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * Ordered severity, so filtering is one comparison rather than a chain of conditionals. The keys
 * are the closed union, so an index into this map never widens under `noUncheckedIndexedAccess`.
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
// The value held under any key the policy matches is replaced with `REDACTED` before serialization,
// and there is deliberately NO option to switch that off and no diagnostic mode that reinstates any
// of it. Every entry below is written in NORMALIZED form - lowercase, letters and digits only -
// because that is the form `normalizeKey` produces and therefore the only form that can match.
// Matching ignores case and the separators `_`, `-` and whitespace, because CFML struct keys are
// case-insensitive and this code base carries that forward.
//
// THE POLICY FAILS CLOSED: the default outcome for a key nobody enumerated is REDACTION. Matching
// only the exact normalized key decided that the wrong way round: runtime testing found forty-six
// unlisted spellings going out in cleartext. Four rules now apply in a fixed order:
//
// THE FOUR NEVER-LOG RULES ARE THE FLOOR, NOT THE WHOLE POLICY, and the
// distinction is the single most important thing to understand about this file.
// The rules below say which names are FORBIDDEN. They are matched against two
// different surfaces that want opposite defaults, and only one of the two is
// decided by them alone:
//
//   * A CONTEXT KEY - a member of the caller's context object - is decided by
//     `redactMember`, which FAILS CLOSED: after the four rules have had their
//     say, a scalar is emitted only if an allow-list authorized its name or its
//     shape cannot carry a payload. See `isLegibleContextKey`,
//     `isSelfPolicingContextValue` and the ★ note on `redactMember`.
//   * A `word=value` PAIR INSIDE A STRING - a log call's own message, or a
//     thrown error's text - is decided by `redactSensitiveAssignments`, which
//     stays PERMISSIVE by default. It has to: inverting the default there would
//     redact `status: active` and half the ordinary prose in every line. The
//     four rules are the entire policy on that surface, which is why their
//     narrowness is asserted against messages rather than against context.
//
// Both surfaces have been widened once already, in the same direction and for
// the same reason.
//
// FIRST, THE RULES THEMSELVES DID NOT ALWAYS REACH A NEAR MISS.
// An earlier revision matched ONLY the exact normalized key. Runtime testing
// found forty-six spellings going out in cleartext - `dbPass`, `dbSecret`,
// `secretKey`, `signingKey`, `jwtSecret`, `mysqlUser`, `awsSecretAccessKey`,
// `passwordHash` and the rest - and the list was internally inconsistent in a
// way no reader could have predicted: `dbpassword` was listed but `dbpass` was
// not, `clientsecret` was listed but `secretkey` was not, `bearertoken` was
// listed but `bearer` was not. A caller who reached for a near-miss name got no
// warning of any kind, and the disclosure was invisible in review because the
// surrounding code is scrupulous about non-disclosure. Rules 3 and 4 were added
// to close that, and they claim MORE than the exact name:
//
// A FIFTH SET, WITH DIFFERENT SEMANTICS: OPAQUE CONTAINERS. `headers`, `env`, `config`, `body`,
// `payload` and their siblings name a CONTAINER, so the rule follows the SHAPE of the value: a
// plain object or array is RECURSED and each child policed on its own name, while a SCALAR is
// redacted because a header map, an environment dump or a body flattened into one string is an
// opaque blob no key-name rule can see into. See `redactPlainObject`.
//
// The structural limit of any key-based policy is stated in guarantee 2 of the module header, and
// one kind of free text arrives here routinely: a thrown error's `message` and `stack`. That gap is
// closed structurally - an error is SUMMARIZED, never traversed. See `normalizeError`.
//
// SECOND, AN UNENUMERATED CONTEXT KEY WAS STILL EMITTED, and that is what the
// fail-closed context rule fixed. Rules 1 to 4 answer "is this name known to be
// sensitive", so their own default is EMISSION - correct for message prose, and
// wrong for a named value. Runtime testing found `x-forwarded-for`, `x-real-ip`,
// `mnemonic` and `recoveryPhrase` published beside an `authorization` that was
// correctly redacted: a client address and an account-recovery secret, emitted
// because nobody had listed those particular spellings. Enumerating them was
// necessary - they are now exact entries above - but it could not be sufficient,
// because the next name nobody listed would have gone out the same way. So
// `redactMember` inverts the default for context keys, and the two allow-lists
// (`LEGIBLE_IDENTIFIER_KEYS`, `LEGIBLE_DIAGNOSTIC_KEYS`) became the statement of
// what MAY be published rather than a set of exceptions to what may not.
// ---------------------------------------------------------------------------

/** Anything that authenticates or authorizes a caller. */
const CREDENTIAL_KEYS: readonly string[] = [
  'password',
  'passwd',
  'pass',
  'pwd',
  'passphrase',
  // ACCOUNT-RECOVERY SECRETS. A recovery phrase is a credential in the strongest
  // sense available - it reconstructs an account outright, without needing the
  // password it replaces - yet none of these spellings reads like a password to a
  // reader enumerating password spellings, which is exactly why runtime testing
  // found `mnemonic` and `recoveryPhrase` going out in cleartext.
  'mnemonic',
  'seedphrase',
  'recoveryphrase',
  'backupphrase',
  'recoverycode',
  'recoverykey',
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
  // An OAuth client identifier. Semi-public by design, and listed anyway: it is one half of a
  // client-credentials pair and identifies the integration rather than any business object here.
  'clientid',
];

/**
 * Anything describing how to reach the database. The first four names mirror the values the legacy
 * application published at Application.cfc:L78-L87 - the datasource name, its connecting account
 * and that account's credential. Their NAMES are listed here so their VALUES can never be emitted.
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
  // ★ THE TWO BARE SPELLINGS, ADDED BECAUSE THE TWO SURFACES DISAGREED ABOUT THE SAME NAME. QA
  // testing found `logger.error('user=root')` and `'username=root'` emitted in CLEARTEXT while
  // `'dbUser=root'` was redacted and the CONTEXT key `user` was redacted - the context surface fails
  // closed, so it withheld a name `isForbiddenKey` did not claim. `src/lib/config.ts` states "No value
  // of DB_HOST, DB_USER or DB_PASSWORD is echoed above, by design" and `CompositionDiagnostics`
  // redacts `user`, so the policy already classified this name; only the message surface had not been
  // told.
  //
  // THEY ARE EXACT ENTRIES (rule 2) AND DELIBERATELY NOT FRAGMENTS (rule 3). A `user` FRAGMENT would
  // claim `userID` - an opaque platform handle the policy publishes on purpose - and while rule 1's
  // allow-list is consulted first and would keep `userid` legible, it would also claim `userAgent`
  // (already listed as personal data) and every future `userSomething`. An exact name claims exactly
  // the bare spelling, which is the one that was leaking. The note beside `userid` in
  // `LEGIBLE_IDENTIFIER_KEYS` records the same decision from the other side.
  'user',
  'username',
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
 * THE POSTURE, STATED EXPLICITLY: a natural person's NAME, POSTAL ADDRESS and NETWORK ADDRESS are
 * personal data in exactly the way an email address is, and none is a diagnostic this port needs.
 * `name` alone is deliberately NOT listed: `brandName` and `productName` are catalog labels, so the
 * person-specific spellings are enumerated instead.
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
  // THE PROXY AND CDN SPELLINGS OF A CLIENT ADDRESS, which are the ones that
  // actually reach a log line behind API Gateway. The five names above are what
  // application code invents for itself; these are what the infrastructure puts
  // in a forwarded header map, and only these appear when a caller logs one.
  // Runtime testing found `x-forwarded-for` and `x-real-ip` emitted in cleartext
  // for precisely that reason - the concept was listed, the wire spelling was not.
  'xforwardedfor',
  'xforwarded',
  'xoriginalforwardedfor',
  'forwardedfor',
  'forwarded',
  'xrealip',
  'xclientip',
  'trueclientip',
  'cfconnectingip',
  'fastlyclientip',
  'sourceip',
  // A PRODUCT REVIEW'S AUTHOR IS A CUSTOMER'S NAME. Reviews are out of scope for
  // the ported slice - `processProduct_addProductReview` is a pass-through to a
  // stub port - so no in-scope path logs this today. Naming it anyway states that
  // the redaction is BECAUSE IT IS A PERSON, rather than leaving it to the
  // fail-closed default, where a later allow-list edit could reverse it without
  // anyone noticing that a person's name was what got authorized.
  'author',
  'authorname',
];

/**
 * Whole aggregates. A full order, customer or account payload is never emitted, so the
 * aggregate-shaped key itself is redacted while the opaque identifier beside it - `orderID`,
 * `accountID` - survives exact matching and stays legible.
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
 * A driver hangs the failing statement, and often the values bound into it, off the error object it
 * throws - `mysql2` populates `sql`, `sqlMessage`, `sqlState`, `code` and `errno`. A statement is
 * the one payload that can carry a credential, a card number and a whole aggregate at once, in a
 * single string no key-name policy can see into. These names are also the explicit suppression list
 * applied to a thrown `Error`'s own fields; see `normalizeError`.
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
  // The two bare spellings, listed for the same reason as their qualified siblings above: in this
  // port a `params` or `values` member alongside a statement IS the bound parameter list, the shape
  // `mysql2` takes and `getPreparedStatementExecutor` passes. They are NOT treated as opaque
  // containers, because recursing would publish exactly those values one element at a time.
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
 * Rule 1 of the policy, and the reason a fail-closed default is affordable at all. Every entry is
 * an OPAQUE IDENTIFIER: a 32-character UUID-backed primary key, or a correlation identifier minted
 * by the platform. The list is CLOSED and enumerated rather than derived from a suffix rule such as
 * "anything ending in ID": a derived rule would silently admit the next `apiKeyID`-shaped name
 * someone invents.
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
  // An end-user identifier, which is an opaque handle exactly like `accountID`
  // beside it. The `user` fragment is deliberately absent from rule 3 for this
  // name's sake; listing it here says so in the one place that decides.
  'userid',
  // Platform correlation
  'requestid',
  'correlationid',
  'traceid',
  'invocationid',
  'awsrequestid',
]);

/**
 * The keys authorized to carry a NON-SENSITIVE DIAGNOSTIC in a context object.
 *
 * The second allow-list, and the one that makes a fail-closed context surface
 * affordable. `LEGIBLE_IDENTIFIER_KEYS` above answers "which opaque handles stay
 * legible"; this set answers "which named scalars a caller may state in the
 * clear". Every entry is a name whose VALUE cannot be customer data by nature: a
 * response category, a status code, a row count, a currency code, a duration.
 *
 * TWO PROPERTIES DISTINGUISH IT FROM THE IDENTIFIER LIST, and both are
 * deliberate:
 *
 *   * IT DOES NOT OVERRIDE THE NEVER-LOG POLICY. `isLegibleContextKey` is
 *     consulted only after `isForbiddenKey` has declined the key, so a name that
 *     appeared in both sets would be REDACTED. The identifier list is rule 1 and
 *     wins outright; this one is a weaker authorization, because its entries are
 *     ordinary vocabulary rather than 32-character primary keys, and a weaker
 *     authorization must lose to an explicit denial rather than beat it.
 *   * IT IS CLOSED, AND SHORT ON PURPOSE. Every entry is a name this service
 *     emits today or a header/environment name it may legitimately forward, and
 *     each group below records which. A name that appears only in a test is NOT
 *     added: widening a security allow-list to keep a demonstration green is how
 *     an allow-list stops meaning anything.
 *
 * The register of names DELIBERATELY NOT HERE, because the question comes up:
 * `port` is refused because `src/repositories/mysql/connection.ts` documents a
 * database name and port together as reconnaissance rather than diagnostics, and
 * declines to log them itself; `bypassFlag`, `cacheKey`, `keyCount` and
 * `compassHeading` are refused because they are near-miss NAMES used to show that
 * rules 3 and 4 stay narrow, and that property is asserted where it still
 * applies - against message CONTENT, where the default remains permissive - not
 * by authorizing them here.
 */
const LEGIBLE_DIAGNOSTIC_KEYS: ReadonlySet<string> = new Set([
  // Published by `src/handlers/errorMapper.ts` on every mapped failure. Redacting
  // any of these would blind the one surface that reports a request went wrong.
  'category',
  'statuscode',
  'route',
  'fieldpaths',
  'invalidrequestreason',
  'missingmethodname',
  'classname',
  'thrownshape',
  'errorcode',
  'thrownat',
  'publishedissuecount',
  'issuecount',
  // ★ `fieldissuecount` IS WHAT `invalidRequestResponse` EMITS IN PLACE OF ITS FIELD PATHS. A security
  // review found (MAJOR, CWE-209/CWE-532) that the paths that arm published could be assembled from a
  // CALLER's own key names, so the paths were withdrawn from the line and a count took their place. A
  // count is a number: it cannot carry submitted material, which is the same ground the two counts
  // above are admitted on. `fieldpaths` STAYS admitted because the schema-validation arm still emits
  // it, and every path THAT arm produces is read from a validator issue's schema-authored `path`.
  'fieldissuecount',
  // ★★ THE TWO THAT REPORT THIS MODULE'S OWN THRESHOLD, ADDED FOR QA-I7 AND SINCE NARROWED. Both
  // are admitted on the test this set applies to everything else - that the VALUE CANNOT BE CUSTOMER
  // DATA BY NATURE - and both are now CLOSED LITERALS from compile-time unions:
  //
  //   * `thresholdinforce` is one of `debug`, `info`, `warn`, `error`, from the `LogLevel` union
  //     here, which is the same ground the capability handlers' closed literals below are admitted
  //     on.
  //   * `logthresholdsource` is one of `configured`, `defaulted-unset`, `defaulted-unrecognized`,
  //     from the `LogThresholdSource` union in `./config.ts`. It is emitted by
  //     `src/handlers/bootstrap.ts` when a mistyped `LOG_LEVEL` was coerced.
  //
  //   ⚠ IT REPLACES `configuredloglevel`, WHICH IS REMOVED, AND THE REMOVAL IS THE WHOLE POINT.
  //     That name carried a value that ORIGINATED OUTSIDE this process, and it was admitted on the
  //     argument that this module policed the value's SHAPE before writing it: "the only two things
  //     that ever appear under it are a token matching `[A-Za-z0-9_.-]{1,32}` or the literal
  //     `unsafeValue`". A review found the shape argument backwards - that pattern is also the shape
  //     of an access key, a short bearer token and a password, so the policy decided WHETHER to
  //     publish an operator-supplied secret rather than never publishing one. The echo is gone (see
  //     the QA-I7 section), so under this block's standing rule - a name nothing in `src/` emits does
  //     not belong in an allow-list that describes what this service logs - the name goes with it.
  //     A classifier drawn from a closed union is not the same case: there is no external value left
  //     to police.
  //
  //   * `thrownat` above is admitted on the closed-shape terms too: a stack frame's function name,
  //     code-authored and held to a classifier shape by `src/handlers/errorMapper.ts` before it is
  //     emitted.
  'logthresholdsource',
  'thresholdinforce',
  // ★★★ THE CAPABILITY HANDLERS' OWN DIAGNOSTICS, ADMITTED AFTER A MEASURED
  // FAILURE. Security review (finding F7) found that the five Lambda entrypoints
  // publish operation and outcome fields under names no allow-list carried, so
  // rule 5 - the fail-closed arm - replaced every one of them with the redaction
  // marker. The result was a line that recorded THAT a request was served while
  // withholding WHICH capability served it, WHICH operation ran and HOW it came
  // out: precisely the diagnostics an operator reads a line for, erased by a rule
  // meant for customer data.
  //
  // EVERY NAME BELOW IS ADMITTED ON THE SAME TEST THE REST OF THIS SET APPLIES -
  // its VALUE CANNOT BE CUSTOMER DATA BY NATURE, whatever a caller sends. Each is
  // either a CLOSED LITERAL drawn from a compile-time union in `src/handlers/`, a
  // BOOLEAN, or a COUNT of items handled in this one invocation. None can carry a
  // name, an address, a credential, a monetary amount, a submitted document or a
  // statement.
  //
  // AND THE SET IS DELIBERATELY NOT WIDENED FURTHER; the refusals matter more than
  // the admissions:
  //   * `idempotencykey` is REFUSED. It is a CALLER-CHOSEN FREE STRING, so its
  //     value is whatever a caller decided to put in it, and admitting it would
  //     publish arbitrary caller text under an authorized name. It stays under
  //     rule 5. (Findings F5 and F6 withdrew the two mechanisms that logged it, so
  //     nothing in `src/` emits it at all now.)
  //   * `pagerecordsshow` and `recordcount` are REFUSED because no line in this
  //     service emits them. This block's standing rule - "a name that appears only
  //     in a test is NOT added" - applies equally to a name that appears only in a
  //     proposal.
  //   * `skuselectorrefusal` WAS admitted here and has been REMOVED under the same
  //     standing rule. It named the refusal token that `priceResolutionHandler`
  //     emitted on its OWN `warn` line before calling `invalidRequestResponse`,
  //     which logged the same refusal a second time; finding F14 removed that
  //     duplicate emission and finding F3 removed the error class behind it - the
  //     product-name search that could be ambiguous at all. Nothing in `src/`
  //     emits the name now, so it does not belong in an allow-list that exists to
  //     describe what this service actually logs.
  // An ACCOUNT IDENTIFIER is untouched by any of this: `accountid` is authorized
  // one set above as an opaque handle, and `accountestablished` below is a BOOLEAN
  // that says whether one was established WITHOUT naming it.
  'capability',
  'action',
  'operation',
  'outcome',
  'accountestablished',
  'orderitemcount',
  'orderfulfillmentcount',
  'pricegroupintentcount',
  'promotionintentcount',
  'resolvedskucount',
  // The ported engines' own diagnostics. A discount amount is a formatted string
  // and a quantity is a count: both are order-shaped rather than customer-shaped,
  // and the out-of-scope aggregate they belong to is addressed only through the
  // opaque identifiers in the set above.
  'skucode',
  'currencycode',
  // The SAME datum as `currencyCode` above under the two qualified names a
  // CONVERSION needs, because one context object has to name both ends of it and
  // cannot spell either of them `currencyCode`. Admitting these concedes nothing
  // the entry above has not already conceded: a three-letter ISO currency code is
  // published on every storefront that quotes a price in it.
  //
  // `src/handlers/bootstrap.ts` publishes exactly this pair when a conversion
  // passes through unconverted - finding S-20's observability half. The amount is
  // deliberately NOT here: it is a customer's price, and the codes are the whole
  // operator-actionable signal without it.
  'originalcurrencycode',
  'converttocurrencycode',
  'amounttype',
  'discountamount',
  'quantity',
  'passedqualification',
  // Catalog labels, which are storefront-public by definition. `name` is
  // deliberately not a fragment for exactly these three.
  'brandname',
  'productname',
  'optiongroupname',
  // Operational timing and volume. A timestamp, a duration, an attempt count and
  // a row count describe THIS INVOCATION rather than anything in it.
  'occurredat',
  'startedat',
  'completedat',
  'durationms',
  'elapsedms',
  // An ELAPSED SPAN on the same footing as the two durations above it, differing
  // only in unit and in what it is measured from. `src/handlers/bootstrap.ts`
  // publishes it for the age of the configured currency rate table, where it is
  // the entire signal distinguishing a fresh table from a stale one; redacting it
  // would leave a staleness warning that cannot say how stale.
  'ageindays',
  'attemptcount',
  'retrycount',
  'rows',
  'rowcount',
  'affectedrows',
  'resultcount',
  // HEADER NAMES AUTHORIZED INSIDE AN OPAQUE CONTAINER. A `headers` map is
  // recursed rather than redacted, so its children need dispositions of their own;
  // these are the content-negotiation names, which describe the request's format
  // and nothing about who sent it. Every client-address spelling is refused - it
  // is an exact entry in `PERSONAL_DATA_KEYS` instead - and so is `user-agent`.
  'accept',
  'acceptlanguage',
  'acceptencoding',
  'contenttype',
  'contentlength',
  // ENVIRONMENT NAMES AUTHORIZED INSIDE AN OPAQUE CONTAINER, on the same footing:
  // the deployment coordinates an operator reading the line already knows, which
  // identify no customer and unlock nothing.
  'awsregion',
  'awslambdafunctionname',
  'awslambdafunctionversion',
  'nodeenv',
  'loglevel',
]);

/**
 * Rule 3: fragments that make a key sensitive wherever they appear inside it. Each entry is a
 * compound with no innocent meaning in English or in this domain, so a plain substring test is
 * safe.
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
 *   `auth`  - `authoredDate`, `authorityLevel`, `authoritativeFlag`. A bare
 *             `auth` fragment would redact ordinary vocabulary that merely opens
 *             with those four letters. The qualified forms `authorization`,
 *             `authtoken`, `authkey`, `authsecret`, `oauth` and `xauth` are
 *             listed instead. `author` and `authorName` were once the reason
 *             given for this omission; they are now EXACT entries in
 *             `PERSONAL_DATA_KEYS`, because a product review's author is a
 *             customer's name, so they no longer argue for anything here.
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
  // Account-recovery compounds. Unambiguous in English and in this domain, so a
  // substring test is safe and reaches `walletMnemonic`-shaped names as well.
  'mnemonic',
  'seedphrase',
  'recoveryphrase',
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
 * Rule 4: short words that are sensitive only as a WHOLE WORD of the key. These cannot be
 * substrings without redacting ordinary vocabulary, so they are matched against the key's own word
 * boundaries - the camelCase transitions, the digits and the separators `splitKeyWords` reads.
 * `dbPass` is `db` + `pass` and is redacted; `bypass` is one word and is not.
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
 * The fifth set: keys that name a CONTAINER rather than a value. A plain object or array under one
 * of these names is recursed so each child is policed on its own name; a SCALAR is redacted,
 * because a header map, an environment dump or a request body flattened into a single string is
 * opaque to every key-name rule there is. This is the shape a caller reaches for when handing over
 * "everything I have", which is exactly when the policy has to be at its strongest.
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
  // The legacy FW/1 request context, which arrived as `rc` at every controller entry point -
  // `integrationServices/google/controllers/feed.cfc:L58` takes `required struct rc`. A caller
  // porting one of those call sites is likely to keep the name.
  'rc',
]);

/**
 * Depth beyond which a nested structure is described rather than traversed, so that a deeply nested
 * or self-referential structure cannot drive unbounded recursion.
 */
const MAX_REDACTION_DEPTH = 4;

/**
 * How many array elements or object keys are traversed at any one level. The companion to
 * `MAX_REDACTION_DEPTH`, because depth alone does not bound the work: a context object four levels
 * deep is cheap, while an array of a hundred thousand elements is FLAT - every depth check passes
 * and the traversal walks the whole thing, allocating a redacted copy.
 */
const MAX_REDACTION_BREADTH = 64;

/**
 * How long a serialized entry may be before it is replaced by a bounded summary. The third
 * dimension, and the one the other two cannot cover: depth and breadth bound the SHAPE of a
 * structure, but neither bounds the SIZE of a leaf, so a single string property holding a
 * multi-megabyte payload sits at depth one and breadth one. Checked on the finished document, where
 * the true size is known.
 */
const MAX_SERIALIZED_ENTRY_CHARACTERS = 16384;

/**
 * Lowercase, then drop everything that is not a letter or a digit, so `apiKey`, `API-KEY`,
 * `api_key` and `Api Key` all collapse onto the single entry `apikey`.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Where one word of a key ends and the next begins. Three boundaries covering every spelling
 * convention this port meets: an explicit separator, a lower-to-upper camelCase transition
 * (`dbPass`), and the tail of an acronym run followed by a capitalized word (`AWSSecretKey`).
 */
const KEY_WORD_BOUNDARY_PATTERN = /[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

/**
 * Split a key into its lowercase words for rule 4. Empty fragments are dropped, so a leading,
 * trailing or doubled separator cannot produce an empty word that would match nothing.
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
 * Answers ONE question - "is this name known to be sensitive" - so its own answer
 * for an unrecognized name is `false`, and that is not a claim that the name will
 * be emitted. Every rule that can claim a key is written to claim MORE than the
 * exact name, because the failure mode of the earlier exact-match-only version was
 * that an unenumerated credential name was emitted with no signal of any kind.
 *
 * WHERE THE FAIL-CLOSED DEFAULT LIVES, AND WHY NOT HERE. For a CONTEXT KEY it
 * lives in `redactMember`, which redacts anything this function declines unless an
 * allow-list or the value's own shape authorizes it. It cannot live here, because
 * this function is also called by `redactSensitiveAssignments` on string CONTENT,
 * where a permissive default is required: a message reading `status: active` must
 * survive intact, and inverting the default here would redact the value in every
 * `word=value` pair in every message. Two surfaces, two defaults, one matcher.
 *
 * Total by construction: every operation is a string test or a set lookup, so
 * there is no throwing path. It runs inside the emission path that must never
 * throw, and rule 1 is what keeps `productID=abc123` legible inside a message as
 * well as inside a context object.
 */
function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized.length === 0) {
    // A key made entirely of separators normalizes to nothing: no name to police, so nothing to
    // match. The VALUE still goes through `redactValue` like any other.
    return false;
  }
  // Rule 1. The allow-list wins outright, before any rule that could claim the key.
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
 * Whether a key names a container whose treatment depends on the shape of its value. Consulted only
 * after `isForbiddenKey` has declined the key, so a name that is both - `requestBody` is a
 * container, `bindParams` is forbidden outright - is decided by the stricter rule.
 */
function isOpaqueContainerKey(key: string): boolean {
  return OPAQUE_CONTAINER_KEYS.has(normalizeKey(key));
}

/**
 * Whether a CONTEXT key is authorized to carry a value in the clear.
 *
 * The positive half of the fail-closed context rule, and the reason it is a
 * separate function rather than an extra arm of `isForbiddenKey`: that function is
 * ALSO applied to string CONTENT by `redactSensitiveAssignments`, where the
 * default must stay permissive so that ordinary prose - `status: active`,
 * `productID=abc123` - survives inside a message. Inverting the default there
 * would redact half of every log line's own text. The two surfaces genuinely want
 * opposite defaults, so they get two functions, and `redactMember` is the only
 * caller of this one.
 *
 * Both allow-lists are consulted, because both authorize the same thing at
 * different strengths: an enumerated opaque identifier, or an enumerated
 * non-sensitive diagnostic. A container name is authorized too - its children are
 * each decided by this same rule, so admitting the parent concedes nothing.
 *
 * Total: three set lookups on a normalized string, no throwing path.
 */
function isLegibleContextKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    LEGIBLE_IDENTIFIER_KEYS.has(normalized) ||
    LEGIBLE_DIAGNOSTIC_KEYS.has(normalized) ||
    OPAQUE_CONTAINER_KEYS.has(normalized)
  );
}

// ---------------------------------------------------------------------------
// String-content sanitization
//
// A key-name policy can only protect a value that arrived under a name - guarantee 2 of the module
// header. The two highest-volume string channels in this service carry no key at all: a log call's
// own `message`, and a thrown error's `message` and `stack`. `errorMapper.ts` reaches this module
// with `error: <the raw thrown value>` on its unrecognized arm.
//
// Every rule below is therefore applied to string content, not key names, and each is deliberately
// narrow enough to state what it does and does not catch.
// ---------------------------------------------------------------------------

/** Substituted for a statement, because a statement cannot be partly scrubbed. */
const SQL_REDACTED = '[SQL REDACTED]';

/** Substituted for an absolute filesystem path. */
const PATH_REDACTED = '[PATH REDACTED]';

/** Appended when a string is cut to `MAX_LOGGED_TEXT_LENGTH`. */
const TRUNCATION_MARKER = '...[truncated]';

/**
 * Length beyond which a string is cut, bounding how much text this module will emit from any single
 * string so that a whole statement, document or stack cannot arrive as one value.
 */
const MAX_LOGGED_TEXT_LENGTH = 512;

/**
 * Statement shapes, matched case-insensitively - the arms that need no help.
 *
 * Every arm requires a STATEMENT SHAPE rather than a keyword sequence: the object being acted on,
 * and the syntax that must follow it. Two keywords in sequence sounds specific and is not - it
 * replaced ordinary sentences wholesale, and this rule SHORT-CIRCUITS and replaces the ENTIRE
 * string, so a false positive here is the most expensive one in the module. `insert into <object>`
 * must be followed by a column list, `values`, `set` or a sub-`select`;
 *   `update <object> [alias] set <column> =`
 * requires the assignment, which rejects "update the pricing set for this price group";
 *   `delete from <object>`
 * must be followed by end-of-statement or a clause; a DDL verb must name both an object type and an
 * object. `union [all] select` stays a bare keyword pair on purpose: it is the canonical injection
 * signature, does not occur in English, and is the one place a false positive is the acceptable
 * direction of error. The object matcher accepts an optional quote or bracket and an optional
 * `schema.object` qualifier, and exactly ONE reference, which is what keeps "the cart" out.
 */
const SQL_OBJECT_REFERENCE =
  '[`"[]?[A-Za-z_][\\w$]{0,63}[`"\\]]?(?:\\s*\\.\\s*[`"[]?[A-Za-z_][\\w$]{0,63}[`"\\]]?)?';

/** An optional single alias token, as `FROM t alias` and `UPDATE t alias SET` allow. */
const SQL_OPTIONAL_ALIAS = '(?:\\s+(?:as\\s+)?[A-Za-z_]\\w{0,31})?';

/**
 * A determiner may not stand where a table name is expected - the one test that separates
 *   `FROM SwSku`
 * from "from the catalog": no table in the `Sw*` schema is named `the`, `a`, `this` or `each`, and
 * English puts one of these words after "from" almost without exception. Shared by every arm that
 * reads a `FROM` target.
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
  //   (`DELETE t1 FROM SwSku t1 JOIN ...`)
  // and a plain aliased target are ordinary. Prose is kept out by the determiner veto on the target
  // rather than by the clause requirement, which an aliased sentence could otherwise satisfy.
  // ACCEPTED CONSEQUENCE: "delete records from catalog" with nothing after it is indistinguishable
  // from `DELETE FROM catalog` and is redacted. A `DELETE` with no clause carries no value, so the
  // cost is a short sentence, and erring toward withholding is the right direction here.
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
 * A projection list cannot be told apart from two English words by shape alone, because
 *   `SELECT column alias FROM t`
 * is legal SQL and "select a sku from t" has exactly that shape. POSITION is what separates them: a
 * statement begins at the start of a string, or after a statement separator, an opening quote or
 * bracket, a comma, an assignment or a colon - which is also how a driver embeds one in a message
 * and how a caller labels one. A `select` sitting mid-sentence after an ordinary word is prose, and
 * this pattern does not reach it.
 */
const SQL_SELECT_STATEMENT_PATTERN = new RegExp(
  `(?:^|[\\n\\r\\t;('"\`,=:[])\\s*select\\b[\\s\\S]{0,4000}?\\bfrom\\s+${SQL_TABLE_DETERMINER_VETO}`,
  'i',
);

/**
 * Syntax that a statement carries and a sentence does not. Required IN ADDITION to the two
 * conditions above, as a third independent test.
 *
 * ACCEPTED CONSEQUENCE, STATED PLAINLY: a bare two-identifier projection with no operator, literal,
 * placeholder, punctuation or clause - `SELECT skuCode FROM SwSku` - carries no signal and is NOT
 * redacted. It also carries no data: both tokens are schema identifiers, which this port publishes
 * in `src/repositories/mysql/sql/**` as source.
 */
const SQL_SHAPE_SIGNAL_PATTERN =
  /[*(),;?='"`]|\b\w+\.\w+|\b(?:where|join|group\s+by|order\s+by|having|limit|offset|union|values|distinct)\b/i;

/**
 * Whether a string contains something that has to be treated as a statement. The `SELECT` arm is a
 * conjunction of three independent tests rather than one pattern, which is why it is expressed
 * here.
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
 * `<identifier><separator>`, AND DELIBERATELY NOT THE VALUE THAT FOLLOWS.
 *
 * The identifier capture excludes spaces and dots, so it can only match the single token immediately
 * left of the separator: allowing spaces would let `identified by password=x` capture a name that is
 * not on the policy list, and the redaction would silently not happen.
 *
 * ★★★ QUOTE-THEN-REVISE - THIS PATTERN USED TO CONSUME THE VALUE, AND THAT WAS A BYPASS. It read
 *   /([A-Za-z][A-Za-z0-9_-]{0,63})(\s*(?:=>|=|:)\s*)(?:"[^"\n]{0,512}"|'[^'\n]{0,512}'|[^\s,;)\]}]{1,512})/g
 * so ONE match spanned a key, its separator AND its value. A key the policy does not forbid was
 * returned byte-for-byte - correctly - but the regex had already advanced past everything its value
 * covered, so a forbidden name INSIDE that span was never examined at all. QA testing found the
 * consequence with the commonest error-message shape there is:
 *
 *   'error: password=hunter2; user=root'   ->   emitted VERBATIM, password in cleartext
 *
 * because `error:` is not forbidden and its unquoted value ran to the `;`, swallowing
 * `password=hunter2` whole. `<benign-word>: password=SECRET` is exactly how a caught error reads.
 *
 * The head is matched on its own now, and the value span is computed separately by
 * {@link sensitiveValueEnd}. A non-forbidden key therefore consumes NOTHING, so the scan continues
 * inside its value and every `name<sep>value` occurrence in the string is examined.
 */
const ASSIGNMENT_HEAD_PATTERN = /([A-Za-z][A-Za-z0-9_-]{0,63})(\s*(?:=>|=|:)\s*)/g;

/**
 * The characters that end a value in prose, in a stack frame and in JSON.
 *
 * A space is NOT among them: whether a run continues across one is decided by
 * {@link VALUE_CONTINUATION_HEADS}, because that is the difference between a two-token value and a
 * value followed by a sentence.
 */
const VALUE_TERMINATORS: ReadonlySet<string> = new Set([';', ',', ')', ']', '}', '\n', '\r']);

/**
 * A new `name<sep>` pair beginning after whitespace - where one value's run has to stop.
 *
 * Without it a multi-token value would swallow the diagnostics that follow it, and the policy is
 * explicit that an opaque identifier stays legible: `token=Bearer abc requestID=xyz` must withhold
 * the material and keep the request identifier.
 */
const NEXT_ASSIGNMENT_HEAD_PATTERN = /\s[A-Za-z][A-Za-z0-9_-]{0,63}\s*(?:=>|=|:)/;

/**
 * First words after which the REST of the value is still the value.
 *
 * A single-token value is the common case and the default; these are the two shapes where stopping
 * at the first space leaves the secret behind, which QA testing measured:
 *
 *   'authorization=Bearer xyz'  ->  used to emit `authorization=[REDACTED] xyz`, so `xyz` - the
 *                                  actual bearer material - survived. `AUTH_SCHEME_PATTERN` does
 *                                  not reach it either: that rule requires eight or more characters
 *                                  of material, and a short opaque token is still a token.
 *   'sql=SELECT 1'              ->  used to emit `sql=[REDACTED] 1`. A statement is tokens, and
 *                                  `containsSqlStatement` deliberately does not claim a `SELECT`
 *                                  with no `FROM`.
 *
 * The list is CLOSED and enumerated for the same reason every other list in this file is: a derived
 * rule such as "keep consuming while the tokens look technical" would quietly eat the sentence after
 * an ordinary value.
 */
const VALUE_CONTINUATION_HEADS: ReadonlySet<string> = new Set([
  // Authorization schemes, whose material is the following token
  'bearer',
  'basic',
  'digest',
  'negotiate',
  'ntlm',
  'mac',
  // Statement heads, because a statement continues in tokens
  'select',
  'insert',
  'update',
  'delete',
  'replace',
  'drop',
  'alter',
  'truncate',
  'create',
  'grant',
  'call',
  'with',
  'show',
  'set',
]);

/**
 * How far this scanner will look for the END of a value before giving up on delimiting it.
 *
 * A STALL GUARD, and - since security finding F7/F16 - a TRIGGER FOR MASKING MORE rather than a cap
 * on how much is masked. Reaching it means "where this value ends is unknown", and
 * {@link sensitiveValueEnd} answers that by withholding the remainder of the line. It is emphatically
 * NOT the longest value that can be masked: a quoted value terminated on its own line is masked
 * whole at any length. See {@link sensitiveValueEnd} for the defect this ordering corrects.
 */
const MAX_ASSIGNMENT_VALUE_LENGTH = 512;

/**
 * `user 'account'@'host'` - the account half of a driver authentication failure.
 *
 * The canonical MySQL refusal is `Access denied for user 'slatwall'@'localhost' (using password:
 * YES)`, and QA testing found it emitted with the account name intact: the name is not an
 * ASSIGNMENT, so the `key<sep>value` scanner never sees it, and only the trailing `password: YES`
 * was masked. The QUOTED value is what makes this narrow enough to be safe - `the user requested`
 * has no quotes and is untouched - and the optional `@'host'` half is consumed too, because the
 * database host is on the never-log list beside the account.
 */
const DATABASE_ACCOUNT_PATTERN =
  /\b(user|username)\s+(?:'[^'\n]{0,128}'|"[^"\n]{0,128}")(?:@(?:'[^'\n]{0,128}'|"[^"\n]{0,128}")?)?/gi;

/**
 * The authority a driver names when it cannot reach the database.
 *
 * `connect ECONNREFUSED 127.0.0.1:3306` and `getaddrinfo ENOTFOUND db.internal` publish the DB host
 * and port - values `src/lib/config.ts` refuses to echo and `CompositionDiagnostics` redacts - in a
 * message the Lambda runtime logs by default. QA testing recorded it (INFO-1) after observing that
 * `connection.ts` deliberately re-raises driver errors unchanged, so the text reaches whatever logs
 * it. The error CODE survives, because it is the diagnostic; the target does not.
 *
 * ACCEPTED CONSEQUENCE, STATED PLAINLY: the token after one of these codes is masked whether or not
 * it is an authority, so a message reading `ENOTFOUND while resolving` loses the word `while`. These
 * codes are followed by their target by convention in Node and in `mysql2`, and erring towards the
 * host is the right direction for a rule whose subject is a host.
 */
const DRIVER_CONNECTIVITY_TARGET_PATTERN =
  /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\s+\S{1,256}/g;

/**
 * `scheme://user:secret@host` - the credential half of a connection URI, and deliberately no more:
 * the authority that follows survives, so `mysql://user:pw@db.internal:3306/Slatwall` becomes
 * `mysql://[REDACTED]@db.internal:3306/Slatwall`. Config-derived connection details never travel
 * this way in the first place - `connection.ts` logs its pool line with no context at all.
 */
const URI_CREDENTIAL_PATTERN = /:\/\/[^\s/:@]{1,128}(?::[^\s/@]{0,128})?@/g;

// ---------------------------------------------------------------------------
// Absolute paths
//
// This is what removes the private paths every stack frame carries, and it is why the stack summary
// below can keep function names: the frame's shape survives, only the location is replaced.
//
// EACH RULE REQUIRES A PATH ANCHOR, NOT MERELY A SLASH. A single pattern accepting a drive letter
// or ANY slash matches far more than it is aimed at in a language whose messages routinely contain
// a slash that is not a path, and every hit destroys the text from the slash to the next space -
// measured against ordinary diagnostics it mangled `and/or`, `verify-ca/verify-identity`,
// `TLSv1.2/1.3`, `GET /catalog/products?...` and `config/configORM.cfm:L9-L15`. So: a drive letter
// that is genuinely a drive letter; a rooted POSIX path whose first segment is a REAL filesystem
// root, so a slash beginning an HTTP route fails while `/var/task/...` does not; and a POSIX path
// of two or more segments ending in a dotted filename, catching a frame under an unenumerated root
// without accepting an extension-less route.
//
// In all three the leading slash must begin a TOKEN: the lookbehind rejects a slash preceded by a
// letter, digit, underscore, dot, backslash, colon or dash, so an infix slash is never a path, and
// without it the `s` of `https:` is a drive. A slash preceded by a slash IS accepted, so
// `file:///var/task/index.js` is caught while `https://host/docs` still fails the root test.
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
 * Segments that are filesystem roots rather than the first segment of a route: the Linux FHS roots,
 * the macOS ones, and `node_modules` - not a root, but at the head of a bundled frame often enough
 * to belong here. No application-specific segment is included; an application root is reached by
 * the dotted-filename rule instead, which needs no enumeration to keep current.
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
 * Where the line containing `start` ends - the whole remainder when there is no newline after it.
 *
 * The FAIL-CLOSED fallback for a value this scanner cannot delimit, and the reason it stops at the
 * newline rather than at the end of the text: a sanitized `stack` is many lines, and only the line
 * carrying the undelimited value is unsafe. Masking to the newline withholds all of that value and
 * keeps every later frame legible.
 *
 * Total and bounded: one native `indexOf`, no throwing path.
 */
function lineRemainderEnd(text: string, start: number): number {
  const lineEnd = text.indexOf('\n', start);

  return lineEnd === -1 ? text.length : lineEnd;
}

/**
 * Where the value that starts at `start` ends, for masking purposes.
 *
 * Returns `start` itself when there is nothing to mask - an empty value, or one already masked -
 * which is what makes this function idempotent: sanitizing an already-sanitized string leaves it
 * alone rather than nesting one marker inside another.
 *
 * ★★★ QUOTE-THEN-REVISE - THE SCAN BUDGET USED TO BE A DISCLOSURE, AND THIS IS THE CORRECTION.
 * {@link MAX_ASSIGNMENT_VALUE_LENGTH} exists so a pathological string cannot stall the scan, and the
 * previous form treated reaching that budget as though it had FOUND the end of the value: it returned
 * the budget boundary, and `redactSensitiveAssignments` then masked the first 512 characters and
 * copied the rest out VERBATIM. A secret longer than the budget therefore went out with its tail in
 * cleartext - `password="<520 characters>"` published characters 513 onward. Security review raised
 * that as a log-disclosure defect (CWE-532).
 *
 * The budget is now a TRIGGER FOR MASKING MORE, never for masking less. Two changes carry that:
 *
 *   1. A QUOTED VALUE TERMINATED ON ITS OWN LINE IS MASKED WHOLE, however long it is. The budget no
 *      longer bounds this arm, and that costs nothing: both `indexOf` calls below were already
 *      executed unconditionally for every quoted value, so the terminator's position was ALREADY
 *      known - the old form simply declined to use it once it lay past 512 characters.
 *   2. WHEN A SCAN REACHES THE BUDGET WITHOUT FINDING A TERMINATOR, the whole remainder of the line
 *      is masked through {@link lineRemainderEnd}. Withholding more than the value is the safe
 *      direction; resuming legible output inside an undelimited secret is not.
 *
 * Reaching the budget is distinguished from reaching the END OF THE TEXT: when the text is shorter
 * than the budget, the scan stopping at its final character has found a real terminus and nothing
 * extra is masked.
 *
 * Total: every branch is a bounded scan or a set lookup, so there is no throwing path. It runs
 * inside the emission path that must never throw.
 *
 * @param text the whole string being sanitized.
 * @param start the index immediately after a key's separator.
 * @returns the exclusive end index of the value to replace.
 */
function sensitiveValueEnd(text: string, start: number): number {
  // ALREADY MASKED. A caller may hand in text this module has seen before - an error's message is
  // sanitized on the way in and again if it is re-logged - and `[REDACTED]` contains a `]`, which is
  // a value terminator, so masking it again would emit `[REDACTED]]`.
  if (text.startsWith(REDACTED, start)) {
    return start;
  }

  const limit = Math.min(text.length, start + MAX_ASSIGNMENT_VALUE_LENGTH);

  // Whether a scan that stopped at `limit` was cut off by the BUDGET rather than by the end of the
  // text. Only the former leaves material unaccounted for, and only the former masks the remainder.
  const budgetCutsOffTheValue = limit < text.length;

  // A QUOTED VALUE IS ITS QUOTES AND EVERYTHING BETWEEN THEM, so a value containing spaces,
  // semicolons or brackets is masked whole - at any length. An UNTERMINATED quote, and one whose
  // closing quote lies on a LATER LINE, both fall through to the token scan rather than swallowing
  // material across a line boundary.
  const opening = text[start];

  if (opening === '"' || opening === "'") {
    const closing = text.indexOf(opening, start + 1);
    const lineEnd = text.indexOf('\n', start + 1);

    if (closing !== -1 && (lineEnd === -1 || closing < lineEnd)) {
      return closing + 1;
    }
  }

  // THE FIRST TOKEN, which is the whole value in the common case.
  let firstTokenEnd = start;

  while (firstTokenEnd < limit) {
    const character = text[firstTokenEnd] ?? '';

    if (character === ' ' || character === '\t' || VALUE_TERMINATORS.has(character)) {
      break;
    }

    firstTokenEnd += 1;
  }

  // AN UNDELIMITED TOKEN. 512 characters went by with no whitespace and no terminator, so where this
  // value ends is unknown and the rest of the line is withheld. A token this long is also not a
  // continuation head, so the check below is skipped rather than consulted on a truncated slice.
  if (firstTokenEnd === limit && budgetCutsOffTheValue) {
    return lineRemainderEnd(text, start);
  }

  if (!VALUE_CONTINUATION_HEADS.has(text.slice(start, firstTokenEnd).toLowerCase())) {
    return firstTokenEnd;
  }

  // A CONTINUATION HEAD: the material is what follows it. The run stops at the first value
  // terminator or at the next `name<sep>` pair, whichever comes first, and trailing whitespace is
  // given back so the emitted line keeps its spacing.
  const rest = text.slice(firstTokenEnd, limit);

  let stop = rest.length;

  for (let offset = 0; offset < rest.length; offset += 1) {
    if (VALUE_TERMINATORS.has(rest[offset] ?? '')) {
      stop = offset;
      break;
    }
  }

  const nextPair = NEXT_ASSIGNMENT_HEAD_PATTERN.exec(rest);

  if (nextPair !== null && nextPair.index < stop) {
    stop = nextPair.index;
  }

  // THE CONTINUATION RUN HIT THE BUDGET TOO. `rest` is sliced AT `limit`, so an unbroken run reaching
  // its end tells us nothing about where the material stops - `stop` is then the slice's length
  // rather than a terminator's position. Same fail-closed answer as the token arm above.
  if (stop === rest.length && budgetCutsOffTheValue) {
    return lineRemainderEnd(text, start);
  }

  let end = firstTokenEnd + stop;

  while (end > firstTokenEnd) {
    const previous = text[end - 1] ?? '';

    if (previous !== ' ' && previous !== '\t') {
      break;
    }

    end -= 1;
  }

  return end;
}

/**
 * Replace the value in every `sensitiveKey <sep> value` pair, and nothing else. A pair whose key is
 * not on the policy list is returned byte-for-byte, so `orderID=4f3c...` stays legible.
 *
 * ★ IT EXAMINES EVERY PAIR IN THE STRING, INCLUDING ONE NESTED INSIDE ANOTHER PAIR'S VALUE. That is
 * the correction QA testing forced: the previous single-pass form consumed a non-forbidden pair's
 * value along with it, so `error: password=hunter2; user=root` went out in cleartext. A
 * non-forbidden key now advances the scan only past its own separator, and the value is skipped only
 * when it is actually masked.
 */
function redactSensitiveAssignments(text: string): string {
  ASSIGNMENT_HEAD_PATTERN.lastIndex = 0;

  let sanitized = '';
  let copiedTo = 0;
  let head = ASSIGNMENT_HEAD_PATTERN.exec(text);

  while (head !== null) {
    const key = head[1] ?? '';
    const valueStart = head.index + head[0].length;

    if (isForbiddenKey(key)) {
      const valueEnd = sensitiveValueEnd(text, valueStart);

      if (valueEnd > valueStart) {
        sanitized += text.slice(copiedTo, valueStart) + REDACTED;
        copiedTo = valueEnd;
        // Past the masked span, so a `name=value` shape INSIDE a withheld value is not matched as a
        // pair of its own - there is nothing left of it to police.
        ASSIGNMENT_HEAD_PATTERN.lastIndex = valueEnd;
      }
    }

    head = ASSIGNMENT_HEAD_PATTERN.exec(text);
  }

  return sanitized + text.slice(copiedTo);
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
 * Order matters. The statement test runs FIRST and short-circuits, because a statement is replaced
 * whole: its bound values sit inside the statement text, where no `key=value` rule can reach them,
 * so partial scrubbing would leave the interesting half behind. Everything that survives is then
 * scrubbed rule by rule and finally bounded.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it does not redact long opaque runs of alphanumerics.
 * Slatwall primary keys are 32-character UUID-backed strings, and the policy is explicitly that an
 * opaque identifier stays legible while the aggregate beside it does not. A length-based rule would
 * redact every `orderID` and `skuID` in the service to catch material the assignment, URI and
 * auth-scheme rules already name precisely.
 */
function sanitizeText(text: string): string {
  if (containsSqlStatement(text)) {
    return SQL_REDACTED;
  }

  // ★ THE ASSIGNMENT SCAN RUNS BEFORE THE URI AND SCHEME RULES, AND THE ORDER IS LOAD-BEARING. It
  // used to run after them, and QA testing found what that produced for a connection string under a
  // forbidden name: the URI rule replaced the userinfo first, leaving
  // `connectionString=mysql://[REDACTED]@h/db`, and the assignment scan then stopped its value at the
  // `]` of that marker - emitting `connectionString=[REDACTED]]@h/db`, with the host, the database and
  // a stray bracket surviving. Masking the whole value FIRST leaves the two later rules nothing to
  // find there, while a URI or a scheme that is NOT under a forbidden name still reaches them
  // untouched - `pool target mysql://user:pw@db.internal:3306/Slatwall` keeps its authority and loses
  // its credential, exactly as before.
  const withoutAssignedSecrets = redactSensitiveAssignments(text);
  const withoutUriCredentials = withoutAssignedSecrets.replace(
    URI_CREDENTIAL_PATTERN,
    `://${REDACTED}@`,
  );
  const withoutAuthMaterial = withoutUriCredentials.replace(
    AUTH_SCHEME_PATTERN,
    (_whole: string, scheme: string): string => `${scheme} ${REDACTED}`,
  );

  // The two shapes a DRIVER writes rather than a caller: a quoted account (with its host) in an
  // authentication refusal, and the target of a connectivity failure. Neither is an assignment, so
  // neither is reachable by the scan above.
  const withoutDatabaseAccount = withoutAuthMaterial.replace(
    DATABASE_ACCOUNT_PATTERN,
    (_whole: string, name: string): string => `${name} ${REDACTED}`,
  );
  let sanitized = withoutDatabaseAccount.replace(
    DRIVER_CONNECTIVITY_TARGET_PATTERN,
    (_whole: string, code: string): string => `${code} ${REDACTED}`,
  );

  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, PATH_REDACTED);
  }
  return truncateText(sanitized);
}

/**
 * Raised when the traversal meets a container that contains itself.
 *
 * A distinct TYPE rather than a generic `Error` carrying a distinguishing message, so the fallback
 * reporter can recognize this case by `instanceof` and never has to read a message off a thrown
 * value. That is what allows the reporter to be content-blind: the information is in the type,
 * where a caller cannot forge it. Module-private, and not part of any contract outside this file.
 */
class LogContextCycleError extends Error {
  constructor() {
    super('circular reference in log context');
    this.name = 'LogContextCycleError';
  }
}

/**
 * The key under which an object's breadth truncation is recorded. Bracketed, so it is not a valid
 * JavaScript identifier and cannot be confused with - or silently overwrite - a property the caller
 * supplied, matching the bracketed style of `[Function]`, `[Symbol]` and `[depth limit]`.
 */
const BREADTH_LIMIT_KEY = '[breadth limit]';

/**
 * Describe what a breadth bound left out, in counts only. Deliberately carries NO content from the
 * omitted elements - not a sample, not a first value, not a key name. The counts are what a reader
 * needs in order to know the line is incomplete; anything more reintroduces caller-controlled data.
 */
function describeBreadthLimit(omitted: number, total: number, unit: string): string {
  return `[breadth limit: ${String(omitted)} of ${String(total)} ${unit} omitted]`;
}

/**
 * True only for an object literal or a null-prototype object. A class instance, `Map`, `Set`,
 * `RegExp` or buffer is NOT plain and is deliberately not traversed: this module cannot know
 * whether such an object's internals hold a credential or a whole aggregate, and walking an entity
 * graph would defeat the never-log policy from the inside.
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
 * A JavaScript `name` is an ordinary writable property, so any value at all can end up there -
 * including a whole sentence, a stringified payload, or a credential. Only a value shaped like a
 * class identifier is emitted, because the point of the field is to say WHICH failure occurred,
 * never to carry free text. Dots are admitted so a namespaced class name survives. No `g` flag on
 * this pattern or on the error-code pattern below: both are reused, and a global regex would carry
 * `lastIndex`.
 */
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/;

/**
 * An error's `name` is a class name, so it is emitted only when it looks like one. A subclass free
 * to assign anything to `name` cannot use it as a channel.
 */
function safeErrorName(name: unknown): string {
  return typeof name === 'string' && SAFE_ERROR_NAME_PATTERN.test(name) ? name : '[Error]';
}

/**
 * The shape an error CODE may take before it is emitted. Sized to the machine tokens the pinned
 * dependency set and the Node runtime actually produce - a Node `ERR_*` / `ECONNREFUSED` code, or a
 * MySQL driver `ER_*` code. Whitespace, quotes, parentheses and every other punctuation mark are
 * excluded, which makes it structurally impossible for a SQL fragment or a sentence to pass as a
 * code.
 */
const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Substituted for a name that does not have the shape of a class identifier. */
const UNSAFE_ERROR_NAME = '[unsafe name]';

/**
 * Read a machine code off an error, or decline. Reached through `in`-operator narrowing so nothing
 * widens and no cast is needed. Declining is the default: a code is emitted only when it is a
 * string AND has the machine-token shape above.
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
 * `JSON.stringify(new Error('x'))` yields `{}`, because an Error's own fields are not enumerable.
 * Converting explicitly is the only way an error survives into the emitted line at all - but WHAT
 * survives is deliberately narrow.
 *
 * `message` AND `stack` ARE NEVER EMITTED, for the reason guarantee 2 of the module header gives; a
 * stack can carry the same content in its header line, and `stack` is itself writable, so its
 * contents are not even structurally guaranteed. Both keys are RETAINED carrying the redaction
 * marker rather than dropped: that keeps the emitted object recognizably an error rather than the
 * empty `{}` plain serialization produces, and puts the omission ON THE RECORD. What remains is
 * enough to classify a failure without describing it: the error class name, and a machine code when
 * the error carries one.
 */
function normalizeError(error: Error): Record<string, unknown> {
  const name = SAFE_ERROR_NAME_PATTERN.test(error.name) ? error.name : UNSAFE_ERROR_NAME;
  const code = readSafeErrorCode(error);
  const summary: Record<string, unknown> = { name, message: REDACTED, stack: REDACTED };
  // Omitted rather than set to `undefined`, so an error without a usable code simply has no `code`.
  if (code !== undefined) {
    summary['code'] = code;
  }
  // DRIVER FIELDS ARE NOT NAMED HERE EITHER. The shape is CLOSED: `sql`, `sqlMessage` and `values`
  // are never read, and no key derived from the error's own property names reaches the line - not
  // even as a name. That is strictly less disclosing than listing the declined keys, and it keeps
  // the emitted shape fixed, which lets a reader tell a driver error from a plain one by its
  // `code`. Those keys remain in the key-based half of the policy, which still redacts them in a
  // CONTEXT object.
  return summary;
}

/**
 * Apply the never-log policy and reshape whatever is left into something JSON can represent. Runs
 * before `JSON.stringify` so the policy reaches nested structures, not just the top level.
 *
 * `ancestors` holds the containers currently being traversed - the chain from the context object
 * down to `value`, and nothing else. Tracking ancestors rather than every object already seen
 * matches `JSON.stringify` exactly: a value referenced twice from different branches is a shared
 * reference and is rendered twice, while a value that contains itself is a cycle and is reported.
 */
function redactValue(value: unknown, depth: number, ancestors: ReadonlySet<object>): unknown {
  // JSON has no bigint and `JSON.stringify` throws when it meets one. The exact decimal digits are
  // preserved as a string: no rounding and no arithmetic, so the rule that all money arithmetic
  // passes through the domain's single arithmetic surface is untouched here.
  if (typeof value === 'bigint') {
    return value.toString();
  }
  // Neither survives `JSON.stringify` - a function- or symbol-valued property is silently omitted.
  // Describing it keeps the key visible instead of quietly losing it.
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (typeof value === 'symbol') {
    return '[Symbol]';
  }
  // A string is the one primitive that can carry a payload the key-name policy cannot see, so it is
  // the one primitive NOT passed through untouched. Sanitizing here is what makes the policy reach
  // a string nested inside the caller's context object.
  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  // Everything remaining that is not an object is a number, boolean or undefined: passed through.
  if (typeof value !== 'object') {
    return value;
  }
  if (value === null) {
    return null;
  }
  // An error is SUMMARIZED, never traversed: reduced to its class name and a machine code, with its
  // message and stack replaced by the redaction marker. See `normalizeError`. This arm is the one
  // place that closes the hole a key-based policy would otherwise leave open.
  if (value instanceof Error) {
    return normalizeError(value);
  }
  // UTC, explicitly: `toISOString()` always renders in UTC with the `Z` designator, so a date in a
  // context object cannot pick up an ambient timezone the way the legacy engine's handling did.
  if (value instanceof Date) {
    return value.toISOString();
  }
  // A container that contains itself. Reported rather than quietly truncated: a cycle means the
  // caller handed the logger a live object graph - an entity, or the order aggregate - instead of a
  // flat context, and a half-walked rendering would be presented as if it were the caller's data.
  // The throw is caught by the total guard in `serializeEntry`, so it never escapes the logger.
  if (ancestors.has(value)) {
    throw new LogContextCycleError();
  }
  // A cycle longer than the depth bound is truncated here instead, because traversal stops before
  // the repetition becomes reachable. The emitted line stays well-formed, finite and redacted.
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
 * Rebuild an array, bounded in width, recording anything it left out. The elements beyond the bound
 * are DESCRIBED rather than dropped: a silently shortened array is indistinguishable from one that
 * was genuinely that short, so a reader diagnosing an incident would draw a conclusion about the
 * caller's data from an artefact of this module.
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
 * ★ THIS IS WHERE THE CONTEXT SURFACE FAILS CLOSED, and it did not always. An
 * earlier revision ran the first two rules below and then emitted anything they
 * did not claim, which decided the question the wrong way round for a key nobody
 * had thought to enumerate. Runtime testing found `x-forwarded-for`, `x-real-ip`,
 * `mnemonic` and `recoveryPhrase` going out in cleartext beside an `authorization`
 * that was correctly redacted - the enumerated names were caught and the
 * unenumerated ones were not, which is the definition of a fail-open default. The
 * never-log sets are now the floor rather than the whole policy: a scalar reaches
 * a log line only if a name authorized it.
 *
 * Five outcomes, in order:
 *
 *   1. A key the never-log policy claims is replaced with the marker outright.
 *      The value is not traversed, not measured and not described - a description
 *      of a credential is still a statement about a credential. An explicit
 *      DENIAL beats every authorization below it.
 *   2. A key that names an OPAQUE CONTAINER, holding TEXT, is redacted: a header
 *      map, an environment dump or a request body flattened into one string can
 *      hold anything, and content sanitization is not a sufficient answer because
 *      it catches credential-SHAPED text while a bare opaque secret - a raw token
 *      with no scheme prefix - has no shape to catch.
 *   3. A key on either allow-list is emitted, value-first through `redactValue`,
 *      which still sanitizes strings, summarizes errors and enforces the depth and
 *      breadth bounds. Authorization is of the NAME; it is not a promise about
 *      what a caller put under it, and rule 1 already outranks it.
 *   4. A value that POLICES ITSELF is emitted whatever its key is - see
 *      `isSelfPolicingContextValue` for the whole argument. A plain object is the
 *      important case: it holds no data of its own, and every child of it returns
 *      to rule 1 under its own name, so `attempt: { failure: <Error> }` stays
 *      readable without `attempt` being authorized anywhere.
 *   5. ANYTHING ELSE IS REDACTED. This is the fail-closed arm, and it is reached
 *      by exactly one thing: a scalar - a string, a number, a bigint, a date -
 *      under a name no allow-list carries. The KEY is still emitted beside the
 *      marker, so the line records that the caller supplied something and stays a
 *      truthful audit record rather than a silently shortened one.
 *
 * Total, like everything else on this path: the only operations are set lookups,
 * `typeof` tests and recursive calls that are themselves total and bounded.
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
  if (isLegibleContextKey(key) || isSelfPolicingContextValue(value, MAX_REDACTION_DEPTH)) {
    return redactValue(value, depth + 1, ancestors);
  }
  return REDACTED;
}

/**
 * Whether a value is free text, and therefore capable of hiding an entire payload inside one
 * member. A `bigint` counts because it is emitted as its decimal string. Numbers, booleans, `null`
 * and `undefined` do not: whatever a caller meant by `settings: 42`, it cannot be a credential
 * dump.
 */
function isOpaqueTextPayload(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'bigint';
}

/**
 * Whether a value can be emitted under an UNAUTHORIZED key without disclosing
 * anything the key name has not already disclosed.
 *
 * The structural half of the fail-closed rule, and what keeps it from being
 * useless. A name-based allow-list can only authorize what someone enumerated, so
 * a policy built on names alone would redact every nested diagnostic a caller
 * assembles under a wrapper of its own choosing. That is not necessary, because
 * whether a value can LEAK is a property of its shape, not of its name:
 *
 *   * A PLAIN OBJECT carries no data itself. Each of its children returns to
 *     `redactMember` under its own name and is decided by these same rules, all
 *     the way down, so traversing it concedes nothing - `{ x: { ssn } }` still
 *     redacts `ssn`. This is the arm that keeps a caller's own nesting readable.
 *   * AN ERROR is reduced by `normalizeError` to a shape-validated class name and
 *     a shape-validated machine code, with message and stack replaced. The
 *     reduction is unconditional, so no key could make it unsafe.
 *   * ANY OTHER OBJECT is not traversed at all: `describeOpaqueObject` renders the
 *     constructor's name, which is an identifier from this codebase rather than
 *     anything the caller supplied.
 *   * A FUNCTION OR SYMBOL renders as the module's own `[Function]` / `[Symbol]`
 *     constant. The value is discarded, not described.
 *   * A BOOLEAN, `null` OR `undefined` cannot hold a payload. This is the line,
 *     and it is drawn where it is because whatever a caller meant by
 *     `settings: true`, it cannot be a credential - the same reasoning
 *     `isOpaqueTextPayload` already uses one function above.
 *
 * REFUSED, and each for a reason worth stating: a STRING is the canonical hiding
 * place, a NUMBER can be a card number or an account number in numeric form, a
 * BIGINT is emitted as its decimal digits and so is text by another route, and a
 * DATE renders as caller data - a date of birth is a date. Each needs a name.
 *
 * AN ARRAY IS THE ONE RECURSIVE CASE, and it is refused unless every member is
 * itself self-policing. `redactArray` calls `redactValue` directly, because an
 * array member HAS NO NAME to police - so a scalar inside an array would reach the
 * line with no rule having authorized it, and nesting the array would not change
 * that. An array of errors or of plain objects is admitted; an array containing
 * one string is not. The recursion is bounded by `budget` and answers NOT
 * self-policing when it runs out, so the fail-closed direction is also the
 * cheap one. The breadth bound matches `redactArray`, so a member this function
 * never examined is a member that would never have been emitted.
 *
 * Total: `typeof` tests, two `instanceof` tests and a bounded recursion.
 */
function isSelfPolicingContextValue(value: unknown, budget: number): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'boolean' || typeof value === 'function' || typeof value === 'symbol') {
    return true;
  }
  if (typeof value !== 'object') {
    // string, number and bigint - every one of them a leaf that needs a name.
    return false;
  }
  if (value instanceof Date) {
    return false;
  }
  if (value instanceof Error) {
    return true;
  }
  if (Array.isArray(value)) {
    if (budget <= 0) {
      return false;
    }
    return value
      .slice(0, MAX_REDACTION_BREADTH)
      .every((item: unknown) => isSelfPolicingContextValue(item, budget - 1));
  }
  // A plain object, whose children are re-decided by name; or any other object,
  // which `describeOpaqueObject` reduces to a constructor name.
  return true;
}

/**
 * Rebuild a plain object, applying the never-log policy key by key and recursing
 * into what survives, bounded in the number of keys it will walk.
 */
function redactPlainObject(
  source: object,
  depth: number,
  ancestors: ReadonlySet<object>,
): Record<string, unknown> {
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(source);

  // THE RECORD IS BUILT ON A NULL PROTOTYPE, AND CALLER KEYS ARE WRITTEN WITH `defineProperty`
  // RATHER THAN `[key] =`. Both halves are required, and the reason is a defect rather than
  // defensiveness. `{}` inherits `Object.prototype`, which still exposes the legacy `__proto__`
  // accessor, so `redacted['__proto__'] = value` CALLS THE SETTER instead of creating a property: a
  // context key literally named `__proto__` was silently discarded while every key around it was
  // recorded, and when the value was an object the setter reassigned the prototype of the record
  // being built. `Object.create(null)` removes the accessor so `__proto__` becomes an ordinary key,
  // and `defineProperty` states the intent explicitly - an own, enumerable data property - so the
  // write cannot be intercepted at all. The keys reaching here are not this port's to choose: a
  // context can be assembled from a `JSON.parse` result, which produces `__proto__` as an ordinary
  // own property.
  const redacted = Object.create(null) as Record<string, unknown>;

  // The breadth bound stays on the iteration. The null prototype governs HOW each surviving key is
  // written; it says nothing about how many are walked, so both controls apply independently.
  for (const [key, nested] of entries.slice(0, MAX_REDACTION_BREADTH)) {
    Object.defineProperty(redacted, key, {
      value: redactMember(key, nested, depth, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  if (entries.length > MAX_REDACTION_BREADTH) {
    // `BREADTH_LIMIT_KEY` is authored by this module rather than supplied by a caller, and is
    // deliberately not a valid identifier, so it can collide with neither a real property nor
    // `__proto__`. It is still written through `defineProperty` so every write into this record
    // goes through one mechanism, leaving no second, weaker path for a future edit to reach for.
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
// THIS MODULE IMPORTS NOTHING, AND THAT INCLUDES ITS SIBLING `./config.ts`. `config.ts` must fail
// hard at startup when the database dialect is unset or unrecognized, reproducing the conditional
// chain at config/configORM.cfm:L4-L7 that has no `<cfelse>` and whose failure path ends in an
// outright abort. A logger that depended on configuration could not report a configuration failure,
// so keeping the two mutually independent leaves `config.ts` free to log its own fatal error.
//
// ★★ AND THIS MODULE READS NO ENVIRONMENT VARIABLE EITHER - NOT ONE. It used to read `LOG_LEVEL`
// out of `process.env` directly, on every emission, which made the subtree's documented
// single-configuration-authority guarantee false: `config.ts` declared itself the one reader of the
// process environment while this file quietly was a second. Two things follow from removing that
// read, and both are deliberate:
//
//   * The threshold now ARRIVES. `config.ts` resolves, case-folds and classifies `LOG_LEVEL` with
//     every other variable, and `src/handlers/bootstrap.ts` - the one module that holds both - hands
//     the validated value to `logger.adoptConfiguredThreshold()` while it wires the composition
//     root. That preserves the independence in the direction that matters (this file still depends
//     on nothing) without keeping a second reader of the environment.
//   * The LENIENCY MOVED WITH IT, AND IS UNCHANGED IN EFFECT. An unset, blank or unrecognized
//     `LOG_LEVEL` still resolves to `info` and still cannot abort anything, because logging must
//     never be the thing that breaks a cold start. `config.ts` records WHICH of those three
//     happened, and the composition root announces a mistyped value once - from a fixed classifier,
//     never by echoing the value, which is what this file used to do.
//
// THE ADOPTED THRESHOLD IS MODULE-SCOPE STATE, AND THAT IS A CHANGE FROM THE PER-CALL ENVIRONMENT
// READ IT REPLACES. The earlier text warned against caching the threshold at module scope on the
// ground that a cache "would be captured once per container and frozen for its whole life, and would
// make a test suite order-dependent on whichever suite imported this module first". Being fixed for
// the life of a container is now the CORRECT behaviour rather than a hazard - process configuration
// does not change while the process runs, which is the same reasoning `config.ts` memoizes on - and
// the test-order concern is answered structurally instead of by avoidance: `vitest.config.ts` sets
// `isolate: true`, so each test file gets its own module registry and no adopted value crosses a
// file boundary, and within a file `adoptConfiguredThreshold(undefined)` restores the default. This
// is not the legacy component-cache hazard of AAP 0.6.5 either: nothing here is derived from a
// request, so there is no request's data to leak into the next one.
//
// `withLevel()` remains the per-logger override, and it takes precedence over the adopted value, so
// a suite can pin a threshold on ONE logger without touching process-wide state at all.
// ---------------------------------------------------------------------------

/**
 * The threshold adopted from validated configuration, or `undefined` before the composition root
 * has adopted one.
 *
 * Written by exactly one function - {@link ProcessLogger.adoptConfiguredThreshold} - and read by
 * exactly one - {@link resolveThreshold}. `undefined` is a real state rather than a placeholder: a
 * process that fails during configuration resolution logs its own failure BEFORE any threshold has
 * been adopted, and it logs at {@link DEFAULT_LOG_LEVEL}.
 */
let adoptedThreshold: LogLevel | undefined;

/**
 * The threshold in force for one emission, in strict precedence order: a level pinned on this
 * logger through `withLevel`, then the level adopted from validated configuration, then the
 * default.
 *
 * The pinned level wins because it is the narrower statement - it was made about this logger
 * specifically - and because a test that pins a threshold must not be at the mercy of whatever the
 * composition root adopted earlier in the same file.
 */
function resolveThreshold(pinnedLevel: LogLevel | undefined): LogLevel {
  return pinnedLevel ?? adoptedThreshold ?? DEFAULT_LOG_LEVEL;
}

// ---------------------------------------------------------------------------
// Reporting an unrecognized threshold - QA-I7, and the disclosure defect its first fix introduced
//
// ★★ THE FALLBACK STAYS; ITS SILENCE DOES NOT; ITS ECHO IS GONE. QA testing observed that
// `LOG_LEVEL=bogus` is silently coerced to `info` while every other malformed configuration key
// fails closed with a `ConfigurationError` from `./config.ts`, and rated the inconsistency cosmetic.
// Failing this key closed would have been the wrong remedy, for the reason in the section header
// above - `config.ts` reports its own abort THROUGH this module - so the first fix kept the fallback
// and announced the coercion from here, in a function that lived at this point in the file.
//
// ⚠ THAT ANNOUNCEMENT WAS ITSELF A DISCLOSURE DEFECT, AND IT IS THE REASON THIS SECTION IS NOW
// EMPTY OF CODE. To make the diagnostic actionable it ECHOED the rejected token, admitting any value
// matching `/^[A-Za-z0-9_.-]{1,32}$/` verbatim onto the log stream and RETAINING every distinct one
// in a process-global `Set` for the life of the container. A review observed that the shape it
// admitted is exactly the shape of the things most likely to be pasted into the wrong variable: an
// access key, a short bearer token, a password. The pattern was authored as a safety measure and was
// in fact the vulnerability - it decided WHETHER to publish rather than never publishing.
//
// SO THE REPORT MOVED, AND THE VALUE STAYED BEHIND. `./config.ts` classifies the outcome into one of
// three fixed tokens (`configured`, `defaulted-unset`, `defaulted-unrecognized`) and DISCARDS the
// raw value at the point of resolution, so no code path from a malformed `LOG_LEVEL` to an emitted
// line exists any more. `src/handlers/bootstrap.ts` emits the warning once per container from that
// classifier. Three things are gone from this file as a result and must not be reintroduced here:
// the echo pattern, the `unsafeValue` substitute it fell back to, and the process-global set of
// retained values. This module now has exactly one piece of mutable state - the adopted threshold
// above - and it holds no operator-supplied string at all.
// ---------------------------------------------------------------------------

/**
 * One emitted record. `context` is optional in the exact sense `exactOptionalPropertyTypes`
 * requires: an entry without a context OMITS the key rather than setting it to `undefined`.
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
 * CONTENT-BLIND, AND THAT IS THE WHOLE POINT OF THE FUNCTION. Interpolating `thrown.message` would
 * make this the one path in the module that publishes unstructured text having bypassed redaction
 * entirely - the redaction pass is what threw, so nothing it would have scrubbed had been scrubbed
 * yet. Two of the three failures reported here are raised while READING the caller's own object, so
 * that message can be caller-authored: an accessor throwing `new Error(connectionString)` would
 * have its argument copied straight onto the log stream.
 *
 * The return value is therefore one of exactly two fixed sentences chosen by TYPE. Distinguishing
 * the cycle case tells an operator something actionable - a live object graph was handed to the
 * logger instead of a flat context - and is the whole reason the thrown value is bound at all
 * rather than discarded by a bare `catch {}`: the binding is reachable by exactly one operation, an
 * `instanceof` test against a class this module raises itself.
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
 * A logger that throws while reporting a failure is worse than no logger, so this guard is
 * deliberately TOTAL, and that is why redaction happens inside the `try` rather than before it.
 * Three failures land here: a circular reference reported by the traversal above; an accessor on
 * the caller's context that throws when it is read, which `Object.entries` would otherwise let
 * escape; and anything `JSON.stringify` itself refuses. In every case the entry is replaced by a
 * minimal well-formed line keeping the timestamp, level and message and naming the failure. A
 * FOURTH outcome is not a failure and skips the `catch`: an entry over
 * `MAX_SERIALIZED_ENTRY_CHARACTERS` is replaced by the same minimal shape reporting the measured
 * size. The message is sanitized on BOTH paths, and here rather than at the four call sites: a
 * caller composes a message by interpolation, so doing it once where an entry is built makes the
 * guarantee hold for every caller rather than for the callers that remembered.
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

    // The size bound is applied to the FINISHED document, the only point at which the emitted size
    // is known. An over-long entry is replaced rather than sliced: slicing a JSON document yields
    // one that no longer parses, breaking every downstream structured consumer for exactly the
    // entries most likely to matter. The replacement keeps the three known-bounded fields - this
    // module's own arguments, not caller context - and reports the measured size in place of the
    // context.
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
 * The default sink: one entry, one newline-terminated line, straight to stdout, which the Lambda
 * runtime captures natively.
 *
 * Writing to the stream directly rather than through `console` keeps the emitted line byte-for-byte
 * the JSON document. Emission is synchronous and per call, and nothing is buffered across
 * invocations: a warm container freezes between invocations, so anything left in a buffer would be
 * lost. Every level shares this one stream, `warn` and `error` included - splitting `error` onto
 * stderr would interleave two streams a consumer then has to reassemble.
 *
 * This function is deliberately UNGUARDED: a sink that swallows its own failure hides that failure
 * from the guard around the call. `process.stdout.write` can fail SYNCHRONOUSLY, and when it does
 * the failure is caught one level up by `emitThroughSink`, which reports it and then makes exactly
 * one direct attempt of its own. What that guard cannot reach is the asynchronous pipe failure
 * described in guarantee 1 of the module header, answered by `absorbAsynchronousStdoutFailure`
 * below.
 */
function writeLineToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Answer an asynchronous failure of the stdout stream, and deliberately do nothing else.
 *
 * The body is empty on purpose. On the only path that reaches here THE OUTPUT CHANNEL IS THE THING
 * THAT FAILED: writing the failure back to `process.stdout` would attempt the very write that just
 * failed and would keep failing for the rest of the process's life on a pipe whose reader is gone,
 * and writing it to stderr would break the documented property that every level shares one stream,
 * at the moment a consumer is least able to use a second one. Rethrowing, or letting the event go
 * unhandled, is what the defect was. So the event is consumed and the process continues:
 * registering ONE listener is what turns a fatal unhandled `'error'` event into a handled one, and
 * that is the entire mechanism. The parameter list is empty although the event carries an `Error`,
 * because reading it would only invite the temptation to publish it.
 */
function absorbAsynchronousStdoutFailure(): void {
  // Intentionally empty. See the reasoning above, and the three-empty-blocks note in the module
  // header: this body, the guard in `absorbAsynchronousStdoutFailures` immediately below, and the
  // `catch` in `writeLineDirectly`, and no more.
}

/**
 * Register the absorber on `process.stdout`, once, at module load. Three properties, each
 * load-bearing.
 *
 * IDEMPOTENT. Registration is skipped when the absorber is already among the stream's `'error'`
 * listeners, so a module instance somehow evaluated more than once cannot accumulate listeners.
 *
 * TOTAL. The whole body sits inside a guard, because registration reads and mutates a stream this
 * module does not own and either step can fail on an exotic or already-torn-down stream. A module
 * whose IMPORT can throw would be unusable in exactly the situation it exists for - `config.ts`
 * logging its own fatal startup error.
 *
 * NARROW. One listener for ONE event on ONE stream. It installs no `process` signal handler and no
 * `exit` / `beforeExit` / `uncaughtException` / `unhandledRejection` hook: shutdown stays
 * caller-driven, the same judgment `connection.ts` records for the connection pool.
 */
function absorbAsynchronousStdoutFailures(): void {
  try {
    const stream = process.stdout;
    if (!stream.listeners('error').includes(absorbAsynchronousStdoutFailure)) {
      stream.on('error', absorbAsynchronousStdoutFailure);
    }
  } catch {
    // Absorbing the absorber's own installation failure: this runs at module load, before any
    // caller exists to report it to, and a throw from here would make importing the logger fatal.
  }
}

absorbAsynchronousStdoutFailures();

/**
 * The last word: write one line to stdout and, if even that fails, stop.
 *
 * Reached only after a sink has already failed, and it writes to the stream DIRECTLY rather than
 * through the sink reference: routing the fallback back through `sink` would re-enter the code that
 * just threw, and a sink that throws every time would then throw again from inside the handler for
 * its own failure. That is what makes the fallback non-recursive by construction.
 */
function writeLineDirectly(line: string): void {
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    // Intentionally empty, and intentionally last. The output channel is gone; there is no second
    // channel to escalate to and nothing a throw from here could accomplish except to propagate
    // into the caller's request handling, which is precisely the failure this path exists to
    // prevent.
  }
}

/** Message on the line that reports a sink failure. */
const SINK_FAILURE_MESSAGE = 'log sink failed; entry emitted through the direct fallback';

/**
 * Pre-built, structurally valid line for the case where even DESCRIBING the sink failure fails. A
 * frozen constant rather than something composed on demand: it is the floor of the fallback chain,
 * so it must involve no work that could itself fail.
 */
const SINK_FAILURE_FLOOR_LINE = '{"level":"error","message":"log sink failed"}';

/**
 * Describe a sink failure without letting the description throw in turn, and without describing its
 * contents. The class NAME only, held to the same shape test every other emitted name is: a sink is
 * caller-supplied, so its failure message is caller-derived free text, and this line is written on
 * the fallback path where the redaction pass has already been bypassed.
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
 * The dropped entry travels verbatim in `droppedEntry`, which is safe because it has already been
 * through `serializeEntry` - so the record of what would otherwise have been lost is kept without
 * re-exposing anything that pass removed. The composition sits inside its own guard because
 * `describeSinkFailure` reads `name` off a value the caller controls, and an accessor on a hostile
 * or merely broken `Error` subclass can throw.
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
 * Hand one serialized line to the sink, and absorb the sink's failure if it has one - guarantee 1
 * of the module header, enforced rather than assumed. A sink is caller-supplied through `withSink`,
 * and the default sink writes to a stream that can break. The fallback never re-enters `sink`, and
 * cannot throw.
 */
function emitThroughSink(sink: LogSink, line: string): void {
  try {
    sink(line);
  } catch (thrown) {
    writeSinkFailureLine(line, thrown);
  }
}

/**
 * Build a logger over a pinned threshold and a sink. Module-private on purpose: the exported unit
 * is a ready-to-use logger, and the two `with*` methods return siblings through this same function,
 * so there is exactly one construction path.
 */
function createLogger(pinnedLevel: LogLevel | undefined, sink: LogSink): Logger {
  const emit = (level: LogLevel, message: string, context: LogContext | undefined): void => {
    // Filtering is one comparison against the ordered severity map. Nothing precedes it any more:
    // the QA-I7 announcement that used to run here, before the filter, has moved to
    // `src/handlers/bootstrap.ts`, which reports the classifier `./config.ts` resolves rather than
    // the raw value this module used to echo. See the QA-I7 section above.
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[resolveThreshold(pinnedLevel)]) {
      return;
    }

    // `toISOString()` is UTC by definition and always carries the `Z` designator. That is how the
    // explicit UTC policy is met with no timezone handling at all: the legacy engine followed
    // whatever timezone the server was set to, and none of that is carried forward.
    const timestamp = new Date().toISOString();

    // Serialization is total and the sink invocation is guarded, so `emit` has no throwing path of
    // its own, and the stream's asynchronous failures are absorbed where they are delivered. That
    // matters at the call sites: the error mapper logs and then returns a response, and either kind
    // of failure escaping from this line would replace that response with an unhandled one.
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
 * Build the one process-wide logger: a stdout logger with the adoption seam attached.
 *
 * The emitting half is `createLogger`, so there is still exactly one construction path for the four
 * level methods and the two `with*` siblings. This function only widens the object it returns by the
 * single method {@link ProcessLogger.adoptConfiguredThreshold}, and freezes the result for the same
 * reason `createLogger` freezes its own: the emitting surface must not be reshapeable at run time.
 */
function createProcessLogger(): ProcessLogger {
  const base = createLogger(undefined, writeLineToStdout);

  return Object.freeze({
    ...base,
    adoptConfiguredThreshold: (level: LogLevel | undefined): void => {
      adoptedThreshold = level;
    },
  });
}

/**
 * The single exported unit of this module: a ready-to-use logger whose lines go to stdout and whose
 * threshold is the one adopted from validated configuration. There is no default export and no
 * barrel file in this subtree.
 *
 * ITS TYPE IS {@link ProcessLogger}, NOT {@link Logger}, AND THE DIFFERENCE IS THE POINT. Only this
 * one object carries `adoptConfiguredThreshold`. The siblings `withLevel` and `withSink` return
 * plain `Logger`s, and every consumer that accepts an injected logger declares the parameter as
 * `Logger`, so the ability to move the process-wide threshold is reachable from the composition root
 * - which imports this binding by name - and from nowhere else. A handler holding a `Logger` cannot
 * see the method, which is what keeps a mutator off the emitting surface that eight modules share.
 */
export const logger: ProcessLogger = createProcessLogger();
