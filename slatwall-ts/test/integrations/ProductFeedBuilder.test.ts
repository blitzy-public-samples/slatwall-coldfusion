/*
 * =====================================================================================================
 * NET-NEW — `src/integrations/google/ProductFeedBuilder.ts`
 * =====================================================================================================
 *
 * PROVENANCE, STATED PLAINLY AND WITHOUT SOFTENING.
 *
 * This suite is NET-NEW in its entirety. There is NO legacy Google feed test of any kind: the legacy
 * suite under `meta/tests/` contains no feed test, no `integrationServices` test, and no serializer
 * test, so there is nothing here to replicate and nothing to claim parity with. Every case title
 * therefore carries a visible `[NET-NEW]` prefix rather than relying on a suite-level label.
 *
 * TRACEABILITY IS DOCUMENTARY, NEVER EMPIRICAL. The legacy expectations pinned below were established by
 * reading legacy source line by line, not by running the legacy application and diffing its output:
 *
 *   - MXUnit and CFSelenium are NOT vendored in this repository. `meta/tests/readme.txt:L4-L5` states
 *     that the tests require MXUnit installed with a mapping inside CFIDE, and the `functional` folder
 *     additionally requires CFSelenium with its own CFIDE mapping. Neither mapping exists here, so the
 *     legacy suite cannot be collected, let alone executed.
 *   - `meta/docker/slatwall-local-dev/` DOES NOT EXIST. The repository's `meta/` directory contains only
 *     the test material under `meta/tests/` and the editor material under `meta/eclipse/`. There is no
 *     Dockerfile, no Compose file, no Lucee version pin and no MySQL runtime pin anywhere that would
 *     make the CFML application reproducible in this environment.
 *   - The CFML runtime was therefore NOT reproduced, NO runtime behavioural comparison was performed,
 *     and NO legacy feed XML was captured for diffing. Any statement below about what the legacy view
 *     emitted is a reading of the template, carried with its locator so it can be checked.
 *
 * WHAT THIS SUITE IS. A static logic-extraction test. Every assertion is grounded in a named source
 * locator, chiefly the legacy view `integrationServices/google/views/feed/product.cfm`, which is the
 * SOLE field-map authority for the feed. `integrationServices/google/controllers/feed.cfc` supplies
 * documentary input-shape context only. `integrationServices/google/Integration.cfc` is a faithful stub
 * carrying no feed logic. `integrationServices/google/model/dao/FeedDAO.cfc` is orphaned, broken dead
 * code and is not a source of behaviour.
 *
 * SCOPE. `ProductFeedBuilder`'s public serialization surface, and nothing else. This file does not test
 * `IntegrationContract`, `BaseIntegration`, `GoogleIntegration`, `ProductFeedQuery`, any handler, any
 * router, any repository, any service, or any port implementation. It is a SERIALIZER test: the legacy
 * `.cfm` emits RSS 2.0 XML for machine consumption by a merchant feed processor, so there is no user
 * interface, no component library, no design token, no DOM and no browser API anywhere in it.
 * =====================================================================================================
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ProductFeedBuilder,
  type ProductFeedImage,
  type ProductFeedRecord,
  type ProductFeedRenderContext,
} from '../../src/integrations/google/ProductFeedBuilder';
import type { SettingResolutionContext } from '../../src/ports/SettingResolverPort';
import type { ResizedImagePathRequest } from '../../src/ports/ImagePathPort';
import type { SalePriceDetailsBySkuId } from '../../src/ports/PricingPort';
import type { Sku } from '../../src/domain/sku/Sku';
import type { Product } from '../../src/domain/product/Product';
import type { ProductType } from '../../src/domain/product/ProductType';
import type { Brand } from '../../src/domain/product/Brand';
import { toExactDecimal } from '../../src/util/formatting';
import { MERCHANDISE_PRODUCT_TYPE, MERCHANDISE_PRODUCT_TYPE_ID } from '../fixtures/productTypes';
import { createTestMerchandiseProductData } from '../fixtures/testProduct';
import {
  buildBrand,
  buildProduct,
  buildProductType,
  buildSalePriceDetails,
  buildSku,
  createImagePathDouble,
  createPricingDouble,
  createSettingResolverDouble,
  createSmartListQueryDouble,
  type ImagePathDouble,
  type PricingDouble,
  type SettingResolverDouble,
  type SettingSeed,
  type SmartListQueryDouble,
} from '../support/inMemoryRepositories';

/*
 * -----------------------------------------------------------------------------------------------------
 * DOCUMENTARY FINDINGS — recorded here with locators, deliberately NOT turned into extra test scope.
 * -----------------------------------------------------------------------------------------------------
 *
 * D11 — OBSERVED, NOT CORRECTED. `integrationServices/google/Integration.cfc:L49` declares
 * `displayname="USA epay"` on the component while `getDisplayName()` at
 * `integrationServices/google/Integration.cfc:L59-L60` returns `Google`. It is a copy/paste artifact
 * from the payment adapter the file was cloned from. The METHOD supplies the effective display name, so
 * the artifact is inert. This suite does not test `GoogleIntegration` and corrects neither file.
 *
 * D12 — DOCUMENTED DEAD CODE. `integrationServices/google/model/dao/FeedDAO.cfc:L52-L74` has zero
 * callers repository-wide, an unscoped `rs` result variable, a trailing comma after
 * `SwProduct.calculatedTitle,`, an `INNER JOIN SwProduct` with no `ON` clause, no datasource, and a
 * `<cfcomponent>` that extends nothing. It could never have executed successfully. It is not ported,
 * not tested, not repaired, not deleted, and is never treated as a source of behaviour here.
 *
 * LEGACY ROUTE — BUILDER ONLY. The carried route `?slatAction=google:feed.product` is documented by
 * `integrationServices/google/views/main/default.cfm:L49-L51` and in
 * `src/integrations/google/README.md`. This suite asserts the BUILDER, not routing. The target router
 * lives under `src/handlers/**` and no `test/handlers/` target was authorized for the feed.
 *
 * EMPTY INHERITED CONTROLLER. `integrationServices/google/controllers/main.cfc:L49-L52` is an empty
 * inherited controller with no method bodies. It has no TypeScript counterpart and no test counterpart.
 *
 * UPSTREAM RECORD SELECTION — COMMENTARY, NOT ASSERTED HERE. The legacy view received its records from
 * `rc.skuSmartList.getRecords()` (`integrationServices/google/views/feed/product.cfm:L8,L16`), and the
 * controller composed that SmartList at `integrationServices/google/controllers/feed.cfc:L63-L72`:
 *   - `L64` joins SlatwallSku to `product`; `L65` joins SlatwallProduct to `defaultSku`; `L66` joins
 *     SlatwallProduct to `brand` with join type LEFT. Brand is the ONLY left join, which is precisely
 *     why `product.getBrand()` can be null and why the conditional brand element below exists.
 *   - `L68-L70` filter `activeFlag = 1`, `product.activeFlag = 1` and `product.publishedFlag = 1`.
 *   - `L72` ranges `product.calculatedQATS` at `'1^'`, which
 *     `org/Hibachi/HibachiSmartList.cfc:L632-L646` establishes as an inclusive lower bound of 1 with an
 *     open upper bound — the availability gate.
 *   - `org/Hibachi/HibachiSmartList.cfc:L212` declares
 *     `joinRelatedProperty(parentEntityName, relatedProperty, joinType, fetch, isAttribute)`, so the
 *     ENTITY NAME comes first in every one of those three join calls.
 * Those joins, filters and ranges belong to `ProductFeedQuery` and are NOT asserted here.
 * `ProductFeedQuery` is neither imported nor instantiated by this file. What this suite does prove is
 * that records originate BEHIND the SmartList port boundary and are serialized in the order the port
 * returned them.
 *
 * Also recorded without wiring or testing:
 *   - `integrationServices/google/controllers/feed.cfc:L51` declares a fifth injection,
 *     `productService`, which `product(rc)` never uses. It is a dead injection and is not injected here.
 *   - `integrationServices/google/controllers/feed.cfc:L54-L56` sets `this.publicMethods="product"`,
 *     making the feed action fully public and unauthenticated.
 *   - `integrationServices/google/controllers/feed.cfc:L60` disables the layout for the response.
 *   - `integrationServices/google/controllers/feed.cfc:L63` obtains the SKU SmartList itself.
 *
 * M7/M8 OBEYED. The setting resolver is SYNCHRONOUS here because the port declares it so; nothing in
 * this suite awaits a setting or depends on background completion. No value is memoised across tests:
 * every double, entity and builder is constructed fresh per case, so no warm-container state can bleed
 * between them.
 */

/*
 * The Google Merchant specification URL carried in the legacy view's own CFML comment header at
 * `integrationServices/google/views/feed/product.cfm:L4-L5`, preserved verbatim because deleting it
 * would lose the only pointer the legacy author left to the field specification:
 *
 *   http://support.google.com/merchants/bin/answer.py?hl=en&answer=188494&topic=2473824&ctx=topic#US
 *
 * It sat inside `<!--- ... --->`, a CFML server-side comment, so it was NEVER emitted. The assertion
 * below proves the port did not promote it into output.
 */
const LEGACY_SPECIFICATION_URL =
  'http://support.google.com/merchants/bin/answer.py?hl=en&answer=188494&topic=2473824&ctx=topic#US';

/* Byte-exact envelope literals read from the legacy view. */
const EXPECTED_XML_DECLARATION = '<?xml version="1.0"?>';
const EXPECTED_RSS_OPEN_TAG = '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">';
const EXPECTED_CHANNEL_TITLE_ELEMENT = '<title>Slatwall Product Feed</title>';

/*
 * Deterministic render inputs.
 *
 * JUDGMENT, RECORDED RATHER THAN APPLIED SILENTLY: the two instants are constructed with `Date.UTC`
 * rather than with the local-time `new Date(y, m, d, …)` form. `ProductFeedBuilder` renders each
 * endpoint by shifting the supplied instant by the supplied raw offset and then reading the shifted
 * value's UTC components, so a locally constructed literal would encode the HOST's zone into the
 * expected bytes and make this suite pass or fail according to where it ran. Supplying a true instant
 * and asserting the shifted wall clock keeps every byte below host-timezone-independent while still
 * exercising exactly the arithmetic the legacy `dateFormat`/`timeFormat` pair performed at
 * `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * Epoch milliseconds are held at module scope because a number is immutable; the `Date` objects
 * themselves are constructed inside the scenario factory so no two cases can share one.
 */
const RENDER_INSTANT_EPOCH_MS = Date.UTC(2024, 0, 1, 12, 30, 45);
const SALE_EXPIRATION_EPOCH_MS = Date.UTC(2024, 1, 9, 3, 15, 0);
const RAW_UTC_HOUR_OFFSET = '5';
const RENDER_HOST = 'catalog.example.test';
const ABSOLUTE_URL_PREFIX = `http://${RENDER_HOST}`;

/*
 * The two effective-date endpoints the offset above produces. Both are shifted back five hours from the
 * instants above, and both carry the raw bare-number offset the legacy template interpolated.
 */
