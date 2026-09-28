// Unit suite for the Google product-feed RSS renderer.
//
// SUBJECT: src/integrations/google/rssFeedRenderer.ts, the rendering half of the Google
// product-feed adapter and the port of `integrationServices/google/views/feed/product.cfm`.
//
// Coverage classification: net-new in its entirety, never to be presented as parity.
//
// The factory pattern follows meta/tests/unit/Helper.cfc as a PATTERN and rejects its MECHANISM
// entirely.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderGoogleProductFeed } from '../../../../src/integrations/google/rssFeedRenderer.js';
import type { GoogleProductFeedRow } from '../../../../src/integrations/google/googleFeedRepository.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
// Imported so the anti-divergence case can assert the SHARED grammar directly, rather than only
// through the renderer that consumes it.
import { parseHostAuthority } from '../../../../src/lib/config.js';

// Three specifiers, and the list is exhaustive.
//
// `GoogleProductFeedRow` is imported TYPE-ONLY from the repository module that declares it, never
// redeclared here: that module owns the projection shape.

// Every literal below is obviously fake, and the two instants are explicit UTC ISO 8601 string
// literals.

/**
 * The feed host, passed purely as a string input.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, which is the point: the subject writes
 * this value into five element bodies and dereferences none of them.
 */
const FEED_HOST = 'feed.example.invalid';

/**
 * The origin the subject composes, and the scheme half of it is not a variable of this suite.
 */
const FEED_ORIGIN = `http://${FEED_HOST}`;

/**
 * The image path the data-access half substitutes when a SKU or product image row carries no
 * usable file name.
 *
 * The renderer never produces this value and never inspects it; it interpolates whatever path it
 * is handed.
 */
const MISSING_IMAGE_PATH = '/assets/images/missingimage.jpg';

/**
 * The explicit range-start instant, standing in for the legacy's two `now()` calls at
 * [integrationServices/google/views/feed/product.cfm:L30].
 *
 * Deliberately in the past and carrying a sub-second component, so the second-precision truncation
 * is observable rather than accidental.
 */
const RANGE_START_INSTANT = new Date('2024-06-01T12:34:56.789Z');

/**
 * How the subject renders {@link RANGE_START_INSTANT}: UTC, seconds, `Z`.
 */
const RANGE_START_RENDERED = '2024-06-01T12:34:56Z';

/**
 * The pre-resolved sale-price expiration instant that closes the range.
 */
const SALE_EXPIRATION_INSTANT = new Date('2024-12-31T23:59:59.000Z');

/**
 * How the subject renders {@link SALE_EXPIRATION_INSTANT}.
 */
const SALE_EXPIRATION_RENDERED = '2024-12-31T23:59:59Z';

/**
 * The exact `<item>` opening line, indentation included.
 */
const ITEM_OPEN_LINE = '    <item>';

/**
 * The exact `<item>` closing line, indentation included.
 */
const ITEM_CLOSE_LINE = '    </item>';

/**
 * The namespace URI bound to the `g` prefix by the root element.
 */
const GOOGLE_NAMESPACE_URI = 'http://base.google.com/ns/1.0';

/**
 * One feed row, with every key present.
 *
 * The default row is deliberately ORDINARY rather than minimal.
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
    // The default row has a brand, so the presence key is populated and the name is what goes in
    // the element.
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
 * One feed row that emits all SIXTEEN elements, which the default row does not.
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

// Rendering and reading helpers.
//
// Two invocation helpers so the fixed host and instant are stated once, and readers that pull
// structure back out of the returned document.

/**
 * Renders a whole document from the given rows, with the fixed host and instant.
 */
function renderDocument(rows: readonly GoogleProductFeedRow[]): string {
  return renderGoogleProductFeed(rows, FEED_HOST, RANGE_START_INSTANT);
}

/**
 * Renders a single-item document from one ordinary row plus overrides.
 */
function renderOneRow(overrides: Partial<GoogleProductFeedRow> = {}): string {
  return renderDocument([makeFeedRow(overrides)]);
}

/**
 * The document split into physical lines.
 */
function documentLines(document: string): readonly string[] {
  return document.split('\n');
}

/**
 * The children of the first `<item>`, each with its leading indentation removed.
 *
 * Trailing whitespace is left untouched on purpose: the lone separating space inside an empty
 * `g:shipping_weight` body is a preserved defect.
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

/**
 * The emitted element names of the first `<item>`, in the order they appear.
 */
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

/**
 * Every emitted occurrence of one named element inside the first `<item>`.
 */
function itemElementsNamed(document: string, name: string): readonly string[] {
  return itemChildren(document).filter((child) => elementName(child) === name);
}

/**
 * How many times a literal appears in the document.
 */
