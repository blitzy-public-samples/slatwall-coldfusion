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

/* ⚠️ NEITHER `FEED_RENDERING` NOR `FeedRendering` IS IMPORTED, AND BOTH USED TO BE. The serializer
 * exposed a rendering discriminant so a caller could ask for byte-parity output instead of escaped
 * output. That mode is withdrawn — its unsafe half was a reachable code path — so there is one rendering,
 * nothing to select, and no constant or union to name. */
import {
  ProductFeedBuilder,
  type ProductFeedImage,
  type ProductFeedRecord,
  type ProductFeedRenderContext,
} from '../../src/integrations/google/ProductFeedBuilder';
import { DataIntegrityError, DomainError } from '../../src/errors/DomainError';
import type { SettingResolutionContext } from '../../src/ports/SettingResolverPort';
/* The three additional image-port types and the pricing port itself are named by §1.5's gating wrappers,
 * which stand in front of the shared doubles to observe the render's execution order. */
import type {
  ImagePathPort,
  ImageWebPath,
  ResizedImagePathRequest,
  SaveImageFileRequest,
} from '../../src/ports/ImagePathPort';
import type { PricingPort, SalePriceDetailsBySkuId } from '../../src/ports/PricingPort';
import type { Sku } from '../../src/domain/sku/Sku';
import type { Product } from '../../src/domain/product/Product';
import type { ProductType } from '../../src/domain/product/ProductType';
import type { Brand } from '../../src/domain/product/Brand';
import { toExactDecimal } from '../../src/util/formatting';
import type { ExactDecimal } from '../../src/util/formatting';
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
 * JUDGMENT, RECORDED RATHER THAN APPLIED SILENTLY: the two instants are constructed with the
 * LOCAL-TIME `new Date(y, m, d, …)` form rather than with `Date.UTC`, and the expected bytes below
 * repeat the very same components. That is what makes these assertions host-timezone-independent, and
 * it is host-independent for the right reason: `integrationServices/google/views/feed/product.cfm:L30`
 * formats each value with `dateFormat`/`timeFormat`, neither of which converts a zone, so whatever
 * components a value carries in the engine's own zone are the components emitted. Constructing the
 * instant FROM those components and asserting them BACK reproduces exactly that identity, wherever the
 * suite runs.
 *
 * ⚠️ AN EARLIER REVISION OF THIS SUITE USED `Date.UTC` AND EXPECTED SHIFTED COMPONENTS — `12:30:45`
 * supplied, `07:30:45-5` asserted — because the builder then subtracted the raw offset and read UTC
 * accessors. That arithmetic has no counterpart at `:L30`, so the expectations were blessing a
 * five-hour drift rather than detecting it; both the production shift and these expectations are gone.
 * The suffix is a LABEL: the case below proves that changing only the offset text moves neither
 * endpoint's date nor its time.
 *
 * THE TIMES ARE CHOSEN TO BE UNAMBIGUOUS IN EVERY REAL ZONE. Daylight-saving transitions fall in the
 * small hours, so a mid-morning and a mid-afternoon wall clock exist exactly once on every date in
 * every zone — no local literal below can land in a skipped or repeated hour. `09:05:07` additionally
 * exercises zero-padding on all three time components at once.
 *
 * Epoch milliseconds are held at module scope because a number is immutable; the `Date` objects
 * themselves are constructed inside the scenario factory so no two cases can share one.
 */
const RENDER_INSTANT_EPOCH_MS = new Date(2024, 0, 1, 9, 5, 7).getTime();
const SALE_EXPIRATION_EPOCH_MS = new Date(2024, 1, 9, 14, 15, 0).getTime();
const RAW_UTC_HOUR_OFFSET = '5';
const RENDER_HOST = 'catalog.example.test';
const ABSOLUTE_URL_PREFIX = `http://${RENDER_HOST}`;

/*
 * The two endpoint timestamps, WITHOUT the offset label — the components of the two instants above,
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
 * ⭐ A STRICT XML READER, WRITTEN HERE ON PURPOSE — review finding F1's parser requirement
 * -----------------------------------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL. Review finding F1 records that this suite "expressly require[d] malformed XML
 * and avoid[ed] a parser", and it required parser-based assertions instead. Substring assertions can
 * only ever say "these bytes appear somewhere"; they cannot say "the document has ONE channel link whose
 * value is exactly this", which is the only assertion that distinguishes an escaped host from a host
 * that closed the element and opened three of its own. Every escaping case below therefore parses.
 *
 * WHY IT IS HAND-WRITTEN RATHER THAN A DEPENDENCY. Two independent constraints. Node 20 exposes no
 * `DOMParser` and no XML parser in its standard library — `node -e "typeof DOMParser"` answers
 * `undefined` on the pinned 20.20.2 runtime. And AAP §0.5.2 fixes the dependency set at one runtime and
 * ten development packages, every version verified; adding an eleventh to satisfy a test would change the
 * manifest the plan pins (AAP §0.5.3) for a need the subtree can meet on its own.
 *
 * WHY BEING NARROW IS A FEATURE. This reader accepts only the grammar the feed emits — an optional
 * declaration, elements, attributes on the root, character data, and the five predefined entity
 * references plus numeric character references. It REFUSES a comment, a processing instruction, a CDATA
 * section, a self-closing tag, a mismatched end tag, an unquoted attribute, a raw `<` in character data,
 * an unknown entity reference and any trailing content after the root. A permissive parser would recover
 * from exactly the malformation an escaping bug produces, and recovery is what must not happen here: the
 * point is that a hostile value CANNOT change the document's shape, so anything that would change it has
 * to fail loudly.
 *
 * NOT A PRODUCTION COMPONENT. It lives in the suite, is exported nowhere, and asserts nothing about
 * `src/**`'s own behaviour beyond the bytes it produced.
 * -------------------------------------------------------------------------------------------------- */

interface ParsedElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly ParsedElement[];
  /** The DECODED character data directly inside this element, excluding any child element's text. */
  readonly text: string;
}

/** The five entity references XML predefines. Anything else is refused rather than passed through. */
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

/**
 * Decode one run of character data, refusing anything XML forbids there.
 *
 * A raw `<` is refused because it can only be a tag the caller did not intend. A bare `&` is refused
 * because it has no defined meaning — which is precisely the state an unescaped ampersand used to leave
 * this document in, and precisely what this suite must be able to detect rather than tolerate.
 */
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
 * @returns the root element, with every text node already decoded
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
  /**
   * Park every pricing read until the case settles it, instead of answering on the next microtask.
   *
   * ⭐ THE ONLY WAY TO TELL A SEQUENTIAL RENDER FROM A CONCURRENT ONE. With immediate doubles, a
   * `Promise.all` over the records starts every call in input order and resolves them in input order, so
   * a start-order assertion passes for the wrong implementation. Gating separates the START of a call
   * from its RESOLUTION and puts the second under the case's control, which is what makes "record N+1 has
   * not begun" observable. Defaults off, so every existing case is untouched.
   */
  readonly deferPricing?: boolean;
  /** The same, for the resized-image reads inside one record. Defaults off. */
  readonly deferImages?: boolean;
  readonly brand?: 'present' | 'absent';
  readonly brandName?: string;
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
       * TWO ARGUMENTS, WHICH IS THE WHOLE DECLARED SURFACE. A third `ProductFeedRenderOptions` parameter
       * carrying an `AbortSignal` was withdrawn as an unapproved behaviour addition with no legacy
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

    /*
     * ⚠️ THIS CASE PROVES OUTPUT ORDER, NOT EXECUTION ORDER, AND THE DIFFERENCE IS LOAD-BEARING.
     * `Promise.all(records.map(buildItem))` resolves to an array in ARGUMENT order regardless of which
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

/* =====================================================================================================
 * §1.5 — SEQUENTIAL RENDERING: ONE RECORD AT A TIME, PROVED BY PORTS THAT DO NOT RESOLVE.
 *
 * `integrationServices/google/views/feed/product.cfm:L16` is an ordered `cfloop` over
 * `rc.skuSmartList.getRecords()` on a single-threaded request: record 2's first data access could not
 * begin until record 1's item was complete. `ProductFeedBuilder.build` reproduces that with a `for…of`
 * loop that awaits one `buildItem` at a time.
 *
 * ⛔ NO ASSERTION ON FINAL OUTPUT CAN ESTABLISH THAT. `Promise.all(records.map(buildItem))` produces its
 * results in argument order however the individual renders interleave, so a concurrent implementation
 * emits a byte-identical document and passes every value, branch, order and record-order case in this
 * file. The doubles the rest of the suite uses resolve immediately, which hides the difference
 * completely.
 *
 * SO EXECUTION IS OBSERVED DIRECTLY. Both asynchronous ports — images and pricing — are wrapped in a
 * gate that RECORDS each call as it starts and then blocks until the test releases it. With record 1
 * held at its very first await, a sequential render cannot have started record 2, and a concurrent one
 * cannot have avoided starting it. Releasing one operation at a time then exposes the whole execution
 * order rather than just its endpoints.
 *
 * WHY IT MATTERS BEYOND TIDINESS: M2 (AAP §0.6.6) leaves the feed's delivery model an open decision, and
 * a future revision reaching for concurrency to fit a narrower budget is exactly the change this section
 * is here to catch. The synchronous setting port is NOT gated — it is synchronous by contract (M8) and
 * has no await to hold.
 * ================================================================================================== */

/** One operation the builder started and has not been allowed to finish. */
interface GatedOperation {
  readonly label: string;
  /** Let the underlying port answer. */
  release(): void;
}

/**
 * Records every gated operation in START order and holds each one until released.
 *
 * The label is recorded BEFORE the promise is handed back, so `started` is the order in which the
 * builder REACHED each await — which is the property under test — rather than the order in which the
 * answers arrived.
 */
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

/**
 * Hand control back to the event loop so every microtask the release unblocked can run.
 *
 * `setImmediate` rather than a bare `await Promise.resolve()`: one microtask tick only advances the
 * render past one `await`, whereas a macrotask boundary drains the whole queue, so `started` is fully
 * settled before it is inspected. No timer, no delay and no polling interval is involved — nothing here
 * depends on elapsed time, which is what keeps these cases deterministic rather than flaky.
 */
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

/*
 * Two records over two DISTINCT products, each with one additional image.
 *
 * DISTINCT PRODUCTS AND DISTINCT IMAGE PATHS ARE REQUIRED, not incidental. The builder memoises resized
 * paths per render keyed on the whole request, and sale-price detail per product; two records sharing a
 * product or a path would have their second record's port calls served from those memos, leaving nothing
 * to observe. Each record therefore performs exactly three gated operations, in this order:
 *   1. `resize:<primary image>`      — `product.cfm:L23`
 *   2. `resize:<additional image>`   — `product.cfm:L24`
 *   3. `pricing:<product>`           — the `:L28` gate's sale-price read
 */
const SEQUENCING_SECOND_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb3';
const SEQUENCING_FIRST_IMAGE_FILE = 'first-primary.jpg';
const SEQUENCING_SECOND_IMAGE_FILE = 'second-primary.jpg';
const SEQUENCING_FIRST_ADDITIONAL_PATH = '/product/default/first-additional.jpg';
const SEQUENCING_SECOND_ADDITIONAL_PATH = '/product/default/second-additional.jpg';

const SEQUENCING_FIRST_RECORD_OPERATIONS: readonly string[] = Object.freeze([
  `resize:${SEQUENCING_FIRST_IMAGE_FILE}`,
  `resize:${SEQUENCING_FIRST_ADDITIONAL_PATH}`,
  `pricing:${PRODUCT_ID}`,
]);
const SEQUENCING_SECOND_RECORD_OPERATIONS: readonly string[] = Object.freeze([
  `resize:${SEQUENCING_SECOND_IMAGE_FILE}`,
  `resize:${SEQUENCING_SECOND_ADDITIONAL_PATH}`,
  `pricing:${SEQUENCING_SECOND_PRODUCT_ID}`,
]);

interface SequencingHarness {
  readonly operations: OperationGate;
  /** Start the render WITHOUT awaiting it, so the gate can be inspected mid-flight. */
  start(): Promise<string>;
}

