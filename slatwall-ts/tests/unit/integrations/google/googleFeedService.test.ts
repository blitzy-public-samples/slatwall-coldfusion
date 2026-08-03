// ---------------------------------------------------------------------------
// slatwall-ts - tests/unit/integrations/google/googleFeedService.test.ts
//
// SUBJECT: src/integrations/google/googleFeedService.ts, the ORCHESTRATION third of the Google
// product-feed adapter, whose one exported unit is `GoogleFeedService`. The class holds a row
// source, a host, an instant and a renderer, and its one method performs two steps: read the rows,
// then render them. So this suite is about SEQUENCE, FORWARDING and PASSTHROUGH - which
// collaborator is reached, in what order, with which arguments, and what comes back unchanged. The
// document's shape, the selection statement and the adapter contract's five inherited members
// belong to the renderer's, the repository's and integration.test.ts's suites. The subject reaches
// no database, network, Google endpoint, file, environment variable, setting, clock or application
// wiring, so two hand-written doubles declared inline are the entire scaffolding: no spy, no
// mocking library.
//
// COVERAGE CLASSIFICATION: NET-NEW in its entirety, never to be presented as parity. The legacy
// subsystem had a controller, a dead data-access component and a view but NO orchestrator, so there
// is no legacy unit whose coverage this extends. Measured on disk: a case-insensitive search of
// meta/ for `google` matches ZERO lines and one for `rss`, `productFeed` or `feed` matches ZERO
// files, the only hits on the integration surface names being line 36 of each legacy test file -
// the license special-exception clause, which covers nothing. Legacy coverage is extended by
// exactly two suites, meta/tests/unit/entity/ProductTest.cfc and
// meta/tests/unit/entity/BrandTest.cfc, and this is neither;
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub acknowledged rather than
// counted.
//
// BEHAVIOURAL AUTHORITY: [integrationServices/google/controllers/feed.cfc], 74 lines, read in full;
// supporting [integrationServices/google/controllers/main.cfc] (52 lines) and
// [integrationServices/google/views/feed/product.cfm] (65 lines).
//
// JUDGMENT CALL: the method surface is RESHAPED, and this records the provenance.
//   LEGACY  `public void function product(required struct rc)`
//           [integrationServices/google/controllers/feed.cfc:L58]
//   TARGET  `async generateProductFeed(): Promise<string>`
//   The legacy method RETURNED `void` AND PRODUCED ITS RESULT BY MUTATING `rc`: it
//   assigned a SKU selection onto the FW/1 request context at [.../feed.cfc:L63] and
//   let the framework resolve a view that read that key back at [.../product.cfm:L8],
//   so the document string existed nowhere in that control flow. The target RETURNS
//   THE DOCUMENT, and that inversion is the reshaping.
//
// VERIFIED ON DISK, WHERE THE SHIPPED SYMBOLS DIFFER FROM EXPECTATION
//     constructor(repository, feedHost, now, renderFeed = renderGoogleProductFeed)
//     async generateProductFeed(): Promise<string>
//   1. HOST AND INSTANT ARE CONSTRUCTOR PARAMETERS, NOT METHOD PARAMETERS, so every
//      forwarding assertion below checks what the CONSTRUCTOR was given.
//      `ProductFeedPort` declares the capability with no parameters, matching exactly.
//   2. THE RENDERER IS A DEFAULTED FOURTH PARAMETER, defaulting to the real
//      `renderGoogleProductFeed`. This suite ALWAYS injects a double: the default
//      would make every case a document-shape assertion another suite owns.
//   3. THE ROW SOURCE IS TYPED `GoogleProductFeedRowSource`, a one-method narrowing,
//      NOT the repository class - whose private fields would admit only itself. The
//      narrowing is what makes a structural double possible.
//   4. `rssFeedRenderer.ts` IS NOT IMPORTED HERE. The collaborator type is
//      `GoogleProductFeedRenderer`, declared by the subject's own module as
//      `typeof renderGoogleProductFeed`, so the double's parameters are contextually
//      typed and importing it would leave an unused binding under `noUnusedLocals`.
//   5. THE MONETARY FIELDS ARE REQUIRED PROPERTIES WHOSE TYPE ADMITS ABSENCE:
//      `readonly productPrice: Money | undefined`, not `productPrice?: Money`, so a
//      complete row is constructible with `undefined` there - which is how the row
//      factory below builds one WITHOUT naming the money value object.
//
// NOT PORTED, EACH OMISSION RECORDED WITH ITS LOCATOR
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L59-L60]: the layout
//   suppression, `// Hide the layout` then `request.layout = false;`, is a CFML view
//   concern with no target analogue.
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L62]: the legacy
//   intent comment "Create the product feed" is carried onto the ordering group below,
//   because that is precisely what the two orchestrated steps do.
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L63]: neither the SKU
//   service that body reached for nor the framework selection object it produced is
//   ported - building that selection is what the row source replaced.
//
//   CFML parity [integrationServices/google/controllers/main.cfc:L49-L52]: nothing to
//   port, verified by reading it - 52 lines whose body is literally empty.
//
//   CFML parity [integrationServices/google/views/main/default.cfm:L50]: its 51 lines
//   carry one paragraph telling an operator to point their Google Feed at
//   `?slatAction=google:feed.product`, deployment prose rather than behaviour.
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L54-L56]: the legacy
//   action was PUBLIC AND UNAUTHENTICATED, `this.publicMethods="product"` with the
//   admin-method and secure-method lists empty. A FACT ABOUT THE SOURCE; no
//   authentication is invented to compensate.
//
// FIXTURE PROVENANCE: [meta/tests/unit/Helper.cfc] is followed as a PATTERN and its MECHANISM
// rejected. Kept: one named factory returning one obviously-fake subject, with per-case overrides
// replacing individual fields. Rejected: that helper builds a persistent entity through the
// object-relational mapper, saves it through an ambient service locator and flushes the mapper's
// session, which is why every legacy "unit" test boots the real application, the mapper and the
// container. No sibling fixture applies: none of the five produces a feed-row projection.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  GoogleFeedService,
  UntrustedFeedHostError,
  toTrustedFeedHost,
} from '../../../../src/integrations/google/googleFeedService.js';
import type {
  GoogleProductFeedRenderer,
  GoogleProductFeedRowSource,
  TrustedFeedHost,
} from '../../../../src/integrations/google/googleFeedService.js';
import { renderGoogleProductFeed } from '../../../../src/integrations/google/rssFeedRenderer.js';
import type { GoogleProductFeedRow } from '../../../../src/integrations/google/googleFeedRepository.js';
import type { ProductFeedPort } from '../../../../src/domain/ports/productFeedPort.js';

// ---------------------------------------------------------------------------
// Fixed inputs
//
// Every value a case needs is a named constant. The module scope holds only these and the pure
// factories below them, so no case can observe another case's effects.
// ---------------------------------------------------------------------------

/** The one host this suite's allow-list admits, in the normalised form. */
const FEED_HOST_TEXT = 'feed.example.invalid';

/**
 * The allow-list every host in this file is checked against.
 *
 * One entry, because one is enough to exercise both outcomes: a candidate that
 * normalises onto it is admitted, and anything else is refused.
 */
const ALLOWED_FEED_HOSTS: readonly string[] = [FEED_HOST_TEXT];

/**
 * The host handed to the subject, and a non-routable placeholder by design.
 *
 * `.invalid` is reserved precisely so that it can never resolve, which is the
 * point: the ported adapter performs no live Google call and needs no
 * credentials, so a host reaches this suite as a validated input and nothing is
 * ever dialled. No real hostname, address or endpoint appears in this file.
 *
 * ★ THIS WAS A PLAIN STRING LITERAL. The constructor takes a `TrustedFeedHost`
 * now, so the value is produced by the branded factory - which is the whole point
 * of the brand: a raw string cannot reach the renderer's scheme composition without
 * having passed the allow-list first.
 */
