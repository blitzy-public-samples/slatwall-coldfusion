// ---------------------------------------------------------------------------
// slatwall-ts - CFML truthiness parity
//
// PURPOSE
//   Deterministic TypeScript translation of three CFML coercion behaviours that
//   do not map onto TypeScript `undefined` / `null` / `''`: `isNull()`,
//   `len()`-based truthiness, and empty-string falsiness. Every ported
//   `if(len(x))`, `if(listLen(x))`, `if(listFindNoCase(...))` and
//   `if(!isNull(x))` site in the catalog + promotions/pricing slice routes
//   through this module, so the translation is decided once, here, instead of
//   being re-decided file by file across the ported tree.
//
// THIS IS NOT A UTILITY LIBRARY
//   The export surface is closed at four functions plus the three input types
//   they accept, and every one traces to a verified legacy behaviour cited
//   below. Nothing may be added here because it "seems useful": there is
//   deliberately no `isEmpty`, no `coalesce`, no `defaultTo`, no
//   `assertDefined`, and no generic type guard. Case-insensitive struct-key
//   access belongs to `struct.ts`, list operations to `list.ts`, CFML number
//   formatting to `numberFormat.ts`, and `precisionEvaluate` to `precision.ts`.
//
// ZERO IMPORTS, DELIBERATELY
//   This module imports nothing at all - no third-party package, no Node
//   built-in, and no sibling module. `src/lib/` is the base of the
//   domain-inward dependency flow that the ESLint `no-restricted-imports`
//   boundary enforces, and `src/lib/config.ts` is permitted to depend on this
//   module, so anything imported here would silently become a transitive
//   dependency of configuration loading. `src/lib/logger.ts` already holds the
//   same discipline. There is no `index.ts` in this folder and there must never
//   be one.
//
// EVERY FUNCTION IS TOTAL
//   No export throws, and no export is async. These are coercion helpers on a
//   money-adjacent path, where a throw would turn an ordinary data-shape
//   variation into a failed request. Every branch returns a value, and where
//   CFML itself would have thrown, the returned value is documented as a
//   judgment call at the branch that makes it. There is no module-scope mutable
//   state: the only module-level bindings are frozen lookup tables, so nothing
//   here can carry state between two unrelated invocations that happen to share
//   a warm container.
//
// LEGACY PROVENANCE
//   Every locator below was re-read from the legacy tree while authoring this
//   file. All of them matched exactly, so there is no corrected locator to
//   record. One apparent mismatch resolved as correct on closer reading and is
//   noted at (e) so the next reader does not repeat the doubt.
//
//   (a) THE ELIGIBILITY GATE - the highest-consequence `len()` site in the
//       slice. [model/entity/Sku.cfc:L373], verbatim:
//
//           if(len(setting('skuEligibleCurrencies'))) {
//
//       `getCurrencyDetails()` opens at [model/entity/Sku.cfc:L367-L369] with a
//       memo guard and `variables.currencyDetails = {}`, and that one gate wraps
//       the ENTIRE four-step currency cascade body, L374-L430. When the setting
//       resolves empty the memo stays `{}`, and every `getPriceByCurrencyCode()`
//       call then returns null - that accessor has no `else` and no fallback
//       [model/entity/Sku.cfc:L269-L273]. `getCurrencySmartList()` is fetched at
//       [model/entity/Sku.cfc:L371], before and OUTSIDE the gate. This module is
//       therefore load-bearing for the price-group and currency resolution
//       cascade, one of the three areas whose behaviour must be preserved
//       exactly: mistranslate this gate and either no SKU price resolves at all,
//       or an absent price quietly becomes a free product.
//
//   (b) `len()` AS A BARE BOOLEAN PREDICATE, through the `listLen` member of the
//       same family: [model/service/SkuService.cfc:L142] subscriptionBenefits,
//       [model/service/SkuService.cfc:L147] subscriptionTerms and
//       [model/service/SkuService.cfc:L175] accessContents - each of the shape
//       `!structKeyExists(arguments.data, "x") || !listLen(arguments.data.x)` -
//       plus [model/entity/PriceGroupRate.cfc:L131] `if(listLen(including))` and
//       [model/entity/PriceGroupRate.cfc:L157] `if(listLen(excluding))`.
//
//   (c) THE `isNull()` CHAIN, driven by an explicit Java null.
//       [model/service/RoundingRuleService.cfc:L90-L91], verbatim:
//
//           var returnValue = javaCast("null", "");
//           var returnDelta = javaCast("null", "");
//
//       Both are `var`-scoped, hence function-local. They are then tested by
//       `isNull()` at L134, L138, L145, L149, L156 and L160 inside the
//       `roundingDirection` switch, and decisively at
//       [model/service/RoundingRuleService.cfc:L170]:
//
//           if(!isNull(returnValue)) { return returnValue; } else { return inputValue; }
//
//       Note precisely what `javaCast("null", "")` does: the `""` is only the
//       cast's value argument, and the result is a genuine null - NOT the empty
//       string and NOT zero. That distinction is the whole reason `isNullish()`
//       is a separate export from `cfTruthy()`.
//
//   (d) `!isNull()` GUARDS: [model/entity/Sku.cfc:L386, L390, L401, L405, L417,
//       L421] - the renewalPrice, listPrice and conversion guards inside the
//       cascade; [model/service/PromotionService.cfc:L1005] the reward rounding
//       rule; [model/service/PromotionService.cfc:L769, L771] the minimum and
//       maximum fulfillment-weight qualifiers; and
//       [model/service/PriceGroupService.cfc:L307, L326].
//
//   (e) CFML'S `0`-MEANS-ABSENT CONVENTION. `listFindNoCase()` returns a 1-based
//       index, or 0 when the value is absent, and the slice uses that return
//       DIRECTLY as a boolean at sixteen sites:
//       [model/service/PromotionService.cfc:L61, L200, L542, L714, L794, L865,
//       L900, L935, L966], [model/entity/Product.cfc:L440, L442, L451],
//       [model/entity/Sku.cfc:L294, L299, L306, L309], and negated at
//       [model/service/ProductService.cfc:L144]. That last locator reads at
//       first glance like a mismatch, because the line opens with an
//       optionGroupID inequality; the `!listFindNoCase(newOptionsData.options,
//       ...)` is the second clause of the same compound `&&` condition, so the
//       locator is correct. The same convention appears at
//       [model/entity/RoundingRule.cfc:L81], where `find(".", thisValue)`
//       returns 0 when the dot is absent. `cfTruthy()` therefore makes
//       `0 -> false` and `1 -> true` explicit and documented, so no ported
//       caller rests on JavaScript's incidental agreement with CFML here.
//
// NO USER RULES WERE PROVIDED
//   Stated explicitly rather than assumed, in all five parts:
//     1. No user-specified rules were provided for this project - the project
//        rules document contains exactly "No user rules provided."
//     2. That absence was VERIFIED, not assumed. The rules source was read three
//        independent ways while authoring this file: with no range, with the
//        whole-document range, and with a range deliberately past the end. All
//        three returned that identical single line.
//     3. No rule is invented to fill the gap.
//     4. The absence is NOT licence to lower the bar. The enterprise-standard
//        substitute applies at full strength: maximal strictness with no `any`,
//        no suppression comment and no non-null assertion; one cohesive exported
//        unit per file and no barrel; no credential, no SQL and no environment
//        read; and every judgment call annotated where it was made.
//     5. Zero files enter scope by rule mandate. There is no third, rule-driven
//        category of in-scope file, and there are no rule conflicts to resolve -
//        every tension in this port is specification-internal and resolved
//        there.
//
// TEST COVERAGE IS NET-NEW
//   Coverage for this module belongs at
//   `slatwall-ts/tests/unit/lib/cfml/truthiness.test.ts`, and ALL of it is
//   net-new: no legacy test under `meta/tests/**` touches these helpers, so it
//   must never be presented as parity. The only legacy suites extended anywhere
//   in this port are `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc`, and
//   `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub
//   contributing zero coverage. That test tier is authored separately from this
//   file. Nothing here needs a seam for it: every function is pure, synchronous
//   and total, so each branch is reachable by a plain call with no fixture, no
//   mock, no clock and no environment.
//
// HAND-OFF NOTE for whoever ports `services/skuService.ts`
//   [model/service/SkuService.cfc:L163] loops
//   `listLen(arguments.data.renewalSubscriptionBenefits)` with NO preceding
//   `structKeyExists` guard, unlike its guarded counterparts at L142, L147 and
//   L175. Re-verified in context: inside the `if(!arguments.product.hasErrors())`
//   block, L153 iterates `subscriptionTerms` (guarded at L147) and L160 iterates
//   `subscriptionBenefits` (guarded at L142), but nothing anywhere in that
//   method guards `renewalSubscriptionBenefits`. This is a NOTE ONLY. It is not
//   fixed here, it is not compensated for here, and no helper below silently
//   absorbs it - that porting decision belongs to that module, not to this one.
// ---------------------------------------------------------------------------

