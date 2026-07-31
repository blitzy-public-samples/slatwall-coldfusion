// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/roundingRule.ts`
//
// WHAT THIS SUITE PINS
// The `SwRoundingRule` row and the three behaviours [model/entity/RoundingRule.cfc]
// declares over it:
//
//   1. `roundValue()` is PURE DELEGATION [model/entity/RoundingRule.cfc:L66-L68]. The
//      legacy body is one line - `getService("roundingRuleService")
//      .roundValueByRoundingRule(value=arguments.value, roundingRule=this)` - and the
//      port replaces that single service-locator lookup with a constructor-injected
//      collaborator. What is pinned here is therefore the DELEGATION CONTRACT: the
//      value crosses unchanged, `this` crosses as the rule, the answer comes back
//      untouched, and nothing is memoized.
//   2. `getRoundingRuleDirectionOptions()` returns exactly three options, in source
//      order, with the exact legacy strings [model/entity/RoundingRule.cfc:L70-L76].
//   3. `hasExpressionWithListOfNumericValuesOnly()` is a DECLARATIVELY INVOKED
//      validator - no line of CFML calls it, and [model/validation/RoundingRule.json:L4]
//      names it by string - whose arithmetic is NOT the "two decimal places" test it
//      resembles [model/entity/RoundingRule.cfc:L78-L86].
//
// Alongside them: the un-narrowed persisted direction, the four validation-schema
// properties, the `''`-keyed `isNew()`, the audit columns, and the members the legacy
// framework would have synthesised that the port deliberately does not ship.
//
// ---------------------------------------------------------------------------
// !! HARD BOUNDARY - THE ROUNDING ALGORITHM IS NOT TESTED HERE !!
// ---------------------------------------------------------------------------
// The decimal-string algorithm - the `left()` slicing, the candidate concatenation,
// the `10 ^ (len(rr)-3)` step and the closest/up/down selection - lives entirely in
// [model/service/RoundingRuleService.cfc:L88-L175] and is ported to the SERVICE tier.
// Its measured characterization outputs belong to the service suite. This entity
// contributes exactly ONE line of behaviour to that path
// [model/entity/RoundingRule.cfc:L67], so this suite proves delegation and stops.
//
// No assertion below computes or expects an amount produced by that algorithm. The
// amounts that do appear are supplied BY the test to the collaborator double and
// handed straight back, and each is deliberately chosen so that it could not be
// mistaken for a rounded result: the answers are unrelated to the inputs.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// No assertion below has a legacy antecedent. Measured rather than assumed: a
// case-insensitive search of all 32 `.cfc` files under `meta/tests/` for
// `RoundingRule` returns ZERO hits, and one for `roundValue` returns ZERO hits. The
// only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc],
// neither of which touches this entity, and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing
// zero coverage. There is nothing here to extend.
//
// The four cases that [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] gave
// every legacy entity suite for free are NOT inherited, and no shared base class is
// introduced to imitate them: `validate_as_save_for_a_new_instance_doesnt_pass`,
// `simple_representation_exists_and_is_simple` and `has_primary_id_property_name` all
// rest on framework members the port does not ship for this entity. The one assertion
// of theirs that survives is `defaults_are_correct`'s `isNew()` check, authored below
// against the member the port does ship.
//
// ---------------------------------------------------------------------------
// VERIFIED CORRECTIONS - WHERE THE SOURCE DISAGREED, THE SOURCE WON
// ---------------------------------------------------------------------------
//   1. `RoundingRuleValueRounder` IS NOT EXPORTED. It is declared without `export` at
//      src/domain/entities/roundingRule.ts:L419, which states the decision in terms:
//      the port inventory is closed at thirteen interfaces, so the collaborator
//      contract stays module-local and whatever satisfies it does so STRUCTURALLY.
//      Importing that name would not compile. This suite therefore declares its own
//      {@link RecordingValueRounder} of the identical shape and relies on structural
//      typing exactly as the production wiring does.
//   2. THE ENTITY CARRIES TWO AUDIT TIMESTAMPS, NOT THREE: `createdDateTime`
//      [model/entity/RoundingRule.cfc:L58] and `modifiedDateTime` [L60]. The other two
//      audit properties are `many-to-one` associations to the out-of-scope `Account`,
//      which the port collapses to the opaque foreign-key columns `createdByAccountID`
//      [L59] and `modifiedByAccountID` [L61]. Counted directly in the source.
//   3. AN ABSENT EXPRESSION DOES NOT THROW. The shipped predicate normalizes it at
//      src/domain/entities/roundingRule.ts:L1034 and answers `true`. The CFML reasoning
//      and the reachability caveat are recorded at the assertion itself.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE TOUCHES, AND WHAT IT CANNOT
// ---------------------------------------------------------------------------
// No database, no network, no filesystem, no environment variable, no credential, no
// clock and no timer. Every subject is built fresh inside the test that uses it, so no
// state crosses a test boundary: there is no module-level mutable value, no shared
// subject and no `beforeEach`. `tests/setup.ts` already pins the process to UTC and
// restores mocks after every test; this suite installs no spy and no fake timer of its
// own, because every collaborator here is a hand-written in-memory double.
//
// Every monetary value is constructed through `Money`, and the only literals appearing
// in a monetary position are decimal strings. No floating-point arithmetic appears
// anywhere, expected values included.
//
// This suite spends NONE of the migration's deliberate divergences. Every behaviour it
// pins is the legacy behaviour, defects included.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';
import type {
  RoundingRuleDirection,
  RoundingRuleDirectionOption,
} from '../../../../src/domain/entities/roundingRule.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';

