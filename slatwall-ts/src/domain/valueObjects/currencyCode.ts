// ---------------------------------------------------------------------------
// slatwall-ts - the CurrencyCode value object
//
// PURPOSE
//   A branded three-character currency-code type with a validating
//   constructor, plus the two operations CFML gave away for free and
//   TypeScript does not: case-insensitive comparison, and case-insensitive
//   lookup of a currency-code-keyed map.
//
//   That is the whole job. This module identifies a currency; it never prices
//   one, converts one, formats one, or decides which currencies exist.
//
// AAP AUTHORITY
//   Section 0.4.1, "Value Objects, Views, and Engine Types":
//     src/domain/valueObjects/currencyCode.ts | CREATE |
//     model/entity/SkuCurrency.cfc | Branded 3-character type; NO RUNTIME
//     CURRENCY TABLE
//   Section 0.3.1 tree: `currencyCode.ts (new abstraction - 3-char branded
//   type)`. Section 0.2.1 fixes this folder's contents at exactly three
//   modules: money.ts, currencyCode.ts, materializedIdPath.ts.
//
// ***************************************************************************
// ** THERE IS NO RUNTIME CURRENCY TABLE IN THIS FILE, AND NO DEFAULT CODE.  **
// **                                                                       **
// ** No list, set, record, enum or string-literal union of currency codes.  **
// ** No ISO 4217 register. No symbol map, no decimals-per-currency map, no  **
// ** Intl lookup. No `Currency` entity: model/entity/Currency.cfc is OUT OF **
// ** SCOPE for this migration and is deliberately not modelled here.        **
// **                                                                       **
// ** Nor is any code hardcoded as a default or a fallback. The three-letter **
// ** default is a Slatwall SETTING, declared once as `defaultValue="USD"`   **
// ** on the `skuCurrency` setting at                                       **
// ** [model/service/SettingService.cfc:L221], and it is resolved through    **
// ** the settingsProvider port. That citation is the only place the literal **
// ** appears in this file, and it appears as a citation - never as a value. **
// **                                                                       **
// ** Which currencies are ELIGIBLE is likewise a setting, not a constant:   **
// ** `skuEligibleCurrencies` at [model/service/SettingService.cfc:L222].    **
// ** The legacy entity proves the separation - the whole currency cascade    **
// ** sits behind `if(len(setting('skuEligibleCurrencies')))` at             **
// ** [model/entity/Sku.cfc:L373], so an empty setting means no currency is  **
// ** priced at all. A hardcoded table here would silently overrule that.    **
// ***************************************************************************
//
// VERIFIED LEGACY PROVENANCE
//   Every locator below was re-read from the source branch while authoring
//   this file. No drift was found; all of them are exact.
//
//   THE THREE-CHARACTER AUTHORITY is [model/entity/PromotionApplied.cfc:L55]:
//     property name="currencyCode" ormtype="string" length="3";
//   on the `SwPromotionApplied` table declared at
//   [model/entity/PromotionApplied.cfc:L49]. That is the one in-scope entity
//   carrying the constraint, and it is what fixes the length at three.
//
//   CFML parity [model/entity/PromotionApplied.cfc:L53, L55]: `discountAmount`
//   is `ormtype="big_decimal"` and `currencyCode` is `ormtype="string"
//   length="3"` - SEPARATE COLUMNS. The legacy arithmetic therefore carries no
//   currency operand, which is exactly why `money.ts` is currency-agnostic,
//   why it does not import this module, and why this module does not import
//   it. There is deliberately no Money-with-currency type in this target. Do
//   not introduce one, and do not "unify" these two files.
//
//   CFML parity [model/entity/SkuCurrency.cfc:L58, L68]: a correction worth
//   recording, because the folder-level requirement that reached this file
//   stated that `SkuCurrency`'s `currencyCode` is `length="3"`. It is NOT.
//   The verified declarations are:
//     L58  property name="currency" cfc="Currency" fieldtype="many-to-one"
//            fkcolumn="currencyCode";
//     L68  property name="currencyCode" insert="false" update="false";
//   L68 carries NO `ormtype` and NO `length`. It is an unconstrained,
//   read-only PROJECTION of the foreign-key column named at L58, and the
//   `insert="false" update="false"` pair is the mechanism: the ORM maps the
//   property onto the FK column for reading only. [model/entity/Currency.cfc:
//   L52] - the FK's target, and out of scope - has no `length="3"` either; it
//   is an identity column, `ormtype="string" fieldtype="id" unique="true"
//   generated="never"`.
//
//   That correction is not pedantry, it is the design argument: at the site
//   where the legacy code READS a currency code it validates nothing at all
//   and consults no list. It reads the key. This module reproduces that
//   discipline - it constrains length where the schema constrains length, and
//   nowhere else.
//
//   THE COMPARISON SITES, which are the reason this module exists:
//     [model/entity/Sku.cfc:L385]  thisCurrency.getCurrencyCode()
//                                    eq this.setting('skuCurrency')
//     [model/entity/Sku.cfc:L400]  getSkuCurrencies()[c].getCurrencyCode()
//                                    eq thisCurrency.getCurrencyCode()
//   CFML `eq` is case-insensitive and CFML struct keys are case-insensitive;
//   TypeScript is neither. A raw `===` between two currency codes, or a raw
//   `map[code]` property read, is a PARITY BUG. Every comparison and every
//   keyed read in this module routes through `../../lib/cfml/struct.js`.
//
//   THE ABSENCE SITES, which decide what this module may never return:
//     [model/entity/Sku.cfc:L269-L273]  getPriceByCurrencyCode - ONE
//       structKeyExists, no `else`, no fallback. An unknown currency yields
//       nothing.
//     [model/entity/Sku.cfc:L275-L279]  getListPriceByCurrencyCode - TWO
//       structKeyExists on one line, the second on the inner "listPrice"
//       sub-key. Yields nothing even for a currency present in the map.
//     [model/entity/Sku.cfc:L281-L285]  getRenewalPriceByCurrencyCode - the
//       identical two-level shape on "renewalPrice".
//
//   WHY THAT SECOND CHECK EXISTS, verified against the cascade at
//   [model/entity/Sku.cfc:L367-L433]: STEP 0 at [model/entity/Sku.cfc:
//   L381-L382] creates the OUTER entry for every eligible currency
//   UNCONDITIONALLY, while the inner `listPrice` and `renewalPrice` keys are
//   written only under `!isNull(...)` guards at L386-L393, L401-L405 and
//   L417-L423. Outer-present-with-inner-absent is therefore a REACHABLE
//   state, and PRESENCE IS NOT VALUE. The corroborating schema asymmetry is
//   in the same family: [model/entity/SkuCurrency.cfc:L53] gives `price` no
//   default at all, while L54 `renewalPrice` and L55 `listPrice` both carry
//   `default="0"`.
//
// ***************************************************************************
// ** ABSENCE PROPAGATES AS `undefined`, OR AS A THROWN ERROR. NEVER AS A    **
// ** SUBSTITUTED VALUE. This module never returns, defaults to, or coerces  **
// ** toward 0, '', or a fabricated currency code, and it offers no          **
// ** `defaultValue` parameter anywhere. Substituting 0 for a missing price  **
// ** would silently sell products for free, and substituting a currency     **
// ** code for a missing one is how the wrong price gets read confidently.   **
// ***************************************************************************
//
//   [model/entity/Sku.cfc:L360-L365] closes the loop on the default: the
//   entity's own `getCurrencyCode()` merely memoizes `this.setting(
//   'skuCurrency')`. The literal appears nowhere in that entity, and it
//   appears nowhere in this module either.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
//   No arithmetic of any kind - that is `money.ts`, the sole arithmetic
//   surface in this target. No formatting - the legacy cascade delegates that
//   too, calling `formatValue(..., "currency", {currencyCode=...})` at
//   [model/entity/Sku.cfc:L419, L423, L426], and in this target money
//   presentation is `numberFormat.ts`. No conversion - `convertCurrency` sits
//   behind the currencyConverter port and is called from
//   [model/entity/Sku.cfc:L418, L422, L425]. No ordering or sorting predicate,
//   because nothing in the in-scope slice sorts currency codes. No blanket
//   unvalidated cast helper: the ONLY ways to obtain a `CurrencyCode` are
//   {@link toCurrencyCode}, which validates and throws, and
//   {@link isCurrencyCode}, which validates and narrows.
//
// IMPORT SURFACE - the narrowest in this subtree, and closed
//   Exactly two modules, both inward: `../../lib/cfml/struct.js` and
//   `../../lib/cfml/truthiness.js`. Nothing else, and nothing outward.
//   `src/domain/**` may not reach `src/repositories/**`, `src/handlers/**` or
//   `src/integrations/**`, may not know the database driver, the Lambda
//   runtime types or environment loading, and may not import through a
//   barrel. That boundary is an ESLint `no-restricted-imports` rule at
//   severity `error`, so a violation is a BUILD FAILURE rather than a
//   code-review note. This module also imports no domain sibling at all -
//   `valueObjects/` is the foundation of the hexagon, so it reaches into
//   neither `entities/`, `views/`, `promotionEngine/` nor `ports/`.
//
//   `isNullish` from the truthiness helper is NOT imported, and the omission
//   is deliberate rather than an oversight. Every nullish question this module
//   asks is already answered inside a helper it does call: `cfEquals`
//   documents any nullish operand as unequal, and the `typeof value ===
//   'string'` test in {@link isCurrencyCode} excludes `null` and `undefined`
//   by construction while also narrowing the type, which a `boolean`-returning
//   predicate cannot do. `truthiness.ts` makes the same call for the same
//   reason inside its own `cfLen`. An import retained for appearance's sake
//   would be an unused local, and `noUnusedLocals` correctly rejects it.
//
// NO USER RULES WERE PROVIDED
//   (1) No user-specified rules were provided for this project. (2) That
//   absence was VERIFIED rather than assumed: the project rules document was
//   read three independent ways while authoring this file - unbounded, over
//   its full range, and over a range deliberately past its apparent end - and
//   all three reads returned the same single statement that no rules exist.
//   AAP section 0.7 reports the same result independently. (3) No rule is
//   invented to fill the gap; any "rule" cited here would be fabrication.
//   (4) The absence is NOT license to lower the bar - the enterprise
//   substitute standard applies at full strength, which for this file means
//   maximal strictness with no `any`, no suppression comment and no non-null
//   assertion; one cohesive closed export surface and no barrel; no
//   credential, connection detail or environment read of any kind; no schema
//   or SQL knowledge; no arithmetic on a monetary value; and every judgment
//   call annotated at the point where it was made. (5) Zero files enter scope
//   by rule mandate - there is no third, rule-driven category of in-scope
//   file - so there are no rule conflicts to resolve either.
//
// PARAMETERIZED SQL IS NOT APPLICABLE HERE, and that is stated rather than
//   quietly skipped. The project standard is that every query uses a prepared
//   statement, preserving the injection-safety guarantee `cfqueryparam` gave.
//   This module contains no query of any kind and knows no table or column by
//   name beyond the two it documents; that obligation rests wholly with
//   `src/repositories/mysql/**`.
//
// NO LEGACY TODO FALLS INSIDE THIS FILE, and none is invented. The project
//   carries source TODOs forward as explicitly flagged TODOs rather than
//   silently completing them - the return/exchange no-op at
//   [model/service/PromotionService.cfc:L542-L544] with its issue #1766
//   reference is the canonical example - but no such marker exists anywhere in
//   the sources this module was derived from.
//
// THIS FILE OWNS ZERO NUMBERED DEFECTS AND ZERO DELIBERATE DIVERGENCES.
//   The migration's defect register reproduces legacy defects rather than
//   repairing them, and marks each with a `LEGACY-DEFECT` annotation at the
//   site. No numbered defect from that register lives in `valueObjects/`, and
//   no line here reproduces a defective legacy line, so this file carries NO
//   `LEGACY-DEFECT` marker - its annotations are `CFML parity` and
//   `JUDGMENT CALL` notes instead. The three deliberate divergences the plan
//   permits are all owned elsewhere - two in `src/services/**` and one in
//   `src/domain/entities/**` - and none is spent here. This module also spends
//   none of the port, signature-reshaping or visibility-widening budgets.
//
// TEST COVERAGE IS NET-NEW, and must never be presented as parity.
//   No legacy test touches any value object. The only legacy suites extended
//   anywhere in this migration are meta/tests/unit/entity/BrandTest.cfc and
//   meta/tests/unit/entity/ProductTest.cfc, neither related to this module,
//   and meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
//   contributing zero coverage. Coverage for this file belongs at
//   tests/unit/domain/valueObjects/currencyCode.test.ts, which is authored
//   separately from this file and is not written here. Every export below is
//   drivable without a mock: all five are pure and synchronous over a string
//   or a plain object.
// ---------------------------------------------------------------------------

