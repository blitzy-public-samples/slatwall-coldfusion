// slatwall-ts - unit suite for the shared primary-adapter request/response boundary.
//
// The withholding cases therefore assert against the raw emitted log line and the raw response
// body.
//
// The module is created from scratch - the plan's handler transformation table records its source
// file as "-" and its change as "No legacy equivalent.
//
// The only legacy suites extended anywhere in this port are `meta/tests/unit/entity/BrandTest.cfc`
// and `meta/tests/unit/entity/ProductTest.cfc`.

import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';

import type {
  ErrorMappingContext,
  ErrorResponseBody,
  RequestPrincipal,
  SuccessResponseBody,
} from '../../../src/handlers/errorMapper.js';
import {
  AUTHORIZER_ACCOUNT_CLAIM,
  AUTHORIZER_ADMIN_CLAIM,
  AUTHORIZER_SERVICE_SCOPE_CLAIM,
  containsPrototypeMemberKey,
  forbiddenResponse,
  invalidRequestResponse,
  jsonSuccessResponse,
  mapErrorToApiGatewayResponse,
  notImplementedResponse,
  principalHasServiceScope,
  resolveRequestPrincipal,
  resolveServerRequestId,
  routeDiagnosticLabel,
  PROTOTYPE_MEMBER_FIELD_ISSUE,
  routeNotFoundResponse,
  unauthenticatedResponse,
} from '../../../src/handlers/errorMapper.js';
import type { LogContext, LogLevel, Logger, LogSink } from '../../../src/lib/logger.js';

// Test doubles and planted data.

/**
 * Planted credential and personal data. Long, unique and free of regex metacharacters, so a
 * substring search cannot produce a false result either way.
 */
const PLANTED_SECRET = 'PLANTED-CREDENTIAL-5b1d7e04c396';
const PLANTED_EMAIL = 'planted.person@example-customer.test';

/**
 * A correlation identifier, shaped like the one API Gateway supplies.
 */
const REQUEST_ID = 'c0ffee00-1111-2222-3333-444455556666';

/**
 * One captured emission, in the form the module handed to the logger.
 */
interface CapturedEmission {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext | undefined;
  /**
   * The serialized form, so a leak anywhere in the payload is detectable.
   */
  readonly serialized: string;
}

/**
 * A logger that records rather than emits.
 *
 * A hand-written double rather than a mock framework: it needs no lifecycle, it holds only its own
 * array, and a fresh one is built inside every test.
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
      // `undefined` members vanish under serialization exactly as they do in the real logger, so
      // the recorded string is what would have been emitted.
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

/**
 * A context carrying the recording logger and a route, as a handler would.
 */
function contextWith(logger: Logger): ErrorMappingContext {
  return { requestId: REQUEST_ID, route: 'POST /skus/resolve', logger };
}

/**
 * Parse a response body, narrowing rather than casting blindly.
 */
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

/**
 * Read the single emission a call is documented to produce.
 */
function soleEmission(emissions: readonly CapturedEmission[]): CapturedEmission {
  expect(emissions).toHaveLength(1);
  const [emission] = emissions;
  if (emission === undefined) {
    throw new Error('nothing was emitted');
  }
  return emission;
}

/**
 * Read the recorded context as an object.
 */
function contextOf(emission: CapturedEmission): Record<string, unknown> {
  const { context } = emission;
  if (context === undefined) {
    throw new Error('the emission carried no context');
  }
  return context;
}

// The one message that must survive verbatim.

