// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts  composition root (constructs and wires this class)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the European Central Bank currency-conversion adapter
//
// WHAT THIS MODULE IS
//   The concrete, shipped implementation of the `CurrencyConverter` port. It
//   reproduces `model/service/CurrencyService.cfc` - the three capabilities the
//   in-scope slice reaches for - as a plain, injectable class with no transport,
//   no database handle and no static state.
//
//   It is a SECONDARY ADAPTER: the domain declares what it needs in
//   `src/domain/ports/currencyConverter.ts` and this file satisfies that
//   declaration from the outside. Dependency flow stays domain-inward - this
//   module imports the domain, the domain never imports this module, and the
//   ESLint `no-restricted-imports` boundary on `src/domain/**` is what makes the
//   reverse a build failure rather than a review comment.
//
// AAP AUTHORITY
//   Section 0.2.1, "Target Artifacts Created", declares the creation pattern
//   `slatwall-ts/src/integrations/*.ts`, which is this file's home. Section
//   0.4.1 maps the port to `model/service/CurrencyService.cfc` as a "narrow
//   interface: eligible-currency listing and `convertCurrency` only", and
//   section 0.2.1 lists CurrencyService among the narrow slices of otherwise
//   out-of-scope services, reached from [model/entity/Sku.cfc:L379, L421].
//   Section 0.6.3 makes the currency cascade this adapter feeds one of the three
//   named MUST-PRESERVE areas, which is why every branch below cites the legacy
//   line it reproduces.
//
// ******************************************************************************
// ** WHY THIS FILE EXISTS RATHER THAN THE COMPOSITION ROOT.                   **
// **                                                                          **
// ** `src/domain/ports/currencyConverter.ts` records, under "WHO IMPLEMENTS   **
// ** THIS PORT", that the port has no adapter file in the target layout and   **
// ** that its only legal implementation home is the composition root. That    **
// ** note was written when no adapter existed; THIS FILE IS THAT ADAPTER,     **
// ** and the port's note has been updated to point here.                      **
// **                                                                          **
// ** The reasoning for a dedicated module rather than an object literal       **
// ** inlined into the wiring: the conversion is ALGORITHM, not wiring. It     **
// ** carries a pivot currency, a guard whose evaluation order is behavioural, **
// ** a silent fallback that is easy to "tidy" into a rejection, and a         **
// ** rounding step - roughly forty lines of decisions that each need their    **
// ** own citation and their own characterisation test. A composition root is  **
// ** a place where instances are connected, not a place where a must-preserve **
// ** money algorithm is hidden. Keeping it here also keeps the root free to   **
// ** decide WHERE the rates and the currency records come from, which is the  **
// ** one currency question this file deliberately does not answer.            **
// ******************************************************************************
//
// THE LEGACY ALGORITHM, REPRODUCED LINE BY LINE
//   [model/service/CurrencyService.cfc:L79-L101], read end to end while
//   authoring this file:
//
//     L79   `convertCurrency(required numeric amount, required
//           originalCurrencyCode, required convertToCurrencyCode)`. Note that
//           only the first argument is typed; the two codes are untyped and
//           arrive as whatever the caller passed.
//     L81   the carried-forward TODO. See its own section below.
//     L85   `var cbRates = getEuropeanCentralBankRates();` - the rate table.
//     L86   THE GUARD, and the whole of it:
//             (structKeyExists(cbRates, original) || original eq "EUR")
//           && (structKeyExists(cbRates, convertTo) || convertTo eq "EUR")
//           Both `structKeyExists` on a CFML struct and `eq` are CASE-
//           INSENSITIVE, so `"eur"` satisfies the pivot test and a lower-cased
//           code still finds its rate.
//     L87   `if(arguments.originalCurrencyCode eq "EUR")`
//     L88     `var amountInEUR = arguments.amount;` - no division at all.
//     L90     `var amountInEUR = arguments.amount / cbRates[ original ];`
//     L93   `if(arguments.convertToCurrencyCode eq "EUR")`
//     L94     `return round(amountInEUR * 100) / 100;`
//     L96     `return round(amountInEUR * cbRates[ convertTo ] * 100) / 100;`
//     L100  the comment "If no conversion could be done, just return the
//     L101  original amount", and `return arguments.amount;`
//
// ******************************************************************************
// ** THE SILENT PASS-THROUGH IS THE CONTRACT, NOT AN OVERSIGHT.               **
// **                                                                          **
// ** When either code is missing from the rate table and is not the pivot,    **
// ** [L100-L101] returns the amount UNCONVERTED. It does not raise, it does   **
// ** not substitute zero, and it does not signal that no conversion           **
// ** happened. The port documents the same thing from the other side:         **
// ** "@returns the converted amount, or `amount` unchanged when no rate is    **
// ** available".                                                              **
// **                                                                          **
// ** Refusing instead would look like the safer choice and is not. The        **
// ** cascade at [model/entity/Sku.cfc:L416-L428] converts EVERY eligible      **
// ** currency that no `SwSkuCurrency` row covers, and it awaits each          **
// ** conversion inside the body that builds the price map. A rejection there  **
// ** does not degrade one currency's price - it fails
// ** `getCurrencyDetails()` outright, so the SKU ends up with NO prices at    **
// ** all, including the base-currency price that never needed converting.     **
// ** One unlisted exotic currency would take down the whole price map. The    **
// ** legacy answer - price it at par and carry on - is both the faithful one  **
// ** and the safe one.                                                        **
// **                                                                          **
// ** TWO CONSEQUENCES WORTH STATING, because both are observable:             **
// **   1. `converted = true` is still written by the cascade at [L427] for a  **
// **      pass-through, so a par-priced currency is indistinguishable from a  **
// **      genuinely converted one. That is legacy behaviour; this adapter     **
// **      does not add a signal the legacy did not have, and the port         **
// **      surface has nowhere to put one.                                     **
// **   2. THE FALLBACK IS NOT ROUNDED. [L101] returns `arguments.amount`      **
// **      verbatim, while [L94] and [L96] both round to cents. So a           **
// **      three-decimal amount survives the fallback intact and is rounded    **
// **      on the converted path. The asymmetry is reproduced exactly.         **
// ******************************************************************************
//
// ******************************************************************************
// ** THE GUARD IS EVALUATED BEFORE ANY ARITHMETIC, AND THAT ORDERING IS       **
// ** BEHAVIOURAL.                                                             **
// **                                                                          **
// ** [L86] tests BOTH halves before [L90] performs the division. An           **
// ** implementation that divided first and checked the target afterwards      **
// ** would agree on every ordinary input and disagree on one: a source rate   **
// ** of zero with an unreachable target. The legacy never divides in that     **
// ** case and returns the amount; a divide-first implementation raises a      **
// ** division-by-zero error. So the structure below resolves BOTH halves      **
// ** into `EuroPivotScaling` values first and only then computes, which       **
// ** makes the ordering a property of the code's shape rather than of a       **
// ** comment asking the next reader to preserve it.                           **
// ******************************************************************************
//
// ******************************************************************************
// ** THERE IS NO EQUAL-CODE SHORT-CIRCUIT, AND ADDING ONE WOULD CHANGE        **
// ** MONEY.                                                                   **
// **                                                                          **
// ** [L79-L101] contains no `original eq convertTo` test. Converting USD to   **
// ** USD with a USD rate present therefore divides by that rate, multiplies   **
// ** by it again, and ROUNDS TO CENTS - so `19.999 USD -> USD` answers        **
// ** `20.00`, not `19.999`. An identity short-circuit would answer `19.999`.  **
// ** Both readings are defensible in the abstract; only one is what the       **
// ** legacy does, and behaviour preservation is the acceptance contract.      **
// **                                                                          **
// ** The EUR-to-EUR path lands in the same place by a different route:        **
// ** [L87] takes the no-division branch and [L94] still rounds.               **
// ******************************************************************************
//
// ******************************************************************************
// ** THE `activeFlag` ASYMMETRY. TWO LISTINGS, ONE FILTER APART.              **
// **                                                                          **
// ** FILTERED on active status:                                               **
// **   [model/service/CurrencyService.cfc:L60]  addFilter('activeFlag', 1)    **
// **   [model/service/CurrencyService.cfc:L72]  addFilter('activeFlag', 1)    **
// ** NOT FILTERED on active status:                                           **
// **   [model/entity/Sku.cfc:L375]                                            **
// **     addInFilter('currencyCode', setting('skuEligibleCurrencies'))        **
// **                                                                          **
// ** L375 is the cascade's ONLY filter, so an eligible-currency setting that  **
// ** names an INACTIVE currency still gets that currency priced. Adding an    **
// ** active-status filter to `getCurrenciesByCurrencyCodeList` below is how   **
// ** an inactive-but-eligible currency silently stops being priced. Do not.   **
// **                                                                          **
// ** `activeFlag` is `ormtype="boolean"` at [model/entity/Currency.cfc:L53]   **
// ** with NO declared default, so the column can hydrate as SQL NULL. The     **
// ** legacy filter is emitted as `activeFlag = 1`, which NULL fails, so an    **
// ** unset flag is not active. `cfBoolean` resolves exactly that - absent     **
// ** reads false - which is why the flag is accepted as `CfBooleanInput`      **
// ** rather than as a bare `boolean`.                                         **
// ******************************************************************************
//
// ******************************************************************************
// ** CURRENCY-RECORD EXISTENCE IS LOAD-BEARING FOR THE SECOND LISTING.        **
// **                                                                          **
// ** [model/entity/Sku.cfc:L371-L375] narrows a Currency SMART LIST with an   **
// ** `IN` filter, so it answers with Currency RECORDS - not with the codes    **
// ** the setting happened to name. A code present in `skuEligibleCurrencies`  **
// ** but ABSENT from `SwCurrency` yields no record, and the cascade never     **
// ** creates an entry for it, so `getPriceByCurrencyCode` answers             **
// ** `undefined` for it. This adapter reproduces that by iterating the        **
// ** RECORD set and testing membership of the list, never the reverse.        **
// **                                                                          **
// ** The same choice fixes the result ORDER: it follows the record set, as    **
// ** an `IN` filter over a table does, not the order the codes appear in the  **
// ** setting string. The cascade seeds one outer key per returned record at   **
// ** [model/entity/Sku.cfc:L381], so record order is the key order.           **
// ******************************************************************************
//
// ******************************************************************************
// ** NO OUTBOUND HTTP, NO DATABASE, NO MODULE-SCOPE MEMO.                     **
// **                                                                          **
// ** [model/service/CurrencyService.cfc:L104-L131]                            **
// ** `getEuropeanCentralBankRates()` performs a live HTTP GET against the     **
// ** European Central Bank's daily reference-rate XML, on port 80, with a     **
// ** 60-second ceiling, inside a `try` whose `catch` at L127-L128 IS EMPTY -  **
// ** so a failed fetch silently reuses whatever was stored - and memoizes     **
// ** the parsed table on the component under a day-old re-read guard at       **
// ** L105. The legacy comment at L52 records that memo as application-scoped. **
// **                                                                          **
// ** NONE OF THAT IS PORTED. This file opens no socket, names no URL, reads   **
// ** no environment variable and holds no static state. Both the rate table   **
// ** and the currency records arrive through the constructor and are          **
// ** snapshotted there, which makes the instance the scope.                   **
// **                                                                          **
// ** THAT IS A CORRECTNESS PROPERTY, NOT A CONVENIENCE. A memo held on a      **
// ** long-lived module in a reused Lambda container is CROSS-REQUEST STATE:   **
// ** two unrelated requests would read the same stored table and a stale      **
// ** entry would price one of them wrongly. AAP 0.6.5 catalogues exactly      **
// ** this hazard for the four component-level caches in the legacy slice and  **
// ** rules that all of them become request-scoped. Construct one of these     **
// ** per request, hand it the rates that request should see, and the hazard   **
// ** cannot arise. There is deliberately no `refreshRates()` and no           **
// ** `clearCache()`: a cache this class does not own is a cache it cannot     **
// ** mismanage, and the port surface offers no such control either.           **
// **                                                                          **
// ** Freshness therefore belongs to whoever builds the table. That is a real  **
// ** obligation and it is named here rather than left implicit.               **
// ******************************************************************************
//
// THE LEGACY RATE STRUCT CARRIES A NON-CURRENCY KEY, AND IT CANNOT REACH HERE
//   [model/service/CurrencyService.cfc:L124] writes `newDetails.retrieved =
//   now()` INTO the same struct as the rates, so the legacy `structKeyExists`
//   guard at L86 would answer true for a currency code spelled `retrieved`.
//   Recorded because it was read, not because it is reachable: `CurrencyCode` is
//   exactly three characters [src/domain/valueObjects/currencyCode.ts], and
//   `retrieved` is nine, so no value of the port's parameter type can collide
//   with it. No filtering of the supplied table is performed or needed, and a
//   caller that hands over a table still carrying the key is unaffected.
//
// ONE LEGACY TODO IS CARRIED FORWARD, NOT COMPLETED
//   [model/service/CurrencyService.cfc:L81] reads "TODO: Add integration
//   support", directly under a comment stating that a currency-conversion
//   integration should be consulted first when one exists. The project carries
//   source TODOs forward as explicitly flagged TODOs rather than silently
//   completing them (AAP 0.8.1), so it is restated on `convertCurrency` below,
//   it is NOT implemented, and no hook, no strategy slot and no configuration
//   key is designed for it here. The European Central Bank table is the only
//   rate source this class consults, which is precisely what the legacy does
//   while that TODO stands.
//
// MONEY IS THE ONLY ARITHMETIC SURFACE
//   Every rate is a DECIMAL STRING and every operation goes through `Money`,
//   which wraps an arbitrary-precision decimal. No floating-point operation
//   touches a monetary value anywhere in this file, per AAP 0.8.3.
//
//   `round(x * 100) / 100` at [L94] and [L96] is reproduced as
//   `Money.fromDecimalString(value.toFixed2())`. `toFixed2()` is
//   `numberFormat(amount, '0.00')`, which rounds half-away-from-zero at two
//   decimals - the same rule CFML's `round()` applies at the unit position after
//   the `* 100` - and it normalises negative zero, which `round(-0.001 * 100) /
//   100` also does. The two-step round-then-reconstruct is deliberate: the
//   rounding is part of the CALCULATION here, not presentation, so the result
//   must come back as `Money` rather than as a formatted string.
//
// FAILURES THAT PROPAGATE, AND WHY THEY SHOULD
//   Two inputs raise rather than falling through to the pass-through, and in
//   both cases the legacy engine raised too:
//     * a rate that is not a plain decimal numeral - `Money` rejects the
//       operand, as CFML rejected `amount / "abc"`.
//     * a rate of exactly zero on the SOURCE side - the decimal division
//       refuses, as CFML's division by zero did.
//   Neither is a currency that is merely unlisted; an unlisted currency is the
//   pass-through, and these are malformed data. Swallowing them would turn a
//   corrupt rate table into silently wrong prices.
//
// IMPORT SURFACE - four modules, all inward
//   The two domain value objects, the domain port being implemented, and two
//   CFML semantic-parity helpers. No driver, no runtime types, no environment
//   loading, no sibling adapter, and no barrel - `src/integrations/**` has no
//   index file and none is to be added.
//
// TEST COVERAGE FOR THIS ADAPTER IS NET-NEW, AND IS NOT PARITY
//   No legacy test touches `CurrencyService.cfc`. AAP 0.6.6 records that only
//   three legacy test files reach the in-scope slice at all - the Brand and
//   Product entity suites plus an empty functional stub - and none of them is
//   this. The characterisation suite at
//   `tests/unit/integrations/europeanCentralBankCurrencyConverter.test.ts` is
//   therefore new ground and must never be presented as legacy parity. It pins
//   the pass-through, the pivot in both directions, the absence of an
//   equal-code short-circuit, the cent rounding, and the listing asymmetry.
// ---------------------------------------------------------------------------