const EXPECTED_EFFECTIVE_DATE_START = '2024-01-01T07:30:45-5';
const EXPECTED_EFFECTIVE_DATE_END = '2024-02-08T22:15:00-5';

/*
 * Identifiers. 32-character lower-case hex with no dashes, matching the platform's own identifier shape
 * (`model/dao/HibachiDAO.cfc` `createSlatwallUUID()`), so nothing here implies an auto-increment key or
 * an RFC-4122 dashed form.
 */
const SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const SECOND_SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';
const PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const BRAND_ID = 'ddddddddddddddddddddddddddddddd4';

/*
 * Setting values. These are FIXTURE values chosen so each one is observable in the output; none is a
 * claim about a production default. `config/dbdata/SlatwallSetting.xml.cfm` seeds NEITHER shipping key,
 * and the effective-value engine that would supply a metadata default lives in the out-of-scope setting
 * service, so inventing a default here would be fabrication. The resolver double refuses an unseeded
 * key for exactly that reason, which is why every case seeds precisely what it reads.
 */
const SETTING_GLOBAL_URL_KEY_PRODUCT = 'product';
const SETTING_IMAGE_MISSING_IMAGE_PATH = '/missing.png';
const SETTING_SKU_SHIPPING_WEIGHT = '5';
const SETTING_SKU_SHIPPING_WEIGHT_UNIT_CODE = 'lb';

const DEFAULT_SETTING_SEEDS: readonly SettingSeed[] = Object.freeze([
  Object.freeze({ settingName: 'globalURLKeyProduct', value: SETTING_GLOBAL_URL_KEY_PRODUCT }),
  Object.freeze({ settingName: 'imageMissingImagePath', value: SETTING_IMAGE_MISSING_IMAGE_PATH }),
  Object.freeze({ settingName: 'skuShippingWeight', value: SETTING_SKU_SHIPPING_WEIGHT }),
  Object.freeze({
    settingName: 'skuShippingWeightUnitCode',
    value: SETTING_SKU_SHIPPING_WEIGHT_UNIT_CODE,
  }),
]);

/*
 * Image fixtures. The image port double ECHOES by default rather than composing a directory layout, so
 * the composed value is seeded explicitly. The shape of the seeded value follows the hard-coded
 * `/product/default/` segment the legacy entity used at `model/entity/Sku.cfc:L145-L147`; the real
 * composition is the adapter's responsibility and is not asserted here.
 */
const SKU_IMAGE_FILE = 'nike-air.jpg';
const SKU_COMPOSED_IMAGE_PATH = '/product/default/nike-air.jpg';
const FIRST_ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-side.jpg';
const SECOND_ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-sole.jpg';
const THIRD_ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-top.jpg';

/*
 * The escaping sentinel and its legacy-compatible result.
 *
 * `htmlEditFormat` processes `&` FIRST and then the three angle/quote characters, and it leaves the
 * APOSTROPHE alone. Ordering matters: escaping `<` before `&` would double-escape the ampersand it
 * introduces. The single quote surviving untouched is the asymmetry that makes this sentinel worth
 * using rather than a bare `&`.
 */
const ESCAPE_SENTINEL = 'A&B<C>D"E\'F';
const ESCAPED_SENTINEL = "A&amp;B&lt;C&gt;D&quot;E'F";

/*
 * The builder indents channel children with two tabs and item children with three. That difference is
 * the only thing separating the channel-level `<title>`/`<description>` pair from the item-level pair,
 * and the channel pair is NOT escaped while the item pair IS — so every assertion that could be
 * ambiguous between them is anchored on the indent rather than on the bare tag.
 */
const CHANNEL_FIELD_INDENT = '\t\t';
const ITEM_FIELD_INDENT = '\t\t\t';

/** Anchor a markup fragment to the item-field indent so it cannot match a channel-level element. */
function itemField(markup: string): string {
  return `${ITEM_FIELD_INDENT}${markup}`;
}

/** Anchor a markup fragment to the channel-field indent. */
function channelField(markup: string): string {
  return `${CHANNEL_FIELD_INDENT}${markup}`;
}

/** Count non-overlapping occurrences of `needle`. Used where "exactly one element" is the assertion. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/* -----------------------------------------------------------------------------------------------------
 * The typed scenario factory.
 *
 * Everything it returns is created fresh on every call: the four port doubles with their own call logs,
 * the five entities, the builder, and both `Date` instants. There is no module-scope mutable state, no
 * singleton double, no shared call array and no shared result queue anywhere in this file, so no case
 * can observe another's writes. Only frozen literal constants live at module scope.
 * -------------------------------------------------------------------------------------------------- */

interface ScenarioSeed {
  readonly host?: string;
  readonly utcHourOffset?: string;
  /** Appended AFTER the defaults, so a later seed for the same key wins. */
  readonly settings?: readonly SettingSeed[];
  readonly imagePathsByImageFile?: Readonly<Record<string, string>>;
  readonly productDescription?: string;
  readonly productTypeDescription?: string;
  readonly productTypeName?: string;
  /** Supplying this wires a parent product type, which makes `getSimpleRepresentation()` walk. */
  readonly parentProductTypeName?: string;
  readonly calculatedTitle?: string;
  readonly productName?: string;
  readonly productCode?: string;
  readonly urlTitle?: string;
  readonly productPrice?: number | string;
  /** Leaves the product with no price at all, exercising the empty-element branch. */
  readonly omitProductPrice?: boolean;
  readonly skuCode?: string;
  readonly skuPrice?: number | string;
  /** `'absent'` omits the brand object entirely, exercising the legacy `isNull` branch. */
  readonly brand?: 'present' | 'absent';
  readonly brandName?: string;
}

interface RenderRequest {
  /** Defaults to the scenario's single SKU. Supply several to observe returned record order. */
  readonly skus?: readonly Sku[];
  /** Applied to every record. Defaults to no additional images. */
  readonly productImages?: readonly ProductFeedImage[];
  /** Forwarded to the builder's declared render options when supplied, and omitted otherwise. */
  readonly signal?: AbortSignal;
}

interface FeedScenario {
  readonly productType: ProductType;
  readonly product: Product;
  readonly sku: Sku;
  readonly brand: Brand | undefined;
  readonly settings: SettingResolverDouble;
  readonly images: ImagePathDouble;
  readonly pricing: PricingDouble;
  readonly smartList: SmartListQueryDouble;
  readonly builder: ProductFeedBuilder;
  readonly context: ProductFeedRenderContext;
  readonly saleExpiration: Date;
  /** Seed one product's sale details, keyed by SKU identifier exactly as the port declares. */
  seedSaleDetails(details: SalePriceDetailsBySkuId): void;
  /**
   * Materialize records THROUGH the SmartList port, then serialize them.
   *
   * This is the boundary the legacy view crossed at
   * `integrationServices/google/views/feed/product.cfm:L8,L16`, where the records arrived already
   * materialized from `rc.skuSmartList.getRecords()`. The double is configured with the rows, the real
   * `executeRecords` member is called to obtain them, and only then are they handed to the builder — so
   * this suite proves the records originate behind the port without asserting anything about how the
   * query that produced them was composed.
   */
  render(request?: RenderRequest): Promise<string>;
}

