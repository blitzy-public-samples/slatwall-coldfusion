// slatwall-ts - RoundingRuleService: the decimal-STRING rounding algorithm.
//
// Read this before reading the code: `roundValue` is not numeric rounding.
//
// These were produced by executing the legacy algorithm, and every one of them is reproduced by
// the implementation below.
//
// Both of the migration's must-preserve money paths reach it: * Promotion discount math.

// IMPORTS - narrow, named, and every one of them used.
//
// Type-only imports are separate statements rather than inline `{ type X }` specifiers.

import type { RoundingRule, RoundingRuleDirection } from '../domain/entities/roundingRule.js';
import type { PromotionRepository } from '../domain/ports/promotionRepository.js';
import { Money } from '../domain/valueObjects/money.js';
import { listGetAt, listLen } from '../lib/cfml/list.js';
import type { DecimalString } from '../lib/cfml/numberFormat.js';
import {
  cfNumberToString,
  cfNumericEquals,
  numberFormat,
  toDecimalString,
} from '../lib/cfml/numberFormat.js';
import type { PreciseValue } from '../lib/cfml/precision.js';
import { absolute, add, isGreaterThan, isLessThan, subtract } from '../lib/cfml/precision.js';
import { cfEquals, cfFoldKey, structGet, structKeyExists } from '../lib/cfml/struct.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';

/**
 * The durable half of `super.save` for one rounding rule.
 */
export interface RoundingRuleFrameworkWrites {
  /**
   * Insert or update one rounding rule and answer the persisted row.
   *
   * The implementation decides insert versus update from `rule.isNew()`
   * [model/entity/RoundingRule.cfc:L52, `unsavedvalue=""`] and stamps the four audit columns.
   *
   * @param rule The rule to persist, already validated by its caller.
   * @returns The persisted rule, carrying its minted identifier and audit stamps.
   */
  saveRoundingRule(rule: RoundingRule): Promise<RoundingRule>;
}

/**
 * One save-context rule of `model/validation/RoundingRule.json` that a rule did not satisfy.
 *
 * The dilemma was real and it had a THIRD horn, which is the one the legacy takes: publish the
 * error collection.
 */
export interface RoundingRuleSaveContextError {
  /**
   * The property the rule is declared on, spelled as the JSON spells it. Used as the error name.
   */
  readonly propertyIdentifier: string;

  /**
   * The rule, stated in the terms the JSON rule uses.
   */
  readonly errorMessage: string;
}

/**
 * Copy every populatable column the payload carries onto the rule, before validation reads it.
 *
 * A blank value is stored as blank rather than clearing the column, and that differs from
 * `populateProduct`'s nullable columns for a reason the framework states: its clearing arm needs
 * `trim(value) == ""`.
 *
 * @param rule The entity being saved.
 * @param data The save payload.
 */
function populateRoundingRule(rule: RoundingRule, data: RoundingRuleSaveInput): void {
  if (structKeyExists(data, 'roundingRuleName')) {
    const roundingRuleName = structGet(data, 'roundingRuleName');

    if (typeof roundingRuleName === 'string') {
      rule.setRoundingRuleName(roundingRuleName.trim());
    }
  }

  if (structKeyExists(data, 'roundingRuleExpression')) {
    const roundingRuleExpression = structGet(data, 'roundingRuleExpression');

    if (typeof roundingRuleExpression === 'string') {
      rule.setRoundingRuleExpression(roundingRuleExpression.trim());
    }
  }

  if (structKeyExists(data, 'roundingRuleDirection')) {
    const roundingRuleDirection = structGet(data, 'roundingRuleDirection');

    if (typeof roundingRuleDirection === 'string') {
      rule.setRoundingRuleDirection(roundingRuleDirection.trim());
    }
  }
}

/**
 * Four rules are declared and three are enforced here, because the fourth is a `"delete"` rule and
 * this is the save path.
 *
 * `required` is CFML `required`, which is a length test and not a null test.
 */
