/**
 * `MySqlOptionRepository` — the ported `model/dao/OptionDAO.cfc`. **NET-NEW** in its entirety.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/adapters/MySqlOptionRepository.test.ts` | CREATE
 * | "**NET-NEW**", and the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * PROVENANCE — WHY EVERY CASE HERE IS **NET-NEW**, AND WHAT THAT COSTS
 * =============================================================================================
 * No legacy `OptionDAOTest` exists anywhere under `meta/tests/`, so nothing below extends a legacy
 * assertion and no case is labelled as though it did (AAP 0.8.3.7). Every `describe` and every `it`
 * name carries **NET-NEW** for that reason: the label is the honest answer to the standing question
 * of whether a port replicates existing tests or quietly writes new ones, and here the answer is
 * "new ones", stated per case rather than buried in an aggregate.
 *
 * `meta/tests/unit/dao/AccountDAOTest.cfc` was read for SHAPE ONLY and **no content was ported from
 * it**. It is one of exactly two DAO test files the legacy suite contains — `PaymentDAOTest.cfc` is the
 * other, and both cover excluded domains — so neither is a counterpart to an option DAO test. It
 * resolves a DAO by string through the request scope in `setUp()` [`:L55`] and then asserts a single
 * `isObject` [`:L58-L60`]. It says nothing about statement text, bound parameters, row ordering or
 * projection shape, which are the four things this file exists to pin, so there was nothing in it to
 * carry across. Its shape is also why the two suites differ structurally (AAP 0.4.3.6): that case boots
 * the whole FW/1 application and resolves its collaborator dynamically, whereas every case below
 * constructs the adapter directly over an injected double.
 *
 * TRACEABILITY IS DOCUMENTARY, AND THE CONSTRAINT IS STATED RATHER THAN IMPLIED. MXUnit and CFSelenium
 * are not vendored in this repository; `meta/docker/slatwall-local-dev/` does not exist; and no
 * ColdFusion, Railo or Lucee engine is available here. The CFML runtime is therefore not reproducible
 * and the legacy suite cannot be executed at all. Every expectation below was derived by INSPECTING
 * `model/dao/OptionDAO.cfc`, and **no runtime behavioural comparison against the legacy system was
 * performed**. These cases pin the port against a reading of the source, which is what the available
 * evidence supports; they are not evidence of observed parity.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS
 * =============================================================================================
 * THE ADAPTER'S WHOLE PUBLIC SURFACE — all five members, not only the two ported ones. The two
 * ported members carry the legacy behaviour and are the subject of most of the file; the three
 * additive members are covered because they are LIVE public code, and an uncovered live member can be
 * removed or inverted with every case here still passing.
 *
 * The two members of `model/dao/OptionDAO.cfc`:
 * `getUnusedProductOptions` [`:L51-L92`] ported as `findUnusedOptions`, and
 * `getUnusedProductOptionGroups` [`:L94-L117`] ported as `findUnusedOptionGroups` (AAP 0.4.2.6).
 *
 * The three members with NO legacy counterpart, each covered in its own suite at the foot of this
 * file and each labelled **NET-NEW** for a second reason — not merely "no legacy test exists", but
 * "no legacy MEMBER exists":
 *   * `withExecutor(executor)` — re-binding to a transaction-scoped executor, which exists because
 *     mismatch M5 removed the ambient ORM session a legacy DAO simply participated in.
 *   * `findUnusedOptionsBounded(window, …)` and `findUnusedOptionGroupsBounded(window, …)` — the
 *     windowed forms of the two ported reads. Neither legacy statement carries a row cap, so the
 *     window is additional surface rather than a port of anything; what its cases assert is that it
 *     is additional and NOTHING ELSE — the same statement, the same bind order, the same polarity,
 *     with a `LIMIT`/`OFFSET` pair appended past the `ORDER BY` and bound last.
 *
 * Four properties carry the behaviour, and each one is a place where a plausible tidy-up changes
 * results with no error and no compile failure. They are the subject of the suites below:
 *
 *   1. THE SET OPERATOR. The first statement filters candidate groups with `IN` [`:L68`]; the second
 *      filters the same argument with `NOT IN` [`:L107`]. One token apart, opposite questions.
 *   2. THE BIND ORDER. The signature is `(productID, existingOptionGroupIDList)` [`:L52-L53`] but the
 *      statement binds the group list FIRST [`:L68`] and the product identifier SECOND [`:L78`].
 *      Both are strings, so a transposition compiles, throws nothing, and returns the wrong rows.
 *   3. THE PLACEHOLDER COUNT. One bind marker per comma-list element, empties and duplicates
 *      included — so the empty string yields ONE marker bound to `''`, never zero.
 *   4. THE PROJECTION. One member composes a two-part drop-down label [`:L88`]; the other returns a
 *      bare group name [`:L113`]. The two row shapes are identical and their meanings are not.
 *
 * NO DATABASE, AND NO MOCKING LIBRARY. Each case constructs the adapter over the recording executor
 * double the suite already owns (`../support/inMemoryRepositories`) and asserts the statement text and
 * the bound parameter array it captured. That is the only way this adapter is assertable here — the
 * legacy suite has no mocking library to imitate and no engine is available — and it is what AAP
 * 0.7.3 standard 6 asks for. The adapter takes its executor as a constructor parameter, so
 * substitution needs nothing more (AAP 0.7.3 standard 3).
 *
 * =============================================================================================
 * THIS DAO CARRIES NO DEFECT, AND SAYING SO IS PART OF THE JOB
 * =============================================================================================
 * `model/dao/OptionDAO.cfc` binds every one of its three value positions through `<cfqueryparam>` —
 * at `:L68`, `:L78` and `:L107` — and names only correct physical tables (`SwOption`,
 * `SwOptionGroup`, `SwSkuOption`, `SwSku`). It therefore carries NEITHER the interpolated-statement
 * defect registered against `model/dao/ProductDAO.cfc` NOR the logical/physical table-name divergence
 * registered against its sibling DAOs, and no annotation for either appears in this file. Nothing
 * below is a hardening exception, and no new defect or mismatch identifier is minted here: using
 * bound parameters throughout is ordinary compliance with AAP 0.7.3 standard 2, not a departure from
 * behaviour preservation. Silence would have invited a later reader to "harden" a component that
 * needs no hardening, so the absence is recorded deliberately.
 *
 * =============================================================================================
 * WHAT THIS FILE DELIBERATELY DOES NOT TOUCH
 * =============================================================================================
 *   * `getProductOptionsByGroup` [`model/entity/Product.cfc:L631-L633`], which delegates to a
 *     `ProductService` member that exists nowhere in the repository. It is an out-of-scope defect and
 *     is neither exercised nor repaired here.
 *   * THE DEAD `productService` INJECTION at `model/service/OptionService.cfc:L53`, which has zero
 *     call sites (AAP 0.6.3.4) and is wired into nothing — least of all into this adapter.
 *   * EVERY EXCLUDED CALCULATED MEMBER and every real inventory, stock or pricing collaborator. Both
 *     ported statements read `SwOption`, `SwOptionGroup`, `SwSkuOption` and `SwSku` and nothing else.
 */
import { MySqlOptionRepository } from '../../src/adapters/mysql/MySqlOptionRepository';
import { assertColumnName, assertTableName } from '../../src/adapters/mysql/QueryRunner';
import { createSqlExecutorDouble, sqlRows } from '../support/inMemoryRepositories';

import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../src/ports/repositories/OptionRepository';
import type {
  SqlExecutorCall,
  SqlExecutorDouble,
  SqlExecutorOutcome,
  SqlExecutorResponder,
} from '../support/inMemoryRepositories';

/* ===============================================================================================
 * IDENTIFIERS, RESOLVED THROUGH THE PRODUCTION WHITELIST RATHER THAN SPELLED BY HAND
 * ===============================================================================================
 * Every table and column an expectation below names is resolved through the same two validators the
 * adapter itself uses, `assertTableName` and `assertColumnName`. Three things follow, and all three
 * are why the indirection is worth its keystrokes:
 *
 *   * An expectation cannot name a table or column that is not part of the extracted schema. A typo
 *     raises when this module is evaluated, rather than producing an assertion that passes against
 *     text nobody meant to write.
 *   * The expectations and the adapter draw their spellings from ONE source, so a test cannot drift
 *     into asserting a column the entity declarations no longer declare.
 *   * No schema, table or column is invented here. Each constant carries the legacy declaration it
 *     comes from.
 * ============================================================================================= */

/** `model/entity/Option.cfc:L49` — `table="SwOption"`. */
const OPTION_TABLE = assertTableName('SwOption');

/** `model/entity/OptionGroup.cfc:L49` — `table="SwOptionGroup"`. */
const OPTION_GROUP_TABLE = assertTableName('SwOptionGroup');

/**
 * The SKU-to-option link table, named in the non-existence guard at `model/dao/OptionDAO.cfc:L74`.
 *
 * It has no entity component of its own: it is the `linktable` of the owning many-to-many at
 * `model/entity/Sku.cfc:L76` (`fkcolumn="skuID" inversejoincolumn="optionID"`), whose inverse side is
 * `model/entity/Option.cfc:L66`. Those two attributes fix the two column names used below.
 */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** `model/entity/Sku.cfc:L49` — `table="SwSku"`, joined at `model/dao/OptionDAO.cfc:L76`. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwOption.optionID` — projected at `model/dao/OptionDAO.cfc:L60`, correlated at `:L80`. */
const OPTION_ID = assertColumnName(OPTION_TABLE, 'optionID');

/** `SwOption.optionName` — projected at `model/dao/OptionDAO.cfc:L61`, sorted at `:L84`. */
const OPTION_NAME = assertColumnName(OPTION_TABLE, 'optionName');

/**
 * `SwOption.optionGroupID` — the child side of the required many-to-one at
 * `model/entity/Option.cfc:L59`, joined at `model/dao/OptionDAO.cfc:L66` and filtered at `:L68`.
 */
const OPTION_GROUP_ID_ON_OPTION = assertColumnName(OPTION_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupID` — the parent side of that same relationship, and the column the
 * second statement negates against at `model/dao/OptionDAO.cfc:L107`.
 *
 * Held apart from {@link OPTION_GROUP_ID_ON_OPTION} even though the two spellings match, because the
 * two are validated against DIFFERENT tables. One constant for both would let a rename on one table
 * keep passing against the other.
 */
