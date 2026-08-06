// ---------------------------------------------------------------------------
// Unit suite for the Google product-feed RSS renderer
//
// SUBJECT: src/integrations/google/rssFeedRenderer.ts, the rendering half of the Google
// product-feed adapter and the port of [integrationServices/google/views/feed/product.cfm]. It
// exports exactly one unit, `renderGoogleProductFeed`, and every assertion goes through it. The
// subject is a pure synchronous function - rows in, one RSS 2.0 document out - and reaches no
// database, clock, environment variable, setting, file or network, so this suite needs no pool, no
// application wiring and no mocking library.
//
// COVERAGE CLASSIFICATION: NET-NEW in its entirety, never to be presented as parity. Measured on
// disk: a case-insensitive search of meta/ for `google` matches ZERO lines, and a search for `rss`,
// `productFeed` or `feed` matches ZERO files. The integration surface names match only line 36 of
// each legacy test file - the license special-exception clause, which covers nothing. Exactly two
// suites in this migration extend legacy coverage, meta/tests/unit/entity/ProductTest.cfc and
// meta/tests/unit/entity/BrandTest.cfc, and this file is NEITHER of them. A third legacy file,
// meta/tests/functional/admin/entity/ProductTest.cfc, is an empty stub contributing nothing; it is
// acknowledged rather than counted.
//
// FOUR CONTRACT FACTS THAT SHAPE EVERY ASSERTION BELOW
//
//   1. THE PROJECTION'S "OPTIONAL" FIELDS ARE NOT OPTIONAL PROPERTIES. Each is a
//      REQUIRED property whose TYPE admits absence: the shipped declaration is
//      `readonly brandName: string | undefined`, not `brandName?: string`. Under
//      `exactOptionalPropertyTypes`, omitting the key is a hard compile error
//      (TS2739, missing `skuSalePrice`, `salePriceExpirationDateTime` and
//      `brandName`), so absence is written as an explicit `: undefined` on a key
//      that is always present. The override parameter is
//      `Partial<GoogleProductFeedRow>`, where `?` genuinely is present, so
//      `{ brandName: undefined }` is legal and means "no brand name".
//   2. THE SALE GATE TESTS FOUR PRESENCE CONDITIONS BEFORE IT COMPARES. The
//      legacy gate at [integrationServices/google/views/feed/product.cfm:L28] is
//      the price comparison alone; the shipped gate additionally requires both
//      operands to be present and BOTH ends of the effective-date range to be
//      renderable, because an ISO 8601 interval has two ends and cannot be
//      well-formed with one. The prompt for this suite anticipated the
//      possibility and directed that whichever the module implements be
//      asserted, so the skip-on-absence behaviour is pinned below and annotated.
//   3. EVERY HELPER IN THE SUBJECT IS MODULE-LOCAL. The escaper, the element
//      emitter, the monetary presenter, the description chooser and the
//      timestamp renderer are not exported, so none can be called directly. That
//      is the right shape for the module and it decides the shape of this suite:
//      the five-entity escaping rules, the empty-body rules and the timestamp
//      format are all asserted through the rendered DOCUMENT, which is the only
//      observable the module offers.
//   4. ELEMENT 14 GATES ON BRAND PRESENCE, AND CARRIES THE NAME AS ITS BODY.
//      ★★ THIS FINDING ONCE READ "ELEMENT 14 GATES ON THE BRAND NAME, NOT ON
//      BRAND PRESENCE. THE SHIPPED GUARD IS `brandName !== undefined`, AND THE
//      PROJECTION CANNOT DISTINGUISH 'NO BRAND' FROM 'A BRAND THAT RECORDS NO
//      NAME'." Both statements were accurate readings of what had shipped, and the
//      second was the actual defect rather than a constraint to live with: the
//      legacy guard tests the ASSOCIATION
//      [integrationServices/google/views/feed/product.cfm:L32] and the name is only
//      what goes between the tags, so a branded product whose name column is null
//      emitted an empty element and this port omitted the element altogether. The
//      projection now carries `brandID` beside `brandName` - the column is on
//      `SwProduct` [model/entity/Product.cfc:L68], so it costs no join - and the
//      shipped guard is `brandID !== undefined`. All FOUR states are pinned below:
//      brand with a name, brand with an empty name, brand with a null name, and no
//      brand at all.
//
// HOW THE TEST DATA IS BUILT, AND WHY NOTHING IS IMPORTED TO BUILD IT
//   All data is declared inline in this file. The five sibling fixture modules
//   produce price groups, products, SKUs, promotions and order views; not one
//   produces a feed-row projection, and the product fixture returns a `Product`
//   ENTITY rather than the flat projection this subject consumes. Importing one
//   would also be a compile error rather than merely redundant, because
//   `noUnusedLocals` rejects an unused import.
//
//   The factory pattern follows meta/tests/unit/Helper.cfc as a PATTERN and
//   rejects its MECHANISM entirely. What is carried over is the shape: one named
//   local factory returning a ready subject built from obviously-fake defaults,
//   with per-case overrides - the legacy used `productName="Test Product"` and
//   `productCode="TESTPRODUCTXXX"`, and the fake values below are equally
//   unmistakable. What is rejected is everything it did to get there: it created
//   a live persistent object, reached a service through the ambient request-scope
//   locator, wrote to the database and flushed the session, so its "unit" test
//   booted the whole application. None of that happens here.
//
// TEST DATA IS DECLARED INLINE. No sibling fixture produces a feed-row projection (the product
// fixture returns a `Product` ENTITY), and `noUnusedLocals` rejects an unused import. The factory
// follows meta/tests/unit/Helper.cfc as a PATTERN and rejects its MECHANISM: carried over is one
// named local factory returning a ready subject from obviously-fake defaults with per-case
// overrides - the legacy used `productName="Test Product"` and `productCode="TESTPRODUCTXXX"` -
// while rejected is creating a live persistent object, reaching a service through the ambient
// request-scope locator, writing to the database and flushing the session. At
// [meta/tests/unit/Helper.cfc:L53] its `productData` struct is declared without `var` and leaks out
// of the function; that is harness hygiene, not a preserved business-logic defect, so every binding
// below is a `const`. The legacy wrote `price = 100` as a raw number; every monetary literal here
// is a decimal STRING handed to `Money.fromDecimalString`.
//
// TWO preserved defects are pinned, each carrying its marker at the assertion: the empty
// `g:google_product_category` element [integrationServices/google/views/feed/product.cfm:L20] and
// the unguarded `g:shipping_weight` element [.../product.cfm:L58].
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderGoogleProductFeed } from '../../../../src/integrations/google/rssFeedRenderer.js';
import type { GoogleProductFeedRow } from '../../../../src/integrations/google/googleFeedRepository.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
// Imported so the anti-divergence case can assert the SHARED grammar directly, rather than only
// through the renderer that consumes it.
import { parseHostAuthority } from '../../../../src/lib/config.js';

// Three specifiers, and the list is exhaustive. An intervening revision made it four by importing
// a `FeedUrlScheme` type from `src/lib/config.js`; that type no longer exists and the subject reads
// no configuration, so the config module is once again absent from this list - see {@link FEED_ORIGIN}.
//
// `GoogleProductFeedRow` is imported TYPE-ONLY from the repository module that declares it, never
// redeclared here: that module owns the projection shape, and a structurally similar local copy
// would drift from it silently. `Money` is imported for its VALUE because monetary test data has to
// be constructed, and `Money.fromDecimalString` is the only way to construct it.
//
// Nothing else is imported. A pure function configures nothing, is entered through no handler and
// opens no connection, so no settings port, config module, handler, driver or connection module
// appears; the escaping and the ISO 8601 timestamps are asserted as literal strings, needing no
// XML, templating or date package; and there is no barrel, one exported unit per file being
// imported directly.
//
// A note on enforcement: the ESLint `no-restricted-imports` layer boundary is scoped to
// `src/domain/**`, so it would not catch a bad import in a test file. The barrel ban does apply
// here; the rest of the list is held by discipline.

// ---------------------------------------------------------------------------
// Test data
//
// Every literal below is obviously fake, and the two instants are explicit UTC ISO 8601 string
// literals. Nothing reads a clock: the subject takes the range-start instant as an argument
// precisely so its output is deterministic, and there is no no-argument `Date` construction
// anywhere in this file.
// ---------------------------------------------------------------------------

/**
 * The feed host, passed purely as a STRING INPUT.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, which is the point: the subject writes
 * this value into five element bodies and dereferences none of them. One case below asserts the
 * absence of any network call directly.
 *
 * ★ THE FORM MATTERS AS WELL AS THE VALUE. This is a bare authority - no scheme, no
 * userinfo, no path, no query, no fragment and no surrounding whitespace - because that is
 * the only shape THIS FUNCTION accepts: `assertFeedHostShape` refuses every other shape
 * before an origin is composed, and it refuses by throwing rather than by escaping.
 *
 * ★★ THIS PARAGRAPH ONCE ATTRIBUTED THAT REFUSAL TO A `toTrustedFeedHost` ALLOW-LIST MINT
 * IN `src/integrations/google/googleFeedService.ts`, AND NO SUCH SYMBOL EXISTS. The mint was
 * part of an unplanned host-policy subsystem in the feed service and has been withdrawn -
 * that module's authority excludes an allow-list by name and assigns authorization to an API
 * Gateway owned outside this subtree. Nothing was lost from this file, which is the whole
 * reason the withdrawal was safe: the grammar was always enforced here as well, so the
 * service was never the only guard, and the shape check simply stopped being duplicated.
 *
 * What the withdrawal does leave unowned is PROVENANCE. A shape check cannot tell a
 * configured authority from an attacker's, so supplying a CONFIGURED host is an obligation on
 * the composition root, stated there and on this function's parameter.
 */
const FEED_HOST = 'feed.example.invalid';

/**
 * The origin the subject composes, and the scheme half of it is NOT a variable of this suite.
 *
 * ★★ THE `http://` PREFIX IS THE SUBJECT'S OWN FROZEN LITERAL, so every `http://` assertion in
 * this file is asserting BYTE-FOR-BYTE LEGACY PARITY with
 * [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24].
 *
 * An intervening revision made the scheme a required PARAMETER of the subject - accepting
 * security finding S-09, CWE-319 - and this file then carried a `FEED_SCHEME: FeedUrlScheme`
 * constant pinned to `'http'` so those parity assertions would keep holding, plus a trailing
 * block that rendered the same rows under both schemes. The parameter is removed and so are
 * both, because AAP 0.1.1 and 0.8.1 freeze the product-feed contract and AAP 0.6.7 admits no
 * fourth divergence. The trailing block's inversion is at the end of this file.
 */
const FEED_ORIGIN = `http://${FEED_HOST}`;

/**
 * The image path the data-access half substitutes when a SKU or product image row
 * carries no usable file name.
 *
 * This is a real value rather than a placeholder, and it is spelled out here rather
 * than imported because the producing constant is module-private to
 * `src/integrations/google/googleFeedRepository.ts`. Restating the literal is the
 * point: it pins the exact documented default of the legacy setting
 * [model/service/SettingService.cfc:L184], which the substitution cascade at
 * [model/service/ImageService.cfc:L82-L90] falls through to. A drift in either place
 * fails a case in this suite.
 *
 * The renderer never produces this value and never inspects it; it interpolates
 * whatever path it is handed. That is why the suite can name it without the subject
 * knowing it exists.
 */
const MISSING_IMAGE_PATH = '/assets/images/missingimage.jpg';

/**
 * The explicit range-start instant, standing in for the legacy's two `now()`
 * calls at [integrationServices/google/views/feed/product.cfm:L30].
 *
 * Deliberately in the past and carrying a sub-second component, so the second-precision truncation
 * is observable rather than accidental.
 */
const RANGE_START_INSTANT = new Date('2024-06-01T12:34:56.789Z');

/** How the subject renders {@link RANGE_START_INSTANT}: UTC, seconds, `Z`. */
const RANGE_START_RENDERED = '2024-06-01T12:34:56Z';

/** The pre-resolved sale-price expiration instant that closes the range. */
const SALE_EXPIRATION_INSTANT = new Date('2024-12-31T23:59:59.000Z');

/** How the subject renders {@link SALE_EXPIRATION_INSTANT}. */
const SALE_EXPIRATION_RENDERED = '2024-12-31T23:59:59Z';

/** The exact `<item>` opening line, indentation included. */
const ITEM_OPEN_LINE = '    <item>';

/** The exact `<item>` closing line, indentation included. */
const ITEM_CLOSE_LINE = '    </item>';

/** The namespace URI bound to the `g` prefix by the root element. */
const GOOGLE_NAMESPACE_URI = 'http://base.google.com/ns/1.0';

/**
 * One feed row, with EVERY key present.
 *
 * Completeness is not a stylistic choice: the projection declares all twenty-three
 * fields REQUIRED, several of them with a type that admits absence, so a factory
 * that omitted a key would not compile - see finding 1 in the header. Overrides
 * replace individual fields, and passing `undefined` for one of the
 * absence-admitting fields is how a case says "this row has no such value".
 *
 * ★ THE COUNT WAS TWENTY-TWO. `brandID` IS THE TWENTY-THIRD, AND `imageLinkPath`
 * NO LONGER ADMITS ABSENCE. The brand element is gated on brand PRESENCE and carries
 * the nullable name as its body [integrationServices/google/views/feed/product.cfm:L32],
 * which needs two members rather than one; and the image path is always resolved
 * upstream now, because the legacy image resolver's chain ends in an unconditional
 * else [model/service/ImageService.cfc:L88] and therefore never produced nothing.
 *
 * The default row is deliberately ORDINARY rather than minimal. Its product-type representation
 * carries ` &raquo; ` because `ProductType` builds its breadcrumb with that literal HTML entity
 * [model/entity/ProductType.cfc:L273-L278].
 */
