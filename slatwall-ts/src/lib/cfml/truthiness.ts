// slatwall-ts - CFML truthiness parity.
//
// Deterministic TypeScript translation of three CFML coercion behaviours that do not map onto
// TypeScript `undefined` / `null` / `''`: `isNull()`, `len()`-based truthiness.
//
// The export surface is closed at four functions plus the three input types they accept, and every
// one traces to a verified legacy behaviour cited below.
//
// No export is async, and three of the four are total: `isNullish` and `cfLen` answer every input,
// and `cfBoolean` resolves the one absent case its ORM evidence justifies.

/**
 * Accepted input to {@link cfLen}.
 *
 * CFML `len()` is defined over strings, numbers and arrays, and this union is exactly that domain
 * plus the two absent states.
 *
 * `null` and `undefined` are both admitted because an absent value reaches this helper by two
 * distinct routes - a hydrated SQL NULL, and a struct key that was never set.
 */
export type CfLenInput = string | number | readonly unknown[] | null | undefined;

/**
 * Accepted input to {@link cfTruthy}.
 *
 * Written as the four broad constituents rather than as an enumeration of literals, because
 * `'0' | '1' | 'true' | 'false'` is redundant against `string` and `0 | 1` is redundant against
 * `number`.
 */
export type CfTruthyInput = string | number | boolean | null | undefined;

/**
 * Accepted input to {@link cfBoolean}.
 */
export type CfBooleanInput = string | number | boolean | null | undefined;

/**
 * String literals CFML accepts as boolean true, compared after trimming and lower-casing.
 *
 * Frozen at module scope and never mutated, so this carries no state between invocations.
 */
const CFML_TRUE_LITERALS: ReadonlySet<string> = new Set(['true', 'yes', '1']);
const CFML_FALSE_LITERALS: ReadonlySet<string> = new Set(['false', 'no', '0']);

/**
 * What CFML `isNumeric()` accepts: an optional sign, decimal digits with an optional decimal point
 * in either position, and an optional decimal exponent.
 *
 * This is deliberately narrower than JavaScript's `Number()`, which also accepts `0x10` as 16,
 * `0b11` as 3 and `'Infinity'` as Infinity.
 */
const CFML_NUMERIC_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * JavaScript's exponential rendering of a number, decomposed for expansion into plain decimal
 * notation: sign, integer digits, optional fraction digits, and the signed exponent.
 */
const EXPONENTIAL_NOTATION_PATTERN = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

// The one failure this module can report.

/**
 * Raised when a value cannot be converted to a boolean, exactly where CFML's own boolean coercion
 * raises a conversion error.
 *
 * The message names the rejected value, its runtime type and the specific reason, because "cannot
 * convert to boolean" without the offending value is not a diagnosis.
 */
export class CfmlBooleanConversionError extends Error {
  /**
   * @param value the value that could not be interpreted as a boolean.
   * @param reason why it could not be, in terms of CFML's own semantics.
   */
  public constructor(value: unknown, reason: string) {
    super(`cfTruthy cannot convert ${describeRejectedValue(value)} to a boolean: ${reason}`);
    this.name = 'CfmlBooleanConversionError';
  }
}

/**
 * Renders a rejected value for an error message: its runtime type, and its content when the
 * content is safe and useful to show.
 *
 * A string is quoted so that `'0'`, `''` and `' '` are visibly different from one another and from
 * the number `0`; that distinction is the whole subject of this module.
 */
function describeRejectedValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    const shown =
      value.length > MAX_REPORTED_VALUE_LENGTH
        ? `${value.slice(0, MAX_REPORTED_VALUE_LENGTH)}...`
        : value;

    return `the string "${shown}" (length ${String(value.length)})`;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `the ${typeof value} ${String(value)}`;
  }

  // Anything else is off-union at runtime. Its type is reported; its contents are not, because an
  // arbitrary object may carry data that does not belong in a log.
  return `a value of type ${typeof value}`;
}