describe('the framework dead-call-target contract', () => {
  /**
   * The legacy message, reproduced exactly as both framework tiers throw it - including the
   * grammatical error "does not exists" and the word "entity".
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

    // The byte-exact-message requirement is untouched and is still covered: the first case in this
    // block maps `new Error(CONTRACT_MESSAGE)` and gets the contract back verbatim.
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
    // [org/Hibachi/HibachiObject.cfc:L126] - "does not exist", no `()`, no trailing period. A
    // different shape, deliberately not recognized.
    const otherVariant =
      'You have attempted to call the method getFoo which does not exist in Slatwall.model.entity.Sku';

    expect(
      bodyOf(mapErrorToApiGatewayResponse(otherVariant, contextWith(logger)).body).category,
    ).toBe('unrecognized');
  });
});

// Everything else: withheld from the body and from the log.

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

    // Not merely absent from a field this suite named - absent from the entire serialized payload
    // the module handed over.
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

  // `thrownAt` - the third classifier, because the shape and the name alone do not say WHERE a
  // failure was thrown, and a wiring defect is undiagnosable without that.

  it('★★★ names the FUNCTION a failure was thrown from, which is what makes a wiring bug diagnosable', () => {
    const { logger, emissions } = createRecordingLogger();

    // Named exactly as the class-and-method frame the real defect produced
    // (`ProductType.getBaseProductType`).
    const productType = {
      getBaseProductType(): never {
        throw new Error(`requires a productTypeRepository, host=${PLANTED_SECRET}`);
      },
    };

    let thrown: unknown;
    try {
      productType.getBaseProductType();
    } catch (caught) {
      thrown = caught;
    }

    const response = mapErrorToApiGatewayResponse(thrown, contextWith(logger));
    const emission = soleEmission(emissions);

    expect(contextOf(emission)['thrownAt']).toBe('Object.getBaseProductType');
    // And the MESSAGE is still WITHHELD, from the line as well as the body. The whole value of
    // this field is that it buys diagnosability without relaxing that.
    expect(emission.serialized).not.toContain(PLANTED_SECRET);
    expect(response.body).not.toContain(PLANTED_SECRET);
    expect(response.body).not.toContain('getBaseProductType');
  });

  it('★★ emits NO filesystem path, no line number and no deeper frame', () => {
    const { logger, emissions } = createRecordingLogger();
    const failure = new Error('boom');
    // A hand-built stack, so the assertion is about what this module EXTRACTS rather than about
    // what V8 happened to produce on this machine. Three frames, two of them plainly private.
    failure.stack = [
      'Error: boom',
      '    at MysqlSkuRepository.saveSku (/srv/secret-app/src/repositories/mysql/mysqlSkuRepository.ts:2822:13)',
      '    at ProductService.saveProduct (/srv/secret-app/src/services/productService.ts:3513:9)',
      '    at /srv/secret-app/dist/router.cjs:1:1',
    ].join('\n');

    mapErrorToApiGatewayResponse(failure, contextWith(logger));
    const emission = soleEmission(emissions);

    expect(contextOf(emission)['thrownAt']).toBe('MysqlSkuRepository.saveSku');
    // Only the FIRST frame is a classifier; every deeper one is a map of this service's internals.
    expect(emission.serialized).not.toContain('saveProduct');
    // No path, no line, no column - and structurally so, because the name is taken from before the
    // ` (` that opens the location and the classifier pattern admits neither `/` nor `:`.
    expect(emission.serialized).not.toContain('/srv/secret-app');
    expect(emission.serialized).not.toContain('2822');
    expect(emission.serialized).not.toContain('.ts');
  });

  it('names an AWAITED frame, stripping the marker that is not part of the name', () => {
    const { logger, emissions } = createRecordingLogger();
    const failure = new Error('boom');
    failure.stack = [
      'Error: boom',
      '    at async MysqlProductRepository.saveProduct (/srv/app/x.ts:1:1)',
    ].join('\n');

    mapErrorToApiGatewayResponse(failure, contextWith(logger));

    // Without stripping `async `, every asynchronous frame would fail the classifier shape on the
    // space alone - which in a service that is asynchronous throughout would drop exactly the
    // frames worth having.
    expect(contextOf(soleEmission(emissions))['thrownAt']).toBe(
      'MysqlProductRepository.saveProduct',
    );
  });

  it('★★ FAILS CLOSED, omitting the field entirely for every frame it cannot classify', () => {
    const { logger, emissions } = createRecordingLogger();

    const unclassifiable: readonly string[] = [
      // Location-only: there is no name to take, and the location must never be emitted.
      ['Error: boom', '    at /srv/secret-app/dist/router.cjs:1:1'].join('\n'),
      // Anonymous, constructor and eval frames each carry a character the classifier refuses.
      ['Error: boom', '    at Object.<anonymous> (/srv/app/x.ts:1:1)'].join('\n'),
      ['Error: boom', '    at new ProductType (/srv/app/x.ts:1:1)'].join('\n'),
      // A 65-character name is one over the cap: dropped rather than truncated, because a
      // truncated classifier is a guess.
      ['Error: boom', `    at ${'n'.repeat(65)} (/srv/app/x.ts:1:1)`].join('\n'),
      // A stack with no frame at all.
      'Error: boom',
      // A stack whose "frame" is prose carrying a secret - the case the shape policy exists for.
      ['Error: boom', `    at password=${PLANTED_SECRET} is wrong (/srv/app/x.ts:1:1)`].join('\n'),
    ];

    for (const stack of unclassifiable) {
      const failure = new Error('boom');
      failure.stack = stack;
      mapErrorToApiGatewayResponse(failure, contextWith(logger));
    }

    expect(emissions).toHaveLength(unclassifiable.length);
    for (const emission of emissions) {
      // `undefined` on the context and ABSENT from the serialized line - the same two-level shape
      // the `errorCode` cases above assert, because `JSON.stringify` omits an undefined member.
      expect(contextOf(emission)['thrownAt']).toBeUndefined();
      expect(emission.serialized).not.toContain('thrownAt');
      expect(emission.serialized).not.toContain(PLANTED_SECRET);
      expect(emission.serialized).not.toContain('/srv/');
    }
  });

  it('classifies an `eval` frame as `eval`, still without its location', () => {
    // Not in the fail-closed list above, and this records the judgment.
    const { logger, emissions } = createRecordingLogger();
    const failure = new Error('boom');
    failure.stack = [
      'Error: boom',
      '    at eval (eval at <anonymous> (/srv/secret-app/x.ts:1:1))',
    ].join('\n');

    mapErrorToApiGatewayResponse(failure, contextWith(logger));
    const emission = soleEmission(emissions);

    expect(contextOf(emission)['thrownAt']).toBe('eval');
    expect(emission.serialized).not.toContain('/srv/secret-app');
    expect(emission.serialized).not.toContain('<anonymous>');
  });

  it('omits the field for a thrown value that is not an Error, and for one with no stack', () => {
    const { logger, emissions } = createRecordingLogger();
    const stackless = new Error('boom');
    // `stack` is an ordinary own property and a caller-reachable one, so a non-string must not
    // fault.
    Object.defineProperty(stackless, 'stack', { value: 42, configurable: true });

    mapErrorToApiGatewayResponse('a thrown string', contextWith(logger));
    mapErrorToApiGatewayResponse({ message: 'a thrown object' }, contextWith(logger));
    mapErrorToApiGatewayResponse(stackless, contextWith(logger));

    expect(emissions).toHaveLength(3);
    for (const emission of emissions) {
      expect(contextOf(emission)['thrownAt']).toBeUndefined();
      expect(emission.serialized).not.toContain('thrownAt');
    }
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

// The client-shaped arms.

describe('a schema-rejected request input', () => {
  /**
   * A GENUINE `ZodError` from the pinned validation library.
   *
   * Constructed BY the library rather than forged: a hand-made `new Error()` with `name` reassigned
   * to `'ZodError'` and an `issues` array bolted on would not exercise the mapper's instance check.
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

    // Type confusion, stated as a test.
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

    // 25 issues against a published ceiling of.
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

    // A message is bounded at 200 characters INCLUDING the ellipsis, and the path stops at 10
    // rendered segments with a marker recording that it was cut.
    expect(field.message).toHaveLength(200);
    expect(field.message.endsWith('...')).toBe(true);
    const renderedSegments = field.path.split('.').filter((segment) => segment.length > 0);
    expect(renderedSegments).toHaveLength(10);
    expect(renderedSegments[0]).toBe('s0');
    expect(renderedSegments[9]).toBe('s9');
    expect(field.path.endsWith('...')).toBe(true);
    // The over-long 16th segment is never reached, so its 120 characters cannot reach the body by
    // either route - the segment cap stops the walk before the per-segment clamp would have had
    // to.
    expect(field.path).not.toContain('x'.repeat(65));
  });

  // Unrecognized keys keep only their schema-authored container path.
  //
  // The validator's `keys` and rendered message contain caller-authored member names.

  /**
   * A genuine strict-object rejection, produced by the pinned validator rather than forged.
   */
  function strictRejection(input: Readonly<Record<string, unknown>>): unknown {
    const schema = z.strictObject({ operation: z.string() });
    const outcome = schema.safeParse(input);

    if (outcome.success) {
      throw new Error(
        'the fixture input was admitted; it must be rejected for this case to mean anything',
      );
    }

    return outcome.error;
  }

  it('publishes the safe root-container path and a fixed sentence', () => {
    const { logger } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(
      strictRejection({ operation: 'findProducts', notAParameter: 'x' }),
      contextWith(logger),
    );
    const body = bodyOf(response.body);

    expect(body.category).toBe('invalidRequest');
    expect((body.fields ?? []).map((field) => field.path)).toStrictEqual(['']);
    expect((body.fields ?? [])[0]?.message).toBe(
      'contains a member this operation does not publish; remove it and retry',
    );
    expect(response.body).not.toContain('notAParameter');
  });

  it('does not enumerate several caller-authored keys', () => {
    const { logger } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(
      strictRejection({ operation: 'findProducts', alpha: '1', bravo: '2', charlie: '3' }),
      contextWith(logger),
    );
    const body = bodyOf(response.body);

    expect((body.fields ?? []).map((field) => field.path)).toStrictEqual(['']);
    expect(response.body).not.toContain('alpha');
    expect(response.body).not.toContain('bravo');
    expect(response.body).not.toContain('charlie');
  });

  it('NEVER publishes either the name or the value of a rejected key', () => {
    const { logger } = createRecordingLogger();
    const callerKey = 'smuggled';
    const planted = 'PLANTED-KEY-VALUE-3f9a17c4';

    const response = mapErrorToApiGatewayResponse(
      strictRejection({ operation: 'findProducts', [callerKey]: planted }),
      contextWith(logger),
    );

    expect(response.body).not.toContain(callerKey);
    expect(response.body).not.toContain(planted);
  });

  it('does not publish even a clamped prefix of an over-long key name', () => {
    const { logger } = createRecordingLogger();
    const overLong = 'k'.repeat(200);

    const response = mapErrorToApiGatewayResponse(
      strictRejection({ operation: 'findProducts', [overLong]: '1' }),
      contextWith(logger),
    );
    const body = bodyOf(response.body);

    const [field] = body.fields ?? [];
    if (field === undefined) {
      throw new Error('the mapper published no field issue');
    }

    expect(field.path).toBe('');
    expect(response.body).not.toContain(overLong);
    expect(field.path).not.toContain('k'.repeat(65));
  });

  it('logs only the safe container path, at warning severity', () => {
    const { logger, emissions } = createRecordingLogger();
    const callerKey = 'notAParameter';

    mapErrorToApiGatewayResponse(
      strictRejection({ operation: 'findProducts', [callerKey]: 'x' }),
      contextWith(logger),
    );
    const emission = soleEmission(emissions);

    expect(emission.level).toBe('warn');
    expect(contextOf(emission)['fieldPaths']).toStrictEqual(['']);
    expect(emission.serialized).not.toContain(callerKey);
  });

  it('collapses a wide unrecognized-key issue to one safe container complaint', () => {
    const { logger } = createRecordingLogger();
    const wide: Record<string, unknown> = { operation: 'findProducts' };

    for (let index = 0; index < 40; index += 1) {
      wide[`extra${String(index)}`] = String(index);
    }

    const body = bodyOf(
      mapErrorToApiGatewayResponse(strictRejection(wide), contextWith(logger)).body,
    );

    expect(body.fields).toHaveLength(1);
    expect(body.fields?.[0]?.path).toBe('');
  });

  it('★★★ KEEPS the containing path when the strict object is nested', () => {
    const { logger, emissions } = createRecordingLogger();
    const nested = z.strictObject({
      operation: z.string(),
      order: z.strictObject({ subtotal: z.string() }),
    });
    const outcome = nested.safeParse({
      operation: 'applyPromotions',
      order: { subTotal: '59.97' },
    });

    if (outcome.success) {
      throw new Error('the fixture input was admitted; it must be rejected to mean anything');
    }

    const response = mapErrorToApiGatewayResponse(outcome.error, contextWith(logger));
    const paths = (bodyOf(response.body).fields ?? []).map((field) => field.path).sort();

    // The schema-authored container remains actionable; the caller-authored misspelling does not.
    expect(paths).toStrictEqual(['order', 'order.subtotal']);
    expect(contextOf(soleEmission(emissions))['fieldPaths']).toStrictEqual([
      'order.subtotal',
      'order',
    ]);
    expect(response.body).not.toContain('subTotal');
    expect(response.body).not.toContain('59.97');
  });

  it('still reports a missing REQUIRED member alongside the unrecognized one', () => {
    const { logger } = createRecordingLogger();

    const body = bodyOf(
      mapErrorToApiGatewayResponse(strictRejection({ notAParameter: 'x' }), contextWith(logger))
        .body,
    );

    const paths = (body.fields ?? []).map((field) => field.path).sort();

    // Both facts reach the caller without quoting the submitted key: the root object contains an
    // unpublished member, and the operation member the schema requires is absent.
    expect(paths).toStrictEqual(['', 'operation']);
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
    // The reason is a member of a CLOSED union and the published sentence is looked up from it, so
    // a handler cannot author the text a caller reads and cannot leak a rejected value into it.
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
      unauthenticatedResponse(contextWith(logger)),
      forbiddenResponse(contextWith(logger)),
    ];

    for (const response of responses) {
      expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers?.['cache-control']).toBe('no-store');
    }
  });

  it('falls back to the module logger when the context supplies none, without throwing', () => {
    // No logger on the context, so the module-level one is used.
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

    // The fallback logger is the redacting one, not a bare console write: the thrown error's
    // message must not survive into the emitted line.
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain('opaque');
    expect(written[0]).toContain('"thrownShape":"Error"');
  });
});