function createScenario(seed: ScenarioSeed = {}): FeedScenario {
  /*
   * The legacy fixture contract from `meta/tests/unit/Helper.cfc:L52-L77`, reused rather than retyped so
   * the product code, name, price and merchandise product-type identifier stay traceable.
   */
  const legacyFixture = createTestMerchandiseProductData();

  const settings = createSettingResolverDouble({
    settings: [...DEFAULT_SETTING_SEEDS, ...(seed.settings ?? [])],
  });
  const images = createImagePathDouble({
    /*
     * `resizedImagePath` is deliberately left unseeded: the double then echoes each request's OWN
     * `imagePath`, which is the only configuration under which "each additional image used its own
     * resized path" is a falsifiable claim. A single global resize answer would collapse every image
     * onto one value and make the repeated-image assertions vacuous.
     */
    imagePathsByImageFile: seed.imagePathsByImageFile ?? {
      [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH,
    },
  });
  const pricing = createPricingDouble();
  const smartList = createSmartListQueryDouble();

  const productTypeSeed: {
    productTypeID: string;
    productTypeName: string;
    productTypeDescription?: string;
    parentProductType?: ProductType;
  } = {
    productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
    productTypeName: seed.productTypeName ?? MERCHANDISE_PRODUCT_TYPE.productTypeName,
  };
  if (seed.productTypeDescription !== undefined) {
    productTypeSeed.productTypeDescription = seed.productTypeDescription;
  }
  if (seed.parentProductTypeName !== undefined) {
    productTypeSeed.parentProductType = buildProductType({
      productTypeName: seed.parentProductTypeName,
    });
  }
  const productType = buildProductType(productTypeSeed);

  const brand =
    (seed.brand ?? 'present') === 'absent'
      ? undefined
      : buildBrand({ brandID: BRAND_ID, brandName: seed.brandName ?? 'Nike' });

  const productSeed: {
    productID: string;
    productCode: string;
    productName: string;
    urlTitle: string;
    calculatedTitle: string;
    productType: ProductType;
    productDescription?: string;
    brand?: Brand;
  } = {
    productID: PRODUCT_ID,
    productCode: seed.productCode ?? legacyFixture.productCode,
    /*
     * A sentinel distinct from `calculatedTitle`. `Product.getTitle()` is the TEMPLATE-driven member
     * (`model/entity/Product.cfc:L540-L545`) that interpolates `productTitleString`; the feed reads the
     * PERSISTED `calculatedTitle` instead (`integrationServices/google/views/feed/product.cfm:L18`).
     * Keeping the two values different is what makes the item title's source unambiguous.
     */
    productName: seed.productName ?? 'TEMPLATE-ONLY-PRODUCT-NAME',
    urlTitle: seed.urlTitle ?? 'nike-air',
    calculatedTitle: seed.calculatedTitle ?? 'PERSISTED-CALCULATED-TITLE',
    productType,
  };
  if (seed.productDescription !== undefined) {
    productSeed.productDescription = seed.productDescription;
  }
  if (brand !== undefined) {
    productSeed.brand = brand;
  }
  const product = buildProduct(productSeed);

  if (seed.omitProductPrice !== true) {
    product.price = toExactDecimal(seed.productPrice ?? legacyFixture.price);
  }

  const sku = buildSku({
    skuID: SKU_ID,
    skuCode: seed.skuCode ?? `${legacyFixture.productCode}-1`,
    /* Deliberately different from the product price so `g:price`'s source is observable. */
    price: seed.skuPrice ?? 90,
    imageFile: SKU_IMAGE_FILE,
    product,
  });

  const builder = new ProductFeedBuilder(images.imagePaths, pricing.pricing, settings.resolver);

  const context: ProductFeedRenderContext = {
    host: seed.host ?? RENDER_HOST,
    renderTime: new Date(RENDER_INSTANT_EPOCH_MS),
    utcHourOffset: seed.utcHourOffset ?? RAW_UTC_HOUR_OFFSET,
  };

  return {
    productType,
    product,
    sku,
    brand,
    settings,
    images,
    pricing,
    smartList,
    builder,
    context,
    saleExpiration: new Date(SALE_EXPIRATION_EPOCH_MS),
    seedSaleDetails: (details: SalePriceDetailsBySkuId): void => {
      pricing.set(PRODUCT_ID, details);
    },
    render: async (request: RenderRequest = {}): Promise<string> => {
      const rows = request.skus ?? [sku];
      smartList.enqueue({ kind: 'page', metrics: {}, records: rows });
      const materialized = await smartList.smartList.executeRecords({ entityName: 'SlatwallSku' });
      const productImages = request.productImages ?? [];
      const records: readonly ProductFeedRecord[] = materialized.map((row) => ({
        sku: row,
        productImages,
      }));
      /*
       * The options argument is OMITTED rather than passed as `undefined` when no signal was requested,
       * because `exactOptionalPropertyTypes` makes those two different things and the builder declares
       * the member optional.
       */
      if (request.signal === undefined) {
        return builder.build(records, context);
      }
      return builder.build(records, context, { signal: request.signal });
    },
  };
}

/** Every resize request the image port received, in call order. */
function resizeRequests(images: ImagePathDouble): readonly ResizedImagePathRequest[] {
  const requests: ResizedImagePathRequest[] = [];
  for (const call of images.calls) {
    if (call.member === 'getResizedImagePath') {
      requests.push(call.request);
    }
  }
  return requests;
}

/** Every setting name the resolver was asked for, in call order. */
function resolvedSettingNames(settings: SettingResolverDouble): readonly string[] {
  return settings.calls.map((call) => call.settingName);
}

/** The resolution context recorded for the first call naming `settingName`, if there was one. */
function firstResolutionContext(
  settings: SettingResolverDouble,
  settingName: string,
): SettingResolutionContext | undefined {
  for (const call of settings.calls) {
    if (call.settingName === settingName) {
      return call.context;
    }
  }
  return undefined;
}

/* -----------------------------------------------------------------------------------------------------
 * Source-text inspection for the two source-level censuses.
 *
 * Two mandated checks cannot be observed at runtime at all: that the eleven fields the legacy author
 * disabled remain present as SOURCE COMMENTS in three separate blocks interleaved with the live fields,
 * and that the escape helper is called at exactly six sites. Both are properties of the source text, so
 * the builder is read as TEXT with `node:fs`/`node:path` only. Nothing here parses, evaluates, imports
 * for reflection, or modifies the builder, and neither built-in is used anywhere else in this file —
 * there is no filesystem double, no network double and no product behaviour routed through them.
 * -------------------------------------------------------------------------------------------------- */

const BUILDER_SOURCE_PATH = join(
  __dirname,
  '..',
  '..',
  'src',
  'integrations',
  'google',
  'ProductFeedBuilder.ts',
);

interface SourceSpan {
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
}

interface PartitionedSource {
  readonly text: string;
  /** Every line-comment and block-comment span, in source order. */
  readonly commentSpans: readonly SourceSpan[];
  /** The complement of `commentSpans`: every run of executable text, in source order. */
  readonly codeSpans: readonly SourceSpan[];
}

/*
 * Split the source into comment spans and code spans.
 *
 * A naive `indexOf('//')` scan would mistake the `//` inside a `'http://…'` literal for a comment, and
 * the builder contains eleven such literals, so the walk tracks string, template-literal and
 * `${…}`-substitution state explicitly. Template substitutions nest arbitrarily, hence the frame stack
 * rather than a boolean. `charAt` is used rather than indexing because it answers `string` for an
 * out-of-range position, which keeps the walk total under `noUncheckedIndexedAccess` without a narrowing
 * branch on every character.
 *
 * The partition is verified to be exhaustive and non-overlapping by a dedicated case below: the two span
 * collections must reconstruct the source byte for byte. Without that self-check a silent bug in this
 * walk could make the censuses assert nothing.
 */
function partitionBuilderSource(text: string): PartitionedSource {
  type Frame = { kind: 'code'; braceDepth: number } | { kind: 'template' };
  const commentSpans: SourceSpan[] = [];
  const stack: Frame[] = [{ kind: 'code', braceDepth: 0 }];
  let index = 0;

  while (index < text.length) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) {
      break;
    }

    if (frame.kind === 'template') {
      const character = text.charAt(index);
      if (character === '\\') {
        index += 2;
      } else if (character === '`') {
        stack.pop();
        index += 1;
      } else if (character === '$' && text.charAt(index + 1) === '{') {
        stack.push({ kind: 'code', braceDepth: 0 });
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    const character = text.charAt(index);
    const following = text.charAt(index + 1);

    if (character === '/' && following === '/') {
      const newline = text.indexOf('\n', index);
      const end = newline === -1 ? text.length : newline;
      commentSpans.push({ start: index, end });
      index = end;
      continue;
    }

    if (character === '/' && following === '*') {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : close + 2;
      commentSpans.push({ start: index, end });
      index = end;
      continue;
    }

    if (character === "'" || character === '"') {
      index += 1;
      while (index < text.length) {
        const inner = text.charAt(index);
        if (inner === '\\') {
          index += 2;
          continue;
        }
        if (inner === character || inner === '\n') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (character === '`') {
      stack.push({ kind: 'template' });
      index += 1;
      continue;
    }

    if (character === '{') {
      frame.braceDepth += 1;
      index += 1;
      continue;
    }

    if (character === '}') {
      if (frame.braceDepth === 0 && stack.length > 1) {
        stack.pop();
      } else {
        frame.braceDepth -= 1;
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  const codeSpans: SourceSpan[] = [];
  let cursor = 0;
  for (const span of commentSpans) {
    if (span.start > cursor) {
      codeSpans.push({ start: cursor, end: span.start });
    }
    cursor = span.end;
  }
  if (cursor < text.length) {
    codeSpans.push({ start: cursor, end: text.length });
  }

  return { text, commentSpans, codeSpans };
}

/** Concatenate the text of every span, joined so no accidental token spans a boundary. */
function spanText(source: PartitionedSource, spans: readonly SourceSpan[]): string {
  return spans.map((span) => source.text.slice(span.start, span.end)).join('\n');
}

/** Every offset at which `needle` occurs inside a CODE span, in source order. */
function codeOffsetsOf(source: PartitionedSource, needle: string): readonly number[] {
  const offsets: number[] = [];
  for (const span of source.codeSpans) {
    const region = source.text.slice(span.start, span.end);
    let at = region.indexOf(needle);
    while (at !== -1) {
      offsets.push(span.start + at);
      at = region.indexOf(needle, at + 1);
    }
  }
  return offsets;
}

/**
 * Split every `openTag`…`closeTag` region found in code into those that call `helper` and those that do
 * not. This is what turns "these six fields are escaped and those seven are not" into a source-level
 * statement rather than an inference.
 */
function escapeCensus(
  source: PartitionedSource,
  openTag: string,
  closeTag: string,
  helper: string,
): { readonly escaped: number; readonly raw: number } {
  let escaped = 0;
  let raw = 0;
  for (const span of source.codeSpans) {
    const region = source.text.slice(span.start, span.end);
    let at = region.indexOf(openTag);
    while (at !== -1) {
      const close = region.indexOf(closeTag, at);
      const enclosed = close === -1 ? region.slice(at) : region.slice(at, close);
      if (enclosed.includes(`${helper}(`)) {
        escaped += 1;
      } else {
        raw += 1;
      }
      at = region.indexOf(openTag, at + 1);
    }
  }
  return { escaped, raw };
}

/**
 * A field name matcher with an identifier boundary.
 *
 * `g:shipping` must not match live `g:shipping_weight`, and `g:tax` must not match `g:tax_ship`, so the
 * trailing character class excludes the underscore as well as alphanumerics. Every disabled-field check
 * in this file goes through this one builder so no call site can forget the boundary.
 */
function fieldNamePattern(fieldName: string): RegExp {
  return new RegExp(`${fieldName}(?![A-Za-z0-9_])`);
}

/** The single comment span containing every one of `fieldNames`; fails loudly when there is not exactly one. */
function soleCommentSpanContaining(
  source: PartitionedSource,
  fieldNames: readonly string[],
): SourceSpan {
  const matches = source.commentSpans.filter((span) => {
    const comment = source.text.slice(span.start, span.end);
    return fieldNames.every((fieldName) => fieldNamePattern(fieldName).test(comment));
  });
  expect(matches).toHaveLength(1);
  const [only] = matches;
  if (only === undefined) {
    throw new Error(
      `No single builder comment span carries all of: ${fieldNames.join(', ')}. The three disabled ` +
        'blocks may have been flattened, split further, or deleted.',
    );
  }
  return only;
}

/** The one offset at which `needle` occurs in code; fails loudly when it is not unique. */
function soleCodeOffsetOf(source: PartitionedSource, needle: string): number {
  const offsets = codeOffsetsOf(source, needle);
  expect(offsets).toHaveLength(1);
  const [only] = offsets;
  if (only === undefined) {
    throw new Error(`\`${needle}\` does not occur exactly once in the builder's executable text.`);
  }
  return only;
}

/* The eleven top-level field names the legacy author disabled, grouped exactly as the source groups them. */
const DISABLED_BLOCK_ONE_FIELDS: readonly string[] = Object.freeze([
  'g:gtin',
  'g:mpn',
  'g:gender',
  'g:age_group',
]);
const DISABLED_BLOCK_TWO_FIELDS: readonly string[] = Object.freeze([
  'g:color',
  'g:size',
  'g:material',
  'g:pattern',
  'g:tax',
  'g:shipping',
]);
const DISABLED_BLOCK_TWO_NESTED_FIELDS: readonly string[] = Object.freeze([
  'g:country',
  'g:region',
  'g:rate',
  'g:tax_ship',
  'g:service',
  'g:price',
]);
const DISABLED_BLOCK_THREE_FIELDS: readonly string[] = Object.freeze(['g:online_only']);
const ALL_DISABLED_TOP_LEVEL_FIELDS: readonly string[] = Object.freeze([
  ...DISABLED_BLOCK_ONE_FIELDS,
  ...DISABLED_BLOCK_TWO_FIELDS,
  ...DISABLED_BLOCK_THREE_FIELDS,
]);

/* =====================================================================================================
 * §1 — The RSS envelope and the channel, byte for byte.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — RSS envelope and channel', () => {
  /*
   * M2 — EXECUTION-MODEL MISMATCH, FLAGGED AND LEFT UNRESOLVED.
   *
   * `integrationServices/google/views/feed/product.cfm:L9` set `<cfsetting requesttimeout="360" />`,
   * granting the feed render a 360-second budget on a persistent application server. That budget fits
   * inside AWS Lambda's 900-second function ceiling but far exceeds the roughly 29-second synchronous
   * API Gateway integration budget, so a synchronous route cannot carry the legacy budget. The choice
   * between an asynchronous and a streamed delivery model is a HANDLER-LAYER decision and is explicitly
   * unresolved: no timeout assertion, timeout constant, page size, chunk size or delivery policy appears
   * anywhere in this file, because inventing one would substitute a guess for the decision.
   */
  it('[NET-NEW] opens with the exact declaration, RSS tag and channel, and no encoding attribute', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L1` carries the declaration and the opening
     * `<cfsilent>` on the SAME physical line. `<cfsilent>` is a server-side tag that suppresses output
     * and is never emitted, so the emitted prefix is the declaration alone — and the declaration itself
     * carries NO `encoding` attribute, which is preserved rather than "corrected" to UTF-8.
     */
    expect(xml.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);
    expect(xml).not.toContain('encoding=');
    /* `:L11` then `:L12`, in that order and nothing between them. */
    expect(
      xml.startsWith(`${EXPECTED_XML_DECLARATION}\n${EXPECTED_RSS_OPEN_TAG}\n\t<channel>\n`),
    ).toBe(true);
    expect(countOccurrences(xml, EXPECTED_RSS_OPEN_TAG)).toBe(1);
  });

  it('[NET-NEW] emits the exact channel title, hard-coded http link and channel description', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /* `:L13` — a fixed literal, not derived from any setting. */
    expect(xml).toContain(channelField(EXPECTED_CHANNEL_TITLE_ELEMENT));
    /*
     * `:L14` — `http://#CGI.HTTP_HOST#`. The scheme is HARD-CODED `http://` in the legacy template; it is
     * never HTTPS and is never negotiated from the request, so no scheme normalisation is applied here.
     */
    expect(xml).toContain(channelField(`<link>http://${RENDER_HOST}</link>`));
    expect(xml).not.toContain('https://');
    /*
     * `:L15` — the channel description. It is required output even though a summary field list can omit
     * it, and it repeats the same hard-coded `http://` prefix rather than reusing the link element.
     */
    expect(xml).toContain(
      channelField(`<description>Google Product Feed for http://${RENDER_HOST}</description>`),
    );
  });

  it('[NET-NEW] closes the channel before the RSS element and appends no trailing newline', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /* `:L64` then `:L65`. */
    expect(xml.endsWith('\t</channel>\n</rss>')).toBe(true);
    expect(xml.indexOf('</channel>')).toBeLessThan(xml.indexOf('</rss>'));
    expect(countOccurrences(xml, '</channel>')).toBe(1);
    expect(countOccurrences(xml, '</rss>')).toBe(1);
  });

  it('[NET-NEW] emits one item per SmartList-returned record, in the order the port returned them', async () => {
    const scenario = createScenario();
    const secondSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'TESTPRODUCTXXX-2',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: scenario.product,
    });

    const xml = await scenario.render({ skus: [secondSku, scenario.sku] });

    /*
     * `:L16` looped `rc.skuSmartList.getRecords()` and emitted one `<item>` per element in the order the
     * collection yielded them. Two DISTINCT SKU codes are used so the order is observable, and the
     * records are deliberately supplied in reverse of construction order so a hidden sort would fail.
     */
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(2);
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}</item>`)).toBe(2);
    expect(xml.indexOf('<g:id>TESTPRODUCTXXX-2</g:id>')).toBeLessThan(
      xml.indexOf('<g:id>TESTPRODUCTXXX-1</g:id>'),
    );

    /*
     * The rows crossed the SmartList port boundary and were materialized through its real
     * `executeRecords` member — the records-only view, which is the one the legacy `getRecords()` read.
     * Nothing about how the query was COMPOSED is asserted: joins, filters and the `'1^'` availability
     * range belong to `ProductFeedQuery`, which this file never imports.
     */
    expect(scenario.smartList.executions).toHaveLength(1);
    expect(scenario.smartList.executions[0]?.selection).toBe('recordsOnly');
    expect(scenario.smartList.lastQuery()?.entityName).toBe('SlatwallSku');
  });

  it('[NET-NEW] emits no CFML tag, no markup comment and not the legacy specification URL', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /* `:L1`, `:L10`, `:L16`, `:L63` and `:L66` are all server-side and produce no output. */
    expect(xml).not.toContain('<cfsilent>');
    expect(xml).not.toContain('</cfsilent>');
    expect(xml).not.toContain('<cfoutput>');
    expect(xml).not.toContain('</cfoutput>');
    expect(xml).not.toContain('<cfloop');
    expect(xml).not.toContain('<cfif');
    expect(xml).not.toContain('<cfsetting');
    /* CFML server-side comment delimiters, and the XML comment they must not have become. */
    expect(xml).not.toContain('<!---');
    expect(xml).not.toContain('--->');
    expect(xml).not.toContain('<!--');
    /*
     * `:L4-L5` — the specification URL lived inside a CFML server-side comment. It is preserved as a
     * TypeScript comment at the head of this file so the pointer survives, and it must not appear in the
     * rendered document.
     */
    expect(xml).not.toContain(LEGACY_SPECIFICATION_URL);
    expect(xml).not.toContain('support.google.com');
  });
});

/* =====================================================================================================
 * §2 — Identity, title, description, category and product type.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — identity, title, description, category, product type', () => {
  it('[NET-NEW] emits g:id from the escaped SKU code', async () => {
    const scenario = createScenario({ skuCode: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /* `integrationServices/google/views/feed/product.cfm:L17` — `htmlEditFormat(sku.getSkuCode())`. */
    expect(xml).toContain(itemField(`<g:id>${ESCAPED_SENTINEL}</g:id>`));
  });

  it('[NET-NEW] emits the item title from the persisted calculatedTitle, never from the template getTitle', async () => {
    const scenario = createScenario({
      calculatedTitle: ESCAPE_SENTINEL,
      productName: 'TEMPLATE-ONLY-PRODUCT-NAME',
    });

    const xml = await scenario.render();

    /*
     * `:L18` reads the PERSISTED `calculatedTitle`. `Product.getTitle()`
     * (`model/entity/Product.cfc:L540-L545`) is a different member entirely: it interpolates the
     * `productTitleString` setting template. The two sentinels are deliberately distinct so the source is
     * unambiguous, and this suite never calls `getTitle()`.
     */
    expect(xml).toContain(itemField(`<title>${ESCAPED_SENTINEL}</title>`));
    expect(xml).not.toContain('TEMPLATE-ONLY-PRODUCT-NAME');
    /*
     * A second, independent proof: `productTitleString` is never seeded, and the resolver double RAISES
     * for an unseeded key. Its absence from the call log therefore establishes that the template member
     * was not reached, rather than merely that its output did not happen to appear.
     */
    expect(resolvedSettingNames(scenario.settings)).not.toContain('productTitleString');
  });

  /*
   * THE THREE-BRANCH DESCRIPTION — a judgment call, recorded rather than smoothed over.
   *
   * `integrationServices/google/views/feed/product.cfm:L19` is a single element with a three-way body:
   *   BRANCH A — `len(product.getProductDescription())` is truthy, so the PRODUCT description is emitted.
   *   BRANCH B — it is falsy, so the fallback tests `len(productType.getProductTypeDescription())` and
   *              emits the PRODUCT TYPE description.
   *   BRANCH C — both are falsy, and the `<cfif>`/`<cfelseif>` pair has no `<cfelse>`, so the element is
   *              still emitted with an EMPTY body.
   * The gate is `len()`, which is a LENGTH test rather than a null test and rather than a trimmed test.
   * A whitespace-only product description therefore has non-zero length and WINS, and the port does not
   * trim, does not coalesce whitespace, and does not harmonise this gate with the `isNull()` object test
   * that guards the brand element at `:L32`.
   */
  it('[NET-NEW] description branch A — a non-empty product description wins and is escaped', async () => {
    const scenario = createScenario({
      productDescription: ESCAPE_SENTINEL,
      productTypeDescription: 'TYPE-LEVEL-DESCRIPTION',
    });

    const xml = await scenario.render();

    expect(xml).toContain(itemField(`<description>${ESCAPED_SENTINEL}</description>`));
    expect(xml).not.toContain('TYPE-LEVEL-DESCRIPTION');
  });

  it('[NET-NEW] description branch B — an empty product description falls through to the escaped product type description', async () => {
    const scenario = createScenario({
      productDescription: '',
      productTypeDescription: ESCAPE_SENTINEL,
    });

    const xml = await scenario.render();

    expect(xml).toContain(itemField(`<description>${ESCAPED_SENTINEL}</description>`));
  });

  it('[NET-NEW] description branch C — both empty still emits the paired empty element', async () => {
    const scenario = createScenario({ productDescription: '', productTypeDescription: '' });

    const xml = await scenario.render();

    /*
     * `:L19` has no `<cfelse>`, so the element is emitted with nothing inside it. It is NOT omitted and
     * NOT self-closing — a reader tidying this into `<description/>` would change the bytes a merchant
     * feed processor receives.
     */
    expect(xml).toContain(itemField('<description></description>'));
    expect(xml).not.toContain('<description/>');
    expect(xml).not.toContain('<description />');
  });

  it('[NET-NEW] description gate is len(), so a whitespace-only product description is kept untrimmed', async () => {
    const scenario = createScenario({
      productDescription: '   ',
      productTypeDescription: 'TYPE-LEVEL-DESCRIPTION',
    });

    const xml = await scenario.render();

    /* Three spaces have non-zero length, so branch A wins and the spaces survive verbatim. */
    expect(xml).toContain(itemField('<description>   </description>'));
    expect(xml).not.toContain('TYPE-LEVEL-DESCRIPTION');
  });

  it('[NET-NEW] emits g:google_product_category as a paired empty element and never populates it', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `:L20` is a hard-coded empty element. THE CATEGORY DRIFT TRAP: the integration declares a
     * `productGoogleProductType` select setting at
     * `integrationServices/google/Integration.cfc:L68-L70`, and it is tempting to conclude the feed
     * populates the category from it. It does not — `getSettingOptions()` in that same file has an EMPTY
     * body, and the view never reads the setting. The element ships empty.
     */
    expect(xml).toContain(itemField('<g:google_product_category></g:google_product_category>'));
    expect(xml).not.toContain('<g:google_product_category/>');
    expect(xml).not.toContain('<g:google_product_category />');
    expect(xml).not.toContain('productGoogleProductType');
    expect(resolvedSettingNames(scenario.settings)).not.toContain('productGoogleProductType');
  });

  it('[NET-NEW] emits g:product_type from the escaped product type simple representation', async () => {
    const scenario = createScenario({ productTypeName: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /* `:L21` — `htmlEditFormat(productType.getSimpleRepresentation())`. */
    expect(xml).toContain(itemField(`<g:product_type>${ESCAPED_SENTINEL}</g:product_type>`));
  });

  it('[NET-NEW] escapes the raquo separator a product type hierarchy introduces', async () => {
    const scenario = createScenario({
      parentProductTypeName: 'Apparel',
      productTypeName: 'Shirts',
    });

    const xml = await scenario.render();

    /*
     * `model/entity/ProductType.cfc:L273-L278` joins a child to its parent with the LITERAL text
     * ` &raquo; ` — an HTML entity written out as characters, not a Unicode guillemet. `htmlEditFormat`
     * then escapes its leading ampersand, so the emitted separator is ` &amp;raquo; `. That double-escaped
     * look is the legacy output and is preserved rather than "repaired" to a real `»`.
     */
    expect(xml).toContain(itemField('<g:product_type>Apparel &amp;raquo; Shirts</g:product_type>'));
    expect(xml).not.toContain(' &raquo; ');
  });
});

/* =====================================================================================================
 * §3 — Absolute URLs and images. Every one of these fields is UNESCAPED.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — links and images', () => {
  it('[NET-NEW] emits the item link as raw http, keeping the product URL leading and trailing slashes', async () => {
    const scenario = createScenario({ urlTitle: 'nike-air' });

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L22` concatenates the hard-coded `http://`, the
     * raw host and `product.getProductURL()`. `model/entity/Product.cfc:L207-L209` composes that path as
     * `/#setting('globalURLKeyProduct')#/#getURLTitle()#/`, so it carries BOTH a leading and a trailing
     * slash. Neither is trimmed, and the two slashes are why the concatenation needs no separator.
     */
    expect(xml).toContain(
      itemField(`<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/</link>`),
    );
    expect(xml).not.toContain('<link>https://');
    /* The URL key is read through the setting resolver, not hard-coded in the builder. */
    expect(resolvedSettingNames(scenario.settings)).toContain('globalURLKeyProduct');
  });

  it('[NET-NEW] leaves ampersands and angle brackets in the item link unescaped', async () => {
    const scenario = createScenario({ urlTitle: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /*
     * `:L22` does NOT wrap the link in `htmlEditFormat`, so a URL title carrying `&` or `<` reaches the
     * document raw and the result is not well-formed XML. That is the legacy behaviour, it is preserved,
     * and it is exactly why this suite asserts against the raw string rather than through an XML parser:
     * a parser would either reject the document or silently normalise the very bytes under test.
     */
    expect(xml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${ESCAPE_SENTINEL}/</link>`,
      ),
    );
    expect(xml).not.toContain(`/${ESCAPED_SENTINEL}/`);
  });

  it('[NET-NEW] emits g:image_link from the SKU resized path with no size arguments', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `:L23` calls `sku.getResizedImagePath()` with NO arguments at all. `model/entity/Sku.cfc:L192-L218`
     * accepts an optional size, width and height and applies a deprecated-size gate when one is supplied;
     * the feed supplies none, so none of that gate runs. The recorded request proves the absence rather
     * than assuming it.
     */
    expect(xml).toContain(
      itemField(`<g:image_link>${ABSOLUTE_URL_PREFIX}${SKU_COMPOSED_IMAGE_PATH}</g:image_link>`),
    );

    const requests = resizeRequests(scenario.images);
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0] ?? {}).sort()).toStrictEqual(['imagePath', 'missingImagePath']);
    expect(requests[0]?.size).toBeUndefined();
    expect(requests[0]?.width).toBeUndefined();
    expect(requests[0]?.height).toBeUndefined();
    expect(requests[0]?.resizeMethod).toBeUndefined();
  });

  it('[NET-NEW] emits no g:additional_image_link when the product has zero images', async () => {
    const scenario = createScenario();

    const xml = await scenario.render({ productImages: [] });

    /* `:L24` loops `product.getProductImages()`; an empty collection emits nothing at all. */
    expect(xml).not.toContain('<g:additional_image_link');
    /* Only the SKU's own image was resized. */
    expect(resizeRequests(scenario.images)).toHaveLength(1);
  });

  it('[NET-NEW] emits exactly one g:additional_image_link for a single product image', async () => {
    const scenario = createScenario();

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    expect(countOccurrences(xml, '<g:additional_image_link>')).toBe(1);
    expect(xml).toContain(
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      ),
    );
  });

  it('[NET-NEW] emits one g:additional_image_link per image in input order, with each image own path, no sort, dedupe or filter', async () => {
    const scenario = createScenario();

    /*
     * Supplied out of construction order and with a deliberate duplicate: input order is third, first,
     * second, first. `:L24` iterates the collection as given, so a hidden sort, a dedupe or a filter would
     * each fail this case, and reusing the SKU's primary path for the additional links would fail it too.
     */
    const xml = await scenario.render({
      productImages: [
        { imagePath: THIRD_ADDITIONAL_IMAGE_PATH },
        { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
        { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
        { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
      ],
    });

    expect(countOccurrences(xml, '<g:additional_image_link>')).toBe(4);
    const additionalLinks = xml
      .split('\n')
      .filter((line) => line.includes('<g:additional_image_link>'));
    expect(additionalLinks).toStrictEqual([
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${THIRD_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      ),
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      ),
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${SECOND_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      ),
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      ),
    ]);
    /* None of the four reused the SKU's primary resized path. */
    expect(countOccurrences(xml, SKU_COMPOSED_IMAGE_PATH)).toBe(1);

    /*
     * FIVE resized paths were needed — the SKU's own image plus four product images — but only FOUR
     * requests reached the port, because the builder memoises resized paths WITHIN a single `build()`
     * invocation, keyed on the request. The memo is a PORT-CALL optimisation and not a document one: the
     * repeated path still produced its own fourth `<g:additional_image_link>` asserted above, so no dedupe
     * leaked into the feed and `:L24`'s one-element-per-image loop is intact.
     *
     * M7 — that memo lives on the invocation rather than at module scope. The legacy equivalents were an
     * entity-instance cache and a `cacheuse="transactional"` second-level cache, neither of which survives
     * a request; scoping the port memo the same way is what keeps a warm Lambda container from serving one
     * tenant's resolved paths to another. The following case proves the memo does not outlive a build.
     */
    const requests = resizeRequests(scenario.images);
    expect(requests).toHaveLength(4);
    expect(requests.map((request) => String(request.imagePath))).toStrictEqual([
      SKU_COMPOSED_IMAGE_PATH,
      THIRD_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
      SECOND_ADDITIONAL_IMAGE_PATH,
    ]);

    /*
     * Every resize — the SKU's and each image's — was requested with NO size, width, height or
     * resize method, exactly as `:L23-L24` call the two accessors.
     */
    for (const request of requests) {
      expect(Object.keys(request).sort()).toStrictEqual(['imagePath', 'missingImagePath']);
      expect(request.size).toBeUndefined();
      expect(request.width).toBeUndefined();
      expect(request.height).toBeUndefined();
      expect(request.resizeMethod).toBeUndefined();
    }
  });

  it('[NET-NEW] does not carry a resized-path memo across two build invocations', async () => {
    const scenario = createScenario();

    await scenario.render({ productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }] });
    const afterFirstBuild = resizeRequests(scenario.images).length;
    await scenario.render({ productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }] });
    const afterSecondBuild = resizeRequests(scenario.images).length;

    /*
     * M7 — the second invocation resolved the SAME two paths again rather than reusing the first
     * invocation's memo, which is the observable difference between per-invocation state and module-scope
     * state on a warm container. Nothing here asserts a cache size, a hit rate or a timing figure; the
     * claim is only that the memo does not outlive a build.
     */
    expect(afterFirstBuild).toBe(2);
    expect(afterSecondBuild).toBe(4);
  });
});

/* =====================================================================================================
 * §4 — Fixed literals, the product price, and the price/sale-gate asymmetry.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — fixed literals, price and the conditional sale pair', () => {
  it('[NET-NEW] emits g:condition and g:availability as fixed literals, keeping the space in "in stock"', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L25-L26` hard-code both values. Neither is
     * derived from inventory, from a setting, or from the availability range the controller applied —
     * every item in the feed claims `new` and `in stock` unconditionally. The single space inside
     * `in stock` is part of the literal.
     */
    expect(xml).toContain(itemField('<g:condition>new</g:condition>'));
    expect(xml).toContain(itemField('<g:availability>in stock</g:availability>'));
    expect(xml).not.toContain('<g:availability>instock</g:availability>');
  });

  /*
   * THE PRICE / SALE-GATE ASYMMETRY — a judgment call, recorded so it is never "tidied up".
   *
   * `integrationServices/google/views/feed/product.cfm:L27` emits `sku.getProduct().getPrice()`: the
   * PRODUCT's price. `:L28` then gates the sale pair on `sku.getPrice() gt sku.getSalePrice()`: the SKU's
   * OWN regular price. The two lines read DIFFERENT prices, and they sit one line apart, which is exactly
   * why a well-intentioned port is tempted to harmonise them. Harmonising either direction changes which
   * items appear on sale and what price they advertise. The two cases below straddle the sale price with
   * the product and SKU prices in both directions, so each half of the asymmetry is independently pinned.
   */
  it('[NET-NEW] emits g:price from the product price while gating the sale pair on the SKU price', async () => {
    const scenario = createScenario({ productPrice: 60, skuPrice: 90 });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();

    /* `:L27` — the PRODUCT price, 60, not the SKU's 90. */
    expect(xml).toContain(itemField('<g:price>60</g:price>'));
    /*
     * `:L28-L29` — the gate compared the SKU's 90 against the sale price 79.5 and passed. Had it read the
     * product's 60 instead, 60 is NOT greater than 79.5 and the pair would have been omitted, so the
     * presence of these elements proves the gate reads the SKU price.
     */
    expect(xml).toContain(itemField('<g:sale_price>79.5</g:sale_price>'));
    expect(xml).toContain('<g:sale_price_effective_date>');
    /* The sale price came through the pricing port, never off an excluded calculated entity member. */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID]);
  });

  it('[NET-NEW] omits the sale pair at equality even when the product price exceeds the sale price', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 79.5 });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();

    /*
     * `:L28` uses `gt`, a STRICT comparison, so equality omits the pair. The product price of 100 is
     * greater than 79.5; had the gate read it, both elements would appear. Their absence is the other half
     * of the asymmetry.
     */
    expect(xml).toContain(itemField('<g:price>100</g:price>'));
    expect(xml).not.toContain('<g:sale_price>');
    expect(xml).not.toContain('<g:sale_price_effective_date>');
  });

  it('[NET-NEW] omits the sale pair when the SKU price is below the sale price', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 50 });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();

    expect(xml).not.toContain('<g:sale_price>');
    expect(xml).not.toContain('<g:sale_price_effective_date>');
  });

  it('[NET-NEW] falls back to the regular SKU price when no salePrice is supplied, so the pair is omitted', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    /*
     * The details object carries a discount TYPE but no `salePrice`. `model/entity/Sku.cfc:L546-L551`
     * returns `salePriceDetails["salePrice"]` only when that key exists and otherwise falls back to
     * `getPrice()` — the SKU's own regular price. The comparison therefore becomes 90 against 90, which
     * `gt` rejects, and the pair is omitted. Substituting null or zero for a missing sale price would put
     * EVERY SKU in the catalogue on sale, which is why the fallback is pinned rather than assumed.
     *
     * `SalePriceDetails` declares exactly three optional keys — `salePrice`, `salePriceDiscountType` and
     * `salePriceExpirationDateTime`. There is deliberately no `salePriceDiscountAmount`, and the builder
     * for this object admits no such key, so one cannot be added by accident.
     */
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({ salePriceDiscountType: 'percentageOff' }),
    });

    const xml = await scenario.render();

    expect(xml).toContain(itemField('<g:price>100</g:price>'));
    expect(xml).not.toContain('<g:sale_price>');
    expect(xml).not.toContain('<g:sale_price_effective_date>');
    /* The port WAS consulted; the omission is the fallback's outcome, not a skipped lookup. */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID]);
  });

  it('[NET-NEW] emits g:price as a paired empty element when the product has no price at all', async () => {
    const scenario = createScenario({ omitProductPrice: true });

    const xml = await scenario.render();

    /*
     * `model/entity/Product.cfc:L561-L568` returns `variables.price` when it exists, otherwise the default
     * SKU's price, and otherwise falls off the end of the function returning nothing. Interpolating that
     * nothing produced an EMPTY element. It is not `0`, it is not omitted, and it is not self-closing —
     * substituting a zero would advertise a free product.
     */
    expect(xml).toContain(itemField('<g:price></g:price>'));
    expect(xml).not.toContain('<g:price>0</g:price>');
    expect(xml).not.toContain('<g:price/>');
    expect(xml).not.toContain('<g:price />');
  });
});