const OPTION_GROUP_ID = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupName` — projected by BOTH statements, at `model/dao/OptionDAO.cfc:L62`
 * and `:L103`, and a sort term of both, at `:L83` and `:L109`.
 */
const OPTION_GROUP_NAME = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupName');

/** `SwSkuOption.optionID` — the link column correlated back to the outer row at `:L80`. */
const SKU_OPTION_OPTION_ID = assertColumnName(SKU_OPTION_TABLE, 'optionID');

/** `SwSkuOption.skuID` — the link column joined to the SKU table at `:L76`. */
const SKU_OPTION_SKU_ID = assertColumnName(SKU_OPTION_TABLE, 'skuID');

/** `SwSku.skuID` — the join target at `model/dao/OptionDAO.cfc:L76`. */
const SKU_SKU_ID = assertColumnName(SKU_TABLE, 'skuID');

/** `SwSku.productID` — the bound predicate inside the non-existence guard, at `:L78`. */
const SKU_PRODUCT_ID = assertColumnName(SKU_TABLE, 'productID');

/** The alias `model/dao/OptionDAO.cfc:L74` gives the link table inside the guard. */
const SKU_OPTION_ALIAS = 'a';

/** The alias `model/dao/OptionDAO.cfc:L76` gives the SKU table inside the same guard. */
const SKU_ALIAS = 'b';

/* ===============================================================================================
 * VALUES THE CASES BIND
 * ============================================================================================= */

/**
 * The product identifier every case binds.
 *
 * A readable literal rather than a 32-character hexadecimal identifier, deliberately: `?` binds the
 * value whatever its shape, none of these statements parses or validates it, and a literal that reads
 * as itself makes a transposed bind order obvious in a failure diff. The identifier FORMAT is pinned
 * where it is minted, not here.
 */
const PRODUCT_ID = 'product-1';

/**
 * The three-character separator `model/dao/OptionDAO.cfc:L88` places between an option group's name
 * and its option's name — a SPACE, a HYPHEN-MINUS, then a SPACE:
 *
 *     arrayAppend(result, {name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID})
 *
 * Restated here as a literal because the adapter holds its own copy module-privately; the two are
 * compared through the composed label a case observes, which is the only place the difference between
 * this and an en dash, a slash, or a bare hyphen would ever show up. That label reaches a rendered
 * drop-down, so the separator is observable output rather than formatting.
 */
const LABEL_SEPARATOR = ' - ';

/* ===============================================================================================
 * THE HARNESS
 * ============================================================================================= */

interface Recording {
  readonly repository: MySqlOptionRepository;
  readonly double: SqlExecutorDouble;
}

/**
 * Build the adapter over the suite's recording executor double.
 *
 * ⚠️ THE SEAM IS TYPED AS THE PRODUCTION INTERFACE, NOT AS THE DOUBLE'S OWN TYPE, and that is the
 * point of the local annotation below. `SqlExecutor` (`src/adapters/mysql/QueryRunner.ts`) declares
 * exactly one member, `execute`, and it is the type the adapter's constructor accepts. Naming it here
 * proves the double satisfies the real read seam rather than some convenient shape, and it states in
 * the code — not merely in a comment — that these cases reach the adapter through the same one-member
 * boundary production does.
 *
 * No pool, no connection and no database is involved, and none may be introduced. Server-side
 * statement preparation is `QueryRunner`'s responsibility on the far side of this interface; the
 * driver's text-substituting execution member is unreachable from here and is never imitated.
 *
 * @param outcomes - what the executor should answer, one per call, in call order. Omit them entirely
 *   and every call answers no rows, which is all a statement-text assertion needs.
 * @returns the adapter and the recording double, whose `calls` is a live, element-frozen journal.
 */
function recording(...outcomes: readonly SqlExecutorOutcome[]): Recording {
  const double = createSqlExecutorDouble({ outcomes });
  const executor: SqlExecutor = double.executor;

  return { repository: new MySqlOptionRepository(executor), double };
}

/**
 * Build the adapter over a recording double that decides each answer FROM THE STATEMENT it was handed.
 *
 * The responder seam (`respond`) is consulted before the outcome queue and may decline by returning
 * `undefined`, which is what lets one double answer two different statements differently in a single
 * case — the only way the two members' opposite set polarity can be exercised side by side.
 *
 * @param respond - decides an outcome from the recorded call, or declines it.
 * @returns the adapter and the recording double.
 */
function recordingWithResponder(respond: SqlExecutorResponder): Recording {
  const double = createSqlExecutorDouble({ respond });
  const executor: SqlExecutor = double.executor;

  return { repository: new MySqlOptionRepository(executor), double };
}

/**
 * The statement recorded at `index`, narrowed without a non-null assertion.
 *
 * `noUncheckedIndexedAccess` makes an indexed read `SqlExecutorCall | undefined`, which is correct: a
 * missing statement is a real outcome — the adapter issued fewer than expected — and it deserves a
 * message that says so rather than a `!` that turns it into an unreadable property access on
 * `undefined` several lines later.
 *
 * @param double - the recording double.
 * @param index - zero-based position in issue order.
 * @returns the recorded statement.
 * @throws {Error} when the adapter issued no statement at that position.
 */
function callAt(double: SqlExecutorDouble, index: number): SqlExecutorCall {
  const call = double.calls[index];

  if (call === undefined) {
    throw new Error(
      `the adapter issued no statement at position ${String(index)}; it issued ` +
        `${String(double.calls.length)} in total`,
    );
  }

  return call;
}

/**
 * The one statement the adapter issued, asserting on the way that there was exactly one.
 *
 * Both ported members run a single statement, so a second call would mean the adapter had started
 * probing, paginating or retrying — none of which `model/dao/OptionDAO.cfc` does, and none of which
 * may be added (AAP 0.7.3 standard 9).
 *
 * @param double - the recording double.
 * @returns the sole recorded statement.
 */
function soleCall(double: SqlExecutorDouble): SqlExecutorCall {
  expect(double.calls).toHaveLength(1);

  return callAt(double, 0);
}

/**
 * The one row the adapter mapped, asserting on the way that there was exactly one.
 *
 * Narrowed the same way {@link callAt} is, and for the same reason: under `noUncheckedIndexedAccess` a
 * mapped row is `Row | undefined`, and "the adapter mapped nothing" deserves to be reported as itself.
 *
 * @param rows - the mapped rows.
 * @returns the sole row.
 * @throws {Error} when the adapter mapped no row.
 */
function soleRow<Row>(rows: readonly Row[]): Row {
  expect(rows).toHaveLength(1);

  const [row] = rows;

  if (row === undefined) {
    throw new Error('the adapter mapped no row at all');
  }

  return row;
}

/**
 * Collapse every run of whitespace to one space so an expectation reads as a clause rather than as
 * indentation.
 *
 * The adapter composes multi-line text, and its line breaks and indentation are presentation. What is
 * behaviour is the token sequence, so the assertions below are written against the collapsed form.
 * The recording itself stays byte-for-byte faithful — the double stores the string exactly as issued —
 * so nothing is lost: a case that needs the raw text still has it.
 *
 * @param sql - the statement exactly as the adapter issued it.
 * @returns the same statement with single spaces between tokens and no leading or trailing space.
 */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Join clause fragments with the single spaces {@link normalize} leaves between tokens.
 *
 * Lets a long expected clause be written as several short lines that read like the SQL they describe,
 * instead of one template literal too wide to review.
 *
 * @param fragments - the fragments, in statement order.
 * @returns the fragments joined by single spaces.
 */
function clause(...fragments: readonly string[]): string {
  return fragments.join(' ');
}

/**
 * The closing slice of a statement, the same length as the tail it is being compared against.
 *
 * Comparing equal-length slices — rather than calling a boolean `endsWith` — is what makes a failure
 * legible: the assertion reports the text that IS at the end of the statement beside the text that was
 * expected there, which is exactly the information needed when something has been appended.
 *
 * @param sql - the statement exactly as the adapter issued it.
 * @param expectedTail - the tail the statement is expected to end with.
 * @returns the closing slice of the normalized statement, `expectedTail.length` characters long.
 */
function tail(sql: string, expectedTail: string): string {
  const text = normalize(sql);

  return text.slice(Math.max(0, text.length - expectedTail.length));
}

/**
 * The bind-marker text a set-membership clause carries, read back out of the statement itself.
 *
 * Reading the markers from the statement rather than counting every `?` in it is what makes the
 * cardinality assertions precise. The first statement binds a product identifier too, inside its
 * non-existence guard, so a whole-statement `?` count could not tell a missing group marker from a
 * missing product marker; this locates the clause by its column and operator and returns only what is
 * between that clause's parentheses.
 *
 * It also proves the operator, because the operator is part of the text being searched for: an `IN`
 * lookup cannot match a `NOT IN` clause, nor the reverse.
 *
 * @param sql - the statement exactly as the adapter issued it.
 * @param columnReference - the qualified column the clause filters, e.g. `SwOption.optionGroupID`.
 * @param operator - the set operator the clause is expected to use.
 * @returns the text between the clause's parentheses, e.g. `?` or `?, ?`.
 * @throws {Error} when the statement carries no such clause, or leaves it unclosed.
 */
function membershipMarkers(
  sql: string,
  columnReference: string,
  operator: 'IN' | 'NOT IN',
): string {
  const text = normalize(sql);
  const opening = `${columnReference} ${operator} (`;
  const opens = text.indexOf(opening);

  if (opens === -1) {
    throw new Error(`the statement carries no "${opening}…)" clause:\n${text}`);
  }

  const from = opens + opening.length;
  const closes = text.indexOf(')', from);

  if (closes === -1) {
    throw new Error(`the "${opening}" clause is never closed:\n${text}`);
  }

  return text.slice(from, closes);
}

interface UnusedOptionsExercise {
  readonly call: SqlExecutorCall;
  readonly rows: UnusedOptionRow[];
}

interface UnusedOptionGroupsExercise {
  readonly call: SqlExecutorCall;
  readonly rows: UnusedOptionGroupRow[];
}

/**
 * Exercise `findUnusedOptions` once and hand back its statement and its mapped rows.
 *
 * The arguments are passed in the member's own order, `(productID, existingOptionGroupIDList)`, which
 * is the legacy signature order at `model/dao/OptionDAO.cfc:L52-L53`. That the BOUND order is the
 * reverse of it is the subject of a suite below, and passing arguments here in signature order is what
 * lets that suite mean something.
 *
 * @param productID - bound inside the non-existence guard at `model/dao/OptionDAO.cfc:L78`.
 * @param existingOptionGroupIDList - the comma-delimited list bound at `:L68`, empty string included.
 * @param outcomes - what the executor should answer; omit for a statement-text assertion.
 * @returns the sole statement issued, and the rows the adapter mapped out of the answer.
 */
async function exerciseUnusedOptions(
  productID: string,
  existingOptionGroupIDList: string,
  ...outcomes: readonly SqlExecutorOutcome[]
): Promise<UnusedOptionsExercise> {
  const { repository, double } = recording(...outcomes);
  const rows = await repository.findUnusedOptions(productID, existingOptionGroupIDList);

  return { call: soleCall(double), rows };
}

/**
 * Exercise `findUnusedOptionGroups` once and hand back its statement and its mapped rows.
 *
 * @param existingOptionGroupIDList - the comma-delimited list bound at `model/dao/OptionDAO.cfc:L107`,
 *   empty string included. It is this member's only argument, exactly as at `:L95`.
 * @param outcomes - what the executor should answer; omit for a statement-text assertion.
 * @returns the sole statement issued, and the rows the adapter mapped out of the answer.
 */
async function exerciseUnusedOptionGroups(
  existingOptionGroupIDList: string,
  ...outcomes: readonly SqlExecutorOutcome[]
): Promise<UnusedOptionGroupsExercise> {
  const { repository, double } = recording(...outcomes);
  const rows = await repository.findUnusedOptionGroups(existingOptionGroupIDList);

  return { call: soleCall(double), rows };
}

/* ===============================================================================================
 * THE TWO EXPECTED STATEMENTS, WRITTEN OUT ONCE
 * ===============================================================================================
 * Each is the complete translation of its legacy statement, assembled from the validated identifiers
 * above so that no spelling in an expectation can drift from the schema the entities declare.
 *
 * Writing them out WHOLE, rather than only asserting fragments, is a deliberate choice. A fragment
 * assertion proves that something expected is present; a whole-statement assertion additionally proves
 * that nothing UNexpected is — no extra predicate, no extra join, no appended clause, no re-ordered
 * sort. For a port whose risk is silent normalisation rather than outright breakage, the second
 * property is the one worth having, and the fragment cases that follow each expectation remain because
 * a focused failure message is worth more than a diff of the entire statement when one clause moves.
 * ============================================================================================= */

/**
 * `findUnusedOptions` for a two-element list — the translation of `model/dao/OptionDAO.cfc:L58-L85`.
 *
 * Every element of the legacy statement is here and in the legacy's order: the three projected columns
 * [`:L60-L62`], the inner join onto the owning group [`:L66`], the set-membership filter [`:L68`], the
 * correlated non-existence guard with its redundant-but-harmless inner projection [`:L70-L81`], and
 * the two-term ordering [`:L82-L84`]. The single-letter aliases `a` and `b` are the legacy's own
 * [`:L74`, `:L76`], carried verbatim so the generated text stays diffable against the source.
 */
const UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS = clause(
  `SELECT ${OPTION_TABLE}.${OPTION_ID},`,
  `${OPTION_TABLE}.${OPTION_NAME},`,
  `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
  `FROM ${OPTION_TABLE}`,
  `INNER JOIN ${OPTION_GROUP_TABLE}`,
  `on ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID} = ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION}`,
  `WHERE ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION} IN (?, ?)`,
  'AND NOT EXISTS(',
  `SELECT DISTINCT ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID}`,
  `FROM ${SKU_OPTION_TABLE} ${SKU_OPTION_ALIAS}`,
  `INNER JOIN ${SKU_TABLE} ${SKU_ALIAS}`,
  `on ${SKU_OPTION_ALIAS}.${SKU_OPTION_SKU_ID} = ${SKU_ALIAS}.${SKU_SKU_ID}`,
  `WHERE ${SKU_ALIAS}.${SKU_PRODUCT_ID} = ?`,
  `AND ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID} = ${OPTION_TABLE}.${OPTION_ID}`,
  ')',
  `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}, ${OPTION_TABLE}.${OPTION_NAME}`,
);

