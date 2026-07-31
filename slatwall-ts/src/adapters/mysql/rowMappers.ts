/**
 * rowMappers — explicit, typed column-to-field hydration for the extracted Catalog slice.
 *
 * AUTHORITY. AAP 0.4.1.7 "MySQL Adapters", row 9: *"`slatwall-ts/src/adapters/mysql/rowMappers.ts`
 * | CREATE | REFERENCE the six in-scope entity files | Explicit column-to-field mapping replacing
 * Hibernate hydration; 32-character string identifiers honoured (IR-6)"*. Supporting authority:
 * AAP 0.3.3's "Data mapper / row mapper" row, which replaces *"Hibernate hydration driven by CFC
 * property metadata"* with *"explicit, typed, testable"* mapping; AAP 0.2.2.6 (the
 * calculated-property boundary); IR-6.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * The legacy system never wrote a mapper. Hibernate hydrated each entity from the CFC `property`
 * metadata, so the correspondence between a `Sw*` column and an entity field was implicit,
 * undocumented and unverifiable. Every mapping decision that used to be absorbed by the ORM is made
 * here instead, in the open, where a compiler and a test can see it. Sibling ports state the same
 * ownership from the other side — `src/ports/repositories/SkuRepository.ts` records that
 * *"Column-to-field mapping has one owner, `src/adapters/mysql/rowMappers.ts` (AAP 0.4.1.7)"*, and
 * `src/domain/base/AuditableEntity.ts` defers the audit foreign-key translation to this module by
 * name. This file is therefore the single place the physical column vocabulary is spoken.
 *
 * WHAT THIS FILE IS NOT
 * --------------------
 *   - IT CONTAINS NO STATEMENT TEXT AND NO TABLE OR COLUMN IDENTIFIER IN AN EXECUTABLE POSITION
 *     BEYOND THE COLUMN NAMES IT READS. Statement composition and parameter binding belong to
 *     `QueryRunner.ts` and the five repositories, which bind every value through `pool.execute()`
 *     with `?` placeholders (AAP 0.7.3 S2). Hydration and query composition are separate concerns,
 *     and keeping them separate is what makes both testable. There is deliberately no
 *     "fetch-and-map" convenience helper here.
 *   - IT HOLDS NO STATE. Every export is a pure free function; nothing is injected, no pool is
 *     accepted, no credential is read, and there is no mapper class, no registry keyed by entity
 *     name and no service locator (AAP 0.7.3 S3). For contrast, `model/dao/ProductDAO.cfc` builds a
 *     credential-reading connection in three separate places, at `:L155-L158`, `:L329-L330` and
 *     `:L420`; none of that shape survives.
 *   - IT CACHES NOTHING. No module-scope `Map`, no memoised mapper, no interned string table, no
 *     lazily built column-name index. This is the M7 execution-model mismatch made explicit:
 *     `cacheuse="transactional"` sits on 111 of the 113 legacy entities and the legacy entities also
 *     memoise derived getters in their own `variables` scope, and AAP 0.6.6 requires any memoisation
 *     in the target be *"scoped to the request object rather than the module, to avoid cross-tenant
 *     bleed on a warm container"*. A module-scope cache in a mapper would be exactly that bleed. The
 *     only module-scope state anywhere in this subtree is the connection pool in
 *     `src/config/database.ts`.
 *   - IT READS NO ENVIRONMENT AND NAMES NO CLOUD TYPE. Configuration flows one way through
 *     `src/config/`, and all AWS coupling is confined to `src/handlers/` (AAP 0.7.3 S4).
 *
 * IMPORT DIRECTION (AAP 0.7.3 S4 — hexagonal separation)
 * ----------------------------------------------------
 * An adapter may reach `domain/`, `ports/`, `util/`, `errors/` and the `mysql2` package, and nothing
 * else. This module reaches only `domain/` and `errors/` — it needs no `util/` helper, and it needs
 * no `mysql2` type either, because {@link toRows} accepts `unknown` and narrows rather than
 * restating the driver's result union. Nothing from `config/`, `services/`, `handlers/`,
 * `integrations/` or `validation/` is imported, and neither is the sibling
 * `src/adapters/settings/StaticSettingResolver.ts`. Every import is relative and extensionless,
 * because `tsconfig.json` declares no `baseUrl` and no `paths`: an alias that type-checks under
 * `tsc` can still fail to resolve under `esbuild` and throw `MODULE_NOT_FOUND` at Lambda cold start.
 *
 * THE FAILURE MODE THIS FILE IS BUILT TO PREVENT
 * ---------------------------------------------
 * A nullable column mapped to `null`, or to a present-but-`undefined` property, instead of to an
 * ABSENT property. It compiles, it reads naturally, and it silently diverges from the convention the
 * domain layer settled on — `src/domain/base/populate.ts` implements CFML null semantics as
 * `delete target[name]`, because `org/Hibachi/HibachiTransient.cfc` sets a property to NULL by
 * deleting its key. Nothing at the database boundary would catch the difference. Every nullable
 * column in this file therefore routes through {@link assignOptional}, which deletes rather than
 * assigns, and no line in this file ever assigns `undefined` or `null` to a field.
 *
 * @see slatwall-ts/src/domain/base/populate.ts for the sibling half of the same convention.
 */

import { Brand } from '../../domain/product/Brand';
import { Option } from '../../domain/option/Option';
import { OptionGroup } from '../../domain/option/OptionGroup';
import { Product } from '../../domain/product/Product';
import { ProductType } from '../../domain/product/ProductType';
import { Sku } from '../../domain/sku/Sku';
import { DomainError } from '../../errors/DomainError';