function occurrenceCount(document: string, literal: string): number {
  return document.split(literal).length - 1;
}

/**
 * Every absolute URL the document contains.
 *
 * The pattern is built inside the function rather than hoisted: a global regular expression
 * carries a mutable `lastIndex`, and this file holds no mutable module-scope state.
 */
function absoluteUrls(document: string): readonly string[] {
  return document.match(/https?:\/\/[^\s<"]+/g) ?? [];
}

afterEach(() => {
  // The runner and the shared setup file both restore mocks between cases; the one spy this suite
  // installs is still torn down explicitly here so its lifetime is visible.
  vi.restoreAllMocks();
});

// The document shell.

describe('renderGoogleProductFeed - the document shell', () => {
  it('opens with a version-only XML declaration, with no encoding and no byte-order mark', () => {
    const document = renderOneRow();

    // CFML parity [integrationServices/google/views/feed/product.cfm:L1]: the template declares
    // the version and nothing else - no `encoding` or `standalone` pseudo-attribute and no
    // byte-order mark ahead of it.
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
    // reproduced character for character including its `http` scheme.
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
    // outside the root element is insignificant, so the returned string ends exactly at the
    // closing tag.
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
    // an open/close pair at every site, including the unconditionally empty one, so an absent
    // value yields an empty BODY, not a collapsed tag.
    expect(document).not.toContain('/>');
    expect(itemChildren(document)).toContain('<description></description>');
    expect(itemChildren(document)).toContain('<g:price></g:price>');
    expect(itemChildren(document)).toContain('<g:id></g:id>');
  });
});

describe('renderGoogleProductFeed - a feed with no qualifying rows', () => {
  it('renders a complete, well-formed document with an empty channel body', () => {
    const document = renderDocument([]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L16, L63]: a `<cfloop>` over
    // an empty record set emits nothing between the channel's three children and its closing tag.
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

    // JUDGMENT CALL: row ORDER is the caller's and the renderer imposes none of its own. The
    // legacy selection applies no ordering at all, so sorting here would add behaviour the legacy
    // never had.
    expect(occurrenceCount(document, '<item>')).toBe(3);
    expect(occurrenceCount(document, '</item>')).toBe(3);
    expect(document.indexOf('FAKE-SKU-FIRST')).toBeLessThan(document.indexOf('FAKE-SKU-SECOND'));
    expect(document.indexOf('FAKE-SKU-SECOND')).toBeLessThan(document.indexOf('FAKE-SKU-THIRD'));
  });
});

// The sixteen-element order table.

describe('renderGoogleProductFeed - the per-item element order', () => {
  /**
   * 1 g:id L17 sku code 2 title L18 product calculated title 3 description L19 fallback chain,
   * always emitted 4 g:google_product_category L20 empty.
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
    // containment checks: a reordering that kept every element would pass the latter and fail
    // this.
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

    // JUDGMENT CALL: whitespace BETWEEN elements is insignificant to XML and is not part of the
    // contract - the template indented with tabs, the port indents with two spaces per level. The
    // nesting DEPTH is asserted anyway because it is cheap to hold.
    expect(lines).toContain(ITEM_OPEN_LINE);
    expect(lines).toContain(ITEM_CLOSE_LINE);
    expect(lines).toContain('      <g:condition>new</g:condition>');
  });

  it('omits element eight entirely when the product has no additional images', () => {
    const document = renderOneRow({ additionalImageLinkPaths: [] });

    // The absent element leaves no placeholder and no empty element behind, and the fifteen that
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

    // CFML parity [integrationServices/google/views/feed/product.cfm:L22]: the host and the path
    // are two interpolations inside one literal string, and CFML stringifies an absent path to
    // nothing, so the element body collapses to the origin rather than disappearing.
    expect(itemElementBody(document, 'link')).toBe(FEED_ORIGIN);
  });

  it('renders a fallback additional-image path as an ordinary element, skipping nothing', () => {
    // The data-access half substitutes the missing-image path per unusable image ROW rather than
    // dropping the row.
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
    const document = renderOneRow();

    // The required member is the guarantee, and this pins the observable half of it: whatever the
    // row carries, the image element has a path after the origin.
    expect(itemElementBody(document, 'g:image_link')).not.toBe(FEED_ORIGIN);
    expect(itemElementBody(document, 'g:image_link')).toBe(
      `${FEED_ORIGIN}/fake-image-base/product/default/fake-sku-image.jpg`,
    );
  });

  it('renders the missing-image fallback like any other path, never as a bare origin', () => {
    // The absent-image ROW is still exercised - it is the case the earlier assertion was about -
    // but the expectation now pins the fallback the source actually produced.
    const document = renderOneRow({ imageLinkPath: MISSING_IMAGE_PATH });

    expect(itemElementBody(document, 'g:image_link')).toBe(`${FEED_ORIGIN}${MISSING_IMAGE_PATH}`);
    expect(itemElementBody(document, 'g:image_link')).not.toBe(FEED_ORIGIN);
  });
});

// The description fallback chain.

describe('renderGoogleProductFeed - element 3, the description fallback', () => {
  it('prefers the product description when it has length', () => {
    const document = renderOneRow({
      productDescription: 'Fake product description.',
      productTypeDescription: 'Fake product type description.',
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L19]: the first branch is
    // `len(product.getProductDescription())`, so the product's own description wins whenever it
    // has characters.
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
    // `<cfif>`/`<cfelseif>` pair has no final `<cfelse>`, and the element itself is emitted
    // unconditionally OUTSIDE the conditional. The third outcome is a PRESENT element with an
    // EMPTY body.
    expect(itemElementBody(document, 'description')).toBe('');
    expect(itemChildren(document)).toContain('<description></description>');
    expect(itemElementNames(document)).toContain('description');
  });

  it('emits an empty description element when both candidates are empty strings', () => {
    const document = renderOneRow({ productDescription: '', productTypeDescription: '' });

    expect(itemChildren(document)).toContain('<description></description>');
  });
});

// The two hardcoded literals.

describe('renderGoogleProductFeed - elements 9 and 10, the hardcoded literals', () => {
  it('emits condition and availability as unconditional literals for every item', () => {
    const document = renderDocument([
      makeFeedRow({ skuCode: 'FAKE-SKU-FIRST', productCalculatedQATS: 1 }),
      makeFullyPopulatedFeedRow({ skuCode: 'FAKE-SKU-SECOND', productCalculatedQATS: 999 }),
    ]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L25-L26]: both bodies are
    // hardcoded literals with nothing behind them - no setting, no argument, no lookup, no
    // per-item derivation and, for availability, no STOCK CHECK of any kind.
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

// Element 4 - the empty product category.

describe('renderGoogleProductFeed - element 4, the empty product category', () => {
  it('emits the product category element with an empty body, always', () => {
    const document = renderDocument([
      makeFeedRow({ skuCode: 'FAKE-SKU-FIRST' }),
      makeFullyPopulatedFeedRow({ skuCode: 'FAKE-SKU-SECOND' }),
    ]);

    // LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]:
    // g:google_product_category is emitted as an empty element - the template never supplies a
    // value from any source.
    // Preserved deliberately; do not fix without a product decision.
    //
    // There is no literal TODO on L20 or near it. The TODO the shipped renderer carries beside
    // this element is therefore PORT-AUTHORED rather than carried forward, and says so itself.
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

// Element 16 - the unguarded shipping weight.

describe('renderGoogleProductFeed - element 16, the unguarded shipping weight', () => {
  // Do not confuse `skuShippingWeightUnitCode` with `globalWeightUnitCode`
  // [model/service/SettingService.cfc:L180] - distinct keys sharing one default.

  it('emits the weight and its unit separated by one literal space - characterization A', () => {
    // Default-path characterization: the legacy defaults stringify as `1` and `lb`, so the body is
    // `1 lb`.
    const document = renderOneRow({ skuShippingWeight: '1', skuShippingWeightUnitCode: 'lb' });

    // LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L58]: g:shipping_weight is
    // emitted with no guard and a hardcoded literal space between its two interpolations.
    // Preserved deliberately; do not fix without a product decision.
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

    // A number would have rendered `3.5`. The projection carries a string and the renderer emits
    // it unchanged, keeping a non-money measure out of the money path.
    expect(itemElementBody(document, 'g:shipping_weight')).toBe('3.500 fakeunit');
  });

  it('emits the weight element last, after the item group id', () => {
    const document = renderOneRow();
    const names = itemElementNames(document);

    expect(names.slice(-2)).toEqual(['g:item_group_id', 'g:shipping_weight']);
  });
});

// The five-entity XML escaper.
//
// JUDGMENT CALL: the port escapes all emitted text UNIFORMLY through all five predefined XML
// entities - a HARDENING, recorded as a correction rather than as parity at the eight bare sites.

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
    // The order is the correctness argument. `&` is replaced before any replacement that
    // introduces an entity of its own, so a bare `<` becomes `&lt;` and never `&amp;lt;`.
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

    // This case once supplied `'feed.example.invalid?tenant=a&locale=b'` as the host, and asserted
    // the resulting `&amp;` in all five host sites.
    //
    // The ESCAPING this case exists for is unchanged and is now carried entirely by the ROW, which
    // is where an ampersand genuinely originates: a SKU code, a title, a description, a
    // breadcrumb.

    // The six sites the legacy escaped.
    expect(itemElementBody(document, 'g:id')).toBe('SKU&amp;1');
    expect(itemElementBody(document, 'title')).toBe('Title&amp;1');
    expect(itemElementBody(document, 'description')).toBe('Description&amp;1');
    expect(itemElementBody(document, 'g:product_type')).toBe('Type&amp;1');
    expect(itemElementBody(document, 'g:brand')).toBe('Brand&amp;1');
    expect(itemElementBody(document, 'g:item_group_id')).toBe('PRODUCT&amp;1');

    // The eight the legacy did not - hardened, and asserted so the hardening is pinned rather than
    // incidental.
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

    // The two channel lines carry no ampersand to escape, and cannot, and that is a consequence of
    // the origin guard rather than a gap in this test.
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

// The price-source asymmetry.

// 11b. Code points XML 1.0 forbids, elided before escaping.
//
// DELIBERATE DIVERGENCE from the legacy, which is why the block carries this prose.

/**
 * Every code point of the document, verified against XML 1.0's `Char` production.
 *
 * Iterating with `for...of` walks CODE POINTS rather than UTF-16 units, so a well-formed surrogate
 * pair presents as one value above #xFFFF and is accepted.
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
      // Self-closing needs no partner. This renderer emits none, which its own case in the shell
      // block asserts, so reaching here would itself be news.
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
  /**
   * The forbidden C0 controls, each named so a failure says which one escaped.
   */
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

      // The surrounding text survives whole - this elides the offending code point and does not
      // discard the field.
      expect(itemElementBody(document, 'title'), name).toBe('FakeTitle');
      expect(document, name).not.toContain(character);
      assertXmlCharProduction(document);
    }
  });

  it('elides the NUL that a standards-compliant parser would reject the document for', () => {
    const document = renderOneRow({ skuCode: 'FAKE\u0000SKU' });

    expect(itemElementBody(document, 'g:id')).toBe('FAKESKU');
    expect(document).not.toContain('\u0000');
    assertXmlCharProduction(document);
    assertBalancedMarkup(document);
  });

  it('keeps tab, line feed and carriage return, which the production permits', () => {
    const document = renderOneRow({ calculatedTitle: 'a\tb\nc\rd' });

    // KEPT on PURPOSE. All three are legal `Char`s, so eliding them would be data loss with no
    // correctness gain.
    expect(document).toContain('a\tb\nc\rd');
    assertXmlCharProduction(document);
  });

  it('keeps the C1 range, because XML 1.0 permits it and the document declares 1.0', () => {
    const document = renderOneRow({ calculatedTitle: 'a\u007Fb\u0085c\u009Fd' });

    // A DECISION, not AN OVERSIGHT. Only XML 1.1 restricts #x7F-#x9F, and this document opens
    // `<?xml version="1.0"?>` - asserted in the shell block - so these survive.
    expect(itemElementBody(document, 'title')).toBe('a\u007Fb\u0085c\u009Fd');
    expect(documentLines(document)[0]).toBe('<?xml version="1.0"?>');
    assertXmlCharProduction(document);
  });

  it('elides the two permanently-unassigned code points at the end of the BMP', () => {
    const document = renderOneRow({ calculatedTitle: 'a\uFFFEb\uFFFFc' });

    // #xFFFE and #xFFFF fall outside `[#xE000-#xFFFD]` and are forbidden even though they are not
    // controls.
    expect(itemElementBody(document, 'title')).toBe('abc');
    assertXmlCharProduction(document);
  });

  it('keeps a well-formed surrogate pair, which encodes a legal code point', () => {
    const document = renderOneRow({ calculatedTitle: 'a\u{1F600}b' });

    // U+1F600 is inside `[#x10000-#x10FFFF]`. Eliding the pair would corrupt every emoji, CJK
    // extension and historic script a real catalog carries.
    expect(itemElementBody(document, 'title')).toBe('a\u{1F600}b');
    expect(document).toContain('\u{1F600}');
    assertXmlCharProduction(document);
  });

  it('elides a lone high surrogate but keeps the pair that follows it', () => {
    // A lone surrogate encodes nothing and sits in the forbidden #xD800-#xDFFF gap. It reaches
    // here from any column written through a lossy conversion.
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
    // Low followed by high. Each half must be caught by a different rule, which is why the two
    // cannot be folded into one character class.
    const document = renderOneRow({ calculatedTitle: `a\uDE00\uD83Db` });

    expect(itemElementBody(document, 'title')).toBe('ab');
    assertXmlCharProduction(document);
  });

  it('elides before escaping, so no forbidden code point can hide inside an entity', () => {
    // Order matters, and this pins it.
    const document = renderOneRow({ calculatedTitle: 'a&\u0000b' });

    expect(itemElementBody(document, 'title')).toBe('a&amp;b');
    expect(document).not.toContain('\u0000');
    assertXmlCharProduction(document);
  });

  it('covers every externally sourced text field, not just the one it was found in', () => {
    // The FUNNEL is the FIX. Every interpolated body routes through one escaper, so one elision
    // pass covers all fourteen sites.
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
    // The description element has two candidate sources and the fallback is a separate read, so it
    // is exercised separately.
    const document = renderOneRow({
      productDescription: '',
      productTypeDescription: 'Type\u000Bdescription',
    });

    expect(itemElementBody(document, 'description')).toBe('Typedescription');
    assertXmlCharProduction(document);
  });

  it('renders a parseable document for a row with every value it could carry', () => {
    // The regression backstop for the block: the fully populated row, checked against both
    // properties that make a document parseable at all.
    const document = renderDocument([makeFullyPopulatedFeedRow(), makeFeedRow()]);

    assertXmlCharProduction(document);
    assertBalancedMarkup(document);
    expect(document.endsWith('</rss>')).toBe(true);
  });

  it('verifies the verifier: the Char reader really does reject a forbidden byte', () => {
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
    // line reads the SKU's own price and the SKU's sale price.
    expect(itemElementBody(document, 'g:price')).toBe('24.5');
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
    //
    // `'1.00'` in, `'1'` out: the template applies no mask, so a trailing-zero scale does not
    // survive stringification.
    expect(itemElementBody(document, 'g:price')).toBe('24.5');
    expect(itemElementBody(document, 'g:sale_price')).toBe('1');
  });

  it('★★★ stringifies the price the way CFML does, applying NO mask and NO rounding', () => {
    const wholeUnits = renderOneRow({ productPrice: Money.fromDecimalString('9') });
    const trailingZero = renderOneRow({ productPrice: Money.fromDecimalString('9.50') });
    const oneDecimal = renderOneRow({ productPrice: Money.fromDecimalString('9.5') });
    const manyDecimals = renderOneRow({ productPrice: Money.fromDecimalString('1234.567') });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L27]: the body is a bare
    // interpolation, `#local.sku.getProduct().getPrice()#`, with no `numberFormat` and no
    // `decimalFormat` anywhere in the template.
    expect(itemElementBody(wholeUnits, 'g:price')).toBe('9');
    expect(itemElementBody(trailingZero, 'g:price')).toBe('9.5');
    expect(itemElementBody(oneDecimal, 'g:price')).toBe('9.5');
    expect(itemElementBody(manyDecimals, 'g:price')).toBe('1234.567');

    // The feed emits the price as the legacy template did, with no two-decimal normalisation:
    // AAP 0.8.1 requires the feed's observable behaviour to be preserved exactly, and AAP 0.6.7
    // authorizes only three deliberate divergences, none of them here.
    expect(itemElementBody(manyDecimals, 'g:price')).not.toBe('1234.57');
    expect(itemElementBody(trailingZero, 'g:price')).not.toBe('9.50');

    // And the rendering really is the value object's full-precision numeral, not a masked one.
    expect(itemElementBody(oneDecimal, 'g:price')).toBe(
      Money.fromDecimalString('9.5').toDecimalString(),
    );
    expect(itemElementBody(oneDecimal, 'g:price')).not.toBe(
      Money.fromDecimalString('9.5').toFixed2(),
    );
  });

  it('emits an empty price element when the product has no price, never a zero', () => {
    const document = renderOneRow({
      productPrice: undefined,
      skuPrice: Money.fromDecimalString('19.99'),
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L27]: an absent price
    // stringifies to nothing, so the element is emitted with an EMPTY body.
    //
    // Zero is never substituted: a feed advertising `0.00` offers the product free.
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

// Elements 12 and 13 - the sale price and its effective-date range.

describe('renderGoogleProductFeed - elements 12 and 13, the gated sale block', () => {
  it('emits both elements when the SKU sale price is strictly below the SKU price', () => {
    const document = renderOneRow({
      productPrice: Money.fromDecimalString('24.5'),
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L28-L31]: both elements sit
    // inside one conditional, so they are emitted together or not at all.
    expect(itemElementBody(document, 'g:sale_price')).toBe('9.5');
    expect(itemElementBody(document, 'g:sale_price_effective_date')).toBe(
      `${RANGE_START_RENDERED}/${SALE_EXPIRATION_RENDERED}`,
    );
    expect(itemElementNames(document)).toContain('g:sale_price');
    expect(itemElementNames(document)).toContain('g:sale_price_effective_date');

    // And the advertised price is still the product's, inside the sale case too.
    expect(itemElementBody(document, 'g:price')).toBe('24.5');
  });

  it('emits a well-formed ISO 8601 UTC interval driven by the supplied instant', () => {
    const document = renderOneRow({
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });
    const range = itemElementBody(document, 'g:sale_price_effective_date');

    // JUDGMENT CALL: this is a CORRECTION of a malformed legacy formulation, so it carries no
    // defect marker.
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

    // The legacy gate is strictly greater than, so equal prices are not a sale.
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

    // The state under test is still reachable, which is why the case survives.
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
    // where the legacy tested the comparison alone.
    expect(noSkuPrice).not.toContain('g:sale_price');
    expect(noSalePrice).not.toContain('g:sale_price');
  });

  it('★★★ still advertises the sale when the expiration instant is absent', () => {
    const document = renderOneRow({
      skuPrice: Money.fromDecimalString('19.99'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: undefined,
    });
    expect(itemElementBody(document, 'g:sale_price')).toBe('9.5');
    expect(itemElementNames(document)).toContain('g:sale_price');
    expect(itemElementNames(document)).not.toContain('g:sale_price_effective_date');
  });

  it('★★★ still advertises the sale when the request instant cannot be rendered', () => {
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
    expect(itemElementBody(document, 'g:sale_price')).toBe('9.5');
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

    expect(itemElementBody(document, 'g:sale_price')).toBe('9.5');
    expect(itemElementNames(document)).not.toContain('g:sale_price_effective_date');
    expect(document).not.toContain('NaN');
  });

  it('emits BOTH elements, in order, when the whole window is renderable', () => {
    // The unchanged happy path, asserted alongside the three degraded ones so the restructured
    // gate cannot quietly stop emitting the interval it still owes.
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
    // both elements.
    const notOnSale = renderOneRow({
      skuPrice: Money.fromDecimalString('9.5'),
      skuSalePrice: Money.fromDecimalString('9.5'),
      salePriceExpirationDateTime: SALE_EXPIRATION_INSTANT,
    });

    expect(notOnSale).not.toContain('g:sale_price');
    expect(itemElementNames(notOnSale)).not.toContain('g:sale_price_effective_date');
  });
});

// Element 14 - the independently gated brand.

describe('renderGoogleProductFeed - element 14, the brand', () => {
  it('emits the brand element when the row carries a brand name', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: 'Fake Brand' });

    // CFML parity [integrationServices/google/views/feed/product.cfm:L32]: the guard is
    // `not isNull(local.sku.getProduct().getBrand())` and it is meaningful because the brand is
    // joined LEFT, so a product with no brand appears in the feed.
    expect(itemElementBody(document, 'g:brand')).toBe('Fake Brand');
  });

  it('emits an EMPTY brand element when the association is present but the name is absent', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: undefined });
    expect(itemElementBody(document, 'g:brand')).toBe('');
    expect(itemChildren(document)).toContain('<g:brand></g:brand>');
    expect(itemElementNames(document)).toContain('g:brand');
  });

  it('omits the brand element entirely when the product carries no brand', () => {
    const document = renderOneRow({ brandID: undefined, brandName: undefined });

    // Omitted, not emptied, and the neighbouring elements close up around the gap while keeping
    // their relative order.
    expect(document).not.toContain('g:brand');
    expect(itemElementNames(document)).not.toContain('g:brand');
    expect(itemElementNames(document).slice(-3)).toEqual([
      'g:price',
      'g:item_group_id',
      'g:shipping_weight',
    ]);
  });

  it('omits the brand element when the association is absent even though a name is carried', () => {
    const document = renderOneRow({ brandID: undefined, brandName: 'Fake Brand' });

    expect(document).not.toContain('g:brand');
    expect(document).not.toContain('Fake Brand');
  });

  it('emits an empty brand element when the brand name is an empty string', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: '' });

    // An empty string and an absent name render identically, and that is correct rather than a
    // coincidence: CFML stringifies both to nothing at the interpolation site, so the source could
    // not tell them apart either.
    //
    // CONTRACT another MODULE OWNS." The concession named a real divergence and then declined to
    // close it on ownership grounds.
    expect(itemElementBody(document, 'g:brand')).toBe('');
    expect(itemChildren(document)).toContain('<g:brand></g:brand>');
  });

  it('emits an empty brand element when the brand exists but records no name', () => {
    const document = renderOneRow({ brandID: 'fake-brand-id-1', brandName: undefined });
    expect(itemElementNames(document)).toContain('g:brand');
    expect(itemChildren(document)).toContain('<g:brand></g:brand>');
  });

  it('gates on the brand identifier rather than on the brand name', () => {
    // NET-NEW. Holding the name fixed and moving only the identifier isolates the gate: the same
    // name emits or does not emit purely on brand presence.
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
    // display-only format hint.
    expect(document).not.toContain('brandWebsite');
    expect(document).not.toContain('g:link');
    expect(itemElementsNamed(document, 'g:brand')).toEqual(['<g:brand>Fake Brand</g:brand>']);
  });
});