/* =====================================================================================================
 * §5 — The malformed sale-price effective date, and the literal tab that follows it.
 * ================================================================================================== */

/** The text between the first `<tag>` and its `</tag>`, or `undefined` when the element is absent. */
function elementContent(xml: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) {
    return undefined;
  }
  const end = xml.indexOf(close, start + open.length);
  if (end === -1) {
    return undefined;
  }
  return xml.slice(start + open.length, end);
}

describe('NET-NEW ProductFeedBuilder — sale price effective date', () => {
  it('[NET-NEW] renders both endpoints with the malformed bare-number offset twice', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();
    const content = elementContent(xml, 'g:sale_price_effective_date');

    /*
     * TODO(parity) `integrationServices/google/views/feed/product.cfm:L30` — THE OFFSET IS MALFORMED AND
     * IS DEPRIVED OF ITS COLON ON PURPOSE.
     *
     * The legacy expression is
     *   `#dateFormat(now(),"YYYY-MM-DD")#T#timeFormat(now(),"HH:mm:ss")#-#getTimeZoneInfo().utcHourOffset#`
     * repeated for the expiration and joined with `/`. `getTimeZoneInfo().utcHourOffset` answers a BARE
     * NUMBER, so the emitted suffix is `-5`, not the ISO-8601 `-05:00` a merchant feed processor expects,
     * and the hyphen in front of it is a literal in the template rather than a sign derived from the
     * offset's direction. This is carried across EXACTLY. It is not padded, not colon-separated, not
     * sign-corrected and not normalised to `Z`. Repairing it would make the port's output incomparable to
     * the legacy system's, which is the one thing behaviour preservation forbids.
     */
    expect(content).toBe(`${EXPECTED_EFFECTIVE_DATE_START}/${EXPECTED_EFFECTIVE_DATE_END}`);

    /* Two endpoints, each carrying the SAME raw offset value, and the date/time pieces exact. */
    const endpoints = (content ?? '').split('/');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toBe(`2024-01-01T07:30:45-${RAW_UTC_HOUR_OFFSET}`);
    expect(endpoints[1]).toBe(`2024-02-08T22:15:00-${RAW_UTC_HOUR_OFFSET}`);

    /* No valid signed `HH:MM` offset appears anywhere in the document, and no `Z` normalisation occurred. */
    expect(xml).not.toMatch(/[+-]\d{2}:\d{2}/);
    expect(content).not.toContain('Z');
    expect(content).not.toContain('-05:00');
    expect(content).not.toContain('+00:00');

    /*
     * THE LITERAL TRAILING TAB. `:L30` ends with a tab character after the closing tag, verified in the
     * legacy file with a byte inspection rather than inferred from indentation. It is emitted, so it is
     * asserted byte-exactly here; trimming it would be a silent change to the document a merchant feed
     * processor receives.
     */
    expect(xml).toContain('</g:sale_price_effective_date>\t');
  });

  it('[NET-NEW] interpolates whatever raw offset the caller supplies, unformatted', async () => {
    const scenario = createScenario({
      productPrice: 100,
      skuPrice: 90,
      utcHourOffset: '7',
    });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();

    /*
     * The offset is interpolated as TEXT, and the wall clock of both endpoints shifts with it, matching
     * what `getTimeZoneInfo().utcHourOffset` did on the legacy host. Still no colon, still no padding.
     */
    expect(elementContent(xml, 'g:sale_price_effective_date')).toBe(
      '2024-01-01T05:30:45-7/2024-02-08T20:15:00-7',
    );
    expect(xml).not.toMatch(/[+-]\d{2}:\d{2}/);
  });
});

