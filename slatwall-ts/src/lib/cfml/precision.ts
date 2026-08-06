// ---------------------------------------------------------------------------
// slatwall-ts - CFML `precisionEvaluate()` parity: precise decimal arithmetic
//
// The narrow typed replacement for CFML's `precisionEvaluate()` in the port of the Slatwall 3.1.39
// catalog + promotions/pricing slice. The legacy function performs arbitrary-precision arithmetic
// and so sidesteps the engine's default floating-point behaviour; it guards most - but not all - of
// the money arithmetic in the slice. This module replaces it with explicit typed decimal
// operations, so that no floating-point arithmetic touches currency anywhere in the target.
//
// SUBSTRATE, NOT SURFACE. `src/domain/valueObjects/money.ts` is the sole arithmetic SURFACE: all
// money arithmetic passes through `Money`, and `Money` reaches decimal arithmetic through the
// primitives below. Nothing here imports `money.ts` - reversing the dependency would be both a
// cycle and an inversion of the layering.
//
// Arbitrary precision is a schema-level fact, not a preference: legacy money is persisted in
// `big_decimal` columns. [model/entity/PriceGroupRate.cfc:L54] and
// [model/entity/PromotionApplied.cfc:L53] declare, respectively:
//   `property name="amount" ormType="big_decimal" hb_formatType="custom";`
//   `property name="discountAmount" ormtype="big_decimal";`
//
// ABSOLUTE CONSTRAINT 1 - THE PERMITTED `decimal.js` IMPORTER SET, EXACTLY TWO
//
// This module and `src/lib/cfml/numberFormat.ts` are the only two modules in the subtree permitted
// to import `decimal.js` directly, and the only two that do: this file owns ARITHMETIC, that one
// owns STRINGIFICATION. `src/domain/valueObjects/money.ts` IS NOT ONE OF THEM - it imports neither
// `Decimal` nor `decimal.js`, composes these two `lib/cfml` substrates, and holds its own state as
// a plain decimal STRING. Every other module reaches decimal arithmetic through `Money` and nothing
// else. Exactly one third-party import follows and no first-party import at all.
//
// ABSOLUTE CONSTRAINT 2 - NO `Decimal` RE-EXPORT, AND NO `number` FOR MONEY
//
// `Decimal` is never re-exported. `PreciseValue` exports the TYPE, which annotation needs; the
// CONSTRUCTOR and every static on it - configuration mutator and cloning entry point included -
// stay unreachable, because re-exporting it would let a consumer build a decimal under a different
// configuration, which is a second arithmetic surface by another name. `PreciseInput` admits a
// decimal STRING or a `PreciseValue`, and `number` is deliberately NOT a member: an IEEE-754 double
// is precisely how drift enters a money path, so a caller holding a `number` for a price, an amount
// or a discount will not compile against this module. The one narrow integer entry point is
// `fromInteger`.
//
// ABSOLUTE CONSTRAINT 3 - THERE IS NO EXPRESSION INTERPRETER HERE
//
// CFML's `precisionEvaluate()` accepts a STRING of CFML source and executes it. That mechanism is
// deliberately NOT reproduced: no dynamic code execution of any kind, and no expression parser,
// lexical scanner or operator-ordering algorithm. A runtime string executor reachable from request
// data is a remote-code-execution surface and these handlers sit behind API Gateway; a dynamic
// executor also yields an untyped result that the strict profile cannot express without an escape
// hatch the type gate forbids. The eleven legacy expression strings were read during planning and
// re-expressed as the typed calls below, each annotated with the locators it descends from.
//
// THE ELEVEN VERIFIED IN-SCOPE `precisionEvaluate` SITES
//
// Repo-wide there are 104 `precisionEvaluate` occurrences across 18 files; exactly eleven are in
// scope. [model/service/RoundingRuleService.cfc] contains ZERO of them, although its arithmetic is
// an antecedent for `add`, `subtract` and `absolute`.
//
//   [model/service/PromotionService.cfc:L150]   (a x b) - (c x b)
//   [model/service/PromotionService.cfc:L252]   a - (b - c)
//   [model/service/PromotionService.cfc:L299]   a / b        (unguarded divisor)
//   [model/service/PromotionService.cfc:L486]   (a / b) x (b - c)
//   [model/service/PromotionService.cfc:L990]   a x b
//   [model/service/PromotionService.cfc:L995]   a x (b / 100)
//   [model/service/PromotionService.cfc:L1001]  (a - b) x c
//   [model/service/PromotionService.cfc:L1006]  a - b
//   [model/service/PromotionService.cfc:L1007]  a - b
//   [model/service/PriceGroupService.cfc:L323]  a - (a x (b / 100))
//   [model/service/PriceGroupService.cfc:L331]  a - b
//
// LOCATOR CORRECTIONS. Three published citations were wrong and one site was omitted; each was
// settled by reading the source.
//   * L252 was published as L248, a comment; L249 is the `getDiscountAmount(...)` call.
//   * [model/service/PriceGroupService.cfc:L323] was published as L322, which is
//     literally `case "percentageOff" :`.
//   * [model/service/PriceGroupService.cfc:L331] was published as L328, the closing brace
//     of the `if(!isNull(...getRoundingRule()))` block spanning L326-L328; the call is on
//     L331, inside `case "amountOff"`.
//   * [model/service/PromotionService.cfc:L1006] was omitted from the published list
//     altogether; it is present and confirmed, the subtraction feeding
//     `roundValueByRoundingRule(...)`.
//
// EXPLICITLY NOT OWNED BY THIS FILE
//   * The `amountOff` branch at [model/service/PromotionService.cfc:L998] reads
//     `discountAmountPreRounding = reward.getAmount() * quantity;` - raw floating-point
//     multiplication with no `precisionEvaluate`. Routing all arithmetic through `Money`
//     closes that gap, a deliberate divergence owned by `services`.
//   * The unguarded divisor at [model/service/PromotionService.cfc:L299]: `divide` throws
//     on a zero divisor, but whether the CALL SITE needs a guard belongs to
//     `src/services/promotion/rewardUsageLedger.ts`. See `divide`.
//   * `numberFormat(discountAmount, "0.00")` [model/service/PromotionService.cfc:L1017]
//     and `numberFormat(newPrice, "0.00")` [model/service/PriceGroupService.cfc:L339] are
//     presentation and belong to `src/lib/cfml/numberFormat.ts`, together with CFML's
//     trailing-zero stringification. See `toDecimalString`.
//   * The migration's carried-forward legacy TODOs - five of them, at
//     [model/service/PromotionService.cfc:L543], [model/dao/ProductDAO.cfc:L64],
//     [model/dao/SkuDAO.cfc:L177], [model/service/CurrencyService.cfc:L81] and
//     [model/entity/ProductType.cfc:L93] - sit in the modules that own them, as does the
//     empty `g:google_product_category` element, which is a preserved legacy GAP rather
//     than a legacy TODO: the template line carries no comment at all.
// ---------------------------------------------------------------------------

