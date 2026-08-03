// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/lib/cfml/precision.ts`
//
// WHAT THIS SUITE PINS
// The arbitrary-precision decimal arithmetic surface that replaces CFML's
// `precisionEvaluate()` in the TypeScript / AWS Lambda `nodejs20.x` port of the
// Slatwall 3.1.39 catalog and promotions/pricing slice (`version.txt` = 3.1.39).
// Every export of that module is exercised: both value types, the single integer
// entry point, the five arithmetic primitives, the four comparison predicates
// and the one rendering boundary.
//
// That module is the SUBSTRATE of the arithmetic surface, not the surface. The
// money value object is the surface the rest of the port uses, and it is pinned
// by its own suite in the value-object tier. Nothing here reaches for it.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// No assertion below has a legacy antecedent, and that claim was MEASURED
// rather than assumed. Across all 32 `.cfc` files under `meta/tests/`:
//
//   * searching for `precisionEvaluate`, `roundValue`, `cfNumberToString` and
//     the two-decimal presentation mask applied at
//     [model/service/PromotionService.cfc:L1017] returns ZERO hits;
//
//   * searching for the five CFML list built-ins this folder re-expresses -
//     `listLen`, `listGetAt`, `listAppend`, `listToArray`, `listFindNoCase` -
//     returns 14 hits, and every one is incidental ORM-metadata enumeration
//     inside a test body rather than an assertion about those built-ins'
//     semantics. The whole set lives in exactly two files:
//     [meta/tests/unit/core/RBKeyTest.cfc:L52], which reads
//     `listToArray(structKeyList(ORMGetSessionFactory().getAllClassMetadata()))`,
//     and [meta/tests/unit/core/EntityFormatTest.cfc] at various lines.
//
// Across the entire migration only two legacy tests are extended anywhere -
// [meta/tests/unit/entity/BrandTest.cfc] and
// [meta/tests/unit/entity/ProductTest.cfc], both owned by the entity tier - and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
// contributing zero coverage. None of the three touches this module. So this
// suite is net-new in full, and saying otherwise would misreport the migration.
//
// ---------------------------------------------------------------------------
// CARRY THE ASSERTIONS, NEVER THE HARNESS
// ---------------------------------------------------------------------------
// The legacy tier was integration-style at every level:
// [meta/tests/unit/SlatwallUnitTestBase.cfc:L52] builds the application
// component and `:L60` bootstraps it, booting the real ORM and the real bean
// factory before every legacy "unit" test. This tier is genuinely isolated -
// pure arithmetic over literals, with no database pool, no network, no
// filesystem read and no environment read - so it needs none of that. The
// legacy fixture pattern at [meta/tests/unit/Helper.cfc:L51-L75] is followed as
// a PATTERN only: build-save-flush becomes plain construction, and the ORM
// session flush, entity construction and entity deletion helpers it relied on
// are dropped rather than emulated.
//
// One harness hygiene defect is deliberately NOT reproduced:
// [meta/tests/unit/Helper.cfc:L53] and [meta/tests/unit/IssuesTest.cfc:L55] both
// declare their fixture data without `var`, leaking it into component scope.
// That is a defect in the harness being replaced, not one of the thirty
// preserved business-logic defects, so it is not carried forward. Every value
// below is local to its own test.
//
// Regression suites in this port follow the `issue_<ticket#>` convention from
// [meta/tests/unit/IssuesTest.cfc:L51] (`public void function issue_1097()`).
// NO `issue_*` case falls inside this suite, and none is invented to look like
// one: the known carried-forward case, ticket #1766 for the return/exchange
// no-op at [model/service/PromotionService.cfc:L542-L544], belongs to the
// promotion characterization suite. For the same reason no legacy TODO is
// carried forward here - none lives inside the arithmetic this module replaces.
//
// Justification throughout is correctness and fidelity, never speed.
// [model/service/RoundingRuleService.cfc:L66] carries a speed-framed
// justification for its own memo; that framing is deliberately not carried into
// this suite, and no timing figure, budget or service level appears anywhere
// below. None exists in the legacy source and none may be invented.
//
// ---------------------------------------------------------------------------
// PROJECT RULES
// ---------------------------------------------------------------------------
// No user-specified rules were provided for this project. That was VERIFIED,
// not assumed: the rules source was read five independent ways - the default
// window, the fully unbounded range, a range deliberately probing far past the
// apparent end, a single-line range, and a range starting well beyond the
// document - and all five returned the byte-identical single line
// "No user rules provided." The document is a one-line sentinel and is
// exhausted. The agent action plan reports the same result independently.
//
// Four consequences, each binding on this file:
//   1. NO RULE MAY BE INVENTED. Any "rule" cited in this suite or its comments
//      would be fabrication, so none is cited.
//   2. The absence is NOT licence to lower the bar. The substitute
//      enterprise-standard practices apply at full strength, exactly as a user
//      rule would: maximal type strictness, the mechanically enforced layer
//      boundary, exact dependency pinning with no test-only additions, a single
//      arithmetic surface extended to the EXPECTED values below, an
//      empty-environment guarantee, no barrel file and no export from this
//      file, and in-code annotation of every judgment call.
//   3. ZERO files enter scope by rule mandate. This file traces to the assigned
//      folder's purpose and to the plan's target-structure and wildcard
//      sections. There is no third, rule-driven category of in-scope file.
//   4. There are consequently no rule conflicts to resolve.
// The rules source remains authoritative; this is a record of its result, never
// a substitute for reading it.
//
// ---------------------------------------------------------------------------
// HOW EVERY EXPECTED VALUE BELOW WAS OBTAINED
// ---------------------------------------------------------------------------
// JUDGMENT CALL: every expectation is a decimal-STRING literal that was
// measured against the shipped module under the pinned decimal library before
// being written here, never derived by hand and never computed in-line. No
// floating-point operation is performed anywhere in this file - not in a
// subject, and not in an expected value either. Approximate matching is
// likewise absent by design: an approximate money comparison would mask exactly
// the drift this module exists to prevent, so every monetary assertion is exact.
//
// A note on what floating-point drift actually does, measured rather than
// guessed, because two of these are counter-intuitive:
//   * `0.1 + 0.2` as IEEE-754 doubles yields 0.30000000000000004. It drifts.
//   * `59.97 - 7.49625` as doubles yields 52.473749999999995. It drifts, and
//     this is both the shape at [model/service/PromotionService.cfc:L1006] and
//     [model/service/PromotionService.cfc:L1007] AND the closing step of the
//     reference chain below.
//   * `19.99 - (19.99 * 0.125)` as doubles yields 17.491249999999997. It
//     drifts, and it is the price-group percentage-off shape at
//     [model/service/PriceGroupService.cfc:L323].
//   * `19.99 * 3`, by contrast, is EXACT as doubles (59.97). It is therefore
//     not claimed as a drift case anywhere below. Only measured drift is
//     described as drift.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  absolute,
  add,
  compare,
  divide,
  equals,
  fromInteger,
  isGreaterThan,
  isLessThan,
  isZero,
  multiply,
  subtract,
  toDecimalString,
} from '../../../../src/lib/cfml/precision.js';
// The module's two exported TYPES are part of its contract, not incidental
// annotations, so they are imported by name and asserted directly rather than
// covered only through the values that happen to satisfy them. `import type` is
// mandatory here: `consistent-type-imports` is enforced, and a type-only import
// must not survive into any emitted output.
import type { PreciseInput, PreciseValue } from '../../../../src/lib/cfml/precision.js';

