/**
 * ProductFeedBuilder — the Google merchant product feed serializer.
 *
 * COVERAGE PROVENANCE: **NET-NEW**, and said so plainly (AAP §0.6.5, §0.8.3.7).
 * ---------------------------------------------------------------------------
 * This suite extends NO legacy coverage, and no parity of coverage is claimed or implied. The
 * legacy repository contains no feed test of any kind: `meta/tests/` holds nothing for
 * `integrationServices/google/views/feed/product.cfm`, for its controller, or for its DAO. AAP
 * §0.4.1.12 names this exact path — `slatwall-ts/test/integrations/ProductFeedBuilder.test.ts` —
 * and labels it NET-NEW, with the mandate "asserts every field mapping and both conditional
 * branches". That mandate is discharged here by the FULL-DOCUMENT assertions in section 2 and the
 * branch assertions in section 3.
 *
 * MXUnit and CFSelenium are not vendored, so the legacy suite cannot be executed in this
 * environment at all. Nothing below was verified by running a legacy test and diffing output; every
 * parity claim rests on the cited source locator instead.
 *
 * WHAT SECTIONS 4 THROUGH 7 ARE FOR
 * --------------------------------
 * They are the remediation coverage for security finding SEC-06 (CWE-91 XML injection, CWE-79),
 * whose three parts the builder implements as DECISION G-1 (a validated, configured host authority),
 * DECISION G-2 (URL paths may not introduce an authority or break out of an element) and
 * DECISION G-3 (every dynamic text node is escaped, exactly once, at its emission site).
 *
 * Each section pins one half of the finding, and section 4 exists specifically to prove that the
 * hardening did NOT disturb the six fields the legacy already escaped — a fix that closed the
 * finding while changing those six would have traded one defect for another.
 *
 * The builder needs no database, no network, no live paginated query, no process environment, no
 * request scope and no file system, so every collaborator below is a plain object. That testability
 * is the reason the module takes three narrow interfaces rather than reaching for services.
 */

import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { Brand } from '../../src/domain/product/Brand';
import { Sku } from '../../src/domain/sku/Sku';
import { DomainError } from '../../src/errors/DomainError';
import {
  ProductFeedBuilder,
  validateFeedHostAuthority,
} from '../../src/integrations/google/ProductFeedBuilder';
import type {
  ProductFeedImage,
  ProductFeedRecord,
  ProductFeedRenderContext,
} from '../../src/integrations/google/ProductFeedBuilder';
import { toImageWebPath } from '../../src/ports/ImagePathPort';
import type {
  ImagePathPort,
  ImageWebPath,
  ResizedImagePathRequest,
} from '../../src/ports/ImagePathPort';
import type { PricingPort, SalePriceDetailsBySkuId } from '../../src/ports/PricingPort';
import type {
  SettingName,
  SettingResolverPort,
  SettingValue,
} from '../../src/ports/SettingResolverPort';

/* ================================================================================================
 * FIXTURES — 32-character identifiers, per IR-6
 * ============================================================================================= */

const SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const PRODUCT_TYPE_ID = 'ccccccccccccccccccccccccccccccc3';

/**
 * The four setting keys the feed path reads, with values chosen so that every one of them is
 * visible in the rendered document and none of them is empty.
 */
const DEFAULT_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
  globalURLKeyProduct: 'product',
  imageMissingImagePath: '/missing.png',
  skuShippingWeight: '5',
  skuShippingWeightUnitCode: 'lb',
});

function makeSettings(overrides: Readonly<Record<string, string>> = {}): SettingResolverPort {
  return {
    setting: (settingName: SettingName): SettingValue =>
      overrides[settingName] ?? DEFAULT_SETTINGS[settingName] ?? '',
  };
}

/**
 * @param resized maps the request's `imagePath` to the resolved resized path. Identity by default,
 *   which is the realistic shape: the adapter returns the same composed path when no resize
 *   argument is supplied, and `product.cfm:L23` and `:L24` supply none.
 */
function makeImagePaths(
  resized: (imagePath: string) => string = (imagePath) => imagePath,
): ImagePathPort {
  return {
    getImagePath: (imageFile: string): Promise<ImageWebPath> =>
      Promise.resolve(toImageWebPath(`/product/default/${imageFile}`)),
    getResizedImagePath: (request: ResizedImagePathRequest): Promise<ImageWebPath> =>
      Promise.resolve(toImageWebPath(resized(request.imagePath))),
    getImageExistsFlag: (): Promise<boolean> => Promise.resolve(true),
    saveImageFile: (): Promise<boolean> => Promise.resolve(true),
  };
}

function makePricing(details: SalePriceDetailsBySkuId = {}): PricingPort {
  return {
    getSalePriceDetailsForProductSkus: (): Promise<SalePriceDetailsBySkuId> =>
      Promise.resolve(details),
  };
}

interface Fixture {
  readonly sku: Sku;
  readonly product: Product;
  readonly productType: ProductType;
}

