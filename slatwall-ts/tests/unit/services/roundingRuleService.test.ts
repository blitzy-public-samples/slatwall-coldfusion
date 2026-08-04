// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/roundingRuleService.ts`
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and saying so is a
// requirement rather than a courtesy: presenting net-new coverage as parity
// would fail the traceability gate. `meta/tests/unit/service/` holds exactly
// four components - `AccountServiceTest.cfc`, `HibachiServiceTest.cfc`,
// `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc` - none of them in
// scope, and there is NO legacy `RoundingRuleServiceTest.cfc` anywhere under
// `meta/tests/**`. No legacy test exercises rounding at all. Across the whole
// migration only `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` are extended, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub
// contributing zero coverage to anybody. There is no antecedent for this file.
//
// The legacy assertions that DO exist elsewhere are carried forward by their own
// sibling suites. Nothing is borrowed here, and no lineage is claimed.
//
// ---------------------------------------------------------------------------
// WHY THIS SUITE IS THE FOUNDATION OF THE SERVICE TIER'S MONEY COVERAGE
// ---------------------------------------------------------------------------
// `roundValueByRoundingRule` is reached by BOTH must-preserve money paths:
//
//   * Promotion discount math. [model/service/PromotionService.cfc:L1006] hands
//     it `precisionEvaluate('originalAmount - discountAmountPreRounding')` - the
//     NET amount the customer would pay - and [L1007] then derives the discount
//     back out as `originalAmount - roundedFinalAmount`. A rounding rule shapes
//     the FINAL PRICE and the discount is the residual, so reading the argument
//     as a discount would invert the arithmetic.
//   * The price-group cascade. [model/service/PriceGroupService.cfc:L327] calls
//     `arguments.priceGroupRate.getRoundingRule().roundValue(newPrice)` under the
//     `isNull` guard at [L326], and that entity method delegates straight here
//     [model/entity/RoundingRule.cfc:L66-L68].
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L327]: locator corrected from
// the published L338 to L327.
// Re-verified against the source, which wins over any published citation. L338
// is the comment `//return the newPrice and make sure that it is just a two
// decimal number` and L339 is `return numberFormat(newPrice, "0.00");`, so
// neither carries the call. Both promotion locators - [L1006] and [L1026] - were
// found EXACT, as was every locator inside
// `model/service/RoundingRuleService.cfc`.
//
// ---------------------------------------------------------------------------
// ⚠️ A MATHEMATICALLY "CORRECTED" ROUNDING ANSWER FAILS THIS SUITE
// ---------------------------------------------------------------------------
// `roundValue` is decimal-STRING manipulation, not numeric rounding. It measures
// the string LENGTH of an intermediate, slices a prefix off it, concatenates the
// rounding expression onto that prefix, and compares the candidates by value.
// Six of the ten pinned answers below are counter-intuitive, and every one of
// them is what the legacy engine actually charges. A tidier implementation would
// be a DIFFERENT FUNCTION that moves money.
//
// THE SIX MECHANICS EVERY CASE BELOW DEPENDS ON
//   M1 The input is quantized to two decimals BEFORE anything else
//      [model/service/RoundingRuleService.cfc:L89], so `12.3456` becomes the
//      string `'12.35'` and the algorithm never sees the original. Every length
//      measurement downstream is a measurement of that two-decimal form.
//   M2 `returnValue` and `returnDelta` are declared OUTSIDE the comma-list loop
//      [L90-L91], so the best candidate across ALL expressions wins rather than
//      the best within the last one.
//   M3 The step is `1 * (10 ^ (len(rr)-3))` [L95], where `^` is CFML
//      exponentiation. The expression's LENGTH is load-bearing: `'.99'` steps by
//      1 while `'0.99'` steps by 10, which is why the two produce different
//      answers for one input.
//   M4 Ties go to OPTION ONE. The first check assigns the accumulator [L134-L136]
//      and the second then needs a STRICTLY smaller delta [L138] to displace it.
//   M5 Candidate equality [L120] and every comparison are BY DECIMAL VALUE, so
//      `'12.350'` equals `'12.35'`. Assertions here follow suit where the source
//      compares numerically.
//   M6 The direction switch [L132-L166] has cases for `Closest`, `Up` and `Down`
//      and NO `default:`, so an unrecognised direction assigns nothing and the
//      tail [L170-L174] returns the quantized input untouched.
//
// ---------------------------------------------------------------------------
// THE FIVE FINDINGS ARE PINNED AS DEFECTS, NOT REPAIRED
// ---------------------------------------------------------------------------
//   A Trailing-zero stringification [L101-L102, L108-L109]: the intermediate is
//     computed arithmetically and then `len()`-ed, and CFML drops trailing zeros
//     when it stringifies a number, so any value whose cents end in zero takes a
//     corrupted branch.
//   B The default expression `'0.00'` [L88] is not inert: it turns 12.3456 into
//     10.00.
//   C Short-input collapse [L115-L118] sets BOTH candidates to the expression.
//   D Negative intermediate candidates are legal, and `'-0.99'` is a candidate.
//   E No format constraint narrows the expression, so a two-character expression
//     yields a step smaller than one cent.
//
// BUDGET LEDGERS - NOTHING IS SPENT HERE. No signature reshaping, no visibility
// widening, no signature widening and NO deliberate divergence. Every defect this
// suite touches is preserved, and each assertion that pins one carries the
// uniform marker immediately beside it.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
//   * NO SQL, SO THE PARAMETERIZED-STATEMENT OBLIGATION DOES NOT APPLY HERE, and
//     that is stated rather than left as an apparent omission. This suite issues
//     no query of any kind: the one rounding-rule lookup goes through an
//     in-memory port double, and the service under test builds no statement.
//     Prepared-statement assertions - the property `cfqueryparam` provided -
//     belong exclusively to the sibling-owned `tests/integration/repositories/`.
//   * NO DATABASE, NO DRIVER, NO SOCKET AND NO FILESYSTEM. Nothing under
//     `src/repositories/**` is imported, and the MySQL driver is never reached.
//   * NO ENVIRONMENT READ AND NO CREDENTIAL OF ANY KIND. The suite passes with a
//     completely empty environment; `src/lib/config.ts` and `src/lib/logger.ts`
//     are deliberately not imported, and nothing under `src/handlers/**` is
//     either. There is no ambient request scope to stand in for.
//   * NO NON-FUNCTIONAL ASSERTION. [model/service/RoundingRuleService.cfc:L66]
//     carries a rationale for the memo framed as a claim about a framework
//     cache-rebuild cost. That framing is NOT carried forward, here or anywhere:
//     this migration asserts no such requirement because none exists in the
//     source. The memo is exercised below purely as CORRECTNESS and REQUEST
//     SCOPING - which values a resolution answers, and whether one instance can
//     observe another's - and no timing of any kind is measured or claimed.
//   * NO MOCKING LIBRARY, NO CONTAINER, NO COMPOSITION ROOT AND NO SERVICE
//     LOCATOR. Collaborators are hand-written in-memory doubles constructed fresh
//     per test, and the subject is built by calling its constructor.
//   * NO EXPRESSION EVALUATOR. The rounding expression is parsed by string and
//     list operations in the shipped service, and this suite adds no parser,
//     no dynamic code construction and no regular-expression rewrite of it.
//   * NO EXPORT. This file exports nothing at all, so no other module can couple
//     to it.
//
// ---------------------------------------------------------------------------
// OWNERSHIP BOUNDARY - RECORDED, AND NOT CROSSED
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/entity/RoundingRule.cfc:L66-L68]: the entity's own
// delegation entry point belongs to `tests/unit/domain/entities/roundingRule.test.ts`.
// `public numeric function roundValue(required any value)` reaches
// `getService("roundingRuleService").roundValueByRoundingRule(...)` - an eighth
// service-locator site beyond the seven the transformation plan inventories - and
// the ported entity takes that collaborator as a constructor argument. Nothing
// below asserts anything about it. Where this suite needs to build a rule of its
// own it injects a rounder that RAISES if reached, which is the strongest
// available statement that the boundary is respected rather than merely declared.
//
// LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56, L67]: two of the five
// methods have ZERO callers anywhere in the legacy codebase and are covered
// anyway.
// `saveRoundingRule` [L56] is reached only through the framework save dispatcher,
// and `getRoundingRuleDetailsByID` [L67] is called only from [L80] inside this
// same component. The two that are live are `roundValueByRoundingRule` [L84] with
// two call sites - [model/service/PromotionService.cfc:L1006] and
// [model/service/PriceGroupService.cfc:L327], both must-preserve money paths -
// and `roundValueByRoundingRuleID` [L79] with exactly one,
// [model/service/PromotionService.cfc:L1026]. Every converted method needs a
// test, so the zero-caller pair is pinned too and labelled as such.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST FOR THIS PROJECT
// ---------------------------------------------------------------------------
// The rules source was read in full and returned the single line `No user rules
// provided.`, so the read is complete rather than partial. No rule has been
// invented to fill the gap, and the absence is NOT licence to lower the bar: the
// substitute enterprise-standard practices apply at full strength. The ones this
// file carries are maximal type strictness with no escape hatch other than the
// single deliberate type-failure assertion below, the domain-inward layer
// boundary, decimal STRINGS and `Money` as the only monetary vocabulary, zero
// exports, and in-code annotation of every judgment call and every preserved
// defect. Zero files enter scope by rule mandate, and there are no rule conflicts
// to resolve.
// ---------------------------------------------------------------------------

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
import type {
  RoundingRuleDetails,
  RoundingRuleSaveInput,
} from '../../../src/services/roundingRuleService.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';

