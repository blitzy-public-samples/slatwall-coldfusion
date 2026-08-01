// ---------------------------------------------------------------------------
// slatwall-ts - MySQL SKU repository adapter
//
// PURPOSE
//   The secondary adapter behind `src/domain/ports/skuRepository.ts`, porting
//   `model/dao/SkuDAO.cfc` (228 lines). Hibernate, `ormExecuteQuery`,
//   `<cfquery>`, `new Query().setSQL()` and `super.save()` all collapse into
//   prepared statements executed through the injected executor, and the
//   associations Hibernate used to load lazily are MATERIALIZED here instead.
//
// THE PORT IS AUTHORITATIVE, AND IT DECLARES SEVEN METHODS
//   `getTransactionExistsFlag`, `getSkuBySkuCode`, `getSkusBySelectedOptions`,
//   `searchSkusByProductType`, `getProductSkus`, `getSortedProductSkusID` and
//   `saveSku`. This class implements exactly those seven and adds no eighth
//   public member. Where the port and any prose description disagree about a
//   name, a parameter or a return type, the port wins - which it does once,
//   recorded at `searchSkusByProductType` below.
//
//   Names are the legacy CFML names carried over VERBATIM in camelCase (B4),
//   including the trailing `ID` on `getSortedProductSkusID`.
//
// ★ LOCATOR DRIFT - VERIFIED AGAINST THE SOURCE, NOT TRUSTED FROM A CITATION
//   The transformation plan cites `getSortedProductSkusID` as spanning
//   L172-L220. It does NOT. Read verbatim, the `<cffunction>` opens at L172 and
//   closes at L202; L204-L220 is the separate private `getNextOptionGroupSortOrder`
//   and L222-L226 is `clearNextOptionGroupSortOrder`. Every locator in this file
//   was re-read off `model/dao/SkuDAO.cfc` rather than copied from a citation, and
//   one further drift surfaced doing so: `getTransactionExistsFlag` is
//   `<cffunction>` TAG syntax (L53-L98), not cfscript. The port records the same
//   correction independently at `skuRepository.ts:L142-L145`.
//
// THE SOURCE IS MIXED SYNTAX, AND THE MIX PREDICTS THE SCHEMA NAMES
//   The cfscript half (L102-L168) carries HQL through `ormExecuteQuery` and
//   correctly names ORM ENTITIES - `SlatwallSku`, `SlatwallOption`. The tag half
//   (L53-L98, L172-L226) carries raw `<cfquery>` bodies and correctly names
//   PHYSICAL TABLES - `SwSku`, `SwOptionGroup`. Exactly one method breaks the
//   pattern: `searchSkusByProductType` (L130-L148) builds raw SQL with
//   `new Query().setSQL()` yet names `SlatwallSku` and `SlatwallProduct`, so it
//   reaches the datasource unmediated by Hibernate and cannot resolve them. That
//   is the one place this file CORRECTS rather than preserves; the reasoning is at
//   the statement itself.
//
// FETCH SHAPE IS DECIDED HERE, PER METHOD, AND SAID OUT LOUD (T3)
//   There is no ORM, so laziness is not simulated. Every method below states
//   which associations it materializes and to what depth. Two decisions are
//   global to the file and stated once:
//
//     * `Sku.orderItems` is NEVER loaded. [model/entity/Sku.cfc:L71] declares it
//       `lazy="extra"`, and `OrderItem` is out of scope besides. No statement in
//       this file names `SwOrderItem` except inside the existence probe the legacy
//       itself writes, where it is counted and never hydrated.
//     * `Sku.product` is materialized only where the caller already supplied it.
//       Hydrating a `Product` means hydrating its product-type ancestry, which is
//       `productRepository`'s statement to write, not this adapter's. So
//       `getProductSkus` wires through the `Product` it was handed - free and
//       exact, since those SKUs are by definition that product's - and every other
//       method leaves the association unset rather than guessing at it.
//
//   `Sku` DECLARES NO ORM LIFECYCLE HOOKS. Verified: there is no `preInsert` and
//   no `preUpdate` anywhere in `model/entity/Sku.cfc`. Unlike `ProductType` and
//   `PriceGroup`, this entity has no materialized path and no hook behaviour to
//   replace, so NOTHING in this file maintains one. Stated explicitly so that no
//   later reader adds phantom hook replacement.
//
// NOTHING IS MEMOIZED AT MODULE SCOPE
//   The legacy memoizes the option-group place value in a component-level
//   property [model/dao/SkuDAO.cfc:L51, L204-L220]. On a warm Lambda container
//   module state survives between UNRELATED requests, so that memo is an INSTANCE
//   field here and the instance is request-scoped. The connection pool in
//   `./connection.js` is the only sanctioned module-scope state in the target, and
//   this file does not reach it: the executor arrives as a constructor argument.
//
// THIS FILE READS NO ENVIRONMENT VALUE (E6)
//   No `process.env`, no configuration module, no credential, no pool
//   construction. That is also why `./dialect.js` is not imported here even
//   though the legacy branches on the database product at
//   [model/dao/SkuDAO.cfc:L194]: resolving the dialect reads `DB_DIALECT`, and the
//   only statement that needs the branch already owns it. See
//   `getSortedProductSkusID`.
//
// TEST COVERAGE FOR THIS ADAPTER IS NET-NEW, NOT LEGACY PARITY (B8)
//   `meta/tests/unit/dao/` contains only `AccountDAOTest` and `PaymentDAOTest`,
//   neither of which touches `SkuDAO`, and `meta/tests/unit/service/` contains
//   nothing in scope. Every obligation this file states in a NET-NEW COVERAGE note
//   is therefore new coverage and must never be presented as parity. No test file
//   is authored here.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, read completely - it is one
//   sentence. No rule is invented to fill the gap and the absence is not treated
//   as licence to lower the bar: maximal strictness with no `any`, no suppression
//   comment and no non-null assertion; prepared statements exclusively; `Money`
//   built only from a decimal string; one exported unit and no barrel; and every
//   judgment call annotated where it was made.
//
//   No latency, throughput, availability or other non-functional claim appears
//   anywhere below, because none exists in the source to preserve (B7). Where a
//   decision could be mistaken for a speed argument - the currency map, the
//   odometer's float arithmetic - it is framed as what it actually is: fidelity.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';

// JUDGMENT CALL: `product.js` is imported for its TYPE alone, and it is not among the modules named in
// this file's planned dependency list. Two things force it and both are checkable. The port declares
// `getProductSkus(product: Product, fetchOptions: boolean)`, so the parameter type is not optional to
// name; and this file's import allowance is `mysql2`, `src/lib/**`, `src/domain/**` and its two sibling
// SQL modules, of which `src/domain/entities/product.ts` is plainly one.
// `src/repositories/mysql/mysqlPriceGroupRepository.ts` records the identical judgment for the same
// reason. It is an `import type`, so nothing of it survives the emit.
import type { Product } from '../../domain/entities/product.js';
import { Option } from '../../domain/entities/option.js';
import { OptionGroup } from '../../domain/entities/optionGroup.js';
import type { SkuHydrationInput } from '../../domain/entities/sku.js';
import { Sku } from '../../domain/entities/sku.js';
import { SkuCurrency } from '../../domain/entities/skuCurrency.js';
import type { SkuRepository } from '../../domain/ports/skuRepository.js';
import { isCurrencyCode } from '../../domain/valueObjects/currencyCode.js';
import { Money } from '../../domain/valueObjects/money.js';
import { listToArray } from '../../lib/cfml/list.js';
import type { CfStruct } from '../../lib/cfml/struct.js';
import { cfEquals, structGet } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfTruthy, isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlParameter, SqlRow } from './connection.js';
import { sqlPlaceholderList } from './connection.js';
import { buildSkusBySelectedOptionsStatement } from './sql/skusBySelectedOptions.sql.js';
import { buildSortedProductSkusStatement } from './sql/sortedProductSkus.sql.js';

// --- Failure reporting -------------------------------------------------------
//
// Three distinct faults, three types, following the pattern the sibling adapters
// established: each class is LOCAL and unexported, sets an explicit `name`, and is
// identified downstream by that name rather than by importing the constructor.
// Keeping them unexported keeps this module's surface to the repository class
// alone (E7).
//
// NO MESSAGE EVER ECHOES A COLUMN VALUE. Only a column name, a statement label and
// a JavaScript type appear. A SKU row carries no credential, but the same rule
// governs every boundary in this target and an adapter is not the place to make an
// exception to it.

/** A column a statement selected is absent, or holds a type the schema cannot produce. */
class SkuColumnError extends Error {
  /** The column that could not be read, for programmatic inspection. */
  readonly columnName: string;

  /** What was wrong: `'absent'`, or the JavaScript type that arrived. */
  readonly detail: string;

  /** Which statement produced the row. */
  readonly statementLabel: string;

  constructor(columnName: string, detail: string, statementLabel: string) {
    super(
      `Column '${columnName}' of statement '${statementLabel}' is ${detail}. The statement text ` +
        `and the Sw* schema it reads must agree; no value is substituted for a column that cannot ` +
        `be read.`,
    );
    this.name = 'SkuColumnError';
    this.columnName = columnName;
    this.detail = detail;
    this.statementLabel = statementLabel;
  }
}

/** A write could not be carried out, or reported an outcome that cannot be trusted. */
class SkuPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkuPersistenceError';
  }
}

/**
 * A statement asked for a unique row and got more than one.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L102-L103]: `getSkuBySkuCode` runs a `LEFT JOIN` onto
 * `ss.alternateSkuCodes` combined with an `OR`, and executes it with the ORM's `unique=true` flag
 * (the third argument to `ormExecuteQuery`). A SKU carrying TWO OR MORE alternate codes therefore
 * multiplies into two or more rows and the unique flag makes the engine THROW. The legacy has no
 * `distinct`, no `maxResults` and no tiebreaker to stop it.
 * Preserved deliberately; do not fix without a product decision.
 */
class SkuNonUniqueResultError extends Error {
  /** How many rows arrived where at most one was admissible. */
  readonly rowCount: number;

  constructor(rowCount: number) {
    super(
      `Statement 'selectSkuBySkuCode' returned ${String(rowCount)} rows where the legacy asks for a ` +
        `unique result [model/dao/SkuDAO.cfc:L103], so the ORM's unique flag would raise here too. ` +
        `Reached when a matched sku carries two or more alternate sku codes, because the LEFT JOIN ` +
        `onto SwAlternateSkuCode multiplies the row. Reproduced deliberately: adding DISTINCT or a ` +
        `row limit would repair a legacy defect and change which sku is returned.`,
    );
    this.name = 'SkuNonUniqueResultError';
    this.rowCount = rowCount;
  }
}

// --- Statement labels --------------------------------------------------------
//
// One label per statement, used only in error messages so that a failure names the
// statement that produced it. They are identifiers rather than SQL text, so a
// message can never carry a fragment of a query into whatever records it.

const SELECT_SKU_BY_SKU_CODE = 'selectSkuBySkuCode';
const SELECT_SKUS_BY_SELECTED_OPTIONS = 'selectSkusBySelectedOptions';
const SELECT_PRODUCT_OPTION_IDS = 'selectProductOptionIDs';
const SEARCH_SKUS_BY_PRODUCT_TYPE = 'searchSkusByProductType';
const SELECT_PRODUCT_SKUS = 'selectProductSkus';
const SELECT_SORTED_PRODUCT_SKU_IDS = 'selectSortedProductSkuIDs';
const SELECT_TRANSACTION_EXISTS = 'selectTransactionExists';
const SELECT_NEXT_OPTION_GROUP_SORT_ORDER = 'selectNextOptionGroupSortOrder';
const SELECT_SKU_CURRENCIES = 'selectSkuCurrencies';
const SELECT_SKU_OPTIONS = 'selectSkuOptions';
const SELECT_SKU_ACCESS_CONTENT_IDS = 'selectSkuAccessContentIDs';
const SELECT_SKU_SUBSCRIPTION_BENEFIT_IDS = 'selectSkuSubscriptionBenefitIDs';
const INSERT_SKU = 'insertSku';
const UPDATE_SKU = 'updateSku';

// --- Physical columns --------------------------------------------------------
//
// B5 - SCHEMA CONTINUITY. Every name below is a column that already exists on an
// existing `Sw*` table. Nothing here migrates, renames, adds or widens anything,
// and no `CREATE`, `ALTER` or `DROP` appears anywhere in this file.
//
// The write-side ordering is declared ONCE and both the SQL text and the bound
// parameter array are derived from it, so a column and its placeholder cannot
// drift apart.

/**
 * The `SwSku` columns this adapter reads and writes.
 *
 * The order is the declaration order of [model/entity/Sku.cfc:L52-L96] - the eight persistent
 * properties, then the calculated `calculatedQATS` [L62], then the two many-to-one foreign keys
 * `productID` [L65] and `subscriptionTermID` [L66], then `remoteID` [L90], then the four audit
 * columns [L93-L96]. Keeping the source's own order is what lets a reviewer read the two side by side.
 *
 * The one-to-many and many-to-many properties [L69-L87] contribute NO column to `SwSku`: they live in
 * child tables and link tables, which is why they are absent here and materialized separately.
 */
const SKU_COLUMNS = Object.freeze([
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
]);

/**
 * The columns an UPDATE assigns: every column except the primary key.
 *
 * Derived from {@link SKU_COLUMNS} rather than restated, so the two can never disagree. `skuID`
 * is excluded because it is `fieldtype="id" generator="uuid"` [model/entity/Sku.cfc:L52] - an
 * application-minted key that identifies the row being updated and is never itself updated. It is
 * bound separately, as the trailing `WHERE` parameter.
 */
const UPDATED_SKU_COLUMNS = Object.freeze(
  SKU_COLUMNS.filter((columnName) => columnName !== 'skuID'),
);

/**
 * The `SwSkuCurrency` columns the per-currency price map is built from.
 *
 * Order follows [model/entity/SkuCurrency.cfc:L52-L77]: the identifier, the three money columns in
 * the source's own sequence - `price`, then `renewalPrice`, then `listPrice`, which is NOT
 * alphabetical and is not reordered - then the `skuID` foreign key [L59], then `currencyCode` [L68],
 * then `remoteID` [L71] and the four audit columns [L74-L77].
 *
 * `currencyCode` is the SAME COLUMN as the `currency` association's `fkcolumn`
 * [model/entity/SkuCurrency.cfc:L58], surfaced as a readable property by [L68]. It is read and never
 * written; see the reader for why that is structural here rather than a convention.
 */
const SKU_CURRENCY_COLUMNS = Object.freeze([
  'skuCurrencyID',
  'price',
  'renewalPrice',
  'listPrice',
  'skuID',
  'currencyCode',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/**
 * The `SwOption` columns an option is hydrated from. [model/entity/Option.cfc:L52-L74]
 *
 * `defaultImageID` is the `defaultImage` association's foreign key [L60]; `Image` is out of scope,
 * so the column is carried as the opaque identifier the entity declares and no image row is read.
 */
const OPTION_COLUMNS = Object.freeze([
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
]);

/** The `SwOptionGroup` columns an option's group is hydrated from. [model/entity/OptionGroup.cfc:L52-L67] */
const OPTION_GROUP_COLUMNS = Object.freeze([
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
]);

/**
 * Alias prefix for the option-group columns joined alongside an option.
 *
 * `SwOption` and `SwOptionGroup` share four column names outright - `remoteID` and the three
 * audit columns - plus `optionGroupID` itself, so a single flat row cannot carry both sets
 * unprefixed. Prefixing the GROUP side leaves the option columns readable under their own schema
 * names, which keeps the projection diffable against [model/entity/Option.cfc]. The same device is
 * used for the rounding-rule join in `mysqlPriceGroupRepository`.
 */
const OPTION_GROUP_ALIAS_PREFIX = 'optionGroup_';

/** The `SwSkuOption` column carrying the owning sku, used to group joined option rows. */
const SKU_OPTION_LINK_SKU_ID = 'link_skuID';

/**
 * What CFML bound for a `list="true"` parameter whose list parsed to zero elements: a single empty
 * string.
 *
 * Named rather than inlined so the whole empty-list path can be found from one place, and so that the
 * value bound here is provably the same one `mysqlOptionRepository.ts` binds for the same construct.
 * The reasoning is at the single site that uses it, in `searchSkusByProductType`.
 */
const EMPTY_LIST_ELEMENT = '';

// --- Column readers ---------------------------------------------------------
//
// CFML parity [model/dao/SkuDAO.cfc:L182-L189, L211]: query-column access in CFML is
// CASE-INSENSITIVE - `rs.max`, `rs.MAX` and `rs.Max` are one and the same read - and
// the ORM attribute is spelled both `ormtype` and `ormType` across this slice. Every
// read below therefore folds case rather than indexing the row directly, and nothing
// in this file assumes a column's or an alias's casing.
//
// `noUncheckedIndexedAccess` is on, so `row[name]` is `unknown | undefined` at every
// site. That is answered by narrowing, never by a non-null assertion: there is no `!`
// anywhere in this file.

/**
 * Case-folds a column name for comparison.
 *
 * `toLowerCase` and NOT `toLocaleLowerCase`: locale-aware folding maps `I` onto a dotless `ı` under a
 * Turkish locale, and all but one of the column names this file reads carries a capital `I` -
 * `skuID`, `optionID`, `productID`, `optionGroupID`. Column names are ASCII schema identifiers, so
 * locale-invariant folding is the correct rule. Both sibling adapters take the same position.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * The outcome of a column lookup, with "absent" and "present but NULL" kept apart.
 *
 * They are different facts and the difference is load-bearing here more than anywhere else in this
 * folder: a NULL `SwSkuCurrency.price` is a legitimate value that must become `undefined`
 * [model/entity/SkuCurrency.cfc:L53], whereas an ABSENT `price` column means the statement and the
 * schema disagree and must be reported. A single `unknown` return could not tell the two apart, and
 * conflating them is exactly how a no-default money column acquires a zero it never had.
 */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  if (Object.prototype.hasOwnProperty.call(row, columnName)) {
    return { found: true, value: row[columnName] };
  }

  const foldedColumnName = foldIdentifier(columnName);

  for (const presentColumnName of Object.keys(row)) {
    if (foldIdentifier(presentColumnName) === foldedColumnName) {
      return { found: true, value: row[presentColumnName] };
    }
  }

  return { found: false };
}

/** Names a value's JavaScript type for an error message, without ever including the value. */
function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'a Date';
  }

  if (value instanceof Uint8Array) {
    return 'a Uint8Array';
  }

  return `a ${typeof value}`;
}

