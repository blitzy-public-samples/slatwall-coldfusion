// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts                             composition root (wiring)
//   src/services/productService.ts                        the consumer of this adapter
//   src/services/priceGroupService.ts                     the product-type ancestry consumer
//   src/repositories/mysql/mysqlPriceGroupRepository.ts   the sibling path-maintaining adapter
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the MySQL adapter for product-type reads and writes
//
// WHAT THIS MODULE IS
//   The secondary adapter that implements `ProductTypeRepository` over `mysql2`
//   server-side prepared statements. It ports `model/dao/ProductTypeDAO.cfc` - a
//   68-line cfscript component declaring EXACTLY ONE function - and adds the
//   entity read and save surface the service tier needs now that `entityNew()`,
//   `entityLoad()` and `super.save()` have no equivalent in a driver-only stack
//   (transformation rule T3).
//
//   It owns five things and nothing else: the four statements, the binding of
//   their parameters, the single row-to-entity factory, the in-memory ancestry
//   linkage, and the explicit materialized-path maintenance that replaces two ORM
//   lifecycle hooks. It opens no connection, reads no environment variable, holds
//   no credential, and creates, alters or drops nothing - the `Sw*` tables are
//   consumed exactly as they already exist (B5).
//
// THE PORT IS AUTHORITATIVE, AND ITS SURFACE IS FOUR METHODS
//   `src/domain/ports/productTypeRepository.ts` declares exactly four methods and
//   this class implements exactly those four - no fifth, no delete, no search, no
//   listing-by-parent, no load-all, no count, no existence check, no tree builder,
//   no path-computing helper, no batch variant, no overload and no options bag.
//   Where this file's own commentary and the port could be read as disagreeing
//   about a name, a parameter or a return type, the port wins.
//
//   `getProductTypeQuery` keeps the legacy name verbatim in CFML camelCase, takes
//   zero arguments as [model/dao/ProductTypeDAO.cfc:L52] does, and returns ROWS
//   rather than entities because that is what the port publishes: the legacy body
//   returns a CFML query object and its consumer reads it column-wise, so
//   "upgrading" it to hydrated entities would invent a contract (B4).
//
// LOCATOR DRIFT - VERIFIED AGAINST THE SOURCE, NOT TRUSTED FROM THE CITATION
//   Every locator below was opened in the legacy tree and matched. Three cited
//   locators carried drift and are corrected here rather than repeated:
//
//     ORDER BY productTypeName ASC   cited at L54; it is at
//                                    [model/dao/ProductTypeDAO.cfc:L62]. L54 is
//                                    where `setSQL(` opens - the statement spans
//                                    L54-L62.
//     ProductType.preInsert          cited at L306; that is the BODY line. The
//                                    declaration is at
//                                    [model/entity/ProductType.cfc:L305] and the
//                                    method spans L305-L308.
//     ProductType.preUpdate          cited at L311; that is the BODY line. The
//                                    declaration is at
//                                    [model/entity/ProductType.cfc:L310] and the
//                                    method spans L310-L313.
//
//   The verified map of what this file reproduces:
//
//     [model/dao/ProductTypeDAO.cfc:L51]      the @hint, carried forward verbatim
//     [model/dao/ProductTypeDAO.cfc:L52]      getProductTypeQuery, the only function
//     [model/dao/ProductTypeDAO.cfc:L53]      var qs = new query()
//     [model/dao/ProductTypeDAO.cfc:L54]      setSQL opens; the projection is SELECT *
//     [model/dao/ProductTypeDAO.cfc:L55-L57]  the correlated isAssigned count
//     [model/dao/ProductTypeDAO.cfc:L58-L60]  the correlated childCount, aliased spt
//     [model/dao/ProductTypeDAO.cfc:L61]      FROM
//     [model/dao/ProductTypeDAO.cfc:L62]      ORDER BY productTypeName ASC
//     [model/dao/ProductTypeDAO.cfc:L63]      the trailing comment, carried verbatim
//     [model/dao/ProductTypeDAO.cfc:L64]      qs.execute().getResult()
//     [model/entity/ProductType.cfc:L49]      table="SwProductType"
//     [model/entity/ProductType.cfc:L52-L59]  the eight scalar columns
//     [model/entity/ProductType.cfc:L62]      parentProductType, fkcolumn parentProductTypeID
//     [model/entity/ProductType.cfc:L65]      childProductTypes
//     [model/entity/ProductType.cfc:L66]      products, lazy="extra"
//     [model/entity/ProductType.cfc:L67]      attributeValues, cascade="all-delete-orphan"
//     [model/entity/ProductType.cfc:L80]      remoteID
//     [model/entity/ProductType.cfc:L83-L86]  the four audit columns
//     [model/entity/ProductType.cfc:L305-L313] the two path-maintaining hooks
//     [org/Hibachi/HibachiEntity.cfc:L308-L324] buildIDPathList, provenance only
//     [org/Hibachi/HibachiEntity.cfc:L598-L649] the pre-insert audit stamping
//     [org/Hibachi/HibachiEntity.cfc:L651-L679] the pre-update audit stamping
//
//   `org/Hibachi/**` is a boundary to extract from and NEVER to modify, and no
//   file under it is ported. It appears above as provenance for an algorithm and
//   for two stamping behaviours, and for nothing else.
//
// THE SCHEMA-NAMING CORRECTION - AND WHY IT IS NOT MARKED AS A PRESERVED DEFECT
//   The legacy statement is RAW SQL built with `new query()` + `setSQL()` +
//   `execute()`, and it names `SlatwallProductType` and `SlatwallProduct` - the ORM
//   ENTITY names - while the physical tables are `SwProductType`
//   [model/entity/ProductType.cfc:L49] and `SwProduct` [model/entity/Product.cfc:L49].
//   Raw SQL goes to the datasource unmediated by Hibernate, so the legacy method
//   cannot resolve those names, and no `CREATE VIEW` exists anywhere in the
//   repository to alias them.
//
//   Three mechanisms, three different correctness stories, and only one of them
//   needs a correction:
//     HQL via ormExecuteQuery    correctly uses Slatwall* entity names  - no change
//     tag <cfquery>              correctly uses physical Sw* names      - no change
//     raw new Query()+setSQL()   incorrectly uses Slatwall* names       - CORRECTED
//   The raw-SQL class has exactly three in-scope members: this one,
//   [model/dao/SkuDAO.cfc:L131-L138] and [model/dao/ProductDAO.cfc:L420-L427].
//
//   The physical names are therefore emitted. That is a CORRECTION mandated by
//   schema continuity, and it deliberately carries no `LEGACY-DEFECT` marker: that
//   marker means "preserved deliberately", and here the behaviour is corrected
//   rather than preserved. No view is created, no alias is added, and no DDL of any
//   kind appears in this port.
//
// TWO MODULES THAT ARE DELIBERATELY NOT IMPORTED, EACH FOR A STATED REASON
//   `src/domain/valueObjects/money.ts` - `SwProductType` HAS NO MONETARY COLUMN.
//   The four `big_decimal` columns of the slice are elsewhere: `SkuCurrency.price`
//   [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
//   [model/entity/PriceGroupRate.cfc:L54], `PromotionApplied.discountAmount`
//   [model/entity/PromotionApplied.cfc:L53] and `PromotionReward.amount`
//   [model/entity/PromotionReward.cfc:L61]. Nothing this file reads or writes is
//   money, so no `Money` is constructed, no decimal string is parsed, and no
//   arithmetic - floating point or otherwise - is performed on any column here.
//   An import no expression consumed would also be rejected outright by
//   `noUnusedLocals`.
//
//   `src/domain/entities/product.ts` - the `products` collection is NEVER
//   materialized by this adapter (see the fetch-shape decisions below), so no
//   `Product` is constructed and the class is read as provenance only.
//
// FETCH SHAPE - AN EXPLICIT DECISION, MADE AND RECORDED ONCE PER METHOD (T3)
//   There is no ORM behind this adapter, so associations are MATERIALIZED at the
//   repository boundary and Hibernate laziness is never simulated. The decision
//   is recorded on each method rather than implied by a graph walk a caller can
//   trigger, which is what removes implicit repeated loading by construction.
//   That is a CORRECTNESS and EXPLICITNESS property, and it is claimed as nothing
//   else: this file makes no assertion of any kind about execution
//   characteristics.
//
//   For orientation, the whole in-scope DAO layer declares exactly five true
//   `JOIN FETCH` clauses - [model/dao/SkuDAO.cfc:L155], [:L157], [:L160] and
//   [model/dao/PromotionDAO.cfc:L66], [:L68] - and NONE of them is in
//   `ProductTypeDAO.cfc`, which has no fetch directive at all. Every fetch
//   decision in this file is therefore a NEW EXPLICIT DECISION rather than a
//   carried-over fetch plan.
//
// LAYER POSITION
//   A secondary adapter. It may import `mysql2`, `src/lib/**` and `src/domain/**`;
//   nothing under `src/domain/**` may import it, and that direction is enforced by
//   the ESLint `no-restricted-imports` boundary rather than by convention. It
//   imports nothing from `src/handlers/**`, `src/services/**` or
//   `src/integrations/**`, exports no barrel and re-exports nothing. It needs no
//   direct `mysql2` import: the driver is reached only through the injected
//   executor.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly `No user rules provided.` and it was
//   read in full - it is a single line. ZERO rules govern this file. No rule has
//   been invented to fill the gap and nothing here paraphrases one, and the
//   absence is not licence to lower the bar: the enterprise substitute standard
//   applies at full strength. The practices that bear hardest here are
//   parameterized SQL exclusively, maximal strictness with no `any`, no
//   suppression comment and no non-null assertion, one cohesive exported unit per
//   file with no barrel, env-driven configuration with nothing hardcoded, and
//   every judgment call annotated at the point where it was made.
//
// TEST COVERAGE IS NET-NEW - IT IS NOT PARITY AND MUST NEVER BE PRESENTED AS SUCH
//   Nothing in the legacy suite covers this DAO. `meta/tests/unit/dao/` contains
//   only `AccountDAOTest` and `PaymentDAOTest`, neither in scope, and there is no
//   legacy ProductTypeDAO test of any kind. Coverage for every method below is
//   consequently net-new. The obligations this file creates for the suites another
//   author owns are stated with each method, and none of them needs a live
//   server: the executor is injected, so a suite can implement the two-method
//   interface outright, record each `sql` string and each `params` array, and
//   return canned rows. NO TEST IS AUTHORED HERE.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { ProductType } from '../../domain/entities/productType.js';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../domain/ports/productTypeRepository.js';
import { buildIdPathList } from '../../domain/valueObjects/materializedIdPath.js';
import { listAppend, listLen } from '../../lib/cfml/list.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from './connection.js';
import { sqlPlaceholderList } from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { materializedIdPathLikePatternFragment } from './dialect.js';

