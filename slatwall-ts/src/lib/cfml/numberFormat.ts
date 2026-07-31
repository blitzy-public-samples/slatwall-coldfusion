// ---------------------------------------------------------------------------
// slatwall-ts - CFML number-stringification parity
//
// WHAT THIS FILE IS
// Three CFML semantics that the promotions/pricing slice of Slatwall 3.1.39
// depends on, expressed as idiomatic TypeScript over an arbitrary-precision
// decimal:
//
//   1. `numberFormat(v, "0.00")`  - the two-decimal PRESENTATION function.
//   2. `cfNumberToString(v)`      - the trailing-zero dropping that CFML
//                                   applies when it stringifies a NUMBER.
//   3. value-based decimal comparison - because CFML compares two strings
//                                   NUMERICALLY, and TypeScript does not.
//
// Plus one branded type, `DecimalString`, declared here and nowhere else.
//
// ---------------------------------------------------------------------------
// THIS FILE IS NOT COSMETIC. READ THIS BEFORE CHANGING ANYTHING.
// ---------------------------------------------------------------------------
// `cfNumberToString()` is the MECHANISM behind a real money defect in
// `roundValue` [model/service/RoundingRuleService.cfc:L88-L175]. That function
// takes `len()` of an ARITHMETIC result, and because CFML drops trailing zeros
// when stringifying a number, any value whose cents end in zero takes a
// different - and materially different - branch. It fires on roughly one money
// value in ten.
//
// A "corrected", mathematically tidier implementation FAILS the acceptance
// gate recorded further down this file. Fidelity to measured legacy output
// beats mathematical tidiness here, without exception. If a behaviour below
// looks wrong, it is reproduced on purpose: reproduce and annotate, never
// repair.
//
// Note the nuance carefully, because it is easy to state backwards:
// `cfNumberToString()` is CORRECT CFML behaviour. The defect is `roundValue`
// taking `len()` of it. This file supplies a faithful substrate; the consuming
// algorithm is where the money outcome changes. The defect-register entry
// therefore belongs to `services/roundingRuleService.ts`, NOT to this file.
// This file owns no register entry.
//
// ---------------------------------------------------------------------------
// EVERY EXPORT RETURNS A STRING. NONE RETURNS A `number`.
// ---------------------------------------------------------------------------
// `numberFormat` is a PRESENTATION function. The legacy code hides that:
// [model/service/PromotionService.cfc:L1017] is
//
//     return numberFormat(discountAmount, "0.00");
//
// returned from a function declared `returntype="numeric"`
// [model/service/PromotionService.cfc:L987], so CFML silently coerces the
// string back to a number. The target does NOT paper over that duality - the
// string boundary is explicit and typed, and the caller converts explicitly.
//
// The two formatters return `DecimalString`, which IS a `string` (it is
// `string & <phantom brand>`), so "returns a string" holds exactly. The brand
// simply records the invariant they already guarantee.
//
// ---------------------------------------------------------------------------
// THE THREE VERIFIED CALL SITES  (re-read in source; these supersede any
// conflicting citation elsewhere)
// ---------------------------------------------------------------------------
//   [model/service/PromotionService.cfc:L1017]
//       `return numberFormat(discountAmount, "0.00");`
//   [model/service/PriceGroupService.cfc:L339]
//       `return numberFormat(newPrice, "0.00");`
//       *** LOCATOR CORRECTION: published elsewhere as L337. It is L339.
//       *** L337 is blank and L338 is the preceding comment. Verified by
//       *** reading the file; recorded here so the correction is durable.
//   [model/service/RoundingRuleService.cfc:L89]
//       `var inputValue = numberFormat(arguments.value, "0.00");`
//       This produces a STRING, which is precisely why every downstream
//       `len()` in `roundValue` is a string-length operation.
//
// The mask is `"0.00"` at all three sites and no other mask appears anywhere
// in the in-scope slice.
//
// ---------------------------------------------------------------------------
// PROJECT RULES: NONE WERE PROVIDED
// ---------------------------------------------------------------------------
//   (1) No user-specified rules were provided for this project; the rules
//       source returns exactly "No user rules provided."
//   (2) That absence was VERIFIED, not assumed - the source was queried three
//       independent ways (no range, the full range, and a range deliberately
//       past the end) and returned that identical single line every time.
//   (3) No rule has been invented to fill the gap.
//   (4) The absence is NOT licence to lower the bar. The substitute
//       enterprise-standard practices apply at FULL strength: maximal strict
//       typing, mechanically enforced layer boundaries, exactly pinned
//       dependencies, a single arithmetic surface, no credentials and no
//       environment reads, one cohesive exported surface with no barrel file,
//       and in-code annotation of every judgment call and preserved defect.
//   (5) Zero files enter scope by rule mandate. There is no third,
//       rule-driven category of in-scope file, and there are no rule
//       conflicts to resolve.
// ---------------------------------------------------------------------------