/**
 * The correlated non-existence guard on its own — `model/dao/OptionDAO.cfc:L70-L81`.
 *
 * Named separately because it is the half of the statement most exposed to a well-meaning rewrite. The
 * textbook transformation of a correlated non-existence test is an outer join with an `IS NULL` test,
 * and it is forbidden here: the two forms are not obviously equivalent in the presence of the inner
 * `DISTINCT`, the outer form fans the result out and would then need de-duplication of its own, and
 * neither difference would announce itself in a result set. The correlation at `:L80` also stays
 * INSIDE the sub-query, where the legacy puts it; lifting it into the outer predicate changes what the
 * sub-query is correlated to.
 */
const UNUSED_OPTIONS_EXISTENCE_GUARD = clause(
  'NOT EXISTS(',
  `SELECT DISTINCT ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID}`,
  `FROM ${SKU_OPTION_TABLE} ${SKU_OPTION_ALIAS}`,
  `INNER JOIN ${SKU_TABLE} ${SKU_ALIAS}`,
  `on ${SKU_OPTION_ALIAS}.${SKU_OPTION_SKU_ID} = ${SKU_ALIAS}.${SKU_SKU_ID}`,
  `WHERE ${SKU_ALIAS}.${SKU_PRODUCT_ID} = ?`,
  `AND ${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID} = ${OPTION_TABLE}.${OPTION_ID}`,
  ')',
);

/** The two-term ordering `model/dao/OptionDAO.cfc:L82-L84` declares, and the statement's last clause. */
const UNUSED_OPTIONS_ORDERING = clause(
  `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME},`,
  `${OPTION_TABLE}.${OPTION_NAME}`,
);

/**
 * `findUnusedOptionGroups` for a one-element list — the translation of
 * `model/dao/OptionDAO.cfc:L100-L110`.
 *
 * Note what is absent, because every absence is faithful rather than accidental: no product
 * identifier, no join, no reference to the SKU table or the link table, and no non-existence guard.
 * The statement's scope is the whole option-group table [`:L105`], narrowed only by the negated
 * set-membership clause at `:L107`. "Unused" therefore means something narrower here than in the
 * sibling statement — absent from the list the caller supplied — and that is the legacy behaviour, not
 * a missing filter (AAP 0.8.2 guideline 4).
 */
const UNUSED_OPTION_GROUPS_STATEMENT_FOR_ONE_GROUP = clause(
  `SELECT ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID},`,
  `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
  `FROM ${OPTION_GROUP_TABLE}`,
  `WHERE ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID} NOT IN (?)`,
  `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
);

/** The single-term ordering `model/dao/OptionDAO.cfc:L108-L109` declares — one term, not two. */
const UNUSED_OPTION_GROUPS_ORDERING = `ORDER BY ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`;

/** The qualified column the first statement filters with `IN` [`model/dao/OptionDAO.cfc:L68`]. */
const OPTION_GROUP_FILTER_COLUMN = `${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION}`;

/** The qualified column the second statement filters with `NOT IN` [`:L107`]. */
const OPTION_GROUP_EXCLUSION_COLUMN = `${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID}`;

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: the statement, token for token', () => {
  it('NET-NEW — issues exactly the ported statement, with nothing added and nothing dropped', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(normalize(call.sql)).toBe(UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS);
  });

  it('NET-NEW — projects the option identifier, the option name and the owning group name', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(
      clause(
        `SELECT ${OPTION_TABLE}.${OPTION_ID},`,
        `${OPTION_TABLE}.${OPTION_NAME},`,
        `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
      ),
    );
  });

  it('NET-NEW — reaches the owning group through an inner join on the shared group identifier', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(
      clause(
        `FROM ${OPTION_TABLE}`,
        `INNER JOIN ${OPTION_GROUP_TABLE}`,
        `on ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID} = ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION}`,
      ),
    );
  });

  it('NET-NEW — filters the candidate groups with a dynamic IN clause over bind markers', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(normalize(call.sql)).toContain(`WHERE ${OPTION_GROUP_FILTER_COLUMN} IN (?, ?)`);
    expect(membershipMarkers(call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?, ?');
  });

  it('NET-NEW — keeps the correlated NOT EXISTS over the link table joined to SwSku', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(UNUSED_OPTIONS_EXISTENCE_GUARD);
  });

  it('NET-NEW — keeps the option correlation INSIDE the sub-query rather than lifting it out', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');
    const text = normalize(call.sql);

    const correlation = `${SKU_OPTION_ALIAS}.${SKU_OPTION_OPTION_ID} = ${OPTION_TABLE}.${OPTION_ID}`;
    const guardOpens = text.indexOf('NOT EXISTS(');
    const guardCloses = text.indexOf(')', guardOpens);
    const correlationAt = text.indexOf(correlation);

    expect(guardOpens).toBeGreaterThan(-1);
    expect(correlationAt).toBeGreaterThan(guardOpens);
    expect(correlationAt).toBeLessThan(guardCloses);
  });

  it('NET-NEW — orders by the group name and then the option name, and stops there', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * Two assertions, and the second is the one that matters. The first pins the ordering the legacy
     * declares at `:L82-L84` — the group's name, THEN the option's name, both explicit name terms. The
     * second pins that the ordering is the statement's LAST clause, which is how this case proves no
     * row window and no further predicate has been appended, without having to enumerate the clauses
     * that must not be there.
     *
     * TODO(parity) `model/dao/OptionDAO.cfc:L82-L84` — THE NAME ORDERING IS CARRIED, NOT MODERNISED.
     * `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"` on a group's options
     * collection, and it is tempting to read that as the catalogue's intended option order and apply
     * it here. It is not a licence to: that attribute governs the collection the ORM materialises for
     * ONE group, whereas this statement is a flat cross-group projection whose two explicit name terms
     * reach a rendered drop-down directly. Substituting a sort-order term would reorder visible output.
     */
    expect(normalize(call.sql)).toContain(UNUSED_OPTIONS_ORDERING);
    expect(tail(call.sql, UNUSED_OPTIONS_ORDERING)).toBe(UNUSED_OPTIONS_ORDERING);
  });

  it('NET-NEW — filters with IN and never with the sibling statement’s negated operator', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    expect(normalize(call.sql)).toContain(`${OPTION_GROUP_FILTER_COLUMN} IN (`);
    expect(normalize(call.sql)).not.toContain('NOT IN');
  });
});

/*
 * G6 — BIND ORDER IS THE SUBJECT OF ITS OWN SUITE BECAUSE NO OTHER CHECK CAN CATCH IT.
 *
 * `model/dao/OptionDAO.cfc` declares `productID` first [`:L52`] and `existingOptionGroupIDList`
 * second [`:L53`], and the ported member keeps that argument order because AAP 0.4.2.6 fixes it and
 * because `model/entity/Product.cfc:L637` already calls positionally in it. The STATEMENT binds the
 * other way round: the set-membership clause at `:L68` precedes the product predicate inside the
 * non-existence guard at `:L78`, and TR-4 requires the bound array to follow the statement.
 *
 * Both values are `string`. A transposition therefore compiles cleanly, raises nothing, and returns
 * the wrong option set — invisible to the compiler, to the linter and to any assertion that only
 * counted parameters. These cases are the only thing standing in its way, which is why they are named
 * for the property rather than folded into a statement-shape case.
 */
