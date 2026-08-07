// slatwall-ts - unit suite for the structured logger.
//
// src/lib/logger.ts - the single dependency-free logger of the TypeScript / AWS Lambda
// `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing slice (`version.txt` =
// `3.1.39`).
//
// The centre of gravity of this suite is the module's NEVER-LOG POLICY, and specifically its
// content-based half: an error is reduced to a shape-validated class name and machine code.
//
// Every case below therefore plants a real secret or a real piece of personal data inside an error
// and then asserts that the emitted line does not contain it.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LogContext } from '../../../src/lib/logger.js';
import { logger } from '../../../src/lib/logger.js';

/**
 * The marker the module substitutes for anything the policy withholds.
 */
const REDACTED = '[REDACTED]';

/**
 * What the module substitutes for a name that is not shaped like a class name.
 */
const UNSAFE_ERROR_NAME = '[unsafe name]';

/**
 * Planted credential. Long, unique and free of regex metacharacters, so a substring search for it
 * cannot produce a false negative or a false positive.
 */
const PLANTED_SECRET = 'PLANTED-CREDENTIAL-8f3c2a91b47e';

/**
 * Planted personal data, of the kinds the never-log policy names by key.
 *
 * Both values are structurally unassignable, which is the point.
 *
 * The social-security number is invalid in all three of its groups at once, so it cannot ever have
 * been issued to a person: the SSA has never assigned an area number in the 900-999 range.
 */
const PLANTED_EMAIL = 'planted.person@example-customer.test';
const PLANTED_SSN = '900-00-0000';

/**
 * One emission, in both the form the sink received and the form a consumer parses.
 */
interface Captured {
  readonly line: string;
  readonly parsed: Record<string, unknown>;
}

/**
 * Emit one entry at `error` severity through a captured sink and return it.
 *
 * A pure local helper rather than a shared fixture: it holds no state, creates its own array per
 * call, and therefore cannot carry anything between tests.
 *
 * The threshold is pinned to `debug` so the entry is never filtered out by an ambient `LOG_LEVEL`.
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
 * Narrowed rather than cast so nothing widens to `any`, and throwing on the unexpected shape keeps
 * a mis-assertion loud instead of silently vacuous.
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
 * Build an error whose message and stack both carry the planted secret and the planted personal
 * data.
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

// The content-based half of the never-log policy.

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

    // The three members are present, so a reader can tell an error apart from any other value, and
    // can tell a withheld field from an absent one.
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
    // `name` is writable, so it is a second free-text channel unless it is shape tested. This is
    // what that test is for.
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
    // The driver builds its message from the server's error text and hangs the failing statement
    // off the error object; both are reproduced here as the driver shapes them. Neither may
    // survive into the line.
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
    // An error handed over as the whole context value, which the error mapper's unrecognized arm
    // can produce. It is classified at that call site too, so this is the second of two independent
    // defences rather than the only one.
    const captured = captureError('unrecognized failure', { error: errorCarryingPlantedData() });

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(objectAt(contextOf(captured), 'error')['stack']).toBe(REDACTED);
  });
});

// The serialization guard, which is the third place an error message could otherwise have reached
// the stream.

describe('the total serialization guard names a failure without quoting it', () => {
  it('reports the failure by type, without quoting the accessor that threw', () => {
    const context: LogContext = {
      get computed(): string {
        throw new Error(`accessor exploded: password=${PLANTED_SECRET}`);
      },
    };

    const captured = captureError('operation failed', context);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    // A fixed sentence, not the thrown value's class name.
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

    // The one case the guard does distinguish, because a cycle is this module's own controlled
    // signal rather than anything the caller produced.
    expect(captured.parsed['contextSerializationFailure']).toBe(
      'circular reference in log context',
    );
  });

  it('describes a non-error thrown while serializing', () => {
    // Typed `unknown` rather than written as a bare string literal, because the lint profile
    // forbids throwing a literal non-error - the value that reaches the guard is the same either
    // way.
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

// The key-based half of the policy, which the content-based half complements rather than replaces.

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
    const pool = objectAt(contextOf(captured), 'pool');

    expect(captured.line).not.toContain(PLANTED_SECRET);
    // The RECURSION still HAPPENED, which is what this case is really about: the wrapper survived
    // as an object and both of its children were decided individually.
    expect(Object.keys(pool)).toStrictEqual(['port', 'dbPassword']);
    expect(pool['dbPassword']).toBe(REDACTED);
    // `port` was `3306` here, and is NOW REDACTED. It is a number under a name no allow-list
    // carries, so the fail-closed context rule claims it - and that is the outcome this project
    // wants rather than a cost it pays.
    expect(pool['port']).toBe(REDACTED);
  });
});

// The policy fails closed.
//
// Every spelling in the first case below was measured going out in cleartext before the fix, so
// this is a characterization of a real disclosure rather than a hypothetical.

/**
 * Every near-miss key spelling that a purely exact-match policy emitted.
 *
 * Grouped the way the disclosure was found: credential-shaped names, then the container names that
 * can carry an entire environment or header map.
 */
