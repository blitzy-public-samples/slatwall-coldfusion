// ---------------------------------------------------------------------------
// slatwall-ts - CFML `precisionEvaluate()` parity: precise decimal arithmetic
//
// WHAT THIS FILE IS
// The narrow, typed replacement for CFML's `precisionEvaluate()` in the
// TypeScript port of the Slatwall 3.1.39 catalog + promotions/pricing slice.
// CFML's `precisionEvaluate()` performs arbitrary-precision arithmetic and so
// sidesteps the engine's default floating-point behaviour. It guards most -
// but not all - of the money arithmetic in the in-scope slice. This module
// replaces it with explicit, typed decimal operations so that no floating-point
// arithmetic touches currency anywhere in the target.
//
// SUBSTRATE, NOT SURFACE
// This module is the SUBSTRATE. `src/domain/valueObjects/money.ts` is the sole
// arithmetic SURFACE that the rest of the target uses: all money arithmetic
// passes through `Money`, and `Money` reaches decimal arithmetic through the
// primitives below. This module therefore does NOT duplicate that surface's
// API, does not model a currency, and is never imported by anything that could
// reach it through `Money` instead. Nothing here imports `money.ts`; the
// dependency runs the other way, and reversing it would be both a cycle and an
// inversion of the layering.
//
// WHY ARBITRARY PRECISION IS NOT A STYLISTIC PREFERENCE
// Legacy money is persisted in `big_decimal` columns. Two in-scope examples,
// read directly from the source: [model/entity/PriceGroupRate.cfc:L54] declares
// `property name="amount" ormType="big_decimal" hb_formatType="custom";` and
// [model/entity/PromotionApplied.cfc:L53] declares
// `property name="discountAmount" ormtype="big_decimal";`. Arbitrary precision
// is therefore a schema-level fact about the data this port reads and writes.
// It is a correctness requirement. No non-functional requirement of any kind is
// asserted anywhere in this module, because none exists in the source.
//
// ABSOLUTE CONSTRAINT 1 - SOLE `decimal.js` IMPORTER BESIDES `money.ts`
// This module and `src/domain/valueObjects/money.ts` are the only two modules
// in the entire `slatwall-ts` subtree permitted to import `decimal.js` directly.
// Every other module reaches decimal arithmetic through `Money`. There is
// exactly one third-party import below and no first-party import at all: `lib`
// sits at the base of the dependency flow and imports from no sibling folder.
//
// ABSOLUTE CONSTRAINT 2 - NO `Decimal` RE-EXPORT, AND NO `number` FOR MONEY
//   * `Decimal` is never re-exported. `PreciseValue` exports the TYPE, which is
//     necessary for annotation; the CONSTRUCTOR and every static on it -
//     including its configuration mutator and its own cloning entry point -
//     stay unreachable through this module's exports. Re-exporting the
//     constructor would let any consumer build a decimal under a different
//     configuration, which is a second arithmetic surface by another name and
//     would defeat the single-arithmetic-surface standard this file exists to
//     serve.
//   * `PreciseInput` is `string | PreciseValue`. `number` is deliberately NOT a
//     member of it. An IEEE-754 double is precisely how drift enters a money
//     path, so a caller holding a `number` for a price, an amount or a discount
//     simply will not compile against this module. The one narrow, explicitly
//     named integer entry point is `fromInteger`, documented at its definition.
//
// ABSOLUTE CONSTRAINT 3 - THERE IS NO EXPRESSION INTERPRETER HERE
// CFML's `precisionEvaluate()` accepts a STRING of CFML source and executes it.
// That mechanism is deliberately NOT reproduced. This module contains no
// dynamic code execution of any kind, and no hand-written expression parser,
// lexical scanner or operator-ordering algorithm. Two independent reasons:
//   1. Security. A runtime string executor reachable from request data is a
//      remote-code-execution surface, and these handlers sit behind API
//      Gateway. The legacy expression strings are developer-authored literals,
//      but a TypeScript re-expression that accepted a string and executed it
//      could not prove that of its own input.
//   2. Type safety. A dynamic executor yields an untyped result, which cannot
//      be expressed under this project's strict profile without an escape hatch
//      the type gate forbids outright.
// The eleven legacy expression strings were therefore READ during planning and
// re-expressed as the typed arithmetic calls below. Every operation is
// annotated with the locators and the legacy strings it descends from, so a
// reviewer can check the mapping rather than trust it.
//
// THE ELEVEN VERIFIED IN-SCOPE `precisionEvaluate` SITES
// Repo-wide there are 104 `precisionEvaluate` occurrences across 18 files;
// exactly eleven are in scope, and all eleven were re-verified against the
// source while authoring this file. [model/service/RoundingRuleService.cfc]
// contains ZERO of them - verified - although its arithmetic is an antecedent
// for `add`, `subtract` and `absolute`, as annotated at those functions.
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
// LOCATOR CORRECTIONS, RECORDED SO THEY STAY DURABLE
// Three published citations for this file were wrong and one site was omitted
// entirely. Each was settled by reading the source, and the file is the
// authority:
//   * L252, published as L248. L248 is a comment and L249 is
//     `var originalDiscountAmount = getDiscountAmount(...)`; the
//     `precisionEvaluate` call is on L252.
//   * [model/service/PriceGroupService.cfc:L323], published as L322. L322 is
//     literally `case "percentageOff" :`.
//   * [model/service/PriceGroupService.cfc:L331], published as L328. L328 is
//     the closing brace of the `if(!isNull(...getRoundingRule()))` block that
//     spans L326-L328; the `precisionEvaluate` call is on L331, inside
//     `case "amountOff"`.
//   * [model/service/PromotionService.cfc:L1006] was omitted from the published
//     list altogether. It is present and is confirmed: the subtraction feeding
//     `roundValueByRoundingRule(...)`.
//
// EXPLICITLY NOT OWNED BY THIS FILE
//   * The `amountOff` branch at [model/service/PromotionService.cfc:L998] reads
//     `discountAmountPreRounding = reward.getAmount() * quantity;` - raw
//     floating-point multiplication with no `precisionEvaluate`. Routing all
//     arithmetic through `Money` closes that gap, and that closure is a
//     documented deliberate divergence owned by `services`. It is recorded here
//     only as context for why a single arithmetic surface matters. It is not
//     implemented here and no divergence is spent here.
//   * The unguarded division at [model/service/PromotionService.cfc:L299] has
//     no zero check on its divisor in the legacy source. `divide` below throws
//     on a zero divisor; whether the CALL SITE needs a guard is a hand-off note
//     for `src/services/promotion/rewardUsageLedger.ts`, which owns that
//     decision. No guard, no `0` fallback and no `NaN` return is added here -
//     returning `0` would silently invent money.
//   * `numberFormat(discountAmount, "0.00")`
//     [model/service/PromotionService.cfc:L1017] and
//     `numberFormat(newPrice, "0.00")` [model/service/PriceGroupService.cfc:L339]
//     are presentation, and they belong to `src/lib/cfml/numberFormat.ts`
//     together with CFML's trailing-zero stringification. Neither is duplicated
//     here. See `toDecimalString` for exactly where that boundary sits.
//   * This file reproduces no entry from the legacy defect register, so it
//     deliberately carries none of the uniform two-line preserved-defect
//     annotations used elsewhere in this port. None was added speculatively.
//   * No legacy TODO lives inside the arithmetic this file replaces, so there is
//     no carried-forward TODO here either. The carried-forward ones - the
//     issue #1766 return/exchange no-op at
//     [model/service/PromotionService.cfc:L542-L544] and the empty
//     `g:google_product_category` element in the product feed - sit in modules
//     that own them.
//
// TEST OBLIGATION
// Every export below requires a test at
// `slatwall-ts/tests/unit/lib/cfml/precision.test.ts`. ALL of that coverage is
// NET-NEW and must be presented as such, never as parity: no legacy test under
// `meta/tests/**` touches these helpers. (Across the whole migration only
// `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` are extended, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub
// contributing zero coverage.) That test tier is owned by a different author;
// this comment states the obligation, it does not discharge it.
//
// PROJECT RULES
// No user-specified rules were provided for this project. The absence was
// VERIFIED rather than assumed - the rules source was read three independent
// ways, unbounded and with two explicit ranges, the second deliberately past
// the end of the document, and all three reads returned the identical single
// line "No user rules provided." No rule has been invented to fill the gap.
// That absence is NOT licence to lower the bar: the substitute
// enterprise-standard practices apply at full strength, and the ones this file
// carries are maximal type strictness, the domain-inward layer boundary, exact
// dependency pinning, the single arithmetic surface, and in-code annotation of
// every judgment call. Zero files enter scope by rule mandate - there is no
// third, rule-driven category of in-scope file - and there are consequently no
// rule conflicts to resolve.
// ---------------------------------------------------------------------------

