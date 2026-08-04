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

// THREE NODE BUILT-INS APPEAR BELOW, AND SECTION 10 IS THE ONLY REASON. That section reads
// this module's own source text to assert what it publishes, because a namespace import sees
// only VALUES and two of the symbols that must stay out - an exported type alias and a
// `declare const` brand - erase completely at compile time, so no runtime check could see
// either one. The only other suite in this subtree that reads source,
// `tests/traceability/legacyTestMap.ts`, reaches for exactly this trio in exactly this way.
// Nothing else in this file touches the file system, and no case writes to it.

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
import type { ProductFeedPort } from '../../../../src/domain/ports/productFeedPort.js';
import type { FeedUrlScheme } from '../../../../src/lib/config.js';

// ---------------------------------------------------------------------------
// Fixed inputs
//
// Every value a case needs is a named constant. The module scope holds only these and the pure
// factories below them, so no case can observe another case's effects.
// ---------------------------------------------------------------------------

/**
 * The host handed to the subject, and a non-routable placeholder by design.
 *
 * `.invalid` is reserved precisely so that it can never resolve, which is the point: the
 * ported adapter performs no live Google call and needs no credentials, so a host reaches
 * this suite as an ordinary configured input and nothing is ever dialled. No real hostname,
 * address or endpoint appears in this file.
 *
 * ★ THIS WAS BRIEFLY A BRANDED VALUE MINTED THROUGH AN ALLOW-LIST FACTORY, AND IT IS A
 * PLAIN STRING LITERAL AGAIN. Two companions stood with it - a `FEED_HOST_TEXT` holding the
 * canonical spelling and an `ALLOWED_FEED_HOSTS` array to check candidates against - and
 * both are gone, because the subject's constructor takes a plain `string` and no allow-list
 * exists anywhere in the module under test. Section 10 holds that surface and carries the
 * record of why the allow-list was withdrawn rather than moved.
 */
const FEED_HOST = 'feed.example.invalid';

/**
 * The same placeholder wearing MIXED CASE, and nothing else.
 *
 * Used by one case to prove the host is forwarded BYTE-IDENTICALLY. The shipped module does
 * not parse, trim, lower-case, validate, prefix with a scheme or default the value it holds;
 * it hands the field to the renderer exactly as the constructor received it. This constant
 * is visibly non-canonical, so a subject that lower-cased its field could not pass.
 *
 * ★★ THIS DOCBLOCK ONCE DESCRIBED THIS CONSTANT AS A PROBE OF "TWO CONTROLS THE SHIPPED
 * MODULE NOW CARRIES" - an allow-list factory that trimmed and lower-cased, and a
 * constructor check that accepted or refused without normalising. Neither control exists in
 * the module under test: together they were an unplanned host-policy subsystem, and section
 * 10 records why it was withdrawn rather than relocated. The paragraph above is what this
 * constant was originally named for, and it is accurate again.
 *
 * The observation that surrounded the withdrawn version was correct and is worth keeping:
 * `CGI.HTTP_HOST` was interpolated unchecked at five legacy sites
 * [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24], and an API
 * Gateway `Host` header is chosen by whoever sends the request rather than by the
 * deployment. What follows from that is an obligation on the composition root to supply a
 * CONFIGURED host, stated there and on the constructor parameter - not a policy this module
 * is authorised to enforce.
 *
 * Mixed case is SHAPE-VALID - a host's letters may be either case - so this value is also
 * accepted by the grammar the renderer still enforces, which section 10 asserts alongside
 * the values that grammar refuses.
 */
const MIXED_CASE_FEED_HOST = 'Feed.EXAMPLE.invalid';