function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new SkuColumnError(columnName, 'absent', statementLabel);
  }

  return lookup.value;
}

/**
 * Reads a non-null identifier column.
 *
 * Every key in this slice is `generator="uuid"` over a 32-character varchar
 * [model/entity/Sku.cfc:L52], so a key always arrives as a string. A NULL key is a schema violation
 * rather than a data condition, which is why this reader refuses it instead of substituting `''` -
 * the empty string is the framework's `unsavedvalue` and means "not yet persisted", a different fact
 * from "persisted with no key".
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable text column, mapping SQL NULL to `undefined`.
 *
 * The empty string is preserved as the empty string and NOT folded into `undefined`. CFML's
 * `isNull()` answers false for `''`, and the distinction is consumed downstream: `Sku.getSkuCode()`
 * is typed `string | undefined`, and a stored `''` is what `unsavedvalue=""` leaves behind on an
 * unsaved row.
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
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable `datetime` column.
 *
 * `./connection.js` fixes the session time zone at UTC (`timezone: 'Z'`) and leaves `dateStrings`
 * unset, so a `datetime` crosses the boundary as a `Date` already interpreted in UTC in both
 * directions. This reader consumes that policy and neither re-interprets nor re-zones the value; the
 * legacy stored whatever the CFML server's local `now()` produced, and re-zoning here would shift
 * historic timestamps rather than read them. A string is refused rather than parsed, because a string
 * means the pool's date handling changed underneath this adapter and surfacing that is more useful
 * than absorbing it behind an invisible timezone assumption.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (!(value instanceof Date)) {
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a boolean column and hands it on UNCOERCED.
 *
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()`, and it
 * runs in the ENTITY - `src/domain/entities/sku.ts`'s constructor calls it on both `activeFlag` and
 * `userDefinedPriceFlag`, and `src/domain/entities/optionGroup.ts` calls it on `imageGroupFlag` - so
 * this reader deliberately returns the raw `CfBooleanInput` rather than calling it here. Coercing in
 * the adapter would collapse "column is NULL" into "column is false" BEFORE the entity's declared
 * default applies, and the declared defaults are what make the two answers differ: `activeFlag`
 * [model/entity/Sku.cfc:L53] declares `default="1"`, so a NULL must resolve to TRUE, whereas
 * `userDefinedPriceFlag` [L59] declares `default="0"` and must resolve to false. A boolean coerced at
 * the read could only ever produce one of those. Twelve of the eighteen in-scope entities declare no
 * boolean default at all and the literals that do appear are inconsistent - `"0"`, `"1"` and the
 * STRING `"false"` - which is precisely why the decision belongs in one place. Both
 * `mysqlPriceGroupRepository.ts` and `mysqlProductTypeRepository.ts` make the identical decision.
 *
 * FORBIDDEN FORMS, none of which appears anywhere in this file: `Boolean(x)`, `!!x`, `x === 1`.
 *
 * `Uint8Array` is handled because MySQL delivers a `BIT(1)` column as a one-byte buffer. Its first
 * byte is forwarded as a number for `cfBoolean()` to read; an empty buffer carries no bit and is
 * reported as absent.
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

  throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
}

/**
 * Reads a `big_decimal` money column.
 *
 * ⚠⚠ SQL NULL MAPS TO `undefined`, NEVER TO `Money.zero`. THIS IS THE SINGLE HIGHEST-CONSEQUENCE
 * PARITY DECISION IN THIS FILE.
 *
 * [model/entity/SkuCurrency.cfc:L53] declares `price` with NO `default` - one of only four no-default
 * money columns in the whole slice, alongside [model/entity/PriceGroupRate.cfc:L54],
 * [model/entity/PromotionApplied.cfc:L53] and [model/entity/PromotionReward.cfc:L61] - so an absent
 * per-currency price is a REACHABLE state rather than a theoretical one. Substituting zero for it
 * would not merely record a wrong number: `Sku.getPriceByCurrencyCode()`
 * [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, and a zero here would travel
 * through it and SELL PRODUCTS FOR FREE. `Money.zero` exists, and its own documentation forbids this
 * exact use.
 *
 * The distinction goes one level further, and this reader is what makes that expressible. Because
 * CFML CANNOT STORE NULL IN A STRUCT KEY, the legacy's step 2 leaves the `price` sub-key ABSENT when
 * an override row's price is null - which is exactly what lets step 3's `structKeyExists(entry,
 * "price")` test at [model/entity/Sku.cfc:L416] fire and convert. `undefined` is the only value that
 * reproduces "the key was never written"; `Money.zero` would suppress step 3 outright and change the
 * converted price. `getListPriceByCurrencyCode` [L275-L279] and `getRenewalPriceByCurrencyCode`
 * [L281-L285] each perform a SECOND key-existence check for the same reason, and can therefore
 * legitimately answer nothing even for a currency that IS present in the map. The map this adapter
 * feeds must keep "currency absent" and "currency present, this price absent" apart, and passing
 * `undefined` through unflattened is how it does so.
 *
 * E4: the value is read as a STRING and handed to `Money.fromDecimalString`. `decimalNumbers` is
 * deliberately left unset on the pool, so `DECIMAL` arrives as a string and full precision survives
 * the boundary. A numeric `DECIMAL` is therefore a driver-configuration fault and is REPORTED rather
 * than accepted - reading it would route a monetary value through IEEE-754, which no path in this
 * target does. NO MONETARY VALUE IS EVER COERCED WITH `Number()`, `parseFloat` or `parseInt`. The one
 * `Number()` call in this file sits in `readOptionalInteger`, where it narrows an already
 * range-checked `bigint` for the two NON-monetary integer columns; no money column reaches that path.
 * A malformed string is not caught here either:
 * `Money.fromDecimalString` documents that it throws rather than parsing tolerantly, and letting its
 * contract govern beats inventing a second, quieter rule for the same input inside an adapter.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return Money.fromDecimalString(value);
}

/**
 * Reads a nullable `ormtype="integer"` column.
 *
 * Two columns reach this reader and both are genuinely nullable: `SwOption.sortOrder`
 * [model/entity/Option.cfc:L56] and `SwSku.calculatedQATS` [model/entity/Sku.cfc:L62], neither of
 * which declares a default. `Option.sortOrder` in particular MUST stay nullable through the boundary
 * - `src/domain/entities/option.ts` documents that a NULL `sortOrder` makes its product in the
 * odometer's `SUM` NULL and therefore sorts the affected SKU last, which is legacy behaviour that a
 * substituted zero would silently repair.
 *
 * `bigint` is accepted because MySQL can widen an integral result, and it is refused outside the
 * exactly representable range rather than rounded. No monetary column travels this path: money is a
 * decimal STRING routed through `readMoney`, always.
 */
function readOptionalInteger(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }

    throw new SkuColumnError(
      columnName,
      'a big integer outside the exactly representable range',
      statementLabel,
    );
  }

  throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
}

/**
 * Reads a NOT NULL `ormtype="integer"` column.
 *
 * Exactly one column needs it: `SwOptionGroup.sortOrder` is declared `required="true"`
 * [model/entity/OptionGroup.cfc:L58], and `src/domain/entities/optionGroup.ts` types its constructor
 * slot as a bare `number` in consequence. That is not an arbitrary strictness: the group's sort order
 * is the EXPONENT side of the odometer's place-value term, so a missing one does not degrade the
 * ordering - it has no meaning at all.
 */
function readRequiredInteger(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalInteger(row, columnName, statementLabel);

  if (value === undefined) {
    throw new SkuColumnError(
      columnName,
      'null where the schema declares it required',
      statementLabel,
    );
  }

  return value;
}

/**
 * Reads a `COUNT(...)` projection.
 *
 * Kept separate from {@link readOptionalInteger} because a `COUNT` cannot be NULL - MySQL returns 0
 * for an empty set - so a NULL here means the statement is not the statement this reader was written
 * for, and reporting that is better than reading it as zero. `SUM` and `MAX` aggregates are NOT read
 * through here for exactly the opposite reason; see `getNextOptionGroupSortOrder`, where a NULL
 * aggregate is the whole point.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalInteger(row, columnName, statementLabel);

  if (value === undefined) {
    throw new SkuColumnError(columnName, 'null where a count was projected', statementLabel);
  }

  return value;
}

/**
 * Narrows a value this adapter is about to bind.
 *
 * `SqlParameter` admits `null` but not `undefined`, which is the driver's boundary rather than a
 * stylistic choice: `undefined` is how this file models an absent domain value, and it must become
 * the SQL NULL it means before it reaches a statement. Every bound value in this file passes through
 * here, so the mapping exists in one place.
 */
function toBindableValue(value: string | number | boolean | Date | undefined): SqlParameter {
  return value === undefined ? null : value;
}

/** The write-side value map: one entry per physical column, keyed by the column's own name. */
type ColumnValues = Readonly<Record<string, string | number | boolean | Date | undefined>>;

/**
 * Projects a column-value map onto an ordered column list, producing the bound-parameter array.
 *
 * The ordered list is the same constant the SQL text was built from, so a column and its placeholder
 * cannot drift out of step - the ordering exists in exactly one place. A column named in the SQL but
 * missing from the map is REPORTED rather than bound as NULL: a silent NULL would overwrite a stored
 * value with nothing, and on `price` or `activeFlag` that is a data-loss event rather than a
 * nuisance.
 */
function bindColumnValues(
  columnNames: readonly string[],
  values: ColumnValues,
  statementLabel: string,
): SqlParameter[] {
  return columnNames.map((columnName) => {
    if (!Object.prototype.hasOwnProperty.call(values, columnName)) {
      throw new SkuPersistenceError(
        `Statement '${statementLabel}' names column '${columnName}', for which no value was ` +
          `supplied. The column list and the value map are derived from the same source and must ` +
          `agree.`,
      );
    }

    return toBindableValue(values[columnName]);
  });
}

/**
 * Mints a primary key for a first insert.
 *
 * B5: `SwSku.skuID` is `fieldtype="id" generator="uuid" length="32"`
 * [model/entity/Sku.cfc:L52], and the CFML engine's `uuid` generator produced an UNHYPHENATED hex
 * string of exactly that width. Stripping the hyphens from `randomUUID()` reproduces the stored FORM
 * as well as the uniqueness property, which matters because the column length is declared and a
 * hyphenated 36-character value would not fit it. Both sibling adapters use the identical routine.
 */
function mintEntityIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

// --- Grouping child rows onto their parent -----------------------------------

/**
 * CFML parity [model/entity/Sku.cfc:L269-L285, model/entity/SkuCurrency.cfc:L68]: CFML STRUCT KEYS
 * ARE CASE-INSENSITIVE. A struct keyed by `skuID` in the legacy answered to any casing of that
 * identifier, and the legacy reached child collections through exactly such structs. TypeScript
 * object keys are case-sensitive, so every parent-keyed grouping in this file is read through the
 * case-insensitive helpers in `../../lib/cfml/struct.js` rather than by direct indexing. Identifiers
 * make this concrete rather than pedantic: the CFML `uuid` generator emitted UPPERCASE hex while
 * `randomUUID()` emits lowercase, so one `SwSku` table can legitimately hold both casings, and a
 * case-sensitive grouping would split one SKU's currency rows across two buckets.
 *
 * `structGet` is used rather than `structKeyExists` followed by an index, because it is the single
 * lookup that both matches case-insensitively and narrows the result, and `noUncheckedIndexedAccess`
 * makes the two-step form strictly worse.
 */
function groupRowsByParentIdentifier(
  rows: readonly SqlRow[],
  parentColumnName: string,
  statementLabel: string,
): CfStruct<readonly SqlRow[]> {
  const grouped: Record<string, SqlRow[]> = {};

  for (const row of rows) {
    const parentIdentifier = readIdentifier(row, parentColumnName, statementLabel);
    const existing = structGet(grouped, parentIdentifier);

    if (existing === undefined) {
      // The FIRST casing seen becomes the stored key, which is what a CFML struct did: the key is
      // created once, and every later read matches it case-insensitively regardless of how the
      // caller spells it.
      grouped[parentIdentifier] = [row];
      continue;
    }

    existing.push(row);
  }

  return grouped;
}

/**
 * The child rows belonging to one parent, or an empty array when the parent has none.
 *
 * ★ ROW ORDER IS PRESERVED EXACTLY AS THE STATEMENT RETURNED IT, and no statement in this file adds
 * an `ORDER BY` the legacy lacks. For `SwSkuCurrency` that is not incidental:
 * `src/domain/entities/sku.ts` reproduces the legacy's step-2 loop, which has NO `break`, so WHEN
 * TWO OVERRIDE ROWS SHARE A CURRENCY CODE THE LAST ONE WINS
 * [model/entity/Sku.cfc:L399-L414]. Sorting or de-duplicating here would change which override wins
 * and therefore change a price. The legacy has no `ORDER BY` on that collection either, so the
 * order-dependence is carried forward rather than introduced.
 */
function childRowsFor(
  grouped: CfStruct<readonly SqlRow[]>,
  parentIdentifier: string,
): readonly SqlRow[] {
  return structGet(grouped, parentIdentifier) ?? [];
}

/**
 * The distinct identifiers of a set of rows, in first-seen order.
 *
 * Used where a statement projects one identifier column and the result feeds a second, bounded
 * statement. First-seen order rather than sorted order, because sorting would impose an ordering the
 * legacy never had; de-duplicated because binding the same identifier twice would widen an `IN` list
 * for no effect.
 */
function distinctIdentifiers(
  rows: readonly SqlRow[],
  columnName: string,
  statementLabel: string,
): readonly string[] {
  const seen = new Set<string>();
  const identifiers: string[] = [];

  for (const row of rows) {
    const identifier = readIdentifier(row, columnName, statementLabel);
    const foldedIdentifier = foldIdentifier(identifier);

    if (seen.has(foldedIdentifier)) {
      continue;
    }

    seen.add(foldedIdentifier);
    identifiers.push(identifier);
  }

  return identifiers;
}

// --- The statements ---------------------------------------------------------
//
// Statement text for the six methods whose SQL is NOT extracted lives here. The
// `sql/` folder is closed at the five modules the plan names, two of which this
// file imports - `skusBySelectedOptions` and `sortedProductSkus` - and the rest of
// `SkuDAO`'s statements are not among them. Nothing below is exported: this module
// exports the repository class and nothing else (E7).
//
// E5 - PREPARED STATEMENTS EXCLUSIVELY. Every value is a positional `?` bound
// through `executor.execute`. No value is interpolated into any statement in this
// file, `pool.query` is never used, `namedPlaceholders` is not enabled, and the only
// template-literal substitutions that appear are `sqlPlaceholderList(...)` calls and
// frozen column-name constants declared above - never data. This preserves exactly
// the injection-safety property `cfqueryparam` gave the legacy `<cfquery>` bodies.
//
// CFML parity [model/dao/SkuDAO.cfc:L88, L90, L103, L165]: the legacy HQL binds
// NAMED parameters - `:skuID`, `:productID`, `:skuCode` - and `mysql2` is used with
// positional placeholders. Named parameters therefore become positional, which has
// one visible consequence stated once here: where a named parameter appears TWICE in
// one statement, as `:skuCode` does at [L103], the positional form binds the same
// value twice. That is the mechanical equivalent of one named bind, not a second
// value.
//
// JUDGMENT CALL: indentation is NORMALIZED to spaces while every token, every clause
// and every clause ORDER carries across unaltered. A character-for-character CFML
// transliteration would violate the requirement that this port be idiomatic
// TypeScript rather than satisfy it, and the legacy tag bodies are tab-indented with
// trailing whitespace that a template literal would preserve invisibly and the
// repository's whitespace gate would then reject. Whitespace is inert to SQL; the
// clauses are not, and the clauses are what is preserved.

/**
 * Load one SKU by its own code or by any of its alternate codes.
 *
 * Legacy [model/dao/SkuDAO.cfc:L102-L104], whose whole body is one `ormExecuteQuery` call:
 *
 *   SELECT ss FROM SlatwallSku ss LEFT JOIN ss.alternateSkuCodes ascs
 *   WHERE ss.skuCode = :skuCode OR ascs.alternateSkuCode = :skuCode
 *
 * Both aliases are carried over verbatim - `ss` for the SKU and `ascs` for the alternate codes - so
 * the two formulations read alike. `ss.alternateSkuCodes` is the one-to-many at
 * [model/entity/Sku.cfc:L69], whose child table is `SwAlternateSkuCode` with an `skuID` foreign key
 * [model/entity/AlternateSkuCode.cfc:L57], and the association join becomes the explicit `ON` clause
 * SQL requires.
 *
 * ⚠ THE `LEFT JOIN` COMBINED WITH THE `OR` IS WHAT MAKES THIS STATEMENT ABLE TO RETURN MORE THAN ONE
 * ROW, and the legacy asks for a unique result anyway. See {@link SkuNonUniqueResultError} for the
 * defect and why it is reproduced rather than repaired.
 *
 * NOTHING IS ADDED THAT THE LEGACY LACKS: no `DISTINCT`, no `LIMIT`, no `ORDER BY` and no tiebreaker.
 * Each one of those would turn the multi-row throw into a silently chosen row, which is a different
 * behaviour and a repaired defect.
 *
 * The projection is `ss.*` rather than a column list, because the legacy `SELECT ss` returns the whole
 * entity and this adapter hydrates one.
 */
