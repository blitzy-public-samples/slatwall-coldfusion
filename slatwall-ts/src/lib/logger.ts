// slatwall-ts - structured logging.
//
// Guarantee 1 - emission never throws, and neither does the stream behind it.
//
// Guarantee 2 - nothing is emitted that was not sanitized.
//
// Three BOUNDS - depth, breadth and serialized size - keep the traversal and the emitted line
// finite on a path whose whole purpose is to be safe to call from a `catch` arm.

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
 * Destination for one already-serialized entry. The line arrives without a trailing newline -
 * terminating it belongs to the sink.
 */
export type LogSink = (line: string) => void;
export interface Logger {
  /**
   * Diagnostic detail. Suppressed unless the resolved threshold is `debug`.
   */
  debug(message: string, context?: LogContext): void;
  /**
   * Ordinary operational milestone - the closest analogue of the legacy calls.
   */
  info(message: string, context?: LogContext): void;
  /**
   * A recoverable irregularity. Emitted on stdout like every other level.
   */
  warn(message: string, context?: LogContext): void;
  /**
   * A failure. Emitted on stdout like every other level.
   */
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
 */
export interface ProcessLogger extends Logger {
  /**
   * Adopt the emission threshold resolved by `./config.ts`, for the remaining life of the process.
   *
   * Called once, by the composition root, immediately after it resolves configuration and before
   * it wires anything that logs.
   *
   * @param level the validated threshold, or `undefined` to restore {@link DEFAULT_LOG_LEVEL}.
   */
  adoptConfiguredThreshold(level: LogLevel | undefined): void;
}

/**
 * Threshold applied until a configured one is adopted, and whenever the adopted one is cleared.
 *
 * Deliberately a literal rather than a read of `LOG_LEVEL`: this module reads no environment
 * variable - see the threshold-resolution section.
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

/**
 * Substituted for the value held under any forbidden key.
 */
const REDACTED = '[REDACTED]';

// The never-log policy.
//
// The value held under any key the policy matches is replaced with `REDACTED` before
// serialization.
//
// A CONTEXT KEY - a member of the caller's context object - is decided by `redactMember`, which
// FAILS CLOSED: after the four rules have had their say.

/**
 * Anything that authenticates or authorizes a caller.
 */
const CREDENTIAL_KEYS: readonly string[] = [
  'password',
  'passwd',
  'pass',
  'pwd',
  'passphrase',
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
 * Anything describing how to reach the database.
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
  // Testing found `logger.error('user=root')` and `'username=root'` emitted in CLEARTEXT while
  // `'dbUser=root'` was redacted and the CONTEXT key `user` was redacted - the context surface
  // fails closed.
  //
  // They are exact entries (rule 2) and deliberately not fragments (rule 3).
  'user',
  'username',
];

/**
 * Payment instrument data, which must never reach a log stream.
 */
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
 * The posture, stated explicitly: a natural person's name, postal address and network address are
 * personal data in exactly the way an email address is.
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
  // The proxy and cdn spellings of a client address, which are the ones that actually reach a log
  // line behind API Gateway.
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
  'author',
  'authorname',
];
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
 * A driver hangs the failing statement, and often the values bound into it, off the error object
 * it throws - `mysql2` populates `sql`, `sqlMessage`, `sqlState`, `code` and `errno`.
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
  'params',
  'values',
];

/**
 * The six groups above, flattened once, for constant-time membership tests.
 */
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
 * Rule 1 of the policy, and the reason a fail-closed default is affordable at all.
 */
const LEGIBLE_IDENTIFIER_KEYS: ReadonlySet<string> = new Set([
  'productid',
  'producttypeid',
  'skuid',
  'skucurrencyid',
  'brandid',
  'categoryid',
  'optionid',
  'optiongroupid',
  // Promotions and pricing.
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
  // The out-of-scope order aggregate, reachable only as an opaque identifier.
  'orderid',
  'orderitemid',
  'orderfulfillmentid',
  'accountid',
  // Fulfillment and address, whose PII-bearing bodies stay redacted.
  'addressid',
  'addresszoneid',
  'shippingmethodid',
  'shippingmethodoptionid',
  // An end-user identifier, which is an opaque handle exactly like `accountID` beside it.
  'userid',
  'requestid',
  'correlationid',
  'traceid',
  'invocationid',
  'awsrequestid',
]);

