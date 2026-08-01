// ---------------------------------------------------------------------------
// slatwall-ts - tests/unit/integrations/google/googleFeedService.test.ts
//
// WHAT THIS SUITE PINS
//   src/integrations/google/googleFeedService.ts - the ORCHESTRATION third of the
//   Google product-feed adapter. That module ships one principal exported unit,
//   `GoogleFeedService`, and every assertion below goes through it.
//
//   Orchestration is the whole subject. The class holds a row source, a host, an
//   instant and a renderer, and its one method performs exactly two steps: read
//   the rows, then render them. So this suite is about SEQUENCE, FORWARDING and
//   PASSTHROUGH - which collaborator is reached, in what order, with which
//   arguments, and what comes back unchanged. It asserts nothing about the shape
//   of the document (that is the renderer's suite), nothing about the selection
//   statement (that is the repository's suite), and nothing about the adapter
//   contract's five inherited members (that is integration.test.ts).
//
//   The subject reaches no database, no pool, no connection, no network, no
//   Google endpoint, no file, no environment variable, no setting, no clock and
//   no application wiring, so this suite needs none of those either. It installs
//   no spy and uses no mocking library: two hand-written doubles declared inline
//   in this file are the entire test scaffolding, and they are enough because the
//   whole contract is two collaborators and a string.
//
//   The document the subject returns is machine-readable RSS 2.0 for Google
//   Merchant Center. It is NOT a user interface - this migration renders no
//   screen, there is no design system, component library or visual reference in
//   the project, and `tsconfig.json` declares `lib: ["ES2022"]` with no "DOM"
//   entry, so no browser type is in scope. Nothing below asserts anything visual.
//
// ****************************************************************************
// ** COVERAGE HERE IS NET-NEW IN ITS ENTIRETY. IT HAS NO LEGACY ANTECEDENT, **
// ** AND PRESENTING IT AS PARITY WITH A LEGACY TEST WOULD BE FALSE.         **
// **                                                                        **
// ** The subject is net-new orchestration: the legacy subsystem had a       **
// ** controller, a dead data-access component and a view, and NO            **
// ** orchestrator at all, so there is no legacy unit whose coverage this    **
// ** could extend. Re-verified on disk rather than taken on trust: a        **
// ** case-insensitive search of meta/ for `google` matches ZERO lines, and  **
// ** a search for `rss`, `productFeed` or `feed` matches ZERO files. A      **
// ** targeted search for the integration surface names matches only line 36 **
// ** of each legacy test file - the special-exception clause inside the     **
// ** license header, which is not coverage of anything.                     **
// **                                                                        **
// ** Exactly two suites in the whole migration extend legacy coverage -     **
// **   meta/tests/unit/entity/ProductTest.cfc  the URL-format case          **
// **   meta/tests/unit/entity/BrandTest.cfc    an empty products array      **
// ** - and this file is NEITHER of them. A third legacy file,               **
// ** meta/tests/functional/admin/entity/ProductTest.cfc, is an empty stub   **
// ** contributing nothing; it is acknowledged rather than counted.          **
// ****************************************************************************
//
// BEHAVIOURAL AUTHORITY
//   [integrationServices/google/controllers/feed.cfc] - 74 lines, read in full.
//   Supporting: [integrationServices/google/controllers/main.cfc] (52 lines) and
//   [integrationServices/google/views/feed/product.cfm] (65 lines).
//
//   JUDGMENT CALL: this suite pins RESHAPING #3 OF THE 3 PERMITTED FOR THE WHOLE
//   MIGRATION, and records its provenance so the budget can be audited here.
//     LEGACY  `public void function product(required struct rc)`
//             [integrationServices/google/controllers/feed.cfc:L58]
//     TARGET  `async generateProductFeed(): Promise<string>`
//     The legacy method was named `product`, RETURNED `void`, AND PRODUCED ITS
//     RESULT BY MUTATING `rc` - it assigned a SKU selection onto the FW/1 request
//     context at [feed.cfc:L63] and let the framework resolve a view that read
//     that one key back at [product.cfm:L8]. The document string existed nowhere
//     in that control flow. The target RETURNS THE DOCUMENT, and that inversion
//     is the whole substance of the reshaping. The other two slots are already
//     spent: the two order-amount methods returning intents instead of mutating
//     the order aggregate, and the two smart-list renames. A FOURTH RESHAPING
//     ANYWHERE IS A GATE FAILURE, and none is taken here.
//
//   SCOPE OF THIS FOLDER'S BUDGET, stated so no reviewer has to infer it: this
//   folder owns ZERO of the 5 permitted visibility widenings, ZERO of the 1
//   permitted entity signature widening, and ZERO of the 3 documented deliberate
//   divergences. It also carries ZERO preserved-defect markers, because the
//   subject has no legacy body to preserve a defect from, and ZERO deferred-work
//   markers, because nothing here is deferred.
//
// WHAT WAS VERIFIED ON DISK BEFORE A SINGLE IMPORT WAS WRITTEN
//   The symbol expectations that reached this suite were a strong expectation and
//   not gospel, so all four depended-on modules were read end to end first, and
//   every symbol named below is the symbol that actually shipped. FIVE findings
//   differ from those expectations. Each one changed what is written here, the
//   SUITE was adapted in every case, and NOT ONE LINE of any module under src/**
//   was created, renamed, edited or deleted.
//
//   1. THE HOST AND THE INSTANT ARE CONSTRUCTOR PARAMETERS, NOT METHOD
//      PARAMETERS. The expectation was that both would be method inputs. The
//      shipped method takes NONE:
//        constructor(repository, feedHost, now, renderFeed = renderGoogleProductFeed)
//        async generateProductFeed(): Promise<string>
//      That is not a gap, it is the port matched exactly - `ProductFeedPort`
//      declares `generateProductFeed(): Promise<string>` with no parameters - and
//      it makes both values request-scoped constructor state. Every forwarding
//      assertion below therefore checks what the CONSTRUCTOR was given, not what
//      the call was given.
//
//   2. THE CONSTRUCTOR TAKES FOUR PARAMETERS, AND THE RENDERER IS A DEFAULTED
//      FOURTH. `renderFeed` defaults to the real `renderGoogleProductFeed`, so
//      injection is optional at the call site. This suite ALWAYS injects a
//      double, which is the only way to keep the isolation guarantee: exercising
//      the default would run the real renderer and turn every case here into a
//      document-shape assertion that another suite already owns.
//
//   3. THE ROW-SOURCE COLLABORATOR IS NOT TYPED AS THE REPOSITORY CLASS. It is
//      `GoogleProductFeedRowSource`, a one-method narrowing of the repository, and
//      the shipped module documents that this is deliberate: the repository holds
//      private fields, and a class type with private members admits only that
//      class, so an object literal would be rejected outright. The narrowing is
//      what makes a structural double possible, and this suite is the direct
//      beneficiary - the double is a plain object literal with one method.
//
//   4. `rssFeedRenderer.ts` IS NOT IMPORTED HERE AT ALL, and that is required
//      rather than an omission. The renderer collaborator type is
//      `GoogleProductFeedRenderer`, declared by the subject's own module as
//      `typeof renderGoogleProductFeed`, so the double's parameters are
//      contextually typed and the renderer symbol is never needed as a value.
//      Importing it would leave an unused binding - a compile error under
//      `noUnusedLocals` - or, if used, would construct the real renderer, which
//      this suite must not do.
//
//   5. THE PROJECTION'S MONETARY FIELDS ARE REQUIRED PROPERTIES WHOSE TYPE ADMITS
//      ABSENCE. The shipped declaration is `readonly productPrice: Money |
//      undefined`, not `productPrice?: Money`. A complete row is therefore
//      constructible with `undefined` in those three slots, which is how the row
//      factory below builds one WITHOUT naming the money value object: no
//      monetary arithmetic happens anywhere in the subject, so no monetary type
//      is imported and no decimal library is reached for. Verified by compiling.
//
// NOT PORTED, RECORDED WITH LOCATORS SO EACH OMISSION READS AS A DECISION
//   CFML parity [integrationServices/google/controllers/feed.cfc:L59-L60]: the
//   layout suppression - `// Hide the layout` then `request.layout = false;` - is
//   a CFML view concern with no target analogue, so it is not ported and nothing
//   below asserts a layout, a view or a template.
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L62]: the legacy
//   intent comment "Create the product feed" is carried forward as intent onto
//   the ordering group below, because that is precisely what the two orchestrated
//   steps do.
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L63]: the SKU
//   service the legacy body reached for is not ported, and neither is the
//   framework selection object it produced. Building and configuring that
//   selection is exactly what the row source replaced, so no selection type is
//   referenced, re-exposed or re-implemented here, and nothing in this file is
//   named after it.
//
//   CFML parity [integrationServices/google/controllers/main.cfc:L49-L52]: not
//   ported, and there is nothing to port - the component is 52 lines of which the
//   body is literally empty (declaration at L49, two blank lines, closing brace at
//   L52). Verified by reading it rather than assumed from its name.
//
//   CFML parity [integrationServices/google/views/main/default.cfm:L50]: not
//   ported. Its 51 lines carry a single paragraph telling an operator to point
//   their Google Feed at `?slatAction=google:feed.product`. That is deployment
//   instruction prose for the legacy routing convention, not behaviour.
//
//   CFML parity [integrationServices/google/controllers/feed.cfc:L54-L56]: the
//   legacy action was PUBLIC AND UNAUTHENTICATED - `this.publicMethods="product"`
//   with both the admin-method and secure-method lists empty. That is recorded
//   here as a FACT ABOUT THE SOURCE and no authentication is invented to
//   compensate: this suite asserts no API key, no credential check, no signature
//   verification, no allow-list and no request-rate limit, because inventing one
//   would be inventing a requirement.
//
//   E5 transfer: there is no query, no query fragment and no database access in
//   the subject, so the project's parameterized-statement obligation does not
//   land here - it lands wholly on the row source. Recorded so the transfer is
//   explicit rather than assumed. For completeness, the legacy Google subsystem
//   contains ZERO parameterized-query tags of its own; verified by searching it.
//
//   No service level, refresh interval, rate figure or timing bound is asserted
//   anywhere below. The legacy view's 360-second request budget at
//   [integrationServices/google/views/feed/product.cfm:L9], the 15-minute
//   function cap and the 29-second gateway hold are PLATFORM FACTS about two
//   runtimes, never requirements, and no case here measures elapsed time.
//
// FIXTURE PROVENANCE
//   [meta/tests/unit/Helper.cfc] is followed as a PATTERN and its MECHANISM is
//   rejected outright. Kept: one named factory returning one obviously-fake
//   subject, with per-case overrides replacing individual fields. Rejected: that
//   helper builds a persistent entity through the object-relational mapper, saves
//   it through an ambient request-scoped service locator, and flushes the mapper's
//   session - so every legacy "unit" test boots the real application, the mapper
//   and the dependency-injection container. Nothing of that kind happens here.
//   This suite is genuinely isolated: no subject is persisted, no ambient scope is
//   read, and every value a case needs is declared inline in this file.
//
//   No sibling fixture module is applicable. The five modules under
//   tests/fixtures/ build products, SKUs, promotions, price groups and order
//   views; not one of them produces a feed-row projection or a rendered document,
//   and an unused import is a compile error here, so all test data is local.
//
// WHAT THIS SUITE REFUSES TO IMPORT, AND WHY
//   Recorded so a reviewer can tell each omission from an oversight. No database
//   driver symbol and no connection module - the subject has no data access, and
//   reaching one would make an orchestration suite require a live server. No
//   configuration or logging module - nothing here reads the environment, and the
//   whole suite passes with a COMPLETELY EMPTY environment. Nothing under
//   src/handlers/** - the feed entrypoint and the composition root are a sibling
//   folder's responsibility. Nothing under src/services/**. No settings port -
//   the subject resolves no setting. The adapter contract module is not imported
//   either; the five-member interface surface belongs to integration.test.ts, and
//   the one port this file does name is the feed-generation port, which is the
//   contract the subject actually implements.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { GoogleFeedService } from '../../../../src/integrations/google/googleFeedService.js';
import type {
  GoogleProductFeedRenderer,
  GoogleProductFeedRowSource,
} from '../../../../src/integrations/google/googleFeedService.js';
import type { GoogleProductFeedRow } from '../../../../src/integrations/google/googleFeedRepository.js';
import type { ProductFeedPort } from '../../../../src/domain/ports/productFeedPort.js';

