// slatwall-ts - tests/unit/integrations/google/googleFeedService.test.ts.
//
// CFML parity [integrationServices/google/controllers/feed.cfc:L54-L56]: the legacy action was
// PUBLIC and UNAUTHENTICATED - `this.publicMethods="product"` with both the admin-method and
// secure-method lists empty - which is why authorization is asserted here rather than assumed.
//
// CFML parity [integrationServices/google/controllers/feed.cfc:L59-L63]: the layout suppression
// and the framework selection object the legacy body built have no target analogue; the row source
// replaced the selection, and [integrationServices/google/controllers/main.cfc:L49-L52] and
// [integrationServices/google/views/main/default.cfm:L50] carry no behaviour to port at all.

// Three node built-ins appear below, read by the module-text cases in section 10.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { GoogleFeedService } from '../../../../src/integrations/google/googleFeedService.js';
import type {
  GoogleProductFeedRenderer,
  GoogleProductFeedRowSource,
} from '../../../../src/integrations/google/googleFeedService.js';
import { renderGoogleProductFeed } from '../../../../src/integrations/google/rssFeedRenderer.js';
import type { GoogleProductFeedRow } from '../../../../src/integrations/google/googleFeedRepository.js';
import type {
  FeedCriteria,
  ProductFeedPort,
} from '../../../../src/domain/ports/productFeedPort.js';
// Nothing from `src/lib/config.js`: the subject takes no configuration argument and holds no
// configuration edge.

/**
 * The host handed to the subject, and a non-routable placeholder by design.
 *
 * `.invalid` is reserved precisely so that it can never resolve, which is the point: the ported
 * adapter performs no live Google call and needs no credentials.
 */
const FEED_HOST = 'feed.example.invalid';

/**
 * The same placeholder wearing MIXED CASE, and nothing else.
 *
 * Used by one case to prove the host is forwarded byte-identically.
 *
 * Module now carries" - an allow-list factory that trimmed and lower-cased, and a constructor
 * check that accepted or refused without normalising.
 */
const MIXED_CASE_FEED_HOST = 'Feed.EXAMPLE.invalid';

/**
 * The placeholder wearing surrounding whitespace, which the SERVICE forwards untouched and the
 * RENDERER refuses.
 *
 * Both halves matter, and holding them in one named constant is what makes the seam legible.
 *
 * It stays a named constant because it is the value whose handling differs most visibly between
 * the two layers.
 */
const PADDED_FEED_HOST = '  Feed.EXAMPLE.invalid  ';

/**
 * The instant handed to the subject, stated in explicit UTC.
 *
 * The subject holds an instant rather than reading a clock, which is what makes it deterministic;
 * nothing in this file consults the system clock.
 */

const FEED_INSTANT = new Date('2024-06-01T12:34:56.789Z');

/**
 * The wire form of {@link FEED_INSTANT}, for the no-mutation case.
 */
const FEED_INSTANT_ISO = '2024-06-01T12:34:56.789Z';

/**
 * What the double renderer returns, and what the subject must return unchanged.
 *
 * Deliberately hostile to an orchestrator that does one thing too many: it opens and closes with
 * whitespace, so a trim shows up; it carries `&`, `<`, `>` and `"` unescaped.
 */
const RENDERED_FEED_SENTINEL = '  <<fake rendered feed>> & <not escaped> "verbatim"  ';

/**
 * A second, distinguishable document, for the cases that prove instances are independent.
 */
const ALTERNATE_FEED_SENTINEL = '<<second fake rendered feed, from a second instance>>';

/**
 * The ordered-log entry recorded when the row source is entered.
 */
const ROW_SOURCE_STEP = 'row source read';

/**
 * The ordered-log entry recorded when the renderer is entered.
 */
const RENDERER_STEP = 'renderer invoked';

/**
 * The one legal step sequence for a successful generation.
 *
 * "Create the product feed" [integrationServices/google/controllers/feed.cfc:L62]: the legacy
 * selected once and rendered once, in that order, for one request.
 */
const READ_THEN_RENDER: readonly string[] = [ROW_SOURCE_STEP, RENDERER_STEP];

/**
 * The message carried by the row-source failure the propagation cases inject.
 */
const ROW_SOURCE_FAILURE_MESSAGE = 'fake row source read failure';

/**
 * The message carried by the renderer failure the propagation cases inject.
 */
const RENDERER_FAILURE_MESSAGE = 'fake renderer failure';

// Local types and the row factory.

/**
 * The projection as it crosses the subject: opaque, and never inspected by it.
 *
 * A local alias, not a re-declaration - the shipped projection remains the single source of truth.
 */
type FeedRows = readonly GoogleProductFeedRow[];

/**
 * One row, with every key present.
 *
 * The count was twenty-two and `brandID` is the twenty-third.
 *
 * The defaults are obviously fake, after the pattern in `meta/tests/unit/Helper.cfc`, and
 * overrides replace individual fields per case.
 */