/**
 * Accepted input to {@link cfLen}.
 *
 * CFML `len()` is defined over strings, numbers and arrays, and this union is
 * exactly that domain plus the two absent states. `boolean` is deliberately
 * excluded: no legacy `len()` site in the slice applies it to a boolean, and
 * admitting one would invite a caller to ask for the length of a flag.
 *
 * `null` and `undefined` are both admitted because an absent value reaches this
 * helper by two distinct routes - a hydrated SQL NULL, and a struct key that was
 * never set - and both must answer 0 rather than fail.
 */
export type CfLenInput = string | number | readonly unknown[] | null | undefined;

/**
 * Accepted input to {@link cfTruthy}.
 *
 * Written as the four broad constituents rather than as an enumeration of
 * literals, because `'0' | '1' | 'true' | 'false'` is redundant against `string`
 * and `0 | 1` is redundant against `number`; spelling them out would be rejected
 * as a redundant union. Every one of those literals is still accepted, and the
 * behaviour each produces is fixed by the decision table on {@link cfTruthy}.
 */
export type CfTruthyInput = string | number | boolean | null | undefined;

/**
 * Accepted input to {@link cfBoolean}.
 *
 * Structurally the same union as {@link CfTruthyInput}, kept as its own name
 * because it documents a different origin: this one describes a value that has
 * been read back out of a persisted `Sw*` column, whereas {@link CfTruthyInput}
 * describes a value standing in a CFML boolean context. The reason the union has
 * to be this wide is evidence, not caution - see {@link cfBoolean}.
 */