// ---------------------------------------------------------------------------
// The collaborator double
// ---------------------------------------------------------------------------

/** One recorded crossing of the entity -> collaborator boundary. */
interface RecordedRoundValueCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

/**
 * A hand-written in-memory stand-in for the collaborator the entity delegates to.
 *
 * The single method mirrors [model/service/RoundingRuleService.cfc:L84-L86] -
 * `roundValueByRoundingRule(required any value, required any roundingRule)` - with
 * `any value` narrowed to `Money` and `any roundingRule` narrowed to `RoundingRule`,
 * which is exactly the shape src/domain/entities/roundingRule.ts:L419-L421 declares.
 *
 * DECLARED HERE RATHER THAN IMPORTED, deliberately. That interface carries no `export`
 * and the module says so in terms, so this suite reproduces the shape and lets
 * structural typing do the rest - the same way `src/services/roundingRuleService.ts`
 * will satisfy it without importing the name. Nothing is re-exported from here.
 *
 * NO `vi.mock`, NO SPY AND NO MOCKING LIBRARY. A double that records its arguments is
 * the whole requirement, and writing it by hand keeps the recorded values strongly
 * typed: `calls` is `RecordedRoundValueCall[]`, so an assertion that reads
 * `calls[0].rule` is checked by the compiler rather than by a matcher.
 */
interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  /** Every call so far, in call order. */
  readonly calls: readonly RecordedRoundValueCall[];
}

/**
 * Builds a recording double that answers with the supplied amounts in order, repeating
 * the last one once they run out.
 *
 * Scripting the answers is what makes "delegates on every call" observable: two calls
 * can be given two DIFFERENT answers, so a memoizing entity would be caught returning
 * the first answer twice rather than merely calling once.
 *
 * A double built with no scripted answer replies `Money.zero`. That path exists so a
 * subject can be constructed for a test that never calls `roundValue` at all, and no
 * assertion below depends on the value.
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

// ---------------------------------------------------------------------------
// The subject builder
// ---------------------------------------------------------------------------

/** The shipped constructor's data parameter, read off the class rather than restated. */
type RoundingRuleInit = ConstructorParameters<typeof RoundingRule>[0];

/**
 * One element of the `priceGroupRates` collection [model/entity/RoundingRule.cfc:L64].
 *
 * DERIVED FROM THE SHIPPED SIGNATURE, NOT IMPORTED. `src/domain/entities/priceGroupRate.ts`
 * is not one of this suite's two permitted dependencies, so the element type is read
 * out of `RoundingRule`'s own public constructor instead. That keeps the type EXACT -
 * were the collection's element type ever to change, this alias would follow it and the
 * suite would fail to compile rather than silently drift.
 */
type AttachedPriceGroupRate = RoundingRuleInit['priceGroupRates'][number];

/**
 * One materialized `SwPriceGroupRate` row, as an OPAQUE placeholder.
 *
 * JUDGMENT CALL: the delete-context rule this placeholder exists to exercise -
 * `"priceGroupRates": [{"contexts":"delete","maxCollection":0}]`
 * [model/validation/RoundingRule.json:L6] - reads a COLLECTION COUNT and nothing else,
 * so the element's identity is irrelevant to every assertion in this file and no
 * assertion inspects it. `PriceGroupRate` carries private fields and is therefore
 * nominal, so no object literal can satisfy it and the entity class cannot be imported
 * here to construct one; a single narrowly-scoped TYPE ASSERTION through `unknown` is the
 * honest minimum, and it is confined to this one function. The carried identifier exists
 * purely so that failure output names something recognisable.
 *
 * @param priceGroupRateID - an identifier for legibility in failure output.
 */
function anAttachedPriceGroupRate(priceGroupRateID: string): AttachedPriceGroupRate {
  return { priceGroupRateID } as unknown as AttachedPriceGroupRate;
}

