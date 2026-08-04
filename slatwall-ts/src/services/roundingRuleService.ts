// ---------------------------------------------------------------------------
// slatwall-ts - RoundingRuleService: the decimal-STRING rounding algorithm
//
// WHAT THIS FILE IS
// A 1:1 logic extraction of `model/service/RoundingRuleService.cfc` (204 source
// lines) into strict-mode TypeScript. Nothing is added to the functional surface
// and nothing is removed from it: the five public methods below are the five the
// component declares, carrying their legacy CFML camelCase names VERBATIM.
//
// ⚠️ READ THIS BEFORE READING THE CODE: `roundValue` IS NOT NUMERIC ROUNDING.
// It is decimal-STRING manipulation. It takes the string LENGTH of an
// intermediate value, slices a prefix off it, concatenates the rounding
// expression onto that prefix, and then compares the resulting candidates by
// value. The rounding expression's LENGTH is load-bearing, not merely its value -
// which is why `'0.99'` and `'.99'` produce different answers for the same input.
// A "corrected", mathematically tidier rounding implementation would be a
// DIFFERENT FUNCTION that charges customers different money.
//
// THE ACCEPTANCE GATE - TEN MEASURED OUTPUTS
// These were produced by executing the legacy algorithm, and every one of them is
// reproduced by the implementation below. Six are counter-intuitive.
//
//   value     expression   direction   output
//   12.3456   0.99         Closest     10.99
//   12.3456   .99          Closest     11.99
//   12.3456   .99          Up          12.99
//   12.3456   .99          Down        11.99
//   12.3456   .95,.99      Closest     11.99     <- cross-iteration delta carry
//   12.30     .99          Closest     12.99     <- FINDING A
//   7.42      9.99         Closest      9.99     <- FINDING C
//   2.30      0.99         Closest      0.99     <- FINDING C
//   0.42      .99          Closest      0.99     <- FINDING D
//   12.3456   0.00         Closest     10.00     <- FINDING B (the DEFAULT)
//
// WHY `0.99` GIVES 10.99 WHILE `.99` GIVES 11.99. Two mechanisms, both keyed off
// `len(rr)`. First the step size at [model/service/RoundingRuleService.cfc:L95],
// `1 * (10 ^ (len(rr)-3))` where `^` is CFML EXPONENTIATION: `'.99'` has length 3
// so the step is 10^0 = 1, while `'0.99'` and `'9.99'` have length 4 so the step
// is 10^1 = 10. Second the slice at [L98],
// `left(inputValue, len(inputValue)-len(rr)) & rr`: for the 5-character
// `'12.35'`, a 3-character expression keeps 2 characters and yields
// `'12' & '.99'` = `'12.99'`, while a 4-character expression keeps 1 and yields
// `'1' & '0.99'` = `'10.99'`.
//
// WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS
// Both of the migration's must-preserve money paths reach it:
//   * Promotion discount math. [model/service/PromotionService.cfc:L1006] calls
//     `roundValueByRoundingRule` and [L1007] derives the discount back out of the
//     result. See the DIRECTION note below - getting it backwards changes money.
//   * The price-group cascade. [model/service/PriceGroupService.cfc:L327] calls
//     `RoundingRule.roundValue(...)`, which delegates here
//     [model/entity/RoundingRule.cfc:L66-L68]. Only the `percentageOff` branch of
//     that switch applies a rounding rule at all; `amountOff` [L331] and `amount`
//     [L334] skip it. That asymmetry is a defect owned by
//     `src/services/priceGroupService.ts` (planned), not by this file, and it is
//     recorded here only so nobody expects this file to normalise it.
//
// ⚠️ THE DIRECTION OF THE PROMOTION CALL, STATED SO IT IS NEVER RE-DERIVED WRONGLY
// At [model/service/PromotionService.cfc:L1006] the value handed to
// `roundValueByRoundingRule` is `originalAmount - discountAmountPreRounding` - the
// NET amount the customer would PAY, after the discount. [L1007] then derives the
// discount as `originalAmount - roundedFinalAmount`. So a rounding rule shapes the
// FINAL PRICE and the discount is the residual. This service rounds exactly the
// value it is handed and never reinterprets an argument as a discount.
//
// ⚠️ LOCATOR CAUTION - THE SOURCE WINS, ALWAYS
// Published locators for this migration are known to drift. Every locator in this
// file was re-verified against the source while it was written, and where the
// specification disagreed with the source the SOURCE WON and the correction is
// recorded in place. A later maintainer inherits the same rule: re-verify, and if
// a citation here is wrong, fix the citation rather than the code.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L327]: locator corrected from
// L338 to L327.
// Verified against source; the specification's line reference had drifted. L338 is
// the comment `//return the newPrice and make sure that it is just a two decimal
// number` and L339 is `return numberFormat(newPrice, "0.00");`. The rounding call
// is `newPrice = arguments.priceGroupRate.getRoundingRule().roundValue(newPrice);`
// at L327, guarded by `if(!isNull(arguments.priceGroupRate.getRoundingRule()))` at
// L326. Every other locator cited by the specification for this port was found
// EXACT, including all of `model/service/RoundingRuleService.cfc` and both
// promotion call sites at [model/service/PromotionService.cfc:L1006, L1026].
//
// THE FIVE FINDINGS ARE REPRODUCED, NOT REPAIRED
// Behaviour preservation extends to defects. A rounding rule that cuts a price by
// 19% today cuts it by 19% here. Each finding is annotated at the line that
// carries it:
//   A. Trailing-zero stringification. [L101-L102] and [L108-L109] compute an
//      intermediate ARITHMETICALLY and then take `len()` of it, and CFML drops
//      trailing zeros when it stringifies a number. Any value whose cents end in
//      zero therefore takes a corrupted branch. Reproduced through
//      `cfNumberToString`, which exists for precisely this reason.
//   B. The default expression `"0.00"` [L88] is NOT inert - it turns 12.3456 into
//      10.00.
//   C. Short-input collapse [L115-L118] sets BOTH candidates to the rounding
//      expression itself.
//   D. Negative intermediate candidates are legal: 0.42 with `'.99'` produces the
//      candidate string `'-0.99'`.
//   E. There is NO expression validation, and none is added.
// None of the migration's three deliberate divergences is spent here, and this
// file owns no NUMBERED entry in the legacy defect register. It owns Finding A's
// register annotation plus three SECONDARY-register items, each labelled as
// secondary where it appears: the `returntype` mismatch between [L88] and its
// callers [L79, L84]; the duplicated `START: DAO Passthrough` banner at [L183];
// and the absent delete-side memo invalidation.
//
// NO USER-SPECIFIED RULES EXIST FOR THIS PROJECT. The rules source was read twice,
// unbounded and with an explicit full range, and both reads returned the identical
// single line `No user rules provided.` - so the read is complete. No rule has been
// invented to fill the gap, and the absence is NOT licence to lower the bar: the
// substitute enterprise-standard practices apply at full strength. The ones this
// file carries are maximal type strictness, the domain-inward layer boundary,
// exactly one exported class, the single arithmetic surface, and in-code annotation
// of every judgment call and every preserved defect. Zero files enter scope by rule
// mandate, and there are consequently no rule conflicts to resolve.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN SILENTLY OMITTED
//   * NO SQL. This service builds and executes no query of any kind, so the
//     parameterized-SQL obligation - every statement a prepared statement,
//     preserving the injection-safety property `cfqueryparam` provided - rests
//     WHOLLY with `src/repositories/mysql/**`. It is stated here because an
//     unstated omission is indistinguishable from an oversight.
//   * NO CONFIGURATION AND NO CREDENTIAL. It reads no environment variable and
//     consumes no setting key - not one - so `src/lib/config.ts` is deliberately
//     not imported. Nothing here holds a host, a DSN, a password or a token.
//   * NO AMBIENT SCOPE, AND THEREFORE NO CONTEXT PARAMETER. A census of the
//     component found ZERO `getHibachiScope()` and ZERO `getSlatwallScope()` sites,
//     so unlike `src/services/priceGroupService.ts` (planned) this service needs no
//     explicit context argument. Do not add one speculatively.
//   * NO SERVICE LOCATOR TO REMOVE. The component contains ZERO `getService()`
//     sites - the only one in the in-scope service tier is
//     [model/service/SkuService.cfc:L212] - so there is nothing here for
//     transformation T2 to strip. Stated so nobody goes looking.
//   * NO LOGGING. `src/lib/logger.ts` is not imported. There is no useful event in
//     a pure decimal-string search, and logging inside the candidate loop would
//     emit a record per rounding expression per value.
//   * NO VALIDATION SCHEMA. `model/validation/RoundingRule.json` exists, but it
//     was the framework validation service that enforced it and that service is
//     not ported. Crucially, it declares NO format constraint on
//     `roundingRuleExpression` - see Finding E at `roundValue`. No zod schema is
//     authored here.
//   * NO SECTION BANNERS. CFML parity [model/service/RoundingRuleService.cfc:L177-L203]:
//     the component ends with nine EMPTY banner sections (Logical Methods, DAO
//     Passthrough twice, Process Methods, Status Methods, Save Overrides, Smart
//     List Overrides, Get Overrides). They contain no code, so they are not
//     reproduced as empty regions here, and this note is the record of that choice
//     rather than a silent drop. One of them is malformed and is worth preserving as
//     an observation: L181 and L183 BOTH read `START: DAO Passthrough`, the second
//     having plainly been meant to read `END`, so that section has no closing banner
//     at all. That is a SECONDARY-REGISTER item, not a numbered defect, and it is
//     the second occurrence of the same wart -
//     [model/service/PromotionService.cfc:L1102] and
//     [model/service/BrandService.cfc:L57, L59] carry the others.
//   * NO TEST FILE. The test tier is owned by a different author and this comment
//     states the obligation without discharging it.
//
// TESTS - ALL OF IT NET-NEW, NONE OF IT PARITY
// Coverage for this file belongs at
// `slatwall-ts/tests/unit/services/roundingRuleService.test.ts`, and EVERY case in
// it is NET-NEW. That is a measurement, not a hedge: `meta/tests/unit/service/`
// contains only `AccountServiceTest.cfc`, `HibachiServiceTest.cfc`,
// `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`, none of them in scope,
// and no legacy test anywhere under `meta/tests/**` exercises rounding. Across the
// whole migration only `meta/tests/unit/entity/BrandTest.cfc` and
// `meta/tests/unit/entity/ProductTest.cfc` are extended, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub
// contributing zero coverage. Presenting any of this file's coverage as parity
// would misstate the record. The ten measured outputs above are the
// characterization cases that matter most; the unrecognised-direction
// pass-through, the empty-expression pass-through and the option-one-wins-ties
// case matter next.
//
// WHAT THIS FILE LEAVES TESTABLE
// `roundValue` is a pure function of its three arguments. `roundValueByRoundingRule`
// is pure given an entity. The one collaborator is a PORT INTERFACE, so a test
// supplies a stub with no database. There is no ambient state, no module-level
// mutable state and no clock or environment read anywhere.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// IMPORTS - narrow, named, and every one of them used
//
// E2, THE LAYER BOUNDARY, AND A NUANCE THAT MUST NOT BE MISREAD. This file must
// never import from `src/repositories/**`, `src/handlers/**` or
// `src/integrations/**`: it depends on port INTERFACES only, never on a concrete
// adapter. The `no-restricted-imports` layer-boundary rule in eslint.config.mjs is
// scoped to the glob `src/domain/**/*.ts`, so it does NOT cover `src/services/**`.
// The boundary here is an ARCHITECTURAL constraint enforced by review, not a lint
// failure. Do not assume a linter will catch a violation of it.
//
// NO INTRA-FOLDER IMPORT. Nothing under `src/services/` is imported. Every
// collaborator arrives as a constructor argument and the graph is assembled once,
// explicitly, in `src/handlers/bootstrap.ts` (planned).
//
// NO THIRD-PARTY RUNTIME PACKAGE, AND IN PARTICULAR NO `decimal.js`. Exactly two
// modules in the subtree may import it directly - `src/lib/cfml/precision.ts` and
// `src/lib/cfml/numberFormat.ts` - and this is not one of them. All arithmetic here
// reaches decimals through those two substrates and through `Money`.
//
// Type-only imports are separate statements rather than inline `{ type X }`
// specifiers, which is what `consistent-type-imports` with
// `fixStyle: 'separate-type-imports'` and `no-import-type-side-effects` require.
// ---------------------------------------------------------------------------