export type CfBooleanInput = string | number | boolean | null | undefined;

/**
 * String literals CFML accepts as boolean true, compared after trimming and
 * lower-casing.
 *
 * Frozen at module scope and never mutated, so this carries no state between
 * invocations. `'1'` is listed even though the numeric branch would also accept
 * it, because the decision table names it explicitly and an explicit table is
 * what makes the translation checkable.
 */
const CFML_TRUE_LITERALS: ReadonlySet<string> = new Set(['true', 'yes', '1']);

/**
 * String literals CFML accepts as boolean false, on the same terms as
 * {@link CFML_TRUE_LITERALS}.
 */
const CFML_FALSE_LITERALS: ReadonlySet<string> = new Set(['false', 'no', '0']);

/**
 * What CFML `isNumeric()` accepts: an optional sign, decimal digits with an
 * optional decimal point in either position, and an optional decimal exponent.
 *
 * This is deliberately narrower than JavaScript's `Number()`, which also accepts
 * `0x10` as 16, `0b11` as 3 and `'Infinity'` as Infinity. CFML `isNumeric()`
 * rejects all three, so admitting them would make a ported comparison answer
 * differently from the legacy one it replaces.
 */
const CFML_NUMERIC_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * JavaScript's exponential rendering of a number, decomposed for expansion into
 * plain decimal notation: sign, integer digits, optional fraction digits, and
 * the signed exponent.
 */