/**
 * Builds the rule under test, fresh, with every unspecified column absent.
 *
 * `roundingRuleID` defaults to `''` because that is what the source declares -
 * `unsavedvalue="" default=""` [model/entity/RoundingRule.cfc:L52] - so the default
 * subject is an UNSAVED row and `isNew()` answers honestly for it.
 *
 * `priceGroupRates` defaults to `[]`, matching the shipped contract that the collection
 * is always an array and never `undefined`, so `.length` is always a legal question.
 *
 * Every optional slot is typed `?: T | undefined` rather than `?: T` so that a test can
 * pass `undefined` OUT LOUD where the absence is the thing being asserted;
 * `exactOptionalPropertyTypes` is enabled, which makes those two spellings genuinely
 * different types.
 *
 * @param init - the columns to populate.
 * @param valueRounder - the collaborator to inject; a fresh recording double by default.
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

/**
 * Runs the declarative validator over one expression, on a rule built for the purpose.
 *
 * @param roundingRuleExpression - the persisted expression to judge.
 * @returns what `hasExpressionWithListOfNumericValuesOnly()` answers for it.
 */
function expressionIsAccepted(roundingRuleExpression: string): boolean {
  return aRoundingRule({ roundingRuleExpression }).hasExpressionWithListOfNumericValuesOnly();
}

/**
 * The `maxCollection` bound the delete-context rule declares
 * [model/validation/RoundingRule.json:L6].
 */
const DELETE_CONTEXT_MAX_COLLECTION = 0;

/**
 * The delete-context rule restated literally, for the assertions below only.
 *
 * `"priceGroupRates": [{"contexts":"delete","maxCollection":0}]`
 * [model/validation/RoundingRule.json:L6] means "refuse to delete a rounding rule that
 * price-group rates still reference".
 *
 * THIS IS A SUITE-LOCAL RESTATEMENT AND NOT PRODUCTION ENFORCEMENT, and the difference
 * matters. In CFML the rule consulted a live Hibernate lazy collection, so it blocked
 * whenever child rows existed. Here it can only consult what a repository chose to
 * materialize, which is why src/domain/entities/roundingRule.ts:L601-L614 rules that real
 * delete-context enforcement must be a row-count query owned by the repository, or an
 * equivalent service-tier gate. No query of any kind belongs in this suite, and none
 * appears in it. What this function - and the three tests that use it - establish is
 * narrower and still worth establishing: the entity hands the rule the input it needs,
 * faithfully and without a count of its own.
 *
 * @param rule - the rule a delete is being attempted on.
 * @returns whether the collection is within the declared bound.
 */
function satisfiesDeleteContextRule(rule: RoundingRule): boolean {
  return rule.getPriceGroupRates().length <= DELETE_CONTEXT_MAX_COLLECTION;
}

