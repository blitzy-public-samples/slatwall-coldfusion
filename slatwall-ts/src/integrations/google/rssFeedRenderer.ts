// slatwall-ts - the Google product-feed RSS renderer.
//
// The TypeScript port of `integrationServices/google/views/feed/product.cfm`, the CFML template
// that emitted Slatwall 3.1.39's Google Merchant Center product feed.
//
// JUDGMENT CALL: element ORDER and element CONTENT are contractual and are reproduced exactly; the
// whitespace BETWEEN elements is not, because XML ignores it there.
//
// JUDGMENT CALL: the template emits a stray TAB after `</g:sale_price_effective_date>` at
// [integrationServices/google/views/feed/product.cfm:L30], immediately before its line break.
// Insignificant whitespace between elements, deliberately not reproduced.

// The runtime import is deliberately first, and the ordering is load-bearing rather than
// stylistic.
import { cfLen, cfTruthy } from '../../lib/cfml/truthiness.js';
// Monetary elements interpolate a value with no mask
// [integrationServices/google/views/feed/product.cfm:L27, L29], so the feed's numerals are
// whatever CFML's `#value#` produces - full precision, plain notation, trailing zeros dropped.
import { cfNumberToString } from '../../lib/cfml/numberFormat.js';
// And `../../lib/config.ts` both decide whether a value is a bare host authority - here at the
// point it is written into five URL sites, there when a deployment authorizes it.
import { parseHostAuthority } from '../../lib/config.js';
import type { GoogleProductFeedRow } from './googleFeedRepository.js';
import type { Money } from '../../domain/valueObjects/money.js';
// Nothing is imported from `src/lib/config.ts`, deliberately.

// Three specifiers, exhaustively.

// Every constant in this section is a literal of the legacy OUTPUT, carried over verbatim.

/**
 * The XML declaration [integrationServices/google/views/feed/product.cfm:L1], emitted as the very
 * first characters of the document.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L1]: version only. The template
 * declares no `encoding` attribute and no `standalone` pseudo-attribute, so neither is added, and
 * no byte-order mark is emitted either.
 */
const XML_DECLARATION = '<?xml version="1.0"?>';

/**
 * The root element [integrationServices/google/views/feed/product.cfm:L11]: RSS 2.0, with the
 * Google base namespace bound to the `g` prefix that every `g:`-qualified element below uses.
 *
 * The namespace URI is reproduced character for character, `http` scheme included.
 */
const RSS_OPEN_TAG = '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">';

/**
 * The closing root tag [integrationServices/google/views/feed/product.cfm:L65].
 */
const RSS_CLOSE_TAG = '</rss>';

/**
 * The channel title [integrationServices/google/views/feed/product.cfm:L13], a hardcoded literal
 * carried over verbatim rather than parameterised, translated or made configurable.
 *
 * It is emitted as a complete element rather than through the text helper because it is literal
 * content start to finish.
 */
const CHANNEL_TITLE_ELEMENT = '<title>Slatwall Product Feed</title>';

/**
 * The literal prefix of the channel description
 * [integrationServices/google/views/feed/product.cfm:L15], which the template completes with the
 * feed origin.
 */
const CHANNEL_DESCRIPTION_PREFIX = 'Google Product Feed for ';

/**
 * The scheme-and-separator prefix of the composed feed origin, hardcoded to reproduce the legacy.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24]: the legacy
 * writes `http://#CGI.HTTP_HOST#` at five sites - the channel link, the channel description, the item
 * link, the item image link and each additional image link - so every URL in the document is
 * cleartext. That is carried forward rather than upgraded, and it is not mitigated by terminating TLS
 * in front of the service: these are absolute URLs inside an XML document, and nothing rewrites them
 * on the way out. Changing the scheme is a product decision, not this renderer's.
 *
 * The host half is the request `Host`, and the request only ever SELECTS among the authorities a
 * deployment already authorized in `FEED_ALLOWED_HOSTS`; {@link assertFeedHostShape} re-validates its
 * grammar here as the last line of defence.
 */
const FEED_ORIGIN_SCHEME_PREFIX = 'http://';

// LEGACY-DEFECT [integrationServices/google/views/feed/product.cfm:L20]: g:google_product_category
// is emitted as an empty element - the template never supplies a value from any source.
// Preserved deliberately; do not fix without a product decision.
//
// The legacy template carries the gap itself, so it is recorded as the source's defect rather than
// as a TODO of this port's own.
const GOOGLE_PRODUCT_CATEGORY_ELEMENT = '<g:google_product_category></g:google_product_category>';

/**
 * CFML parity [integrationServices/google/views/feed/product.cfm:L25]: the item condition is the
 * hardcoded literal `new` for every item in the feed, with no setting, argument, lookup, enum or
 * per-item derivation behind it.
 */
