// ---------------------------------------------------------------------------
// Unit suite for the money value object
//
// SUBJECT: src/domain/valueObjects/money.ts in isolation. `Money` is the SOLE arithmetic surface of
// the TypeScript / AWS Lambda `nodejs20.x` port of the Slatwall 3.1.39 catalog and
// promotions/pricing slice, replacing three CFML mechanisms at once - `precisionEvaluate`,
// `numberFormat` and the `big_decimal` column type - so it guards the arithmetic half of the
// promotion-discount must-preserve area. If an assertion below is wrong, the amount a customer is
// charged is wrong.
//
// Every shipped member is exercised - the one construction factory, the `zero` constant, the four
// arithmetic operations, the four comparisons and the two egress methods - and what is ABSENT is
// asserted too, because the surface being closed is itself part of the contract. The substrate
// beneath it, src/lib/cfml/precision.ts and src/lib/cfml/numberFormat.ts, has its own suites; this
// file asserts only that the surface PROPAGATES their refusals.
//
// COVERAGE CLASSIFICATION: NET-NEW, never to be presented as parity. CFML had no money type at all,
// and searching all 32 `.cfc` files under meta/tests/ for a money, currency-code or
// materialized-id-path value object, `precisionEvaluate` and `roundValue` returns ZERO hits. The
// four shared cases every legacy entity suite inherits from
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] are all inapplicable: a `Money` has
// no `validate(context)`, no `getSimpleRepresentation()`, no `getPrimaryIDPropertyName()` and no
// new/persisted state.
//
// TWO SEMANTIC FACTS ABOUT THE LEGACY MONEY PATH
//
//   1. THE ROUNDING RULE SHAPES THE FINAL PRICE, NOT THE DISCOUNT. The value
//      handed to `roundValueByRoundingRule` at
//      [model/service/PromotionService.cfc:L1006] is
//      `originalAmount - discountAmountPreRounding` - the NET PRICE - and
//      [model/service/PromotionService.cfc:L1007] derives the discount back out
//      as a RESIDUAL, `originalAmount - roundedFinalAmount`. `Money` is therefore
//      no rounding-policy holder: it holds no rounding rule, exposes no rounding
//      operation, and contributes the subtraction on both lines.
//
//   2. CFML'S DECLARED-NUMERIC / RETURNS-STRING DUALITY IS NOT PAPERED OVER.
//      [model/service/PromotionService.cfc:L1017] is
//      `return numberFormat(discountAmount, "0.00");` inside a function declared
//      `private numeric function` at [model/service/PromotionService.cfc:L987];
//      the same mismatch recurs at [model/service/PriceGroupService.cfc:L339]
//      inside a `public numeric function` at
//      [model/service/PriceGroupService.cfc:L316], and again at
//      [model/service/RoundingRuleService.cfc:L88], where `roundValue` declares
//      `returntype="string"` while BOTH callers -
//      [model/service/RoundingRuleService.cfc:L79] and
//      [model/service/RoundingRuleService.cfc:L84] - declare `numeric`. CFML
//      coerces silently; this port keeps the two as separate members.
//
// LOCATORS. Every locator below was re-verified with `grep -n`; published locators for this slice
// drift, and each correction is recorded at its point of use. The verified `precisionEvaluate`
// census is NINE sites in [model/service/PromotionService.cfc] (L150, L252, L299, L486, L990, L995,
// L1001, L1006, L1007) plus TWO in [model/service/PriceGroupService.cfc] (L323, L331) and ZERO in
// [model/service/RoundingRuleService.cfc] - eleven in scope. The two-decimal presentation step is
// on [model/service/PriceGroupService.cfc:L339].
//
// No preserved-defect marker appears here: the defect register belongs to the entity and service
// tiers. This suite SUPPORTS one deliberate divergence without owning it - the raw floating-point
// gap in the `amountOff` branch at [model/service/PromotionService.cfc:L998], which routing all
// arithmetic through `Money` closes - by proving decimal arithmetic never drifts, while the
// un-scoped `discountAmount` assignment at [model/service/PromotionService.cfc:L1007, L1009] is
// owned elsewhere. Justification throughout is correctness, never speed: the speed-framed memo
// rationale at [model/service/RoundingRuleService.cfc:L66] is not carried here and no timing figure
// appears below.
//
// HARNESS: carry the assertions, never the harness. [meta/tests/unit/SlatwallUnitTestBase.cfc]
// bootstraps the whole `Slatwall.Application`, booting the real ORM and bean factory before every
// legacy "unit" test; this suite is pure arithmetic over string literals with no database, network,
// filesystem, environment read or logging. [meta/tests/unit/Helper.cfc:L51-L56] is followed as a
// SHAPE reference only, and one hygiene defect there is deliberately NOT reproduced:
// [meta/tests/unit/Helper.cfc:L52] correctly declares `var product = entityNew("SlatwallProduct");`
// while [meta/tests/unit/Helper.cfc:L53] declares `productData = {` WITHOUT `var`, leaking fixture
// data into component scope, and [meta/tests/unit/IssuesTest.cfc:L55] repeats the identical slip -
// harness hygiene in the tier being replaced, not a preserved business-logic defect. Regression
// suites follow the `issue_<ticket#>` convention from [meta/tests/unit/IssuesTest.cfc]; the
// carried-forward case, ticket #1766 for the return/exchange no-op at
// [model/service/PromotionService.cfc:L542-L544], belongs to the promotion engine.
//
// JUDGMENT CALL: every expectation is a decimal-STRING literal measured against the shipped module
// under the pinned toolchain, never derived by hand. No floating-point arithmetic and no
// approximate matching appears anywhere in this file - approximation would mask the very drift
// `Money` exists to prevent.
//
// JUDGMENT CALL: the suite imports nothing but its subject. Fixtures build entities and views, a
// layer ABOVE value objects, so importing one would invert the layering. `tests/setup.ts` is the
// runner's single setup file, already forcing UTC and restoring mocks and timers, and value objects
// are date-free.
//
// JUDGMENT CALL: failures are discriminated on the error's stable `name` rather than with
// `instanceof`. The substrate's zero-divisor and non-integer refusals come from an error class it
// deliberately does NOT export, and importing the one exported error class purely to discriminate
// the other half would widen the import surface for no gain.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

// Four levels of `..` from `tests/unit/domain/valueObjects/` reach the subtree root, and the `.js`
// extension is mandatory: `tsconfig.json` sets `module` and `moduleResolution` to `NodeNext` with
// no `paths`, no `baseUrl` and no `allowImportingTsExtensions`, so an extensionless specifier does
// not resolve and a `.ts` specifier does not compile.
//
// JUDGMENT CALL: a THREE-level example specifier circulates for this folder and is wrong - it
// resolves to a nonexistent `tests/src/...`. Both a named and a namespace import are deliberate:
// the named import is the subject, the namespace import is the only way to assert what is NOT
// exported, and `noUnusedLocals` requires both to be used.
import { Money } from '../../../../src/domain/valueObjects/money.js';
import * as moneyModule from '../../../../src/domain/valueObjects/money.js';

// ---------------------------------------------------------------------------
// Local helpers
//
// JUDGMENT CALL: both are pure local functions holding no state. Four legacy component-level caches
// become request-scoped in this port because module-level mutable state survives between unrelated
// invocations on a warm container, so nothing here is mutable at module scope either.
// ---------------------------------------------------------------------------

/**
 * What a rejected request reveals about itself. A caller discriminates on the stable `name`, and so
 * does this suite; the header records why `instanceof` is not used.
 */
interface CapturedFailure {
  readonly name: string;
  readonly message: string;
}

/**
 * Runs an operation expected to fail and reports how it failed. If the operation does NOT throw,
 * this throws instead, so a silently succeeding subject can never be mistaken for a passing
 * expectation.
 */
const captureFailure = (operation: () => unknown): CapturedFailure => {
  try {
    operation();
  } catch (thrown) {
    return thrown instanceof Error
      ? { name: thrown.name, message: thrown.message }
      : { name: 'NotAnError', message: 'a value that is not an Error was thrown' };
  }

  throw new Error('the operation under test was expected to throw, but it returned normally.');
};

/**
 * Views a subject's own runtime state without an `any`, a suppression comment or a non-null
 * assertion.
 *
 * JUDGMENT CALL: this exists for exactly one purpose - proving that the state a `Money` holds is a
 * plain decimal NUMERAL and never a decimal-library instance. TypeScript's `private` is a
 * compile-time modifier, so the field is an ordinary own property at runtime and asserting it
 * "absent" would be false. The double assertion goes through `unknown`, so no `any` enters this
 * file.
 */
const ownState = (subject: Money): Readonly<Record<string, unknown>> =>
  subject as unknown as Record<string, unknown>;