// The authorization refusal vocabulary.

describe('a refusal to serve a caller', () => {
  it('answers 401 for a caller it could not identify', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = unauthenticatedResponse(contextWith(logger));

    expect(response.statusCode).toBe(401);
    expect(bodyOf(response.body).category).toBe('unauthenticated');
    expect(soleEmission(emissions).level).toBe('warn');
    expect(contextOf(soleEmission(emissions))['statusCode']).toBe(401);
  });

  it('answers 403 for an identified caller that is not permitted the operation', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = forbiddenResponse(contextWith(logger));

    expect(response.statusCode).toBe(403);
    expect(bodyOf(response.body).category).toBe('forbidden');
    expect(contextOf(soleEmission(emissions))['statusCode']).toBe(403);
  });

  it('publishes the same fixed sentence for both refusals', () => {
    const { logger } = createRecordingLogger();

    const unauthenticated = bodyOf(unauthenticatedResponse(contextWith(logger)).body);
    const forbidden = bodyOf(forbiddenResponse(contextWith(logger)).body);

    expect(unauthenticated.message).toBe(forbidden.message);
    expect(unauthenticated.message).toBe('The request was not served.');
  });

  it('names no claim, scheme, operation or principal in either body', () => {
    const { logger } = createRecordingLogger();

    for (const response of [
      unauthenticatedResponse(contextWith(logger)),
      forbiddenResponse(contextWith(logger)),
    ]) {
      const body = response.body ?? '';

      expect(body).not.toContain('accountID');
      expect(body).not.toContain('adminAccountFlag');
      expect(body).not.toContain('authoriz');
      expect(body).not.toContain('POST /skus/resolve');
      expect(bodyOf(body)).not.toHaveProperty('fields');
    }
  });

  it('sends no authentication challenge because no scheme is declared', () => {
    const { logger } = createRecordingLogger();
    const headers = unauthenticatedResponse(contextWith(logger)).headers ?? {};
    expect(
      Object.keys(headers)
        .map((name): string => name.toLowerCase())
        .sort(),
    ).toEqual(['cache-control', 'content-type']);
    expect(headers['x-content-type-options']).toBeUndefined();
  });

  it('is never produced by the thrown-value mapping funnel', () => {
    const { logger } = createRecordingLogger();
    const forged = Object.assign(new Error('nope'), {
      category: 'unauthenticated',
      statusCode: 401,
      name: 'UnauthenticatedError',
    });

    const response = mapErrorToApiGatewayResponse(forged, contextWith(logger));

    expect(response.statusCode).toBe(500);
    expect(bodyOf(response.body).category).toBe('unrecognized');
  });

  it('carries the route to the log stream and not into the refusal body', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = forbiddenResponse(contextWith(logger));

    expect(response.body).not.toContain('POST /skus/resolve');
    expect(contextOf(soleEmission(emissions))['route']).toBe('POST /skus/resolve');
  });

  it('★★★ answers 501 for a published operation this deployment does not implement', () => {
    // THE F-04 CLOSURE. A routed operation reaching a STUB PORT (AAP 0.2.1) used to answer HTTP
    // 500 `unrecognized`, because the port's refusal is an ordinary `Error` and the recognizer set is
    // deliberately closed. That reported a permanent, by-design, client-visible limitation as a server
    // fault. 501 is the registered status that says what is actually true.
    const { logger, emissions } = createRecordingLogger();

    const response = notImplementedResponse(contextWith(logger));

    expect(response.statusCode).toBe(501);
    expect(bodyOf(response.body).category).toBe('notImplemented');
    expect(soleEmission(emissions).level).toBe('warn');
    expect(contextOf(soleEmission(emissions))['statusCode']).toBe(501);
  });

  it('★★ publishes an ACTIONABLE sentence for 501, unlike the two authorization refusals', () => {
    // The asymmetry is deliberate and is asserted so it cannot be "harmonised" away. The two
    // authorization sentences are uninformative because a refusal must not become a reconnaissance
    // oracle; here the operation is already in the published selector list, the caller has already been
    // admitted as administrative, and the limitation is permanent - so there is no fact left to
    // withhold and the one thing worth saying is "stop retrying".
    const { logger } = createRecordingLogger();

    const notImplemented = bodyOf(notImplementedResponse(contextWith(logger)).body);

    expect(notImplemented.message).not.toBe('The request was not served.');
    expect(notImplemented.message).toContain('does not implement');
    expect(notImplemented.message).toContain('no retry will succeed');
  });

  it('★★ names no operation, port, class or configuration key in the 501 body', () => {
    // Finding F-04 was raised against a 500 whose LOG line read
    // `ImageStoreNotConfiguredError @ RefusingImageStore.deleteImageFile`. That detail stays on the log
    // stream under the echoed `requestId`; a body naming it would publish this service's internal
    // composition to anyone who can reach the route.
    const { logger } = createRecordingLogger();
    const body = notImplementedResponse(contextWith(logger)).body ?? '';

    for (const leak of [
      'imageStore',
      'ImageStore',
      'RefusingImageStore',
      'ImageStoreNotConfiguredError',
      'subscriptionTerm',
      'deleteDefaultImage',
      'deleteImageFile',
      'IMAGE_',
    ]) {
      expect(body).not.toContain(leak);
    }
    expect(bodyOf(body)).not.toHaveProperty('fields');
  });

  it('★★ sends no Retry-After with a 501, because the limitation is not temporal', () => {
    const { logger } = createRecordingLogger();
    const headers = notImplementedResponse(contextWith(logger)).headers ?? {};

    expect(
      Object.keys(headers)
        .map((name): string => name.toLowerCase())
        .sort(),
    ).toEqual(['cache-control', 'content-type']);
    expect(headers['retry-after']).toBeUndefined();
  });

  it('★★★ is never produced by the thrown-value mapping funnel either', () => {
    // The invariant that made this a PRODUCER rather than a recognizer. A value arriving from a
    // service, a driver or a deserialized document must not be able to choose 501 for itself - the
    // handler narrows the exported class with `instanceof` and decides, which is a decision about a
    // request rather than a failure that happened to it.
    const { logger } = createRecordingLogger();
    const forged = Object.assign(new Error('no image store is configured'), {
      category: 'notImplemented',
      statusCode: 501,
      name: 'ImageStoreNotConfiguredError',
    });

    const response = mapErrorToApiGatewayResponse(forged, contextWith(logger));

    expect(response.statusCode).toBe(500);
    expect(bodyOf(response.body).category).toBe('unrecognized');
  });
});

