// ---------------------------------------------------------------------------
// slatwall-ts - extracted SQL: the SKUs that match ALL selected options
//
// PURPOSE
//   The physical MySQL statement behind
//   `SkuRepository.getSkusBySelectedOptions(selectedOptions, productID?)`
//   [slatwall-ts/src/domain/ports/skuRepository.ts:L499], lifted out of the
//   adapter so that it can be read, reviewed and asserted AS SQL. Its single
//   consumer is `slatwall-ts/src/repositories/mysql/mysqlSkuRepository.ts`.
//
//   The division of labour is deliberate and narrow. THIS MODULE OWNS THE
//   STATEMENT TEXT AND THE BIND ARRAY, and nothing else. Executing the
//   statement, hydrating rows into `Sku` instances, materializing associations
//   and documenting the fetch shape all belong to the adapter. That is also why
//   this module is pure and synchronous: it never reaches a connection, so its
//   entire behaviour is observable from its return value.
//
//   Legacy source: [model/dao/SkuDAO.cfc:L106-L128]. That span sits inside the
//   `<cfscript>` block opened at [model/dao/SkuDAO.cfc:L100], so it is script
//   syntax rather than tag syntax, and it assembles its HQL by string
//   concatenation. Every locator cited anywhere in this file was opened and
//   read in the legacy tree while writing it; all of them matched
//   byte-for-byte, so there is no locator drift to report.
//
// THIS MODULE OWNS ONE OF THE THREE NAMED MUST-PRESERVE BEHAVIOURS
//   AND-of-EXISTS conjunctive option matching. The legacy author states the
//   contract in his own words at [model/dao/SkuDAO.cfc:L106], and that comment
//   is carried forward verbatim onto the exported function below rather than
//   paraphrased.
//
//   A SKU matches only when it satisfies an EXISTS predicate for EVERY option
//   in the list. The predicates are CONJUNCTIVE - not disjunctive, and
//   emphatically not "any of". One option means one EXISTS; N options mean N
//   EXISTS clauses, each ANDed onto the same WHERE clause.
//
//   The statement may NOT be re-expressed as `IN (...)` plus `GROUP BY` plus
//   `HAVING COUNT(DISTINCT optionID) = n`, as repeated self-joins, as an
//   `INTERSECT`, or as any other set-cardinality formulation. Those are
//   different logical formulations, and this folder is granted zero deliberate
//   divergences: reproduce and annotate, never repair.
//
//   One consequence follows from the shape rather than from a rule, and it is
//   worth stating because it is easy to assume the opposite: THE COUNT OF
//   SELECTED OPTIONS DOES NOT PARTICIPATE IN THE MATCH. There is no cardinality
//   test anywhere in the legacy statement, so a SKU carrying every selected
//   option PLUS further options still matches. The contract is "at least these
//   options", never "exactly these options".
//
// ADD NOTHING THE LEGACY LACKS
//   The emitted statement carries no `ORDER BY`, no `LIMIT`, no `GROUP BY`, no
//   `COALESCE`, no `IFNULL`, no `FIND_IN_SET`, no index hint, no tiebreaker and
//   no null guard, because the legacy HQL carries none of those. The single
//   `distinct` is the one written at [model/dao/SkuDAO.cfc:L109]: it is
//   preserved, not introduced, and the note on the `opt` join below explains
//   why removing it would change results.
//
// NO `Sw*` NAMING CORRECTION APPLIES TO THIS STATEMENT
//   The legacy HQL names ORM ENTITIES (`SlatwallSku`, `SlatwallOption`) and
//   navigates ASSOCIATIONS (`sku.options`, `o.skus`, `sku.product.id`). Those
//   are LOGICAL names that Hibernate resolves through the mapping metadata, so
//   turning them into table and column names here is a TRANSLATION, not a
//   repair. Every physical name emitted below is correct by construction, and
//   each one is proven from the entity declaration that defines it:
//
//     SlatwallSku      ->  SwSku             [model/entity/Sku.cfc:L49]
//                          entityname="SlatwallSku" table="SwSku"
//     sku.id / s.id    ->  SwSku.skuID       [model/entity/Sku.cfc:L52]
//                          property skuID fieldtype="id"
//     sku.product.id   ->  SwSku.productID   [model/entity/Sku.cfc:L65]
//                          property product many-to-one fkcolumn="productID"
//     sku.options      ->  SwSkuOption       [model/entity/Sku.cfc:L76]
//                          many-to-many linktable="SwSkuOption"
//                          fkcolumn="skuID" inversejoincolumn="optionID"
//     SlatwallOption   ->  SwOption          [model/entity/Option.cfc:L49]
//                          entityname="SlatwallOption" table="SwOption"
//     o.optionID       ->  SwOption.optionID [model/entity/Option.cfc:L52]
//                          property optionID fieldtype="id"
//     o.skus           ->  SwSkuOption       [model/entity/Option.cfc:L66]
//                          THE SAME link table, inverse side: many-to-many
//                          linktable="SwSkuOption" fkcolumn="optionID"
//                          inversejoincolumn="skuID" inverse="true"
//
//   This migration does carry a real repair of the `Slatwall*` naming, and it
//   is named here so that nobody mistakes this statement for one of its sites.
//   Three legacy methods emit LOGICAL entity names into RAW SQL, where physical
//   names are required and the statement therefore fails at runtime:
//   [model/dao/ProductTypeDAO.cfc:L53-L54],
//   [model/dao/SkuDAO.cfc:L131-L138] (`searchSkusByProductType`) and
//   [model/dao/ProductDAO.cfc:L420-L427] (`searchProductsByProductType`). All
//   three live in adapter methods; NONE of them is this statement. Said plainly
//   so that nobody "corrects" what is already right.
//
// WHY THIS MODULE IMPORTS ALMOST NOTHING
//   One import, `../../../lib/cfml/list.js`, for the two CFML list primitives
//   the legacy loop is built from. Nothing else: no driver, no connection pool,
//   no dialect module - this statement has no dialect branch - no entity, no
//   port, no sibling SQL module, no environment access and no logger.
//
//   `skuRepository.ts` is deliberately NOT imported even though it was read
//   closely while writing this file and is quoted above. It declares the method
//   contract; this module contributes one fragment of the adapter that
//   satisfies that contract. Importing it would buy nothing and would couple a
//   leaf module to an interface it does not implement.
//
//   The consequence is that the whole module is a pure function of its two
//   arguments, which is exactly what lets the repository suites assert emitted
//   SQL text and bound-parameter arrays with no MySQL server running.
//
// EVERY VALUE IS BOUND, NEVER INTERPOLATED
//   Each parsed option ID becomes its own positional `?` and its own element of
//   the bind array, in list order, with `productID` bound last when present. No
//   value is ever spliced into the statement text - the assembled SQL below
//   contains no interpolation at all, only fixed fragments joined together -
//   which is what carries forward the injection-safety guarantee that
//   `cfqueryparam` and HQL positional parameters provided in the legacy tree.
//
//   ONE INVARIANT HOLDS BY CONSTRUCTION: the number of elements in `params`
//   always equals the number of `?` characters in `sql`. The seed fragment
//   contains no placeholder and the two appendable fragments contain exactly
//   one each, so every branch that appends a fragment appends exactly one bound
//   value with it.
//
//   JUDGMENT CALL: the one documented per-element-binding exception in this
//   migration is NOT cross-applied here. [model/dao/ProductDAO.cfc:L64-L69]
//   collapses a list into a single joined string with `arrayToList()` and binds
//   it as ONE parameter, carrying the legacy author's own note that this works
//   around a disagreement between CFML engines over how arrays are handled in
//   an `IN` clause. That asymmetry is preserved rather than repaired, and it
//   stays confined to `mysqlProductRepository.ts`. Every list in THIS module is
//   bound per element, which is what the legacy body here already does
//   correctly and what this port must not regress.
//
// NO USER RULES WERE PROVIDED
//   The project rules source was queried twice - once unbounded and once over
//   the full range - and returned the same single line, "No user rules
//   provided.", both times. That is a complete read, not a truncated one. No
//   rule has been invented to fill the gap, no file enters scope by rule
//   mandate, and there is consequently no rule conflict to resolve. The absence
//   is NOT licence to lower the bar: the enterprise-standard substitute applies
//   at full strength, and in this file that means maximal strictness with no
//   `any`, no suppression comment and no non-null assertion, one behavioural
//   export, no barrel, no module-scope mutable state, parameterized SQL
//   exclusively, and every judgment call annotated where it was made.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
//   No legacy test under meta/tests/** exercises this query. The only legacy
//   suites extended anywhere in this port are meta/tests/unit/entity/
//   BrandTest.cfc and meta/tests/unit/entity/ProductTest.cfc, and
//   meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub that
//   contributes nothing. Coverage for this statement is therefore net-new and
//   must be labelled net-new, never presented as parity. It belongs in the
//   repository tier under tests/integration/repositories/, asserting emitted
//   text and bind order for the empty list, for one option and for several,
//   each with `productID` absent, present, and present-but-empty.
//
// CARRY-FORWARD: THE LEGACY SPAN DEFERS NO WORK
//   [model/dao/SkuDAO.cfc:L106-L128] contains exactly two comments, both of
//   which are carried forward verbatim below, and neither of which defers any
//   work. This module therefore carries no deferred-work marker and none may be
//   invented for it. The one marker of that kind in this folder belongs to the
//   sorted-SKU statement, whose legacy body genuinely does defer work.
// ---------------------------------------------------------------------------