const FEED_HOST: TrustedFeedHost = toTrustedFeedHost(FEED_HOST_TEXT, ALLOWED_FEED_HOSTS);

/**
 * The same placeholder wearing MIXED CASE, and nothing else.
 *
 * ★★ THIS DOCBLOCK ONCE READ "USED BY ONE CASE TO PROVE THE HOST IS FORWARDED
 * BYTE-IDENTICALLY", AND WENT ON: "THE SHIPPED MODULE STATES THAT THE HOST IS NOT
 * PARSED, TRIMMED, LOWER-CASED, VALIDATED, PREFIXED WITH A SCHEME OR DEFAULTED,
 * BECAUSE THE LEGACY INTERPOLATED WHATEVER THE ENGINE REPORTED AND CHECKED
 * NOTHING. A GUARD WOULD BE BEHAVIOUR THE LEGACY NEVER HAD, SO ITS ABSENCE IS
 * ASSERTED RATHER THAN ASSUMED."
 *
 * The observation about the legacy was correct - `CGI.HTTP_HOST` was interpolated
 * unchecked at five sites [integrationServices/google/views/feed/product.cfm:L14,
 * L15, L22, L23, L24]. The conclusion applied the reproduce-rather-than-repair rule
 * to a SECURITY boundary, and that is where the rule stops: behind a fixed CFML
 * virtual host the engine reported a value the deployment controlled, whereas an
 * API Gateway `Host` header is chosen by whoever sends the request, so reproducing
 * "checked nothing" would newly let a caller decide which origin every link in a
 * Google Merchant Center document points at.
 *
 * ★★ THE SHIPPED MODULE NOW CARRIES TWO CONTROLS, AND THIS CONSTANT PROBES BOTH.
 * Mixed case is SHAPE-VALID - a host's letters may be either case - so the value is
 * accepted wherever the grammar is what is being checked, and it is NOT canonical, so
 * it is visibly changed wherever normalisation is what is being checked. That makes it
 * the right probe on both sides of the boundary:
 *   through `toTrustedFeedHost` (section 10) it is trimmed, lower-cased and matched
 *   against the allow-list, so what the service receives is the canonical form and NOT
 *   these bytes - which is the property section 3 asserts;
 *   reaching the constructor's own runtime check directly (section 11, through that
 *   section's single documented cast) it is ACCEPTED AND FORWARDED UNCHANGED, because
 *   that check accepts or refuses and never normalises - which is the property
 *   section 11 asserts, and it is the original reason this constant was named.
 *
 * Trimming deserves one sentence of its own, because the two positions differ and both
 * are deliberate. At the factory, trimming cannot admit a host nobody configured: the
 * normalised form still has to appear on the allow-list, so stray whitespace in an
 * already-trusted value is tolerated rather than obeyed. At the constructor, the brand
 * is erased and provenance is unknown, so altering bytes would be silently correcting a
 * value nothing vouched for - it refuses instead. {@link PADDED_FEED_HOST} pins that
 * half, and this constant pins the casing half.
 */
const MIXED_CASE_FEED_HOST = 'Feed.EXAMPLE.invalid';

/**
 * The placeholder wearing surrounding whitespace, whose disposition depends on WHERE it
 * arrives - and that is the point of keeping it named.
 *
 * ★ THIS DOCBLOCK ONCE READ "WHICH THE CONSTRUCTOR REFUSES", AND WENT ON: "A PADDED
 * HOST IS NOT A HOST, SO IT IS NOW REFUSED RATHER THAN FORWARDED OR TRIMMED." Half of
 * that is still exactly right, and the half that is not was true of a module that had
 * only one control. Both dispositions are now asserted, and neither is an accident:
 *   `toTrustedFeedHost` TRIMS it, lower-cases it, and then requires the result to be on
 *   the deployment's allow-list. Tolerating whitespace there cannot admit an untrusted
 *   host, because the allow-list is the authority and the trimmed form still has to
 *   match it. Section 3 uses it this way and asserts that the canonical form, not these
 *   bytes, is what the service forwards.
 *   `assertConfiguredFeedHost` REFUSES it, because by the time a value reaches the
 *   constructor the brand is erased and provenance is unknown, so trimming would mean
 *   silently correcting bytes nothing vouched for. Section 11 asserts that refusal,
 *   through the one cast that can reach the check without the factory.
 *
 * It stays a named constant because it is the value whose handling CHANGED from the
 * legacy, which interpolated whatever the engine reported and checked nothing.
 */
const PADDED_FEED_HOST = '  Feed.EXAMPLE.invalid  ';

/**
 * The instant handed to the subject, stated in explicit UTC.
 *
 * The subject holds an instant rather than reading a clock, which is what makes it deterministic;
 * nothing in this file consults the system clock.
 */
const FEED_INSTANT = new Date('2024-06-01T12:34:56.789Z');

/** The wire form of {@link FEED_INSTANT}, for the no-mutation case. */
const FEED_INSTANT_ISO = '2024-06-01T12:34:56.789Z';

/**
 * What the double renderer returns, and what the subject must return unchanged.
 *
 * Deliberately hostile to an orchestrator that does one thing too many: it opens and closes with
 * whitespace, so a trim shows up; it carries `&`, `<`, `>` and `"` unescaped, so any re-encoding
 * shows up; and it is not well-formed markup, so any parse, validation or re-serialisation shows
 * up.
 */
const RENDERED_FEED_SENTINEL = '  <<fake rendered feed>> & <not escaped> "verbatim"  ';

/** A second, distinguishable document, for the cases that prove instances are independent. */
const ALTERNATE_FEED_SENTINEL = '<<second fake rendered feed, from a second instance>>';

/** The ordered-log entry recorded when the row source is entered. */
const ROW_SOURCE_STEP = 'row source read';

/** The ordered-log entry recorded when the renderer is entered. */
const RENDERER_STEP = 'renderer invoked';

/**
 * The one legal step sequence for a successful generation.
 *
 * "Create the product feed" [integrationServices/google/controllers/feed.cfc:L62]: the legacy
 * selected once and rendered once, in that order, for one request. Asserted as a whole array rather
 * than as two "was called" checks, which pass just as happily when the order is reversed - meaning
 * rows rendered before they were read.
 */
const READ_THEN_RENDER: readonly string[] = [ROW_SOURCE_STEP, RENDERER_STEP];

/** The message carried by the row-source failure the propagation cases inject. */
const ROW_SOURCE_FAILURE_MESSAGE = 'fake row source read failure';

/** The message carried by the renderer failure the propagation cases inject. */
const RENDERER_FAILURE_MESSAGE = 'fake renderer failure';

// ---------------------------------------------------------------------------
// Local types and the row factory
// ---------------------------------------------------------------------------

/**
 * The projection as it crosses the subject: opaque, and never inspected by it.
 *
 * A local alias, not a re-declaration - the shipped projection remains the single source of truth.
 */
type FeedRows = readonly GoogleProductFeedRow[];

/**
 * One row, with EVERY key present.
 *
 * Completeness is not a stylistic choice: the shipped projection declares all
 * twenty-three fields REQUIRED, several with a type that admits absence, so a
 * factory that omitted a key would not compile - see finding 5 in the header.
 *
 * ★ THE COUNT WAS TWENTY-TWO AND `brandID` IS THE TWENTY-THIRD. The renderer gates
 * `<g:brand>` on brand PRESENCE
 * [integrationServices/google/views/feed/product.cfm:L32] and the nullable name is
 * only the body, so presence needed a carrier of its own.
 * The three monetary fields are absent BY VALUE, which is how this suite builds a
 * complete row without naming the money value object: the subject performs no
 * monetary arithmetic, never reads a price, and would behave identically if every
 * price were present.
 *
 * The defaults are obviously fake, after the pattern in [meta/tests/unit/Helper.cfc],
 * and overrides replace individual fields per case.
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
    // The key and the name are two separate projection fields, because the legacy gates
    // element fourteen on the ASSOCIATION and interpolates the name into its body
    // [integrationServices/google/views/feed/product.cfm:L32]. `brandID` here is the
    // key as the LEFT join resolved it, so it is present exactly when the association
    // resolved, and it is the gate. This suite never exercises the brand element — it
    // asserts orchestration — so the default simply models the ordinary matched row.
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

/** One recorded renderer invocation, kept exactly as the subject supplied it. */
interface RecordedRendererCall {
  readonly rows: FeedRows;
  readonly feedHost: string;
  readonly now: Date;
}