// The only import in this module, of any kind.
//
// JUDGMENT CALL: the NAMED import form, settled by compiling both. With `moduleResolution` set to
// `NodeNext` and `target` to `ES2022`, `import Decimal from 'decimal.js'` fails with TS2339 and
// TS2709 whether `esModuleInterop` is enabled or not, while `import { Decimal }` type-checks
// cleanly: the package's declarations merge a class and a namespace under one exported name, which
// is what makes both the value `Decimal.clone` and the type `Decimal.Constructor` reachable from a
// single named binding. It is a runtime import, not an `import type`, because decimal values are
// constructed here.
import { Decimal } from 'decimal.js';

// ---------------------------------------------------------------------------
// The configured arithmetic constructors
//
// WHY THERE ARE TWO CONFIGURATIONS BELOW AND NOT ONE
//
// The pinned library rounds the RESULT of `plus`, `minus`, `times` and `dividedBy` to the
// configured number of significant digits, so a single shared configuration forces one number to
// serve two irreconcilable jobs. Addition, subtraction and multiplication are EXACT: their results
// are bounded by the operands - a product has at most the sum of its operands' significant digits -
// so capping them DISCARDS digits that were exactly computable. Measured against the pinned library
// at a shared cap of 20 significant digits:
//   `12345678901.23456789 x 98765432109.87654321` -> `1219326311370217952200`,
//     exactly `1219326311370217952237.4638011112635269`;
//   `100000000000000000000 - 0.000000001` -> `100000000000000000000`,
//     exactly `99999999999999999999.999999999` - the subtrahend VANISHES.
// Division, by contrast, CANNOT terminate in general, since `1/3` has no exact decimal
// representation, so it must stop somewhere, and where it stops has to be a declared decision
// rather than an inherited default. The cap is therefore applied to division ONLY, and the exact
// operations are given headroom they can never reach.
//
// Requesting the library's documented MAXIMUM precision instead was tried and is NOT viable: at 1e9
// significant digits a single `1/3` aborts the Node process outright with a V8 fatal allocation
// error ("Fatal JavaScript invalid size error", crbug.com/1201626), because the library eagerly
// materialises the full quotient. The exact configuration below is therefore large but BOUNDED.
// Recorded so nobody re-tries the maximum.
// ---------------------------------------------------------------------------