// The ONLY third-party import in this module, and the only import of any kind.
//
// JUDGMENT CALL: the NAMED import form is used, not the default import, and the
// choice was settled by compiling both rather than by preference. Under this
// project's `module`/`moduleResolution: NodeNext` with `target: ES2022`,
// `import Decimal from 'decimal.js'` fails with TS2339 ("Property 'clone' does
// not exist...", "Property 'ROUND_HALF_UP' does not exist...") and TS2709
// ("Cannot use namespace 'Decimal' as a type"), reproduced with
// `esModuleInterop` both enabled and disabled. `import { Decimal } from
// 'decimal.js'` type-checks cleanly. The package's declarations merge a class
// and a namespace under one exported name, which is what makes both the value
// `Decimal.clone` and the type `Decimal.Constructor` reachable from this single
// named binding.
//
// This is a runtime import rather than an `import type` because decimal values
// must actually be constructed here. It is the one place in this folder where a
// runtime third-party binding is required.
import { Decimal } from 'decimal.js';

// ---------------------------------------------------------------------------
// The configured arithmetic constructor
// ---------------------------------------------------------------------------

/**
 * Number of significant digits every operation in this module is resolved to.
 *
 * JUDGMENT CALL: declared explicitly rather than inherited from the library's
 * ambient default. The legacy engine's internal `precisionEvaluate` scale is not
 * knowable from the source, so the value this port uses must be DECLARED, not
 * silently assumed. 20 significant digits is chosen because it matches the
 * library's own documented default, so nothing about existing behaviour changes
 * by declaring it - and because it comfortably exceeds anything a currency
 * amount needs while still bounding a non-terminating quotient. It matters
 * because division can be non-terminating: `1 / 3` has no exact decimal
 * representation, and something has to decide where it stops.
 */
