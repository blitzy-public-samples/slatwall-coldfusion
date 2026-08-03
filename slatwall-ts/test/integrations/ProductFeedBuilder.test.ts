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
import { DataIntegrityError, DomainError, NotImplementedError } from '../../src/errors/DomainError';
/* The composition root and the feed's entry point are named for the F4 wiring cases at the foot of this
 * file, which cross the shipped wiring rather than hand-building records. Both are TYPE-ONLY here: the
 * modules themselves are reached with `require` after `process.env` is set, for the module-load reason
 * that section's header records. */
import type { CatalogContainer, CatalogContainerOverrides } from '../../src/config/container';
import type { GoogleFeedHandler } from '../../src/handlers/googleFeedHandler';
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
/* A VALUE import, not a type-only one: the folded `ProductFeedQuery` cases assert `toBeInstanceOf(Sku)`
 * on the hydrated records, which needs the constructor at run time. */
import { Sku } from '../../src/domain/sku/Sku';
import type { Product, ProductOwnedAssociation } from '../../src/domain/product/Product';
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
 * The RAW-SINK sentinels, and why two are needed rather than one.
 *
 * Review finding CQ-9 restored the legacy's split: `integrationServices/google/views/feed/product.cfm`
 * escapes SIX of its fifteen dynamic values and emits NINE RAW. A raw sink can therefore no longer be
 * probed with {@link ESCAPE_SENTINEL}, because two of that sentinel's characters — `&` and `<` — are now
 * REFUSED at a raw sink rather than escaped (finding SEC-2: a document a parser cannot read must never be
 * published with a 200).
 *
 *   - {@link RAW_SAFE_SENTINEL} carries `>`, `"` and `'`, every one of which is LEGAL, unambiguous element
 *     content that the legacy emits unmodified. It is the discriminator between the two censuses: at a RAW
 *     sink it must survive byte-for-byte, and at an ESCAPED sink the same `>` and `"` must come back as
 *     `&gt;` and `&quot;`.
 *   - {@link RAW_REFUSED_SENTINEL} carries a bare `&`, which is a fatal XML well-formedness error. It is
 *     what proves the refusal fires rather than being asserted only in prose.
 */
const RAW_SAFE_SENTINEL = 'A>B"C\'D';
const RAW_SAFE_SENTINEL_ESCAPED = "A&gt;B&quot;C'D";
const RAW_REFUSED_SENTINEL = 'A&B';

/*
 * A host that CONFORMS to RFC 3986 §3.2.2 and still carries characters an XML author would look at twice.
 * `reg-name` admits the sub-delimiters, so `'`, `!` and `$` are all legal in a registered name and
 * `src/config/env.ts`'s host rule accepts them by design — which is exactly why the serializer, not the
 * config layer, has to own the treatment. This value is not a hypothetical: it passes the module-load
 * rule and reaches the builder.
 *
 * ⚠️ IT NO LONGER CARRIES `&`, AND THE OMISSION IS THE FINDING RATHER THAN A WEAKENING. It used to be
 * `a&b'c.example`, and under DECISION G-3 the ampersand was ESCAPED into the five URLs it composes.
 * Review finding CQ-9 withdrew that escape — all five host sinks are RAW in `product.cfm` — so an
 * ampersand in a host is now REFUSED by {@link DataIntegrityError} instead, because raw emission would
 * leave the whole document unparseable (finding SEC-2). That refusal is asserted in its own case below;
 * this constant's job is to prove the LEGAL sub-delimiters still travel byte-for-byte, which is the half
 * CQ-9 is about. Every character here is both an RFC 3986 sub-delimiter and legal XML element content.
 */