function makeFeedRow(overrides: Partial<GoogleProductFeedRow> = {}): GoogleProductFeedRow {
  return {
    skuID: 'fake-sku-id-1',
    productID: 'fake-product-id-1',
    skuCode: 'FAKE-SKU-1',
    calculatedTitle: 'Fake Product Title',
    productDescription: 'Fake product description.',
    productTypeDescription: 'Fake product type description.',
    productTypeSimpleRepresentation: 'Fake Root &raquo; Fake Leaf',
    productUrlPath: '/fake-url-key/fake-product-url-title/',
    imageLinkPath: '/fake-image-base/product/default/fake-sku-image.jpg',
    additionalImageLinkPaths: [],
    productPrice: Money.fromDecimalString('24.5'),
    skuPrice: Money.fromDecimalString('19.99'),
    skuSalePrice: undefined,
    salePriceExpirationDateTime: undefined,
    // The default row HAS a brand, so the presence key is populated and the name is what
    // goes in the element. The two are separate fields because the legacy guard tests
    // the association [integrationServices/google/views/feed/product.cfm:L32] while
    // the body interpolates the name, and a brand with a null name is a real state.
    // `brandID` carries `SwBrand.brandID` as the LEFT join resolved it, which is the
    // gate; `brandName` is only the body.
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
 * One feed row that emits ALL SIXTEEN elements, which the default row does not.
 *
 * Three of the sixteen are conditional: exactly ONE additional image path (element 8 is the only
 * repeatable element, and one occurrence keeps the emitted sequence exactly sixteen entries long),
 * a sale price strictly below the SKU price together with an expiration instant (elements 12 and 13
 * share one gate), and a brand name (element 14, independently gated).
 */
function makeFullyPopulatedFeedRow(
  overrides: Partial<GoogleProductFeedRow> = {},
): GoogleProductFeedRow {
  return makeFeedRow({
    additionalImageLinkPaths: ['/fake-image-base/product/fake-additional-1.jpg'],
    skuSalePrice: Money.fromDecimalString('9.5'),
    salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Rendering and reading helpers
//
// Two invocation helpers so the fixed host and instant are stated once, and readers that pull
// structure back out of the returned document. Every reader THROWS a diagnostic on a shape it
// cannot read, and none uses a non-null assertion: an indexed read answers `T | undefined` under
// `noUncheckedIndexedAccess`.
// ---------------------------------------------------------------------------

/** Renders a whole document from the given rows, with the fixed host and instant. */
function renderDocument(rows: readonly GoogleProductFeedRow[]): string {
  return renderGoogleProductFeed(rows, FEED_HOST, RANGE_START_INSTANT);
}

/** Renders a single-item document from one ordinary row plus overrides. */
function renderOneRow(overrides: Partial<GoogleProductFeedRow> = {}): string {
  return renderDocument([makeFeedRow(overrides)]);
}

/** The document split into physical lines. */
function documentLines(document: string): readonly string[] {
  return document.split('\n');
}

/**
 * The children of the first `<item>`, each with its leading indentation removed.
 *
 * Trailing whitespace is left untouched on purpose: the lone separating space inside an empty
 * `g:shipping_weight` body is a preserved defect, and trimming both ends would erase what one case
 * exists to pin.
 */
function itemChildren(document: string): readonly string[] {
  const lines = documentLines(document);
  const openIndex = lines.indexOf(ITEM_OPEN_LINE);
  const closeIndex = lines.indexOf(ITEM_CLOSE_LINE);

  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    throw new Error(
      'the rendered document holds no complete <item> element at the expected indentation, so ' +
        'there are no item children to read',
    );
  }

  return lines.slice(openIndex + 1, closeIndex).map((line) => line.trimStart());
}

/**
 * The element name of one emitted child, read from its opening tag.
 *
 * Safe against element bodies because every interpolated value is escaped before emission, so no
 * raw `>` can appear inside one.
 */
function elementName(element: string): string {
  const closeAngleIndex = element.indexOf('>');

  if (!element.startsWith('<') || closeAngleIndex < 2) {
    throw new Error(`this is not an element with a readable opening tag: ${element}`);
  }

  return element.slice(1, closeAngleIndex);
}

/** The emitted element names of the first `<item>`, in the order they appear. */
function itemElementNames(document: string): readonly string[] {
  return itemChildren(document).map(elementName);
}

/**
 * The body of one named element inside the first `<item>`.
 *
 * Matched on the exact opening and closing tags, which keeps `g:shipping_weight` and the
 * never-emitted `g:shipping` distinguishable and keeps the item's own `link` distinct from the
 * channel's.
 */
function itemElementBody(document: string, name: string): string {
  const openTag = `<${name}>`;
  const closeTag = `</${name}>`;
  const element = itemChildren(document).find(
    (child) => child.startsWith(openTag) && child.endsWith(closeTag),
  );

  if (element === undefined) {
    throw new Error(`the rendered item emits no <${name}> element, so it has no body to read`);
  }

  return element.slice(openTag.length, element.length - closeTag.length);
}

/** Every emitted occurrence of one named element inside the first `<item>`. */
function itemElementsNamed(document: string, name: string): readonly string[] {
  return itemChildren(document).filter((child) => elementName(child) === name);
}

/** How many times a literal appears in the document. */
function occurrenceCount(document: string, literal: string): number {
  return document.split(literal).length - 1;
}

/**
 * Every absolute URL the document contains.
 *
 * The pattern is built inside the function rather than hoisted: a global regular expression carries
 * a mutable `lastIndex`, and this file holds no mutable module-scope state.
 */
function absoluteUrls(document: string): readonly string[] {
  return document.match(/https?:\/\/[^\s<"]+/g) ?? [];
}

afterEach(() => {
  // The runner and the shared setup file both restore mocks between cases; the one spy this suite
  // installs is still torn down explicitly here so its lifetime is visible.
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. The document shell
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - the document shell', () => {
  it('opens with a version-only XML declaration, with no encoding and no byte-order mark', () => {
    const document = renderOneRow();

    // CFML parity [integrationServices/google/views/feed/product.cfm:L1]: the template declares the
    // version and nothing else - no `encoding` or `standalone` pseudo-attribute and no byte-order
    // mark ahead of it. A document with no encoding declaration is UTF-8 by the XML specification.
    expect(documentLines(document)[0]).toBe('<?xml version="1.0"?>');
    expect(document.startsWith('<?xml version="1.0"?>')).toBe(true);
    expect(document.startsWith('\uFEFF')).toBe(false);
    expect(document).not.toContain('encoding');
    expect(document).not.toContain('standalone');
  });

  it('binds the Google namespace to the g prefix over the http scheme', () => {
    const document = renderOneRow();

    // CFML parity [integrationServices/google/views/feed/product.cfm:L11]: the namespace URI is an
    // IDENTIFIER binding a vocabulary, not an address this service dereferences, so it is
    // reproduced character for character including its `http` scheme. One changed character binds a
    // different namespace and invalidates every `g:`-qualified element.
    expect(documentLines(document)[1]).toBe(
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    );
    expect(document).not.toContain('https://');
  });

  it('emits the channel and its three children in the template order', () => {
    const document = renderOneRow();

    // CFML parity [integrationServices/google/views/feed/product.cfm:L12-L15]: channel, title,
    // link, description - and the title is a hardcoded literal rather than a configurable or
    // translated value.
    expect(documentLines(document).slice(0, 6)).toEqual([
      '<?xml version="1.0"?>',
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
      '  <channel>',
      '    <title>Slatwall Product Feed</title>',
      `    <link>${FEED_ORIGIN}</link>`,
      `    <description>Google Product Feed for ${FEED_ORIGIN}</description>`,
    ]);
  });

  it('closes the channel and the root element, and ends at the root close tag', () => {
    const document = renderOneRow();

    // CFML parity [integrationServices/google/views/feed/product.cfm:L64-L65]: trailing whitespace
    // outside the root element is insignificant, so the returned string ends exactly at the closing
    // tag.
    expect(documentLines(document).slice(-2)).toEqual(['  </channel>', '</rss>']);
    expect(document.endsWith('</rss>')).toBe(true);
    expect(document).toBe(document.trimEnd());
  });

  it('never self-closes an element, not even an empty one', () => {
    const document = renderOneRow({
      productDescription: undefined,
      productTypeDescription: undefined,
      productPrice: undefined,
      skuCode: undefined,
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L19-L20]: the template writes
    // an open/close pair at every site, including the unconditionally empty one, so an absent value
    // yields an empty BODY, not a collapsed tag.
    expect(document).not.toContain('/>');
    expect(itemChildren(document)).toContain('<description></description>');
    expect(itemChildren(document)).toContain('<g:price></g:price>');
    expect(itemChildren(document)).toContain('<g:id></g:id>');
  });
});

// ---------------------------------------------------------------------------
// 2. A zero-row feed
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - a feed with no qualifying rows', () => {
  it('renders a complete, well-formed document with an empty channel body', () => {
    const document = renderDocument([]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L16, L63]: a `<cfloop>` over
    // an empty record set emits nothing between the channel's three children and its closing tag.
    // An empty selection is an ordinary outcome of the feed's four filters, so the wrapper is never
    // omitted.
    expect(documentLines(document)).toEqual([
      '<?xml version="1.0"?>',
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
      '  <channel>',
      '    <title>Slatwall Product Feed</title>',
      `    <link>${FEED_ORIGIN}</link>`,
      `    <description>Google Product Feed for ${FEED_ORIGIN}</description>`,
      '  </channel>',
      '</rss>',
    ]);
  });

  it('emits no item element and no item-only element at all', () => {
    const document = renderDocument([]);

    expect(document).not.toContain('<item>');
    expect(document).not.toContain('</item>');
    expect(document).not.toContain('<g:id>');
    expect(document).not.toContain('<g:google_product_category>');
    expect(document).not.toContain('<g:shipping_weight>');
  });

  it('emits one item per row and preserves the order the caller supplied', () => {
    const document = renderDocument([
      makeFeedRow({ skuCode: 'FAKE-SKU-FIRST' }),
      makeFeedRow({ skuCode: 'FAKE-SKU-SECOND' }),
      makeFeedRow({ skuCode: 'FAKE-SKU-THIRD' }),
    ]);

    // JUDGMENT CALL: row ORDER is the caller's and the renderer imposes none of its own. The legacy
    // selection applies no ordering at all, so sorting here would add behaviour the legacy never
    // had.
    expect(occurrenceCount(document, '<item>')).toBe(3);
    expect(occurrenceCount(document, '</item>')).toBe(3);
    expect(document.indexOf('FAKE-SKU-FIRST')).toBeLessThan(document.indexOf('FAKE-SKU-SECOND'));
    expect(document.indexOf('FAKE-SKU-SECOND')).toBeLessThan(document.indexOf('FAKE-SKU-THIRD'));
  });
});

// ---------------------------------------------------------------------------
// 3. The sixteen-element order table
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - the per-item element order', () => {
  /**
   * The emitted element order, mapped to the template line each one comes from:
   *
   *    1  g:id                        L17  sku code
   *    2  title                       L18  product calculated title
   *    3  description                 L19  fallback chain, ALWAYS emitted
   *    4  g:google_product_category   L20  empty - a preserved defect
   *    5  g:product_type              L21  product type simple representation
   *    6  link                        L22  scheme + host + product path
   *    7  g:image_link                L23  scheme + host + image path
   *    8  g:additional_image_link     L24  zero or more, one per product image
   *    9  g:condition                 L25  the literal `new`
   *   10  g:availability              L26  the literal `in stock`
   *   11  g:price                     L27  the PRODUCT's price
   *   12  g:sale_price                L29  gated by the L28 comparison
   *   13  g:sale_price_effective_date L30  gated by the same L28 comparison
   *   14  g:brand                     L32  independently gated
   *   15  g:item_group_id             L39  product code
   *   16  g:shipping_weight           L58  weight and unit, space-separated
   */
  const ITEM_ELEMENT_ORDER: readonly string[] = [
    'g:id',
    'title',
    'description',
    'g:google_product_category',
    'g:product_type',
    'link',
    'g:image_link',
    'g:additional_image_link',
    'g:condition',
    'g:availability',
    'g:price',
    'g:sale_price',
    'g:sale_price_effective_date',
    'g:brand',
    'g:item_group_id',
    'g:shipping_weight',
  ];

  it('emits all sixteen elements in exactly the template sequence', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // Element ORDER is contractual, so this is one exact sequence rather than sixteen independent
    // containment checks: a reordering that kept every element would pass the latter and fail this.
    expect(itemElementNames(document)).toEqual(ITEM_ELEMENT_ORDER);
  });

  it('emits each element body from the field the template read', () => {
    const row = makeFullyPopulatedFeedRow();
    const document = renderDocument([row]);

    expect(itemElementBody(document, 'g:id')).toBe('FAKE-SKU-1');
    expect(itemElementBody(document, 'title')).toBe('Fake Product Title');
    expect(itemElementBody(document, 'description')).toBe('Fake product description.');
    expect(itemElementBody(document, 'g:product_type')).toBe('Fake Root &amp;raquo; Fake Leaf');
    expect(itemElementBody(document, 'link')).toBe(
      `${FEED_ORIGIN}/fake-url-key/fake-product-url-title/`,
    );
    expect(itemElementBody(document, 'g:image_link')).toBe(
      `${FEED_ORIGIN}/fake-image-base/product/default/fake-sku-image.jpg`,
    );
    expect(itemElementBody(document, 'g:additional_image_link')).toBe(
      `${FEED_ORIGIN}/fake-image-base/product/fake-additional-1.jpg`,
    );
    expect(itemElementBody(document, 'g:item_group_id')).toBe('FAKE-PRODUCT-1');
  });

  it('indents the item element and its children beneath the channel', () => {
    const document = renderDocument([makeFeedRow()]);
    const lines = documentLines(document);

    // JUDGMENT CALL: whitespace BETWEEN elements is insignificant to XML and is NOT part of the
    // contract - the template indented with tabs, the port indents with two spaces per level. The
    // nesting DEPTH is asserted anyway because it is cheap to hold.
    expect(lines).toContain(ITEM_OPEN_LINE);
    expect(lines).toContain(ITEM_CLOSE_LINE);
    expect(lines).toContain('      <g:condition>new</g:condition>');
  });

  it('omits element eight entirely when the product has no additional images', () => {
    const document = renderOneRow({ additionalImageLinkPaths: [] });

    // The absent element leaves NO placeholder and NO empty element behind, and the fifteen that
    // remain keep their relative order.
    expect(itemElementsNamed(document, 'g:additional_image_link')).toEqual([]);
    expect(document).not.toContain('g:additional_image_link');
    expect(itemElementNames(document)).toEqual([
      'g:id',
      'title',
      'description',
      'g:google_product_category',
      'g:product_type',
      'link',
      'g:image_link',
      'g:condition',
      'g:availability',
      'g:price',
      'g:brand',
      'g:item_group_id',
      'g:shipping_weight',
    ]);
  });

  it('repeats element eight once per additional image, in the supplied order', () => {
    const document = renderOneRow({
      additionalImageLinkPaths: [
        '/fake-image-base/product/fake-additional-1.jpg',
        '/fake-image-base/product/fake-additional-2.jpg',
        '/fake-image-base/product/fake-additional-3.jpg',
      ],
    });

    expect(itemElementsNamed(document, 'g:additional_image_link')).toEqual([
      `<g:additional_image_link>${FEED_ORIGIN}/fake-image-base/product/fake-additional-1.jpg</g:additional_image_link>`,
      `<g:additional_image_link>${FEED_ORIGIN}/fake-image-base/product/fake-additional-2.jpg</g:additional_image_link>`,
      `<g:additional_image_link>${FEED_ORIGIN}/fake-image-base/product/fake-additional-3.jpg</g:additional_image_link>`,
    ]);
  });

  it('leaves the origin in place when the product path is absent', () => {
    const document = renderOneRow({ productUrlPath: undefined });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L22]: the host
    // and the path are two interpolations inside ONE literal string, and CFML
    // stringifies an absent path to nothing, so the element body collapses to the
    // origin rather than disappearing.
    //
    // ★ THIS CASE ONCE ABSENTED `imageLinkPath` ALONGSIDE THE PRODUCT PATH, AND
    // ASSERTED THE IMAGE ELEMENT COLLAPSED TO A BARE ORIGIN TOO. The parity argument
    // holds for the product path and only for it: `getProductURL()` genuinely
    // interpolates an unset URL title [model/entity/Product.cfc:L207-L209], so an
    // absent path there is a real legacy outcome. The image path was never absent -
    // the resolver the view calls ends its chain in an unconditional else
    // [model/service/ImageService.cfc:L88] - so a bare origin as an image address was
    // this port's own invention. `imageLinkPath` is required now and the fallback is
    // resolved upstream, which is why absenting it here would no longer compile.
    expect(itemElementBody(document, 'link')).toBe(FEED_ORIGIN);
  });

  it('renders a fallback additional-image path as an ordinary element, skipping nothing', () => {
    // The data-access half substitutes the missing-image path per unusable image ROW
    // rather than dropping the row, because the legacy loop emitted one element per row
    // [integrationServices/google/views/feed/product.cfm:L24]. The renderer must treat
    // such a path as any other - it has no way to recognise it and no reason to.
    const document = renderOneRow({
      additionalImageLinkPaths: [
        MISSING_IMAGE_PATH,
        '/fake-image-base/product/fake-usable.jpg',
        MISSING_IMAGE_PATH,
      ],
    });

    expect(itemElementsNamed(document, 'g:additional_image_link')).toEqual([
      `<g:additional_image_link>${FEED_ORIGIN}${MISSING_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${FEED_ORIGIN}/fake-image-base/product/fake-usable.jpg</g:additional_image_link>`,
      `<g:additional_image_link>${FEED_ORIGIN}${MISSING_IMAGE_PATH}</g:additional_image_link>`,
    ]);
  });

  it('never emits a bare origin as an image address, because an image path always resolves', () => {
    // This case previously asserted that `g:image_link` collapses to the origin when
    // `imageLinkPath` is absent, and that assertion rested on a premise that is no
    // longer true: the projection field is now `string` rather than `string |
    // undefined`, because the legacy accessor it stands for is declared
    // `returntype="string"` [model/entity/Sku.cfc:L192] and the missing-image
    // substitution ends in an unconditional else [model/service/ImageService.cfc:L82-L88]
    // rather than yielding nothing. The case is inverted rather than deleted.
    const document = renderOneRow();

    // The required member is the guarantee, and this pins the observable half of it:
    // whatever the row carries, the image element has a path after the origin.
    expect(itemElementBody(document, 'g:image_link')).not.toBe(FEED_ORIGIN);
    expect(itemElementBody(document, 'g:image_link')).toBe(
      `${FEED_ORIGIN}/fake-image-base/product/default/fake-sku-image.jpg`,
    );
  });

  it('renders the missing-image fallback like any other path, never as a bare origin', () => {
    // The absent-image ROW is still exercised - it is the case the earlier assertion was
    // about - but the expectation now pins the fallback the source actually produced.
    const document = renderOneRow({ imageLinkPath: MISSING_IMAGE_PATH });

    expect(itemElementBody(document, 'g:image_link')).toBe(`${FEED_ORIGIN}${MISSING_IMAGE_PATH}`);
    expect(itemElementBody(document, 'g:image_link')).not.toBe(FEED_ORIGIN);
  });
});

// ---------------------------------------------------------------------------
// 4. The description fallback chain
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - element 3, the description fallback', () => {
  it('prefers the product description when it has length', () => {
    const document = renderOneRow({
      productDescription: 'Fake product description.',
      productTypeDescription: 'Fake product type description.',
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L19]: the first branch is
    // `len(product.getProductDescription())`, so the product's own description wins whenever it has
    // characters.
    expect(itemElementBody(document, 'description')).toBe('Fake product description.');
  });

  it('falls back to the product type description when the product has none', () => {
    const document = renderOneRow({
      productDescription: undefined,
      productTypeDescription: 'Fake product type description.',
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L19]: the `<cfelseif>` branch
    // is `len(productType.getProductTypeDescription())`.
    expect(itemElementBody(document, 'description')).toBe('Fake product type description.');
  });

  it('treats an empty product description as no description and falls through', () => {
    const document = renderOneRow({
      productDescription: '',
      productTypeDescription: 'Fake product type description.',
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L19]: both gates are `len()`
    // truthiness, which counts characters. An empty string has none, so it fails the first gate
    // exactly as an absent value does.
    expect(itemElementBody(document, 'description')).toBe('Fake product type description.');
  });

  it('emits an empty description element when neither candidate has length', () => {
    const document = renderOneRow({
      productDescription: undefined,
      productTypeDescription: undefined,
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L19]: the
    // `<cfif>`/`<cfelseif>` pair has NO final `<cfelse>`, and the element itself is emitted
    // unconditionally OUTSIDE the conditional. The third outcome is a PRESENT element with an EMPTY
    // body.
    expect(itemElementBody(document, 'description')).toBe('');
    expect(itemChildren(document)).toContain('<description></description>');
    expect(itemElementNames(document)).toContain('description');
  });

  it('emits an empty description element when both candidates are empty strings', () => {
    const document = renderOneRow({ productDescription: '', productTypeDescription: '' });

    expect(itemChildren(document)).toContain('<description></description>');
  });
});

// ---------------------------------------------------------------------------
// 5. The two hardcoded literals
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - elements 9 and 10, the hardcoded literals', () => {
  it('emits condition and availability as unconditional literals for every item', () => {
    const document = renderDocument([
      makeFeedRow({ skuCode: 'FAKE-SKU-FIRST', productCalculatedQATS: 1 }),
      makeFullyPopulatedFeedRow({ skuCode: 'FAKE-SKU-SECOND', productCalculatedQATS: 999 }),
    ]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L25-L26]: both bodies are
    // hardcoded literals with nothing behind them - no setting, no argument, no lookup, no per-item
    // derivation and, for availability, NO STOCK CHECK of any kind. They are preserved OUTPUT
    // rather than configuration.
    expect(occurrenceCount(document, '<g:condition>new</g:condition>')).toBe(2);
    expect(occurrenceCount(document, '<g:availability>in stock</g:availability>')).toBe(2);
  });

  it('holds the literals steady no matter what the row reports about stock', () => {
    const inStockDocument = renderOneRow({ productCalculatedQATS: 250 });
    const barelyInStockDocument = renderOneRow({ productCalculatedQATS: 1 });

    expect(itemElementBody(inStockDocument, 'g:condition')).toBe('new');
    expect(itemElementBody(inStockDocument, 'g:availability')).toBe('in stock');
    expect(itemElementBody(barelyInStockDocument, 'g:condition')).toBe('new');
    expect(itemElementBody(barelyInStockDocument, 'g:availability')).toBe('in stock');
  });
});

// ---------------------------------------------------------------------------
// 6. Element 4 - the empty product category
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - element 4, the empty product category', () => {
  it('emits the product category element with an empty body, always', () => {
    const document = renderDocument([
      makeFeedRow({ skuCode: 'FAKE-SKU-FIRST' }),
      makeFullyPopulatedFeedRow({ skuCode: 'FAKE-SKU-SECOND' }),
    ]);

    // LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]:
    // g:google_product_category is emitted as an empty element - the template never supplies a
    // value from any source.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // Nothing in the legacy path can fill it: the adapter declares a `productGoogleProductType`
    // setting definition [integrationServices/google/Integration.cfc:L67-L71], but the template
    // never reads it, the controller never resolves it and no column carries it. Populating the
    // element would invent data the legacy feed never carried.
    //
    // There is NO literal TODO on L20 or near it. The TODO the shipped renderer carries beside this
    // element is therefore PORT-AUTHORED rather than carried forward, and says so itself.
    expect(
      occurrenceCount(document, '<g:google_product_category></g:google_product_category>'),
    ).toBe(2);
    expect(itemElementBody(document, 'g:google_product_category')).toBe('');
    expect(document).not.toContain('<g:google_product_category/>');
    expect(document).not.toContain('<g:google_product_category />');
  });

  it('holds the element in fourth position, between description and product type', () => {
    const document = renderOneRow();
    const names = itemElementNames(document);

    expect(names.slice(2, 5)).toEqual([
      'description',
      'g:google_product_category',
      'g:product_type',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. Element 16 - the unguarded shipping weight
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - element 16, the unguarded shipping weight', () => {
  // THE FEED'S TRUE SETTINGS DEPENDENCY IS SIX KEYS, each read with its exact default:
  //   globalURLKeyProduct        [model/service/SettingService.cfc:L178]  "sp"
  //   globalURLKeyProductType    [model/service/SettingService.cfc:L179]  "spt"
  //   skuCurrency                [model/service/SettingService.cfc:L221]  "USD"
  //   skuEligibleCurrencies      [model/service/SettingService.cfc:L222]  the
  //                                                     active-currency list
  //   skuShippingWeight          [model/service/SettingService.cfc:L232]  1
  //   skuShippingWeightUnitCode  [model/service/SettingService.cfc:L233]  "lb"
  //
  // AND ITS BINDING RECONCILIATION. The settings contract at
  // `src/domain/ports/settingsProvider.ts` is locked to a SEVEN-key union that
  // EXCLUDES both shipping-weight keys, and the port set is locked at thirteen, so
  // admitting an eighth key or adding a fourteenth port would be a scope
  // violation. That contract is therefore NOT extended, NOT reshaped and NOT
  // imported by this suite - a hard ban. Both weight values instead arrive as
  // already-resolved STRING FIELDS on the read-only projection, which is the right
  // shape anyway: a pure renderer has no business resolving configuration. The two
  // defaults above are cited as evidence of SHAPE only and neither is inlined
  // as an expected value here.
  //
  // Do not confuse `skuShippingWeightUnitCode` with `globalWeightUnitCode`
  // [model/service/SettingService.cfc:L180] - distinct keys sharing one default.

  it('emits the weight and its unit separated by one literal space - characterization A', () => {
    // Default-path characterization: the legacy defaults stringify as `1` and `lb`, so the body is
    // `1 lb`.
    const document = renderOneRow({ skuShippingWeight: '1', skuShippingWeightUnitCode: 'lb' });

    // LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L58]: g:shipping_weight is
    // emitted with no guard and a hardcoded literal space between its two interpolations.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // The weight and the unit are a NON-MONETARY measure, so they stay plain strings - never
    // wrapped in the money value object, never parsed and never arithmetically combined.
    expect(itemElementBody(document, 'g:shipping_weight')).toBe('1 lb');
    expect(itemChildren(document)).toContain('<g:shipping_weight>1 lb</g:shipping_weight>');
  });

  it('still emits the element and the lone separating space when both values are empty', () => {
    // Characterization B, and the sharp one. The element is UNGUARDED, so an empty weight and an
    // empty unit do not suppress it: the hardcoded space survives on its own and the body is a
    // single space character.
    const document = renderOneRow({ skuShippingWeight: '', skuShippingWeightUnitCode: '' });

    expect(itemElementBody(document, 'g:shipping_weight')).toBe(' ');
    expect(itemChildren(document)).toContain('<g:shipping_weight> </g:shipping_weight>');
    expect(itemElementNames(document)).toContain('g:shipping_weight');
    expect(document).not.toContain('<g:shipping_weight></g:shipping_weight>');
  });

  it('keeps the separating space when only one of the two values is empty', () => {
    const noUnitDocument = renderOneRow({
      skuShippingWeight: '2.5',
      skuShippingWeightUnitCode: '',
    });
    const noWeightDocument = renderOneRow({
      skuShippingWeight: '',
      skuShippingWeightUnitCode: 'kg',
    });

    expect(itemElementBody(noUnitDocument, 'g:shipping_weight')).toBe('2.5 ');
    expect(itemElementBody(noWeightDocument, 'g:shipping_weight')).toBe(' kg');
  });

  it('emits the weight verbatim as a string, without renormalising it as a number', () => {
    const document = renderOneRow({
      skuShippingWeight: '3.500',
      skuShippingWeightUnitCode: 'fakeunit',
    });

    // A number would have rendered `3.5`. The projection carries a string and the renderer emits it
    // unchanged, keeping a non-money measure out of the money path.
    expect(itemElementBody(document, 'g:shipping_weight')).toBe('3.500 fakeunit');
  });

  it('emits the weight element last, after the item group id', () => {
    const document = renderOneRow();
    const names = itemElementNames(document);

    expect(names.slice(-2)).toEqual(['g:item_group_id', 'g:shipping_weight']);
  });
});

// ---------------------------------------------------------------------------
// 8. The five-entity XML escaper
//
// WHAT THE LEGACY DID, MEASURED RATHER THAN ASSUMED. The template applies `htmlEditFormat()` at
// exactly SIX SITES, seven calls in total: `g:id`
// [integrationServices/google/views/feed/product.cfm:L17], `title` [L18], BOTH branches of
// `description` [L19], `g:product_type` [L21], `g:brand` [L32] and `g:item_group_id` [L39]. It
// applies it at NONE of eight others: the channel link and description [L14-L15], the item link
// [L22], `g:image_link` [L23], each `g:additional_image_link` [L24], `g:price` [L27],
// `g:sale_price` [L29], `g:sale_price_effective_date` [L30] and `g:shipping_weight` [L58]. And
// `htmlEditFormat` covers only FOUR entities - `&`, `<`, `>` and `"` - leaving the apostrophe
// alone.
//
// JUDGMENT CALL: the port escapes ALL emitted text UNIFORMLY through all five predefined XML
// entities - a HARDENING, recorded as a correction rather than as parity at the eight bare sites.
// The strongest evidence sits in the one value the legacy DID escape: the product-type breadcrumb
// carries the literal HTML entity ` &raquo; ` by construction
// [model/entity/ProductType.cfc:L273-L278], and `&raquo;` is not a predefined XML entity.
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - the five-entity XML escaper', () => {
  it('escapes all five predefined entities in one value simultaneously', () => {
    const document = renderOneRow({
      calculatedTitle: `Bolt & Nut <heavy> "grade A" 'special'`,
    });

    expect(itemElementBody(document, 'title')).toBe(
      'Bolt &amp; Nut &lt;heavy&gt; &quot;grade A&quot; &apos;special&apos;',
    );
  });

  it('escapes the ampersand FIRST, so no later replacement is escaped twice', () => {
    // The order is the correctness argument. `&` is replaced before any replacement that introduces
    // an entity of its own, so a bare `<` becomes `&lt;` and never `&amp;lt;`.
    const document = renderOneRow({ calculatedTitle: '<less' });

    expect(itemElementBody(document, 'title')).toBe('&lt;less');
    expect(itemElementBody(document, 'title')).not.toContain('&amp;lt;');
  });

  it('applies exactly one level of escaping to text that already looks escaped', () => {
    // Input text that reads as an entity is treated as ordinary characters: its ampersand is
    // escaped once and the rest untouched. A second pass would have produced `&amp;amp;lt;`.
    const document = renderOneRow({ calculatedTitle: '&lt;' });

    expect(itemElementBody(document, 'title')).toBe('&amp;lt;');
    expect(itemElementBody(document, 'title')).not.toContain('&amp;amp;');
  });

  it('escapes the HTML entity the product-type breadcrumb carries by construction', () => {
    const document = renderOneRow({
      productTypeSimpleRepresentation: 'Fake Root &raquo; Fake Branch &raquo; Fake Leaf',
    });

    expect(itemElementBody(document, 'g:product_type')).toBe(
      'Fake Root &amp;raquo; Fake Branch &amp;raquo; Fake Leaf',
    );
  });

  it('escapes every text-bearing element, including the eight the legacy left bare', () => {
    const document = renderGoogleProductFeed(
      [
        makeFullyPopulatedFeedRow({
          skuCode: 'SKU&1',
          calculatedTitle: 'Title&1',
          productDescription: 'Description&1',
          productTypeSimpleRepresentation: 'Type&1',
          productUrlPath: '/fake-url-key/fake-title/?variant=a&size=b',
          imageLinkPath: '/fake-image-base/fake.jpg?w=100&h=200',
          additionalImageLinkPaths: ['/fake-image-base/fake-additional.jpg?w=50&h=60'],
          brandName: 'Brand&1',
          productCode: 'PRODUCT&1',
          skuShippingWeight: '1',
          skuShippingWeightUnitCode: 'lb&oz',
        }),
      ],
      FEED_HOST,
      RANGE_START_INSTANT,
    );

    // ★★ THIS CASE ONCE SUPPLIED `'feed.example.invalid?tenant=a&locale=b'` AS THE
    // HOST, AND ASSERTED THE RESULTING `&amp;` IN ALL FIVE HOST SITES. Escaping a
    // query-bearing host is not the same thing as accepting one, and a suite that
    // demonstrates the second while testing the first BLESSES an untrusted input: a
    // host is an authority, it has no query component, and every absolute address in
    // this document is composed from it. A query-bearing host is refused OUTRIGHT now, by
    // `assertFeedHostShape` in the module under test, before any origin is composed - so
    // the shape this case used to pass cannot reach the composition at all, and the
    // refusal is pinned by the host-shape cases further down this file.
    //
    // ★ AN EARLIER REVISION ATTRIBUTED THAT REFUSAL TO A `toTrustedFeedHost` ALLOW-LIST
    // MINT IN `src/integrations/google/googleFeedService.ts`. That mint was an unplanned
    // host-policy subsystem and has been withdrawn; the refusal recorded above never
    // depended on it, because this module performs the check itself.
    //
    // The ESCAPING this case exists for is unchanged and is now carried entirely by
    // the ROW, which is where an ampersand genuinely originates: a SKU code, a title,
    // a description, a breadcrumb, a brand name, a product code, a URL title, an image
    // file name and a unit code are all free text out of the catalog.

    // The six sites the legacy escaped.
    expect(itemElementBody(document, 'g:id')).toBe('SKU&amp;1');
    expect(itemElementBody(document, 'title')).toBe('Title&amp;1');
    expect(itemElementBody(document, 'description')).toBe('Description&amp;1');
    expect(itemElementBody(document, 'g:product_type')).toBe('Type&amp;1');
    expect(itemElementBody(document, 'g:brand')).toBe('Brand&amp;1');
    expect(itemElementBody(document, 'g:item_group_id')).toBe('PRODUCT&amp;1');

    // The eight the legacy did not - hardened, and asserted so the hardening is
    // pinned rather than incidental. The ampersands reaching these sites come from the
    // PATH portions, which is where a real catalog carries them.
    expect(itemElementBody(document, 'link')).toBe(
      `${FEED_ORIGIN}/fake-url-key/fake-title/?variant=a&amp;size=b`,
    );
    expect(itemElementBody(document, 'g:image_link')).toBe(
      `${FEED_ORIGIN}/fake-image-base/fake.jpg?w=100&amp;h=200`,
    );
    expect(itemElementBody(document, 'g:additional_image_link')).toBe(
      `${FEED_ORIGIN}/fake-image-base/fake-additional.jpg?w=50&amp;h=60`,
    );
    expect(itemElementBody(document, 'g:shipping_weight')).toBe('1 lb&amp;oz');

    // THE TWO CHANNEL LINES CARRY NO AMPERSAND TO ESCAPE, AND CANNOT, and that is a
    // consequence of the origin guard rather than a gap in this test. Their only
    // variable content is the origin, and a shape-valid host is a bare host with an
    // optional port - a vocabulary that contains no `&` at all - so after
    // `assertFeedHostShape` there is nothing at either site for the escaper to act
    // on. This assertion pins the composed value instead, which is the whole of what
    // remains observable there. The escaper is still exercised at both sites by
    // construction: they route through the same `textElement` funnel as every
    // assertion above.
    expect(documentLines(document)[4]).toBe(`    <link>${FEED_ORIGIN}</link>`);
    expect(documentLines(document)[5]).toBe(
      `    <description>Google Product Feed for ${FEED_ORIGIN}</description>`,
    );

    // No bare ampersand survives anywhere, which is the property that makes the document parseable
    // at all.
    expect(document.replaceAll('&amp;', '')).not.toContain('&');
  });

  it('never escapes the literal markup it emits', () => {
    const document = renderOneRow({ calculatedTitle: 'Fake & Title' });

    // Element names, attribute names and the tags themselves are literals of this module and never
    // routed through the escaper. Only interpolated TEXT is.
    expect(document).toContain('<g:id>');
    expect(document).toContain('</g:shipping_weight>');
    expect(document).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(document).not.toContain('&lt;g:id&gt;');
    expect(document).not.toContain('&quot;2.0&quot;');
    expect(document).not.toContain('&amp;lt;');
  });
});

// ---------------------------------------------------------------------------
// 9. The price-source asymmetry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 11b. Code points XML 1.0 forbids, elided before escaping
//
// ★★★ SECURITY BOUNDARY — CWE-116 (IMPROPER ENCODING), CWE-91 (XML INJECTION), and A
// DELIBERATE DIVERGENCE FROM THE LEGACY, which is why the block carries this prose.
//
// THE DEFECT. The legacy template escaped six of its fourteen text sites with
// `htmlEditFormat` [integrationServices/google/views/feed/product.cfm] and, like the
// five-entity escaper this port replaced it with, neither pass touches CONTROL
// CHARACTERS. Escaping answers "could this byte be read as markup"; it does not
// answer "is this byte legal in an XML document at all", and those are different
// questions. XML 1.0's `Char` production admits TAB, LF and CR and then NOTHING else
// below #x20, so a single NUL, VT, FF or C0 control reaching any one of the fourteen
// sites makes the WHOLE DOCUMENT unparseable - a standards-compliant parser rejects
// it outright, which means one malformed column silently denies the entire catalog to
// Merchant Center rather than degrading one product.
//
// WHY IT IS ELIDED AND NOT REFUSED, which is the opposite disposition to the origin
// guard in block 13b, deliberately. A forbidden code point poisons ONE field of ONE
// row, so removing it keeps every other product serving; refusing would relocate the
// availability problem rather than solve it, because one bad row would still deny the
// whole feed - exactly the outcome this fix exists to prevent. A bad ORIGIN, by
// contrast, poisons every URL in the document at once, so there is no partial output
// worth emitting and refusal is right there. The two dispositions in one module are
// the design point, and each is asserted in its own block.
//
// WHY THIS IS NOT A PARITY BREAK WORTH PRESERVING. AAP 0.6.7 registers twenty legacy
// defects to reproduce and this is not among them; AAP 0.8.1's must-preserve list
// names promotion math, the resolution cascades and option-based SKU selection, none
// of which touches rendering; and the port's own escaper already carries the governing
// precedent in its docstring - hardening the eight sites the legacy left bare was "a
// correction, not a repair of behaviour anyone relied on", because no consumer can
// have depended on a document no parser would accept.
//
// WHAT IS DELIBERATELY KEPT. TAB, LF and CR are legal `Char`s and survive untouched.
// The C1 range #x7F-#x9F is legal in XML 1.0 - it is only XML 1.1 that restricts it -
// so it survives too, and that is a decision rather than an oversight: the document
// declares `version="1.0"`, and eliding bytes the declared version permits would be
// data loss with no correctness gain. A well-formed SURROGATE PAIR is legal and must
// survive; a LONE surrogate encodes nothing and is elided.
// ---------------------------------------------------------------------------

/**
 * Every code point of the document, verified against XML 1.0's `Char` production.
 *
 * ★ WHY THIS IS HAND-WRITTEN AND NOT A THIRD-PARTY PARSER. The pinned dependency set
 * holds no XML library, deliberately - AAP 0.5.1 records the renderer's counterpart
 * decision, that a dependency for one hand-rolled five-entity escaper is unjustified -
 * so adding one for a test would add a runtime the shipped artifact does not have.
 * What a compliant parser would reject the document FOR is this exact production
 * [XML 1.0 §2.2]: `#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
 * [#x10000-#x10FFFF]`. Checking the production directly is therefore the same
 * assertion a parser would make, stated in the terms the specification uses, and it
 * reports the offending code point and its index instead of a parser's line number.
 *
 * Iterating with `for...of` walks CODE POINTS rather than UTF-16 units, so a
 * well-formed surrogate pair presents as one value above #xFFFF and is accepted,
 * while a lone surrogate presents as a single value inside the forbidden gap and is
 * rejected. That distinction is the whole reason the reader is written this way.
 *
 * @throws Error naming the first offending code point, its hex value and its index.
 */
function assertXmlCharProduction(document: string): void {
  let index = 0;

  for (const character of document) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      throw new Error(`unreadable code point at index ${String(index)}`);
    }

    const permitted =
      codePoint === 0x9 ||
      codePoint === 0xa ||
      codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);

    if (!permitted) {
      throw new Error(
        `code point U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} at index ` +
          `${String(index)} is not permitted by the XML 1.0 Char production`,
      );
    }

    index += character.length;
  }
}