/**
 * Significant digits for the operations that are EXACT: add, subtract, multiply, magnitude,
 * comparison, and the render boundary.
 *
 * JUDGMENT CALL: 1000, which is headroom rather than a cap - not a limit this port can reach, so
 * the arithmetic here is exact in practice. The reasoning is arithmetic. The widest operand the
 * schema can hand this module is a MySQL `DECIMAL(65, s)` value, i.e. 65 significant digits; a
 * product carries at most the SUM of its operands' significant digits, so two such operands
 * multiply to at most 130 digits, and the deepest chain in the in-scope slice - the three-factor
 * `price x quantity x (amount / 100)` at [model/service/PromotionService.cfc:L995] - reaches at
 * most 195, as measured. Addition and subtraction cannot exceed the wider operand's digit count by
 * more than the scale difference, bounded by the same 65. 1000 is therefore over five times the
 * reachable worst case, and it is cheap because the library allocates against the digits actually
 * present rather than the configured ceiling. Measured cost: 20,000 realistic money chains
 *   (`19.99 x 3 - 7.49625`) complete in about 34 ms.
 *
 * DO NOT LOWER THIS TO BOUND A QUOTIENT. Division has its own configuration below and does not
 * consult this one.
 */
const EXACT_ARITHMETIC_PRECISION = 1000;

/**
 * Significant digits at which a NON-TERMINATING QUOTIENT is resolved.
 *
 * JUDGMENT CALL: declared explicitly rather than inherited from the library's ambient default, and
 * applied to division ALONE. The legacy engine's internal `precisionEvaluate` scale is not knowable
 * from the source - the legacy runtime was never stood up (AAP 0.10.3) - so the value this port
 * uses must be DECLARED. 20 matches the library's own documented default, so the quotients produced
 * here are unchanged from its out-of-the-box behaviour, and it exceeds anything a currency amount
 * needs while still bounding a quotient that would otherwise never end. The two quotients that pin
 * it, both verified against the pinned library: `1/3` resolves to `0.33333333333333333333` and
 * `2/3` to `0.66666666666666666667`. Changing this constant changes both, so it is a behavioural
 * decision and not a tuning knob.
 */
const DIVISION_PRECISION = 20;

/**
 * Shared configuration for both constructors below - everything except the significant-digit count,
 * which is the one property they differ on.
 *
 * The library copies any UNSPECIFIED property from the parent constructor at clone time, so naming
 * every property is what makes each clone independent of whatever ambient state the parent happens
 * to be in, and spreading one frozen object into both is what guarantees they cannot drift apart on
 * rounding mode, notation thresholds or exponent bounds.
 */
