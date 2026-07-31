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
//   src/handlers/bootstrap.ts  composition root (wiring)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the CurrencyConverter port
//
// PURPOSE
//   The narrow currency port. Two capabilities, and only two: LISTING the
//   currency codes that exist, and CONVERTING one amount from one currency code
//   to another. Both are drawn from `model/service/CurrencyService.cfc`, a
//   component that is otherwise out of scope for this migration and is ported
//   here as a slice rather than as a whole.
//
//   The live outbound rate retrieval the legacy conversion depends on is
//   deliberately left OUTSIDE the domain. This file declares what the domain
//   needs. It says nothing whatsoever about where a rate comes from.
//
// AAP AUTHORITY
//   Section 0.4.1, "Ports":
//     src/domain/ports/currencyConverter.ts | CREATE |
//     model/service/CurrencyService.cfc | Narrow interface: eligible-currency
//     listing and `convertCurrency` only
//   Section 0.2.1 lists CurrencyService among the narrow slices of otherwise
//   out-of-scope services, reached from [model/entity/Sku.cfc:L379, L421].
//   Section 0.6.3 makes the currency cascade this port feeds one of the three
//   named MUST-PRESERVE areas.
//
//   This is port 2 of exactly THIRTEEN in `src/domain/ports/`. The folder is
//   closed at thirteen: this file introduces no fourteenth port, no second
//   port of its own, and no barrel.
//
// ***************************************************************************
// ** INTERFACES ONLY. THIS MODULE EMITS NO RUNTIME JAVASCRIPT WHATSOEVER.   **
// **                                                                       **
// ** No class, no function, no `const`, no `enum`, no default export - not  **
// ** one runtime value of any kind. Both imports below are `import type`,   **
// ** which TypeScript erases entirely, so this file's compiled output is an **
// ** empty module. That is the defining property of this folder, and it is  **
// ** verified rather than assumed: if ANYTHING appears in the emit, the     **
// ** file is wrong. A TypeScript `enum` is forbidden here for exactly that  **
// ** reason - it emits a runtime object. Where a closed set is needed, a    **
// ** string-literal union carries it instead.                               **
// ***************************************************************************
//
// THE LEGACY COMPONENT DECLARES EXACTLY FOUR FUNCTIONS
//   Verified by reading `model/service/CurrencyService.cfc` end to end while
//   authoring this file. Everything after L133 is empty section-marker
//   comments - DAO Passthrough, Process Methods, Status Methods, Save
//   Overrides, Smart List Overrides, Get Overrides, Delete Overrides - all of
//   them declaring nothing. There is no fifth function to have missed.
//
//     L57   getAllActiveCurrencyIDList()   -> PORTED, as listing method 1
//     L69   getCurrencyOptions()           -> PORTED, folded into method 1
//     L79   convertCurrency(...)           -> PORTED, as method 3
//     L104  getEuropeanCentralBankRates()  -> DELIBERATELY NOT PORTED
//
//   Listing method 2 below has no single legacy declaration behind it; it
//   corresponds to a DIFFERENT filter combination applied at a different call
//   site, and the asymmetry section explains why that earns its own method.
//
// ***************************************************************************
// ** CORRECTION TO THE PLAN: `getCurrencySmartList` IS NOT A CFML METHOD.   **
// **                                                                       **
// ** The plan describes this port as "`getCurrencySmartList` +              **
// ** `convertCurrency` only". The first half of that is wrong, and it is    **
// ** recorded here rather than reproduced.                                  **
// **                                                                       **
// ** `getCurrencySmartList` is NOT DECLARED ANYWHERE in CurrencyService.cfc.**
// ** It is inherited framework CRUD supplied by the Hibachi base service,   **
// ** and it is merely CALLED - at [model/service/CurrencyService.cfc:L59]   **
// ** and [model/service/CurrencyService.cfc:L70] inside the component, and  **
// ** at [model/entity/Sku.cfc:L371] from the cascade. No method of that     **
// ** name is declared on this port.                                        **
// **                                                                       **
// ** Reproducing the smart list itself would mean reimplementing a generic, **
// ** string-keyed, dynamically-filtered query builder - reimporting exactly **
// ** the framework coupling this migration exists to remove, and untypeable **
// ** under the strict profile (AAP section 0.6.2). The two listing methods  **
// ** below replace it with explicit, typed queries whose filters are fixed  **
// ** at the signature instead of assembled at runtime.                     **
// ***************************************************************************
//
// ***************************************************************************
// ** THE `activeFlag` ASYMMETRY - WHY THERE ARE TWO LISTING METHODS.        **
// **                                                                       **
// ** This is the single most consequential finding behind this file, and it **
// ** was established by direct comparison of the two legacy call paths:     **
// **                                                                       **
// **   FILTERED on active status:                                          **
// **     [model/service/CurrencyService.cfc:L60]  addFilter('activeFlag',1) **
// **     [model/service/CurrencyService.cfc:L72]  addFilter('activeFlag',1) **
// **                                                                       **
// **   NOT FILTERED on active status:                                      **
// **     [model/entity/Sku.cfc:L375]                                       **
// **       addInFilter('currencyCode', setting('skuEligibleCurrencies'))    **
// **                                                                       **
// ** L375 is the cascade's ONLY filter. There is no `activeFlag` clause on  **
// ** that path, so the cascade sees EVERY currency whose code appears in    **
// ** the eligible list, REGARDLESS OF ACTIVE STATUS.                       **
// **                                                                       **
// ** Collapsing the two into one method would silently change which        **
// ** currencies get priced, and the cascade is a named must-preserve area.  **
// ** So: TWO methods, each stating its own filter contract. Adding an       **
// ** active-status filter to the second one is a BEHAVIOUR CHANGE, not a    **
// ** tidy-up, and adding one is how an inactive-but-eligible currency       **
// ** silently stops being priced.                                          **
// ***************************************************************************
//
// ***************************************************************************
// ** THE ASYNC-CASCADE RULING - READ THIS BEFORE CHANGING A SIGNATURE.      **
// **                                                                       **
// ** Every method here is `async` and returns a promise. The cascade that   **
// ** consumes them is SYNCHRONOUS. Both statements are true, and the        **
// ** resolution is a boundary, not a compromise.                           **
// **                                                                       **
// ** The SKU currency accessors are published synchronous (AAP 0.4.2):      **
// **   getPriceByCurrencyCode(currencyCode: string): Money | undefined      **
// **   getListPriceByCurrencyCode(currencyCode: string): Money | undefined  **
// **   getRenewalPriceByCurrencyCode(currencyCode: string): Money |         **
// **     undefined                                                         **
// **   getCurrencyDetails(): Readonly<Record<string, CurrencyDetail>>       **
// **                                                                       **
// ** Yet the legacy cascade calls `convertCurrency` from inside that        **
// ** synchronous body, three times, at [model/entity/Sku.cfc:L418, L422,    **
// ** L425].                                                                **
// **                                                                       **
// ** RESOLUTION: THE CURRENCY-DETAIL MAP IS MATERIALISED AT THE REPOSITORY  **
// ** BOUNDARY, DURING ENTITY HYDRATION. This port is awaited by the         **
// ** repository/composition layer BEFORE the SKU is handed to the domain,   **
// ** so by the time any accessor runs, every price it can return is already **
// ** computed and in hand. The async boundary is drawn once, outside the    **
// ** entity, which is precisely what lets the accessors stay synchronous.   **
// **                                                                       **
// ** Consequently: do NOT add a synchronous variant of `convertCurrency` to **
// ** "solve" this, and do NOT make the listing methods synchronous to       **
// ** match the accessors. Either change would push the boundary into the    **
// ** entity and break the published accessor contract.                     **
// ***************************************************************************
//
// THE CASCADE THIS PORT FEEDS - [model/entity/Sku.cfc:L367-L433], VERIFIED
//   Recorded so a reader of this port can see what its output is consumed by,
//   and why the two listing contracts differ.
//
//     L368  memo guard on `variables.currencyDetails`.
//     L371  the currency list is fetched BEFORE and OUTSIDE the gate.
//     L373  THE GATE: `if(len(setting('skuEligibleCurrencies')))`, wrapping
//           L374-L430 in its entirety. Gate closed => the memo stays `{}` =>
//           every `getPriceByCurrencyCode()` yields null. The gate key is read
//           through `settingsProvider`, never through this port.
//     L375  the eligible-code filter, and nothing else. See the asymmetry box.
//     L377  and L379 - `getRecords()` is evaluated TWICE per iteration.
//     L381  an outer entry is created UNCONDITIONALLY for every eligible
//     L382  currency, together with `skuCurrencyID = ""`.
//     STEP 1, L385-L397 - base currency, from the SKU's own columns, applied
//           only where the code matches `skuCurrency`. `renewalPrice` (L386)
//           and `listPrice` (L390) sit behind `!isNull` guards; `price` (L394)
//           is written UNCONDITIONALLY. `converted = false` (L396).
//     STEP 2, L399-L414 - per-currency overrides from `SwSkuCurrency`
//           OVERWRITE step 1 on a code match (L400), under the same guard
//           pattern. `converted = false` (L411), `skuCurrencyID` set (L412).
//     STEP 3, L416-L428 - conversion, reached ONLY where no `price` key was
//           written by step 1 or step 2 (L416). Three `convertCurrency` calls
//           - L418 renewalPrice, L422 listPrice, L425 price - each invoked
//           POSITIONALLY as (value, skuCurrency, thisCurrencyCode), each
//           followed by presentation formatting. `converted = true` (L427).
//           The legacy comment introducing this step, at L415, reads "Use a
//           conversion mechinism"; the typo is the source's, quoted verbatim.
//
//   THE OUTER KEY ALWAYS EXISTS WHILE `listPrice` AND `renewalPrice` MAY BE
//   ABSENT. Outer-present-with-inner-absent is a reachable state, which is why
//   `exactOptionalPropertyTypes` is load-bearing for the detail shape and why
//   the accessors return `undefined` rather than a substituted zero. This port
//   does not declare that shape - the entity owns it - but the contracts below
//   are written to serve it.
//
// ***************************************************************************
// ** THE RATE SOURCE IS AN ADAPTER CONCERN AND IS NOT PORTED HERE.          **
// **                                                                       **
// ** [model/service/CurrencyService.cfc:L104-L131]                          **
// ** `getEuropeanCentralBankRates()` performs a live outbound HTTP GET for  **
// ** the European Central Bank's daily reference-rate XML document - port   **
// ** 80, a 60-second ceiling, inside a `try` whose `catch` at L127-L128 is  **
// ** EMPTY - parses the response, and memoizes the result on the component  **
// ** under a guard at L105 that re-reads it once the stored copy is a day   **
// ** old. The legacy comment at L52 records the memo as application-scoped. **
// **                                                                       **
// ** NONE OF THAT CROSSES INTO THE DOMAIN. This file names no URL, no port  **
// ** number, no time limit, no rate table and no HTTP or fetch concept AS   **
// ** CODE; it cites them only in this comment, to record what was excluded  **
// ** and where the excluded thing lives. The domain asks for a converted    **
// ** amount and is told one. Everything else belongs to the implementation. **
// **                                                                       **
// ** WHY THE MEMO IN PARTICULAR MUST NOT LEAK INWARD, and this is a         **
// ** CORRECTNESS statement, not a claim about speed: a memo held on a       **
// ** long-lived module in a reused execution container is CROSS-REQUEST     **
// ** STATE. Two unrelated requests would read the same stored rate table,   **
// ** and a stale entry would price one of them wrongly. The daily re-read   **
// ** guard is therefore part of the adapter's correctness obligation, and   **
// ** the port surface offers no `refreshRates()`, no `clearCache()` and no  **
// ** other cache control - such a method would move that obligation into    **
// ** the domain, where it does not belong.                                 **
// ***************************************************************************
//
// THERE IS NO `Currency` ENTITY IN THIS TARGET, AND NONE IS IMPORTED
//   `model/entity/Currency.cfc` is not one of the eighteen in-scope entities,
//   so `src/domain/entities/` contains no `currency.ts` to import and this
//   file imports no entity at all. A currency is identified here by
//   `CurrencyCode` and by nothing else.
//
//   That is also why the legacy `getCurrencyOptions()` record shape is NOT
//   reproduced. [model/service/CurrencyService.cfc:L73-L74] selects
//   `currencyName` as `name` alongside `currencyCode` as `value` - the shape a
//   framework select control consumes. The admin application is out of scope,
//   so the display label has no in-scope consumer, and publishing a
//   name/value projection would put a presentation concern in the domain.
//   L69's filter contract is identical to L57's, so both collapse into the one
//   active listing below, returning codes.
//
// WHO IMPLEMENTS THIS PORT
//   `src/repositories/mysql/**` implements six of the thirteen ports -
//   product, sku, option, productType, promotion and priceGroup. This is not
//   one of them: `currencyConverter` has NO adapter file anywhere in the
//   target layout, so ITS ONLY LEGAL IMPLEMENTATION HOME IS
//   `src/handlers/bootstrap.ts` (planned), the composition root.
//
//   Stated plainly for whoever writes that wiring, because every one of these
//   obligations is invisible from this side of the interface. The
//   implementation - never the domain - owns: the European Central Bank rate
//   retrieval; the memo and its daily re-read; the `"EUR"` pivot described on
//   `convertCurrency` (named here in commentary only, never as a value in this
//   file); and case-insensitive comparison of every currency code it touches.
//
//   `getAllActiveCurrencyIDList` has a second consumer in that same file. The
//   `skuEligibleCurrencies` setting declares a RUNTIME-COMPUTED default -
//   `getCurrencyService().getAllActiveCurrencyIDList()`
//   [model/service/SettingService.cfc:L222] - and `settingsProvider.setting()`
//   is synchronous, so the composition root must AWAIT this method eagerly and
//   join the result into the comma-delimited string that provider returns.
//   Same "materialise at the boundary" discipline as the cascade itself.
//
// IMPORT SURFACE - two modules, both inward, and closed
//   `../valueObjects/money.js` and `../valueObjects/currencyCode.js`. Nothing
//   else, and nothing outward.
//
//   `src/domain/**` may reach only `src/domain/**` and `src/lib/**`. It may
//   never reach `src/repositories/**`, `src/handlers/**` or
//   `src/integrations/**`, and may not know the database driver, the Lambda
//   runtime types or environment loading. That boundary is an ESLint
//   `no-restricted-imports` rule at severity `error`, so crossing it is a
//   BUILD FAILURE rather than a review comment. It is never to be weakened,
//   and no exception is ever to be added for this file.
//
//   Four further specifiers are excluded BY DESIGN even though they resolve:
//     * `../../lib/config.js` and `../../lib/logger.js` - off the legal
//       surface for `src/domain/**`. Static process configuration is not a
//       request scope and must never be used as one.
//     * `decimal.js` - the decimal substrate is an implementation detail of
//       `Money`, sealed inside it. The dependency set is fixed at the thirteen
//       exactly-pinned packages `package.json` declares - 3 runtime and 10
//       development - and this file adds none.
//     * any sibling port - ZERO port in this folder imports another port.
//     * any view, and any `.../index.js` barrel - there are no barrels here.
//
//   NO ENTITY IMPORT EITHER, and that is worth stating because the folder as a
//   whole does have one: ports and entities reference each other at the TYPE
//   level, and every such reference must be `import type` so the cycle exists
//   only in the type graph and never at runtime. This file sidesteps the
//   question entirely by importing no entity. Keep it that way.
//
//   `Money` and `CurrencyCode` deliberately do not import each other, and
//   this file must not fuse them. The legacy schema keeps them apart:
//   [model/entity/PromotionApplied.cfc:L53] persists `discountAmount` as
//   `big_decimal` while [model/entity/PromotionApplied.cfc:L55] persists
//   `currencyCode` as `string` of length 3 - SEPARATE COLUMNS. `Money` is
//   currency-agnostic by design, so a signature needing both carries them as
//   two parameters. There is no money-with-currency type in this target and
//   none is to be introduced.
//
// THE NAMES PUBLISHED HERE ARE CANONICAL
//   Interface parity is the acceptance contract for this migration, so the
//   legacy CFML names survive verbatim in camelCase - `convertCurrency`,
//   `getAllActiveCurrencyIDList`, and the argument names `amount`,
//   `originalCurrencyCode` and `convertToCurrencyCode` exactly as declared at
//   [model/service/CurrencyService.cfc:L79]. Nothing is renamed to read more
//   idiomatically. The lint configuration deliberately enables no
//   naming-convention rule, for precisely this reason.
//
//   Every subtree that will consume this port is still empty, so nothing yet
//   depends on these names and nothing yet would break if they changed. That
//   is the argument for getting them right now, not for treating them as
//   provisional: they are published, they are canonical, and they are not to
//   be renamed later.
//
// NO USER RULES WERE PROVIDED
//   Stated explicitly rather than passed over. The project rules document was
//   read three independent ways while authoring this file - unbounded, over
//   its full range, and over a range deliberately past its apparent end - and
//   all three returned the same single statement that no rules exist. AAP
//   section 0.7 reports the same result independently.
//
//   Four consequences. (1) No rule is invented to fill the gap; any "rule"
//   cited here would be fabrication. (2) The absence is NOT licence to lower
//   the bar - the enterprise substitute standard applies at full strength,
//   which for this file means maximal strictness with no `any`, no suppression
//   comment and no non-null assertion; monetary values as `Money` and never as
//   `number`; no currency code hardcoded as a value; one exported unit and no
//   barrel; no credential, connection detail or environment read of any kind;
//   and every judgment call annotated where it was made. (3) Zero files enter
//   scope by rule mandate - there is no third, rule-driven category of
//   in-scope file - so this port traces to the AAP and to the legacy source,
//   and to nothing else. (4) There are therefore no rule conflicts to resolve.
//
// PARAMETERIZED SQL IS NOT APPLICABLE TO THIS FILE, and that is stated rather
//   than quietly skipped. The project standard is that every query uses a
//   prepared statement, preserving the injection-safety guarantee
//   `cfqueryparam` gave the legacy code. This file contains no query, names no
//   table and no column, and never will; that obligation rests wholly with
//   `src/repositories/mysql/**`. Schema continuity is likewise untouched here
//   - no migration, no rename, no new table, no column change, and the
//   existing `Sw*` tables are read exactly as they stand.
//
// ONE LEGACY TODO IS CARRIED FORWARD, ON `convertCurrency`
//   The project carries source TODOs forward as explicitly flagged TODOs
//   rather than silently completing them. Exactly one falls inside this port's
//   source, at [model/service/CurrencyService.cfc:L81]. It is recorded on the
//   method it belongs to, it is NOT completed, and no integration hook is
//   designed for it here.
//
// THIS FILE OWNS ZERO DEFECT MARKERS AND ZERO DELIBERATE DIVERGENCES
//   The migration reproduces legacy defects rather than repairing them, each
//   marked at its site. No numbered defect from that register lives in this
//   port, so this file carries no defect marker and none is invented; its
//   annotations are CFML-parity and judgment-call notes instead. The three
//   deliberate divergences the plan permits are all owned elsewhere - two in
//   `src/services/**`, one in `src/domain/entities/**` - and none is spent
//   here. Nor is any port, signature-reshaping or visibility-widening budget
//   spent: `Money` in place of a bare numeric, and an array in place of a
//   comma-delimited string, are consequences of the target type system,
//   documented at their signatures, not divergences from legacy behaviour.
//
// TEST COVERAGE FOR THIS PORT IS NET-NEW, AND IS NOT PARITY
//   Only three legacy test files touch the in-scope slice at all -
//   `meta/tests/unit/entity/BrandTest.cfc`,
//   `meta/tests/unit/entity/ProductTest.cfc`, and
//   `meta/tests/functional/admin/entity/ProductTest.cfc`, the last of which is
//   an empty stub contributing zero coverage. NONE of them covers
//   `CurrencyService`, so every assertion written against this port is new
//   ground and must never be presented as legacy parity. Every method here is
//   drivable from a hand-written fake with no database and no network: three
//   methods, no static state, no construction requirements. The suites
//   themselves are authored separately and are deliberately not written here.
// ---------------------------------------------------------------------------