// --- The dialect this adapter emits ------------------------------------------

// JUDGMENT CALL: the dialect is a MODULE CONSTANT and is deliberately NOT read
// from configuration. This file is the MySQL adapter - its name, its folder and
// its statements are MySQL by construction, not by environment - so the value
// handed to the fragment builder is the literal spelling, which
// `assertMySqlDialect` then confirms inside `./dialect.js`.
//
// `resolveConfiguredDialect()` is the alternative and it is rejected for a
// concrete reason: it loads the validated application configuration, so calling it
// here would make STATEMENT CONSTRUCTION depend on `DB_*` environment values. The
// test tier's contract is the opposite - `tests/setup.ts` states that suites must
// not depend on a `.env` file existing or on any `DB_*` value being set - and
// statement-shape assertions run with an injected fake executor and no database at
// all. Resolving the configured dialect is the composition root's business.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

// --- Failure reporting -------------------------------------------------------

/**
 * The result set and the row reader disagree about a column.
 *
 * Local and unexported, following the pattern established by
 * `src/repositories/mysql/connection.ts`, `src/repositories/mysql/dialect.ts` and
 * `src/repositories/mysql/mysqlOptionRepository.ts`: the class sets an explicit
 * `name` and a caller identifies it by that name rather than by importing the
 * constructor, which keeps this module's exported surface to the repository class
 * alone (E7).
 *
 * THE OFFENDING VALUE IS NEVER CARRIED. Only the column name, the statement it
 * came from and a description of the fault appear. A product-type column can hold
 * merchandising copy, a URL title or an account identifier, and an error message is
 * one of the easiest ways for such a value to reach a log stream; `connection.ts`
 * takes the same position for bound parameters, for the same reason.
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L64]: the legacy body hands its query
 * object straight back and the consumer reads columns off it by name, which raises
 * in CFML when the name is not a column of that result set. Raising here is
 * therefore the faithful outcome rather than an invention - and it is an INVARIANT
 * BETWEEN A STATEMENT AND ITS READER, not validation of a caller's argument. No
 * argument validation is added anywhere in this file, because the legacy performs
 * none.
 */
class ProductTypeColumnError extends Error {
  /** The column the reader asked for, as the reader spelled it. */
  readonly columnName: string;

  /** Which statement produced the row, so the fault is attributable. */
  readonly statementLabel: string;

  /** What went wrong. Never the value itself. */
  readonly detail: string;

  constructor(columnName: string, statementLabel: string, detail: string) {
    super(
      [
        `Column "${columnName}" of ${statementLabel} cannot be read: ${detail}.`,
        'The statement and its row reader must agree: every column a reader reads has to be',
        'selected by the statement that produced the row, and has to arrive in a shape that',
        'column can legitimately take.',
      ].join(' '),
    );
    this.name = 'ProductTypeColumnError';
    this.columnName = columnName;
    this.statementLabel = statementLabel;
    this.detail = detail;
  }
}

/**
 * A product type cannot be persisted in the state it was handed over in.
 *
 * One fault reaches this class: an UNSAVED PARENT. Hibernate refused a transient
 * many-to-one association outright rather than writing a placeholder key, and
 * `parentProductType` [model/entity/ProductType.cfc:L62] declares no cascade of its
 * own, so an unsaved parent had no path to the database in the legacy either.
 * Raising reproduces that refusal. Writing the unsaved sentinel - the empty string
 * that `unsavedvalue=""` [model/entity/ProductType.cfc:L52] gives an unsaved row -
 * would put a dangling foreign key into the `Sw*` schema silently, and every
 * ancestry walk over that row would then terminate on data rather than on
 * structure.
 *
 * The identifier is NOT echoed: it is the caller's data.
 */
class ProductTypePersistenceError extends Error {
  /** What made the product type unpersistable. Never a value. */
  readonly detail: string;

  constructor(detail: string) {
    super(
      [
        `A product type cannot be saved: ${detail}.`,
        'Hibernate raised on a transient association rather than writing a placeholder key, and',
        'model/entity/ProductType.cfc:L62 declares no cascade on parentProductType, so the parent',
        'has to be saved before the child references it.',
      ].join(' '),
    );
    this.name = 'ProductTypePersistenceError';
    this.detail = detail;
  }
}

// --- Reading a column off a row ----------------------------------------------
//
// CFML parity [model/dao/ProductTypeDAO.cfc:L64]: query-column access in CFML is
// CASE-INSENSITIVE - `rs.productTypeName`, `rs.PRODUCTTYPENAME` and
// `rs.producttypename` are one and the same read - so these readers FOLD CASE
// rather than demanding an exact key.
//
// JUDGMENT CALL: that parity argument is reinforced by a measured driver fact,
// which is why an exact-key lookup is not used. The result-set LABEL follows the
// query text while the field's ORIGINAL name follows the table definition, and the
// two differ whenever the two spellings differ - as they do here, since the ported
// statement carries `SELECT *` and the correlated aliases `isAssigned` and
// `childCount` exactly as the legacy spelled them. Column and alias casing is
// therefore never assumed. Adding `AS` aliases to pin the labels was rejected: it
// would edit the SELECT list that is the source of truth in order to solve a
// problem the CFML-faithful read already solves.
//
// JUDGMENT CALL: every case fold in this file uses `toLowerCase()` and never
// `toLocaleLowerCase()`. These are SQL identifiers and hexadecimal keys, not human
// text, and a locale-sensitive fold changes the result under a Turkish-dotless-I
// locale - `productTypeID`, `parentProductTypeID`, `productTypeIDPath` and
// `isAssigned` all carry a capital `I`. `src/lib/cfml/struct.ts` takes the same
// position for the same reason; it is not imported because the declared dependency
// boundary for this file does not include it, and because the concern here is
// driver result-set metadata rather than a CFML struct.

/** The outcome of looking for one column, keeping "absent" distinct from "null". */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Fold an identifier for comparison, once, in one place.
 *
 * CFML parity: the legacy engine compares strings with `eq` and `findNoCase`, both
 * of which ignore case, and MySQL's default collation is case-insensitive too - so
 * `WHERE productTypeID = ?` can legitimately answer with a row whose stored casing
 * differs from the argument. Identifier comparison in this file therefore routes
 * through this helper rather than through a bare `===` on raw driver output, which
 * is what keeps the in-memory ancestry linkage from missing a parent the database
 * considered matched.
 *
 * @param identifier a product-type identifier or a column name.
 * @returns the case-folded form, for use as a map key or a comparison operand only.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * Look for one column of a row, without assuming the driver's casing.
 *
 * @param row one result-set row, keyed by the label the driver reported.
 * @param columnName the column to look for, in any casing.
 * @returns the value when a column of that name is present - including when the
 *   cell is SQL NULL - and otherwise the absent outcome.
 */
function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  const foldedName = foldIdentifier(columnName);

  for (const [label, value] of Object.entries(row)) {
    if (foldIdentifier(label) === foldedName) {
      return { found: true, value };
    }
  }

  return { found: false };
}

/**
 * Read one column that the statement is required to have selected.
 *
 * The ABSENCE of a column and a NULL VALUE in it are different faults and are kept
 * apart deliberately: this raises for the first and hands back `null` for the
 * second, leaving the nullability decision to the typed reader that called it.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the raw driver value, which may be `null`.
 * @throws An error named `ProductTypeColumnError` when no column of that name is
 *   present.
 */
function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new ProductTypeColumnError(
      columnName,
      statementLabel,
      'the result set has no column of that name',
    );
  }

  return lookup.value;
}

/** Names the shape of a rejected column value without revealing the value itself. */
function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'SQL NULL';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  if (value instanceof Date) {
    return 'an invalid Date';
  }

  if (value instanceof Uint8Array) {
    return 'a byte buffer';
  }

  return `a ${typeof value}`;
}

/**
 * Read a column that holds an identifier: present, not null, and text.
 *
 * `productTypeID` is `length="32"` and `dataType="varchar"`
 * [model/entity/ProductType.cfc:L52], so a non-string here means the statement or
 * the schema moved and the read should say so rather than coerce.
 *
 * @param row one result-set row.
 * @param columnName the identifier column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the identifier exactly as stored, with its casing untouched.
 * @throws An error named `ProductTypeColumnError` when the column is absent, null
 *   or not text.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'string') {
    return value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `an identifier column must arrive as text and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable text column, mapping SQL NULL to absence.
 *
 * SQL NULL becomes `undefined` and NEVER the empty string. The distinction is
 * load-bearing rather than cosmetic: `unsavedvalue=""`
 * [model/entity/ProductType.cfc:L52] gives the empty string a specific meaning in
 * this entity - "not yet persisted" - and `getProductTypeIDPath()` rebuilds its
 * path only when the stored value is nullish, treating a stored empty string as a
 * value it must keep. Substituting `''` for NULL would therefore change entity
 * behaviour, not just its shape.
 *
 * CFML parity [model/entity/ProductType.cfc:L250-L255]: the legacy guard is
 * `isNull(variables.productTypeIDPath)`, and in CFML the empty string is NOT null
 * either - so an empty stored path does not trigger a rebuild there and does not
 * trigger one here.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductTypeColumnError` when the column is absent or is
 *   present with a non-text, non-null value.
 */