/**
 * A minimal well-formedness walk: every start tag is closed, in order, once.
 *
 * Not a parser and not trying to be. It reads the tag stream the renderer emits and
 * asserts that it nests, which together with {@link assertXmlCharProduction} covers
 * the two ways a document becomes unparseable: an illegal character, or unbalanced
 * markup. Text content is not inspected here - the escaper's own block covers that -
 * so a stray `<` inside a body would surface as an unmatched tag, which is exactly the
 * failure a reviewer wants to see reported.
 *
 * @throws Error on the first tag that does not nest, or if any tag is left open.
 */
function assertBalancedMarkup(document: string): void {
  const open: string[] = [];
  const tagPattern = /<(\/?)([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s[^>]*?)?(\/?)>/g;
  let match: RegExpExecArray | null = tagPattern.exec(document);

  while (match !== null) {
    const [, closingSlash, name, selfClosingSlash] = match;

    if (name === undefined) {
      throw new Error('unreadable tag name');
    }

    if (selfClosingSlash === '/') {
      // Self-closing needs no partner. This renderer emits none, which its own case
      // in the shell block asserts, so reaching here would itself be news.
      match = tagPattern.exec(document);
      continue;
    }

    if (closingSlash === '/') {
      const expected = open.pop();

      if (expected !== name) {
        throw new Error(`</${name}> closes ${expected ?? 'nothing'}`);
      }
    } else {
      open.push(name);
    }

    match = tagPattern.exec(document);
  }

  if (open.length > 0) {
    throw new Error(`unclosed: ${open.join(', ')}`);
  }
}

describe('renderGoogleProductFeed - code points XML 1.0 forbids', () => {
  /** The forbidden C0 controls, each named so a failure says which one escaped. */
  const FORBIDDEN_C0: readonly (readonly [string, string])[] = [
    ['NUL', '\u0000'],
    ['SOH', '\u0001'],
    ['BEL', '\u0007'],
    ['BS', '\u0008'],
    ['VT', '\u000B'],
    ['FF', '\u000C'],
    ['SO', '\u000E'],
    ['ESC', '\u001B'],
    ['US', '\u001F'],
  ];

  it('elides every forbidden C0 control, one at a time, naming each', () => {
    for (const [name, character] of FORBIDDEN_C0) {
      const document = renderOneRow({ calculatedTitle: `Fake${character}Title` });

      // The surrounding text survives whole - this elides the offending code point
      // and does not discard the field.
      expect(itemElementBody(document, 'title'), name).toBe('FakeTitle');
      expect(document, name).not.toContain(character);
      assertXmlCharProduction(document);
    }
  });

  it('elides the NUL that a standards-compliant parser would reject the document for', () => {
    // The runtime evidence the finding was raised on, asserted directly: a NUL used
    // to survive rendering, and the document was then unparseable.
    const document = renderOneRow({ skuCode: 'FAKE\u0000SKU' });

    expect(itemElementBody(document, 'g:id')).toBe('FAKESKU');
    expect(document).not.toContain('\u0000');
    assertXmlCharProduction(document);
    assertBalancedMarkup(document);
  });

  it('keeps tab, line feed and carriage return, which the production permits', () => {
    const document = renderOneRow({ calculatedTitle: 'a\tb\nc\rd' });

    // ★ KEPT ON PURPOSE. All three are legal `Char`s, so eliding them would be data
    // loss with no correctness gain. That the LF and CR also split the element across
    // physical lines is a consequence of the legacy's own line-oriented template and
    // is not this pass's concern: the document still parses, which is the property
    // under test.
    expect(document).toContain('a\tb\nc\rd');
    assertXmlCharProduction(document);
  });

  it('keeps the C1 range, because XML 1.0 permits it and the document declares 1.0', () => {
    const document = renderOneRow({ calculatedTitle: 'a\u007Fb\u0085c\u009Fd' });

    // ★ A DECISION, NOT AN OVERSIGHT. Only XML 1.1 restricts #x7F-#x9F, and this
    // document opens `<?xml version="1.0"?>` - asserted in the shell block - so these
    // survive.
    expect(itemElementBody(document, 'title')).toBe('a\u007Fb\u0085c\u009Fd');
    expect(documentLines(document)[0]).toBe('<?xml version="1.0"?>');
    assertXmlCharProduction(document);
  });

  it('elides the two permanently-unassigned code points at the end of the BMP', () => {
    const document = renderOneRow({ calculatedTitle: 'a\uFFFEb\uFFFFc' });

    // #xFFFE and #xFFFF fall outside `[#xE000-#xFFFD]` and are forbidden even though
    // they are not controls.
    expect(itemElementBody(document, 'title')).toBe('abc');
    assertXmlCharProduction(document);
  });

  it('keeps a well-formed surrogate pair, which encodes a legal code point', () => {
    const document = renderOneRow({ calculatedTitle: 'a\u{1F600}b' });

    // U+1F600 is inside `[#x10000-#x10FFFF]`. Eliding the pair would corrupt every
    // emoji, CJK extension and historic script a real catalog carries.
    expect(itemElementBody(document, 'title')).toBe('a\u{1F600}b');
    expect(document).toContain('\u{1F600}');
    assertXmlCharProduction(document);
  });

  it('elides a lone high surrogate but keeps the pair that follows it', () => {
    // A lone surrogate encodes nothing and sits in the forbidden #xD800-#xDFFF gap.
    // It reaches here from any column written through a lossy conversion.
    const document = renderOneRow({ calculatedTitle: `a\uD83Db\u{1F600}c` });

    expect(itemElementBody(document, 'title')).toBe('ab\u{1F600}c');
    assertXmlCharProduction(document);
  });

  it('elides a lone low surrogate, which needs the opposite lookaround to detect', () => {
    const document = renderOneRow({ calculatedTitle: 'a\uDE00b' });

    expect(itemElementBody(document, 'title')).toBe('ab');
    assertXmlCharProduction(document);
  });

  it('elides a reversed pair, which is two lone surrogates and not a pair at all', () => {
    // Low followed by high. Each half must be caught by a different rule, which is
    // why the two cannot be folded into one character class.
    const document = renderOneRow({ calculatedTitle: `a\uDE00\uD83Db` });

    expect(itemElementBody(document, 'title')).toBe('ab');
    assertXmlCharProduction(document);
  });

  it('elides before escaping, so no forbidden code point can hide inside an entity', () => {
    // ORDER MATTERS, and this pins it. The elision runs FIRST; were it to run after
    // the five replacements, a NUL adjacent to an ampersand would be carried into the
    // `&amp;` it produced and land inside an entity reference, where it is even less
    // recoverable.
    const document = renderOneRow({ calculatedTitle: 'a&\u0000b' });

    expect(itemElementBody(document, 'title')).toBe('a&amp;b');
    expect(document).not.toContain('\u0000');
    assertXmlCharProduction(document);
  });

  it('covers every externally sourced text field, not just the one it was found in', () => {
    // ★ THE FUNNEL IS THE FIX. Every interpolated body routes through one escaper, so
    // one elision pass covers all fourteen sites. This case supplies a NUL to every
    // field a repository row carries and asserts the whole document is clean - which
    // is a stronger statement than fourteen separate cases, because it would also
    // catch a fifteenth site added later that bypassed the funnel.
    const document = renderGoogleProductFeed(
      [
        makeFullyPopulatedFeedRow({
          skuCode: 'SKU\u0000A',
          calculatedTitle: 'Title\u0000A',
          productDescription: 'Description\u0000A',
          productTypeDescription: 'TypeDescription\u0000A',
          productTypeSimpleRepresentation: 'Type\u0000A',
          productUrlPath: '/url\u0000path/',
          imageLinkPath: '/image\u0000path.jpg',
          additionalImageLinkPaths: ['/additional\u0000one.jpg', '/additional\u0001two.jpg'],
          brandName: 'Brand\u0000A',
          productCode: 'PRODUCT\u0000A',
          skuShippingWeight: '1\u0000',
          skuShippingWeightUnitCode: 'lb\u0000',
        }),
      ],
      FEED_HOST,
      RANGE_START_INSTANT,
    );

    assertXmlCharProduction(document);
    assertBalancedMarkup(document);

    expect(itemElementBody(document, 'g:id')).toBe('SKUA');
    expect(itemElementBody(document, 'title')).toBe('TitleA');
    expect(itemElementBody(document, 'description')).toBe('DescriptionA');
    expect(itemElementBody(document, 'g:product_type')).toBe('TypeA');
    expect(itemElementBody(document, 'link')).toBe(`${FEED_ORIGIN}/urlpath/`);
    expect(itemElementBody(document, 'g:image_link')).toBe(`${FEED_ORIGIN}/imagepath.jpg`);
    expect(itemElementsNamed(document, 'g:additional_image_link')).toHaveLength(2);
    expect(itemElementBody(document, 'g:brand')).toBe('BrandA');
    expect(itemElementBody(document, 'g:item_group_id')).toBe('PRODUCTA');
    expect(itemElementBody(document, 'g:shipping_weight')).toBe('1 lb');
  });

  it('covers the description fallback path, which reads a different column', () => {
    // The description element has two candidate sources and the fallback is a
    // separate read, so it is exercised separately.
    const document = renderOneRow({
      productDescription: '',
      productTypeDescription: 'Type\u000Bdescription',
    });

    expect(itemElementBody(document, 'description')).toBe('Typedescription');
    assertXmlCharProduction(document);
  });

  it('renders a parseable document for a row with every value it could carry', () => {
    // The regression backstop for the block: the fully populated row, checked against
    // both properties that make a document parseable at all.
    const document = renderDocument([makeFullyPopulatedFeedRow(), makeFeedRow()]);

    assertXmlCharProduction(document);
    assertBalancedMarkup(document);
    expect(document.endsWith('</rss>')).toBe(true);
  });

  it('verifies the verifier: the Char reader really does reject a forbidden byte', () => {
    // ★ A CHECK ON THE CHECK. Every case above would pass vacuously if
    // `assertXmlCharProduction` accepted everything, so it is shown to reject the
    // document the finding described - and to accept the one the renderer now emits.
    expect(() => {
      assertXmlCharProduction('<title>Fake\u0000Title</title>');
    }).toThrow(/U\+0000.*not permitted by the XML 1\.0 Char production/);

    expect(() => {
      assertXmlCharProduction('<title>Fake\uD83DTitle</title>');
    }).toThrow(/U\+D83D/);

    expect(() => {
      assertBalancedMarkup('<channel><item></channel></item>');
    }).toThrow(/closes/);

    expect(() => {
      assertBalancedMarkup('<channel>');
    }).toThrow(/unclosed: channel/);

    // And both accept the real thing.
    const document = renderDocument([makeFullyPopulatedFeedRow()]);
    expect(() => {
      assertXmlCharProduction(document);
      assertBalancedMarkup(document);
    }).not.toThrow();
  });
});

describe('renderGoogleProductFeed - element 11, the product price', () => {
  it('emits the PRODUCT price, not the SKU price', () => {
    const document = renderOneRow({
      productPrice: Money.fromDecimalString('24.5'),
      skuPrice: Money.fromDecimalString('19.99'),
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L27]: the body is
    // `local.sku.getProduct().getPrice()` - the PRODUCT's price - while the sale gate on the next
    // line reads the SKU's own price and the SKU's sale price. Three quantities on two objects, and
    // the element emitted is not one the gate examines.
    //
    // JUDGMENT CALL: the asymmetry is REPRODUCED, NEVER RECONCILED. Either collapse changes money,
    // which is why the projection carries three price fields.
    expect(itemElementBody(document, 'g:price')).toBe('24.50');
    expect(itemElementBody(document, 'g:price')).not.toBe('19.99');
  });

  it('leaves the product price untouched when only the SKU prices change', () => {
    const document = renderOneRow({
      productPrice: Money.fromDecimalString('24.5'),
      skuPrice: Money.fromDecimalString('5.00'),
      skuSalePrice: Money.fromDecimalString('1.00'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    // The three fields are genuinely independent: the SKU pair moved far below the product price
    // and opened a sale, and the advertised price did not move.
    expect(itemElementBody(document, 'g:price')).toBe('24.50');
    expect(itemElementBody(document, 'g:sale_price')).toBe('1.00');
  });

  it('presents the price to two decimals through the money value object', () => {
    const wholeUnits = renderOneRow({ productPrice: Money.fromDecimalString('9') });
    const oneDecimal = renderOneRow({ productPrice: Money.fromDecimalString('9.5') });
    const manyDecimals = renderOneRow({ productPrice: Money.fromDecimalString('1234.567') });

    // JUDGMENT CALL: two-decimal presentation NORMALISES the legacy output rather than reproducing
    // it, so it is a correction and carries no defect marker. The template applies no mask at L27,
    // so raw CFML numeric stringification rendered a stored `9.50` as `9.5`. All money here is
    // presented through the value object's two-decimal rendering, the target equivalent of
    // `numberFormat(v,"0.00")`.
    expect(itemElementBody(wholeUnits, 'g:price')).toBe('9.00');
    expect(itemElementBody(oneDecimal, 'g:price')).toBe('9.50');
    expect(itemElementBody(manyDecimals, 'g:price')).toBe('1234.57');
    expect(itemElementBody(oneDecimal, 'g:price')).toBe(Money.fromDecimalString('9.5').toFixed2());
  });

  it('emits an empty price element when the product has no price, never a zero', () => {
    const document = renderOneRow({
      productPrice: undefined,
      skuPrice: Money.fromDecimalString('19.99'),
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L27]: an absent price
    // stringifies to nothing, so the element is emitted with an EMPTY body. The absence is
    // reachable - the product price is non-persistent and delegates to the default SKU, whose
    // accessor falls off the end of its own function with no return when there is none.
    //
    // ZERO IS NEVER SUBSTITUTED: a feed advertising `0.00` offers the product free.
    expect(itemElementBody(document, 'g:price')).toBe('');
    expect(itemElementBody(document, 'g:price')).not.toBe('0.00');
    expect(itemElementBody(document, 'g:price')).not.toBe('19.99');
    expect(itemChildren(document)).toContain('<g:price></g:price>');
    expect(itemElementNames(document)).toContain('g:price');
  });

  it('emits exactly one price element per item', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // The template's commented-out shipping block nests its own `g:price`
    // [integrationServices/google/views/feed/product.cfm:L55], so the element name alone cannot
    // prove it stayed unimplemented. The COUNT can.
    expect(itemElementsNamed(document, 'g:price')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 10. Elements 12 and 13 - the sale price and its effective-date range
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - elements 12 and 13, the gated sale block', () => {
  it('emits both elements when the SKU sale price is strictly below the SKU price', () => {
    const document = renderOneRow({
      productPrice: Money.fromDecimalString('24.5'),
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L28-L31]: both elements sit
    // inside ONE conditional, so they are emitted together or not at all. The gate is
    // `local.sku.getPrice() gt local.sku.getSalePrice()` - the SKU against itself - evaluated here
    // through the money value object, never as a float.
    expect(itemElementBody(document, 'g:sale_price')).toBe('9.50');
    expect(itemElementBody(document, 'g:sale_price_effective_date')).toBe(
      `${RANGE_START_RENDERED}/${SALE_EXPIRATION_RENDERED}`,
    );
    expect(itemElementNames(document)).toContain('g:sale_price');
    expect(itemElementNames(document)).toContain('g:sale_price_effective_date');

    // And the advertised price is STILL the product's, inside the sale case too.
    expect(itemElementBody(document, 'g:price')).toBe('24.50');
  });

  it('emits a well-formed ISO 8601 UTC interval driven by the supplied instant', () => {
    const document = renderOneRow({
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });
    const range = itemElementBody(document, 'g:sale_price_effective_date');

    // JUDGMENT CALL: this is a CORRECTION of a malformed legacy formulation, so it carries no
    // defect marker. The legacy body at [integrationServices/google/views/feed/product.cfm:L30] was
    // `dateFormat(now(),"YYYY-MM-DD")` + `T` + `timeFormat(now(),"HH:mm:ss")` + a HARDCODED `-` +
    // `getTimeZoneInfo().utcHourOffset`, twice, joined by `/`. Two independent faults:
    // `utcHourOffset` is SIGNED, so a server east of UTC contributed its own sign after the
    // hardcoded one and the offset read `--2`; and it was neither zero-padded nor given minutes,
    // rendering `-5` where the standard requires `-05:00`. It also read the server timezone through
    // `now()` and `getTimeZoneInfo()`, which the explicit UTC policy replaces. The target emits two
    // timestamps at second precision, each closed with the UTC designator, joined by the legacy's
    // own `/`. Second precision is kept because the legacy mask kept it, so a sub-second component
    // is truncated.
    expect(range).toBe('2024-06-01T12:34:56Z/2024-12-31T23:59:59Z');
    expect(occurrenceCount(range, '/')).toBe(1);
    expect(range).not.toContain('--');
    expect(range).not.toContain('+');
    expect(range.split('/').every((half) => half.endsWith('Z'))).toBe(true);
    expect(range.split('/').every((half) => half.length === 20)).toBe(true);
  });

  it('takes the range start from the argument rather than from any clock', () => {
    const row = makeFeedRow({
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });
    const earlier = renderGoogleProductFeed([row], FEED_HOST, new Date('2020-02-29T00:00:00.000Z'));
    const later = renderGoogleProductFeed([row], FEED_HOST, new Date('2031-11-15T06:07:08.000Z'));

    // Two fixed instants, both far from the moment this suite runs, each reaching the output
    // verbatim.
    expect(itemElementBody(earlier, 'g:sale_price_effective_date')).toBe(
      `2020-02-29T00:00:00Z/${SALE_EXPIRATION_RENDERED}`,
    );
    expect(itemElementBody(later, 'g:sale_price_effective_date')).toBe(
      `2031-11-15T06:07:08Z/${SALE_EXPIRATION_RENDERED}`,
    );
  });

  it('omits both elements when the sale price equals the SKU price', () => {
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('9.5'),
      skuSalePrice: Money.fromDecimalString('9.50'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    // The legacy gate is STRICTLY GREATER THAN, so equal prices are not a sale. The two decimal
    // spellings of the same quantity compare equal through the money value object, which a string
    // comparison would have missed.
    expect(document).not.toContain('g:sale_price');
    expect(itemElementNames(document)).not.toContain('g:sale_price');
    expect(itemElementNames(document)).not.toContain('g:sale_price_effective_date');
  });

  it('omits both elements when the sale price is above the SKU price', () => {
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('9.5'),
      skuSalePrice: Money.fromDecimalString('12.00'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    expect(document).not.toContain('g:sale_price');
  });

  it('omits both elements when the sale price is absent', () => {
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: undefined,
      salePriceExpirationDateTime: undefined,
    });

    // This case previously carried the claim that the absent pair is "the state EVERY
    // row the live repository produces is in" and that "the sale block is therefore
    // unreachable through the real data path today". Both statements are now false and
    // are corrected here rather than left to mislead the next reader: the data-access
    // half resolves the pair from the promotion sale-price detail, so an ordinary row
    // carrying a live sale reaches this block through the real path.
    //
    // The state under test is still reachable, which is why the case survives. The
    // sale price is absent exactly when there is no qualifying promotion AND the SKU's
    // own price column is null, because the fallback the repository applies is the
    // legacy accessor's own `return getPrice()` [model/entity/Sku.cfc:L546-L551] rather
    // than a default. Absent-with-no-price is the narrower state this asserts.
    expect(document).not.toContain('g:sale_price');
    expect(itemElementNames(document)).toEqual([
      'g:id',
      'title',
      'description',
      'g:google_product_category',
      'g:product_type',
      'link',
      'g:image_link',
      'g:condition',
      'g:availability',
      'g:price',
      'g:brand',
      'g:item_group_id',
      'g:shipping_weight',
    ]);
  });

  it('omits both elements when either gate operand is absent', () => {
    const noSkuPrice = renderOneRow({
      skuPrice: undefined,
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });
    const noSalePrice = renderOneRow({
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: undefined,
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    // JUDGMENT CALL: the shipped gate requires both operands to be PRESENT before it compares,
    // where the legacy tested the comparison alone. A sale price which is not there cannot be
    // strictly below the price, and skipping also keeps a half-formed sale block out of the feed.
    expect(noSkuPrice).not.toContain('g:sale_price');
    expect(noSalePrice).not.toContain('g:sale_price');
  });

  it('★★★ still advertises the sale when the expiration instant is absent (F42)', () => {
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: undefined,
    });

    // QUOTE-THEN-REVISE. Titled "omits both elements when the expiration instant is absent" and
    // annotated "An interval has two ends; with only one the pair cannot be emitted truthfully, so
    // neither element is emitted - and the price element is never emitted alone, because the legacy
    // holds both inside one conditional." The last clause is the error: the legacy conditional gates
    // on `getPrice() gt getSalePrice()` [integrationServices/google/views/feed/product.cfm:L28] and
    // NOTHING about the expiration, and an endless sale is reachable - a promotion period with a
    // null end date qualifies as current [model/dao/PromotionDAO.cfc:L319] and projects a null
    // expiration [:L344]. So a live sale silently stopped being advertised. The interval argument
    // is sound and now applies only to the element that IS an interval.
    expect(itemElementBody(document, 'g:sale_price')).toBe('9.50');
    expect(itemElementNames(document)).toContain('g:sale_price');
    expect(itemElementNames(document)).not.toContain('g:sale_price_effective_date');
  });

  it('★★★ still advertises the sale when the request instant cannot be rendered (F42)', () => {
    const document = renderGoogleProductFeed(
      [
        makeFeedRow({
          skuPrice: Money.fromDecimalString('19.99'),
          skuSalePrice: Money.fromDecimalString('9.5'),
          salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
        }),
      ],
      FEED_HOST,
      new Date(Number.NaN),
    );

    // QUOTE-THEN-REVISE. Titled "omits both elements when the supplied instant cannot be rendered"
    // and defended as failing "CLOSED rather than raising or emitting a placeholder". The
    // fail-closed reasoning holds for the INTERVAL and not for the price: an unrenderable range
    // START is still no reason to withdraw a sale the price comparison decided. What must not appear
    // is a placeholder, and none does.
    expect(itemElementBody(document, 'g:sale_price')).toBe('9.50');
    expect(itemElementNames(document)).not.toContain('g:sale_price_effective_date');
    expect(document).not.toContain('NaN');
    expect(document).not.toContain('Invalid Date');
    expect(document.endsWith('</rss>')).toBe(true);
    expect(itemElementNames(document)).toContain('g:price');
  });

  it('omits the expiration element rather than emitting an unrenderable one, keeping the sale', () => {
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: new Date(Number.NaN),
    });

    expect(itemElementBody(document, 'g:sale_price')).toBe('9.50');
    expect(itemElementNames(document)).not.toContain('g:sale_price_effective_date');
    expect(document).not.toContain('NaN');
  });

  it('emits BOTH elements, in order, when the whole window is renderable', () => {
    // The unchanged happy path, asserted alongside the three degraded ones so the restructured gate
    // cannot quietly stop emitting the interval it still owes.
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });
    const names = itemElementNames(document);

    expect(names).toContain('g:sale_price');
    expect(names).toContain('g:sale_price_effective_date');
    expect(names.indexOf('g:sale_price')).toBeLessThan(
      names.indexOf('g:sale_price_effective_date'),
    );
  });

  it('emits NEITHER element when the price comparison itself does not hold', () => {
    // The gate that remains is the legacy's only gate, so an equal or lower stored price withdraws
    // both elements - which is what makes the restructuring a NARROWING of the added condition
    // rather than a removal of the source one.
    const notOnSale = renderOneRow({
      skuPrice: Money.fromDecimalString('9.5'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    expect(notOnSale).not.toContain('g:sale_price');
    expect(itemElementNames(notOnSale)).not.toContain('g:sale_price_effective_date');
  });
});

// ---------------------------------------------------------------------------
// 11. Element 14 - the independently gated brand
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - element 14, the brand', () => {
  it('emits the brand element when the row carries a brand name', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: 'Fake Brand' });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L32]: the guard is
    //   `not isNull(local.sku.getProduct().getBrand())`
    // and it is meaningful because the brand is joined LEFT, so a product with no brand appears in
    // the feed.
    expect(itemElementBody(document, 'g:brand')).toBe('Fake Brand');
  });

  it('emits an EMPTY brand element when the association is present but the name is absent', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: undefined });

    // This case previously asserted the OPPOSITE - that an absent name omits the
    // element entirely - and it is inverted rather than deleted, because the state it
    // exercises is the one the finding was about. The legacy guard tests the
    // ASSOCIATION and then interpolates the name
    // [integrationServices/google/views/feed/product.cfm:L32]; CFML stringifies a null
    // name to nothing, so a brand row whose name column is null produced an OPEN AND
    // CLOSE PAIR with nothing between them. Omitting the element instead is a
    // different document, and "both convey absence" is not a reason to prefer it.
    expect(itemElementBody(document, 'g:brand')).toBe('');
    expect(itemChildren(document)).toContain('<g:brand></g:brand>');
    expect(itemElementNames(document)).toContain('g:brand');
  });

  it('omits the brand element entirely when the product carries no brand', () => {
    const document = renderOneRow({ brandID: undefined, brandName: undefined });

    // ★ THIS CASE ONCE ABSENTED THE NAME ALONE, UNDER THE TITLE "WHEN THERE IS NO
    // BRAND NAME". The name is the body and the association is the gate, so what makes
    // the element disappear is the ABSENT BRAND - which the outer join
    // [integrationServices/google/controllers/feed.cfc:L66] is what produces.
    //
    // Omitted, not emptied, and the neighbouring elements close up around the gap
    // while keeping their relative order. This is the unmatched LEFT join
    // [integrationServices/google/controllers/feed.cfc:L66].
    expect(document).not.toContain('g:brand');
    expect(itemElementNames(document)).not.toContain('g:brand');
    expect(itemElementNames(document).slice(-3)).toEqual([
      'g:price',
      'g:item_group_id',
      'g:shipping_weight',
    ]);
  });

  it('omits the brand element when the association is absent even though a name is carried', () => {
    // The two fields are independent, so the contradictory combination is
    // representable, and the gate is what decides. Asserting it here proves the
    // subject reads the presence key rather than falling back on the name when that key
    // says no - which is the failure mode the previous shape of this suite could not
    // see.
    const document = renderOneRow({ brandID: undefined, brandName: 'Fake Brand' });

    expect(document).not.toContain('g:brand');
    expect(document).not.toContain('Fake Brand');
  });

  it('emits an empty brand element when the brand name is an empty string', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: '' });

    // An empty string and an absent name render identically, and that is correct rather
    // than a coincidence: CFML stringifies both to nothing at the interpolation site, so
    // the source could not tell them apart either. The gate is upstream of this
    // distinction entirely.
    //
    // ★★ THIS CASE ONCE CARRIED A JUDGMENT CALL READING "THE SHIPPED GATE TESTS THE
    // BRAND NAME, BECAUSE THAT IS THE ONLY BRAND INFORMATION THE PROJECTION CARRIES -
    // IT CANNOT DISTINGUISH 'NO BRAND' FROM 'A BRAND RECORDING NO NAME'", AND
    // CONCEDED: "FOR A PRODUCT WHOSE BRAND EXISTS BUT WHOSE NAME COLUMN IS NULL, THE
    // LEGACY EMITTED AN EMPTY ELEMENT AND THIS PORT OMITS IT, BECAUSE WIDENING THE
    // PROJECTION TO CARRY A SEPARATE BRAND-PRESENCE FLAG WOULD MEAN RESHAPING A
    // CONTRACT ANOTHER MODULE OWNS." The concession named a real divergence and then
    // declined to close it on ownership grounds - but the projection and this renderer
    // are two thirds of ONE adapter and both are in scope, and the widening cost a
    // single column on a table the selection already joins
    // [model/entity/Product.cfc:L68]. The gate is brand presence now, and the empty
    // body remains what an empty name renders.
    expect(itemElementBody(document, 'g:brand')).toBe('');
    expect(itemChildren(document)).toContain('<g:brand></g:brand>');
  });

  it('emits an empty brand element when the brand exists but records no name', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: undefined });

    // NET-NEW, and the case that proves the divergence above is closed. The legacy
    // guard passes on the ASSOCIATION and then interpolates a null name, which CFML
    // stringifies to nothing [integrationServices/google/views/feed/product.cfm:L32],
    // so an empty element is exactly what the legacy produced for this row.
    expect(itemElementNames(document)).toContain('g:brand');
    expect(itemChildren(document)).toContain('<g:brand></g:brand>');
  });

  it('gates on the brand identifier rather than on the brand name', () => {
    // NET-NEW. Holding the name fixed and moving only the identifier isolates the
    // gate: the same name emits or does not emit purely on brand presence.
    const branded = renderOneRow({ brandID: 'fake-brand-id-1', brandName: 'Fake Brand' });
    const unbranded = renderOneRow({ brandID: undefined, brandName: 'Fake Brand' });

    expect(itemElementNames(branded)).toContain('g:brand');
    expect(itemElementNames(unbranded)).not.toContain('g:brand');
    expect(unbranded).not.toContain('Fake Brand');
  });

  it('emits the brand element between the sale block and the item group id', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    expect(itemElementNames(document).slice(-5)).toEqual([
      'g:sale_price',
      'g:sale_price_effective_date',
      'g:brand',
      'g:item_group_id',
      'g:shipping_weight',
    ]);
  });

  it('never emits a brand website and never has one to fetch', () => {
    const document = renderOneRow({ brandName: 'Fake Brand' });

    // `Brand.brandWebsite` [model/entity/Brand.cfc:L57] is a plain persisted string carrying a
    // display-only format hint. It is ABSENT from the feed template and from the projection this
    // subject consumes, and it is not a network target.
    expect(document).not.toContain('brandWebsite');
    expect(document).not.toContain('g:link');
    expect(itemElementsNamed(document, 'g:brand')).toEqual(['<g:brand>Fake Brand</g:brand>']);
  });
});