function collectSaveContextErrors(rule: RoundingRule): RoundingRuleSaveContextError[] {
  const errors: RoundingRuleSaveContextError[] = [];

  if (!cfTruthy(cfLen(rule.getRoundingRuleName()))) {
    errors.push({
      propertyIdentifier: 'roundingRuleName',
      errorMessage: 'roundingRuleName is required',
    });
  }

  if (!cfTruthy(cfLen(rule.getRoundingRuleExpression()))) {
    errors.push({
      propertyIdentifier: 'roundingRuleExpression',
      errorMessage: 'roundingRuleExpression is required',
    });
  } else if (!rule.hasExpressionWithListOfNumericValuesOnly()) {
    // The second qualifier on the same property runs only when `required` passed.
    errors.push({
      propertyIdentifier: 'roundingRuleExpression',
      errorMessage:
        'roundingRuleExpression must satisfy hasExpressionWithListOfNumericValuesOnly - every list ' +
        'element must be numeric and carry exactly two digits after the decimal point',
    });
  }

  if (!cfTruthy(cfLen(rule.getRoundingRuleDirection()))) {
    errors.push({
      propertyIdentifier: 'roundingRuleDirection',
      errorMessage: 'roundingRuleDirection is required',
    });
  }

  return errors;
}

/**
 * The direction argument of {@link RoundingRuleService.roundValue} - the TYPE AAP 0.4.2 NAMES.
 *
 * The NAMING HALF reuses {@link RoundingRuleDirection} - `'Closest' | 'Up' | 'Down'`, the same
 * union the entity module already publishes for its option list.
 *
 * `string & Record<never, never>` rather than `string & {}`: the two are equivalent to the
 * checker, and the empty object literal is what `@typescript-eslint/no-empty-object-type` rejects.
 */
export type RoundingDirection = RoundingRuleDirection | (string & Record<never, never>);

/**
 * The two values the legacy memo stores for one rounding rule.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L72-L74]: the legacy body creates an empty
 * struct and writes exactly two keys into it - `roundingRuleExpression`
 * [model/service/RoundingRuleService.cfc:L73] and `roundingRuleDirection`
 * [model/service/RoundingRuleService.cfc:L74], both read straight off the DAO query.
 */
export interface RoundingRuleDetails {
  /**
   * [model/service/RoundingRuleService.cfc:L73] The raw expression, as stored.
   */
  readonly roundingRuleExpression: string;

  /**
   * [model/service/RoundingRuleService.cfc:L74] The raw direction, unvalidated.
   */
  readonly roundingRuleDirection: RoundingDirection;
}

/**
 * The optional payload handed to {@link RoundingRuleService.saveRoundingRule}, standing in for the
 * legacy `struct data` argument [model/service/RoundingRuleService.cfc:L56].
 *
 * The three keys are the three populatable columns, taken from the entity's own metadata rather
 * than chosen: [model/entity/RoundingRule.cfc:L53-L55].
 */
export interface RoundingRuleSaveInput {
  /**
   * `roundingRuleName` [model/entity/RoundingRule.cfc:L53]. `required` in the save context.
   */
  readonly roundingRuleName?: string | undefined;

  /**
   * `roundingRuleExpression` [model/entity/RoundingRule.cfc:L54]. `required` in the save context,
   * and additionally subject to `hasExpressionWithListOfNumericValuesOnly`.
   */
  readonly roundingRuleExpression?: string | undefined;

  /**
   * `roundingRuleDirection` [model/entity/RoundingRule.cfc:L55]. `required` in the save context.
   */
  readonly roundingRuleDirection?: string | undefined;
}

/**
 * CFML's `isNull(x)`, as a TypeScript type guard.
 *
 * Why this EXISTS at all, given that redeclaring a published helper is forbidden: it declares
 * nothing new.
 *
 * @param value the accumulator or optional value under test.
 * @returns whether the value is absent, exactly as CFML's `isNull` reports it.
 */
function isCfmlNull<TValue>(value: TValue | undefined): value is undefined {
  return isNullish(value);
}

/**
 * The longest a single comma-list member may be before the length-driven allocation.
 */
const MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH = 256;

/**
 * The most comma-list members one expression may carry.
 */
const MAX_ROUNDING_EXPRESSION_MEMBER_COUNT = 256;

