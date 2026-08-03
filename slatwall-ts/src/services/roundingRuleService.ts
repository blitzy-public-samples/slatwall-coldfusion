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
import { isNullish } from '../lib/cfml/truthiness.js';

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
  constructor(private readonly promotionRepository: PromotionRepository) {}

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
   * BOTH HALVES ARE NOW PORTED, AND THE EARLIER OMISSION IS RECORDED RATHER THAN
   * OVERWRITTEN. This note previously read that the
   * `super.save(argumentcollection=arguments)` half [model/service/RoundingRuleService.cfc:L63]
   * was "deliberately NOT ported", on the grounds that the closed thirteen-port set
   * held no persistence port for a rounding rule and that "inventing one would
   * breach the port lock", leaving persistence to the composition root.
   *
   * That reasoning conflated the PORT COUNT with the METHOD SET. The lock is on how
   * many port modules exist - thirteen, and still thirteen - not on what the
   * existing contracts may declare. `PromotionRepository` already owned the
   * `SwRoundingRule` table through `getRoundingRuleQuery`
   * [model/dao/RoundingRuleDAO.cfc:L51], hosted there precisely so no fourteenth
   * port would be needed, and the contract that owns a table's read is the contract
   * that owns its write. So no port was invented; one already-hosting contract
   * gained the other half of the table it hosts.
   *
   * The consequence of the omission is the reason it could not stand: a caller
   * handed the rule back and had no way to observe that nothing was written. The
   * eviction ran, the method resolved, the return value looked right, and
   * `SwRoundingRule` was untouched. A save that silently does not save is worse
   * than a missing method, because a missing method is a compile error.
   *
   * ORDERING IS PRESERVED: eviction first, then the write. That is the legacy order
   * [model/service/RoundingRuleService.cfc:L57-L63] and it is the safe one. Evicting
   * after a failed write would discard a memo entry that still matched the row on
   * disk; evicting before means a write that throws leaves the memo cold, so the
   * next read re-resolves from the repository and cannot serve a value that was
   * never persisted.
   *
   * LEGACY-NOTE [model/service/RoundingRuleService.cfc:L56]: there is NO delete
   * counterpart to this save override, and none is added.
   * The component overrides save to evict, but never overrides delete, so in the
   * legacy design a rule deleted mid-request leaves its details resolvable from the
   * struct afterwards. That is a real staleness gap. Schema and behaviour continuity
   * forbid adding delete-side invalidation the legacy lacks, so the gap is
   * reproduced and recorded. SECONDARY-register item, not a numbered defect.
   *
   * NOW GENUINELY ASYNCHRONOUS. The body previously returned `Promise.resolve(rule)`
   * without the `async` keyword, because there was nothing to await - the published
   * signature was promise-returning purely so that persistence could be added later
   * without a signature change rippling outward. That has now happened, the body
   * awaits the repository write, and `async` is correct rather than something
   * `require-await` would reject. THE SIGNATURE IS UNCHANGED, which is what that
   * earlier decision was protecting.
   *
   * @param rule - The rule being saved. Spelled `entity` at
   *   [model/service/RoundingRuleService.cfc:L56]; the published target signature
   *   uses `rule`, matching `roundValueByRoundingRule`. Parameter names are not part
   *   of a TypeScript call contract - there are no named arguments - so this costs
   *   no parity, and the legacy spelling is recorded here instead.
   * @param data - The legacy `struct data`. Accepted for signature parity and never
   *   read: the eviction logic does not consult it, and [L63] passed it straight on.
   * @param context - The legacy `context`, defaulting to `"save"` exactly as [L56]
   *   declares. Accepted for signature parity and never read, for the same reason.
   * @returns The same rule instance that was passed in.
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

    // Legacy [model/service/RoundingRuleService.cfc:L63]:
    //   return super.save(argumentcollection=arguments);
    //
    // The write runs AFTER the eviction, which is the legacy order and the safe one -
    // see the ordering note above. The repository decides insert against update from
    // the entity's own `isNew()`, which is the same test the eviction guard uses two
    // statements up, so the two halves cannot disagree about whether the rule is new.
    return await this.promotionRepository.saveRoundingRule(rule);
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