// ---------------------------------------------------------------------------
// 12. The elements the template documents but never emitted
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - the commented-out legacy elements', () => {
  /**
   * Every element name held inside one of the template's three comment blocks:
   * [integrationServices/google/views/feed/product.cfm:L33-L38], [.../product.cfm:L40-L57] and
   * [.../product.cfm:L59-L61].
   *
   * The legacy feed never carried one of them, so the port implements none - no placeholder and no
   * commented-out TypeScript.
   */
  const NEVER_EMITTED_ELEMENT_NAMES: readonly string[] = [
    'g:gtin',
    'g:mpn',
    'g:gender',
    'g:age_group',
    'g:color',
    'g:size',
    'g:material',
    'g:pattern',
    'g:tax',
    'g:tax_ship',
    'g:shipping',
    'g:service',
    'g:country',
    'g:region',
    'g:rate',
    'g:online_only',
  ];

  it('emits none of them, for a row with every value it could possibly carry', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    for (const name of NEVER_EMITTED_ELEMENT_NAMES) {
      expect(document).not.toContain(`<${name}>`);
      expect(document).not.toContain(`</${name}>`);
    }
  });

  it('distinguishes the never-emitted shipping group from the shipping weight', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // `g:shipping` is a PREFIX of `g:shipping_weight`, so a substring check on the bare name would
    // be satisfied by the element legitimately emitted. The exact tags separate them.
    expect(document).not.toContain('<g:shipping>');
    expect(document).not.toContain('</g:shipping>');
    expect(document).toContain('<g:shipping_weight>');
    expect(itemElementsNamed(document, 'g:shipping')).toEqual([]);
    expect(itemElementsNamed(document, 'g:shipping_weight')).toHaveLength(1);
  });

  it('emits exactly sixteen element occurrences for a fully populated row', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // The count is the backstop: an added element would pass every absence check above and still
    // fail this.
    expect(itemChildren(document)).toHaveLength(16);
  });
});