const NEAR_MISS_SENSITIVE_KEYS: readonly string[] = [
  // Credential-shaped, 30 spellings.
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
  // Container names carrying free text, 10 spellings.
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
  // Personal data, 6 spellings.
  'firstName',
  'lastName',
  'address',
  'streetAddress',
  'postalCode',
  'ipAddress',
  // A product review's author is a customer's name.
  'author',
  'authorName',
  // The proxy and CDN spellings of a client address: the ones that actually arrive behind API
  // Gateway, and the ones runtime testing found emitted in cleartext beside an `authorization`
  // that was correctly redacted.
  'x-forwarded-for',
  'x-real-ip',
  'x-client-ip',
  'true-client-ip',
  'cf-connecting-ip',
  'forwarded',
  'sourceIP',
  // Account-recovery secrets, which reconstruct an account outright and read nothing like a
  // password to a reader enumerating password spellings.
  'mnemonic',
  'recoveryPhrase',
  'seedPhrase',
  'walletMnemonic',
];

/**
 * Diagnostics the policy AUTHORIZES by NAME, and what changed about this set.
 *
 * A fail-closed context surface trades a false-negative risk for a false-positive risk.
 *
 * `author` and `authorName` WENT the other WAY and are now redacted outright, so they appear in
 * `NEAR_MISS_SENSITIVE_KEYS` instead.
 */
const LEGIBLE_DIAGNOSTIC_KEYS: Readonly<Record<string, string | number | boolean>> = {
  bypass: true,
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
  quantity: 3,
  discountAmount: '52.47',
  amountType: 'percentageOff',
  route: 'POST /skus/resolve',
  occurredAt: '2024-01-02T03:04:05.000Z',
  rows: 12,
  // They are pinned because the code that emits them is worthless without them.
  ageInDays: 5,
  originalCurrencyCode: 'USD',
  convertToCurrencyCode: 'GBP',
};

/**
 * Names whose FORBIDDEN status is observable only in message content.
 *
 * A necessary companion to the fail-closed context rule, and the reason it is a separate fixture.
 *
 * Message content is where it is observable, because that surface still defaults to permissive: a
 * `word=value` pair is rewritten if and only if `isForbiddenKey` claims the word.
 */
const FORBIDDEN_IN_MESSAGES: readonly string[] = [
  // The wire spellings of a client address.
  'x-forwarded-for',
  'x-real-ip',
  'x-client-ip',
  'true-client-ip',
  'cf-connecting-ip',
  'forwarded',
  'sourceIP',
  // Account-recovery secrets, including the compound the fragment rule reaches.
  'mnemonic',
  'walletMnemonic',
  'seedPhrase',
  'recoveryPhrase',
  'backupPhrase',
  // A product review's author is a customer's name.
  'author',
  'authorName',
];

/**
 * Near-miss names that must stay legible inside a message.
 *
 * Each is a near neighbour of a sensitive fragment or word: `bypass` and `compassHeading` contain
 * `pass`, `cacheKey` and `keyCount` contain `key`, `userID` contains `user`, `skuCode` and
 * `statusCode` contain `code`.
 */
const NEAR_MISS_LEGIBLE_IN_MESSAGES: readonly string[] = [
  'bypass',
  'bypassFlag',
  'cacheKey',
  'keyCount',
  'compassHeading',
  'passedQualification',
  'skuCode',
  'statusCode',
  'userID',
];

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
    // No scheme prefix, no `key=value` shape, no statement, no path: nothing for the content-based
    // half of the policy to match.
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

  it('keeps the S-20 observability entries narrow, admitting no near neighbour of them', () => {
    // A fragment or word rule could not be what saves these: none of the four contains a sensitive
    // fragment.
    const nearNeighbours = ['age', 'rate', 'currencyRate', 'amount'] as const;

    const context: Record<string, string> = {};
    for (const key of nearNeighbours) {
      context[key] = `${PLANTED_SECRET}:${key}`;
    }
    const captured = captureError('S-20 near neighbours', context);

    expect(captured.line).not.toContain(PLANTED_SECRET);
    for (const key of nearNeighbours) {
      expect(contextOf(captured)[key]).toBe(REDACTED);
    }
  });

  it('redacts a credential word that is a whole word of the key but not a substring elsewhere', () => {
    // The distinction is asserted in the message, not in the context, and the move is forced by
    // the fail-closed context rule rather than chosen.
    const captured = captureError('word boundaries dbPass=s3cret-planted bypass=enabled');

    expect(String(captured.parsed['message'])).toContain(`dbPass=${REDACTED}`);
    expect(String(captured.parsed['message'])).toContain('bypass=enabled');
    // And the context surface still redacts the credential, by name, as before.
    expect(contextOf(captureError('word boundaries', { dbPass: PLANTED_SECRET }))['dbPass']).toBe(
      REDACTED,
    );
  });

  it('leaves every near-miss name legible inside a message, where the rules are the whole policy', () => {
    const message = NEAR_MISS_LEGIBLE_IN_MESSAGES.map((key) => `${key}=value-of-${key}`).join(' ');
    const emitted = String(captureError(message).parsed['message']);

    for (const key of NEAR_MISS_LEGIBLE_IN_MESSAGES) {
      expect(emitted).toContain(`${key}=value-of-${key}`);
    }
    expect(emitted).not.toContain(REDACTED);
  });
});

// The cases above establish that an ENUMERATED sensitive name is redacted.
//
// The gap they close was demonstrated at runtime rather than reasoned about.

