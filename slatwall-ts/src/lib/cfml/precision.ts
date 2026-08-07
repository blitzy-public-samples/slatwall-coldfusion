// slatwall-ts - CFML `precisionEvaluate()` parity: precise decimal arithmetic.
//
// The narrow typed replacement for CFML's `precisionEvaluate()` in the port of the Slatwall 3.1.39
// catalog + promotions/pricing slice.
//
// Arbitrary precision is a schema-level fact, not a preference: legacy money is persisted in
// `big_decimal` columns.
//
// This module and `src/lib/cfml/numberFormat.ts` are the only two modules in the subtree permitted
// to import `decimal.js` directly, and the only two that do: this file owns ARITHMETIC.

// The only import in this module, of any kind.
//
// JUDGMENT CALL: the named import form, settled by compiling both.
import { Decimal } from 'decimal.js';

// The configured arithmetic constructors.
//
// The pinned library rounds the RESULT of `plus`, `minus`, `times` and `dividedBy` to the
// configured number of significant digits.

/**
 * Significant digits for the operations that are EXACT: add, subtract, multiply, magnitude,
 * comparison, and the render boundary.
 *
 * JUDGMENT CALL: 1000, which is headroom rather than a cap - not a limit this port can reach, so
 * the arithmetic here is exact in practice. The reasoning is arithmetic.
 */
const EXACT_ARITHMETIC_PRECISION = 1000;

/**
 * Significant digits at which a non-terminating quotient is resolved.
 *
 * JUDGMENT CALL: declared explicitly rather than inherited from the library's ambient default, and
 * applied to division ALONE.
 */
const DIVISION_PRECISION = 20;

/**
 * Shared configuration for both constructors below - everything except the significant-digit
 * count, which is the one property they differ on.
 *
 * The library copies any UNSPECIFIED property from the parent constructor at clone time.
 */
const SHARED_ARITHMETIC_CONFIG = Object.freeze({
  // JUDGMENT CALL: half-up rounding, declared explicitly for the same reason as the precision
  // constants above - the legacy engine's internal rounding mode is not knowable from the source.
  rounding: Decimal.ROUND_HALF_UP,

  // Exponential-notation thresholds pushed to the representable extremes so that no finite value
  // this module can hold ever renders in exponential form, even through an incidental string
  // conversion.
  toExpNeg: -9e15,
  toExpPos: 9e15,

  // Exponent bounds, stated explicitly so neither clone inherits them.
  minE: -9e15,
  maxE: 9e15,

  // No random values are generated here, so no cryptographic value source is needed.
  crypto: false,

  // Stated only so it is not inherited: this module exposes no remainder operation.
  modulo: Decimal.ROUND_DOWN,
});

/**
 * The constructor every EXACT operation in this module routes through.
 *
 * JUDGMENT CALL: a locally configured clone held in a FROZEN module-scope `const`, never the
 * library's global configuration mutator.
 *
 * `Object.freeze` here is a mechanical guarantee rather than decoration, verified against the
 * pinned library: the frozen constructor still performs arithmetic normally.
 */
const ExactArithmetic: Decimal.Constructor = Object.freeze(
  Decimal.clone({
    ...SHARED_ARITHMETIC_CONFIG,
    precision: EXACT_ARITHMETIC_PRECISION,
  }),
);

/**
 * The constructor `divide` - and only `divide` - routes through.
 *
 * Held separately, frozen, and configured identically to the exact constructor above apart from
 * its significant-digit count, for the reasons set out in the section banner.
 *
 * Why division re-homes its operands rather than just calling `dividedBy`.
 */
const DivisionArithmetic: Decimal.Constructor = Object.freeze(
  Decimal.clone({
    ...SHARED_ARITHMETIC_CONFIG,
    precision: DIVISION_PRECISION,
  }),
);

/**
 * A precise decimal value produced by this module.
 */
export type PreciseValue = Decimal;

/**
 * What every operation in this module accepts: a decimal STRING, or a value this module previously
 * produced.
 *
 * A string operand is accepted in whatever lexical form the pinned decimal library accepts: plain
 * decimal, signed, leading-point, exponential, and hex, binary or octal literal forms.
 */
export type PreciseInput = string | PreciseValue;

