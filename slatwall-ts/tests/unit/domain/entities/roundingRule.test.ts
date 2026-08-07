// slatwall-ts - unit suite for `src/domain/entities/roundingRule.ts`.
//
// NET-NEW coverage: no legacy test component constructs a RoundingRule.

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
 * parameters narrowed to `Money` and `RoundingRule`.
 */
interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  readonly calls: readonly RecordedRoundValueCall[];
}

/**
 * Builds a recording double that answers with the supplied amounts in order, repeating the last
 * one once they run out.
 *
 * Scripting the answers is what makes "delegates on every call" observable: two calls can be given
 * two DIFFERENT answers.
 *
 * @param results the answers to hand back, in call order.
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
 * `"priceGroupRates": [{"contexts":"delete","maxCollection":0}]` at
 * [model/validation/RoundingRule.json:L6].
 *
 * @param priceGroupRateID an identifier for legibility in failure output.
 */
function anAttachedPriceGroupRate(priceGroupRateID: string): AttachedPriceGroupRate {
  return { priceGroupRateID } as unknown as AttachedPriceGroupRate;
}

/**
 * Builds the rule under test, fresh, with every unspecified column absent.
 *
 * `roundingRuleID` defaults to `''` because that is what the source declares:
 * `unsavedvalue="" default=""` at [model/entity/RoundingRule.cfc:L52].
 *
 * @param init the columns to populate.
 * @param valueRounder the collaborator to inject; a recording double by default.
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
 * This is a suite-local restatement and not production enforcement.
 *
 * @param rule the rule a delete is being attempted on.
 * @returns whether the collection is within the declared bound.
 */
function satisfiesDeleteContextRule(rule: RoundingRule): boolean {
  return rule.getPriceGroupRates().length <= DELETE_CONTEXT_MAX_COLLECTION;
}