// ---------------------------------------------------------------------------
// 13. Purity, the host argument, and the absence of any network target
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - purity and the host argument', () => {
  it('writes the supplied host into all five sites the legacy interpolated', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L14-L15, L22-L24]: the legacy
    // interpolated `CGI.HTTP_HOST` at five sites, each prefixed with a hardcoded `http://`. There
    // is no request scope here, so the host arrives as an argument - a non-routable RFC 2606
    // `.invalid` placeholder, purely as a STRING written into element bodies, never a destination.
    expect(occurrenceCount(document, FEED_ORIGIN)).toBe(5);
    expect(documentLines(document)[4]).toBe(`    <link>${FEED_ORIGIN}</link>`);
    expect(documentLines(document)[5]).toBe(
      `    <description>Google Product Feed for ${FEED_ORIGIN}</description>`,
    );
    expect(itemElementBody(document, 'link').startsWith(FEED_ORIGIN)).toBe(true);
    expect(itemElementBody(document, 'g:image_link').startsWith(FEED_ORIGIN)).toBe(true);
    expect(itemElementBody(document, 'g:additional_image_link').startsWith(FEED_ORIGIN)).toBe(true);
  });

  it('preserves the http scheme rather than upgrading it', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24]:
    // the literal is `http://` at every one of the five sites and never `https`.
    //
    // ★★ THIS CASE HAS HELD BOTH NAMES AND BOTH ARGUMENTS, so the record is worth being
    // exact about. It began as this - the upgrade declined on AAP grounds. An intervening
    // revision renamed it to "reproduces the legacy http scheme EXACTLY when it is the one
    // supplied", struck the declination, and made the scheme a required parameter that the
    // suite pinned to `'http'`. The parameter is gone and the original name and argument are
    // restored: AAP 0.1.1 requires preserving "the Google product-feed integration contract
    // exactly", AAP 0.8.1 freezes it, and AAP 0.6.7 admits no fourth divergence. AAP 0.4.1's
    // three-hardcoding list, which the intervening revision read as a licence, enumerates the
    // hardcodings worth ANNOTATING rather than the only ones that are preserved.
    //
    // Parity is therefore enforced by the subject's own literal again, and the trailing S-09
    // block asserts that no fourth argument can override it.
    expect(document).not.toContain('https');
    // Six, not five: the five origin sites plus the `xmlns:g` namespace URI, which is an
    // identifier rather than a transport and is asserted separately never to move.
    expect(occurrenceCount(document, 'http://')).toBe(6);
  });

  it('contains no absolute address other than the placeholder host and the namespace', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);
    const urls = absoluteUrls(document);

    // Every absolute address is accounted for: five are the placeholder origin the caller supplied,
    // and the sixth is the namespace URI in the root element's `xmlns:g` attribute, which is part
    // of the RSS contract rather than an endpoint. NO service endpoint appears, and none is
    // contacted.
    expect(urls).toHaveLength(6);

    for (const url of urls) {
      expect(url === GOOGLE_NAMESPACE_URI || url.startsWith(FEED_ORIGIN)).toBe(true);
    }

    expect(occurrenceCount(document, GOOGLE_NAMESPACE_URI)).toBe(1);
    expect(document.indexOf(GOOGLE_NAMESPACE_URI)).toBeLessThan(document.indexOf('<channel>'));
    expect(document).not.toContain('googleapis');
    expect(document).not.toContain('merchants');
    expect(document).not.toContain('content/v2');
  });

  it('issues no network request while rendering', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderDocument([makeFullyPopulatedFeedRow(), makeFeedRow()]);

    // A direct proof that the host is an input rather than a destination.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns an identical document for identical arguments', () => {
    const rows: readonly GoogleProductFeedRow[] = [makeFullyPopulatedFeedRow(), makeFeedRow()];

    // Determinism follows from taking the host and the instant as arguments rather than reading
    // them from ambient state.
    expect(renderDocument(rows)).toBe(renderDocument(rows));
  });

  it('mutates neither the row collection nor any row within it', () => {
    const row = makeFullyPopulatedFeedRow();
    const rows: readonly GoogleProductFeedRow[] = [row];
    const keysBefore = Object.keys(row).sort();
    const titleBefore = row.calculatedTitle;
    const additionalImageCountBefore = row.additionalImageLinkPaths.length;

    renderDocument(rows);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(row);
    expect(Object.keys(row).sort()).toEqual(keysBefore);
    expect(row.calculatedTitle).toBe(titleBefore);
    expect(row.additionalImageLinkPaths).toHaveLength(additionalImageCountBefore);
  });

  it('renders from a frozen collection, so it appends to nothing it was handed', () => {
    const rows: readonly GoogleProductFeedRow[] = Object.freeze([makeFullyPopulatedFeedRow()]);

    // A frozen array raises on any write, so a clean render is evidence that the subject
    // accumulates into its own local structures only.
    const document = renderDocument(rows);

    expect(document.endsWith('</rss>')).toBe(true);
    expect(occurrenceCount(document, '<item>')).toBe(1);
  });

  it('accepts a bare host, and a bare host with a port, unchanged', () => {
    // ★★ THIS CASE HAS NOW BEEN WRITTEN THREE TIMES, AND THE TRAIL IS WORTH KEEPING.
    //
    // It first read "ACCEPTS AN EMPTY HOST WITHOUT FAILING, EXACTLY AS THE LEGACY
    // ACCEPTED ONE", justified by: "THE LEGACY NEVER VALIDATED `CGI.HTTP_HOST` - IT
    // EMITTED WHATEVER THE ENGINE REPORTED - SO THE PORT VALIDATES NOTHING EITHER, AND
    // ADDING A GUARD WOULD ADD BEHAVIOUR THE LEGACY NEVER HAD."
    //
    // It then read "VALIDATES NOTHING ITSELF, BECAUSE THE HOST IT IS GIVEN HAS ALREADY
    // BEEN VALIDATED", which kept the empty-host render and moved the justification: a
    // refusal had been added at a `toTrustedFeedHost` allow-list mint in
    // `src/integrations/google/googleFeedService.ts`, so this function was described as
    // pure, policy-free, and interpolating exactly what it was handed. THAT MINT HAS SINCE
    // BEEN WITHDRAWN - an unplanned host-policy subsystem in a module whose authority
    // excludes an allow-list by name - which is a second, independent reason the
    // justification could not stand: the guard it deferred to no longer exists, and this
    // function's own check is the only one there is.
    //
    // Both statements ABOUT THE LEGACY are accurate
    // [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24]. The
    // first conclusion applied the reproduce-rather-than-repair rule to a SECURITY
    // boundary, which is where that rule stops: behind a fixed CFML virtual host the
    // engine reported a value the deployment controlled, whereas an API Gateway `Host`
    // header is chosen by the caller. The second conclusion was right about WHERE the
    // policy lives and wrong that this function holds none of it.
    //
    // ★ THE SHIPPED RENDERER CHECKS THE ORIGIN ITSELF, AND THE DUPLICATION IS THE POINT.
    // `renderGoogleProductFeed` opens with `assertFeedHostShape(feedHost)` before it
    // composes anything, for two reasons neither of which the service's guard covers:
    // the renderer is a DEFAULTED, SUBSTITUTABLE constructor parameter of
    // `GoogleFeedService`, so a caller may supply a different one; and it is an exported
    // pure function that anything may call directly, without a service in the picture at
    // all. A precondition on the bytes this module interpolates therefore has to be
    // enforced by this module. Section 13b asserts every refusal, including the empty
    // host this case used to render.
    //
    // WHAT REMAINS TRUE, AND IS WHAT THIS CASE NOW PINS: an ACCEPTED host is
    // interpolated EXACTLY as given - not trimmed, not lower-cased, not defaulted, and
    // not re-encoded. The two shapes an operator actually configures are asserted here
    // so the refusals in 13b cannot be mistaken for a guard that rejects everything.
    const plain = renderGoogleProductFeed(
      [makeFeedRow()],
      'shop.example.invalid',
      RANGE_START_INSTANT,
    );
    const ported = renderGoogleProductFeed(
      [makeFeedRow()],
      'shop.example.invalid:8443',
      RANGE_START_INSTANT,
    );

    expect(documentLines(plain)[4]).toBe('    <link>http://shop.example.invalid</link>');
    expect(documentLines(ported)[4]).toBe('    <link>http://shop.example.invalid:8443</link>');
    expect(plain.endsWith('</rss>')).toBe(true);
    expect(ported.endsWith('</rss>')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13b. The feed origin, refused rather than concatenated
//
// ★★★ SECURITY BOUNDARY — CWE-346 (ORIGIN VALIDATION ERROR), and A DELIBERATE
// DIVERGENCE FROM THE LEGACY, which is why the block carries this much prose.
//
// The legacy template interpolated `CGI.HTTP_HOST` at five sites
// [integrationServices/google/views/feed/product.cfm:L14-L15, L22-L24] and validated
// it at none. `CGI.HTTP_HOST` is the REQUEST'S OWN `Host` HEADER: a client chooses it,
// so the legacy feed's every item URL was, in principle, client-steerable. This port
// already diverges by taking the host as an explicit parameter rather than reading an
// ambient request scope - and that divergence buys nothing unless the value is also
// checked, because a caller can hand over a header just as easily as a setting.
//
// WHY THIS IS NOT A PARITY BREAK WORTH PRESERVING. AAP 0.6.7 registers twenty legacy
// defects to reproduce, and the absence of origin validation is not among them; there
// is no preserve-exactly mandate over the feed template's host handling; and AAP
// 0.8.1's must-preserve list names promotion math, the resolution cascades and
// option-based SKU selection, none of which touches this. What the AAP does mandate
// [0.1.1] is preserving the feed CONTRACT - the elements, their order and their values
// - and a refused render emits no document at all rather than a differently-shaped
// one, so no consumer can observe a changed contract.
//
// WHY IT THROWS while the forbidden-code-point pass elides. A bad code point poisons
// one field of one row, so removing it keeps the rest of the catalog serving; a bad
// origin poisons EVERY url in the document at once, so there is no partial output
// worth emitting, and a feed that points Merchant Center at an attacker's host is
// strictly worse than a feed that failed to build. The two opposite dispositions in
// one module are the design point, and each is asserted here.
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - feed origin validation', () => {
  /** Renders with the supplied host and returns the raised error, or throws if none was. */
  function captureOriginRefusal(feedHost: string): Error {
    try {
      renderGoogleProductFeed([makeFeedRow()], feedHost, RANGE_START_INSTANT);
    } catch (error: unknown) {
      if (error instanceof Error) {
        return error;
      }

      throw new Error(`expected an Error, received ${typeof error}`);
    }

    // Reached only when the guard let the value through, which a truncated or
    // partially-rendered document could otherwise disguise as a pass.
    throw new Error(`expected a refusal for host ${JSON.stringify(feedHost)}, none was raised`);
  }

  it('refuses an empty host, which the legacy accepted and rendered as a bare scheme', () => {
    const error = captureOriginRefusal('');

    // The legacy emitted `http://` on its own at all five sites when the header was
    // absent. That is not a usable feed, and it is the one refusal whose legacy
    // behaviour is directly observable, so it is asserted first.
    expect(error.message).toContain('it was empty');
    expect(error.message).toContain('No feed was rendered');
  });

  it('refuses a host carrying a scheme, because this module owns the scheme', () => {
    // `http://x` would compose `http://http://x`, and `https://x` would compose a
    // document whose links carry two schemes.
    expect(captureOriginRefusal('http://shop.example.invalid').message).toContain('no scheme');
    expect(captureOriginRefusal('https://shop.example.invalid').message).toContain('no scheme');
    expect(captureOriginRefusal('//shop.example.invalid').message).toContain('no scheme');
  });

  it('refuses a host carrying a path, which would silently reparent every url', () => {
    expect(captureOriginRefusal('shop.example.invalid/checkout').message).toContain('no path');
    expect(captureOriginRefusal('shop.example.invalid/').message).toContain('no path');
  });

  it('refuses embedded credentials, which move the real authority past the @', () => {
    // `shop.example.invalid@evil.invalid` resolves to `evil.invalid`, with the part a
    // human reads first demoted to a username. This is the highest-value single case
    // in the block.
    const error = captureOriginRefusal('shop.example.invalid@evil.invalid');

    expect(error.message).toContain('no credentials');
    expect(captureOriginRefusal('user:secret@evil.invalid').message).toContain('no credentials');
  });

  it('refuses a query or a fragment', () => {
    expect(captureOriginRefusal('shop.example.invalid?tenant=a').message).toContain('no query');
    expect(captureOriginRefusal('shop.example.invalid#frag').message).toContain('no fragment');
  });

  it('refuses whitespace anywhere, and never trims it away', () => {
    // Trimming would ACCEPT a padded value and quietly change it, which is a worse
    // outcome than refusing: the operator would never learn their configuration was
    // malformed. All three positions are refused identically.
    expect(captureOriginRefusal(' shop.example.invalid').message).toContain('no whitespace');
    expect(captureOriginRefusal('shop.example.invalid ').message).toContain('no whitespace');
    expect(captureOriginRefusal('shop example.invalid').message).toContain('no whitespace');
    expect(captureOriginRefusal('   ').message).toContain('no whitespace');
  });

  it('refuses the CR and LF a header-splitting payload needs', () => {
    // These would also survive `escapeXmlText`, which escapes markup and not layout,
    // so refusing them here is the only place they are stopped.
    expect(captureOriginRefusal('shop.example.invalid\r\nX-Injected: 1').message).toContain(
      'no control characters',
    );
    expect(captureOriginRefusal('shop.example.invalid\n').message).toContain(
      'no control characters',
    );
  });

  it('refuses a NUL, which no host can contain', () => {
    const error = captureOriginRefusal('shop.example.invalid\u0000evil.invalid');

    expect(error.message).toContain('No feed was rendered');
  });

  it('refuses a malformed label - leading dot, trailing dot, leading hyphen', () => {
    // One shape rule covers all three, which is why there is no rule per case in the
    // implementation.
    expect(captureOriginRefusal('.shop.example.invalid').message).toContain('bare host');
    expect(captureOriginRefusal('shop.example.invalid.').message).toContain('bare host');
    expect(captureOriginRefusal('-shop.example.invalid').message).toContain('bare host');
    expect(captureOriginRefusal('shop..example.invalid').message).toContain('bare host');
  });

  it('refuses a host longer than a host can be, naming the limit and not the value', () => {
    const overlong = `${'a'.repeat(300)}.invalid`;
    const error = captureOriginRefusal(overlong);

    expect(error.message).toContain('at most 259 characters');
    expect(error.message).toContain('but it was 308');

    // ★ THE MESSAGE NEVER ECHOES THE REJECTED ORIGIN. Reproducing it would write
    // caller-controlled bytes into a log line, and the constraint is what an operator
    // holding a legitimate host actually needs to read. Asserted for every refusal in
    // this block, not just this one.
    expect(error.message).not.toContain('aaaa');
  });

  it('names the constraint and never the value, for every refusal shape', () => {
    const hosts: readonly string[] = [
      'http://shop.example.invalid',
      'shop.example.invalid/checkout',
      'user:secret@evil.invalid',
      'shop.example.invalid?tenant=a',
      ' shop.example.invalid',
    ];

    for (const host of hosts) {
      const error = captureOriginRefusal(host);

      // No fragment of the rejected input reaches the message. `evil.invalid` and
      // `secret` are the two a leak would be most damaging for.
      expect(error.message).not.toContain('evil.invalid');
      expect(error.message).not.toContain('secret');
      expect(error.message).not.toContain('checkout');
      expect(error.message).toContain('No feed was rendered');
    }
  });

  it('refuses BEFORE emitting anything, so no partial document escapes', () => {
    // The guard runs on the first line of the body, ahead of origin composition and
    // ahead of every row. A caller therefore receives a document or an error and
    // never a truncated feed - which for a five-site origin is the whole point.
    let rendered: string | undefined;

    try {
      rendered = renderGoogleProductFeed(
        [makeFullyPopulatedFeedRow(), makeFeedRow()],
        'http://evil.invalid/x',
        RANGE_START_INSTANT,
      );
    } catch {
      rendered = undefined;
    }

    expect(rendered).toBeUndefined();
  });

  it('accepts an IPv6 literal in brackets, so an IPv6 deployment is not refused', () => {
    const document = renderGoogleProductFeed([makeFeedRow()], '[2001:db8::1]', RANGE_START_INSTANT);

    // RFC 3986 requires the brackets, which is also what keeps the colon-rich form
    // from being read as a host-and-port. The unbracketed form is refused.
    expect(documentLines(document)[4]).toBe('    <link>http://[2001:db8::1]</link>');
    expect(captureOriginRefusal('2001:db8::1').message).toContain('bare host');
  });

  it('accepts the underscore some internal hostnames carry', () => {
    // Not permitted by RFC 1123 for a public name, but common in internal DNS, and
    // refusing it would break a legitimate deployment for no security gain: an
    // underscore cannot change which authority a URL resolves to.
    const document = renderGoogleProductFeed(
      [makeFeedRow()],
      'feed_internal.example.invalid',
      RANGE_START_INSTANT,
    );

    expect(documentLines(document)[4]).toBe(
      '    <link>http://feed_internal.example.invalid</link>',
    );
  });

  it('★★★ REFUSES A PORT OUTSIDE 1 TO 65535, which neither grammar used to check', () => {
    // ★★★ THE PORT RANGE, AND IT WAS UNCHECKED ON BOTH SIDES. This module's retired
    // `FEED_HOST_SHAPE` and `src/lib/config.ts`'s retired `FEED_ALLOWED_HOST_AUTHORITY` both
    // spelled the port as `\d{1,5}`, which is `0` through `99999`: every value below renders a
    // URL naming a port that cannot be listened on, and `:0` in particular names no port at all
    // while still producing `http://host:0/...` in five places of a published merchant feed.
    for (const outOfRange of [
      'shop.example.invalid:0',
      'shop.example.invalid:00000',
      'shop.example.invalid:65536',
      'shop.example.invalid:99999',
    ]) {
      expect(captureOriginRefusal(outOfRange).message).toContain('between 1 and 65535');
    }
  });

  it('★★ refuses a LEADING-ZERO port, because one port must have one spelling', () => {
    // `:065535` and `:65535` denote the same port to a resolver and are different strings to
    // every comparison this subtree makes - so an allow-list entry written one way would not
    // match a feed host written the other. Refusing removes the ambiguity; normalizing would
    // silently change a value the deployment wrote.
    expect(captureOriginRefusal('shop.example.invalid:08443').message).toContain('no leading zero');
    expect(captureOriginRefusal('shop.example.invalid:0443').message).toContain('no leading zero');
  });

  it('accepts the boundary ports, so the range is a range and not an off-by-one', () => {
    for (const port of ['1', '80', '8443', '65535']) {
      const document = renderGoogleProductFeed(
        [makeFeedRow()],
        `shop.example.invalid:${port}`,
        RANGE_START_INSTANT,
      );

      expect(documentLines(document)[4]).toBe(
        `    <link>http://shop.example.invalid:${port}</link>`,
      );
    }
  });

  it('★★ DECIDES THROUGH THE SAME PARSER `src/lib/config.ts` USES, not through a copy of it', () => {
    // ★★ THE ANTI-DIVERGENCE ASSERTION, AND IT IS THE REASON THE GRAMMAR MOVED. The two modules
    // used to hold separate patterns whose docblock claimed they were "deliberately identical".
    // They were not: config's was lowercase-only, admitted no underscore and had no bracketed
    // IPv6 alternative, so each value below was REFUSED as deployment configuration and ACCEPTED
    // here. A value a deployment cannot authorize but this module will publish is a divergence
    // in the dangerous direction, whichever way round it points.
    //
    // Asserted against the shared parser directly as well as through the renderer, so the case
    // fails if either side is ever given a grammar of its own again.
    for (const previouslyDivergent of [
      'SHOP.example.invalid',
      'feed_internal.example.invalid',
      '[::1]',
    ]) {
      expect(parseHostAuthority(previouslyDivergent)).toBeDefined();
      expect(() =>
        renderGoogleProductFeed([makeFeedRow()], previouslyDivergent, RANGE_START_INSTANT),
      ).not.toThrow();
    }

    // And the converse: everything the renderer refuses, the parser refuses too.
    for (const refused of [
      'http://shop.example.invalid',
      'shop.example.invalid/checkout',
      'user:secret@evil.invalid',
      'shop.example.invalid:0',
      'shop.example.invalid:65536',
      'shop.example.invalid:08443',
      '',
      `${'a'.repeat(300)}.invalid`,
    ]) {
      expect(parseHostAuthority(refused)).toBeUndefined();
    }
  });

  it('splits the authority into its host and port halves', () => {
    // The parser answers a parsed value rather than a boolean, so a caller that needs the two
    // halves has them without re-splitting the string. Bracket retention matters: the brackets
    // are part of the authority as it must be written into a URL.
    expect(parseHostAuthority('shop.example.invalid')).toStrictEqual({
      host: 'shop.example.invalid',
      port: undefined,
    });
    expect(parseHostAuthority('shop.example.invalid:8443')).toStrictEqual({
      host: 'shop.example.invalid',
      port: 8443,
    });
    expect(parseHostAuthority('[2001:db8::1]:8443')).toStrictEqual({
      host: '[2001:db8::1]',
      port: 8443,
    });
  });

  it('refuses a shape-valid host only on shape, never on reputation', () => {
    // ★ THE GUARD CHECKS SHAPE AND CANNOT CHECK PROVENANCE, and this test pins that
    // limit so nobody mistakes the guard for more than it is. `evil.invalid` is a
    // perfectly well-formed host and renders cleanly. Ensuring the value came from
    // CONFIGURATION rather than from a request `Host` header is the composition
    // root's obligation, stated on the parameter and enforced at the service seam.
    const document = renderGoogleProductFeed([makeFeedRow()], 'evil.invalid', RANGE_START_INSTANT);

    expect(documentLines(document)[4]).toBe('    <link>http://evil.invalid</link>');
  });
});

// ---------------------------------------------------------------------------
// 14. The complete document, asserted as one literal string
//
// The most direct statement of the contract in this file: the expected document is written out in
// full, so a reviewer reads what the subject must emit.
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - the complete rendered document', () => {
  it('renders a fully populated row exactly, element for element', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    expect(document).toBe(
      [
        '<?xml version="1.0"?>',
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
        '  <channel>',
        '    <title>Slatwall Product Feed</title>',
        '    <link>http://feed.example.invalid</link>',
        '    <description>Google Product Feed for http://feed.example.invalid</description>',
        '    <item>',
        '      <g:id>FAKE-SKU-1</g:id>',
        '      <title>Fake Product Title</title>',
        '      <description>Fake product description.</description>',
        '      <g:google_product_category></g:google_product_category>',
        '      <g:product_type>Fake Root &amp;raquo; Fake Leaf</g:product_type>',
        '      <link>http://feed.example.invalid/fake-url-key/fake-product-url-title/</link>',
        '      <g:image_link>http://feed.example.invalid/fake-image-base/product/default/fake-sku-image.jpg</g:image_link>',
        '      <g:additional_image_link>http://feed.example.invalid/fake-image-base/product/fake-additional-1.jpg</g:additional_image_link>',
        '      <g:condition>new</g:condition>',
        '      <g:availability>in stock</g:availability>',
        '      <g:price>24.50</g:price>',
        '      <g:sale_price>9.50</g:sale_price>',
        '      <g:sale_price_effective_date>2024-06-01T12:34:56Z/2024-12-31T23:59:59Z</g:sale_price_effective_date>',
        '      <g:brand>Fake Brand</g:brand>',
        '      <g:item_group_id>FAKE-PRODUCT-1</g:item_group_id>',
        '      <g:shipping_weight>1 lb</g:shipping_weight>',
        '    </item>',
        '  </channel>',
        '</rss>',
      ].join('\n'),
    );
  });

  it('renders a row with every optional value absent exactly, element for element', () => {
    const document = renderDocument([
      makeFeedRow({
        skuCode: undefined,
        calculatedTitle: undefined,
        productDescription: undefined,
        productTypeDescription: undefined,
        productTypeSimpleRepresentation: undefined,
        productUrlPath: undefined,
        // NOT `undefined`, and the difference is the point. Every other path-bearing
        // field on this row is genuinely optional, but `imageLinkPath` is `string`:
        // the data-access half always resolves one, substituting the missing-image
        // path [model/service/ImageService.cfc:L82-L90] rather than yielding nothing.
        // The leanest row the subject can be handed therefore still carries a real
        // image path, and the golden document below reflects that rather than
        // pretending the field can vanish.
        imageLinkPath: MISSING_IMAGE_PATH,
        additionalImageLinkPaths: [],
        productPrice: undefined,
        skuPrice: undefined,
        skuSalePrice: undefined,
        salePriceExpirationDateTime: undefined,
        // The brand ELEMENT is gated on the association, not on the name, so an absent
        // name alone no longer suppresses element fourteen. Suppressing it takes an
        // absent `brandID`, which is what an unmatched LEFT join produces
        // [integrationServices/google/controllers/feed.cfc:L66].
        brandID: undefined,
        brandName: undefined,
        productCode: undefined,
        skuShippingWeight: '',
        skuShippingWeightUnitCode: '',
      }),
    ]);

    // The two conditional groups drop out, every remaining body is empty, and the shipping weight
    // keeps its lone separating space - the leanest document the subject can produce, still
    // complete and well-formed.
    //
    // ★ TWO OF THESE OVERRIDES CHANGED. `imageLinkPath` was `undefined` and cannot be:
    // it is a required string now, so the leanest value it can carry is the resolved
    // fallback the legacy resolver's unconditional final branch always produced
    // [model/service/ImageService.cfc:L88], and the image element therefore carries a
    // path rather than collapsing to a bare origin. `brandID` joined the absences
    // because the brand element is gated on brand PRESENCE
    // [integrationServices/google/views/feed/product.cfm:L32], so absenting the name
    // alone would now EMIT an empty element rather than omit one.
    expect(document).toBe(
      [
        '<?xml version="1.0"?>',
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
        '  <channel>',
        '    <title>Slatwall Product Feed</title>',
        '    <link>http://feed.example.invalid</link>',
        '    <description>Google Product Feed for http://feed.example.invalid</description>',
        '    <item>',
        '      <g:id></g:id>',
        '      <title></title>',
        '      <description></description>',
        '      <g:google_product_category></g:google_product_category>',
        '      <g:product_type></g:product_type>',
        '      <link>http://feed.example.invalid</link>',
        '      <g:image_link>http://feed.example.invalid/assets/images/missingimage.jpg</g:image_link>',
        '      <g:condition>new</g:condition>',
        '      <g:availability>in stock</g:availability>',
        '      <g:price></g:price>',
        '      <g:item_group_id></g:item_group_id>',
        '      <g:shipping_weight> </g:shipping_weight>',
        '    </item>',
        '  </channel>',
        '</rss>',
      ].join('\n'),
    );
  });
});