/**
 * The keys authorized to carry a non-sensitive diagnostic in a context object.
 *
 * The second allow-list, and the one that makes a fail-closed context surface affordable.
 *
 * The register of names DELIBERATELY not here, because the question comes up: `port` is refused
 * because `src/repositories/mysql/connection.ts` documents a database name and port together as
 * reconnaissance rather than diagnostics.
 */
const LEGIBLE_DIAGNOSTIC_KEYS: ReadonlySet<string> = new Set([
  // Published by `src/handlers/errorMapper.ts` on every mapped failure. Redacting any of these
  // would blind the one surface that reports a request went wrong.
  'category',
  'statuscode',
  'route',
  'fieldpaths',
  'invalidrequestreason',
  'missingmethodname',
  'classname',
  'thrownshape',
  'errorcode',
  // The condition token on a mapped 409, admitted on exactly the same ground as `errorcode` beside
  // it and for the same reason: without it the ONE surface that reports a write was refused cannot
  // say WHICH refusal it was, and a duplicate key, a deadlock and a lock-wait timeout are three
  // different operational stories. Its value is not free text - `conflictResponse` in
  // `src/handlers/errorMapper.ts` drops anything that is not shaped like a condition name before
  // emitting, and the only values reaching it are the server's own condition names plus one
  // server-authored token from `src/repositories/mysql/mysqlSkuRepository.ts`. Nothing a caller sends
  // and no value read out of a row can appear under it.
  'conflictcode',
  'thrownat',
  'publishedissuecount',
  'issuecount',
  'fieldissuecount',
  // `thresholdinforce` is one of `debug`, `info`, `warn`, `error`, from the `LogLevel` union here,
  // which is the same ground the capability handlers' closed literals below are admitted on. *
  // `logthresholdsource` is one of `configured`, `defaulted-unset`, `defaulted-unrecognized`.
  'logthresholdsource',
  'thresholdinforce',
  // Its value cannot be customer data by nature, whatever a caller sends.
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
  // The ported engines' own diagnostics.
  'skucode',
  'currencycode',
  // The same datum as `currencyCode` above under the two qualified names a CONVERSION needs,
  // because one context object has to name both ends of it and cannot spell either of them
  // `currencyCode`.
  'originalcurrencycode',
  'converttocurrencycode',
  'amounttype',
  'discountamount',
  'quantity',
  'passedqualification',
  // Catalog labels, which are storefront-public by definition. `name` is deliberately not a
  // fragment for exactly these three.
  'brandname',
  'productname',
  'optiongroupname',
  // Operational timing and volume. A timestamp, a duration, an attempt count and a row count
  // describe this INVOCATION rather than anything in it.
  'occurredat',
  'startedat',
  'completedat',
  'durationms',
  'elapsedms',
  // An ELAPSED SPAN on the same footing as the two durations above it, differing only in unit and
  // in what it is measured from.
  'ageindays',
  'attemptcount',
  'retrycount',
  'rows',
  'rowcount',
  'affectedrows',
  'resultcount',
  'accept',
  'acceptlanguage',
  'acceptencoding',
  'contenttype',
  'contentlength',
  // Environment names authorized inside an opaque container, on the same footing: the deployment
  // coordinates an operator reading the line already knows, which identify no customer and unlock
  // nothing.
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
 * Each entry is a compound that has no innocent meaning in English or in this domain, so a plain
 * substring test is safe: `dbSecret`, `secretKey` and `awsSecretAccessKey` all contain `secret`.
 */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  // Credentials, in every compound spelling.
  'password',
  'passwd',
  'passphrase',
  'passcode',
  'pwd',
  'secret',
  'credential',
  // Account-recovery compounds. Unambiguous in English and in this domain, so a substring test is
  // safe and reaches `walletMnemonic`-shaped names as well.
  'mnemonic',
  'seedphrase',
  'recoveryphrase',
  // Key material, qualified so `cacheKey` survives.
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
  // Bearer material and the schemes that carry it.
  'authorization',
  'authtoken',
  'authkey',
  'authsecret',
  'oauth',
  'xauth',
  'token',
  'jwt',
  'bearer',
  // Payment instruments and government identifiers.
  'creditcard',
  'cardnumber',
  'securitycode',
  'socialsecurity',
  // Database connection details, which the policy forbids by name.
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
 * Rule 4: short words that are sensitive only as a WHOLE WORD of the key.
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
  // `integrationServices/google/controllers/feed.cfc:L58` takes `required struct rc`.
  'rc',
]);