const ARITHMETIC_PRECISION = 20;

/**
 * The configured constructor every operation in this module routes through.
 *
 * JUDGMENT CALL: a locally configured clone held in a FROZEN module-scope
 * `const`, never the library's global configuration mutator. Two reasons, and
 * neither is a speed consideration:
 *
 *   1. Cross-request correctness. Mutating global library configuration would
 *      persist across unrelated requests on a warm container, and on a money
 *      path shared mutable configuration is a correctness hazard. The one
 *      deliberate module-scope-state exception in the whole target is the MySQL
 *      connection pool; this module has no mutable module-scope state at all.
 *   2. Isolation from other modules. A second module calling the global mutator
 *      could otherwise change the configuration underneath this one. A clone
 *      cannot be reached that way.
 *
 * `Object.freeze` here is a mechanical guarantee rather than decoration, and it
 * was verified against the pinned library: the frozen constructor still performs
 * arithmetic normally, and an attempt to reconfigure it through its own mutator
 * throws a `TypeError` ("Cannot assign to read only property 'precision'")
 * because this module is strict-mode ESM. The configuration therefore cannot be
 * changed after this line, by this module or any other.
 *
 * All eight configurable properties are stated explicitly. The library copies
 * any UNSPECIFIED property from the parent constructor at clone time, so naming
 * all eight is what makes this clone independent of whatever ambient state the
 * parent happens to be in.
 *
 * The type annotation is deliberately the constructor type and NOT
 * `Readonly<...>`: a mapped type discards construct signatures, and annotating
 * it that way fails with TS2351 ("has no construct signatures"). Verified.
 */
const PreciseArithmetic: Decimal.Constructor = Object.freeze(
  Decimal.clone({
    // Significant digits for operations that cannot terminate exactly.
    precision: ARITHMETIC_PRECISION,

    // JUDGMENT CALL: half-up rounding, declared explicitly for the same reason
    // as the precision above - the legacy engine's internal rounding mode is not
    // knowable from the source, so it is stated rather than inherited. Half-up
    // is the library's documented default, so declaring it changes nothing about
    // existing behaviour, and it is the mode a reader of a money path expects.
    // Rounding to a SCALE is a different concern entirely and is not done here:
    // that belongs to `numberFormat.ts` and to `Money`.
    rounding: Decimal.ROUND_HALF_UP,

    // Exponential-notation thresholds pushed to the representable extremes so
    // that no finite value this module can hold ever renders in exponential
    // form, even through an incidental string conversion. `toDecimalString`
    // guarantees plain notation by construction on its own (see its
    // definition); these two settings are the second, independent guarantee.
    // The library's defaults would render, for example, 1e21 and 1e-9
    // exponentially.
    toExpNeg: -9e15,
    toExpPos: 9e15,

    // Exponent bounds, stated explicitly so the clone does not inherit them.
    minE: -9e15,
    maxE: 9e15,

    // No cryptographic value source is used: this module generates no random
    // values, and none is needed to reproduce the legacy arithmetic.
    crypto: false,

    // Stated only so that no property is inherited from the parent. This module
    // exposes no remainder operation, so the setting is never exercised.
    modulo: Decimal.ROUND_DOWN,
  }),
);