import type { RoundingRule } from '../domain/entities/roundingRule.js';
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
import { cfEquals } from '../lib/cfml/struct.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';

/**
 * The durable half of `super.save` for one rounding rule.
 *
 * ★★★ WHY THIS CONTRACT IS DECLARED HERE, IN THE CONSUMER, AND NOT IN `src/domain/ports/`.
 * The port set is closed at THIRTEEN [AAP 0.2.1] and `PromotionRepository` is specified as SEVEN
 * READS, so neither a fourteenth port nor an eighth member on an existing one is available - and the
 * review that required this write said so explicitly, asking for "a narrow module-local/framework-write
 * collaborator over the executor - without a 14th domain port". A consumer-declared interface is the
 * remaining honest shape: this module states the one operation it needs, `src/handlers/bootstrap.ts`
 * implements it over the `PreparedStatementExecutor`, and the dependency still points inward because
 * nothing here imports the implementation. The same device already carries the address-zone index and
 * the price-group and promotion framework reads.
 *
 * IT IS NOT A REPOSITORY, AND THE NAMING SAYS SO. `SwRoundingRule` reads belong to
 * `PromotionRepository.getRoundingRuleQuery` [model/dao/RoundingRuleDAO.cfc:L51]; this is the
 * FRAMEWORK-GENERATED write that Hibernate produced from the entity's persistent-property metadata
 * [org/Hibachi/HibachiService.cfc:L155], which no DAO in the legacy source declares. Keeping it a
 * separate, single-method collaborator is what stops "the contract that owns a table's read owns its
 * write" from quietly licensing every repository in this subtree to write wherever it reads.
 */
export interface RoundingRuleFrameworkWrites {
  /**
   * Insert or update one rounding rule and answer the persisted row.
   *
   * The implementation decides insert versus update from `rule.isNew()`
   * [model/entity/RoundingRule.cfc:L52, `unsavedvalue=""`] and stamps the four audit columns, exactly
   * as `HibachiEntity.preInsert` / `preUpdate` did.
   *
   * @param rule - The rule to persist, already validated by its caller.
   * @returns The persisted rule, carrying its minted identifier and audit stamps.
   */
  saveRoundingRule(rule: RoundingRule): Promise<RoundingRule>;
}

/**
 * Raised by {@link RoundingRuleService.saveRoundingRule} when the rule fails the save-context rules
 * declared at [model/validation/RoundingRule.json].
 *
 * ★★ A THROW, WHERE THE LEGACY SET A FLAG - A DOCUMENTED DIVERGENCE, NOT AN OVERSIGHT.
 * [org/Hibachi/HibachiService.cfc:L151-L165] validates, and on failure it does NOT throw: it leaves
 * the entity carrying errors, skips the DAO call, announces a failure event and RETURNS THE ENTITY.
 * Reproducing that shape needs `HibachiEntity.validate()` and `hasErrors()`, and those are
 * deliberately NOT ported anywhere in this slice - `src/domain/entities/brand.ts` records the
 * decision, and `src/domain/entities/promotion.ts` records it again for the delete context.
 *
 * With no error-collection surface to populate, the two available shapes are THROW or RETURN AN
 * UNSAVED ENTITY AS THOUGH IT SAVED. The second is exactly the success-shaped dropped write this
 * finding is about, so it is not a candidate. Throwing is also what the service tier already does for
 * declarative validation elsewhere: `processProduct_updateSkus` calls
 * `productUpdateSkusSchema.parse(input)`, which raises. The divergence is therefore consistent with
 * the codebase and is confined to HOW a refusal is signalled - never to WHICH rules refuse.
 */
export class RoundingRuleValidationError extends Error {
  public constructor(
    /** The property that failed, spelled as [model/validation/RoundingRule.json] spells it. */
    public readonly propertyName: string,
    /** Why it failed, in the terms the JSON rule uses. */
    public readonly reason: string,
  ) {
    super(
      `saveRoundingRule refused: ${propertyName} ${reason}. ` +
        'Declared at model/validation/RoundingRule.json in the "save" context.',
    );
    this.name = 'RoundingRuleValidationError';
  }
}

/**
 * Enforce the `"save"` context of [model/validation/RoundingRule.json], which reads verbatim:
 *
 *   "roundingRuleName":       [{"contexts":"save","required":true}],
 *   "roundingRuleExpression": [{"contexts":"save","required":true,
 *                              "method":"hasExpressionWithListOfNumericValuesOnly"}],
 *   "roundingRuleDirection":  [{"contexts":"save","required":true}],
 *   "priceGroupRates":        [{"contexts":"delete","maxCollection":0}]
 *
 * FOUR RULES ARE DECLARED AND THREE ARE ENFORCED HERE, because the fourth is a `"delete"` rule and
 * this is the save path. It is named above rather than omitted so a reader can confirm the file was
 * read whole.
 *
 * `required` IS CFML `required`, WHICH IS A LENGTH TEST AND NOT A NULL TEST. The framework treats an
 * empty string as absent, so `cfLen` is the right predicate and a rule satisfied by `""` would be a
 * rule this port had loosened. `hasExpressionWithListOfNumericValuesOnly` is INVOKED on the entity
 * [model/entity/RoundingRule.cfc:L78-L86] rather than reimplemented - the entity is the authority for
 * its own declared validator, and duplicating that loop here would let the two drift.
 *
 * ORDER OF EVALUATION follows the JSON's own property order, and the first failure raises. CFML
 * collected every error before returning; with no error-collection surface ported there is nothing to
 * collect into, so the first failure is reported and the rest are unreached. That narrows WHICH
 * failure a caller is told about, never WHETHER a failing rule refuses.
 */
function assertSaveContextRules(rule: RoundingRule): void {
  if (!cfTruthy(cfLen(rule.getRoundingRuleName()))) {
    throw new RoundingRuleValidationError('roundingRuleName', 'is required');
  }

  if (!cfTruthy(cfLen(rule.getRoundingRuleExpression()))) {
    throw new RoundingRuleValidationError('roundingRuleExpression', 'is required');
  }

  if (!rule.hasExpressionWithListOfNumericValuesOnly()) {
    throw new RoundingRuleValidationError(
      'roundingRuleExpression',
      'must satisfy hasExpressionWithListOfNumericValuesOnly - every list element must be numeric ' +
        'and carry exactly two digits after the decimal point',
    );
  }

  if (!cfTruthy(cfLen(rule.getRoundingRuleDirection()))) {
    throw new RoundingRuleValidationError('roundingRuleDirection', 'is required');
  }
}

/**
 * The two values the legacy memo stores for one rounding rule.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L72-L74]: the legacy body
 * creates an empty struct and writes exactly two keys into it -
 * `roundingRuleExpression` [L73] and `roundingRuleDirection` [L74], both read
 * straight off the DAO query. There is deliberately NO third key: no identifier,
 * no timestamp, no name, and no derived or parsed form of the expression. Adding
 * one would widen a contract the legacy memo never had.
 *
 * BOTH KEYS ARE PLAIN `string`, NEVER `string | undefined`, AND THAT IS A
 * DELIBERATE ASYMMETRY WITH THE ENTITY. `RoundingRule.getRoundingRuleExpression()`
 * returns `string | undefined` because it reports a nullable column truthfully.
 * This type does not, because it models a CFML QUERY COLUMN rather than an entity
 * field, and a CFML query renders SQL `NULL` as the EMPTY STRING. The two paths
 * into `roundValue` therefore behave differently for a rule whose expression
 * column is `NULL`, and both behaviours are load-bearing - the difference is
 * spelled out in full at {@link RoundingRuleService.getRoundingRuleDetailsByID}.
 *
 * `roundingRuleDirection` is `string` and NOT the entity module's
 * `RoundingRuleDirection` union. The column carries no enumeration constraint in
 * the schema, an unrecognised direction is a REACHABLE live state, and narrowing
 * the type here would make a reachable state unrepresentable - see the
 * defaultless dispatch at {@link RoundingRuleService.roundValue}.
 */
