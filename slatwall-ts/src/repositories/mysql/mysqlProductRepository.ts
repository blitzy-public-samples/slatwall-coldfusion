/**
 * MySQL adapter for the product repository port.
 *
 * Ported from `model/dao/ProductDAO.cfc` (441 lines, cfscript throughout, the largest of the six
 * in-scope DAOs) with the entity-lifecycle surface the service tier needs now that Hibernate is
 * gone. It is the concrete side of `../../domain/ports/productRepository.js`; the composition root
 * at `src/handlers/bootstrap.ts` (planned) constructs it and hands it to
 * `src/services/productService.ts` (planned).
 *
 * ★ THE PORT DECLARES SIX METHODS AND THIS CLASS IMPLEMENTS SIX. The arithmetic is the port's
 * own: four functions are declared in `model/dao/ProductDAO.cfc`, minus the `private`
 * `saveImportData` [model/dao/ProductDAO.cfc:L328], gives three ported DAO methods
 * (`getAttributeSets` [L52], `loadDataFromFile` [L73], `searchProductsByProductType` [L419]); plus
 * three product entity-lifecycle methods, because `entityLoad`, `getHibachiDAO().save`
 * [model/service/ProductService.cfc:L287] and `super.delete`
 * [model/service/ProductService.cfc:L326] have no equivalent in a driver-only stack. That is six,
 * and the port states it as a lock. There is no seventh.
 *
 * ★ NO BRAND WRITE LIVES HERE, AND AN EARLIER REVISION OF THIS FILE WAS WRONG TO CARRY ONE. It
 * declared a seventh method, `saveBrand`, on the grounds that
 * `return super.save(arguments.brand, arguments.data)` [model/service/BrandService.cfc:L76] is the
 * one statement that made the legacy brand component durable and that AAP rule T3 converts
 * `super.save()` into a repository method. The port's member set is LOCKED AT SIX and the port
 * inventory is LOCKED AT THIRTEEN, so neither a seventh member here nor a fourteenth
 * `BrandRepository` is available - and a partial brand write, one that stored `urlTitle` and
 * `brandName` while dropping `activeFlag`, `publishedFlag` and `brandWebsite` and enforcing none of
 * `model/validation/Brand.json`, would durably store a WRONG ROW and be strictly worse than no
 * write. `src/domain/ports/productRepository.ts` records the removal and its reasoning in full;
 * `src/services/brandService.ts` carries the LEGACY-NOTE that leaves the durable half to the
 * composition root. `Brand` is still constructed in this file, but only as the eager many-to-one
 * association of a product graph row - a read, never a write.
 *
 * JUDGMENT CALL: where the authoring brief for this file and the port disagree, the PORT WINS,
 * and one disagreement is live. The brief describes `searchProductsByProductType` as returning
 * the legacy two-key `{"id","value"}` structure; the port publishes `Promise<Product[]>` and
 * assigns hydration to this adapter. It is recorded here rather than silently resolved, and
 * annotated again at the method that carries it.
 *
 * NO USER RULES GOVERN THIS FILE. `review_rules` reports that no user rules were provided for this
 * project, so nothing here is written to satisfy a rule and no rule is invented to justify a
 * decision. The absence is not a licence to lower the bar: the enterprise practices the plan
 * commits to in its place - maximal strictness, mechanically enforced layer boundaries, exact
 * dependency pinning, a single arithmetic surface, exclusively parameterized SQL, environment-driven
 * configuration with no credential in source, one exported unit per file with no barrel, in-code
 * annotation of every judgment call and every preserved defect, and licence continuity - are
 * applied here with the force a rule would carry.
 *
 * LICENCE. Attribution is carried in `slatwall-ts/NOTICE-GPL.md`. The roughly forty-seven-line GPL
 * header that heads every legacy `.cfc` is deliberately NOT copied into this file.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS PORTED, AND WHAT IS NOT
 *
 * `model/dao/ProductDAO.cfc` is mostly bulk-import machinery. `loadDataFromFile` alone spans
 * L73-L326 and its private helper `saveImportData` spans L328-L417 - 254 lines and 90 lines, so 344
 * of the file's 441. None of that behaviour is reproduced. The port declares `loadDataFromFile`, so
 * the method exists and refuses; everything it reached is inventoried in the EXCLUSION NOTES at the
 * end of this module, one entry per construct (§8.1 through §8.10), because an explicit exclusion
 * note is the deliverable and silence would read as an oversight. Nothing in the legacy tree is deleted or altered: those constructs stay exactly
 * where they are, and every locator here is a provenance citation rather than a modification target.
 *
 * ---------------------------------------------------------------------------------------------
 * LOCATOR DRIFT, MEASURED AGAINST THE FILE RATHER THAN AGAINST ANY CITATION
 *
 * The subtree README warns to re-verify locators against the source instead of trusting cited line
 * numbers. Doing so found eleven drifts, recorded here so the next reader does not re-derive them.
 * Every locator used anywhere in this file is the VERIFIED one.
 *
 *   verified                                     | previously cited
 *   ---------------------------------------------|------------------
 *   `getDBUsername`/`getDBPassword` L157-L158    | L155-L156
 *   the same pair inside `saveImportData`        | L328, L330-L331
 *     L331-L332                                  |
 *   duplicate `var thisExtraData = []` L188,L196 | L189, L195
 *   `createUUID()` L223, L248, L275, L410        | L222, L248, L277, L410
 *   the Mura table reach L262                    | L263
 *   `saveImportData` L328-L417                   | L326-L352
 *   the identical-branch conditional L356-L360   | L355-L359
 *   unquoted datetime interpolation L363, L366   | L362, L365
 *   the service-locator reach L399               | L396
 *   `searchProductsByProductType` L419-L437      | L415-L441
 *   `loadDataFromFile` L73-L326                  | L130-L280
 *
 * `getUsername()`/`getPassword()` do sit at L115-L116, inside the COMMENTED-OUT `dbinfo` block that
 * spans L112-L121 - so they are not live code at all, which is itself worth knowing.
 *
 * Confirmed exactly as cited, and load-bearing: 441 total lines; `getAttributeSets` at L52; the
 * carried-forward TODO at L64; the comma-string bind at L66 and the raw-array bind at L68;
 * `listToArray` at L123 and L259; `transaction{` at L177; the three dialect literals at L288
 * (`"mySQL"`), L304 (`"mySql"`) and L310 (`"Oracle10g"`).
 *
 * ---------------------------------------------------------------------------------------------
 * TEST COVERAGE IS NET-NEW AND IS NOT PRESENTED AS PARITY
 *
 * `meta/tests/unit/dao/` holds only `AccountDAOTest` and `PaymentDAOTest`, so nothing in the legacy
 * suite covers this DAO. Only three legacy test files touch the in-scope slice at all -
 * `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc` and the empty
 * `meta/tests/functional/admin/entity/ProductTest.cfc` - and the second covers the `Product`
 * ENTITY, not this adapter. Every method below therefore states its own test obligations in prose,
 * for the suite at `tests/integration/repositories/` that another agent owns. NO TEST FILE IS
 * AUTHORED HERE.
 *
 * ---------------------------------------------------------------------------------------------
 * FRAMING
 *
 * No statement, comment or decision in this file rests on a latency, throughput, availability or
 * service-level claim, because the legacy system asserts none and none may be invented. Where a
 * choice looks like an efficiency choice - materializing a whole collection in one statement rather
 * than one statement per row, for instance - it is made and justified as EXPLICITNESS and FIDELITY:
 * the fetch shape becomes a decision recorded in the statement instead of an implicit traversal the
 * ORM performed on the entity's behalf.
 *
 * @see model/dao/ProductDAO.cfc - the ported DAO
 * @see model/entity/Product.cfc - the behaviour-carrying entity this adapter hydrates
 * @see model/entity/Brand.cfc - the entity the one brand save persists
 * @see model/entity/ProductType.cfc - the eagerly joined product type
 * @see model/service/ProductService.cfc - the service tier that consumes this port
 */

import { randomUUID } from 'node:crypto';
import { Brand } from '../../domain/entities/brand.js';
import { Option } from '../../domain/entities/option.js';
import { OptionGroup } from '../../domain/entities/optionGroup.js';
import type { ProductHydrationInput } from '../../domain/entities/product.js';
import { Product } from '../../domain/entities/product.js';
import { ProductType } from '../../domain/entities/productType.js';
import type { SkuHydrationInput } from '../../domain/entities/sku.js';
import { Sku } from '../../domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
  ProductSavePayload,
} from '../../domain/ports/productRepository.js';
import { Money } from '../../domain/valueObjects/money.js';
import { listToArray } from '../../lib/cfml/list.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from './connection.js';
import { sqlPlaceholderList } from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { assertMySqlDialect } from './dialect.js';

// ---------------------------------------------------------------------------
// Dialect
//
// Every statement in this module is written in the MySQL arm of the dialect
// selection that `config/configORM.cfm:L1-L15` performed at runtime from the
// database product name. The target narrows to that arm, and the assertion below
// pins the fact at module load so a future dialect widening fails loudly here
// rather than shipping MySQL syntax to another engine. `connection.ts` makes the
// same call at its pool-creation site, for the same reason.
//
// EXCLUSION §8.5 - CFML parity [model/dao/ProductDAO.cfc:L288, L304, L310]: the
// three dialect branches inside this DAO are NOT modelled as live dialect sites,
// and `./dialect.js` deliberately does not carry them. All three sit inside the
// unexercised `loadDataFromFile` post-processing path, and `./dialect.js` models
// only the three LIVE sites - [model/dao/PromotionDAO.cfc:L482],
// [model/dao/PriceGroupDAO.cfc:L57] and [model/dao/SkuDAO.cfc:L194]. Worth one
// note for the record: L304 compares against `"mySql"`, a THIRD distinct MySQL
// spelling alongside `"mySQL"` at L288 and the `"MySQL"` that
// `config/configORM.cfm:L10` actually sets. CFML's `eq` is case-insensitive so
// all three matched in the legacy engine, whereas a TypeScript `===` would fail
// on two of the three - which is exactly why `./dialect.js` folds case. No
// dialect comparison is inlined in this file; every dialect need goes through
// that module.
// ---------------------------------------------------------------------------

/** The dialect every statement in this module is written for. */
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

assertMySqlDialect(STATEMENT_DIALECT, 'the ported ProductDAO statements');

// ---------------------------------------------------------------------------
// Bound literals
//
// The legacy HQL carries two numeric literals in its predicate text:
// `sa.activeFlag = 1` [model/dao/ProductDAO.cfc:L54] and `sas.globalFlag = 1`
// [model/dao/ProductDAO.cfc:L57, L60]. They become BOUND parameters rather than
// inlined digits, which is the convention the sibling statement modules already
// follow - `ACTIVE_FLAG_BOUND_VALUE` in `./sql/accountSubscriptionPriceGroups.sql.js`
// and `PROMOTION_ACTIVE_FLAG` in `./sql/salePricePromotionRewards.sql.js`. Binding
// a statement-author's own constant costs nothing and keeps the rule that every
// value in a statement is a `?` free of exceptions a reviewer has to remember.
// ---------------------------------------------------------------------------

/** `sa.activeFlag = 1` [model/dao/ProductDAO.cfc:L54] - the active-attribute test. */
const ACTIVE_ATTRIBUTE_FLAG_BOUND_VALUE = 1;

/** `sas.globalFlag = 1` [model/dao/ProductDAO.cfc:L57, L60] - the global-set test. */
const GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE = 1;

// ---------------------------------------------------------------------------
// Failure reporting
//
// Two faults, two types, following the pattern `./dialect.js`, `./connection.js`
// and the sibling repositories established: the class is local and unexported, it
// sets an explicit `name`, and a caller discriminates on that name rather than by
// importing the constructor. Keeping the constructors unexported keeps this
// module's surface to the repository class alone (one exported unit per file).
//
// No message ever echoes a column VALUE. A product name, a URL title or a bound
// identifier can be customer data, and an error string is one of the easiest ways
// for it to reach a log that was never scoped to hold it. Only the column name,
// the statement it came from and the JavaScript shape of the offending value
// appear.
// ---------------------------------------------------------------------------

/** A result-set column is missing, or holds a shape this adapter cannot map. */
class ProductColumnError extends Error {
  constructor(columnName: string, statementLabel: string, detail: string) {
    super(`Column '${columnName}' of ${statementLabel}: ${detail}.`);
    this.name = 'ProductColumnError';
  }
}

/** A write cannot proceed, or a write proceeded and its result cannot be read back. */
class ProductPersistenceError extends Error {
  constructor(detail: string) {
    super(`Cannot persist this product: ${detail}.`);
    this.name = 'ProductPersistenceError';
  }
}

/** A ported call cannot be satisfied in this runtime at all. See `loadDataFromFile`. */
class ProductBulkImportUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ProductBulkImportUnavailableError';
  }
}

/** A collection-valued predicate was handed an empty collection it cannot render. */
class ProductEmptyInListError extends Error {
  constructor(parameterName: string, statementLabel: string, detail: string) {
    super(`Parameter '${parameterName}' of ${statementLabel} is empty: ${detail}.`);
    this.name = 'ProductEmptyInListError';
  }
}

/**
 * A required legacy argument was not supplied, and the legacy would have raised on it too.
 *
 * // LEGACY-DEFECT [model/dao/ProductDAO.cfc:L422]: `q.addParam(name="prodName",
 * // value="%#arguments.term#%", ...)` binds `term` UNCONDITIONALLY, while the very next line
 * // [model/dao/ProductDAO.cfc:L423] DOES guard `productTypeIDs` with
 * // `structKeyExists(arguments,"productTypeIDs") && len(...)`. `term` is declared without `required`
 * // [model/dao/ProductDAO.cfc:L419], so calling without it makes CFML raise "element TERM is
 * // undefined" at L422. The identical defect exists in the sibling at [model/dao/SkuDAO.cfc:L133]; it
 * // is in BOTH, and BOTH preserve it.
 * // Preserved deliberately; do not fix without a product decision.
 *
 * // JUDGMENT CALL: the throw is EXPLICIT because TypeScript would otherwise not throw at all.
 * // `` `%${term}%` `` on an absent `term` interpolates the literal text `undefined` and would search
 * // for `%undefined%` - a silent behaviour change wearing the costume of a faithful port. Raising here
 * // is what reproduces the legacy outcome; it is NOT a guard that suppresses the failure, and NO
 * // default value is supplied.
 */
class ProductUndefinedArgumentError extends Error {
  constructor(argumentName: string, statementLabel: string) {
    super(
      `Argument '${argumentName}' of ${statementLabel} was not supplied. The legacy binds it ` +
        `unconditionally and CFML raises "element ${argumentName.toUpperCase()} is undefined" at ` +
        `[model/dao/ProductDAO.cfc:L422]; that outcome is preserved rather than defaulted away.`,
    );
    this.name = 'ProductUndefinedArgumentError';
  }
}

/**
 * A row carries a foreign key that names no row in the referenced table.
 *
 * CFML parity: a Hibernate many-to-one defaults to `not-found="exception"`, and none of the three
 * many-to-one associations on `model/entity/Product.cfc` - `brand` (L68), `productType` (L69) and
 * `defaultSku` (L70) - overrides it. A product row whose `brandID` named a missing brand therefore
 * FAILED TO LOAD in the legacy rather than loading with a null brand, and this reproduces exactly that.
 *
 * // JUDGMENT CALL: raising is not merely parity here, it is protective. The three foreign keys are
 * // written back out of the ASSOCIATIONS - the entity publishes no `brandID` accessor, only
 * // `getBrand()` - so a dangling key quietly read as "no association" would be quietly written as
 * // NULL by the very next `saveProduct`, destroying the reference instead of reporting it. A NULL key
 * // and a dangling key are different states and only one of them is a legitimate absence.
 */
class ProductAssociationError extends Error {
  constructor(associationName: string, referencedTable: string, statementLabel: string) {
    super(
      `A row read by ${statementLabel} references a ${associationName} that does not exist in ` +
        `${referencedTable}. A Hibernate many-to-one defaults to not-found="exception" and none of ` +
        `the product associations overrides it, so this row did not load in the legacy either.`,
    );
    this.name = 'ProductAssociationError';
  }
}

// ---------------------------------------------------------------------------
// Statement labels
//
// One per statement, carrying the legacy locator where a legacy statement exists,
// so a column fault names both the reader and the provenance of the statement it
// read from. The two entity-lifecycle statements have no legacy text to cite,
// because Hibernate generated theirs, and their labels say so by omission.
// ---------------------------------------------------------------------------

const ATTRIBUTE_SETS_GLOBAL_LABEL =
  'the attribute-set read, global-only arm [model/dao/ProductDAO.cfc:L60, L68]';

const ATTRIBUTE_SETS_BY_PRODUCT_TYPE_LABEL =
  'the attribute-set read, product-type arm [model/dao/ProductDAO.cfc:L57-L58, L66]';

const PRODUCT_SEARCH_LABEL =
  'the product search by product type [model/dao/ProductDAO.cfc:L419-L437]';

const PRODUCT_GRAPH_LABEL = 'the product read with its eager brand and product type';

const PRODUCT_SKUS_LABEL = 'the product sku read';

const PRODUCT_SKU_OPTIONS_LABEL = 'the sku option read';

const PRODUCT_INSERT_LABEL = 'the product insert';

const PRODUCT_UPDATE_LABEL = 'the product update';

// ---------------------------------------------------------------------------
// Reading a result-set row
//
// CFML parity [model/dao/ProductDAO.cfc:L432-L433]: query-column access in CFML is
// CASE-INSENSITIVE. `records.productID[i]`, `records.PRODUCTID[i]` and
// `records.productid[i]` are one and the same read, and the legacy projection at
// L431-L434 relies on that freely. These readers therefore FOLD CASE rather than
// demanding an exact key. The ORM attribute itself is spelled both `ormtype` and
// `ormType` across the in-scope entities, which is the same case-insensitivity
// showing up in the metadata, so no column or alias casing is ever assumed here.
//
// JUDGMENT CALL: every fold uses `toLowerCase()` and never `toLocaleLowerCase()`.
// These are SQL identifiers and hexadecimal keys, not human text, and a
// locale-sensitive fold changes the result under a Turkish-dotless-I locale -
// `productID`, `brandID`, `productTypeID`, `defaultSkuID`, `skuID`, `optionID` and
// `attributeSetID` all carry a capital `I`. `src/lib/cfml/struct.ts` takes the same
// position for the same reason; it is not imported here because the declared
// dependency boundary for this file does not include it, and because the concern is
// driver result-set metadata rather than a CFML struct.
// ---------------------------------------------------------------------------

/** The outcome of looking for one column, keeping "absent" distinct from "null". */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Fold an identifier for comparison, once, in one place.
 *
 * @param identifier a column name, an alias or a persisted identifier.
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
 * @returns the value when a column of that name is present - including when the cell is SQL NULL -
 *   and otherwise the absent outcome.
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
 * Read one column the statement is required to have selected.
 *
 * An ABSENT column and a NULL VALUE are different faults and stay apart: this raises for the first
 * and hands back `null` for the second, leaving the nullability decision to the typed reader that
 * called it. Every statement in this module enumerates its projection, so a missing column means the
 * statement and the schema have diverged and saying so is the only honest answer.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the raw driver value, which may be `null`.
 * @throws An error named `ProductColumnError` when no column of that name is present.
 */
function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new ProductColumnError(
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

  if (value === undefined) {
    return 'an absent value';
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
 * Read a NOT-NULL identifier column - a primary key, or a foreign key the statement filtered on.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the identifier as text.
 * @throws An error named `ProductColumnError` when the cell is NULL, empty, or not textual.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected an identifier string but the driver returned ${describeColumnType(value)}`,
    );
  }

  if (value.length === 0) {
    throw new ProductColumnError(columnName, statementLabel, 'the identifier is the empty string');
  }

  return value;
}

/**
 * Read a nullable text column, mapping SQL NULL to `undefined`.
 *
 * CFML parity: a CFML query cell that is NULL reads as the empty string, so legacy code cannot tell
 * NULL from `''` and never needed to. The entity constructors in `src/domain/entities/**` take
 * `string | undefined` for exactly these columns, so `undefined` is what the boundary hands over and
 * the entity's own accessor decides what an absent value means. Collapsing NULL to `''` here would
 * make that decision on the entity's behalf and hide it.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell holds a non-textual, non-null value.
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

  if (typeof value !== 'string') {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected text or SQL NULL but the driver returned ${describeColumnType(value)}`,
    );
  }

  return value;
}

/**
 * Read a nullable whole-number column - `sortOrder`, `calculatedQATS`, and the aggregate count.
 *
 * `INT` and `BIGINT` reach the driver as a `number` and a `bigint` respectively, and a `COUNT(...)`
 * aggregate can arrive as either depending on the column it counted, so both are accepted and only a
 * `bigint` outside the safe-integer range is refused. No string is accepted: `DECIMAL` arrives as a
 * string and routing one through here would be a money column silently read as a count.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the number, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell is not a whole number in range.
 */
function readOptionalCount(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new ProductColumnError(
        columnName,
        statementLabel,
        'the value exceeds the safe integer range and cannot be represented without loss',
      );
    }

    return Number(value);
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected a finite number or SQL NULL but the driver returned ${describeColumnType(value)}`,
    );
  }

  return value;
}

/**
 * Read a NOT-NULL aggregate count - the correlated attribute count of the attribute-set projection.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the count.
 * @throws An error named `ProductColumnError` when the aggregate is NULL or out of range.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalCount(row, columnName, statementLabel);

  if (value === undefined) {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      'an aggregate count cannot be SQL NULL',
    );
  }

  return value;
}

/**
 * Read a nullable `DATETIME` / `TIMESTAMP` column.
 *
 * `mysql2` returns a `Date` for these types. An `Invalid Date` - what a zero date such as
 * `0000-00-00 00:00:00` becomes - is refused rather than propagated, because it would poison every
 * downstream comparison silently instead of failing where it was read.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the timestamp, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell is neither a valid `Date` nor NULL.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected a valid Date or SQL NULL but the driver returned ${describeColumnType(value)}`,
    );
  }

  return value;
}

/**
 * Read a boolean column and hand it on UNCOERCED.
 *
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()`, and it
 * runs in the ENTITY - `src/domain/entities/product.ts` calls it on `activeFlag`, `publishedFlag` and
 * `calculatedAllowBackorderFlag`, `src/domain/entities/brand.ts` calls it on `activeFlag` and
 * `publishedFlag`, and `src/domain/entities/sku.ts` calls it on `activeFlag` and
 * `userDefinedPriceFlag`. This reader therefore returns the raw `CfBooleanInput` rather than calling
 * `cfBoolean()` here. Coercing in the adapter would collapse "the column is NULL" into "the column is
 * false" BEFORE the entity's declared default applies, and the declared defaults are what make the two
 * answers differ: `SwSku.activeFlag` [model/entity/Sku.cfc:L53] declares `default="1"` so a NULL must
 * resolve to TRUE, while `SwProduct.publishedFlag` [model/entity/Product.cfc:L58] declares
 * `default="false"` - the STRING `"false"` - and must resolve to false, and `SwProduct.activeFlag`
 * [model/entity/Product.cfc:L53] declares NO default at all so SQL NULL is a genuinely reachable
 * state. A boolean coerced at the read could only ever produce one of those three answers. Twelve of
 * the eighteen in-scope entities declare no boolean default whatsoever, which is precisely why the
 * decision belongs in exactly one place. `mysqlSkuRepository.ts`, `mysqlProductTypeRepository.ts` and
 * `mysqlPriceGroupRepository.ts` all make the identical decision.
 *
 * FORBIDDEN FORMS, none of which appears anywhere in this file: `Boolean(x)`, `!!x`, `x === 1`.
 *
 * The ONE place this file calls `cfBoolean()` itself is the attribute-set projection, because
 * `AttributeSetSummary` in the port declares `globalFlag: boolean` - a real boolean, on a plain
 * projection with no entity behind it to do the coercion. That call is annotated where it happens.
 *
 * `Uint8Array` is handled because MySQL delivers a `BIT(1)` column as a one-byte buffer. Its first
 * byte is forwarded as a number for `cfBoolean()` to read later; an empty buffer carries no bit at all
 * and is reported as absent rather than as false.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the value in the shape `cfBoolean()` accepts, uncoerced.
 * @throws An error named `ProductColumnError` when the cell is none of the accepted shapes.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value.at(0);

    return firstByte === undefined ? undefined : firstByte;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throw new ProductColumnError(
    columnName,
    statementLabel,
    `expected a boolean, number, string, BIT buffer or SQL NULL but the driver returned ${describeColumnType(
      value,
    )}`,
  );
}

/**
 * Read a `big_decimal` money column.
 *
 * ⚠⚠ SQL NULL MAPS TO `undefined`, NEVER TO `Money.zero`. This is the highest-consequence hydration
 * decision in the file.
 *
 * `SwProduct.calculatedSalePrice` [model/entity/Product.cfc:L62] declares NO `default`, unlike its
 * neighbours - the same asymmetry the schema encodes on `SkuCurrency.price`
 * [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount` [model/entity/PriceGroupRate.cfc:L54],
 * `PromotionApplied.discountAmount` [model/entity/PromotionApplied.cfc:L53] and
 * `PromotionReward.amount` [model/entity/PromotionReward.cfc:L61]. An absent sale price is therefore a
 * REACHABLE state, not a theoretical one, and substituting zero for it would not merely record a wrong
 * number - it would travel through the price accessors and SELL PRODUCTS FOR FREE. `Money.zero`
 * exists, and its own documentation forbids this exact use.
 *
 * The three SKU money columns work the other way round and this same reader serves them: `listPrice`,
 * `price` and `renewalPrice` [model/entity/Sku.cfc:L55-L57] each declare `default="0"`, so `undefined`
 * is handed over and `src/domain/entities/sku.ts` applies `?? Money.zero` itself. The default stays in
 * the one file that declares it; the reader stays uniform.
 *
 * E4: `DECIMAL` reaches this adapter as a STRING, deliberately - `decimalNumbers` is left unset on the
 * pool precisely so it does. The string goes straight to `Money.fromDecimalString`. It is NEVER routed
 * through `Number()`, `parseFloat`, unary `+` or any arithmetic operator, because every one of those
 * is an IEEE-754 double and would drift on a value the legacy guarded with `precisionEvaluate`.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the amount, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell is not a decimal string or NULL, or an
 *   error named `MoneyParseError` from `Money.fromDecimalString` when the text is not a decimal.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected a decimal string or SQL NULL but the driver returned ${describeColumnType(value)} - ` +
        'the pool leaves `decimalNumbers` unset so DECIMAL must arrive as text',
    );
  }

  return Money.fromDecimalString(value);
}

/**
 * Normalize one value for binding.
 *
 * `undefined` becomes SQL `NULL`. `mysql2` would bind `undefined` as `DEFAULT` in some positions and
 * raise in others, and neither is what an absent column means - so the conversion happens once, here,
 * rather than being remembered at each of the thirty-one bind sites in this module.
 *
 * @param value the value to bind.
 * @returns the value, or `null` when it is absent.
 */
function toBindableValue(value: unknown): unknown {
  return isNullish(value) ? null : value;
}

/**
 * Render a money value for binding, or `null` when it is absent.
 *
 * E4: the decimal STRING is what crosses the wire. `Money` never becomes a `number` on the way to the
 * database any more than it does on the way back.
 *
 * @param amount the amount to bind, if any.
 * @returns the decimal string, or `null`.
 */
function toBindableMoney(amount: Money | undefined): string | null {
  return amount === undefined ? null : amount.toDecimalString();
}