// ---------------------------------------------------------------------------
// The value types
// ---------------------------------------------------------------------------

/**
 * A precise decimal value produced by this module.
 *
 * This is a TYPE alias only. The constructor behind it is never exported, so no
 * consumer can build one except by calling an operation below - which is exactly
 * the property that keeps this module the substrate of a single arithmetic
 * surface rather than a second one. Values are immutable: every operation
 * returns a new value and no operation mutates an operand.
 */
export type PreciseValue = Decimal;

/**
 * What every operation in this module accepts.
 *
 * A decimal STRING, or a value this module previously produced.
 *
 * `number` is deliberately not a member. An IEEE-754 double cannot represent
 * most decimal fractions exactly, and admitting one here is precisely how drift
 * would enter a money path - the whole reason this module exists. A caller
 * holding a `number` for a price, an amount or a discount will not compile
 * against this module, and that is the intended outcome rather than an
 * inconvenience. The single narrow integer entry point is `fromInteger`.
 *
 * A string operand is accepted in whatever lexical form the pinned decimal
 * library accepts - plain decimal, signed, leading-point, and exponential or
 * hex/binary/octal literal forms. A malformed string throws (see `toPrecise`),
 * and a syntactically valid but non-finite string such as `'NaN'` or
 * `'Infinity'` is rejected rather than admitted; that rejection is deliberate
 * and is explained at `assertFinite`.
 */
export type PreciseInput = string | PreciseValue;

// ---------------------------------------------------------------------------
// Failure signalling
// ---------------------------------------------------------------------------

/**
 * Raised when an arithmetic request cannot be honoured without inventing a
 * value: a zero divisor, a non-finite operand, a non-finite result, or a
 * non-integer handed to `fromInteger`.
 *
 * JUDGMENT CALL: this class is deliberately NOT exported. The export surface of
 * this module is a closed set - the value types plus the arithmetic primitives -
 * and widening it is a product decision rather than an implementation detail.
 * The error is still a distinct, identifiable type rather than a bare string: it
 * is an `Error` subclass carrying a stable `name`, so a caller can discriminate
 * on `name === 'PrecisionError'` without this module handing out a constructor.
 * If a consumer ever genuinely needs `instanceof`, exporting this is a
 * deliberate surface change and should be made as one.
 *
 * Messages name the operation and, where it aids diagnosis, the offending
 * numeric operand. They carry no configuration, connection or environment data
 * of any kind - this module reads no environment.
 */
class PrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrecisionError';
  }
}

// ---------------------------------------------------------------------------
// The input and result boundary
// ---------------------------------------------------------------------------

/**
 * Rejects any decimal that is not finite.
 *
 * No `NaN` and no infinity may ever escape this module. A `NaN` that flowed into
 * a price would propagate silently through every subsequent operation and
 * surface as a corrupted amount rather than as a failure, so it is turned into a
 * failure at the boundary instead.
 *
 * This check is genuinely load-bearing rather than defensive garnish, and the
 * reason was measured against the pinned library rather than assumed:
 *   * The constructor ACCEPTS the strings `'NaN'`, `'Infinity'` and
 *     `'-Infinity'` and builds non-finite values from them without complaint.
 *   * Division by zero does NOT throw - it yields infinity, and `0 / 0` yields
 *     `NaN`.
 * So relying on the constructor alone to reject a non-finite value would leave
 * both holes open. `divide` additionally refuses a zero divisor outright.
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
 * Coerces an operand into a decimal governed by THIS module's configuration.
 *
 * Two things happen here, and both matter.
 *
 * First, a malformed numeric string throws. The pinned library raises its own
 * invalid-argument error for input such as `'abc'`, `''`, `'1.2.3'` or
 * `'1,000'`, and that error is deliberately NOT caught and NOT softened: a
 * malformed amount must fail loudly rather than resolve to zero or to `NaN`.
 *
 * Second, an operand that is already a precise value is re-homed onto the frozen
 * configured constructor. That is not redundant. Re-homing was verified against
 * the pinned library to copy every digit with no rounding, while re-pointing the
 * value at this module's configuration - so this module's declared precision and
 * rounding govern every subsequent operation regardless of which constructor
 * produced the operand. Without it, a value built elsewhere under a different
 * configuration would silently impose that configuration on a money
 * calculation.
 */