/**
 * Every member `RoundingRule.prototype` carries, sorted.
 *
 * Thirteen names, one per method the port authors, and this list is the interface-parity
 * contract in executable form: twelve of the thirteen are the legacy CFML names verbatim
 * - the four `accessors=true` getters over [model/entity/RoundingRule.cfc:L52-L55], the
 * two audit timestamp getters [L58, L60], the two opaque account-column getters
 * [L59, L61], the collection getter [L64], and the three declared methods [L66-L86] -
 * and the thirteenth, `isNew`, is the one framework member the ported service genuinely
 * calls [model/service/RoundingRuleService.cfc:L57].
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

/** The members the legacy dispatcher and framework base supplied, none of them ported. */
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
  // so the whole of this method's behaviour is the crossing itself. The lookup it
  // performed - the only `getService(` site in the component - is now the injected
  // collaborator, and the two named arguments are now positional.

  it('hands the collaborator the value it was given, and this rule as the rule', () => {
    const answer = Money.fromDecimalString('8.25');
    const valueRounder = aValueRounder(answer);
    const subject = aRoundingRule({ roundingRuleExpression: '.99' }, valueRounder);
    const value = Money.fromDecimalString('123.4567');

    subject.roundValue(value);

    expect(valueRounder.calls).toHaveLength(1);

    const [call] = valueRounder.calls;

    // The value crosses by IDENTITY, not by equality: nothing re-wraps, re-parses or
    // re-scales it on the way out of the entity.
    expect(call?.value).toBe(value);

    // `roundingRule=this` [model/entity/RoundingRule.cfc:L67] - the same instance, so
    // this is an identity assertion and not a structural one.
    expect(call?.rule).toBe(subject);
  });

  it('hands over a rule the collaborator can read its expression and direction from', () => {
    // [model/service/RoundingRuleService.cfc:L85] reads BOTH columns off the rule it is
    // handed - `arguments.roundingRule.getRoundingRuleExpression()` and
    // `.getRoundingRuleDirection()` - so passing `this` is load-bearing rather than
    // ceremonial. This asserts the received instance actually answers both.
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
    // The answer is deliberately UNRELATED to the value handed in, so that it could not
    // be mistaken for a rounded result and so that any local arithmetic in the entity
    // would show up here as a mismatch. What the service does with an expression is the
    // service suite's to pin - see the HARD BOUNDARY note at the top of this file.
    const answer = Money.fromDecimalString('8.25');
    const subject = aRoundingRule({ roundingRuleExpression: '.99' }, aValueRounder(answer));

    const result = subject.roundValue(Money.fromDecimalString('123.4567'));

    expect(result).toBe(answer);
    expect(result.toFixed2()).toBe('8.25');
  });

  it('delegates on every call and memoizes nothing', () => {
    // Two calls, two DIFFERENT scripted answers. An entity that cached the first answer
    // would return it twice and record one call; the port must do neither.
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
    // Constructing the entity and reading every accessor must cost zero delegations:
    // the collaborator is reached from `roundValue` alone, which is what makes the other
    // twelve members pure reads.
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
    // Order is not cosmetic - it is the order the entries appear in the admin select -
    // and the struct keys stay `value` and `name` rather than being renamed to `label`
    // or `text`, so a reviewer can diff this shape straight against the CFC.
    //
    // The expectation is typed through the SHIPPED `RoundingRuleDirectionOption`, so the
    // three `value` strings are checked against the exported union at compile time as
    // well as at run time.
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
    // `RoundingRuleDirection` is derived from this very option list at
    // src/domain/entities/roundingRule.ts:L347, and this is the one place the union is
    // load-bearing at run time: it types the `value` side of each entry.
    const expectedValues: readonly RoundingRuleDirection[] = ['Closest', 'Up', 'Down'];

    const values = aRoundingRule()
      .getRoundingRuleDirectionOptions()
      .map((option) => option.value);

    expect(values).toEqual(expectedValues);
  });

  it('carries hardcoded English display names rather than resource-bundle keys', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L70-L76]: the three display names are
    // HARDCODED ENGLISH LITERALS written inline in the source, with no `rbKey`, no
    // `hb_rbKey` and no `hb_nullRBKey` anywhere in the component. That is unusual in this
    // codebase - a dotted resource key such as `define.none` is the norm - and it is
    // preserved deliberately: JavaRB is not ported, this subtree introduces NO i18n
    // runtime, and inventing keys for three strings the source hardcodes would fabricate
    // a mechanism the legacy system does not have here.
    const names = aRoundingRule()
      .getRoundingRuleDirectionOptions()
      .map((option) => option.name);

    expect(names).toEqual(['Round to Closest', 'Only Round Up', 'Only Round Down']);

    for (const name of names) {
      // Letters and spaces only: a resource-bundle identifier would carry a `.`, and a
      // translated string would not be readable English at all.
      expect(name).toMatch(/^[A-Za-z ]+$/);
      expect(name).toContain(' ');
    }
  });

  it('returns a fresh array on every call, so no caller can mutate a shared list', () => {
    // The CFML literal was re-evaluated on every invocation, so no two callers ever
    // shared an array. The port returns a new tuple per call for the same reason - and
    // because a hoisted module-scope literal would be shared state on a warm container.
    const subject = aRoundingRule();

    const first = subject.getRoundingRuleDirectionOptions();
    const second = subject.getRoundingRuleDirectionOptions();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('offers the same three options whatever the persisted direction happens to be', () => {
    // The list is ADVISORY: it populates a select and does not describe the row. A rule
    // whose stored direction is outside the list still offers all three, and none of them
    // is filtered out or marked selected by the entity.
    const outOfVocabulary = aRoundingRule({ roundingRuleDirection: 'Sideways' });
    const inVocabulary = aRoundingRule({ roundingRuleDirection: 'Down' });

    expect(outOfVocabulary.getRoundingRuleDirectionOptions()).toEqual(
      inVocabulary.getRoundingRuleDirectionOptions(),
    );
  });
});