/**
 * Every member `RoundingRule.prototype` carries, sorted - the interface-parity contract in
 * executable form.
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  'addError',
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getError',
  'getErrors',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getPriceGroupRates',
  'getRoundingRuleDirection',
  'getRoundingRuleDirectionOptions',
  'getRoundingRuleExpression',
  'getRoundingRuleID',
  'getRoundingRuleName',
  'hasError',
  'hasErrors',
  'hasExpressionWithListOfNumericValuesOnly',
  'isNew',
  'roundValue',
  'setRoundingRuleDirection',
  'setRoundingRuleExpression',
  'setRoundingRuleName',
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
  // `validate` STAYS UNPORTED even though the error register it wrote into does not.
  'validate',
  'preInsert',
  'preUpdate',
  'getPriceGroupRatesCount',
  'getPriceGroupRatesSmartList',
  'getPriceGroupRatesStruct',
  'getRoundingRuleDirectionOptionsSmartList',
  'addPriceGroupRate',
  'removePriceGroupRate',
];

describe('roundValue delegates, and does nothing else', () => {
  // So the whole of this method's behaviour is the crossing.

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
    // Order is the order the entries appear in the admin select, and the struct keys stay `value`
    // and `name` rather than being renamed, so this shape diffs straight against the CFC.
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
  // no check constraint and no enumeration, and [model/validation/RoundingRule.json:L5] requires
  // it on save without constraining its value.

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

// '.99' len 3, dot at 1 -> 3 - 1 = 2 and numeric -> ACCEPT '0.99' len 4, dot at 2 -> 4 - 2 = 2 and
// numeric -> ACCEPT '9.99' len 4, dot at 2 -> 4 - 2 = 2 and numeric -> ACCEPT '0.00' len.

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
    // len - find(".") == 2 when no decimal point is present, yielding a fractional derived power
    // of 10^(2-3) = 0.1.
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('99')).toBe(true);
  });

  it('accepts a signed two-decimal expression', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts "-.99" because
    // len 4 minus find(".") 2 is 2 and CFML isNumeric("-.99") is true, so a NEGATIVE rounding
    // candidate passes a test whose purpose is to admit only currency-shaped values.
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('-.99')).toBe(true);
  });

  it('accepts a positively signed two-decimal expression on the same arithmetic', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the sign is counted by len() and
    // never inspected, so "+.99" passes for exactly the reason "-.99" does - the condition tests
    // character positions, not numeric range.
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('+.99')).toBe(true);
  });

  it('returns true for an empty expression', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L79]: `listLen('')` is 0, so the loop body never
    // executes and control falls through to `return true` at L85.
    expect(expressionIsAccepted('')).toBe(true);
  });

  it('returns true for a list of nothing but delimiters', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L79]: CFML lists contribute no element for an
    // empty run between delimiters, so `listLen(',,,')` is 0 - the empty case again.
    expect(expressionIsAccepted(',,,')).toBe(true);
  });

  it('returns true when the column is null, without throwing', () => {
    // The shipped predicate does not throw for an absent expression: it normalizes at
    // src/domain/entities/roundingRule.ts (`this.roundingRuleExpression ?? ''`) and answers
    // exactly as the empty case does.
    //
    // CFML parity [model/entity/RoundingRule.cfc:L79]: `listLen()` requires a string, and the
    // legacy engines coerce a null argument to `''` before counting, which yields 0 - so the same
    // `true`.
    const subject = aRoundingRule({ roundingRuleExpression: undefined });

    expect(subject.getRoundingRuleExpression()).toBeUndefined();
    expect(() => subject.hasExpressionWithListOfNumericValuesOnly()).not.toThrow();
    expect(subject.hasExpressionWithListOfNumericValuesOnly()).toBe(true);
  });
});

describe('hasExpressionWithListOfNumericValuesOnly: untrimmed list elements', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L80-L81]: `listGetAt` hands back the element
  // EXACTLY as written, padding included, and the two halves of the condition disagree about that
  // padding - `len()` counts the space and `find()`'s position shifts with it.

  it('accepts an element with a leading space', () => {
    // `'.99'`: len 4, dot at 2 -> 2, and CFML judges it numeric, space and all.
    expect(expressionIsAccepted('.95, .99')).toBe(true);
  });

  it('rejects an element with a trailing space', () => {
    // `'.95 '`: len 4, dot still at 1 -> 3. Harmless in front, fatal behind.
    expect(expressionIsAccepted('.95 ,.99')).toBe(false);
  });
});

describe('the four validation-schema properties', () => {
  // None of the four is ENFORCED by the entity: requiredness and schema validation live at the
  // SERVICE tier.

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
    // by NAME on the CLASS, so the spelling is part of the contract.
    const subject = aRoundingRule({ roundingRuleExpression: '.99' });

    expect(Object.getOwnPropertyNames(RoundingRule.prototype)).toContain(
      'hasExpressionWithListOfNumericValuesOnly',
    );
    expect(typeof subject.hasExpressionWithListOfNumericValuesOnly).toBe('function');
    expect(typeof subject.hasExpressionWithListOfNumericValuesOnly()).toBe('boolean');
  });

  it('does validate the expression shape on save, through that predicate', () => {
    // CFML parity [model/validation/RoundingRule.json:L4]: the expression is validated on save, by
    // the custom method named above.
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

  it('exposes exactly the thirteen ported members, and no more', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype)
      .filter((member) => member !== 'constructor')
      .sort();

    expect(members).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(members).toHaveLength(21);
  });

  it('exposes no accessor for the component attributes that stayed documentation', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    for (const invented of ['getTableName', 'getEntityName', 'getServiceName', 'getPermission']) {
      expect(members).not.toContain(invented);
    }
  });

  it('declares no remoteID, because the source declares none', () => {
    // Most siblings carry one immediately before the audit run:
    // `property name="remoteID" ormtype="string";` appears at
    // [model/entity/PriceGroupRate.cfc:L58] and again at [model/entity/PromotionApplied.cfc:L64].
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
    // `isNew()` [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`.
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
  // The EAV branch [org/Hibachi/HibachiEntity.cfc:L559] is guarded on
  // `hasProperty("attributeValues")`, which this entity declares none of.

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

// The error register, invoked directly on this entity.
//
// Review reported that "nine public methods have no invocation in any test AST".
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees
// and that the save-refusal semantics depend on: a MISS yields an empty array rather than
// undefined.

describe('RoundingRule: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent
    // name has to be safe to iterate - `undefined` here would turn a clean validation pass into a
    // crash.
    const subject = aRoundingRule({ roundingRuleID: 'rr-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after
    // the first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = aRoundingRule({ roundingRuleID: 'rr-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling.
    const subject = aRoundingRule({ roundingRuleID: 'rr-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