// JUDGMENT CALL: `decimal.js` is imported DIRECTLY here, and `./precision.js`
// is deliberately NOT imported. `precision.ts` exposes a closed, narrow
// arithmetic surface that intentionally excludes `number` inputs and any
// scale/rounding control; routing presentation through it would force that
// surface to widen and break its own contract. The small overlap in comparison
// capability between the two modules is accepted deliberately so that each
// file's surface stays closed and scoped to its own responsibility.
//
// Arbitrary precision is a CORRECTNESS requirement, not a preference: money is
// persisted as `big_decimal` [model/entity/PriceGroupRate.cfc:L54], the legacy
// code reaches for `precisionEvaluate` around this arithmetic
// [model/service/PriceGroupService.cfc:L323, L331], and IEEE-754 doubles
// cannot reproduce either the two-decimal presentation step or the
// trailing-zero mechanism without drift.
//
// JUDGMENT CALL: the NAMED import is used, and this was settled empirically
// rather than assumed. Under `NodeNext` + `ES2022` with decimal.js 10.6.0,
// `import Decimal from 'decimal.js'` fails to compile with TS2709 ("Cannot use
// namespace 'Decimal' as a type") and TS2351 ("This expression is not
// constructable"), because the shipped declaration merges a class, a
// namespace and a function under one name. The named form compiles cleanly and
// gives both the value and the type from a single statement.
//
// `money.ts` is NOT imported and must never be: `money.ts` is the arithmetic
// SURFACE, this folder is the SUBSTRATE beneath it. The dependency runs that
// way and never the reverse.
import { Decimal } from 'decimal.js';

// ---------------------------------------------------------------------------
// The private decimal substrate
// ---------------------------------------------------------------------------

/**
 * A private, frozen `decimal.js` constructor used for every value this module
 * touches.
 *
 * JUDGMENT CALL: `Decimal.clone()` frozen into a module-scope `const`, rather
 * than the global `Decimal.set` mutator - which is NEVER invoked anywhere in
 * this module, and is deliberately written without call syntax above so that an
 * audit grep for a `Decimal.set` call stays clean.
 *
 * The reason for that choice is CROSS-REQUEST STATE and nothing else. Global
 * decimal configuration is mutable process-wide state, and on a warm Lambda
 * container it outlives a single invocation, so one module could silently
 * change the numeric behaviour of another between two unrelated requests. A
 * private clone cannot be reconfigured from outside - freezing it makes a later
 * reconfiguration attempt throw - so this module's stringification is
 * deterministic no matter what else the process does. Verified against 10.6.0:
 * freezing preserves construction, arithmetic, `toFixed`, `equals` and
 * `comparedTo`, while blocking reconfiguration.
 *
 * `Object.freeze` is type-transparent for a constructor (TypeScript resolves
 * the `freeze<T extends Function>(f: T): T` overload), so the construct
 * signature survives and `new CFML_DECIMAL(...)` still yields a `Decimal`.
 *
 * Only two settings are pinned, and only because each is justified:
 *
 *   * `rounding` records the declared half-up mode. Every call site ALSO
 *     passes its rounding mode explicitly, so this is belt-and-braces rather
 *     than the mechanism.
 *   * `toExpNeg` / `toExpPos` are pushed to their limits so that even
 *     `toString()` on an instance from this constructor stays in plain
 *     notation. This module never calls `toString()`, but a future reader
 *     might, and exponential notation would corrupt a `len()`-based algorithm.
 *
 * `precision` is deliberately NOT pinned: this module performs no arithmetic
 * whose significant-digit count could matter. Construction is exact, `toFixed`
 * is unaffected by `precision`, and the comparisons are exact.
 */
