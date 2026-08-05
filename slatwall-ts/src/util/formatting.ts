/**
 * Setting-driven date and title formatting for the extracted Slatwall Catalog slice.
 *
 * Scope — exactly two setting keys, and nothing else:
 * - `globalDateFormat` drives `formatDate`
 * - `productTitleString` drives `replaceStringTemplate`
 *
 * Every other key the in-scope entities read belongs elsewhere: image sizing and paths to
 * `ImagePathPort`, currency to `PricingPort`. There is deliberately no currency formatter here,
 * because every currency-derived calculated member is outside this slice.
 *
 * Legacy origins, reference only:
 * - Model/entity/Sku.cfc:L459-L480 — `getNextEstimatedAvailableDate()`, holding the only three
 * `globalDateFormat` reads in the in-scope entity set, each of the shape
 * `dateFormat(<date>, setting('globalDateFormat'))`.
 * - Model/entity/Product.cfc:L540-L545 — `getTitle()`, which interpolates `productTitleString`.
 * - Org/Hibachi/HibachiUtilityService.cfc:L70-L101 — the token substitution `getTitle()` uses.
 * - Model/entity/HibachiEntity.cfc:L128-L131 — `setting`, the declared origin of
 * `SettingResolverPort`.
 */

/** English month names, indexed by `Date.prototype.getMonth` (0-11). */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** English weekday names, indexed by `Date.prototype.getDay` (0-6, Sunday first). */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Recognised mask tokens, ordered longest-first within each letter family so that the scan always
 * takes the greediest match at a given position: `dddd` before `ddd` before `dd` before `d`, and
 * likewise for the month and year families. Entries are lower-case because matching is
 * case-insensitive.
 */
const MASK_TOKENS = ['dddd', 'ddd', 'dd', 'd', 'mmmm', 'mmm', 'mm', 'm', 'yyyy', 'yy'] as const;

type MaskToken = (typeof MASK_TOKENS)[number];

/** Width of the zero-padded two-character mask tokens (`yy`, `mm`, `dd`). */
const PADDED_TOKEN_WIDTH = 2;

/** Number of characters CFML's `mmm` and `ddd` masks emit. */
const ABBREVIATION_LENGTH = 3;

/** Reads the English month name for `value`. */
function monthName(value: Date): string {
  const monthIndex = value.getMonth();
  const name = MONTH_NAMES[monthIndex];

  if (name === undefined) {
    throw new RangeError(
      `Unsupported month index ${String(monthIndex)}: getMonth() yields 0-11 for any valid Date.`,
    );
  }

  return name;
}

/** Reads the English weekday name for `value`. */
function weekdayName(value: Date): string {
  const dayIndex = value.getDay();
  const name = WEEKDAY_NAMES[dayIndex];

  if (name === undefined) {
    throw new RangeError(
      `Unsupported day index ${String(dayIndex)}: getDay() yields 0-6 for any valid Date.`,
    );
  }

  return name;
}

/** Renders one recognised mask token. */
function renderToken(token: MaskToken, value: Date): string {
  switch (token) {
    case 'yyyy':
      return String(value.getFullYear());
    case 'yy':
      return String(value.getFullYear() % 100).padStart(PADDED_TOKEN_WIDTH, '0');
    case 'mmmm':
      return monthName(value);
    case 'mmm':
      return monthName(value).slice(0, ABBREVIATION_LENGTH);
    case 'mm':
      return String(value.getMonth() + 1).padStart(PADDED_TOKEN_WIDTH, '0');
    case 'm':
      return String(value.getMonth() + 1);
    case 'dddd':
      return weekdayName(value);
    case 'ddd':
      return weekdayName(value).slice(0, ABBREVIATION_LENGTH);
    case 'dd':
      return String(value.getDate()).padStart(PADDED_TOKEN_WIDTH, '0');
    case 'd':
      return String(value.getDate());
  }
}

/**
 * Returns the mask token beginning at `position`, or `undefined` when the character there is a
 * literal.
 */