import type { AuditableEntity } from '../../domain/base/AuditableEntity';
import type {
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../ports/repositories/OptionRepository';
import type { ProductSearchRow } from '../../ports/repositories/ProductRepository';
import type { ProductTypeTreeRow } from '../../ports/repositories/ProductTypeRepository';
import type { SkuSearchRow } from '../../ports/repositories/SkuRepository';

/* ===============================================================================================
 * TODO(parity) D22 — THE LOGICAL VERSUS PHYSICAL NAME VOCABULARY
 * ===============================================================================================
 * Byte-verified at each entity file's `:L49`. Recorded here because this is the natural place for a
 * reader of the adapter folder to find the shared vocabulary the repositories depend on, and because
 * getting it wrong produces a statement that fails at run time with nothing to catch it earlier.
 *
 *   [model/entity/Product.cfc:L49]      entityname SlatwallProduct      table SwProduct
 *   [model/entity/Sku.cfc:L49]          entityname SlatwallSku          table SwSku
 *   [model/entity/ProductType.cfc:L49]  entityname SlatwallProductType  table SwProductType
 *   [model/entity/Brand.cfc:L49]        entityname SlatwallBrand        table SwBrand
 *   [model/entity/Option.cfc:L49]       entityname SlatwallOption       table SwOption
 *   [model/entity/OptionGroup.cfc:L49]  entityname SlatwallOptionGroup  table SwOptionGroup
 *
 * plus the many-to-many link table SwSkuOption, declared at [model/entity/Sku.cfc:L76] on the owning
 * side with `fkcolumn="skuID" inversejoincolumn="optionID"`, and mirrored at
 * [model/entity/Option.cfc:L66] with `inverse="true"`. Its two columns are therefore `skuID` and
 * `optionID`, which is what `MySqlSkuRepository.ts` binds when it builds its existence sub-queries.
 * The two remaining SKU link tables are SwSkuAccessContent [model/entity/Sku.cfc:L77] and
 * SwSkuSubsBenefit [:L78].
 *
 * The dual vocabulary is not an inconsistency to be tidied away. It exists because the ORM layer
 * prefixes the application key onto every entity name it is handed — `getSmartList` at
 * [org/Hibachi/HibachiDAO.cfc:L102-L106] adds the application key when the supplied name does not
 * already start with it — so `Slatwall*` is the legitimate, correct name in HQL while `Sw*` is the
 * only name a native statement can use. Hence the rule, stated once and applied everywhere:
 * never 'fix' HQL entity names to `Sw*`, and never assume a logical name works in native SQL.
 *
 * One in-scope statement is worth knowing about because this file maps its output: the product-type
 * tree query at [model/dao/ProductTypeDAO.cfc:L54-L62] is native statement text that nonetheless
 * names the logical entities. Deciding what to emit for it belongs to `MySqlProductTypeRepository.ts`
 * and not here; the finding takes no new register number, the defect register being closed at
 * D1-D22 and the mismatch register at M1-M8.
 *
 * THIS FILE ITSELF NAMES NO TABLE IN ANY EXECUTABLE POSITION. The block above is documentation.
 * =============================================================================================== */

/**
 * One row of a MySQL result set, before any narrowing.
 *
 * This is the row vocabulary of the whole adapter folder: `QueryRunner.ts` imports this alias rather
 * than re-declaring it, and rather than letting the driver's own heterogeneous result union escape
 * past this boundary. Each value is `unknown` because that is the honest type of a column read — the
 * driver returns a string for a `DECIMAL`, a number for an `INT`, a `Date` for a `DATETIME` and
 * `null` for any nullable column, and narrowing is the job of the reader helpers below rather than
 * of an assertion at the call site.
 */
export type MySqlRow = Record<string, unknown>;

/**
 * Narrows an unknown value to an array of unknown elements.
 *
 * Written as a type predicate rather than as an inline `Array.isArray` check for one specific
 * reason: `Array.isArray` is declared to narrow its argument to `any[]`, so using it inline would
 * put an `any`-typed value into the enclosing scope and force a lint escape hatch there. Confining
 * it to a predicate body, where only its boolean result is used, keeps `unknown` narrowed to
 * `readonly unknown[]` with no `any` anywhere.
 *
 * @param value - Any value.
 * @returns `true` when `value` is an array.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Narrows an unknown value to a single result-set row.
 *
 * A row is a non-null object that is not itself an array. Arrays are rejected explicitly because the
 * driver's result union includes nested arrays for multi-statement and procedure calls, and treating
 * one of those as a row would produce an object whose keys are numeric indices — a shape that maps
 * cleanly to every field being absent, which is precisely the silent failure this module exists to
 * prevent.
 *
 * @param value - Any value.
 * @returns `true` when `value` can be read as a result-set row.
 */
function isMySqlRow(value: unknown): value is MySqlRow {
  return typeof value === 'object' && value !== null && !isUnknownArray(value);
}

/**
 * Narrows a driver result to the rows it carries.
 *
 * This is the one place the driver's heterogeneous result shape is dealt with. `mysql2` types the
 * first element of an `execute()` result as a union covering row arrays, nested row arrays,
 * write-acknowledgement packets, result-set headers and procedure-call packets, and its row type
 * carries an index signature that widens every column to `any`. The parameter is therefore declared
 * `unknown`: a caller may hand over the driver value directly, no driver type is imported, and
 * nothing downstream of this function ever sees the union.
 *
 * A LINT ESCAPE HATCH IS DELIBERATELY NOT USED HERE, AND THE ABSENCE IS THE POINT. The narrowing is
 * performed by the two type predicates above, so this module contains no `any`, no assertion, no
 * `as` cast and no suppression comment of any kind — which is a strictly stronger position than the
 * single inline exception the folder convention would have permitted for exactly this function. A
 * reviewer searching this file for a disable directive and finding none is looking at the intended
 * outcome, not at a missing annotation.
 *
 * A result that is not an array of row objects is a genuine programming fault at the call site — a
 * write statement routed into a read path, or a multi-statement result handed in whole — so it
 * raises rather than degrading to an empty array, which would silently report "no rows found".
 *
 * @param result - The value a driver returned for a statement, unnarrowed.
 * @returns The rows, in the order the driver produced them.
 * @throws {DomainError} When `result` is not an array, or when any element is not a row object.
 *
 * @example
 * ```ts
 * const [driverResult] = await pool.execute(sql, params);
 * const skus = mapRows(toRows(driverResult), mapSkuRow);
 * ```
 */
export function toRows(result: unknown): MySqlRow[] {
  if (!isUnknownArray(result)) {
    throw new DomainError(
      'The database driver returned a result that is not a list of rows, so it cannot be read as one.',
      { context: { resultType: typeof result } },
    );
  }

  const rows: MySqlRow[] = [];
  for (let index = 0; index < result.length; index += 1) {
    const element = result[index];
    if (!isMySqlRow(element)) {
      throw new DomainError(
        'The database driver returned a list whose entries are not all rows, so it cannot be read as a result set.',
        { context: { index, entryType: typeof element } },
      );
    }
    rows.push(element);
  }
  return rows;
}

/**
 * Applies a mapper to every row of a result set.
 *
 * A one-line convenience that exists so the five repositories express hydration identically instead
 * of each writing its own loop. The callback is invoked with the row and nothing else — deliberately
 * not passed straight to `Array.prototype.map`, which would also supply an index and the source
 * array and would silently feed extra arguments to any mapper that ever grew a second parameter.
 *
 * The input is `readonly` because mapping never mutates the result set. The output is a mutable
 * array because the domain collections it feeds are live by contract: `model/entity/Option.cfc:L95`,
 * `:L102` and `:L104` mutate the array they are handed in place, so a frozen or read-only result
 * would break option mutation several layers up with no error anywhere.
 *
 * @typeParam T - What each row maps to.
 * @param rows - The rows to map, typically from {@link toRows}.
 * @param map - The per-row mapper, typically one of the `map*Row` functions in this module.
 * @returns One mapped value per row, in row order.
 */
export function mapRows<T>(rows: readonly MySqlRow[], map: (row: MySqlRow) => T): T[] {
  const mapped: T[] = [];
  for (const row of rows) {
    mapped.push(map(row));
  }
  return mapped;
}

/* ===============================================================================================
 * THE TWO ASSIGNMENT PRIMITIVES
 * ===============================================================================================
 * Every field in this module is written through exactly one of the two functions below, and which
 * one applies is decided by the domain declaration rather than by the column. The distinction is
 * behaviour-bearing, so it is encoded in the types: each helper accepts only the kind of field it is
 * meant for, and using the wrong one is a compile error rather than a review finding.
 *
 *   OPTIONAL DOMAIN FIELD  ->  assignOptional   ->  a SQL NULL DELETES the key
 *   REQUIRED DOMAIN FIELD  ->  assignDefaulted  ->  a SQL NULL leaves the declared default alone
 *
 * The second case is not a licence to invent defaults, which AAP 0.7.3 S9 forbids outright. It
 * applies only where the legacy source itself declares one and the domain class reproduces it as a
 * field initialiser: `activeFlag default="1"` [model/entity/Sku.cfc:L52], the three
 * `default="0"` money columns [:L53-L55], `userDefinedPriceFlag default="0"` [:L57],
 * `imageGroupFlag default="0"` [model/entity/OptionGroup.cfc:L57], and the six
 * `unsavedvalue="" default=""` primary keys. A required field cannot be deleted without lying about
 * its type, and the value that remains is the one the source declared — not one chosen here.
 * =============================================================================================== */

/**
 * The names of `TTarget`'s genuinely optional fields.
 *
 * A field qualifies when `undefined` is part of its declared type, which under
 * `exactOptionalPropertyTypes` is true exactly for a `foo?:` declaration. Intersecting with `string`
 * drops the numeric and symbol keys a class never has, so the result is usable as an index.
 *
 * @typeParam TTarget - The object whose optional field names are wanted.
 */
type NullableFieldName<TTarget> = {
  [TKey in keyof TTarget]-?: undefined extends TTarget[TKey] ? TKey : never;
}[keyof TTarget] &
  string;

/**
 * The names of `TTarget`'s required fields — the exact complement of {@link NullableFieldName}.
 *
 * @typeParam TTarget - The object whose required field names are wanted.
 */
type DefaultedFieldName<TTarget> = {
  [TKey in keyof TTarget]-?: undefined extends TTarget[TKey] ? never : TKey;
}[keyof TTarget] &
  string;

/**
 * Writes a nullable column into an optional domain field, DELETING the field when the column is
 * NULL.
 *
 * ⚠️ THIS IS THE MOST IMPORTANT FUNCTION IN THE MODULE, AND THE REASON IS A SPECIFIC LEGACY CALL
 * SITE. `model/service/ProductService.cfc:L268` tests `isNull(arguments.product.getURLTitle())` and
 * nothing else, whereas the sibling `saveProductType` at `:L295` tests `isNull(...) || !len(...)`.
 * So a product whose `urlTitle` arrives blank must end up with the key ABSENT: if absence were
 * encoded as `''` or as a present-but-`undefined` property, `isNull()` would report false, the
 * generate-a-unique-title branch would never run, and the product would be saved with no URL title
 * at all. A real, user-visible behavioural difference produced by nothing more than choosing
 * assignment over deletion. `src/domain/base/populate.ts` reaches the same conclusion from the
 * request-data side, translating `structDelete(variables, name)` as `delete target[name]`.
 *
 * Consequently: `target.field = value ?? undefined` is WRONG here and appears nowhere in this file.
 * Under `exactOptionalPropertyTypes` a present-but-`undefined` property is a distinct state from an
 * absent one, and the domain chose absence.
 *
 * The deletion goes through a locally typed view on which the key is declared optional. That is an
 * ordinary widening assignment rather than an assertion — no `as`, no `any`, no suppression — and it
 * is the same shape `src/domain/base/populate.ts` uses to make its own `delete` legal.
 *
 * @typeParam TTarget - The entity being hydrated.
 * @typeParam TKey - One of `TTarget`'s optional field names. Passing a required field name is a
 *   compile error, which is what stops a declared default from being deleted.
 * @param target - The entity being hydrated, mutated in place.
 * @param key - The field to write.
 * @param value - The column value, already narrowed. `null` or `undefined` deletes the field.
 */
function assignOptional<TTarget extends object, TKey extends NullableFieldName<TTarget>>(
  target: TTarget,
  key: TKey,
  value: TTarget[TKey] | null | undefined,
): void {
  if (value === null || value === undefined) {
    const clearable: Partial<Record<TKey, unknown>> = target;
    delete clearable[key];
    return;
  }
  target[key] = value;
}

/**
 * Writes a nullable column into a required domain field, LEAVING THE DECLARED DEFAULT IN PLACE when
 * the column is NULL.
 *
 * The field cannot be deleted without contradicting its own type, so the source-declared default the
 * domain class set in its field initialiser survives. Nothing is coerced and nothing is invented: a
 * NULL numeric does not become `0` and a NULL flag does not become `false` because this function
 * decided so — those values are present only where `model/entity/Sku.cfc:L52-L57` and
 * `model/entity/OptionGroup.cfc:L57` declare them.
 *
 * @typeParam TTarget - The entity being hydrated.
 * @typeParam TKey - One of `TTarget`'s required field names. Passing an optional field name is a
 *   compile error, which is what keeps nullable columns on the deleting path.
 * @param target - The entity being hydrated, mutated in place.
 * @param key - The field to write.
 * @param value - The column value, already narrowed. `null` or `undefined` writes nothing.
 */
function assignDefaulted<TTarget extends object, TKey extends DefaultedFieldName<TTarget>>(
  target: TTarget,
  key: TKey,
  value: TTarget[TKey] | null | undefined,
): void {
  if (value === null || value === undefined) {
    return;
  }
  target[key] = value;
}

/* ===============================================================================================
 * THE TYPED COLUMN READERS
 * ===============================================================================================
 * `noUncheckedIndexedAccess` types every `row['column']` read as `unknown`, which is exactly right:
 * a row arrives from a driver and nothing about its contents is guaranteed. Each reader below
 * narrows one column with explicit `typeof` and `instanceof` tests, so no assertion, cast or
 * non-null operator appears anywhere in this file (AAP 0.7.3 S1).
 *
 * Each reader has three outcomes and no fourth: the narrowed value; `undefined` when the column is
 * absent or SQL NULL, which the assignment primitives above turn into a deleted key or a preserved
 * default; or a raised {@link DomainError} naming the column and the runtime type it actually saw.
 * Raising is deliberate. A column whose runtime type does not match the field it feeds is a mapping
 * fault, and a mapping fault that coerces quietly is the failure this whole module exists to
 * prevent — so the readers refuse to guess.
 *
 * DRIVER TYPE VARIANCE, DOCUMENTED RATHER THAN ASSUMED AWAY. The physical column types cannot be
 * verified in this environment: the repository carries no schema definition at all, because the
 * legacy ORM generated the schema from CFC metadata at run time, and no CFML engine is available
 * here. The readers therefore accept the representations MySQL and its Node driver are known to
 * produce for the `ormtype` values the six in-scope entities declare, and refuse everything else
 * loudly. Where that acceptance is wider than the JavaScript type of the target field, the reason is
 * stated on the reader.
 * =============================================================================================== */

/**
 * Reads a text column.
 *
 * Accepts only a string. A number or `Date` in a column that feeds a string field means the column
 * being read is not the column intended, so it raises rather than stringifying — stringifying is the
 * coercion layer that would hide the mistake.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The string, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that is not a string.
 */
function readOptionalString(row: MySqlRow, columnName: string): string | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw columnTypeError(columnName, 'a string', value);
}

