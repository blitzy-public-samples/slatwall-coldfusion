// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the primary-adapter error mapper
//
// WHAT THIS PINS
//   src/handlers/errorMapper.ts - the one place in the TypeScript / AWS Lambda
//   `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing slice
//   (`version.txt` = `3.1.39`) that decides which failures are describable to a
//   caller and which are not.
//
//   Two obligations pull in opposite directions here, and every case below exists
//   to hold both at once:
//
//     1. ONE message must survive verbatim. The CFML framework's terminal
//        dead-call-target throw is an OBSERVABLE BEHAVIOURAL CONTRACT, identical
//        at [org/Hibachi/HibachiEntity.cfc:L565] and
//        [org/Hibachi/HibachiService.cfc:L280], grammatical error and all. If the
//        recognizer stops matching it, the contract is silently lost to the
//        generic arm and nothing else in the system notices.
//     2. EVERYTHING ELSE must be withheld - from the response body AND from the
//        log line. The pinned MySQL driver composes its error message out of the
//        server's own error text and hangs the failing statement off the error
//        object, so for a syntax or constraint failure the message itself embeds
//        the failing SQL fragment and its bound values. A validation failure
//        quotes the rejected input; a connection failure names the host and the
//        account. A log line is durable and centrally aggregated, so publishing
//        any of that there rather than in a body changes who can read it, not
//        whether it leaked.
//
//   The withholding cases therefore assert against the RAW EMITTED LOG LINE and
//   the raw response body, not only against parsed fields: an assertion that
//   inspected a named field would pass while the credential still shipped inside
//   a field this suite did not think to look at.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE
// PRESENTED AS PARITY.
// ---------------------------------------------------------------------------
//   The module is created from scratch - the plan's handler transformation table
//   records its source file as "-" and its change as "No legacy equivalent; maps
//   domain errors to API Gateway responses". The legacy suite contains nothing
//   whatsoever for the handler tier: meta/tests/unit/service/ holds only
//   AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
//   UtilityRBServiceTest, none of them in scope, and there is no handler tier in
//   the legacy architecture to have tested.
//
//   The only legacy suites extended anywhere in this port are
//   [meta/tests/unit/entity/BrandTest.cfc] and
//   [meta/tests/unit/entity/ProductTest.cfc], and
//   [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
//   contributing zero coverage. No case below has a legacy antecedent and none is
//   presented as one. The recognized MESSAGE is legacy; the mapping around it is
//   not, and the distinction is kept explicit.
//
// HOW THE SUBJECT IS DRIVEN
//   Through the optional `logger` on `ErrorMappingContext`, which is the seam the
//   module publishes for exactly this purpose. Every exported function has one
//   side effect - a single emission through that logger - and returns a value
//   derived from nothing but its arguments, so every branch including what is and
//   is not written to the log is drivable without patching a global stream or
//   reading the process environment.
//
// NO USER RULES WERE PROVIDED
//   The project rules source returns exactly that, and the plan records it
//   outright. No rule is invented here and no assertion below is attributed to
//   one; each traces to the plan, to the cited legacy locator, or to the module's
//   own documented contract.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { ErrorMappingContext, ErrorResponseBody } from '../../../src/handlers/errorMapper.js';
import {
  invalidRequestResponse,
  mapErrorToApiGatewayResponse,
  routeNotFoundResponse,
} from '../../../src/handlers/errorMapper.js';
import type { LogContext, LogLevel, Logger, LogSink } from '../../../src/lib/logger.js';

// ---------------------------------------------------------------------------
// Test doubles and planted data
// ---------------------------------------------------------------------------

/**
 * Planted credential and personal data. Long, unique and free of regex
 * metacharacters, so a substring search cannot produce a false result either way.
 */
const PLANTED_SECRET = 'PLANTED-CREDENTIAL-5b1d7e04c396';
const PLANTED_EMAIL = 'planted.person@example-customer.test';

/** A correlation identifier, shaped like the one API Gateway supplies. */
const REQUEST_ID = 'c0ffee00-1111-2222-3333-444455556666';