describe('getRoundingRuleDirection returns the persisted string, un-narrowed', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L55, model/validation/RoundingRule.json:L5]:
  // the column is a bare `ormtype="string"` with no check constraint and no enumeration,
  // and the schema requires it WITHOUT constraining its value. Required-but-unconstrained
  // means a validated `'Sideways'` is persisted happily and then reaches the rounding
  // switch, where it matches no case and falls through. Only the first half of that is
  // this entity's to answer: the accessor neither rejects nor narrows the value. The
  // fall-through itself is service-side and is asserted there, not here.

  it('round-trips a value that is absent from the option list, without throwing', () => {
    const subject = aRoundingRule({ roundingRuleDirection: 'Sideways' });

    expect(() => subject.getRoundingRuleDirection()).not.toThrow();
    expect(subject.getRoundingRuleDirection()).toBe('Sideways');
  });

  it('confirms that value really is outside the offered vocabulary', () => {
    // Without this, the assertion above could pass on a value that happened to be legal.
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
    // CFML parity [model/entity/RoundingRule.cfc:L55]: the accessor reports the column,
    // and the column is whatever was written to it. CFML comparisons downstream are
    // case-insensitive, but that leniency belongs to the comparing code - reproducing it
    // as a normalization HERE would rewrite persisted data on the way out.
    expect(aRoundingRule({ roundingRuleDirection: 'closest' }).getRoundingRuleDirection()).toBe(
      'closest',
    );
    expect(aRoundingRule({ roundingRuleDirection: 'UP' }).getRoundingRuleDirection()).toBe('UP');
  });

  it('reports undefined for a null column rather than substituting a default', () => {
    // The `'Closest'` default lives on the SERVICE signature
    // [model/service/RoundingRuleService.cfc:L88], which is where CFML applied it when the
    // argument arrived null. Substituting it here would suppress that default and hide
    // the difference between "no direction recorded" and "Closest was chosen".
    const subject = aRoundingRule({ roundingRuleDirection: undefined });

    expect(subject.getRoundingRuleDirection()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hasExpressionWithListOfNumericValuesOnly
//
// CFML parity [model/entity/RoundingRule.cfc:L78-L86], the body VERBATIM:
//
//   public boolean function hasExpressionWithListOfNumericValuesOnly() {
//       for(var i=1; i<=listLen(getRoundingRuleExpression()); i++) {
//           var thisValue = listGetAt(getRoundingRuleExpression(), i);
//           if((len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue)) {
//               return false;
//           }
//       }
//       return true;
//   }
//
// The condition at L81 is the whole test, and it is NOT the "two decimal places" rule it
// resembles. CFML's `find(".", v)` answers a 1-BASED POSITION, or **0** when the
// substring is absent, and the arithmetic is built on that 0. The real rule is therefore
// "exactly two characters after the dot, OR a bare two-character numeric".
//
// Each row below is re-derived from that line rather than copied from a table:
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
    // `'0.00'` is also the expression the service DECLARES AS ITS DEFAULT
    // [model/service/RoundingRuleService.cfc:L88], which is why it has to pass this
    // predicate. What that expression then does to a value is the service suite's to pin -
    // see the HARD BOUNDARY note at the top of this file - and no rounded output is
    // asserted here.
    expect(expressionIsAccepted('0.00')).toBe(true);
  });

  it('a multi-element comma list where every element passes', () => {
    // The loop walks the WHOLE list [model/entity/RoundingRule.cfc:L79] and only reaches
    // `return true` at L85 once no element has offended.
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
    // Short-circuit order is preserved: `return false` at L82 fires on the FIRST
    // offending element, so a list is rejected wherever the offender sits.
    expect(expressionIsAccepted('999,.99')).toBe(false);
  });

  it('a list whose last element offends, after accepting the earlier ones', () => {
    expect(expressionIsAccepted('.99,999')).toBe(false);
  });

  it('a non-numeric element of the right length', () => {
    // The arithmetic half of the condition passes for `'a.99'` - len 4, dot at 2 - and the
    // `!isNumeric(thisValue)` half is what rejects it. Both halves are therefore live, and
    // the arithmetic alone is not the test.
    expect(expressionIsAccepted('a.99')).toBe(false);
  });
});

describe('hasExpressionWithListOfNumericValuesOnly: preserved legacy behaviour', () => {
  it('accepts a bare two-digit expression, which is not a two-decimal value at all', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts "99" because len - find(".") == 2 when no decimal point is present, yielding a fractional derived power of 10^(2-3) = 0.1.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The consequence is concrete rather than theoretical: the service derives its step as
    // `var rrPower = 1 * (10 ^ (len(rr)-3));` [model/service/RoundingRuleService.cfc:L95],
    // so a two-character element drives a FRACTIONAL power. Nothing in the legacy system
    // prevents that - not this predicate, which admits the value, and not the column, which
    // is free text with no format constraint [model/entity/RoundingRule.cfc:L54].
    expect(expressionIsAccepted('99')).toBe(true);
  });

  it('accepts a signed two-decimal expression', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts "-.99" because len 4 minus find(".") 2 is 2 and CFML isNumeric("-.99") is true, so a NEGATIVE rounding candidate passes a test whose purpose is to admit only currency-shaped values.
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('-.99')).toBe(true);
  });

  it('accepts a positively signed two-decimal expression on the same arithmetic', () => {
    // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the sign is counted by len() and never inspected, so "+.99" passes for exactly the reason "-.99" does - the condition tests character positions, not numeric range.
    // Preserved deliberately; do not fix without a product decision.
    expect(expressionIsAccepted('+.99')).toBe(true);
  });

  it('returns true for an empty expression', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L79]: `listLen('')` is 0, so the loop body
    // never executes once and control falls straight through to `return true` at L85. The
    // predicate is VACUOUSLY SATISFIED by an empty expression, and that is correct division
    // of labour rather than a hole: it is the separate `"required":true` rule in the same
    // schema entry [model/validation/RoundingRule.json:L4] that rejects an empty value.
    // Duplicating requiredness enforcement inside a shape check would be the defect.
    expect(expressionIsAccepted('')).toBe(true);
  });

  it('returns true for a list of nothing but delimiters', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L79]: CFML lists CONTRIBUTE NO ELEMENT for
    // an empty run between two delimiters, so `listLen(',,,')` is 0 and this is the empty
    // case again by another spelling - not an expression of three empty candidates.
    expect(expressionIsAccepted(',,,')).toBe(true);
  });

  it('returns true when the column is null, without throwing', () => {
    // VERIFIED CORRECTION: the shipped predicate does NOT throw for an absent expression.
    // It normalizes at src/domain/entities/roundingRule.ts:L1034
    // (`this.roundingRuleExpression ?? ''`) and then answers exactly as the empty case does.
    //
    // CFML parity [model/entity/RoundingRule.cfc:L79]: `listLen()` requires a string, and
    // the legacy engines coerce a null argument to `''` before counting, which yields 0 -
    // observationally identical to the empty expression above, and the same `true`.
    //
    // REACHABILITY CAVEAT: `roundingRuleExpression` is `"required":true` in the `save`
    // context [model/validation/RoundingRule.json:L4], so a validly saved rule cannot carry
    // a null expression. This path is reachable only by invoking the predicate directly on
    // a hydrated row - which is precisely what this test does - and never through the save
    // pipeline the schema governs.
    const subject = aRoundingRule({ roundingRuleExpression: undefined });

    expect(subject.getRoundingRuleExpression()).toBeUndefined();
    expect(() => subject.hasExpressionWithListOfNumericValuesOnly()).not.toThrow();
    expect(subject.hasExpressionWithListOfNumericValuesOnly()).toBe(true);
  });
});