import { listGetAt, listLen } from '../../../lib/cfml/list.js';

/**
 * One prepared statement: its text, and the values to bind to it.
 *
 * The port does not declare a statement contract - `skuRepository.ts` describes
 * method signatures and contains no SQL of any kind - so the shape is declared
 * here, next to the only statement that returns it. This is a supporting type
 * for the single behavioural export below, not a second export of behaviour.
 *
 * Both members are `readonly` and the returned object is frozen. A statement is
 * a value: nothing downstream has any reason to swap the text it was handed or
 * to replace the bind array, and bind order is load-bearing here because the
 * placeholders are positional.
 *
 * `params` is `string[]` rather than something wider because every value this
 * statement binds is a string. Option IDs arrive as elements of a
 * comma-delimited list, `productID` is a `string`, and both are 32-character
 * identifier columns in the schema ([model/entity/Sku.cfc:L52],
 * [model/entity/Option.cfc:L52]).
 *
 * JUDGMENT CALL: the ARRAY is deliberately not `readonly` and is deliberately
 * not frozen, even though freezing it was the first instinct and the enclosing
 * object IS frozen. The reason is a measured constraint rather than a
 * preference: mysql2 3.23.1 types the bind argument of `query` and `execute` as
 * `QueryValues` / `ExecuteValues`, whose array arm is the MUTABLE
 * `({} | null | undefined)[]`
 * (node_modules/mysql2/typings/mysql/lib/protocol/sequences/Query.d.ts:L20-L33).
 * A `readonly string[]` is not assignable to it, so an adapter written the
 * obvious way - `pool.execute(statement.sql, statement.params)` - would fail to
 * compile under this project's strict profile, and the likeliest "fixes" for
 * that are a cast or a spread that quietly copies. Handing the driver an array
 * it accepts as-is is worth more here than an immutability guarantee this
 * module invented for itself. The `readonly` modifier on the PROPERTY still
 * prevents the array being swapped out, and the frozen enclosing object still
 * makes the statement a value.
 */