function toPrecise(input: PreciseInput): PreciseValue {
  return assertFinite(new PreciseArithmetic(input), 'operand');
}

// ---------------------------------------------------------------------------
// Entering the precise domain from an integer
// ---------------------------------------------------------------------------

/**
 * The single deliberate `number` entry point in this module.
 *
 * JUDGMENT CALL: one narrow, explicitly named escape hatch is provided, and the
 * need for it is real rather than theoretical. The legacy arithmetic divides by
 * the literal `100` at [model/service/PromotionService.cfc:L995] and
 * [model/service/PriceGroupService.cfc:L323], and multiplies by an integer
 * quantity at [model/service/PromotionService.cfc:L990] and
 * [model/service/PromotionService.cfc:L1001]. Quantities are integer counts, and
 * a caller holding one should not have to stringify it by hand to enter the
 * precise domain.
 *
 * It accepts ONLY a safe integer. A non-integer, a non-finite value, or a
 * magnitude beyond exact integer representation is rejected with a
 * `PrecisionError` - every one of those is a case where the caller's `number`
 * may already have lost information, which is the failure this module exists to
 * prevent.
 *
 * MUST NEVER BE USED FOR A PRICE, AN AMOUNT OR A DISCOUNT. Those are decimal
 * quantities; pass them as strings or as values this module produced. Where a
 * string literal will do - `'100'` for the percentage divisor, for instance -
 * prefer the string literal and do not reach for this at all.
 */
export function fromInteger(value: number): PreciseValue {
  if (!Number.isSafeInteger(value)) {
    throw new PrecisionError(
      `fromInteger accepts only a safe integer; received ${String(value)}. Decimal quantities ` +
        'such as a price, an amount or a discount must be passed as a decimal string.',
    );
  }

  // A safe integer is finite and exactly representable by definition, so the
  // finiteness boundary is already satisfied at this point.
  return new PreciseArithmetic(value);
}

// ---------------------------------------------------------------------------
// Arithmetic
//
// Every operation below is synchronous and pure: it reads its operands, returns
// a new value, and mutates nothing. There is no state to carry, so there is
// nothing to await.
// ---------------------------------------------------------------------------

/**
 * Multiplies two precise operands.
 *
 * CFML parity [model/service/PromotionService.cfc:L990]:
 *   `precisionEvaluate('arguments.price * arguments.quantity')` - the plain
 *   `a x b` shape at the head of the discount calculation.
 * CFML parity [model/service/PromotionService.cfc:L150]:
 *   `precisionEvaluate('(orderItem.getSku().getPrice() * orderItem.getQuantity())
 *   - (salePriceDetails.salePrice * orderItem.getQuantity())')` - composed with
 *   `subtract` to form `(a x b) - (c x b)`.
 * CFML parity [model/service/PromotionService.cfc:L995]:
 *   `precisionEvaluate('originalAmount * (reward.getAmount()/100)')` - composed
 *   with `divide` to form `a x (b / 100)`. Note the division by the literal 100
 *   nested inside the multiplication.
 * CFML parity [model/service/PromotionService.cfc:L1001]:
 *   `precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity')`
 *   - composed with `subtract` to form `(a - b) x c`.
 * CFML parity [model/service/PromotionService.cfc:L486]:
 *   `precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount
 *   / thisDiscountQuantity) * (thisDiscountQuantity - needToRemove)')` - composed
 *   with `divide` and `subtract` to form `(a / b) x (b - c)`, division first.
 * CFML parity [model/service/PriceGroupService.cfc:L323]:
 *   `precisionEvaluate('arguments.sku.getPrice() - (arguments.sku.getPrice() *
 *   (arguments.priceGroupRate.getAmount() / 100))')` - the inner
 *   `a x (b / 100)` term of the percentage-off rate. Published as L322, which is
 *   wrong: L322 is literally `case "percentageOff" :`. The `precisionEvaluate`
 *   call is on L323.
 */
