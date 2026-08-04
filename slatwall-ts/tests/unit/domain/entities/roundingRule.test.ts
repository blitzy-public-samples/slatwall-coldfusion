// slatwall-ts - unit suite for `src/domain/entities/roundingRule.ts`.
//
// NET-NEW coverage: no legacy test component constructs a RoundingRule. The scope is the three
// behaviours [model/entity/RoundingRule.cfc] declares over the `SwRoundingRule` row - the pure
// delegation of `roundValue()` [model/entity/RoundingRule.cfc:L66-L68], the three direction options
// [model/entity/RoundingRule.cfc:L70-L76], and `hasExpressionWithListOfNumericValuesOnly()`, which
// no line of CFML calls because [model/validation/RoundingRule.json:L4] names it by string
// [model/entity/RoundingRule.cfc:L78-L86].
//
// The decimal-string rounding algorithm is NOT exercised here: it lives at
// [model/service/RoundingRuleService.cfc:L88-L175] and its measured outputs are characterized by the
// service-tier suite. Every amount below is handed to the collaborator double by the test and comes
// back unchanged.

import { describe, expect, it } from 'vitest';

import { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';
import type {
  RoundingRuleDirection,
  RoundingRuleDirectionOption,
} from '../../../../src/domain/entities/roundingRule.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';

interface RecordedRoundValueCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

/**
 * A hand-written in-memory stand-in for the collaborator the entity delegates to.
 *
 * The single method mirrors [model/service/RoundingRuleService.cfc:L84-L86] -
 * `roundValueByRoundingRule(required any value, required any roundingRule)` - with the two `any`
 * parameters narrowed to `Money` and `RoundingRule`, which is the shape
 * src/domain/entities/roundingRule.ts:L419-L421 declares without `export`. Because the name cannot
 * be imported, structural typing carries the contract: `RoundingRuleService` structurally satisfies
 * it with its own `roundValueByRoundingRule(value: Money, rule: RoundingRule): Money`, and this
 * double satisfies it the same way.
 */
interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  readonly calls: readonly RecordedRoundValueCall[];
}

/**
 * Builds a recording double that answers with the supplied amounts in order, repeating the last one
 * once they run out.
 *
 * Scripting the answers is what makes "delegates on every call" observable: two calls can be given
 * two DIFFERENT answers, so a memoizing entity is caught returning the first answer twice rather
 * than merely calling once. With no scripted answer it replies `Money.zero`, for a subject that
 * never calls `roundValue`.
 *
 * @param results - the answers to hand back, in call order.
 */
function aValueRounder(...results: readonly Money[]): RecordingValueRounder {
  const calls: RecordedRoundValueCall[] = [];

  return {
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      calls.push({ value, rule });

      const scripted = results[Math.min(calls.length - 1, results.length - 1)];

      return scripted ?? Money.zero;
    },
    calls,
  };
}

type RoundingRuleInit = ConstructorParameters<typeof RoundingRule>[0];

type AttachedPriceGroupRate = RoundingRuleInit['priceGroupRates'][number];

/**
 * One materialized `SwPriceGroupRate` row, as an OPAQUE placeholder.
 *
 * JUDGMENT CALL: the delete-context rule this exists to exercise is
 *   `"priceGroupRates": [{"contexts":"delete","maxCollection":0}]`
 * at [model/validation/RoundingRule.json:L6]. It reads a COLLECTION COUNT and nothing else, so the
 * element's identity is irrelevant and no assertion inspects it. `PriceGroupRate` carries private
 * fields and is therefore nominal, so no object literal can satisfy it; one narrowly-scoped TYPE
 * ASSERTION through `unknown`, confined here, is the honest minimum.
 *
 * @param priceGroupRateID - an identifier for legibility in failure output.
 */
function anAttachedPriceGroupRate(priceGroupRateID: string): AttachedPriceGroupRate {
  return { priceGroupRateID } as unknown as AttachedPriceGroupRate;
}

/**
 * Builds the rule under test, fresh, with every unspecified column absent.
 *
 * `roundingRuleID` defaults to `''` because that is what the source declares:
 *   `unsavedvalue="" default=""`
 * at [model/entity/RoundingRule.cfc:L52], so the default subject is an UNSAVED row and `isNew()`
 * answers honestly for it. `priceGroupRates` defaults to `[]`, so `.length` is always a legal
 * question. Every optional slot is typed `?: T | undefined` so a test can pass `undefined` OUT LOUD
 * where the absence is the thing asserted, which `exactOptionalPropertyTypes` makes a distinct
 * type.
 *
 * @param init - the columns to populate.
 * @param valueRounder - the collaborator to inject; a recording double by default.
 */
