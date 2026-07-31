// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the structured logger
//
// WHAT THIS PINS
//   src/lib/logger.ts - the single dependency-free logger of the TypeScript /
//   AWS Lambda `nodejs20.x` port of the Slatwall 3.1.39 catalog +
//   promotions/pricing slice (`version.txt` = `3.1.39`).
//
//   The centre of gravity of this suite is the module's NEVER-LOG POLICY, and
//   specifically its content-based half: an error is reduced to a
//   shape-validated class name and machine code, and its `message` and `stack`
//   are replaced with the redaction marker. That half exists because the
//   key-based half cannot reach inside a string, and an exception's message and
//   stack are free text assembled at throw time - the MySQL driver composes its
//   message out of the server's own error text and hangs the failing statement
//   off the error object, so a syntax or constraint failure embeds the failing
//   SQL fragment and its bound values directly in `message`.
//
//   Every case below therefore plants a real secret or a real piece of personal
//   data inside an error and then asserts that the emitted line does not contain
//   it. An assertion that merely checked the shape of the output would pass while
//   the credential still shipped, so the assertions here are written against the
//   RAW EMITTED LINE as well as against the parsed document.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE
// PRESENTED AS PARITY.
// ---------------------------------------------------------------------------
//   The legacy application has no logger module at all. It calls the CFML engine
//   built-in `writeLog()` directly, with unstructured plain text, at exactly four
//   sites - [Application.cfc:L93], [Application.cfc:L97], [Application.cfc:L101]
//   and [Application.cfc:L107] - none of which carries a severity, a timestamp
//   field or a structured payload. There is nothing there to assert against, and
//   no legacy test under meta/tests/** touches logging in any form.
//
//   The only legacy suites extended anywhere in this port are
//   [meta/tests/unit/entity/BrandTest.cfc] and
//   [meta/tests/unit/entity/ProductTest.cfc], both owned by
//   tests/unit/domain/entities/, and
//   [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
//   contributing zero coverage. No case in this file has a legacy antecedent, no
//   case is dressed up as one, and the `issue_<ticket#>` regression convention
//   taken from [meta/tests/unit/IssuesTest.cfc:L51] appears nowhere below
//   because no ticket governs this module.
//
// HOW THE SUBJECT IS DRIVEN
//   Through the two seams the module exports for exactly this purpose:
//   `withSink()` redirects emission into an array, and `withLevel()` pins the
//   threshold so no case depends on the ambient `LOG_LEVEL`. Neither
//   `process.stdout` nor `process.env` is patched by any case here - which is
//   also why [tests/setup.ts] deliberately never silences stdout.
//
// NO USER RULES WERE PROVIDED
//   The project rules source returns exactly that, and the plan records it
//   outright. No rule is invented here, no assertion below is attributed to a
//   rule, and the absence is not treated as licence to assert less.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from 'vitest';

import type { LogContext } from '../../../src/lib/logger.js';
import { logger } from '../../../src/lib/logger.js';

// ---------------------------------------------------------------------------
// Emission capture
// ---------------------------------------------------------------------------

/** The marker the module substitutes for anything the policy withholds. */
const REDACTED = '[REDACTED]';

/** What the module substitutes for a name that is not shaped like a class name. */
const UNSAFE_ERROR_NAME = '[unsafe name]';

/**
 * Planted credential. Long, unique and free of regex metacharacters, so a
 * substring search for it cannot produce a false negative or a false positive.
 */
const PLANTED_SECRET = 'PLANTED-CREDENTIAL-8f3c2a91b47e';

/** Planted personal data, of the kinds the never-log policy names by key. */
const PLANTED_EMAIL = 'planted.person@example-customer.test';
const PLANTED_SSN = '078-05-1120';

/**
 * One emission, in both the form the sink received and the form a consumer
 * parses.
 *
 * Both are kept because they answer different questions. The parsed document
 * proves the shape; the raw line proves that nothing leaked ANYWHERE in the
 * output, including inside a field this suite did not think to inspect.
 */
interface Captured {
  readonly line: string;
  readonly parsed: Record<string, unknown>;
}

/**
 * Emit one entry at `error` severity through a captured sink and return it.
 *
 * A pure local helper rather than a shared fixture: it holds no state, creates
 * its own array per call, and therefore cannot carry anything between tests.
 * That matters in this port specifically, because four legacy component-level
 * caches become request-scoped precisely so module-level state cannot survive
 * between unrelated invocations on a warm container.
 *
 * The threshold is pinned to `debug` so the entry is never filtered out by an
 * ambient `LOG_LEVEL`.
 */
function captureError(message: string, context?: LogContext): Captured {
  const lines: string[] = [];
  const subject = logger.withSink((line) => lines.push(line)).withLevel('debug');

  if (context === undefined) {
    subject.error(message);
  } else {
    subject.error(message, context);
  }

  expect(lines).toHaveLength(1);
  const [line] = lines;
  if (line === undefined) {
    throw new Error('the sink captured no line');
  }
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('the emitted line is not a JSON object');
  }
  return { line, parsed: parsed as Record<string, unknown> };
}

/**
 * Read the `context` member of a captured entry as an object.
 *
 * Narrowed rather than cast so nothing widens to `any`, and throwing on the
 * unexpected shape keeps a mis-assertion loud instead of silently vacuous.
 */
function contextOf(captured: Captured): Record<string, unknown> {
  const { context } = captured.parsed;
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    throw new Error('the emitted entry carries no context object');
  }
  return context as Record<string, unknown>;
}

/**
 * Read a nested object off a captured context.
 *
 * Used to reach the summary the module produces in place of an error.
 */