/**
 * Depth beyond which a nested structure is described rather than traversed, so that a deeply
 * nested or self-referential structure cannot drive unbounded recursion.
 */
const MAX_REDACTION_DEPTH = 4;

/**
 * How many array elements or object keys are traversed at any one level.
 */
const MAX_REDACTION_BREADTH = 64;

/**
 * How long a serialized entry may be before it is replaced by a bounded summary.
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
 * Where one word of a key ends and the next begins.
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
 * Answers one question - "is this name known to be sensitive" - so its own answer for an
 * unrecognized name is `false`, and that is not a claim that the name will be emitted.
 *
 * Lives in `redactMember`, which redacts anything this function declines unless an allow-list or
 * the value's own shape authorizes it.
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
 * Whether a key names a container whose treatment depends on the shape of its value.
 */
function isOpaqueContainerKey(key: string): boolean {
  return OPAQUE_CONTAINER_KEYS.has(normalizeKey(key));
}

/**
 * Whether a CONTEXT key is authorized to carry a value in the clear.
 *
 * The positive half of the fail-closed context rule, and the reason it is a separate function
 * rather than an extra arm of `isForbiddenKey`: that function is also applied to string CONTENT by
 * `redactSensitiveAssignments`.
 *
 * Both allow-lists are consulted, because both authorize the same thing at different strengths: an
 * enumerated opaque identifier, or an enumerated non-sensitive diagnostic.
 */
function isLegibleContextKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    LEGIBLE_IDENTIFIER_KEYS.has(normalized) ||
    LEGIBLE_DIAGNOSTIC_KEYS.has(normalized) ||
    OPAQUE_CONTAINER_KEYS.has(normalized)
  );
}

// A key-name policy can only protect a value that arrived under a name - guarantee 2 of the module
// header.
//
// Every rule below is therefore applied to string content, not key names, and each is deliberately
// narrow enough to state what it does and does not catch.

/**
 * Substituted for a statement, because a statement cannot be partly scrubbed.
 */
const SQL_REDACTED = '[SQL REDACTED]';

/**
 * Substituted for an absolute filesystem path.
 */
const PATH_REDACTED = '[PATH REDACTED]';

/**
 * Appended when a string is cut to `MAX_LOGGED_TEXT_LENGTH`.
 */
const TRUNCATION_MARKER = '...[truncated]';

/**
 * Length beyond which a string is cut, bounding how much text this module will emit from any
 * single string so that a whole statement, document or stack cannot arrive as one value.
 */
const MAX_LOGGED_TEXT_LENGTH = 512;

/**
 * Statement shapes, matched case-insensitively - the arms that need no help.
 */
const SQL_OBJECT_REFERENCE =
  '[`"[]?[A-Za-z_][\\w$]{0,63}[`"\\]]?(?:\\s*\\.\\s*[`"[]?[A-Za-z_][\\w$]{0,63}[`"\\]]?)?';

/**
 * An optional single alias token, as `FROM t alias` and `UPDATE t alias SET` allow.
 */
const SQL_OPTIONAL_ALIAS = '(?:\\s+(?:as\\s+)?[A-Za-z_]\\w{0,31})?';

/**
 * A determiner may not stand where a table name is expected - the one test that separates
 * `FROM SwSku` from "from the catalog": no table in the `Sw*` schema is named `the`, `a`, `this`
 * or `each`.
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
  // (`DELETE t1 FROM SwSku t1 JOIN...`) and a plain aliased target are ordinary.
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
 * `SELECT... FROM <target>`, where the statement starts where a statement can.
 *
 * A projection list cannot be told apart from two English words by shape alone, because
 * `SELECT column alias FROM t` is legal SQL and "select a sku from t" has exactly that shape.
 */
const SQL_SELECT_STATEMENT_PATTERN = new RegExp(
  `(?:^|[\\n\\r\\t;('"\`,=:[])\\s*select\\b[\\s\\S]{0,4000}?\\bfrom\\s+${SQL_TABLE_DETERMINER_VETO}`,
  'i',
);

