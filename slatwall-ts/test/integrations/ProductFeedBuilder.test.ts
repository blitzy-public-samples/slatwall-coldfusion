/*
 * NET-NEW — `src/integrations/google/ProductFeedBuilder.ts`
 *
 * Provenance, stated plainly and without softening.
 *
 * This suite is NET-NEW in its entirety. There is no legacy Google feed test of any kind: the legacy
 * suite under `meta/tests/` contains no feed test, no `integrationServices` test, and no serializer
 * test, so there is nothing here to replicate and nothing to claim parity with. Every case title
 * therefore carries a visible `[NET-NEW]` prefix rather than relying on a suite-level label.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Neither `feed_rendering` nor `FeedRendering` is imported, and both used to be. The serializer
 * declares no rendering discriminant: a caller cannot ask for byte-parity output instead of escaped
 * output, because the byte-parity half is an injection path. There is one rendering, nothing to
 * select, and no constant or union to name.
 */
import {
  ProductFeedBuilder,
  createProductFeedRenderBudget,
  type ProductFeedImage,
  type ProductFeedRecord,
  type ProductFeedRenderBudget,
  type ProductFeedRenderContext,
} from '../../src/integrations/google/ProductFeedBuilder';
import { DataIntegrityError, DomainError, NotImplementedError } from '../../src/errors/DomainError';
/*
 * The composition root and the feed's entry point are named for the wiring cases at the foot of this
 * file, which cross the shipped wiring rather than hand-building records. Both are type-only here: the
 * modules themselves are reached with `require` after `process.env` is set, for the module-load reason
 * that section's header records.
 */
import type { CatalogContainer, CatalogContainerOverrides } from '../../src/config/container';
import type { GoogleFeedHandler } from '../../src/handlers/googleFeedHandler';
import type { SettingResolutionContext } from '../../src/ports/SettingResolverPort';
/*
 * The three additional image-port types and the pricing port itself are named by §1.5's gating wrappers,
 * which stand in front of the shared doubles to observe the render's execution order.
 */
import type {
  ImagePathPort,
  ImageWebPath,
  ResizedImagePathRequest,
  SaveImageFileRequest,
} from '../../src/ports/ImagePathPort';
import type { PricingPort, SalePriceDetailsBySkuId } from '../../src/ports/PricingPort';
/*
 * A value import, not a type-only one: the folded `ProductFeedQuery` cases assert `toBeInstanceOf(Sku)`
 * on the hydrated records, which needs the constructor at run time.
 */
import { Sku } from '../../src/domain/sku/Sku';
import type { Product, ProductOwnedAssociation } from '../../src/domain/product/Product';
import type { ProductType } from '../../src/domain/product/ProductType';
import type { Brand } from '../../src/domain/product/Brand';
import {
  EXACT_DECIMAL_NOT_NUMERIC,
  exactDecimalToNumber,
  formatDate,
  toExactDecimal,
} from '../../src/util/formatting';
import type { ExactDecimal } from '../../src/util/formatting';
import { MERCHANDISE_PRODUCT_TYPE, MERCHANDISE_PRODUCT_TYPE_ID } from '../fixtures/productTypes';
import { createTestMerchandiseProductData } from '../fixtures/testProduct';
import {
  GENEROUS_SMART_LIST_BUDGET,
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
  GENEROUS_FEED_RENDER_BUDGET,
  UNSTATED_FEED_RENDER_BUDGET,
} from '../support/inMemoryRepositories';
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/QueryRunner';
import {
  PRODUCT_FEED_JOINS,
  ProductFeedQuery,
} from '../../src/integrations/google/ProductFeedQuery';
import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type {
  SmartListQuery,
  SmartListQueryPort,
  SmartListRecord,
  SmartListResult,
  SmartListRootEntityName,
} from '../../src/ports/SmartListQueryPort';
import { BaseIntegration } from '../../src/integrations/google/BaseIntegration';
import { GoogleIntegration } from '../../src/integrations/google/GoogleIntegration';
import type { IntegrationContract } from '../../src/integrations/google/IntegrationContract';
import type { IntegrationSettingDescriptor } from '../../src/integrations/google/IntegrationContract';
import { createGoogleFeedHandler } from '../../src/handlers/googleFeedHandler';
import {
  HTTP_STATUS,
  XML_CONTENT_TYPE,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../../src/handlers/httpResponse';
import {
  ConfigurationError,
  LegacyParityError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
} from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import type {
  GoogleFeedHandlerCollaborators,
  ProductFeedSerializer,
} from '../../src/handlers/googleFeedHandler';
import type { ProductFeedSkuSource } from '../../src/integrations/google/ProductFeedQuery';
import type {
  GoogleFeedContainerSlice,
  ProductFeedRecordSource,
} from '../../src/handlers/googleFeedHandler';
import { createGoogleFeedHandlerFromContainer } from '../../src/handlers/googleFeedHandler';

/*
 * Documentary findings — recorded here with locators, deliberately not turned into extra test scope.
 */

/*
 * The Google Merchant specification URL carried in the legacy view's own CFML comment header at
 * `integrationServices/google/views/feed/product.cfm:L4-L5`, preserved verbatim because deleting it
 * would lose the only pointer the legacy author left to the field specification:
 *
 * http://support.google.com/merchants/bin/answer.py?hl=en&answer=188494&topic=2473824&ctx=topic#us.
 */
const LEGACY_SPECIFICATION_URL =
  'http://support.google.com/merchants/bin/answer.py?hl=en&answer=188494&topic=2473824&ctx=topic#US';

/* Byte-exact envelope literals read from the legacy view. */
const EXPECTED_XML_DECLARATION = '<?xml version="1.0"?>';
/**
 * The `g:` namespace URI, byte-exact from `integrationServices/google/views/feed/product.cfm:L11`.
 */
const GOOGLE_FEED_NAMESPACE_URI = 'http://base.google.com/ns/1.0';
const EXPECTED_RSS_OPEN_TAG = `<rss version="2.0" xmlns:g="${GOOGLE_FEED_NAMESPACE_URI}">`;
const EXPECTED_CHANNEL_TITLE_ELEMENT = '<title>Slatwall Product Feed</title>';

/* Deterministic render inputs. */
const RENDER_INSTANT_EPOCH_MS = new Date(2024, 0, 1, 9, 5, 7).getTime();
const SALE_EXPIRATION_EPOCH_MS = new Date(2024, 1, 9, 14, 15, 0).getTime();
const RAW_UTC_HOUR_OFFSET = '5';
const RENDER_HOST = 'catalog.example.test';
const ABSOLUTE_URL_PREFIX = `http://${RENDER_HOST}`;

/*
 * The two endpoint timestamps, without the offset label — the components of the two instants above,
 * written out rather than derived, so a reader can diff them against the constructor arguments.
 */
const EXPECTED_LOCAL_TIMESTAMP_START = '2024-01-01T09:05:07';
const EXPECTED_LOCAL_TIMESTAMP_END = '2024-02-09T14:15:00';

/*
 * The two effective-date endpoints those instants produce. Each carries its own UNMOVED local date and
 * time followed by the literal hyphen and the raw bare-number offset the legacy template interpolated.
 */
const EXPECTED_EFFECTIVE_DATE_START = `${EXPECTED_LOCAL_TIMESTAMP_START}-${RAW_UTC_HOUR_OFFSET}`;
const EXPECTED_EFFECTIVE_DATE_END = `${EXPECTED_LOCAL_TIMESTAMP_END}-${RAW_UTC_HOUR_OFFSET}`;

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
 * Setting values. These are fixture values chosen so each one is observable in the output; none is a
 * claim about a production default. `config/dbdata/SlatwallSetting.xml.cfm` seeds neither shipping key,
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
 * Image fixtures. The image port double echoes by default rather than composing a directory layout, so
 * the composed value is seeded explicitly. The shape of the seeded value follows the hard-coded
 * `/product/default/` segment the legacy entity used at `model/entity/Sku.cfc:L145-L147`; the real
 * composition is the adapter's responsibility and is not asserted here.
 */
const SKU_IMAGE_FILE = 'nike-air.jpg';
const SKU_COMPOSED_IMAGE_PATH = '/product/default/nike-air.jpg';
const FIRST_ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-side.jpg';
const SECOND_ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-sole.jpg';
const THIRD_ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-top.jpg';

/* The escaping sentinel and its legacy-compatible result. */
const ESCAPE_SENTINEL = 'A&B<C>D"E\'F';
const ESCAPED_SENTINEL = "A&amp;B&lt;C&gt;D&quot;E'F";

/* The raw-sink sentinels, and why two are needed rather than one. */
const RAW_SAFE_SENTINEL = 'A>B"C\'D';
const RAW_SAFE_SENTINEL_ESCAPED = "A&gt;B&quot;C'D";
const RAW_REFUSED_SENTINEL = 'A&B';

/*
 * A host that CONFORMS to RFC 3986 §3.2.2 and still carries characters an XML author would look at twice.
 * `reg-name` admits the sub-delimiters, so `'`, `!` and `$` are all legal in a registered name and
 * `src/config/env.ts`'s host rule accepts them by design — which is exactly why the serializer, not the
 * config layer, has to own the treatment. This value is not a hypothetical: it passes the module-load
 * rule and reaches the builder.
 */
const CONFORMING_HOSTILE_HOST = "a'b!c$d.example";

/*
 * The builder indents channel children with two tabs and item children with three. That difference is
 * the only thing separating the channel-level `<title>`/`<description>` pair from the item-level pair,
 * and the channel pair is not escaped while the item pair is — so every assertion that could be
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

/**
 * Count non-overlapping occurrences of `needle`. used where "exactly one element" is the assertion.
 */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/*
 * A strict XML reader, written here on purpose. Assertions in this suite are parser-based rather
 * than substring-based, because a suite that expressly requires malformed XML and avoids a parser
 * proves nothing about well-formedness. Substring assertions can
 * only ever say "these bytes appear somewhere"; they cannot say "the document has one channel link whose
 * value is exactly this", which is the only assertion that distinguishes an escaped host from a host
 * that closed the element and opened three of its own. Every escaping case below therefore parses.
 */

interface ParsedElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly ParsedElement[];
  /**
   * The decoded character data directly inside this element, excluding any child element's text.
   */
  readonly text: string;
}

/**
 * The five entity references XML predefines. Anything else is refused rather than passed through.
 */
const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
});

/** Resolve one reference name — `amp`, `#10`, `#x1F600` — or throw. */
function resolveEntityReference(reference: string): string {
  const predefined = PREDEFINED_ENTITIES[reference];
  if (predefined !== undefined) {
    return predefined;
  }

  const decimal = /^#(\d+)$/.exec(reference);
  if (decimal !== null) {
    return String.fromCodePoint(Number(decimal[1]));
  }

  const hexadecimal = /^#x([0-9A-Fa-f]+)$/.exec(reference);
  if (hexadecimal !== null) {
    return String.fromCodePoint(Number.parseInt(hexadecimal[1] ?? '', 16));
  }

  throw new Error(`Feed document carries an unknown entity reference "&${reference};".`);
}

/** Decode one run of character data, refusing anything XML forbids there. */
function decodeCharacterData(raw: string): string {
  let decoded = '';
  let index = 0;

  while (index < raw.length) {
    const character = raw.charAt(index);

    if (character === '<') {
      throw new Error('Feed document carries a raw "<" in character data.');
    }

    if (character !== '&') {
      decoded += character;
      index += 1;
      continue;
    }

    const semicolon = raw.indexOf(';', index);
    if (semicolon === -1) {
      throw new Error('Feed document carries a bare "&" in character data.');
    }

    decoded += resolveEntityReference(raw.slice(index + 1, semicolon));
    index = semicolon + 1;
  }

  return decoded;
}

/**
 * Parse the rendered feed into an element tree, or throw.
 *
 * @param xml the complete document as the builder returned it
 * @returns the root element, with every text Node already decoded.
 */
function parseFeedDocument(xml: string): ParsedElement {
  let index = 0;

  const fail = (message: string): never => {
    throw new Error(`Feed document is not well-formed at offset ${String(index)}: ${message}`);
  };

  const skipWhitespace = (): void => {
    while (index < xml.length && /\s/.test(xml.charAt(index))) {
      index += 1;
    }
  };

  const consume = (literal: string): void => {
    if (!xml.startsWith(literal, index)) {
      fail(`expected ${JSON.stringify(literal)}`);
    }
    index += literal.length;
  };

  const readName = (): string => {
    const start = index;
    while (index < xml.length && /[A-Za-z0-9_:.\-]/.test(xml.charAt(index))) {
      index += 1;
    }
    if (index === start) {
      fail('expected an element or attribute name');
    }
    return xml.slice(start, index);
  };

  const readAttributes = (): Record<string, string> => {
    const attributes: Record<string, string> = {};

    for (;;) {
      skipWhitespace();
      if (index >= xml.length) {
        fail('unterminated start tag');
      }
      const character = xml.charAt(index);
      if (character === '>') {
        return attributes;
      }
      if (character === '/') {
        fail('self-closing elements are not part of this document');
      }

      const name = readName();
      consume('=');
      const quote = xml.charAt(index);
      if (quote !== '"' && quote !== "'") {
        fail('attribute values must be quoted');
      }
      index += 1;
      const valueStart = index;
      while (index < xml.length && xml.charAt(index) !== quote) {
        index += 1;
      }
      if (index >= xml.length) {
        fail('unterminated attribute value');
      }
      const rawValue = xml.slice(valueStart, index);
      index += 1;

      if (Object.prototype.hasOwnProperty.call(attributes, name)) {
        fail(`duplicate attribute "${name}"`);
      }
      attributes[name] = decodeCharacterData(rawValue);
    }
  };

  const readElement = (): ParsedElement => {
    consume('<');
    if (xml.startsWith('/', index)) {
      fail('unexpected end tag');
    }
    const name = readName();
    const attributes = readAttributes();
    consume('>');

    const children: ParsedElement[] = [];
    let rawText = '';

    for (;;) {
      const nextTag = xml.indexOf('<', index);
      if (nextTag === -1) {
        fail(`element <${name}> is never closed`);
      }
      rawText += xml.slice(index, nextTag);
      index = nextTag;

      if (xml.startsWith('</', index)) {
        index += 2;
        const closing = readName();
        if (closing !== name) {
          fail(`end tag </${closing}> does not match <${name}>`);
        }
        skipWhitespace();
        consume('>');
        break;
      }

      if (xml.startsWith('<?', index) || xml.startsWith('<!', index)) {
        fail('comments, processing instructions and CDATA sections are not part of this document');
      }

      children.push(readElement());
    }

    return {
      name,
      attributes: Object.freeze(attributes),
      children: Object.freeze(children),
      text: decodeCharacterData(rawText),
    };
  };

  skipWhitespace();
  if (xml.startsWith('<?xml', index)) {
    const declarationEnd = xml.indexOf('?>', index);
    if (declarationEnd === -1) {
      fail('unterminated XML declaration');
    }
    index = declarationEnd + '?>'.length;
  }
  skipWhitespace();

  const root = readElement();
  skipWhitespace();
  if (index !== xml.length) {
    fail('trailing content after the root element');
  }

  return root;
}

/** Every direct child of `element` named `name`, in document order. */
function childrenNamed(element: ParsedElement, name: string): readonly ParsedElement[] {
  return element.children.filter((child) => child.name === name);
}

/** The one direct child named `name`; fails loudly when there is not exactly one. */
function soleChildNamed(element: ParsedElement, name: string): ParsedElement {
  const matches = childrenNamed(element, name);
  expect(matches).toHaveLength(1);
  const [only] = matches;
  if (only === undefined) {
    throw new Error(`<${element.name}> does not carry exactly one <${name}> child.`);
  }
  return only;
}

/** The decoded text of the one direct child named `name`. */
function soleChildText(element: ParsedElement, name: string): string {
  return soleChildNamed(element, name).text;
}

/** Parse the document and return its `channel` element, checking the root as it goes. */
function parseFeedChannel(xml: string): ParsedElement {
  const root = parseFeedDocument(xml);
  expect(root.name).toBe('rss');
  expect(root.attributes).toStrictEqual({
    version: '2.0',
    'xmlns:g': 'http://base.google.com/ns/1.0',
  });
  return soleChildNamed(root, 'channel');
}

/** Parse the document and return its `item` elements, in document order. */
function parseFeedItems(xml: string): readonly ParsedElement[] {
  return childrenNamed(parseFeedChannel(xml), 'item');
}

/** Parse the document and return its one `item` element. */
function parseSoleFeedItem(xml: string): ParsedElement {
  const items = parseFeedItems(xml);
  expect(items).toHaveLength(1);
  const [only] = items;
  if (only === undefined) {
    throw new Error('Feed document does not carry exactly one <item> element.');
  }
  return only;
}

/* The typed scenario factory. */

interface ScenarioSeed {
  readonly host?: string;
  readonly utcHourOffset?: string;
  /** Appended after the defaults, so a later seed for the same key wins. */
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
  /**
   * Park every pricing read until the case settles it, instead of answering on the next microtask.
   */
  readonly deferPricing?: boolean;
  /** The same, for the resized-image reads inside one record. Defaults off. */
  readonly deferImages?: boolean;
  readonly brand?: 'present' | 'absent';
  readonly brandName?: string;

  /**
   * The render budget this case states — the per-record image ceiling and the document byte
   * ceiling.
   */
  readonly renderBudget?: ProductFeedRenderBudget;
}

interface RenderRequest {
  /** Defaults to the scenario's single SKU. Supply several to observe returned record order. */
  readonly skus?: readonly Sku[];
  /** Applied to every record. Defaults to no additional images. */
  readonly productImages?: readonly ProductFeedImage[];
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
  /** Materialize records through the smartList port, then serialize them. */
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
     * `resizedImagePath` is deliberately left unseeded: the double then echoes each request's own
     * `imagePath`, which is the only configuration under which "each additional image used its own
     * resized path" is a falsifiable claim. A single global resize answer would collapse every image
     * onto one value and make the repeated-image assertions vacuous.
     */
    imagePathsByImageFile: seed.imagePathsByImageFile ?? {
      [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH,
    },
    /* Off unless the case asked, so the answers and the call log are byte-identical by default. */
    deferSettlement: seed.deferImages === true,
  });
  const pricing = createPricingDouble({ deferSettlement: seed.deferPricing === true });
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
     * A sentinel distinct from `calculatedTitle`. `Product.getTitle()` is the template-driven member
     * (`model/entity/Product.cfc:L540-L545`) that interpolates `productTitleString`; the feed reads the
     * persisted `calculatedTitle` instead (`integrationServices/google/views/feed/product.cfm:L18`).
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

  const builder = new ProductFeedBuilder(
    images.imagePaths,
    pricing.pricing,
    settings.resolver,
    seed.renderBudget ?? GENEROUS_FEED_RENDER_BUDGET,
  );

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
       * Two arguments, which is the whole declared surface. A third `ProductFeedRenderOptions`
       * parameter carrying an `AbortSignal` would be a behaviour addition with no legacy
       * counterpart, so there is no options bag to omit or supply and this helper has no branch.
       */
      return builder.build(records, context);
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

/* Source-text inspection for the two source-level censuses. */

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

/* Split the source into comment spans and code spans. */
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

/** Every offset at which `needle` occurs inside a code span, in source order. */
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

/** A field name matcher with an identifier boundary. */
function fieldNamePattern(fieldName: string): RegExp {
  return new RegExp(`${fieldName}(?![A-Za-z0-9_])`);
}

/**
 * The single comment span containing every one of `fieldNames`; fails loudly when there is not exactly one.
 */
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

/*
 * The eleven top-level field names the legacy author disabled, grouped exactly as the source groups them.
 */
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

/* §1 — The RSS envelope and the channel, byte for byte. */