/**
 * The placeholder wearing surrounding whitespace, which the SERVICE forwards untouched and
 * the RENDERER refuses.
 *
 * Both halves matter, and holding them in one named constant is what makes the seam
 * legible. The service performs no check and no normalisation, so a padded value reaches
 * the renderer with its padding intact - section 3 asserts that. The renderer's grammar
 * refuses whitespace, leading, trailing or internal, and refuses by throwing, because a bad
 * origin poisons every URL in the document rather than one field - section 10 asserts that.
 *
 * ★ THIS DOCBLOCK ONCE SAID THE CONSTRUCTOR REFUSED THIS VALUE, AND THEN, ONE REVISION
 * LATER, THAT AN ALLOW-LIST FACTORY TRIMMED IT WHILE THE CONSTRUCTOR REFUSED IT. Neither
 * describes the shipped module: the constructor takes a plain string and inspects nothing.
 * The refusal did not lapse, it MOVED - from construction to render - and section 10 proves
 * it still arrives.
 *
 * It stays a named constant because it is the value whose handling differs most visibly
 * between the two layers, and because the legacy interpolated whatever the engine reported
 * and checked nothing at all [integrationServices/google/views/feed/product.cfm:L14, L15,
 * L22, L23, L24].
 */
const PADDED_FEED_HOST = '  Feed.EXAMPLE.invalid  ';

/**
 * The instant handed to the subject, stated in explicit UTC.
 *
 * The subject holds an instant rather than reading a clock, which is what makes it deterministic;
 * nothing in this file consults the system clock.
 */
/**
 * The scheme this suite constructs with, and it is the LEGACY one on purpose.
 *
 * Finding S-09 made the scheme a constructor argument taken from deployment
 * configuration rather than a literal in the renderer. This suite keeps supplying `'http'`
 * so that every existing assertion about an `http://` URL still asserts LEGACY PARITY;
 * that the service forwards whatever it was given, rather than a scheme of its own
 * choosing, is asserted directly in the S-09 case below.
 */