function makeFixture(): Fixture {
  const productType = new ProductType();
  productType.productTypeID = PRODUCT_TYPE_ID;
  productType.productTypeName = 'Merchandise';
  productType.productTypeDescription = 'Type level description';

  const product = new Product();
  product.productID = PRODUCT_ID;
  product.calculatedTitle = 'Nike Air Jorden';
  product.productDescription = 'Product level description';
  product.productCode = 'NIKE-AIR';
  product.urlTitle = 'nike-air-jorden';
  product.price = 100;
  product.productType = productType;

  const sku = new Sku();
  sku.skuID = SKU_ID;
  sku.skuCode = 'SKU-001';
  sku.price = 100;
  sku.imageFile = 'nike.jpg';
  sku.product = product;

  return { sku, product, productType };
}

function record(sku: Sku, productImages: readonly ProductFeedImage[] = []): ProductFeedRecord {
  return { sku, productImages };
}

/**
 * @param host passed through {@link validateFeedHostAuthority}, exactly as DECISION G-1 obliges the
 *   handler layer to do.
 * @param utcHourOffset emitted unmodified, per {@link ProductFeedRenderContext.utcHourOffset}.
 */
function makeContext(host = 'store.example.com', utcHourOffset = '5'): ProductFeedRenderContext {
  return {
    host: validateFeedHostAuthority(host),
    /* The host under test is the configured one, so every case here exercises the field mapping
     * rather than the membership gate. `ProductFeedRenderContext.allowedHosts` is required and IS
     * consulted by `build`, which fails closed on an empty list — the gate itself is covered by the
     * host cases above, which drive `validateFeedHostAuthority` directly. */
    allowedHosts: [host],
    /* ⚠️ A TRUE INSTANT, CONSTRUCTED IN UTC ON PURPOSE — and it did not always read this way.
     *
     * It was `new Date(2026, 6, 31, 13, 45, 9)` — a value whose LOCAL components were 13:45:09 —
     * because the builder then rendered the timestamp from local accessors and merely appended the
     * offset label. Finding F15 established that as a defect: on a UTC host (which is what a Lambda
     * container is) a context offset of `5` produced UTC components labelled `-5`, i.e. a timestamp
     * five hours wrong, and the emitted document changed with the HOST's timezone configuration
     * rather than with anything a caller asked for. `renderTime` is documented as "the render
     * instant", and the builder now computes the wall clock FOR the supplied offset from it.
     *
     * Two consequences follow, and both are improvements this suite keeps rather than concessions:
     * the instant is written with `Date.UTC` so no case here depends on the host's zone, and the
     * expected components below are the instant SHIFTED by the offset the label reports — which is
     * the invariant the legacy had for free, because `now()` and `getTimeZoneInfo().utcHourOffset`
     * both came from one engine's one zone (`product.cfm:L30`). */
    renderTime: new Date(Date.UTC(2026, 6, 31, 13, 45, 9)),
    utcHourOffset,
  };
}

function makeBuilder(
  settings: SettingResolverPort = makeSettings(),
  pricing: PricingPort = makePricing(),
  imagePaths: ImagePathPort = makeImagePaths(),
): ProductFeedBuilder {
  return new ProductFeedBuilder(imagePaths, pricing, settings);
}

/**
 * Captures whatever a render threw, so a message can be asserted on directly.
 *
 * The same idiom `test/services/BrandService.test.ts` and `test/services/SkuService.test.ts` use:
 * `expect.objectContaining` would force an `any`-typed matcher through the assertion, whereas
 * narrowing an `unknown` after `toBeInstanceOf` keeps the check typed.
 */