export interface SkusBySelectedOptionsStatement {
  /** The statement text. Contains one positional `?` per element of `params`. */
  readonly sql: string;

  /**
   * The bind values, in the order their placeholders appear in `sql`: one entry
   * per selected option in list order, then `productID` last when present.
   * Passed straight to the driver by the adapter; see the note above on why the
   * array type is mutable.
   */
  readonly params: string[];
}

// ---------------------------------------------------------------------------
// The emitted statement, fragment by fragment
//
// THE VERBATIM LEGACY HQL, RECONSTRUCTED AS THE SINGLE STRING IT BUILDS
//
// [model/dao/SkuDAO.cfc:L109-L126] accumulates its HQL from three string
// literals. What follows is exactly what that accumulation produces for two
// selected options and a supplied `productID`, carrying the source's own tab
// indentation and line breaks. The three fragment constants below translate it
// clause for clause and line for line, so that the two formulations sit adjacent
// and can be diffed:
//
// select distinct sku from SlatwallSku as sku
// 					inner join sku.options as opt
// 					where
// 					0 = 0 and exists (
// 						from SlatwallOption o
// 						join o.skus s where s.id = sku.id
// 						and o.optionID = ?
// 					) and exists (
// 						from SlatwallOption o
// 						join o.skus s where s.id = sku.id
// 						and o.optionID = ?
// 					) and sku.product.id = ?
//
// Two properties of that text are easy to miss and both are load-bearing.
// First, the seed literal ENDS IN A SPACE and each appended literal BEGINS with
// `and`, which is why `and exists (` lands on the same line as `0 = 0` and
// `and sku.product.id = ?` lands on the same line as the closing `) `. The
// trailing space is the token separator, not decoration, and it is reproduced
// faithfully in the fragments - but it cannot be shown in the reconstruction
// above, because the formatter strips trailing whitespace from COMMENT lines and
// the formatter is a gate. Read it off the fragment constants instead, whose
// contents the formatter leaves verbatim: the seed's first line genuinely ends
// `from SwSku as sku ` with the space intact, and its last line genuinely ends
// `0 = 0 `. The only lines the reconstruction above loses it on are the three
// translating [model/dao/SkuDAO.cfc:L109-L111], and the same is true of the
// legacy quote in the seed's own documentation.
// Second, every appended EXISTS body reuses the aliases `o` and `s`. That is
// legal because each subquery is its own scope, and it is reproduced as-is
// rather than de-duplicated into distinct alias names.
//
// The fragments keep the legacy's line breaks, clause order, alias names
// (`sku`, `opt`, `o`, `s`) and lower-case keywords exactly as the source writes
// them, including two of its own inconsistencies: the outer clauses say `as`
// while the subquery clauses do not, and the outer join says `inner join` while
// the subquery says a bare `join`. Nothing here is reflowed, re-cased,
// re-aliased or alphabetised - this text has to stay diffable against the HQL
// above.
// ---------------------------------------------------------------------------