const SKU_BY_SKU_CODE_SQL = `select ss.* from SwSku ss
  left join SwAlternateSkuCode ascs on ascs.skuID = ss.skuID
  where ss.skuCode = ? or ascs.alternateSkuCode = ?`;

/**
 * The distinct option identifiers that genuinely belong to one product.
 *
 * NO LEGACY ANTECEDENT, AND THAT IS STATED PLAINLY RATHER THAN IMPLIED. This statement exists because
 * `./sql/skusBySelectedOptions.sql.js` FAILS CLOSED: it refuses to build its statement when a
 * `productID` is supplied without the product's own option identifiers, on the stated ground that "the
 * adapter that owns this call can always answer what options a product has". This is that answer.
 *
 * It changes no result. The selected options it validates were going to be bound as `EXISTS` predicates
 * either way, and an option that does not belong to the product could never have matched a SKU of that
 * product - the legacy conjunction is unsatisfiable in exactly that case. So the check turns an
 * unsatisfiable statement into a refusal, and leaves every satisfiable one byte-identical.
 *
 * `SwProduct` has NO direct option association - [model/entity/Product.cfc] declares none - so a
 * product's options are reached the way [model/entity/Product.cfc:L256] itself traverses them:
 * `options.skus.product.productID`, which is the option link table joined through to the SKU's product
 * column. Rendered here as the two inner joins that traversal implies.
 */
const PRODUCT_OPTION_IDS_SQL = `select distinct SwOption.optionID from SwOption
  inner join SwSkuOption on SwSkuOption.optionID = SwOption.optionID
  inner join SwSku on SwSku.skuID = SwSkuOption.skuID
  where SwSku.productID = ?`;

// ★ THE ONE PLACE THIS FILE CORRECTS THE SOURCE INSTEAD OF PRESERVING IT.
//
// CFML parity [model/dao/SkuDAO.cfc:L131-L138]: the legacy builds RAW SQL through `new Query()` and
// `setSQL()`, and names `SlatwallSku` and `SlatwallProduct` - ORM ENTITY names - while the physical
// tables are `SwSku` [model/entity/Sku.cfc:L49] and `SwProduct` [model/entity/Product.cfc:L49]. Raw
// SQL reaches the datasource unmediated by Hibernate, so those names cannot resolve and the legacy
// method ALWAYS throws "table doesn't exist". A repository-wide census established the rule that
// predicts this exactly, and it holds in all three directions:
//
//   1. HQL through `ormExecuteQuery` names `Slatwall*` and is CORRECT - Hibernate maps it.
//   2. A tag `<cfquery>` body names physical `Sw*` and is CORRECT - it bypasses Hibernate knowingly.
//   3. Raw SQL through `new Query().setSQL()` names `Slatwall*` and is WRONG - it bypasses Hibernate
//      unknowingly.
//
// There are exactly three mechanism-3 methods in scope: [model/dao/ProductTypeDAO.cfc:L53-L54], this
// one, and [model/dao/ProductDAO.cfc:L420-L427]. It was further verified that NO `CREATE VIEW` exists
// anywhere in the repository, so nothing makes the `Slatwall*` names resolvable.
//
// JUDGMENT CALL: the physical names `SwSku` and `SwProduct` are emitted, as a CORRECTION mandated by
// B5 - the target reads and writes the existing `Sw*` schema, and a statement that cannot resolve a
// table reads nothing at all. This deliberately carries NO `LEGACY-DEFECT` marker: that marker means
// "preserved deliberately", and here the behaviour is corrected rather than preserved. No view is
// created, no alias is added and no DDL of any kind is emitted - the only change is the two table
// names. `src/repositories/mysql/mysqlProductTypeRepository.ts` records the identical judgment for its
// own mechanism-3 statement, and the two are deliberately consistent.
/**
 * Search SKUs by code, optionally narrowed to one or more product types.
 *
 * Legacy [model/dao/SkuDAO.cfc:L132, L135]:
 *
 *   select skuID,skuCode from SlatwallSku where skuCode like :code
 *    and productID in (select productID from SlatwallProduct where productTypeID in (:productTypeIDs))
 *
 * JUDGMENT CALL: THE PROJECTION IS WIDENED FROM TWO COLUMNS TO THE WHOLE ROW, and the PREDICATE is
 * untouched. The legacy returns an array of flat `{"id","value"}` structs [L142-L145], but the port
 * declares `searchSkusByProductType(term?, productTypeID?): Promise<Sku[]>`, and the port is
 * authoritative on the return type. Hydrating a `Sku` needs the row, so the row is what is projected.
 * The alternative - keeping the two-column projection and issuing a second statement to load the
 * matched SKUs - was rejected because it would add a statement the legacy does not have while leaving
 * the predicate identical anyway. Every filtering clause, its wildcard form, its subquery shape and
 * its ordering (there is none) are exactly as written above.
 *
 * ★ THE PRODUCT-TYPE FILTER IS AN `IN` SUBQUERY THROUGH THE PRODUCT TABLE AND IT STAYS ONE. It is
 * deliberately NOT flattened into a join to `SwProduct`, and NOT rewritten as an `EXISTS`. Its sibling
 * `ProductDAO.searchProductsByProductType` [model/dao/ProductDAO.cfc:L419-L427] filters
 * `productTypeID` DIRECTLY on the product row instead, with no subquery at all. The two shapes differ
 * deliberately and must not be unified.
 *
 * COLUMN REFERENCES ARE LEFT UNQUALIFIED, exactly as the legacy writes them - `skuCode`, `productID`,
 * `productTypeID`, with no table prefix and no alias anywhere in the statement. Adding an alias would
 * be a change with no purpose, and MySQL parses the statement as written (verified).
 *
 * @param productTypeIDPlaceholders one `?` per product-type identifier, or the empty string when the
 *   filter does not apply. The caller has already short-circuited the zero-identifier case.
 */
function buildSearchSkusByProductTypeSql(productTypeIDPlaceholders: string): string {
  const base = 'select * from SwSku where skuCode like ?';

  if (productTypeIDPlaceholders.length === 0) {
    return base;
  }

  return `${base} and productID in (select productID from SwProduct where productTypeID in (${productTypeIDPlaceholders}))`;
}

/**
 * The `fetchOptions` join fragment for one base product type, and the ONE shape that has none.
 *
 * Legacy [model/dao/SkuDAO.cfc:L152-L163]. The base statement is `SELECT sku FROM SlatwallSku sku`
 * followed by `WHERE sku.product.productID = :productID`, and between them the legacy inserts one of
 * three eager-fetch fragments chosen by the product's base type.
 *
 * ⚠ FIVE CODE PATHS, FOUR DISTINCT STATEMENTS, AND NO `else` ARM - see the LEGACY-DEFECT marker at
 * `getProductSkus`. This map holds the three recognized branches; an unrecognized base type resolves
 * to `undefined` here and the caller emits the bare statement, which is the same statement the
 * `fetchOptions`-falsy path emits. That collapse is the legacy's behaviour and is reproduced, not
 * repaired.
 *
 * Each fragment is the physical rendering of the association the legacy fetches:
 *
 *   * `contentAccess` -> `INNER JOIN FETCH sku.accessContents contents` [L155]. The association is
 *     many-to-many over link table `SwSkuAccessContent` [model/entity/Sku.cfc:L77]. JOINING THE LINK
 *     TABLE ALONE IS BOTH EXACT AND DELIBERATE: the join's only observable effect on the result set is
 *     "the SKU has at least one access content", which one link row settles, and `Content` is an
 *     out-of-scope entity this adapter must not read.
 *   * `merchandise` -> `INNER JOIN FETCH sku.options option` [L157], over link table `SwSkuOption`
 *     [model/entity/Sku.cfc:L76].
 *   * `subscription` -> TWO joins [L159-L160], and only the second is a FETCH. `INNER JOIN
 *     sku.subscriptionTerm st` is a plain filtering join onto the many-to-one at
 *     [model/entity/Sku.cfc:L66], so it narrows to SKUs that HAVE a subscription term without
 *     materializing one; `INNER JOIN FETCH sku.subscriptionBenefits sb` is over link table
 *     `SwSkuSubsBenefit` [model/entity/Sku.cfc:L78]. Both are reproduced, in that order, and neither
 *     reaches `SubscriptionTerm`'s or `SubscriptionBenefit`'s own columns - both entities are out of
 *     scope.
 *
 * JUDGMENT CALL: the `merchandise` alias is BACKTICK-QUOTED as `` `option` ``. `OPTION` is a reserved
 * word in MySQL 8.0, and the unquoted form is a hard parse error - probed directly against MySQL
 * 8.0.46, which answered `ER_PARSE_ERROR` (1064) for the bare alias and `ER_NO_SUCH_TABLE` (1146),
 * meaning the statement parsed, for the quoted one. Quoting preserves the legacy's alias NAME, which
 * renaming it would not; it is mechanical necessity rather than a semantic change, and it is the
 * minimum such change in this file.
 *
 * ALL THREE JOINS ARE INNER JOINS AND THAT IS LOAD-BEARING. A product whose SKUs have none of the
 * fetched children returns NOTHING when the flag is set. No join is widened to an outer join, and no
 * `DISTINCT` is added - see `getProductSkus` on why the row multiplication is kept.
 *
 * The fragments are three separate constants rather than one keyed map, because the branch that
 * selects between them must reproduce the legacy's `if` / `else if` / `else if` CHAIN - including its
 * order, its case-insensitive comparison and its missing `else` - and a map lookup would flatten all
 * three of those into one indexing expression.
 *
 * The `contentAccess` fetch join [model/dao/SkuDAO.cfc:L155].
 */
const CONTENT_ACCESS_FETCH_JOIN =
  'INNER JOIN SwSkuAccessContent contents on contents.skuID = sku.skuID ';

/** The `merchandise` fetch join [model/dao/SkuDAO.cfc:L157]. See the block above on the quoted alias. */
const MERCHANDISE_FETCH_JOIN = 'INNER JOIN SwSkuOption `option` on `option`.skuID = sku.skuID ';

/** The `subscription` fetch joins [model/dao/SkuDAO.cfc:L159-L160], in the legacy's order. */
const SUBSCRIPTION_FETCH_JOINS =
  'INNER JOIN SwSubscriptionTerm st on st.subscriptionTermID = sku.subscriptionTermID ' +
  'INNER JOIN SwSkuSubsBenefit sb on sb.skuID = sku.skuID ';

/** The bare shape, emitted by TWO of the five paths [model/dao/SkuDAO.cfc:L152-L163]. */
const NO_FETCH_JOIN = '';

/**
 * Assembles one of the four `getProductSkus` statements.
 *
 * The three pieces and their order are the legacy's: the projection and `FROM` [model/dao/SkuDAO.cfc:L152],
 * then the optional fetch join, then the `WHERE` [model/dao/SkuDAO.cfc:L163]. `SELECT sku` becomes
 * `SELECT sku.*` because the legacy returns entities and this adapter hydrates them; the alias `sku`
 * is the legacy's own.
 *
 * `sku.product.productID` becomes `sku.productID`, the physical foreign-key column the many-to-one at
 * [model/entity/Sku.cfc:L65] declares. The legacy's HQL path traverses the association to read the
 * product's key, which is the same column.
 *
 * @param fetchJoin the fragment for the resolved base type, or the empty string for the bare shape.
 */
function buildProductSkusSql(fetchJoin: string): string {
  return `SELECT sku.* FROM SwSku sku ${fetchJoin}WHERE sku.productID = ?`;
}

// LEGACY-DEFECT [model/dao/SkuDAO.cfc:L65-L85]: all TEN `EXISTS` subqueries use UNQUALIFIED
// association paths - `sku.skuID` in the first and `stock.sku.skuID`, `fromStock.sku.skuID` or
// `toStock.sku.skuID` in the other nine - with no `a.` prefix on any of them, even though `a` is the
// alias each subquery declares for its own entity. It works only by CFML/Hibernate path-resolution
// leniency: the engine resolves an unqualified leading segment against the single alias in scope. The
// construction is fragile in exactly the way that implies - any change that brings a second alias into
// one of those subqueries makes the path ambiguous - and it is load-bearing, because those ten probes
// are the whole method.
// Preserved deliberately; do not fix without a product decision.
//
// JUDGMENT CALL: SQL HAS NO IMPLICIT ASSOCIATION JOINS, so the nine stock-mediated paths cannot be
// expressed unqualified at all - `stock.sku.skuID` is two association hops that Hibernate walks and
// that SQL requires as explicit joins. The MINIMUM mechanical change is applied and no more: each of
// those nine subqueries gains one `INNER JOIN` to `SwStock` and its predicate reads the joined table's
// own `skuID` column [model/entity/Stock.cfc:L52, L56], collapsing `stock.sku.skuID` into
// `stock.skuID` because `SwStock` carries the SKU foreign key directly. The join ALIAS is deliberately
// the legacy's own path segment - `stock`, `fromStock`, `toStock` - so the two formulations still read
// alike, and the first subquery, whose path was a single hop onto `SwOrderItem`'s own `skuID` column
// [model/entity/OrderItem.cfc:L63], gains only the `a.` prefix that MySQL requires now that a second
// table is in scope in its siblings. Every alias and the whole assembled statement were probed against
// MySQL 8.0.46 and parse (`ER_NO_SUCH_TABLE`, never `ER_PARSE_ERROR`).
//
// THE TEN SUBQUERIES ARE NOT REDUCED, MERGED, REORDERED OR DE-DUPLICATED. `SwStockAdjustmentItem`
// appears TWICE on purpose - once through `fromStockID` and once through `toStockID`
// [model/entity/StockAdjustmentItem.cfc:L57-L58] - and collapsing the pair into one `OR` inside a
// single subquery would be a rewrite. `SwStockHold` ALSO carries its own `skuID` column
// [model/entity/StockHold.cfc:L63] which the legacy does NOT use, reaching the SKU through `stock`
// [L64] instead; that choice is preserved as written.
//
// The `as id` alias on every projected column is the legacy's and is kept, even though `EXISTS`
// discards the projection entirely.
/**
 * The ten-way transaction existence probe.
 *
 * Legacy [model/dao/SkuDAO.cfc:L57-L85]. The `WHERE` opens with one of two mutually exclusive
 * predicates - the SKU key when a SKU identifier was supplied [L60], otherwise the product key [L62] -
 * and the ten `EXISTS` clauses are `AND`-ed onto it as a single parenthesised `OR` chain.
 *
 * The count projection is `count(ss.skuID)`, exactly as [L57] writes it. It is ALIASED here as
 * `skuCount`, which is mechanical: the legacy reads the result positionally as `results[1]` [L93], and
 * a row from a driver is keyed rather than positional, so the column needs a name to be read by. The
 * alias changes no value.
 *
 * @param keyPredicate either the SKU-key or the product-key predicate, already chosen by the caller.
 */
function buildTransactionExistsSql(keyPredicate: string): string {
  return `SELECT count(ss.skuID) as skuCount FROM SwSku ss WHERE ${keyPredicate}
      AND (
        EXISTS( SELECT a.orderItemID as id FROM SwOrderItem a WHERE a.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.inventoryID as id FROM SwInventory a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.orderDeliveryItemID as id FROM SwOrderDeliveryItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.physicalCountItemID as id FROM SwPhysicalCountItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockAdjustmentDeliveryItemID as id FROM SwStockAdjustmentDeliveryItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockAdjustmentItemID as id FROM SwStockAdjustmentItem a INNER JOIN SwStock fromStock on fromStock.stockID = a.fromStockID WHERE fromStock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockAdjustmentItemID as id FROM SwStockAdjustmentItem a INNER JOIN SwStock toStock on toStock.stockID = a.toStockID WHERE toStock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockHoldID as id FROM SwStockHold a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockReceiverItemID as id FROM SwStockReceiverItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.vendorOrderItemID as id FROM SwVendorOrderItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
      )`;
}

/** The SKU-key predicate [model/dao/SkuDAO.cfc:L60]. Preferred whenever a SKU identifier is supplied. */
const TRANSACTION_EXISTS_SKU_PREDICATE = 'ss.skuID = ?';

/**
 * The product-key predicate [model/dao/SkuDAO.cfc:L62].
 *
 * `ss.product.productID` traverses the many-to-one at [model/entity/Sku.cfc:L65] to read the product's
 * key, which is the `productID` foreign-key column on `SwSku` itself.
 */
const TRANSACTION_EXISTS_PRODUCT_PREDICATE = 'ss.productID = ?';