/**
 * The longest the WHOLE comma list may be, derived rather than chosen.
 *
 * Every member is at most {@link MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH} characters and there are
 * at most {@link MAX_ROUNDING_EXPRESSION_MEMBER_COUNT} of them.
 */
const MAX_ROUNDING_EXPRESSION_LENGTH =
  MAX_ROUNDING_EXPRESSION_MEMBER_COUNT * (MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH + 1);

/**
 * Raised when a rounding expression is too large to evaluate, as opposed to malformed.
 */
class RoundingExpressionTooLargeError extends Error {
  public constructor(detail: string) {
    super(detail);
    this.name = 'RoundingExpressionTooLargeError';
  }
}

/**
 * Refuses a rounding expression whose SIZE - never whose SHAPE - is beyond evaluation.
 *
 * Checked before the evaluation loop, because a guard that fired mid-loop would already have
 * performed some of the allocations it exists to prevent.
 *
 * @param roundingExpression the raw comma list, as persisted.
 * @throws An error named `RoundingExpressionTooLargeError` naming the limit that was exceeded,
 * with the offending LENGTH but never the offending VALUE.
 */
function assertRoundingExpressionWithinLimits(roundingExpression: string): void {
  if (roundingExpression.length > MAX_ROUNDING_EXPRESSION_LENGTH) {
    throw new RoundingExpressionTooLargeError(
      `A rounding expression may be at most ${String(MAX_ROUNDING_EXPRESSION_LENGTH)} characters ` +
        `in total; this one is ${String(roundingExpression.length)}. That total is the most that ` +
        `${String(MAX_ROUNDING_EXPRESSION_MEMBER_COUNT)} members of ` +
        `${String(MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH)} characters can occupy, so a longer list ` +
        'could not satisfy the per-member limits either. It is checked first because reading a ' +
        'member requires traversing the string.',
    );
  }

  const memberCount = listLen(roundingExpression);

  if (memberCount > MAX_ROUNDING_EXPRESSION_MEMBER_COUNT) {
    throw new RoundingExpressionTooLargeError(
      `A rounding expression may carry at most ${String(MAX_ROUNDING_EXPRESSION_MEMBER_COUNT)} ` +
        `comma-separated members; this one carries ${String(memberCount)}. Each member drives a ` +
        'full candidate evaluation, so the count is bounded before the loop that performs them.',
    );
  }

  for (let i = 1; i <= memberCount; i += 1) {
    const memberLength = listGetAt(roundingExpression, i).length;

    if (memberLength > MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH) {
      throw new RoundingExpressionTooLargeError(
        `A rounding expression member may be at most ` +
          `${String(MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH)} characters; member ${String(i)} is ` +
          `${String(memberLength)}. Member length becomes the exponent of a power of ten ` +
          '[model/service/RoundingRuleService.cfc:L95], so it is bounded before it is used to ' +
          'build one.',
      );
    }
  }
}

/**
 * The step size at [model/service/RoundingRuleService.cfc:L95]:
 * `var rrPower = 1 * (10 ^ (len(rr)-3));`
 *
 * `^` is CFML's EXPONENTIATION operator, not a bitwise xor, and the leading `1 *` is a no-op
 * numeric coercion the legacy author used to force the result into a number.
 *
 * @param exponent `len(rr) - 3`; may be zero or negative.
 * @returns ten raised to `exponent`, as an exact decimal numeral.
 */
function powerOfTen(exponent: number): DecimalString {
  if (exponent >= 0) {
    // 10^0 is '1', 10^1 is '10', 10^2 is '100'.
    return toDecimalString(`1${'0'.repeat(exponent)}`);
  }
  // 10^-1 is '0.1', 10^-2 is '0.01'.
  return toDecimalString(`0.${'0'.repeat(-exponent - 1)}1`);
}

/**
 * CFML's `left(string, count)`.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L98, L103, L110]: all three slices take a
 * PREFIX of a decimal numeral and then concatenate the rounding expression onto it.
 *
 * @param value the numeral to take a prefix of.
 * @param count how many leading characters to keep.
 * @returns the prefix.
 */