// An unrecognized member is reported without quoting the caller.

describe('a strict schema rejecting a member it does not publish', () => {
  const CALLER_AUTHORED_KEY = 'x-PLANTED-KEY-9f2c41ab';

  function unrecognizedKeyFailure(): ZodError {
    return new ZodError([
      {
        code: 'unrecognized_keys',
        keys: [CALLER_AUTHORED_KEY],
        path: ['order'],
        message: `Unrecognized key: "${CALLER_AUTHORED_KEY}"`,
      },
    ] as never);
  }

  it('does not echo the submitted key name into the response body', () => {
    const { logger } = createRecordingLogger();

    const response = mapErrorToApiGatewayResponse(unrecognizedKeyFailure(), contextWith(logger));

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(CALLER_AUTHORED_KEY);
  });

  it('publishes a fixed sentence and keeps the schema-authored container path', () => {
    const { logger } = createRecordingLogger();

    const [field] =
      bodyOf(mapErrorToApiGatewayResponse(unrecognizedKeyFailure(), contextWith(logger)).body)
        .fields ?? [];

    expect(field?.path).toBe('order');
    expect(field?.message).toBe(
      'contains a member this operation does not publish; remove it and retry',
    );
  });

  it('does not echo the key name onto the log stream either', () => {
    const { logger, emissions } = createRecordingLogger();

    mapErrorToApiGatewayResponse(unrecognizedKeyFailure(), contextWith(logger));

    expect(soleEmission(emissions).serialized).not.toContain(CALLER_AUTHORED_KEY);
    expect(contextOf(soleEmission(emissions))['fieldPaths']).toEqual(['order']);
  });

  it('leaves every other constraint description intact', () => {
    const { logger } = createRecordingLogger();

    const [field] =
      bodyOf(
        mapErrorToApiGatewayResponse(
          new ZodError([
            {
              code: 'invalid_type',
              expected: 'string',
              path: ['idempotencyKey'],
              message: 'Invalid input: expected string, received number',
            },
          ] as never),
          contextWith(logger),
        ).body,
      ).fields ?? [];

    expect(field?.path).toBe('idempotencyKey');
    expect(field?.message).toBe('Invalid input: expected string, received number');
  });
});

// The shared response and correlation contract.

/**
 * The runtime identifier a real invocation carries.
 */
const RUNTIME_REQUEST_ID = 'aaaaaaaa-1111-2222-3333-444444444444';

/**
 * The gateway identifier a real invocation carries.
 */
const GATEWAY_REQUEST_ID = 'bbbbbbbb-5555-6666-7777-888888888888';

/**
 * A proxy event carrying only what correlation reads.
 *
 * Deliberately built as a partial and narrowed on the way in rather than assembled in full:
 * `APIGatewayProxyEvent` declares dozens of members, none of which this function may read.
 */
function eventWithGatewayRequestId(gatewayRequestId?: unknown): APIGatewayProxyEvent {
  const requestContext =
    gatewayRequestId === undefined ? {} : { requestId: gatewayRequestId as string };

  return { requestContext } as unknown as APIGatewayProxyEvent;
}

/**
 * An event with no `requestContext` at all, as a synthesised one may be.
 */
function eventWithoutRequestContext(): APIGatewayProxyEvent {
  return {} as unknown as APIGatewayProxyEvent;
}

/**
 * A Lambda context carrying only the invocation identifier.
 */
function contextWithRuntimeRequestId(awsRequestId?: unknown): Context {
  return { awsRequestId } as unknown as Context;
}

/**
 * Parse a success body, narrowing rather than casting blindly.
 */
function successBodyOf(body: string | undefined): SuccessResponseBody<unknown> {
  if (body === undefined) {
    throw new Error('the response carried no body');
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || !('requestId' in parsed)) {
    throw new Error('the response body is not the documented success envelope');
  }

  return parsed as SuccessResponseBody<unknown>;
}