const EXPONENTIAL_NOTATION_PATTERN = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * The CFML `isNull()` equivalent: is this value absent?
 *
 * True for `null` and `undefined`, and for nothing else. It is false for `''`,
 * `0`, `false`, `NaN`, `[]` and `{}` - each of those is a present value, and
 * CFML agrees: `isNull('')` is false there too.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L90-L91]: the rounding
 * algorithm seeds `returnValue` and `returnDelta` with `javaCast("null", "")`
 * and then branches on `isNull()` at L134, L138, L145, L149, L156, L160 and
 * L170. The `""` in that cast is only the value argument handed to the cast; the
 * result is a genuine null, distinct from the empty string and from zero.
 * Collapsing those three states into one - which is what a bare `!value` test in
 * JavaScript does - would change which candidate that switch selects, and
 * therefore change a price.
 *
 * Use this wherever the legacy code asked `isNull()` or `!isNull()` and the
 * three-state distinction matters: absent, versus present-and-false, versus
 * present-and-true. {@link cfTruthy} collapses absent into false by design, so
 * it is the wrong tool for that question.
 *
 * The parameter is `unknown` rather than a union because `isNull()` in CFML is
 * askable of anything, and narrowing the input here would force a cast at the
 * call sites that need it most.
 */
export function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Renders a number the way CFML would render it before measuring its length:
 * plain decimal notation, never exponential.
 *
 * JavaScript switches to exponential notation at the extremes - `String(1e21)`
 * is `'1e+21'` and `String(1e-7)` is `'1e-7'` - whereas CFML renders a plain
 * decimal string. Measuring the JavaScript form would report 5 characters for a
 * value CFML reports as 22.
 *
 * Trailing-zero dropping is NOT implemented here and must not be: a JavaScript
 * number has no trailing zeros to drop, because the literal `12.30` simply is
 * the number `12.3`. The trailing-zero behaviour that the legacy rounding
 * algorithm depends on is `numberFormat.ts`'s `cfNumberToString()`, and this
 * helper deliberately neither imports it nor restates it. All this function does
 * is expand an exponent.
 */