describe('MySqlOptionRepository.findUnusedOptions — NET-NEW/G6: bind order is statement order', () => {
  it('NET-NEW/G6 — binds the option-group identifiers FIRST and the product identifier LAST', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(call.params).toEqual(['group-a', 'group-b', PRODUCT_ID]);
  });

  it('NET-NEW/G6 — does not bind in signature order, which is the transposition to catch', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    /*
     * The negative half of the case above, and not redundant with it. Asserting only the expected
     * array leaves a reader to work out for themselves that the signature-ordered array is a real and
     * plausible alternative; naming it here makes the trap explicit, and the two same-typed strings
     * mean this is the assertion that fails first if someone "tidies" the parameter assembly to match
     * the member's own argument list.
     */
    expect(call.params).not.toEqual([PRODUCT_ID, 'group-a', 'group-b']);
  });

  it('NET-NEW/G6 — places the membership clause ahead of the product predicate, which is why', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');
    const text = normalize(call.sql);

    /*
     * The bound order is not arbitrary and this case says where it comes from: positional binding
     * follows the order the markers appear in the text, so the array above is a consequence of the
     * statement's own layout rather than a convention chosen by the adapter. Pin the layout and the
     * array follows; pin only the array and a later reader has no way to tell which of the two is the
     * cause.
     */
    expect(text.indexOf(`${OPTION_GROUP_FILTER_COLUMN} IN (`)).toBeLessThan(
      text.indexOf(`${SKU_ALIAS}.${SKU_PRODUCT_ID} = ?`),
    );
  });

  it('NET-NEW/G6 — binds the product identifier exactly once, however long the group list', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b,group-c');

    expect(call.params.filter((value) => value === PRODUCT_ID)).toHaveLength(1);
    expect(call.params[call.params.length - 1]).toBe(PRODUCT_ID);
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: placeholder cardinality', () => {
  it('NET-NEW — emits one bind marker per comma-list element, for every shape of list', async () => {
    /*
     * One table rather than six cases, because the property is a single invariant — one marker per
     * element, one bound value per marker, in list order — and reading it as a table is how a reviewer
     * checks it. Duplicates are kept (`IN ('a','a')` selects what `IN ('a')` selects, so removing one
     * is invisible in the result and still a divergence in the statement), empty elements are kept, and
     * nothing is trimmed, de-duplicated, filtered or routed through a set.
     */
    const lists = ['group-a', 'group-a,group-b', 'group-a,group-a', 'group-a,,group-b', ',', ''];
    const observed: Array<{
      readonly list: string;
      readonly markers: string;
      readonly params: readonly unknown[];
    }> = [];

    for (const list of lists) {
      const { call } = await exerciseUnusedOptions(PRODUCT_ID, list);

      observed.push({
        list,
        markers: membershipMarkers(call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN'),
        params: call.params,
      });
    }

    expect(observed).toEqual([
      { list: 'group-a', markers: '?', params: ['group-a', PRODUCT_ID] },
      { list: 'group-a,group-b', markers: '?, ?', params: ['group-a', 'group-b', PRODUCT_ID] },
      { list: 'group-a,group-a', markers: '?, ?', params: ['group-a', 'group-a', PRODUCT_ID] },
      {
        list: 'group-a,,group-b',
        markers: '?, ?, ?',
        params: ['group-a', '', 'group-b', PRODUCT_ID],
      },
      { list: ',', markers: '?, ?', params: ['', '', PRODUCT_ID] },
      { list: '', markers: '?', params: ['', PRODUCT_ID] },
    ]);
  });

  it('NET-NEW — binds each element exactly as the delimiter produced it, without trimming', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, ' group-a , group-b ');

    /*
     * The legacy binds the token the delimiter produced, surrounding whitespace included, so the port
     * does too. Trimming would look like hygiene and would change which rows match — a value with
     * spaces matches nothing where a trimmed one might match a real group.
     */
    expect(call.params).toEqual([' group-a ', ' group-b ', PRODUCT_ID]);
  });

  it('NET-NEW — keeps every marker a marker: the group values never enter the statement text', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    expect(call.sql).not.toContain('group-a');
    expect(call.sql).not.toContain('group-b');
    expect(call.sql).not.toContain(PRODUCT_ID);
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: the empty option-group list', () => {
  it("NET-NEW — binds ONE marker to the empty string, preserving IN ('') rather than IN ()", async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, '');

    /*
     * G6 — THIS IS A DELIBERATE PRESERVATION DECISION, NOT AN OVERSIGHT, AND IT IS THE EASIEST THING
     * IN THIS ADAPTER TO "FIX" INTO A BUG.
     *
     * CFML `<cfqueryparam … list="true">` splits its value on the delimiter and binds one parameter per
     * resulting token WITHOUT discarding empty ones, so the legacy predicate at
     * `model/dao/OptionDAO.cfc:L68` is literally `IN ('')` for an empty string. TypeScript's
     * `''.split(',')` yields one empty element, so the naive translation agrees with the legacy
     * exactly — and every tidier alternative diverges:
     *
     *   * DROPPING the empty token leaves a set-membership clause with ZERO markers, which is a syntax
     *     error at the database rather than a compile error here: a working degenerate query turned
     *     into a run-time failure.
     *   * SHORT-CIRCUITING to an always-false predicate looks equivalent and is not. `IN ('')` and
     *     `NOT IN ('')` have precise and DIFFERENT truth values, and the sibling member depends on the
     *     difference — see the polarity suite below.
     *
     * The empty list is also ORDINARY rather than exotic: `model/entity/Product.cfc:L637` supplies the
     * argument as `structKeyList(getOptionGroupsStruct())`, which is empty for any product that has no
     * option groups yet. So this is the state of every freshly created product, and it must resolve to
     * an empty array rather than raise.
     */
    expect(membershipMarkers(call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?');
    expect(normalize(call.sql)).toContain(`${OPTION_GROUP_FILTER_COLUMN} IN (?)`);
    expect(call.params).toEqual(['', PRODUCT_ID]);
  });

  it('NET-NEW — follows the marker with the product identifier, so the order still holds', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, '');

    expect(call.params).toEqual(['', PRODUCT_ID]);
    expect(call.params).not.toEqual([PRODUCT_ID, '']);
  });

  it('NET-NEW — is not special-cased: it issues the same statement a one-element list issues', async () => {
    const empty = await exerciseUnusedOptions(PRODUCT_ID, '');
    const single = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * The strongest available proof that no branch was introduced for the empty input. Both lists have
     * one element, so both must produce the identical statement, byte for byte; only the bound value
     * differs. An always-false rewrite, a guard, or an early return would all break this equality
     * while leaving the marker count assertion above intact.
     */
    expect(empty.call.sql).toBe(single.call.sql);
    expect(empty.rows).toEqual([]);
  });
});

/*
 * X14 / G6 — TWO PROJECTIONS OF AN OPTION EXIST IN THIS SLICE, THEY DISAGREE, AND THE DISAGREEMENT IS
 * CARRIED RATHER THAN HARMONISED.
 *
 * `model/service/OptionService.cfc:L55-L63` (`getOptionsForSelect`) maps an ordinary option to the
 * BARE option name — `{name=arguments.options[i].getOptionName(), value=…getOptionID()}` — while
 * `model/dao/OptionDAO.cfc:L88` maps an UNUSED PRODUCT option to a COMPOSITE label,
 * `"#rs.optionGroupName# - #rs.optionName#"`. Same entity, same two field names, two different labels.
 *
 * The divergence is deliberate in context: the service member projects options already known to belong
 * to one group, so the group name would be noise, whereas this member projects options ACROSS several
 * groups, where the group name is what disambiguates two identically named options. Both labels reach a
 * rendered drop-down, so both are observable output.
 *
 * Neither may be changed to match the other. Adding the group name to the service's projection, or
 * stripping it from this one, would alter visible text in one screen or the other — precisely the
 * "improvement beyond what the migration requires" AAP 0.8.2 guideline 4 forbids. This suite pins the
 * composite form; the bare form is pinned where the service is tested.
 */
describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: the composed drop-down row', () => {
  it('NET-NEW — maps the projection to the UnusedOptionRow shape, label and identifier', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );

    const expected: UnusedOptionRow[] = [{ name: 'Size - Large', value: 'option-1' }];

    expect(rows).toEqual(expected);
  });

  it('NET-NEW — takes the row identifier from the option, never from its owning group', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([
        {
          optionID: 'option-1',
          optionName: 'Large',
          optionGroupID: 'group-a',
          optionGroupName: 'Size',
        },
      ]),
    );

    /*
     * The projected row carries BOTH identifiers, so a mapper reading the wrong one would still produce
     * a well-formed row and a working drop-down that submitted a group where an option was expected.
     * `model/dao/OptionDAO.cfc:L88` reads `rs.optionID`, and this case is what holds it there.
     */
    expect(soleRow(rows).value).toBe('option-1');
  });

  it('NET-NEW — separates the two names with one SPACE, one HYPHEN-MINUS and one SPACE', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );

    const label = soleRow(rows).name;
    const separator = label.slice('Size'.length, label.length - 'Large'.length);

    /*
     * The code points are asserted, not just the string. An EN DASH separator would read identically in
     * a review diff and in most editors, and it would change bytes on a rendered page; comparing
     * `0x20, 0x2d, 0x20` is the only form of this assertion that cannot be satisfied by a look-alike.
     */
    expect(separator).toBe(LABEL_SEPARATOR);
    expect([...separator].map((character) => character.codePointAt(0))).toEqual([0x20, 0x2d, 0x20]);
    expect(label.split(LABEL_SEPARATOR)).toEqual(['Size', 'Large']);
  });

  it('NET-NEW — composes the group name first and the option name second, in that order', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Size', optionGroupName: 'Large' }]),
    );

    /*
     * The two names are deliberately swapped in the seeded row relative to the case above, so that a
     * composition assembled in the wrong order would produce "Size - Large" here and pass a lazier
     * assertion. It must produce "Large - Size": group name first [`model/dao/OptionDAO.cfc:L88`].
     */
    expect(soleRow(rows).name).toBe('Large - Size');
  });

  it('NET-NEW — maps every returned row, preserving the order the statement produced', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a,group-b',
      sqlRows([
        { optionID: 'option-2', optionName: 'Large', optionGroupName: 'Size' },
        { optionID: 'option-1', optionName: 'Blue', optionGroupName: 'Colour' },
      ]),
    );

    /*
     * The rows arrive in the order the ORDER BY produced and are mapped in that order — no re-sorting
     * happens above the statement. The seeded pair is deliberately NOT in name order, because a mapper
     * that quietly sorted its output would otherwise be indistinguishable from one that did not.
     */
    expect(rows).toEqual([
      { name: 'Size - Large', value: 'option-2' },
      { name: 'Colour - Blue', value: 'option-1' },
    ]);
  });

  it('NET-NEW — resolves to an empty array when the statement matched nothing', async () => {
    const { rows } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a', sqlRows([]));

    expect(rows).toEqual([]);
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: the statement, token for token', () => {
  it('NET-NEW — issues exactly the ported statement, with nothing added and nothing dropped', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');

    expect(normalize(call.sql)).toBe(UNUSED_OPTION_GROUPS_STATEMENT_FOR_ONE_GROUP);
  });

  it('NET-NEW — projects the group identifier and the group name from SwOptionGroup alone', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');

    expect(normalize(call.sql)).toContain(
      clause(
        `SELECT ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID},`,
        `${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME}`,
        `FROM ${OPTION_GROUP_TABLE}`,
      ),
    );
  });

  it('NET-NEW — excludes the supplied groups with a dynamic NOT IN clause over bind markers', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a,group-b');

    expect(normalize(call.sql)).toContain(`WHERE ${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?, ?)`);
    expect(membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?, ?');
  });

  it('NET-NEW — orders by the group name alone — one sort term, not two — and stops there', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');

    /*
     * One term where the sibling statement has two [`model/dao/OptionDAO.cfc:L108-L109` against
     * `:L82-L84`]. The tail comparison again doubles as the proof that the ordering is the last clause,
     * so nothing has been appended after it.
     */
    expect(normalize(call.sql)).toContain(UNUSED_OPTION_GROUPS_ORDERING);
    expect(tail(call.sql, UNUSED_OPTION_GROUPS_ORDERING)).toBe(UNUSED_OPTION_GROUPS_ORDERING);
  });

  it('NET-NEW — adds no join, no non-existence guard and no product predicate', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a');
    const text = normalize(call.sql);

    /*
     * Every absence here is faithful. `model/dao/OptionDAO.cfc:L100-L110` consults ONE table: it takes
     * no product identifier, never reaches the SKU table or the link table, and applies no
     * non-existence test. "Unused" is narrower in this member than in its sibling — absent from the
     * supplied list — and completing the symmetry by adding a usage check would change results.
     */
    expect(text).not.toContain('JOIN');
    expect(text).not.toContain('EXISTS');
    expect(text).not.toContain(SKU_TABLE);
    expect(text).not.toContain(SKU_OPTION_TABLE);
    expect(text).not.toContain(SKU_PRODUCT_ID);
  });

  it('NET-NEW — binds exactly the supplied list, with no product identifier appended', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a,group-b');

    /*
     * The member takes ONE argument [`model/dao/OptionDAO.cfc:L95`], so its bound array is the list and
     * nothing else. The bind-order trap of the sibling member has no site here, and this case is what
     * keeps someone from "aligning" the two by threading a product identifier through.
     */
    expect(call.params).toEqual(['group-a', 'group-b']);
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: placeholder cardinality', () => {
  it('NET-NEW — emits one bind marker per comma-list element, for every shape of list', async () => {
    const lists = ['group-a', 'group-a,group-b', 'group-a,group-a', 'group-a,,group-b'];
    const observed: Array<{
      readonly list: string;
      readonly markers: string;
      readonly params: readonly unknown[];
    }> = [];

    for (const list of lists) {
      const { call } = await exerciseUnusedOptionGroups(list);

      observed.push({
        list,
        markers: membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN'),
        params: call.params,
      });
    }

    expect(observed).toEqual([
      { list: 'group-a', markers: '?', params: ['group-a'] },
      { list: 'group-a,group-b', markers: '?, ?', params: ['group-a', 'group-b'] },
      { list: 'group-a,group-a', markers: '?, ?', params: ['group-a', 'group-a'] },
      { list: 'group-a,,group-b', markers: '?, ?, ?', params: ['group-a', '', 'group-b'] },
    ]);
  });

  it('NET-NEW — never concatenates an excluded identifier into the statement text', async () => {
    const { call } = await exerciseUnusedOptionGroups('group-a,group-b');

    expect(call.sql).not.toContain('group-a');
    expect(call.sql).not.toContain('group-b');
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: the empty option-group list', () => {
  it("NET-NEW — binds ONE marker to the empty string, preserving NOT IN ('') rather than NOT IN ()", async () => {
    const { call } = await exerciseUnusedOptionGroups('');

    /*
     * G6 — THE SAME PRESERVATION DECISION AS THE SIBLING MEMBER'S, WITH THE OPPOSITE CONSEQUENCE.
     *
     * One marker bound to the empty string, because `<cfqueryparam … list="true">` binds one parameter
     * per token and keeps the empty one [`model/dao/OptionDAO.cfc:L107`]. Emitting zero markers is a
     * syntax error at the database; rewriting the empty case to an always-true predicate looks
     * equivalent and is not, because it discards the only clause that makes the member's polarity
     * visible in the statement.
     *
     * The consequence differs from the sibling's and is not a defect: `NOT IN ('')` excludes nothing, so
     * a product with no option groups yet gets EVERY group — while the same input on the `IN` side
     * matches nothing and yields none. See the polarity suite below.
     */
    expect(membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?');
    expect(normalize(call.sql)).toContain(`${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?)`);
    expect(call.params).toEqual(['']);
  });

  it('NET-NEW — is not special-cased: it issues the same statement a one-element list issues', async () => {
    const empty = await exerciseUnusedOptionGroups('');
    const single = await exerciseUnusedOptionGroups('group-a');

    expect(empty.call.sql).toBe(single.call.sql);
  });
});

describe('MySqlOptionRepository.findUnusedOptionGroups — NET-NEW: the bare group row', () => {
  it('NET-NEW — maps the projection to the UnusedOptionGroupRow shape, name and identifier', async () => {
    const { rows } = await exerciseUnusedOptionGroups(
      'group-b',
      sqlRows([{ optionGroupID: 'group-a', optionGroupName: 'Size' }]),
    );

    const expected: UnusedOptionGroupRow[] = [{ name: 'Size', value: 'group-a' }];

    expect(rows).toEqual(expected);
  });

  it('NET-NEW — composes nothing: the label carries no group/option separator', async () => {
    const { rows } = await exerciseUnusedOptionGroups(
      'group-b',
      sqlRows([{ optionGroupID: 'group-a', optionGroupName: 'Size' }]),
    );

    /*
     * `model/dao/OptionDAO.cfc:L113` assembles `{name=rs.optionGroupName, value=rs.optionGroupID}` —
     * the plain group name, one line of legacy source after the sibling member composes a two-part
     * label. The two rows are shape-identical and semantically different, and this is the assertion
     * that would fail if the composition leaked from one member into the other.
     */
    expect(soleRow(rows).name).toBe('Size');
    expect(soleRow(rows).name).not.toContain(LABEL_SEPARATOR);
  });

  it('NET-NEW — preserves the order the statement produced, mapping every row', async () => {
    const { rows } = await exerciseUnusedOptionGroups(
      'group-c',
      sqlRows([
        { optionGroupID: 'group-b', optionGroupName: 'Size' },
        { optionGroupID: 'group-a', optionGroupName: 'Colour' },
      ]),
    );

    expect(rows).toEqual([
      { name: 'Size', value: 'group-b' },
      { name: 'Colour', value: 'group-a' },
    ]);
  });

  it('NET-NEW — resolves to an empty array when the statement matched nothing', async () => {
    const { rows } = await exerciseUnusedOptionGroups('group-a', sqlRows([]));

    expect(rows).toEqual([]);
  });
});

/**
 * Answer the two ported statements the way a database would for a product that has no option groups
 * yet — the ordinary state of a freshly created product.
 *
 * ⚠️ THIS RESPONDER IS NOT A SQL ENGINE, AND NOTHING BELOW PRETENDS OTHERWISE. It evaluates no
 * predicate, joins nothing and knows nothing about which options belong to which group. It RECOGNISES
 * which of the two statements it was handed — by the set operator in the statement's own text — and
 * returns a row set chosen by hand to match what a database would have returned for that statement.
 * The polarity is therefore asserted from the STATEMENT TEXT, which is real evidence, while the row
 * sets merely encode the consequence so that a reader can see both halves of the asymmetry in one
 * case. A canned row set is not a substitute for a query engine and is not being offered as one.
 *
 * @param call - the recorded statement and its bound values.
 * @returns the rows for a statement it recognises, or `undefined` to decline.
 */
const respondForProductWithNoOptionGroups: SqlExecutorResponder = (call) => {
  if (call.sql.includes(`${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (`)) {
    return sqlRows([
      { optionGroupID: 'group-a', optionGroupName: 'Colour' },
      { optionGroupID: 'group-b', optionGroupName: 'Size' },
    ]);
  }

  if (call.sql.includes(`${OPTION_GROUP_FILTER_COLUMN} IN (`)) {
    return sqlRows([]);
  }

  return undefined;
};

describe('MySqlOptionRepository — NET-NEW: opposite set polarity across the two members', () => {
  it('NET-NEW — the two members filter the SAME argument with inverted operators', async () => {
    const options = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');
    const groups = await exerciseUnusedOptionGroups('group-a');

    /*
     * `model/dao/OptionDAO.cfc:L68` keeps rows whose group IS in the supplied list;
     * `model/dao/OptionDAO.cfc:L107` keeps rows whose group is NOT. One token of difference, on the
     * same input, and the two members answer opposite questions.
     *
     * TODO(parity) — THE ASYMMETRY IS CARRIED, NOT RECONCILED. Normalising the pair to one polarity, in
     * either direction, would change output that reaches a rendered page. It is marked so that a later
     * reader who notices the mismatch finds a decision here rather than an oversight (AAP 0.7.3
     * standard 7; AAP 0.8.2 guideline 4).
     */
    expect(membershipMarkers(options.call.sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?');
    expect(normalize(options.call.sql)).not.toContain('NOT IN');

    expect(membershipMarkers(groups.call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?');
    expect(normalize(groups.call.sql)).toContain(`${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?)`);
  });

  it('NET-NEW — for a product with no option groups, one member yields none and the other yields all', async () => {
    const { repository, double } = recordingWithResponder(respondForProductWithNoOptionGroups);

    const options = await repository.findUnusedOptions(PRODUCT_ID, '');
    const groups = await repository.findUnusedOptionGroups('');

    /*
     * The observable consequence of the inverted operators, and it looks like a bug until it is spelled
     * out: the SAME empty list — `structKeyList(getOptionGroupsStruct())` at
     * `model/entity/Product.cfc:L637` and `:L644` — yields NO options and EVERY option group. Both
     * answers are correct. A product with no groups in use has no option to offer within a group it does
     * not have, and every group is still available to add.
     */
    expect(options).toEqual([]);
    expect(groups).toEqual([
      { name: 'Colour', value: 'group-a' },
      { name: 'Size', value: 'group-b' },
    ]);

    /* The polarity itself is read off the two statements, not inferred from the seeded row sets. */
    expect(double.calls).toHaveLength(2);
    expect(normalize(callAt(double, 0).sql)).toContain(`${OPTION_GROUP_FILTER_COLUMN} IN (?)`);
    expect(normalize(callAt(double, 1).sql)).toContain(
      `${OPTION_GROUP_EXCLUSION_COLUMN} NOT IN (?)`,
    );
    expect(callAt(double, 0).params).toEqual(['', PRODUCT_ID]);
    expect(callAt(double, 1).params).toEqual(['']);
  });

  it('NET-NEW — keeps the two row shapes semantically apart, though they are structurally identical', async () => {
    const options = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );
    const groups = await exerciseUnusedOptionGroups(
      'group-b',
      sqlRows([{ optionGroupID: 'group-a', optionGroupName: 'Size' }]),
    );

    const optionRow: UnusedOptionRow = soleRow(options.rows);
    const groupRow: UnusedOptionGroupRow = soleRow(groups.rows);

    /*
     * The two port row types are shape-identical — `{ readonly name: string; readonly value: string }`
     * each — and are declared separately on purpose. This case pins what the types alone cannot enforce
     * at run time: `value` is a `SwOption.optionID` in one and a `SwOptionGroup.optionGroupID` in the
     * other, and `name` is a composed label in one and a bare group name in the other. Merging the two
     * types, or aliasing one to the other, would let an option identifier be handed to a caller
     * expecting a group identifier with no compile error anywhere — and
     * `model/entity/Product.cfc:L635-L640` and `:L642-L647` use the two members side by side on the
     * same product, which is exactly where such a swap would land.
     */
    expect(optionRow.value).toBe('option-1');
    expect(groupRow.value).toBe('group-a');
    expect(optionRow.value).not.toBe(groupRow.value);

    expect(optionRow.name).toContain(LABEL_SEPARATOR);
    expect(groupRow.name).not.toContain(LABEL_SEPARATOR);
  });
});

describe('MySqlOptionRepository — NET-NEW: statement discipline and the injected seam', () => {
  it('NET-NEW — a quote-bearing value cannot change one character of the statement', async () => {
    const hostileGroupId = "group-a' OR 1=1 --";
    const hostileProductId = "product-1'); DROP TABLE SwSku; --";

    const hostile = await exerciseUnusedOptions(hostileProductId, hostileGroupId);
    const benign = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * The two runs supply values of the same CARDINALITY and wildly different content, and produce the
     * identical statement byte for byte. That equality is the assertion: the only thing a caller's input
     * influences is how many `?` tokens are emitted, never what any of them stands for. A `?` binds a
     * VALUE and can never substitute an identifier, which is why the tables and columns above are
     * resolved through the production whitelist instead.
     *
     * This DAO never had an interpolation surface to close — every one of its three value positions is
     * already a `<cfqueryparam>` [`model/dao/OptionDAO.cfc:L68`, `:L78`, `:L107`] — so this case records
     * ordinary compliance rather than a hardening exception, and no defect annotation accompanies it.
     */
    expect(hostile.call.sql).toBe(benign.call.sql);
    expect(hostile.call.sql).not.toContain(hostileGroupId);
    expect(hostile.call.sql).not.toContain(hostileProductId);
    expect(hostile.call.sql).not.toContain('OR 1=1');
    expect(hostile.call.sql).not.toContain('DROP TABLE');

    /* The hostile values are present, whole and untouched, in the bound array — and in statement order. */
    expect(hostile.call.params).toEqual([hostileGroupId, hostileProductId]);
  });

  it('NET-NEW — a value that spells a real table name is still bound as a value', async () => {
    const { call } = await exerciseUnusedOptionGroups(SKU_TABLE);

    /*
     * `SwSku` is a legitimate identifier elsewhere in this schema and appears in the sibling statement,
     * so it is the sharpest available probe: supplied as a group identifier it must reach the bound
     * array and must not appear in the text of a statement that names only the option-group table.
     */
    expect(membershipMarkers(call.sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe('?');
    expect(call.params).toEqual([SKU_TABLE]);
    expect(call.sql).not.toContain(SKU_TABLE);
  });

  it('NET-NEW — records the bound values as an immutable snapshot, not a live reference', async () => {
    const { call } = await exerciseUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    /*
     * The recording is frozen at the moment of binding. It matters for the bind-order suite above: were
     * the array captured by reference, a later mutation could rewrite the evidence an assertion about
     * order depends on, and the assertion would pass against something the adapter never issued.
     */
    expect(Object.isFrozen(call.params)).toBe(true);
    expect(call.params).toEqual(['group-a', 'group-b', PRODUCT_ID]);
  });

  it('NET-NEW — takes its rows through the executor’s READ member, never through a write path', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
    );

    /*
     * A queued ROW outcome can only reach a caller through `execute`: the double refuses to answer its
     * mutation member with rows, exactly as the production narrowing refuses to read an affected-row
     * acknowledgement as a result set. Rows arriving here therefore prove which member the adapter
     * called, without spying on anything and without a mocking library.
     *
     * Both ported members are reads. `model/dao/OptionDAO.cfc` writes nothing, opens no transaction and
     * commits nothing — transaction demarcation belongs to the unit of work, one layer out — so a write
     * statement from this adapter would be a defect, not a feature.
     */
    expect(rows).toEqual([{ name: 'Size - Large', value: 'option-1' }]);
  });

  it('NET-NEW — issues exactly one statement per call, with no probe and no second round trip', async () => {
    const optionsRun = recording();
    await optionsRun.repository.findUnusedOptions(PRODUCT_ID, 'group-a,group-b');

    const groupsRun = recording();
    await groupsRun.repository.findUnusedOptionGroups('group-a,group-b');

    expect(optionsRun.double.calls).toHaveLength(1);
    expect(groupsRun.double.calls).toHaveLength(1);
  });

  it('NET-NEW — satisfies the OptionRepository port across all four of its declared members', async () => {
    const { repository, double } = recording(
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 'Size' }]),
      sqlRows([{ optionGroupID: 'group-b', optionGroupName: 'Colour' }]),
      sqlRows([{ optionID: 'option-2', optionName: 'Small', optionGroupName: 'Size' }]),
      sqlRows([{ optionGroupID: 'group-c', optionGroupName: 'Material' }]),
    );

    /*
     * The adapter is held through the PORT for the duration of this case, which is how every service
     * above it holds one. The annotation is the assertion: it compiles only while the concrete class
     * still satisfies `OptionRepository`, so a signature drifting apart from the contract fails the
     * typecheck rather than surviving until a service breaks. The four calls then prove the members are
     * reachable and behave identically through the interface.
     *
     * ⚠️ FOUR, NOT TWO. An earlier revision exercised only the two ported members and titled itself
     * "through both ported members", which left the two ROUTED bounded members outside the one assertion
     * in this file whose whole purpose is to notice a member drifting from the contract. Two of the port's
     * four declarations were therefore unchecked here, and the same revision's header entry said they were
     * out of scope. Both are corrected.
     */
    const port: OptionRepository = repository;

    const options = await port.findUnusedOptions(PRODUCT_ID, 'group-a');
    const groups = await port.findUnusedOptionGroups('group-a');
    const boundedOptions = await port.findUnusedOptionsBounded(
      { limit: 1, offset: 0 },
      PRODUCT_ID,
      'group-a',
    );
    const boundedGroups = await port.findUnusedOptionGroupsBounded(
      { limit: 1, offset: 0 },
      'group-a',
    );

    expect(options).toEqual([{ name: 'Size - Large', value: 'option-1' }]);
    expect(groups).toEqual([{ name: 'Colour', value: 'group-b' }]);

    /*
     * The bounded pair answers the SAME row shape as the ported pair, wrapped in a verdict rather than
     * returned bare — which is the whole of the difference between them. Asserting the wrapped rows here,
     * and not merely that the members exist, is what makes "satisfies the port" mean satisfied in
     * behaviour and not just in shape.
     */
    expect(boundedOptions).toEqual({
      rows: [{ name: 'Size - Small', value: 'option-2' }],
      hasMore: false,
    });
    expect(boundedGroups).toEqual({
      rows: [{ name: 'Material', value: 'group-c' }],
      hasMore: false,
    });

    /* FOUR members exercised, so four statements — one per declaration, none of them shared. */
    expect(double.calls).toHaveLength(4);

    /*
     * The port declares FOUR members, not two: the two ported reads above and their two windowed
     * companions. Naming all four keeps this case honest about the interface it claims to satisfy —
     * an earlier revision listed only the ported pair, which read as though the port closed at two.
     * The windowed pair is exercised for real in its own suites at the foot of this file; here the
     * claim is only that the concrete adapter answers the whole contract.
     */
    expect(typeof port.findUnusedOptions).toBe('function');
    expect(typeof port.findUnusedOptionsBounded).toBe('function');
    expect(typeof port.findUnusedOptionGroups).toBe('function');
    expect(typeof port.findUnusedOptionGroupsBounded).toBe('function');
  });

  it('NET-NEW — names only the four tables the legacy statements name, and no other', async () => {
    const options = await exerciseUnusedOptions(PRODUCT_ID, 'group-a');
    const groups = await exerciseUnusedOptionGroups('group-a');

    /*
     * The whole schema surface of `model/dao/OptionDAO.cfc`: `SwOption` and `SwOptionGroup` in both
     * statements' reach, plus `SwSkuOption` and `SwSku` inside the first statement's non-existence
     * guard. Nothing else is consulted — no pricing, inventory, stock or location table, none of which
     * is in scope — and the second statement reaches only the option-group table.
     */
    for (const table of [OPTION_TABLE, OPTION_GROUP_TABLE, SKU_OPTION_TABLE, SKU_TABLE]) {
      expect(options.call.sql).toContain(table);
    }

    expect(groups.call.sql).toContain(OPTION_GROUP_TABLE);
    expect(groups.call.sql).not.toContain(SKU_OPTION_TABLE);
    expect(groups.call.sql).not.toContain(SKU_TABLE);
  });
});

describe('MySqlOptionRepository.findUnusedOptions — NET-NEW: a NULL name in the projection', () => {
  it('NET-NEW — composes the label around an empty string rather than yielding a NULL label', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: null }]),
    );

    /*
     * G6 — THE LABEL IS COMPOSED IN TYPESCRIPT RATHER THAN IN SQL, AND THIS IS THE CASE THAT SHOWS WHY.
     *
     * Concatenating the two names in the statement would be shorter, and it would diverge here: MySQL's
     * string concatenation yields NULL when ANY argument is NULL, so a NULL group name would arrive as a
     * NULL label and be rejected downstream. The legacy interpolation at `model/dao/OptionDAO.cfc:L88`
     * cannot produce that outcome, because a CFML query column read never yields null — it yields the
     * empty string — so the legacy composed a visible, if oddly empty, entry. Composing above the
     * statement reproduces the legacy outcome across that difference.
     *
     * Both name columns really are nullable: `model/entity/Option.cfc:L54` and
     * `model/entity/OptionGroup.cfc:L53` declare no `notnull` constraint, and the required-ness they do
     * have is declared in the validation layer rather than in the schema.
     */
    expect(soleRow(rows).name).toBe(`${LABEL_SEPARATOR}Large`);
    expect(soleRow(rows).name).not.toContain('null');
  });

  it('NET-NEW — keeps the separator when the option name is the NULL half', async () => {
    const { rows } = await exerciseUnusedOptions(
      PRODUCT_ID,
      'group-a',
      sqlRows([{ optionID: 'option-1', optionName: null, optionGroupName: 'Size' }]),
    );

    expect(soleRow(rows).name).toBe(`Size${LABEL_SEPARATOR}`);
  });

  it('NET-NEW — refuses a projection that is missing a name column, rather than blanking it', async () => {
    const { repository } = recording(sqlRows([{ optionID: 'option-1', optionName: 'Large' }]));

    /*
     * An ABSENT column is not a data condition — no row of the composed projection can lack a column the
     * statement selects — so it means the statement text and the row reader have drifted apart, which is
     * an adapter defect. Substituting a blank would turn that into plausible-looking output surfacing far
     * from its cause. The assertion matches the reported column name because naming the drifted column is
     * the whole value of the report; the error TYPE is asserted where the error class is tested, not here,
     * since this file imports only the four modules its subject depends on.
     */
    await expect(repository.findUnusedOptions(PRODUCT_ID, 'group-a')).rejects.toThrow(
      /supplied no "optionGroupName" column/,
    );
  });

  it('NET-NEW — refuses a name column that does not hold text, rather than coercing it', async () => {
    const { repository } = recording(
      sqlRows([{ optionID: 'option-1', optionName: 'Large', optionGroupName: 42 }]),
    );

    /*
     * Coercing a number or a date into a label would hide the fact that the column being read is not the
     * column intended — the failure would reach a rendered drop-down as a plausible entry instead of
     * reaching a log.
     */
    await expect(repository.findUnusedOptions(PRODUCT_ID, 'group-a')).rejects.toThrow(
      /holds a value that is not text/,
    );
  });
});