// ---------------------------------------------------------------------------
// The URL scheme is the FROZEN LEGACY LITERAL, not a deployment choice (S-09, DECLINED)
//
// A security review raised finding S-09, MEDIUM, CWE-319: product, image and channel URLs are
// emitted with a hardcoded `http://`, so an on-path attacker could rewrite the links a shopper
// follows out of a merchant feed. Its required resolution was to "Emit HTTPS-only URLs from a
// deployment-owned canonical origin; refuse insecure origin configuration."
//
// ★★ AN INTERVENING REVISION ACCEPTED IT AND THAT ACCEPTANCE IS REVERSED. This block used to
// render the same rows under `'http'` and `'https'` and assert that the scheme was the only
// difference; the subject took the scheme as a required parameter and `src/lib/config.ts` supplied
// it from `FEED_URL_SCHEME`. The cases below are that block INVERTED rather than deleted, so the
// reversal is checked by executing code and not merely claimed in a comment.
//
// WHY THE ACCEPTANCE WAS WRONG, in the terms a reviewer can check against the AAP:
//
// * AAP 0.1.1 requires preserving "the Google product-feed integration contract exactly" and AAP
//   0.8.1 freezes it. The emitted document IS the contract.
// * AAP 0.6.7 permits exactly THREE divergences in this port - the un-`var`'d scope leak, the
//   `amountOff` precision gap and the entity memo bugs. A scheme change would be a fourth.
// * The accepted revision leaned on AAP 0.4.1 enumerating three preserved hardcodings and "THE
//   SCHEME IS NOT AMONG THEM". That list enumerates the hardcodings worth ANNOTATING - the empty
//   `g:google_product_category` is the one carrying the legacy TODO - so reading it as an
//   exhaustive licence inverts it.
// * The `CGI.HTTP_HOST` symmetry argument does not carry the scheme. The HOST genuinely varied per
//   request, which is why S-15 could move its ALLOW-LIST into configuration without changing a
//   single emitted byte. The SCHEME never varied: it is a literal at all five sites.
//
// A deployment that must publish `https` URLs terminates TLS in front of this service. That is an
// infrastructure decision, and AAP 0.2.2 puts infrastructure outside this subtree entirely.
//
// NET-NEW COVERAGE per AAP 0.6.6 - CFML had no way to vary a literal, so there is no antecedent.
// ---------------------------------------------------------------------------