/**
 * One case's subject plus the three records its doubles keep.
 *
 * The records are exposed through read-only array types over the very arrays the doubles append to,
 * so a case can watch them grow but cannot forge an entry.
 */
interface FeedServiceHarness {
  readonly service: GoogleFeedService;

  /** Every collaborator entry, in the order the subject reached it. */
  readonly callLog: readonly string[];

  /** One entry per row-source call, holding the arguments that call received. */
  readonly rowSourceCallArguments: readonly (readonly unknown[])[];

  /** One entry per renderer call, holding what that call received. */
  readonly rendererCalls: readonly RecordedRendererCall[];
}

/**
 * How a case configures its doubles.
 *
 * `read` is required because every case decides what the read does - resolve, reject or stay
 * pending. The other three are optional and, under `exactOptionalPropertyTypes`, an unneeded one is
 * OMITTED rather than set `undefined`.
 */
interface FeedServiceHarnessOptions {
  /** Invoked by the double row source; its result is what the subject awaits. */
  readonly read: () => Promise<FeedRows>;

  /** Invoked by the double renderer to produce the document. Defaults to the sentinel. */
  readonly render?: (call: RecordedRendererCall) => string;

  /** The host given to the constructor. Defaults to {@link FEED_HOST}. */
  readonly feedHost?: TrustedFeedHost;

  /** The instant given to the constructor. Defaults to {@link FEED_INSTANT}. */
  readonly now?: Date;
}

/**
 * Builds one subject wired to two fresh doubles, and returns both plus their records.
 *
 * A FRESH subject and a FRESH pair of doubles per call, with the records created here and captured
 * by these closures alone. Nothing is reset between cases because nothing is shared, which is
 * stronger than resetting: there is no state to reset, no spy is installed, and there is nothing to
 * restore.
 *
 * JUDGMENT CALL: both collaborators arrive as explicit, typed CONSTRUCTOR arguments, and that is
 * the whole replacement for the legacy dependency mechanism. The legacy controller declared its
 * collaborators as component properties [integrationServices/google/controllers/feed.cfc:L51-L52]
 * which a convention-scanning container resolved at runtime by name; the target wires them
 * explicitly, so the graph is checked by the compiler rather than discovered by a scan, and
 * retiring that scan also retires the thirty-second first-scan lock the container took. This suite
 * is the proof: no container, service locator, registry, decorator or reflection facility appears
 * anywhere in it.
 *
 * JUDGMENT CALL: the legacy's dead collaborator is NOT carried forward.
 *   [integrationServices/google/controllers/feed.cfc:L51] declares

 *   `property name="productService" type="any";`

 * and the method body NEVER READS IT; the only collaborator that body reaches for is the SKU

 * service at [.../feed.cfc:L63]. Interface parity binds the METHOD surface, not a collaborator

 * nothing calls, and carrying it would have forced an unused constructor argument on the

 * subject, so omitting it preserves parity rather than diverging from it.

 */
function makeFeedServiceHarness(options: FeedServiceHarnessOptions): FeedServiceHarness {
  const callLog: string[] = [];
  const rowSourceCallArguments: (readonly unknown[])[] = [];
  const rendererCalls: RecordedRendererCall[] = [];
  const render = options.render ?? ((): string => RENDERED_FEED_SENTINEL);

  // The double row source, typed to the shipped one-method narrowing, which an object literal
  // satisfies. The rest parameter captures whatever arrives, which is how a case proves the subject
  // invents no argument for a query that declares none.
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

  const service = new GoogleFeedService(
    repository,
    options.feedHost ?? FEED_HOST,
    options.now ?? FEED_INSTANT,
    renderFeed,
  );

  return { service, callLog, rowSourceCallArguments, rendererCalls };
}

/**
 * The one renderer call a case expects, narrowed rather than asserted.
 *
 * An indexed read answers `T | undefined` under `noUncheckedIndexedAccess`, and no postfix non-null
 * assertion appears in this file. Throwing a diagnostic on an unreadable shape beats coercing
 * `undefined` and failing three assertions later.
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
 * Deliberately NOT `async`: it forwards the subject's promise instead of awaiting and re-wrapping
 * it, which keeps the returned promise the subject's own.
 */
function generateThroughPort(port: ProductFeedPort): Promise<string> {
  return port.generateProductFeed();
}

// ---------------------------------------------------------------------------
// 1. The declared contract
//
// Interface parity is the acceptance contract, and here the parity proof is an assignment the
// compiler either accepts or rejects.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the declared contract', () => {
  it('is assignable to the feed-generation port with no cast and no assertion', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    // THIS LINE IS THE PARITY PROOF. A plain annotated binding: no `as`, no `satisfies` standing in
    // for a real mismatch, no structural adapter between. It compiles only because the class's one
    // method matches the port's one declared capability exactly - same name, same arity, same
    // return type.
    const port: ProductFeedPort = harness.service;

    await expect(generateThroughPort(port)).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('satisfies a port-typed parameter, so a consumer needs no knowledge of the class', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    // Passing the instance where only the port is declared is the same proof from the caller's
    // side, and is how the composition root hands the subject on.
    await expect(generateThroughPort(harness.service)).resolves.toBe(RENDERED_FEED_SENTINEL);
  });

  it('implements a port that declares exactly one capability', () => {
    // A compile-time exhaustiveness check: if the port ever declared a second member, `keyof` would
    // widen and the second binding would stop compiling. A runtime key count could not see this,
    // because an interface emits no runtime value.
    type PortCapabilityNames = keyof ProductFeedPort;
    const soleCapabilityName: PortCapabilityNames = 'generateProductFeed';
    const exactlyOneCapability: 'generateProductFeed' = soleCapabilityName;

    expect(exactlyOneCapability).toBe('generateProductFeed');
  });

  it('declares that capability with no parameters at all', () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    // Bound so the reference carries its receiver rather than dangling. A bound function reports
    // the arity of what it wraps, less any pre-applied argument, so zero is the shipped parameter
    // count, matching the port and the legacy action.
    const boundGenerate: () => Promise<string> = harness.service.generateProductFeed.bind(
      harness.service,
    );

    expect(boundGenerate.length).toBe(0);
  });

  it('returns a promise of the document, keeping the read on the async boundary', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    const pending = harness.service.generateProductFeed();

    // Asynchronous because it READS: a method is asynchronous in this migration if and only if its
    // legacy body reached the data store. This one did.
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(typeof (await pending)).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 2. The step sequence
//
// "Create the product feed" [integrationServices/google/controllers/feed.cfc:L62]. Read, then
// render, with the whole log asserted as one array every time - a pair of "was it called" checks
// cannot tell the correct order from the reverse of it.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the step sequence', () => {
  it('reads the rows and then renders them, in that order', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
    });

    await harness.service.generateProductFeed();

    expect(harness.callLog).toEqual([ROW_SOURCE_STEP, RENDERER_STEP]);
  });

  it('keeps that order when the feed has no qualifying rows', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    await harness.service.generateProductFeed();

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('reaches each collaborator exactly once per generation', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow(), makeFeedRow({ skuID: 'fake-sku-id-2' })]),
    });

    await harness.service.generateProductFeed();

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

    const pending = harness.service.generateProductFeed();

    // The row source was entered synchronously, an async body running to its first await, and the
    // renderer has NOT been reached: a subject that rendered without awaiting would already have
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

// ---------------------------------------------------------------------------
// 3. What each collaborator receives
// ---------------------------------------------------------------------------