// ---------------------------------------------------------------------------
// THE VERIFIED REFERENCE CALCULATION
//
// The discount pipeline reproduced end to end, closing at the presentation contract this port must
// honour, [model/service/PromotionService.cfc:L1017]:
//   `return numberFormat(discountAmount, "0.00");`
//
//   unit price                                    19.99
//   quantity                                          3
//   extended   = 19.99 x 3                        59.97
//   discount   = 59.97 x (12.5 / 100)             7.49625
//   net        = 59.97 - 7.49625                  52.47375
//   toFixed2() of the net                         '52.47'
//
// WHY THE INTERMEDIATE IS PINNED AND NOT JUST THE FINAL STRING. Measured as IEEE-754 doubles rather
// than assumed: `19.99 * 3` is EXACT (59.97) and `59.97 * 0.125` is EXACT (7.49625), so neither is
// claimed as drift, but `59.97 - 7.49625` DRIFTS to 52.473749999999995 - and `toFixed(2)` of that
// drifted double still yields the same two decimals. Only the intermediate distinguishes a correct
// implementation from a drifting one.
// ---------------------------------------------------------------------------

describe('the verified reference calculation', () => {
  // CFML parity [model/service/PromotionService.cfc:L990]:
  //   `precisionEvaluate('arguments.price * arguments.quantity')` - the extension
  //   at the head of `getDiscountAmount`.
  // CFML parity [model/service/PromotionService.cfc:L995]:
  //   `precisionEvaluate('originalAmount * (reward.getAmount()/100)')` - the
  //   percentage-off branch, dividing by the literal 100 inside the product.
  // CFML parity [model/service/PromotionService.cfc:L1006]:
  //   `precisionEvaluate('originalAmount - discountAmountPreRounding')` - the net
  //   price. Omitted from the published citation list.
  // CFML parity [model/service/PromotionService.cfc:L1017]:
  //   `return numberFormat(discountAmount, "0.00");` - the presentation step this
  //   chain closes with.
  //
  // JUDGMENT CALL: every operand here is a decimal-string literal, including the quantity and the
  // divisor, so no numeric literal capable of drift appears in the calculation guarding the
  // must-preserve area. The safe-integer `number` ingress is pinned in its own block below.

  it('extends a unit price across a quantity exactly', () => {
    const extended = Money.fromDecimalString('19.99').times('3');

    expect(extended.equals(Money.fromDecimalString('59.97'))).toBe(true);
    expect(extended.toFixed2()).toBe('59.97');
  });

  it('computes a percentage-off discount exactly, keeping full scale', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const rate = Money.fromDecimalString('12.5').dividedBy('100');
    const discount = extended.times(rate);

    expect(rate.equals(Money.fromDecimalString('0.125'))).toBe(true);
    expect(discount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
  });

  it('subtracts the discount from the extended amount with no IEEE-754 drift', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy('100'));
    const net = extended.minus(discount);

    // 1. The correct decimal result.
    expect(net.equals(Money.fromDecimalString('52.47375'))).toBe(true);

    // 2. NOT the drifted double - the assertion proving decimal fidelity.
    //    52.473749999999995 is seventeen significant digits, well inside the
    //    substrate's declared twenty, so the inequality is meaningful.
    expect(net.equals(Money.fromDecimalString('52.473749999999995'))).toBe(false);

    // 3. NOT the two-decimal presentation. This proves no operation rounded to
    //    two decimals internally, and it is the only discriminator that works:
    //    had every step been rounded to 2 dp, `59.97 - 7.50` would also be
    //    52.47, so `toFixed2` could not tell the two implementations apart.
    expect(net.equals(Money.fromDecimalString('52.47'))).toBe(false);

    expect(net.compare(Money.fromDecimalString('52.47375'))).toBe(0);
  });

  it('presents the net amount as the legacy two-decimal mask does', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy('100'));
    const net = extended.minus(discount);

    expect(net.toFixed2()).toBe('52.47');
    expect(typeof net.toFixed2()).toBe('string');
  });

  it('keeps the full-scale discount while presenting it rounded', () => {
    const extended = Money.fromDecimalString('19.99').times('3');
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy('100'));

    // Presentation and value are separate concerns: the discount PRESENTS as
    //    '7.50' while the value used in the subtraction remains 7.49625. Had
    //    `times` rounded, the net would have been 52.47 rather than 52.47375.
    expect(discount.toFixed2()).toBe('7.50');
    expect(discount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
    expect(extended.minus(discount).equals(Money.fromDecimalString('52.47375'))).toBe(true);
  });

  it('exposes the full-scale value through exactly one named accessor', () => {
    // The full-precision egress is `toDecimalString()`, the ONE way the held value leaves this
    // class unrounded. It exists because the `big_decimal` columns enumerated below store every
    // digit and the `Sw*` schema is preserved unchanged (AAP 0.8.1). The library's own
    // scale-imposing and precision-imposing renderers stay absent: this is an egress, not a
    // formatting surface.
    const net = Money.fromDecimalString('52.47375');

    expect(net.toDecimalString()).toBe('52.47375');
    expect(net.toFixed2()).toBe('52.47');
    expect('toFixed' in net).toBe(false);
    expect('toPrecision' in net).toBe(false);
    expect('toSignificantDigits' in net).toBe(false);
    expect('toDecimalPlaces' in net).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Construction
//
// The primary path is a decimal STRING because that is how monetary values arrive: `big_decimal`
// columns come back from the driver in decimal string form, and four such columns are read and
// written through `Money` - [model/entity/PromotionApplied.cfc:L53] `discountAmount`, and
// [model/entity/SkuCurrency.cfc:L53, L54, L55] `price`, `renewalPrice` and `listPrice`, where
// `price` carries NO default while the other two default to "0". The target equivalent of
// `roundValue` also returns a decimal string, because [model/service/RoundingRuleService.cfc:L88]
// declares `returntype="string"`.
// ---------------------------------------------------------------------------

describe('construction from a decimal string', () => {
  it('builds a value from a plain decimal numeral', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.toFixed2()).toBe('19.99');
    expect(price.equals(Money.fromDecimalString('19.99'))).toBe(true);
  });

  it('accepts a whole number, a leading-dot fraction and an explicit zero', () => {
    expect(Money.fromDecimalString('12').toFixed2()).toBe('12.00');
    expect(Money.fromDecimalString('.42').toFixed2()).toBe('0.42');
    expect(Money.fromDecimalString('0').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('0.00').toFixed2()).toBe('0.00');
  });

  it('preserves every significant digit a big_decimal column arrives with', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L53]: `property
    //   name="discountAmount" ormtype="big_decimal";`. A column's string form
    //   must round-trip with no loss, so a value at more than two-decimal scale
    //   is held at its own scale and only PRESENTED at two.
    const persisted = Money.fromDecimalString('7.49625');

    expect(persisted.equals(Money.fromDecimalString('7.49625'))).toBe(true);
    expect(persisted.equals(Money.fromDecimalString('7.50'))).toBe(false);
    expect(persisted.toFixed2()).toBe('7.50');
  });

  it('is currency-agnostic', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L53, L55]: `discountAmount`
    //   (`ormtype="big_decimal"`) and `currencyCode` (`ormtype="string"
    //   length="3"`) are SEPARATE columns and the legacy arithmetic carries no
    //   currency operand at all. So `Money` takes no currency and holds none: the
    //   currency a value is denominated in is carried by the surrounding entity,
    //   and two values are equal on their amount alone.
    expect(Money.fromDecimalString('19.99').equals(Money.fromDecimalString('19.99'))).toBe(true);
  });
});