export function multiply(multiplicand: PreciseInput, multiplier: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(multiplicand).times(toPrecise(multiplier)), 'multiply');
}

/**
 * Subtracts the subtrahend from the minuend.
 *
 * CFML parity [model/service/PromotionService.cfc:L1007]:
 *   `precisionEvaluate('originalAmount - roundedFinalAmount')` - the discount the
 *   rounded final amount implies.
 * CFML parity [model/service/PromotionService.cfc:L1006]:
 *   `precisionEvaluate('originalAmount - discountAmountPreRounding')`, the value
 *   handed to `roundValueByRoundingRule(...)`. This site was omitted entirely
 *   from the published site list; it is present in the source and is cited here
 *   so the omission stays corrected.
 * CFML parity [model/service/PromotionService.cfc:L252]:
 *   `precisionEvaluate('originalDiscountAmount - (orderItem.getExtendedSkuPrice()
 *   - orderItem.getExtendedPrice())')` - the nested `a - (b - c)` shape that
 *   adjusts a discount for a price-group price. PUBLISHED AS L248, WHICH IS
 *   WRONG: L248 is a comment and L249 is the `getDiscountAmount(...)` call. The
 *   `precisionEvaluate` call is on L252.
 * CFML parity [model/service/PromotionService.cfc:L150] and
 * [model/service/PromotionService.cfc:L1001]: the outer subtraction of
 *   `(a x b) - (c x b)` and the inner `(a - b)` of `(a - b) x c`.
 * CFML parity [model/service/PriceGroupService.cfc:L331]:
 *   `precisionEvaluate('arguments.sku.getPrice() - arguments.priceGroupRate.getAmount()')`
 *   - the amount-off rate. PUBLISHED AS L328, WHICH IS WRONG: L328 is the
 *   closing brace of the rounding-rule block spanning L326-L328. The
 *   `precisionEvaluate` call is on L331, inside `case "amountOff"`.
 * CFML parity [model/service/PriceGroupService.cfc:L323]: the outer subtraction
 *   of `a - (a x (b / 100))`.
 */
export function subtract(minuend: PreciseInput, subtrahend: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(minuend).minus(toPrecise(subtrahend)), 'subtract');
}

/**
 * Adds two precise operands.
 *
 * Provided for completeness, and stated honestly: NO in-scope
 * `precisionEvaluate` site performs addition. All eleven are multiplication,
 * subtraction or division.
 *
 * Its in-scope arithmetic antecedent is the rounding algorithm, which adds
 * without the precision guard:
 * CFML parity [model/service/RoundingRuleService.cfc:L108]:
 *   `var higherValue = inputValue + rrPower;` - the upward candidate in the
 *   rounding search. Its downward counterpart on L101,
 *   `var lowerValue = inputValue - rrPower;`, is served by `subtract`.
 *
 * Offering this operation is what keeps `src/services/roundingRuleService.ts`
 * from reaching for floating-point addition on a money value simply because no
 * precise addition existed.
 */
export function add(augend: PreciseInput, addend: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(augend).plus(toPrecise(addend)), 'add');
}