/** One captured emission, in the form the module handed to the logger. */
interface CapturedEmission {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext | undefined;
  /** The serialized form, so a leak anywhere in the payload is detectable. */
  readonly serialized: string;
}

/**
 * A logger that records rather than emits.
 *
 * A hand-written double rather than a mock framework: it needs no lifecycle, it
 * holds only its own array, and a fresh one is built inside every test - which
 * matters in this port because module-level state surviving between unrelated
 * invocations on a warm container is precisely the hazard four legacy
 * component-level caches are re-scoped to avoid.
 *
 * `withLevel` and `withSink` return the same recorder. Neither is exercised by
 * this module, and returning a divergent object would make the double lie about
 * what the subject did.
 */
function createRecordingLogger(): {
  readonly logger: Logger;
  readonly emissions: CapturedEmission[];
} {
  const emissions: CapturedEmission[] = [];

  const record = (level: LogLevel, message: string, context?: LogContext): void => {
    emissions.push({
      level,
      message,
      context,
      // `undefined` members vanish under serialization exactly as they do in the
      // real logger, so the recorded string is what would have been emitted.
      serialized: JSON.stringify({ level, message, context }),
    });
  };

  const recorder: Logger = {
    debug: (message: string, context?: LogContext): void => record('debug', message, context),
    info: (message: string, context?: LogContext): void => record('info', message, context),
    warn: (message: string, context?: LogContext): void => record('warn', message, context),
    error: (message: string, context?: LogContext): void => record('error', message, context),
    withLevel: (_level: LogLevel): Logger => recorder,
    withSink: (_sink: LogSink): Logger => recorder,
  };

  return { logger: recorder, emissions };
}

/** A context carrying the recording logger and a route, as a handler would. */
function contextWith(logger: Logger): ErrorMappingContext {
  return { requestId: REQUEST_ID, route: 'POST /skus/resolve', logger };
}

/** Parse a response body, narrowing rather than casting blindly. */
function bodyOf(body: string | undefined): ErrorResponseBody['error'] {
  if (body === undefined) {
    throw new Error('the response carried no body');
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    throw new Error('the response body is not the documented envelope');
  }
  const { error } = parsed;
  if (typeof error !== 'object' || error === null) {
    throw new Error('the response envelope carries no error object');
  }
  return error as ErrorResponseBody['error'];
}

/** Read the single emission a call is documented to produce. */
function soleEmission(emissions: readonly CapturedEmission[]): CapturedEmission {
  expect(emissions).toHaveLength(1);
  const [emission] = emissions;
  if (emission === undefined) {
    throw new Error('nothing was emitted');
  }
  return emission;
}

/** Read the recorded context as an object. */
function contextOf(emission: CapturedEmission): Record<string, unknown> {
  const { context } = emission;
  if (context === undefined) {
    throw new Error('the emission carried no context');
  }
  return context;
}

// ---------------------------------------------------------------------------
// The one message that must survive verbatim
// ---------------------------------------------------------------------------