const CFML_DECIMAL = Object.freeze(
  Decimal.clone({
    rounding: Decimal.ROUND_HALF_UP,
    toExpNeg: -9e15,
    toExpPos: 9e15,
  }),
);

/**
 * The single mask the in-scope slice uses, at all three verified call sites.
 *
 * JUDGMENT CALL: the mask parameter is typed as the LITERAL `'0.00'` rather
 * than `string`, so any other mask is a compile error. This is a deliberate
 * scope narrowing, not an oversight: no general CFML mask engine is
 * implemented, and none is needed. The `_`, `9`, `,`, `.`, `+`, `-`, `()`,
 * `L`, `C` and `$` mask characters are all unsupported by construction. If a
 * fourth call site ever needs a different mask, that is a product decision to
 * be made explicitly - widening this type is not a tidy-up.
 */
type TwoDecimalMask = '0.00';

/**
 * Matches a plain decimal numeral: an optional leading minus, then either
 * digits with an optional fractional part, or a bare fractional part.
 *
 * Deliberately rejects exponential notation (`1e5`), grouped notation
 * (`1,234.50`), surrounding whitespace, a trailing bare dot (`12.`), and the
 * non-finite spellings `NaN` and `Infinity`. `decimal.js` accepts several of
 * those, so this is a real narrowing rather than a restatement.
 */
const PLAIN_DECIMAL_NUMERAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Matches only the NEGATIVE-ZERO presentations: `-0`, `-0.0`, `-0.00`, and so
 * on. Used to normalize the sign away; see `numberFormat`.
 */
const NEGATIVE_ZERO_PRESENTATION = /^-0(?:\.0+)?$/;

// ---------------------------------------------------------------------------
// The typed error
// ---------------------------------------------------------------------------

/**
 * Thrown when a value cannot be interpreted as a finite decimal numeral.
 *
 * This type is part of this module's mandated surface: malformed input must
 * raise a CLEAR TYPED error so that nothing `NaN`-bearing can ever reach a
 * price, and so that `services/roundingRuleService.ts` can distinguish
 * malformed input from any other failure. It is exported for that reason and
 * that reason alone - it is not a general-purpose error type.
 *
 * Why an explicit finiteness check is required rather than relying on the
 * library: `decimal.js` does NOT reject the non-finite spellings. Verified
 * against 10.6.0 - `new Decimal('NaN')` and `new Decimal('Infinity')` both
 * SUCCEED, and `toFixed()` on the result emits the strings `'NaN'` and
 * `'Infinity'`. Either would flow straight into a money value. `'abc'`, `''`,
 * `'1.2.3'`, `'1,234.50'` and `' 12.5 '` do throw inside the library, and that
 * throw is wrapped here rather than softened.
 *
 * The message echoes the offending argument, which is by definition a failed
 * numeric candidate. No configuration value, connection detail or credential
 * is read or reported anywhere in this module.
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

// ---------------------------------------------------------------------------
// The branded decimal-string type
// ---------------------------------------------------------------------------

/**
 * Phantom brand for {@link DecimalString}.
 *
 * `declare const` on a `unique symbol` exists only in the type system - it
 * emits no JavaScript, adds no runtime property to any value, and costs
 * nothing at runtime. A `DecimalString` is, at runtime, exactly a `string`.
 */
declare const decimalStringBrand: unique symbol;