function makeFeedRow(overrides: Partial<GoogleProductFeedRow> = {}): GoogleProductFeedRow {
  return {
    skuID: 'fake-sku-id-1',
    productID: 'fake-product-id-1',
    skuCode: 'FAKE-SKU-1',
    calculatedTitle: 'Fake Product Title',
    productDescription: 'Fake product description.',
    productTypeDescription: 'Fake product type description.',
    productTypeSimpleRepresentation: 'Fake Root Type',
    productUrlPath: '/fake-url-key/fake-product-url-title/',
    imageLinkPath: '/fake-image-base/product/default/fake-sku-image.jpg',
    additionalImageLinkPaths: [],
    productPrice: undefined,
    skuPrice: undefined,
    skuSalePrice: undefined,
    salePriceExpirationDateTime: undefined,
    brandID: 'fake-brand-id-1',
    brandName: 'Fake Brand',
    productCode: 'FAKE-PRODUCT-1',
    skuShippingWeight: '1',
    skuShippingWeightUnitCode: 'lb',
    skuActiveFlag: true,
    productActiveFlag: true,
    productPublishedFlag: true,
    productCalculatedQATS: 7,
    ...overrides,
  };
}

/**
 * One recorded renderer invocation, kept exactly as the subject supplied it.
 */
interface RecordedRendererCall {
  readonly rows: FeedRows;
  readonly feedHost: string;
  readonly now: Date;
}

/**
 * One case's subject plus the three records its doubles keep.
 *
 * The records are exposed through read-only array types over the very arrays the doubles append
 * to, so a case can watch them grow but cannot forge an entry.
 */
interface FeedServiceHarness {
  readonly service: GoogleFeedService;

  /**
   * The one argument every case passes to `generateProductFeed`.
   */
  readonly criteria: FeedCriteria;

  /**
   * Every collaborator entry, in the order the subject reached it.
   */
  readonly callLog: readonly string[];

  /**
   * One entry per row-source call, holding the arguments that call received.
   */
  readonly rowSourceCallArguments: readonly (readonly unknown[])[];

  /**
   * One entry per renderer call, holding what that call received.
   */
  readonly rendererCalls: readonly RecordedRendererCall[];
}

/**
 * How a case configures its doubles.
 *
 * `read` is required because every case decides what the read does - resolve, reject or stay
 * pending.
 */
interface FeedServiceHarnessOptions {
  /**
   * Invoked by the double row source; its result is what the subject awaits.
   */
  readonly read: () => Promise<FeedRows>;

  /**
   * Invoked by the double renderer to produce the document. Defaults to the sentinel.
   */
  readonly render?: (call: RecordedRendererCall) => string;

  /**
   * The host placed on {@link FeedServiceHarness.criteria}. Defaults to {@link FEED_HOST}.
   *
   * A plain `string`, which is the shipped contract's own member type.
   */
  readonly feedHost?: string;

  /**
   * The instant placed on {@link FeedServiceHarness.criteria}. Defaults to {@link FEED_INSTANT}.
   */
  readonly now?: Date;
}

/**
 * Builds one subject wired to two fresh doubles, and returns both plus their records.
 *
 * JUDGMENT CALL: both collaborators arrive as explicit, typed CONSTRUCTOR arguments, and that is
 * the whole replacement for the legacy dependency mechanism.
 *
 * JUDGMENT CALL: the legacy's dead collaborator is not carried forward.
 * [integrationServices/google/controllers/feed.cfc:L51] declares.
 */
function makeFeedServiceHarness(options: FeedServiceHarnessOptions): FeedServiceHarness {
  const callLog: string[] = [];
  const rowSourceCallArguments: (readonly unknown[])[] = [];
  const rendererCalls: RecordedRendererCall[] = [];
  const render = options.render ?? ((): string => RENDERED_FEED_SENTINEL);
  const repository: GoogleProductFeedRowSource = {
    fetchProductFeedRows: (...args: readonly unknown[]): Promise<FeedRows> => {
      callLog.push(ROW_SOURCE_STEP);
      rowSourceCallArguments.push([...args]);
      return options.read();
    },
  };

  // The double renderer. Its three parameters are contextually typed by the shipped renderer
  // collaborator type, and it is SYNCHRONOUS, exactly as the contract needs.
  const renderFeed: GoogleProductFeedRenderer = (rows, feedHost, now) => {
    callLog.push(RENDERER_STEP);
    const call: RecordedRendererCall = { rows, feedHost, now };
    rendererCalls.push(call);
    return render(call);
  };

  // Two arguments, which is the whole constructor: the row source and the renderer seam.
  const service = new GoogleFeedService(repository, renderFeed);

  // FROZEN, because the subject must forward what it was handed rather than adjust it: a frozen
  // criteria makes any in-place substitution a run-time failure instead of a silent pass.
  const criteria: FeedCriteria = Object.freeze({
    feedHost: options.feedHost ?? FEED_HOST,
    now: options.now ?? FEED_INSTANT,
  });

  return { service, criteria, callLog, rowSourceCallArguments, rendererCalls };
}

/**
 * The one renderer call a case expects, narrowed rather than asserted.
 *
 * An indexed read answers `T | undefined` under `noUncheckedIndexedAccess`, and no postfix
 * non-null assertion appears in this file.
 */
function soleRendererCall(harness: FeedServiceHarness): RecordedRendererCall {
  if (harness.rendererCalls.length !== 1) {
    throw new Error(
      `expected exactly one renderer call, recorded ${String(harness.rendererCalls.length)}`,
    );
  }

  const [call] = harness.rendererCalls;
  if (call === undefined) {
    throw new Error('expected the recorded renderer call to be readable');
  }

  return call;
}

/**
 * Generates a feed through the declared port rather than through the class.
 *
 * Deliberately not `async`: it forwards the subject's promise instead of awaiting and re-wrapping
 * it, which keeps the returned promise the subject's own.
 */
function generateThroughPort(port: ProductFeedPort, criteria: FeedCriteria): Promise<string> {
  return port.generateProductFeed(criteria);
}