/**
 * Syntax that a statement carries and a sentence does not. Required in ADDITION to the two
 * conditions above, as a third independent test.
 *
 * Accepted consequence, stated plainly: a bare two-identifier projection with no operator,
 * literal, placeholder, punctuation `OR` clause - `SELECT skuCode FROM SwSku`.
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
 * `<identifier><separator>`, and deliberately not the value that follows.
 *
 * Because `error:` is not forbidden and its unquoted value ran to the `;`, swallowing
 * `password=hunter2` whole.
 */
const ASSIGNMENT_HEAD_PATTERN = /([A-Za-z][A-Za-z0-9_-]{0,63})(\s*(?:=>|=|:)\s*)/g;

/**
 * The characters that end a value in prose, in a stack frame and in JSON.
 */
const VALUE_TERMINATORS: ReadonlySet<string> = new Set([';', ',', ')', ']', '}', '\n', '\r']);

/**
 * A new `name<sep>` pair beginning after whitespace - where one value's run has to stop.
 *
 * Without it a multi-token value would swallow the diagnostics that follow it.
 */
const NEXT_ASSIGNMENT_HEAD_PATTERN = /\s[A-Za-z][A-Za-z0-9_-]{0,63}\s*(?:=>|=|:)/;

/**
 * First words after which the REST of the value is still the value.
 *
 * 'authorization=Bearer xyz' -> masking that stopped at the first whitespace would emit
 * `authorization=[REDACTED] xyz`, leaving `xyz` - the actual bearer material - behind.
 */