/**
 * Raised when an arithmetic request cannot be honoured without inventing a value: a zero divisor,
 * a non-finite operand, a non-finite result, or a non-integer handed to `fromInteger`.
 *
 * JUDGMENT CALL: this class is deliberately not exported. The export surface of this module is a
 * closed set - the value types plus the arithmetic primitives - and widening it is a product
 * decision rather than an implementation detail.
 */
class PrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrecisionError';
  }
}

/**
 * Rejects any decimal that is not finite.
 *
 * This check is load-bearing rather than defensive garnish, and the reason was measured: the
 * constructor ACCEPTS the strings `'NaN'`.
 */
function assertFinite(value: Decimal, context: string): PreciseValue {
  if (!value.isFinite()) {
    throw new PrecisionError(
      `${context} produced a non-finite decimal (${value.toString()}); a non-finite value must ` +
        'never reach a monetary quantity.',
    );
  }

  return value;
}

/**
 * Coerces an operand into a decimal governed by this module's EXACT configuration.
 *
 * Second, an operand that is already a precise value is re-homed onto the frozen exact
 * constructor.
 *
 * Every operation routes through here EXCEPT `divide`, which routes through `toDivisible`.
 */
function toPrecise(input: PreciseInput): PreciseValue {
  return assertFinite(new ExactArithmetic(input), 'operand');
}

/**
 * Coerces an operand into a decimal governed by the DIVISION configuration.
 *
 * Used by `divide` alone, for the reason documented on `DivisionArithmetic`: an operation resolves
 * at the left operand's precision.
 */
function toDivisible(input: PreciseInput): PreciseValue {
  return assertFinite(new DivisionArithmetic(input), 'operand');
}

/**
 * The single deliberate `number` entry point in this module.
 *
 * JUDGMENT CALL: one narrow, explicitly named escape hatch is provided, and the need for it is
 * real.
 *
 * It accepts only a safe integer: a non-integer, a non-finite value, or a magnitude beyond exact
 * integer representation is rejected.
 */
export function fromInteger(value: number): PreciseValue {
  if (!Number.isSafeInteger(value)) {
    throw new PrecisionError(
      `fromInteger accepts only a safe integer; received ${String(value)}. Decimal quantities ` +
        'such as a price, an amount or a discount must be passed as a decimal string.',
    );
  }

  // A safe integer is finite and exactly representable, so the finiteness boundary is already
  // satisfied. Homed on the exact constructor; `divide` re-homes what it is handed anyway.
  return new ExactArithmetic(value);
}

// Every operation below is synchronous and pure: it reads its operands, returns a new value, and
// mutates nothing.

/**
 * Multiplies two precise operands.
 *
 * Each locator below points at the legacy expression in full; the shape of all eleven in-scope
 * sites is tabulated in the file header.
 *
 * CFML parity [model/service/PromotionService.cfc:L990]: the plain `a x b` of
 * `arguments.price * arguments.quantity` at the head of the discount calculation.
 * CFML parity [model/service/PromotionService.cfc:L150]: the two products of `(a x b) - (c x b)`.
 */
export function multiply(multiplicand: PreciseInput, multiplier: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(multiplicand).times(toPrecise(multiplier)), 'multiply');
}

/**
 * Subtracts the subtrahend from the minuend.
 *
 * CFML parity [model/service/PromotionService.cfc:L1007]: the discount that
 * `originalAmount - roundedFinalAmount` implies.
 */
export function subtract(minuend: PreciseInput, subtrahend: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(minuend).minus(toPrecise(subtrahend)), 'subtract');
}

/**
 * Adds two precise operands.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L108]: its in-scope arithmetic antecedent is
 * the rounding algorithm, which adds without the precision guard -
 * `var higherValue = inputValue + rrPower;` is the upward candidate in the rounding search.
 *
 * Offering it keeps `src/services/roundingRuleService.ts` from reaching for floating-point
 * addition on a money value merely because no precise addition existed.
 */
export function add(augend: PreciseInput, addend: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(augend).plus(toPrecise(addend)), 'add');
}