describe('the one correlation-precedence policy', () => {
  it("prefers the runtime's invocation identifier over the gateway's request identifier", () => {
    // The precedence is not a security choice - both are platform-minted - it is that the runtime
    // identifier is the one the platform's own START/END/REPORT lines carry for this execution.
    const resolved = resolveServerRequestId(
      eventWithGatewayRequestId(GATEWAY_REQUEST_ID),
      contextWithRuntimeRequestId(RUNTIME_REQUEST_ID),
    );

    expect(resolved).toBe(RUNTIME_REQUEST_ID);
  });

  it("falls back to the gateway's identifier when no runtime context was supplied", () => {
    expect(resolveServerRequestId(eventWithGatewayRequestId(GATEWAY_REQUEST_ID))).toBe(
      GATEWAY_REQUEST_ID,
    );
  });

  it('treats a blank or whitespace-only platform identifier as absent', () => {
    expect(
      resolveServerRequestId(
        eventWithGatewayRequestId(GATEWAY_REQUEST_ID),
        contextWithRuntimeRequestId('   '),
      ),
    ).toBe(GATEWAY_REQUEST_ID);
  });

  it('trims a padded identifier rather than echoing its padding', () => {
    expect(
      resolveServerRequestId(
        eventWithGatewayRequestId(undefined),
        contextWithRuntimeRequestId(`  ${RUNTIME_REQUEST_ID}  `),
      ),
    ).toBe(RUNTIME_REQUEST_ID);
  });

  it('narrows a non-string identifier instead of publishing it', () => {
    // Both sources are typed with index signatures this module must not trust: a synthesised event
    // can carry a number, a null or an object where the platform would have put a string.
    expect(
      resolveServerRequestId(eventWithGatewayRequestId(42), contextWithRuntimeRequestId(null)),
    ).toBe('unattributed');
  });

  it('publishes a fixed literal rather than minting one when the platform supplied none', () => {
    // Nothing is generated: a random-looking value would appear on no log line the platform
    // emitted, and would look like a real join key while joining to nothing.
    expect(resolveServerRequestId(eventWithoutRequestContext())).toBe('unattributed');
  });

  it('reads NOTHING from a caller-supplied header', () => {
    // The security half.
    const event = {
      requestContext: { requestId: GATEWAY_REQUEST_ID },
      headers: { 'x-request-id': 'CALLER-CHOSEN', 'X-Amzn-Trace-Id': 'CALLER-CHOSEN-TRACE' },
    } as unknown as APIGatewayProxyEvent;

    expect(resolveServerRequestId(event)).toBe(GATEWAY_REQUEST_ID);
  });
});

describe('the one route-label policy', () => {
  it('labels a route as METHOD then path, from the frozen table members', () => {
    expect(routeDiagnosticLabel('GET', '/catalog/products')).toBe('GET /catalog/products');
    expect(routeDiagnosticLabel('POST', '/promotions/application')).toBe(
      'POST /promotions/application',
    );
  });

  it('survives the route sanitizer intact, so the label reaches the log as written', () => {
    // The sanitizer drops everything from the first character outside its path alphabet, and a
    // SPACE is inside that alphabet - so a method-and-path label is not truncated to a path.
    const { logger, emissions } = createRecordingLogger();

    routeNotFoundResponse({
      requestId: REQUEST_ID,
      route: routeDiagnosticLabel('GET', '/feeds/google/products'),
      logger,
    });

    expect(contextOf(soleEmission(emissions))['route']).toBe('GET /feeds/google/products');
  });
});

describe('the one JSON success envelope', () => {
  it('carries the correlation identifier, the capability, the action and the result', () => {
    const response = jsonSuccessResponse(REQUEST_ID, 'catalogQuery', 'queryCatalog', {
      recordsCount: 2,
    });
    const body = successBodyOf(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.requestId).toBe(REQUEST_ID);
    expect(body.capability).toBe('catalogQuery');
    expect(body.action).toBe('queryCatalog');
    expect(body.result).toStrictEqual({ recordsCount: 2 });
  });

  it('uses the same header set as the failure envelope, no-store included', () => {
    // One construction path for a response means one header policy: an intermediary must not be
    // able to serve a stored success to a later, unrelated request any more than it can serve a
    // stored failure.
    const success = jsonSuccessResponse(REQUEST_ID, 'productFeed', 'generateProductFeed', null);
    const failure = routeNotFoundResponse({ requestId: REQUEST_ID });

    expect(success.headers).toStrictEqual(failure.headers);
    expect(success.headers?.['content-type']).toBe('application/json; charset=utf-8');
    expect(success.headers?.['cache-control']).toBe('no-store');
  });

  it('does NOT echo the route path into the success body', () => {
    // Same rule the failure envelope follows: the route is logged and never reflected back,
    // because the closed `action` literal already names what ran.
    const response = jsonSuccessResponse(REQUEST_ID, 'skuResolution', 'resolveSkus', { skus: [] });

    expect(response.body).not.toContain('/catalog/skus');
    expect(Object.keys(successBodyOf(response.body)).sort()).toStrictEqual([
      'action',
      'capability',
      'requestId',
      'result',
    ]);
  });

  it('omits nothing and invents nothing when the result is an empty projection', () => {
    const body = successBodyOf(
      jsonSuccessResponse(REQUEST_ID, 'priceResolution', 'resolvePrices', {}).body,
    );

    expect(body.result).toStrictEqual({});
  });

  it('emits no log line of its own, so a served request is logged by its handler once', () => {
    const written: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));

        return true;
      });

    jsonSuccessResponse(REQUEST_ID, 'catalogQuery', 'queryCatalog', { recordsCount: 0 });

    writeSpy.mockRestore();

    expect(written).toHaveLength(0);
  });
});

describe('the mapper owns the single emission for a handler-established refusal', () => {
  it('appends a handler-supplied ground to the LOG MESSAGE', () => {
    const { logger, emissions } = createRecordingLogger();

    invalidRequestResponse(
      'unusableRequestInput',
      contextWith(logger),
      undefined,
      'the observed feed host is not served by this deployment',
    );

    const emission = soleEmission(emissions);

    expect(emission.level).toBe('warn');
    expect(emission.message).toBe(
      'request input rejected before it reached the services: ' +
        'the observed feed host is not served by this deployment',
    );
  });

  it('never lets that ground reach the RESPONSE BODY', () => {
    // The central guarantee is untouched: the body still carries only the frozen sentence this
    // module owns for the reason.
    const { logger } = createRecordingLogger();

    const response = invalidRequestResponse(
      'unusableRequestInput',
      contextWith(logger),
      undefined,
      `rejected host carrying ${PLANTED_SECRET}`,
    );

    expect(response.body).not.toContain(PLANTED_SECRET);
    expect(response.body).not.toContain('rejected host');
    expect(bodyOf(response.body).message).toBe('The request input is not valid.');
  });

  it('keeps the unadorned message when no ground is supplied', () => {
    const { logger, emissions } = createRecordingLogger();

    invalidRequestResponse('missingQueryParameter', contextWith(logger));

    expect(soleEmission(emissions).message).toBe(
      'request input rejected before it reached the services',
    );
  });

  it('★★★ logs the closed reason and a COUNT, and no field-path text whatsoever', () => {
    const { logger, emissions } = createRecordingLogger();

    const response = invalidRequestResponse(
      'missingQueryParameter',
      contextWith(logger),
      [
        { path: 'queryStringParameters.keyword', message: 'is required' },
        { path: 'queryStringParameters.operation', message: 'is required' },
      ],
      // The handler-established GROUND still travels, on the log MESSAGE, exactly as before - it
      // is this module's own sentence about what it found and carries no submitted material.
      'a required parameter was absent',
    );

    const context = contextOf(soleEmission(emissions));

    expect(context['invalidRequestReason']).toBe('missingQueryParameter');
    expect(context['fieldIssueCount']).toBe(2);
    expect(context['fieldPaths']).toBeUndefined();

    // Not merely absent from that one member - absent from the whole serialized line.
    const line = JSON.stringify(soleEmission(emissions));

    expect(line).not.toContain('keyword');
    expect(line).not.toContain('queryStringParameters');

    // And still published where a caller can act on them.
    expect(bodyOf(response.body).fields?.map((field) => field.path)).toStrictEqual([
      'queryStringParameters.keyword',
      'queryStringParameters.operation',
    ]);
  });

  it('reports a zero count rather than omitting it when a refusal produced no field detail', () => {
    // The count is unconditional so an operator never has to distinguish "no issues" from "the
    // field was not emitted". Its predecessor published an empty array for the same reason.
    const { logger, emissions } = createRecordingLogger();

    invalidRequestResponse('missingRequestBody', contextWith(logger));

    expect(contextOf(soleEmission(emissions))['fieldIssueCount']).toBe(0);
  });
});