/* =====================================================================================================
 * §6 — Brand, item group identifier, and shipping weight.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — brand, item group and shipping weight', () => {
  it('[NET-NEW] emits an escaped g:brand when the brand object is present', async () => {
    const scenario = createScenario({ brand: 'present', brandName: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /* `integrationServices/google/views/feed/product.cfm:L32` — `htmlEditFormat(brand.getBrandName())`. */
    expect(xml).toContain(itemField(`<g:brand>${ESCAPED_SENTINEL}</g:brand>`));
  });

  it('[NET-NEW] emits a paired empty g:brand when the brand object exists with an empty name', async () => {
    const scenario = createScenario({ brand: 'present', brandName: '' });

    const xml = await scenario.render();

    /*
     * `:L32` tests the OBJECT, not the name, so a brand whose name is empty still satisfies the guard and
     * still emits the element — empty. Testing the name here instead would silently drop the element for
     * every unnamed brand.
     */
    expect(xml).toContain(itemField('<g:brand></g:brand>'));
    expect(xml).not.toContain('<g:brand/>');
    expect(xml).not.toContain('<g:brand />');
  });

  it('[NET-NEW] omits the entire g:brand element when the brand is absent, while an empty description stays present', async () => {
    const scenario = createScenario({
      brand: 'absent',
      productDescription: '',
      productTypeDescription: '',
    });

    const xml = await scenario.render();

    /*
     * THE `isNull` / `len` INCONSISTENCY — a judgment call, recorded and deliberately NOT harmonised.
     *
     * `:L32` guards the brand with `not isNull(product.getBrand())`: an OBJECT-EXISTENCE test, so an
     * absent brand removes the whole element, opening tag and all. `:L19` guards the description with
     * `len(...)`: a LENGTH test whose element is emitted either way and merely goes empty. Two adjacent
     * conditional fields, two different kinds of guard, two different outcomes for "no value". A port that
     * made both behave the same way — either both empty or both omitted — would change the document in one
     * of the two places no matter which way it chose. Both are preserved exactly as written.
     */
    expect(xml).not.toContain('<g:brand>');
    expect(xml).not.toContain('</g:brand>');
    expect(xml).toContain(itemField('<description></description>'));
    /* Ordering around the removed element still holds: the item group follows the product price. */
    expect(xml.indexOf('<g:price>')).toBeLessThan(xml.indexOf('<g:item_group_id>'));
  });

  it('[NET-NEW] emits g:item_group_id from the escaped product code', async () => {
    const scenario = createScenario({ productCode: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /* `:L39` — `htmlEditFormat(product.getProductCode())`, the live field wedged between two disabled blocks. */
    expect(xml).toContain(itemField(`<g:item_group_id>${ESCAPED_SENTINEL}</g:item_group_id>`));
  });

  it('[NET-NEW] assembles g:shipping_weight from two settings joined by exactly one space', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `:L58` interpolates the legacy `setting()` accessor on the SKU keyed `'skuShippingWeight'`, then a
     * single literal space, then the same accessor keyed `'skuShippingWeightUnitCode'`. Both key names are
     * byte-exact; the separator is one space, not a comma and not two spaces; and neither value is trimmed
     * or defaulted. The two values are read through the injected resolver port here, never off the entity.
     */
    expect(xml).toContain(
      itemField(
        `<g:shipping_weight>${SETTING_SKU_SHIPPING_WEIGHT} ${SETTING_SKU_SHIPPING_WEIGHT_UNIT_CODE}</g:shipping_weight>`,
      ),
    );
    expect(elementContent(xml, 'g:shipping_weight')).toBe(
      `${SETTING_SKU_SHIPPING_WEIGHT} ${SETTING_SKU_SHIPPING_WEIGHT_UNIT_CODE}`,
    );
    expect(xml).not.toContain('<g:shipping_weight>5  lb</g:shipping_weight>');
    expect(xml).not.toContain('<g:shipping_weight>5lb</g:shipping_weight>');

    /*
     * The two keys were resolved in the legacy order, consecutively, and both against the SKU that is
     * being serialized — `model/entity/HibachiEntity.cfc:L128-L131` forwards `object=this`, so the
     * resolution context is the SKU rather than a global lookup.
     */
    const names = resolvedSettingNames(scenario.settings);
    const weightAt = names.indexOf('skuShippingWeight');
    const unitAt = names.indexOf('skuShippingWeightUnitCode');
    expect(weightAt).toBeGreaterThanOrEqual(0);
    expect(unitAt).toBe(weightAt + 1);
    expect(firstResolutionContext(scenario.settings, 'skuShippingWeight')).toStrictEqual({
      entityName: 'Sku',
      entityId: SKU_ID,
    });
    expect(firstResolutionContext(scenario.settings, 'skuShippingWeightUnitCode')).toStrictEqual({
      entityName: 'Sku',
      entityId: SKU_ID,
    });

    /*
     * M8 — the resolver is SYNCHRONOUS by declaration and is never awaited. Had it been awaited, or had a
     * promise been interpolated, the element would carry `[object Promise]` instead of the value.
     */
    expect(xml).not.toContain('[object Promise]');
  });

  it('[NET-NEW] leaves ampersands and angle brackets in g:shipping_weight unescaped', async () => {
    const scenario = createScenario({
      settings: [
        { settingName: 'skuShippingWeight', value: '1&2' },
        { settingName: 'skuShippingWeightUnitCode', value: '<lb>' },
      ],
    });

    const xml = await scenario.render();

    /*
     * `:L58` does not wrap either value in `htmlEditFormat`, so both reach the document raw. The result is
     * not well-formed XML, which is the legacy behaviour and the reason this suite never routes output
     * through a parser.
     */
    expect(xml).toContain(itemField('<g:shipping_weight>1&2 <lb></g:shipping_weight>'));
    expect(xml).not.toContain('1&amp;2');
    expect(xml).not.toContain('&lt;lb&gt;');
  });
});