const VALUE_CONTINUATION_HEADS: ReadonlySet<string> = new Set([
  // Authorization schemes, whose material is the following token.
  'bearer',
  'basic',
  'digest',
  'negotiate',
  'ntlm',
  'mac',
  // Statement heads, because a statement continues in tokens.
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
 */
const MAX_ASSIGNMENT_VALUE_LENGTH = 512;

/**
 * `user 'account'@'host'` - the account half of a driver authentication failure.
 *
 * The canonical MySQL refusal is
 * `Access denied for user 'slatwall'@'localhost' (using password: YES)`. The account name is not an
 * ASSIGNMENT, so the `key<sep>value` scanner never sees it and this pattern is what redacts it.
 */
const DATABASE_ACCOUNT_PATTERN =
  /\b(user|username)\s+(?:'[^'\n]{0,128}'|"[^"\n]{0,128}")(?:@(?:'[^'\n]{0,128}'|"[^"\n]{0,128}")?)?/gi;

/**
 * The authority a driver names when it cannot reach the database.
 *
 * `connect ECONNREFUSED 127.0.0.1:3306` and `getaddrinfo ENOTFOUND db.internal` publish the DB
 * host and port - values `src/lib/config.ts` refuses to echo and `CompositionDiagnostics` redacts.
 *
 * Accepted consequence, stated plainly: the token after one of these codes is masked whether or
 * not it is an authority, so a message reading `ENOTFOUND while resolving` loses the word `while`.
 */
const DRIVER_CONNECTIVITY_TARGET_PATTERN =
  /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\s+\S{1,256}/g;

/**
 * `scheme://user:secret@host` - the credential half of a connection URI, and deliberately no more:
 * the authority that follows survives.
 */
const URI_CREDENTIAL_PATTERN = /:\/\/[^\s/:@]{1,128}(?::[^\s/@]{0,128})?@/g;

// This is what removes the private paths every stack frame carries, and it is why the stack
// summary below can keep function names: the frame's shape survives, only the location is
// replaced.

/**
 * Everything that may not precede the leading slash of a path.
 */
const NON_PATH_PREFIX = '(?<![A-Za-z0-9_.\\\\:-])';

/**
 * Characters that terminate a path token in prose, a stack frame or JSON.
 */
const PATH_BODY = '[^\\s"\'()[\\],;]';

/**
 * A drive-letter path, where the letter is not the tail of a longer word.
 */
const WINDOWS_ABSOLUTE_PATH_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])[A-Za-z]:[\\\\/]${PATH_BODY}{1,512}`,
  'g',
);

/**
 * Segments that are filesystem roots rather than the first segment of a route: the Linux FHS
 * roots, the macOS ones, and `node_modules` - not a root, but at the head of a bundled frame often
 * enough to belong here.
 */
const FILESYSTEM_ROOT_SEGMENTS =
  'tmp|var|home|usr|opt|etc|proc|sys|dev|run|root|srv|mnt|media|bin|sbin|lib|lib64|boot|private|snap|node_modules|Users|Volumes|System|Library|Applications';

/**
 * `/var/task/index.js`, `/home/deploy/.ssh/id_rsa` - a path from a known root.
 */
const ROOTED_ABSOLUTE_PATH_PATTERN = new RegExp(
  `${NON_PATH_PREFIX}/(?:${FILESYSTEM_ROOT_SEGMENTS})(?![A-Za-z0-9])${PATH_BODY}{0,512}`,
  'g',
);

/**
 * `/workspaces/repo/src/lib/logger.ts:1158:18` - a path proven by its filename.
 */
const FILENAME_ABSOLUTE_PATH_PATTERN = new RegExp(
  `${NON_PATH_PREFIX}/(?:[^\\s"'()[\\],;/]{1,64}/){1,32}[^\\s"'()[\\],;/]{1,64}\\.[A-Za-z0-9]{1,12}(?![A-Za-z0-9])${PATH_BODY}{0,128}`,
  'g',
);

/**
 * The path rules, applied in order. Each replacement is slash-free, so no rule feeds the next.
 */
const ABSOLUTE_PATH_PATTERNS: readonly RegExp[] = [
  WINDOWS_ABSOLUTE_PATH_PATTERN,
  ROOTED_ABSOLUTE_PATH_PATTERN,
  FILENAME_ABSOLUTE_PATH_PATTERN,
];

/**
 * `Authorization: Bearer <material>` and its `Basic` sibling.
 */
const AUTH_SCHEME_PATTERN = /\b(bearer|basic|digest)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/**
 * A serialized web token, recognized by SHAPE rather than by the key or scheme carrying it.
 *
 * WHY THIS RULE EXISTS, AND WHY IT IS THIS NARROW. The key-based half of the policy fails closed and
 * is the strong half, but it governs CONTEXT MEMBERS only; the MESSAGE surface is permissive by
 * design and is matched by content, so a credential arrives there safely only if some rule
 * recognizes it. The rules above recognize five shapes - a statement, a `name=value` pair under a
 * forbidden name, URI userinfo, an auth scheme with its material, and a driver's own account or
 * target text - and a runtime review pointed out that a token passed as a BARE message, with no key,
 * no scheme prefix and no assignment shape, matches none of them. No shipped call site emits one; a
 * future one could.
 *
 * `eyJ` is what a base64url encoding of `{"` begins with, so this matches a serialized JSON object
 * and, in practice, the header or payload of a JWS/JWT. That precision is the point: a heuristic
 * keyed on LENGTH or ENTROPY would also claim the 32-character hexadecimal identifiers this domain
 * is full of - every `Sw*` primary key is one - and the policy deliberately keeps those legible
 * (see {@link LEGIBLE_IDENTIFIER_KEYS}), so an entropy rule would trade a real diagnostic for a
 * hypothetical secret. Nothing in the `Sw*` schema or in this service's own vocabulary begins `eyJ`
 * and continues in base64url.
 *
 * ⚠ IT DOES NOT CLOSE THE GENERAL CASE, AND NOTHING CONTENT-BASED CAN. An arbitrary opaque string -
 * a bare API key, a random session identifier - is indistinguishable from an ordinary value by
 * inspection, which is exactly why the CONTEXT surface fails closed on the KEY instead. The
 * remaining boundary is asserted rather than implied: see the case named "withholds a bare opaque
 * secret, which content sanitization cannot recognize" in `tests/unit/lib/logger.test.ts`, which
 * proves the key-based half withholds it.
 */
const SERIALIZED_TOKEN_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{4,}){0,2}/gu;

/**
 * Where the line containing `start` ends - the whole remainder when there is no newline after it.
 *
 * The FAIL-CLOSED fallback for a value this scanner cannot delimit, and the reason it stops at the
 * newline rather than at the end of the text: a sanitized `stack` is many lines.
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
 * Returns `start` itself when there is nothing to mask - an empty value, or one already masked.
 *
 * Total: every branch is a bounded scan or a set lookup, so there is no throwing path.
 *
 * @param text the whole string being sanitized.
 * @param start the index immediately after a key's separator.
 * @returns the exclusive end index of the value to replace.
 */
