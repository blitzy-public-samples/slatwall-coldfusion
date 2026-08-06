// ---------------------------------------------------------------------------
// THE SIBLINGS THIS FILE NAMES, AND WHAT EACH ONE OWNS
//
// Commentary below hands responsibilities to other modules by name, and every
// one of them exists on the branch - so each mention points at real code rather
// than at an intention. Naming a boundary here is how this file records what it
// deliberately does NOT do, so that no responsibility below acquires a second
// owner:
//
//   src/repositories/mysql/mysqlSkuRepository.ts  MySQL SKU adapter
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - extracted SQL: the sorted product-SKU identifier statement
//
// WHAT THIS MODULE IS
//   ONE statement, extracted into its own module so that it can be read as SQL
//   and diffed line by line against the legacy `<cfquery>` it was ported from.
//   It exports a single pure, synchronous builder that returns the statement
//   text together with its bound parameters, and it does nothing else.
//
//   Legacy origin: `model/dao/SkuDAO.cfc:L172-L202` -
//   `getSortedProductSkusID(productID)`, written in `<cffunction>` TAG syntax
//   (the surrounding `<cfscript>` block closes at L170) and wrapping a raw
//   `<cfquery name="sorted">` at L178-L199. That query body, not any paraphrase
//   of it, is the source of truth and it is reproduced verbatim as an exhibit
//   immediately above the emitted statement.
//
//   The consumer is `src/repositories/mysql/mysqlSkuRepository.ts`, which
//   implements `getSortedProductSkusID(productID: string): Promise<string[]>`
//   as declared by `src/domain/ports/skuRepository.ts`. Row handling, the
//   single-column projection into that array of identifiers, the fetch-shape
//   commentary and the request-scoped option-group sort-order cache all belong
//   to that adapter. This module owns the PHYSICAL STATEMENT and nothing more.
//
// JUDGMENT CALL: the plan cites this statement as `model/dao/SkuDAO.cfc:L172-L220`.
// Read against the file, that span is DRIFT, and it is deliberately not used here.
// The function opens at L172 and closes at L202. L204-L220 is a DIFFERENT, private
// function - `getNextOptionGroupSortOrder` - and L222-L226 is a third,
// `clearNextOptionGroupSortOrder`; both belong to the adapter rather than to this
// statement. Every locator written down in this file was opened and confirmed
// against the source first, and L172-L202 is the span used throughout.
//
// WHAT THIS STATEMENT DOES - AND WHY THE ORDERING IS THE WHOLE POINT
//   It returns the identifiers of one product's SKUs, ordered by a positional
//   weight built from option-group sort order. Each option group contributes a
//   digit: the OPTION's sort order is the digit, and the distance between that
//   option GROUP's sort order and the next available option-group sort order is
//   the digit's place value. Summing those per SKU orders the SKUs as if reading
//   a multi-digit odometer.
//
//   That ordering is one of the behaviours this migration must preserve exactly,
//   and it is why `OptionGroup` is in scope at all - pulled in by necessity
//   rather than by name. Substituting a different sort, adding a second sort key,
//   or changing the weight expression changes which SKU a shopper sees first.
//
// NO `Slatwall*` -> `Sw*` NAMING CORRECTION APPLIES TO THIS STATEMENT
//   Every table reference in the legacy query body is ALREADY a physical name -
//   `SwSku`, `SwSkuOption`, `SwOption`, `SwOptionGroup` - and so is every column
//   reference: `SwSku.skuID`, `SwSku.productID`, `SwSkuOption.skuID`,
//   `SwSkuOption.optionID`, `SwOption.optionID`, `SwOption.optionGroupID`,
//   `SwOption.sortOrder`, `SwOptionGroup.optionGroupID` and
//   `SwOptionGroup.sortOrder`. There is no HQL here and therefore nothing to
//   translate.
//
//   This is stated so that nobody "corrects" what is already right. A real
//   naming correction IS required elsewhere in this port, where three methods
//   emit logical `Slatwall*` names into RAW SQL that the database cannot
//   resolve: `model/dao/ProductTypeDAO.cfc:L53-L54`,
//   `model/dao/SkuDAO.cfc:L131-L138` and `model/dao/ProductDAO.cfc:L420-L427`.
//   All three belong to the adapters, and the second of them lives in this
//   statement's own source file but in a DIFFERENT function
//   (`searchSkusByProductType`). None of the three is this module's concern.
//
// SCHEMA CONTINUITY IS ABSOLUTE
//   This statement reads the existing `Sw*` tables exactly as they already are.
//   No migration, no rename, no new table, no column change, and no schema
//   management text of any kind appears here or anywhere in this module.
//
// THE PURITY CONTRACT - WHY THIS MODULE IS A BUILDER AND NOT A QUERY
//   The statement is returned, never executed. The builder is synchronous,
//   deterministic for a given set of inputs, and inspectable, so the SQL text
//   and the bound-parameter array can both be asserted directly without a
//   database. That is a design requirement rather than a convenience: the
//   repository test tier asserts generated SQL and bound parameters against a
//   recording double substituted for the pool, and a fresh checkout with no
//   `.env` file at all has to run green.
//
//   Deliberately absent, therefore:
//     * The database driver, a connection, a pool and any call that executes
//       anything. Those belong to `src/repositories/mysql/connection.ts` and to
//       the adapter.
//     * Any `async`, any `await`, and any input or output of any kind.
//     * Row handling and entity hydration. This module never sees a row.
//     * `Money` and the decimal library. See the arithmetic note on the
//       ordering term below - there is no monetary value in this statement.
//     * Any `process.env` read, and any CONFIGURATION read. The dialect ARRIVES
//       as the builder's third argument, and the per-engine fragment is composed
//       by `src/repositories/mysql/dialect.ts`, which owns that comparison. A
//       superseded revision resolved the CONFIGURED dialect inside the builder
//       body instead, which made composing a string demand five `DB_*` values -
//       four of them unused - and broke the guarantee stated just above.
//     * A logging call. A builder that returns a string has nothing to report.
//     * The aggregate that produces the place-value weight. See the note on
//       where that resolution lives.
//     * A barrel, a re-export, and any second exported unit.
//
// THE BINDING STANDARD
//   No user-specified rules were provided for this project: the rules document
//   is a single sentence saying exactly that, and reading it twice - once
//   unbounded and once over its full range - returns the same sentence. No rule
//   has been invented to fill the gap, and the absence is not treated as licence
//   to lower the bar. The enterprise substitute standard applies at full force,
//   and the practices that bear on this file are maximal strictness with no
//   `any` and no suppression comment, exclusively parameterized SQL with every
//   value bound as a placeholder, one exported unit with no barrel,
//   environment-driven configuration reached only through the module that owns
//   it, and an in-code annotation at every judgment call and every preserved
//   semantic.
//
//   No non-functional requirement is asserted anywhere in this file, because the
//   legacy source states none and none may be invented.
//
// TEST COVERAGE
//   NET-NEW, and stated as such rather than presented as parity. No legacy test
//   touches `SkuDAO.cfc`: the legacy DAO suites cover only AccountDAO and
//   PaymentDAO, and the only legacy suites extended anywhere in this port are
//   `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc`. The obligations this module
//   carries are (a) the emitted text matches the legacy MySQL arm clause for
//   clause, (b) there are exactly two bound parameters and they appear in
//   emitted-text order, (c) the number of `?` placeholders in the text equals
//   the number of bound parameters, (d) a non-MySQL dialect is refused rather
//   than served the MySQL text, and (e) the builder is a PURE FUNCTION of its
//   three arguments - it opens no connection, executes nothing, and reads no
//   configuration and no environment, so a suite exercises it with no `.env` and
//   no `DB_*` variable at all, which is the contract `tests/setup.ts` states. The
//   dialect fragment itself is separately reachable through
//   `optionGroupOdometerPowerFragment` in `../dialect.ts`, which is where the
//   per-engine assertions belong.
// ---------------------------------------------------------------------------