describe('rejection at construction', () => {
  // JUDGMENT CALL: silent coercion to zero is the failure mode that would sell products for free,
  // so every malformed input must fail loudly. The set below is asserted case by case rather than
  // sampled, because each entry is a shape a real caller could hand over - a blank column, a free
  // text field, a grouped or currency-prefixed presentation string, or a non-finite spelling.

  it('rejects the empty string', () => {
    expect(captureFailure(() => Money.fromDecimalString('')).name).toBe('CfmlNumberFormatError');
  });

  it('rejects the non-finite spellings NaN, Infinity and -Infinity', () => {
    // JUDGMENT CALL: these are asserted as STRINGS because the parameter is a `string`, so the
    // numeric `NaN`, `Infinity` and `-Infinity` cannot even be written at the call site - a
    // stronger guarantee than a runtime throw. The string spellings are the reachable hazard, and
    // the decimal library accepts them on its own.
    expect(captureFailure(() => Money.fromDecimalString('NaN')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => Money.fromDecimalString('Infinity')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('-Infinity')).name).toBe(
      'CfmlNumberFormatError',
    );
  });

  it('rejects non-numeric text', () => {
    expect(captureFailure(() => Money.fromDecimalString('test')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('abc')).name).toBe('CfmlNumberFormatError');
  });

  it('rejects malformed and decorated numerals', () => {
    expect(captureFailure(() => Money.fromDecimalString('12.3.4')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('$19.99')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('1,234.50')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => Money.fromDecimalString('12.')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => Money.fromDecimalString('1e5')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => Money.fromDecimalString(' 12.5 ')).name).toBe(
      'CfmlNumberFormatError',
    );
  });

  it('reports the offending value without inventing a fallback', () => {
    const failure = captureFailure(() => Money.fromDecimalString('abc'));

    expect(failure.message).toContain('abc');
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it('rejects a malformed operand handed to an operation, not just to the factory', () => {
    // A malformed numeral must fail AT the operation rather than propagating as a corrupted amount,
    // so every operand crossing is validated.
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.minus('abc')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.plus('')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.times('12.')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.dividedBy('1,000')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.compare('oops')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.equals('NaN')).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => price.isGreaterThan('Infinity')).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => price.isLessThan('$1')).name).toBe('CfmlNumberFormatError');
  });

  // JUDGMENT CALL: the `string` parameter is a compile-time guarantee and a real one - the numeric
  // `NaN`, `Infinity` and `-Infinity` genuinely cannot be written at any call site above, which is
  // why they are asserted in their string spellings. It is not, however, the WHOLE guarantee. The
  // annotation is erased before anything executes, and this factory is reachable from untyped
  // JavaScript, from a decoded request body, and from an `as` cast made in another file. The
  // documented contract on the factory says the value is "never a `number`", and a documented
  // contract that only the compiler enforces is not enforced on the boundary the port actually runs
  // on. The widened alias below models that caller so the run-time half is pinned too; it goes
  // through `unknown` exactly as `ownState` above does, so no `any` and no suppression comment
  // enters this file. The factory is invoked as a member of its class rather than detached from it,
  // so the widening is confined to the argument and nothing about the call itself changes.
  const fromRuntimeValue = (candidate: unknown): Money =>
    Money.fromDecimalString(candidate as string);

  it('rejects a raw number at run time, upholding the "never a number" contract', () => {
    expect(captureFailure(() => fromRuntimeValue(12.5)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(0)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(-3)).name).toBe('CfmlNumberFormatError');

    // The decisive case: a double that already carries drift. Admitting it would place the precise
    // hazard this value object exists to exclude inside the value object itself.
    expect(captureFailure(() => fromRuntimeValue(1.0000000000000002)).name).toBe(
      'CfmlNumberFormatError',
    );

    // The failure is this port's own typed error, not a stray one from the substrate, so a caller
    // can still tell a malformed input apart from any other failure - and it names what arrived.
    expect(captureFailure(() => fromRuntimeValue(12.5)).message).toContain('12.5');
  });

  it('rejects every other non-string shape handed over at run time', () => {
    // A single-element array and an object with a numeral-shaped `toString` are the sharp pair:
    // neither carries a usable `length`, both stringify to `'12.5'`, and the validating pattern is
    // applied with `RegExp.prototype.test`, which coerces its argument. Both therefore satisfied the
    // pattern and came back as a constructed `Money` wrapping a value that was not a string at all.
    expect(captureFailure(() => fromRuntimeValue(['12.5'])).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue({ toString: () => '12.5' })).name).toBe(
      'CfmlNumberFormatError',
    );
    expect(captureFailure(() => fromRuntimeValue(true)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(null)).name).toBe('CfmlNumberFormatError');
    expect(captureFailure(() => fromRuntimeValue(undefined)).name).toBe('CfmlNumberFormatError');
  });

  it('leaves every valid numeral admissible, so nothing was over-refused', () => {
    // What is refused is a SHAPE, never a value: the string spelling of each number refused above
    // still constructs and still presents exactly as before.
    expect(Money.fromDecimalString('12.5').toFixed2()).toBe('12.50');
    expect(Money.fromDecimalString('0').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('-3').toFixed2()).toBe('-3.00');
    expect(Money.fromDecimalString('1.0000000000000002').toFixed2()).toBe('1.00');

    // JUDGMENT CALL: the refusal belongs to the decimal-string factory alone and must not spill
    // into the operand path, where a non-monetary integer is admitted deliberately and travels a
    // separate branch that never reaches the string validator. That branch is pinned in full
    // further down, where `times(3)` succeeds and `times(0.125)` fails loudly.
  });
});

describe('a negative amount remains representable', () => {
  // CFML parity [meta/tests/unit/IssuesTest.cfc:L110, L126]: a negative amount is
  //   rejected by the VALIDATION layer, never by the money primitive.
  //   `issue_1335` (declared at L110) sets `skuCurrency.setPrice(-20)` and
  //   `skuCurrency.setListPrice('test')`, then asserts that BOTH produce a
  //   validation error and that neither is a `_missing` error; `issue_1348`
  //   (declared at L126) does the same for `sku.setPrice(-20)`. Both are about
  //   `validate(context="save")` rather than arithmetic, so this file does NOT
  //   assert that a negative amount throws. Note the asymmetry: a NON-NUMERIC
  //   string must fail at construction, asserted above, while a NEGATIVE numeral
  //   must not.

  it('constructs and presents a negative intermediate', () => {
    // A negative intermediate is real rather than hypothetical: the rounding search at
    // [model/service/RoundingRuleService.cfc:L123-L130] subtracts and then flips the sign when the
    // result is negative, and -0.58 arises there.
    const negative = Money.fromDecimalString('-0.58');

    expect(negative.toFixed2()).toBe('-0.58');
    expect(negative.isLessThan(Money.zero)).toBe(true);
  });

  it('produces a negative result from a subtraction rather than clamping at zero', () => {
    const result = Money.fromDecimalString('7.42').minus('9.99');

    expect(result.toFixed2()).toBe('-2.57');
    expect(result.isLessThan(Money.zero)).toBe(true);
    expect(result.equals(Money.zero)).toBe(false);
  });

  it('accepts a negative leading-dot numeral', () => {
    expect(Money.fromDecimalString('-.99').toFixed2()).toBe('-0.99');
  });
});

describe('times', () => {
  // CFML parity [model/service/PromotionService.cfc:L990]:
  //   `precisionEvaluate('arguments.price * arguments.quantity')` - a x b.
  // CFML parity [model/service/PromotionService.cfc:L995]:
  //   `precisionEvaluate('originalAmount * (reward.getAmount()/100)')` -
  //   a x (b / 100).
  // CFML parity [model/service/PromotionService.cfc:L1001]: the
  //   `(arguments.price - reward.getAmount()) * arguments.quantity` product.
  // CFML parity [model/service/PromotionService.cfc:L150]: the sale-price seed
  //   multiplies both the sku price and the sale price by
  //   `orderItem.getQuantity()` - (a x b) - (c x b).
  // CFML parity [model/service/PromotionService.cfc:L486]: the over-use strip
  //   scales `discountAmount / thisDiscountQuantity` by
  //   `(thisDiscountQuantity - needToRemove)` - (a / b) x (b - c).
  // CFML parity [model/service/PriceGroupService.cfc:L323]: the inner
  //   `arguments.sku.getPrice() * (arguments.priceGroupRate.getAmount() / 100)`
  //   term, published as L322 - literally `case "percentageOff" :`.

  it('multiplies a whole amount by a whole count', () => {
    expect(Money.fromDecimalString('19').times('3').equals(Money.fromDecimalString('57'))).toBe(
      true,
    );
  });

  it('multiplies two decimal operands without drift', () => {
    // `0.1 * 0.2` as IEEE-754 doubles yields 0.020000000000000004; measured. The decimal result is
    // exactly 0.02.
    const product = Money.fromDecimalString('0.1').times('0.2');

    expect(product.equals(Money.fromDecimalString('0.02'))).toBe(true);
    expect(product.equals(Money.fromDecimalString('0.020000000000000004'))).toBe(false);
  });

  it('treats one as an identity', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.times('1').equals(price)).toBe(true);
  });

  it('collapses to zero when multiplied by zero', () => {
    expect(Money.fromDecimalString('19.99').times('0').equals(Money.zero)).toBe(true);
  });

  it('handles every sign combination', () => {
    expect(Money.fromDecimalString('19.99').times('-1').toFixed2()).toBe('-19.99');
    expect(Money.fromDecimalString('-19.99').times('-1').toFixed2()).toBe('19.99');
    expect(Money.fromDecimalString('-19.99').times('2').toFixed2()).toBe('-39.98');
  });

  it('keeps a high-scale product exact where a float would drift', () => {
    // Six decimals from two three-decimal operands. `1.005 * 2.015` as doubles yields
    // 2.0250749999999997; the decimal result is 2.025075.
    const product = Money.fromDecimalString('1.005').times('2.015');

    expect(product.equals(Money.fromDecimalString('2.025075'))).toBe(true);
    expect(product.equals(Money.fromDecimalString('2.0250749999999997'))).toBe(false);
    expect(product.toFixed2()).toBe('2.03');
  });

  it('composes the (a x b) - (c x b) sale-price shape', () => {
    // CFML parity [model/service/PromotionService.cfc:L150]: 19.99 list against
    //   17.49 sale over a quantity of 3.
    const listExtended = Money.fromDecimalString('19.99').times('3');
    const saleExtended = Money.fromDecimalString('17.49').times('3');

    expect(listExtended.minus(saleExtended).toFixed2()).toBe('7.50');
  });
});

