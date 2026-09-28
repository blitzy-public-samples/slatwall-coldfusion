// slatwall-ts - CFML struct-key access semantics.
//
// Is a key PRESENT? -> structKeyExists / structFindKey / structKeyList * What VALUE is stored
// under it? -> structGet / structGetPath.
//
// Plus one comparison primitive, cfEquals, for the case-insensitive `eq` that the currency cascade
// uses on currency codes.
//
// StructDelete is the concrete case worth naming: it occurs exactly once in the whole in-scope
// slice, at model/service/RoundingRuleService.cfc:L59.

/**
 * A CFML struct as it arrives in TypeScript: a plain object keyed by string.
 *
 * `T` defaults to `unknown` rather than `any` so a caller that has not yet decided on a value type
 * still gets a type it must narrow before use.
 *
 * A note on modelling, because `exactOptionalPropertyTypes` is load-bearing in this file: an
 * ABSENT key and a key PRESENT with the value `undefined` are different states.
 */
export type CfStruct<T = unknown> = Readonly<Record<string, T>>;

// The one failure this module can report.

/**
 * Raised when a case-insensitive comparison is asked of an absent operand.
 *
 * EXPORTED DELIBERATELY, so a caller can distinguish "the codes differ" from "one of the codes was
 * never resolved".
 *
 * The message names which operand was absent and what the other one was, because on a currency
 * path the surviving operand is usually the clue to where the missing one should have come from.
 */
export class CfmlComparisonError extends Error {
  /**
   * @param operandName `'a'` or `'b'`: which argument was absent.
   * @param absentValue the absent value, distinguishing `null` from `undefined`.
   * @param otherValue the other operand, reported to aid diagnosis.
   */
  public constructor(
    operandName: 'a' | 'b',
    absentValue: null | undefined,
    otherValue: string | null | undefined,
  ) {
    super(
      `cfEquals received ${absentValue === null ? 'null' : 'undefined'} as operand ` +
        `"${operandName}", with the other operand being ${describeOtherOperand(otherValue)}. ` +
        'CFML raises when a null reaches eq, and answering false here would be ' +
        'indistinguishable from the two values genuinely differing.',
    );
    this.name = 'CfmlComparisonError';
  }
}

/**
 * Renders the surviving operand of a failed comparison.
 *
 * Quoted, so an empty string is visibly different from an absent one - the very distinction this
 * error exists to protect.
 */
function describeOtherOperand(value: string | null | undefined): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  const shown =
    value.length > MAX_REPORTED_OPERAND_LENGTH
      ? `${value.slice(0, MAX_REPORTED_OPERAND_LENGTH)}...`
      : value;

  return `"${shown}"`;
}

/**
 * How much of a surviving operand an error message reproduces.
 *
 * A currency code is three characters and a setting key is short, so this is generous for every
 * legitimate value and still bounded.
 */
const MAX_REPORTED_OPERAND_LENGTH = 48;

/**
 * Folds a key to its comparison form.
 *
 * JUDGMENT CALL: `toLowerCase()`, never `toLocaleLowerCase()`. CFML matches struct keys and
 * evaluates `eq` without consulting a locale.
 *
 * JUDGMENT CALL: keys are not trimmed. CFML struct keys preserve surrounding whitespace, so only
 * case is folded here.
 */
function foldKey(key: string): string {
  return key.toLowerCase();
}

/**
 * Narrows a runtime string to a genuine own key of `struct`.
 *
 * This exists for the type system, and its runtime check is `hasOwnProperty` called off
 * `Object.prototype` rather than off the object itself.
 */
function isOwnKeyOf<TStruct extends object>(
  struct: TStruct,
  key: string,
): key is keyof TStruct & string {
  return Object.prototype.hasOwnProperty.call(struct, key);
}

/**
 * Resolves `key` case-insensitively to the key actually stored on `struct`, or `undefined` when no
 * own key matches.
 *
 * The single place in this module where a key is matched.
 *
 * JUDGMENT CALL: on a collision, the FIRST match in insertion order wins. CFML cannot represent a
 * struct holding both `'price'` and `'Price'` at all, so this state is unreachable from ported
 * CFML and has no legacy behaviour to preserve.
 */
function findStoredKey<TStruct extends object>(
  struct: TStruct,
  key: string,
): (keyof TStruct & string) | undefined {
  const wanted = foldKey(key);

  for (const storedKey of Object.keys(struct)) {
    if (foldKey(storedKey) === wanted && isOwnKeyOf(struct, storedKey)) {
      return storedKey;
    }
  }

  return undefined;
}