function tokenAt(mask: string, position: number): MaskToken | undefined {
  return MASK_TOKENS.find((candidate) => {
    const slice = mask.substring(position, position + candidate.length);
    return slice.toLowerCase() === candidate;
  });
}

/**
 * Formats `value` according to a CFML-style `dateFormat` mask.
 *
 * @param value The date to render, interpreted in the host's local timezone.
 * @param mask a CFML-style mask, typically the resolved value of the `globalDateFormat` setting.
 * @returns The rendered string. An empty mask yields an empty string.
 */
export function formatDate(value: Date, mask: string): string {
  let formatted = '';
  let position = 0;

  while (position < mask.length) {
    const token = tokenAt(mask, position);

    if (token === undefined) {
      // `charAt` rather than an index read: it is typed `string`, which discharges
      // `noUncheckedIndexedAccess` on the literal path with no cast and no assertion.
      formatted += mask.charAt(position);
      position += 1;
      continue;
    }

    formatted += renderToken(token, value);
    position += token.length;
  }

  return formatted;
}

/* Template substitution. */

/** Resolves one `${...}` property identifier to its replacement value. */
export type PropertyIdentifierResolver = (propertyIdentifier: string) => string | undefined;

/**
 * The legacy token grammar, reproduced exactly: `${`, one or more characters that are not `}`, then
 * `}` [org/Hibachi/HibachiUtilityService.cfc:L71, `reMatchNoCase("\${[^}]+}", template)`]. The
 * one-or-more quantifier is load-bearing: an empty token does not match the grammar and is
 * therefore emitted unchanged.
 */
const TEMPLATE_KEY_PATTERN = /\$\{[^}]+\}/g;

/** Length of the leading `${` delimiter stripped off a token when extracting its identifier. */
const TOKEN_PREFIX_LENGTH = 2;

/**
 * Substitutes every `${propertyIdentifier}` token in `template` with the value the resolver returns.
 *
 * Legacy origin: `org/Hibachi/HibachiUtilityService.cfc:L70-L101`. The sole in-scope caller is
 * `Product.getTitle()` [model/entity/Product.cfc:L540-L545], which interpolates the resolved
 * `productTitleString` setting; its result reaches `ProductService.saveProduct` as the
 * `titleString` argument to `createUniqueURLTitle` [model/service/ProductService.cfc:L269].
 *
 * @param template The template to interpolate, typically the resolved `productTitleString` setting.
 * @param resolve resolves an identifier to its value; `undefined` leaves the token verbatim.
 * @returns The interpolated string.
 */
export function replaceStringTemplate(
  template: string,
  resolve: PropertyIdentifierResolver,
): string {
  let returnString = template;

  for (const match of template.matchAll(TEMPLATE_KEY_PATTERN)) {
    const token = match[0];
    const value = resolve(token.slice(TOKEN_PREFIX_LENGTH, -1));

    if (value === undefined) {
      continue;
    }

    returnString = returnString.replaceAll(token, () => value);
  }

  return returnString;
}

/*
 * Exact decimal — the `ormtype="big_decimal"` value type, and why a `number` cannot carry it.
 * Four catalog columns are declared `ormtype="big_decimal"`: `listPrice`, `price` and `renewalPrice` at
 * [model/entity/Sku.cfc:L55-L57], and `calculatedSalePrice` at [model/entity/Product.cfc:L62].
 * Hibernate mapped every one of them to a Java `BigDecimal` — exact, arbitrary precision. An IEEE 754
 * double is neither, and it has 53 bits of significand, so `9007199254740993.01` cannot be held in one.
 */

/** A `big_decimal` value, held as its exact decimal digits. */
export type ExactDecimal = string & { readonly __exactDecimal: 'ExactDecimal' };

/** Well-formed exact-decimal text: an optional minus, digits, and an optional fractional part. */
const EXACT_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/**
 * Scientific notation, in the spellings `String(number)` and CFML numeric text can both produce.
 */