export interface RoundingRuleDetails {
  /** [model/service/RoundingRuleService.cfc:L73] The raw expression, as stored. */
  readonly roundingRuleExpression: string;

  /** [model/service/RoundingRuleService.cfc:L74] The raw direction, unvalidated. */
  readonly roundingRuleDirection: string;
}

/**
 * The optional payload handed to {@link RoundingRuleService.saveRoundingRule},
 * standing in for the legacy `struct data` argument
 * [model/service/RoundingRuleService.cfc:L56].
 *
 * AN OPEN STRUCT RATHER THAN A TYPED INTERFACE, AND THAT IS THE HONEST SHAPE HERE
 * RATHER THAN A SHORTCUT. A typed interface is the right translation of a CFML
 * struct whenever the ported body READS keys from it - which is why
 * `BrandSaveInput` in `src/services/brandService.ts` enumerates the two keys its
 * body touches. This body reads ZERO keys: `saveRoundingRule` consults only
 * `entity.isNew()` [L57] and `entity.getRoundingRuleID()` [L58-L59], then hands
 * `data` on untouched inside `super.save(argumentcollection=arguments)` [L63].
 * Enumerating `SwRoundingRule`'s populatable columns here would therefore invent a
 * contract the legacy save path never had, and schema continuity forbids adding a
 * constraint the legacy lacks. So the type says exactly what is true: an untyped
 * CFML struct that this service passes through without reading.
 *
 * `Readonly` because nothing here writes to it. Contrast `BrandSaveInput`, whose
 * `urlTitle` is deliberately writable because that service genuinely writes it.
 */
export type RoundingRuleSaveInput = Readonly<Record<string, unknown>>;

/**
 * CFML's `isNull(x)`, as a TypeScript type guard.
 *
 * WHY THIS EXISTS AT ALL, given that redeclaring a published helper is forbidden:
 * it declares nothing new. It DELEGATES to `isNullish` from
 * `src/lib/cfml/truthiness.js` and adds only the `value is undefined` predicate
 * signature, which is what lets the compiler narrow the operand afterwards. The
 * published helper returns a plain `boolean` and therefore narrows nothing, so
 * without this wrapper the seven legacy `isNull(...)` sites could only be expressed
 * either by abandoning the helper or by silencing the compiler with a `!`
 * assertion - and `!` is banned outright across `src/**` precisely because it
 * suppresses the checks that decide money.
 *
 * The seven sites this serves, all of them genuine NULL tests rather than
 * `structKeyExists` probes: [model/service/RoundingRuleService.cfc:L134, L138, L145,
 * L149, L156, L160] guarding the delta accumulator, and [L170] guarding the return
 * accumulator. Keeping the legacy `isNull(...)` shape verbatim at each of them is
 * what makes the ported dispatch diffable against the CFC line for line.
 *
 * Module-local and NOT exported: one exported unit per file, and this is an
 * expression detail of the algorithm rather than part of the service's contract.
 *
 * @param value - the accumulator or optional value under test.
 * @returns whether the value is absent, exactly as CFML's `isNull` reports it.
 */
function isCfmlNull<TValue>(value: TValue | undefined): value is undefined {
  return isNullish(value);
}

/**
 * The step size at [model/service/RoundingRuleService.cfc:L95]:
 * `var rrPower = 1 * (10 ^ (len(rr)-3));`
 *
 * `^` is CFML's EXPONENTIATION operator, not a bitwise xor, and the leading
 * `1 *` is a no-op numeric coercion that the legacy author used to force the
 * result into a number. Neither is reproduced as an operation; the exponentiation
 * is, exactly.
 *
 * BUILT AS AN EXACT DECIMAL STRING RATHER THAN COMPUTED. `src/lib/cfml/precision.ts`
 * publishes no power primitive - its surface is closed and is not widened
 * speculatively - and `Math.pow(10, n)` would put an IEEE-754 double into a money
 * path, which is the one thing the single-arithmetic-surface standard exists to
 * prevent. A power of ten is trivially exact in decimal notation, so it is written
 * out: `10^2` is `'100'`, `10^0` is `'1'`, and `10^-2` is `'0.01'`. The result is
 * then handed straight to the decimal substrate, so no float ever exists.
 *
 * LEGACY-NOTE [model/service/RoundingRuleService.cfc:L95]: a negative exponent is
 * reachable and is deliberately supported rather than guarded.
 * `len(rr)-3` goes negative for any expression shorter than three characters -
 * `len('99')` is 2, giving 10^-1 = 0.1 - and `roundingRuleExpression` is free text
 * with no format constraint [model/entity/RoundingRule.cfc:L54]. Adding a length
 * check, a regex or a format guard would introduce a constraint the legacy lacks,
 * so a fractional step size is produced faithfully instead. This is Finding E.
 *
 * @param exponent - `len(rr) - 3`; may be zero or negative.
 * @returns ten raised to `exponent`, as an exact decimal numeral.
 */
/**
 * The longest a single comma-list member may be before the length-driven allocation.
 *
 * S-10, resource half. The nine measured cases in AAP 0.6.4 use expressions of two to five
 * characters - `'0.99'`, `'.99'`, `'9.99'`, `'0.00'` - and the longest the AAP records anywhere is
 * `'.95,.99'`, whose members are three characters each. Two hundred and fifty-six is roughly fifty
 * times the longest real member, which is the point: it bounds `'0'.repeat(...)` without coming
 * anywhere near a value a rounding expression could legitimately hold.
 */
const MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH = 256;

/**
 * The most comma-list members one expression may carry.
 *
 * S-10, resource half. Each member costs one full candidate evaluation, so the count multiplies the
 * per-member allocation. The legacy examples carry one or two members; two hundred and fifty-six
 * leaves that untouched while bounding the product at roughly 65KB of transient string - the same
 * order as one bounded SQL statement, and reached only by data that is already nonsense.
 */
const MAX_ROUNDING_EXPRESSION_MEMBER_COUNT = 256;

/**
 * The longest the WHOLE comma list may be, derived rather than chosen.
 *
 * Every member is at most {@link MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH} characters and there are at
 * most {@link MAX_ROUNDING_EXPRESSION_MEMBER_COUNT} of them, each needing at most one delimiter, so
 * a list longer than this product CANNOT satisfy the two member limits whatever its contents.
 * Rejecting on it is therefore exactly equivalent to rejecting on the member checks - it decides no
 * case they would have decided differently - and it costs one O(1) property read.
 *
 * ★ WHY THIS EXISTS, WHEN THE MEMBER CHECKS ALREADY BOUND THE ALLOCATION. It was added after
 * MEASURING the guard rather than reasoning about it. The member checks reach a member only through
 * `listLen` and `listGetAt`, and those TRAVERSE the raw string: with a 50-million-character
 * expression the refusal was correct but took twelve seconds, because the guard paid the traversal
 * cost before it could refuse the allocation cost. Bounding the raw length first makes the whole
 * check O(1) in the hostile case. The member checks are still what the finding asks for and still
 * decide every in-range input; this only stops the guard itself from being expensive to run.
 */
const MAX_ROUNDING_EXPRESSION_LENGTH =
  MAX_ROUNDING_EXPRESSION_MEMBER_COUNT * (MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH + 1);

/** Raised when a rounding expression is too large to evaluate, as opposed to malformed. */
class RoundingExpressionTooLargeError extends Error {
  public constructor(detail: string) {
    super(detail);
    this.name = 'RoundingExpressionTooLargeError';
  }
}

/**
 * Refuses a rounding expression whose SIZE - never whose SHAPE - is beyond evaluation.
 *
 * The separation matters and is the whole basis of S-10's split disposition. This function makes no
 * judgement about whether a member looks like a decimal numeral, contains digits, or names a
 * recognised form; AAP 0.6.4 Finding E records the absence of such validation as measured legacy
 * behaviour, and AAP 0.8.1 Schema Continuity forbids adding a constraint the schema lacks. All this
 * asks is whether the value is small enough to compute with.
 *
 * Checked BEFORE the evaluation loop, because a guard that fired mid-loop would already have
 * performed some of the allocations it exists to prevent.
 *
 * The three checks run cheapest-first, and that ORDER IS LOAD-BEARING: the raw-length gate is O(1)
 * and must precede the member checks, because reaching a member at all means `listLen` and
 * `listGetAt` have already traversed the string.
 *
 * @param roundingExpression - the raw comma list, as persisted. Checked before any list operation is
 *   performed on it.
 * @throws An error named `RoundingExpressionTooLargeError` naming the limit that was exceeded, with
 *   the offending LENGTH but never the offending VALUE - persisted pricing configuration is not
 *   published into an error string.
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
 * CFML parity [model/service/RoundingRuleService.cfc:L98, L103, L110]: all three
 * slices take a PREFIX of a decimal numeral and then concatenate the rounding
 * expression onto it. `left()` in CFML is a Java `String` operation and counts
 * UTF-16 code units, which is exactly what `String.prototype.slice` does, so the
 * two agree character for character.
 *
 * Every call site has already established `count >= 1` through the string-length
 * gates at [L97], [L102] and [L109], so no bounds handling is needed or added.
 *
 * @param value - the numeral to take a prefix of.
 * @param count - how many leading characters to keep.
 * @returns the prefix. Not branded: a prefix of a numeral is usually not a numeral
 *   on its own, and it only becomes one once the expression is concatenated on.
 */
function left(value: string, count: number): string {
  return value.slice(0, count);
}