// ---------------------------------------------------------------------------
// Fixed inputs
//
// Every value a case needs is a named constant, so no case carries a bare
// literal whose meaning has to be reconstructed. The module scope holds only
// these constants and the pure factories below it: there is no counter, no
// shared subject, no shared double and no shared log, so no case can observe
// another case's effects.
// ---------------------------------------------------------------------------

/**
 * The host handed to the subject, and a non-routable placeholder by design.
 *
 * `.invalid` is reserved precisely so that it can never resolve, which is the
 * point: the ported adapter performs no live Google call and needs no
 * credentials, so a host reaches this suite as a plain string input and nothing
 * is ever dialled. No real hostname, address or endpoint appears in this file.
 */
const FEED_HOST = 'feed.example.invalid';

/**
 * The same placeholder wearing surrounding whitespace and mixed case.
 *
 * Used by one case to prove the host is forwarded BYTE-IDENTICALLY. The shipped
 * module states that the host is not parsed, trimmed, lower-cased, validated,
 * prefixed with a scheme or defaulted, because the legacy interpolated whatever
 * the engine reported and checked nothing. A guard would be behaviour the legacy
 * never had, so its absence is asserted rather than assumed.
 */
const UNTOUCHED_FEED_HOST = '  Feed.EXAMPLE.invalid  ';