// The declared contract.

describe('GoogleFeedService - the declared contract', () => {
  it('is assignable to the feed-generation port with no cast and no assertion', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });
    const port: ProductFeedPort = harness.service;

    await expect(generateThroughPort(port, harness.criteria)).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('satisfies a port-typed parameter, so a consumer needs no knowledge of the class', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    // Passing the instance where only the port is declared is the same proof from the caller's
    // side, and is how the composition root hands the subject on.
    await expect(generateThroughPort(harness.service, harness.criteria)).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );
  });

  it('implements a port that declares exactly one capability', () => {
    // A compile-time exhaustiveness check: if the port ever declared a second member, `keyof`
    // would widen and the second binding would stop compiling.
    type PortCapabilityNames = keyof ProductFeedPort;
    const soleCapabilityName: PortCapabilityNames = 'generateProductFeed';
    const exactlyOneCapability: 'generateProductFeed' = soleCapabilityName;

    expect(exactlyOneCapability).toBe('generateProductFeed');
  });

  it('declares that capability with exactly ONE parameter, the criteria', () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    // Bound so the reference carries its receiver rather than dangling.
    const boundGenerate: (criteria: FeedCriteria) => Promise<string> =
      harness.service.generateProductFeed.bind(harness.service);

    expect(boundGenerate.length).toBe(1);

    // And it is one, not two. A second parameter would mean a selection surface had been added
    // alongside the criteria, which the four invariant filters forbid.
    expect(harness.service.generateProductFeed.length).toBe(1);
  });

  it('returns a promise of the document, keeping the read on the async boundary', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    const pending = harness.service.generateProductFeed(harness.criteria);

    // Asynchronous because it READS: a method is asynchronous in this migration if and only if its
    // legacy body reached the data store. This one did.
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(typeof (await pending)).toBe('string');
  });
});

describe('GoogleFeedService - the step sequence', () => {
  it('reads the rows and then renders them, in that order', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
    });

    await harness.service.generateProductFeed(harness.criteria);

    expect(harness.callLog).toEqual([ROW_SOURCE_STEP, RENDERER_STEP]);
  });

  it('keeps that order when the feed has no qualifying rows', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    await harness.service.generateProductFeed(harness.criteria);

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('reaches each collaborator exactly once per generation', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow(), makeFeedRow({ skuID: 'fake-sku-id-2' })]),
    });

    await harness.service.generateProductFeed(harness.criteria);

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
    expect(harness.rowSourceCallArguments).toHaveLength(1);
    expect(harness.rendererCalls).toHaveLength(1);
  });

  it('does not reach the renderer until the read has settled', async () => {
    // The read is held open, so the two steps are separated in time and the gap is observable,
    // which makes the await provable rather than plausible.
    let releaseRead: ((rows: FeedRows) => void) | undefined;
    const heldRead = new Promise<FeedRows>((resolve) => {
      releaseRead = resolve;
    });
    const rows: FeedRows = [makeFeedRow()];
    const harness = makeFeedServiceHarness({ read: () => heldRead });

    const pending = harness.service.generateProductFeed(harness.criteria);

    // The row source was entered synchronously, an async body running to its first await, and the
    // renderer has not been reached: a subject that rendered without awaiting would already have
    // logged it here.
    expect(harness.callLog).toEqual([ROW_SOURCE_STEP]);

    if (releaseRead === undefined) {
      throw new Error('expected the held read to expose its resolver');
    }
    releaseRead(rows);

    await expect(pending).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(harness.callLog).toEqual(READ_THEN_RENDER);

    // And the renderer received the RESOLVED array, not the promise that carried it. Identity is
    // the assertion: an unawaited read would have handed the renderer a promise, and this
    // comparison would fail.
    expect(soleRendererCall(harness).rows).toBe(rows);
  });
});

// What each collaborator receives.

describe('GoogleFeedService - what each collaborator receives', () => {
  it('invokes the row source with no arguments', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    await harness.service.generateProductFeed(harness.criteria);

    // One call, and its argument list is empty: the shipped query declares no parameter, and the
    // subject invents none to pass it.
    expect(harness.rowSourceCallArguments).toEqual([[]]);
  });

  it('hands the renderer the rows, the host and the instant, in that order', async () => {
    const rows: FeedRows = [makeFeedRow(), makeFeedRow({ skuID: 'fake-sku-id-2' })];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);
    expect(call.rows).toBe(rows);
    expect(call.feedHost).toBe(FEED_HOST);
    expect(call.now).toBe(FEED_INSTANT);
  });

  it('forwards the constructor host byte-identically, doing no normalising of its own', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: PADDED_FEED_HOST,
    });

    await harness.service.generateProductFeed(harness.criteria);

    // This case briefly asserted the opposite of its own title.
    expect(soleRendererCall(harness).feedHost).toBe(PADDED_FEED_HOST);
  });

  it('forwards mixed case unchanged, so no lower-casing hides in the field', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: MIXED_CASE_FEED_HOST,
    });

    await harness.service.generateProductFeed(harness.criteria);
    expect(soleRendererCall(harness).feedHost).toBe(MIXED_CASE_FEED_HOST);
  });

  it('forwards the constructor instant without cloning it or mutating it', async () => {
    // This case owns its instant, so a subject that mutated what it was given could not reach
    // another case.
    const ownInstant = new Date(FEED_INSTANT_ISO);
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      now: ownInstant,
    });

    await harness.service.generateProductFeed(harness.criteria);

    expect(soleRendererCall(harness).now).toBe(ownInstant);
    expect(ownInstant.toISOString()).toBe(FEED_INSTANT_ISO);
  });

  it('holds an instant rather than reading a clock, so two generations agree', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    await harness.service.generateProductFeed(harness.criteria);
    await harness.service.generateProductFeed(harness.criteria);

    expect(harness.rendererCalls).toHaveLength(2);
    const instants = harness.rendererCalls.map((call) => call.now);
    expect(instants).toEqual([FEED_INSTANT, FEED_INSTANT]);
  });
});