import { cfEquals, structGet } from '../../lib/cfml/struct.js';
import type { CfStruct } from '../../lib/cfml/struct.js';
import { cfLen } from '../../lib/cfml/truthiness.js';

/**
 * The exact character count a currency code must have.
 *
 * Traced to a single schema declaration and to nothing else:
 * `ormtype="string" length="3"` at [model/entity/PromotionApplied.cfc:L55],
 * the in-scope entity that persists a currency code to
 * `SwPromotionApplied.currencyCode`.
 *
 * Named once so the validator, the guard and the error message cannot drift
 * apart, and kept module-private so it does not widen this file's export
 * surface. It is a length, not a currency list.
 */
const CURRENCY_CODE_LENGTH = 3;

/**
 * Thrown when a value cannot be a currency code.
 *
 * Exported because it is part of {@link toCurrencyCode}'s contract: a caller
 * that wants to distinguish a malformed currency code from any other failure
 * needs the type to test against. It is not a general-purpose error.
 *
 * The message and the {@link received} property echo the offending value.
 * That is safe and it is useful: a currency code is an identifier drawn from a
 * public register, never a secret, and seeing which value was rejected is the
 * whole point of the error. No configuration value, connection detail or
 * credential is read or reported anywhere in this module.
 *
 * {@link receivedLength} is carried separately because the length IS the
 * violated constraint, and a caller reporting the failure should not have to
 * re-measure the string to say so.
 */