/* =====================================================================================================
 * §7 — The three disabled blocks, and the live fields interleaved between them.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — disabled fields, at runtime', () => {
  it('[NET-NEW] emits none of the eleven disabled top-level fields as a live element', async () => {
    const scenario = createScenario();

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    /*
     * THE THREE-BLOCK INTERLEAVING — a judgment call, recorded because a flat field list hides it.
     *
     * `integrationServices/google/views/feed/product.cfm` disables its optional fields in THREE separate
     * CFML comment blocks with LIVE fields wedged between them, not in one block at the end:
     *   BLOCK 1 `:L33-L38` — `g:gtin`, `g:mpn`, `g:gender`, `g:age_group`
     *   LIVE    `:L39`     — `g:item_group_id`
     *   BLOCK 2 `:L40-L57` — `g:color`, `g:size`, `g:material`, `g:pattern`, then `g:tax` wrapping
     *                        `g:country`, `g:region`, `g:rate`, `g:tax_ship`, then `g:shipping` wrapping
     *                        `g:country`, `g:region`, `g:service`, `g:price`
     *   LIVE    `:L58`     — `g:shipping_weight`
     *   BLOCK 3 `:L59-L61` — `g:online_only`
     * The tag-boundary matcher below is why `g:shipping` cannot false-match the live `g:shipping_weight`
     * and `g:tax` cannot false-match `g:tax_ship`.
     */
    for (const fieldName of ALL_DISABLED_TOP_LEVEL_FIELDS) {
      expect(xml).not.toMatch(fieldNamePattern(`<${fieldName}`));
      expect(xml).not.toMatch(fieldNamePattern(`</${fieldName}`));
    }

    /* The live fields those patterns must NOT have suppressed are still present. */
    expect(xml).toContain('<g:shipping_weight>');
    expect(xml).toContain('<g:additional_image_link>');
  });

  it('[NET-NEW] emits the live product price exactly once and none of the disabled nested children', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `g:price` is BOTH a live top-level field (`:L27`) and a disabled child of the commented `g:shipping`
     * group (`:L40-L57`). A blanket absence assertion is therefore impossible and a substring assertion
     * would false-match, so the claim is stated as a count: one item yields exactly one `<g:price>`.
     */
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(1);
    expect(countOccurrences(xml, '<g:price>')).toBe(1);
    expect(countOccurrences(xml, '</g:price>')).toBe(1);

    /* The nested children of both disabled groups never appear. */
    for (const fieldName of DISABLED_BLOCK_TWO_NESTED_FIELDS) {
      if (fieldName === 'g:price') {
        continue;
      }
      expect(xml).not.toMatch(fieldNamePattern(`<${fieldName}`));
    }

    /* The disabled names were not converted into markup comments either. */
    expect(xml).not.toContain('<!--');
  });

  it('[NET-NEW] keeps the live interleaving order: brand, then item group, then shipping weight', async () => {
    const scenario = createScenario({ brand: 'present', brandName: 'Nike' });

    const xml = await scenario.render();

    /* `:L32`, `:L39`, `:L58` — the order the disabled blocks sit between. */
    const brandAt = xml.indexOf('<g:brand>');
    const itemGroupAt = xml.indexOf('<g:item_group_id>');
    const shippingWeightAt = xml.indexOf('<g:shipping_weight>');
    expect(brandAt).toBeGreaterThan(-1);
    expect(brandAt).toBeLessThan(itemGroupAt);
    expect(itemGroupAt).toBeLessThan(shippingWeightAt);
  });
});