describe('the framework dead-call-target contract', () => {
  /**
   * The legacy message, reproduced exactly as both framework tiers throw it -
   * including the grammatical error "does not exists" and the word "entity",
   * which the SERVICE tier emits too because its copy is byte-identical.
   */
  const CONTRACT_MESSAGE =
    'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

  it('preserves the message verbatim in the response body', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(new Error(CONTRACT_MESSAGE), contextWith(logger));

    expect(response.statusCode).toBe(500);
    expect(bodyOf(response.body).category).toBe('missingMethod');
    expect(bodyOf(response.body).message).toBe(CONTRACT_MESSAGE);
    expect(emissions).toHaveLength(1);
  });

  it('keeps the grammatical error rather than correcting it', () => {
    const { logger } = createRecordingLogger();

    const message = bodyOf(
      mapErrorToApiGatewayResponse(new Error(CONTRACT_MESSAGE), contextWith(logger)).body,
    ).message;

    expect(message).toContain('does not exists');
    expect(message).not.toContain('does not exist in');
  });

  it('recognizes the identical service-tier message through the same recognizer', () => {
    const { logger } = createRecordingLogger();
    const serviceTier =
      'You have called a method getSkuStocksDeletableFlag() which does not exists in the SkuService entity.';

    expect(
      bodyOf(mapErrorToApiGatewayResponse(new Error(serviceTier), contextWith(logger)).body)
        .category,
    ).toBe('missingMethod');
  });

  it('does NOT recognize the contract as a bare thrown string, because no producer throws one', () => {
    const { logger } = createRecordingLogger();

    // This case previously asserted the opposite, on the grounds that `throw('<x>')`
    // is what the LEGACY CFML construct emits. That premise does not survive
    // contact with the target: no CFML runs here, and every one of the 163 `throw`
    // sites in `src/**` is `throw new ...` - the seven that raise this very
    // contract included [src/domain/entities/promotionPeriod.ts:L1379, L1407,
    // L1433, L1468; src/domain/entities/promotionAccount.ts:L560, L563, L634].
    // The recognizer therefore requires a real `Error`, which removes a shape a
    // caller could forge without rejecting any producer that exists.
    //
    // The byte-exact-message requirement is untouched and is still covered: the
    // first case in this block maps `new Error(CONTRACT_MESSAGE)` and gets the
    // contract back verbatim.
    const body = bodyOf(mapErrorToApiGatewayResponse(CONTRACT_MESSAGE, contextWith(logger)).body);

    expect(body.category).toBe('unrecognized');
    expect(body.message).not.toBe(CONTRACT_MESSAGE);
  });

  it('logs the dead call target and the class without echoing them into the body', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(new Error(CONTRACT_MESSAGE), contextWith(logger));
    const context = contextOf(soleEmission(emissions));

    expect(context['missingMethodName']).toBe('calculateSkuPriceBasedOnPromotion');
    expect(context['className']).toBe('Sku');
    expect(response.body).not.toContain('className');
  });

  it('does NOT conflate the framework\u2019s third, grammatically correct variant with the contract', () => {
    const { logger } = createRecordingLogger();
    // [org/Hibachi/HibachiObject.cfc:L126] - "does not exist", no `()`, no
    // trailing period. A different shape, deliberately not recognized.
    const otherVariant =
      'You have attempted to call the method getFoo which does not exist in Slatwall.model.entity.Sku';

    expect(
      bodyOf(mapErrorToApiGatewayResponse(otherVariant, contextWith(logger)).body).category,
    ).toBe('unrecognized');
  });
});

// ---------------------------------------------------------------------------
// Everything else: withheld from the body AND from the log
// ---------------------------------------------------------------------------