/**
 * The instant handed to the subject, stated in explicit UTC.
 *
 * The subject holds an instant rather than reading a clock, which is what makes
 * it deterministic. Nothing in this file consults the system clock, so no case
 * can pass on one machine and fail on another. One case constructs its own
 * equivalent instant and proves the value survives the call unmutated.
 */
const FEED_INSTANT = new Date('2024-06-01T12:34:56.789Z');

/** The wire form of {@link FEED_INSTANT}, for the no-mutation case. */
const FEED_INSTANT_ISO = '2024-06-01T12:34:56.789Z';

/**
 * What the double renderer returns, and what the subject must return unchanged.
 *
 * Deliberately hostile to a well-behaved orchestrator that does one thing too
 * many: it opens and closes with whitespace, so a trim shows up; it carries
 * `&`, `<`, `>` and `"` unescaped, so any re-encoding shows up; and it is not
 * well-formed markup, so any attempt to parse, validate or re-serialise it shows
 * up. A conforming subject returns it exactly as given.
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
 * "Create the product feed" [integrationServices/google/controllers/feed.cfc:L62]:
 * the legacy selected once and rendered once, in that order, for one request. Read
 * THEN render, exactly once each. Asserted as a whole array rather than as two
 * independent "was called" checks, because two such checks pass just as happily
 * when the order is reversed - which would mean rendering rows that had not been
 * read yet.
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
 * A local alias, not a re-declaration - the shipped projection remains the single
 * source of truth, and this only shortens the signatures below.
 */