/**
 * Divides the dividend by the divisor.
 *
 * CFML parity [model/service/PromotionService.cfc:L299]: the discount-per-use value
 * `discountAmount / discountQuantity` that the usage ledger insert-sorts on.
 *
 * JUDGMENT CALL: a zero divisor throws. The legacy site at
 * [model/service/PromotionService.cfc:L299] applies no zero check to its divisor, and this module
 * reproduces the ARITHMETIC faithfully while refusing to resolve that case silently.
 *
 * JUDGMENT CALL: a non-terminating quotient is resolved at a declared scale, and division is the
 * only operation here that resolves at all.
 */
export function divide(dividend: PreciseInput, divisor: PreciseInput): PreciseValue {
  const numerator = toDivisible(dividend);
  const denominator = toDivisible(divisor);

  if (denominator.isZero()) {
    throw new PrecisionError(
      `divide received a zero divisor while dividing ${numerator.toFixed()}; CFML ` +
        'precisionEvaluate raises a division-by-zero error, and resolving this to 0 would ' +
        'silently invent money.',
    );
  }

  return assertFinite(numerator.dividedBy(denominator), 'divide');
}

/**
 * Returns the magnitude of a value, discarding its sign.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L123-L130]: a subtraction followed by a
 * manual sign flip when the result is negative.
 *
 * Provided so that `src/services/roundingRuleService.ts` compares candidate deltas by magnitude
 * without hand-rolling that flip.
 */
export function absolute(value: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(value).absoluteValue(), 'absolute');
}

// Every comparison below is by decimal value, never by string.

/**
 * Orders two operands: `-1` when the left is smaller, `1` when it is larger, `0` when they are
 * equal in value.
 *
 * CFML parity [model/service/PromotionService.cfc:L148]: the sale-price seeding test
 * `salePriceDetails.salePrice < orderItem.getSku().getPrice()`.
 *
 * Both operands are coerced through `toPrecise` and are therefore finite, so the comparison cannot
 * yield `NaN` and the `0` branch means equal rather than incomparable.
 */
export function compare(left: PreciseInput, right: PreciseInput): -1 | 0 | 1 {
  const ordering = toPrecise(left).comparedTo(toPrecise(right));

  if (ordering < 0) {
    return -1;
  }

  if (ordering > 0) {
    return 1;
  }

  return 0;
}

/**
 * True when the left operand is strictly greater than the right.
 *
 * CFML parity [model/service/PromotionService.cfc:L257]: the `if(discountAmount > 0)` gate
 * deciding whether a computed discount is recorded against an order item at all.
 */
export function isGreaterThan(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).greaterThan(toPrecise(right));
}

/**
 * True when the left operand is strictly less than the right.
 *
 * CFML parity [model/service/PromotionService.cfc:L148]:
 * `salePriceDetails.salePrice < orderItem.getSku().getPrice()`.
 */
export function isLessThan(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).lessThan(toPrecise(right));
}

/**
 * True when both operands are equal in VALUE.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L120]:
 * `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`.
 */
export function equals(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).equals(toPrecise(right));
}

/**
 * True when the operand is zero, whatever scale it was written at: `'0'`, `'0.00'`, `'-0'` and
 * `'0e5'` are all zero.
 *
 * Needed by callers checking a divisor before calling `divide`, which uses exactly this test in
 * its own guard, and by callers deciding whether a computed discount is worth recording.
 */
export function isZero(value: PreciseInput): boolean {
  return toPrecise(value).isZero();
}

/**
 * Renders a precise value as a plain decimal string.
 *
 * The boundary at which a precise value leaves this module - for persistence into a `big_decimal`
 * column, or for a presentation step that applies a mask.
 *
 * NAMED `toPlainDecimalString`, not `toDecimalString`, on purpose. `numberFormat.ts` exports
 * `toDecimalString`, which VALIDATES a numeral and returns the branded `DecimalString`; this one
 * RENDERS and returns a plain `string`. Two functions with one name in the same folder would let a
 * consumer reach for the wrong import and silently bypass the brand that the single-arithmetic-
 * surface discipline relies on, so the bare name belongs to the brand-preserving one.
 *
 * JUDGMENT CALL: plain notation is guaranteed by construction.
 */
export function toPlainDecimalString(value: PreciseInput): string {
  return toPrecise(value).toFixed();
}