async function captureRejection(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

/* ================================================================================================
 * SECTION 1 — `validateFeedHostAuthority` (SEC-06, DECISION G-1)
 * ============================================================================================= */

describe('NET-NEW — validateFeedHostAuthority (SEC-06 / DECISION G-1)', () => {
  it('accepts the three legal authority forms, with and without a port', () => {
    for (const host of [
      'store.example.com',
      'store.example.com:8080',
      'localhost',
      '192.0.2.10',
      '192.0.2.10:3306',
      '[2001:db8::1]',
      '[2001:db8::1]:8443',
      'internal_store.example.com',
      'STORE.EXAMPLE.COM',
    ]) {
      expect(validateFeedHostAuthority(host)).toBe(host);
    }
  });

  it('refuses the empty host rather than rendering a feed with no origin', () => {
    expect(() => validateFeedHostAuthority('')).toThrow(DomainError);
  });

  it('refuses every character that could break out of an element or move the origin', () => {
    const hostile: readonly string[] = [
      /* XML structure injection — the CWE-91 half of the finding. */
      'store.example.com"><g:price>0</g:price><x>',
      'a<b',
      'a>b',
      'a&b',
      'a"b',
      /* Origin relocation. */
      'store.example.com/evil',
      'evil.example.com@store.example.com',
      '//evil.example.com',
      /* Query, fragment and percent escapes appended to every URL in the document. */
      'store.example.com?x=1',
      'store.example.com#x',
      'store.example.com%2Fevil',
      /* Separator confusion and whitespace, including a header-splitting attempt. */
      'store.example.com\\evil',
      'store.example.com evil',
      'store.example.com\r\nX-Injected: 1',
      "store.example.com'",
    ];

    for (const host of hostile) {
      expect(() => validateFeedHostAuthority(host)).toThrow(DomainError);
    }
  });

  it('names the rule and never echoes the rejected value', () => {
    /* The same reporting discipline `src/config/env.ts` applies: a diagnostic that quotes a
     * rejected value back into a log is itself a disclosure channel. */
    let raised: unknown;
    try {
      validateFeedHostAuthority('evil.example.com/leak-me');
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    const domainError = raised as DomainError;
    expect(domainError.message).not.toContain('leak-me');
    expect(domainError.message).not.toContain('evil.example.com');
    expect(domainError.message).toContain('host authority');
  });

  it('does not normalise an accepted value', () => {
    /* No case folding, no trimming, no default-port removal, no punycode conversion (S9). */
    expect(validateFeedHostAuthority('Store.Example.COM:80')).toBe('Store.Example.COM:80');
  });
});

/* ================================================================================================
 * SECTION 2 — every field mapping, in the legacy's own order (AAP §0.4.1.12 mandate)
 * ============================================================================================= */

describe('NET-NEW — the rendered document reproduces every legacy field mapping', () => {
  it('renders the whole envelope and all sixteen item fields in source order', async () => {
    const { sku } = makeFixture();
    const xml = await makeBuilder().build([record(sku)], makeContext());

    /* Byte-exact, tabs included. Envelope from `product.cfm:L1`, `:L11-L15`, `:L64-L65`; item
     * fields from `:L17-L58` in the legacy's own order. */
    expect(xml).toBe(
      [
        '<?xml version="1.0"?>',
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
        '\t<channel>',
        '\t\t<title>Slatwall Product Feed</title>',
        '\t\t<link>http://store.example.com</link>',
        '\t\t<description>Google Product Feed for http://store.example.com</description>',
        '\t\t<item>',
        '\t\t\t<g:id>SKU-001</g:id>',
        '\t\t\t<title>Nike Air Jorden</title>',
        '\t\t\t<description>Product level description</description>',
        '\t\t\t<g:google_product_category></g:google_product_category>',
        '\t\t\t<g:product_type>Merchandise</g:product_type>',
        '\t\t\t<link>http://store.example.com/product/nike-air-jorden/</link>',
        '\t\t\t<g:image_link>http://store.example.com/product/default/nike.jpg</g:image_link>',
        '\t\t\t<g:condition>new</g:condition>',
        '\t\t\t<g:availability>in stock</g:availability>',
        '\t\t\t<g:price>100</g:price>',
        '\t\t\t<g:item_group_id>NIKE-AIR</g:item_group_id>',
        '\t\t\t<g:shipping_weight>5 lb</g:shipping_weight>',
        '\t\t</item>',
        '\t</channel>',
        '</rss>',
      ].join('\n'),
    );
  });

  it('emits one item per record, in the order given', async () => {
    const first = makeFixture();
    const second = makeFixture();
    second.sku.skuID = 'ddddddddddddddddddddddddddddddd4';
    second.sku.skuCode = 'SKU-002';

    const xml = await makeBuilder().build([record(first.sku), record(second.sku)], makeContext());

    expect(xml.indexOf('<g:id>SKU-001</g:id>')).toBeLessThan(xml.indexOf('<g:id>SKU-002</g:id>'));
    expect(xml.split('<item>')).toHaveLength(3);
  });

  it('falls back to the product type description, then to an empty element', async () => {
    /* The three-way selection of `product.cfm:L19`. */
    const withProduct = makeFixture();
    expect(await makeBuilder().build([record(withProduct.sku)], makeContext())).toContain(
      '<description>Product level description</description>',
    );

    const withType = makeFixture();
    withType.product.productDescription = '';
    expect(await makeBuilder().build([record(withType.sku)], makeContext())).toContain(
      '<description>Type level description</description>',
    );

    const withNeither = makeFixture();
    withNeither.product.productDescription = '';
    withNeither.productType.productTypeDescription = '';
    expect(await makeBuilder().build([record(withNeither.sku)], makeContext())).toContain(
      '<description></description>',
    );
  });

  it('emits one additional image link per product image, in array order', async () => {
    const { sku } = makeFixture();
    const images: readonly ProductFeedImage[] = [
      { imagePath: '/custom/a.jpg' },
      { imagePath: '/custom/b.jpg' },
    ];

    const xml = await makeBuilder().build([record(sku, images)], makeContext());

    expect(xml).toContain(
      '<g:additional_image_link>http://store.example.com/custom/a.jpg</g:additional_image_link>',
    );
    expect(xml).toContain(
      '<g:additional_image_link>http://store.example.com/custom/b.jpg</g:additional_image_link>',
    );
    expect(xml.indexOf('/custom/a.jpg')).toBeLessThan(xml.indexOf('/custom/b.jpg'));
  });

  it('emits no additional image link at all for a product with no images', async () => {
    const { sku } = makeFixture();
    expect(await makeBuilder().build([record(sku)], makeContext())).not.toContain(
      'g:additional_image_link',
    );
  });

  it('emits an empty price element for an unpriced product rather than zero', async () => {
    /* `model/entity/Product.cfc:L561-L568` falls off the end with no return. */
    const { sku, product } = makeFixture();
    delete product.price;
    delete product.defaultSku;

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<g:price></g:price>',
    );
  });

  it('raises when a record carries no product, as the legacy null dereference does', async () => {
    const { sku } = makeFixture();
    delete sku.product;

    await expect(makeBuilder().build([record(sku)], makeContext())).rejects.toThrow(DomainError);
  });

  it('renders an empty element for every absent value rather than omitting the field', async () => {
    /* CFML interpolates a null as the empty string, so the legacy emits the element with no
     * content. Omitting the element would change the document's field census, and substituting a
     * placeholder would invent data (S9). */
    const { sku, product, productType } = makeFixture();
    delete sku.skuCode;
    delete product.calculatedTitle;
    delete product.productDescription;
    delete product.productCode;
    delete product.urlTitle;
    delete productType.productTypeDescription;
    delete sku.imageFile;

    const xml = await makeBuilder().build([record(sku)], makeContext());

    expect(xml).toContain('<g:id></g:id>');
    expect(xml).toContain('<title></title>');
    expect(xml).toContain('<description></description>');
    expect(xml).toContain('<g:item_group_id></g:item_group_id>');
    /* A missing url title still yields the two slashes the legacy produced —
     * `model/entity/Product.cfc:L207-L209` interpolates the null as empty. */
    expect(xml).toContain('<link>http://store.example.com/product//</link>');
    expect(xml).toContain('<g:image_link>http://store.example.com/product/default/</g:image_link>');
  });

  it('REFUSES to render an item for a product with no product type', async () => {
    /* ⚠️ THIS CASE ASSERTED THE OPPOSITE, AND THE OPPOSITE WAS FINDING F14.
     *
     * It expected `<g:product_type></g:product_type>` and `<description></description>`, reasoning
     * that "the legacy dereferences the association unguarded at `:L19` and `:L21`; under strict
     * typing the association is genuinely optional, and falling through keeps the selection total".
     * The first half of that is the correct reading of the source; the conclusion is the inverse of
     * what it supports. An UNGUARDED dereference of a null association does not fall through in CFML
     * — it RAISES — so the legacy render FAILS for such a product, and emitting empty elements invents
     * a lenient behaviour the legacy does not have (AAP §0.7.3 S9).
     *
     * THREE INDEPENDENT PIECES OF EVIDENCE, ALL POINTING ONE WAY:
     *   1. `product.cfm:L32` DOES guard its association — `<cfif not isNull(...getBrand())>` — so the
     *      view demonstrably knows how to make a relationship optional and deliberately does not do it
     *      for the product type at `:L19` or `:L21`.
     *   2. `model/validation/Product.json` declares `"productType": [{"contexts":"save",
     *      "required":true}]`. The association is not optional in the legacy DOMAIN either; a product
     *      without one is a broken row, not a supported shape.
     *   3. `model/entity/Product.cfc:L69` maps it `fetch="join"`, so the legacy never even reached the
     *      view with the association unresolved.
     *
     * AND THE FAILURE MODE THE EMPTY ELEMENTS WOULD HAVE CAUSED IS THE WORSE ONE. `description` and
     * `g:product_type` are two of the fields a merchant platform matches on, so an item with both
     * empty is ACCEPTED and mis-categorised — a data-quality failure invisible in the feed itself.
     * Refusing is both the faithful behaviour and the safe one, and it is what the rest of this module
     * does for every other unguarded legacy dereference. */
    const { sku, product } = makeFixture();
    product.productDescription = '';
    delete product.productType;

    const refusal = await captureRejection(makeBuilder().build([record(sku)], makeContext()));

    expect(refusal).toBeInstanceOf(DomainError);
    const message = (refusal as DomainError).message;
    expect(message).toContain('carries no product type');
    expect(message).toContain(PRODUCT_ID);
    /* The locator is named so the refusal is traceable to the line it reproduces. */
    expect(message).toContain('product.cfm:L19');
  });

  it('still renders the product-type description fallback when the association IS present', async () => {
    /* The companion to the refusal above: the fallback at `:L19` is a fallback between two
     * DESCRIPTIONS, not between a present and an absent association, and it is unaffected. */
    const { sku, product } = makeFixture();
    product.productDescription = '';

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<description>Type level description</description>',
    );
  });
});