// ---------------------------------------------------------------------------
// Types derived from the shipped surface
//
// JUDGMENT CALL: the entity's collaborator type and the fixture graph type are
// DERIVED from the shipped declarations rather than restated. Both are
// deliberately un-exported by their own modules - the port inventory is locked,
// so neither may be promoted to a published name - and deriving them means this
// suite cannot drift from what it is handed: retype either one and this file
// stops compiling, which is exactly the signal a suite should give rather than
// continuing to pass against a contract that has moved.
// ---------------------------------------------------------------------------

/** The one collaborator `RoundingRule`'s constructor takes, as it declares it. */
type RoundingRuleValueRounderShape = ConstructorParameters<typeof RoundingRule>[1];

/** The graph `makePriceGroupFixtures` hands back, as it declares it. */
type PriceGroupFixtureGraph = ReturnType<typeof makePriceGroupFixtures>;

// ---------------------------------------------------------------------------
// Values written as decimal STRINGS, never as numbers
//
// Every monetary value in this file is a decimal string literal or a `Money`
// built from one. Not one expected value is computed with JavaScript arithmetic,
// because several cases exist precisely because a trailing zero changes the
// answer and a numeric literal would destroy the property under test before the
// algorithm ever measured it. `12.30` as a number is `12.3`, and that single
// dropped character is Finding A.
// ---------------------------------------------------------------------------

/** The value nine of the ten pinned rows start from. */
const PINNED_VALUE = toDecimalString('12.3456');

/** What M1 turns `PINNED_VALUE` into before the algorithm runs [L89]. */
const PINNED_VALUE_QUANTIZED = toDecimalString('12.35');

/** The three expressions the pinned rows use, and one that is a comma list. */
const EXPRESSION_LEADING_DOT = '.99';
const EXPRESSION_LEADING_ZERO = '0.99';

/** The comparison floor for the secure-consumer invariant, as an exact decimal string. */
const ZERO_DECIMAL = '0';
const EXPRESSION_COMMA_LIST = '.95,.99';

/** The three directions the entity publishes [model/entity/RoundingRule.cfc:L70-L76]. */
const DIRECTION_CLOSEST = 'Closest';
const DIRECTION_UP = 'Up';
const DIRECTION_DOWN = 'Down';

/**
 * `|inputValue - candidate|`, exactly as [L123-L130] computes a delta.
 *
 * The legacy body subtracts and then flips the sign by hand, which together are
 * absolute value, so `absolute(subtract(...))` expresses both. It exists so that
 * the derivation comments on the pinned cases are CHECKED rather than merely
 * asserted in prose: several rows below prove WHY a candidate won by comparing
 * the two deltas the algorithm compared.
 *
 * Both operands are decimal numerals and the result is a decimal value, so no
 * floating-point step exists anywhere in the chain.
 */
function absoluteDelta(inputValue: string, candidate: string): PreciseValue {
  return absolute(subtract(inputValue, candidate));
}

/**
 * Raised by any repository member this suite proves is never reached.
 *
 * A double that answered a plausible value for an unexercised member would let a
 * regression pass unnoticed; one that raises turns the same regression into a
 * named failure. These members are therefore a COMPLETE implementation of a test
 * double rather than deferred work - the behaviour they implement is "this must
 * not happen, and here is which member happened".
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

/** One recorded rounding-rule lookup, exactly as it arrived. */
interface RecordedRoundingRuleLookup {
  readonly roundingRuleID: string;
}

/**
 * In-memory stand-in for the one port the shipped constructor takes.
 *
 * Replaces the legacy `property name="roundingRuleDAO" type="any";`
 * [model/service/RoundingRuleService.cfc:L51], which a DI/1 convention scan
 * resolved at run time. Here it is an explicit constructor argument typed to a
 * port INTERFACE, which is transformation rule T1 - and it is why constructing
 * the subject needs nothing but one object.
 *
 * Records every identifier it is asked for, in arrival order. That list is what
 * lets the cases below count resolutions, which is how the memo's request scoping
 * is proven: one entry means the memo answered, two mean it did not.
 *
 * Answers whatever `stub` returns for the identifier, so a test can hand back a
 * different rule on a later call and prove which instance observed which answer.
 *
 * NOT `async`, deliberately: the port answers a promise, and returning a resolved
 * one keeps the double free of an `await` it has no work to wait for.
 */
class RecordingPromotionRepository implements PromotionRepository {
  readonly lookups: RecordedRoundingRuleLookup[] = [];

  constructor(private readonly stub: (roundingRuleID: string) => RoundingRule | undefined) {}

  getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined> {
    this.lookups.push({ roundingRuleID });

    return Promise.resolve(this.stub(roundingRuleID));
  }

  // ★ THERE IS NO `saveRoundingRule` MEMBER HERE, AND THERE IS NONE ON THE PORT. For one
  // revision this class carried a recording `saves: RoundingRule[]` array, a `saveFailure`
  // field and a `saveRoundingRule` implementation, against an eighth method added to
  // `PromotionRepository`. The port is back to SEVEN READS and all three are gone with it.
  // Their absence is now load-bearing rather than incidental: the six raising members below
  // plus the one lookup above are the WHOLE port, so if the service ever reaches for a write
  // again there is no member for it to reach, and the file stops compiling.
  //
  // The other six members of the port. Every one raises, which is the strongest
  // available statement that this service touches exactly the ONE repository
  // operation above - enforced at run time rather than asserted in prose.
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
 * A rounder that raises, injected into every rule this suite builds itself.
 *
 * The entity's `roundValue` [model/entity/RoundingRule.cfc:L66-L68] delegates to
 * its injected collaborator, and that entry point is the sibling entity suite's
 * concern. Handing the entity a rounder that cannot answer makes the ownership
 * boundary executable: if anything below ever routed through the entity instead
 * of calling the service directly, the run fails by name.
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
 * Builds one `SwRoundingRule` row inline, for the two shapes the shared fixture
 * graph does not carry.
 *
 * Everything the fixture DOES carry is taken from it rather than restated - the
 * six named rules, the direction vocabulary, the nine expression-acceptance rows
 * and the ten measured `roundValue` rows all live there. This builder covers only
 * what it cannot supply: an UNSAVED rule, whose empty identifier is what
 * `isNew()` [model/entity/RoundingRule.cfc:L52] reports on, and a rule carrying
 * the unvalidated two-character expression of Finding E.
 *
 * `roundingRuleExpression` and `roundingRuleDirection` are accepted as free text
 * with no format constraint, because that is exactly what the column is
 * [model/entity/RoundingRule.cfc:L54-L55]. No validation is added here.
 */
function buildRoundingRule(init: {
  readonly roundingRuleID: string;
  readonly roundingRuleExpression: string | undefined;
  readonly roundingRuleDirection: string | undefined;
}): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID: init.roundingRuleID,
      roundingRuleName: undefined,
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RoundingRuleService', () => {
  let graph: PriceGroupFixtureGraph;
  let repository: RecordingPromotionRepository;
  let service: RoundingRuleService;

  beforeEach(() => {
    // A fresh graph per test. `makePriceGroupFixtures` constructs every entity,
    // every collection and every recorded call list inside the call, so two tests
    // share no mutable object at all - which is what makes the two-instance
    // isolation case below a statement about the SERVICE rather than about
    // fixture reuse.
    graph = makePriceGroupFixtures();

    // The default stub resolves the one rule most cases need and nothing else, so
    // an unexpected identifier surfaces as the service's own absent-rule failure
    // rather than as a silently plausible answer.
    repository = new RecordingPromotionRepository((roundingRuleID) =>
      roundingRuleID === graph.closestRoundingRule.getRoundingRuleID()
        ? graph.closestRoundingRule
        : undefined,
    );

    service = new RoundingRuleService(repository);
  });

  // -------------------------------------------------------------------------
  // Interface parity. Method-level equivalence at the service boundary is this
  // migration's acceptance contract, so it gets its own assertions rather than
  // being inferred from the fact that the other cases compile.
  // -------------------------------------------------------------------------

  describe('interface parity', () => {
    it('carries all five legacy method names verbatim and publishes nothing more', () => {
      const publishedMembers = Object.getOwnPropertyNames(RoundingRuleService.prototype);

      // CFML parity [model/service/RoundingRuleService.cfc:L56, L67, L79, L84, L88]:
      // the five declared functions, in legacy CFML camelCase, spelled exactly as
      // the component spells them. Not `save`, not `round`, not `getDetails`.
      expect(publishedMembers).toContain('saveRoundingRule');
      expect(publishedMembers).toContain('getRoundingRuleDetailsByID');
      expect(publishedMembers).toContain('roundValueByRoundingRuleID');
      expect(publishedMembers).toContain('roundValueByRoundingRule');
      expect(publishedMembers).toContain('roundValue');

      // The legacy component declares FIVE functions. Everything else a caller
      // might expect of a service arrived by inheritance from the framework base
      // component, which is deliberately not ported, so its absence is faithful
      // rather than incomplete and none of these may be invented. An exact
      // whole-list assertion is deliberately not used: it would also fail for a
      // private helper, which this contract does not speak to.
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('delete');
      expect(publishedMembers).not.toContain('deleteRoundingRule');
      expect(publishedMembers).not.toContain('getRoundingRule');
      expect(publishedMembers).not.toContain('newRoundingRule');
      expect(publishedMembers).not.toContain('getRoundingRuleSmartList');
      expect(publishedMembers).not.toContain('roundValueByRoundingRuleExpression');
    });

    it('takes exactly one collaborator, so the graph is wired by constructor alone', () => {
      // T1 APPLIED. The legacy component declares one property
      // [model/service/RoundingRuleService.cfc:L51] resolved by a DI/1 convention
      // scan; the port arrives as an explicit, compile-checked argument. There is
      // no runtime scan, no service locator and no container package anywhere.
      expect(RoundingRuleService.length).toBe(1);

      // Constructing a second service over the same port is legal and needs no
      // teardown, which is the property the isolation case relies on.
      expect(new RoundingRuleService(repository)).toBeInstanceOf(RoundingRuleService);
    });
  });