const SHARED_ARITHMETIC_CONFIG = Object.freeze({
  // JUDGMENT CALL: half-up rounding, declared explicitly for the same reason as the precision
  // constants above - the legacy engine's internal rounding mode is not knowable from the source.
  // Half-up is the library's documented default, so declaring it changes nothing, and it is
  // reachable ONLY through division. Rounding to a SCALE is a different concern and belongs to
  // `numberFormat.ts` and to `Money`.
  rounding: Decimal.ROUND_HALF_UP,

  // Exponential-notation thresholds pushed to the representable extremes so that no finite value
  // this module can hold ever renders in exponential form, even through an incidental string
  // conversion. `toDecimalString` guarantees plain notation by construction on its own; these two
  // settings are the second, independent guarantee. The library's defaults would render 1e21 and
  // 1e-9 exponentially; verified that `1e21` renders as `1000000000000000000000`.
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
 * library's global configuration mutator. Mutating global library configuration would persist
 * across unrelated requests on a warm container, and on a money path shared mutable configuration
 * is a correctness hazard; and a second module calling the global mutator could change it
 * underneath this one, whereas a clone cannot be. The one deliberate module-scope-state exception
 * in the whole target is the MySQL connection pool; this module has none.
 *
 * `Object.freeze` here is a mechanical guarantee rather than decoration, verified against the
 * pinned library: the frozen constructor still performs arithmetic normally, and reconfiguring it
 * through its own mutator throws a `TypeError` because this module is strict-mode ESM.
 *
 * The type annotation is deliberately the constructor type and NOT `Readonly<...>`: a mapped type
 * discards construct signatures, and annotating it that way fails with TS2351.
 */
const ExactArithmetic: Decimal.Constructor = Object.freeze(
  Decimal.clone({
    ...SHARED_ARITHMETIC_CONFIG,
    precision: EXACT_ARITHMETIC_PRECISION,
  }),
);

/**
 * The constructor `divide` - and ONLY `divide` - routes through.
 *
 * Held separately, frozen, and configured identically to the exact constructor above apart from its
 * significant-digit count, for the reasons set out in the section banner.
 *
 * WHY DIVISION RE-HOMES ITS OPERANDS RATHER THAN JUST CALLING `dividedBy`. In the pinned library an
 * instance carries its own constructor and an operation is resolved at the LEFT operand's
 * precision, so a value produced by an exact operation is homed on the 1000-digit constructor and
 * dividing it directly would resolve the quotient to 1000 significant digits instead of the
 * declared 20 - measured, `1/3` comes back as a 1002-character string that way. `divide`
 * consequently coerces both operands through `toDivisible`, whose ingress is lossless for the
 * reason documented at `toPrecise`, so the declared division scale is the one that governs the
 * quotient.
 */
const DivisionArithmetic: Decimal.Constructor = Object.freeze(
  Decimal.clone({
    ...SHARED_ARITHMETIC_CONFIG,
    precision: DIVISION_PRECISION,
  }),
);

// --- The value types ---

/**
 * A precise decimal value produced by this module.
 *
 * A TYPE alias only. The constructor behind it is never exported, so no consumer can build one
 * except by calling an operation below. Values are immutable: every operation returns a new value
 * and mutates no operand.
 */
export type PreciseValue = Decimal;

/**
 * What every operation in this module accepts: a decimal STRING, or a value this module previously
 * produced. `number` is deliberately not a member, for the reason given under ABSOLUTE CONSTRAINT 2
 * in the file header; the one narrow integer entry point is `fromInteger`.
 *
 * A string operand is accepted in whatever lexical form the pinned decimal library accepts: plain
 * decimal, signed, leading-point, exponential, and hex, binary or octal literal forms. A malformed
 * string throws (see `toPrecise`), and a syntactically valid but non-finite string such as `'NaN'`
 * is rejected rather than admitted - see `assertFinite`.
 */
export type PreciseInput = string | PreciseValue;

// --- Failure signalling ---

/**
 * Raised when an arithmetic request cannot be honoured without inventing a value: a zero divisor, a
 * non-finite operand, a non-finite result, or a non-integer handed to `fromInteger`.
 *
 * JUDGMENT CALL: this class is deliberately NOT exported. The export surface of this module is a
 * closed set - the value types plus the arithmetic primitives - and widening it is a product
 * decision rather than an implementation detail. The error is still a distinct, identifiable type
 * rather than a bare string: it is an `Error` subclass carrying a stable `name`, so a caller can
 * discriminate on `name === 'PrecisionError'` without this module handing out a constructor.
 * Messages carry no configuration or environment data.
 */
class PrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrecisionError';
  }
}