import { Money } from '../domain/valueObjects/money.js';
import { currencyCodeEquals, getByCurrencyCode } from '../domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../domain/valueObjects/currencyCode.js';
import type { CurrencyConverter } from '../domain/ports/currencyConverter.js';
import { listFindNoCase } from '../lib/cfml/list.js';
import { cfBoolean } from '../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../lib/cfml/truthiness.js';

/**
 * The pivot currency of the European Central Bank reference-rate table.
 *
 * CFML parity [model/service/CurrencyService.cfc:L87, L93]: the legacy hardcodes
 * the literal `"EUR"` at both ends of the pivot. The rate table is quoted
 * per-euro by construction, so the pivot is a property of the source rather than
 * a configurable choice, and it is not exposed as a constructor argument.
 *
 * The code is compared through `currencyCodeEquals`, never with `===`, because
 * CFML's `eq` is case-insensitive and `"eur"` must satisfy the pivot test.
 *
 * A note on where this literal is allowed to live: the PORT deliberately names
 * no currency code as a value, because a pivot is an implementation detail of a
 * particular rate source. This adapter is that implementation, so the literal
 * belongs here.
 */
const EURO_CURRENCY_CODE = 'EUR';

/**
 * The European Central Bank reference-rate table, as this adapter consumes it.
 *
 * Keys are currency codes, matched CASE-INSENSITIVELY to reproduce CFML struct
 * semantics. Values are the per-euro rate as a PLAIN DECIMAL STRING - never a
 * JavaScript number, because every one of them is multiplied into a monetary
 * value and money never touches a float.
 *
 * CFML parity [model/service/CurrencyService.cfc:L118-L119]: the legacy builds
 * this struct by copying the `currency` and `rate` XML attributes of each `Cube`
 * element, so a rate is a string there too.
 *
 * A code ABSENT from this table is the pass-through case, not an error. See the
 * module header.
 */