  // -------------------------------------------------------------------------
  // ★★★ THE TEN PINNED OUTPUTS - THE ACCEPTANCE GATE
  //
  // One case per row, each carrying its own derivation so the suite documents
  // the algorithm rather than merely constraining it. Every input and every
  // expectation is a decimal string literal.
  //
  // The shared fixture table `graph.roundValueCases` carries the same ten rows,
  // and the final case in this block walks it. The arrangement is deliberate and
  // is two layers rather than a duplication: the hand-written rows are where the
  // derivations live and are readable, while the table walk proves the shipped
  // service and the shared fixture data still agree - so drift in either one is
  // caught rather than absorbed.
  // -------------------------------------------------------------------------

  describe('roundValue - the ten pinned outputs', () => {
    it('quantizes the input to two decimals before measuring anything (M1)', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L89]:
      //   var inputValue = numberFormat(arguments.value, "0.00");
      // Stated first because it is the mechanic most easily missed: `12.3456` is
      // never the value the algorithm works on. Its two-decimal form is 5
      // characters long, and 5 is what every `len()` test downstream compares.
      expect(numberFormat(PINNED_VALUE, '0.00')).toBe(PINNED_VALUE_QUANTIZED);
      expect(PINNED_VALUE_QUANTIZED).toHaveLength(5);

      // And the quantization is half-up, so the fourth decimal is not simply
      // truncated away: `12.3456` becomes `12.35`, not `12.34`.
      expect(PINNED_VALUE_QUANTIZED).toBe('12.35');
    });