function objectAt(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`the value at ${key} is not an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Build an error whose message AND stack both carry the planted secret and the
 * planted personal data.
 *
 * The stack is overwritten deliberately. `stack` is an ordinary writable
 * property, so a library - or a caller - can put anything at all there, and the
 * V8 default format already begins with a header line that repeats the message
 * verbatim. Both facts are the reason the module refuses to emit it.
 */
function errorCarryingPlantedData(): Error {
  const failure = new Error(
    `connection refused for user=${PLANTED_EMAIL} password=${PLANTED_SECRET} ssn=${PLANTED_SSN}`,
  );
  failure.stack = [
    `Error: password=${PLANTED_SECRET} ssn=${PLANTED_SSN}`,
    '    at somewhere (/var/task/index.js:1:1)',
  ].join('\n');
  return failure;
}

// ---------------------------------------------------------------------------
// The content-based half of the never-log policy
// ---------------------------------------------------------------------------

describe('an error in the context is summarized, never described', () => {
  it('withholds a credential planted in the message', () => {
    const captured = captureError('operation failed', { failure: errorCarryingPlantedData() });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(contextOf(captured), 'failure')['message']).toBe(REDACTED);
  });

  it('withholds a credential planted in the stack', () => {
    const captured = captureError('operation failed', { failure: errorCarryingPlantedData() });

    expect(captured.line).not.toContain('/var/task/index.js');
    expect(objectAt(contextOf(captured), 'failure')['stack']).toBe(REDACTED);
  });

  it('withholds personal data planted in the message and the stack', () => {
    const captured = captureError('operation failed', { failure: errorCarryingPlantedData() });

    expect(captured.line).not.toContain(PLANTED_EMAIL);
    expect(captured.line).not.toContain(PLANTED_SSN);
  });

  it('keeps the error recognizable rather than emitting the empty object plain serialization gives', () => {
    const captured = captureError('operation failed', { failure: errorCarryingPlantedData() });
    const summary = objectAt(contextOf(captured), 'failure');

    // The three members are present, so a reader can tell an error apart from any
    // other value, and can tell a withheld field from an absent one.
    expect(Object.keys(summary).sort()).toStrictEqual(['message', 'name', 'stack']);
    expect(summary['name']).toBe('Error');
    expect(JSON.stringify(summary)).not.toBe('{}');
  });

  it('preserves a class name that has the shape of a class name', () => {
    class DialectConfigurationError extends Error {
      public constructor() {
        super(`dialect rejected: ${PLANTED_SECRET}`);
        this.name = 'DialectConfigurationError';
      }
    }

    const captured = captureError('startup failed', { failure: new DialectConfigurationError() });

    expect(objectAt(contextOf(captured), 'failure')['name']).toBe('DialectConfigurationError');
    expect(captured.line).not.toContain(PLANTED_SECRET);
  });

  it('replaces a name that is prose rather than a classifier', () => {
    const failure = new Error('boom');
    // `name` is writable, so it is a second free-text channel unless it is shape
    // tested. This is what that test is for.
    failure.name = `not a class name at all: password=${PLANTED_SECRET}`;

    const captured = captureError('operation failed', { failure });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(contextOf(captured), 'failure')['name']).toBe(UNSAFE_ERROR_NAME);
  });

  it('reports a machine code, which is what makes one infrastructure failure distinguishable from another', () => {
    const failure: Error & { code?: string } = new Error('refused');
    failure.code = 'ECONNREFUSED';

    const summary = objectAt(contextOf(captureError('pool failed', { failure })), 'failure');

    expect(summary['code']).toBe('ECONNREFUSED');
  });

  it('declines a code that is prose rather than a machine token', () => {
    const failure: Error & { code?: string } = new Error('rejected');
    failure.code = `SELECT * FROM SwSku WHERE token = '${PLANTED_SECRET}'`;

    const captured = captureError('query failed', { failure });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(contextOf(captured)).not.toHaveProperty('failure.code');
  });

  it('omits the code member entirely when the error carries no code', () => {
    const summary = objectAt(
      contextOf(captureError('failed', { failure: new Error('x') })),
      'failure',
    );

    expect(summary).not.toHaveProperty('code');
  });

  it('drops the statement and server text a database driver attaches to its error', () => {
    // The driver builds its message from the server's error text and hangs the
    // failing statement off the error object; both are reproduced here as the
    // driver shapes them. Neither may survive into the line.
    const failure: Error & { sql?: string; sqlMessage?: string; sqlState?: string } = new Error(
      "You have an error in your SQL syntax near 'FROM SwSku'",
    );
    failure.sql = `SELECT * FROM SwSku WHERE skuCode = '${PLANTED_SECRET}'`;
    failure.sqlMessage = `duplicate entry '${PLANTED_EMAIL}'`;
    failure.sqlState = '42000';

    const captured = captureError('statement failed', { failure });
    const summary = objectAt(contextOf(captured), 'failure');

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.line).not.toContain(PLANTED_EMAIL);
    expect(captured.line).not.toContain('SwSku');
    expect(Object.keys(summary).sort()).toStrictEqual(['message', 'name', 'stack']);
  });

  it('drops a cause chain instead of walking it', () => {
    const failure = new Error('outer failed', { cause: errorCarryingPlantedData() });

    const captured = captureError('operation failed', { failure });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(contextOf(captured), 'failure')).not.toHaveProperty('cause');
  });

  it('drops the nested errors of an aggregate instead of walking them', () => {
    const failure = new AggregateError([errorCarryingPlantedData()], 'several failed');

    const captured = captureError('operation failed', { failure });
    const summary = objectAt(contextOf(captured), 'failure');

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(summary).not.toHaveProperty('errors');
    expect(summary['name']).toBe('AggregateError');
  });
});

describe('the reduction reaches an error wherever it sits in the context', () => {
  it('reduces an error nested inside a plain object', () => {
    const captured = captureError('operation failed', {
      attempt: { index: 2, failure: errorCarryingPlantedData() },
    });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(objectAt(contextOf(captured), 'attempt'), 'failure')['message']).toBe(REDACTED);
  });

  it('reduces an error nested inside an array', () => {
    const captured = captureError('operation failed', {
      failures: [errorCarryingPlantedData(), errorCarryingPlantedData()],
    });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.line).not.toContain(PLANTED_SSN);
  });

  it('reduces an error handed over as the whole context value under a legible key', () => {
    // The shape the error mapper's unrecognized arm used to produce. It is now
    // classified at that call site as well, so this is the second of two
    // independent defences rather than the only one.
    const captured = captureError('unrecognized failure', { error: errorCarryingPlantedData() });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(contextOf(captured), 'error')['stack']).toBe(REDACTED);
  });
});

// ---------------------------------------------------------------------------
// The serialization guard, which is the third place an error message could
// otherwise have reached the stream
// ---------------------------------------------------------------------------

describe('the total serialization guard names a failure without quoting it', () => {
  it('reports the failure by type, without quoting the accessor that threw', () => {
    const context: LogContext = {
      get computed(): string {
        throw new Error(`accessor exploded: password=${PLANTED_SECRET}`);
      },
    };

    const captured = captureError('operation failed', context);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    // A FIXED SENTENCE, not the thrown value's class name. The name of an error
    // raised inside a caller's accessor is as caller-authored as its message, so
    // the guard chooses its wording by TYPE and reads nothing off the value beyond
    // an `instanceof` test. That is strictly less disclosing than a shape-tested
    // name, and it still fails against the pre-fix source, which interpolated the
    // thrown name AND its message here.
    expect(captured.parsed['contextSerializationFailure']).toBe(
      'log context could not be serialized',
    );
    // The entry is still well formed and still carries what the caller authored.
    expect(captured.parsed['message']).toBe('operation failed');
    expect(captured.parsed['level']).toBe('error');
  });

  it('carries no part of a prose class name into the guard line either', () => {
    const context: LogContext = {
      get computed(): string {
        const failure = new Error('exploded');
        failure.name = `prose: ${PLANTED_SECRET}`;
        throw failure;
      },
    };

    const captured = captureError('operation failed', context);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.parsed['contextSerializationFailure']).toBe(
      'log context could not be serialized',
    );
  });

  it('reports a circular reference rather than emitting a half-walked graph', () => {
    const cyclic: Record<string, unknown> = { label: 'aggregate' };
    cyclic['self'] = cyclic;

    const captured = captureError('operation failed', { aggregate: cyclic });

    // The one case the guard does distinguish, because a cycle is THIS module's
    // own controlled signal rather than anything the caller produced, and because
    // it tells an operator something actionable: a live object graph was handed to
    // the logger instead of a flat context.
    expect(captured.parsed['contextSerializationFailure']).toBe(
      'circular reference in log context',
    );
  });

  it('describes a non-error thrown while serializing', () => {
    // Typed `unknown` rather than written as a bare string literal, because the
    // lint profile forbids throwing a literal non-error - the value that reaches
    // the guard is the same either way.
    const notAnError: unknown = `a bare string carrying password=${PLANTED_SECRET}`;
    const context: LogContext = {
      get computed(): string {
        throw notAnError;
      },
    };

    const captured = captureError('operation failed', context);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.parsed['contextSerializationFailure']).toBe(
      'log context could not be serialized',
    );
  });
});

// ---------------------------------------------------------------------------
// The key-based half of the policy, which the content-based half complements
// rather than replaces
// ---------------------------------------------------------------------------

describe('the key-based never-log policy', () => {
  it('redacts a credential under any casing or separator spelling of its key', () => {
    const captured = captureError('configured', {
      password: PLANTED_SECRET,
      API_KEY: PLANTED_SECRET,
      'x-api-key': PLANTED_SECRET,
      Authorization: PLANTED_SECRET,
      connectionString: PLANTED_SECRET,
      dbPassword: PLANTED_SECRET,
      creditCardNumber: PLANTED_SECRET,
      emailAddress: PLANTED_EMAIL,
      ssn: PLANTED_SSN,
    });
    const context = contextOf(captured);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.line).not.toContain(PLANTED_EMAIL);
    expect(captured.line).not.toContain(PLANTED_SSN);
    for (const key of Object.keys(context)) {
      expect(context[key]).toBe(REDACTED);
    }
  });

  it('matches a key exactly, so an opaque identifier stays legible while its aggregate does not', () => {
    const context = contextOf(
      captureError('applied', {
        order: { total: '52.47' },
        orderID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
        orderItemID: 'ffffffffffffffffffffffffffffffff',
      }),
    );

    expect(context['order']).toBe(REDACTED);
    expect(context['orderID']).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
    expect(context['orderItemID']).toBe('ffffffffffffffffffffffffffffffff');
  });

  it('redacts a forbidden key nested below the top level', () => {
    const captured = captureError('configured', {
      pool: { port: 3306, dbPassword: PLANTED_SECRET },
    });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(contextOf(captured), 'pool')['port']).toBe(3306);
  });
});

// ---------------------------------------------------------------------------
// The policy FAILS CLOSED
//
// The cases below exist because an earlier revision of the module failed OPEN:
// membership was an exact normalized-key test, so a credential under any name
// nobody had enumerated was emitted in cleartext, and the enumeration was
// internally inconsistent in a way no caller could have predicted - `dbpassword`
// was listed while `dbpass` was not, `clientsecret` was listed while `secretkey`
// was not, `bearertoken` was listed while `bearer` was not.
//
// Every spelling in the first case below was measured going out in cleartext
// before the fix, so this is a characterization of a real disclosure rather than
// a hypothetical. The second and third cases are its necessary companions: a
// fail-closed policy is only affordable if the allow-list genuinely protects the
// opaque identifiers the ported engines are traced by, and only correct if it
// does not quietly redact ordinary diagnostics.
// ---------------------------------------------------------------------------

/**
 * Every near-miss key spelling that a purely exact-match policy emitted.
 *
 * Grouped the way the disclosure was found: credential-shaped names, then the
 * container names that can carry an entire environment or header map, then the
 * personal data a customer record brings with it.
 */
const NEAR_MISS_SENSITIVE_KEYS: readonly string[] = [
  // Credential-shaped, 30 spellings
  'dbSecret',
  'db_secret',
  'DBSECRET',
  'dbPass',
  'dbPwd',
  'mysqlPassword',
  'mysqlUser',
  'userPassword',
  'userPass',
  'adminPassword',
  'rootPassword',
  'secretKey',
  'secret_key',
  'SECRETKEY',
  'signingKey',
  'encryptionKey',
  'privateKeyPem',
  'jwt',
  'jwtSecret',
  'jwtToken',
  'sessionSecret',
  'sessionKey',
  'bearer',
  'oauthToken',
  'awsSecretAccessKey',
  'awsAccessKeyId',
  'clientId',
  'proxyAuthorization',
  'passwordHash',
  'hashedPassword',
  // Container names carrying free text, 10 spellings
  'env',
  'environment',
  'config',
  'settings',
  'headers',
  'body',
  'requestBody',
  'payload',
  'params',
  'values',
  // Personal data, 6 spellings
  'firstName',
  'lastName',
  'address',
  'streetAddress',
  'postalCode',
  'ipAddress',
];

/**
 * Ordinary diagnostics that must stay legible, and the reason each one is here.
 *
 * A fail-closed policy trades a false-negative risk for a false-positive risk,
 * and this is the assertion that the trade was made carefully. Each entry is a
 * near neighbour of a sensitive fragment: `bypass` and `passedQualification`
 * contain `pass`, `author` contains `auth`, `cacheKey` and `keyCount` contain
 * `key`, `userID` contains `user`, `skuCode` and `statusCode` contain `code`.
 */
const LEGIBLE_DIAGNOSTIC_KEYS: Readonly<Record<string, string | number | boolean>> = {
  bypass: true,
  bypassFlag: 'yes',
  author: 'jane',
  authorName: 'jane doe',
  cacheKey: 'sku:ABC',
  keyCount: 7,
  userID: 'U-9',
  brandName: 'Nike',
  productName: 'Air Jorden',
  optionGroupName: 'Size',
  skuCode: 'ABC-1',
  currencyCode: 'USD',
  errorCode: 'ER_ACCESS_DENIED_ERROR',
  statusCode: 500,
  className: 'PriceGroupRate',
  category: 'unrecognized',
  thrownShape: 'object',
  invalidRequestReason: 'missingBody',
  missingMethodName: 'calculateSkuPriceBasedOnPromotion',
  publishedIssueCount: 2,
  issueCount: 9,
  passedQualification: true,
  compassHeading: 12,
  quantity: 3,
  discountAmount: '52.47',
  amountType: 'percentageOff',
};

describe('the never-log policy fails closed rather than open', () => {
  it('withholds every near-miss credential, container and personal-data spelling', () => {
    const context: Record<string, string> = {};
    for (const key of NEAR_MISS_SENSITIVE_KEYS) {
      context[key] = `${PLANTED_SECRET}:${key}`;
    }
    const captured = captureError('near-miss spellings', context);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    for (const key of NEAR_MISS_SENSITIVE_KEYS) {
      expect(contextOf(captured)[key]).toBe(REDACTED);
    }
  });

  it('withholds a bare opaque secret, which content sanitization cannot recognize', () => {
    // No scheme prefix, no `key=value` shape, no statement, no path: nothing for
    // the content-based half of the policy to match. This is exactly the shape a
    // `secretKey` or `dbPass` member carries, which is why the key-based half
    // has to be the one that catches it.
    const bareToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.QWxhZGRpbjpvcGVuc2VzYW1l';
    const captured = captureError('token rejected', {
      secretKey: bareToken,
      jwt: bareToken,
      sessionKey: bareToken,
      dbPass: bareToken,
    });

    expect(captured.line).not.toContain(bareToken);
  });

  it('keeps every enumerated business identifier legible, so the engines stay traceable', () => {
    const identifiers = {
      productID: 'p1',
      productTypeID: 'pt1',
      skuID: 's1',
      skuCurrencyID: 'sc1',
      brandID: 'b1',
      categoryID: 'c1',
      optionID: 'o1',
      optionGroupID: 'og1',
      promotionID: 'pr1',
      promotionCodeID: 'pc1',
      promotionPeriodID: 'pp1',
      promotionQualifierID: 'pq1',
      promotionRewardID: 'prw1',
      promotionAppliedID: 'pa1',
      promotionAccountID: 'pac1',
      priceGroupID: 'pg1',
      priceGroupRateID: 'pgr1',
      roundingRuleID: 'rr1',
      orderID: 'or1',
      orderItemID: 'oi1',
      orderFulfillmentID: 'of1',
      accountID: 'ac1',
      addressID: 'ad1',
      addressZoneID: 'az1',
      shippingMethodID: 'sm1',
      shippingMethodOptionID: 'smo1',
      requestID: 'rq1',
      correlationID: 'co1',
    };
    const context = contextOf(captureError('applied', identifiers));

    for (const [key, value] of Object.entries(identifiers)) {
      expect(context[key]).toBe(value);
    }
  });

  it('leaves ordinary diagnostics legible, so failing closed costs no diagnosability', () => {
    const context = contextOf(captureError('diagnostics', LEGIBLE_DIAGNOSTIC_KEYS));

    for (const [key, value] of Object.entries(LEGIBLE_DIAGNOSTIC_KEYS)) {
      expect(context[key]).toBe(value);
    }
  });

  it('redacts a credential word that is a whole word of the key but not a substring elsewhere', () => {
    // `dbPass` splits into `db` + `pass`; `bypass` is one word. The two must not
    // be decided by the same rule, and this is the case that proves they are not.
    const context = contextOf(
      captureError('word boundaries', { dbPass: PLANTED_SECRET, bypass: 'enabled' }),
    );

    expect(context['dbPass']).toBe(REDACTED);
    expect(context['bypass']).toBe('enabled');
  });
});

describe('a container key is decided by the shape of its value', () => {
  it('recurses a structured container so each child is policed on its own name', () => {
    const captured = captureError('request received', {
      headers: {
        authorization: PLANTED_SECRET,
        'accept-language': 'en-US',
        // A header value carrying a slash. It is here because it is the shortest
        // proof that the content rules and the key rules do not interfere: the key
        // is legible, and the value is not mistaken for a filesystem path.
        'content-type': 'application/json',
      },
      env: { DB_PASSWORD: PLANTED_SECRET, AWS_REGION: 'us-east-1' },
    });
    const headers = objectAt(contextOf(captured), 'headers');

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(headers['authorization']).toBe(REDACTED);
    expect(headers['accept-language']).toBe('en-US');
    expect(headers['content-type']).toBe('application/json');
    expect(objectAt(contextOf(captured), 'env')['AWS_REGION']).toBe('us-east-1');
  });

  it('recurses an array container, redacting only the members the policy claims', () => {
    const captured = captureError('batch', {
      config: [{ dbPassword: PLANTED_SECRET, skuID: 's1' }],
    });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.line).toContain('s1');
  });

  it('withholds free text under a container name, which no key rule can see into', () => {
    const captured = captureError('request received', {
      headers: `authorization: Bearer ${PLANTED_SECRET}`,
      body: `{"password":"${PLANTED_SECRET}"}`,
      payload: PLANTED_SECRET,
    });
    const context = contextOf(captured);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(context['headers']).toBe(REDACTED);
    expect(context['body']).toBe(REDACTED);
    expect(context['payload']).toBe(REDACTED);
  });

  it('emits a container value that can hide no payload, rather than redacting it blindly', () => {
    const context = contextOf(captureError('settled', { settings: 42, config: null, env: true }));

    expect(context['settings']).toBe(42);
    expect(context['config']).toBeNull();
    expect(context['env']).toBe(true);
  });
});

describe("the policy leaves the caller's own object untouched", () => {
  it('redacts a copy, so the object the caller still holds is unchanged', () => {
    const supplied = {
      password: PLANTED_SECRET,
      headers: 'authorization: opaque',
      nested: { dbPass: PLANTED_SECRET },
    };
    const captured = captureError('configured', supplied);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(supplied.password).toBe(PLANTED_SECRET);
    expect(supplied.headers).toBe('authorization: opaque');
    expect(supplied.nested.dbPass).toBe(PLANTED_SECRET);
  });
});

// ---------------------------------------------------------------------------
// Everything the emitted line is required to be, independently of redaction
// ---------------------------------------------------------------------------

describe('the emitted entry', () => {
  it('is exactly one line, carrying no newline of its own', () => {
    const { line } = captureError('one entry');

    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toBeTypeOf('object');
  });

  it('carries a UTC timestamp with the Z designator, never a server-local one', () => {
    const timestamp = captureError('stamped').parsed['timestamp'];

    expect(typeof timestamp).toBe('string');
    expect(String(timestamp)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('omits the context member entirely when the caller supplied none', () => {
    expect(captureError('no context').parsed).not.toHaveProperty('context');
  });

  it('renders a date in UTC rather than in an ambient timezone', () => {
    const context = contextOf(
      captureError('dated', { occurredAt: new Date(Date.UTC(2024, 0, 2, 3, 4, 5)) }),
    );

    expect(context['occurredAt']).toBe('2024-01-02T03:04:05.000Z');
  });

  it('renders a bigint as its exact decimal digits instead of throwing', () => {
    const context = contextOf(captureError('counted', { rows: 9007199254740993n }));

    expect(context['rows']).toBe('9007199254740993');
  });

  it('describes a function and a symbol instead of silently dropping the key', () => {
    const context = contextOf(
      captureError('described', { callback: (): void => undefined, marker: Symbol('m') }),
    );

    expect(context['callback']).toBe('[Function]');
    expect(context['marker']).toBe('[Symbol]');
  });

  it('describes a class instance rather than walking into it', () => {
    class PriceGroupRate {
      public readonly amount = '10.00';
    }

    expect(contextOf(captureError('described', { rate: new PriceGroupRate() }))['rate']).toBe(
      '[PriceGroupRate]',
    );
  });

  it('truncates below the traversal bound rather than descending without limit', () => {
    const context = contextOf(
      captureError('deep', { a: { b: { c: { d: { e: 'unreachable' } } } } }),
    );
    const c = objectAt(objectAt(objectAt(context, 'a'), 'b'), 'c');

    expect(c['d']).toBe('[depth limit]');
  });
});

describe('threshold filtering', () => {
  it('suppresses an entry below the pinned threshold', () => {
    const lines: string[] = [];
    const subject = logger.withSink((line) => lines.push(line)).withLevel('error');

    subject.debug('suppressed');
    subject.info('suppressed');
    subject.warn('suppressed');
    subject.error('emitted');

    expect(lines).toHaveLength(1);
  });

  it('emits every level once the threshold is the lowest', () => {
    const lines: string[] = [];
    const subject = logger.withSink((line) => lines.push(line)).withLevel('debug');

    subject.debug('a');
    subject.info('b');
    subject.warn('c');
    subject.error('d');

    expect(
      lines.map((line) => String((JSON.parse(line) as { level: unknown }).level)),
    ).toStrictEqual(['debug', 'info', 'warn', 'error']);
  });

  it('keeps the pinned threshold when a further sink is attached', () => {
    const lines: string[] = [];
    logger
      .withLevel('error')
      .withSink((line) => lines.push(line))
      .info('suppressed');

    expect(lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The stream behind the default sink
//
// The module states, three times over, that EMISSION NEVER THROWS. Everything
// above drives it through an injected sink, which is the right way to assert
// content but which never touches the stream the exported logger actually writes
// to - and that stream is where the guarantee was previously false.
//
// A `process.stdout` backed by a PIPE is a `net.Socket`. Node does not report a
// broken pipe from `write()`: the write is accepted, and the `EPIPE` arrives
// afterwards as an `'error'` EVENT on the socket. No `try` around the write can
// intercept an event that is delivered on a later tick, and `EventEmitter`
// rethrows an `'error'` that has no listener - as an uncaught exception, killing
// the process and printing a stack trace, including absolute application paths,
// to stderr. Both halves of that are contract violations: the module promises
// emission never throws, and it promises stderr carries nothing.
//
// The cases below pin the mechanism that answers it, and they pin the bounds of
// that mechanism just as deliberately - one event, one stream, no process-level
// hook of any kind. `isolate: true` gives each suite file its own module
// registry, but `process` and `process.stdout` are per-PROCESS and shared with
// whatever else the worker runs, so the case that deliberately re-evaluates the
// module restores the listener set it found.
//
// NET-NEW, like the rest of this file. No legacy antecedent exists: the CFML
// original calls `writeLog()` and has no stream to break.
// ---------------------------------------------------------------------------

/** The absorber is identified by function name, which is its registration identity. */
const ABSORBER_NAME = 'absorbAsynchronousStdoutFailure';

/**
 * Every `process` event a shutdown or crash hook would plausibly be attached to.
 *
 * Asserted as a DELTA across a re-evaluation of the module rather than as an
 * absolute count, because the test runner legitimately owns listeners of its own
 * on `uncaughtException` and `unhandledRejection`. A delta attributes precisely,
 * an absolute count would either be wrong or would encode the runner's internals.
 */
const PROCESS_LIFECYCLE_EVENTS = [
  'SIGTERM',
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'exit',
  'beforeExit',
  'uncaughtException',
  'unhandledRejection',
] as const;

const processListenerCounts = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const event of PROCESS_LIFECYCLE_EVENTS) {
    counts[event] = process.listenerCount(event);
  }
  return counts;
};

describe('the stream behind the default sink cannot kill the process', () => {
  it('registers exactly one absorber for the stdout error event', () => {
    const absorbers = process.stdout.listeners('error').filter((l) => l.name === ABSORBER_NAME);

    // Importing this file imported the module, which registered at load. One, not
    // zero - zero is the defect - and not two, because registration is guarded on
    // listener identity.
    expect(absorbers).toHaveLength(1);
  });

  it('reads nothing off the error it absorbs', () => {
    const absorber = process.stdout.listeners('error').find((l) => l.name === ABSORBER_NAME);

    // Arity zero is the assertion. The handler declares no parameter, so the
    // `Error` the event carries is not in scope and cannot be published by it -
    // which matters, because a stream error's message is the same free text every
    // other error message is, and this module withholds those unconditionally.
    expect(absorber?.length).toBe(0);
  });

  it('answers an asynchronous stream failure instead of letting the emitter rethrow it', () => {
    const failure = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

    // `emit('error', e)` THROWS `e` when the event has no listener - that is
    // exactly how the uncaught exception was produced - and returns true when one
    // handled it. So the return value is the proof, not just the absence of a
    // throw.
    expect(() => {
      expect(process.stdout.emit('error', failure)).toBe(true);
    }).not.toThrow();
  });

  it('absorbs a stream failure that is not an Error at all', () => {
    // Nothing constrains what an emitter is handed. A handler that only tolerated
    // `Error` would reintroduce the crash for the awkward case.
    expect(() => {
      expect(process.stdout.emit('error', 'EPIPE')).toBe(true);
      expect(process.stdout.emit('error', undefined)).toBe(true);
    }).not.toThrow();
  });

  it('does not throw out of a level call when the underlying write fails synchronously', () => {
    // The other half of the guarantee, and the half a listener cannot cover: a
    // destroyed stream or a closed descriptor fails INSIDE `write`. The spy stands
    // in for that, and it also keeps this case from putting a line on the real
    // stdout. `restoreMocks` in vitest.config.ts undoes it.
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    });

    expect(() => {
      logger.error('emitted through the default sink');
    }).not.toThrow();

    // Twice: the entry itself, then the direct fallback that reports the sink
    // failure. The fallback throws too, and `writeLineDirectly` swallows it - which
    // is why the call above still returns normally.
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('registers no process signal or lifecycle hook when the module is evaluated', async () => {
    const before = processListenerCounts();
    const stdoutListenersBefore = process.stdout.listeners('error');

    // Force a genuine second evaluation. A plain dynamic import would be served
    // from the registry and would prove nothing about what module load does.
    vi.resetModules();
    const reimported = await import('../../../src/lib/logger.js');

    // Guard the guard: if this were the cached instance the deltas below would be
    // trivially zero and the case would assert nothing.
    expect(reimported.logger).not.toBe(logger);

    try {
      // The load-bearing assertion. Shutdown stays caller-driven; the module
      // installs nothing that could swallow a signal, delay an exit, or intercept
      // the runner's own crash reporting.
      expect(processListenerCounts()).toStrictEqual(before);

      // And the one thing it does install: a second module instance carries its own
      // function identity, so it registers its own single absorber. Both are no-ops
      // and one handled listener is all `EventEmitter` needs.
      const added = process.stdout
        .listeners('error')
        .filter((l) => !stdoutListenersBefore.includes(l));

      expect(added).toHaveLength(1);
      expect(added[0]?.name).toBe(ABSORBER_NAME);
    } finally {
      // `process.stdout` is shared with every other suite the worker runs. Leave it
      // exactly as it was found.
      for (const listener of process.stdout
        .listeners('error')
        .filter((l) => !stdoutListenersBefore.includes(l))) {
        process.stdout.removeListener('error', listener as (...args: unknown[]) => void);
      }

      expect(process.stdout.listeners('error')).toStrictEqual(stdoutListenersBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// Content sanitization: precise on both sides
//
// The rules that scrub string CONTENT are the only ones in the module that can
// destroy a legible message, and one of them replaces the WHOLE string. So they
// have two failure modes, not one, and both are defects:
//
//   * TOO NARROW - a credential, a statement or a private path is published.
//   * TOO BROAD  - an ordinary diagnostic is replaced by a marker, and the log
//                  line no longer says what happened. Enough of these and the
//                  module has failed at its actual job while appearing to be
//                  thorough about it.
//
// An earlier revision was measurably too broad. It treated ANY slash followed by
// two non-space characters as a path, so `and/or`, `50/50`, `TLSv1.2/1.3`,
// `10/second`, `verify-ca/verify-identity`, `GET /catalog/products?...` and
// `config/configORM.cfm:L9-L15` were all mangled, and its drive-letter arm read
// the `s` of `https:` as a drive and turned a documentation URL into
// `http[PATH REDACTED]`. Its SQL rule needed only two keywords in sequence, so
// "user chose to select a sku from the catalog list" and "update the pricing set
// for this price group" were each replaced in full.
//
// That reached this service's own output: `errorMapper.ts` publishes `route` and
// `fieldPaths` on every mapped error, so `POST /skus/resolve` and
// `body/selectedOptions` were being redacted - the exact fields those lines exist
// to carry.
//
// Both directions are therefore asserted below, in the same block, deliberately:
// a change that fixes one and breaks the other fails here.
// ---------------------------------------------------------------------------

/** Emit `message` with no context and return the message as the consumer sees it. */
function messageOf(message: string): string {
  const emitted = captureError(message).parsed['message'];
  if (typeof emitted !== 'string') {
    throw new Error('the emitted entry carries no string message');
  }
  return emitted;
}

/**
 * Ordinary diagnostics that must survive byte-for-byte.
 *
 * Every one of these was mangled by the previous rules. They are kept verbatim,
 * including the ones that read oddly, because each names a distinct mechanism:
 * an infix slash, a route, a hyphenated pair, a version pair, a ratio, a rate, a
 * URL, a legacy source locator, and the two sentences that merely CONTAINED SQL
 * keywords.
 */
const LEGIBLE_DIAGNOSTIC_MESSAGES: readonly string[] = [
  'promotion applied and/or reward stripped',
  'GET /catalog/products?productID=abc123',
  'transport mode verify-ca/verify-identity chosen',
  'accepted TLSv1.2/1.3 only',
  'discount split 50/50',
  'rate limit 10/second exceeded',
  'see https://slatwall.example.com/docs/x for context',
  'legacy site config/configORM.cfm:L9-L15 has no cfelse',
  'user chose to select a sku from the catalog list',
  'update the pricing set for this price group',
];

/** Every route this service serves, plus the field paths `errorMapper.ts` reports. */
const SERVICE_DIAGNOSTIC_MESSAGES: readonly string[] = [
  'POST /catalog/products',
  'POST /catalog/skus',
  'POST /promotions/application',
  'POST /prices/resolution',
  'GET /feeds/google/products',
  'invalid at body/selectedOptions and body/productID',
  'content-type application/json accepted',
];

/** Prose that opens with a statement keyword and still is not a statement. */
const STATEMENT_SHAPED_PROSE: readonly string[] = [
  'Select a sku from the list, please',
  'select skus from catalog before proceeding',
  'you can delete from the cart',
  'you can delete items from the list',
  'delete rows from the table where needed',
  'insert into the feed document',
  'we update the product set each night',
];

describe('content sanitization keeps an ordinary diagnostic intact', () => {
  it.each(LEGIBLE_DIAGNOSTIC_MESSAGES)('emits %j unchanged', (message) => {
    expect(messageOf(message)).toBe(message);
  });

  it.each(SERVICE_DIAGNOSTIC_MESSAGES)('emits %j unchanged', (message) => {
    expect(messageOf(message)).toBe(message);
  });

  it.each(STATEMENT_SHAPED_PROSE)('emits %j unchanged', (message) => {
    expect(messageOf(message)).toBe(message);
  });

  it('keeps a route legible in the context, which is where errorMapper puts it', () => {
    const context = contextOf(
      captureError('request failed', {
        route: 'POST /skus/resolve',
        fieldPaths: ['body/selectedOptions', 'body/productID'],
      }),
    );

    expect(context['route']).toBe('POST /skus/resolve');
    expect(context['fieldPaths']).toStrictEqual(['body/selectedOptions', 'body/productID']);
  });

  it('does not treat a slash inside a word as the start of a path', () => {
    // The mechanism, stated once directly: a path's leading slash must begin a
    // token. Every case above rests on this.
    expect(messageOf('a/b c/d e/f')).toBe('a/b c/d e/f');
  });
});

describe('content sanitization still withholds what it was built to withhold', () => {
  // Each row names the LOCATION that must not survive, so the assertion proves the
  // path is gone rather than merely that a marker appeared somewhere on the line.
  it.each([
    [
      'a POSIX path',
      'failed reading /tmp/blitzy/slatwall/secret-config.json',
      '/tmp/blitzy/slatwall/secret-config.json',
    ],
    ['a Lambda task path', 'module loaded from /var/task/index.js', '/var/task/index.js'],
    ['a home-directory key', 'key at /home/deploy/.ssh/id_rsa', '/home/deploy/.ssh/id_rsa'],
    ['a system binary', 'binary /usr/local/bin/node missing', '/usr/local/bin/node'],
    ['a layer path', 'layer at /opt/nodejs/node_modules/mysql2', '/opt/nodejs/node_modules/mysql2'],
    ['a system file', 'reading /etc/passwd denied', '/etc/passwd'],
    ['a procfs path', 'stat /proc/self/environ', '/proc/self/environ'],
    [
      'a Windows path',
      'cannot open C:\\Users\\deploy\\app\\secret.pem',
      'C:\\Users\\deploy\\app\\secret.pem',
    ],
    [
      'a Windows path with forward slashes',
      'cannot open D:/build/app/out.js',
      'D:/build/app/out.js',
    ],
    [
      'a stack frame',
      'at Object.<anonymous> (/tmp/blitzy/app/src/lib/logger.ts:1158:18)',
      '/tmp/blitzy/app/src/lib/logger.ts',
    ],
    // The scheme survives and the path does not, which is the point: `file://` says
    // where the module looked, `/var/task/index.js` says where the code lives.
    ['a file URI', 'loaded file:///var/task/index.js', '/var/task/index.js'],
    [
      'a frame under an unenumerated root',
      'at run (/workspaces/repo/src/lib/logger.ts:12:3)',
      '/workspaces/repo/src/lib/logger.ts',
    ],
  ])('replaces %s', (_label, message, location) => {
    const emitted = messageOf(message);

    expect(emitted).toContain('[PATH REDACTED]');
    expect(emitted).not.toContain(location);
  });

  it.each([
    [
      'a projection with a predicate',
      "SELECT s.skuID, s.skuCode FROM SwSku s WHERE s.skuCode = 'ABC'",
    ],
    ['an insert', "INSERT INTO SwPromoReward (promotionRewardID) VALUES ('x')"],
    ['a schema-qualified insert', "INSERT INTO Slatwall.SwSku (skuID) VALUES ('x')"],
    ['an update', "UPDATE SwSku SET price = 19.99 WHERE skuID = 'x'"],
    ['an aliased update with a qualified column', 'UPDATE SwSku s SET s.price = 1'],
    ['a delete', 'DELETE FROM SwPromotionApplied WHERE orderID = ?'],
    ['a bare delete', 'DELETE FROM SwSku'],
    ['a multi-table delete', 'DELETE t1 FROM SwSku t1 JOIN SwProduct t2 WHERE t1.x = ?'],
    ['a DDL statement', 'DROP TABLE SwSku'],
    ['a schema-qualified DDL statement', 'DROP TABLE Slatwall.SwSku'],
    ['an injection signature', 'SELECT 1 FROM SwSku UNION ALL SELECT 2 FROM SwProduct'],
    ['a labelled statement', 'query: SELECT * FROM SwSku'],
    ['a statement after a separator', 'ran migration; SELECT id FROM t WHERE x = 1'],
    [
      'a driver message quoting a statement and its bound value',
      "ER_PARSE_ERROR: You have an error near 'SELECT price FROM SwSku WHERE skuID = ''hunter2'''",
    ],
    [
      'a statement in a string that also contains prose "from the"',
      "error near 'SELECT * FROM SwSku' returned from the pool",
    ],
  ])('replaces %s in full', (_label, message) => {
    // In FULL: a statement's bound values sit inside the statement text, where no
    // key-and-value rule can reach them, so a partial scrub would leave the
    // interesting half behind.
    expect(messageOf(message)).toBe('[SQL REDACTED]');
  });

  it('withholds authorization material of every scheme', () => {
    expect(messageOf('header Basic ZGVwbG95OnN1cGVyc2VjcmV0cGFzc3dvcmQ=')).toBe(
      `header Basic ${REDACTED}`,
    );
    expect(messageOf('got Digest abcdef0123456789abcdef')).toBe(`got Digest ${REDACTED}`);
    expect(
      messageOf('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSM'),
    ).not.toContain('eyJ');
  });

  it('withholds the credential of a connection URI and keeps the rest', () => {
    // The authored scope of that rule is the credential half. The authority it
    // leaves behind was already outside its reach before the path rules were
    // narrowed - narrowing them changed which rule stops reading the URI, not what
    // the URI rule withholds.
    expect(messageOf('pool target mysql://slatwall:hunter2@db.internal:3306/Slatwall')).toBe(
      `pool target mysql://${REDACTED}@db.internal:3306/Slatwall`,
    );
  });

  it('withholds the value of a sensitive assignment and keeps a legible one', () => {
    expect(messageOf('connect failed password=hunter2 for user')).toBe(
      `connect failed password=${REDACTED} for user`,
    );
    expect(messageOf('retry with token: abc123def456')).toBe(`retry with token: ${REDACTED}`);
    expect(messageOf('apiKey => 9f3c2a91b47e')).toBe(`apiKey => ${REDACTED}`);
    expect(messageOf('resolved productID=abc123 for skuID=def456')).toBe(
      'resolved productID=abc123 for skuID=def456',
    );
  });
});