export type EuropeanCentralBankRateTable = Readonly<Record<string, string>>;

/**
 * The two `SwCurrency` columns the two listing methods read, and nothing else.
 *
 * CFML parity [model/entity/Currency.cfc:L52-L53]: `currencyCode` is the entity
 * identifier and `activeFlag` is a nullable boolean. `currencyName` (L54),
 * `currencySymbol` (L55) and the audit columns are deliberately NOT modelled -
 * the display label has no in-scope consumer now that the admin application is
 * out of scope, and projecting it would put a presentation concern in a data
 * shape. `Currency` is not one of the eighteen in-scope entities, so there is no
 * `currency.ts` to reuse and this narrow projection stands in for it.
 *
 * `activeFlag` is `CfBooleanInput` rather than `boolean` so that a column
 * hydrating as SQL NULL is representable; `cfBoolean` resolves absent to false,
 * matching the `activeFlag = 1` predicate the legacy filter emits.
 *
 * `currencyCode` is already a `CurrencyCode`. Validating the three-character
 * width is the RECORD SUPPLIER's job, at the boundary where the row is read, and
 * it is compile-checked here rather than re-asserted at runtime: raising from a
 * listing call would be a divergence, since the legacy smart list returns
 * whatever the column holds and never measures it.
 */
export interface CurrencyRecordProjection {
  /** The `SwCurrency` primary key [model/entity/Currency.cfc:L52]. */
  readonly currencyCode: CurrencyCode;