// The shared caller principal.
//
// The final section of `src/handlers/errorMapper.ts` - the one place in this port that decides who
// a request is from.

/**
 * An account identifier shaped like the 32-character `Sw*` keys the schema uses.
 */
const ACCOUNT_ID = 'aa11bb22cc33dd44ee55ff6677889900';

/**
 * Build an API Gateway proxy event carrying the supplied authorizer context.
 *
 * `requestContext.identity` is a getter that throws, and that is the most deliberate line in this
 * builder.
 *
 * Everything else is deliberately uninteresting: no body, no headers, no query parameters and no
 * path parameters.
 */
function eventWithAuthorizer(authorizer: unknown): APIGatewayProxyEvent {
  const requestContext = {
    accountId: '',
    apiId: 'request-principal-suite',
    authorizer,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',

    get identity(): APIGatewayProxyEvent['requestContext']['identity'] {
      throw new Error(
        'event.requestContext.identity was read. The caller principal is derived from the ' +
          'authorizer context and from nothing else; identity carries credential-shaped members ' +
          'and caller-controlled transport metadata, neither of which is a verified claim.',
      );
    },

    path: '/catalog/products',
    stage: 'suite',
    requestId: 'c0ffee00-1111-2222-3333-444455556666',
    requestTimeEpoch: 1_700_000_000_000,
    resourceId: 'request-principal-suite-resource',
    resourcePath: '/catalog/products',
  } as unknown as APIGatewayProxyEvent['requestContext'];

  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/catalog/products',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/catalog/products',
    requestContext,
  };
}

/**
 * Read the principal a case expects to have been established.
 */
function principalOf(event: APIGatewayProxyEvent): RequestPrincipal {
  const resolution = resolveRequestPrincipal(event);
  if (!resolution.identified) {
    throw new Error(`expected an identified caller, got ${resolution.reason}`);
  }
  return resolution.principal;
}

describe('an identified caller', () => {
  it('establishes the account from the authorizer claim', () => {
    const principal = principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID }));

    expect(principal.accountID).toBe(ACCOUNT_ID);
    expect(principal.adminAccountFlag).toBe(false);
  });

  it('trims the claim, so a padded value cannot reach a keyed account read as-is', () => {
    expect(
      principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: `  ${ACCOUNT_ID}\t` }))
        .accountID,
    ).toBe(ACCOUNT_ID);
  });

  it('folds claim-name case exactly as a CFML struct does', () => {
    // An authorizer emitting `accountId` and one emitting `accountID` name the same claim. A
    // case-sensitive index would let a deployment's key casing decide whether a request is treated
    // as identified.
    for (const spelling of ['accountId', 'ACCOUNTID', 'AccountID']) {
      expect(principalOf(eventWithAuthorizer({ [spelling]: ACCOUNT_ID })).accountID).toBe(
        ACCOUNT_ID,
      );
    }
  });

  it('freezes what it publishes, so a handler cannot substitute the account it was given', () => {
    const resolution = resolveRequestPrincipal(
      eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID }),
    );

    expect(Object.isFrozen(resolution)).toBe(true);
    expect(resolution.identified).toBe(true);
    if (resolution.identified) {
      expect(Object.isFrozen(resolution.principal)).toBe(true);
    }
  });
});

describe('the fail-closed direction', () => {
  it('refuses when the event carries no authorizer context at all', () => {
    const resolution = resolveRequestPrincipal(eventWithAuthorizer(undefined));

    expect(resolution.identified).toBe(false);
    if (!resolution.identified) {
      expect(resolution.reason).toBe('noAuthorizerContext');
    }
  });

  it('treats a null context as no context, because null is not an identity', () => {
    expect(resolveRequestPrincipal(eventWithAuthorizer(null)).identified).toBe(false);
  });

  it('refuses an array rather than indexing into it', () => {
    // An array is an `object` to `typeof` and is not a claim set.
    expect(resolveRequestPrincipal(eventWithAuthorizer([ACCOUNT_ID])).identified).toBe(false);
  });

  it('distinguishes a missing context from a context naming no usable account', () => {
    const resolution = resolveRequestPrincipal(eventWithAuthorizer({ unrelated: 'value' }));

    expect(resolution.identified).toBe(false);
    if (!resolution.identified) {
      // The distinction is DIAGNOSTIC only: a route deployed with no authorizer in front of it is
      // an operator problem, not a caller mistake. Neither reason is ever published - the refusal
      // builders accept no detail.
      expect(resolution.reason).toBe('noAccountClaim');
    }
  });

  it('refuses a blank or whitespace-only account claim', () => {
    for (const blank of ['', '   ', '\t\n']) {
      expect(
        resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: blank }))
          .identified,
      ).toBe(false);
    }
  });

  it('refuses a non-string account claim rather than coercing it', () => {
    for (const wrongKind of [42, true, {}, [], null]) {
      expect(
        resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: wrongKind }))
          .identified,
      ).toBe(false);
    }
  });

  it('cannot be satisfied through the prototype chain', () => {
    // The keyed read resolves a stored key through `Object.keys` narrowed by `hasOwnProperty`, so
    // the prototype chain is unreachable rather than merely filtered.
    const inherited = Object.create({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID }) as object;

    expect(resolveRequestPrincipal(eventWithAuthorizer(inherited)).identified).toBe(false);
  });

  it('does not treat a claim literally named __proto__ as an identity', () => {
    const resolution = resolveRequestPrincipal(eventWithAuthorizer({ ['__proto__']: ACCOUNT_ID }));

    expect(resolution.identified).toBe(false);
  });
});