/* ================================================================================================
 * SECTION 3 — both conditional branches (AAP §0.4.1.12 mandate)
 * ============================================================================================= */

describe('NET-NEW — the two conditional field groups', () => {
  it('omits the sale-price pair when no promotion applies', async () => {
    /* `model/entity/Sku.cfc:L546-L551` falls back to the ordinary price, so the strict
     * greater-than at `product.cfm:L28` is false and the pair is correctly omitted. */
    const { sku } = makeFixture();
    const xml = await makeBuilder().build([record(sku)], makeContext());

    expect(xml).not.toContain('g:sale_price');
    expect(xml).not.toContain('g:sale_price_effective_date');
  });

  it('emits the sale price and the eleven-part effective range when one applies', async () => {
    /* ⚠️ THE EXPECTED COMPONENTS CHANGED WITH FINDING F15, AND THE STRUCTURE DID NOT.
     *
     * This asserted `2026-07-31T13:45:09-5/2026-08-15T23:59:58-5` — each endpoint's components read
     * straight off the value with the offset merely appended. F15 established that the label and the
     * components must describe ONE zone, as they automatically did in the legacy where `now()` and
     * `getTimeZoneInfo().utcHourOffset` both came from a single engine's single zone. The components
     * are therefore now computed FOR the reported offset: `13:45:09Z − 5h = 08:45:09` and
     * `23:59:58Z − 5h = 18:59:58`, each still labelled `-5`.
     *
     * The eleven-part STRUCTURE this case exists to pin — date, `T`, time, `-`, offset, `/`, and the
     * same five again — is asserted unchanged, and the arithmetic is written out above rather than
     * left for a reader to reverse-engineer from the literal. */
    const { sku } = makeFixture();
    const pricing = makePricing({
      [SKU_ID]: {
        salePrice: 75,
        salePriceExpirationDateTime: new Date(Date.UTC(2026, 7, 15, 23, 59, 58)),
      },
    });

    const xml = await makeBuilder(makeSettings(), pricing).build([record(sku)], makeContext());

    expect(xml).toContain('<g:sale_price>75</g:sale_price>');
    expect(xml).toContain(
      '<g:sale_price_effective_date>2026-07-31T08:45:09-5/2026-08-15T18:59:58-5' +
        '</g:sale_price_effective_date>',
    );
  });

  it('shifts the components with the offset the label reports, so the two never disagree', async () => {
    /* The F15 invariant stated as its own case rather than left implicit in a literal: the SAME instant
     * rendered under two offsets must produce components that differ by exactly the offset difference,
     * and neither must depend on the host's timezone configuration. */
    const { sku } = makeFixture();
    const pricing = makePricing({ [SKU_ID]: { salePrice: 75 } });
    const builder = makeBuilder(makeSettings(), pricing);

    expect(await builder.build([record(sku)], makeContext('store.example.com', '0'))).toContain(
      '<g:sale_price_effective_date>2026-07-31T13:45:09-0/T-0</g:sale_price_effective_date>',
    );
    expect(await builder.build([record(sku)], makeContext('store.example.com', '8'))).toContain(
      '<g:sale_price_effective_date>2026-07-31T05:45:09-8/T-8</g:sale_price_effective_date>',
    );
  });

  it('carries an absent expiration leniently, leaving the separators in place', async () => {
    /* `model/entity/Sku.cfc:L560-L565` returns the empty string, and the lenient CFML branch is
     * the one reproduced — no date is invented and the render instant is NOT substituted. Only the
     * start endpoint's components moved with F15; the absent endpoint still collapses to an empty date
     * and an empty time with the `T`, the hyphen and the offset all left in place. */
    const { sku } = makeFixture();
    const pricing = makePricing({ [SKU_ID]: { salePrice: 75 } });

    const xml = await makeBuilder(makeSettings(), pricing).build([record(sku)], makeContext());

    expect(xml).toContain(
      '<g:sale_price_effective_date>2026-07-31T08:45:09-5/T-5</g:sale_price_effective_date>',
    );
  });

  it('omits the brand element when there is no brand association', async () => {
    const { sku } = makeFixture();
    expect(await makeBuilder().build([record(sku)], makeContext())).not.toContain('g:brand');
  });

  it('emits an EMPTY brand element for a brand whose name is blank', async () => {
    /* `product.cfm:L32` guards on the ASSOCIATION, not on the name. Guarding on the name would
     * drop the element and change the document's field census. */
    const { sku, product } = makeFixture();
    product.brand = new Brand();

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<g:brand></g:brand>',
    );
  });

  it('emits the brand name from the brand own accessor', async () => {
    const { sku, product } = makeFixture();
    const brand = new Brand();
    brand.brandName = 'Nike';
    product.brand = brand;

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<g:brand>Nike</g:brand>',
    );
  });
});