/**
 * Reads a text column that feeds a non-optional string field, yielding `''` when it is absent or
 * NULL.
 *
 * The empty string is not an invented default. It is what the legacy code observed: a CFML query
 * column read never produces null, so the projection assembled at `model/dao/SkuDAO.cfc:L141-L146`
 * — and likewise at `model/dao/ProductDAO.cfc:L432-L433`, `model/dao/OptionDAO.cfc:L88` and
 * `:L113` — stored the empty string for a NULL column. The same value is also what the entity
 * convention requires of a missing identifier: `unsavedvalue="" default=""` on all six primary keys,
 * which every domain class reproduces as `''` so that its `isNew()` holds.
 *
 * The optional second column name exists because these projections are renames. The legacy
 * statements select the physical columns and the CFML loop then renames them into the port's
 * lowercase `id` / `value` / `name` keys, so a faithful implementation may legitimately present
 * either shape: the physical column when the statement is a straight copy of the legacy text, or the
 * port's key when the statement aliases it. The physical column is tried first and the port key
 * second; both carry the same value, so the outcome is identical either way.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name, tried first.
 * @param alternateColumnName - The projection key to fall back to, when the statement aliased it.
 * @returns The string, or `''` when neither name is present or both are NULL.
 * @throws {DomainError} When either name holds a value that is not a string.
 */
function readRequiredString(
  row: MySqlRow,
  columnName: string,
  alternateColumnName?: string,
): string {
  const value = readOptionalString(row, columnName);
  if (value !== undefined) {
    return value;
  }
  if (alternateColumnName !== undefined) {
    return readOptionalString(row, alternateColumnName) ?? '';
  }
  return '';
}

