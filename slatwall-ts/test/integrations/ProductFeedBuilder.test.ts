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
 * WHAT SECTIONS 1 AND 4 THROUGH 7 ARE FOR, AND WHAT THEY USED TO BE FOR
 * --------------------------------------------------------------------
 * ⛔ THEY WERE THE REMEDIATION COVERAGE FOR SECURITY FINDING SEC-06, AND THE REMEDIATION IS
 * WITHDRAWN. The builder declared it as DECISION G-1 (a validated, configured host authority),
 * DECISION G-2 (URL paths may not introduce an authority or break out of an element) and DECISION G-3
 * (every dynamic text node escaped at its emission site). All three are behaviour changes:
 * `integrationServices/google/views/feed/product.cfm` escapes exactly SIX fields with
 * `htmlEditFormat` — `g:id` (:L17), `title` (:L18), `description` (:L19), `g:product_type` (:L21),
 * `g:brand` (:L32) and `g:item_group_id` (:L39) — leaves TEN substitutions raw, and validates nothing
 * anywhere. AAP §0.8.2 guideline 4 forbids enhancement beyond what the migration requires, and D18
 * (AAP §0.6.7.7) is the SOLE declared behaviour-hardening exception — a precedent only for a
 * divergence that removes a flaw class WITHOUT changing an outcome.
 *
 * These sections are therefore now WITHDRAWAL REGRESSIONS: they pin the raw emission and the
 * unvalidated append so that no future revision can reinstate a gate without a failing test. Section 4
 * is unchanged in substance and keeps its original purpose — the six legacy-escaped fields must stay
 * byte-identical — which is the one part of the original remediation that was always parity rather
 * than hardening. The residual CWE-91 exposure is FLAGGED at every raw emission site and in the
 * builder's WITHDRAWN RAW-SINK VALIDATION note (S8), not closed.
 *
 * The builder needs no database, no network, no live paginated query, no process environment, no
 * request scope and no file system, so every collaborator below is a plain object. That testability
 * is the reason the module takes three narrow interfaces rather than reaching for services.
 */

import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { Brand } from '../../src/domain/product/Brand';
import { Sku } from '../../src/domain/sku/Sku';
import { DataIntegrityError, DomainError } from '../../src/errors/DomainError';
import { ProductFeedBuilder } from '../../src/integrations/google/ProductFeedBuilder';
import type {
  ProductFeedImage,
  ProductFeedRecord,
  ProductFeedRenderContext,
} from '../../src/integrations/google/ProductFeedBuilder';
import {
  mapProductRow,
  mapSkuRow,
  readProductDefaultSkuId,
} from '../../src/adapters/mysql/rowMappers';
import { toImageWebPath } from '../../src/ports/ImagePathPort';
import type {
  ImagePathPort,
  ImageWebPath,
  ResizedImagePathRequest,
} from '../../src/ports/ImagePathPort';
import type { PricingPort, SalePriceDetailsBySkuId } from '../../src/ports/PricingPort';
import { toExactDecimal } from '../../src/util/formatting';
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
  product.price = toExactDecimal(100);
  product.productType = productType;

  const sku = new Sku();
  sku.skuID = SKU_ID;
  sku.skuCode = 'SKU-001';
  sku.price = toExactDecimal(100);
  sku.imageFile = 'nike.jpg';
  sku.product = product;

  return { sku, product, productType };
}

function record(sku: Sku, productImages: readonly ProductFeedImage[] = []): ProductFeedRecord {
  return { sku, productImages };
}

/**
 * @param host handed to the render context AS GIVEN. It is not validated, not branded and not
 *   normalised: the grammar check and the `allowedHosts` membership gate that used to stand between a
 *   caller and this value are both withdrawn — see SECTION 1.
 * @param utcHourOffset emitted unmodified, per {@link ProductFeedRenderContext.utcHourOffset}.
 */