// --- The input and result boundary ---

/**
 * Rejects any decimal that is not finite.
 *
 * No `NaN` and no infinity may ever escape this module. A `NaN` that flowed into a price would
 * propagate silently through every subsequent operation and surface as a corrupted amount rather
 * than as a failure, so it is turned into a failure at the boundary.
 *
 * This check is load-bearing rather than defensive garnish, and the reason was measured: the
 * constructor ACCEPTS the strings `'NaN'`, `'Infinity'` and `'-Infinity'` and builds non-finite
 * values from them without complaint, and division by zero does NOT throw - it yields infinity,
 * while `0/0` yields `NaN`. Relying on the constructor alone would leave both holes open.
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
 * Two things happen here. First, a malformed numeric string throws: the pinned library raises its
 * own invalid-argument error for input such as `'abc'`, `''`, `'1.2.3'` or `'1,000'`, and that
 * error is deliberately NOT caught and NOT softened, because a malformed amount must fail loudly
 * rather than resolve to zero or to `NaN`.
 *
 * Second, an operand that is already a precise value is re-homed onto the frozen exact constructor.
 * That is not redundant, and it is LOSSLESS: verified against the pinned library in both
 * directions, an 81-significant-digit value re-homed onto the 20-digit constructor still reports 81
 * significant digits, and so does re-homing it back, because the constructor rounds no input - only
 * the results of operations. What re-homing buys is that this module's declared precision and
 * rounding govern every subsequent operation whichever constructor produced the operand; without
 * it, a quotient homed on the division constructor would drag that cap into an exact multiply.
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
 * at the left operand's precision, so a value homed on the exact constructor would resolve a
 * non-terminating quotient to 1000 significant digits rather than to the declared scale. Ingress is
 * lossless, and malformed or non-finite input is rejected, on exactly the same terms as
 * `toPrecise`.
 *
 * BE PRECISE ABOUT WHAT THAT DOES AND DOES NOT PROMISE. It does NOT mean a wide operand survives
 * division unchanged. The library rounds the result of EVERY operation, and `x/1` is an operation,
 * so dividing an 81-significant-digit operand by one returns it resolved to the declared 20 -
 * measured, not assumed. That is pinned by an assertion in the precision suite. What the lossless
 * ingress buys is that the leading digits are CORRECT: a wide operand is resolved, never corrupted,
 * zeroed or turned into `NaN` on the way in.
 */
function toDivisible(input: PreciseInput): PreciseValue {
  return assertFinite(new DivisionArithmetic(input), 'operand');
}

// --- Entering the precise domain from an integer ---

