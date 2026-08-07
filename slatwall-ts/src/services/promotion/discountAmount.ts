// slatwall-ts - Promotion discount-amount calculation.
//
// This module is a leaf: it imports no sibling and never imports the facade back, so it closes no
// cycle.
//
// `originalAmount - discountAmountPreRounding` is the NET PRICE the customer would pay once the
// discount is taken off.
//
// [model/service/PromotionService.cfc:L998] the `amountOff` branch escapes arbitrary-precision
// arithmetic. DELIBERATE DIVERGENCE (b) - closed here.

import type { AmountType, PromotionReward } from '../../domain/entities/promotionReward.js';
import type { RoundingRule } from '../../domain/entities/roundingRule.js';
import { Money } from '../../domain/valueObjects/money.js';
import type { DecimalString } from '../../lib/cfml/numberFormat.js';
import { numberFormat } from '../../lib/cfml/numberFormat.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { RoundingRuleService } from '../roundingRuleService.js';

// JUDGMENT CALL: `src/lib/cfml/precision.ts` is not imported, even though it is a permitted
// dependency of this module and every `precisionEvaluate` site in the ported function is an
// arbitrary-precision operation.
//
// The alternatives rejected, and why: * import `precision.ts` directly and call
// `multiply`/`divide`/`subtract`.

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port. Module-local.
 *
 * CFML parity [model/service/PromotionService.cfc:L1005]: `if(!isNull(reward.getRoundingRule()))`
 * the guard that decides whether the inverted-delta rounding branch runs at all.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Does a reward's `amountType` select the given strategy arm, with case folded as CFML folds it?
 *
 * Module-local and deliberately not exported: this module exports exactly one unit.
 *
 * @param subject the reward's persisted `amountType`, which may be absent.
 * @param arm the strategy arm being tested, in the source's canonical spelling.
 * @returns `true` only when the subject is present and equals the arm with case folded.
 */
function matchesAmountType(subject: AmountType | undefined, arm: string): boolean {
  return subject !== undefined && cfEquals(subject, arm);
}

/**
 * Everything the three amount-type strategies may read, assembled once by the caller.
 * Module-local.
 *
 * Each strategy destructures only the operands its own legacy line actually reads.
 */
interface DiscountStrategyOperands {
  /**
   * The reward carrying the amount and the amount type. The strategies read `getAmount()` from it
   * LAZILY, which is load-bearing: see {@link rewardAmountOf}.
   */
  readonly reward: PromotionReward;

  /**
   * `arguments.price` [model/service/PromotionService.cfc:L987] - the UNIT price, not the extended
   * amount. Read only by the `amount` strategy.
   */
  readonly price: Money;

  /**
   * `arguments.quantity` [model/service/PromotionService.cfc:L987] - a COUNT, never money, which
   * is why it stays a plain `number` throughout.
   */
  readonly quantity: number;

  /**
   * `precisionEvaluate('arguments.price * arguments.quantity')`
   * [model/service/PromotionService.cfc:L990] - the extended amount before any discount. Read by
   * the `percentageOff` strategy and by the clamp.
   */
  readonly originalAmount: Money;
}

/**
 * One amount-type strategy: the pre-rounding discount for a single `amountType`.
 *
 * There is deliberately no map from `AmountType` to strategy.
 */
type DiscountAmountStrategy = (operands: DiscountStrategyOperands) => Money;

/**
 * Resolves `reward.getAmount()` for a strategy that is about to use it.
 *
 * @param reward The reward whose `amount` column is about to be used as an operand.
 * @returns The amount, guaranteed present.
 * @throws Error when the column is NULL, reproducing the legacy null-operand failure at
 * [model/service/PromotionService.cfc:L995], [model/service/PromotionService.cfc:L998] or
 * [model/service/PromotionService.cfc:L1001].
 */
function rewardAmountOf(reward: PromotionReward): Money {
  const amount: Money | undefined = reward.getAmount();

  if (isAbsent(amount)) {
    throw new Error(
      'PromotionReward.getAmount() is absent while calculating a discount amount. This ' +
        'reproduces the legacy runtime failure at model/service/PromotionService.cfc:L995, ' +
        'L998 and L1001, where a NULL SwPromoReward.amount column becomes a null operand in ' +
        'CFML arithmetic. There is deliberately no zero substitution: ' +
        'model/entity/PromotionReward.cfc:L61 declares the column with no default, so absence ' +
        'is a real state, and defaulting it to zero would discount by the full original amount.',
    );
  }

  return amount;
}

// The three amount-type strategies.
//
// One per stored `amountType` value, in the order the legacy `switch` declares them
// [model/service/PromotionService.cfc:L993-L1003].
//
// Note the name/value mismatch on the third member, because it is a trap.

/**
 * `amountType === 'percentageOff'`: a percentage off the extended amount.
 *
 * CFML parity [model/service/PromotionService.cfc:L995]:
 * `discountAmountPreRounding = precisionEvaluate('originalAmount * (reward.getAmount()/100)');`
 *
 * The `/100` divisor sits inside the `precisionEvaluate` string, so that division is
 * arbitrary-precision in the legacy code too.
 */
const percentageOffStrategy: DiscountAmountStrategy = ({ reward, originalAmount }) =>
  originalAmount.times(rewardAmountOf(reward).dividedBy(100));

/**
 * `amountType === 'amountOff'`: a flat amount off, per unit.
 *
 * CFML parity [model/service/PromotionService.cfc:L998]:
 * `discountAmountPreRounding = reward.getAmount() * quantity;`
 *
 * CFML parity [model/service/PromotionService.cfc:L998]: the legacy line reads the BARE `quantity`
 * rather than `arguments.quantity`; see the bare-scope note on `getDiscountAmount`.
 */