// The `DatabaseDialect` TYPE is imported because the dialect is now part of this
// module's surface: it ARRIVES as the builder's third argument rather than being
// read from the process environment mid-request. See the `@param dialect` note and
// the builder's own comment for the runtime finding that forced the change and the
// three obligations the superseded ambient read broke.
import type { DatabaseDialect } from '../dialect.js';
import { optionGroupOdometerPowerFragment } from '../dialect.js';

/**
 * The option-group sort-order COLUMN of the place-value term, as a
 * dot-qualified identifier.
 *
 * AN IDENTIFIER, NOT AN EXPRESSION. An earlier revision held the whole exponent
 * here as SQL text - `'? - SwOptionGroup.sortOrder'` - and handed it to the
 * fragment builder, which admitted arbitrary expression text behind a character
 * allowlist. The exponent's shape is fixed by the legacy source, so describing it
 * in SQL at the call site bought nothing and cost a genuine injection surface;
 * `../dialect.js` now composes the operator and the placeholder itself and this
 * constant supplies only the column. The emitted text is unchanged.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L197]: the legacy exponent is
 * `#getNextOptionGroupSortOrder()# - SwOptionGroup.sortOrder`. Operand order, the
 * subtraction and the single space either side of the operator are all reproduced
 * by the fragment builder; only the interpolation becomes a placeholder.
 */