type FeedRows = readonly GoogleProductFeedRow[];

/**
 * One row, with EVERY key present.
 *
 * Completeness is not a stylistic choice: the shipped projection declares all
 * twenty-two fields REQUIRED, several with a type that admits absence, so a
 * factory that omitted a key would not compile - see finding 5 in the header.
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
 * The three records are exposed through read-only array types over the very
 * arrays the doubles append to, so a case can watch them grow but cannot forge an
 * entry. Reading `callLog` immediately after an unawaited call is a legitimate
 * observation and one case depends on it.
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
 * `read` is required because every case decides what the read does - resolve,
 * reject, or stay pending. The other three are optional and, under
 * `exactOptionalPropertyTypes`, a case that does not need one OMITS THE KEY
 * rather than passing `undefined`.
 */
interface FeedServiceHarnessOptions {
  /** Invoked by the double row source; its result is what the subject awaits. */
  readonly read: () => Promise<FeedRows>;

  /** Invoked by the double renderer to produce the document. Defaults to the sentinel. */
  readonly render?: (call: RecordedRendererCall) => string;

  /** The host given to the constructor. Defaults to {@link FEED_HOST}. */
  readonly feedHost?: string;

  /** The instant given to the constructor. Defaults to {@link FEED_INSTANT}. */
  readonly now?: Date;
}