describe('GoogleFeedService - what each collaborator receives', () => {
  it('invokes the row source with no arguments', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    await harness.service.generateProductFeed();

    // One call, and its argument list is empty: the shipped query declares no parameter, and the
    // subject invents none to pass it.
    expect(harness.rowSourceCallArguments).toEqual([[]]);
  });

  it('hands the renderer the rows, the host and the instant, in that order', async () => {
    const rows: FeedRows = [makeFeedRow(), makeFeedRow({ skuID: 'fake-sku-id-2' })];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed();

    const call = soleRendererCall(harness);
    expect(call.rows).toBe(rows);
    expect(call.feedHost).toBe(FEED_HOST);
    expect(call.now).toBe(FEED_INSTANT);
  });

  it('forwards the constructor host byte-identically, doing no normalising of its own', async () => {
    const normalised = toTrustedFeedHost(PADDED_FEED_HOST, ALLOWED_FEED_HOSTS);
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: normalised,
    });

    await harness.service.generateProductFeed();

    // ★ THIS CASE ONCE ASSERTED THAT SURROUNDING WHITESPACE AND MIXED CASE BOTH
    // SURVIVED THE CALL, UNDER THE TITLE "WITHOUT TRIMMING OR NORMALISING". The
    // normalising moved rather than appeared: the FACTORY trims and lower-cases at the
    // boundary, and the SERVICE still does nothing at all to what it holds. Both
    // halves are asserted, because "the service forwards its field unchanged" is only
    // meaningful alongside "and the field was normalised before it got there".
    //
    // The companion property - that the CONSTRUCTOR'S OWN check accepts mixed case and
    // forwards it unchanged, normalising nothing itself - is asserted in section 11,
    // where the cast that reaches that check without the factory is declared. It cannot
    // be asserted here, because by this route the factory has already canonicalised the
    // value, which is exactly what the third assertion below proves.
    expect(normalised).toBe(FEED_HOST_TEXT);
    expect(soleRendererCall(harness).feedHost).toBe(normalised);
    expect(soleRendererCall(harness).feedHost).not.toBe(PADDED_FEED_HOST);
  });

  it('forwards the constructor instant without cloning it or mutating it', async () => {
    // This case owns its instant, so a subject that mutated what it was given could not reach
    // another case.
    const ownInstant = new Date(FEED_INSTANT_ISO);
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      now: ownInstant,
    });

    await harness.service.generateProductFeed();

    expect(soleRendererCall(harness).now).toBe(ownInstant);
    expect(ownInstant.toISOString()).toBe(FEED_INSTANT_ISO);
  });

  it('holds an instant rather than reading a clock, so two generations agree', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    await harness.service.generateProductFeed();
    await harness.service.generateProductFeed();

    expect(harness.rendererCalls).toHaveLength(2);
    const instants = harness.rendererCalls.map((call) => call.now);
    expect(instants).toEqual([FEED_INSTANT, FEED_INSTANT]);
  });
});

// ---------------------------------------------------------------------------
// 4. The document comes back untouched
//
// The reshaping's whole substance is that the caller receives the document, so what arrives must be
// the renderer's string and nothing else.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the document comes back untouched', () => {
  it('resolves to the renderer string verbatim, whitespace and all', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed();

    // Exact equality against a sentinel that opens and closes with whitespace: no trim, no wrapper,
    // no envelope, no re-encoding, no compression and no pretty-printing.
    expect(document).toBe(RENDERED_FEED_SENTINEL);
    expect(document.startsWith('  ')).toBe(true);
    expect(document.endsWith('  ')).toBe(true);
  });

  it('does not escape or re-encode the characters the renderer already emitted', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed();

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

    await expect(harness.service.generateProductFeed()).resolves.toBe(ALTERNATE_FEED_SENTINEL);
  });

  it('contributes no endpoint, host or namespace of its own to the document', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed();

    // The double renderer emits no Google reference at all, so any occurrence here could only have
    // been added by the subject. There is none: the ported adapter makes no live call, holds no
    // endpoint and needs no credentials.
    expect(document).not.toMatch(/google/i);
    expect(document).toBe(RENDERED_FEED_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// 5. A feed with no qualifying rows
//
// A zero-row feed is an ORDINARY OUTCOME, not an error and not an empty string: the legacy loop
// over an empty record set still produced a complete document.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - a feed with no qualifying rows', () => {
  it('still invokes the renderer when the read yields nothing', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    await harness.service.generateProductFeed();

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
    expect(harness.rendererCalls).toHaveLength(1);
  });

  it('hands the renderer the empty array itself, not a substitute', async () => {
    const emptyRows: FeedRows = [];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(emptyRows) });

    await harness.service.generateProductFeed();

    const call = soleRendererCall(harness);
    expect(call.rows).toBe(emptyRows);
    expect(call.rows).toEqual([]);
  });

  it('returns the rendered document rather than short-circuiting to an empty string', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    const document = await harness.service.generateProductFeed();

    expect(document).toBe(RENDERED_FEED_SENTINEL);
    expect(document).not.toBe('');
  });

  it('forwards the host and the instant on the empty path exactly as on the populated one', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    await harness.service.generateProductFeed();

    const call = soleRendererCall(harness);
    expect(call.feedHost).toBe(FEED_HOST);
    expect(call.now).toBe(FEED_INSTANT);
  });
});