function aRoundingRule(
  init: {
    readonly roundingRuleID?: string | undefined;
    readonly roundingRuleName?: string | undefined;
    readonly roundingRuleExpression?: string | undefined;
    readonly roundingRuleDirection?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly priceGroupRates?: readonly AttachedPriceGroupRate[] | undefined;
  } = {},
  valueRounder: RecordingValueRounder = aValueRounder(),
): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID: init.roundingRuleID ?? '',
      roundingRuleName: init.roundingRuleName,
      roundingRuleExpression: init.roundingRuleExpression,
      roundingRuleDirection: init.roundingRuleDirection,
      createdDateTime: init.createdDateTime,
      createdByAccountID: init.createdByAccountID,
      modifiedDateTime: init.modifiedDateTime,
      modifiedByAccountID: init.modifiedByAccountID,
      priceGroupRates: init.priceGroupRates ?? [],
    },
    valueRounder,
  );
}

function expressionIsAccepted(roundingRuleExpression: string): boolean {
  return aRoundingRule({ roundingRuleExpression }).hasExpressionWithListOfNumericValuesOnly();
}

const DELETE_CONTEXT_MAX_COLLECTION = 0;

/**
 * The delete-context rule restated literally, for the assertions below only.
 *
 * `"priceGroupRates": [{"contexts":"delete","maxCollection":0}]`
 * [model/validation/RoundingRule.json:L6] means "refuse to delete a rounding rule that price-group
 * rates still reference".
 *
 * THIS IS A SUITE-LOCAL RESTATEMENT AND NOT PRODUCTION ENFORCEMENT. In CFML the rule consulted a
 * live Hibernate lazy collection, so it blocked whenever child rows existed; here it can only
 * consult what a repository chose to materialize, which is why
 * src/domain/entities/roundingRule.ts:L601-L614 rules that real enforcement must be a row-count
 * query owned by the repository. What this function and its three tests establish is narrower: the
 * entity hands the rule the input it needs, without a count of its own.
 *
 * @param rule - the rule a delete is being attempted on.
 * @returns whether the collection is within the declared bound.
 */
function satisfiesDeleteContextRule(rule: RoundingRule): boolean {
  return rule.getPriceGroupRates().length <= DELETE_CONTEXT_MAX_COLLECTION;
}