import type { Money } from '../valueObjects/money.js';
import type { CurrencyCode } from '../valueObjects/currencyCode.js';

/**
 * The two currency capabilities the in-scope slice needs, as one injected
 * collaborator.
 *
 * Replaces the `getService("currencyService")` service-locator lookups embedded
 * inside the SKU entity at [model/entity/Sku.cfc:L371, L418, L422, L425] with a
 * constructor-injected interface. The legacy entity reached outward through a
 * runtime bean-factory lookup, which is a domain file reaching into the
 * framework; this replaces it with an explicit, compile-checked dependency
 * pointing inward.
 *
 * THREE METHODS, AND THREE IS THE WHOLE SURFACE. Two listing contracts, which
 * differ by exactly one filter and are documented at length because of it, plus
 * one conversion. Nothing here reveals a rate source, a cache, a transport, or
 * a currency record - see the module header for what each of those exclusions
 * costs and why it is worth paying.
 *
 * EVERY METHOD IS `async`. All three sit in front of work the domain cannot do
 * for itself, and the async boundary is drawn here so that the SKU accessors
 * downstream can stay synchronous. The module header's async-cascade ruling is
 * the full argument; the short version is that the currency-detail map is
 * materialised during entity hydration, before the domain ever sees the SKU.
 *
 * IMPLEMENTED IN `src/handlers/bootstrap.ts` (planned), which is the only legal home for
 * it - this port has no adapter file in the target layout.
 */