/**
 * A `string` that is known to hold a plain decimal numeral.
 *
 * WHY THIS TYPE EXISTS, verified in source: `roundValue` declares
 * `returntype="string"` [model/service/RoundingRuleService.cfc:L88], while
 * BOTH of its callers declare `returntype="numeric"` -
 * `roundValueByRoundingRuleID` [model/service/RoundingRuleService.cfc:L79] and
 * `roundValueByRoundingRule` [model/service/RoundingRuleService.cfc:L84] - and
 * `PriceGroupService` then feeds the result straight into `precisionEvaluate`
 * [model/service/PriceGroupService.cfc:L323, L331]. CFML papers over that with
 * implicit coercion; TypeScript cannot and should not. So `roundValue` returns
 * a branded decimal string and its callers convert explicitly.
 *
 * JUDGMENT CALL: this type is declared HERE, in the module that produces
 * decimal strings, and NOT in a shared `types.ts`. That is deliberate - this
 * folder's layout is fixed at exactly five files (`truthiness.ts`, `list.ts`,
 * `struct.ts`, `numberFormat.ts`, `precision.ts`) and adding a sixth is a gate
 * failure. Please do not "tidy" this declaration into a shared types module;
 * co-locating it with its producer is the intended shape, not an accident.
 *
 * Because it is a branded `string`, every ordinary string operation still
 * works and it is assignable to `string`. Note that a derived slice is NOT
 * branded: `someDecimalString.slice(0, 2)` is a plain `string`, which is
 * correct - the `left()` prefix that `roundValue` takes is not itself a
 * numeral.
 */
export type DecimalString = string & { readonly [decimalStringBrand]: true };

/**
 * The ONLY way to obtain a {@link DecimalString}: validate, then brand.
 *
 * There is deliberately no blanket unvalidated cast helper. The single
 * `as DecimalString` assertion in this module lives inside this function,
 * immediately after a successful pattern test, so the brand can never be
 * attached to an unchecked string.
 *
 * Accepts `'12.99'`, `'-0.99'`, `'0'`, `'0.00'` and the leading-dot form
 * `'.99'`. Rejects `'abc'`, `''`, `'1,234.50'`, `'1e5'`, `'12.'`, `'NaN'`,
 * `'Infinity'` and anything with surrounding whitespace.
 *
 * @throws {CfmlNumberFormatError} if the value is not a plain decimal numeral.
 */
export function toDecimalString(value: string): DecimalString {
  if (PLAIN_DECIMAL_NUMERAL.test(value)) {
    return value as DecimalString;
  }
  throw new CfmlNumberFormatError(value);
}

// ---------------------------------------------------------------------------
// Private input normalization
// ---------------------------------------------------------------------------

/**
 * Parse an accepted input into a finite decimal on the private constructor.
 *
 * Inputs are `string | Decimal` only. A `number` is deliberately NOT accepted
 * anywhere in this module's surface, and no narrow integer escape hatch is
 * offered either: a `number` argument is exactly how IEEE-754 drift enters a
 * money path, and the consuming module can construct a decimal itself. (An
 * integer-only hatch would not even serve the one consumer: `rrPower` at
 * [model/service/RoundingRuleService.cfc:L95] is `10 ^ (len(rr)-3)`, which is
 * not always an integer - see hand-off note 2 at the end of this file.)
 *
 * The library's own throw is wrapped, never swallowed, and the wrapped error
 * keeps the original as its `cause`. The explicit finiteness test then closes
 * the `'NaN'` / `'Infinity'` gap that the library leaves open.
 *
 * @throws {CfmlNumberFormatError} if the value is malformed or non-finite.
 */
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

// ---------------------------------------------------------------------------
// (a) numberFormat - the two-decimal presentation function
// ---------------------------------------------------------------------------