const EXPONENTIAL_DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * The value `0`, which is the legacy `default="0"` on all three `Sku` monetary properties
 * [model/entity/Sku.cfc:L55-L57].
 */
export const EXACT_DECIMAL_ZERO = '0' as ExactDecimal;

/**
 * What a non-numeric assignment becomes — the exact counterpart of the `NaN` the previous numeric
 * coercion produced, and it is deliberately not an exception.
 */
export const EXACT_DECIMAL_NOT_NUMERIC = 'NaN' as ExactDecimal;

/**
 * Rewrites scientific notation as plain decimal text, without a floating-point step.
 *
 * @param text - Decimal text, possibly in scientific notation.
 * @returns Plain decimal text of the identical value.
 */
function expandExponentialDecimalText(text: string): string {
  const match = EXPONENTIAL_DECIMAL_PATTERN.exec(text);
  if (match === null) {
    return text;
  }

  const sign = match[1] === '-' ? '-' : '';
  const integerDigits = match[2] ?? '';
  const fractionDigits = match[3] ?? '';
  const exponent = Number(match[4] ?? '0');
  const digits = `${integerDigits}${fractionDigits}`;
  const pointPosition = integerDigits.length + exponent;

  if (pointPosition <= 0) {
    return `${sign}0.${'0'.repeat(-pointPosition)}${digits}`;
  }
  if (pointPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/**
 * CFML `isNumeric`, applied to a raw value.
 *
 * @param value - Any value.
 * @returns `true` when CFML would treat it as a number.
 */
function readsAsCfmlNumericText(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * Normalises well-formed decimal text into the spelling {@link EXACT_DECIMAL_PATTERN} accepts.
 *
 * @param text - Numeric text already accepted by {@link readsAsCfmlNumericText}, exponent expanded.
 * @returns The normalised spelling of the identical value.
 */
function normaliseDecimalSpelling(text: string): string {
  const negative = text.startsWith('-');
  let magnitude = text.replace(/^[+-]/, '');
  if (magnitude.startsWith('.')) {
    magnitude = `0${magnitude}`;
  }
  if (magnitude.endsWith('.')) {
    magnitude = magnitude.slice(0, -1);
  }
  /*
   * `-0`, `-0.0` and `-0.000` all denote zero, whose sign carries no meaning for a stored amount — so the
   * sign is dropped while the scale is left exactly as it arrived.
   */
  const signMeaningful = negative && /[1-9]/.test(magnitude);
  return signMeaningful ? `-${magnitude}` : magnitude;
}

/**
 * Coerces a value the way CFML coerces one on assignment to a `big_decimal` property.
 *
 * @param value - The raw value, typically off an untyped request payload.
 * @returns The exact value, or the non-numeric sentinel.
 */
export function toExactDecimal(value: unknown): ExactDecimal {
  if (typeof value === 'boolean') {
    return (value ? '1' : '0') as ExactDecimal;
  }
  /*
   * A number is already a double, so it goes to the one function that documents that boundary; it also
   * screens non-finite values, which CFML does not treat as numeric either.
   */
  if (typeof value === 'number') {
    return exactDecimalFromNumber(value);
  }
  if (typeof value !== 'string' || !readsAsCfmlNumericText(value)) {
    return EXACT_DECIMAL_NOT_NUMERIC;
  }
  const expanded = expandExponentialDecimalText(value.trim());
  return normaliseDecimalSpelling(expanded) as ExactDecimal;
}

/**
 * Reads exact-decimal text that a trusted source produced — a `DECIMAL` column, or a value already
 * matched against {@link EXACT_DECIMAL_PATTERN} by the caller.
 *
 * @param text - The text to adopt.
 * @returns The branded value, or `undefined` when the text is not well-formed decimal text.
 */
export function parseExactDecimal(text: string): ExactDecimal | undefined {
  const expanded = expandExponentialDecimalText(text.trim());
  const normalised = normaliseDecimalSpelling(expanded);
  return EXACT_DECIMAL_PATTERN.test(normalised) ? (normalised as ExactDecimal) : undefined;
}

/**
 * Adopts a JavaScript `number` as an exact decimal.
 *
 * @param value - A finite number.
 * @returns Its exact decimal text, or the non-numeric sentinel when the number is not finite.
 */
export function exactDecimalFromNumber(value: number): ExactDecimal {
  if (!Number.isFinite(value)) {
    return EXACT_DECIMAL_NOT_NUMERIC;
  }
  const expanded = expandExponentialDecimalText(String(value));
  return normaliseDecimalSpelling(expanded) as ExactDecimal;
}

/**
 * Is this value numeric — i.e. anything other than {@link EXACT_DECIMAL_NOT_NUMERIC}?
 *
 * @param value - The value to test.
 * @returns `true` when the value is well-formed decimal text.
 */
function isExactDecimalNumeric(value: ExactDecimal): boolean {
  return EXACT_DECIMAL_PATTERN.test(value);
}

/**
 * Splits well-formed decimal text into its sign and its two digit runs.
 *
 * @param value - Well-formed decimal text.
 * @returns The sign as `1` or `-1`, the integer digits with leading zeros removed, and the fraction
 * digits with trailing zeros removed.
 */
function decimalParts(value: string): { sign: number; whole: string; fraction: string } {
  const negative = value.startsWith('-');
  const magnitude = negative ? value.slice(1) : value;
  const [rawWhole = '', rawFraction = ''] = magnitude.split('.');
  const whole = rawWhole.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  const isZero = /^0*$/.test(whole) && fraction.length === 0;
  return { sign: negative && !isZero ? -1 : 1, whole, fraction };
}

/**
 * Compares two exact decimals exactly, without converting either to a number.
 *
 * @param left - The left operand.
 * @param right - The right operand.
 * @returns `-1`, `0` or `1`, or `undefined` when either operand is non-numeric.
 */
export function compareExactDecimal(
  left: ExactDecimal,
  right: ExactDecimal,
): -1 | 0 | 1 | undefined {
  if (!isExactDecimalNumeric(left) || !isExactDecimalNumeric(right)) {
    return undefined;
  }

  const a = decimalParts(left);
  const b = decimalParts(right);

  if (a.sign !== b.sign) {
    return a.sign < b.sign ? -1 : 1;
  }

  const direction: -1 | 1 = a.sign < 0 ? -1 : 1;

  if (a.whole.length !== b.whole.length) {
    return a.whole.length < b.whole.length ? ((-direction * 1) as -1 | 1) : direction;
  }
  if (a.whole !== b.whole) {
    return a.whole < b.whole ? ((-direction * 1) as -1 | 1) : direction;
  }

  const scale = Math.max(a.fraction.length, b.fraction.length);
  const aFraction = a.fraction.padEnd(scale, '0');
  const bFraction = b.fraction.padEnd(scale, '0');
  if (aFraction === bFraction) {
    return 0;
  }
  return aFraction < bFraction ? ((-direction * 1) as -1 | 1) : direction;
}

/**
 * Projects an exact decimal onto a JavaScript `number`.
 *
 * @param value - The value to project.
 * @returns The nearest double, or `NaN` for the non-numeric sentinel.
 */
export function exactDecimalToNumber(value: ExactDecimal): number {
  return isExactDecimalNumeric(value) ? Number(value) : Number.NaN;
}

/*
 * There is deliberately no `renderExactDecimal` here, and none should be added. An `ExactDecimal` is
 * already its own textual form, so every emitter interpolates the value directly; and the one emitter
 * that might otherwise call such a helper — `../integrations/google/ProductFeedBuilder`'s
 * `renderFeedMoney` — must specifically **not** raise on the non-numeric sentinel, because the legacy
 * view completes a render this port has no licence to abort. An exported helper with no caller, and with
 * the wrong semantics for its only plausible caller, is invented API surface (AAP §0.7.3).
 */