/**
 * Is `key` present on `struct`, matched case-insensitively?
 *
 * CFML parity [model/entity/Sku.cfc:L270]: the single presence test that guards the price read.
 * CFML parity [model/entity/Sku.cfc:L276, L282]: the paired presence tests, the second of which
 * inspects a sub-key.
 */
export function structKeyExists(struct: object, key: string): boolean {
  return findStoredKey(struct, key) !== undefined;
}

/**
 * The key as it is actually stored on `struct`, matched case-insensitively, or `undefined` when no
 * own key matches.
 *
 * Exists because a caller sometimes needs the canonical spelling rather than the value: to report
 * which key answered a lookup.
 *
 * Deliberately minimal: it returns the matching key and nothing else.
 */
export function structFindKey(struct: object, key: string): string | undefined {
  return findStoredKey(struct, key);
}

/**
 * The canonical identity form of a key, for a store this module does not own.
 *
 * It is the same FOLD, not A SECOND one. It delegates to the module-local `foldKey`, so a `Map`
 * keyed through this function and an object read through `structGet` can never disagree about
 * whether two spellings are one key.
 *
 * @param key the key, in whatever case it arrived.
 * @returns its comparison form.
 */
export function cfFoldKey(key: string): string {
  return foldKey(key);
}

/**
 * The keys stored on `struct`, as a fresh array.
 *
 * Reproduces the CFML pattern of taking a struct's keys and then indexing back into the struct
 * with one of them.
 *
 * JUDGMENT CALL: the result is in insertion order, and no ported caller may depend on that.
 */
export function structKeyList(struct: object): string[] {
  return Object.keys(struct);
}

/**
 * The value stored under `key` on `struct`, matched case-insensitively, or `undefined` when no own
 * key matches.
 *
 * The return type carries the honest union of what `struct` can hold plus `undefined`.
 *
 * CFML parity [model/entity/Sku.cfc:L269-L273]: `getPriceByCurrencyCode` tests the currency key
 * once, returns `.price` when it matches, and has no `else` and no fallback - so an unmatched
 * currency yields nothing. That is the contract this function reproduces.
 */
export function structGet<TStruct extends object>(
  struct: TStruct,
  key: string,
): TStruct[keyof TStruct] | undefined {
  const storedKey = findStoredKey(struct, key);

  if (storedKey === undefined) {
    return undefined;
  }

  return struct[storedKey];
}

/**
 * The value stored under `innerKey` inside the entry stored under `outerKey`, both matched
 * case-insensitively, or `undefined` when either level is absent.
 *
 * CFML parity [model/entity/Sku.cfc:L275-L279]: `getListPriceByCurrencyCode` performs two
 * `structKeyExists` calls on one line - the currency key and the `"listPrice"` sub-key - and
 * yields nothing unless both hold.
 *
 * CFML parity [model/entity/Sku.cfc:L381-L382]: the OUTER entry is created for every eligible
 * currency UNCONDITIONALLY, before any pricing step runs.
 *
 * CFML parity [model/entity/Sku.cfc:L416]: the conversion step is itself gated on the absence of
 * the `"price"` sub-key specifically.
 */
export function structGetPath<TInner extends object>(
  struct: CfStruct<TInner>,
  outerKey: string,
  innerKey: string,
): TInner[keyof TInner] | undefined {
  const outerValue = structGet(struct, outerKey);

  // Level one absent.
  // CFML parity [model/entity/Sku.cfc:L276, L282]: the first structKeyExists fails and the
  // function falls off its end, yielding nothing.
  if (outerValue === undefined) {
    return undefined;
  }

  // Level two.
  // CFML parity [model/entity/Sku.cfc:L276, L282]: the second structKeyExists, which is the check
  // that makes this primitive necessary.
  const storedInnerKey = findStoredKey(outerValue, innerKey);

  if (storedInnerKey === undefined) {
    return undefined;
  }

  return outerValue[storedInnerKey];
}

/**
 * Case-insensitive string equality, reproducing the CFML `eq` operator as the currency cascade
 * uses it.
 *
 * CFML parity [model/entity/Sku.cfc:L385]: the base-currency step selects its currency with
 * `thisCurrency.getCurrencyCode() eq this.setting('skuCurrency')`, and CFML `eq` is
 * case-insensitive - so a currency code of `'usd'` matches a configured `'USD'`.
 *
 * @throws {CfmlComparisonError} if either operand is `null` or `undefined`.
 */
export function cfEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined) {
    throw new CfmlComparisonError('a', a, b);
  }

  if (b === null || b === undefined) {
    throw new CfmlComparisonError('b', b, a);
  }

  return foldKey(a) === foldKey(b);
}