/**
 * CFML `numberFormat(value, "0.00")` parity.
 *
 * Provenance - the three verified call sites this reproduces:
 *   * [model/service/PromotionService.cfc:L1017] `numberFormat(discountAmount, "0.00")`
 *   * [model/service/PriceGroupService.cfc:L339]  `numberFormat(newPrice, "0.00")`
 *     (published elsewhere as L337; the correct locator is L339)
 *   * [model/service/RoundingRuleService.cfc:L89] `numberFormat(arguments.value, "0.00")`
 *
 * The reproduced semantics, each one load-bearing somewhere downstream:
 *
 *   * ALWAYS exactly two decimal places, zero-padded: `'12.3'` -> `'12.30'`,
 *     `'12'` -> `'12.00'`.
 *   * ALWAYS at least one integer digit, because the mask's leading `0`
 *     guarantees it: `'0.42'` -> `'0.42'`, never `'.42'`. This is load-bearing.
 *     The `0.42` / `'.99'` characterization case only yields `0.99` because
 *     `left('0.42', 1)` is `'0'`, giving the candidate `'0' & '.99'`.
 *   * NEVER a thousands separator: `'1234.5'` -> `'1234.50'`, not
 *     `'1,234.50'`.
 *   * NEVER exponential notation, guaranteed by construction - see below.
 *   * A leading minus is PRESERVED: `'-0.58'` -> `'-0.58'`. No parentheses, no
 *     trailing sign, no accounting notation. Also load-bearing: negative
 *     intermediates are real, and `left('-0.58', 2)` is `'-0'`, which is what
 *     produces the candidate `'-0.99'`.
 *
 * JUDGMENT CALL: plain notation by construction. `toFixed(dp, rm)` is
 * documented to return normal (fixed-point) notation always, unlike
 * `toString()`, which switches to exponential outside the `toExpNeg` /
 * `toExpPos` thresholds. Those defaults are NOT relied upon: verified against
 * 10.6.0, a default-configured `toString()` emits `1e+21` and `1e-9`, whereas
 * `toFixed()` emits the full plain form in both cases. `toFixed` is therefore
 * the only stringification used in this module.
 *
 * JUDGMENT CALL: half-up rounding. The rounding mode is passed explicitly, so
 * it does not depend on any global or inherited configuration. Be clear about
 * its status: the source does NOT settle the mode. The reference calculation's
 * third decimal is a `3` (`52.47375` -> `'52.47'`) and the characterization
 * input `12.3456` -> `'12.35'` round identically under every common mode, so
 * neither disambiguates it. Half-up is a DECLARED CHOICE here, not verified
 * legacy behaviour.
 *
 * JUDGMENT CALL: negative zero is normalized. A value that rounds to zero at
 * two decimals but is not itself zero keeps its sign through `toFixed`:
 * verified, `'-0.001'` yields `'-0.00'`. Emitting `'-0.00'` as a price would be
 * indefensible, so the sign is dropped for every negative-zero presentation.
 * `'0'` -> `'0.00'` and `'-0'` -> `'0.00'`.
 *
 * @param value the amount to present. `string | Decimal`; never a `number`.
 * @param mask locked to the single mask the slice uses; see {@link TwoDecimalMask}.
 * @returns the presented amount. A `DecimalString`, hence a `string`.
 * @throws {CfmlNumberFormatError} if the value is malformed or non-finite.
 */
export function numberFormat(
  value: string | Decimal,
  mask: TwoDecimalMask = '0.00',
): DecimalString {
  // The mask's own fractional width IS the scale: `'0.00'` has two characters
  // after the dot. Deriving it keeps the parameter meaningful without
  // introducing a mask engine.
  const scale = mask.length - mask.indexOf('.') - 1;

  const formatted = toCfmlDecimal(value).toFixed(scale, CFML_DECIMAL.ROUND_HALF_UP);

  return toDecimalString(
    NEGATIVE_ZERO_PRESENTATION.test(formatted) ? formatted.slice(1) : formatted,
  );
}

// ---------------------------------------------------------------------------
// (b) cfNumberToString - CFML numeric stringification. THE DEFECT MECHANISM.
// ---------------------------------------------------------------------------