  /** The nullable active flag [model/entity/Currency.cfc:L53]. */
  readonly activeFlag: CfBooleanInput;
}

/**
 * A `SwCurrency` row with its active flag already resolved to a boolean.
 *
 * The resolution happens once, in the constructor, for two reasons. It makes both
 * listing methods TOTAL - pure array operations that cannot raise - so their
 * `Promise.resolve` is honest rather than hiding a synchronous throw behind a
 * promise-typed signature. And it moves the one failure `cfBoolean` can report -
 * a present flag carrying no boolean meaning, such as `'maybe'` - to
 * construction, where the whole record set is in view, instead of surfacing it
 * from a listing call several layers away.
 *
 * That failure is a schema surprise rather than a data variation: the legacy
 * filter is emitted as `activeFlag = 1` against a boolean column, so no value
 * reaching it could be unrecognised. SQL NULL is a different matter and IS
 * expected - `cfBoolean` resolves it to false, which is the answer the legacy
 * predicate gave it.
 */
type ResolvedCurrencyRecord = {
  readonly currencyCode: CurrencyCode;
  readonly active: boolean;
};

/**
 * One resolved half of the euro pivot.
 *
 * The point of this type is ORDERING, not tidiness. [L86] tests both halves
 * before [L90] divides, so both halves are resolved to one of these - or to
 * `undefined`, meaning "unreachable" - before any arithmetic runs. `'euro'`
 * carries no rate because neither pivot branch has one: [L88] assigns the amount
 * unchanged and [L94] multiplies by nothing.
 */