/**
 * The single deliberate `number` entry point in this module.
 *
 * JUDGMENT CALL: one narrow, explicitly named escape hatch is provided, and the need for it is
 * real. The legacy arithmetic divides by the literal `100` at
 * [model/service/PromotionService.cfc:L995] and [model/service/PriceGroupService.cfc:L323], and
 * multiplies by an integer quantity at [model/service/PromotionService.cfc:L990] and
 * [model/service/PromotionService.cfc:L1001]. Quantities are integer counts, and a caller holding
 * one should not have to stringify it to enter the precise domain.
 *
 * It accepts ONLY a safe integer: a non-integer, a non-finite value, or a magnitude beyond exact
 * integer representation is rejected, each being a case where the caller's `number` may already
 * have lost information.
 *
 * MUST NEVER BE USED FOR A PRICE, AN AMOUNT OR A DISCOUNT. Those are decimal quantities; pass them
 * as strings. Where a string literal will do, such as `'100'` for the percentage divisor, prefer
 * the literal.
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

// --- Arithmetic ---
//
// Every operation below is synchronous and pure: it reads its operands, returns a new value, and
// mutates nothing. There is no state to carry, so there is nothing to await.

/**
 * Multiplies two precise operands.
 *
 * Each locator below points at the legacy expression in full; the shape of all eleven in-scope
 * sites is tabulated in the file header.
 *
 * CFML parity [model/service/PromotionService.cfc:L990]: the plain `a x b` of
 *   `arguments.price * arguments.quantity` at the head of the discount calculation.
 * CFML parity [model/service/PromotionService.cfc:L150]: the two products of
 *   `(a x b) - (c x b)`.
 * CFML parity [model/service/PromotionService.cfc:L995]: the product of
 *   `originalAmount * (reward.getAmount()/100)`, composed with `divide` to form
 *   `a x (b / 100)` - note the division by the literal 100 nested inside.
 * CFML parity [model/service/PromotionService.cfc:L1001]: the outer product of
 *   `(a - b) x c`.
 * CFML parity [model/service/PromotionService.cfc:L486]: the outer product of
 *   `(a / b) x (b - c)`, division first.
 * CFML parity [model/service/PriceGroupService.cfc:L323]: the inner `a x (b / 100)` term of
 *   the percentage-off rate.
 */
export function multiply(multiplicand: PreciseInput, multiplier: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(multiplicand).times(toPrecise(multiplier)), 'multiply');
}

/**
 * Subtracts the subtrahend from the minuend.
 *
 * CFML parity [model/service/PromotionService.cfc:L1007]: the discount that
 *   `originalAmount - roundedFinalAmount` implies.
 * CFML parity [model/service/PromotionService.cfc:L1006]: the difference
 *   `originalAmount - discountAmountPreRounding`, handed to `roundValueByRoundingRule`.
 * CFML parity [model/service/PromotionService.cfc:L252]: the nested `a - (b - c)` that
 *   adjusts a discount for a price-group price.
 * CFML parity [model/service/PromotionService.cfc:L150] and
 *   [model/service/PromotionService.cfc:L1001]: the outer subtraction of
 *   `(a x b) - (c x b)`, and the inner `(a - b)` of `(a - b) x c`.
 * CFML parity [model/service/PriceGroupService.cfc:L331]: the amount-off rate
 *   `sku.getPrice() - priceGroupRate.getAmount()`, inside `case "amountOff"`.
 * CFML parity [model/service/PriceGroupService.cfc:L323]: the outer subtraction of
 *   `a - (a x (b / 100))`.
 */
export function subtract(minuend: PreciseInput, subtrahend: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(minuend).minus(toPrecise(subtrahend)), 'subtract');
}

/**
 * Adds two precise operands.
 *
 * Provided for completeness, and stated honestly: NO in-scope `precisionEvaluate` site performs
 * addition. All eleven are multiplication, subtraction or division.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L108]: its in-scope arithmetic
 *   antecedent is the rounding algorithm, which adds without the precision guard -
 *   `var higherValue = inputValue + rrPower;` is the upward candidate in the rounding
 *   search, and its downward counterpart on L101 is served by `subtract`.
 *
 * Offering it keeps `src/services/roundingRuleService.ts` from reaching for floating-point addition
 * on a money value merely because no precise addition existed.
 */
export function add(augend: PreciseInput, addend: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(augend).plus(toPrecise(addend)), 'add');
}