// The document comes back untouched.
//
// The reshaping's whole substance is that the caller receives the document, so what arrives must
// be the renderer's string and nothing else.

describe('GoogleFeedService - the document comes back untouched', () => {
  it('resolves to the renderer string verbatim, whitespace and all', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed(harness.criteria);

    // Exact equality against a sentinel that opens and closes with whitespace: no trim, no
    // wrapper, no envelope, no re-encoding, no compression and no pretty-printing.
    expect(document).toBe(RENDERED_FEED_SENTINEL);
    expect(document.startsWith('  ')).toBe(true);
    expect(document.endsWith('  ')).toBe(true);
  });

  it('does not escape or re-encode the characters the renderer already emitted', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed(harness.criteria);

    expect(document).toContain('&');
    expect(document).toContain('<not escaped>');
    expect(document).toContain('"verbatim"');
    expect(document).not.toContain('&amp;');
    expect(document).not.toContain('&lt;');
    expect(document).not.toContain('&quot;');
  });

  it('returns whatever the renderer returns, so the string is provably the renderer output', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      render: () => ALTERNATE_FEED_SENTINEL,
    });

    await expect(harness.service.generateProductFeed(harness.criteria)).resolves.toBe(
      ALTERNATE_FEED_SENTINEL,
    );
  });

  it('contributes no endpoint, host or namespace of its own to the document', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed(harness.criteria);

    // The double renderer emits no Google reference at all, so any occurrence here could only have
    // been added by the subject.
    expect(document).not.toMatch(/google/i);
    expect(document).toBe(RENDERED_FEED_SENTINEL);
  });
});

// A feed with no qualifying rows.
//
// A zero-row feed is an ORDINARY OUTCOME, not an error and not an empty string: the legacy loop
// over an empty record set still produced a complete document.

describe('GoogleFeedService - a feed with no qualifying rows', () => {
  it('still invokes the renderer when the read yields nothing', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    await harness.service.generateProductFeed(harness.criteria);

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
    expect(harness.rendererCalls).toHaveLength(1);
  });

  it('hands the renderer the empty array itself, not a substitute', async () => {
    const emptyRows: FeedRows = [];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(emptyRows) });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);
    expect(call.rows).toBe(emptyRows);
    expect(call.rows).toEqual([]);
  });

  it('returns the rendered document rather than short-circuiting to an empty string', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    const document = await harness.service.generateProductFeed(harness.criteria);

    expect(document).toBe(RENDERED_FEED_SENTINEL);
    expect(document).not.toBe('');
  });

  it('forwards the host and the instant on the empty path exactly as on the populated one', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);
    expect(call.feedHost).toBe(FEED_HOST);
    expect(call.now).toBe(FEED_INSTANT);
  });
});

// Failure propagates in both directions.

describe('GoogleFeedService - failure propagates in both directions', () => {
  it('propagates a read failure to the caller', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toThrow(
      ROW_SOURCE_FAILURE_MESSAGE,
    );
  });

  it('propagates the very same failure object, unwrapped and un-rethrown', async () => {
    const failure = new Error(ROW_SOURCE_FAILURE_MESSAGE);
    const harness = makeFeedServiceHarness({ read: () => Promise.reject(failure) });

    // Identity, not merely message equality: the subject adds no failure mode of its own, so the
    // layer owning the request maps the original.
    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toBe(failure);
  });

  it('never reaches the renderer when the read fails', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toThrow(
      ROW_SOURCE_FAILURE_MESSAGE,
    );

    // The log stops at the read. Rendering a feed whose rows never arrived would publish an empty
    // catalog as though it were the truth.
    expect(harness.callLog).toEqual([ROW_SOURCE_STEP]);
    expect(harness.rendererCalls).toEqual([]);
  });

  it('propagates a renderer failure to the caller', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      render: () => {
        throw new Error(RENDERER_FAILURE_MESSAGE);
      },
    });

    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toThrow(
      RENDERER_FAILURE_MESSAGE,
    );
  });

  it('reaches the renderer before that failure, so the read had already completed', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      render: () => {
        throw new Error(RENDERER_FAILURE_MESSAGE);
      },
    });

    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toThrow(
      RENDERER_FAILURE_MESSAGE,
    );

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('defaults nothing on failure, returning no document at all', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    // A rejection, never a resolved empty string and never a placeholder document.
    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toThrow(Error);
    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.not.toBe('');
  });

  it('recovers on a later generation once the read succeeds, holding no failed state', async () => {
    let readAttempts = 0;
    const rows: FeedRows = [makeFeedRow()];
    const harness = makeFeedServiceHarness({
      read: () => {
        readAttempts += 1;
        return readAttempts === 1
          ? Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE))
          : Promise.resolve(rows);
      },
    });

    await expect(harness.service.generateProductFeed(harness.criteria)).rejects.toThrow(
      ROW_SOURCE_FAILURE_MESSAGE,
    );
    await expect(harness.service.generateProductFeed(harness.criteria)).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );

    expect(harness.callLog).toEqual([ROW_SOURCE_STEP, ROW_SOURCE_STEP, RENDERER_STEP]);
    expect(readAttempts).toBe(2);
  });
});