/**
 * The ported `RoundingRuleService`
 * [model/service/RoundingRuleService.cfc:L49-L204].
 *
 * A CLASS, and the shape is contractual rather than stylistic. Four of the five
 * methods are pure, but the fifth pair - `getRoundingRuleDetailsByID` and
 * `saveRoundingRule` - share per-instance state and a collaborator, which is
 * exactly what an object is for. Interface parity is this migration's acceptance
 * contract, so every public method name below is the legacy CFML name VERBATIM in
 * camelCase; that is also why eslint.config.mjs deliberately enables no
 * `naming-convention`, `camelcase` or `id-match` rule.
 *
 * A STANDALONE CLASS WITH NO BASE. The legacy component extends `HibachiService`,
 * and none of that framework is ported: `org/Hibachi/**` is a boundary to extract
 * from and never to modify. What it supplied is redistributed explicitly elsewhere -
 * persistence to the repositories, validation to typed schemas, request scope to
 * explicit context parameters, smart lists to typed query methods. There is no
 * inheritance emulation here, no `onMissingMethod` equivalent, and no dynamic
 * dispatch of any kind: no `Proxy`, no index signature, no `evaluate()`, no
 * `variables.` scope object.
 *
 * THIS IS THE CLEANEST SERVICE IN THE SLICE. It declares exactly ONE collaborator
 * and ZERO dead injections. Five of the seven ported services carry at least one
 * DI/1 property their body never uses; this one does not - `roundingRuleDAO`
 * [model/service/RoundingRuleService.cfc:L51] is declared once and genuinely used
 * once, at [L70].
 *
 * STRUCTURALLY SATISFIES THE ENTITY'S COLLABORATOR CONTRACT. `RoundingRule`'s
 * constructor takes a rounder declared at its point of use as
 * `roundValueByRoundingRule(value: Money, rule: RoundingRule): Money`
 * [src/domain/entities/roundingRule.ts]. That interface is module-local and
 * deliberately unexported - publishing it would read as a fourteenth port - so this
 * class satisfies it STRUCTURALLY, with no `implements` clause and without importing
 * the name. TypeScript needs neither, and `src/handlers/bootstrap.ts` (planned)
 * wires the concrete instance in. That is why the signature of
 * `roundValueByRoundingRule` below must not drift: the entity's constructor is a
 * compile-time check on it.
 */
export class RoundingRuleService {
  /**
   * Rounding-rule details already resolved during THIS request, keyed by
   * identifier.
   *
   * CFML parity [model/service/RoundingRuleService.cfc:L53]:
   * `variables.roundingRuleDetails = {};` - a component-level struct initialised at
   * declaration scope, populated by `getRoundingRuleDetailsByID` [L67-L77] and
   * evicted from by `saveRoundingRule` [L57-L61].
   *
   * A PRIVATE INSTANCE FIELD, NEVER MODULE STATE, AND THIS IS A CORRECTNESS
   * PROPERTY RATHER THAN A CHOICE OF STYLE. On a warm Lambda container a
   * module-level binding survives between UNRELATED invocations, so rounding-rule
   * state held at module scope would let one tenant's pricing rules answer another
   * tenant's request. Held per instance, and with `src/handlers/bootstrap.ts`
   * (planned) constructing the graph per invocation, the map cannot outlive the
   * request that filled it. The single documented exception to the no-module-state
   * rule anywhere in this subtree is the connection pool in
   * `src/repositories/mysql/connection.ts`, which is not this file's concern.
   *
   * WHAT THIS IS: computed-value caching within a single request. It records values
   * this request has already resolved so that the same identifier resolves once.
   *
   * LEGACY-NOTE [model/service/RoundingRuleService.cfc:L66]: the legacy comment's
   * stated rationale for this memo is deliberately NOT carried forward.
   * It justifies the struct in terms of a framework cache-rebuild concern that has
   * no counterpart in the target, and this migration asserts no non-functional
   * requirement of any kind because none exists in the source. The reason the memo
   * survives the port at all is behavioural: eviction on save [L57-L61] is
   * observable through `getRoundingRuleDetailsByID`, so removing the memo would
   * remove a method's reason to exist.
   *
   * A `Map` RATHER THAN A PLAIN OBJECT. It is keyed by caller-supplied identifiers,
   * and a `Map` has no prototype chain for a key such as `constructor` or
   * `__proto__` to collide with. It also gives `saveRoundingRule` the ordinary
   * `delete` that [L59]'s `structDelete` becomes.
   *
   * JUDGMENT CALL: CFML struct keys are CASE-INSENSITIVE and `Map` keys are not, so
   * two spellings of one identifier that CFML would treat as a single memo entry
   * resolve as two here. This is unobservable through the public contract. The
   * VALUE is identical either way, because `MySQL`'s default collation makes the
   * `roundingRuleID = ?` predicate case-insensitive too, so both spellings load the
   * same row; only the number of lookups differs. The case-insensitive struct
   * helpers live in `src/lib/cfml/struct.ts`, which is deliberately outside this
   * file's dependency set - and `structDelete` is deliberately absent from that
   * module in any case, so the eviction below is expressed locally by design.
   */
  private readonly roundingRuleDetails = new Map<string, RoundingRuleDetails>();

  /**
   * @param promotionRepository - Replaces the legacy
   *   `property name="roundingRuleDAO" type="any";`
   *   [model/service/RoundingRuleService.cfc:L51], the component's one and only
   *   collaborator.
   *
   *   T1 APPLIED. That property was resolved at runtime by a DI/1 0.4.2 convention
   *   scan; here it is an explicit, compile-checked constructor parameter typed to a
   *   port INTERFACE rather than to a concrete adapter, so a test supplies a stub
   *   with no database. There is no runtime scan, no service locator and no
   *   dependency-injection container package anywhere in the target.
   *
   *   CFML parity [model/service/RoundingRuleService.cfc:L51]: the declaration
   *   carries an EXPLICIT `type="any"`, which is unusual among the in-scope
   *   services - the others declare the property bare. It is recorded rather than
   *   normalised away silently, and it is precisely the untyped declaration that
   *   this port replaces with a named interface.
   *
   *   JUDGMENT CALL: `model/dao/RoundingRuleDAO.cfc:L51` `getRoundingRuleQuery` has
   *   no dedicated port. Ports are locked at 13; this lookup is served by
   *   promotionRepository rather than a 14th port. The DAO is real - a 69-line
   *   component whose single declaration is that one function, selecting only
   *   `roundingRuleExpression` and `roundingRuleDirection` from `SwRoundingRule`
   *   [model/dao/RoundingRuleDAO.cfc:L57-L59] - but the port inventory the
   *   transformation plan enumerates is closed, and the sale-price path in
   *   `promotionRepository` is where the adapter can satisfy the same read as a join.
   *   `getRoundingRuleQuery` is consumed here exactly as that port declares it, and
   *   NOTHING is added to the port.
   */
  constructor(
    private readonly promotionRepository: PromotionRepository,
    private readonly frameworkWrites: RoundingRuleFrameworkWrites,
  ) {}