describe('NET-NEW ProductFeedBuilder — disabled fields, in the builder source text', () => {
  it('[NET-NEW] partitions the builder source into comment and code spans that reconstruct it exactly', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));

    /*
     * A self-check on the walk itself. Without it, a silent bug in the comment/code partition would make
     * both source-level censuses below assert nothing at all while still reporting green.
     */
    const ordered = [...source.commentSpans, ...source.codeSpans].sort((a, b) => a.start - b.start);
    let rebuilt = '';
    for (const span of ordered) {
      expect(span.start).toBe(rebuilt.length);
      rebuilt += source.text.slice(span.start, span.end);
    }
    expect(rebuilt).toBe(source.text);
    expect(source.commentSpans.length).toBeGreaterThan(0);
    expect(source.codeSpans.length).toBeGreaterThan(0);
  });

  it('[NET-NEW] keeps every disabled field name in comments and out of executable text', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));
    const commentText = spanText(source, source.commentSpans);
    const codeText = spanText(source, source.codeSpans);

    /*
     * The names are retained because they document the intended future surface and deleting them would
     * lose information. Retained means retained AS COMMENTS: present in the comment text, absent from the
     * executable text, so no disabled field can be emitted by accident.
     */
    for (const fieldName of [
      ...ALL_DISABLED_TOP_LEVEL_FIELDS,
      ...DISABLED_BLOCK_TWO_NESTED_FIELDS,
    ]) {
      expect(commentText).toMatch(fieldNamePattern(fieldName));
      if (fieldName === 'g:price') {
        /* Live at `:L27`, so it legitimately appears in code as well; the runtime count pins it. */
        continue;
      }
      expect(codeText).not.toMatch(fieldNamePattern(fieldName));
    }
  });

  it('[NET-NEW] preserves three separate disabled blocks interleaved with the live item group and shipping weight code', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));

    const itemGroupCodeAt = soleCodeOffsetOf(source, '<g:item_group_id>');
    const shippingWeightCodeAt = soleCodeOffsetOf(source, '<g:shipping_weight>');

    const blockOne = soleCommentSpanContaining(source, DISABLED_BLOCK_ONE_FIELDS);
    const blockTwo = soleCommentSpanContaining(source, [
      ...DISABLED_BLOCK_TWO_FIELDS,
      ...DISABLED_BLOCK_TWO_NESTED_FIELDS,
    ]);
    const blockThree = soleCommentSpanContaining(source, DISABLED_BLOCK_THREE_FIELDS);

    /* BLOCK 1's four names sit together, before the live item-group serialization. */
    expect(blockOne.end).toBeLessThan(itemGroupCodeAt);
    /* BLOCK 2 sits after the item-group code and before the shipping-weight code. */
    expect(blockTwo.start).toBeGreaterThan(itemGroupCodeAt);
    expect(blockTwo.end).toBeLessThan(shippingWeightCodeAt);
    /* BLOCK 3 sits after the shipping-weight code. */
    expect(blockThree.start).toBeGreaterThan(shippingWeightCodeAt);

    /*
     * THREE blocks, not one. Flattening every disabled name into a single comment would still satisfy
     * "the names are retained" while destroying the record of WHERE each group sat relative to the live
     * fields — which is the only reason the legacy interleaving is recoverable at all.
     */
    const starts = [blockOne.start, blockTwo.start, blockThree.start];
    expect(new Set(starts).size).toBe(3);
    expect(starts).toStrictEqual([...starts].sort((left, right) => left - right));
  });
});

/* =====================================================================================================
 * §8 — The asymmetric escaping map.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — asymmetric htmlEditFormat escaping', () => {
  it('[NET-NEW] escapes exactly six dynamic fields and leaves the URL, money and weight fields raw', async () => {
    const rawImagePath = '/product/default/a&b<c.jpg';
    const rawAdditionalImagePath = '/product/default/d&e<f.jpg';
    const scenario = createScenario({
      skuCode: ESCAPE_SENTINEL,
      calculatedTitle: ESCAPE_SENTINEL,
      productDescription: ESCAPE_SENTINEL,
      productTypeName: ESCAPE_SENTINEL,
      brandName: ESCAPE_SENTINEL,
      productCode: ESCAPE_SENTINEL,
      urlTitle: ESCAPE_SENTINEL,
      imagePathsByImageFile: { [SKU_IMAGE_FILE]: rawImagePath },
      settings: [
        { settingName: 'skuShippingWeight', value: '1&2' },
        { settingName: 'skuShippingWeightUnitCode', value: '<lb>' },
      ],
    });

    const xml = await scenario.render({
      productImages: [{ imagePath: rawAdditionalImagePath }],
    });

    /*
     * THE ESCAPING ASYMMETRY — a judgment call, and the one most likely to be "cleaned up" by mistake.
     *
     * `integrationServices/google/views/feed/product.cfm` wraps SIX dynamic values in `htmlEditFormat`
     * and leaves SEVEN untouched, and it does so field by field rather than by category:
     *   ESCAPED  — `g:id` (`:L17`), item `title` (`:L18`), the selected `description` (`:L19`),
     *              `g:product_type` (`:L21`), `g:brand` (`:L32`), `g:item_group_id` (`:L39`)
     *   RAW      — item `link` (`:L22`), `g:image_link` (`:L23`), every `g:additional_image_link`
     *              (`:L24`), `g:price` (`:L27`), `g:sale_price` (`:L29`),
     *              `g:sale_price_effective_date` (`:L30`), `g:shipping_weight` (`:L58`)
     * The fixed `g:google_product_category`, `g:condition` and `g:availability` values bypass the helper
     * because they are literals with nothing to escape.
     *
     * A uniform "escape everything" implementation would corrupt every URL in the feed; a uniform "escape
     * nothing" implementation would emit unescaped product text. Either one is a silent behaviour change,
     * so the asymmetry is pinned field by field.
     *
     * `htmlEditFormat` processes `&` FIRST and then `<`, `>` and the double quote, and it leaves the
     * APOSTROPHE alone — hence `A&B<C>D"E'F` becoming `A&amp;B&lt;C&gt;D&quot;E'F` with its single quote
     * intact rather than turned into `&#39;`.
     */
    expect(xml).toContain(itemField(`<g:id>${ESCAPED_SENTINEL}</g:id>`));
    expect(xml).toContain(itemField(`<title>${ESCAPED_SENTINEL}</title>`));
    expect(xml).toContain(itemField(`<description>${ESCAPED_SENTINEL}</description>`));
    expect(xml).toContain(itemField(`<g:product_type>${ESCAPED_SENTINEL}</g:product_type>`));
    expect(xml).toContain(itemField(`<g:brand>${ESCAPED_SENTINEL}</g:brand>`));
    expect(xml).toContain(itemField(`<g:item_group_id>${ESCAPED_SENTINEL}</g:item_group_id>`));
    /* Six escaped fields, six occurrences: nothing else in the document was escaped. */
    expect(countOccurrences(xml, ESCAPED_SENTINEL)).toBe(6);

    /* And the raw side, byte for byte. */
    expect(xml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${ESCAPE_SENTINEL}/</link>`,
      ),
    );
    expect(xml).toContain(
      itemField(`<g:image_link>${ABSOLUTE_URL_PREFIX}${rawImagePath}</g:image_link>`),
    );
    expect(xml).toContain(
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${rawAdditionalImagePath}</g:additional_image_link>`,
      ),
    );
    expect(xml).toContain(itemField('<g:shipping_weight>1&2 <lb></g:shipping_weight>'));
    /* The one raw sentinel is the link's; the image and weight values carry their own raw characters. */
    expect(countOccurrences(xml, ESCAPE_SENTINEL)).toBe(1);
    expect(xml).not.toContain('a&amp;b&lt;c.jpg');
    expect(xml).not.toContain('d&amp;e&lt;f.jpg');
  });

  it('[NET-NEW] escapes the product type description when the fallback branch supplies it', async () => {
    /*
     * The description site is escaped on BOTH of its branches, not only the product one: `:L19` wraps the
     * product-type fallback in `htmlEditFormat` as well. Branch A's escaping is asserted in the case above
     * and in §2; this pins branch B independently so a port cannot escape one branch and forget the other.
     */
    const scenario = createScenario({
      productDescription: '',
      productTypeDescription: ESCAPE_SENTINEL,
    });

    const xml = await scenario.render();

    expect(xml).toContain(itemField(`<description>${ESCAPED_SENTINEL}</description>`));
    expect(countOccurrences(xml, ESCAPED_SENTINEL)).toBe(1);
  });

  it('[NET-NEW] calls the builder escape helper at exactly six sites, matching the raw and escaped fields', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));
    const codeText = spanText(source, source.codeSpans);

    /*
     * WHY A SOURCE-LEVEL CENSUS IS REQUIRED HERE.
     *
     * Three of the seven raw fields — `g:price`, `g:sale_price` and `g:sale_price_effective_date` — are
     * typed as monetary decimals and a `Date`. There is no way to push `&` or `<` through them without a
     * cast, and this suite adds no cast, so their raw-ness cannot be demonstrated by a sentinel. Their
     * exact raw output is asserted in §4 and §5; the claim that the escape helper is never applied to them
     * is carried HERE, by counting the helper's call sites in the builder's executable text.
     *
     * The helper's name is DISCOVERED from the source rather than assumed, so renaming it does not
     * silently reduce this case to a tautology.
     */
    const declaration = /function\s+(escape[A-Za-z0-9_]*)\s*\(/.exec(codeText);
    expect(declaration).not.toBeNull();
    const helperName = declaration === null ? '' : (declaration[1] ?? '');
    expect(helperName.length).toBeGreaterThan(0);

    /* Every occurrence in executable text, less the declaration itself, is a call site. */
    const occurrences = codeOffsetsOf(source, `${helperName}(`).length;
    expect(occurrences - 1).toBe(6);

    /*
     * And those six calls sit at exactly the six escaped fields. `title` and `description` each show ONE
     * escaped site and ONE raw site, because the channel-level pair at `:L13` and `:L15` is fixed text and
     * is never escaped while the item-level pair at `:L18` and `:L19` always is. `link` shows two raw
     * sites for the same channel/item reason.
     */
    const expectedCensus: readonly {
      readonly openTag: string;
      readonly closeTag: string;
      readonly escaped: number;
      readonly raw: number;
    }[] = [
      { openTag: '<g:id>', closeTag: '</g:id>', escaped: 1, raw: 0 },
      { openTag: '<title>', closeTag: '</title>', escaped: 1, raw: 1 },
      { openTag: '<description>', closeTag: '</description>', escaped: 1, raw: 1 },
      { openTag: '<g:product_type>', closeTag: '</g:product_type>', escaped: 1, raw: 0 },
      { openTag: '<g:brand>', closeTag: '</g:brand>', escaped: 1, raw: 0 },
      { openTag: '<g:item_group_id>', closeTag: '</g:item_group_id>', escaped: 1, raw: 0 },
      { openTag: '<link>', closeTag: '</link>', escaped: 0, raw: 2 },
      { openTag: '<g:image_link>', closeTag: '</g:image_link>', escaped: 0, raw: 1 },
      {
        openTag: '<g:additional_image_link>',
        closeTag: '</g:additional_image_link>',
        escaped: 0,
        raw: 1,
      },
      { openTag: '<g:price>', closeTag: '</g:price>', escaped: 0, raw: 1 },
      { openTag: '<g:sale_price>', closeTag: '</g:sale_price>', escaped: 0, raw: 1 },
      {
        openTag: '<g:sale_price_effective_date>',
        closeTag: '</g:sale_price_effective_date>',
        escaped: 0,
        raw: 1,
      },
      { openTag: '<g:shipping_weight>', closeTag: '</g:shipping_weight>', escaped: 0, raw: 1 },
    ];

    let escapedSites = 0;
    for (const entry of expectedCensus) {
      const observed = escapeCensus(source, entry.openTag, entry.closeTag, helperName);
      expect(observed).toStrictEqual({ escaped: entry.escaped, raw: entry.raw });
      escapedSites += observed.escaped;
    }
    /* The six field-level escaped sites account for every one of the six calls counted above. */
    expect(escapedSites).toBe(6);
  });
});