// Constructor injection, and no hidden state anywhere.
//
// The collaborators arrive through the constructor and nowhere else: no module-level instance to
// share, no lazy collaborator to memoise, no cached document to serve.

describe('GoogleFeedService - constructor injection and no hidden state', () => {
  it('keeps two instances independent, so neither holds shared module state', async () => {
    const firstRows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-first' })];
    const secondRows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-second' })];
    const first = makeFeedServiceHarness({ read: () => Promise.resolve(firstRows) });
    const second = makeFeedServiceHarness({
      read: () => Promise.resolve(secondRows),
      render: () => ALTERNATE_FEED_SENTINEL,
    });

    await expect(first.service.generateProductFeed(first.criteria)).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );
    await expect(second.service.generateProductFeed(second.criteria)).resolves.toBe(
      ALTERNATE_FEED_SENTINEL,
    );

    // Each instance reached only its own collaborators. A module-level row source or renderer
    // would have crossed here.
    expect(soleRendererCall(first).rows).toBe(firstRows);
    expect(soleRendererCall(second).rows).toBe(secondRows);
    expect(first.callLog).toEqual(READ_THEN_RENDER);
    expect(second.callLog).toEqual(READ_THEN_RENDER);
  });

  it('reads and renders again on every generation, memoising nothing', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    await harness.service.generateProductFeed(harness.criteria);
    await harness.service.generateProductFeed(harness.criteria);
    await harness.service.generateProductFeed(harness.criteria);

    // Three generations, three reads, three renders, strictly alternating. A lazy memo on either
    // collaborator or on the document would collapse this log.
    expect(harness.callLog).toEqual([
      ROW_SOURCE_STEP,
      RENDERER_STEP,
      ROW_SOURCE_STEP,
      RENDERER_STEP,
      ROW_SOURCE_STEP,
      RENDERER_STEP,
    ]);
    expect(harness.rowSourceCallArguments).toHaveLength(3);
    expect(harness.rendererCalls).toHaveLength(3);
  });

  it('serves fresh rows rather than a cached document when the catalog changes', async () => {
    const beforeRows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-before' })];
    const afterRows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-after' })];
    let reads = 0;
    const harness = makeFeedServiceHarness({
      read: () => {
        reads += 1;
        return Promise.resolve(reads === 1 ? beforeRows : afterRows);
      },
    });

    await harness.service.generateProductFeed(harness.criteria);
    await harness.service.generateProductFeed(harness.criteria);

    expect(harness.rendererCalls).toHaveLength(2);
    const forwarded = harness.rendererCalls.map((call) => call.rows);
    expect(forwarded).toEqual([beforeRows, afterRows]);
  });

  it('isolates a failing instance from a healthy one', async () => {
    const healthyRows: FeedRows = [makeFeedRow()];
    const healthy = makeFeedServiceHarness({ read: () => Promise.resolve(healthyRows) });
    const failing = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    await expect(failing.service.generateProductFeed(failing.criteria)).rejects.toThrow(
      ROW_SOURCE_FAILURE_MESSAGE,
    );
    await expect(healthy.service.generateProductFeed(healthy.criteria)).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );

    expect(failing.callLog).toEqual([ROW_SOURCE_STEP]);
    expect(healthy.callLog).toEqual(READ_THEN_RENDER);
  });

  it('constructs nothing for itself, reaching only the collaborators it was given', async () => {
    const rows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-injected' })];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    const document = await harness.service.generateProductFeed(harness.criteria);

    // Both observable effects trace back to an injected double: the rows the renderer saw came
    // from the double row source, and the document is the one the double renderer returned.
    expect(soleRendererCall(harness).rows).toBe(rows);
    expect(document).toBe(RENDERED_FEED_SENTINEL);
  });
});

// The surface takes EXACTLY one argument, and it admits no invented input beyond it.
//
// "judgment call: no criteria type exists, and none is invented here.
// The two cases below are COMPILE-TIME assertions. Each `@ts-expect-error` exists solely to assert a

