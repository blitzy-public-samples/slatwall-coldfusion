// slatwall-ts - unit suite pinning `src/services/roundingRuleService.ts`
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L327]: locator corrected from the published
// L338 to L327. Re-verified against the source, which wins over any published citation.
//
// LEGACY-NOTE [model/entity/RoundingRule.cfc:L66-L68]: the entity's own delegation entry point
// belongs to `tests/unit/domain/entities/roundingRule.test.ts`.
//
// LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56, L67]: two of the five methods have ZERO
// callers anywhere in the legacy codebase and are covered anyway.

import { beforeEach, describe, expect, it } from 'vitest';

import { RoundingRule } from '../../../src/domain/entities/roundingRule.js';
import type { PromotionRepository } from '../../../src/domain/ports/promotionRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import {
  cfNumberToString,
  cfNumericEquals,
  numberFormat,
  toDecimalString,
} from '../../../src/lib/cfml/numberFormat.js';
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import {
  absolute,
  add,
  equals,
  isGreaterThan,
  isLessThan,
  subtract,
} from '../../../src/lib/cfml/precision.js';
import type { PreciseValue } from '../../../src/lib/cfml/precision.js';
import { RoundingRuleService } from '../../../src/services/roundingRuleService.js';
import type { RoundingRuleFrameworkWrites } from '../../../src/services/roundingRuleService.js';
import type {
  RoundingDirection,
  RoundingRuleDetails,
  RoundingRuleSaveInput,
} from '../../../src/services/roundingRuleService.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';

// Types derived from the shipped surface.
//
// JUDGMENT CALL: the entity's collaborator type and the fixture graph type are DERIVED from the
// shipped declarations rather than restated.

/**
 * The one collaborator `RoundingRule`'s constructor takes, as it declares it.
 */
type RoundingRuleValueRounderShape = ConstructorParameters<typeof RoundingRule>[1];

/**
 * The graph `makePriceGroupFixtures` hands back, as it declares it.
 */
type PriceGroupFixtureGraph = ReturnType<typeof makePriceGroupFixtures>;

// Values written as decimal STRINGS, never as numbers.

/**
 * The value nine of the ten pinned rows start from.
 */
const PINNED_VALUE = toDecimalString('12.3456');

/**
 * What M1 turns `PINNED_VALUE` into before the algorithm runs
 * [model/service/RoundingRuleService.cfc:L89].
 */
const PINNED_VALUE_QUANTIZED = toDecimalString('12.35');

/**
 * The three expressions the pinned rows use, and one that is a comma list.
 */
const EXPRESSION_LEADING_DOT = '.99';
const EXPRESSION_LEADING_ZERO = '0.99';

/**
 * The comparison floor for the secure-consumer invariant, as an exact decimal string.
 */
const ZERO_DECIMAL = '0';
const EXPRESSION_COMMA_LIST = '.95,.99';

/**
 * The three directions the entity publishes [model/entity/RoundingRule.cfc:L70-L76].
 */
const DIRECTION_CLOSEST = 'Closest';
const DIRECTION_UP = 'Up';
const DIRECTION_DOWN = 'Down';

/**
 * `|inputValue - candidate|`, exactly as [model/service/RoundingRuleService.cfc:L123-L130]
 * computes a delta.
 *
 * The legacy body subtracts and then flips the sign by hand, which together are absolute value, so
 * `absolute(subtract(...))` expresses both.
 *
 * Both operands are decimal numerals and the result is a decimal value, so no floating-point step
 * exists anywhere in the chain.
 */
function absoluteDelta(inputValue: string, candidate: string): PreciseValue {
  return absolute(subtract(inputValue, candidate));
}

/**
 * A double that answered a plausible value for an unexercised member would let a regression pass
 * unnoticed; one that raises turns the same regression into a named failure.
 */
function unreachedRepositoryMember(member: string): never {
  throw new Error(
    `the repository double's ${member} was reached. The ported RoundingRuleService consults ` +
      'getRoundingRuleQuery and nothing else - its legacy counterpart declares exactly one ' +
      'collaborator, roundingRuleDAO [model/service/RoundingRuleService.cfc:L51], whose only ' +
      'declaration is getRoundingRuleQuery [model/dao/RoundingRuleDAO.cfc:L51] - so reaching ' +
      'any other member means the service has grown a collaboration this suite does not describe.',
  );
}

/**
 * One recorded rounding-rule lookup, exactly as it arrived.
 */
interface RecordedRoundingRuleLookup {
  readonly roundingRuleID: string;
}

/**
 * In-memory stand-in for the one port the shipped constructor takes.
 *
 * Replaces the legacy `property name="roundingRuleDAO" type="any";`
 * [model/service/RoundingRuleService.cfc:L51], which a DI/1 convention scan resolved at run time.
 *
 * Records every identifier it is asked for, in arrival order.
 */
class RecordingPromotionRepository implements PromotionRepository {
  readonly lookups: RecordedRoundingRuleLookup[] = [];

  constructor(private readonly stub: (roundingRuleID: string) => RoundingRule | undefined) {}

  getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined> {
    this.lookups.push({ roundingRuleID });

    return Promise.resolve(this.stub(roundingRuleID));
  }

  // There is still no `saveRoundingRule` member here, and still none on the port - and that is now
  // a sharper statement than it was, not a weaker one.
  //
  // The service does now perform the durable write, through `RoundingRuleFrameworkWrites` - a
  // contract the SERVICE declares and the composition root satisfies module-locally.
  readonly getActivePromotionRewards: PromotionRepository['getActivePromotionRewards'] = () =>
    unreachedRepositoryMember('getActivePromotionRewards');

  readonly getPromotionPeriodUseCount: PromotionRepository['getPromotionPeriodUseCount'] = () =>
    unreachedRepositoryMember('getPromotionPeriodUseCount');

  readonly getPromotionPeriodAccountUseCount: PromotionRepository['getPromotionPeriodAccountUseCount'] =
    () => unreachedRepositoryMember('getPromotionPeriodAccountUseCount');

  readonly getPromotionCodeUseCount: PromotionRepository['getPromotionCodeUseCount'] = () =>
    unreachedRepositoryMember('getPromotionCodeUseCount');

  readonly getPromotionCodeAccountUseCount: PromotionRepository['getPromotionCodeAccountUseCount'] =
    () => unreachedRepositoryMember('getPromotionCodeAccountUseCount');

  readonly getSalePricePromotionRewardsQuery: PromotionRepository['getSalePricePromotionRewardsQuery'] =
    () => unreachedRepositoryMember('getSalePricePromotionRewardsQuery');
}

/**
 * A recording double for the durable half of `super.save`.
 *
 * Why this exists at all, and why it is not on the repository double.
 */
class RecordingRoundingRuleFrameworkWrites implements RoundingRuleFrameworkWrites {
  readonly saves: RoundingRule[] = [];

  saveRoundingRule(rule: RoundingRule): Promise<RoundingRule> {
    this.saves.push(rule);

    return Promise.resolve(
      new RoundingRule(
        {
          // An unsaved rule is answered with a minted identifier, exactly as the real writer
          // answers one.
          roundingRuleID: rule.isNew() ? MINTED_ROUNDING_RULE_ID : rule.getRoundingRuleID(),
          roundingRuleName: rule.getRoundingRuleName(),
          roundingRuleExpression: rule.getRoundingRuleExpression(),
          roundingRuleDirection: rule.getRoundingRuleDirection(),
          createdDateTime: rule.getCreatedDateTime(),
          createdByAccountID: rule.getCreatedByAccountID(),
          modifiedDateTime: PERSISTED_AUDIT_TIMESTAMP,
          modifiedByAccountID: PERSISTED_AUDIT_ACCOUNT_ID,
          priceGroupRates: rule.getPriceGroupRates(),
        },
        boundaryEnforcingValueRounder,
      ),
    );
  }
}

/**
 * The identifier `RecordingRoundingRuleFrameworkWrites` mints for an unsaved rule.
 */
const MINTED_ROUNDING_RULE_ID = 'minted-by-the-framework-writer';

/**
 * The `modifiedDateTime` the double stamps, fixed so an assertion can name it.
 */
const PERSISTED_AUDIT_TIMESTAMP = new Date('2024-03-04T05:06:07.000Z');

/**
 * The `modifiedByAccountID` the double stamps.
 */
const PERSISTED_AUDIT_ACCOUNT_ID = 'audit-actor-account';

/**
 * A rounder that raises, injected into every rule this suite builds itself.
 *
 * The entity's `roundValue` [model/entity/RoundingRule.cfc:L66-L68] delegates to its injected
 * collaborator, and that entry point is the sibling entity suite's concern.
 */
const boundaryEnforcingValueRounder: RoundingRuleValueRounderShape = {
  roundValueByRoundingRule: () => {
    throw new Error(
      "the entity's roundValue delegation was reached. That entry point " +
        '[model/entity/RoundingRule.cfc:L66-L68] belongs to ' +
        'tests/unit/domain/entities/roundingRule.test.ts, and this suite asserts nothing about ' +
        'it: it exercises RoundingRuleService directly.',
    );
  },
};

/**
 * Builds one `SwRoundingRule` row inline, for the two shapes the shared fixture graph does not
 * carry.
 *
 * `roundingRuleExpression` and `roundingRuleDirection` are accepted as free text with no format
 * constraint, because that is exactly what the column is [model/entity/RoundingRule.cfc:L54-L55].
 */