describe('NET-NEW ProductFeedBuilder — RSS envelope and channel', () => {
  /* M2 — execution-model mismatch, flagged and left unresolved. */
  it('[NET-NEW] opens with the exact declaration, RSS tag and channel, and no encoding attribute', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L1` carries the declaration and the opening
     * `<cfsilent>` on the same physical line. `<cfsilent>` is a server-side tag that suppresses output
     * and is never emitted, so the emitted prefix is the declaration alone — and the declaration itself
     * carries no `encoding` attribute, which is preserved rather than "corrected" to UTF-8.
     */
    expect(xml.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);
    expect(xml).not.toContain('encoding=');
    /* `:L11` then `:L12`, in that order and nothing between them. */
    expect(
      xml.startsWith(`${EXPECTED_XML_DECLARATION}\n${EXPECTED_RSS_OPEN_TAG}\n\t<channel>\n`),
    ).toBe(true);
    expect(countOccurrences(xml, EXPECTED_RSS_OPEN_TAG)).toBe(1);
  });

  it('[NET-NEW] emits the exact channel title, the channel link and the channel description', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /* `:L13` — a fixed literal, not derived from any setting. */
    expect(xml).toContain(channelField(EXPECTED_CHANNEL_TITLE_ELEMENT));
    /* `:L14` — `http://#CGI.HTTP_HOST#`, byte for byte. */
    expect(xml).toContain(channelField(`<link>http://${RENDER_HOST}</link>`));
    /*
     * And no secure-scheme origin is invented anywhere in the document — the negative half of the same
     * parity claim, so an upgrade cannot be reintroduced without this case failing. The positive census
     * counts the `http://` occurrences: one per absolute URL the document publishes, plus the one in the
     * `xmlns:g` namespace uri, which is an identifier rather than a fetch target.
     */
    expect(xml).not.toContain('https://');
    expect(countOccurrences(xml, 'http://')).toBe(
      countOccurrences(xml, `http://${RENDER_HOST}`) +
        countOccurrences(xml, GOOGLE_FEED_NAMESPACE_URI),
    );
    /*
     * `:L15` — the channel description. It is required output even though a summary field list can omit
     * it, and it repeats the same prefix rather than reusing the link element.
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
     * Nothing about how the query was composed is asserted: joins, filters and the `'1^'` availability
     * range belong to `ProductFeedQuery`, which this file never imports.
     */
    expect(scenario.smartList.executions).toHaveLength(1);
    expect(scenario.smartList.executions[0]?.selection).toBe('recordsOnly');
    expect(scenario.smartList.lastQuery()?.entityName).toBe('SlatwallSku');

    /*
     * This case proves output order, not execution order, and the difference is load-bearing.
     * `Promise.all(records.map(buildItem))` resolves to an array in argument order regardless of which
     * item finished first, so it would satisfy every assertion above while rendering both records
     * concurrently. §1.5 below is where the sequencing itself is pinned, with ports that do not resolve
     * until released.
     */
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

/* §1.5 — sequential rendering: one record at a time, proved by ports that do not resolve. */

/** One operation the builder started and has not been allowed to finish. */
interface GatedOperation {
  readonly label: string;
  /** Let the underlying port answer. */
  release(): void;
}

/** Records every gated operation in start order and holds each one until released. */
interface OperationGate {
  /** Labels in the order the builder started them. */
  readonly started: readonly string[];
  /** Operations awaiting release, oldest first. */
  readonly pending: readonly GatedOperation[];
  /** Wrap one port call. */
  gate<T>(label: string, run: () => Promise<T>): Promise<T>;
  /** Release the oldest pending operation and let the render advance as far as it can. */
  releaseOldest(): Promise<void>;
  /** Release everything, repeatedly, until the render needs nothing further. */
  releaseAll(): Promise<void>;
}

/** Hand control back to the event loop so every microtask the release unblocked can run. */
async function settleStartedOperations(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function createOperationGate(): OperationGate {
  const started: string[] = [];
  const pending: GatedOperation[] = [];

  const gate = <T>(label: string, run: () => Promise<T>): Promise<T> => {
    started.push(label);
    return new Promise<T>((resolve, reject) => {
      pending.push({
        label,
        release: (): void => {
          run().then(resolve, reject);
        },
      });
    });
  };

  const releaseOldest = async (): Promise<void> => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error(
        'No gated operation is pending. The render either completed or never reached a port, so ' +
          'there is nothing to release — releasing blindly would make a sequencing assertion vacuous.',
      );
    }
    next.release();
    await settleStartedOperations();
  };

  return {
    started,
    pending,
    gate,
    releaseOldest,
    releaseAll: async (): Promise<void> => {
      while (pending.length > 0) {
        await releaseOldest();
      }
    },
  };
}

/** Wrap an image port so its resize member is gated; the other three members delegate untouched. */
function gateResizedImagePaths(
  imagePaths: ImagePathPort,
  operations: OperationGate,
): ImagePathPort {
  return {
    getImagePath: (imageFile: string): Promise<ImageWebPath> => imagePaths.getImagePath(imageFile),
    getResizedImagePath: (request: ResizedImagePathRequest): Promise<ImageWebPath> =>
      operations.gate(`resize:${String(request.imagePath)}`, () =>
        imagePaths.getResizedImagePath(request),
      ),
    getImageExistsFlag: (imagePath: ImageWebPath): Promise<boolean> =>
      imagePaths.getImageExistsFlag(imagePath),
    saveImageFile: (request: SaveImageFileRequest): Promise<boolean> =>
      imagePaths.saveImageFile(request),
  };
}

/** Wrap a pricing port so its single member is gated. */
function gateSalePriceReads(pricing: PricingPort, operations: OperationGate): PricingPort {
  return {
    getSalePriceDetailsForProductSkus: (productId: string): Promise<SalePriceDetailsBySkuId> =>
      operations.gate(`pricing:${productId}`, () =>
        pricing.getSalePriceDetailsForProductSkus(productId),
      ),
  };
}

/* Two records over two distinct products, each with one additional image. */
const SEQUENCING_SECOND_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb3';
const SEQUENCING_FIRST_IMAGE_FILE = 'first-primary.jpg';
const SEQUENCING_SECOND_IMAGE_FILE = 'second-primary.jpg';
/*
 * The primary paths are seeded rooted, and the seeding is not cosmetic. The image double answers
 * `getImagePath` with `imagePathsByImageFile[file] ?? file`, so leaving it unseeded made the port
 * echo a bare file name where the real adapter composes `<image folder>/product/default/<file>` —
 * an artefact of the double, not a value the port can produce. `assertSameOriginRelativePath`
 * guards all three URL sinks, and the bare name fails it correctly, so the
 * harness now seeds the composed form the same way the main scenario does at `imagePathsByImageFile`.
 */
const SEQUENCING_FIRST_COMPOSED_IMAGE_PATH = `/product/default/${SEQUENCING_FIRST_IMAGE_FILE}`;
const SEQUENCING_SECOND_COMPOSED_IMAGE_PATH = `/product/default/${SEQUENCING_SECOND_IMAGE_FILE}`;
const SEQUENCING_FIRST_ADDITIONAL_PATH = '/product/default/first-additional.jpg';
const SEQUENCING_SECOND_ADDITIONAL_PATH = '/product/default/second-additional.jpg';

const SEQUENCING_FIRST_RECORD_OPERATIONS: readonly string[] = Object.freeze([
  `resize:${SEQUENCING_FIRST_COMPOSED_IMAGE_PATH}`,
  `resize:${SEQUENCING_FIRST_ADDITIONAL_PATH}`,
  `pricing:${PRODUCT_ID}`,
]);
const SEQUENCING_SECOND_RECORD_OPERATIONS: readonly string[] = Object.freeze([
  `resize:${SEQUENCING_SECOND_COMPOSED_IMAGE_PATH}`,
  `resize:${SEQUENCING_SECOND_ADDITIONAL_PATH}`,
  `pricing:${SEQUENCING_SECOND_PRODUCT_ID}`,
]);

interface SequencingHarness {
  readonly operations: OperationGate;
  /** Start the render without awaiting it, so the gate can be inspected mid-flight. */
  start(): Promise<string>;
}

function createSequencingHarness(): SequencingHarness {
  const operations = createOperationGate();
  const settings = createSettingResolverDouble({ settings: [...DEFAULT_SETTING_SEEDS] });
  /*
   * Unseeded resize answers, so the double echoes each request's own path and every gated label is
   * distinct — a single global answer would make the two records' operations indistinguishable. The
   * per-file image paths are seeded, though, for the reason recorded at
   * {@link SEQUENCING_FIRST_COMPOSED_IMAGE_PATH}: an unseeded `getImagePath` echoes a bare file name, which
   * is not a same-origin relative path and which the real adapter never produces.
   */
  const images = createImagePathDouble({
    imagePathsByImageFile: {
      [SEQUENCING_FIRST_IMAGE_FILE]: SEQUENCING_FIRST_COMPOSED_IMAGE_PATH,
      [SEQUENCING_SECOND_IMAGE_FILE]: SEQUENCING_SECOND_COMPOSED_IMAGE_PATH,
    },
  });
  const pricing = createPricingDouble();

  const builder = new ProductFeedBuilder(
    gateResizedImagePaths(images.imagePaths, operations),
    gateSalePriceReads(pricing.pricing, operations),
    settings.resolver,
    GENEROUS_FEED_RENDER_BUDGET,
  );

  const buildRecord = (
    productID: string,
    imageFile: string,
    additionalImagePath: string,
    skuID: string,
  ): ProductFeedRecord => {
    const product = buildProduct({
      productID,
      productCode: `${productID}-CODE`,
      productName: 'SEQUENCING-PRODUCT',
      urlTitle: 'sequencing-product',
      calculatedTitle: 'SEQUENCING-TITLE',
      productType: buildProductType({
        productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
        productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
      }),
    });
    product.price = toExactDecimal(100);

    return {
      sku: buildSku({ skuID, skuCode: `${productID}-SKU`, price: 90, imageFile, product }),
      productImages: [{ imagePath: additionalImagePath }],
    };
  };

  const records: readonly ProductFeedRecord[] = [
    buildRecord(PRODUCT_ID, SEQUENCING_FIRST_IMAGE_FILE, SEQUENCING_FIRST_ADDITIONAL_PATH, SKU_ID),
    buildRecord(
      SEQUENCING_SECOND_PRODUCT_ID,
      SEQUENCING_SECOND_IMAGE_FILE,
      SEQUENCING_SECOND_ADDITIONAL_PATH,
      SECOND_SKU_ID,
    ),
  ];

  const context: ProductFeedRenderContext = {
    host: RENDER_HOST,
    renderTime: new Date(RENDER_INSTANT_EPOCH_MS),
    utcHourOffset: RAW_UTC_HOUR_OFFSET,
  };

  return {
    operations,
    start: (): Promise<string> => builder.build(records, context),
  };
}

describe('NET-NEW ProductFeedBuilder — sequential record rendering', () => {
  it('[NET-NEW] does not start record 2 while record 1 is held at its first awaited port call', async () => {
    const harness = createSequencingHarness();

    const rendering = harness.start();
    await settleStartedOperations();

    /*
     * The core anti-concurrency assertion. One operation has started: record 1's primary image resize,
     * `product.cfm:L23`. Under `Promise.all(records.map(buildItem))` record 2's primary resize would
     * appear here too, because both calls are made before either is awaited — so this single equality is
     * what fails a concurrent render.
     */
    expect(harness.operations.started).toStrictEqual([SEQUENCING_FIRST_RECORD_OPERATIONS[0]]);
    expect(harness.operations.pending).toHaveLength(1);

    /* Nothing about record 2 has been touched: not its image, not its product's pricing. */
    for (const operation of SEQUENCING_SECOND_RECORD_OPERATIONS) {
      expect(harness.operations.started).not.toContain(operation);
    }

    await harness.operations.releaseAll();
    await rendering;
  });

  it('[NET-NEW] completes every operation of record 1 before the first operation of record 2', async () => {
    const harness = createSequencingHarness();

    const rendering = harness.start();
    await settleStartedOperations();

    /*
     * Released one at a time, asserting after each release, so the entire execution order is observed
     * rather than only its first and last steps. Record 1's three operations must appear in the order
     * `:L23`, `:L24`, then the `:L28` sale-price read, and record 2's first must not appear until record
     * 1's third has been released — i.e. until record 1's item is complete.
     */
    expect(harness.operations.started).toStrictEqual([SEQUENCING_FIRST_RECORD_OPERATIONS[0]]);

    await harness.operations.releaseOldest();
    expect(harness.operations.started).toStrictEqual([
      SEQUENCING_FIRST_RECORD_OPERATIONS[0],
      SEQUENCING_FIRST_RECORD_OPERATIONS[1],
    ]);

    await harness.operations.releaseOldest();
    expect(harness.operations.started).toStrictEqual(SEQUENCING_FIRST_RECORD_OPERATIONS);

    /* Record 1's last operation released — only now may record 2 begin. */
    await harness.operations.releaseOldest();
    expect(harness.operations.started).toStrictEqual([
      ...SEQUENCING_FIRST_RECORD_OPERATIONS,
      SEQUENCING_SECOND_RECORD_OPERATIONS[0],
    ]);

    await harness.operations.releaseAll();

    /*
     * The full execution order: record 1's three operations, then record 2's three, never interleaved.
     */
    expect(harness.operations.started).toStrictEqual([
      ...SEQUENCING_FIRST_RECORD_OPERATIONS,
      ...SEQUENCING_SECOND_RECORD_OPERATIONS,
    ]);

    /*
     * And the document that came out of that execution is the two records in the order supplied.
     */
    const xml = await rendering;
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(2);
    expect(xml.indexOf(`<g:id>${PRODUCT_ID}-SKU</g:id>`)).toBeLessThan(
      xml.indexOf(`<g:id>${SEQUENCING_SECOND_PRODUCT_ID}-SKU</g:id>`),
    );
  });

  it('[NET-NEW] holds every record after the first when the render is stopped at record 1', async () => {
    const harness = createSequencingHarness();

    const rendering = harness.start();
    await settleStartedOperations();

    /*
     * The same claim from the other direction, and the reason it is worth a third case: settling the
     * event loop repeatedly, without releasing anything, must not advance the render at all. A render
     * that had dispatched record 2's calls ahead of time would reveal them here even if the first case
     * happened to inspect the gate a tick too early.
     */
    await settleStartedOperations();
    await settleStartedOperations();
    expect(harness.operations.started).toStrictEqual([SEQUENCING_FIRST_RECORD_OPERATIONS[0]]);
    expect(harness.operations.pending).toHaveLength(1);

    await harness.operations.releaseAll();
    await rendering;
  });
});

/* §2 — identity, title, description, category and product type. */

describe('NET-NEW ProductFeedBuilder — identity, title, description, category, product type', () => {
  it('[NET-NEW] emits g:id from the escaped SKU code', async () => {
    const scenario = createScenario({ skuCode: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L17` — `htmlEditFormat(sku.getSkuCode())`.
     */
    expect(xml).toContain(itemField(`<g:id>${ESCAPED_SENTINEL}</g:id>`));
  });

  it('[NET-NEW] emits the item title from the persisted calculatedTitle, never from the template getTitle', async () => {
    const scenario = createScenario({
      calculatedTitle: ESCAPE_SENTINEL,
      productName: 'TEMPLATE-ONLY-PRODUCT-NAME',
    });

    const xml = await scenario.render();

    /*
     * `:L18` reads the persisted `calculatedTitle`. `Product.getTitle()`
     * (`model/entity/Product.cfc:L540-L545`) is a different member entirely: it interpolates the
     * `productTitleString` setting template. The two sentinels are deliberately distinct so the source is
     * unambiguous, and this suite never calls `getTitle()`.
     */
    expect(xml).toContain(itemField(`<title>${ESCAPED_SENTINEL}</title>`));
    expect(xml).not.toContain('TEMPLATE-ONLY-PRODUCT-NAME');
    /*
     * A second, independent proof: `productTitleString` is never seeded, and the resolver double raises
     * for an unseeded key. Its absence from the call log therefore establishes that the template member
     * was not reached, rather than merely that its output did not happen to appear.
     */
    expect(resolvedSettingNames(scenario.settings)).not.toContain('productTitleString');
  });

  /* The three-branch description — a judgment call, recorded rather than smoothed over. */
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
     * `:L19` has no `<cfelse>`, so the element is emitted with nothing inside it. It is not omitted and
     * not self-closing — a reader tidying this into `<description/>` would change the bytes a merchant
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

    /* Three spaces have non-zero length, so branch a wins and the spaces survive verbatim. */
    expect(xml).toContain(itemField('<description>   </description>'));
    expect(xml).not.toContain('TYPE-LEVEL-DESCRIPTION');
  });

  it('[NET-NEW] emits g:google_product_category as a paired empty element and never populates it', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `:L20` is a hard-coded empty element. The category drift trap: the integration declares a
     * `productGoogleProductType` select setting at
     * `integrationServices/google/Integration.cfc:L68-L70`, and it is tempting to conclude the feed
     * populates the category from it. It does not — `getSettingOptions()` in that same file has an empty
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
     * `model/entity/ProductType.cfc:L273-L278` joins a child to its parent with the literal text
     * ` &raquo; ` — an HTML entity written out as characters, not a Unicode guillemet. `htmlEditFormat`
     * then escapes its leading ampersand, so the emitted separator is ` &amp;raquo; `. That double-escaped
     * look is the legacy output and is preserved rather than "repaired" to a real `»`.
     */
    expect(xml).toContain(itemField('<g:product_type>Apparel &amp;raquo; Shirts</g:product_type>'));
    expect(xml).not.toContain(' &raquo; ');
  });
});

/* §3 — Absolute URLs and images. Every one of these fields is now escaped at its emission site. */

describe('NET-NEW ProductFeedBuilder — links and images', () => {
  it('[NET-NEW] emits the item link over HTTPS, keeping the product URL leading and trailing slashes', async () => {
    const scenario = createScenario({ urlTitle: 'nike-air' });

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L22` concatenates a hard-coded scheme, the
     * configured host and `product.getProductURL()`. `model/entity/Product.cfc:L207-L209` composes that
     * path as `/#setting('globalURLKeyProduct')#/#getURLTitle()#/`, so it carries both a leading and a
     * trailing slash. Neither is trimmed, and the two slashes are why the concatenation needs no separator.
     */
    expect(xml).toContain(
      itemField(`<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/</link>`),
    );
    expect(xml).not.toContain('<link>https://');
    /* The URL key is read through the setting resolver, not hard-coded in the builder. */
    expect(resolvedSettingNames(scenario.settings)).toContain('globalURLKeyProduct');
  });

  it('[NET-NEW] emits a raw URL path byte-for-byte, and refuses one carrying markup', async () => {
    /* The raw-sink contract at `:L22`, and how it changed twice. */
    const safeScenario = createScenario({ urlTitle: RAW_SAFE_SENTINEL });

    const safeXml = await safeScenario.render();

    expect(safeXml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${RAW_SAFE_SENTINEL}/</link>`,
      ),
    );
    /* Neither remedy may be observable in the emitted bytes. */
    expect(safeXml).not.toContain(encodeURIComponent(RAW_SAFE_SENTINEL));
    expect(safeXml).not.toContain(`/${RAW_SAFE_SENTINEL_ESCAPED}/`);
    /* And the separators the legacy relies on survive, as they did under the encoder. */
    expect(safeXml).toContain(`<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/`);
    expect(safeXml).not.toContain('<link>https://');
    /* The URL key is still read through the setting resolver, not hard-coded in the builder. */
    expect(resolvedSettingNames(safeScenario.settings)).toContain('globalURLKeyProduct');

    /*
     * And the second half is the refusal that keeps CWE-91 closed. Raw emission alone would let a
     * stored `&` reach the document and leave it unparseable, which is exactly the exposure finding
     * names. So the value is refused rather than escaped: no document is published, and the failure is a
     * `DataIntegrityError`, which `googleFeedHandler` answers 500. Escaping made such a payload harmless
     * data; refusing makes it unpublished. Both close the injection route, and only refusing leaves the
     * legitimate bytes above untouched.
     */
    const hostileScenario = createScenario({ urlTitle: RAW_REFUSED_SENTINEL });

    await expect(hostileScenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
  });

  it('[NET-NEW] emits g:image_link from the SKU resized path with no size arguments', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `:L23` calls `sku.getResizedImagePath()` with no arguments at all. `model/entity/Sku.cfc:L192-L218`
     * accepts an optional size, width and height and applies a deprecated-size gate when one is supplied;
     * The feed supplies none, so none of that gate runs. The recorded request proves the absence rather
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
     * One resolution per image, the repeat included — five in total for the SKU'S own image plus four
     * product images. `:L23` resolves a resized path once per SKU and `:L24` resolves one per element of
     * the product's image collection, with no de-duplication anywhere, so the duplicate path is resolved
     * twice. That call pattern is the behaviour being ported.
     */
    const requests = resizeRequests(scenario.images);
    expect(requests).toHaveLength(5);
    expect(requests.map((request) => String(request.imagePath))).toStrictEqual([
      SKU_COMPOSED_IMAGE_PATH,
      THIRD_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
      SECOND_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
    ]);

    /*
     * Every resize — the SKU's and each image's — was requested with no size, width, height or
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

  it('[NET-NEW] resolves every image again on a second render, holding no state between builds', async () => {
    const scenario = createScenario();

    await scenario.render({ productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }] });
    const afterFirstBuild = resizeRequests(scenario.images).map((request) =>
      String(request.imagePath),
    );
    await scenario.render({ productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }] });
    const afterSecondBuild = resizeRequests(scenario.images).map((request) =>
      String(request.imagePath),
    );

    /*
     * M7 — the builder holds no state at all, which is stronger than saying an invocation-scoped
     * memo does not outlive a `build` call. There is no memo (see the case above), so nothing can
     * outlive anything and the second render simply repeats the first render's two resolutions.
     * Nothing survives between invocations
     * of a serverless runtime except module scope, and the only module-scope values in the builder are
     * frozen literal constants — so a warm container cannot serve one tenant's resolved paths to the next.
     */
    expect(afterFirstBuild).toStrictEqual([SKU_COMPOSED_IMAGE_PATH, FIRST_ADDITIONAL_IMAGE_PATH]);
    expect(afterSecondBuild).toStrictEqual([
      SKU_COMPOSED_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
      SKU_COMPOSED_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
    ]);
    /*
     * Stated once more as the relation itself, so the intent survives a change to either literal.
     */
    expect(afterSecondBuild.slice(afterFirstBuild.length)).toStrictEqual(afterFirstBuild);
  });
});

/* §4 — Fixed literals, the product price, and the price/sale-gate asymmetry. */

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

  /* The price / sale-gate asymmetry — a judgment call, recorded so it is never "tidied up". */
  it('[NET-NEW] emits g:price from the product price while gating the sale pair on the SKU price', async () => {
    const scenario = createScenario({ productPrice: 60, skuPrice: 90 });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();

    /* `:L27` — the product price, 60, not the SKU's 90. */
    expect(xml).toContain(itemField('<g:price>60</g:price>'));
    /*
     * `:L28-L29` — the gate compared the SKU's 90 against the sale price 79.5 and passed. Had it read the
     * product's 60 instead, 60 is not greater than 79.5 and the pair would have been omitted, so the
     * presence of these elements proves the gate reads the SKU price.
     */
    expect(xml).toContain(itemField('<g:sale_price>79.5</g:sale_price>'));
    expect(xml).toContain('<g:sale_price_effective_date>');
    /*
     * The sale price came through the pricing port, never off an excluded calculated entity member.
     */
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
     * `:L28` uses `gt`, a strict comparison, so equality omits the pair. The product price of 100 is
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
     * The details object carries a discount type but no `salePrice`. `model/entity/Sku.cfc:L546-L551`
     * returns `salePriceDetails["salePrice"]` only when that key exists and otherwise falls back to
     * `getPrice()` — the SKU's own regular price. The comparison therefore becomes 90 against 90, which
     * `gt` rejects, and the pair is omitted. Substituting null or zero for a missing sale price would put
     * every SKU in the catalogue on sale, which is why the fallback is pinned rather than assumed.
     */
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({ salePriceDiscountType: 'percentageOff' }),
    });

    const xml = await scenario.render();

    expect(xml).toContain(itemField('<g:price>100</g:price>'));
    expect(xml).not.toContain('<g:sale_price>');
    expect(xml).not.toContain('<g:sale_price_effective_date>');
    /* The port was consulted; the omission is the fallback's outcome, not a skipped lookup. */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID]);
  });

  it('[NET-NEW] resolves sale-price detail once per SKU INSTANCE, so two SKUs of one product ask the pricing port twice', async () => {
    const scenario = createScenario();
    const secondSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'TESTPRODUCTXXX-2',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: scenario.product,
    });

    await scenario.render({ skus: [scenario.sku, secondSku] });

    /*
     * The pricing half, over more than one SKU. The sibling above pins one request for one SKU, and
     * one request is what a document-wide cache produces too — so a single-SKU assertion cannot
     * detect a caching decorator. A `memoisePricingByProduct(this.pricing)` decorator would key
     * sale-price detail on `productId` and hand the same
     * wrapper to every record in the document, so a product with `n` feed SKUs resolved its detail once.
     */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID, PRODUCT_ID]);
  });

  it('[NET-NEW] emits g:price as a paired empty element when the product has no price at all', async () => {
    const scenario = createScenario({ omitProductPrice: true });

    const xml = await scenario.render();

    /*
     * `model/entity/Product.cfc:L561-L568` returns `variables.price` when it exists, otherwise the default
     * SKU's price, and otherwise falls off the end of the function returning nothing. Interpolating that
     * nothing produced an empty element. It is not `0`, it is not omitted, and it is not self-closing —
     * substituting a zero would advertise a free product.
     */
    expect(xml).toContain(itemField('<g:price></g:price>'));
    expect(xml).not.toContain('<g:price>0</g:price>');
    expect(xml).not.toContain('<g:price/>');
    expect(xml).not.toContain('<g:price />');
  });
});

/* §5 — The malformed sale-price effective date, and the literal tab that follows it. */

/** Render `YYYY-MM-DDTHH:mm:ss` from a `Date`'s local components. */
function localComponentTimestamp(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * The text between the first `<tag>` and its `</tag>`, or `undefined` when the element is absent.
 */
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

describe('NET-NEW formatting helpers — named date masks and exact-decimal projection', () => {
  it('[NET-NEW] renders long and abbreviated English month and weekday names through the public date formatter', () => {
    /*
     * February 29, 2024 was a Thursday. Constructed in local time because `formatDate` deliberately
     * follows the host-local semantics of CFML `dateFormat`, rather than converting to UTC first.
     */
    const leapDay = new Date(2024, 1, 29, 12, 0, 0);

    expect(formatDate(leapDay, 'mmmm|mmm|dddd|ddd')).toBe('February|Feb|Thursday|Thu');
    /* Mask matching is case-insensitive, while emitted names retain their declared casing. */
    expect(formatDate(leapDay, 'MMMM DDDD')).toBe('February Thursday');
  });

  it('[NET-NEW] projects exact decimals to numbers and preserves the non-numeric sentinel as NaN', () => {
    expect(exactDecimalToNumber(toExactDecimal('12.50'))).toBe(12.5);
    expect(exactDecimalToNumber(EXACT_DECIMAL_NOT_NUMERIC)).toBeNaN();
  });
});

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
     * TODO(parity) `integrationServices/google/views/feed/product.cfm:L30` — the offset is malformed and
     * is deprived of its colon on purpose.
     */
    expect(content).toBe(`${EXPECTED_EFFECTIVE_DATE_START}/${EXPECTED_EFFECTIVE_DATE_END}`);

    /* Two endpoints, each carrying the same raw offset value, and the date/time pieces exact. */
    const endpoints = (content ?? '').split('/');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toBe(`2024-01-01T09:05:07-${RAW_UTC_HOUR_OFFSET}`);
    expect(endpoints[1]).toBe(`2024-02-09T14:15:00-${RAW_UTC_HOUR_OFFSET}`);

    /*
     * The same claim stated independently of the literals above, so a future edit cannot make both agree
     * on a wrong value: each endpoint's date and time are read back out of the document and compared
     * against the components of the very `Date` objects the render was given.
     */
    expect(endpoints[0]).toBe(
      `${localComponentTimestamp(new Date(RENDER_INSTANT_EPOCH_MS))}-${RAW_UTC_HOUR_OFFSET}`,
    );
    expect(endpoints[1]).toBe(
      `${localComponentTimestamp(scenario.saleExpiration)}-${RAW_UTC_HOUR_OFFSET}`,
    );

    /*
     * No valid signed `HH:MM` offset appears anywhere in the document, and no `Z` normalisation occurred.
     */
    expect(xml).not.toMatch(/[+-]\d{2}:\d{2}/);
    expect(content).not.toContain('Z');
    expect(content).not.toContain('-05:00');
    expect(content).not.toContain('+00:00');

    /*
     * The literal trailing tab. `:L30` ends with a tab character after the closing tag, verified in the
     * legacy file with a byte inspection rather than inferred from indentation. It is emitted, so it is
     * asserted byte-exactly here; trimming it would be a silent change to the document a merchant feed
     * processor receives.
     */
    expect(xml).toContain('</g:sale_price_effective_date>\t');
    /*
     * And it is the only element that carries one, which the count states rather than implies: the tab
     * belongs to `:L30` alone, so a tab appearing after any other closing tag would be a fabricated byte.
     */
    expect(countOccurrences(xml, '>\t')).toBe(1);
  });

  it('[NET-NEW] interpolates whatever offset the caller supplies, unformatted and unpadded', async () => {
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
     * The offset is interpolated as text, exactly as `getTimeZoneInfo().utcHourOffset` reached the
     * template. Still no colon, still no padding — and still no effect on the components, which are the
     * same two timestamps the `-5` case asserted.
     */
    expect(elementContent(xml, 'g:sale_price_effective_date')).toBe(
      '2024-01-01T09:05:07-7/2024-02-09T14:15:00-7',
    );
    expect(xml).not.toMatch(/[+-]\d{2}:\d{2}/);
  });

  it('[NET-NEW] changing only the offset text moves neither endpoint date nor time', async () => {
    /*
     * The guard against an invented offset correction, stated as a property rather than as a
     * literal. `:L30` uses the offset in one place only — as the text after the literal hyphen — so
     * rendering the same two instants under several different offsets must produce documents that differ
     * in the suffixes and nowhere else. Any reintroduced arithmetic, of any sign or magnitude, changes at
     * least one date or time component and fails this case.
     */
    const offsets = ['0', '5', '7', '-3', '9.5'] as const;
    const renderedEndpointPairs: string[][] = [];

    for (const utcHourOffset of offsets) {
      const scenario = createScenario({ productPrice: 100, skuPrice: 90, utcHourOffset });
      scenario.seedSaleDetails({
        [SKU_ID]: buildSalePriceDetails({
          salePrice: 79.5,
          salePriceExpirationDateTime: scenario.saleExpiration,
        }),
      });

      const content = elementContent(await scenario.render(), 'g:sale_price_effective_date') ?? '';
      const endpoints = content.split('/');
      expect(endpoints).toHaveLength(2);

      /*
       * The suffix is the offset text after the template's literal hyphen — even when the text itself
       * carries a minus, which is why `-3` renders the doubled `--3` rather than being re-signed.
       */
      expect(endpoints[0]).toBe(`${EXPECTED_LOCAL_TIMESTAMP_START}-${utcHourOffset}`);
      expect(endpoints[1]).toBe(`${EXPECTED_LOCAL_TIMESTAMP_END}-${utcHourOffset}`);
      renderedEndpointPairs.push(endpoints);
    }

    /* Every render agreed on both timestamps: the offset changed the labels and nothing else. */
    const startTimestamps = new Set(
      renderedEndpointPairs.map((endpoints) =>
        (endpoints[0] ?? '').split('-').slice(0, 3).join('-'),
      ),
    );
    expect(startTimestamps).toStrictEqual(new Set([EXPECTED_LOCAL_TIMESTAMP_START]));
  });
});

/* §6 — brand, item group identifier, and shipping weight. */

describe('NET-NEW ProductFeedBuilder — brand, item group and shipping weight', () => {
  it('[NET-NEW] emits an escaped g:brand when the brand object is present', async () => {
    const scenario = createScenario({ brand: 'present', brandName: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L32` — `htmlEditFormat(brand.getBrandName())`.
     */
    expect(xml).toContain(itemField(`<g:brand>${ESCAPED_SENTINEL}</g:brand>`));
  });

  it('[NET-NEW] emits a paired empty g:brand when the brand object exists with an empty name', async () => {
    const scenario = createScenario({ brand: 'present', brandName: '' });

    const xml = await scenario.render();

    /*
     * `:L32` tests the object, not the name, so a brand whose name is empty still satisfies the guard and
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
     * The `isNull` / `len` inconsistency — a judgment call, recorded and deliberately not harmonised.
     */
    expect(xml).not.toContain('<g:brand>');
    expect(xml).not.toContain('</g:brand>');
    expect(xml).toContain(itemField('<description></description>'));
    /*
     * Ordering around the removed element still holds: the item group follows the product price.
     */
    expect(xml.indexOf('<g:price>')).toBeLessThan(xml.indexOf('<g:item_group_id>'));
  });

  it('[NET-NEW] emits g:item_group_id from the escaped product code', async () => {
    const scenario = createScenario({ productCode: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /*
     * `:L39` — `htmlEditFormat(product.getProductCode())`, the live field wedged between two disabled blocks.
     */
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
     * M8 — the resolver is synchronous by declaration and is never awaited. Had it been awaited, or had a
     * promise been interpolated, the element would carry `[object Promise]` instead of the value.
     */
    expect(xml).not.toContain('[object Promise]');
  });

  it('[NET-NEW] emits both shipping-weight settings raw, refusing only markup', async () => {
    /*
     * `:L58` interpolates both settings with no `htmlEditFormat` call, so this is a raw sink and
     * the joined text is not escaped. The legitimate bytes below are emitted exactly as the
     * settings store holds them — including the legacy's single separator space,
     * which is a literal in the template rather than a product of any transformation.
     */
    const scenario = createScenario({
      settings: [
        { settingName: 'skuShippingWeight', value: '1.5' },
        { settingName: 'skuShippingWeightUnitCode', value: RAW_SAFE_SENTINEL },
      ],
    });

    const xml = await scenario.render();

    expect(xml).toContain(
      itemField(`<g:shipping_weight>1.5 ${RAW_SAFE_SENTINEL}</g:shipping_weight>`),
    );
    /* No entity may appear: escaping this sink is precisely what reversed. */
    expect(xml).not.toContain(RAW_SAFE_SENTINEL_ESCAPED);
    /* The legacy's single literal separator space survives, as it did under the escape. */
    expect(xml).toContain(`1.5 ${RAW_SAFE_SENTINEL}`);

    /*
     * And the markup the review quoted is refused rather than published. A raw `<lb>` reaching the
     * document would make `</g:shipping_weight>` the close of a `<lb>` element rather than of this
     * field, which is the malformed rendering a 200 response may not carry. Because the sink is
     * raw, escaping is not available, so it refuses — once per offending setting, and no document
     * is published either way.
     */
    const ampersandScenario = createScenario({
      settings: [{ settingName: 'skuShippingWeight', value: '1&2' }],
    });
    await expect(ampersandScenario.render()).rejects.toBeInstanceOf(DataIntegrityError);

    const elementScenario = createScenario({
      settings: [{ settingName: 'skuShippingWeightUnitCode', value: '<lb>' }],
    });
    await expect(elementScenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
  });
});

/* §6.5 — the complete sixteen-position item order. */

/** The legacy item field sequence, `product.cfm:L17-L58`, with each position's locator. */
const LEGACY_ITEM_FIELD_SEQUENCE: readonly string[] = Object.freeze([
  'g:id', //                         1  `:L17`
  'title', //                        2  `:L18`
  'description', //                  3  `:L19`
  'g:google_product_category', //    4  `:L20`
  'g:product_type', //               5  `:L21`
  'link', //                         6  `:L22`
  'g:image_link', //                 7  `:L23`
  'g:additional_image_link', //      8  `:L24`, repeated once per product image
  'g:condition', //                  9  `:L25`
  'g:availability', //              10  `:L26`
  'g:price', //                     11  `:L27`
  'g:sale_price', //                12  `:L29`, conditional on `:L28`
  'g:sale_price_effective_date', // 13  `:L30`, conditional on `:L28`
  'g:brand', //                     14  `:L32`, conditional on the brand association
  'g:item_group_id', //             15  `:L39`
  'g:shipping_weight', //           16  `:L58`
]);

/**
 * The sequence with the three conditional positions removed — the minimum a rendered item carries.
 */
const LEGACY_ITEM_FIELD_SEQUENCE_WITHOUT_CONDITIONALS: readonly string[] = Object.freeze(
  LEGACY_ITEM_FIELD_SEQUENCE.filter(
    (fieldName) =>
      fieldName !== 'g:additional_image_link' &&
      fieldName !== 'g:sale_price' &&
      fieldName !== 'g:sale_price_effective_date' &&
      fieldName !== 'g:brand',
  ),
);

/** Extract the element names of one `<item>`'s direct children, in document order. */
function itemChildElementNames(xml: string, itemIndex = 0): readonly string[] {
  const openTag = `${CHANNEL_FIELD_INDENT}<item>`;
  const closeTag = `${CHANNEL_FIELD_INDENT}</item>`;
  const lines = xml.split('\n');

  let seenItems = -1;
  let inside = false;
  const names: string[] = [];

  for (const line of lines) {
    if (line === openTag) {
      seenItems += 1;
      inside = seenItems === itemIndex;
      continue;
    }
    if (line === closeTag) {
      if (inside) {
        break;
      }
      continue;
    }
    if (!inside) {
      continue;
    }

    /*
     * Direct children only: every one is emitted at exactly three tabs by `buildItem`. A nested
     * element would carry a deeper indent and is therefore not collected — the legacy's own nested
     * elements all sit inside its disabled comment blocks, so a live one appearing here would be
     * fabricated.
     */
    expect(line.startsWith(ITEM_FIELD_INDENT)).toBe(true);
    const name = elementNameOfLine(line.slice(ITEM_FIELD_INDENT.length));
    if (name !== names[names.length - 1]) {
      names.push(name);
    }
  }

  expect(inside).toBe(true);
  return names;
}

/** The element name opening a rendered line, e.g. `g:image_link` from `<g:image_link>http://…`. */
function elementNameOfLine(markup: string): string {
  const match = /^<([^\s/>]+)[\s>]/.exec(markup);
  if (match === null) {
    throw new Error(
      `A rendered item line does not open with an element: ${JSON.stringify(markup)}`,
    );
  }
  const [, name] = match;
  if (name === undefined) {
    throw new Error(`A rendered item line has no element name: ${JSON.stringify(markup)}`);
  }
  return name;
}

describe('NET-NEW ProductFeedBuilder — the complete sixteen-position item order', () => {
  it('[NET-NEW] emits all sixteen fields in legacy source order when every conditional is present', async () => {
    const scenario = createScenario({
      brand: 'present',
      brandName: 'Nike',
      productPrice: 100,
      skuPrice: 90,
    });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render({
      /*
       * Three images, so the repeated position 8 is genuinely a run rather than a single element.
       */
      productImages: [
        { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
        { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
        { imagePath: THIRD_ADDITIONAL_IMAGE_PATH },
      ],
    });

    /*
     * Recovered from a false conflict alignment — read this before trusting the diff of this case.
     */
    expect(itemChildElementNames(xml)).toStrictEqual(LEGACY_ITEM_FIELD_SEQUENCE);

    /* The run really was a run: three elements collapsed into position 8's single entry. */
    expect(countOccurrences(xml, '<g:additional_image_link>')).toBe(3);
  });

  it('[NET-NEW] emits the remaining twelve in the same relative order when every conditional is absent', async () => {
    /*
     * The other branch of all three conditionals at once: no brand association (`:L32`), no sale because
     * the SKU price equals its sale-price fallback (`:L28`), and no product images (`:L24`). The twelve
     * surviving fields must keep their relative order exactly — a port that emitted the unconditional
     * fields in one order when a sale renders and another when it does not would pass §6's three-field
     * check and this suite's per-field checks alike.
     */
    const scenario = createScenario({ brand: 'absent', productPrice: 100, skuPrice: 90 });

    const xml = await scenario.render({ productImages: [] });

    expect(itemChildElementNames(xml)).toStrictEqual(
      LEGACY_ITEM_FIELD_SEQUENCE_WITHOUT_CONDITIONALS,
    );
    expect(xml).not.toContain('<g:additional_image_link');
    expect(xml).not.toContain('<g:sale_price>');
    expect(xml).not.toContain('<g:sale_price_effective_date>');
    expect(xml).not.toContain('<g:brand>');
  });

  it('[NET-NEW] emits the same sequence for every item in a multi-record feed', async () => {
    const scenario = createScenario({ brand: 'present', brandName: 'Nike' });
    const secondSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'TESTPRODUCTXXX-2',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: scenario.product,
    });

    const xml = await scenario.render({
      skus: [scenario.sku, secondSku],
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    /*
     * `:L16`'s loop body is one template, so every item carries the same field sequence. Asserting the
     * second item independently is what proves the extractor is anchored per item rather than reading the
     * first item twice, and it forecloses a per-record divergence no single-item case could see.
     */
    const expectedWithoutSale = LEGACY_ITEM_FIELD_SEQUENCE.filter(
      (fieldName) => fieldName !== 'g:sale_price' && fieldName !== 'g:sale_price_effective_date',
    );
    expect(itemChildElementNames(xml, 0)).toStrictEqual(expectedWithoutSale);
    expect(itemChildElementNames(xml, 1)).toStrictEqual(expectedWithoutSale);
  });

  it('[NET-NEW] emits a clean g:shipping_weight byte-for-byte, so escaping is the identity there', async () => {
    const scenario = createScenario({
      settings: [
        { settingName: 'skuShippingWeight', value: '1.5' },
        { settingName: 'skuShippingWeightUnitCode', value: 'lbs' },
      ],
    });

    const xml = await scenario.render();

    /*
     * This is the half of that had to be preserved, and it is what makes the reversal d18-shaped.
     * `1.5 lbs` carries none of `&`, `<`, `>` or `"`, so `String.replaceAll` matches nothing and the
     * emitted bytes are exactly what the legacy emitted. The divergence above falls only on values that
     * produced no parseable document at all.
     */
    expect(xml).toContain(itemField('<g:shipping_weight>1.5 lbs</g:shipping_weight>'));
  });
});

/* §7 — The three disabled blocks, and the live fields interleaved between them. */

describe('NET-NEW ProductFeedBuilder — disabled fields, at runtime', () => {
  it('[NET-NEW] emits none of the eleven disabled top-level fields as a live element', async () => {
    const scenario = createScenario();

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    /*
     * The three-block interleaving — a judgment call, recorded because a flat field list hides it.
     */
    for (const fieldName of ALL_DISABLED_TOP_LEVEL_FIELDS) {
      expect(xml).not.toMatch(fieldNamePattern(`<${fieldName}`));
      expect(xml).not.toMatch(fieldNamePattern(`</${fieldName}`));
    }

    /* The live fields those patterns must not have suppressed are still present. */
    expect(xml).toContain('<g:shipping_weight>');
    expect(xml).toContain('<g:additional_image_link>');
  });

  it('[NET-NEW] emits the live product price exactly once and none of the disabled nested children', async () => {
    const scenario = createScenario();

    const xml = await scenario.render();

    /*
     * `g:price` is both a live top-level field (`:L27`) and a disabled child of the commented `g:shipping`
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
     * lose information. Retained means retained as comments: present in the comment text, absent from the
     * executable text, so no disabled field can be emitted by accident.
     */
    for (const fieldName of [
      ...ALL_DISABLED_TOP_LEVEL_FIELDS,
      ...DISABLED_BLOCK_TWO_NESTED_FIELDS,
    ]) {
      expect(commentText).toMatch(fieldNamePattern(fieldName));
      if (fieldName === 'g:price') {
        /*
         * Live at `:L27`, so it legitimately appears in code as well; the runtime count pins it.
         */
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

    /* Block 1's four names sit together, before the live item-group serialization. */
    expect(blockOne.end).toBeLessThan(itemGroupCodeAt);
    /* Block 2 sits after the item-group code and before the shipping-weight code. */
    expect(blockTwo.start).toBeGreaterThan(itemGroupCodeAt);
    expect(blockTwo.end).toBeLessThan(shippingWeightCodeAt);
    /* Block 3 sits after the shipping-weight code. */
    expect(blockThree.start).toBeGreaterThan(shippingWeightCodeAt);

    /*
     * Three blocks, not one. Flattening every disabled name into a single comment would still satisfy
     * "the names are retained" while destroying the record of WHERE each group sat relative to the live
     * fields — which is the only reason the legacy interleaving is recoverable at all.
     */
    const starts = [blockOne.start, blockTwo.start, blockThree.start];
    expect(new Set(starts).size).toBe(3);
    expect(starts).toStrictEqual([...starts].sort((left, right) => left - right));
  });
});

/* §8 — The asymmetric escaping map, reproduced exactly as the legacy has it. */

describe('NET-NEW ProductFeedBuilder — escaping every dynamic field', () => {
  it('[NET-NEW] reproduces the legacy split exactly: six escaped, nine raw', async () => {
    /* The census, and why it is authoritative again. */
    const rawImagePath = '/product/default/a>b"c\'d.jpg';
    const rawAdditionalImagePath = '/product/default/e>f"g\'h.jpg';
    const scenario = createScenario({
      skuCode: RAW_SAFE_SENTINEL,
      calculatedTitle: RAW_SAFE_SENTINEL,
      productDescription: RAW_SAFE_SENTINEL,
      productTypeName: RAW_SAFE_SENTINEL,
      brandName: RAW_SAFE_SENTINEL,
      productCode: RAW_SAFE_SENTINEL,
      urlTitle: RAW_SAFE_SENTINEL,
      imagePathsByImageFile: { [SKU_IMAGE_FILE]: rawImagePath },
      settings: [
        { settingName: 'skuShippingWeight', value: '1.5' },
        { settingName: 'skuShippingWeightUnitCode', value: RAW_SAFE_SENTINEL },
      ],
    });

    const xml = await scenario.render({
      productImages: [{ imagePath: rawAdditionalImagePath }],
    });

    /* The six the legacy escapes — and `>` and `"` must be entities in every one of them. */
    expect(xml).toContain(itemField(`<g:id>${RAW_SAFE_SENTINEL_ESCAPED}</g:id>`));
    expect(xml).toContain(itemField(`<title>${RAW_SAFE_SENTINEL_ESCAPED}</title>`));
    expect(xml).toContain(itemField(`<description>${RAW_SAFE_SENTINEL_ESCAPED}</description>`));
    expect(xml).toContain(
      itemField(`<g:product_type>${RAW_SAFE_SENTINEL_ESCAPED}</g:product_type>`),
    );
    expect(xml).toContain(itemField(`<g:brand>${RAW_SAFE_SENTINEL_ESCAPED}</g:brand>`));
    expect(xml).toContain(
      itemField(`<g:item_group_id>${RAW_SAFE_SENTINEL_ESCAPED}</g:item_group_id>`),
    );

    /*
     * The nine the legacy does not — byte-for-byte, with no entity and no percent-encoding. The three URL
     * sinks are the ones that changed most: they used to show `encodeURIComponent`'s output, and now they
     * show the stored path. An implementation that still encoded, or that escaped, fails all three.
     */
    expect(xml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${RAW_SAFE_SENTINEL}/</link>`,
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
    expect(xml).toContain(
      itemField(`<g:shipping_weight>1.5 ${RAW_SAFE_SENTINEL}</g:shipping_weight>`),
    );

    /*
     * And the counts pin the split as a whole, which no per-field assertion can do. Six escaped
     * occurrences: the six textual fields, and no more — a seventh would mean a raw sink had been escaped.
     * The raw form appears at the four raw sinks seeded with it: the item link, the shipping weight, and
     * — inside the two image paths — nowhere, because those paths embed the characters rather than the
     * whole sentinel. So the raw count is asserted where it is unambiguous, and the image paths are
     * asserted whole above.
     */
    expect(countOccurrences(xml, RAW_SAFE_SENTINEL_ESCAPED)).toBe(6);
    expect(xml).not.toContain(encodeURIComponent(RAW_SAFE_SENTINEL));
    expect(xml).not.toContain(encodeURIComponent('a>b"c\'d.jpg'));
  });

  it('[NET-NEW] the builder refuses a raw sink carrying markup rather than publishing it', async () => {
    /* The raw sinks refuse a hostile value; the escaped sinks round-trip it. This is the refusal half. */
    const hostileValue = 'x<y&z';

    const perSinkScenarios: readonly (() => ReturnType<typeof createScenario>)[] = [
      /* channel `link` and `description` (`:L14`, `:L15`) — both carry the host. */
      () => createScenario({ host: hostileValue }),
      /* item `link` (`:L22`) — the path carries the persisted `urlTitle`. */
      () => createScenario({ urlTitle: hostileValue }),
      /* `g:image_link` (`:L23`) — the path comes from the image adapter. */
      () =>
        createScenario({
          imagePathsByImageFile: { [SKU_IMAGE_FILE]: `/product/default/${hostileValue}.jpg` },
        }),
      /* `g:shipping_weight` (`:L58`) — both halves are operator-editable settings. */
      () =>
        createScenario({
          settings: [{ settingName: 'skuShippingWeightUnitCode', value: hostileValue }],
        }),
    ];

    for (const buildScenario of perSinkScenarios) {
      await expect(buildScenario().render()).rejects.toBeInstanceOf(DataIntegrityError);
    }

    /*
     * `g:additional_image_link` (`:L24`) needs the image reader seeded, so it is driven through the render
     * options rather than the scenario seed.
     */
    await expect(
      createScenario().render({
        productImages: [{ imagePath: `/product/default/${hostileValue}.jpg` }],
      }),
    ).rejects.toBeInstanceOf(DataIntegrityError);

    /*
     * `g:sale_price_effective_date` (`:L30`) is the one sink that must be UNLOCKED before it can be reached:
     * The pair is emitted only when the SKU price exceeds the sale price, so the sale detail has to be seeded
     * or the offset never reaches a document and a refusal assertion would pass vacuously. That trap is
     * recorded because a first draft of this case fell into it — the render resolved, and the reason was a
     * missing seed rather than a missing refusal.
     */
    const offsetScenario = createScenario({
      productPrice: 100,
      skuPrice: 90,
      utcHourOffset: hostileValue,
    });
    offsetScenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: offsetScenario.saleExpiration,
      }),
    });
    await expect(offsetScenario.render()).rejects.toBeInstanceOf(DataIntegrityError);

    /*
     * And the `]]>` sequence is refused too, which neither `&` nor `<` covers. It is the only
     * multi-character sequence XML 1.0 forbids in element content, and it can reach a raw sink without any
     * single forbidden character being present.
     */
    await expect(
      createScenario({
        settings: [{ settingName: 'skuShippingWeightUnitCode', value: 'lb]]>x' }],
      }).render(),
    ).rejects.toBeInstanceOf(DataIntegrityError);

    /*
     * A `>` on its own is legal element content and must not be refused — the boundary of the rule.
     */
    const legalScenario = createScenario({
      settings: [{ settingName: 'skuShippingWeightUnitCode', value: 'lb>x' }],
    });
    await expect(legalScenario.render()).resolves.toContain('<g:shipping_weight>');
  });

  it('[NET-NEW] emits the configured host raw in all five places it is interpolated', async () => {
    /*
     * The host is the one dynamic value that reaches both channel-level fields, so a single bad
     * configured value corrupts the whole document rather than one item. `:L14`, `:L15`, `:L22`,
     * `:L23` and `:L24` all interpolate it with no check, and all five are raw sinks, so it is
     * emitted unmodified.
     */
    const rawHost = `catalog.example.test${RAW_SAFE_SENTINEL}`;
    const scenario = createScenario({ host: rawHost });

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    expect(xml).toContain(channelField(`<link>http://${rawHost}</link>`));
    expect(xml).toContain(
      channelField(`<description>Google Product Feed for http://${rawHost}</description>`),
    );
    expect(xml).toContain(itemField(`<link>http://${rawHost}/`));
    expect(xml).toContain(itemField(`<g:image_link>http://${rawHost}/`));
    expect(xml).toContain(itemField(`<g:additional_image_link>http://${rawHost}/`));
    /* Five interpolations, five raw occurrences, and no escaped one anywhere. */
    expect(countOccurrences(xml, rawHost)).toBe(5);
    expect(xml).not.toContain(RAW_SAFE_SENTINEL_ESCAPED);
    /*
     * The colon a real authority needs is proved unencoded by the default host-with-port case below.
     */
  });

  it('[NET-NEW] leaves a host port colon unencoded, so an ordinary authority survives intact', async () => {
    /*
     * The complement of the case above: a configured authority carrying a port must survive intact.
     * An implementation that ran the host through `encodeURIComponent` would emit
     * `catalog.example.test%3A8080` and break every URL in the feed — which is why percent-encoding
     * an authority is wrong independently of anything the path encoder does.
     */
    const scenario = createScenario({ host: 'catalog.example.test:8080' });

    const xml = await scenario.render();

    expect(xml).toContain(channelField('<link>http://catalog.example.test:8080</link>'));
    expect(xml).toContain(itemField('<link>http://catalog.example.test:8080/'));
    expect(xml).not.toContain('%3A8080');
  });

  it('[NET-NEW] emits the effective-date offset raw, refusing only what breaks the parse', async () => {
    /* The field'S one arbitrary-text component, driven through both outcomes. */
    const legalOffsetVectors = ['7', '-7', '5.5', RAW_SAFE_SENTINEL] as const;

    for (const offset of legalOffsetVectors) {
      const scenario = createScenario({
        productPrice: 100,
        skuPrice: 90,
        utcHourOffset: offset,
      });
      scenario.seedSaleDetails({
        [SKU_ID]: buildSalePriceDetails({
          salePrice: 79.5,
          salePriceExpirationDateTime: scenario.saleExpiration,
        }),
      });

      const xml = await scenario.render();

      /*
       * The offset sits after each of the two literal hyphens, unmodified, and the `/` between the endpoints
       * is untouched. Read through the reader as well as the raw string: the parser hands back exactly the
       * caller's own text, which is the property raw emission is supposed to have.
       */
      expect(elementContent(xml, 'g:sale_price_effective_date')).toBe(
        `${EXPECTED_LOCAL_TIMESTAMP_START}-${offset}/${EXPECTED_LOCAL_TIMESTAMP_END}-${offset}`,
      );
      const item = parseSoleFeedItem(xml);
      expect(childrenNamed(item, 'g:sale_price_effective_date')).toHaveLength(1);
      expect(soleChildText(item, 'g:sale_price_effective_date')).toBe(
        `${EXPECTED_LOCAL_TIMESTAMP_START}-${offset}/${EXPECTED_LOCAL_TIMESTAMP_END}-${offset}`,
      );

      /*
       * And an escaped form is absent at both endpoints — asserted only for a vector escaping would
       * actually have changed. For `7`, `-7` and `5.5` the escaped form is the raw form, so the
       * same assertion would demand the absence of the very text the sink is required to emit; the
       * guard is what keeps this case about the absence of escaping rather than about the emission.
       */
      const escaped = offset
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
      if (escaped !== offset) {
        expect(xml).not.toContain(`${EXPECTED_LOCAL_TIMESTAMP_START}-${escaped}/`);
        expect(xml).not.toContain(
          `${EXPECTED_LOCAL_TIMESTAMP_END}-${escaped}</g:sale_price_effective_date>`,
        );
      }
    }

    /*
     * And the hostile vectors produce no document at all. The last one is the sharpest: `'5&amp;'` is
     * already-escaped input, and it is refused on its bare ampersand rather than being re-escaped to
     * `5&amp;amp;` as the escaping revision did. Reading it as already-encoded is exactly the ambiguity an
     * attacker supplies `&amp;lt;` to exploit, so the raw renderer treats it as the text it is and declines.
     */
    const refusedOffsetVectors = ['7<x>&', '&', '<7', '5&amp;', 'x]]>y'] as const;

    for (const offset of refusedOffsetVectors) {
      const scenario = createScenario({
        productPrice: 100,
        skuPrice: 90,
        utcHourOffset: offset,
      });
      scenario.seedSaleDetails({
        [SKU_ID]: buildSalePriceDetails({
          salePrice: 79.5,
          salePriceExpirationDateTime: scenario.saleExpiration,
        }),
      });

      await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
    }
  });

  it('[NET-NEW] emits a numeric-looking offset as a bare label, parsing and shifting nothing', async () => {
    /*
     * The complement of the case above, and the reason it matters that nothing parses the offset: an
     * offset that looks like a number is still only text. `'0x7'` is the sharpest available example,
     * because `Number('0x7')` is `7` — so every implementation that reads the offset numerically agrees it
     * is seven, and any that shifts by it must move the wall clock seven hours. This one does not move it
     * at all.
     *
     * TODO(parity) `integrationServices/google/views/feed/product.cfm:L30` — the label is also emitted
     * with no formatting of any kind, so a hexadecimal offset is not re-spelled as `7`, not zero-padded to
     * `07`, and not given the `:00` minutes a conforming ISO 8601 offset would carry. That passthrough is
     * the behaviour being preserved rather than a defect introduced here, and it is asserted so that a
     * future revision cannot quietly start normalising the label without a test failing.
     */
    const scenario = createScenario({ productPrice: 100, skuPrice: 90, utcHourOffset: '0x7' });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render();

    /*
     * The same two timestamps every other offset in this file produces, with `0x7` as the label. Reusing
     * the shared `EXPECTED_LOCAL_TIMESTAMP_*` constants is the point: they are the values the `-5` case in
     * §5 asserts, so a reintroduced shift of any magnitude fails here and there at once.
     */
    expect(elementContent(xml, 'g:sale_price_effective_date')).toBe(
      `${EXPECTED_LOCAL_TIMESTAMP_START}-0x7/${EXPECTED_LOCAL_TIMESTAMP_END}-0x7`,
    );

    /* No parsed form of the label reaches the document, in either spelling. */
    expect(xml).not.toContain('-7/');
    expect(xml).not.toContain('-07');
    expect(xml).not.toContain('T05:30:45');
    expect(xml).not.toContain('T20:15:00');
  });

  it('[NET-NEW] refuses a money value that reached the exact-decimal brand without satisfying it', async () => {
    /*
     * Why this case needs a cast WHERE no other case in this file does, AND why it is still worth it.
     */
    const scenario = createScenario({ productPrice: 100 });
    scenario.product.price = 'A&B<C' as unknown as ExactDecimal;

    await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);

    /*
     * And a forged value that is legal XML still renders, verbatim — the boundary of the rule. The raw
     * renderer is not a price validator: it refuses what breaks the document, not what breaks the grammar
     * `exactDecimal` claims. Inventing a numeric check here would be exactly the closed set AAP §0.7.3
     * forbids, and `renderFeedMoney`'s own note records that the brand is the only grammar in play.
     */
    const legalScenario = createScenario({ productPrice: 100 });
    legalScenario.product.price = 'not-a-number' as unknown as ExactDecimal;

    const legalXml = await legalScenario.render();
    expect(legalXml).toContain(itemField('<g:price>not-a-number</g:price>'));

    /*
     * `g:sale_price` is the same helper over the same kind of value, and it is deliberately not
     * forged the same way here, because it cannot be reached: the pair is emitted only when
     * `compareExactDecimal(skuPrice, salePrice) === 1`, and that comparison answers `undefined`
     * rather than a silent `false` for an operand outside the grammar — so a forged sale price
     * omits the pair instead of rendering it. That omission is its own defence, because it is an
     * ordering property of the legacy's own `gt` comparison rather than an added control. It is
     * asserted.
     */
  });

  it('[NET-NEW] escapes the product type description when the fallback branch supplies it', async () => {
    /*
     * The description site is escaped on both of its branches, not only the product one: `:L19` wraps the
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

  it('[NET-NEW] census: six escaped sites, nine raw sites, four fixed-text sites', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));
    const codeText = spanText(source, source.codeSpans);

    /*
     * Why a source-level census is required here, and what it proves that a rendered-output assertion
     * cannot.
     */
    const escapeDeclaration = /function\s+(escape[A-Za-z0-9_]*)\s*\(/.exec(codeText);
    expect(escapeDeclaration).not.toBeNull();
    const escapeHelper = escapeDeclaration === null ? '' : (escapeDeclaration[1] ?? '');
    expect(escapeHelper.length).toBeGreaterThan(0);

    const rawDeclaration = /function\s+(renderRaw[A-Za-z0-9_]*)\s*\(/.exec(codeText);
    expect(rawDeclaration).not.toBeNull();
    const rawHelper = rawDeclaration === null ? '' : (rawDeclaration[1] ?? '');
    expect(rawHelper.length).toBeGreaterThan(0);

    /* Every occurrence in executable text, less the declaration itself, is a call site. */
    expect(codeOffsetsOf(source, `${escapeHelper}(`).length - 1).toBe(6);
    expect(codeOffsetsOf(source, `${rawHelper}(`).length - 1).toBe(9);

    /*
     * And no percent-encoder may exist in the source at all, not merely go unused: a dormant
     * declaration is a path a future field could be wired to by mistake.
     */
    expect(/function\s+encode[A-Za-z0-9_]*\s*\(/.test(codeText)).toBe(false);
    expect(codeText).not.toContain('encodeURIComponent');

    /* The full sixteen-field census, matched against `product.cfm` line by line. */
    const expectedCensus: readonly {
      readonly openTag: string;
      readonly closeTag: string;
      readonly escaped: number;
      readonly rawRendered: number;
      readonly plainLiteral: number;
    }[] = [
      { openTag: '<g:id>', closeTag: '</g:id>', escaped: 1, rawRendered: 0, plainLiteral: 0 },
      { openTag: '<title>', closeTag: '</title>', escaped: 1, rawRendered: 0, plainLiteral: 1 },
      {
        openTag: '<description>',
        closeTag: '</description>',
        escaped: 1,
        rawRendered: 1,
        plainLiteral: 0,
      },
      {
        openTag: '<g:google_product_category>',
        closeTag: '</g:google_product_category>',
        escaped: 0,
        rawRendered: 0,
        plainLiteral: 1,
      },
      {
        openTag: '<g:product_type>',
        closeTag: '</g:product_type>',
        escaped: 1,
        rawRendered: 0,
        plainLiteral: 0,
      },
      { openTag: '<link>', closeTag: '</link>', escaped: 0, rawRendered: 2, plainLiteral: 0 },
      {
        openTag: '<g:image_link>',
        closeTag: '</g:image_link>',
        escaped: 0,
        rawRendered: 1,
        plainLiteral: 0,
      },
      {
        openTag: '<g:additional_image_link>',
        closeTag: '</g:additional_image_link>',
        escaped: 0,
        rawRendered: 1,
        plainLiteral: 0,
      },
      {
        openTag: '<g:condition>',
        closeTag: '</g:condition>',
        escaped: 0,
        rawRendered: 0,
        plainLiteral: 1,
      },
      {
        openTag: '<g:availability>',
        closeTag: '</g:availability>',
        escaped: 0,
        rawRendered: 0,
        plainLiteral: 1,
      },
      { openTag: '<g:price>', closeTag: '</g:price>', escaped: 0, rawRendered: 1, plainLiteral: 0 },
      {
        openTag: '<g:sale_price>',
        closeTag: '</g:sale_price>',
        escaped: 0,
        rawRendered: 1,
        plainLiteral: 0,
      },
      {
        openTag: '<g:sale_price_effective_date>',
        closeTag: '</g:sale_price_effective_date>',
        escaped: 0,
        rawRendered: 1,
        plainLiteral: 0,
      },
      { openTag: '<g:brand>', closeTag: '</g:brand>', escaped: 1, rawRendered: 0, plainLiteral: 0 },
      {
        openTag: '<g:item_group_id>',
        closeTag: '</g:item_group_id>',
        escaped: 1,
        rawRendered: 0,
        plainLiteral: 0,
      },
      {
        openTag: '<g:shipping_weight>',
        closeTag: '</g:shipping_weight>',
        escaped: 0,
        rawRendered: 1,
        plainLiteral: 0,
      },
    ];

    let escapedSites = 0;
    let rawRenderedSites = 0;
    let plainLiteralSites = 0;
    for (const entry of expectedCensus) {
      const escapes = escapeCensus(source, entry.openTag, entry.closeTag, escapeHelper);
      const raws = escapeCensus(source, entry.openTag, entry.closeTag, rawHelper);

      expect(escapes.escaped).toBe(entry.escaped);
      expect(raws.escaped).toBe(entry.rawRendered);

      /*
       * A field may not use both helpers at one site, and the arithmetic below is what states that: the
       * total number of regions is the same whichever helper the census is taken against, so
       * `escaped + rawRendered + plainLiteral` must equal it. A site calling both would make one of the two
       * `escaped` counts too high and fail an assertion above before reaching here.
       */
      const totalRegions = escapes.escaped + escapes.raw;
      expect(raws.escaped + raws.raw).toBe(totalRegions);
      expect(entry.escaped + entry.rawRendered + entry.plainLiteral).toBe(totalRegions);

      escapedSites += entry.escaped;
      rawRenderedSites += entry.rawRendered;
      plainLiteralSites += entry.plainLiteral;
    }

    /*
     * The six escaped and nine raw field-level sites account for every one of the fifteen calls counted
     * above, so neither helper is invoked anywhere except at a field, and no field uses one twice.
     */
    expect(escapedSites).toBe(6);
    expect(rawRenderedSites).toBe(9);

    /*
     * And the four fixed-text sites are accounted for individually: the channel title, and the three
     * fields whose entire content is a literal in this file. None of them interpolates a value, so there is
     * nothing at any of them for either helper to act on.
     */
    expect(plainLiteralSites).toBe(4);
    expect(codeText).toContain('<g:google_product_category></g:google_product_category>');
    expect(codeText).toContain('<g:condition>${CONDITION_VALUE}</g:condition>');
    expect(codeText).toContain('<g:availability>${AVAILABILITY_VALUE}</g:availability>');
    expect(codeText).toContain('<title>${CHANNEL_TITLE}</title>');

    /*
     * And the three interpolated names above are module constants initialised from string literals — not
     * parameters, port reads or field accesses. That is the property which makes leaving them alone correct,
     * so it is asserted rather than assumed. Their VALUES are pinned by the rendered-output cases in §1 and
     * §2; this case only establishes that nothing dynamic reaches these four sites.
     */
    for (const constantName of ['CONDITION_VALUE', 'AVAILABILITY_VALUE', 'CHANNEL_TITLE']) {
      expect(codeText).toMatch(new RegExp(`const ${constantName} = '[^']*';`));
    }
  });
});

/*
 * The escaping property is asserted once, by the first case above: fifteen containments, three raw-
 * path absences, `countOccurrences(xml, ESCAPED_SENTINEL)` of 6 and one percent-encoded occurrence.
 * The title states the property rather than a rendering mode, because there is only one rendering.
 */

/* §8b — Well-formedness under hostile input, read through the parser. */

describe('NET-NEW ProductFeedBuilder — the suite XML reader refuses malformation', () => {
  const wellFormed =
    '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n\t<channel>\n\t\t<title>t</title>\n\t</channel>\n</rss>';

  it('[NET-NEW] accepts the feed grammar, decoding the five predefined entities and numeric references', () => {
    const root = parseFeedDocument(
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>a&amp;b&lt;c&gt;d&quot;e&apos;f&#65;&#x42;</title></channel></rss>',
    );

    expect(root.name).toBe('rss');
    expect(root.attributes).toStrictEqual({
      version: '2.0',
      'xmlns:g': 'http://base.google.com/ns/1.0',
    });
    expect(soleChildText(soleChildNamed(root, 'channel'), 'title')).toBe('a&b<c>d"e\'fAB');
  });

  it('[NET-NEW] refuses a raw angle bracket in character data', () => {
    /*
     * This is the exact malformation an unescaped `<lb>` unit code produced before the current contract.
     */
    expect(() => parseFeedDocument(wellFormed.replace('<title>t<', '<title>1 <lb><'))).toThrow();
  });

  it('[NET-NEW] refuses a bare ampersand in character data', () => {
    /* And this is the malformation an unescaped `1&2` weight produced. */
    expect(() => parseFeedDocument(wellFormed.replace('>t<', '>1&2<'))).toThrow();
  });

  it('[NET-NEW] refuses an unknown entity reference rather than passing it through', () => {
    expect(() => parseFeedDocument(wellFormed.replace('>t<', '>&nbsp;<'))).toThrow();
  });

  it('[NET-NEW] refuses a mismatched end tag', () => {
    expect(() => parseFeedDocument(wellFormed.replace('</title>', '</titel>'))).toThrow();
  });

  it('[NET-NEW] refuses a self-closing element, a comment, a processing instruction and a CDATA section', () => {
    expect(() => parseFeedDocument(wellFormed.replace('<title>t</title>', '<title/>'))).toThrow();
    expect(() => parseFeedDocument(wellFormed.replace('<title>t</title>', '<!-- t -->'))).toThrow();
    expect(() =>
      parseFeedDocument(wellFormed.replace('<title>t</title>', '<?php echo 1; ?>')),
    ).toThrow();
    expect(() => parseFeedDocument(wellFormed.replace('>t<', '><![CDATA[t]]><'))).toThrow();
  });

  it('[NET-NEW] refuses an unquoted attribute value and content after the root element', () => {
    expect(() => parseFeedDocument(wellFormed.replace('version="2.0"', 'version=2.0'))).toThrow();
    expect(() => parseFeedDocument(`${wellFormed}<rss></rss>`)).toThrow();
  });

  it('[NET-NEW] refuses a duplicate attribute and an unterminated element', () => {
    expect(() =>
      parseFeedDocument(wellFormed.replace('version="2.0"', 'version="2.0" version="2.0"')),
    ).toThrow();
    expect(() => parseFeedDocument(wellFormed.replace('</rss>', ''))).toThrow();
  });
});

describe('NET-NEW ProductFeedBuilder — no input can change the document shape', () => {
  it('[NET-NEW] emits a conforming sub-delimiter host raw in the channel link and description', async () => {
    const scenario = createScenario({ host: CONFORMING_HOSTILE_HOST });

    const xml = await scenario.render();
    const channel = parseFeedChannel(xml);

    /* The channel pair round-trips to the composed value, every sub-delimiter intact. */
    expect(soleChildText(channel, 'link')).toBe(`http://${CONFORMING_HOSTILE_HOST}`);
    expect(soleChildText(channel, 'description')).toBe(
      `Google Product Feed for http://${CONFORMING_HOSTILE_HOST}`,
    );
    /* On the wire there is no entity anywhere: `:L14` and `:L15` are raw sinks. */
    expect(xml).toContain(channelField(`<link>http://${CONFORMING_HOSTILE_HOST}</link>`));
    expect(xml).not.toContain('&amp;');
    expect(xml).not.toContain('&apos;');
  });

  it('[NET-NEW] the builder refuses a conforming host whose ampersand would break the channel pair', async () => {
    /*
     * The complement of the case above, and the reason withdrawing the escape costs nothing. `&` is an RFC
     * 3986 sub-delimiter, so `src/config/env.ts` accepts it and `validateFeedHostAuthority` — which gates
     * only the five origin-moving characters — permits it too. Raw emission would then put a bare ampersand
     * into all five URLs, and a bare ampersand is a fatal XML well-formedness error: the legacy's own
     * document would not parse. So the value is refused, and nothing is published.
     */
    const scenario = createScenario({ host: "a&b'c.example" });

    await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
  });

  it('[NET-NEW] emits the same host raw everywhere it is composed into an item URL', async () => {
    const scenario = createScenario({
      host: CONFORMING_HOSTILE_HOST,
      urlTitle: 'nike-air',
      imagePathsByImageFile: { [SKU_IMAGE_FILE]: '/product/default/a.jpg' },
    });

    const xml = await scenario.render({ productImages: [{ imagePath: '/product/default/b.jpg' }] });
    const item = parseSoleFeedItem(xml);
    const prefix = `http://${CONFORMING_HOSTILE_HOST}`;

    expect(xml).toContain(
      itemField(`<link>${prefix}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/</link>`),
    );
    expect(xml).toContain(
      itemField(`<g:image_link>${prefix}/product/default/a.jpg</g:image_link>`),
    );
    /*
     * Read through the parser as well as the raw string: the item link round-trips to the composed value
     * with every sub-delimiter of the host intact, which is the property raw emission is supposed to have.
     */
    expect(soleChildText(item, 'link')).toBe(
      `${prefix}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/`,
    );
    expect(xml).toContain(
      itemField(
        `<g:additional_image_link>${prefix}/product/default/b.jpg</g:additional_image_link>`,
      ),
    );
    /*
     * Five places compose the host — the channel link, the channel description, the item link,
     * `g:image_link` and the one `g:additional_image_link` — and every one carries it raw. The
     * count is measured rather than reasoned: a first draft of this assertion said four, having
     * forgotten that the channel description interpolates the host as well as the channel link. A
     * revision escaped all five and counts the raw form here, and the count is the same either way
     * — which is why the form, not the count, is the subject.
     */
    expect(countOccurrences(xml, CONFORMING_HOSTILE_HOST)).toBe(5);
    /*
     * And no percent-encoded form appears: the path carries no encoder, and the host never had one.
     */
    expect(xml).not.toContain(encodeURIComponent(CONFORMING_HOSTILE_HOST));
  });

  it('[NET-NEW] REFUSES an origin-moving host, atomically, before any byte is produced', async () => {
    /*
     * The sharpest exposure in this file, now closed, and the case that went through the most revisions.
     * {@link ProductFeedRenderContext.host} is a plain `string` with no brand, and every one of the five
     * absolute URLs is composed from it. A host carrying `/`, `@`, `?` or `#` moves the origin of every URL
     * in the document; one carrying `<` breaks the channel out of its own element.
     */
    const hostileHost = 'legit.example@attacker.example';
    const scenario = createScenario({ host: hostileHost });

    await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
  });

  it('[NET-NEW] refuses every origin-moving character, and admits the conforming authority forms', async () => {
    /*
     * The gate's whole alphabet, asserted rather than read off its docblock. Each refused character has a
     * distinct mechanism: `@` introduces userinfo; `/` and `\\` end the authority and begin a path; `?` and
     * `#` begin a query and a fragment; whitespace and control characters are admitted in no authority. A
     * blank host is refused too, because five URLs with no authority resolve nowhere.
     */
    for (const refused of [
      'legit.example@attacker.example',
      'legit.example/attacker',
      'legit.example\\attacker',
      'legit.example?q=1',
      'legit.example#frag',
      'legit example',
      'legit.example\u0009',
      '   ',
    ]) {
      await expect(createScenario({ host: refused }).render()).rejects.toBeInstanceOf(
        DataIntegrityError,
      );
    }

    for (const admitted of ['[2001:db8::1]', 'catalog.example.test:8080', 'under_score.example']) {
      await expect(createScenario({ host: admitted }).render()).resolves.toContain(
        `<link>http://${admitted}</link>`,
      );
    }
  });

  it('[NET-NEW] refuses a URL path that is not same-origin relative, at all three sinks', async () => {
    /*
     * The path half of the same finding, and the route it closes is the missing leading slash. A stored
     * path of `attacker.example/x` appended to `http://<host>` yields the authority `<host>attacker.example`
     * — a different origin, reached without any delimiter the host gate inspects. `//x` is refused as well,
     * on the narrower ground that RFC 3986 §4.2 classifies it as a network-path reference rather than the
     * absolute-path reference constrains these values to.
     */
    for (const hostilePath of ['attacker.example/x.jpg', '//attacker.example/x.jpg', 'x.jpg']) {
      /* `g:image_link`: the SKU's composed path, seeded directly. */
      await expect(
        createScenario({
          imagePathsByImageFile: { [SKU_IMAGE_FILE]: hostilePath },
        }).render(),
      ).rejects.toBeInstanceOf(DataIntegrityError);

      /*
       * Each `g:additional_image_link`: the image's own path, echoed by the unseeded resize answer.
       */
      await expect(
        createScenario().render({ productImages: [{ imagePath: hostilePath }] }),
      ).rejects.toBeInstanceOf(DataIntegrityError);
    }

    /*
     * And the conforming forms still render at all three sinks, including a path carrying a dot segment —
     * dot-segment resolution stays same-origin, so it is not a rebasing route and is not refused.
     */
    await expect(
      createScenario({
        imagePathsByImageFile: { [SKU_IMAGE_FILE]: '/product/default/../default/a.jpg' },
      }).render({ productImages: [{ imagePath: '/product/default/b.jpg' }] }),
    ).resolves.toContain('<g:image_link>');
  });

  it('[NET-NEW] keeps one item per SKU when every ESCAPED field is hostile', async () => {
    /*
     * The breakout case, now split along the census. Every value here targets one of the six sinks
     * `product.cfm` escapes, so every one of them is escaped by the port too and must come back as
     * character data — one item, one child per field, whatever the payload attempted.
     */
    const scenario = createScenario({
      host: CONFORMING_HOSTILE_HOST,
      skuCode: '</item><item><g:id>a',
      calculatedTitle: '</title><g:id>b',
      productDescription: ']]></description><g:id>c',
      productTypeName: '<g:id>d</g:id>',
      brandName: '"><g:id>e',
      productCode: '&\'<>"',
      urlTitle: 'nike-air',
    });

    const xml = await scenario.render();
    const channel = parseFeedChannel(xml);
    const item = parseSoleFeedItem(xml);

    /*
     * Exactly one item, and exactly one g:id inside it, no matter how many the payloads tried to open.
     */
    expect(childrenNamed(channel, 'item')).toHaveLength(1);
    expect(childrenNamed(item, 'g:id')).toHaveLength(1);
    expect(soleChildText(item, 'g:id')).toBe('</item><item><g:id>a');
    expect(soleChildText(item, 'title')).toBe('</title><g:id>b');
    expect(soleChildText(item, 'description')).toBe(']]></description><g:id>c');
    expect(soleChildText(item, 'g:product_type')).toBe('<g:id>d</g:id>');
    expect(soleChildText(item, 'g:brand')).toBe('"><g:id>e');
    expect(soleChildText(item, 'g:item_group_id')).toBe('&\'<>"');

    /*
     * The `]]>` in the description is the sharpest one here, and it round-trips because the sink is
     * escaped: the `>` becomes `&gt;`, so the sequence cannot terminate anything. At a raw sink the same
     * value is refused instead — the two treatments are asserted side by side in §8, and this is the half
     * where escaping is the legacy's own behaviour.
     */
    expect(xml).toContain(']]&gt;&lt;/description&gt;');

    /* The item link is unaffected: a legitimate `urlTitle` travels raw, byte-for-byte. */
    expect(soleChildText(item, 'link')).toBe(
      `http://${CONFORMING_HOSTILE_HOST}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/`,
    );
    expect(childrenNamed(item, 'link')).toHaveLength(1);
  });

  it('[NET-NEW] every hostile raw sink field is refused rather than neutralised', async () => {
    /* The other half of the breakout case above, and the one that carries the finding. */
    const refusedSeeds: readonly (() => ReturnType<typeof createScenario>)[] = [
      () => createScenario({ urlTitle: '../../etc/passwd?a=1&b=2' }),
      () =>
        createScenario({
          settings: [{ settingName: 'skuShippingWeight', value: '</g:shipping_weight><g:id>f' }],
        }),
      () =>
        createScenario({
          settings: [{ settingName: 'skuShippingWeightUnitCode', value: '&&&' }],
        }),
    ];

    for (const buildScenario of refusedSeeds) {
      await expect(buildScenario().render()).rejects.toBeInstanceOf(DataIntegrityError);
    }

    /*
     * And the traversal without the query is published, which is the proof that the refusal is shaped by
     * Well-formedness and not by taste. `../../etc/passwd` carries no `&`, no `<` and no `]]>`, so it goes
     * out raw and unmodified — the same bytes `product.cfm` emits. Reading this as a defect in the port
     * rather than in the legacy would be misreading it: the port's contract is parity plus parseability, and
     * this value satisfies both.
     */
    const traversalScenario = createScenario({ urlTitle: '../../etc/passwd' });
    const traversalXml = await traversalScenario.render();
    const traversalItem = parseSoleFeedItem(traversalXml);

    expect(soleChildText(traversalItem, 'link')).toBe(
      `http://${RENDER_HOST}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/../../etc/passwd/`,
    );
    expect(childrenNamed(traversalItem, 'link')).toHaveLength(1);
  });
});

/* §9 — The guards on the builder's own public render surface. */

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

/*
 * The two feed render bounds — per-record image expansion and response size The port caps per-
 * record image expansion and response bytes. Both
 * are bounded here, both by an operator-stated figure, and neither by a number this port authors.
 */

describe('NET-NEW ProductFeedBuilder — the per-record image ceiling', () => {
  /**
   * Builds `count` additional product images, each with a distinct path.
   *
   * @param count how many images the record should carry
   * @returns the image list, in input order.
   */
  function manyImages(count: number): readonly ProductFeedImage[] {
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) => ({
        imagePath: `/custom/images/product/extra-${String(index)}.jpg`,
      })),
    );
  }

  it('[NET-NEW] refuses an over-ceiling record BEFORE resolving a single image path', async () => {
    /*
     * The ordering is the fix, not the refusal. `product.cfm:L24` iterates the product's whole image
     * collection with no ceiling, and this port issues one image-port resolution per image per record — so
     * the cost of a single record is `images` port calls. The ceiling is therefore applied before the loop,
     * and an over-budget record calls the port zero times rather than n-plus-one times before refusing.
     */
    const scenario = createScenario({ renderBudget: createProductFeedRenderBudget(3, 10_000_000) });

    const error = await captureRejection(scenario.render({ productImages: manyImages(4) }));

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).context).toMatchObject({
      images: 4,
      maximumImagesPerRecord: 3,
      locator: 'integrationServices/google/views/feed/product.cfm:L24',
    });

    /*
     * Zero of the record's own images were resolved. This is the assertion the case exists for: a ceiling
     * checked inside the loop would have made three port calls before refusing, so it would satisfy a
     * rejects-assertion and still leave most of the cost unbounded.
     */
    const extraRequests = resizeRequests(scenario.images).filter((request) =>
      request.imagePath.includes('extra-'),
    );
    expect(extraRequests).toHaveLength(0);
  });

  it('[NET-NEW] admits a record landing exactly AT the ceiling, emitting every image in input order', async () => {
    /*
     * The admitting side, so the ceiling bounds rather than refuses, and the admitted document is
     * byte-identical to the unbudgeted one: three images, three `g:additional_image_link` elements, in the
     * order they were supplied. That is the concrete form of "the ceiling changes no admitted request".
     */
    const scenario = createScenario({ renderBudget: createProductFeedRenderBudget(3, 10_000_000) });

    const xml = await scenario.render({ productImages: manyImages(3) });
    const items = parseFeedItems(xml);
    const [item] = items;
    expect(item).toBeDefined();
    if (item === undefined) {
      throw new Error('The feed document carries no first item.');
    }

    const emitted = childrenNamed(item, 'g:additional_image_link');
    expect(emitted).toHaveLength(3);
    expect(emitted.map((element) => element.text)).toStrictEqual([
      `${ABSOLUTE_URL_PREFIX}/custom/images/product/extra-0.jpg`,
      `${ABSOLUTE_URL_PREFIX}/custom/images/product/extra-1.jpg`,
      `${ABSOLUTE_URL_PREFIX}/custom/images/product/extra-2.jpg`,
    ]);
  });

  it('[NET-NEW] refuses with NO image ceiling stated, naming the variable, resolving nothing', async () => {
    /*
     * The fail-closed half. A deliberately tiny record — one image — so the case cannot pass because the
     * record happened to be large: the refusal is about the absence of a figure, not the size of the work.
     */
    const scenario = createScenario({ renderBudget: UNSTATED_FEED_RENDER_BUDGET });

    const error = await captureRejection(scenario.render({ productImages: manyImages(1) }));

    expect((error as { message: string }).message).toMatch(
      /CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD/,
    );
    expect(
      resizeRequests(scenario.images).filter((request) => request.imagePath.includes('extra-')),
    ).toHaveLength(0);
  });

  it('[NET-NEW] refuses a USELESS figure when the budget is BUILT, not when a render first runs', () => {
    /*
     * A wiring error should present at wiring time. Zero would refuse every record — including one with no
     * additional images at all — rather than bounding the expansion.
     */
    expect(() => createProductFeedRenderBudget(0, 10)).toThrow(/positive safe integer/);
    expect(() => createProductFeedRenderBudget(-1, 10)).toThrow(/positive safe integer/);
    expect(() => createProductFeedRenderBudget(1.5, 10)).toThrow(/positive safe integer/);
    expect(() => createProductFeedRenderBudget(10, 0)).toThrow(/positive safe integer/);
    expect(() => createProductFeedRenderBudget(10, Number.NaN)).toThrow(/positive safe integer/);
    expect(() => createProductFeedRenderBudget(10, Number.POSITIVE_INFINITY)).toThrow(
      /positive safe integer/,
    );

    // And a legitimate pair builds, so the guard is not simply refusing everything.
    const budget = createProductFeedRenderBudget(1, 1);
    expect(budget.resolveMaximumImagesPerRecord()).toBe(1);
    expect(budget.resolveMaximumResponseBytes()).toBe(1);
  });
});

describe('NET-NEW ProductFeedBuilder — the document byte ceiling', () => {
  it('[NET-NEW] REFUSES an over-budget document rather than truncating it', async () => {
    /*
     * The assertion that matters is that nothing is returned. A "cap" that truncated would answer a
     * document missing its closing `</channel></rss>`, which a merchant processor either rejects outright
     * or — worse — acts on as a partial catalog. So the ceiling refuses and names the size it measured.
     */
    const scenario = createScenario({ renderBudget: createProductFeedRenderBudget(100, 1) });

    const error = await captureRejection(scenario.render());

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).toMatch(/truncated, malformed document/);

    /*
     * The measured size and the ceiling are both reported, so an operator can pick a figure rather than
     * guess one — and the measured size is the real byte length, greater than the ceiling it broke.
     */
    const context = (error as DomainError).context as Record<string, unknown>;
    expect(context.maximumResponseBytes).toBe(1);
    expect(typeof context.documentBytes).toBe('number');
    expect(context.documentBytes as number).toBeGreaterThan(1);
    expect(context.records).toBe(1);
  });

  it('[NET-NEW] measures BYTES rather than characters, so multi-byte content is charged honestly', async () => {
    /*
     * The response goes out as UTF-8, so a ceiling measured in JavaScript string length would under-charge
     * every non-ASCII document — a product name in Japanese costs three bytes per character and one unit of
     * length. The case states a ceiling between the two measures and requires a refusal: it passes only if
     * bytes are what is counted.
     */
    const multiByteTitle = 'あ'.repeat(400);
    const scenario = createScenario({
      calculatedTitle: multiByteTitle,
      renderBudget: createProductFeedRenderBudget(100, 1200),
    });

    const error = await captureRejection(scenario.render());
    const context = (error as DomainError).context as Record<string, unknown>;

    /*
     * Four hundred three-byte characters is 1,200 bytes of title alone, so the finished document is over the
     * 1,200-byte ceiling on byte measurement and comfortably under it on character measurement.
     */
    expect(context.documentBytes as number).toBeGreaterThan(1200);
  });

  it('[NET-NEW] admits a document under the ceiling, byte-for-byte unchanged', async () => {
    /*
     * The admitting side, and the strongest available form of "the ceiling changes no admitted response":
     * The same scenario rendered with a generous ceiling and with a ceiling just above the measured size
     * produces the identical document. So the bound is a gate and never a filter.
     */
    const unbudgeted = await createScenario().render();
    const measured = Buffer.byteLength(unbudgeted, 'utf8');

    const tight = await createScenario({
      renderBudget: createProductFeedRenderBudget(100, measured),
    }).render();

    expect(tight).toBe(unbudgeted);

    /*
     * And exactly-at-the-ceiling is admitted — the comparison is strictly greater-than — while one byte
     * less refuses. Off-by-one in either direction fails one of these two.
     */
    await expect(
      createScenario({ renderBudget: createProductFeedRenderBudget(100, measured - 1) }).render(),
    ).rejects.toThrow(/truncated, malformed document/);
  });

  it('[NET-NEW] refuses with NO byte ceiling stated, naming the variable', async () => {
    /*
     * Fail-closed on the second feed bound too. The image ceiling is stated here and only the byte ceiling
     * withheld, which is what proves the byte resolver is fail-closed in its own right rather than merely
     * shadowed by the image one — the image ceiling is reached first, per record.
     */
    const scenario = createScenario({
      renderBudget: createProductFeedRenderBudget(100, undefined),
    });

    await expect(scenario.render()).rejects.toThrow(/CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES/);
  });
});

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
    expect(error).toBeInstanceOf(DomainError);
    /*
     * Not the data-integrity subclass: a SKU with no product is a selection defect, not a broken row.
     */
    expect(error).not.toBeInstanceOf(DataIntegrityError);
    expect(error.message.length).toBeGreaterThan(0);
    expect((error as DomainError).context).toMatchObject({
      locator: 'integrationServices/google/views/feed/product.cfm:L18',
    });
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
     * The other face of the `isNull` / `len` inconsistency. `:L21` dereferences
     * `product.getProductType().getSimpleRepresentation()` with no guard, while `:L32` guards the brand
     * association with `isNull`. Two associations one line apart, one guarded and one not: an absent brand
     * quietly drops an element, an absent product type fails the render outright. Both outcomes are
     * preserved, and neither is harmonised into the other.
     */
    expect(error).toBeInstanceOf(DataIntegrityError);
    expect(error.message.length).toBeGreaterThan(0);
    /*
     * The locator is `:L19`, not `:L21`, and the difference is evidence rather than bookkeeping. `:L21`'s
     * `<g:product_type>` is the dereference this case's own docblock quotes, and it was the first guess
     * here — it is wrong, because `:L19`'s `<description>` reaches the association first. Its `cfelseif`
     * tests `len(local.sku.getProduct().getProductType().getProductTypeDescription())`, so a product with
     * no description of its own dereferences the product type one field earlier than `<g:product_type>`
     */
    expect((error as DomainError).context).toMatchObject({
      locator: 'integrationServices/google/views/feed/product.cfm:L19',
    });
  });

  it('[NET-NEW] carries a non-numeric UTC hour offset into the document instead of refusing it', async () => {
    const harmless = createScenario({ utcHourOffset: 'not-an-offset' });

    /*
     * With no sale, the offset is never emitted at all — the legacy template only interpolated
     * `getTimeZoneInfo().utcHourOffset` inside the conditional block at `:L28-L31`.
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

    const onSaleXml = await onSale.render();

    /*
     * The render succeeds. A builder that read the offset as a number of hours would shift both
     * instants by it and raise when the text was not
     * finite. `:L30` does none of that: it formats each value's own components and interpolates the
     * offset text straight in, with no parse, no test and no failure mode. So a non-numeric offset is a
     * malformed label on a well-formed timestamp — which is exactly what the legacy would have emitted —
     * and refusing to render it would foreclose a legacy outcome (AAP §0.8.2 guideline 4, §0.6.7.
     */
    expect(elementContent(onSaleXml, 'g:sale_price_effective_date')).toBe(
      `${EXPECTED_LOCAL_TIMESTAMP_START}-not-an-offset/${EXPECTED_LOCAL_TIMESTAMP_END}-not-an-offset`,
    );
    /*
     * Twice per range, exactly as `:L30` interpolates it — and never escaped, since `:L30` escapes it not.
     */
    expect(countOccurrences(onSaleXml, 'not-an-offset')).toBe(2);
  });

  it('[NET-NEW] renders an empty date and time for an absent expiration while keeping the T, hyphen and offset', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    /*
     * `model/entity/Sku.cfc:L560-L565` returns the empty string when the sale-price detail carries no
     * expiration key, and `:L30` feeds that straight into `dateFormat`/`timeFormat`. A lenient CFML engine
     * renders nothing for both, leaving the `T`, the literal hyphen and the offset in place — the branch
     * the builder reproduces, with the engine disagreement carried as a TODO(parity) rather than resolved.
     * No date is invented and the render instant is not substituted for the missing expiration, which is
     * the substitution this assertion exists to forbid.
     */
    scenario.seedSaleDetails({ [SKU_ID]: buildSalePriceDetails({ salePrice: 79.5 }) });

    const xml = await scenario.render();

    expect(elementContent(xml, 'g:sale_price_effective_date')).toBe(
      `${EXPECTED_EFFECTIVE_DATE_START}/T-${RAW_UTC_HOUR_OFFSET}`,
    );
    expect(xml).not.toContain(
      `${EXPECTED_LOCAL_TIMESTAMP_START}-5/${EXPECTED_LOCAL_TIMESTAMP_START}`,
    );
  });

  it('[NET-NEW] the builder refuses a value XML 1.0 forbids rather than publishing an unparseable feed', async () => {
    /* The one exposure this port used to carry, and now closes. */
    const forbiddenTitles = [
      /*
       * A lone high surrogate, and a lone low one: what a truncated or mis-sliced string carries.
       */
      'Nike \ud800 Air',
      'Nike \udc00 Air',
      /* A C0 control that is not tab, line feed or carriage return. */
      'Nike \u0001 Air',
      /* The two non-characters at the end of the BMP. */
      'Nike \ufffe Air',
      'Nike \uffff Air',
    ];

    for (const calculatedTitle of forbiddenTitles) {
      const scenario = createScenario({ calculatedTitle });

      await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
    }

    /*
     * And the three whitespace controls `Char` admits still travel, unescaped and unaltered, which is the
     * boundary that makes the gate a transcription rather than a preference. Tab, line feed and carriage
     * return are legal XML content, the legacy emits them, and so does this.
     */
    for (const whitespace of ['\t', '\n', '\r']) {
      const scenario = createScenario({ calculatedTitle: `Nike${whitespace}Air` });

      await expect(scenario.render()).resolves.toContain(
        itemField(`<title>Nike${whitespace}Air</title>`),
      );
    }

    /*
     * And a well-formed surrogate pair survives byte-for-byte, which is why the scan iterates code points
     * rather than code units. An emoji is two code units and one legal code point; a code-unit scan would
     * see two surrogate halves and refuse a perfectly valid product title.
     */
    const astralScenario = createScenario({ calculatedTitle: 'Nike \u{1f600} Air' });

    await expect(astralScenario.render()).resolves.toContain(
      itemField('<title>Nike \u{1f600} Air</title>'),
    );
  });

  it('[NET-NEW] emits a legal supplementary character unchanged', async () => {
    /*
     * A supplementary character is encoded as a surrogate pair and is perfectly legal in XML 1.0,
     * so the escaper must leave it alone: it carries none of the four characters `htmlEditFormat`
     * substitutes. A representability gate would have to pair surrogates rather than walk code
     * units, and this case pins that; it is worth asserting either way, because an escaper
     * implemented over code units instead of characters would be the next thing to mangle it.
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
     * with a literal tab that is emitted rather than swallowed. An escaper that turned them into character
     * references would change stored product copy on its way out, which is the difference between encoding
     * a character that has an escaped form and rewriting one that does not need it.
     */
    const scenario = createScenario({ productDescription: 'first\tsecond\r\nthird' });

    const xml = await scenario.render();

    expect(xml).toContain('<description>first\tsecond\r\nthird</description>');
    expect(xml).not.toContain('&#9;');
    expect(xml).not.toContain('&#10;');
    expect(xml).not.toContain('&#13;');
  });
});

/* §10 — Parsing the finished document, with hostile values in every dynamic sink. */

/**
 * A parsed element: its qualified name, its attributes, its element children and its own resolved text.
 */
interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** This element's character data with every reference resolved, excluding its children's. */
  readonly text: string;
}

/**
 * Refused input. A distinct type so a case can require a scanner refusal rather than any old `error`.
 */
class XmlScanError extends Error {}

/**
 * Scan `source` as a whole document and answer its root element.
 *
 * @param source the complete rendered feed
 * @returns the root element, with references resolved
 * @throws {XmlScanError} for anything outside the accepted subset described in this section's header.
 */
function parseXmlDocument(source: string): XmlElement {
  let at = 0;

  const fail = (what: string): never => {
    const from = Math.max(0, at - 48);
    throw new XmlScanError(
      `refused ${what} at offset ${String(at)}: …${source.slice(from, at + 48)}…`,
    );
  };

  const skipWhitespace = (): number => {
    const start = at;
    while (at < source.length && (source[at] ?? '').search(/[ \t\r\n]/) === 0) {
      at += 1;
    }
    return at - start;
  };

  const readName = (): string => {
    const start = at;
    if (!/[A-Za-z_:]/.test(source.charAt(at))) {
      return fail('a start tag whose name does not begin with a name character');
    }
    at += 1;
    while (at < source.length && /[A-Za-z0-9._:-]/.test(source.charAt(at))) {
      at += 1;
    }
    return source.slice(start, at);
  };

  /**
   * Resolve one reference, starting at the `&`. every ampersand in a conforming document begins one.
   */
  const readReference = (): string => {
    const terminator = source.indexOf(';', at);
    if (terminator === -1 || terminator - at > 12) {
      return fail('a bare & — in XML every ampersand must begin a reference');
    }
    const body = source.slice(at + 1, terminator);
    at = terminator + 1;
    const predefined = new Map<string, string>([
      ['amp', '&'],
      ['lt', '<'],
      ['gt', '>'],
      ['quot', '"'],
      ['apos', "'"],
    ]);
    const named = predefined.get(body);
    if (named !== undefined) {
      return named;
    }
    const decimal = /^#([0-9]+)$/.exec(body);
    const hexadecimal = /^#x([0-9A-Fa-f]+)$/.exec(body);
    const codePoint =
      decimal !== null
        ? Number(decimal[1])
        : hexadecimal !== null
          ? Number.parseInt(hexadecimal[1] ?? '', 16)
          : undefined;
    if (codePoint === undefined || !Number.isInteger(codePoint) || codePoint > 0x10ffff) {
      return fail(`an undeclared entity reference &${body};`);
    }
    return String.fromCodePoint(codePoint);
  };

  const readAttributeValue = (): string => {
    const quote = source.charAt(at);
    if (quote !== '"' && quote !== "'") {
      return fail('an unquoted attribute value');
    }
    at += 1;
    let value = '';
    for (;;) {
      if (at >= source.length) {
        return fail('an unterminated attribute value');
      }
      const character = source.charAt(at);
      if (character === quote) {
        at += 1;
        return value;
      }
      if (character === '<') {
        return fail('a raw < inside an attribute value');
      }
      if (character === '&') {
        value += readReference();
        continue;
      }
      value += character;
      at += 1;
    }
  };

  const readElement = (): XmlElement => {
    if (source.charAt(at) !== '<') {
      return fail('character data where an element was expected');
    }
    at += 1;
    if (source.charAt(at) === '!' || source.charAt(at) === '?') {
      return fail(
        'a comment, CDATA section, DOCTYPE or processing instruction, none of which this builder emits',
      );
    }
    const name = readName();
    const attributes = new Map<string, string>();
    for (;;) {
      const spacing = skipWhitespace();
      const character = source.charAt(at);
      if (character === '>') {
        at += 1;
        break;
      }
      if (character === '/') {
        if (source.charAt(at + 1) !== '>') {
          return fail('a stray / inside a start tag');
        }
        at += 2;
        return { name, attributes, children: [], text: '' };
      }
      if (spacing === 0) {
        return fail('two attributes with no whitespace between them');
      }
      const attributeName = readName();
      if (attributes.has(attributeName)) {
        return fail(`a duplicate ${attributeName} attribute`);
      }
      skipWhitespace();
      if (source.charAt(at) !== '=') {
        return fail(`an attribute ${attributeName} with no value`);
      }
      at += 1;
      skipWhitespace();
      attributes.set(attributeName, readAttributeValue());
    }

    const children: XmlElement[] = [];
    let text = '';
    for (;;) {
      if (at >= source.length) {
        return fail(`an unclosed <${name}>`);
      }
      if (source.startsWith('</', at)) {
        at += 2;
        const closing = readName();
        skipWhitespace();
        if (source.charAt(at) !== '>') {
          return fail(`a malformed </${closing}>`);
        }
        at += 1;
        if (closing !== name) {
          return fail(`</${closing}> where </${name}> was expected`);
        }
        return { name, attributes, children, text };
      }
      const character = source.charAt(at);
      if (character === '<') {
        children.push(readElement());
        continue;
      }
      if (character === '&') {
        text += readReference();
        continue;
      }
      if (source.startsWith(']]>', at)) {
        return fail('a literal ]]> in character data');
      }
      text += character;
      at += 1;
    }
  };

  skipWhitespace();
  if (source.startsWith('<?xml', at)) {
    const close = source.indexOf('?>', at);
    if (close === -1) {
      fail('an unterminated XML declaration');
    }
    at = close + 2;
  }
  skipWhitespace();
  const root = readElement();
  skipWhitespace();
  if (at !== source.length) {
    fail('content after the root element');
  }
  return root;
}

/** Every element named `name`, in document order, anywhere beneath and including `root`. */
function findElements(root: XmlElement, name: string): readonly XmlElement[] {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement): void => {
    if (node.name === name) {
      found.push(node);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(root);
  return found;
}

/** The one element named `name`; fails the case loudly when there is not exactly one. */
function soleElement(root: XmlElement, name: string): XmlElement {
  const found = findElements(root, name);
  expect(found).toHaveLength(1);
  const only = found[0];
  if (only === undefined) {
    throw new Error(`the parsed document has no <${name}>`);
  }
  return only;
}

/* One hostile value, carrying every shape that matters, used in every text sink at once. */
const HOSTILE_TEXT = '</title><injected>pwned</injected> & &amp; <!-- c --> "q" \'a\' ]]>';

/**
 * A host with three of the four escapable characters, and no colon, so the authority stays interpretable.
 */
const HOSTILE_HOST = 'h&<>st';

/*
 * There is no `encodePathLikeTheBuilder`. A local mirror of a per-segment percent-encoder would let
 * the three URL sinks be asserted against an encoded form, but the builder has no such encoder:
 * Encoding would change the emitted bytes of three fields `product.cfm` publishes unmodified,
 * including innocuous paths where `%` becomes `%25`. So there is nothing to mirror
 * and the URL sinks are now asserted against their stored path, which is a stronger expectation because it
 * is written by hand rather than computed by a re-implementation.
 */

describe('NET-NEW ProductFeedBuilder — parsed well-formedness over hostile values', () => {
  it('[NET-NEW] parses an ordinary rendered document, so a scanner that refuses everything cannot pass', async () => {
    /*
     * The control for the two cases below. Without it, a scanner with an inverted condition — or one that
     * refused the tab indentation, the `g:` prefixes or the `xmlns:g` declaration — would make every hostile
     * case pass for the wrong reason.
     */
    const scenario = createScenario({ productPrice: 100, skuCode: 'CONTROL-1' });

    const root = parseXmlDocument(
      await scenario.render({ productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }] }),
    );

    expect(root.name).toBe('rss');
    expect(root.attributes.get('version')).toBe('2.0');
    expect(root.attributes.get('xmlns:g')).toBe('http://base.google.com/ns/1.0');
    expect(soleElement(root, 'channel').children.map((child) => child.name)).toStrictEqual([
      'title',
      'link',
      'description',
      'item',
    ]);
    expect(soleElement(root, 'g:id').text).toBe('CONTROL-1');
    expect(soleElement(root, 'g:condition').text).toBe('new');
    expect(soleElement(root, 'g:availability').text).toBe('in stock');
    /*
     * The always-empty category element parses as a present element with no content, not as absent.
     */
    expect(soleElement(root, 'g:google_product_category').text).toBe('');
  });

  it('[NET-NEW] CWE-91 keeps a hostile value in every ESCAPED sink as character data', async () => {
    /*
     * Escaped sinks only. A raw sink refuses a hostile value rather than neutralising it, so a round trip
     * cannot be asserted there; the nine raw sinks are covered by the companion case below.
     */
    const scenario = createScenario({
      host: CONFORMING_HOSTILE_HOST,
      skuCode: HOSTILE_TEXT,
      calculatedTitle: HOSTILE_TEXT,
      productDescription: HOSTILE_TEXT,
      productTypeName: HOSTILE_TEXT,
      brandName: HOSTILE_TEXT,
      productCode: HOSTILE_TEXT,
      urlTitle: 'nike-air',
      productPrice: 100,
      imagePathsByImageFile: { [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH },
    });

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    /*
     * First: the document is well-formed at all. Everything below depends on this not having thrown.
     */
    const root = parseXmlDocument(xml);

    /*
     * Negatively: the element the value tried to open does not exist anywhere in the parsed tree, and the
     * document's structure is exactly the structure of a one-item feed.
     */
    expect(findElements(root, 'injected')).toHaveLength(0);
    expect(findElements(root, 'channel')).toHaveLength(1);
    expect(findElements(root, 'item')).toHaveLength(1);
    expect(findElements(root, 'title')).toHaveLength(2);

    /*
     * Positively: every escaped sink hands the original bytes back. This is the round trip — escaped on the
     * way out, resolved by the parser on the way in — and it is a stronger statement than "no markup
     * appeared", because it also rules out an implementation that sanitised the value by dropping characters
     * from it.
     */
    expect(soleElement(root, 'g:id').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:product_type').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:brand').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:item_group_id').text).toBe(HOSTILE_TEXT);

    /*
     * `title` and `description` each occur twice in a one-item feed — once at channel level and once at item
     * level — so they are reached through their parent rather than by name across the whole tree. Doing that
     * is the point rather than a mechanical necessity: it asserts the two levels are still distinct elements
     * after a value tried to close one of them, which a whole-tree lookup could not show. The channel pair
     * carries the clean host here, which is what keeps this document parseable at all.
     */
    const channel = soleElement(root, 'channel');
    const item = soleElement(root, 'item');
    expect(channel.children.map((child) => child.name)).toStrictEqual([
      'title',
      'link',
      'description',
      'item',
    ]);
    const [channelTitle, channelLink, channelDescription] = channel.children;
    expect(channelTitle?.text).toBe('Slatwall Product Feed');
    expect(channelLink?.text).toBe(`http://${CONFORMING_HOSTILE_HOST}`);
    expect(channelDescription?.text).toBe(
      `Google Product Feed for http://${CONFORMING_HOSTILE_HOST}`,
    );

    expect(soleElement(item, 'title').text).toBe(HOSTILE_TEXT);
    expect(soleElement(item, 'description').text).toBe(HOSTILE_TEXT);

    /*
     * And the raw sinks in this document carry legitimate values, emitted verbatim — which is the parity
     * half of the census standing beside the safety half. No percent-encoding appears in any of the three
     * URLs, and the host returns byte-identical because it was never transformed at all.
     */
    expect(soleElement(item, 'link').text).toBe(
      `http://${CONFORMING_HOSTILE_HOST}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/`,
    );
    expect(soleElement(root, 'g:image_link').text).toBe(
      `http://${CONFORMING_HOSTILE_HOST}${SKU_COMPOSED_IMAGE_PATH}`,
    );
    expect(soleElement(root, 'g:additional_image_link').text).toBe(
      `http://${CONFORMING_HOSTILE_HOST}${FIRST_ADDITIONAL_IMAGE_PATH}`,
    );

    /*
     * And the value really did travel — it is present in the raw text in its escaped spelling, so none of
     * the assertions above passed because the datum was silently dropped. The double escape of the
     * already-escaped `&amp;` is visible here as `&amp;amp;`, and the `]]>` survives only because its `>`
     * became `&gt;`.
     */
    expect(xml).toContain('&lt;injected&gt;');
    expect(xml).toContain('&amp;amp;');
    expect(xml).toContain(']]&gt;');
    expect(xml).not.toContain('<injected>');
  });

  it('[NET-NEW] the same hostile value at a RAW sink produces no document', async () => {
    /* The companion to the round trip above: the raw sinks, which refuse rather than escape. */
    const rawSinkScenarios: readonly (() => ReturnType<typeof createScenario>)[] = [
      () => createScenario({ host: HOSTILE_HOST }),
      () => createScenario({ urlTitle: HOSTILE_TEXT }),
      () =>
        createScenario({
          imagePathsByImageFile: { [SKU_IMAGE_FILE]: `/product/default/${HOSTILE_TEXT}` },
        }),
      () =>
        createScenario({ settings: [{ settingName: 'skuShippingWeight', value: HOSTILE_TEXT }] }),
      () =>
        createScenario({
          settings: [{ settingName: 'skuShippingWeightUnitCode', value: HOSTILE_TEXT }],
        }),
    ];

    for (const buildScenario of rawSinkScenarios) {
      await expect(buildScenario().render()).rejects.toBeInstanceOf(DataIntegrityError);
    }

    await expect(
      createScenario().render({
        productImages: [{ imagePath: `/product/default/extra${HOSTILE_TEXT}` }],
      }),
    ).rejects.toBeInstanceOf(DataIntegrityError);
  });

  it('[NET-NEW] refuses the same document with the escapes reversed, proving the scanner can fail', async () => {
    /*
     * The negative control, and the closest thing to a direct measurement of what the escaping buys.
     */
    const scenario = createScenario({
      host: CONFORMING_HOSTILE_HOST,
      skuCode: HOSTILE_TEXT,
      calculatedTitle: HOSTILE_TEXT,
      productDescription: HOSTILE_TEXT,
      productTypeName: HOSTILE_TEXT,
      brandName: HOSTILE_TEXT,
      productCode: HOSTILE_TEXT,
      productPrice: 100,
    });

    const escaped = await scenario.render();
    const unescaped = escaped
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&');

    /*
     * The reversal genuinely reintroduced the markup, so the refusal below is about that and nothing else.
     */
    expect(unescaped).toContain('<injected>');

    expect(() => parseXmlDocument(escaped)).not.toThrow();
    expect(() => parseXmlDocument(unescaped)).toThrow(XmlScanError);
  });
});

/* §10 support — fixtures and readers used only by the three carried sections below. */

/** The sixteen live item fields, in the order `product.cfm` emits them. */
const LIVE_ITEM_FIELD_ORDER: readonly string[] = Object.freeze([
  'g:id', //                          product.cfm:L17
  'title', //                         product.cfm:L18
  'description', //                   product.cfm:L19
  'g:google_product_category', //     product.cfm:L20 — always emitted, always empty
  'g:product_type', //                product.cfm:L21
  'link', //                          product.cfm:L22
  'g:image_link', //                  product.cfm:L23
  'g:additional_image_link', //       product.cfm:L24 — repeats, one per product image
  'g:condition', //                   product.cfm:L25 — fixed literal
  'g:availability', //                product.cfm:L26 — fixed literal
  'g:price', //                       product.cfm:L27
  'g:sale_price', //                  product.cfm:L29 — conditional on a strict price comparison
  'g:sale_price_effective_date', //   product.cfm:L30 — conditional, and carries a trailing tab
  'g:brand', //                       product.cfm:L32 — conditional on the brand ASSOCIATION
  'g:item_group_id', //               product.cfm:L39
  'g:shipping_weight', //             product.cfm:L58 — two settings joined by one literal space
]);

/** Every element name inside the first `item`, in document order, opening tags only. */
function itemFieldSequence(xml: string): readonly string[] {
  const openTag = '\t\t<item>';
  const closeTag = '\t\t</item>';
  const start = xml.indexOf(openTag);
  const end = xml.indexOf(closeTag, start);
  if (start === -1 || end === -1) {
    return [];
  }
  const body = xml.slice(start + openTag.length, end);
  const names: string[] = [];
  for (const match of body.matchAll(/<([a-zA-Z:_][\w:.-]*)>/g)) {
    const name = match[1];
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

/** A second product identifier, so a case can put two records under two different products. */
const OTHER_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1';
/** A third, for the three-record cancellation case. */
const THIRD_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb3';
const THIRD_SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3';

/**
 * A second SKU image file, so two records can own two DISTINCT resized reads, and the composed path the
 * image port answers for it.
 */
const SECOND_SKU_IMAGE_FILE = 'nike-air-2.jpg';
const SECOND_SKU_COMPOSED_PATH = `/product/default/${SECOND_SKU_IMAGE_FILE}`;

/** Hands control back to the event loop until every pending microtask has run. */
async function drainMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/** A product distinct from the scenario's own, so its sale-price read cannot share the memo key. */
function buildOtherProduct(
  productType: ProductType,
  productID: string,
  productCode: string,
  price: number,
): Product {
  const product = buildProduct({
    productID,
    productCode,
    productName: `TEMPLATE-ONLY-${productCode}`,
    urlTitle: productCode.toLowerCase(),
    calculatedTitle: `PERSISTED-${productCode}`,
    productType,
  });
  product.price = toExactDecimal(price);

  return product;
}

/* §10 — three sections carried forward, and four deliberately not. */

describe('NET-NEW ProductFeedBuilder — the whole-item field order', () => {
  it('[NET-NEW] product.cfm:L17-L58 — a fully populated item emits all sixteen live fields in the legacy order', async () => {
    /*
     * Fully populated means every conditional branch taken. The two sale fields need a product price
     * strictly greater than the sale price; `g:brand` needs the brand association present; and
     * `g:additional_image_link` needs the product to carry images. Anything less than all three leaves a
     * hole in the sequence and the ordering claim becomes partial.
     */
    const scenario = createScenario({
      productPrice: 100,
      skuPrice: 90,
      brand: 'present',
      brandName: 'Nike',
      productDescription: 'A running shoe.',
    });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });
    const productImages: readonly ProductFeedImage[] = [
      { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
      { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
      { imagePath: THIRD_ADDITIONAL_IMAGE_PATH },
    ];

    const xml = await scenario.render({ productImages });

    /*
     * The repeated field is expanded to the record's actual image count, so the comparison is against
     * eighteen names for sixteen fields — and the three repeats sit between `g:image_link` and
     * `g:condition` rather than being appended at the end, which is the ordering detail a naive
     * "collect the images last" implementation gets wrong.
     */
    const additionalImageIndex = LIVE_ITEM_FIELD_ORDER.indexOf('g:additional_image_link');
    const expectedSequence = [
      ...LIVE_ITEM_FIELD_ORDER.slice(0, additionalImageIndex),
      ...productImages.map(() => 'g:additional_image_link'),
      ...LIVE_ITEM_FIELD_ORDER.slice(additionalImageIndex + 1),
    ];

    expect(itemFieldSequence(xml)).toEqual(expectedSequence);
    expect(expectedSequence).toHaveLength(18);
  });

  it('[NET-NEW] the fully populated item is byte-exact, field by field, in one ordered comparison', async () => {
    const scenario = createScenario({
      productPrice: 100,
      skuPrice: 90,
      brand: 'present',
      brandName: 'Nike',
      productCode: 'TESTPRODUCTXXX',
      skuCode: 'TESTPRODUCTXXX-1',
      urlTitle: 'nike-air',
      calculatedTitle: 'PERSISTED-CALCULATED-TITLE',
      productDescription: 'A running shoe.',
      productTypeName: 'Merchandise',
    });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({
        salePrice: 79.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    /*
     * One ordered comparison rather than sixteen independent `toContain` calls, which is the whole
     * point. `toContain` is order-blind: sixteen of them pass against any permutation of the same
     * sixteen lines. Joining the expected fields with newlines and asserting the document contains that
     * exact block pins the values and their adjacency in a single assertion, so a reordering, an
     * insertion, a deletion or a changed byte all fail here.
     */
    const expectedFields = [
      '<g:id>TESTPRODUCTXXX-1</g:id>',
      '<title>PERSISTED-CALCULATED-TITLE</title>',
      '<description>A running shoe.</description>',
      '<g:google_product_category></g:google_product_category>',
      '<g:product_type>Merchandise</g:product_type>',
      `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/</link>`,
      `<g:image_link>${ABSOLUTE_URL_PREFIX}${SKU_COMPOSED_IMAGE_PATH}</g:image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      '<g:condition>new</g:condition>',
      '<g:availability>in stock</g:availability>',
      '<g:price>100</g:price>',
      '<g:sale_price>79.5</g:sale_price>',
      '<g:sale_price_effective_date>' +
        `${EXPECTED_EFFECTIVE_DATE_START}/${EXPECTED_EFFECTIVE_DATE_END}` +
        '</g:sale_price_effective_date>\t',
      '<g:brand>Nike</g:brand>',
      '<g:item_group_id>TESTPRODUCTXXX</g:item_group_id>',
      `<g:shipping_weight>${SETTING_SKU_SHIPPING_WEIGHT} ${SETTING_SKU_SHIPPING_WEIGHT_UNIT_CODE}</g:shipping_weight>`,
    ];

    expect(xml).toContain(expectedFields.map((field) => itemField(field)).join('\n'));
  });

  it('[NET-NEW] omitting the two conditional families removes exactly those fields and disturbs no other position', async () => {
    /*
     * The complement of the case above, and it is what makes the ordering claim safe against the opposite
     * error. With no sale, no brand and no images, the emitted sequence must be the sixteen-field list
     * minus exactly four names — the two sale fields, the brand, and the repeated image — with every
     * surviving field still in its original relative position. An implementation that reordered on the
     * conditional path, or that emitted an empty placeholder for a skipped field, fails here.
     */
    const scenario = createScenario({ productPrice: 100, skuPrice: 100, brand: 'absent' });

    const xml = await scenario.render();

    const omitted = new Set([
      'g:additional_image_link',
      'g:sale_price',
      'g:sale_price_effective_date',
      'g:brand',
    ]);
    expect(itemFieldSequence(xml)).toEqual(
      LIVE_ITEM_FIELD_ORDER.filter((field) => !omitted.has(field)),
    );
    expect(itemFieldSequence(xml)).toHaveLength(12);
  });

  it('[NET-NEW] product.cfm:L16 — several records each carry the full ordered item, in port order', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 100, brand: 'absent' });
    const second = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'TESTPRODUCTXXX-2',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: scenario.product,
    });

    const xml = await scenario.render({ skus: [scenario.sku, second] });

    /*
     * The ordering contract is per item and the record order is the port's. Both are asserted together
     * because a concurrent render would satisfy neither reliably — and the builder awaits one item at a
     * time precisely so the emitted order cannot depend on resolution timing.
     */
    const items = xml.split('\t\t<item>');
    expect(items).toHaveLength(3);
    for (const item of items.slice(1)) {
      expect(itemFieldSequence(`\t\t<item>${item}`)).toEqual(
        LIVE_ITEM_FIELD_ORDER.filter(
          (field) =>
            field !== 'g:additional_image_link' &&
            field !== 'g:sale_price' &&
            field !== 'g:sale_price_effective_date' &&
            field !== 'g:brand',
        ),
      );
    }
    expect(xml.indexOf('TESTPRODUCTXXX-1')).toBeLessThan(xml.indexOf('TESTPRODUCTXXX-2'));
  });
});

describe('NET-NEW ProductFeedBuilder — a sale with NO expiration', () => {
  it('[NET-NEW] TODO(parity) product.cfm:L30 — an absent expiration renders an empty date and time, keeping the T, the hyphen and the offset', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    /*
     * The expiration key is omitted, not set to `undefined`, and the distinction is the whole case.
     * Under `exactOptionalPropertyTypes` those are different states, and `buildSalePriceDetails` exists to
     * express the absent one — which is what `model/entity/Sku.cfc:L560-L565` turns into the empty string
     * rather than into a date. Every other sale case in this file supplies an expiration, so this is the
     * only route to the lenient endpoint branch.
     */
    scenario.seedSaleDetails({ [SKU_ID]: buildSalePriceDetails({ salePrice: 79.5 }) });

    const xml = await scenario.render();
    const content = elementContent(xml, 'g:sale_price_effective_date');

    /*
     * TODO(parity) — the lenient branch is reproduced because it is the one that produces output at all.
     * The legacy accessor's empty-string return is fed straight into `dateFormat()` and `timeFormat()`,
     * and CFML engines disagree about that call: one renders nothing where another raises a conversion
     * failure, so the legacy behaviour for a sale with no expiration is engine-dependent. The branch that
     * emits is carried, and the four things it deliberately does not do are each asserted below.
     */
    expect(content).toBe(`${EXPECTED_EFFECTIVE_DATE_START}/T-${RAW_UTC_HOUR_OFFSET}`);

    const endpoints = (content ?? '').split('/');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[1]).toBe(`T-${RAW_UTC_HOUR_OFFSET}`);

    /*
     * No date is invented, and the render instant is not substituted for the missing expiration —
     * substituting it would advertise a sale ending the moment the feed was generated, which is both a
     * fabricated value and the worst possible one. The start endpoint's own date must therefore appear
     * exactly once in the range.
     */
    expect(countOccurrences(content ?? '', '2024-01-01')).toBe(1);
    expect(content).not.toContain('2024-02-08');
    /* No zulu normalisation, no padded ISO offset, and the offset is still the bare number. */
    expect(content).not.toContain('Z');
    expect(xml).not.toMatch(/[+-]\d{2}:\d{2}/);
  });

  it('[NET-NEW] both sale fields are still emitted, in their usual positions', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90, brand: 'absent' });
    scenario.seedSaleDetails({ [SKU_ID]: buildSalePriceDetails({ salePrice: 79.5 }) });

    const xml = await scenario.render();

    /*
     * The missing expiration must not suppress either field. The legacy condition at `:L28` tests only
     * the price comparison, so an absent expiration cannot drop the pair — and dropping `g:sale_price`
     * along with the date would remove a discount the catalogue genuinely carries. The field census and
     * the ordering are asserted rather than only the presence.
     */
    expect(xml).toContain(itemField('<g:sale_price>79.5</g:sale_price>'));
    expect(itemFieldSequence(xml)).toEqual(
      LIVE_ITEM_FIELD_ORDER.filter(
        (field) => field !== 'g:additional_image_link' && field !== 'g:brand',
      ),
    );
  });

  it('[NET-NEW] the literal trailing tab survives the empty endpoint', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    scenario.seedSaleDetails({ [SKU_ID]: buildSalePriceDetails({ salePrice: 79.5 }) });

    const xml = await scenario.render();

    /*
     * `:L30` ends with a literal tab after the closing tag, and it belongs to the element rather than to
     * the value — so an endpoint that renders empty must not take the tab with it. It is the only element
     * in the document that carries one, which is asserted alongside so a stray second tab would also fail.
     */
    expect(xml).toContain('</g:sale_price_effective_date>\t');
    expect(countOccurrences(xml, '>\t\n')).toBe(1);
  });

  it('[NET-NEW] an absent expiration on ONE sku does not disturb a sibling that has one', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    const second = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'TESTPRODUCTXXX-2',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: scenario.product,
    });
    scenario.seedSaleDetails({
      [SKU_ID]: buildSalePriceDetails({ salePrice: 79.5 }),
      [SECOND_SKU_ID]: buildSalePriceDetails({
        salePrice: 69.5,
        salePriceExpirationDateTime: scenario.saleExpiration,
      }),
    });

    const xml = await scenario.render({ skus: [scenario.sku, second] });

    /*
     * The two endpoints are rendered per record from that record's own detail slice, so one SKU's absent
     * expiration must not leak into its sibling's range — the failure a shared or hoisted endpoint value
     * would produce. Both ranges are asserted in full, in document order.
     */
    const items = xml.split('\t\t<item>');
    expect(items).toHaveLength(3);
    expect(items[1]).toContain(`${EXPECTED_EFFECTIVE_DATE_START}/T-${RAW_UTC_HOUR_OFFSET}`);
    expect(items[2]).toContain(`${EXPECTED_EFFECTIVE_DATE_START}/${EXPECTED_EFFECTIVE_DATE_END}`);
  });
});

describe('NET-NEW — one dependency read outstanding at a time', () => {
  it('NET-NEW — record N+1 does not start its pricing read until record N has resolved', async () => {
    const scenario = createScenario({ deferPricing: true, productPrice: 100, skuPrice: 90 });
    const otherProduct = buildOtherProduct(scenario.productType, OTHER_PRODUCT_ID, 'OTHER', 50);
    const otherSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'OTHER-1',
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product: otherProduct,
    });

    /*
     * Two different products, deliberately. The memo means two SKUs of one product share a single read,
     * which would leave nothing to sequence — so a case about ordering has to defeat the memo to have two
     * reads to order at all.
     */
    const running = scenario.render({ skus: [scenario.sku, otherSku] });

    await drainMicrotasks();

    /*
     * The assertion the whole section is for. The render is now as far as it can get without help, and
     * that point is inside record one: one read started, one outstanding, and record two's product has not
     * been asked about at all. A concurrent implementation would show two of each here.
     */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID]);
    expect(scenario.pricing.pending).toHaveLength(1);
    expect(scenario.pricing.pending[0]?.describe).toBe(PRODUCT_ID);
    expect(scenario.pricing.resolvedProductIds).toStrictEqual([]);

    scenario.pricing.settleNextRead();
    await drainMicrotasks();

    /* Only now does record two begin — and again exactly one read is outstanding. */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID, OTHER_PRODUCT_ID]);
    expect(scenario.pricing.pending).toHaveLength(1);
    expect(scenario.pricing.pending[0]?.describe).toBe(OTHER_PRODUCT_ID);
    expect(scenario.pricing.resolvedProductIds).toStrictEqual([PRODUCT_ID]);

    scenario.pricing.settleNextRead();
    const xml = await running;

    /*
     * Resolution order matched start order, and the document is in record order — the sequencing bought
     * ordering, not merely a different call pattern.
     */
    expect(scenario.pricing.resolvedProductIds).toStrictEqual([PRODUCT_ID, OTHER_PRODUCT_ID]);
    expect(xml.indexOf('<g:id>TESTPRODUCTXXX-1</g:id>')).toBeLessThan(
      xml.indexOf('<g:id>OTHER-1</g:id>'),
    );
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(2);
  });

  it('NET-NEW — across three records, never more than one pricing read is outstanding', async () => {
    const scenario = createScenario({ deferPricing: true, productPrice: 100, skuPrice: 90 });
    const otherProduct = buildOtherProduct(scenario.productType, OTHER_PRODUCT_ID, 'OTHER', 50);
    const thirdProduct = buildOtherProduct(scenario.productType, THIRD_PRODUCT_ID, 'THIRD', 70);
    const records = [
      scenario.sku,
      buildSku({
        skuID: SECOND_SKU_ID,
        skuCode: 'OTHER-1',
        price: 90,
        imageFile: SKU_IMAGE_FILE,
        product: otherProduct,
      }),
      buildSku({
        skuID: THIRD_SKU_ID,
        skuCode: 'THIRD-1',
        price: 90,
        imageFile: SKU_IMAGE_FILE,
        product: thirdProduct,
      }),
    ];

    const running = scenario.render({ skus: records });

    /*
     * Driven as a loop rather than as three hand-written steps, so the invariant is stated once and holds
     * for every record instead of only for the boundary the case happened to write out. The outstanding
     * count is checked before each settle, which is the moment a concurrent implementation would have
     * more than one parked.
     */
    const outstandingHighWaterMark: number[] = [];
    for (let settled = 0; settled < records.length; settled += 1) {
      await drainMicrotasks();
      outstandingHighWaterMark.push(scenario.pricing.pending.length);
      scenario.pricing.settleNextRead();
    }

    const xml = await running;

    expect(outstandingHighWaterMark).toStrictEqual([1, 1, 1]);
    expect(scenario.pricing.requestedProductIds).toStrictEqual([
      PRODUCT_ID,
      OTHER_PRODUCT_ID,
      THIRD_PRODUCT_ID,
    ]);
    expect(scenario.pricing.pending).toHaveLength(0);
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(3);
  });

  it('NET-NEW — within one record, each image read waits for the previous one, and the links keep source order', async () => {
    const scenario = createScenario({ deferImages: true });

    const running = scenario.render({
      productImages: [
        { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
        { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
      ],
    });

    /*
     * Four reads make up one record's image work: the SKU's own composed path, the SKU's resized path, and
     * one resized path per additional image. They are driven one at a time and the outstanding set is
     * recorded before each settle, so both the ORDER and the one-at-a-time invariant come out of the same
     * loop. A concurrent image map would park the additional images together and fail the length check.
     */
    const startedInOrder: string[] = [];
    const outstandingBeforeEachSettle: number[] = [];
    for (let settled = 0; settled < 4; settled += 1) {
      await drainMicrotasks();
      outstandingBeforeEachSettle.push(scenario.images.pending.length);
      const oldest = scenario.images.pending[0];
      expect(oldest).toBeDefined();
      startedInOrder.push(oldest?.describe ?? '');
      scenario.images.settleNextRead();
    }

    const xml = await running;

    expect(outstandingBeforeEachSettle).toStrictEqual([1, 1, 1, 1]);
    expect(startedInOrder).toStrictEqual([
      `getImagePath:${SKU_IMAGE_FILE}`,
      `getResizedImagePath:${SKU_COMPOSED_IMAGE_PATH}`,
      `getResizedImagePath:${FIRST_ADDITIONAL_IMAGE_PATH}`,
      `getResizedImagePath:${SECOND_ADDITIONAL_IMAGE_PATH}`,
    ]);
    /* Resolution order equals start order, so nothing was reordered on the way back either. */
    expect(scenario.images.resolved).toStrictEqual(startedInOrder);

    /* `:L24`'s emission order is the input order, and gating did not disturb it. */
    const additionalLinks = xml
      .split('\n')
      .filter((line) => line.includes('<g:additional_image_link>'))
      .map((line) => line.trim());
    expect(additionalLinks).toStrictEqual([
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${SECOND_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
    ]);
  });

  it('NET-NEW — record two starts no image read until every image read of record one has resolved', async () => {
    const scenario = createScenario({
      deferImages: true,
      /*
       * Both files seeded, because supplying this member replaces the default single-entry map. See
       * {@link SECOND_SKU_COMPOSED_PATH} for why an unseeded second file is no longer viable.
       */
      imagePathsByImageFile: {
        [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH,
        [SECOND_SKU_IMAGE_FILE]: SECOND_SKU_COMPOSED_PATH,
      },
    });
    const otherProduct = buildOtherProduct(scenario.productType, OTHER_PRODUCT_ID, 'OTHER', 50);
    /* A different image file on record two, and no additional images on either record. */
    const otherSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: 'OTHER-1',
      price: 90,
      imageFile: SECOND_SKU_IMAGE_FILE,
      product: otherProduct,
    });

    const running = scenario.render({ skus: [scenario.sku, otherSku] });

    /* Record one owns exactly two reads: its composed path and its resized path. Settle both. */
    const recordOneReads: string[] = [];
    for (let settled = 0; settled < 2; settled += 1) {
      await drainMicrotasks();
      expect(scenario.images.pending).toHaveLength(1);
      recordOneReads.push(scenario.images.pending[0]?.describe ?? '');
      scenario.images.settleNextRead();
    }
    expect(recordOneReads).toStrictEqual([
      `getImagePath:${SKU_IMAGE_FILE}`,
      `getResizedImagePath:${SKU_COMPOSED_IMAGE_PATH}`,
    ]);

    await drainMicrotasks();

    /*
     * The cross-record boundary. Exactly two reads had resolved before record two asked for anything, and
     * the third — record two's first — is only outstanding now. A concurrent record loop would have had
     * record two's reads parked alongside record one's from the very first drain.
     */
    expect(scenario.images.resolved).toStrictEqual(recordOneReads);
    expect(scenario.images.pending).toHaveLength(1);
    expect(scenario.images.pending[0]?.describe).toBe(`getImagePath:${SECOND_SKU_IMAGE_FILE}`);

    for (let settled = 0; settled < 2; settled += 1) {
      await drainMicrotasks();
      expect(scenario.images.pending).toHaveLength(1);
      scenario.images.settleNextRead();
    }

    const xml = await running;

    /*
     * All four reads resolved in start order, and both items are in the document in record order.
     */
    expect(scenario.images.resolved).toStrictEqual([
      `getImagePath:${SKU_IMAGE_FILE}`,
      `getResizedImagePath:${SKU_COMPOSED_IMAGE_PATH}`,
      `getImagePath:${SECOND_SKU_IMAGE_FILE}`,
      `getResizedImagePath:${SECOND_SKU_COMPOSED_PATH}`,
    ]);
    expect(scenario.images.pending).toHaveLength(0);
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(2);
    expect(xml.indexOf('<g:id>TESTPRODUCTXXX-1</g:id>')).toBeLessThan(
      xml.indexOf('<g:id>OTHER-1</g:id>'),
    );
  });
});

/* The shipped feed wiring. */

/** The handler module read as text, for the source-level halves of the assertions. */
const FEED_HANDLER_SOURCE_PATH = join(
  __dirname,
  '..',
  '..',
  'src',
  'handlers',
  'googleFeedHandler.ts',
);

/** Every variable `src/config/env.ts` reads, cleared before each wiring case applies its own. */
const FEED_WIRING_VARIABLE_NAMES: readonly string[] = Object.freeze([
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_TLS_MODE',
  'DB_CONNECTION_LIMIT',
  'DB_QUEUE_LIMIT',
  'DB_CONNECT_TIMEOUT_MS',
  'GOOGLE_FEED_HOST',
  'SETTING_APPLICATION_ROOT_MAPPING_PATH',
  'SETTING_SKU_ELIGIBLE_CURRENCIES',
  'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',

  /*
   * The six resource bounds of README §8.1, listed for the same exhaustiveness reason as the rest: a figure
   * left behind by the ambient environment could otherwise decide whether a bounded route here serves or
   * refuses. Values in {@link FEED_WIRING_ENVIRONMENT}.
   */
  'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
  'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
  'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
  'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
  'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
  'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
]);

/** A valid environment for the wiring cases. */
const FEED_WIRING_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'Slatwall',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'fixture-not-a-real-password',
  DB_TLS_MODE: 'disabled',
  DB_CONNECTION_LIMIT: '10',
  DB_QUEUE_LIMIT: '1',
  DB_CONNECT_TIMEOUT_MS: '10000',
  GOOGLE_FEED_HOST: RENDER_HOST,

  /*
   * — the anonymous route requires a stated ceiling, so this fixture states one. The gate the
   * composition root builds refuses an unbounded anonymous materialisation, and `google:feed.product` is
   * the one anonymous address in the slice [`integrationServices/google/controllers/feed.cfc:L54-L56`].
   * Every case in this section drives the shipped wiring, so a fixture that stated no ceiling would get a
   * `500` from the gate before the image semantics under test were ever reached — which is what a
   * deployment gets too, and is correct.
   */
  /* /02/03 — the six resource bounds, and why a fixture may state them. */
  CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000',
  CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY: '250',
  CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST: '10000',
  CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION: '500',
  CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD: '100',
  CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES: '10000000',
});

/** The two shipped factories, loaded against {@link FEED_WIRING_ENVIRONMENT}. */
interface ShippedFeedWiring {
  readonly createCatalogContainer: (overrides?: CatalogContainerOverrides) => CatalogContainer;
  readonly createGoogleFeedHandlerFromContainer: (container: CatalogContainer) => GoogleFeedHandler;
}

/**
 * Load the composition root and the feed entry point with a valid environment in place.
 *
 * @returns the two shipped factories, freshly loaded.
 */
function loadShippedFeedWiring(): ShippedFeedWiring {
  for (const name of FEED_WIRING_VARIABLE_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, FEED_WIRING_ENVIRONMENT);

  jest.resetModules();

  /*
   * `require` rather than a static import, for the module-load reason recorded in this section's header.
   * The rule is disabled for these two expressions and nowhere else in this file.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const containerModule = require('../../src/config/container') as {
    readonly createCatalogContainer: (overrides?: CatalogContainerOverrides) => CatalogContainer;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const handlerModule = require('../../src/handlers/googleFeedHandler') as {
    readonly createGoogleFeedHandlerFromContainer: (
      container: CatalogContainer,
    ) => GoogleFeedHandler;
  };

  return {
    createCatalogContainer: containerModule.createCatalogContainer,
    createGoogleFeedHandlerFromContainer: handlerModule.createGoogleFeedHandlerFromContainer,
  };
}

/** The environment as the process held it before this file touched it. */
const ENVIRONMENT_BEFORE_WIRING_CASES: Readonly<Record<string, string | undefined>> = Object.freeze(
  {
    ...process.env,
  },
);

/** Attach one image to `product` through the entity's own helper, and answer the association. */
function attachProductImage(product: Product): ProductOwnedAssociation {
  const association: ProductOwnedAssociation = {
    setProduct: (owner: Product): void => {
      owner.productImages.push(association);
    },
    removeProduct: (owner?: Product): void => {
      const collection = (owner ?? product).productImages;
      const at = collection.indexOf(association);
      if (at !== -1) {
        collection.splice(at, 1);
      }
    },
  };
  product.addProductImage(association);
  return association;
}

/** Run `operation` and answer whatever it threw, or `undefined` when it returned. */
function captureThrown(operation: () => unknown): unknown {
  try {
    operation();
    return undefined;
  } catch (thrown) {
    return thrown;
  }
}

/** Every `<g:additional_image_link>` element in the document, in document order. */
function additionalImageElements(xml: string): readonly string[] {
  return xml
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('<g:additional_image_link>'));
}

describe('NET-NEW ProductFeedBuilder — the shipped feed wiring', () => {
  afterEach(() => {
    for (const name of FEED_WIRING_VARIABLE_NAMES) {
      const before = ENVIRONMENT_BEFORE_WIRING_CASES[name];
      if (before === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = before;
      }
    }
  });

  it('[NET-NEW] the shipped factory publishes the container reader images as repeated elements in input order', async () => {
    const scenario = createScenario();
    scenario.smartList.enqueue({ kind: 'page', metrics: {}, records: [scenario.sku] });

    /*
     * Four images, deliberately not sorted and deliberately carrying a repeat. The order is third,
     * first, second, first — so a document that sorted, de-duplicated or filtered them would differ from
     * this expectation, and one that emitted them in the collection's own order matches it. This is the
     * order `integrationServices/google/views/feed/product.cfm:L24` walks.
     */
    const suppliedImages: readonly ProductFeedImage[] = Object.freeze([
      { imagePath: THIRD_ADDITIONAL_IMAGE_PATH },
      { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
      { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
      { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
    ]);
    const readerSubjects: Sku[] = [];

    const wiring = loadShippedFeedWiring();
    const container = wiring.createCatalogContainer({
      smartListQueryPort: scenario.smartList.smartList,
      settings: scenario.settings.resolver,
      imagePaths: scenario.images.imagePaths,
      pricing: scenario.pricing.pricing,
      productFeedImages: (sku) => {
        readerSubjects.push(sku);
        return suppliedImages;
      },
    });

    const response = await wiring.createGoogleFeedHandlerFromContainer(container).product();

    /* The response is the feed, not a refusal — so nothing on the wiring path raised. */
    expect(response.statusCode).toBe(200);
    const xml = response.body;
    expect(xml.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);

    /*
     * The assertion asked for. Four elements, each carrying its own resized path, in the exact
     * order the reader returned them. The predecessor wiring produced zero of these for any input.
     */
    expect(additionalImageElements(xml)).toStrictEqual([
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${THIRD_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${SECOND_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
    ]);

    /*
     * The reader was consulted once, with the SKU the port selected — not with the product, and not
     * once per image. `product.cfm:L24` reaches the collection through the SKU it is rendering.
     */
    expect(readerSubjects).toStrictEqual([scenario.sku]);

    /*
     * Every image the reader yielded was resolved through `ImagePathPort`, which is the other half of
     * 's resolution: the reader supplies paths, the port resizes them. Five resize calls in all — one
     * for the SKU's own image and one per additional image.
     */
    expect(resizeRequests(scenario.images).map((request) => request.imagePath)).toStrictEqual([
      SKU_COMPOSED_IMAGE_PATH,
      THIRD_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
      SECOND_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
    ]);
  });

  it('[NET-NEW] the shipped default answers an empty list for a product whose image collection is empty', async () => {
    const scenario = createScenario();
    expect(scenario.product.getProductImages()).toHaveLength(0);
    scenario.smartList.enqueue({ kind: 'page', metrics: {}, records: [scenario.sku] });

    const wiring = loadShippedFeedWiring();
    const container = wiring.createCatalogContainer({
      smartListQueryPort: scenario.smartList.smartList,
      settings: scenario.settings.resolver,
      imagePaths: scenario.images.imagePaths,
      pricing: scenario.pricing.pricing,
    });

    const response = await wiring.createGoogleFeedHandlerFromContainer(container).product();

    /*
     * `[]` is the legacy output here, which is why it is not a fabrication.
     * `integrationServices/google/views/feed/product.cfm:L24` emits one element per entry, so an empty
     * collection emits none — and this is the only input for which the empty answer is the truthful one.
     */
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<g:image_link>');
    expect(response.body).not.toContain('<g:additional_image_link');
  });

  it('[NET-NEW] the shipped default REFUSES a product that carries images rather than reporting none', async () => {
    const scenario = createScenario();
    attachProductImage(scenario.product);
    attachProductImage(scenario.product);
    expect(scenario.product.getProductImages()).toHaveLength(2);
    scenario.smartList.enqueue({ kind: 'page', metrics: {}, records: [scenario.sku] });

    const wiring = loadShippedFeedWiring();
    const container = wiring.createCatalogContainer({
      smartListQueryPort: scenario.smartList.smartList,
      settings: scenario.settings.resolver,
      imagePaths: scenario.images.imagePaths,
      pricing: scenario.pricing.pricing,
    });

    const response = await wiring.createGoogleFeedHandlerFromContainer(container).product();

    /*
     * The whole of finding, as one assertion. The predecessor wiring answered 200 with a complete,
     * well-formed, entirely plausible feed in which both images had silently vanished. The shipped
     * wiring answers the boundary refusal instead, so an operator learns that a boundary was reached
     * rather than publishing a product's images as absent.
     */
    expect(response.statusCode).toBe(501);
    expect(response.body).toContain('This operation is not implemented');

    /*
     * And nothing partial is published. The document is built whole or not at all, so no envelope, no
     * channel and no item reaches the body.
     */
    expect(response.body).not.toContain('<rss');
    expect(response.body).not.toContain('<item>');
    expect(response.body).not.toContain('<g:additional_image_link');

    /*
     * The refusal discloses no member identifier and no locator — that is `errorResponse`'s rule, and it
     * holds for this boundary exactly as it does for the five ports beside it.
     */
    expect(response.body).not.toContain('ProductFeedImageReader');
    expect(response.body).not.toContain('model/entity/Image.cfc');
  });

  it('[NET-NEW] the shipped default reader answers each of its three inputs directly', () => {
    const scenario = createScenario();

    const wiring = loadShippedFeedWiring();
    const readProductImages = wiring.createCatalogContainer({
      smartListQueryPort: scenario.smartList.smartList,
      settings: scenario.settings.resolver,
      imagePaths: scenario.images.imagePaths,
      pricing: scenario.pricing.pricing,
    }).productFeedImages;

    /*
     * 1. no product — `[]`, deliberately not a refusal. `ProductFeedBuilder.requireProduct` already
     * raises for such a record, reproducing the legacy null dereference at `product.cfm:L18`, so
     * raising here too would put the same rule on both sides of a layer boundary and would replace a
     * message that names the SKU with one that does not.
     */
    expect(readProductImages(buildSku({ skuID: SKU_ID, skuCode: 'NO-PRODUCT-1' }))).toStrictEqual(
      [],
    );

    /* 2. A product with no images — `[]`, which is the legacy output for that product. */
    expect(readProductImages(scenario.sku)).toStrictEqual([]);

    /* 3. A product that carries one image — a refusal, on the very first image. */
    attachProductImage(scenario.product);
    const refusal = captureThrown(() => readProductImages(scenario.sku));
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).name).toBe(NotImplementedError.name);
    expect((refusal as Error).message).toBe(
      'ProductFeedImageReader is not implemented: the product carries images, and their paths come ' +
        'from model/entity/Image.cfc:L79-L81 — an entity AAP §0.2.1.2 does not include, so no path is ' +
        'readable from the ported domain',
    );
  });

  it('[NET-NEW] the shipped factory takes its reader from the container and declares no constant-empty reader', () => {
    const source = partitionBuilderSource(readFileSync(FEED_HANDLER_SOURCE_PATH, 'utf8'));

    /*
     * The wiring itself, in code rather than in a comment — and the literal is the whole
     * expression, which asserts two facts at once: the reader's only source is the composition
     * root, and a caller's `overrides.readProductImages` takes precedence over it. Searching for
     * `readProductImages: container.productFeedImages` alone would miss the override slot: matching
     * that shorter literal would pass while silently permitting the slot's removal.
     */
    expect(
      codeOffsetsOf(source, 'overrides?.readProductImages ?? container.productFeedImages'),
    ).toHaveLength(1);

    /*
     * And no reader is declared in this file at all: a module-scope
     * `const readNoProductImages: ProductFeedImageReader = () => [];` would make a silently incomplete
     * feed the shipped default, so the check is that nothing in the executable text binds a value of
     * that type. The search is over code spans only, so prose that names the rejected binding cannot
     * itself trip the assertion.
     */
    const executableText = spanText(source, source.codeSpans);
    expect(executableText).not.toContain('readNoProductImages');
    expect(/:\s*ProductFeedImageReader\s*=/.test(executableText)).toBe(false);
    expect(/readProductImages:\s*\(\s*\)\s*=>/.test(executableText)).toBe(false);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM integrations/ProductFeedQuery */

/** Google product-feed record selection. */
describe('The feed record selection — the three joins, the three filters and the QATS range', () => {
  /*
   * An `UNREACHED_COLLABORATOR` sentinel stood here — `{} as never`, the discipline
   * `test/services/SkuService.test.ts` established for a collaborator that must exist to construct a
   * subject but is never called. It filled nine of the ten constructor positions of the real `SkuService`
   * the old harness built. With the service off this path there is nothing left to fill: the subject takes
   * one collaborator, and every case supplies a live one.
   */

  /**
   * Distinct 32-character identifiers, so a crossed association is visible rather than coincidental.
   */
  const ID = {
    sku: 'aaaaaaaa000000000000000000000001',
    product: 'bbbbbbbb000000000000000000000001',
    productType: 'cccccccc000000000000000000000001',
    brand: 'dddddddd000000000000000000000001',
    defaultSku: 'eeeeeeee000000000000000000000001',
  } as const;

  /** One statement, as the driver saw it. */
  interface Statement {
    readonly sql: string;
    readonly params: readonly unknown[];
  }

  /** Builds a `ProductFeedQuery` over a live query port. */
  function makeFeedQuery(port: SmartListQueryPort): ProductFeedQuery {
    return new ProductFeedQuery(port);
  }

  /**
   * A port that records the description it was handed, with the member that received it, and answers with
   * an empty result.
   */
  function makeCapturingPort(): {
    readonly port: SmartListQueryPort;
    readonly queries: SmartListQuery[];
    readonly reads: { readonly execute: number; readonly executeRecords: number };
  } {
    const queries: SmartListQuery[] = [];
    const reads = { execute: 0, executeRecords: 0 };

    return {
      queries,
      reads,
      port: {
        executeRecords: <T>(query: SmartListQuery): Promise<T[]> => {
          reads.executeRecords += 1;
          queries.push(query);
          return Promise.resolve([]);
        },
        execute: <T>(query: SmartListQuery): Promise<SmartListResult<T>> => {
          reads.execute += 1;
          queries.push(query);
          return Promise.resolve({
            records: [],
            pageRecords: [],
            recordsCount: 0,
            pageRecordsStart: 1,
            pageRecordsEnd: 0,
            currentPage: 1,
            totalPages: 0,
          });
        },
      },
    };
  }

  /** A recording executor over a tiny table store that honours `WHERE <column> IN (…)`. */
  function makeRecordingExecutor(tables: Readonly<Record<string, readonly MySqlRow[]>>): {
    readonly executor: SqlExecutor;
    readonly statements: Statement[];
  } {
    const statements: Statement[] = [];

    return {
      statements,
      executor: {
        execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
          statements.push({ sql, params: [...params] });

          if (sql.includes('recordsCount')) {
            return Promise.resolve([{ recordsCount: 1 }]);
          }

          const table = / FROM (\w+)/.exec(sql)?.[1];
          const rows = table === undefined ? undefined : tables[table];
          if (rows === undefined) {
            return Promise.resolve([]);
          }

          const inFilter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
          const column = inFilter?.[1];
          if (column !== undefined) {
            return Promise.resolve(rows.filter((row) => params.includes(row[column])));
          }

          return Promise.resolve([...rows]);
        },
      },
    };
  }

  /** A delegate binder that answers a known price, so a bound default SKU is observable. */
  function bindDelegate(sku: Sku): ProductDefaultSkuDelegate {
    return {
      getCurrencyCode: (): string | undefined => undefined,
      getPrice: (): ExactDecimal | undefined => sku.price,
      getRenewalPrice: (): ExactDecimal | undefined => undefined,
      getListPrice: (): ExactDecimal | undefined => undefined,
      getImageDirectory: (): string => '',
      getImagePath: (): string => '',
      getImage: (): string => '',
      getResizedImagePath: (): string => '',
      getImageExistsFlag: (): boolean => false,
    };
  }

  /** Every row the feed's records and their aggregate need. Money columns are strings. */
  const FEED_TABLES: Readonly<Record<string, readonly MySqlRow[]>> = {
    SwSku: [
      { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
      { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
    ],
    SwProduct: [
      {
        productID: ID.product,
        productName: 'Feed Product',
        productCode: 'FP-1',
        productTypeID: ID.productType,
        brandID: ID.brand,
        defaultSkuID: ID.defaultSku,
      },
    ],
    SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
    SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
  };

  describe('the feed joins transcribed from feed.cfc:L64-L66', () => {
    it('NET-NEW — the three pairs are transcribed exactly, in source order', () => {
      /*
       * Spelled out rather than compared against itself, so a drift in the constant is a failing
       * assertion rather than a self-consistent one.
       */
      expect(PRODUCT_FEED_JOINS).toEqual([
        // feed.cfc:L64 — a deliberate duplicate of model/service/SkuService.cfc:L314.
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
        // feed.cfc:L65 — `defaultSku`, not a second `product` join.
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
        // feed.cfc:L66 — the one call that states a kind.
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
      ]);
    });

    it('NET-NEW — the first two OMIT the join kind rather than spelling it inner', () => {
      /*
       * Org/Hibachi/HibachiSmartList.cfc:L212 defaults the kind to the empty string, and :L537-L540
       * rewrites empty to `left`. Writing `inner` here would be a behaviour change wearing a cleanup's
       * clothes, so absence is asserted as absence.
       */
      expect(PRODUCT_FEED_JOINS[0]).not.toHaveProperty('joinType');
      expect(PRODUCT_FEED_JOINS[1]).not.toHaveProperty('joinType');
      expect(PRODUCT_FEED_JOINS[2]?.joinType).toBe('left');
    });

    it('NET-NEW — the sequence and every entry are frozen, so no invocation can rewrite them', () => {
      /*
       * Module-scope state on a warm container is M7's concern; a frozen constant is the answer.
       */
      expect(Object.isFrozen(PRODUCT_FEED_JOINS)).toBe(true);
      for (const join of PRODUCT_FEED_JOINS) {
        expect(Object.isFrozen(join)).toBe(true);
      }
    });
  });

  describe('all seven feed additions arrive in one described query', () => {
    it('NET-NEW — the query carries SIX joins: the service’s three, then the feed’s three', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      expect(queries).toHaveLength(1);
      /*
       * Order is the assertion. The controller cannot add to a smart list it does not hold, so
       * model/service/SkuService.cfc:L314-L316 has always run before feed.cfc:L64-L66 — and it has to be
       * that way round, because feed joins #2 and #3 name `SlatwallProduct`, which the service's first
       * join is what registers.
       */
      expect(queries[0]?.joins).toEqual([
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
        { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
      ]);
    });

    it('NET-NEW — the duplicate is passed through rather than de-duplicated on the way', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /*
       * feed.cfc:L64 repeats model/service/SkuService.cfc:L314 verbatim. Collapsing it here would be a
       * repair; the adapter absorbs it instead, and proves against
       * org/Hibachi/HibachiSmartList.cfc:L258 and :L269 that the legacy absorbs it too.
       */
      const productJoins = (queries[0]?.joins ?? []).filter(
        (join) => join.parentEntityName === 'SlatwallSku' && join.relatedProperty === 'product',
      );
      expect(productJoins).toHaveLength(2);
    });

    it('NET-NEW — the three filters and the one range travel in the same call, with the legacy values', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      const group = queries[0]?.whereGroups?.[0];
      expect(group?.filters).toEqual([
        // feed.cfc:L68-L70. The value is the number 1, as all three legacy call sites pass it.
        { propertyIdentifier: 'activeFlag', value: 1 },
        { propertyIdentifier: 'product.activeFlag', value: 1 },
        { propertyIdentifier: 'product.publishedFlag', value: 1 },
      ]);
      /*
       * feed.cfc:L72 — `1^` is a lower bound with no upper bound, per
       * org/Hibachi/HibachiSmartList.cfc:L642-L646.
       */
      expect(group?.ranges).toEqual([
        { propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' },
      ]);
    });

    it('NET-NEW — the service’s five keyword properties are inherited, not re-derived by the feed', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /*
       * Model/service/SkuService.cfc:L318-L322, all at weight 1. The feed layers onto the service's
       * smart list rather than replacing it, so these arrive without the integration restating them.
       */
      expect(queries[0]?.keywordProperties).toHaveLength(5);
      expect(queries[0]?.entityName).toBe('SlatwallSku');
    });

    it('NET-NEW — the selection is executed ONCE, records-only, with no count and no page read', async () => {
      const { port, queries, reads } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /*
       * The finding this case exists for (perf-02).
       * `integrationServices/google/views/feed/product.cfm:L16` loops the smart list's records and
       * reads no page and no count in its 66 lines, and the legacy framework materialises each view
       * only on first read of that view [org/Hibachi/HibachiSmartList.cfc:L751-L755, :L759-L764,
       * :L771] — so the legacy feed issues exactly one statement. Reaching the selection through
       * `skuService.getSkuSmartList`, which answers all three views, would materialise a `COUNT(*)`
       * and a paged statement on every request.
       */
      expect(reads.executeRecords).toBe(1);
      expect(reads.execute).toBe(0);
      expect(queries).toHaveLength(1);
    });

    it('NET-NEW — the records arrive as the port returned them, with no defensive copy', async () => {
      const rows: Sku[] = [];
      const port: SmartListQueryPort = {
        executeRecords: <T>(): Promise<T[]> => Promise.resolve(rows as unknown as T[]),
        execute: <T>(): Promise<SmartListResult<T>> => {
          throw new Error('the feed must not read the three-view result');
        },
      };

      const feed = await makeFeedQuery(port).getFeedSkus();

      /*
       * Identity, not equality. `SmartListQueryPort.executeRecords` answers a mutable array built for this
       * caller, so the previous `[...selection.records]` spread — needed only because
       * `SmartListResult.records` is `readonly` — was a full shallow copy of every published SKU in the
       * catalog on every feed request. Asserting identity is what keeps that copy from coming back: an
       * equality assertion would pass with the spread reinstated.
       */
      expect(feed).toBe(rows);
    });

    it('NET-NEW — no ordering, paging, keyword or saved state is invented', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /*
       * feed.cfc:L63 passes nothing at all, so a default here would change every one of the six
       * in-repository callers invisibly.
       */
      expect(queries[0]?.orders).toBeUndefined();
      expect(queries[0]?.pagination).toBeUndefined();
      expect(queries[0]?.keywords).toBeUndefined();
    });
  });

  describe('the feed joins reach the emitted statement', () => {
    function runFeed(): {
      /*
       * The feed reads the unpaged collection alone, so this is the records array rather than the
       * three-view result — see `ProductFeedQuery.getFeedSkus`, which executes the shared SKU selection
       * through `smartListQueryPort.executeRecords`.
       */
      readonly result: Promise<Sku[]>;
      readonly statements: Statement[];
    } {
      const { executor, statements } = makeRecordingExecutor(FEED_TABLES);
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders({ bindDefaultSkuDelegate: bindDelegate }),
        GENEROUS_SMART_LIST_BUDGET,
      );

      return { result: makeFeedQuery(builder).getFeedSkus(), statements };
    }

    /** The record projection — the first statement the builder issues. */
    async function recordsSql(): Promise<string> {
      const { result, statements } = runFeed();
      await result;
      return statements[0]?.sql ?? '';
    }

    it('NET-NEW — the default-SKU and brand joins are named, which before this fix they were not', async () => {
      const sql = await recordsSql();

      /* feed.cfc:L65 — the product's default SKU, a second alias over the same physical table. */
      expect(sql).toContain(
        'JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID',
      );
      /* feed.cfc:L66 — the brand. The feed's `g:brand` field reads it. */
      expect(sql).toContain(
        'JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID',
      );
    });

    it('NET-NEW — NOTHING renders as an inner join, so no brandless product can be dropped', async () => {
      const { result, statements } = runFeed();
      await result;

      /*
       * The assertion that carries the meaning. An omitted kind and an explicit `left` emit the same
       * keyword (org/Hibachi/HibachiSmartList.cfc:L537-L540), so the observable guarantee is the absence
       * of an eliminating join rather than the presence of the word `left` on one of the six.
       */
      for (const statement of statements) {
        expect(statement.sql).not.toContain('INNER JOIN');
      }
      expect(statements[0]?.sql).toContain('LEFT JOIN SwBrand');
    });

    it('NET-NEW — the six declared joins emit FIVE, because the duplicate is absorbed', async () => {
      const sql = await recordsSql();

      /*
       * Org/Hibachi/HibachiSmartList.cfc:L269 finds the key already registered and appends nothing, so
       * the repeated `("SlatwallSku","product")` contributes no entity, no alias and no from fragment.
       */
      expect(sql.match(/JOIN SwProduct\b/g)).toHaveLength(1);
      expect(sql.match(/ JOIN /g)).toHaveLength(5);
    });

    it('NET-NEW — the joins are emitted in declaration order', async () => {
      const sql = await recordsSql();

      const order = [
        sql.indexOf('JOIN SwProduct '),
        sql.indexOf('JOIN SwProductType '),
        sql.indexOf('JOIN SwAlternateSkuCode '),
        sql.indexOf('JOIN SwSku bslatwallsku'),
        sql.indexOf('JOIN SwBrand '),
      ];
      for (const position of order) {
        expect(position).toBeGreaterThan(0);
      }
      expect(order).toEqual([...order].sort((left, right) => left - right));
    });

    it('NET-NEW — every value is bound positionally and none is interpolated', async () => {
      const { result, statements } = runFeed();
      await result;

      /*
       * Three equality predicates bound to the number 1, then the inclusive lower bound. The bound value
       * is the string `1`: it is the first element of the two-character range value, carried as the
       * legacy carries it rather than coerced.
       */
      expect(statements[0]?.params).toEqual([1, 1, 1, '1']);
      expect(statements[0]?.sql).toContain('>= ?');
      for (const statement of statements) {
        expect(statement.sql).not.toContain("'");
        expect(statement.sql).not.toContain(ID.product);
      }
    });

    it('NET-NEW — the emitted statements carry NO page window, and exactly ONE count', async () => {
      const { result, statements } = runFeed();
      await result;

      /*
       * The sql-level half of the perf-02 guard, narrowed to the half that still holds. Not one statement
       * in the emitted set carries a `LIMIT`/`OFFSET` page window: the feed reads the records-only port
       * member, `getRecords()` at `org/Hibachi/HibachiSmartList.cfc:L751-L755` reads no page, and a page on
       * this path would silently shorten a merchant feed.
       */
      expect(statements.length).toBeGreaterThan(0);
      expect(statements.filter((statement) => statement.sql.includes('recordsCount'))).toHaveLength(
        1,
      );
      expect(statements[0]?.sql).toContain('AS recordsCount');
      for (const statement of statements) {
        expect(statement.sql).not.toContain('LIMIT');
        expect(statement.sql).not.toContain('OFFSET');
      }
    });

    it('NET-NEW — the feed’s records carry their product aggregate, so the builder can shape them', async () => {
      const { result } = runFeed();
      const feed = await result;

      /*
       * The other half of the feed's contract: `ProductFeedBuilder` reads `sku.product`, then that
       * product's `productType`, `brand` and — through `getPrice()` — its `defaultSku`.
       */
      expect(feed).toHaveLength(2);
      const first = feed[0];
      expect(first).toBeInstanceOf(Sku);
      expect(first?.product).toBeDefined();
      expect(first?.product?.productType?.productTypeID).toBe(ID.productType);
      expect(first?.product?.brand?.brandID).toBe(ID.brand);
      expect(first?.product?.defaultSku?.getPrice()).toBe(toExactDecimal('99.00'));
      /*
       * '99.00', not 99: preserves the digits and the scale the row carried — the fixture row spells
       * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type.
       */
    });
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM integrations/googleIntegration */

/** The Google integration stub — int-05. */

describe('The interface-conformant stub, which carries no feed logic at all', () => {
  /** The six members in `google/Integration.cfc` declaration order — types before display name. */
  const GOOGLE_MEMBERS = [
    'init',
    'getIntegrationTypes',
    'getDisplayName',
    'getSettings',
    'getIntegratedSettings',
    'getSettingOptions',
  ] as const;

  /** `:L57` — the one integration type this adapter claims. */
  const LEGACY_INTEGRATION_TYPE = 'fw1';

  /**
   * `:L61` — the effective display name, which is the method's answer and not the `:L49` attribute.
   */
  const LEGACY_DISPLAY_NAME = 'Google';

  /** `:L49` — defect D11's copy-paste artefact. Asserted absent from behaviour, never repaired. */
  const D11_COPY_PASTE_ARTEFACT = 'USA epay';

  /** `:L55` on the base — the default the override must be seen to displace. */
  const BASE_DISPLAY_NAME_DEFAULT = 'Not Defined';

  /**
   * `:L68` — the sole integrated setting, and the name `getSettingOptions` tests against at `:L74`.
   */
  const INTEGRATED_SETTING_NAME = 'productGoogleProductType';

  /** `:L68` — the descriptor's only member and its value. */
  const INTEGRATED_SETTING_FIELD_TYPE = 'select';

  /** Reads a constructor's own prototype methods in declaration order, constructor excluded. */
  function prototypeMembersOf(constructorFunction: typeof GoogleIntegration): readonly string[] {
    return Object.getOwnPropertyNames(constructorFunction.prototype).filter(
      (name) => name !== 'constructor',
    );
  }

  /** Every string the ported surface can emit, joined for the two sweeps below. */
  function renderEverySurfaceString(subject: GoogleIntegration): string {
    return [
      subject.getDisplayName(),
      subject.getIntegrationTypes(),
      subject.getAdminNavbarHTML(),
      JSON.stringify(subject.getSettings()),
      JSON.stringify(subject.getIntegratedSettings()),
      JSON.stringify(subject.getEventHandlers()),
    ].join(' ');
  }

  describe('NET-NEW GoogleIntegration — the prototype shape and the inheritance', () => {
    it('[NET-NEW] declares the six members in the google/Integration.cfc order, types before name', () => {
      /*
       * `:L51`, `:L55`, `:L59`, `:L63`, `:L67`, `:L73`. The component declares `getIntegrationTypes` second
       * and `getDisplayName` third, the reverse of the interface at IntegrationInterface.cfc:L56-L63. The
       * port follows the component, and asserting the order keeps a side-by-side reading honest.
       */
      expect(prototypeMembersOf(GoogleIntegration)).toEqual([
        'init',
        'getIntegrationTypes',
        'getDisplayName',
        'getSettings',
        'getIntegratedSettings',
        'getSettingOptions',
      ]);
    });

    it('[NET-NEW] declares no seventh member, so the stub cannot grow logic the legacy file lacks', () => {
      const members = prototypeMembersOf(GoogleIntegration);

      /*
       * AAP §0.6.4 — the component carries no feed logic. A seventh member here would mean the stub had
       * acquired behaviour that belongs in `ProductFeedQuery` or `ProductFeedBuilder`.
       */
      expect(members).toHaveLength(GOOGLE_MEMBERS.length);
      expect(members).toHaveLength(6);
    });

    it('[NET-NEW] extends BaseIntegration, exactly as :L49 declares', () => {
      const subject = new GoogleIntegration();

      /*
       * `:L49` carries `extends="Slatwall.integrationServices.BaseIntegration"`. The chain is asserted link
       * by link, because `instanceof` alone would also pass for a deeper accidental chain.
       */
      expect(subject).toBeInstanceOf(GoogleIntegration);
      expect(subject).toBeInstanceOf(BaseIntegration);
      expect(Object.getPrototypeOf(GoogleIntegration.prototype)).toBe(BaseIntegration.prototype);
      expect(Object.getPrototypeOf(BaseIntegration.prototype)).toBe(Object.prototype);
    });

    it('[NET-NEW] takes no constructor argument, because :L51 declares no cfargument', () => {
      expect(GoogleIntegration).toHaveLength(0);
      expect(new GoogleIntegration()).toBeInstanceOf(GoogleIntegration);
    });

    it('[NET-NEW] declares neither inherited member on its own prototype', () => {
      const members = prototypeMembersOf(GoogleIntegration);

      /*
       * `getEventHandlers` and `getAdminNavbarHTML` are absent from `google/Integration.cfc` entirely. They
       * must therefore be inherited rather than re-declared — a port that copied them down would satisfy
       * every value assertion below while quietly duplicating the base.
       */
      expect(members).not.toContain('getEventHandlers');
      expect(members).not.toContain('getAdminNavbarHTML');
    });

    it('[NET-NEW] inherits the base defaults for the two members it does not declare', () => {
      const subject = new GoogleIntegration();

      /* BaseIntegration.cfc:L67 and :L71. */
      expect(subject.getEventHandlers()).toEqual([]);
      expect(subject.getAdminNavbarHTML()).toBe('');
    });

    it('[NET-NEW] satisfies the five-member contract when read through it', () => {
      const contract: IntegrationContract = new GoogleIntegration();

      /* `:L49` also carries `implements="Slatwall.integrationServices.IntegrationInterface"`. */
      expect(contract.getIntegrationTypes()).toBe(LEGACY_INTEGRATION_TYPE);
      expect(contract.getDisplayName()).toBe(LEGACY_DISPLAY_NAME);
      expect(contract.getSettings()).toEqual({});
      expect(contract.getEventHandlers()).toEqual([]);
      expect(contract.init()).toBe(contract);
    });
  });

  describe('NET-NEW GoogleIntegration — the four overridden members', () => {
    it('[NET-NEW] returns the instance itself from init', () => {
      const subject = new GoogleIntegration();

      /* `:L51-L53` — `return this;`, the same as the base, re-declared by the component. */
      expect(subject.init()).toBe(subject);
      expect(subject.init()).toBe(subject.init());
    });

    it('[NET-NEW] returns the exact token "fw1" from getIntegrationTypes', () => {
      const subject = new GoogleIntegration();

      /*
       * `:L55-L57`. `IntegrationInterface.cfc:L64-L72` documents the token vocabulary as shipping, payment,
       * fw1 and custom; this adapter claims `fw1` alone, which is what routes the feed action through the
       * framework rather than through a payment or shipping pipeline.
       */
      expect(subject.getIntegrationTypes()).toBe(LEGACY_INTEGRATION_TYPE);
      expect(subject.getIntegrationTypes()).toBe('fw1');
      /* Not the base default, so the override is observably in effect. */
      expect(subject.getIntegrationTypes()).not.toBe('');
    });

    it('[NET-NEW] returns the exact name "Google" from getDisplayName, not the base default', () => {
      const subject = new GoogleIntegration();

      /*
       * `:L59-L61`. Asserting the negative matters as much as the positive: an override that failed to bind
       * would return `'Not Defined'` from BaseIntegration.cfc:L56 and a "returns a non-empty string"
       * assertion would still pass.
       */
      expect(subject.getDisplayName()).toBe(LEGACY_DISPLAY_NAME);
      expect(subject.getDisplayName()).not.toBe(BASE_DISPLAY_NAME_DEFAULT);
    });

    it('[NET-NEW] returns an empty struct from getSettings, distinct from getIntegratedSettings', () => {
      const subject = new GoogleIntegration();

      /*
       * `:L63-L65` returns `{}` while `:L67-L71` returns one descriptor. Conflating the two would be an easy
       * and invisible port error, so each is asserted against the other rather than in isolation.
       */
      expect(subject.getSettings()).toEqual({});
      expect(Object.keys(subject.getSettings())).toEqual([]);
      expect(subject.getSettings()).not.toEqual(subject.getIntegratedSettings());
      expect(Object.keys(subject.getSettings())).not.toContain(INTEGRATED_SETTING_NAME);
    });
  });

  describe('NET-NEW GoogleIntegration — getIntegratedSettings, the one member with content', () => {
    it('[NET-NEW] returns exactly one descriptor, keyed productGoogleProductType with fieldType select', () => {
      const subject = new GoogleIntegration();
      const integrated = subject.getIntegratedSettings();

      /*
       * `:L67-L71` — `return { productGoogleProductType = {fieldType="select"} };`. Asserted as a whole
       * object rather than key by key, so an extra key would fail here too. This is the only content the
       * legacy component carries, and AAP §0.6.4.3 is why there is no more.
       */
      expect(integrated).toEqual({
        [INTEGRATED_SETTING_NAME]: { fieldType: INTEGRATED_SETTING_FIELD_TYPE },
      });
      expect(Object.keys(integrated)).toEqual([INTEGRATED_SETTING_NAME]);
      expect(integrated[INTEGRATED_SETTING_NAME]?.fieldType).toBe('select');
    });

    it('[NET-NEW] is not a member of the five-member contract, yet is reachable on the class', () => {
      const subject = new GoogleIntegration();

      /*
       * `IntegrationContract.test.ts` asserts the same boundary from the other side, where
       * `getIntegratedSettings` is one of the three deliberately excluded candidates. Here the complement is
       * asserted: it exists on this class, so excluding it from the contract costs the adapter nothing.
       */
      expect(typeof subject.getIntegratedSettings).toBe('function');
      expect(prototypeMembersOf(GoogleIntegration)).toContain('getIntegratedSettings');
    });

    it('[NET-NEW] hands back a fresh struct, and a fresh descriptor inside it, on every call', () => {
      const subject = new GoogleIntegration();

      /*
       * `:L68` builds both objects as literals, so both are new on every call. The nested object is asserted
       * separately because hoisting only the descriptor to module scope would satisfy the outer check and
       * still share mutable state across every invocation on a warm container (AAP §0.6.6 M7).
       */
      expect(subject.getIntegratedSettings()).not.toBe(subject.getIntegratedSettings());
      expect(subject.getIntegratedSettings()[INTEGRATED_SETTING_NAME]).not.toBe(
        subject.getIntegratedSettings()[INTEGRATED_SETTING_NAME],
      );
    });

    it('[NET-NEW] survives a poisoned struct and a poisoned descriptor: the next call is clean', () => {
      const subject = new GoogleIntegration();
      const poisoned = subject.getIntegratedSettings();

      /*
       * The adversarial half — `object.assign` mutates in place, with no cast and no assertion operator.
       */
      Object.assign(poisoned, { injectedByTest: { fieldType: 'text' } });
      const poisonedDescriptor = poisoned[INTEGRATED_SETTING_NAME];
      if (poisonedDescriptor !== undefined) {
        Object.assign(poisonedDescriptor, { fieldType: 'injectedByTest' });
      }

      expect(Object.keys(poisoned)).toEqual([INTEGRATED_SETTING_NAME, 'injectedByTest']);
      expect(subject.getIntegratedSettings()).toEqual({
        [INTEGRATED_SETTING_NAME]: { fieldType: INTEGRATED_SETTING_FIELD_TYPE },
      });
    });

    it('[NET-NEW] shares no integrated setting between two instances', () => {
      const first = new GoogleIntegration();
      const second = new GoogleIntegration();

      Object.assign(first.getIntegratedSettings(), { injectedByTest: { fieldType: 'text' } });

      expect(Object.keys(second.getIntegratedSettings())).toEqual([INTEGRATED_SETTING_NAME]);
    });
  });

  describe('NET-NEW GoogleIntegration — getSettingOptions returns nothing, for every input', () => {
    /** The seeded name, a case variant of it, an unrelated name, and the empty string. */
    const PROBED_SETTING_NAMES = [
      INTEGRATED_SETTING_NAME,
      'PRODUCTGOOGLEPRODUCTTYPE',
      'productGoogleProductTYPE',
      'someUnrelatedSettingName',
      '',
    ] as const;

    it('[NET-NEW] declares one argument, matching `required string settingName` at :L73', () => {
      const subject = new GoogleIntegration();

      /*
       * This is the one member in the whole folder that takes an argument, which is why
       * `IntegrationContract.test.ts` can assert zero arity across all five contract members without
       * exception — this member is deliberately off the contract.
       */
      expect(subject.getSettingOptions).toHaveLength(1);
    });

    it('[NET-NEW] returns undefined for the seeded name, because the branch at :L74 is EMPTY', () => {
      const subject = new GoogleIntegration();

      /*
       * `:L73-L77` is `if(arguments.settingName eq "productGoogleProductType") { }` followed by the end of
       * the function — no return statement anywhere. The port preserves the empty branch verbatim rather
       * than filling it in, per AAP §0.8.2 guideline 4, so the seeded name yields nothing.
       */
      expect(subject.getSettingOptions(INTEGRATED_SETTING_NAME)).toBeUndefined();
    });

    it('[NET-NEW] returns undefined for every other input too, so the branch is unobservable', () => {
      const subject = new GoogleIntegration();

      /*
       * TODO(parity), unnumbered — the empty branch makes the seeded name and an unrelated name
       * indistinguishable from outside. That is the carried behaviour, and it is what makes the second
       * unnumbered note harmless: CFML's `eq` is case-insensitive where TypeScript's `===` is not, but with
       * an empty branch the case-varied inputs below land on the same answer either way.
       */
      for (const settingName of PROBED_SETTING_NAMES) {
        expect({ settingName, options: subject.getSettingOptions(settingName) }).toEqual({
          settingName,
          options: undefined,
        });
      }
    });

    it('[NET-NEW] returns undefined rather than an empty array or null', () => {
      const subject = new GoogleIntegration();
      const options = subject.getSettingOptions(INTEGRATED_SETTING_NAME);

      /*
       * TODO(parity), unnumbered — the declared return type admits `readonly unknown[]` that the body can
       * never produce, mirroring the legacy `returntype="array"` on a function with no return statement. The
       * distinction asserted here is the one a caller can act on: `undefined` is not `[]` and not `null`, so
       * a caller cannot iterate the result and cannot treat it as "present but empty".
       */
      expect(options).toBeUndefined();
      expect(options).not.toEqual([]);
      expect(options).not.toBeNull();
      expect(Array.isArray(options)).toBe(false);
    });

    it('[NET-NEW] never produces options for any probed name, so no input reaches the array branch', () => {
      const subject = new GoogleIntegration();
      const produced = PROBED_SETTING_NAMES.map((settingName) =>
        subject.getSettingOptions(settingName),
      );

      expect(produced.filter((options) => options !== undefined)).toEqual([]);
      expect(produced).toHaveLength(PROBED_SETTING_NAMES.length);
    });
  });

  describe('NET-NEW GoogleIntegration — carried defect D11 and the absent live-Google surface', () => {
    it('[NET-NEW] carries D11 without correcting it: the method answers Google, the attribute is inert', () => {
      const subject = new GoogleIntegration();

      /*
       * Defect D11 — `google/Integration.cfc:L49` carries `displayname="USA epay"`, a copy-paste artefact
       * from the payment adapter this component was cloned from. AAP §0.6.7.6 records it as
       * recorded-not-corrected because the effective display name comes from the method at `:L59`. The port
       * therefore has no member expressing the attribute, and the marker lives at GoogleIntegration.ts:188.
       * Repairing it would be a silent behavioural change; asserting it converts an invisible temptation
       * into a checked decision.
       */
      expect(subject.getDisplayName()).toBe(LEGACY_DISPLAY_NAME);
      expect(renderEverySurfaceString(subject)).not.toContain(D11_COPY_PASTE_ARTEFACT);
      expect(renderEverySurfaceString(subject).toLowerCase()).not.toContain('usa epay');
      expect(renderEverySurfaceString(subject).toLowerCase()).not.toContain('usaepay');
    });

    it('[NET-NEW] exposes no endpoint, credential or token, so the stub cannot call Google', () => {
      const subject = new GoogleIntegration();
      const rendered = renderEverySurfaceString(subject).toLowerCase();

      /*
       * AAP §0.8.3.3 — "Implement it as a stub/mock satisfying the same interface contract — do not make
       * live calls to Google's real API." The component introduces no HTTP client, and AAP §0.5.2 records
       * that `mysql2` is the only runtime dependency, so there is nothing here that could reach the network.
       * This sweep is the observable form of that claim.
       */
      expect(rendered).not.toContain('http://');
      expect(rendered).not.toContain('https://');
      expect(rendered).not.toContain('googleapis');
      expect(rendered).not.toContain('merchants');
      expect(rendered).not.toContain('oauth');
      expect(rendered).not.toContain('client_secret');
      expect(rendered).not.toContain('api_key');
    });

    it('[NET-NEW] emits no feed field, because the feed lives in two other files entirely', () => {
      const subject = new GoogleIntegration();
      const rendered = renderEverySurfaceString(subject);

      /*
       * AAP §0.6.4 — the selection is in `feed.cfc` and the field mapping is in `views/feed/product.cfm`,
       * so not one `g:`-namespaced field or RSS token belongs to this component. Asserting their absence is
       * what makes "the stub is nearly empty by faithfulness" a checked statement rather than an excuse.
       */
      expect(rendered).not.toContain('g:id');
      expect(rendered).not.toContain('g:price');
      expect(rendered).not.toContain('<rss');
      expect(rendered).not.toContain('Slatwall Product Feed');
    });
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM integrations/BaseIntegration */

/** The base integration's default implementations — int-04. */

describe('The default implementations the stub inherits', () => {
  /**
   * The six members in `BaseIntegration.cfc` declaration order. The sixth is beyond the contract, which
   * is why it is listed here and asserted absent in `IntegrationContract.test.ts`.
   */
  const BASE_MEMBERS = [
    'init',
    'getDisplayName',
    'getIntegrationTypes',
    'getSettings',
    'getEventHandlers',
    'getAdminNavbarHTML',
  ] as const;

  /** `:L56` — the exact literal. Not "Undefined", not an empty string, not a localised key. */
  const LEGACY_DISPLAY_NAME_DEFAULT = 'Not Defined';

  /** A subclass that overrides nothing at all. */
  class InheritingIntegration extends BaseIntegration {}

  /** Fresh instances per case, so no case can observe a value another case produced or mutated. */
  function subjects(): readonly { readonly label: string; readonly subject: BaseIntegration }[] {
    return [
      { label: 'BaseIntegration', subject: new BaseIntegration() },
      { label: 'InheritingIntegration', subject: new InheritingIntegration() },
    ];
  }

  /** Reads the prototype's own methods in declaration order, with the constructor excluded. */
  function prototypeMembersOf(constructorFunction: typeof BaseIntegration): readonly string[] {
    return Object.getOwnPropertyNames(constructorFunction.prototype).filter(
      (name) => name !== 'constructor',
    );
  }

  describe('NET-NEW BaseIntegration — the prototype shape', () => {
    it('[NET-NEW] declares the six members in the BaseIntegration.cfc order', () => {
      /*
       * `:L51`, `:L55`, `:L59`, `:L63`, `:L67`, `:L71`. A class body installs its methods on the prototype
       * in declaration order, so this asserts the ported order matches the legacy order without reading the
       * file as text.
       */
      expect(prototypeMembersOf(BaseIntegration)).toEqual([
        'init',
        'getDisplayName',
        'getIntegrationTypes',
        'getSettings',
        'getEventHandlers',
        'getAdminNavbarHTML',
      ]);
    });

    it('[NET-NEW] declares no seventh member, so the base cannot drift wider than the legacy component', () => {
      const members = prototypeMembersOf(BaseIntegration);

      expect(members).toHaveLength(BASE_MEMBERS.length);
      expect(members).toHaveLength(6);
    });

    it('[NET-NEW] extends nothing, because org/Hibachi/ is a boundary and never a carry-over', () => {
      /*
       * `BaseIntegration.cfc:L49` reads `component extends="Slatwall.org.Hibachi.HibachiObject"`. AAP
       * §0.8.3.2 forbids porting or depending on anything under `org/Hibachi/`, so the ported class sits
       * directly on `Object`. Once the file compiles, the prototype chain is the only place a dropped base
       * class is observable — an accidental `extends` would leave an extra link here.
       */
      expect(Object.getPrototypeOf(BaseIntegration.prototype)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(BaseIntegration)).toBe(Function.prototype);
    });

    it('[NET-NEW] takes no constructor argument, because the legacy initialiser takes none either', () => {
      /*
       * `:L51` — `public any function init()` declares no `<cfargument>`. The port therefore has no
       * declared constructor at all, so its arity is zero and construction cannot fail.
       */
      expect(BaseIntegration).toHaveLength(0);
      expect(new BaseIntegration()).toBeInstanceOf(BaseIntegration);
    });

    it('[NET-NEW] resolves all six members on a subclass that overrides nothing', () => {
      const subject = new InheritingIntegration();

      for (const name of BASE_MEMBERS) {
        /*
         * `in` rather than an own-property check, because inheritance is the point of this case.
         */
        expect(name in subject).toBe(true);
      }

      expect(prototypeMembersOf(InheritingIntegration)).toEqual([]);
      expect(subject).toBeInstanceOf(BaseIntegration);
    });
  });

  describe('NET-NEW BaseIntegration — the six default values', () => {
    it('[NET-NEW] returns the instance itself from init, which is what `return this` means', () => {
      for (const { subject } of subjects()) {
        /*
         * `:L51-L53`. Identity, not equality: a base returning a copy would satisfy `toEqual` and still
         * break the `init()` chaining the legacy factory depends on. Two calls also return the same thing.
         */
        expect(subject.init()).toBe(subject);
        expect(subject.init()).toBe(subject.init());
      }
    });

    it('[NET-NEW] returns the exact string "Not Defined" from getDisplayName', () => {
      for (const { label, subject } of subjects()) {
        /*
         * `:L55-L57`. The literal matters: it is what an integration that forgets to override displays, and
         * `GoogleIntegration.test.ts` asserts the Google adapter does not return it, which only proves the
         * override took effect while this default is pinned.
         */
        expect({ from: label, displayName: subject.getDisplayName() }).toEqual({
          from: label,
          displayName: LEGACY_DISPLAY_NAME_DEFAULT,
        });
        expect(subject.getDisplayName()).toBe('Not Defined');
      }
    });

    it('[NET-NEW] returns the empty string from getIntegrationTypes', () => {
      for (const { subject } of subjects()) {
        /* `:L59-L61`. An empty token list — the base claims no integration type at all. */
        expect(subject.getIntegrationTypes()).toBe('');
        expect(subject.getIntegrationTypes()).not.toBe('fw1');
      }
    });

    it('[NET-NEW] returns an empty struct from getSettings', () => {
      for (const { subject } of subjects()) {
        const settings = subject.getSettings();

        /* `:L63-L65`. Empty, an object rather than a boolean, and not an array. */
        expect(settings).toEqual({});
        expect(Object.keys(settings)).toEqual([]);
        expect(Array.isArray(settings)).toBe(false);
      }
    });

    it('[NET-NEW] returns an empty array from getEventHandlers', () => {
      for (const { subject } of subjects()) {
        const handlers = subject.getEventHandlers();

        /*
         * `:L67-L69`. empty, and an array rather than the ColdSpring XML string the stale hint describes.
         */
        expect(handlers).toEqual([]);
        expect(Array.isArray(handlers)).toBe(true);
        expect(handlers).toHaveLength(0);
      }
    });

    it('[NET-NEW] returns the empty string from getAdminNavbarHTML, the member beyond the contract', () => {
      for (const { subject } of subjects()) {
        /*
         * `:L71-L73`. This is the sixth member — inherited by every integration yet deliberately absent
         * from the five-member contract, which `IntegrationContract.test.ts` asserts from the other side.
         * Its default is the empty string, so an integration that adds no admin navigation contributes no
         * markup rather than the string "undefined".
         */
        expect(subject.getAdminNavbarHTML()).toBe('');
        expect(typeof subject.getAdminNavbarHTML()).toBe('string');
      }
    });

    it('[NET-NEW] satisfies the five-member contract while carrying its own sixth member', () => {
      const contract: IntegrationContract = new BaseIntegration();
      const subject = new BaseIntegration();

      expect(contract.getDisplayName()).toBe(LEGACY_DISPLAY_NAME_DEFAULT);
      /*
       * Reachable at runtime, and off the contract at compile time — both halves are the intent.
       */
      expect(typeof subject.getAdminNavbarHTML).toBe('function');
    });
  });

  describe('NET-NEW BaseIntegration — the mutable defaults are fresh per call', () => {
    it('[NET-NEW] hands back a different struct on every getSettings call', () => {
      const subject = new BaseIntegration();

      /*
       * `:L64` returns a literal `{}`. A port that hoisted it to a module-scope constant would satisfy every
       * value assertion above and still share one object across every integration and — under AAP §0.6.6 M7
       * — across every invocation on a warm Lambda container, because module scope is the only thing that
       * survives. Reference inequality is the assertion that rules that out.
       */
      expect(subject.getSettings()).not.toBe(subject.getSettings());
    });

    it('[NET-NEW] hands back a different array on every getEventHandlers call', () => {
      const subject = new BaseIntegration();

      /* `:L68` returns a literal `[]`; same hazard, same assertion. */
      expect(subject.getEventHandlers()).not.toBe(subject.getEventHandlers());
    });

    it('[NET-NEW] survives a poisoned struct: the next call is still empty', () => {
      const subject = new BaseIntegration();
      const poisonedSettings = subject.getSettings();
      const injected: Readonly<Record<string, IntegrationSettingDescriptor>> = {
        injectedByTest: { fieldType: 'select' },
      };

      /*
       * The adversarial half. `Object.assign` mutates the returned struct in place — no cast, no `any`, no
       * non-null assertion — and the next call must be unaffected. Were the default shared, the injected
       * key would reappear and this case would fail.
       */
      Object.assign(poisonedSettings, injected);
      expect(Object.keys(poisonedSettings)).toEqual(['injectedByTest']);

      expect(subject.getSettings()).toEqual({});
      expect(Object.keys(subject.getSettings())).toEqual([]);
    });

    it('[NET-NEW] survives a poisoned array: the next call is still empty', () => {
      const subject = new BaseIntegration();
      const poisonedHandlers = subject.getEventHandlers();

      /* Assigning index 0 on an empty array also advances its length, so the poison is real. */
      Object.assign(poisonedHandlers, ['injectedByTest']);
      expect(poisonedHandlers).toHaveLength(1);

      expect(subject.getEventHandlers()).toEqual([]);
      expect(subject.getEventHandlers()).toHaveLength(0);
    });

    it('[NET-NEW] shares no default between two instances', () => {
      const first = new BaseIntegration();
      const second = new BaseIntegration();

      Object.assign(first.getSettings(), { injectedByTest: { fieldType: 'select' } });
      Object.assign(first.getEventHandlers(), ['injectedByTest']);

      /*
       * Cross-instance leakage is the same defect one step further out; it is asserted separately.
       */
      expect(second.getSettings()).toEqual({});
      expect(second.getEventHandlers()).toEqual([]);
      expect(first.getSettings()).not.toBe(second.getSettings());
    });

    it('[NET-NEW] leaves the defaults mutable, inventing no immutability the legacy lacked', () => {
      const subject = new BaseIntegration();

      /*
       * CFML's `{}` and `[]` are ordinary mutable values, and `:L63-L69` returns them unfrozen. Freezing
       * them here would be a quiet behavioural change of exactly the kind AAP §0.8.2 guideline 4 forbids, so
       * the port's choice is asserted rather than left to inference. Freshness per call — the three cases
       * above — is what protects callers, not immutability.
       */
      expect(Object.isFrozen(subject.getSettings())).toBe(false);
      expect(Object.isFrozen(subject.getEventHandlers())).toBe(false);
    });
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM integrations/IntegrationContract */

/** The integration contract — int-03. */

describe('The five-method `<cfinterface>` contract both of the above implement', () => {
  /* compile-time claims. */
  type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

  /** The five members, in the `<cfinterface>` declaration order of `IntegrationInterface.cfc`. */
  const CONTRACT_MEMBERS = [
    'init',
    'getDisplayName',
    'getIntegrationTypes',
    'getSettings',
    'getEventHandlers',
  ] as const;

  type DeclaredMemberName = (typeof CONTRACT_MEMBERS)[number];

  type _EveryDeclaredNameIsOnTheContract = AssertAssignable<
    DeclaredMemberName,
    keyof IntegrationContract
  >;
  type _EveryContractKeyIsDeclaredHere = AssertAssignable<
    keyof IntegrationContract,
    DeclaredMemberName
  >;

  /**
   * The three members that exist in the folder and are deliberately not on the contract, each with the
   * legacy locator that would justify adding it if the boundary were ever widened.
   */
  const EXCLUDED_CANDIDATES = [
    'getAdminNavbarHTML',
    'getIntegratedSettings',
    'getSettingOptions',
  ] as const;

  type ExcludedCandidateName = (typeof EXCLUDED_CANDIDATES)[number];

  /** `Extract` collapses to `never` only while none of the three has reached the contract. */
  type _NoExcludedCandidateReachedTheContract = AssertAssignable<
    Extract<keyof IntegrationContract, ExcludedCandidateName>,
    never
  >;

  type _BaseIntegrationConformsToTheContract = AssertAssignable<
    BaseIntegration,
    IntegrationContract
  >;
  type _GoogleIntegrationConformsToTheContract = AssertAssignable<
    GoogleIntegration,
    IntegrationContract
  >;

  /* A conformer that is not a `BaseIntegration`. */
  class MinimalConformer implements IntegrationContract {
    public init(): this {
      return this;
    }

    public getDisplayName(): string {
      return 'Minimal';
    }

    public getIntegrationTypes(): string {
      return 'custom';
    }

    public getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
      return {};
    }

    public getEventHandlers(): readonly unknown[] {
      return [];
    }
  }

  /* Exhaustive member access without `any`. */
  type ContractMethod = (...args: never[]) => unknown;

  const METHOD_READERS: Readonly<
    Record<DeclaredMemberName, (subject: IntegrationContract) => ContractMethod>
  > = {
    init: (subject) => subject.init,
    getDisplayName: (subject) => subject.getDisplayName,
    getIntegrationTypes: (subject) => subject.getIntegrationTypes,
    getSettings: (subject) => subject.getSettings,
    getEventHandlers: (subject) => subject.getEventHandlers,
  };

  const METHOD_INVOKERS: Readonly<
    Record<DeclaredMemberName, (subject: IntegrationContract) => unknown>
  > = {
    init: (subject) => subject.init(),
    getDisplayName: (subject) => subject.getDisplayName(),
    getIntegrationTypes: (subject) => subject.getIntegrationTypes(),
    getSettings: (subject) => subject.getSettings(),
    getEventHandlers: (subject) => subject.getEventHandlers(),
  };

  /** Fresh instances per case, so no case can observe a value another case produced. */
  function conformers(): readonly {
    readonly label: string;
    readonly subject: IntegrationContract;
  }[] {
    return [
      { label: 'BaseIntegration', subject: new BaseIntegration() },
      { label: 'GoogleIntegration', subject: new GoogleIntegration() },
      { label: 'MinimalConformer', subject: new MinimalConformer() },
    ];
  }

  /* Source-text inspection. */
  const CONTRACT_SOURCE_PATH = join(
    __dirname,
    '..',
    '..',
    'src',
    'integrations',
    'google',
    'IntegrationContract.ts',
  );

  const CONTRACT_INTERFACE_OPENING = 'export interface IntegrationContract {';

  /** Matches a two-space-indented member declaration such as ` getSettings(): …;`. */
  const MEMBER_DECLARATION_PATTERN = /^ {2}([A-Za-z][A-Za-z0-9]*)\(/;

  interface ContractDeclaration {
    /** The interface body, exclusive of the opening line and the closing brace. */
    readonly body: string;
    /** Member names in declaration order. */
    readonly members: readonly string[];
  }

  function readDeclaredContractMembers(): ContractDeclaration {
    const text = readFileSync(CONTRACT_SOURCE_PATH, 'utf8');
    const opensAt = text.indexOf(CONTRACT_INTERFACE_OPENING);

    if (opensAt === -1) {
      throw new Error(
        `${CONTRACT_SOURCE_PATH} no longer declares "${CONTRACT_INTERFACE_OPENING}", so the source-text ` +
          'cases below would assert nothing. Fix the reader rather than deleting the cases.',
      );
    }

    const bodyStart = opensAt + CONTRACT_INTERFACE_OPENING.length;
    const closesAt = text.indexOf('\n}', bodyStart);

    if (closesAt === -1) {
      throw new Error(
        `${CONTRACT_SOURCE_PATH} has no closing brace after the interface opening, so the body could not ` +
          'be bounded.',
      );
    }

    const body = text.slice(bodyStart, closesAt);
    const members: string[] = [];

    for (const line of body.split('\n')) {
      const matched = MEMBER_DECLARATION_PATTERN.exec(line);
      const name = matched?.[1];

      if (name !== undefined) {
        members.push(name);
      }
    }

    return { body, members };
  }

  describe('NET-NEW IntegrationContract — the five declared members', () => {
    it('[NET-NEW] reads the interface body, so the two source-text cases below assert something', () => {
      const declaration = readDeclaredContractMembers();

      /*
       * A self-check on the reader. Without it, a bad slice would leave both censuses vacuously green.
       * The body must be non-empty and must not have overrun into the sibling interface declaration.
       */
      expect(declaration.body.length).toBeGreaterThan(0);
      expect(declaration.body).not.toContain('export interface');
      expect(declaration.members.length).toBeGreaterThan(0);
    });

    it('[NET-NEW] declares the five members in the IntegrationInterface.cfc order', () => {
      const { members } = readDeclaredContractMembers();

      /*
       * `:L52`, `:L56`, `:L63`, `:L75`, `:L82` — the order the legacy `<cffunction>` tags sit in. Order is
       * asserted, not just membership, because the ported file is the contract a reviewer reads against the
       * legacy interface side by side, and a reordered declaration makes that comparison harder for no gain.
       */
      expect(members).toEqual([
        'init',
        'getDisplayName',
        'getIntegrationTypes',
        'getSettings',
        'getEventHandlers',
      ]);
    });

    it('[NET-NEW] declares no sixth member, so the contract cannot drift wider than the interface', () => {
      const { members } = readDeclaredContractMembers();

      expect(members).toHaveLength(CONTRACT_MEMBERS.length);
      expect(members).toHaveLength(5);

      /*
       * The compile-time half of the same claim lives in `_EveryContractKeyIsDeclaredHere` above: a sixth
       * key on the interface would fail `tsc` before this case ever ran. Both halves are kept, because the
       * type alias catches a widened interface while this case also catches a widened file — a member added
       * to the declaration but shadowed by an identical name elsewhere would slip past the type alone.
       */
    });

    it('[NET-NEW] excludes the three candidate sixth members that exist elsewhere in the folder', () => {
      const { members } = readDeclaredContractMembers();

      /*
       * `getAdminNavbarHTML` — BaseIntegration.cfc:L71. Present on the base class, so every integration
       * inherits it; absent from the interface, so no adapter is obliged to provide it.
       * `getIntegratedSettings` — google/Integration.cfc:L67. A Google-only member.
       * `getSettingOptions` — google/Integration.cfc:L73. Google-only, and the one member in the folder
       * that takes an argument, which is why the zero-arity case below can be unconditional.
       */
      for (const candidate of EXCLUDED_CANDIDATES) {
        expect(members).not.toContain(candidate);
      }

      /* The values are asserted too, so the list itself cannot silently empty out and pass. */
      expect(EXCLUDED_CANDIDATES).toEqual([
        'getAdminNavbarHTML',
        'getIntegratedSettings',
        'getSettingOptions',
      ]);
    });

    it('[NET-NEW] resolves every declared name on every conformer, wired to the member of that name', () => {
      for (const { label, subject } of conformers()) {
        for (const name of CONTRACT_MEMBERS) {
          const method = METHOD_READERS[name](subject);

          /*
           * `method.name` guards the reader record itself. A copy-paste slip in `METHOD_READERS` would hand
           * back a different member and every other case in this file would still report green, so the
           * wiring is asserted rather than assumed. The conformer label rides along inside the compared
           * object so a failure names which of the three broke.
           */
          expect({ conformer: label, member: name, resolved: method.name }).toEqual({
            conformer: label,
            member: name,
            resolved: name,
          });
          expect(typeof method).toBe('function');
        }
      }
    });
  });

  describe('NET-NEW IntegrationContract — arity, synchronicity and visibility', () => {
    it('[NET-NEW] declares every member zero-arity, because no legacy tag declares a cfargument', () => {
      for (const { subject } of conformers()) {
        for (const name of CONTRACT_MEMBERS) {
          /*
           * `IntegrationInterface.cfc:L52-L87` — five `<cffunction>` tags, zero `<cfargument>` tags between
           * them. The one legacy member that does take an argument, `getSettingOptions(required string
           * settingName)`, is deliberately off the contract, so this holds for all five without exception.
           */
          expect(METHOD_READERS[name](subject)).toHaveLength(0);
        }
      }
    });

    it('[NET-NEW] declares no member async, proven from the function rather than the return type', () => {
      for (const { subject } of conformers()) {
        for (const name of CONTRACT_MEMBERS) {
          const method = METHOD_READERS[name](subject);

          /*
           * A declaration reading `: string` can still be produced by an `async` body that returns a
           * promise, so the constructor name is what settles it. CFML has no async facility at all, so an
           * `AsyncFunction` anywhere here would be an invention of the port (AAP §0.8.3.5, IR-12).
           */
          expect(method.constructor.name).toBe('Function');
          expect(method.constructor.name).not.toBe('AsyncFunction');
        }
      }
    });

    it('[NET-NEW] returns a settled value from every member, never a promise to await', () => {
      for (const { subject } of conformers()) {
        for (const name of CONTRACT_MEMBERS) {
          const returned = METHOD_INVOKERS[name](subject);

          /*
           * The runtime half of the synchronicity claim. AAP §0.6.6 M8 records the same commitment for
           * `SettingResolverPort`: the contract is synchronous so no caller in the slice can come to depend
           * on background completion.
           */
          expect(returned).not.toBeInstanceOf(Promise);
          expect(returned).toBeDefined();
        }
      }
    });

    it('[NET-NEW] leaves getEventHandlers as reachable as the four that declare access="public"', () => {
      /*
       * `IntegrationInterface.cfc:L82` is the one tag with no `access` attribute, while `:L52`, `:L56`,
       * `:L63` and `:L75` all declare `access="public"`. A TypeScript interface has no visibility facility,
       * so the translation makes all five equally reachable; the observable claim is that the un-annotated
       * member is callable from outside its class exactly like its four siblings.
       */
      for (const { subject } of conformers()) {
        expect(Array.isArray(subject.getEventHandlers())).toBe(true);
        expect(typeof subject.getDisplayName()).toBe('string');
      }
    });
  });

  describe('NET-NEW IntegrationContract — the declared return shapes', () => {
    it('[NET-NEW] returns the subject itself from init, which is what `return this` means', () => {
      for (const { subject } of conformers()) {
        /*
         * `IntegrationInterface.cfc:L52` declares `returntype="any"`; every implementation returns itself.
         */
        expect(subject.init()).toBe(subject);
      }
    });

    it('[NET-NEW] returns a string from getDisplayName and getIntegrationTypes', () => {
      for (const { subject } of conformers()) {
        expect(typeof subject.getDisplayName()).toBe('string');
        expect(typeof subject.getIntegrationTypes()).toBe('string');
      }
    });

    it('[NET-NEW] returns a struct from getSettings, carrying the stale "return true" hint unrepaired', () => {
      for (const { subject } of conformers()) {
        const settings = subject.getSettings();

        /*
         * TODO(parity), unnumbered — IntegrationInterface.cfc:L75-L79. The tag declares
         * `returntype="struct"` while its own hint says to "return true only if there is a
         * /views/main/default.cfm file". The prose is stale and is carried across rather than repaired
         * (AAP §0.8.2 guideline 4); what is asserted is the declared shape the port kept, because that is
         * the part that is executable.
         */
        expect(typeof settings).toBe('object');
        expect(settings).not.toBeNull();
        expect(typeof settings).not.toBe('boolean');
        expect(Array.isArray(settings)).toBe(false);
      }
    });

    it('[NET-NEW] returns an array from getEventHandlers, carrying the stale ColdSpring hint unrepaired', () => {
      for (const { subject } of conformers()) {
        const handlers = subject.getEventHandlers();

        /*
         * TODO(parity), unnumbered — IntegrationInterface.cfc:L82-L86. The tag declares
         * `returntype="array"` while its hint describes "valid coldspring xml". Same treatment: the
         * declared shape is asserted, the stale prose is not repaired.
         */
        expect(Array.isArray(handlers)).toBe(true);
        expect(typeof handlers).not.toBe('string');
      }
    });

    it('[NET-NEW] types a settings entry by its fieldType alone, matching IntegrationSettingDescriptor', () => {
      /*
       * The descriptor is the only other export of the contract file. Its single member is what the Google
       * adapter's `getIntegratedSettings` actually produces — `{ fieldType: "select" }` at
       * google/Integration.cfc:L67-L71 — so a descriptor that grew a second required member would break
       * that adapter. Asserting the shape here keeps the two files honest about one another.
       */
      const descriptor: IntegrationSettingDescriptor = { fieldType: 'select' };

      expect(Object.keys(descriptor)).toEqual(['fieldType']);
      expect(descriptor.fieldType).toBe('select');
    });
  });

  describe('NET-NEW IntegrationContract — conformance of the shipped implementations', () => {
    it('[NET-NEW] is satisfied by BaseIntegration', () => {
      const subject: IntegrationContract = new BaseIntegration();

      for (const name of CONTRACT_MEMBERS) {
        expect(typeof METHOD_READERS[name](subject)).toBe('function');
      }
    });

    it('[NET-NEW] is satisfied by GoogleIntegration', () => {
      const subject: IntegrationContract = new GoogleIntegration();

      for (const name of CONTRACT_MEMBERS) {
        expect(typeof METHOD_READERS[name](subject)).toBe('function');
      }
    });

    it('[NET-NEW] is satisfiable without extending BaseIntegration, as the legacy interface demands', () => {
      /*
       * `google/Integration.cfc:L49` carries `extends="…BaseIntegration"` and
       * `implements="…IntegrationInterface"` as two independent declarations. The interface itself demands
       * no base class, and `MinimalConformer` is the proof the port preserved that: it satisfies the
       * contract while inheriting nothing. Were the port to have folded a base-class dependency into the
       * interface, the class declaration above would not compile.
       */
      const subject = new MinimalConformer();

      expect(subject).not.toBeInstanceOf(BaseIntegration);
      expect(subject.getDisplayName()).toBe('Minimal');
      expect(subject.getIntegrationTypes()).toBe('custom');
      expect(subject.init()).toBe(subject);
    });

    it('[NET-NEW] exposes no member that reaches Google, so the stub cannot make a live call', () => {
      /*
       * AAP §0.8.3.3 — the adapter is a stub and no live call to Google is introduced anywhere. The contract
       * is the surface a future adapter is written against, so the claim belongs here as well as in
       * `GoogleIntegration.test.ts`: nothing the contract can return is a Google endpoint or credential.
       */
      for (const { subject } of conformers()) {
        const rendered = [
          subject.getDisplayName(),
          subject.getIntegrationTypes(),
          JSON.stringify(subject.getSettings()),
          JSON.stringify(subject.getEventHandlers()),
        ].join(' ');

        expect(rendered).not.toContain('http://');
        expect(rendered).not.toContain('https://');
        expect(rendered.toLowerCase()).not.toContain('googleapis');
        expect(rendered.toLowerCase()).not.toContain('oauth');
      }
    });
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM handlers/googleFeedHandler */

/** The Google product-feed handler — int-06. */

describe("The feed's handler — the fourth and last part of the feed's coverage", () => {
  /* compile-time claims about the collaborator surface. */
  type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

  const COLLABORATOR_NAMES = [
    'feedQuery',
    'feedSerializer',
    'hostConfiguration',
    'readProductImages',
    'clock',
    'assertMaterialisationBounded',
  ] as const;

  type CollaboratorName = (typeof COLLABORATOR_NAMES)[number];

  type _EveryNamedCollaboratorIsDeclared = AssertAssignable<
    CollaboratorName,
    keyof GoogleFeedHandlerCollaborators
  >;
  type _EveryDeclaredCollaboratorIsNamed = AssertAssignable<
    keyof GoogleFeedHandlerCollaborators,
    CollaboratorName
  >;

  /** The handler's own response shape, taken from its declaration rather than re-imported. */
  type FeedResponse = Awaited<ReturnType<GoogleFeedHandler['product']>>;

  /* Fixture values. */
  const RENDER_HOST = 'catalog.example.test';
  const ABSOLUTE_URL_PREFIX = 'http://catalog.example.test';
  const SECOND_RENDER_HOST = 'second.example.test';

  /** `product.cfm:L1-L11` — the envelope, byte for byte. */
  const EXPECTED_XML_DECLARATION = '<?xml version="1.0"?>';
  const EXPECTED_RSS_OPEN_TAG = '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">';
  const EXPECTED_CHANNEL_TITLE_ELEMENT = '<title>Slatwall Product Feed</title>';

  const RENDER_INSTANT_EPOCH_MS = Date.UTC(2024, 0, 1, 12, 30, 45);
  /** Raw, unpadded, exactly as the legacy `utcHourOffset` reaches the template. */
  const RAW_UTC_HOUR_OFFSET = '5';

  const SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
  const SECOND_SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';
  const PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
  const BRAND_ID = 'ddddddddddddddddddddddddddddddd4';

  const SETTING_SEEDS: readonly SettingSeed[] = Object.freeze([
    Object.freeze({ settingName: 'globalURLKeyProduct', value: 'product' }),
    Object.freeze({ settingName: 'imageMissingImagePath', value: '/missing.png' }),
    Object.freeze({ settingName: 'skuShippingWeight', value: '5' }),
    Object.freeze({ settingName: 'skuShippingWeightUnitCode', value: 'lb' }),
  ]);

  const SKU_IMAGE_FILE = 'nike-air.jpg';
  const SECOND_SKU_IMAGE_FILE = 'nike-court.jpg';
  const SKU_COMPOSED_IMAGE_PATH = '/product/default/nike-air.jpg';
  const SECOND_SKU_COMPOSED_IMAGE_PATH = '/product/default/nike-court.jpg';
  const ADDITIONAL_IMAGE_PATH = '/product/default/nike-air-side.jpg';

  /** Applied to every record, so the repeated `g:additional_image_link` branch is exercised. */
  const PRODUCT_IMAGES: readonly ProductFeedImage[] = Object.freeze([
    Object.freeze({ imagePath: ADDITIONAL_IMAGE_PATH }),
  ]);

  /*
   * Hand-written call logs. No mocking library is used anywhere: AAP §0.5.2 closes the dependency set,
   * and AAP §0.4.3.6 records that the legacy suite has no mocking facility at all.
   */

  /** One recorded execution of the feed's selection. */
  interface SelectionCall {
    readonly query: SmartListQuery;
    readonly member: 'execute' | 'executeRecords';
  }

  interface ClockCallLog {
    now: number;
    utcHourOffset: number;
  }

  interface HostReadLog {
    reads: number;
  }

  interface HandlerScenario {
    readonly handler: GoogleFeedHandler;
    /** The very serializer the handler holds, so a byte-parity build is the same code path. */
    readonly builder: ProductFeedBuilder;
    /** The very context the handler composes for its first invocation. */
    readonly context: ProductFeedRenderContext;
    readonly sku: Sku;
    readonly secondSku: Sku;
    /**
     * The one product both SKUs hang off, exposed so a case can seed its owned image collection.
     */
    readonly product: Product;
    /** The two SKU codes as strings. */
    readonly skuCode: string;
    readonly secondSkuCode: string;
    readonly selectionCalls: readonly SelectionCall[];
    readonly imageReaderCalls: readonly string[];
    readonly clockCalls: ClockCallLog;
    /** How many times the materialisation gate was consulted. */
    readonly materialisationGateCalls: { readonly count: number };
    readonly hostReads: HostReadLog;
    readonly images: ImagePathDouble;
    readonly pricing: PricingDouble;
    /** Replaces what the next selection returns. */
    setSelection(skus: readonly Sku[]): void;
    /** Builds the document this file expects, from the same records and the same serializer. */
    buildDirectly(skus: readonly Sku[]): Promise<string>;
  }

  interface ScenarioSeed {
    readonly host?: string;
    /** Replaces the real serializer, for the error matrix only. */
    readonly serializer?: ProductFeedSerializer;
    /** Makes the SKU source itself fail, proving the catch wraps the selection step too. */
    readonly selectionFailure?: Error;
    /** Replaces the image reader. */
    readonly readProductImages?: (sku: Sku) => readonly ProductFeedImage[];

    /** Stands in for the anonymous materialisation gate (CWE-400). */
    readonly assertMaterialisationBounded?: () => void;
  }

  function createHandlerScenario(seed: ScenarioSeed = {}): HandlerScenario {
    /*
     * The legacy fixture contract from `meta/tests/unit/Helper.cfc:L52-L77`, reused rather than retyped.
     */
    const legacyFixture = createTestMerchandiseProductData();

    const settings = createSettingResolverDouble({ settings: [...SETTING_SEEDS] });
    const images = createImagePathDouble({
      imagePathsByImageFile: {
        [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH,
        [SECOND_SKU_IMAGE_FILE]: SECOND_SKU_COMPOSED_IMAGE_PATH,
      },
    });
    const pricing = createPricingDouble();

    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
    });
    const brand = buildBrand({ brandID: BRAND_ID, brandName: 'Nike' });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: legacyFixture.productCode,
      productName: 'TEMPLATE-ONLY-PRODUCT-NAME',
      urlTitle: 'nike-air',
      calculatedTitle: 'PERSISTED-CALCULATED-TITLE',
      productType,
      brand,
    });
    product.price = toExactDecimal(legacyFixture.price);

    const skuCode = `${legacyFixture.productCode}-1`;
    const secondSkuCode = `${legacyFixture.productCode}-2`;

    const sku = buildSku({
      skuID: SKU_ID,
      skuCode,
      price: 90,
      imageFile: SKU_IMAGE_FILE,
      product,
    });
    const secondSku = buildSku({
      skuID: SECOND_SKU_ID,
      skuCode: secondSkuCode,
      price: 95,
      imageFile: SECOND_SKU_IMAGE_FILE,
      product,
    });

    const selectionCalls: SelectionCall[] = [];
    let selectedSkus: readonly Sku[] = [sku];
    /*
     * The records-only reading `ProductFeedQuery` declares as its seam — the view
     * `integrationServices/google/views/feed/product.cfm:L16` loops. The double answers the rows and
     * records the description it was handed, so a case can assert both what was selected and that only
     * this member was used.
     */
    const skuSource: ProductFeedSkuSource = {
      executeRecords: <TEntityName extends SmartListRootEntityName>(
        query: SmartListQuery<TEntityName>,
      ): Promise<SmartListRecord<TEntityName>[]> => {
        selectionCalls.push({ query, member: 'executeRecords' });

        if (seed.selectionFailure !== undefined) {
          return Promise.reject(seed.selectionFailure);
        }

        /*
         * The seeded SKUs are the rows for this root entity. The cast is confined to this one line and is
         * unavoidable in a double that satisfies a generic member: the harness seeds SKUs because the feed
         * roots at `SlatwallSku`, and a query rooted anywhere else never reaches this double.
         */
        return Promise.resolve([...selectedSkus] as unknown as SmartListRecord<TEntityName>[]);
      },
    };

    const builder = new ProductFeedBuilder(
      images.imagePaths,
      pricing.pricing,
      settings.resolver,
      GENEROUS_FEED_RENDER_BUDGET,
    );

    const imageReaderCalls: string[] = [];
    const materialisationGateCalls: { count: number } = { count: 0 };
    const clockCalls: ClockCallLog = { now: 0, utcHourOffset: 0 };
    const hostReads: HostReadLog = { reads: 0 };
    const host = seed.host ?? RENDER_HOST;

    const handler = createGoogleFeedHandler({
      feedQuery: new ProductFeedQuery(skuSource),
      feedSerializer: seed.serializer ?? builder,
      /*
       * A counting accessor rather than a plain literal. It is the only way to observe that the host is
       * read once at creation rather than per invocation, which is the M7 commitment the module states.
       */
      hostConfiguration: {
        get host(): string {
          hostReads.reads += 1;
          return host;
        },
      },
      readProductImages: (candidate): readonly ProductFeedImage[] => {
        imageReaderCalls.push(candidate.skuID);

        if (seed.readProductImages !== undefined) {
          return seed.readProductImages(candidate);
        }

        return PRODUCT_IMAGES;
      },
      clock: {
        now: (): Date => {
          clockCalls.now += 1;
          return new Date(RENDER_INSTANT_EPOCH_MS);
        },
        utcHourOffset: (): string => {
          clockCalls.utcHourOffset += 1;
          return RAW_UTC_HOUR_OFFSET;
        },
      },
      /*
       * Counted as well as delegated, so a case can assert the gate ran before the selection did.
       */
      assertMaterialisationBounded: (): void => {
        materialisationGateCalls.count += 1;
        seed.assertMaterialisationBounded?.();
      },
    });

    const context: ProductFeedRenderContext = {
      host,
      renderTime: new Date(RENDER_INSTANT_EPOCH_MS),
      utcHourOffset: RAW_UTC_HOUR_OFFSET,
    };

    return {
      handler,
      builder,
      context,
      sku,
      secondSku,
      product,
      skuCode,
      secondSkuCode,
      selectionCalls,
      imageReaderCalls,
      materialisationGateCalls,
      clockCalls,
      hostReads,
      images,
      pricing,
      setSelection: (skus: readonly Sku[]): void => {
        selectedSkus = [...skus];
      },
      buildDirectly: (skus: readonly Sku[]): Promise<string> => {
        const records: readonly ProductFeedRecord[] = skus.map((candidate) => ({
          sku: candidate,
          productImages: PRODUCT_IMAGES,
        }));
        return builder.build(records, context);
      },
    };
  }

  /* The error-stream capture. */
  interface ConsoleErrorCapture {
    readonly lines: readonly string[];
    restore(): void;
  }

  function captureConsoleError(): ConsoleErrorCapture {
    const lines: string[] = [];
    const original = console.error;

    console.error = (...data: unknown[]): void => {
      lines.push(data.filter((entry): entry is string => typeof entry === 'string').join(' '));
    };

    return {
      lines,
      restore: (): void => {
        console.error = original;
      },
    };
  }

  interface InvocationOutcome {
    readonly response: FeedResponse;
    readonly diagnostics: readonly string[];
  }

  /** Invokes the handler with the error stream captured, restoring it even when a case fails. */
  async function invoke(
    handler: GoogleFeedHandler,
    signal?: AbortSignal,
  ): Promise<InvocationOutcome> {
    const capture = captureConsoleError();

    try {
      const response = await (signal === undefined
        ? handler.product()
        : handler.product({ signal }));

      return { response, diagnostics: [...capture.lines] };
    } finally {
      capture.restore();
    }
  }

  /** Count non-overlapping occurrences of `needle`. Used where "exactly N" is the assertion. */
  function countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    let at = haystack.indexOf(needle);

    while (at !== -1) {
      count += 1;
      at = haystack.indexOf(needle, at + needle.length);
    }

    return count;
  }

  const HANDLER_SOURCE_PATH = join(
    __dirname,
    '..',
    '..',
    'src',
    'handlers',
    'googleFeedHandler.ts',
  );

  describe('NET-NEW googleFeedHandler — the successful response envelope', () => {
    it('[NET-NEW] answers 200 with Content-Type application/xml and nothing else in the headers', async () => {
      const { response } = await invoke(createHandlerScenario().handler);

      /*
       * `./httpResponse.xmlResponse` owns all three. The header map is asserted whole rather than by key,
       * so an added header — a charset parameter, a cache directive, a CORS allowance — fails here. None is
       * invented: `product.cfm` sets no header of its own beyond the content type implied by the document.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({ 'Content-Type': XML_CONTENT_TYPE });
      expect(response.headers).toEqual({ 'Content-Type': 'application/xml' });
    });

    it('[NET-NEW] returns raw XML as the body, not a JSON envelope and not HTML', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /*
       * `product.cfm:L1` puts the declaration in the first bytes, so the body starts with it and is not
       * wrapped. `JSON.parse` throwing is the falsifiable form of "not a JSON envelope"; the absence of
       * `<html` is the falsifiable form of "no layout was applied", which is what `request.layout = false`
       * at `feed.cfc:L60` achieves in the legacy controller.
       */
      expect(body.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);
      expect(() => {
        /*
         * Called for its throw, not its value: returning the parse result would hand back `any`.
         */
        JSON.parse(body);
      }).toThrow();
      expect(body).not.toContain('<html');
      expect(body).not.toContain('"body"');
      expect(body).not.toContain('"statusCode"');
    });

    it('[NET-NEW] returns the serializer document byte-identically, adding and stripping nothing', async () => {
      const scenario = createHandlerScenario();
      const { response } = await invoke(scenario.handler);
      const expected = await scenario.buildDirectly([scenario.sku]);

      /*
       * The central claim of this file. The expected document is built from the same serializer instance,
       * the same record shape and the same render context, so any difference is something the handler did
       * to the body — a trim, a prepend, a re-encode, a normalisation. `toBe` on the whole string is the
       * only assertion that cannot pass while one character differs.
       */
      expect(response.body).toBe(expected);
      expect(response.body).toHaveLength(expected.length);
    });

    it('[NET-NEW] carries the legacy channel header verbatim', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /*
       * `product.cfm:L1`, `:L11`, `:L13` — the declaration, the namespaced root and the channel title.
       */
      expect(body).toContain(EXPECTED_XML_DECLARATION);
      expect(body).toContain(EXPECTED_RSS_OPEN_TAG);
      expect(body).toContain(EXPECTED_CHANNEL_TITLE_ELEMENT);
      expect(body.trimEnd().endsWith('</rss>')).toBe(true);
    });

    it('[NET-NEW] emits one item per selected SKU, in the selection order, untrimmed', async () => {
      const scenario = createHandlerScenario();
      scenario.setSelection([scenario.secondSku, scenario.sku]);

      const { response } = await invoke(scenario.handler);
      const body = response.body;

      /*
       * `product.cfm:L16` loops the smart list's records — the unpaged collection — so the handler must not
       * re-sort, filter, de-duplicate or page. Order is asserted by offset because feed order is
       * observable behaviour: a merchant processor reads the document top to bottom.
       */
      expect(countOccurrences(body, '<item>')).toBe(2);
      expect(countOccurrences(body, '</item>')).toBe(2);
      expect(body.indexOf(scenario.secondSkuCode)).toBeGreaterThan(-1);
      expect(body.indexOf(scenario.secondSkuCode)).toBeLessThan(body.indexOf(scenario.skuCode));
    });

    it('[NET-NEW] emits an empty channel rather than failing when the selection is empty', async () => {
      const scenario = createHandlerScenario();
      scenario.setSelection([]);

      const { response, diagnostics } = await invoke(scenario.handler);

      /*
       * An empty catalog is a legal feed, not a failure: `product.cfm` loops zero times and still emits the
       * envelope. A handler that treated emptiness as an error would break a merchant's polling.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.body).toContain(EXPECTED_CHANNEL_TITLE_ELEMENT);
      expect(countOccurrences(response.body, '<item>')).toBe(0);
      expect(diagnostics).toEqual([]);
    });
  });

  describe('NET-NEW googleFeedHandler — the configured host reaches every absolute URL', () => {
    it('[NET-NEW] puts http://<host> in the channel link, the channel description and the item link', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /*
       * The handler contributes the host and nothing else about these URLs; the composition is the
       * serializer's. What is asserted here is that the one configured value reaches every place the legacy
       * template put it, because a handler that dropped it would still produce a well-formed document.
       */
      expect(body).toContain(`<link>${ABSOLUTE_URL_PREFIX}</link>`);
      expect(body).toContain(`${ABSOLUTE_URL_PREFIX}/product/`);
      expect(body).toContain(`${ABSOLUTE_URL_PREFIX}${SKU_COMPOSED_IMAGE_PATH}`);
      expect(body).toContain(`${ABSOLUTE_URL_PREFIX}${ADDITIONAL_IMAGE_PATH}`);
    });

    it('[NET-NEW] emits every content URL over the legacy scheme, and invents no secure origin', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /*
       * The scheme is parity, and this is its route-level pin.
       * `integrationServices/google/views/feed/product.cfm:L14` and its four siblings hard-code
       * `http://`, and `ProductFeedBuilder.FEED_SCHEME_PREFIX` transcribes that literal. Emitting
       * `https://` would be a second declared departure beside D18, and AAP §0.6.7.7 admits exactly
       * one, so the
       * upgrade is reversed and the cleartext exposure (CWE-319) is carried as an annotated TODO(parity) at
       * that constant instead — where a reviewer diffing behaviour will find it.
       */
      expect(body).not.toContain('https://');
      expect(countOccurrences(body, 'http://')).toBe(
        countOccurrences(body, ABSOLUTE_URL_PREFIX) +
          countOccurrences(body, GOOGLE_FEED_NAMESPACE_URI),
      );
      expect(countOccurrences(body, ABSOLUTE_URL_PREFIX)).toBeGreaterThanOrEqual(4);
    });

    it('[NET-NEW] reads the host once at creation, not once per invocation (M7)', async () => {
      const scenario = createHandlerScenario();

      expect(scenario.hostReads.reads).toBe(1);

      await invoke(scenario.handler);
      await invoke(scenario.handler);

      /*
       * AAP §0.6.6 M7 — the host cannot vary between invocations of one container, and the module binds it
       * once so the `http://<host>` text is sourced from exactly one place. A counting accessor is the only
       * way to observe that, and it also proves the value is not re-validated or re-normalised per call.
       */
      expect(scenario.hostReads.reads).toBe(1);
    });

    it('[NET-NEW] passes a legal host through unmodified — the gate refuses, it never rewrites', async () => {
      const scenario = createHandlerScenario({ host: SECOND_RENDER_HOST });
      const { response } = await invoke(scenario.handler);

      /*
       * Validation and normalisation are different things, and this case pins the second half only.
       * `validateFeedHostAuthority` is applied — at construction here and again per render in the serializer
       * — so the value is judged. What it never does is rewrite: a host that passes is emitted byte-for-byte,
       * with nothing trimmed, case-folded, punycoded or stripped of a default port. A gate that silently
       * corrected a value would publish a URL the operator did not configure, which is the failure mode
       * `assertSameOriginRelativePath` gives the same answer to.
       */
      expect(response.body).toContain(`<link>http://${SECOND_RENDER_HOST}</link>`);
      expect(response.body).not.toContain(RENDER_HOST);
    });

    /* The nine cases below pin the host-authority refusal at the construction boundary. */

    it('[NET-NEW] REFUSES a userinfo-bearing host at CONSTRUCTION, before any request', () => {
      /*
       * The sharpest of the nine: `<configured>@evil.example` resolves every one of the five absolute URLs
       * to `evil.example`, with the intended host demoted to userinfo, and it carries no markup character so
       * no XML gate can catch it.
       */
      expect(() => createHandlerScenario({ host: `${RENDER_HOST}@evil.example` })).toThrow(
        DataIntegrityError,
      );
    });

    it('[NET-NEW] REFUSES every origin-moving and blank host at CONSTRUCTION', () => {
      /*
       * The remaining eight, each with its own mechanism: `/` and `\\` end the authority and begin a path;
       * `?` and `#` begin a query and a fragment, and `#` in particular collapses all five URLs onto one
       * page; whitespace and control characters are admitted in no authority; and a blank host leaves five
       * URLs with no authority at all, resolving nowhere.
       */
      for (const host of [
        `${RENDER_HOST}/evil`,
        `${RENDER_HOST}\\evil`,
        `${RENDER_HOST}?q=1`,
        `${RENDER_HOST}#frag`,
        `${RENDER_HOST} evil`,
        `${RENDER_HOST}\nevil`,
        '   ',
        '',
      ]) {
        expect(() => createHandlerScenario({ host })).toThrow(DataIntegrityError);
      }
    });

    it('[NET-NEW] the construction refusal NEVER echoes the rejected host', () => {
      /*
       * A rejected authority is attacker-supplied by hypothesis, so copying it into the diagnostic would
       * carry the payload one layer further — into a log, and from there into whatever reads the log. The
       * message names the rule and the offending code point by `U+XXXX`; the value appears nowhere in it.
       * The same discipline `assertRepresentableInXml` and `src/config/env.ts` follow.
       */
      const payload = `${RENDER_HOST}@evil.example`;

      try {
        createHandlerScenario({ host: payload });
        throw new Error('The hostile authority was admitted.');
      } catch (error) {
        expect(error).toBeInstanceOf(DataIntegrityError);
        const rendered = `${(error as Error).message} ${JSON.stringify(error)}`;
        expect(rendered).not.toContain(payload);
        expect(rendered).not.toContain('evil.example');
      }
    });

    it('[NET-NEW] admits an IPv6 literal, a port and an underscore, because no grammar was invented', async () => {
      /*
       * No RFC 1035 grammar and no 63-octet ceiling are applied, and this case is why. A positive
       * grammar of "legal hostnames" refuses values real deployments use, and refusing a
       * legitimate authority is the outcome change AAP §0.8.2 guideline 4 actually forbids. The gate is a
       * deny set of authority delimiters instead, so each of these passes and is emitted verbatim.
       */
      for (const host of [
        '[2001:db8::1]:8080',
        'shop.example.test:8443',
        'my_host.example.test.',
      ]) {
        const { response } = await invoke(createHandlerScenario({ host }).handler);
        expect(response.body).toContain(`<link>http://${host}</link>`);
      }
    });

    it('[NET-NEW] the handler answers 500 for an ampersand host rather than escaping it into the feed', async () => {
      /*
       * The two controls divide the exposure, and this case pins the seam. `&` cannot move an
       * authority, so `validateFeedHostAuthority` has no business refusing it and does not — the host reaches
       * the serializer. What happens there has changed twice, and the current answer is the one this case
       * asserts.
       */
      const { response } = await invoke(
        createHandlerScenario({ host: 'a&b.example.test' }).handler,
      );

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('<rss');
      expect(response.body).not.toContain('a&amp;b.example.test');
      expect(response.body).not.toContain('a&b.example.test');
    });
  });

  describe('NET-NEW googleFeedHandler — the anonymous route requires a stated bound', () => {
    /*
     * Why this route and no other. `integrationServices/google/controllers/feed.cfc:L54-L56`
     * declares `this.publicMethods="product"`, so `Google:feed.product` is the one action in the
     * whole service reachable with no principal — every other catalog route answers 401 without
     * one. Unbounded anonymous materialisation (CWE-400) is the exposure that follows, which is why
     * the gate lives here
     * rather than in the shared response layer.
     */

    it('[NET-NEW] it answers 500 and selects nothing when no bound is stated', async () => {
      const scenario = createHandlerScenario({
        assertMaterialisationBounded: (): void => {
          throw new ConfigurationError('no bound stated');
        },
      });

      const { response } = await invoke(scenario.handler);

      expect(response.statusCode).toBe(500);

      /*
       * The assertion that matters most is the second one. A refusal that arrived after the selection had
       * already hydrated the catalog would report the exposure without preventing it, so the gate must run
       * before `getFeedSkus` — and an empty selection log is the direct statement that it did.
       */
      expect(scenario.selectionCalls).toHaveLength(0);
      expect(scenario.imageReaderCalls).toStrictEqual([]);
      expect(scenario.materialisationGateCalls.count).toBe(1);

      /* No partial document, and no configuration echoed into a public body. */
      expect(response.body).not.toContain('<rss');
      expect(response.body).not.toContain('CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY');
    });

    it('[NET-NEW] it renders normally once a bound is stated, and re-checks every invocation', async () => {
      const scenario = createHandlerScenario();

      const first = await invoke(scenario.handler);
      const second = await invoke(scenario.handler);

      expect(first.response.statusCode).toBe(200);
      expect(second.response.statusCode).toBe(200);
      expect(first.response.body).toContain('<rss');

      /*
       * Two invocations, two checks. Memoising the verdict would make the gate a construction-time fact
       * again, and a construction-time fact is exactly what this design avoids — `createGoogleFeedHandler` runs
       * at module load inside the router, so a raise there would take all 34 routes down over a bound only this
       * one needs (M7).
       */
      expect(scenario.materialisationGateCalls.count).toBe(2);
      expect(scenario.selectionCalls).toHaveLength(2);
    });
  });

  describe('NET-NEW googleFeedHandler — nothing survives between invocations', () => {
    it('[NET-NEW] re-issues the selection on every invocation', async () => {
      const scenario = createHandlerScenario();

      await invoke(scenario.handler);
      await invoke(scenario.handler);
      await invoke(scenario.handler);

      /* A memoised selection would serve a stale catalog for the life of a warm container (M7). */
      expect(scenario.selectionCalls).toHaveLength(3);
    });

    it('[NET-NEW] reflects a changed selection in the very next invocation', async () => {
      const scenario = createHandlerScenario();

      const first = await invoke(scenario.handler);
      scenario.setSelection([scenario.sku, scenario.secondSku]);
      const second = await invoke(scenario.handler);

      expect(countOccurrences(first.response.body, '<item>')).toBe(1);
      expect(countOccurrences(second.response.body, '<item>')).toBe(2);
      expect(second.response.body).not.toBe(first.response.body);
    });

    it('[NET-NEW] does not mask an emptied selection with a previous non-empty one', async () => {
      const scenario = createHandlerScenario();

      const first = await invoke(scenario.handler);
      scenario.setSelection([]);
      const second = await invoke(scenario.handler);

      /*
       * The sharpest form of the M7 claim. A cached body or a cached record array would make the second
       * response identical to the first, which is precisely the failure a warm container makes possible.
       */
      expect(countOccurrences(first.response.body, '<item>')).toBe(1);
      expect(countOccurrences(second.response.body, '<item>')).toBe(0);
      expect(second.response.body).not.toBe(first.response.body);
    });

    it('[NET-NEW] reads the clock once per invocation, before any work begins', async () => {
      const scenario = createHandlerScenario();

      expect(scenario.clockCalls).toEqual({ now: 0, utcHourOffset: 0 });

      await invoke(scenario.handler);
      expect(scenario.clockCalls).toEqual({ now: 1, utcHourOffset: 1 });

      await invoke(scenario.handler);

      /*
       * Both values are read per invocation and never captured at creation, so the two endpoints of the
       * sale-price effective-date range are always computed against one instant and one offset. A captured
       * instant would freeze every feed a warm container ever renders to the moment it was constructed.
       */
      expect(scenario.clockCalls).toEqual({ now: 2, utcHourOffset: 2 });
    });

    it('[NET-NEW] pairs each selected SKU with its own images, once per record', async () => {
      const scenario = createHandlerScenario();
      scenario.setSelection([scenario.sku, scenario.secondSku]);

      await invoke(scenario.handler);

      /* One read per record, in selection order — the only assembly this layer performs. */
      expect(scenario.imageReaderCalls).toEqual([SKU_ID, SECOND_SKU_ID]);
    });

    it('[NET-NEW] an UNWIRED image subsystem answers 501, and publishes no partial feed', async () => {
      /*
       * The defect this pins. Production used to wire a reader that answered an empty list on every call,
       * so every feed render silently omitted every `g:additional_image_link` element and still answered
       * `200`. A code review classified that as a MAJOR integration-contract defect and directed the remedy:
       * "inject a real typed image reader; if unavailable, return explicit 501 rather than incomplete data".
       * The shipped default on `src/config/container.ts` now raises exactly this error, and the outcome the
       * caller sees is asserted here.
       */
      const scenario = createHandlerScenario({
        readProductImages: () => {
          throw new NotImplementedError(
            'ProductFeedImageReader',
            'it stands for the image subsystem behind ImagePathPort',
          );
        },
      });

      const { response } = await invoke(scenario.handler);

      expect(response.statusCode).toBe(HTTP_STATUS.NOT_IMPLEMENTED);
      expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
      /* Not a document with the images missing, and not an empty channel either: no XML at all. */
      expect(response.body).toBe(JSON.stringify({ message: 'This operation is not implemented' }));
      expect(response.body).not.toContain('<rss');
    });

    it('[NET-NEW] an EMPTY selection still renders 200, because the reader is consulted per record', async () => {
      /*
       * The refusal above is per record, so a catalog with nothing to select never reaches the image
       * boundary and answers exactly what the legacy answers for an empty smart list: a complete document
       * with an empty channel. This is what keeps the 501 confined to the case that would otherwise have
       * been published incomplete.
       */
      const scenario = createHandlerScenario({
        readProductImages: () => {
          throw new NotImplementedError('ProductFeedImageReader');
        },
      });
      scenario.setSelection([]);

      const { response } = await invoke(scenario.handler);

      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.body).toContain('<rss');
      expect(response.body).not.toContain('<item>');
      expect(scenario.imageReaderCalls).toEqual([]);
    });

    it('[NET-NEW] an INJECTED reader emits one additional-image element per image, as the legacy does', async () => {
      /*
       * The other half of the seam: a deployment that supplies a reader gets `product.cfm:L24`'s own output.
       * `PRODUCT_IMAGES` holds two entries, so two elements are emitted for the one selected SKU.
       */
      const scenario = createHandlerScenario();

      const { response } = await invoke(scenario.handler);

      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(countOccurrences(response.body, '<g:additional_image_link>')).toBe(
        PRODUCT_IMAGES.length,
      );
    });

    it('[NET-NEW] composes no selection of its own, passing the declared input straight through', async () => {
      const scenario = createHandlerScenario();

      await invoke(scenario.handler);

      /*
       * `feed.cfc:L63` makes one call with the selection declared up front, and `ProductFeedQuery` owns that
       * declaration. The handler must contribute nothing: no companion joins, and no second call.
       */
      expect(scenario.selectionCalls).toHaveLength(1);
      /*
       * One records-only execution, and the description carries the feed's own joins and filters — so the
       * handler added no companion join, issued no second call, and did not reach the three-view reading
       * that would have counted the whole catalog on the way past.
       */
      expect(scenario.selectionCalls[0]?.member).toBe('executeRecords');
      expect(scenario.selectionCalls[0]?.query.entityName).toBe('SlatwallSku');
      expect(scenario.selectionCalls[0]?.query.joins).toBeDefined();
    });
  });

  describe('NET-NEW googleFeedHandler — the returned handler object', () => {
    it('[NET-NEW] returns a frozen object exposing exactly one operation', async () => {
      const { handler } = createHandlerScenario();

      /*
       * `feed.cfc:L54` declares `this.publicMethods="product"` — one public action in the whole slice — and
       * `:L55-L56` leave the admin and secure lists empty. The frozen single-key object is the port of that:
       * Nothing else is reachable, and the shape cannot be extended after creation.
       */
      expect(Object.isFrozen(handler)).toBe(true);
      expect(Object.keys(handler)).toEqual(['product']);
      expect(typeof handler.product).toBe('function');
      expect(Object.getOwnPropertyDescriptor(handler, 'product')?.writable).toBe(false);

      /* The operation is invocable with no argument at all, exactly as the legacy action was. */
      const response = await handler.product();
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
    });

    it('[NET-NEW] declares exactly one parameter, and it is optional at the type level only', () => {
      const { handler } = createHandlerScenario();

      /*
       * A TypeScript optional parameter compiles to an ordinary parameter with no default, so it still
       * counts towards `Function.length` — the arity is 1, and the optionality is a type-level fact the
       * runtime cannot see. What proves the option is genuinely optional is the case above, which invokes
       * the operation with no argument at all and gets a rendered feed. Both halves are stated because
       * asserting an arity of 0 here would look right and be wrong.
       */
      expect(handler.product).toHaveLength(1);
    });
  });

  describe('NET-NEW googleFeedHandler — cancellation is forwarded, never honoured here', () => {
    it('[NET-NEW] refuses a pre-aborted invocation before a single selection is issued', async () => {
      const scenario = createHandlerScenario();
      const controller = new AbortController();
      controller.abort();

      const { response } = await invoke(scenario.handler, controller.signal);

      /*
       * The refusal is real production code: `ProductFeedQuery.getFeedSkus` raises before it calls the SKU
       * source at all, so the zero call count is the proof that no catalog-wide read was issued. The
       * response is the neutral service-fault answer, because the handler inspects nothing.
       */
      expect(scenario.selectionCalls).toEqual([]);
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(JSON.stringify({ message: 'The request could not be completed' }));
      expect(response.body).not.toContain('<rss');
    });

    it('[NET-NEW] discloses nothing about the cancellation in the body or the diagnostic', async () => {
      const scenario = createHandlerScenario();
      const controller = new AbortController();
      controller.abort();

      const { response, diagnostics } = await invoke(scenario.handler, controller.signal);

      /*
       * The thrown text is a diagnostic for an engineer, not for a caller, and `./httpResponse` publishes an
       * allowlist — situation, failure class and a correlation identifier — so the message stays out of the
       * error stream as well as out of the body. Both halves are asserted, because "redirected, not
       * discarded" is only half a guarantee if nobody checks what was redirected.
       */
      expect(response.body).not.toContain('cancelled');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toContain('DomainError');
      expect(diagnostics[0]).not.toContain('cancelled');
      expect(diagnostics[0]).not.toContain('Google product feed selection');
    });

    it('[NET-NEW] never reaches the pricing or image ports on the cancelled path', async () => {
      const scenario = createHandlerScenario();
      const controller = new AbortController();
      controller.abort();

      await invoke(scenario.handler, controller.signal);

      /*
       * The cancellation is deliberately not forwarded to `PricingPort` or `ImagePathPort`
       * (`googleFeedHandler.ts:L760-L764`): both describe domains AAP §0.2.2 excludes, and widening them for
       * a collaborator nobody supplies would be inventing contract. On this path they are simply never
       * reached, which is the observable consequence.
       */
      expect(scenario.pricing.requestedProductIds).toEqual([]);
      expect(scenario.images.calls).toEqual([]);
      expect(scenario.imageReaderCalls).toEqual([]);
    });

    it('[NET-NEW] renders normally for a signal that has not been aborted', async () => {
      const scenario = createHandlerScenario();
      const controller = new AbortController();

      const withSignal = await invoke(scenario.handler, controller.signal);
      const withoutSignal = await invoke(scenario.handler);

      /*
       * The option is a cancellation, not a kill switch: AAP-wise, `googleFeedHandler.ts:L746-L748` states
       * that nothing in it changes a single emitted byte. Comparing the two bodies is that claim exactly.
       */
      expect(withSignal.response.statusCode).toBe(HTTP_STATUS.OK);
      expect(withSignal.response.body).toBe(withoutSignal.response.body);
    });
  });

  describe('NET-NEW googleFeedHandler — every failure funnels through one mapping', () => {
    /** A serializer that rejects with a real `Error`, exercising the asynchronous failure path. */
    function rejectingSerializer(failure: Error): ProductFeedSerializer {
      return {
        build: (): Promise<string> => Promise.reject(failure),
      };
    }

    async function invokeWithSerializerFailure(failure: Error): Promise<InvocationOutcome> {
      const scenario = createHandlerScenario({ serializer: rejectingSerializer(failure) });
      return invoke(scenario.handler);
    }

    it('[NET-NEW] answers a validation failure at 400 with the keyed error structure intact', async () => {
      const failure = new ValidationError();
      failure.addError('skuCode', 'Sku Code is required');
      failure.addError('price', 'Price must be at least 0');

      const { response } = await invokeWithSerializerFailure(failure);

      /*
       * Branch 1. The keyed structure reaches the body unchanged — not flattened, re-keyed, de-duplicated or
       * sorted — because AAP §0.4.1.11 requires validation failures to stay comparable to legacy output. The
       * whole body is compared as a string, so key order and the absence of extra members are both asserted.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(response.body).toBe(
        JSON.stringify({
          message: 'Validation failed',
          errors: {
            skuCode: ['Sku Code is required'],
            price: ['Price must be at least 0'],
          },
        }),
      );
    });

    it('[NET-NEW] answers a boundary stub at 501 without publishing the member identifier', async () => {
      const { response, diagnostics } = await invokeWithSerializerFailure(
        new NotImplementedError(
          'SkuService.processImageUpload',
          'the image service is out of scope',
        ),
      );

      /*
       * Branch 2, and the row most easily got wrong. The status is derived from the error's own
       * presentation, but the published text is `./httpResponse`'s own neutral constant — "This operation is
       * not implemented" — and not the presentation's "This operation is not available". Neither
       * `error.member` nor `error.message` is read, so the member identifier stays server-side.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.NOT_IMPLEMENTED);
      expect(response.statusCode).toBe(501);
      expect(response.body).toBe(JSON.stringify({ message: 'This operation is not implemented' }));
      expect(response.body).not.toContain('processImageUpload');
      expect(response.body).not.toContain('out of scope');
      expect(diagnostics).toHaveLength(1);
    });

    it('[NET-NEW] publishes a legacy parity message verbatim — the one branch that does', async () => {
      const { response, diagnostics } = await invokeWithSerializerFailure(
        new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE),
      );

      /*
       * Branch 3. The message is copied, never processed, because the type is the throw site's declaration
       * that this exact text is legacy behaviour (`model/service/SkuService.cfc:L204`). It is also the only
       * branch that writes no diagnostic, since nothing was suppressed.
       */
      expect(response.body).toBe(
        JSON.stringify({ message: 'There was an unexpected error when creating this product' }),
      );
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(diagnostics).toEqual([]);
    });

    it('[NET-NEW] answers a stored-data failure at 500 with the data-family text', async () => {
      const { response } = await invokeWithSerializerFailure(
        new DataIntegrityError('a row named a column the schema does not declare'),
      );

      /* Branch 4, read polymorphically: `DataIntegrityError` declares its own family. */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(
        JSON.stringify({ message: 'The request could not be completed from the stored data' }),
      );
    });

    it('[NET-NEW] answers a configuration failure at 500 with the configuration-family text', async () => {
      const { response } = await invokeWithSerializerFailure(
        new ConfigurationError('a setting the feed reads was never seeded'),
      );

      /* Branch 4 again, with the other override. Same status, different neutral text. */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(
        JSON.stringify({ message: 'The service is not correctly configured' }),
      );
    });

    it('[NET-NEW] answers a base domain failure at 500 with the neutral service-fault text', async () => {
      const { response } = await invokeWithSerializerFailure(
        new DomainError('a diagnostic an engineer needs and a caller must never see'),
      );

      /* Branch 4, base class. `error.message` is not read. */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(JSON.stringify({ message: 'The request could not be completed' }));
      expect(response.body).not.toContain('diagnostic');
    });

    it('[NET-NEW] answers a foreign Error at 500 without inspecting it at all', async () => {
      const { response, diagnostics } = await invokeWithSerializerFailure(
        new TypeError('cannot read properties of undefined (reading "productID")'),
      );

      /*
       * Branch 5 — a value this port did not raise. It is not swallowed: the diagnostic still records the
       * failure class, which is how a runtime error stays findable while disclosing nothing.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(JSON.stringify({ message: 'An unexpected error occurred' }));
      expect(response.body).not.toContain('productID');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toContain('TypeError');
    });

    it('[NET-NEW] answers a thrown non-Error at 500, and a synchronous throw is caught too', async () => {
      /*
       * A value that is not an `Error` at all, thrown synchronously from the serializer rather than returned
       * as a rejection. Both halves matter: branch 5 must not assume an `Error`, and the handler's single
       * `try` must cover the synchronous part of the call as well as the awaited part.
       */
      const foreignValue: unknown = { detail: 'a plain object carrying a secret' };
      const scenario = createHandlerScenario({
        serializer: {
          build: (): Promise<string> => {
            throw foreignValue;
          },
        },
      });

      const { response, diagnostics } = await invoke(scenario.handler);

      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(JSON.stringify({ message: 'An unexpected error occurred' }));
      expect(response.body).not.toContain('secret');
      expect(diagnostics).toHaveLength(1);
    });

    it('[NET-NEW] maps a failure raised by the SELECTION through the same single mapping', async () => {
      const scenario = createHandlerScenario({
        selectionFailure: new DataIntegrityError('the selection could not be satisfied'),
      });

      const { response } = await invoke(scenario.handler);

      /*
       * The `try` wraps the whole sequence, not just the serialization, so a failure in step 2 answers
       * identically to one in step 4. Asserting this separately is what proves there is one mapping rather
       * than one per step.
       */
      expect(scenario.selectionCalls).toHaveLength(1);
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(
        JSON.stringify({ message: 'The request could not be completed from the stored data' }),
      );
    });

    it('[NET-NEW] leaks no stack, no class name and no partial feed on any failure path', async () => {
      const failures: readonly Error[] = [
        new DomainError('internal detail'),
        new DataIntegrityError('internal detail'),
        new ConfigurationError('internal detail'),
        new NotImplementedError('SomeService.someMember'),
        new TypeError('internal detail'),
      ];

      for (const failure of failures) {
        const { response } = await invokeWithSerializerFailure(failure);

        /*
         * A consolidated sweep across every suppressing branch. `LegacyParityError` is excluded by design:
         * Publishing its message verbatim is its whole purpose, and the case above asserts that separately.
         * "No partial feed" matters because the document is built whole or not at all — there is no fallback
         * document, no retry and no degraded response.
         */
        expect(response.body).not.toContain('internal detail');
        expect(response.body).not.toContain('someMember');
        expect(response.body).not.toContain(failure.name);
        expect(response.body).not.toContain('stack');
        expect(response.body).not.toContain('    at ');
        expect(response.body).not.toContain('<rss');
        expect(response.body).not.toContain('<item>');
        expect(response.headers).toEqual({ 'Content-Type': 'application/json' });
      }
    });
  });

  describe('NET-NEW googleFeedHandler — M2 is flagged, never solved', () => {
    it('[NET-NEW] admits no page size, chunk, cursor or concurrency collaborator', () => {
      /*
       * M2 (AAP §0.6.6) — `product.cfm:L9` asks for `requesttimeout="360"`, which exceeds what a
       * synchronous gateway in front of this function will generally allow. Flagging is the required
       * response and solving is the forbidden one (AAP §0.8.2 guideline 4), so the file must not have
       * acquired a control that quietly resolves it. The compile-time aliases above are the exhaustiveness
       * proof; this case asserts the same names as values so the list itself cannot silently change.
       */
      expect(COLLABORATOR_NAMES).toEqual([
        'feedQuery',
        'feedSerializer',
        'hostConfiguration',
        'readProductImages',
        'clock',
        'assertMaterialisationBounded',
      ]);
      expect(COLLABORATOR_NAMES).toHaveLength(6);

      /*
       * And the four time-shaped controls are still absent by name, so the growth cannot be read as the
       * beginning of a delivery-model solution.
       */
      for (const forbidden of ['pageSize', 'chunkSize', 'cursor', 'concurrency']) {
        expect(COLLABORATOR_NAMES).not.toContain(forbidden);
      }
    });

    it('[NET-NEW] schedules nothing and races nothing, so no ceiling is invented in code', () => {
      const source = readFileSync(HANDLER_SOURCE_PATH, 'utf8');

      /*
       * no figure is asserted for any ceiling, because AAP §0.8.3.5 and IR-12 forbid inventing one and the
       * module states in full why the second ceiling is deliberately left unnamed. What is asserted is that
       * the file contains no timing mechanism at all: none of these tokens appears anywhere in it, in code
       * or in prose, so a plain text search is exact here.
       */
      expect(source).not.toContain('setTimeout(');
      expect(source).not.toContain('setInterval(');
      expect(source).not.toContain('Promise.race(');
      expect(source).not.toContain('new AbortController(');

      /*
       * And the flag itself is present, because surfacing the mismatch is the mandated behaviour.
       */
      expect(source).toContain('M2');
      expect(source).toContain('requesttimeout="360"');
    });

    it('[NET-NEW] completes a slow serialization rather than cutting it off', async () => {
      let resolveBuild: ((document: string) => void) | undefined;
      const pending = new Promise<string>((resolve) => {
        resolveBuild = resolve;
      });
      const scenario = createHandlerScenario({
        serializer: { build: (): Promise<string> => pending },
      });
      const invocation = invoke(scenario.handler);

      /*
       * The serialization is resolved only after several event-loop turns. Nothing in the handler abandons,
       * re-attempts, degrades or truncates it in the meantime, which is the runtime form of "the mismatch is
       * left open". No duration is asserted — the point is the absence of a cut-off, not a timing figure.
       */
      await Promise.resolve();
      await Promise.resolve();
      expect(resolveBuild).toBeDefined();
      resolveBuild?.(`${EXPECTED_XML_DECLARATION}\n<rss version="2.0"></rss>`);

      const { response } = await invocation;
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.body).toContain(EXPECTED_XML_DECLARATION);
    });
  });

  /* The production wiring — `createGoogleFeedHandlerFromContainer` */

  /** A record source that answers a fixed selection, standing in for the container's own query. */
  function feedRecordSourceFor(skus: readonly Sku[]): ProductFeedRecordSource {
    return { getFeedSkus: (): Promise<Sku[]> => Promise.resolve([...skus]) };
  }

  /** The container's shipped image reader, mirrored rather than imported. */
  function mirrorOfShippedProductFeedImages(
    sku: ProductFeedRecord['sku'],
  ): readonly ProductFeedImage[] {
    const product = sku.product;
    if (product === undefined || product.getProductImages().length === 0) {
      return [];
    }

    throw new NotImplementedError(
      'ProductFeedImageReader',
      'the product carries images, and their paths come from model/entity/Image.cfc:L79-L81 — an entity ' +
        'AAP §0.2.1.2 does not include, so no path is readable from the ported domain',
    );
  }

  /** Gives a scenario's product one owned image, so the shipped boundary has something to read. */
  function seedOneOwnedProductImage(product: Product): void {
    product.getProductImages().push({
      setProduct: (): void => {
        /* Ownership is not what these cases observe. */
      },
      removeProduct: (): void => {
        /* Ownership is not what these cases observe. */
      },
    });
  }

  /** The members the factory reads, assembled from a scenario's own collaborators. */
  function containerSliceFor(
    scenario: HandlerScenario,
    skus: readonly Sku[],
  ): GoogleFeedContainerSlice {
    return {
      productFeedQuery: feedRecordSourceFor(skus),
      productFeedBuilder: scenario.builder,
      config: { googleFeed: { host: RENDER_HOST } },
      assertAnonymousMaterialisationBounded: (): void => {
        /* An operator-stated ceiling exists; nothing to refuse. */
      },
      /* The container's reader, mirrored — see {@link mirrorOfShippedProductFeedImages}. */
      productFeedImages: mirrorOfShippedProductFeedImages,
    };
  }

  describe('NET-NEW googleFeedHandler — the wiring the delivered route actually gets', () => {
    it('[NET-NEW] reports the image boundary at 501 instead of publishing "no images"', async () => {
      const scenario = createHandlerScenario();
      seedOneOwnedProductImage(scenario.product);
      const handler = createGoogleFeedHandlerFromContainer(
        containerSliceFor(scenario, [scenario.sku]),
      );

      const { response } = await invoke(handler);

      /*
       * The assertion is the status *and* the absence of a 200, because the defect was not a wrong
       * status — it was a successful response carrying a false fact. A feed that answers 200 with no
       * additional-image element is indistinguishable, to the merchant consuming it, from a catalogue
       * whose products have no extra images. 501 cannot be mistaken for that.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.NOT_IMPLEMENTED);
      expect(response.statusCode).not.toBe(HTTP_STATUS.OK);
      expect(response.body).toBe(JSON.stringify({ message: 'This operation is not implemented' }));

      /* And nothing about the boundary's internals reaches the caller. */
      expect(response.body).not.toContain('ProductFeedImageReader');
      expect(response.body).not.toContain('ImagePathPort');
      expect(response.body).not.toContain('Image.cfc');
    });

    it('[NET-NEW] emits one additional-image element per image once a reader is supplied', async () => {
      const scenario = createHandlerScenario();
      const handler = createGoogleFeedHandlerFromContainer(
        containerSliceFor(scenario, [scenario.sku]),
        { readProductImages: (): readonly ProductFeedImage[] => PRODUCT_IMAGES },
      );

      const { response } = await invoke(handler);

      /*
       * The other half of the finding: the builder's capability must be reachable from the production
       * factory, not only from a hand-built handler. `product.cfm:L24` emits one element per entry of
       * `sku.getProduct().getProductImages()`, so the count is the assertion rather than mere presence.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(countOccurrences(response.body, '<g:additional_image_link>')).toBe(
        PRODUCT_IMAGES.length,
      );
      expect(response.body).toContain(RENDER_HOST);
    });

    it('[NET-NEW] never consults the reader for an empty selection, so the empty channel still answers 200', async () => {
      const scenario = createHandlerScenario();
      let readerCalls = 0;
      const handler = createGoogleFeedHandlerFromContainer(containerSliceFor(scenario, []), {
        readProductImages: (): readonly ProductFeedImage[] => {
          readerCalls += 1;
          return PRODUCT_IMAGES;
        },
      });

      const { response } = await invoke(handler);

      /*
       * The reader is consulted once per selected record, which is why the shipped boundary does not turn
       * an empty catalogue into an error. This is the case that proves the 501 above is a property of
       * having something to read, not of the route existing.
       */
      expect(readerCalls).toBe(0);
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.body).toContain(EXPECTED_XML_DECLARATION);
      expect(response.body).not.toContain('<g:additional_image_link>');
    });

    it('[NET-NEW] omitting the override is what activates the boundary, and supplying one replaces it', async () => {
      const scenario = createHandlerScenario();
      seedOneOwnedProductImage(scenario.product);
      const slice = containerSliceFor(scenario, [scenario.sku]);

      /* Same slice, same selection, two wirings — so the reader is the only variable. */
      const shipped = await invoke(createGoogleFeedHandlerFromContainer(slice));
      const supplied = await invoke(
        createGoogleFeedHandlerFromContainer(slice, {
          readProductImages: (): readonly ProductFeedImage[] => PRODUCT_IMAGES,
        }),
      );

      expect(shipped.response.statusCode).toBe(HTTP_STATUS.NOT_IMPLEMENTED);
      expect(supplied.response.statusCode).toBe(HTTP_STATUS.OK);

      /*
       * An empty override object is not a reader: it must fall back to the boundary, not to `[]`.
       */
      const empty = await invoke(createGoogleFeedHandlerFromContainer(slice, {}));
      expect(empty.response.statusCode).toBe(HTTP_STATUS.NOT_IMPLEMENTED);
    });
  });
});

/*
 * Net-new — the feed, end to end: the public route, the selection, the hydration and the document
 * every case above this section hands the serializer records it constructed by hand,
 * and the folded selection cases drive the query without ever reaching a route or a document. So the four
 * pieces of the feed were each covered and the seams between them were not — which is where a feed breaks
 * in practice. Nothing here re-asserts a field mapping; what it asserts is that one dispatch of the public.
 */

/**
 * The configured feed host for this section, distinct from {@link RENDER_HOST} so its source is visible.
 */
const END_TO_END_HOST = 'feed.example.test';

/** The default SKU's stored image file, and the composed path the image port answers for it. */
const END_TO_END_DEFAULT_SKU_IMAGE_FILE = 'feed-product-default.jpg';
const END_TO_END_DEFAULT_SKU_COMPOSED_IMAGE_PATH = `/product/default/${END_TO_END_DEFAULT_SKU_IMAGE_FILE}`;

/** The budget for the one case that dispatches five times; see its own note. */
const END_TO_END_MULTI_DISPATCH_TIMEOUT_MS = 30_000;

/** Every variable `src/config/env.ts` reads, cleared before this section applies its own. */
const END_TO_END_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'Slatwall',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'fixture-not-a-real-password',
  DB_TLS_MODE: 'disabled',
  DB_QUEUE_LIMIT: '1',
  /*
   * Short on purpose: no statement here reaches a driver, so this only bounds the failure of a
   * regression that started to.
   */
  DB_CONNECT_TIMEOUT_MS: '1000',
  GOOGLE_FEED_HOST: END_TO_END_HOST,

  /*
   * //02/03 — the anonymous route requires stated ceilings, and these cases drive the
   * shipped route through the real router, so every gate runs. The figures are the fixture's, and generous:
   * `../../src/config/env.ts` declares all six optional with no default (IR-12, AAP §0.7.3), each is
   * reached through a resolver that raises when unset, and each bound's refusing behaviour is asserted by
   * dedicated cases stating a tight figure rather than incidentally here. See the block on
   * {@link FEED_WIRING_ENVIRONMENT} for the full argument.
   */
  CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000',
  CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY: '250',
  CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST: '10000',
  CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION: '500',
  CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD: '100',
  CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES: '10000000',
});