    it('1. rounds 12.3456 by 0.99 Closest to 10.99', () => {
      // inputValue '12.35' (len 5); rr '0.99' (len 4) so rrPower = 10^1 = 10.
      //   opt1 = left('12.35', 5-4=1) & '0.99' = '1' & '0.99' = '10.99'
      //   '10.99' > '12.35'? NO, so the second candidate is sought ABOVE:
      //   higher = 12.35 + 10 = 22.35 -> opt2 = left('22.35',1) & '0.99' = '20.99'
      //   deltas 1.36 and 8.64, so option one wins.
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('10.99');

      // The derivation, checked rather than asserted in prose: option one is
      // strictly closer, which is the whole reason it wins here.
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '10.99'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '20.99'),
        ),
      ).toBe(true);
    });

    it('2. rounds 12.3456 by .99 Closest to 11.99 - the same input, a different length', () => {
      // inputValue '12.35'; rr '.99' (len 3) so rrPower = 10^0 = 1.
      //   opt1 = left('12.35', 5-3=2) & '.99' = '12' & '.99' = '12.99'
      //   '12.99' > '12.35'? YES, so the second candidate is sought BELOW:
      //   lower = 12.35 - 1 = 11.35 -> opt2 = left('11.35',2) & '.99' = '11.99'
      //   deltas 0.64 and 0.36; option two is STRICTLY closer, so it displaces
      //   option one under M4.
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST);

      expect(rounded).toBe('11.99');

      // M3 made visible: the ONLY difference between this row and row 1 is a
      // character of expression length, and it moves the answer by a dollar.
      expect(EXPRESSION_LEADING_DOT).toHaveLength(3);
      expect(EXPRESSION_LEADING_ZERO).toHaveLength(4);
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST)).not.toBe(
        rounded,
      );

      // Option two is strictly closer, which is what M4's strict `<` requires
      // before it may displace an already-selected option one.
      expect(
        isLessThan(
          absoluteDelta(PINNED_VALUE_QUANTIZED, '11.99'),
          absoluteDelta(PINNED_VALUE_QUANTIZED, '12.99'),
        ),
      ).toBe(true);
    });

    it('3. rounds 12.3456 by .99 Up to 12.99 - the gate admits only candidates above', () => {
      // Candidates are the same two as row 2: '12.99' and '11.99'.
      // Legacy [model/service/RoundingRuleService.cfc:L145, L149]: a candidate
      // qualifies only if it sits ABOVE the input.
      //   opt1 '12.99' > '12.35' -> qualifies, and is selected
      //   opt2 '11.99' > '12.35' -> does NOT qualify, so its smaller delta is
      //                             irrelevant and it is never considered
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_UP);

      expect(rounded).toBe('12.99');

      // The gate, checked: `Up` selects the FARTHER candidate here, which is only
      // explicable by the direction test rather than by distance.
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
      // Legacy [model/service/RoundingRuleService.cfc:L156, L160]: a candidate
      // qualifies only if it sits BELOW the input.
      //   opt1 '12.99' < '12.35' -> does NOT qualify
      //   opt2 '11.99' < '12.35' -> qualifies, and is selected
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_DOWN);

      expect(rounded).toBe('11.99');

      expect(isLessThan('11.99', PINNED_VALUE_QUANTIZED)).toBe(true);
      expect(isLessThan('12.99', PINNED_VALUE_QUANTIZED)).toBe(false);
    });

    it('5. carries returnDelta ACROSS comma-list entries rather than resetting per entry (M2)', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L90-L91, L93]: both
      // accumulators are declared OUTSIDE the loop, so the best candidate across
      // ALL expressions wins rather than the best within the last one.
      //
      // '.95,.99' Closest, iteration by iteration:
      //   i=1, rr '.95': opt1 '12.95' delta 0.60 (selected, returnDelta = 0.60)
      //                  opt2 '11.95' delta 0.40 (strictly closer, so it displaces
      //                  option one and returnDelta becomes 0.40)
      //   i=2, rr '.99': opt1 '12.99' delta 0.64 - NOT < 0.40, rejected
      //                  opt2 '11.99' delta 0.36 - < 0.40, so it wins overall
      const rounded = service.roundValue(PINNED_VALUE, EXPRESSION_COMMA_LIST, DIRECTION_CLOSEST);

      expect(rounded).toBe('11.99');

      // ⚠️ THIS ROW ALONE DOES NOT DISCRIMINATE, AND SAYING SO IS THE HONEST
      // FRAMING. Measured against a variant that resets both accumulators each
      // iteration, `'.95,.99'` under `Closest` still answers `'11.99'`, because
      // the second iteration's option two is the closest candidate either way. So
      // two rows that DO discriminate are asserted here, and they are what makes
      // this case fail if the carry is ever removed.
      //
      // Discriminator one - the same two expressions in the OTHER order. With the
      // carry, iteration 1 fixes returnDelta at 0.36 for '11.99' and iteration 2's
      // '11.95' (delta 0.40) cannot displace it. Reset per iteration, iteration 2
      // would start from null and answer '11.95'.
      expect(service.roundValue(PINNED_VALUE, '.99,.95', DIRECTION_CLOSEST)).toBe('11.99');

      // Discriminator two - the same list under `Up`. With the carry, iteration 1
      // selects '12.95' at delta 0.60 and iteration 2's '12.99' (delta 0.64) is
      // rejected as not strictly closer. Reset per iteration, iteration 2 would
      // start from null and answer '12.99'.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_COMMA_LIST, DIRECTION_UP)).toBe('12.95');

      // And the delta relationships those two claims rest on.
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
      // trailing zeros when it stringifies a number, so a value whose cents end in zero is
      // sliced one character short and yields a wildly wrong candidate.
      // Preserved deliberately; do not fix without a product decision.
      //
      // inputValue '12.30' (len 5); rr '.99' (len 3), rrPower 1.
      //   opt1 = left('12.30', 2) & '.99' = '12.99'
      //   '12.99' > '12.30'? YES -> lower = 12.30 - 1 = 11.3, NOT '11.30'
      //   len('11.3') is 4, so left('11.3', 4-3=1) = '1' and opt2 = '1.99'
      //   deltas 0.69 and 10.31 -> option one wins, and the answer goes UP.
      // A correct implementation would answer '11.99' at delta 0.31.
      const trailingZeroValue = toDecimalString('12.30');

      const rounded = service.roundValue(
        trailingZeroValue,
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );

      expect(rounded).toBe('12.99');

      // The mechanism itself, isolated: this is the stringification the defect
      // rides on, and it is why `cfNumberToString` exists.
      expect(cfNumberToString('11.30')).toBe('11.3');
      expect(cfNumberToString('11.30')).toHaveLength(4);
      expect(cfNumberToString('11.35')).toHaveLength(5);

      // The corrupted candidate is the far one, so the algorithm chooses the
      // farther of the two REAL candidates by comparing against a candidate that
      // should never have existed.
      expect(isLessThan(absoluteDelta('12.30', '12.99'), absoluteDelta('12.30', '1.99'))).toBe(
        true,
      );
      expect(isLessThan(absoluteDelta('12.30', '11.99'), absoluteDelta('12.30', '12.99'))).toBe(
        true,
      );

      // ★ THE CONTRAST THAT MAKES THE MECHANISM UNMISTAKABLE. One character of
      // difference in the input - cents that do not end in zero - and the same
      // expression, the same direction and the same code answer the mathematically
      // sensible result instead.
      expect(
        service.roundValue(PINNED_VALUE_QUANTIZED, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).toBe('11.99');

      // Any value whose cents end in zero takes the corrupted branch, so this is
      // not a single unlucky row.
      expect(
        service.roundValue(toDecimalString('8.20'), EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).toBe('8.99');
      expect(
        service.roundValue(toDecimalString('8.25'), EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).toBe('7.99');
    });

    it('7. collapses a short input: 7.42 by 9.99 Closest becomes 9.99, an increase', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: when the input
      // numeral is no longer than the expression, BOTH candidates are set to the expression
      // itself, so the expression is returned outright however far it sits from the input.
      // Preserved deliberately; do not fix without a product decision.
      //
      // len('7.42') is 4 and len('9.99') is 4, so `len(inputValue) > len(rr)` is
      // FALSE and the collapse branch runs. Both candidates are '9.99', both
      // deltas are 2.57, and option one wins the tie under M4 - so the answer is
      // 2.57 ABOVE the value that was handed in.
      const shortValue = toDecimalString('7.42');

      const rounded = service.roundValue(shortValue, '9.99', DIRECTION_CLOSEST);

      expect(rounded).toBe('9.99');

      // The gate that selects the collapse branch is a STRING-LENGTH comparison,
      // never a value comparison.
      expect(shortValue).toHaveLength(4);
      expect('9.99').toHaveLength(4);

      // Both candidates are identical, so their deltas are equal and the tie rule
      // is what decides. `<=` in place of M4's strict `<` would be unobservable
      // here and observable elsewhere, which is why the rule is pinned rather
      // than assumed.
      expect(equals(absoluteDelta(shortValue, '9.99'), absoluteDelta(shortValue, '9.99'))).toBe(
        true,
      );
      expect(isGreaterThan(rounded, shortValue)).toBe(true);
    });

    it('8. collapses a short input the other way: 2.30 by 0.99 Closest becomes 0.99', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: the same collapse,
      // in the opposite direction - a substantial reduction rather than an increase, from a
      // rule a merchant would read as "round up to .99".
      // Preserved deliberately; do not fix without a product decision.
      //
      // len('2.30') is 4 and len('0.99') is 4, so the collapse branch runs again
      // and both candidates are '0.99'.
      const shortValue = toDecimalString('2.30');

      const rounded = service.roundValue(shortValue, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('0.99');
      expect(isLessThan(rounded, shortValue)).toBe(true);

      // Note what is NOT happening: the trailing zero is irrelevant on this row,
      // because the collapse branch never computes an intermediate at all. The
      // same input with a THREE-character expression takes the main branch and
      // answers differently.
      expect(service.roundValue(shortValue, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST)).toBe(
        '2.99',
      );
    });

    it('9. tolerates a NEGATIVE lower candidate: 0.42 by .99 Closest becomes 0.99', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101]: the lower intermediate
      // may go negative, and the resulting candidate numeral keeps its sign - so a signed
      // string is spliced and compared rather than rejected or clamped.
      // Preserved deliberately; do not fix without a product decision.
      //
      // inputValue '0.42' (len 4); rr '.99' (len 3), rrPower 1.
      //   opt1 = left('0.42', 1) & '.99' = '0.99'
      //   '0.99' > '0.42'? YES -> lower = 0.42 - 1 = -0.58 (len 5)
      //   opt2 = left('-0.58', 5-3=2) & '.99' = '-0' & '.99' = '-0.99'
      //   deltas 0.57 and 1.41 -> option one wins.
      const smallValue = toDecimalString('0.42');

      // The negative candidate is tolerated: the call completes rather than
      // raising, which is the property this row exists to pin.
      expect(() =>
        service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST),
      ).not.toThrow();

      const rounded = service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST);

      expect(rounded).toBe('0.99');

      // The intermediate really is negative, and its stringified length really is
      // 5 - the sign occupies a character, which is what makes the slice land
      // where it does.
      expect(cfNumberToString('-0.58')).toBe('-0.58');
      expect(cfNumberToString('-0.58')).toHaveLength(5);

      // And the signed candidate loses on distance rather than being filtered.
      expect(
        isLessThan(absoluteDelta(smallValue, '0.99'), absoluteDelta(smallValue, '-0.99')),
      ).toBe(true);

      // ★ AND IT CAN WIN. Under `Down` the positive candidate fails the gate and
      // the signed one is the only qualifier, so the same rule that reads as
      // "round to the nearest .99" answers a NEGATIVE numeral for a small value.
      // Reproduced as written, because a clamp here would move money.
      expect(service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_DOWN)).toBe('-0.99');
      expect(service.roundValue(smallValue, EXPRESSION_LEADING_DOT, DIRECTION_UP)).toBe('0.99');
    });

    it('10. applies the DEFAULT expression when the argument is omitted, and it is not inert', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: `roundingExpression`
      // defaults to "0.00", which reads as a no-op and is not one - it turns 12.3456 into
      // 10.00, a substantial reduction for a caller that simply did not pass the argument.
      // Preserved deliberately; do not fix without a product decision.
      //
      // rr '0.00' (len 4), rrPower 10.
      //   opt1 = left('12.35', 1) & '0.00' = '10.00'
      //   '10.00' > '12.35'? NO -> higher = 22.35 -> opt2 = '20.00'
      //   deltas 2.35 and 7.65 -> option one wins.
      //
      // ⚠️ The argument is GENUINELY OMITTED here rather than passed as undefined,
      // so the declared default is what supplies it. That is also how the danger
      // arrives in production: no legacy CALL SITE defaults it - [L81] and [L85]
      // both pass an expression - but a SwRoundingRule row whose expression column
      // is null becomes a defaulted argument on the entity path.
      const rounded = service.roundValue(PINNED_VALUE);

      expect(rounded).toBe('10.00');

      // The direction default is exercised by the same omission: `Closest` is what
      // [L88] declares, and the answer above is the Closest answer.
      expect(service.roundValue(PINNED_VALUE, '0.00', DIRECTION_CLOSEST)).toBe('10.00');
    });

    it('10b. treats an explicitly passed 0.00 identically, so the default is not special-cased', () => {
      // The companion to row 10. If the default were handled by a distinct branch
      // rather than by simply supplying the string, these two would be able to
      // disagree - so both are asserted, and they are asserted to be equal to
      // each other as well as to the measured answer.
      const omitted = service.roundValue(PINNED_VALUE);
      const explicit = service.roundValue(PINNED_VALUE, '0.00', DIRECTION_CLOSEST);

      expect(explicit).toBe('10.00');
      expect(explicit).toBe(omitted);
    });

    it('reproduces every row of the shared measured table, which still holds exactly ten', () => {
      // The shared table lives in `tests/fixtures/priceGroupFixtures.ts` and is
      // used rather than restated. Walking it here is what keeps the ten
      // hand-derived cases above and the shared data in agreement: if either
      // moves, this case fails.
      //
      // `noUncheckedIndexedAccess` is enabled, so the rows are NARROWED by
      // iteration rather than indexed with a postfix assertion.
      expect(graph.roundValueCases).toHaveLength(10);

      for (const measured of graph.roundValueCases) {
        const rounded = service.roundValue(
          measured.input,
          measured.roundingExpression,
          measured.roundingDirection,
        );

        expect(rounded).toBe(measured.expected);
      }

      // The table is data, not behaviour, so its own shape is pinned too: every
      // row is a decimal string on both sides.
      for (const measured of graph.roundValueCases) {
        expect(typeof measured.input).toBe('string');
        expect(typeof measured.expected).toBe('string');
      }
    });
  });

  // -------------------------------------------------------------------------
  // The remaining reachable branches of `roundValue`. Each one is a live
  // production state rather than a defensive path, and each returns the
  // quantized input rather than a zero or a substituted default.
  // -------------------------------------------------------------------------

  describe('roundValue - the branches that select no candidate', () => {
    it('11. returns the quantized input for a direction outside the vocabulary', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L132]: the roundingDirection switch
      // has cases for Closest, Up and Down only and no default branch, so an unrecognised
      // direction silently returns the two-decimal-quantized input instead of rounding or throwing.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The candidates are still built and their deltas still computed - the
      // switch simply matches nothing, so neither accumulator is ever assigned and
      // the tail [L170-L174] hands back `inputValue`.
      //
      // The direction string is taken from the shared fixture rather than restated,
      // because the fixture already carries the out-of-vocabulary value its own
      // rule is built with.
      const rounded = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_DOT,
        graph.outOfVocabularyRoundingRuleDirection,
      );

      expect(rounded).toBe(PINNED_VALUE_QUANTIZED);
      expect(rounded).toBe('12.35');

      // It is a REACHABLE live state, not a defensive branch: the column carries no
      // enumeration constraint, so a row can hold anything. The vocabulary the
      // entity publishes is advisory only.
      expect(graph.roundingRuleDirectionVocabulary).toStrictEqual([
        DIRECTION_CLOSEST,
        DIRECTION_UP,
        DIRECTION_DOWN,
      ]);
      expect(graph.roundingRuleDirectionVocabulary).not.toContain(
        graph.outOfVocabularyRoundingRuleDirection,
      );

      // Case matters, and that is worth pinning because CFML `switch` on a string
      // is case-INSENSITIVE while the ported dispatch is not. A lower-case spelling
      // therefore takes this same pass-through branch.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, 'closest')).toBe(
        PINNED_VALUE_QUANTIZED,
      );

      // JUDGMENT CALL: that difference is recorded rather than corrected. The
      // legacy data is written by the admin form-field metadata, which supplies the
      // three capitalised spellings [model/entity/RoundingRule.cfc:L70-L76], so a
      // differently-cased row is not a state the legacy application produces - and
      // normalising the case here would silently ROUND rows that today pass
      // through untouched, which would move money. This suite pins the shipped
      // behaviour; changing it needs a product decision, not a test edit.
    });

    it('11b. returns the quantized input when a direction gate admits no candidate', () => {
      // The third route to the same tail, and it needs no defect at all: with both
      // candidates BELOW the input, `Up` qualifies neither [L145, L149], so nothing
      // is assigned.
      //
      // inputValue '12.35'; rr '0.99' (len 4), rrPower 10.
      //   opt1 '10.99' - below the input
      //   opt2 '20.99' - above it, and it DOES qualify, so `Up` answers '20.99'
      // To get a case where nothing qualifies, take `Down` on the row where both
      // candidates sit above: input '0.42' with '9.99' collapses to '9.99' twice.
      expect(service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_ZERO, DIRECTION_UP)).toBe('20.99');

      const smallValue = toDecimalString('0.42');

      expect(service.roundValue(smallValue, '9.99', DIRECTION_DOWN)).toBe('0.42');

      // Both collapse candidates are the expression itself and both sit above the
      // input, so the `Down` gate rejects each of them and the input falls out
      // untouched - a pass-through, never a zero.
      expect(isGreaterThan('9.99', smallValue)).toBe(true);
    });

    it('11c. returns the quantized input for an empty expression list, without raising', () => {
      // `listLen('')` is 0, so the candidate loop never executes and the tail
      // returns the input. This is the shape a query-resolved rule with a NULL
      // expression column takes - see the two-path asymmetry pinned further down -
      // and it is the SAFE outcome of the two.
      expect(service.roundValue(PINNED_VALUE, '', DIRECTION_CLOSEST)).toBe(PINNED_VALUE_QUANTIZED);

      // CFML list semantics: consecutive delimiters collapse and contribute no
      // element, so a list of nothing but delimiters is also empty.
      expect(service.roundValue(PINNED_VALUE, ',,', DIRECTION_CLOSEST)).toBe(
        PINNED_VALUE_QUANTIZED,
      );
    });

    it('12. returns immediately when a candidate already equals the input (L120)', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L120-L121]:
      //   if(valueOptionOne == inputValue || valueOptionTwo == inputValue) {
      //     return inputValue;
      //   }
      //
      // The value handed in is '12.990', which M1 quantizes to '12.99'. Option one
      // is then left('12.99', 2) & '.99' = '12.99', which EQUALS the input, so the
      // method returns straight away - abandoning any remaining expressions in the
      // comma list and discarding whatever the accumulators held.
      const alreadyOnTheExpression = toDecimalString('12.990');

      const rounded = service.roundValue(
        alreadyOnTheExpression,
        EXPRESSION_LEADING_DOT,
        DIRECTION_CLOSEST,
      );

      // ⚠️ COMPARED BY DECIMAL VALUE, NOT BY STRING IDENTITY (M5). The returned
      // numeral is the QUANTIZED form, so it is not character-for-character the
      // numeral that was handed in - and asserting string identity would be the
      // wrong question, because CFML's `==` on two numeric-looking strings compares
      // numerically. `cfNumericEquals` exists for exactly this.
      expect(cfNumericEquals(rounded, alreadyOnTheExpression)).toBe(true);
      expect(rounded).not.toBe(alreadyOnTheExpression);
      expect(rounded).toBe('12.99');

      // The short-circuit really does abandon the rest of the list: a second
      // expression that would otherwise have won is never consulted.
      expect(service.roundValue(alreadyOnTheExpression, '.99,.95', DIRECTION_CLOSEST)).toBe(
        '12.99',
      );

      // And it fires from the SECOND candidate as well as the first, which is what
      // the `||` at [L120] provides.
      expect(
        service.roundValue(toDecimalString('13.99'), EXPRESSION_LEADING_DOT, DIRECTION_UP),
      ).toBe('13.99');
    });

    it('accepts an unvalidated two-character expression and steps by less than a cent', () => {
      // LEGACY-NOTE [model/entity/RoundingRule.cfc:L54]: `roundingRuleExpression` is bare
      // `ormtype="string"` with no length and no format constraint, and the declarative rule
      // that guards it - `hasExpressionWithListOfNumericValuesOnly`
      // [model/entity/RoundingRule.cfc:L78-L86] - ACCEPTS `'99'`, because `find('.', '99')` is
      // 0 and `len('99') - 0` is 2.
      // No validation is added here. The step size becomes `10 ^ (2-3)` = 0.1, which is
      // smaller than one cent, and the shipped service produces that faithfully rather
      // than rejecting the row. This is Finding E, and it is pinned rather than repaired.
      //
      // The row is taken from the shared expression table rather than restated, and
      // `noUncheckedIndexedAccess` is enabled, so it is NARROWED by search instead
      // of being indexed with a postfix assertion.
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

      // The predicate accepts it, and the derived step is fractional - the two facts
      // that together make it a hole rather than merely an odd value.
      expect(holeRow.accepted).toBe(true);

      const derivedPower = holeRow.derivedPowerPerElement;

      expect(derivedPower).toHaveLength(1);

      for (const power of derivedPower) {
        expect(power).toBe('0.1');
        expect(isLessThan(power, '1')).toBe(true);
      }

      // inputValue '12.35' (len 5); rr '99' (len 2), rrPower 0.1.
      //   opt1 = left('12.35', 5-2=3) & '99' = '12.' & '99' = '12.99'
      //   '12.99' > '12.35'? YES -> lower = 12.35 - 0.1 = 12.25
      //   opt2 = left('12.25', 3) & '99' = '12.99' as well
      //   both candidates are identical, so option one wins the tie under M4.
      expect(service.roundValue(PINNED_VALUE, holeRow.expression, DIRECTION_CLOSEST)).toBe('12.99');

      // The splice lands mid-numeral, keeping the decimal point from the input
      // rather than from the expression - which is why a point-free expression can
      // still yield a two-decimal answer.
      expect(service.roundValue(PINNED_VALUE, holeRow.expression, DIRECTION_UP)).toBe('12.99');
    });
  });

  // -------------------------------------------------------------------------
  // The declared/actual return-type mismatch, resolved by TYPING rather than by
  // changing behaviour.
  // -------------------------------------------------------------------------

  describe('roundValue - the branded decimal-string return', () => {
    it('answers a branded decimal numeral, which its two callers declare as numeric', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: roundValue declares
      // returntype="string" while both of its callers (L79, L84) declare numeric, and
      // PriceGroupService feeds the result straight into precisionEvaluate.
      // Preserved deliberately; do not fix without a product decision.
      //
      // CFML coerced silently across that boundary. Here the string is BRANDED, so
      // every crossing back to a monetary value is an explicit named call - which is
      // what the two `roundValueBy...` cases below assert.
      //
      // The annotation is the assertion: this compiles with no cast, no assertion
      // operator and no widening, which is the compile-time proof that the shipped
      // return type really is the branded numeral.
      const branded: DecimalString = service.roundValue(
        PINNED_VALUE,
        EXPRESSION_LEADING_ZERO,
        DIRECTION_CLOSEST,
      );

      expect(typeof branded).toBe('string');
      expect(branded).toBe('10.99');

      // A branded numeral is still a plain string at run time, so it presents and
      // compares like one - the brand costs nothing observable.
      expect(branded.length).toBe(5);
      expect(cfNumericEquals(branded, '10.99')).toBe(true);
    });

    it('does not accept an unbranded string in its place - a deliberate type failure', () => {
      // The only escape hatch in this file, and it exists to assert that the brand
      // is load-bearing rather than decorative: a bare literal must NOT be usable
      // where the branded numeral is required, because that is what forces callers
      // through `toDecimalString` and keeps an unvalidated string out of a money
      // path. If the brand were ever removed, the directive below would become
      // unused and this case would fail - which is the signal that matters.
      // @ts-expect-error a plain string literal is not assignable to DecimalString.
      const unbranded: DecimalString = '10.99';

      expect(unbranded).toBe('10.99');
    });

    it('takes Money as readily as a branded numeral, and never a number', () => {
      // The shipped parameter is `Money | DecimalString`, and a `number` is
      // deliberately absent from it: an IEEE-754 double is how drift enters a money
      // path, which is why `Money` publishes no numeric factory either.
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

      // A `Money` carrying more precision than two decimals is quantized by M1 in
      // exactly the same way, so the two input forms cannot diverge.
      expect(
        service.roundValue(
          Money.fromDecimalString('12.3499999'),
          EXPRESSION_LEADING_DOT,
          DIRECTION_CLOSEST,
        ),
      ).toBe('11.99');
    });
  });

  // -------------------------------------------------------------------------
  // `roundValueByRoundingRule` - the method both must-preserve money paths reach.
  // Synchronous, and it must stay that way.
  // -------------------------------------------------------------------------

  describe('roundValueByRoundingRule', () => {
    it('is synchronous and answers Money for Money, converting explicitly', () => {
      // Legacy [model/service/RoundingRuleService.cfc:L84-L86]: the body reads two
      // already-materialised fields off the entity it was handed and delegates. It
      // performs no DAO access and no ORM access, so there is nothing to await -
      // and both live call sites consume the result immediately, one inside a
      // `switch` [model/service/PriceGroupService.cfc:L327] and one by subtracting
      // from it on the next line [model/service/PromotionService.cfc:L1007].
      //
      // CALLED WITHOUT `await`, deliberately. The async boundary is a contract: a
      // method is async if and only if its legacy body reached the DAO or the ORM.
      const rounded = service.roundValueByRoundingRule(
        Money.fromDecimalString('12.3456'),
        graph.closestRoundingRule,
      );

      expect(rounded).toBeInstanceOf(Money);

      // The value agrees with `roundValue` for the same expression and direction,
      // which is the whole of the legacy body.
      const asNumeral = service.roundValue(PINNED_VALUE, EXPRESSION_LEADING_DOT, DIRECTION_CLOSEST);

      expect(asNumeral).toBe('11.99');
      expect(rounded.equals(Money.fromDecimalString(asNumeral))).toBe(true);
      expect(rounded.toFixed2()).toBe('11.99');

      // ⚠️ THE CONVERSION IS EXPLICIT. `roundValue` answers a decimal STRING and
      // this method answers `Money`; CFML coerced between the two silently at this
      // boundary [L84 declares numeric over the string at L88]. Here the two forms
      // are observably different kinds of thing, and only a named factory call
      // crosses between them.
      expect(typeof asNumeral).toBe('string');
      expect(typeof rounded).toBe('object');
    });

    it('reads the expression and direction off the rule it is handed', () => {
      const value = Money.fromDecimalString('12.3456');

      // The three in-vocabulary rules from the shared graph, all carrying '.99' and
      // differing only in direction - so the answers can differ only because the
      // direction was read off the entity.
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

      // It consults the repository for none of this: the entity already holds both
      // fields, so no lookup may occur.
      expect(repository.lookups).toStrictEqual([]);
    });

    it('passes a rule with an out-of-vocabulary direction through untouched', () => {
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L132]: the roundingDirection
      // switch has cases for Closest, Up and Down only and no default branch, so an
      // unrecognised direction silently returns the two-decimal-quantized input instead of
      // rounding or throwing.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Reached here through a real rule rather than a bare argument, which is how
      // the state actually arrives: the column carries no enumeration constraint.
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
      // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: `roundingExpression`
      // defaults to "0.00", and a rule whose expression column is NULL therefore does not
      // pass the value through - it reshapes it, turning 12.3456 into 10.00.
      // Preserved deliberately; do not fix without a product decision.
      //
      // ⚠️ AND THIS IS THE PATH WHERE THAT HAPPENS. The entity accessor reports a
      // null column as absent, the absent argument reaches the declared default, and
      // CFML did exactly the same thing with a null named argument. Converting the
      // accessor's absence to `''` here would SUPPRESS the default and silently
      // change the arithmetic - see the asymmetry pinned under
      // `roundValueByRoundingRuleID`.
      expect(graph.absentExpressionRoundingRule.getRoundingRuleExpression()).toBeUndefined();

      const rounded = service.roundValueByRoundingRule(
        Money.fromDecimalString('12.3456'),
        graph.absentExpressionRoundingRule,
      );

      expect(rounded.toFixed2()).toBe('10.00');

      // A rule that writes '0.00' out explicitly answers identically, so the
      // default is supplied rather than special-cased.
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
      // The rule built here injects a rounder that RAISES if reached
      // [model/entity/RoundingRule.cfc:L66-L68], so this case proves the boundary
      // rather than merely declaring it: the service reads the entity's two fields
      // and does the arithmetic itself.
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

  // -------------------------------------------------------------------------
  // `roundValueByRoundingRuleID` - the one entry point that crosses the DAO
  // boundary, and therefore the one that is async.
  // -------------------------------------------------------------------------

  describe('roundValueByRoundingRuleID', () => {
    it('resolves the rule through the port and then rounds, awaited', async () => {
      // Legacy [model/service/RoundingRuleService.cfc:L79-L82]: read the details
      // [L80], delegate to `roundValue` with the two resolved arguments [L81].
      //
      // ASYNC BECAUSE THE RESOLUTION REACHES THE DAO, so the call is awaited. Its
      // one live call site is [model/service/PromotionService.cfc:L1026], inside
      // `getSalePriceDetailsForProductSkus` [L1022] under the guard at [L1025].
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

      // The answer is the same one the rule-carrying entry point gives for the same
      // rule, because both delegate to the same `roundValue`.
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

      // Both answers are the same, and the second one came from the record this
      // request had already resolved. This is a CORRECTNESS statement about what a
      // second resolution answers - nothing here measures or claims anything else.
      expect(first.toFixed2()).toBe('11.99');
      expect(second.toFixed2()).toBe('11.99');
      expect(repository.lookups).toHaveLength(1);
    });

    it('raises when no rule carries the identifier, rather than substituting a default', async () => {
      // The port answers `undefined` for an unknown identifier. The legacy query in
      // that case yields ZERO ROWS and [L73-L74] then read columns off an empty
      // result, which CFML refuses at run time - so an absent rule is an error in
      // the source and it is an error here.
      //
      // ⚠️ NOTHING IS SUBSTITUTED FOR IT, and above all not a zero: in a price path
      // a zero would sell product for free.
      await expect(
        service.roundValueByRoundingRuleID(Money.fromDecimalString('12.3456'), 'no-such-rule'),
      ).rejects.toThrow(/No rounding rule carries the identifier/);

      expect(repository.lookups).toStrictEqual([{ roundingRuleID: 'no-such-rule' }]);
    });

    it('★ answers DIFFERENTLY from the entity path for one and the same rule', async () => {
      // ⚠️ THE SUBTLEST BEHAVIOUR IN THE SERVICE, AND BOTH HALVES ARE LOAD-BEARING.
      // A rule whose expression column is NULL reaches `roundValue` in two
      // different forms, and each form is the faithful one for its own path:
      //
      //   * THE QUERY PATH. A CFML query renders SQL NULL as the EMPTY STRING, so
      //     the legacy memo stored '' and `listLen('')` is 0 - the loop never runs
      //     and the input passes through unchanged.
      //   * THE ENTITY PATH. CFML applies a DECLARED DEFAULT when a named argument
      //     arrives null, so the expression becomes '0.00' and Finding B fires.
      //
      // Converting either path to the other's form would silently move money in one
      // direction or the other, so the divergence is pinned here in a single case
      // where both halves are visible at once.
      const absentExpressionRule = graph.absentExpressionRoundingRule;
      const value = Money.fromDecimalString('12.3456');

      const viaQueryRepository = new RecordingPromotionRepository(() => absentExpressionRule);
      const viaQueryService = new RoundingRuleService(viaQueryRepository);

      // Both halves are asserted against the SAME rule instance and the SAME
      // service, so nothing about the data or the wiring can explain the
      // difference. The entity half is called WITHOUT `await` and the query half
      // WITH it, which is the async boundary the two signatures declare.
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

  // -------------------------------------------------------------------------
  // `getRoundingRuleDetailsByID` - ZERO external callers, covered anyway.
  // -------------------------------------------------------------------------

  describe('getRoundingRuleDetailsByID', () => {
    // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L67]: this method has ZERO
    // callers outside the component - its only other occurrence in the legacy tree is
    // its own use at [L80], which makes it effectively a private memo helper.
    // It stays public because it is public in the source and interface parity is the
    // acceptance contract, and it is covered because every converted method needs a
    // test. It consumes none of the visibility-widening budget: it is carried across
    // at the visibility it already had, not widened.

    it('answers exactly the two keys the legacy memo stored, and nothing else', async () => {
      const details: RoundingRuleDetails = await service.getRoundingRuleDetailsByID(
        graph.closestRoundingRule.getRoundingRuleID(),
      );

      // CFML parity [model/service/RoundingRuleService.cfc:L72-L74]: an empty struct
      // is created and exactly two keys are written into it. `toStrictEqual` is used
      // rather than a per-key check precisely so that a third key FAILS - no
      // identifier, no timestamp, no name, no parsed form of the expression.
      expect(details).toStrictEqual({
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });
      expect(Object.keys(details)).toStrictEqual([
        'roundingRuleExpression',
        'roundingRuleDirection',
      ]);

      // JUDGMENT CALL pinned: the shipped result is FROZEN, where the legacy body
      // returned the live struct at [L76] and a caller could in principle have
      // mutated the memo through it. Unobservable through the public contract - the
      // sole legacy call site reads two keys and discards it - and it makes the memo
      // uncorruptable from outside.
      expect(Object.isFrozen(details)).toBe(true);
    });

    it('renders an absent column as the empty string, matching a CFML query column', async () => {
      // CFML parity [model/service/RoundingRuleService.cfc:L73-L74]: the legacy body
      // reads these two values off a QUERY, and a CFML query renders SQL NULL as the
      // empty string. The port hands back a hydrated entity whose accessors report a
      // null column as absent, so this path converts back to the query-column form.
      // That is parity, not an invented default - and its outcome is the safe one, a
      // pass-through rather than a defaulted rounding.
      const absentColumnsRule = buildRoundingRule({
        roundingRuleID: 'rule-with-null-columns',
        roundingRuleExpression: undefined,
        roundingRuleDirection: undefined,
      });
      const nullColumnRepository = new RecordingPromotionRepository(() => absentColumnsRule);
      const nullColumnService = new RoundingRuleService(nullColumnRepository);

      const details = await nullColumnService.getRoundingRuleDetailsByID('rule-with-null-columns');

      expect(details).toStrictEqual({
        roundingRuleExpression: '',
        roundingRuleDirection: '',
      });

      // And an empty expression rounds nothing, which is why this form is the safe
      // one: `listLen('')` is 0.
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

      // ONE resolution for two identical lookups. The framing is correctness: the
      // second lookup answers the values this request already resolved, and it
      // answers the SAME object because the record holds one frozen result.
      expect(repository.lookups).toHaveLength(1);
      expect(second).toStrictEqual(first);
      expect(second).toBe(first);

      // A DIFFERENT identifier is not answered from the record - the guard is keyed,
      // not global - so it resolves on its own and, here, fails as an absent rule.
      await expect(service.getRoundingRuleDetailsByID('another-rule')).rejects.toThrow(
        /No rounding rule carries the identifier/,
      );
      expect(repository.lookups).toHaveLength(2);
    });

    it('★ keeps its record private to the instance, so two services cannot observe each other', async () => {
      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L53]: the legacy memo is
      // component-level state, which on a warm container would leak across unrelated
      // requests.
      // The target scopes it to the instance; this test proves two independent instances are
      // isolated. The legacy comment at [L66] frames the struct as a non-functional
      // concern, and that framing is deliberately NOT carried forward: what is
      // asserted below is WHICH VALUES each instance answers, which is a correctness
      // and request-scoping property and nothing else.
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      // One shared port that answers a DIFFERENT rule on its second resolution. If
      // the record were module-level, the second instance would answer the first
      // instance's stored values and this case could not tell the two apart.
      let resolutionCount = 0;
      const alternatingRepository = new RecordingPromotionRepository(() => {
        resolutionCount += 1;

        return resolutionCount === 1 ? graph.closestRoundingRule : graph.roundUpRoundingRule;
      });

      const firstService = new RoundingRuleService(alternatingRepository);
      const secondService = new RoundingRuleService(alternatingRepository);

      const firstDetails = await firstService.getRoundingRuleDetailsByID(identifier);

      expect(firstDetails.roundingRuleDirection).toBe(DIRECTION_CLOSEST);

      // The second instance resolves for ITSELF rather than reading what the first
      // one recorded, so it observes the port's new answer.
      const secondDetails = await secondService.getRoundingRuleDetailsByID(identifier);

      expect(secondDetails.roundingRuleDirection).toBe(DIRECTION_UP);
      expect(secondDetails).not.toStrictEqual(firstDetails);
      expect(alternatingRepository.lookups).toHaveLength(2);

      // And the first instance is unaffected in the other direction too: it still
      // answers its own recorded values, and it answers the very same frozen object.
      const firstAgain = await firstService.getRoundingRuleDetailsByID(identifier);

      expect(firstAgain).toBe(firstDetails);
      expect(firstAgain.roundingRuleDirection).toBe(DIRECTION_CLOSEST);
      expect(alternatingRepository.lookups).toHaveLength(2);

      // The rounding answers differ accordingly, which is the observable consequence
      // that makes the isolation matter rather than being an implementation detail.
      const value = Money.fromDecimalString('12.3456');

      expect((await firstService.roundValueByRoundingRuleID(value, identifier)).toFixed2()).toBe(
        '11.99',
      );
      expect((await secondService.roundValueByRoundingRuleID(value, identifier)).toFixed2()).toBe(
        '12.99',
      );
    });
  });

  // -------------------------------------------------------------------------
  // `saveRoundingRule` - ZERO callers, covered anyway. Its declared purpose is
  // memo eviction [model/service/RoundingRuleService.cfc:L55].
  // -------------------------------------------------------------------------

  describe('saveRoundingRule', () => {
    // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56]: this method has ZERO
    // callers anywhere in the legacy codebase - it is an admin/framework-only surface
    // reached through the Hibachi save dispatcher rather than from application code.
    // It is covered because every converted method needs a test and because parity is
    // the acceptance contract: a method that exists in the source and not in the
    // target is a missing method however unused it is.
    //
    // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56]: there is NO delete
    // counterpart to this save override, and none is added.
    // The component overrides save to evict but never overrides delete, so a rule
    // deleted mid-request leaves its details resolvable afterwards. That staleness gap
    // is reproduced rather than closed, and nothing below asserts a delete-side
    // invalidation that the legacy design does not have.

    it('answers the rule it was handed, with both optional arguments omitted', async () => {
      // `exactOptionalPropertyTypes` is enabled and the optional arguments are
      // GENUINELY OMITTED here rather than passed as undefined, so the declared
      // default for `context` - `"save"`, exactly as [L56] declares - is what
      // supplies it.
      const saved = await service.saveRoundingRule(graph.closestRoundingRule);

      expect(saved).toBe(graph.closestRoundingRule);

      // Neither argument is read by the ported body: the eviction logic does not
      // consult them, and [L63] passed them straight on. Supplying both therefore
      // changes nothing observable.
      const data: RoundingRuleSaveInput = { roundingRuleName: 'A renamed rule' };

      expect(await service.saveRoundingRule(graph.closestRoundingRule, data, 'save')).toBe(
        graph.closestRoundingRule,
      );
      expect(await service.saveRoundingRule(graph.closestRoundingRule, data, 'anyContext')).toBe(
        graph.closestRoundingRule,
      );

      // The payload is handed on untouched - no key added, none rewritten.
      expect(data).toStrictEqual({ roundingRuleName: 'A renamed rule' });

      // NO REPOSITORY CALL OF ANY KIND is issued: saving reads nothing back, and it
      // writes nothing either. `lookups` is the only thing the double can record,
      // because a lookup is the only thing the port lets this service do.
      expect(repository.lookups).toStrictEqual([]);
    });

    it('★★ does NOT persist the rule, and the omission is the documented contract', async () => {
      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L63]: the legacy body ends in
      // `return super.save(argumentcollection=arguments)` - framework-inherited generic
      // CRUD from `HibachiService`, with the statement generated by Hibernate from the
      // entity's persistent-property metadata rather than written in the legacy source.
      // Generic inherited CRUD is out of scope for this slice and this override has ZERO
      // legacy callers, so the durable write is NOT ported, and no port in the slice
      // declares a rounding-rule write: `PromotionRepository` is seven reads.
      //
      // ★ FOR ONE REVISION IT WAS PORTED, AND THESE CASES ASSERTED IT. Three cases stood
      // here - "persists the rule through the port exactly once", "evicts BEFORE it
      // writes, so a failed write leaves the record cold" and "propagates a write failure
      // rather than swallowing it into the returned rule" - driven by a `saveFailure`
      // field on the double and an eighth method on the port. All of it has been withdrawn.
      //
      // The objection that motivated the write was that "a save that evicted a cache entry
      // and persisted nothing while still handing back a rule that looked saved" is a
      // silent failure. That objection is sound, and the answer to it is THIS CASE plus the
      // `LEGACY-NOTE` at the statement it replaces: the omission is stated, marked and
      // asserted, so it is not silent. What it is not is invented.
      //
      // The gate is expressed as a type-level exhaustion rather than by asking the double
      // whether it recorded a write, because the drift to guard against is a write
      // REAPPEARING on the port - and a double that has no `saves` array cannot answer a
      // question about one.
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

      // And the method still ANSWERS, because AAP 0.4.2 specifies the signature and the
      // eviction is a real effect. What it does not do is reach the database.
      const saved = await service.saveRoundingRule(graph.closestRoundingRule);

      expect(saved).toBe(graph.closestRoundingRule);
      expect(repository.lookups).toStrictEqual([]);
    });

    it('evicts the recorded details for a saved rule, so the next resolution reaches the port', async () => {
      // Legacy [model/service/RoundingRuleService.cfc:L55-L61]: the whole reason the
      // default save is overridden. The eviction is genuinely observable within a
      // single request - resolve, save, resolve again - which is why it is
      // implemented rather than stubbed even though a request-scoped record dies
      // with the request anyway.
      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toHaveLength(1);

      await service.saveRoundingRule(graph.closestRoundingRule);

      // The eviction is the WHOLE observable effect of the method, which is exactly what
      // [model/service/RoundingRuleService.cfc:L55] says the override is for. The record no
      // longer answers, so the next resolution goes to the port.
      await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toStrictEqual([
        { roundingRuleID: identifier },
        { roundingRuleID: identifier },
      ]);
    });

    it('evicts only the saved rule, leaving other recorded identifiers alone', async () => {
      // `structDelete` [L59] removes ONE key, keyed by the saved entity's own
      // identifier [L58] - it does not clear the whole struct. A service that
      // discarded everything would pass the previous case and fail this one.
      const closestIdentifier = graph.closestRoundingRule.getRoundingRuleID();
      const upIdentifier = graph.roundUpRoundingRule.getRoundingRuleID();

      const twoRuleRepository = new RecordingPromotionRepository((roundingRuleID) =>
        roundingRuleID === closestIdentifier
          ? graph.closestRoundingRule
          : graph.roundUpRoundingRule,
      );
      const twoRuleService = new RoundingRuleService(twoRuleRepository);

      await twoRuleService.getRoundingRuleDetailsByID(closestIdentifier);
      await twoRuleService.getRoundingRuleDetailsByID(upIdentifier);

      expect(twoRuleRepository.lookups).toHaveLength(2);

      await twoRuleService.saveRoundingRule(graph.closestRoundingRule);

      // The other identifier still answers from the record: one more resolution for
      // the evicted rule, none for the untouched one.
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
      // Legacy [model/service/RoundingRuleService.cfc:L57]: the `isNew()` gate. It is
      // redundant against the inner key test - a rule that has never been saved
      // carries an empty identifier [model/entity/RoundingRule.cfc:L52], which no
      // record entry can be keyed by - so it can never change the outcome. It is
      // reproduced because it is there, and this case pins that redundancy rather
      // than assuming it.
      const unsavedRule = buildRoundingRule({
        roundingRuleID: '',
        roundingRuleExpression: EXPRESSION_LEADING_DOT,
        roundingRuleDirection: DIRECTION_CLOSEST,
      });

      expect(unsavedRule.isNew()).toBe(true);

      const identifier = graph.closestRoundingRule.getRoundingRuleID();

      await service.getRoundingRuleDetailsByID(identifier);
      expect(repository.lookups).toHaveLength(1);

      expect(await service.saveRoundingRule(unsavedRule)).toBe(unsavedRule);

      // Nothing was evicted, so the previously recorded identifier still answers.
      await service.getRoundingRuleDetailsByID(identifier);

      expect(repository.lookups).toHaveLength(1);

      // And the rules the shared graph carries are all persisted, which is what
      // makes the eviction cases above exercise the other side of the gate.
      expect(graph.closestRoundingRule.isNew()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // S-13 / S-03: THE SECURE-CONSUMER INVARIANT
  //
  // Every case above characterizes what `roundValue` RETURNS. A security review
  // observed that characterizing unsafe output is not the same as stating what a
  // caller must do about it, and named this suite for having done the first
  // without the second (finding S-13, CWE-693, Protection Mechanism Failure).
  //
  // The gap is real, and it cannot be closed inside the service. AAP 0.6.4
  // measured this algorithm by executing it and published nine verified outputs
  // as the parity contract; AAP 0.9.3 makes those nine a gate and states that a
  // "corrected" implementation producing mathematically tidier answers FAILS it.
  // So the service cannot establish a postcondition - a non-negativity guard here
  // would break parity for every existing consumer at once.
  //
  // What CAN be done, and is done below, is to make the requirement executable:
  // state the three properties `roundValue` does NOT have, prove each with a
  // concrete input, and prove the clamp a safety-critical consumer is obliged to
  // apply. A reader who needs a safe price now learns the obligation from a
  // failing-if-removed test rather than from prose, and a future edit that
  // accidentally makes the service safe will break the parity gate loudly instead
  // of drifting.
  // -------------------------------------------------------------------------

  describe('the secure-consumer invariant', () => {
    /**
     * The clamp a consumer that must not inherit this behaviour has to apply.
     *
     * Deliberately defined in the TEST rather than exported from the service: it
     * is the CALLER'S obligation, and putting it in `src/` would be the parity
     * break AAP 0.9.3 forbids. Two properties, both of which the raw result can
     * violate: a price is never negative, and a discount never exceeds the amount
     * it discounts.
     */
    /**
     * Lift a decimal string into the arbitrary-precision domain.
     *
     * `add(value, '0')` rather than a `Decimal` constructor, because
     * `src/lib/cfml/precision.ts` is the only sanctioned door onto the decimal
     * substrate in this project and it exposes no lift of its own - every export
     * takes `PreciseInput`, which a string already satisfies. Adding zero is exact
     * and preserves scale, so the lift changes nothing about the value.
     */
    function lift(value: string): PreciseValue {
      return add(value, ZERO_DECIMAL);
    }

    function clampToChargeableRange(rounded: string, original: string): PreciseValue {
      const roundedValue = lift(rounded);
      const originalValue = lift(original);

      if (isLessThan(roundedValue, ZERO_DECIMAL)) {
        return lift(ZERO_DECIMAL);
      }
      return isGreaterThan(roundedValue, originalValue) ? originalValue : roundedValue;
    }

    it('does not guarantee a result at or below its input, and 7.42 by 9.99 proves it', () => {
      // AAP 0.6.4 verified case 7. A price INCREASE of 2.57 - the opposite
      // direction from the one the word "discount" implies, reached through the
      // short-input collapse of Finding C where both candidates become the
      // expression itself.
      const original = toDecimalString('7.42');

      const rounded = service.roundValue(original, '9.99', DIRECTION_CLOSEST);

      expect(rounded).toBe('9.99');
      expect(isGreaterThan(rounded, original)).toBe(true);
      // A consumer that clamps gets the original back; one that does not overcharges.
      expect(equals(clampToChargeableRange(rounded, original), original)).toBe(true);
    });

    it('does not guarantee a non-negative result, and 0.42 by .99 Down proves it', () => {
      // AAP 0.6.4 Finding D: the lower intermediate is 0.42 - 1 = -0.58, and the
      // candidate composed from it is the negative string. This is the exact input
      // the security review used to demonstrate a negative net price, so it is
      // pinned here at the source of the negativity rather than downstream.
      const original = toDecimalString('0.42');

      const rounded = service.roundValue(original, EXPRESSION_LEADING_DOT, DIRECTION_DOWN);

      expect(isLessThan(rounded, ZERO_DECIMAL)).toBe(true);
      // A consumer that clamps charges zero rather than paying the customer.
      expect(equals(clampToChargeableRange(rounded, original), ZERO_DECIMAL)).toBe(true);
    });

    it('does not guarantee a bounded proportional move, and 2.30 by 0.99 proves it', () => {
      // AAP 0.6.4 verified case 8: a 57% price cut from a rule that reads like a
      // rounding nicety. Bounding the MAGNITUDE of the move is therefore also the
      // consumer's problem, not just bounding the sign.
      const original = toDecimalString('2.30');

      const rounded = service.roundValue(original, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('0.99');
      const moved = absolute(subtract(original, rounded));

      expect(isGreaterThan(moved, '1.00')).toBe(true);
    });

    it('leaves a well-behaved result untouched, so the clamp is a floor and not a rewrite', () => {
      // THE OTHER HALF OF THE OBLIGATION. A clamp that changed ordinary results
      // would be its own defect, so the invariant is asserted in the passing
      // direction too: AAP 0.6.4 verified case 1, which needs no correction.
      const original = PINNED_VALUE;

      const rounded = service.roundValue(original, EXPRESSION_LEADING_ZERO, DIRECTION_CLOSEST);

      expect(rounded).toBe('10.99');
      expect(equals(clampToChargeableRange(rounded, original), rounded)).toBe(true);
    });

    it('records that the port applies no such clamp at either shipped consumer', () => {
      // THE HONEST STATEMENT OF WHERE THE PORT STANDS, asserted rather than
      // described. `roundValueByRoundingRule` is what both shipped consumers reach -
      // the promotion discount path through `discountAmount.ts` and the price-group
      // path through `RoundingRule.roundValue` - and it returns the raw rounded
      // value, unclamped. AAP 0.6.7 defect 14 and AAP 0.9.3 require exactly that, so
      // this case pins the DECLINE as a deliberate, cited position: if a future edit
      // adds a clamp inside the service, this fails and the author is sent to the
      // AAP before the parity gate is broken silently.
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

// --- S-10 resource half: the expression is bounded by SIZE, never by SHAPE -----

describe('rounding-expression resource limits (S-10, resource half)', () => {
  // The exposure: `powerOfTen(rr.length - 3)` renders `'0'.repeat(exponent)`, so the LENGTH of a
  // persisted free-text list member drives a string allocation, and the member COUNT drives how many
  // times. `SwRoundingRule.roundingRuleExpression` is bare `ormtype="string"`
  // [model/entity/RoundingRule.cfc:L54] with no format constraint and no rule in
  // `model/validation/RoundingRule.json`, so the value is attacker-influenceable wherever rule
  // administration is.
  //
  // ★ WHAT THESE CASES DELIBERATELY DO NOT ASSERT. There is no test here that a member must look like
  // a decimal numeral, contain digits, or match any grammar - and that absence is the point, not an
  // omission. AAP 0.6.4 Finding E records the missing validation as MEASURED LEGACY BEHAVIOUR and AAP
  // 0.8.1 Schema Continuity forbids adding a constraint the schema lacks, so the grammar half of
  // S-10 is declined. Only size is bounded. The suite above pins that a `'0.00'` expression still
  // rounds 12.3456 down to 10.00 and that an out-of-vocabulary direction still passes through, both
  // of which a grammar check would have broken.

  let boundedService: RoundingRuleService;

  beforeEach(() => {
    boundedService = new RoundingRuleService(new RecordingPromotionRepository(() => undefined));
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
    // 256 characters. A ceiling that rejected its own stated maximum would be an off-by-one reachable
    // only by the one input nobody constructs by hand.
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

  it('★★ REFUSES IN CONSTANT TIME, which is what makes the guard worth having', () => {
    // Unguarded, a member of this length would make `'0'.repeat(...)` build a string of the same
    // order - the cheapest denial of service in the pricing path, from a single persisted row.
    //
    // ★ THIS CASE CHANGED THE IMPLEMENTATION. A first version of the guard checked only the two
    // MEMBER limits, and it refused this input correctly - but took TWELVE SECONDS to do it, because
    // reaching a member goes through `listLen` and `listGetAt` and those traverse the raw string. The
    // guard was paying the traversal cost in order to refuse the allocation cost, which on a 29-second
    // API Gateway budget is most of the request. Measuring it is the only way that surfaced; the
    // total-length gate that now runs first is derived from the two member limits, so it decides no
    // case they would have decided differently and costs one property read. The timing bound below is
    // the assertion that keeps it first.
    const hostile = '9'.repeat(50_000_000);
    const started = Date.now();

    expect(() => boundedService.roundValue(PINNED_VALUE, hostile, DIRECTION_CLOSEST)).toThrow(
      /at most 65792 characters in total/u,
    );
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('rejects on the derived total only where the member limits could not have applied', () => {
    // The equivalence claim, asserted rather than asserted-in-a-comment: a list at the total ceiling
    // made of in-range members is ACCEPTED, so the total gate is not silently stricter than the two
    // limits it is derived from. 256 members of 255 characters plus 255 delimiters is 65,535 - inside
    // the 65,792 total and inside both member limits.
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