describe('the two accepted consequences of anchoring these rules', () => {
  it('does not redact a projection that carries no value at all', () => {
    // Two schema identifiers and nothing else: no operator, literal, placeholder,
    // punctuation or clause. This port publishes its schema identifiers as source
    // under src/repositories/mysql/sql/**, so there is nothing here to withhold -
    // and requiring a shape signal is what keeps ordinary sentences legible.
    expect(messageOf('SELECT skuCode FROM SwSku')).toBe('SELECT skuCode FROM SwSku');
  });

  it('does redact a clause-free delete, because nothing distinguishes it from one', () => {
    // `delete records from catalog` and `DELETE FROM catalog` are the same string
    // shape. A DELETE with no clause carries no value, so withholding costs a short
    // sentence, and for a statement shape that is the right direction to err.
    expect(messageOf('delete records from catalog')).toBe('[SQL REDACTED]');
  });
});

describe('the redaction record cannot be written through a prototype accessor', () => {
  /**
   * A context object whose own keys include `__proto__`.
   *
   * Built with `JSON.parse` rather than an object literal on purpose: in a
   * literal, `__proto__:` is the prototype-setting SYNTAX and produces no own
   * property at all, so a literal cannot express the input under test. `JSON.parse`
   * produces it as an ordinary own property - which is exactly the route a request
   * body, a header map or a parsed queue payload takes into a log context, with no
   * cooperation from the port.
   */
  function contextCarryingProtoKey(): LogContext {
    return JSON.parse(
      '{"__proto__":{"polluted":true},"password":"s3cret","ordinary":1}',
    ) as LogContext;
  }

  it('records a context key literally named __proto__ instead of silently dropping it', () => {
    const captured = captureError('operation failed', contextCarryingProtoKey());
    const context = captured.parsed['context'] as Record<string, unknown>;

    // Against a `{}` record this key is ABSENT: `redacted['__proto__'] = value`
    // invokes the inherited setter rather than creating a property, so the one key
    // an attacker chose is the one key missing from the audit record while every
    // key around it is present. That is the defect this pins.
    expect(Object.keys(context)).toContain('__proto__');
  });

  it('keeps the neighbouring keys intact, so the fix is not a shape change', () => {
    const captured = captureError('operation failed', contextCarryingProtoKey());
    const context = captured.parsed['context'] as Record<string, unknown>;

    // `JSON.stringify` serializes a null-prototype object exactly as it serializes
    // `{}`, so no ordinary key and no redaction outcome moves.
    expect(context['password']).toBe('[REDACTED]');
    expect(context['ordinary']).toBe(1);
  });

  it('does not let the write reassign the prototype of the record being built', () => {
    const captured = captureError('operation failed', contextCarryingProtoKey());
    const context = captured.parsed['context'] as Record<string, unknown>;

    // The value under `__proto__` is an object. Through the accessor that write
    // would have replaced the record's own prototype; as an own data property it is
    // recorded as data and nothing is inherited from it.
    expect((context as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.keys(context).sort()).toStrictEqual(['__proto__', 'ordinary', 'password']);
  });
});