/* =====================================================================================================
 * §9 — The guards on the builder's own public render surface.
 *
 * These are part of `build()`'s declared contract, not of any collaborator's, so they belong here. Two of
 * them carry legacy-parity judgments that the field assertions above would otherwise leave invisible: the
 * legacy view dereferenced the product and product-type associations WITHOUT a guard while guarding the
 * brand association, and an unrepresentable character is refused rather than silently stripped.
 *
 * Only the fact of the rejection and its `Error` nature are asserted. The message text belongs to
 * `src/errors/**`, which this file neither imports nor couples to, so pinning the wording here would
 * couple a serializer test to a sibling module's copy.
 * ================================================================================================== */

/** Await a render that must reject, and hand back the reason as an `Error`. */
async function captureRejection(work: Promise<string>): Promise<Error> {
  try {
    await work;
  } catch (reason) {
    if (reason instanceof Error) {
      return reason;
    }
    throw new Error(
      'The builder rejected with a reason that is not an Error, which cannot be asserted against.',
    );
  }
  throw new Error('The builder resolved a document where a rejection was required.');
}

describe('NET-NEW ProductFeedBuilder — render guards', () => {
  it('[NET-NEW] rejects a selected SKU that carries no product', async () => {
    const scenario = createScenario();
    const orphanSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'ORPHAN-1',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
    });

    const error = await captureRejection(scenario.render({ skus: [orphanSku] }));

    /*
     * `integrationServices/google/views/feed/product.cfm:L18` reaches straight through
     * `sku.getProduct().getCalculatedTitle()` with no guard, and `:L22`, `:L27`, `:L32` and `:L39` do the
     * same. A product-less SKU therefore failed the legacy render too; refusing here preserves that rather
     * than inventing a skip that would silently shrink the feed.
     */
    expect(error).toBeInstanceOf(Error);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('[NET-NEW] rejects a product that carries no product type, unlike an absent brand', async () => {
    const scenario = createScenario();
    const typelessProduct = buildProduct({
      productID: PRODUCT_ID,
      productCode: 'TESTPRODUCTXXX',
      urlTitle: 'nike-air',
      calculatedTitle: 'PERSISTED-CALCULATED-TITLE',
    });
    const sku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'TESTPRODUCTXXX-2',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: typelessProduct,
    });

    const error = await captureRejection(scenario.render({ skus: [sku] }));

    /*
     * THE OTHER FACE OF THE `isNull` / `len` INCONSISTENCY. `:L21` dereferences
     * `product.getProductType().getSimpleRepresentation()` with NO guard, while `:L32` guards the brand
     * association with `isNull`. Two associations one line apart, one guarded and one not: an absent brand
     * quietly drops an element, an absent product type fails the render outright. Both outcomes are
     * preserved, and neither is harmonised into the other.
     */
    expect(error).toBeInstanceOf(Error);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('[NET-NEW] rejects a non-numeric UTC hour offset only once a sale actually renders', async () => {
    const harmless = createScenario({ utcHourOffset: 'not-an-offset' });

    /*
     * With no sale, the offset is never read, so the render succeeds — the legacy template only
     * interpolated `getTimeZoneInfo().utcHourOffset` inside the conditional block at `:L28-L31`.
     */
    const xml = await harmless.render();
    expect(xml).not.toContain('<g:sale_price_effective_date>');
    expect(xml).not.toContain('not-an-offset');

    const onSale = createScenario({
      productPrice: 100,
      skuPrice: 90,
      utcHourOffset: 'not-an-offset',
    });
    onSale.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: onSale.saleExpiration,
      }),
    });

    const error = await captureRejection(onSale.render());

    /*
     * Once the pair must render, the offset determines BOTH the emitted wall-clock components and the
     * offset label, so a value that cannot be interpreted as hours would produce a timestamp whose
     * components and label disagree. It is refused rather than defaulted to zero — defaulting would invent
     * a timezone the source never stated.
     */
    expect(error).toBeInstanceOf(Error);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('[NET-NEW] rejects each value XML 1.0 forbids rather than stripping or substituting it', async () => {
    /*
     * PRESERVE, DO NOT REPAIR — applied to data rather than to code. Stripping an offending unit or
     * substituting a replacement character would emit a document that differs from the stored value, and
     * altering stored catalog data is not a serializer's decision to make.
     *
     * A lone high surrogate and a lone low surrogate each encode no character at all, and a C0 control
     * other than tab, line feed or carriage return is outside XML 1.0's `Char` production, so no escaping
     * can make any of the three serialisable.
     */
    const forbiddenTitles = ['Nike \ud800 Air', 'Nike \udc00 Air', 'Nike \u0001 Air'];

    for (const calculatedTitle of forbiddenTitles) {
      const scenario = createScenario({ calculatedTitle });

      const error = await captureRejection(scenario.render());

      expect(error).toBeInstanceOf(Error);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('[NET-NEW] emits a legal supplementary character unchanged instead of refusing it', async () => {
    /*
     * The representability check must admit everything XML 1.0's `Char` production admits, which includes
     * supplementary characters encoded as a surrogate PAIR. A check that walked code units without pairing
     * them would reject this title, so the passing case is asserted alongside the refusals above rather
     * than left implied. The character needs no escaping, so it survives byte for byte.
     */
    const scenario = createScenario({ calculatedTitle: 'Nike \u{1F600} Air' });

    const xml = await scenario.render();

    expect(xml).toContain(itemField('<title>Nike \u{1F600} Air</title>'));
  });

  it('[NET-NEW] emits the three control characters XML 1.0 permits without escaping or stripping them', async () => {
    /*
     * Tab, line feed and carriage return are the only C0 controls inside XML 1.0's `Char` production, and
     * `htmlEditFormat` never touched them, so a stored value carrying them reaches the document verbatim.
     * The legacy view itself relied on that: `integrationServices/google/views/feed/product.cfm:L30` ends
     * with a literal tab that is emitted rather than swallowed. A representability check that rejected
     * these three, or an escaper that turned them into character references, would change stored product
     * copy on its way out.
     */
    const scenario = createScenario({ productDescription: 'first\tsecond\r\nthird' });

    const xml = await scenario.render();

    expect(xml).toContain('<description>first\tsecond\r\nthird</description>');
    expect(xml).not.toContain('&#9;');
    expect(xml).not.toContain('&#10;');
    expect(xml).not.toContain('&#13;');
  });

  it('[NET-NEW] rejects a render whose abort signal is already aborted', async () => {
    const scenario = createScenario();
    const controller = new AbortController();
    controller.abort();

    const error = await captureRejection(scenario.render({ signal: controller.signal }));

    /*
     * `ProductFeedRenderOptions.signal` is part of the builder's declared public surface, so the
     * cancellation path is asserted here. It carries no legacy counterpart — the legacy view had a
     * 360-second request budget (`:L9`, M2) and no cancellation concept at all — and this case invents no
     * timeout, no budget and no delivery policy on the back of it.
     */
    expect(error).toBeInstanceOf(Error);
    expect(error.message.length).toBeGreaterThan(0);
  });
});