/* ===============================================================================================
 * THE THREE ADDITIVE MEMBERS
 * ===============================================================================================
 * Everything above this line ports `model/dao/OptionDAO.cfc`. Everything below it covers public code
 * the legacy DAO has no counterpart for, and each suite states WHY the member exists before asserting
 * what it does — because a member with no legacy origin is exactly the member a later reader is most
 * tempted to delete, and an uncovered one can be deleted with the whole file still green.
 *
 * ⛔ NO NEW BEHAVIOUR IS ASSERTED FOR THE PORTED STATEMENTS HERE. The two windowed members delegate
 * their list splitting, their placeholder list, their statement text and their bind order to the same
 * three collaborators the unbounded members use. The cases below therefore assert SAMENESS — the same
 * statement with a `LIMIT`/`OFFSET` pair appended after the `ORDER BY` and bound last — which is the
 * only property that keeps the pair from drifting into filtering differently.
 * ============================================================================================= */

/**
 * The two placeholders the window appends, in `LIMIT ? OFFSET ?` order.
 *
 * Written out as the tail an assertion compares against, so a clause appended after the window would
 * shift the tail and fail rather than hide behind a `toContain`.
 */
const WINDOW_TAIL = 'LIMIT ? OFFSET ?';

/** The window every bounded case uses unless it is about the window itself. */
const WINDOW = Object.freeze({ limit: 2, offset: 0 });

/**
 * A bounded-read window's bound pair, exactly as the production helper derives it.
 *
 * ⚠️ BOTH VALUES ARE TEXT, NOT NUMBERS, AND THAT IS A MEASURED DRIVER CONSTRAINT RATHER THAN A STYLE
 * CHOICE. `src/adapters/mysql/QueryRunner.ts` records that `mysql2@3.23.2` speaking to MySQL 8.4
 * answers `ER_WRONG_ARGUMENTS` when a NUMBER is bound to a row-count placeholder in a true
 * server-side prepared statement, and answers the expected rows when the same value is bound as
 * decimal text. No case in this repository reaches a database, so binding a number would type-check,
 * lint clean and pass every test while failing on the first real connection — which is precisely why
 * the expected pair is spelled out here as strings.
 *
 * ⚠️ THE LIMIT IS `limit + 1`, NOT `limit`. The extra row is the PROBE: it is what lets `hasMore` be
 * an observed fact rather than an inference from a full window, and it is discarded before the rows
 * reach the caller.
 *
 * @param limit - the caller's row ceiling.
 * @param offset - the caller's zero-based offset.
 * @returns the two bound values, in the order the statement places them.
 */
function windowBindings(limit: number, offset: number): readonly [string, string] {
  return [String(limit + 1), String(offset)];
}

/**
 * A row the first statement's projection can produce, numbered so ordering is observable.
 *
 * @param index - distinguishes the rows within one canned answer.
 * @returns one raw driver row for the unused-options projection.
 */
function unusedOptionRow(index: number): {
  readonly optionID: string;
  readonly optionName: string;
  readonly optionGroupName: string;
} {
  return {
    optionID: `option-${String(index)}`,
    optionName: `Name ${String(index)}`,
    optionGroupName: 'Size',
  };
}

/**
 * A row the second statement's projection can produce.
 *
 * @param index - distinguishes the rows within one canned answer.
 * @returns one raw driver row for the unused-option-groups projection.
 */