const FEED_SCHEME: FeedUrlScheme = 'http';

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
  readonly feedScheme: FeedUrlScheme;
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

  /**
   * The host given to the constructor. Defaults to {@link FEED_HOST}.
   *
   * ★ A PLAIN `string`, WHICH IS THE SHIPPED CONSTRUCTOR'S OWN PARAMETER TYPE. This was
   * briefly a branded `TrustedFeedHost`, which meant a case could not hand the subject a
   * value the withdrawn allow-list had not minted - and therefore could not probe what the
   * subject does with an arbitrary host at all. The type is the contract's again.
   */
  readonly feedHost?: string;

  /** The scheme given to the constructor. Defaults to {@link FEED_SCHEME}. */
  readonly feedScheme?: FeedUrlScheme;

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

  // The double renderer. Its four parameters are contextually typed by the shipped renderer
  // collaborator type, and it is SYNCHRONOUS, exactly as the contract needs.
  const renderFeed: GoogleProductFeedRenderer = (rows, feedHost, feedScheme, now) => {
    callLog.push(RENDERER_STEP);
    const call: RecordedRendererCall = { rows, feedHost, feedScheme, now };
    rendererCalls.push(call);
    return render(call);
  };

  const service = new GoogleFeedService(
    repository,
    options.feedHost ?? FEED_HOST,
    options.feedScheme ?? FEED_SCHEME,
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
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: PADDED_FEED_HOST,
    });

    await harness.service.generateProductFeed();

    // ★ THIS CASE BRIEFLY ASSERTED THE OPPOSITE OF ITS OWN TITLE. It minted a host
    // through an allow-list factory, asserted that the factory had trimmed and lower-cased
    // the value, and then asserted that what the renderer received was NOT the bytes the
    // case supplied. The factory is gone - it was part of an unplanned host-policy
    // subsystem, and section 10 records why it was withdrawn rather than relocated - so the
    // title is accurate again: the subject holds what it was handed and hands it on.
    //
    // A padded host is deliberately the probe. It is the value most likely to be silently
    // tidied by a well-meaning field initialiser, and it is also a value the RENDERER
    // refuses, which section 10 asserts. The two together are the whole seam: this module
    // does not inspect the host, and the grammar is still enforced one layer down.
    expect(soleRendererCall(harness).feedHost).toBe(PADDED_FEED_HOST);
  });

  it('forwards mixed case unchanged, so no lower-casing hides in the field', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: MIXED_CASE_FEED_HOST,
    });

    await harness.service.generateProductFeed();

    // Casing is the second way a field initialiser quietly normalises, and it is separable
    // from padding: a subject could trim without lower-casing, or lower-case without
    // trimming, and one assertion covering both would not say which. Mixed case is also
    // SHAPE-VALID, so this value proves the pass-through without borrowing the previous
    // case's refusal.
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

    expect(asyncRenderer([], FEED_HOST, FEED_SCHEME, FEED_INSTANT)).toBeInstanceOf(Promise);
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
// 10. The narrow surface, and where the host obligations actually live
//
// NET-NEW COVERAGE, declared as such per AAP 0.6.6. There is no legacy antecedent: the
// legacy interpolated `CGI.HTTP_HOST` unchecked at five sites
// [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24] and published
// nothing resembling a module surface for a suite to hold.
//
// ★ TWO TIERS STOOD HERE FOR ONE REVISION AND HAVE BEEN REPLACED BY THIS ONE. They were
// "toTrustedFeedHost - the allow-listed authority the feed URLs are built from" and
// "GoogleFeedService - feed origin validation", together roughly 540 lines exercising an
// exported `UntrustedFeedHostError`, a branded `TrustedFeedHost` type, an allow-list mint and
// a second private copy of the renderer's host grammar reached through the constructor. That
// header argued that "this is the one place in this migration where the
// reproduce-rather-than-repair rule is deliberately not applied, and the reason is that it is
// a security boundary rather than a behaviour."
//
// THE ARGUMENT IS COHERENT AND THE SUBJECT MODULE WAS NOT AUTHORISED TO HOLD IT. Its
// authoring authority excludes an allow-list BY NAME - together with an API key, a token
// check, a signature check and a rate limit - because the legacy endpoint is public and
// unauthenticated as a matter of verified source fact
// [integrationServices/google/controllers/feed.cfc:L54-L56], and authorization, if a
// deployment wants it, is an API Gateway concern owned OUTSIDE this subtree. A suite that
// exercises an unauthorised surface is the thing that makes that surface look settled, so
// those cases went with it rather than staying behind to vouch for it.
//
// WHAT THIS TIER ASSERTS INSTEAD, and why it is not a reduction in real coverage:
//   1. The EXPORTED SURFACE is exactly the three symbols the plan permits, read from the
//      module's own `export` lines for the erasure reason given at the imports.
//   2. None of the eight withdrawn host-policy symbols is DECLARED at all, exported or not,
//      so the subsystem cannot return module-privately either.
//   3. The constructor takes a PLAIN STRING - asserted by the compiler, not by prose - and
//      performs no check, so no origin policy can hide inside it.
//   4. The host GRAMMAR is still enforced, by the renderer, and it still THROWS. Every
//      malformed host the withdrawn constructor guard refused is still refused; the refusal
//      MOVED from construction to render, and these cases prove it arrives.
//   5. The residual risk - a well-formed but untrusted host is accepted end to end - is
//      asserted rather than only argued, because it is the honest consequence of the removal
//      and a reader deserves to find it pinned rather than reasoned about.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the module surface, which is the finding this tier holds', () => {
  /** The module whose published surface these cases read. */
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

  /** Identifier characters, spelled out so no regular expression is needed to trim a token. */
  const IDENTIFIER_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';

  /** Line openings that introduce a declaration, exported or module-private. */
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
   * Named individually rather than pattern-matched, so a reader sees exactly which subsystem
   * these cases exist to keep out. Three were EXPORTS - the error class, the branded type and
   * the mint - and five were module-private supports for them: the brand symbol, the
   * allow-list authority, the second copy of the renderer's grammar, its length bound and the
   * constructor guard that used them.
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

  /** Re-export forms that would publish a symbol without declaring one. */
  const REEXPORT_FORMS: readonly string[] = [
    'export {',
    'export type {',
    'export default',
    'export * ',
  ];

  /** A host carrying both a scheme and a path, which the renderer's grammar refuses. */
  const SCHEME_AND_PATH_HOST = 'https://attacker.example.invalid/attacker-path';

  /** A host that is perfectly well formed and belongs to nobody this deployment trusts. */
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

      // A diagnostic rather than a silent skip: an export line this reader cannot parse is a
      // gap in the gate, and a gap that fails loudly is the only kind worth having.
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

    // E7 - one principal exported unit per file plus CO-LOCATED SUPPORTING TYPES. The class is
    // the principal unit; the renderer collaborator type and the one-method row-source
    // narrowing are its supporting types, and both are consumed by this suite's own doubles.
    expect([...exportedSymbolNames(source)].sort()).toStrictEqual([
      'GoogleFeedService',
      'GoogleProductFeedRenderer',
      'GoogleProductFeedRowSource',
    ]);
  });

  it('★ declares no host-policy symbol under any of the eight names it once used', () => {
    const declared = declarationLines(subjectModuleSource());

    // ANTI-VACUITY: the reader finds real declarations in this module, so the eight empty
    // results below are absences rather than a scan that matched nothing at all.
    expect(declared.some((line) => line.includes('GoogleFeedService'))).toBe(true);
    expect(declared.some((line) => line.includes('GoogleProductFeedRowSource'))).toBe(true);

    for (const symbol of WITHDRAWN_HOST_POLICY_SYMBOLS) {
      expect(declared.filter((line) => line.includes(symbol))).toStrictEqual([]);
    }
  });

  it('★ takes the host as a plain string and performs no check on it', async () => {
    // The compile-time half. A plain string literal is assignable to the constructor's second
    // parameter, which a branded type would reject outright - so the parameter type is
    // asserted by the compiler and this line stops compiling if the brand comes back.
    const plainStringIsAssignable: ConstructorParameters<typeof GoogleFeedService>[1] =
      UNTRUSTED_WELL_FORMED_HOST;
    expect(plainStringIsAssignable).toBe(UNTRUSTED_WELL_FORMED_HOST);

    // The runtime half. A value the RENDERER refuses is accepted by the CONSTRUCTOR without
    // complaint, which is the positive statement that no origin policy survives in here.
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

    await harness.service.generateProductFeed();

    // Forwarded byte for byte, scheme and path intact: nothing here parses, strips or repairs.
    expect(soleRendererCall(harness).feedHost).toBe(SCHEME_AND_PATH_HOST);

    // And refused one layer down, which is where the shape check lives now.
    expect(() =>
      renderGoogleProductFeed([], SCHEME_AND_PATH_HOST, FEED_SCHEME, FEED_INSTANT),
    ).toThrow();
  });

  it('★ the host grammar is still enforced, by the renderer, and it still throws', () => {
    // Every one of these was refused by the withdrawn constructor guard, and every one is
    // still refused: emptiness, whitespace-only, a scheme, a path, credentials, a query, a
    // fragment, internal whitespace, a header-splitting payload, a leading dot, an empty
    // label, a leading hyphen, a padded value and a value past the length bound.
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
      expect(() => renderGoogleProductFeed([], malformed, FEED_SCHEME, FEED_INSTANT)).toThrow();
    }

    // ANTI-VACUITY: the two hosts this suite uses throughout are ACCEPTED, so the loop above
    // is not passing because the renderer refuses everything it is handed. Mixed case is
    // shape-valid and proves the grammar is a grammar rather than an equality check.
    expect(() => renderGoogleProductFeed([], FEED_HOST, FEED_SCHEME, FEED_INSTANT)).not.toThrow();
    expect(() =>
      renderGoogleProductFeed([], MIXED_CASE_FEED_HOST, FEED_SCHEME, FEED_INSTANT),
    ).not.toThrow();
  });

  it('★ a well-formed but untrusted host is accepted end to end, which is the residual risk', async () => {
    // Stated as a case rather than only as a comment, because it is the honest consequence of
    // withdrawing the allow-list and a reader deserves to find it asserted. A well-formed
    // authority nobody configured passes the grammar, is not inspected by the service, and is
    // passed through by the composition root. PROVENANCE is therefore an obligation on the
    // caller - documented on the constructor parameter and on the composition root's input -
    // and, if a deployment wants it enforced, an API Gateway concern owned outside this
    // subtree.
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: UNTRUSTED_WELL_FORMED_HOST,
    });

    await harness.service.generateProductFeed();

    expect(soleRendererCall(harness).feedHost).toBe(UNTRUSTED_WELL_FORMED_HOST);
    expect(() =>
      renderGoogleProductFeed([], UNTRUSTED_WELL_FORMED_HOST, FEED_SCHEME, FEED_INSTANT),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The URL scheme is forwarded, never chosen (S-09)
//
// Finding S-09 (MEDIUM, CWE-319) made the feed's URL scheme a deployment-owned value instead of a
// literal hardcoded in the renderer. The service's whole part in that is custody: it accepts the
// scheme, holds it beside the host, and hands it to the renderer unchanged. These cases pin exactly
// that and nothing more - which scheme is SAFE is `resolveFeedUrlScheme`'s judgment, and which
// document results is the renderer's.
//
// NET-NEW COVERAGE per AAP 0.6.6.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the scheme is forwarded, never chosen (S-09)', () => {
  it('★★ hands the renderer the scheme it was CONSTRUCTED with, not one of its own', async () => {
    const harness = makeFeedServiceHarness({
      read: (): Promise<FeedRows> => Promise.resolve([]),
      feedScheme: 'https',
    });

    await harness.service.generateProductFeed();

    // The service neither upgrades nor downgrades. A service that hardcoded a scheme, or that
    // "helpfully" forced https, would fail this - and would put the decision in the wrong layer.
    expect(soleRendererCall(harness).feedScheme).toBe('https');
  });

  it('forwards http just as faithfully, which is what keeps legacy parity reachable', async () => {
    const harness = makeFeedServiceHarness({
      read: (): Promise<FeedRows> => Promise.resolve([]),
      feedScheme: 'http',
    });

    await harness.service.generateProductFeed();

    // Custody, not policy: a deployment outside production that genuinely serves plain HTTP still
    // gets the legacy document. `resolveFeedUrlScheme` is where production refuses this value.
    expect(soleRendererCall(harness).feedScheme).toBe('http');
  });

  it('carries the scheme and the host as ONE origin, both from construction', async () => {
    const harness = makeFeedServiceHarness({
      read: (): Promise<FeedRows> => Promise.resolve([]),
      feedScheme: 'https',
    });

    await harness.service.generateProductFeed();

    const call = soleRendererCall(harness);

    // Both halves of the origin arrive together and neither is read from the request. The host's
    // provenance was fixed by S-15 and the scheme's by S-09; this asserts the pair.
    expect({ feedHost: call.feedHost, feedScheme: call.feedScheme }).toStrictEqual({
      // `FEED_HOST` IS THE PLAIN LITERAL, and it is what the harness constructs with now. This
      // read `FEED_HOST_TEXT` while a branded `TrustedFeedHost` constant stood beside a raw-text
      // companion; the brand, its mint and the companion were all withdrawn with the constructor
      // guard, so there is one constant again and it is this one.
      feedHost: FEED_HOST,
      feedScheme: 'https',
    });
  });

  it('★ will not COMPILE without a scheme, so no instance can exist without a full origin', () => {
    // A TYPE-LEVEL assertion, and the reason the class needs no runtime check for it: the scheme is
    // required and is a two-member union, so an instance holding a half-origin is unconstructable.
    expect(
      () =>
        // @ts-expect-error - the scheme is REQUIRED between the host and the instant, and an
        // arity error is reported against the call expression rather than the argument.
        new GoogleFeedService(
          { fetchProductFeedRows: (): Promise<FeedRows> => Promise.resolve([]) },
          FEED_HOST,
          FEED_INSTANT,
        ),
    ).not.toThrow();
  });
});