type EuroPivotScaling =
  { readonly kind: 'euro' } | { readonly kind: 'rate'; readonly rate: string };

/**
 * The `CurrencyConverter` port, implemented over a European Central Bank
 * reference-rate table and a `SwCurrency` projection supplied at construction.
 *
 * Replaces the `getService("currencyService")` locator calls embedded in the SKU
 * entity at [model/entity/Sku.cfc:L371, L418, L422, L425] - transformation rule
 * T2. The entity now declares a constructor-injected port and this class is what
 * the composition root at `src/handlers/bootstrap.ts` (planned) hands it.
 *
 * INSTANCE-SCOPED AND EFFECTIVELY IMMUTABLE. Both inputs are snapshotted in the
 * constructor and no method mutates anything, so an instance is safe to share
 * within one request and must NOT be cached across requests. Every method is
 * `async` because the port declares it so; none of them awaits anything, which
 * is a property of THIS implementation - the port exists precisely so that an
 * implementation which does reach outward can be substituted without the domain
 * changing.
 *
 * THE THREE METHODS ARE THE WHOLE SURFACE. No `refreshRates`, no `clearCache`,
 * no rate accessor and no currency-record accessor: each would either widen the
 * port or expose the state whose containment is the point.
 */
export class EuropeanCentralBankCurrencyConverter implements CurrencyConverter {
  /**
   * The `SwCurrency` projection both listing methods read, active flags resolved.
   *
   * Built fresh in the constructor, so a later mutation of the caller's array
   * cannot reach in here, and never handed back - every listing returns a fresh
   * array built from it.
   */
  private readonly currencies: readonly ResolvedCurrencyRecord[];