describe('the context surface fails closed for an unauthorized key', () => {
  it('reproduces the demonstrated disclosure and shows it closed', () => {
    // The exact shape that leaked, including the wire spellings of a client address, which is how
    // one really arrives - inside a forwarded header map.
    const captured = captureError('request received', {
      headers: {
        authorization: `Bearer ${PLANTED_SECRET}`,
        'x-forwarded-for': '203.0.113.7, 198.51.100.4',
        'x-real-ip': '203.0.113.7',
        'accept-language': 'en-US',
      },
      mnemonic: `${PLANTED_SECRET}-twelve-word-phrase`,
      recoveryPhrase: `${PLANTED_SECRET}-recovery`,
      firstName: 'Jane',
    });
    const context = contextOf(captured);
    const headers = objectAt(context, 'headers');

    expect(captured.line).not.toContain(PLANTED_SECRET);
    expect(captured.line).not.toContain('203.0.113.7');
    expect(captured.line).not.toContain('198.51.100.4');
    expect(headers['authorization']).toBe(REDACTED);
    expect(headers['x-forwarded-for']).toBe(REDACTED);
    expect(headers['x-real-ip']).toBe(REDACTED);
    expect(context['mnemonic']).toBe(REDACTED);
    expect(context['recoveryPhrase']).toBe(REDACTED);
    expect(context['firstName']).toBe(REDACTED);
    // The content-negotiation header is still legible, because it is authorized by name. This is
    // the half of the fix that keeps a `headers` map worth recursing.
    expect(headers['accept-language']).toBe('en-US');
  });

  it('redacts a scalar under a name no allow-list carries, whatever the scalar is', () => {
    const context = contextOf(
      captureError('unauthorized scalars', {
        someUnknownField: PLANTED_SECRET,
        countOfThings: 41,
        hugeCounter: 9007199254740993n,
        happenedOn: new Date(Date.UTC(2024, 0, 2)),
      }),
    );

    // A STRING is the canonical hiding place. A NUMBER can be a card or account number in numeric
    // form.
    expect(context['someUnknownField']).toBe(REDACTED);
    expect(context['countOfThings']).toBe(REDACTED);
    expect(context['hugeCounter']).toBe(REDACTED);
    expect(context['happenedOn']).toBe(REDACTED);
  });

  it('keeps the key beside the marker, so the record stays truthful about what was supplied', () => {
    const context = contextOf(captureError('kept', { someUnknownField: PLANTED_SECRET }));

    // Dropping the member would be worse than redacting it: the line would look complete while a
    // field the caller supplied had vanished from the audit record.
    expect(Object.keys(context)).toContain('someUnknownField');
  });

  it('still traverses a plain object under an unauthorized name, and polices its children', () => {
    const context = contextOf(
      captureError('nested', {
        someWrapperNobodyListed: {
          password: PLANTED_SECRET,
          issueCount: 4,
          deeper: { emailAddress: PLANTED_EMAIL, statusCode: 500 },
        },
      }),
    );
    const wrapper = objectAt(context, 'someWrapperNobodyListed');
    const deeper = objectAt(wrapper, 'deeper');

    // A plain object holds no data of its own and every child returns to the same rule under its
    // own name, so admitting the wrapper concedes nothing.
    expect(wrapper['password']).toBe(REDACTED);
    expect(wrapper['issueCount']).toBe(4);
    expect(deeper['emailAddress']).toBe(REDACTED);
    expect(deeper['statusCode']).toBe(500);
  });

  it('summarizes an error under an unauthorized name, because the summary cannot be unsafe', () => {
    const context = contextOf(
      captureError('failed', { whateverICallIt: errorCarryingPlantedData() }),
    );
    const summary = objectAt(context, 'whateverICallIt');

    // `normalizeError` reduces an error to a shape-validated class name and code unconditionally,
    // so no key name could make the result disclose anything.
    expect(summary['name']).toBe('Error');
    expect(summary['message']).toBe(REDACTED);
    expect(context['whateverICallIt']).not.toBe(REDACTED);
  });

  it('admits an array whose members all police themselves, and refuses one that hides a scalar', () => {
    const context = contextOf(
      captureError('arrays', {
        unlistedErrors: [errorCarryingPlantedData(), errorCarryingPlantedData()],
        unlistedObjects: [{ statusCode: 500 }],
        unlistedStrings: [PLANTED_SECRET],
        unlistedNested: [[PLANTED_SECRET]],
      }),
    );

    // An array member has no name.
    expect(Array.isArray(context['unlistedErrors'])).toBe(true);
    expect(Array.isArray(context['unlistedObjects'])).toBe(true);
    expect(context['unlistedStrings']).toBe(REDACTED);
    expect(context['unlistedNested']).toBe(REDACTED);
  });

  it('emits the shapes that can hide nothing, whatever their key', () => {
    const context = contextOf(
      captureError('shapes', {
        someFlagNobodyListed: true,
        anotherFlag: false,
        nothingHere: null,
        callback: (): void => undefined,
        marker: Symbol('m'),
        instance: new (class PriceGroupRate {})(),
      }),
    );

    // A boolean carries one bit, `null` carries none, and a function, a symbol and a class
    // instance are DISCARDED in favour of a constant or a constructor name authored by this
    // codebase.
    expect(context['someFlagNobodyListed']).toBe(true);
    expect(context['anotherFlag']).toBe(false);
    expect(context['nothingHere']).toBeNull();
    expect(context['callback']).toBe('[Function]');
    expect(context['marker']).toBe('[Symbol]');
    expect(context['instance']).toBe('[PriceGroupRate]');
  });

  it('leaves every context key this service actually emits legible', () => {
    // The regression that would matter.
    const emitted: Readonly<Record<string, string | number | readonly string[]>> = {
      category: 'unrecognized',
      statusCode: 500,
      requestId: 'rq-1',
      route: 'POST /skus/resolve',
      missingMethodName: 'calculateSkuPriceBasedOnPromotion',
      className: 'Sku',
      fieldPaths: ['body/selectedOptions', 'body/productID'],
      publishedIssueCount: 2,
      issueCount: 9,
      // EMITTED by `invalidRequestResponse` IN PLACE of its FIELD PATHS, because a field path is
      // assembled from a caller's own key names and would then reach both a 400 body and the log
      // stream.
      fieldIssueCount: 2,
      thrownShape: 'object',
      errorCode: 'ER_ACCESS_DENIED_ERROR',
      invalidRequestReason: 'missingBody',
    };
    const context = contextOf(captureError('mapped', emitted));

    for (const [key, value] of Object.entries(emitted)) {
      if (Array.isArray(value)) {
        expect(context[key]).toStrictEqual(value);
      } else {
        expect(context[key]).toBe(value);
      }
    }
  });

  it('redacts every name this project added, inside a message, where the entry is observable', () => {
    const message = FORBIDDEN_IN_MESSAGES.map((key) => `${key}=${PLANTED_SECRET}-${key}`).join(' ');
    const captured = captureError(`supplied ${message}`);
    const emitted = String(captured.parsed['message']);

    for (const key of FORBIDDEN_IN_MESSAGES) {
      expect(emitted).toContain(`${key}=${REDACTED}`);
    }
    expect(captured.line).not.toContain(PLANTED_SECRET);
  });

  it('redacts a proxy address in a message without disclosing the address itself', () => {
    const emitted = String(
      captureError('proxied x-forwarded-for=203.0.113.7 x-real-ip=203.0.113.7').parsed['message'],
    );

    expect(emitted).toContain(`x-forwarded-for=${REDACTED}`);
    expect(emitted).toContain(`x-real-ip=${REDACTED}`);
    expect(emitted).not.toContain('203.0.113.7');
  });
});