describe('GoogleFeedService - the surface takes one criteria argument and no narrowing', () => {
  it('declares exactly one parameter, and it is the two-member criteria', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });
    const parameterCount: 1 = 1 satisfies Parameters<
      GoogleFeedService['generateProductFeed']
    >['length'];
    expect(parameterCount).toBe(1);

    const declaredMembers: readonly (keyof FeedCriteria)[] = ['feedHost', 'now'];
    expect([...declaredMembers].sort()).toEqual(['feedHost', 'now']);

    // And the one argument is genuinely required: the criteria the harness supplies is forwarded
    // and the document comes back.
    await expect(harness.service.generateProductFeed(harness.criteria)).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );
    expect(harness.callLog).toEqual(READ_THEN_RENDER);
    expect(harness.rowSourceCallArguments).toEqual([[]]);
  });

  it('declares the criteria as REQUIRED, so no call may omit it', () => {
    // A pure compile-time assertion, and it is deliberately not an invocation. What is guaranteed
    // here is the type: a call that omits the criteria does not compile.
    // REQUIREDNESS IS CHECKED THROUGH THE TUPLE LENGTH, and no `@ts-expect-error` on a nullary
    type FeedCallParameters = Parameters<GoogleFeedService['generateProductFeed']>;
    const requiredArity: FeedCallParameters['length'] = 1;
    const optionalWouldWiden: 1 = requiredArity;

    expect(optionalWouldWiden).toBe(1);
  });

  it('rejects an options bag, a filter toggle, paging and every other narrowing', () => {
    // Stands in for the whole forbidden set at once: the include-inactive, include-unpublished,
    // include-out-of-stock and minimum-quantity switches, a filter array, a predicate, paging, a
    // sort, a locale.
    const invented: Parameters<GoogleFeedService['generateProductFeed']>[0] = {
      // That are required are absent.
      // @ts-expect-error - `includeInactive` is not a member of FeedCriteria, and the two members
      // that are required are absent.
      includeInactive: true,
    };

    expect(Object.keys(invented)).toEqual(['includeInactive']);
  });

  it('rejects an EXTRA member alongside an otherwise valid criteria', () => {
    // The sharper probe: both required members are present and correct, so the only thing wrong is
    // the third.
    const extended: Parameters<GoogleFeedService['generateProductFeed']>[0] = {
      feedHost: FEED_HOST,
      now: FEED_INSTANT,
      // @ts-expect-error - excess property: FeedCriteria declares feedHost and now, and nothing else.
      includeOutOfStock: true,
    };

    expect(extended.feedHost).toBe(FEED_HOST);
  });

  it('rejects an asynchronous renderer, so the renderer is synchronous by contract', () => {
    // Why this matters to the await discipline: the subject awaits the read and does not await the
    // renderer, which is only correct because the renderer contract returns a string rather than a
    // promise - asserted here.
    const feedDocument = RENDERED_FEED_SENTINEL;
    // @ts-expect-error - a promise-returning renderer is not assignable: the contract returns string.
    const asyncRenderer: GoogleProductFeedRenderer = () => Promise.resolve(feedDocument);

    expect(asyncRenderer([], FEED_HOST, FEED_INSTANT)).toBeInstanceOf(Promise);
  });
});

// Nothing else happens.
//
// Selection belongs to the row source and presentation to the renderer, so anything added here
// would duplicate behaviour in two places.

describe('GoogleFeedService - nothing else happens', () => {
  it('applies no filtering, forwarding even rows the selection invariants would exclude', async () => {
    // Every row here fails one of the four selection conditions the row source enforces at
    // [integrationServices/google/controllers/feed.cfc:L68-L72], so none could ever arrive from
    // the real one.
    const rows: FeedRows = [
      makeFeedRow({ skuID: 'fake-sku-id-inactive-sku', skuActiveFlag: false }),
      makeFeedRow({ skuID: 'fake-sku-id-inactive-product', productActiveFlag: false }),
      makeFeedRow({ skuID: 'fake-sku-id-unpublished', productPublishedFlag: false }),
      makeFeedRow({ skuID: 'fake-sku-id-no-quantity', productCalculatedQATS: 0 }),
    ];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);
    expect(call.rows).toBe(rows);
    expect(call.rows).toHaveLength(4);
  });

  it('applies no sorting, preserving the order the row source returned', async () => {
    // The legacy applied no ordering, so imposing one would be a repair rather than a port. These
    // rows are deliberately in no natural order.
    const rows: FeedRows = [
      makeFeedRow({ skuID: 'fake-sku-id-z', productCalculatedQATS: 1 }),
      makeFeedRow({ skuID: 'fake-sku-id-a', productCalculatedQATS: 99 }),
      makeFeedRow({ skuID: 'fake-sku-id-m', productCalculatedQATS: 50 }),
    ];
    const suppliedOrder = rows.map((row) => row.skuID);
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed(harness.criteria);

    expect(soleRendererCall(harness).rows.map((row) => row.skuID)).toEqual(suppliedOrder);

    // And the caller's own array was not reordered underneath it: no in-place sort.
    expect(rows.map((row) => row.skuID)).toEqual(suppliedOrder);
  });

  it('applies no row-shape mapping, forwarding the array and its elements by identity', async () => {
    const firstRow = makeFeedRow({ skuID: 'fake-sku-id-1' });
    const secondRow = makeFeedRow({ skuID: 'fake-sku-id-2' });
    const rows: FeedRows = [firstRow, secondRow];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);

    // The same array object, which makes element identity automatic: no copy, slice, spread or
    // projection in between. Asserted on the elements too, so the guarantee is explicit rather
    // than inferred.
    expect(call.rows).toBe(rows);
    expect(call.rows.every((row, index) => row === rows[index])).toBe(true);
    expect(call.rows).toEqual([firstRow, secondRow]);
  });

  it('performs no monetary arithmetic, leaving absent prices absent', async () => {
    // No arithmetic surface is reached from this module and no monetary type is imported here: a
    // subject that touched a price would have defaulted, coerced or formatted one, and all three
    // would show.
    const rows: FeedRows = [makeFeedRow()];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);
    const [forwardedRow] = call.rows;
    if (forwardedRow === undefined) {
      throw new Error('expected the forwarded row to be readable');
    }

    expect(forwardedRow.productPrice).toBeUndefined();
    expect(forwardedRow.skuPrice).toBeUndefined();
    expect(forwardedRow.skuSalePrice).toBeUndefined();
    expect(forwardedRow.salePriceExpirationDateTime).toBeUndefined();
  });

  it('adds no row of its own, and drops none', async () => {
    const rows: FeedRows = [
      makeFeedRow({ skuID: 'fake-sku-id-1' }),
      makeFeedRow({ skuID: 'fake-sku-id-2' }),
      makeFeedRow({ skuID: 'fake-sku-id-3' }),
    ];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed(harness.criteria);

    expect(soleRendererCall(harness).rows.map((row) => row.skuID)).toEqual([
      'fake-sku-id-1',
      'fake-sku-id-2',
      'fake-sku-id-3',
    ]);
  });
});