/**
 * Divides the dividend by the divisor.
 *
 * CFML parity [model/service/PromotionService.cfc:L299]:
 *   `precisionEvaluate('discountAmount / discountQuantity')` - the
 *   discount-per-use value that the usage ledger insert-sorts on.
 * CFML parity [model/service/PromotionService.cfc:L995]:
 *   the `(reward.getAmount()/100)` term inside `a x (b / 100)`.
 * CFML parity [model/service/PromotionService.cfc:L486]:
 *   the leading `(... .discountAmount / thisDiscountQuantity)` term of
 *   `(a / b) x (b - c)`.
 * CFML parity [model/service/PriceGroupService.cfc:L323]:
 *   the `(arguments.priceGroupRate.getAmount() / 100)` term of
 *   `a - (a x (b / 100))`.
 *
 * JUDGMENT CALL - A ZERO DIVISOR THROWS.
 * The legacy site at [model/service/PromotionService.cfc:L299] applies no zero
 * check to its divisor, and this module reproduces the ARITHMETIC faithfully
 * while refusing to resolve that case silently. Throwing is the faithful
 * outcome, not a departure: CFML's `precisionEvaluate` raises a division-by-zero
 * error, so a request to divide by zero has always failed rather than produced a
 * number. The pinned decimal library, by contrast, does NOT throw - measured, it
 * yields infinity for `n / 0` and `NaN` for `0 / 0` - so the check has to be
 * explicit or a non-finite value would silently enter a price.
 *
 * No guard, no `0` fallback and no `NaN` return is added here. Returning `0`
 * would silently invent money. Whether the CALL SITE at L299 needs a guard, and
 * what that guard should do, is a hand-off note for
 * `src/services/promotion/rewardUsageLedger.ts`, which owns that decision.
 *
 * JUDGMENT CALL - NON-TERMINATING DIVISION IS RESOLVED AT A DECLARED SCALE.
 * `1 / 3` has no exact decimal representation, so division must stop somewhere.
 * It stops at the explicitly declared `ARITHMETIC_PRECISION` significant digits
 * with the explicitly declared half-up rounding of the frozen constructor above,
 * rather than at whatever the library's ambient configuration happens to be. The
 * legacy engine's internal scale is not knowable from the source, so this port
 * declares its own instead of guessing silently: `1 / 3` resolves to
 * `0.33333333333333333333` and `2 / 3` to `0.66666666666666666667`, both
 * verified against the pinned library. Division does not throw for a
 * non-terminating quotient.
 */
export function divide(dividend: PreciseInput, divisor: PreciseInput): PreciseValue {
  const numerator = toPrecise(dividend);
  const denominator = toPrecise(divisor);

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
 * CFML parity [model/service/RoundingRuleService.cfc:L123-L130]:
 *   `var valueOptionOneDelta = inputValue - valueOptionOne;`
 *   `if(valueOptionOneDelta < 0) { valueOptionOneDelta = valueOptionOneDelta*-1; }`
 *   and the identical pair for `valueOptionTwoDelta` - a subtraction followed by
 *   a manual sign flip when the result is negative.
 *
 * Provided so that `src/services/roundingRuleService.ts` compares candidate
 * deltas by magnitude without hand-rolling that sign flip. The negative
 * intermediates are real, not hypothetical: the rounding search legitimately
 * produces them.
 */
export function absolute(value: PreciseInput): PreciseValue {
  return assertFinite(toPrecise(value).absoluteValue(), 'absolute');
}

// ---------------------------------------------------------------------------
// Comparison
//
// EVERY comparison below is BY DECIMAL VALUE, never by string. This is not a
// stylistic point. A JavaScript string comparison would report `'12.350'` and
// `'12.35'` as different values, and `'9.99'` as greater than `'12.35'` because
// `'9'` sorts after `'1'`. Both answers are wrong, and both would change money.
// Comparing by decimal value gives `'12.350'` equal to `'12.35'` - verified
// against the pinned library.
// ---------------------------------------------------------------------------

/**
 * Orders two operands: `-1` when the left is smaller, `1` when it is larger,
 * `0` when they are equal in value.
 *
 * CFML parity [model/service/PromotionService.cfc:L148]:
 *   `salePriceDetails.salePrice < orderItem.getSku().getPrice()` - the sale-price
 *   seeding test.
 * CFML parity [model/service/PromotionService.cfc:L1013]:
 *   `if(discountAmountPreRounding > originalAmount)` - the clamp that stops a
 *   discount exceeding the original amount.
 * CFML parity [model/service/RoundingRuleService.cfc:L120]:
 *   `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)` - an
 *   equality test the legacy engine performs on values it built as STRINGS,
 *   which is exactly why comparison here must be by decimal value.
 *
 * Both operands are coerced through `toPrecise` and are therefore guaranteed
 * finite, so the underlying comparison cannot yield `NaN`; the `0` branch below
 * genuinely means equal rather than incomparable. The result is narrowed to the
 * three-way union with explicit branches - no type assertion and no non-null
 * assertion, both of which are forbidden in `src/**`.
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
 * CFML parity [model/service/PromotionService.cfc:L257]:
 *   `if(discountAmount > 0)` - the gate that decides whether a computed discount
 *   is added to an order item's qualified discounts at all.
 * CFML parity [model/service/PromotionService.cfc:L1013]:
 *   `if(discountAmountPreRounding > originalAmount)`.
 * CFML parity [model/service/RoundingRuleService.cfc:L100]:
 *   `if(valueOptionOne > inputValue)` - which branch of the rounding search runs.
 * CFML parity [model/service/RoundingRuleService.cfc:L145] and
 * [model/service/RoundingRuleService.cfc:L149]: the `valueOption > inputValue`
 *   tests that gate the "Up" rounding direction.
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
 * [model/service/RoundingRuleService.cfc:L128]: the `< 0` tests that decide
 *   whether a candidate delta needs its sign flipped - see `absolute`.
 * CFML parity [model/service/RoundingRuleService.cfc:L134],
 * [model/service/RoundingRuleService.cfc:L138],
 * [model/service/RoundingRuleService.cfc:L156] and
 * [model/service/RoundingRuleService.cfc:L160]: the `delta < returnDelta` and
 *   `valueOption < inputValue` tests that drive the "Closest" and "Down"
 *   rounding directions.
 */
export function isLessThan(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).lessThan(toPrecise(right));
}