// The elements the template documents but never emitted.

describe('renderGoogleProductFeed - the commented-out legacy elements', () => {
  /**
   * Every element name held inside one of the template's three comment blocks:
   * [integrationServices/google/views/feed/product.cfm:L33-L38],
   * [integrationServices/google/views/feed/product.cfm:L40-L57] and
   * [integrationServices/google/views/feed/product.cfm:L59-L61].
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

// Purity, the host argument, and the absence of any network target.

describe('renderGoogleProductFeed - purity and the host argument', () => {
  it('writes the supplied host into all five sites the legacy interpolated', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);

    // CFML parity [integrationServices/google/views/feed/product.cfm:L14-L15, L22-L24]: the legacy
    // interpolated `CGI.HTTP_HOST` at five sites, each prefixed with a hardcoded `http://`.
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

    // CFML parity [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24]: the
    // literal is `http://` at every one of the five sites and never `https`.
    //
    // This case has held both names and both arguments, so the record is worth being exact about.
    expect(document).not.toContain('https');
    // Six, not five: the five origin sites plus the `xmlns:g` namespace URI, which is an
    // identifier rather than a transport and is asserted separately never to move.
    expect(occurrenceCount(document, 'http://')).toBe(6);
  });

  it('contains no absolute address other than the placeholder host and the namespace', () => {
    const document = renderDocument([makeFullyPopulatedFeedRow()]);
    const urls = absoluteUrls(document);

    // Every absolute address is accounted for: five are the placeholder origin the caller
    // supplied, and the sixth is the namespace URI in the root element's `xmlns:g` attribute.
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
    // This case has now been written three times, and the trail is worth keeping.
    //
    // It first read "accepts an empty host without failing, exactly as the legacy accepted one",
    // justified by: "the legacy never validated `CGI.HTTP_HOST` - it emitted whatever the engine
    // reported.
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

// 13b. The feed origin, refused rather than concatenated.
//
// Divergence from the legacy, which is why the block carries this much prose.
//
// The legacy template interpolated `CGI.HTTP_HOST` at five sites
// [integrationServices/google/views/feed/product.cfm:L14-L15, L22-L24] and validated it at none.

describe('renderGoogleProductFeed - feed origin validation', () => {
  /**
   * Renders with the supplied host and returns the raised error, or throws if none was.
   */
  function captureOriginRefusal(feedHost: string): Error {
    try {
      renderGoogleProductFeed([makeFeedRow()], feedHost, RANGE_START_INSTANT);
    } catch (error: unknown) {
      if (error instanceof Error) {
        return error;
      }

      throw new Error(`expected an Error, received ${typeof error}`);
    }

    // Reached only when the guard let the value through, which a truncated or partially-rendered
    // document could otherwise disguise as a pass.
    throw new Error(`expected a refusal for host ${JSON.stringify(feedHost)}, none was raised`);
  }

  it('refuses an empty host, which the legacy accepted and rendered as a bare scheme', () => {
    const error = captureOriginRefusal('');

    // The legacy emitted `http://` on its own at all five sites when the header was absent. That
    // is not a usable feed, and it is the one refusal whose legacy behaviour is directly
    // observable, so it is asserted first.
    expect(error.message).toContain('it was empty');
    expect(error.message).toContain('No feed was rendered');
  });

  it('refuses a host carrying a scheme, because this module owns the scheme', () => {
    // `http://x` would compose `http://http://x`, and `https://x` would compose a document whose
    // links carry two schemes.
    expect(captureOriginRefusal('http://shop.example.invalid').message).toContain('no scheme');
    expect(captureOriginRefusal('https://shop.example.invalid').message).toContain('no scheme');
    expect(captureOriginRefusal('//shop.example.invalid').message).toContain('no scheme');
  });

  it('refuses a host carrying a path, which would silently reparent every url', () => {
    expect(captureOriginRefusal('shop.example.invalid/checkout').message).toContain('no path');
    expect(captureOriginRefusal('shop.example.invalid/').message).toContain('no path');
  });

  it('refuses embedded credentials, which move the real authority past the @', () => {
    // `shop.example.invalid@evil.invalid` resolves to `evil.invalid`, with the part a human reads
    // first demoted to a username. This is the highest-value single case in the block.
    const error = captureOriginRefusal('shop.example.invalid@evil.invalid');

    expect(error.message).toContain('no credentials');
    expect(captureOriginRefusal('user:secret@evil.invalid').message).toContain('no credentials');
  });

  it('refuses a query or a fragment', () => {
    expect(captureOriginRefusal('shop.example.invalid?tenant=a').message).toContain('no query');
    expect(captureOriginRefusal('shop.example.invalid#frag').message).toContain('no fragment');
  });

  it('refuses whitespace anywhere, and never trims it away', () => {
    // Trimming would ACCEPT a padded value and quietly change it, which is a worse outcome than
    // refusing: the operator would never learn their configuration was malformed. All three
    // positions are refused identically.
    expect(captureOriginRefusal(' shop.example.invalid').message).toContain('no whitespace');
    expect(captureOriginRefusal('shop.example.invalid ').message).toContain('no whitespace');
    expect(captureOriginRefusal('shop example.invalid').message).toContain('no whitespace');
    expect(captureOriginRefusal('   ').message).toContain('no whitespace');
  });

  it('refuses the CR and LF a header-splitting payload needs', () => {
    // These would also survive `escapeXmlText`, which escapes markup and not layout, so refusing
    // them here is the only place they are stopped.
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

    // The MESSAGE never ECHOES the REJECTED ORIGIN. Reproducing it would write caller-controlled
    // bytes into a log line, and the constraint is what an operator holding a legitimate host
    // actually needs to read.
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

      // No fragment of the rejected input reaches the message. `evil.invalid` and `secret` are the
      // two a leak would be most damaging for.
      expect(error.message).not.toContain('evil.invalid');
      expect(error.message).not.toContain('secret');
      expect(error.message).not.toContain('checkout');
      expect(error.message).toContain('No feed was rendered');
    }
  });

  it('refuses BEFORE emitting anything, so no partial document escapes', () => {
    // The guard runs on the first line of the body, ahead of origin composition and ahead of every
    // row.
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

    // RFC 3986 requires the brackets, which is also what keeps the colon-rich form from being read
    // as a host-and-port. The unbracketed form is refused.
    expect(documentLines(document)[4]).toBe('    <link>http://[2001:db8::1]</link>');
    expect(captureOriginRefusal('2001:db8::1').message).toContain('bare host');
  });

  it('accepts the underscore some internal hostnames carry', () => {
    // Not permitted by RFC 1123 for a public name, but common in internal DNS, and refusing it
    // would break a legitimate deployment for no security gain: an underscore cannot change which
    // authority a URL resolves to.
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
    // The port range, and it was unchecked on both sides.
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
    // `:065535` and `:65535` denote the same port to a resolver and are different strings to every
    // comparison this subtree makes - so an allow-list entry written one way would not match a
    // feed host written the other.
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
    // halves has them without re-splitting the string.
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
    // The guard checks shape and cannot check provenance, and this test pins that limit so nobody
    // mistakes the guard for more than it is. `evil.invalid` is a perfectly well-formed host and
    // renders cleanly.
    const document = renderGoogleProductFeed([makeFeedRow()], 'evil.invalid', RANGE_START_INSTANT);

    expect(documentLines(document)[4]).toBe('    <link>http://evil.invalid</link>');
  });
});