describe('dividedBy', () => {
  // CFML parity [model/service/PromotionService.cfc:L299]:
  //   `precisionEvaluate('discountAmount / discountQuantity')` - the
  //   discount-per-use value the reward-usage ledger insert-sorts on.
  // CFML parity [model/service/PromotionService.cfc:L995]: the
  //   `(reward.getAmount()/100)` term - division by the literal 100.
  // CFML parity [model/service/PromotionService.cfc:L486]: the leading
  //   `discountAmount / thisDiscountQuantity` term.
  // CFML parity [model/service/PriceGroupService.cfc:L323]: the
  //   `(arguments.priceGroupRate.getAmount() / 100)` term, published as L322.

  it('divides a percentage by one hundred exactly', () => {
    const rate = Money.fromDecimalString('12.5').dividedBy('100');

    expect(rate.equals(Money.fromDecimalString('0.125'))).toBe(true);
    // 0.125 presents as '0.13' under half-up rounding, which is exactly why the rate is never
    // presented mid-calculation.
    expect(rate.toFixed2()).toBe('0.13');
  });

  it('computes a discount-per-use value', () => {
    // CFML parity [model/service/PromotionService.cfc:L299]: a 7.50 discount
    //   spread across a quantity of 3 is 2.50 per use.
    expect(Money.fromDecimalString('7.50').dividedBy('3').toFixed2()).toBe('2.50');
  });

  it('resolves a non-terminating quotient at the substrate declared scale', () => {
    // JUDGMENT CALL: the expected value is asserted BY VALUE against the shipped result's own
    // scale, measured under the pinned toolchain rather than typed by hand. The substrate declares
    // twenty significant digits, so `1 / 3` resolves at that scale rather than throwing or
    // truncating.
    const third = Money.fromDecimalString('1').dividedBy('3');

    expect(third.equals(Money.fromDecimalString('0.33333333333333333333'))).toBe(true);
    expect(third.toFixed2()).toBe('0.33');
  });

  it('divides negative operands', () => {
    expect(Money.fromDecimalString('-7.50').dividedBy('3').toFixed2()).toBe('-2.50');
    expect(Money.fromDecimalString('7.50').dividedBy('-3').toFixed2()).toBe('-2.50');
  });
});

describe('minus', () => {
  // CFML parity [model/service/PromotionService.cfc:L150]: the outer subtraction
  //   of (a x b) - (c x b).
  // CFML parity [model/service/PromotionService.cfc:L252]:
  //   `precisionEvaluate('originalDiscountAmount -
  //   (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())')` -
  //   a - (b - c). Published as L248, which is a comment; the call is on L252.
  // CFML parity [model/service/PromotionService.cfc:L1001]: the
  //   `(arguments.price - reward.getAmount())` term of (a - b) x c.
  // CFML parity [model/service/PromotionService.cfc:L1006]: the NET PRICE
  //   `originalAmount - discountAmountPreRounding` handed to the rounding rule.
  //   Omitted from the published list.
  // CFML parity [model/service/PromotionService.cfc:L1007]: the discount derived
  //   back out as the residual `originalAmount - roundedFinalAmount`.
  // CFML parity [model/service/PriceGroupService.cfc:L323]: the outer subtraction
  //   of a - (a x (b / 100)).
  // CFML parity [model/service/PriceGroupService.cfc:L331]: the plain a - b of
  //   the amount-off rate, `arguments.sku.getPrice() -
  //   arguments.priceGroupRate.getAmount()`. Published as L328, a closing brace.

  it('subtracts to a positive result', () => {
    expect(Money.fromDecimalString('59.97').minus('7.50').toFixed2()).toBe('52.47');
  });

  it('subtracts to exactly zero', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.minus(price).equals(Money.zero)).toBe(true);
    expect(price.minus('19.99').toFixed2()).toBe('0.00');
  });

  it('subtracts to a negative result without clamping', () => {
    expect(Money.fromDecimalString('19.99').minus('29.99').toFixed2()).toBe('-10.00');
  });

  it('subtracts the drift-sensitive reference operands exactly', () => {
    // `59.97 - 7.49625` as IEEE-754 doubles yields 52.473749999999995; measured.
    const net = Money.fromDecimalString('59.97').minus('7.49625');

    expect(net.equals(Money.fromDecimalString('52.47375'))).toBe(true);
    expect(net.equals(Money.fromDecimalString('52.473749999999995'))).toBe(false);
  });

  it('composes the a - (b - c) price-group adjustment shape', () => {
    // CFML parity [model/service/PromotionService.cfc:L252]: a 10.00 discount
    //   less the 7.50 price-group saving the item already receives nets 2.50.
    const alreadySaved = Money.fromDecimalString('59.97').minus('52.47');

    expect(Money.fromDecimalString('10.00').minus(alreadySaved).toFixed2()).toBe('2.50');
  });

  it('composes the a - (a x (b / 100)) percentage-off rate shape', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L323]: `19.99 - (19.99 *
    //   0.125)` as doubles yields 17.491249999999997; measured. The decimal
    //   result is 17.49125.
    const price = Money.fromDecimalString('19.99');
    const reduced = price.minus(price.times(Money.fromDecimalString('12.5').dividedBy('100')));

    expect(reduced.equals(Money.fromDecimalString('17.49125'))).toBe(true);
    expect(reduced.equals(Money.fromDecimalString('17.491249999999997'))).toBe(false);
    expect(reduced.toFixed2()).toBe('17.49');
  });
});