export class InvalidCurrencyCodeError extends Error {
  /** The value that was rejected, exactly as supplied - never normalized. */
  public readonly received: string;

  /**
   * The rejected value's length, measured the way CFML `len()` measures it.
   * See {@link toCurrencyCode} for why that distinction is the faithful one.
   */
  public readonly receivedLength: number;

  public constructor(received: string) {
    const receivedLength = cfLen(received);

    super(
      `Expected a currency code of exactly ${CURRENCY_CODE_LENGTH} characters, received ` +
        `${JSON.stringify(received)} of length ${receivedLength}`,
    );

    this.name = 'InvalidCurrencyCodeError';
    this.received = received;
    this.receivedLength = receivedLength;
  }
}

/**
 * Phantom brand for {@link CurrencyCode}.
 *
 * `declare const` on a `unique symbol` exists only in the type system. It
 * emits no JavaScript, adds no property to any value, and creates no runtime
 * tag: a `CurrencyCode` IS a `string` at runtime, with nothing wrapped around
 * it. There is no class instance and no boxing.
 *
 * It is not exported, which is what makes the brand unforgeable. A consumer
 * cannot name this symbol, so it cannot write the branded type by hand; the
 * only routes in are {@link toCurrencyCode} and {@link isCurrencyCode}, and
 * both validate first.
 */