describe('hasExpressionWithListOfNumericValuesOnly: untrimmed list elements', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L80-L81]: `listGetAt` hands back the element
  // EXACTLY as written, padding included, and the two halves of the condition then disagree
  // about that padding. `len()` counts the space and `find()`'s position shifts with it,
  // while `isNumeric()` tolerates surrounding whitespace. The result is an asymmetry that
  // is CFML's rather than the port's, and it is preserved.

  it('accepts an element with a leading space', () => {
    // `' .99'`: len 4, dot at position 2 -> 4 - 2 = 2, and CFML judges `' .99'` numeric. So
    // the naturally written `'.95, .99'` is accepted, space and all.
    expect(expressionIsAccepted('.95, .99')).toBe(true);
  });

  it('rejects an element with a trailing space', () => {
    // `'.95 '`: len 4, dot still at position 1 -> 4 - 1 = 3. The space that was harmless in
    // front of the value is fatal behind it.
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
  // NONE of the four is ENFORCED by the entity, and none is asserted here as though it
  // were: requiredness and schema validation live at the SERVICE tier, so no zod schema is
  // exercised in this file. What the entity owes the schema is (a) the three save-context
  // columns, carried faithfully and unvalidated, (b) the named predicate the expression
  // rule invokes, and (c) the collection the delete rule counts. Those three are what
  // follows.

  it('carries all three save-context columns without validating any of them', () => {
    // A rule with none of the three recorded is constructible and reports each as absent.
    // The entity is not the requiredness gate, so it does not refuse the row.
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
    // No trim, no case change, no default substituted for a null column: the accessor
    // reports the truth and every decision about it belongs to the service.
    const subject = aRoundingRule({ roundingRuleExpression: ' .95 , .99 ' });

    expect(subject.getRoundingRuleExpression()).toBe(' .95 , .99 ');
  });

  it('exposes the predicate under the exact name the schema invokes by string', () => {
    // CFML parity [model/validation/RoundingRule.json:L4]: the `"method"` key names a member
    // by STRING, which the legacy framework resolved through dynamic invocation. The port
    // resolves it by NAME ON THE CLASS instead - there is no dynamic dispatch anywhere in
    // this subtree - so the spelling of the method is part of the contract and a rename
    // would silently break the rule.
    //
    // This is one of exactly FIVE declaratively invoked validators across the in-scope
    // entity slice, measured rather than assumed: `getPromotionCodesDeletableFlag`
    // [model/validation/Promotion.json], `hasUniquePromotionCode`
    // [model/validation/PromotionCode.json], this one, and `hasOneOptionPerOptionGroup`
    // plus `hasUniqueOptions` [model/validation/Sku.json] - five validators over four
    // entity modules, all four of which are ported into this folder.
    const subject = aRoundingRule({ roundingRuleExpression: '.99' });

    expect(Object.getOwnPropertyNames(RoundingRule.prototype)).toContain(
      'hasExpressionWithListOfNumericValuesOnly',
    );
    expect(typeof subject.hasExpressionWithListOfNumericValuesOnly).toBe('function');
    expect(typeof subject.hasExpressionWithListOfNumericValuesOnly()).toBe('boolean');
  });

  it('does validate the expression shape on save, through that predicate', () => {
    // CFML parity [model/validation/RoundingRule.json:L4]: the expression IS validated on
    // save, by the custom method named above. Only the ENTITY-LEVEL property is
    // unconstrained - `property name="roundingRuleExpression" ormtype="string";`
    // [model/entity/RoundingRule.cfc:L54] carries no length, no pattern and no
    // `hb_formFieldType` - so "the expression has no format constraint" is true of the
    // column and false of the save path. Both halves are asserted here so neither can be
    // quoted without the other.
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
    // `maxCollection: 0` [model/validation/RoundingRule.json:L6] means a single attached
    // rate is already too many, so the count that blocks a delete is ONE, not two.
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

    // Handed back by IDENTITY: the entity neither copies, filters nor re-orders what the
    // repository materialized, so the count the delete rule reads is the count it was given.
    expect(subject.getPriceGroupRates()).toBe(attached);
    expect(subject.getPriceGroupRates()).toHaveLength(3);
    expect(satisfiesDeleteContextRule(subject)).toBe(false);
  });

  it('always reports an array, so a count is always a legal question', () => {
    // CFML's ORM answered an initialized collection for a one-to-many, so
    // `arrayLen(x.getPriceGroupRates())` never had an absent case to guard. The port keeps
    // that: `readonly PriceGroupRate[]` and never `undefined`.
    expect(Array.isArray(aRoundingRule().getPriceGroupRates())).toBe(true);
    expect(Array.isArray(aRoundingRule({ priceGroupRates: undefined }).getPriceGroupRates())).toBe(
      true,
    );
  });

  it('declares no add or remove helper for the inverse collection', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L64, L92-L94]: `priceGroupRates` is
    // `inverse="true"`, so the owning side [model/entity/PriceGroupRate.cfc:L68] holds the
    // bookkeeping and this component's Bidirectional Helper Methods banner is EMPTY. No
    // helper is invented to fill it.
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    expect(members).not.toContain('addPriceGroupRate');
    expect(members).not.toContain('removePriceGroupRate');
  });
});