/**
 * Distinct 32-character identifiers, so a crossed association is visible rather than coincidental.
 */
const END_TO_END_ID = Object.freeze({
  sku: 'aaaa0000000000000000000000000001',
  product: 'bbbb0000000000000000000000000001',
  productType: 'cccc0000000000000000000000000001',
  brand: 'dddd0000000000000000000000000001',
  defaultSku: 'eeee0000000000000000000000000001',
});

/**
 * Every row the selection and its aggregate need. Money columns are strings, as the driver returns them.
 */
const END_TO_END_TABLES: Readonly<Record<string, readonly MySqlRow[]>> = Object.freeze({
  SwSku: [
    {
      skuID: END_TO_END_ID.sku,
      skuCode: 'FP-1-SKU',
      /* Different from the default SKU's, so `g:price`'s source is unambiguous. */
      price: '90.00',
      imageFile: 'nike-air.jpg',
      productID: END_TO_END_ID.product,
    },
    {
      skuID: END_TO_END_ID.defaultSku,
      skuCode: 'FP-1-DEFAULT',
      price: '99.00',
      /*
       * A stored file name rather than none, and the reason is the image double's echo. With this
       * column absent the SKU falls back to `generateImageFileName()`, whose output the double then
       * echoes bare — the double composes no directory on purpose, so an unseeded name comes back
       * without a leading slash, which is a value the real adapter cannot produce and which the
       * current contract's `assertSameOriginRelativePath` correctly refuses. Naming the file here
       * lets it be seeded to the composed form below, so the record exercises the port exactly as
       * the selected SKU does.
       */
      imageFile: END_TO_END_DEFAULT_SKU_IMAGE_FILE,
      productID: END_TO_END_ID.product,
    },
  ],
  SwProduct: [
    {
      productID: END_TO_END_ID.product,
      /*
       * `productName` is the template-driven member's input; the feed reads `calculatedTitle`. Keeping
       * them different is what makes the item title's source unambiguous, exactly as `createScenario`
       * does above.
       */
      productName: 'TEMPLATE-ONLY-PRODUCT-NAME',
      productCode: 'FP-1',
      calculatedTitle: 'PERSISTED-CALCULATED-TITLE',
      productDescription: 'A running shoe',
      urlTitle: 'feed-product',
      productTypeID: END_TO_END_ID.productType,
      brandID: END_TO_END_ID.brand,
      defaultSkuID: END_TO_END_ID.defaultSku,
    },
  ],
  SwProductType: [{ productTypeID: END_TO_END_ID.productType, productTypeName: 'Merchandise' }],
  SwBrand: [{ brandID: END_TO_END_ID.brand, brandName: 'Nike' }],
});