describe('an unrecognized failure', () => {
  it('publishes the fixed generic sentence and nothing of the failure', () => {
    const { logger } = createRecordingLogger();
    const driverFailure: Error & { sql?: string; sqlMessage?: string } = new Error(
      "You have an error in your SQL syntax near 'FROM SwSku'",
    );
    driverFailure.sql = `SELECT * FROM SwSku WHERE skuCode = '${PLANTED_SECRET}'`;
    driverFailure.sqlMessage = `duplicate entry '${PLANTED_EMAIL}'`;

    const response = mapErrorToApiGatewayResponse(driverFailure, contextWith(logger));

    expect(response.statusCode).toBe(500);
    expect(bodyOf(response.body).message).toBe('The request could not be completed.');
    expect(response.body).not.toContain(PLANTED_SECRET);
    expect(response.body).not.toContain(PLANTED_EMAIL);
    expect(response.body).not.toContain('SwSku');
  });

  it('hands the logger a classification and NOT the thrown value', () => {
    const { logger, emissions } = createRecordingLogger();
    const driverFailure: Error & { sql?: string } = new Error(
      `Access denied for user 'slatwall' using password ${PLANTED_SECRET}`,
    );
    driverFailure.sql = `SELECT * FROM SwSku WHERE skuCode = '${PLANTED_SECRET}'`;

    mapErrorToApiGatewayResponse(driverFailure, contextWith(logger));
    const emission = soleEmission(emissions);

    // Not merely absent from a field this suite named - absent from the entire
    // serialized payload the module handed over.
    expect(emission.serialized).not.toContain(PLANTED_SECRET);
    expect(emission.serialized).not.toContain('Access denied');
    expect(contextOf(emission)).not.toHaveProperty('error');
  });

  it('reports the error class name as the shape', () => {
    const { logger, emissions } = createRecordingLogger();

    mapErrorToApiGatewayResponse(new TypeError('not a function'), contextWith(logger));

    expect(contextOf(soleEmission(emissions))['thrownShape']).toBe('TypeError');
  });

  it('replaces a class name that is prose rather than a classifier', () => {
    const { logger, emissions } = createRecordingLogger();
    const failure = new Error('boom');
    failure.name = `not a class name: password=${PLANTED_SECRET}`;

    mapErrorToApiGatewayResponse(failure, contextWith(logger));
    const emission = soleEmission(emissions);

    expect(emission.serialized).not.toContain(PLANTED_SECRET);
    expect(contextOf(emission)['thrownShape']).toBe('unsafeName');
  });

  it('reports a machine code, which is what tells one infrastructure failure from another', () => {
    const { logger, emissions } = createRecordingLogger();
    const failure: Error & { code?: string } = new Error('connect ECONNREFUSED 127.0.0.1:3306');
    failure.code = 'ECONNREFUSED';

    const response = mapErrorToApiGatewayResponse(failure, contextWith(logger));

    expect(contextOf(soleEmission(emissions))['errorCode']).toBe('ECONNREFUSED');
    // The host and port live in the message, so neither may reach the body.
    expect(response.body).not.toContain('127.0.0.1');
    expect(response.body).not.toContain('3306');
  });

  it('declines a code that is prose rather than a machine token', () => {
    const { logger, emissions } = createRecordingLogger();
    const failure: Error & { code?: string } = new Error('rejected');
    failure.code = `SELECT * FROM SwSku WHERE token = '${PLANTED_SECRET}'`;

    mapErrorToApiGatewayResponse(failure, contextWith(logger));
    const emission = soleEmission(emissions);

    expect(emission.serialized).not.toContain(PLANTED_SECRET);
    expect(contextOf(emission)['errorCode']).toBeUndefined();
  });

  it('withholds a thrown string, which is not an Error and so would otherwise be emitted verbatim', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(
      `connection failed for password=${PLANTED_SECRET}`,
      contextWith(logger),
    );
    const emission = soleEmission(emissions);

    expect(response.body).not.toContain(PLANTED_SECRET);
    expect(emission.serialized).not.toContain(PLANTED_SECRET);
    expect(contextOf(emission)['thrownShape']).toBe('string');
  });

  it('withholds a thrown plain object, whose members a key-based policy would traverse', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(
      { detail: `password=${PLANTED_SECRET}`, submittedBy: PLANTED_EMAIL },
      contextWith(logger),
    );
    const emission = soleEmission(emissions);

    expect(response.body).not.toContain(PLANTED_SECRET);
    expect(emission.serialized).not.toContain(PLANTED_SECRET);
    expect(emission.serialized).not.toContain(PLANTED_EMAIL);
    expect(contextOf(emission)['thrownShape']).toBe('object');
  });

  it('describes a thrown null and a thrown undefined without failing', () => {
    const { logger, emissions } = createRecordingLogger();

    expect(mapErrorToApiGatewayResponse(null, contextWith(logger)).statusCode).toBe(500);
    expect(mapErrorToApiGatewayResponse(undefined, contextWith(logger)).statusCode).toBe(500);
    expect(emissions.map((emission) => emission.context?.['thrownShape'])).toStrictEqual([
      'null',
      'undefined',
    ]);
  });

  it('carries the correlation identifier into the body so the withheld detail stays reachable', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(new Error('opaque'), contextWith(logger));

    expect(bodyOf(response.body).requestId).toBe(REQUEST_ID);
    expect(contextOf(soleEmission(emissions))['requestId']).toBe(REQUEST_ID);
  });
});

// ---------------------------------------------------------------------------
// The client-shaped arms
// ---------------------------------------------------------------------------