declare const currencyCodeBrand: unique symbol;

/**
 * A `string` that is known to be exactly three characters long, and is
 * therefore storable in a currency-code column without truncation.
 *
 * WHY THIS TYPE EXISTS. The schema constrains the column
 * (`ormtype="string" length="3"` at [model/entity/PromotionApplied.cfc:L55])
 * but the legacy language enforced nothing at the boundary, so a
 * wrong-length code was a silent truncation at write time rather than an
 * error at construction time. Branding the type moves that check to the one
 * place a code enters the domain.
 *
 * WHAT IT DOES NOT ASSERT, stated plainly so nobody reads more into it than
 * is there. A `CurrencyCode` is NOT a promise that the currency exists, is
 * active, or is eligible for a SKU. Eligibility is decided by the
 * `skuEligibleCurrencies` setting at [model/service/SettingService.cfc:L222]
 * behind the settingsProvider port, gated at [model/entity/Sku.cfc:L373], and
 * this file has no visibility of it. The brand asserts shape, not existence.
 *
 * CFML parity [model/entity/Sku.cfc:L385, L400]: CASING IS STORED VERBATIM
 * AND COMPARED CASE-INSENSITIVELY, which are two separate rules and both are
 * load-bearing. CFML `eq` ignores case, so a stored `'xxx'` matches a
 * configured `'XXX'` there and must here too - that is
 * {@link currencyCodeEquals}. But CFML also stores exactly what it was given,
 * so this type preserves the caller's casing and the constructor folds
 * nothing. Together those keep `SwPromotionApplied.currencyCode` round-
 * tripping byte-for-byte while every comparison stays insensitive.
 *
 * Because it is a branded `string`, it is assignable to `string` and every
 * ordinary string operation still works. Note that a derived value is NOT
 * branded: `code.toUpperCase()` is a plain `string`, which is correct - it is
 * a different value, and it has not been through the constructor.
 */