// ---------------------------------------------------------------------------
// The persisted columns
//
// B5, schema continuity: these lists ENUMERATE what already exists. No column is
// added, renamed, retyped or dropped, no DDL appears anywhere in this module, and
// the words CREATE, ALTER and DROP do not appear in any statement it emits.
//
// JUDGMENT CALL: each write statement's TEXT and its bound parameter ARRAY are both
// derived from one ordered list, so their agreement is structural rather than
// maintained by eye. Positional binding is unforgiving in exactly one way - a column
// list and a value list that drift by one write every remaining value into the wrong
// column, silently and successfully - and deriving both from a single ordered source
// makes that class of fault unrepresentable. The emitted text stays completely fixed
// and completely assertable; it is quoted in full on each statement constant.
// ---------------------------------------------------------------------------

/**
 * The twenty physical columns of `SwProduct`, in insert order.
 *
 * Taken from [model/entity/Product.cfc]: the seven scalars at L52-L59, the four calculated columns at
 * L62-L65, the three foreign keys that `fkcolumn` declares on the many-to-one associations at
 * L68-L70 (`brandID`, `productTypeID`, `defaultSkuID`), `remoteID` at L92, and the four audit columns
 * at L95-L98.
 *
 * Nothing else on that component is a column. `skus` (L73), `productImages` (L74), `attributeValues`
 * (L75) and `productReviews` (L76) are one-to-many collections keyed by a foreign key on the OTHER
 * table, and the eleven many-to-many associations at L79-L90 live in their own link tables -
 * `SwProductListingPage`, `SwProductCategory`, `SwRelatedProduct`, `SwPromoRewardProduct`,
 * `SwPromoRewardExclProduct`, `SwPromoQualProduct`, `SwPromoQualExclProduct`,
 * `SwPriceGroupRateProduct`, `SwVendorProduct` and `SwPhysicalProduct`. This module writes NONE of
 * those link tables: the legacy DAO wrote none of them either, and a repository that silently
 * synchronised a many-to-many it was never asked about would be inventing behaviour.
 */
