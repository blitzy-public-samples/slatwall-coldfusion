/**
 * CFML numeric-presentation parity: `numberFormat(value, "0.00")` and the
 * stringification semantics the rounding algorithm depends on.
 *
 * This module and `./precision.ts` are the only two places in the subtree that
 * import `decimal.js` directly; everything else reaches decimals through `Money`.
 */

import { Decimal } from 'decimal.js';

// A locally configured, frozen clone so the global decimal configuration is never
// mutated. Exponential notation is pushed out of reach at both ends because CFML
// renders money in plain notation, and half-up rounding matches the engine.
//
// ★ THE WIDE `toExp*` WINDOW IS WHAT MAKES A RENDERING BOUND NECESSARY, AND
// NARROWING IT WOULD HAVE BEEN THE WRONG FIX. Pushing the thresholds back in would
// stop `1e1000000` expanding, but it would also make ordinary values render in
// EXPONENTIAL notation - and CFML never did, which is the whole reason the window
// was opened. So the window stays exactly where parity requires it and the
// magnitude of what may enter is bounded instead. See {@link MAX_DECIMAL_EXPONENT}.
const CFML_DECIMAL = Object.freeze(
  Decimal.clone({
    rounding: Decimal.ROUND_HALF_UP,
    toExpNeg: -9e15,
    toExpPos: 9e15,
  }),
);

type TwoDecimalMask = '0.00';

// What counts as a plain decimal numeral: optional sign, no grouping separator, no
// exponent, no surrounding whitespace.
const PLAIN_DECIMAL_NUMERAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

const NEGATIVE_ZERO_PRESENTATION = /^-0(?:\.0+)?$/;

/**
 * The widest raw numeral this module will parse, in characters.
 *
 * ★ WHY A LENGTH BOUND EXISTS AT ALL, AND WHY IT IS A DIVERGENCE THAT COSTS
 * NOTHING. CFML numerals are IEEE-754 doubles: `1e1000000` in the legacy engine
 * OVERFLOWS TO INFINITY, and `10^1997` does the same, so no CFML expression could
 * ever produce a plain decimal rendering longer than about 320 characters. An
 * arbitrary-precision decimal has no such ceiling — it renders every digit — so
 * the target inherits an amplification the source could not express: a nine-byte
 * `1e1000000` expands to 1,000,001 characters (measured, ~33 MB once it reaches a
 * JSON response), and a plain numeral of a million digits does the same with no
 * exponent at all. THIS IS A TARGET-ONLY HAZARD INTRODUCED BY THE SUBSTRATE
 * CHOICE, not a legacy behaviour, so bounding it removes nothing that the CFML
 * ever did. At 1024 characters the bound is more than three times as permissive
 * as the widest value a double can represent.
 *
 * IT IS CHECKED BEFORE THE VALUE IS PARSED, which is the point: parsing a
 * million-digit numeral is itself linear in its length, and the error raised for
 * an over-long value deliberately does not echo it.
 */
const MAX_NUMERAL_CHARACTERS = 1024;

/**
 * The widest decimal magnitude this module will render, as an absolute exponent
 * and as a count of decimal places.
 *
 * The character bound above cannot catch the COMPACT form: `1e1000000` is nine
 * characters and expands to a million. This bound closes that by measuring the
 * PARSED value rather than its notation — `Decimal.e`, the exponent of the leading
 * significant digit, and `Decimal.dp()`, the number of decimal places — and it is
 * applied after parsing but BEFORE any `toFixed` call, so no expansion is ever
 * materialised.
 *
 * ★ THE TWO BOUNDS ARE DELIBERATELY CONSISTENT, AND THE INVARIANT IS PROVABLE.
 * A value that satisfies this bound renders in plain notation to at most
 * 1 sign + 257 integer digits + 1 point + 256 fractional digits = 515 characters,
 * and a rounding carry can add at most one more. That is comfortably inside
 * {@link MAX_NUMERAL_CHARACTERS}, so NOTHING THIS MODULE PRODUCES CAN BE REFUSED
 * BY THIS MODULE — `numberFormat` and `cfNumberToString` both re-brand their own
 * output through {@link toDecimalString}, and neither can trip its length gate.
 * A test pins that invariant rather than leaving it to a reader.
 *
 * A real monetary value is nowhere near this: `big_decimal` prices in the `Sw*`
 * schema carry a handful of digits, and the widest intermediate the rounding
 * algorithm builds is a power of ten whose exponent is the length of a
 * `varchar` rounding expression.
 */
const MAX_DECIMAL_EXPONENT = 256;

/**
 * Raised when a value is not a finite plain decimal numeral.
 *
 * Exported so a caller can discriminate malformed input from any other failure.
 * The received value is JSON-stringified so an empty string or whitespace is
 * visible in the message.
 *
 * An OVER-LONG value never reaches this class: every entry point applies
 * {@link MAX_NUMERAL_CHARACTERS} first and raises {@link CfmlNumberMagnitudeError}
 * instead, precisely so that the echo below cannot itself become the
 * amplification it is meant to prevent.
 */