/**
 * The highest option-group sort order on record.
 *
 * Legacy [model/dao/SkuDAO.cfc:L211], reproduced token for token INCLUDING the alias `max` - which is
 * a function name used as a column label, and which MySQL 8.0.46 accepts (probed). Renaming it would
 * be a gratuitous change to a statement that is otherwise one line long.
 *
 * ⚠ AN AGGREGATE WITH NO `GROUP BY` ALWAYS RETURNS EXACTLY ONE ROW, and `max` in that row is NULL when
 * the table is empty. See `getNextOptionGroupSortOrder` for the defect that follows and how it is
 * handled.
 */
const NEXT_OPTION_GROUP_SORT_ORDER_SQL =
  'SELECT max(SwOptionGroup.sortOrder) as max FROM SwOptionGroup';

/**
 * The per-currency price override rows for a set of SKUs.
 *
 * NO LEGACY STATEMENT ANTECEDENT: `skuCurrencies` is a Hibernate one-to-many [model/entity/Sku.cfc:L72]
 * that the legacy traversed lazily from inside the entity's own cascade
 * [model/entity/Sku.cfc:L399-L414]. There is no ORM here, so the collection is materialized by this
 * statement instead - one statement for the whole result set rather than one per SKU, which is what
 * makes the removal of lazy traversal also the removal of the implicit N+1 that came with it. That is
 * an EXPLICITNESS property: every query this adapter issues is one a reader can point at.
 *
 * ★ NO `ORDER BY`. The entity's step-2 loop has no `break`, so when two override rows share a currency
 * code THE LAST ONE WINS, and the legacy has no ordering on the collection either. Imposing one here
 * would decide which override wins, and that decides a price.
 *
 * @param skuIDPlaceholders one `?` per SKU identifier. The caller short-circuits the empty case, so
 *   this is never the empty string.
 */
function buildSkuCurrenciesSql(skuIDPlaceholders: string): string {
  return `select ${SKU_CURRENCY_COLUMNS.join(', ')} from SwSkuCurrency where skuID in (${skuIDPlaceholders})`;
}

/**
 * The options of a set of SKUs, each with its option group.
 *
 * NO LEGACY STATEMENT ANTECEDENT, for the same reason as the currency rows: `options` is a
 * many-to-many over `SwSkuOption` [model/entity/Sku.cfc:L76] that Hibernate loaded lazily, or eagerly
 * under the `merchandise` fetch join at [model/dao/SkuDAO.cfc:L157].
 *
 * THE OPTION GROUP IS JOINED RATHER THAN FETCHED SEPARATELY, and the join is a LEFT OUTER JOIN. Two
 * reasons, both consequential. `Option.optionGroup` is a many-to-one [model/entity/Option.cfc:L59]
 * with no `notnull`, so an option with no group is representable and must survive the read rather than
 * vanish from it - an inner join here would silently drop it. And the group is not optional
 * information: `OptionGroup.sortOrder` is the exponent side of the odometer's place-value term, and
 * `src/domain/entities/optionGroup.ts` types that slot as a bare `number` because
 * [model/entity/OptionGroup.cfc:L58] declares it `required="true"`.
 *
 * The group's columns are read under the {@link OPTION_GROUP_ALIAS_PREFIX} prefix because the two
 * tables share five column names outright - `optionGroupID`, `remoteID` and the three audit columns -
 * and one flat row cannot carry both sets unprefixed.
 *
 * ★ NO `ORDER BY`. [model/entity/Sku.cfc:L76] declares NO `orderby` attribute on the association, so
 * Hibernate returned the collection unordered and the target does the same. Contrast
 * [model/entity/OptionGroup.cfc:L70], which DOES declare `orderby="sortOrder"` on ITS options - a
 * different collection, on a different entity, and not the one this statement materializes. Ordering
 * the SKU's own options here would add an ordering the legacy lacks.
 *
 * @param skuIDPlaceholders one `?` per SKU identifier; never empty, the caller having short-circuited.
 */
function buildSkuOptionsSql(skuIDPlaceholders: string): string {
  const optionProjection = OPTION_COLUMNS.map((columnName) => `SwOption.${columnName}`).join(', ');
  const optionGroupProjection = OPTION_GROUP_COLUMNS.map(
    (columnName) => `SwOptionGroup.${columnName} as ${OPTION_GROUP_ALIAS_PREFIX}${columnName}`,
  ).join(', ');

  return `select SwSkuOption.skuID as ${SKU_OPTION_LINK_SKU_ID}, ${optionProjection}, ${optionGroupProjection} from SwSkuOption
  inner join SwOption on SwOption.optionID = SwSkuOption.optionID
  left join SwOptionGroup on SwOptionGroup.optionGroupID = SwOption.optionGroupID
  where SwSkuOption.skuID in (${skuIDPlaceholders})`;
}

/**
 * The identifiers on one of the SKU link tables, for a set of SKUs.
 *
 * ★ THIS PROJECTS IDENTIFIERS AND NOTHING ELSE, AND THAT IS THE WHOLE POINT. `accessContents`
 * [model/entity/Sku.cfc:L77] points at `Content` and `subscriptionBenefits` [L78] at
 * `SubscriptionBenefit`; BOTH ENTITIES ARE OUT OF SCOPE and neither has a domain class in this target.
 * `src/domain/entities/sku.ts` models both collections as opaque identifier arrays for exactly that
 * reason, so reading the link table alone is not a shortcut - it is the only read that stays inside
 * the migration's boundary. No statement in this file selects a column of `SwContent` or
 * `SwSubsBenefit`.
 *
 * ★ NO `ORDER BY` on either collection: neither association declares `orderby`.
 *
 * @param linkTableName one of the two in-scope link tables, from a frozen constant - never a
 *   caller-supplied value. E5 governs VALUES, and this is an identifier chosen from a closed set
 *   inside this module, so no `?` can express it.
 * @param identifierColumnName the link table's `inversejoincolumn`, likewise from a frozen constant.
 * @param skuIDPlaceholders one `?` per SKU identifier; never empty.
 */
function buildSkuLinkIdentifiersSql(
  linkTableName: string,
  identifierColumnName: string,
  skuIDPlaceholders: string,
): string {
  return `select ${linkTableName}.skuID as ${SKU_OPTION_LINK_SKU_ID}, ${linkTableName}.${identifierColumnName} from ${linkTableName}
  where ${linkTableName}.skuID in (${skuIDPlaceholders})`;
}

/** The `accessContents` link table and its identifier column [model/entity/Sku.cfc:L77]. */
const ACCESS_CONTENT_LINK = Object.freeze({
  tableName: 'SwSkuAccessContent',
  identifierColumnName: 'contentID',
});

/** The `subscriptionBenefits` link table and its identifier column [model/entity/Sku.cfc:L78]. */
const SUBSCRIPTION_BENEFIT_LINK = Object.freeze({
  tableName: 'SwSkuSubsBenefit',
  identifierColumnName: 'subscriptionBenefitID',
});

/**
 * Inserts one `SwSku` row.
 *
 * B5: the column list is {@link SKU_COLUMNS}, every name of which already exists on `SwSku`. The
 * placeholder count is derived from that same list, so the two cannot drift.
 */
const INSERT_SKU_SQL = `insert into SwSku (${SKU_COLUMNS.join(', ')}) values (${sqlPlaceholderList(
  SKU_COLUMNS.length,
)})`;

/**
 * Updates one `SwSku` row.
 *
 * The assignment list is {@link UPDATED_SKU_COLUMNS} - every column except the key - and the key is
 * bound last, as the `WHERE` parameter. Both lists derive from {@link SKU_COLUMNS}.
 */
const UPDATE_SKU_SQL = `update SwSku set ${UPDATED_SKU_COLUMNS.map(
  (columnName) => `${columnName} = ?`,
).join(', ')} where skuID = ?`;

// --- Hydration collaborators -------------------------------------------------

/**
 * The collaborator ports a hydrated `Sku` carries.
 *
 * JUDGMENT CALL: this type is DERIVED from `SkuHydrationInput` with `Pick` rather than declared by
 * importing the four port modules. `src/domain/ports/settingsProvider.ts`,
 * `currencyConverter.ts` and the price-group resolver are not among this file's declared
 * dependencies, and inventing imports to name types that `sku.ts` already names would widen the
 * dependency surface for no gain. `Pick` on a type this file legitimately imports gives the exact same
 * types, keeps them in lockstep with the entity's own declaration, and cannot drift from it.
 *
 * `skuRepository` is deliberately NOT among them: this class IS a `SkuRepository`, so it injects
 * itself. See {@link MysqlSkuRepository} for why that matters.
 *
 * This is transformation rule T2 applied to the `getService()` locator sites the legacy entity carries
 * - [model/entity/Sku.cfc:L379] and [L421] reach `currencyService`, [L436] reaches
 * `priceGroupService`, and [L568] reaches `skuService`. Each becomes an explicit, typed collaborator
 * wired once in the composition root instead of resolved at runtime by name.
 */
type SkuHydrationCollaborators = Readonly<
  Pick<
    SkuHydrationInput,
    'settingsProvider' | 'currencyConverter' | 'priceGroupResolver' | 'currentAccountContext'
  >
>;

/**
 * A mutable draft of the entity's hydration input.
 *
 * `exactOptionalPropertyTypes` is on, so `{ skuCode: undefined }` is NOT assignable to a member
 * declared `skuCode?: string` - an optional member may be ABSENT or a string, and explicitly
 * `undefined` is neither. Building a mutable draft and assigning only the members that have a value is
 * the cast-free way to express that, and it is the same shape `src/domain/entities/sku.ts` uses inside
 * its own constructor. The mapped type is DERIVED from `SkuHydrationInput` so the two cannot drift.
 */
type SkuHydrationDraft = {
  -readonly [K in keyof SkuHydrationInput]: SkuHydrationInput[K];
};

/**
 * What a read path materializes on the SKUs it returns.
 *
 * T3 - THE FETCH SHAPE IS A DECISION, NOT A DEFAULT, so it is a parameter of the factory rather than
 * something each call site half-decides. Two associations are absent from this type because they are
 * NOT optional: `options` and `skuCurrencies` are materialized on EVERY path, for reasons given at the
 * factory.
 */
type SkuFetchShape = {
  /**
   * The product to wire into each SKU's `product` association, when the caller already has one.
   *
   * Only `getProductSkus` does: it is HANDED a `Product`, and every SKU it returns is by definition a
   * SKU of that product, so the association is exact and free. Every other path knows only an
   * identifier, and hydrating a `Product` from one would mean hydrating its product-type ancestry -
   * `productRepository`'s statement to write, not this adapter's. Those paths leave it unset.
   */
  readonly product: Product | undefined;

  /**
   * Whether to materialize `accessContentIDs` from `SwSkuAccessContent`.
   *
   * True only on the `contentAccess` branch of `getProductSkus`, which is the one place the legacy
   * eagerly fetches that collection [model/dao/SkuDAO.cfc:L155].
   */
  readonly accessContents: boolean;

  /**
   * Whether to materialize `subscriptionBenefitIDs` from `SwSkuSubsBenefit`.
   *
   * True only on the `subscription` branch [model/dao/SkuDAO.cfc:L160].
   */
  readonly subscriptionBenefits: boolean;
};

/** The fetch shape every path other than `getProductSkus` uses: options and currencies only. */
const BARE_SKU_FETCH_SHAPE: SkuFetchShape = Object.freeze({
  product: undefined,
  accessContents: false,
  subscriptionBenefits: false,
});

// --- Entity factories --------------------------------------------------------

/**
 * Builds one `SkuCurrency` from a `SwSkuCurrency` row, or refuses the row.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L68]: `currencyCode` is declared `insert="false"
 * update="false"` - a READ-ONLY PROJECTION of the `currency` many-to-one's foreign key at [L58] -
 * and it carries NO `ormtype`, NO `length` and no format constraint of any kind. Nothing about the
 * stored value is normalised here: it is not trimmed, not case-folded, not truncated to three
 * characters, and no default is substituted for it.
 *
 * JUDGMENT CALL: THE GUARD IS `isCurrencyCode`, AND A ROW THAT FAILS IT IS SKIPPED. This is not a
 * validation rule this adapter invents - it is the contract two dependencies state explicitly, and
 * they leave no alternative:
 *
 *   * `src/domain/valueObjects/currencyCode.ts` documents `isCurrencyCode` as "the correct tool at a
 *     repository-hydration boundary", precisely because "a malformed or absent column should be
 *     branched on rather than turned into an exception halfway through building an entity". It applies
 *     length only - no trimming, no case folding - so `'usd'` passes and matches the cascade's
 *     case-insensitive `cfEquals` test exactly as it did in CFML.
 *   * `src/domain/entities/skuCurrency.ts` types the member `currencyCode: CurrencyCode`,
 *     NON-OPTIONAL, and says in as many words that this "puts the obligation to refuse such a row at
 *     the hydration boundary". The branded type cannot be satisfied by a non-conforming string without
 *     a cast, and this file contains none.
 *
 * WHY SKIPPING IS THE FAITHFUL BRANCH RATHER THAN A REPAIR, for a non-null malformed code: such a row
 * is INERT in the legacy cascade. Step 2 [model/entity/Sku.cfc:L399-L414] keeps a row only when its
 * code equals a currency drawn from the eligible-currency list, and every code in that list is three
 * characters, so a code of any other length can never match and the row can never contribute a price.
 * Dropping it and keeping it are observationally identical.
 *
 * THE ONE CASE WHERE IT IS NOT IDENTICAL, RECORDED RATHER THAN GLOSSED: `currencyCode` is a
 * many-to-one foreign key with no `notnull`, so SQL NULL is representable, and in the legacy a NULL
 * would reach `cfEquals` and RAISE - CFML comparison of a null operand is an error. In the target such
 * a row is skipped and the cascade proceeds. That difference is not this adapter's choice to make or
 * unmake: `skuCurrency.ts` fixed it by typing the member non-optional and delegating the refusal here.
 * It is stated so a reviewer can see it rather than infer it.
 *
 * THE THREE MONEY COLUMNS ARE ASYMMETRIC AND THE ASYMMETRY IS PRESERVED EXACTLY. `price` at
 * [model/entity/SkuCurrency.cfc:L53] declares NO `default`, so a NULL becomes `undefined`;
 * `renewalPrice` [L54] and `listPrice` [L55] DO declare `default="0"`. All three are read through
 * {@link readMoney} and passed through unflattened, so the entity - which applies no default of its
 * own, by its own statement - receives exactly what the row holds. That is what keeps "currency
 * present, this price absent" distinguishable from "currency absent", which the two second
 * key-existence checks at [model/entity/Sku.cfc:L275-L285] depend on.
 *
 * The `sku` back-reference is deliberately left `undefined`. Populating it would make the SKU and its
 * currency rows mutually referential, and nothing in the cascade reads it: step 2 reaches the
 * collection from the SKU side only.
 */