const ODOMETER_SORT_ORDER_COLUMN = 'SwOptionGroup.sortOrder';

/**
 * A statement ready to hand to a prepared-statement call: the text, and the
 * values to bind to its placeholders in order.
 *
 * Not exported. This module exposes exactly one unit - the builder - and the
 * shape below is structural, so the adapter consumes it without naming it and
 * without importing anything from here beyond the function.
 */
interface SortedProductSkusStatement {
  /**
   * The statement text, with one `?` placeholder per bound value and no
   * interpolated value of any kind.
   */
  readonly sql: string;

  /**
   * The values to bind, in the order their placeholders appear in `sql`.
   *
   * A fixed-length tuple rather than an open array, deliberately: the arity and
   * the order are part of this statement's contract, so `[productID, weight]`
   * is a compile-time fact instead of something a reader has to count. There
   * are exactly two placeholders in the text and exactly two members here.
   *
   * Frozen at construction as well as typed `readonly`, because the type alone
   * is a compile-time claim that erases at emit - and the two elements have
   * DIFFERENT meanings, so a runtime reorder would bind the option-group weight
   * to `SwProduct.productID` rather than merely shuffling equivalents. The
   * executor copies the array before handing it to the driver
   * [slatwall-ts/src/repositories/mysql/connection.ts:L551].
   */
  readonly params: readonly [string, number];
}

/**
 * Build the statement that returns one product's SKU identifiers in
 * option-group odometer order.
 *
 * Legacy: `model/dao/SkuDAO.cfc:L172-L202`, whose `<cfquery>` body at L178-L199
 * is reproduced verbatim inside this function as an exhibit sitting directly
 * above the emitted text, so that the two formulations can be read side by side.
 *
 * The projection is deliberately the single column `SwSku.skuID` and is NOT
 * widened. The legacy method name says identifiers and the query delivers
 * identifiers; anything the adapter needs beyond them is the adapter's own
 * statement to write.
 *
 * Nothing is added that the legacy lacks. There is no row-limiting clause, no
 * de-duplication, no null-coalescing, no aggregate filter, no outer join, no set
 * operation, no set-membership function, no index hint, no second sort key and
 * no extra grouping column - because the legacy query has none of them and each
 * one would change either the rows returned or the order they arrive in.
 *
 * No validation, trimming or emptiness check is applied to `productID` either.
 * The legacy body applies none, and a value that travels as a bound placeholder
 * needs none.
 *
 * @param productID - The product whose SKUs are ordered. Bound as the FIRST
 *   parameter, matching where it appears in the emitted text. Declared
 *   `type="string" required="true"` at `model/dao/SkuDAO.cfc:L173`, so it is
 *   modelled as a required, non-optional parameter: this statement has no
 *   optional-argument semantics at all, unlike the selected-options statement
 *   whose legacy body tests `structKeyExists` before adding a predicate.
 * @param nextOptionGroupSortOrder - The next available option-group sort order,
 *   already resolved, which sets the place value of each odometer digit. Bound
 *   as the SECOND parameter.
 * @param dialect - The ALREADY-RESOLVED database dialect, used for one purpose
 *   only: selecting the odometer place-value term through
 *   `optionGroupOdometerPowerFragment`. It is NOT bound as a parameter and never
 *   reaches a value position in the emitted text. See the body for why it is an
 *   argument.
 * @returns The statement text and the two values to bind to it, in order.
 * @throws An error named `UnsupportedDialectError` when the supplied `dialect`
 *   is `MicrosoftSQLServer` or `Oracle10g`. That arm exists in the legacy source
 *   and is therefore reproducible, but it is not implemented by this port, and
 *   emitting the MySQL text under another engine's name would silently change
 *   the ordering. There is no fallback and no default, which is what preserves
 *   the legacy behaviour of failing outright rather than guessing at a dialect.
 *   `ConfigurationError` and `UnrecognizedDialectError` are no longer reachable
 *   from here at all - see the note in the body.
 *   `SqlFragmentInputError` is structurally unreachable from here, because the
 *   only fragment argument this module passes is the module-level constant above.
 */