function sensitiveValueEnd(text: string, start: number): number {
  if (text.startsWith(REDACTED, start)) {
    return start;
  }

  const limit = Math.min(text.length, start + MAX_ASSIGNMENT_VALUE_LENGTH);
  const budgetCutsOffTheValue = limit < text.length;

  // A quoted value is its quotes and everything between them, so a value containing spaces,
  // semicolons or brackets is masked whole - at any length.
  const opening = text[start];

  if (opening === '"' || opening === "'") {
    const closing = text.indexOf(opening, start + 1);
    const lineEnd = text.indexOf('\n', start + 1);

    if (closing !== -1 && (lineEnd === -1 || closing < lineEnd)) {
      return closing + 1;
    }
  }

  // The FIRST TOKEN, which is the whole value in the common case.
  let firstTokenEnd = start;

  while (firstTokenEnd < limit) {
    const character = text[firstTokenEnd] ?? '';

    if (character === ' ' || character === '\t' || VALUE_TERMINATORS.has(character)) {
      break;
    }

    firstTokenEnd += 1;
  }

  // An undelimited token. 512 characters went by with no whitespace and no terminator, so where
  // this value ends is unknown and the rest of the line is withheld.
  if (firstTokenEnd === limit && budgetCutsOffTheValue) {
    return lineRemainderEnd(text, start);
  }

  if (!VALUE_CONTINUATION_HEADS.has(text.slice(start, firstTokenEnd).toLowerCase())) {
    return firstTokenEnd;
  }

  // A continuation head: the material is what follows it.
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
 * Replace the value in every `sensitiveKey <sep> value` pair, and nothing else. A pair whose key
 * is not on the policy list is returned byte-for-byte, so `orderID=4f3c...` stays legible.
 *
 * Each pair is delimited on its own, because a single-pass form consumes the FOLLOWING
 * non-forbidden pair's value along with the forbidden one - `error: password=hunter2; user=root`
 * would then go out in cleartext.
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
        // Past the masked span, so a `name=value` shape INSIDE a withheld value is not matched as
        // a pair of its own - there is nothing left of it to police.
        ASSIGNMENT_HEAD_PATTERN.lastIndex = valueEnd;
      }
    }

    head = ASSIGNMENT_HEAD_PATTERN.exec(text);
  }

  return sanitized + text.slice(copiedTo);
}

/**
 * Cut to the bound, and say so, so a reader never mistakes a cut for the end.
 */