function createSequencingHarness(): SequencingHarness {
  const operations = createOperationGate();
  const settings = createSettingResolverDouble({ settings: [...DEFAULT_SETTING_SEEDS] });
  /* Unseeded resize answers, so the double echoes each request's own path and every gated label is
   * distinct — a single global answer would make the two records' operations indistinguishable. */
  const images = createImagePathDouble();
  const pricing = createPricingDouble();

  const builder = new ProductFeedBuilder(
    gateResizedImagePaths(images.imagePaths, operations),
    gateSalePriceReads(pricing.pricing, operations),
    settings.resolver,
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
     * THE CORE ANTI-CONCURRENCY ASSERTION. One operation has started: record 1's primary image resize,
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
     * Released one at a time, asserting after each release, so the ENTIRE execution order is observed
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

    /* Record 1's last operation released — only NOW may record 2 begin. */
    await harness.operations.releaseOldest();
    expect(harness.operations.started).toStrictEqual([
      ...SEQUENCING_FIRST_RECORD_OPERATIONS,
      SEQUENCING_SECOND_RECORD_OPERATIONS[0],
    ]);

    await harness.operations.releaseAll();

    /* The full execution order: record 1's three operations, then record 2's three, never interleaved. */
    expect(harness.operations.started).toStrictEqual([
      ...SEQUENCING_FIRST_RECORD_OPERATIONS,
      ...SEQUENCING_SECOND_RECORD_OPERATIONS,
    ]);

    /* And the document that came out of that execution is the two records in the order supplied. */
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
     * event loop REPEATEDLY, without releasing anything, must not advance the render at all. A render
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
 * §3 — Absolute URLs and images. Every one of these fields is now ESCAPED at its emission site.
 *
 * ⭐ THIS HEADER READ "Every one of these fields is UNESCAPED", which was true of the legacy view and true
 * of the port until review finding F7. Reinstated DECISION G-3 escapes the item `<link>`, `<g:image_link>`
 * and every `<g:additional_image_link>` — each in ONE pass over its finished URL, prefix and path
 * together, so a host containing `&` is escaped exactly once rather than twice. The escaping is
 * byte-identical for every URL with no XML metacharacter in it, which is every URL the legacy could
 * render into a well-formed document; it diverges only where the legacy emitted bytes with no defined XML
 * parse at all. That is D18's shape, and it is declared rather than silent.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — links and images', () => {
  it('[NET-NEW] emits the item link over hard-coded http, keeping the product URL leading and trailing slashes', async () => {
    const scenario = createScenario({ urlTitle: 'nike-air' });

    const xml = await scenario.render();

    /*
     * `integrationServices/google/views/feed/product.cfm:L22` concatenates the hard-coded `http://`, the
     * configured host and `product.getProductURL()`. `model/entity/Product.cfc:L207-L209` composes that
     * path as `/#setting('globalURLKeyProduct')#/#getURLTitle()#/`, so it carries BOTH a leading and a
     * trailing slash. Neither is trimmed, and the two slashes are why the concatenation needs no separator.
     *
     * ⚠️ THE TITLE'S "hard-coded http" IS ABOUT THE SCHEME, NOT ABOUT ESCAPING. `:L22` writes the literal
     * `http://` with no `https` branch and no setting behind it, which is what the negative assertion
     * below pins. The value itself IS escaped — the neighbouring case proves that — and this case is the
     * byte-identity half of the same claim: a title with no XML metacharacter emits unchanged.
     */
    expect(xml).toContain(
      itemField(`<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/</link>`),
    );
    expect(xml).not.toContain('<link>https://');
    /* The URL key is read through the setting resolver, not hard-coded in the builder. */
    expect(resolvedSettingNames(scenario.settings)).toContain('globalURLKeyProduct');
  });

  it('[NET-NEW] CWE-91 percent-encodes then escapes a URL title carrying XML metacharacters', async () => {
    const scenario = createScenario({ urlTitle: ESCAPE_SENTINEL });

    const xml = await scenario.render();

    /*
     * TWO REMEDIES, IN ORDER, AND THEY ANSWER DIFFERENT ATTACKS.
     *
     * `:L22` wraps the link in no `htmlEditFormat` call and validates nothing, so a `urlTitle` carrying `&`
     * or `<` reached the legacy document raw and left it with no defined XML parse. The port percent-encodes
     * each PATH SEGMENT first — which is what stops a stored value introducing a URL authority, query or
     * fragment — and then escapes the finished URL once, which is what stops it introducing markup.
     *
     * ⛔ AN EARLIER REVISION ASSERTED THE OPPOSITE HERE, requiring the sentinel to appear unencoded and
     * unescaped, and justified never using an XML parser on the ground that "a parser would either reject
     * the document or silently normalise the very bytes under test". That is now the point: the document is
     * well-formed, and a parser is used — see §10, which parses a document built from hostile values in
     * every sink and requires each one to come back as character data.
     *
     * WHAT THE ENCODER PRODUCES FOR THIS INPUT. `encodeURIComponent` escapes `&`, `<`, `>`, `\"` and the
     * apostrophe, and leaves the letters alone, so the sentinel's own metacharacters are gone before the
     * XML escape ever runs. The escape is consequently a no-op on this value, which is why the assertion
     * looks for the percent-encoded form rather than for entities.
     */
    const encodedSentinel = encodeURIComponent(ESCAPE_SENTINEL);
    expect(encodedSentinel).toBe("A%26B%3CC%3ED%22E'F");
    expect(xml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${encodedSentinel}/</link>`,
      ),
    );
    /* Neither the bare sentinel nor an entity-escaped one survives anywhere in the link. */
    expect(xml).not.toContain(`/${ESCAPE_SENTINEL}/`);
    expect(xml).not.toContain(`/${ESCAPED_SENTINEL}/`);
    /* And the separators the legacy relies on are untouched by the encoding. */
    expect(xml).toContain(`<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/`);
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
     * ONE RESOLUTION PER IMAGE, THE REPEAT INCLUDED — FIVE IN TOTAL FOR THE SKU'S OWN IMAGE PLUS FOUR
     * PRODUCT IMAGES. `:L23` resolves a resized path once per SKU and `:L24` resolves one per element of
     * the product's image collection, with no de-duplication anywhere, so the DUPLICATE path is resolved
     * TWICE. That call pattern is the behaviour being ported.
     *
     * ⛔ AN EARLIER REVISION COLLAPSED THE REPEAT AND THIS CASE REQUIRED THE COLLAPSE, asserting FOUR
     * requests and describing the difference as a "PORT-CALL optimisation". Both the memo and the
     * requirement are withdrawn: AAP §0.1.1.1 records "Explicitly not: Performance refactoring" as a
     * dimension of this migration and §0.8.2 guideline 4 forbids optimising beyond what the migration
     * requires. Neither `../../src/ports/ImagePathPort` nor `../../src/ports/PricingPort` declares its
     * reads idempotent or cacheable either, so collapsing them assumed something the contracts never
     * promised.
     *
     * The count is asserted in the POSITIVE direction — five calls, in this order, duplicate included —
     * rather than as a ceiling, so this case pins the legacy pattern instead of pinning an efficiency
     * claim in either direction.
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
     * M7 — THE BUILDER HOLDS NO STATE AT ALL, WHICH IS A STRONGER STATEMENT THAN THE ONE THIS CASE USED TO
     * MAKE. It previously asserted that an invocation-scoped resized-path MEMO did not outlive a `build`
     * call; the memo is withdrawn (see the case above), so there is now nothing to outlive anything and the
     * second render simply repeats the first render's two resolutions. Nothing survives between invocations
     * of a serverless runtime except module scope, and the only module-scope values in the builder are
     * frozen literal constants — so a warm container cannot serve one tenant's resolved paths to the next.
     *
     * Nothing here asserts a cache size, a hit rate or a timing figure: the claim is that the second render
     * behaves exactly like the first.
     */
    expect(afterFirstBuild).toStrictEqual([SKU_COMPOSED_IMAGE_PATH, FIRST_ADDITIONAL_IMAGE_PATH]);
    expect(afterSecondBuild).toStrictEqual([
      SKU_COMPOSED_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
      SKU_COMPOSED_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
    ]);
    /* Stated once more as the relation itself, so the intent survives a change to either literal. */
    expect(afterSecondBuild.slice(afterFirstBuild.length)).toStrictEqual(afterFirstBuild);
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
     * ⭐ THE PRICING HALF OF REVIEW FINDING F2, WHICH HAD NO MULTI-SKU COVERAGE AT ALL UNTIL THIS CASE.
     * The sibling above pins ONE request for ONE SKU, and one request is what a document-wide cache
     * produces too — so the single-SKU assertion could never have detected the withdrawn decorator.
     * `memoisePricingByProduct(this.pricing)` keyed sale-price detail on `productId` and handed the same
     * wrapper to every record in the document, so a product with `n` feed SKUs resolved its detail ONCE.
     * It is WITHDRAWN under F2 — AAP §0.8.2 Refactor Discipline Guideline 4 forbids optimisation beyond
     * what the migration requires, and a document-wide cache is optimisation and nothing else. TWO SKUs
     * is the smallest input on which the withdrawal is observable, which is why this case exists.
     *
     * ⭐ TWO IS THE LEGACY NUMBER, NOT A TOLERATED REGRESSION. [model/entity/Sku.cfc:L539-L544] memoizes
     * `getSkuSalePriceDetails( getSkuID() )` in the SKU's OWN variables scope, so the memo is per SKU
     * INSTANCE under Hibernate — two hydrated SKUs of one product each resolved the product-wide lookup
     * for themselves. {@link Sku.getSalePriceDetails} reproduces exactly that scope with a private field,
     * which is why this assertion is 2 rather than 1 and equally why it is 2 rather than 4: the two reads
     * the builder performs per item, `getSalePrice` and `getSalePriceExpirationDateTime`, share the one
     * instance memo between them. That memo STAYS — it is the legacy's own, not the port's addition.
     *
     * ⚠️ THE PRODUCT IDENTIFIER IS ASSERTED, NOT JUST THE CALL COUNT. The port is keyed by PRODUCT while
     * its answer is keyed by SKU (`SkuSalePricingLookup`), so a port called twice with two DIFFERENT keys
     * would be a different defect passing the same count. Asserting the recorded list pins both, and it
     * is the assertion a reinstated `memoisePricingByProduct` would fail rather than silently satisfy.
     */
    expect(scenario.pricing.requestedProductIds).toStrictEqual([PRODUCT_ID, PRODUCT_ID]);
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

/**
 * Render `YYYY-MM-DDTHH:mm:ss` from a `Date`'s LOCAL components.
 *
 * Deliberately independent of the builder and of `src/util/formatting`: it reads the six local
 * accessors directly, so an assertion built on it fails if the builder ever converts a zone, reads UTC
 * accessors, or shifts an instant before formatting it. That is the whole point — the expected value is
 * computed from the input the render was given rather than from the code under test.
 */
function localComponentTimestamp(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

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
     *
     * ⛔ AND NEITHER ENDPOINT'S COMPONENTS ARE CORRECTED FOR THE OFFSET. `dateFormat` and `timeFormat`
     * convert no zone: each renders the components of the value it is handed, and the offset is appended
     * afterwards as a bare label. So the render instant `2024-01-01T09:05:07` local emits exactly
     * `2024-01-01T09:05:07`, and the expiration likewise — the components below are the components
     * supplied, unmoved. Subtracting the offset first (which an earlier revision of the builder did)
     * would move every emitted timestamp by the whole offset while the assertions still read green,
     * which is why the components are pinned against locally constructed literals here.
     */
    expect(content).toBe(`${EXPECTED_EFFECTIVE_DATE_START}/${EXPECTED_EFFECTIVE_DATE_END}`);

    /* Two endpoints, each carrying the SAME raw offset value, and the date/time pieces exact. */
    const endpoints = (content ?? '').split('/');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toBe(`2024-01-01T09:05:07-${RAW_UTC_HOUR_OFFSET}`);
    expect(endpoints[1]).toBe(`2024-02-09T14:15:00-${RAW_UTC_HOUR_OFFSET}`);

    /*
     * The same claim stated INDEPENDENTLY of the literals above, so a future edit cannot make both agree
     * on a wrong value: each endpoint's date and time are read back out of the document and compared
     * against the components of the very `Date` objects the render was given.
     */
    expect(endpoints[0]).toBe(
      `${localComponentTimestamp(new Date(RENDER_INSTANT_EPOCH_MS))}-${RAW_UTC_HOUR_OFFSET}`,
    );
    expect(endpoints[1]).toBe(
      `${localComponentTimestamp(scenario.saleExpiration)}-${RAW_UTC_HOUR_OFFSET}`,
    );

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
    /*
     * And it is the ONLY element that carries one, which the count states rather than implies: the tab
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
     * The offset is interpolated as TEXT, exactly as `getTimeZoneInfo().utcHourOffset` reached the
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
     * THE REGRESSION GUARD FOR THE WITHDRAWN OFFSET CORRECTION, stated as a property rather than as a
     * literal. `:L30` uses the offset in one place only — as the text after the literal hyphen — so
     * rendering the SAME two instants under several different offsets must produce documents that differ
     * in the suffixes and NOWHERE ELSE. Any reintroduced arithmetic, of any sign or magnitude, changes at
     * least one date or time component and fails this case.
     *
     * `'0'` is included deliberately: under the withdrawn shift it was the one offset that left the
     * components alone, so it is the value against which every other offset's drift is measurable.
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

      /* The suffix is the offset text after the template's literal hyphen — even when the text itself
       * carries a minus, which is why `-3` renders the doubled `--3` rather than being re-signed. */
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

  it('[NET-NEW] CWE-91 escapes both shipping-weight settings, and the separator space between them', async () => {
    const scenario = createScenario({
      settings: [
        { settingName: 'skuShippingWeight', value: '1&2' },
        { settingName: 'skuShippingWeightUnitCode', value: '<lb>' },
      ],
    });

    const xml = await scenario.render();

    expect(xml).toContain(itemField('<g:shipping_weight>1&amp;2 &lt;lb&gt;</g:shipping_weight>'));
    /* The malformed form the review quoted must be gone entirely. */
    expect(xml).not.toContain('<g:shipping_weight>1&2 <lb></g:shipping_weight>');
    /* The legacy's single literal separator space is preserved by the escape, not consumed by it. */
    expect(xml).toContain('&amp;2 &lt;lb&gt;');
    /*
     * THE TWO NEGATIVES BELOW ARRIVED FROM A SECOND, INDEPENDENTLY-WRITTEN COPY of this case and are
     * folded in rather than discarded, because each forecloses something the three assertions above do
     * not. The first is a PREFIX absence: it fails on any document containing the raw `1&2` immediately
     * after the open tag, whatever follows it, where the full-string negative above only fails on the one
     * exact malformed rendering. The second is the one that matters most — a raw `<lb>` reaching the
     * document would make `</g:shipping_weight>` the close of a `<lb>` element rather than of this field,
     * so asserting that `<lb></g:shipping_weight>` appears nowhere is the direct statement that the unit
     * code cannot terminate the element it lives inside.
     */
    expect(xml).not.toContain('<g:shipping_weight>1&2');
    expect(xml).not.toContain('<lb></g:shipping_weight>');
  });
});

/* =====================================================================================================
 * §6.5 — THE COMPLETE SIXTEEN-POSITION ITEM ORDER.
 *
 * Every section above pins a field's VALUE and its BRANCH; none of them pins where the field sits.
 * `integrationServices/google/views/feed/product.cfm:L17-L58` fixes all sixteen positions, a merchant
 * processor reads a positional document, and the order is also the only thing that lets a reader diff
 * `ProductFeedBuilder.buildItem` against the view line by line. Without a whole-sequence assertion any
 * reorder among the earlier positions stays green — every individual value assertion below uses
 * `toContain`, which is order-blind by construction.
 *
 * So the item's DIRECT CHILDREN are extracted and compared against the legacy sequence as a list. The
 * two cases straddle the three conditional positions: one item carrying everything the view can emit,
 * and one carrying the minimum, so a conditional field cannot drift into a different slot in either
 * branch.
 * ================================================================================================== */

/**
 * The legacy item field sequence, `product.cfm:L17-L58`, with each position's locator.
 *
 * Position 8 appears ONCE here and is REPEATED in the document: `:L24` loops the product's images and
 * emits one `g:additional_image_link` per image, so the extractor below collapses a run of them to a
 * single entry. Collapsing a RUN rather than de-duplicating globally is deliberate — two runs separated
 * by another field would survive de-duplication and must not survive this comparison.
 */
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

/** The sequence with the three conditional positions removed — the minimum a rendered item carries. */
const LEGACY_ITEM_FIELD_SEQUENCE_WITHOUT_CONDITIONALS: readonly string[] = Object.freeze(
  LEGACY_ITEM_FIELD_SEQUENCE.filter(
    (fieldName) =>
      fieldName !== 'g:additional_image_link' &&
      fieldName !== 'g:sale_price' &&
      fieldName !== 'g:sale_price_effective_date' &&
      fieldName !== 'g:brand',
  ),
);

/**
 * Extract the element names of one `<item>`'s direct children, in document order.
 *
 * The builder emits one element per line at a fixed indent, so the children are read off the lines
 * between `<item>` and `</item>` rather than by parsing: the document is deliberately allowed to be
 * ill-formed — `:L58` interpolates settings unescaped — so no parser may be involved (see §6's
 * shipping-weight case). Indent-anchored extraction also guarantees a channel-level `<title>` or
 * `<link>` cannot be mistaken for the item-level element of the same name.
 *
 * A run of one repeated name collapses to a single entry, which is what makes position 8 comparable
 * against the legacy list however many images a product has.
 */
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

    /* Direct children only: every one is emitted at exactly three tabs by `buildItem`. A nested
     * element would carry a deeper indent and is therefore not collected — the legacy's own nested
     * elements all sit inside its disabled comment blocks, so a live one appearing here would be
     * fabricated. */
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
      /* Three images, so the repeated position 8 is genuinely a run rather than a single element. */
      productImages: [
        { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
        { imagePath: SECOND_ADDITIONAL_IMAGE_PATH },
        { imagePath: THIRD_ADDITIONAL_IMAGE_PATH },
      ],
    });

    /*
     * ⚠️ RECOVERED FROM A FALSE CONFLICT ALIGNMENT — read this before trusting the diff of this case.
     *
     * The three cases in this describe assert ONE property: the sixteen item fields appear in
     * `integrationServices/google/views/feed/product.cfm`'s own source order. Nothing here concerns
     * escaping. A textual three-way merge nevertheless paired this block against the shipping-weight
     * ESCAPING assertions, because both blocks open with a `/*` at the same indent immediately after an
     * `await scenario.render(...)` — an alignment that is plausible line-for-line and wrong
     * case-for-case. Resolving that pairing to either side alone deletes real coverage: taking the
     * escaping side drops the field-order assertion AND the two cases below it outright.
     *
     * NOT ONE ESCAPING ASSERTION WAS LOST. `CWE-91 escapes both shipping-weight settings, and the
     * separator space between them` in §6 above is the same case, written independently; the two copies
     * agreed on the escaped join and then each pinned a negative the other did not, so §6's case now
     * carries the union of all five assertions with a note on what each negative forecloses. The two
     * blocks were never rival readings of one case — they are two different cases that a line-oriented
     * merge could not tell apart. Both survive, each in its own home, and neither lost an assertion.
     *
     * THE WHOLE SEQUENCE, AS A LIST. `toStrictEqual` on the extracted names is what makes a reorder
     * anywhere in the item fail — including the eleven positions ahead of the three that §7's
     * interleaving case already covers, and including a field moved from one side of a conditional to the
     * other.
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
     * ⭐ THIS IS THE HALF OF F7 THAT HAD TO BE PRESERVED, AND IT IS WHAT MAKES THE REVERSAL D18-SHAPED.
     * `1.5 lbs` carries none of `&`, `<`, `>` or `"`, so `String.replaceAll` matches nothing and the
     * emitted bytes are exactly what the legacy emitted. The divergence above falls only on values that
     * produced no parseable document at all.
     */
    expect(xml).toContain(itemField('<g:shipping_weight>1.5 lbs</g:shipping_weight>'));
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
 * §8 — The escaping map, and where its remaining asymmetry actually lies.
 *
 * ⭐ THIS SECTION WAS TITLED "The asymmetric escaping map", and the asymmetry it named was the LEGACY's:
 * six item fields wrapped in `htmlEditFormat` and nine dynamic values left raw, chosen field by field with
 * no rule behind the choice. Reinstated DECISION G-3 (review finding F7) escapes seven of those nine, so
 * that asymmetry is gone. What remains is a DIFFERENT and much smaller one — two exact-decimal money
 * fields and three literals bypass the helper — and it is asymmetric only in the sense that a value which
 * provably cannot carry a metacharacter is not handed to an escaper. The section is renamed rather than
 * left carrying the old claim, because "asymmetric htmlEditFormat escaping" now describes the state this
 * suite exists to prove was REPLACED.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — escaping every dynamic field', () => {
  it('[NET-NEW] escapes every dynamic field, including the URL, money and weight fields the legacy left raw', async () => {
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
     * THE ESCAPING ASYMMETRY THE LEGACY HAS, AND WHY THIS PORT DOES NOT REPRODUCE IT.
     *
     * `integrationServices/google/views/feed/product.cfm` wraps SIX dynamic values in `htmlEditFormat` and
     * leaves the rest untouched, field by field rather than by category:
     *   ESCAPED  — `g:id` (`:L17`), item `title` (`:L18`), the selected `description` (`:L19`),
     *              `g:product_type` (`:L21`), `g:brand` (`:L32`), `g:item_group_id` (`:L39`)
     *   RAW      — the channel `link` (`:L14`) and `description` (`:L15`), the item `link` (`:L22`),
     *              `g:image_link` (`:L23`), every `g:additional_image_link` (`:L24`), `g:price` (`:L27`),
     *              `g:sale_price` (`:L29`), `g:sale_price_effective_date` (`:L30`),
     *              `g:shipping_weight` (`:L58`)
     *
     * ⛔ THIS CASE USED TO PIN THAT SPLIT, requiring exactly six escaped occurrences and asserting the raw
     * form of the URL and weight fields byte for byte, on the reasoning that "a uniform 'escape everything'
     * implementation would corrupt every URL in the feed". It does not: a URL is corrupted by escaping only
     * if the escaped form is then used as a URL without being un-escaped, whereas an XML text node is
     * un-escaped by the parser before any consumer sees it. The nine raw sinks were a CWE-91 injection
     * surface, the code review classified them as MAJOR, and every dynamic node is now escaped.
     *
     * `htmlEditFormat` processes `&` FIRST and then `<`, `>` and the double quote, and it leaves the
     * APOSTROPHE alone — hence `A&B<C>D"E'F` becoming `A&amp;B&lt;C&gt;D&quot;E'F` with its single quote
     * intact rather than turned into `&#39;`. That behaviour is unchanged; only the set of fields it reaches
     * is wider.
     */
    /* The six the legacy escaped, unchanged. */
    expect(xml).toContain(itemField(`<g:id>${ESCAPED_SENTINEL}</g:id>`));
    expect(xml).toContain(itemField(`<title>${ESCAPED_SENTINEL}</title>`));
    expect(xml).toContain(itemField(`<description>${ESCAPED_SENTINEL}</description>`));
    expect(xml).toContain(itemField(`<g:product_type>${ESCAPED_SENTINEL}</g:product_type>`));
    expect(xml).toContain(itemField(`<g:brand>${ESCAPED_SENTINEL}</g:brand>`));
    expect(xml).toContain(itemField(`<g:item_group_id>${ESCAPED_SENTINEL}</g:item_group_id>`));

    /*
     * And the nine the legacy did not. THE THREE URL FIELDS SHOW THE ENCODING RATHER THAN ENTITIES, because
     * `encodeFeedUrlPath` runs first and removes every XML metacharacter from the path — so the escape that
     * follows finds nothing left to substitute. That ordering is the assertion: an implementation that
     * escaped without encoding would emit `&amp;` here and fail these three, and one that encoded without
     * escaping would leave the configured host unprotected and fail the hostile-host case below.
     */
    expect(xml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${encodeURIComponent(
          ESCAPE_SENTINEL,
        )}/</link>`,
      ),
    );
    expect(xml).toContain(
      itemField(
        `<g:image_link>${ABSOLUTE_URL_PREFIX}/product/default/${encodeURIComponent(
          'a&b<c.jpg',
        )}</g:image_link>`,
      ),
    );
    expect(xml).toContain(
      itemField(
        `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}/product/default/${encodeURIComponent(
          'd&e<f.jpg',
        )}</g:additional_image_link>`,
      ),
    );
    expect(xml).toContain(itemField('<g:shipping_weight>1&amp;2 &lt;lb&gt;</g:shipping_weight>'));

    /*
     * NOT ONE RAW METACHARACTER SURVIVES ANYWHERE, which is the claim that matters and the one a per-field
     * assertion cannot make. Every `<` and `>` left in the document belongs to a tag this builder wrote,
     * and every `&` belongs to an entity it wrote — so the counts are taken against the escaped and encoded
     * forms rather than against the stored ones.
     */
    expect(xml).not.toContain(ESCAPE_SENTINEL);
    expect(xml).not.toContain('a&b<c.jpg');
    expect(xml).not.toContain('d&e<f.jpg');
    /* Six escaped-sentinel occurrences: the six textual fields. The URL fields carry the ENCODED form. */
    expect(countOccurrences(xml, ESCAPED_SENTINEL)).toBe(6);
    expect(countOccurrences(xml, encodeURIComponent(ESCAPE_SENTINEL))).toBe(1);
  });

  it('[NET-NEW] CWE-91 escapes the configured host in all five places it is interpolated', async () => {
    /*
     * THE HOST IS THE ONE DYNAMIC VALUE THAT REACHES BOTH CHANNEL-LEVEL FIELDS, so a single bad configured
     * value corrupts the whole document rather than one item. `:L14`, `:L15`, `:L22`, `:L23` and `:L24` all
     * interpolate it with no check.
     *
     * ⚠️ IT IS ESCAPED BUT NOT PERCENT-ENCODED, AND THAT ASYMMETRY IS DELIBERATE. An authority legitimately
     * carries `:` before a port, and `encodeURIComponent` would render that as `%3A` and break every URL in
     * the feed for an ordinary configured value. The escape is what protects it; the encoding is reserved
     * for the PATH portion, which has no such requirement.
     */
    const hostileHost = 'evil&<host>';
    const escapedHost = 'evil&amp;&lt;host&gt;';
    const scenario = createScenario({ host: hostileHost });

    const xml = await scenario.render({
      productImages: [{ imagePath: FIRST_ADDITIONAL_IMAGE_PATH }],
    });

    expect(xml).toContain(channelField(`<link>http://${escapedHost}</link>`));
    expect(xml).toContain(
      channelField(`<description>Google Product Feed for http://${escapedHost}</description>`),
    );
    expect(xml).toContain(itemField(`<link>http://${escapedHost}/`));
    expect(xml).toContain(itemField(`<g:image_link>http://${escapedHost}/`));
    expect(xml).toContain(itemField(`<g:additional_image_link>http://${escapedHost}/`));
    /* Five interpolations, five escaped occurrences, and no raw one anywhere. */
    expect(countOccurrences(xml, escapedHost)).toBe(5);
    expect(xml).not.toContain(hostileHost);
    /* The colon a real authority needs is proved unencoded by the default host-with-port case below. */
  });

  it('[NET-NEW] leaves a host port colon unencoded, which is why the host is escaped and not encoded', async () => {
    /*
     * The complement of the case above, and the reason the two remedies are not applied uniformly: a
     * configured authority carrying a port must survive intact. An implementation that ran the host through
     * `encodeURIComponent` would emit `catalog.example.test%3A8080` and break every URL in the feed.
     */
    const scenario = createScenario({ host: 'catalog.example.test:8080' });

    const xml = await scenario.render();

    expect(xml).toContain(channelField('<link>http://catalog.example.test:8080</link>'));
    expect(xml).toContain(itemField('<link>http://catalog.example.test:8080/'));
    expect(xml).not.toContain('%3A8080');
  });

  it('[NET-NEW] CWE-91 escapes the effective-date offset, which is the only thing gating that sink', async () => {
    /*
     * THE FIELD'S ONE ARBITRARY-TEXT COMPONENT, DRIVEN HOSTILE AND PROVED NEUTRALISED.
     *
     * `g:sale_price_effective_date` assembles eleven parts and ten of them are derived: two dates and two
     * times come from `formatDate`/`formatTimeOfDay` over real instants, and the `T`, `-`, `/` and `-` are
     * literals. The offset is the eleventh, it is the ONLY one that is caller text, and it appears TWICE
     * in the range — so it is this field's injection route, and this case drives a metacharacter through
     * it.
     *
     * ⛔ AN EARLIER REVISION ASSERTED A REFUSAL HERE, on the reading that `readUtcHourOffset` gated the
     * value on `Number.isFinite(Number(text))` before either endpoint was composed and that no string
     * `Number` accepts contains `&`, `<`, `>` or `"`. The reasoning about `Number`'s grammar is correct;
     * the premise is withdrawn. There is no numeric gate, because there is no arithmetic left for one to
     * serve — see the offset case in §5 and `renderEffectiveDateEndpoint`'s own note. Refusing a render on
     * an offset `product.cfm:L30` never tests and never fails on would foreclose a legacy outcome, which
     * is the WITHDRAWN RAW-SINK VALIDATION argument, not something D18 (§0.6.7.7) licenses.
     *
     * SO THE ASSERTION IS THE ONE THAT WAS SAID TO BE UNWRITEABLE. The hostile offset arrives — it is not
     * refused — and the escape is what makes arriving harmless. Each vector below is checked three ways:
     * the escaped range is present in full, the raw metacharacters are absent from the rendered element,
     * and the element still has exactly one text child, which is the direct statement that nothing broke
     * out of it. The last check is why a value like `</g:sale_price_effective_date><g:id>x` could not be
     * smuggled in even though it is not in the vector list: any such value fails the same way.
     */
    /*
     * THE EXPECTED FORMS ARE PINNED AS LITERALS, NOT COMPUTED. Deriving them by running the vectors
     * through a locally-written escaper would make this case agree with any escaper, including a wrong
     * one; every escaping expectation in this file is written out by hand for that reason. The fifth
     * vector is the one worth reading twice: `'5&amp;'` is ALREADY-ESCAPED input, and it must be escaped
     * AGAIN to `5&amp;amp;`, because the builder reads its input as text and has no way to know an
     * ampersand was meant as the start of a reference. An escaper that tried to be clever about that is
     * exactly the ambiguity an attacker supplies `&amp;lt;` to exploit.
     */
    const offsetVectors = [
      { raw: '7<x>&', escaped: '7&lt;x&gt;&amp;' },
      { raw: '&', escaped: '&amp;' },
      { raw: '<7', escaped: '&lt;7' },
      { raw: '7"', escaped: '7&quot;' },
      { raw: '5&amp;', escaped: '5&amp;amp;' },
    ] as const;

    for (const { raw, escaped } of offsetVectors) {
      const scenario = createScenario({
        productPrice: 100,
        skuPrice: 90,
        utcHourOffset: raw,
      });
      scenario.seedSaleDetails({
        [SKU_ID]: buildSalePriceDetails({
          salePrice: 79.5,
          salePriceExpirationDateTime: scenario.saleExpiration,
        }),
      });

      const xml = await scenario.render();

      /*
       * ONE PASS OVER THE JOINED RANGE, which the expectation mirrors: the escaped offset sits after each
       * of the two literal hyphens and the `/` between the endpoints is untouched, because a solidus is
       * not XML-significant and the escaper leaves it alone.
       */
      expect(elementContent(xml, 'g:sale_price_effective_date')).toBe(
        `${EXPECTED_LOCAL_TIMESTAMP_START}-${escaped}/${EXPECTED_LOCAL_TIMESTAMP_END}-${escaped}`,
      );

      /*
       * NOTHING RAW SURVIVED AT EITHER ENDPOINT. The delimiter matters in these two negatives: asserting
       * the absence of `…07-&` alone would FAIL against the correct document, because `…07-&amp;` starts
       * with it. Anchoring on the character that follows the offset — the range's `/` for the first
       * endpoint and the closing tag for the second — is what makes the negatives discriminating for all
       * five vectors including the two that begin with an ampersand.
       */
      expect(xml).not.toContain(`${EXPECTED_LOCAL_TIMESTAMP_START}-${raw}/`);
      expect(xml).not.toContain(
        `${EXPECTED_LOCAL_TIMESTAMP_END}-${raw}</g:sale_price_effective_date>`,
      );

      /*
       * AND THE ELEMENT IS STILL ONE ELEMENT WITH ONE TEXT CHILD, whatever the payload attempted — read
       * back through the reader, which undoes the escape and hands back the operator's own text. That
       * round trip is the property the escape exists for: the value is delivered intact AS DATA, and the
       * `<`, `>` and `"` in it were never markup.
       */
      const item = parseSoleFeedItem(xml);
      expect(childrenNamed(item, 'g:sale_price_effective_date')).toHaveLength(1);
      expect(soleChildText(item, 'g:sale_price_effective_date')).toBe(
        `${EXPECTED_LOCAL_TIMESTAMP_START}-${raw}/${EXPECTED_LOCAL_TIMESTAMP_END}-${raw}`,
      );
    }
  });

  it('[NET-NEW] emits a numeric-looking offset as a bare label, parsing and shifting nothing', async () => {
    /*
     * THE COMPLEMENT OF THE CASE ABOVE, AND THE REASON IT MATTERS THAT NOTHING PARSES THE OFFSET: an
     * offset that LOOKS like a number is still only text. `'0x7'` is the sharpest available example,
     * because `Number('0x7')` is `7` — so every implementation that reads the offset numerically agrees it
     * is seven, and any that shifts by it must move the wall clock seven hours. This one does not move it
     * at all.
     *
     * ⛔ AN EARLIER REVISION ASSERTED `2024-01-01T05:30:45-0x7`, i.e. the parsed seven-hour shift with the
     * caller's own spelling kept in the label. That expectation is withdrawn as REFUTED BY THE LEGACY LINE
     * ITSELF, quoted here because the whole disagreement turns on reading it:
     *
     *     <g:sale_price_effective_date>#dateFormat(now(), "YYYY-MM-DD")#T#timeFormat(now(),
     *     "HH:mm:ss")#-#getTimeZoneInfo().utcHourOffset#/…</g:sale_price_effective_date>
     *
     * `dateFormat` and `timeFormat` each read the components of THEIR OWN argument; neither takes a zone
     * and neither is passed one. The offset is interpolated afterwards, following a LITERAL hyphen, and is
     * never an operand of anything. So `getTimeZoneInfo().utcHourOffset` answers a bare label describing
     * the server's zone, and the components are the value's own local components regardless of it.
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
     * THE SAME TWO TIMESTAMPS EVERY OTHER OFFSET IN THIS FILE PRODUCES, with `0x7` as the label. Reusing
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

  it('[NET-NEW] escapes a money value that reached the exact-decimal brand without satisfying it', async () => {
    /*
     * WHY THIS CASE NEEDS A CAST WHERE NO OTHER CASE IN THIS FILE DOES, AND WHY IT IS WORTH IT.
     *
     * `g:price` and `g:sale_price` carry `ExactDecimal`, a branded STRING whose grammar admits only digits,
     * an optional leading minus and at most one point. For every value minted through `toExactDecimal` the
     * escape is a no-op, so the escape at those two sites cannot be demonstrated by an ordinary sentinel —
     * the type system refuses to construct one.
     *
     * The brand is a COMPILE-TIME claim, though, not a runtime one: an assertion at a hydration boundary, a
     * hand-written double or a future adapter that mints the brand without validating would put arbitrary
     * text at these sites. This case constructs exactly that value, deliberately and in one place, so that
     * the two money sinks are not the only dynamic nodes in the document with no proven defence.
     */
    const scenario = createScenario({ productPrice: 100 });
    scenario.product.price = 'A&B<C' as unknown as ExactDecimal;

    const xml = await scenario.render();

    expect(xml).toContain(itemField('<g:price>A&amp;B&lt;C</g:price>'));
    expect(xml).not.toContain('<g:price>A&B<C');

    /*
     * `g:sale_price` IS THE SAME HELPER OVER THE SAME KIND OF VALUE, and it is deliberately not forged the
     * same way here, because it cannot be reached: the pair is emitted only when
     * `compareExactDecimal(skuPrice, salePrice) === 1`, and that comparison answers `undefined` rather than
     * a silent `false` for an operand outside the grammar — so a forged sale price OMITS the pair instead of
     * rendering it. That omission is its own defence, and it is asserted in §5 rather than duplicated here.
     */
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

  it('[NET-NEW] escapes at exactly fifteen sites, and every unescaped site is fixed text', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));
    const codeText = spanText(source, source.codeSpans);

    /*
     * WHY A SOURCE-LEVEL CENSUS IS REQUIRED HERE, AND WHAT IT PROVES THAT A RENDERED-OUTPUT ASSERTION
     * CANNOT.
     *
     * Two of the sixteen fields — `g:price` and `g:sale_price` — carry a branded decimal whose grammar
     * admits no XML metacharacter, so no ordinary sentinel can travel through them; §8 reaches one of them
     * only by deliberately forging a value past the brand, and the other is unreachable by construction.
     * A rendered document therefore cannot demonstrate, on its own, that those sinks are escaped.
     *
     * More importantly, an output assertion can only prove that the fields it happens to exercise are safe.
     * THIS CASE PROVES THE COMPLEMENT: that there is no dynamic sink anywhere in the builder's executable
     * text which skips the escape. It does that by requiring every unescaped `openTag`…`closeTag` region to
     * be one of the three fields whose content is a FIXED LITERAL, plus the one channel-level constant.
     * A future field added without an escape fails this case even if no other case mentions it.
     *
     * Both helper names are DISCOVERED from the source rather than assumed, so renaming either does not
     * silently reduce this case to a tautology.
     */
    const escapeDeclaration = /function\s+(escape[A-Za-z0-9_]*)\s*\(/.exec(codeText);
    expect(escapeDeclaration).not.toBeNull();
    const escapeHelper = escapeDeclaration === null ? '' : (escapeDeclaration[1] ?? '');
    expect(escapeHelper.length).toBeGreaterThan(0);

    const encodeDeclaration = /function\s+(encode[A-Za-z0-9_]*)\s*\(/.exec(codeText);
    expect(encodeDeclaration).not.toBeNull();
    const encodeHelper = encodeDeclaration === null ? '' : (encodeDeclaration[1] ?? '');
    expect(encodeHelper.length).toBeGreaterThan(0);

    /* Every occurrence in executable text, less the declaration itself, is a call site. */
    expect(codeOffsetsOf(source, `${escapeHelper}(`).length - 1).toBe(15);
    expect(codeOffsetsOf(source, `${encodeHelper}(`).length - 1).toBe(3);

    /*
     * THE FULL SIXTEEN-FIELD CENSUS, escapes and encodings side by side.
     *
     * `title` shows one escaped site and one raw site because the channel-level title at `:L13` is the
     * literal `Slatwall Product Feed` while the item-level title at `:L18` is the product's. `description`
     * and `link`, by contrast, show TWO escaped sites each: their channel-level values interpolate the
     * configured host, which is dynamic, and `:L15` and `:L14` emitting them raw is precisely the CWE-91
     * exposure this revision closes.
     *
     * `link` shows one ENCODED site of its two, because only the item-level URL carries a data-derived
     * path; the channel-level one is the bare `http://<host>` prefix with no path at all.
     *
     * ⛔ AN EARLIER REVISION PINNED THIS TABLE AT SIX ESCAPED AND TEN RAW to match `product.cfm` field for
     * field. That split was the vulnerability, not the contract — see §8 — and the table is now the record
     * of the second declared hardening exception rather than of the legacy's asymmetry.
     */
    const expectedCensus: readonly {
      readonly openTag: string;
      readonly closeTag: string;
      readonly escaped: number;
      readonly raw: number;
      readonly encoded: number;
    }[] = [
      { openTag: '<g:id>', closeTag: '</g:id>', escaped: 1, raw: 0, encoded: 0 },
      { openTag: '<title>', closeTag: '</title>', escaped: 1, raw: 1, encoded: 0 },
      { openTag: '<description>', closeTag: '</description>', escaped: 2, raw: 0, encoded: 0 },
      {
        openTag: '<g:google_product_category>',
        closeTag: '</g:google_product_category>',
        escaped: 0,
        raw: 1,
        encoded: 0,
      },
      {
        openTag: '<g:product_type>',
        closeTag: '</g:product_type>',
        escaped: 1,
        raw: 0,
        encoded: 0,
      },
      { openTag: '<link>', closeTag: '</link>', escaped: 2, raw: 0, encoded: 1 },
      { openTag: '<g:image_link>', closeTag: '</g:image_link>', escaped: 1, raw: 0, encoded: 1 },
      {
        openTag: '<g:additional_image_link>',
        closeTag: '</g:additional_image_link>',
        escaped: 1,
        raw: 0,
        encoded: 1,
      },
      { openTag: '<g:condition>', closeTag: '</g:condition>', escaped: 0, raw: 1, encoded: 0 },
      {
        openTag: '<g:availability>',
        closeTag: '</g:availability>',
        escaped: 0,
        raw: 1,
        encoded: 0,
      },
      { openTag: '<g:price>', closeTag: '</g:price>', escaped: 1, raw: 0, encoded: 0 },
      { openTag: '<g:sale_price>', closeTag: '</g:sale_price>', escaped: 1, raw: 0, encoded: 0 },
      {
        openTag: '<g:sale_price_effective_date>',
        closeTag: '</g:sale_price_effective_date>',
        escaped: 1,
        raw: 0,
        encoded: 0,
      },
      { openTag: '<g:brand>', closeTag: '</g:brand>', escaped: 1, raw: 0, encoded: 0 },
      {
        openTag: '<g:item_group_id>',
        closeTag: '</g:item_group_id>',
        escaped: 1,
        raw: 0,
        encoded: 0,
      },
      {
        openTag: '<g:shipping_weight>',
        closeTag: '</g:shipping_weight>',
        escaped: 1,
        raw: 0,
        encoded: 0,
      },
    ];

    let escapedSites = 0;
    let encodedSites = 0;
    let unescapedSites = 0;
    for (const entry of expectedCensus) {
      const escapes = escapeCensus(source, entry.openTag, entry.closeTag, escapeHelper);
      expect(escapes).toStrictEqual({ escaped: entry.escaped, raw: entry.raw });
      const encodings = escapeCensus(source, entry.openTag, entry.closeTag, encodeHelper);
      expect(encodings.escaped).toBe(entry.encoded);
      escapedSites += escapes.escaped;
      encodedSites += encodings.escaped;
      unescapedSites += escapes.raw;
    }

    /*
     * The fifteen field-level escaped sites account for every one of the fifteen calls counted above, so
     * the helper is not invoked anywhere except at a field, and no field escapes twice.
     */
    expect(escapedSites).toBe(15);
    expect(encodedSites).toBe(3);

    /*
     * ⭐ AND THE FOUR UNESCAPED SITES ARE ACCOUNTED FOR INDIVIDUALLY: the channel title, and the three
     * fields whose entire content is a literal in this file. None of them interpolates a value, so there is
     * nothing at any of them for an escape to act on.
     */
    expect(unescapedSites).toBe(4);
    expect(codeText).toContain('<g:google_product_category></g:google_product_category>');
    expect(codeText).toContain('<g:condition>${CONDITION_VALUE}</g:condition>');
    expect(codeText).toContain('<g:availability>${AVAILABILITY_VALUE}</g:availability>');
    expect(codeText).toContain('<title>${CHANNEL_TITLE}</title>');

    /*
     * And the three interpolated names above are MODULE CONSTANTS initialised from string literals — not
     * parameters, port reads or field accesses. That is the property which makes leaving them unescaped
     * correct, so it is asserted rather than assumed. Their VALUES are pinned by the rendered-output cases
     * in §1 and §2; this case only establishes that nothing dynamic reaches these four sites.
     */
    for (const constantName of ['CONDITION_VALUE', 'AVAILABILITY_VALUE', 'CHANNEL_TITLE']) {
      expect(codeText).toMatch(new RegExp(`const ${constantName} = '[^']*';`));
    }
  });
});

/* ⛔ THREE CASES THAT STOOD IN THIS SECTION ARE WITHDRAWN, AND ONE WAS A DUPLICATE.
 *   - `DEPLOYABLE DEFAULT — escapes EVERY dynamic value, not the legacy six (SEC-02)` asserted, field
 *     for field, exactly what the FIRST case above asserts: the same fifteen containments, the same
 *     three raw-path absences, the same `countOccurrences(xml, ESCAPED_SENTINEL)` of 6 and the same
 *     single percent-encoded occurrence. Two independent reviews reached the same test from different
 *     directions; one copy is kept, under the title that describes the property rather than the mode.
 *   - `the two renderings differ ONLY in the nine formerly-raw sinks, and otherwise agree` and
 *     `the representability refusal covers a RAW sink too, in both renderings (DECISION G-4)` both
 *     required a SECOND rendering to compare against, and a refusal gate to observe. Neither exists:
 *     the byte-parity rendering was withdrawn because its unsafe half was a reachable code path, and
 *     the XML 1.0 `Char` refusal was withdrawn because it REFUSED values the legacy renders. With one
 *     total, refusing-nothing escaper there is no divergence left for either case to measure. */

/* =====================================================================================================
 * §8b — Well-formedness under hostile input, read through the parser.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — review finding F1.
 *
 * §8 proves the escaping is applied at every sink. This section proves the property that MATTERS to a
 * consumer, which is a different claim: that no value reaching the builder can change the document's
 * SHAPE. A substring assertion cannot express that. "The document contains one channel with one item
 * whose link is exactly this" can only be said by parsing, so these cases parse.
 *
 * The first group is a self-test of the reader itself. A parser that silently recovers from malformation
 * would make every case below pass vacuously, so the reader's refusals are pinned before it is trusted.
 * ================================================================================================== */

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
    /* This is the exact malformation an unescaped `<lb>` unit code produced before review finding F1. */
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
  /*
   * A host that CONFORMS to RFC 3986 §3.2.2 and still carries XML metacharacters. `reg-name` admits the
   * sub-delimiters, so `&` and `'` are legal in a registered name and `src/config/env.ts`'s host rule
   * accepts them by design — which is exactly why the serializer, not the config layer, has to own the
   * encoding. This value is not a hypothetical: it passes the module-load rule and reaches the builder.
   */
  const CONFORMING_HOSTILE_HOST = "a&b'c.example";

  it('[NET-NEW] escapes a conforming host carrying sub-delimiters in the channel link and description', async () => {
    const scenario = createScenario({ host: CONFORMING_HOSTILE_HOST });

    const xml = await scenario.render();
    const channel = parseFeedChannel(xml);

    /* The channel pair round-trips to the composed value, ampersand and apostrophe intact. */
    expect(soleChildText(channel, 'link')).toBe(`http://${CONFORMING_HOSTILE_HOST}`);
    expect(soleChildText(channel, 'description')).toBe(
      `Google Product Feed for http://${CONFORMING_HOSTILE_HOST}`,
    );
    /* On the wire the ampersand is encoded; the apostrophe is not, matching `htmlEditFormat`. */
    expect(xml).toContain(channelField("<link>http://a&amp;b'c.example</link>"));
    expect(xml).not.toContain("<link>http://a&b'c.example</link>");
  });

  it('[NET-NEW] escapes the same host everywhere it is composed into an item URL', async () => {
    const scenario = createScenario({
      host: CONFORMING_HOSTILE_HOST,
      urlTitle: 'nike-air',
      imagePathsByImageFile: { [SKU_IMAGE_FILE]: '/product/default/a.jpg' },
    });

    const xml = await scenario.render({ productImages: [{ imagePath: '/product/default/b.jpg' }] });
    const item = parseSoleFeedItem(xml);
    const prefix = `http://${CONFORMING_HOSTILE_HOST}`;

    expect(soleChildText(item, 'link')).toBe(
      `${prefix}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/`,
    );
    expect(soleChildText(item, 'g:image_link')).toBe(`${prefix}/product/default/a.jpg`);
    expect(soleChildText(item, 'g:additional_image_link')).toBe(`${prefix}/product/default/b.jpg`);
    /*
     * FIVE places compose the host — the channel link, the channel description, the item link,
     * `g:image_link` and the one `g:additional_image_link` — and every one is encoded. The count is
     * measured rather than reasoned: a first draft of this assertion said four, having forgotten that the
     * channel description interpolates the host as well as the channel link.
     */
    expect(countOccurrences(xml, "a&amp;b'c.example")).toBe(5);
    expect(countOccurrences(xml, "//a&b'c.example")).toBe(0);
  });

  it('[NET-NEW] REFUSES an origin-moving host outright rather than escaping it into the document', async () => {
    /*
     * This value does NOT conform to RFC 3986 and `src/config/env.ts`'s `GOOGLE_FEED_HOST` rule refuses it
     * at module load, so it cannot arrive through configuration. It is exercised here anyway because
     * `ProductFeedRenderContext.host` is a plain `string` with no brand, so any future caller could supply
     * it — and the serializer's own guarantee must not depend on the config layer having run.
     *
     * ⭐ AND THE SERIALIZER'S GUARANTEE IS NOW STRONGER THAN THE ONE THIS CASE ORIGINALLY ASSERTED. It
     * used to require only that the hostile host arrive as escaped character DATA, so the document stayed
     * well-formed with `http://x</title>…` sitting inside `<link>` as text. Well-formed is not the whole
     * requirement for a host: every link in the feed is composed from it, so a host carrying `/`, `@`, `?`
     * or `#` MOVES THE ORIGIN of every URL in the document while remaining perfectly well-formed XML.
     * Escaping cannot answer that, because the harm is in the value rather than in the markup.
     * `validateFeedHostAuthority` therefore refuses it at the sink and no document is produced at all.
     *
     * ⚠️ WHY A REFUSAL IS LICENSED HERE WHEN IT WAS DECLINED FOR THE XML-REPRESENTABILITY GATE. The host is
     * ONE operator-configured value shared by the whole document, so refusing it fails a misconfigured
     * deployment fast and uniformly. An unrepresentable code point, by contrast, arrives in ONE record's
     * catalogue text, and refusing there would take the whole feed from rendered-but-imperfect to not
     * rendered — which is the outcome-removing divergence D18's precedent does not license. Same test file,
     * opposite decisions, and the difference is the blast radius rather than the severity.
     *
     * ⚠️ THIS IS NOT A DUPLICATE OF THE CONFIG-LAYER RULE. `env.ts` transcribes the RFC 3986 `host`
     * grammar as a POSITIVE check at module load; this is a DENY set at the point of use. The two are
     * concordant rather than one control repeated: the two cases above prove a host carrying `&` and `'`
     * — which is grammar-conforming and not origin-moving — still renders and is escaped five times.
     */
    const scenario = createScenario({ host: 'x</title></channel><channel><title>injected' });

    await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);

    /* The FIRST offending character is what is reported, and it is the `/` at index 2 — not the `<` at
     * index 1, which is a metacharacter the escaper handles and which this gate deliberately permits. */
    await expect(scenario.render()).rejects.toMatchObject({
      context: { offendingIndex: 2, offendingCodePoint: 'U+002F' },
    });
  });

  it('[NET-NEW] keeps one item per SKU when every seeded text field is hostile', async () => {
    const scenario = createScenario({
      host: CONFORMING_HOSTILE_HOST,
      skuCode: '</item><item><g:id>a',
      calculatedTitle: '</title><g:id>b',
      productDescription: ']]></description><g:id>c',
      productTypeName: '<g:id>d</g:id>',
      brandName: '"><g:id>e',
      productCode: '&\'<>"',
      urlTitle: '../../etc/passwd?a=1&b=2',
      settings: [
        { settingName: 'skuShippingWeight', value: '</g:shipping_weight><g:id>f' },
        { settingName: 'skuShippingWeightUnitCode', value: '&&&' },
      ],
    });

    const xml = await scenario.render();
    const channel = parseFeedChannel(xml);
    const item = parseSoleFeedItem(xml);

    /* Exactly one item, and exactly one g:id inside it, no matter how many the payloads tried to open. */
    expect(childrenNamed(channel, 'item')).toHaveLength(1);
    expect(childrenNamed(item, 'g:id')).toHaveLength(1);
    expect(soleChildText(item, 'g:id')).toBe('</item><item><g:id>a');
    expect(soleChildText(item, 'title')).toBe('</title><g:id>b');
    expect(soleChildText(item, 'description')).toBe(']]></description><g:id>c');
    expect(soleChildText(item, 'g:product_type')).toBe('<g:id>d</g:id>');
    expect(soleChildText(item, 'g:brand')).toBe('"><g:id>e');
    expect(soleChildText(item, 'g:item_group_id')).toBe('&\'<>"');
    /*
     * ⚠️ THE ONE FIELD IN THIS CASE WHOSE TEXT IS NOT THE SEEDED TEXT, AND WHY.
     *
     * Every other assertion above reads its seeded value back byte-identical, because XML escaping is
     * reversible and the reader undoes it. `<link>` is different: the path is percent-encoded per segment
     * by `encodeFeedUrlPath` BEFORE the XML escape, so the reader can only undo the outer pass and the
     * inner one is visible in the decoded text. That is the intended shape, not drift — the two remedies
     * answer different attacks and the URL-grammar one has to survive an XML round trip to be worth
     * anything.
     *
     * SEGMENT-WISE, so the expectation is derivable rather than pasted: the value splits on `/` into
     * `..`, `..`, `etc` and `passwd?a=1&b=2`. The first three are already inside
     * `encodeURIComponent`'s unreserved set and come back unchanged — `.` is unreserved. In the fourth,
     * `?`, `=` and `&` are all reserved, so they become `%3F`, `%3D` and `%26`. The separators are
     * re-joined untouched, including the trailing one that
     * `model/entity/Product.cfc:L207-L209`'s `/…/#getURLTitle()#/` produces.
     */
    expect(soleChildText(item, 'link')).toBe(
      `http://${CONFORMING_HOSTILE_HOST}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/../../etc/passwd%3Fa%3D1%26b%3D2/`,
    );
    expect(soleChildText(item, 'g:shipping_weight')).toBe('</g:shipping_weight><g:id>f &&&');

    /*
     * ⚠️ THE PATH IS STILL NOT VALIDATED, AND THAT IS DELIBERATE (AAP §0.8.2 guideline 4).
     *
     * READ THE ENCODING ABOVE FOR WHAT IT IS AND NOT FOR WHAT IT LOOKS LIKE. The two `..` segments
     * traverse exactly as far after encoding as before it, because a traversal segment contains nothing
     * reserved to encode — so `%3F` in the same string must not be mistaken for the traversal having been
     * closed. It has not been. DECISION G-2's withdrawn path grammar stays withdrawn: no published
     * production governs a Slatwall product URL, so inventing one would be the enhancement guideline 4
     * forbids.
     *
     * What IS closed is the element breakout — the value cannot leave its own `<link>` — and, separately,
     * the URL-grammar breakout, since a stored `?`, `#` or `@` can no longer end the path and start a
     * query, fragment or authority. Three defects, then, not two: markup injection (closed here), URL
     * injection (closed by the encoding) and unvalidated traversal (open, deliberately, and not this
     * file's to fix).
     */
    expect(childrenNamed(item, 'link')).toHaveLength(1);
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
 * ⚠️ THE ERROR **TYPE** IS ASSERTED; THE MESSAGE **TEXT** IS NOT. An earlier revision of this header
 * claimed the file "neither imports nor couples to" `src/errors/**` and asserted only `Error`, and the
 * distinction it was reaching for is right — the wording of a message belongs to the module that owns it,
 * and pinning it here would couple a serializer test to a sibling's copy. But `Error` is too weak to be
 * the whole assertion, for a reason specific to these two guards: they raise DIFFERENT classes on
 * purpose. A missing product is a `DomainError` (a defect in what was selected), a missing product type is
 * a `DataIntegrityError` (a broken row), and the builder's own docblock calls that choice out. Under
 * `toBeInstanceOf(Error)` the two are indistinguishable, so a revision that collapsed them — or a
 * `TypeError` from an unguarded dereference in the harness — would satisfy the assertion while destroying
 * the distinction.
 *
 * `DataIntegrityError extends DomainError`, so the subclass case additionally asserts the DIRECTION of the
 * relationship: the product-type failure must be the subclass, and the product failure must NOT be. The
 * structured `context` is asserted for its LOCATOR only — the legacy line each guard reproduces — because
 * that is the field this suite's parity claims rest on, and it is stable in a way a sentence is not.
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
    expect(error).toBeInstanceOf(DomainError);
    /* NOT the data-integrity subclass: a SKU with no product is a selection defect, not a broken row. */
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
     * THE OTHER FACE OF THE `isNull` / `len` INCONSISTENCY. `:L21` dereferences
     * `product.getProductType().getSimpleRepresentation()` with NO guard, while `:L32` guards the brand
     * association with `isNull`. Two associations one line apart, one guarded and one not: an absent brand
     * quietly drops an element, an absent product type fails the render outright. Both outcomes are
     * preserved, and neither is harmonised into the other.
     */
    expect(error).toBeInstanceOf(DataIntegrityError);
    expect(error.message.length).toBeGreaterThan(0);
    /*
     * THE LOCATOR IS `:L19`, NOT `:L21`, AND THE DIFFERENCE IS EVIDENCE RATHER THAN BOOKKEEPING. `:L21`'s
     * `<g:product_type>` is the dereference this case's own docblock quotes, and it was the first guess
     * here — it is wrong, because `:L19`'s `<description>` reaches the association FIRST. Its `cfelseif`
     * tests `len(local.sku.getProduct().getProductType().getProductTypeDescription())`, so a product with
     * no description of its own dereferences the product type one field earlier than `<g:product_type>`
     * does. The builder reproduces that ordering, passes each call site its own locator, and this
     * assertion pins which of the two fires — so a reordering of the item fields that moved the first
     * unguarded dereference would fail here rather than pass silently.
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
     * ⛔ THE RENDER SUCCEEDS, AND AN EARLIER REVISION OF THIS CASE REQUIRED IT TO FAIL. The builder then
     * read the offset as a number of hours, shifted both instants by it and raised when the text was not
     * finite. `:L30` does none of that: it formats each value's own components and interpolates the
     * offset text straight in, with no parse, no test and no failure mode. So a non-numeric offset is a
     * malformed LABEL on a well-formed timestamp — which is exactly what the legacy would have emitted —
     * and refusing to render it would foreclose a legacy outcome (AAP §0.8.2 guideline 4, §0.6.7
     * preserve-and-annotate; D18 licenses no such hardening).
     *
     * The components are therefore the supplied ones, untouched, and the odd text appears verbatim.
     */
    expect(elementContent(onSaleXml, 'g:sale_price_effective_date')).toBe(
      `${EXPECTED_LOCAL_TIMESTAMP_START}-not-an-offset/${EXPECTED_LOCAL_TIMESTAMP_END}-not-an-offset`,
    );
    /* Twice per range, exactly as `:L30` interpolates it — and never escaped, since `:L30` escapes it not. */
    expect(countOccurrences(onSaleXml, 'not-an-offset')).toBe(2);
  });

  it('[NET-NEW] renders an empty date and time for an absent expiration while keeping the T, hyphen and offset', async () => {
    const scenario = createScenario({ productPrice: 100, skuPrice: 90 });
    /*
     * `model/entity/Sku.cfc:L560-L565` returns the EMPTY STRING when the sale-price detail carries no
     * expiration key, and `:L30` feeds that straight into `dateFormat`/`timeFormat`. A lenient CFML engine
     * renders nothing for both, leaving the `T`, the literal hyphen and the offset in place — the branch
     * the builder reproduces, with the engine disagreement carried as a TODO(parity) rather than resolved.
     * No date is invented and the render instant is NOT substituted for the missing expiration, which is
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

  it('[NET-NEW] emits a value XML 1.0 forbids rather than refusing the render', async () => {
    /*
     * THE COUNTERPART OF THE ESCAPING, AND THE ONE EXPOSURE THIS PORT CARRIES RATHER THAN CLOSES.
     *
     * An earlier revision scanned every value against XML 1.0's `Char` production and REJECTED a render
     * carrying a lone surrogate or a C0 control other than tab, line feed or carriage return. That gate is
     * withdrawn: `htmlEditFormat` classifies nothing, `integrationServices/google/views/feed/product.cfm`
     * completes the render whatever a column contains, and refusing to publish a document the legacy
     * published is a NEW OBSERVABLE OUTCOME rather than a preserved one.
     *
     * WHY THIS IS NOT IN TENSION WITH THE ESCAPING ASSERTED ABOVE. An XML-significant character HAS an
     * escaped spelling, so it is encoded and stays data. A code point XML 1.0 forbids has NO spelling in
     * any conforming document, so the only available responses are refusing the render or altering the
     * stored value — and both are divergences larger than the one being avoided. The residual exposure is
     * therefore carried and annotated (S8) rather than closed here.
     *
     * The case is asserted POSITIVELY — the render resolves and the character survives — so that
     * reinstating the gate breaks this test rather than passing silently.
     */
    const forbiddenTitles = ['Nike \ud800 Air', 'Nike \udc00 Air', 'Nike \u0001 Air'];

    for (const calculatedTitle of forbiddenTitles) {
      const scenario = createScenario({ calculatedTitle });

      const xml = await scenario.render();

      expect(xml).toContain(itemField(`<title>${calculatedTitle}</title>`));
    }
  });

  it('[NET-NEW] emits a legal supplementary character unchanged', async () => {
    /*
     * A supplementary character is encoded as a surrogate PAIR and is perfectly legal in XML 1.0, so the
     * escaper must leave it alone: it carries none of the four characters `htmlEditFormat` substitutes.
     * The case is kept from the era of the withdrawn representability gate, where it proved the gate paired
     * surrogates rather than walking code units; it is still worth asserting, because an escaper
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
     * references would change stored product copy on its way out, which is the difference between ENCODING
     * a character that has an escaped form and REWRITING one that does not need it.
     */
    const scenario = createScenario({ productDescription: 'first\tsecond\r\nthird' });

    const xml = await scenario.render();

    expect(xml).toContain('<description>first\tsecond\r\nthird</description>');
    expect(xml).not.toContain('&#9;');
    expect(xml).not.toContain('&#10;');
    expect(xml).not.toContain('&#13;');
  });
});

/* =====================================================================================================
 * §10 — Parsing the finished document, with hostile values in every dynamic sink.
 *
 * THIS IS THE SECTION §8's ITEM-LINK CASE FORWARDS TO, and it is the only place in this file that reads the
 * rendered feed as XML rather than as text. Every other case asserts a SUBSTRING, which is exactly the kind
 * of assertion that cannot distinguish "this value was escaped" from "this value happened not to contain a
 * metacharacter on this input". A parser can: it either accepts the document or it does not, and it either
 * hands the hostile datum back as CHARACTER DATA or it hands back an element that the attacker named.
 *
 * WHY THE SCANNER IS HAND-WRITTEN RATHER THAN INSTALLED. AAP §0.5.2 admits exactly ONE runtime dependency,
 * `mysql2`, and the lockfile is committed so that resolution is reproducible; adding an XML library — even
 * as a dev dependency — would put a parser's correctness between this suite and its subject, and would have
 * to be justified against a manifest the plan froze. A scanner is a few dozen lines, so it is written here.
 *
 * WHAT IT ACCEPTS. The XML declaration, elements with quoted attributes, nested elements, character data,
 * the five predefined entity references and numeric character references. Nothing else: a comment, a CDATA
 * section, a DOCTYPE or a processing instruction is REFUSED rather than skipped. That is stricter than XML
 * 1.0, and deliberately so — this builder emits none of them, so any occurrence in its output arrived from
 * a value, which is precisely the failure being tested for. A raw `>` in character data IS accepted,
 * because XML 1.0 permits it outside `]]>`; the scanner is not made wrong in order to be strict.
 *
 * ⭐ AND IT IS PROVED TO BE ABLE TO FAIL. A scanner that accepted everything would turn this whole section
 * into theatre, so the last case feeds it the same document with the four substitutions REVERSED — the
 * output the pre-fix builder produced — and requires a refusal.
 * ================================================================================================== */

/** A parsed element: its qualified name, its attributes, its element children and its own resolved text. */
interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** This element's character data with every reference resolved, excluding its children's. */
  readonly text: string;
}

/** Refused input. A distinct type so a case can require a scanner refusal rather than any old `Error`. */
class XmlScanError extends Error {}

/**
 * Scan `source` as a whole document and answer its root element.
 *
 * @param source the complete rendered feed
 * @returns the root element, with references resolved
 * @throws {XmlScanError} for anything outside the accepted subset described in this section's header
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

  /** Resolve one reference, starting at the `&`. Every ampersand in a conforming document begins one. */
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

/*
 * ONE HOSTILE VALUE, CARRYING EVERY SHAPE THAT MATTERS, used in every text sink at once.
 *
 *   `</title>`      closes whichever element it lands in, which is how a text sink becomes a markup sink
 *   `<injected>`    the element an attacker actually wants, and the thing this section proves absent
 *   ` & `           a bare ampersand, which is not a reference and makes a document non-well-formed
 *   `&amp;`         an ALREADY-ESCAPED sequence, which must be escaped AGAIN and come back unchanged
 *   `<!-- c -->`    a comment, refused outright by the scanner if it ever reaches markup
 *   `"q" 'a'`       both quote characters, one of which `htmlEditFormat` escapes and one of which it does not
 *   `]]>`           refused in character data by XML 1.0, so its `>` must be escaped
 */
const HOSTILE_TEXT = '</title><injected>pwned</injected> & &amp; <!-- c --> "q" \'a\' ]]>';

/** A host with three of the four escapable characters, and no colon, so the authority stays interpretable. */
const HOSTILE_HOST = 'h&<>st';

/**
 * Percent-encode a path the way `encodeFeedUrlPath` does: split on the separator, encode each segment,
 * rejoin.
 *
 * ⚠️ THE SEPARATOR IS DELIBERATELY PRESERVED, WHICH IS WHY `encodeURIComponent` ALONE IS THE WRONG
 * EXPECTATION. The builder receives an ALREADY-COMPOSED path — `getProductURL` answers the whole
 * `/<globalURLKeyProduct>/<urlTitle>/` — so it cannot tell which slashes are structure and which arrived
 * inside a value. Encoding every slash would break the leading and trailing slashes that `product.cfm:L22`
 * emits and that §2 pins; preserving them is the only sound choice at that boundary.
 *
 * WHAT THAT LEAVES, STATED PLAINLY RATHER THAN GLOSSED. A value carrying `/` can add PATH SEGMENTS, and a
 * segment of `..` survives because `.` is unreserved — so a stored value could in principle produce a URL
 * that a consumer's resolver normalises to a different page. It CANNOT change the authority, because the
 * path always begins with a literal `/` from the setting before any data is reached, and it cannot open a
 * query or a fragment, because `?` and `#` are both outside the unreserved set and are encoded. That
 * residual is carried rather than closed: `src/util/urlTitle.ts` is the write path for `urlTitle` and emits
 * slug-safe text, the review's F6 is scoped to CWE-91 rather than to URL resolution, and normalising a
 * stored path would be a further divergence beyond the one this revision is authorised to make.
 */
function encodePathLikeTheBuilder(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

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
    /* The always-empty category element parses as a present element with no content, not as absent. */
    expect(soleElement(root, 'g:google_product_category').text).toBe('');
  });

  it('[NET-NEW] CWE-91 keeps a hostile value in every sink as character data, injecting no element', async () => {
    const hostileImagePath = `/product/default/${HOSTILE_TEXT}`;
    const hostileAdditionalPath = `/product/default/extra${HOSTILE_TEXT}`;
    const scenario = createScenario({
      host: HOSTILE_HOST,
      skuCode: HOSTILE_TEXT,
      calculatedTitle: HOSTILE_TEXT,
      productDescription: HOSTILE_TEXT,
      productTypeName: HOSTILE_TEXT,
      brandName: HOSTILE_TEXT,
      productCode: HOSTILE_TEXT,
      urlTitle: HOSTILE_TEXT,
      productPrice: 100,
      imagePathsByImageFile: { [SKU_IMAGE_FILE]: hostileImagePath },
      settings: [
        { settingName: 'skuShippingWeight', value: HOSTILE_TEXT },
        { settingName: 'skuShippingWeightUnitCode', value: HOSTILE_TEXT },
      ],
    });

    const xml = await scenario.render({ productImages: [{ imagePath: hostileAdditionalPath }] });

    /* First: the document is well-formed at all. Everything below depends on this not having thrown. */
    const root = parseXmlDocument(xml);

    /*
     * ⭐ THE CLAIM THE REVIEW ASKED FOR, STATED TWO WAYS.
     *
     * Negatively: the element the value tried to open does not exist anywhere in the parsed tree, and the
     * document's structure is exactly the structure of a one-item feed.
     */
    expect(findElements(root, 'injected')).toHaveLength(0);
    expect(findElements(root, 'channel')).toHaveLength(1);
    expect(findElements(root, 'item')).toHaveLength(1);
    expect(findElements(root, 'title')).toHaveLength(2);

    /*
     * Positively: every sink hands the ORIGINAL BYTES back. This is the round trip — escaped on the way out,
     * resolved by the parser on the way in — and it is a stronger statement than "no markup appeared",
     * because it also rules out an implementation that sanitised the value by dropping characters from it.
     */
    expect(soleElement(root, 'g:id').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:product_type').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:brand').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:item_group_id').text).toBe(HOSTILE_TEXT);

    /*
     * `title`, `link` and `description` each occur TWICE in a one-item feed — once at channel level and once
     * at item level — so they are reached through their PARENT rather than by name across the whole tree.
     * Doing that is the point rather than a mechanical necessity: it asserts the two levels are still
     * distinct elements after a value tried to close one of them, which a whole-tree lookup could not show.
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
    expect(channelLink?.text).toBe(`http://${HOSTILE_HOST}`);
    expect(channelDescription?.text).toBe(`Google Product Feed for http://${HOSTILE_HOST}`);

    expect(soleElement(item, 'title').text).toBe(HOSTILE_TEXT);
    expect(soleElement(item, 'description').text).toBe(HOSTILE_TEXT);

    /* The two shipping-weight settings, joined by the single separator space, both resolved back intact. */
    expect(soleElement(root, 'g:shipping_weight').text).toBe(`${HOSTILE_TEXT} ${HOSTILE_TEXT}`);

    /*
     * THE THREE URL FIELDS COME BACK PERCENT-ENCODED RATHER THAN VERBATIM, which is the encode-then-escape
     * order made visible: the escape is reversed by the parser, the ENCODING is not, so what a consumer
     * receives is a URL whose data-derived path cannot be read as an authority, a query or a fragment. The
     * host is escaped but NOT encoded, so it returns verbatim — see §8 for why that asymmetry is required.
     */
    const encodedHostileText = encodePathLikeTheBuilder(HOSTILE_TEXT);
    expect(soleElement(root, 'g:image_link').text).toBe(
      `http://${HOSTILE_HOST}/product/default/${encodedHostileText}`,
    );
    expect(soleElement(root, 'g:additional_image_link').text).toBe(
      `http://${HOSTILE_HOST}/product/default/extra${encodedHostileText}`,
    );
    expect(soleElement(item, 'link').text).toBe(
      `http://${HOSTILE_HOST}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${encodedHostileText}/`,
    );

    /*
     * AND THE ENCODED FORM IS CHECKED AGAINST PROPERTIES, not only against a re-implementation of the
     * algorithm. `encodePathLikeTheBuilder` mirrors the builder, so on its own it could agree with a broken
     * encoder; these four assertions are stated independently of it and are readable by eye.
     */
    for (const encodedField of ['g:image_link', 'g:additional_image_link'] as const) {
      const url = soleElement(root, encodedField).text;
      const authority = `http://${HOSTILE_HOST}`;
      expect(url.startsWith(authority)).toBe(true);
      const path = url.slice(authority.length);
      /* Nothing that could restructure the URL survives in the path: no query and no fragment. */
      expect(path).not.toMatch(/[?#]/);
      /* Nor anything that could restructure the document, which is the escape's job at the other sinks. */
      expect(path).not.toMatch(/[<>&"]/);
      /* The separators DO survive, which is the property `encodePathLikeTheBuilder` documents. */
      expect(path.startsWith('/product/default/')).toBe(true);
    }

    /*
     * ⚠️ THE HOST'S OWN `<` AND `>` DO COME BACK IN THE RESOLVED TEXT ABOVE, and that is correct rather than
     * a leak: the parser resolved them from `&lt;` and `&gt;`, which is proof they were ESCAPED in the
     * document. The raw spelling never appears in the serialized bytes, and that is the assertion that
     * matters — a resolved character is data, a serialized one is markup.
     */
    expect(xml).toContain(`http://h&amp;&lt;&gt;st`);
    expect(xml).not.toContain(HOSTILE_HOST);

    /*
     * And the value really did travel — it is present in the raw text in its ESCAPED spelling, so none of
     * the assertions above passed because the datum was silently dropped. The double escape of the
     * already-escaped `&amp;` is visible here as `&amp;amp;`.
     */
    expect(xml).toContain('&lt;injected&gt;');
    expect(xml).toContain('&amp;amp;');
    expect(xml).not.toContain('<injected>');
  });

  it('[NET-NEW] refuses the same document with the escapes reversed, proving the scanner can fail', async () => {
    /*
     * THE NEGATIVE CONTROL, AND THE CLOSEST THING TO A DIRECT MEASUREMENT OF WHAT F6 FIXED.
     *
     * Reversing the four substitutions reconstructs what the PRE-FIX builder emitted for these inputs: the
     * nine sinks it left raw would have written this text. The reversal is applied in the opposite order to
     * the escape — `&amp;` LAST — so that an `&amp;amp;` collapses to `&amp;` rather than to a bare `&`,
     * exactly as a single un-escaping pass over the old output would have.
     *
     * The scanner must refuse it. If it did not, every acceptance above would be worthless.
     */
    const scenario = createScenario({
      host: HOSTILE_HOST,
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

    /* The reversal genuinely reintroduced the markup, so the refusal below is about that and nothing else. */
    expect(unescaped).toContain('<injected>');

    expect(() => parseXmlDocument(escaped)).not.toThrow();
    expect(() => parseXmlDocument(unescaped)).toThrow(XmlScanError);
  });
});

/* =====================================================================================================
 * §10 SUPPORT — fixtures and readers used only by the three carried sections below.
 *
 * ⚠️ THESE TRAVELLED WITH THE SECTIONS THAT USE THEM. They were declared beside seven sections, four of
 * which are withdrawn (see the §10 banner). Removing those four took the declarations with them and left
 * the three survivors referencing names that no longer existed — a failure the compiler caught rather
 * than one a reader would have. Only the declarations the three surviving sections actually reference are
 * carried: the identifier fixtures, the item-field reader, the microtask drain and the second-product
 * builder. Nothing that existed solely for a memo or a cancellation signal is carried.
 * ================================================================================================== */

/**
 * The sixteen live item fields, in the order `product.cfm` emits them.
 *
 * ⭐ THIS LIST IS DERIVED FROM THE LEGACY VIEW, NOT FROM THE PORT'S OUTPUT, and the direction matters:
 * transcribing it from a render would make the ordering assertion circular — it would prove only that
 * the builder is consistent with itself. Each entry carries the view line it comes from, so the sequence
 * can be diffed against `integrationServices/google/views/feed/product.cfm` line by line.
 *
 * `g:additional_image_link` appears ONCE here and repeats in the document, one element per product image
 * (`:L24`); the ordering case expands it to the record's actual image count before comparing.
 *
 * The four disabled blocks contribute nothing: they sit inside CFML server-side comments at `:L33-L38`,
 * `:L40-L57` and `:L59-L61`, so they never reached the document and §7 and §8 already prove the port did
 * not promote them.
 */
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

/**
 * Every element name inside the first `item`, in document order, opening tags only.
 *
 * Reading names rather than whole elements is what makes the ordering claim independent of every field's
 * VALUE, so this section fails for a reordering and stays green for a value change — which is precisely
 * the division of labour between it and §2 through §6.
 */
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

/** A second product identifier, so a case can put two records under two DIFFERENT products. */
const OTHER_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1';
/** A third, for the three-record cancellation case. */
const THIRD_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb3';
const THIRD_SKU_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3';

/**
 * A second SKU image file, so two records can own two DISTINCT resized reads.
 *
 * Left unseeded in `imagePathsByImageFile` on purpose: the image double then echoes the name back for both
 * path members, which is enough for an ordering case and invents no directory layout.
 */
const SECOND_SKU_IMAGE_FILE = 'nike-air-2.jpg';

/**
 * Hands control back to the event loop until every pending microtask has run.
 *
 * ⭐ IT IS A BARRIER, NOT A DELAY, AND THE DISTINCTION MATTERS FOR DETERMINISM. `setImmediate` is a
 * macrotask, so it is scheduled strictly AFTER the whole microtask queue drains — which means every
 * continuation the builder could take without waiting on a gated call has already been taken by the time
 * this resolves. No duration is named and no timer fires, so nothing here is flaky and nothing here
 * invents a figure (IR-12): the render is either waiting on a call the case controls, or it has finished.
 */
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

/* =====================================================================================================
 * §10 — THREE SECTIONS CARRIED FORWARD, AND FOUR DELIBERATELY NOT.
 *
 * ⚠️ WHY THIS BANNER EXISTS. Seven further sections stood below §9. Four asserted behaviour that has
 * since been WITHDRAWN from the builder, and they are removed with it rather than weakened:
 *   - `the per-product pricing memo` and `the per-build pricing memo (F7)` asserted that a product's
 *     sale-price details and a SKU's resized image path were each resolved at most once per document,
 *     through `memoisePricingByProduct` / `memoiseResizedImagePaths` decorators bundled into a
 *     `FeedDocumentScope`. That memoisation is a FORBIDDEN OPTIMIZATION (AAP §0.8.2 guideline 4 — no
 *     enhancement beyond what the migration requires): `product.cfm` reads each value once per field,
 *     so the legacy call pattern is `n*(1+i)` and the port now reproduces it. §3 asserts the resize
 *     requests INCLUDING the duplicate, which is the assertion these two sections contradicted.
 *   - `cancellation between complete records` and `cancellation between two complete records (F9c)`
 *     asserted a `ProductFeedRenderOptions.signal` stop mechanism. That option is an UNAPPROVED
 *     ADDITION with no legacy counterpart, and settling a stop policy here would have resolved half of
 *     the delivery-model mismatch AAP §0.6.6 M2 requires to stay OPEN. Record selection still honours a
 *     signal — that is `ProductFeedQuery`'s own declared option, and `googleFeedHandler` still forwards
 *     it there.
 *
 * ⭐ THE THREE BELOW SURVIVE BECAUSE NONE DEPENDS ON EITHER WITHDRAWAL. Each was re-read against the
 * retained builder before being carried: they assert field ORDER, the no-expiration branch of the
 * conditional sale pair, and that dependency reads are issued ONE AT A TIME. The last is a property of
 * awaiting each port call in turn, which is if anything more visible once the memo is gone, since every
 * read now reaches the port.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — the whole-item field order', () => {
  it('[NET-NEW] product.cfm:L17-L58 — a fully populated item emits all sixteen live fields in the legacy order', async () => {
    /*
     * FULLY POPULATED MEANS EVERY CONDITIONAL BRANCH TAKEN. The two sale fields need a product price
     * STRICTLY greater than the sale price; `g:brand` needs the brand ASSOCIATION present; and
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
     * eighteen names for sixteen fields — and the three repeats sit BETWEEN `g:image_link` and
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
     * ⭐ ONE ORDERED COMPARISON RATHER THAN SIXTEEN INDEPENDENT `toContain` CALLS, WHICH IS THE WHOLE
     * POINT. `toContain` is order-blind: sixteen of them pass against any permutation of the same
     * sixteen lines. Joining the expected fields with newlines and asserting the document CONTAINS that
     * exact block pins the values AND their adjacency in a single assertion, so a reordering, an
     * insertion, a deletion or a changed byte all fail here.
     *
     * Every value below is derived from a seed this case set or from a module constant this file already
     * declares — none is transcribed from a previous run. Two carried oddities are visible in it and
     * neither is smoothed over: the item link keeps BOTH its leading and trailing slash
     * (`model/entity/Product.cfc:L207-L209`), and the shipping weight is two setting values joined by one
     * literal space (`:L58`).
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
     * THE COMPLEMENT OF THE CASE ABOVE, and it is what makes the ordering claim safe against the opposite
     * error. With no sale, no brand and no images, the emitted sequence must be the sixteen-field list
     * MINUS exactly four names — the two sale fields, the brand, and the repeated image — with every
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
     * The ordering contract is per ITEM and the record order is the port's. Both are asserted together
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
     * ⭐ THE EXPIRATION KEY IS OMITTED, NOT SET TO `undefined`, AND THE DISTINCTION IS THE WHOLE CASE.
     * Under `exactOptionalPropertyTypes` those are different states, and `buildSalePriceDetails` exists to
     * express the ABSENT one — which is what `model/entity/Sku.cfc:L560-L565` turns into the EMPTY STRING
     * rather than into a date. Every other sale case in this file supplies an expiration, so this is the
     * only route to the lenient endpoint branch.
     */
    scenario.seedSaleDetails({ [SKU_ID]: buildSalePriceDetails({ salePrice: 79.5 }) });

    const xml = await scenario.render();
    const content = elementContent(xml, 'g:sale_price_effective_date');

    /*
     * TODO(parity) — THE LENIENT BRANCH IS REPRODUCED BECAUSE IT IS THE ONE THAT PRODUCES OUTPUT AT ALL.
     * The legacy accessor's empty-string return is fed straight into `dateFormat()` and `timeFormat()`,
     * and CFML engines DISAGREE about that call: one renders nothing where another raises a conversion
     * failure, so the legacy behaviour for a sale with no expiration is engine-dependent. The branch that
     * emits is carried, and the four things it deliberately does NOT do are each asserted below.
     *
     * The second endpoint is therefore `T-5` — an empty date, the literal `T`, an empty time, the literal
     * hyphen, and the raw offset. The delimiters survive their empty operands.
     */
    expect(content).toBe(`${EXPECTED_EFFECTIVE_DATE_START}/T-${RAW_UTC_HOUR_OFFSET}`);

    const endpoints = (content ?? '').split('/');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[1]).toBe(`T-${RAW_UTC_HOUR_OFFSET}`);

    /*
     * ⛔ NO DATE IS INVENTED, AND THE RENDER INSTANT IS NOT SUBSTITUTED FOR THE MISSING EXPIRATION —
     * substituting it would advertise a sale ending the moment the feed was generated, which is both a
     * fabricated value and the worst possible one. The start endpoint's own date must therefore appear
     * exactly ONCE in the range.
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
     * ⚠️ THE MISSING EXPIRATION MUST NOT SUPPRESS EITHER FIELD. The legacy condition at `:L28` tests only
     * the PRICE COMPARISON, so an absent expiration cannot drop the pair — and dropping `g:sale_price`
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
     * `:L30` ends with a literal tab after the closing tag, and it belongs to the ELEMENT rather than to
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

describe('NET-NEW — one dependency read outstanding at a time (F8a)', () => {
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
     * TWO DIFFERENT PRODUCTS, deliberately. The F7 memo means two SKUs of ONE product share a single read,
     * which would leave nothing to sequence — so a case about ordering has to defeat the memo to have two
     * reads to order at all.
     */
    const running = scenario.render({ skus: [scenario.sku, otherSku] });

    await drainMicrotasks();

    /*
     * ⭐ THE ASSERTION THE WHOLE SECTION IS FOR. The render is now as far as it can get without help, and
     * that point is INSIDE record one: one read started, one outstanding, and record two's product has not
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

    /* Resolution order matched start order, and the document is in record order — the sequencing bought
     * ordering, not merely a different call pattern. */
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
     * Driven as a loop rather than as three hand-written steps, so the invariant is stated ONCE and holds
     * for every record instead of only for the boundary the case happened to write out. The outstanding
     * count is checked BEFORE each settle, which is the moment a concurrent implementation would have
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
     * FOUR reads make up one record's image work: the SKU's own composed path, the SKU's resized path, and
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
    const scenario = createScenario({ deferImages: true });
    const otherProduct = buildOtherProduct(scenario.productType, OTHER_PRODUCT_ID, 'OTHER', 50);
    /*
     * A DIFFERENT image file on record two, and no additional images on either record.
     *
     * ⚠️ THE MEMO WOULD OTHERWISE SWALLOW THE SECOND RECORD'S WORK ENTIRELY, and that is a real finding
     * rather than a fixture inconvenience: `memoiseResizedImagePaths` is keyed on the whole request, so two
     * records whose SKUs carry the SAME image file share ONE resized read across records — which leaves
     * nothing to sequence. Distinct files give each record its own two reads and put the question back to
     * the record loop.
     */
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
     * ⭐ THE CROSS-RECORD BOUNDARY. Exactly two reads had resolved before record two asked for anything, and
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

    /* All four reads resolved in start order, and both items are in the document in record order. */
    expect(scenario.images.resolved).toStrictEqual([
      `getImagePath:${SKU_IMAGE_FILE}`,
      `getResizedImagePath:${SKU_COMPOSED_IMAGE_PATH}`,
      `getImagePath:${SECOND_SKU_IMAGE_FILE}`,
      `getResizedImagePath:${SECOND_SKU_IMAGE_FILE}`,
    ]);
    expect(scenario.images.pending).toHaveLength(0);
    expect(countOccurrences(xml, `${CHANNEL_FIELD_INDENT}<item>`)).toBe(2);
    expect(xml.indexOf('<g:id>TESTPRODUCTXXX-1</g:id>')).toBeLessThan(
      xml.indexOf('<g:id>OTHER-1</g:id>'),
    );
  });
});