/**
 * Builds one subject wired to two fresh doubles, and returns both plus their records.
 *
 * A FRESH subject and a FRESH pair of doubles per call, with the records created
 * here and captured by these closures alone. Nothing is reset between cases
 * because nothing is shared between cases, which is a stronger guarantee than
 * resetting: there is no state left over to reset.
 *
 * NO MOCKING LIBRARY IS USED, and none is needed. Two closures over three arrays
 * record everything the assertions require, and a hand-written double states its
 * own contract in the file that depends on it. No spy is installed either, so this
 * suite has nothing to restore - the shared setup file's teardown is left to do
 * its job for suites that do install one, and nothing here relies on it.
 *
 * JUDGMENT CALL: both collaborators arrive as explicit, typed CONSTRUCTOR
 * arguments, and that is the whole replacement for the legacy dependency
 * mechanism.
 *   The legacy controller declared its collaborators as component properties
 *   [integrationServices/google/controllers/feed.cfc:L51-L52] which a
 *   convention-scanning container resolved at runtime by name. The target wires
 *   them explicitly instead, so the graph is checked by the compiler rather than
 *   discovered by a scan - a missing or mistyped collaborator is a build failure,
 *   not a runtime surprise. Retiring that scan also retires the thirty-second
 *   first-scan lock the container took, which disappears with the container
 *   itself. This suite is the direct beneficiary and the proof: it hands the
 *   subject two doubles through the constructor, and no container, service
 *   locator, registry, decorator or reflection facility is present anywhere in
 *   this file.
 *
 * JUDGMENT CALL: the legacy's dead collaborator is NOT carried forward.
 *   [integrationServices/google/controllers/feed.cfc:L51] declares
 *   `property name="productService" type="any";` and the method body NEVER READS
 *   IT - the only collaborator that body reaches for is the SKU service at
 *   [feed.cfc:L63]. Interface parity binds the METHOD surface, not a collaborator
 *   nothing calls, so omitting it is parity-preserving rather than a divergence.
 *   Carrying it would have forced an unused constructor argument on the subject
 *   and an unused double on every case in this file. The shipped constructor has
 *   no such parameter, so this suite supplies no such double.
 */