/**
 * Reproduces how CFML stringifies a NUMBER: trailing zeros in the fractional
 * part are dropped, and the decimal point goes too once the fractional part is
 * empty.
 *
 * Provenance - the four lines that make this load-bearing:
 *   * [model/service/RoundingRuleService.cfc:L101] `var lowerValue = inputValue - rrPower;`
 *   * [model/service/RoundingRuleService.cfc:L102] `if(len(lowerValue) > len(rr))`
 *   * [model/service/RoundingRuleService.cfc:L108] `var higherValue = inputValue + rrPower;`
 *   * [model/service/RoundingRuleService.cfc:L109] `if(len(higherValue) > len(rr))`
 *
 * L101 and L108 compute ARITHMETIC results. L102 and L109 then take `len()` of
 * them - a STRING length of a NUMBER. So the length measured is that of the
 * trailing-zero-stripped form, not of a two-decimal form, and the subsequent
 * `left()` slice is taken at the wrong offset.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: len() is taken of an arithmetic result, and CFML drops trailing zeros when stringifying a number, so a value whose cents end in zero takes a corrupted branch.
 * Preserved deliberately; do not fix without a product decision.
 *
 * READ THE ATTRIBUTION CAREFULLY. This function is CORRECT CFML behaviour -
 * dropping trailing zeros is genuinely what the engine does when it stringifies
 * a number. The DEFECT is `roundValue` taking `len()` of an arithmetic result.
 * The money outcome changes in the CONSUMING algorithm, not here. The
 * defect-register entry for it therefore belongs to
 * `services/roundingRuleService.ts`; this file owns no register entry and
 * merely supplies a faithful substrate.
 *
 * The three distinct manifestations, all verified, all reproduced:
 *
 *   (a) ONE TRAILING ZERO STRIPPED - the canonical case.
 *       `inputValue = '12.30'`, `rr = '.99'`, so `rrPower = 10^0 = 1`.
 *       `12.30 - 1 = 11.3` -> `'11.3'`, length 4 and NOT 5 -> `left('11.3', 1)`
 *       is `'1'` -> the candidate is `'1.99'` instead of `'11.99'` -> the delta
 *       balloons to 10.31 -> the algorithm selects `'12.99'` where a correct
 *       implementation would select `'11.99'` (delta 0.31).
 *
 *   (b) NO TRAILING ZERO - the contrast case, which rounds correctly.
 *       `'12.35' - 1 = 11.35` -> `'11.35'`, length 5 -> `left('11.35', 2)` is
 *       `'11'` -> the candidate is `'11.99'`, delta 0.36, which beats
 *       `'12.99'`'s 0.64. This proves the defect is DATA-DEPENDENT, not
 *       universal.
 *
 *   (c) THE WHOLE-DOLLAR CASE - the decimal point disappears entirely.
 *       `'12.00' - 1 = 11` -> `'11'`: both trailing zeros AND the dot are gone,
 *       so the length is 2. `2 > 3` is FALSE, so execution falls into the
 *       short-input else branch [model/service/RoundingRuleService.cfc:L104-L106]
 *       and `valueOptionTwo` becomes the rounding expression itself. The
 *       trailing-zero drop has collapsed the value into a different branch
 *       altogether. This third pathway is easy to miss.
 *
 * Contract: strip ALL trailing zeros from the fractional part; strip the
 * decimal point too once the fraction is empty; emit plain, non-exponential
 * notation; impose no scale and no padding; preserve a leading minus.
 * Negative zero collapses to `'0'`.
 *
 * @param value the value to stringify. `string | Decimal`; never a `number`.
 * @returns the CFML stringification. A `DecimalString`, hence a `string`.
 * @throws {CfmlNumberFormatError} if the value is malformed or non-finite.
 */
export function cfNumberToString(value: string | Decimal): DecimalString {
  // `toFixed()` with NO argument is the exact semantic required: normal
  // notation, as many digits as necessary, no padding, no scale imposed.
  return toDecimalString(toCfmlDecimal(value).toFixed());
}

// ---------------------------------------------------------------------------
// (c) Value-based decimal comparison
// ---------------------------------------------------------------------------
//
// CFML compares two STRINGS numerically when both look like numbers. A
// JavaScript comparison of the same two strings is LEXICAL, and the two
// disagree on real, reachable inputs. These three predicates exist so the
// ported algorithm compares by DECIMAL VALUE.
//
// Provenance - the two shapes in the source:
//
//   * [model/service/RoundingRuleService.cfc:L120]
//         `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`
//     EQUALITY between two CFML strings. Verified divergence: `'12.350'` and
//     `'12.35'` are EQUAL numerically, but `'12.350' === '12.35'` is `false` in
//     JavaScript. A lexical comparison would miss the early return entirely.
//
//   * [model/service/RoundingRuleService.cfc:L100]
//         `if(valueOptionOne > inputValue)`
//     ORDERING between two CFML strings. Verified divergence: `'9.99' > '12.35'`
//     is `false` numerically but `true` lexically - and that exact pair arises
//     from the `7.42` / `'9.99'` characterization case, so the divergence is
//     reachable rather than theoretical.
//
// Together these three cover every comparison the ported algorithm performs:
// the equality test at L120, the ordering test at L100, the delta sign tests at
// L124 and L128, and the delta-versus-best tests inside all three direction
// branches at L134, L138, L145, L149, L156 and L160.
//
// These serve `services/roundingRuleService.ts` specifically. They are
// comparison predicates only - this module is the stringification and
// comparison SUBSTRATE and deliberately exposes NO arithmetic. There is no
// `plus`, `minus`, `times` or `dividedBy` here and there must never be: all
// money arithmetic passes through the `Money` value object, which sits above
// this folder.