function left(value: string, count: number): string {
  return value.slice(0, count);
}

/**
 * The three rounding directions the legacy `switch` carries, spelled exactly as its `case` labels
 * spell them [model/service/RoundingRuleService.cfc:L133, L144, L155].
 *
 * This runtime table is still needed and is not redundant with the type: a type cannot fold case
 * at run time.
 */
const ROUNDING_DIRECTIONS: readonly string[] = Object.freeze(['Closest', 'Up', 'Down']);

/**
 * The canonical spelling of a rounding direction, matched without regard to case.
 *
 * `cfEquals` is used rather than a local `toLowerCase()` comparison because
 * `src/lib/cfml/struct.ts` already owns CFML case-insensitive string identity for this subtree.
 *
 * @param roundingDirection the direction as supplied or as persisted, in any case.
 * @returns the canonical spelling when the token is one of the three, otherwise the token exactly
 * as received.
 */
function canonicalRoundingDirection(roundingDirection: string): string {
  return (
    ROUNDING_DIRECTIONS.find((candidate: string) => cfEquals(candidate, roundingDirection)) ??
    roundingDirection
  );
}

/**
 * The ported `RoundingRuleService` [model/service/RoundingRuleService.cfc:L49-L204].
 */
export class RoundingRuleService {
  /**
   * Rounding-rule details already resolved during this request, keyed by identifier.
   *
   * CFML parity [model/service/RoundingRuleService.cfc:L53]: `variables.roundingRuleDetails = {};`
   * a component-level struct initialised at declaration scope, populated by
   * `getRoundingRuleDetailsByID` [model/service/RoundingRuleService.cfc:L67-L77] and evicted from
   * by `saveRoundingRule` [model/service/RoundingRuleService.cfc:L57-L61].
   */
  private readonly roundingRuleDetails = new Map<string, Promise<RoundingRuleDetails>>();

  /**
   * CFML parity [model/service/RoundingRuleService.cfc:L51]: the declaration carries an EXPLICIT
   * `type="any"`, which is unusual among the in-scope services - the others declare the property
   * bare.
   *
   * @param promotionRepository Replaces the legacy `property name="roundingRuleDAO" type="any";`
   * [model/service/RoundingRuleService.cfc:L51], the component's one and only collaborator; the
   * rounding-rule read is satisfied through the sale-price path this port already declares.
   * @param frameworkWrites The persistence seam standing in for `super.save`
   * [org/Hibachi/HibachiService.cfc:L151-L167].
   */
  constructor(
    private readonly promotionRepository: PromotionRepository,
    private readonly frameworkWrites: RoundingRuleFrameworkWrites,
  ) {}

  /**
   * Saves a rounding rule and evicts its cached expression, which is the whole point of the legacy
   * override [model/service/RoundingRuleService.cfc:L55-L64].
   *
   * @param rule The rule being saved.
   * @param data The legacy `struct data`.
   * @param context The legacy `context`, defaulting to `"save"` exactly as
   * [model/service/RoundingRuleService.cfc:L56] declares.
   * @returns The same entity either way [org/Hibachi/HibachiService.cfc:L167]: the persisted row as
   * it now stands when it validated, and the unsaved rule carrying its errors when it did not.
   */
  async saveRoundingRule(
    rule: RoundingRule,
    data?: RoundingRuleSaveInput,
    context: string = 'save',
  ): Promise<RoundingRule> {
    // The `isNew()` gate is kept even though it is redundant against the inner test - a rule that
    // has never been saved has an empty identifier [model/entity/RoundingRule.cfc:L52], which no
    // memo entry can be keyed by.
    if (!rule.isNew()) {
      // CFML parity [model/service/RoundingRuleService.cfc:L58-L59]: the `structKeyExists` test
      // then `structDelete` pair is expressed locally as `has` then `delete`.
      const memoKey = cfFoldKey(rule.getRoundingRuleID());
      if (this.roundingRuleDetails.has(memoKey)) {
        this.roundingRuleDetails.delete(memoKey);
      }
    }

    // STEP 1 - POPULATE [org/Hibachi/HibachiService.cfc:L145]: if(structKeyExists(arguments,
    // "data")) { arguments.entity.populate(arguments.data); }.
    //
    // The guard is the legacy's own `structKeyExists(arguments, "data")`, which is an argument
    // presence test, not a key test - so it becomes `data !== undefined` on an optional parameter.
    if (data !== undefined) {
      populateRoundingRule(rule, data);
    }

    // Step 2 - validate [org/Hibachi/HibachiService.cfc:L150], on the populated entity.
    const errors = cfEquals(context, 'save') ? collectSaveContextErrors(rule) : [];
    if (errors.length > 0) {
      for (const error of errors) {
        rule.addError(error.propertyIdentifier, error.errorMessage);
      }

      return rule;
    }

    // STEP 3 - the durable half [org/Hibachi/HibachiService.cfc:L153-L155].
    return await this.frameworkWrites.saveRoundingRule(rule);
  }

