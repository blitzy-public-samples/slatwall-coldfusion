/**
 * ProductFeedBuilder — the RSS 2.0 serializer for the Google merchant product feed, translated from
 * `integrationServices/google/views/feed/product.cfm:L1-L66`.
 *
 * Where the real work lands
 * A view template being the primary source for a serializer class looks wrong until the folder split
 * is understood, so it is recorded before the code. Four legacy files were candidate homes for the
 * Google feed logic (AAP §0.6.4), and the shaping lives in none of the places a service-oriented
 * reading would predict:
 *
 * - `integrationServices/google/Integration.cfc` (79 lines) — the interface-conformant component,
 * carrying no feed logic whatsoever. Its port, `googleIntegration.ts`, is therefore nearly
 * empty by faithfulness, not by neglect.
 * - `integrationServices/google/controllers/feed.cfc` (74 lines) — record selection only: which
 * SKUs appear. Its port is `ProductFeedQuery.ts`, which is delivered: it carries the three
 * related-property joins, the three activity filters and the availability range, and it resolves
 * the relationships this file's sixteen fields dereference.
 * - `integrationServices/google/views/feed/product.cfm` (66 lines) — all of the data shaping. This is
 * the source for every field mapping below.
 * - `integrationServices/google/model/dao/FeedDAO.cfc` (76 lines) — orphaned dead code with zero
 * callers repository-wide and a statement that could never have executed. Deliberately not ported and
 * not repaired: that is defect D12, whose itemised evidence lives in `./README.md` §9 so the finding
 * has one home.
 *
 * M2 (AAP §0.6.6) is flagged and owned by `../../handlers/googleFeedHandler.ts`: the legacy view asks for
 * `requesttimeout="360"` at `integrationServices/google/views/feed/product.cfm:L9`, and the delivery-model
 * decision is left open there. This serializer accepts no cancellation, sets no budget and re-times
 * nothing, so it settles no part of that decision either.
 */

import type { Product } from '../../domain/product/Product';
import type { ProductType } from '../../domain/product/ProductType';
import type { Sku } from '../../domain/sku/Sku';
import { ConfigurationError, DataIntegrityError, DomainError } from '../../errors/DomainError';
/*
 * Neither `ImageWebPath` nor `SaveImageFileRequest` is imported, and no memo decorator wraps the port.
 * A decorator would have to re-declare every member of {@link ImagePathPort} in order to delegate the ones
 * it did not wrap, which is why this file names only the port it is handed and the one request shape it
 * builds; `ImageWebPath` appears in prose as a `{@link}` only, which needs no import.
 */
import type { ImagePathPort, ResizedImagePathRequest } from '../../ports/ImagePathPort';
/*
 * `compareExactDecimal` is a runtime import, not a type-only one: `ExactDecimal` is a branded string, so
 * `>` between two of them compiles and silently orders lexicographically — `'9.00' > '10.00'` is true. The
 * sale-price guard is ordered digit-wise instead; the full account is on the comparison itself.
 */
/*
 * `formatDate` is the subtree's port of CFML's `dateFormat`, mask grammar and local components and
 * all. Both effective-date endpoints go through it with the legacy's own mask; see
 * {@link EFFECTIVE_DATE_MASK}.
 */
import { compareExactDecimal, formatDate, type ExactDecimal } from '../../util/formatting';
/* Runtime import: the display tag. See the call site in the additional-image loop. */
import { toImageWebPath } from '../../ports/ImagePathPort';
import type { PricingPort } from '../../ports/PricingPort';
import type {
  SettingResolutionContext,
  SettingResolverPort,
} from '../../ports/SettingResolverPort';

/* Input types — declared here, and deliberately only here. */

/*
 * The two fail-closed gates: their invented forms are gone, their narrow forms are in force
 * what was here originally, and what stays gone. Two fail-closed gates and their invented grammars:
 * - A module-private `FEED_HOST_AUTHORITY` symbol, a branded `FeedHostAuthority` type, a
 * `FEED_HOST_AUTHORITY_PATTERN` character allowlist, RFC 1035's 63-octet DNS-label ceiling and a
 * `validateFeedHostAuthority` function that raised on a miss. The brand was unforgeable, so a raw
 * host became a compile error.
 */

/*
 * The host gate is a plain deny check, not a branded type. {@link validateFeedHostAuthority} is declared
 * with the two URL controls further down as a `(host: string) => void` refusal of the origin-moving
 * characters; there is no unique symbol, no branded type, no character allowlist and no DNS-label octet
 * ceiling behind it, because a deny list of the characters that move an origin needs none of those and an
 * allowlist would have invented a closed set the legacy input does not have.
 *
 * This file also performs no port memoisation: both collaborators are read straight off `this`, once per
 * sink. `integrationServices/google/views/feed/product.cfm:L23-L24` resolves a path per image and repeats
 * a product-wide sale-price read per record, and that repetition is behaviour — removing it would be the
 * performance refactoring AAP §0.1.1.1 states this migration explicitly is not.
 */

/*
 * The three URL paths — where they come from, and why nothing is done to them
 * Three of the document's URLs are the scheme + host + a path this module did not compose:
 * - The item `link` (`product.cfm:L22`) takes `/<globalURLKeyProduct>/<urlTitle>/`, whose two
 * segments come from a setting and from a persisted column;
 * - `g:image_link` (`:L23`) and each `g:additional_image_link` (`:L24`) take a path composed by
 * the image adapter, which may fall back to the value of the missing-image setting.
 */

/** The ambient state the legacy view read from its request, made explicit. */
export interface ProductFeedRenderContext {
  /**
   * The host authority, replacing `CGI.HTTP_HOST`
   * (`integrationServices/google/views/feed/product.cfm:L14`, `L15`, `L22`, `L23`, `L24`).
   */
  readonly host: string;

  /**
   * The render instant, replacing `now`
   * (`integrationServices/google/views/feed/product.cfm:L30`, which reads it twice).
   */
  readonly renderTime: Date;

  /**
   * The UTC hour offset, replacing `getTimeZoneInfo().utcHourOffset`
   * (`integrationServices/google/views/feed/product.cfm:L30`, which reads it twice).
   */
  readonly utcHourOffset: string;
}