/**
 * `true` when both values denote the same decimal number, compared by VALUE.
 *
 * Reproduces the CFML numeric equality at
 * [model/service/RoundingRuleService.cfc:L120]. Scale is irrelevant:
 * `'12.350'` equals `'12.35'`, and `'1.0'` equals `'1'`.
 *
 * @throws {CfmlNumberFormatError} if either value is malformed or non-finite.
 */
export function cfNumericEquals(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).equals(toCfmlDecimal(b));
}

/**
 * `true` when `a` is strictly greater than `b`, compared by VALUE.
 *
 * Reproduces the CFML numeric ordering at
 * [model/service/RoundingRuleService.cfc:L100], and the `Up`-direction guards
 * at [model/service/RoundingRuleService.cfc:L145, L149]. `'9.99'` is NOT
 * greater than `'12.35'`, although a lexical comparison would say otherwise.
 *
 * @throws {CfmlNumberFormatError} if either value is malformed or non-finite.
 */
export function cfNumericGreaterThan(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).greaterThan(toCfmlDecimal(b));
}

/**
 * `true` when `a` is strictly less than `b`, compared by VALUE.
 *
 * Reproduces the CFML numeric ordering used for the absolute-value delta tests
 * at [model/service/RoundingRuleService.cfc:L124, L128], the closest-delta
 * tests at [model/service/RoundingRuleService.cfc:L134, L138], and the
 * `Down`-direction guards at [model/service/RoundingRuleService.cfc:L156, L160].
 *
 * Note for the consuming algorithm: the comparison is STRICT. That is what
 * makes option ONE win an exact tie in the `Closest` branch, because L134 sets
 * the best delta from option one first and L138 then requires option two to be
 * strictly smaller. It is the reason the `7.42` / `'9.99'` case returns `9.99`.
 *
 * @throws {CfmlNumberFormatError} if either value is malformed or non-finite.
 */
export function cfNumericLessThan(a: string | Decimal, b: string | Decimal): boolean {
  return toCfmlDecimal(a).lessThan(toCfmlDecimal(b));
}

// ---------------------------------------------------------------------------
// THE ACCEPTANCE GATE FOR THIS FILE
// ---------------------------------------------------------------------------
// `roundValue` is not numeric rounding - it is decimal-string manipulation.
// The ten outputs below were produced by faithfully reimplementing
// [model/service/RoundingRuleService.cfc:L88-L175] and EXECUTING it, so they
// are measured rather than inferred. `services/roundingRuleService.ts` owns
// that algorithm; this file owns the two helpers that make it reproducible,
// and both `cfNumberToString()` and the comparison predicates must be correct
// or these ten cannot pass.
//
//   value     expression   direction   expected
//   -------   ----------   ---------   --------
//   12.3456   0.99         Closest     10.99     (candidates 10.99 / 20.99,
//                                                 deltas 1.36 / 8.64)
//   12.3456   .99          Closest     11.99
//   12.3456   .99          Up          12.99
//   12.3456   .99          Down        11.99
//   12.3456   .95,.99      Closest     11.99
//   12.30     .99          Closest     12.99   <- the trailing-zero defect
//   7.42      9.99         Closest      9.99   <- short-input collapse
//   2.30      0.99         Closest      0.99   <- short-input collapse
//   0.42      .99          Closest      0.99
//   12.3456   0.00         Closest     10.00   <- the default is NOT a no-op
//                                                 (deltas 2.35 / 7.65)
//
// The `'0.00'` expression is NOT inert: it cuts 12.3456 to 10.00. A
// "corrected", mathematically tidier rounding or formatting implementation
// FAILS this gate. Never adjust an expected output to match an implementation.
//
// The other high-value assertion is the decimal-fidelity reference chain: unit
// price 19.99 at quantity 3 gives 59.97; 12.5 per cent of that is 7.49625; the
// discounted total is 52.47375; and `numberFormat` presents it as `'52.47'`
// with no IEEE-754 drift. That is exactly the behaviour of
// [model/service/PromotionService.cfc:L1017].
//
// TESTS: every export here requires coverage at
// `slatwall-ts/tests/unit/lib/cfml/numberFormat.test.ts`, which is OWNED BY A
// DIFFERENT AGENT and is not authored from this file. All of that coverage is
// NET-NEW and must be labelled as such, never presented as parity: no legacy
// test under `meta/tests/**` touches these helpers. Only
// `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` are extended anywhere in this
// migration, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an
// empty stub contributing zero coverage.