export interface CurrencyConverter {
  // JUDGMENT CALL: The legacy comma-delimited return is exposed as an array so callers do not parse a list.
  /**
   * List the currency codes flagged active.
   *
   * CFML parity [model/service/CurrencyService.cfc:L57-L67]: the legacy method filters `activeFlag`
   * to 1, selects `currencyCode`, and appends each record to a comma-delimited string.
   *
   * @returns every active currency code.
   */
  getAllActiveCurrencyIDList(): Promise<CurrencyCode[]>;

  // LEGACY-NOTE [model/entity/Sku.cfc:L371-L375]: this lookup applies no active-currency filter, so an eligible-currency setting naming an inactive currency still yields it.
  // Retained to preserve the cited legacy behavior.
  /**
   * Resolve the currencies named by a comma-delimited currency-code list.
   *
   * CFML parity [model/entity/Sku.cfc:L371-L375]: the cascade takes a Currency smart list and narrows
   * it with an IN filter on the eligible-currency setting. That smart list is not declared on the
   * service; it is resolved by convention at [org/Hibachi/HibachiService.cfc:L340-L350].
   *
   * @param currencyCodeList a comma-delimited list of currency codes, in the form the
   *   `skuEligibleCurrencies` setting stores.
   * @returns the currencies whose code appears in the list.
   */
  getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]>;

  // TODO [model/service/CurrencyService.cfc:L81]: add integration support so a configured currency-conversion integration can supply the rate.
  // LEGACY-NOTE [model/service/CurrencyService.cfc:L100-L101]: when either code is missing from the rate table the amount is returned unconverted rather than rejected.
  // Retained to preserve the cited legacy behavior.
  /**
   * Convert an amount between two currencies.
   *
   * CFML parity [model/service/CurrencyService.cfc:L84-L97]: conversion pivots through EUR, dividing
   * by the source rate unless the source is already EUR, multiplying by the target rate, and rounding
   * the result to two decimal places.
   *
   * @param amount the amount expressed in `originalCurrencyCode`.
   * @param originalCurrencyCode the currency `amount` is denominated in.
   * @param convertToCurrencyCode the currency to express the result in.
   * @returns the converted amount, or `amount` unchanged when no rate is available.
   */
  convertCurrency(
    amount: Money,
    originalCurrencyCode: CurrencyCode,
    convertToCurrencyCode: CurrencyCode,
  ): Promise<Money>;
}