function readOptionalText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a text column must arrive as text and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a text column that `SELECT *` MAY NOT HAVE PRODUCED AT ALL.
 *
 * The difference between this and {@link readOptionalText} is which faults are
 * faults. That one requires the column to be in the result set and only tolerates a
 * NULL value; this one tolerates BOTH an absent column and a NULL value, mapping
 * either to absence.
 *
 * JUDGMENT CALL: the distinction exists because the two kinds of statement in this
 * file make different promises. The enumerated hydration reads NAME their columns, so
 * a column missing from one of those result sets means the statement and the schema
 * disagree and raising is the only honest answer. The tree read carries `SELECT *`
 * [model/dao/ProductTypeDAO.cfc:L54], so which columns it produces is decided by the
 * table rather than by the statement - which is exactly why the port declares
 * `productTypeName`, `productTypeIDPath` and `parentProductTypeID` OPTIONAL on its row
 * type and records that their presence depends on the columns the table actually has.
 * Raising for one of those would contradict the contract this adapter implements.
 *
 * A value of the wrong SHAPE is still a fault: a column that exists and holds
 * something that is not text is a mapping problem, not an absent column.
 *
 * @param row one row of a `SELECT *` result set.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the column is absent from the result set or
 *   holds SQL NULL.
 * @throws An error named `ProductTypeColumnError` when the column is present with a
 *   non-text, non-null value.
 */