// The complete document, asserted as one literal string.

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
        '      <g:price>24.5</g:price>',
        '      <g:sale_price>9.5</g:sale_price>',
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
        // Not `undefined`, and the difference is the point.
        imageLinkPath: MISSING_IMAGE_PATH,
        additionalImageLinkPaths: [],
        productPrice: undefined,
        skuPrice: undefined,
        skuSalePrice: undefined,
        salePriceExpirationDateTime: undefined,
        // The brand ELEMENT is gated on the association, not on the name, so an absent name alone
        // no longer suppresses element fourteen.
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

// AAP 0.1.1 requires preserving "the Google product-feed integration contract exactly" and AAP
// 0.8.1 freezes it.
//
// A deployment that must publish `https` URLs terminates TLS in front of this service.
//
// net-new coverage per AAP 0.6.6 - CFML had no way to vary a literal, so there is no antecedent.

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

    // Not one `https://` ORIGIN anywhere in the document: the renderer takes no scheme parameter,
    // so there is nothing that could produce one.
    expect(document).not.toContain(`https://${FEED_HOST}`);
  });

  it('★★ takes exactly THREE arguments: a fourth scheme argument must not compile', () => {
    // `@ts-expect-error` fails the build if the error ever stops being reported, so this cannot rot
    expect(() =>
      // @ts-expect-error - there is no scheme parameter; the scheme is a frozen literal.
      renderGoogleProductFeed([makeFeedRow()], FEED_HOST, RANGE_START_INSTANT, 'https'),
    ).not.toThrow();
  });

  it('★ reads nothing from the environment, so no variable can retune the scheme at run time', () => {
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

    // The namespace URI is an IDENTIFIER rather than a fetched location, so it is not a cleartext
    // link and is written exactly as the legacy wrote it.
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