/**
 * Reads a numeric column.
 *
 * ⚠️ A NUMERIC STRING IS ACCEPTED, AND IT HAS TO BE. `ormtype="big_decimal"` — the type of
 * `price`, `listPrice` and `renewalPrice` at `model/entity/Sku.cfc:L53-L55` and of
 * `calculatedSalePrice` at `model/entity/Product.cfc:L62` — becomes a MySQL `DECIMAL`, and the Node
 * driver hands `DECIMAL` back as a JavaScript string so that no precision is lost in transit. The
 * legacy value was numeric: the CFML engine's ORM mapped the column to a numeric property, and every
 * legacy consumer did arithmetic on it. Converting here reproduces the legacy type across a driver
 * difference; refusing the string would break every price read, and carrying the string forward
 * would change the field's type. `bigint` is accepted for the same reason, in case a driver is
 * configured to return large integers that way.
 *
 * Non-finite results are refused, so a `NaN` never reaches a field and then propagates silently
 * through arithmetic.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The number, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that is not a finite number, a finite numeric
 *   string, or a `bigint`.
 */
function readOptionalNumber(row: MySqlRow, columnName: string): number | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value;
    }
    throw columnTypeError(columnName, 'a finite number', value);
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (value.trim().length > 0 && Number.isFinite(parsed)) {
      return parsed;
    }
    throw columnTypeError(columnName, 'a number, or a string holding one', value);
  }
  throw columnTypeError(columnName, 'a number', value);
}

/**
 * Reads a numeric column that a projection is required to supply.
 *
 * Used only for the two count aggregates of the product-type tree projection. Unlike a nullable data
 * column, a count cannot legitimately be missing: a count aggregate returns zero for no matching rows
 * rather than NULL, so absence means the row is not the projection the caller believes it is.
 * Substituting zero would turn that mistake into a plausible-looking answer.
 *
 * @param row - The row being read.
 * @param columnName - The projection's column alias.
 * @returns The number.
 * @throws {DomainError} When the column is absent, NULL, or holds a value that is not numeric.
 */
function readRequiredNumber(row: MySqlRow, columnName: string): number {
  const value = readOptionalNumber(row, columnName);
  if (value === undefined) {
    throw columnTypeError(columnName, 'a number the projection always supplies', row[columnName]);
  }
  return value;
}

/**
 * Reads a boolean-flag column.
 *
 * ⚠️ FOUR REPRESENTATIONS ARE ACCEPTED BECAUSE MySQL AND ITS DRIVER PRODUCE FOUR. `ormtype="boolean"`
 * has no single physical form: depending on how the legacy ORM generated the column it is a
 * `TINYINT(1)`, which the driver returns as the number 0 or 1, or a `BIT(1)`, which the driver
 * returns as a one-byte binary value. A driver configured to stringify results yields `'0'` / `'1'`,
 * and a driver configured to cast yields a real boolean. The legacy source writes these columns as
 * `default="1"` and `default="0"` — `model/entity/Sku.cfc:L52`, `:L57` and
 * `model/entity/OptionGroup.cfc:L57` — which confirms the stored representation is a zero-or-one
 * integer, and `model/entity/Product.cfc:L58` writes `default="false"` for the same `ormtype`. All
 * four forms therefore denote the same flag, and reading any of them yields the same boolean.
 *
 * The binary form is tested against `Uint8Array` rather than against the Node `Buffer` global: a
 * buffer IS a `Uint8Array`, so the test covers it, and using the standard-library type keeps this
 * module free of platform globals under a `lib` of `ES2022` alone.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The boolean, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that denotes no recognisable flag.
 */
function readOptionalBoolean(row: MySqlRow, columnName: string): boolean | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value !== 0;
    }
    throw columnTypeError(columnName, 'a zero-or-one flag', value);
  }
  if (typeof value === 'string') {
    if (value === '1' || value === 'true') {
      return true;
    }
    if (value === '0' || value === 'false') {
      return false;
    }
    throw columnTypeError(columnName, 'a zero-or-one flag', value);
  }
  if (value instanceof Uint8Array) {
    const firstByte = value[0];
    if (value.length === 1 && firstByte !== undefined) {
      return firstByte !== 0;
    }
    throw columnTypeError(columnName, 'a single-byte binary flag', value);
  }
  throw columnTypeError(columnName, 'a zero-or-one flag', value);
}

/**
 * Reads a timestamp column.
 *
 * `ormtype="timestamp"` becomes a MySQL `DATETIME`, which the driver returns as a `Date` by default
 * and as a string when it is configured to keep dates textual; both are accepted and both produce a
 * `Date`. A `Date` that does not represent a real instant is refused rather than stored, because an
 * invalid date propagates into every comparison and format that touches it while still passing an
 * `instanceof` test.
 *
 * A NULL timestamp yields `undefined` and therefore an absent field. It is NOT turned into the empty
 * string, even though `org/Hibachi/HibachiEntity.cfc:L291-L305` returns `""` for one: that override
 * belongs to the READ side of the two audit timestamps and is reproduced by the accessor functions
 * in `src/domain/base/AuditableEntity.ts`. Baking it into hydration would make an unset timestamp
 * indistinguishable from a set one at the field level, and would give the same treatment to the two
 * plain `ormtype="timestamp"` columns that never had it.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The `Date`, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that is not a valid date or a parseable date
 *   string.
 */
function readOptionalDate(row: MySqlRow, columnName: string): Date | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) {
      return value;
    }
    throw columnTypeError(columnName, 'a valid timestamp', value);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
    throw columnTypeError(columnName, 'a parseable timestamp string', value);
  }
  throw columnTypeError(columnName, 'a timestamp', value);
}

/**
 * Builds the error a reader raises when a column's runtime type does not match the field it feeds.
 *
 * The message is written fresh for this module. No legacy `throw()` text is reproduced or paraphrased
 * here: those strings are observable behaviour of the members that raise them and are declared once,
 * in `src/errors/DomainError.ts`, so that their verbatim fidelity stays checkable by a single search
 * per string.
 *
 * The offending value itself is deliberately NOT interpolated into the message — only its runtime
 * type is, and the value is left to the structured context. A column value can be user data, and a
 * message string is the part of an error most likely to reach a log.
 *
 * @param columnName - The column that was read.
 * @param expectation - What the reader required, phrased to complete "expected ...".
 * @param value - The value actually found, attached as context rather than interpolated.
 * @returns The error to throw.
 */
function columnTypeError(columnName: string, expectation: string, value: unknown): DomainError {
  return new DomainError(
    `Column "${columnName}" cannot be read: expected ${expectation}, but the row holds a value of type ${typeof value}.`,
    { context: { columnName, expectation, valueType: typeof value } },
  );
}