describe('the administrative claim', () => {
  function adminFlagFor(value: unknown): boolean {
    return principalOf(
      eventWithAuthorizer({
        [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
        [AUTHORIZER_ADMIN_CLAIM]: value,
      }),
    ).adminAccountFlag;
  }

  it('accepts the STRING renderings API Gateway actually delivers', () => {
    // API Gateway stringifies every authorizer context value, so a boolean `true` arrives as
    // `"true"`.
    for (const rendering of ['true', 'TRUE', 'True', '1', ' true ']) {
      expect(adminFlagFor(rendering)).toBe(true);
    }
  });

  it('accepts a real boolean, which a direct invoker or a suite can supply', () => {
    expect(adminFlagFor(true)).toBe(true);
    expect(adminFlagFor(false)).toBe(false);
  });

  it('refuses every other rendering, because a permissive read is a privilege decision', () => {
    for (const rejected of ['yes', 'admin', 'y', 'on', '2', '0', 'false', '', '   ']) {
      expect(adminFlagFor(rejected)).toBe(false);
    }
  });

  it('refuses a non-string, non-boolean claim', () => {
    for (const rejected of [1, {}, [], null, undefined]) {
      expect(adminFlagFor(rejected)).toBe(false);
    }
  });

  it('defaults to false when the claim is absent entirely', () => {
    expect(
      principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID })).adminAccountFlag,
    ).toBe(false);
  });

  it('never establishes an administrative principal without an account', () => {
    // The admin bit is meaningless on its own: an unidentified caller cannot be an administrator,
    // so the account claim gates the whole principal.
    expect(
      resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ADMIN_CLAIM]: 'true' })).identified,
    ).toBe(false);
  });
});

// The service grant (net-new)