function toSkuCurrency(row: SqlRow, statementLabel: string): SkuCurrency | undefined {
  const currencyCodeValue = readOptionalText(row, 'currencyCode', statementLabel);

  if (!isCurrencyCode(currencyCodeValue)) {
    return undefined;
  }

  return new SkuCurrency({
    skuCurrencyID: readIdentifier(row, 'skuCurrencyID', statementLabel),
    price: readMoney(row, 'price', statementLabel),
    renewalPrice: readMoney(row, 'renewalPrice', statementLabel),
    listPrice: readMoney(row, 'listPrice', statementLabel),
    currencyCode: currencyCodeValue,
    sku: undefined,
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * Builds the joined `OptionGroup` for one option row, or reports that the option has none.
 *
 * The group arrives through the LEFT OUTER JOIN on the option read rather than through a second
 * statement, which is the same technique `mysqlPriceGroupRepository.ts` uses for its rounding-rule
 * lookup. Every column is read from its prefixed alias, and the join's outer-ness is what makes an
 * option with no group answer `undefined` here instead of disappearing from the result set.
 *
 * FETCH SHAPE (T3): the group is materialized WITHOUT its own `options` collection - the array is
 * empty - and that is a decision rather than an oversight. Populating it would mean loading every
 * option of every group any of this SKU's options belongs to, which is a strictly larger read than any
 * consumer asks for; and it would create a cycle, since each of those options points back at the same
 * group. What the group is needed FOR is its `sortOrder`, the exponent side of the odometer's
 * place-value term, and that is a column on the group's own row. The consequence a reader must know:
 * `OptionGroup.getOptions()` on an instance produced here answers `[]`, and that means "this read did
 * not materialize them", not "the group has none".
 *
 * `imageGroupFlag` is handed over UNCOERCED for the reason {@link readFlag} gives - `optionGroup.ts`
 * calls `cfBoolean()` on it, and coercing twice would collapse the NULL case before the entity's
 * declared default applies.
 *
 * `optionSortTieBreaker` is passed as `undefined` explicitly, which the entity's own constructor reads
 * as "use the legacy random source" and substitutes its default for. It is a required member of that
 * constructor's parameter type, so omitting it would not compile; passing `undefined` is how the
 * default is requested rather than overridden.
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
    sortOrder: readRequiredInteger(row, `${OPTION_GROUP_ALIAS_PREFIX}sortOrder`, statementLabel),
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
 * Builds one `Option` from a joined `SwSkuOption` / `SwOption` / `SwOptionGroup` row.
 *
 * FETCH SHAPE (T3): the option carries its OPTION GROUP and nothing else. `images` is left empty
 * because `Image` is out of scope and `src/domain/entities/option.ts` documents that an empty array
 * there is a fetch-shape answer rather than a claim that the option has no images; `skus` is left
 * empty because populating it would point every option back at the SKUs that own it, for information
 * no consumer of this read asks for; and the four promotion link collections are left empty because
 * the promotion engine reaches them from the reward and qualifier side through
 * `promotionRepository`, never from the option.
 *
 * `sortOrder` is read as a NULLABLE integer and stays nullable. `src/domain/entities/option.ts`
 * records why that matters: a NULL `SwOption.sortOrder` makes its product in the odometer's `SUM`
 * NULL and therefore sorts the affected SKU last, and substituting a zero would silently repair
 * that ordering.
 *
 * `defaultImageID` is carried as the opaque identifier the entity declares - the `defaultImage`
 * many-to-one's foreign key [model/entity/Option.cfc:L60] - and no image row is read for it.
 */
function toOption(row: SqlRow, statementLabel: string): Option {
  return new Option({
    optionID: readIdentifier(row, 'optionID', statementLabel),
    optionCode: readOptionalText(row, 'optionCode', statementLabel),
    optionName: readOptionalText(row, 'optionName', statementLabel),
    optionDescription: readOptionalText(row, 'optionDescription', statementLabel),
    sortOrder: readOptionalInteger(row, 'sortOrder', statementLabel),
    optionGroup: toOptionGroup(row, statementLabel),
    defaultImageID: readOptionalText(row, 'defaultImageID', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

// --- The adapter -------------------------------------------------------------

/**
 * The MySQL implementation of `SkuRepository`.
 *
 * Seven public methods, matching the port exactly - no eighth, and no private helper promoted to
 * public. The absence of an eighth is itself part of the contract, for the reason recorded
 * immediately below.
 *
 * LEGACY-DEFECT [model/service/SkuService.cfc:L281]: `getSkuStocksDeletableFlag(required string
 * skuID)` delegates to a `SkuDAO` method THAT DOES NOT EXIST. The proof is four-legged and complete:
 * it is absent from [model/dao/SkuDAO.cfc] (whose entire method inventory is L53, L102, L107, L130,
 * L150, L172, L204, L222); it is absent from `org/Hibachi/HibachiDAO.cfc`'s fourteen functions;
 * `HibachiDAO.cfc` declares NO `onMissingMethod`, so there is no dynamic-dispatch rescue; and no
 * ancestor supplies it. The legacy call therefore THROWS. Preserved deliberately; do not fix without
 * a product decision - and note that here "preserving" the defect means declaring NO such method,
 * because a working implementation is precisely what the legacy does not have. Supplying one under
 * this or any other name would be an unsanctioned expansion of the port surface, and this folder has
 * zero signature reshapings and zero divergences to spend.
 *
 * @see `src/domain/ports/skuRepository.ts` for the authoritative contract, which declares seven
 *   methods and independently records the same absence.
 */
export class MysqlSkuRepository implements SkuRepository {
  /**
   * The next available option-group sort order, memoised for the life of this instance.
   *
   * ★ REQUEST-SCOPED, NOT MODULE-SCOPED, AND THAT DISTINCTION IS A CORRECTNESS ONE.
   * [model/dao/SkuDAO.cfc:L51] declares `<cfproperty name="nextOptionGroupSortOrder" type="numeric" />`
   * and [L205-L217] memoises into it, which in CFML is COMPONENT-level state - the ported equivalent of
   * module-level state in JavaScript. On a warm Lambda container module state survives between
   * UNRELATED invocations, so reproducing it at module scope would let one request's option-group
   * topology decide another request's SKU ordering. An instance field, on a request-scoped instance,
   * has the memo's intended lifetime: within one call chain it is computed once, exactly as the legacy
   * computed it once per request.
   *
   * JUDGMENT CALL: this is the ONLY mutable state in this file, and it is deliberately an instance
   * field rather than a module `let`. `src/services/roundingRuleService.ts` takes the identical
   * position for its own details memo, for the identical reason. The connection pool inside
   * `./connection.js` remains the only sanctioned module-scope state anywhere in the target, and this
   * file does not construct or reach it.
   */
  private nextOptionGroupSortOrder: number | undefined;

  /**
   * JUDGMENT CALL: THE EXECUTOR ARRIVES AS A CONSTRUCTOR PARAMETER AND IS NEVER REACHED AS A MODULE
   * SINGLETON. `./connection.js` states this as a mandatory design constraint rather than a
   * convenience, and the reason is testability at exactly the boundary this class owns: the repository
   * integration suites assert EMITTED SQL TEXT AND BOUND PARAMETER ARRAYS with no live database, which
   * is only possible if the statement sink can be substituted. Calling
   * `getPreparedStatementExecutor()` from inside a method would make that impossible and would also
   * make this class read configuration it has no business reading (E6).
   *
   * JUDGMENT CALL: the hydration collaborators are a SECOND constructor parameter with a default of
   * `{}`, and the default is what lets a SQL-shape test construct this class with an executor alone.
   * Their effect on behaviour is precise and bounded: when both the settings provider and the currency
   * converter are present, the four-step currency cascade is materialised during hydration; when they
   * are not, the returned SKUs answer `{}` from `getCurrencyDetails()`. That second state is NOT a
   * degraded target-only mode - it is a state the legacy reaches too, whenever
   * `skuEligibleCurrencies` resolves empty and the gate at [model/entity/Sku.cfc:L373] closes, which
   * `src/domain/entities/sku.ts` documents in those terms.
   *
   * NOTHING IS CACHED ACROSS INSTANCES and no field on this class is a cache except the request-scoped
   * memo above.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly collaborators: SkuHydrationCollaborators = {},
  ) {}

  // =========================================================================
  // The seven port methods
  // =========================================================================

  // LEGACY-DEFECT [model/service/SkuService.cfc:L285-L287]: the service declares
  // `getTransactionExistsFlag()` with NO arguments and forwards `argumentCollection=arguments` to the
  // DAO, so neither `productID` nor `skuID` is ever supplied. The DAO's key branch at
  // [model/dao/SkuDAO.cfc:L59-L63] then falls to its `<cfelse>` arm and binds `arguments.productID`,
  // which does not exist - CFML raises "element PRODUCTID is undefined". The service call is a
  // guaranteed runtime failure today.
  // Preserved deliberately; do not fix without a product decision.
  //
  // No default is added for either argument and no guard suppresses the failure: a call supplying
  // neither identifier raises here, as it does there. The port declares both parameters optional
  // because the legacy `<cfargument>` declarations at [model/dao/SkuDAO.cfc:L54-L55] omit `required`,
  // so the impossibility is expressed at the call rather than in the signature - which is exactly the
  // shape of the legacy defect.
  /**
   * Whether any transaction record references the SKU, or any SKU of the product.
   *
   * Legacy [model/dao/SkuDAO.cfc:L53-L98].
   *
   * FETCH SHAPE (T3): NO ENTITY IS HYDRATED AND NO ASSOCIATION IS MATERIALIZED. The statement projects
   * a single `count(...)` and the method answers a boolean, so there is nothing to build. In
   * particular `SwOrderItem` is COUNTED and never read: `Sku.orderItems` is `lazy="extra"`
   * [model/entity/Sku.cfc:L71] and `OrderItem` is out of scope, and an existence probe is the one
   * legitimate way this file may name that table.
   *
   * CFML parity [model/dao/SkuDAO.cfc:L59-L63, L87-L91]: the SKU identifier is PREFERRED when both are
   * supplied, and the legacy tests that preference TWICE with an identical condition - once to choose
   * the predicate and once again to choose the parameter struct. The duplication is harmless because
   * the condition cannot change between the two tests, and it is reproduced here as one decision used
   * for both purposes rather than as two identical tests, because a second evaluation of an unchanged
   * condition is not a behaviour.
   *
   * NET-NEW COVERAGE (B8): the obligations are the SKU-preferred path, the product-fallback path, the
   * zero-count false answer, the non-zero-count true answer, and the raise when neither identifier is
   * supplied.
   *
   * @param productID product whose SKUs are tested when no SKU is supplied.
   * @param skuID SKU to test; takes precedence when both arguments are supplied.
   * @returns true when at least one referencing record exists.
   */
  public async getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
    // [model/dao/SkuDAO.cfc:L59] `structKeyExists(arguments, "skuID") && !isNull(arguments.skuID)`.
    // Both halves of that condition collapse into one `!== undefined` test here: `undefined` is how an
    // absent argument arrives in TypeScript and `isNullish` carries the same meaning for a value. The
    // empty string is NOT absent, in CFML or here, so an empty `skuID` takes the SKU branch and binds
    // it - the same wart class as the unguarded `productID` test in `getSkusBySelectedOptions`.
    const useSkuIdentifier = skuID !== undefined;

    if (!useSkuIdentifier && productID === undefined) {
      throw new SkuColumnError(
        'productID',
        'not supplied, and no skuID was supplied either',
        SELECT_TRANSACTION_EXISTS,
      );
    }

    const keyPredicate = useSkuIdentifier
      ? TRANSACTION_EXISTS_SKU_PREDICATE
      : TRANSACTION_EXISTS_PRODUCT_PREDICATE;

    // Exactly one value is bound, matching the single named parameter the legacy supplies at
    // [model/dao/SkuDAO.cfc:L88] or [L90]. `productID` is narrowed by the guard above, so no
    // non-null assertion is needed to satisfy the compiler.
    const boundKey = useSkuIdentifier ? skuID : productID;

    if (boundKey === undefined) {
      throw new SkuColumnError(
        useSkuIdentifier ? 'skuID' : 'productID',
        'not supplied',
        SELECT_TRANSACTION_EXISTS,
      );
    }

    const rows = await this.executor.execute(buildTransactionExistsSql(keyPredicate), [boundKey]);

    // [model/dao/SkuDAO.cfc:L93-L97] `if(results[1] eq 0) return false; return true;`. An aggregate
    // with no `GROUP BY` always returns exactly one row, so the absence of that row means the
    // statement is not the statement this method issued, and it is reported rather than read as zero.
    const countRow = rows[0];

    if (countRow === undefined) {
      throw new SkuColumnError(
        'skuCount',
        'missing because the aggregate returned no row at all',
        SELECT_TRANSACTION_EXISTS,
      );
    }

    return readCount(countRow, 'skuCount', SELECT_TRANSACTION_EXISTS) !== 0;
  }

  /**
   * Load a SKU by its code or one of its alternate codes.
   *
   * Legacy [model/dao/SkuDAO.cfc:L102-L104].
   *
   * ABSENT MEANS ABSENT: a miss answers `undefined`, never a zero-valued `Sku` and never an empty
   * object. That is the same house rule the three currency accessors follow, and for the same reason -
   * a fabricated default here would travel into a price.
   *
   * ⚠ TWO OR MORE ROWS RAISE. The legacy passes `true` as the third argument to `ormExecuteQuery`,
   * requesting a unique result, while its own `LEFT JOIN` onto `SwAlternateSkuCode` can multiply the
   * row. See {@link SkuNonUniqueResultError}. No `DISTINCT`, no `LIMIT` and no tiebreaker is added to
   * suppress it, because each of those would silently choose a row the legacy refuses to choose.
   *
   * FETCH SHAPE (T3): the SKU arrives with its OPTIONS - each carrying its option group - and its
   * per-currency price rows, with the currency cascade materialised. `SwAlternateSkuCode` is JOINED
   * for the predicate and NOT projected: `alternateSkuCodeIDs` is left unmaterialised because nothing
   * in the ported slice reads it, and the legacy `SELECT ss` did not fetch it either.
   *
   * NET-NEW COVERAGE (B8): the obligations are a hit on the SKU's own code, a hit through an alternate
   * code, a miss answering `undefined`, the two-row raise, and the fact that the same value is bound
   * TWICE.
   *
   * @param skuCode code to match.
   * @returns the SKU, or `undefined` when nothing matches.
   */
  public async getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
    // The legacy HQL names `:skuCode` twice and binds it once [model/dao/SkuDAO.cfc:L103]. Positional
    // placeholders have no such sharing, so the one value is bound to both positions. No validation,
    // trimming or emptiness test is applied - the legacy applies none, and a value travelling as a
    // bound placeholder needs none.
    const rows = await this.executor.execute(SKU_BY_SKU_CODE_SQL, [skuCode, skuCode]);

    if (rows.length === 0) {
      return undefined;
    }

    if (rows.length > 1) {
      throw new SkuNonUniqueResultError(rows.length);
    }

    const hydrated = await this.hydrateSkus(rows, SELECT_SKU_BY_SKU_CODE, BARE_SKU_FETCH_SHAPE);

    return hydrated[0];
  }

  // ★★ MUST-PRESERVE BEHAVIOUR: AND-of-EXISTS CONJUNCTIVE OPTION MATCHING (B2).
  //
  // CFML parity [model/dao/SkuDAO.cfc:L107-L128]: the statement text is built by
  // `./sql/skusBySelectedOptions.sql.js` and is deliberately NOT re-authored here. That module owns
  // the `0 = 0` seed that lets every later clause begin with `and`, the INNER JOIN to `SwSkuOption`
  // whose unused alias `opt` is LOAD-BEARING because it excludes SKUs with no options at all, the
  // `DISTINCT` that the join makes necessary, and one correlated `EXISTS` per selected option joined
  // with AND. A SKU matches only if it carries EVERY selected option - conjunctive, never disjunctive,
  // and the COUNT of selected options does not participate.
  //
  // This method's obligations are binding, short-circuiting and hydration. It adds no clause, removes
  // none, and reshapes nothing.
  //
  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L123]: the product guard is `structKeyExists(arguments,
  // "productID")` with NO `len()` or `trim()` test, so an EMPTY-STRING `productID` counts as present,
  // the `and sku.product.id = ?` conjunct is appended, and the statement returns ZERO ROWS. Its
  // sibling one method down at [L134] does test `trim(...) != ""`, which is what makes this an
  // inconsistency rather than a house style. The same wart recurs in all six UNION branches of the
  // sale-price query, so it is a house pattern rather than a slip.
  // Preserved deliberately; do not fix without a product decision.
  //
  // No `len()` check, no default, no early return and no normalisation is added here. `productID` is
  // forwarded exactly as received, and `undefined` versus `''` is precisely the distinction the sibling
  // module's own guard reads.
  /**
   * SKUs carrying all of the selected options.
   *
   * Legacy [model/dao/SkuDAO.cfc:L107-L128]. Backs
   * `ProductService.getProductSkusBySelectedOptions()` [model/service/ProductService.cfc:L104], one of
   * the three behaviours named must-preserve for this migration.
   *
   * THE EMPTY-LIST CASE IS REAL AND IS NOT SHORT-CIRCUITED AWAY. `listLen('')` is 0, so the legacy loop
   * runs zero times and appends no `EXISTS` clause; the `0 = 0` seed keeps the statement syntactically
   * valid and it degenerates to "every SKU that has at least one option", courtesy of the inner join.
   * The sibling module documents that outcome and forbids adding an early return, a throw or a
   * forced-empty result. `IN ()` is never emitted anywhere on this path - the list expands to repeated
   * `EXISTS` predicates, not to an `IN` list, so the zero-placeholder hazard does not arise at all.
   *
   * ONE PREREQUISITE STATEMENT IS ISSUED WHEN, AND ONLY WHEN, A `productID` IS SUPPLIED. The sibling
   * module FAILS CLOSED: it refuses to build its statement without the product's own option
   * identifiers, on the stated ground that the adapter can always answer them. This is that answer -
   * {@link PRODUCT_OPTION_IDS_SQL}. It changes no result set the legacy would have produced, because
   * an option that does not belong to the product could never have matched a SKU of that product.
   *
   * A consequence worth stating rather than discovering: when `productID` is the EMPTY STRING, the
   * prerequisite statement matches no product and returns no options, so a non-empty selection is
   * refused by that module's check instead of producing an empty result set. The legacy answer for the
   * same input was zero rows either way, and the refusal is the sibling module's documented
   * fail-closed contract rather than a guard added here.
   *
   * FETCH SHAPE (T3): the projection is `sku.*` - the sibling module's own choice, made so this
   * adapter can hydrate - and each SKU arrives with its options, their option groups, and its
   * per-currency price rows with the cascade materialised. The `product` association is left unset:
   * this method knows a product IDENTIFIER at most, and building a `Product` from one is
   * `productRepository`'s statement to write.
   *
   * NET-NEW COVERAGE (B8): the obligations are a multi-element list emitting one `EXISTS` and one bind
   * per element, a single-element list, an EMPTY list emitting the seed alone, an empty-string
   * `productID` binding `''`, and the absence of `productID` emitting no product conjunct and issuing
   * no prerequisite statement.
   *
   * @param selectedOptions comma-delimited option identifiers that must ALL be present.
   * @param productID optional product to restrict the search to.
   * @returns matching SKUs; an empty array on no match, never `undefined`.
   */
  public async getSkusBySelectedOptions(
    selectedOptions: string,
    productID?: string,
  ): Promise<Sku[]> {
    // The prerequisite runs only on the branch that needs it, so the no-`productID` path issues
    // exactly the one statement the legacy issued.
    const productOptionIDs =
      productID === undefined ? undefined : await this.loadProductOptionIDs(productID);

    const statement = buildSkusBySelectedOptionsStatement(
      selectedOptions,
      productID,
      productOptionIDs,
    );

    const rows = await this.executor.execute(statement.sql, statement.params);

    return this.hydrateSkus(rows, SELECT_SKUS_BY_SELECTED_OPTIONS, BARE_SKU_FETCH_SHAPE);
  }

  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L133]: `term` is bound UNCONDITIONALLY -
  // `q.addParam(name="code", value="%#arguments.term#%", ...)` - while the very next line [L134]
  // DOES guard its own optional argument with `structKeyExists` and `trim`. `term` is declared without
  // `required` at [L130], so calling the method without it raises "element TERM is undefined" while
  // interpolating the wildcard. The asymmetry between two adjacent lines is what makes this a defect
  // rather than a convention, and the identical defect exists in the sibling at
  // [model/dao/ProductDAO.cfc:L422] - it is in BOTH, and both preserve it.
  // Preserved deliberately; do not fix without a product decision.
  //
  // No default, no guard and no early return is added for `term`. A call omitting it raises here as it
  // does there.
  /**
   * Search SKUs by code, optionally narrowed to one or more product types.
   *
   * Legacy [model/dao/SkuDAO.cfc:L130-L148].
   *
   * ★ THE `Sw*` CORRECTION LIVES IN THE STATEMENT, NOT HERE, and it is a CORRECTION rather than a
   * preserved defect - see the block above {@link buildSearchSkusByProductTypeSql} for the
   * three-mechanism rule and why this carries no `LEGACY-DEFECT` marker.
   *
   * FOUR SIBLING ASYMMETRIES ARE PRESERVED DELIBERATELY, recorded here so that nobody harmonises the
   * two `search*ByProductType` methods:
   *
   *   1. THE EMPTINESS IDIOM DIFFERS. This method tests `trim(arguments.productTypeID) != ""`
   *      [model/dao/SkuDAO.cfc:L134]; `ProductDAO` tests `len(...)`. Both are reproduced as written in
   *      their own adapters and are NOT unified.
   *   2. THE ARGUMENT NAMING DIFFERS. This method takes a SINGULAR `productTypeID` and binds it to a
   *      PLURAL `:productTypeIDs` [L136]; `ProductDAO` is plural on both sides. The singular parameter
   *      name is carried over verbatim per B4, and the plural bind name is a comment here rather than
   *      an identifier because positional placeholders have no names.
   *   3. THE FILTER SHAPE DIFFERS. Here the product type is reached through an `IN` SUBQUERY over the
   *      product table [L135]; `ProductDAO` filters `productTypeID` directly on the product row. The
   *      subquery is not flattened.
   *   4. THE UNGUARDED `term` BIND IS IN BOTH. See the marker above.
   *
   * FETCH SHAPE (T3): the projection is widened from the legacy's two columns to the whole `SwSku` row
   * because the port returns `Sku[]` - see {@link buildSearchSkusByProductTypeSql} - and each SKU
   * arrives with its options, their groups, and its per-currency price rows with the cascade
   * materialised. The `product` association is left unset even though the statement filters through
   * `SwProduct`: the subquery matches product identifiers, and hydrating a `Product` from one is
   * `productRepository`'s statement to write.
   *
   * NET-NEW COVERAGE (B8): the obligations are the term-only statement, the term-plus-product-type
   * statement with one bind per element, the raise when `term` is omitted, a whitespace-only
   * `productTypeID` appending no filter, and a delimiter-only `productTypeID` binding a single empty
   * element.
   *
   * @param term substring matched anywhere in the SKU code. Optional in the signature and REQUIRED in
   *   practice - see the marker above.
   * @param productTypeID comma-delimited product types to restrict the search to.
   * @returns matching SKUs; an empty array on no match.
   */
  public async searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
    if (term === undefined) {
      throw new SkuColumnError(
        'term',
        'not supplied, which the legacy binds unconditionally and therefore fails on',
        SEARCH_SKUS_BY_PRODUCT_TYPE,
      );
    }

    // [model/dao/SkuDAO.cfc:L133] `value="%#arguments.term#%"`. The wildcards are part of the VALUE
    // and are bound with it, never spliced into the statement, so a `%` or `_` inside the term is
    // matched as a LIKE metacharacter exactly as it was in the legacy. Escaping it would narrow the
    // matches the legacy makes.
    const boundValues: SqlParameter[] = [`%${term}%`];

    // [model/dao/SkuDAO.cfc:L134] `structKeyExists(arguments,"productTypeID") &&
    // trim(arguments.productTypeID) != ""`. Reproduced with `trim`, not `cfLen`: the two agree on
    // every input except a whitespace-only string, which `trim` rejects and `len` accepts, and this is
    // the method whose legacy test is `trim`.
    const applyProductTypeFilter = productTypeID !== undefined && productTypeID.trim() !== '';
    let productTypeIDPlaceholders = '';

    if (applyProductTypeFilter) {
      // [model/dao/SkuDAO.cfc:L136] `list="true"`. Each element becomes its own positional parameter
      // (E5); nothing is ever spliced into the statement. `listToArray` carries CFML list semantics
      // rather than re-inventing them with a bare `split`, so empty elements are DROPPED - `'a,,b'`
      // yields two elements, exactly what `list="true"` expanded.
      const productTypeIDElements = listToArray(productTypeID);

      // JUDGMENT CALL: A DELIMITER-ONLY LIST BINDS ONE EMPTY-STRING ELEMENT. The guard above tests the
      // RAW string, so `',,'` passes it - `',,'.trim()` is `',,'`, not `''` - and then parses to zero
      // elements. CFML's `list="true"` emitted `IN ('')` for that input, and one bound empty string is
      // its faithful mechanical equivalent: the filter still applies and still matches no product
      // type, which is the narrowing the caller asked for. `src/repositories/mysql/mysqlOptionRepository.ts`
      // took the identical decision for the identical CFML construct, and the two are deliberately
      // consistent. The two alternatives are both worse: emitting a zero-placeholder `IN ()` is a hard
      // MySQL parse error and `sqlPlaceholderList` refuses it by design, and dropping the filter
      // altogether would WIDEN the result set from "no product type matches" to "every product type",
      // which is a repair rather than a port.
      const boundElements =
        productTypeIDElements.length > 0 ? productTypeIDElements : [EMPTY_LIST_ELEMENT];

      productTypeIDPlaceholders = sqlPlaceholderList(boundElements.length);
      boundValues.push(...boundElements);
    }

    const rows = await this.executor.execute(
      buildSearchSkusByProductTypeSql(productTypeIDPlaceholders),
      boundValues,
    );

    return this.hydrateSkus(rows, SEARCH_SKUS_BY_PRODUCT_TYPE, BARE_SKU_FETCH_SHAPE);
  }

  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L150-L168]: the branch on the product's base type has NO
  // `else` arm, so the method has FIVE reachable code paths but only FOUR distinct statements. When
  // `fetchOptions` is truthy and the base type is none of `contentAccess`, `merchandise` or
  // `subscription`, no join fragment is appended and the emitted statement is IDENTICAL to the one the
  // `fetchOptions`-falsy path emits. A caller that asked for eager fetching silently gets none, with
  // no error and no indication.
  // Preserved deliberately; do not fix without a product decision.
  //
  // No `else` arm is added, no fifth shape is invented and no throw is introduced for an unrecognised
  // type. The chain below is the legacy's chain, in the legacy's order, with the legacy's ending.
  //
  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: the line reads
  // `var hql &= "WHERE sku.product.productID = :productID ";` - an INVALID DUPLICATE `var`
  // DECLARATION on a compound assignment, `hql` having already been declared at [L152]. The legacy
  // text is recorded here verbatim so the defect stays auditable. It cannot be reproduced literally in
  // TypeScript: a second declaration of the same binding is a compile error, and `no-redeclare` and
  // `noUnusedLocals` would each reject it independently. The RESULTING BEHAVIOUR - the `WHERE` clause
  // appended last, after whichever fetch fragment was chosen - is what is reproduced, by
  // {@link buildProductSkusSql}.
  // Preserved deliberately; do not fix without a product decision.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L165]: the call is
  // `ORMExecuteQuery(hql, {...}, false, {ignoreCase="true"})`. The third argument `false` means
  // NON-UNIQUE, and the fourth is INERT in three independent ways: `ignoreCase` is not a valid
  // `ormExecuteQuery` option, its value is the STRING `"true"` rather than a boolean, and the HQL has
  // no `ORDER BY` for a case-insensitive collation to affect anyway. NOTHING is reproduced for it - no
  // collation, no `ORDER BY`, no case folding - and it is recorded here only so that a reader who
  // finds it in the source is not left wondering where it went.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L153]: the branch reads `if(fetchOptions)` - the argument by
  // BARE NAME, relying on CFML's implicit `arguments`-scope fallback rather than writing
  // `arguments.fetchOptions` as the two lines around it do. And it is declared `required any`
  // [model/dao/SkuDAO.cfc:L150] rather than `required boolean`, so the value reaching that test could
  // be the string `"1"`, `"yes"` or `"true"` as easily as a boolean. The port types the parameter
  // `boolean`, so the widened input cannot arrive through it - but the TEST still routes through
  // `cfTruthy` below, because that helper is the single place CFML truthiness is decided in this
  // target and a bare `if (fetchOptions)` would quietly disagree with it the day the port widens.
  /**
   * Every SKU of a product.
   *
   * Legacy [model/dao/SkuDAO.cfc:L150-L168].
   *
   * FETCH SHAPE (T3) - THE RICHEST SET OF DECISIONS IN THIS FILE, stated per branch:
   *
   *   * OPTIONS AND THEIR OPTION GROUPS ARE MATERIALIZED ON EVERY BRANCH, including the two that emit
   *     the bare statement. That is not over-fetching, it is a REQUIREMENT: the immediate consumer
   *     [model/service/SkuService.cfc:L223] reads `skus[1].getOptions()` UNCONDITIONALLY, with no
   *     regard to `fetchOptions` and no branch of its own, so a SKU returned without its options
   *     would break the caller on the `fetchOptions`-falsy path. Under Hibernate that read worked by
   *     lazy traversal, which the target does not simulate.
   *   * PER-CURRENCY PRICE ROWS ARE MATERIALIZED ON EVERY BRANCH, with the cascade run, for the reason
   *     given at {@link MysqlSkuRepository.hydrateSkus}.
   *   * THE `contentAccess` BRANCH additionally materialises `accessContentIDs` from
   *     `SwSkuAccessContent` - identifiers only, because `Content` is out of scope.
   *   * THE `subscription` BRANCH additionally materialises `subscriptionBenefitIDs` from
   *     `SwSkuSubsBenefit` - identifiers only, because `SubscriptionBenefit` is out of scope. Its
   *     `subscriptionTerm` join is a FILTER and materialises nothing; the SKU carries the
   *     `subscriptionTermID` column it already has.
   *   * THE `merchandise` BRANCH adds nothing beyond the universal shape, because the association it
   *     fetches is `options`, which is already materialised on every branch. Its INNER JOIN still
   *     matters, as a row FILTER: it excludes SKUs with no options.
   *   * THE `product` ASSOCIATION IS WIRED THROUGH from the argument. Every SKU this method returns is
   *     a SKU of that product by construction, so the association is exact and costs no statement.
   *     This is the only one of the four read paths that can say that.
   *   * NOT MATERIALIZED, DELIBERATELY, ON ANY PATH: `orderItems` (`lazy="extra"`
   *     [model/entity/Sku.cfc:L71], and `OrderItem` is out of scope); `stockIDs`
   *     ([L73], `Stock` out of scope); `physicalIDs` ([L87], `Physical` out of scope);
   *     `renewalSubscriptionBenefitIDs` ([L79], out of scope and fetched by no legacy branch);
   *     `alternateSkuCodeIDs` ([L69], read by nothing in the ported slice); `attributeValues` ([L70],
   *     `AttributeValue` out of scope - see the note on its cascade at
   *     {@link MysqlSkuRepository.saveSku}); `priceGroupRates` ([L86] - an in-scope entity, but
   *     `Sku.getAppliedPriceGroupRateByPriceGroup()` reaches rates through the injected price-group
   *     resolver rather than through this collection, so materialising it would load a graph nothing
   *     reads); and the four promotion link collections ([L82-L85] - the promotion engine reaches them
   *     from the reward and qualifier side through `promotionRepository`, never from the SKU).
   *
   * ROW MULTIPLICATION IS PRESERVED, AND NO `DISTINCT` IS ADDED. Hibernate's `INNER JOIN FETCH`
   * without `distinct` returns the root entity ONCE PER FETCHED CHILD ROW, so a SKU with three options
   * appears three times in the legacy result, as three references to the same instance. The three
   * fetch joins here multiply rows the same way, each distinct SKU is hydrated ONCE, and the returned
   * array repeats that one instance - matching both the legacy's length and its reference identity.
   * Adding `DISTINCT` would change the array length that
   * [model/service/SkuService.cfc:L220-L244] iterates.
   *
   * @param product product whose SKUs are loaded.
   * @param fetchOptions when true, eagerly load the children matching the product's base type.
   * @returns the product's SKUs, unordered, with duplicates where the fetch join multiplies rows.
   */
  public async getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
    let fetchJoin = NO_FETCH_JOIN;

    // [model/dao/SkuDAO.cfc:L153] `if(fetchOptions)`.
    if (cfTruthy(fetchOptions)) {
      // [model/dao/SkuDAO.cfc:L154, L156, L158] `arguments.product.getBaseProductType()`, called
      // afresh in EACH of the three tests. It is called ONCE here and compared three times: the
      // legacy's three calls cannot disagree with one another within a single invocation, so one call
      // is the same behaviour. It is `await`ed because `Product.getBaseProductType()` reaches the
      // repository for the root product type, and it is deliberately NOT guarded - that accessor
      // raises for a product with no product type, and its own documentation records that the legacy
      // dereferences `getProductType()` unguarded at [model/entity/Product.cfc:L494] and fails on the
      // same input. Letting it propagate is the port.
      const baseProductType = await product.getBaseProductType();

      // [model/dao/SkuDAO.cfc:L154-L161] The `if` / `else if` / `else if` chain, in the legacy's
      // order, with the legacy's MISSING `else` - see the marker above. The comparison is CFML `eq`,
      // which is CASE-INSENSITIVE, so `cfEquals` carries it explicitly rather than a `===` that would
      // silently disagree on `'Merchandise'`; `eqeqeq` forbids the loose operator that would have
      // inherited the semantics. `cfEquals` also raises on a nullish operand, which is the CFML answer
      // for comparing a null base type to a string and therefore what the legacy did.
      if (cfEquals(baseProductType, 'contentAccess')) {
        fetchJoin = CONTENT_ACCESS_FETCH_JOIN;
      } else if (cfEquals(baseProductType, 'merchandise')) {
        fetchJoin = MERCHANDISE_FETCH_JOIN;
      } else if (cfEquals(baseProductType, 'subscription')) {
        fetchJoin = SUBSCRIPTION_FETCH_JOINS;
      }
      // NO `else`. The fifth path lands here and emits the bare statement.
    }

    const rows = await this.executor.execute(buildProductSkusSql(fetchJoin), [
      product.getProductID(),
    ]);

    return this.hydrateSkus(rows, SELECT_PRODUCT_SKUS, {
      product,
      accessContents: fetchJoin === CONTENT_ACCESS_FETCH_JOIN,
      subscriptionBenefits: fetchJoin === SUBSCRIPTION_FETCH_JOINS,
    });
  }

  // ★★ MUST-PRESERVE BEHAVIOUR: THE OPTION-GROUP POSITIONAL-WEIGHT ODOMETER ORDERING (B2).
  //
  // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: the statement text is built by
  // `./sql/sortedProductSkus.sql.js` and is deliberately NOT re-authored here. That module owns the
  // single-column projection, the three load-bearing INNER JOINs that exclude SKUs with no options,
  // the `GROUP BY` on the same single column, the `SUM(SwOption.sortOrder * POWER(10, ? -
  // SwOptionGroup.sortOrder)) ASC` ordering reproduced operand for operand. Nothing is added: no
  // secondary sort key, no tiebreaker, no `LIMIT`, no de-duplication and no null-coalescing.
  //
  // TODO [model/dao/SkuDAO.cfc:L177]: test to see if this query works with DB's other than MSSQL and
  // MySQL
  //
  // That line is the legacy comment carried forward VERBATIM, not paraphrased and not completed (B3).
  // It sits immediately above `<cfquery name="sorted">` in the source and it is reproduced at the
  // call site that reaches that query. Closing it is out of scope by construction: the untested
  // engines are exactly the ones this port does not implement, so discharging the TODO would mean
  // building and testing an arm the migration deliberately excludes. Do not delete it without doing
  // that work.
  //
  // The duplication is DELIBERATE, not an oversight. `./sql/sortedProductSkus.sql.js` carries its own
  // copy immediately above the statement text, and `./dialect.js` carries a third above the ordering
  // fragment, because each of the three is a place a reader could arrive at this query without seeing
  // the other two. ESLint deliberately leaves `no-warning-comments` disabled precisely so that
  // carried-forward TODOs of this kind lint clean rather than pressuring a future reader to "resolve"
  // them.
  //
  // JUDGMENT CALL: THE DIALECT DECISION IS DELEGATED TO THAT MODULE RATHER THAN TAKEN HERE. The legacy
  // branches at [model/dao/SkuDAO.cfc:L194] on `getApplicationValue("databaseType") eq
  // "MicrosoftSQLServer"`, and the requirement is that the comparison never be hand-rolled - CFML's
  // `eq` is case-insensitive and the source spells MySQL inconsistently across files, so `./dialect.js`
  // owns both the case folding and the MySQL-only guard. The sibling SQL module already resolves the
  // dialect through `resolveConfiguredDialect()` and the power fragment through
  // `optionGroupOdometerPowerFragment`, so delegating satisfies that requirement transitively AND
  // keeps this file free of any configuration read (E6) - importing `./dialect.js` here would mean
  // reading `DB_DIALECT` from a file that must read no environment value.
  //
  // JUDGMENT CALL: E4 DOES NOT REACH THE ODOMETER, and this is recorded so that a later reader does
  // not "fix" it. `POWER(10, n)` returns a DOUBLE and the `SUM` is therefore a float sum, but it is an
  // `ORDER BY` EXPRESSION EVALUATED BY THE DATABASE and it is not a monetary value. `Money` and
  // `decimal.js` must not touch it. It is not converted to `DECIMAL`, not rewritten as a lexicographic
  // string concatenation, not replaced by a window-function ranking, and its operands are not
  // reordered. This is fidelity to the source expression, and nothing about it is a claim of any other
  // kind.
  /**
   * SKU identifiers for a product, ordered by option group then option sort order.
   *
   * Legacy [model/dao/SkuDAO.cfc:L172-L202]. ★ THE LOCATORS ARE THE VERIFIED ONES: the `<cffunction>`
   * opens at L172 and closes at L202. The transformation plan cites L172-L220, which is wrong -
   * L204-L220 is the separate private `getNextOptionGroupSortOrder` and L222-L226 is
   * `clearNextOptionGroupSortOrder`. The port records the same correction independently.
   *
   * THE ORDERING IS A POSITIONAL-WEIGHT ODOMETER. Each option's `sortOrder` is the DIGIT and its
   * option group's `sortOrder` sets the PLACE VALUE, through an exponent of
   * `nextOptionGroupSortOrder - SwOptionGroup.sortOrder`, so the lowest-ordered group is the most
   * significant. This is precisely why `OptionGroup` is an implicit-scope entity in this migration.
   *
   * ★ THE PLACE-VALUE EXPONENT IS A BOUND PARAMETER, NOT AN INTERPOLATION. The legacy
   * string-interpolates `#getNextOptionGroupSortOrder()#` into the statement text at
   * [model/dao/SkuDAO.cfc:L195] and [L197]. It is a server-derived integer rather than caller input,
   * so it was never an injection vector - but E5 admits no exception, so it is bound. The value and
   * the resulting ordering are unchanged, which is why this is compliance rather than a divergence.
   *
   * FETCH SHAPE (T3): NO ENTITY IS HYDRATED. The statement projects the single column `SwSku.skuID`
   * and the port declares `Promise<string[]>`, so the identifiers are mapped and nothing is loaded -
   * this is a projection, not entity hydration, and widening it would be a change to a statement whose
   * whole purpose is an ordering. The legacy `<cfreturn sorted />` [L201] returns the CFML query object
   * itself; the port's `string[]` is the same single column, read out.
   *
   * ORDER IS PRESERVED BY NOT TOUCHING IT: the rows are mapped in the order the statement returned
   * them, with no re-sort and no de-duplication. The `GROUP BY` already guarantees one row per SKU, so
   * de-duplicating would be inert at best and would risk reordering at worst.
   *
   * NET-NEW COVERAGE (B8): the obligations are the exact emitted `ORDER BY` text, both bound
   * parameters in order with the exponent bound rather than interpolated, the identifier mapping, and
   * the memo being consulted once per instance.
   *
   * @param productID product whose SKUs are ordered.
   * @returns SKU identifiers in display order.
   */
  public async getSortedProductSkusID(productID: string): Promise<string[]> {
    const statement = buildSortedProductSkusStatement(
      productID,
      await this.resolveNextOptionGroupSortOrder(),
    );

    const rows = await this.executor.execute(statement.sql, statement.params);

    return rows.map((row) => readIdentifier(row, 'skuID', SELECT_SORTED_PRODUCT_SKU_IDS));
  }

  /**
   * Persist one SKU.
   *
   * NO LEGACY ANTECEDENT ON `SkuDAO.cfc`, and that is stated rather than implied: the component
   * declares no save function at all. Persistence reached the SKU through the framework - `super.save()`
   * on the service base and Hibernate's own flush - and the port replaces both with this one method.
   * It is the seventh of the port's seven, and the arithmetic behind that count is in the port's header.
   *
   * INSERT VERSUS UPDATE IS DECIDED BY `sku.isNew()`, which carries the framework's `newFlag`
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] rather than by probing the database for the row. That is
   * the legacy's own discriminator, and probing would add a statement the legacy does not have.
   *
   * ONE TIMESTAMP IS CAPTURED PER CALL and bound wherever an audit column needs it, so the created and
   * modified stamps of a single insert cannot straddle a tick and disagree. The UTC decision belongs to
   * `./connection.js`, which fixes the session time zone at `'Z'`; this method consumes that policy
   * rather than restating it, and introduces no clock abstraction.
   *
   * ⚠ SCOPE OF THE WRITE, STATED EXHAUSTIVELY: this method writes the `SwSku` ROW AND NOTHING ELSE. No
   * child table, no link table, and no cascade.
   *
   *   * `attributeValues` is declared `cascade="all-delete-orphan"` at [model/entity/Sku.cfc:L70],
   *     which under Hibernate meant that removing a value from the collection DELETED its row.
   *     THAT CASCADE IS DELIBERATELY OUTSIDE THE PORTED SURFACE, and silence about it would be a gap.
   *     Three facts settle it: `AttributeValue` is not an in-scope entity and has no domain class here;
   *     `src/domain/entities/sku.ts` therefore models no `attributeValues` collection at all, so there
   *     is no collection whose orphans could be computed; and the port declares no delete method, so
   *     there is no operation for a delete cascade to hang off. No `SwAttributeValue` row is written or
   *     deleted by this adapter, and none is orphaned by it either, because the collection is never
   *     loaded and never replaced. The same reasoning covers the `all-delete-orphan` cascades on
   *     `alternateSkuCodes` [L69], `skuCurrencies` [L72] and `stocks` [L73]: currency rows ARE read,
   *     but they are never written, so no orphan can arise.
   *   * `orderItems` is `lazy="extra"` [model/entity/Sku.cfc:L71] and is never loaded, so it cannot be
   *     written either.
   *   * `Sku` DECLARES NO `preInsert` AND NO `preUpdate`. Verified against the source. Unlike
   *     `ProductType` and `PriceGroup`, there is no materialized path and no lifecycle hook whose
   *     effect this method must reproduce, and none is invented here.
   *
   * The returned entity is a NEW instance rather than the argument mutated, carrying the minted
   * identifier and the audit stamps that were actually written. The identifier fields on the domain
   * entities are `private readonly`, so rehydration is the only way to hand back an entity that
   * reflects the row - and it is also the honest one, since the caller's instance was never the row.
   *
   * NET-NEW COVERAGE (B8): the obligations are the insert branch minting a 32-character unhyphenated
   * key, the update branch binding the key last, the audit-stamp policy on each branch, the
   * `affectedRows === 0` raise on insert, and money binding as a decimal string.
   *
   * @param sku the SKU to persist.
   * @returns a new instance reflecting the persisted row.
   */
  public async saveSku(sku: Sku): Promise<Sku> {
    const auditTimestamp = new Date();

    return sku.isNew() ? this.insertSku(sku, auditTimestamp) : this.updateSku(sku, auditTimestamp);
  }

  // =========================================================================
  // Private: hydration
  // =========================================================================

  // ★ THE SINGLE ROW-TO-ENTITY FACTORY FOR `Sku`. Every read path in this file funnels through it, so
  // construction, collaborator injection and association materialization happen in exactly ONE place
  // rather than being scattered across query methods. A consumer cannot tell which statement produced
  // a `Sku`, so it must not have to.
  //
  // ★★ THE PER-CURRENCY PRICE MAP IS MATERIALIZED HERE, AND THAT IS WHY THREE ENTITY ACCESSORS STAY
  // SYNCHRONOUS.
  //
  // JUDGMENT CALL: `Sku.getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273],
  // `getListPriceByCurrencyCode()` [L275-L279] and `getRenewalPriceByCurrencyCode()` [L281-L285] are
  // synchronous in the legacy and synchronous in the target, and preserving that is the acceptance
  // contract for those three signatures. The four-step cascade they read
  // [model/entity/Sku.cfc:L367-L433] consults collaborators that are ASYNCHRONOUS here - every
  // `CurrencyConverter` member returns a promise - so `src/domain/entities/sku.ts` splits the cascade
  // into an async `materializeCurrencyDetails()` that computes the map and a synchronous
  // `getCurrencyDetails()` that reads it, and states in as many words that a repository awaits the
  // former during hydration. This is that await. The `CurrencyConverter` port describes the same
  // arrangement from its own side: the map is materialised during entity hydration, before the domain
  // ever sees the SKU.
  //
  // THIS IS A FIDELITY DECISION, NOT A PERFORMANCE ONE (B7). What it buys is that the three accessors
  // keep the exact signatures the legacy gives them; it makes no claim about how fast anything is, and
  // no such claim appears anywhere in this file. The alternative - making the accessors async - would
  // change three signatures on a must-preserve behaviour, which is the thing the acceptance contract
  // forbids.
  //
  // WHAT THIS ADAPTER SUPPLIES AND WHAT IT DOES NOT. The raw material is this method's job: the SKU's
  // own price columns, which step 1 reads, and the `SwSkuCurrency` rows, which step 2 overwrites with.
  // The ELIGIBILITY GATE at [L373] and the STEP-3 CONVERSION at [L416-L428] belong to the entity and
  // are NOT implemented here - no currency conversion happens in this file, and `CurrencyConverter` is
  // passed through untouched rather than called.
  //
  // THE MAP KEEPS "CURRENCY ABSENT" AND "CURRENCY PRESENT, THIS PRICE ABSENT" APART. That distinction
  // is the entity's to express and this method's to preserve: {@link readMoney} maps SQL NULL to
  // `undefined` rather than to `Money.zero`, and the entity then leaves the corresponding sub-key
  // unwritten - which is exactly what CFML did, being unable to store a null in a struct key, and
  // exactly what lets step 3's `structKeyExists(entry, "price")` test fire. Flattening either case
  // into a sentinel here would suppress step 3 and change a converted price.
  //
  // NO `"USD"` LITERAL APPEARS ANYWHERE IN THIS FILE, not even as a fallback. The USD default is a
  // SETTING declaration - `{fieldType="select", defaultValue="USD"}` at
  // [model/service/SettingService.cfc:L221] - and there is no hardcoded `"USD"` anywhere in
  // `model/entity/Sku.cfc` either. `Sku.getCurrencyCode()` resolves it through the settings provider,
  // and introducing a literal here would move a configurable default into an adapter.
  //
  // WHEN THE CASCADE COLLABORATORS ARE ABSENT, THE MAP IS LEFT UNMATERIALISED. That is not a
  // target-only degraded mode: `getCurrencyDetails()` then answers `{}`, which is the state the legacy
  // reaches whenever `skuEligibleCurrencies` resolves empty and the gate at [L373] closes - and then
  // every accessor yields nothing there too. No accessor invents a zero to cover the gap, in either
  // system.
  /**
   * Builds one `Sku` per distinct row, materialising the associations the fetch shape names.
   *
   * ROW MULTIPLICATION IS HANDLED HERE, ONCE, FOR ALL FOUR READ PATHS. Three of them cannot multiply
   * rows; `getProductSkus` can, through its fetch joins. Distinct SKU identifiers are collected in
   * FIRST-SEEN order, one entity is built per distinct identifier, and the returned array follows the
   * ORIGINAL row sequence - so a SKU that appeared three times is returned three times, as three
   * references to the SAME instance. That is what Hibernate's identity map did with a non-distinct
   * `JOIN FETCH`, and it preserves both the array length and the reference identity the legacy
   * consumers saw.
   *
   * THE CHILD STATEMENTS RUN ONCE OVER THE WHOLE DISTINCT SET, not once per SKU. Removing lazy
   * traversal removes the implicit N+1 that came with it, which is a property of EXPLICITNESS - every
   * statement this adapter issues is one a reader can point at in this file - and not a claim of any
   * other kind.
   *
   * @param rows the result rows, in the order the statement returned them.
   * @param statementLabel which statement produced them, for error attribution.
   * @param fetchShape which optional associations to materialise.
   */
  private async hydrateSkus(
    rows: readonly SqlRow[],
    statementLabel: string,
    fetchShape: SkuFetchShape,
  ): Promise<Sku[]> {
    if (rows.length === 0) {
      return [];
    }

    const skuIDs = distinctIdentifiers(rows, 'skuID', statementLabel);

    // Both universal collections are read for the whole distinct set at once. The placeholder list is
    // never asked for zero, because `rows.length === 0` returned above and a non-empty row set yields
    // at least one identifier - so `sqlPlaceholderList`'s zero-count refusal is unreachable from here
    // and `IN ()` cannot be emitted.
    const skuIDPlaceholders = sqlPlaceholderList(skuIDs.length);

    const currencyRows = await this.executor.execute(
      buildSkuCurrenciesSql(skuIDPlaceholders),
      skuIDs,
    );
    const optionRows = await this.executor.execute(buildSkuOptionsSql(skuIDPlaceholders), skuIDs);

    const currencyRowsBySku = groupRowsByParentIdentifier(
      currencyRows,
      'skuID',
      SELECT_SKU_CURRENCIES,
    );
    const optionRowsBySku = groupRowsByParentIdentifier(
      optionRows,
      SKU_OPTION_LINK_SKU_ID,
      SELECT_SKU_OPTIONS,
    );

    const accessContentRowsBySku = fetchShape.accessContents
      ? groupRowsByParentIdentifier(
          await this.executor.execute(
            buildSkuLinkIdentifiersSql(
              ACCESS_CONTENT_LINK.tableName,
              ACCESS_CONTENT_LINK.identifierColumnName,
              skuIDPlaceholders,
            ),
            skuIDs,
          ),
          SKU_OPTION_LINK_SKU_ID,
          SELECT_SKU_ACCESS_CONTENT_IDS,
        )
      : undefined;

    const subscriptionBenefitRowsBySku = fetchShape.subscriptionBenefits
      ? groupRowsByParentIdentifier(
          await this.executor.execute(
            buildSkuLinkIdentifiersSql(
              SUBSCRIPTION_BENEFIT_LINK.tableName,
              SUBSCRIPTION_BENEFIT_LINK.identifierColumnName,
              skuIDPlaceholders,
            ),
            skuIDs,
          ),
          SKU_OPTION_LINK_SKU_ID,
          SELECT_SKU_SUBSCRIPTION_BENEFIT_IDS,
        )
      : undefined;

    // One entity per DISTINCT identifier, keyed case-insensitively for the reason
    // `groupRowsByParentIdentifier` gives: the CFML `uuid` generator emitted uppercase hex while
    // `randomUUID()` emits lowercase, so one table can legitimately hold both casings.
    const builtSkus: Record<string, Sku> = {};

    for (const row of rows) {
      const skuID = readIdentifier(row, 'skuID', statementLabel);

      if (structGet(builtSkus, skuID) !== undefined) {
        continue;
      }

      const currencies: SkuCurrency[] = [];

      for (const currencyRow of childRowsFor(currencyRowsBySku, skuID)) {
        const skuCurrency = toSkuCurrency(currencyRow, SELECT_SKU_CURRENCIES);

        // A refused row is dropped; see `toSkuCurrency` for why that is the faithful branch and for
        // the one pathological case in which it is not observationally identical.
        if (skuCurrency !== undefined) {
          currencies.push(skuCurrency);
        }
      }

      const options = childRowsFor(optionRowsBySku, skuID).map((optionRow) =>
        toOption(optionRow, SELECT_SKU_OPTIONS),
      );

      builtSkus[skuID] = await this.buildSku(row, statementLabel, fetchShape, {
        options,
        skuCurrencies: currencies,
        accessContentIDs:
          accessContentRowsBySku === undefined
            ? undefined
            : distinctIdentifiers(
                childRowsFor(accessContentRowsBySku, skuID),
                ACCESS_CONTENT_LINK.identifierColumnName,
                SELECT_SKU_ACCESS_CONTENT_IDS,
              ),
        subscriptionBenefitIDs:
          subscriptionBenefitRowsBySku === undefined
            ? undefined
            : distinctIdentifiers(
                childRowsFor(subscriptionBenefitRowsBySku, skuID),
                SUBSCRIPTION_BENEFIT_LINK.identifierColumnName,
                SELECT_SKU_SUBSCRIPTION_BENEFIT_IDS,
              ),
      });
    }

    // The ORIGINAL row sequence, mapped onto the built instances - repeats included.
    const hydrated: Sku[] = [];

    for (const row of rows) {
      const skuID = readIdentifier(row, 'skuID', statementLabel);
      const builtSku = structGet(builtSkus, skuID);

      if (builtSku === undefined) {
        throw new SkuColumnError(
          'skuID',
          'not among the identifiers hydrated from this result set',
          statementLabel,
        );
      }

      hydrated.push(builtSku);
    }

    return hydrated;
  }

  /**
   * Builds one `Sku` from its own row plus its already-materialised associations.
   *
   * THE THREE MONEY COLUMNS HONOUR THEIR DECLARED DEFAULTS AND THE FOURTH DOES NOT.
   * [model/entity/Sku.cfc:L55-L57] declare `default="0"` on `listPrice`, `price` and `renewalPrice`, and
   * `src/domain/entities/sku.ts` applies exactly that with `?? Money.zero` on each - so an absent
   * column is passed through as `undefined` here and the ENTITY substitutes zero, which keeps the
   * default in the one place that declares it. Contrast `SwSkuCurrency.price`
   * [model/entity/SkuCurrency.cfc:L53], which declares NO default and whose `undefined` must survive
   * all the way through. Both behaviours come out of the same {@link readMoney}; the difference lives
   * in the entities, where the declarations live.
   *
   * BOTH BOOLEAN COLUMNS ARE HANDED OVER UNCOERCED, for the reason {@link readFlag} gives. The entity
   * calls `cfBoolean()` on each, and only there can a NULL `activeFlag` resolve to TRUE per its
   * `default="1"` [L53] while a NULL `userDefinedPriceFlag` resolves to false per its `default="0"`
   * [L59].
   *
   * `isNew` IS NOT SET, so the entity's own default of `false` applies. A row read from the database is
   * by definition persisted, and that is what the framework's `newFlag`
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] meant.
   *
   * THIS INSTANCE IS INJECTED AS THE SKU'S OWN `skuRepository` COLLABORATOR. `Sku.getTransactionExistsFlag()`
   * delegates to `skuRepository.getTransactionExistsFlag(undefined, skuID)`, which is a member of this
   * very port, so `this` satisfies it exactly - transformation rule T2 applied to the
   * `getService("skuService")` locator the legacy entity uses at [model/entity/Sku.cfc:L568]. Nothing
   * is cached across the boundary: the entity memoises the answer on itself, and the entity is
   * request-scoped.
   */
  private async buildSku(
    row: SqlRow,
    statementLabel: string,
    fetchShape: SkuFetchShape,
    associations: {
      readonly options: Option[];
      readonly skuCurrencies: SkuCurrency[];
      readonly accessContentIDs: readonly string[] | undefined;
      readonly subscriptionBenefitIDs: readonly string[] | undefined;
    },
  ): Promise<Sku> {
    // `exactOptionalPropertyTypes` forbids assigning an explicit `undefined` to an optional member, so
    // the draft is populated conditionally. See {@link SkuHydrationDraft}.
    const draft: SkuHydrationDraft = {
      skuID: readIdentifier(row, 'skuID', statementLabel),
      activeFlag: readFlag(row, 'activeFlag', statementLabel),
      userDefinedPriceFlag: readFlag(row, 'userDefinedPriceFlag', statementLabel),
      options: associations.options,
      skuCurrencies: associations.skuCurrencies,
      skuRepository: this,
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

    const calculatedQATS = readOptionalInteger(row, 'calculatedQATS', statementLabel);
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

    if (fetchShape.product !== undefined) {
      draft.product = fetchShape.product;
    }

    if (associations.accessContentIDs !== undefined) {
      draft.accessContentIDs = associations.accessContentIDs;
    }

    if (associations.subscriptionBenefitIDs !== undefined) {
      draft.subscriptionBenefitIDs = associations.subscriptionBenefitIDs;
    }

    // The four collaborator ports, forwarded exactly as injected. Each is an optional member, so each
    // is assigned only when present.
    if (this.collaborators.settingsProvider !== undefined) {
      draft.settingsProvider = this.collaborators.settingsProvider;
    }

    if (this.collaborators.currencyConverter !== undefined) {
      draft.currencyConverter = this.collaborators.currencyConverter;
    }

    if (this.collaborators.priceGroupResolver !== undefined) {
      draft.priceGroupResolver = this.collaborators.priceGroupResolver;
    }

    if (this.collaborators.currentAccountContext !== undefined) {
      draft.currentAccountContext = this.collaborators.currentAccountContext;
    }

    const sku = new Sku(draft);

    // ★★ THE CASCADE IS RUN HERE. Both collaborators are required by the entity's own method, which
    // raises without them, so the call is made only when both are present - and when they are not, the
    // SKU answers `{}` from `getCurrencyDetails()`, which is the legacy's closed-gate state. The
    // entity's method is idempotent and reproduces the legacy memo guard at [model/entity/Sku.cfc:L368],
    // so a second call would be a no-op.
    if (
      this.collaborators.settingsProvider !== undefined &&
      this.collaborators.currencyConverter !== undefined
    ) {
      await sku.materializeCurrencyDetails();
    }

    return sku;
  }

  /**
   * The distinct option identifiers belonging to one product.
   *
   * The prerequisite for the fail-closed check in `./sql/skusBySelectedOptions.sql.js`; see
   * {@link PRODUCT_OPTION_IDS_SQL} for why it exists and why it changes no result set.
   *
   * FETCH SHAPE (T3): IDENTIFIERS ONLY, and no entity is hydrated. Nothing downstream needs an
   * `Option` here - the check is a set-membership test on identifiers - so widening the projection
   * would load a graph for a comparison.
   */
  private async loadProductOptionIDs(productID: string): Promise<readonly string[]> {
    const rows = await this.executor.execute(PRODUCT_OPTION_IDS_SQL, [productID]);

    return distinctIdentifiers(rows, 'optionID', SELECT_PRODUCT_OPTION_IDS);
  }

  // =========================================================================
  // Private: the option-group place value
  // =========================================================================

  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L211-L215]: `getNextOptionGroupSortOrder` seeds the memo to 1
  // at [L206], then runs the aggregate `SELECT max(SwOptionGroup.sortOrder) as max FROM SwOptionGroup`
  // and OVERWRITES the seed with `rs.max + 1` whenever `rs.recordCount` is truthy [L213-L214]. An
  // aggregate with no `GROUP BY` ALWAYS RETURNS EXACTLY ONE ROW, so `recordCount` is 1 even against an
  // empty table - the guard can never be false - and `max` is then NULL, making `NULL + 1` an
  // engine-dependent coercion rather than the arithmetic it looks like. The seed of 1 is therefore
  // dead code in every case the guard was written to protect.
  // Preserved deliberately; do not fix without a product decision.
  //
  // JUDGMENT CALL: the NULL is handled EXPLICITLY and falls back to the legacy's own seed of 1. Two
  // reasons. The observable result in the POPULATED case - the only case a caller can reach with data -
  // is unchanged, because `max` is then a real integer and the arithmetic is the legacy's. And in the
  // EMPTY case the legacy outcome is engine-dependent, so there is no single behaviour to reproduce;
  // choosing the value the legacy's own seed names is the only choice that is both deterministic and
  // traceable to the source. Nothing is invented: 1 is [model/dao/SkuDAO.cfc:L206]'s number.
  //
  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` is
  // `<cfif not structKeyExists(variables,"nextOptionGroupSortOrder")><cfset structDelete(variables,
  // "nextOptionGroupSortOrder") /></cfif>` - it deletes the memo key ONLY WHEN THAT KEY IS ABSENT. The
  // condition is inverted, so the delete is unreachable and the method is DEAD: it can never clear
  // anything. It also has zero callers anywhere in the repository.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ★ REQUEST SCOPING NEUTRALISES THIS DEFECT RATHER THAN FIXING IT, WHICH IS WHY IT SPENDS NO
  // DIVERGENCE. What the method was for was clearing component-level state that outlived a request. The
  // memo here is an INSTANCE field on a request-scoped instance, so it is discarded when the instance
  // is, and a cache-clear has nothing left to do: the defect becomes UNOBSERVABLE, not repaired. No
  // behaviour changes, because the legacy method never had an observable effect to change.
  //
  // JUDGMENT CALL: it is therefore DOCUMENTED HERE AND NOT IMPLEMENTED. Reproducing an unreachable
  // no-op as a private member would be dead code that `noUnusedLocals` rejects outright - an unread
  // private member is a compile error under this project's settings - and giving it a caller would
  // invent one the legacy does not have. It is not port surface either: the port's own method-count
  // arithmetic excludes it explicitly as "a DEAD internal cache-clear ... an implementation detail of
  // this adapter, not a contract". Documenting it is the sanctioned treatment, and this is the
  // documentation.
  /**
   * The next available option-group sort order, computed once per instance.
   *
   * This is the place value the odometer's exponent is derived from, and the ONLY consumer is
   * `getSortedProductSkusID`. It is `private` because [model/dao/SkuDAO.cfc:L204] declares
   * `access="private"`, and it is deliberately not on the port for that reason.
   *
   * FETCH SHAPE (T3): a single aggregate scalar. No entity, no association, no `OptionGroup` instance -
   * only the number the `ORDER BY` needs.
   *
   * NET-NEW COVERAGE (B8): the obligations are the populated case yielding `max + 1`, the NULL
   * aggregate falling back to 1, and the memo suppressing the second statement within one instance.
   */
  private async resolveNextOptionGroupSortOrder(): Promise<number> {
    // [model/dao/SkuDAO.cfc:L205] `if(not structKeyExists(variables, "nextOptionGroupSortOrder"))` -
    // the memo guard, reproduced. A second call within the life of this instance issues no statement.
    if (this.nextOptionGroupSortOrder !== undefined) {
      return this.nextOptionGroupSortOrder;
    }

    const rows = await this.executor.execute(NEXT_OPTION_GROUP_SORT_ORDER_SQL);
    const aggregateRow = rows[0];

    // [model/dao/SkuDAO.cfc:L213] `<cfif rs.recordCount>`. The condition is reproduced rather than
    // assumed away, even though an aggregate makes it always true: if the row is genuinely missing then
    // the statement is not the statement this method issued, and the legacy's seed is the answer it
    // would have kept.
    const highestSortOrder =
      aggregateRow === undefined
        ? undefined
        : readOptionalInteger(aggregateRow, 'max', SELECT_NEXT_OPTION_GROUP_SORT_ORDER);

    // [model/dao/SkuDAO.cfc:L206, L214] The seed, and the overwrite. See the markers above.
    this.nextOptionGroupSortOrder = highestSortOrder === undefined ? 1 : highestSortOrder + 1;

    return this.nextOptionGroupSortOrder;
  }

  // =========================================================================
  // Private: the write path
  // =========================================================================

  /**
   * Inserts one `SwSku` row and returns an entity carrying the minted key.
   *
   * The key is minted by the application, not by the database:
   * [model/entity/Sku.cfc:L52] declares `generator="uuid"`, and `SwSku` has no auto-increment column -
   * which is also why `SqlMutationResult` carries no `insertId` to read.
   */
  private async insertSku(sku: Sku, auditTimestamp: Date): Promise<Sku> {
    const mintedSkuID = mintEntityIdentifier();
    const stamps = { createdDateTime: auditTimestamp, modifiedDateTime: auditTimestamp };

    const insertion = await this.executor.executeMutation(
      INSERT_SKU_SQL,
      bindColumnValues(SKU_COLUMNS, this.toSkuColumnValues(sku, mintedSkuID, stamps), INSERT_SKU),
    );

    if (insertion.affectedRows === 0) {
      throw new SkuPersistenceError(
        'The SKU insert reported no inserted row, so the minted key cannot be reported as persisted.',
      );
    }

    return this.rehydrateSavedSku(sku, mintedSkuID, stamps);
  }

  /**
   * Updates one `SwSku` row.
   *
   * The created stamp is carried over from the entity rather than re-captured - an update must not
   * rewrite when a row was created - and the key is bound LAST, after the assignment list, matching
   * where it appears in {@link UPDATE_SKU_SQL}.
   */
  private async updateSku(sku: Sku, auditTimestamp: Date): Promise<Sku> {
    const skuID = sku.getSkuID();
    const stamps = {
      createdDateTime: sku.getCreatedDateTime(),
      modifiedDateTime: auditTimestamp,
    };

    const boundValues = bindColumnValues(
      UPDATED_SKU_COLUMNS,
      this.toSkuColumnValues(sku, skuID, stamps),
      UPDATE_SKU,
    );

    boundValues.push(skuID);

    await this.executor.executeMutation(UPDATE_SKU_SQL, boundValues);

    return this.rehydrateSavedSku(sku, skuID, stamps);
  }

  /**
   * The column values for a SKU write, keyed by physical column so the ordered list can project them.
   *
   * E4: the three money columns become DECIMAL STRINGS through `Money.toDecimalString()`, never
   * numbers. Full precision therefore survives the write exactly as it survives the read, and no
   * monetary value is routed through IEEE-754 anywhere in this file.
   *
   * BOTH BOOLEAN COLUMNS ARE WRITTEN AS THE RESOLVED BOOLEANS THE ENTITY REPORTS. That is the correct
   * direction and it is not in tension with {@link readFlag}: on the READ side the raw value must reach
   * the entity so its declared default can apply, and on the WRITE side the entity has already applied
   * it, so what it reports is what the row should hold.
   *
   * `productID` is read off the `product` association, which is the many-to-one's foreign key
   * [model/entity/Sku.cfc:L65]. A SKU whose product is not materialised binds SQL NULL - which is what
   * the ORM wrote for an unset many-to-one, and which is why the association is materialised on the one
   * read path that can do it exactly.
   *
   * `calculatedQATS` is written as read. It is a CALCULATED property [model/entity/Sku.cfc:L62]
   * maintained by the framework's calculation pass rather than by this slice, so this method neither
   * recomputes it nor clears it: carrying the value through is the only option that does not invent a
   * number.
   */
  private toSkuColumnValues(
    sku: Sku,
    skuID: string,
    stamps: { readonly createdDateTime: Date | undefined; readonly modifiedDateTime: Date },
  ): ColumnValues {
    return {
      skuID,
      activeFlag: sku.getActiveFlag(),
      skuCode: sku.getSkuCode(),
      listPrice: sku.getListPrice().toDecimalString(),
      price: sku.getPrice().toDecimalString(),
      renewalPrice: sku.getRenewalPrice().toDecimalString(),
      imageFile: sku.getImageFile(),
      userDefinedPriceFlag: sku.getUserDefinedPriceFlag(),
      calculatedQATS: sku.getCalculatedQATS(),
      productID: sku.getProduct()?.getProductID(),
      subscriptionTermID: sku.getSubscriptionTermID(),
      remoteID: sku.getRemoteID(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: sku.getCreatedByAccountID(),
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: sku.getModifiedByAccountID(),
    };
  }

  /**
   * Projects a persisted SKU onto a new instance carrying the key and stamps that were written.
   *
   * A NEW INSTANCE RATHER THAN THE ARGUMENT MUTATED, because `skuID` and the audit fields are
   * `private readonly` on the entity and because the caller's instance was never the row. Every value
   * the argument carries is passed through, including its already-materialised associations, so the
   * returned SKU answers exactly what the argument answered plus the identifier and the stamps. The
   * currency cascade is NOT re-run: the entity's memo guard makes a second run a no-op, and this
   * instance is built from the same collections the first one had.
   *
   * Readonly identifier arrays are spread into fresh mutable arrays where the entity's constructor
   * asks for them that way, so the new instance cannot alias the old one's collections. The same
   * technique is used by `mysqlPriceGroupRepository.ts`.
   */
  private rehydrateSavedSku(
    sku: Sku,
    skuID: string,
    stamps: { readonly createdDateTime: Date | undefined; readonly modifiedDateTime: Date },
  ): Sku {
    const draft: SkuHydrationDraft = {
      skuID,
      activeFlag: sku.getActiveFlag(),
      userDefinedPriceFlag: sku.getUserDefinedPriceFlag(),
      listPrice: sku.getListPrice(),
      price: sku.getPrice(),
      renewalPrice: sku.getRenewalPrice(),
      options: sku.getOptions(),
      skuCurrencies: sku.getSkuCurrencies(),
      priceGroupRates: sku.getPriceGroupRates(),
      promotionRewards: sku.getPromotionRewards(),
      promotionRewardExclusions: sku.getPromotionRewardExclusions(),
      promotionQualifiers: sku.getPromotionQualifiers(),
      promotionQualifierExclusions: sku.getPromotionQualifierExclusions(),
      alternateSkuCodeIDs: [...sku.getAlternateSkuCodeIDs()],
      stockIDs: [...sku.getStockIDs()],
      accessContentIDs: [...sku.getAccessContentIDs()],
      subscriptionBenefitIDs: [...sku.getSubscriptionBenefitIDs()],
      renewalSubscriptionBenefitIDs: [...sku.getRenewalSubscriptionBenefitIDs()],
      physicalIDs: [...sku.getPhysicalIDs()],
      modifiedDateTime: stamps.modifiedDateTime,
      skuRepository: this,
    };

    const skuCode = sku.getSkuCode();
    if (skuCode !== undefined) {
      draft.skuCode = skuCode;
    }

    const imageFile = sku.getImageFile();
    if (imageFile !== undefined) {
      draft.imageFile = imageFile;
    }

    const calculatedQATS = sku.getCalculatedQATS();
    if (calculatedQATS !== undefined) {
      draft.calculatedQATS = calculatedQATS;
    }

    const subscriptionTermID = sku.getSubscriptionTermID();
    if (subscriptionTermID !== undefined) {
      draft.subscriptionTermID = subscriptionTermID;
    }

    const remoteID = sku.getRemoteID();
    if (remoteID !== undefined) {
      draft.remoteID = remoteID;
    }

    if (stamps.createdDateTime !== undefined) {
      draft.createdDateTime = stamps.createdDateTime;
    }

    const createdByAccountID = sku.getCreatedByAccountID();
    if (createdByAccountID !== undefined) {
      draft.createdByAccountID = createdByAccountID;
    }

    const modifiedByAccountID = sku.getModifiedByAccountID();
    if (modifiedByAccountID !== undefined) {
      draft.modifiedByAccountID = modifiedByAccountID;
    }

    const product = sku.getProduct();
    if (product !== undefined) {
      draft.product = product;
    }

    if (this.collaborators.settingsProvider !== undefined) {
      draft.settingsProvider = this.collaborators.settingsProvider;
    }

    if (this.collaborators.currencyConverter !== undefined) {
      draft.currencyConverter = this.collaborators.currencyConverter;
    }

    if (this.collaborators.priceGroupResolver !== undefined) {
      draft.priceGroupResolver = this.collaborators.priceGroupResolver;
    }

    if (this.collaborators.currentAccountContext !== undefined) {
      draft.currentAccountContext = this.collaborators.currentAccountContext;
    }

    return new Sku(draft);
  }
}
