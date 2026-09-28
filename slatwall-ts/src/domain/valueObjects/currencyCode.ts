// slatwall-ts - the CurrencyCode value object.
//
// CFML parity [model/entity/PromotionApplied.cfc:L53, L55]: `discountAmount` is
// `ormtype="big_decimal"` and `currencyCode` is `ormtype="string" length="3"` - separate columns.
//
// No legacy TODO falls inside this file, and none is invented.

import { cfEquals, structGet } from '../../lib/cfml/struct.js';
import type { CfStruct } from '../../lib/cfml/struct.js';
import { cfLen } from '../../lib/cfml/truthiness.js';

/**
 * The exact character count a currency code must have.
 *
 * Traced to a single schema declaration and to nothing else: `ormtype="string" length="3"` at
 * [model/entity/PromotionApplied.cfc:L55].
 *
 * Named once so the validator, the guard and the error message cannot drift apart, and kept
 * module-private so it does not widen this file's export surface.
 */
const CURRENCY_CODE_LENGTH = 3;

/**
 * Thrown when a value cannot be a currency code.
 *
 * Exported because it is part of {@link toCurrencyCode}'s contract: a caller that wants to
 * distinguish a malformed currency code from any other failure needs the type to test against.
 *
 * The message and the {@link received} property echo the offending value.
 */
export class InvalidCurrencyCodeError extends Error {
  /**
   * The value that was rejected, exactly as supplied - never normalized.
   */
  public readonly received: string;

  /**
   * The rejected value's length, measured the way CFML `len()` measures it. See {@link
   * toCurrencyCode} for why that distinction is the faithful one.
   */
  public readonly receivedLength: number;

  public constructor(received: string) {
    const receivedLength = cfLen(received);

    super(
      `Expected a currency code of exactly ${CURRENCY_CODE_LENGTH} characters, received ` +
        `${JSON.stringify(received)} of length ${receivedLength}`,
    );

    this.name = 'InvalidCurrencyCodeError';
    this.received = received;
    this.receivedLength = receivedLength;
  }
}

/**
 * Phantom brand for {@link CurrencyCode}.
 *
 * `declare const` on a `unique symbol` exists only in the type system.
 *
 * It is not exported, which is what makes the brand unforgeable.
 */
declare const currencyCodeBrand: unique symbol;

/**
 * A `string` that is known to be exactly three characters long, and is therefore storable in a
 * currency-code column without truncation.
 *
 * What it does not ASSERT, stated plainly so nobody reads more into it than is there.
 *
 * Because it is a branded `string`, it is assignable to `string` and every ordinary string
 * operation still works.
 */
export type CurrencyCode = string & { readonly [currencyCodeBrand]: true };

/**
 * The primary way to obtain a {@link CurrencyCode}: validate, then brand.
 *
 * The parameter is `string` rather than `string | null | undefined`.
 *
 * JUDGMENT CALL: the value is not trimmed. A four-character input with a leading space is INVALID,
 * not silently shortened to the three characters inside it.
 *
 * @param value an untrusted string, taken exactly as given.
 * @returns the same string, branded.
 * @throws {InvalidCurrencyCodeError} if the length is not exactly three.
 */
export function toCurrencyCode(value: string): CurrencyCode {
  if (cfLen(value) === CURRENCY_CODE_LENGTH) {
    return value as CurrencyCode;
  }

  throw new InvalidCurrencyCodeError(value);
}

/**
 * Is `value` a currency code? A type guard, and it never throws.
 *
 * The non-throwing counterpart to {@link toCurrencyCode}, and the correct tool at a
 * repository-hydration boundary: a row value arrives untyped.
 *
 * Applies exactly the same rule as {@link toCurrencyCode} - length only, no trimming, no case
 * folding - because two validators that disagree would be worse than one.
 */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && cfLen(value) === CURRENCY_CODE_LENGTH;
}

/**
 * Case-insensitive currency-code equality: the CFML `eq` operator, reproduced.
 *
 * The comparison itself is delegated to `cfEquals` and is deliberately not re-implemented here.
 *
 * The asymmetry with strict equality is therefore gone rather than inverted:
 * `currencyCodeEquals(undefined, undefined)` does not answer `false` where
 * `undefined === undefined` is `true`.
 *
 * @throws {CfmlComparisonError} if either operand is `null` or `undefined`.
 */
export function currencyCodeEquals(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return cfEquals(a, b);
}

/**
 * The entry stored under `currencyCode` in a currency-code-keyed map, matched case-insensitively,
 * or `undefined` when no key matches.
 *
 * There is deliberately no `defaultValue` parameter, and none may be added.
 *
 * CFML parity [model/entity/Sku.cfc:L270, L276, L282]: the currency-details map is keyed by
 * currency code, and every legacy read of it is a `structKeyExists`-then-index pair on a
 * case-insensitive key.
 */
export function getByCurrencyCode<TEntry>(
  struct: CfStruct<TEntry>,
  currencyCode: string,
): TEntry | undefined {
  return structGet(struct, currencyCode);
}