/** The four additional images, in the order the reader yields them — unsorted, with a repeat. */
const END_TO_END_ADDITIONAL_IMAGES: readonly ProductFeedImage[] = Object.freeze([
  { imagePath: THIRD_ADDITIONAL_IMAGE_PATH },
  { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
  { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
  /*
   * The repeat is deliberate: a document that de-duplicated would emit three, and `product.cfm:L24`
   * emits one element per collection entry with no de-duplication anywhere.
   */
  { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
]);

/** One statement, as the driver saw it. */
interface EndToEndStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** A recording executor over {@link END_TO_END_TABLES} that honours `WHERE <column> IN (…)`. */
function createEndToEndExecutor(): {
  readonly executor: SqlExecutor;
  readonly statements: readonly EndToEndStatement[];
} {
  const statements: EndToEndStatement[] = [];

  return {
    statements,
    executor: {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        statements.push({ sql, params: [...params] });

        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: END_TO_END_TABLES['SwSku']?.length ?? 0 }]);
        }

        const table = / FROM (\w+)/.exec(sql)?.[1];
        const rows = table === undefined ? undefined : END_TO_END_TABLES[table];
        if (rows === undefined) {
          return Promise.resolve([]);
        }

        const column = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql)?.[1];
        if (column !== undefined) {
          return Promise.resolve(rows.filter((row) => params.includes(row[column])));
        }

        return Promise.resolve([...rows]);
      },
    },
  };
}