function makeContext(host = 'store.example.com', utcHourOffset = '5'): ProductFeedRenderContext {
  return {
    host,
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
 * SECTION 1 — the host is emitted RAW, because `product.cfm` emits it raw
 *
 * ⛔ THIS SECTION EXERCISED `validateFeedHostAuthority`, AND THAT FUNCTION NO LONGER EXISTS. Six
 * cases asserted a character allowlist, an RFC 1035 63-octet DNS-label ceiling, a raising refusal for
 * an empty host, a refusal that never echoed the rejected value, and case preservation. All of it is
 * withdrawn with SEC-06 / DECISION G-1.
 *
 * WHY: `integrationServices/google/views/feed/product.cfm` interpolates `CGI.HTTP_HOST` into all five
 * of its absolute URLs — `:L14`, `:L15`, `:L22`, `:L23` and `:L24` — with no test of any kind. A
 * refusal CHANGES AN OUTCOME the legacy produces, so AAP §0.8.2 guideline 4 forbids it and D18
 * (AAP §0.6.7.7) does not license it: D18 is a precedent only for a divergence that removes a flaw
 * class WITHOUT changing an outcome, which parameterised SQL does and a refusal does not. The
 * character allowlist and the octet ceiling were also figures the source states nowhere (S9, IR-12).
 *
 * WHAT REPLACES IT: withdrawal regressions. They pin the RAW emission the legacy produces, so a future
 * revision cannot quietly reinstate the gate without a failing test. The residual CWE-91 and
 * origin-rebasing exposure is FLAGGED in the builder's WITHDRAWN RAW-SINK VALIDATION note (S8), not
 * closed here.
 * ============================================================================================= */

describe('NET-NEW — the configured host reaches the document unvalidated and unmodified', () => {
  it('emits a host containing XML-significant characters RAW, reproducing the legacy defect', async () => {
    /* WITHDRAWAL REGRESSION. An earlier revision refused this host outright. `:L14` and `:L15`
     * interpolate it, so the legacy emits it — and the injected element really does appear, which is
     * precisely the carried defect the flag names. */
    const xml = await makeBuilder().build([], makeContext('a&b<c>"d'));

    expect(xml).toContain('<link>http://a&b<c>"d</link>');
    expect(xml).toContain('<description>Google Product Feed for http://a&b<c>"d</description>');
  });

  it('emits an empty host as the bare scheme prefix rather than refusing the render', async () => {
    /* WITHDRAWAL REGRESSION. `src/config/env.ts` still refuses a blank `GOOGLE_FEED_HOST` at load —
     * a configuration-completeness rule — but nothing between that read and this document checks it,
     * so a caller constructing a context directly gets the legacy's own interpolation of an empty
     * value. */
    const xml = await makeBuilder().build([], makeContext(''));

    expect(xml).toContain('<link>http://</link>');
    expect(xml).toContain('<description>Google Product Feed for http://</description>');
  });

  it('preserves case, port and length exactly, normalising nothing', async () => {
    /* The one assertion that survives the withdrawal unchanged in substance: the value is not
     * lower-cased, punycoded, trimmed, stripped of a default port or upgraded to a secure scheme,
     * because every one of those would change emitted bytes for a legitimate host. The 300-character
     * label would have breached the withdrawn 63-octet ceiling. */
    const longLabel = `${'a'.repeat(300)}.example.com`;

    for (const host of ['Store.Example.COM:80', 'localhost:8080', '[2001:db8::1]:443', longLabel]) {
      expect(await makeBuilder().build([], makeContext(host))).toContain(
        `<link>http://${host}</link>`,
      );
    }
  });

  it('rebases every absolute URL in the item onto whatever host it is given', async () => {
    /* WITHDRAWAL REGRESSION, and the sharpest statement of what the withdrawn gate was for. All three
     * item-level absolute URLs are built on the same prefix (`:L22`, `:L23`, `:L24`), so the host
     * governs the whole document's origin. That is the legacy's behaviour and it is carried. */
    const { sku } = makeFixture();
    const images: readonly ProductFeedImage[] = [{ imagePath: '/custom/a.jpg' }];

    const xml = await makeBuilder().build([record(sku, images)], makeContext('other.example.net'));

    expect(xml).toContain('<link>http://other.example.net/product/nike-air-jorden/</link>');
    expect(xml).toContain(
      '<g:image_link>http://other.example.net/product/default/nike.jpg</g:image_link>',
    );
    expect(xml).toContain(
      '<g:additional_image_link>http://other.example.net/custom/a.jpg</g:additional_image_link>',
    );
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
 * SECTION 4 — parity guard: the six legacy `htmlEditFormat` fields are BYTE-IDENTICAL
 *
 * This is the one part of the original SEC-06 coverage that survives the DECISION G-3 withdrawal
 * unchanged, because it was never testing a hardening. `product.cfm` escapes exactly these six fields
 * with `htmlEditFormat` at `:L17`, `:L18`, `:L19`, `:L21`, `:L32` and `:L39`, so reproducing that
 * escaper character-for-character IS the parity requirement — including its double-escape of the
 * product type's literal `&raquo;` separator, and including its refusal to touch the apostrophe.
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
 * SECTION 4b — SEC-02 remediation: a code point XML 1.0 forbids is REFUSED (DECISION G-4)
 * ============================================================================================= */

describe('SEC-02 — a code point XML 1.0 cannot represent is refused, never emitted, never altered', () => {
  it('refuses U+0001, which previously made the whole document unparseable', async () => {
    const { sku } = makeFixture();
    sku.skuCode = `SKU\u0001CODE`;

    await expect(makeBuilder().build([record(sku)], makeContext())).rejects.toBeInstanceOf(
      DataIntegrityError,
    );
  });

  it('refuses every forbidden C0 control, plus U+FFFE and U+FFFF', async () => {
    /* The complement of the XML 1.0 `Char` production within the BMP, enumerated rather than sampled:
     * `Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`. */
    const forbidden = [
      ...Array.from({ length: 9 }, (_unused, index) => index), // U+0000 .. U+0008
      0x0b,
      0x0c,
      ...Array.from({ length: 18 }, (_unused, index) => 0x0e + index), // U+000E .. U+001F
      0xfffe,
      0xffff,
    ];

    for (const codePoint of forbidden) {
      const { sku } = makeFixture();
      sku.skuCode = `x${String.fromCharCode(codePoint)}y`;

      await expect(makeBuilder().build([record(sku)], makeContext())).rejects.toBeInstanceOf(
        DataIntegrityError,
      );
    }
  });

  it('refuses a lone surrogate but ACCEPTS a well-formed pair, which encodes a legal character', async () => {
    const withLoneHigh = makeFixture();
    withLoneHigh.sku.skuCode = 'x\ud83dy';
    await expect(
      makeBuilder().build([record(withLoneHigh.sku)], makeContext()),
    ).rejects.toBeInstanceOf(DataIntegrityError);

    const withLoneLow = makeFixture();
    withLoneLow.sku.skuCode = 'x\udc9ay';
    await expect(
      makeBuilder().build([record(withLoneLow.sku)], makeContext()),
    ).rejects.toBeInstanceOf(DataIntegrityError);

    const withPair = makeFixture();
    withPair.sku.skuCode = 'x\ud83d\udc9ay';
    expect(await makeBuilder().build([record(withPair.sku)], makeContext())).toContain(
      '<g:id>x\u{1f49a}y</g:id>',
    );
  });

  it('ACCEPTS tab, line feed and carriage return, which the Char production admits', async () => {
    /* A multi-line product description is ordinary feed content. Refusing these three would break
     * legitimate data, and stripping them would alter it. */
    const { sku, product } = makeFixture();
    sku.skuCode = 'PLAIN';
    product.productDescription = 'line one\nline two\ttabbed\rreturned';

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<description>line one\nline two\ttabbed\rreturned</description>',
    );
  });

  it('ACCEPTS DEL and the C1 block, which XML 1.0 permits even though XML 1.1 restricts them', async () => {
    /* This document declares 1.0. Refusing them would be inventing a stricter rule than the format
     * states, which AAP 0.7.3 S9 forbids. */
    const { sku } = makeFixture();
    sku.skuCode = 'x\u007f\u0085y';

    expect(await makeBuilder().build([record(sku)], makeContext())).toContain(
      '<g:id>x\u007f\u0085y</g:id>',
    );
  });

  it('refuses rather than sanitises: no stripped, replaced or substituted output is ever produced', async () => {
    const { sku } = makeFixture();
    sku.skuCode = 'A\u0000B';

    /* If the value were being sanitised the build would resolve with `AB`, `A?B` or `A\uFFFDB`. It
     * rejects instead, which is the whole of DECISION G-4. */
    await expect(makeBuilder().build([record(sku)], makeContext())).rejects.toThrow(
      DataIntegrityError,
    );
  });
});

/* ================================================================================================
 * SECTION 5 — the ten fields the legacy leaves RAW are emitted RAW
 *
 * ⛔ THIS SECTION ASSERTED THAT NINE FURTHER FIELDS WERE ESCAPED, AND THAT IS WITHDRAWN. SEC-06 /
 * DECISION G-3 applied the legacy's own escaper to nine sinks the legacy escapes nowhere. Escaping is
 * a BYTE CHANGE at precisely the values that matter, so it is a behaviour change: AAP §0.8.2
 * guideline 4 forbids it and D18 does not license it, for the same reason set out in section 1.
 *
 * The ten raw substitutions, read from the view: the channel link (`:L14`), the channel description
 * (`:L15`), the item link (`:L22`), `g:image_link` (`:L23`), each `g:additional_image_link` (`:L24`),
 * `g:price` (`:L27`), `g:sale_price` (`:L29`), both offset appearances inside
 * `g:sale_price_effective_date` (`:L30`) and `g:shipping_weight` (`:L58`).
 *
 * WHAT SURVIVES: the ARITHMETIC read of the UTC hour offset. `readUtcHourOffset` is not an escaping
 * substitute and not a control — `product.cfm:L30` reads the offset from
 * `getTimeZoneInfo().utcHourOffset`, a machine-generated numeric value, and the target has no such
 * built-in and must compute the labelled wall clock itself (F15). It cannot render the endpoint at all
 * without a numeric reading, which makes the read an execution-model necessity.
 * ============================================================================================= */

describe('SEC-06 WITHDRAWN — every field the legacy leaves raw stays raw', () => {
  it('emits the shipping weight RAW, so injected markup really does reach the document', async () => {
    /* WITHDRAWAL REGRESSION, and the most consequential one in the file. An earlier revision escaped
     * this join and asserted that the injected `g:price` "never becomes real markup". `:L58`
     * interpolates both values, so under the legacy it DOES become real markup, and the port carries
     * that. Neither key is seeded in `config/dbdata/SlatwallSetting.xml.cfm`, so both are whatever the
     * settings store holds — which is exactly why the exposure is flagged (S8) rather than denied. */
    const settings = makeSettings({
      skuShippingWeight: '5</g:shipping_weight><g:price>0</g:price><x>',
      skuShippingWeightUnitCode: 'l&b',
    });
    const { sku } = makeFixture();

    const xml = await makeBuilder(settings).build([record(sku)], makeContext());

    expect(xml).toContain(
      '<g:shipping_weight>5</g:shipping_weight><g:price>0</g:price><x> l&b</g:shipping_weight>',
    );
    /* The genuine price element is still emitted; the injected one is now ALSO present, which is the
     * carried defect stated as an assertion rather than left implicit. */
    expect(xml).toContain('<g:price>100</g:price>');
    expect(xml).toContain('<g:price>0</g:price>');
  });

  it('preserves the single literal space when both shipping settings resolve empty', async () => {
    const settings = makeSettings({ skuShippingWeight: '', skuShippingWeightUnitCode: '' });
    const { sku } = makeFixture();

    expect(await makeBuilder(settings).build([record(sku)], makeContext())).toContain(
      '<g:shipping_weight> </g:shipping_weight>',
    );
  });

  it('refuses a UTC hour offset it cannot read as a number of hours, because it cannot render one', async () => {
    /* ⭐ THE ONE SURVIVING REFUSAL ON A RAW SINK, AND IT IS NOT A HARDENING.
     *
     * `product.cfm:L30` takes the offset from `getTimeZoneInfo().utcHourOffset`, whose value is
     * machine-generated and always numeric, so a non-numeric offset is not a state the legacy can
     * reach and refusing one forecloses no legacy outcome. The target must shift an absolute instant
     * into the labelled zone itself (F15) and therefore has no components to emit beside a label it
     * cannot read. The refusal is arithmetic necessity, not encoding defence — the offset TEXT is
     * emitted verbatim and unescaped once it reads. */
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

  it('emits an accepted offset UNMODIFIED and UNESCAPED, whatever numeric spelling it arrived in', async () => {
    /* `ProductFeedRenderContext.utcHourOffset` promises the text is emitted verbatim, so the numeric
     * READ must not become a re-format: no padding, no sign normalisation, no decimal or exponent
     * rewriting, and — since DECISION G-3 is withdrawn — no escaping either. Each spelling below is
     * one `Number()` accepts and one whose text differs from its canonical form, so a silent round-trip
     * through a number would be visible here. `+5` also proves the LITERAL hyphen at `product.cfm:L30`
     * is emitted regardless of the value's own sign. */
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

  it('leaves an ampersand in a URL bare, exactly as the legacy leaves it', async () => {
    /* WITHDRAWAL REGRESSION. An earlier revision escaped this to `&amp;` and argued that a bare
     * ampersand "leaves the document with no defined parse" — a true statement about XML and an
     * irrelevant one about parity, because `:L22` emits the finished URL with no `htmlEditFormat`
     * call. The ill-formedness is the legacy's, and it is carried and flagged (S8). */
    const { sku } = makeFixture();
    const settings = makeSettings({ globalURLKeyProduct: 'p?a=1&b=2' });

    const xml = await makeBuilder(settings).build([record(sku)], makeContext());

    expect(xml).toContain('<link>http://store.example.com/p?a=1&b=2/nike-air-jorden/</link>');
  });

  it('leaves the two fixed values and the empty category untouched', async () => {
    const { sku } = makeFixture();
    const xml = await makeBuilder().build([record(sku)], makeContext());

    expect(xml).toContain('<g:condition>new</g:condition>');
    expect(xml).toContain('<g:availability>in stock</g:availability>');
    expect(xml).toContain('<g:google_product_category></g:google_product_category>');
  });

  it('renders both prices as plain decimal numbers', async () => {
    /* F21 — rendered through `renderFeedMoney`, not `String(...)`, so exponential notation cannot
     * reach the document. That is a REPRESENTATION rule about the value, not an escaping rule, which
     * is why it is unaffected by the DECISION G-3 withdrawal. */
    const { sku, product } = makeFixture();
    product.price = toExactDecimal(1234.5);
    sku.price = toExactDecimal(1234.5);
    const pricing = makePricing({ [SKU_ID]: { salePrice: 999.99 } });

    const xml = await makeBuilder(makeSettings(), pricing).build([record(sku)], makeContext());

    expect(xml).toContain('<g:price>1234.5</g:price>');
    expect(xml).toContain('<g:sale_price>999.99</g:sale_price>');
  });

  /* ==============================================================================================
   * F07 — EXACT DECIMAL FIDELITY THROUGH THE FEED. NET-NEW.
   *
   * These four assertions are the observable half of the representation change. Every one of them
   * FAILS if the monetary members go back to being `number`, which is what makes them worth having
   * rather than restating the type declaration.
   * ============================================================================================ */

  it('F07 — emits a price a double cannot represent, digit for digit', async () => {
    /* THE HEADLINE CASE FROM THE FINDING. `Number('9007199254740993.01')` is 9007199254740994, so a
     * port carrying this value as a double emits a DIFFERENT amount from the one stored. */
    const { sku, product } = makeFixture();
    const exact = '9007199254740993.01';
    product.price = toExactDecimal(exact);
    sku.price = toExactDecimal(exact);

    const xml = await makeBuilder(makeSettings(), makePricing({})).build(
      [record(sku)],
      makeContext(),
    );

    expect(xml).toContain(`<g:price>${exact}</g:price>`);
    expect(xml).not.toContain('9007199254740994');
  });

  it('F07 — preserves the stored scale, closing the trailing-zero half of F21', async () => {
    /* The residue an earlier revision of `renderFeedMoney` recorded as unfixable: a stored `100.00`
     * became the number 100 at hydration and was emitted as `100`. It is now emitted as stored, and no
     * scale is imposed on a value that does not carry one — `50` stays `50`. */
    const { sku, product } = makeFixture();
    product.price = toExactDecimal('100.00');
    sku.price = toExactDecimal('100.00');

    const withScale = await makeBuilder(makeSettings(), makePricing({})).build(
      [record(sku)],
      makeContext(),
    );
    expect(withScale).toContain('<g:price>100.00</g:price>');

    product.price = toExactDecimal('50');
    sku.price = toExactDecimal('50');
    const withoutScale = await makeBuilder(makeSettings(), makePricing({})).build(
      [record(sku)],
      makeContext(),
    );
    expect(withoutScale).toContain('<g:price>50</g:price>');
  });

  it('F07 — omits the sale pair when the prices differ only in scale', async () => {
    /* THE LEXICAL-COMPARISON TRAP, ASSERTED. `'100.00' > '100'` is TRUE as a string comparison, so a
     * port using `>` on the branded strings would put an unpromoted product on sale. The digit-wise
     * comparison treats the two spellings as equal, and the strict gate therefore omits the pair. */
    const { sku } = makeFixture();
    sku.price = toExactDecimal('100.00');
    const pricing = makePricing({ [SKU_ID]: { salePrice: 100 } });

    const xml = await makeBuilder(makeSettings(), pricing).build([record(sku)], makeContext());

    expect(xml).not.toContain('<g:sale_price>');
  });

  it('F07 — orders by magnitude rather than lexically when gating the sale pair', async () => {
    /* Lexically `'9'` is greater than `'10'`, which would advertise a nine-unit SKU discounted to ten
     * as being on sale — a discount that is not one. Digit-wise it is less, so the pair is omitted. */
    const { sku } = makeFixture();
    sku.price = toExactDecimal('9');
    const pricing = makePricing({ [SKU_ID]: { salePrice: 10 } });

    const xml = await makeBuilder(makeSettings(), pricing).build([record(sku)], makeContext());

    expect(xml).not.toContain('<g:sale_price>');
  });
});

/* ================================================================================================
 * SECTION 6 — URL paths are appended UNVALIDATED, because `product.cfm` validates none
 *
 * ⛔ THIS SECTION ASSERTED SEVEN REFUSALS, AND ALL OF THEM ARE WITHDRAWN. SEC-06 / DECISION G-2
 * declared a `requireRelativeFeedPath` guard over an RFC 3986 excluded-character set that raised for a
 * path which did not begin with a slash, began with two slashes, or carried an excluded character.
 * `:L22`, `:L23` and `:L24` append their paths with no test of any kind, so each refusal removed a
 * document the legacy produces — AAP §0.8.2 guideline 4, and D18 does not license it (section 1).
 *
 * WHAT REPLACES IT: withdrawal regressions pinning the RAW append, including the origin-relocation
 * case, so the gate cannot be reinstated silently. The exposure is FLAGGED at each emission site and in
 * the builder's WITHDRAWN RAW-SINK VALIDATION note (S8).
 * ============================================================================================= */

describe('SEC-06 WITHDRAWN — a URL path is appended exactly as resolved', () => {
  it('appends a scheme-relative path RAW, so the URL really does rebase onto a foreign host', async () => {
    /* WITHDRAWAL REGRESSION, and the sharpest of them: `http://store.example.com` + `//evil.example.com/…`
     * resolves at `evil.example.com` for any conforming consumer. `:L22` produces exactly that, so the
     * port produces it too. */
    const { sku } = makeFixture();
    const settings = makeSettings({ globalURLKeyProduct: '/evil.example.com' });

    expect(await makeBuilder(settings).build([record(sku)], makeContext())).toContain(
      '<link>http://store.example.com//evil.example.com/nike-air-jorden/</link>',
    );
  });

  it('appends a path that does not begin with a slash RAW, concatenating it onto the authority', async () => {
    const { sku } = makeFixture();
    const imagePaths = makeImagePaths(() => 'product/default/nike.jpg');

    expect(
      await makeBuilder(makeSettings(), makePricing(), imagePaths).build(
        [record(sku)],
        makeContext(),
      ),
    ).toContain('<g:image_link>http://store.example.comproduct/default/nike.jpg</g:image_link>');
  });

  it('appends every character RFC 3986 excludes from a URI, unescaped and unrejected', async () => {
    /* WITHDRAWAL REGRESSION over the exact set the withdrawn guard rejected. The image path is a
     * resolved `ImageWebPath`, which `src/ports/ImagePathPort.ts` documents as a purely NOMINAL label
     * that "asserts nothing about the value" — so nothing upstream constrains it either. */
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
      '/a\u007Fb',
    ]) {
      const imagePaths = makeImagePaths(() => hostile);
      const xml = await makeBuilder(makeSettings(), makePricing(), imagePaths).build(
        [record(sku)],
        makeContext(),
      );
      expect(xml).toContain(`<g:image_link>http://store.example.com${hostile}</g:image_link>`);
    }
  });

  it('appends each additional image path independently and RAW', async () => {
    const { sku } = makeFixture();
    const images: readonly ProductFeedImage[] = [
      { imagePath: '/custom/a.jpg' },
      { imagePath: '//evil.example.com/b.jpg' },
    ];

    const xml = await makeBuilder().build([record(sku, images)], makeContext());

    expect(xml).toContain(
      '<g:additional_image_link>http://store.example.com/custom/a.jpg</g:additional_image_link>',
    );
    expect(xml).toContain(
      '<g:additional_image_link>http://store.example.com//evil.example.com/b.jpg' +
        '</g:additional_image_link>',
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
    /* The one diagnostic assertion that survives the withdrawal: `SKU_UNSAVED_ID_VALUE` is the empty
     * string, so a fresh SKU has no identifier to name, and the `(unsaved)` label is what
     * `ProductFeedBuilder.requireProduct` reports instead. The companion half of this case drove the
     * withdrawn path guard and is gone with it. */
    const orphan = new Sku();

    const productRefusal = await captureRejection(
      makeBuilder().build([record(orphan)], makeContext()),
    );

    expect(productRefusal).toBeInstanceOf(DomainError);
    expect((productRefusal as DomainError).message).toContain('Sku (unsaved)');
  });
});

/* ================================================================================================
 * SECTION 7 — the document's well-formedness is exactly as good as the legacy's, and no better
 *
 * ⛔ THIS SECTION ASSERTED THAT A DOCUMENT BUILT ENTIRELY FROM HOSTILE VALUES STAYED WELL-FORMED, AND
 * THAT PROPERTY IS WITHDRAWN ALONG WITH THE ESCAPING THAT PRODUCED IT. It is replaced by the honest
 * statement of the same territory: the six fields the legacy escapes are still safe, the ten it leaves
 * raw are still unsafe, and the boundary between them is asserted rather than asserted away.
 *
 * No XML parser is available and the dependency set is frozen at one runtime package (AAP §0.5.2), so
 * the two properties below are proxies for well-formedness rather than a parse, and saying so is more
 * useful than implying one.
 * ============================================================================================= */

describe('SEC-06 WITHDRAWN — the escaped six hold the line and the raw ten do not', () => {
  const BREAKOUT = '"><g:price>0</g:price><injected>&';

  it('neutralises a breakout payload in all six legacy-escaped fields', async () => {
    /* The parity property that is genuinely load-bearing: `htmlEditFormat` at `:L17`, `:L18`, `:L19`,
     * `:L21`, `:L32` and `:L39` is the legacy's own defence and it is reproduced exactly, so the
     * withdrawal of DECISION G-3 costs nothing at these six sinks. */
    const { sku, product, productType } = makeFixture();
    sku.skuCode = BREAKOUT;
    product.calculatedTitle = BREAKOUT;
    product.productDescription = BREAKOUT;
    product.productCode = BREAKOUT;
    productType.productTypeName = BREAKOUT;
    const brand = new Brand();
    brand.brandName = BREAKOUT;
    product.brand = brand;

    const xml = await makeBuilder().build([record(sku)], makeContext());

    const escaped = '&quot;&gt;&lt;g:price&gt;0&lt;/g:price&gt;&lt;injected&gt;&amp;';
    expect(xml).toContain(`<g:id>${escaped}</g:id>`);
    expect(xml).toContain(`<title>${escaped}</title>`);
    expect(xml).toContain(`<description>${escaped}</description>`);
    expect(xml).toContain(`<g:product_type>${escaped}</g:product_type>`);
    expect(xml).toContain(`<g:brand>${escaped}</g:brand>`);
    expect(xml).toContain(`<g:item_group_id>${escaped}</g:item_group_id>`);
  });

  it('carries the legacy defect at a raw sink: injected markup becomes real markup', async () => {
    /* WITHDRAWAL REGRESSION, stated as bluntly as the carried-defect register states its entries. The
     * shipping
     * weight is one of the ten raw substitutions, so a breakout payload in it produces a real
     * `<injected>` element and a bare ampersand. This is the CWE-91 exposure carried from `:L58` and
     * FLAGGED for the operator (S8) — it is not a target regression, and a test that pretended
     * otherwise would misreport parity. */
    const { sku } = makeFixture();
    const settings = makeSettings({ skuShippingWeight: BREAKOUT });

    const xml = await makeBuilder(settings).build([record(sku)], makeContext());

    expect(xml).toContain('<injected>');
    expect(xml).toMatch(/&(?!(?:amp|lt|gt|quot);)/);
  });

  it('admits no unexpected element name once every raw sink is given a benign value', async () => {
    /* With the ten raw sinks holding ordinary values, the document's element census is exactly the
     * nineteen names the builder emits — which is the property that actually pins the field mapping.
     * The hostile title still cannot add a name, because `title` is one of the escaped six. */
    const { sku, product } = makeFixture();
    product.calculatedTitle = BREAKOUT;

    const xml = await makeBuilder().build([record(sku)], makeContext());

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

/* ================================================================================================
 * P7 / P17 — REPETITION REMOVAL AND CANCELLATION
 *
 * COVERAGE PROVENANCE: **NET-NEW**, like every other section of this file.
 *
 * These are REGRESSION tests for two structural changes, so each one pins the property that would be
 * lost if the change were undone or "simplified":
 *   - P7 removed two product-wide repeats — the sale-price read and the additional-image resolutions.
 *     The test that matters most is the DIFFERENTIAL one: rendering six records as one document must
 *     produce byte-identical `item` elements to rendering them as six documents, because that is what
 *     makes the repetition removal a structural change rather than a behavioural one.
 *   - P17 added a cancellation path. The property under test is that it fires only at a RECORD
 *     BOUNDARY and that a cancelled render RAISES rather than returning a shorter feed.
 * ============================================================================================= */

/** A second product family, so a repeat across siblings of one product is distinguishable. */
const SECOND_PRODUCT_ID = 'ddddddddddddddddddddddddddddddd4';

interface CountingSpies {
  readonly pricing: PricingPort;
  readonly imagePaths: ImagePathPort;
  readonly pricingCalls: string[];
  readonly resizeCalls: string[];
}

function makeCountingSpies(
  detailsByProduct: ReadonlyMap<string, SalePriceDetailsBySkuId>,
  onResize?: () => void,
): CountingSpies {
  const pricingCalls: string[] = [];
  const resizeCalls: string[] = [];
  return {
    pricingCalls,
    resizeCalls,
    pricing: {
      getSalePriceDetailsForProductSkus: (productId: string): Promise<SalePriceDetailsBySkuId> => {
        pricingCalls.push(productId);
        return Promise.resolve(detailsByProduct.get(productId) ?? {});
      },
    },
    imagePaths: {
      getImagePath: (imageFile: string): Promise<ImageWebPath> =>
        Promise.resolve(toImageWebPath(`/product/default/${imageFile}`)),
      getResizedImagePath: (request: ResizedImagePathRequest): Promise<ImageWebPath> => {
        resizeCalls.push(String(request.imagePath));
        onResize?.();
        return Promise.resolve(toImageWebPath(String(request.imagePath)));
      },
      getImageExistsFlag: (): Promise<boolean> => Promise.resolve(true),
      saveImageFile: (): Promise<boolean> => Promise.resolve(true),
    },
  };
}

interface Family {
  readonly productID: string;
  readonly records: readonly ProductFeedRecord[];
  readonly details: SalePriceDetailsBySkuId;
}

/**
 * Builds one product with `skuCount` SKUs and two additional images.
 *
 * ⚠️ EVERY CALL PRODUCES FRESH INSTANCES, WHICH IS ESSENTIAL RATHER THAN TIDY. `Sku` memoises its own
 * sale-price slice in a private field — a faithful port of the per-instance guard at
 * `model/entity/Sku.cfc:L540` — so re-rendering the SAME instances would answer from that field and
 * issue no port call, reporting a baseline of zero and making the comparison below meaningless.
 */
function makeFamily(productID: string, tag: string, skuCount: number): Family {
  const productType = new ProductType();
  productType.productTypeID = PRODUCT_TYPE_ID;
  productType.productTypeName = `Type ${tag}`;
  productType.productTypeDescription = `Type description ${tag}`;

  const product = new Product();
  product.productID = productID;
  product.calculatedTitle = `Title ${tag}`;
  product.productDescription = `Description ${tag}`;
  product.productCode = `CODE-${tag}`;
  product.urlTitle = `url-${tag}`;
  product.price = toExactDecimal(100);
  product.productType = productType;

  const images: readonly ProductFeedImage[] = [
    { imagePath: `/images/${tag}/extra-0.jpg` },
    { imagePath: `/images/${tag}/extra-1.jpg` },
  ];

  const records: ProductFeedRecord[] = [];
  const details: Record<string, { salePrice: number; salePriceExpirationDateTime: Date }> = {};
  for (let index = 0; index < skuCount; index += 1) {
    const sku = new Sku();
    sku.skuID = `${tag.toLowerCase().repeat(16)}`.slice(0, 30) + String(index).padStart(2, '0');
    sku.skuCode = `SKU-${tag}-${index}`;
    sku.price = toExactDecimal(100);
    sku.imageFile = `img-${tag}-${index}.jpg`;
    sku.product = product;
    records.push({ sku, productImages: images });
    details[sku.skuID] = {
      salePrice: 80,
      salePriceExpirationDateTime: new Date(Date.UTC(2026, 11, 25, 6, 30, 0)),
    };
  }

  return { productID, records, details };
}

function makeTwoFamilies(): {
  readonly records: readonly ProductFeedRecord[];
  readonly detailsByProduct: ReadonlyMap<string, SalePriceDetailsBySkuId>;
} {
  const first = makeFamily(PRODUCT_ID, 'AA', 3);
  const second = makeFamily(SECOND_PRODUCT_ID, 'BB', 3);
  return {
    records: [...first.records, ...second.records],
    detailsByProduct: new Map([
      [first.productID, first.details],
      [second.productID, second.details],
    ]),
  };
}

/** Splits a rendered document into its `item` element bodies, in document order. */
function itemBodies(document: string): string[] {
  return document
    .split('<item>')
    .slice(1)
    .map((chunk) => chunk.split('</item>')[0] ?? '');
}

describe('P7 — a product-wide read is paid for once per product, not once per SKU', () => {
  test('the sale-price read collapses to one call per distinct product', async () => {
    const { records, detailsByProduct } = makeTwoFamilies();
    const spies = makeCountingSpies(detailsByProduct);

    await new ProductFeedBuilder(spies.imagePaths, spies.pricing, makeSettings()).build(
      records,
      makeContext(),
    );

    /* Six SKUs across two products: two reads, in first-seen product order. */
    expect(spies.pricingCalls).toEqual([PRODUCT_ID, SECOND_PRODUCT_ID]);
  });

  test('the same document rendered one record at a time pays the full un-memoised cost', async () => {
    const { records, detailsByProduct } = makeTwoFamilies();
    const spies = makeCountingSpies(detailsByProduct);
    const builder = new ProductFeedBuilder(spies.imagePaths, spies.pricing, makeSettings());

    for (const single of records) {
      await builder.build([single], makeContext());
    }

    /* One read per SKU — which is precisely the repetition the whole-document render removes. */
    expect(spies.pricingCalls).toHaveLength(6);
  });

  test('each distinct resized-image request is resolved exactly once per document', async () => {
    const { records, detailsByProduct } = makeTwoFamilies();
    const spies = makeCountingSpies(detailsByProduct);

    await new ProductFeedBuilder(spies.imagePaths, spies.pricing, makeSettings()).build(
      records,
      makeContext(),
    );

    /* Six per-SKU primary images plus four distinct additional images. Every request is distinct, so
     * no answer was served twice — and without the wrapper the additional images alone would account
     * for twelve resolutions rather than four. */
    expect(spies.resizeCalls).toHaveLength(10);
    expect(new Set(spies.resizeCalls).size).toBe(10);
  });

  test('DIFFERENTIAL: the emitted item elements are byte-identical either way', async () => {
    const whole = makeTwoFamilies();
    const wholeSpies = makeCountingSpies(whole.detailsByProduct);
    const wholeDocument = await new ProductFeedBuilder(
      wholeSpies.imagePaths,
      wholeSpies.pricing,
      makeSettings(),
    ).build(whole.records, makeContext());

    /* FRESH instances, so the baseline is genuinely un-memoised — see {@link makeFamily}. */
    const baseline = makeTwoFamilies();
    const baselineSpies = makeCountingSpies(baseline.detailsByProduct);
    const baselineBuilder = new ProductFeedBuilder(
      baselineSpies.imagePaths,
      baselineSpies.pricing,
      makeSettings(),
    );
    const baselineItems: string[] = [];
    for (const single of baseline.records) {
      baselineItems.push(itemBodies(await baselineBuilder.build([single], makeContext()))[0] ?? '');
    }

    expect(itemBodies(wholeDocument)).toEqual(baselineItems);
    /* And the reduction is real rather than incidental. */
    expect(baselineSpies.pricingCalls.length).toBeGreaterThan(wholeSpies.pricingCalls.length);
    expect(baselineSpies.resizeCalls.length).toBeGreaterThan(wholeSpies.resizeCalls.length);
  });
});

describe('P17 — a feed render can be cancelled, and only at a record boundary', () => {
  test('an already-aborted signal renders nothing and reads nothing', async () => {
    const { records, detailsByProduct } = makeTwoFamilies();
    const spies = makeCountingSpies(detailsByProduct);
    const controller = new AbortController();
    controller.abort();

    const error = await captureRejection(
      new ProductFeedBuilder(spies.imagePaths, spies.pricing, makeSettings()).build(
        records,
        makeContext(),
        { signal: controller.signal },
      ),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).context).toEqual({ renderedRecords: 0 });
    expect(spies.pricingCalls).toHaveLength(0);
    expect(spies.resizeCalls).toHaveLength(0);
  });

  test('aborting mid-record completes that record and stops at the next boundary', async () => {
    const { records, detailsByProduct } = makeTwoFamilies();
    const controller = new AbortController();
    let resolutions = 0;
    const spies = makeCountingSpies(detailsByProduct, () => {
      resolutions += 1;
      /* Inside the SECOND record's image work: 1 primary + 2 additional per record. */
      if (resolutions === 4) {
        controller.abort();
      }
    });

    const error = await captureRejection(
      new ProductFeedBuilder(spies.imagePaths, spies.pricing, makeSettings()).build(
        records,
        makeContext(),
        { signal: controller.signal },
      ),
    );

    expect(error).toBeInstanceOf(DomainError);
    /* TWO, not one: the record that was in flight was finished before the boundary was consulted. */
    expect((error as DomainError).context).toEqual({ renderedRecords: 2 });
  });

  test('a cancelled render raises rather than returning a truncated feed', async () => {
    const { records, detailsByProduct } = makeTwoFamilies();
    const controller = new AbortController();
    let resolutions = 0;
    const spies = makeCountingSpies(detailsByProduct, () => {
      resolutions += 1;
      if (resolutions === 1) {
        controller.abort();
      }
    });

    const error = await captureRejection(
      new ProductFeedBuilder(spies.imagePaths, spies.pricing, makeSettings()).build(
        records,
        makeContext(),
        { signal: controller.signal },
      ),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).toContain('cancelled before it completed');
  });

  test('an un-aborted signal changes not one byte of the document', async () => {
    const withSignal = makeTwoFamilies();
    const withSignalSpies = makeCountingSpies(withSignal.detailsByProduct);
    const withSignalDocument = await new ProductFeedBuilder(
      withSignalSpies.imagePaths,
      withSignalSpies.pricing,
      makeSettings(),
    ).build(withSignal.records, makeContext(), { signal: new AbortController().signal });

    const without = makeTwoFamilies();
    const withoutSpies = makeCountingSpies(without.detailsByProduct);
    const withoutDocument = await new ProductFeedBuilder(
      withoutSpies.imagePaths,
      withoutSpies.pricing,
      makeSettings(),
    ).build(without.records, makeContext());

    expect(withSignalDocument).toBe(withoutDocument);
  });
});

/* ================================================================================================
 * RULE 3a — IDENTIFIER-ONLY REFERENCES, ASSERTED AT THE MAPPER RATHER THAN THROUGH A CHAIN
 * ================================================================================================
 * These three cases arrived as part of a longer suite that drove raw rows through a FEED-LOCAL
 * relationship assembler. That assembler is gone — `src/integrations/google/ProductFeedQuery.ts` records
 * under decision F-3 that the wider candidate was taken instead, the aggregate loaders in
 * `src/adapters/mysql/catalogAggregates.ts`, and that a feed-only projection "was not taken". The four
 * cases in that suite which drove the chain are therefore not carried: they constructed a class that no
 * longer exists and read `selection.records` from a member whose shipped signature answers `Sku[]`.
 *
 * WHAT WAS CHECKED BEFORE DROPPING THEM, because coverage must not fall silently.
 * `test/adapters/catalogAggregates.test.ts` exercises the same behaviour against the mechanism that
 * SHIPS, and more widely: it attaches the product every SKU names, attaches the product type and brand,
 * binds the default SKU through the injected adapter and reads a price through it, gives sibling SKUs the
 * same product instance, issues ONE product statement for a batch naming one product twice, leaves an
 * absent brand absent without raising, issues no association statement for an empty result, and binds
 * every identifier positionally. Nothing the dropped four asserted about resolution is unasserted now.
 *
 * WHY THESE THREE ARE KEPT RATHER THAN DROPPED WITH THEM. They assert the MAPPER's own contract and
 * touch neither the assembler nor the selection: a row's foreign key must survive as an
 * identifier-only reference, an absent foreign key must leave the association absent, and an unresolved
 * reference must REFUSE a value read rather than answer a plausible one. The third is the one with teeth:
 * `Product.getPrice()` delegates to the default SKU, so a reference that answered `0` would publish a
 * free product to a merchant feed. The nearest existing case,
 * `test/adapters/MySqlProductPersistence.test.ts`, asserts only the RESOLVED direction — that a bound
 * default SKU answers its price — so the refusal itself would otherwise be untested.
 * ============================================================================================== */

/** The default-SKU identifier these three cases reference; distinct from every other fixture id here. */
const UNRESOLVED_DEFAULT_SKU_ID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeee5';

describe('NET-NEW — RULE 3a: a row mapper yields identifier-only references, never plausible values', () => {
  it('maps the foreign key onto the SKU instead of dropping it', () => {
    const sku = mapSkuRow({ skuID: SKU_ID, productID: PRODUCT_ID });

    expect(sku.product?.productID).toBe(PRODUCT_ID);
    // Only the identifier: a reference may not answer a non-identifier read with a plausible value.
    expect(sku.product?.calculatedTitle).toBeUndefined();
  });

  it('leaves the association ABSENT when the row carries no foreign key', () => {
    const sku = mapSkuRow({ skuID: SKU_ID });

    expect('product' in sku).toBe(false);
  });

  it('refuses every value read of an unresolved default-SKU reference, so no product renders free', () => {
    const product = mapProductRow({
      productID: PRODUCT_ID,
      defaultSkuID: UNRESOLVED_DEFAULT_SKU_ID,
    });

    expect(readProductDefaultSkuId(product.defaultSku ?? {})).toBe(UNRESOLVED_DEFAULT_SKU_ID);
    // `Product.getPrice` delegates here, so a silent `0` would advertise a free product.
    expect(() => product.getPrice()).toThrow(DomainError);
  });
});