  /**
   * Ported 1:1 from `public any function saveRoundingRule(required any entity,
   * struct data, string context="save")`
   * [model/service/RoundingRuleService.cfc:L56-L64].
   *
   * ITS SOLE DECLARED PURPOSE IS MEMO EVICTION. That is literally what the comment
   * above it says [L55]: the default save is overridden so that a saved rule's
   * cached expression is discarded. Everything else the method does is
   * `super.save(argumentcollection=arguments)` [L63].
   *
   * ZERO CALLERS ANYWHERE IN THE CODEBASE - an admin/framework-only surface, reached
   * through the Hibachi save dispatcher rather than from application code. It is
   * ported for interface parity all the same, because parity is the acceptance
   * contract and a method that exists in the source and not in the target is a
   * missing method however unused it is.
   *
   * JUDGMENT CALL: with a request-scoped memo the eviction is structurally moot -
   * within one request a rule is saved at most once and the memo dies with the
   * request either way - yet the method is retained in full, and the eviction is
   * implemented rather than stubbed. Two reasons. The eviction is genuinely
   * observable within a single request: resolve a rule, save it with a new
   * expression, resolve it again, and the second resolution must reach the
   * repository. And a stub would be a placeholder, which this port does not ship.
   *
   * ★★★ BOTH HALVES ARE NOW PORTED: THE EVICTION *AND* THE DURABLE WRITE.
   * The body reproduces [L57-L61] and then [L63]'s `super.save(argumentcollection=arguments)`,
   * in that order, through {@link RoundingRuleFrameworkWrites}.
   *
   * QUOTE-THEN-REVISE, BECAUSE THIS METHOD ARGUED THE OPPOSITE AT LENGTH AND THE ARGUMENT WAS WRONG.
   * A previous revision ported only the eviction and defended the omission like this: "`super.save`
   * ... is framework-inherited generic CRUD from `HibachiService`, with the statement generated by
   * Hibernate from the entity's persistent-property metadata rather than written anywhere in the legacy
   * source. Generic inherited CRUD is out of scope for this slice, and this override has ZERO legacy
   * callers, so the durable write is treated exactly as the other reachable out-of-scope surfaces in
   * this migration are - `ProductService.processProduct_addProductReview` and the subscription SKU
   * branches - namely documented as unexercised at the point where it would have run, rather than
   * implemented." It then stated the objection to itself and dismissed it: "a save that silently does
   * not save is worse than a missing method, because a missing method is a compile error ... What makes
   * it survivable is that the omission is not silent: it is stated in this docblock."
   *
   * THREE THINGS WERE WRONG WITH THAT, and the third is the one that settles it.
   *
   *   * THE ANALOGY TO THE OTHER OUT-OF-SCOPE SURFACES IS FALSE, AND INVERTS THE VERY PROPERTY THAT
   *     MAKES THEM ACCEPTABLE. `processProduct_addProductReview`, the subscription branches and the
   *     image store all REFUSE VISIBLY - they reach a stub port that raises, so a caller learns
   *     immediately that the capability is absent. This method did the opposite: it returned a
   *     Promise that RESOLVED, with the input entity, indistinguishable from a successful save. A
   *     refusal and a false success are not the same disposition, and only the first was ever
   *     sanctioned.
   *   * "STATED IN THIS DOCBLOCK" IS NOT A SUBSTITUTE FOR A SIGNAL A CALLER CAN OBSERVE. A comment is
   *     read by whoever edits the file, never by whoever calls the method. Documentation cannot
   *     discharge a contract that the return value contradicts.
   *   * THE PORT LOCK NEVER FORBADE THE WRITE - ONLY ONE WAY OF DOING IT. The withdrawn revision
   *     reached for an eighth method on `PromotionRepository`, and rejecting that was correct:
   *     the port is specified as SEVEN READS, and owning a table's read does not license a write to
   *     it. But "this must not be a port member" was then treated as "this must not exist", and those
   *     are different conclusions. A consumer-declared collaborator implemented in the composition
   *     root satisfies the lock and performs the write - see {@link RoundingRuleFrameworkWrites}.
   *
   * ZERO LEGACY CALLERS REMAINS TRUE and remains a reason to be careful rather than a reason to skip:
   * an unused method that lies is still a method that lies, and the surface is published on the
   * composition root either way.
   *
   * VALIDATION IS PERFORMED, AND IT IS THE DECLARED RULE SET RATHER THAN AN INVENTED ONE.
   * [org/Hibachi/HibachiService.cfc:L151] validates before it writes, so this method does too:
   * [model/validation/RoundingRule.json] declares `roundingRuleName`, `roundingRuleExpression` and
   * `roundingRuleDirection` all required in the `save` context, and the expression additionally
   * carries `"method":"hasExpressionWithListOfNumericValuesOnly"` - which the entity already
   * implements [model/entity/RoundingRule.cfc:L78-L86], so the rule is INVOKED rather than
   * reimplemented. Failure raises {@link RoundingRuleValidationError}; that divergence from the
   * legacy's error-flag shape is justified at the class.
   *
   * ORDER OF OPERATIONS, PRESERVED: evict [L57-L61], then validate and write [L63]. The eviction runs
   * FIRST even though it now precedes a write that could fail, because that is where the source puts
   * it - a refused save in the legacy also left the memo already evicted, since `structDelete` ran
   * before `super.save` was ever reached.
   *
   * LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56]: there is NO delete
   * counterpart to this save override, and none is added.
   * The component overrides save to evict, but never overrides delete, so in the
   * legacy design a rule deleted mid-request leaves its details resolvable from the
   * struct afterwards. That is a real staleness gap. Schema and behaviour continuity
   * forbid adding delete-side invalidation the legacy lacks, so the gap is
   * reproduced and recorded. SECONDARY-register item, not a numbered defect.
   *
   * NOW GENUINELY `async`, AND THE EARLIER NOTE ABOUT THAT WAS PRESCIENT. It read: the signature is
   * `Promise<RoundingRule>` "whether or not the body has anything to await - so that if a durable write
   * is ever brought into scope by a recorded plan change, it lands here without a signature change
   * rippling through the callers." That is exactly what happened. The declared signature AAP 0.4.2
   * specifies is unchanged; only the `async` keyword and the `await` inside are new, so no caller is
   * affected and `require-await` is satisfied honestly rather than suppressed.
   *
   * @param rule - The rule being saved. Spelled `entity` at
   *   [model/service/RoundingRuleService.cfc:L56]; the published target signature
   *   uses `rule`, matching `roundValueByRoundingRule`. Parameter names are not part
   *   of a TypeScript call contract - there are no named arguments - so this costs
   *   no parity, and the legacy spelling is recorded here instead.
   * @param data - The legacy `struct data`. Accepted for signature parity and never
   *   read: the eviction logic does not consult it, and [L63] passed it straight on.
   *   ★ IT IS STILL NOT READ, AND THAT IS DELIBERATE EVEN NOW THAT A WRITE HAPPENS.
   *   [org/Hibachi/HibachiService.cfc:L143-L148] populates from `data` before validating, but
   *   `RoundingRuleSaveInput` publishes no persistent-property key to populate FROM - the payload
   *   type's own docblock records that "this body reads ZERO keys". Populating from a payload that
   *   declares no columns would mean inventing keys the source never had.
   * @param context - The legacy `context`, defaulting to `"save"` exactly as [L56]
   *   declares. ★ NOW MEANINGFUL RATHER THAN INERT: [org/Hibachi/HibachiService.cfc:L151] passes it
   *   to `validate(context=...)`, and [model/validation/RoundingRule.json] declares its three rules
   *   in the `"save"` context specifically - the fourth rule, `priceGroupRates maxCollection 0`,
   *   belongs to `"delete"`. So a caller naming any other context gets no save-context validation,
   *   exactly as the legacy dispatcher behaves.
   * @returns The PERSISTED rule - the row as it now stands, carrying its minted identifier and audit
   *   stamps. Previously this returned the same instance it was handed.
   * @throws {@link RoundingRuleValidationError} when a save-context rule fails.
   */
  async saveRoundingRule(
    rule: RoundingRule,
    data?: RoundingRuleSaveInput,
    context: string = 'save',
  ): Promise<RoundingRule> {
    // Legacy [model/service/RoundingRuleService.cfc:L57-L61]:
    //   if(!arguments.entity.isNew()) {
    //     if(structKeyExists(variables.roundingRuleDetails, arguments.entity.getRoundingRuleID())) {
    //       structDelete(variables.roundingRuleDetails, arguments.entity.getRoundingRuleID());
    //     }
    //   }
    //
    // The `isNew()` gate is kept even though it is redundant against the inner
    // test - a rule that has never been saved has an empty identifier
    // [model/entity/RoundingRule.cfc:L52], which no memo entry can be keyed by - so
    // the outer guard can never change the outcome. It is reproduced because it is
    // there, and because a reader diffing the two files should find both lines.
    if (!rule.isNew()) {
      // CFML parity [model/service/RoundingRuleService.cfc:L58-L59]: the
      // `structKeyExists` test then `structDelete` pair is expressed locally as
      // `has` then `delete`. `structDelete` is deliberately absent from
      // `src/lib/cfml/struct.ts`, and that module is outside this file's dependency
      // set in any case, so no helper is imported for a one-token map operation.
      // `Map.prototype.delete` on an absent key is already a no-op, making the
      // guard redundant here as well; it too is reproduced rather than elided, for
      // the same diffability reason.
      if (this.roundingRuleDetails.has(rule.getRoundingRuleID())) {
        this.roundingRuleDetails.delete(rule.getRoundingRuleID());
      }
    }

    // CFML parity [model/service/RoundingRuleService.cfc:L63]:
    //   return super.save(argumentcollection=arguments);
    //
    // ★ WHAT THAT ONE LINE IS, UNPACKED. [org/Hibachi/HibachiService.cfc:L133-L169] populates from
    // `data` if present [L146], validates in `context` [L151], and ONLY when `hasErrors()` is false
    // calls `getHibachiDAO().save(target=...)` [L155]. Population is a no-op here (see the `data`
    // parameter note); validation and the write follow, in that order.
    //
    // ★ CONTEXT-GATED, EXACTLY AS THE FRAMEWORK GATES IT. `validate(context=...)` selects the rule
    // set, and [model/validation/RoundingRule.json] puts all three field rules in `"save"`. A caller
    // naming another context therefore reaches the write without them, which is the legacy behaviour
    // rather than a shortcut.
    if (cfEquals(context, 'save')) {
      assertSaveContextRules(rule);
    }

    // The durable half. `isNew()` decides insert versus update inside the collaborator, which is where
    // the statement and its audit stamps live - this tier decides only WHETHER to write.
    return await this.frameworkWrites.saveRoundingRule(rule);
  }

  /**
   * Ported 1:1 from `public struct function getRoundingRuleDetailsByID(required
   * string roundingRuleID)` [model/service/RoundingRuleService.cfc:L67-L77].
   *
   * Answers the expression and direction for one rule, resolving it through the
   * repository on first request and reading it back from the request-scoped memo
   * afterwards.
   *
   * ZERO EXTERNAL CALLERS. Its only other occurrence in the entire codebase is its
   * own use at [L80], which makes it effectively a private memo helper. It stays
   * PUBLIC because it is public in the source and interface parity is the
   * acceptance contract - this is parity preservation, not an invitation to call it.
   * It consumes none of the migration's visibility-widening budget: it is not
   * widened, it is carried across at the visibility it already had.
   *
   * ASYNC BECAUSE THE LEGACY BODY REACHES THE DAO. [L70] is
   * `getRoundingRuleDAO().getRoundingRuleQuery(roundingRuleID = arguments.roundingRuleID)`.
   * The async boundary rule is applied per method: async if and only if the legacy
   * body reached the DAO or the ORM, which is true here and false for
   * `roundValue` and `roundValueByRoundingRule`.
   *
   * ⚠️ A NULL EXPRESSION COLUMN BEHAVES DIFFERENTLY ON THIS PATH THAN ON THE ENTITY
   * PATH, AND BOTH BEHAVIOURS ARE LOAD-BEARING. This is the subtlest thing in the
   * file, so it is stated in full rather than left to be rediscovered.
   *
   *   * THIS PATH (query). A CFML query renders SQL `NULL` as the EMPTY STRING, so
   *     the legacy memo stored `''` and `roundValue` received `''`. `listLen('')` is
   *     0, the candidate loop at [L93] never executes even once, `returnValue` is
   *     never assigned, and [L170-L174] returns the input UNCHANGED. The port hands
   *     back a hydrated entity whose accessors report a null column as `undefined`,
   *     so this method converts back to the query-column form with `?? ''`. That is
   *     CFML PARITY, not an invented default - and its outcome is the safe one, a
   *     pass-through.
   *   * THE ENTITY PATH (`roundValueByRoundingRule`). CFML applies a DECLARED DEFAULT
   *     when an argument arrives null, so a null expression there becomes `"0.00"`
   *     and Finding B fires - 12.3456 is cut to 10.00. That method therefore passes
   *     the accessor's `undefined` straight through, and MUST NOT convert it to `''`.
   *
   * Converting either path to the other's form would silently change money in one
   * direction or the other.
   *
   * THE ABSENT RULE THROWS, AND THAT IS THE FAITHFUL OUTCOME. The port returns
   * `undefined` when no row carries the identifier. The legacy query in that case
   * yields ZERO ROWS and [L73-L74] then read columns off an empty result, which CFML
   * refuses at runtime. So an absent rule is an error in the source and it is an
   * error here. Nothing is substituted for it - not an empty object, not a default
   * rule, and above all not a zero, which in a price path would sell product for
   * free. The throw is a plain `Error`: one exported unit per file means no new
   * error class is published from here, and no existing error type in the dependency
   * set describes a missing row.
   *
   * JUDGMENT CALL: the returned details are FROZEN, whereas the legacy body returned
   * the live struct at [L76] and a caller could in principle have mutated the memo
   * through it. Freezing makes the memo uncorruptable from outside, and the
   * difference is unobservable through the public contract: no in-scope caller
   * mutates the result - the sole call site [L80] reads two keys and discards it -
   * so no reachable behaviour depends on the aliasing. It costs no budget of any
   * kind, being neither a signature change nor a behavioural divergence.
   *
   * @param roundingRuleID - Identifier of the rule to resolve. Required in the
   *   legacy signature and required here.
   * @returns The rule's expression and direction, exactly the two keys the legacy
   *   memo stored.
   * @throws Error when no rule carries the identifier, reproducing the legacy
   *   zero-row column read.
   */
  async getRoundingRuleDetailsByID(roundingRuleID: string): Promise<RoundingRuleDetails> {
    // Legacy [model/service/RoundingRuleService.cfc:L68]:
    //   if(!structKeyExists(variables.roundingRuleDetails, arguments.roundingRuleID))
    // A `Map.get` miss and a stored `undefined` are indistinguishable in general,
    // but not here: every value this map ever holds is a frozen two-key object, so
    // `undefined` means "absent" and the existence test and the read collapse into
    // one lookup.
    let details = this.roundingRuleDetails.get(roundingRuleID);

    if (details === undefined) {
      // Legacy [model/service/RoundingRuleService.cfc:L70]:
      //   var detailsQuery = getRoundingRuleDAO().getRoundingRuleQuery(
      //       roundingRuleID = arguments.roundingRuleID);
      const detailsQuery = await this.promotionRepository.getRoundingRuleQuery(roundingRuleID);

      if (isCfmlNull(detailsQuery)) {
        throw new Error(
          `No rounding rule carries the identifier ${JSON.stringify(roundingRuleID)}. ` +
            'The legacy query [model/service/RoundingRuleService.cfc:L70] yields zero rows in ' +
            'this case and [L73-L74] then fail reading columns off the empty result; that ' +
            'failure is reproduced rather than masked with a substituted default.',
        );
      }

      // Legacy [model/service/RoundingRuleService.cfc:L72-L74]: an empty struct is
      // created and exactly two keys are written into it. Both are built here in one
      // frozen literal instead, because a two-step create-then-populate has no
      // purpose once the object is immutable.
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L73-L74]: `?? ''` restores
      // the CFML query-column rendering of a SQL NULL. See the ⚠️ note above - this
      // is what makes a rule with no stored expression a pass-through on this path
      // while it is a `"0.00"` rounding on the entity path.
      details = Object.freeze({
        roundingRuleExpression: detailsQuery.getRoundingRuleExpression() ?? '',
        roundingRuleDirection: detailsQuery.getRoundingRuleDirection() ?? '',
      });

      this.roundingRuleDetails.set(roundingRuleID, details);
    }