/** One of a product's images, reduced to what the feed actually needs. */
export interface ProductFeedImage {
  /**
   * This image's own path, as `model/entity/Image.cfc:L79-L81` constructs it from the image's
   * `directory` column — the value the legacy assigns at `model/entity/Image.cfc:L123` before
   * delegating to the image service.
   */
  readonly imagePath: string;

  /** An optional per-image override for the missing-image path. */
  readonly missingImagePath?: string;
}

/** One materialised feed record: a SKU together with its product's images. */
export interface ProductFeedRecord {
  readonly sku: Sku;

  /** The product's images, in their existing array order. */
  readonly productImages: readonly ProductFeedImage[];
}

/* Document literals. */

/**
 * The XML declaration, byte-exact from
 * `integrationServices/google/views/feed/product.cfm:L1`.
 */
const XML_DECLARATION = '<?xml version="1.0"?>';

/**
 * The root element, byte-exact from `integrationServices/google/views/feed/product.cfm:L11`,
 * including the RSS version and the Google namespace binding that every `g:` element depends on.
 */
const RSS_OPEN_TAG = '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">';

const CHANNEL_TITLE = 'Slatwall Product Feed';

/**
 * The channel description prefix, byte-exact from
 * `integrationServices/google/views/feed/product.cfm:L15`, where the host is appended directly to it.
 * The prefix carries none of the four XML metacharacters, so escaping the assembled description would
 * leave this half of it untouched.
 */
const CHANNEL_DESCRIPTION_PREFIX = 'Google Product Feed for http://';

/**
 * The scheme this serializer writes ahead of the host in all five of its absolute URLs — the channel
 * link and description (`integrationServices/google/views/feed/product.cfm:L14`, `:L15`), the item link
 * (`:L22`), `g:image_link` (`:L23`) and each `g:additional_image_link` (`:L24`).
 */
const FEED_SCHEME_PREFIX = 'http://';

/** Fixed condition value from `integrationServices/google/views/feed/product.cfm:L25`. */
const CONDITION_VALUE = 'new';

/**
 * Fixed availability value from `integrationServices/google/views/feed/product.cfm:L26`, including
 * the single interior space. Both values are constants in the legacy: the feed reports every SKU as
 * new and in stock unconditionally, and no inventory member is consulted — which is consistent with
 * every inventory service being out of scope (AAP §0.2.2.1).
 */
const AVAILABILITY_VALUE = 'in stock';

const INDENT_UNIT = '\t';

/**
 * The single tab the legacy template leaves after `</g:sale_price_effective_date>`, on that element's
 * own line, at `integrationServices/google/views/feed/product.cfm:L30`.
 */
const SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB = '\t';

/* Escaping — the legacy's own escaper, at the legacy's own six sites and nowhere else. */

/**
 * Escapes a value for an XML element's text content, using the legacy `htmlEditFormat`'s own four
 * substitutions.
 *
 * @param value the text to escape; numbers are accepted and stringified, because most escaped fields are
 * textual but the two monetary ones are not, and the parameter stays permissive rather than forcing a
 * call-site cast
 *
 * @param locator the `product.cfm` line this sink reproduces, reported in the diagnostic when the value
 * cannot be represented in XML so a poisoned record is traceable to the field that carried it
 *
 * @returns the escaped text.
 */
function escapeFeedText(value: string | number, locator: string): string {
  const text = String(value);

  assertRepresentableInXml(text, locator);

  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Emits a dynamic value into the document exactly as stored, refusing only what XML cannot carry.
 *
 * @param value the value to emit; numbers are accepted and stringified for the two monetary fields
 * @param locator the `product.cfm` line this sink reproduces, reported in every diagnostic below
 * @returns the value unchanged
 * @throws {DataIntegrityError} when the value would make the published document unparseable.
 */
function renderRawFeedNode(value: string | number, locator: string): string {
  const text = String(value);

  assertRepresentableInXml(text, locator);

  const offendingIndex = text.search(RAW_SINK_MARKUP_CHARACTER_PATTERN);
  if (offendingIndex !== -1) {
    throw new DataIntegrityError(
      'A Google product feed value carries an XML markup character in a field the legacy template ' +
        'emits unescaped, so the document would be published unparseable; it is refused instead.',
      {
        context: {
          locator,
          offset: offendingIndex,
          codePoint: describeCodePointAt(text, offendingIndex),
        },
      },
    );
  }

  const cdataTerminatorIndex = text.indexOf(CDATA_SECTION_TERMINATOR);
  if (cdataTerminatorIndex !== -1) {
    throw new DataIntegrityError(
      'A Google product feed value carries the sequence XML 1.0 forbids in element content, so the ' +
        'document would be published unparseable; it is refused instead.',
      { context: { locator, offset: cdataTerminatorIndex } },
    );
  }

  return text;
}

/** The characters {@link renderRawFeedNode} refuses because they open markup in element content. */
const RAW_SINK_MARKUP_CHARACTER_PATTERN = /[&<]/u;

/** The only multi-character sequence XML 1.0 forbids inside element content. */
const CDATA_SECTION_TERMINATOR = ']]>';

/**
 * Refuses a value carrying a code point XML 1.0 cannot represent.
 *
 * @param text the already-stringified value about to be written into a text node
 * @param locator the `product.cfm` line of the sink that carried it
 * @throws {DataIntegrityError} when any code point falls outside the `Char` production.
 */
function assertRepresentableInXml(text: string, locator: string): void {
  let offset = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0);

    if (codePoint !== undefined && isXmlRepresentableCodePoint(codePoint)) {
      offset += character.length;
      continue;
    }

    throw new DataIntegrityError(
      'A Google product feed value carries a code point XML 1.0 cannot represent, so no escaping can ' +
        'make the document parseable; it is refused rather than published malformed.',
      { context: { locator, offset, codePoint: describeCodePointAt(text, offset) } },
    );
  }
}

/**
 * Answers whether a code point is admitted by the XML 1.0 `Char` production.
 *
 * @param codePoint the code point to classify
 * @returns `true` when XML 1.0 can represent it.
 */
function isXmlRepresentableCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

/**
 * Renders the code point at an offset as `U+XXXX`, for a diagnostic that must not echo the value.
 *
 * @param text the value being classified
 * @param offset the code-unit offset of the offending character
 * @returns the code point in `U+XXXX` form, or `U+????` when the offset holds nothing.
 */