/* ================================================================================================
 * SECTION 4 — SEC-06 regression guard: the six legacy fields are BYTE-IDENTICAL
 *
 * DECISION G-3 extends the legacy's own escaper to nine further fields. This section proves it did
 * not change the six the legacy already escaped — a fix that closed the finding while disturbing
 * these would have traded one defect for another.
 * ============================================================================================= */

describe('SEC-06 — the six legacy htmlEditFormat fields keep their exact escaping', () => {
  const HOSTILE = 'a&b<c>d"e\'f';
  const ESCAPED = "a&amp;b&lt;c&gt;d&quot;e'f";

  it('escapes exactly four characters, ampersand first, and leaves the apostrophe alone', async () => {
    const { sku, product, productType } = makeFixture();
    sku.skuCode = HOSTILE;
    product.calculatedTitle = HOSTILE;
    product.productDescription = HOSTILE;
    product.productCode = HOSTILE;
    productType.productTypeName = HOSTILE;
    const brand = new Brand();
    brand.brandName = HOSTILE;
    product.brand = brand;

    const xml = await makeBuilder().build([record(sku)], makeContext());

    expect(xml).toContain(`<g:id>${ESCAPED}</g:id>`);
    expect(xml).toContain(`<title>${ESCAPED}</title>`);
    expect(xml).toContain(`<description>${ESCAPED}</description>`);
    expect(xml).toContain(`<g:product_type>${ESCAPED}</g:product_type>`);
    expect(xml).toContain(`<g:brand>${ESCAPED}</g:brand>`);
    expect(xml).toContain(`<g:item_group_id>${ESCAPED}</g:item_group_id>`);
  });

  it('never double-escapes, so an ampersand becomes exactly one entity', async () => {
    const { sku } = makeFixture();
    sku.skuCode = '&';

    const xml = await makeBuilder().build([record(sku)], makeContext());

    expect(xml).toContain('<g:id>&amp;</g:id>');
    expect(xml).not.toContain('&amp;amp;');
  });

  it('preserves the product type double-escape, so the guillemet entity emits as &amp;raquo;', async () => {
    /* `model/entity/ProductType.cfc:L273-L278` joins with the LITERAL entity text ' &raquo; ', and
     * `product.cfm:L21` escapes the finished string. The legacy therefore emits `&amp;raquo;`, and
     * "fixing" that would change bytes on the wire. */
    const { sku, productType } = makeFixture();
    const parent = new ProductType();
    parent.productTypeID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee5';
    parent.productTypeName = 'Apparel';
    productType.parentProductType = parent;

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<g:product_type>Apparel &amp;raquo; Merchandise</g:product_type>',
    );
  });
});