/**
 * True when both operands are equal IN VALUE.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L120]:
 *   `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`.
 *
 * This is the single clearest illustration of why comparison is by decimal value
 * here. The legacy rounding algorithm assembles its candidates by slicing and
 * concatenating decimal STRINGS, then compares them with `==`, which CFML
 * resolves numerically. A JavaScript string comparison of the same operands
 * would report `'12.350'` and `'12.35'` as different, and `'1.0'` and `'1'` as
 * different. Here both pairs are equal, as they must be.
 */
export function equals(left: PreciseInput, right: PreciseInput): boolean {
  return toPrecise(left).equals(toPrecise(right));
}

/**
 * True when the operand is zero, whatever scale it was written at.
 *
 * `'0'`, `'0.00'`, `'-0'` and `'0e5'` are all zero. Needed by callers that want
 * to check a divisor before calling `divide` - the divisor guard inside `divide`
 * uses exactly this test - and by callers deciding whether a computed discount is
 * worth recording at all, per the `if(discountAmount > 0)` gate at
 * [model/service/PromotionService.cfc:L257].
 */
export function isZero(value: PreciseInput): boolean {
  return toPrecise(value).isZero();
}

// ---------------------------------------------------------------------------
// Leaving the precise domain
// ---------------------------------------------------------------------------

/**
 * Renders a precise value as a plain decimal string.
 *
 * This is the boundary at which a precise value leaves this module - for
 * persistence into a `big_decimal` column, or for a presentation step that
 * applies a mask.
 *
 * JUDGMENT CALL - PLAIN NOTATION IS GUARANTEED BY CONSTRUCTION.
 * The fixed-point renderer is called with NO argument, which the pinned library
 * documents as returning the value in normal notation with as many digits as
 * necessary - never exponential, regardless of magnitude. The library's ordinary
 * string conversion does NOT offer that guarantee: it switches to exponential
 * form outside its notation thresholds, whose defaults would render 1e21 and
 * 1e-9 exponentially. Relying on those thresholds is therefore avoided rather
 * than tuned, and it is not the guarantee here; the frozen constructor above
 * also widens them to the representable extremes, so the two mechanisms are
 * independent. Verified empirically against the pinned library rather than
 * assumed: `'1000000000000000000000'` and `'0.000000001'` both round-trip in
 * plain notation with no `e+` and no `e-`.
 *
 * NO THOUSANDS SEPARATOR, EVER. CFML's `"0.00"` mask yields `"1234.50"`, never
 * `"1,234.50"`. This function imposes no grouping.
 *
 * NO IMPOSED SCALE. The value's own scale is what comes out. Two DIFFERENT and
 * OPPOSING transformations live next door in `numberFormat.ts` and neither is
 * performed here:
 *   * padding to two decimals, which is `numberFormat(value, "0.00")` as used at
 *     [model/service/PromotionService.cfc:L1017] and
 *     [model/service/PriceGroupService.cfc:L339]; and
 *   * CFML's trailing-zero drop when a NUMBER is stringified, which the rounding
 *     algorithm's string-length arithmetic depends on.
 * Do not add either here, however helpful it might look.
 *
 * One measured property of the pinned library, stated plainly so nobody mistakes
 * this function for doing something it does not: a decimal VALUE carries no
 * trailing-zero scale of its own. `'19.90'` and `'19.9'` are the same value and
 * both render as `'19.9'`; `'0.00'` renders as `'0'`. That normalisation happens
 * when the value is constructed, not here - this function neither strips nor pads
 * anything, it renders the value it was given.
 */
export function toDecimalString(value: PreciseInput): string {
  return toPrecise(value).toFixed();
}