/**
 * Hydrates the four audit fields every in-scope entity declares.
 *
 * The block is byte-identical on all six entities — `model/entity/Product.cfc:L96-L99`,
 * `model/entity/Sku.cfc:L93-L96`, `model/entity/ProductType.cfc:L83-L86`,
 * `model/entity/Brand.cfc:L77-L80`, `model/entity/Option.cfc:L76-L79` and
 * `model/entity/OptionGroup.cfc:L64-L67` — so it is hydrated once here rather than six times. The
 * parameter is typed against the structural contract in `src/domain/base/AuditableEntity.ts`, which
 * is *"a type plus free functions, NEVER an inheritance root"*: each entity declares the four fields
 * on its own surface and satisfies the contract structurally, and this function writes through that
 * contract without any entity inheriting anything.
 *
 * ⚠️ TWO OF THE FOUR ARE COLUMN-TO-FIELD RENAMES, AND THIS IS THE ONLY PLACE THAT KNOWS IT. The
 * legacy declarations are `many-to-one` associations to `cfc="Account"` carrying
 * `fkcolumn="createdByAccountID"` and `fkcolumn="modifiedByAccountID"`, while the domain fields are
 * the un-suffixed `createdByAccount` and `modifiedByAccount`, typed as the 32-character identifier
 * string of IR-6 rather than as an account entity — the twenty-one `Account*` files are out of
 * scope, so no account type is declared, imported or hydrated anywhere in this port. So: read the
 * `*ID` column, write the un-suffixed field.
 *
 * TODO(parity): the two Account fields deliberately get NO empty-string default.
 * `org/Hibachi/HibachiEntity.cfc:L291-L305` overrides ONLY `getCreatedDateTime` and
 * `getModifiedDateTime` to return `""` in place of a null; the two Account getters carry no override
 * at all and are genuinely null when unset. Giving them a blank default here would invent behaviour
 * the legacy system does not have, so they follow the ordinary nullable-column rule and are absent
 * when the column is NULL.
 *
 * @param entity - The entity being hydrated, mutated in place.
 * @param row - The row being read.
 */
function assignAuditColumns(entity: AuditableEntity, row: MySqlRow): void {
  assignOptional(entity, 'createdDateTime', readOptionalDate(row, 'createdDateTime'));
  assignOptional(entity, 'createdByAccount', readOptionalString(row, 'createdByAccountID'));
  assignOptional(entity, 'modifiedDateTime', readOptionalDate(row, 'modifiedDateTime'));
  assignOptional(entity, 'modifiedByAccount', readOptionalString(row, 'modifiedByAccountID'));
}

/* ===============================================================================================
 * THE ENTITY MAPPERS — FOUR RULES THAT APPLY TO ALL SEVEN
 * ===============================================================================================
 *
 * RULE 1 — PLAIN FIELD WRITES, NEVER A SETTER. No accessor pair exists anywhere in `domain/`: the
 * entities are plain public fields, because `src/domain/base/populate.ts` clears a property with
 * `delete` and *"you cannot `delete` an accessor-backed value"*. So each mapper constructs the entity
 * and writes its fields directly. The one apparent exception is not one: nothing here calls
 * `setOptionGroup`, `addSku` or any other bidirectional helper, because nothing here hydrates an
 * association at all — see RULE 3.
 *
 * RULE 2 — ONE MAPPER READS ONE TABLE'S COLUMNS. A mapper never inspects a joined table's columns,
 * because two joined tables in one row can collide on a column name — `activeFlag`, `urlTitle`,
 * `sortOrder` and `remoteID` each appear on several of the six in-scope tables — and a collision
 * resolves silently to whichever value the driver kept. A repository that joins is responsible for
 * splitting or aliasing the row before handing each part to the mapper that owns it.
 *
 * RULE 3 — ASSOCIATIONS ARE NOT HYDRATED HERE, AND THAT IS A DECISION THIS FILE WAS ASKED TO MAKE.
 * `src/domain/product/Product.ts` states it explicitly: *"`fetch="join"` is a Hibernate fetch
 * strategy with no target analogue — eager-versus-lazy loading is `src/adapters/mysql/rowMappers.ts`'s
 * decision now."* The decision is that a row mapper hydrates scalar columns only. Every optional
 * many-to-one field — `Product.brand`, `Product.productType`, `Product.defaultSku`,
 * `ProductType.parentProductType`, `Sku.product`, `Sku.subscriptionTerm`, `Option.optionGroup` — is
 * left UNRESOLVED, meaning this module writes nothing to it whatsoever, and every collection keeps
 * the empty array its own class initialised.
 *
 *   What "unresolved" looks like at runtime differs across the domain layer, and the difference is
 *   worth stating rather than leaving to be discovered. `src/domain/product/Product.ts:L945`,
 *   `src/domain/sku/Sku.ts:L1002` and `src/domain/product/Brand.ts` prefix their association fields
 *   with `declare`, which emits no field definition, so a fresh instance does not carry the key at
 *   all. `src/domain/option/Option.ts:L657`, `src/domain/option/OptionGroup.ts` and
 *   `src/domain/product/ProductType.ts:L653` do not, and under `useDefineForClassFields` — on by
 *   default at the ES2022 target this subtree compiles to — a declared field IS defined on the
 *   instance, so a fresh instance carries that key holding `undefined`. Either way no association is
 *   resolved and no stub is fabricated, which is the part that carries behaviour.
 *
 *   THAT DIFFERENCE IS ALSO WHY {@link assignOptional} DELETES RATHER THAN MERELY SKIPPING THE WRITE.
 *   For a column this module does map, "skip the assignment when the value is NULL" would leave the
 *   class-defined `undefined` sitting on those three entities, so one NULL column would yield an
 *   absent key on `Product` and a present-but-undefined key on `Option` — precisely the silent
 *   divergence a downstream `exactOptionalPropertyTypes` consumer is entitled to assume cannot
 *   happen. Deleting normalises absence across both declaration styles, which is why the helper is
 *   written the way it is and must not be simplified into a conditional assignment.
 *
 *   Why not populate a stub carrying just the foreign key, in imitation of a lazy proxy? Because a
 *   stub answers non-identifier reads with class defaults instead of failing. `Sku.generateImageFileName`
 *   reads `option.getOptionGroup().getImageGroupFlag()` at `model/entity/Sku.cfc:L134`, and against a
 *   stub that read would quietly return the declared `false` — a wrong answer with no error anywhere,
 *   which is precisely the silent-failure class this module exists to eliminate. An absent field is
 *   typed, visible and impossible to misread: a caller either resolves the association through the
 *   repository or gets a compile error. The foreign-key value is not lost either — the repository
 *   holds the same row and reads the `*ID` column itself when it needs to resolve the other side.
 *
 * RULE 4 — COLLECTIONS ARE LEFT LIVE. Nothing here freezes, copies, spreads or slices a collection,
 * and no entity collection field is typed read-only. `model/entity/Option.cfc:L95`, `:L102` and
 * `:L104` mutate the array they are given in place, so the domain contract is that the array is the
 * live one; a defensive copy here would break option mutation three layers up with no error anywhere.
 * The empty array is also the state the legacy suite pins: `meta/tests/unit/entity/BrandTest.cfc`
 * overrides `defaults_are_correct` to assert `getProducts()` equals `[]`.
 *
 * THE CALCULATED-PROPERTY BOUNDARY (AAP 0.2.2.6). No non-persistent member is mapped, in any form.
 * The sixteen excluded members have no column at all and are served — where a retained member needs
 * them — by `PricingPort`, `ImagePathPort` and their siblings, never by hydration. Two traps in that
 * list are worth stating because both are easy to get backwards:
 *   - `imageFile` at `model/entity/Sku.cfc:L56` IS a persistent column and IS mapped. Only the
 *     DERIVED image-path members at `model/entity/Sku.cfc:L145`, `:L192` and `:L221` sit behind
 *     `ImagePathPort`. This module maps the stored file name and computes no path.
 *   - The four columns at `model/entity/Product.cfc:L62-L65` and the one at
 *     `model/entity/Sku.cfc:L61` sit under a legacy comment reading "Calculated Properties" and are
 *     nonetheless REAL PERSISTED COLUMNS, each with its own `ormtype`, read straight off the row.
 *     `src/domain/product/Product.ts` says so in as many words. They are NOT members of the excluded
 *     sixteen, and dropping them would leave the entity half-hydrated. Recomputing them is a separate
 *     concern that belongs to `UnitOfWork.ts`. Worth knowing when auditing this file against the
 *     exclusion list: three of these column names — `calculatedSalePrice`,
 *     `calculatedAllowBackorderFlag` and `calculatedQATS` — each embed the name of an excluded
 *     derived member as a suffix, but the camel-case join re-capitalises that embedded word every
 *     time, and upper-cases the acronym one outright. A case-SENSITIVE search for any excluded name
 *     therefore finds nothing anywhere in this module, exactly as it should, and this sentence is
 *     careful not to spell one. A case-INSENSITIVE search does hit all three, and every one of those
 *     hits is the persisted column rather than the excluded derived member.
 *
 * ATTRIBUTE CENSUS, RECORDED SO NOBODY HUNTS FOR MISSING HANDLING. Across the whole in-scope slice:
 * `notNull` appears exactly once, at `model/entity/Product.cfc:L55`, and is a validation concern
 * owned by `src/validation/rules/product.rules.ts` rather than a hydration one; `hb_sessionDefault`,
 * `hb_populateArray` and `hb_fileUpload` appear zero times; `hb_populateEnabled="public"` appears
 * zero times; and `hb_formatType` appears once, at `model/entity/Brand.cfc:L57`, which the legacy
 * population path ignores — so this module ignores it too and performs no formatting of any kind.
 * `hb_populateEnabled="false"` guards the audit block against REQUEST data, which is a populate
 * concern; hydration from a trusted row is what writes those fields in the first place.
 *
 * IDENTIFIERS (IR-6). Every identifier is a plain `string`: never a branded type, never a
 * template-literal type, never a number. The legacy generator at
 * `org/Hibachi/HibachiObject.cfc:L144-L146` lower-cases a UUID and strips its dashes, giving the
 * 32-character hexadecimal form that 107 of the 113 legacy entities declare as
 * `fieldtype="id" generator="uuid" ormtype="string" length="32"`. This module only READS identifiers:
 * generation belongs to `src/util/uuid.ts`, and no shape assertion is performed on the way in,
 * because the legacy hydration performed none and adding one would be new behaviour.
 *
 * PRIMARY KEYS. Each is written with {@link assignDefaulted}, so a row without the identifier column
 * leaves the `''` the domain class declared — the target of `unsavedvalue="" default=""` on all six
 * primary keys, and the value each entity's `isNew()` tests. The empty string therefore comes from
 * the domain declaration rather than being restated here.
 * =============================================================================================== */

