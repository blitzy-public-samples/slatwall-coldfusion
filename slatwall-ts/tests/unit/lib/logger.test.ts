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

import { describe, expect, it } from 'vitest';

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