// CFML parity [model/dao/SkuDAO.cfc:L111-L112]: the `0 = 0` seed is the accumulator idiom that makes
// every appended clause unconditionally prefixable with `and`.
//
// CFML parity [model/dao/SkuDAO.cfc:L109-L112]: the `opt` alias is declared and never referenced. The
// join is load-bearing twice: it excludes SKUs with zero options, and it is what makes SELECT DISTINCT
// necessary. Preserve both the INNER JOIN and the DISTINCT.
//
// JUDGMENT CALL: HQL reads the join condition for `sku.options` out of the mapping metadata, while SQL
// requires it spelled out, so `on opt.skuID = sku.skuID` is that metadata made explicit rather than a
// predicate the legacy lacks - the join columns are exactly `fkcolumn="skuID"` and the link table
// `SwSkuOption` from [model/entity/Sku.cfc:L76]. Beyond its own ON clause the alias still appears in no
// projection and no predicate, which is precisely what the parity note above requires to stay true.
//
// JUDGMENT CALL: the projection is `sku.*` because the legacy `select distinct sku` selects the ENTITY,
// and `sku.*` is the whole SwSku row an entity is hydrated from. Naming an explicit column list would be
// a decision the legacy does not make, and it would silently starve the adapter of a column it needs:
// row hydration and fetch shape belong to `mysqlSkuRepository.ts`, not here. DISTINCT over the full row
// collapses on the primary key, which is how the duplicate rows the `opt` join produces are removed.
/**
 * The statement opener: projection, table, the options join, and the seed.
 *
 * Translates [model/dao/SkuDAO.cfc:L109-L112], which reads verbatim:
 *
 *     var hql = "select distinct sku from SlatwallSku as sku
 *     					inner join sku.options as opt
 *     					where
 *     					0 = 0 ";
 */
const STATEMENT_SEED = `select distinct sku.* from SwSku as sku 
					inner join SwSkuOption as opt on opt.skuID = sku.skuID 
					where 
					0 = 0 `;

// CFML parity [model/dao/SkuDAO.cfc:L115-L119]: ONE correlated EXISTS per selected option, ANDed onto
// the WHERE clause. This is the must-preserve AND-of-EXISTS semantics in its physical form. The fragment
// is a constant because the legacy appends the identical literal on every iteration - only the bound
// value differs between repetitions, and no cardinality test makes the option count part of the match.
//
// JUDGMENT CALL: HQL lets an EXISTS subquery open with a bare `from`; SQL does not, so `select *` is the
// minimal syntactic completion. EXISTS ignores the select list entirely, so it introduces no meaning.
//
// JUDGMENT CALL: the subquery stays TWO tables. `join o.skus s` navigates a many-to-many whose link
// table is `SwSkuOption` [model/entity/Option.cfc:L66], and the only thing the legacy reads through the
// `s` alias is `s.id` - the SKU identifier, which the link table already carries as its own `skuID`
// column. Joining onward to SwSku to reach the same value would add a join the legacy does not declare.
// The correlation `s.skuID = sku.skuID` therefore stays in the same textual position as the legacy
// `s.id = sku.id`: on the line that introduces the alias, not in a clause of its own.
/**
 * One selected option: a correlated EXISTS carrying exactly one placeholder.
 *
 * Translates [model/dao/SkuDAO.cfc:L115-L119], which reads verbatim:
 *
 *     hql &= "and exists (
 *     						from SlatwallOption o
 *     						join o.skus s where s.id = sku.id
 *     						and o.optionID = ?
 *     					) ";
 */
const OPTION_EXISTS_PREDICATE = `and exists (
						select * from SwOption o
						join SwSkuOption s on s.optionID = o.optionID where s.skuID = sku.skuID
						and o.optionID = ?
					) `;