describe('renderGoogleProductFeed - the scheme is frozen, not supplied (S-09 declined)', () => {
  it('★★ writes http into all five URL sites, and offers no way to ask for anything else', () => {
    const document = renderGoogleProductFeed(
      [makeFullyPopulatedFeedRow()],
      FEED_HOST,
      RANGE_START_INSTANT,
    );
    const legacyOrigin = `http://${FEED_HOST}`;

    // All five sites the legacy interpolated: the channel link, the channel description, and the
    // item's link, image link and additional image link.
    expect(occurrenceCount(document, legacyOrigin)).toBe(5);
    expect(documentLines(document)[4]).toBe(`    <link>${legacyOrigin}</link>`);
    expect(documentLines(document)[5]).toBe(
      `    <description>Google Product Feed for ${legacyOrigin}</description>`,
    );
    expect(itemElementBody(document, 'link').startsWith(legacyOrigin)).toBe(true);
    expect(itemElementBody(document, 'g:image_link').startsWith(legacyOrigin)).toBe(true);
    expect(itemElementBody(document, 'g:additional_image_link').startsWith(legacyOrigin)).toBe(
      true,
    );

    // NOT ONE `https://` ORIGIN, which is the half of this that the removed parameter could
    // previously produce. The namespace URI is `http://` too, so a blanket `https` search would
    // have been vacuous; this asserts against the host instead.
    expect(document).not.toContain(`https://${FEED_HOST}`);
  });

  it('★★ takes exactly THREE arguments: a fourth scheme argument must not compile', () => {
    // THE TYPE-LEVEL HALF OF THE REVERSAL, and the case that stops the parameter creeping back.
    // `@ts-expect-error` fails the build if the error ever stops being reported, so this cannot rot
    // into a no-op the way a commented-out assertion would. The inverse case is what the earlier
    // revision asserted: that a call WITHOUT a scheme would not compile.
    expect(() =>
      // @ts-expect-error - there is no scheme parameter; the scheme is a frozen literal.
      renderGoogleProductFeed([makeFeedRow()], FEED_HOST, RANGE_START_INSTANT, 'https'),
    ).not.toThrow();
  });

  it('★ reads nothing from the environment, so no variable can retune the scheme at run time', () => {
    // `FEED_URL_SCHEME` is gone from `src/lib/config.ts`, but the stronger guarantee is that this
    // module never had an environment edge to begin with and still does not: setting the variable
    // in the process cannot reach the emitted document.
    const restore = process.env['FEED_URL_SCHEME'];
    process.env['FEED_URL_SCHEME'] = 'https';

    try {
      const document = renderGoogleProductFeed(
        [makeFullyPopulatedFeedRow()],
        FEED_HOST,
        RANGE_START_INSTANT,
      );

      expect(occurrenceCount(document, `http://${FEED_HOST}`)).toBe(5);
      expect(document).not.toContain(`https://${FEED_HOST}`);
    } finally {
      if (restore === undefined) {
        delete process.env['FEED_URL_SCHEME'];
      } else {
        process.env['FEED_URL_SCHEME'] = restore;
      }
    }
  });

  it('★★ leaves the xmlns:g NAMESPACE URI exactly as the legacy wrote it', () => {
    const document = renderGoogleProductFeed(
      [makeFullyPopulatedFeedRow()],
      FEED_HOST,
      RANGE_START_INSTANT,
    );

    // ★ THE DISTINCTION THIS CASE EXISTS TO PROTECT, and it survives the reversal unchanged.
    // `http://base.google.com/ns/1.0` is an XML NAMESPACE NAME: it is compared byte for byte by
    // every consumer and is never dereferenced. "Upgrading" it would silently change the
    // document's namespace and break the feed outright - which is the one place in this file where
    // an https-everywhere sweep would have done real damage even while the scheme was configurable.
    expect(document).toContain(`xmlns:g="${GOOGLE_NAMESPACE_URI}"`);
    expect(occurrenceCount(document, GOOGLE_NAMESPACE_URI)).toBe(1);

    // Every absolute address is accounted for: five legacy origins plus the namespace, and all six
    // on `http`.
    const urls = absoluteUrls(document);

    expect(urls).toHaveLength(6);
    expect(urls.filter((url) => url === GOOGLE_NAMESPACE_URI)).toHaveLength(1);
    expect(urls.filter((url) => url.startsWith(`http://${FEED_HOST}`))).toHaveLength(5);
    expect(urls.filter((url) => url.startsWith('https://'))).toHaveLength(0);
  });

  it('still refuses a malformed host, so removing the scheme parameter did not weaken S-15', () => {
    // The host check is independent of the scheme and must remain so. A host carrying its own
    // scheme would otherwise compose `http://http://x`.
    expect(() =>
      renderGoogleProductFeed([makeFeedRow()], 'http://evil.invalid/x', RANGE_START_INSTANT),
    ).toThrow(/no scheme/);
  });
});