/* ================================================================================================
 * SECTION 5 — SEC-06 remediation: the nine hardened fields are escaped (DECISION G-3)
 * ============================================================================================= */

describe('SEC-06 — every dynamic text node the legacy left raw is now escaped', () => {
  it('escapes the shipping weight, which is two unconstrained settings values', async () => {
    /* Neither key is seeded in `config/dbdata/SlatwallSetting.xml.cfm`, so both are whatever the
     * settings store holds — operator- and database-supplied text with no allowlist. */
    const settings = makeSettings({
      skuShippingWeight: '5</g:shipping_weight><g:price>0</g:price><x>',
      skuShippingWeightUnitCode: 'l&b',
    });
    const { sku } = makeFixture();

    const xml = await makeBuilder(settings).build([record(sku)], makeContext());

    expect(xml).toContain(
      '<g:shipping_weight>5&lt;/g:shipping_weight&gt;&lt;g:price&gt;0&lt;/g:price&gt;&lt;x&gt;' +
        ' l&amp;b</g:shipping_weight>',
    );
    /* The injected element never becomes real markup: the only `g:price` in the document is the
     * genuine one, and it still carries the product price. */
    expect(xml).toContain('<g:price>100</g:price>');
    expect(xml).not.toContain('<g:price>0</g:price>');
  });

  it('preserves the single literal space when one shipping setting resolves empty', async () => {
    const settings = makeSettings({ skuShippingWeight: '', skuShippingWeightUnitCode: '' });
    const { sku } = makeFixture();

    expect(await makeBuilder(settings).build([record(sku)], makeContext())).toContain(
      '<g:shipping_weight> </g:shipping_weight>',
    );
  });

  it('REFUSES a UTC hour offset that is not a number, the one unbranded caller string in the item', async () => {
    /* ⚠️ THIS CASE EXPECTED THE HOSTILE OFFSET TO BE ESCAPED AND EMITTED, AND F15 MADE THAT IMPOSSIBLE.
     *
     * It asserted `...T13:45:09-5&lt;/g:sale_price_effective_date&gt;&lt;x&gt;&amp;/...`, i.e. the
     * breakout payload neutralised by escaping and published inside the element. That was coherent while
     * the offset was pure output text. It is not coherent now: under F15 the offset's NUMERIC value
     * computes the wall-clock components the label describes, so a value that cannot be read as a number
     * of hours cannot be rendered at all — there are no components to emit beside it.
     *
     * THE FINDING'S OWN REQUIREMENT IS FULLY MET, BY A STRICTLY STRONGER OUTCOME. The payload never
     * reaches the document; it is refused before a byte is written, which is the same guarantee the
     * escaping was there to provide, reached one step earlier. And escaping is still applied to the
     * assembled range at the emission site, so the defence is not traded away — it is simply unreachable
     * for this input, because `Number()` accepts no string containing `&`, `<`, `>` or `"`.
     *
     * The escaping half of this case is therefore asserted where it remains observable: on the values
     * that DO pass the numeric read, immediately below. */
    const { sku } = makeFixture();
    const pricing = makePricing({ [SKU_ID]: { salePrice: 75 } });
    const context = makeContext('store.example.com', '5</g:sale_price_effective_date><x>&');

    const refusal = await captureRejection(
      makeBuilder(makeSettings(), pricing).build([record(sku)], context),
    );

    expect(refusal).toBeInstanceOf(DomainError);
    /* The refusal names the rule, not the payload: a diagnostic that quotes the rejected value back
     * into a log is itself a disclosure channel. */
    const message = (refusal as DomainError).message;
    expect(message).toContain('not a finite number of hours');
    expect(message).not.toContain('<x>');
    expect(message).not.toContain('g:sale_price_effective_date>');
  });

  it('emits an accepted offset UNMODIFIED, whatever numeric spelling it arrived in', async () => {
    /* The other half of the retired case. `ProductFeedRenderContext.utcHourOffset` promises the text is
     * emitted verbatim, so the numeric READ must not become a re-format: no padding, no sign
     * normalisation, no decimal or exponent rewriting. Each spelling below is one `Number()` accepts and
     * one whose text differs from its canonical form, so a silent round-trip through a number would be
     * visible here. `+5` also proves the LITERAL hyphen at `product.cfm:L30` is emitted regardless of the
     * value's own sign. */
    const { sku } = makeFixture();
    const pricing = makePricing({ [SKU_ID]: { salePrice: 75 } });
    const builder = makeBuilder(makeSettings(), pricing);

    for (const [offset, expectedStart] of [
      ['05', '2026-07-31T08:45:09'],
      ['+5', '2026-07-31T08:45:09'],
      ['-3', '2026-07-31T16:45:09'],
      ['5.5', '2026-07-31T08:15:09'],
      ['0', '2026-07-31T13:45:09'],
    ] as const) {
      const xml = await builder.build([record(sku)], makeContext('store.example.com', offset));
      expect(xml).toContain(
        `<g:sale_price_effective_date>${expectedStart}-${offset}/T-${offset}` +
          `</g:sale_price_effective_date>`,
      );
    }
  });

  it('escapes an ampersand in a URL query string instead of leaving the document unparseable', async () => {
    /* THE RETRACTED WARNING. `&amp;` is the well-formed XML spelling of a literal ampersand inside
     * a text node; a conforming consumer hands `&` back, so the link is not corrupted. Leaving it
     * bare is what leaves the document with no defined parse. */
    const { sku } = makeFixture();
    const settings = makeSettings({ globalURLKeyProduct: 'p?a=1&b=2' });

    const xml = await makeBuilder(settings).build([record(sku)], makeContext());

    expect(xml).toContain('<link>http://store.example.com/p?a=1&amp;b=2/nike-air-jorden/</link>');
  });

  it('escapes the channel link and the channel description', async () => {
    /* Provably a no-op for any value that reaches this point, because DECISION G-1 makes an
     * XML-significant host unrepresentable. The calls are made so that the emission-site invariant
     * holds without exception. */
    const xml = await makeBuilder().build([], makeContext('store.example.com:8080'));

    expect(xml).toContain('<link>http://store.example.com:8080</link>');
    expect(xml).toContain(
      '<description>Google Product Feed for http://store.example.com:8080</description>',
    );
  });

  it('leaves the two fixed values and the empty category untouched', async () => {
    const { sku } = makeFixture();
    const xml = await makeBuilder().build([record(sku)], makeContext());

    expect(xml).toContain('<g:condition>new</g:condition>');
    expect(xml).toContain('<g:availability>in stock</g:availability>');
    expect(xml).toContain('<g:google_product_category></g:google_product_category>');
  });

  it('renders prices as plain numbers, unaffected by the escaper', async () => {
    const { sku, product } = makeFixture();
    product.price = 1234.5;
    sku.price = 1234.5;
    const pricing = makePricing({ [SKU_ID]: { salePrice: 999.99 } });

    const xml = await makeBuilder(makeSettings(), pricing).build([record(sku)], makeContext());

    expect(xml).toContain('<g:price>1234.5</g:price>');
    expect(xml).toContain('<g:sale_price>999.99</g:sale_price>');
  });
});