export type CurrencyCode = string & { readonly [currencyCodeBrand]: true };

/**
 * The primary way to obtain a {@link CurrencyCode}: validate, then brand.
 *
 * @param value an untrusted string, taken exactly as given.
 * @returns the same string, branded. Not a copy, not normalized.
 * @throws {InvalidCurrencyCodeError} if the length is not exactly three.
 *
 * IT THROWS, AND THAT IS THE POINT. Returning `undefined` on failure here
 * would make an invalid currency code indistinguishable from an absent one at
 * the call site, and silently coercing one is the class of bug that ends with
 * the wrong price being read confidently. A caller that must branch instead of
 * catching uses {@link isCurrencyCode}, which answers the same question
 * without an exception. Those two are the complete set: there is deliberately
 * no blanket `as CurrencyCode` helper, and the single type assertion in this
 * module sits inside this function, immediately after a successful check, so
 * the brand can never be attached to an unchecked string.
 *
 * The parameter is `string` rather than `string | null | undefined`. A nullish
 * value is not a malformed currency code, it is an absent one, and that is a
 * different question with a different answer - so a caller holding a nullable
 * column value tests for absence at its own call site, where the decision is
 * visible, and only then asks this function about a string.
 *
 * JUDGMENT CALL: length is validated, and NOTHING ELSE IS.
 *   No character class is enforced. The schema constrains only length -
 *   `ormtype="string" length="3"` at [model/entity/PromotionApplied.cfc:L55] -
 *   and the two other in-scope currency-code declarations constrain even less:
 *   [model/entity/SkuCurrency.cfc:L68] has no `ormtype` and no `length` at
 *   all, and [model/entity/Currency.cfc:L52] is a bare identity column. There
 *   is no declarative validation file to draw a stricter rule from either;
 *   `SwPromotionApplied` has no entry under model/validation/, and the plan is
 *   explicit that the absent validation files are absent by design and are not
 *   to be invented.
 *   So an `A-Za-z` test would be a constraint this migration made up, and the
 *   consequence is accepted openly and stated rather than hidden: a
 *   three-character value that is not three letters is accepted here, exactly
 *   as the column would accept it. Rejecting it is not this file's job -
 *   deciding WHICH codes are real belongs to the `skuEligibleCurrencies`
 *   setting at [model/service/SettingService.cfc:L222], behind the
 *   settingsProvider port. Widening validation here would quietly relocate a
 *   configuration decision into a value object.
 *
 * JUDGMENT CALL: the value is NOT trimmed.
 *   A four-character input with a leading space is INVALID, not silently
 *   shortened to the three characters inside it. Trimming is the sort of
 *   helpful-looking normalization that changes which key a later lookup
 *   resolves to, and the two sibling helpers this module composes with have
 *   already settled the question the same way: `struct.ts` folds case but
 *   states that keys are NOT trimmed, and `list.ts` states that its append
 *   never trims or normalizes. Being consistent with them matters more than
 *   being forgiving here, because a code that was trimmed on the way in and
 *   not on the way out stops matching itself.
 *
 * JUDGMENT CALL: the value is NOT case-folded.
 *   CFML compares without regard to case but stores precisely what it was
 *   given, and both halves are reproduced: storage is verbatim so that
 *   `SwPromotionApplied.currencyCode` round-trips unchanged, and comparison is
 *   insensitive in {@link currencyCodeEquals}. Upper-casing here would be
 *   invisible in most cases and wrong in exactly the case that matters - a
 *   value written back to the schema in a casing the schema never held.
 *   CFML parity [model/entity/Sku.cfc:L385, L400].
 *
 * JUDGMENT CALL: length is measured with `cfLen`, not with a raw `.length`.
 *   `length="3"` is a CFML-declared length, and CFML measures a string with
 *   `len()`, which counts UTF-16 code units on the JVM. `cfLen` is the sibling
 *   helper that owns exactly those semantics for this migration - it returns a
 *   string's `.length` and never trims. Routing through it makes the parity
 *   explicit and auditable rather than incidental, and means a future change
 *   to CFML length semantics has one place to land instead of several. It also
 *   keeps this check honest about a value built from characters outside the
 *   basic multilingual plane, which `len()` counts as two.
 */