const CONFORMING_HOSTILE_HOST = "a'b!c$d.example";

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

  it('[NET-NEW] CQ-9 emits a raw URL path byte-for-byte, and refuses one carrying markup', async () => {
    /*
     * THE RAW-SINK CONTRACT AT `:L22`, AND HOW IT CHANGED TWICE.
     *
     * `:L22` wraps the link in no `htmlEditFormat` call, so it is one of the NINE RAW sinks. An earlier
     * revision percent-encoded each path segment and then escaped the finished URL, on review finding F7's
     * authority; review finding CQ-9 withdrew BOTH, because each changes the bytes of a field the legacy
     * publishes unmodified — `%` became `%25`, so a stored `a%20b` was published as `a%2520b` with no
     * metacharacter involved at all.
     *
     * ⭐ SO THE FIRST HALF OF THIS CASE IS BYTE PARITY. `>`, `"` and `'` are legal, unambiguous element
     * content; the legacy emits them untouched and so does the port. Neither percent-encoding nor entity
     * escaping may appear.
     */
    const safeScenario = createScenario({ urlTitle: RAW_SAFE_SENTINEL });

    const safeXml = await safeScenario.render();

    expect(safeXml).toContain(
      itemField(
        `<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/${RAW_SAFE_SENTINEL}/</link>`,
      ),
    );
    /* Neither remedy the earlier revision applied may be observable in the emitted bytes. */
    expect(safeXml).not.toContain(encodeURIComponent(RAW_SAFE_SENTINEL));
    expect(safeXml).not.toContain(`/${RAW_SAFE_SENTINEL_ESCAPED}/`);
    /* And the separators the legacy relies on survive, as they did under the encoder. */
    expect(safeXml).toContain(`<link>${ABSOLUTE_URL_PREFIX}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/`);
    expect(safeXml).not.toContain('<link>https://');
    /* The URL key is still read through the setting resolver, not hard-coded in the builder. */
    expect(resolvedSettingNames(safeScenario.settings)).toContain('globalURLKeyProduct');

    /*
     * ⭐ AND THE SECOND HALF IS THE REFUSAL THAT KEEPS CWE-91 CLOSED. Raw emission alone would let a
     * stored `&` reach the document and leave it unparseable, which is exactly the exposure finding SEC-2
     * names. So the value is REFUSED rather than escaped: no document is published, and the failure is a
     * `DataIntegrityError`, which `googleFeedHandler` answers 500. Escaping made such a payload harmless
     * DATA; refusing makes it unpublished. Both close the injection route, and only refusing leaves the
     * legitimate bytes above untouched.
     */
    const hostileScenario = createScenario({ urlTitle: RAW_REFUSED_SENTINEL });

    await expect(hostileScenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
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

  it('[NET-NEW] CQ-9 emits both shipping-weight settings raw, refusing only markup', async () => {
    /*
     * `:L58` interpolates both settings with no `htmlEditFormat` call, so this is a RAW sink. An earlier
     * revision escaped the joined text; review finding CQ-9 withdrew that, so the legitimate bytes below
     * are emitted exactly as the settings store holds them — including the legacy's single separator space,
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
    /* No entity may appear: escaping this sink is precisely what CQ-9 reversed. */
    expect(xml).not.toContain(RAW_SAFE_SENTINEL_ESCAPED);
    /* The legacy's single literal separator space survives, as it did under the escape. */
    expect(xml).toContain(`1.5 ${RAW_SAFE_SENTINEL}`);

    /*
     * ⭐ AND THE MARKUP THE REVIEW QUOTED IS REFUSED RATHER THAN PUBLISHED. A raw `<lb>` reaching the
     * document would make `</g:shipping_weight>` the close of a `<lb>` element rather than of this field,
     * which is the malformed rendering finding SEC-2 forbids in a 200 response. Because the sink is raw,
     * the only remedies are escaping (withdrawn by CQ-9) and refusing — so it refuses, once per offending
     * setting, and no document is published either way.
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
 * §8 — The asymmetric escaping map, reproduced exactly as the legacy has it.
 *
 * ⭐ THIS SECTION HAS BEEN RETITLED TWICE, AND BOTH MOVES ARE RECORDED BECAUSE THE SUITE'S EXPECTATIONS
 * MOVED WITH THEM. It began as "The asymmetric escaping map", naming the LEGACY's own asymmetry: six item
 * fields wrapped in `htmlEditFormat` and nine dynamic values left raw, chosen field by field with no rule
 * behind the choice. DECISION G-3 (review finding F7) then escaped all fifteen and the section was renamed
 * to say that asymmetry was gone. Review finding CQ-9 has now REVERSED G-3 — escaping a raw sink changes
 * bytes the legacy publishes unmodified, and the percent-encoding of three URL paths changed them even
 * where no metacharacter was present — so the legacy's split is authoritative again and this section proves
 * it field by field.
 *
 * ⭐ WHAT REPLACES G-3'S PROTECTION, AND WHY THE INJECTION EXPECTATIONS DID NOT SIMPLY DISAPPEAR. The nine
 * raw sinks now REFUSE `&`, `<` and `]]>` rather than escaping them (review finding SEC-2: never publish a
 * document a parser cannot read with a 200). So every hostile-value case in this section survives — it just
 * asserts a `DataIntegrityError` where it used to assert an entity. F7's CWE-91 exposure stays closed, by
 * refusal instead of by encoding, and CQ-9's byte parity holds because refusal alters nothing it publishes.
 * ================================================================================================== */

describe('NET-NEW ProductFeedBuilder — escaping every dynamic field', () => {
  it('[NET-NEW] CQ-9 reproduces the legacy split exactly: six escaped, nine raw', async () => {
    /*
     * THE CENSUS, AND WHY IT IS AUTHORITATIVE AGAIN.
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
     * ⛔ AN EARLIER REVISION REQUIRED ALL FIFTEEN ESCAPED and additionally required the three URL paths
     * percent-encoded, reasoning that the nine raw sinks were a CWE-91 surface the review had classified
     * MAJOR. Review finding CQ-9 reverses that as an unapproved second hardening exception: escaping a raw
     * sink emits bytes the legacy never emitted, and the encoder changed even innocuous paths — a stored
     * `a%20b` was published as `a%2520b`. So this case asserts the SPLIT, using a sentinel that is legal
     * raw content, and the companion case below asserts the refusal that keeps injection closed.
     *
     * ⭐ THE SENTINEL IS THE DISCRIMINATOR. {@link RAW_SAFE_SENTINEL} carries `>`, `"` and `'`. At an
     * ESCAPED sink the first two must come back as `&gt;` and `&quot;`; at a RAW sink all three must survive
     * byte-for-byte. One value therefore proves both halves of the census, and an implementation that
     * escaped uniformly — in either direction — fails half the assertions below.
     *
     * `htmlEditFormat` processes `&` FIRST and then `<`, `>` and the double quote, and it leaves the
     * APOSTROPHE alone — which is why the escaped form keeps its single quote intact rather than turning it
     * into `&#39;`. That behaviour is unchanged; only the SET OF FIELDS it reaches is back to six.
     */
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

    /* THE SIX THE LEGACY ESCAPES — and `>` and `"` must be entities in every one of them. */
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
     * THE NINE THE LEGACY DOES NOT — byte-for-byte, with no entity and no percent-encoding. The three URL
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
     * AND THE COUNTS PIN THE SPLIT AS A WHOLE, which no per-field assertion can do. Six escaped
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

  it('[NET-NEW] SEC-2 refuses a raw sink carrying markup rather than publishing it', async () => {
    /*
     * THE OTHER HALF OF THE CENSUS RESTORATION, AND THE REASON REVERSING G-3 IS NOT A REGRESSION.
     *
     * Emitting a raw sink verbatim would let a stored `&` or `<` reach the document, which is precisely the
     * exposure finding SEC-2 names — "allowing one record to make the whole feed unparseable" — and finding
     * F7 named before it. The remedy is refusal: {@link DataIntegrityError} on the first offending value,
     * so nothing is published at all. `googleFeedHandler` answers 500.
     *
     * EVERY RAW SINK IS DRIVEN INDEPENDENTLY, because they take different routes to the document: two are
     * channel-level, three are URLs assembled from a prefix, one is the offset appearing twice in an
     * assembled range, and one is two settings joined. A single combined case would let a passing refusal at
     * an early sink mask a missing one later.
     */
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
     * the pair is emitted only when the SKU price exceeds the sale price, so the sale detail has to be seeded
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
     * ⭐ AND THE `]]>` SEQUENCE IS REFUSED TOO, which neither `&` nor `<` covers. It is the only
     * multi-character sequence XML 1.0 forbids in element content, and it can reach a raw sink without any
     * single forbidden character being present.
     */
    await expect(
      createScenario({
        settings: [{ settingName: 'skuShippingWeightUnitCode', value: 'lb]]>x' }],
      }).render(),
    ).rejects.toBeInstanceOf(DataIntegrityError);

    /* A `>` on its own is LEGAL element content and must NOT be refused — the boundary of the rule. */
    const legalScenario = createScenario({
      settings: [{ settingName: 'skuShippingWeightUnitCode', value: 'lb>x' }],
    });
    await expect(legalScenario.render()).resolves.toContain('<g:shipping_weight>');
  });

  it('[NET-NEW] CQ-9 emits the configured host raw in all five places it is interpolated', async () => {
    /*
     * THE HOST IS THE ONE DYNAMIC VALUE THAT REACHES BOTH CHANNEL-LEVEL FIELDS, so a single bad configured
     * value corrupts the whole document rather than one item. `:L14`, `:L15`, `:L22`, `:L23` and `:L24` all
     * interpolate it with no check — and all five are RAW sinks, so review finding CQ-9 requires it emitted
     * unmodified.
     *
     * ⚠️ IT IS NEITHER ESCAPED NOR PERCENT-ENCODED, AND BOTH OMISSIONS ARE DELIBERATE. Escaping was
     * withdrawn by CQ-9 (these are raw sinks). Percent-encoding was never applied to the host, because an
     * authority legitimately carries `:` before a port and `encodeURIComponent` would render that as `%3A`
     * and break every URL in the feed. What protects it is a pair of controls that change no legitimate
     * byte: `validateFeedHostAuthority` refuses the characters that move the ORIGIN, and the raw renderer
     * refuses the two that break the PARSE.
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
    /* Five interpolations, five RAW occurrences, and no escaped one anywhere. */
    expect(countOccurrences(xml, rawHost)).toBe(5);
    expect(xml).not.toContain(RAW_SAFE_SENTINEL_ESCAPED);
    /* The colon a real authority needs is proved unencoded by the default host-with-port case below. */
  });

  it('[NET-NEW] leaves a host port colon unencoded, so an ordinary authority survives intact', async () => {
    /*
     * The complement of the case above: a configured authority carrying a port must survive intact. An
     * implementation that ran the host through `encodeURIComponent` would emit
     * `catalog.example.test%3A8080` and break every URL in the feed — which is why percent-encoding an
     * AUTHORITY was wrong in every revision, independently of finding F4's withdrawal of the path encoder.
     */
    const scenario = createScenario({ host: 'catalog.example.test:8080' });

    const xml = await scenario.render();

    expect(xml).toContain(channelField('<link>http://catalog.example.test:8080</link>'));
    expect(xml).toContain(itemField('<link>http://catalog.example.test:8080/'));
    expect(xml).not.toContain('%3A8080');
  });

  it('[NET-NEW] CQ-9 emits the effective-date offset raw, refusing only what breaks the parse', async () => {
    /*
     * THE FIELD'S ONE ARBITRARY-TEXT COMPONENT, DRIVEN THROUGH BOTH OUTCOMES.
     *
     * `g:sale_price_effective_date` assembles eleven parts and ten of them are derived: two dates and two
     * times come from `formatDate`/`formatTimeOfDay` over real instants, and the `T`, `-`, `/` and `-` are
     * literals. The offset is the eleventh, it is the ONLY one that is caller text, and it appears TWICE in
     * the range — so it is this field's injection route.
     *
     * ⛔ THIS CASE HAS NOW HELD THREE DIFFERENT EXPECTATIONS, and recording all three is the only way the
     * current one is checkable. (1) It first asserted a REFUSAL, on the reading that `readUtcHourOffset`
     * gated the value numerically; that premise was withdrawn, because there is no arithmetic left for a
     * numeric gate to serve — `product.cfm:L30` interpolates the offset as a bare label after a literal
     * hyphen and never parses it. (2) It then asserted an ESCAPE, under DECISION G-3. (3) Review finding
     * CQ-9 has withdrawn G-3 for this sink, because `:L30` emits every part of the range with no
     * `htmlEditFormat` call — so the offset is now emitted RAW.
     *
     * ⭐ AND THE INJECTION ROUTE IS STILL CLOSED, WHICH IS WHY (3) IS NOT A RETURN TO THE ORIGINAL HAZARD.
     * The raw renderer REFUSES `&`, `<` and `]]>` (review finding SEC-2), so a payload such as
     * `</g:sale_price_effective_date><g:id>x` cannot be smuggled through: it contains `<` and is turned
     * away before any document exists. Both halves are asserted below — legal text arrives verbatim, and
     * hostile text produces no document.
     */
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
       * THE OFFSET SITS AFTER EACH OF THE TWO LITERAL HYPHENS, UNMODIFIED, and the `/` between the endpoints
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
       * And the withdrawn escape's own output is absent at both endpoints — asserted only for a vector the
       * escape would actually have CHANGED. For `7`, `-7` and `5.5` the escaped form IS the raw form, so the
       * same assertion would demand the absence of the very text the sink is required to emit; the guard is
       * what keeps this case about the withdrawal rather than about the emission.
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
     * AND THE HOSTILE VECTORS PRODUCE NO DOCUMENT AT ALL. The last one is the sharpest: `'5&amp;'` is
     * ALREADY-ESCAPED input, and it is refused on its bare ampersand rather than being re-escaped to
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

  it('[NET-NEW] refuses a money value that reached the exact-decimal brand without satisfying it', async () => {
    /*
     * WHY THIS CASE NEEDS A CAST WHERE NO OTHER CASE IN THIS FILE DOES, AND WHY IT IS STILL WORTH IT.
     *
     * `g:price` and `g:sale_price` carry `ExactDecimal`, a branded STRING whose grammar admits only digits,
     * an optional leading minus and at most one point. For every value minted through `toExactDecimal` the
     * question of escaping is moot — there is nothing to escape — so the behaviour of these two sinks on a
     * metacharacter cannot be demonstrated by an ordinary sentinel: the type system refuses to construct one.
     *
     * The brand is a COMPILE-TIME claim, though, not a runtime one: an assertion at a hydration boundary, a
     * hand-written double or a future adapter that mints the brand without validating would put arbitrary
     * text at these sites. This case constructs exactly that value, deliberately and in one place, so that
     * the two money sinks are not the only dynamic nodes in the document with no proven defence.
     *
     * ⛔ IT USED TO ASSERT AN ESCAPE, under DECISION G-3. `:L27` emits the price with no `htmlEditFormat`
     * call, so review finding CQ-9 makes this a RAW sink and the escape is withdrawn. The defence is
     * therefore a REFUSAL rather than an encoding — which is the stronger outcome for a forged brand, since
     * escaping would have published a `g:price` no consumer can parse as a price while refusing publishes
     * nothing and reports a `DataIntegrityError`.
     */
    const scenario = createScenario({ productPrice: 100 });
    scenario.product.price = 'A&B<C' as unknown as ExactDecimal;

    await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);

    /*
     * AND A FORGED VALUE THAT IS LEGAL XML STILL RENDERS, VERBATIM — the boundary of the rule. The raw
     * renderer is not a price validator: it refuses what breaks the document, not what breaks the grammar
     * `ExactDecimal` claims. Inventing a numeric check here would be exactly the closed set AAP §0.7.3 S9
     * forbids, and `renderFeedMoney`'s own note records that the brand is the only grammar in play.
     */
    const legalScenario = createScenario({ productPrice: 100 });
    legalScenario.product.price = 'not-a-number' as unknown as ExactDecimal;

    const legalXml = await legalScenario.render();
    expect(legalXml).toContain(itemField('<g:price>not-a-number</g:price>'));

    /*
     * `g:sale_price` IS THE SAME HELPER OVER THE SAME KIND OF VALUE, and it is deliberately not forged the
     * same way here, because it cannot be reached: the pair is emitted only when
     * `compareExactDecimal(skuPrice, salePrice) === 1`, and that comparison answers `undefined` rather than
     * a silent `false` for an operand outside the grammar — so a forged sale price OMITS the pair instead of
     * rendering it. That omission is its own defence and it survives the withdrawal untouched, because it is
     * an ORDERING property of the legacy's own `gt` comparison rather than an added control. It is asserted
     * in §5 rather than duplicated here.
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

  it('[NET-NEW] CQ-9 census: six escaped sites, nine raw sites, four fixed-text sites', () => {
    const source = partitionBuilderSource(readFileSync(BUILDER_SOURCE_PATH, 'utf8'));
    const codeText = spanText(source, source.codeSpans);

    /*
     * WHY A SOURCE-LEVEL CENSUS IS REQUIRED HERE, AND WHAT IT PROVES THAT A RENDERED-OUTPUT ASSERTION
     * CANNOT.
     *
     * An output assertion can only prove that the fields it happens to exercise behave correctly. THIS CASE
     * PROVES THE COMPLEMENT: that there is no dynamic sink anywhere in the builder's executable text which
     * skips BOTH helpers. Every `openTag`…`closeTag` region must contain a call to one of them, or be one of
     * the four fields whose content is a FIXED LITERAL. A future field added without either fails this case
     * even if no other case mentions it.
     *
     * ⛔ THIS TABLE HAS BEEN PINNED THREE WAYS, AND THE HISTORY IS THE POINT. It first matched `product.cfm`
     * field for field at six escaped and nine raw. DECISION G-3 (review finding F7) then moved it to fifteen
     * escaped with three additionally percent-encoded, on the reading that the raw sinks were the
     * vulnerability rather than the contract. Review finding CQ-9 has moved it BACK: escaping a raw sink
     * emits bytes the legacy never emitted, and the percent-encoder changed even innocuous paths. So the
     * legacy split is authoritative again — and the raw sinks are safe because
     * {@link renderRawFeedNode} REFUSES `&`, `<` and `]]>` rather than because they are escaped.
     *
     * ⭐ WHICH IS WHY THE RAW COLUMN IS NOW A HELPER COUNT RATHER THAN AN ABSENCE. Under G-3 "raw" meant
     * "no call, therefore unprotected", and the case could only demand the number be small. Now every raw
     * sink names a helper too, so this census pins BOTH halves positively and the residual `plainLiteral`
     * column is exactly the four fields that interpolate nothing dynamic at all.
     *
     * All three helper names are DISCOVERED from the source rather than assumed, so renaming any of them
     * does not silently reduce this case to a tautology.
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
     * ⭐ AND THE WITHDRAWN ENCODER MUST BE GONE FROM THE SOURCE ENTIRELY, not merely unused. CQ-9 withdrew
     * it, and a dormant declaration is a path a future field could be wired to by mistake.
     */
    expect(/function\s+encode[A-Za-z0-9_]*\s*\(/.test(codeText)).toBe(false);
    expect(codeText).not.toContain('encodeURIComponent');

    /*
     * THE FULL SIXTEEN-FIELD CENSUS, matched against `product.cfm` line by line.
     *
     * `title` shows one escaped site and one fixed-literal site, because the channel-level title at `:L13`
     * is the literal `Slatwall Product Feed` while the item-level title at `:L18` is the product's.
     * `description` shows one escaped and one raw: the item-level value at `:L19` is escaped by the legacy
     * and the channel-level one at `:L15` interpolates the host raw. `link` shows two RAW sites, because
     * `:L14` and `:L22` both emit unescaped.
     */
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
       * A FIELD MAY NOT USE BOTH HELPERS AT ONE SITE, and the arithmetic below is what states that: the
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
     * ⭐ AND THE FOUR FIXED-TEXT SITES ARE ACCOUNTED FOR INDIVIDUALLY: the channel title, and the three
     * fields whose entire content is a literal in this file. None of them interpolates a value, so there is
     * nothing at any of them for either helper to act on.
     */
    expect(plainLiteralSites).toBe(4);
    expect(codeText).toContain('<g:google_product_category></g:google_product_category>');
    expect(codeText).toContain('<g:condition>${CONDITION_VALUE}</g:condition>');
    expect(codeText).toContain('<g:availability>${AVAILABILITY_VALUE}</g:availability>');
    expect(codeText).toContain('<title>${CHANNEL_TITLE}</title>');

    /*
     * And the three interpolated names above are MODULE CONSTANTS initialised from string literals — not
     * parameters, port reads or field accesses. That is the property which makes leaving them alone correct,
     * so it is asserted rather than assumed. Their VALUES are pinned by the rendered-output cases in §1 and
     * §2; this case only establishes that nothing dynamic reaches these four sites.
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
 * §8 proves the escaping is applied at the legacy's six sinks and at no other. This section proves what
 * that buys a consumer and what it does not, which are two different claims and are now asserted
 * separately: a hostile value in one of the SIX escaped sinks cannot change the document's SHAPE, and a
 * hostile value in one of the NINE raw sinks CAN — the second being the exposure finding F4 carries
 * (AAP §0.7.3 S8). A substring assertion cannot express either claim. "The document contains one channel
 * with one item whose link is exactly this" can only be said by parsing, so these cases parse.
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
  it('[NET-NEW] CQ-9 emits a conforming sub-delimiter host raw in the channel link and description', async () => {
    const scenario = createScenario({ host: CONFORMING_HOSTILE_HOST });

    const xml = await scenario.render();
    const channel = parseFeedChannel(xml);

    /* The channel pair round-trips to the composed value, every sub-delimiter intact. */
    expect(soleChildText(channel, 'link')).toBe(`http://${CONFORMING_HOSTILE_HOST}`);
    expect(soleChildText(channel, 'description')).toBe(
      `Google Product Feed for http://${CONFORMING_HOSTILE_HOST}`,
    );
    /* On the wire there is NO entity anywhere: `:L14` and `:L15` are raw sinks. */
    expect(xml).toContain(channelField(`<link>http://${CONFORMING_HOSTILE_HOST}</link>`));
    expect(xml).not.toContain('&amp;');
    expect(xml).not.toContain('&apos;');
  });

  it('[NET-NEW] SEC-2 refuses a conforming host whose ampersand would break the channel pair', async () => {
    /*
     * THE COMPLEMENT OF THE CASE ABOVE, AND THE REASON WITHDRAWING THE ESCAPE COSTS NOTHING. `&` is an RFC
     * 3986 sub-delimiter, so `src/config/env.ts` accepts it and `validateFeedHostAuthority` — which gates
     * only the five ORIGIN-MOVING characters — permits it too. Raw emission would then put a bare ampersand
     * into all five URLs, and a bare ampersand is a fatal XML well-formedness error: the legacy's own
     * document would not parse. So the value is refused, and nothing is published.
     */
    const scenario = createScenario({ host: "a&b'c.example" });

    await expect(scenario.render()).rejects.toBeInstanceOf(DataIntegrityError);
  });

  it('[NET-NEW] CQ-9 emits the same host raw everywhere it is composed into an item URL', async () => {
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
    /* Read through the parser as well as the raw string: the item link round-trips to the composed value
     * with every sub-delimiter of the host intact, which is the property raw emission is supposed to have. */
    expect(soleChildText(item, 'link')).toBe(
      `${prefix}/${SETTING_GLOBAL_URL_KEY_PRODUCT}/nike-air/`,
    );
    expect(xml).toContain(
      itemField(
        `<g:additional_image_link>${prefix}/product/default/b.jpg</g:additional_image_link>`,
      ),
    );
    /*
     * FIVE places compose the host — the channel link, the channel description, the item link,
     * `g:image_link` and the one `g:additional_image_link` — and every one carries it RAW. The count is
     * measured rather than reasoned: a first draft of this assertion said four, having forgotten that the
     * channel description interpolates the host as well as the channel link. A revision escaped all five and
     * counted the ESCAPED form here; the count is unchanged and only the form has flipped, which is exactly
     * what makes this a withdrawal regression.
     */
    expect(countOccurrences(xml, CONFORMING_HOSTILE_HOST)).toBe(5);
    /* And no percent-encoded form appears: CQ-9 withdrew the encoder from the path, and the host never
     * had it. */
    expect(xml).not.toContain(encodeURIComponent(CONFORMING_HOSTILE_HOST));
  });

  it('[NET-NEW] TODO(parity) — WITHDRAWAL REGRESSION: an origin-moving host renders, unrefused', async () => {
    /*
     * ⛔ THE SHARPEST CARRIED EXPOSURE IN THIS FILE, AND THE ONE THAT WENT THROUGH THE MOST REVISIONS.
     * `ProductFeedRenderContext.host` is a plain `string` with no brand, and every one of the five absolute
     * URLs is composed from it. A host carrying `/`, `@`, `?` or `#` MOVES THE ORIGIN of every URL in the
     * document, and one carrying `<` breaks the CHANNEL out of its own element.
     *
     * ⛔ THREE ANSWERS WERE TRIED. Revision 1 escaped the value, so the document stayed well-formed with
     * `http://x</title>…` sitting inside `<link>` as text — which is well-formed and still wrong, because
     * the harm is in the VALUE rather than in the markup. Revision 2 added a `validateFeedHostAuthority`
     * deny check at the sink and refused the render outright; that is what this case used to assert, along
     * with the offending index and code point in the error's context. Revision 3 withdraws both: AAP
     * §0.6.7.7 authorises exactly ONE departure from behavioural preservation in this port (D18) and
     * `product.cfm:L14` interpolates `CGI.HTTP_HOST` with no test whatsoever.
     *
     * ⚠️ SO THE RENDER SUCCEEDS AND THE INJECTION LANDS. The assertion is the hostile OUTCOME rather than a
     * refusal, and it is spelled out with the literal payload so that a reader of this suite can see what
     * the carry costs — and so that any reinstated AUTHORITY gate fails here loudly.
     *
     * ⭐ THE PAYLOAD IS ORIGIN-MOVING BUT XML-REPRESENTABLE, AND THE DISTINCTION IS THE WHOLE REASON THIS
     * CASE AND ITS SEC-2 SIBLING CAN BOTH BE TRUE. Two different gates were once conflated here:
     *   • The withdrawn `validateFeedHostAuthority` gated the five ORIGIN-MOVING characters `/ @ ? # \\`.
     *     That is a URL-semantics rule with no counterpart in `product.cfm:L14`, which interpolates
     *     `CGI.HTTP_HOST` with no test whatsoever — so it is WITHDRAWN, and this case asserts the carry.
     *   • SEC-2's `assertRepresentableInXml` gates only `<`, `&` and `]]>` at a RAW sink, because those
     *     three make the DOCUMENT UNPARSEABLE — the legacy's own document would not parse either, so
     *     refusing is not an added behaviour but the only truthful answer. That gate is IN FORCE.
     * `legit.example@attacker.example` moves the origin to `attacker.example` for all five URLs while
     * containing no markup character, so it reaches the sink the withdrawn gate used to guard. The
     * `<`-bearing variant is refused, and its sibling case above asserts exactly that.
     */
    const hostileHost = 'legit.example@attacker.example';
    const scenario = createScenario({ host: hostileHost });

    const xml = await scenario.render();

    /* No refusal: a complete document is produced, with the payload verbatim in both channel sinks. */
    expect(xml).toContain(channelField(`<link>http://${hostileHost}</link>`));
    expect(xml).toContain(
      channelField(`<description>Google Product Feed for http://${hostileHost}</description>`),
    );
    /* And nothing encoded it on the way through — the userinfo delimiter travels as itself, which is the
     * whole of the carried exposure: every absolute URL in the document now resolves to `attacker.example`. */
    expect(xml).not.toContain('%40');
    expect(xml).toContain('@attacker.example');
  });

  it('[NET-NEW] keeps one item per SKU when every ESCAPED field is hostile', async () => {
    /*
     * THE BREAKOUT CASE, NOW SPLIT ALONG THE CENSUS. Every value here targets one of the SIX sinks
     * `product.cfm` escapes, so every one of them is escaped by the port too and must come back as
     * character data — one item, one child per field, whatever the payload attempted.
     *
     * ⛔ IT USED TO SEED THE RAW SINKS AS WELL — the host, the `urlTitle` and both shipping-weight settings
     * — because DECISION G-3 escaped those too. Review finding CQ-9 withdrew that escape, so those values
     * are now REFUSED rather than neutralised, and asserting a round trip for them would assert the exact
     * behaviour CQ-9 reversed. They move to the companion case below, which requires the refusal.
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
     * ⭐ THE `]]>` IN THE DESCRIPTION IS THE SHARPEST ONE HERE, and it round-trips because the sink is
     * ESCAPED: the `>` becomes `&gt;`, so the sequence cannot terminate anything. At a RAW sink the same
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

  it('[NET-NEW] CQ-9 and SEC-2: every hostile RAW field is refused rather than neutralised', async () => {
    /*
     * THE OTHER HALF OF THE BREAKOUT CASE ABOVE, AND THE ONE THAT CARRIES THE FINDING.
     *
     * These four values used to be seeded alongside the six escaped ones and asserted as round trips. CQ-9
     * withdrew the escape at every raw sink, so a round trip is no longer the contract: each of them would
     * make the published document unparseable, and finding SEC-2 forbids publishing that with a 200. Each is
     * therefore driven separately — a combined seed would let one refusal mask three missing ones.
     *
     * ⚠️ AND THE PATH TRAVERSAL THAT USED TO BE HALF-CLOSED HERE IS NOW FULLY OPEN, DECLARED RATHER THAN
     * IMPLIED. `../../etc/passwd` contains nothing XML forbids, so it is PUBLISHED, raw, exactly as the
     * legacy published it. Under G-3 the percent-encoder made the `?` and `&` in `?a=1&b=2` inert while
     * leaving the `..` segments traversing just as far; CQ-9 withdrew the encoder, so both the query
     * smuggling and the traversal are now residual risk. DECISION G-2's path grammar stays withdrawn for the
     * reason it always was — no published production governs a Slatwall product URL, and
     * `imageMissingImagePath` is an operator-editable setting whose relative forms the legacy published — so
     * inventing one would be the enhancement AAP §0.8.2 guideline 4 forbids. The risk is recorded in
     * `ProductFeedBuilder.ts` at THERE IS NO `encodeFeedUrlPath` and in `README.md`.
     */
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
     * ⭐ AND THE TRAVERSAL WITHOUT THE QUERY IS PUBLISHED, WHICH IS THE PROOF THAT THE REFUSAL IS SHAPED BY
     * WELL-FORMEDNESS AND NOT BY TASTE. `../../etc/passwd` carries no `&`, no `<` and no `]]>`, so it goes
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

  it('[NET-NEW] SEC-2 refuses a value XML 1.0 forbids rather than publishing an unparseable feed', async () => {
    /*
     * THE ONE EXPOSURE THIS PORT USED TO CARRY, AND NOW CLOSES.
     *
     * ⛔ THIS CASE ASSERTED THE OPPOSITE TWICE, AND BOTH ASSERTIONS ARE RECORDED BECAUSE THE REVERSAL IS THE
     * FINDING. A gate scanning every value against XML 1.0's `Char` production was written, then withdrawn,
     * then proposed again as DECISION G-4 and declined — each time on the reading that `htmlEditFormat`
     * classifies nothing, that `integrationServices/google/views/feed/product.cfm` completes the render
     * whatever a column contains, and that refusing to publish a document the legacy published is a NEW
     * OBSERVABLE OUTCOME. This case then asserted POSITIVELY that the forbidden character survives, so that
     * reinstating the gate would break it.
     *
     * ⭐ IT HAS BEEN REINSTATED, ON REVIEW FINDING SEC-2, and this case now asserts the refusal. SEC-2 names
     * the exposure exactly — "XML 1.0-illegal code points are emitted into a 200 response, allowing one
     * record to make the whole feed unparseable" — and directs the remedy: "do not publish malformed XML
     * successfully". The old reasoning fails on its own terms once tested against D18: parameterised SQL does
     * not return the same rows as interpolated SQL for an input containing a quote, and D18 is declared
     * anyway, because the divergence falls only where the legacy's behaviour was itself the flaw. A document
     * no parser accepts is such a case — one record poisons the whole feed, and no consumer ever ingested it.
     *
     * ⚠️ AND IT REFUSES WITHOUT ALTERING DATA, which is the half of the old argument that still holds.
     * Nothing is stripped, substituted or normalised: deciding what a stray control character should BECOME
     * has no answer in the legacy source. SEC-2's own remedy names that half — "remediate existing invalid
     * data" — as work at the point the data is WRITTEN, outside this module.
     */
    const forbiddenTitles = [
      /* A lone high surrogate, and a lone low one: what a truncated or mis-sliced string carries. */
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
     * ⭐ AND THE THREE WHITESPACE CONTROLS `Char` ADMITS STILL TRAVEL, unescaped and unaltered, which is the
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
     * ⭐ AND A WELL-FORMED SURROGATE PAIR SURVIVES BYTE-FOR-BYTE, which is why the scan iterates CODE POINTS
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

/* ⛔ THERE IS NO `encodePathLikeTheBuilder`. A local mirror of the builder's per-segment percent-encoder
 * stood here, so the three URL sinks could be asserted against their encoded form. Review finding CQ-9
 * withdrew the encoder itself — it changed the emitted bytes of three fields `product.cfm` publishes
 * unmodified, including innocuous paths where `%` became `%25` — so the mirror has nothing left to mirror
 * and the URL sinks are now asserted against their STORED path, which is a stronger expectation because it
 * is written by hand rather than computed by a re-implementation.
 *
 * ⚠️ WHAT THAT LEAVES OPEN IS DECLARED RATHER THAN GLOSSED, and it is the residual risk CQ-9 asks to be
 * documented. A stored path can add segments, and a `..` segment traverses; a stored `?` or `#` can open a
 * query or a fragment; and a path that does not begin with `/` lands inside the authority. The ORIGIN half
 * is closed for the configured HOST by `validateFeedHostAuthority`. The PATH half is not closed, because
 * `imageMissingImagePath` is an operator-editable setting whose relative forms the legacy published, so a
 * leading-slash rule would refuse a legitimate value — DECISION G-2's ground, unchanged. The MARKUP half is
 * closed at every sink: the raw renderer refuses `&`, `<` and `]]>`. */

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

  it('[NET-NEW] CWE-91 keeps a hostile value in every ESCAPED sink as character data', async () => {
    /*
     * ⛔ THIS CASE SEEDED EVERY SINK, INCLUDING THE NINE RAW ONES, and asserted a round trip for all of them
     * — because DECISION G-3 escaped them all. Review finding CQ-9 withdrew that escape, so the raw sinks
     * now REFUSE a hostile value instead of neutralising it, and asserting a round trip there would assert
     * the exact behaviour CQ-9 reversed. The raw sinks move to the companion case below.
     *
     * ⭐ WHAT THIS CASE STILL PROVES IS THE PART THE LEGACY ITSELF GUARANTEES: at the six sinks
     * `product.cfm` wraps in `htmlEditFormat`, a hostile value is DATA. It cannot open an element, cannot
     * close the element it sits in, and comes back byte-identical through a real parse.
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

    /* First: the document is well-formed at all. Everything below depends on this not having thrown. */
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
     * Positively: every ESCAPED sink hands the ORIGINAL BYTES back. This is the round trip — escaped on the
     * way out, resolved by the parser on the way in — and it is a stronger statement than "no markup
     * appeared", because it also rules out an implementation that sanitised the value by dropping characters
     * from it.
     */
    expect(soleElement(root, 'g:id').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:product_type').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:brand').text).toBe(HOSTILE_TEXT);
    expect(soleElement(root, 'g:item_group_id').text).toBe(HOSTILE_TEXT);

    /*
     * `title` and `description` each occur TWICE in a one-item feed — once at channel level and once at item
     * level — so they are reached through their PARENT rather than by name across the whole tree. Doing that
     * is the point rather than a mechanical necessity: it asserts the two levels are still distinct elements
     * after a value tried to close one of them, which a whole-tree lookup could not show. The channel pair
     * carries the CLEAN host here, which is what keeps this document parseable at all.
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
     * ⭐ AND THE RAW SINKS IN THIS DOCUMENT CARRY LEGITIMATE VALUES, EMITTED VERBATIM — which is the parity
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
     * And the value really did travel — it is present in the raw text in its ESCAPED spelling, so none of
     * the assertions above passed because the datum was silently dropped. The double escape of the
     * already-escaped `&amp;` is visible here as `&amp;amp;`, and the `]]>` survives only because its `>`
     * became `&gt;`.
     */
    expect(xml).toContain('&lt;injected&gt;');
    expect(xml).toContain('&amp;amp;');
    expect(xml).toContain(']]&gt;');
    expect(xml).not.toContain('<injected>');
  });

  it('[NET-NEW] CQ-9 and SEC-2: the same hostile value at a RAW sink produces no document', async () => {
    /*
     * THE COMPANION TO THE ROUND TRIP ABOVE, AND THE REASON REVERSING G-3 LEAVES NOTHING OPEN.
     *
     * {@link HOSTILE_TEXT} carries `<`, a bare `&` and a literal `]]>` — every one of which the raw renderer
     * refuses. So at a raw sink the outcome is not a neutralised value but NO DOCUMENT, which is what
     * finding SEC-2 requires of a value that would otherwise poison the whole feed. {@link HOSTILE_HOST} is
     * driven too, because the host is the one value that reaches BOTH channel-level fields.
     */
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
     * THE NEGATIVE CONTROL, AND THE CLOSEST THING TO A DIRECT MEASUREMENT OF WHAT THE ESCAPING BUYS.
     *
     * Reversing the four substitutions reconstructs the document that would exist if the SIX legacy-escaped
     * sinks were emitted raw. The reversal is applied in the opposite order to the escape — `&amp;` LAST —
     * so that an `&amp;amp;` collapses to `&amp;` rather than to a bare `&`, exactly as a single un-escaping
     * pass over such output would.
     *
     * The scanner must refuse it. If it did not, every acceptance above would be worthless.
     *
     * ⚠️ THE HOST AND THE RAW SINKS ARE SEEDED CLEAN HERE, deliberately: under review finding CQ-9 they are
     * emitted raw, so a hostile value at any of them never reaches a document at all (it is refused) and
     * there would be nothing for this reversal to act on. The reversal therefore isolates the six sinks whose
     * escaping is the legacy's own behaviour.
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

/* =====================================================================================================
 * THE SHIPPED FEED WIRING — REVIEW FINDING F4
 *
 * Everything above this line asserts the SERIALIZER against hand-built records, which is what the
 * declared suite is for. It cannot, on its own, catch the defect F4 reported: the serializer's repeated
 * `g:additional_image_link` path was exhaustively covered while the PRODUCTION factory wired a reader
 * that answered `[]` for every product, so nothing that path emits could ever appear in a deployed feed.
 * A suite that only ever supplies its own records is blind to that by construction.
 *
 * ⭐ SO THESE CASES CROSS THE WIRING INSTEAD, THROUGH THE REAL COMPOSITION ROOT. `createCatalogContainer`
 * builds the graph and `createGoogleFeedHandlerFromContainer` builds the operation, both unmodified, with
 * only the four boundary collaborators this feed reaches substituted — the SmartList port that supplies
 * the records, and the setting, image-path and pricing ports the serializer holds. The record selection,
 * the serializer, the response shaping and the image reader are all the shipped ones.
 *
 * ⚠️ THE MODULES ARE REACHED BY `require` AFTER `process.env` IS SET, AND THAT IS FORCED RATHER THAN
 * PREFERRED. `src/config/container.ts` statically imports `src/config/env.ts`, which validates the
 * environment as a MODULE-LOAD side effect, and `src/config/database.ts`, which creates the `mysql2` pool
 * at module scope. A static import at the top of this file would therefore run both before any case
 * could set a variable. `createPool` is synchronous and opens no connection until one is checked out
 * (`src/config/database.ts` DECISION A), so no database exists, is contacted, or is needed anywhere
 * below — measured, not assumed: every case here passes with no server listening.
 *
 * ⛔ NO CLOCK IS FAKED AND NO TIMER IS INSTALLED. `createGoogleFeedHandlerFromContainer` wires the real
 * `FEED_RENDER_CLOCK`, so the two timestamp fields carry the wall clock. Nothing below asserts on them —
 * the timestamp contract is settled by the render-context cases above, which inject an instant — so the
 * suite keeps its no-fake-timers property (AAP §0.7.3 S6).
 * ================================================================================================== */

/** The handler module read as TEXT, for the source-level halves of the F4 assertions. */
const FEED_HANDLER_SOURCE_PATH = join(
  __dirname,
  '..',
  '..',
  'src',
  'handlers',
  'googleFeedHandler.ts',
);

/**
 * Every variable `src/config/env.ts` reads, cleared before each wiring case applies its own.
 *
 * Exhaustive on purpose: a value left behind by the ambient environment of the machine running the suite
 * could otherwise decide whether a case passes. The list is the same one
 * `src/config/env.ts` reads, and a variable added to the loader without being added here would surface as
 * a load failure naming itself rather than as a silent pass.
 */
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
]);

/**
 * A valid environment for the wiring cases.
 *
 * `GOOGLE_FEED_HOST` is {@link RENDER_HOST} so the absolute URLs the shipped handler composes are the
 * same {@link ABSOLUTE_URL_PREFIX} every other case in this file expects — the host is the ONE value the
 * handler reads from configuration, and matching it here is what lets a wiring case assert a full URL.
 * `DB_QUEUE_LIMIT` is `'1'` rather than `'0'` because the loader enforces a floor of 1.
 */
const FEED_WIRING_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'Slatwall',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'slatwall_pw',
  DB_TLS_MODE: 'disabled',
  DB_CONNECTION_LIMIT: '10',
  DB_QUEUE_LIMIT: '1',
  DB_CONNECT_TIMEOUT_MS: '10000',
  GOOGLE_FEED_HOST: RENDER_HOST,

  /*
   * ⭐ SEC-1 — THE ANONYMOUS ROUTE REQUIRES A STATED CEILING, SO THIS FIXTURE STATES ONE. The gate the
   * composition root builds refuses an UNBOUNDED anonymous materialisation, and `google:feed.product` is
   * the one anonymous address in the slice [`integrationServices/google/controllers/feed.cfc:L54-L56`].
   * Every case in this section drives the SHIPPED wiring, so a fixture that stated no ceiling would get a
   * `500` from the gate before the image semantics under test were ever reached — which is what a
   * deployment gets too, and is correct.
   *
   * ⛔ SO THE FIGURE IS THE FIXTURE'S, NOT A DEFAULT ANYWHERE IN THE SOURCE. `../../src/config/env.ts`
   * declares the variable OPTIONAL with no default (IR-12), and the gate's own behaviour — refusing when
   * nothing is stated, rendering when something is — is asserted by the two dedicated SEC-1 cases in the
   * handler section below rather than here. This value is only what lets these cases reach the serializer.
   */
  CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000',
});

/** The two shipped factories, loaded against {@link FEED_WIRING_ENVIRONMENT}. */
interface ShippedFeedWiring {
  readonly createCatalogContainer: (overrides?: CatalogContainerOverrides) => CatalogContainer;
  readonly createGoogleFeedHandlerFromContainer: (container: CatalogContainer) => GoogleFeedHandler;
}

/**
 * Load the composition root and the feed entry point with a valid environment in place.
 *
 * @returns the two shipped factories, freshly loaded
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

/**
 * Attach one image to `product` THROUGH the entity's own helper, and answer the association.
 *
 * ⭐ THE ELEMENT TYPE IS THE WHOLE REASON F4 HAS A BOUNDARY AT ALL. `Product.productImages` is typed
 * `ProductOwnedAssociation`, which declares ONLY `setProduct` and `removeProduct` — there is no path
 * member on it — so a reader can count a product's images and cannot read one. Building the element here
 * from that interface rather than from an image entity states the same fact in the test.
 *
 * ⚠️ THE OWNING SIDE REGISTERS, WHICH IS WHY A NO-OP ASSOCIATION WOULD PROVE NOTHING.
 * `Product.addProductImage` is a bare `productImage.setProduct(this)`, faithful to
 * `model/entity/Product.cfc:L688-L690`, so the ENTITY never touches its own collection: it is the
 * association's `setProduct` that appends. A first draft of this helper returned two empty mutators, and
 * the collection stayed empty through two `addProductImage` calls — which read as a source defect and was
 * this harness misdescribing the legacy relationship.
 */
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

/**
 * Run `operation` and answer whatever it threw, or `undefined` when it returned.
 *
 * Needed because `loadShippedFeedWiring` resets the module registry, which gives the container graph its
 * own class objects — so a refusal has to be asserted on its observable identity rather than with
 * `toThrow(SomeClass)`. See the case that uses it.
 */
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

describe('NET-NEW ProductFeedBuilder — the shipped feed wiring (F4)', () => {
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

  it('[NET-NEW] the shipped factory publishes the container reader images as repeated elements in input order (F4)', async () => {
    const scenario = createScenario();
    scenario.smartList.enqueue({ kind: 'page', metrics: {}, records: [scenario.sku] });

    /*
     * FOUR IMAGES, DELIBERATELY NOT SORTED AND DELIBERATELY CARRYING A REPEAT. The order is third,
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
     * ⭐ THE ASSERTION F4 ASKED FOR. Four elements, each carrying its OWN resized path, in the exact
     * order the reader returned them. The predecessor wiring produced ZERO of these for any input.
     */
    expect(additionalImageElements(xml)).toStrictEqual([
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${THIRD_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${SECOND_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
      `<g:additional_image_link>${ABSOLUTE_URL_PREFIX}${FIRST_ADDITIONAL_IMAGE_PATH}</g:additional_image_link>`,
    ]);

    /* The reader was consulted once, with the SKU the port selected — not with the product, and not
     * once per image. `product.cfm:L24` reaches the collection through the SKU it is rendering. */
    expect(readerSubjects).toStrictEqual([scenario.sku]);

    /* Every image the reader yielded was resolved through `ImagePathPort`, which is the other half of
     * F4's resolution: the reader supplies paths, the port resizes them. Five resize calls in all — one
     * for the SKU's own image and one per additional image. */
    expect(resizeRequests(scenario.images).map((request) => request.imagePath)).toStrictEqual([
      SKU_COMPOSED_IMAGE_PATH,
      THIRD_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
      SECOND_ADDITIONAL_IMAGE_PATH,
      FIRST_ADDITIONAL_IMAGE_PATH,
    ]);
  });

  it('[NET-NEW] the shipped default answers an empty list for a product whose image collection is empty (F4)', async () => {
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
     * ⭐ `[]` IS THE LEGACY OUTPUT HERE, WHICH IS WHY IT IS NOT A FABRICATION.
     * `integrationServices/google/views/feed/product.cfm:L24` emits one element per entry, so an empty
     * collection emits none — and this is the ONLY input for which the empty answer is the truthful one.
     */
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<g:image_link>');
    expect(response.body).not.toContain('<g:additional_image_link');
  });

  it('[NET-NEW] the shipped default REFUSES a product that carries images rather than reporting none (F4)', async () => {
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
     * ⭐ THE WHOLE OF FINDING F4, AS ONE ASSERTION. The predecessor wiring answered 200 with a complete,
     * well-formed, entirely plausible feed in which both images had silently vanished. The shipped
     * wiring answers the boundary refusal instead, so an operator learns that a boundary was reached
     * rather than publishing a product's images as absent.
     */
    expect(response.statusCode).toBe(501);
    expect(response.body).toContain('This operation is not implemented');

    /* AND NOTHING PARTIAL IS PUBLISHED. The document is built whole or not at all, so no envelope, no
     * channel and no item reaches the body. */
    expect(response.body).not.toContain('<rss');
    expect(response.body).not.toContain('<item>');
    expect(response.body).not.toContain('<g:additional_image_link');

    /* The refusal discloses no member identifier and no locator — that is `errorResponse`'s rule, and it
     * holds for this boundary exactly as it does for the five ports beside it. */
    expect(response.body).not.toContain('ProductFeedImageReader');
    expect(response.body).not.toContain('model/entity/Image.cfc');
  });

  it('[NET-NEW] the shipped default reader answers each of its three inputs directly (F4)', () => {
    const scenario = createScenario();

    const wiring = loadShippedFeedWiring();
    const readProductImages = wiring.createCatalogContainer({
      smartListQueryPort: scenario.smartList.smartList,
      settings: scenario.settings.resolver,
      imagePaths: scenario.images.imagePaths,
      pricing: scenario.pricing.pricing,
    }).productFeedImages;

    /* 1. NO PRODUCT — `[]`, deliberately not a refusal. `ProductFeedBuilder.requireProduct` already
     *    raises for such a record, reproducing the legacy null dereference at `product.cfm:L18`, so
     *    raising here too would put the same rule on both sides of a layer boundary and would replace a
     *    message that names the SKU with one that does not. */
    expect(readProductImages(buildSku({ skuID: SKU_ID, skuCode: 'NO-PRODUCT-1' }))).toStrictEqual(
      [],
    );

    /* 2. A PRODUCT WITH NO IMAGES — `[]`, which is the legacy output for that product. */
    expect(readProductImages(scenario.sku)).toStrictEqual([]);

    /* 3. A PRODUCT THAT CARRIES ONE IMAGE — a refusal, on the very first image.
     *
     * ⚠️ `toThrow(NotImplementedError)` IS DELIBERATELY NOT USED, AND THE REASON IS THE LOADER RATHER
     * THAN THE ERROR. `loadShippedFeedWiring` calls `jest.resetModules()`, so the container's graph holds
     * a FRESHLY REQUIRED `src/errors/DomainError` whose class object is not the one this file imported
     * statically — the constructor check fails with the memorable "Expected constructor:
     * NotImplementedError / Received constructor: NotImplementedError". `test/config/env.test.ts` records
     * the same finding for its own configuration error. The assertions below are therefore on the
     * observable identity: the class NAME, which `src/errors/DomainError.ts:L407` sets from
     * `new.target.name`, the refusing MEMBER, and the diagnostic text. */
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

  it('[NET-NEW] the shipped factory takes its reader from the container and declares no constant-empty reader (F4)', () => {
    const source = partitionBuilderSource(readFileSync(FEED_HANDLER_SOURCE_PATH, 'utf8'));

    /*
     * The wiring itself, in CODE rather than in a comment — and the literal is the whole expression, which
     * asserts TWO settled facts at once: the reader's only source is the composition root, and a caller's
     * `overrides.readProductImages` takes precedence over it. An earlier revision searched for
     * `readProductImages: container.productFeedImages` alone, before the override slot existed; matching the
     * shorter literal would now pass while silently permitting the slot's removal.
     */
    expect(
      codeOffsetsOf(source, 'overrides?.readProductImages ?? container.productFeedImages'),
    ).toHaveLength(1);

    /*
     * ⛔ AND NO READER IS DECLARED IN THIS FILE AT ALL. The defect was a module-scope
     * `const readNoProductImages: ProductFeedImageReader = () => [];`, so the check is that NOTHING in
     * the executable text binds a value of that type. The withdrawal note above the factory QUOTES the
     * deleted line verbatim, which is exactly why the search is over code spans only — a whole-text
     * `not.toContain` would report the documentation as the defect.
     */
    const executableText = spanText(source, source.codeSpans);
    expect(executableText).not.toContain('readNoProductImages');
    expect(/:\s*ProductFeedImageReader\s*=/.test(executableText)).toBe(false);
    expect(/readProductImages:\s*\(\s*\)\s*=>/.test(executableText)).toBe(false);

    /* The withdrawal IS documented, so a later revision cannot quietly restore the constant reader
     * without contradicting the file it lives in. */
    const commentText = spanText(source, source.commentSpans);
    expect(commentText).toContain('THERE IS NO `readNoProductImages`');
    expect(commentText).toContain('REVIEW FINDING F4');
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/integrations/ProductFeedQuery.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5, F7)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/integrations/ProductFeedQuery.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. The feed splits three ways and this is the second of the three: `ProductFeedQuery` composes the
 * selection `integrationServices/google/controllers/feed.cfc:L49-L74` describes, and this file serializes
 * what it selects. The host's own header used to record the joins and filters as "commentary, not asserted
 * here"; folding the query's cases in is what makes them asserted, which is half of review finding F7.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * Google product-feed record selection — INT-01.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/ProductFeedQuery.ts` and the two layers its declaration has to survive:
 * `translateSmartListInput` in `src/ports/SmartListQueryPort.ts`, and the SQL emitter in
 * `src/adapters/mysql/SmartListQueryBuilder.ts`.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * `integrationServices/google/controllers/feed.cfc:L63-L72` makes SEVEN additions to the SKU smart
 * list: three related-property joins (`:L64-L66`), three equality filters (`:L68-L70`) and one range
 * (`:L72`). Before this fix the four DATA additions crossed into the target and THE THREE JOINS DID
 * NOT — they were transcribed into an exported constant and then never handed to anything, so the
 * emitted SQL named neither the product's default SKU nor its brand. The feed's own field mapping reads
 * both.
 *
 * The cases below assert the three things that have to hold for that to be genuinely fixed rather than
 * merely plumbed:
 *
 *   1. the transcription still matches `feed.cfc:L64-L66` exactly — right pairs, right order, and the
 *      `left` kind on the brand join present while the other two omit the kind entirely;
 *   2. all seven additions arrive in ONE call, and the three joins land AFTER the three the SKU service
 *      declares for every smart list, because two of the feed's name `SlatwallProduct` as their parent
 *      and that entity is in the registry only because a service join put it there;
 *   3. the joins reach the emitted statement, the duplicated one is absorbed rather than doubled, and
 *      nothing renders as an inner join — an inner join on brand would silently drop every brandless
 *      product out of a merchant feed.
 *
 * ⚠️ EVERY JOIN RENDERS AS `LEFT JOIN`, AND THAT IS THE LEGACY BEHAVIOUR RATHER THAN A BUG IN THESE
 * ASSERTIONS. `org/Hibachi/HibachiSmartList.cfc:L212` defaults the join kind to the EMPTY STRING and
 * `:L537-L540` rewrites an empty kind to `left`, so an omitted kind and an explicit `left` emit the same
 * keyword. Asserting that no statement contains `INNER JOIN` is therefore the assertion that carries
 * the meaning here: it is what proves no row can be eliminated by any of the six joins.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, exactly as the sibling
 * adapter suites do: no CFML runtime exists here and the `Sw*` tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * feed controller at all, and AAP §0.8.3.7 requires that absence to be flagged rather than implied away.
 */
describe('test/integrations/ProductFeedQuery.test.ts — the feed record SELECTION — the three joins, the three filters and the QATS range (folded, F1, F5, F7)', () => {
  /* ⛔ AN `UNREACHED_COLLABORATOR` SENTINEL STOOD HERE — `{} as never`, the discipline
   * `test/services/SkuService.test.ts` established for a collaborator that must exist to construct a
   * subject but is never called. It filled nine of the ten constructor positions of the real `SkuService`
   * the old harness built. With the service off this path there is nothing left to fill: the subject takes
   * ONE collaborator, and every case supplies a live one. */

  /** Distinct 32-character identifiers, so a crossed association is visible rather than coincidental. */
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

  /**
   * Builds a `ProductFeedQuery` over a live query port.
   *
   * ⭐ IT NO LONGER CONSTRUCTS A `SkuService`, AND THE REASON IS THE SUBJECT OF THIS FILE'S OWN FINDING.
   * The harness used to build a REAL nine-collaborator service with only the smart-list port live and hand
   * that service to the integration, because the base list — the root entity, the three service joins and
   * the five keyword properties — travelled through `getSkuSmartList`. `ProductFeedQuery` now composes that
   * base list from `src/ports/SmartListQueryPort.ts`, the same module the service composes through,
   * and executes it through `SmartListQueryPort.executeRecords`. So the chain this file exists to protect
   * is UNCHANGED IN SUBSTANCE — the feed's declaration still has to survive the service's base list, the
   * shared translator and the SQL emitter — while the link that carried it is one module rather than a
   * service instance. Nine sentinel arguments and a positional-drift hazard go with it.
   *
   * ⚠️ WHICH MEANS THE INHERITANCE CLAIM STILL NEEDS PROVING, AND IT IS PROVED THE SAME WAY: the cases
   * below read the DESCRIPTION the port received and assert that the service's three joins and five keyword
   * properties are in it without the integration restating any of them.
   */
  function makeFeedQuery(port: SmartListQueryPort): ProductFeedQuery {
    return new ProductFeedQuery(port);
  }

  /**
   * A port that records the description it was handed, WITH THE MEMBER THAT RECEIVED IT, and answers with
   * an empty result.
   *
   * ⚠️⚠️ THE TWO MEMBERS RECORD SEPARATELY, AND THAT SEPARATION IS ITSELF A REVIEW FINDING. They used to
   * push into ONE list, on the reasoning that every case here asserts on the DESCRIPTION the feed composed
   * rather than on which reading issued it. That reasoning left this suite unable to detect the difference
   * that matters most on this path: `execute` materialises all three legacy views — the unpaged records, the
   * current page and a `COUNT(*)` — while `executeRecords` materialises the unpaged collection alone, which
   * is the one view `integrationServices/google/views/feed/product.cfm:L16` loops. A revision that routed
   * the feed back through the three-view reading would have issued a count on every request and a paged
   * statement past the first page, and every case in this file would still have passed. Recording the member
   * makes that regression a failing test.
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

  /**
   * A recording executor over a tiny table store that honours `WHERE <column> IN (…)`.
   *
   * The table is read from the statement's FIRST `FROM`, so the root projection's own joins cannot be
   * mistaken for the table it selects from. Honouring the `IN` form matters for the same reason it does
   * in `test/adapters/catalogAggregates.test.ts`: two different statements read `SwSku` on this path — the
   * feed's record projection and the aggregate loader's default-SKU lookup by identifier — and a double
   * that answered both with the same rows would hand the lookup rows it never asked for.
   */
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

  /** Every row the feed's records and their aggregate need. Money columns are strings (F16). */
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

  describe('the feed joins transcribed from feed.cfc:L64-L66 (INT-01)', () => {
    it('NET-NEW — the three pairs are transcribed exactly, in source order', () => {
      /* Spelled out rather than compared against itself, so a drift in the constant is a failing
       * assertion rather than a self-consistent one. */
      expect(PRODUCT_FEED_JOINS).toEqual([
        // feed.cfc:L64 — a deliberate duplicate of model/service/SkuService.cfc:L314.
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
        // feed.cfc:L65 — `defaultSku`, NOT a second `product` join.
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
        // feed.cfc:L66 — the one call that states a kind.
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
      ]);
    });

    it('NET-NEW — the first two OMIT the join kind rather than spelling it inner', () => {
      /* org/Hibachi/HibachiSmartList.cfc:L212 defaults the kind to the empty string, and :L537-L540
       * rewrites empty to `left`. Writing `inner` here would be a behaviour change wearing a cleanup's
       * clothes, so absence is asserted as absence. */
      expect(PRODUCT_FEED_JOINS[0]).not.toHaveProperty('joinType');
      expect(PRODUCT_FEED_JOINS[1]).not.toHaveProperty('joinType');
      expect(PRODUCT_FEED_JOINS[2]?.joinType).toBe('left');
    });

    it('NET-NEW — the sequence and every entry are frozen, so no invocation can rewrite them', () => {
      /* Module-scope state on a warm container is M7's concern; a frozen constant is the answer. */
      expect(Object.isFrozen(PRODUCT_FEED_JOINS)).toBe(true);
      for (const join of PRODUCT_FEED_JOINS) {
        expect(Object.isFrozen(join)).toBe(true);
      }
    });
  });

  describe('all seven feed additions arrive in one described query (INT-01)', () => {
    it('NET-NEW — the query carries SIX joins: the service’s three, then the feed’s three', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      expect(queries).toHaveLength(1);
      /* ORDER IS THE ASSERTION. The controller cannot add to a smart list it does not hold, so
       * model/service/SkuService.cfc:L314-L316 has always run before feed.cfc:L64-L66 — and it has to be
       * that way round, because feed joins #2 and #3 name `SlatwallProduct`, which the service's first
       * join is what registers. */
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

      /* feed.cfc:L64 repeats model/service/SkuService.cfc:L314 verbatim. Collapsing it here would be a
       * repair; the adapter absorbs it instead, and proves against
       * org/Hibachi/HibachiSmartList.cfc:L258 and :L269 that the legacy absorbs it too. */
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
        // feed.cfc:L68-L70. The value is the NUMBER 1, as all three legacy call sites pass it.
        { propertyIdentifier: 'activeFlag', value: 1 },
        { propertyIdentifier: 'product.activeFlag', value: 1 },
        { propertyIdentifier: 'product.publishedFlag', value: 1 },
      ]);
      /* feed.cfc:L72 — `1^` is a LOWER bound with no upper bound, per
       * org/Hibachi/HibachiSmartList.cfc:L642-L646. */
      expect(group?.ranges).toEqual([
        { propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' },
      ]);
    });

    it('NET-NEW — the service’s five keyword properties are inherited, not re-derived by the feed', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /* model/service/SkuService.cfc:L318-L322, all at weight 1. The feed layers onto the service's
       * smart list rather than replacing it, so these arrive without the integration restating them. */
      expect(queries[0]?.keywordProperties).toHaveLength(5);
      expect(queries[0]?.entityName).toBe('SlatwallSku');
    });

    it('NET-NEW — the selection is executed ONCE, records-only, with no count and no page read', async () => {
      const { port, queries, reads } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /*
       * ⭐ THE FINDING THIS CASE EXISTS FOR (PERF-02). `integrationServices/google/views/feed/product.cfm:L16`
       * loops the smart list's RECORDS and reads no page and no count in its 66 lines, and the legacy
       * framework materialises each view only on first read of that view
       * [org/Hibachi/HibachiSmartList.cfc:L751-L755, :L759-L764, :L771] — so the legacy feed issues exactly
       * ONE statement. An earlier revision reached the selection through `SkuService.getSkuSmartList`, which
       * answers all three views, so the port materialised a `COUNT(*)` on every request and a paged
       * statement too whenever the selection exceeded one page — neither ever read.
       *
       * ⚠️ AND NOTHING IN THIS SUITE COULD SEE IT, which is why the assertion is on the MEMBER and not only
       * on the count of descriptions. The capturing port recorded both readings into one list, so a
       * regression to the three-view reading would have left every other case here green.
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
       * IDENTITY, NOT EQUALITY. `SmartListQueryPort.executeRecords` answers a MUTABLE array built for this
       * caller, so the previous `[...selection.records]` spread — needed only because
       * `SmartListResult.records` is `readonly` — was a full shallow copy of every published SKU in the
       * catalog on every feed request. Asserting identity is what keeps that copy from coming back: an
       * equality assertion would pass with the spread reinstated.
       *
       * ⛔ AND THE THREE-VIEW READING THROWS ON THIS PORT RATHER THAN ANSWERING, so this case doubles as a
       * second guard on the member: reaching `execute` fails loudly instead of returning a plausible empty
       * result.
       */
      expect(feed).toBe(rows);
    });

    it('NET-NEW — no ordering, paging, keyword or saved state is invented', async () => {
      const { port, queries } = makeCapturingPort();

      await makeFeedQuery(port).getFeedSkus();

      /* feed.cfc:L63 passes nothing at all, so a default here would change every one of the six
       * in-repository callers invisibly. */
      expect(queries[0]?.orders).toBeUndefined();
      expect(queries[0]?.pagination).toBeUndefined();
      expect(queries[0]?.keywords).toBeUndefined();
    });
  });

  describe('the feed joins reach the emitted statement (INT-01)', () => {
    function runFeed(): {
      /* The feed reads the unpaged collection alone, so this is the records array rather than the
       * three-view result — see `ProductFeedQuery.getFeedSkus`, which executes the shared SKU selection
       * through `SmartListQueryPort.executeRecords`. */
      readonly result: Promise<Sku[]>;
      readonly statements: Statement[];
    } {
      const { executor, statements } = makeRecordingExecutor(FEED_TABLES);
      const builder = new SmartListQueryBuilder(
        executor,
        createCatalogAggregateLoaders({ bindDefaultSkuDelegate: bindDelegate }),
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

      /* The assertion that carries the meaning. An omitted kind and an explicit `left` emit the same
       * keyword (org/Hibachi/HibachiSmartList.cfc:L537-L540), so the observable guarantee is the absence
       * of an eliminating join rather than the presence of the word `left` on one of the six. */
      for (const statement of statements) {
        expect(statement.sql).not.toContain('INNER JOIN');
      }
      expect(statements[0]?.sql).toContain('LEFT JOIN SwBrand');
    });

    it('NET-NEW — the six declared joins emit FIVE, because the duplicate is absorbed', async () => {
      const sql = await recordsSql();

      /* org/Hibachi/HibachiSmartList.cfc:L269 finds the key already registered and appends nothing, so
       * the repeated `("SlatwallSku","product")` contributes no entity, no alias and no FROM fragment. */
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

      /* Three equality predicates bound to the number 1, then the inclusive lower bound. The bound value
       * is the STRING `1`: it is the first element of the two-character range value, carried as the
       * legacy carries it rather than coerced. */
      expect(statements[0]?.params).toEqual([1, 1, 1, '1']);
      expect(statements[0]?.sql).toContain('>= ?');
      for (const statement of statements) {
        expect(statement.sql).not.toContain("'");
        expect(statement.sql).not.toContain(ID.product);
      }
    });

    it('NET-NEW — the emitted statements include NO count query, which is what the legacy issues', async () => {
      const { result, statements } = runFeed();
      await result;

      /*
       * ⭐ THE SQL-LEVEL HALF OF THE PERF-02 GUARD. The case in the previous section proves the feed calls
       * the records-only PORT MEMBER; this one proves what that means at the driver: not one statement in
       * the emitted set projects `recordsCount`, and none carries a `LIMIT`/`OFFSET` page window. The
       * legacy feed reads `getRecords()` alone and the framework materialises a view only on first read
       * [org/Hibachi/HibachiSmartList.cfc:L751-L755, :L771], so a count on this path would be work the
       * system being replaced never does.
       *
       * ⚠️ THE SECOND STATEMENT IS NOT A COUNT AND IS NOT WASTE. `src/adapters/mysql/SmartListQueryBuilder.ts`
       * resolves the roots' product aggregates in ONE batched read per association set, which is what makes
       * `sku.product.brand` navigable for `ProductFeedBuilder`; the case below asserts that navigation.
       */
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement.sql).not.toContain('recordsCount');
        expect(statement.sql).not.toContain('LIMIT');
        expect(statement.sql).not.toContain('OFFSET');
      }
    });

    it('NET-NEW — the feed’s records carry their product aggregate, so the builder can shape them', async () => {
      const { result } = runFeed();
      const feed = await result;

      /* The other half of the feed's contract: `ProductFeedBuilder` reads `sku.product`, then that
       * product's `productType`, `brand` and — through `getPrice()` — its `defaultSku`. */
      expect(feed).toHaveLength(2);
      const first = feed[0];
      expect(first).toBeInstanceOf(Sku);
      expect(first?.product).toBeDefined();
      expect(first?.product?.productType?.productTypeID).toBe(ID.productType);
      expect(first?.product?.brand?.brandID).toBe(ID.brand);
      expect(first?.product?.defaultSku?.getPrice()).toBe(toExactDecimal('99.00'));
      /* '99.00', not 99: F07 preserves the digits AND the scale the row carried — the fixture row spells
       * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type. */
    });
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/integrations/GoogleIntegration.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/integrations/GoogleIntegration.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. The third of the feed's three parts. AAP §0.6.4 makes the point this fold makes physical: the
 * integration component carries NO feed logic, so its stub is nearly empty by faithfulness, and reading it
 * beside the builder that carries the real work is what stops a reviewer expecting the logic there.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * The Google integration stub — INT-05.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/GoogleIntegration.ts`, whose legacy origin is
 * `integrationServices/google/Integration.cfc:L49-L79` (AAP §0.4.1.10).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE — AND WHY THE SUBJECT IS ALMOST EMPTY
 * =================================================================================================
 * AAP §0.6.4 records the counter-intuitive finding this whole file rests on: the interface-conformant
 * component carries NO FEED LOGIC AT ALL. The record selection lives in
 * `integrationServices/google/controllers/feed.cfc` and the field mapping lives in
 * `integrationServices/google/views/feed/product.cfm`, so a faithful stub is nearly empty BY
 * FAITHFULNESS rather than by neglect (AAP §0.6.4.3, §0.8.3.3). A reviewer expecting the integration
 * class to hold the feed should read that section first; the two files that do hold it are covered by
 * `ProductFeedQuery.test.ts` and `ProductFeedBuilder.test.ts`.
 *
 * What the legacy component DOES declare, in its own declaration order, is six members:
 * `init` (`:L51`), `getIntegrationTypes` (`:L55`), `getDisplayName` (`:L59`), `getSettings` (`:L63`),
 * `getIntegratedSettings` (`:L67`) and `getSettingOptions` (`:L73`). Note the order: the component
 * declares `getIntegrationTypes` BEFORE `getDisplayName`, which is the reverse of the interface at
 * `integrationServices/IntegrationInterface.cfc:L56-L63`. The port keeps the component's order, and
 * that is asserted rather than tidied.
 *
 * Five claims carry the weight:
 *
 *   1. THE OVERRIDES TOOK. `getIntegrationTypes()` is `'fw1'` and `getDisplayName()` is `'Google'`.
 *      The display name is additionally asserted NOT to be the base default `'Not Defined'`, because
 *      an override that silently failed to bind would return the default and every positive assertion
 *      about "a string" would still pass.
 *   2. THE INHERITANCE IS REAL. `getEventHandlers()` and `getAdminNavbarHTML()` are NOT declared on
 *      this component and must still answer the base defaults, so they are asserted here as inherited
 *      AND asserted absent from this class's own prototype.
 *   3. `getSettings()` AND `getIntegratedSettings()` ARE NOT THE SAME MEMBER. `:L63` returns an empty
 *      struct while `:L67` returns exactly one descriptor. Conflating them would be an easy and
 *      invisible port error, so each is asserted against the other.
 *   4. DEFECT D11 IS CARRIED, NOT CORRECTED. `:L49` carries the component attribute
 *      `displayname="USA epay"` — a copy-paste artefact from the payment adapter this file was cloned
 *      from. AAP §0.6.7.6 records it as recorded-not-corrected, because the EFFECTIVE display name
 *      comes from the method. The assertion is therefore twofold: the method returns `'Google'`, and
 *      the string `'USA epay'` has no behavioural expression anywhere in the ported surface. The
 *      marker itself lives at `GoogleIntegration.ts:188`.
 *   5. `getSettingOptions` RETURNS NOTHING, FOR EVERY INPUT. `:L73-L77` opens
 *      `if(arguments.settingName eq "productGoogleProductType") { }` — an EMPTY branch — and then ends
 *      with NO return statement at all. The port preserves the empty branch, so the seeded name and an
 *      unrelated name are indistinguishable from outside. Two unnumbered `TODO(parity)` notes travel
 *      with it: the declared return type admits an array the body can never produce, and CFML's `eq`
 *      is case-insensitive where TypeScript's `===` is not — a difference with no observable effect
 *      precisely BECAUSE the branch is empty. Both are asserted as they behave (AAP §0.8.2 g4).
 *
 * NO DATABASE, NO NETWORK, NO CREDENTIAL, NO LIVE GOOGLE CALL. AAP §0.8.3.3 forbids a live call and
 * the subject introduces no HTTP client, so a case below sweeps every returned value for an endpoint,
 * a credential or an OAuth token and asserts none appears. The subject has no collaborators and no
 * constructor parameters, so every case constructs it directly.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * Google adapter, and AAP §0.8.3.7 requires that absence to be flagged explicitly rather than implied
 * away. TRACEABILITY HERE IS DOCUMENTARY, NEVER EMPIRICAL: MXUnit and CFSelenium are not vendored
 * (`meta/tests/readme.txt:L4-L5`), `meta/docker/slatwall-local-dev/` does not exist, and no CFML
 * runtime is reproducible in this environment, so the legacy suite was read rather than run
 * (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. This component's six members and its relationship to the base. The five-member contract
 * boundary belongs to `IntegrationContract.test.ts`, the base defaults to `BaseIntegration.test.ts`,
 * the feed selection to `ProductFeedQuery.test.ts` and the serialization to
 * `ProductFeedBuilder.test.ts`.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.
describe('test/integrations/GoogleIntegration.test.ts — the interface-conformant STUB, which carries no feed logic at all (folded, F1, F5)', () => {
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

  /** `:L61` — the effective display name, which is the method's answer and not the `:L49` attribute. */
  const LEGACY_DISPLAY_NAME = 'Google';

  /** `:L49` — defect D11's copy-paste artefact. Asserted ABSENT from behaviour, never repaired. */
  const D11_COPY_PASTE_ARTEFACT = 'USA epay';

  /** `:L55` on the base — the default the override must be seen to displace. */
  const BASE_DISPLAY_NAME_DEFAULT = 'Not Defined';

  /** `:L68` — the sole integrated setting, and the name `getSettingOptions` tests against at `:L74`. */
  const INTEGRATED_SETTING_NAME = 'productGoogleProductType';

  /** `:L68` — the descriptor's only member and its value. */
  const INTEGRATED_SETTING_FIELD_TYPE = 'select';

  /** Reads a constructor's own prototype methods in declaration order, constructor excluded. */
  function prototypeMembersOf(constructorFunction: typeof GoogleIntegration): readonly string[] {
    return Object.getOwnPropertyNames(constructorFunction.prototype).filter(
      (name) => name !== 'constructor',
    );
  }

  /**
   * Every string the ported surface can emit, joined for the two sweeps below.
   *
   * `getSettingOptions` is excluded deliberately: it returns `undefined` for every input, so it emits no
   * string at all, and the cases that own it assert exactly that.
   */
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

  describe('NET-NEW GoogleIntegration — the prototype shape and the inheritance (INT-05)', () => {
    it('[NET-NEW] declares the six members in the google/Integration.cfc order, types before name', () => {
      /*
       * `:L51`, `:L55`, `:L59`, `:L63`, `:L67`, `:L73`. The component declares `getIntegrationTypes` second
       * and `getDisplayName` third, the reverse of the interface at IntegrationInterface.cfc:L56-L63. The
       * port follows the COMPONENT, and asserting the order keeps a side-by-side reading honest.
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
       * must therefore be INHERITED rather than re-declared — a port that copied them down would satisfy
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

  describe('NET-NEW GoogleIntegration — the four overridden members (INT-05)', () => {
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

  describe('NET-NEW GoogleIntegration — getIntegratedSettings, the one member with content (INT-05)', () => {
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
       * `:L68` builds both objects as literals, so both are new on every call. The NESTED object is asserted
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

      /* The adversarial half — `Object.assign` mutates in place, with no cast and no assertion operator. */
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

  describe('NET-NEW GoogleIntegration — getSettingOptions returns nothing, for every input (INT-05)', () => {
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
       * This is the ONE member in the whole folder that takes an argument, which is why
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
       * INDISTINGUISHABLE from outside. That is the carried behaviour, and it is what makes the second
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

  describe('NET-NEW GoogleIntegration — carried defect D11 and the absent live-Google surface (INT-05)', () => {
    it('[NET-NEW] carries D11 without correcting it: the method answers Google, the attribute is inert', () => {
      const subject = new GoogleIntegration();

      /*
       * Defect D11 — `google/Integration.cfc:L49` carries `displayname="USA epay"`, a copy-paste artefact
       * from the payment adapter this component was cloned from. AAP §0.6.7.6 records it as
       * recorded-not-corrected because the EFFECTIVE display name comes from the method at `:L59`. The port
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
       * that `mysql2` is the ONLY runtime dependency, so there is nothing here that could reach the network.
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

/* =====================================================================================================
 * FOLDED IN FROM `test/integrations/BaseIntegration.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/integrations/BaseIntegration.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. `BaseIntegration` supplies the defaults `GoogleIntegration` inherits, so it belongs with the stub that
 * inherits them — which is now in this file.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * The base integration's default implementations — INT-04.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/BaseIntegration.ts`, whose legacy origin is
 * `integrationServices/BaseIntegration.cfc:L49-L73` (AAP §0.4.1.10).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The legacy base declares SIX members where the interface declares five: `init` (`:L51`),
 * `getDisplayName` (`:L55`), `getIntegrationTypes` (`:L59`), `getSettings` (`:L63`),
 * `getEventHandlers` (`:L67`) and — beyond the contract — `getAdminNavbarHTML` (`:L71`). Every one is
 * a default an adapter may leave alone, so each default VALUE is observable behaviour rather than
 * incidental initialisation, and every one is asserted as an exact literal.
 *
 * Four properties carry the weight here:
 *
 *   1. THE HIBACHI BASE CLASS IS GONE. `BaseIntegration.cfc:L49` reads
 *      `component extends="Slatwall.org.Hibachi.HibachiObject"`. AAP §0.8.3.2 is unambiguous that
 *      nothing from `org/Hibachi/` is ported or depended upon, so the ported class must extend
 *      NOTHING. That is asserted directly off the prototype chain, which is the only place a dropped
 *      base class can be observed once the file compiles.
 *   2. `init()` RETURNS THE INSTANCE. `:L51-L53` is `return this;`. Identity is asserted with `toBe`,
 *      not equality, because a base that returned a copy would satisfy `toEqual` and still break the
 *      `getIntegration().init()` chaining idiom the legacy factory relies on.
 *   3. THE MUTABLE DEFAULTS ARE FRESH PER CALL. `:L63` and `:L67` return a literal `{}` and a literal
 *      `[]`. A port that hoisted either to a shared module-scope constant would pass every value
 *      assertion and then leak one integration's mutation into the next — a genuine hazard under AAP
 *      §0.6.6 M7, where module scope is the ONLY thing that survives between Lambda invocations on a
 *      warm container. Freshness is therefore proven ADVERSARIALLY: the first result is poisoned, and
 *      the next call must still be clean.
 *   4. THE DEFAULTS ARE MUTABLE, AND DELIBERATELY SO. CFML's `{}` and `[]` are ordinary mutable
 *      values, so the port neither freezes nor deep-clones them. That is asserted rather than left
 *      implicit, because inventing immutability the legacy did not have is exactly the kind of quiet
 *      "improvement" AAP §0.8.2 guideline 4 forbids.
 *
 * NO DATABASE, NO NETWORK, NO FILESYSTEM. The subject is a six-method class with no collaborators, no
 * constructor parameters and no I/O, so every case constructs it directly. Member ORDER is read off
 * `BaseIntegration.prototype` rather than out of the source text, because a class body defines its
 * methods on the prototype in declaration order and that makes the claim observable from a value.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * base integration, and AAP §0.8.3.7 requires that absence to be flagged explicitly rather than
 * implied away. TRACEABILITY HERE IS DOCUMENTARY, NEVER EMPIRICAL: MXUnit and CFSelenium are not
 * vendored (`meta/tests/readme.txt:L4-L5`), `meta/docker/slatwall-local-dev/` does not exist, and no
 * CFML runtime is reproducible in this environment, so the legacy suite was read rather than run
 * (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. The base class's own six defaults and its prototype shape. The five-member contract boundary
 * belongs to `IntegrationContract.test.ts`; the Google overrides belong to
 * `GoogleIntegration.test.ts`; no feed selection, serialization or handler behaviour appears here.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.
describe('test/integrations/BaseIntegration.test.ts — the default implementations the stub inherits (folded, F1, F5)', () => {
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

  /**
   * A subclass that overrides nothing at all.
   *
   * AAP §0.4.3.3 replaces template-method inheritance with composition for the SERVICE layer, but the
   * integration base is an inheritance point in the legacy design and stays one here — `google/
   * Integration.cfc:L49` extends it. This class is the check that the defaults are genuinely inherited
   * rather than re-declared per adapter: if `BaseIntegration` ever stopped supplying one, an adapter
   * that overrides nothing would start returning `undefined` and the cases below would catch it.
   */
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

  describe('NET-NEW BaseIntegration — the prototype shape (INT-04)', () => {
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
        /* `in` rather than an own-property check, because inheritance is the point of this case. */
        expect(name in subject).toBe(true);
      }

      expect(prototypeMembersOf(InheritingIntegration)).toEqual([]);
      expect(subject).toBeInstanceOf(BaseIntegration);
    });
  });

  describe('NET-NEW BaseIntegration — the six default values (INT-04)', () => {
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
         * `GoogleIntegration.test.ts` asserts the Google adapter does NOT return it, which only proves the
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

        /* `:L67-L69`. Empty, and an array rather than the ColdSpring XML string the stale hint describes. */
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
      /* Reachable at runtime, and off the contract at compile time — both halves are the intent. */
      expect(typeof subject.getAdminNavbarHTML).toBe('function');
    });
  });

  describe('NET-NEW BaseIntegration — the mutable defaults are fresh per call (INT-04)', () => {
    it('[NET-NEW] hands back a different struct on every getSettings call', () => {
      const subject = new BaseIntegration();

      /*
       * `:L64` returns a LITERAL `{}`. A port that hoisted it to a module-scope constant would satisfy every
       * value assertion above and still share one object across every integration and — under AAP §0.6.6 M7
       * — across every invocation on a warm Lambda container, because module scope is the only thing that
       * survives. Reference inequality is the assertion that rules that out.
       */
      expect(subject.getSettings()).not.toBe(subject.getSettings());
    });

    it('[NET-NEW] hands back a different array on every getEventHandlers call', () => {
      const subject = new BaseIntegration();

      /* `:L68` returns a LITERAL `[]`; same hazard, same assertion. */
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

      /* Cross-instance leakage is the same defect one step further out; it is asserted separately. */
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

/* =====================================================================================================
 * FOLDED IN FROM `test/integrations/IntegrationContract.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/integrations/IntegrationContract.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. The contract `integrationServices/IntegrationInterface.cfc:L51-L89` declares, which the stub and the
 * base both implement. All four integration suites now sit in the one approved integration suite, which is
 * where AAP §0.4.1.12 puts integration coverage.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * The integration contract — INT-03.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/IntegrationContract.ts`, whose legacy origin is the `<cfinterface>` at
 * `integrationServices/IntegrationInterface.cfc:L50-L89` (AAP §0.4.1.10).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The legacy contract is a five-member `<cfinterface>`: `init` (`:L52`), `getDisplayName` (`:L56`),
 * `getIntegrationTypes` (`:L63`), `getSettings` (`:L75`) and `getEventHandlers` (`:L82`). Three
 * further members exist in the surrounding legacy files and are DELIBERATELY not part of the
 * contract — `getAdminNavbarHTML` (`integrationServices/BaseIntegration.cfc:L71`),
 * `getIntegratedSettings` (`integrationServices/google/Integration.cfc:L67`) and `getSettingOptions`
 * (`:L73`). A port that widened the interface to five-plus-one would look harmless and would change
 * the contract every future adapter has to satisfy, so the boundary is asserted from both sides:
 * every declared name is on the contract, and every contract key is one of the declared names.
 *
 * Three properties of the legacy declaration survive translation and are each asserted here:
 *
 *   1. ARITY. Every one of the five `<cffunction>` tags declares no `<cfargument>` at all, so every
 *      ported member is zero-arity. `getSettingOptions` — the one member in the folder that DOES take
 *      an argument (`required string settingName`) — is precisely one of the three excluded.
 *   2. SYNCHRONICITY. CFML has no `async` facility, so no legacy caller can await anything. The port
 *      must therefore not have introduced a promise anywhere in the contract; AAP §0.6.6 M8 records
 *      the same commitment for `SettingResolverPort`, so no caller in the slice depends on background
 *      completion. This is asserted at RUNTIME rather than by the declared type alone, because a
 *      declaration reading `string` can still be produced by an `async` function body.
 *   3. VISIBILITY. Four of the five legacy tags carry `access="public"`; `getEventHandlers` at `:L82`
 *      carries NO `access` attribute. A TypeScript interface has no visibility facility at all, so the
 *      translation makes all five equally reachable, and the assertion is that the un-annotated member
 *      is reachable from outside its class exactly like the other four.
 *
 * TWO CARRIED DOC-DRIFT DEFECTS ARE ASSERTED AS BEHAVIOUR, NOT AS PROSE. `IntegrationInterface.cfc`
 * declares `getSettings` with `returntype="struct"` while its own hint says to "return true"; and it
 * declares `getEventHandlers` with `returntype="array"` while its hint describes ColdSpring XML. Both
 * are stale legacy prose carried across as unnumbered `TODO(parity)` notes rather than repaired, per
 * AAP §0.8.2 guideline 4. What is asserted is the DECLARED shape that the port kept — an object and an
 * array — because that is the observable behaviour; the prose is not executable and is not asserted.
 *
 * NO DATABASE, NO NETWORK, NO FILESYSTEM PRODUCT PATH. The contract is a type. Two of its cases read
 * the port's own source file as TEXT with `node:fs`/`node:path`, because "declares exactly five
 * members, in this order" is a property of the declaration and cannot be observed from a value at
 * runtime — an interface leaves nothing behind after compilation. Nothing here parses, evaluates or
 * modifies that file, and no product behaviour is routed through either built-in. Only files inside
 * this subtree are read: the CFML tree is reference-only and is never touched by a test.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * integration contract, the base integration or the Google adapter, and AAP §0.8.3.7 requires that
 * absence to be flagged explicitly rather than implied away. TRACEABILITY HERE IS DOCUMENTARY, NEVER
 * EMPIRICAL: MXUnit and CFSelenium are not vendored (`meta/tests/readme.txt:L4-L5`),
 * `meta/docker/slatwall-local-dev/` does not exist, and no CFML runtime is reproducible in this
 * environment, so the legacy suite was read rather than run (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. The contract's declaration and the conformance of the two classes that implement it. This
 * file asserts no default VALUE (that is `BaseIntegration.test.ts`), no Google override (that is
 * `GoogleIntegration.test.ts`), no feed selection, no serialization and no handler behaviour.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.
describe('test/integrations/IntegrationContract.test.ts — the five-method `<cfinterface>` contract both of the above implement (folded, F1, F5)', () => {
  /* =================================================================================================
   * Compile-time claims.
   *
   * `type AssertAssignable<TActual extends TExpected, TExpected> = TActual` fails to COMPILE when the
   * claim stops holding, which is the only way to assert something about an interface that leaves no
   * runtime value behind. The two mutual aliases below are together an exhaustiveness proof: dropping a
   * member from the contract breaks the first, and adding a sixth breaks the second.
   * ============================================================================================== */
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
   * The three members that exist in the folder and are deliberately NOT on the contract, each with the
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

  /* =================================================================================================
   * A conformer that is NOT a `BaseIntegration`.
   *
   * `integrationServices/google/Integration.cfc:L49` both `extends` the base and `implements` the
   * interface, but those are independent declarations: the interface itself demands no base class. This
   * class proves the ported contract kept that independence — if the port had folded a base-class
   * dependency into the interface, this would stop compiling.
   * ============================================================================================== */
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

  /* =================================================================================================
   * Exhaustive member access without `any`.
   *
   * Both records are keyed by the member-name union, so a member added to or removed from
   * `CONTRACT_MEMBERS` fails to compile here rather than silently going unasserted. One record hands
   * back the FUNCTION (for arity and for the `AsyncFunction` check), the other INVOKES it (for the
   * returned-value checks); neither needs `Function.prototype.call`, a cast, or a non-null assertion.
   * ============================================================================================== */
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

  /* =================================================================================================
   * Source-text inspection.
   *
   * An interface produces no runtime value, so "declares exactly these five, in this order" can only be
   * observed in the declaration itself. The port's own file is read as text and the member lines are
   * lifted out of the interface body. `readDeclaredContractMembers` deliberately re-reads on every call
   * rather than memoising at module scope, so no case can be influenced by another's read.
   * ============================================================================================== */
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

  /** Matches a two-space-indented member declaration such as `  getSettings(): …;`. */
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

  describe('NET-NEW IntegrationContract — the five declared members (INT-03)', () => {
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
       * type alias catches a widened INTERFACE while this case also catches a widened FILE — a member added
       * to the declaration but shadowed by an identical name elsewhere would slip past the type alone.
       */
    });

    it('[NET-NEW] excludes the three candidate sixth members that exist elsewhere in the folder', () => {
      const { members } = readDeclaredContractMembers();

      /*
       * `getAdminNavbarHTML` — BaseIntegration.cfc:L71. Present on the BASE CLASS, so every integration
       * inherits it; absent from the interface, so no adapter is obliged to provide it.
       * `getIntegratedSettings` — google/Integration.cfc:L67. A Google-only member.
       * `getSettingOptions` — google/Integration.cfc:L73. Google-only, and the ONE member in the folder
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

  describe('NET-NEW IntegrationContract — arity, synchronicity and visibility (INT-03)', () => {
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
       * `IntegrationInterface.cfc:L82` is the one tag with NO `access` attribute, while `:L52`, `:L56`,
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

  describe('NET-NEW IntegrationContract — the declared return shapes (INT-03)', () => {
    it('[NET-NEW] returns the subject itself from init, which is what `return this` means', () => {
      for (const { subject } of conformers()) {
        /* `IntegrationInterface.cfc:L52` declares `returntype="any"`; every implementation returns itself. */
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
         * (AAP §0.8.2 guideline 4); what is asserted is the DECLARED shape the port kept, because that is
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

  describe('NET-NEW IntegrationContract — conformance of the shipped implementations (INT-03)', () => {
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
       * `google/Integration.cfc:L49` carries `extends="…BaseIntegration"` AND
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

/* =====================================================================================================
 * FOLDED IN FROM `test/handlers/googleFeedHandler.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5, F7)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/handlers/googleFeedHandler.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. The feed is the one surface whose three production parts — the selection, the serializer and the stub —
 * now all sit in this file, so the handler that wires them belongs here too. It is also the layer review
 * finding F4 was about, and this file already carries the shipped-wiring cases that answer it, so the
 * handler's collaborator surface and its wiring are now asserted side by side.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * The Google product-feed handler — INT-06.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/handlers/googleFeedHandler.ts`, whose legacy origin is the `product(rc)` action at
 * `integrationServices/google/controllers/feed.cfc:L58-L73`, reached as
 * `?slatAction=google:feed.product` (`integrationServices/google/views/main/default.cfm:L50`).
 * AAP §0.4.1.9 lists the file and flags M2 against it.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The handler is the thin AWS boundary AAP §0.1.2.1 requires: it composes no selection, emits no
 * element, chooses no status and inspects no error. Everything it DOES do is a sequencing decision,
 * and each one is asserted:
 *
 *   1. THE BODY IS THE DOCUMENT, VERBATIM. `product.cfm:L1` puts the XML declaration in the first
 *      bytes, so the response body must be raw XML with no envelope, no layout, no wrapper and no
 *      second encoding pass. Asserted BYTE-IDENTICALLY against a document this file builds itself
 *      from the same records, the same context and the same serializer — which is the only form of
 *      the claim that cannot pass while the handler quietly alters a character.
 *   2. THE CONFIGURED HOST REACHES EVERY ABSOLUTE URL. `product.cfm` composes four content URLs and
 *      the channel description from `http://` plus the host. The host is read ONCE at creation,
 *      which is asserted with a counting accessor, because AAP §0.6.6 M7 records that it cannot vary
 *      between invocations of one container.
 *   3. NOTHING SURVIVES BETWEEN INVOCATIONS. The selection is re-issued every call, the clock is read
 *      every call, and a second selection that is empty is NOT masked by a first that was not. This
 *      is the M7 claim in its observable form: on a warm container, module scope is the only thing
 *      that persists, so a memoised selection or a captured render instant would be a real defect.
 *   4. EVERY FAILURE FUNNELS THROUGH ONE MAPPING, AND NOTHING LEAKS. Seven distinct thrown values are
 *      driven through the single catch and each is asserted at its exact status AND its exact public
 *      body — including the two that are easy to get wrong: `NotImplementedError` publishes
 *      `./httpResponse`'s own neutral text rather than the presentation's, and `LegacyParityError` is
 *      the ONLY branch that publishes a thrown message. The suppression record written to the error
 *      stream is captured and asserted too, because "redirected, not discarded" is only half a
 *      guarantee if nobody checks that the message stayed out of it.
 *   5. M2 IS FLAGGED, NEVER SOLVED. `product.cfm:L9` asks for `requesttimeout="360"`, which AAP
 *      §0.6.6 M2 records as a mismatch to be surfaced rather than resolved. Three cases hold that
 *      honest: the collaborator surface admits no budget, page size, chunk, cursor or concurrency
 *      control; the source schedules nothing and races nothing; and a slow serialization still
 *      completes rather than being cut off by something this file invented. No figure is asserted for
 *      any ceiling, because AAP §0.8.3.5 and IR-12 forbid inventing one.
 *
 * WHY THE REAL SELECTION AND THE REAL SERIALIZER ARE USED. `ProductFeedQuery` owns the cancellation
 * refusal and `ProductFeedBuilder` owns every emitted byte, so substituting either would make the
 * cancellation and byte-parity claims assertions about a test fixture instead of about the port. Both
 * are constructed here against the support doubles the sibling suites use, and only the four seams the
 * handler cannot supply itself — a SKU source, a host, an image reader and a clock — are doubled.
 * The error matrix is the one exception: there a serializer double raises each value deliberately,
 * because the mapping under test is the handler's contract and the failure's origin is irrelevant to
 * it.
 *
 * NO DATABASE, NO NETWORK, NO HTTP LISTENER. This is headless library code: the handler is a function
 * that returns a response object, so every case calls it directly. Two cases read the handler's own
 * source file as TEXT with `node:fs`/`node:path`, because "schedules nothing" is a property of the
 * source; nothing parses, evaluates or modifies it, and only files inside this subtree are read.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * feed controller at all — `meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52` is an empty
 * component — and AAP §0.8.3.7 requires that absence to be flagged explicitly rather than implied
 * away. TRACEABILITY HERE IS DOCUMENTARY, NEVER EMPIRICAL: MXUnit and CFSelenium are not vendored
 * (`meta/tests/readme.txt:L4-L5`), `meta/docker/slatwall-local-dev/` does not exist, and no CFML
 * runtime is reproducible in this environment, so the legacy suite was read rather than run
 * (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. The handler's sequencing, its response envelope and its failure mapping. The field mapping
 * belongs to `ProductFeedBuilder.test.ts`, the selection composition to `ProductFeedQuery.test.ts`,
 * the emitted SQL to `SmartListQueryBuilder.test.ts`, and the router is out of scope for this
 * checkpoint.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.
describe("test/handlers/googleFeedHandler.test.ts — the feed's HANDLER — the fourth and last part of the feed's coverage (folded, F1, F5 case 7, F7)", () => {
  /* =================================================================================================
   * Compile-time claims about the collaborator surface.
   *
   * The two mutual aliases are an exhaustiveness proof over the seams the handler accepts. They are the
   * cheapest and strongest form of "no page size, chunk size, cursor, concurrency limit, re-attempt count or
   * cache lifetime was invented here" (M2, AAP §0.8.2 guideline 4): a collaborator not in this list would fail
   * `tsc` before a single case ran.
   *
   * ⭐ THE LIST HAS SIX NAMES, AND IT USED TO HAVE FIVE. Review finding SEC-1 (CWE-400) added
   * `assertMaterialisationBounded` — the bound check this ANONYMOUS route runs before it materialises anything.
   * The census is what makes that addition visible rather than incidental: a reviewer reading this list sees
   * exactly one new collaborator, and the note above no longer claims "no budget" was involved, because one
   * now is. What has NOT changed is that no FIGURE is named — here or anywhere in the module — since the gate
   * requires the operator to have stated one and supplies none itself.
   * ============================================================================================== */
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

  /* =================================================================================================
   * Fixture values.
   *
   * Every one is a FIXTURE chosen so its effect is observable in the output; none is a claim about a
   * production default. The four settings are seeded explicitly because
   * `config/dbdata/SlatwallSetting.xml.cfm` seeds neither shipping key and the effective-value engine
   * lives in the out-of-scope setting service, so inventing a default would be fabrication.
   * ============================================================================================== */
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

  /* =================================================================================================
   * Hand-written call logs. No mocking library is used anywhere: AAP §0.5.2 closes the dependency set,
   * and AAP §0.4.3.6 records that the legacy suite has no mocking facility at all.
   * ============================================================================================== */

  /**
   * One recorded execution of the feed's selection.
   *
   * ⚠️ IT RECORDS THE DESCRIBED QUERY AND WHICH VIEW WAS ASKED FOR, WHERE IT USED TO RECORD A SERVICE
   * CALL'S ARGUMENTS. `ProductFeedQuery` no longer holds a `SkuService`: it composes the shared SKU
   * selection and executes it through `SmartListQueryPort.executeRecords`, so what a double can observe is
   * the query description and the member that received it. Recording the member is the point — a
   * regression to the three-view reading would show up here as `execute` rather than as a silently extra
   * statement nothing asserts on.
   */
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
    /** The one product both SKUs hang off, exposed so a case can seed its owned image collection. */
    readonly product: Product;
    /**
     * The two SKU codes as strings.
     *
     * `Sku.skuCode` is declared optional (`src/domain/sku/Sku.ts:L977`) because the column is nullable, so
     * the fixture's own values are surfaced here rather than narrowed at every assertion site.
     */
    readonly skuCode: string;
    readonly secondSkuCode: string;
    readonly selectionCalls: readonly SelectionCall[];
    readonly imageReaderCalls: readonly string[];
    readonly clockCalls: ClockCallLog;
    /** How many times the SEC-1 materialisation gate was consulted. */
    readonly materialisationGateCalls: { readonly count: number };
    readonly hostReads: HostReadLog;
    readonly images: ImagePathDouble;
    readonly pricing: PricingDouble;
    /** Replaces what the NEXT selection returns. */
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
    /**
     * Replaces the image reader.
     *
     * ⭐ IT EXISTS TO DRIVE THE SHIPPED DEFAULT'S BEHAVIOUR. `src/config/container.ts` supplies a reader
     * that RAISES a `NotImplementedError` when no deployment has injected an image subsystem, and a code
     * review required that the feed then answer `501` rather than publish a document with every
     * `g:additional_image_link` element silently missing. Seeding a raising reader here is how that outcome
     * is asserted without building a container (which would read the environment).
     */
    readonly readProductImages?: (sku: Sku) => readonly ProductFeedImage[];

    /**
     * Replaces the anonymous materialisation gate — review finding SEC-1 (CWE-400).
     *
     * ⭐ IT EXISTS TO DRIVE BOTH OUTCOMES OF A REQUIRED COLLABORATOR. `src/config/container.ts` builds the
     * real gate with `createAnonymousMaterialisationGate`, which raises a `ConfigurationError` when no
     * deployment has stated `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY`. Seeding a raising gate here is how the
     * `500` is asserted without building a container (which would read the environment); the default below is a
     * gate that returns, so every other case in this file exercises the bounded path.
     */
    readonly assertMaterialisationBounded?: () => void;
  }

  function createHandlerScenario(seed: ScenarioSeed = {}): HandlerScenario {
    /* The legacy fixture contract from `meta/tests/unit/Helper.cfc:L52-L77`, reused rather than retyped. */
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
    /* The records-only reading `ProductFeedQuery` declares as its seam — the view
     * `integrationServices/google/views/feed/product.cfm:L16` loops. The double answers the rows and
     * records the description it was handed, so a case can assert both what was selected and that only
     * this member was used. */
    const skuSource: ProductFeedSkuSource = {
      executeRecords: <TEntityName extends SmartListRootEntityName>(
        query: SmartListQuery<TEntityName>,
      ): Promise<SmartListRecord<TEntityName>[]> => {
        selectionCalls.push({ query, member: 'executeRecords' });

        if (seed.selectionFailure !== undefined) {
          return Promise.reject(seed.selectionFailure);
        }

        /* The seeded SKUs ARE the rows for this root entity. The cast is confined to this one line and is
         * unavoidable in a double that satisfies a generic member: the harness seeds SKUs because the feed
         * roots at `SlatwallSku`, and a query rooted anywhere else never reaches this double. */
        return Promise.resolve([...selectedSkus] as unknown as SmartListRecord<TEntityName>[]);
      },
    };

    const builder = new ProductFeedBuilder(images.imagePaths, pricing.pricing, settings.resolver);

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
       * read ONCE at creation rather than per invocation, which is the M7 commitment the module states.
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
      /* SEC-1. Counted as well as delegated, so a case can assert the gate ran BEFORE the selection did. */
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

  /* =================================================================================================
   * The error-stream capture.
   *
   * `./httpResponse` writes an allowlisted diagnostic through `console.error` on three of its five
   * branches, so a case that ignored it would leave the "redirected, not discarded" guarantee unchecked
   * — and would print noise that looks like a failure. `console.error` is swapped for a typed collector
   * and restored in a `finally`, which is a hand-written call log rather than a mocking facility.
   * ============================================================================================== */
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

  describe('NET-NEW googleFeedHandler — the successful response envelope (INT-06)', () => {
    it('[NET-NEW] answers 200 with Content-Type application/xml and nothing else in the headers', async () => {
      const { response } = await invoke(createHandlerScenario().handler);

      /*
       * `./httpResponse.xmlResponse` owns all three. The header map is asserted WHOLE rather than by key,
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
       * `product.cfm:L1` puts the declaration in the FIRST bytes, so the body starts with it and is not
       * wrapped. `JSON.parse` throwing is the falsifiable form of "not a JSON envelope"; the absence of
       * `<html` is the falsifiable form of "no layout was applied", which is what `request.layout = false`
       * at `feed.cfc:L60` achieves in the legacy controller.
       */
      expect(body.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);
      expect(() => {
        /* Called for its throw, not its value: returning the parse result would hand back `any`. */
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
       * THE CENTRAL CLAIM OF THIS FILE. The expected document is built from the SAME serializer instance,
       * the SAME record shape and the SAME render context, so any difference is something the handler did
       * to the body — a trim, a prepend, a re-encode, a normalisation. `toBe` on the whole string is the
       * only assertion that cannot pass while one character differs.
       */
      expect(response.body).toBe(expected);
      expect(response.body).toHaveLength(expected.length);
    });

    it('[NET-NEW] carries the legacy channel header verbatim', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /* `product.cfm:L1`, `:L11`, `:L13` — the declaration, the namespaced root and the channel title. */
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
       * `product.cfm:L16` loops the smart list's RECORDS — the unpaged collection — so the handler must not
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

  describe('NET-NEW googleFeedHandler — the configured host reaches every absolute URL (INT-06)', () => {
    it('[NET-NEW] puts http://<host> in the channel link, the channel description and the item link', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /*
       * The handler contributes the host and nothing else about these URLs; the composition is the
       * serializer's. What is asserted here is that the ONE configured value reaches every place the legacy
       * template put it, because a handler that dropped it would still produce a well-formed document.
       */
      expect(body).toContain(`<link>${ABSOLUTE_URL_PREFIX}</link>`);
      expect(body).toContain(`${ABSOLUTE_URL_PREFIX}/product/`);
      expect(body).toContain(`${ABSOLUTE_URL_PREFIX}${SKU_COMPOSED_IMAGE_PATH}`);
      expect(body).toContain(`${ABSOLUTE_URL_PREFIX}${ADDITIONAL_IMAGE_PATH}`);
    });

    it('[NET-NEW] emits http:// and never https://, because the legacy prefix is literal', async () => {
      const { response } = await invoke(createHandlerScenario().handler);
      const body = response.body;

      /*
       * TODO(parity) — the legacy template hard-codes `http://`. Upgrading it to `https://` would be a
       * silent behavioural change of exactly the kind AAP §0.8.2 guideline 4 forbids, so the scheme is
       * asserted as it is. The `g:` namespace URI is itself an `http://` URL, so counting occurrences of
       * the PREFIXED host is what distinguishes content URLs from the namespace declaration.
       */
      expect(body).not.toContain('https://');
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

    it('[NET-NEW] passes a legal host through unmodified — the gate refuses or does nothing', async () => {
      const scenario = createHandlerScenario({ host: SECOND_RENDER_HOST });
      const { response } = await invoke(scenario.handler);

      /*
       * ⭐ THE TITLE USED TO SAY "without validating or normalising it", AND HALF OF THAT IS NO LONGER
       * TRUE OF THE SECOND HALF ONLY, AND THAT HALF IS WHAT THIS CASE PINS. A revision reinstated
       * `validateFeedHostAuthority` under findings F7 and SEC-06, so the value was validated at construction
       * and again per render; that apparatus is WITHDRAWN — see the withdrawal record below. What survives,
       * and is asserted here, is that a host is used EXACTLY as configured: nothing is trimmed, case-folded,
       * punycoded, stripped of a default port or upgraded to a secure scheme, so the emitted bytes for a
       * legal host are the configured bytes.
       */
      expect(response.body).toContain(`<link>http://${SECOND_RENDER_HOST}</link>`);
      expect(response.body).not.toContain(RENDER_HOST);
    });

    /* ==============================================================================================
     * ⛔ NINE CASES STOOD HERE AND ARE WITHDRAWN — THEY ASSERTED A GATE THIS PORT NO LONGER HAS
     *
     * WHAT THEY ASSERTED. One case required `createHandlerScenario({ host: '<configured>@evil.example' })`
     * to throw `DataIntegrityError` at construction, and an `it.each` required the same of eight further
     * values: a path delimiter, a backslash, a query delimiter, a fragment delimiter, an embedded space, an
     * embedded newline, a whitespace-only host and an empty host. All nine drove
     * `validateFeedHostAuthority`, a deny check over the five origin-moving characters.
     *
     * WHO WITHDREW IT AND ON WHAT AUTHORITY. The gate was added under findings F7/SEC-06 and INT-06 and
     * removed by a later review's withdrawal of seven hardening categories. The decisive argument is
     * CARDINALITY rather than merits: `integrationServices/google/views/feed/product.cfm:L14` interpolates
     * `CGI.HTTP_HOST` into the channel link with NO test of any kind, and AAP §0.6.7.7 licenses EXACTLY ONE
     * departure from behavioural preservation in this port — D18, the importer's parameterised SQL — so that
     * a reviewer comparing generated behaviour against legacy behaviour has exactly one entry to check.
     * §0.8.2 guideline 4 admits no proportionality test. `src/config/env.ts` records the same withdrawal for
     * the same value from the configuration side, at its THERE IS NO `requireHostAuthorityValue` note.
     *
     * ⭐ WHAT STILL HOLDS, SO THE WITHDRAWAL IS NOT A COVERAGE HOLE.
     *   • `GOOGLE_FEED_HOST` is still REQUIRED and NON-BLANK at the configuration boundary, which is where
     *     every deployed value comes from — so the whitespace-only and empty cases are answered there, and
     *     `../regression/issues.test.ts` asserts it.
     *   • SEC-2's XML-representability gate is IN FORCE, so a host carrying `<`, `&` or `]]>` is refused
     *     rather than published unparseable — the ampersand case immediately below asserts exactly that,
     *     and it is a well-formedness rule rather than a URL-semantics one.
     *   • The residual exposure — a host carrying `/`, `@`, `?` or `#`, which moves the origin of all five
     *     absolute URLs — is asserted as a CARRIED DEFECT by the serializer block's
     *     `TODO(parity) — WITHDRAWAL REGRESSION` case, with the literal payload spelled out, so any
     *     reinstated gate fails loudly there instead of silently passing here.
     * ============================================================================================== */

    it('[NET-NEW] admits an IPv6 literal, a port and an underscore, because no grammar was invented', async () => {
      /*
       * ⛔ THE WITHDRAWN RFC 1035 GRAMMAR AND ITS 63-OCTET CEILING STAY WITHDRAWN, AND THIS CASE IS WHY.
       * A positive grammar of "legal hostnames" refuses values real deployments use, and refusing a
       * legitimate authority is the outcome change AAP §0.8.2 guideline 4 actually forbids. The gate is a
       * DENY set of authority delimiters instead, so each of these passes and is emitted verbatim.
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

    it('[NET-NEW] CQ-9 and SEC-2 answer 500 for an ampersand host rather than escaping it into the feed', async () => {
      /*
       * ⭐ THE TWO CONTROLS DIVIDE THE EXPOSURE, AND THIS CASE PINS THE SEAM. `&` cannot move an
       * authority, so `validateFeedHostAuthority` has no business refusing it and does not — the host reaches
       * the serializer. What happens there has changed twice, and the current answer is the one this case
       * asserts.
       *
       * ⛔ IT USED TO BE ESCAPED, and this case required `<link>http://a&amp;b.example.test</link>`, reasoning
       * that a working document beats a refusal. Review finding CQ-9 withdrew that escape: the channel link at
       * `integrationServices/google/views/feed/product.cfm:L14` is one of NINE RAW sinks, and escaping it emits
       * bytes the legacy never emitted.
       *
       * ⭐ SO THE VALUE IS NOW REFUSED, WHICH IS WHAT FINDING SEC-2 REQUIRES OF IT. Emitted raw, a bare `&`
       * leaves the whole document with no defined XML parse — "allowing one record to make the whole feed
       * unparseable" — so `ProductFeedBuilder` raises a `DataIntegrityError` and this handler translates that
       * to 500. No document is published either way; the difference is that a 500 is diagnosable and a
       * malformed 200 is not.
       *
       * ⚠️ AND THE BODY MUST NOT LEAK THE HOST, which is why the negative below is on the configured value
       * rather than only on the markup. A 500 body is a neutral public message; echoing configuration into it
       * would be a new disclosure introduced by a security fix.
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

  describe('NET-NEW googleFeedHandler — SEC-1: the anonymous route requires a stated bound', () => {
    /*
     * WHY THIS ROUTE AND NO OTHER. `integrationServices/google/controllers/feed.cfc:L54-L56` declares
     * `this.publicMethods="product"`, so `google:feed.product` is the ONE action in the whole service
     * reachable with no principal — every other catalog route answers 401 without one. Review finding SEC-1
     * (CWE-400) is about unbounded ANONYMOUS materialisation specifically, which is why the gate lives here
     * rather than in the shared response layer.
     *
     * ⭐ AND WHY THE GATE DEMANDS A BOUND RATHER THAN CHOOSING ONE. `src/config/env.ts` reads
     * `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY` as an OPTIONAL variable with no default, so an operator who
     * has measured a figure can state it and this module never authors one (AAP §0.7.3 S9, IR-12). The
     * consequence of stating nothing is a refusal, not a fabricated ceiling.
     */

    it('[NET-NEW] SEC-1 answers 500 and selects nothing when no bound is stated', async () => {
      const scenario = createHandlerScenario({
        assertMaterialisationBounded: (): void => {
          throw new ConfigurationError('no bound stated');
        },
      });

      const { response } = await invoke(scenario.handler);

      expect(response.statusCode).toBe(500);

      /*
       * ⭐ THE ASSERTION THAT MATTERS MOST IS THE SECOND ONE. A refusal that arrived after the selection had
       * already hydrated the catalog would report the exposure without preventing it, so the gate must run
       * BEFORE `getFeedSkus` — and an empty selection log is the direct statement that it did.
       */
      expect(scenario.selectionCalls).toHaveLength(0);
      expect(scenario.imageReaderCalls).toStrictEqual([]);
      expect(scenario.materialisationGateCalls.count).toBe(1);

      /* No partial document, and no configuration echoed into a public body. */
      expect(response.body).not.toContain('<rss');
      expect(response.body).not.toContain('CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY');
    });

    it('[NET-NEW] SEC-1 renders normally once a bound is stated, and re-checks every invocation', async () => {
      const scenario = createHandlerScenario();

      const first = await invoke(scenario.handler);
      const second = await invoke(scenario.handler);

      expect(first.response.statusCode).toBe(200);
      expect(second.response.statusCode).toBe(200);
      expect(first.response.body).toContain('<rss');

      /*
       * ⚠️ TWO INVOCATIONS, TWO CHECKS. Memoising the verdict would make the gate a construction-time fact
       * again, and a construction-time fact is exactly what this design avoids — `createGoogleFeedHandler` runs
       * at MODULE LOAD inside the router, so a raise there would take all 34 routes down over a bound only this
       * one needs (M7).
       */
      expect(scenario.materialisationGateCalls.count).toBe(2);
      expect(scenario.selectionCalls).toHaveLength(2);
    });
  });

  describe('NET-NEW googleFeedHandler — nothing survives between invocations (INT-06)', () => {
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
       * ⛔ THE DEFECT THIS PINS. Production used to wire a reader that answered an EMPTY LIST on every call,
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
      /* NOT a document with the images missing, and not an empty channel either: no XML at all. */
      expect(response.body).toBe(JSON.stringify({ message: 'This operation is not implemented' }));
      expect(response.body).not.toContain('<rss');
    });

    it('[NET-NEW] an EMPTY selection still renders 200, because the reader is consulted per record', async () => {
      /* The refusal above is per record, so a catalog with nothing to select never reaches the image
       * boundary and answers exactly what the legacy answers for an empty smart list: a complete document
       * with an empty channel. This is what keeps the 501 confined to the case that would otherwise have
       * been published incomplete. */
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
      /* The other half of the seam: a deployment that supplies a reader gets `product.cfm:L24`'s own output.
       * `PRODUCT_IMAGES` holds two entries, so two elements are emitted for the one selected SKU. */
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
      /* ONE records-only execution, and the description carries the feed's own joins and filters — so the
       * handler added no companion join, issued no second call, and did not reach the three-view reading
       * that would have counted the whole catalog on the way past. */
      expect(scenario.selectionCalls[0]?.member).toBe('executeRecords');
      expect(scenario.selectionCalls[0]?.query.entityName).toBe('SlatwallSku');
      expect(scenario.selectionCalls[0]?.query.joins).toBeDefined();
    });
  });

  describe('NET-NEW googleFeedHandler — the returned handler object (INT-06)', () => {
    it('[NET-NEW] returns a frozen object exposing exactly one operation', async () => {
      const { handler } = createHandlerScenario();

      /*
       * `feed.cfc:L54` declares `this.publicMethods="product"` — ONE public action in the whole slice — and
       * `:L55-L56` leave the admin and secure lists empty. The frozen single-key object is the port of that:
       * nothing else is reachable, and the shape cannot be extended after creation.
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
       * A TypeScript optional parameter compiles to an ORDINARY parameter with no default, so it still
       * counts towards `Function.length` — the arity is 1, and the optionality is a type-level fact the
       * runtime cannot see. What proves the option is genuinely optional is the case above, which invokes
       * the operation with no argument at all and gets a rendered feed. Both halves are stated because
       * asserting an arity of 0 here would look right and be wrong.
       */
      expect(handler.product).toHaveLength(1);
    });
  });

  describe('NET-NEW googleFeedHandler — cancellation is forwarded, never honoured here (INT-06)', () => {
    it('[NET-NEW] refuses a pre-aborted invocation before a single selection is issued', async () => {
      const scenario = createHandlerScenario();
      const controller = new AbortController();
      controller.abort();

      const { response } = await invoke(scenario.handler, controller.signal);

      /*
       * The refusal is REAL production code: `ProductFeedQuery.getFeedSkus` raises before it calls the SKU
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
       * ALLOWLIST — situation, failure class and a correlation identifier — so the message stays out of the
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
       * ⛔ The cancellation is deliberately NOT forwarded to `PricingPort` or `ImagePathPort`
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

  describe('NET-NEW googleFeedHandler — every failure funnels through one mapping (INT-06)', () => {
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
       * BRANCH 1. The keyed structure reaches the body UNCHANGED — not flattened, re-keyed, de-duplicated or
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
       * BRANCH 2, and the row most easily got wrong. The status is DERIVED from the error's own
       * presentation, but the published text is `./httpResponse`'s own neutral constant — "This operation is
       * not implemented" — and NOT the presentation's "This operation is not available". Neither
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
       * BRANCH 3. The message is COPIED, never processed, because the type is the throw site's declaration
       * that this exact text is legacy behaviour (`model/service/SkuService.cfc:L204`). It is also the only
       * branch that writes NO diagnostic, since nothing was suppressed.
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

      /* BRANCH 4, read polymorphically: `DataIntegrityError` declares its own family. */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(
        JSON.stringify({ message: 'The request could not be completed from the stored data' }),
      );
    });

    it('[NET-NEW] answers a configuration failure at 500 with the configuration-family text', async () => {
      const { response } = await invokeWithSerializerFailure(
        new ConfigurationError('a setting the feed reads was never seeded'),
      );

      /* BRANCH 4 again, with the other override. Same status, different neutral text. */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(
        JSON.stringify({ message: 'The service is not correctly configured' }),
      );
    });

    it('[NET-NEW] answers a base domain failure at 500 with the neutral service-fault text', async () => {
      const { response } = await invokeWithSerializerFailure(
        new DomainError('a diagnostic an engineer needs and a caller must never see'),
      );

      /* BRANCH 4, base class. `error.message` is not read. */
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).toBe(JSON.stringify({ message: 'The request could not be completed' }));
      expect(response.body).not.toContain('diagnostic');
    });

    it('[NET-NEW] answers a foreign Error at 500 without inspecting it at all', async () => {
      const { response, diagnostics } = await invokeWithSerializerFailure(
        new TypeError('cannot read properties of undefined (reading "productID")'),
      );

      /*
       * BRANCH 5 — a value this port did not raise. It is not swallowed: the diagnostic still records the
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
       * A value that is not an `Error` at all, thrown SYNCHRONOUSLY from the serializer rather than returned
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
       * identically to one in step 4. Asserting this separately is what proves there is ONE mapping rather
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
         * publishing its message verbatim is its whole purpose, and the case above asserts that separately.
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

  describe('NET-NEW googleFeedHandler — M2 is flagged, never solved (INT-06)', () => {
    it('[NET-NEW] admits no page size, chunk, cursor or concurrency collaborator', () => {
      /*
       * ⚠️ M2 (AAP §0.6.6) — `product.cfm:L9` asks for `requesttimeout="360"`, which exceeds what a
       * synchronous gateway in front of this function will generally allow. Flagging is the required
       * response and solving is the forbidden one (AAP §0.8.2 guideline 4), so the file must not have
       * acquired a control that quietly resolves it. The compile-time aliases above are the exhaustiveness
       * proof; this case asserts the same names as values so the list itself cannot silently change.
       *
       * ⭐ THE LIST GREW BY ONE, AND THE DISTINCTION BETWEEN THE TWO CEILINGS IS WHY THAT IS NOT A BREACH.
       * Review finding SEC-1 (CWE-400) added `assertMaterialisationBounded`, which bounds ROWS. M2 is about
       * TIME. Nothing in the new collaborator pages, chunks, batches, streams, caches, re-attempts, re-times
       * or races anything, and it names no figure — it reports whether the OPERATOR named one. So the M2
       * mismatch is still flagged and still unsolved, which is the mandated behaviour, while the row exposure
       * SEC-1 identified is closed for the one route reachable without a principal.
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

      /* ⛔ AND THE FOUR TIME-SHAPED CONTROLS ARE STILL ABSENT BY NAME, so the growth cannot be read as the
       * beginning of a delivery-model solution. */
      for (const forbidden of ['pageSize', 'chunkSize', 'cursor', 'concurrency']) {
        expect(COLLABORATOR_NAMES).not.toContain(forbidden);
      }
    });

    it('[NET-NEW] schedules nothing and races nothing, so no ceiling is invented in code', () => {
      const source = readFileSync(HANDLER_SOURCE_PATH, 'utf8');

      /*
       * NO FIGURE IS ASSERTED FOR ANY CEILING, because AAP §0.8.3.5 and IR-12 forbid inventing one and the
       * module states in full why the second ceiling is deliberately left unnamed. What IS asserted is that
       * the file contains no timing mechanism at all: none of these tokens appears anywhere in it, in code
       * or in prose, so a plain text search is exact here.
       */
      expect(source).not.toContain('setTimeout(');
      expect(source).not.toContain('setInterval(');
      expect(source).not.toContain('Promise.race(');
      expect(source).not.toContain('new AbortController(');

      /* And the flag itself is present, because surfacing the mismatch is the mandated behaviour. */
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

  /* =================================================================================================
   * THE PRODUCTION WIRING — `createGoogleFeedHandlerFromContainer`
   *
   * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 records that the legacy repository
   * contains no test for the feed at all, so nothing here extends legacy coverage.
   *
   * ⚠️ WHY THIS BLOCK EXISTS, STATED AS THE REGRESSION IT GUARDS. Every case above builds the handler
   * through `createGoogleFeedHandler` and supplies its own image reader, which covers the SERIALIZER's
   * additional-image capability completely and covers the DELIVERED ROUTE's behaviour not at all. Under
   * review finding F24 that distinction turned out to matter: the container factory hardwired a reader
   * that answered an empty list for every SKU, so `?slatAction=google:feed.product` could never emit
   * `g:additional_image_link` — and reported "this product has no additional images" for products that
   * had several, which is a different fact presented as data. The factory is now the thing under test,
   * so the wiring cannot silently regress to a value where it should carry a boundary.
   * ============================================================================================== */

  /** A record source that answers a fixed selection, standing in for the container's own query. */
  function feedRecordSourceFor(skus: readonly Sku[]): ProductFeedRecordSource {
    return { getFeedSkus: (): Promise<Sku[]> => Promise.resolve([...skus]) };
  }

  /**
   * The container's shipped image reader, MIRRORED rather than imported.
   *
   * ⛔ WHY IT IS NOT IMPORTED, WHICH IS THE ONE THING A READER WILL WANT TO KNOW. `src/config/container.ts`
   * exports the shipped reader, but it also statically imports `src/config/env.ts`, which VALIDATES the
   * environment at module load — so a static value import here would make merely LOADING this suite throw
   * `ConfigurationError` before any case ran. `loadShippedFeedWiring` above reaches the real container the
   * only way that works: it sets an environment first and then `require`s. These cases are about the
   * FACTORY's delegation rather than about the container's contents, so they mirror the two-branch semantics
   * instead of paying that cost.
   *
   * ⭐ AND THE REAL DEFAULT IS STILL ASSERTED AGAINST THE REAL CONTAINER — in the shipped-feed-wiring block
   * above, which loads the actual graph and drives all three branches through it. So a revision that
   * replaced the container's reader with a constant-empty one fails there, and a revision that reinstates a
   * reader inside the HANDLER fails the source-scan case beside it. This mirror can therefore drift from the
   * container only in a way that two other cases already catch.
   */
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

  /**
   * Gives a scenario's product one owned image, so the shipped boundary has SOMETHING TO READ.
   *
   * ⭐ THIS IS THE PRECONDITION THE 501 IS A PROPERTY OF, AND STATING IT IS THE POINT. The shipped reader
   * answers `[]` for a product whose image collection is genuinely empty — `product.cfm:L24` emits no
   * element for such a product either, so refusing there would fail a feed the legacy serves — and refuses
   * only for a product that CARRIES images, whose paths come from `model/entity/Image.cfc:L79-L81`, an
   * entity AAP §0.2.1.2 excludes. A case that wants to observe the refusal must therefore seed an image;
   * the sibling empty-catalogue case below deliberately does not, and asserts the 200.
   *
   * ⚠️ THE ELEMENT IS THE OWNED-ASSOCIATION SHAPE, NOT AN IMAGE ENTITY, which is exactly the gap. Its
   * only members are the two ownership mutators, so there is no path member on it to read — which is why
   * the boundary exists rather than the domain composing the path itself.
   */
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

  /**
   * The members the factory reads, assembled from a scenario's own collaborators.
   *
   * ⚠️ `productFeedImages` IS DELIBERATELY OMITTED, WHICH IS THE WHOLE POINT OF THIS BLOCK. The slice
   * declares it optional so that omitting it exercises the factory's SHIPPED fallback — the refusal —
   * rather than a reader this test supplied. Supplying one here would assert the test's own wiring.
   *
   * ⭐ SEC-1's GATE IS SUPPLIED AND PERMISSIVE, because it is not what these cases are about. The slice
   * declares it REQUIRED so no production wiring path can reach the factory without one; a no-op here
   * stands for "an operator stated a ceiling", which lets the image assertions below reach the serializer.
   * The gate's own refusing behaviour is asserted in `../regression/issues.test.ts`, against the real
   * composition root, where an absent ceiling is the condition under test.
   */
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

  describe('NET-NEW googleFeedHandler — the wiring the delivered route actually gets (F24)', () => {
    it('[NET-NEW] reports the image boundary at 501 instead of publishing "no images"', async () => {
      const scenario = createHandlerScenario();
      seedOneOwnedProductImage(scenario.product);
      const handler = createGoogleFeedHandlerFromContainer(
        containerSliceFor(scenario, [scenario.sku]),
      );

      const { response } = await invoke(handler);

      /*
       * THE ASSERTION IS THE STATUS *AND* THE ABSENCE OF A 200, because the defect was not a wrong
       * status — it was a SUCCESSFUL response carrying a false fact. A feed that answers 200 with no
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
       * The other half of the finding: the builder's capability must be REACHABLE from the production
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
       * The reader is consulted once per SELECTED record, which is why the shipped boundary does not turn
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

      /* An empty override object is not a reader: it must fall back to the boundary, not to `[]`. */
      const empty = await invoke(createGoogleFeedHandlerFromContainer(slice, {}));
      expect(empty.response.statusCode).toBe(HTTP_STATUS.NOT_IMPLEMENTED);
    });
  });
});

/* =====================================================================================================
 * NET-NEW — THE FEED, END TO END: THE PUBLIC ROUTE, THE SELECTION, THE HYDRATION AND THE DOCUMENT (F7)
 * =====================================================================================================
 * WHY THIS SECTION EXISTS, AND WHY IT IS NOT A DUPLICATE OF ANYTHING ABOVE. A QA pass found that this
 * suite tested the BUILDER only: every case above it hands the serializer records it constructed by hand,
 * and the folded selection cases drive the query without ever reaching a route or a document. So the four
 * pieces of the feed were each covered and the SEAMS BETWEEN THEM were not — which is where a feed breaks
 * in practice. Nothing here re-asserts a field mapping; what it asserts is that ONE dispatch of the public
 * address carries a record from the selection query, through real aggregate hydration, into the document.
 *
 * ⭐ THE WHOLE CHAIN IS REAL EXCEPT THE DRIVER, AND THAT IS THE POINT. `createCatalogContainer` builds the
 * graph, `createRouter` mounts it, the route table resolves the address, the feed handler reads the clock
 * and assembles the records, `ProductFeedQuery` composes the selection through the REAL `SkuService`, the
 * REAL `SmartListQueryBuilder` translates it to SQL, the REAL `createCatalogAggregateLoaders` hydrate the
 * product, product type, brand and default SKU from rows, and the REAL `ProductFeedBuilder` serializes the
 * result. The only substitution beneath the port boundary is the `SqlExecutor`, which answers from a table
 * store and records every statement — so the SQL is asserted as EMITTED rather than as intended.
 *
 * ⭐ HYDRATION IS OBSERVABLE BECAUSE THREE FIELDS CAN ONLY COME FROM IT. `g:brand` exists only if the
 * `SwBrand` row was loaded and attached; `g:product_type` only if the `SwProductType` row was; and
 * `g:price` only if the DEFAULT SKU row was — `model/entity/Product.cfc:L563-L568` falls through to
 * `defaultSku.getPrice()` whenever the product carries no override, which is every freshly mapped product
 * because `price` is a column of `SwSku` and not of `SwProduct`. The fixture gives the selected SKU a
 * DIFFERENT price from the default SKU's for exactly that reason: a document reading the record's own price
 * would show `90.00`, and one reading the hydrated aggregate shows `99.00`.
 *
 * ⛔ AND THE HELPERS ARE THIS SECTION'S OWN RATHER THAN THE FOLDED SUITE'S. The folded selection body
 * declares an equivalent executor and table store, but they are block-scoped inside a fold that is carried
 * VERBATIM — reaching into it would mean editing it. So this section declares its own, prefixed
 * `END_TO_END_`, and the two remain independent by construction.
 * ================================================================================================== */

/** The configured feed host for this section, distinct from {@link RENDER_HOST} so its source is visible. */
const END_TO_END_HOST = 'feed.example.test';

/** The budget for the one case that dispatches five times; see its own note. */
const END_TO_END_MULTI_DISPATCH_TIMEOUT_MS = 30_000;

/** Every variable `src/config/env.ts` reads, cleared before this section applies its own. */
const END_TO_END_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'Slatwall',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'slatwall_pw',
  DB_TLS_MODE: 'disabled',
  DB_QUEUE_LIMIT: '1',
  /* Short on purpose: no statement here reaches a driver, so this only bounds the failure of a
   * regression that started to. */
  DB_CONNECT_TIMEOUT_MS: '1000',
  GOOGLE_FEED_HOST: END_TO_END_HOST,

  /* SEC-1 — the anonymous route requires a stated ceiling, and these cases drive the SHIPPED route through
   * the real router, so the gate runs. The figure is the fixture's; `../../src/config/env.ts` declares the
   * variable OPTIONAL with no default (IR-12), and the gate's refusing behaviour is asserted by the two
   * dedicated SEC-1 cases rather than incidentally here. */
  CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000',
});

/** Distinct 32-character identifiers, so a crossed association is visible rather than coincidental. */
const END_TO_END_ID = Object.freeze({
  sku: 'aaaa0000000000000000000000000001',
  product: 'bbbb0000000000000000000000000001',
  productType: 'cccc0000000000000000000000000001',
  brand: 'dddd0000000000000000000000000001',
  defaultSku: 'eeee0000000000000000000000000001',
});

/**
 * Every row the selection and its aggregate need. Money columns are STRINGS, as the driver returns them.
 *
 * `SwSku` deliberately holds TWO rows — the selected SKU and the product's default SKU — because the
 * legacy selection is over `SwSku` with no exclusion of default SKUs, so a real feed contains both. That
 * also makes per-record behaviour observable: the image reader below answers for the first only.
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
      productID: END_TO_END_ID.product,
    },
  ],
  SwProduct: [
    {
      productID: END_TO_END_ID.product,
      /* `productName` is the TEMPLATE-driven member's input; the feed reads `calculatedTitle`. Keeping
       * them different is what makes the item title's source unambiguous, exactly as `createScenario`
       * does above. */
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
  /* The repeat is deliberate: a document that de-duplicated would emit three, and `product.cfm:L24`
   * emits one element per collection entry with no de-duplication anywhere. */
  { imagePath: FIRST_ADDITIONAL_IMAGE_PATH },
]);

/** One statement, as the driver saw it. */
interface EndToEndStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * A recording executor over {@link END_TO_END_TABLES} that honours `WHERE <column> IN (…)`.
 *
 * The table is read from the statement's FIRST ` FROM`, so the root projection's own joins cannot be
 * mistaken for the table it selects from. Honouring the `IN` form matters because TWO different statements
 * read `SwSku` on this path — the selection's record projection and the aggregate loader's default-SKU
 * lookup by identifier — and a double answering both with every row would hand the lookup rows it never
 * asked for, silently attaching the wrong default SKU.
 */
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

/**
 * The delegate binder the aggregate loaders need, answering the default SKU's own price.
 *
 * `src/config/container.ts` builds its own binder and explains why one is needed at all: `Sku` is
 * intentionally NOT assignable to the nine-member delegate `Product.defaultSku` accepts, because the
 * entity's currency and image equivalents are asynchronous and port-parameterised while the delegate wants
 * synchronous, argument-free readers. Only the price member is read on this path.
 */
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
   * Every query the port was handed, BEFORE translation — the input review finding F7 asked to capture.
   *
   * Recorded by a thin wrapper that pushes and then delegates to the real builder, so the described query
   * and the SQL it became are both observable from one dispatch. Asserting only the SQL would leave the
   * layer that COMPOSES the description — `ProductFeedQuery` over `SkuService.getSkuSmartList` — inferred
   * rather than observed.
   */
  readonly queries: readonly SmartListQuery[];
  /** Every SKU the image reader was consulted about, in call order. */
  readonly imageReaderSubjects: readonly string[];
  readonly settings: SettingResolverDouble;
  readonly images: ImagePathDouble;
}

/**
 * Dispatch `google:feed.product` through the real router over a real graph, and answer what it produced.
 *
 * ⚠️ THE TWO MODULES ARE REACHED BY `require` AFTER `process.env` IS SET, for the reason the F4 wiring
 * section above records: both validate configuration at MODULE LOAD, and `src/handlers/router.ts`
 * additionally resolves the production graph at module scope. That load builds a production graph which is
 * then unused — every dispatch below goes through `createRouter(container)` with the graph built here.
 *
 * ⛔ NOTHING CONTACTS A DATABASE. The feed's only read goes through the overridden `smartListQueryPort`,
 * whose executor is the recorder above; `createPool` is synchronous and opens no connection until one is
 * checked out, so the untouched pool in the graph costs nothing. A regression that reached the driver would
 * fail on a connection error rather than pass.
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
    /* Seeded so the selected SKU's own image resolves to a composed path; the resize answer is left
     * unseeded so the double ECHOES each request's `imagePath`, which is the only configuration under
     * which "each additional image used its OWN resized path" is falsifiable. */
    imagePathsByImageFile: { [SKU_IMAGE_FILE]: SKU_COMPOSED_IMAGE_PATH },
  });
  const pricing = createPricingDouble({});
  const imageReaderSubjects: string[] = [];

  /*
   * The REAL builder, wrapped only to record the description it is handed. The wrapper delegates every
   * call unchanged, so translation, aliasing, binding and hydration are all still the adapter's.
   */
  const builder = new SmartListQueryBuilder(
    executor,
    createCatalogAggregateLoaders({ bindDefaultSkuDelegate: bindEndToEndDefaultSku }),
  );
  const queries: SmartListQuery[] = [];

  /*
   * ⭐ THE WRAPPER IS GENERIC IN THE ROOT ENTITY NAME, NOT IN A RECORD TYPE, BECAUSE THE PORT IS. Both
   * members derive their element type from the query's own `entityName` literal — which is what stops a
   * caller nominating a record type the description could not produce — so the wrapper has to carry that
   * parameter through rather than introduce one of its own. Writing it any other way needs a cast, and
   * AAP §0.7.3 S1 forbids one.
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
     * ⭐ THE READER IS CONSULTED PER RECORD, AND ANSWERING FOR ONLY ONE OF THE TWO IS WHAT PROVES IT.
     * `src/handlers/googleFeedHandler.ts` maps the selection into `{ sku, productImages }` pairs and
     * deliberately does NOT memoise by product, because the seam takes a SKU and the handler is not
     * entitled to assume an implementor's reader is a pure function of the product. A handler that read
     * once and reused the answer would put four elements in BOTH items.
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

describe('NET-NEW — the feed end to end, from the public route to the document (F7)', () => {
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

  it('[NET-NEW] captures the ONE description composed through SkuService.getSkuSmartList (F7)', async () => {
    const { queries } = await dispatchEndToEndFeed();

    /*
     * ⭐ ONE DESCRIPTION, NOT ONE PER ADDITION, WHICH IS THE WHOLE OF THE DECLARE-THEN-EXECUTE
     * TRANSLATION. The legacy controller MUTATED a live smart list — `rc.skuSmartList.joinRelatedProperty`
     * three times, `addFilter` three times, `addRange` once, each call reaching into an object the service
     * had already seeded [`feed.cfc:L63-L72`]. The port has no mutable list to reach into, so all seven
     * additions travel inside the ONE input the service is handed, and the port is called ONCE. A design
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
     * SIX JOIN DECLARATIONS IN ONE LIST — the service's three first, then the feed's three — with the
     * duplicate STILL PRESENT at this layer. It is absorbed by the translation rather than by the
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

    /* And the duplicate really is a duplicate — the same pair appears at position 0 and position 3. */
    expect(described.joins?.[3]).toStrictEqual(described.joins?.[0]);

    /*
     * THE THREE ACTIVITY FILTERS AND THE ONE RANGE, IN ONE WHERE GROUP, IN DECLARATION ORDER. One group
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
     * ⭐ AND THE CARET IS RESOLVED HERE, AT THE COMPOSITION LAYER, RATHER THAN IN THE ADAPTER — which is
     * exactly where a reader would not expect to find it, so it is worth pinning. `addRange('…','1^')`
     * [`feed.cfc:L72`] arrives as a LOWER BOUND ONLY: `lowerBound: '1'` with NO `upperBound` member at
     * all, not an `upperBound` of `''`, `undefined` or `Infinity`. Any of those three would translate to a
     * second predicate and quietly bound a range the legacy left open. The bound keeps its STRING
     * spelling, uncoerced, and the adapter case below is what proves that string reaches the driver.
     */
    expect(described.whereGroups?.[0]?.ranges).toStrictEqual([
      { propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' },
    ]);
    expect(Object.hasOwn(described.whereGroups?.[0]?.ranges?.[0] ?? {}, 'upperBound')).toBe(false);

    /* The service's five weight-1 keyword properties travel too, unchanged by the feed's additions —
     * `model/service/SkuService.cfc:L318-L322`. Two of them only resolve because of the joins above. */
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

    /* ⛔ AND NO PAGINATION IS DESCRIBED. `product.cfm:L16` loops the UNPAGED collection, so a page window
     * here would silently truncate a merchant feed to its first page. */
    expect(described.pagination).toBeUndefined();
    /* No keyword search either: the feed passes no term, so the weighted properties stay unused. */
    expect(described.keywords ?? []).toStrictEqual([]);
  });

  it('[NET-NEW] emits the six declared joins as five, in declaration order, none of them eliminating (F7)', async () => {
    const { statements } = await dispatchEndToEndFeed();

    /*
     * The record projection, and it is statement 0 — THERE IS NO COUNT.
     *
     * ⭐ REVIEW FINDING PERF-02. The feed reads through `SmartListQueryBuilder.executeRecords`, the
     * records-only member, so the selection issues ONE statement rather than a count followed by a page.
     * `product.cfm:L16` loops the UNPAGED collection and never reads a total, so the count answered a
     * question the feed does not ask. An earlier revision of this case indexed `statements[1]` past a count
     * that no longer exists; the index is the assertion's own subject now, so it is stated rather than
     * assumed.
     */
    expect(statements[0]?.sql).toContain('FROM SwSku');
    expect(statements[0]?.sql).not.toContain('COUNT(');
    const projection = statements[0]?.sql ?? '';

    /*
     * SIX DECLARED, FIVE EMITTED, AND THE ARITHMETIC IS THE ASSERTION. Two layers contribute joins to one
     * list, which is what makes this seam worth a case at all:
     *   • `model/service/SkuService.cfc:L314-L316` registers THREE on every SKU smart list — `product`,
     *     `productType` and a LEFT `alternateSkuCodes` — because five of its keyword properties cannot
     *     resolve without them.
     *   • `integrationServices/google/controllers/feed.cfc:L64-L66` then registers THREE more, and the
     *     FIRST of those repeats `("SlatwallSku","product")` verbatim.
     * `org/Hibachi/HibachiSmartList.cfc:L269` finds that key already registered and appends nothing — no
     * entity, no alias and no FROM fragment — so the repeat is absorbed and six declarations emit five
     * joins. The `SwProduct` count below is what proves the absorption rather than a coincidence.
     */
    expect(PRODUCT_FEED_JOINS).toHaveLength(3);
    expect(projection.match(/ JOIN /g)).toHaveLength(5);
    expect(projection.match(/JOIN SwProduct\b/g)).toHaveLength(1);

    /* Every one of the five, named. The default-SKU join is a SECOND alias over the same physical table,
     * which is the pairing most likely to be dropped by an implementation that keyed joins by table. */
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
     * ⭐ THE BRAND JOIN IS A LEFT JOIN, AND NOTHING IN EITHER STATEMENT IS AN INNER ONE. An omitted kind
     * and an explicit `left` emit the same keyword (`org/Hibachi/HibachiSmartList.cfc:L537-L540`), so the
     * observable guarantee is the ABSENCE of an eliminating join rather than the presence of the word on
     * one of the five. It matters most for the brand: `Product.brand` is optional, and an inner join there
     * would silently drop every brandless product out of the merchant feed.
     */
    for (const statement of statements) {
      expect(statement.sql).not.toContain('INNER JOIN');
    }
    expect(projection).toContain('LEFT JOIN SwBrand');
  });

  it('[NET-NEW] emits the three activity filters and the QATS `1^` lower bound, all bound positionally (F7)', async () => {
    const { statements } = await dispatchEndToEndFeed();
    /* Statement 0, not 1: PERF-02's records-only read issues no count. See the joins case above. */
    const projection = statements[0];

    /* `feed.cfc:L68-L70` — the SKU's own flag, then the product's, then the product's publication. */
    expect(projection?.sql).toContain('aslatwallsku.activeFlag = ?');
    expect(projection?.sql).toContain('aslatwallproduct.activeFlag = ?');
    expect(projection?.sql).toContain('aslatwallproduct.publishedFlag = ?');

    /*
     * `feed.cfc:L72` — `addRange('product.calculatedQATS','1^')`. The trailing caret is the legacy's
     * open-ended upper bound, so the range emits a LOWER bound only: one predicate, `>=`, never
     * `BETWEEN`. This is the availability gate, and it is the reason `SmartListQueryPort` is a boundary
     * port rather than something the feed resolves itself — it reads a calculated inventory property.
     */
    expect(projection?.sql).toContain('aslatwallproduct.calculatedQATS >= ?');
    expect(projection?.sql).not.toContain('BETWEEN');
    expect(projection?.sql).not.toContain('<=');

    /*
     * Four values, in predicate order, and the bound one is the STRING `'1'` — the first element of the
     * two-character range value, carried as the legacy carries it rather than coerced to a number.
     * Nothing is interpolated: no quote and no identifier appears in either statement.
     */
    expect(projection?.params).toStrictEqual([1, 1, 1, '1']);
    for (const statement of statements) {
      expect(statement.sql).not.toContain("'");
      expect(statement.sql).not.toContain(END_TO_END_ID.product);
    }
  });

  it('[NET-NEW] hydrates the brand, the product type and the default SKU into the document (F7)', async () => {
    const { response, statements } = await dispatchEndToEndFeed();

    expect(response.statusCode).toBe(HTTP_STATUS.OK);
    expect(response.headers?.['Content-Type']).toBe(XML_CONTENT_TYPE);

    /*
     * FIVE STATEMENTS: the record projection, then ONE lookup per aggregate — product, product type,
     * brand, default SKU. Four lookups for two records is the point: the loaders batch by identifier
     * rather than issuing a statement per row, which is what keeps a whole-catalog feed from degenerating
     * into a statement storm.
     *
     * ⭐ IT WAS SIX, AND THE SIXTH WAS A COUNT — REVIEW FINDING PERF-02 REMOVED IT. The feed reads through
     * the records-only member, because `product.cfm:L16` loops the UNPAGED collection and never reads a
     * total, so the count answered a question the feed does not ask. The figure is asserted here rather
     * than left implicit precisely because it is one statement fewer than an earlier revision expected.
     */
    expect(statements).toHaveLength(5);
    expect(statements[0]?.sql).not.toContain('COUNT(');
    expect(statements[1]?.sql).toContain('FROM SwProduct WHERE productID IN (?)');
    expect(statements[2]?.sql).toContain('FROM SwProductType WHERE productTypeID IN (?)');
    expect(statements[3]?.sql).toContain('FROM SwBrand WHERE brandID IN (?)');
    expect(statements[4]?.sql).toContain('FROM SwSku WHERE skuID IN (?)');
    expect(statements[4]?.params).toStrictEqual([END_TO_END_ID.defaultSku]);

    const items = parseFeedItems(response.body);
    expect(items).toHaveLength(2);
    const [selected] = items;
    expect(selected).toBeDefined();
    if (selected === undefined) {
      throw new Error('The feed document carries no first item.');
    }

    /* The record's own column. */
    expect(soleChildText(selected, 'g:id')).toBe('FP-1-SKU');
    /* The PERSISTED calculated title, not the template-driven `getTitle()` — `product.cfm:L18`. */
    expect(soleChildText(selected, 'title')).toBe('PERSISTED-CALCULATED-TITLE');
    expect(soleChildText(selected, 'description')).toBe('A running shoe');

    /*
     * ⭐ THE THREE FIELDS THAT CAN ONLY COME FROM HYDRATION.
     *   • `g:product_type` — the `SwProductType` row, reached through the product.
     *   • `g:brand` — the `SwBrand` row, reached through the same product. Present only because the LEFT
     *     join above did not eliminate it and the loader attached it.
     *   • `g:price` — `99.00`, the DEFAULT SKU's price, NOT the selected record's `90.00`.
     *     `model/entity/Product.cfc:L563-L568` falls through to `defaultSku.getPrice()` because the
     *     product carries no override, and `price` is a column of `SwSku` rather than `SwProduct`, so
     *     every freshly mapped product takes that fall-through. A document that read the record's own
     *     price would show `90.00` here and would be wrong in exactly the way no unit case can see.
     */
    expect(soleChildText(selected, 'g:product_type')).toBe('Merchandise');
    expect(soleChildText(selected, 'g:brand')).toBe('Nike');
    expect(soleChildText(selected, 'g:price')).toBe('99.00');

    /* The item group is the PRODUCT's code, which is what groups variants together for the merchant. */
    expect(soleChildText(selected, 'g:item_group_id')).toBe('FP-1');

    /* The configured host reaches every absolute URL, and the product URL key comes from a setting. */
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

  it('[NET-NEW] emits one additional-image element per supplied image, in INPUT order, per record (F7)', async () => {
    const { response, imageReaderSubjects, images } = await dispatchEndToEndFeed();

    /* Consulted once per selected record, in selection order — never once per product. */
    expect(imageReaderSubjects).toStrictEqual([END_TO_END_ID.sku, END_TO_END_ID.defaultSku]);

    const items = parseFeedItems(response.body);
    const [selected, defaultSkuItem] = items;
    if (selected === undefined || defaultSkuItem === undefined) {
      throw new Error('The feed document does not carry both items.');
    }

    /*
     * ⭐ FOUR ELEMENTS, IN THE READER'S OWN ORDER, WITH THE REPEAT INTACT. The supplied order is third,
     * first, second, first. A document that sorted them, de-duplicated them, or emitted one element with
     * a joined value would differ from this expectation; `product.cfm:L24` loops the collection and emits
     * one element per entry, so the collection's order IS the document's order.
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

    /* The record the reader answered `[]` for emits none — the empty collection's legacy output. */
    expect(childrenNamed(defaultSkuItem, 'g:additional_image_link')).toStrictEqual([]);

    /*
     * ⭐ AND EVERY ONE OF THEM WENT THROUGH `ImagePathPort.getResizedImagePath`, which is the half of
     * review finding F4 that asked for the port to do the resolution rather than the reader. Four
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
    '[NET-NEW] answers the document from the ANONYMOUS address, and 404 from every other spelling (F7)',
    async () => {
      const { response } = await dispatchEndToEndFeed();

      /*
       * ⭐ THE ADDRESS IS `google:feed.product` AND IT IS UNGATED, WHICH IS A PORTED FACT RATHER THAN A
       * CHOICE. `integrationServices/google/views/main/default.cfm` documents the route as
       * `?slatAction=google:feed.product`, and `integrationServices/google/controllers/feed.cfc:L54-L56`
       * declares `this.publicMethods="product"` with `this.anyAdminMethods=""` and `this.secureMethods=""`
       * both EMPTY — so the legacy feed demanded neither a login nor a permission. It is therefore the ONE
       * route in this deliverable that answers a document rather than a 401, and the colon in its name is
       * part of the address rather than a namespace this router resolves.
       */
      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(response.body.startsWith(EXPECTED_XML_DECLARATION)).toBe(true);

      const channel = parseFeedChannel(response.body);
      expect(soleChildText(channel, 'title')).toBe('Slatwall Product Feed');
      expect(soleChildText(channel, 'link')).toBe(`http://${END_TO_END_HOST}`);

      /*
       * ⭐ THE ADDRESS IS EXACT IN ITS PUNCTUATION AND CASE-INSENSITIVE IN ITS LETTERS, WHICH IS TWO
       * FINDINGS MEETING RATHER THAN AN INCONSISTENCY.
       *   • The whole string is ONE declared key — the colon is part of the address, not a namespace this
       *     router resolves — so a reader who expects `org/Hibachi/FW1/framework.cfc`'s `slatAction`
       *     convention to treat `google` as a section and resolve variants of it is answered 404.
       *   • But the LETTERS match case-insensitively, restored under review finding F4, because CFML
       *     resolves `slatAction` case-insensitively and a deployment addressing the documented route in a
       *     different casing was served by the legacy. `createCanonicalActionLookup` normalises both the
       *     declared keys and the incoming value, which is why the assertion below is a 200 rather than the
       *     404 an earlier revision of this case expected.
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
    /* FIVE dispatches, each resetting the module registry and re-requiring the composition root and the
     * router, so this case costs materially more than its siblings. The budget is stated rather than left to
     * the 5-second default — a timeout here would read as a hang in the subject rather than as the cost of
     * loading the graph five times. */
    END_TO_END_MULTI_DISPATCH_TIMEOUT_MS,
  );
});