export class CfmlNumberFormatError extends Error {
  public constructor(received: unknown, cause?: unknown) {
    super(
      `Expected a finite plain decimal numeral, received ${JSON.stringify(String(received))}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'CfmlNumberFormatError';
  }
}

/**
 * Raised when a value is well-formed but too large to render in plain notation.
 *
 * A SEPARATE TYPE FROM {@link CfmlNumberFormatError}, because the two conditions
 * are genuinely different and a caller may well want to distinguish them: one says
 * "this is not a number", the other says "this is a number that will not be
 * rendered here". Exported for the same reason its sibling is.
 *
 * ★ IT REPORTS THE MEASURE AND NEVER THE VALUE. Echoing a million-digit numeral
 * into an error message — which is what its sibling's `JSON.stringify` would do —
 * would reproduce the amplification inside the diagnostic. So the message names
 * the measure that failed, the observed figure and the limit, and nothing else.
 *
 * @param measure which bound was exceeded.
 * @param observed the figure measured on the input.
 * @param limit the bound that was exceeded.
 */
export class CfmlNumberMagnitudeError extends Error {
  public constructor(
    measure: 'characters' | 'exponent' | 'decimalPlaces',
    observed: number,
    limit: number,
  ) {
    super(
      `Numeral exceeds the plain-decimal rendering bound: ${measure} was ${String(observed)}, ` +
        `limit ${String(limit)}. CFML represented numerals as IEEE-754 doubles and could not ` +
        `express a value this wide, so refusing it removes no legacy behaviour.`,
    );
    this.name = 'CfmlNumberMagnitudeError';
  }
}

// Rejects an over-long raw numeral BEFORE it is parsed or echoed. Applied at every
// entry point that accepts a string.
function assertNumeralLength(value: string): void {
  if (value.length > MAX_NUMERAL_CHARACTERS) {
    throw new CfmlNumberMagnitudeError('characters', value.length, MAX_NUMERAL_CHARACTERS);
  }
}

declare const decimalStringBrand: unique symbol;

/**
 * A `string` proven to be a plain decimal numeral.
 *
 * The brand exists because CFML coerces silently between numeric and string while
 * this port does not: `roundValue` declares `returntype="string"`
 * [model/service/RoundingRuleService.cfc:L88] while both of its callers declare
 * `numeric` (L79, L84). Branding the string makes each crossing an explicit call.
 */
export type DecimalString = string & { readonly [decimalStringBrand]: true };

/**
 * Validates a candidate string and brands it.
 *
 * ★ THE LENGTH BOUND IS CHECKED FIRST, before the pattern. That ordering is
 * load-bearing twice over: a million-character string is refused without running a
 * backtracking-free but still linear regex over it, and — more importantly — it is
 * refused by an error that does not echo it, whereas
 * {@link CfmlNumberFormatError} would JSON-stringify the whole thing into its own
 * message. See {@link MAX_NUMERAL_CHARACTERS}.
 *
 * This is also the gate that protects `Money.fromDecimalString`, which imports
 * this function as its only validator, and therefore protects
 * `./precision.ts` as well: every string that reaches the arithmetic module
 * arrives as a value this function has already admitted.
 *
 * @param value the candidate numeral.
 * @returns the same string, branded as a {@link DecimalString}.
 * @throws CfmlNumberMagnitudeError when `value` is longer than
 *   {@link MAX_NUMERAL_CHARACTERS}.
 * @throws CfmlNumberFormatError when `value` is not a plain decimal numeral.
 */
export function toDecimalString(value: string): DecimalString {
  assertNumeralLength(value);

  if (PLAIN_DECIMAL_NUMERAL.test(value)) {
    return value as DecimalString;
  }
  throw new CfmlNumberFormatError(value);
}

// Parses through the configured clone and rejects NaN and both infinities, so no
// non-finite value can reach a presentation or comparison path.
//
// It is also the single funnel every presentation and comparison export in this
// module passes through, which is why the magnitude bound lives here: applying it
// once, immediately after parsing and BEFORE any `toFixed` call, covers
// `numberFormat`, `cfNumberToString`, `cfNumericEquals`, `cfNumericGreaterThan` and
// `cfNumericLessThan` without a bound at each. A `Decimal` handed in directly is
// measured too, so an oversized instance produced elsewhere cannot bypass it.
function toCfmlDecimal(value: string | Decimal): Decimal {
  if (typeof value === 'string') {
    assertNumeralLength(value);
  }

  let parsed: Decimal;
  try {
    parsed = new CFML_DECIMAL(value);
  } catch (cause) {
    throw new CfmlNumberFormatError(value, cause);
  }
  if (!parsed.isFinite()) {
    throw new CfmlNumberFormatError(value);
  }

  // Measured on the PARSED value, so the compact exponential form is caught even
  // though its notation is short. `e` is the exponent of the leading significant
  // digit, so a negative magnitude is covered by the same absolute test.
  const exponent = Math.abs(parsed.e);
  if (exponent > MAX_DECIMAL_EXPONENT) {
    throw new CfmlNumberMagnitudeError('exponent', exponent, MAX_DECIMAL_EXPONENT);
  }

  const decimalPlaces = parsed.dp();
  if (decimalPlaces > MAX_DECIMAL_EXPONENT) {
    throw new CfmlNumberMagnitudeError('decimalPlaces', decimalPlaces, MAX_DECIMAL_EXPONENT);
  }

  return parsed;
}

/**
 * CFML `numberFormat(value, "0.00")`.
 *
 * CFML parity [model/service/PromotionService.cfc:L1017, model/service/PriceGroupService.cfc:L339]:
 * both functions end by formatting to two decimals, so presentation is the last
 * step and never part of the calculation. Output always carries at least one
 * integer digit, never a grouping separator and never an exponent.
 *
 * JUDGMENT CALL: negative zero is normalized, so a value that rounds to zero from
 * below presents as `0.00` rather than `-0.00`.
 *
 * @param value a plain decimal numeral or a decimal instance.
 * @param mask the two-decimal mask; typed as the literal `'0.00'` because that is
 *   the only mask the ported call sites use.
 * @returns the formatted value, half-up rounded to the mask's scale.
 * @throws CfmlNumberFormatError when `value` is not finite or not a plain numeral.
 * @throws CfmlNumberMagnitudeError when `value` is too wide to render in plain
 *   notation — see {@link MAX_NUMERAL_CHARACTERS} and {@link MAX_DECIMAL_EXPONENT}.
 */
export function numberFormat(
  value: string | Decimal,
  mask: TwoDecimalMask = '0.00',
): DecimalString {
  const scale = mask.length - mask.indexOf('.') - 1;

  const formatted = toCfmlDecimal(value).toFixed(scale, CFML_DECIMAL.ROUND_HALF_UP);

  return toDecimalString(
    NEGATIVE_ZERO_PRESENTATION.test(formatted) ? formatted.slice(1) : formatted,
  );
}

/**
 * Renders a value the way CFML stringifies a number: full precision, plain
 * notation, and TRAILING ZEROS DROPPED.
 *
 * This is the mechanism behind the preserved rounding defect below, so it must not
 * be "fixed" to pad decimals.
 *
 * @param value a plain decimal numeral or a decimal instance.
 * @returns the rendered numeral, e.g. `'11.30'` becomes `'11.3'`.
 * @throws CfmlNumberFormatError when `value` is not finite or not a plain numeral.
 * @throws CfmlNumberMagnitudeError when `value` is too wide to render in plain
 *   notation — see {@link MAX_NUMERAL_CHARACTERS} and {@link MAX_DECIMAL_EXPONENT}.
 */
export function cfNumberToString(value: string | Decimal): DecimalString {
  // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: len() is taken of an arithmetic result, and CFML drops trailing zeros when stringifying a number, so a value whose cents end in zero takes a corrupted branch.
  // Preserved deliberately; do not fix without a product decision.
  return toDecimalString(toCfmlDecimal(value).toFixed());
}

/**
 * Compares two numerals BY VALUE, as CFML's `eq` does.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L120]: the rounding algorithm
 * compares candidate deltas numerically, so `'12.350'` and `'12.35'` must be equal
 * even though the strings differ.
 *
 * @param a left numeral or decimal.
 * @param b right numeral or decimal.
 * @returns whether the two are numerically equal.
 * @throws CfmlNumberFormatError when either side is not finite or not a plain numeral.
 * @throws CfmlNumberMagnitudeError when either side is too wide to render in plain
 *   notation — see {@link MAX_NUMERAL_CHARACTERS} and {@link MAX_DECIMAL_EXPONENT}.
 */
export function cfNumericEquals(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).equals(toCfmlDecimal(b));
}

/**
 * `a gt b` by value.
 *
 * @param a left numeral or decimal.
 * @param b right numeral or decimal.
 * @returns whether `a` is numerically greater than `b`.
 * @throws CfmlNumberFormatError when either side is not finite or not a plain numeral.
 * @throws CfmlNumberMagnitudeError when either side is too wide to render in plain
 *   notation — see {@link MAX_NUMERAL_CHARACTERS} and {@link MAX_DECIMAL_EXPONENT}.
 */
export function cfNumericGreaterThan(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).greaterThan(toCfmlDecimal(b));
}

/**
 * `a lt b` by value.
 *
 * @param a left numeral or decimal.
 * @param b right numeral or decimal.
 * @returns whether `a` is numerically less than `b`.
 * @throws CfmlNumberFormatError when either side is not finite or not a plain numeral.
 * @throws CfmlNumberMagnitudeError when either side is too wide to render in plain
 *   notation — see {@link MAX_NUMERAL_CHARACTERS} and {@link MAX_DECIMAL_EXPONENT}.
 */
export function cfNumericLessThan(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).lessThan(toCfmlDecimal(b));
}