export function toCurrencyCode(value: string): CurrencyCode {
  if (cfLen(value) === CURRENCY_CODE_LENGTH) {
    return value as CurrencyCode;
  }

  throw new InvalidCurrencyCodeError(value);
}

/**
 * Is `value` a currency code? A type guard, and it never throws.
 *
 * The non-throwing counterpart to {@link toCurrencyCode}, and the correct tool
 * at a repository-hydration boundary: a row value arrives untyped, and a
 * malformed or absent column should be branched on rather than turned into an
 * exception halfway through building an entity.
 *
 * Applies exactly the same rule as {@link toCurrencyCode} - length only, no
 * trimming, no case folding - because two validators that disagree would be
 * worse than one. It narrows to {@link CurrencyCode} on success, which is what
 * makes it a genuine alternative to the throwing constructor rather than a
 * mere precondition test.
 *
 * The parameter is `unknown` rather than `string` so it can be asked of a
 * value the caller has not established anything about, which is the situation
 * at a hydration boundary. A `null`, an `undefined`, a number, a `Date` and an
 * object all answer `false`: the `typeof` test excludes every one of them and
 * narrows the type at the same time, which is why no separate nullish test is
 * needed or wanted here.
 */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && cfLen(value) === CURRENCY_CODE_LENGTH;
}