export function buildSortedProductSkusStatement(
  productID: string,
  nextOptionGroupSortOrder: number,
  dialect: DatabaseDialect,
): SortedProductSkusStatement {
  // QUOTE-THEN-REVISE, AND THE OLD SENTENCE DEFENDED A DEFECT. This comment used
  // to open: "THE BUILDER TAKES EXACTLY TWO ARGUMENTS - `productID` and
  // `nextOptionGroupSortOrder` - and the dialect is NOT among them", and justified
  // resolving it here with `resolveConfiguredDialect()` because "the engine is read
  // at the query site itself through `getApplicationValue("databaseType")`
  // [model/dao/SkuDAO.cfc:L194]" and "neither legacy method declared a dialect
  // argument" [model/dao/SkuDAO.cfc:L173]. The CFML observation is correct and the
  // conclusion drawn from it was not: `getApplicationValue` read APPLICATION scope,
  // which the legacy resolved ONCE at startup [config/configORM.cfm:L1-L15],
  // whereas `resolveConfiguredDialect()` reads `appConfig.load()` - and therefore
  // the process `DB_*` environment - ON EVERY CALL, mid-request. That is ambient
  // state, and AAP transformation rule T6 replaces ambient scope with an explicit
  // parameter passed down the call chain - "No ambient state" - rather than
  // reproducing it.
  //
  // Runtime testing measured the cost, which was concrete rather than theoretical.
  // Because `resolveConfiguredDialect()` loads the validated application
  // configuration, COMPOSING A STRING demanded `DB_HOST`, `DB_USER`, `DB_PASSWORD`,
  // `DB_TLS_MODE` and `DB_DIALECT` - four of which this builder never uses - which
  // broke the EMPTY-ENVIRONMENT GUARANTEE stated in `tests/setup.ts`. Under the
  // sanctioned credential-free composition (`bootstrapCompositionRoot({ environment,
  // executor })`, which exists because "a committed suite may not carry a host, an
  // account name or an authentication value") the five no-default keys are absent
  // from `process.env`, so this read THREW `ConfigurationError` and took
  // `MysqlSkuRepository.getSortedProductSkusID` - and with it
  // `SkuService.getSortedProductSkus` and `getProductSkus(sorted=true)` - down with
  // it, on a checkout that is otherwise fully testable.
  //
  // SO THE DIALECT IS A PARAMETER NOW, AND THAT IS AAP T6 APPLIED LITERALLY:
  // ambient state replaced by an explicit argument passed down the call chain, with
  // AAP 0.4.3 asking for exactly this - the dialect-branching SQL sites expressed as
  // DIALECT-PARAMETERIZED fragments. The sibling
  // `./accountSubscriptionPriceGroups.sql.ts` had already reached the opposite and
  // correct conclusion for the same kind of fragment and named this module as the
  // divergent one; the divergence is closed, and a statement builder may not read
  // configuration or the environment at all.
  //
  // WHAT THAT DOES NOT CHANGE: `../mysqlSkuRepository.js` supplies the engine its
  // statements are written for as a module constant pinned by `assertMySqlDialect`,
  // which is what `../mysqlProductRepository.js`, `../mysqlProductTypeRepository.js`
  // and `../mysqlPriceGroupRepository.js` already did, so no caller can ask for one
  // engine's ordering while running against another - the property the superseded
  // arrangement was trying to protect is protected by the constant instead - and the
  // composition root still refuses any engine but MySQL before a repository exists.
  // Nothing about module load changed either: this module read no configuration at
  // import time before, and now reads none at call time either.

  // JUDGMENT CALL: the legacy dialect test at model/dao/SkuDAO.cfc:L194 is `databaseType eq
  // "MicrosoftSQLServer"`, so MySQL falls through to the <cfelse> arm at L197 - the plain, uncast
  // POWER(10, ...) form. The MSSQL arm (L195) casts BOTH the base and the exponent to bigint. This
  // module targets the MySQL arm and delegates the dialect decision to ../dialect.js, which owns the
  // comparison because the source spells MySQL inconsistently across files.
  //
  // JUDGMENT CALL: the odometer weight is float arithmetic inside an ORDER BY expression, not a
  // monetary value, so E4 (single arithmetic surface / no raw float on money) does not reach it. Money
  // and decimal.js are deliberately absent here. Reproduced exactly as
  // model/dao/SkuDAO.cfc:L197 writes it. Do not substitute a decimal type, a padded string
  // concatenation or a window-function ranking for the power term.
  const odometerPowerTerm = optionGroupOdometerPowerFragment(dialect, ODOMETER_SORT_ORDER_COLUMN);

  // CFML parity [model/dao/SkuDAO.cfc:L179-L180]: the projection is exactly one column,
  // `SwSku.skuID`, and it stays one column.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L181-L188]: the three INNER JOINs are load-bearing - a SKU with
  // no option rows is excluded from the result entirely. Do not convert any join to an outer join.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L190]: the product predicate was already a `<cfqueryparam>` with
  // `cfsqltype="cf_sql_varchar"`, so it carries straight across as a bound placeholder.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L191-L198]: the grouping is the same single column as the
  // projection, and the `SUM(...)` aggregate appears ONLY in `ORDER BY`, never in the select list -
  // which is what makes one row per SKU legal under `ONLY_FULL_GROUP_BY` despite one joined row per
  // option. Neither is changed: no column joins the grouping and the aggregate is not promoted into
  // the projection.

  /*
   * VERBATIM LEGACY SQL - model/dao/SkuDAO.cfc:L179-L198, the body of the
   * `<cfquery name="sorted">` that opens at L178 and closes at L199. Reproduced
   * so a reviewer can diff it against the emitted text below clause for clause.
   * Only the leading TAB indentation is rendered as spaces, so that the exhibit
   * sits inside this space-indented file; no other character is altered, and the
   * long MSSQL arm is left unwrapped for the same reason.
   *
   *   179:  SELECT
   *   180:      SwSku.skuID
   *   181:  FROM
   *   182:      SwSku
   *   183:    INNER JOIN
   *   184:      SwSkuOption on SwSku.skuID = SwSkuOption.skuID
   *   185:    INNER JOIN
   *   186:      SwOption on SwSkuOption.optionID = SwOption.optionID
   *   187:    INNER JOIN
   *   188:      SwOptionGroup on SwOption.optionGroupID = SwOptionGroup.optionGroupID
   *   189:  WHERE
   *   190:      SwSku.productID = <cfqueryparam value="#arguments.productID#" cfsqltype="cf_sql_varchar" />
   *   191:  GROUP BY
   *   192:      SwSku.skuID
   *   193:  ORDER BY
   *   194:      <cfif getApplicationValue("databaseType") eq "MicrosoftSQLServer">
   *   195:          SUM(SwOption.sortOrder * POWER(CAST(10 as bigint), CAST((#getNextOptionGroupSortOrder()# - SwOptionGroup.sortOrder) as bigint))) ASC
   *   196:      <cfelse>
   *   197:          SUM(SwOption.sortOrder * POWER(10, #getNextOptionGroupSortOrder()# - SwOptionGroup.sortOrder)) ASC
   *   198:      </cfif>
   */

  // TODO [model/dao/SkuDAO.cfc:L177] carried forward CHARACTER FOR CHARACTER, and deliberately not
  // discharged: the engines it names are the ones this port does not implement, so completing it would
  // mean building and testing an arm the migration excludes. `../dialect.js`, `../mysqlSkuRepository.ts`
  // and `../../../handlers/skuResolutionHandler.ts` carry the same marker for the same statement.
  //
  // TODO: test to see if this query works with DB's other than MSSQL and MySQL
  const sql = `SELECT
    SwSku.skuID
FROM
    SwSku
  INNER JOIN
    SwSkuOption on SwSku.skuID = SwSkuOption.skuID
  INNER JOIN
    SwOption on SwSkuOption.optionID = SwOption.optionID
  INNER JOIN
    SwOptionGroup on SwOption.optionGroupID = SwOptionGroup.optionGroupID
WHERE
    SwSku.productID = ?
GROUP BY
    SwSku.skuID
ORDER BY
    SUM(SwOption.sortOrder * ${odometerPowerTerm}) ASC`;

  // JUDGMENT CALL: legacy string-interpolated #getNextOptionGroupSortOrder()#; bound as a parameter per
  // E5. Identical semantics - the value is a computed integer, not user input.
  //
  // JUDGMENT CALL: resolving that value, including the fallback its legacy accessor applies when the
  // aggregate finds no row, belongs to the adapter [model/dao/SkuDAO.cfc:L204-L220] and not to this
  // module, which accepts the resolved integer as an argument; that is what keeps this builder pure and
  // synchronous, and it is why no aggregate and no correlated subquery is emitted to compute it here.
  // FROZEN, BOTH LEVELS. The tuple TYPE above states the arity and the order, but
  // `readonly` is erased at emit and a tuple is an ordinary array at runtime: a
  // caller could otherwise swap the two elements and silently bind the sort-order
  // weight to `SwProduct.productID`. `Object.freeze` is shallow, so the enclosing
  // object is frozen separately from the array it points at - freezing only the
  // outer object would leave the bind values mutable while every type in sight
  // claimed they were not.
  const params: readonly [string, number] = Object.freeze([
    productID,
    nextOptionGroupSortOrder,
  ] as const);

  return Object.freeze({ sql, params });
}