    // Legacy [model/service/RoundingRuleService.cfc:L76]:
    //   return variables.roundingRuleDetails[ arguments.roundingRuleID ];
    return details;
  }

  /**
   * Ported 1:1 from `public numeric function roundValueByRoundingRuleID(required any
   * value, required string roundingRuleID)`
   * [model/service/RoundingRuleService.cfc:L79-L82].
   *
   * Resolves the rule by identifier, then rounds. The body is the legacy body: read
   * the details [L80], delegate to `roundValue` with the two resolved arguments
   * [L81].
   *
   * ASYNC BECAUSE THE RESOLUTION REACHES THE DAO, transitively through
   * `getRoundingRuleDetailsByID`. This is the only one of the three rounding entry
   * points that crosses that boundary.
   *
   * EXACTLY ONE LIVE CALL SITE, recorded so nothing here is pruned as dead:
   * [model/service/PromotionService.cfc:L1026], inside
   * `getSalePriceDetailsForProductSkus` [L1022], guarded by
   * `if(priceDetails[key].roundingRuleID != "")` [L1025]. That function in turn is
   * live-called from [model/entity/Product.cfc:L519], inside
   * `getSalePriceDetailsForSkus` [L517]. The chain is real and it is a sale-price
   * path, which is why this method exists at all.
   *
   * `Money` IN AND `Money` OUT, with the string-to-decimal conversion made EXPLICIT.
   * The legacy declaration says `numeric` while the `roundValue` it delegates to
   * declares `string` and returns a decimal string; CFML coerced between the two
   * silently at this boundary. The conversion is a named call here instead.
   *
   * @param value - The amount to round.
   * @param roundingRuleID - Identifier of the rule to apply.
   * @returns The rounded amount.
   * @throws Error when no rule carries the identifier - see
   *   {@link RoundingRuleService.getRoundingRuleDetailsByID}.
   */
  async roundValueByRoundingRuleID(value: Money, roundingRuleID: string): Promise<Money> {
    // Legacy [model/service/RoundingRuleService.cfc:L80]:
    //   var details = getRoundingRuleDetailsByID(arguments.roundingRuleID);
    const details = await this.getRoundingRuleDetailsByID(roundingRuleID);

    // Legacy [model/service/RoundingRuleService.cfc:L81]:
    //   return roundValue(value=arguments.value,
    //       roundingExpression=details.roundingRuleExpression,
    //       roundingDirection=details.roundingRuleDirection);
    return Money.fromDecimalString(
      this.roundValue(value, details.roundingRuleExpression, details.roundingRuleDirection),
    );
  }

  /**
   * Ported 1:1 from `public numeric function roundValueByRoundingRule(required any
   * value, required any roundingRule)`
   * [model/service/RoundingRuleService.cfc:L84-L86].
   *
   * Reads the rule's own expression and direction and rounds by them. A one-line
   * delegation in the source and a one-line delegation here.
   *
   * THIS IS THE METHOD THE MIGRATION EXISTS FOR. Both must-preserve money paths
   * arrive through it:
   *   * [model/service/PromotionService.cfc:L1006], discount calculation - and the
   *     value handed in is the NET amount AFTER discount, with the discount
   *     back-derived at [L1007]. See the ⚠️ direction note in the file header.
   *   * [model/service/PriceGroupService.cfc:L327], price-group rate calculation,
   *     reached indirectly through `RoundingRule.roundValue`
   *     [model/entity/RoundingRule.cfc:L66-L68].
   *
   * SYNCHRONOUS, AND IT MUST STAY THAT WAY. The legacy body performs no DAO access
   * and no ORM access - it reads two already-materialised fields off the entity it
   * was handed - so there is nothing to await. Both consumers call it synchronously:
   * [model/service/PriceGroupService.cfc:L327] sits inside a `switch` and feeds the
   * result to [L339], and the promotion path at
   * [model/service/PromotionService.cfc:L1006] immediately subtracts from the result
   * at [L1007]. Making this async would invent an await point the legacy system does
   * not have and would break both call sites.
   *
   * ⚠️ THE ENTITY'S NULLS PASS STRAIGHT THROUGH, DELIBERATELY.
   * `getRoundingRuleExpression()` and `getRoundingRuleDirection()` each report a
   * null column as `undefined`, and `undefined` is forwarded untouched so that
   * `roundValue`'s declared defaults apply - which is exactly what CFML does when a
   * named argument arrives null. The consequence is that a rule with no stored
   * expression rounds by `"0.00"`, and `"0.00"` is emphatically not a no-op: it cuts
   * 12.3456 to 10.00. Substituting `''` here would suppress the default and silently
   * change the arithmetic. Contrast
   * {@link RoundingRuleService.getRoundingRuleDetailsByID}, where `''` IS the
   * faithful form.
   *
   * `Money` IN AND `Money` OUT. The legacy declaration says `numeric` while
   * `roundValue` declares `string`; the conversion back is an explicit named call.
   *
   * @param value - The amount to round. Forwarded to `roundValue` unchanged, exactly
   *   as `value=arguments.value` does at [L85].
   * @param rule - The rule supplying the expression and direction. Spelled
   *   `roundingRule` at [model/service/RoundingRuleService.cfc:L84].
   * @returns The rounded amount.
   */
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
    // Legacy [model/service/RoundingRuleService.cfc:L85]:
    //   return roundValue(value=arguments.value,
    //       roundingExpression=arguments.roundingRule.getRoundingRuleExpression(),
    //       roundingDirection=arguments.roundingRule.getRoundingRuleDirection());
    return Money.fromDecimalString(
      this.roundValue(value, rule.getRoundingRuleExpression(), rule.getRoundingRuleDirection()),
    );
  }

  /**
   * Ported 1:1 from `public string function roundValue(required any value, string
   * roundingExpression="0.00", string roundingDirection="Closest")`
   * [model/service/RoundingRuleService.cfc:L88-L175].
   *
   * ⚠️ DECIMAL-STRING MANIPULATION, NOT NUMERIC ROUNDING. For each expression in the
   * comma list the algorithm builds TWO candidate numerals by string surgery - one by
   * splicing the expression onto a prefix of the input, one by doing the same to the
   * input stepped up or down by `10^(len(rr)-3)` - and then keeps whichever candidate
   * sits closest to the input in the requested direction. The expression's LENGTH
   * decides both the step size and where the prefix is cut, which is why `'0.99'` and
   * `'.99'` give different answers. Ten measured outputs are pinned in the file
   * header and they are this method's acceptance gate; a mathematically tidier
   * implementation fails it.
   *
   * SYNCHRONOUS AND PURE. No repository, no clock, no environment, no instance state:
   * the result depends on the three arguments and nothing else. Both of its
   * synchronous consumers depend on that -
   * `src/services/priceGroupService.ts` (planned) and
   * `src/services/promotion/discountAmount.ts` (planned) are both specified to call
   * rounding synchronously.
   *
   * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88 vs L79, L84]: `roundValue`
   * declares `returntype="string"` while both of its callers declare `numeric`, and
   * `PriceGroupService` feeds the result straight into `precisionEvaluate`
   * [model/service/PriceGroupService.cfc:L323, L331].
   * Preserved deliberately; do not fix without a product decision. CFML coerced
   * between the two silently and TypeScript cannot, so this method returns a branded
   * `DecimalString` and the two wrappers convert back to `Money` with a named call.
   * The mismatch is in fact four declarations deep - [L66] on the entity and [L79],
   * [L84] here all say `numeric` over the one `string` at [L88]. SECONDARY-register
   * item: not one of the numbered legacy defects, and it consumes none of the
   * migration's three deliberate divergences, because it is resolved by TYPING rather
   * than by changing behaviour.
   *
   * CFML parity [model/service/RoundingRuleService.cfc:L88]: the default
   * `roundingExpression="0.00"` is preserved exactly as declared, AND IT IS NOT A
   * NO-OP - it rounds 12.3456 down to 10.00, a 19% cut. Worth recording precisely how
   * it is reached, so nobody concludes it is unreachable and prunes it: no legacy CALL
   * SITE ever defaults it, because [L81] and [L85] both pass an expression explicitly.
   * The danger arrives through DATA - a `SwRoundingRule` row whose expression column
   * is `NULL`, which CFML turns into a defaulted argument on the entity path. This is
   * Finding B.
   *
   * LEGACY-NOTE [model/entity/RoundingRule.cfc:L54]: no validation of
   * `roundingExpression` exists and NONE IS ADDED - no length check, no regex, no
   * format guard.
   * The column is bare `ormtype="string"` with no length and no format constraint, and
   * although `model/validation/RoundingRule.json` exists it declares no constraint on
   * this field either. Schema continuity forbids adding a rule the legacy lacks, so an
   * expression shorter than three characters produces a fractional step size rather
   * than an error - see {@link powerOfTen}. This is Finding E. A malformed expression
   * that makes a candidate non-numeric still fails, but it fails where CFML fails: the
   * legacy engine refuses the same value at its first numeric use, which is the
   * comparison at [L100] on the main branch and the subtraction at [L123] on the
   * collapse branch. The line the refusal is attributed to may differ by one or two;
   * the outcome - a raised error, never a substituted number - is identical.
   *
   * @param value - The amount to round. Accepts `Money` or an already-branded decimal
   *   numeral, and deliberately NOT a `number`: an IEEE-754 double is how drift enters
   *   a money path, and `Money` publishes no `fromNumber` for the same reason.
   * @param roundingExpression - A CFML comma list of rounding expressions. Defaults to
   *   `'0.00'`, exactly as [L88] declares. An empty list rounds nothing: `listLen('')`
   *   is 0, so the loop never runs and the input is returned unchanged.
   * @param roundingDirection - `'Closest'`, `'Up'` or `'Down'`. Defaults to
   *   `'Closest'`, exactly as [L88] declares. Typed `string` rather than a union
   *   because an unrecognised direction is a reachable live state - see the dispatch
   *   below.
   * @returns The rounded numeral, or the two-decimal input when no candidate was
   *   selected.
   */
  roundValue(
    value: Money | DecimalString,
    roundingExpression: string = '0.00',
    roundingDirection: string = 'Closest',
  ): DecimalString {
    // Legacy [model/service/RoundingRuleService.cfc:L89]:
    //   var inputValue = numberFormat(arguments.value, "0.00");
    //
    // Everything downstream depends on this being exactly two decimal places,
    // because the algorithm measures its LENGTH. `Money` is rendered to a full
    // precision numeral first so that the two-decimal mask is applied to the value
    // itself rather than to a presentation of it; a `DecimalString` argument is
    // already in that form.
    // The mask is passed explicitly rather than defaulted, because [L89] passes it
    // explicitly and because it is the two-decimal width - not the mask's presence -
    // that every length measurement below depends on.
    const inputValue = numberFormat(
      typeof value === 'string' ? value : value.toDecimalString(),
      '0.00',
    );

    // Legacy [model/service/RoundingRuleService.cfc:L90-L91]:
    //   var returnValue = javaCast("null", "");
    //   var returnDelta = javaCast("null", "");
    //
    // ⚠️ DECLARED OUTSIDE THE LOOP, WHICH IS LOAD-BEARING. Both accumulators survive
    // across comma-list iterations, so with `'.95,.99'` the best candidate across
    // BOTH expressions wins rather than the best within the last one. They must not
    // be reset per iteration.
    let returnValue: DecimalString | undefined = undefined;
    let returnDelta: PreciseValue | undefined = undefined;

    // Legacy [model/service/RoundingRuleService.cfc:L93]:
    //   for(var i=1; i<=listLen(arguments.roundingExpression); i++)
    //
    // `listLen` carries CFML's list semantics - consecutive delimiters collapse and
    // an empty list has zero elements - so it is used rather than a hand-rolled
    // `split(',')`. The bound is read once; the legacy engine re-evaluated it each
    // pass, but nothing in the body mutates the expression so the two agree.
    // SECURITY REVIEW DISPOSITION - RAISED AS S-10 (RESOURCE HALF), ACCEPTED. This is the ceiling the
    // grammar-half declination below commits to, and it is checked BEFORE the loop that allocates.
    //
    // The exposure is `powerOfTen(rr.length - 3)` two lines down: the exponent is the LENGTH of a
    // persisted free-text list member, and `powerOfTen` renders `'0'.repeat(exponent)`. So member
    // length drives a string allocation, and member count drives how many times, both from data
    // `SwRoundingRule` accepts without constraint [model/entity/RoundingRule.cfc:L54].
    //
    // WHY A CEILING IS ADMISSIBLE HERE WHEN THE DIRECTION ENUM IS NOT - the distinction the split
    // rests on. An enum would reject PLAUSIBLE data: `'Nearest'` for `'Closest'` is the kind of value
    // a real installation holds, and refusing it would fail price resolution for merchandise that
    // prices today. A ceiling this loose rejects only IMPLAUSIBLE data: the longest expression the
    // AAP measures is `'.95,.99'` - seven characters, two members - and the nine cases in AAP 0.6.4
    // span two to five characters. Nothing a rounding expression could legitimately be comes near
    // these limits, so no row that prices today stops pricing.
    //
    // CHECKED BEFORE `listLen` BELOW: the guard has to precede every list operation on the raw
    // value, not merely the arithmetic, because `listLen` and `listGetAt` traverse it.
    assertRoundingExpressionWithinLimits(roundingExpression);

    const expressionCount = listLen(roundingExpression);

    for (let i = 1; i <= expressionCount; i += 1) {
      // Legacy [model/service/RoundingRuleService.cfc:L94]:
      //   var rr = listGetAt(arguments.roundingExpression, i);
      // 1-BASED, matching the legacy loop counter exactly.
      const rr = listGetAt(roundingExpression, i);

      // Legacy [model/service/RoundingRuleService.cfc:L95]:
      //   var rrPower = 1 * (10 ^ (len(rr)-3));
      const rrPower = powerOfTen(rr.length - 3);

      let valueOptionOne: DecimalString;
      let valueOptionTwo: DecimalString;

      // Legacy [model/service/RoundingRuleService.cfc:L97]:
      //   if(len(inputValue) > len(rr))
      // A STRING-LENGTH comparison, not a value comparison. This is the gate that
      // separates the main branch from the collapse branch below.
      if (inputValue.length > rr.length) {
        // Legacy [model/service/RoundingRuleService.cfc:L98]:
        //   var valueOptionOne = left(inputValue, len(inputValue)-len(rr)) & rr;
        valueOptionOne = toDecimalString(left(inputValue, inputValue.length - rr.length) + rr);

        // Legacy [model/service/RoundingRuleService.cfc:L100]:
        //   if(valueOptionOne > inputValue)
        // CFML compares two numeric-looking strings BY VALUE, so this is a decimal
        // comparison and never a lexical one. Which way it goes decides whether the
        // second candidate is sought below the input or above it.
        if (isGreaterThan(valueOptionOne, inputValue)) {
          // Legacy [model/service/RoundingRuleService.cfc:L101]:
          //   var lowerValue = inputValue - rrPower;
          //
          // SECURITY REVIEW DISPOSITION - PART OF S-03, DECLINED ON A CITED MANDATE.
          //
          // Finding S-03 (CRITICAL, CWE-682/CWE-840) names this file among its three
          // locations and asks for rounding expressions and directions to be
          // validated and negative rounded totals rejected. DECLINED: AAP 0.6.4
          // MEASURED this algorithm by executing it and published NINE verified
          // outputs as the parity contract - including the counter-intuitive ones
          // that only a faithful port produces (12.30 with `.99` yields 12.99;
          // 7.42 with `9.99` yields 9.99; 2.30 with `0.99` yields 0.99; the default
          // `0.00` expression turns 12.3456 into 10.00). AAP 0.9.3 then makes those
          // nine a gate and states the consequence plainly: "A 'corrected' rounding
          // implementation that produces mathematically tidier answers FAILS this
          // gate." Finding A below IS one of those nine outputs, not an accident
          // beside them; Finding D (negative candidates) and Finding E (no
          // expression validation) are likewise recorded AAP findings rather than
          // omissions.
          //
          // WHAT THIS MEANS FOR A CALLER, STATED HERE BECAUSE IT CANNOT BE FIXED
          // HERE. `roundValue` is a faithful reproduction of a legacy algorithm and
          // is NOT a safe money primitive: its result can exceed its input, can be
          // negative, and can move a price by a large fraction. Any consumer that
          // must not inherit that has to establish its own postcondition at its own
          // boundary - this function will not establish one for it, because doing so
          // would break the parity contract above for every existing consumer at
          // once. `tests/unit/services/roundingRuleService.test.ts` states that
          // requirement as an executable invariant rather than leaving it as prose.
          //
          // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: the
          // intermediate is computed ARITHMETICALLY and its `len()` is then taken, and CFML
          // DROPS TRAILING ZEROS when it stringifies a number - so any input whose cents end
          // in zero is sliced one character short and yields a wildly wrong candidate.
          // Preserved deliberately; do not fix without a product decision.
          //
          // The measured case: input `'12.30'` with `rr = '.99'` gives `12.30 - 1` =
          // `11.3`, whose length is 4 rather than 5, so `left(..., 4-3)` is `'1'` and
          // the candidate becomes `'1.99'` instead of `'11.99'`. Its delta balloons
          // from 0.31 to 10.31, so the algorithm selects 12.99 where a correct
          // implementation selects 11.99. Contrast `'12.35'`, which has no trailing
          // zero and rounds correctly. `cfNumberToString` exists to reproduce that
          // stringification and carries the same marker at its own definition; the
          // register entry belongs here, at the algorithm the defect actually
          // corrupts. It is a FINDING against this file rather than a numbered entry
          // in the defect register.
          //
          // The stringified form is what BOTH the `len()` test and the `left()` slice
          // operate on - the two places the defect propagates - so it is computed once.
          const lowerValue = cfNumberToString(subtract(inputValue, rrPower));

          // Legacy [model/service/RoundingRuleService.cfc:L102-L106]:
          //   if(len(lowerValue) > len(rr)) {
          //     var valueOptionTwo = left(lowerValue, len(lowerValue)-len(rr)) & rr;
          //   } else {
          //     var valueOptionTwo = rr;
          //   }
          valueOptionTwo =
            lowerValue.length > rr.length
              ? toDecimalString(left(lowerValue, lowerValue.length - rr.length) + rr)
              : toDecimalString(rr);
        } else {
          // Legacy [model/service/RoundingRuleService.cfc:L108]:
          //   var higherValue = inputValue + rrPower;
          // The second manifestation of Finding A, marked at the `lowerValue` branch
          // above: the same arithmetic-then-`len()` sequence, one line further down.
          const higherValue = cfNumberToString(add(inputValue, rrPower));

          // Legacy [model/service/RoundingRuleService.cfc:L109-L113]:
          //   if(len(higherValue) > len(rr)) {
          //     var valueOptionTwo = left(higherValue, len(higherValue)-len(rr)) & rr;
          //   } else {
          //     var valueOptionTwo = rr;
          //   }
          valueOptionTwo =
            higherValue.length > rr.length
              ? toDecimalString(left(higherValue, higherValue.length - rr.length) + rr)
              : toDecimalString(rr);
        }
      } else {
        // Legacy [model/service/RoundingRuleService.cfc:L115-L118]:
        //   } else {
        //     var valueOptionOne = rr;
        //     var valueOptionTwo = rr;
        //   }
        //
        // FINDING C - THE SHORT-INPUT COLLAPSE. When the input numeral is no longer
        // than the expression, BOTH candidates become the expression itself, so the
        // expression is returned outright however far it sits from the input. Two
        // measured cases, both live money risks: 7.42 with `'9.99'` returns 9.99, a
        // 2.57 increase; 2.30 with `'0.99'` returns 0.99, a 57% cut. Reproduced as
        // written. A consequence worth naming: with both candidates equal, their
        // deltas are equal too, so the tie-break below decides - and option one wins.
        valueOptionOne = toDecimalString(rr);
        valueOptionTwo = toDecimalString(rr);
      }

      // Legacy [model/service/RoundingRuleService.cfc:L120-L121]:
      //   if(valueOptionOne == inputValue || valueOptionTwo == inputValue) {
      //     return inputValue;
      //   }
      //
      // BY DECIMAL VALUE, NEVER BY STRING. CFML's `==` on two numeric strings
      // compares numerically, so `'12.350'` and `'12.35'` are equal - which a string
      // comparison would deny. The early return exits the whole method, abandoning
      // any remaining expressions in the comma list and discarding whatever the
      // accumulators already held; that short-circuit is reproduced exactly.
      if (
        cfNumericEquals(valueOptionOne, inputValue) ||
        cfNumericEquals(valueOptionTwo, inputValue)
      ) {
        return inputValue;
      }

      // Legacy [model/service/RoundingRuleService.cfc:L123-L130]:
      //   var valueOptionOneDelta = inputValue - valueOptionOne;
      //   if(valueOptionOneDelta < 0) { valueOptionOneDelta = valueOptionOneDelta*-1; }
      //   var valueOptionTwoDelta = inputValue - valueOptionTwo;
      //   if(valueOptionTwoDelta < 0) { valueOptionTwoDelta = valueOptionTwoDelta*-1; }
      //
      // The subtraction and the manual sign flip together are absolute value, so
      // `absolute` expresses both - it documents these exact lines as its reason for
      // existing. `Money` publishes neither `negate` nor `abs`, deliberately, so a
      // sign flip is never modelled by negating a monetary value.
      //
      // FINDING D - NEGATIVE INTERMEDIATES ARE LEGAL AND MUST SURVIVE. 0.42 with
      // `'.99'` steps down to -0.58, whose stringified form keeps its leading minus,
      // so the slice produces `'-0'` and the candidate is `'-0.99'`. That numeral is
      // accepted rather than normalised or rejected, and its delta is then taken by
      // magnitude here exactly as the legacy sign flip does.
      const valueOptionOneDelta = absolute(subtract(inputValue, valueOptionOne));
      const valueOptionTwoDelta = absolute(subtract(inputValue, valueOptionTwo));

      // Legacy [model/service/RoundingRuleService.cfc:L132-L166].
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L132]: no default branch; an
      // unrecognised direction returns the input unchanged. `roundingRuleDirection`
      // carries no enumeration constraint anywhere in the schema, so a row holding
      // anything other than the three spellings matches no case, leaves both
      // accumulators untouched, and falls through to [L170-L174] - a reachable, live
      // pass-through. No default clause is added, and the direction parameter is
      // deliberately typed `string` rather than a three-member union so that the state
      // stays representable.
      //
      // ★ OPTION ONE WINS ALL TIES, AND THE TWO CHECKS MUST STAY SEQUENTIAL. Option
      // one is evaluated first and ASSIGNS `returnDelta`, so by the time option two is
      // tested the null test can no longer succeed and option two needs a STRICTLY
      // smaller delta to displace it. That is why both comparisons use `<` and never
      // `<=`, and why they are not collapsed into a single minimum-of-two selection:
      // either change would hand equal-delta cases to option two and alter the
      // measured outputs - the 7.42 / `'9.99'` case in the header is exactly such a
      // tie.
      //
      // CFML parity [model/service/RoundingRuleService.cfc:L138, L149, L160]: the
      // `isNull(returnDelta)` re-test in each SECOND check is dead whenever the first
      // check fired, since that check assigns the accumulator. It is a wart, and it is
      // reproduced verbatim rather than tidied away: in the `Up` and `Down` branches
      // the first check is additionally gated on a direction test, so it can be skipped
      // and the re-test is then genuinely live. Removing it would change those two
      // branches.
      //
      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L132-L166]: THERE IS NO `default:` ARM,
      // and none is added. The legacy `switch` carries exactly the three cases below, so an
      // unrecognised direction matches nothing, leaves both accumulators untouched for this
      // expression member, and falls through to the `return inputValue` at [L170-L174] - a silent
      // pass-through, not an error. `SwRoundingRule.roundingRuleDirection` is bare
      // `ormtype="string"` [model/entity/RoundingRule.cfc:L55] with no check constraint and no
      // constraint in `model/validation/RoundingRule.json`, so that state is not hypothetical: any
      // string at all can already be persisted, including by the legacy admin.
      // Preserved deliberately; do not fix without a product decision.
      //
      // SECURITY REVIEW DISPOSITION - RAISED AS S-10 (GRAMMAR/DIRECTION HALF), DECLINED ON A CITED
      // MANDATE. THE RESOURCE HALF OF THE SAME FINDING IS ACCEPTED, AND THE SPLIT IS DELIBERATE.
      //
      // Raised as finding S-10, LOW, CWE-20 and CWE-400: free-text expression and direction data is
      // persisted and later drives calculation with no grammar, length or list-count bounds. Its
      // required resolution had two parts - "Enforce an approved grammar/direction enum" and
      // "conservative expression/member limits before persistence and calculation".
      //
      // The LIMITS half is ACCEPTED AND DELIVERED, at
      // `assertRoundingExpressionWithinLimits` above - `MAX_ROUNDING_EXPRESSION_MEMBER_LENGTH` and
      // `MAX_ROUNDING_EXPRESSION_MEMBER_COUNT`, both checked before the evaluation loop - because AAP
      // 0.6.5 positively requires resource bounds under the Lambda execution model. The GRAMMAR/ENUM
      // half is declined:
      //
      //   * AAP 0.6.4 Finding E records this exact property as measured legacy behaviour - no
      //     expression validation exists, and `RoundingRule.roundingRuleExpression` is free text with
      //     no format constraint on the entity, so nothing prevents it - and the AAP carries it as a
      //     finding to reproduce, not a gap to close.
      //   * AAP 0.8.1 Schema Continuity forbids adding a constraint the legacy schema lacks. An enum
      //     at this boundary would reject rows `SwRoundingRule` already holds, converting a
      //     data-quality question into a hydration or pricing failure for data the CFML system
      //     accepts and prices today.
      //   * AAP 0.9.3 requires the nine measured `roundValue` cases to pass exactly and states that
      //     a "corrected" rounding implementation producing mathematically tidier answers fails that
      //     gate. Turning an unrecognised direction from a pass-through into a refusal is the same
      //     class of change.
      //
      // Note which way the risk points: refusing an unrecognised direction would be the RISKIER
      // change, not the safer one. Today such a rule prices at the un-rounded input; refusing it
      // would fail the whole price resolution for merchandise that currently prices successfully.
      //
      // Pinned rather than repaired: `tests/unit/services/roundingRuleService.test.ts` drives
      // `outOfVocabularyDirectionRoundingRule` through this dispatch and asserts the two-decimal
      // input comes back unchanged, so the fall-through cannot become a throw unnoticed.
      switch (roundingDirection) {
        // Legacy [model/service/RoundingRuleService.cfc:L133-L143].
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

        // Legacy [model/service/RoundingRuleService.cfc:L144-L154]: a candidate
        // qualifies only if it sits ABOVE the input, so a direction that no candidate
        // satisfies leaves the accumulators untouched for this expression.
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

        // Legacy [model/service/RoundingRuleService.cfc:L155-L165]: the mirror of `Up`
        // - a candidate qualifies only if it sits BELOW the input.
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

    // Legacy [model/service/RoundingRuleService.cfc:L170-L174]:
    //   if(!isNull(returnValue)) {
    //     return returnValue;
    //   } else {
    //     return inputValue;
    //   }
    //
    // Three distinct routes reach the second arm, and all three are live: an empty or
    // whitespace-only expression list, so the loop never ran; an unrecognised
    // direction, so no case matched; and a direction no candidate satisfied, such as
    // `'Up'` when both candidates fell below the input. In every one of them the
    // two-decimal input is returned untouched - never a zero, and never a substituted
    // default.
    if (!isCfmlNull(returnValue)) {
      return returnValue;
    }
    return inputValue;
  }
}