/**
 * Every member `RoundingRule.prototype` carries, sorted - the interface-parity contract in
 * executable form. Twelve of the thirteen are the legacy CFML names verbatim: the four
 * `accessors=true` getters over [model/entity/RoundingRule.cfc:L52-L55], the two audit timestamp
 * getters [L58, L60], the two opaque account-column getters [L59, L61], the collection getter [L64]
 * and the three declared methods [L66-L86]. The thirteenth, `isNew`, is the one framework member
 * the ported service calls [model/service/RoundingRuleService.cfc:L57].
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getPriceGroupRates',
  'getRoundingRuleDirection',
  'getRoundingRuleDirectionOptions',
  'getRoundingRuleExpression',
  'getRoundingRuleID',
  'getRoundingRuleName',
  'hasExpressionWithListOfNumericValuesOnly',
  'isNew',
  'roundValue',
];

const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = [
  'getNewFlag',
  'getPrimaryIDValue',
  'getPrimaryIDPropertyName',
  'getPrintTemplates',
  'getEmailTemplates',
  'clearAttributeCache',
  'getAttributeValue',
  'getSimpleRepresentation',
  'validate',
  'hasErrors',
  'preInsert',
  'preUpdate',
  'getPriceGroupRatesCount',
  'getPriceGroupRatesSmartList',
  'getPriceGroupRatesStruct',
  'getRoundingRuleDirectionOptionsSmartList',
  'addPriceGroupRate',
  'removePriceGroupRate',
  'setRoundingRuleName',
  'setRoundingRuleExpression',
  'setRoundingRuleDirection',
];

describe('roundValue delegates, and does nothing else', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L66-L68]: the body is one statement,
  //
  //   return getService("roundingRuleService").roundValueByRoundingRule(
  //       value=arguments.value, roundingRule=this);
  //
  // so the whole of this method's behaviour is the crossing. That lookup - the only `getService(`
  // site in the component - is now the injected collaborator.

  it('hands the collaborator the value it was given, and this rule as the rule', () => {
    const answer = Money.fromDecimalString('8.25');
    const valueRounder = aValueRounder(answer);
    const subject = aRoundingRule({ roundingRuleExpression: '.99' }, valueRounder);
    const value = Money.fromDecimalString('123.4567');

    subject.roundValue(value);

    expect(valueRounder.calls).toHaveLength(1);

    const [call] = valueRounder.calls;

    expect(call?.value).toBe(value);

    expect(call?.rule).toBe(subject);
  });

  it('hands over a rule the collaborator can read its expression and direction from', () => {
    const valueRounder = aValueRounder(Money.fromDecimalString('8.25'));
    const subject = aRoundingRule(
      { roundingRuleExpression: '.95,.99', roundingRuleDirection: 'Up' },
      valueRounder,
    );

    subject.roundValue(Money.fromDecimalString('123.4567'));

    const [call] = valueRounder.calls;

    expect(call?.rule.getRoundingRuleExpression()).toBe('.95,.99');
    expect(call?.rule.getRoundingRuleDirection()).toBe('Up');
  });

  it('returns the collaborator answer unchanged, computing nothing of its own', () => {
    const answer = Money.fromDecimalString('8.25');
    const subject = aRoundingRule({ roundingRuleExpression: '.99' }, aValueRounder(answer));

    const result = subject.roundValue(Money.fromDecimalString('123.4567'));

    expect(result).toBe(answer);
    expect(result.toFixed2()).toBe('8.25');
  });

  it('delegates on every call and memoizes nothing', () => {
    const first = Money.fromDecimalString('8.25');
    const second = Money.fromDecimalString('3.50');
    const valueRounder = aValueRounder(first, second);
    const subject = aRoundingRule({ roundingRuleExpression: '.99' }, valueRounder);
    const value = Money.fromDecimalString('123.4567');

    expect(subject.roundValue(value)).toBe(first);
    expect(subject.roundValue(value)).toBe(second);
    expect(valueRounder.calls).toHaveLength(2);
  });

  it('delegates again for the same value even after an identical earlier call', () => {
    const answer = Money.fromDecimalString('8.25');
    const valueRounder = aValueRounder(answer, answer, answer);
    const subject = aRoundingRule({ roundingRuleExpression: '0.00' }, valueRounder);
    const value = Money.fromDecimalString('77.01');

    subject.roundValue(value);
    subject.roundValue(value);
    subject.roundValue(value);

    expect(valueRounder.calls).toHaveLength(3);
    expect(valueRounder.calls.every((call) => call.value === value)).toBe(true);
  });

  it('reaches the collaborator from nowhere but roundValue', () => {
    const valueRounder = aValueRounder(Money.fromDecimalString('8.25'));
    const subject = aRoundingRule(
      {
        roundingRuleID: 'rr-1',
        roundingRuleName: 'Nines',
        roundingRuleExpression: '.99',
        roundingRuleDirection: 'Closest',
        createdDateTime: new Date('2024-06-01T00:00:00.000Z'),
        createdByAccountID: 'acct-1',
        modifiedDateTime: new Date('2024-06-02T00:00:00.000Z'),
        modifiedByAccountID: 'acct-2',
        priceGroupRates: [anAttachedPriceGroupRate('pgr-1')],
      },
      valueRounder,
    );

    subject.getRoundingRuleID();
    subject.getRoundingRuleName();
    subject.getRoundingRuleExpression();
    subject.getRoundingRuleDirection();
    subject.getCreatedDateTime();
    subject.getCreatedByAccountID();
    subject.getModifiedDateTime();
    subject.getModifiedByAccountID();
    subject.getPriceGroupRates();
    subject.getRoundingRuleDirectionOptions();
    subject.hasExpressionWithListOfNumericValuesOnly();
    subject.isNew();

    expect(valueRounder.calls).toHaveLength(0);
  });
});

describe('getRoundingRuleDirectionOptions', () => {
  it('returns exactly the three legacy options, in source order, with both fields', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L70-L76], the literal VERBATIM:
    //
    //   return [
    //       {value="Closest", name="Round to Closest"},
    //       {value="Up", name="Only Round Up"},
    //       {value="Down", name="Only Round Down"}
    //   ];
    //
    // Order is the order the entries appear in the admin select, and the struct keys stay `value`
    // and `name` rather than being renamed, so this shape diffs straight against the CFC. Typing
    // the expectation through the shipped `RoundingRuleDirectionOption` checks the three `value`
    // strings against the exported union at compile time too.
    const expected: readonly RoundingRuleDirectionOption[] = [
      { value: 'Closest', name: 'Round to Closest' },
      { value: 'Up', name: 'Only Round Up' },
      { value: 'Down', name: 'Only Round Down' },
    ];

    const options = aRoundingRule().getRoundingRuleDirectionOptions();

    expect(options).toHaveLength(3);
    expect(options).toEqual(expected);
  });

  it('offers exactly the three direction values the exported union names', () => {
    const expectedValues: readonly RoundingRuleDirection[] = ['Closest', 'Up', 'Down'];

    const values = aRoundingRule()
      .getRoundingRuleDirectionOptions()
      .map((option) => option.value);

    expect(values).toEqual(expectedValues);
  });

  it('carries hardcoded English display names rather than resource-bundle keys', () => {
    const names = aRoundingRule()
      .getRoundingRuleDirectionOptions()
      .map((option) => option.name);

    expect(names).toEqual(['Round to Closest', 'Only Round Up', 'Only Round Down']);

    for (const name of names) {
      expect(name).toMatch(/^[A-Za-z ]+$/);
      expect(name).toContain(' ');
    }
  });

  it('returns a fresh array on every call, so no caller can mutate a shared list', () => {
    const subject = aRoundingRule();

    const first = subject.getRoundingRuleDirectionOptions();
    const second = subject.getRoundingRuleDirectionOptions();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('offers the same three options whatever the persisted direction happens to be', () => {
    const outOfVocabulary = aRoundingRule({ roundingRuleDirection: 'Sideways' });
    const inVocabulary = aRoundingRule({ roundingRuleDirection: 'Down' });

    expect(outOfVocabulary.getRoundingRuleDirectionOptions()).toEqual(
      inVocabulary.getRoundingRuleDirectionOptions(),
    );
  });
});

describe('getRoundingRuleDirection returns the persisted string, un-narrowed', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L55]: the column is a bare `ormtype="string"` with
  // no check constraint and no enumeration, and [model/validation/RoundingRule.json:L5] requires it
  // on save WITHOUT constraining its value. So a validated `'Sideways'` is persisted happily
  // and then reaches the rounding switch, where it matches no case and falls through. Only the
  // first half is this entity's: the accessor neither rejects nor narrows. The fall-through is
  // service-side.

  it('round-trips a value that is absent from the option list, without throwing', () => {
    const subject = aRoundingRule({ roundingRuleDirection: 'Sideways' });

    expect(() => subject.getRoundingRuleDirection()).not.toThrow();
    expect(subject.getRoundingRuleDirection()).toBe('Sideways');
  });

  it('confirms that value really is outside the offered vocabulary', () => {
    const subject = aRoundingRule({ roundingRuleDirection: 'Sideways' });
    const offered: readonly string[] = subject
      .getRoundingRuleDirectionOptions()
      .map((option) => option.value);

    expect(offered).not.toContain('Sideways');
  });

  it('round-trips each in-vocabulary value unchanged', () => {
    const directions: readonly RoundingRuleDirection[] = ['Closest', 'Up', 'Down'];

    for (const direction of directions) {
      expect(aRoundingRule({ roundingRuleDirection: direction }).getRoundingRuleDirection()).toBe(
        direction,
      );
    }
  });

  it('does not normalize case', () => {
    expect(aRoundingRule({ roundingRuleDirection: 'closest' }).getRoundingRuleDirection()).toBe(
      'closest',
    );
    expect(aRoundingRule({ roundingRuleDirection: 'UP' }).getRoundingRuleDirection()).toBe('UP');
  });

  it('reports undefined for a null column rather than substituting a default', () => {
    const subject = aRoundingRule({ roundingRuleDirection: undefined });

    expect(subject.getRoundingRuleDirection()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hasExpressionWithListOfNumericValuesOnly
//
// CFML parity [model/entity/RoundingRule.cfc:L78-L86], the body VERBATIM:
//
//   for(var i=1; i<=listLen(getRoundingRuleExpression()); i++) {
//       var thisValue = listGetAt(getRoundingRuleExpression(), i);
//       if((len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue)) {
//           return false;
//       }
//   }
//   return true;
//
// The condition at L81 is the whole test, and it is NOT the "two decimal places" rule it resembles.
// CFML's `find(".", v)` answers a 1-BASED POSITION, or 0 when the substring is absent, and the
// arithmetic is built on that 0, so the real rule is "exactly two characters after the dot, OR a
// bare two-character numeric". Each row re-derives it:
//
//   '.99'     len 3, dot at 1  -> 3 - 1 = 2  and numeric -> ACCEPT
//   '0.99'    len 4, dot at 2  -> 4 - 2 = 2  and numeric -> ACCEPT
//   '9.99'    len 4, dot at 2  -> 4 - 2 = 2  and numeric -> ACCEPT
//   '0.00'    len 4, dot at 2  -> 4 - 2 = 2  and numeric -> ACCEPT
//   '.95,.99' two elements, each 3 - 1 = 2   and numeric -> ACCEPT
//   '.9'      len 2, dot at 1  -> 2 - 1 = 1                -> REJECT
//   '999'     len 3, no dot    -> 3 - 0 = 3                -> REJECT
//   '0.999'   len 5, dot at 2  -> 5 - 2 = 3                -> REJECT
//   '99'      len 2, no dot    -> 2 - 0 = 2  and numeric -> ACCEPT (defect, see below)
// ---------------------------------------------------------------------------

describe('hasExpressionWithListOfNumericValuesOnly accepts', () => {
  it('a leading-point two-decimal expression', () => {
    expect(expressionIsAccepted('.99')).toBe(true);
  });

  it('a zero-led two-decimal expression', () => {
    expect(expressionIsAccepted('0.99')).toBe(true);
  });

  it('a nine-led two-decimal expression', () => {
    expect(expressionIsAccepted('9.99')).toBe(true);
  });

  it('the all-zero two-decimal expression', () => {
    expect(expressionIsAccepted('0.00')).toBe(true);
  });

  it('a multi-element comma list where every element passes', () => {
    expect(expressionIsAccepted('.95,.99')).toBe(true);
  });

  it('a longer comma list of mixed two-decimal shapes', () => {
    expect(expressionIsAccepted('.95,0.99,9.99,0.00')).toBe(true);
  });
});

describe('hasExpressionWithListOfNumericValuesOnly rejects', () => {
  it('a one-decimal expression', () => {
    expect(expressionIsAccepted('.9')).toBe(false);
  });

  it('a bare three-digit expression', () => {
    expect(expressionIsAccepted('999')).toBe(false);
  });

  it('a three-decimal expression', () => {
    expect(expressionIsAccepted('0.999')).toBe(false);
  });

  it('a list whose first element offends, without examining the rest', () => {
    expect(expressionIsAccepted('999,.99')).toBe(false);
  });

  it('a list whose last element offends, after accepting the earlier ones', () => {
    expect(expressionIsAccepted('.99,999')).toBe(false);
  });

  it('a non-numeric element of the right length', () => {
    expect(expressionIsAccepted('a.99')).toBe(false);
  });
});

describe('hasExpressionWithListOfNumericValuesOnly: preserved legacy behaviour', () => {
  it('accepts a bare two-digit expression, which is not a two-decimal value at all', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts "99" because
    //   len - find(".") == 2
    // when no decimal point is present, yielding a fractional derived power of 10^(2-3) = 0.1.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The service derives its step as `var rrPower = 1 * (10 ^ (len(rr)-3));`
    // [model/service/RoundingRuleService.cfc:L95], so a two-character element drives a FRACTIONAL
    // power. Nothing prevents that - not this predicate, and not the column, which is free text
    // with no format constraint [model/entity/RoundingRule.cfc:L54].
    expect(expressionIsAccepted('99')).toBe(true);
  });

  it('accepts a signed two-decimal expression', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts "-.99" because
    // len 4 minus find(".") 2 is 2 and CFML isNumeric("-.99") is true, so a NEGATIVE rounding
    // candidate passes a test whose purpose is to admit only currency-shaped values.
    //
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('-.99')).toBe(true);
  });

  it('accepts a positively signed two-decimal expression on the same arithmetic', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the sign is counted by len() and never
    // inspected, so "+.99" passes for exactly the reason "-.99" does - the condition tests
    // character positions, not numeric range.
    //
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('+.99')).toBe(true);
  });

  it('returns true for an empty expression', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L79]: `listLen('')` is 0, so the loop body never
    // executes and control falls through to `return true` at L85. Vacuous satisfaction is division
    // of labour rather than a hole: the separate `"required":true` rule in the same entry
    // [model/validation/RoundingRule.json:L4] rejects an empty value.
    expect(expressionIsAccepted('')).toBe(true);
  });

  it('returns true for a list of nothing but delimiters', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L79]: CFML lists CONTRIBUTE NO ELEMENT for an
    // empty run between delimiters, so `listLen(',,,')` is 0 - the empty case again.
    expect(expressionIsAccepted(',,,')).toBe(true);
  });

  it('returns true when the column is null, without throwing', () => {
    // The shipped predicate does NOT throw for an absent expression: it normalizes at
    // src/domain/entities/roundingRule.ts:L1034 (`this.roundingRuleExpression ?? ''`) and answers
    // exactly as the empty case does.
    //
    // CFML parity [model/entity/RoundingRule.cfc:L79]: `listLen()` requires a string, and the
    // legacy engines coerce a null argument to `''` before counting, which yields 0 - so the same
    // `true`.
    //
    // REACHABILITY CAVEAT: `roundingRuleExpression` is `"required":true` in the `save` context
    // [model/validation/RoundingRule.json:L4], so a validly saved rule cannot carry a null one;
    // this path is reachable only by invoking the predicate on a hydrated row.
    const subject = aRoundingRule({ roundingRuleExpression: undefined });

    expect(subject.getRoundingRuleExpression()).toBeUndefined();
    expect(() => subject.hasExpressionWithListOfNumericValuesOnly()).not.toThrow();
    expect(subject.hasExpressionWithListOfNumericValuesOnly()).toBe(true);
  });
});

describe('hasExpressionWithListOfNumericValuesOnly: untrimmed list elements', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L80-L81]: `listGetAt` hands back the element EXACTLY
  // as written, padding included, and the two halves of the condition disagree about that padding -
  // `len()` counts the space and `find()`'s position shifts with it, while `isNumeric()` tolerates
  // it. The asymmetry is CFML's.

  it('accepts an element with a leading space', () => {
    // `' .99'`: len 4, dot at 2 -> 2, and CFML judges it numeric, space and all.
    expect(expressionIsAccepted('.95, .99')).toBe(true);
  });

  it('rejects an element with a trailing space', () => {
    // `'.95 '`: len 4, dot still at 1 -> 3. Harmless in front, fatal behind.
    expect(expressionIsAccepted('.95 ,.99')).toBe(false);
  });
});

describe('the four validation-schema properties', () => {
  // [model/validation/RoundingRule.json], VERBATIM and complete - four properties, no more:
  //
  //   "roundingRuleName":       [{"contexts":"save","required":true}]
  //   "roundingRuleExpression": [{"contexts":"save","required":true,
  //                               "method":"hasExpressionWithListOfNumericValuesOnly"}]
  //   "roundingRuleDirection":  [{"contexts":"save","required":true}]
  //   "priceGroupRates":        [{"contexts":"delete","maxCollection":0}]
  //
  // NONE of the four is ENFORCED by the entity: requiredness and schema validation live at the
  // SERVICE tier. The entity owes the schema the three save-context columns carried faithfully and
  // unvalidated, the named predicate, and the collection the delete rule counts.

  it('carries all three save-context columns without validating any of them', () => {
    const subject = aRoundingRule({
      roundingRuleName: undefined,
      roundingRuleExpression: undefined,
      roundingRuleDirection: undefined,
    });

    expect(subject.getRoundingRuleName()).toBeUndefined();
    expect(subject.getRoundingRuleExpression()).toBeUndefined();
    expect(subject.getRoundingRuleDirection()).toBeUndefined();
  });

  it('reports the expression exactly as persisted, unnormalized', () => {
    const subject = aRoundingRule({ roundingRuleExpression: ' .95 , .99 ' });

    expect(subject.getRoundingRuleExpression()).toBe(' .95 , .99 ');
  });

  it('exposes the predicate under the exact name the schema invokes by string', () => {
    // CFML parity [model/validation/RoundingRule.json:L4]: the `"method"` key names a member by
    // STRING, which the legacy framework resolved through dynamic invocation. The port resolves it
    // by NAME ON THE CLASS, so the spelling is part of the contract.
    //
    // One of exactly FIVE declaratively invoked validators across the in-scope entity slice:
    // `getPromotionCodesDeletableFlag` [model/validation/Promotion.json], `hasUniquePromotionCode`
    // [model/validation/PromotionCode.json], this one, and `hasOneOptionPerOptionGroup` plus
    // `hasUniqueOptions` [model/validation/Sku.json].
    const subject = aRoundingRule({ roundingRuleExpression: '.99' });

    expect(Object.getOwnPropertyNames(RoundingRule.prototype)).toContain(
      'hasExpressionWithListOfNumericValuesOnly',
    );
    expect(typeof subject.hasExpressionWithListOfNumericValuesOnly).toBe('function');
    expect(typeof subject.hasExpressionWithListOfNumericValuesOnly()).toBe('boolean');
  });

  it('does validate the expression shape on save, through that predicate', () => {
    // CFML parity [model/validation/RoundingRule.json:L4]: the expression IS validated on save, by
    // the custom method named above. Only the ENTITY-LEVEL property is unconstrained:
    //   `property name="roundingRuleExpression" ormtype="string";`
    // at [model/entity/RoundingRule.cfc:L54] carries no length, no pattern and no
    // `hb_formFieldType`, so "no format constraint" is true of the column and false of the save
    // path, and both halves are asserted here.
    expect(expressionIsAccepted('0.999')).toBe(false);
    expect(aRoundingRule({ roundingRuleExpression: '0.999' }).getRoundingRuleExpression()).toBe(
      '0.999',
    );
  });

  it('satisfies the delete-context bound when no rate references the rule', () => {
    const subject = aRoundingRule();

    expect(subject.getPriceGroupRates()).toEqual([]);
    expect(subject.getPriceGroupRates()).toHaveLength(0);
    expect(satisfiesDeleteContextRule(subject)).toBe(true);
  });

  it('violates the delete-context bound as soon as one rate references the rule', () => {
    const attached = [anAttachedPriceGroupRate('pgr-1')];
    const subject = aRoundingRule({ priceGroupRates: attached });

    expect(subject.getPriceGroupRates()).toHaveLength(1);
    expect(satisfiesDeleteContextRule(subject)).toBe(false);
  });

  it('violates it for several attached rates too, and reports the collection as given', () => {
    const attached = [
      anAttachedPriceGroupRate('pgr-1'),
      anAttachedPriceGroupRate('pgr-2'),
      anAttachedPriceGroupRate('pgr-3'),
    ];
    const subject = aRoundingRule({ priceGroupRates: attached });

    expect(subject.getPriceGroupRates()).toBe(attached);
    expect(subject.getPriceGroupRates()).toHaveLength(3);
    expect(satisfiesDeleteContextRule(subject)).toBe(false);
  });

  it('always reports an array, so a count is always a legal question', () => {
    expect(Array.isArray(aRoundingRule().getPriceGroupRates())).toBe(true);
    expect(Array.isArray(aRoundingRule({ priceGroupRates: undefined }).getPriceGroupRates())).toBe(
      true,
    );
  });

  it('declares no add or remove helper for the inverse collection', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    expect(members).not.toContain('addPriceGroupRate');
    expect(members).not.toContain('removePriceGroupRate');
  });
});

describe('structural parity with the SwRoundingRule row', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L49]: the component declaration carries
  // `entityname="SlatwallRoundingRule" table="SwRoundingRule"`, plus
  // `hb_serviceName="roundingRuleService"` and the literal four-character `hb_permission="this"`.
  // Those names are the SCHEMA CONTRACT and the legacy admin's routing metadata, kept as INERT DOC
  // TEXT rather than runtime members - so these assertions test what the module exposes instead of
  // inventing accessors for them.

  it('exposes exactly the thirteen ported members, and no more', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype)
      .filter((member) => member !== 'constructor')
      .sort();

    expect(members).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(members).toHaveLength(13);
  });

  it('exposes no accessor for the component attributes that stayed documentation', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    for (const invented of ['getTableName', 'getEntityName', 'getServiceName', 'getPermission']) {
      expect(members).not.toContain(invented);
    }
  });

  it('declares no remoteID, because the source declares none', () => {
    // Most siblings carry one immediately before the audit run:
    //   `property name="remoteID" ormtype="string";`
    // appears at [model/entity/PriceGroupRate.cfc:L58] and again at
    // [model/entity/PromotionApplied.cfc:L64], and this entity does not carry it. All 99 source
    // lines of [model/entity/RoundingRule.cfc] mention it ZERO times, so inventing the column would
    // breach schema continuity.
    const subject = aRoundingRule({ roundingRuleID: 'rr-1' });

    expect(Object.getOwnPropertyNames(RoundingRule.prototype)).not.toContain('getRemoteID');
    expect('getRemoteID' in subject).toBe(false);
    expect('remoteID' in subject).toBe(false);

    // The absence is a COMPILE error as well as a runtime one, which is the point of porting no
    // dispatcher: nothing is left to synthesise an accessor from.
    // @ts-expect-error no getRemoteID: [model/entity/RoundingRule.cfc] declares no column.
    const absent: unknown = subject.getRemoteID;

    expect(absent).toBeUndefined();
  });

  it('is new when the identifier is the empty string', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L52]: `unsavedvalue="" default=""` is what makes
    // the empty string LOAD-BEARING, and the framework chain resolved to exactly this test -
    // `isNew()` [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`, which is
    // `getPrimaryIDValue() == ""` [org/Hibachi/HibachiEntity.cfc:L571-L576].
    //
    // This is the one assertion carried over in substance from
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67], whose `defaults_are_correct()`
    // asserted `isNew()` with an empty primary id value, authored here against the members the port
    // ships.
    const fresh = aRoundingRule();

    expect(fresh.getRoundingRuleID()).toBe('');
    expect(fresh.isNew()).toBe(true);
  });

  it('is not new once an identifier is present', () => {
    const persisted = aRoundingRule({ roundingRuleID: '8a8b8c8d8e8f4a4b4c4d4e4f5a5b5c5d' });

    expect(persisted.getRoundingRuleID()).toBe('8a8b8c8d8e8f4a4b4c4d4e4f5a5b5c5d');
    expect(persisted.isNew()).toBe(false);
  });

  it('never mints an identifier of its own', () => {
    expect(aRoundingRule().getRoundingRuleID()).toBe(aRoundingRule().getRoundingRuleID());
  });

  it('carries the rule name as persisted', () => {
    expect(aRoundingRule({ roundingRuleName: 'Nines' }).getRoundingRuleName()).toBe('Nines');
    expect(aRoundingRule({ roundingRuleName: '' }).getRoundingRuleName()).toBe('');
  });
});

describe('the audit columns', () => {
  it('round-trips both timestamps as the instants they were hydrated with', () => {
    const created = new Date('2024-06-01T00:00:00.000Z');
    const modified = new Date('2024-06-02T12:30:45.678Z');

    const subject = aRoundingRule({ createdDateTime: created, modifiedDateTime: modified });

    expect(subject.getCreatedDateTime()).toBe(created);
    expect(subject.getModifiedDateTime()).toBe(modified);
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-02T12:30:45.678Z');
  });

  it('reports an absent timestamp as undefined, never as the epoch and never as zero', () => {
    const subject = aRoundingRule({ createdDateTime: undefined, modifiedDateTime: undefined });

    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
    expect(subject.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(subject.getModifiedDateTime()).not.toEqual(new Date(0));
  });

  it('carries both account columns as opaque identifiers', () => {
    const subject = aRoundingRule({
      createdByAccountID: 'acct-created',
      modifiedByAccountID: 'acct-modified',
    });

    expect(subject.getCreatedByAccountID()).toBe('acct-created');
    expect(subject.getModifiedByAccountID()).toBe('acct-modified');
  });

  it('reports an absent account column as undefined', () => {
    const subject = aRoundingRule({
      createdByAccountID: undefined,
      modifiedByAccountID: undefined,
    });

    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();
  });

  it('exposes no account entity accessor for either audit association', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    expect(members).not.toContain('getCreatedByAccount');
    expect(members).not.toContain('getModifiedByAccount');
  });

  it('maintains no timestamp of its own, because the source declares no ORM hook', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    for (const hook of ['preInsert', 'preUpdate', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });
});

describe('the Hibachi base class is documented, not reproduced', () => {
  // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: the legacy component extended
  // `HibachiEntity`, whose `onMissingMethod` dispatcher SYNTHESISED members from property metadata
  // (`get<Prop>Options`, `get<Prop>SmartList`, `get<Prop>Struct`, `get<Prop>Count`, `has<Prop>` and
  // the EAV `get<AttributeCode>` branch) and threw for anything else:
  //
  //   throw('You have called a method #arguments.missingMethodName#() which does not exists
  //          in the #getClassName()# entity.');
  //
  // The EAV branch [org/Hibachi/HibachiEntity.cfc:L559] is guarded on
  // `hasProperty("attributeValues")`, which this entity declares none of, so even in CFML an
  // unknown `getX()` here fell through to that throw. The port has no dynamic dispatch, so an
  // unknown member is a COMPILE error and at run time simply absent - which is why these assertions
  // check absence, not a thrown message.

  it('ships none of the framework members the dispatcher and base class supplied', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    for (const unported of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(unported);
    }
  });

  it('resolves no unknown member at run time, and inherits nothing that would', () => {
    const subject = aRoundingRule({ roundingRuleID: 'rr-1' });

    expect('getSomeCustomAttributeCode' in subject).toBe(false);
    expect('getPriceGroupRatesSmartList' in subject).toBe(false);

    expect(Object.getPrototypeOf(RoundingRule.prototype)).toBe(Object.prototype);
  });

  it('is an instance of RoundingRule and of nothing else in the port', () => {
    expect(aRoundingRule()).toBeInstanceOf(RoundingRule);
  });
});