function truncateText(text: string): string {
  return text.length <= MAX_LOGGED_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_LOGGED_TEXT_LENGTH)}${TRUNCATION_MARKER}`;
}

/**
 * Make one string safe to emit.
 */
function sanitizeText(text: string): string {
  if (containsSqlStatement(text)) {
    return SQL_REDACTED;
  }

  // Assignment redaction runs FIRST, before the URI and auth rules. Letting the URI rule go first
  // replaces only the userinfo of a connection string carried under a forbidden name, leaving
  // `connectionString=mysql://[REDACTED]@h/db`.
  const withoutAssignedSecrets = redactSensitiveAssignments(text);
  const withoutUriCredentials = withoutAssignedSecrets.replace(
    URI_CREDENTIAL_PATTERN,
    `://${REDACTED}@`,
  );
  const withoutAuthMaterial = withoutUriCredentials.replace(
    AUTH_SCHEME_PATTERN,
    (_whole: string, scheme: string): string => `${scheme} ${REDACTED}`,
  );

  // After the scheme rule, so `Bearer eyJ...` is already one replacement rather than two, and before
  // the driver and path rules, which cannot match token text.
  const withoutSerializedToken = withoutAuthMaterial.replace(SERIALIZED_TOKEN_PATTERN, REDACTED);

  // The two shapes a DRIVER writes rather than a caller: a quoted account (with its host) in an
  // authentication refusal, and the target of a connectivity failure.
  const withoutDatabaseAccount = withoutSerializedToken.replace(
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
 * A distinct TYPE rather than a generic `Error` carrying a distinguishing message.
 */
class LogContextCycleError extends Error {
  constructor() {
    super('circular reference in log context');
    this.name = 'LogContextCycleError';
  }
}

/**
 * The key under which an object's breadth truncation is recorded.
 */
const BREADTH_LIMIT_KEY = '[breadth limit]';

/**
 * Describe what a breadth bound left out, in counts only. Deliberately carries no content from the
 * omitted elements - not a sample, not a first value, not a key name.
 */
function describeBreadthLimit(omitted: number, total: number, unit: string): string {
  return `[breadth limit: ${String(omitted)} of ${String(total)} ${unit} omitted]`;
}

/**
 * True only for an object literal or a null-prototype object.
 */
function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/**
 * A non-traversable object rendered as a bracketed constructor name.
 */
function describeOpaqueObject(value: object): string {
  const { constructor } = value as { readonly constructor?: { readonly name?: unknown } };
  const name = constructor?.name;
  return typeof name === 'string' && name.length > 0 ? `[${name}]` : '[Object]';
}

/**
 * A class-name shape: what an `Error.name` legitimately is, and nothing else.
 *
 * A JavaScript `name` is an ordinary writable property, so any value at all can end up there -
 * including a whole sentence, a stringified payload, or a credential.
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
 * The shape an error CODE may take before it is emitted.
 */
const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Substituted for a name that does not have the shape of a class identifier.
 */
const UNSAFE_ERROR_NAME = '[unsafe name]';

/**
 * Read a machine code off an error, or decline. Reached through `in`-operator narrowing so nothing
 * widens and no cast is needed.
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
 *
 * `message` and `stack` are never EMITTED, for the reason guarantee 2 of the module header gives;
 * a stack can carry the same content in its header line, and `stack` is itself writable.
 */
function normalizeError(error: Error): Record<string, unknown> {
  const name = SAFE_ERROR_NAME_PATTERN.test(error.name) ? error.name : UNSAFE_ERROR_NAME;
  const code = readSafeErrorCode(error);
  const summary: Record<string, unknown> = { name, message: REDACTED, stack: REDACTED };
  // Omitted rather than set to `undefined`, so an error without a usable code simply has no
  // `code`.
  if (code !== undefined) {
    summary['code'] = code;
  }
  // DRIVER FIELDS are not NAMED here either. The shape is CLOSED: `sql`, `sqlMessage` and `values`
  // are never read, and no key derived from the error's own property names reaches the line - not
  // even as a name.
  return summary;
}

/**
 * Apply the never-log policy and reshape whatever is left into something JSON can represent. Runs
 * before `JSON.stringify` so the policy reaches nested structures, not just the top level.
 */
function redactValue(value: unknown, depth: number, ancestors: ReadonlySet<object>): unknown {
  // JSON has no bigint and `JSON.stringify` throws when it meets one.
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
  // A string is the one primitive that can carry a payload the key-name policy cannot see, so it
  // is the one primitive not passed through untouched.
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
  // An error is SUMMARIZED, never traversed: reduced to its class name and a machine code, with
  // its message and stack replaced by the redaction marker. See `normalizeError`.
  if (value instanceof Error) {
    return normalizeError(value);
  }
  // UTC, explicitly: `toISOString()` always renders in UTC with the `Z` designator, so a date in a
  // context object cannot pick up an ambient timezone the way the legacy engine's handling did.
  if (value instanceof Date) {
    return value.toISOString();
  }
  // A container that contains itself.
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
 * Rebuild an array, bounded in width, recording anything it left out.
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
 * Decide what one member of a caller's object becomes, from its key and the shape of its value.
 *
 * A key the never-log policy claims is replaced with the marker outright.
 *
 * Total, like everything else on this path: the only operations are set lookups, `typeof` tests
 * and recursive calls that are themselves total and bounded.
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
 * member. A `bigint` counts because it is emitted as its decimal string.
 */
function isOpaqueTextPayload(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'bigint';
}

/**
 * Whether a value can be emitted under an UNAUTHORIZED key without disclosing anything the key
 * name has not already disclosed.
 *
 * An array is the one recursive case, and it is refused unless every member is itself
 * self-policing.
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
    // String, number and bigint - every one of them a leaf that needs a name.
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
  // A plain object, whose children are re-decided by name; or any other object, which
  // `describeOpaqueObject` reduces to a constructor name.
  return true;
}

/**
 * Rebuild a plain object, applying the never-log policy key by key and recursing into what
 * survives, bounded in the number of keys it will walk.
 */
function redactPlainObject(
  source: object,
  depth: number,
  ancestors: ReadonlySet<object>,
): Record<string, unknown> {
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(source);

  // The record is built on a null prototype, and caller keys are written with `defineProperty`
  // rather than `[key] =`. Both halves are required, and the reason is a defect rather than
  // defensiveness.
  const redacted = Object.create(null) as Record<string, unknown>;

  // The breadth bound stays on the iteration. The null prototype governs how each surviving key is
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
    // `__proto__`.
    Object.defineProperty(redacted, BREADTH_LIMIT_KEY, {
      value: describeBreadthLimit(entries.length - MAX_REDACTION_BREADTH, entries.length, 'keys'),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return redacted;
}

// This module imports nothing, and that includes its sibling `./config.ts`.
//
// `withLevel()` remains the per-logger override, and it takes precedence over the adopted value,
// so a suite can pin a threshold on one logger without touching process-wide state at all.

/**
 * The threshold adopted from validated configuration, or `undefined` before the composition root
 * has adopted one.
 *
 * Written by exactly one function - {@link ProcessLogger.adoptConfiguredThreshold} - and read by
 * exactly one - {@link resolveThreshold}.
 */
let adoptedThreshold: LogLevel | undefined;

/**
 * The threshold in force for one emission, in strict precedence order: a level pinned on this
 * logger through `withLevel`, then the level adopted from validated configuration, then the
 * default.
 *
 * The pinned level wins because it is the narrower statement - it was made about this logger
 * specifically.
 */
function resolveThreshold(pinnedLevel: LogLevel | undefined): LogLevel {
  return pinnedLevel ?? adoptedThreshold ?? DEFAULT_LOG_LEVEL;
}

// Reporting an unrecognized threshold: the fallback applies, it is reported rather than silent, and
// the unrecognized value itself is never echoed back out.

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
 * content-blind, and that is the whole point of the function.
 *
 * The return value is therefore one of exactly two fixed sentences chosen by TYPE.
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
    // is known.
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
 * Writing to the stream directly rather than through `console` keeps the emitted line
 * byte-for-byte the JSON document.
 *
 * This function is deliberately UNGUARDED: a sink that swallows its own failure hides that failure
 * from the guard around the call.
 */
function writeLineToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Answer an asynchronous failure of the stdout stream, and deliberately do nothing else.
 */
function absorbAsynchronousStdoutFailure(): void {}

/**
 * Register the absorber on `process.stdout`, once, at module load. Three properties, each
 * load-bearing.
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
 */
function writeLineDirectly(line: string): void {
  try {
    process.stdout.write(`${line}\n`);
  } catch {}
}

/**
 * Message on the line that reports a sink failure.
 */
const SINK_FAILURE_MESSAGE = 'log sink failed; entry emitted through the direct fallback';

/**
 * Pre-built, structurally valid line for the case where even DESCRIBING the sink failure fails.
 */
const SINK_FAILURE_FLOOR_LINE = '{"level":"error","message":"log sink failed"}';

/**
 * Describe a sink failure without letting the description throw in turn, and without describing
 * its contents.
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
 * through `serializeEntry`.
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
function emitThroughSink(sink: LogSink, line: string): void {
  try {
    sink(line);
  } catch (thrown) {
    writeSinkFailureLine(line, thrown);
  }
}

/**
 * Build a logger over a pinned threshold and a sink.
 */
function createLogger(pinnedLevel: LogLevel | undefined, sink: LogSink): Logger {
  const emit = (level: LogLevel, message: string, context: LogContext | undefined): void => {
    // Filtering is one comparison against the ordered severity map.
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[resolveThreshold(pinnedLevel)]) {
      return;
    }

    // `toISOString()` is UTC by definition and always carries the `Z` designator.
    const timestamp = new Date().toISOString();

    // Serialization is total and the sink invocation is guarded, so `emit` has no throwing path of
    // its own, and the stream's asynchronous failures are absorbed where they are delivered.
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
 * The emitting half is `createLogger`, so there is still exactly one construction path for the
 * four level methods and the two `with*` siblings.
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
 * Its type is {@link ProcessLogger}, not {@link Logger}, and the difference is the point.
 */
export const logger: ProcessLogger = createProcessLogger();
