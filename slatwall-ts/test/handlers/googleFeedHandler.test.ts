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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createGoogleFeedHandler } from '../../src/handlers/googleFeedHandler';
import { ProductFeedBuilder } from '../../src/integrations/google/ProductFeedBuilder';
import { ProductFeedQuery } from '../../src/integrations/google/ProductFeedQuery';
import { HTTP_STATUS, XML_CONTENT_TYPE } from '../../src/handlers/httpResponse';
import {
  ConfigurationError,
  DataIntegrityError,
  DomainError,
  LegacyParityError,
  NotImplementedError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
} from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import { toExactDecimal } from '../../src/util/formatting';

import type {
  GoogleFeedHandler,
  GoogleFeedHandlerCollaborators,
  ProductFeedSerializer,
} from '../../src/handlers/googleFeedHandler';
import type {
  ProductFeedImage,
  ProductFeedRecord,
  ProductFeedRenderContext,
} from '../../src/integrations/google/ProductFeedBuilder';
import type { ProductFeedSkuSource } from '../../src/integrations/google/ProductFeedQuery';
import type { Sku } from '../../src/domain/sku/Sku';
import type { SmartListInput, SmartListJoin } from '../../src/ports/SmartListQueryPort';

import { MERCHANDISE_PRODUCT_TYPE, MERCHANDISE_PRODUCT_TYPE_ID } from '../fixtures/productTypes';
import { createTestMerchandiseProductData } from '../fixtures/testProduct';
import {
  buildBrand,
  buildProduct,
  buildProductType,
  buildSku,
  createImagePathDouble,
  createPricingDouble,
  createSettingResolverDouble,
  type ImagePathDouble,
  type PricingDouble,
  type SettingSeed,
} from '../support/inMemoryRepositories';

/* =================================================================================================
 * Compile-time claims about the collaborator surface.
 *
 * The two mutual aliases are an exhaustiveness proof over the seams the handler accepts. They are the
 * cheapest and strongest form of "no budget, page size, chunk size, cursor, concurrency limit,
 * re-attempt count or cache lifetime was invented here" (M2, AAP §0.8.2 guideline 4): a sixth
 * collaborator of any kind would fail `tsc` before a single case ran.
 * ============================================================================================== */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

const COLLABORATOR_NAMES = [
  'feedQuery',
  'feedSerializer',
  'hostConfiguration',
  'readProductImages',
  'clock',
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

interface SelectionCall {
  readonly data: SmartListInput | undefined;
  readonly additionalJoins: readonly SmartListJoin[] | undefined;
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
  const skuSource: ProductFeedSkuSource = {
    getSkuSmartListRecords: (
      data?: SmartListInput,
      additionalJoins?: readonly SmartListJoin[],
    ): Promise<Sku[]> => {
      selectionCalls.push({ data, additionalJoins });

      if (seed.selectionFailure !== undefined) {
        return Promise.reject(seed.selectionFailure);
      }
      return Promise.resolve([...selectedSkus]);
    },
  };

  const builder = new ProductFeedBuilder(images.imagePaths, pricing.pricing, settings.resolver);

  const imageReaderCalls: string[] = [];
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
    skuCode,
    secondSkuCode,
    selectionCalls,
    imageReaderCalls,
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
    const response = await (signal === undefined ? handler.product() : handler.product({ signal }));

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

const HANDLER_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'handlers', 'googleFeedHandler.ts');

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

  it('[NET-NEW] uses whatever host configuration supplies, without validating or normalising it', async () => {
    const scenario = createHandlerScenario({ host: SECOND_RENDER_HOST });
    const { response } = await invoke(scenario.handler);

    /*
     * ⛔ WITHDRAWN HOST GATE. The grammar validator and the `allowedHosts` membership check that once
     * wrapped this read are both withdrawn, and `googleFeedHandler.ts:L717-L720` records the residual
     * exposure rather than re-adding them. The QA finding INFO-1 covers the same decision. What is
     * asserted is the CURRENT behaviour: the configured value is passed through unmodified.
     */
    expect(response.body).toContain(`<link>http://${SECOND_RENDER_HOST}</link>`);
    expect(response.body).not.toContain(RENDER_HOST);
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

  it('[NET-NEW] composes no selection of its own, passing the declared input straight through', async () => {
    const scenario = createHandlerScenario();

    await invoke(scenario.handler);

    /*
     * `feed.cfc:L63` makes one call with the selection declared up front, and `ProductFeedQuery` owns that
     * declaration. The handler must contribute nothing: no companion joins, and no second call.
     */
    expect(scenario.selectionCalls).toHaveLength(1);
    expect(scenario.selectionCalls[0]?.additionalJoins).toBeUndefined();
    expect(scenario.selectionCalls[0]?.data).toBeDefined();
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
      new NotImplementedError('SkuService.processImageUpload', 'the image service is out of scope'),
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
  it('[NET-NEW] admits no budget, page size, chunk, cursor or concurrency collaborator', () => {
    /*
     * ⚠️ M2 (AAP §0.6.6) — `product.cfm:L9` asks for `requesttimeout="360"`, which exceeds what a
     * synchronous gateway in front of this function will generally allow. Flagging is the required
     * response and solving is the forbidden one (AAP §0.8.2 guideline 4), so the file must not have
     * acquired a control that quietly resolves it. The compile-time aliases above are the exhaustiveness
     * proof; this case asserts the same five names as values so the list itself cannot silently change.
     */
    expect(COLLABORATOR_NAMES).toEqual([
      'feedQuery',
      'feedSerializer',
      'hostConfiguration',
      'readProductImages',
      'clock',
    ]);
    expect(COLLABORATOR_NAMES).toHaveLength(5);
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