describe('the service grant (NET-NEW)', () => {
  /**
   * The grant a principal resolved from `value` carries.
   */
  function serviceScopeFor(value: unknown): string {
    return principalOf(
      eventWithAuthorizer({
        [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
        [AUTHORIZER_SERVICE_SCOPE_CLAIM]: value,
      }),
    ).serviceScope;
  }

  /**
   * Whether a principal resolved from `value` is granted `capability`.
   */
  function grants(value: unknown, capability: string): boolean {
    return principalHasServiceScope(
      principalOf(
        eventWithAuthorizer({
          [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
          [AUTHORIZER_SERVICE_SCOPE_CLAIM]: value,
        }),
      ),
      capability,
    );
  }

  it('carries the grant verbatim, trimmed once as a whole value', () => {
    expect(serviceScopeFor('promotionApplication')).toBe('promotionApplication');
    expect(serviceScopeFor('  promotionApplication\t')).toBe('promotionApplication');
    expect(serviceScopeFor('catalogQuery,promotionApplication')).toBe(
      'catalogQuery,promotionApplication',
    );
  });

  it('★★★ is EMPTY for every shape that is not a usable grant, so a route fails closed', () => {
    // Absence, a blank, a non-string: each yields the empty grant rather than something a
    // membership test might accidentally satisfy.
    for (const unusable of [undefined, null, '', '   ', 1, true, {}, []]) {
      expect(serviceScopeFor(unusable)).toBe('');
      expect(grants(unusable, 'promotionApplication')).toBe(false);
    }

    expect(
      principalOf(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID })).serviceScope,
    ).toBe('');
  });

  it('grants a capability the list names, folding case as CFML `eq` does', () => {
    for (const rendering of [
      'promotionApplication',
      'PROMOTIONAPPLICATION',
      'PromotionApplication',
      'catalogQuery,promotionApplication',
      'promotionApplication,priceResolution',
    ]) {
      expect(grants(rendering, 'promotionApplication')).toBe(true);
    }
  });

  it('★★ grants ONLY what the list names - no prefix, substring or padded match', () => {
    // A grant is an exact element comparison.
    for (const rendering of [
      'promotion',
      'promotionApplications',
      'catalogQuery',
      'catalogQuery,priceResolution',
      'catalogQuery, promotionApplication',
    ]) {
      expect(grants(rendering, 'promotionApplication')).toBe(false);
    }
  });

  it('★★★ is INDEPENDENT of the administrative claim in both directions', () => {
    const administrator = principalOf(
      eventWithAuthorizer({
        [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
        [AUTHORIZER_ADMIN_CLAIM]: 'true',
      }),
    );

    expect(administrator.adminAccountFlag).toBe(true);
    expect(administrator.serviceScope).toBe('');
    expect(principalHasServiceScope(administrator, 'promotionApplication')).toBe(false);

    const service = principalOf(
      eventWithAuthorizer({
        [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
        [AUTHORIZER_SERVICE_SCOPE_CLAIM]: 'promotionApplication',
      }),
    );

    expect(service.adminAccountFlag).toBe(false);
    expect(principalHasServiceScope(service, 'promotionApplication')).toBe(true);
  });

  it('never establishes a granted principal without an account', () => {
    expect(
      resolveRequestPrincipal(
        eventWithAuthorizer({ [AUTHORIZER_SERVICE_SCOPE_CLAIM]: 'promotionApplication' }),
      ).identified,
    ).toBe(false);
  });

  it('cannot be granted by anything a CALLER writes', () => {
    // The body, the headers, the query string and the path all assert the grant; the authorizer
    // context does not exist. Nothing may be granted.
    const event = eventWithAuthorizer(undefined);
    const tampered: APIGatewayProxyEvent = {
      ...event,
      body: JSON.stringify({ [AUTHORIZER_SERVICE_SCOPE_CLAIM]: 'promotionApplication' }),
      headers: { [AUTHORIZER_SERVICE_SCOPE_CLAIM]: 'promotionApplication' },
      queryStringParameters: { [AUTHORIZER_SERVICE_SCOPE_CLAIM]: 'promotionApplication' },
      pathParameters: { [AUTHORIZER_SERVICE_SCOPE_CLAIM]: 'promotionApplication' },
    };

    expect(resolveRequestPrincipal(tampered).identified).toBe(false);
  });

  it('is read case-insensitively by claim NAME, as a CFML struct key is', () => {
    // An authorizer emitting `SERVICESCOPE` names the same claim as one emitting `serviceScope` -
    // the same folding the account and admin claims get.
    expect(
      grants(undefined, 'promotionApplication') ||
        principalHasServiceScope(
          principalOf(
            eventWithAuthorizer({
              [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID,
              SERVICESCOPE: 'promotionApplication',
            }),
          ),
          'promotionApplication',
        ),
    ).toBe(true);
  });
});

describe('what the resolver deliberately does not read', () => {
  it('never touches requestContext.identity', () => {
    // The fixture's `identity` throws. Both the identified and the unidentified path must complete
    // without it being read.
    expect(() =>
      resolveRequestPrincipal(eventWithAuthorizer({ [AUTHORIZER_ACCOUNT_CLAIM]: ACCOUNT_ID })),
    ).not.toThrow();
    expect(() => resolveRequestPrincipal(eventWithAuthorizer(undefined))).not.toThrow();
  });

  it('ignores an account identifier supplied anywhere a CALLER can write one', () => {
    // The cross-account disclosure case. A body, a header and a query string are all
    // caller-authored.
    const forged = 'ffffffffffffffffffffffffffffffff';
    const event = eventWithAuthorizer(undefined);
    const tampered: APIGatewayProxyEvent = {
      ...event,
      body: JSON.stringify({ accountID: forged }),
      headers: { 'x-account-id': forged, accountID: forged },
      queryStringParameters: { accountID: forged },
      pathParameters: { accountID: forged },
    };

    expect(resolveRequestPrincipal(tampered).identified).toBe(false);
  });

  it('is total: no shape of authorizer context makes it throw', () => {
    for (const shape of [undefined, null, '', 'a string', 0, false, [], {}, new Date()]) {
      expect(() => resolveRequestPrincipal(eventWithAuthorizer(shape))).not.toThrow();
    }
  });
});

// The one unrecognized key a strict schema does not refuse.
//
// `containsPrototypeMemberKey` and `PROTOTYPE_MEMBER_FIELD_ISSUE` - the detection and the refusal
// that close the single gap in this service's closed request grammar.

/**
 * Parse raw request text into the `object` the predicate declares, or fail the case.
 *
 * The narrowing is the point: both call sites in production reach this check only after
 * establishing that the parsed body is a non-null, non-array object.
 */
function parseDocument(text: string): object {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`the fixture ${text} did not parse to an object`);
  }

  return parsed;
}

describe('containsPrototypeMemberKey', () => {
  it('★★★ detects the key as an OWN property at the root, where a strict schema admits it', () => {
    expect(containsPrototypeMemberKey(parseDocument('{"operation":"x","__proto__":{"p":1}}'))).toBe(
      true,
    );
    expect(Object.prototype).not.toHaveProperty('p');
  });

  it('★★ detects it at every depth, including inside an array element', () => {
    // DEEP, because the asymmetry it corrects is deep: `strictObject` refuses an unrecognized key
    // at every level, so refusing this one only at the root would leave the inconsistency one
    // level down.
    for (const text of [
      '{"order":{"orderID":"o-1","__proto__":{"p":1}}}',
      '{"order":{"orderItems":[{"skuID":"s-1","__proto__":{"p":1}}]}}',
      '{"a":[{"b":{"c":[{"__proto__":{"p":1}}]}}]}',
      '{"a":{"b":{"c":{"d":{"e":{"__proto__":{"p":1}}}}}}}',
    ]) {
      expect(containsPrototypeMemberKey(parseDocument(text))).toBe(true);
    }
  });

  it('detects it whatever the offending key HOLDS, including null and a scalar', () => {
    // The value under the key is never inspected. A document that carries the name at all is
    // refused, because what makes it a refusal is the member being present, not what was put in
    // it.
    for (const text of ['{"__proto__":"x"}', '{"__proto__":null}', '{"__proto__":0}']) {
      expect(containsPrototypeMemberKey(parseDocument(text))).toBe(true);
    }
  });

  it('★★ answers false for an ordinary document, so no well-formed request is refused', () => {
    // The INHERITED `__proto__` is present on every ordinary object in the language and is not a
    // caller's doing - `Object.hasOwn` is what distinguishes the two.
    const ordinary = parseDocument(
      '{"operation":"applyPromotions","order":{"orderID":"o-1","orderItems":[{"skuID":"s-1"}]}}',
    );

    expect(containsPrototypeMemberKey(ordinary)).toBe(false);
    expect('__proto__' in ordinary).toBe(true);
    expect(Object.hasOwn(ordinary, '__proto__')).toBe(false);
  });

  it('★★ MUTATES NOTHING - neither the document it walks nor `Object.prototype`', () => {
    const document = parseDocument('{"a":1,"__proto__":{"polluted":"yes"}}');
    const before = JSON.stringify(document);

    expect(containsPrototypeMemberKey(document)).toBe(true);
    expect(JSON.stringify(document)).toBe(before);
    expect(Object.hasOwn(document, '__proto__')).toBe(true);

    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();

    // And it is a pure function of its argument: a second call on the same document answers the
    // same way, which it could not if the first had consumed or altered anything.
    expect(containsPrototypeMemberKey(document)).toBe(true);
  });

  it('answers false for the OTHER prototype-adjacent names, which a strict schema already refuses', () => {
    // `constructor` and `prototype` need no help here: measured against the pinned validator, both
    // come back as `unrecognized_keys`, so detecting them would duplicate the schema and change
    // nothing.
    expect(
      containsPrototypeMemberKey(parseDocument('{"constructor":{"a":1},"prototype":{"b":2}}')),
    ).toBe(false);
  });

  it('answers false for an empty document, an empty array and a document of scalars', () => {
    for (const text of ['{}', '[]', '{"a":null,"b":1,"c":"x","d":true,"e":[null,null]}']) {
      expect(containsPrototypeMemberKey(parseDocument(text))).toBe(false);
    }
  });

  it('★★★ survives caller-supplied nesting that would overflow a recursive walk', () => {
    // ITERATIVE, with an explicit stack, because a `RangeError` thrown from a security guard would
    // convert a 400 into an unrecognized 500, and a 2 000-level document is well within what a
    // caller can send.
    const depth = 2000;
    const clean = `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;
    const offending = `${'{"a":'.repeat(depth)}{"__proto__":{"p":1}}${'}'.repeat(depth)}`;

    expect(containsPrototypeMemberKey(parseDocument(clean))).toBe(false);
    expect(containsPrototypeMemberKey(parseDocument(offending))).toBe(true);
  });

  it('survives a very wide document and a very long array', () => {
    const wide = `{${Array.from({ length: 5000 }, (_unused, index) => `"k${String(index)}":${String(index)}`).join(',')}}`;
    const long = `{"items":[${Array.from({ length: 5000 }, (_unused, index) => `{"n":${String(index)}}`).join(',')}]}`;

    expect(containsPrototypeMemberKey(parseDocument(wide))).toBe(false);
    expect(containsPrototypeMemberKey(parseDocument(long))).toBe(false);
  });

  it('is a PREDICATE, so there is no path for it to assemble out of the caller’s key names', () => {
    const document = parseDocument('{"planted_api_token_value":{"__proto__":{"p":1}}}');
    const detected: boolean = containsPrototypeMemberKey(document);

    expect(detected).toBe(true);
    expect(typeof detected).toBe('boolean');
    expect(JSON.stringify(PROTOTYPE_MEMBER_FIELD_ISSUE)).not.toContain('planted_api_token_value');
  });
});

describe('PROTOTYPE_MEMBER_FIELD_ISSUE', () => {
  it('★★ names the offending key and nothing else, and is frozen', () => {
    // The one member name involved that a caller does not choose. The depth at which the key was
    // found is deliberately absent, because a depth cannot be described without naming the
    // ancestors.
    expect(PROTOTYPE_MEMBER_FIELD_ISSUE).toStrictEqual({
      path: '__proto__',
      message: 'is not a member this request accepts',
    });
    expect(Object.isFrozen(PROTOTYPE_MEMBER_FIELD_ISSUE)).toBe(true);
  });

  it('publishes as a 400 with the fixed path, through the mapper’s own refusal arm', () => {
    // The shared refusal builder is what both JSON boundaries hand it to, so the published shape
    // is asserted here rather than restated in each handler suite.
    const { logger } = createRecordingLogger();
    const response = invalidRequestResponse('unusableRequestInput', contextWith(logger), [
      PROTOTYPE_MEMBER_FIELD_ISSUE,
    ]);

    expect(response.statusCode).toBe(400);
    expect(bodyOf(response.body).fields).toStrictEqual([
      { path: '__proto__', message: 'is not a member this request accepts' },
    ]);
  });
});