  /**
   * Ported 1:1 from
   * `public struct function getRoundingRuleDetailsByID(required string roundingRuleID)`
   * [model/service/RoundingRuleService.cfc:L67-L77].
   *
   * @param roundingRuleID Identifier of the rule to resolve.
   * @returns The rule's expression and direction, exactly the two keys the legacy memo stored.
   * @throws Error when no rule carries the identifier, reproducing the legacy zero-row column
   * read.
   */
  async getRoundingRuleDetailsByID(roundingRuleID: string): Promise<RoundingRuleDetails> {
    // Legacy [model/service/RoundingRuleService.cfc:L68]:
    // if(!structKeyExists(variables.roundingRuleDetails, arguments.roundingRuleID)) A `Map.get`
    // miss and a stored `undefined` are indistinguishable in general.
    //
    // The key is folded and the entry is the in-flight promise - both properties are explained on
    // the field.
    const memoKey = cfFoldKey(roundingRuleID);
    const memoized = this.roundingRuleDetails.get(memoKey);

    if (memoized !== undefined) {
      return await memoized;
    }

    const resolution = this.resolveRoundingRuleDetails(roundingRuleID);
    this.roundingRuleDetails.set(memoKey, resolution);

    // A failed read is forgotten, never cached.
    resolution.catch((): void => {
      if (this.roundingRuleDetails.get(memoKey) === resolution) {
        this.roundingRuleDetails.delete(memoKey);
      }
    });

    return await resolution;
  }

  /**
   * The repository half of `getRoundingRuleDetailsByID`, extracted so the memo above can hold one
   * promise per identifier.
   *
   * @param roundingRuleID the caller's ORIGINAL spelling, which is what the predicate binds.
   * @returns the two-key frozen details object the legacy memo stored.
   * @throws Error when no rule carries the identifier, reproducing the legacy zero-row column
   * read.
   */
  private async resolveRoundingRuleDetails(roundingRuleID: string): Promise<RoundingRuleDetails> {
    const detailsQuery = await this.promotionRepository.getRoundingRuleQuery(roundingRuleID);

    if (isCfmlNull(detailsQuery)) {
      throw new Error(
        `No rounding rule carries the identifier ${JSON.stringify(roundingRuleID)}. ` +
          'The legacy query [model/service/RoundingRuleService.cfc:L70] yields zero rows in ' +
          'this case and [L73-L74] then fail reading columns off the empty result; that ' +
          'failure is reproduced rather than masked with a substituted default.',
      );
    }

    // Legacy [model/service/RoundingRuleService.cfc:L72-L74]: an empty struct is created and
    // exactly two keys are written into it.
    //
    // CFML parity [model/service/RoundingRuleService.cfc:L73-L74]: `?? ''` restores the CFML
    // query-column rendering of a SQL NULL.
    return Object.freeze({
      roundingRuleExpression: detailsQuery.getRoundingRuleExpression() ?? '',
      roundingRuleDirection: detailsQuery.getRoundingRuleDirection() ?? '',
    });
  }