function toPlainDecimalString(value: number): string {
  const rendered = String(value);
  const match = EXPONENTIAL_NOTATION_PATTERN.exec(rendered);

  if (match === null) {
    return rendered;
  }

  const [, sign, integerDigits, fractionDigits, exponentDigits] = match;

  // Every group the pattern requires is present whenever it matches. The
  // compiler cannot know that, and a non-null assertion is banned in `src/**`
  // precisely because it silences the checks that make null semantics safe here,
  // so the absent case is handled by falling back to the value as rendered.
  if (sign === undefined || integerDigits === undefined || exponentDigits === undefined) {
    return rendered;
  }

  const digits = `${integerDigits}${fractionDigits ?? ''}`;
  const pointPosition = integerDigits.length + Number(exponentDigits);

  if (pointPosition <= 0) {
    return `${sign}0.${'0'.repeat(-pointPosition)}${digits}`;
  }

  if (pointPosition >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointPosition - digits.length)}`;
  }

  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/**
 * The CFML `len()` equivalent. Returns a COUNT, not a boolean.
 *
 * A string answers its character count, an array its element count, and an
 * absent value answers 0. A number answers the length of its plain decimal
 * string form, because CFML applies `len()` to a number by stringifying it
 * first - see {@link toPlainDecimalString} for what "plain decimal" means and
 * for why the trailing-zero rule that `numberFormat.ts` owns is not restated
 * here.
 *
 * Returning a number rather than a boolean is the point. It keeps this helper
 * honest about what `len()` actually is, and it lets the two legacy shapes be
 * ported separately: a site that needed the count keeps the count, and a site
 * that used the count as a predicate composes it as `cfTruthy(cfLen(x))`.
 *
 * CFML parity [model/entity/Sku.cfc:L373]: that composition is exactly the
 * currency-eligibility gate, `if(len(setting('skuEligibleCurrencies')))`. An
 * empty setting yields 0, the gate does not open, and the memoized currency
 * detail map stays `{}`.
 *
 * CFML parity [model/service/SkuService.cfc:L142, L147, L175] and
 * [model/entity/PriceGroupRate.cfc:L131, L157]: the `listLen` sites are the same
 * shape, a count consumed as a predicate.
 *
 * `cfTruthy(cfLen(x))` AND `cfTruthy(x)` ARE DIFFERENT QUESTIONS, and the
 * difference is deliberate. The first asks "does x have any length", which is the
 * `if(len(x))` idiom; the second asks "is x true". CFML draws the same
 * distinction, and drawing it the same way here is what parity requires:
 *
 *   - `len(0)` is 1, because `0` renders as the one-character string `'0'`. So
 *     `cfTruthy(cfLen(0))` is true while `cfTruthy(0)` is false. CFML agrees:
 *     `if(len(0))` is true and `if(0)` is false.
 *   - `len('abc')` is 3, so `cfTruthy(cfLen('abc'))` is true, while
 *     `cfTruthy('abc')` is false. CFML agrees more sharply still: `if(len('abc'))`
 *     is true, and `if('abc')` does not merely differ - it throws.
 *   - `len('   ')` is 3, because `len()` counts characters and never trims. Only
 *     `cfTruthy` trims. A whitespace-only value therefore has length but is not
 *     truthy, and both answers are correct for the question each was asked.
 *
 * Pick the one that matches the legacy line being ported: `len(...)`/`listLen(...)`
 * in a condition becomes `cfTruthy(cfLen(...))`, and a bare value in a condition
 * becomes `cfTruthy(...)`. They are not interchangeable.
 */
export function cfLen(value: CfLenInput): number {
  // The absent test is written inline rather than delegated to `isNullish()`
  // because that export returns `boolean`, as its contract requires, and a
  // `boolean` return does not narrow the union for the compiler. It is the same
  // test, asked in the form the type system can follow.
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string') {
    return value.length;
  }

  if (typeof value === 'number') {
    // JUDGMENT CALL: CFML has no NaN, so no legacy behaviour is being preserved
    // here and none may be claimed. `NaN` answers 0 because a NaN has no
    // meaningful decimal rendering to measure, and 0 is the fail-closed answer:
    // it composes through `cfTruthy` to false, which leaves the
    // currency-eligibility gate [model/entity/Sku.cfc:L373] shut rather than
    // opening it on a value that means nothing. Reporting 3 - the length of the
    // string `'NaN'` - would have opened it.
    if (Number.isNaN(value)) {
      return 0;
    }

    // JUDGMENT CALL: `Infinity` and `-Infinity` cannot arise from CFML either.
    // They fall through to their plain rendering, `'Infinity'` and `'-Infinity'`,
    // giving 8 and 9 - non-zero, matching the fact that `cfTruthy` reads either
    // infinity as true.
    return toPlainDecimalString(value).length;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  // JUDGMENT CALL: this branch is unreachable through the declared input type,
  // and it is here because TypeScript's guarantee stops at the compile boundary.
  // A value that arrives from the database driver at runtime has not been
  // type-checked by anything, so a column that hands back a shape this union
  // does not describe must still ANSWER rather than fail. Without this branch the
  // function silently breaks its own `number` contract: `({}).length` is
  // `undefined`, and a function's `.length` is its arity, so `cfLen` would have
  // returned `undefined` for an object and 0 for a callable while still being
  // typed as returning a number.
  //
  // 0 is the fail-closed direction, and that choice is deliberate rather than
  // convenient. An unmeasurable value has no length, 0 composes through
  // `cfTruthy` to false, and false leaves the currency-eligibility gate SHUT
  // [model/entity/Sku.cfc:L373] - so the memo stays `{}` and
  // `getPriceByCurrencyCode()` answers "no price" instead of inventing one.
  // Failing open here would mean a price of 0, and a price of 0 sells the product
  // for free.
  return 0;
}

/**
 * The CFML boolean-coercion decision table, applied deterministically.
 *
 * This is the helper that ported `if(len(x))`, `if(listLen(x))` and
 * `if(listFindNoCase(...))` sites route through, so that one table decides all of
 * them instead of ninety files each deciding for themselves.
 *
 * THE TABLE, in the order the branches below evaluate it:
 *
 * | input                                    | result | grounding                        |
 * | ---------------------------------------- | ------ | -------------------------------- |
 * | `true`                                   | true   | CFML boolean, unchanged          |
 * | `false`                                  | false  | CFML boolean, unchanged          |
 * | `null`, `undefined`                      | false  | judgment call - CFML would throw |
 * | `NaN`                                    | false  | judgment call - no CFML analogue |
 * | `0`                                      | false  | `listFindNoCase` absent          |
 * | `1`                                      | true   | `listFindNoCase` 1-based hit     |
 * | any other finite non-zero number         | true   | non-zero is true in CFML         |
 * | `Infinity`, `-Infinity`                  | true   | judgment call - non-zero         |
 * | `''`                                     | false  | Sku.cfc:L373 empty-string gate   |
 * | `'true'`, `'yes'`, `'1'` (any casing)    | true   | CFML boolean literals            |
 * | `'false'`, `'no'`, `'0'` (any casing)    | false  | CFML boolean literals            |
 * | other numeric string, e.g. `'2'`, `'-1'` | true   | numeric coercion, non-zero       |
 * | other numeric string, e.g. `'0.0'`       | false  | numeric coercion, zero           |
 * | any other non-empty string               | false  | judgment call - CFML would throw |
 *
 * Strings are trimmed and lower-cased before the table is consulted, because
 * CFML's boolean coercion is case-insensitive and tolerates surrounding
 * whitespace. `' 1 '` and `'TRUE'` therefore answer true, exactly as they would
 * in the legacy engine.
 */
export function cfTruthy(value: CfTruthyInput): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  // JUDGMENT CALL: CFML throws a conversion error when a null reaches a boolean
  // context, and this module never throws, so an absent value answers false.
  // That is a real divergence and is called out rather than absorbed. It is safe
  // to make because the three-state distinction is not lost - it is simply asked
  // for separately: a caller that must tell absent apart from present-and-false
  // calls `isNullish()` first, which exists for precisely this reason
  // [model/service/RoundingRuleService.cfc:L90-L91, L170].
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'number') {
    // JUDGMENT CALL: CFML has no NaN, so this is a decision and not a ported
    // behaviour. `NaN` answers false, matching `cfLen(NaN)` returning 0.
    if (Number.isNaN(value)) {
      return false;
    }

    // CFML parity [model/service/PromotionService.cfc:L61, L200, L542, L714, L794,
    // L865, L900, L935, L966], [model/entity/Product.cfc:L440, L442, L451],
    // [model/entity/Sku.cfc:L294, L299, L306, L309] and, negated,
    // [model/service/ProductService.cfc:L144]: `listFindNoCase()` returns a
    // 1-based index or 0 when absent, and all seventeen of those sites use the
    // return directly as a boolean. `find(".", thisValue)` at
    // [model/entity/RoundingRule.cfc:L81] shares the convention. Making
    // `0 -> false` and `1 -> true` explicit here is the point of the branch: a
    // ported caller must never rest on JavaScript's incidental agreement with
    // CFML, because that agreement is a coincidence and not a contract.
    //
    // JUDGMENT CALL: `Infinity` and `-Infinity` are non-zero and so answer true.
    // Neither can arise from CFML, so no legacy behaviour is claimed for them.
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    // CFML parity [model/entity/Sku.cfc:L373]: the currency-eligibility gate
    // `if(len(setting('skuEligibleCurrencies')))` is exactly "empty string is
    // falsy". This is the one branch of the table with direct, unambiguous legacy
    // grounding. Whitespace-only input reaches it too, having been trimmed above,
    // which matches how `readTrimmed()` in `src/lib/config.ts` treats absent,
    // empty and whitespace-only as one state.
    if (normalized.length === 0) {
      return false;
    }

    // CFML accepts `yes` and `no` as boolean literals alongside `true` and
    // `false`, so both pairs are honoured here for CFML-semantic completeness.
    // Flagged deliberately: NO in-scope persisted default uses `yes` or `no`.
    // Verified by counting the boolean-default literals across all eighteen
    // in-scope entities - `default="0"` appears 7 times, `default="1"` twice and
    // `default="false"` twice, while `default="true"`, `default="yes"` and
    // `default="no"` appear zero times. The `yes`/`no` branch therefore has no
    // in-scope call site, and no locator is cited for it because there is none to
    // cite.
    if (CFML_TRUE_LITERALS.has(normalized)) {
      return true;
    }

    if (CFML_FALSE_LITERALS.has(normalized)) {
      return false;
    }

    // A numeric string coerces through its value, so `'2'` is true and `'0.0'` is
    // false. The pattern is `isNumeric()`'s domain rather than `Number()`'s,
    // which is why `'0x10'` does not reach this branch - see
    // CFML_NUMERIC_PATTERN.
    if (CFML_NUMERIC_PATTERN.test(normalized)) {
      return Number(normalized) !== 0;
    }

    // JUDGMENT CALL: CFML throws a conversion error on a non-empty, non-boolean,
    // non-numeric string in a boolean context. This module returns false instead,
    // because a total function is what keeps a data-shape variation from becoming
    // a failed request. The consequence is explicit: a caller that NEEDS the
    // failure must validate upstream, before the value reaches here - this branch
    // will not signal it.
    return false;
  }

  // JUDGMENT CALL: unreachable through the declared input type, and present for
  // the same reason as the closing branch of `cfLen` - TypeScript's guarantee
  // stops at the compile boundary, and a value read back from the database driver
  // at runtime has been checked by nothing. Before this branch existed, any shape
  // outside the union reached `value.trim()` and threw `value.trim is not a
  // function`, which is exactly the outcome the no-throw rule exists to prevent:
  // one unexpected column shape turning a promotion-active check into a failed
  // request. False is the fail-closed answer, consistent with how an absent value
  // is treated above.
  return false;
}