const PRODUCT_INSERTED_COLUMNS = [
  'productID',
  'activeFlag',
  'urlTitle',
  'productName',
  'productCode',
  'productDescription',
  'publishedFlag',
  'sortOrder',
  'calculatedSalePrice',
  'calculatedQATS',
  'calculatedAllowBackorderFlag',
  'calculatedTitle',
  'brandID',
  'productTypeID',
  'defaultSkuID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The seventeen columns an update SETs - and the three deliberate exclusions.
 *
 * `productID` is excluded because it is the key the statement MATCHES on rather than a value it sets.
 * `createdDateTime` and `createdByAccountID` are excluded because
 * `HibachiEntity.preUpdate` [org/Hibachi/HibachiEntity.cfc:L662-L667] stamped only the modified pair
 * and left the created pair exactly as the insert wrote it - carrying them into the SET list would let
 * a caller that hydrated an entity without them overwrite real creation provenance with NULL.
 */
const PRODUCT_UPDATED_COLUMNS = [
  'activeFlag',
  'urlTitle',
  'productName',
  'productCode',
  'productDescription',
  'publishedFlag',
  'sortOrder',
  'calculatedSalePrice',
  'calculatedQATS',
  'calculatedAllowBackorderFlag',
  'calculatedTitle',
  'brandID',
  'productTypeID',
  'defaultSkuID',
  'remoteID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The eleven physical columns of `SwBrand`, read-only in this module.
 *
 * Taken from [model/entity/Brand.cfc]: the six scalars at L52-L57, `remoteID` at L77, and the four
 * audit columns at L80-L83. `attributeValues` (L60) and `products` (L61) are one-to-many collections,
 * and the seven many-to-many associations at L66-L73 live in their own link tables.
 *
 * `SwBrand` HAS NO FOREIGN KEY OF ITS OWN. That is why this list is scalars plus audit and nothing
 * else.
 *
 * ★ THIS MODULE NEVER WRITES `SwBrand`, AND NO MODULE IN THE SLICE DOES. The port's member set is
 * locked at six and the port inventory at thirteen, so there is no brand save here and no
 * `BrandRepository` to host one; `src/domain/ports/productRepository.ts` records that removal in
 * full. Brand columns are projected only because [model/entity/Product.cfc:L68] declares
 * `fetch="join"` on the association, so the brand is materialized in the product's own statement.
 * There is therefore no insert or update list for this table.
 */
const BRAND_READ_COLUMNS = [
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * A row about to be written, keyed by physical column name.
 *
 * Deliberately NOT the entity: the entity publishes no `brandID`, `productTypeID` or `defaultSkuID`
 * accessor - it publishes the ASSOCIATIONS those columns implement - and the audit stamps are decided
 * by the save path rather than read off the argument. Materializing the record first makes the write
 * one flat, inspectable object, and it is the object the bound parameters are read from.
 */
type PersistableRecord = Readonly<Record<string, unknown>>;

/**
 * Project a persistable record onto an ordered column list, ready to bind.
 *
 * A column the record does not carry is a fault rather than a NULL: the record is built in this module
 * from the same lists the statements are built from, so a gap means the two have drifted and a silent
 * NULL would write that drift into the database.
 *
 * @param record the row to bind.
 * @param columns the ordered column names, which must match the statement's own order exactly.
 * @param statementLabel which statement is being bound.
 * @returns the bound parameters, in column order, with every absent value normalized to `null`.
 * @throws An error named `ProductColumnError` when the record does not carry a listed column.
 */
function toBoundParameters(
  record: PersistableRecord,
  columns: readonly string[],
  statementLabel: string,
): unknown[] {
  return columns.map((columnName: string) =>
    toBindableValue(requireColumn(record, columnName, statementLabel)),
  );
}

// ---------------------------------------------------------------------------
// The statements
//
// E5, parameterized SQL exclusively: every VALUE below is a positional `?` bound
// through `executor.execute` / `executor.executeMutation`, which are server-side
// prepared statements. `pool.query()` is never reached - the executor type does not
// publish it - `namedPlaceholders` is not enabled, and the only template-literal
// substitutions anywhere in this section are `sqlPlaceholderList(...)` calls and
// joins over the frozen column lists above. NO CALLER VALUE IS EVER INTERPOLATED.
// That is the property `cfqueryparam` gave the legacy code, and the concrete
// counter-example that motivates it lives in this very source file at
// [model/dao/ProductDAO.cfc:L363] and [L366] - see the exclusion notes at the end of
// this module.
//
// `IN (?)` IS NOT EXPANDED FROM AN ARRAY by `mysql2`. Every collection-valued
// predicate therefore renders one placeholder per element through
// `sqlPlaceholderList`, which refuses a count of zero rather than emitting the
// unparseable `IN ()`; each call site short-circuits before it can ask for zero.
// The ONE deliberate exception is the `systemCode` predicate of the product-type arm
// of the attribute-set read, and the reason it is an exception is documented at
// length on that statement. It is not to be cross-applied.
// ---------------------------------------------------------------------------

/**
 * The attribute-set read projection.
 *
 * Eight columns of `SwAttributeSet`, one flattened association column, and one correlated aggregate -
 * exactly the members `AttributeSetSummary` declares in `../../domain/ports/productRepository.js`, and
 * nothing else. `additionalCharge` [model/entity/AttributeSet.cfc:L60] is deliberately NOT selected
 * because it is monetary and the port declares no monetary member; `accountSaveFlag` [L59], the audit
 * columns [L78-L81] and the four many-to-many collections [L70-L73] are not selected because they
 * serve subsystems outside this slice.
 *
 * ⚠ THE TWO ATTRIBUTE TESTS ARE DIFFERENT TESTS, AND CONFLATING THEM WOULD BE WRONG. The row FILTER
 * asks whether at least one ACTIVE attribute exists [model/dao/ProductDAO.cfc:L54]. The projected
 * COUNT is the legacy derived accessor `getAttributeCount()` [model/entity/AttributeSet.cfc:L91-L93],
 * whose body is `arrayLen(this.getAttributes())` over the WHOLE collection - `getAttributes()`
 * [model/entity/AttributeSet.cfc:L84-L90] returns `variables.Attributes` untouched when no `orderby`
 * argument is supplied, and the DAO supplies none. So a set with one active and three inactive
 * attributes qualifies for the filter and reports a count of FOUR. Adding `AND activeFlag = 1` to the
 * aggregate would report one, and would be a behaviour change dressed up as consistency.
 *
 * CFML parity [model/dao/ProductDAO.cfc:L55, L62]: `sas.attributeSetType.systemCode` is an HQL
 * IMPLICIT JOIN across the many-to-one at [model/entity/AttributeSet.cfc:L64], and Hibernate renders an
 * implicit join in a WHERE clause as an INNER JOIN. A row whose `attributeSetTypeID` is NULL was
 * therefore never returned by the legacy query, and `INNER JOIN SwType` reproduces exactly that. A
 * LEFT JOIN here would widen the result set.
 */
const ATTRIBUTE_SET_PROJECTION = [
  'sas.attributeSetID as attributeSetID',
  'sas.activeFlag as activeFlag',
  'sas.attributeSetName as attributeSetName',
  'sas.attributeSetCode as attributeSetCode',
  'sas.attributeSetDescription as attributeSetDescription',
  'sas.globalFlag as globalFlag',
  'sas.requiredFlag as requiredFlag',
  'sas.sortOrder as sortOrder',
  'sast.systemCode as attributeSetTypeSystemCode',
  '(SELECT COUNT(*) FROM SwAttribute sac WHERE sac.attributeSetID = sas.attributeSetID) as attributeCount',
].join(',\n  ');

/**
 * The FROM and the two predicates every arm shares, plus the legacy ORDER BY.
 *
 * The ordering is the legacy's own [model/dao/ProductDAO.cfc:L62], carried over verbatim - primary key
 * the type system code ascending, secondary key the attribute-set sort order ascending. No third
 * ordering key, no tiebreaker and no `DISTINCT` is added: `sortOrder` is nullable
 * [model/entity/AttributeSet.cfc:L61] so ties are reachable, and the legacy resolved them
 * arbitrarily. Inventing a deterministic tiebreaker would be a behaviour the source never had.
 */
const ATTRIBUTE_SET_FROM_AND_TYPE_FILTER = `FROM SwAttributeSet sas
INNER JOIN SwType sast ON sast.typeID = sas.attributeSetTypeID
WHERE (EXISTS (
    SELECT 1 FROM SwAttribute sa
    WHERE sa.attributeSetID = sas.attributeSetID AND sa.activeFlag = ?
  )`;

/** The legacy ordering, shared by both arms [model/dao/ProductDAO.cfc:L62]. */
const ATTRIBUTE_SET_ORDER_BY = 'ORDER BY sast.systemCode ASC, sas.sortOrder ASC';

/**
 * The global-only arm - the branch the legacy takes when `productTypeIDs` is EMPTY.
 *
 * CFML parity [model/dao/ProductDAO.cfc:L60, L68]: the HQL fragment is `AND sas.globalFlag = 1`, and
 * the binding at L68 passes `arguments.attributeSetTypeCode` AS AN ARRAY. Hibernate expands a bound
 * array into a real `IN` list, so this arm renders ONE PLACEHOLDER PER ELEMENT and is the CORRECT arm.
 * That is also the standard rule for every other collection predicate in the target.
 *
 * ⚠ EMPTY MEANS "GLOBAL SETS ONLY", NOT "NO FILTER". The legacy `else` branch is a narrowing branch,
 * and the method's own contract on the port says so. A caller passing an empty `productTypeIDs` gets
 * fewer rows, never more.
 *
 * `globalFlag = ?` is bound rather than written as the literal `1` the HQL carries, because E5 admits
 * no interpolated value and a literal in statement text is the habit that leads to an interpolated one.
 * The bound value is the named constant {@link GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE}.
 *
 * @param typeCodeCount how many attribute-set type codes will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `typeCodeCount` is below one.
 */
function buildGlobalAttributeSetsSql(typeCodeCount: number): string {
  return `SELECT
  ${ATTRIBUTE_SET_PROJECTION}
${ATTRIBUTE_SET_FROM_AND_TYPE_FILTER}
  AND sast.systemCode IN (${sqlPlaceholderList(typeCodeCount)}))
  AND sas.globalFlag = ?
${ATTRIBUTE_SET_ORDER_BY}`;
}

/**
 * The product-type arm - the branch the legacy takes when `productTypeIDs` is NON-EMPTY.
 *
 * ★★ THIS STATEMENT CARRIES THE ONE DOCUMENTED E5 EXCEPTION IN THE WHOLE TARGET. Read the whole note
 * before changing a character of it.
 *
 * // LEGACY-DEFECT [model/dao/ProductDAO.cfc:L66]: this arm binds `attributeSetTypeCode` as
 * // `arrayToList(arguments.attributeSetTypeCode)` - a COMMA-DELIMITED STRING - while the sibling arm
 * // at L68 binds the RAW ARRAY. Hibernate expands a bound array into a real `IN` list but binds a
 * // bound string as ONE SCALAR, so for MULTI-ELEMENT input this arm evaluates the equivalent of
 * // `systemCode IN ('a,b,c')` and MATCHES NOTHING, while the sibling arm matches correctly.
 * // SINGLE-ELEMENT input behaves identically in both arms, which is exactly why the defect has
 * // survived unnoticed. Preserved deliberately; do not fix without a product decision.
 *
 * // TODO: Remove this conditional when railo and ACF match how they handle arrays for 'IN' clause
 *
 * The TODO immediately above is [model/dao/ProductDAO.cfc:L64], carried over CHARACTER FOR CHARACTER
 * including the lower-case `railo` and the single quotes around `IN`. It guards the branch at
 * [model/dao/ProductDAO.cfc:L65-L69] - this statement and its sibling - and it is carried forward
 * rather than resolved. B3: a known source TODO is ported as a flagged TODO and never silently
 * completed. Only the MySQL branch is targeted and `./dialect.js` replaced the runtime engine probe,
 * so the CFML-engine divergence the TODO describes no longer applies here - and the TODO stays anyway,
 * because closing it is a product decision and not a porting one.
 *
 * // JUDGMENT CALL: `systemCode IN (?)` renders EXACTLY ONE placeholder here, and the joined
 * // comma-delimited string is bound to it as a single parameter. That is E5 COMPLIANCE WITHOUT
 * // BEHAVIOURAL REPAIR: the value is BOUND, never interpolated, so the injection-safety property
 * // holds in full; and it still matches nothing for multi-element input, so the legacy's observable
 * // result is unchanged. Binding per element here would REPAIR the defect - it would change WHICH
 * // ROWS MATCH - and this file has a budget of zero divergences, zero signature reshapings and zero
 * // visibility widenings. E5 governs HOW a value is bound, not WHICH rows match.
 *
 * ⚠ THIS EXCEPTION MUST NOT BE CROSS-APPLIED. Everywhere else - `productTypeIDs` on this same
 * statement, `productTypeIDs` on the product search below, and every comma-list in
 * `mysqlOptionRepository.ts` and `mysqlSkuRepository.ts` - per-element binding PRESERVES semantics
 * and is therefore MANDATORY. The two cases are opposites: there, one placeholder would break
 * fidelity; here, many placeholders would break it.
 *
 * CFML parity, and a CORRECTION, on the assignment predicate. The legacy fragment at
 * [model/dao/ProductDAO.cfc:L57-L58] reads
 * `exists(FROM sas.attributeSetAssignments asa WHERE asa.productTypeID IN (:productTypeIDs))`, but
 * `attributeSetAssignments` IS NOT AN ASSOCIATION `AttributeSet.cfc` DECLARES, and no
 * `AttributeSetAssignment.cfc` exists anywhere in the repository - the only two references to that
 * name in the whole tree are this line and a smart-list call at [model/entity/ProductType.cfc:L94-L98].
 * The HQL path therefore cannot resolve, so this arm THROWS in the legacy rather than returning rows.
 * The association the schema actually provides is `productTypes`
 * [model/entity/AttributeSet.cfc:L70], a many-to-many over `linktable="SwAttributeSetProductType"`
 * with `fkcolumn="attributeSetID"` and `inversejoincolumn="productTypeID"`, whose columns are exactly
 * the two the legacy predicate names.
 *
 * // JUDGMENT CALL: the real link table is emitted, as a documented CORRECTION mandated by B5 - the
 * // existing `Sw*` schema is the contract, and a statement naming a table that does not exist cannot
 * // read it. This deliberately carries NO `LEGACY-DEFECT` marker: that marker means "preserved
 * // deliberately", and here the behaviour is corrected rather than preserved. It is the same class of
 * // correction as the `Slatwall*`-to-`Sw*` renaming on the product search below, and it is recorded
 * // in both places for the same reason - a reviewer must be able to see that the divergence was
 * // chosen, and why.
 *
 * THIS ARM TAKES NO TYPE-CODE COUNT, and the absence is the point: it binds exactly ONE parameter for
 * the type codes however many there are. An EMPTY `attributeSetTypeCode` therefore joins to the empty
 * string and renders the equivalent of `systemCode IN ('')`, which matches nothing - precisely what
 * `arrayToList([])` bound to the legacy's `:attributeSetTypeCode` produced. Faithful by construction,
 * with no special case to write.
 *
 * @param productTypeIDCount how many product-type identifiers will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `productTypeIDCount` is below one.
 */
function buildAttributeSetsByProductTypeSql(productTypeIDCount: number): string {
  return `SELECT
  ${ATTRIBUTE_SET_PROJECTION}
${ATTRIBUTE_SET_FROM_AND_TYPE_FILTER}
  AND sast.systemCode IN (?))
  AND (sas.globalFlag = ?
    OR EXISTS (
      SELECT 1 FROM SwAttributeSetProductType saspt
      WHERE saspt.attributeSetID = sas.attributeSetID
        AND saspt.productTypeID IN (${sqlPlaceholderList(productTypeIDCount)})
    ))
${ATTRIBUTE_SET_ORDER_BY}`;
}

/**
 * The ported product search, [model/dao/ProductDAO.cfc:L419-L437].
 *
 * The legacy statement, verbatim from [model/dao/ProductDAO.cfc:L421] and [L424], with only the named
 * parameters turned positional:
 *
 *     select productID,productName from SlatwallProduct where productName like :prodName
 *      and productTypeID in (:productTypeIDs)
 *
 * ⚠ THE SCHEMA-NAMING CORRECTION. `SlatwallProduct` is the ORM ENTITY name
 * [model/entity/Product.cfc:L49, `entityname="SlatwallProduct"`]; the PHYSICAL table is `SwProduct`
 * [same line, `table="SwProduct"`]. The three query mechanisms in the in-scope DAO layer behave
 * differently and the difference is provable:
 *
 *   1. HQL through `ormExecuteQuery` correctly names `Slatwall*`, because HQL resolves entity names -
 *      the attribute-set read above is one of these, which is why it names `SlatwallAttributeSet` in
 *      the legacy and `SwAttributeSet` here for the same reason as this statement.
 *   2. Tag-syntax `<cfquery>` correctly names the physical `Sw*`.
 *   3. Raw SQL through `new Query()` + `setSQL()` + `execute()` bypasses the ORM entirely and
 *      therefore hits the PHYSICAL schema - so naming `Slatwall*` there means the statement ALWAYS
 *      FAILS with "table doesn't exist". There are exactly three such in-scope methods:
 *      [model/dao/ProductTypeDAO.cfc:L53-L54], [model/dao/SkuDAO.cfc:L131-L138], and this one
 *      [model/dao/ProductDAO.cfc:L420-L427]. No `CREATE VIEW` exists anywhere in the repository, so
 *      nothing bridges the two names.
 *
 * // JUDGMENT CALL: the correct physical name `SwProduct` is emitted, as a documented CORRECTION
 * // mandated by B5 (schema continuity). No view is created, no alias is added and no DDL is emitted.
 * // This deliberately carries NO `LEGACY-DEFECT` marker, because that marker means "preserved
 * // deliberately" and here the behaviour is corrected.
 *
 * // CFML parity [model/dao/ProductDAO.cfc:L420-L427]: the legacy spelling was `SlatwallProduct` and
 * // the keyword casing was lower case. The casing is mirrored so the provenance of the text is
 * // visible at a glance - contrast the attribute-set statements above, which mirror their HQL
 * // source's upper case. Only the table name and the parameter style are changed.
 *
 * ⚠ THE PRODUCT-TYPE FILTER IS A DIRECT ROW FILTER, and it stays one. `productTypeID` is a column of
 * `SwProduct` [model/entity/Product.cfc:L69, `fkcolumn="productTypeID"`], so the legacy filters it
 * directly. Its sibling `searchSkusByProductType` [model/dao/SkuDAO.cfc:L131-L138] filters through a
 * CORRELATED SUBQUERY instead, because a SKU has no product-type column of its own. That asymmetry is
 * REAL and is one of the four listed at the method below; no subquery is introduced here to make the
 * two look alike.
 *
 * `productName` is selected and never read. The legacy projects `productID, productName` into a
 * two-key autocomplete structure [model/dao/ProductDAO.cfc:L429-L436], and the port returns `Product[]`
 * instead, so only the identifier is consumed - but the projection is the ported statement's text and
 * is carried over unchanged rather than trimmed to what this adapter happens to need.
 *
 * NO `ORDER BY`, NO `DISTINCT` AND NO `LIMIT` - the legacy has none, so none is added.
 *
 * @param productTypeIDCount how many product-type identifiers will be bound, or zero to omit the
 *   product-type predicate entirely, exactly as the legacy `structKeyExists`/`len` guard at
 *   [model/dao/ProductDAO.cfc:L423] does.
 * @returns the statement text.
 */
function buildProductSearchSql(productTypeIDCount: number): string {
  const base = 'select productID,productName from SwProduct where productName like ?';

  if (productTypeIDCount < 1) {
    return base;
  }

  return `${base} and productTypeID in (${sqlPlaceholderList(productTypeIDCount)})`;
}

/**
 * The fourteen physical columns of `SwProductType`, read-only in this module.
 *
 * From [model/entity/ProductType.cfc]: the eight scalars at L52-L59, the `parentProductTypeID` foreign
 * key at L62, `remoteID` at L80, and the four audit columns at L83-L86. This module NEVER writes
 * `SwProductType` - `mysqlProductTypeRepository.ts` owns that table's writes and its
 * `productTypeIDPath` maintenance - so there is no insert or update list for it here.
 */
const PRODUCT_TYPE_READ_COLUMNS = [
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
 * The sixteen physical columns of `SwSku`, read-only in this module.
 *
 * From [model/entity/Sku.cfc]: the eight scalars at L52-L59, `calculatedQATS` at L62, the two foreign
 * keys at L65-L66 (`productID`, `subscriptionTermID`), `remoteID`, and the four audit columns. This
 * module NEVER writes `SwSku` - `mysqlSkuRepository.ts` owns that table - so there is no insert or
 * update list for it here.
 */
const SKU_READ_COLUMNS = [
  'skuID',
  'activeFlag',
  'skuCode',
  'listPrice',
  'price',
  'renewalPrice',
  'imageFile',
  'userDefinedPriceFlag',
  'calculatedQATS',
  'productID',
  'subscriptionTermID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The twelve `SwOption` columns this module reads.
 *
 * From [model/entity/Option.cfc]: the five scalars at L52-L56, `optionGroupID` at L59,
 * `defaultImageID` at L60, `remoteID` at L69, and the four audit columns at L72-L75.
 *
 * ★ `optionGroupID` IS SELECTED, AND AN EARLIER REVISION OF THIS MODULE DELIBERATELY DID NOT SELECT IT.
 * That decision rested on one premise - that `src/domain/entities/optionGroup.ts` was not among this
 * file's dependencies, so no `OptionGroup` could be constructed here and the foreign key would have
 * nowhere to go. The premise was a statement about this module's own import list, not about the layer
 * rule: a repository adapter may import any domain entity, and `mysqlSkuRepository.ts` imports this
 * very one for this very join. What the omission actually cost is now visible from the port's own
 * contract, which requires a returned `Product` to carry `options` materialized to CONSUMER DEPTH -
 * and the consumer, `Product.getOptionGroups()`, needs the group and not just the option:
 *
 *   * `Product.getOptionGroups()` [model/entity/Product.cfc:L240-L247] is a live member of the
 *     `getFormattedOptionGroups` validation path and answers from an eagerly-materialized array
 *     supplied by THIS adapter. With no group on any option there was nothing to derive it from.
 *   * `Product.getOptionsByOptionGroup(optionGroupID)` skipped every option, since none carried a
 *     group to match against.
 *   * `Product.getSkus(true)` returned the UNSORTED projection, because the odometer weighting reads
 *     both `option.getSortOrder()` and `option.getOptionGroup().getSortOrder()`.
 *
 * The group therefore arrives through the same LEFT OUTER JOIN `mysqlSkuRepository.ts` uses, adding no
 * statement to the fetch shape - see {@link buildSkuOptionsSql}. `mysqlSkuRepository.getProductSkus`
 * [model/service/SkuService.cfc:L220-L245] remains the path for a caller that wants SKUs on their own
 * terms rather than a product's; the two now agree about what an option carries instead of differing.
 * Stated as an explicitness fact about the fetch shape, not as a performance claim.
 */
const OPTION_READ_COLUMNS = [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
  'optionGroupID',
  'defaultImageID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The twelve `SwOptionGroup` columns joined alongside each option.
 * [model/entity/OptionGroup.cfc:L52-L67]
 *
 * Identical to the set `mysqlSkuRepository.ts` reads, deliberately: the two adapters hydrate the same
 * entity from the same table, and a narrower projection here would make an `OptionGroup` reached
 * through a product differ from one reached through a SKU.
 */
const OPTION_GROUP_READ_COLUMNS = [
  'optionGroupID',
  'optionGroupName',
  'optionGroupCode',
  'optionGroupImage',
  'optionGroupDescription',
  'imageGroupFlag',
  'sortOrder',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * Alias prefix for the option-group columns joined alongside an option.
 *
 * `SwOption` and `SwOptionGroup` share five column names outright - `optionGroupID`, `sortOrder`,
 * `remoteID` and two of the four audit columns overlap by name across all four - so one flat row
 * cannot carry both sets unprefixed. Prefixing the GROUP side leaves the option columns readable under
 * their own schema names, which keeps the projection diffable against [model/entity/Option.cfc]. The
 * prefix string is the one `mysqlSkuRepository.ts` uses, so a reviewer reading either module sees the
 * same labels for the same columns.
 */
const OPTION_GROUP_ALIAS_PREFIX = 'optionGroup_';

/**
 * Render an aliased projection for one table of a multi-table read.
 *
 * `SwProduct`, `SwBrand` and `SwProductType` all carry `activeFlag`, `urlTitle`, `remoteID` and the
 * four audit columns, so an unprefixed three-table projection would collide on seven names and the
 * driver would silently keep exactly one of each. The prefix makes every label unique and makes the
 * owning table readable in the emitted text.
 *
 * @param tableAlias the table's alias inside the statement.
 * @param labelPrefix the prefix applied to every result label.
 * @param columns the columns to project, in order.
 * @returns the projection fragment, newline-and-indent separated to match the surrounding statements.
 */
function aliasedProjection(
  tableAlias: string,
  labelPrefix: string,
  columns: readonly string[],
): string {
  return columns
    .map((columnName: string) => `${tableAlias}.${columnName} as ${labelPrefix}${columnName}`)
    .join(',\n  ');
}

/**
 * The product graph projection - forty-five labels across three tables.
 *
 * T3, FETCH SHAPE IS A DECISION: `brand` and `productType` are materialized in the SAME statement as
 * the product, and that is CFML parity rather than preference. [model/entity/Product.cfc:L68] and [L69]
 * both declare `fetch="join"`, which is exactly Hibernate's instruction to fetch the association in the
 * owning select through an outer join. `LEFT JOIN` is the faithful rendering: a product with a NULL
 * `brandID` was returned by the legacy with a null brand, and an INNER JOIN would silently drop it.
 *
 * `defaultSku` also declares `fetch="join"` [model/entity/Product.cfc:L70] and is NOT joined here. It
 * is materialized by the SKU statement instead, because a `Sku` needs its own `options` collection
 * populated and a many-to-many cannot be flattened into this row without multiplying it. The
 * association is still eager - it is resolved before the product is constructed - so the entity never
 * sees a gap; only the statement count differs from Hibernate's.
 *
 * ⚠ `ProductType.products` [model/entity/ProductType.cfc:L66] declares `lazy="extra"` and is
 * DELIBERATELY NOT MATERIALIZED. It is one of exactly three `lazy="extra"` collections in the slice,
 * alongside `PromotionCode.orders` [model/entity/PromotionCode.cfc:L68] and `Sku.orderItems`
 * [model/entity/Sku.cfc:L71]. `lazy="extra"` is Hibernate's instruction that the collection must NOT be
 * initialized even to answer a size query, so materializing it here would contradict the mapping
 * outright - and a product type's product collection is every product of that type, which is
 * unbounded and has no consumer on this port. `ProductType`'s own constructor defaults it to `[]`.
 * Stated as fidelity to the mapping, not as a performance claim.
 */
const PRODUCT_GRAPH_PROJECTION = [
  aliasedProjection('p', 'p_', PRODUCT_INSERTED_COLUMNS),
  aliasedProjection('b', 'b_', BRAND_READ_COLUMNS),
  aliasedProjection('pt', 'pt_', PRODUCT_TYPE_READ_COLUMNS),
].join(',\n  ');

/**
 * Read one or more products with their eager brand and product type.
 *
 * @param productIDCount how many product identifiers will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `productIDCount` is below one.
 */
function buildProductGraphSql(productIDCount: number): string {
  return `SELECT
  ${PRODUCT_GRAPH_PROJECTION}
FROM SwProduct p
LEFT JOIN SwBrand b ON b.brandID = p.brandID
LEFT JOIN SwProductType pt ON pt.productTypeID = p.productTypeID
WHERE p.productID IN (${sqlPlaceholderList(productIDCount)})`;
}

/**
 * Read the SKUs belonging to a set of products, together with any default SKUs named by those products.
 *
 * ONE STATEMENT, TWO PREDICATES, AND THE `OR` IS LOAD-BEARING. `skus` is the one-to-many keyed on
 * `SwSku.productID` [model/entity/Product.cfc:L73], while `defaultSku` is a many-to-one keyed on
 * `SwProduct.defaultSkuID` [model/entity/Product.cfc:L70]. Nothing in the schema guarantees the second
 * is a member of the first, so resolving `defaultSku` only by scanning the product's own SKU array
 * would leave it undefined whenever the two disagree - and `saveProduct` writes `defaultSkuID` from
 * that association, so an undefined default would be persisted as NULL on the next save. The
 * identifier predicate closes that hole.
 *
 * NO `ORDER BY`. `Product.skus` declares none [model/entity/Product.cfc:L73], so Hibernate returned the
 * collection in whatever order the database produced, and `Product.getSkus()` unflagged returns the
 * live array in exactly that order. Sorting here would invent an ordering the legacy never had; the
 * legacy's ONE sorted path is `SkuDAO.getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172-L202], which
 * belongs to `mysqlSkuRepository.ts`.
 *
 * @param productIDCount how many product identifiers will be bound; may be zero when only default-SKU
 *   identifiers are being resolved.
 * @param defaultSkuIDCount how many default-SKU identifiers will be bound; may be zero.
 * @returns the statement text.
 * @throws An error named `ProductEmptyInListError` when both counts are zero, which would render a
 *   predicate that matches nothing and must be short-circuited by the caller instead.
 */
function buildProductSkusSql(productIDCount: number, defaultSkuIDCount: number): string {
  const predicates: string[] = [];

  if (productIDCount > 0) {
    predicates.push(`s.productID IN (${sqlPlaceholderList(productIDCount)})`);
  }

  if (defaultSkuIDCount > 0) {
    predicates.push(`s.skuID IN (${sqlPlaceholderList(defaultSkuIDCount)})`);
  }

  if (predicates.length === 0) {
    throw new ProductEmptyInListError(
      'productID',
      PRODUCT_SKUS_LABEL,
      'neither a product nor a default-sku predicate was requested, so the caller must short-circuit',
    );
  }

  return `SELECT
  ${SKU_READ_COLUMNS.map((columnName: string) => `s.${columnName}`).join(',\n  ')}
FROM SwSku s
WHERE ${predicates.join('\n  OR ')}`;
}

/**
 * Read the options of a set of SKUs across the `SwSkuOption` link table.
 *
 * CFML parity [model/entity/Sku.cfc:L76]: `options` is a many-to-many declared
 * `linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"`, with NO `orderby`. The
 * `INNER JOIN` is faithful: Hibernate's collection load joins the link table to the target table, and a
 * link row naming an option that does not exist contributes no element. No `ORDER BY` is added, for the
 * same reason as the SKU read.
 *
 * `so.skuID` is projected under its own label so each option can be attached to the SKU it belongs to
 * without a second statement per SKU. That is the explicit alternative to the ORM's implicit
 * per-collection load, and it is what makes the fetch shape a property of this method.
 *
 * ★ THE OPTION GROUP JOINS HERE, AND IT ADDS NO STATEMENT. `Option.optionGroup`
 * [model/entity/Option.cfc:L59] is a many-to-one on `optionGroupID`, and the join is a `LEFT OUTER`
 * one BECAUSE THAT COLUMN IS NULLABLE - the declaration carries no `notNull="true"`, so an option with
 * no group must answer `undefined` from {@link toOptionGroup} rather than vanish from the result set,
 * which an inner join would do. That distinction is load-bearing twice over:
 * `Product.getOptionGroups()` must not silently shorten a product's option-group list, and
 * `Sku.generateImageFileName()` [model/entity/Sku.cfc:L134] reproduces the source's UNGUARDED
 * dereference of the group - it can only do so if a group-less option actually reaches it.
 *
 * The group is materialized WITHOUT its own `options` collection, exactly as `mysqlSkuRepository.ts`
 * decides for the same join: populating it would load every option of every group these options belong
 * to, which no consumer of this read asks for, and would point each of those options straight back at
 * the same group. What the group is needed FOR is `imageGroupFlag` and `sortOrder`, both columns on its
 * own row.
 *
 * @param skuIDCount how many SKU identifiers will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `skuIDCount` is below one.
 */
function buildSkuOptionsSql(skuIDCount: number): string {
  return `SELECT
  so.skuID as link_skuID,
  ${OPTION_READ_COLUMNS.map((columnName: string) => `o.${columnName}`).join(',\n  ')},
  ${aliasedProjection('og', OPTION_GROUP_ALIAS_PREFIX, OPTION_GROUP_READ_COLUMNS)}
FROM SwSkuOption so
INNER JOIN SwOption o ON o.optionID = so.optionID
LEFT JOIN SwOptionGroup og ON og.optionGroupID = o.optionGroupID
WHERE so.skuID IN (${sqlPlaceholderList(skuIDCount)})`;
}

/**
 * Existence read for the product save path.
 *
 * ONE COLUMN, BECAUSE ONE COLUMN IS ALL THE DECISION NEEDS. The sibling
 * `mysqlProductTypeRepository.ts` reads the whole prior row because `ProductType.preUpdate(oldData)`
 * [model/entity/ProductType.cfc:L310-L313] declares an `oldData` argument that has to be supplied.
 * `model/entity/Product.cfc` DECLARES NO `preInsert`, NO `preUpdate` AND NO `preDelete` - verified by
 * reading the component end to end - so there is no hook to feed and nothing to compare against, and
 * projecting more columns than the decision consumes would imply a use that does not exist.
 */
const SELECT_PRODUCT_ID_SQL = 'SELECT productID FROM SwProduct WHERE productID = ?';

/**
 * Insert one product row.
 *
 * The emitted text is fixed and fully determined by {@link PRODUCT_INSERTED_COLUMNS}: `INSERT INTO
 * SwProduct (` then the twenty column names, one per line, then `) VALUES (` and twenty positional
 * placeholders. Twenty columns, twenty placeholders, twenty bound parameters, one ordered source.
 */
const INSERT_PRODUCT_SQL = `INSERT INTO SwProduct (
  ${PRODUCT_INSERTED_COLUMNS.join(',\n  ')}
) VALUES (${sqlPlaceholderList(PRODUCT_INSERTED_COLUMNS.length)})`;

/**
 * Update one product row, matched on its primary key.
 *
 * Seventeen SET assignments then the key, so EIGHTEEN parameters bind in that order and THE KEY IS
 * BOUND LAST. Positional binding makes the order part of the contract, which is why the parameter array
 * is assembled as "the projected SET values, then the key" in exactly one place.
 */
const UPDATE_PRODUCT_SQL = `UPDATE SwProduct
SET
  ${PRODUCT_UPDATED_COLUMNS.map((columnName: string) => `${columnName} = ?`).join(',\n  ')}
WHERE productID = ?`;

/**
 * Point a product row at its default SKU, once that SKU has a key.
 *
 * ★★ THIS STATEMENT EXISTS BECAUSE THE TWO FOREIGN KEYS POINT AT EACH OTHER. `SwSku.productID`
 * references `SwProduct` [model/entity/Sku.cfc:L65] and `SwProduct.defaultSkuID` references `SwSku`
 * [model/entity/Product.cfc:L70], so neither row can be written with its key already satisfied: the
 * product row has to exist before any SKU row may name it, and the SKU rows have to exist before the
 * product row may name one of them. Hibernate resolved exactly this by inserting the parent, inserting
 * the children, and then issuing a follow-up UPDATE for the parent's own foreign key. That follow-up is
 * this statement, and it runs inside the same transaction as the two inserts.
 *
 * ONE COLUMN, NOT A SECOND FULL UPDATE, AND THE AUDIT STAMPS ARE LEFT ALONE. The row was written
 * moments earlier in this same unit of work, so its `modifiedDateTime` already reports this write;
 * re-stamping it would report two modifications where the caller made one. Reusing
 * {@link UPDATE_PRODUCT_SQL} would also re-bind seventeen columns to settle one, and would re-read them
 * off an entity whose own state this cascade has already moved past.
 *
 * `defaultSkuID` binds first and the key binds last, matching the placeholder order.
 */
const UPDATE_PRODUCT_DEFAULT_SKU_SQL = 'UPDATE SwProduct SET defaultSkuID = ? WHERE productID = ?';

/**
 * Detach a product from its default SKU so that its SKU rows may be deleted.
 *
 * This is the SQL half of `arguments.product.setDefaultSku(javaCast("null", ""))`
 * [model/service/ProductService.cfc:L323]. It is not an optimisation and it is not optional: the two
 * foreign keys point at each other - `SwSku.productID` references `SwProduct`
 * [model/entity/Sku.cfc:L65] and `SwProduct.defaultSkuID` references `SwSku`
 * [model/entity/Product.cfc:L70] - so the SKU rows cannot go while the product row still names one of
 * them. It is the mirror of {@link UPDATE_PRODUCT_DEFAULT_SKU_SQL}, which settles the same column on the
 * way in.
 *
 * THE AUDIT STAMPS ARE LEFT ALONE, unlike the child detachment in the price-group adapter. There the
 * detached children SURVIVED the delete, so a modification stamp was owed to rows that would still be
 * read afterwards. Here the row being updated is deleted a few statements later in the same unit of
 * work, so stamping it would write a modification nobody can ever observe.
 */
const DETACH_PRODUCT_DEFAULT_SKU_SQL =
  'UPDATE SwProduct SET defaultSkuID = NULL WHERE productID = ?';

/**
 * The three link tables the product OWNS, whose rows go with it.
 *
 * `listingPages` -> `SwProductListingPage` [model/entity/Product.cfc:L79], `categories` ->
 * `SwProductCategory` [L80] and `relatedProducts` -> `SwRelatedProduct` [L81] are all declared
 * `fieldtype="many-to-many"` with `fkcolumn="productID"` and no `inverse="true"`, which makes this
 * product the OWNING side of each. Hibernate removed an owner's link rows when the owner was deleted -
 * that is not the `cascade` attribute doing it, which is why these three need no cascade declaration to
 * be in scope here. The far-side rows in `SwContent`, `SwCategory` and `SwProduct` are NOT touched: a
 * category does not cease to exist because a product left it.
 *
 * ⚠ `SwRelatedProduct` IS SELF-REFERENTIAL, AND ONLY THE OWNED HALF IS DELETED. Its two columns are
 * `productID` and `relatedProductID` [L81], so rows naming this product as SOMEONE ELSE'S related
 * product belong to that other product's collection, not to this one. Hibernate did not reach into
 * another owner's collection either, so if such a row exists the database refuses the delete and the
 * driver's error propagates. That refusal is parity, not a gap - see the note on {@link DELETE_PRODUCT_SQL}.
 */
const PRODUCT_OWNED_LINK_TABLES: readonly string[] = Object.freeze([
  'SwProductListingPage',
  'SwProductCategory',
  'SwRelatedProduct',
]);

/**
 * The seven INVERSE `many-to-many` link tables that name this product, in declaration order.
 *
 * ★ THIS LIST IS NOT A JUDGMENT CALL - IT IS TRANSCRIBED FROM THE ONE PLACE THE FRAMEWORK DEFINES IT.
 * `HibachiService.delete()` calls `arguments.entity.removeAllManyToManyRelationships()`
 * [org/Hibachi/HibachiService.cfc:L61] before it reaches the DAO, and that method
 * [org/Hibachi/HibachiEntity.cfc:L271-L284] loops EVERY property, selects the ones whose `fieldtype` is
 * `many-to-many` and whose `cascade` is absent or is none of `all-delete-orphan,delete,delete-orphan`,
 * and invokes `remove<singularname>` on each related entity. Its own hint at [L270] states the purpose in
 * as many words: "to make sure that all of the many-to-many relationships are removed so that it doesn't
 * violate fkconstrint".
 *
 * `model/entity/Product.cfc` declares exactly ten `many-to-many` properties - the three owner tables
 * above [model/entity/Product.cfc:L79-L81] and the seven inverse ones here [L84-L90] - and NOT ONE of
 * them declares a `cascade`, so the framework's predicate selects all ten. NO `inverse` TEST APPEARS IN
 * THAT LOOP, which is why the inverse half is cleaned here rather than left to its owning side: a row in
 * `SwPromoRewardProduct` that still names a deleted product is exactly the foreign-key violation [L270]
 * exists to prevent.
 *
 * EVERY ONE IS KEYED ON `productID`, verbatim from each property's `fkcolumn`, so the emitted statement
 * is `DELETE FROM <linktable> WHERE productID = ?` and the reverse iteration order of [L278] is
 * unobservable - a set of rows removed one at a time in any order is the same set removed by one
 * predicate.
 */
const PRODUCT_INVERSE_LINK_TABLES: readonly string[] = Object.freeze([
  'SwPromoRewardProduct',
  'SwPromoRewardExclProduct',
  'SwPromoQualProduct',
  'SwPromoQualExclProduct',
  'SwPriceGroupRateProduct',
  'SwVendorProduct',
  'SwPhysicalProduct',
]);

/**
 * The product's own one-to-many dependents, each declared `cascade="all-delete-orphan"`.
 *
 * `productImages` -> `SwImage` [model/entity/Product.cfc:L74, model/entity/Image.cfc:L61],
 * `attributeValues` -> `SwAttributeValue` [L75, model/entity/AttributeValue.cfc:L70] and
 * `productReviews` -> `SwProductReview` [L76, model/entity/ProductReview.cfc:L60]. All three key on
 * `productID`, and `all-delete-orphan` is exactly the declaration that made Hibernate delete them with
 * their parent.
 *
 * `skus` [L73] carries the same declaration but is deleted separately, because its own dependents have
 * to go first.
 */
const PRODUCT_DEPENDENT_TABLES: readonly string[] = Object.freeze([
  'SwImage',
  'SwAttributeValue',
  'SwProductReview',
]);

/** The physical table behind the `skus` collection [model/entity/Product.cfc:L73]. */
const SKU_TABLE_NAME = 'SwSku';

/**
 * Everything that hangs off a SKU, which the `skus` cascade reached transitively.
 *
 * `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73] deleted each SKU
 * entity, and deleting a SKU entity ran ITS OWN declarations in turn. Four are cascaded collections -
 * `alternateSkuCodes` -> `SwAlternateSkuCode` [model/entity/Sku.cfc:L69], `attributeValues` ->
 * `SwAttributeValue` [L70], `skuCurrencies` -> `SwSkuCurrency` [L72] and `stocks` -> `SwStock` [L73] -
 * and four are owned link tables that go with their owner: `options` -> `SwSkuOption` [L76],
 * `accessContents` -> `SwSkuAccessContent` [L77], `subscriptionBenefits` -> `SwSkuSubsBenefit` [L78]
 * and `renewalSubscriptionBenefits` -> `SwSkuRenewalSubsBenefit` [L79].
 *
 * ⚠ `orderItems` [model/entity/Sku.cfc:L71] IS ABSENT ON PURPOSE. It is the one SKU collection declared
 * with NO cascade, so Hibernate never deleted an order item to make room for a product delete - the
 * foreign key stood and the delete failed. Reproducing the absence is what keeps a sold SKU
 * undeletable; adding `SwOrderItem` here would silently destroy order history, and the order aggregate
 * is out of scope besides.
 *
 * ★ TWO SUBSCRIPTION-OWNED LINK TABLES APPEAR HERE, AND THAT IS NOT A SCOPE BREACH.
 * `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit` are LINK tables owned by `Sku` itself, not
 * subscription business logic: their rows exist only to join a SKU to a benefit, they carry no payload,
 * and deleting them is the SKU's own declaration [L78-L79] rather than anything the subscription module
 * decides. No `SwSubscriptionBenefit` row is touched.
 */
const SKU_DEPENDENT_TABLES: readonly string[] = Object.freeze([
  'SwAlternateSkuCode',
  'SwAttributeValue',
  'SwSkuCurrency',
  'SwStock',
  'SwSkuOption',
  'SwSkuAccessContent',
  'SwSkuSubsBenefit',
  'SwSkuRenewalSubsBenefit',
]);

/**
 * Delete every row of one table that names this product directly.
 *
 * One shared builder rather than a dozen hand-written constants, because the statement is the same
 * shape in every case and the table name is the only variable. The names come from frozen lists above,
 * never from a caller, so no identifier reaches this template from outside the module.
 *
 * @param tableName the physical table to delete from.
 * @returns a single-parameter DELETE keyed on `productID`.
 */
function buildDeleteByProductIdSql(tableName: string): string {
  return `DELETE FROM ${tableName} WHERE productID = ?`;
}

/**
 * Delete every row of one table that names any SKU of this product.
 *
 * The subquery is what replaces Hibernate's transitive walk. The ORM had every SKU of the product
 * loaded in the session and could delete each dependent by SKU key one row at a time; without a
 * session, naming the SKUs in a subquery reaches the same set in ONE statement per table instead of one
 * per table per SKU. MySQL permits a subquery over a DIFFERENT table than the delete target, which
 * `SwSku` always is here.
 *
 * It runs BEFORE `SwSku` itself is emptied, or the subquery would select nothing and the dependents
 * would survive as orphans.
 *
 * @param tableName the physical table to delete from.
 * @returns a single-parameter DELETE keyed on the product's SKUs.
 */
function buildDeleteBySkuOfProductSql(tableName: string): string {
  return `DELETE FROM ${tableName} WHERE skuID IN (SELECT skuID FROM ${SKU_TABLE_NAME} WHERE productID = ?)`;
}

/**
 * Delete one product row - the last statement of the cascade, not the whole of it.
 *
 * ★★ THIS DOC BLOCK ONCE OPENED "⚠⚠ THE HIBERNATE CASCADES ARE NOT REPRODUCED, AND THAT IS A
 * DELIBERATE, DOCUMENTED DECISION RATHER THAN AN OMISSION", AND THIS IS THE RECORD OF THAT CHANGE.
 * The old reasoning was: "Reproducing the cascade would mean four to six dependent DELETEs with NO
 * ENCLOSING TRANSACTION - `./connection.js` publishes `execute` and `executeMutation` and DELIBERATELY
 * publishes no transaction method... A half-applied multi-table cascade with no rollback leaves
 * orphaned SKUs and orphaned EAV rows behind and is strictly worse than a delete that either succeeds
 * or is refused."
 *
 * THE CONDITIONAL WAS SOUND AND ITS PREMISE IS NO LONGER TRUE. `./connection.js` now publishes
 * `transaction`, so the enclosing unit of work the old note said was unavailable is available, and with
 * it the rollback that made a half-applied cascade unacceptable. The old note's own conclusion
 * therefore inverts: with a transaction in hand, deleting the dependents is strictly better than
 * leaving them, because Hibernate deleted them and the schema's foreign keys otherwise refuse the
 * parent delete outright. The cascade is reproduced in {@link MysqlProductRepository.deleteProduct},
 * and the tables it walks are enumerated and cited on the four lists above.
 *
 * ⚠ AND THE OLD NOTE'S SECOND CLAIM WAS ALREADY FALSE WHEN IT WAS WRITTEN TWICE OVER: this file's own
 * `saveProduct` opens a transaction to cascade transient SKUs, and `./mysqlSkuRepository.js` opens one
 * to reconcile `SwSkuOption`. A reader who trusted this paragraph would have concluded the module had
 * no transactional capability while two of its write paths depended on one.
 *
 * ★ `attributeValues` WAS THE ONE THE PORT ASKED THIS FILE TO RECORD, AND THE OBLIGATION IS NOW
 * HONOURED ON THE DELETE PATH. `../../domain/ports/productRepository.js` states that "the unhonoured
 * `cascade="all-delete-orphan"` obligation on the non-ported `attributeValues` collections is recorded
 * in the repositories sibling, not here" - this is still that record, with the status changed. The EAV
 * READ path remains unported and no `SwAttributeValue` row is ever selected or written; what is now
 * reproduced is the DELETE, by `productID` [model/entity/Product.cfc:L75] and by `skuID`
 * [model/entity/Sku.cfc:L70], because those rows are unreachable orphans once their owner is gone and
 * the legacy removed them. The identical declaration on `ProductType.attributeValues`
 * [model/entity/ProductType.cfc:L67] and `Brand.attributeValues` [model/entity/Brand.cfc:L60] is still
 * UNHONOURED - neither entity has a ported delete path at all - so two of the four remain outstanding
 * rather than all four.
 *
 * WHAT STILL PROPAGATES RATHER THAN BEING SWALLOWED. A foreign key this cascade does not clear - an
 * order item on a SKU [model/entity/Sku.cfc:L71], or an inverse-side `SwRelatedProduct` row - makes
 * MySQL refuse the delete and the driver's error travels out through the rolled-back transaction. That
 * is parity: Hibernate raised a constraint violation in exactly those situations rather than reporting
 * a clean refusal.
 */
const DELETE_PRODUCT_SQL = 'DELETE FROM SwProduct WHERE productID = ?';

// ---------------------------------------------------------------------------
// Identifier minting
// ---------------------------------------------------------------------------

/**
 * Mint a persisted identifier.
 *
 * CFML parity [model/entity/Product.cfc:L52] and [model/entity/Brand.cfc:L52]: both keys declare
 * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`. Hibernate's
 * `uuid` generator produces a 32-character hexadecimal string with no hyphens, which is what
 * `length="32"` encodes, so the hyphens are stripped from `randomUUID()` rather than the column being
 * widened - B5 forbids a column change, and a 36-character value would not fit.
 *
 * ⚠ THE LEGACY BULK IMPORTER'S OWN `createUUID()` CALLS ARE NOT THE MODEL HERE. See exclusion note §8.6
 * below: [model/dao/ProductDAO.cfc:L223], [L248], [L275] and [L410] call the CFML engine's RAW
 * `createUUID()`, which returns a HYPHENATED 35-character value, rather than the framework's
 * `createSlatwallUUID()`. That inconsistency belongs to the excluded import path and is deliberately not
 * imported into the ported save path; this function follows the ENTITY's declared `generator="uuid"`
 * contract instead.
 *
 * `node:crypto`'s `randomUUID` is a cryptographically strong v4 generator from the standard library. No
 * dependency is added for it.
 *
 * @returns a 32-character lower-case hexadecimal identifier.
 */
function generatePersistedIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

// ---------------------------------------------------------------------------
// Hydration
//
// `exactOptionalPropertyTypes` is ON, so `{ urlTitle: undefined }` is NOT assignable to a member
// declared `urlTitle?: string` - an optional member may be ABSENT or a string, and explicitly
// `undefined` is neither. `ProductHydrationInput` and `SkuHydrationInput` both declare their optional
// members WITHOUT `| undefined`, so every optional value is assigned onto a mutable draft only when it
// has one. `Brand`, `ProductType` and `Option` declare theirs WITH `| undefined`, so those constructors
// take every value positionally in one literal. Both shapes are cast-free; the difference is the
// entity's own declaration and is not smoothed over here.
//
// Each draft type is DERIVED from the entity's own input type, so the two cannot drift.
// ---------------------------------------------------------------------------

/** A mutable draft of {@link ProductHydrationInput}. */
type ProductHydrationDraft = {
  -readonly [K in keyof ProductHydrationInput]: ProductHydrationInput[K];
};

/** A mutable draft of {@link SkuHydrationInput}. */
type SkuHydrationDraft = {
  -readonly [K in keyof SkuHydrationInput]: SkuHydrationInput[K];
};

/** A mutable draft of the port's read projection. */
type AttributeSetSummaryDraft = {
  -readonly [K in keyof AttributeSetSummary]: AttributeSetSummary[K];
};

/**
 * Every SKU one graph read needs, indexed the TWO ways that read consumes it.
 *
 * ONE STATEMENT, TWO INDEXES, AND THE SECOND INDEX IS NOT A CONVENIENCE. `SwProduct.defaultSkuID`
 * [model/entity/Product.cfc:L70] is a many-to-one that is NOT constrained to point inside
 * `Product.skus` - the legacy mapping declares the collection at L73 and the reference at L70
 * independently - so a default SKU may legitimately be a SKU of some other product, or of no product at
 * all. The SKU statement therefore binds `productID IN (...) OR skuID IN (...)`, and the rows it returns
 * have to be reachable BOTH by owning product (to populate `skus`) and by identifier (to resolve
 * `defaultSku`). Keeping one index and deriving the other would silently re-impose a containment rule
 * the schema does not state.
 *
 * T3, and this is the fetch-shape consequence: `byProductID` carries ONLY the SKUs whose `productID`
 * matched, so a default SKU belonging elsewhere appears in `bySkuID` and NOT in the owning product's
 * collection - which is exactly the shape Hibernate produced from those two independent mappings.
 *
 * `Map` rather than a plain object, because SKU and product identifiers are opaque persisted strings:
 * `Map` cannot collide with `Object.prototype` keys and needs no null-prototype ceremony to be safe.
 * Read-only at the boundary so that {@link MysqlProductRepository.buildProduct} can look SKUs up but
 * cannot mutate what a sibling row will read next.
 */
type MaterializedSkus = {
  /** The SKUs of each requested product, in the order the SKU statement returned them. */
  readonly byProductID: ReadonlyMap<string, Sku[]>;
  /** Every SKU the statement returned, by identifier, including default SKUs owned elsewhere. */
  readonly bySkuID: ReadonlyMap<string, Sku>;
};

/**
 * The collaborator ports this adapter forwards into every entity it hydrates.
 *
 * T2, SERVICE-LOCATOR REMOVAL. The legacy entity resolves collaborators by NAME at the point of use -
 * `getService("optionService")` at [model/entity/Product.cfc:L341], `getService("productService")` at
 * [L367] and `getService("promotionService")` at [L519] - and each of those becomes a typed port the
 * entity is CONSTRUCTED with. This adapter is the construction site, so it is where they have to be
 * supplied: leaving the entity to reach for them is the very thing T2 removes.
 *
 * ★ `productRepository` IS NOT IN THIS BAG, because this instance IS it. `Product`'s `productRepository`
 * slot is satisfied with `this`, which is exactly what [model/entity/Product.cfc:L367] reached for by
 * name. Nothing is cached across the boundary; the entity memoises on itself and entities are
 * request-scoped.
 *
 * // JUDGMENT CALL: the bag is a SECOND constructor parameter defaulting to `{}`, matching
 * // `mysqlSkuRepository.ts` and `mysqlProductTypeRepository.ts`. The default is what lets a SQL-shape
 * // test construct this class with a capturing executor alone, which is the whole point of §0.8's
 * // injected-executor mandate. Its effect on behaviour is precise and bounded, and each absence is
 * // documented at the entity method that notices it - `getProductURL()` and `getBaseProductType()`
 * // need the settings provider, `getUnusedProductOptions()` needs the option repository,
 * // `getSkusBySelectedOptions()` needs the SKU repository, and each raises its own documented error
 * // when its port is absent rather than substituting a plausible answer.
 *
 * The real wiring happens once, in `src/handlers/bootstrap.ts` - the composition root that replaced
 * DI/1's convention scan (T1). This type is the shape that root must satisfy.
 */
type ProductHydrationCollaborators = Readonly<
  Pick<
    ProductHydrationInput,
    'settingsProvider' | 'skuRepository' | 'optionRepository' | 'subscriptionTermProvider'
  >
>;

/**
 * The one write capability this adapter borrows from its SKU sibling, to reproduce
 * `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73].
 *
 * ★★ WHY A DEDICATED CONTRACT RATHER THAN THE `SkuRepository` PORT THIS CLASS ALREADY HOLDS.
 * {@link ProductHydrationCollaborators} already carries a `skuRepository`, and `SkuRepository.saveSku`
 * already persists a SKU together with its `SwSkuOption` membership - so it looks like the cascade could
 * simply call it. It cannot, for two reasons that are both invisible at the call site:
 *
 *   1. `saveSku(sku)` reaches the executor IT was constructed with. Calling it from inside this
 *      adapter's transaction would send the SKU inserts down a DIFFERENT connection, where they commit
 *      independently - so a SKU could survive a product insert that rolled back. The compiler cannot
 *      catch that, which is exactly why the executor is a parameter here.
 *   2. `SwSku.productID` cannot be read off the draft's own association on the creation path. A product
 *      being INSERTED has no identifier until its row is written, and `createSkus`
 *      [model/service/SkuService.cfc:L100, L128] links every draft to the pre-save instance, so the
 *      association would bind the empty string into a foreign key. The parent's key has to be handed
 *      down, which is what Hibernate did once the parent insert had run.
 *
 * DECLARED HERE RATHER THAN IN `src/domain/ports/`, AND THAT PLACEMENT IS FORCED. The contract mentions
 * `PreparedStatementExecutor`, which is a repositories-layer type; a port that named it would make
 * `src/domain/**` import `src/repositories/**`, which the ESLint layer boundary refuses outright. It is a
 * seam between two adapters, so it lives with the adapters. `MysqlSkuRepository.saveSkuForProduct`
 * satisfies it; the composition root supplies that instance.
 */
export interface ProductSkuCascadeWriter {
  /**
   * Persist one SKU as part of an enclosing product write.
   *
   * @param sku the SKU to persist - transient on the creation path.
   * @param productID the parent product's persisted identifier, to bind as `SwSku.productID`.
   * @param executor the enclosing transaction's statement sink.
   * @returns the persisted SKU, carrying the key that was written.
   */
  saveSkuForProduct(sku: Sku, productID: string, executor: PreparedStatementExecutor): Promise<Sku>;
}

/**
 * What an aggregate write asks the cascade to do, gathered once so the row-writing methods take ONE
 * extra parameter rather than three.
 *
 * Its presence is also the signal that the write is running inside a transaction: `tx` IS the
 * transaction-bound executor, so a method holding a plan must route every statement through
 * `plan.tx` and never through `this.executor`.
 */
type SkuCascadePlan = {
  /** The SKUs on the product that have never been persisted, in the collection's own order. */
  readonly transientSkus: readonly Sku[];
  /** The sibling adapter that writes a SKU row and its option membership. */
  readonly writer: ProductSkuCascadeWriter;
  /** The enclosing transaction's statement sink. */
  readonly tx: PreparedStatementExecutor;
};

/**
 * What the cascade produced, so the returned product can report the aggregate that was actually
 * written rather than the drafts it was built from.
 */
type PersistedSkuCascade = {
  /**
   * The product's full SKU collection IN ITS ORIGINAL ORDER, with each persisted draft replaced by the
   * instance that carries its minted key. Order matters: `createSkus` derives every skuCode from this
   * array's length as it grows [model/service/SkuService.cfc:L97], so a reordered collection reports a
   * numbering the rows do not have.
   */
  readonly skus: Sku[];
  /** The designated default SKU, replaced the same way, or `undefined` when none was designated. */
  readonly defaultSku: Sku | undefined;
};

/**
 * Build one attribute-set read projection from its row.
 *
 * NOT ENTITY HYDRATION, and deliberately so. `AttributeSet` is not one of the eighteen in-scope
 * entities, no entity module exists to construct, and `AttributeSetSummary` is declared on the port as
 * a read projection that "must never gain behaviour". So this is a flat mapper, it materializes NO
 * association, and it injects NO port. T3: the fetch shape of this method is "these ten labels and
 * nothing reachable through them" - the `attributes` collection [model/entity/AttributeSet.cfc:L67] is
 * represented by its COUNT alone, and the four many-to-many collections [L70-L73] are not read at all.
 *
 * ★ THE ONE PLACE THIS FILE CALLS `cfBoolean()` ITSELF. Every other boolean is handed to an entity
 * uncoerced, because the entity holds the declared default that disambiguates NULL - see
 * {@link readFlag}. Here there is no entity, and the port declares `globalFlag: boolean` and
 * `activeFlag?: boolean` / `requiredFlag?: boolean`, so the coercion has nowhere else to happen and
 * `cfBoolean()` is the single sanctioned funnel for it. `Boolean(x)`, `!!x` and `x === 1` are forbidden
 * and appear nowhere.
 *
 * ⚠ `globalFlag` DECLARES `default="1"` [model/entity/AttributeSet.cfc:L57] AND THAT DEFAULT IS NOT
 * APPLIED HERE. A Hibachi `default` is an INSERT-time property default applied by
 * `HibachiEntity`'s populate path, not a read-time coalesce: the legacy `getGlobalFlag()` on a row whose
 * column is NULL returned null, and CFML evaluated that as false. `cfBoolean(undefined)` returns false,
 * which is that answer exactly. Coalescing to true here would report a value the legacy never reported.
 * A NULL-flagged row is reachable in the product-type arm, whose predicate is satisfied by the
 * assignment branch rather than by the flag.
 *
 * The two nullable flags are OMITTED rather than defaulted when their column is NULL, because the port
 * declares them optional precisely so that "the legacy had no value here" stays expressible - and
 * `activeFlag?: boolean` without `| undefined` cannot be assigned an explicit `undefined`.
 *
 * @param row one row of either attribute-set statement.
 * @param statementLabel which arm produced it.
 * @returns the projection.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toAttributeSetSummary(row: SqlRow, statementLabel: string): AttributeSetSummary {
  const draft: AttributeSetSummaryDraft = {
    attributeSetID: readIdentifier(row, 'attributeSetID', statementLabel),
    attributeSetTypeSystemCode: readIdentifier(row, 'attributeSetTypeSystemCode', statementLabel),
    globalFlag: cfBoolean(readFlag(row, 'globalFlag', statementLabel)),
    attributeCount: readCount(row, 'attributeCount', statementLabel),
  };

  const attributeSetName = readOptionalText(row, 'attributeSetName', statementLabel);
  if (attributeSetName !== undefined) {
    draft.attributeSetName = attributeSetName;
  }

  const attributeSetCode = readOptionalText(row, 'attributeSetCode', statementLabel);
  if (attributeSetCode !== undefined) {
    draft.attributeSetCode = attributeSetCode;
  }

  const attributeSetDescription = readOptionalText(row, 'attributeSetDescription', statementLabel);
  if (attributeSetDescription !== undefined) {
    draft.attributeSetDescription = attributeSetDescription;
  }

  const activeFlag = readFlag(row, 'activeFlag', statementLabel);
  if (activeFlag !== undefined) {
    draft.activeFlag = cfBoolean(activeFlag);
  }

  const requiredFlag = readFlag(row, 'requiredFlag', statementLabel);
  if (requiredFlag !== undefined) {
    draft.requiredFlag = cfBoolean(requiredFlag);
  }

  const sortOrder = readOptionalCount(row, 'sortOrder', statementLabel);
  if (sortOrder !== undefined) {
    draft.sortOrder = sortOrder;
  }

  return draft;
}

/**
 * Build the joined `OptionGroup` for one option row, or report that the option has none.
 *
 * The group arrives through the LEFT OUTER JOIN on the option read rather than through a second
 * statement - see {@link buildSkuOptionsSql} - and the join's outer-ness is what lets this answer
 * `undefined` for an option whose nullable `optionGroupID` [model/entity/Option.cfc:L59] is NULL,
 * instead of that option disappearing from the result set entirely.
 *
 * FETCH SHAPE (T3): the group carries an EMPTY `options` array, and that means "this read did not
 * materialize them", never "the group has none". The reasoning is `mysqlSkuRepository.ts`'s verbatim,
 * and it is the same decision so that an `OptionGroup` reached through a product and one reached
 * through a SKU are the same shape.
 *
 * `imageGroupFlag` is handed over UNCOERCED, for the reason {@link readFlag} gives:
 * `src/domain/entities/optionGroup.ts` calls `cfBoolean()` on it, and its declared `default="0"`
 * [model/entity/OptionGroup.cfc:L57] belongs in the file that declares it.
 *
 * `optionSortTieBreaker` is passed as an explicit `undefined`, which the entity's constructor reads as
 * "use the legacy random source". It is a required member of that constructor's parameter type, so
 * omitting it would not compile; passing `undefined` is how the default is requested rather than
 * overridden.
 *
 * @param row one row of the SKU option read.
 * @param statementLabel the statement that produced it.
 * @returns the group, or `undefined` when the option has none.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed, or when
 *   the joined group's `sortOrder` is NULL where the schema declares it required.
 */
function toOptionGroup(row: SqlRow, statementLabel: string): OptionGroup | undefined {
  const optionGroupID = readOptionalText(
    row,
    `${OPTION_GROUP_ALIAS_PREFIX}optionGroupID`,
    statementLabel,
  );

  if (optionGroupID === undefined) {
    return undefined;
  }

  // `SwOptionGroup.sortOrder` is `required="true"` [model/entity/OptionGroup.cfc:L58] and
  // `src/domain/entities/optionGroup.ts` types its slot as a bare `number` in consequence. The group
  // row provably exists by this point - its key was read above - so a NULL here is a schema violation
  // rather than the absent-group case, and reporting it beats substituting a zero that would silently
  // become the most significant term of the odometer's place-value weighting.
  const optionGroupSortOrder = readOptionalCount(
    row,
    `${OPTION_GROUP_ALIAS_PREFIX}sortOrder`,
    statementLabel,
  );
  if (optionGroupSortOrder === undefined) {
    throw new ProductColumnError(
      `${OPTION_GROUP_ALIAS_PREFIX}sortOrder`,
      statementLabel,
      'the joined option group carries a NULL sortOrder where [model/entity/OptionGroup.cfc:L58] declares it required="true"',
    );
  }

  return new OptionGroup({
    optionGroupID,
    optionGroupName: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupName`,
      statementLabel,
    ),
    optionGroupCode: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupCode`,
      statementLabel,
    ),
    optionGroupImage: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupImage`,
      statementLabel,
    ),
    optionGroupDescription: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupDescription`,
      statementLabel,
    ),
    imageGroupFlag: readFlag(row, `${OPTION_GROUP_ALIAS_PREFIX}imageGroupFlag`, statementLabel),
    sortOrder: optionGroupSortOrder,
    remoteID: readOptionalText(row, `${OPTION_GROUP_ALIAS_PREFIX}remoteID`, statementLabel),
    createdDateTime: readTimestamp(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}createdDateTime`,
      statementLabel,
    ),
    createdByAccountID: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}createdByAccountID`,
      statementLabel,
    ),
    modifiedDateTime: readTimestamp(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}modifiedDateTime`,
      statementLabel,
    ),
    modifiedByAccountID: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}modifiedByAccountID`,
      statementLabel,
    ),
    options: [],
    optionSortTieBreaker: undefined,
  });
}

/**
 * Build one `Option` from a row of the SKU-option read.
 *
 * `Option`'s constructor declares eleven slots as REQUIRED-PRESENT with a `| undefined` type, so every
 * one is passed explicitly and none may be omitted - the opposite of the product and SKU drafts above,
 * and the entity's own declaration is what decides which shape applies.
 *
 * `optionGroup` CARRIES THE JOINED GROUP, resolved by {@link toOptionGroup} out of the columns the LEFT
 * OUTER JOIN in {@link buildSkuOptionsSql} projects alongside the option. An earlier revision passed an
 * unconditional `undefined` here and directed a consumer that needed option groups to
 * `skuRepository.getProductSkus(...)` instead; {@link OPTION_READ_COLUMNS} records why that boundary did
 * not hold. `undefined` still reaches the entity for an option whose nullable `optionGroupID`
 * [model/entity/Option.cfc:L59] is NULL, and there it means "this option has no group" rather than "this
 * read did not materialize one". `images`, `skus` and the four promotion collections are omitted so the
 * entity applies its own `[]` defaults - CFML parity, since an unpopulated one-to-many read as an empty
 * array under Hibernate and never as null.
 *
 * @param row one row of the SKU-option read.
 * @param statementLabel the statement that produced it.
 * @returns the option.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed, or when
 *   the joined option group carries a NULL `sortOrder`.
 */
function toOption(row: SqlRow, statementLabel: string): Option {
  return new Option({
    optionID: readIdentifier(row, 'optionID', statementLabel),
    optionCode: readOptionalText(row, 'optionCode', statementLabel),
    optionName: readOptionalText(row, 'optionName', statementLabel),
    optionDescription: readOptionalText(row, 'optionDescription', statementLabel),
    sortOrder: readOptionalCount(row, 'sortOrder', statementLabel),
    optionGroup: toOptionGroup(row, statementLabel),
    defaultImageID: readOptionalText(row, 'defaultImageID', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * Reduce one product's SKUs to the DISTINCT option groups reachable through their options, ordered by
 * `sortOrder` ascending.
 *
 * ★ THIS IS THE FETCH SHAPE `src/domain/entities/product.ts` NAMES AS THE ONE THE REPOSITORY OWES.
 * `Product.getOptionGroups()` [model/entity/Product.cfc:L251-L261] resolved it through a
 * `HibachiSmartList` - `setSelectDistinctFlag(1)` at [L255], `addFilter("options.skus.product.productID",
 * getProductID())` at [L256], `addOrder("sortOrder|ASC")` at [L257] - and the smart list is a framework
 * artefact the plan explicitly declines to clone (AAP 0.6.2). The ported accessor is therefore a
 * SYNCHRONOUS read over an eagerly-materialized array, and this function is what materializes it. Until
 * it did, that accessor raised on every product this adapter returned, and `getOptionGroupsStruct()` and
 * `getOptionGroupCount()` raised with it - which is what made the whole trio unusable, and with it the
 * `minCollection:1` rules in `model/validation/Product.json` that read through them.
 *
 * ALL THREE PARTS OF THE SMART-LIST CONFIGURATION ARE REPRODUCED, and none is added on top:
 *
 *   * DISTINCT [L255] becomes the `optionGroupID`-keyed map. One option group is normally carried by
 *     several options and several SKUs of the same product, so without it the array would repeat.
 *   * THE TRAVERSAL [L256] is `options.skus.product.productID`, which reaches THROUGH options and SKUs:
 *     a group belongs to this product only transitively. That is why the input is the product's OWN SKUs
 *     - `MaterializedSkus.byProductID`, not `bySkuID` - because a default SKU owned by some other product
 *     is reachable by identifier but does NOT satisfy `skus.product.productID = <this product>`, and
 *     feeding it in would attribute another product's option groups to this one.
 *   * ORDER BY `sortOrder` ASC [L257] becomes the numeric sort. `SwOptionGroup.sortOrder` is
 *     `required="true"` [model/entity/OptionGroup.cfc:L58] so the comparison never meets a NULL, and
 *     {@link toOptionGroup} refuses the row rather than substituting a zero if the database holds one
 *     anyway.
 *
 * ⚠ TIES ARE LEFT WHERE THE SOURCE LEFT THEM. The smart list orders on `sortOrder` alone and adds no
 * tie-breaker, so two groups sharing a `sortOrder` came back in whatever order the database chose.
 * `Array.prototype.sort` is stable, so this preserves the encounter order of the option read for ties
 * rather than imposing a secondary key the legacy never had.
 *
 * IT ADDS NO STATEMENT. The groups arrive on the option rows through the LEFT OUTER JOIN in
 * {@link buildSkuOptionsSql}, so the graph read remains THREE statements: product graph, SKUs, SKU
 * options. An option whose `optionGroupID` is NULL contributes nothing here and still reaches its SKU -
 * which is the outer join's second purpose, recorded at {@link toOptionGroup}.
 *
 * @param skus this product's own SKUs, each with its options already materialized.
 * @returns the distinct option groups, ordered by `sortOrder` ascending.
 */
function deriveProductOptionGroups(skus: readonly Sku[]): OptionGroup[] {
  const byOptionGroupID = new Map<string, OptionGroup>();

  for (const sku of skus) {
    for (const option of sku.getOptions()) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        continue;
      }

      const optionGroupID = optionGroup.getOptionGroupID();
      if (!byOptionGroupID.has(optionGroupID)) {
        byOptionGroupID.set(optionGroupID, optionGroup);
      }
    }
  }

  return [...byOptionGroupID.values()].sort(
    (left: OptionGroup, right: OptionGroup): number => left.getSortOrder() - right.getSortOrder(),
  );
}

/**
 * Build one `Sku` from its row plus its already-materialized options.
 *
 * T3, FETCH SHAPE: `options` is materialized on every SKU this module returns, because the port requires
 * a returned `Product` to carry its `options` populated and a SKU is where they hang. Everything else on
 * the SKU is deliberately NOT materialized, and each omission has a reason rather than a shrug:
 *
 *   * `skuCurrencies` [model/entity/Sku.cfc:L72] - `src/domain/entities/skuCurrency.ts` is not among this
 *     file's declared dependencies, so no `SkuCurrency` can be constructed here. The consequence is
 *     precise: with no currency detail materialized, `Sku.getCurrencyDetails()` answers `{}` and every
 *     per-currency accessor answers `undefined`. That is NOT a target-only degraded mode - it is exactly
 *     the state the legacy reaches whenever the eligibility gate at [model/entity/Sku.cfc:L373] closes.
 *     A consumer that needs per-currency prices must reach SKUs through `skuRepository`, the adapter
 *     that owns `SwSkuCurrency`.
 *   * `orderItems` [model/entity/Sku.cfc:L71] declares `lazy="extra"` and must not be initialized at all.
 *   * `alternateSkuCodes`, `attributeValues`, `stocks` and the four many-to-many collections serve
 *     subsystems outside this slice.
 *
 * The three money columns are handed over as `undefined` when NULL and the ENTITY substitutes zero,
 * because `listPrice`, `price` and `renewalPrice` each declare `default="0"`
 * [model/entity/Sku.cfc:L55-L57] and a declared default belongs in the file that declares it. Both
 * booleans are handed over UNCOERCED for the reason {@link readFlag} gives - only the entity can resolve
 * a NULL `activeFlag` to TRUE per its `default="1"` [L53] while resolving a NULL `userDefinedPriceFlag`
 * to false per its `default="0"` [L59].
 *
 * `isNew` IS NOT SET, so the entity's own default of `false` applies: a row read from the database is by
 * definition persisted.
 *
 * @param row one row of the SKU read.
 * @param statementLabel the statement that produced it.
 * @param options the options of this SKU, already materialized.
 * @param collaborators the ports to forward; only the two whose types the SKU shares are forwarded.
 * @returns the SKU.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toSku(
  row: SqlRow,
  statementLabel: string,
  options: Option[],
  collaborators: ProductHydrationCollaborators,
): Sku {
  const draft: SkuHydrationDraft = {
    skuID: readIdentifier(row, 'skuID', statementLabel),
    activeFlag: readFlag(row, 'activeFlag', statementLabel),
    userDefinedPriceFlag: readFlag(row, 'userDefinedPriceFlag', statementLabel),
    options,
  };

  const skuCode = readOptionalText(row, 'skuCode', statementLabel);
  if (skuCode !== undefined) {
    draft.skuCode = skuCode;
  }

  const listPrice = readMoney(row, 'listPrice', statementLabel);
  if (listPrice !== undefined) {
    draft.listPrice = listPrice;
  }

  const price = readMoney(row, 'price', statementLabel);
  if (price !== undefined) {
    draft.price = price;
  }

  const renewalPrice = readMoney(row, 'renewalPrice', statementLabel);
  if (renewalPrice !== undefined) {
    draft.renewalPrice = renewalPrice;
  }

  const imageFile = readOptionalText(row, 'imageFile', statementLabel);
  if (imageFile !== undefined) {
    draft.imageFile = imageFile;
  }

  const calculatedQATS = readOptionalCount(row, 'calculatedQATS', statementLabel);
  if (calculatedQATS !== undefined) {
    draft.calculatedQATS = calculatedQATS;
  }

  const subscriptionTermID = readOptionalText(row, 'subscriptionTermID', statementLabel);
  if (subscriptionTermID !== undefined) {
    draft.subscriptionTermID = subscriptionTermID;
  }

  const remoteID = readOptionalText(row, 'remoteID', statementLabel);
  if (remoteID !== undefined) {
    draft.remoteID = remoteID;
  }

  const createdDateTime = readTimestamp(row, 'createdDateTime', statementLabel);
  if (createdDateTime !== undefined) {
    draft.createdDateTime = createdDateTime;
  }

  const createdByAccountID = readOptionalText(row, 'createdByAccountID', statementLabel);
  if (createdByAccountID !== undefined) {
    draft.createdByAccountID = createdByAccountID;
  }

  const modifiedDateTime = readTimestamp(row, 'modifiedDateTime', statementLabel);
  if (modifiedDateTime !== undefined) {
    draft.modifiedDateTime = modifiedDateTime;
  }

  const modifiedByAccountID = readOptionalText(row, 'modifiedByAccountID', statementLabel);
  if (modifiedByAccountID !== undefined) {
    draft.modifiedByAccountID = modifiedByAccountID;
  }

  // The two ports whose declared types `SkuHydrationInput` shares with `ProductHydrationInput`. The
  // currency converter and the price-group resolver are NOT among this adapter's collaborators, which is
  // why the currency cascade is not materialized above.
  if (collaborators.settingsProvider !== undefined) {
    draft.settingsProvider = collaborators.settingsProvider;
  }

  if (collaborators.skuRepository !== undefined) {
    draft.skuRepository = collaborators.skuRepository;
  }

  return new Sku(draft);
}

/**
 * Build one `Brand` from the `b_`-prefixed half of a product graph row.
 *
 * `Brand`'s constructor declares every slot `?: T | undefined`, so the whole record is passed in one
 * literal and no draft is needed. `products` is deliberately OMITTED so the entity applies its own `[]`
 * default - which is exactly what `meta/tests/unit/entity/BrandTest.cfc`'s `defaults_are_correct()`
 * asserts, the only legacy test assertion that touches this table.
 *
 * T3: NO association is materialized on a brand reached through a product. Populating `products` would
 * present the one product that happened to be read as though it were the brand's complete product set,
 * and a caller cannot tell a partially populated collection from a complete one. An empty collection is
 * at least unambiguous.
 *
 * @param row one product graph row.
 * @param statementLabel the statement that produced it.
 * @returns the brand.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toBrandFromGraphRow(row: SqlRow, statementLabel: string): Brand {
  return new Brand({
    brandID: readIdentifier(row, 'b_brandID', statementLabel),
    activeFlag: readFlag(row, 'b_activeFlag', statementLabel),
    publishedFlag: readFlag(row, 'b_publishedFlag', statementLabel),
    urlTitle: readOptionalText(row, 'b_urlTitle', statementLabel),
    brandName: readOptionalText(row, 'b_brandName', statementLabel),
    brandWebsite: readOptionalText(row, 'b_brandWebsite', statementLabel),
    remoteID: readOptionalText(row, 'b_remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'b_createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'b_createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'b_modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'b_modifiedByAccountID', statementLabel),
  });
}

/**
 * Build one `ProductType` from the `pt_`-prefixed half of a product graph row.
 *
 * `productTypeIDPath` is passed through as read and is NEITHER computed NOR maintained here.
 * `ProductType` declares `preInsert` [model/entity/ProductType.cfc:L305] and `preUpdate` [L310] hooks
 * that maintain it, and `mysqlProductTypeRepository.ts` is the adapter that invokes them. This module
 * never writes `SwProductType`.
 *
 * ⚠ `products` [model/entity/ProductType.cfc:L66] declares `lazy="extra"` and is NOT materialized - see
 * {@link PRODUCT_GRAPH_PROJECTION}. `parentProductType` is likewise not materialized: walking the parent
 * chain from a product read would issue an unbounded number of statements up an arbitrarily deep tree,
 * and the ONE consumer that needs the chain, `Product.getBaseProductType()`, goes through
 * `settingsProvider` and the product-type repository rather than through this association. The
 * materialized `productTypeIDPath` is the whole ancestry as a value, so the path-based consumers need no
 * traversal at all.
 *
 * @param row one product graph row.
 * @param statementLabel the statement that produced it.
 * @returns the product type.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toProductTypeFromGraphRow(row: SqlRow, statementLabel: string): ProductType {
  return new ProductType({
    productTypeID: readIdentifier(row, 'pt_productTypeID', statementLabel),
    productTypeIDPath: readOptionalText(row, 'pt_productTypeIDPath', statementLabel),
    activeFlag: readFlag(row, 'pt_activeFlag', statementLabel),
    publishedFlag: readFlag(row, 'pt_publishedFlag', statementLabel),
    urlTitle: readOptionalText(row, 'pt_urlTitle', statementLabel),
    productTypeName: readOptionalText(row, 'pt_productTypeName', statementLabel),
    productTypeDescription: readOptionalText(row, 'pt_productTypeDescription', statementLabel),
    systemCode: readOptionalText(row, 'pt_systemCode', statementLabel),
    parentProductType: undefined,
    remoteID: readOptionalText(row, 'pt_remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'pt_createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'pt_createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'pt_modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'pt_modifiedByAccountID', statementLabel),
  });
}

// ---------------------------------------------------------------------------
// The write path - materializing a row, and rebuilding the entity that was written
//
// Hibernate did all four of these jobs invisibly. It read the entity's properties, translated the three
// many-to-one associations into their foreign-key columns, issued the statement, and then handed back an
// instance whose identifier had been filled in. With the ORM gone each step is a named function, and each
// one is deliberately SEPARATE from the statement that consumes it: the record is built first, as one
// flat inspectable object keyed by physical column, and only then projected onto an ordered column list
// by `toBoundParameters`. That separation is what lets a SQL-shape test assert the emitted parameter
// array without a database, and it is what keeps the column order in exactly one place per statement.
//
// E4 THROUGHOUT: the single money column on either table crosses the wire as a decimal STRING through
// `toBindableMoney`, and no monetary value is ever handed to `Number()` or arithmetic on the way out any
// more than it is on the way in.
//
// E6: nothing here reads an environment variable, names a datasource, or handles a credential. Contrast
// the excluded `saveImportData` [model/dao/ProductDAO.cfc:L328-L417], which wired its own datasource,
// username and password inside a DAO - see the consolidated exclusion notes at the end of this module.
// ---------------------------------------------------------------------------

/**
 * The key to bind into `SwProduct.defaultSkuID`, or `undefined` when there is none to bind YET.
 *
 * ★ A TRANSIENT DEFAULT SKU BINDS SQL NULL RATHER THAN THE KEY IT IS CARRYING, AND THE DIFFERENCE IS THE
 * WHOLE POINT. A designation made in memory is what [model/service/SkuService.cfc:L102, L134] make,
 * before either row exists, so the identifier the designated SKU reports at that moment names nothing.
 * NULL is the honest intermediate state, and {@link UPDATE_PRODUCT_DEFAULT_SKU_SQL} supplies the key that
 * was ACTUALLY written later in the same transaction.
 *
 * ★★ QUOTE-THEN-REVISE, AND THE REVISION MAKES THE HAZARD WORSE THAN THE VERSION IT REPLACES. The
 * paragraph above read: "`isNew()` is `getSkuID() === ''` [model/entity/Sku.cfc:L52 `unsavedvalue=""`],
 * so a designation made in memory would otherwise write `''` into a foreign-key column: a value that
 * satisfies no constraint and names no row". The LEGACY predicate is precisely that - `getNewFlag()`
 * [org/Hibachi/HibachiEntity.cfc:L571-L576] is `getPrimaryIDValue() == ""` and `isNew()` [L707-L709] is
 * its deprecated alias - but the PORTED `Sku` does not test its identifier at all. `Sku.isNew()` reads a
 * constructor-supplied flag, because `skuService.createSkus` mints a PROVISIONAL 32-hex key for every
 * draft it builds so that draft is addressable in memory before any row exists. The value this function
 * would otherwise bind is therefore not `''`: it is a well-formed identifier that
 * `mysqlSkuRepository.insertSku` DISCARDS - that method mints its own key and rehydrates the SKU around
 * it - and which consequently names no `SwSku` row. That is strictly worse than the empty string. `''`
 * is visibly wrong the moment anyone looks at the column, while a well-formed key resolving to nothing
 * is a dangling foreign key that reads as correct. The guard is unchanged; only the reason it is
 * load-bearing is.
 *
 * ⚠ THIS DOES NOT SOFTEN {@link MysqlProductRepository.assertAssociationsPersisted}. A transient default
 * SKU is still REFUSED unless the enclosing write is going to persist it, which is decided there, on the
 * evidence of the product's own SKU collection. This function is only reached once that decision has been
 * made in the caller's favour.
 *
 * @param defaultSku the designated default SKU, if any.
 * @returns its identifier, or `undefined` when it is absent or not yet persisted.
 */
function resolvePersistedDefaultSkuKey(defaultSku: Sku | undefined): string | undefined {
  if (defaultSku === undefined || defaultSku.isNew()) {
    return undefined;
  }

  return defaultSku.getSkuID();
}

/**
 * Materialize the `SwProduct` row a save is about to write.
 *
 * ★ THE THREE FOREIGN KEYS ARE READ OUT OF THE ASSOCIATIONS, NOT OFF THE ENTITY. `Product` publishes
 * `getBrand()`, `getProductType()` and `getDefaultSku()` and publishes NO `brandID`, `productTypeID` or
 * `defaultSkuID` accessor - deliberately, because the legacy declared those columns as `fkcolumn` on
 * many-to-one properties [model/entity/Product.cfc:L68-L70] and never as properties in their own right.
 * So the key is the associated entity's identifier, or SQL NULL when there is no association.
 *
 * ★ QUOTE-THEN-REVISE ON THE TRANSIENT CASE, WHICH IS NOW UNIFORM FOR TWO OF THE THREE AND DELIBERATE
 * FOR THE THIRD. This paragraph used to continue: "The transient case - an association that exists but
 * has never been persisted, whose identifier is therefore the empty string - is refused BEFORE this
 * function is reached, by `assertAssociationsPersisted`; it is not silently coerced here." That still
 * holds for `brand` and `productType`, which have no cascade and must already exist. It does NOT hold
 * for `defaultSku`, because `Product.skus` carries `cascade="all-delete-orphan"`
 * [model/entity/Product.cfc:L73] and the designation is made in memory before any row exists
 * [model/service/SkuService.cfc:L102, L134] - refusing it outright would make creating a product with
 * SKUs impossible. It is read through {@link resolvePersistedDefaultSkuKey}, which binds SQL NULL rather
 * than the empty string, and the follow-up write supplies the key. A transient default SKU that the
 * enclosing write will NOT persist is still refused.
 *
 * ★ `calculatedSalePrice` HAS NO `default` [model/entity/Product.cfc:L57], so `undefined` becomes SQL
 * NULL and NEVER `Money.zero`. That distinction is load-bearing: substituting zero for an absent price
 * would sell the product for free, and the plan names it the single highest-consequence parity check in
 * the whole migration. `toBindableMoney` is the one path a money column takes.
 *
 * THE AUDIT STAMPS ARE PARAMETERS, NOT ENTITY READS. `HibachiEntity.preInsert`
 * [org/Hibachi/HibachiEntity.cfc:L609] decided them at write time, so the save path decides them and
 * passes them in - reading `getModifiedDateTime()` off the argument would write back whatever the last
 * read observed rather than the moment of this write. The BY-ACCOUNT halves are read off the entity
 * because T6 removed the ambient scope that used to supply them: `getHibachiScope().getAccount()` has no
 * analogue here, so the columns carry whatever the caller hydrated or populated and nothing is invented.
 *
 * `createdDateTime` is accepted as possibly absent so that ONE function serves both statements. The
 * update's column list excludes the created pair entirely [see {@link PRODUCT_UPDATED_COLUMNS}], so a
 * value passed for it on that path is built and then never bound - which is why an entity hydrated
 * without a creation stamp cannot overwrite real provenance with NULL.
 *
 * ★ `urlTitle` AND `productName` ARRIVE AS PARAMETERS RATHER THAN BEING READ OFF THE ENTITY: they are
 * the two members the port's `ProductSavePayload` can supply,
 * {@link MysqlProductRepository.saveProduct} has already decided which source wins, and reading them off
 * the argument here would silently discard that decision. The legacy wrote the resolved title
 * onto the SAVED ENTITY - `arguments.product.setURLTitle(...)`
 * [model/service/ProductService.cfc:L269] - and the entity then reached the DAO at
 * [model/service/ProductService.cfc:L287]. `src/services/productService.ts` assigns the resolved title onto
 * the entity for exactly that reason and states the same value in the payload, so the payload
 * is the channel that replaces that assignment. Every other column is still read off the entity, because
 * the payload cannot address any of them.
 *
 * @param product the entity being written.
 * @param productID the identifier the row will carry - minted for a new entity, the entity's own
 *   otherwise.
 * @param urlTitle the url title the populate step settled on, if any.
 * @param productName the product name the populate step settled on, if any.
 * @param createdDateTime the creation stamp; bound on insert, ignored on update.
 * @param modifiedDateTime the modification stamp, bound by both statements.
 * @returns the row, keyed by physical column name, carrying all twenty columns.
 */
function toProductRecord(
  product: Product,
  productID: string,
  urlTitle: string | undefined,
  productName: string | undefined,
  createdDateTime: Date | undefined,
  modifiedDateTime: Date,
): PersistableRecord {
  return {
    productID,
    activeFlag: product.getActiveFlag(),
    urlTitle,
    productName,
    productCode: product.getProductCode(),
    productDescription: product.getProductDescription(),
    publishedFlag: product.getPublishedFlag(),
    sortOrder: product.getSortOrder(),
    calculatedSalePrice: toBindableMoney(product.getCalculatedSalePrice()),
    calculatedQATS: product.getCalculatedQATS(),
    calculatedAllowBackorderFlag: product.getCalculatedAllowBackorderFlag(),
    calculatedTitle: product.getCalculatedTitle(),
    brandID: product.getBrand()?.getBrandID(),
    productTypeID: product.getProductType()?.getProductTypeID(),
    defaultSkuID: resolvePersistedDefaultSkuKey(product.getDefaultSku()),
    remoteID: product.getRemoteID(),
    createdDateTime,
    createdByAccountID: product.getCreatedByAccountID(),
    modifiedDateTime,
    modifiedByAccountID: product.getModifiedByAccountID(),
  };
}

/**
 * Rebuild a product as the database now holds it, after an insert minted its identifier.
 *
 * WHY A NEW INSTANCE AT ALL: `productID` is `readonly` on the entity and the port promises the caller a
 * product carrying the persisted identifier. The argument is left untouched.
 *
 * ★★ ONLY THE FOUR PORT-REQUIRED ASSOCIATIONS ARE FORWARDED - `brand`, `productType`, `defaultSku` and
 * `skus` - AND THAT OMISSION IS THE POINT, NOT AN OVERSIGHT. `Product` DISTINGUISHES "this association
 * was materialized, possibly as empty" FROM "it was never materialized at all": see `getOptionGroups()`
 * in `../../domain/entities/product.ts`, which raises rather than answering `[]` when the collection was
 * never supplied. A save path never read `optionGroups`, `categories`, `relatedProducts`, the four
 * promotion collections or `priceGroupRates`, so forwarding them would be a claim this function cannot
 * back - and forwarding them as `[]` would be worse, because it would convert "unknown" into a confident
 * "empty" that a consumer would then act on. The port asks a returned product to carry the four
 * associations named above; it asks for nothing else, and nothing else is asserted.
 *
 * T3, stated plainly: the fetch shape of a SAVE is the four associations the ARGUMENT already carried,
 * forwarded verbatim. No statement is issued to widen it. A caller that needs the full graph after a save
 * reads it back through `getProductByProductID`, which is the one method that decides that shape.
 *
 * A MUTABLE DRAFT, NOT A LITERAL: `ProductHydrationInput` declares its optional members WITHOUT
 * `| undefined`, so under `exactOptionalPropertyTypes` an absent value must be OMITTED rather than
 * assigned as `undefined`. Every optional member is therefore assigned only when it has a value - the
 * same shape {@link MysqlProductRepository.buildProduct} uses, for the same reason.
 *
 * THE COLLABORATOR PORTS ARE RE-FORWARDED, INCLUDING `productRepository`, because T2 removed the
 * entity's ability to resolve them by name: a rebuilt product that lost them would be a product whose
 * `getProductURL()` and `getSkusBySelectedOptions()` had quietly stopped working after a save. The
 * repository is passed in rather than referenced, so this stays a pure module-level function with no
 * hidden binding to any instance.
 *
 * ★ THE TWO POPULATED MEMBERS ARRIVE AS PARAMETERS, NOT AS ENTITY READS, so the instance handed back
 * carries what was WRITTEN rather than what the argument happened to hold. That matters most on the
 * url-title path this rebuild exists to serve: a caller that saved a new product whose title was resolved
 * by the `urlTitleGenerator` port and then read the ARGUMENT would still see no title at all, because
 * the argument is not the instance this adapter answers with. The legacy had no such gap - it assigned
 * onto the entity at [model/service/ProductService.cfc:L269] - and forwarding the populated values onto
 * the rebuilt instance is what closes it.
 *
 * ★ THE TWO STAMPS ARE SEPARATE PARAMETERS RATHER THAN ONE, WHICH THEY WERE NOT BEFORE. The prior
 * signature took a single `auditTimestamp` and wrote it to BOTH columns, which is exactly right for an
 * insert [org/Hibachi/HibachiEntity.cfc:L609] and exactly wrong for anything else - and this function is
 * now reachable from the update route, where `preUpdate` touches only the modified stamp
 * [org/Hibachi/HibachiEntity.cfc:L662-L667] and the created stamp is whatever the row already held. One
 * parameter would have reported the modification instant as the creation instant.
 *
 * ★ AND `skus` / `defaultSku` COME FROM THE CASCADE WHEN ONE RAN, FOR THE SAME REASON THE TWO POPULATED
 * COLUMNS DO. A product save that carried transient SKUs wrote rows for them, so the argument's
 * collection - drafts whose `getSkuID()` is still `''` - no longer describes the aggregate. When a
 * cascade is supplied, its ordered replacement collection and its resolved default are forwarded
 * instead. When none ran, both are read off the argument exactly as before, so every existing save path
 * is unchanged.
 *
 * @param product the argument that was saved, read for its scalars and its four associations.
 * @param productID the identifier the row now carries.
 * @param urlTitle the url title that was written, if any.
 * @param productName the product name that was written, if any.
 * @param createdDateTime the creation stamp the row carries; omitted from the draft when absent.
 * @param modifiedDateTime the modification stamp that was written.
 * @param repository the adapter that performed the save, forwarded as the entity's product port.
 * @param collaborators the remaining ports to forward; each is assigned only when present.
 * @param cascade what the SKU cascade persisted, or `undefined` when no cascade ran.
 * @returns a new product carrying the persisted state.
 */
function rebuildProduct(
  product: Product,
  productID: string,
  urlTitle: string | undefined,
  productName: string | undefined,
  createdDateTime: Date | undefined,
  modifiedDateTime: Date,
  repository: ProductRepository,
  collaborators: ProductHydrationCollaborators,
  cascade: PersistedSkuCascade | undefined,
): Product {
  const draft: ProductHydrationDraft = {
    productID,
    activeFlag: product.getActiveFlag(),
    publishedFlag: product.getPublishedFlag(),
    calculatedAllowBackorderFlag: product.getCalculatedAllowBackorderFlag(),
    // `getSkus()` with both flags defaulted returns the materialized collection with no reordering and no
    // option fetch, which is the collection the argument carried. Sorting is a read-path concern. When a
    // cascade ran, its replacement collection is the same order with the drafts swapped for the rows.
    skus: cascade === undefined ? product.getSkus() : cascade.skus,
    modifiedDateTime,
    // T2: the entity's `getService("productService")` reach at [model/entity/Product.cfc:L367] is
    // satisfied by the adapter that just wrote the row.
    productRepository: repository,
  };

  // Omitted rather than assigned when absent: `ProductHydrationInput` declares `createdDateTime?: Date`
  // without `| undefined`, so `exactOptionalPropertyTypes` refuses an explicit `undefined`. On the insert
  // route this is the same instant as the modified stamp, byte-identical, which is the hook's own contract.
  if (createdDateTime !== undefined) {
    draft.createdDateTime = createdDateTime;
  }

  // The two populated members, assigned from what the save decided rather than from the argument. The
  // `undefined` case is OMITTED rather than assigned, for the same `exactOptionalPropertyTypes` reason.
  if (urlTitle !== undefined) {
    draft.urlTitle = urlTitle;
  }

  if (productName !== undefined) {
    draft.productName = productName;
  }

  const productCode = product.getProductCode();
  if (productCode !== undefined) {
    draft.productCode = productCode;
  }

  const productDescription = product.getProductDescription();
  if (productDescription !== undefined) {
    draft.productDescription = productDescription;
  }

  const sortOrder = product.getSortOrder();
  if (sortOrder !== undefined) {
    draft.sortOrder = sortOrder;
  }

  // No `default` on this column [model/entity/Product.cfc:L57], so absent stays absent - never
  // `Money.zero`, which would report a sale price the row does not hold.
  const calculatedSalePrice = product.getCalculatedSalePrice();
  if (calculatedSalePrice !== undefined) {
    draft.calculatedSalePrice = calculatedSalePrice;
  }

  const calculatedQATS = product.getCalculatedQATS();
  if (calculatedQATS !== undefined) {
    draft.calculatedQATS = calculatedQATS;
  }

  const calculatedTitle = product.getCalculatedTitle();
  if (calculatedTitle !== undefined) {
    draft.calculatedTitle = calculatedTitle;
  }

  const brand = product.getBrand();
  if (brand !== undefined) {
    draft.brand = brand;
  }

  const productType = product.getProductType();
  if (productType !== undefined) {
    draft.productType = productType;
  }

  // The cascade's answer wins outright when there was one, INCLUDING its `undefined`: a cascade that
  // resolved no default means the product designated none, and falling back to the argument there would
  // reinstate a draft whose key was never written.
  const defaultSku = cascade === undefined ? product.getDefaultSku() : cascade.defaultSku;
  if (defaultSku !== undefined) {
    draft.defaultSku = defaultSku;
  }

  const remoteID = product.getRemoteID();
  if (remoteID !== undefined) {
    draft.remoteID = remoteID;
  }

  const createdByAccountID = product.getCreatedByAccountID();
  if (createdByAccountID !== undefined) {
    draft.createdByAccountID = createdByAccountID;
  }

  const modifiedByAccountID = product.getModifiedByAccountID();
  if (modifiedByAccountID !== undefined) {
    draft.modifiedByAccountID = modifiedByAccountID;
  }

  if (collaborators.settingsProvider !== undefined) {
    draft.settingsProvider = collaborators.settingsProvider;
  }

  if (collaborators.skuRepository !== undefined) {
    draft.skuRepository = collaborators.skuRepository;
  }

  if (collaborators.optionRepository !== undefined) {
    draft.optionRepository = collaborators.optionRepository;
  }

  if (collaborators.subscriptionTermProvider !== undefined) {
    draft.subscriptionTermProvider = collaborators.subscriptionTermProvider;
  }

  return new Product(draft);
}

/**
 * The MySQL product adapter - the only exported unit of this module.
 *
 * Implements every member of `ProductRepository` and publishes nothing else. E7: one exported unit per
 * file, no barrel, no `index.ts`, no re-export. The row readers, the statement builders, the four local
 * error classes and the entity factories above are all module-private on purpose - they are how this
 * class works, not what it offers.
 *
 * SIX PORT METHODS, WHICH IS WHAT THE PORT DECLARES. `../../domain/ports/productRepository.js` states
 * it in its own interface documentation as a LOCK: "Six methods, locked: the three public functions of
 * `model/dao/ProductDAO.cfc` and the three product entity-lifecycle methods the service tier needs now
 * that Hibernate is gone." The arithmetic is four declared DAO functions, less the `private` helper
 * `saveImportData` [model/dao/ProductDAO.cfc:L328], plus load / save / delete for the product. There is
 * no seventh, and in particular no brand save: the port records why the member was removed rather than
 * relocated, and `src/services/brandService.ts` carries the LEGACY-NOTE that leaves the durable half of
 * `super.save` [model/service/BrandService.cfc:L76] to the composition root. B4, interface parity:
 * `getAttributeSets`, `loadDataFromFile` and `searchProductsByProductType` keep their legacy CFML
 * camelCase names verbatim; the three lifecycle names have no legacy antecedent and the port says so on
 * each.
 *
 * // JUDGMENT CALL: the query executor is a CONSTRUCTOR PARAMETER and the connection pool is never
 * // imported as a module singleton. `./connection.js` states that as a mandatory design constraint, and
 * // the reason is testability rather than taste: the integration suites at
 * // `tests/integration/repositories/*.test.ts` assert emitted SQL TEXT and bound PARAMETER ARRAYS with
 * // NO LIVE DATABASE, which is only expressible if the seam is a parameter. E6: this class reads no
 * // environment variable, constructs no pool, and names no credential, host, datasource or connection
 * // string. Every one of those belongs to `./connection.js` and `../../lib/config.js`.
 *
 * NO MODULE-SCOPE MUTABLE STATE, AND NO FIELD ON THIS CLASS IS A CACHE. Every module-level binding above
 * is a frozen literal, a statement string or a pure function. On a warm Lambda container a module-level
 * cache would persist between unrelated invocations, which is why the legacy's four component-level
 * memos - including `SkuDAO.variables.nextOptionGroupSortOrder`
 * [model/dao/SkuDAO.cfc:L204-L220], whose clear method's condition is inverted so that it can never fire
 * [model/dao/SkuDAO.cfc:L222-L226] - are all request-scoped in the target. The pool inside
 * `./connection.js` is the one sanctioned module-scope state in the whole subtree.
 *
 * B8, NET-NEW COVERAGE. Nothing in the legacy suite covers this DAO: `meta/tests/unit/dao/` contains
 * only `AccountDAOTest` and `PaymentDAOTest`. Every test for this adapter is net-new and must be
 * presented as such, never as legacy parity. NO TEST FILE IS AUTHORED BY THIS MODULE; the obligations
 * are stated in prose on each method so the suite that another agent owns can be written against them.
 *
 * B7: no statement, comment or decision in this class asserts a latency, throughput, availability or
 * uptime figure, because the source declares none and none may be invented. Where a fetch decision is
 * explained, it is explained as fidelity to a mapping or as explicitness about what is materialized.
 */
export class MysqlProductRepository implements ProductRepository {
  /**
   * ★ THE THIRD PARAMETER IS OPTIONAL BY CONSTRUCTION AND MANDATORY BY BEHAVIOUR, WHICH IS NOT A
   * CONTRADICTION. Most of this class never needs it: every read path, every brand write, the delete,
   * and any product save whose SKU collection holds nothing transient all proceed without it, which is
   * what keeps a SQL-shape test able to construct the class with a capturing executor alone. But a save
   * that DOES carry transient SKUs cannot honour `cascade="all-delete-orphan"`
   * [model/entity/Product.cfc:L73] without it, and the one thing it must not do then is proceed quietly:
   * writing the product row and silently dropping its SKUs is precisely the failure this parameter
   * exists to end. {@link MysqlProductRepository.saveProduct} therefore RAISES when a cascade is needed
   * and no writer was supplied, rather than defaulting to a no-op.
   *
   * @param executor the prepared-statement executor; see the class note for why it is a parameter.
   * @param collaborators the ports forwarded into every hydrated entity; see
   *   {@link ProductHydrationCollaborators}. Defaults to `{}` so a SQL-shape test can construct this
   *   class with a capturing executor alone.
   * @param skuCascadeWriter the sibling adapter that writes a SKU row and its option membership on this
   *   adapter's transaction; see {@link ProductSkuCascadeWriter}.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly collaborators: ProductHydrationCollaborators = {},
    private readonly skuCascadeWriter?: ProductSkuCascadeWriter,
  ) {}

  // =========================================================================
  // Port method 1 of 7 - getAttributeSets [model/dao/ProductDAO.cfc:L52-L71]
  // =========================================================================

  /**
   * Attribute sets for a set of type system codes, narrowed by product type.
   *
   * Legacy: `public array function getAttributeSets(required array attributeSetTypeCode,required array
   * productTypeIDs)` [model/dao/ProductDAO.cfc:L52]. Both parameter names and their order are carried
   * over verbatim, including the singular `attributeSetTypeCode` beside the plural `productTypeIDs`.
   *
   * ★ THE BRANCH TEST IS `productTypeIDs` ALONE, exactly as [model/dao/ProductDAO.cfc:L56] and [L65]
   * write it - `arrayLen(arguments.productTypeIDs)`. `attributeSetTypeCode` never influences which arm
   * runs. The two arms differ in the HQL fragment they append AND in how they bind, and the binding
   * difference is the defect documented at length on
   * {@link buildAttributeSetsByProductTypeSql}.
   *
   * // TODO: Remove this conditional when railo and ACF match how they handle arrays for 'IN' clause
   *
   * The line above is [model/dao/ProductDAO.cfc:L64] carried forward CHARACTER FOR CHARACTER, sitting
   * immediately above the conditional it guards, exactly as it does in the source. B3: never paraphrased,
   * never summarized, never completed.
   *
   * THE PRODUCT-TYPE ARM BINDS FOUR GROUPS IN THIS ORDER: the active-attribute flag, the ONE joined
   * comma string of type codes, the global flag, then one parameter per product-type identifier. THE
   * GLOBAL-ONLY ARM BINDS THREE: the active-attribute flag, one parameter per type code, then the global
   * flag. Positional binding makes those orders part of the contract, which is why each is assembled in
   * one place directly beside the statement it belongs to.
   *
   * // CFML parity [model/dao/ProductDAO.cfc:L66]: `arrayToList(...)` is a PLAIN JOIN on a comma - CFML
   * // lists cannot represent an empty element, so `arrayToList` has no empty-element rule to apply.
   * // `Array.prototype.join(',')` is therefore its exact equivalent, and `listAppend` from
   * // `../../lib/cfml/list.js` is deliberately NOT used to build it: `listAppend('', x)` returns `x`
   * // and would silently drop a leading empty element that `arrayToList` preserves.
   *
   * T3, FETCH SHAPE: this method materializes NO association and hydrates NO entity. It returns the
   * port's flat read projection - see {@link toAttributeSetSummary} - so the `attributes` collection is
   * represented by a count and nothing reachable through an attribute set is loaded. That is the whole
   * fetch shape, stated explicitly.
   *
   * NET-NEW COVERAGE OBLIGATIONS: a multi-element `attributeSetTypeCode` with a non-empty
   * `productTypeIDs` binds the codes as ONE comma-joined parameter; the same codes with an EMPTY
   * `productTypeIDs` bind as one parameter EACH; a single-element input binds indistinguishably in both
   * arms, which is why the defect survived; an empty `productTypeIDs` narrows to global sets rather than
   * removing the filter; an empty `attributeSetTypeCode` with a non-empty `productTypeIDs` binds the
   * empty string and matches nothing; an empty `attributeSetTypeCode` with an empty `productTypeIDs`
   * raises rather than emitting `IN ()`; and the projected count is the count of ALL attributes while
   * the filter tests only ACTIVE ones.
   *
   * @param attributeSetTypeCode attribute-set type system codes to match.
   * @param productTypeIDs product-type identifiers to narrow by; empty means "global sets only".
   * @returns the matching projections, in the legacy order.
   * @throws An error named `ProductEmptyInListError` when both collections are empty.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  public async getAttributeSets(
    attributeSetTypeCode: readonly string[],
    productTypeIDs: readonly string[],
  ): Promise<AttributeSetSummary[]> {
    // [model/dao/ProductDAO.cfc:L65] `if(arrayLen(arguments.productTypeIDs)){`
    if (productTypeIDs.length > 0) {
      const rows = await this.executor.execute(
        buildAttributeSetsByProductTypeSql(productTypeIDs.length),
        [
          ACTIVE_ATTRIBUTE_FLAG_BOUND_VALUE,
          // [model/dao/ProductDAO.cfc:L66] the whole list as ONE bound parameter. See the statement.
          attributeSetTypeCode.join(','),
          GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE,
          ...productTypeIDs,
        ],
      );

      return rows.map((row: SqlRow) =>
        toAttributeSetSummary(row, ATTRIBUTE_SETS_BY_PRODUCT_TYPE_LABEL),
      );
    }

    // [model/dao/ProductDAO.cfc:L67-L69] the `else` arm. An empty type-code array here would render
    // `IN ()`, which is a MySQL syntax error and is refused rather than emitted. The legacy reached the
    // same dead end from the other side: Hibernate expanded an empty bound array into an empty `IN`
    // list and the engine rejected it, so this raises where that raised.
    if (attributeSetTypeCode.length < 1) {
      throw new ProductEmptyInListError(
        'attributeSetTypeCode',
        ATTRIBUTE_SETS_GLOBAL_LABEL,
        'the global-only arm expands the codes into a real IN list, and an empty one is unparseable',
      );
    }

    const rows = await this.executor.execute(
      buildGlobalAttributeSetsSql(attributeSetTypeCode.length),
      [
        ACTIVE_ATTRIBUTE_FLAG_BOUND_VALUE,
        // [model/dao/ProductDAO.cfc:L68] the raw array, expanded - one parameter per element.
        ...attributeSetTypeCode,
        GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE,
      ],
    );

    return rows.map((row: SqlRow) => toAttributeSetSummary(row, ATTRIBUTE_SETS_GLOBAL_LABEL));
  }

  // =========================================================================
  // Port method 2 of 7 - loadDataFromFile [model/dao/ProductDAO.cfc:L73-L326]
  // =========================================================================

  /**
   * Bulk product / SKU import from a delimited file - DECLARED, AND DELIBERATELY UNEXERCISED.
   *
   * Legacy: `public void function loadDataFromFile(required string fileURL, string textQualifier="")`
   * [model/dao/ProductDAO.cfc:L73], whose body runs to L327 and accounts for 255 of this DAO's 441
   * lines. The port declares this method, so it is implemented; what it is implemented AS is an explicit
   * refusal.
   *
   * // TODO: the bulk import path is not ported. This declaration exists because the port declares it and
   * // because the legacy function exists; the body is deliberately absent rather than approximated.
   *
   * // JUDGMENT CALL: an explicit refusal is the only honest body. Silently inventing a working importer
   * // would be the single largest unrequested behaviour in this subtree, and returning quietly would be
   * // worse - a caller would believe an import had happened. The EXECUTION-MODEL MISMATCH is a platform
   * // fact, stated as one: the calling service raises the request timeout to 3600 seconds immediately
   * // before delegating here [model/service/ProductService.cfc:L65-L68], and that budget does not exist
   * // in this runtime - AWS Lambda caps a single invocation at 15 minutes and API Gateway caps a request
   * // at 29 seconds. Those are published platform limits, not a performance judgement about the legacy
   * // code, and no latency, throughput or availability claim is made or implied (B7).
   *
   * NOTHING IS INVENTED TO WORK AROUND IT. No batching, no chunking, no offset, cursor or resume
   * parameter, no streaming handle, no queue or worker hand-off, no progress callback, no idempotency
   * key, no compensation story and no split into a begin/continue pair. Every one of those would be a
   * requirement the source never had. The signature is exactly the port's, `textQualifier` stays optional
   * with its legacy default recorded in prose, and the whole excluded machinery is inventoried in the
   * exclusion notes at the end of this module.
   *
   * `async` IS LOAD-BEARING AND THE `await` IS NOT A LINT DODGE. An `async` function that throws produces
   * a REJECTED PROMISE, which is what a caller of a `Promise<void>` method handles; a synchronous throw
   * from a promise-returning method escapes before any `.catch` is attached and is a different failure
   * mode. The awaited resolved promise makes the asynchrony genuine rather than suppressing
   * `require-await`. `src/domain/entities/product.ts` uses the same construction for
   * `getUnusedProductSubscriptionTerms()`, for the same reason.
   *
   * T3, FETCH SHAPE: NO STATEMENT IS ISSUED AND NO ASSOCIATION IS MATERIALIZED. The method rejects
   * before touching the executor, so it reads nothing, writes nothing and hydrates nothing - there is no
   * depth to justify because there is no traversal. Recording the empty shape explicitly rather than
   * skipping this method keeps the per-method fetch-shape inventory complete, which is the point of
   * writing them down at all.
   *
   * @param fileURL location of the delimited file; the legacy body derives its delimiter from the file
   *   extension [model/dao/ProductDAO.cfc:L74-L80].
   * @param textQualifier optional text qualifier; the legacy default is the empty string.
   * @returns never returns; the promise always rejects.
   * @throws An error named `ProductBulkImportUnavailableError`, always.
   */
  public async loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void> {
    await Promise.resolve();

    throw new ProductBulkImportUnavailableError(
      'The bulk product import [model/dao/ProductDAO.cfc:L73-L326] is not ported. Its calling ' +
        'service raises the request timeout to 3600 seconds [model/service/ProductService.cfc:L65-L68], ' +
        'a budget this runtime does not offer, and no batching, chunking or job-orchestration ' +
        'mechanism the legacy lacked has been invented in its place. Requested for ' +
        `'${fileURL}'${textQualifier === undefined ? '' : ' with a text qualifier'}.`,
    );
  }

  // =========================================================================
  // Port method 3 of 7 - searchProductsByProductType [model/dao/ProductDAO.cfc:L419-L437]
  // =========================================================================

  /**
   * Product search by name fragment, optionally narrowed to a comma-delimited product-type list.
   *
   * Legacy: `public any function searchProductsByProductType(string term,string productTypeIDs)`
   * [model/dao/ProductDAO.cfc:L419]. NEITHER parameter is declared `required`, so both are optional here
   * too, in the legacy order and with the legacy spellings.
   *
   * ★★ THE FOUR SIBLING ASYMMETRIES, RECORDED SO NOBODY HARMONIZES THE TWO SEARCH METHODS. This method
   * and `searchSkusByProductType` [model/dao/SkuDAO.cfc:L130-L145] look like the same query written
   * twice. They are not, and each difference is preserved as its own source dictates:
   *
   *   1. THE EMPTINESS IDIOM DIFFERS. This DAO writes `len(arguments.productTypeIDs)`
   *      [model/dao/ProductDAO.cfc:L423]; the SKU sibling writes `trim(...) != ""`
   *      [model/dao/SkuDAO.cfc:L134]. They are NOT unified. This method routes its test through
   *      `cfLen()` from `../../lib/cfml/truthiness.js`, which is the ported `len()` - so the CFML
   *      semantic is honoured rather than re-invented as a JavaScript truthiness check, and a
   *      whitespace-only list is NON-empty here exactly as `len(' ')` is 1 there. The sibling's
   *      `trim()`-based test would treat that same input as empty, which is the asymmetry.
   *   2. THE ARGUMENT NAMING DIFFERS. This one is PLURAL on both sides - `productTypeIDs` maps to
   *      `:productTypeIDs`. The sibling takes a SINGULAR `productTypeID` and binds it to a PLURAL
   *      `:productTypeIDs` [model/dao/SkuDAO.cfc:L130, L136]. Neither spelling is normalised.
   *   3. ★ THE FILTER SHAPE DIFFERS. This one filters `productTypeID` DIRECTLY on the product row,
   *      because it IS a column of `SwProduct` [model/entity/Product.cfc:L69]. The sibling filters
   *      through a CORRELATED `IN` SUBQUERY across `SlatwallProduct`, because a SKU has no product-type
   *      column of its own. NO SUBQUERY IS INTRODUCED HERE to make the two look alike, and the direct
   *      filter is not flattened into one there.
   *   4. THE UNGUARDED `term` BIND IS IN BOTH - see {@link ProductUndefinedArgumentError} and
   *      [model/dao/SkuDAO.cfc:L133]. Both preserve it.
   *
   * `productTypeIDs` STAYS A `string`, because that is the legacy type and the legacy value is a
   * comma-delimited list. It is split with `listToArray` from `../../lib/cfml/list.js` - the ported
   * boundary converter, one of exactly six in-scope `listToArray` sites, two of which are in this very
   * DAO at [model/dao/ProductDAO.cfc:L123] and [L259] - and EACH parsed element is bound as its own
   * positional parameter. E5, standard rule. The §5 single-parameter exception on the attribute-set
   * statement does NOT apply here and must not be borrowed: per-element binding PRESERVES semantics on
   * this statement, so it is mandatory. An empty parsed list omits the predicate entirely rather than
   * emitting `IN ()`, which is exactly what the legacy guard at [model/dao/ProductDAO.cfc:L423] does.
   *
   * T3, FETCH SHAPE: the port returns `Product[]`, so the matched identifiers are hydrated through this
   * module's single product graph loader - each product carries its eager `brand` and `productType`, its
   * `skus`, each SKU's `options`, and its `defaultSku`. Results come back IN THE ORDER THE SEARCH
   * PRODUCED THEM, and the search statement carries no `ORDER BY` because the legacy carries none; no
   * ordering is invented on either side of the hydration.
   *
   * NET-NEW COVERAGE OBLIGATIONS: a term plus a two-element list emits the product-type predicate with
   * two placeholders and binds `%term%` first; an empty or whitespace-only `productTypeIDs` string is
   * treated per rule 1 above; an ABSENT `productTypeIDs` omits the predicate; an ABSENT `term` RAISES;
   * the emitted table name is `SwProduct`; and the emitted text carries no `ORDER BY`, no `DISTINCT` and
   * no `LIMIT`.
   *
   * @param term optional name fragment.
   * @param productTypeIDs optional comma-delimited product-type identifiers.
   * @returns the matching products, materialized as the port requires.
   * @throws An error named `ProductUndefinedArgumentError` when `term` is absent.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   * @throws An error named `ProductAssociationError` when a matched row carries a dangling foreign key.
   */
  public async searchProductsByProductType(
    term?: string,
    productTypeIDs?: string,
  ): Promise<Product[]> {
    // [model/dao/ProductDAO.cfc:L422] the unconditional bind. See ProductUndefinedArgumentError.
    if (term === undefined) {
      throw new ProductUndefinedArgumentError('term', PRODUCT_SEARCH_LABEL);
    }

    // [model/dao/ProductDAO.cfc:L423] `structKeyExists(arguments,"productTypeIDs") && len(...)` -
    // asymmetry 1 above. `cfLen` is the ported `len()`, so a whitespace-only list passes as it does there.
    const boundProductTypeIDs: readonly string[] =
      productTypeIDs !== undefined && cfLen(productTypeIDs) > 0 ? listToArray(productTypeIDs) : [];

    const rows = await this.executor.execute(buildProductSearchSql(boundProductTypeIDs.length), [
      // [model/dao/ProductDAO.cfc:L422] `value="%#arguments.term#%"` - the wildcards are part of the
      // VALUE and are bound with it. They are not concatenated into the statement text.
      `%${term}%`,
      ...boundProductTypeIDs,
    ]);

    const matchedProductIDs = rows.map((row: SqlRow) =>
      readIdentifier(row, 'productID', PRODUCT_SEARCH_LABEL),
    );

    return await this.materializeProducts(matchedProductIDs);
  }

  // =========================================================================
  // Port method 4 of 7 - getProductByProductID (no legacy antecedent)
  // =========================================================================

  /**
   * Load one product by its identifier, or nothing.
   *
   * NO LEGACY ANTECEDENT ON THE DAO. `model/dao/ProductDAO.cfc` declares no load function at all: the
   * legacy obtained an entity through Hibernate, reached by way of the framework base component's
   * generated accessors and `entityLoad`, neither of which exists in a driver-only stack. T3 converts
   * exactly that construct into a repository method, and the name follows the closest legacy naming
   * precedent in the same DAO family, `getSkuBySkuCode` [model/dao/SkuDAO.cfc:L102].
   *
   * ⚠ RETURNS `undefined` ON A MISS - never a zero-valued object, never an empty `Product`, never a
   * throw. That is the folder-wide convention and it is load-bearing rather than stylistic: the same
   * discipline is what keeps `Sku.getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273] returning
   * `undefined` instead of a zero that would sell products for free.
   *
   * ⭐ EVERY FETCH DECISION IN THIS MODULE IS A NEW ONE, WHICH IS WHY EACH IS WRITTEN DOWN. The whole
   * in-scope DAO layer contains exactly FIVE true `JOIN FETCH` clauses - [model/dao/SkuDAO.cfc:L155],
   * [:L157], [:L160], [model/dao/PromotionDAO.cfc:L66] and [:L68] - and NOT ONE OF THEM IS IN
   * `ProductDAO`. The legacy therefore expressed no eager-load intent for a product graph anywhere: it
   * simply let Hibernate lazy-load whatever a caller happened to touch. With no ORM there is nothing to
   * inherit, so the shape below was DECIDED rather than translated, and it is recorded here in full so a
   * reviewer can check the decision instead of reverse-engineering it from three statements.
   *
   * T3, FETCH SHAPE - the full decision for this method, and the one every other read shares:
   *
   *   * `brand` and `productType` are materialized IN THE SAME STATEMENT via `LEFT JOIN`, because both
   *     declare `fetch="join"` [model/entity/Product.cfc:L68-L69].
   *   * `skus` is materialized by a second statement, and each SKU's `options` by a third. A
   *     many-to-many cannot be flattened into the product row without multiplying it, so the collection
   *     load is its own statement - which is what Hibernate did as well.
   *   * `defaultSku` is resolved from that same SKU statement, which also matches on `defaultSkuID`
   *     directly so that a default SKU outside the product's own collection still resolves. See
   *     {@link buildProductSkusSql}.
   *   * THREE STATEMENTS TOTAL, REGARDLESS OF HOW MANY PRODUCTS ARE ASKED FOR. The SKU and option reads
   *     bind an `IN` list rather than running per product, which is what makes the graph load explicit
   *     rather than an implicit per-entity traversal - the property T3 asks for, stated as explicitness
   *     and not as a performance claim.
   *   * NOT materialized, each for a stated reason: `ProductType.products` (`lazy="extra"`),
   *     `ProductType.parentProductType`, `Sku.skuCurrencies`, `Sku.orderItems` (`lazy="extra"`),
   *     `Option.optionGroup`, `Brand.products`, `Product.categories`, `Product.relatedProducts`,
   *     `Product.optionGroups`, the four promotion collections, `priceGroupRates`, and every
   *     `attributeValues` collection. Each reason is recorded at the projection or factory that omits it.
   *   * ⚠ `salePriceDetailsForSkus` IS NOT SUPPLIED, and the entity itself calls it "a structural
   *     association materialized at the repository boundary" - so the omission needs saying rather than
   *     leaving to inference. It cannot be produced here: the map is the ALREADY-REDUCED,
   *     ALREADY-ROUNDED output of `getSalePriceDetailsForProductSkus`
   *     [model/service/PromotionService.cfc:L1022], whose reduction and rounding-rule application at
   *     [L1024-L1028] are service-tier work over rows from `getSalePricePromotionRewardsQuery`
   *     [model/dao/PromotionDAO.cfc:L298]. Neither the promotion repository nor the rounding-rule
   *     service is in this file's declared dependency set, and inventing a second sale-price
   *     computation here would duplicate the must-preserve discount math in a place no reviewer would
   *     look for it. The consequence is bounded and graceful, not a failure:
   *     `Product.getSkuSalePriceDetails(skuID)` answers `undefined`, which its own documentation records
   *     as the same answer the legacy `return {};` at [model/entity/Product.cfc:L186] gave. A caller
   *     that needs real sale prices supplies the map at construction from the promotion tier.
   *   * `nextOptionGroupSortOrder` IS NOT SUPPLIED. It is a GLOBAL aggregate over `SwOptionGroup`
   *     [model/dao/SkuDAO.cfc:L204-L226] owned privately by `mysqlSkuRepository.ts`, not derivable from a
   *     product's own graph. `Product.getSkus(true)` therefore returns the UNSORTED projection, which
   *     that method already documents as the honest answer - and it is doubly honest here, since option
   *     groups are unmaterialized so every odometer weight would compute to zero anyway.
   *
   * NET-NEW COVERAGE OBLIGATIONS: a known identifier emits the graph read then the SKU read then the
   * option read, and returns a product whose brand, product type, SKUs, SKU options and default SKU are
   * populated; an unknown identifier emits the graph read alone and returns `undefined`; a product with
   * no SKUs emits no option read; and a dangling `brandID` raises.
   *
   * @param productID identifier of the product to load.
   * @returns the materialized product, or `undefined` when there is none.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   * @throws An error named `ProductAssociationError` when the row carries a dangling foreign key.
   */
  public async getProductByProductID(productID: string): Promise<Product | undefined> {
    const products = await this.materializeProducts([productID]);

    return products[0];
  }

  // =========================================================================
  // Port method 5 of 7 - saveProduct (no legacy antecedent on the DAO)
  // =========================================================================

  /**
   * Persist one product.
   *
   * NO LEGACY ANTECEDENT ON THE DAO. Persistence ran through Hibernate, reached as
   * `getHibachiDAO().save(target=arguments.product)` [model/service/ProductService.cfc:L287]. T3 converts
   * that construct into this method.
   *
   * ★ QUOTE-THEN-REVISE. This paragraph opened "IT TAKES THE ENTITY ALONE, AND NO DATA STRUCT". It now
   * takes a second argument - see the payload note further down for why - but the DIVISION OF LABOUR the
   * sentence was really making remains exactly as stated: population of the two columns the payload can
   * address is applied here because the entity is immutable, while validation and UNIQUE URL-TITLE
   * GENERATION remain at the service tier where the legacy performed them
   * [model/service/ProductService.cfc:L264-L292]. ⚠ URL-TITLE GENERATION IS NOT THIS FILE'S CONCERN:
   * `createUniqueURLTitle` [model/service/DataService.cfc:L53], reached at
   * [model/service/ProductService.cfc:L269], becomes the separate `urlTitleGenerator` port. This method
   * PERSISTS a supplied `urlTitle`; it never GENERATES one, never probes `SwProduct` for uniqueness, and
   * never appends a numeric suffix. ⚠ `globalURLKeyProduct` and `globalURLKeyProductType`
   * [model/service/SettingService.cfc:L178-L179] are likewise not read here and neither literal appears
   * anywhere in this module - they are settings, resolved through the `settingsProvider` port by
   * `Product.getProductURL()`.
   *
   * INSERT OR UPDATE IS DECIDED BY THE DATABASE, NOT BY A FLAG. `isNew()` is consulted first - the ported
   * `unsavedvalue=""` test [model/entity/Product.cfc:L52] - and when the entity carries an identifier the
   * row's existence is checked before anything is written. That is what `super.save()` did through the
   * ORM's `saveOrUpdate`, and it means an entity carrying an identifier that matches NO row is INSERTED
   * with that identifier rather than rejected, exactly as saveOrUpdate treated a detached instance.
   *
   * ★ THERE IS NO ORM HOOK TO REPLACE, AND THAT IS WORTH STATING SO NOBODY ADDS A PHANTOM ONE.
   * `model/entity/Product.cfc` DECLARES NO `preInsert`, NO `preUpdate` AND NO `preDelete`. Contrast
   * `ProductType` [model/entity/ProductType.cfc:L305, L310] and `PriceGroup`
   * [model/entity/PriceGroup.cfc:L206, L211], both of which maintain a materialized path in their hooks.
   * `SwProduct` HAS NO MATERIALIZED PATH COLUMN, so there is NO path maintenance in this file at all -
   * `productTypeIDPath` belongs to `mysqlProductTypeRepository.ts` and `priceGroupIDPath` to
   * `mysqlPriceGroupRepository.ts`.
   *
   * AUDIT STAMPING, THE HALF OF THE FRAMEWORK BASE HOOK THAT MOVED HERE. `HibachiEntity.preInsert` took
   * ONE `now()` and wrote it to BOTH `createdDateTime` and `modifiedDateTime`
   * [org/Hibachi/HibachiEntity.cfc:L609-L619]; `preUpdate` took one `now()` and wrote only
   * `modifiedDateTime` [org/Hibachi/HibachiEntity.cfc:L662-L667]. Both are reproduced exactly, including
   * the single-timestamp property - an inserted row's two stamps are byte-identical rather than merely
   * close.
   *
   * ⚠ THE BY-ACCOUNT HALF IS NOT REPRODUCED, AND CANNOT BE. `createdByAccountID` and
   * `modifiedByAccountID` were stamped inside a guard requiring the application to be initialized AND an
   * ambient administrative account to be present in the request scope
   * [org/Hibachi/HibachiEntity.cfc:L622]. That ambient scope is precisely what T6 removed, and this port
   * declares no context parameter to replace it with, so both account columns carry whatever the caller
   * hydrated and are never stamped. Recorded because a silently unstamped audit column is
   * indistinguishable from a bug.
   *
   * ⚠ A NULL BOOLEAN COLUMN READ AND THEN SAVED IS WRITTEN BACK AS `0`, NOT AS NULL. `Product` publishes
   * `getActiveFlag(): boolean`, having already resolved the column through `cfBoolean()` in its own
   * constructor, so an undefaulted NULL `activeFlag` [model/entity/Product.cfc:L53] becomes `false` on
   * the entity and `0` on the way back out. The coercion is the ENTITY's and is documented there; this
   * method writes what the entity holds rather than second-guessing it, because reconstructing "the
   * column was NULL" from a `boolean` is not possible and inventing a nullable side channel would change
   * the entity's published contract.
   *
   * NO ROW COUNT IS INSPECTED ON THE UPDATE. MySQL reports CHANGED rows rather than MATCHED rows unless
   * the connection asks otherwise, so an update storing values identical to those already present
   * reports zero - and treating that as a fault would raise on a legitimate no-op save. The legacy's
   * staleness detection came from the Hibernate session, which is gone; inventing a replacement out of a
   * driver counter that does not mean what it appears to mean would be worse than having none.
   *
   * WHAT THE FOUR ASSOCIATIONS DO AND DO NOT DO. The three foreign keys are written FROM the associations
   * - `brandID` from `getBrand()`, `productTypeID` from `getProductType()`, `defaultSkuID` from
   * `getDefaultSku()` - because the entity publishes the associations and not the keys. An association
   * the caller did not materialize is therefore written as NULL, which is exactly what Hibernate did with
   * a many-to-one set to null, and which is also why a DANGLING key raises on the way IN rather than
   * being quietly nulled on the way out - see {@link ProductAssociationError}.
   *
   * ★★ QUOTE-THEN-REVISE, AND THIS ONE WAS A GAP RATHER THAN A DESIGN. The paragraph used to end:
   * "`skus` is NOT written: `SwSku.productID` is the SKU's column and `mysqlSkuRepository.ts` owns it,
   * and the legacy's own `cascade` on that collection is addressed at {@link DELETE_PRODUCT_SQL}."
   *
   * THE FIRST CLAUSE IS TRUE AND THE INFERENCE FROM IT WAS WRONG. `SwSku.productID` is indeed the SKU's
   * own column, and this adapter still never writes a SKU row itself - it delegates every one of them to
   * the sibling that owns them. But "the SKU owns the column" does not mean "the product save has no
   * obligation": `Product.skus` is declared `cascade="all-delete-orphan"`
   * [model/entity/Product.cfc:L73], so a product save WAS the operation that inserted its transient SKUs,
   * and the cross-reference to the delete statement addressed a cascade on the DELETE path while leaving
   * the SAVE path with none. The cost was not stylistic. `createSkus`
   * [model/service/SkuService.cfc:L58-L208] is reached from a new-product save
   * [model/service/ProductService.cfc:L279] and builds every SKU a merchandise product will ever have; a
   * save that wrote only the `SwProduct` row therefore produced a product with NO variants, whose
   * `defaultSkuID` was NULL, while the returned entity reported its full SKU collection in memory and
   * looked entirely correct.
   *
   * SO `skus` IS NOW CASCADED, AND ONLY THE TRANSIENT ONES ARE. See
   * {@link MysqlProductRepository.cascadeTransientSkus} for the ordering the two mutually-referencing
   * foreign keys force, and {@link ProductSkuCascadeWriter} for why the write is delegated rather than
   * duplicated. NO LINK TABLE OF THIS ENTITY'S OWN IS WRITTEN - `listingPages`, `categories` and
   * `relatedProducts` [model/entity/Product.cfc:L79-L81] are untouched, and the SKU's own `SwSkuOption`
   * membership is written by the sibling that owns it, not by a statement in this module.
   *
   * NET-NEW COVERAGE OBLIGATIONS: a new entity gets a 32-character hexadecimal identifier and emits
   * `INSERT INTO SwProduct` with twenty parameters in the declared column order; an existing entity emits
   * the existence read then `UPDATE SwProduct` with eighteen parameters and THE KEY LAST, and its SET
   * list contains neither created column; an entity carrying an unmatched identifier is INSERTED; an
   * absent value binds as `null` and never as `undefined`; a monetary column binds as a DECIMAL STRING;
   * an inserted row's created and modified stamps are the SAME instant; a transient brand or product type
   * raises before any write is executed, as does a transient default SKU that is NOT among the product's
   * own SKUs; a save carrying transient SKUs opens EXACTLY ONE transaction, writes the product row first,
   * then one SKU write per transient SKU, then the deferred `defaultSkuID` update, and answers a rebuilt
   * instance whose collection carries the minted keys in the original order; the same save RAISES when no
   * cascade writer was supplied; and a save whose SKUs are all persisted opens no transaction at all.
   *
   * ★★ THE PAYLOAD IS THE CHANNEL THAT REPLACES `arguments.product.setURLTitle(...)`, AND IT IS WHY THIS
   * METHOD TAKES A SECOND ARGUMENT AT ALL. The legacy resolved a unique url title and assigned it ONTO THE
   * ENTITY BEING SAVED [model/service/ProductService.cfc:L268-L270], and that same entity reached
   * persistence eighteen lines later [model/service/ProductService.cfc:L287], so the resolved value was
   * written. `Product.urlTitle` is `private readonly` in this port's domain model - deliberately, because
   * an entity whose columns can be reassigned from anywhere is what the ORM's dirty-checking made safe and
   * nothing here replaces - so a service that resolves a title has no way to put it on the argument. Before
   * this payload existed, the resolved title reached the caller's own request struct and NOTHING ELSE: the
   * row was written with `product.getUrlTitle()`, still absent, and the gate that generated the title fired
   * again on the next save. The populate step below is that assignment, relocated to the one tier that can
   * still perform it.
   *
   * // CFML parity [model/service/ProductService.cfc:L266]: the legacy `populate(arguments.data)` copied
   * // the keys the struct HAS, and `Object.hasOwn` is the exact equivalent of the `structKeyExists` test
   * // that underpins it. A PRESENT key wins over the entity's current value whatever it holds - including
   * // an explicit `undefined`, which `ProductSavePayload` declares as `?: string | undefined` so that a
   * // caller who read a NULL column can express it, and which therefore writes SQL NULL. An ABSENT key
   * // leaves the entity's value in place, which is what `populate` did key by key.
   *
   * ⚠ TWO MEMBERS, NOT A GENERAL POPULATE. The payload addresses `urlTitle` and `productName` and nothing
   * else, and the port documents why: reproducing `populate` column by column would rebuild the framework
   * machinery T1 and T3 removed. Every other column on the row is still read off the entity.
   *
   * @param product the product to persist.
   * @param data the resolved payload to populate from before writing.
   * @returns the persisted product - the argument itself when it already carried an identifier, and a
   *   new instance carrying the minted identifier and the populated values when it did not.
   * @throws An error named `ProductPersistenceError` when an association is transient.
   * @throws An error named `ProductColumnError` when the record does not carry a listed column.
   */
  public async saveProduct(product: Product, data: ProductSavePayload): Promise<Product> {
    // ★ THE CASCADE SET IS DECIDED FIRST, BECAUSE EVERY OTHER DECISION BELOW DEPENDS ON IT - whether a
    // transaction is opened, whether a transient default SKU is refused, and which instance is handed
    // back. It is `isNew()` on each held SKU and nothing else: Hibernate's cascade INSERTED the transient
    // children of a saved parent, and it had a dirty-checked session to decide which of the ALREADY
    // persisted ones also needed writing. Nothing here replaces that session, so re-writing every
    // materialized SKU on every product save would be inventing behaviour - and worse, it would rewrite
    // the `SwSkuOption` membership of SKUs that may have been read without their options, which
    // `mysqlSkuRepository.reconcileSkuOptions` documents as the one hazard of that write.
    const transientSkus = product.getSkus().filter((held: Sku) => held.isNew());

    this.assertAssociationsPersisted(product, transientSkus);

    // The populate step, in the one place it happens. See the CFML parity note above.
    const populatedUrlTitle: string | undefined = Object.hasOwn(data, 'urlTitle')
      ? data.urlTitle
      : product.getUrlTitle();
    const populatedProductName: string | undefined = Object.hasOwn(data, 'productName')
      ? data.productName
      : product.getProductName();

    if (transientSkus.length === 0) {
      // No cascade, so no transaction: this path issues the single row write it always issued, and
      // wrapping one statement in a transaction would report a unit of work that has no second member.
      const rowExists = product.isNew()
        ? false
        : await this.productRowExists(product.getProductID());

      if (!rowExists) {
        return await this.insertProduct(product, populatedUrlTitle, populatedProductName);
      }

      return await this.updateProduct(product, populatedUrlTitle, populatedProductName);
    }

    const writer = this.skuCascadeWriter;

    if (writer === undefined) {
      throw new ProductPersistenceError(
        `it carries ${String(transientSkus.length)} sku(s) that have never been persisted and this ` +
          'repository was constructed without a sku cascade writer, so those rows would be silently ' +
          'dropped',
      );
    }

    // ★ ONE TRANSACTION FOR THE WHOLE AGGREGATE, WHICH IS THE UNIT HIBERNATE'S FLUSH GAVE IT. Three
    // groups of statements have to succeed or fail together: the `SwProduct` row, one `SwSku` row plus
    // its `SwSkuOption` membership per transient SKU, and the deferred `defaultSkuID` update. Any
    // partial application leaves a product with some of its variants, or with a default SKU column that
    // names nothing - and neither state is reachable in the legacy.
    //
    // ⚠ EVERY STATEMENT BELOW THIS LINE MUST ROUTE THROUGH `tx`. Reaching `this.executor` from inside
    // the callback would take a different pooled connection, commit independently, and defeat the
    // rollback - and the compiler cannot see the difference. That is why the plan CARRIES `tx` and why
    // the row-writing methods read their executor off the plan when they hold one.
    return await this.executor.transaction(async (tx): Promise<Product> => {
      const plan: SkuCascadePlan = { transientSkus, writer, tx };

      const rowExists = product.isNew()
        ? false
        : await this.productRowExists(product.getProductID(), tx);

      if (!rowExists) {
        return await this.insertProduct(product, populatedUrlTitle, populatedProductName, plan);
      }

      return await this.updateProduct(product, populatedUrlTitle, populatedProductName, plan);
    });
  }

  // =========================================================================
  // Port method 6 of 7 - deleteProduct (no legacy antecedent on the DAO)
  // =========================================================================

  /**
   * Delete one product.
   *
   * NO LEGACY ANTECEDENT ON THE DAO; deletion ran through the ORM as `super.delete(arguments.product)`
   * [model/service/ProductService.cfc:L326]. The boolean result is the legacy SERVICE-level contract,
   * `public boolean function deleteProduct(required any product)`
   * [model/service/ProductService.cfc:L317], so this reports two outcomes rather than throwing on a
   * refusal.
   *
   * ⚠ WHAT `false` MEANS HERE, AND HOW THAT DIFFERS FROM THE LEGACY `false`. The legacy service returned
   * false when the FRAMEWORK's delete did not proceed - a validation gate on the entity, evaluated before
   * any SQL was issued - and it then RESTORED the default SKU it had nulled out beforehand
   * [model/service/ProductService.cfc:L320-L333]. That gate lived in `HibachiService`/`HibachiDAO`, which
   * is not ported, so it now lives at the service tier where deletability belongs. This method's `false`
   * means the DELETE matched no row, which is the only refusal a driver can report. A genuine
   * foreign-key constraint violation surfaces as the driver's error and PROPAGATES - which is parity,
   * because Hibernate raised a constraint violation in that situation too rather than returning false.
   *
   * ★★ THE DEFAULT-SKU SEQUENCE AND THE CASCADE ARE NOW BOTH REPRODUCED, AND THIS IS THE RECORD OF THAT
   * CHANGE. This block once read: "⚠ THE DEFAULT-SKU NULL-OUT AT [model/service/ProductService.cfc:L323]
   * IS NOT REPRODUCED HERE. It is a three-step sequence - null the association, delete, restore on
   * failure - which is only safe inside a unit of work, and `./connection.js` deliberately publishes no
   * transaction method (§8.4)... It is service-tier orchestration and it stays there." Every clause of
   * that is still true EXCEPT the premise: `./connection.js` publishes `transaction` now, so the unit of
   * work the note required exists, and the sequence became safe to perform exactly where the rows are.
   *
   * ★ THE ROLLBACK IS THE RESTORE, WHICH IS WHY NO RESTORE STATEMENT APPEARS. The legacy nulled the
   * association, called the framework delete, and on failure PUT THE DEFAULT SKU BACK on the in-memory
   * entity [model/service/ProductService.cfc:L330] - a compensating action it needed because its two
   * steps were separately visible. Here both steps live in one transaction, so a failure anywhere
   * discards the detach along with everything else and the row is left exactly as it was found. The
   * compensating write is not omitted; it is unnecessary, and the transaction is what makes it so.
   *
   * ★ THE IN-MEMORY ENTITY IS DELIBERATELY NOT MUTATED, WHICH CLOSES A QUESTION LEFT OPEN ON
   * `Product.setDefaultSku`. That setter accepts a `Sku` and not `undefined`, and the note there defers
   * the clear at [model/service/ProductService.cfc:L323] to this method. The answer is that the clear
   * was never about the caller's object graph - it existed to stop Hibernate flushing a foreign key it
   * could not satisfy, and there is no session here to appease. Nulling the argument's association would
   * instead leave a caller holding a product stripped of its default SKU after a delete that a
   * constraint had refused, which is the very state the legacy's L330 restore existed to prevent. So the
   * setter stays narrow and the detach happens only in SQL.
   *
   * THE ORDER OF THE STATEMENTS IS THE FOREIGN-KEY ORDER, and it is the only order that works: detach
   * the product's `defaultSkuID` so the SKU rows are unreferenced; delete what hangs off those SKUs
   * while a subquery can still find them; delete the SKUs; delete the product's owned link rows and its
   * own one-to-many children; delete the product last. The four tables lists and the two builders above
   * carry the per-table citations.
   *
   * AN UNSAVED PRODUCT IS REFUSED BEFORE THE TRANSACTION OPENS. `isNew()` means the identifier is the
   * empty string [model/entity/Product.cfc:L52]. When this method issued ONE statement, binding `''` and
   * reporting the resulting `false` was the tidier answer and the absence of a guard was a virtue. Now
   * that it issues seventeen inside a unit of work, opening a transaction to bind `''` seventeen times
   * against a row that provably does not exist is waste rather than economy, so the guard earns its
   * place.
   *
   * ⚠ DELETABILITY GATES ARE STILL THE SERVICE TIER'S, AND NONE IS ADDED HERE. `model/validation/Product.json`
   * declares two `"contexts":"delete"` rules - `transactionExistsFlag` must be false and
   * `physicalCounts` must be an empty collection - and both remain out of this method, because
   * `ProductService.deleteProduct` ALREADY DISCHARGES THEM. It probes the first through this port's SKU
   * sibling before delegating here, and it records why the second is unenforceable: `Product.cfc`
   * declares no `physicalCounts` property at all - the collection it actually declares is `physicals`
   * [model/entity/Product.cfc:L90] - so the legacy framework resolved `getPhysicalCountsCount()`
   * through `onMissingMethod` and terminated at a throw. The rule was already unsatisfiable in CFML.
   * That analysis is not restated here; this note exists so that a reader arriving at the cascade does
   * not conclude the gates were forgotten. The `SwOrderItem` foreign key is the database-level backstop.
   *
   * Note also that `physicals` is `inverse="true"` [L90], as are `priceGroupRates` [L88] and `vendors`
   * [L89] - the product does not OWN those link tables, so their rows are correctly absent from the
   * three enumerated on {@link PRODUCT_OWNED_LINK_TABLES}.
   *
   * T3, FETCH SHAPE: nothing is read and nothing is materialized. Seventeen mutations, ONE bound parameter
   * each, all of them the same product key.
   *
   * NET-NEW COVERAGE OBLIGATIONS: the detach precedes every delete; each SKU-dependent table is emptied
   * before `SwSku`; the product row goes last; every statement binds exactly one parameter and travels
   * the transaction executor; a matched row returns true and an unmatched one false; an unsaved product
   * opens no transaction at all; `SwOrderItem` appears nowhere; and the emitted text names only
   * `Sw`-prefixed tables.
   *
   * @param product the product to delete.
   * @returns true when the product row was deleted, false when none matched.
   */
  public async deleteProduct(product: Product): Promise<boolean> {
    if (product.isNew()) {
      // No row exists, so there is nothing to detach, nothing to cascade and nothing to report as
      // deleted. See the guard's justification in the doc block above.
      return false;
    }

    const productID = product.getProductID();

    return await this.executor.transaction(async (tx): Promise<boolean> => {
      // The SQL half of [model/service/ProductService.cfc:L323], first because the mutual foreign key
      // between `SwProduct` and `SwSku` blocks everything that follows while it stands.
      await tx.executeMutation(DETACH_PRODUCT_DEFAULT_SKU_SQL, [productID]);

      // SEQUENTIAL, NOT CONCURRENT, throughout: every statement travels the single connection this
      // transaction holds, which has no statement concurrency to exploit.
      for (const tableName of SKU_DEPENDENT_TABLES) {
        await tx.executeMutation(buildDeleteBySkuOfProductSql(tableName), [productID]);
      }

      // Now that nothing references them. `cascade="all-delete-orphan"` on `skus`
      // [model/entity/Product.cfc:L73], which also subsumes the `cascade="delete"` on the `defaultSku`
      // many-to-one [L70] - that SKU is one of the product's own, so this statement takes it too.
      await tx.executeMutation(buildDeleteByProductIdSql(SKU_TABLE_NAME), [productID]);

      for (const tableName of PRODUCT_OWNED_LINK_TABLES) {
        await tx.executeMutation(buildDeleteByProductIdSql(tableName), [productID]);
      }

      // The seven inverse link tables the framework cleaned in the same sweep; see
      // {@link PRODUCT_INVERSE_LINK_TABLES} for why the inverse half is not left to its owning side.
      for (const tableName of PRODUCT_INVERSE_LINK_TABLES) {
        await tx.executeMutation(buildDeleteByProductIdSql(tableName), [productID]);
      }

      for (const tableName of PRODUCT_DEPENDENT_TABLES) {
        await tx.executeMutation(buildDeleteByProductIdSql(tableName), [productID]);
      }

      const result = await tx.executeMutation(DELETE_PRODUCT_SQL, [productID]);

      // The legacy service's boolean [model/service/ProductService.cfc:L317]. Reporting the PRODUCT
      // row's own result and not the cascade's: a product with no images and no categories deletes
      // successfully having affected zero rows in most of the tables above, and that is a true delete.
      return result.affectedRows > 0;
    });
  }

  // =========================================================================
  // =========================================================================
  // Private - the read path
  // =========================================================================

  /**
   * Materialize a set of products by identifier, preserving the caller's order.
   *
   * THE SINGLE PRODUCT GRAPH LOADER. Every read on this port funnels through it, so the fetch shape is
   * decided in exactly one place - see {@link MysqlProductRepository.getProductByProductID} for the whole
   * decision - and there is no second, subtly different traversal to keep in step.
   *
   * THREE STATEMENTS AT MOST, FOR ANY NUMBER OF IDENTIFIERS: the graph read, then one SKU read bound to an
   * `IN` list, then one option read bound to an `IN` list. A product with no SKUs skips the third; an
   * empty identifier list skips all three and returns `[]` rather than emitting `IN ()`.
   *
   * ORDER IS THE CALLER'S. MySQL does not guarantee that an `IN`-list read returns rows in the order the
   * list was written, and the ported search statement carries no `ORDER BY`, so the rows are indexed by
   * identifier and then re-emitted in the order asked for. An identifier that matched no row is simply
   * absent from the result, which is what makes `getProductByProductID` able to answer `undefined` from
   * the same code path.
   *
   * @param productIDs the identifiers to materialize, in the order the result should carry.
   * @returns the products that exist, in that order.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   * @throws An error named `ProductAssociationError` when a row carries a dangling foreign key.
   */
  private async materializeProducts(productIDs: readonly string[]): Promise<Product[]> {
    if (productIDs.length === 0) {
      return [];
    }

    // De-duplicated for the bind, because a caller may legitimately ask for the same product twice and
    // `IN` would otherwise carry a redundant placeholder. The requested ORDER, duplicates included, is
    // still honoured on the way out.
    const distinctProductIDs = [...new Set(productIDs)];

    const graphRows = await this.executor.execute(
      buildProductGraphSql(distinctProductIDs.length),
      distinctProductIDs,
    );

    if (graphRows.length === 0) {
      return [];
    }

    const foundProductIDs: string[] = [];
    const defaultSkuIDs: string[] = [];

    for (const row of graphRows) {
      foundProductIDs.push(readIdentifier(row, 'p_productID', PRODUCT_GRAPH_LABEL));

      const defaultSkuID = readOptionalText(row, 'p_defaultSkuID', PRODUCT_GRAPH_LABEL);
      if (defaultSkuID !== undefined) {
        defaultSkuIDs.push(defaultSkuID);
      }
    }

    const materializedSkus = await this.readSkus(foundProductIDs, [...new Set(defaultSkuIDs)]);

    const productsByID = new Map<string, Product>();
    for (const row of graphRows) {
      const product = this.buildProduct(row, materializedSkus);
      productsByID.set(product.getProductID(), product);
    }

    const ordered: Product[] = [];
    for (const productID of productIDs) {
      const product = productsByID.get(productID);
      if (product !== undefined) {
        ordered.push(product);
      }
    }

    return ordered;
  }

  /**
   * Read the SKUs of a set of products together with any default SKUs those products name, and index them.
   *
   * TWO INDEXES OFF ONE STATEMENT. `byProductID` satisfies `Product.skus`, the one-to-many keyed on
   * `SwSku.productID` [model/entity/Product.cfc:L73]. `bySkuID` satisfies `Product.defaultSku`, the
   * many-to-one keyed on `SwProduct.defaultSkuID` [model/entity/Product.cfc:L70] - a different
   * association with a different key, which is why {@link buildProductSkusSql} matches on both columns.
   *
   * Each SKU's `options` are materialized by one further statement bound to every SKU identifier at once,
   * so the option load does not run per SKU. That is the explicit alternative to Hibernate's implicit
   * per-collection initialization.
   *
   * @param productIDs the products whose SKU collections are wanted.
   * @param defaultSkuIDs the default-SKU identifiers to resolve, already de-duplicated.
   * @returns the two indexes; both are empty when neither list has an element.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private async readSkus(
    productIDs: readonly string[],
    defaultSkuIDs: readonly string[],
  ): Promise<MaterializedSkus> {
    if (productIDs.length === 0 && defaultSkuIDs.length === 0) {
      return { byProductID: new Map<string, Sku[]>(), bySkuID: new Map<string, Sku>() };
    }

    const skuRows = await this.executor.execute(
      buildProductSkusSql(productIDs.length, defaultSkuIDs.length),
      [...productIDs, ...defaultSkuIDs],
    );

    if (skuRows.length === 0) {
      return { byProductID: new Map<string, Sku[]>(), bySkuID: new Map<string, Sku>() };
    }

    const skuIDs = skuRows.map((row: SqlRow) => readIdentifier(row, 'skuID', PRODUCT_SKUS_LABEL));
    const optionsBySkuID = await this.readSkuOptions(skuIDs);

    const byProductID = new Map<string, Sku[]>();
    const bySkuID = new Map<string, Sku>();

    for (const row of skuRows) {
      const skuID = readIdentifier(row, 'skuID', PRODUCT_SKUS_LABEL);
      const sku = toSku(
        row,
        PRODUCT_SKUS_LABEL,
        optionsBySkuID.get(skuID) ?? [],
        this.collaborators,
      );

      bySkuID.set(skuID, sku);

      // A SKU reached ONLY as a default SKU may belong to another product - or to none, since
      // `SwSku.productID` is nullable - so it is indexed by product only when it actually carries one.
      const owningProductID = readOptionalText(row, 'productID', PRODUCT_SKUS_LABEL);
      if (owningProductID !== undefined) {
        const collection = byProductID.get(owningProductID);
        if (collection === undefined) {
          byProductID.set(owningProductID, [sku]);
        } else {
          collection.push(sku);
        }
      }
    }

    return { byProductID, bySkuID };
  }

  /**
   * Read the options of a set of SKUs and index them by SKU identifier.
   *
   * ONE STATEMENT FOR THE WHOLE SET. `Sku.options` is a many-to-many over `SwSkuOption`
   * [model/entity/Sku.cfc:L76] with no `orderby`, so the elements are appended in the order the database
   * produced them and no ordering is imposed.
   *
   * A SKU with no link rows is ABSENT from the map, and the caller substitutes `[]`. That keeps the map an
   * index of what was found rather than a partially pre-seeded structure.
   *
   * @param skuIDs the SKUs whose option collections are wanted.
   * @returns the options, indexed by SKU identifier.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private async readSkuOptions(skuIDs: readonly string[]): Promise<ReadonlyMap<string, Option[]>> {
    const distinctSkuIDs = [...new Set(skuIDs)];
    const indexed = new Map<string, Option[]>();

    if (distinctSkuIDs.length === 0) {
      return indexed;
    }

    const optionRows = await this.executor.execute(
      buildSkuOptionsSql(distinctSkuIDs.length),
      distinctSkuIDs,
    );

    for (const row of optionRows) {
      const skuID = readIdentifier(row, 'link_skuID', PRODUCT_SKU_OPTIONS_LABEL);
      const option = toOption(row, PRODUCT_SKU_OPTIONS_LABEL);

      const collection = indexed.get(skuID);
      if (collection === undefined) {
        indexed.set(skuID, [option]);
      } else {
        collection.push(option);
      }
    }

    return indexed;
  }

  /**
   * Build one `Product` from its graph row plus the already-materialized SKU indexes.
   *
   * THE SINGLE ROW-TO-ENTITY FACTORY FOR `Product`. All column reading, port injection and association
   * linkage happen here and nowhere else, which is what keeps the fetch shape a property of the read that
   * produced the row rather than something a graph walk can extend behind the caller's back. It issues no
   * statement and reaches no executor.
   *
   * ⚠ A DANGLING MANY-TO-ONE RAISES. `p_brandID` present with `b_brandID` absent means the row references
   * a brand that does not exist, and the same test is applied to the product type and the default SKU. See
   * {@link ProductAssociationError} for why raising is both parity and protection.
   *
   * THE THREE BOOLEANS ARE HANDED OVER UNCOERCED and the ENTITY calls `cfBoolean()` on each - see
   * {@link readFlag}. `publishedFlag` is the one boolean on this component that declares a default, the
   * STRING `"false"` [model/entity/Product.cfc:L58]; `activeFlag` [L53] and `calculatedAllowBackorderFlag`
   * [L64] declare none, so SQL NULL is a genuinely reachable value on both.
   *
   * `calculatedSalePrice` DECLARES NO `default` [model/entity/Product.cfc:L62], so a NULL is carried
   * through as `undefined` and NEVER as `Money.zero` - see {@link readMoney}.
   *
   * `productID` IS LEGITIMATELY THE EMPTY STRING on an unsaved entity [model/entity/Product.cfc:L52], but
   * never on a row read from the database, so {@link readIdentifier}'s emptiness check is correct here.
   *
   * ⚠ `productReviews` [model/entity/Product.cfc:L76] CARRIES THE METADATA TYPO `singlularname`, and this
   * hydration does not touch that collection at all - product reviews are out of scope and no
   * `SwProductReview` statement exists in this module. The typo is recorded in
   * `src/domain/entities/product.ts` where the metadata lives and IS NOT CORRECTED; no naming-convention
   * lint rule is enabled anywhere in this project, precisely so preserved legacy identifiers lint clean.
   *
   * ⚠ TWO ENTITY DEFECTS ARE NOT THIS FILE'S TO COMPENSATE FOR. `Product.getBrandName()`
   * [model/entity/Product.cfc:L524-L532] poisons its own memo to `""`, and `Product.getSalePrice()`
   * [model/entity/Product.cfc:L594-L600] falls through to `return 0` because a statement is missing its
   * `return`. Both live in `src/domain/entities/product.ts` and are preserved there. Nothing is
   * pre-computed, pre-filled or nudged here to work around either: hydrating a "helpful" value would move
   * a preserved defect out of the file that documents it and make the pair impossible to review together.
   *
   * @param row one product graph row.
   * @param materializedSkus the SKU indexes from {@link readSkus}.
   * @returns the product.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   * @throws An error named `ProductAssociationError` when a foreign key names a row that does not exist.
   */
  private buildProduct(row: SqlRow, materializedSkus: MaterializedSkus): Product {
    const productID = readIdentifier(row, 'p_productID', PRODUCT_GRAPH_LABEL);

    // Bound once because TWO members read it. `byProductID` carries only the SKUs whose `productID`
    // matched this product [model/entity/Product.cfc:L73], which is what the one-to-many means and
    // therefore what both the collection and the option-group derivation must see; a default SKU
    // belonging to another product appears in `bySkuID` and deliberately not here.
    const ownSkus = materializedSkus.byProductID.get(productID) ?? [];

    const draft: ProductHydrationDraft = {
      productID,
      activeFlag: readFlag(row, 'p_activeFlag', PRODUCT_GRAPH_LABEL),
      publishedFlag: readFlag(row, 'p_publishedFlag', PRODUCT_GRAPH_LABEL),
      calculatedAllowBackorderFlag: readFlag(
        row,
        'p_calculatedAllowBackorderFlag',
        PRODUCT_GRAPH_LABEL,
      ),
      skus: ownSkus,
      // The option-group association, materialized rather than lazily resolved - see
      // {@link deriveProductOptionGroups} for the three-part smart-list shape it reproduces and for why
      // `byProductID` rather than `bySkuID` is the correct input. Assigned UNCONDITIONALLY, including as
      // an empty array: `src/domain/entities/product.ts` distinguishes "materialized as empty" from
      // "never materialized" and raises only for the second, so a product with no options must arrive
      // with an empty array and not with the key absent.
      optionGroups: deriveProductOptionGroups(ownSkus),
      // T2: the entity's `getService("productService")` reach at [model/entity/Product.cfc:L367] becomes
      // this very instance, injected at construction instead of resolved by name at the point of use.
      productRepository: this,
    };

    const urlTitle = readOptionalText(row, 'p_urlTitle', PRODUCT_GRAPH_LABEL);
    if (urlTitle !== undefined) {
      draft.urlTitle = urlTitle;
    }

    const productName = readOptionalText(row, 'p_productName', PRODUCT_GRAPH_LABEL);
    if (productName !== undefined) {
      draft.productName = productName;
    }

    const productCode = readOptionalText(row, 'p_productCode', PRODUCT_GRAPH_LABEL);
    if (productCode !== undefined) {
      draft.productCode = productCode;
    }

    const productDescription = readOptionalText(row, 'p_productDescription', PRODUCT_GRAPH_LABEL);
    if (productDescription !== undefined) {
      draft.productDescription = productDescription;
    }

    const sortOrder = readOptionalCount(row, 'p_sortOrder', PRODUCT_GRAPH_LABEL);
    if (sortOrder !== undefined) {
      draft.sortOrder = sortOrder;
    }

    const calculatedSalePrice = readMoney(row, 'p_calculatedSalePrice', PRODUCT_GRAPH_LABEL);
    if (calculatedSalePrice !== undefined) {
      draft.calculatedSalePrice = calculatedSalePrice;
    }

    const calculatedQATS = readOptionalCount(row, 'p_calculatedQATS', PRODUCT_GRAPH_LABEL);
    if (calculatedQATS !== undefined) {
      draft.calculatedQATS = calculatedQATS;
    }

    const calculatedTitle = readOptionalText(row, 'p_calculatedTitle', PRODUCT_GRAPH_LABEL);
    if (calculatedTitle !== undefined) {
      draft.calculatedTitle = calculatedTitle;
    }

    const remoteID = readOptionalText(row, 'p_remoteID', PRODUCT_GRAPH_LABEL);
    if (remoteID !== undefined) {
      draft.remoteID = remoteID;
    }

    const createdDateTime = readTimestamp(row, 'p_createdDateTime', PRODUCT_GRAPH_LABEL);
    if (createdDateTime !== undefined) {
      draft.createdDateTime = createdDateTime;
    }

    const createdByAccountID = readOptionalText(row, 'p_createdByAccountID', PRODUCT_GRAPH_LABEL);
    if (createdByAccountID !== undefined) {
      draft.createdByAccountID = createdByAccountID;
    }

    const modifiedDateTime = readTimestamp(row, 'p_modifiedDateTime', PRODUCT_GRAPH_LABEL);
    if (modifiedDateTime !== undefined) {
      draft.modifiedDateTime = modifiedDateTime;
    }

    const modifiedByAccountID = readOptionalText(row, 'p_modifiedByAccountID', PRODUCT_GRAPH_LABEL);
    if (modifiedByAccountID !== undefined) {
      draft.modifiedByAccountID = modifiedByAccountID;
    }

    // The three many-to-one associations. Each is present exactly when its key is, and a key that names
    // no row is a fault rather than an absence.
    const brandID = readOptionalText(row, 'p_brandID', PRODUCT_GRAPH_LABEL);
    if (brandID !== undefined) {
      if (readOptionalText(row, 'b_brandID', PRODUCT_GRAPH_LABEL) === undefined) {
        throw new ProductAssociationError('brand', 'SwBrand', PRODUCT_GRAPH_LABEL);
      }

      draft.brand = toBrandFromGraphRow(row, PRODUCT_GRAPH_LABEL);
    }

    const productTypeID = readOptionalText(row, 'p_productTypeID', PRODUCT_GRAPH_LABEL);
    if (productTypeID !== undefined) {
      if (readOptionalText(row, 'pt_productTypeID', PRODUCT_GRAPH_LABEL) === undefined) {
        throw new ProductAssociationError('productType', 'SwProductType', PRODUCT_GRAPH_LABEL);
      }

      draft.productType = toProductTypeFromGraphRow(row, PRODUCT_GRAPH_LABEL);
    }

    const defaultSkuID = readOptionalText(row, 'p_defaultSkuID', PRODUCT_GRAPH_LABEL);
    if (defaultSkuID !== undefined) {
      const defaultSku = materializedSkus.bySkuID.get(defaultSkuID);
      if (defaultSku === undefined) {
        throw new ProductAssociationError('defaultSku', 'SwSku', PRODUCT_GRAPH_LABEL);
      }

      draft.defaultSku = defaultSku;
    }

    // The remaining collaborator ports, forwarded exactly as injected. Each is optional on the entity, so
    // each is assigned only when present - see {@link ProductHydrationCollaborators} for what each absence
    // costs and where it is documented.
    if (this.collaborators.settingsProvider !== undefined) {
      draft.settingsProvider = this.collaborators.settingsProvider;
    }

    if (this.collaborators.skuRepository !== undefined) {
      draft.skuRepository = this.collaborators.skuRepository;
    }

    if (this.collaborators.optionRepository !== undefined) {
      draft.optionRepository = this.collaborators.optionRepository;
    }

    if (this.collaborators.subscriptionTermProvider !== undefined) {
      draft.subscriptionTermProvider = this.collaborators.subscriptionTermProvider;
    }

    return new Product(draft);
  }

  // =========================================================================
  // Private - the write path
  // =========================================================================

  /**
   * Refuse a save whose associations have never been persisted.
   *
   * CFML parity: Hibernate raised `TransientObjectException` when a save reached an association that had
   * no identifier yet, rather than writing a key it could not satisfy. `isNew()` is the ported
   * `unsavedvalue=""` test, so a transient association's identifier is the EMPTY STRING - and writing
   * `''` into `brandID` would create a row referencing nothing while reporting success.
   *
   * The check runs BEFORE any write and before the existence read, so a refusal changes nothing.
   *
   * ★ THE DEFAULT-SKU ARM IS CONDITIONAL AND THE OTHER TWO ARE NOT, WHICH MIRRORS THE MAPPING RATHER
   * THAN SOFTENING THE CHECK. `brand` and `productType` carry no cascade
   * [model/entity/Product.cfc:L68-L69], so a transient one is a caller error with no remedy - Hibernate
   * raised `TransientObjectException` and so does this. `defaultSku` is different: `Product.skus` carries
   * `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73], the designation is made in memory
   * before either row exists [model/service/SkuService.cfc:L102, L134], and Hibernate persisted the
   * child and then satisfied the parent's key. So a transient default SKU is permitted EXACTLY WHEN this
   * write is going to persist it - that is, when it is one of the transient SKUs held on the product's
   * own collection - and refused otherwise. A default SKU that is transient and NOT in the collection is
   * unreachable from `createSkus`, which links every draft it designates [L100, L128], so refusing it
   * closes a hole rather than rejecting a legitimate shape.
   *
   * @param product the product about to be written.
   * @param transientSkus the never-persisted SKUs this write will cascade to, in collection order.
   * @throws An error named `ProductPersistenceError` when any of the three associations is transient and
   *   this write cannot persist it.
   */
  private assertAssociationsPersisted(product: Product, transientSkus: readonly Sku[]): void {
    const brand = product.getBrand();
    if (brand !== undefined && brand.isNew()) {
      throw new ProductPersistenceError(
        'its brand has never been persisted, so `brandID` would be written as the empty string',
      );
    }

    const productType = product.getProductType();
    if (productType !== undefined && productType.isNew()) {
      throw new ProductPersistenceError(
        'its product type has never been persisted, so `productTypeID` would be written as the empty string',
      );
    }

    const defaultSku = product.getDefaultSku();
    if (defaultSku !== undefined && defaultSku.isNew() && !transientSkus.includes(defaultSku)) {
      throw new ProductPersistenceError(
        'its default sku has never been persisted and is not among the skus held on the product, so ' +
          'this write cannot cascade to it and `defaultSkuID` would name nothing',
      );
    }
  }

  /**
   * Whether a product row carries this identifier.
   *
   * @param productID the identifier to match.
   * @param executor the statement sink. Defaulted to this instance's own so the no-cascade path is
   *   unchanged; the cascade path passes its transaction-bound executor so the existence read and the
   *   writes that depend on it observe the same snapshot.
   * @returns true when a row exists.
   */
  private async productRowExists(
    productID: string,
    executor: PreparedStatementExecutor = this.executor,
  ): Promise<boolean> {
    const rows = await executor.execute(SELECT_PRODUCT_ID_SQL, [productID]);

    return rows.length > 0;
  }

  /**
   * Write the transient SKUs of a product whose row has just been written, then settle the product's own
   * `defaultSkuID`.
   *
   * ★★ THIS IS `cascade="all-delete-orphan"` ON `Product.skus` [model/entity/Product.cfc:L73], MADE
   * EXPLICIT. Under Hibernate a product save flushed its transient children in the same unit of work,
   * wrote each child's `productID` from the parent's freshly minted key, and then issued a follow-up
   * UPDATE for the parent's own `defaultSkuID`. All three of those steps are here, in that order, and the
   * order is forced by the two foreign keys pointing at each other - see
   * {@link UPDATE_PRODUCT_DEFAULT_SKU_SQL}.
   *
   * SERIALLY, NOT CONCURRENTLY, AND THAT IS DELIBERATE. The writes share one connection because they
   * share one transaction, so there is nothing to gain from issuing them together and one thing to lose:
   * `mysql2` serialises statements on a connection anyway, and awaiting each in turn keeps the emitted
   * statement order deterministic, which is what the SQL-shape suites assert against.
   *
   * ★ THE REPLACEMENT COLLECTION PRESERVES POSITION, NOT JUST MEMBERSHIP. `createSkus` derives each
   * skuCode from the collection's length as it grows [model/service/SkuService.cfc:L97], and
   * `getSortedProductSkusID` orders by option-group sort order rather than by array position
   * [model/dao/SkuDAO.cfc:L172], so a caller reading `getSkus()` after a save must see the same order it
   * built. Mapping over the original array rather than concatenating the persisted ones is what
   * guarantees that, and it also carries through any SKU that was ALREADY persisted untouched.
   *
   * ⚠ THE `defaultSkuID` UPDATE IS ISSUED ONLY WHEN THE DESIGNATED SKU WAS ONE OF THE TRANSIENT ONES. A
   * default SKU that already had a key was written into the row by the insert or update that preceded
   * this call, so a second statement would rewrite the value it already holds. A product that designated
   * no default at all gets no statement either, and its column stays NULL - which is what the legacy
   * leaves when no branch of `createSkus` designates one.
   *
   * @param product the product whose collection is authoritative for order.
   * @param productID the key the row now carries, bound as each SKU's `productID`.
   * @param plan the cascade set, the sibling writer and the enclosing transaction.
   * @returns the persisted collection and the resolved default, for the rebuilt instance to report.
   */
  private async cascadeTransientSkus(
    product: Product,
    productID: string,
    plan: SkuCascadePlan,
  ): Promise<PersistedSkuCascade> {
    // Keyed by the DRAFT INSTANCE rather than by an identifier, because the correspondence this map
    // records is between TWO DIFFERENT identifiers. A draft carries the provisional key
    // `skuService.createSkus` minted for it; `saveSkuForProduct` returns an instance carrying the key
    // `insertSku` minted and actually wrote. Neither value is stable across the write, so neither can key
    // the lookup, and the provisional one is additionally a value that exists nowhere once the statement
    // has run. The object reference is the only thing that survives unchanged, and it is the correct
    // discriminator besides: these are the very objects the caller attached.
    //
    // ★ QUOTE-THEN-REVISE. This comment read: "a draft has no identifier to key on - `isNew()` means
    // `getSkuID() === ''`, so every draft on the product would collide under one key." The conclusion
    // (key by identity) was right and the premise was wrong - see the correction on
    // {@link resolvePersistedDefaultSkuKey}. Drafts carry DISTINCT provisional keys, so they would not
    // collide; they would simply be keyed on a value the write throws away.
    const persistedByDraft = new Map<Sku, Sku>();

    for (const draft of plan.transientSkus) {
      persistedByDraft.set(draft, await plan.writer.saveSkuForProduct(draft, productID, plan.tx));
    }

    const skus = product.getSkus().map((held: Sku) => persistedByDraft.get(held) ?? held);

    const designated = product.getDefaultSku();

    if (designated === undefined) {
      return { skus, defaultSku: undefined };
    }

    const persistedDefault = persistedByDraft.get(designated);

    if (persistedDefault === undefined) {
      // Already persisted before this write, so its key went into the row that was just written.
      return { skus, defaultSku: designated };
    }

    await plan.tx.executeMutation(UPDATE_PRODUCT_DEFAULT_SKU_SQL, [
      persistedDefault.getSkuID(),
      productID,
    ]);

    return { skus, defaultSku: persistedDefault };
  }

  /**
   * Insert a product that has no row yet.
   *
   * TWO ROUTES, AND THE DIFFERENCE IS ONLY WHAT IS RETURNED.
   *
   * An entity that has never been persisted has no identifier, so one is minted and the persisted instance
   * is rebuilt from the very record that was written - a NEW instance, because `productID` is immutable on
   * the entity by design and the argument cannot be updated in place to carry the identifier the database
   * now holds. The rebuild forwards the four associations the port requires (`brand`, `productType`,
   * `defaultSku`, `skus`) and deliberately forwards NO other collection: `Product` distinguishes "this
   * association was materialized, possibly as empty" from "it was never materialized at all" - see
   * `getOptionGroups()` in `src/domain/entities/product.ts` - and a save path that never read a collection
   * cannot honestly claim to have materialized it.
   *
   * An entity that carries an identifier but matches no row - saveOrUpdate's DETACHED case - is inserted
   * with that identifier and THE ARGUMENT IS RETURNED, so its whole in-memory graph survives intact.
   *
   * ⚠ ON THE DETACHED ROUTE THE POPULATED VALUES ARE WRITTEN AND THE RETURNED INSTANCE DOES NOT CARRY
   * THEM, because the argument is what is returned and its `urlTitle` is `private readonly`. That is the
   * pre-existing shape of this route rather than anything the payload introduced - the same is true of
   * every other column a detached save writes - and it is the price of handing back the caller's whole
   * in-memory graph. A caller that needs the persisted state reads it back through `getProductByProductID`.
   * The NEW-entity route has no such gap: {@link rebuildProduct} is given the populated values directly.
   *
   * ★ AND WHEN A CASCADE RAN, THE ARGUMENT IS NEVER RETURNED - NOT EVEN ON THE DETACHED ROUTE. The
   * detached route hands back the caller's graph precisely because that graph is still an accurate
   * description of the row. A cascade falsifies it: `SwSku` rows now exist whose keys the argument's
   * drafts cannot report, and `SwProduct.defaultSkuID` now names one of them. So a cascading save always
   * rebuilds, and the rebuild carries the persisted collection.
   *
   * @param product the product to insert.
   * @param urlTitle the url title the populate step settled on, if any.
   * @param productName the product name the populate step settled on, if any.
   * @param plan the SKU cascade to run after the row write, when this save carries transient SKUs. Its
   *   presence also redirects every statement onto the enclosing transaction.
   * @returns the persisted product.
   * @throws An error named `ProductColumnError` when the record does not carry a listed column.
   */
  private async insertProduct(
    product: Product,
    urlTitle: string | undefined,
    productName: string | undefined,
    plan?: SkuCascadePlan,
  ): Promise<Product> {
    // [org/Hibachi/HibachiEntity.cfc:L609] ONE timestamp, written to BOTH stamps, byte-identical.
    const auditTimestamp = new Date();
    const detached = !product.isNew();
    const productID = detached ? product.getProductID() : generatePersistedIdentifier();
    const executor = plan?.tx ?? this.executor;

    const record = toProductRecord(
      product,
      productID,
      urlTitle,
      productName,
      auditTimestamp,
      auditTimestamp,
    );

    await executor.executeMutation(
      INSERT_PRODUCT_SQL,
      toBoundParameters(record, PRODUCT_INSERTED_COLUMNS, PRODUCT_INSERT_LABEL),
    );

    // AFTER the row, because `SwSku.productID` references it, and the transaction is what makes the
    // in-between state unobservable.
    const cascade =
      plan === undefined ? undefined : await this.cascadeTransientSkus(product, productID, plan);

    if (detached && cascade === undefined) {
      return product;
    }

    return rebuildProduct(
      product,
      productID,
      urlTitle,
      productName,
      // [org/Hibachi/HibachiEntity.cfc:L609] the SAME instant in both columns, byte-identical.
      auditTimestamp,
      auditTimestamp,
      this,
      this.collaborators,
      cascade,
    );
  }

  /**
   * Update a product whose row already exists.
   *
   * ★ QUOTE-THEN-REVISE. This method used to be documented as: "THE ARGUMENT IS RETURNED, because it
   * already carries its identifier and every value that was written - only the modified stamp is decided
   * here, and the entity's own `getModifiedDateTime()` is not part of the port's contract for a returned
   * instance." The reasoning was sound and its PREMISE has now stopped holding in one case. The argument
   * carries every value that was written ONLY while every value written is read off the argument. The
   * populate step in {@link MysqlProductRepository.saveProduct} can override two of them, and when it does,
   * handing the argument back reports a url title the row does not hold - which is the very defect the
   * payload was introduced to close, merely relocated from the row to the returned instance.
   *
   * SO THE ROUTE IS CHOSEN BY WHETHER THE POPULATE STEP ACTUALLY CHANGED ANYTHING, and the two branches
   * are each honest about what they can claim:
   *
   * - NOTHING CHANGED - which covers every save whose payload omits both keys, and every save whose
   *   payload restates what the entity already held - and THE ARGUMENT IS RETURNED, byte-for-byte the
   *   prior behaviour. The caller's whole in-memory graph survives, including collections
   *   {@link rebuildProduct} cannot forward, so the common path loses nothing.
   * - A MEMBER WAS OVERRIDDEN, and a rebuilt instance carrying the written values is returned. This
   *   arises when the entity's url title was absent and the service resolved one - exactly the legacy's
   *   `if(isNull(arguments.product.getURLTitle()))` gate [model/service/ProductService.cfc:L268], which
   *   only generates when there is nothing there. The legacy then had the value on the entity it returned
   *   [model/service/ProductService.cfc:L269, L287]; this branch is what keeps that true.
   *
   * ⚠ THE REBUILD BRANCH DOES NOT FORWARD THE COLLECTIONS `Product` TREATS AS "MATERIALIZED OR NOT" -
   * `optionGroups`, `categories`, `relatedProducts`, the promotion collections, `priceGroupRates` - for
   * the reason {@link rebuildProduct} states at length: forwarding them would be a claim a save path
   * cannot back, and forwarding them as `[]` would convert "unknown" into a confident "empty". That is
   * why the branch is entered ONLY when returning the argument would be false rather than merely stale,
   * and why the no-change branch is not routed through the rebuild for uniformity's sake. A caller that
   * needs the full graph after a save reads it back through `getProductByProductID`.
   *
   * `Product` declares no `preUpdate` hook to invoke and no path to maintain, so there is nothing to run
   * before the write and no prior row to feed anything.
   *
   * ★ A CASCADE IS A THIRD REASON TO REBUILD, AND IT OVERRIDES THE NO-CHANGE BRANCH. An existing product
   * can acquire new SKUs - `createSkus` is reached from `processProduct_addOption` and
   * `processProduct_addOptionGroup` as well as from a new-product save
   * [model/service/ProductService.cfc:L150, L279] - and once rows have been written for them, handing
   * back the argument would report a collection of keyless drafts against a database that holds their
   * rows. So when the cascade ran, the rebuild happens whether or not the populate step changed anything.
   *
   * @param product the product to update.
   * @param urlTitle the url title the populate step settled on, if any.
   * @param productName the product name the populate step settled on, if any.
   * @param plan the SKU cascade to run after the row write, when this save carries transient SKUs. Its
   *   presence also redirects every statement onto the enclosing transaction.
   * @returns the argument when the populate step overrode nothing and no cascade ran, and otherwise a new
   *   instance carrying the values that were written.
   * @throws An error named `ProductColumnError` when the record does not carry a listed column.
   */
  private async updateProduct(
    product: Product,
    urlTitle: string | undefined,
    productName: string | undefined,
    plan?: SkuCascadePlan,
  ): Promise<Product> {
    // [org/Hibachi/HibachiEntity.cfc:L662-L667] the modified stamp only; the created pair is not in the
    // SET list at all, so the value passed here for it is never written.
    const modifiedDateTime = new Date();
    const executor = plan?.tx ?? this.executor;

    const record = toProductRecord(
      product,
      product.getProductID(),
      urlTitle,
      productName,
      product.getCreatedDateTime(),
      modifiedDateTime,
    );

    await executor.executeMutation(UPDATE_PRODUCT_SQL, [
      ...toBoundParameters(record, PRODUCT_UPDATED_COLUMNS, PRODUCT_UPDATE_LABEL),
      // THE KEY IS BOUND LAST, matching the statement's `WHERE productID = ?`.
      product.getProductID(),
    ]);

    const cascade =
      plan === undefined
        ? undefined
        : await this.cascadeTransientSkus(product, product.getProductID(), plan);

    const populateOverrodeNothing =
      urlTitle === product.getUrlTitle() && productName === product.getProductName();

    if (populateOverrodeNothing && cascade === undefined) {
      return product;
    }

    return rebuildProduct(
      product,
      product.getProductID(),
      urlTitle,
      productName,
      // The row's own creation stamp, untouched by an update - the created pair is absent from the SET
      // list entirely, so this reports what the row holds rather than what this write decided.
      product.getCreatedDateTime(),
      modifiedDateTime,
      this,
      this.collaborators,
      cascade,
    );
  }
}

// ===========================================================================
// EXCLUSION NOTES - the legacy machinery this adapter deliberately does not port
// ===========================================================================
//
// WHY AN INVENTORY RATHER THAN SILENCE. `model/dao/ProductDAO.cfc` is 441 lines and only a small
// fraction of it is on this port: `getAttributeSets` (L52), `searchProductsByProductType` (L419) and
// the declared-but-unexercised `loadDataFromFile` (L73). Everything between them is bulk-import
// machinery. An implementation that simply omitted it would leave a reader unable to tell an informed
// exclusion from an oversight, so each excluded construct is named here with what it is, where it is,
// and the ground on which it is excluded. An explicit exclusion note is the deliverable; silence is a
// gap. NO BEHAVIOUR FROM ANY OF THE TEN IS PORTED.
//
// ★ "NOT CARRIED FORWARD" IS NEVER A LICENCE TO DELETE. Every construct below stays exactly where it
// is in the legacy tree. The five source files this module was ported from - `model/dao/ProductDAO.cfc`,
// `model/entity/Product.cfc`, `model/entity/ProductType.cfc`, `model/entity/Brand.cfc` and
// `model/service/ProductService.cfc` - are PROVENANCE CITATIONS, NEVER MODIFICATION TARGETS. Zero
// existing repository files are modified by this work; the whole change set is additive under
// `slatwall-ts/`.
//
// LOCATORS BELOW ARE THE ONES VERIFIED BY READING THE FILE, not the ones cited in the plan. Eleven of
// them drift, and the drift table in this module's header records each old-versus-new pair. Where a
// number here disagrees with a number elsewhere, the file won.
//
// ---------------------------------------------------------------------------
// §8.1 - `loadDataFromFile`, the bulk-import body [model/dao/ProductDAO.cfc:L73-L326]
// ---------------------------------------------------------------------------
//
// A 254-line delimited-file importer: it derives a delimiter from the file extension, reads the file,
// walks its rows, and inserts or updates products, SKUs, options and attribute values as it goes. The
// port declares the METHOD, so this module implements it - as an explicitly unimplemented, throwing
// stub carrying its own `TODO:` and its own reasoning. See `MysqlProductRepository.loadDataFromFile`.
//
// The body is excluded because a WORKING importer is not what the port asks for and inventing one
// would be worse than the throw: a caller would believe an import had happened. The execution-model
// mismatch is a PLATFORM FACT and is stated as one - the calling service raises the request timeout to
// 3600 seconds immediately before delegating [model/service/ProductService.cfc:L65-L68], AWS Lambda
// caps a single invocation at 15 minutes, and API Gateway caps a request at 29 seconds. Those are
// published platform limits, not a performance judgement about the legacy code, and NO LATENCY,
// THROUGHPUT, AVAILABILITY OR UPTIME CLAIM IS MADE OR IMPLIED ANYWHERE IN THIS MODULE (B7).
//
// Nothing is invented to work around it: no batching, no chunking, no offset, cursor or resume
// parameter, no streaming handle, no queue or worker hand-off, no progress callback, no idempotency
// key, no compensation story, and no split into a begin/continue pair. The legacy had none of those and
// a port may not add a requirement its source never carried.
//
// ---------------------------------------------------------------------------
// §8.2 - `saveImportData`, private, with its own credential wiring
//        [model/dao/ProductDAO.cfc:L328-L417]
// ---------------------------------------------------------------------------
//
// The importer's persistence half. Excluded on THREE INDEPENDENT GROUNDS, any one of which suffices.
//
//   1. IT IS `private`. The port's method count is the four declared DAO functions less this one
//      helper, plus the three product lifecycle methods, plus the brand save. A private helper is not
//      part of the surface being preserved, and promoting it would be a visibility widening - this
//      module is granted none.
//   2. IT WIRES ITS OWN CONNECTION CREDENTIALS. E6: no credential, datasource name, host or connection
//      string appears in application code. Environment access belongs to `../../lib/config.js` and
//      connection construction belongs to `./connection.js`; this module reads no environment variable,
//      constructs no pool, and receives its executor as a constructor parameter precisely so that it
//      never needs to know any of it.
//   3. IT REACHES AMBIENT REQUEST STATE through the framework scope accessor. T6 replaces ambient scope
//      with an explicit context parameter passed down the call chain. This module holds no ambient
//      state, and the one place the legacy scope used to matter - the audit BY-ACCOUNT columns - is
//      handled by reading whatever the caller hydrated rather than by reaching for a current account.
//
// ⚠ THE THREE-WAY CREDENTIAL-ACCESSOR INCONSISTENCY, recorded because it is part of what is being
// excluded rather than merely adjacent to it. The component publishes `getDBUsername()` and
// `getDBPassword()` at [L157-L158]; `saveImportData` calls that same pair again at [L331-L332]; and a
// THIRD pair, `getUsername()` and `getPassword()`, appears at [L115-L116] - inside a COMMENTED-OUT
// `dbinfo` block spanning [L112-L121]. So the legacy carries two live accessors and two dead ones under
// a different name, for the same two values. None of the three is ported and no equivalent exists here.
//
// ---------------------------------------------------------------------------
// §8.3 - the duplicate `var thisExtraData = []` [model/dao/ProductDAO.cfc:L188, L196]
// ---------------------------------------------------------------------------
//
// CFML parity [model/dao/ProductDAO.cfc:L188,L196]: the same local is declared TWICE with `var`, eight
// lines apart, inside the excluded importer. CFML tolerates the redeclaration and the second one simply
// reassigns.
//
// IT IS NOT REPRODUCED AS A REAL TYPESCRIPT VARIABLE, and could not be: `noUnusedLocals` would reject
// an unread local and `no-redeclare` would reject the duplicate declaration outright. It is recorded
// here as an E8 ANNOTATION AND NOT AS A DIVERGENCE - a divergence is a behavioural difference in ported
// code, and this sits in code that is not ported at all.
//
// ---------------------------------------------------------------------------
// §8.4 - the `transaction { ... }` block [model/dao/ProductDAO.cfc:L177]
// ---------------------------------------------------------------------------
//
// The importer wraps its per-row writes in an ambient CFML transaction. NOT ON THE PORT, and this
// module introduces no replacement: THERE IS NO AMBIENT TRANSACTION IN THE TARGET. The executor type
// published by `./connection.js` deliberately offers only `execute` and `executeMutation` - no `begin`,
// no `commit`, no `withTransaction` - so a repository cannot open one even by accident, and the two
// multi-statement paths in this module say so at the point where it matters: `saveProduct` states that
// its existence read and its write are separate statements, and `materializeProducts` states that its
// three reads are three statements.
//
// A compensation story for the bulk path would have to be authored by whoever ports that path, against
// a requirement the source never wrote down. NONE IS AUTHORED HERE (B7).
//
// ---------------------------------------------------------------------------
// §8.5 - the three dialect branches [model/dao/ProductDAO.cfc:L288, L304, L310]
// ---------------------------------------------------------------------------
//
// Three engine-name comparisons inside the importer's post-processing path. They are NOT modelled as
// live dialect sites: `./dialect.js` deliberately models only the three sites that actually execute -
// [model/dao/PromotionDAO.cfc:L482], [model/dao/PriceGroupDAO.cfc:L57] and [model/dao/SkuDAO.cfc:L194].
// These three sit in code that never runs, so treating them as live would inflate the dialect surface
// with branches no caller can reach.
//
// ⚠ WORTH RECORDING FOR ITS OWN SAKE: [L304] compares against `"mySql"`, a THIRD distinct spelling,
// alongside `"mySQL"` at [L288] and at [model/dao/PriceGroupDAO.cfc:L57], and `"MySQL"` - which is what
// [config/configORM.cfm:L10] actually SETS - at [model/dao/PromotionDAO.cfc:L482]. CFML's `eq` is
// case-insensitive, so all three matched in the legacy; a TypeScript `===` would fail on two of the
// three. That is exactly why `./dialect.js` folds case, and why THIS MODULE INLINES NO DIALECT
// COMPARISON AT ALL: it states its dialect once, as a named constant checked by `assertMySqlDialect`,
// and every statement below that constant is MySQL text by construction.
//
// ---------------------------------------------------------------------------
// §8.6 - raw `createUUID()` [model/dao/ProductDAO.cfc:L223, L248, L275, L410]
// ---------------------------------------------------------------------------
//
// Four sites mint identifiers with the CFML engine's raw `createUUID()` rather than the framework's
// `createSlatwallUUID()`. The two differ in the value they produce: the raw function returns a
// HYPHENATED 35-character form, while the framework's returns the 32-character hyphen-free form that
// the `varchar(32)` key columns of the `Sw*` schema actually hold.
//
// Annotated, and nothing ported. `generatePersistedIdentifier` in this module follows the FRAMEWORK
// convention - a 32-character hyphen-free value - because that is what the schema holds and B5 requires
// the schema to stay untouched. The legacy importer's inconsistency is not imported along with it.
//
// ---------------------------------------------------------------------------
// §8.7 - the reach into a non-Slatwall Mura CMS table [model/dao/ProductDAO.cfc:L262]
// ---------------------------------------------------------------------------
//
// The importer queries a Mura CMS content table - `tContent`, named here once as a CITATION and never
// as an identifier - to resolve content associations. The Mura bridge is EXPLICITLY OUT OF SCOPE, so
// this is excluded outright: NO STATEMENT IN THIS MODULE NAMES ANY TABLE OUTSIDE THE `Sw*` SCHEMA, and
// the ten tables it does name are `SwProduct`, `SwBrand`, `SwProductType`, `SwSku`, `SwSkuOption`,
// `SwOption`, `SwAttributeSet`, `SwAttribute`, `SwType` and `SwAttributeSetProductType`.
//
// FOR CONTRAST, so the two are not confused: `Category.cmsCategoryID` and its `site` association DO
// survive elsewhere in the target, as INERT PERSISTED COLUMNS, so that the schema contract stays
// unbroken. That is a COLUMN preservation with no behaviour attached. This is a TABLE REACH with
// behaviour attached, and the two get opposite treatment for that reason.
//
// ---------------------------------------------------------------------------
// §8.8 - the dead conditional whose branches are identical
//        [model/dao/ProductDAO.cfc:L356-L360]
// ---------------------------------------------------------------------------
//
// CFML parity [model/dao/ProductDAO.cfc:L356-L360]: a two-armed conditional inside `saveImportData`
// whose ARMS ARE CHARACTER-FOR-CHARACTER IDENTICAL, so the test cannot affect the outcome. Recorded as
// an exclusion; NOTHING IS REPRODUCED. There is no behaviour to preserve, because there is no branch
// that behaves differently - and writing a TypeScript conditional whose arms match would be
// transliteration of a defect rather than preservation of a behaviour (B1).
//
// ---------------------------------------------------------------------------
// §8.9 - unquoted, unbound datetime interpolation [model/dao/ProductDAO.cfc:L363, L366]
// ---------------------------------------------------------------------------
//
// Two sites splice a datetime straight into SQL text - a `SET` assignment at [L363] and a `VALUES`
// pair at [L366] - unquoted and with no `cfqueryparam`. Excluded with the rest of `saveImportData`.
//
// ★ IT IS ALSO THE CONCRETE COUNTER-EXAMPLE THAT MOTIVATES E5, and it is worth naming as such because
// it comes from THIS VERY SOURCE FILE rather than from a general principle about SQL. Every value in
// every statement in this module is a positional `?` bound through the executor: the only template
// substitutions in the statement section are `sqlPlaceholderList(...)` calls and joins over frozen
// column lists, `pool.query()` is unreachable because the executor type does not publish it, and
// `namedPlaceholders` is not enabled - so a named legacy HQL parameter becomes a positional bind.
//
// ---------------------------------------------------------------------------
// §8.10 - a DAO reaching the service locator [model/dao/ProductDAO.cfc:L399]
// ---------------------------------------------------------------------------
//
// The importer resolves a framework utility service BY NAME from inside the DAO and calls a filename
// helper on it. This is precisely the construct T1 and T2 exist to remove: T1 replaces DI/1's
// convention scan with an explicit composition root, and T2 replaces every by-name service lookup with
// a constructor-injected port.
//
// Annotated, and nothing ported. THIS REPOSITORY RESOLVES COLLABORATORS THROUGH CONSTRUCTOR INJECTION
// ONLY - the executor and the collaborator bag are its two constructor parameters, the entity ports it
// forwards are typed members of that bag, and `src/handlers/bootstrap.ts` is the one place any of it is
// wired. There is no locator, no registry and no by-name lookup anywhere in this module.
//
// ---------------------------------------------------------------------------
// B5, SCHEMA CONTINUITY - what the ten exclusions add up to
// ---------------------------------------------------------------------------
//
// The excluded machinery is the only part of the legacy DAO that created rows in tables this port does
// not own. With it excluded, this module's whole footprint is reads and writes against the existing
// `Sw*` tables exactly as they stand: NO migration, NO migration tooling, NO rename, NO new table, NO
// column change, and NO `CREATE`, `ALTER` or `DROP` of any kind. There is no `CREATE VIEW` either -
// none exists anywhere in the legacy repository, which is why the three raw-SQL entity-name faults in
// the legacy tree really did fail rather than resolving through a view, and why this module emits the
// physical `Sw*` names as a documented correction.