/**
 * Divides the dividend by the divisor.
 *
 * CFML parity [model/service/PromotionService.cfc:L299]: the discount-per-use value
 *   `discountAmount / discountQuantity` that the usage ledger insert-sorts on.
 * CFML parity [model/service/PromotionService.cfc:L995]: the `(reward.getAmount()/100)`
 *   term inside `a x (b / 100)`.
 * CFML parity [model/service/PromotionService.cfc:L486]: the leading division of
 *   `(a / b) x (b - c)`.
 * CFML parity [model/service/PriceGroupService.cfc:L323]: the percentage term of
 *   `a - (a x (b / 100))`.
 *
 * JUDGMENT CALL: a zero divisor throws. The legacy site at
 * [model/service/PromotionService.cfc:L299] applies no zero check to its divisor, and this module
 * reproduces the ARITHMETIC faithfully while refusing to resolve that case silently. Throwing is
 * the faithful outcome rather than a departure: CFML's `precisionEvaluate` raises a
 * division-by-zero error, so a request to divide by zero has always failed rather than produced a
 * number. The pinned decimal library, by contrast, does NOT throw (see `assertFinite`), so the
 * check has to be explicit or a non-finite value would silently enter a price. No guard, no `0`
 * fallback and no `NaN` return is added here; returning `0` would silently invent money. Whether
 * the CALL SITE at L299 needs a guard, and what it should do, belongs to
 * `src/services/promotion/rewardUsageLedger.ts`, which owns that decision.
 *
 * JUDGMENT CALL: a non-terminating quotient is resolved at a declared scale, and division is the
 * only operation here that resolves at all. `1/3` has no exact decimal representation, so division
 * must stop somewhere; it stops at the declared `DIVISION_PRECISION` significant digits with the
 * declared half-up rounding, both carried by the frozen `DivisionArithmetic` constructor. Both
 * operands are re-homed through `toDivisible` precisely so that this scale, and not the exact one,
 * governs the quotient.
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
 *   manual sign flip when the result is negative -
 *   `if(valueOptionOneDelta < 0) { valueOptionOneDelta = valueOptionOneDelta*-1; }` and the
 *   identical pair for `valueOptionTwoDelta`.
 *
 * Provided so that `src/services/roundingRuleService.ts` compares candidate deltas by magnitude
 * without hand-rolling that flip. The negative intermediates are real: the rounding search
 * legitimately produces them.
 */
export function absolute(value: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(value).absoluteValue(), 'absolute');
}

// --- Comparison ---
//
// EVERY comparison below is BY DECIMAL VALUE, never by string. A JavaScript string comparison would
// report `'12.350'` and `'12.35'` as different values, and `'9.99'` as greater than `'12.35'`
// because `'9'` sorts after `'1'`. Both answers are wrong, and both would change money. Comparing
// by decimal value gives `'12.350'` equal to `'12.35'` - verified against the pinned library.

/**
 * Orders two operands: `-1` when the left is smaller, `1` when it is larger, `0` when they are
 * equal in value.
 *
 * CFML parity [model/service/PromotionService.cfc:L148]: the sale-price seeding test
 *   `salePriceDetails.salePrice < orderItem.getSku().getPrice()`.
 * CFML parity [model/service/PromotionService.cfc:L1013]:
 *   `if(discountAmountPreRounding > originalAmount)`, the clamp that stops a discount
 *   exceeding the original amount.
 * CFML parity [model/service/RoundingRuleService.cfc:L120]: an equality test the legacy
 *   engine performs on values it built as STRINGS, which is exactly why comparison here must
 *   be by decimal value.
 *
 * Both operands are coerced through `toPrecise` and are therefore finite, so the comparison cannot
 * yield `NaN` and the `0` branch means equal rather than incomparable. The result is narrowed with
 * explicit branches - no type assertion and no non-null assertion, both forbidden in `src/**`.
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
 *   deciding whether a computed discount is recorded against an order item at all.
 * CFML parity [model/service/PromotionService.cfc:L1013]:
 *   `if(discountAmountPreRounding > originalAmount)`.
 * CFML parity [model/service/RoundingRuleService.cfc:L100]: `if(valueOptionOne > inputValue)`,
 *   which branch of the rounding search runs, with
 *   [model/service/RoundingRuleService.cfc:L145] and
 *   [model/service/RoundingRuleService.cfc:L149] gating the "Up" direction.
 */