/* ================================================================================================
 * SECTION 6 — SEC-06 remediation: URL paths are validated (DECISION G-2)
 * ============================================================================================= */

describe('SEC-06 — a URL path may not introduce an authority or break out of its element', () => {
  it('refuses a scheme-relative path that would rebase the URL onto a foreign host', async () => {
    /* The host itself is branded, so this is the remaining origin-relocation route: a path of
     * `//evil.example.com/x` makes `http://store.example.com` + path resolve elsewhere. */
    const { sku } = makeFixture();
    const settings = makeSettings({ globalURLKeyProduct: '/evil.example.com' });

    await expect(makeBuilder(settings).build([record(sku)], makeContext())).rejects.toThrow(
      DomainError,
    );
  });

  it('refuses a path that does not begin with a slash', async () => {
    const { sku } = makeFixture();
    const imagePaths = makeImagePaths(() => 'product/default/nike.jpg');

    await expect(
      makeBuilder(makeSettings(), makePricing(), imagePaths).build([record(sku)], makeContext()),
    ).rejects.toThrow(DomainError);
  });

  it('refuses every character RFC 3986 excludes from a URI', async () => {
    const { sku } = makeFixture();

    for (const hostile of [
      '/a"b',
      '/a<b',
      '/a>b',
      '/a\\b',
      '/a^b',
      '/a{b',
      '/a}b',
      '/a|b',
      '/a b',
      '/a\tb',
      '/a\nb',
      '/a\u007Fb',
    ]) {
      const imagePaths = makeImagePaths(() => hostile);
      await expect(
        makeBuilder(makeSettings(), makePricing(), imagePaths).build([record(sku)], makeContext()),
      ).rejects.toThrow(DomainError);
    }
  });

  it('validates each additional image path independently', async () => {
    const { sku } = makeFixture();
    const images: readonly ProductFeedImage[] = [
      { imagePath: '/custom/a.jpg' },
      { imagePath: '//evil.example.com/b.jpg' },
    ];

    await expect(makeBuilder().build([record(sku, images)], makeContext())).rejects.toThrow(
      DomainError,
    );
  });

  it('accepts the empty path, which yields the bare host', async () => {
    /* Reachable rather than theoretical: the missing-image setting is unseeded, so the image
     * adapter can legitimately resolve empty. */
    const { sku } = makeFixture();
    const imagePaths = makeImagePaths(() => '');

    expect(
      await makeBuilder(makeSettings(), makePricing(), imagePaths).build(
        [record(sku)],
        makeContext(),
      ),
    ).toContain('<g:image_link>http://store.example.com</g:image_link>');
  });

  it('labels an unsaved sku rather than reporting an empty identifier', async () => {
    /* `SKU_UNSAVED_ID_VALUE` is the empty string, so a fresh SKU has no identifier to name. The
     * `(unsaved)` label is the same diagnostic idiom {@link ProductFeedBuilder.requireProduct}
     * uses, and both refusal paths are asserted here. */
    const { product } = makeFixture();
    const unsaved = new Sku();
    unsaved.skuCode = 'SKU-NEW';
    unsaved.product = product;
    const imagePaths = makeImagePaths(() => '//evil.example.com/b.jpg');

    const pathRefusal = await captureRejection(
      makeBuilder(makeSettings(), makePricing(), imagePaths).build(
        [record(unsaved)],
        makeContext(),
      ),
    );
    expect(pathRefusal).toBeInstanceOf(DomainError);
    expect((pathRefusal as DomainError).message).toContain('sku (unsaved)');

    const orphan = new Sku();
    const productRefusal = await captureRejection(
      makeBuilder().build([record(orphan)], makeContext()),
    );
    expect(productRefusal).toBeInstanceOf(DomainError);
    expect((productRefusal as DomainError).message).toContain('Sku (unsaved)');
  });

  it('names the field and the sku, and never echoes the path', async () => {
    const { sku } = makeFixture();
    const imagePaths = makeImagePaths(() => '//evil.example.com/leak-me.jpg');

    const raised = await captureRejection(
      makeBuilder(makeSettings(), makePricing(), imagePaths).build([record(sku)], makeContext()),
    );

    expect(raised).toBeInstanceOf(DomainError);
    const domainError = raised as DomainError;
    expect(domainError.message).toContain('g:image_link');
    expect(domainError.message).toContain(SKU_ID);
    expect(domainError.message).not.toContain('leak-me');
    expect(domainError.message).not.toContain('evil.example.com');
  });
});