function buildRoundingRule(init: {
  readonly roundingRuleID: string;
  readonly roundingRuleExpression: string | undefined;
  readonly roundingRuleDirection: string | undefined;
  /**
   * The name, which every case that reaches a SAVE must supply.
   *
   * Optional and defaulting to `undefined`, so no existing case changes: the name is read by
   * nothing outside `saveRoundingRule`'s save-context validation, and `roundValue` never sees it.
   */
  readonly roundingRuleName?: string | undefined;
}): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID: init.roundingRuleID,
      roundingRuleName: init.roundingRuleName,
      roundingRuleExpression: init.roundingRuleExpression,
      roundingRuleDirection: init.roundingRuleDirection,
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
      priceGroupRates: [],
    },
    boundaryEnforcingValueRounder,
  );
}

describe('RoundingRuleService', () => {
  let graph: PriceGroupFixtureGraph;
  let repository: RecordingPromotionRepository;
  let frameworkWrites: RecordingRoundingRuleFrameworkWrites;
  let service: RoundingRuleService;

  beforeEach(() => {
    // A fresh graph per test.
    graph = makePriceGroupFixtures();

    // The default stub resolves the one rule most cases need and nothing else, so an unexpected
    // identifier surfaces as the service's own absent-rule failure rather than as a silently
    // plausible answer.
    //
    // `roundingRuleID = ?` runs under MySQL's default collation, so the real adapter answers the
    // same row for `abc` and `ABC`.
    repository = new RecordingPromotionRepository((roundingRuleID) =>
      roundingRuleID.toLowerCase() === graph.closestRoundingRule.getRoundingRuleID().toLowerCase()
        ? graph.closestRoundingRule
        : undefined,
    );

    frameworkWrites = new RecordingRoundingRuleFrameworkWrites();

    service = new RoundingRuleService(repository, frameworkWrites);
  });

  describe('interface parity', () => {
    it('carries all five legacy method names verbatim and publishes nothing more', () => {
      const publishedMembers = Object.getOwnPropertyNames(RoundingRuleService.prototype);

      // CFML parity [model/service/RoundingRuleService.cfc:L56, L67, L79, L84, L88]: the five
      // declared functions, in legacy CFML camelCase, spelled exactly as the component spells
      // them. Not `save`, not `round`, not `getDetails`.
      expect(publishedMembers).toContain('saveRoundingRule');
      expect(publishedMembers).toContain('getRoundingRuleDetailsByID');
      expect(publishedMembers).toContain('roundValueByRoundingRuleID');
      expect(publishedMembers).toContain('roundValueByRoundingRule');
      expect(publishedMembers).toContain('roundValue');

      // The legacy component declares five functions.
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('delete');
      expect(publishedMembers).not.toContain('deleteRoundingRule');
      expect(publishedMembers).not.toContain('getRoundingRule');
      expect(publishedMembers).not.toContain('newRoundingRule');
      expect(publishedMembers).not.toContain('getRoundingRuleSmartList');
      expect(publishedMembers).not.toContain('roundValueByRoundingRuleExpression');
    });

    it('takes exactly two constructor arguments: the one legacy port and the framework write', () => {
      // T1 APPLIED. The legacy component declares one property
      // [model/service/RoundingRuleService.cfc:L51] resolved by a DI/1 convention scan; the port
      // arrives as an explicit, compile-checked argument.
      //
      // This asserted `1` until the durable write arrived, and the case was titled "takes exactly
      // one collaborator".
      expect(RoundingRuleService.length).toBe(2);

      // Constructing a second service over the same port is legal and needs no teardown, which is
      // the property the isolation case relies on.
      expect(
        new RoundingRuleService(repository, new RecordingRoundingRuleFrameworkWrites()),
      ).toBeInstanceOf(RoundingRuleService);
    });
  });

  // The ten pinned outputs - the acceptance gate.
  //
  // One case per row, each carrying its own derivation so the suite documents the algorithm rather
  // than merely constraining it.

  describe('roundValue - the ten pinned outputs', () => {
    it('quantizes the input to two decimals before measuring anything (M1)', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L89]: var inputValue =
      // numberFormat(arguments.value, "0.00").
      expect(numberFormat(PINNED_VALUE, '0.00')).toBe(PINNED_VALUE_QUANTIZED);
      expect(PINNED_VALUE_QUANTIZED).toHaveLength(5);

      // And the quantization is half-up, so the fourth decimal is not simply truncated away:
      // `12.3456` becomes `12.35`, not `12.34`.
      expect(PINNED_VALUE_QUANTIZED).toBe('12.35');
    });

    it('1. rounds 12.3456 by 0.99 Closest to 10.99', () => {
      // InputValue '12.35' (len 5); rr '0.99' (len 4) so rrPower = 10^1 = 10. Opt1 = left('12.35',
      // 5-4=1) & '0.99' = '1' & '0.99' = '10.99' '10.99' > '12.35'?
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('10.99');

      // The derivation, checked rather than asserted in prose: option one is strictly closer,
      // which is the whole reason it wins here.
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '10.99'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '20.99'),
        ),
      ).toBe(true);
    });

    it('2. rounds 12.3456 by .99 Closest to 11.99 - the same input, a different length', () => {
      // InputValue '12.35'; rr '.99' (len 3) so rrPower = 10^0 = 1. Opt1 = left('12.35', 5-3=2) &
      // '.99' = '12' & '.99' = '12.99' '12.99' > '12.35'?
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST);

      expect(rounded).toBe('11.99');

      // M3 made visible: the only difference between this row and row 1 is a character of
      // expression length, and it moves the answer by a dollar.
      expect(EXPRESSION_LEADING_DOT).toHaveLength(3);
      expect(EXPRESSION_LEADING_ZERO).toHaveLength(4);
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST)).not.toBe(
        rounded,
      );

      // Option two is strictly closer, which is what M4's strict `<` requires before it may
      // displace an already-selected option one.
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '11.99'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '12.99'),
        ),
      ).toBe(true);
    });

    it('3. rounds 12.3456 by .99 Up to 12.99 - the gate admits only candidates above', () => {
      // Candidates are the same two as row 2: '12.99' and '11.99'.
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_UP);

      expect(rounded).toBe('12.99');

      // The gate, checked: `Up` selects the FARTHER candidate here, which is only explicable by
      // the direction test rather than by distance.
      expect(isGreaterThan('12.99', PINNED_VALUE_QUANTIZED)).toBe(true);
      expect(isGreaterThan('11.99', PINNED_VALUE_QUANTIZED)).toBe(false);
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '11.99'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '12.99'),
        ),
      ).toBe(true);
    });

    it('4. rounds 12.3456 by .99 Down to 11.99 - the mirror gate', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L156, L160]: a candidate qualifies only if
      // it sits BELOW the input. Opt1 '12.99' < '12.35' -> does not qualify opt2 '11.99' < '12.35'
      // > qualifies, and is selected.
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_DOWN);

      expect(rounded).toBe('11.99');

      expect(isLessThan('11.99', PINNED_VALUE_QUANTIZED)).toBe(true);
      expect(isLessThan('12.99', PINNED_VALUE_QUANTIZED)).toBe(false);
    });

    it('5. carries returnDelta ACROSS comma-list entries rather than resetting per entry (M2)', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L90-L91, L93]: both accumulators are
      // declared OUTSIDE the loop, so the best candidate across all expressions wins rather than
      // the best within the last one.
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_COMMA_LIST, DIRECTION_CLOSEST);

      expect(rounded).toBe('11.99');

      // Discriminator one - the same two expressions in the other order.
      expect(service.roundValue(PINNED_VALUE, '.99,.95', DIRECTION_CLOSEST)).toBe('11.99');

      // Discriminator two - the same list under `Up`. With the carry, iteration 1 selects '12.95'
      // at delta 0.60 and iteration 2's '12.99' (delta 0.64) is rejected as not strictly closer.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_COMMA_LIST, DIRECTION_UP)).toBe('12.95');
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '11.99'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '11.95'),
        ),
      ).toBe(true);
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '12.95'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '12.99'),
        ),
      ).toBe(true);
    });

    it('6. rounds 12.30 by .99 Closest to 12.99, because a trailing zero corrupts the branch', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: the
      // intermediate is computed ARITHMETICALLY and its len() is then taken, and CFML drops
      // trailing zeros when it stringifies a number.
      // Preserved deliberately; do not fix without a product decision.
      const trailingZeroValue = toDecimalString('12.30');

      const rounded = service.roundValue(
        trailingZeroValue,
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );

      expect(rounded).toBe('12.99');

      // The mechanism itself, isolated: this is the stringification the defect rides on, and it is
      // why `cfNumberToString` exists.
      expect(cfNumberToString('11.30')).toBe('11.3');
      expect(cfNumberToString('11.30')).toHaveLength(4);
      expect(cfNumberToString('11.35')).toHaveLength(5);

      // The corrupted candidate is the far one, so the algorithm chooses the farther of the two
      // REAL candidates by comparing against a candidate that should never have existed.
      expect(isLessThan(absoluteDelta('12.30', '12.99'), absoluteDelta('12.30', '1.99'))).toBe(
        true,
      );
      expect(isLessThan(absoluteDelta('12.30', '11.99'), absoluteDelta('12.30', '12.99'))).toBe(
        true,
      );

      // The contrast that makes the mechanism unmistakable.
      expect(
        service.roundValue(PINNED_VALUE_QUANTIZED, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).toBe('11.99');

      // Any value whose cents end in zero takes the corrupted branch, so this is not a single
      // unlucky row.
      expect(
        service.roundValue(toDecimalString('8.20'), EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).toBe('8.99');
      expect(
        service.roundValue(toDecimalString('8.25'), EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).toBe('7.99');
    });

    it('7. collapses a short input: 7.42 by 9.99 Closest becomes 9.99, an increase', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: when the input numeral is
      // no longer than the expression, both candidates are set to the expression itself, so the
      // expression is returned outright however far it sits from the input.
      // Preserved deliberately; do not fix without a product decision.
      const shortValue = toDecimalString('7.42');

      const rounded = service.roundValue(shortValue, '9.99', DIRECTION_CLOSEST);

      expect(rounded).toBe('9.99');

      // The gate that selects the collapse branch is a STRING-LENGTH comparison, never a value
      // comparison.
      expect(shortValue).toHaveLength(4);
      expect('9.99').toHaveLength(4);
      expect(equals(absoluteDelta(shortValue, '9.99'), absoluteDelta(shortValue, '9.99'))).toBe(
        true,
      );
      expect(isGreaterThan(rounded, shortValue)).toBe(true);
    });

    it('8. collapses a short input the other way: 2.30 by 0.99 Closest becomes 0.99', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: the same collapse, in the
      // opposite direction - a substantial reduction rather than an increase, from a rule a
      // merchant would read as "round up to.99".
      // Preserved deliberately; do not fix without a product decision.
      const shortValue = toDecimalString('2.30');

      const rounded = service.roundValue(shortValue, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('0.99');
      expect(isLessThan(rounded, shortValue)).toBe(true);

      // Note what is not happening: the trailing zero is irrelevant on this row, because the
      // collapse branch never computes an intermediate at all.
      expect(service.roundValue(shortValue, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST)).toBe(
        '2.99',
      );
    });

    it('9. tolerates a NEGATIVE lower candidate: 0.42 by .99 Closest becomes 0.99', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101]: the lower intermediate may go
      // negative, and the resulting candidate numeral keeps its sign - so a signed string is
      // spliced and compared rather than rejected or clamped.
      // Preserved deliberately; do not fix without a product decision.
      const smallValue = toDecimalString('0.42');

      // The negative candidate is tolerated: the call completes rather than raising, which is the
      // property this row exists to pin.
      expect(() =>
        service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).not.toThrow();

      const rounded = service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST);

      expect(rounded).toBe('0.99');

      // The intermediate really is negative, and its stringified length really is 5 - the sign
      // occupies a character, which is what makes the slice land where it does.
      expect(cfNumberToString('-0.58')).toBe('-0.58');
      expect(cfNumberToString('-0.58')).toHaveLength(5);

      // And the signed candidate loses on distance rather than being filtered.
      expect(
        isLessThan(absoluteDelta(smallValue, '0.99'), absoluteDelta(smallValue, '-0.99')),
      ).toBe(true);
      expect(service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_DOWN)).toBe('-0.99');
      expect(service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_UP)).toBe('0.99');
    });

    it('10. applies the DEFAULT expression when the argument is omitted, and it is not inert', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: `roundingExpression` defaults
      // to "0.00", which reads as a no-op and is not one - it turns 12.3456 into 10.00, a
      // substantial reduction for a caller that simply did not pass the argument.
      // Preserved deliberately; do not fix without a product decision.
      const rounded = service.roundValue(PINNED_VALUE);

      expect(rounded).toBe('10.00');

      // The direction default is exercised by the same omission: `Closest` is what
      // [model/service/RoundingRuleService.cfc:L88] declares, and the answer above is the Closest
      // answer.
      expect(service.roundValue(PINNED_VALUE, '0.00', DIRECTION_CLOSEST)).toBe('10.00');
    });

    it('10b. treats an explicitly passed 0.00 identically, so the default is not special-cased', () => {
      // The companion to row.
      const omitted = service.roundValue(PINNED_VALUE);
      const explicit = service.roundValue(PINNED_VALUE, '0.00', DIRECTION_CLOSEST);

      expect(explicit).toBe('10.00');
      expect(explicit).toBe(omitted);
    });

    it('reproduces every row of the shared measured table, which still holds exactly ten', () => {
      // The shared table lives in `tests/fixtures/priceGroupFixtures.ts` and is used rather than
      // restated.
      //
      // `noUncheckedIndexedAccess` is enabled, so the rows are NARROWED by iteration rather than
      // indexed with a postfix assertion.
      expect(graph.roundValueCases).toHaveLength(10);

      for (const measured of graph.roundValueCases) {
        const rounded = service.roundValue(
          measured.input,
          measured.roundingExpression,
          measured.roundingDirection,
        );

        expect(rounded).toBe(measured.expected);
      }

      // The table is data, not behaviour, so its own shape is pinned too: every row is a decimal
      // string on both sides.
      for (const measured of graph.roundValueCases) {
        expect(typeof measured.input).toBe('string');
        expect(typeof measured.expected).toBe('string');
      }
    });
  });

  // The remaining reachable branches of `roundValue`. Each one is a live production state rather
  // than a defensive path, and each returns the quantized input rather than a zero or a
  // substituted default.

  describe('roundValue - the branches that select no candidate', () => {
    it('11. returns the quantized input for a direction outside the vocabulary', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L132]: the roundingDirection switch
      // has cases for Closest, Up and Down only and no default branch.
      // Preserved deliberately; do not fix without a product decision.
      const rounded = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_DOT,
        graph.outOfVocabularyRoundingRuleDirection,
      );

      expect(rounded).toBe(PINNED_VALUE_QUANTIZED);
      expect(rounded).toBe('12.35');

      // It is a REACHABLE live state, not a defensive branch: the column carries no enumeration
      // constraint, so a row can hold anything. The vocabulary the entity publishes is advisory
      // only.
      expect(graph.roundingRuleDirectionVocabulary).toStrictEqual([
        DIRECTION_CLOSEST,
        DIRECTION_UP,
        DIRECTION_DOWN,
      ]);
      expect(graph.roundingRuleDirectionVocabulary).not.toContain(
        graph.outOfVocabularyRoundingRuleDirection,
      );
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, 'closest')).toBe('11.99');
    });

    it('11b. types the direction as the mapped RoundingDirection, which is OPEN by design', () => {
      // This case guards the type, not a new behaviour.
      const persistedDirection: RoundingDirection = graph.outOfVocabularyRoundingRuleDirection;
      const canonicalDirections: readonly RoundingDirection[] = [
        DIRECTION_CLOSEST,
        DIRECTION_UP,
        DIRECTION_DOWN,
      ];

      // And the run-time half: the same two behaviours, reached through the mapped type. An
      // out-of-vocabulary token still passes through; a canonical one still rounds.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, persistedDirection)).toBe(
        PINNED_VALUE_QUANTIZED,
      );
      expect(canonicalDirections).toHaveLength(3);
      expect(
        canonicalDirections.map((direction: RoundingDirection): string =>
          service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, direction),
        ),
      ).toStrictEqual(['11.99', '12.99', '11.99']);
    });

    it('11a. dispatches every direction without regard to case, exactly as a CFML switch does', () => {
      // CFML parity [model/service/RoundingRuleService.cfc:L132-L166]: `switch` over a string
      // compares case-insensitively, so each of these spellings selected its arm in the legacy
      // engine and priced through it.
      const canonicalClosest = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );
      const canonicalUp = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_UP);
      const canonicalDown = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_DOT,
        DIRECTION_DOWN,
      );

      // The three measured answers from AAP 0.6.4, restated so a fold that quietly changed which
      // arm ran would fail here rather than silently agreeing with itself.
      expect(canonicalClosest).toBe('11.99');
      expect(canonicalUp).toBe('12.99');
      expect(canonicalDown).toBe('11.99');

      for (const spelling of ['closest', 'CLOSEST', 'ClOsEsT']) {
        expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, spelling)).toBe(
          canonicalClosest,
        );
      }

      for (const spelling of ['up', 'UP', 'uP']) {
        expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, spelling)).toBe(
          canonicalUp,
        );
      }

      for (const spelling of ['down', 'DOWN', 'dOwN']) {
        expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, spelling)).toBe(
          canonicalDown,
        );
      }

      // Folding is IDENTITY-ONLY: it may not admit a token that is merely similar. A padded
      // spelling is a different string to a CFML struct key and to a CFML `switch` alike, so it
      // still reaches the pass-through tail.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, ' closest ')).toBe(
        PINNED_VALUE_QUANTIZED,
      );
    });

    it('11b. returns the quantized input when a direction gate admits no candidate', () => {
      // The third route to the same tail, and it needs no defect at all: with both candidates
      // BELOW the input, `Up` qualifies neither
      // [model/service/RoundingRuleService.cfc:L145, L149], so nothing is assigned.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_ZERO, DIRECTION_UP)).toBe('20.99');

      const smallValue = toDecimalString('0.42');

      expect(service.roundValue(smallValue, '9.99', DIRECTION_DOWN)).toBe('0.42');

      // Both collapse candidates are the expression itself and both sit above the input, so the
      // `Down` gate rejects each of them and the input falls out untouched - a pass-through, never
      // a zero.
      expect(isGreaterThan('9.99', smallValue)).toBe(true);
    });

    it('11c. returns the quantized input for an empty expression list, without raising', () => {
      // `listLen('')` is 0, so the candidate loop never executes and the tail returns the input.
      expect(service.roundValue(PINNED_VALUE, '', DIRECTION_CLOSEST)).toBe(PINNED_VALUE_QUANTIZED);

      // CFML list semantics: consecutive delimiters collapse and contribute no element, so a list
      // of nothing but delimiters is also empty.
      expect(service.roundValue(PINNED_VALUE, ',,', DIRECTION_CLOSEST)).toBe(
        PINNED_VALUE_QUANTIZED,
      );
    });

    it('12. returns immediately when a candidate already equals the input (L120)', () => {
      // The value handed in is '12.990', which M1 quantizes to '12.99'.
      const alreadyOnTheExpression = toDecimalString('12.990');

      const rounded = service.roundValue(
        alreadyOnTheExpression,
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );

      // Compared by decimal value, not by string identity (M5).
      expect(cfNumericEquals(rounded, alreadyOnTheExpression)).toBe(true);
      expect(rounded).not.toBe(alreadyOnTheExpression);
      expect(rounded).toBe('12.99');

      // The short-circuit really does abandon the rest of the list: a second expression that would
      // otherwise have won is never consulted.
      expect(service.roundValue(alreadyOnTheExpression, '.99,.95', DIRECTION_CLOSEST)).toBe(
        '12.99',
      );

      // And it fires from the SECOND candidate as well as the first, which is what the `||` at
      // [model/service/RoundingRuleService.cfc:L120] provides.
      expect(
        service.roundValue(toDecimalString('13.99'), EXPRESSION_LEADING_DOT, DIRECTION_UP),
      ).toBe('13.99');
    });

    it('accepts an unvalidated two-character expression and steps by less than a cent', () => {
      // LEGACY-NOTE [model/entity/RoundingRule.cfc:L54]: `roundingRuleExpression` is bare
      // `ormtype="string"` with no length and no format constraint, and the declarative rule that
      // guards it - `hasExpressionWithListOfNumericValuesOnly`
      // [model/entity/RoundingRule.cfc:L78-L86] - ACCEPTS `'99'`.
      const holeRow = graph.roundingExpressionCases.find(
        (candidate) => candidate.expression === '99',
      );

      expect(holeRow).toBeDefined();

      if (holeRow === undefined) {
        throw new Error(
          'the shared expression table no longer carries the two-character row that Finding E ' +
            'rests on. It is data owned by tests/fixtures/priceGroupFixtures.ts; restore the ' +
            'row there rather than weakening this case.',
        );
      }

      // The predicate accepts it, and the derived step is fractional - the two facts that together
      // make it a hole rather than merely an odd value.
      expect(holeRow.accepted).toBe(true);

      const derivedPower = holeRow.derivedPowerPerElement;

      expect(derivedPower).toHaveLength(1);

      for (const power of derivedPower) {
        expect(power).toBe('0.1');
        expect(isLessThan(power, '1')).toBe(true);
      }

      // InputValue '12.35' (len 5); rr '99' (len 2), rrPower 0.1. Opt1 = left('12.35', 5-2=3) &
      // '99' = '12.' & '99' = '12.99' '12.99' > '12.35'?
      expect(service.roundValue(PINNED_VALUE, holeRow.expression, DIRECTION_CLOSEST)).toBe('12.99');

      // The splice lands mid-numeral, keeping the decimal point from the input rather than from
      // the expression - which is why a point-free expression can still yield a two-decimal
      // answer.
      expect(service.roundValue(PINNED_VALUE, holeRow.expression, DIRECTION_UP)).toBe('12.99');
    });
  });

  // The declared/actual return-type mismatch, resolved by TYPING rather than by changing
  // behaviour.

  describe('roundValue - the branded decimal-string return', () => {
    it('answers a branded decimal numeral, which its two callers declare as numeric', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: roundValue declares
      // returntype="string" while both of its callers (L79, L84) declare numeric, and
      // PriceGroupService feeds the result straight into precisionEvaluate.
      // Preserved deliberately; do not fix without a product decision.
      const branded: DecimalString = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_ZERO,
        DIRECTION_CLOSEST,
      );

      expect(typeof branded).toBe('string');
      expect(branded).toBe('10.99');

      // A branded numeral is still a plain string at run time, so it presents and compares like
      // one - the brand costs nothing observable.
      expect(branded.length).toBe(5);
      expect(cfNumericEquals(branded, '10.99')).toBe(true);
    });

    it('does not accept an unbranded string in its place - a deliberate type failure', () => {
      // The only escape hatch in this file, and it exists to assert that the brand is load-bearing
      // rather than decorative: a bare literal must not be usable where the branded numeral is
      // required.
      // @ts-expect-error a plain string literal is not assignable to DecimalString.
      const unbranded: DecimalString = '10.99';

      expect(unbranded).toBe('10.99');
    });

    it('takes Money as readily as a branded numeral, and never a number', () => {
      // The shipped parameter is `Money | DecimalString`, and a `number` is deliberately absent
      // from it: an IEEE-754 double is how drift enters a money path, which is why `Money`
      // publishes no numeric factory either.
      const fromMoney = service.roundValue(
        Money.fromDecimalString('12.3456'),
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );
      const fromNumeral = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );

      expect(fromMoney).toBe('11.99');
      expect(fromMoney).toBe(fromNumeral);

      // A `Money` carrying more precision than two decimals is quantized by M1 in exactly the same
      // way, so the two input forms cannot diverge.
      expect(
        service.roundValue(
          Money.fromDecimalString('12.3499999'),
          EXPRESSION_LEADING_DOT,
          DIRECTION_CLOSEST,
        ),
      ).toBe('11.99');
    });
  });

  // `roundValueByRoundingRule` - the method both must-preserve money paths reach. Synchronous, and
  // it must stay that way.

  describe('roundValueByRoundingRule', () => {
    it('is synchronous and answers Money for Money, converting explicitly', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L84-L86]: the body reads two
      // already-materialised fields off the entity it was handed and delegates.
      const rounded = service.roundValueByRoundingRule(
        Money.fromDecimalString('12.3456'),
        graph.closestRoundingRule,
      );

      expect(rounded).toBeInstanceOf(Money);

      // The value agrees with `roundValue` for the same expression and direction, which is the
      // whole of the legacy body.
      const asNumeral = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST);

      expect(asNumeral).toBe('11.99');
      expect(rounded.equals(Money.fromDecimalString(asNumeral))).toBe(true);
      expect(rounded.toFixed2()).toBe('11.99');

      // The CONVERSION is EXPLICIT. `roundValue` answers a decimal STRING and this method answers
      // `Money`; CFML coerced between the two silently at this boundary
      // [model/service/RoundingRuleService.cfc:L84] declares numeric over the string
      // [model/service/RoundingRuleService.cfc:L88] returns.
      expect(typeof asNumeral).toBe('string');
      expect(typeof rounded).toBe('object');
    });

    it('reads the expression and direction off the rule it is handed', () => {
      const value = Money.fromDecimalString('12.3456');

      // The three in-vocabulary rules from the shared graph, all carrying '.99' and differing only
      // in direction - so the answers can differ only because the direction was read off the
      // entity.
      expect(service.roundValueByRoundingRule(value, graph.closestRoundingRule).toFixed2()).toBe(
        '11.99',
      );
      expect(service.roundValueByRoundingRule(value, graph.roundUpRoundingRule).toFixed2()).toBe(
        '12.99',
      );
      expect(service.roundValueByRoundingRule(value, graph.roundDownRoundingRule).toFixed2()).toBe(
        '11.99',
      );

      expect(graph.closestRoundingRule.getRoundingRuleExpression()).toBe(EXPRESSION_LEADING_DOT);
      expect(graph.roundUpRoundingRule.getRoundingRuleExpression()).toBe(EXPRESSION_LEADING_DOT);
      expect(graph.roundDownRoundingRule.getRoundingRuleExpression()).toBe(EXPRESSION_LEADING_DOT);

      // It consults the repository for none of this: the entity already holds both fields, so no
      // lookup may occur.
      expect(repository.lookups).toStrictEqual([]);
    });

    it('passes a rule with an out-of-vocabulary direction through untouched', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L132]: the roundingDirection switch
      // has cases for Closest, Up and Down only and no default branch.
      // Preserved deliberately; do not fix without a product decision.
      const rounded = service.roundValueByRoundingRule(
        Money.fromDecimalString('12.3456'),
        graph.outOfVocabularyDirectionRoundingRule,
      );

      expect(rounded.toFixed2()).toBe('12.35');
      expect(graph.outOfVocabularyDirectionRoundingRule.getRoundingRuleDirection()).toBe(
        graph.outOfVocabularyRoundingRuleDirection,
      );
    });

    it('applies the declared 0.00 default when the rule carries no expression at all', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: `roundingExpression` defaults
      // to "0.00", and a rule whose expression column is NULL therefore does not pass the value
      // through - it reshapes it, turning 12.3456 into 10.00.
      // Preserved deliberately; do not fix without a product decision.
      expect(graph.absentExpressionRoundingRule.getRoundingRuleExpression()).toBeUndefined();

      const rounded = service.roundValueByRoundingRule(
        Money.fromDecimalString('12.3456'),
        graph.absentExpressionRoundingRule,
      );

      expect(rounded.toFixed2()).toBe('10.00');

      // A rule that writes '0.00' out explicitly answers identically, so the default is supplied
      // rather than special-cased.
      expect(
        service
          .roundValueByRoundingRule(
            Money.fromDecimalString('12.3456'),
            graph.defaultExpressionRoundingRule,
          )
          .toFixed2(),
      ).toBe('10.00');
    });

    it('never routes through the entity delegation, which a sibling suite owns', () => {
      const inlineRule = buildRoundingRule({
        roundingRuleID: 'inline-rounding-rule',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      expect(
        service.roundValueByRoundingRule(Money.fromDecimalString('12.3456'), inlineRule).toFixed2(),
      ).toBe('11.99');
    });
  });

  // `roundValueByRoundingRuleID` - the one entry point that crosses the DAO boundary, and
  // therefore the one that is async.

  describe('roundValueByRoundingRuleID', () => {
    it('resolves the rule through the port and then rounds, awaited', async () => {
      // Legacy [model/service/RoundingRuleService.cfc:L79-L82]: read the details
      // [model/service/RoundingRuleService.cfc:L80], delegate to `roundValue` with the two
      // resolved arguments [model/service/RoundingRuleService.cfc:L81].
      //
      // Async because the resolution reaches the DAO, so the call is awaited.
      const rounded = await service.roundValueByRoundingRuleID(
        Money.fromDecimalString('12.3456'),
        graph.closestRoundingRule.getRoundingRuleID(),
      );

      expect(rounded).toBeInstanceOf(Money);
      expect(rounded.toFixed2()).toBe('11.99');

      // Exactly one resolution, carrying exactly the identifier it was given.
      expect(repository.lookups).toStrictEqual([
        { roundingRuleID: graph.closestRoundingRule.getRoundingRuleID() },
      ]);

      // The answer is the same one the rule-carrying entry point gives for the same rule, because
      // both delegate to the same `roundValue`.
      expect(
        service
          .roundValueByRoundingRule(Money.fromDecimalString('12.3456'), graph.closestRoundingRule)
          .toFixed2(),
      ).toBe(rounded.toFixed2());
    });

    it('resolves one identifier once within a single service instance', async () => {
      const value = Money.fromDecimalString('12.3456');
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      const first = await service.roundValueByRoundingRuleID(value, identifier);
      const second = await service.roundValueByRoundingRuleID(value, identifier);

      // Both answers are the same, and the second one came from the record this request had
      // already resolved.
      expect(first.toFixed2()).toBe('11.99');
      expect(second.toFixed2()).toBe('11.99');
      expect(repository.lookups).toHaveLength(1);
    });

    it('raises when no rule carries the identifier, rather than substituting a default', async () => {
      // The port answers `undefined` for an unknown identifier.
      //
      // Nothing is SUBSTITUTED for it, and above all not a zero: in a price path a zero would sell
      // product for free.
      await expect(
        service.roundValueByRoundingRuleID(Money.fromDecimalString('12.3456'), 'no-such-rule'),
      ).rejects.toThrow(/No rounding rule carries the identifier/);

      expect(repository.lookups).toStrictEqual([{ roundingRuleID: 'no-such-rule' }]);
    });

    it('★ answers DIFFERENTLY from the entity path for one and the same rule', async () => {
      // Converting either path to the other's form would silently move money in one direction or
      // the other, so the divergence is pinned here in a single case where both halves are visible
      // at once.
      const absentExpressionRule = graph.absentExpressionRoundingRule;
      const value = Money.fromDecimalString('12.3456');

      const viaQueryRepository = new RecordingPromotionRepository(() => absentExpressionRule);
      const viaQueryService = new RoundingRuleService(
        viaQueryRepository,
        new RecordingRoundingRuleFrameworkWrites(),
      );

      // Both halves are asserted against the same rule instance and the same service, so nothing
      // about the data or the wiring can explain the difference.
      const entityPath = viaQueryService.roundValueByRoundingRule(value, absentExpressionRule);

      expect(entityPath.toFixed2()).toBe('10.00');

      const queryPath = await viaQueryService.roundValueByRoundingRuleID(
        value,
        absentExpressionRule.getRoundingRuleID(),
      );

      expect(queryPath.toFixed2()).toBe('12.35');
      expect(queryPath.equals(entityPath)).toBe(false);
    });
  });

  // `getRoundingRuleDetailsByID` - ZERO external callers, covered anyway.

  describe('getRoundingRuleDetailsByID', () => {
    // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L67]: this method has ZERO callers
    // outside the component - its only other occurrence in the legacy tree is its own use at
    // [model/service/RoundingRuleService.cfc:L80], which makes it effectively a private memo
    // helper.

    it('answers exactly the two keys the legacy memo stored, and nothing else', async () => {
      const details: RoundingRuleDetails = await service.getRoundingRuleDetailsByID(
        graph.closestRoundingRule.getRoundingRuleID(),
      );

      // CFML parity [model/service/RoundingRuleService.cfc:L72-L74]: an empty struct is created
      // and exactly two keys are written into it.
      expect(details).toStrictEqual({
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });
      expect(Object.keys(details)).toStrictEqual([
        'roundingRuleExpression',
        'roundingRuleDirection',
      ]);

      // JUDGMENT CALL pinned: the shipped result is FROZEN, where the legacy body returned the
      // live struct at [model/service/RoundingRuleService.cfc:L76] and a caller could in principle
      // have mutated the memo through it.
      expect(Object.isFrozen(details)).toBe(true);
    });

    it('renders an absent column as the empty string, matching a CFML query column', async () => {
      // CFML parity [model/service/RoundingRuleService.cfc:L73-L74]: the legacy body reads these
      // two values off a QUERY, and a CFML query renders SQL NULL as the empty string.
      const absentColumnsRule = buildRoundingRule({
        roundingRuleID: 'rule-with-null-columns',
        roundingRuleExpression: undefined,
        roundingRuleDirection: undefined,
      });
      const nullColumnRepository = new RecordingPromotionRepository(() => absentColumnsRule);
      const nullColumnService = new RoundingRuleService(
        nullColumnRepository,
        new RecordingRoundingRuleFrameworkWrites(),
      );

      const details = await nullColumnService.getRoundingRuleDetailsByID('rule-with-null-columns');

      expect(details).toStrictEqual({
        roundingRuleExpression: '',
        roundingRuleDirection: '',
      });

      // And an empty expression rounds nothing, which is why this form is the safe one:
      // `listLen('')` is.
      expect(
        (
          await nullColumnService.roundValueByRoundingRuleID(
            Money.fromDecimalString('12.3456'),
            'rule-with-null-columns',
          )
        ).toFixed2(),
      ).toBe('12.35');
    });

    it('resolves an identifier once per instance and answers the recorded values after', async () => {
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      const first = await service.getRoundingRuleDetailsByID(identifier);
      const second = await service.getRoundingRuleDetailsByID(identifier);

      // One resolution for two identical lookups.
      expect(repository.lookups).toHaveLength(1);
      expect(second).toStrictEqual(first);
      expect(second).toBe(first);

      // A DIFFERENT identifier is not answered from the record - the guard is keyed, not global -
      // so it resolves on its own and, here, fails as an absent rule.
      await expect(service.getRoundingRuleDetailsByID('another-rule')).rejects.toThrow(
        /No rounding rule carries the identifier/,
      );
      expect(repository.lookups).toHaveLength(2);
    });

    it('★ records one entry per identifier without regard to case, as a CFML struct key does', async () => {
      // CFML parity [model/service/RoundingRuleService.cfc:L53, L68]: the memo is a STRUCT, and
      // CFML struct keys are case-insensitive, so `abc` and `ABC` were one entry.
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      const canonical = await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toHaveLength(1);

      // The alternative casing loads the same row in MySQL's default collation, so it must resolve
      // from the record rather than issue a second read.
      const upperCased = await service.getRoundingRuleDetailsByID(identifier.toUpperCase());

      expect(repository.lookups).toHaveLength(1);
      expect(upperCased).toBe(canonical);

      // And the eviction reaches both spellings, because there is only one entry to evict.
      await service.saveRoundingRule(graph.closestRoundingRule);
      await service.getRoundingRuleDetailsByID(identifier.toUpperCase());

      expect(repository.lookups).toHaveLength(2);
    });

    it('★ resolves concurrent lookups of one identifier with a single read (single flight)', async () => {
      // The legacy body is SYNCHRONOUS, so "check the struct, then read, then store" could not
      // interleave.
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      const [first, second, third] = await Promise.all([
        service.getRoundingRuleDetailsByID(identifier),
        service.getRoundingRuleDetailsByID(identifier),
        service.getRoundingRuleDetailsByID(identifier.toUpperCase()),
      ]);

      expect(repository.lookups).toHaveLength(1);
      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it('★ does not remember a failed resolution, so a later lookup retries', async () => {
      // Legacy [model/service/RoundingRuleService.cfc:L70-L75]: the zero-row read fails before
      // anything is written into the struct, so a later call tried again.
      await expect(service.getRoundingRuleDetailsByID('absent-rule')).rejects.toThrow(
        /No rounding rule carries the identifier/,
      );
      await expect(service.getRoundingRuleDetailsByID('absent-rule')).rejects.toThrow(
        /No rounding rule carries the identifier/,
      );

      expect(repository.lookups).toStrictEqual([
        { roundingRuleID: 'absent-rule' },
        { roundingRuleID: 'absent-rule' },
      ]);
    });

    it('★ keeps its record private to the instance, so two services cannot observe each other', async () => {
      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L53]: the legacy memo is
      // component-level state, which on a warm container would leak across unrelated requests. The
      // target scopes it to the instance; this test proves two independent instances are isolated.
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      // One shared port that answers a DIFFERENT rule on its second resolution.
      let resolutionCount = 0;
      const alternatingRepository = new RecordingPromotionRepository(() => {
        resolutionCount += 1;

        return resolutionCount === 1 ? graph.closestRoundingRule : graph.roundUpRoundingRule;
      });

      const firstService = new RoundingRuleService(
        alternatingRepository,
        new RecordingRoundingRuleFrameworkWrites(),
      );
      const secondService = new RoundingRuleService(
        alternatingRepository,
        new RecordingRoundingRuleFrameworkWrites(),
      );

      const firstDetails = await firstService.getRoundingRuleDetailsByID(identifier);

      expect(firstDetails.roundingRuleDirection).toBe(DIRECTION_CLOSEST);

      // The second instance resolves for ITSELF rather than reading what the first one recorded,
      // so it observes the port's new answer.
      const secondDetails = await secondService.getRoundingRuleDetailsByID(identifier);

      expect(secondDetails.roundingRuleDirection).toBe(DIRECTION_UP);
      expect(secondDetails).not.toStrictEqual(firstDetails);
      expect(alternatingRepository.lookups).toHaveLength(2);

      // And the first instance is unaffected in the other direction too: it still answers its own
      // recorded values, and it answers the very same frozen object.
      const firstAgain = await firstService.getRoundingRuleDetailsByID(identifier);

      expect(firstAgain).toBe(firstDetails);
      expect(firstAgain.roundingRuleDirection).toBe(DIRECTION_CLOSEST);
      expect(alternatingRepository.lookups).toHaveLength(2);

      // The rounding answers differ accordingly, which is the observable consequence that makes
      // the isolation matter rather than being an implementation detail.
      const value = Money.fromDecimalString('12.3456');

      expect((await firstService.roundValueByRoundingRuleID(value, identifier)).toFixed2()).toBe(
        '11.99',
      );
      expect((await secondService.roundValueByRoundingRuleID(value, identifier)).toFixed2()).toBe(
        '12.99',
      );
    });
  });

  // `saveRoundingRule` - ZERO callers, covered anyway. Its declared purpose is memo eviction
  // [model/service/RoundingRuleService.cfc:L55].

  describe('saveRoundingRule', () => {
    // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56]: this method has ZERO callers
    // anywhere in the legacy codebase - it is an admin/framework-only surface reached through the
    // Hibachi save dispatcher rather than from application code.
    //
    // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56]: there is no delete counterpart to
    // this save override, and none is added.

    it('answers the PERSISTED rule, with both optional arguments omitted', async () => {
      // `exactOptionalPropertyTypes` is enabled and the optional arguments are GENUINELY OMITTED
      // here rather than passed as undefined, so the declared default for `context` - `"save"`,
      // exactly as [model/service/RoundingRuleService.cfc:L56] declares.
      const saved = await service.saveRoundingRule(graph.closestRoundingRule);

      expect(saved).not.toBe(graph.closestRoundingRule);
      expect(frameworkWrites.saves).toStrictEqual([graph.closestRoundingRule]);
      expect(saved.getRoundingRuleID()).toBe(graph.closestRoundingRule.getRoundingRuleID());
      expect(saved.getModifiedDateTime()).toStrictEqual(PERSISTED_AUDIT_TIMESTAMP);
      expect(saved.getModifiedByAccountID()).toBe(PERSISTED_AUDIT_ACCOUNT_ID);

      // Neither optional argument is read by the ported body: the eviction logic does not consult
      // them, and [model/service/RoundingRuleService.cfc:L63] passed them straight on.
      const data: RoundingRuleSaveInput = { roundingRuleName: 'A renamed rule' };

      await service.saveRoundingRule(graph.closestRoundingRule, data, 'save');
      await service.saveRoundingRule(graph.closestRoundingRule, data, 'anyContext');

      expect(frameworkWrites.saves).toHaveLength(3);

      // The payload is handed on untouched - no key added, none rewritten.
      expect(data).toStrictEqual({ roundingRuleName: 'A renamed rule' });

      // No repository call of any kind is issued: saving reads nothing back.
      expect(repository.lookups).toStrictEqual([]);
    });

    it('★★★ mints an identifier for an UNSAVED rule, so a caller can tell an insert happened', async () => {
      // The other half of the durable contract.
      const unsavedRule = buildRoundingRule({
        roundingRuleID: '',
        roundingRuleName: 'A brand new rule',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      expect(unsavedRule.isNew()).toBe(true);

      const saved = await service.saveRoundingRule(unsavedRule);

      expect(saved.getRoundingRuleID()).toBe(MINTED_ROUNDING_RULE_ID);
      expect(saved.isNew()).toBe(false);

      // And the rule the caller still holds is untouched: entities in this subtree are immutable,
      // so persistence answers a new instance rather than mutating the argument.
      expect(unsavedRule.isNew()).toBe(true);
    });

    describe('save-context validation, from model/validation/RoundingRule.json', () => {
      it('refuses a rule with no name, and writes nothing', async () => {
        const nameless = buildRoundingRule({
          roundingRuleID: 'rule-without-a-name',
          roundingRuleName: '',
          roundingRuleExpression: EXPRESSION_LEADING_DOT,
          roundingRuleDirection: DIRECTION_CLOSEST,
        });

        const refused = await service.saveRoundingRule(nameless);

        expect(refused).toBe(nameless);
        expect(refused.getError('roundingRuleName')).toStrictEqual([
          'roundingRuleName is required',
        ]);
        expect(frameworkWrites.saves).toStrictEqual([]);
      });

      it('refuses a rule with no expression, and writes nothing', async () => {
        const expressionless = buildRoundingRule({
          roundingRuleID: 'rule-without-an-expression',
          roundingRuleName: 'A named rule with no expression',
          roundingRuleExpression: '',
          roundingRuleDirection: DIRECTION_CLOSEST,
        });

        const refused = await service.saveRoundingRule(expressionless);

        // One error, not two: the `required` failure short-circuits the
        // `hasExpressionWithListOfNumericValuesOnly` qualifier on the same property.
        expect(refused.getError('roundingRuleExpression')).toStrictEqual([
          'roundingRuleExpression is required',
        ]);
        expect(frameworkWrites.saves).toStrictEqual([]);
      });

      it('refuses a rule whose expression fails the declared entity method, and writes nothing', async () => {
        // `"method":"hasExpressionWithListOfNumericValuesOnly"` is the third rule the JSON
        // declares on this property, and it is INVOKED on the entity
        // [model/entity/RoundingRule.cfc:L78-L86] rather than reimplemented.
        const nonNumeric = buildRoundingRule({
          roundingRuleID: 'rule-with-a-non-numeric-expression',
          roundingRuleName: 'A named rule with a non-numeric expression',
          roundingRuleExpression: 'nearest,.99',
          roundingRuleDirection: DIRECTION_CLOSEST,
        });

        expect(nonNumeric.hasExpressionWithListOfNumericValuesOnly()).toBe(false);

        const refused = await service.saveRoundingRule(nonNumeric);

        expect(refused.hasError('roundingRuleExpression')).toBe(true);
        expect(refused.getError('roundingRuleExpression')[0]).toContain(
          'hasExpressionWithListOfNumericValuesOnly',
        );
        expect(frameworkWrites.saves).toStrictEqual([]);
      });

      it('refuses a rule with no direction, and writes nothing', async () => {
        const directionless = buildRoundingRule({
          roundingRuleID: 'rule-without-a-direction',
          roundingRuleName: 'A named rule with no direction',
          roundingRuleExpression: EXPRESSION_LEADING_DOT,
          roundingRuleDirection: '',
        });

        const refused = await service.saveRoundingRule(directionless);

        expect(refused.getError('roundingRuleDirection')).toStrictEqual([
          'roundingRuleDirection is required',
        ]);
        expect(frameworkWrites.saves).toStrictEqual([]);
      });

      it('★★ applies the rules ONLY in the save context, because validate() is context-gated', async () => {
        // `validate(context=...)` [org/Hibachi/HibachiService.cfc:L151] selects the rule set, and
        // all three field rules sit in `"save"`.
        const nameless = buildRoundingRule({
          roundingRuleID: 'rule-without-a-name',
          roundingRuleName: '',
          roundingRuleExpression: EXPRESSION_LEADING_DOT,
          roundingRuleDirection: DIRECTION_CLOSEST,
        });

        const saved = await service.saveRoundingRule(nameless, undefined, 'delete');

        expect(frameworkWrites.saves).toStrictEqual([nameless]);
        expect(saved.getRoundingRuleID()).toBe('rule-without-a-name');
      });

      it('compares the context case-insensitively, as CFML compares a string', async () => {
        // CFML `eq` folds case, so `context="SAVE"` selected the same rule set as `"save"`.
        // `cfEquals` is what preserves that; a `===` would have let a caller skip every rule by
        // capitalising one letter.
        const nameless = buildRoundingRule({
          roundingRuleID: 'rule-without-a-name',
          roundingRuleName: '',
          roundingRuleExpression: EXPRESSION_LEADING_DOT,
          roundingRuleDirection: DIRECTION_CLOSEST,
        });

        const refused = await service.saveRoundingRule(nameless, undefined, 'SAVE');

        expect(refused.hasErrors()).toBe(true);
        expect(frameworkWrites.saves).toStrictEqual([]);
      });
    });

    // The step whose absence made this method unable to save anything.

    it('★ POPULATES all three columns from the payload BEFORE validating', async () => {
      // Every column blank on the entity, every column supplied by the payload. Under the old
      // no-op populate this save was refused three times over; it must now succeed.
      const blank = buildRoundingRule({
        roundingRuleID: '',
        roundingRuleName: '',
        roundingRuleExpression: '',
        roundingRuleDirection: '',
      });

      const saved = await service.saveRoundingRule(blank, {
        roundingRuleName: '  Nine Ninety Nine  ',
        roundingRuleExpression: '  .99  ',
        roundingRuleDirection: '  Closest  ',
      });

      // TRIMMED, because `_setProperty(name, trim(value))` trims every simple value
      // `org/Hibachi/HibachiTransient.cfc`.
      expect(blank.getRoundingRuleName()).toBe('Nine Ninety Nine');
      expect(blank.getRoundingRuleExpression()).toBe('.99');
      expect(blank.getRoundingRuleDirection()).toBe('Closest');

      expect(blank.hasErrors()).toBe(false);
      expect(frameworkWrites.saves).toStrictEqual([blank]);
      expect(saved.hasErrors()).toBe(false);
    });

    it('★ an INVALID PAYLOAD cannot pass on STALE entity state', async () => {
      // The entity is valid on its own.
      const valid = buildRoundingRule({
        roundingRuleID: 'rule-that-is-valid-on-its-own',
        roundingRuleName: 'A valid rule',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      const refused = await service.saveRoundingRule(valid, { roundingRuleExpression: '   ' });

      expect(refused.getRoundingRuleExpression()).toBe('');
      expect(refused.getError('roundingRuleExpression')).toStrictEqual([
        'roundingRuleExpression is required',
      ]);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    it('★ leaves a column ALONE when the payload omits its key', async () => {
      // `structKeyExists(arguments.data, name)` is the populate guard, so an ABSENT key is "do not
      // touch" rather than "populate to undefined".
      const rule = buildRoundingRule({
        roundingRuleID: 'rule-with-a-partial-payload',
        roundingRuleName: 'Name On The Entity',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      await service.saveRoundingRule(rule, { roundingRuleName: 'Name From The Payload' });

      expect(rule.getRoundingRuleName()).toBe('Name From The Payload');
      expect(rule.getRoundingRuleExpression()).toBe(EXPRESSION_LEADING_DOT);
      expect(rule.getRoundingRuleDirection()).toBe(DIRECTION_CLOSEST);
    });

    it('★ reads payload keys case-insensitively, as a CFML struct is read', async () => {
      // Populate matched CFML property names case-insensitively, so a caller sending
      // `ROUNDINGRULENAME` populated `roundingRuleName`. A case-sensitive read would silently drop
      // it.
      const rule = buildRoundingRule({
        roundingRuleID: 'rule-with-a-shouted-payload-key',
        roundingRuleName: 'Name On The Entity',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      await service.saveRoundingRule(rule, {
        ROUNDINGRULENAME: 'Name From The Shouted Key',
      } as unknown as Parameters<typeof service.saveRoundingRule>[1]);

      expect(rule.getRoundingRuleName()).toBe('Name From The Shouted Key');
    });

    it('★ populates NOTHING when the payload argument is absent', async () => {
      // The framework guard is `structKeyExists(arguments, "data")` - an ARGUMENT presence test.
      // With no payload there is nothing to populate, and the entity is validated and written as
      // it stands.
      const rule = buildRoundingRule({
        roundingRuleID: 'rule-saved-with-no-payload',
        roundingRuleName: 'Name On The Entity',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      await service.saveRoundingRule(rule);

      expect(rule.getRoundingRuleName()).toBe('Name On The Entity');
      expect(frameworkWrites.saves).toStrictEqual([rule]);
    });

    it('★★ persists WITHOUT a repository write member, because the write is a separate collaborator', async () => {
      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L63]: the legacy body ends in
      // `return super.save(argumentcollection=arguments)` - framework-inherited generic CRUD from
      // `HibachiService`.
      //
      // The second half of that reasoning was the mistake, and it is worth naming precisely: a
      // DOCUMENTED dropped write is still a dropped write.
      const portMembers: Readonly<Record<keyof PromotionRepository, true>> = Object.freeze({
        getActivePromotionRewards: true,
        getPromotionPeriodUseCount: true,
        getPromotionPeriodAccountUseCount: true,
        getPromotionCodeUseCount: true,
        getPromotionCodeAccountUseCount: true,
        getSalePricePromotionRewardsQuery: true,
        getRoundingRuleQuery: true,
      });

      expect(Object.keys(portMembers)).toHaveLength(7);
      expect(Object.keys(portMembers)).not.toContain('saveRoundingRule');
      expect('saveRoundingRule' in repository).toBe(false);
      const saved = await service.saveRoundingRule(graph.closestRoundingRule);

      expect(frameworkWrites.saves).toStrictEqual([graph.closestRoundingRule]);
      expect(saved).not.toBe(graph.closestRoundingRule);
      expect(repository.lookups).toStrictEqual([]);
    });

    it('evicts the recorded details for a saved rule, so the next resolution reaches the port', async () => {
      // Legacy [model/service/RoundingRuleService.cfc:L55-L61]: the whole reason the default save
      // is overridden.
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toHaveLength(1);

      await service.saveRoundingRule(graph.closestRoundingRule);

      // The eviction is the WHOLE observable effect of the method, which is exactly what
      // [model/service/RoundingRuleService.cfc:L55] says the override is for.
      await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toStrictEqual([
        { roundingRuleID: identifier },
        { roundingRuleID: identifier },
      ]);
    });

    it('evicts only the saved rule, leaving other recorded identifiers alone', async () => {
      // `structDelete` [model/service/RoundingRuleService.cfc:L59] removes one key, keyed by the
      // saved entity's own identifier [model/service/RoundingRuleService.cfc:L58] - it does not
      // clear the whole struct. A service that discarded everything would pass the previous case
      // and fail this one.
      const closestIdentifier = graph.closestRoundingRule.getRoundingRuleID();
      const upIdentifier = graph.roundUpRoundingRule.getRoundingRuleID();

      const twoRuleRepository = new RecordingPromotionRepository((roundingRuleID) =>
        roundingRuleID === closestIdentifier
          ? graph.closestRoundingRule
          : graph.roundUpRoundingRule,
      );
      const twoRuleService = new RoundingRuleService(
        twoRuleRepository,
        new RecordingRoundingRuleFrameworkWrites(),
      );

      await twoRuleService.getRoundingRuleDetailsByID(closestIdentifier);
      await twoRuleService.getRoundingRuleDetailsByID(upIdentifier);

      expect(twoRuleRepository.lookups).toHaveLength(2);

      await twoRuleService.saveRoundingRule(graph.closestRoundingRule);

      // The other identifier still answers from the record: one more resolution for the evicted
      // rule, none for the untouched one.
      await twoRuleService.getRoundingRuleDetailsByID(upIdentifier);

      expect(twoRuleRepository.lookups).toHaveLength(2);

      await twoRuleService.getRoundingRuleDetailsByID(closestIdentifier);

      expect(twoRuleRepository.lookups).toStrictEqual([
        { roundingRuleID: closestIdentifier },
        { roundingRuleID: upIdentifier },
        { roundingRuleID: closestIdentifier },
      ]);
    });

    it('skips eviction for an unsaved rule, whose identifier no record can hold', async () => {
      // Legacy [model/service/RoundingRuleService.cfc:L57]: the `isNew()` gate.
      const unsavedRule = buildRoundingRule({
        roundingRuleID: '',
        roundingRuleName: 'An unsaved rule',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      expect(unsavedRule.isNew()).toBe(true);

      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      await service.getRoundingRuleDetailsByID(identifier);
      expect(repository.lookups).toHaveLength(1);
      const saved = await service.saveRoundingRule(unsavedRule);

      expect(saved.getRoundingRuleID()).toBe(MINTED_ROUNDING_RULE_ID);

      // Nothing was evicted, so the previously recorded identifier still answers.
      await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toHaveLength(1);

      // And the rules the shared graph carries are all persisted, which is what makes the eviction
      // cases above exercise the other side of the gate.
      expect(graph.closestRoundingRule.isNew()).toBe(false);
    });
  });

  // The gap is real, and it cannot be closed inside the service.
  //
  // What CAN be done, and is done below, is to make the requirement executable: state the three
  // properties `roundValue` does not have, prove each with a concrete input.

  describe('the secure-consumer invariant', () => {
    /**
     * Lift a decimal string into the arbitrary-precision domain.
     *
     * `add(value, '0')` rather than a `Decimal` constructor, because `src/lib/cfml/precision.ts`
     * is the only sanctioned door onto the decimal substrate in this project and it exposes no
     * lift of its own - every export takes `PreciseInput`.
     */
    function lift(value: string): PreciseValue {
      return add(value, ZERO_DECIMAL);
    }

    /**
     * The clamp a consumer that must not inherit this behaviour has to apply.
     *
     * Deliberately defined in the TEST rather than exported from the service: it is the CALLER'S
     * obligation, and putting it in `src/` would be the parity break AAP 0.9.3 forbids.
     */
    function clampToChargeableRange(rounded: string, original: string): PreciseValue {
      const roundedValue = lift(rounded);
      const originalValue = lift(original);

      if (isLessThan(roundedValue, ZERO_DECIMAL)) {
        return lift(ZERO_DECIMAL);
      }
      return isGreaterThan(roundedValue, originalValue) ? originalValue : roundedValue;
    }

    it('does not guarantee a result at or below its input, and 7.42 by 9.99 proves it', () => {
      const original = toDecimalString('7.42');

      const rounded = service.roundValue(original, '9.99', DIRECTION_CLOSEST);

      expect(rounded).toBe('9.99');
      expect(isGreaterThan(rounded, original)).toBe(true);
      // A consumer that clamps gets the original back; one that does not overcharges.
      expect(equals(clampToChargeableRange(rounded, original), original)).toBe(true);
    });

    it('does not guarantee a non-negative result, and 0.42 by .99 Down proves it', () => {
      const original = toDecimalString('0.42');

      const rounded = service.roundValue(original, EXPRESSION_LEADING_DOT, DIRECTION_DOWN);

      expect(isLessThan(rounded, ZERO_DECIMAL)).toBe(true);
      // A consumer that clamps charges zero rather than paying the customer.
      expect(equals(clampToChargeableRange(rounded, original), ZERO_DECIMAL)).toBe(true);
    });

    it('does not guarantee a bounded proportional move, and 2.30 by 0.99 proves it', () => {
      // AAP 0.6.4 verified case 8: a 57% price cut from a rule that reads like a rounding nicety.
      // Bounding the MAGNITUDE of the move is therefore also the consumer's problem, not just
      // bounding the sign.
      const original = toDecimalString('2.30');

      const rounded = service.roundValue(original, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('0.99');
      const moved = absolute(subtract(original, rounded));

      expect(isGreaterThan(moved, '1.00')).toBe(true);
    });

    it('leaves a well-behaved result untouched, so the clamp is a floor and not a rewrite', () => {
      // The other HALF of the OBLIGATION. A clamp that changed ordinary results would be its own
      // defect, so the invariant is asserted in the passing direction too: AAP 0.6.4 verified case
      // 1, which needs no correction.
      const original = PINNED_VALUE;

      const rounded = service.roundValue(original, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('10.99');
      expect(equals(clampToChargeableRange(rounded, original), rounded)).toBe(true);
    });

    it('records that the port applies no such clamp at either shipped consumer', () => {
      // The honest statement of where the port stands, asserted rather than described.
      const rule = buildRoundingRule({
        roundingRuleID: 'negative-net-rule',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_DOWN,
      });

      const raw = service.roundValueByRoundingRule(Money.fromDecimalString('0.42'), rule);

      expect(isLessThan(raw.toDecimalString(), ZERO_DECIMAL)).toBe(true);
    });
  });
});

describe('rounding-expression resource limits (S-10, resource half)', () => {
  // The exposure: `powerOfTen(rr.length - 3)` renders `'0'.repeat(exponent)`, so the LENGTH of a
  // persisted free-text list member drives a string allocation, and the member COUNT drives how
  // many times.

  let boundedService: RoundingRuleService;

  beforeEach(() => {
    boundedService = new RoundingRuleService(
      new RecordingPromotionRepository(() => undefined),
      new RecordingRoundingRuleFrameworkWrites(),
    );
  });

  it('leaves every realistic expression untouched, including the AAP-measured ones', () => {
    // The ceilings are only defensible if nothing real reaches them. These are the expressions AAP
    // 0.6.4 measures, plus the multi-member form, evaluated through the guarded path.
    for (const expression of ['0.99', '.99', '.95,.99', '9.99', '0.00']) {
      expect(() =>
        boundedService.roundValue(PINNED_VALUE, expression, DIRECTION_CLOSEST),
      ).not.toThrow();
    }
  });

  it('accepts a member AT the length ceiling, so the bound is inclusive', () => {
    // 256 characters. A ceiling that rejected its own stated maximum would be an off-by-one
    // reachable only by the one input nobody constructs by hand.
    const atCeiling = '9'.repeat(256);

    expect(() =>
      boundedService.roundValue(PINNED_VALUE, atCeiling, DIRECTION_CLOSEST),
    ).not.toThrow();
  });

  it('★★ REFUSES A MEMBER BEYOND THE LENGTH CEILING before it becomes an exponent', () => {
    const beyondCeiling = '9'.repeat(257);

    expect(() => boundedService.roundValue(PINNED_VALUE, beyondCeiling, DIRECTION_CLOSEST)).toThrow(
      /at most 256 characters/u,
    );
  });

  it('accepts a member count AT the ceiling and refuses one beyond it', () => {
    const atCeiling = Array.from({ length: 256 }, () => '.99').join(',');
    const beyondCeiling = Array.from({ length: 257 }, () => '.99').join(',');

    expect(() =>
      boundedService.roundValue(PINNED_VALUE, atCeiling, DIRECTION_CLOSEST),
    ).not.toThrow();
    expect(() => boundedService.roundValue(PINNED_VALUE, beyondCeiling, DIRECTION_CLOSEST)).toThrow(
      /at most 256 comma-separated members/u,
    );
  });

  it('★★ REFUSES ON THE RAW LENGTH ALONE, WITHOUT TRAVERSING THE VALUE AT ALL', () => {
    // Unguarded, a member of this length would make `'0'.repeat(...)` build a string of the same
    // order - the cheapest denial of service in the pricing path, from a single persisted row.
    //
    // A tripwire measures the same property exactly, and more strictly.
    let lengthReads = 0;
    let traversals = 0;
    const hostile = {
      get length(): number {
        lengthReads += 1;

        return 50_000_001;
      },
      [Symbol.iterator]: (): Iterator<string> => {
        traversals += 1;

        throw new Error(
          'TRAVERSED: a list operation walked the rounding expression before the size gate refused ' +
            'it. The raw-length check must precede listLen and listGetAt, because reaching a member ' +
            'means the string has already been traversed.',
        );
      },
    } as unknown as string;

    expect(() => boundedService.roundValue(PINNED_VALUE, hostile, DIRECTION_CLOSEST)).toThrow(
      /at most 65792 characters in total/u,
    );

    // Non-vacuous in both directions: the gate consulted the length, and nothing consulted the
    // value.
    expect(lengthReads).toBeGreaterThanOrEqual(1);
    expect(traversals).toBe(0);
  });

  it('and the three size gates fire CHEAPEST-FIRST, proven by which limit each refusal names', () => {
    // Guard ORDER is observable without timing, because each gate names its own limit. An input
    // that violates more than one is refused by whichever runs first, so the message identifies
    // the order.
    //
    // 300 members of 250 characters: 75,299 in total, so it is over the total and over the member
    // count.
    const overTotalAndCount = Array.from({ length: 300 }, () => '9'.repeat(250)).join(',');

    expect(overTotalAndCount.length).toBeGreaterThan(65792);
    expect(() =>
      boundedService.roundValue(PINNED_VALUE, overTotalAndCount, DIRECTION_CLOSEST),
    ).toThrow(/at most 65792 characters in total/u);

    // 300 members, one of them 300 characters, 30,499 in total: inside the total, over the count,
    // and carrying an over-long member. The COUNT gate names itself, which puts it second.
    const overCountAndMemberLength = [
      '9'.repeat(300),
      ...Array.from({ length: 299 }, () => '9'.repeat(100)),
    ].join(',');

    expect(overCountAndMemberLength.length).toBeLessThanOrEqual(65792);
    expect(() =>
      boundedService.roundValue(PINNED_VALUE, overCountAndMemberLength, DIRECTION_CLOSEST),
    ).toThrow(/at most 256 comma-separated members/u);

    // Five members, one of them 300 characters: inside the total and inside the count, so the
    // per-member gate is the only one left to fire - and it names the offending member's position.
    const overMemberLengthOnly = ['.99', '.95', '9'.repeat(300), '.99', '.95'].join(',');

    expect(() =>
      boundedService.roundValue(PINNED_VALUE, overMemberLengthOnly, DIRECTION_CLOSEST),
    ).toThrow(/member 3 is 300/u);
  });

  it('rejects on the derived total only where the member limits could not have applied', () => {
    // The equivalence claim, asserted rather than asserted-in-a-comment: a list at the total
    // ceiling made of in-range members is ACCEPTED.
    const atBothLimits = Array.from({ length: 256 }, () => '9'.repeat(255)).join(',');

    expect(atBothLimits.length).toBeLessThanOrEqual(65792);
    expect(() =>
      boundedService.roundValue(PINNED_VALUE, atBothLimits, DIRECTION_CLOSEST),
    ).not.toThrow();
  });

  it('names the limit and the offending length, but never the offending value', () => {
    // Persisted pricing configuration is not published into an error string, matching the
    // no-leaking-errors standard the logger and error mapper already hold to.
    const marker = 'SENTINELVALUE';
    const hostile = marker + '9'.repeat(300);

    try {
      boundedService.roundValue(PINNED_VALUE, hostile, DIRECTION_CLOSEST);
      expect.unreachable('an over-long expression member must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('RoundingExpressionTooLargeError');
      expect((error as Error).message).toContain('313');
      expect((error as Error).message).not.toContain(marker);
    }
  });
});