describe('a schema-rejected request input', () => {
  /**
   * A GENUINE `ZodError` from the pinned validation library.
   *
   * This fixture used to FORGE the shape - `new Error()` with `name` reassigned to
   * `'ZodError'` and an `issues` array bolted on - because the recognizer used to
   * accept anything wearing that shape. It no longer does: recognition is now an
   * `instanceof ZodError` test, so a forged object falls to the generic arm (proved
   * directly by the last case in this block). The fixture is therefore constructed
   * through the library's own constructor, which is also what the production
   * producer hands the mapper: `safeParse` returns exactly this type.
   */
  function validationFailure(): unknown {
    return new ZodError([
      { code: 'custom', path: ['selectedOptions'], message: 'Too many elements' },
      { code: 'custom', path: ['productID', 0], message: 'Invalid identifier' },
    ] as never);
  }

  it('publishes the field paths and the constraint descriptions', () => {
    const { logger } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(validationFailure(), contextWith(logger));
    const body = bodyOf(response.body);

    expect(response.statusCode).toBe(400);
    expect(body.category).toBe('invalidRequest');
    expect(body.message).toBe('The request input is not valid.');
    expect(body.fields).toStrictEqual([
      { path: 'selectedOptions', message: 'Too many elements' },
      { path: 'productID.0', message: 'Invalid identifier' },
    ]);
  });

  it('logs the paths at warning severity and never the submitted values', () => {
    const { logger, emissions } = createRecordingLogger();

    mapErrorToApiGatewayResponse(validationFailure(), contextWith(logger));
    const emission = soleEmission(emissions);

    expect(emission.level).toBe('warn');
    expect(contextOf(emission)['fieldPaths']).toStrictEqual(['selectedOptions', 'productID.0']);
  });

  it('treats a validation failure with no renderable issues as recognized, not as generic', () => {
    const { logger } = createRecordingLogger();
    const failure = new ZodError([] as never);

    const body = bodyOf(mapErrorToApiGatewayResponse(failure, contextWith(logger)).body);

    expect(body.category).toBe('invalidRequest');
    expect(body).not.toHaveProperty('fields');
  });

  it('REFUSES a forged validation failure, so the echo path cannot be driven by shape alone', () => {
    const { logger } = createRecordingLogger();

    // Type confusion, stated as a test. `name` is an ordinary writable property and
    // `issues` is just an array, so before recognition became an `instanceof` test
    // ANY object could wear this shape - and a deserialized request body is such an
    // object. Wearing it bought the forger the one response path that echoes
    // attacker-authored text (`issue.message`) back into the body under a 400.
    const forged: Error & { issues?: readonly unknown[] } = new Error('invalid input');
    forged.name = 'ZodError';
    forged.issues = [{ path: ['selectedOptions'], message: 'ATTACKER CONTROLLED TEXT' }];

    const response = mapErrorToApiGatewayResponse(forged, contextWith(logger));
    const body = bodyOf(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.category).toBe('unrecognized');
    expect(body).not.toHaveProperty('fields');
    expect(response.body).not.toContain('ATTACKER CONTROLLED TEXT');
  });

  it('bounds the published issue count, and logs how many were withheld', () => {
    const { logger, emissions } = createRecordingLogger();

    // 25 issues against a published ceiling of 20.
    const many = new ZodError(
      Array.from({ length: 25 }, (_unused, index) => ({
        code: 'custom',
        path: [`field${String(index)}`],
        message: `constraint ${String(index)}`,
      })) as never,
    );

    const body = bodyOf(mapErrorToApiGatewayResponse(many, contextWith(logger)).body);

    expect(body.fields).toHaveLength(20);
    // The true count is recorded for the operator without being echoed to the caller.
    expect(contextOf(soleEmission(emissions))['issueCount']).toBe(25);
    expect(contextOf(soleEmission(emissions))['publishedIssueCount']).toBe(20);
  });

  it('clamps an over-long constraint description and an over-deep path', () => {
    const { logger } = createRecordingLogger();

    const failure = new ZodError([
      {
        code: 'custom',
        // 15 segments against a ceiling of 10, and one segment over 64 characters.
        path: Array.from({ length: 15 }, (_unused, index) => `s${String(index)}`).concat([
          'x'.repeat(120),
        ]),
        message: 'm'.repeat(500),
      },
    ] as never);

    const [field] =
      bodyOf(mapErrorToApiGatewayResponse(failure, contextWith(logger)).body).fields ?? [];
    if (field === undefined) {
      throw new Error('the mapper published no field issue');
    }

    // A message is bounded at 200 characters INCLUDING the ellipsis, and the path
    // stops at 10 rendered segments with a marker recording that it was cut.
    expect(field.message).toHaveLength(200);
    expect(field.message.endsWith('...')).toBe(true);
    const renderedSegments = field.path.split('.').filter((segment) => segment.length > 0);
    expect(renderedSegments).toHaveLength(10);
    expect(renderedSegments[0]).toBe('s0');
    expect(renderedSegments[9]).toBe('s9');
    expect(field.path.endsWith('...')).toBe(true);
    // The over-long 16th segment is never reached, so its 120 characters cannot
    // reach the body by either route - the segment cap stops the walk before the
    // per-segment clamp would have had to.
    expect(field.path).not.toContain('x'.repeat(65));
  });
});