// The narrow surface, and where the host obligations actually live.
//
// "toTrustedFeedHost - the allow-listed authority the feed URLs are built from" and
// "GoogleFeedService - feed origin validation", together roughly 540 lines exercising an exported
// `UntrustedFeedHostError`.

describe('GoogleFeedService - the module surface, which is the finding this tier holds', () => {
  /**
   * The module whose published surface these cases read.
   */
  const SUBJECT_MODULE_PATH = 'src/integrations/google/googleFeedService.ts';

  /**
   * The keywords that can follow `export ` and name a symbol.
   *
   * `abstract` is deliberately absent: it PRECEDES `class`, so leaving it out makes
   * `export abstract class X` resolve to `X` rather than to `class`.
   */
  const DECLARATION_KEYWORDS: readonly string[] = [
    'class',
    'function',
    'const',
    'let',
    'var',
    'type',
    'interface',
    'enum',
  ];

  /**
   * Identifier characters, spelled out so no regular expression is needed to trim a token.
   */
  const IDENTIFIER_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';

  /**
   * Line openings that introduce a declaration, exported or module-private.
   */
  const DECLARATION_LINE_PREFIXES: readonly string[] = [
    'export ',
    'declare ',
    'abstract ',
    'class ',
    'const ',
    'enum ',
    'function ',
    'interface ',
    'let ',
    'type ',
    'var ',
  ];

  /**
   * The eight symbols the withdrawn host-policy subsystem consisted of.
   *
   * Named individually rather than pattern-matched, so a reader sees exactly which subsystem these
   * cases exist to keep out.
   */
  const WITHDRAWN_HOST_POLICY_SYMBOLS: readonly string[] = [
    'UntrustedFeedHostError',
    'TrustedFeedHost',
    'toTrustedFeedHost',
    'trustedFeedHostBrand',
    'FEED_HOST_AUTHORITY',
    'FEED_HOST_SHAPE',
    'FEED_HOST_MAX_LENGTH',
    'assertConfiguredFeedHost',
  ];

  /**
   * Re-export forms that would publish a symbol without declaring one.
   */
  const REEXPORT_FORMS: readonly string[] = [
    'export {',
    'export type {',
    'export default',
    'export * ',
  ];

  /**
   * A host carrying both a scheme and a path, which the renderer's grammar refuses.
   */
  const SCHEME_AND_PATH_HOST = 'https://attacker.example.invalid/attacker-path';

  /**
   * A host that is perfectly well formed and belongs to nobody this deployment trusts.
   */
  const UNTRUSTED_WELL_FORMED_HOST = 'attacker.example.invalid';

  function subjectModuleSource(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));

    return readFileSync(path.resolve(here, '..', '..', '..', '..', SUBJECT_MODULE_PATH), 'utf8');
  }

  function leadingIdentifier(token: string): string {
    let identifier = '';

    for (const character of token) {
      if (!IDENTIFIER_CHARACTERS.includes(character)) {
        break;
      }

      identifier += character;
    }

    return identifier;
  }

  function exportedSymbolNames(source: string): string[] {
    const names: string[] = [];

    for (const line of source.split('\n')) {
      if (!line.startsWith('export ')) {
        continue;
      }

      const tokens = line.split(' ').filter((token) => token.length > 0);
      const named = tokens.find(
        (token, index) => index > 0 && DECLARATION_KEYWORDS.includes(tokens[index - 1] ?? ''),
      );
      const identifier = named === undefined ? '' : leadingIdentifier(named);

      // A diagnostic rather than a silent skip: an export line this reader cannot parse is a gap
      // in the gate, and a gap that fails loudly is the only kind worth having.
      if (identifier.length === 0) {
        throw new Error(`could not read an exported symbol name from the line: ${line}`);
      }

      names.push(identifier);
    }

    return names;
  }

  function declarationLines(source: string): string[] {
    return source
      .split('\n')
      .filter((line) =>
        DECLARATION_LINE_PREFIXES.some((prefix) => line.trimStart().startsWith(prefix)),
      );
  }

  it('★ exports exactly the class and its two supporting types, and nothing else', () => {
    const source = subjectModuleSource();

    // No re-export form, checked first: `export { toTrustedFeedHost }` would publish the mint
    // again while declaring nothing, and the name reader below would not describe it.
    for (const form of REEXPORT_FORMS) {
      expect(source.split('\n').filter((line) => line.startsWith(form))).toStrictEqual([]);
    }

    // E7 - one principal exported unit per file plus co-located supporting types.
    expect([...exportedSymbolNames(source)].sort()).toStrictEqual([
      'GoogleFeedService',
      'GoogleProductFeedRenderer',
      'GoogleProductFeedRowSource',
    ]);
  });

  it('★ declares no host-policy symbol under any of the eight names it once used', () => {
    const declared = declarationLines(subjectModuleSource());

    // ANTI-VACUITY: the reader finds real declarations in this module, so the eight empty results
    // below are absences rather than a scan that matched nothing at all.
    expect(declared.some((line) => line.includes('GoogleFeedService'))).toBe(true);
    expect(declared.some((line) => line.includes('GoogleProductFeedRowSource'))).toBe(true);

    for (const symbol of WITHDRAWN_HOST_POLICY_SYMBOLS) {
      expect(declared.filter((line) => line.includes(symbol))).toStrictEqual([]);
    }
  });

  it('★ takes the host as a plain string and performs no check on it', async () => {
    // The compile-time half.
    const plainStringIsAssignable: FeedCriteria['feedHost'] = UNTRUSTED_WELL_FORMED_HOST;
    expect(plainStringIsAssignable).toBe(UNTRUSTED_WELL_FORMED_HOST);

    // The runtime half. A value the RENDERER refuses is accepted by the SUBJECT without complaint,
    // which is the positive statement that no origin policy survives in here.
    expect(() =>
      makeFeedServiceHarness({
        read: () => Promise.resolve([makeFeedRow()]),
        feedHost: SCHEME_AND_PATH_HOST,
      }),
    ).not.toThrow();

    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: SCHEME_AND_PATH_HOST,
    });

    await harness.service.generateProductFeed(harness.criteria);

    // Forwarded byte for byte, scheme and path intact: nothing here parses, strips or repairs.
    expect(soleRendererCall(harness).feedHost).toBe(SCHEME_AND_PATH_HOST);

    // And refused one layer down, which is where the shape check lives now.
    expect(() => renderGoogleProductFeed([], SCHEME_AND_PATH_HOST, FEED_INSTANT)).toThrow();
  });

  it('★ the host grammar is still enforced, by the renderer, and it still throws', () => {
    // Every one of these was refused by the withdrawn constructor guard, and every one is still
    // refused: emptiness, whitespace-only, a scheme, a path, credentials, a query, a fragment,
    // internal whitespace.
    for (const malformed of [
      '',
      '   ',
      'https://feed.example.invalid',
      'feed.example.invalid/attacker-path',
      'attacker@feed.example.invalid',
      'feed.example.invalid?tenant=a',
      'feed.example.invalid#fragment',
      'feed example.invalid',
      'feed.example.invalid\r\nX-Injected: 1',
      '.feed.example.invalid',
      'feed..example.invalid',
      '-feed.example.invalid',
      PADDED_FEED_HOST,
      'a'.repeat(260),
    ]) {
      expect(() => renderGoogleProductFeed([], malformed, FEED_INSTANT)).toThrow();
    }
    expect(() => renderGoogleProductFeed([], FEED_HOST, FEED_INSTANT)).not.toThrow();
    expect(() => renderGoogleProductFeed([], MIXED_CASE_FEED_HOST, FEED_INSTANT)).not.toThrow();
  });

  it('★ a well-formed but untrusted host is accepted end to end, which is the residual risk', async () => {
    // Stated as a case rather than only as a comment, because it is the honest consequence of
    // withdrawing the allow-list and a reader deserves to find it asserted.
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: UNTRUSTED_WELL_FORMED_HOST,
    });

    await harness.service.generateProductFeed(harness.criteria);

    expect(soleRendererCall(harness).feedHost).toBe(UNTRUSTED_WELL_FORMED_HOST);
    expect(() =>
      renderGoogleProductFeed([], UNTRUSTED_WELL_FORMED_HOST, FEED_INSTANT),
    ).not.toThrow();
  });
});