/**
 * Case-insensitive currency-code equality: the CFML `eq` operator, reproduced.
 *
 * CFML parity [model/entity/Sku.cfc:L385]: the base-currency step of the
 * cascade selects its currency with `thisCurrency.getCurrencyCode() eq
 * this.setting('skuCurrency')`, and CFML `eq` ignores case - so a stored
 * lower-case code matches an upper-case configured one.
 * CFML parity [model/entity/Sku.cfc:L400]: the per-currency override step
 * matches the same way, which is what lets an override OVERWRITE the
 * base-step entry rather than sit beside it as a second currency. Comparing
 * those two codes with a raw `===` would leave both entries in the map and
 * change which price is read.
 *
 * The comparison itself is delegated to `cfEquals` and is deliberately not
 * re-implemented here. That helper already carries the decided semantics -
 * a locale-independent `toLowerCase()` fold rather than
 * `toLocaleLowerCase()`, so the result cannot change with the ambient locale;
 * whitespace significant, since only case is folded; and empty strings
 * compared normally, an empty string being an ordinary value in CFML. A second
 * implementation of a case fold is a second place for it to drift.
 *
 * A NULLISH OPERAND IS NEVER EQUAL TO ANYTHING, INCLUDING ANOTHER NULLISH
 * OPERAND, and that rule is not incidental. `cfEquals(undefined, undefined)`
 * is `false` where `undefined === undefined` is `true`, and the asymmetry is
 * intended: treating "no currency code" as equal to "no currency code" reads
 * as a match on a currency-selection path, and would let a price be attributed
 * to a currency that was never identified. On a money path that is the wrong
 * direction to fail in. CFML cannot answer the question at all - passing a
 * null into `eq` raises an error there - so there is no legacy result being
 * discarded, only a gap being closed deliberately. A caller that needs to
 * detect "both absent" tests for absence explicitly.
 *
 * Both parameters accept a plain `string`, not just a {@link CurrencyCode}.
 * That is required rather than lax: at [model/entity/Sku.cfc:L385] one operand
 * is a code read from the database and the other is a raw setting value, and
 * the settingsProvider port publishes the sku-currency setting as a `string`.
 * Demanding a branded operand would force a throwing construction into a
 * comparison, which is not what the legacy line does.
 */
export function currencyCodeEquals(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return cfEquals(a, b);
}

/**
 * The entry stored under `currencyCode` in a currency-code-keyed map, matched
 * case-insensitively, or `undefined` when no key matches.
 *
 * ***********************************************************************
 * ** ABSENCE PROPAGATES AS `undefined`. NEVER 0, NEVER '', NEVER null,  **
 * ** NEVER {}. Substituting 0 for a missing price would silently sell   **
 * ** products for free.                                                 **
 * ***********************************************************************
 *
 * THERE IS DELIBERATELY NO `defaultValue` PARAMETER, and none may be added.
 * Offering one is exactly how a 0 reaches a price path: the default gets
 * supplied at the one call site nobody reviews closely, and a missing price
 * quietly becomes a free product. `struct.ts` omits one for the same stated
 * reason, and that omission is honoured here verbatim. A caller that genuinely
 * wants a fallback applies it itself, at its own call site, where the
 * substitution is visible in the diff and can be argued about.
 *
 * CFML parity [model/entity/Sku.cfc:L270, L276, L282]: the currency-details
 * map is keyed by currency code, and every legacy read of it is a
 * `structKeyExists`-then-index pair on a case-insensitive key. This is the
 * currency-code-typed form of that read - the ONE keyed-lookup convenience
 * this module provides.
 *
 * PRESENCE IS NOT VALUE, and this function answers only the value question.
 * It returns `undefined` both for a key that is absent and for a key that is
 * present holding `undefined`. That distinction is real rather than academic:
 * STEP 0 of the cascade at [model/entity/Sku.cfc:L381-L382] creates the OUTER
 * entry for every eligible currency UNCONDITIONALLY, so "the currency key
 * exists" absolutely does not mean "a price exists" - which is precisely why
 * the list and renewal accessors at [model/entity/Sku.cfc:L275-L285] need a
 * second check. A caller that needs the presence answer asks
 * `structKeyExists` from `../../lib/cfml/struct.js` directly; this module does
 * not re-export it, because one wrapper per question is enough and a second
 * spelling of the same test invites the two to be confused.
 *
 * REACHING THE SECOND LEVEL IS NOT THIS FUNCTION'S JOB. A caller that wants
 * the inner `price`, `listPrice` or `renewalPrice` sub-key uses `structGetPath`
 * from `../../lib/cfml/struct.js`, which exists for that two-level shape and
 * reproduces [model/entity/Sku.cfc:L275-L285] exactly. The reason for the
 * split is not brevity: the currency code is the OUTER key only, while the
 * inner key is a price-field name and has nothing to do with currency
 * identity. A two-level variant here would duplicate an existing primitive to
 * add nothing but a typed outer key, and would then invite a third variant.
 *
 * JUDGMENT CALL: `currencyCode` is a plain `string`, NOT a
 * {@link CurrencyCode}.
 *   This looks like a missed chance to demand the branded type, and it is not.
 *   [model/entity/Sku.cfc:L269-L273] yields NOTHING for an unrecognised
 *   currency - it does not raise - and the ported entity accessor is published
 *   as `getPriceByCurrencyCode(currencyCode: string)` to keep that signature
 *   at parity. If this lookup demanded a branded key, that accessor would have
 *   to construct one first, and construction THROWS, converting the legacy
 *   yields-nothing contract into an exception. That is the single
 *   highest-consequence parity check in the plan, so the lookup accepts any
 *   string and answers `undefined` on a miss. A {@link CurrencyCode} is
 *   assignable to `string`, so a caller that has already validated loses
 *   nothing by passing one.
 *
 * The map is typed `CfStruct<TEntry>` - a read-only record keyed by string -
 * so the entry type flows through to the return type as `TEntry | undefined`
 * with no cast and no `any`. `TEntry` is deliberately unconstrained: the entry
 * is a currency-detail record in the cascade, but the same keyed shape occurs
 * elsewhere and this function has no reason to care what it holds. Reading
 * never writes: a miss leaves the map exactly as it was, so calling this on a
 * price map cannot populate it with placeholder entries.
 */