export function isGreaterThan(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).greaterThan(toPrecise(right));
}

/**
 * True when the left operand is strictly less than the right.
 *
 * CFML parity [model/service/PromotionService.cfc:L148]:
 *   `salePriceDetails.salePrice < orderItem.getSku().getPrice()`.
 * CFML parity [model/service/RoundingRuleService.cfc:L124] and
 *   [model/service/RoundingRuleService.cfc:L128]: the `< 0` tests deciding whether a
 *   candidate delta needs its sign flipped; see `absolute`.
 * CFML parity [model/service/RoundingRuleService.cfc:L134],
 *   [model/service/RoundingRuleService.cfc:L138],
 *   [model/service/RoundingRuleService.cfc:L156] and
 *   [model/service/RoundingRuleService.cfc:L160]: the tests driving the "Closest" and
 *   "Down" directions.
 */
export function isLessThan(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).lessThan(toPrecise(right));
}

/**
 * True when both operands are equal IN VALUE.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L120]:
 *   `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`. This is the
 *   clearest illustration of the banner above: the legacy rounding algorithm assembles its
 *   candidates by slicing and concatenating decimal STRINGS, then compares them with `==`,
 *   which CFML resolves numerically. Here `'1.0'` and `'1'` are equal, as they must be.
 */
export function equals(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).equals(toPrecise(right));
}

/**
 * True when the operand is zero, whatever scale it was written at: `'0'`, `'0.00'`, `'-0'` and
 * `'0e5'` are all zero.
 *
 * Needed by callers checking a divisor before calling `divide`, which uses exactly this test in its
 * own guard, and by callers deciding whether a computed discount is worth recording, per the gate
 * at [model/service/PromotionService.cfc:L257].
 */
export function isZero(value: PreciseInput): boolean {
  return toPrecise(value).isZero();
}

// --- Leaving the precise domain ---

/**
 * Renders a precise value as a plain decimal string.
 *
 * The boundary at which a precise value leaves this module - for persistence into a `big_decimal`
 * column, or for a presentation step that applies a mask.
 *
 * JUDGMENT CALL: plain notation is guaranteed by construction. The fixed-point renderer is called
 * with NO argument, which the pinned library documents as returning the value in normal notation
 * with as many digits as necessary - never exponential, regardless of magnitude. The library's
 * ordinary string conversion offers no such guarantee: it switches to exponential form outside its
 * notation thresholds, whose defaults would render 1e21 and 1e-9 exponentially. Those thresholds
 * are avoided rather than relied on, and the frozen constructor above independently widens them.
 *
 * NO THOUSANDS SEPARATOR, EVER. CFML's `"0.00"` mask yields `"1234.50"`, never `"1,234.50"`.
 *
 * NO IMPOSED SCALE. The value's own scale is what comes out. Two DIFFERENT and OPPOSING
 * transformations live next door in `numberFormat.ts` and neither is performed here: padding to two
 * decimals, which is `numberFormat(value, "0.00")` as used at
 * [model/service/PromotionService.cfc:L1017] and [model/service/PriceGroupService.cfc:L339]; and
 * CFML's trailing-zero drop when a NUMBER is stringified, which the rounding algorithm's
 * string-length arithmetic depends on. Do not add either here.
 *
 * A decimal VALUE also carries no trailing-zero scale of its own: `'19.90'` and `'19.9'` both
 * render as `'19.9'`, and `'0.00'` renders as `'0'`. That normalisation happens at construction,
 * not here.
 */
export function toDecimalString(value: PreciseInput): string {
  return toPrecise(value).toFixed();
}