const CONDITION_ELEMENT = '<g:condition>new</g:condition>';

/**
 * CFML parity [integrationServices/google/views/feed/product.cfm:L26]: the item stock state is the
 * hardcoded literal `in stock` for every item, with no stock check of any kind behind it.
 */
const AVAILABILITY_ELEMENT = '<g:availability>in stock</g:availability>';

// Indentation only, governed by the whitespace ruling in the header.

const CHANNEL_INDENT = '  ';
const CHANNEL_CHILD_INDENT = '    ';
const ITEM_CHILD_INDENT = '      ';
const LINE_SEPARATOR = '\n';

/**
 * The separator between the two ends of the sale-price effective-date range.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L30]: the template joins its two
 * timestamps with a literal `/`, and the port keeps that separator exactly.
 */
const SALE_WINDOW_SEPARATOR = '/';

/**
 * Code points that XML 1.0 forbids in a document at all, in any escaped form.
 *
 * The declaration is the authority for the set. {@link XML_DECLARATION} emits `version="1.0"`, so
 * the XML 1.0 production above is what governs and only what it forbids is removed.
 */
const XML_FORBIDDEN_CODE_POINT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * A high surrogate with no low surrogate after it.
 *
 * A well-formed surrogate PAIR encodes a code point in [#x10000-#x10FFFF] and is perfectly legal,
 * so the pair must survive untouched.
 */
const XML_LONE_HIGH_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g;
const XML_LONE_LOW_SURROGATE = /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Removes every code point XML 1.0 forbids, leaving all legal text untouched.
 *
 * Run before entity escaping, which is the correct order and not an arbitrary one: the forbidden
 * set contains none of `&`, `<`, `>`, `"` or `'`.
 *
 * @param value the raw text destined for an element body.
 * @returns the same text with XML-1.0-forbidden code points elided.
 */
function stripXmlForbiddenCodePoints(value: string): string {
  return value
    .replace(XML_FORBIDDEN_CODE_POINT, '')
    .replace(XML_LONE_HIGH_SURROGATE, '')
    .replace(XML_LONE_LOW_SURROGATE, '');
}

/**
 * Escapes text for an XML element body: the five predefined XML entities, and nothing else.
 *
 * JUDGMENT CALL: every interpolated value is escaped through this one function, where the legacy
 * escaped only some of them with a function covering only some of the entities. Both halves were
 * measured first.
 *
 * @param value the raw text to place in an element body.
 * @returns the same text with XML-1.0-forbidden code points elided and the five predefined XML
 * entities escaped.
 */
function escapeXmlText(value: string): string {
  // SECURITY BOUNDARY - XML output encoding. Forbidden code points are elided before any entity
  // escaping, because no character reference can make them legal.
  return stripXmlForbiddenCodePoints(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Emits one element as an open/close pair around escaped text.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L19-L20]: an ABSENT value yields
 * an EMPTY BODY rather than a missing element or a substituted default.
 *
 * @param name the element name, a literal at every call site; never escaped.
 * @param text the body text; escaped exactly once.
 */
function textElement(name: string, text: string | undefined): string {
  return `<${name}>${escapeXmlText(text ?? '')}</${name}>`;
}

/**
 * Presents a monetary value for an element body, with absence rendering empty.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L27]: an absent price renders an
 * empty body, reproducing CFML's null-to-empty-string stringification.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L27, L29]: a present price is
 * rendered as CFML stringifies a number - full precision, plain notation, trailing zeros dropped, so
 * a stored `9.50` renders as `9.5`. No mask is applied at either site, so no two-decimal
 * normalisation happens here either.
 *
 * @param value the monetary quantity, or `undefined` when there is none.
 * @returns the value as CFML would stringify it, or the empty string when absent.
 */
function monetaryBody(value: Money | undefined): string {
  return value === undefined ? '' : cfNumberToString(value.toDecimalString());
}

/**
 * Chooses the description body from the template's two candidates.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L19]: the product's own
 * description wins when `len()` of it is non-zero; otherwise the product type's description wins
 * on the same test; otherwise nothing is chosen.
 *
 * CFML parity [integrationServices/google/views/feed/product.cfm:L19]: both gates are `len()`
 * truthiness, which is not JavaScript truthiness, so neither is hand-rolled as `if(value)` or
 * `if(value.length)`.
 *
 * @param row the feed row carrying both candidates.
 * @returns the chosen description, or `undefined` when neither candidate has length.
 */
function selectDescription(row: GoogleProductFeedRow): string | undefined {
  if (cfTruthy(cfLen(row.productDescription))) {
    return row.productDescription;
  }

  if (cfTruthy(cfLen(row.productTypeDescription))) {
    return row.productTypeDescription;
  }

  return undefined;
}

/**
 * The index at which a standard ISO 8601 UTC rendering ends its seconds field, so that
 * `YYYY-MM-DDTHH:mm:ss.sssZ` truncates to `YYYY-MM-DDTHH:mm:ss`.
 */
const ISO_8601_SECONDS_END_INDEX = 19;
const ISO_8601_UTC_LENGTH = 24;

/**
 * The UTC designator that replaces the legacy's numeric offset.
 */
const UTC_DESIGNATOR = 'Z';

/**
 * Renders one instant as a well-formed ISO 8601 UTC timestamp at second precision.
 *
 * JUDGMENT CALL: this replaces a malformed legacy formulation, so the target's output is MORE
 * correct than the source's and the divergence is a correction, not a preserved defect.
 *
 * @param value the instant to render.
 * @returns the UTC timestamp at second precision, or `undefined` when the instant cannot be
 * rendered in the standard form.
 */
function toUtcSecondPrecisionTimestamp(value: Date): string | undefined {
  if (!Number.isFinite(value.getTime())) {
    return undefined;
  }

  const isoTimestamp = value.toISOString();

  if (isoTimestamp.length !== ISO_8601_UTC_LENGTH) {
    return undefined;
  }

  return `${isoTimestamp.slice(0, ISO_8601_SECONDS_END_INDEX)}${UTC_DESIGNATOR}`;
}

// CFML parity [integrationServices/google/views/feed/product.cfm:L17-L31]: element order and element
// content are contractual, and the last two elements sit inside one conditional spanning L28-L31.

/**
 * @param row the feed row to render.
 * @param feedOrigin the scheme-and-host prefix, already assembled by the caller so that the
 * hardcoded `http://` decision lives in one place for all five legacy `CGI.HTTP_HOST` sites.
 * @param saleWindowStart the rendered range-start timestamp, or `undefined` when the supplied
 * instant could not be rendered.
 * @returns the complete `<item>` element, indented, with no trailing separator.
 */
function renderFeedItem(
  row: GoogleProductFeedRow,
  feedOrigin: string,
  saleWindowStart: string | undefined,
): string {
  const children: string[] = [
    textElement('g:id', row.skuCode),
    textElement('title', row.calculatedTitle),
    textElement('description', selectDescription(row)),
    GOOGLE_PRODUCT_CATEGORY_ELEMENT,
    textElement('g:product_type', row.productTypeSimpleRepresentation),
    textElement('link', `${feedOrigin}${row.productUrlPath ?? ''}`),
    textElement('g:image_link', `${feedOrigin}${row.imageLinkPath}`),
  ];

  // Element 8. Iterated with `for...of` rather than by index: under `noUncheckedIndexedAccess` an
  // indexed read answers `string | undefined` and would have to be narrowed at every step.
  for (const additionalImageLinkPath of row.additionalImageLinkPaths) {
    children.push(
      textElement('g:additional_image_link', `${feedOrigin}${additionalImageLinkPath}`),
    );
  }

  // Elements 9 through.
  children.push(
    CONDITION_ELEMENT,
    AVAILABILITY_ELEMENT,
    textElement('g:price', monetaryBody(row.productPrice)),
  );

  // Elements 12 and.
  //
  // The gate is a MONEY comparison: `isGreaterThan` is the target of the legacy `gt` at
  // [integrationServices/google/views/feed/product.cfm:L28], and no raw `>` is applied to a price
  // here.
  //
  // The reachability was right and the conclusion was too wide.
  const skuPrice = row.skuPrice;
  const skuSalePrice = row.skuSalePrice;
  const salePriceExpiration = row.salePriceExpirationDateTime;
  const saleWindowEnd =
    salePriceExpiration === undefined
      ? undefined
      : toUtcSecondPrecisionTimestamp(salePriceExpiration);

  if (
    skuPrice !== undefined &&
    skuSalePrice !== undefined &&
    skuPrice.isGreaterThan(skuSalePrice)
  ) {
    children.push(textElement('g:sale_price', monetaryBody(skuSalePrice)));

    if (saleWindowStart !== undefined && saleWindowEnd !== undefined) {
      children.push(
        textElement(
          'g:sale_price_effective_date',
          `${saleWindowStart}${SALE_WINDOW_SEPARATOR}${saleWindowEnd}`,
        ),
      );
    }
  }

  // Element 14, independently gated.
  //
  // CFML parity [integrationServices/google/views/feed/product.cfm:L32]: the legacy guard is
  // `not isNull(local.sku.getProduct().getBrand())` and it is meaningful precisely because the
  // brand is joined LEFT [integrationServices/google/controllers/feed.cfc:L66] - a product with no
  // brand still appears in the feed.
  const brandID = row.brandID;

  if (brandID !== undefined) {
    children.push(textElement('g:brand', row.brandName));
  }

  // Elements 15 and.
  //
  // JUDGMENT CALL: the shipping weight and its unit arrive as ALREADY-RESOLVED strings on the
  // projection, and this renderer reaches for no setting to get them.
  children.push(
    textElement('g:item_group_id', row.productCode),
    textElement('g:shipping_weight', `${row.skuShippingWeight} ${row.skuShippingWeightUnitCode}`),
  );

  return [
    `${CHANNEL_CHILD_INDENT}<item>`,
    ...children.map((child) => `${ITEM_CHILD_INDENT}${child}`),
    `${CHANNEL_CHILD_INDENT}</item>`,
  ].join(LINE_SEPARATOR);
}

// The principal exported unit.

// The feed-origin grammar: a bare host with an optional port, whose range is enforced. It is an
// allow-list rather than a deny-list, unlike the image-name guard, because the set of legitimate feed
// origins is known to the deployment and the set of hostile ones is not.

/**
 * The longest accepted feed origin: RFC 1035's 253-character host plus `:65535`.
 *
 * Checked here so that an over-long value gets a message naming the measured length, which is the
 * actionable diagnosis.
 */
const FEED_HOST_MAX_LENGTH = 259;

/**
 * Rejects a feed origin that is anything other than a bare host with an optional port.
 *
 * It throws rather than sanitising: a rejected origin means no document is rendered at all, which
 * fails closed instead of publishing a feed pointing at an unauthorized host.
 *
 * @param feedHost the caller-supplied origin host.
 * @throws Error when the value is not a bare host with an optional port.
 */
function assertFeedHostShape(feedHost: string): void {
  if (feedHost.length === 0) {
    throw new Error(
      'feedHost must be a bare host such as "shop.example.com" or "shop.example.com:8443", but ' +
        'it was empty. An empty host would make every link in the feed resolve to the bare ' +
        'scheme prefix. No feed was rendered.',
    );
  }

  if (feedHost.length > FEED_HOST_MAX_LENGTH) {
    throw new Error(
      `feedHost must be at most ${String(FEED_HOST_MAX_LENGTH)} characters - RFC 1035 allows 253 ` +
        `for a host, plus a port - but it was ${String(feedHost.length)}. No feed was rendered.`,
    );
  }

  if (parseHostAuthority(feedHost) === undefined) {
    throw new Error(
      'feedHost must be a bare host with an optional port and nothing else: no scheme, no path, ' +
        'no credentials, no query, no fragment, no whitespace and no control characters, and a ' +
        'port - when written - between 1 and 65535 with no leading zero. It is concatenated into ' +
        'every link, image link and additional image link in the feed, so a value carrying any of ' +
        'those would repoint the whole catalog. No feed was rendered.',
    );
  }
}

/**
 * @param rows the qualifying feed rows, in the order they are to be emitted.
 * @param feedHost the host to write into the five sites where the legacy interpolated
 * `CGI.HTTP_HOST` - the channel link, the channel description, and each item's link.
 * @param now the instant that opens each item's sale-price effective-date range.
 * @returns the finished RSS 2.0 document.
 * @throws Error when `feedHost` is not a bare host with an optional port.
 */
export function renderGoogleProductFeed(
  rows: readonly GoogleProductFeedRow[],
  feedHost: string,
  now: Date,
): string {
  // SECURITY BOUNDARY - origin authenticity. Checked before the origin is composed, so no poisoned
  // origin is ever built, let alone written into the five URL sites that consume it.
  assertFeedHostShape(feedHost);
  const feedOrigin = `${FEED_ORIGIN_SCHEME_PREFIX}${feedHost}`;
  const saleWindowStart = toUtcSecondPrecisionTimestamp(now);

  const lines: string[] = [
    XML_DECLARATION,
    RSS_OPEN_TAG,
    `${CHANNEL_INDENT}<channel>`,
    `${CHANNEL_CHILD_INDENT}${CHANNEL_TITLE_ELEMENT}`,
    `${CHANNEL_CHILD_INDENT}${textElement('link', feedOrigin)}`,
    `${CHANNEL_CHILD_INDENT}${textElement('description', `${CHANNEL_DESCRIPTION_PREFIX}${feedOrigin}`)}`,
  ];

  for (const row of rows) {
    lines.push(renderFeedItem(row, feedOrigin, saleWindowStart));
  }

  lines.push(`${CHANNEL_INDENT}</channel>`, RSS_CLOSE_TAG);

  return lines.join(LINE_SEPARATOR);
}