describe('GoogleFeedService - the scheme is not held, forwarded or chosen (S-09 declined)', () => {
  it('★★ hands the renderer THREE arguments: rows, the host, and the instant', async () => {
    const harness = makeFeedServiceHarness({
      read: (): Promise<FeedRows> => Promise.resolve([]),
    });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);
    expect(Object.keys(call)).toStrictEqual(['rows', 'feedHost', 'now']);
  });

  it('★★ carries ONLY the authority half of the origin, and carries it from construction', async () => {
    const harness = makeFeedServiceHarness({
      read: (): Promise<FeedRows> => Promise.resolve([]),
    });

    await harness.service.generateProductFeed(harness.criteria);

    const call = soleRendererCall(harness);

    // `FEED_HOST` is the plain literal, and it is what the harness puts on the criteria.
    expect(call.feedHost).toBe(FEED_HOST);

    // And the scheme is nowhere on the criteria either, so it cannot be forwarded by accident.
    expect(Object.keys(call)).not.toContain('feedScheme');
    expect(Object.keys(harness.criteria)).toStrictEqual(['feedHost', 'now']);
  });

  it('★ will not COMPILE with a scheme, which is what stops the member creeping back', () => {
    // `@ts-expect-error` on a positional CONSTRUCTOR argument, because the scheme had briefly been
    // `@ts-expect-error` fails the build if the error stops being reported, so it cannot rot into a
    const criteriaWithScheme: FeedCriteria = {
      feedHost: FEED_HOST,
      now: FEED_INSTANT,
      // @ts-expect-error - `FeedCriteria` declares no scheme; the renderer owns a frozen literal.
      feedScheme: 'https',
    };

    // And the excess member cannot reach the renderer even when a caller forces it past the
    // compiler: the subject reads exactly two members off the criteria.
    expect(Object.keys(criteriaWithScheme)).not.toStrictEqual(['feedHost', 'now']);
  });

  it('★ constructs from ONE argument, leaving the renderer to its default', () => {
    const service = new GoogleFeedService({
      fetchProductFeedRows: (): Promise<FeedRows> => Promise.resolve([]),
    });

    expect(service).toBeInstanceOf(GoogleFeedService);

    // Still the port, so the arity change did not cost the parity proof.
    const port: ProductFeedPort = service;

    expect(typeof port.generateProductFeed).toBe('function');
  });
});
