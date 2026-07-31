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
//   The consumer is `src/repositories/mysql/mysqlSkuRepository.ts` (planned), which
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
//     * Any `process.env` read. Dialect selection is delegated in full to
//       `src/repositories/mysql/dialect.ts`, which owns that decision, and it is
//       invoked from inside the builder rather than at module load, so importing
//       this module resolves no configuration and can fail for no reason.
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
//   than served the MySQL text, and (e) the builder is deterministic given the
//   configured dialect - it opens no connection and executes nothing. The
//   builder takes exactly the two arguments the legacy method declares, so a
//   suite that exercises it sets `DB_DIALECT` in the test environment; the
//   dialect fragment itself is separately reachable through
//   `optionGroupOdometerPowerFragment` in `../dialect.ts`, which is where the
//   per-engine assertions belong.
// ---------------------------------------------------------------------------

// The `DatabaseDialect` TYPE is deliberately not imported. The dialect never
// appears in this module's surface - it is resolved inside the builder and
// consumed immediately - so naming the type here would be an unused import under
// `noUnusedLocals`, and re-exposing it would reopen the parameter this builder
// does not take.
import { optionGroupOdometerPowerFragment, resolveConfiguredDialect } from '../dialect.js';

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
 * @returns The statement text and the two values to bind to it, in order.
 * @throws An error named `UnsupportedDialectError` when the configured dialect
 *   is `MicrosoftSQLServer` or `Oracle10g`. That arm exists in the legacy source
 *   and is therefore reproducible, but it is not implemented by this port, and
 *   emitting the MySQL text under another engine's name would silently change
 *   the ordering. Resolution can also raise `ConfigurationError` when the
 *   environment contract is unsatisfied, or `UnrecognizedDialectError` for an
 *   unknown spelling; neither has a fallback, which is what preserves the legacy
 *   behaviour of failing outright rather than guessing at a dialect.
 *   `SqlFragmentInputError` is structurally unreachable from here, because the
 *   only fragment argument this module passes is the module-level constant above.
 */
export function buildSortedProductSkusStatement(
  productID: string,
  nextOptionGroupSortOrder: number,
): SortedProductSkusStatement {
  // THE BUILDER TAKES EXACTLY TWO ARGUMENTS - `productID` and
  // `nextOptionGroupSortOrder` - and the dialect is NOT among them. This folder
  // reshapes no signature, and the dialect was never an argument of the legacy
  // method either: `model/dao/SkuDAO.cfc:L173` declares `required string
  // productID` and nothing else, and the engine is read at the query site itself
  // through `getApplicationValue("databaseType")` [model/dao/SkuDAO.cfc:L194].
  // Resolving it here rather than accepting it is therefore the faithful shape,
  // and it also removes the only way a caller could have asked for one engine's
  // ordering while running against another.
  //
  // JUDGMENT CALL: resolution happens HERE, inside the body, and never at module
  // load, so importing this module reads no configuration and cannot fail for no
  // reason. `DB_DIALECT` has no default and its absence is a hard error by
  // design, so a test that exercises this builder configures the environment -
  // `resolveConfiguredDialect()` is the single owner of that decision and
  // `optionGroupOdometerPowerFragment` can be exercised on its own for the
  // fragment-level assertions.
  const resolvedDialect = resolveConfiguredDialect();

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
  const odometerPowerTerm = optionGroupOdometerPowerFragment(
    resolvedDialect,
    ODOMETER_SORT_ORDER_COLUMN,
  );

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