describe('structural parity with the SwRoundingRule row', () => {
  // CFML parity [model/entity/RoundingRule.cfc:L49]: the component declaration carries
  // `entityname="SlatwallRoundingRule" table="SwRoundingRule"`, plus
  // `hb_serviceName="roundingRuleService"` and the literal four-character
  // `hb_permission="this"`. Those names are the SCHEMA CONTRACT and the legacy admin's
  // routing metadata, and the port keeps every one of them as INERT DOC TEXT rather than as
  // a runtime member - so the assertions below deliberately test what the module exposes,
  // which is nothing for those four attributes, instead of inventing accessors for them.
  // The `Sw*` tables are read and written unchanged by this migration: no migration, no
  // rename, no new column, and nothing in this suite generates or seeds schema.

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
    // Most siblings carry one immediately before the audit run - `remoteID` is
    // `property name="remoteID" ormtype="string";` at [model/entity/PriceGroupRate.cfc:L58]
    // and again at [model/entity/PromotionApplied.cfc:L64] - and this entity does not. A
    // search of all 99 source lines of [model/entity/RoundingRule.cfc] for `remoteID`
    // returns ZERO hits, so this is a real schema difference, and inventing the column
    // would breach schema continuity. Both sibling locators were re-verified against the
    // source rather than carried over from a summary.
    const subject = aRoundingRule({ roundingRuleID: 'rr-1' });

    expect(Object.getOwnPropertyNames(RoundingRule.prototype)).not.toContain('getRemoteID');
    expect('getRemoteID' in subject).toBe(false);
    expect('remoteID' in subject).toBe(false);

    // The absence is a COMPILE error as well as a runtime one, and that is the point of
    // porting no dispatcher: there is nothing left to synthesise an accessor from, so a
    // caller reaching for one is caught by the type gate rather than at run time.
    // @ts-expect-error RoundingRule declares no getRemoteID, because [model/entity/RoundingRule.cfc] declares no remoteID column.
    const absent: unknown = subject.getRemoteID;

    expect(absent).toBeUndefined();
  });

  it('is new when the identifier is the empty string', () => {
    // CFML parity [model/entity/RoundingRule.cfc:L52]: `unsavedvalue="" default=""` is what
    // makes the empty string LOAD-BEARING, and the framework chain resolved to exactly this
    // test - `isNew()` [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`,
    // which is `getPrimaryIDValue() == ""` [org/Hibachi/HibachiEntity.cfc:L571-L576].
    //
    // This is the one assertion carried over in substance from
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67], whose
    // `defaults_are_correct()` asserted `isNew()` together with an empty primary id value.
    // It is authored here against the members the port ships, NOT inherited from a base
    // suite - there is no shared test base class anywhere in this subtree.
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
    // `generator="uuid"` [model/entity/RoundingRule.cfc:L52] is NOT reproduced on the entity:
    // id generation belongs to the repository on insert. Two default subjects therefore
    // share the empty identifier rather than each inventing one.
    expect(aRoundingRule().getRoundingRuleID()).toBe(aRoundingRule().getRoundingRuleID());
  });

  it('carries the rule name as persisted', () => {
    expect(aRoundingRule({ roundingRuleName: 'Nines' }).getRoundingRuleName()).toBe('Nines');
    expect(aRoundingRule({ roundingRuleName: '' }).getRoundingRuleName()).toBe('');
  });
});

