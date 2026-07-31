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
 * Raised when a value is not a finite plain decimal numeral.
 *
 * Exported so a caller can discriminate malformed input from any other failure.
 * The received value is JSON-stringified so an empty string or whitespace is
 * visible in the message.
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
 * @param value the candidate numeral.
 * @returns the same string, branded as a {@link DecimalString}.
 * @throws CfmlNumberFormatError when `value` is not a plain decimal numeral.
 */
export function toDecimalString(value: string): DecimalString {
  if (PLAIN_DECIMAL_NUMERAL.test(value)) {
    return value as DecimalString;
  }
  throw new CfmlNumberFormatError(value);
}

// Parses through the configured clone and rejects NaN and both infinities, so no
// non-finite value can reach a presentation or comparison path.
function toCfmlDecimal(value: string | Decimal): Decimal {
  let parsed: Decimal;
  try {
    parsed = new CFML_DECIMAL(value);
  } catch (cause) {
    throw new CfmlNumberFormatError(value, cause);
  }
  if (parsed.isFinite()) {
    return parsed;
  }
  throw new CfmlNumberFormatError(value);
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