function unusedOptionGroupRow(index: number): {
  readonly optionGroupID: string;
  readonly optionGroupName: string;
} {
  return { optionGroupID: `group-${String(index)}`, optionGroupName: `Group ${String(index)}` };
}

/* ===============================================================================================
 * `withExecutor(executor)` — RE-BINDING TO A TRANSACTION-SCOPED EXECUTOR
 * ===============================================================================================
 * ⚠️ NO LEGACY COUNTERPART, AND THE REASON IS EXECUTION-MODEL MISMATCH M5. A legacy DAO never chooses
 * a connection: the ORM session is ambient and `org/Hibachi/Hibachi.cfc` flushes it at request end
 * only when the request reports no errors, so the DAO simply participates in whatever transaction the
 * request already holds. A stateless handler has no request end and no ambient session, so the port
 * makes the boundary explicit — and an adapter that could only ever hold the POOL-bound executor it
 * was constructed with would leave every statement outside the boundary's transaction, where a
 * rollback cannot undo it.
 *
 * ⚠️ A NEW INSTANCE, NOT A MUTATION, AND THE DIFFERENCE IS THE WHOLE POINT. Re-binding in place would
 * make an adapter's connection depend on WHEN it was used rather than on WHICH instance was used — an
 * ambient current-transaction slot in all but name, and the same warm-container bleed M7 rules out.
 * Two concurrent boundaries must not be able to observe each other's connection.
 * ============================================================================================= */

describe('MySqlOptionRepository.withExecutor — NET-NEW: re-binding, and its isolation', () => {
  it('NET-NEW — answers a NEW instance of the same class and leaves the receiver alone', () => {
    const { repository } = recording();
    const replacement = createSqlExecutorDouble();

    const rebound = repository.withExecutor(replacement.executor);

    expect(rebound).not.toBe(repository);
    expect(rebound).toBeInstanceOf(MySqlOptionRepository);
  });

  it('NET-NEW — every statement the re-bound instance issues lands on the REPLACEMENT executor', async () => {
    const original = recording();
    const replacement = createSqlExecutorDouble({
      outcomes: [sqlRows([unusedOptionRow(1)])],
    });

    const rebound = original.repository.withExecutor(replacement.executor);
    const rows = await rebound.findUnusedOptions(PRODUCT_ID, 'group-a');

    /*
     * This is the property that makes wrapping a call in a transaction boundary mean anything: the
     * statement runs on the connection the boundary owns, so a rollback can undo it and a read can
     * observe a sibling write the same transaction already issued.
     */
    expect(replacement.calls).toHaveLength(1);
    expect(normalize(callAt(replacement, 0).sql)).toBe(
      normalize(UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS.replace(' IN (?, ?)', ' IN (?)')),
    );
    expect(callAt(replacement, 0).params).toEqual(['group-a', PRODUCT_ID]);
    expect(rows).toEqual([{ name: 'Size - Name 1', value: 'option-1' }]);

    /* And NOTHING reached the executor the receiver still holds. */
    expect(original.double.calls).toHaveLength(0);
  });

  it('NET-NEW — the ORIGINAL keeps its own executor and stays usable after the re-binding', async () => {
    const original = recording(sqlRows([]), sqlRows([]));
    const replacement = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    const rebound = original.repository.withExecutor(replacement.executor);
    await rebound.findUnusedOptionGroups('inside');
    await original.repository.findUnusedOptionGroups('outside');

    /*
     * The captured executor is `private readonly` and re-binding never reassigns it, so the
     * pool-bound instance a composition root built is still pool-bound afterwards. A mutating
     * implementation would put BOTH statements on the replacement, and this case is what catches it.
     */
    expect(replacement.calls).toHaveLength(1);
    expect(callAt(replacement, 0).params).toEqual(['inside']);
    expect(original.double.calls).toHaveLength(1);
    expect(callAt(original.double, 0).params).toEqual(['outside']);
  });

  it('NET-NEW — two re-bindings of one receiver cannot observe each other', async () => {
    const original = recording();
    const first = createSqlExecutorDouble({ outcomes: [sqlRows([])] });
    const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    const boundaryOne = original.repository.withExecutor(first.executor);
    const boundaryTwo = original.repository.withExecutor(second.executor);
    await boundaryOne.findUnusedOptionGroups('one');
    await boundaryTwo.findUnusedOptionGroups('two');

    /*
     * M7 — two concurrent boundaries on one warm container get two instances. If re-binding mutated,
     * the second call would have travelled on whichever executor was bound last and one boundary
     * would have committed inside the other's transaction.
     */
    expect(boundaryOne).not.toBe(boundaryTwo);
    expect(first.calls).toHaveLength(1);
    expect(callAt(first, 0).params).toEqual(['one']);
    expect(second.calls).toHaveLength(1);
    expect(callAt(second, 0).params).toEqual(['two']);
  });

  it('NET-NEW — the re-bound instance still answers the whole OptionRepository port', async () => {
    const original = recording();
    const replacement = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    /* A positive type-level assertion rather than a suppression: the re-bound value is USED as the
     * port, so a narrowed return type on `withExecutor` would fail to compile right here. */
    const rebound: OptionRepository = original.repository.withExecutor(replacement.executor);

    expect(typeof rebound.findUnusedOptions).toBe('function');
    expect(typeof rebound.findUnusedOptionsBounded).toBe('function');
    expect(typeof rebound.findUnusedOptionGroups).toBe('function');
    expect(typeof rebound.findUnusedOptionGroupsBounded).toBe('function');
    await expect(rebound.findUnusedOptionGroups('group-a')).resolves.toEqual([]);
  });

  /*
   * ⭐ REVIEW FINDING F3 — PORT EXHAUSTIVENESS, KEYED OFF THE PORT ITSELF RATHER THAN OFF A HAND LIST.
   * The case above proves the re-bound instance still answers the port; this one proves the list of
   * members being checked is COMPLETE. A hand-written enumeration silently stops covering a port the
   * day a member is added, which is the gap F3 reported; the mapped type below fails to COMPILE
   * instead.
   */
  it('NET-NEW — satisfies the OptionRepository port across ALL FOUR declared members', () => {
    const asPort: OptionRepository = recording().repository;

    /* Keyed off the port's own member set, so a fifth method breaks compilation here until it is named. */
    const everyPortMember: Record<keyof OptionRepository, true> = {
      findUnusedOptions: true,
      findUnusedOptionsBounded: true,
      findUnusedOptionGroups: true,
      findUnusedOptionGroupsBounded: true,
    };

    const declared = Object.keys(everyPortMember) as readonly (keyof OptionRepository)[];

    expect(declared).toHaveLength(4);
    for (const member of declared) {
      expect(typeof asPort[member]).toBe('function');
    }
  });

  it('NET-NEW — re-binding is absent from the port, so a service-side double needs no executor', () => {
    /*
     * The compile-time half of the boundary claim. A service may not know that a statement executor
     * exists at all, so `withExecutor` is exposed on the CONCRETE adapter only. If anyone added it to
     * `OptionRepository`, this literal would stop compiling and say so at the boundary rather than in
     * a service test — and no mocking library is needed to state it, which the legacy suite does not
     * vendor either.
     */
    const double: OptionRepository = {
      findUnusedOptions: () => Promise.resolve([]),
      findUnusedOptionsBounded: () => Promise.resolve({ rows: [], hasMore: false }),
      findUnusedOptionGroups: () => Promise.resolve([]),
      findUnusedOptionGroupsBounded: () => Promise.resolve({ rows: [], hasMore: false }),
    };

    expect(Object.keys(double)).not.toContain('withExecutor');
    expect(Object.keys(double)).toHaveLength(4);
  });
});

/* ===============================================================================================
 * `findUnusedOptionsBounded(window, productID, existingOptionGroupIDList)`
 * ===============================================================================================
 * ⚠️ THE BIND-ORDER TRAP IS STILL LIVE, AND THE WINDOW SITS AFTER IT. The group identifiers bind
 * FIRST and the product identifier LAST — statement order, the reverse of the argument order — and
 * the two window values bind after both, in positions the legacy statement never used. So the window
 * CANNOT disturb the legacy sequence, and that is what these cases assert.
 * ============================================================================================= */