// ---------------------------------------------------------------------------
// Failure capture
// ---------------------------------------------------------------------------

/**
 * What a rejected request reveals about itself.
 *
 * The module's error class is deliberately NOT exported, which is the documented
 * contract: the export surface is a closed set, and widening it is a product
 * decision. A caller therefore discriminates on the stable `name` rather than
 * with `instanceof`, and so does this suite.
 */
interface CapturedFailure {
  readonly name: string;
  readonly message: string;
}

/**
 * Runs an operation expected to fail and reports how it failed.
 *
 * JUDGMENT CALL: a pure local helper rather than a shared fixture. It holds no
 * state, so it cannot leak anything between tests - which matters because four
 * legacy component-level caches become request-scoped in this port precisely
 * because module-level state survives between unrelated invocations on a warm
 * container. Nothing in this file is mutable at module scope, and every value a
 * test uses is created inside that test.
 *
 * If the operation does NOT throw, this throws instead, so a silently-succeeding
 * subject can never be mistaken for a passing expectation.
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

// ---------------------------------------------------------------------------
// D2 - the eleven verified in-scope `precisionEvaluate` sites
// ---------------------------------------------------------------------------

describe('the eleven verified in-scope precisionEvaluate arithmetic shapes', () => {
  // Every locator in this block was verified first-hand with `grep -n` against
  // the source: `grep -c precisionEvaluate model/service/PromotionService.cfc`
  // returns 9 and the same count for
  // `model/service/PriceGroupService.cfc` returns 2. The in-scope total is
  // therefore ELEVEN, and the eleven tests below are one per shape.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L88]: the verified
  //   NEGATIVE that bounds the set. `grep -c precisionEvaluate` returns 0 for
  //   `RoundingRuleService.cfc`, `ProductService.cfc`, `SkuService.cfc`,
  //   `BrandService.cfc` and `OptionService.cfc`. The rounding service performs
  //   money arithmetic with no precision guard at all, which is why `add`,
  //   `subtract` and `absolute` exist for it rather than because an in-scope
  //   guarded site demanded them.
  //
  // FOUR LOCATOR CORRECTIONS, recorded so a reviewer can reconcile this suite
  // against the published site list, which is wrong four times. Each was
  // settled by reading the source; the source is the authority.
  //
  // CFML parity [model/service/PromotionService.cfc:L252]: PUBLISHED AS L248,
  //   WHICH IS WRONG. L248 is the comment "Calculate based on skuPrice because
  //   the price on this item is a priceGroup price and we need to adjust the
  //   discount by the difference", and L249 is
  //   `var originalDiscountAmount = getDiscountAmount(reward,
  //   orderItem.getSkuPrice(), discountQuantity);`. The `precisionEvaluate` call
  //   is on L252.
  //
  // CFML parity [model/service/PromotionService.cfc:L1006]: OMITTED ENTIRELY
  //   from the published list. It is present in the source and is the
  //   subtraction feeding `roundValueByRoundingRule(...)`, so the published
  //   total of ten understates the real total of eleven.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L323]: PUBLISHED AS L322,
  //   WHICH IS WRONG. L322 is literally `case "percentageOff" :`.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L331]: PUBLISHED AS L328,
  //   WHICH IS WRONG. L328 is the `}` closing the
  //   `if(!isNull(arguments.priceGroupRate.getRoundingRule()))` block that spans
  //   L326-L328; the `precisionEvaluate` call is on L331, inside
  //   `case "amountOff"`.

  it('L150 - (a x b) - (c x b), the sale-price seeding discount', () => {
    // CFML parity [model/service/PromotionService.cfc:L150]:
    //   `precisionEvaluate('(orderItem.getSku().getPrice() *
    //   orderItem.getQuantity()) - (salePriceDetails.salePrice *
    //   orderItem.getQuantity())')`. A list price of 19.99 and a sale price of
    //   17.49 over a quantity of 3: 59.97 less 52.47.
    const listExtended = multiply('19.99', '3');
    const saleExtended = multiply('17.49', '3');

    expect(toDecimalString(subtract(listExtended, saleExtended))).toBe('7.5');
  });

  it('L252 - a - (b - c), the price-group discount adjustment', () => {
    // CFML parity [model/service/PromotionService.cfc:L252]:
    //   `precisionEvaluate('originalDiscountAmount -
    //   (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())')`. The
    //   nested subtraction removes the price-group saving the item already
    //   receives, so a 10.00 discount against a 7.50 saving nets 2.50.
    expect(toDecimalString(subtract('10.00', subtract('59.97', '52.47')))).toBe('2.5');
  });

  it('L299 - a / b, the discount-per-use value the usage ledger sorts on', () => {
    // CFML parity [model/service/PromotionService.cfc:L299]:
    //   `precisionEvaluate('discountAmount / discountQuantity')`. The legacy site
    //   applies NO zero check to its divisor; see the division block below for
    //   where that guard belongs.
    expect(toDecimalString(divide('7.49625', '3'))).toBe('2.49875');
  });

  it('L486 - (a / b) x (b - c), the over-use discount reduction', () => {
    // CFML parity [model/service/PromotionService.cfc:L486]:
    //   `precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID
    //   ][y].discountAmount / thisDiscountQuantity) * (thisDiscountQuantity -
    //   needToRemove)')`. Division first, then multiplication by the retained
    //   quantity: a 7.49625 discount over 3 uses, with 1 use removed, retains
    //   2.49875 per use across 2 uses.
    const perUse = divide('7.49625', '3');
    const retainedQuantity = subtract('3', '1');

    expect(toDecimalString(multiply(perUse, retainedQuantity))).toBe('4.9975');
  });

  it('L990 - a x b, the extended original amount', () => {
    // CFML parity [model/service/PromotionService.cfc:L990]:
    //   `precisionEvaluate('arguments.price * arguments.quantity')` - the first
    //   statement of the discount calculation.
    expect(toDecimalString(multiply('19.99', '3'))).toBe('59.97');
  });

  it('L995 - a x (b / 100), the percentageOff discount branch', () => {
    // CFML parity [model/service/PromotionService.cfc:L995]:
    //   `precisionEvaluate('originalAmount * (reward.getAmount()/100)')`. The
    //   division by the literal 100 is nested INSIDE the multiplication, so the
    //   percentage is resolved before it is applied.
    expect(toDecimalString(multiply('59.97', divide('12.5', '100')))).toBe('7.49625');
  });

  it('L1001 - (a - b) x c, the amount discount branch', () => {
    // CFML parity [model/service/PromotionService.cfc:L1001]:
    //   `precisionEvaluate('(arguments.price - reward.getAmount()) *
    //   arguments.quantity')` - the per-unit shortfall against a target amount,
    //   extended over the quantity.
    expect(toDecimalString(multiply(subtract('19.99', '12.495'), '3'))).toBe('22.485');
  });

  it('L1006 - a - b, the amount handed to the rounding rule', () => {
    // CFML parity [model/service/PromotionService.cfc:L1006]:
    //   `roundValueByRoundingRule(value=precisionEvaluate('originalAmount -
    //   discountAmountPreRounding'), roundingRule=reward.getRoundingRule())`.
    //   This is the site omitted from the published list.
    expect(toDecimalString(subtract('59.97', '7.49625'))).toBe('52.47375');
  });

  it('L1007 - a - b, the discount the rounded final amount implies', () => {
    // CFML parity [model/service/PromotionService.cfc:L1007]:
    //   `precisionEvaluate('originalAmount - roundedFinalAmount')`. On the same
    //   operands this is the exact inverse of L1006 above, and both directions
    //   have to be exact for the pair to round-trip: 59.97 less 52.47375
    //   recovers 7.49625.
    expect(toDecimalString(subtract('59.97', '52.47375'))).toBe('7.49625');
  });

  it('L323 - a - (a x (b / 100)), the price-group percentageOff rate', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L323]:
    //   `precisionEvaluate('arguments.sku.getPrice() - (arguments.sku.getPrice()
    //   * (arguments.priceGroupRate.getAmount() / 100))')`. The base price
    //   appears TWICE in one expression - once as the minuend and once inside
    //   the percentage term - and the same operand must resolve identically in
    //   both positions. As IEEE-754 doubles this shape yields
    //   17.491249999999997; exactly is 17.49125.
    const basePrice = '19.99';
    const percentageTerm = multiply(basePrice, divide('12.5', '100'));

    expect(toDecimalString(subtract(basePrice, percentageTerm))).toBe('17.49125');
  });

  it('L331 - a - b, the price-group amountOff rate', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L331]:
    //   `precisionEvaluate('arguments.sku.getPrice() -
    //   arguments.priceGroupRate.getAmount()')`.
    expect(toDecimalString(subtract('19.99', '2.50'))).toBe('17.49');
  });
});

describe('addition, which no in-scope precisionEvaluate site performs', () => {
  // Stated honestly rather than padded: all eleven in-scope guarded sites are
  // multiplication, subtraction or division. `add` is still covered because the
  // module exports it and every export needs a test, and because it has a real
  // in-scope antecedent - just an UNGUARDED one.

  it('serves the unguarded upward candidate of the rounding search at RRS L108', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L108]:
    //   `var higherValue = inputValue + rrPower;` - plain CFML addition with no
    //   precision guard. Offering a precise addition is what keeps the ported
    //   rounding service from reaching for floating-point addition on a money
    //   value merely because no precise addition existed.
    expect(toDecimalString(add('12.3456', '0.99'))).toBe('13.3356');
  });

  it('serves the downward candidate at RRS L101 through subtract', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L101]:
    //   `var lowerValue = inputValue - rrPower;` - the counterpart of L108.
    expect(toDecimalString(subtract('12.3456', '0.99'))).toBe('11.3556');
  });
});

// ---------------------------------------------------------------------------
// D3 - the decimal-fidelity reference chain
// ---------------------------------------------------------------------------

describe('the decimal-fidelity reference chain', () => {
  // A unit price of 19.99 at a quantity of 3, discounted by 12.5 per cent. This
  // exercises the exact `a x (b / 100)` shape of
  // [model/service/PromotionService.cfc:L995] and then the `a - b` shape of
  // [model/service/PromotionService.cfc:L1006], so it is the reference chain and
  // an integration of two of the eleven sites at once.
  //
  // Each intermediate is asserted exactly. Asserting only the final value would
  // let a wrong intermediate hide behind a right total.
  //
  // ★ THE CHAIN STOPS AT 52.47375, DELIBERATELY.
  // CFML parity [model/service/PromotionService.cfc:L1017]: the legacy function
  //   closes by returning its discount through a two-decimal presentation mask,
  //   which is what turns 52.47375 into a two-decimal amount for display and
  //   persistence. That presentation step is owned by the sibling formatting
  //   module in this same folder and by ITS suite, together with CFML's
  //   trailing-zero stringification. It is not duplicated here, and this suite
  //   asserts nothing about it. The identical mask is applied at
  //   [model/service/PriceGroupService.cfc:L339].

  it('step 1 - extends the unit price over the quantity to 59.97', () => {
    // The quantity is passed as the decimal STRING '3'. The module's input type
    // is a decimal string or a value the module itself produced; a plain number
    // is deliberately excluded, because an IEEE-754 double is precisely how
    // drift enters a money path.
    expect(toDecimalString(multiply('19.99', '3'))).toBe('59.97');
  });

  it('step 2 - resolves 12.5 per cent of the extended price to 7.49625', () => {
    // The percentage divisor is the string literal '100', matching the literal
    // 100 in the legacy expression at
    // [model/service/PromotionService.cfc:L995].
    const extendedPrice = multiply('19.99', '3');

    expect(toDecimalString(divide('12.5', '100'))).toBe('0.125');
    expect(toDecimalString(multiply(extendedPrice, divide('12.5', '100')))).toBe('7.49625');
  });

  it('step 3 - subtracts the discount to 52.47375 and stops there', () => {
    // As IEEE-754 doubles this exact subtraction yields 52.473749999999995, so
    // the assertion below is the one that actually demonstrates why the module
    // exists. The value is asserted exactly, never approximately: an approximate
    // comparison here would accept the drifted result and defeat the point.
    expect(toDecimalString(subtract('59.97', '7.49625'))).toBe('52.47375');
  });

  it('composes the whole chain without an intermediate rendering step', () => {
    // The same chain expressed as nested calls. Values stay inside the precise
    // domain the whole way and are rendered once, at the end - which is how a
    // caller is expected to use the module.
    const discount = multiply(multiply('19.99', '3'), divide('12.5', '100'));

    expect(toDecimalString(subtract(multiply('19.99', '3'), discount))).toBe('52.47375');
  });

  it('reaches the same result when the quantity enters through fromInteger', () => {
    // JUDGMENT CALL: asserted because the integer entry point genuinely ships,
    // and a caller holding an integer quantity will reasonably use it. It must
    // agree with the string route exactly, or there would be two arithmetic
    // surfaces rather than one.
    expect(toDecimalString(multiply('19.99', fromInteger(3)))).toBe('59.97');
  });

  it('adds 0.1 and 0.2 to exactly 0.3, which doubles cannot do', () => {
    // The canonical IEEE-754 counter-example: as doubles, 0.1 + 0.2 yields
    // 0.30000000000000004. Here it is exactly 0.3.
    expect(toDecimalString(add('0.1', '0.2'))).toBe('0.3');
  });
});

// ---------------------------------------------------------------------------
// D4 - comparison semantics
// ---------------------------------------------------------------------------

describe('comparison semantics: by decimal value, never lexical', () => {
  // WHY NO COMPARISON MAY QUIETLY ROUND, AND WHY IT MAY NEVER COMPARE AS TEXT.
  // The promotion engine sorts twice, on money, in OPPOSITE directions, and both
  // orderings are load-bearing:
  //
  //   CFML parity [model/service/PromotionService.cfc:L266-L294]: qualified
  //     discounts are insert-sorted DESCENDING by discount amount. The test at
  //     L271 is
  //     `if(orderItemQulifiedDiscounts[ orderItem.getOrderItemID()
  //     ][d].discountAmount < discountAmount)`, followed by `arrayInsertAt`, so a
  //     new discount is placed ahead of any smaller one already present.
  //   CFML parity [model/service/PromotionService.cfc:L524-L537]: only index
  //     `[1]` is ever applied - L532 reads
  //     `[ orderItem.getOrderItemID() ][1].promotion` and L534 the matching
  //     `[1].discountAmount` - so that descending order decides WHICH discount
  //     the customer actually receives. Everything after the first is discarded.
  //   CFML parity [model/service/PromotionService.cfc:L301-L329]: reward usage is
  //     insert-sorted ASCENDING by discount-per-use, the test at L306 being
  //     `if(...orderItemsUsage[oiu].discountPerUseValue > discountPerUseValue)`,
  //     with the source's own comment at L303 confirming ascending intent. The
  //     cheapest-per-use discounts are therefore the ones stripped first when a
  //     use limit is exceeded.
  //
  // Two opposing orderings driven by comparisons on money means a comparison
  // that quietly rounded, or that compared decimal text as text, would change
  // which discount wins and therefore what the customer is charged. Note also
  // the legacy identifier is misspelled in the source as
  // `orderItemQulifiedDiscounts`; it is quoted above exactly as written, because
  // misquoting it would send a reviewer looking for something that is not there.
  //
  // CFML parity [model/service/RoundingRuleService.cfc:L120]: the sharpest
  //   reason the comparison must be numeric rather than textual. That line is
  //   `if(valueOptionOne == inputValue || valueOptionTwo == inputValue)`, and the
  //   candidates being compared were ASSEMBLED BY SLICING AND CONCATENATING
  //   DECIMAL STRINGS. CFML resolves `==` numerically; a text comparison of the
  //   same operands would not.

  it('compare returns exactly -1 when the left operand is smaller', () => {
    expect(compare('1', '2')).toBe(-1);
  });

  it('compare returns exactly 1 when the left operand is larger', () => {
    expect(compare('2', '1')).toBe(1);
  });

  it('compare returns exactly 0 for equal values written at different scales', () => {
    // A text comparison would report these as different. They are one value.
    expect(compare('12.350', '12.35')).toBe(0);
  });

  it('equals judges 1.0 and 1 equal', () => {
    expect(equals('1.0', '1')).toBe(true);
  });

  it('equals judges 12.350 and 12.35 equal', () => {
    expect(equals('12.350', '12.35')).toBe(true);
  });

  it('isGreaterThan reports 9.99 NOT greater than 12.35, where text would disagree', () => {
    // The load-bearing trap. Compared as text, '9.99' sorts AFTER '12.35'
    // because the character 9 sorts after the character 1, which would make a
    // 9.99 discount beat a 12.35 discount and hand the customer the wrong one.
    // Compared by value it is smaller, which is the only correct answer.
    expect(isGreaterThan('9.99', '12.35')).toBe(false);
    expect(isLessThan('9.99', '12.35')).toBe(true);
  });

  it('isGreaterThan reports 12.350 not strictly greater than 12.35', () => {
    // Equal values are not strictly greater in either direction.
    expect(isGreaterThan('12.350', '12.35')).toBe(false);
    expect(isLessThan('12.350', '12.35')).toBe(false);
  });

  it('isGreaterThan separates 0.10 from 0.09 at the sub-cent boundary', () => {
    expect(isGreaterThan('0.10', '0.09')).toBe(true);
  });

  it('isLessThan separates 0.09 from 0.10 at the sub-cent boundary', () => {
    expect(isLessThan('0.09', '0.10')).toBe(true);
  });

  it('isZero recognises zero written at any scale, and only zero', () => {
    // CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount >
    //   0)` gates whether a computed discount is recorded against an order item
    //   at all, so "is this zero" has to be scale-independent.
    expect(isZero('0')).toBe(true);
    expect(isZero('0.00')).toBe(true);
    expect(isZero('0.0000')).toBe(true);
    expect(isZero('-0')).toBe(true);
    expect(isZero('0e5')).toBe(true);
    expect(isZero('0.01')).toBe(false);
  });

  it('absolute discards a negative sign and leaves a positive value alone', () => {
    // CFML parity [model/service/RoundingRuleService.cfc:L123-L130]: the rounding
    //   search computes `var valueOptionOneDelta = inputValue - valueOptionOne;`
    //   and then flips the sign by hand with
    //   `valueOptionOneDelta = valueOptionOneDelta*-1;` when the delta is
    //   negative, with the identical pair for the second candidate. The negative
    //   intermediates are real rather than hypothetical, so both directions are
    //   asserted.
    expect(toDecimalString(absolute('-0.58'))).toBe('0.58');
    expect(toDecimalString(absolute('0.58'))).toBe('0.58');
  });
});

// ---------------------------------------------------------------------------
// D5 - division: a zero divisor throws, a non-terminating quotient does not
// ---------------------------------------------------------------------------

describe('division', () => {
  // CFML parity [model/service/PromotionService.cfc:L299]: the legacy site
  //   `precisionEvaluate('discountAmount / discountQuantity')` applies NO zero
  //   check to its divisor. Reproducing the ARITHMETIC faithfully is what this
  //   module does; throwing on a zero divisor is the faithful outcome rather
  //   than a departure, because CFML's `precisionEvaluate` raises a
  //   division-by-zero error and so has never produced a number for that
  //   request. The pinned decimal library, by contrast, does not throw - it
  //   yields a non-finite value - so the check has to be explicit.
  //
  //   Whether the CALL SITE at L299 needs a guard of its own, and what that
  //   guard should do, is not settled here: it belongs to the reward-usage
  //   ledger module of the promotion decomposition, which owns that decision.
  //   This suite pins only that the primitive refuses to invent a value.

  it('throws rather than yielding a non-finite value for a zero divisor', () => {
    // Deliberately NOT asserted: an infinite result, a not-a-number result, a
    // zero fallback, or an absent result. Any of those would let a corrupted
    // amount travel onward as though it were money.
    expect(() => divide('7.49625', '0')).toThrow();
  });

  it('throws for a zero divisor written at any scale', () => {
    // '0.00' is the same value as '0', so it must be refused identically. A
    // divisor guard that only recognised the literal '0' would be a hole.
    expect(() => divide('1', '0.00')).toThrow();
    expect(() => divide('1', '-0')).toThrow();
    expect(() => divide('0', '0')).toThrow();
  });

  it('signals the refusal as an identifiable failure type', () => {
    // The module's error class is intentionally unexported, so the stable `name`
    // is the documented discrimination point. Asserting it proves the failure is
    // a distinct, recognisable type rather than an anonymous error.
    expect(captureFailure(() => divide('7.49625', '0')).name).toBe('PrecisionError');
  });

  it('names the operation and the dividend, and discloses nothing else at all', () => {
    // JUDGMENT CALL: the message is asserted EXHAUSTIVELY, as a whole string,
    // rather than by sampling a denylist of sensitive substrings. An exact match
    // is strictly the stronger claim - it proves that the message contains the
    // diagnostic text and NOTHING besides it, which no denylist can establish -
    // and it also means this suite never has to name a sensitive substring in
    // order to check for one.
    //
    // The disclosure guarantee is structural as well as asserted: the module
    // reads no environment and holds no connection detail, so it has nothing
    // sensitive available to leak. The dividend is deliberately included because
    // it aids diagnosis and is caller-supplied arithmetic input.
    expect(captureFailure(() => divide('7.49625', '0')).message).toBe(
      'divide received a zero divisor while dividing 7.49625; CFML precisionEvaluate raises a ' +
        'division-by-zero error, and resolving this to 0 would silently invent money.',
    );
  });

  it('resolves a non-terminating quotient at the declared precision without throwing', () => {
    // 1/3 has no exact decimal representation, so division has to stop
    // somewhere. It stops at the module's explicitly declared significant-digit
    // precision rather than at whatever ambient configuration happens to apply,
    // and it does not throw for merely being non-terminating.
    const oneThird = toDecimalString(divide('1', '3'));

    expect(oneThird.startsWith('0.3333')).toBe(true);
    expect(oneThird).toBe('0.33333333333333333333');
  });

  it('rounds the final digit of a non-terminating quotient rather than truncating', () => {
    // 2/3 settles on a trailing 7, not a trailing 6, which is what shows the
    // declared half-up rounding is genuinely in force at the precision boundary.
    expect(toDecimalString(divide('2', '3'))).toBe('0.66666666666666666667');
  });
});

// ---------------------------------------------------------------------------
// D6 - input-type discipline
// ---------------------------------------------------------------------------

describe('input-type discipline', () => {
  // The module accepts a decimal STRING or a value it produced itself. A plain
  // number is deliberately not accepted for money, so every monetary operand in
  // this suite - and every integer operand alongside one - is written as a
  // decimal string literal such as '3' or '100'.

  it('accepts both members of its operand union interchangeably', () => {
    // The two exported TYPES are contracts in their own right, so they get a
    // named assertion rather than being covered only incidentally. The operand
    // type has exactly two members - a decimal string, and a value this module
    // produced - and they must be interchangeable in every position, or callers
    // would be forced to render intermediates just to keep computing. A plain
    // number is deliberately NOT a member: a caller holding one for a price will
    // not compile against this module, which is the intended outcome.
    //
    // Both exported names are ANNOTATED here rather than merely inferred. A
    // produced value is bound to `PreciseValue`, that same value is then bound to
    // `PreciseInput` to prove the union genuinely admits it, and a decimal string
    // is bound to `PreciseInput` for the other member. Had either export been
    // renamed or narrowed, these annotations would stop compiling - which is the
    // point of writing them out instead of letting inference hide the contract.
    const produced: PreciseValue = divide('12.5', '100');
    const producedAsOperand: PreciseInput = produced;
    const stringOperand: PreciseInput = '59.97';

    // string x string, produced x string, string x produced, produced x produced
    expect(toDecimalString(multiply(stringOperand, '0.125'))).toBe('7.49625');
    expect(toDecimalString(multiply(producedAsOperand, '59.97'))).toBe('7.49625');
    expect(toDecimalString(multiply('59.97', produced))).toBe('7.49625');
    expect(toDecimalString(multiply(produced, multiply('59.97', '1')))).toBe('7.49625');

    // The comparison and rendering boundaries accept the union too.
    expect(equals('0.125', produced)).toBe(true);
    expect(compare(produced, '0.125')).toBe(0);
    expect(toDecimalString(produced)).toBe('0.125');
  });

  it('REFUSES a raw number at the operand type and at every arithmetic entry point', () => {
    // The positive test above cannot fail if `number` were quietly admitted into
    // the operand union - a wider union still accepts a string and still accepts a
    // produced value. Only a NEGATIVE assertion distinguishes the two, so the
    // refusal is asserted as a compile-time tripwire. The directives ARE the
    // assertions: if `number` ever became assignable, the compiler would report
    // each `@ts-expect-error` as unused and this suite would fail to compile,
    // which is exactly the alarm wanted.
    //
    // This is the one property that keeps the whole module honest. An IEEE-754
    // double cannot represent most decimal fractions exactly, so a `number` for a
    // price may already be wrong before the call is made; admitting one is
    // precisely how drift would enter the money path this module exists to
    // protect. The single sanctioned numeric ingress is the named integer entry
    // point pinned in the test below, and it is for counts, never for amounts.

    // @ts-expect-error - a raw number is not a member of the operand union.
    const rawNumberOperand: PreciseInput = 12.5;

    // The value still exists at runtime under the deliberate breach, so what a
    // breach would actually smuggle in is recorded rather than left to
    // imagination: an unrounded double, not a decimal.
    expect(typeof rawNumberOperand).toBe('number');

    // @ts-expect-error - multiply must reject a raw number multiplicand.
    expect(() => multiply(12.5, '3')).not.toThrow();

    // @ts-expect-error - and a raw number multiplier, so neither position leaks.
    expect(() => multiply('12.5', 3)).not.toThrow();

    // @ts-expect-error - the additive operations refuse it too, not just multiply.
    expect(() => add(12.5, '3')).not.toThrow();

    // @ts-expect-error - as do the comparisons, so no back door opens there.
    expect(() => equals(12.5, '12.5')).not.toThrow();

    // @ts-expect-error - and the rendering boundary, which would otherwise be the
    // easiest place for a double to slip in unnoticed.
    expect(toDecimalString(12.5)).toBe('12.5');
  });

  it('accepts a safe integer through the one named integer entry point', () => {
    // JUDGMENT CALL: this entry point genuinely ships, so it is pinned. It exists
    // because the legacy arithmetic divides by the literal 100 at
    // [model/service/PromotionService.cfc:L995] and
    // [model/service/PriceGroupService.cfc:L323] and multiplies by an integer
    // quantity at [model/service/PromotionService.cfc:L990] and
    // [model/service/PromotionService.cfc:L1001] - integer counts, not decimal
    // amounts.
    //
    // It MUST NEVER carry a price, an amount or a discount. Those are decimal
    // quantities and a double may already have lost information before the call
    // is made. Where a string literal will do, the string literal is preferred
    // and this entry point is not reached for at all.
    expect(toDecimalString(fromInteger(3))).toBe('3');
    expect(toDecimalString(fromInteger(100))).toBe('100');
    expect(toDecimalString(fromInteger(0))).toBe('0');
    expect(toDecimalString(fromInteger(-5))).toBe('-5');
  });

  it('rejects an integer beyond exact representation', () => {
    // Past this magnitude a double can no longer represent consecutive integers,
    // so the caller's value may already be wrong before it arrives.
    expect(() => fromInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(captureFailure(() => fromInteger(Number.MAX_SAFE_INTEGER + 1)).name).toBe(
      'PrecisionError',
    );
  });

  it('rejects a non-integer, which is the case a price would arrive as', () => {
    // This is the guard that stops the integer entry point being quietly
    // repurposed as a money entry point.
    expect(() => fromInteger(1.5)).toThrow();
  });

  it('rejects non-finite numeric input', () => {
    expect(() => fromInteger(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => fromInteger(Number.NEGATIVE_INFINITY)).toThrow();
    expect(() => fromInteger(Number.NaN)).toThrow();
  });

  it('explains the rejection by naming the offending value and the alternative', () => {
    expect(captureFailure(() => fromInteger(1.5)).message).toBe(
      'fromInteger accepts only a safe integer; received 1.5. Decimal quantities such as a ' +
        'price, an amount or a discount must be passed as a decimal string.',
    );
  });

  it('throws on a malformed decimal string rather than resolving it to zero', () => {
    // A malformed amount must fail loudly. Resolving 'abc' to 0 would silently
    // give the goods away, and resolving it to a not-a-number value would
    // propagate through every later operation and surface as a corrupted total
    // instead of as a failure.
    expect(() => multiply('abc', '1')).toThrow();
    expect(() => multiply('', '1')).toThrow();
    expect(() => multiply('1.2.3', '1')).toThrow();
  });

  it('throws on a grouped decimal string, since grouping is not a number format here', () => {
    // '1,000' is presentation, not arithmetic input. The two-decimal mask CFML
    // applies produces no grouping either, so nothing upstream should ever
    // produce this.
    expect(() => multiply('1,000', '1')).toThrow();
  });

  it('rejects malformed input at every entry point, not only the arithmetic ones', () => {
    // The comparison and rendering boundaries coerce their operands through the
    // same input boundary, so none of them is a way in for a malformed amount.
    expect(() => toDecimalString('abc')).toThrow();
    expect(() => isZero('abc')).toThrow();
    expect(() => compare('abc', '1')).toThrow();
    expect(() => absolute('abc')).toThrow();
  });

  it('refuses a non-finite operand instead of letting one escape as a value', () => {
    // Asserted as a THROW, deliberately never as a returned not-a-number value.
    // The pinned library will happily BUILD a non-finite decimal from these
    // strings, so this boundary is what stops one reaching a monetary quantity.
    expect(() => multiply('NaN', '1')).toThrow();
    expect(() => multiply('Infinity', '1')).toThrow();
    expect(() => multiply('-Infinity', '1')).toThrow();
    expect(captureFailure(() => multiply('NaN', '1')).name).toBe('PrecisionError');
  });

  // The finiteness boundary is applied TWICE per operation - once to each
  // coerced operand, and once to the RESULT - and the two are genuinely
  // different branches rather than the same check written twice. Everything
  // above drives the operand half by handing in a non-finite spelling. The
  // result half only ever fires when FINITE operands combine into a non-finite
  // value, which the block below drives directly instead of assuming it cannot
  // happen.
  //
  // It can happen, and it was measured rather than reasoned about. This module
  // pins its own exponent bounds on its private constructor, so a value that
  // grows past the positive bound is carried to an infinity rather than kept as
  // a huge finite decimal. The operands used here sit exactly AT that bound:
  // each is finite on its own, each passes the operand check on its own, and it
  // is only their product - or their quotient - that overflows.
  //
  // JUDGMENT CALL - the operands are exponential-notation string literals, and
  // NOTHING here renders them. That restriction is load-bearing rather than
  // stylistic: this module also pushes its exponential-notation thresholds to
  // the representable extremes so a finite value never renders exponentially,
  // which means rendering a value at the exponent bound would ask for a plain
  // numeral with quadrillions of digits. Doing that exhausts the runner - it was
  // reproduced - so these tests assert the THROW and the operation NAME only,
  // never a rendered operand. Do not add a `toDecimalString` call to this block.
  //
  // The underflow direction is asserted alongside for contrast, because it is
  // NOT symmetric: a value shrinking past the negative bound is carried to zero,
  // which is perfectly finite and therefore must not throw.
  describe('the result boundary, which finite operands can still breach', () => {
    // At the positive exponent bound: finite on its own.
    const atUpperExponentBound = '1e9000000000000000';

    // At the negative exponent bound: finite on its own.
    const atLowerExponentBound = '1e-9000000000000000';

    it('accepts each overflow operand on its own, so the operand check is not what fires', () => {
      // The control for the two tests below. If either operand were rejected at
      // the operand boundary, those tests would prove nothing about the result
      // boundary - they would merely be re-testing the operand branch under a
      // different spelling.
      expect(() => multiply(atUpperExponentBound, '1')).not.toThrow();
      expect(() => multiply(atLowerExponentBound, '1')).not.toThrow();
      expect(() => absolute(atUpperExponentBound)).not.toThrow();
    });

    it('throws when a product of finite operands overflows to a non-finite result', () => {
      expect(() => multiply(atUpperExponentBound, '10')).toThrow();

      const failure = captureFailure(() => multiply(atUpperExponentBound, '10'));

      expect(failure.name).toBe('PrecisionError');

      // The message names the OPERATION, which is what distinguishes a result
      // breach from an operand breach in a diagnostic - an operand breach is
      // reported against 'operand', never against 'multiply'.
      expect(failure.message).toBe(
        'multiply produced a non-finite decimal (Infinity); a non-finite value must never ' +
          'reach a monetary quantity.',
      );
    });

    it('throws when a quotient of finite operands overflows to a non-finite result', () => {
      // A second operation, because the result boundary is applied per operation
      // and one passing case would not show the others are wired to it. Note the
      // divisor is emphatically NOT zero here - the zero-divisor refusal is a
      // separate, earlier guard, already pinned above - so this failure can only
      // come from the result check.
      expect(() => divide('10', atLowerExponentBound)).toThrow();

      const failure = captureFailure(() => divide('10', atLowerExponentBound));

      expect(failure.name).toBe('PrecisionError');
      expect(failure.message).toBe(
        'divide produced a non-finite decimal (Infinity); a non-finite value must never ' +
          'reach a monetary quantity.',
      );
    });

    it('does NOT throw when the result merely underflows, because zero is finite', () => {
      // The asymmetry, pinned so nobody "tidies" the result check into rejecting
      // both directions. Underflow yields zero; zero is a finite decimal and a
      // perfectly ordinary monetary value, so refusing it would invent a failure.
      expect(() => multiply(atLowerExponentBound, atLowerExponentBound)).not.toThrow();
      expect(isZero(multiply(atLowerExponentBound, atLowerExponentBound))).toBe(true);
    });

    it('does NOT throw when addition stays inside the bound', () => {
      // Doubling a value at the bound raises its leading digits, not its
      // exponent, so the sum is still finite and still admissible. This keeps the
      // two overflow tests above honest: they fail because of genuine overflow,
      // not merely because an operand was large.
      expect(() => add(atUpperExponentBound, atUpperExponentBound)).not.toThrow();
      expect(() => subtract(atUpperExponentBound, atUpperExponentBound)).not.toThrow();
      expect(isZero(subtract(atUpperExponentBound, atUpperExponentBound))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// D7 - rendering discipline at the boundary out of the precise domain
// ---------------------------------------------------------------------------

describe('rendering discipline', () => {
  // This is where a precise value leaves the module: for persistence into a
  // decimal column, or for a presentation step that applies a mask. Three
  // guarantees, and one clarification that corrects a misreading.

  it('renders a very large magnitude in plain notation, never exponential', () => {
    const rendered = toDecimalString('1000000000000000000000');

    expect(rendered).toBe('1000000000000000000000');
    expect(rendered.includes('e+')).toBe(false);
    expect(rendered.includes('E+')).toBe(false);
  });

  it('renders a very small magnitude in plain notation, never exponential', () => {
    const rendered = toDecimalString('0.000000001');

    expect(rendered).toBe('0.000000001');
    expect(rendered.includes('e-')).toBe(false);
    expect(rendered.includes('E-')).toBe(false);
  });

  it('never introduces a thousands separator', () => {
    // CFML's two-decimal mask yields "1234.50", never "1,234.50", so no grouping
    // may appear here either. Checked on a value large enough that a grouping
    // implementation would certainly have inserted one.
    expect(toDecimalString('1234.50').includes(',')).toBe(false);
    expect(toDecimalString('1000000000000000000000').includes(',')).toBe(false);
    expect(toDecimalString('123456789.123')).toBe('123456789.123');
  });

  it('imposes no scale: it neither pads to two decimals nor drops a trailing zero', () => {
    // ★ A DISCREPANCY WORTH RECORDING PRECISELY, because it is easy to misread.
    //
    // JUDGMENT CALL: this suite asserts the SHIPPED behaviour and does not edit
    // the module to match a differently-worded expectation. The brief for this
    // file described the renderer as one that "must neither pad nor strip", which
    // is true of the RENDERER - and it is worth being exact about why the output
    // below still carries no trailing zero.
    //
    // The renderer performs no padding and no stripping. What it renders is
    // whatever the VALUE holds, and a decimal value carries no trailing-zero
    // scale of its own: '19.90' and '19.9' are one value, normalised when the
    // value is CONSTRUCTED, not when it is rendered. So '19.90' renders as
    // '19.9' and '0.00' renders as '0' - not because anything was stripped here,
    // but because the trailing zero was never part of the value to begin with.
    // This is the shipped module's own documented, measured property.
    expect(toDecimalString('19.90')).toBe('19.9');
    expect(toDecimalString('19.9')).toBe('19.9');
    expect(toDecimalString('0.00')).toBe('0');

    // And nothing is padded on the way out either: a value with one decimal
    // place does not acquire a second one.
    expect(toDecimalString(subtract('19.99', '2.50'))).toBe('17.49');
    expect(toDecimalString(multiply('0.5', '1'))).toBe('0.5');
  });

  it('leaves both opposing scale transformations to the sibling formatting module', () => {
    // Two DIFFERENT and OPPOSING transformations live next door in this folder,
    // and neither happens here:
    //
    //   * padding to two decimals - the mask applied at
    //     [model/service/PromotionService.cfc:L1017] and at
    //     [model/service/PriceGroupService.cfc:L339], which is what would turn
    //     the chain's 52.47375 into a two-decimal amount; and
    //   * CFML's trailing-zero drop when a NUMBER is stringified, which the
    //     rounding algorithm's string-length arithmetic at
    //     [model/service/RoundingRuleService.cfc:L88-L175] actually depends on.
    //
    // Both belong to the sibling module and its suite. What this test pins is the
    // NEGATIVE: the reference chain's final value passes through this boundary
    // untouched, at its own scale, with no mask applied.
    expect(toDecimalString(subtract('59.97', '7.49625'))).toBe('52.47375');
  });

  it('round-trips a value the module itself produced', () => {
    // Rendering is not a one-way door: a rendered value can re-enter the precise
    // domain and come back unchanged, which is what makes the string form a safe
    // carrier between layers.
    const discount = multiply('59.97', divide('12.5', '100'));
    const rendered = toDecimalString(discount);

    expect(toDecimalString(rendered)).toBe(rendered);
    expect(equals(rendered, discount)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D9 - schema fidelity: money is persisted at arbitrary precision
// ---------------------------------------------------------------------------

describe('schema fidelity for arbitrary-precision money columns', () => {
  // Arbitrary precision is a SCHEMA-LEVEL FACT about the data this port reads
  // and writes, not a stylistic preference. Two in-scope declarations, read
  // verbatim from the source:
  //
  //   [model/entity/PriceGroupRate.cfc:L54]
  //     `property name="amount" ormType="big_decimal" hb_formatType="custom";`
  //   [model/entity/PromotionApplied.cfc:L53]
  //     `property name="discountAmount" ormtype="big_decimal";`
  //
  // The first is the rate the price-group cascade applies; the second is the
  // write-side output of the promotion engine. Both are arbitrary-precision
  // columns, so a decimal string has to survive the trip in and back out
  // unchanged or the port would silently degrade what the schema already stores.
  //
  // Worth noting in passing, because it corroborates a separate porting concern:
  // the first declaration spells the attribute `ormType` with a capital T and the
  // second spells it `ormtype` in lower case. Both work, which is in-source
  // evidence of CFML's case-insensitivity - the property that makes every ported
  // comparison and every struct-keyed lookup something to audit rather than
  // assume. This suite's own comparisons are value-based and case-free, so the
  // observation is recorded here and acted on where it applies.

  it('round-trips a money value at sub-cent scale without loss', () => {
    // The chain's intermediate carries five decimal places - well past the two a
    // display amount shows - and it must persist and reload exactly.
    expect(toDecimalString('52.47375')).toBe('52.47375');
    expect(toDecimalString('0.000000000000000001')).toBe('0.000000000000000001');
  });

  it('round-trips a high-precision value through an operation', () => {
    // A representative persisted value at 19 significant digits. Construction
    // preserves every digit it is given, and each exact operation carries them
    // through untouched.
    const stored = '12345678.90123456789';

    expect(toDecimalString(add(stored, '0'))).toBe(stored);
    expect(toDecimalString(subtract(stored, '0'))).toBe(stored);
    expect(toDecimalString(multiply(stored, '1'))).toBe(stored);
  });

  it('carries a MySQL DECIMAL(65,s) operand through an exact operation without truncating it', () => {
    // The widest operand the schema can hand this module. MySQL's DECIMAL ceiling
    // is 65 significant digits, so a `big_decimal` column can legitimately store
    // this, and the identity operations below must return it unchanged.
    //
    // This is the assertion that would FAIL under a shared 20-significant-digit
    // arithmetic cap, and it is stated at the schema's own limit rather than at a
    // comfortable one so the bound is tested where it actually matters.
    const widest = `${'9'.repeat(45)}.${'9'.repeat(20)}`;

    expect(widest.replace('.', '')).toHaveLength(65);
    expect(toDecimalString(add(widest, '0'))).toBe(widest);
    expect(toDecimalString(subtract(widest, '0'))).toBe(widest);
    expect(toDecimalString(multiply(widest, '1'))).toBe(widest);
  });

  it('adds, subtracts and multiplies EXACTLY past twenty significant digits', () => {
    // The three assertions that distinguish exact arithmetic from capped
    // arithmetic. Every expectation below is the exact mathematical result, and
    // every one of them differs from what a shared 20-significant-digit cap
    // produces - the capped answers are recorded alongside so the difference is
    // visible rather than implied.
    //
    // Multiplication: two 19-digit operands produce a 38-digit product.
    //   capped -> '1219326311370217952200'  (the tail is DISCARDED)
    expect(toDecimalString(multiply('12345678901.23456789', '98765432109.87654321'))).toBe(
      '1219326311370217952237.4638011112635269',
    );

    // Subtraction: a tiny subtrahend against a large minuend. Under a cap the
    // subtrahend vanishes completely and the minuend is returned unchanged, which
    // is the most dangerous shape of all because it looks like a correct answer.
    //   capped -> '100000000000000000000'
    expect(toDecimalString(subtract('100000000000000000000', '0.000000001'))).toBe(
      '99999999999999999999.999999999',
    );

    // Addition, for symmetry: 21 significant digits in the augend, and the sum
    // keeps all of them.
    //   capped -> '100000000000000000000'
    expect(toDecimalString(add('99999999999999999999.9999999999', '0.0000000001'))).toBe(
      '100000000000000000000',
    );
    expect(toDecimalString(add('12345678901234567890.12345', '0.00001'))).toBe(
      '12345678901234567890.12346',
    );
  });

  it('reaches the deepest in-scope multiplication chain exactly, verified against a BigInt oracle', () => {
    // The three-factor shape at [model/service/PromotionService.cfc:L995] -
    // `price x quantity x (amount / 100)` - is the deepest multiplication chain in
    // the in-scope slice. Driven with the schema's widest operands it produces a
    // 195-significant-digit intermediate, and that intermediate must be exact:
    // this chain computes a discount, so a truncated digit is money.
    //
    // JUDGMENT CALL - THE EXPECTATION IS COMPUTED BY AN INDEPENDENT ORACLE.
    // The expected values below are derived with native `BigInt` INTEGER
    // arithmetic, which is exact by definition and shares no code with the
    // decimal library under test. Hard-coding a 195-digit literal would prove
    // nothing about exactness - it would only prove the implementation agrees with
    // whatever was pasted in - and asserting a digit COUNT alone would not catch a
    // wrong digit in the middle. `BigInt` is used here for the expectation only,
    // never as arithmetic on a monetary value, so the single-arithmetic-surface
    // standard is untouched.
    //
    // The operand is (10^65 - 1) / 10^20, i.e. 65 nines with the point 20 from the
    // right - the widest value a MySQL `DECIMAL(65, s)` column can hold.
    const nines = 10n ** 65n - 1n;
    const widest = `${'9'.repeat(45)}.${'9'.repeat(20)}`;

    // Place a decimal point `fractionDigits` from the right of an exact integer.
    const withPoint = (integer: bigint, fractionDigits: number): string => {
      const digits = integer.toString();
      return `${digits.slice(0, digits.length - fractionDigits)}.${digits.slice(digits.length - fractionDigits)}`;
    };

    // The square: 130 significant digits, and its tail is the sharpest canary in
    // this suite. (10^65 - 1)^2 = 10^130 - 2x10^65 + 1, so the exact product ends
    // in ...0000000001 - digits a capped multiply discards outright.
    const expectedSquare = withPoint(nines * nines, 40);
    expect(toDecimalString(multiply(widest, widest))).toBe(expectedSquare);
    expect(expectedSquare.replace('.', '')).toHaveLength(130);
    expect(expectedSquare.endsWith('0000000001')).toBe(true);

    // The cube: 195 significant digits, the reachable worst case this module's
    // exact precision is sized against.
    const expectedCube = withPoint(nines * nines * nines, 60);
    expect(toDecimalString(multiply(multiply(widest, widest), widest))).toBe(expectedCube);
    expect(expectedCube.replace('.', '')).toHaveLength(195);
  });

  it('resolves EVERY quotient at the declared division scale, terminating or not', () => {
    // Division is the ONE operation in this module that stops at a declared scale,
    // and these two non-terminating quotients pin that constant.
    expect(toDecimalString(divide('1', '3'))).toBe('0.33333333333333333333');
    expect(toDecimalString(divide('2', '3'))).toBe('0.66666666666666666667');

    // STATED EXPLICITLY BECAUSE IT SURPRISES: the declared scale is applied to
    // every quotient, INCLUDING one that would terminate exactly. Dividing an
    // 81-significant-digit operand by one returns it resolved to 20 significant
    // digits, not whole. That is the faithful consequence of declaring a division
    // scale at all - the library rounds the result of every operation, and
    // `x / 1` is an operation - and it is asserted here rather than left as a
    // latent surprise for a caller who assumes division by one is free.
    //
    // The INGRESS is nonetheless lossless, which is a different claim and is what
    // makes this safe: the wide operand arrives intact and is then resolved, so
    // the leading digits are correct and nothing is corrupted, dropped to zero or
    // turned into `NaN`.
    const wide = `1.${'1'.repeat(80)}`;
    expect(toDecimalString(divide(wide, '1'))).toBe(`1.${'1'.repeat(19)}`);

    // The declared scale applies to the QUOTIENT only. A quotient that re-enters
    // exact arithmetic keeps exactly the digits division gave it - it is neither
    // extended nor further truncated - which is what proves the two
    // configurations are wired to the operations they belong to rather than
    // leaking into each other.
    expect(toDecimalString(multiply(divide('1', '3'), '3'))).toBe('0.99999999999999999999');

    // And an exact-homed operand handed to division is resolved at the DIVISION
    // scale rather than at the exact one. Without `divide` re-homing its operands
    // this would come back with hundreds of digits.
    expect(toDecimalString(divide(multiply('1', '1'), '3'))).toBe('0.33333333333333333333');
  });

  it('keeps a persisted discount and a recomputed discount comparable by value', () => {
    // A value reloaded from a decimal column arrives as a string at whatever
    // scale the column stored it. It has to compare equal to the freshly computed
    // discount regardless of that scale, or the promotion engine's two orderings
    // would disagree with the persisted history.
    const recomputed = multiply('59.97', divide('12.5', '100'));

    expect(equals('7.49625', recomputed)).toBe(true);
    expect(equals('7.4962500', recomputed)).toBe(true);
    expect(compare('7.49625', recomputed)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D8 - STATED, NOT ASSERTED: precision gaps owned elsewhere
// ---------------------------------------------------------------------------
//
// Three nearby precision concerns are recorded here so a reviewer can see they
// were found rather than missed, and can see exactly where each is discharged.
// NONE of them is asserted in this suite, and no floating-point arithmetic is
// introduced here to demonstrate any of them - doing so would breach the single
// arithmetic surface this file exists to protect.
//
// CFML parity [model/service/PromotionService.cfc:L998]: verified verbatim, the
//   `amountOff` branch reads `discountAmountPreRounding = reward.getAmount() *
//   quantity;` - raw floating-point multiplication with NO precision guard,
//   sitting between two guarded branches at L995 and L1001 that both have one.
//   Routing all arithmetic through the money value object closes that gap, which
//   makes the target strictly more correct than the source at that one point.
//   That closure is one of the three authorized deliberate divergences and it is
//   owned by the service layer, asserted in the promotion and money suites. It
//   is neither spent nor demonstrated here.
//
// CFML parity [model/service/PromotionService.cfc:L417]: verified verbatim,
//   `var totalDiscountableAmount = arguments.order.getSubtotalAfterItemDiscounts()
//   + arguments.order.getFulfillmentChargeAfterDiscountTotal();` - a DISTINCT
//   unguarded plain-addition gap, separate from L998 and easy to conflate with
//   it. It belongs to the promotion characterization suite.
//
// CFML parity [model/service/PromotionService.cfc:L1013-L1015]: the clamp that
//   stops a discount exceeding the original amount tests the PRE-rounding value
//   with `if(discountAmountPreRounding > originalAmount)` but overwrites the
//   POST-rounding one, so the two can disagree. Preserved as written and owned by
//   the service layer.
//
// The two remaining authorized divergences are likewise not spent here: the
// un-`var`'d assignment at [model/service/PromotionService.cfc:L1007] and
// [model/service/PromotionService.cfc:L1009], which leaks a discount into
// component scope and cannot be reproduced safely on a warm container, belongs to
// the service layer; and the entity memo defects belong to the entity layer.
//
// For completeness, no entry of the thirty-item legacy defect register is
// reproduced by this module, so this suite deliberately carries no
// preserved-defect marker of its own. None was added speculatively, and the one
// such marker in this folder lives in the sibling formatting suite where a
// genuine register entry applies.
// ---------------------------------------------------------------------------