function describeCodePointAt(text: string, offset: number): string {
  const codePoint = text.codePointAt(offset);

  if (codePoint === undefined) {
    return 'U+????';
  }

  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/*
 * There is no `escapeFeedXml`. A second escaper covering `&`, `<` and `>` was declared alongside
 * {@link escapeFeedText}, which covers those three plus `"`. Two escapers for one document is a
 * correctness hazard rather than a choice — a future sink would be escaped by whichever one the author
 * happened to reach for, and the weaker one leaves an attribute-delimiter character unescaped. The
 * stronger, already-wired helper is the survivor and every escaped sink in this file calls it.
 */

/*
 * There is no `encodeFeedUrlPath`, and no `URL_PATH_SEPARATOR`. A per-segment percent-encoder stood
 * here and ran on all three data-derived URL paths — the item `link`
 * (`integrationServices/google/views/feed/product.cfm:L22`), `g:image_link` (`:L23`) and each
 * `g:additional_image_link` (`:L24`). It split each path on `/`, ran `encodeURIComponent` over every
 * segment and re-joined, so `@evil.example/x` in a stored path could not terminate the authority of
 * `<scheme>://<host><path>`.
 */

/*
 * There is no raw-sink policy of any kind — no grammar, no encoding, no refusal
 * the governing test, and the three readings of it this file has passed through. AAP §0.6.7.7 declares
 * one departure from byte-for-byte preservation in the whole port: `model/dao/ProductDAO.cfc` interpolates
 * 21 statements from file-supplied values, and the port binds parameters instead (D18).
 */

/*
 * The two URL controls: the host authority and the appended path
 * every absolute URL in this document is `FEED_SCHEME_PREFIX` + host + path, and that composition can be
 * subverted from either side, so each side carries its own control: the authority is validated as
 * `host [ ":" port ]` (CWE-20 feeding CWE-601) by {@link validateFeedHostAuthority}, and every appended
 * path is constrained to a same-origin relative path (CWE-601) by {@link assertSameOriginRelativePath}.
 */

/**
 * The characters {@link validateFeedHostAuthority} refuses in a feed host, and why each one matters.
 */
const FEED_HOST_FORBIDDEN_CHARACTER_PATTERN = /[@/\\?#\u0000-\u0020\u007f-\u009f]/u;

/**
 * Refuses a render-context host that could move the origin of the document's absolute URLs.
 *
 * @param host the render-context host, as supplied
 * @throws {DataIntegrityError} when the host is blank or carries an origin-moving character.
 */
export function validateFeedHostAuthority(host: string): void {
  if (host.trim().length === 0) {
    throw new DataIntegrityError(
      'The Google product feed host is blank, so the five absolute URLs of the document would carry no ' +
        'authority at all; the render is refused rather than published with unresolvable links.',
      { context: { locator: FEED_HOST_LOCATOR } },
    );
  }

  const offendingIndex = host.search(FEED_HOST_FORBIDDEN_CHARACTER_PATTERN);

  if (offendingIndex !== -1) {
    throw new DataIntegrityError(
      'The Google product feed host carries a character that would move the origin of every absolute ' +
        'URL in the document: "@" introduces userinfo, "/" and "\\" begin a path, "?" a query and "#" a ' +
        'fragment, and whitespace and control characters are admitted in no authority. RFC 9110 ' +
        'section 7.2 defines the Host field this value stands in for as an RFC 3986 authority, which ' +
        'contains none of them, so the render is refused.',
      {
        context: {
          locator: FEED_HOST_LOCATOR,
          offset: offendingIndex,
          codePoint: describeCodePointAt(host, offendingIndex),
        },
      },
    );
  }
}

/**
 * The `product.cfm` line named in every host diagnostic — the first of the five sinks that carries it.
 */
const FEED_HOST_LOCATOR = 'integrationServices/google/views/feed/product.cfm:L14';

/**
 * Refuses an appended path that would leave the feed's own origin.
 *
 * @param path the value about to be appended to the absolute URL prefix
 * @param locator the `product.cfm` line of the sink that carries it
 * @throws {DataIntegrityError} when the path is not a same-origin relative path.
 */
function assertSameOriginRelativePath(path: string, locator: string): void {
  if (!path.startsWith(URL_PATH_ROOT) || path.startsWith(PROTOCOL_RELATIVE_PREFIX)) {
    throw new DataIntegrityError(
      'A Google product feed URL path must be a same-origin relative path beginning with a single "/". ' +
        'a value that begins with anything else can graft an authority onto the end of the host, and one ' +
        'that begins with "//" is protocol-relative and discards the host entirely, so either would ' +
        "move the URL off the feed's own origin. The value is refused rather than rewritten, because " +
        'silently publishing a corrected URL would hide the misconfiguration.',
      { context: { locator, length: path.length } },
    );
  }

  const offendingIndex = path.search(FEED_PATH_FORBIDDEN_CHARACTER_PATTERN);

  if (offendingIndex !== -1) {
    throw new DataIntegrityError(
      'A Google product feed URL path carries a backslash, whitespace or a control character. A ' +
        'backslash is normalised to "/" by several URL parsers, which reopens the authority-grafting ' +
        'route the leading-slash rule closes, and whitespace and control characters are admitted in no ' +
        'URL. The value is refused.',
      {
        context: {
          locator,
          offset: offendingIndex,
          codePoint: describeCodePointAt(path, offendingIndex),
        },
      },
    );
  }
}

/** The single character a same-origin relative path must begin with. */
const URL_PATH_ROOT = '/';

/** The protocol-relative prefix that discards the authority it is appended to. */
const PROTOCOL_RELATIVE_PREFIX = '//';

/** The characters {@link assertSameOriginRelativePath} refuses anywhere in an appended path. */
const FEED_PATH_FORBIDDEN_CHARACTER_PATTERN = /[\\\u0000-\u0020\u007f-\u009f]/u;

/*
 * Time of day — hand-built, because it is this file's responsibility and nobody else's.
 * The calendar-date half is not hand-built: it goes through the shared `dateFormat` port under
 * {@link EFFECTIVE_DATE_MASK}, declared with the endpoint renderer further down.
 */

/**
 * Renders a 24-hour zero-padded `HH:mm:ss`, reproducing the legacy `timeFormat(value, "HH:mm:ss")`
 * calls at `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * @param value the instant to render, read in the host's own zone exactly as `timeFormat` reads it
 * @returns the zero-padded time of day.
 */
function formatTimeOfDay(value: Date): string {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/* Monetary rendering. */

/*
 * — the exponential-form pattern that used to live here is gone with the expansion it served; see
 * {@link renderFeedMoney}. Its remaining home is `../../util/formatting`, at the coercion boundary where
 * a value can still arrive in that form.
 */

/**
 * Renders a monetary value as plain decimal text for `g:price` and `g:sale_price` .
 *
 * @param value the monetary value, as exact decimal text
 * @returns the same digits, at the same scale, never exponential.
 */
function renderFeedMoney(value: ExactDecimal): string {
  return value;
}

/*
 * The sale-price effective date — two endpoints, each a value's own components plus a bare label.
 */

/**
 * The `dateFormat` mask both effective-date endpoints are rendered with, carried verbatim from
 * `integrationServices/google/views/feed/product.cfm:L30`, which writes it twice.
 */
const EFFECTIVE_DATE_MASK = 'YYYY-MM-DD';

/**
 * Renders one endpoint of the `g:sale_price_effective_date` range: date, `T`, time of day, a literal
 * hyphen, then the raw offset — five of the eleven parts the legacy assembles at
 * `integrationServices/google/views/feed/product.cfm:L30`.
 *
 * TODO(parity): CFML engines disagree about that call. The legacy accessor's empty-string return is
 * fed straight into two format functions, and where one engine renders nothing another raises a
 * conversion failure, so the legacy behaviour for a sale with no expiration is engine-dependent. The
 * lenient branch is reproduced because it is the branch that produces output at all; no date is
 * invented, the render instant is not substituted for the missing expiration, no new error is
 * raised, and no defect number is minted for it.
 *
 * @param value the endpoint instant, or the empty string when absent
 * @param utcHourOffset the raw offset text, emitted unmodified
 * @returns the rendered endpoint.
 */
function renderEffectiveDateEndpoint(value: Date | '', utcHourOffset: string): string {
  /*
   * The offset is a label, not an operand. `product.cfm:L30` formats the value with `dateFormat`
   * and `timeFormat` — neither of which converts a zone — and only then appends the literal hyphen and
   * the raw offset text. So the components below are the value's own components and the offset takes
   * no part in computing them: an endpoint's date and time are identical whatever the offset says.
   */
  const datePart = value === '' ? '' : formatDate(value, EFFECTIVE_DATE_MASK);
  const timePart = value === '' ? '' : formatTimeOfDay(value);
  return `${datePart}T${timePart}-${utcHourOffset}`;
}

/* The builder. */

/**
 * Serializes catalogue records into the Google merchant product feed.
 *
 * @example
 * ```ts
 * const builder = new ProductFeedBuilder(imagePaths, pricing, settings);
 * Const xml = await builder.build(records, {
 * // from `config.googleFeed.host`, never from a request header — see the member's own note.
 * ```
 */
/** The two ceilings one rendered feed document may not exceed (CWE-400). */
export interface ProductFeedRenderBudget {
  /**
   * Answers the largest number of `g:additional_image_link` elements one record may emit.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   * `CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD`
   */
  readonly resolveMaximumImagesPerRecord: () => number;

  /**
   * Answers the largest number of bytes the rendered document may reach.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   * `CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES`
   */
  readonly resolveMaximumResponseBytes: () => number;
}

/**
 * Builds the fail-closed render budget from whatever figures a deployment stated.
 *
 * @param maximumImagesPerRecord the per-record image ceiling this deployment stated, or `undefined`
 * @param maximumResponseBytes the document byte ceiling this deployment stated, or `undefined`
 */
export function createProductFeedRenderBudget(
  maximumImagesPerRecord: number | undefined,
  maximumResponseBytes: number | undefined,
): ProductFeedRenderBudget {
  const requirePositiveSafeInteger = (value: number | undefined, member: string): void => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new DomainError(
        `The product-feed ${member} must be a positive safe integer, so the configured value cannot ` +
          `bound a render.`,
        { context: { member, value } },
      );
    }
  };

  requirePositiveSafeInteger(maximumImagesPerRecord, 'image ceiling');
  requirePositiveSafeInteger(maximumResponseBytes, 'byte ceiling');

  const resolve = (value: number | undefined, variable: string, refusal: string): number => {
    if (value !== undefined) {
      return value;
    }

    throw new ConfigurationError(
      `${refusal} Set ${variable}, or supply resourceBounds when composing the container.`,
      {
        context: {
          locator: 'integrationServices/google/views/feed/product.cfm:L16-L62',
          variable,
        },
      },
    );
  };

  return Object.freeze({
    resolveMaximumImagesPerRecord: (): number =>
      resolve(
        maximumImagesPerRecord,
        'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD to the largest number of additional image links ' +
          'this deployment permits one feed record to emit',
        'The anonymous product feed refuses to expand a record by an unbounded number of images.',
      ),
    resolveMaximumResponseBytes: (): number =>
      resolve(
        maximumResponseBytes,
        'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES to the largest document size in bytes this deployment ' +
          'permits the product feed to answer',
        'The anonymous product feed refuses to buffer a document of unbounded size.',
      ),
  });
}

export class ProductFeedBuilder {
  /**
   * @param imagePaths resolves the primary and additional resized image paths — the only route to
   * the out-of-scope image service (TR-5)
   *
   * @param pricing resolves sale-price detail across the excluded pricing boundary (TR-5); handed
   * straight to the domain entity's sale-price members, which is where the legacy fallback lives
   *
   * @param settings resolves configuration keys synchronously (M8) — never awaited (TR-5)
   */
  public constructor(
    private readonly imagePaths: ImagePathPort,
    private readonly pricing: PricingPort,
    private readonly settings: SettingResolverPort,
    private readonly renderBudget: ProductFeedRenderBudget,
  ) {}

  /**
   * Renders the complete feed document.
   *
   * @param records the already-materialised SmartList records, rendered in the order given
   * @param context the render-time replacements for the legacy request globals
   * @returns the complete RSS document
   * @throws {DomainError} when a record's SKU carries no product, reproducing the legacy null
   * dereference — see {@link ProductFeedBuilder.buildItem}.
   */
  public async build(
    records: readonly ProductFeedRecord[],
    context: ProductFeedRenderContext,
  ): Promise<string> {
    /*
     * The gate runs here, and its position is the whole of why the refusal is atomic. It stands ahead
     * of the prefix composition and ahead of the first `lines` entry, so a rejection means no line was
     * pushed, {@link ProductFeedBuilder.buildItem} was never entered and no port was called — there is no
     * partially rendered document and no observable side effect. `src/config/env.ts` applies the same rule
     * to the configured value at load, so a caller who assembled this context by hand is judged too.
     */
    validateFeedHostAuthority(context.host);

    const absoluteUrlPrefix = `${FEED_SCHEME_PREFIX}${context.host}`;
    const channelLink = absoluteUrlPrefix;
    const channelDescription = `${CHANNEL_DESCRIPTION_PREFIX}${context.host}`;

    const lines: string[] = [
      XML_DECLARATION,
      RSS_OPEN_TAG,
      `${INDENT_UNIT}<channel>`,
      `${INDENT_UNIT.repeat(2)}<title>${CHANNEL_TITLE}</title>`,
      /*
       * TODO(parity) CWE-91 — both channel values are raw, exactly as `:L14` and `:L15` emit them. Each
       * interpolates the configured host into an element's text content, so XML markup in that value
       * would close `<link>` or `<description>` and open elements of its own — and at channel level a
       * single bad configured value corrupts the whole document rather than one item. Both sinks are raw
       * at `:L14` and `:L15`, so {@link renderRawFeedNode} carries them and refuses `&` and `<` rather
       * than escaping them: the nine raw fields keep their byte parity and the markup route stays closed.
       * The host is not percent-encoded either, because a legitimate authority carries `:` before a port;
       * {@link validateFeedHostAuthority} gates it.
       */
      `${INDENT_UNIT.repeat(2)}<link>${renderRawFeedNode(channelLink, 'integrationServices/google/views/feed/product.cfm:L14')}</link>`,
      `${INDENT_UNIT.repeat(2)}<description>${renderRawFeedNode(
        channelDescription,
        'integrationServices/google/views/feed/product.cfm:L15',
      )}</description>`,
    ];

    /*
     * `for...of` rather than an index loop: it needs no bounds arithmetic and yields a defined
     * element on every iteration, so `noUncheckedIndexedAccess` is satisfied without narrowing.
     */
    for (const record of records) {
      lines.push(await this.buildItem(record, context, absoluteUrlPrefix));
    }

    lines.push(`${INDENT_UNIT}</channel>`, '</rss>');

    const document = lines.join('\n');

    /* The document byte ceiling (CWE-400). */
    const maximumResponseBytes = this.renderBudget.resolveMaximumResponseBytes();
    const documentBytes = Buffer.byteLength(document, 'utf8');

    if (documentBytes > maximumResponseBytes) {
      throw new DomainError(
        'The rendered product feed exceeded the configured response-byte budget, so it was refused ' +
          'rather than answered as a truncated, malformed document.',
        {
          context: {
            documentBytes,
            maximumResponseBytes,
            records: records.length,
            locator: 'integrationServices/google/views/feed/product.cfm:L16-L62',
          },
        },
      );
    }

    return document;
  }

  /**
   * Renders one `item` element — the sixteen fields of
   * `integrationServices/google/views/feed/product.cfm:L16-L62`, in the legacy's own source order.
   *
   * @param record the SKU and its product's images
   * @param context the render-time replacements for the legacy request globals
   * @param absoluteUrlPrefix the `http://<host>` prefix, composed once per render by
   * {@link ProductFeedBuilder.build} from {@link ProductFeedRenderContext.host}, whose authority it has
   * already gated
   *
   * @returns the rendered `item` element.
   */
  private async buildItem(
    record: ProductFeedRecord,
    context: ProductFeedRenderContext,
    absoluteUrlPrefix: string,
  ): Promise<string> {
    const sku = record.sku;
    const product = this.requireProduct(sku);
    /*
     * `absoluteUrlPrefix` is composed once by {@link ProductFeedBuilder.build}, this method's only
     * caller, and passed in — so the `http://<host>` text is assembled in exactly one place, and its
     * authority was gated there before the first byte of the document existed. What this method gates is
     * the other half: every per-record path it appends goes through
     * {@link assertSameOriginRelativePath} at the sink that appends it, because `product.cfm:L22-L24`
     * appends them with no test and a path that does not begin with `/` lands inside the authority.
     * Both halves fail closed: an unstated ceiling refuses rather than defaulting to unbounded.
     */
    const fields: string[] = [];

    /* 1. `g:id` — escaped (`product.cfm:L17`). */
    fields.push(
      `<g:id>${escapeFeedText(sku.skuCode ?? '', 'integrationServices/google/views/feed/product.cfm:L17')}</g:id>`,
    );

    /*
     * 2. `title` — escaped (`product.cfm:L18`).
     * The persisted `calculatedTitle`, not `getTitle()`. The two are different members and the
     * distinction is easy to lose: `calculatedTitle` is a persisted column the legacy ORM exposed
     * through a synthesized accessor, whereas `model/entity/Product.cfc:L540-L545`'s `getTitle()` is
     * a template-driven member that interpolates the `productTitleString` setting at render time.
     * The feed reads the persisted column, so this file never calls `getTitle()` and never touches
     * the string-template expander that serves it. Do not "upgrade" this to the live title.
     */
    fields.push(
      `<title>${escapeFeedText(product.calculatedTitle ?? '', 'integrationServices/google/views/feed/product.cfm:L18')}</title>`,
    );

    /*
     * 3. `description` — escaped, three-way (`product.cfm:L19`).
     */
    fields.push(
      `<description>${escapeFeedText(
        this.selectDescription(product),
        'integrationServices/google/views/feed/product.cfm:L19',
      )}</description>`,
    );

    /*
     * 4. `g:google_product_category` — always present, always empty (`product.cfm:L20`). ---
     * the category drift trap, and the single most tempting "obvious improvement" in this folder.
     */
    fields.push('<g:google_product_category></g:google_product_category>');

    /*
     * 5. `g:product_type` — escaped (`product.cfm:L21`).
     * The double-escape is real and is preserved. `model/entity/ProductType.cfc:L273-L278` joins a
     * type hierarchy with the literal html entity text ` &raquo; ` — that separator lives in
     * `src/domain/product/ProductType.ts`, which is why the hierarchy walk is not re-implemented here
     * and only the finished string is read. Passing it through the escaper turns its `&` into
     * `&amp;`, so the emitted feed carries `&amp;raquo;` rather than `&raquo;`. That is exactly what
     * the legacy emits at `product.cfm:L21`, so it is neither special-cased nor exempted from
     * escaping nor "fixed".
     */
    fields.push(
      `<g:product_type>` +
        `${escapeFeedText(
          /*
           * The type is required ; its simple representation may still be absent, and an absent
           * representation renders as empty exactly as `htmlEditFormat` of an empty value does. The
           * distinction matters: `:L21` dereferences the association unguarded, not the string.
           */
          this.requireProductType(
            product,
            'integrationServices/google/views/feed/product.cfm:L21',
          ).getSimpleRepresentation() ?? '',
          'integrationServices/google/views/feed/product.cfm:L21',
        )}` +
        `</g:product_type>`,
    );

    /*
     * 6. item `link` — raw, as at `product.cfm:L22`.
     * `model/entity/Product.cfc:L207-L209` builds the path as `"/#setting('globalURLKeyProduct')#/`
     * `#getURLTitle()#/"`, carrying both a leading and a trailing slash, so the emitted URL is
     * `http://<host>/<globalURLKeyProduct>/<urlTitle>/`. neither slash is trimmed and the two
     * segments are not re-joined by a path helper.
     */
    const productUrlPath = product.getProductURL(this.settings);

    assertSameOriginRelativePath(
      productUrlPath,
      'integrationServices/google/views/feed/product.cfm:L22',
    );
    fields.push(
      `<link>${renderRawFeedNode(
        `${absoluteUrlPrefix}${productUrlPath}`,
        'integrationServices/google/views/feed/product.cfm:L22',
      )}</link>`,
    );

    /*
     * 7. `g:image_link` — raw, as at `product.cfm:L23`.
     * TR-5: {@link ImagePathPort} is the only route to a resized image path. Nothing here imports a
     * file-system, path or URL built-in, probes for existence, reconstructs the hardcoded SKU image
     * segment or reads the image-folder setting directly.  TODO(parity): the deprecated size gate
     * is dead on this path, and calling the domain member with no size argument is what reproduces
     * that. `product.cfm:L23` calls the resized-path member with zero arguments, so the four-part
     * gate at `model/entity/Sku.cfc:L203` never fires: no width, no height and no `scaleBest`
     * resize method ever reach the image service from the feed. Only the image path (`:L195`) and
     * the missing-image path (`:L198-L199`) do, which means the image service's own zero-argument
     * defaults govern — `model/service/ImageService.cfc:L78` declares them as a `scale` resize
     * method, a `center` crop location and an empty canvas colour. No size token is invented to
     * fill the gap: the size segment is an open string rather than a closed set, so whatever the
     * caller stores is what the path carries.
     */
    /*
     * CWE-91 — raw bytes with markup refused, on the same terms as the item link above. The path is
     * whatever the image adapter composed, and it may be the value of the missing-image setting, so it is
     * data rather than a constant: `src/ports/ImagePathPort.ts` is explicit that {@link ImageWebPath} is a
     * purely nominal label which "asserts nothing about the value". The brand is therefore no substitute
     * for a control, which is why {@link renderRawFeedNode}'s refusal applies here too — and why the
     * missing-image setting is named at there is no `encodeFeedUrlPath` as the reason no leading-slash
     * gate can be minted.
     */
    const resizedImagePath = await sku.getResizedImagePath(this.imagePaths, this.settings);

    /*
     * 's path constraint, on the same terms as the item link. This value may be the missing-image
     * setting rather than a composed path — `src/ports/ImagePathPort.ts` is explicit that
     * {@link ImageWebPath} "asserts nothing about the value" — so it is operator-supplied text in a URL
     * position and is held to the rule rather than trusted for its brand.
     */
    assertSameOriginRelativePath(
      resizedImagePath,
      'integrationServices/google/views/feed/product.cfm:L23',
    );
    fields.push(
      `<g:image_link>${renderRawFeedNode(
        `${absoluteUrlPrefix}${resizedImagePath}`,
        'integrationServices/google/views/feed/product.cfm:L23',
      )}</g:image_link>`,
    );

    /*
     * 8. repeated `g:additional_image_link` — raw, as at `product.cfm:L24`.
     * One element per product image, in the existing array order: no sort, no de-duplication, no
     * filtering, no existence probe. Zero images yields zero elements.
     */
    /* The per-record image ceiling (CWE-400). */
    const maximumImagesPerRecord = this.renderBudget.resolveMaximumImagesPerRecord();

    if (record.productImages.length > maximumImagesPerRecord) {
      throw new DomainError(
        'A product feed record carries more images than the configured per-record image budget ' +
          'admits, so the record was refused before any image path was resolved rather than emitted ' +
          'with a silently shortened image list.',
        {
          context: {
            images: record.productImages.length,
            maximumImagesPerRecord,
            locator: 'integrationServices/google/views/feed/product.cfm:L24',
          },
        },
      );
    }

    for (const image of record.productImages) {
      /*
       * / ImagePathPort: the port's request now types `imagePath` as
       * `ImageWebPath`, so a raw `string` cannot be handed to it and the URL-versus-file-system
       * distinction is carried in the type rather than in prose.
       */
      const request: ResizedImagePathRequest = {
        imagePath: toImageWebPath(image.imagePath),
        missingImagePath: image.missingImagePath ?? this.settings.setting('imageMissingImagePath'),
      };
      /*
       * TODO(parity) — neither encoded nor escaped, exactly as the primary image above and exactly as
       * `:L24` emits it. The missing-image setting can be the value that ends up here, so this path is no
       * more trusted than the primary one and is treated identically — which now means not at all.
       */
      const additionalImagePath = await this.imagePaths.getResizedImagePath(request);

      /*
       * 's path constraint, applied per image. Same reasoning as the primary image above: the
       * missing-image setting can be the value that ends up here, so every one of the `n * i` paths this
       * loop resolves is held to the rule.
       */
      assertSameOriginRelativePath(
        additionalImagePath,
        'integrationServices/google/views/feed/product.cfm:L24',
      );
      /*
       * The concatenation is written inline here, exactly as it is at the item `link` and `g:image_link`
       * sinks above, rather than hoisted into a local: the three URL fields are scheme + host + path in
       * `product.cfm` and they are scheme + host + path here, structurally alike, which is
       * what lets the source-level census in the test suite check all three as one uniform shape. Neither
       * an encode nor an escape is composed at any of the three: both would change bytes `:L22-L24`
       * publish unmodified, and the same-origin check above closes the route they were meant to close.
       */
      fields.push(
        `<g:additional_image_link>${renderRawFeedNode(
          `${absoluteUrlPrefix}${additionalImagePath}`,
          'integrationServices/google/views/feed/product.cfm:L24',
        )}</g:additional_image_link>`,
      );
    }

    /*
     * 9 and 10. fixed `g:condition` and `g:availability` (`:L25`, `:L26`).
     * Module constants, not dynamic text, so there is nothing to escape and nothing to flag. A test
     * asserts they hold no metacharacter rather than trusting the reading.
     */
    fields.push(`<g:condition>${CONDITION_VALUE}</g:condition>`);
    fields.push(`<g:availability>${AVAILABILITY_VALUE}</g:availability>`);

    /*
     * 11. `g:price` — raw, as at `product.cfm:L27`.
     * The product price, not the SKU price. `product.cfm:L27` reads the product's price while
     * `:L28` reads the SKU's, and substituting one for the other would silently change the advertised
     * price of every variant.
     */
    /*
     * Raw, exactly as `:L27` emits it, and not escaped. `ExactDecimal` is a branded string whose grammar
     * admits only digits, an optional leading minus and at most one point, so while the brand holds raw and
     * escaped emit the same bytes and this sink's exposure is bounded by the brand rather than by an escape.
     * The test suite asserts the emitted alphabet, which is what holds the brand honest.
     */
    const productPrice = product.getPrice();
    /*
     * / — rendered through {@link renderFeedMoney}, which now emits the stored digits at the
     * stored scale and rounds, pads and truncates nothing. Exponential notation was the original
     * defect here — `String(1e-7)` yields `"1e-7"`, which no feed consumer parses as a price — and it
     * is now structurally impossible rather than repaired, because an `ExactDecimal` cannot be in that
     * form. The empty case stays empty: the legacy emits `<g:price></g:price>` when the price is
     * absent.
     */
    fields.push(
      `<g:price>${renderRawFeedNode(
        productPrice === undefined ? '' : renderFeedMoney(productPrice),
        'integrationServices/google/views/feed/product.cfm:L27',
      )}</g:price>`,
    );

    /*
     * 12 and 13. conditional `g:sale_price` and `g:sale_price_effective_date`, both raw,
     * as at `product.cfm:L28-L31`.
     * The sale-price drift trap — the most dangerous field in this file.
     */
    /*
     * — the comparison goes through `compareExactDecimal`, and writing it as `skuPrice >
     * salePrice` would now be a silent defect rather than a compile error. Both operands became
     * `ExactDecimal`, which is a branded string, and `>` between two strings is perfectly legal
     * TypeScript — it just compares them lexically. Lexically `'9'` is greater than `'10'`, so a
     * nine-unit SKU discounted to ten would have been advertised as on sale and a `'100.00'` price
     * would not have compared equal to a `'100'` sale price. The typechecker cannot catch it, so the
     * comparison is named instead: `compareExactDecimal` orders digit-wise — sign, then integer-digit
     * count, then digits, then the fraction over the longer scale — and is exact at every magnitude.
     */
    const skuPrice = sku.getPrice();
    const salePrice = await sku.getSalePrice(this.pricing);
    if (compareExactDecimal(skuPrice, salePrice) === 1) {
      /*
       * Raw, exactly as `:L29` emits it, and not escaped for the same reason `g:price` above is not: the
       * escape is a no-op for every value the brand's grammar admits. The same plain-decimal rendering as
       * `g:price`; see the note there.
       */
      fields.push(
        `<g:sale_price>${renderRawFeedNode(
          renderFeedMoney(salePrice),
          'integrationServices/google/views/feed/product.cfm:L29',
        )}</g:sale_price>`,
      );

      /*
       * The eleven-part range of `product.cfm:L30`, in the legacy's own order: render date, `T`,
       * render time, `-`, raw offset, `/`, expiration date, `T`, expiration time, `-`, the same raw
       * offset. Nothing is normalised to a zulu designator, no minutes are appended to the offset,
       * the offset is neither padded nor re-signed, and the literal hyphen is emitted regardless of
       * the offset's own sign. TODO(boundary): the expiration crosses the same excluded boundary as
       * the sale price and arrives through the same port (TR-5); it may legitimately be absent, and
       * {@link renderEffectiveDateEndpoint} documents how that is carried.
       */
      const expiration = await sku.getSalePriceExpirationDateTime(this.pricing);
      const effectiveFrom = renderEffectiveDateEndpoint(context.renderTime, context.utcHourOffset);
      const effectiveTo = renderEffectiveDateEndpoint(expiration, context.utcHourOffset);
      /*
       * CWE-91 — raw, as `:L30` emits it, with markup refused rather than escaped.
       * {@link ProductFeedRenderContext.utcHourOffset} is arbitrary text emitted unmodified, and it
       * appears twice in this range, so an XML-significant character in the configured offset would reach
       * the document twice over. The whole assembled range is checked once, after the two endpoints are
       * joined, so the single `/` separator and both embedded offsets are covered by one pass — which is
       * why no endpoint checks itself. Escaping the range instead would change bytes `:L30` publishes
       * unmodified, so refusal is the only treatment that keeps byte parity.
       */
      const effectiveDate = `${effectiveFrom}/${effectiveTo}`;
      /*
       * The legacy leaves a single tab after this element's closing tag at
       * `product.cfm:L30`, and it is reproduced — see {@link SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB}
       * for why a dropped byte is a departure from byte-for-byte preservation even when it is only
       * whitespace. This is the only element that carries one.
       */
      fields.push(
        `<g:sale_price_effective_date>${renderRawFeedNode(
          effectiveDate,
          'integrationServices/google/views/feed/product.cfm:L30',
        )}</g:sale_price_effective_date>` + SALE_PRICE_EFFECTIVE_DATE_TRAILING_TAB,
      );
    }

    /*
     * 14. conditional `g:brand` — escaped (`product.cfm:L32`).
     * The condition tests the brand object, not the brand name. `product.cfm:L32` guards on the
     * association being present, so a product associated with a brand whose name is empty emits an
     * empty `g:brand` element. Guarding on the name instead would drop the element in that case and
     * change the document's field census.
     */
    const brand = product.brand;
    if (brand !== undefined) {
      fields.push(
        `<g:brand>${escapeFeedText(
          brand.brandName ?? '',
          'integrationServices/google/views/feed/product.cfm:L32',
        )}</g:brand>`,
      );
    }

    /*
     * Fields disabled in the legacy source between `:L32` and `:L39` — `g:gtin`, `g:mpn`,
     * `g:gender`, `g:age_group` (`product.cfm:L33-L38`). They sit inside a CFML server-side comment
     * block, so they were never emitted. Their names are retained here as source comments because
     * they document the intended future surface and deleting them would lose information; they are
     * not emitted, not populated, and not turned into markup comments.
     */

    /*
     * 15. `g:item_group_id` — escaped (`product.cfm:L39`).
     */
    fields.push(
      `<g:item_group_id>${escapeFeedText(
        product.productCode ?? '',
        'integrationServices/google/views/feed/product.cfm:L39',
      )}</g:item_group_id>`,
    );

    /*
     * Fields disabled in the legacy source between `:L39` and `:L58` (`product.cfm:L40-L57`), all
     * inside a CFML server-side comment block and therefore never emitted: `g:color`, `g:size`,
     * `g:material`, `g:pattern`; `g:tax` wrapping `g:country`, `g:region`, `g:rate` and `g:tax_ship`;
     * And `g:shipping` wrapping `g:country`, `g:region`, `g:service` and `g:price`. Names retained,
     * nothing emitted.
     */

    /*
     * 16. `g:shipping_weight` — raw, as at `product.cfm:L58`.
     * Two settings joined by exactly one literal space. Neither value is trimmed and the result is
     * not trimmed, so a value that resolves empty still leaves the space in place — precisely what
     * CFML interpolation produces.
     */
    const settingContext: SettingResolutionContext = { entityName: 'Sku', entityId: sku.skuID };
    const shippingWeight = this.settings.setting('skuShippingWeight', settingContext);
    const shippingWeightUnitCode = this.settings.setting(
      'skuShippingWeightUnitCode',
      settingContext,
    );
    /*
     * CWE-91 — raw, as `:L58` emits it, with markup refused rather than escaped. Both values come from
     * the settings store, which is operator- and database-supplied text with no allowlist:
     * `model/service/SettingService.cfc:L233` declares `skuShippingWeight` as `fieldType="text"`, and
     * `:L338-L343` builds the unit code's options from a live query over the user-editable
     * `SwMeasurementUnit`. So neither value is a closed set and an XML-significant character in either
     * would reach the document. The joined text is checked once, so the single literal space between the
     * two values — the legacy's own separator at `:L58`, which survives on its own when one value resolves
     * empty — is inside the same pass and is left untouched by it.
     */
    const shippingWeightText = `${shippingWeight} ${shippingWeightUnitCode}`;
    fields.push(
      `<g:shipping_weight>${renderRawFeedNode(
        shippingWeightText,
        'integrationServices/google/views/feed/product.cfm:L58',
      )}</g:shipping_weight>`,
    );

    /*
     * Field disabled in the legacy source after `:L58` — `g:online_only` (`product.cfm:L59-L61`),
     * inside a CFML server-side comment block and therefore never emitted. Name retained.
     */

    const itemIndent = INDENT_UNIT.repeat(3);
    return [
      `${INDENT_UNIT.repeat(2)}<item>`,
      ...fields.map((field) => `${itemIndent}${field}`),
      `${INDENT_UNIT.repeat(2)}</item>`,
    ].join('\n');
  }

  /**
   * Chooses the description text, reproducing the three-way selection of
   * `integrationServices/google/views/feed/product.cfm:L19`.
   *
   * @param product the product being described
   * @returns the selected description, or the empty string when neither source has content.
   */
  private selectDescription(product: Product): string {
    const productDescription = product.productDescription ?? '';
    if (productDescription.length > 0) {
      return productDescription;
    }

    /*
     * — the product type is required here, exactly as `product.cfm:L19` requires it. The previous
     * optional chain let an absent product type mean "contributes no description", which silently
     * emitted an empty description for a product that had none of its own.
     */
    const productType = this.requireProductType(
      product,
      'integrationServices/google/views/feed/product.cfm:L19',
    );
    const productTypeDescription = productType.productTypeDescription ?? '';
    if (productTypeDescription.length > 0) {
      return productTypeDescription;
    }

    return '';
  }

  /**
   * Reads a SKU's product, raising where the legacy would have raised.
   *
   * @param sku the SKU whose product is required
   * @returns the associated product
   * @throws {DomainError} when the SKU carries no product.
   */
  private requireProduct(sku: Sku): Product {
    const product = sku.product;
    if (product === undefined) {
      throw new DomainError(
        `Sku ${sku.skuID === '' ? '(unsaved)' : sku.skuID} selected for the Google product feed ` +
          `carries no product, so no item could be rendered for it.`,
        {
          context: {
            skuID: sku.skuID,
            skuCode: sku.skuCode,
            locator: 'integrationServices/google/views/feed/product.cfm:L18',
          },
        },
      );
    }
    return product;
  }

  /**
   * Returns a product's product type, raising when it is absent .
   *
   * @param product the product whose product type is required
   * @param locator the legacy line whose unguarded dereference this reproduces
   * @returns the associated product type
   * @throws {DataIntegrityError} when the product carries no product type.
   */
  private requireProductType(product: Product, locator: string): ProductType {
    const productType = product.productType;
    if (productType === undefined) {
      throw new DataIntegrityError(
        `Product ${product.productID === '' ? '(unsaved)' : product.productID} carries no product ` +
          `type, so the Google product feed cannot render an item for it. The legacy view ` +
          `dereferences the product-type association without a guard at ${locator}, while guarding ` +
          `the brand association at product.cfm:L32 — so an absent product type fails the legacy ` +
          `render rather than producing an empty element.`,
        {
          context: {
            productID: product.productID,
            locator,
          },
        },
      );
    }
    return productType;
  }
}