describe('MySqlOptionRepository.findUnusedOptionsBounded — NET-NEW: the window, and only the window', () => {
  it('NET-NEW — issues the ported statement with the window appended after its ORDER BY', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, 'group-a,group-b');

    const text = normalize(soleCall(double).sql);

    /*
     * Written as a whole-statement equality rather than a fragment search, for the reason the two
     * ported statements are: a fragment proves something expected is present, an equality also proves
     * nothing UNEXPECTED is — no extra predicate, no re-ordered sort, no second `LIMIT`.
     */
    expect(text).toBe(clause(UNUSED_OPTIONS_STATEMENT_FOR_TWO_GROUPS, WINDOW_TAIL));
    /* The window is the statement's LAST clause, which is the only place a `LIMIT` is meaningful:
     * `model/dao/OptionDAO.cfc:L82-L84` orders by group name then option name, so the slice is
     * deterministic rather than arbitrary. */
    expect(tail(text, WINDOW_TAIL)).toBe(WINDOW_TAIL);
    expect(text.indexOf(UNUSED_OPTIONS_ORDERING)).toBeLessThan(text.indexOf(WINDOW_TAIL));
  });

  it('NET-NEW — binds group identifiers FIRST, the product identifier LAST, and the window after both', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionsBounded(
      { limit: 5, offset: 10 },
      PRODUCT_ID,
      'group-a,group-b',
    );

    /*
     * TR-4 — the bound array follows the LEGACY STATEMENT sequence, and the window occupies positions
     * the legacy never had. Both legacy parameters are `string`, so a transposition compiles, throws
     * nothing and quietly returns the wrong option set; only this ordering assertion catches it.
     */
    expect(soleCall(double).params).toEqual([
      'group-a',
      'group-b',
      PRODUCT_ID,
      ...windowBindings(5, 10),
    ]);
  });

  it('NET-NEW — binds limit + 1 as the probe, and both window values as decimal TEXT', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionsBounded({ limit: 3, offset: 0 }, PRODUCT_ID, 'group-a');

    const bound = soleCall(double).params;

    expect(bound.slice(-2)).toEqual(['4', '0']);
    for (const value of bound.slice(-2)) {
      expect(typeof value).toBe('string');
    }
  });

  it('NET-NEW — reports hasMore TRUE and DISCARDS the probe row when one lies past the window', async () => {
    const { repository } = recording(
      sqlRows([unusedOptionRow(1), unusedOptionRow(2), unusedOptionRow(3)]),
    );

    const result = await repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, 'group-a');

    /*
     * `hasMore` is OBSERVED rather than inferred from a full window: an exactly-full window is not
     * evidence of more rows, since the match set may end on the boundary. The third row is the probe
     * and never reaches the caller, which keeps `rows.length <= limit` an invariant.
     */
    expect(result.hasMore).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.value)).toEqual(['option-1', 'option-2']);
  });

  it('NET-NEW — reports hasMore FALSE for an EXACTLY full window, not true', async () => {
    const { repository } = recording(sqlRows([unusedOptionRow(1), unusedOptionRow(2)]));

    const result = await repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, 'group-a');

    /* Inferring `hasMore` from `rows.length === limit` would report `true` for this complete answer
     * and send the caller on one guaranteed-empty follow-up read. */
    expect(result.hasMore).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it('NET-NEW — an offset past the end is an empty window with hasMore false, not an error', async () => {
    const { repository, double } = recording(sqlRows([]));

    const result = await repository.findUnusedOptionsBounded(
      { limit: 2, offset: 500 },
      PRODUCT_ID,
      'group-a',
    );

    expect(result).toEqual({ rows: [], hasMore: false });
    expect(soleCall(double).params).toEqual(['group-a', PRODUCT_ID, ...windowBindings(2, 500)]);
  });

  it('NET-NEW — composes the label exactly as the unbounded member does, with no second format', async () => {
    const { repository } = recording(sqlRows([unusedOptionRow(1)]));

    const result = await repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, 'group-a');

    /* One label format for both readings. A second one here would drift the moment
     * `model/dao/OptionDAO.cfc:L88`'s separator was ever revisited. */
    expect(soleRow(result.rows).name).toBe(`Size${LABEL_SEPARATOR}Name 1`);
  });

  it('NET-NEW — an EMPTY group list still binds one placeholder to the empty string', async () => {
    const { repository, double } = recording(sqlRows([]));

    const result = await repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, '');

    /*
     * The ordinary state of a product with no option groups yet, and neither guarded nor treated as
     * an error on either reading. The clause becomes a membership test against a single empty string,
     * which no real identifier satisfies.
     */
    expect(membershipMarkers(soleCall(double).sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?');
    expect(soleCall(double).params).toEqual(['', PRODUCT_ID, ...windowBindings(2, 0)]);
    expect(result.rows).toEqual([]);
  });

  it('NET-NEW — a DUPLICATED group identifier keeps its own placeholder, on the window path too', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, 'group-a,group-a');

    /* One marker per list element, duplicates included: the port de-duplicates nothing, because
     * `model/dao/OptionDAO.cfc:L68` builds one `<cfqueryparam>` per element. */
    expect(membershipMarkers(soleCall(double).sql, OPTION_GROUP_FILTER_COLUMN, 'IN')).toBe('?, ?');
    expect(soleCall(double).params).toEqual([
      'group-a',
      'group-a',
      PRODUCT_ID,
      ...windowBindings(2, 0),
    ]);
  });

  it('NET-NEW — a hostile group identifier is BOUND, never written into the statement text', async () => {
    const hostile = "group-a' OR 1=1 --";
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionsBounded(WINDOW, `${PRODUCT_ID}' --`, hostile);

    /*
     * S2 — the window does not open a text-composition path. Every caller value is still a bound
     * parameter, and the only text the adapter composes is whitelist-validated identifiers plus bind
     * markers, so no quote and no comment introducer can appear in the statement at all.
     */
    const { sql, params } = soleCall(double);
    expect(params).toEqual([hostile, `${PRODUCT_ID}' --`, ...windowBindings(2, 0)]);
    expect(sql).not.toContain(hostile);
    expect(sql).not.toContain("'");
    expect(sql).not.toContain('--');
  });

  it('NET-NEW — REFUSES an unusable window rather than clamping it, and issues no statement', async () => {
    /*
     * ⛔ THE EXPECTED SENTENCE IS PER WINDOW KIND, NOT ONE PATTERN FOR ALL SIX. Both refusals open with
     * "A bounded read needs …", so a single `/bounded read needs/` cannot tell a rejected LIMIT from a
     * rejected OFFSET — it would pass against an implementation that answered the wrong complaint. The
     * limit clause and the offset clause are therefore matched separately, and every case additionally
     * requires the "refused rather than adjusted" clause, because THAT is the behavioural claim: a
     * clamped bound would answer a different question than the one asked and report nothing about the
     * substitution, which is the same silent truncation the bounded members exist to avoid.
     */
    const unusableWindows: readonly {
      readonly window: { readonly limit: number; readonly offset: number };
      readonly complaint: RegExp;
    }[] = [
      { window: { limit: 0, offset: 0 }, complaint: /needs a positive whole row limit/ },
      { window: { limit: -1, offset: 0 }, complaint: /needs a positive whole row limit/ },
      { window: { limit: 1.5, offset: 0 }, complaint: /needs a positive whole row limit/ },
      { window: { limit: Number.NaN, offset: 0 }, complaint: /needs a positive whole row limit/ },
      { window: { limit: 2, offset: -1 }, complaint: /needs a whole, non-negative offset/ },
      { window: { limit: 2, offset: 0.5 }, complaint: /needs a whole, non-negative offset/ },
    ];

    for (const { window, complaint } of unusableWindows) {
      const { repository, double } = recording(sqlRows([]));

      /* Refusing BEFORE any statement is issued is the observable half: a refused window costs no round
       * trip, so the bound is not merely reported but enforced ahead of the database. */
      await expect(
        repository.findUnusedOptionsBounded(window, PRODUCT_ID, 'group-a'),
      ).rejects.toThrow(complaint);
      await expect(
        repository.findUnusedOptionsBounded(window, PRODUCT_ID, 'group-a'),
      ).rejects.toThrow(/refused rather than adjusted/);
      expect(double.calls).toHaveLength(0);
    }
  });

  it('NET-NEW — names the refusing MEMBER in the failure context, not just the window', async () => {
    const { repository } = recording(sqlRows([]));

    await expect(
      repository.findUnusedOptionsBounded({ limit: 0, offset: 0 }, PRODUCT_ID, 'group-a'),
    ).rejects.toMatchObject({
      context: {
        member: 'MySqlOptionRepository.findUnusedOptionsBounded',
        limit: 0,
        offset: 0,
      },
    });
  });
});

/* ===============================================================================================
 * `findUnusedOptionGroupsBounded(window, existingOptionGroupIDList)`
 * ===============================================================================================
 * ⚠️ THE `NOT IN` POLARITY IS THE WHOLE REASON A WINDOW IS USEFUL HERE. The unbounded member returns
 * EVERY option group for a product that has none yet — the mirror image of its sibling — so this is
 * the member whose result is largest exactly when a caller has least information. The polarity is
 * untouched by the window, and the first case below is what proves it.
 * ============================================================================================= */

describe('MySqlOptionRepository.findUnusedOptionGroupsBounded — NET-NEW: the window over the NOT IN read', () => {
  it('NET-NEW — issues the ported statement with the window appended after its single ORDER BY', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionGroupsBounded(WINDOW, 'group-a');

    const text = normalize(soleCall(double).sql);

    expect(text).toBe(clause(UNUSED_OPTION_GROUPS_STATEMENT_FOR_ONE_GROUP, WINDOW_TAIL));
    expect(tail(text, WINDOW_TAIL)).toBe(WINDOW_TAIL);
    expect(text.indexOf(UNUSED_OPTION_GROUPS_ORDERING)).toBeLessThan(text.indexOf(WINDOW_TAIL));
  });

  it('NET-NEW — keeps the NOT IN polarity, so the window narrows rows without inverting the question', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionGroupsBounded(WINDOW, 'group-a,group-b');

    /*
     * The two members receive the SAME argument and filter it with INVERTED predicates — the sibling
     * keeps rows whose group IS in the list, this one keeps rows that are NOT. One token of
     * difference, and normalising the pair in either direction would change output that reaches a
     * rendered page. The lookup proves the operator, because the operator is part of the searched text.
     */
    expect(membershipMarkers(soleCall(double).sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe(
      '?, ?',
    );
    expect(normalize(soleCall(double).sql)).not.toContain(
      `${OPTION_GROUP_EXCLUSION_COLUMN} IN (?, ?)`,
    );
  });

  it('NET-NEW — binds the group identifiers first and the window last, with no product identifier', async () => {
    const { repository, double } = recording(sqlRows([]));

    await repository.findUnusedOptionGroupsBounded({ limit: 4, offset: 8 }, 'group-a,group-b');

    /*
     * This statement takes NO product identifier — `model/dao/OptionDAO.cfc:L95` declares one
     * argument and `:L100-L110` names no product, no join and no non-existence guard. So the window
     * follows the group list directly, and a stray third value here would mean the two members had
     * been merged.
     */
    expect(soleCall(double).params).toEqual(['group-a', 'group-b', ...windowBindings(4, 8)]);
  });

  it('NET-NEW — reports hasMore TRUE and discards the probe row', async () => {
    const { repository } = recording(
      sqlRows([unusedOptionGroupRow(1), unusedOptionGroupRow(2), unusedOptionGroupRow(3)]),
    );

    const result = await repository.findUnusedOptionGroupsBounded(WINDOW, 'group-a');

    expect(result.hasMore).toBe(true);
    expect(result.rows).toEqual([
      { name: 'Group 1', value: 'group-1' },
      { name: 'Group 2', value: 'group-2' },
    ]);
  });

  it('NET-NEW — reports hasMore FALSE when the window reached the end of the match set', async () => {
    const { repository } = recording(sqlRows([unusedOptionGroupRow(1)]));

    const result = await repository.findUnusedOptionGroupsBounded(WINDOW, 'group-a');

    expect(result.hasMore).toBe(false);
    expect(soleRow(result.rows)).toEqual({ name: 'Group 1', value: 'group-1' });
  });

  it('NET-NEW — returns the BARE group name, never the sibling two-part label', async () => {
    const { repository } = recording(sqlRows([unusedOptionGroupRow(1)]));

    const result = await repository.findUnusedOptionGroupsBounded(WINDOW, 'group-a');

    /* `model/dao/OptionDAO.cfc:L113` assembles the plain group name. The two row shapes are
     * identical and their meanings are not, which is why the projections are never merged. */
    expect(soleRow(result.rows).name).not.toContain(LABEL_SEPARATOR);
  });

  it('NET-NEW — an EMPTY list still binds one placeholder, so every group remains a candidate', async () => {
    const { repository, double } = recording(
      sqlRows([unusedOptionGroupRow(1), unusedOptionGroupRow(2)]),
    );

    const result = await repository.findUnusedOptionGroupsBounded(WINDOW, '');

    /*
     * The empty identifier excludes nothing on the NOT-IN side, so a product with no option groups
     * yet legitimately sees EVERY group — the mirror of the sibling member's empty answer for the same
     * input. Both are correct, and the window is what makes the largest of the two answers usable.
     */
    expect(membershipMarkers(soleCall(double).sql, OPTION_GROUP_EXCLUSION_COLUMN, 'NOT IN')).toBe(
      '?',
    );
    expect(soleCall(double).params).toEqual(['', ...windowBindings(2, 0)]);
    expect(result.rows).toHaveLength(2);
  });

  it('NET-NEW — REFUSES an unusable window rather than clamping it, and issues no statement', async () => {
    for (const window of [
      { limit: 0, offset: 0 },
      { limit: 2, offset: -3 },
      { limit: Number.POSITIVE_INFINITY, offset: 0 },
    ]) {
      const { repository, double } = recording(sqlRows([]));

      await expect(repository.findUnusedOptionGroupsBounded(window, 'group-a')).rejects.toThrow(
        /bounded read needs/,
      );
      expect(double.calls).toHaveLength(0);
    }
  });

  it('NET-NEW — names its OWN member in the failure context, distinct from its sibling', async () => {
    const { repository } = recording(sqlRows([]));

    await expect(
      repository.findUnusedOptionGroupsBounded({ limit: 0, offset: 0 }, 'group-a'),
    ).rejects.toMatchObject({
      context: { member: 'MySqlOptionRepository.findUnusedOptionGroupsBounded' },
    });
  });

  it('NET-NEW — issues exactly one statement per bounded call, on both windowed members', async () => {
    const options = recording(sqlRows([]));
    await options.repository.findUnusedOptionsBounded(WINDOW, PRODUCT_ID, 'group-a');

    const groups = recording(sqlRows([]));
    await groups.repository.findUnusedOptionGroupsBounded(WINDOW, 'group-a');

    /* The probe row is requested by widening the `LIMIT`, not by a second round trip: one statement
     * answers both the window and the `hasMore` question. */
    expect(options.double.calls).toHaveLength(1);
    expect(groups.double.calls).toHaveLength(1);
  });
});