// ---------------------------------------------------------------------------
// 6. Failure propagates in both directions
//
// Nothing is caught and nothing is defaulted. Swallowing a read failure would return a document
// silently omitting products a merchant is advertising, which is worse than returning none.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - failure propagates in both directions', () => {
  it('propagates a read failure to the caller', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    await expect(harness.service.generateProductFeed()).rejects.toThrow(ROW_SOURCE_FAILURE_MESSAGE);
  });

  it('propagates the very same failure object, unwrapped and un-rethrown', async () => {
    const failure = new Error(ROW_SOURCE_FAILURE_MESSAGE);
    const harness = makeFeedServiceHarness({ read: () => Promise.reject(failure) });

    // Identity, not merely message equality: the subject adds no failure mode of its own, so the
    // layer owning the request maps the original.
    await expect(harness.service.generateProductFeed()).rejects.toBe(failure);
  });

  it('never reaches the renderer when the read fails', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    await expect(harness.service.generateProductFeed()).rejects.toThrow(ROW_SOURCE_FAILURE_MESSAGE);

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

    await expect(harness.service.generateProductFeed()).rejects.toThrow(RENDERER_FAILURE_MESSAGE);
  });

  it('reaches the renderer before that failure, so the read had already completed', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      render: () => {
        throw new Error(RENDERER_FAILURE_MESSAGE);
      },
    });

    await expect(harness.service.generateProductFeed()).rejects.toThrow(RENDERER_FAILURE_MESSAGE);

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('defaults nothing on failure, returning no document at all', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    // A rejection, never a resolved empty string and never a placeholder document.
    await expect(harness.service.generateProductFeed()).rejects.toThrow(Error);
    await expect(harness.service.generateProductFeed()).rejects.not.toBe('');
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

    await expect(harness.service.generateProductFeed()).rejects.toThrow(ROW_SOURCE_FAILURE_MESSAGE);
    await expect(harness.service.generateProductFeed()).resolves.toBe(RENDERED_FEED_SENTINEL);

    expect(harness.callLog).toEqual([ROW_SOURCE_STEP, ROW_SOURCE_STEP, RENDERER_STEP]);
    expect(readAttempts).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Constructor injection, and no hidden state anywhere
//
// The collaborators arrive through the constructor and nowhere else: no module-level instance to
// share, no lazy collaborator to memoise, no cached document to serve.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - constructor injection and no hidden state', () => {
  it('keeps two instances independent, so neither holds shared module state', async () => {
    const firstRows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-first' })];
    const secondRows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-second' })];
    const first = makeFeedServiceHarness({ read: () => Promise.resolve(firstRows) });
    const second = makeFeedServiceHarness({
      read: () => Promise.resolve(secondRows),
      render: () => ALTERNATE_FEED_SENTINEL,
    });

    await expect(first.service.generateProductFeed()).resolves.toBe(RENDERED_FEED_SENTINEL);
    await expect(second.service.generateProductFeed()).resolves.toBe(ALTERNATE_FEED_SENTINEL);

    // Each instance reached only its own collaborators. A module-level row source or renderer would
    // have crossed here.
    expect(soleRendererCall(first).rows).toBe(firstRows);
    expect(soleRendererCall(second).rows).toBe(secondRows);
    expect(first.callLog).toEqual(READ_THEN_RENDER);
    expect(second.callLog).toEqual(READ_THEN_RENDER);
  });

  it('reads and renders again on every generation, memoising nothing', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    await harness.service.generateProductFeed();
    await harness.service.generateProductFeed();
    await harness.service.generateProductFeed();

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

    await harness.service.generateProductFeed();
    await harness.service.generateProductFeed();

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

    await expect(failing.service.generateProductFeed()).rejects.toThrow(ROW_SOURCE_FAILURE_MESSAGE);
    await expect(healthy.service.generateProductFeed()).resolves.toBe(RENDERED_FEED_SENTINEL);

    expect(failing.callLog).toEqual([ROW_SOURCE_STEP]);
    expect(healthy.callLog).toEqual(READ_THEN_RENDER);
  });

  it('constructs nothing for itself, reaching only the collaborators it was given', async () => {
    const rows: FeedRows = [makeFeedRow({ skuID: 'fake-sku-id-injected' })];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    const document = await harness.service.generateProductFeed();

    // Both observable effects trace back to an injected double: the rows the renderer saw came from
    // the double row source, and the document is the one the double renderer returned. Had the
    // subject built either, neither identity would hold.
    expect(soleRendererCall(harness).rows).toBe(rows);
    expect(document).toBe(RENDERED_FEED_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// 8. The surface admits no invented input
//
// JUDGMENT CALL: NO CRITERIA TYPE EXISTS, AND NONE IS INVENTED HERE. Settled by reading
// [integrationServices/google/controllers/feed.cfc:L58-L73]. Every reference to the request context
// there is a WRITE - the selection assigned onto it at L63, then joins and the four conditions at
// L68-L72 added to that object - and NOTHING is read back out of it; the selection factory was
// invoked with no arguments, so not even the legacy dynamic filter surface reached it. The legacy
// action took no caller-supplied narrowing whatsoever and `ProductFeedPort` matches that with no
// parameters. Declaring a named-but-empty criteria type would invent a requirement the source does
// not supply, so this suite declares none and asserts that the shipped surface rejects one. The
// four conditions are consequently unreachable from a caller, which makes them INVARIANTS of the
// feed rather than defaults of a query, enforced in the row source and pinned by that module's
// suite.
//
// The two cases below are COMPILE-TIME assertions. Each `@ts-expect-error` exists solely to assert
// a deliberate type failure: were the surface ever widened to accept what is passed, the directive
// would become unused and the typecheck gate would fail.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the surface admits no invented input', () => {
  it('rejects an options bag, a filter toggle, paging and every other narrowing', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    // Stands in for the whole forbidden set at once: the include-inactive, include-unpublished,
    // include-out-of-stock and minimum-quantity switches, a filter array, a predicate, paging, a
    // sort, a locale, a currency selector, a format discriminator, a destination, a since-marker, a
    // chunk size, a callback, a streaming shape and a cancellation handle. A zero-parameter method
    // rejects all of them identically, and a gateway event and invocation context with them.
    // @ts-expect-error - the shipped method declares no parameter: "Expected 0 arguments, but got 1".
    await expect(harness.service.generateProductFeed({ includeInactive: true })).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );

    expect(harness.callLog).toEqual(READ_THEN_RENDER);
    expect(harness.rowSourceCallArguments).toEqual([[]]);
  });

  it('rejects an asynchronous renderer, so the renderer is synchronous by contract', () => {
    // Why this matters to the await discipline: the subject awaits the read and does NOT await the
    // renderer, which is only correct because the renderer contract returns a string rather than a
    // promise - asserted here.
    //
    // The declaration is kept on ONE line deliberately: the directive suppresses only the line
    // after it, so splitting the initialiser would report itself unused.
    const feedDocument = RENDERED_FEED_SENTINEL;
    // @ts-expect-error - a promise-returning renderer is not assignable: the contract returns string.
    const asyncRenderer: GoogleProductFeedRenderer = () => Promise.resolve(feedDocument);

    expect(asyncRenderer([], FEED_HOST, FEED_INSTANT)).toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// 9. Nothing else happens
//
// Selection belongs to the row source and presentation to the renderer, so anything added here
// would duplicate behaviour in two places - and a second filter could silently contradict the
// invariant the row source enforces.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - nothing else happens', () => {
  it('applies no filtering, forwarding even rows the selection invariants would exclude', async () => {
    // Every row here fails one of the four selection conditions the row source enforces at
    // [integrationServices/google/controllers/feed.cfc:L68-L72], so none could ever arrive from the
    // real one. A filter re-applied here would be a second place for the rule to drift.
    const rows: FeedRows = [
      makeFeedRow({ skuID: 'fake-sku-id-inactive-sku', skuActiveFlag: false }),
      makeFeedRow({ skuID: 'fake-sku-id-inactive-product', productActiveFlag: false }),
      makeFeedRow({ skuID: 'fake-sku-id-unpublished', productPublishedFlag: false }),
      makeFeedRow({ skuID: 'fake-sku-id-no-quantity', productCalculatedQATS: 0 }),
    ];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed();

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

    await harness.service.generateProductFeed();

    expect(soleRendererCall(harness).rows.map((row) => row.skuID)).toEqual(suppliedOrder);

    // And the caller's own array was not reordered underneath it: no in-place sort.
    expect(rows.map((row) => row.skuID)).toEqual(suppliedOrder);
  });

  it('applies no row-shape mapping, forwarding the array and its elements by identity', async () => {
    const firstRow = makeFeedRow({ skuID: 'fake-sku-id-1' });
    const secondRow = makeFeedRow({ skuID: 'fake-sku-id-2' });
    const rows: FeedRows = [firstRow, secondRow];
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve(rows) });

    await harness.service.generateProductFeed();

    const call = soleRendererCall(harness);

    // The same array object, which makes element identity automatic: no copy, slice, spread or
    // projection in between. Asserted on the elements too, so the guarantee is explicit rather than
    // inferred.
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

    await harness.service.generateProductFeed();

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

    await harness.service.generateProductFeed();

    expect(soleRendererCall(harness).rows.map((row) => row.skuID)).toEqual([
      'fake-sku-id-1',
      'fake-sku-id-2',
      'fake-sku-id-3',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 10. The trusted feed host
//
// NET-NEW COVERAGE, declared as such per AAP 0.6.6. There is no legacy
// antecedent - the legacy performed no validation of any kind on the value it
// interpolated - so nothing below extends a legacy test, and the header's
// statement that this whole file is net-new applies here too.
//
// WHY A BOUNDARY EXISTS WHERE THE LEGACY HAD NONE. The legacy read
// `CGI.HTTP_HOST` and wrote it, unchecked, into five absolute addresses
// [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24].
// Behind a fixed CFML virtual host that value was chosen by the deployment. An
// API Gateway `Host` header is chosen by whoever sends the request, so carrying
// the legacy's absence of a check across would newly let a caller decide which
// origin every channel, product and image URL in a Google Merchant Center
// document points at. Escaping the value - which the renderer does, with all five
// XML entities - prevents markup injection and says nothing whatsoever about
// whether the origin is trusted. This is the one place in this migration where
// the reproduce-rather-than-repair rule is deliberately not applied, and the
// reason is that it is a security boundary rather than a behaviour.
//
// WHAT IS NOT CHANGED BY IT. `generateProductFeed()` is still zero-argument, the
// renderer is still pure and still takes a plain string, no default host exists,
// and nothing here is dialled.
// ---------------------------------------------------------------------------

describe('toTrustedFeedHost - the allow-listed authority the feed URLs are built from', () => {
  it('admits an allow-listed authority and returns it unchanged', () => {
    expect(toTrustedFeedHost(FEED_HOST_TEXT, ALLOWED_FEED_HOSTS)).toBe(FEED_HOST_TEXT);
  });

  it('normalises surrounding whitespace and casing before comparing', () => {
    expect(toTrustedFeedHost('  FEED.Example.INVALID ', ALLOWED_FEED_HOSTS)).toBe(FEED_HOST_TEXT);
    expect(toTrustedFeedHost('feed.EXAMPLE.invalid', ALLOWED_FEED_HOSTS)).toBe(FEED_HOST_TEXT);
  });

  it('compares against an allow-list entry that itself carries whitespace or casing', () => {
    // Configuration is read from an environment variable in production, where a stray
    // space or a capital letter is an ordinary transcription accident rather than an
    // attack. Normalising both sides means such an entry still matches, and it is the
    // SHAPE rule below - not the comparison - that refuses anything malformed.
    expect(toTrustedFeedHost(FEED_HOST_TEXT, ['  Feed.Example.Invalid  '])).toBe(FEED_HOST_TEXT);
  });

  it('admits an authority carrying an explicit port, because a host header may', () => {
    expect(toTrustedFeedHost('feed.example.invalid:8443', ['feed.example.invalid:8443'])).toBe(
      'feed.example.invalid:8443',
    );
  });

  it('refuses an empty candidate', () => {
    expect(() => toTrustedFeedHost('', ALLOWED_FEED_HOSTS)).toThrow(UntrustedFeedHostError);
    expect(() => toTrustedFeedHost('', ALLOWED_FEED_HOSTS)).toThrow(
      /it is empty or contains only whitespace/,
    );
  });

  it('refuses a candidate that is only whitespace', () => {
    expect(() => toTrustedFeedHost('   ', ALLOWED_FEED_HOSTS)).toThrow(
      /it is empty or contains only whitespace/,
    );
  });

  it('refuses a candidate carrying a scheme', () => {
    for (const candidate of ['http://feed.example.invalid', 'https://feed.example.invalid']) {
      expect(() => toTrustedFeedHost(candidate, ALLOWED_FEED_HOSTS)).toThrow(
        /a scheme, credentials, path, query, fragment, whitespace or non-ASCII character is present/,
      );
    }
  });

  it('refuses a candidate carrying credentials', () => {
    expect(() => toTrustedFeedHost('attacker@feed.example.invalid', ALLOWED_FEED_HOSTS)).toThrow(
      UntrustedFeedHostError,
    );
  });

  it('refuses a candidate carrying a path', () => {
    expect(() =>
      toTrustedFeedHost('feed.example.invalid/attacker-path', ALLOWED_FEED_HOSTS),
    ).toThrow(UntrustedFeedHostError);
  });

  it('refuses a candidate carrying a query, which the earlier suites used to accept', () => {
    // This exact shape was passed as a host by a renderer case and asserted only to be
    // ESCAPED. A host is an authority and has no query component, and accepting one
    // meant every absolute address in the document carried caller-chosen parameters.
    expect(() =>
      toTrustedFeedHost('feed.example.invalid?tenant=a&locale=b', ALLOWED_FEED_HOSTS),
    ).toThrow(UntrustedFeedHostError);
  });

  it('refuses a candidate carrying a fragment', () => {
    expect(() => toTrustedFeedHost('feed.example.invalid#fragment', ALLOWED_FEED_HOSTS)).toThrow(
      UntrustedFeedHostError,
    );
  });

  it('refuses a candidate carrying interior whitespace or a control character', () => {
    for (const candidate of ['feed.example .invalid', 'feed.example\t.invalid', 'feed\n.invalid']) {
      expect(() => toTrustedFeedHost(candidate, ALLOWED_FEED_HOSTS)).toThrow(
        UntrustedFeedHostError,
      );
    }
  });

  it('refuses a malformed authority, whatever the allow-list says', () => {
    // The shape rule runs BEFORE the allow-list, so an allow-list holding a malformed
    // entry cannot admit a malformed candidate by matching it.
    for (const candidate of [
      '.feed.example.invalid',
      'feed..invalid',
      'feed.invalid.',
      '-feed.invalid',
    ]) {
      expect(() => toTrustedFeedHost(candidate, [candidate])).toThrow(
        /a scheme, credentials, path, query, fragment, whitespace or non-ASCII character is present/,
      );
    }
  });

  it('refuses a well-formed authority that is not on the allow-list', () => {
    expect(() => toTrustedFeedHost('attacker.example.invalid', ALLOWED_FEED_HOSTS)).toThrow(
      /it is not on this deployment/,
    );
  });

  it('refuses everything when the allow-list is empty, defaulting to no host', () => {
    // An unconfigured deployment publishes no feed rather than publishing one pointing
    // at whatever arrived in a header. There is no default host anywhere in this module.
    expect(() => toTrustedFeedHost(FEED_HOST_TEXT, [])).toThrow(/it is not on this deployment/);
  });

  it('names the rejected candidate and the rule that rejected it', () => {
    try {
      toTrustedFeedHost('  https://attacker.example.invalid/x  ', ALLOWED_FEED_HOSTS);
      throw new Error('the candidate was admitted, so there is no rejection to inspect');
    } catch (error: unknown) {
      if (!(error instanceof UntrustedFeedHostError)) {
        throw error;
      }

      // The candidate is reported exactly as supplied, so a reader can see the shape
      // that was rejected rather than a normalised version of it. It is a hostname and
      // not a secret, and no credential, bind value or SQL appears in the message.
      expect(error.candidate).toBe('  https://attacker.example.invalid/x  ');
      expect(error.name).toBe('UntrustedFeedHostError');
      expect(error.reason).toContain('scheme');
      expect(error.message).toContain('"  https://attacker.example.invalid/x  "');
      expect(error.message).toContain('never from an unvalidated');
    }
  });

  it('produces a host the service constructor accepts, which a raw string is not', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: toTrustedFeedHost('FEED.example.invalid', ALLOWED_FEED_HOSTS),
    });

    await harness.service.generateProductFeed();

    // The compile-time half of the guarantee is the brand: the constructor's parameter
    // is `TrustedFeedHost`, so an unvalidated string cannot reach the renderer's five
    // interpolation sites through this class at all. The next case states that in the
    // form the compiler enforces.
    expect(soleRendererCall(harness).feedHost).toBe(FEED_HOST_TEXT);
  });

  it('refuses a raw string at the constructor, enforced by the compiler', () => {
    const repository: GoogleProductFeedRowSource = {
      fetchProductFeedRows: () => Promise.resolve([]),
    };
    const renderFeed: GoogleProductFeedRenderer = () => '';

    const service = new GoogleFeedService(
      repository,
      // @ts-expect-error a raw string is not a TrustedFeedHost: only `toTrustedFeedHost`
      // produces one, so an unvalidated host cannot be wired in even by mistake.
      'attacker.example.invalid',
      FEED_INSTANT,
      renderFeed,
    );

    // The refusal above is the assertion. Naming the value keeps `noUnusedLocals`
    // satisfied and proves the line was type-checked rather than deleted.
    expect(service).toBeInstanceOf(GoogleFeedService);
  });
});

// 11. The feed origin, refused at construction rather than stored
//
// ★★★ SECURITY BOUNDARY — CWE-346 (ORIGIN VALIDATION ERROR), and A DELIBERATE
// DIVERGENCE FROM THE LEGACY, which is why the block carries this much prose.
//
// The legacy template interpolated `CGI.HTTP_HOST` at five sites
// [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24] and
// validated it at none. `CGI.HTTP_HOST` is the REQUEST'S OWN `Host` HEADER: a client
// chooses it, so the legacy feed's every item URL was in principle client-steerable.
// This port already diverges by taking the host as an explicit constructor argument
// rather than reading an ambient request scope - and that divergence buys nothing
// unless the value is checked, because a caller can forward a header just as easily
// as a setting.
//
// WHY THIS IS NOT A PARITY BREAK WORTH PRESERVING. AAP 0.6.7 registers twenty legacy
// defects to reproduce and the absence of origin validation is not among them; no
// preserve-exactly mandate covers the feed template's host handling; and AAP 0.8.1's
// must-preserve list names promotion math, the resolution cascades and option-based
// SKU selection, none of which touches this. What the AAP does mandate [0.1.1] is
// preserving the feed CONTRACT - the elements, their order and their values - and a
// refused construction emits no document at all rather than a differently-shaped
// one, so no consumer can observe a changed contract.
//
// WHY IT IS CHECKED HERE AND NOT ONLY IN THE RENDERER, in two words each: the
// renderer is SUBSTITUTABLE (it is a defaulted constructor parameter, so a caller may
// supply one that checks nothing), and construction is EARLIER (a check deferred to
// render time would let a bad origin drive a full catalog read first). Both are
// asserted below.
//
// ★★ HOW THIS SECTION RELATES TO SECTION 10, WHICH DID NOT EXIST WHEN THE PROSE ABOVE
// WAS WRITTEN. The shipped module now carries TWO controls over the feed origin, not
// one, and they check DIFFERENT THINGS:
//   PROVENANCE - `toTrustedFeedHost(candidate, allowedHosts)` normalises a candidate,
//     matches it against the deployment's allow-list and mints a `TrustedFeedHost`.
//     Section 10 owns it. It is the only way to obtain the brand, so the constructor's
//     parameter type is what stops an unvalidated string being wired in AT COMPILE TIME.
//   SHAPE - `assertConfiguredFeedHost`, called by the constructor. This section owns it.
//     It re-checks the grammar AT RUN TIME.
// The overlap is deliberate belt-and-braces rather than redundancy, and the reason is
// mechanical: a branded type is ERASED AT RUNTIME, so a JavaScript caller, a `JSON.parse`
// result, a structural cast or a `// @ts-expect-error` line reaches the constructor with
// the brand's protection gone. The runtime check is what still refuses in that case, and
// the cases below reach it exactly that way - through {@link asUncheckedFeedHost}, a
// single documented cast that simulates the bypass. Every case in this section is
// therefore a statement about the RUNTIME backstop, and none of them contradicts
// section 10.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - feed origin validation', () => {
  /**
   * Hands the constructor a host that DID NOT COME FROM THE BRANDED FACTORY.
   *
   * ★★ THE ONE CAST IN THIS FILE, AND THE THING IT EXISTS TO PROVE. The constructor's
   * parameter is `TrustedFeedHost`, and section 10 asserts that a raw string cannot be
   * passed there - the compiler refuses it. That is the COMPILE-TIME half of the
   * guarantee. This helper deliberately defeats it, because a brand is a compile-time
   * fiction: `TrustedFeedHost` is `string & { readonly [brand]: true }` where the brand
   * key is a `declare const unique symbol`, so NOTHING is added to the value and nothing
   * survives to runtime. A JavaScript caller, a value crossing a `JSON.parse` boundary,
   * a structural cast in a composition root, or an unbundled `.js` consumer therefore
   * arrives at this constructor with the brand contributing exactly nothing.
   *
   * Every case below is a statement about what happens THEN, which is the only way to
   * assert that `assertConfiguredFeedHost` is load-bearing rather than dead code sitting
   * behind a type that already excluded its inputs. Without the cast these cases would
   * not compile, and the runtime backstop would be untested.
   *
   * It is confined to this helper on purpose: one cast, named, documented, and used by
   * this section alone. No production module casts to obtain this brand except the mint
   * itself, and section 10 pins that.
   */
  function asUncheckedFeedHost(raw: string): TrustedFeedHost {
    return raw as TrustedFeedHost;
  }

  /** Constructs with the supplied host and returns the raised error, or throws if none was. */
  function captureConstructionRefusal(feedHost: string): Error {
    try {
      makeFeedServiceHarness({
        read: () => Promise.resolve([makeFeedRow()]),
        feedHost: asUncheckedFeedHost(feedHost),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        return error;
      }

      throw new Error(`expected an Error, received ${typeof error}`);
    }

    // Reached only when the guard let the value through, which a later render-time
    // failure could otherwise disguise as a pass at this seam.
    throw new Error(`expected a refusal for host ${JSON.stringify(feedHost)}, none was raised`);
  }

  it('accepts a bare host, a bare host with a port, and mixed case, unchanged', async () => {
    // The shapes an operator actually configures, asserted first so the refusals below
    // cannot be mistaken for a guard that rejects everything.
    //
    // ★ THE THIRD ENTRY CARRIES A PROPERTY OF ITS OWN, and it is the one this suite used
    // to assert from section 3. {@link MIXED_CASE_FEED_HOST} is shape-valid - a host's
    // letters may be either case - and the assertion below is `toBe(host)`, so this guard
    // ACCEPTS OR REFUSES and never NORMALISES. Lower-casing belongs to
    // `toTrustedFeedHost` alone, and by the sanctioned route it has already happened
    // before a value can arrive here, which is why section 3 now asserts the factory's
    // canonicalisation instead. Arriving by the UNSANCTIONED route, as this case does,
    // is what keeps the no-normalisation property of the constructor assertable at all.
    for (const host of [
      'shop.example.invalid',
      'shop.example.invalid:8443',
      MIXED_CASE_FEED_HOST,
    ]) {
      const harness = makeFeedServiceHarness({
        read: () => Promise.resolve([makeFeedRow()]),
        feedHost: asUncheckedFeedHost(host),
      });

      await harness.service.generateProductFeed();

      expect(soleRendererCall(harness).feedHost).toBe(host);
    }
  });

  it('refuses an empty host, which the legacy accepted and rendered as a bare scheme', () => {
    const error = captureConstructionRefusal('');

    expect(error.message).toContain('it was empty');
    expect(error.message).toContain('No feed service was constructed');
  });

  it('refuses a scheme, a path, credentials, a query and a fragment', () => {
    // The five constructs that change what a feed URL resolves to. Credentials are
    // the highest-value case: `shop.example.invalid@evil.invalid` resolves to
    // `evil.invalid`, with the part a human reads first demoted to a username.
    expect(captureConstructionRefusal('http://shop.example.invalid').message).toContain(
      'no scheme',
    );
    expect(captureConstructionRefusal('shop.example.invalid/checkout').message).toContain(
      'no path',
    );
    expect(captureConstructionRefusal('shop.example.invalid@evil.invalid').message).toContain(
      'no credentials',
    );
    expect(captureConstructionRefusal('shop.example.invalid?tenant=a').message).toContain(
      'no query',
    );
    expect(captureConstructionRefusal('shop.example.invalid#frag').message).toContain(
      'no fragment',
    );
  });

  it('refuses a padded host that reached it without passing the factory', () => {
    // ★ THIS CASE ONCE READ "REFUSES A PADDED HOST RATHER THAN TRIMMING IT", AND WENT
    // ON: "THE ONE VALUE WHOSE DISPOSITION CHANGED, SO IT IS ASSERTED DIRECTLY.
    // TRIMMING WOULD ACCEPT A MALFORMED CONFIGURATION AND QUIETLY CORRECT IT, LEAVING
    // THE OPERATOR WITH NO SIGNAL THAT IT WAS WRONG."
    //
    // The assertion is unchanged and still passes. The TITLE is revised, because the
    // shipped module now trims at the SANCTIONED entry point and refuses here, and both
    // of those are correct for their own position:
    //   `toTrustedFeedHost` normalises, then requires the normalised form to appear on
    //   the deployment's allow-list. A padded value is therefore admitted only when the
    //   operator has ALREADY declared that exact host trusted, so trimming cannot admit
    //   a host nobody configured - the worst it tolerates is stray whitespace in a value
    //   that was going to be accepted anyway. Section 10 pins that behaviour directly.
    //   `assertConfiguredFeedHost`, reached here, sees a value of UNKNOWN provenance,
    //   because the brand it trusted is erased. Trimming at that point would mean
    //   silently altering bytes that no allow-list ever vouched for, so it refuses
    //   instead. That is the original argument, in the one position where it holds.
    const error = captureConstructionRefusal(PADDED_FEED_HOST);

    expect(error.message).toContain('no whitespace');
  });

  it('refuses control characters, including the CR and LF a header split needs', () => {
    expect(captureConstructionRefusal('shop.example.invalid\r\nX-Injected: 1').message).toContain(
      'no control characters',
    );
    expect(captureConstructionRefusal('shop.example.invalid\u0000evil.invalid').message).toContain(
      'No feed service was constructed',
    );
  });

  it('names the constraint and never echoes the rejected origin', () => {
    for (const host of [
      'http://evil.invalid',
      'shop.example.invalid/checkout',
      'user:secret@evil.invalid',
      `${'a'.repeat(300)}.invalid`,
    ]) {
      const error = captureConstructionRefusal(host);

      // Reproducing the value would write caller-controlled bytes into a log line.
      expect(error.message).not.toContain('evil.invalid');
      expect(error.message).not.toContain('secret');
      expect(error.message).not.toContain('checkout');
      expect(error.message).not.toContain('aaaa');
      expect(error.message).toContain('No feed service was constructed');
    }
  });

  it('states the provenance obligation this guard cannot itself enforce', () => {
    // The guard checks SHAPE and cannot check PROVENANCE - `evil.invalid` is a
    // perfectly well-formed host and is accepted. The obligation to source the value
    // from configuration rather than from a request header is therefore carried by
    // the refusal message and by the constructor's documented contract, and this case
    // pins the limit so nobody mistakes the guard for more than it is.
    //
    // ★ ONE CLAUSE OF THIS NOTE IS NARROWED. It was written when SHAPE was the only
    // control in the module, so "the guard cannot check provenance" read as "provenance
    // is unchecked". It is not: `toTrustedFeedHost` checks it against an explicit
    // allow-list, and `evil.invalid` does not survive that gate - section 10 asserts
    // exactly that refusal. What remains true, and is what this case pins, is that THIS
    // guard - the constructor's own runtime check - cannot check provenance, which is
    // why a value that bypasses the factory can still be shape-valid and untrusted.
    // The cast below is what lets the case demonstrate it.
    expect(captureConstructionRefusal('http://x').message).toContain(
      'come from configuration and never from a request Host header',
    );

    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: asUncheckedFeedHost('evil.invalid'),
    });

    expect(harness.service).toBeInstanceOf(GoogleFeedService);
  });

  it('refuses BEFORE constructing, so no instance holds a bad origin and no read is issued', () => {
    // ★ THE REASON THE CHECK IS HERE AND NOT ONLY IN THE RENDERER, part two of two:
    // `generateProductFeed` reads the row source BEFORE it renders, so a check
    // deferred to render time would let an invalid origin drive an unbounded catalog
    // read whose every row is then discarded. Failing at construction spends nothing,
    // and this case proves the read never happens.
    const reads: string[] = [];

    expect(() => {
      makeFeedServiceHarness({
        read: () => {
          reads.push('read');
          return Promise.resolve([makeFeedRow()]);
        },
        feedHost: asUncheckedFeedHost('http://evil.invalid/x'),
      });
    }).toThrow(/bare host/);

    expect(reads).toHaveLength(0);
  });

  it('does not delegate its precondition to the substitutable renderer', () => {
    // ★ THE REASON THE CHECK IS HERE AND NOT ONLY IN THE RENDERER, part one of two.
    // The renderer arrives as a DEFAULTED CONSTRUCTOR PARAMETER, so a composition
    // root or a suite may supply one that validates nothing - as this file's own
    // double does. A precondition this class depends on therefore cannot be delegated
    // to a collaborator the caller chooses, and this case demonstrates the gap that
    // delegation would leave: the double would have happily rendered the bad origin.
    const permissiveRenderer: GoogleProductFeedRenderer = () => 'rendered-with-anything';

    expect(
      () =>
        new GoogleFeedService(
          { fetchProductFeedRows: (): Promise<FeedRows> => Promise.resolve([]) },
          asUncheckedFeedHost('http://evil.invalid/x'),
          FEED_INSTANT,
          permissiveRenderer,
        ),
    ).toThrow(/bare host/);

    // And the permissive renderer really would have accepted it, which is what makes
    // the constructor's own check load-bearing rather than redundant.
    expect(permissiveRenderer([], 'http://evil.invalid/x', FEED_INSTANT)).toBe(
      'rendered-with-anything',
    );
  });

  it('agrees with the real renderer on every host, so the two grammars cannot drift', () => {
    // ★ THE MECHANISM THAT KEEPS A DELIBERATE DUPLICATE HONEST. The constructor and
    // the renderer enforce the same grammar from two module-private copies, because
    // AAP 0.3.1 fixes this folder at four files and `src/lib/` at its enumerated set,
    // so there is no shared module either could hold it in. Editing one copy alone
    // fails this case.
    //
    // ★ THERE ARE NOW THREE HOST GRAMMARS IN THE FOLDER, AND THIS CASE PINS THE TWO
    // THAT MUST BE IDENTICAL. `FEED_HOST_SHAPE` appears twice - in
    // `googleFeedService.ts` for the constructor and in `rssFeedRenderer.ts` for the
    // renderer - and those two are byte-identical patterns that must stay so, which is
    // what the table below enforces. The third, `FEED_HOST_AUTHORITY`, backs
    // `toTrustedFeedHost` and is DELIBERATELY STRICTER: it runs after the candidate has
    // been lower-cased, so it needs no upper-case range, and it admits neither the
    // underscore nor the bracketed IPv6 literal that the two shape copies allow.
    // Equality is NOT asserted against it, because a stricter sanctioned gate in front
    // of a permissive backstop is the intended ordering - tightening the outer gate must
    // not be able to fail this case, and loosening either inner copy alone must.
    const hosts: readonly string[] = [
      // Accepted.
      'shop.example.invalid',
      'shop.example.invalid:8443',
      'localhost',
      'a',
      '[2001:db8::1]',
      'feed_internal.example.invalid',
      'evil.invalid',
      // Refused.
      '',
      '   ',
      'http://shop.example.invalid',
      '//shop.example.invalid',
      'shop.example.invalid/',
      'shop.example.invalid/checkout',
      'user:secret@evil.invalid',
      'shop.example.invalid?tenant=a',
      'shop.example.invalid#frag',
      ' shop.example.invalid',
      'shop.example.invalid ',
      'shop example.invalid',
      '.shop.example.invalid',
      'shop.example.invalid.',
      '-shop.example.invalid',
      'shop..example.invalid',
      '2001:db8::1',
      'shop.example.invalid\r\nX-Injected: 1',
      'shop.example.invalid\u0000evil.invalid',
      `${'a'.repeat(300)}.invalid`,
    ];

    for (const host of hosts) {
      let constructorAccepted = true;
      try {
        new GoogleFeedService(
          { fetchProductFeedRows: (): Promise<FeedRows> => Promise.resolve([]) },
          asUncheckedFeedHost(host),
          FEED_INSTANT,
        );
      } catch {
        constructorAccepted = false;
      }

      let rendererAccepted = true;
      try {
        renderGoogleProductFeed([], host, FEED_INSTANT);
      } catch {
        rendererAccepted = false;
      }

      expect({ host, constructorAccepted }).toEqual({
        host,
        constructorAccepted: rendererAccepted,
      });
    }
  });
});