  /**
   * Ported 1:1 from
   * `public numeric function roundValueByRoundingRuleID(required any value, required string roundingRuleID)`
   * [model/service/RoundingRuleService.cfc:L79-L82].
   *
   * @param value The amount to round.
   * @param roundingRuleID Identifier of the rule to apply.
   * @returns The rounded amount.
   * @throws Error when no rule carries the identifier - see {@link
   * RoundingRuleService.getRoundingRuleDetailsByID}.
   */
  async roundValueByRoundingRuleID(value: Money, roundingRuleID: string): Promise<Money> {
    const details = await this.getRoundingRuleDetailsByID(roundingRuleID);
    return Money.fromDecimalString(
      this.roundValue(value, details.roundingRuleExpression, details.roundingRuleDirection),
    );
  }

  /**
   * Ported 1:1 from
   * `public numeric function roundValueByRoundingRule(required any value, required any roundingRule)`
   * [model/service/RoundingRuleService.cfc:L84-L86].
   *
   * Reads the rule's own expression and direction and rounds by them.
   *
   * @param value The amount to round.
   * @param rule The rule supplying the expression and direction.
   * @returns The rounded amount.
   */
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
    return Money.fromDecimalString(
      this.roundValue(value, rule.getRoundingRuleExpression(), rule.getRoundingRuleDirection()),
    );
  }

  /**
   * Rounds one amount by a CFML rounding expression.
   *
   * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88 vs L79, L84]: `roundValue` declares
   * `returntype="string"` while both wrappers declare `numeric` and `PriceGroupService` feeds the
   * result straight into `precisionEvaluate` [model/service/PriceGroupService.cfc:L323, L331]. CFML
   * coerced silently; this returns a branded `DecimalString` and each wrapper converts back to
   * `Money` with a named call.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param value The amount to round.
   * @param roundingExpression A CFML comma list of rounding expressions.
   * @param roundingDirection `'Closest'`, `'Up'` or `'Down'`, matched without regard to case.
   * @returns The rounded numeral, or the two-decimal input when no candidate was selected.
   */
  roundValue(
    value: Money | DecimalString,
    roundingExpression: string = '0.00',
    roundingDirection: RoundingDirection = 'Closest',
  ): DecimalString {
    // Everything downstream depends on this being exactly two decimal places, because the
    // algorithm measures its LENGTH.
    const inputValue = numberFormat(
      typeof value === 'string' ? value : value.toDecimalString(),
      '0.00',
    );
    let returnValue: DecimalString | undefined = undefined;
    let returnDelta: PreciseValue | undefined = undefined;

    // Legacy [model/service/RoundingRuleService.cfc:L93]: for(var i=1;
    // i<=listLen(arguments.roundingExpression); i++)
    //
    // The exposure is `powerOfTen(rr.length - 3)` two lines down: the exponent is the LENGTH of a
    // persisted free-text list member, and `powerOfTen` renders `'0'.repeat(exponent)`.
    assertRoundingExpressionWithinLimits(roundingExpression);

    const expressionCount = listLen(roundingExpression);

    for (let i = 1; i <= expressionCount; i += 1) {
      // Legacy [model/service/RoundingRuleService.cfc:L94]: var rr =
      // listGetAt(arguments.roundingExpression, i); 1-BASED, matching the legacy loop counter
      // exactly.
      const rr = listGetAt(roundingExpression, i);
      const rrPower = powerOfTen(rr.length - 3);

      let valueOptionOne: DecimalString;
      let valueOptionTwo: DecimalString;

      // Legacy [model/service/RoundingRuleService.cfc:L97]: if(len(inputValue) > len(rr)) A
      // STRING-LENGTH comparison, not a value comparison.
      if (inputValue.length > rr.length) {
        valueOptionOne = toDecimalString(left(inputValue, inputValue.length - rr.length) + rr);

        // Legacy [model/service/RoundingRuleService.cfc:L100]: if(valueOptionOne > inputValue)
        // CFML compares two numeric-looking strings by VALUE, so this is a decimal comparison and
        // never a lexical one.
        if (isGreaterThan(valueOptionOne, inputValue)) {
          // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: the
          // intermediate is computed arithmetically and its `len()` is then taken, and CFML drops
          // trailing zeros when it stringifies a number, so any amount whose cents end in zero
          // takes a corrupted branch.
          // Preserved deliberately; do not fix without a product decision.
          const lowerValue = cfNumberToString(subtract(inputValue, rrPower));
          valueOptionTwo =
            lowerValue.length > rr.length
              ? toDecimalString(left(lowerValue, lowerValue.length - rr.length) + rr)
              : toDecimalString(rr);
        } else {
          const higherValue = cfNumberToString(add(inputValue, rrPower));
          valueOptionTwo =
            higherValue.length > rr.length
              ? toDecimalString(left(higherValue, higherValue.length - rr.length) + rr)
              : toDecimalString(rr);
        }
      } else {
        valueOptionOne = toDecimalString(rr);
        valueOptionTwo = toDecimalString(rr);
      }
      if (
        cfNumericEquals(valueOptionOne, inputValue) ||
        cfNumericEquals(valueOptionTwo, inputValue)
      ) {
        return inputValue;
      }

      // The subtraction and the manual sign flip together are absolute value, so `absolute`
      // expresses both - it documents these exact lines as its reason for existing.
      //
      // `'.99'` steps down to -0.58, whose stringified form keeps its leading minus, so the slice
      // produces `'-0'` and the candidate is `'-0.99'`.
      const valueOptionOneDelta = absolute(subtract(inputValue, valueOptionOne));
      const valueOptionTwoDelta = absolute(subtract(inputValue, valueOptionTwo));

      // CFML parity [model/service/RoundingRuleService.cfc:L132]: no default branch; an
      // unrecognised direction returns the input unchanged.
      //
      // One is evaluated first and ASSIGNS `returnDelta`, so by the time option two is tested the
      // null test can no longer succeed and option two needs a STRICTLY smaller delta to displace
      // it.
      switch (canonicalRoundingDirection(roundingDirection)) {
        case 'Closest': {
          if (isCfmlNull(returnDelta) || isLessThan(valueOptionOneDelta, returnDelta)) {
            returnValue = valueOptionOne;
            returnDelta = valueOptionOneDelta;
          }
          if (isCfmlNull(returnDelta) || isLessThan(valueOptionTwoDelta, returnDelta)) {
            returnValue = valueOptionTwo;
            returnDelta = valueOptionTwoDelta;
          }
          break;
        }

        // Legacy [model/service/RoundingRuleService.cfc:L144-L154]: a candidate qualifies only if
        // it sits ABOVE the input, so a direction that no candidate satisfies leaves the
        // accumulators untouched for this expression.
        case 'Up': {
          if (
            isGreaterThan(valueOptionOne, inputValue) &&
            (isCfmlNull(returnDelta) || isLessThan(valueOptionOneDelta, returnDelta))
          ) {
            returnValue = valueOptionOne;
            returnDelta = valueOptionOneDelta;
          }
          if (
            isGreaterThan(valueOptionTwo, inputValue) &&
            (isCfmlNull(returnDelta) || isLessThan(valueOptionTwoDelta, returnDelta))
          ) {
            returnValue = valueOptionTwo;
            returnDelta = valueOptionTwoDelta;
          }
          break;
        }

        // Legacy [model/service/RoundingRuleService.cfc:L155-L165]: the mirror of `Up` - a
        // candidate qualifies only if it sits BELOW the input.
        case 'Down': {
          if (
            isLessThan(valueOptionOne, inputValue) &&
            (isCfmlNull(returnDelta) || isLessThan(valueOptionOneDelta, returnDelta))
          ) {
            returnValue = valueOptionOne;
            returnDelta = valueOptionOneDelta;
          }
          if (
            isLessThan(valueOptionTwo, inputValue) &&
            (isCfmlNull(returnDelta) || isLessThan(valueOptionTwoDelta, returnDelta))
          ) {
            returnValue = valueOptionTwo;
            returnDelta = valueOptionTwoDelta;
          }
          break;
        }
      }
    }

    // Three distinct routes reach the second arm, and all three are live: an empty or
    // whitespace-only expression list, so the loop never ran; an unrecognised direction, so no
    // case matched.
    if (!isCfmlNull(returnValue)) {
      return returnValue;
    }
    return inputValue;
  }
}