const amountOffStrategy: DiscountAmountStrategy = ({ reward, quantity }) =>
  rewardAmountOf(reward).times(quantity);

/**
 * `amountType === 'amount'`: a target unit price, with the discount being the difference.
 *
 * CFML parity [model/service/PromotionService.cfc:L1001]: `discountAmountPreRounding =`
 * ` precisionEvaluate('(arguments.price - reward.getAmount()) * arguments.quantity');`
 *
 * This branch computes from `arguments.price` - the unit price - not from `originalAmount`.
 */
const amountStrategy: DiscountAmountStrategy = ({ reward, price, quantity }) =>
  price.minus(rewardAmountOf(reward)).times(quantity);

/**
 * The discount-amount calculation of the promotion engine, extracted from `PromotionService.cfc`
 * as a module of its own. One exported unit, one method; everything above is module-local.
 *
 * CFML parity [model/service/PromotionService.cfc:L987]: the legacy declaration is
 * `private numeric function getDiscountAmount(...)`.
 */
export class DiscountAmountCalculator {
  /**
   * JUDGMENT CALL: the collaborator arrives on the CONSTRUCTOR, which is why this module exports a
   * class rather than a bare function.
   *
   * @param roundingRuleService Supplies `roundValueByRoundingRule`, the one collaborator the
   * ported function calls.
   */
  constructor(private readonly roundingRuleService: RoundingRuleService) {}

  /**
   * Computes what a single promotion reward takes off a single priced quantity.
   *
   * @param reward The reward supplying `amountType`, `amount` and the optional `roundingRule`.
   * @param price The UNIT price the discount is computed against.
   * @param quantity How many units.
   * @returns The discount amount, quantized to two decimal places.
   * @throws Error when the reward's `amount` column is NULL and a strategy matches; see {@link
   * rewardAmountOf}.
   */
  getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money {
    // [model/service/PromotionService.cfc:L988] `var discountAmountPreRounding = 0;` - properly
    // `var`'d in the legacy source, and the seed is load-bearing: it is what an unmatched
    // `amountType` falls through with.
    let discountAmountPreRounding: Money = Money.zero;

    // [model/service/PromotionService.cfc:L989] `var roundedFinalAmount = 0;` - also properly
    // `var`'d, and preserved even though this seed is never observable.
    let roundedFinalAmount: Money = Money.zero;

    // [model/service/PromotionService.cfc:L990]
    // `precisionEvaluate('arguments.price * arguments.quantity')` - the extended amount.
    const originalAmount: Money = price.times(quantity);

    const operands: DiscountStrategyOperands = { reward, price, quantity, originalAmount };

    // [model/service/PromotionService.cfc:L993] `switch(reward.getAmountType())`, read into a
    // named local so the `undefined` the entity can report is visible at the switch.
    const amountType: AmountType | undefined = reward.getAmountType();

    // LEGACY-NOTE [model/service/PromotionService.cfc:L1003]: the switch has no `default:` branch.
    // L1003 closes it immediately after the `amount` case.
    if (matchesAmountType(amountType, 'percentageOff')) {
      discountAmountPreRounding = percentageOffStrategy(operands);
    } else if (matchesAmountType(amountType, 'amountOff')) {
      discountAmountPreRounding = amountOffStrategy(operands);
    } else if (matchesAmountType(amountType, 'amount')) {
      discountAmountPreRounding = amountStrategy(operands);
    }

    // DELIBERATE DIVERGENCE [model/service/PromotionService.cfc:L1007] - divergence (a) of three,
    // register entry 13, closed here.
    //
    // Here the variable is function-local, and the justification is correctness.
    let discountAmount: Money;
    const roundingRule: RoundingRule | undefined = reward.getRoundingRule();

    if (!isAbsent(roundingRule)) {
      // CFML parity [model/service/PromotionService.cfc:L1005-L1007]: the rounding rule is applied
      // to the net price and the discount is derived backwards out of the result - the inverted
      // delta this file opens with.

      // [model/service/PromotionService.cfc:L1006] The named-argument form
      // `roundValueByRoundingRule(value=..., roundingRule=...)`, in the declared parameter order.
      roundedFinalAmount = this.roundingRuleService.roundValueByRoundingRule(
        originalAmount.minus(discountAmountPreRounding),
        roundingRule,
      );

      // [model/service/PromotionService.cfc:L1007]
      // `precisionEvaluate('originalAmount - roundedFinalAmount')` - the derived discount.
      discountAmount = originalAmount.minus(roundedFinalAmount);
    } else {
      // [model/service/PromotionService.cfc:L1008-L1010] no ROUNDING at all on this path: the
      // pre-rounding value passes straight through, unquantized, to the clamp and then to
      // [model/service/PromotionService.cfc:L1017].
      discountAmount = discountAmountPreRounding;
    }

    // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the clamp gates on
    // `discountAmountPreRounding` but assigns to `discountAmount`, so it tests one value and
    // overwrites a different one.
    // Preserved deliberately; do not fix without a product decision.
    if (discountAmountPreRounding.isGreaterThan(originalAmount)) {
      // [model/service/PromotionService.cfc:L1014] The third assignment site of register entry.
      discountAmount = originalAmount;
    }

    // CFML parity [model/service/PromotionService.cfc:L1017]:
    // `return numberFormat(discountAmount, "0.00");` is load-bearing lossy quantization, not
    // cosmetic formatting.
    //
    // The legacy declares `returntype="numeric"` while `numberFormat` returns a string.
    const quantizedDiscountAmount: DecimalString = numberFormat(
      discountAmount.toDecimalString(),
      '0.00',
    );

    return Money.fromDecimalString(quantizedDiscountAmount);
  }
}