  /**
   * The per-euro reference rates `convertCurrency` consults.
   *
   * Snapshotted one level deep, which is the whole depth: the values are
   * strings, so a shallow copy is a complete copy.
   */
  private readonly rates: EuropeanCentralBankRateTable;

  /**
   * The rate table is deliberately NOT validated here. A malformed or zero rate
   * is left to raise at the moment it is consulted, because the legacy consults
   * rates lazily too: a corrupt `USD` entry does not stop a `EUR`-to-`GBP`
   * conversion there, and refusing the whole table up front would.
   *
   * @param currencies the `SwCurrency` rows this converter should see, in the
   *   order the second listing method should answer in.
   * @param rates the European Central Bank per-euro rate table, keyed by
   *   currency code with plain-decimal-string values. Pass an empty object to
   *   model a failed or unavailable retrieval; every non-pivot conversion then
   *   takes the [L100-L101] pass-through, which is exactly what the legacy did
   *   when its empty `catch` at [L127-L128] swallowed a fetch failure.
   * @throws {CfmlBooleanConversionError} when a supplied `activeFlag` is present
   *   but carries no boolean meaning. See {@link ResolvedCurrencyRecord}.
   */
  constructor(
    currencies: readonly CurrencyRecordProjection[],
    rates: EuropeanCentralBankRateTable,
  ) {
    // `map` produces the defensive copy as a side effect of resolving the flags,
    // so there is no second spread to keep in step with it.
    this.currencies = currencies.map(
      (record: CurrencyRecordProjection): ResolvedCurrencyRecord => ({
        currencyCode: record.currencyCode,
        active: cfBoolean(record.activeFlag),
      }),
    );

    this.rates = { ...rates };
  }

