/**
 * CFML numeric-presentation parity: `numberFormat(value, "0.00")` and the stringification
 * semantics the rounding algorithm depends on.
 */

import { Decimal } from 'decimal.js';

// A locally configured, frozen clone so the global decimal configuration is never mutated.
const CFML_DECIMAL = Object.freeze(
  Decimal.clone({
    rounding: Decimal.ROUND_HALF_UP,
    toExpNeg: -9e15,
    toExpPos: 9e15,
  }),
);

type TwoDecimalMask = '0.00';

// What counts as a plain decimal numeral: optional sign, no grouping separator, no exponent, no
// surrounding whitespace.
const PLAIN_DECIMAL_NUMERAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

const NEGATIVE_ZERO_PRESENTATION = /^-0(?:\.0+)?$/;

/**
 * The widest raw numeral this module will parse, in characters.
 *
 * It is checked before the value is parsed, which is the point: parsing a million-digit numeral is
 * itself linear in its length.
 */
const MAX_NUMERAL_CHARACTERS = 1024;

/**
 * The widest decimal magnitude this module will render, as an absolute exponent and as a count of
 * decimal places.
 *
 * The character bound above cannot catch the COMPACT form: `1e1000000` is nine characters and
 * expands to a million.
 *
 * A real monetary value is nowhere near this: `big_decimal` prices in the `Sw*` schema carry a
 * handful of digits.
 */
const MAX_DECIMAL_EXPONENT = 256;

/**
 * Raised when a value is not a finite plain decimal numeral.
 *
 * Exported so a caller can discriminate malformed input from any other failure.
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
 * A SEPARATE TYPE from {@link CfmlNumberFormatError}, because the two conditions are genuinely
 * different and a caller may well want to distinguish them: one says "this is not a number".
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

// Rejects an over-long raw numeral before it is parsed or echoed. Applied at every entry point
// that accepts a string.
function assertNumeralLength(value: string): void {
  if (value.length > MAX_NUMERAL_CHARACTERS) {
    throw new CfmlNumberMagnitudeError('characters', value.length, MAX_NUMERAL_CHARACTERS);
  }
}

// `assertNumeralLength` reads `value.length`, which is `undefined` on a number, and
// `undefined > 1024` evaluates to `false`, so no bound is applied at all; *
// `RegExp.prototype.test` coerces its argument with `String()`.
function assertIsString(value: unknown): void {
  if (typeof value !== 'string') {
    throw new CfmlNumberFormatError(value);
  }
}

declare const decimalStringBrand: unique symbol;

/**
 * A `string` proven to be a plain decimal numeral.
 */
export type DecimalString = string & { readonly [decimalStringBrand]: true };

/**
 * Validates a candidate string and brands it.
 *
 * This is also the gate that protects `Money.fromDecimalString`, which imports this function as
 * its only validator.
 *
 * @param value the candidate numeral.
 * @returns the same string, branded as a {@link DecimalString}.
 * @throws CfmlNumberFormatError when `value` is not a string at runtime.
 */
export function toDecimalString(value: string): DecimalString {
  assertIsString(value);
  assertNumeralLength(value);

  if (PLAIN_DECIMAL_NUMERAL.test(value)) {
    return value as DecimalString;
  }
  throw new CfmlNumberFormatError(value);
}

// Parses through the configured clone and rejects NaN and both infinities, so no non-finite value
// can reach a presentation or comparison path.
//
// It is also the single funnel every presentation and comparison export in this module passes
// through, which is why the magnitude bound lives here: applying it once.
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

  // Measured on the PARSED value, so the compact exponential form is caught even though its
  // notation is short.
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
 * CFML parity
 * [model/service/PromotionService.cfc:L1017, model/service/PriceGroupService.cfc:L339]: both
 * functions end by formatting to two decimals, so presentation is the last step and never part of
 * the calculation.
 *
 * JUDGMENT CALL: negative zero is normalized, so a value that rounds to zero from below presents
 * as `0.00` rather than `-0.00`.
 *
 * @param value a plain decimal numeral or a decimal instance.
 * @param mask the two-decimal mask; typed as the literal `'0.00'` because that is the only mask
 * the ported call sites use.
 * @returns the formatted value, half-up rounded to the mask's scale.
 * @throws CfmlNumberFormatError when `value` is not finite or not a plain numeral.
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
 * Renders a value the way CFML stringifies a number: full precision, plain notation, and trailing
 * zeros dropped.
 *
 * This is the mechanism behind the preserved rounding defect below, so it must not be "fixed" to
 * pad decimals.
 *
 * @param value a plain decimal numeral or a decimal instance.
 * @returns the rendered numeral, e.g.
 * @throws CfmlNumberFormatError when `value` is not finite or not a plain numeral.
 */
export function cfNumberToString(value: string | Decimal): DecimalString {
  // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: len() is taken of
  // an arithmetic result, and CFML drops trailing zeros when stringifying a number, so a value
  // whose cents end in zero takes a corrupted branch.
  // Preserved deliberately; do not fix without a product decision.
  return toDecimalString(toCfmlDecimal(value).toFixed());
}

/**
 * Compares two numerals by value, as CFML's `eq` does.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L120]: the rounding algorithm compares
 * candidate deltas numerically, so `'12.350'` and `'12.35'` must be equal even though the strings
 * differ.
 *
 * @param a left numeral or decimal.
 * @param b right numeral or decimal.
 * @returns whether the two are numerically equal.
 * @throws CfmlNumberFormatError when either side is not finite or not a plain numeral.
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
 */
export function cfNumericLessThan(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).lessThan(toCfmlDecimal(b));
}