/** The delegate binder the aggregate loaders need, answering the default SKU's own price. */
function bindEndToEndDefaultSku(sku: Sku): ProductDefaultSkuDelegate {
  return {
    getPrice: (): ExactDecimal | undefined => sku.price,
    getListPrice: (): ExactDecimal | undefined => undefined,
    getRenewalPrice: (): ExactDecimal | undefined => undefined,
    getCurrencyCode: (): string | undefined => undefined,
    getImageDirectory: (): string => '',
    getImagePath: (): string => '',
    getImage: (): string => '',
    getResizedImagePath: (): string => '',
    getImageExistsFlag: (): boolean => false,
  };
}

/** Everything one end-to-end dispatch produced. */
interface EndToEndDispatch {
  readonly response: APIGatewayProxyResult;
  readonly statements: readonly EndToEndStatement[];
  /**
   * Every query the port was handed, before translation — the input the current contract asked to capture.
   */
  readonly queries: readonly SmartListQuery[];
  /** Every SKU the image reader was consulted about, in call order. */
  readonly imageReaderSubjects: readonly string[];
  readonly settings: SettingResolverDouble;
  readonly images: ImagePathDouble;
}

/**
 * Dispatch `google:feed.product` through the real router over a real graph, and answer what it produced.
 */
async function dispatchEndToEndFeed(action = 'google:feed.product'): Promise<EndToEndDispatch> {
  for (const name of FEED_WIRING_VARIABLE_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, END_TO_END_ENVIRONMENT);

  jest.resetModules();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const containerModule = require('../../src/config/container') as {
    readonly createCatalogContainer: (overrides?: CatalogContainerOverrides) => CatalogContainer;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const routerModule = require('../../src/handlers/router') as {
    readonly createRouter: (
      container: CatalogContainer,
    ) => (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  };

  const { executor, statements } = createEndToEndExecutor();
  const settings = createSettingResolverDouble({ settings: DEFAULT_SETTING_SEEDS });
  const images = createImagePathDouble({
    /*
     * Seeded so both selected SKUs' images resolve to composed paths; the resize answer is left
     * unseeded so the double echoes each request's `imagePath`, which is the only configuration under
     * which "each additional image used its own resized path" is falsifiable.
     */
    imagePathsByImageFile: {
      [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH,
      [END_TO_END_DEFAULT_SKU_IMAGE_FILE]: END_TO_END_DEFAULT_SKU_COMPOSED_IMAGE_PATH,
    },
  });
  const pricing = createPricingDouble({});
  const imageReaderSubjects: string[] = [];

  /*
   * The real builder, wrapped only to record the description it is handed. The wrapper delegates every
   * call unchanged, so translation, aliasing, binding and hydration are all still the adapter's.
   */
  const builder = new SmartListQueryBuilder(
    executor,
    createCatalogAggregateLoaders({ bindDefaultSkuDelegate: bindEndToEndDefaultSku }),
    GENEROUS_SMART_LIST_BUDGET,
  );
  const queries: SmartListQuery[] = [];

  /*
   * The wrapper is generic in the root entity name, not in a record type, because the port is. Both
   * members derive their element type from the query's own `entityName` literal — which is what stops a
   * caller nominating a record type the description could not produce — so the wrapper has to carry that
   * parameter through rather than introduce one of its own. Writing it any other way needs a cast, and
   * AAP §0.7.3 forbids one.
   */
  const recordingPort: SmartListQueryPort = {
    executeRecords: <TEntityName extends SmartListRootEntityName>(
      query: SmartListQuery<TEntityName>,
    ): Promise<SmartListRecord<TEntityName>[]> => {
      queries.push(query);

      return builder.executeRecords(query);
    },
    execute: <TEntityName extends SmartListRootEntityName>(
      query: SmartListQuery<TEntityName>,
    ): Promise<SmartListResult<SmartListRecord<TEntityName>>> => {
      queries.push(query);

      return builder.execute(query);
    },
  };

  const container = containerModule.createCatalogContainer({
    smartListQueryPort: recordingPort,
    settings: settings.resolver,
    imagePaths: images.imagePaths,
    pricing: pricing.pricing,
    /*
     * The reader is consulted per record, and answering for only one of the two is what proves it.
     * `src/handlers/googleFeedHandler.ts` maps the selection into `{ sku, productImages }` pairs and
     * deliberately does not memoise by product, because the seam takes a SKU and the handler is not
     * entitled to assume an implementor's reader is a pure function of the product. A handler that read
     * once and reused the answer would put four elements in both items.
     */
    productFeedImages: (sku) => {
      imageReaderSubjects.push(sku.skuID);

      return sku.skuID === END_TO_END_ID.sku ? END_TO_END_ADDITIONAL_IMAGES : [];
    },
  });

  const response = await routerModule.createRouter(container)({
    queryStringParameters: { slatAction: action },
    headers: {},
  } as unknown as APIGatewayProxyEvent);

  return { response, statements, queries, imageReaderSubjects, settings, images };
}

describe('NET-NEW — the feed end to end, from the public route to the document', () => {
  afterEach(() => {
    for (const name of FEED_WIRING_VARIABLE_NAMES) {
      const before = ENVIRONMENT_BEFORE_WIRING_CASES[name];
      if (before === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = before;
      }
    }
  });

  it('[NET-NEW] captures the ONE description composed through SkuService.getSkuSmartList', async () => {
    const { queries } = await dispatchEndToEndFeed();

    /*
     * One description, not one per addition, which is the whole of the declare-then-execute
     * translation. The legacy controller mutated a live smart list — `rc.skuSmartList.joinRelatedProperty`
     * three times, `addFilter` three times, `addRange` once, each call reaching into an object the service
     * had already seeded [`feed.cfc:L63-L72`]. The port has no mutable list to reach into, so all seven
     * additions travel inside the one input the service is handed, and the port is called once. A design
     * that had kept the mutation would show several calls here.
     */
    expect(queries).toHaveLength(1);
    const [described] = queries;
    if (described === undefined) {
      throw new Error('The feed dispatch described no query.');
    }

    /* The root entity is the SKU, `feed.cfc:L63` by way of `model/service/SkuService.cfc:L310`. */
    expect(described.entityName).toBe('SlatwallSku');

    /*
     * Six JOIN declarations in one list — the service's three first, then the feed's three — with the
     * duplicate still present at this layer. It is absorbed by the translation rather than by the
     * composition, and that ordering is load-bearing: the adapter is what proves the legacy absorbs a
     * repeat, so removing it here would move a decision out of the layer that owns it.
     */
    expect(described.joins).toHaveLength(6);
    expect(described.joins?.slice(0, 3)).toStrictEqual([
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
    ]);
    expect(described.joins?.slice(3)).toStrictEqual(PRODUCT_FEED_JOINS);

    /*
     * And the duplicate really is a duplicate — the same pair appears at position 0 and position 3.
     */
    expect(described.joins?.[3]).toStrictEqual(described.joins?.[0]);

    /*
     * The three activity filters AND the one range, in one WHERE GROUP, in declaration ORDER. One group
     * rather than three is what makes them conjunctive; the legacy's three `addFilter` calls accumulate
     * into a single predicate set [`feed.cfc:L68-L70`].
     */
    expect(described.whereGroups).toHaveLength(1);
    expect(described.whereGroups?.[0]?.filters).toStrictEqual([
      { propertyIdentifier: 'activeFlag', value: 1 },
      { propertyIdentifier: 'product.activeFlag', value: 1 },
      { propertyIdentifier: 'product.publishedFlag', value: 1 },
    ]);

    /*
     * And the caret is resolved here, at the composition layer, rather than in the adapter — which is
     * exactly where a reader would not expect to find it, so it is worth pinning. `addRange('…','1^')`
     * [`feed.cfc:L72`] arrives as a lower bound only: `lowerBound: '1'` with no `upperBound` member at
     * all, not an `upperBound` of `''`, `undefined` or `Infinity`. Any of those three would translate to a
     * second predicate and quietly bound a range the legacy left open. The bound keeps its string
     * spelling, uncoerced, and the adapter case below is what proves that string reaches the driver.
     */
    expect(described.whereGroups?.[0]?.ranges).toStrictEqual([
      { propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' },
    ]);
    expect(Object.hasOwn(described.whereGroups?.[0]?.ranges?.[0] ?? {}, 'upperBound')).toBe(false);

    /*
     * The service's five weight-1 keyword properties travel too, unchanged by the feed's additions —
     * `model/service/SkuService.cfc:L318-L322`. Two of them only resolve because of the joins above.
     */
    expect(described.keywordProperties).toHaveLength(5);
    expect(
      described.keywordProperties?.map((property) => property.propertyIdentifier),
    ).toStrictEqual([
      'skuCode',
      'skuID',
      'product.productName',
      'product.productType.productTypeName',
      'alternateSkuCodes.alternateSkuCode',
    ]);

    /*
     * And no pagination is described. `product.cfm:L16` loops the unpaged collection, so a page window
     * here would silently truncate a merchant feed to its first page.
     */
    expect(described.pagination).toBeUndefined();
    /*
     * No keyword search either: the feed passes no term, so the weighted properties stay unused.
     */
    expect(described.keywords ?? []).toStrictEqual([]);
  });

  it('[NET-NEW] emits the six declared joins as five, in declaration order, none of them eliminating', async () => {
    const { statements } = await dispatchEndToEndFeed();

    /* The record projection is statement 1, behind the materialisation count at statement 0. */
    expect(statements[0]?.sql).toContain('AS recordsCount');
    expect(statements[1]?.sql).toContain('FROM SwSku');
    expect(statements[1]?.sql).not.toContain('COUNT(');
    const projection = statements[1]?.sql ?? '';

    /*
     * Six declared, five emitted, and the arithmetic is the assertion. Two layers contribute joins to one
     * list, which is what makes this seam worth a case at all:
     * • `model/service/SkuService.cfc:L314-L316` registers three on every SKU smart list — `product`,
     * `productType` and a left `alternateSkuCodes` — because five of its keyword properties cannot
     * resolve without them.
     */
    expect(PRODUCT_FEED_JOINS).toHaveLength(3);
    expect(projection.match(/ JOIN /g)).toHaveLength(5);
    expect(projection.match(/JOIN SwProduct\b/g)).toHaveLength(1);

    /*
     * Every one of the five, named. The default-SKU join is a second alias over the same physical table,
     * which is the pairing most likely to be dropped by an implementation that keyed joins by table.
     */
    expect(projection).toContain(
      'JOIN SwProduct aslatwallproduct ON aslatwallproduct.productID = aslatwallsku.productID',
    );
    expect(projection).toContain('JOIN SwProductType aslatwallproducttype');
    expect(projection).toContain('JOIN SwAlternateSkuCode aslatwallalternateskucode');
    expect(projection).toContain(
      'JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID',
    );
    expect(projection).toContain(
      'JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID',
    );

    /* Declaration order, positionally. */
    const positions = [
      projection.indexOf('JOIN SwProduct '),
      projection.indexOf('JOIN SwProductType '),
      projection.indexOf('JOIN SwAlternateSkuCode '),
      projection.indexOf('JOIN SwSku bslatwallsku'),
      projection.indexOf('JOIN SwBrand '),
    ];
    for (const position of positions) {
      expect(position).toBeGreaterThan(0);
    }
    expect(positions).toStrictEqual([...positions].sort((left, right) => left - right));

    /*
     * The brand join is a left join, and nothing in either statement is an inner one. An omitted kind
     * and an explicit `left` emit the same keyword (`org/Hibachi/HibachiSmartList.cfc:L537-L540`), so the
     * observable guarantee is the absence of an eliminating join rather than the presence of the word on
     * one of the five. It matters most for the brand: `Product.brand` is optional, and an inner join there
     * would silently drop every brandless product out of the merchant feed.
     */
    for (const statement of statements) {
      expect(statement.sql).not.toContain('INNER JOIN');
    }
    expect(projection).toContain('LEFT JOIN SwBrand');
  });

  it('[NET-NEW] emits the three activity filters and the QATS `1^` lower bound, all bound positionally', async () => {
    const { statements } = await dispatchEndToEndFeed();
    /*
     * Statement 0, not 1: perf-02's records-only read issues no count. See the joins case above.
     */
    const projection = statements[0];

    /*
     * `feed.cfc:L68-L70` — the SKU's own flag, then the product's, then the product's publication.
     */
    expect(projection?.sql).toContain('aslatwallsku.activeFlag = ?');
    expect(projection?.sql).toContain('aslatwallproduct.activeFlag = ?');
    expect(projection?.sql).toContain('aslatwallproduct.publishedFlag = ?');

    /*
     * `feed.cfc:L72` — `addRange('product.calculatedQATS','1^')`. The trailing caret is the legacy's
     * open-ended upper bound, so the range emits a lower bound only: one predicate, `>=`, never
     * `BETWEEN`. This is the availability gate, and it is the reason `SmartListQueryPort` is a boundary
     * port rather than something the feed resolves itself — it reads a calculated inventory property.
     */
    expect(projection?.sql).toContain('aslatwallproduct.calculatedQATS >= ?');
    expect(projection?.sql).not.toContain('BETWEEN');
    expect(projection?.sql).not.toContain('<=');

    /*
     * Four values, in predicate order, and the bound one is the string `'1'` — the first element of the
     * two-character range value, carried as the legacy carries it rather than coerced to a number.
     * Nothing is interpolated: no quote and no identifier appears in either statement.
     */
    expect(projection?.params).toStrictEqual([1, 1, 1, '1']);
    for (const statement of statements) {
      expect(statement.sql).not.toContain("'");
      expect(statement.sql).not.toContain(END_TO_END_ID.product);
    }
  });

  it('[NET-NEW] hydrates the brand, the product type and the default SKU into the document', async () => {
    const { response, statements } = await dispatchEndToEndFeed();

    expect(response.statusCode).toBe(HTTP_STATUS.OK);
    expect(response.headers?.['Content-Type']).toBe(XML_CONTENT_TYPE);

    /*
     * Six statements: the materialisation count, the record projection, then one lookup per
     * aggregate — product, product type, brand, default SKU. Four lookups for two records is the point: the
     * loaders batch by identifier rather than issuing a statement per row, which is what keeps a
     * whole-catalog feed from degenerating into a statement storm.
     */
    expect(statements).toHaveLength(6);
    expect(statements[0]?.sql).toContain('AS recordsCount');
    expect(statements[1]?.sql).not.toContain('COUNT(');
    expect(statements[2]?.sql).toContain('FROM SwProduct WHERE productID IN (?)');
    expect(statements[3]?.sql).toContain('FROM SwProductType WHERE productTypeID IN (?)');
    expect(statements[4]?.sql).toContain('FROM SwBrand WHERE brandID IN (?)');
    expect(statements[5]?.sql).toContain('FROM SwSku WHERE skuID IN (?)');
    expect(statements[5]?.params).toStrictEqual([END_TO_END_ID.defaultSku]);

    const items = parseFeedItems(response.body);
    expect(items).toHaveLength(2);
    const [selected] = items;
    expect(selected).toBeDefined();
    if (selected === undefined) {
      throw new Error('The feed document carries no first item.');
    }

    /* The record's own column. */
    expect(soleChildText(selected, 'g:id')).toBe('FP-1-SKU');
    /* The persisted calculated title, not the template-driven `getTitle()` — `product.cfm:L18`. */
    expect(soleChildText(selected, 'title')).toBe('PERSISTED-CALCULATED-TITLE');
    expect(soleChildText(selected, 'description')).toBe('A running shoe');

    /*
     * The three fields that can only come from hydration.
     * • `g:product_type` — the `SwProductType` row, reached through the product.
     * • `g:brand` — the `SwBrand` row, reached through the same product. Present only because the left
     * join above did not eliminate it and the loader attached it.
     * • `g:price` — `99.00`, the default SKU's price, not the selected record's `90.00`.
     */
    expect(soleChildText(selected, 'g:product_type')).toBe('Merchandise');
    expect(soleChildText(selected, 'g:brand')).toBe('Nike');
    expect(soleChildText(selected, 'g:price')).toBe('99.00');

    /*
     * The item group is the product's code, which is what groups variants together for the merchant.
     */
    expect(soleChildText(selected, 'g:item_group_id')).toBe('FP-1');

    /*
     * The configured host reaches every absolute URL, and the product URL key comes from a setting.
     */
    expect(soleChildText(selected, 'link')).toBe(
      `http://${END_TO_END_HOST}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/feed-product/`,
    );
    expect(soleChildText(selected, 'g:image_link')).toBe(
      `http://${END_TO_END_HOST}${SKU_COMPOSED_IMAGE_PATH}`,
    );

    /* Both settings that compose one field, in one value — `product.cfm`'s two-setting weight. */
    expect(soleChildText(selected, 'g:shipping_weight')).toBe(
      `${SETTING_SKU_SHIPPING_WEIGHT} ${SETTING_SKU_SHIPPING_WEIGHT_UNIT_CODE}`,
    );
  });

  it('[NET-NEW] emits one additional-image element per supplied image, in INPUT order, per record', async () => {
    const { response, imageReaderSubjects, images } = await dispatchEndToEndFeed();

    /* Consulted once per selected record, in selection order — never once per product. */
    expect(imageReaderSubjects).toStrictEqual([END_TO_END_ID.sku, END_TO_END_ID.defaultSku]);

    const items = parseFeedItems(response.body);
    const [selected, defaultSkuItem] = items;
    if (selected === undefined || defaultSkuItem === undefined) {
      throw new Error('The feed document does not carry both items.');
    }

    /*
     * Four elements, in the reader's own order, with the repeat intact. The supplied order is third,
     * first, second, first. A document that sorted them, de-duplicated them, or emitted one element with
     * a joined value would differ from this expectation; `product.cfm:L24` loops the collection and emits
     * one element per entry, so the collection's order is the document's order.
     */
    const emitted = childrenNamed(selected, 'g:additional_image_link').map(
      (element) => element.text,
    );
    expect(emitted).toStrictEqual([
      `http://${END_TO_END_HOST}${THIRD_ADDITIONAL_IMAGE_PATH}`,
      `http://${END_TO_END_HOST}${FIRST_ADDITIONAL_IMAGE_PATH}`,
      `http://${END_TO_END_HOST}${SECOND_ADDITIONAL_IMAGE_PATH}`,
      `http://${END_TO_END_HOST}${FIRST_ADDITIONAL_IMAGE_PATH}`,
    ]);

    /*
     * The record the reader answered `[]` for emits none — the empty collection's legacy output.
     */
    expect(childrenNamed(defaultSkuItem, 'g:additional_image_link')).toStrictEqual([]);

    /*
     * And every one of them went through `ImagePathPort.getResizedImagePath`, which is the half of
     * the current contract that asked for the port to do the resolution rather than the reader. Four
     * additional images plus the selected record's own image file; the repeat is requested twice, because
     * the serializer's memo is keyed on the whole request and two entries carrying the same path are the
     * same request.
     */
    const resized = resizeRequests(images);
    expect(resized.length).toBeGreaterThanOrEqual(4);
    expect(resized.map((request) => request.imagePath)).toContain(THIRD_ADDITIONAL_IMAGE_PATH);
    expect(resized.map((request) => request.imagePath)).toContain(SECOND_ADDITIONAL_IMAGE_PATH);
    expect(resized.map((request) => request.imagePath)).toContain(SKU_COMPOSED_IMAGE_PATH);
  });

  it(
    '[NET-NEW] answers the document from the ANONYMOUS address, and 404 from every other spelling',
    async () => {
      const { response } = await dispatchEndToEndFeed();

      /*
       * The address is `Google:feed.product` and it is ungated, which is a ported fact rather than A
       * choice. `integrationServices/google/views/main/default.cfm` documents the route as
       * `?slatAction=google:feed.product`, and `integrationServices/google/controllers/feed.cfc:L54-L56`
       * declares `this.publicMethods="product"` with `this.anyAdminMethods=""` and `this.secureMethods=""`
       * both empty — so the legacy feed demanded neither a login nor a permission. It is therefore the one
       * route in this deliverable that answers a document rather than a 401, and the colon in its name is.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.body.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);

      const channel = parseFeedChannel(response.body);
      expect(soleChildText(channel, 'title')).toBe('Slatwall Product Feed');
      expect(soleChildText(channel, 'link')).toBe(`http://${END_TO_END_HOST}`);

      /*
       * The address is exact in its punctuation and case-insensitive in its letters, which is two
       * findings meeting rather than an inconsistency.
       * • The whole string is one declared key — the colon is part of the address, not a namespace this
       * router resolves — so a reader who expects `org/Hibachi/FW1/framework.cfc`'s `slatAction`
       * convention to treat `Google` as a section and resolve variants of it is answered 404.
       */
      const differentCasing = await dispatchEndToEndFeed('GOOGLE:FEED.PRODUCT');
      expect(differentCasing.response.statusCode).toBe(HTTP_STATUS.OK);
      expect(differentCasing.response.body.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);

      for (const nearMiss of ['google.feed.product', 'googlefeed.product', 'feed.product']) {
        const refused = await dispatchEndToEndFeed(nearMiss);

        expect(refused.response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
        /* And nothing was selected for it — the 404 precedes every read. */
        expect(refused.statements).toStrictEqual([]);
        expect(refused.queries).toStrictEqual([]);
      }
    },
    /*
     * Five dispatches, each resetting the module registry and re-requiring the composition root and the
     * router, so this case costs materially more than its siblings. The budget is stated rather than left to
     * the 5-second default — a timeout here would read as a hang in the subject rather than as the cost of
     * loading the graph five times.
     */
    END_TO_END_MULTI_DISPATCH_TIMEOUT_MS,
  );
});