  /**
   * List the currency codes flagged active.
   *
   * CFML parity [model/service/CurrencyService.cfc:L57-L67]: the legacy filters
   * `activeFlag` to 1, selects `currencyCode`, and appends each record to a
   * comma-delimited string. The comma list becomes an array at the port
   * boundary so no caller parses one; record ORDER is preserved, because
   * `listAppend` preserved it and the legacy query carries no `ORDER BY`.
   * [L69-L77]'s `getCurrencyOptions` applies the identical filter and differs
   * only in projecting a display label, so it collapses into this method.
   *
   * The active flag was resolved at construction, so this method cannot raise.
   *
   * @returns every active currency code, as a fresh array.
   */
  getAllActiveCurrencyIDList(): Promise<CurrencyCode[]> {
    const active = this.currencies
      .filter((record: ResolvedCurrencyRecord): boolean => record.active)
      .map((record: ResolvedCurrencyRecord): CurrencyCode => record.currencyCode);

    return Promise.resolve(active);
  }

  /**
   * Resolve the currencies named by a comma-delimited currency-code list.
   *
   * CFML parity [model/entity/Sku.cfc:L371-L375]: the cascade takes a Currency
   * smart list and narrows it with `addInFilter('currencyCode', ...)` on the
   * eligible-currency setting. THAT IS ITS ONLY FILTER - there is deliberately
   * no `activeFlag` clause here, so an inactive currency named in the list is
   * still returned. See the asymmetry box in the module header before changing
   * this.
   *
   * The record set is iterated and membership of the list is tested, rather than
   * the reverse, which is what makes a listed-but-nonexistent code answer
   * nothing and what makes the result order follow the records.
   *
   * Matching is case-insensitive: `listFindNoCase` carries the semantics of the
   * `IN` predicate the legacy filter emits against a case-insensitive column
   * collation.
   *
   * @param currencyCodeList a comma-delimited list of currency codes, in the
   *   form the `skuEligibleCurrencies` setting stores. An empty string matches
   *   nothing, which is consistent with the cascade's own eligibility gate at
   *   [model/entity/Sku.cfc:L373] never opening for one.
   * @returns the currencies whose code appears in the list, as a fresh array.
   */
  getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]> {
    const eligible = this.currencies
      .filter(
        (record: ResolvedCurrencyRecord): boolean =>
          listFindNoCase(currencyCodeList, record.currencyCode) > 0,
      )
      .map((record: ResolvedCurrencyRecord): CurrencyCode => record.currencyCode);

    return Promise.resolve(eligible);
  }

  // TODO [model/service/CurrencyService.cfc:L81]: add integration support so a configured currency-conversion integration can supply the rate.
  // LEGACY-NOTE [model/service/CurrencyService.cfc:L100-L101]: when either code is missing from the rate table the amount is returned unconverted rather than rejected.
  // Retained to preserve the cited legacy behavior.
  /**
   * Convert an amount between two currencies, pivoting through the euro.
   *
   * CFML parity [model/service/CurrencyService.cfc:L85-L101], branch for branch:
   * the guard at [L86] resolves both halves before any arithmetic; [L87-L91]
   * expresses the amount in euro, dividing by the source rate unless the source
   * IS the euro; [L93-L97] scales into the target, multiplying by the target
   * rate unless the target IS the euro; both return paths round to cents; and
   * [L100-L101] returns the amount UNTOUCHED - unrounded - when either side has
   * no reachable rate.
   *
   * There is NO equal-code short-circuit, because the legacy has none. See the
   * module header for what adding one would change.
   *
   * @param amount the amount expressed in `originalCurrencyCode`.
   * @param originalCurrencyCode the currency `amount` is denominated in.
   * @param convertToCurrencyCode the currency to express the result in.
   * @returns the converted amount rounded to cents, or `amount` unchanged when
   *   either currency has no reachable rate.
   * @throws rejects when a CONSULTED rate is not a plain decimal numeral, or when
   *   the SOURCE rate is zero - both of which the legacy engine also raised on. A
   *   rate that is malformed but never consulted is harmless, exactly as it was
   *   in the legacy, so neither fault is a pass-through and neither is
   *   pre-validated.
   */
  convertCurrency(
    amount: Money,
    originalCurrencyCode: CurrencyCode,
    convertToCurrencyCode: CurrencyCode,
  ): Promise<Money> {
    // WHY A PROMISE EXECUTOR RATHER THAN `Promise.resolve(...)`. The arithmetic
    // below is synchronous and CAN raise on malformed rate data, and a
    // `Promise`-typed method that throws synchronously breaks its own contract -
    // `.catch()` would never see it. An executor body runs immediately, so
    // nothing is deferred and no microtask is introduced, and a raise inside it
    // becomes a REJECTION. `async` is not the alternative here: there is
    // genuinely nothing to await, and the lint gate rejects an `async` function
    // without one.
    return new Promise<Money>((resolve) => {
      // [L86] Both halves first. No arithmetic has happened yet, and none may.
      const source: EuroPivotScaling | undefined = this.resolveScaling(originalCurrencyCode);
      const target: EuroPivotScaling | undefined = this.resolveScaling(convertToCurrencyCode);

      if (source === undefined || target === undefined) {
        // [L100-L101] The pass-through. Returned as received, deliberately NOT
        // rounded, and deliberately not distinguishable from a real conversion.
        resolve(amount);
      } else {
        // [L87-L91] `amountInEUR`. The euro branch divides by nothing at all,
        // which is [L88]; every other source divides by its own rate, [L90].
        const amountInEuro: Money = source.kind === 'euro' ? amount : amount.dividedBy(source.rate);

        // [L93-L97] Into the target. The euro branch multiplies by nothing, which
        // is [L94]; every other target multiplies by its own rate, [L96].
        const scaled: Money =
          target.kind === 'euro' ? amountInEuro : amountInEuro.times(target.rate);

        // [L94]/[L96] `round(... * 100) / 100`. Two decimals, half away from
        // zero. This is CALCULATION, not presentation, so the rounded value goes
        // back into `Money` rather than being handed out as a formatted string.
        resolve(Money.fromDecimalString(scaled.toFixed2()));
      }
    });
  }

  /**
   * Resolve one side of the pivot, or report that it cannot be resolved.
   *
   * CFML parity [model/service/CurrencyService.cfc:L86]: one half of the guard,
   * which is `structKeyExists(cbRates, code) || code eq "EUR"`. The pivot test
   * comes FIRST and wins, matching [L87] and [L93], so the euro converts even
   * when the supplied table carries no `EUR` key - and the European Central
   * Bank table never does, because its rates are quoted per euro.
   *
   * @param currencyCode the code to resolve.
   * @returns how to scale through the euro for this code, or `undefined` when
   *   the code is neither the pivot nor present in the rate table.
   */
  private resolveScaling(currencyCode: CurrencyCode): EuroPivotScaling | undefined {
    if (currencyCodeEquals(currencyCode, EURO_CURRENCY_CODE)) {
      return { kind: 'euro' };
    }

    // Case-insensitive, because CFML struct keys are. `getByCurrencyCode` is the
    // domain's published accessor for exactly this lookup shape.
    const rate: string | undefined = getByCurrencyCode(this.rates, currencyCode);

    return rate === undefined ? undefined : { kind: 'rate', rate };
  }
}