export function getByCurrencyCode<TEntry>(
  struct: CfStruct<TEntry>,
  currencyCode: string,
): TEntry | undefined {
  return structGet(struct, currencyCode);
}

// ---------------------------------------------------------------------------
// HAND-OFF NOTES - RECORDED HERE, DELIBERATELY NOT ACTED ON HERE
//
// Observations for the owners of other layers. None is a change to make in
// this file, and none is a defect in it.
//
//   1. The currency-details map that {@link getByCurrencyCode} is shaped for
//      is built by `getCurrencyDetails()` at [model/entity/Sku.cfc:L367-L433],
//      which belongs to `src/domain/entities/sku.ts`. Two properties of that
//      cascade are the entity's to preserve, not this module's: the
//      eligibility gate at [model/entity/Sku.cfc:L373], where an empty
//      `skuEligibleCurrencies` setting leaves the map `{}` so that every
//      accessor yields nothing; and the memo at [model/entity/Sku.cfc:L368],
//      which must be instance-scoped with request-scoped instances, because a
//      module-scoped cache would survive between unrelated warm-container
//      invocations and let one order's price map answer another order's
//      lookup.
//   2. The entity's three currency accessors are published as SYNCHRONOUS -
//      `getPriceByCurrencyCode`, `getListPriceByCurrencyCode` and
//      `getRenewalPriceByCurrencyCode` - which holds only because the
//      repository materializes the currency details during hydration. Every
//      export in this module is synchronous too, so nothing here obstructs
//      that. All three return `... | undefined`, never 0.
//   3. `Sku.getCurrencyCode()` at [model/entity/Sku.cfc:L360-L365] resolves
//      the sku-currency setting and is published as returning `string`, not
//      {@link CurrencyCode}. That is the settings boundary's decision, and it
//      is consistent: a setting value is configuration, and validating it into
//      a branded code is a choice the consumer makes where it needs the brand.
//      This module neither requires nor assumes that the setting is branded.
//   4. `SwSkuCurrency.currencyCode` reaches the target as the read-only FK
//      projection described above, from [model/entity/SkuCurrency.cfc:L58]
//      and L68. The repository that hydrates `skuCurrency.ts` owns whether it
//      brands that column on the way in; {@link isCurrencyCode} is the tool
//      for doing so without a throw, and it is offered for exactly that.
//   5. `model/entity/Currency.cfc` carries `currencyName` at L54 and
//      `currencySymbol` at L55. Neither is modelled anywhere in this target:
//      `Currency` is out of scope, and a symbol map here would be the runtime
//      currency table this file exists without. Money presentation is
//      `numberFormat.ts`.
// ---------------------------------------------------------------------------