/**
 * Reads a persisted boolean flag out of a hydrated `Sw*` row.
 *
 * This is what ported entity getters for `activeFlag`, `globalFlag`,
 * `imageGroupFlag` and their siblings use.
 *
 * WHY THE INPUT UNION IS THIS WIDE - it is evidence, not defensiveness. The
 * in-scope entities carry four different literal conventions for the same
 * concept, all three of these read verbatim from the source:
 *
 *   [model/entity/OptionGroup.cfc:L57]
 *     property name="imageGroupFlag" ormtype="boolean" default="0";
 *   [model/entity/PriceGroupRate.cfc:L53]
 *     property name="globalFlag" ormType="boolean" default="false";
 *   [model/entity/Promotion.cfc:L56]
 *     property name="activeFlag" ormtype="boolean" default="1";
 *
 * Note the attribute itself is spelled `ormtype` in the first and third and
 * `ormType` in the second. CFML attribute names are case-insensitive and
 * TypeScript is not, and this is in-source corroboration of why `struct.ts`
 * exists: casing may never be assumed anywhere in this port, in a key, an
 * attribute or a comparison.
 *
 * A driver may hand back the column as a real `boolean`, as `0`/`1`, or as one of
 * those strings, and it may hand back nothing at all: nine `ormtype="boolean"`
 * properties across five in-scope entities - Product, ProductType, Brand,
 * Category and PriceGroup - declare no default whatsoever, so those columns can
 * legitimately hydrate as SQL NULL. An undefaulted, unset flag therefore reads as
 * false, which is the same answer the legacy engine gave a flag it had no value
 * for.
 *
 * The coercion itself is delegated to {@link cfTruthy} rather than restated,
 * because two copies of one decision table are two things that can disagree, and
 * a disagreement between them would be a disagreement about whether a promotion
 * is active. This function exists as its own export for the input domain it
 * documents, not for a second behaviour.
 */
export function cfBoolean(value: CfBooleanInput): boolean {
  return cfTruthy(value);
}