/* ================================================================================================
 * SECTION 7 — SEC-06: the emitted document is well-formed with hostile input throughout
 *
 * No XML parser is available and the dependency set is frozen at one runtime package (AAP §0.5.2),
 * so well-formedness is asserted by the two properties that actually failed under the finding's
 * runtime probe: no ampersand appears outside a recognised entity, and no unexpected element name
 * appears in the document. Both are proxies, and saying so is more useful than implying a parse.
 * ============================================================================================= */

describe('SEC-06 — a document built entirely from hostile values stays well-formed', () => {
  const BREAKOUT = '"><g:price>0</g:price><injected>&';

  it('leaves no bare ampersand anywhere in the document', async () => {
    const { sku, product, productType } = makeFixture();
    sku.skuCode = BREAKOUT;
    product.calculatedTitle = BREAKOUT;
    product.productDescription = BREAKOUT;
    product.productCode = BREAKOUT;
    productType.productTypeName = BREAKOUT;
    const brand = new Brand();
    brand.brandName = BREAKOUT;
    product.brand = brand;

    const settings = makeSettings({
      skuShippingWeight: BREAKOUT,
      skuShippingWeightUnitCode: BREAKOUT,
    });
    const pricing = makePricing({ [SKU_ID]: { salePrice: 75 } });
    /* THE OFFSET IS THE ONE HOSTILE VALUE THIS CASE CANNOT USE, and its absence is not a gap. It was
     * `BREAKOUT` here too, but F15 made the offset's numeric value load-bearing, so a breakout payload is
     * now REFUSED rather than escaped — there would be no document left to inspect for well-formedness.
     * The refusal is asserted directly in the escaping section above; a legal offset is supplied here so
     * that every OTHER hostile value still reaches the document and can be checked. */
    const context = makeContext('store.example.com', '5');

    const xml = await makeBuilder(settings, pricing).build([record(sku)], context);

    /* Every `&` must introduce one of the four entities this document can contain. */
    expect(xml).not.toMatch(/&(?!(?:amp|lt|gt|quot);)/);
  });

  it('admits no element name that the builder did not emit itself', async () => {
    const { sku, product } = makeFixture();
    product.calculatedTitle = BREAKOUT;
    const settings = makeSettings({ skuShippingWeight: BREAKOUT });

    const xml = await makeBuilder(settings).build([record(sku)], makeContext());

    const permitted: ReadonlySet<string> = new Set([
      'rss',
      'channel',
      'item',
      'title',
      'link',
      'description',
      'g:id',
      'g:google_product_category',
      'g:product_type',
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
    ]);

    for (const match of xml.matchAll(/<\/?([A-Za-z][\w:.-]*)/g)) {
      const name = match[1];
      expect(name).toBeDefined();
      expect(permitted.has(name ?? '')).toBe(true);
    }
    expect(xml).not.toContain('<injected');
  });
});