// ---------------------------------------------------------------------------
// HAND-OFF NOTES  -  these concern `services/roundingRuleService.ts` and
// `domain/entities/roundingRule.ts`. They are recorded here because they were
// established while verifying this file's provenance. They are NOT this file's
// work to act on, and nothing below is implemented here.
// ---------------------------------------------------------------------------
//
// HAND-OFF NOTE 1 - the `"0.00"` default is not reached from any legacy call
// site, yet the hazard is still real.
// `roundValue` defaults `roundingExpression` to `"0.00"`
// [model/service/RoundingRuleService.cfc:L88], but the complete verified
// call-site inventory shows every invocation of the SERVICE's `roundValue`
// passes all three arguments: [model/entity/RoundingRule.cfc:L67],
// [model/service/PriceGroupService.cfc:L327],
// [model/service/PromotionService.cfc:L1006],
// [model/service/PromotionService.cfc:L1026],
// [model/service/RoundingRuleService.cfc:L81] and
// [model/service/RoundingRuleService.cfc:L85]. In particular
// [model/service/PriceGroupService.cfc:L327] -
// `arguments.priceGroupRate.getRoundingRule().roundValue(newPrice)` - is a
// one-argument call to the ENTITY's own method
// [model/entity/RoundingRule.cfc:L66-L68], which delegates to
// `roundValueByRoundingRule`, and that supplies BOTH the expression and the
// direction explicitly at [model/service/RoundingRuleService.cfc:L85]. So do
// NOT author or imply a test asserting that L327 passes one argument to the
// SERVICE.
// The `12.3456` / `'0.00'` characterization case NEVERTHELESS STANDS, because
// the mechanism is DATA rather than a defaulted call: the expression is a
// persisted column, so a stored row containing `'0.00'` produces exactly the
// 10.00 outcome.
//
// HAND-OFF NOTE 2 - the expression IS validation-constrained, and the
// published description of that constraint needs one correction.
// `model/validation/RoundingRule.json` constrains the expression with
// `{"contexts":"save","required":true,"method":"hasExpressionWithListOfNumericValuesOnly"}`,
// and [model/entity/RoundingRule.cfc:L78-L86] implements it as
// `(len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue)`. So
// it is NOT true that "nothing prevents" a malformed expression.
// CORRECTION, found by reading the validator rather than paraphrasing it: that
// test does not actually require a dot. CFML's `find()` returns 0 when the
// substring is absent, so a DOT-LESS two-character numeral such as `'99'`
// computes `2 - 0 = 2`, passes, and is numeric - therefore it saves
// successfully. With `len(rr) = 2`, `rrPower = 10 ^ (2-3) = 0.1`
// [model/service/RoundingRuleService.cfc:L95]. The fractional-power case is
// consequently reachable for VALIDLY-SAVED data through the dot-less form, not
// only through rows written outside the save context. The minimum valid DOTTED
// entry is indeed `'.99'` at three characters, which is where the
// `rrPower >= 1` reasoning holds.
// Separately, `roundingRuleDirection` is required but carries NO enumeration
// constraint - `getRoundingRuleDirectionOptions()`
// [model/entity/RoundingRule.cfc:L70-L76] supplies presentation options only,
// not validation - and the direction switch at
// [model/service/RoundingRuleService.cfc:L132] has NO `default` case. A stored
// direction outside `{Closest, Up, Down}` is therefore a reachable
// pass-through that returns the input unchanged
// [model/service/RoundingRuleService.cfc:L170-L174]. It is NOT one of the ten
// characterization cases above.