/**
 * Hydrates a `SwProduct` row into a {@link Product}.
 *
 * Columns read, in declaration order: the eight persistent properties at
 * `model/entity/Product.cfc:L51-L58`; the four persisted calculated columns at `:L62-L65`; the remote
 * identifier at `:L93`; and the four audit columns at `:L96-L99` via {@link assignAuditColumns}.
 *
 * Not read, and deliberately so: the three many-to-one foreign keys at `:L68-L70`
 * (`brandID`, `productTypeID`, `defaultSkuID`) and every collection at `:L73-L89`, per RULE 3 above;
 * and the twenty non-persistent properties at `:L102-L123`, which have no column, per AAP 0.2.2.6.
 *
 * @param row - One `SwProduct` row.
 * @returns A product carrying every persistent column the row supplied, with its associations
 *   unresolved and its collections empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 *
 * @example
 * ```ts
 * const product = mapProductRow({ productID: 'a'.repeat(32), productName: 'Test Product' });
 * product.productName; // 'Test Product'
 * 'urlTitle' in product; // false — the column was absent, so the field is too
 * ```
 */
export function mapProductRow(row: MySqlRow): Product {
  const product = new Product();

  assignDefaulted(product, 'productID', readOptionalString(row, 'productID'));
  assignOptional(product, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(product, 'urlTitle', readOptionalString(row, 'urlTitle'));
  assignOptional(product, 'productName', readOptionalString(row, 'productName'));
  assignOptional(product, 'productCode', readOptionalString(row, 'productCode'));
  assignOptional(product, 'productDescription', readOptionalString(row, 'productDescription'));
  assignOptional(product, 'publishedFlag', readOptionalBoolean(row, 'publishedFlag'));
  assignOptional(product, 'sortOrder', readOptionalNumber(row, 'sortOrder'));

  // The four persisted columns under the legacy "Calculated Properties" comment. See the
  // calculated-property boundary note above for why these are mapped and the sixteen derived members
  // are not.
  assignOptional(product, 'calculatedSalePrice', readOptionalNumber(row, 'calculatedSalePrice'));
  assignOptional(product, 'calculatedQATS', readOptionalNumber(row, 'calculatedQATS'));
  assignOptional(
    product,
    'calculatedAllowBackorderFlag',
    readOptionalBoolean(row, 'calculatedAllowBackorderFlag'),
  );
  assignOptional(product, 'calculatedTitle', readOptionalString(row, 'calculatedTitle'));

  assignOptional(product, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(product, row);

  return product;
}

/**
 * Hydrates a `SwSku` row into a {@link Sku}.
 *
 * Columns read: the eight persistent properties at `model/entity/Sku.cfc:L51-L57`; the persisted
 * calculated column at `:L60`; the remote identifier at `:L90`; and the four audit columns at
 * `:L93-L96`.
 *
 * Five of those fields are non-optional in the domain because the source declares a default —
 * `activeFlag default="1"` at `:L52`, `listPrice`, `price` and `renewalPrice` each `default="0"` at
 * `:L53-L55`, and `userDefinedPriceFlag default="0"` at `:L57` — so each is written with
 * {@link assignDefaulted} and a NULL column leaves the declared value untouched.
 *
 * `imageFile` at `:L56` is a persistent column and is mapped as the stored file name. No image path
 * is computed and no path setting is read: the derived path members at `:L145`, `:L192` and `:L221`
 * are served by `ImagePathPort`.
 *
 * Not read: the two many-to-one foreign keys at `:L63-L64` (`productID`, `subscriptionTermID`), the
 * five collections at `:L67-L71`, and the four owned and six inverse many-to-many collections at
 * `:L74-L86` — including `options`, whose rows live in the `SwSkuOption` link table and are resolved
 * by `MySqlSkuRepository.ts`. The twenty-three non-persistent properties at `:L99-L121` have no
 * column.
 *
 * Note that the return type is also what `SkuRow` denotes: the SKU port declares `SkuRow` as an alias
 * of the entity precisely so that no second description of the physical row exists to drift from this
 * one.
 *
 * @param row - One `SwSku` row.
 * @returns A SKU carrying every persistent column the row supplied, with its associations unresolved
 *   and its options collection empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapSkuRow(row: MySqlRow): Sku {
  const sku = new Sku();

  assignDefaulted(sku, 'skuID', readOptionalString(row, 'skuID'));
  assignDefaulted(sku, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(sku, 'skuCode', readOptionalString(row, 'skuCode'));
  assignDefaulted(sku, 'listPrice', readOptionalNumber(row, 'listPrice'));
  assignDefaulted(sku, 'price', readOptionalNumber(row, 'price'));
  assignDefaulted(sku, 'renewalPrice', readOptionalNumber(row, 'renewalPrice'));
  assignOptional(sku, 'imageFile', readOptionalString(row, 'imageFile'));
  assignDefaulted(sku, 'userDefinedPriceFlag', readOptionalBoolean(row, 'userDefinedPriceFlag'));

  assignOptional(sku, 'calculatedQATS', readOptionalNumber(row, 'calculatedQATS'));

  assignOptional(sku, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(sku, row);

  return sku;
}

/**
 * Hydrates a `SwProductType` row into a {@link ProductType}.
 *
 * Columns read: the eight persistent properties at `model/entity/ProductType.cfc:L51-L59`; the remote
 * identifier at `:L80`; and the four audit columns at `:L83-L86`.
 *
 * `systemCode` at `:L59` is mapped as an ordinary nullable string and is NOT narrowed to the
 * three-member discriminator union. Only three rows in the whole system ever carry a value — the
 * seeded discriminators at `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, which are fixed
 * platform seed data rather than test data (IR-7) — and typing a database string as that union here
 * would be an unchecked assertion about data this code does not control, as
 * `src/domain/product/ProductType.ts` records. The literals themselves belong to
 * `src/domain/BaseProductType.ts` and are deliberately not restated in this module.
 *
 * Not read: the self-referencing foreign key `parentProductTypeID` at `:L62`, the three collections at
 * `:L65-L67`, and the eight inverse many-to-many collections at `:L70-L77`. All three seeded rows
 * carry a null parent, so absence is also the ordinary state for a root.
 *
 * @param row - One `SwProductType` row.
 * @returns A product type carrying every persistent column the row supplied, with its parent
 *   unresolved and its collections empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapProductTypeRow(row: MySqlRow): ProductType {
  const productType = new ProductType();

  assignDefaulted(productType, 'productTypeID', readOptionalString(row, 'productTypeID'));
  assignOptional(productType, 'productTypeIDPath', readOptionalString(row, 'productTypeIDPath'));
  assignOptional(productType, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(productType, 'publishedFlag', readOptionalBoolean(row, 'publishedFlag'));
  assignOptional(productType, 'urlTitle', readOptionalString(row, 'urlTitle'));
  assignOptional(productType, 'productTypeName', readOptionalString(row, 'productTypeName'));
  assignOptional(
    productType,
    'productTypeDescription',
    readOptionalString(row, 'productTypeDescription'),
  );
  assignOptional(productType, 'systemCode', readOptionalString(row, 'systemCode'));

  assignOptional(productType, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(productType, row);

  return productType;
}

/**
 * Hydrates one row of the product-type tree projection into a {@link ProductTypeTreeRow}.
 *
 * The legacy query at `model/dao/ProductTypeDAO.cfc:L52-L62` projects every column of the product-type
 * table — hence the full column set, delegated to {@link mapProductTypeRow} rather than duplicated —
 * plus two correlated count sub-selects, ordered by product-type name.
 *
 * ⚠️ `isAssigned` IS A COUNT, NOT A FLAG. It is `count(...)` over the products of this product type,
 * at `model/dao/ProductTypeDAO.cfc:L55-L57`, so its value is zero through N and never a boolean. The
 * name is a misnomer inherited from the legacy source and is preserved exactly, because the port
 * declares it and callers observe it; treating it as a boolean would make every product type with any
 * product look identical to one with exactly one, and would make `0` and `1` the only reachable
 * values. `childCount` at `:L58-L60` counts the product types naming this one as their parent through
 * the self-join on `parentProductTypeID`, so it is immediate children only and never a transitive
 * subtree size.
 *
 * Both counts are attached with a single merge rather than assigned field by field, because the port
 * declares them `readonly`: they are query-computed values with no column of their own, and nothing
 * downstream has any business writing to them.
 *
 * Both are also REQUIRED of the row rather than defaulted. A count aggregate yields zero for no
 * matching rows and can never be NULL, so an absent count means the projection handed in is not the
 * tree projection — and quietly substituting zero there would report "no products assigned" for every
 * product type, which is a wrong answer that no test of the mapper in isolation would catch.
 *
 * @param row - One row of the product-type tree projection.
 * @returns A product type carrying its two derived counts.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field, or
 *   when either count is missing or not numeric.
 */
export function mapProductTypeTreeRow(row: MySqlRow): ProductTypeTreeRow {
  const productType = mapProductTypeRow(row);

  return Object.assign(productType, {
    isAssigned: readRequiredNumber(row, 'isAssigned'),
    childCount: readRequiredNumber(row, 'childCount'),
  });
}

/**
 * Hydrates a `SwBrand` row into a {@link Brand}.
 *
 * Columns read: the six persistent properties at `model/entity/Brand.cfc:L51-L57`; the remote
 * identifier at `:L73`; and the four audit columns at `:L77-L80`.
 *
 * `brandWebsite` at `:L57` carries `hb_formatType="url"`. That attribute is a display hint the legacy
 * population path ignores, so the column is mapped as a plain string and nothing is formatted,
 * validated or normalised on the way in. Whether the value is a well-formed URL is a validation
 * concern, owned by `src/validation/rules/brand.rules.ts`.
 *
 * Not read: the two owned collections at `:L60-L61` and the six inverse many-to-many collections at
 * `:L66-L71`.
 *
 * THIS MAPPER IS COMPLETE, NOT ABBREVIATED. `model/entity/Brand.cfc` declares no non-persistent
 * property at all — its non-persistent section is empty — so there is nothing further that hydration
 * could contribute and nothing here has been trimmed for brevity.
 *
 * @param row - One `SwBrand` row.
 * @returns A brand carrying every persistent column the row supplied, with its collections empty and
 *   live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapBrandRow(row: MySqlRow): Brand {
  const brand = new Brand();

  assignDefaulted(brand, 'brandID', readOptionalString(row, 'brandID'));
  assignOptional(brand, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(brand, 'publishedFlag', readOptionalBoolean(row, 'publishedFlag'));
  assignOptional(brand, 'urlTitle', readOptionalString(row, 'urlTitle'));
  assignOptional(brand, 'brandName', readOptionalString(row, 'brandName'));
  assignOptional(brand, 'brandWebsite', readOptionalString(row, 'brandWebsite'));

  assignOptional(brand, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(brand, row);

  return brand;
}

/**
 * Hydrates a `SwOption` row into an {@link Option}.
 *
 * Columns read: the five persistent properties at `model/entity/Option.cfc:L51-L56`; the remote
 * identifier at `:L73`; and the four audit columns at `:L76-L79`.
 *
 * `sortOrder` at `:L56` carries `sortContext="optionGroup"`, meaning the value is ordered within its
 * option group rather than globally. That is a fact about how the column is USED — by the ordering of
 * `getOptions()` at `model/entity/OptionGroup.cfc:L70` and by the sorted-SKU ordering query — not
 * about how it is stored, so the column is mapped as a plain nullable number and no ordering is
 * applied here.
 *
 * Not read: the option-group foreign key `optionGroupID` at `:L59` and the `skus` collection at
 * `:L66`, whose rows live in the `SwSkuOption` link table. The domain declares neither the image
 * association at `:L60` nor the image collection at `:L63` nor the four promotion collections at
 * `:L67-L70`, all of which reach out-of-scope entities, so no column of theirs is read either.
 *
 * THIS MAPPER IS COMPLETE, NOT ABBREVIATED. `model/entity/Option.cfc` declares no non-persistent
 * property at all.
 *
 * @param row - One `SwOption` row.
 * @returns An option carrying every persistent column the row supplied, with its group unresolved and
 *   its SKU collection empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapOptionRow(row: MySqlRow): Option {
  const option = new Option();

  assignDefaulted(option, 'optionID', readOptionalString(row, 'optionID'));
  assignOptional(option, 'optionCode', readOptionalString(row, 'optionCode'));
  assignOptional(option, 'optionName', readOptionalString(row, 'optionName'));
  assignOptional(option, 'optionDescription', readOptionalString(row, 'optionDescription'));
  assignOptional(option, 'sortOrder', readOptionalNumber(row, 'sortOrder'));

  assignOptional(option, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(option, row);

  return option;
}

/**
 * Hydrates a `SwOptionGroup` row into an {@link OptionGroup}.
 *
 * Columns read: the seven persistent properties at `model/entity/OptionGroup.cfc:L51-L58`; the remote
 * identifier at `:L61`; and the four audit columns at `:L64-L67`.
 *
 * `imageGroupFlag` at `:L57` is the one non-optional field here, because the source declares
 * `default="0"` for it; it is written with {@link assignDefaulted}, so a NULL column leaves that
 * declared `false` in place rather than the mapper choosing a value. `sortOrder` at `:L58` carries
 * `required="true"` in the ORM mapping and is nonetheless mapped as nullable, because requiredness is
 * a constraint on writes and hydration must be able to represent whatever a row actually holds.
 *
 * Not read: the `options` collection at `:L70`, which is inverse — `model/entity/Option.cfc:L59` owns
 * the foreign key — so it is resolved from the option side.
 *
 * THIS MAPPER IS COMPLETE, NOT ABBREVIATED. `model/entity/OptionGroup.cfc` declares no non-persistent
 * property at all.
 *
 * @param row - One `SwOptionGroup` row.
 * @returns An option group carrying every persistent column the row supplied, with its options
 *   collection empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapOptionGroupRow(row: MySqlRow): OptionGroup {
  const optionGroup = new OptionGroup();

  assignDefaulted(optionGroup, 'optionGroupID', readOptionalString(row, 'optionGroupID'));
  assignOptional(optionGroup, 'optionGroupName', readOptionalString(row, 'optionGroupName'));
  assignOptional(optionGroup, 'optionGroupCode', readOptionalString(row, 'optionGroupCode'));
  assignOptional(optionGroup, 'optionGroupImage', readOptionalString(row, 'optionGroupImage'));
  assignOptional(
    optionGroup,
    'optionGroupDescription',
    readOptionalString(row, 'optionGroupDescription'),
  );
  assignDefaulted(optionGroup, 'imageGroupFlag', readOptionalBoolean(row, 'imageGroupFlag'));
  assignOptional(optionGroup, 'sortOrder', readOptionalNumber(row, 'sortOrder'));

  assignOptional(optionGroup, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(optionGroup, row);

  return optionGroup;
}

/* ===============================================================================================
 * THE PROJECTION MAPPERS — FLAT TWO-FIELD ROWS
 * ===============================================================================================
 * Four legacy members do not return entities. Each runs a narrow statement and then loops the result
 * building a two-key struct, and the ports declare the resulting shapes as their own row types. This
 * is where those renames live, because renaming a column to a field is the mapping this module owns.
 *
 * THE KEY NAMES ARE FIXED AND LOWERCASE, AND THE PAIRINGS MUST NOT BE SWAPPED. Both fields of every
 * one of these rows is a string, so a swap produces no compile error anywhere — and the ports record
 * exactly what it would produce downstream: the admin form-field tag keys on the literal strings
 * `name` and `value` and turns any other key into a data attribute, so a rename yields a drop-down
 * entry with an empty label and an empty submitted value, while a swap yields one whose visible labels
 * are opaque identifiers and whose submitted values are human-readable codes.
 *
 * THE FOUR SHAPES ARE KEPT SEPARATE ON PURPOSE. Three of them are structurally identical, and the
 * ports state plainly that collapsing or aliasing them is forbidden: the same `value` field carries a
 * SKU code in one, an option identifier in another and an option-group identifier in a third, so a
 * single shared type would let a row from one search be handed to a consumer expecting another with
 * nothing to catch it. Two names for two meanings encodes a behaviour-bearing difference; it is not
 * redundancy awaiting cleanup.
 *
 * WHY EACH READ TRIES TWO NAMES. The legacy statements select the physical columns and the CFML loop
 * that follows performs the rename, so both row shapes are faithful renderings of the same legacy
 * step: a repository whose statement text copies the legacy selection hands over the physical column
 * names, and one that aliases in the statement hands over the port's keys. The physical column is
 * tried first and the port key second. The two carry the same value, so the mapped row is identical
 * either way — this is boundary tolerance, not a second behaviour.
 *
 * The returned objects are plain frozen-by-type projections: the ports declare every member
 * `readonly` because a projection is a query result that nothing writes back. That is the exact
 * opposite of the entity collections above, which must stay live and mutable, and the two rules do
 * not conflict because they govern different things.
 * =============================================================================================== */

/**
 * Maps one row of the SKU search projection.
 *
 * `model/dao/SkuDAO.cfc:L132` selects the SKU identifier and the SKU code, and `:L141-L146` renames
 * them into the quoted lowercase keys `id` and `value`. Neither field name describes its content:
 * `id` carries the identifier and `value` carries the SKU CODE — a human-readable code, not an
 * identifier and not a price.
 *
 * @param row - One row of the SKU search projection.
 * @returns The projected row.
 * @throws {DomainError} When either column holds a value that is not a string.
 *
 * @example
 * ```ts
 * mapSkuSearchRow({ skuID: 'a'.repeat(32), skuCode: 'TESTPRODUCTXXX-1' });
 * // { id: 'aaaa…', value: 'TESTPRODUCTXXX-1' }
 * ```
 */
export function mapSkuSearchRow(row: MySqlRow): SkuSearchRow {
  return {
    id: readRequiredString(row, 'skuID', 'id'),
    value: readRequiredString(row, 'skuCode', 'value'),
  };
}

/**
 * Maps one row of the product search projection.
 *
 * `model/dao/ProductDAO.cfc:L421` selects the product identifier and the product name, and
 * `:L432-L433` renames them into `id` and `value`. As with the SKU projection, `value` is the
 * human-readable name rather than anything identifier-like.
 *
 * @param row - One row of the product search projection.
 * @returns The projected row.
 * @throws {DomainError} When either column holds a value that is not a string.
 */
export function mapProductSearchRow(row: MySqlRow): ProductSearchRow {
  return {
    id: readRequiredString(row, 'productID', 'id'),
    value: readRequiredString(row, 'productName', 'value'),
  };
}

/**
 * Maps one row of the unused-product-options projection.
 *
 * ⚠️ THE LABEL IS NOT BUILT HERE. `model/dao/OptionDAO.cfc:L88` composes `name` from the option
 * group's name and the option's name joined by a spaced hyphen, and in the port that composition
 * belongs to `MySqlOptionRepository.ts` — the data-access layer assembles it in the legacy source too,
 * which is why it stays there rather than moving up to the service. This mapper lifts the label the
 * repository has already produced and reads nothing else into it, so `name` has no physical column to
 * fall back to and is read under its projection key alone. `value` is the option's own identifier,
 * from the `optionID` column.
 *
 * @param row - One row of the unused-product-options projection, its label already composed.
 * @returns The projected row.
 * @throws {DomainError} When either key holds a value that is not a string.
 */
export function mapUnusedOptionRow(row: MySqlRow): UnusedOptionRow {
  return {
    name: readRequiredString(row, 'name'),
    value: readRequiredString(row, 'optionID', 'value'),
  };
}

/**
 * Maps one row of the unused-product-option-groups projection.
 *
 * `model/dao/OptionDAO.cfc:L113` builds this row from the group's name and the group's own identifier.
 * Note the contrast with its sibling one line of source earlier: `name` here is the PLAIN group name
 * with no composition of any kind, and `value` is a group identifier rather than an option identifier.
 * The two rows are shape-identical and semantically different, and
 * `model/entity/Product.cfc:L635-L640` and `:L642-L647` use the two members side by side on the same
 * product — which is exactly why they are not merged.
 *
 * @param row - One row of the unused-product-option-groups projection.
 * @returns The projected row.
 * @throws {DomainError} When either column holds a value that is not a string.
 */
export function mapUnusedOptionGroupRow(row: MySqlRow): UnusedOptionGroupRow {
  return {
    name: readRequiredString(row, 'optionGroupName', 'name'),
    value: readRequiredString(row, 'optionGroupID', 'value'),
  };
}