describe('a container key is decided by the shape of its value', () => {
  it('recurses a structured container so each child is policed on its own name', () => {
    const captured = captureError('request received', {
      headers: {
        authorization: PLANTED_SECRET,
        'accept-language': 'en-US',
        // A header value carrying a slash. It is here because it is the shortest proof that the
        // content rules and the key rules do not interfere: the key is legible, and the value is
        // not mistaken for a filesystem path.
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

// Everything the emitted line is required to be, independently of redaction.

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

// The stream behind the default sink.
//
// The module states, three times over, that emission never throws.
//
// The cases below pin the mechanism that answers it, and they pin the bounds of that mechanism
// just as deliberately - one event, one stream, no process-level hook of any kind.

/**
 * The absorber is identified by function name, which is its registration identity.
 */
const ABSORBER_NAME = 'absorbAsynchronousStdoutFailure';

/**
 * Every `process` event a shutdown or crash hook would plausibly be attached to.
 *
 * Asserted as a DELTA across a re-evaluation of the module rather than as an absolute count.
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

    // Importing this file imported the module, which registered at load. One, not zero - zero is
    // the defect - and not two, because registration is guarded on listener identity.
    expect(absorbers).toHaveLength(1);
  });

  it('reads nothing off the error it absorbs', () => {
    const absorber = process.stdout.listeners('error').find((l) => l.name === ABSORBER_NAME);

    // Arity zero is the assertion.
    expect(absorber?.length).toBe(0);
  });

  it('answers an asynchronous stream failure instead of letting the emitter rethrow it', () => {
    const failure = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

    // `emit('error', e)` THROWS `e` when the event has no listener - that is exactly how the
    // uncaught exception was produced - and returns true when one handled it.
    expect(() => {
      expect(process.stdout.emit('error', failure)).toBe(true);
    }).not.toThrow();
  });

  it('absorbs a stream failure that is not an Error at all', () => {
    // Nothing constrains what an emitter is handed. A handler that only tolerated `Error` would
    // reintroduce the crash for the awkward case.
    expect(() => {
      expect(process.stdout.emit('error', 'EPIPE')).toBe(true);
      expect(process.stdout.emit('error', undefined)).toBe(true);
    }).not.toThrow();
  });

  it('does not throw out of a level call when the underlying write fails synchronously', () => {
    // The other half of the guarantee, and the half a listener cannot cover: a destroyed stream or
    // a closed descriptor fails INSIDE `write`.
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    });

    expect(() => {
      logger.error('emitted through the default sink');
    }).not.toThrow();

    // Twice: the entry itself, then the direct fallback that reports the sink failure. The
    // fallback throws too, and `writeLineDirectly` swallows it - which is why the call above still
    // returns normally.
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('registers no process signal or lifecycle hook when the module is evaluated', async () => {
    const before = processListenerCounts();
    const stdoutListenersBefore = process.stdout.listeners('error');

    // Force a genuine second evaluation. A plain dynamic import would be served from the registry
    // and would prove nothing about what module load does.
    vi.resetModules();
    const reimported = await import('../../../src/lib/logger.js');

    // Guard the guard: if this were the cached instance the deltas below would be trivially zero
    // and the case would assert nothing.
    expect(reimported.logger).not.toBe(logger);

    try {
      // The load-bearing assertion. Shutdown stays caller-driven; the module installs nothing that
      // could swallow a signal, delay an exit, or intercept the runner's own crash reporting.
      expect(processListenerCounts()).toStrictEqual(before);

      // And the one thing it does install: a second module instance carries its own function
      // identity, so it registers its own single absorber. Both are no-ops and one handled
      // listener is all `EventEmitter` needs.
      const added = process.stdout
        .listeners('error')
        .filter((l) => !stdoutListenersBefore.includes(l));

      expect(added).toHaveLength(1);
      expect(added[0]?.name).toBe(ABSORBER_NAME);
    } finally {
      // `process.stdout` is shared with every other suite the worker runs. Leave it exactly as it
      // was found.
      for (const listener of process.stdout
        .listeners('error')
        .filter((l) => !stdoutListenersBefore.includes(l))) {
        process.stdout.removeListener('error', listener as (...args: unknown[]) => void);
      }

      expect(process.stdout.listeners('error')).toStrictEqual(stdoutListenersBefore);
    }
  });
});

// Content sanitization: precise on both sides.
//
// TOO NARROW - a credential, a statement or a private path is published. * TOO BROAD - an ordinary
// diagnostic is replaced by a marker, and the log line no longer says what happened.

/**
 * Emit `message` with no context and return the message as the consumer sees it.
 */
function messageOf(message: string): string {
  const emitted = captureError(message).parsed['message'];
  if (typeof emitted !== 'string') {
    throw new Error('the emitted entry carries no string message');
  }
  return emitted;
}

/**
 * Ordinary diagnostics that must survive byte-for-byte.
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

/**
 * Every route this service serves, plus the field paths `errorMapper.ts` reports.
 */
const SERVICE_DIAGNOSTIC_MESSAGES: readonly string[] = [
  'POST /catalog/products',
  'POST /catalog/skus',
  'POST /promotions/application',
  'POST /prices/resolution',
  'GET /feeds/google/products',
  'invalid at body/selectedOptions and body/productID',
  'content-type application/json accepted',
];

/**
 * Prose that opens with a statement keyword and still is not a statement.
 */
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
    // The mechanism, stated once directly: a path's leading slash must begin a token. Every case
    // above rests on this.
    expect(messageOf('a/b c/d e/f')).toBe('a/b c/d e/f');
  });
});

describe('content sanitization still withholds what it was built to withhold', () => {
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
    // The scheme survives and the path does not, which is the point: `file://` says where the
    // module looked, `/var/task/index.js` says where the code lives.
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
    // In FULL: a statement's bound values sit inside the statement text, where no key-and-value
    // rule can reach them, so a partial scrub would leave the interesting half behind.
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
    // The authored scope of that rule is the credential half.
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

describe('the message surface examines EVERY pair, and masks a forbidden value WHOLE', () => {
  it('redacts the bare `user` and `username` spellings, as the context surface already did', () => {
    // The bare spellings matter as much as the prefixed one: redacting `dbUser=root` and the
    // CONTEXT key `user` while emitting `user=root` in a MESSAGE would leave two surfaces
    // disagreeing about one forbidden name.
    expect(messageOf('user=root')).toBe(`user=${REDACTED}`);
    expect(messageOf('username=root')).toBe(`username=${REDACTED}`);
    expect(messageOf('dbUser=root')).toBe(`dbUser=${REDACTED}`);
  });

  it('keeps `userID` legible, so closing that gap cost no traceability', () => {
    // The reason `user` is an EXACT entry rather than a fragment: `userID` is an opaque platform
    // handle this policy publishes on purpose, exactly like `accountID` beside it.
    expect(messageOf('userID=user-77 requestId=req-9')).toBe('userID=user-77 requestId=req-9');
  });

  it('is not defeated by a benign `word:` prefix in front of a forbidden pair', () => {
    // A scanner that consumes a non-forbidden pair's VALUE along with the pair lets `error:`
    // swallow `password=hunter2`, so the forbidden name is never examined at all.
    expect(messageOf('error: password=hunter2; user=root')).toBe(
      `error: password=${REDACTED}; user=${REDACTED}`,
    );
    expect(messageOf('ER_ACCESS_DENIED: secret=s3cr3t, token=t0k3n, orderID=abc123')).toBe(
      `ER_ACCESS_DENIED: secret=${REDACTED}, token=${REDACTED}, orderID=abc123`,
    );
  });

  it('masks a two-token value whole instead of leaving the material half behind', () => {
    // Masking that stops at the first whitespace emits `authorization=[REDACTED] xyz`, leaving the
    // bearer material behind, and `sql=[REDACTED] 1`.
    expect(messageOf('authorization=Bearer xyz')).toBe(`authorization=${REDACTED}`);
    expect(messageOf('sql=SELECT 1')).toBe(`sql=${REDACTED}`);
  });

  it('masks a connection string whole, with no stray bracket and no surviving authority', () => {
    // Running the URI rule first replaces the userinfo, and the assignment scan then stops at the
    // `]` of that marker - emitting `connectionString=[REDACTED]]@h/db`.
    expect(messageOf('connectionString=mysql://u:p@h/db')).toBe(`connectionString=${REDACTED}`);
  });

  it('stops a multi-token value at the next pair, so diagnostics beside it stay legible', () => {
    expect(messageOf('token=Bearer abc requestID=xyz789')).toBe(
      `token=${REDACTED} requestID=xyz789`,
    );
  });

  it('keeps the sentence after an ordinary single-token value', () => {
    // The counterweight to the case above: widening the span must not eat prose. A single-token
    // value is the common case and stays a single token.
    expect(messageOf('connect failed password=hunter2 for user')).toBe(
      `connect failed password=${REDACTED} for user`,
    );
  });

  it('withholds the account and the host of a driver authentication refusal', () => {
    // The canonical MySQL refusal is not an ASSIGNMENT, so the pair scanner never sees the account
    // name and only the trailing `password: YES` would be masked.
    const emitted = messageOf(
      "Access denied for user 'slatwall'@'localhost' (using password: YES)",
    );

    expect(emitted).not.toContain('slatwall');
    expect(emitted).not.toContain('localhost');
    expect(emitted).toBe(`Access denied for user ${REDACTED} (using password: ${REDACTED})`);
  });

  it('withholds the target of a driver connectivity failure, keeping the code', () => {
    expect(messageOf('connect ECONNREFUSED 127.0.0.1:3306')).toBe(
      `connect ECONNREFUSED ${REDACTED}`,
    );
    expect(messageOf('getaddrinfo ENOTFOUND slatwall-db.internal')).not.toContain(
      'slatwall-db.internal',
    );
    expect(messageOf('connect ETIMEDOUT 10.0.3.14:3306')).not.toContain('10.0.3.14');
  });

  it('is idempotent, so a re-sanitized line does not nest one marker inside another', () => {
    // `[REDACTED]` ends in a `]`, which is a value terminator - masking it again would emit
    // `password=[REDACTED]]`. An error's text is sanitized on the way in and again if it is
    // re-logged.
    expect(messageOf(`password=${REDACTED}`)).toBe(`password=${REDACTED}`);
  });
});

describe('the two accepted consequences of anchoring these rules', () => {
  it('does not redact a projection that carries no value at all', () => {
    // Two schema identifiers and nothing else: no operator, literal, placeholder, punctuation or
    // clause.
    expect(messageOf('SELECT skuCode FROM SwSku')).toBe('SELECT skuCode FROM SwSku');
  });

  it('does redact a clause-free delete, because nothing distinguishes it from one', () => {
    // `delete records from catalog` and `DELETE FROM catalog` are the same string shape.
    expect(messageOf('delete records from catalog')).toBe('[SQL REDACTED]');
  });
});

describe('a sensitive value longer than the scan budget does not leak its tail', () => {
  /**
   * The tail a leak publishes. Distinctive so `not.toContain` cannot pass by luck.
   */
  const TAIL_MARKER = 'TAIL-OF-THE-SECRET-abc123XYZ';

  /**
   * A single unbroken run of `length` characters ending in {@link TAIL_MARKER}.
   */
  function unbrokenSecret(length: number): string {
    const filler = 'A'.repeat(Math.max(0, length - TAIL_MARKER.length));

    return `${filler}${TAIL_MARKER}`;
  }

  it('withholds the tail of an UNQUOTED value longer than the 512-character budget', () => {
    const captured = captureError(`password=${unbrokenSecret(600)}`);

    expect(captured.line).not.toContain(TAIL_MARKER);
    expect(captured.line).not.toContain('AAAA');
    expect(messageOf(`password=${unbrokenSecret(600)}`)).toBe(`password=${REDACTED}`);
  });

  it('withholds the tail of a QUOTED value longer than the budget, and masks it whole', () => {
    const message = `password="${unbrokenSecret(700)}"`;
    const captured = captureError(message);

    expect(captured.line).not.toContain(TAIL_MARKER);
    expect(messageOf(message)).toBe(`password=${REDACTED}`);
  });

  it('withholds the tail of a continuation-head value - `token=Bearer <very long material>`', () => {
    const message = `token=Bearer ${unbrokenSecret(900)}`;
    const captured = captureError(message);

    expect(captured.line).not.toContain(TAIL_MARKER);
    expect(messageOf(message)).toBe(`token=${REDACTED}`);
  });

  it('keeps a LATER LINE legible, so withholding the remainder is bounded to one line', () => {
    // The fallback stops at the newline rather than at the end of the text: a sanitized `stack` is
    // many lines and only the line carrying the undelimited value is unsafe.
    const message = `password=${unbrokenSecret(600)}\n    at handler (orderID=abc123)`;
    const emitted = messageOf(message);

    expect(emitted).not.toContain(TAIL_MARKER);
    expect(emitted).toContain('orderID=abc123');
    expect(emitted).toBe(`password=${REDACTED}\n    at handler (orderID=abc123)`);
  });

  it('still stops at a real terminator inside the budget, so short values are unaffected', () => {
    expect(messageOf('password=hunter2; orderID=abc123')).toBe(
      `password=${REDACTED}; orderID=abc123`,
    );
    expect(messageOf('password="hunter2" orderID=abc123')).toBe(
      `password=${REDACTED} orderID=abc123`,
    );
  });

  it('remains idempotent over an already-masked long value', () => {
    expect(messageOf(`password=${REDACTED}`)).toBe(`password=${REDACTED}`);
  });
});

describe('the capability handlers can publish their own diagnostics in the clear', () => {
  // The five Lambda entrypoints publish operation and outcome fields that no allow-list carried.

  it('keeps every closed capability/operation/outcome literal legible', () => {
    const captured = captureError('catalog query served', {
      capability: 'catalogQuery',
      action: 'queryCatalog',
      operation: 'findProducts',
      outcome: 'served',
    });
    const context = contextOf(captured);

    expect(context['capability']).toBe('catalogQuery');
    expect(context['action']).toBe('queryCatalog');
    expect(context['operation']).toBe('findProducts');
    expect(context['outcome']).toBe('served');
  });

  it('keeps the per-invocation counts and the account-established boolean legible', () => {
    const captured = captureError('promotions applied', {
      accountEstablished: true,
      orderItemCount: 3,
      orderFulfillmentCount: 1,
      priceGroupIntentCount: 2,
      promotionIntentCount: 4,
      resolvedSkuCount: 3,
    });
    const context = contextOf(captured);

    expect(context['accountEstablished']).toBe(true);
    expect(context['orderItemCount']).toBe(3);
    expect(context['orderFulfillmentCount']).toBe(1);
    expect(context['priceGroupIntentCount']).toBe(2);
    expect(context['promotionIntentCount']).toBe(4);
    expect(context['resolvedSkuCount']).toBe(3);
  });

  it('refuses a name nothing in the service emits any longer', () => {
    const captured = captureError('served', {
      skuSelectorRefusal: 'noPriceGroupResolvedForSkuAndAccount',
    });
    const context = contextOf(captured);

    expect(context['skuSelectorRefusal']).toBe('[REDACTED]');
  });

  it('admits the names case-insensitively, as every other allow-list entry is admitted', () => {
    // `normalizeKey` lowercases and strips non-alphanumerics, so an authorization is a property of
    // the NAME rather than of one spelling of it.
    const captured = captureError('served', { Capability: 'productFeed', ORDER_ITEM_COUNT: 7 });
    const context = contextOf(captured);

    expect(context['Capability']).toBe('productFeed');
    expect(context['ORDER_ITEM_COUNT']).toBe(7);
  });

  it('STILL redacts a caller-chosen idempotency key, which was deliberately not admitted', () => {
    const captured = captureError('served', {
      idempotencyKey: 'caller-chosen-value',
      outcome: 'served',
    });
    const context = contextOf(captured);

    expect(context['idempotencyKey']).toBe(REDACTED);
    expect(context['outcome']).toBe('served');
  });

  it('does not admit a near-miss name that merely resembles one of the eleven', () => {
    // The allow-list stays CLOSED: widening it to eleven names does not widen it to anything
    // shaped like them.
    const captured = captureError('served', {
      capabilities: 'catalogQuery',
      operationDetail: 'findProducts',
      itemCount: 3,
    });
    const context = contextOf(captured);

    expect(context['capabilities']).toBe(REDACTED);
    expect(context['operationDetail']).toBe(REDACTED);
    expect(context['itemCount']).toBe(REDACTED);
  });

  it('does not let an authorized name launder a credential-shaped value', () => {
    // An authorized KEY still routes its value through the value rules, so a statement or a
    // connection string inside one is withheld on its own merits.
    const captured = captureError('served', {
      operation: 'mysql://root:hunter2@db.internal/Slatwall',
    });

    expect(captured.line).not.toContain('hunter2');
  });
});

describe('the redaction record cannot be written through a prototype accessor', () => {
  /**
   * A context object whose own keys include `__proto__`.
   *
   * Built with `JSON.parse` rather than an object literal on purpose: in a literal, `__proto__:`
   * is the prototype-setting SYNTAX and produces no own property at all.
   */
  function contextCarryingProtoKey(): LogContext {
    // `issueCount` rather than an arbitrary `ordinary` name: the neighbour has to be a key the
    // fail-closed context rule EMITS.
    return JSON.parse(
      '{"__proto__":{"polluted":true},"password":"s3cret","issueCount":1}',
    ) as LogContext;
  }

  it('records a context key literally named __proto__ instead of silently dropping it', () => {
    const captured = captureError('operation failed', contextCarryingProtoKey());
    const context = captured.parsed['context'] as Record<string, unknown>;

    // Against a `{}` record this key is ABSENT: `redacted['__proto__'] = value` invokes the
    // inherited setter rather than creating a property.
    expect(Object.keys(context)).toContain('__proto__');
  });

  it('keeps the neighbouring keys intact, so the fix is not a shape change', () => {
    const captured = captureError('operation failed', contextCarryingProtoKey());
    const context = captured.parsed['context'] as Record<string, unknown>;

    // `JSON.stringify` serializes a null-prototype object exactly as it serializes `{}`, so no
    // ordinary key and no redaction outcome moves.
    expect(context['password']).toBe('[REDACTED]');
    expect(context['issueCount']).toBe(1);
  });

  it('does not let the write reassign the prototype of the record being built', () => {
    const captured = captureError('operation failed', contextCarryingProtoKey());
    const context = captured.parsed['context'] as Record<string, unknown>;

    // The value under `__proto__` is an object. Through the accessor that write would have
    // replaced the record's own prototype; as an own data property it is recorded as data and
    // nothing is inherited from it.
    expect((context as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.keys(context).sort()).toStrictEqual(['__proto__', 'issueCount', 'password']);
  });
});

// The threshold arrives from validated configuration, and no environment variable is read here.
//
// Both are fixed by relocation rather than by removal of the feature.

describe('the adopted emission threshold', () => {
  /**
   * Restore the module-scope threshold after every case, so no case can depend on - or disturb -
   * another.
   */
  afterEach(() => {
    logger.adoptConfiguredThreshold(undefined);
  });

  /**
   * Parse a captured line into the record its consumer sees.
   */
  function parseLine(line: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(line);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('the emitted line is not a JSON object');
    }

    return parsed as Record<string, unknown>;
  }

  /**
   * Emit one entry at `level` with no pinned threshold, so the adopted one is what decides.
   */
  function emitUnpinned(level: 'debug' | 'info' | 'warn' | 'error'): string[] {
    const lines: string[] = [];
    logger.withSink((line) => lines.push(line))[level]('operation completed');
    return lines;
  }

  it('★★★ IGNORES `LOG_LEVEL` IN THE ENVIRONMENT ENTIRELY', () => {
    // The load-bearing assertion of the whole block. `debug` sits below the `info` floor, so if
    // this module still read the variable the entry would come out.
    vi.stubEnv('LOG_LEVEL', 'debug');

    expect(emitUnpinned('debug')).toHaveLength(0);
  });

  it('emits at the built-in floor before anything has been adopted', () => {
    // A process that fails during configuration resolution logs its own failure before any
    // threshold could have been adopted. That path has to work, and it works at `info`.
    expect(emitUnpinned('info')).toHaveLength(1);
    expect(emitUnpinned('debug')).toHaveLength(0);
  });

  it('★★ lowers the floor when a `debug` threshold is adopted', () => {
    logger.adoptConfiguredThreshold('debug');

    expect(emitUnpinned('debug')).toHaveLength(1);
  });

  it('★★ raises the floor when an `error` threshold is adopted', () => {
    logger.adoptConfiguredThreshold('error');

    expect(emitUnpinned('warn')).toHaveLength(0);
    expect(emitUnpinned('error')).toHaveLength(1);
  });

  it('restores the built-in floor when the adopted threshold is cleared', () => {
    logger.adoptConfiguredThreshold('debug');
    expect(emitUnpinned('debug')).toHaveLength(1);

    logger.adoptConfiguredThreshold(undefined);

    expect(emitUnpinned('debug')).toHaveLength(0);
    expect(emitUnpinned('info')).toHaveLength(1);
  });

  it('reaches a sibling logger built BEFORE the adoption, because the threshold is resolved per emission', () => {
    // The composition root adopts once, at the top of composition, while collaborators wired later
    // hold loggers derived earlier.
    const lines: string[] = [];
    const subject = logger.withSink((line) => lines.push(line));

    subject.debug('before');
    logger.adoptConfiguredThreshold('debug');
    subject.debug('after');

    expect(lines.map((line) => parseLine(line)['message'])).toStrictEqual(['after']);
  });

  it('★★ is overridden by a PINNED threshold, which is the narrower statement', () => {
    // `withLevel()` is a statement about one logger; an adopted threshold is a statement about the
    // process.
    logger.adoptConfiguredThreshold('error');

    const lines: string[] = [];
    logger
      .withSink((line) => lines.push(line))
      .withLevel('debug')
      .debug('pinned wins');

    expect(lines).toHaveLength(1);
  });

  it('★★★ EMITS NOTHING AT ALL ABOUT A MISTYPED `LOG_LEVEL`, AND ECHOES NO PART OF IT', () => {
    // The disclosure half, asserted structurally.
    vi.stubEnv('LOG_LEVEL', `verbose"\n{"level":"error","message":"forged ${PLANTED_SECRET}"}`);

    const lines: string[] = [];
    logger.withSink((line) => lines.push(line)).error('operation failed');

    expect(lines).toHaveLength(1);
    expect(parseLine(lines[0] ?? '')['message']).toBe('operation failed');
    expect(lines[0]).not.toContain(PLANTED_SECRET);
    expect(lines[0]).not.toContain('forged');
    expect(lines[0]).not.toContain('verbose');
    expect(lines[0]).not.toContain('LOG_LEVEL');
  });

  it('★★ keeps the adoption seam OFF every derived logger and off every injected one', () => {
    // The seam is declared on `ProcessLogger`, a supertype of `Logger` that only the exported
    // binding has.
    const derivedFromSink: unknown = logger.withSink(() => undefined);
    const derivedFromLevel: unknown = logger.withLevel('debug');

    expect(logger).toHaveProperty('adoptConfiguredThreshold');
    expect(derivedFromSink).not.toHaveProperty('adoptConfiguredThreshold');
    expect(derivedFromLevel).not.toHaveProperty('adoptConfiguredThreshold');
  });

  it('cannot be reshaped at run time', () => {
    // Frozen for the same reason the emitting surface is: an exported singleton whose methods
    // could be replaced is an injection point.
    expect(Object.isFrozen(logger)).toBe(true);
  });

  it("does not throw when the adopted threshold is set through a throwing sink's logger", () => {
    // Adoption is a plain assignment and touches no sink, so a broken sink cannot make configuring
    // the threshold fail.
    const failing = vi.fn((): never => {
      throw new Error('the sink is broken');
    });

    expect(() => {
      logger.adoptConfiguredThreshold('debug');
      logger.withSink(failing).debug('operation failed');
    }).not.toThrow();

    expect(failing).toHaveBeenCalledTimes(1);
  });
});