function readProjectedText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const lookup = findColumn(row, columnName);

  if (!lookup.found || isNullish(lookup.value)) {
    return undefined;
  }

  if (typeof lookup.value === 'string') {
    return lookup.value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a text column must arrive as text and this one arrived as ${describeColumnType(lookup.value)}`,
  );
}

/**
 * Read a correlated `count(...)` column as a non-negative integer.
 *
 * MySQL types `count(...)` as `BIGINT`. The pool leaves `supportBigNumbers` unset,
 * so the driver hands back a JavaScript number; the `bigint` arm below exists so
 * that a widened pool configuration surfaces as a value this reader still
 * understands rather than as a silent `NaN` downstream. A magnitude beyond exact
 * integer representation is refused rather than rounded, because a rounded count is
 * a wrong count.
 *
 * @param row one result-set row.
 * @param columnName the count column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the count. `count(...)` yields `0` rather than NULL for an empty
 *   correlated set, so this never has to represent absence.
 * @throws An error named `ProductTypeColumnError` when the column is absent, null,
 *   non-numeric, fractional or too large to represent exactly.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }

    throw new ProductTypeColumnError(
      columnName,
      statementLabel,
      'a count arrived as a big integer outside the exactly representable range',
    );
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a count column must arrive as an integer and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `datetime` column.
 *
 * The pool leaves `dateStrings` unset and fixes its session timezone to UTC, so a
 * `datetime` arrives as a `Date` already interpreted in UTC. A string is therefore
 * REFUSED rather than parsed: a string here means the pool's date handling changed
 * underneath this adapter, and surfacing that is more useful than absorbing it with
 * a parse whose timezone assumption would be invisible. An out-of-range or
 * zero-date value that reaches JavaScript as an invalid `Date` is refused for the
 * matching reason - `connection.ts` refuses an invalid `Date` at the BINDING
 * boundary, so accepting one at the READING boundary would only defer the same
 * failure to a later, less attributable point.
 *
 * @param row one result-set row.
 * @param columnName the timestamp column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the instant, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductTypeColumnError` when the column is absent, is not
 *   a `Date`, or is an invalid `Date`.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a datetime column must arrive as a valid Date and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a boolean column WITHOUT deciding its truth.
 *
 * THE RAW VALUE IS CARRIED THROUGH, NARROWED ONLY TO THE INPUT TYPE THE ENTITY
 * ACCEPTS. `cfBoolean()` is deliberately NOT called here, and that is the single
 * most counter-intuitive line of this file, so it is justified in full.
 *
 * JUDGMENT CALL: `ProductType` stores `activeFlag` and `publishedFlag` as raw
 * `CfBooleanInput` and routes them through `cfBoolean()` INSIDE ITS GETTERS, which
 * makes the three states - true, false, and absent - all recoverable from the
 * stored value. Coercing here would collapse "absent" into `false` before the
 * entity ever sees it and would make that state unrecoverable, because
 * `activeFlag` [model/entity/ProductType.cfc:L54] and `publishedFlag`
 * [model/entity/ProductType.cfc:L55] declare NO `default` attribute at all: the
 * column can legitimately hold SQL NULL, and the entity is what decides what NULL
 * means. Coercion is therefore located exactly once, in the entity, and this
 * adapter's job ends at handing over a value that entity can accept.
 *
 * For the record of why coercion cannot be centralised in the adapter instead: the
 * boolean default literal is spelled THREE DIFFERENT WAYS across the in-scope
 * entities - `"1"` [model/entity/Sku.cfc:L53] and [model/entity/Promotion.cfc:L56],
 * `"0"` [model/entity/Sku.cfc:L59] and [model/entity/OptionGroup.cfc:L57], and the
 * STRING `"false"` [model/entity/Product.cfc:L58] and
 * [model/entity/PriceGroupRate.cfc:L53] - while most in-scope entities, THIS ONE
 * INCLUDED ON BOTH FLAGS, declare no boolean default whatsoever. `cfBoolean()` exists
 * precisely to absorb that spread, and it stays where the metadata that disambiguates
 * it lives.
 *
 * The `Uint8Array` arm is not defensive padding. `BIT(1)` is the natural physical
 * type for a CFML `boolean` ORM property and the driver surfaces it as a one-byte
 * buffer, which `cfBoolean()` would otherwise reject as an unrepresentable input.
 * Unwrapping the first byte here converts it into the numeric form the helper
 * already understands, and an empty buffer is treated as absence rather than as
 * false.
 *
 * @param row one result-set row.
 * @param columnName the boolean column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns a value the entity's own coercion accepts: `undefined` for SQL NULL, the
 *   unwrapped byte for a `BIT` buffer, or the driver's own string, number or
 *   boolean.
 * @throws An error named `ProductTypeColumnError` when the column is absent or
 *   holds a shape no CFML boolean conversion can accept.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value[0];

    return firstByte === undefined ? undefined : firstByte;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a boolean column must arrive as text, a number, a boolean or a BIT buffer and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Convert a value destined for a bound parameter into a shape the driver accepts.
 *
 * CFML parity: an ORM property that was never set persisted as SQL NULL, and
 * `<cfqueryparam null="...">` is how the tag-syntax DAOs spelled the same thing.
 * TypeScript spells absence `undefined`, but `connection.ts` deliberately EXCLUDES
 * `undefined` from its bound-parameter type - SQL NULL is `null` and nothing else -
 * so absence is translated here, once, at every binding site rather than being
 * spelled inconsistently across four statements.
 *
 * @param value a value read off the persistable record.
 * @returns the value unchanged, or `null` when it was absent.
 */
function toBindableValue(value: unknown): unknown {
  return isNullish(value) ? null : value;
}

// --- Statement labels --------------------------------------------------------
//
// One label per statement, carrying the legacy locator where a legacy statement
// exists, so a column fault names both the reader and the provenance of the
// statement it read from.

const TREE_STATEMENT_LABEL = 'the product-type tree read [model/dao/ProductTypeDAO.cfc:L52-L65]';

const BY_ID_STATEMENT_LABEL = 'the product-type read by identifier';

const BY_ID_PATH_STATEMENT_LABEL = 'the product-type read by materialized path';

const INSERT_STATEMENT_LABEL = 'the product-type insert';

const UPDATE_STATEMENT_LABEL = 'the product-type update';

// --- The persisted columns of SwProductType ----------------------------------
//
// The fourteen physical columns of `SwProductType`, taken from
// [model/entity/ProductType.cfc]: the eight scalars at L52-L59, the
// `parentProductTypeID` foreign key that `fkcolumn` declares on the many-to-one at
// L62, `remoteID` at L80, and the four audit columns at L83-L86. Nothing else is a
// column: `childProductTypes` (L65), `products` (L66) and `attributeValues` (L67)
// are collections, and the six many-to-many promotion and price-group associations
// (L69-L78) live in their own link tables.

/**
 * The insert column order.
 *
 * JUDGMENT CALL: the statement text and the bound parameter array are BOTH derived
 * from this one list, so their agreement is structural rather than maintained by
 * eye. Positional binding is unforgiving in exactly one way - a column list and a
 * value list that drift by one write every remaining value into the wrong column,
 * silently and successfully - and deriving both from a single ordered source makes
 * that class of fault unrepresentable. The emitted text is still completely fixed
 * and completely assertable; it is quoted in full on the constant below.
 */
const INSERTED_COLUMNS = [
  'productTypeID',
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
  'parentProductTypeID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The update column order - eleven columns, and three deliberate exclusions.
 *
 * `productTypeID` is excluded because it is the key the statement matches on rather
 * than a value it sets. `createdDateTime` and `createdByAccountID` are excluded
 * because `HibachiEntity.preUpdate` [org/Hibachi/HibachiEntity.cfc:L651-L679] stamps
 * only the modified pair, leaving the created pair untouched from the insert -
 * carrying them into the SET list would let a caller that hydrated an entity without
 * them overwrite real creation provenance with NULL.
 */
const UPDATED_COLUMNS = [
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
  'parentProductTypeID',
  'remoteID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

// --- The four statements -----------------------------------------------------

/**
 * The tree read, ported from [model/dao/ProductTypeDAO.cfc:L54-L62].
 *
 * The legacy statement, verbatim from the source, with only whitespace collapsed:
 *
 *     SELECT *,
 *       (SELECT count(SlatwallProduct.productID)
 *        FROM SlatwallProduct
 *        WHERE SlatwallProduct.productTypeID = SlatwallProductType.productTypeID) as isAssigned,
 *       (SELECT count(spt.productTypeID)
 *        FROM SlatwallProductType spt
 *        WHERE spt.parentProductTypeID = SlatwallProductType.productTypeID) as childCount
 *     FROM SlatwallProductType
 *     ORDER BY productTypeName ASC
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L62]: `ORDER BY productTypeName ASC` is
 * carried over VERBATIM. It is not widened, no secondary sort is added and no
 * tiebreaker is added, because the port publishes this ordering as part of its
 * contract and a tiebreaker would make two rows that the legacy left in
 * server-determined order deterministic - which is a behaviour change even when it
 * is a tidier one. This is the exact opposite of the reward read, where an ordering
 * must NOT be introduced; here one exists and must survive untouched.
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L54]: the projection stays `SELECT *`.
 * The legacy hands its consumer every persisted column and the port's row type
 * documents its three optional members as arriving from that `SELECT *`, so
 * enumerating a column list here would risk dropping a column a consumer reads -
 * and a dropped column is a parity break, not a tightening. The two hydration reads
 * below do enumerate, because their consumer is this file's own row-to-entity
 * factory and their shape is therefore knowable.
 *
 * JUDGMENT CALL: the two table names are CORRECTED to the physical `SwProductType`
 * and `SwProduct`, per the ruling recorded in this file's header. Everything else -
 * token order, keyword casing, the lower-case `as`, the subquery alias `spt` and
 * both column aliases - is the legacy text unchanged.
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L53-L54]: the legacy spelled these
 * tables `SlatwallProductType` and `SlatwallProduct`, which are ORM ENTITY names,
 * inside RAW SQL built by `new query()` and `setSQL()` - a mechanism that bypasses
 * Hibernate's name mapping entirely. The physical names are what the datasource
 * actually exposes.
 *
 * JUDGMENT CALL: indentation is normalised to spaces with no trailing whitespace.
 * The legacy text is indented with tabs inside a CFML string literal, and reproducing
 * that would put invisible, meaningless whitespace into a statement a suite asserts
 * on. No token, no keyword case and no clause order is altered.
 */
const SELECT_PRODUCT_TYPE_TREE_SQL = `SELECT *,
  (SELECT count(SwProduct.productID)
   FROM SwProduct
   WHERE SwProduct.productTypeID = SwProductType.productTypeID) as isAssigned,
  (SELECT count(spt.productTypeID)
   FROM SwProductType spt
   WHERE spt.parentProductTypeID = SwProductType.productTypeID) as childCount
FROM SwProductType
ORDER BY productTypeName ASC`;

/**
 * The enumerated hydration projection, shared by both entity reads.
 *
 * JUDGMENT CALL: these two statements ENUMERATE their columns where the ported tree
 * read keeps `SELECT *`, and the asymmetry is deliberate. These statements have no
 * legacy text to be faithful to - there is no `entityLoad` SQL to copy, because
 * Hibernate generated it - and their only consumer is the row-to-entity factory in
 * this file, whose reads are exactly these fourteen columns. Naming them puts the
 * fetch shape in the statement instead of leaving it implied, and it means a column
 * this adapter needs cannot silently go missing from a result set. Every enumerated
 * column IS consumed by the factory, so no column is dropped.
 */
const PRODUCT_TYPE_PROJECTION = `  SwProductType.productTypeID,
  SwProductType.productTypeIDPath,
  SwProductType.activeFlag,
  SwProductType.publishedFlag,
  SwProductType.urlTitle,
  SwProductType.productTypeName,
  SwProductType.productTypeDescription,
  SwProductType.systemCode,
  SwProductType.parentProductTypeID,
  SwProductType.remoteID,
  SwProductType.createdDateTime,
  SwProductType.createdByAccountID,
  SwProductType.modifiedDateTime,
  SwProductType.modifiedByAccountID`;

/**
 * Read one product-type row by identifier.
 *
 * One bound parameter, positional. No `LIMIT` is added: the identifier is the
 * primary key [model/entity/ProductType.cfc:L52], so the result set is at most one
 * row by construction, and a `LIMIT` the legacy never had would be an invented
 * clause that also masks a duplicate-key condition instead of surfacing it.
 */
const SELECT_PRODUCT_TYPE_BY_ID_SQL = `SELECT
${PRODUCT_TYPE_PROJECTION}
FROM SwProductType
WHERE SwProductType.productTypeID = ?`;

/**
 * Read every product type whose identifier appears in a materialized path.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the path-membership predicate
 * is the UNANCHORED SUBSTRING `LIKE` this repository uses everywhere. Its MySQL arm
 * is `concat('%', <idColumn>, '%')` with NO comma anchoring and NO `FIND_IN_SET`, and
 * the identical idiom appears again at [model/dao/PhysicalDAO.cfc:L121], which makes
 * it a house pattern rather than an isolated slip. It is reproduced exactly.
 * `FIND_IN_SET` would be the delimiter-correct predicate and it is NOT used, because
 * it matches a strictly smaller set: the legacy also matches an identifier that
 * merely occurs inside another identifier, and narrowing that would silently drop
 * rows the legacy returned.
 *
 * CFML parity: the fragment is built by `materializedIdPathLikePatternFragment` in
 * `./dialect.js` rather than inlined, so the emitted `concat(...)` is provably the
 * MySQL arm of the dialect-branching site the legacy carried, and the column
 * reference is validated as an identifier reference at module load.
 *
 * JUDGMENT CALL: the bound path is the LIKE SUBJECT and the column is inside the
 * PATTERN, which is the same operand arrangement as the legacy - there the stored
 * path column was the subject and the joined identifier column formed the pattern.
 * Because the caller's path is the subject rather than the pattern, a `%` or `_`
 * inside it is matched literally and cannot act as a wildcard. No `ESCAPE` clause is
 * added: the legacy has none, and adding one would change what the pattern means.
 *
 * No `ORDER BY` is added. The legacy path-membership sites impose none, and
 * inventing one here would fabricate an ordering contract the callers never had.
 */
const SELECT_PRODUCT_TYPES_BY_ID_PATH_SQL = `SELECT
${PRODUCT_TYPE_PROJECTION}
FROM SwProductType
WHERE ? LIKE ${materializedIdPathLikePatternFragment(STATEMENT_DIALECT, 'SwProductType.productTypeID')}`;

/**
 * Insert one product-type row.
 *
 * The emitted text, fixed and fully determined by `INSERTED_COLUMNS`:
 *
 *     INSERT INTO SwProductType (
 *       productTypeID,
 *       productTypeIDPath,
 *       activeFlag,
 *       publishedFlag,
 *       urlTitle,
 *       productTypeName,
 *       productTypeDescription,
 *       systemCode,
 *       parentProductTypeID,
 *       remoteID,
 *       createdDateTime,
 *       createdByAccountID,
 *       modifiedDateTime,
 *       modifiedByAccountID
 *     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 *
 * The placeholder list comes from `sqlPlaceholderList` in `./connection.js`, which
 * exists so that a placeholder count and a parameter count cannot drift apart at a
 * hand-written join. Every value is positional and nothing is interpolated: the only
 * interpolations in this constant are a column list and a placeholder run, both
 * derived from module constants, neither reachable from a caller.
 */
const INSERT_PRODUCT_TYPE_SQL = `INSERT INTO SwProductType (
  ${INSERTED_COLUMNS.join(',\n  ')}
) VALUES (${sqlPlaceholderList(INSERTED_COLUMNS.length)})`;

/**
 * Update one product-type row, matched on its primary key.
 *
 * The emitted text, fixed and fully determined by `UPDATED_COLUMNS`:
 *
 *     UPDATE SwProductType
 *     SET
 *       productTypeIDPath = ?,
 *       activeFlag = ?,
 *       publishedFlag = ?,
 *       urlTitle = ?,
 *       productTypeName = ?,
 *       productTypeDescription = ?,
 *       systemCode = ?,
 *       parentProductTypeID = ?,
 *       remoteID = ?,
 *       modifiedDateTime = ?,
 *       modifiedByAccountID = ?
 *     WHERE SwProductType.productTypeID = ?
 *
 * The key parameter is bound LAST, after the eleven SET parameters, which is the
 * order the parameter array is assembled in.
 */
const UPDATE_PRODUCT_TYPE_SQL = `UPDATE SwProductType
SET
  ${UPDATED_COLUMNS.map((columnName) => `${columnName} = ?`).join(',\n  ')}
WHERE SwProductType.productTypeID = ?`;

// --- Hydration ---------------------------------------------------------------

/**
 * Everything one read needs in order to turn its rows into linked entities.
 *
 * REQUEST-SCOPED BY CONSTRUCTION. The scope is created inside the method that
 * needs it and is unreachable once that method returns, so nothing here survives
 * between two calls. That is deliberate and it is the rule the whole target
 * follows: a module-scope mutable cache would persist across unrelated invocations
 * of a warm container and would let one caller observe another caller's rows. The
 * connection pool in `./connection.js` is the only sanctioned module-scope state in
 * this layer, and it holds no row data.
 *
 * The maps are keyed by CASE-FOLDED identifier for the reason `foldIdentifier`
 * records: MySQL's default collation matched the rows case-insensitively, so an
 * exact-key map can miss a parent the database considered found.
 */
interface HydrationScope {
  /** Every row available to this hydration, by folded identifier. */
  readonly rowsByFoldedID: ReadonlyMap<string, SqlRow>;

  /** Entities already built, so one row yields exactly one instance. */
  readonly hydratedByFoldedID: Map<string, ProductType>;

  /** Identifiers whose ancestry is currently being resolved, to break a cycle. */
  readonly linkageInProgress: Set<string>;

  /** Injected into every entity so `getBaseProductType()` can reach the database. */
  readonly productTypeRepository: ProductTypeRepository;

  /** Which statement produced these rows, for column-fault attribution. */
  readonly statementLabel: string;
}

/**
 * THE row-to-entity factory. The only place in this module that constructs a
 * `ProductType`.
 *
 * Construction, port injection and association materialization happen here and
 * nowhere else, so there is exactly one answer to "what shape does a hydrated
 * product type have". Every read path in this file funnels through it, including
 * the insert path, which materializes the record it is about to write and hydrates
 * the returned entity from that record - one factory, one shape, no second
 * constructor call site to keep in step.
 *
 * FETCH SHAPE - the fourteen scalar columns, plus the parent the caller supplies,
 * and NOTHING ELSE. Each exclusion is a decision, not an omission:
 *
 *   `products` [model/entity/ProductType.cfc:L66] is `lazy="extra"` - the laziest
 *     setting the ORM offers, chosen by the source author precisely so that the
 *     collection is not brought into memory - and it is NEVER materialized here.
 *     Nothing in the ported surface reads it: the correlated `isAssigned` count of
 *     the tree read answers the only question the legacy asked of it, in SQL,
 *     without loading a single product row. Honouring `lazy="extra"` by not
 *     materializing it is the faithful reading of that declaration.
 *
 *   `childProductTypes` [model/entity/ProductType.cfc:L65] is not materialized. A
 *     census of the in-scope tree found NO reader of `getChildProductTypes()`
 *     outside `ProductType.cfc`'s own bidirectional helpers (L152, L159, L161), and
 *     the tree read answers the descendant question with its correlated
 *     `childCount` column instead. The collection stays the empty array the entity
 *     constructs by default.
 *
 *   The six many-to-many promotion and price-group associations
 *     [model/entity/ProductType.cfc:L69-L78] are not materialized. They are read
 *     from the promotion and price-group side - the reward and rate rows carry the
 *     product-type identifiers, and those repositories own those link tables - so
 *     materializing them from here would duplicate ownership of the same link rows
 *     in two adapters.
 *
 *   `attributeValues` [model/entity/ProductType.cfc:L67] declares
 *     `cascade="all-delete-orphan"`, and this adapter states its position on that
 *     obligation explicitly rather than leaving it to inference: THE ATTRIBUTE
 *     SUBSYSTEM IS OUTSIDE THE PORTED SURFACE. `ProductType` carries no
 *     `attributeValues` member, no attribute-value entity is in scope, no
 *     `SwAttributeValue` statement appears in this file, and consequently NO
 *     ORPHAN REMOVAL IS REPRODUCED - on save or otherwise. The consequence is
 *     stated plainly: a caller that saves a product type through this adapter does
 *     not affect that product type's attribute-value rows, where the legacy ORM
 *     would have deleted a value orphaned by the save. This is a scope boundary
 *     being honoured, not a defect being preserved; the port declares no delete
 *     method at all, so the cascade's most consequential trigger is not reachable
 *     through this surface either.
 *
 * The parent arrives as an argument rather than being fetched here, because the
 * depth of the ancestry a read materializes is that READ's decision - see each
 * method - and the factory must not quietly issue a query of its own.
 *
 * @param row one result-set row carrying the fourteen enumerated columns.
 * @param parentProductType the already-hydrated parent, or `undefined` for a root
 *   row or for a read that deliberately stops short of the parent.
 * @param scope the hydration scope, supplying the injected port and the label.
 * @returns the hydrated product type.
 * @throws An error named `ProductTypeColumnError` when a column is absent from the
 *   row or arrives in a shape that column cannot take.
 */
function toProductType(
  row: SqlRow,
  parentProductType: ProductType | undefined,
  scope: HydrationScope,
): ProductType {
  const label = scope.statementLabel;

  return new ProductType({
    productTypeID: readIdentifier(row, 'productTypeID', label),
    productTypeIDPath: readOptionalText(row, 'productTypeIDPath', label),
    activeFlag: readFlag(row, 'activeFlag', label),
    publishedFlag: readFlag(row, 'publishedFlag', label),
    urlTitle: readOptionalText(row, 'urlTitle', label),
    productTypeName: readOptionalText(row, 'productTypeName', label),
    productTypeDescription: readOptionalText(row, 'productTypeDescription', label),
    systemCode: readOptionalText(row, 'systemCode', label),
    parentProductType,
    remoteID: readOptionalText(row, 'remoteID', label),
    createdDateTime: readTimestamp(row, 'createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', label),
    productTypeRepository: scope.productTypeRepository,
  });
}

/**
 * Hydrate one row and, where the scope holds them, its ancestors - linking each
 * child to its parent instance.
 *
 * The linkage is IN MEMORY over rows the scope already holds. This function issues
 * no query and reaches no executor: a read decides which rows it wants, puts them
 * in the scope, and then asks for the linked graph. That is what makes the fetch
 * shape a property of each method rather than something a graph walk can extend
 * behind the caller's back.
 *
 * JUDGMENT CALL: the linkage is one-directional - a child points at its parent, and
 * the parent's `childProductTypes` collection is deliberately LEFT EMPTY even when
 * the scope happens to hold both rows. Populating it would present a collection
 * containing only the children this particular read happened to select as though it
 * were the complete set, and a caller cannot tell a partially populated collection
 * from a complete one. An empty collection is at least unambiguous, and the census
 * recorded on the factory found no in-scope reader of it.
 *
 * A CYCLE TERMINATES THE WALK rather than the process. `parentProductTypeID` is an
 * ordinary self-referencing foreign key with nothing in the schema forbidding a
 * cycle, and `getProductTypeIDPath()` on a cyclic chain would not terminate either -
 * so the in-progress set stops the descent at the point where it closes and the
 * deepest node in the cycle is hydrated with no parent. That is a read that returns
 * rather than a read that hangs, and it is the same defensive shape the value
 * object's own walk takes.
 *
 * @param foldedProductTypeID the case-folded identifier of the row to hydrate.
 * @param scope the hydration scope; its `hydratedByFoldedID` and
 *   `linkageInProgress` members are mutated as the walk proceeds.
 * @returns the hydrated entity, or `undefined` when the scope holds no row of that
 *   identifier or when the ancestry closed into a cycle at this node.
 * @throws An error named `ProductTypeColumnError` when a row is missing a column.
 */
function hydrateWithAncestry(
  foldedProductTypeID: string,
  scope: HydrationScope,
): ProductType | undefined {
  const alreadyHydrated = scope.hydratedByFoldedID.get(foldedProductTypeID);

  if (alreadyHydrated !== undefined) {
    return alreadyHydrated;
  }

  const row = scope.rowsByFoldedID.get(foldedProductTypeID);

  if (row === undefined) {
    return undefined;
  }

  if (scope.linkageInProgress.has(foldedProductTypeID)) {
    return undefined;
  }

  scope.linkageInProgress.add(foldedProductTypeID);

  const parentProductTypeID = readOptionalText(row, 'parentProductTypeID', scope.statementLabel);
  const parentProductType =
    parentProductTypeID === undefined
      ? undefined
      : hydrateWithAncestry(foldIdentifier(parentProductTypeID), scope);

  scope.linkageInProgress.delete(foldedProductTypeID);

  const productType = toProductType(row, parentProductType, scope);
  scope.hydratedByFoldedID.set(foldedProductTypeID, productType);

  return productType;
}

/**
 * Build a hydration scope over a set of rows, keyed by folded identifier.
 *
 * A duplicate identifier keeps the LAST row, which cannot arise from either read
 * that uses this - one matches a primary key and the other selects each row once -
 * and needs no rule of its own beyond being deterministic.
 *
 * @param rows the rows this hydration may draw on.
 * @param productTypeRepository the port injected into every hydrated entity.
 * @param statementLabel which statement produced the rows.
 * @returns a fresh, request-scoped hydration scope.
 * @throws An error named `ProductTypeColumnError` when a row has no identifier
 *   column.
 */
function createHydrationScope(
  rows: readonly SqlRow[],
  productTypeRepository: ProductTypeRepository,
  statementLabel: string,
): HydrationScope {
  const rowsByFoldedID = new Map<string, SqlRow>();

  for (const row of rows) {
    rowsByFoldedID.set(foldIdentifier(readIdentifier(row, 'productTypeID', statementLabel)), row);
  }

  return {
    rowsByFoldedID,
    hydratedByFoldedID: new Map<string, ProductType>(),
    linkageInProgress: new Set<string>(),
    productTypeRepository,
    statementLabel,
  };
}

/**
 * Project one tree row onto the port's row type.
 *
 * The three optional members are spread CONDITIONALLY. `exactOptionalPropertyTypes`
 * types them as "absent or a string" rather than "possibly undefined", so assigning
 * `undefined` to one is rejected outright - and the distinction is the right one to
 * keep: a product type with no name and a result set with a NULL name column are the
 * same fact, and "the member is not there" says it without inventing an empty
 * string.
 *
 * Those three go through {@link readProjectedText} rather than
 * {@link readOptionalText}, because `SELECT *` decides for itself which columns it
 * produces - see the judgment call recorded on that reader. The three REQUIRED
 * members do not: `productTypeID` is the primary key, and `isAssigned` and
 * `childCount` are named explicitly in the statement's own SELECT list rather than
 * arriving from the `*`, so a result set without one of them cannot satisfy the row
 * type at all and raising is the only honest answer.
 *
 * @param row one row of the tree read.
 * @returns the row projected onto `ProductTypeTreeRow`.
 * @throws An error named `ProductTypeColumnError` when a required column is absent, or
 *   when any column arrives in a shape it cannot take.
 */
function toProductTypeTreeRow(row: SqlRow): ProductTypeTreeRow {
  const productTypeName = readProjectedText(row, 'productTypeName', TREE_STATEMENT_LABEL);
  const productTypeIDPath = readProjectedText(row, 'productTypeIDPath', TREE_STATEMENT_LABEL);
  const parentProductTypeID = readProjectedText(row, 'parentProductTypeID', TREE_STATEMENT_LABEL);

  return {
    productTypeID: readIdentifier(row, 'productTypeID', TREE_STATEMENT_LABEL),
    isAssigned: readCount(row, 'isAssigned', TREE_STATEMENT_LABEL),
    childCount: readCount(row, 'childCount', TREE_STATEMENT_LABEL),
    ...(productTypeName === undefined ? {} : { productTypeName }),
    ...(productTypeIDPath === undefined ? {} : { productTypeIDPath }),
    ...(parentProductTypeID === undefined ? {} : { parentProductTypeID }),
  };
}

// --- Preparing a row for writing ---------------------------------------------

/**
 * Mint the identifier for a product type that has never been persisted.
 *
 * CFML parity [model/entity/ProductType.cfc:L52]: the column is
 * `fieldtype="id" generator="uuid" length="32"`, so the identifier came from
 * HIBERNATE'S `uuid` generator and not from CFML's `createUUID()`. The two differ in
 * shape, and the difference matters: the ORM generator produces 32 hexadecimal
 * characters with no separators, which is exactly what `length="32"` accommodates,
 * whereas `createUUID()` produces the 35-character 8-4-4-16 form that would not fit
 * the column at all.
 *
 * JUDGMENT CALL: `randomUUID()` from `node:crypto` supplies the randomness and its
 * hyphens are removed to reach the 32-character form. The precedent in this subtree
 * is `src/domain/entities/promotionCode.ts`, which reaches for the same primitive
 * and reshapes it to the form its own legacy site produced - there the `createUUID()`
 * shape, here the ORM generator's. No identifier library is added for one call, and
 * `Math.random` is not used to mint a primary key.
 *
 * @returns a fresh 32-character lower-case hexadecimal identifier.
 */
function generateProductTypeID(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Resolve the foreign key to write for the parent association.
 *
 * @param productType the product type being saved.
 * @returns the parent's identifier, or `undefined` when the product type is a root.
 * @throws An error named `ProductTypePersistenceError` when a parent is present but
 *   has never been persisted, matching the ORM's refusal to write a key for a
 *   transient association.
 */
function resolveParentProductTypeID(productType: ProductType): string | undefined {
  const parentProductType = productType.getParentProductType();

  if (parentProductType === undefined) {
    return undefined;
  }

  if (parentProductType.isNew()) {
    throw new ProductTypePersistenceError(
      'its parent product type has never been persisted, so there is no key to reference',
    );
  }

  return parentProductType.getProductTypeID();
}

/**
 * Assemble every value a write might bind, keyed by column name.
 *
 * The statements draw their parameters from this record through the ordered column
 * constants, so a column named by a statement and absent from here raises instead of
 * binding the wrong value one position over.
 *
 * THE TWO BOOLEANS ARE WRITTEN AS THE ENTITY REPORTS THEM, which means as `true` or
 * `false` and never as SQL NULL. `ProductType` publishes only the coerced view of
 * `activeFlag` [model/entity/ProductType.cfc:L54] and `publishedFlag`
 * [model/entity/ProductType.cfc:L55] - deliberately, so that coercion lives in one
 * place - and a repository cannot write a state its entity does not expose. The
 * consequence is stated rather than hidden: a row whose flag column held SQL NULL
 * and is then saved back has that column written as `0`. It is unobservable through
 * the ported surface, because `cfBoolean()` maps NULL and `0` to the same `false`, so
 * every subsequent read of that row through this entity answers exactly as it did
 * before; and neither column declares a `default`, so NULL was never a stated state
 * to begin with. Recorded so that a reviewer meets the decision here rather than
 * discovering it in a diff of stored data.
 *
 * @param productType the product type being saved.
 * @param productTypeID the identifier to write - the entity's own for an update, or
 *   the freshly minted one for a first insert.
 * @param productTypeIDPath the maintained materialized path to write.
 * @param createdDateTime the creation stamp; consumed by the insert only.
 * @param modifiedDateTime the modification stamp.
 * @returns the record every write binds from.
 * @throws An error named `ProductTypePersistenceError` when the parent is transient.
 */
function toPersistableRecord(
  productType: ProductType,
  productTypeID: string,
  productTypeIDPath: string,
  createdDateTime: Date | undefined,
  modifiedDateTime: Date,
): SqlRow {
  return {
    productTypeID,
    productTypeIDPath,
    activeFlag: productType.getActiveFlag(),
    publishedFlag: productType.getPublishedFlag(),
    urlTitle: productType.getUrlTitle(),
    productTypeName: productType.getProductTypeName(),
    productTypeDescription: productType.getProductTypeDescription(),
    systemCode: productType.getSystemCode(),
    parentProductTypeID: resolveParentProductTypeID(productType),
    remoteID: productType.getRemoteID(),
    createdDateTime,
    createdByAccountID: productType.getCreatedByAccountID(),
    modifiedDateTime,
    modifiedByAccountID: productType.getModifiedByAccountID(),
  };
}

/**
 * Bind a statement's parameters from the persistable record, in the statement's own
 * column order.
 *
 * @param record the persistable record.
 * @param columnOrder the ordered column list the statement text was built from.
 * @param statementLabel which statement is being bound.
 * @returns the positional parameter array, with absence spelled `null`.
 * @throws An error named `ProductTypeColumnError` when the record is missing a
 *   column the statement names.
 */
function toBoundParameters(
  record: SqlRow,
  columnOrder: readonly string[],
  statementLabel: string,
): readonly unknown[] {
  return columnOrder.map((columnName) =>
    toBindableValue(requireColumn(record, columnName, statementLabel)),
  );
}

/**
 * Compute the materialized path for a product type whose identifier has just been
 * minted.
 *
 * CFML parity [model/entity/ProductType.cfc:L306] and
 * [org/Hibachi/HibachiEntity.cfc:L308-L324]: the legacy path is the ancestry from the
 * ROOT DOWN TO AND INCLUDING the entity itself, built by climbing the parent chain
 * and prepending each identifier. `buildIdPathList` in
 * `src/domain/valueObjects/materializedIdPath.ts` is that algorithm, and it is what
 * computes the ancestor segment here - the path arithmetic is NOT reimplemented in
 * this adapter, which is the whole reason the value object exists.
 *
 * JUDGMENT CALL: this is the ONE route where the repository composes the path itself
 * instead of calling the entity's hook, and the reason is ordering, not preference.
 * `preInsert()` builds the path from the entity, so it can only produce a correct
 * path once the entity carries its identifier - and a first insert mints that
 * identifier here, after the entity was constructed. Hibernate had the same ordering
 * constraint and resolved it the same way: the `uuid` generator assigned the
 * identifier BEFORE `preInsert` fired. So the ancestor segment comes from the value
 * object and the freshly minted identifier is appended to it with `listAppend` from
 * `src/lib/cfml/list.ts`, which yields the identifier alone for a root - exactly
 * what a one-element legacy path is. Every OTHER save route calls the entity's own
 * hook, because there the entity already carries its identifier and the hook is
 * authoritative.
 *
 * @param productType the product type being inserted, carrying its parent link.
 * @param generatedProductTypeID the freshly minted identifier.
 * @returns the comma-delimited path, root first, ending in the new identifier.
 */
function buildIdPathForGeneratedIdentifier(
  productType: ProductType,
  generatedProductTypeID: string,
): string {
  const parentProductType = productType.getParentProductType();

  const ancestorIdPath =
    parentProductType === undefined
      ? ''
      : buildIdPathList<ProductType>(
          parentProductType,
          (node) => node.getProductTypeID(),
          (node) => node.getParentProductType(),
        );

  return listAppend(ancestorIdPath, generatedProductTypeID);
}

// --- The adapter -------------------------------------------------------------

/**
 * The MySQL implementation of {@link ProductTypeRepository}.
 *
 * Four public methods, matching the port exactly. The private members below are
 * statement plumbing, not surface: nothing outside this class can reach them, and no
 * fifth capability is published.
 *
 * Every method is `async` because every method reaches the database. That is the
 * async boundary rule the target applies throughout - a method becomes asynchronous
 * if and only if its legacy body reached the DAO or the ORM, and stays synchronous
 * when it only traverses already-materialized associations or performs pure
 * arithmetic. `Sku.getPriceByCurrencyCode()` is the canonical example of the other
 * side of that line, and it stays synchronous precisely because its data is
 * materialized before it is asked.
 */
export class MysqlProductTypeRepository implements ProductTypeRepository {
  /**
   * The prepared-statement executor, INJECTED.
   *
   * JUDGMENT CALL: the executor arrives as a constructor argument and the pool is
   * never imported as a module singleton. Three consequences follow, and all three
   * are wanted. The class holds no ambient dependency, so what it talks to is
   * visible at its construction site in the composition root -
   * `src/handlers/bootstrap.ts` (planned) - rather than resolved behind its back.
   * It reads no environment variable and holds no credential, so configuration stays
   * the composition root's business. And statement-shape assertions become possible
   * WITHOUT A DATABASE: a suite implements the two-method interface, records each
   * `sql` string and each `params` array, and returns canned rows. That last point is
   * not a convenience - `tests/setup.ts` states that suites must not depend on a
   * `.env` file existing or on any `DB_*` value being set, so an adapter that
   * reached for a pool of its own could not be asserted on at all.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * @param executor the narrow prepared-statement executor from `./connection.js`.
   */
  constructor(executor: PreparedStatementExecutor) {
    this.executor = executor;
  }

  /**
   * The full product-type listing with per-row product and child counts.
   *
   * `//@hint for caching product types as a tree-sorted query`
   * - [model/dao/ProductTypeDAO.cfc:L51], carried forward verbatim.
   *
   * `// return query sorted Product Type tree `
   * - [model/dao/ProductTypeDAO.cfc:L63], carried forward verbatim, trailing space
   * and all.
   *
   * LEGACY-NOTE [model/dao/ProductTypeDAO.cfc:L51-L63]: both of those comments call
   * this a TREE-SORTED query, and it is not one - the statement orders by
   * `productTypeName ASC` [model/dao/ProductTypeDAO.cfc:L62], so rows arrive in name
   * order and a caller that wants tree order has to rebuild it from
   * `productTypeIDPath`, which is why that column is on the row type. The comments are
   * reproduced as written rather than corrected: they are the legacy author's
   * statement of intent, and rewriting them would erase the mismatch instead of
   * recording it. The ordering itself is untouched.
   *
   * The name is the legacy name, verbatim in CFML camelCase, and takes no argument -
   * `getProductTypeQuery()` [model/dao/ProductTypeDAO.cfc:L52] declares none, so none
   * is invented. No value is bound, because the statement has no parameter: it is a
   * whole-table read.
   *
   * ROWS, NOT ENTITIES. The legacy returns `qs.execute().getResult()`
   * [model/dao/ProductTypeDAO.cfc:L64] - a CFML query object its consumer reads
   * column-wise, including the two correlated counts that exist only in that result
   * set and on no entity - and the port publishes the row type accordingly.
   * Hydrating entities here would discard `isAssigned` and `childCount` or force them
   * onto an entity that has no such properties.
   *
   * FETCH SHAPE: no association is materialized at all, at any depth. Nothing needs
   * to be: `isAssigned` and `childCount` answer the "has products" and "has children"
   * questions IN SQL, as correlated counts, which is what lets a full listing carry
   * per-row relationship facts without touching `SwProduct` rows or child rows.
   * `ProductTypeDAO.cfc` declares no fetch directive of any kind - the five true
   * `JOIN FETCH` clauses of the in-scope DAO layer are all elsewhere - so this is a
   * NEW EXPLICIT DECISION rather than a carried-over fetch plan, and it is a
   * fidelity decision: the legacy result set contains exactly these columns and no
   * associated object.
   *
   * NET-NEW COVERAGE. No legacy test covers this method. The obligations for the
   * suite that will: the emitted text contains `ORDER BY productTypeName ASC`
   * verbatim, names `SwProductType` and `SwProduct` and neither `Slatwall*` spelling,
   * carries both correlated subqueries with the aliases `isAssigned` and `childCount`,
   * and binds ZERO parameters; a row whose optional columns are SQL NULL yields a row
   * object on which those members are ABSENT rather than `undefined`; a result set
   * that does not carry one of those three columns AT ALL is treated identically,
   * because `SELECT *` decides which columns exist; a result set missing `childCount`
   * raises, because the statement names that alias itself; and column labels in any
   * casing are read correctly.
   *
   * @returns every product type, ordered by name, as rows.
   * @throws An error named `ProductTypeColumnError` when the result set is missing a
   *   column this read projects.
   */
  async getProductTypeQuery(): Promise<readonly ProductTypeTreeRow[]> {
    const rows = await this.executor.execute(SELECT_PRODUCT_TYPE_TREE_SQL);

    return rows.map(toProductTypeTreeRow);
  }

  /**
   * Load one product type by identifier, with its parent chain.
   *
   * `undefined` for a miss, and never a zero-valued stand-in. `entityLoad` returned
   * nothing at all for an identifier that matched no row, and a caller that has to
   * distinguish "no such product type" from "a product type with no name" can only do
   * so if absence stays absence.
   *
   * FETCH SHAPE - THE PARENT CHAIN, HOP BY HOP, TO THE ROOT. This is the one
   * association this read materializes, and it is materialized because three ported
   * consumers walk it and none of them can work without it: the price-group cascade
   * climbs `getParentProductType()` in a loop [model/service/PriceGroupService.cfc:L76],
   * `getSimpleRepresentation()` recurses into the parent to build its ` &raquo; `
   * joined label, and the path builder that maintains `productTypeIDPath` climbs the
   * same chain [model/entity/ProductType.cfc:L306]. Fetching to the root - rather than
   * one level, or to some fixed depth - is what makes all three total: a partial chain
   * would silently produce a truncated path and a truncated label.
   *
   * ONE STATEMENT PER HOP, deliberately. It reproduces exactly what Hibernate did
   * when `getParentProductType()` was dereferenced on a lazy proxy, and each hop's
   * statement is the same prepared statement with a different bound key. A recursive
   * common table expression would collapse the chain into one round trip and is NOT
   * used, for a fidelity reason rather than any other: it would add a construct with
   * no counterpart anywhere in the in-scope DAO layer, and the chain a hop-by-hop walk
   * produces is identical.
   *
   * The walk terminates on all three ways a chain can end: a root row, whose
   * `parentProductTypeID` is NULL; a DANGLING key, where the parent row does not exist
   * and the chain simply stops rather than raising, because the legacy would have
   * surfaced no parent there either; and a CYCLE, which the visited set closes. Two
   * guards exist here for two different jobs - the visited set stops the QUERY loop
   * from re-reading a row it has already read, and the hydration scope's in-progress
   * set stops the LINKAGE recursion from descending into the same node twice.
   *
   * Nothing else is materialized. `products` stays untouched, honouring `lazy="extra"`
   * [model/entity/ProductType.cfc:L66]; `childProductTypes`, the six many-to-many
   * associations and `attributeValues` stay as the row-to-entity factory records.
   *
   * NET-NEW COVERAGE. The obligations for the suite: exactly one parameter is bound
   * per hop and it is the identifier; a root row issues exactly one statement; an
   * n-deep chain issues n statements and the returned entity's `getParentProductType()`
   * chain reaches the root; a dangling parent key returns an entity whose parent is
   * `undefined`; a cyclic chain RETURNS rather than hanging; a miss returns
   * `undefined`; and a row whose `activeFlag` is SQL NULL hydrates to an entity whose
   * `getActiveFlag()` is `false` by the entity's own coercion, not by this adapter's.
   *
   * @param productTypeID the identifier to load.
   * @returns the hydrated product type with its ancestry, or `undefined` when no row
   *   matches.
   * @throws An error named `ProductTypeColumnError` when a row is missing a column
   *   this read projects.
   */
  async getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined> {
    const targetRow = await this.readProductTypeRow(productTypeID);

    if (targetRow === undefined) {
      return undefined;
    }

    const targetFoldedID = foldIdentifier(
      readIdentifier(targetRow, 'productTypeID', BY_ID_STATEMENT_LABEL),
    );

    const ancestryRows: SqlRow[] = [targetRow];
    const visitedFoldedIDs = new Set<string>([targetFoldedID]);

    let descendantRow: SqlRow = targetRow;
    let hasUnvisitedAncestor = true;

    while (hasUnvisitedAncestor) {
      const parentProductTypeID = readOptionalText(
        descendantRow,
        'parentProductTypeID',
        BY_ID_STATEMENT_LABEL,
      );

      const parentRow =
        parentProductTypeID === undefined ||
        visitedFoldedIDs.has(foldIdentifier(parentProductTypeID))
          ? undefined
          : await this.readProductTypeRow(parentProductTypeID);

      if (parentRow === undefined) {
        hasUnvisitedAncestor = false;
      } else {
        ancestryRows.push(parentRow);
        visitedFoldedIDs.add(
          foldIdentifier(readIdentifier(parentRow, 'productTypeID', BY_ID_STATEMENT_LABEL)),
        );
        descendantRow = parentRow;
      }
    }

    return hydrateWithAncestry(
      targetFoldedID,
      createHydrationScope(ancestryRows, this, BY_ID_STATEMENT_LABEL),
    );
  }

  /**
   * Load every product type whose identifier occurs in a materialized path.
   *
   * A PATH OF ZERO ELEMENTS SHORT-CIRCUITS with the empty array and issues no
   * statement. `listLen` from `src/lib/cfml/list.ts` decides that, not a comparison
   * against the empty string, and the difference is CFML list semantics rather than
   * style: `''` and `','` and `',,'` are all lists of zero elements in CFML, so all
   * three name nothing and all three answer with nothing. The statement agrees - a
   * verified probe against MySQL 8.0.46 returned zero rows for an empty subject - so
   * this is a fidelity decision about what "a list of no identifiers" means, and it
   * makes no claim of any other kind.
   *
   * ONE STATEMENT FOR THE WHOLE PATH. The predicate is the unanchored substring
   * `LIKE` recorded on the statement constant, with the path bound as a single
   * positional parameter, so no comma-list is tokenized into an `IN` list and the
   * empty-`IN` hazard cannot arise here at all.
   *
   * FETCH SHAPE - the rows the path matched, LINKED TO EACH OTHER IN MEMORY, with no
   * additional statement. A path is an ancestry, so the parent of every matched
   * non-root row is normally in the same result set, and linking them there gives the
   * caller the chain without a second round trip. A row whose parent was NOT matched -
   * which happens when a caller passes a path fragment rather than a whole path - is
   * hydrated with `undefined` for its parent rather than having its parent fetched:
   * this read materializes what the path named and does not extend beyond it. As on
   * every read here, `products` is untouched per `lazy="extra"`
   * [model/entity/ProductType.cfc:L66], and the child collection is left empty rather
   * than partially populated.
   *
   * NET-NEW COVERAGE. The obligations for the suite: exactly one parameter is bound
   * and it is the whole path; the emitted predicate is `? LIKE concat('%',
   * SwProductType.productTypeID, '%')` with no comma anchoring, no `FIND_IN_SET` and
   * no `ESCAPE`; `''`, `','` and `',,'` each return an empty array with NO statement
   * executed; a two-element path returns both rows with the child's parent linked; and
   * the emitted text carries no `ORDER BY`.
   *
   * @param productTypeIDPath comma-delimited product type identifiers, root first.
   * @returns the product types the path names; an identifier with no row is simply
   *   not returned.
   * @throws An error named `ProductTypeColumnError` when a row is missing a column
   *   this read projects.
   */
  async getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]> {
    if (listLen(productTypeIDPath) === 0) {
      return [];
    }

    const rows = await this.executor.execute(SELECT_PRODUCT_TYPES_BY_ID_PATH_SQL, [
      productTypeIDPath,
    ]);

    const scope = createHydrationScope(rows, this, BY_ID_PATH_STATEMENT_LABEL);
    const productTypes: ProductType[] = [];

    for (const row of rows) {
      const productType = hydrateWithAncestry(
        foldIdentifier(readIdentifier(row, 'productTypeID', BY_ID_PATH_STATEMENT_LABEL)),
        scope,
      );

      if (productType !== undefined) {
        productTypes.push(productType);
      }
    }

    return productTypes;
  }

  /**
   * Persist one product type, inserting or updating as its stored state requires.
   *
   * THIS METHOD OWNS THE WORK TWO ORM LIFECYCLE HOOKS USED TO DO, and that is its
   * most consequential responsibility.
   *
   * CFML parity [model/entity/ProductType.cfc:L305-L313]: the source declares
   * `preInsert()` at L305-L308 and `preUpdate(struct oldData)` at L310-L313, and each
   * one assigns `productTypeIDPath` from the parent chain before delegating to the
   * framework base. Hibernate fired them; nothing fires them now. So this method
   * invokes the entity's ported hook EXPLICITLY before it binds a single parameter,
   * which is the same discipline
   * `src/repositories/mysql/mysqlPriceGroupRepository.ts` (planned) applies to
   * `priceGroupIDPath` for the analogous hooks at [model/entity/PriceGroup.cfc:L206]
   * and [model/entity/PriceGroup.cfc:L211]. The two adapters must stay consistent, and
   * this is the shared precedent they follow: the hook maintains the path, the
   * repository invokes the hook, the repository then stamps the audit columns the
   * hook's `super` call used to stamp.
   *
   * DESCENDANT PATHS ARE NOT REWRITTEN, and this is stated rather than left to
   * inference. Reassigning a product type's parent changes the correct path of every
   * descendant, and NOTHING IN THE LEGACY REWRITES THEM: `preInsert` and `preUpdate`
   * maintain the path of the ONE row being saved [model/entity/ProductType.cfc:L306,
   * L311], `cascade="all"` on `childProductTypes`
   * [model/entity/ProductType.cfc:L65] cascades PERSISTENCE OPERATIONS and not path
   * maintenance, and no descendant-path rewrite exists anywhere in the in-scope tree.
   * A descendant's path therefore went stale in the legacy until that descendant was
   * itself saved, and it goes stale here identically. Inventing a cascading rewrite
   * would be a behaviour change dressed as a bug fix - it would also make one save
   * write an unbounded number of rows - and omitting maintenance the legacy DID
   * perform would be the opposite failure. Neither is done: exactly the one row's path
   * is maintained.
   *
   * INSERT OR UPDATE IS DECIDED BY THE DATABASE, not by a flag. `isNew()` is
   * consulted first - it is the ported `unsavedvalue=""` test
   * [model/entity/ProductType.cfc:L52] - and when the entity does carry an identifier
   * the prior row is read before anything is written. That read serves two purposes at
   * once: it discriminates insert from update the way `super.save()` did through the
   * ORM's saveOrUpdate, and it supplies the `oldData` argument that `preUpdate`
   * declares [model/entity/ProductType.cfc:L310]. An entity carrying an identifier
   * that matches no row is INSERTED with that identifier rather than being rejected,
   * which is what saveOrUpdate did with a detached instance.
   *
   * AUDIT STAMPING, THE HALF OF THE HOOK THAT MOVED HERE. `super.preInsert()` took
   * ONE `now()` and wrote it to BOTH `createdDateTime` and `modifiedDateTime`
   * [org/Hibachi/HibachiEntity.cfc:L609-L619]; `super.preUpdate()` took one `now()`
   * and wrote only `modifiedDateTime` [org/Hibachi/HibachiEntity.cfc:L663-L668]. Both
   * are reproduced exactly, including the single-timestamp property - an inserted row's
   * two stamps are byte-identical rather than merely close - and the ordering is
   * preserved across the seam: the path hook runs first, then the stamping, because the
   * source assigns the path before calling `super`.
   *
   * THE BY-ACCOUNT HALF IS NOT REPRODUCED, and cannot be. `createdByAccountID` and
   * `modifiedByAccountID` were set inside a guard requiring the application to be
   * initialized AND an ambient administrative account to be present in the request
   * scope [org/Hibachi/HibachiEntity.cfc:L622]. That ambient scope is exactly what
   * transformation rule T6 removed, and this port declares no context parameter to
   * replace it with, so the two account columns carry whatever the caller hydrated and
   * are never stamped. Recorded here because a silently unstamped audit column is
   * indistinguishable from a bug.
   *
   * NO ROW COUNT IS INSPECTED. MySQL reports CHANGED rows rather than MATCHED rows
   * unless the connection asks otherwise, so an update that stores values identical to
   * the ones already there reports zero - and treating that as a fault would raise on a
   * legitimate no-op save. The legacy's own staleness detection came from the Hibernate
   * session, which is gone; inventing a replacement out of a driver counter that does
   * not mean what it appears to mean would be worse than not having one.
   *
   * NET-NEW COVERAGE. The obligations for the suite: a new entity gets a 32-character
   * hexadecimal identifier and a path ending in it, with `INSERT INTO SwProductType`
   * emitted and fourteen parameters bound in the declared column order; a root insert's
   * path is the new identifier alone; a child insert's path is the parent's path with
   * the new identifier appended; an existing entity emits the prior-row read followed
   * by `UPDATE SwProductType`, binds twelve parameters with the key LAST, and its SET
   * list contains neither created column; an entity carrying an unmatched identifier is
   * INSERTED; an absent value binds as `null` and never as `undefined`; a transient
   * parent raises before any WRITE is executed - for an entity that already carries an
   * identifier the prior-row read has necessarily happened first, which is a read and
   * changes nothing; and an inserted row's created and modified stamps are the SAME
   * instant.
   *
   * @param productType the product type to persist.
   * @returns the persisted product type - the argument itself when it already carried
   *   an identifier, and a hydrated instance carrying the minted identifier when it did
   *   not.
   * @throws An error named `ProductTypePersistenceError` when the parent association is
   *   transient.
   * @throws An error named `ProductTypeColumnError` when a statement names a column the
   *   persistable record does not carry.
   */
  async saveProductType(productType: ProductType): Promise<ProductType> {
    const priorRow = productType.isNew()
      ? undefined
      : await this.readProductTypeRow(productType.getProductTypeID());

    if (priorRow === undefined) {
      return this.insertProductType(productType);
    }

    return this.updateProductType(productType, priorRow);
  }

  /**
   * Read one product-type row, or nothing.
   *
   * Shared by the identifier read and by the save path's prior-row read, so both use
   * the same statement with the same single bound parameter.
   *
   * @param productTypeID the identifier to match.
   * @returns the row, or `undefined` when none matches.
   */
  private async readProductTypeRow(productTypeID: string): Promise<SqlRow | undefined> {
    const rows = await this.executor.execute(SELECT_PRODUCT_TYPE_BY_ID_SQL, [productTypeID]);

    return rows[0];
  }

  /**
   * Insert a product type that has no row yet.
   *
   * Two routes, and the difference between them is only WHERE THE PATH COMES FROM.
   *
   * An entity that has never been persisted has no identifier, so its path cannot be
   * built from the entity - the identifier belongs in that path. The identifier is
   * minted first, the path is composed from the parent chain plus the minted
   * identifier, and the persisted instance is then hydrated from the very record that
   * is written, through this module's single row-to-entity factory. A NEW INSTANCE is
   * returned because `productTypeID` is immutable on the entity by design, so the
   * argument cannot be updated in place to carry the identifier the database now holds.
   *
   * An entity that carries an identifier but matches no row - saveOrUpdate's detached
   * case - takes the other route: its own `preInsert()` hook is invoked, exactly as
   * Hibernate would have invoked it, and the argument is returned. Its in-memory
   * associations survive, which the hydrated route cannot offer.
   *
   * @param productType the product type to insert.
   * @returns the persisted product type.
   * @throws An error named `ProductTypePersistenceError` when the parent is transient.
   */
  private async insertProductType(productType: ProductType): Promise<ProductType> {
    // [org/Hibachi/HibachiEntity.cfc:L609] ONE timestamp, written to both stamps.
    const auditTimestamp = new Date();

    if (!productType.isNew()) {
      // [model/entity/ProductType.cfc:L306] the path hook first, then the stamping.
      productType.preInsert();

      const detachedRecord = toPersistableRecord(
        productType,
        productType.getProductTypeID(),
        productType.getProductTypeIDPath(),
        auditTimestamp,
        auditTimestamp,
      );

      await this.executor.executeMutation(
        INSERT_PRODUCT_TYPE_SQL,
        toBoundParameters(detachedRecord, INSERTED_COLUMNS, INSERT_STATEMENT_LABEL),
      );

      return productType;
    }

    const generatedProductTypeID = generateProductTypeID();

    const record = toPersistableRecord(
      productType,
      generatedProductTypeID,
      buildIdPathForGeneratedIdentifier(productType, generatedProductTypeID),
      auditTimestamp,
      auditTimestamp,
    );

    await this.executor.executeMutation(
      INSERT_PRODUCT_TYPE_SQL,
      toBoundParameters(record, INSERTED_COLUMNS, INSERT_STATEMENT_LABEL),
    );

    // The scope is created over NO rows: the parent comes from the argument's own
    // already-hydrated chain, so there is nothing for the linkage walk to draw on and
    // the factory is called directly. Going through the same scope constructor keeps
    // this route's port injection and statement label identical to every read's.
    return toProductType(
      record,
      productType.getParentProductType(),
      createHydrationScope([], this, INSERT_STATEMENT_LABEL),
    );
  }

  /**
   * Update a product type whose row already exists.
   *
   * The prior row is passed on to `preUpdate` as the `oldData` argument the source
   * declares [model/entity/ProductType.cfc:L310]. The ported hook does not read it -
   * the legacy body did not either, it forwarded the whole argument collection to
   * `super` [model/entity/ProductType.cfc:L312] - but it is passed rather than dropped,
   * because dropping it would quietly discard the prior row that the audit path was
   * given.
   *
   * The path is read from the entity AFTER the hook has run, which is the whole point
   * of the ordering.
   *
   * @param productType the product type to update.
   * @param priorRow the row as it stands before this write.
   * @returns the argument, which is now the persisted state.
   * @throws An error named `ProductTypePersistenceError` when the parent is transient.
   */
  private async updateProductType(
    productType: ProductType,
    priorRow: SqlRow,
  ): Promise<ProductType> {
    // [model/entity/ProductType.cfc:L311] the path hook first.
    productType.preUpdate(priorRow);

    // [org/Hibachi/HibachiEntity.cfc:L663-L668] then the stamping, modified only.
    const record = toPersistableRecord(
      productType,
      productType.getProductTypeID(),
      productType.getProductTypeIDPath(),
      productType.getCreatedDateTime(),
      new Date(),
    );

    const parameters = [
      ...toBoundParameters(record, UPDATED_COLUMNS, UPDATE_STATEMENT_LABEL),
      productType.getProductTypeID(),
    ];

    await this.executor.executeMutation(UPDATE_PRODUCT_TYPE_SQL, parameters);

    return productType;
  }
}