describe('plus', () => {
  // CFML parity [model/service/PromotionService.cfc:L417]: `var
  //   totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts()
  //   + arguments.order.getFulfillmentChargeAfterDiscountTotal();`
  //
  //   THAT LINE IS THE ONLY JUSTIFICATION FOR THIS OPERATION - the single addition
  //   of two monetary values in the whole in-scope slice, and it carries NO
  //   `precisionEvaluate` wrapper. Routing it through `Money` applies the single
  //   arithmetic surface uniformly rather than reproducing that omission. The
  //   variable is `totalDiscountableAmount`, not the published
  //   `orderDiscountableAmount`.

  it('adds two monetary values', () => {
    const subtotalAfterItemDiscounts = Money.fromDecimalString('52.47');
    const fulfillmentChargeAfterDiscountTotal = Money.fromDecimalString('7.53');

    expect(subtotalAfterItemDiscounts.plus(fulfillmentChargeAfterDiscountTotal).toFixed2()).toBe(
      '60.00',
    );
  });

  it('adds without the drift a plain float addition would introduce', () => {
    // `0.1 + 0.2` as doubles yields 0.30000000000000004 - the exact hazard the unguarded legacy `+`
    // at L417 carries.
    const sum = Money.fromDecimalString('0.1').plus('0.2');

    expect(sum.equals(Money.fromDecimalString('0.3'))).toBe(true);
    expect(sum.equals(Money.fromDecimalString('0.30000000000000004'))).toBe(false);
  });

  it('treats zero as an identity and accepts a negative addend', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.plus(Money.zero).equals(price)).toBe(true);
    expect(price.plus('-19.99').equals(Money.zero)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Comparison
//
// Every comparison is BY DECIMAL VALUE and applies no rounding, which is load-bearing rather than
// pedantic: the promotion engine insert-sorts on these results in two OPPOSITE directions at once,
// so a comparison that quietly rounded to two decimals would collapse distinct values into ties and
// change which discount a customer receives. `orderItemQulifiedDiscounts` sorts DESCENDING by
// discount amount [model/service/PromotionService.cfc:L271] and only the largest is applied;
// `orderItemsUsage` sorts ASCENDING by discount-per-use value
// [model/service/PromotionService.cfc:L306], so the cheapest-per-use entries are stripped first.
// ---------------------------------------------------------------------------

describe('compare', () => {
  it('returns exactly -1, 0 and 1', () => {
    // The literal values are asserted, not merely their truthiness: the two insertion sorts branch
    // on the sign.
    const smaller = Money.fromDecimalString('12.35');
    const larger = Money.fromDecimalString('19.99');

    expect(smaller.compare(larger)).toBe(-1);
    expect(larger.compare(smaller)).toBe(1);
    expect(smaller.compare(Money.fromDecimalString('12.35'))).toBe(0);
  });

  it('compares by value and not lexically', () => {
    // A lexical comparison would call '9.99' greater than '12.35', and both answers would change
    // money, so this is the discriminating case.
    const nineNinetyNine = Money.fromDecimalString('9.99');
    const twelveThirtyFive = Money.fromDecimalString('12.35');

    expect(nineNinetyNine.compare(twelveThirtyFive)).toBe(-1);
    expect(twelveThirtyFive.compare(nineNinetyNine)).toBe(1);
  });

  it('orders negative values correctly', () => {
    expect(Money.fromDecimalString('-2.57').compare(Money.zero)).toBe(-1);
    expect(Money.zero.compare(Money.fromDecimalString('-2.57'))).toBe(1);
    expect(Money.fromDecimalString('-9.99').compare(Money.fromDecimalString('-2.57'))).toBe(-1);
  });
});

describe('isGreaterThan and isLessThan', () => {
  // CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount >
  //   0)` - the gate deciding whether a computed discount is recorded at all.
  // CFML parity [model/service/PromotionService.cfc:L148]:
  //   `salePriceDetails.salePrice < orderItem.getSku().getPrice()` - a sale price
  //   seeds a discount only when STRICTLY below the sku's own price.
  // CFML parity [model/service/PromotionService.cfc:L1013]:
  //   `if(discountAmountPreRounding > originalAmount)` - the clamp stopping a
  //   discount from exceeding the original amount. It compares the PRE-rounding
  //   value while overwriting the POST-rounding one; reproducing that is owned by
  //   `src/services` and carries no marker here. It is named because a service
  //   cannot reproduce a defect faithfully if its comparison normalises operands.

  it('is strict in both directions', () => {
    const smaller = Money.fromDecimalString('12.35');
    const larger = Money.fromDecimalString('19.99');

    expect(larger.isGreaterThan(smaller)).toBe(true);
    expect(smaller.isGreaterThan(larger)).toBe(false);
    expect(smaller.isLessThan(larger)).toBe(true);
    expect(larger.isLessThan(smaller)).toBe(false);
  });

  it('is false in both directions at equality', () => {
    const price = Money.fromDecimalString('19.99');
    const same = Money.fromDecimalString('19.99');

    expect(price.isGreaterThan(same)).toBe(false);
    expect(price.isLessThan(same)).toBe(false);
    expect(price.equals(same)).toBe(true);
  });

  it('gates a computed discount above zero', () => {
    // CFML parity [model/service/PromotionService.cfc:L257]: using `zero` as a
    //   COMPARAND is legitimate; returning it as a fallback is not.
    expect(Money.fromDecimalString('7.50').isGreaterThan(Money.zero)).toBe(true);
    expect(Money.zero.isGreaterThan(Money.zero)).toBe(false);
    expect(Money.fromDecimalString('-2.57').isGreaterThan(Money.zero)).toBe(false);
  });

  it('seeds a sale price only when strictly below the list price', () => {
    // CFML parity [model/service/PromotionService.cfc:L148]: at equality the
    //   legacy gate does NOT fire, so no discount is seeded.
    const listPrice = Money.fromDecimalString('19.99');

    expect(Money.fromDecimalString('17.49').isLessThan(listPrice)).toBe(true);
    expect(Money.fromDecimalString('19.99').isLessThan(listPrice)).toBe(false);
    expect(Money.fromDecimalString('21.99').isLessThan(listPrice)).toBe(false);
  });
});

describe('equals', () => {
  it('compares by value across two distinct instances', () => {
    const first = Money.fromDecimalString('52.47');
    const second = Money.fromDecimalString('52.47');

    // Value semantics, never reference identity: two separately constructed instances holding the
    // same amount are equal.
    expect(first.equals(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('ignores trailing-zero scale, which differs between the two strings', () => {
    // '52.47' and '52.470' are DIFFERENT strings and the SAME value, which is why equality is by
    // value.
    expect(Money.fromDecimalString('52.47').equals(Money.fromDecimalString('52.470'))).toBe(true);
    expect(Money.fromDecimalString('19.90').equals(Money.fromDecimalString('19.9'))).toBe(true);
    expect(Money.fromDecimalString('0').equals(Money.fromDecimalString('0.00'))).toBe(true);
  });

  it('accepts a decimal-string operand as well as another Money', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.equals('19.99')).toBe(true);
    expect(price.equals('19.990')).toBe(true);
    expect(price.equals('19.98')).toBe(false);
  });

  it('distinguishes values that differ beyond the second decimal', () => {
    // Two amounts that PRESENT identically at two decimals are still distinct.
    const full = Money.fromDecimalString('52.47375');

    expect(full.equals(Money.fromDecimalString('52.47'))).toBe(false);
    expect(full.toFixed2()).toBe(Money.fromDecimalString('52.47').toFixed2());
  });
});

// ---------------------------------------------------------------------------
// toFixed2 - A PRESENTATION STEP, NOT A ROUNDING POLICY
//
// CFML parity [model/service/PromotionService.cfc:L1017]: `return
//   numberFormat(discountAmount, "0.00");` - the LAST line of
//   `getDiscountAmount`.
// CFML parity [model/service/PriceGroupService.cfc:L339]: `return
//   numberFormat(newPrice, "0.00");` - the LAST line of
//   `calculateSkuPriceBasedOnPriceGroupRate`. Published as L337.
// CFML parity [model/service/RoundingRuleService.cfc:L89]: `var inputValue =
//   numberFormat(arguments.value, "0.00");` - the FIRST line of the rounding
//   algorithm, normalising the input before the string arithmetic begins.
//
// Both returning call sites sit at the very END of their functions: a caller must ASK for two
// decimals, and no arithmetic operation applies them.
//
// JUDGMENT CALL: the ten measured `roundValue` characterization rows are deliberately NOT
// duplicated here. They are the acceptance gate for the rounding algorithm, which owns the rounding
// expression and direction.
// ---------------------------------------------------------------------------

describe('toFixed2', () => {
  it('always presents exactly two decimals, zero-padded', () => {
    expect(Money.fromDecimalString('12').toFixed2()).toBe('12.00');
    expect(Money.fromDecimalString('12.3').toFixed2()).toBe('12.30');
    expect(Money.fromDecimalString('12.34').toFixed2()).toBe('12.34');
  });

  it('always emits at least one integer digit', () => {
    // Load-bearing downstream: the rounding algorithm slices a prefix off this string, so '.42'
    // instead of '0.42' would slice at the wrong offset.
    expect(Money.fromDecimalString('0.42').toFixed2()).toBe('0.42');
    expect(Money.fromDecimalString('.42').toFixed2()).toBe('0.42');
    expect(Money.fromDecimalString('0.42').toFixed2().startsWith('.')).toBe(false);
  });

  it('never emits a thousands separator', () => {
    // CFML's "0.00" mask yields "1234.50", never "1,234.50".
    const presented = Money.fromDecimalString('1234.5').toFixed2();

    expect(presented).toBe('1234.50');
    expect(presented).not.toContain(',');
  });

  it('never emits exponential notation, at either magnitude extreme', () => {
    const large = Money.fromDecimalString('1000000000000000000000').toFixed2();
    const small = Money.fromDecimalString('0.000000001').toFixed2();

    expect(large).toBe('1000000000000000000000.00');
    expect(large).not.toContain('e');
    expect(large).not.toContain('E');
    expect(small).toBe('0.00');
    expect(small).not.toContain('e');
    expect(small).not.toContain('E');
  });

  it('preserves a leading minus with no accounting notation', () => {
    const presented = Money.fromDecimalString('-0.58').toFixed2();

    expect(presented).toBe('-0.58');
    expect(presented.startsWith('-')).toBe(true);
    expect(presented.endsWith('-')).toBe(false);
    expect(presented).not.toContain('(');
  });

  it('rounds half up', () => {
    expect(Money.fromDecimalString('0.005').toFixed2()).toBe('0.01');
    expect(Money.fromDecimalString('2.345').toFixed2()).toBe('2.35');
    expect(Money.fromDecimalString('12.3456').toFixed2()).toBe('12.35');
    expect(Money.fromDecimalString('2.344').toFixed2()).toBe('2.34');
  });

  it('rounds a negative half away from zero', () => {
    // JUDGMENT CALL: asserted only after confirming the shipped behaviour - half-up in the pinned
    // library rounds AWAY FROM ZERO when the value is equidistant.
    expect(Money.fromDecimalString('-2.345').toFixed2()).toBe('-2.35');
    expect(Money.fromDecimalString('-0.005').toFixed2()).toBe('-0.01');
  });

  it('normalises a negative zero presentation', () => {
    // A value rounding to zero at two decimals but not itself zero would otherwise keep its sign,
    // and a negative-zero price is indefensible.
    expect(Money.fromDecimalString('-0.001').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('-0').toFixed2()).toBe('0.00');
    expect(Money.fromDecimalString('-0.001').toFixed2()).not.toBe('-0.00');
  });

  it('returns a string and never a number', () => {
    const presented = Money.fromDecimalString('19.99').toFixed2();

    expect(typeof presented).toBe('string');
    expect(typeof presented).not.toBe('number');

    expect(presented).toBe('19.99');
  });

  it('does not round the value it presents', () => {
    // The same instance is presented twice with an arithmetic step between; the arithmetic sees
    // full scale both times.
    const full = Money.fromDecimalString('52.47375');

    expect(full.toFixed2()).toBe('52.47');
    expect(full.minus('0.00375').equals(Money.fromDecimalString('52.47'))).toBe(true);
    expect(full.equals(Money.fromDecimalString('52.47'))).toBe(false);
    expect(full.toFixed2()).toBe('52.47');
  });
});

// ---------------------------------------------------------------------------
// PERSISTENCE, WHICH IS NOT PRESENTATION
//
// `toFixed2` ROUNDS to two decimals because it reproduces CFML's `"0.00"` mask, while
// `toDecimalString` imposes NO scale because the columns it feeds are declared `big_decimal`. Four
// such columns are read and written through `Money`: `SwPromotionApplied.discountAmount`
// [model/entity/PromotionApplied.cfc:L53], `SwPriceGroupRate.amount`
// [model/entity/PriceGroupRate.cfc:L54], and `SwSkuCurrency.price` with its list and renewal
// siblings [model/entity/SkuCurrency.cfc:L53]. The `Sw*` schema is preserved unchanged (AAP 0.8.1)
// and a `big_decimal` column declines to round, so persisting through the presentation method would
// NARROW the schema.
// ---------------------------------------------------------------------------

describe('toDecimalString', () => {
  it('persists every digit the value carries, where presentation would round', () => {
    // The reference calculation's net amount, and the whole point of the method.
    const net = Money.fromDecimalString('52.47375');

    expect(net.toDecimalString()).toBe('52.47375');
    expect(net.toFixed2()).toBe('52.47');
    expect(net.toDecimalString()).not.toBe(net.toFixed2());
  });

  it('round-trips through construction, value-stably', () => {
    // The property that makes a database round trip safe: whatever this method emits,
    // `fromDecimalString` accepts, and the reconstructed value is EQUAL to the original. Value
    // stability, not character stability - the numeral is canonicalised, as the next two cases
    // show.
    for (const stored of ['52.47375', '0', '0.00', '19.90', '-0.58', '7.49625', '1234.5', '.42']) {
      const original = Money.fromDecimalString(stored);
      const reloaded = Money.fromDecimalString(original.toDecimalString());

      expect(reloaded.equals(original)).toBe(true);
      // Serialising the reloaded value is idempotent: a second trip cannot drift.
      expect(reloaded.toDecimalString()).toBe(original.toDecimalString());
    }
  });

  it('emits the same numeral for any two values that compare equal', () => {
    // The value-object guarantee this method is canonicalised to keep: if these diverged,
    // persistence would record a distinction that `equals` denies.
    const spelledWithTrailingZero = Money.fromDecimalString('19.90');
    const computed = Money.fromDecimalString('19.90').times(1);
    const spelledShort = Money.fromDecimalString('19.9');

    expect(spelledWithTrailingZero.equals(computed)).toBe(true);
    expect(spelledWithTrailingZero.equals(spelledShort)).toBe(true);
    expect(spelledWithTrailingZero.toDecimalString()).toBe(computed.toDecimalString());
    expect(spelledWithTrailingZero.toDecimalString()).toBe(spelledShort.toDecimalString());
    expect(spelledWithTrailingZero.toDecimalString()).toBe('19.9');

    expect(Money.fromDecimalString('0.00').toDecimalString()).toBe('0');
    expect(Money.fromDecimalString('-0').toDecimalString()).toBe('0');
    expect(Money.zero.toDecimalString()).toBe('0');
  });

  it('does not depend on how the value was spelled on the way in', () => {
    // The leading-dot form is accepted at construction, so the stored numeral can legitimately be
    // '.42'; canonicalisation is what stops that spelling reaching a column and breaking the
    // integer-digit guarantee.
    expect(Money.fromDecimalString('.42').toDecimalString()).toBe('0.42');
    expect(Money.fromDecimalString('-.99').toDecimalString()).toBe('-0.99');
    expect(Money.fromDecimalString('.42').toDecimalString()).toBe(
      Money.fromDecimalString('0.42').toDecimalString(),
    );
  });

  it('carries a MySQL DECIMAL(65,s) value without loss', () => {
    // The widest operand the schema can hold - 65 significant digits.
    const widest = `${'9'.repeat(45)}.${'9'.repeat(20)}`;

    expect(widest.replace('.', '')).toHaveLength(65);
    expect(Money.fromDecimalString(widest).toDecimalString()).toBe(widest);
  });

  it('preserves a computed sub-cent result through an arithmetic chain', () => {
    const extended = Money.fromDecimalString('19.99').times(3);
    const discount = extended.times(Money.fromDecimalString('12.5').dividedBy(100));

    expect(extended.toDecimalString()).toBe('59.97');
    expect(discount.toDecimalString()).toBe('7.49625');
    expect(extended.minus(discount).toDecimalString()).toBe('52.47375');
  });

  it('never emits exponential notation, at either magnitude extreme', () => {
    const large = Money.fromDecimalString('1000000000000000000000').toDecimalString();
    const small = Money.fromDecimalString('0.000000001').toDecimalString();

    expect(large).toBe('1000000000000000000000');
    expect(large).not.toContain('e');
    expect(large).not.toContain('E');
    expect(small).toBe('0.000000001');
    expect(small).not.toContain('e');
    expect(small).not.toContain('E');
  });

  it('never emits a thousands separator and always emits an integer digit', () => {
    expect(Money.fromDecimalString('1234.5').toDecimalString()).toBe('1234.5');
    expect(Money.fromDecimalString('1234.5').toDecimalString()).not.toContain(',');
    // The same leading-digit guarantee presentation makes, held by canonicalisation rather than by
    // the mask.
    expect(Money.fromDecimalString('.42').toDecimalString().startsWith('.')).toBe(false);
    expect(Money.fromDecimalString('-.99').toDecimalString().startsWith('-.')).toBe(false);
  });

  it('preserves a leading minus with no accounting notation', () => {
    const persisted = Money.fromDecimalString('-0.58').toDecimalString();

    expect(persisted).toBe('-0.58');
    expect(persisted.startsWith('-')).toBe(true);
    expect(persisted).not.toContain('(');
  });

  it('imposes no scale of its own, in either direction', () => {
    // Canonicalisation is NOT rounding and NOT padding: it normalises the numeral to the value's
    // natural scale and stops there.
    expect(Money.fromDecimalString('52.47375').toDecimalString()).toBe('52.47375');
    expect(Money.fromDecimalString('0.000000000000000001').toDecimalString()).toBe(
      '0.000000000000000001',
    );
    expect(Money.fromDecimalString('12').toDecimalString()).toBe('12');

    expect(Money.fromDecimalString('12').toFixed2()).toBe('12.00');
    expect(Money.fromDecimalString('52.47375').toFixed2()).toBe('52.47');
  });

  it('returns a string and never a number', () => {
    const persisted = Money.fromDecimalString('19.99').toDecimalString();

    expect(typeof persisted).toBe('string');
    expect(typeof persisted).not.toBe('number');
  });

  it('is not reachable by implicit coercion', () => {
    // Persistence must be an explicitly named call, exactly like presentation. None of the three
    // coercion hooks is declared, so a stray template literal, `+` or `JSON.stringify` cannot
    // quietly produce an authoritative numeral.
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'valueOf')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toJSON')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE OPERATION SURFACE IS CLOSED
//
// Asserting what is ABSENT is part of the contract, not defensive garnish. Every member traces to a
// live legacy call site; a speculative money operation is how an unreviewed rounding or allocation
// policy enters a price path.
// ---------------------------------------------------------------------------

describe('the closed operation surface', () => {
  it('publishes exactly the ten instance members that trace to a legacy site', () => {
    // This is the tripwire: widening the surface is a product decision and should fail here first.
    // Ten members, not nine - seven arithmetic and comparison operations plus TWO DISTINCT EGRESS
    // METHODS. `toFixed2` presents, and therefore rounds, reproducing
    // [model/service/PromotionService.cfc:L1017]; `toDecimalString` persists, and therefore imposes
    // no scale, because the `big_decimal` columns at [model/entity/PromotionApplied.cfc:L53] and
    // [model/entity/PriceGroupRate.cfc:L54] store every digit.
    const published = Object.getOwnPropertyNames(Money.prototype)
      .filter((name) => name !== 'constructor')
      .sort();

    expect(published).toEqual([
      'compare',
      'dividedBy',
      'equals',
      'isGreaterThan',
      'isLessThan',
      'minus',
      'plus',
      'times',
      'toDecimalString',
      'toFixed2',
    ]);
  });

  it('publishes exactly one construction factory and one constant', () => {
    // `toDecimalOperand` is present at runtime because TypeScript's `private` is a compile-time
    // modifier; it is the operand normaliser the four operations share, is unreachable from a
    // consumer, and is not a construction path.
    const intrinsic = new Set(['length', 'name', 'prototype']);
    const statics = Object.getOwnPropertyNames(Money)
      .filter((name) => !intrinsic.has(name))
      .sort();

    expect(statics).toEqual(['fromDecimalString', 'toDecimalOperand', 'zero']);
  });

  it('offers no numeric construction path', () => {
    // Structural rather than defensive: an IEEE-754 double cannot represent most decimal fractions
    // exactly, and admitting one is how drift would enter.
    expect('fromNumber' in Money).toBe(false);
    expect('from' in Money).toBe(false);
    expect('of' in Money).toBe(false);
    expect('parse' in Money).toBe(false);
    expect('fromCents' in Money).toBe(false);
    expect('fromDecimal' in Money).toBe(false);
  });

  it('offers no arithmetic operation beyond the four that trace to a call site', () => {
    const price = Money.fromDecimalString('19.99');

    expect('negate' in price).toBe(false);
    expect('abs' in price).toBe(false);
    expect('min' in price).toBe(false);
    expect('max' in price).toBe(false);
    expect('sum' in price).toBe(false);
    expect('average' in price).toBe(false);
    expect('power' in price).toBe(false);
    expect('sqrt' in price).toBe(false);
    expect('modulo' in price).toBe(false);
    expect('remainder' in price).toBe(false);
  });

  it('offers no rounding, allocation or distribution policy', () => {
    // A rounding POLICY belongs to `src/services/roundingRuleService.ts`, which owns the algorithm
    // and its rounding expression; an allocation policy has no legacy call site at all in this
    // slice.
    const price = Money.fromDecimalString('19.99');

    expect('round' in price).toBe(false);
    expect('floor' in price).toBe(false);
    expect('ceil' in price).toBe(false);
    expect('percentOf' in price).toBe(false);
    expect('allocate' in price).toBe(false);
    expect('split' in price).toBe(false);
    expect('distribute' in price).toBe(false);
  });

  it('offers no fluent builder and no currency-aware formatting', () => {
    const price = Money.fromDecimalString('19.99');

    expect('with' in price).toBe(false);
    expect('withAmount' in price).toBe(false);
    expect('withCurrency' in price).toBe(false);
    expect('format' in price).toBe(false);
    expect('formatCurrency' in price).toBe(false);
    expect('currency' in price).toBe(false);
    expect('currencyCode' in price).toBe(false);

    // `toLocaleString` is on `Object.prototype`, so `in` would report it present and prove nothing;
    // the meaningful assertion is that it is not overridden.
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toLocaleString')).toBe(false);
  });

  it('offers no numeric or serialisation escape hatch', () => {
    const price = Money.fromDecimalString('19.99');

    // `toJSON` and `toNumber` are NOT on `Object.prototype`, so plain `in` is the correct check for
    // them.
    expect('toJSON' in price).toBe(false);
    expect('toNumber' in price).toBe(false);
    expect('toFloat' in price).toBe(false);
    expect('asNumber' in price).toBe(false);
  });

  it('does not override valueOf or toString', () => {
    // The precision trap here: `valueOf` and `toString` ARE on `Object.prototype`, so `in` tells
    // you nothing. The meaningful assertion is that `Money` does not OVERRIDE them - an implicit
    // `valueOf` would let `moneyA - moneyB` compile into float arithmetic.
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'valueOf')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toJSON')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, Symbol.toPrimitive)).toBe(false);
  });

  it('does not surface absolute', () => {
    // JUDGMENT CALL: `absolute` exists on the arithmetic substrate, where the rounding search needs
    // it to compare candidate deltas by magnitude, and it is intentionally NOT surfaced here
    // because no monetary call site asks for the magnitude of a price.
    const price = Money.fromDecimalString('-19.99');

    expect('absolute' in price).toBe(false);
    expect('absoluteValue' in price).toBe(false);
    expect('magnitude' in price).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Money.zero - THE NARROWEST POSSIBLE CONTRACT
//
// CFML parity [model/service/PromotionService.cfc:L988, L989]: `var
//   discountAmountPreRounding = 0;` and `var roundedFinalAmount = 0;` - the two
//   accumulators `getDiscountAmount` opens with.
// CFML parity [model/service/PromotionService.cfc:L993-L1003]: the
//   `switch(reward.getAmountType())` that follows has NO `default:` case, so an
//   unrecognised amount type leaves that accumulator at zero. Those two sites,
//   and only those, are what this constant exists for.
// ---------------------------------------------------------------------------

describe('Money.zero', () => {
  it('exists, presents as 0.00 and equals every spelling of zero', () => {
    expect(Money.zero.toFixed2()).toBe('0.00');
    expect(Money.zero.equals('0')).toBe(true);
    expect(Money.zero.equals('0.00')).toBe(true);
    expect(Money.zero.equals('-0')).toBe(true);
    expect(Money.zero.equals('.0')).toBe(true);
  });

  it('is frozen', () => {
    // Mechanical rather than conventional: a single shared constant that could be tampered with is
    // a genuine hazard, being reachable from every call site.
    expect(Object.isFrozen(Money.zero)).toBe(true);
  });

  it('is the same instance on every read', () => {
    expect(Money.zero).toBe(Money.zero);
  });

  it('participates correctly in arithmetic', () => {
    const price = Money.fromDecimalString('19.99');

    expect(price.minus(price).equals(Money.zero)).toBe(true);
    expect(price.times('0').equals(Money.zero)).toBe(true);
    expect(price.plus(Money.zero).equals(price)).toBe(true);
    expect(Money.zero.minus(price).toFixed2()).toBe('-19.99');
    expect(Money.zero.times(price).equals(Money.zero)).toBe(true);
  });

  it('participates correctly in comparison', () => {
    expect(Money.zero.compare(Money.zero)).toBe(0);
    expect(Money.zero.compare(Money.fromDecimalString('0.00'))).toBe(0);
    expect(Money.zero.isGreaterThan(Money.fromDecimalString('-0.01'))).toBe(true);
    expect(Money.zero.isLessThan(Money.fromDecimalString('0.01'))).toBe(true);
  });

  it('refuses to be a divisor', () => {
    // Zero is a legitimate VALUE and an illegitimate DIVISOR, which is why the refusal lives in the
    // operation and not in the constant.
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.dividedBy(Money.zero)).name).toBe('PrecisionError');
  });

  it('is NOT a substitute for an absent price', () => {
    // CFML parity [model/entity/Sku.cfc:L269-L273]: `getPriceByCurrencyCode` has
    //   NO `else` and NO fallback - an unknown currency yields null. And
    //   [model/entity/Sku.cfc:L275-L279, L281-L285]: `getListPriceByCurrencyCode`
    //   and `getRenewalPriceByCurrencyCode` each perform a SECOND key-existence
    //   test on the inner sub-key, so they return null even for a currency that IS
    //   present. Absence is modelled as `undefined`, and substituting 0 would
    //   silently sell products for free - the highest-consequence parity check in
    //   the migration. So no member may hand `zero` back as a fallback.
    expect('orZero' in Money).toBe(false);
    expect('orZero' in Money.zero).toBe(false);
    expect('tryFrom' in Money).toBe(false);
    expect('parseOrZero' in Money).toBe(false);
    expect('fromDecimalStringOrZero' in Money).toBe(false);
    expect('defaultTo' in Money.zero).toBe(false);
    expect('orElse' in Money.zero).toBe(false);

    // The one construction path refuses malformed input rather than resolving it to zero - the
    // behaviour a tolerant parse would have hidden.
    expect(captureFailure(() => Money.fromDecimalString('')).name).toBe('CfmlNumberFormatError');
    expect(Money.fromDecimalString('0').equals(Money.zero)).toBe(true);
  });

  it('serves the promotion seeds only, because the two defaultless switches differ', () => {
    // CFML parity [model/service/PromotionService.cfc:L988-L989, L993-L1003]: the
    //   FIRST defaultless switch seeds its accumulators at 0, so an unrecognised
    //   amount type falls through to ZERO.
    // CFML parity [model/service/PriceGroupService.cfc:L319, L321-L336]: the
    //   SECOND defaultless switch seeds `newPrice` with the PASSTHROUGH
    //   `arguments.sku.getPrice()` at L319, and its switch - verified to have no
    //   `default:` branch anywhere in L321-L336 - falls through to the SKU'S OWN
    //   PRICE instead. The two fall-through values are DIFFERENT, which is why
    //   this constant is scoped to the promotion seeds: a shared "empty money"
    //   default would convert the price-group passthrough into a free product.
    const skuPrice = Money.fromDecimalString('19.99');
    const promotionSeed = Money.zero;

    expect(promotionSeed.equals(Money.zero)).toBe(true);
    expect(skuPrice.equals(Money.zero)).toBe(false);
    expect(skuPrice.toFixed2()).toBe('19.99');
  });
});

// ---------------------------------------------------------------------------
// Immutability and encapsulation
//
// Immutability is what makes a shared value safe to hold: the read-only order views the promotion
// engine consumes carry `Money` values and never mutate them, and the engine threads a mutable
// usage ledger through a 489-line loop.
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('freezes every instance, not just the shared constant', () => {
    expect(Object.isFrozen(Money.fromDecimalString('19.99'))).toBe(true);
    expect(Object.isFrozen(Money.fromDecimalString('19.99').times('3'))).toBe(true);
    expect(Object.isFrozen(Money.zero)).toBe(true);
  });

  it('leaves the receiver unchanged and returns a new instance from times', () => {
    const price = Money.fromDecimalString('19.99');
    const before = price.toFixed2();

    const result = price.times('3');

    expect(price.toFixed2()).toBe(before);
    expect(price.equals(Money.fromDecimalString('19.99'))).toBe(true);
    expect(result).not.toBe(price);
    expect(result.toFixed2()).toBe('59.97');
  });

  it('leaves the receiver unchanged and returns a new instance from minus', () => {
    const price = Money.fromDecimalString('59.97');
    const before = price.toFixed2();

    const result = price.minus('7.49625');

    expect(price.toFixed2()).toBe(before);
    expect(result).not.toBe(price);
    expect(result.equals(Money.fromDecimalString('52.47375'))).toBe(true);
  });

  it('leaves the receiver unchanged and returns a new instance from plus', () => {
    const price = Money.fromDecimalString('52.47');
    const before = price.toFixed2();

    const result = price.plus('7.53');

    expect(price.toFixed2()).toBe(before);
    expect(result).not.toBe(price);
    expect(result.toFixed2()).toBe('60.00');
  });

  it('leaves the receiver unchanged and returns a new instance from dividedBy', () => {
    const price = Money.fromDecimalString('12.5');
    const before = price.toFixed2();

    const result = price.dividedBy('100');

    expect(price.toFixed2()).toBe(before);
    expect(result).not.toBe(price);
    expect(result.equals(Money.fromDecimalString('0.125'))).toBe(true);
  });

  it('leaves the ARGUMENT unchanged too', () => {
    const price = Money.fromDecimalString('59.97');
    const discount = Money.fromDecimalString('7.49625');

    price.minus(discount);
    price.plus(discount);
    price.times(discount);

    expect(discount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
    expect(discount.toFixed2()).toBe('7.50');
  });

  it('returns a fresh instance even when the value is unchanged', () => {
    const price = Money.fromDecimalString('19.99');

    const identity = price.times('1');

    expect(identity.equals(price)).toBe(true);
    expect(identity).not.toBe(price);
  });

  it('leaves no comparison able to mutate anything', () => {
    const price = Money.fromDecimalString('19.99');
    const other = Money.fromDecimalString('12.35');

    price.compare(other);
    price.isGreaterThan(other);
    price.isLessThan(other);
    price.equals(other);
    price.toFixed2();

    expect(price.toFixed2()).toBe('19.99');
    expect(other.toFixed2()).toBe('12.35');
  });
});

describe('encapsulation', () => {
  it('re-exports nothing from the decimal library', () => {
    // The whole target routes money arithmetic through this one surface, so the underlying library
    // must not be reachable THROUGH it.
    const exported = Object.keys(moneyModule);

    expect(exported).toEqual(['Money']);
    expect(exported).not.toContain('Decimal');
    expect(exported).not.toContain('default');
  });

  it('holds a plain decimal numeral rather than a library instance', () => {
    // JUDGMENT CALL: TypeScript's `private` is a compile-time modifier, so the internal field is an
    // ordinary own property at runtime and asserting it "absent" would be false. The honest and
    // stronger assertion is that whatever is held is a STRING, so there is no library object to
    // leak.
    const price = Money.fromDecimalString('19.99');
    const state = ownState(price);

    expect(Object.keys(state).length).toBeGreaterThan(0);
    for (const held of Object.values(state)) {
      expect(typeof held).toBe('string');
    }
  });

  it('exposes no accessor that would hand the internal value out', () => {
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'value')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'amount')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'decimal')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'raw')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'unwrap')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'toDecimal')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'inner')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Money.prototype, 'getAmount')).toBe(false);
  });

  it('does not let a consumer read the internal numeral', () => {
    const price = Money.fromDecimalString('19.99');

    // @ts-expect-error - reading the internal numeral must not compile: the field
    // is private, and the directive itself is the assertion.
    const internal: unknown = price.amount;

    // Even under a deliberate breach the state is a plain numeral, never a library instance.
    expect(typeof internal).toBe('string');
  });

  it('is effectively final, because the constructor is not a public path', () => {
    // @ts-expect-error - the constructor is private, so `new Money(...)` must not
    // compile; that is what makes the class effectively final.
    const constructed: unknown = new Money('19.99');

    // JUDGMENT CALL: the guarantee above is COMPILE-TIME, so this records what a deliberate breach
    // produces - an instance that is still frozen.
    expect(constructed).toBeInstanceOf(Money);
    expect(Object.isFrozen(constructed)).toBe(true);
    expect(typeof Money).toBe('function');
  });

  it('cannot be SUBCLASSED, which is the half of finality nothing else asserts', () => {
    // The private constructor and class finality are two DIFFERENT guarantees, and the test above
    // establishes only the first. A class can hide its constructor from direct `new` while still
    // being extensible; it is that constructor's effect on the `extends` clause which closes
    // subclassing, and only an assertion on `extends` can show it. A subclass could otherwise add a
    // mutable field the base constructor's freeze never reaches, an operation outside the closed
    // arithmetic surface, or an override that makes a value typed `Money` stop behaving like one.
    //
    // THE DIRECTIVE IS THE ASSERTION. If the constructor were ever widened, `extends Money` would
    // start compiling and the compiler would report this directive as unused.

    // @ts-expect-error - `extends Money` must not compile: the constructor is
    // private, so the class cannot be used as a base.
    class DerivedMoney extends Money {}

    // The class MUST be referenced below. Under `noUnusedLocals` an unreferenced class would raise
    // a SECOND diagnostic on the same line, keeping the directive satisfied even after finality had
    // been lost.
    expect(typeof DerivedMoney).toBe('function');

    // JUDGMENT CALL: `private` is erased at runtime, so this records what a deliberate breach
    // produces - a real subclass that inherited the static factory. The guarantee is compile-time
    // only.
    expect(typeof DerivedMoney.fromDecimalString).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// The operand rule
//
// A non-monetary integer COUNT may SCALE money but may never be ADDED TO or SUBTRACTED FROM it, so
// `times` and `dividedBy` admit a `number` while `minus`, `plus` and the four comparisons do not.
// That matches every legacy site: the multipliers and divisors are quantities and the literal 100 -
// [model/service/PromotionService.cfc:L990] multiplies by `arguments.quantity`, and
// [model/service/PromotionService.cfc:L995] and [model/service/PriceGroupService.cfc:L323] divide
// by 100 - while the one legacy COUNT subtraction, `(thisDiscountQuantity - needToRemove)` inside
// [model/service/PromotionService.cfc:L486], never touches money.
// ---------------------------------------------------------------------------

describe('the operand rule for a non-monetary integer count', () => {
  it('scales by an integer count, matching the decimal-string path exactly', () => {
    // JUDGMENT CALL: the numeric ingress is asserted here in its own block rather than in the
    // reference calculation, which deliberately takes the all-string path. It is NEVER for a price,
    // an amount or a discount: it exists for the quantity operand and the literal 100 divisor.
    const price = Money.fromDecimalString('19.99');

    expect(price.times(3).equals(price.times('3'))).toBe(true);
    expect(price.times(3).toFixed2()).toBe('59.97');
    expect(
      Money.fromDecimalString('12.5').dividedBy(100).equals(Money.fromDecimalString('0.125')),
    ).toBe(true);
  });

  it('rejects a fractional number outright', () => {
    // The decisive case: `times(0.125)` must fail loudly rather than admitting an IEEE-754 double
    // into a money path.
    const price = Money.fromDecimalString('19.99');
    const failure = captureFailure(() => price.times(0.125));

    expect(failure.name).toBe('PrecisionError');
    expect(failure.message).toContain('safe integer');
  });

  it('rejects a non-finite number', () => {
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.times(Number.NaN)).name).toBe('PrecisionError');
    expect(captureFailure(() => price.times(Number.POSITIVE_INFINITY)).name).toBe('PrecisionError');
    expect(captureFailure(() => price.times(Number.NEGATIVE_INFINITY)).name).toBe('PrecisionError');
    expect(captureFailure(() => price.dividedBy(Number.NaN)).name).toBe('PrecisionError');
  });

  it('rejects a magnitude beyond exact integer representation', () => {
    const price = Money.fromDecimalString('19.99');

    expect(captureFailure(() => price.times(Number.MAX_SAFE_INTEGER + 2)).name).toBe(
      'PrecisionError',
    );
  });

  it('accepts the boundary safe integers', () => {
    const price = Money.fromDecimalString('2');

    expect(price.times(Number.MAX_SAFE_INTEGER).isGreaterThan(price)).toBe(true);
    expect(price.times(0).equals(Money.zero)).toBe(true);
    expect(price.times(-1).toFixed2()).toBe('-2.00');
  });

  it('propagates the zero-divisor refusal rather than inventing a value', () => {
    // CFML parity [model/service/PromotionService.cfc:L299]: the legacy division
    //   `precisionEvaluate('discountAmount / discountQuantity')` applies NO zero
    //   check to its divisor. The substrate refuses a zero divisor outright and
    //   `dividedBy` lets that refusal through untouched - returning zero would
    //   silently invent money, and returning undefined would push a null check
    //   onto every caller. Whether the CALL SITE at L299 wants a guard is owned
    //   by `src/services/promotion/rewardUsageLedger.ts`, not by this surface.
    const discountAmount = Money.fromDecimalString('7.50');

    const fromString = captureFailure(() => discountAmount.dividedBy('0'));
    const fromCount = captureFailure(() => discountAmount.dividedBy(0));
    const fromMoney = captureFailure(() => discountAmount.dividedBy(Money.zero));

    expect(fromString.name).toBe('PrecisionError');
    expect(fromCount.name).toBe('PrecisionError');
    expect(fromMoney.name).toBe('PrecisionError');
    expect(fromString.message).toContain('zero divisor');

    expect(fromString.message).not.toBe('');
    expect(discountAmount.toFixed2()).toBe('7.50');
  });

  it('does not admit a count where money is required', () => {
    // The COMPILE-TIME half of the operand rule: `minus`, `plus` and the four comparisons declare a
    // monetary operand only, so handing one a raw count does not compile. The enforcement is the
    // type system rather than a runtime refusal - the shared operand normaliser would accept a safe
    // integer if it ever reached it - which is why each case below is never invoked and why the
    // directive is the assertion.
    const price = Money.fromDecimalString('19.99');

    // @ts-expect-error - a count may scale money but never be subtracted from it.
    const subtractedCount: unknown = () => price.minus(3);

    // @ts-expect-error - a count may scale money but never be added to it.
    const addedCount: unknown = () => price.plus(3);

    // @ts-expect-error - a comparison is between two monetary values.
    const comparedCount: unknown = () => price.compare(3);

    expect(typeof subtractedCount).toBe('function');
    expect(typeof addedCount).toBe('function');
    expect(typeof comparedCount).toBe('function');
  });
});