/**
 * How much of a rejected string an error message reproduces.
 *
 * Long enough to recognise a realistic flag value or a truncated boolean literal, short enough
 * that a request-supplied string cannot dominate a log line.
 */
const MAX_REPORTED_VALUE_LENGTH = 64;

/**
 * The CFML `isNull()` equivalent: is this value absent?
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L90-L91]: the rounding algorithm seeds
 * `returnValue` and `returnDelta` with `javaCast("null", "")` and then branches on `isNull()` at
 * L134, L138, L145, L149, L156, L160 and L170.
 *
 * Use this wherever the legacy code asked `isNull()` or `!isNull()` and the three-state
 * distinction matters: absent, versus present-and-false.
 */
export function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Renders a number the way CFML would render it before measuring its length: plain decimal
 * notation, never exponential.
 *
 * JavaScript switches to exponential notation at the extremes - `String(1e21)` is `'1e+21'` and
 * `String(1e-7)` is `'1e-7'` - whereas CFML renders a plain decimal string.
 */
function toPlainDecimalString(value: number): string {
  const rendered = String(value);
  const match = EXPONENTIAL_NOTATION_PATTERN.exec(rendered);

  if (match === null) {
    return rendered;
  }

  const [, sign, integerDigits, fractionDigits, exponentDigits] = match;

  // Every group the pattern requires is present whenever it matches.
  if (sign === undefined || integerDigits === undefined || exponentDigits === undefined) {
    return rendered;
  }

  const digits = `${integerDigits}${fractionDigits ?? ''}`;
  const pointPosition = integerDigits.length + Number(exponentDigits);

  if (pointPosition <= 0) {
    return `${sign}0.${'0'.repeat(-pointPosition)}${digits}`;
  }

  if (pointPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPosition - digits.length)}`;
  }

  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/**
 * The CFML `len()` equivalent. Returns a COUNT, not a boolean.
 *
 * CFML parity [model/entity/Sku.cfc:L373]: that composition is exactly the currency-eligibility
 * gate, `if(len(setting('skuEligibleCurrencies')))`. An empty setting yields 0, the gate does not
 * open, and the memoized currency detail map stays `{}`.
 *
 * CFML parity [model/service/SkuService.cfc:L142, L147, L175] and
 * [model/entity/PriceGroupRate.cfc:L131, L157]: the `listLen` sites are the same shape, a count
 * consumed as a predicate.
 */
export function cfLen(value: CfLenInput): number {
  // The absent test is written inline rather than delegated to `isNullish()` because that export
  // returns `boolean`, as its contract requires, and a `boolean` return does not narrow the union
  // for the compiler.
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string') {
    return value.length;
  }

  if (typeof value === 'number') {
    // JUDGMENT CALL: CFML has no NaN, so no legacy behaviour is being preserved here and none may
    // be claimed.
    if (Number.isNaN(value)) {
      return 0;
    }

    // JUDGMENT CALL: `Infinity` and `-Infinity` cannot arise from CFML either. They fall through
    // to their plain rendering, `'Infinity'` and `'-Infinity'`, giving 8 and 9 - non-zero,
    // matching the fact that `cfTruthy` reads either infinity as true.
    return toPlainDecimalString(value).length;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  // JUDGMENT CALL: this branch is unreachable through the declared input type, and it is here
  // because TypeScript's guarantee stops at the compile boundary.
  //
  // 0 is the fail-closed direction, and that choice is deliberate rather than convenient.
  return 0;
}

/**
 * The CFML boolean-coercion decision table, applied deterministically.
 *
 * | input | result | grounding | | `true` | true | CFML boolean, unchanged | | `false` | false |
 * CFML boolean, unchanged | | `null`, `undefined` | RAISES |
 * CFML parity - CFML throws | | `NaN` | RAISES | no CFML analogue.
 *
 * @throws {CfmlBooleanConversionError} for an absent value, `NaN`, a non-empty non-boolean
 * non-numeric string, or a shape outside the declared union.
 */
export function cfTruthy(value: CfTruthyInput): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  // The persisted-flag case, which genuinely does want false for SQL NULL, is not affected: that
  // boundary lives in `cfBoolean`, which resolves an absent flag to false ITSELF.
  if (value === null || value === undefined) {
    throw new CfmlBooleanConversionError(
      value,
      'CFML raises a conversion error when a null reaches a boolean context. Call isNullish() ' +
        'first if absence is a state this caller must handle, or cfBoolean() if this is a ' +
        'persisted flag whose column may hydrate as SQL NULL.',
    );
  }

  if (typeof value === 'number') {
    // CFML has no NaN, so no legacy behaviour is being ported here either way - which is exactly
    // why it must not be resolved to a value.
    if (Number.isNaN(value)) {
      throw new CfmlBooleanConversionError(
        value,
        'NaN has no CFML counterpart and is how a failed numeric parse arrives; resolving it to ' +
          'a boolean would hide that failure.',
      );
    }

    // CFML parity
    // [model/service/PromotionService.cfc:L61, L200, L542, L714, L794, L865, L900, L935, L966],
    // [model/entity/Product.cfc:L440, L442, L451], [model/entity/Sku.cfc:L294, L299, L306, L309]
    // and, negated, [model/service/ProductService.cfc:L144]: `listFindNoCase()` returns a 1-based
    // index or 0 when absent.
    //
    // JUDGMENT CALL: `Infinity` and `-Infinity` are non-zero and so answer true. Neither can arise
    // from CFML, so no legacy behaviour is claimed for them.
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    // CFML parity [model/entity/Sku.cfc:L373]: the currency-eligibility gate
    // `if(len(setting('skuEligibleCurrencies')))` is exactly "empty string is falsy". This is the
    // one branch of the table with direct, unambiguous legacy grounding.
    if (normalized.length === 0) {
      return false;
    }
    if (CFML_TRUE_LITERALS.has(normalized)) {
      return true;
    }

    if (CFML_FALSE_LITERALS.has(normalized)) {
      return false;
    }

    // A numeric string coerces through its value, so `'2'` is true and `'0.0'` is false.
    if (CFML_NUMERIC_PATTERN.test(normalized)) {
      return Number(normalized) !== 0;
    }
    throw new CfmlBooleanConversionError(
      value,
      'CFML raises a conversion error for a non-empty string that is neither a boolean literal ' +
        "(true/false/yes/no) nor numeric. Note that '' is NOT rejected - it is falsy, per the " +
        'currency-eligibility gate at [model/entity/Sku.cfc:L373].',
    );
  }

  // Unreachable through the declared input type, and present for the same reason as the closing
  // branch of `cfLen` - TypeScript's guarantee stops at the compile boundary.
  throw new CfmlBooleanConversionError(
    value,
    'the value is outside the declared input union, which means a runtime shape - most likely a ' +
      'database column - that neither the type system nor this table anticipated.',
  );
}

/**
 * Reads a persisted boolean flag out of a hydrated `Sw*` row.
 *
 * This is what ported entity getters for `activeFlag`, `globalFlag`, `imageGroupFlag` and their
 * siblings use.
 *
 * Note the attribute itself is spelled `ormtype` in the first and third and `ormType` in the
 * second.
 *
 * @throws {CfmlBooleanConversionError} if the value is present but carries no boolean meaning.
 */
export function cfBoolean(value: CfBooleanInput): boolean {
  // The persisted-flag boundary. See the note above: nine undefaulted `ormtype="boolean"` columns
  // make SQL NULL an expected value here, so it is resolved rather than raised - unlike in a
  // general boolean context.
  if (isNullish(value)) {
    return false;
  }

  return cfTruthy(value);
}