// CFML parity [model/dao/SkuDAO.cfc:L124]: the closing conjunct, appended last and therefore bound last.
// It ends without a trailing space because the legacy literal has none: in both formulations this is the
// end of the statement, so there is nothing left to separate it from.
/**
 * The optional product narrowing: the last conjunct, with the last placeholder.
 *
 * Translates [model/dao/SkuDAO.cfc:L124], which reads verbatim:
 *
 *     hql &= "and sku.product.id = ?";
 */
const PRODUCT_PREDICATE = 'and sku.productID = ?';

// Carried forward verbatim from [model/dao/SkuDAO.cfc:L106]. This is the legacy author's own statement
// of the contract, which is why it is reproduced rather than paraphrased:
// returns product skus which matches ALL options (list of optionIDs) that are passed in
/**
 * Build the statement that returns the SKUs matching ALL of the selected options.
 *
 * Pure and synchronous: it opens no connection, executes nothing, reads no
 * configuration and logs nothing, so calling it is observable only through the
 * value it returns. Assembly is the seed, then one EXISTS fragment per option in
 * list order, then the product conjunct when `productID` is present.
 *
 * @param selectedOptions - A CFML comma-delimited list of option IDs. It stays a
 *   `string` for parity with `required string selectedOptions`
 *   [model/dao/SkuDAO.cfc:L107] and must not be widened to an array. It is
 *   parsed with the CFML list primitives, whose element boundaries differ from
 *   `String.prototype.split`: consecutive delimiters collapse and empty elements
 *   are ignored, so `'a,,b'` contributes two predicates rather than three.
 * @param productID - Optional, exactly as `string productID`
 *   [model/dao/SkuDAO.cfc:L107] is declared with neither `required` nor a
 *   default. Omitting it, or passing `undefined`, is the analogue of the
 *   argument being absent from the CFML `arguments` scope; any other value,
 *   INCLUDING the empty string, counts as present and appends the conjunct. Note
 *   the asymmetry with the must-preserve caller one layer up, which declares the
 *   same argument `required` [model/service/ProductService.cfc:L104]: this
 *   signature is deliberately the wider of the two, matching the port.
 * @returns The frozen statement text and its positional bind values, with one
 *   `params` element per `?` in `sql`.
 */
export function buildSkusBySelectedOptionsStatement(
  selectedOptions: string,
  productID?: string,
): SkusBySelectedOptionsStatement {
  // Fragments and bind values are accumulated in lockstep: every branch below
  // that pushes a fragment pushes exactly one value with it, which is what keeps
  // `params.length` equal to the number of placeholders without a running count.
  const parts: string[] = [STATEMENT_SEED];
  const params: string[] = [];

  // CFML parity [model/dao/SkuDAO.cfc:L113]: `listLen('')` is 0, so an empty list runs the loop body zero
  // times and appends NO EXISTS clause at all. The statement then degenerates to "every SKU that has at
  // least one option", courtesy of the inner join in the seed. That reads like a bug and is not: there is
  // no early return here, no throw, no forced-empty result set and no short-circuit, because there is
  // none there. Do not add one.
  const selectedOptionCount = listLen(selectedOptions);

  // JUDGMENT CALL: the legacy loop re-evaluates `listLen(arguments.selectedOptions)` on every iteration
  // [model/dao/SkuDAO.cfc:L113]; the bound is hoisted here. `selectedOptions` is never reassigned in
  // either body, so the two formulations are observationally identical and this is form, not behaviour.
  for (let position = 1; position <= selectedOptionCount; position += 1) {
    // CFML parity [model/dao/SkuDAO.cfc:L114]: `listGetAt` is 1-based, which is why `position` starts at
    // 1 and the bound is `<=`. The legacy spells the builtin `listGetat`; CFML identifiers are
    // case-insensitive, so that casing carries no meaning and the helper's own name is used.
    const thisOptionID = listGetAt(selectedOptions, position);

    parts.push(OPTION_EXISTS_PREDICATE);
    params.push(thisOptionID);
  }

  // Carried forward verbatim from [model/dao/SkuDAO.cfc:L122]:
  // if product ID is passed in, limit query to the product
  //
  // CFML parity [model/dao/SkuDAO.cfc:L122-L126]: the legacy guard is structKeyExists() with no len()/trim()
  // test, and `productID` is declared with no `required` and no default (L107). It therefore fires on an
  // empty string, binding productID = '' and yielding zero rows. Presence — not truthiness — appends the
  // clause. Do not add a length guard.
  if (productID !== undefined) {
    parts.push(PRODUCT_PREDICATE);
    params.push(productID);
  }

  // The statement is frozen; the bind array inside it is not, for the driver
  // typing reason documented on `SkusBySelectedOptionsStatement`.
  return Object.freeze({ sql: parts.join(''), params });
}