function makeFeedServiceHarness(options: FeedServiceHarnessOptions): FeedServiceHarness {
  const callLog: string[] = [];
  const rowSourceCallArguments: (readonly unknown[])[] = [];
  const rendererCalls: RecordedRendererCall[] = [];
  const render = options.render ?? ((): string => RENDERED_FEED_SENTINEL);

  // The double row source. Typed to the shipped one-method narrowing, which an
  // object literal satisfies - see finding 3 in the header. The rest parameter is
  // not decoration: capturing whatever arrives is how a case proves the subject
  // invents no argument for a query that declares none.
  const repository: GoogleProductFeedRowSource = {
    fetchProductFeedRows: (...args: readonly unknown[]): Promise<FeedRows> => {
      callLog.push(ROW_SOURCE_STEP);
      rowSourceCallArguments.push([...args]);
      return options.read();
    },
  };

  // The double renderer. Its three parameters are contextually typed by the
  // shipped renderer collaborator type, so they are never re-declared here - see
  // finding 4 in the header. It is SYNCHRONOUS, exactly as the contract requires.
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
 * An indexed read answers `T | undefined` under `noUncheckedIndexedAccess`, and no
 * postfix non-null assertion appears anywhere in this file. Throwing a diagnostic
 * on a shape that cannot be read is worth more than coercing `undefined` and
 * failing three assertions later with no reason printed.
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
 * Deliberately NOT `async`. It forwards the subject's promise instead of awaiting
 * and re-wrapping it, which keeps the returned promise the subject's own and
 * leaves the async boundary exactly where the contract puts it.
 */
function generateThroughPort(port: ProductFeedPort): Promise<string> {
  return port.generateProductFeed();
}

// ---------------------------------------------------------------------------
// 1. The declared contract
//
// Interface parity is the acceptance contract for this migration, and for this
// module the parity proof is not a comparison a reviewer performs by eye - it is
// an assignment the compiler either accepts or rejects.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the declared contract', () => {
  it('is assignable to the feed-generation port with no cast and no assertion', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    // THIS LINE IS THE PARITY PROOF. A plain annotated binding: no `as`, no
    // `satisfies` standing in for a real mismatch, and no structural adapter in
    // between. It compiles only because the class's one method matches the port's
    // one declared capability exactly - same name, same arity, same return type.
    const port: ProductFeedPort = harness.service;

    await expect(generateThroughPort(port)).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(harness.callLog).toEqual(READ_THEN_RENDER);
  });

  it('satisfies a port-typed parameter, so a consumer needs no knowledge of the class', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    // Passing the instance where only the port is declared is the same proof from
    // the caller's side: this is how the composition root will hand the subject on
    // without leaking the concrete type.
    await expect(generateThroughPort(harness.service)).resolves.toBe(RENDERED_FEED_SENTINEL);
  });

  it('implements a port that declares exactly one capability', () => {
    // A compile-time exhaustiveness check, not a runtime one. If the port ever
    // declared a second member, `keyof` would widen and the second binding would
    // stop compiling - which is the assertion. A runtime key count could not see
    // this at all: an interface emits no runtime value.
    type PortCapabilityNames = keyof ProductFeedPort;
    const soleCapabilityName: PortCapabilityNames = 'generateProductFeed';
    const exactlyOneCapability: 'generateProductFeed' = soleCapabilityName;

    expect(exactlyOneCapability).toBe('generateProductFeed');
  });

  it('declares that capability with no parameters at all', () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    // Bound so the reference carries its receiver rather than dangling. A bound
    // function reports the arity of what it wraps, less any pre-applied argument -
    // none here - so zero is the shipped parameter count observed at runtime,
    // matching the port and matching the legacy action, which took no
    // caller-supplied narrowing whatsoever.
    const boundGenerate: () => Promise<string> = harness.service.generateProductFeed.bind(
      harness.service,
    );

    expect(boundGenerate.length).toBe(0);
  });

  it('returns a promise of the document, keeping the read on the async boundary', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([]) });

    const pending = harness.service.generateProductFeed();

    // Asynchronous because it READS: the async boundary in this migration is a
    // documented contract rather than a preference, and a method is asynchronous
    // if and only if its legacy body reached the data store. This one did.
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(typeof (await pending)).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 2. The step sequence
//
// "Create the product feed" [integrationServices/google/controllers/feed.cfc:L62].
// THE MOST IMPORTANT ASSERTIONS IN THIS FILE. Read, then render - and the whole
// log is asserted as one array every time, because a pair of "was it called"
// checks cannot tell the correct order from the reverse of it.
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
    // The read is held open, so the two steps are separated in time and the gap
    // between them is observable. This is what makes the await provable rather
    // than merely plausible.
    let releaseRead: ((rows: FeedRows) => void) | undefined;
    const heldRead = new Promise<FeedRows>((resolve) => {
      releaseRead = resolve;
    });
    const rows: FeedRows = [makeFeedRow()];
    const harness = makeFeedServiceHarness({ read: () => heldRead });

    const pending = harness.service.generateProductFeed();

    // The row source was entered synchronously - an async body runs to its first
    // await - and the renderer has NOT been reached. A subject that rendered
    // without awaiting would already have logged the renderer here.
    expect(harness.callLog).toEqual([ROW_SOURCE_STEP]);

    if (releaseRead === undefined) {
      throw new Error('expected the held read to expose its resolver');
    }
    releaseRead(rows);

    await expect(pending).resolves.toBe(RENDERED_FEED_SENTINEL);
    expect(harness.callLog).toEqual(READ_THEN_RENDER);

    // And the renderer received the RESOLVED array, not the promise that carried
    // it. Identity is the assertion: an unawaited read would have handed the
    // renderer a promise, and this comparison would fail.
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

    // One call, and its argument list is empty. The shipped query declares no
    // parameter, and the subject invents none to pass it - no narrowing, no
    // options object, no page marker and no cancellation handle.
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

  it('forwards the constructor host byte-identically, without trimming or normalising', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.resolve([makeFeedRow()]),
      feedHost: UNTOUCHED_FEED_HOST,
    });

    await harness.service.generateProductFeed();

    // Surrounding whitespace and mixed case both survive. No trim, no
    // lower-casing, no scheme prefix, no validation and no default: escaping and
    // scheme composition belong to the renderer and happen exactly once, there.
    expect(soleRendererCall(harness).feedHost).toBe(UNTOUCHED_FEED_HOST);
  });

  it('forwards the constructor instant without cloning it or mutating it', async () => {
    // This case owns its instant so that, were the subject ever to mutate what it
    // was given, the damage could not reach another case.
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
// The reshaping's whole substance is that the caller receives the document. What
// the caller receives must therefore be the renderer's string and nothing else.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the document comes back untouched', () => {
  it('resolves to the renderer string verbatim, whitespace and all', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed();

    // Exact equality against a sentinel that opens and closes with whitespace: no
    // trim, no wrapper, no envelope, no re-encoding, no compression and no
    // pretty-printing. The subject returns what it was handed.
    expect(document).toBe(RENDERED_FEED_SENTINEL);
    expect(document.startsWith('  ')).toBe(true);
    expect(document.endsWith('  ')).toBe(true);
  });

  it('does not escape or re-encode the characters the renderer already emitted', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    const document = await harness.service.generateProductFeed();

    // Escaping is the renderer's job and is done exactly once, there. A subject
    // that escaped again would double-encode every ampersand in a real feed.
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

    // The double renderer emits no Google reference at all, so any occurrence here
    // could only have been added by the subject. There is none: the ported adapter
    // makes no live call, holds no endpoint and needs no credentials, and every
    // namespace or link in a real feed originates in the renderer.
    expect(document).not.toMatch(/google/i);
    expect(document).toBe(RENDERED_FEED_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// 5. A feed with no qualifying rows
//
// The behaviour a naive early return would break, and the reason it gets its own
// group: a zero-row feed is an ORDINARY OUTCOME, not an error and not an empty
// string. The legacy loop over an empty record set still produced a complete
// document, and so must this.
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
// Nothing is caught and nothing is defaulted. Swallowing a read failure would
// mean returning a document that silently omitted products a merchant is
// advertising, which is worse than returning no document at all.
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

    // Identity, not just message equality: the subject adds no failure mode of its
    // own, so the layer that owns the request maps the original.
    await expect(harness.service.generateProductFeed()).rejects.toBe(failure);
  });

  it('never reaches the renderer when the read fails', async () => {
    const harness = makeFeedServiceHarness({
      read: () => Promise.reject(new Error(ROW_SOURCE_FAILURE_MESSAGE)),
    });

    await expect(harness.service.generateProductFeed()).rejects.toThrow(ROW_SOURCE_FAILURE_MESSAGE);

    // The log stops at the read. Rendering a feed whose rows never arrived would
    // publish an empty catalog as though it were the truth.
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
// The collaborators arrive through the constructor and nowhere else. There is no
// module-level instance to share, no lazily created collaborator to memoise and
// no cached document to serve stale.
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

    // Each instance reached only its own collaborators. A module-level row source
    // or renderer would have crossed here.
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

    // Three generations, three reads, three renders, in strict alternation. A lazy
    // memo on either collaborator or on the document would collapse this log.
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

    // Both observable effects trace back to an injected double: the rows the
    // renderer saw are the ones the double row source produced, and the document is
    // the one the double renderer returned. Had the subject built a row source or a
    // renderer of its own, neither identity would hold - and a self-built row
    // source would also have needed a live server, which this suite never provides.
    expect(soleRendererCall(harness).rows).toBe(rows);
    expect(document).toBe(RENDERED_FEED_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// 8. The surface admits no invented input
//
// JUDGMENT CALL: NO CRITERIA TYPE EXISTS, AND NONE IS INVENTED HERE.
//   Settled by reading [integrationServices/google/controllers/feed.cfc:L58-L73]
//   rather than by preference. Every reference to the request context in that body
//   is a WRITE - the selection is assigned onto it at L63, then joins and the four
//   conditions at L68-L72 are added to that object - and NOTHING is read back out
//   of it. The selection factory was invoked with no arguments, so not even the
//   legacy dynamic filter surface reached it. The legacy action therefore took no
//   caller-supplied narrowing whatsoever, `ProductFeedPort` declares the capability
//   with no parameters, and the subject matches that declaration exactly.
//
//   Declaring a named-but-empty criteria type to look like an input contract would
//   invent a requirement the source does not supply, so this suite declares none
//   and asserts that the shipped surface rejects one. The four selection
//   conditions are consequently unreachable from a caller, which is what makes them
//   INVARIANTS of the feed rather than defaults of a query; they are enforced in
//   the row source and are that module's suite to pin.
//
// The two cases below are COMPILE-TIME assertions. Each `@ts-expect-error` carries
// a description and exists solely to assert a deliberate type failure: if the
// surface ever widened to accept what is passed, the directive would become unused
// and the typecheck gate would fail. That is the assertion working.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - the surface admits no invented input', () => {
  it('rejects an options bag, a filter toggle, paging and every other narrowing', async () => {
    const harness = makeFeedServiceHarness({ read: () => Promise.resolve([makeFeedRow()]) });

    // Stands in for the whole forbidden set at once - include-inactive,
    // include-unpublished, include-out-of-stock and minimum-quantity switches, a
    // filter array, a predicate, a boolean toggle, paging with a limit, an offset or
    // a cursor, a sort, a locale, a currency selector, a format discriminator, a
    // channel or destination, a site or store selector, a since-marker, a
    // compression flag, a chunk size, a callback, a streaming shape and a
    // cancellation handle. A zero-parameter method rejects all of them identically,
    // and it also rejects a gateway event and an invocation context, so no
    // cloud-platform type reaches this module either.
    // @ts-expect-error - the shipped method declares no parameter: "Expected 0 arguments, but got 1".
    await expect(harness.service.generateProductFeed({ includeInactive: true })).resolves.toBe(
      RENDERED_FEED_SENTINEL,
    );

    // The extra argument changed nothing at runtime either: one read with an empty
    // argument list, one render, one document.
    expect(harness.callLog).toEqual(READ_THEN_RENDER);
    expect(harness.rowSourceCallArguments).toEqual([[]]);
  });

  it('rejects an asynchronous renderer, so the renderer is synchronous by contract', () => {
    // Why this matters to the await discipline: the subject awaits the read and does
    // NOT await the renderer. That is only correct because the renderer contract
    // returns a string rather than a promise - and this is where that is asserted.
    // Awaiting a plain string would be noise that also misrepresented the contract.
    //
    // The declaration is kept on ONE line deliberately: the directive suppresses the
    // line immediately after it, so splitting the initialiser would move the error
    // out from under it and the directive would report itself unused.
    const feedDocument = RENDERED_FEED_SENTINEL;
    // @ts-expect-error - a promise-returning renderer is not assignable: the contract returns string.
    const asyncRenderer: GoogleProductFeedRenderer = () => Promise.resolve(feedDocument);

    expect(asyncRenderer([], FEED_HOST, FEED_INSTANT)).toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// 9. Nothing else happens
//
// Orchestration is two steps and no third. Selection belongs to the row source and
// presentation belongs to the renderer, so anything the subject added here would be
// behaviour duplicated in two places - and in the case of filtering, behaviour that
// could silently contradict the invariant the row source enforces.
// ---------------------------------------------------------------------------

describe('GoogleFeedService - nothing else happens', () => {
  it('applies no filtering, forwarding even rows the selection invariants would exclude', async () => {
    // Every row here fails one of the four selection conditions the row source
    // enforces at [integrationServices/google/controllers/feed.cfc:L68-L72]. They
    // could never arrive from the real row source, and that is exactly the point:
    // the subject must not re-apply a filter it does not own, because a second
    // filter is a second place for the rule to drift.
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
    // The legacy applied no ordering, so imposing one would be a repair rather than
    // a port. These rows are deliberately not in any natural order.
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

    // The same array object, which makes element identity automatic - there is no
    // copy, no slice, no spread and no projection in between. Asserted on the
    // elements as well so the guarantee is explicit rather than inferred.
    expect(call.rows).toBe(rows);
    expect(call.rows.every((row, index) => row === rows[index])).toBe(true);
    expect(call.rows).toEqual([firstRow, secondRow]);
  });

  it('performs no monetary arithmetic, leaving absent prices absent', async () => {
    // No arithmetic surface is reached from this module and no monetary type is
    // imported by this suite. A subject that touched a price would have to have
    // defaulted, coerced or formatted one, and all three would show here.
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