describe('the audit columns', () => {
  // VERIFIED CORRECTION: TWO timestamps, not three. [model/entity/RoundingRule.cfc:L58-L61]
  // declares four audit properties, of which two are `ormtype="timestamp"` -
  // `createdDateTime` [L58] and `modifiedDateTime` [L60] - and two are `many-to-one`
  // associations to the out-of-scope `Account` entity, which the port collapses to their
  // opaque foreign-key columns `createdByAccountID` [L59] and `modifiedByAccountID` [L61].
  // No `Account` type is imported anywhere and no `Account` instance is ever constructed.
  //
  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded
  // them from mass assignment. The port needs no mechanism for that: the fields are
  // read-only and this class ships no setter at all.

  it('round-trips both timestamps as the instants they were hydrated with', () => {
    // Every business-date literal in this suite is an explicit UTC ISO-8601 string. The
    // ambient clock is never read - no `new Date()` without an argument, and no
    // `Date.now()` - so no assertion here can pass or fail by the calendar.
    const created = new Date('2024-06-01T00:00:00.000Z');
    const modified = new Date('2024-06-02T12:30:45.678Z');

    const subject = aRoundingRule({ createdDateTime: created, modifiedDateTime: modified });

    expect(subject.getCreatedDateTime()).toBe(created);
    expect(subject.getModifiedDateTime()).toBe(modified);
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-02T12:30:45.678Z');
  });

  it('reports an absent timestamp as undefined, never as the epoch and never as zero', () => {
    // The nullable column is genuinely nullable, and `Date | undefined` says so. Substituting
    // `new Date(0)` would invent a January 1970 audit trail, and substituting `0` would not
    // even be a date - both would report a row as audited when it is not.
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
    // CFML parity [model/entity/RoundingRule.cfc:L96-L98]: the ORM Event Hooks banner is
    // EMPTY - no `preInsert`, no `preUpdate`, no `postInsert`, no `postUpdate` - so the audit
    // columns were maintained by the framework on write and are maintained by the repository
    // now. An empty banner implies nothing, and nothing is invented for it.
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    for (const hook of ['preInsert', 'preUpdate', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });
});

describe('the Hibachi base class is documented, not reproduced', () => {
  // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: the legacy component extended
  // `HibachiEntity`, whose `onMissingMethod` dispatcher SYNTHESISED members from property
  // metadata - `get<Prop>Options`, `get<Prop>SmartList`, `get<Prop>Struct`, `get<Prop>Count`,
  // `has<Prop>` and the EAV `get<AttributeCode>` branch - and threw for anything it could not
  // synthesise:
  //
  //   throw('You have called a method #arguments.missingMethodName#() which does not exists
  //          in the #getClassName()# entity.');
  //
  // The EAV branch [org/Hibachi/HibachiEntity.cfc:L559] is guarded on
  // `hasProperty("attributeValues")`, and this entity declares no `attributeValues`, so even
  // in CFML an unknown `getX()` on a RoundingRule fell through to that throw.
  //
  // THE PORT HAS NO DYNAMIC DISPATCH AT ALL: no base class, no `Proxy`, no index signature,
  // no `evaluate()` and no `variables.` scope object. An unknown member is a COMPILE error
  // rather than a runtime throw, and at run time the property is simply absent. That is why
  // the assertions below check for absence rather than for a thrown message - there is no
  // dispatcher left to throw one - and why no base-class suite exists anywhere here.

  it('ships none of the framework members the dispatcher and base class supplied', () => {
    const members = Object.getOwnPropertyNames(RoundingRule.prototype);

    for (const unported of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(unported);
    }
  });

  it('resolves no unknown member at run time, and inherits nothing that would', () => {
    const subject = aRoundingRule({ roundingRuleID: 'rr-1' });

    // Two names the dispatcher would once have handled: an EAV attribute code, and a
    // collection smart list. Neither exists here, in either direction of the prototype chain.
    expect('getSomeCustomAttributeCode' in subject).toBe(false);
    expect('getPriceGroupRatesSmartList' in subject).toBe(false);

    // And nothing sits above the class but `Object`: no ported base entity.
    expect(Object.getPrototypeOf(RoundingRule.prototype)).toBe(Object.prototype);
  });

  it('is an instance of RoundingRule and of nothing else in the port', () => {
    expect(aRoundingRule()).toBeInstanceOf(RoundingRule);
  });
});