describe('the router and handler entry points', () => {
  it('answers an unmatched route without echoing the route into the body', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = routeNotFoundResponse(contextWith(logger));

    expect(response.statusCode).toBe(404);
    expect(bodyOf(response.body).category).toBe('routeNotFound');
    expect(response.body).not.toContain('POST /skus/resolve');
    expect(contextOf(soleEmission(emissions))['route']).toBe('POST /skus/resolve');
  });

  it('publishes a rejection REASON with its field detail, never a free-form sentence', () => {
    // The reason is a member of a CLOSED union and the published sentence is
    // looked up from it, so a handler cannot author the text a caller reads and
    // cannot leak a rejected value into it. The reason travels to the log; the
    // fixed sentence travels to the body.
    const { logger, emissions } = createRecordingLogger();

    const response = invalidRequestResponse('unusableRequestInput', contextWith(logger), [
      { path: 'selectedOptions', message: 'Exceeds the accepted element count' },
    ]);
    const body = bodyOf(response.body);

    expect(response.statusCode).toBe(400);
    expect(body.message).toBe('The request input is not valid.');
    expect(contextOf(soleEmission(emissions))['invalidRequestReason']).toBe('unusableRequestInput');
    expect(body.fields).toHaveLength(1);
    expect(soleEmission(emissions).level).toBe('warn');
  });

  it('omits the fields member entirely when a rejection produced none', () => {
    const { logger } = createRecordingLogger();

    const body = bodyOf(invalidRequestResponse('missingRequestBody', contextWith(logger)).body);

    expect(body).not.toHaveProperty('fields');
  });

  it('declares a JSON content type and forbids storing the response on every arm', () => {
    const { logger } = createRecordingLogger();
    const responses = [
      mapErrorToApiGatewayResponse(new Error('x'), contextWith(logger)),
      routeNotFoundResponse(contextWith(logger)),
      invalidRequestResponse('unsupportedBodyShape', contextWith(logger)),
    ];

    for (const response of responses) {
      expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers?.['cache-control']).toBe('no-store');
    }
  });

  it('falls back to the module logger when the context supplies none, without throwing', () => {
    // No logger on the context, so the module-level one is used. That one writes
    // to the real stdout, so the write is intercepted here rather than left to
    // pollute the runner's output - and intercepting it turns the emission into
    // something this case can assert on as well. `tests/setup.ts` restores every
    // spy after each case, so the interception cannot leak into another test.
    const written: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));

        return true;
      });

    const response = mapErrorToApiGatewayResponse(new Error('opaque'), { requestId: REQUEST_ID });

    writeSpy.mockRestore();

    expect(bodyOf(response.body).category).toBe('unrecognized');

    // The fallback logger is the redacting one, not a bare console write: the
    // thrown error's message must not survive into the emitted line.
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain('opaque');
    expect(written[0]).toContain('"thrownShape":"Error"');
  });
});
