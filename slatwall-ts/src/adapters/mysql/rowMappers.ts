/**
 * rowMappers — explicit, typed column-to-field hydration for the extracted Catalog slice.
 *
 * AAP §0.4.1.7 makes this file CREATE against the six in-scope entity files: "Explicit column-to-field
 * mapping replacing Hibernate hydration; 32-character string identifiers honoured (IR-6)". The legacy
 * system never wrote a mapper — Hibernate hydrated each entity from the CFC `property` metadata, so the
 * correspondence between a `Sw*` column and an entity field was implicit and unverifiable. Every mapping
 * decision the ORM used to absorb is made here instead, which makes this module the single place the
 * physical column vocabulary is spoken. `src/ports/repositories/SkuRepository.ts` and
 * `src/domain/base/AuditableEntity.ts` both defer to it by name.
 *
 * WHAT THIS MODULE DOES NOT DO, because each boundary is load-bearing:
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
 *
 *     THE SIX `*_ENTITY_METADATA` IMPORTS ARE NOT A REGISTRY, in case they read like one. Each is a
 *     frozen constant exported by the entity module that owns it, imported under its own name and
 *     referenced at exactly one call site — there is no map from an entity name to a declaration, no
 *     lookup, no default branch and nothing this file could be asked to register into. The entity is
 *     chosen by which function the caller called, exactly as it was before, and nothing here is
 *     mutated: {@link manageEntity} reads the declaration and never writes to it.
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
 * IMPORT DIRECTION. An adapter may reach `domain/`, `ports/`, `util/`, `errors/` and `mysql2`, and
 * nothing else. This module reaches only `domain/` and `errors/`; it needs no `mysql2` type either,
 * because {@link toRows} accepts `unknown` and narrows rather than restating the driver's result union.
 * Every import is relative and extensionless, because `tsconfig.json` declares no `baseUrl` and no
 * `paths` — an alias that type-checks under `tsc` can still fail to resolve under `esbuild`.
 *
 * THE FAILURE MODE THIS FILE IS BUILT TO PREVENT: a nullable column mapped to `null`, or to a
 * present-but-`undefined` property, instead of to an ABSENT property. It compiles, it reads naturally,
 * and it silently diverges from the convention the domain layer settled on — `src/domain/base/populate.ts`
 * implements CFML null semantics as `delete target[name]`, because `org/Hibachi/HibachiTransient.cfc`
 * sets a property to NULL by deleting its key. Nothing at the database boundary would catch the
 * difference. Every nullable column here therefore routes through {@link assignOptional}, which deletes
 * rather than assigns, and no line in this file ever assigns `undefined` or `null` to a field.
 *
 * @see `src/domain/base/populate.ts` for the sibling half of the same null convention.
 */

import { Brand, BRAND_ENTITY_METADATA } from '../../domain/product/Brand';
import { Option, OPTION_ENTITY_METADATA } from '../../domain/option/Option';
import { OptionGroup, OPTION_GROUP_ENTITY_METADATA } from '../../domain/option/OptionGroup';
import { Product, PRODUCT_ENTITY_METADATA } from '../../domain/product/Product';
import { ProductType, PRODUCT_TYPE_ENTITY_METADATA } from '../../domain/product/ProductType';
import { Sku, SKU_ENTITY_METADATA } from '../../domain/sku/Sku';
import { manageEntity } from '../../domain/base/populate';
import { parseExactDecimal } from '../../util/formatting';
import { DataIntegrityError, DomainError } from '../../errors/DomainError';

import type { AuditableEntity } from '../../domain/base/AuditableEntity';
import type { ExactDecimal } from '../../util/formatting';
import type { ManagedEntity } from '../../domain/base/populate';
import type { ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type {
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../ports/repositories/OptionRepository';
import type { ProductSearchRow } from '../../ports/repositories/ProductRepository';
import type { ProductTypeTreeRow } from '../../ports/repositories/ProductTypeRepository';
import type { SkuSearchRow } from '../../ports/repositories/SkuRepository';

/* ===============================================================================================
 * TODO(parity) the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] — THE LOGICAL VERSUS PHYSICAL NAME VOCABULARY
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
 * `optionID`, which is what `MySqlSkuRepository.ts` is to bind when it builds its existence sub-queries.
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
 * and not here; the finding takes no new register number, because it is already covered by the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] above.
 *
 * THE REGISTER BOUNDS ARE NOT STATED HERE. This file cites the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] above and mints nothing, and `src/ports/repositories/SkuRepository.ts`
 * is the single place that enumerates AAP §0.6.7's frozen D1-D21, AAP §0.6.6's frozen M1-M8 and every
 * entry the port minted beyond them. This note used to declare itself "THE AUTHORITATIVE REGISTER
 * BOUNDS" at a figure that had already moved on, which is precisely why a second copy is no longer
 * kept here.
 *
 * ONE ADJACENCY IS WORTH REPEATING, because it is a naming hazard rather than a bound: M5 is the
 * request-end implicit transaction demarcation and M6 is the validation read-back loop. The two are
 * adjacent, easy to transpose, and must not be swapped, because `src/adapters/mysql/UnitOfWork.ts` is
 * answerable for both and for different reasons.
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
 * Narrows a whole driver array to a list of rows, in place, without copying it.
 *
 * An ASSERTION function rather than a boolean predicate, and that is the entire point: it lets
 * {@link toRows} hand the driver's own array straight back once every element has been checked,
 * instead of building a second array whose only purpose was to carry the narrowed type. The old shape
 * allocated one array per result set — on a catalog-wide read, one array the size of the catalog —
 * purely so the compiler could see a type the elements already had.
 *
 * The indexed loop is kept rather than collapsed into `every`, because the diagnostics are part of
 * this port's contract: a malformed result names the exact position that failed and that entry's
 * runtime type, and `every` would report only that something, somewhere, was wrong.
 *
 * IT RAISES INSTEAD OF ANSWERING `false`. An assertion function's contract is "return or throw", and
 * that matches what the caller needs here: there is no recovery from a driver result that is not a
 * result set, and degrading to an empty array would silently report "no rows found" for a genuine
 * fault at the call site.
 *
 * @param candidate - An array the driver returned, not yet known to hold rows.
 * @throws {DomainError} When any element is not a row object. The failing index and that entry's
 *   runtime type travel on `context`.
 */
function assertRowList(candidate: readonly unknown[]): asserts candidate is MySqlRow[] {
  for (let index = 0; index < candidate.length; index += 1) {
    const element = candidate[index];

    if (!isMySqlRow(element)) {
      throw new DomainError(
        'The database driver returned a list whose entries are not all rows, so it cannot be read as a result set.',
        { context: { index, entryType: typeof element } },
      );
    }
  }
}

/**
 * Narrows a driver result to the rows it carries.
 *
 * This is the one place the driver's heterogeneous result shape is dealt with. `mysql2` types the first
 * element of an `execute()` result as a union covering row arrays, nested row arrays,
 * write-acknowledgement packets, result-set headers and procedure-call packets, and its row type carries
 * an index signature that widens every column to `any`. The parameter is therefore declared `unknown`: a
 * caller may hand over the driver value directly, no driver type is imported, and nothing downstream of
 * this function ever sees the union. The narrowing is performed by the two type predicates above, which
 * is why the body needs no cast and no assertion.
 *
 * A result that is not an array of row objects is a genuine programming fault at the call site — a write
 * statement routed into a read path, or a multi-statement result handed in whole — so it raises rather
 * than degrading to an empty array, which would silently report "no rows found".
 *
 * IT VALIDATES AND RETURNS THE SAME ARRAY, IT DOES NOT COPY ONE. See {@link assertRowList}: the
 * narrowing is an in-place assertion, so this function allocates nothing at all. Every result set in
 * the slice passes through here, so a copy here is a copy of every result set the service ever reads.
 *
 * @param result - The value a driver returned for a statement, unnarrowed.
 * @returns The driver's own array, in the order the driver produced it, once every element is known
 *   to be a row.
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

  /*
   * Validated IN PLACE and handed straight back. The driver's array is already exactly the list this
   * function's callers want, and every element has just been checked, so copying it would allocate a
   * second array of the same length for no reason other than to satisfy the compiler — once per
   * statement, and on a catalog-wide read that is a second copy of the catalog.
   *
   * No aliasing hazard is introduced, because the driver's array is not retained anywhere: both driver
   * call sites in this port (`./QueryRunner` and `./UnitOfWork`) destructure the result, pass it here
   * and keep no other reference to it, so the array this returns has exactly one owner.
   */
  assertRowList(result);

  return result;
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
 * ONE PASS AND ONE ALLOCATION, WHICH IS THE RESULT ITSELF. Paired with {@link toRows} — which now
 * validates the driver's array in place rather than copying it — a read costs exactly one array per
 * result set instead of two: the mapped domain values, which the caller asked for. There is nothing
 * further to remove here without refusing to return a collection.
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
 * THIS IS THE MOST IMPORTANT FUNCTION IN THE MODULE, AND THE REASON IS A SPECIFIC LEGACY CALL
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
    const alternateValue = readOptionalString(row, alternateColumnName);
    if (alternateValue !== undefined) {
      return alternateValue;
    }
  }

  /*
   * ⚠️ F17 — NEITHER ALIAS IS PRESENT, SO THIS RAISES. An earlier revision returned `''` here, and
   * that substitution is the finding: every caller of this function is building an IDENTIFIER or a
   * human-readable LABEL for a projection row — `id`/`value` for the SKU and product search rows,
   * `name`/`value` for the two unused-option rows — and not one of those has a meaningful empty
   * value. A blank id cannot be selected, fetched or round-tripped, and a blank label renders as an
   * empty entry in a picker.
   *
   * WHAT THE EMPTY STRING ACTUALLY HID. This branch is reached only when the column is ABSENT from
   * the row or holds NULL. Absent means the SQL projection and this mapper have DRIFTED — a renamed
   * alias, a dropped column, a query edited without its mapper. That is a defect in the adapter
   * pair, and returning `''` converted it into plausible-looking data that flowed all the way to a
   * response body. The failure would then surface far from its cause, as a mysteriously blank row.
   *
   * A PRESENT-BUT-EMPTY COLUMN IS STILL NOT AN ERROR, and that distinction is deliberate: the first
   * branch above returns whatever `readOptionalString` yields, including `''`. Only absence and NULL
   * raise. So this check tightens the ADAPTER CONTRACT without inventing a non-empty constraint on
   * the data that the legacy schema does not impose — validation of column CONTENT belongs to
   * `../../validation/**`, not here.
   *
   * `DataIntegrityError` rather than a bare `DomainError`, so the fault classifies as
   * service-attributable and sanitises to a 500 through `../../handlers/httpResponse.ts`. A caller
   * cannot correct an alias mismatch, so reporting it as a 4xx would be a lie.
   */
  throw new DataIntegrityError(
    alternateColumnName === undefined
      ? `Column "${columnName}" is required by this projection but the row supplies no value.`
      : `Neither column "${columnName}" nor its alias "${alternateColumnName}" is present in the row, ` +
          `so this projection cannot be mapped.`,
    {
      context:
        alternateColumnName === undefined ? { columnName } : { columnName, alternateColumnName },
    },
  );
}

/**
 * Reads a numeric column.
 *
 * A NUMERIC STRING IS ACCEPTED, AND IT HAS TO BE. `ormtype="big_decimal"` — the type of
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
    /*
     * ⚠️ F16 — DEFENCE IN DEPTH. An earlier revision returned `Number(value)` unchecked, which
     * silently rounds any magnitude beyond 2^53. This reader serves the INTEGER columns
     * (`sortOrder`, `calculatedQATS`; `ormtype="integer"`), whose declared range fits a double
     * comfortably — so the guard should never fire. It is written anyway because the cost is one
     * comparison and the alternative is an undetectable off-by-a-few in a quantity. Monetary
     * columns do NOT come through here at all; see {@link readOptionalExactDecimal}.
     */
    const converted = Number(value);
    if (BigInt(converted) === value) {
      return converted;
    }
    throw integrityError(
      `Column "${columnName}" holds the integer ${value.toString()}, which cannot be represented ` +
        `exactly as a JavaScript number.`,
      { columnName, exactValue: value.toString() },
    );
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
 * FOUR REPRESENTATIONS ARE ACCEPTED BECAUSE MySQL AND ITS DRIVER PRODUCE FOUR. `ormtype="boolean"`
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
 * Builds the row-integrity fault raised when a column's VALUE cannot be carried without loss, or when
 * a column the projection promised is missing.
 *
 * Distinct from {@link columnTypeError} on purpose. That helper reports a runtime TYPE that does not
 * match the field — a wiring mistake in the mapper. This one reports a value that is the right type
 * and still cannot be represented, or a projection that did not deliver. Both are service faults, but
 * only this one classifies as `DataIntegrityError`, which is what makes it sanitise to a 500 with the
 * service-data code rather than the generic fault code.
 *
 * @param message - The internal diagnostic. Never reaches a response body; the public presentation is
 *   supplied by `DataIntegrityError.getPublicError()`.
 * @param context - Structured diagnostic fields, kept server-side.
 * @returns The error to throw.
 */
function integrityError(message: string, context: Record<string, unknown>): DataIntegrityError {
  return new DataIntegrityError(message, { context });
}

/**
 * Reads an EXACT-DECIMAL (`ormtype="big_decimal"`) column, keeping its digits as digits.
 *
 * ⚠️⚠️ F16 — WHY THIS EXISTS SEPARATELY FROM {@link readOptionalNumber}. The catalog's monetary
 * columns are declared `big_decimal`: `listPrice`, `price` and `renewalPrice` at
 * [model/entity/Sku.cfc:L55-L57], and `calculatedSalePrice` at [model/entity/Product.cfc:L62].
 * Hibernate mapped those to Java `BigDecimal` — exact, arbitrary precision. An IEEE-754 double is
 * neither. Routing them through the general numeric reader converted a `BigDecimal` to a double with
 * NO CHECK, so a value the double cannot represent was silently replaced by the nearest one it can.
 * A price that changes in the fourth digit produces no error, no warning and no failing test; it
 * produces a wrong number in a feed, an invoice or a comparison.
 *
 * ⭐ F07 — WHY THE DOMAIN FIELD IS NO LONGER A NUMBER, AND WHAT THIS FUNCTION USED TO DO INSTEAD.
 * An earlier revision returned a `number` and defended that choice at length: it argued that because
 * arithmetic and ORDER COMPARISON are performed on these fields — the feed's sale-price gate at
 * [integrationServices/google/views/feed/product.cfm:L28] is a strict greater-than against a value from
 * `../../ports/PricingPort`, whose shape AAP §0.2.2.7 forbids this slice to redefine — a decimal field
 * type "would only move the conversion somewhere less visible". So it kept the double and REFUSED to
 * produce one when the round trip proved lossy.
 *
 * That reasoning was half right, and the half it got wrong mattered more. Refusing an unrepresentable
 * value did protect the READ path. But the WRITE path performed the very conversion this function
 * refused to accept, so the two disagreed: a legacy-valid price could be written lossily and then
 * rejected on the way back. The comparison argument was also weaker than it looked, because an exact
 * decimal can be ordered EXACTLY without any arithmetic — which is what
 * `../../util/formatting`'s `compareExactDecimal` does, digit-wise.
 *
 * So the field type changed, and this function now returns {@link ExactDecimal}: the stored digits, at
 * the stored scale, carried unconverted to the bind site and back. Exactly ONE lossy projection remains
 * in the whole port, at the single point where an out-of-scope port types its value `number`, and it is
 * named `exactDecimalToNumber` so it cannot happen without saying so.
 *
 * ⚠️ THE ROUND-TRIP LOSSLESSNESS TEST IS GONE, BECAUSE IT NO LONGER HAS ANYTHING TO TEST. It existed to
 * decide whether a double could stand in for the stored value. Nothing stands in for the stored value
 * now, so `'12345678901234567890.12'` — which that test correctly rejected, and which the legacy system
 * stored and read back without complaint — is simply read. Removing a refusal the legacy never performed
 * also removes a divergence: AAP §0.6.7 governs with *"preserve and annotate, do not repair"*, and
 * §0.6.7.7 makes D18 the SOLE declared behaviour-hardening exception.
 *
 * ⚠️ WHAT IS KEPT: WELL-FORMEDNESS, AND THE DRIVER-NUMBER REFUSAL. Malformed text still raises, because
 * it means the column is not the type this mapper was told it is. And a JavaScript `number` is still
 * refused outright: with the pool configured as `../../config/database.ts` specifies —
 * `decimalNumbers: false`, `supportBigNumbers` and `bigNumberStrings` both true — a `big_decimal` column
 * ALWAYS arrives as an exact string. If one arrives as a number then the driver has already done the
 * lossy conversion and the exact digits are gone beyond recovery. That refusal is not a hardening of
 * legacy behaviour; it is a regression detector for this port's own configuration, and it turns a silent
 * misconfiguration into a loud, classified fault.
 *
 * @param row - The row being read.
 * @param columnName - The column or projection alias to read.
 * @returns The exact value as decimal text, or `undefined` when the column is absent or NULL.
 * @throws {DataIntegrityError} When the text is not a well-formed decimal, or when the driver delivered
 *   a pre-converted number.
 */
function readOptionalExactDecimal(row: MySqlRow, columnName: string): ExactDecimal | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'bigint') {
    const decimalText = typeof value === 'bigint' ? value.toString() : value.trim();
    const exact = parseExactDecimal(decimalText);
    if (exact === undefined) {
      throw integrityError(
        `Column "${columnName}" holds ${JSON.stringify(decimalText)}, which is not a well-formed ` +
          `exact-decimal value.`,
        { columnName },
      );
    }
    return exact;
  }

  if (typeof value === 'number') {
    throw integrityError(
      `Column "${columnName}" is an exact-decimal column but the driver delivered a JavaScript ` +
        `number, so its exact digits have already been lost. Check that the pool keeps ` +
        `decimalNumbers disabled, as ../../config/database.ts requires.`,
      { columnName, deliveredValue: value },
    );
  }

  throw columnTypeError(columnName, 'an exact-decimal string', value);
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
 * TWO OF THE FOUR ARE COLUMN-TO-FIELD RENAMES, AND THIS IS THE ONLY PLACE THAT KNOWS IT. The
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
 * THE ENTITY MAPPERS — FIVE RULES THAT APPLY TO ALL SEVEN
 * ===============================================================================================
 *
 * RULE 1 — PLAIN FIELD WRITES, NEVER A SETTER. No accessor PAIR exists anywhere in `domain/`: the
 * entities are plain public fields, because `src/domain/base/populate.ts` clears a property with
 * `delete` and *"you cannot `delete` an accessor-backed value"*. So each mapper constructs the entity
 * and writes its fields directly. The one apparent exception is not one: nothing here calls
 * `setOptionGroup`, `addSku` or any other bidirectional helper, because nothing here hydrates an
 * association at all — see RULE 3.
 *
 *   RULE 5 DOES NOT WEAKEN THIS. The seven members `manageEntity` attaches are framework
 *   INTROSPECTION members, not property accessors: there is no `set*` among them, none of them is
 *   defined with `get`/`set` syntax, and each is an ordinary own value property holding a function.
 *   So every field this file writes stays a plain writable, deletable data property, and
 *   {@link assignOptional}'s `delete` keeps working on exactly the same terms it did before.
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
 * decision now."* The decision is that a row mapper hydrates scalar columns only: it resolves no
 * association to a LOADED entity, issues no second statement, and every collection keeps the empty
 * array its own class initialised.
 *
 * THREE OF THE SEVEN OPTIONAL MANY-TO-ONE FIELDS ARE LEFT ENTIRELY UNRESOLVED — this module writes
 * nothing to them whatsoever: `ProductType.parentProductType`, `Sku.subscriptionTerm` and
 * `Option.optionGroup`. The other four carry an IDENTIFIER-ONLY REFERENCE, under the bounded RULE 3a
 * below. Which four, and why exactly those four, is the whole of the sub-rule.
 *
 *   WHAT "UNRESOLVED" LOOKS LIKE AT RUNTIME IS NOW UNIFORM ACROSS THE DOMAIN LAYER, and the
 *   uniformity is deliberate rather than incidental. Every association field on every in-scope entity
 *   is declared with `declare` — `src/domain/product/Product.ts` (`brand` at `:L976`, `productType`
 *   at `:L990`, `defaultSku` at `:L1010`), `src/domain/sku/Sku.ts` (`product` at `:L1023`,
 *   `subscriptionTerm` at `:L1033`), `src/domain/option/Option.ts` (`optionGroup` at `:L737`) and
 *   `src/domain/product/ProductType.ts` (`parentProductType` at `:L677`) — which emits no field
 *   definition, so a
 *   FRESH INSTANCE DOES NOT CARRY THE KEY AT ALL and an unresolved association is genuinely absent.
 *   That is what makes the invariant this module states an invariant rather than an aspiration: a
 *   mapped entity's association keys are absent, full stop, with no per-entity exception a consumer
 *   would have to know about. (`src/domain/product/Brand.ts` and `src/domain/option/OptionGroup.ts`
 *   need no such declaration because neither declares a many-to-one at all.)
 *
 *   SCALAR COLUMN FIELDS ARE A DIFFERENT AND GENUINELY NON-UNIFORM STORY, measured rather than
 *   assumed. Under `useDefineForClassFields` — on by default at the ES2022 target this subtree
 *   compiles to — an optional field declared WITHOUT `declare` is emitted as a real field definition,
 *   so it is PRESENT holding `undefined` on a fresh instance, whereas one declared WITH `declare`
 *   emits nothing and is ABSENT. The six in-scope entities do not agree with each other on which form
 *   they use for scalars, and a fresh-instance probe of all six reports the split exactly:
 *
 *     `Product`, `Sku`, `Brand`            every optional scalar uses `declare`  -> ABSENT
 *     `Option`, `ProductType`, `OptionGroup`  optional scalars are ordinary       -> PRESENT/undefined
 *
 *   Primary keys are present in all six, holding the `''` their own initialiser assigned, and every
 *   collection is present holding its own fresh array. The divergence is confined to OPTIONAL SCALARS.
 *
 *   THAT TABLE DESCRIBES A FRESH INSTANCE, AND THIS MODULE ERASES IT. Every column a mapper reads goes
 *   through {@link assignOptional}, which DELETES on absence, so a MAPPED entity is uniformly absent on
 *   both sides of the split: `'optionName' in mapOptionRow({optionID})` is `false` even though
 *   `'optionName' in new Option()` is `true`. The divergence therefore survives only on an unmapped
 *   instance, and only for fields no mapper touches. It is recorded here rather than "corrected"
 *   because changing a domain field's declaration form to tidy the table would be a behaviour change
 *   no finding asked for, and because the output of this module is already uniform without it.
 *
 *   SO {@link assignOptional} MUST DELETE RATHER THAN MERELY SKIP THE WRITE, and the table above is
 *   precisely why. For a column this module maps on `Option`, `ProductType` or `OptionGroup`, "skip the
 *   assignment when the value is NULL" would leave the class-defined `undefined` sitting on the field,
 *   so a NULL column would yield a present-but-undefined key there while the same NULL column on
 *   `Product`, `Sku` or `Brand` yielded an absent one — two different shapes for one concept, varying
 *   by entity, which is exactly the silent divergence a downstream `exactOptionalPropertyTypes`
 *   consumer is entitled to assume cannot happen. Deleting is what collapses the two cases into one,
 *   which is why the helper is written the way it is, why it is the single mechanism every nullable
 *   column routes through, and why it must not be simplified into a conditional assignment.
 *
 *   Why not populate a stub carrying just the foreign key, in imitation of a lazy proxy? Because a
 *   stub CAN answer non-identifier reads with class defaults instead of failing. `Sku.generateImageFileName`
 *   reads `option.getOptionGroup().getImageGroupFlag()` at `model/entity/Sku.cfc:L134`, and against a
 *   stub that read would quietly return the declared `false` — a wrong answer with no error anywhere,
 *   which is precisely the silent-failure class this module exists to eliminate. That objection is
 *   sound, and it is what BOUNDS rule 3a rather than what forbids it: a reference is admitted only
 *   where it provably cannot answer a non-identifier read with a plausible-looking value.
 *
 * RULE 3a — FOUR FOREIGN KEYS CARRY AN IDENTIFIER-ONLY REFERENCE, AND THE BOUND IS "A REFERENCE MAY
 * NOT LIE".
 *
 *   THE TWO OBLIGATIONS THAT FORCE IT. Neither is a preference, and both were latent defects before
 *   this rule existed.
 *
 *     (i) THE GOOGLE FEED'S SIXTEEN FIELDS TRAVERSE THE GRAPH, AND THE LEGACY JOIN-FETCHED IT.
 *         `integrationServices/google/controllers/feed.cfc:L64-L66` registers three related-property
 *         joins — `SlatwallSku` -> `product`, `SlatwallProduct` -> `defaultSku` and
 *         `SlatwallProduct` -> `brand` — for no purpose other than letting
 *         `integrationServices/google/views/feed/product.cfm` dereference those associations
 *         unguarded at `:L18`, `:L19`, `:L21`, `:L27` and `:L32`. Hibernate therefore delivered a
 *         POPULATED graph to that view. `SmartListQueryBuilder.execute` hands its rows to a mapper
 *         and then DISCARDS them, so the escape hatch the paragraph above relies on — *"the
 *         repository holds the same row and reads the `*ID` column itself"* — does not exist for a
 *         smart-list consumer: after mapping, the foreign key is simply gone and nothing downstream
 *         can recover it. Without rule 3a the feed's first field requirement raises for EVERY record.
 *
 *    (ii) THE THREE PERSISTERS READ THESE EXACT FIELDS BACK, SO DROPPING THEM WAS DATA LOSS.
 *         `MySqlSkuRepository.persistSku` writes `sku.product?.productID ?? null`, and
 *         `MySqlProductRepository.saveProduct` writes `product.brand?.brandID ?? null`,
 *         `product.productType?.productTypeID ?? null` and the default SKU's identifier through the
 *         injected reader. Hydrating a row and writing it back therefore NULLED all four foreign
 *         keys — silently, with no error and no failing type. Rule 3a closes that round trip.
 *
 *   THE FOUR, AND WHY EACH CANNOT LIE. Three of them are entity references carrying ONLY the primary
 *   key, and the fourth is not an entity at all:
 *
 *     `Sku.product`         -> {@link productReference}      identifier-only `Product`
 *     `Product.productType` -> {@link productTypeReference}  identifier-only `ProductType`
 *     `Product.brand`       -> {@link brandReference}        identifier-only `Brand`
 *     `Product.defaultSku`  -> {@link defaultSkuReference}   a RAISING nine-member delegate
 *
 *     Measured, not assumed: across `Product`, `ProductType` and `Brand` the ONLY field this module
 *     ever writes with {@link assignDefaulted} is the primary key. Every other scalar goes through
 *     {@link assignOptional}, and every one of those three classes declares its optional scalars in a
 *     form that leaves them ABSENT on a fresh instance. So every non-identifier read of one of these
 *     three references yields `undefined` — the same answer an absent field gives — and never a
 *     plausible-looking default. There is no `false`-shaped lie available for them to tell.
 *
 *     `Sku` IS DIFFERENT, WHICH IS EXACTLY WHY `defaultSku` IS NOT A `Sku`. `model/entity/Sku.cfc:L52-L57`
 *     declares defaults for `activeFlag`, `listPrice`, `price`, `renewalPrice` and
 *     `userDefinedPriceFlag`, so an identifier-only `Sku` would report a price of ZERO — and
 *     `Product.getPrice` falls back to the default SKU's price for the feed's `g:price` field, so that
 *     zero would advertise every product in a merchant feed as free. Nothing about it would fail. The
 *     field is typed against the nine-member delegate rather than against `Sku` anyway, so the
 *     reference is a delegate whose every member RAISES until it is replaced. A surviving reference
 *     there is a loud failure by construction.
 *
 *   AND `ProductType.parentProductType` IS STILL DELIBERATELY NOT IN THE LIST — BUT ITS ROUND TRIP IS
 *   NO LONGER LEFT OPEN. It is closed by RULE 3b below instead, and the reason it needed a different
 *   mechanism from the other four is worth stating precisely, because the two halves of the problem
 *   pull in opposite directions:
 *
 *     THE ROUND-TRIP HALF. BOTH product-type write paths serialize the association the same way —
 *     `MySqlProductTypeRepository.saveProductType` through its `collectWritableValues`, and
 *     `MySqlProductPersistence.saveProductType` through its `collectProductTypeValues`. Each read
 *     `parentProductType?.productTypeID ?? null`, so a product type READ through this module and then
 *     written back stored `NULL` in `parentProductTypeID` and was detached from its parent — the same
 *     silent data loss obligation (ii) describes for the other four keys. Both sites are named because
 *     the gap is auditable from either one, and naming only the first would leave the second looking
 *     clean.
 *
 *     THE LYING HALF, WHICH IS WHY A REFERENCE CANNOT BE THE ANSWER HERE.
 *     `ProductType.getSimpleRepresentation` walks the parent chain and returns `undefined` as soon as
 *     ANY link's name is absent. An identifier-only parent carries no `productTypeName`, so attaching
 *     one would turn the feed's `g:product_type` from `Child` into an EMPTY element — a reference that
 *     lies, which is the one thing rule 3a forbids. Nor can the parent's name simply be fetched here:
 *     the legacy statement at `model/dao/ProductTypeDAO.cfc:L52-L62` is a bare
 *     `SELECT *, (…count…), (…count…) FROM SlatwallProductType`, so adding a join for the parent's name
 *     would be work the legacy read never performs, which G4 forbids.
 *
 *   SO THE TWO HALVES ARE SEPARATED RATHER THAN TRADED OFF: the raw foreign key is preserved for the
 *   WRITE paths WITHOUT populating the association the READ paths render from. Rule 3b is that
 *   mechanism. `Option.optionGroup` stays out for the original reason: `OptionGroup` declares a
 *   defaulted scalar, so a reference could answer `getImageGroupFlag()` with the class default, which is
 *   the very example above — and it has no write-path round trip to close, because no persister in this
 *   folder serializes it.
 *
 * RULE 3b — THE PRODUCT-TYPE PARENT FOREIGN KEY IS PRESERVED BESIDE THE ENTITY, NOT INSIDE IT.
 *
 *   `mapProductTypeRow` reads `parentProductTypeID` and records it against the instance it just
 *   produced, in {@link readHydratedParentProductTypeID}'s backing table. The association slot is left
 *   exactly as it was — ABSENT — so every read path behaves identically to before this rule existed and
 *   no rendered field changes. The write paths then resolve the column as
 *   `association ?? preserved ?? null`, which is what closes the round trip.
 *
 *   THE VALUE IS NOT STORED ON THE ENTITY, and that is a requirement rather than a preference.
 *   `model/entity/ProductType.cfc:L52-L88` declares twenty-five properties and `parentProductTypeID` is
 *   not among them — it is the `fkcolumn` of the many-to-one at `:L62`, a physical column name, not a
 *   property. Adding a twenty-sixth field would put a value in the domain surface that the legacy
 *   entity has no accessor for, widen `ProductTypePropertyName`, and hand `../../validation/Validator`
 *   and `../../domain/base/populate` a property to reason about that no legacy rule mentions. S9
 *   forbids exactly that.
 *
 *   ⚠️ THE BACKING TABLE IS A `WeakMap` KEYED BY THE ENTITY OBJECT, AND THAT IS THE ONLY FORM OF
 *   MODULE-SCOPE STATE THIS RULE PERMITS. S8/M7 forbid a module-scope CACHE because a warm Lambda
 *   container survives between invocations and a value-keyed table would let one request observe
 *   another's rows. An object-keyed weak table cannot: its keys ARE the per-invocation entity
 *   instances, a later invocation constructs different objects and can therefore reach no entry, and
 *   every entry becomes unreachable and collectable the moment its entity does. It holds no rows, it is
 *   never enumerated, and nothing can look a value up without already holding the exact instance the
 *   value describes. It is provenance attached to one object's lifetime, not a cache.
 *
 *   ⚠️ AN EXPLICIT DETACH MUST CALL {@link forgetHydratedParentProductTypeID}. Once the association is
 *   absent the entity cannot distinguish "never resolved" from "deliberately cleared" — both are a
 *   missing own key, because `ProductType.removeParentProductType` ports
 *   `structDelete(variables, "parentProductType")` as `delete this.parentProductType`. The write
 *   fallback therefore treats absence as "never resolved", which is the correct reading for every path
 *   that exists in this slice, and a caller that genuinely means to null the column says so by
 *   forgetting the preserved value first. That member is exported and tested for exactly this purpose;
 *   without it, preserving the key would trade one silent wrong answer for another.
 *
 *   ⛔ A REFERENCE IS NOT A LOADED ENTITY AND MUST NOT BE TREATED AS ONE. Rule 3's guarantee still
 *   holds for every field a reference does not carry: it is genuinely absent. A consumer that needs a
 *   LOADED association resolves it — `createCatalogAggregateLoaders` in `./QueryRunner` does
 *   exactly that, batching one statement per related entity and raising a `DataIntegrityError` when a
 *   reference cannot be resolved, so no reference reaches the serializer.
 *
 *   ⚠️ THIS PARAGRAPH NAMED A CLASS THAT NO LONGER EXISTS. It cited
 *   `ProductFeedRelationshipAssembler` in `src/integrations/google/ProductFeedQuery.ts` as the
 *   resolving consumer. That class was withdrawn — the feed assembled relationships a second time
 *   over records `SmartListQueryBuilder` already projects, and its removal record stands at
 *   `src/integrations/google/ProductFeedQuery.ts:L392` with the capability's new home at `:L413`. The
 *   mechanism this rule depends on is unchanged and the guarantee still holds; only the address moved,
 *   and a `{@link}` to a withdrawn symbol resolves to nothing while still reading as a live example.
 *
 * RULE 4 — COLLECTIONS ARE LEFT LIVE. Nothing here freezes, copies, spreads or slices a collection,
 * and no entity collection field is typed read-only. `model/entity/Option.cfc:L95`, `:L102` and
 * `:L104` mutate the array they are given in place, so the domain contract is that the array is the
 * live one; a defensive copy here would break option mutation three layers up with no error anywhere.
 * The empty array is also the state the legacy suite pins: `meta/tests/unit/entity/BrandTest.cfc`
 * overrides `defaults_are_correct` to assert `getProducts()` equals `[]`.
 *
 * RULE 5 — EVERY ENTITY MAPPER RETURNS A MANAGED ENTITY, NEVER A BARE INSTANCE. Each of the six
 * entity mappers routes construction through {@link manageEntity} from `src/domain/base/populate.ts`
 * with that entity's own frozen declaration — `PRODUCT_ENTITY_METADATA`, `SKU_ENTITY_METADATA`,
 * `PRODUCT_TYPE_ENTITY_METADATA`, `BRAND_ENTITY_METADATA`, `OPTION_ENTITY_METADATA` and
 * `OPTION_GROUP_ENTITY_METADATA` — and is typed `ManagedEntity<X>` rather than `X`.
 *
 *   WHY IT HAS TO HAPPEN HERE. In CFML these members were INHERITED, so no entity could exist
 *   without them: `getClassName` at `org/Hibachi/HibachiObject.cfc:L135-L137`, `hasProperty` at
 *   `org/Hibachi/HibachiTransient.cfc:L763-L765`, `getPropertyMetaData` at `:L738-L747`,
 *   `getValueByPropertyIdentifier` at `:L466-L481`, `getEntityName` at
 *   `org/Hibachi/HibachiEntity.cfc:L287-L289`, `getPrimaryIDValue` at `:L244-L246` and
 *   `getPrimaryIDPropertyName` at `:L249-L251` were all in place from the instant Hibernate hydrated
 *   a row. Three collaborators in this subtree read them: `src/validation/Validator.ts` needs
 *   `getClassName` and `hasProperty` (and at `HibachiValidationService.cfc:L171` a rule whose property
 *   `hasProperty` denies is SILENTLY SKIPPED, so a missing member does not fail loudly — it disables
 *   validation), `src/ports/UniquePropertyPort.ts` needs the five accessors
 *   `HibachiDAO.cfc:L134-L138` reads in that order, and `src/services/BaseService.ts` needs
 *   `getPrimaryIDValue`. A repository is one of only two doors an entity enters this system through —
 *   the other being the IR-1 `new*` members in `src/services/**` — so attaching the surface here is
 *   what makes "every entity has it" true rather than aspirational. It is not a convenience: a
 *   hydrated row handed to `BaseService.save` without it would reach `getClassName()` and throw
 *   `TypeError: entity.getClassName is not a function`.
 *
 *   IT IS NOT A WRAPPER, AND THAT MATTERS TO THIS FILE SPECIFICALLY. {@link manageEntity} uses
 *   `Object.assign`, so it returns THE SAME OBJECT it was handed, with own function properties added.
 *   No proxy, no decorator, no second instance, no copy. `instanceof Product` still holds, reference
 *   identity is preserved, and every subsequent `assignOptional`/`assignDefaulted`/
 *   {@link assignAuditColumns} call in the mapper body writes to the very object that will be
 *   returned — which is why construction is wrapped at the TOP of each mapper rather than the result
 *   being wrapped at the bottom, and why the field-write lines below needed no change at all. A
 *   repository may hand the returned reference to `UnitOfWork.ts` and identity comparisons still work.
 *
 *   THE PROJECTION MAPPERS DELIBERATELY DO NOT GET IT. {@link mapSkuSearchRow},
 *   {@link mapProductSearchRow}, {@link mapUnusedOptionRow} and {@link mapUnusedOptionGroupRow}
 *   return `{name, value}`-shaped projections, not entities: nothing validates them, nothing saves
 *   them, no unique rule reads them, and they have no primary-key property to answer with. Giving
 *   them an introspection surface would be inventing a capability the legacy projections never had.
 *   {@link mapProductTypeTreeRow} is the boundary case and it DOES carry the surface, because it
 *   delegates to {@link mapProductTypeRow} and then adds two computed columns to the same object —
 *   it is a product type with extra fields, not a projection.
 *
 *   WHAT THIS FILE STILL DOES NOT DO. It does not validate, does not evaluate a rule, does not read a
 *   resource-bundle key and does not import from `src/validation/**` — the introspection surface
 *   answers *"does this entity declare that property, and what does it hold"*, which was a different
 *   section of the same legacy component from rule evaluation, split at
 *   `org/Hibachi/HibachiTransient.cfc:L462`. The import direction stated in the file header is
 *   therefore unchanged: `domain/` and `errors/` only.
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
 *     time, and upper-cases the acronym one outright. No excluded name therefore appears in this module in
 *     its exact declared spelling, and this sentence is careful not to spell one. Where such a
 *     name matches case-insensitively, the match is the persisted column and never the excluded
 *     derived member.
 *
 * ATTRIBUTE COVERAGE, SO AN UNHANDLED ATTRIBUTE IS DISTINGUISHABLE FROM AN ABSENT ONE. In scope:
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

/* ================================================================================================
 * RULE 3a — THE FOUR FOREIGN-KEY REFERENCES
 * ================================================================================================
 * Every factory below mints an association slot value carrying NOTHING BUT the identifier the row's
 * foreign-key column supplied. The module header states the two obligations that force them and the
 * "a reference may not lie" bound that limits them to these four; this section is the mechanism.
 *
 * ⚠️ EACH IS A REAL INSTANCE OF ITS OWN CLASS, WITH THE RULE 5 SURFACE ATTACHED. A plain object
 * literal would type-check for the three entity references and then fail the moment anything called
 * `getClassName()` or `getPrimaryIDValue()` on it, which `src/validation/Validator.ts`,
 * `src/ports/UniquePropertyPort.ts` and `src/services/BaseService.ts` all do. Construction therefore
 * goes through {@link manageEntity} with the same frozen declaration the corresponding mapper uses,
 * so a reference is indistinguishable in KIND from a hydrated entity and differs only in CONTENT.
 *
 * ⚠️ THE IDENTIFIER IS WRITTEN DIRECTLY RATHER THAN THROUGH {@link assignDefaulted}, because there is
 * no column read to guard: the caller has already narrowed the value to a present string. Writing the
 * field directly is also what RULE 1 requires — no accessor pair exists in `domain/`.
 * ============================================================================================== */

/**
 * A `Product` reference carrying only `productID` — the resolved form of the `productID` foreign key
 * at `model/entity/Sku.cfc:L65`.
 *
 * @param productID - The foreign-key value, already narrowed to a present string.
 * @returns A managed product whose ONLY populated field is its primary key. Every other read yields
 *   `undefined`; every collection is its own fresh empty array.
 */
export function productReference(productID: string): ManagedEntity<Product> {
  const product = manageEntity(new Product(), PRODUCT_ENTITY_METADATA);
  product.productID = productID;
  return product;
}

/**
 * A `ProductType` reference carrying only `productTypeID` — the resolved form of the `productTypeID`
 * foreign key at `model/entity/Product.cfc:L69`.
 *
 * @param productTypeID - The foreign-key value, already narrowed to a present string.
 * @returns A managed product type whose ONLY populated field is its primary key. Its own
 *   `parentProductType` is left absent, so `getSimpleRepresentation()` reports `undefined` rather
 *   than walking into a second reference.
 */
export function productTypeReference(productTypeID: string): ManagedEntity<ProductType> {
  const productType = manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA);
  productType.productTypeID = productTypeID;
  return productType;
}

/**
 * A `Brand` reference carrying only `brandID` — the resolved form of the `brandID` foreign key at
 * `model/entity/Product.cfc:L68`.
 *
 * @param brandID - The foreign-key value, already narrowed to a present string.
 * @returns A managed brand whose ONLY populated field is its primary key.
 */
export function brandReference(brandID: string): ManagedEntity<Brand> {
  const brand = manageEntity(new Brand(), BRAND_ENTITY_METADATA);
  brand.brandID = brandID;
  return brand;
}

/* ================================================================================================
 * RULE 3b — THE PRESERVED PRODUCT-TYPE PARENT FOREIGN KEY
 * ================================================================================================
 * The full rationale is in the RULE 3b section of the module header: the association slot must stay
 * absent so no read path renders from a parent that carries no name, while the write paths still need
 * the key so a read-modify-save does not detach the child. These three members are that separation.
 * ============================================================================================== */

/**
 * The provenance table behind rule 3b: for each product type hydrated from a row, the
 * `parentProductTypeID` that row carried.
 *
 * ⚠️ WEAK AND OBJECT-KEYED, WHICH IS WHAT MAKES IT LEGAL UNDER S8/M7. It is not a cache: no value can
 * be reached without already holding the exact instance it describes, a later invocation on a warm
 * container constructs different instances and so can reach nothing, and each entry dies with its
 * entity. The header states the full argument, including why a value-keyed table would be a
 * cross-request leak and this is not.
 *
 * `object` rather than `ProductType` as the key type so a `ManagedEntity<ProductType>` — an
 * intersection, not a `ProductType` — is accepted without a cast at either end.
 */
const hydratedParentProductTypeIds = new WeakMap<object, string>();

/**
 * Records the `parentProductTypeID` a row supplied for a product type, without touching the
 * association slot.
 *
 * Called by {@link mapProductTypeRow} only. Kept private to this module because recording provenance
 * is a hydration act: a caller that invented a value here would be asserting a row it never read.
 *
 * @param productType - The instance just hydrated from the row.
 * @param parentProductTypeID - The row's foreign-key value, already narrowed to a present string.
 */
function recordHydratedParentProductTypeID(productType: object, parentProductTypeID: string): void {
  hydratedParentProductTypeIds.set(productType, parentProductTypeID);
}

/**
 * The `parentProductTypeID` this product type was hydrated with, if it was hydrated from a row at all.
 *
 * THE WRITE PATHS' FALLBACK, AND ONLY EVER A FALLBACK. Both persisters resolve the column as
 * `productType.parentProductType?.productTypeID ?? readHydratedParentProductTypeID(productType) ?? null`,
 * so a resolved association always wins and this value is consulted only where the previous code would
 * have written `NULL` over a parent it had simply never loaded.
 *
 * @param productType - Any product type. A freshly constructed one, or one this module never mapped,
 *   yields `undefined` — there is nothing to preserve for it, and `NULL` is then the correct column
 *   value because the entity is a genuine root.
 * @returns The preserved identifier, or `undefined` when none was recorded or it has been forgotten.
 */
export function readHydratedParentProductTypeID(productType: object): string | undefined {
  return hydratedParentProductTypeIds.get(productType);
}

/**
 * Discards the preserved `parentProductTypeID`, so a subsequent write stores `NULL` and the detach is
 * durable.
 *
 * ⚠️ THIS IS THE DECLARED WAY TO DETACH A HYDRATED CHILD, and it exists because the entity cannot
 * express the difference on its own. `ProductType.removeParentProductType` ports
 * `structDelete(variables, "parentProductType")` as `delete this.parentProductType`, so after a detach
 * the association is ABSENT — indistinguishable from an association that was never resolved. The write
 * fallback reads absence as "never resolved", which is right for every path in this slice; a caller
 * that means `NULL` says so here. Calling it on a product type with nothing recorded is a no-op.
 *
 * @param productType - The product type whose preserved parent key should be dropped.
 */
export function forgetHydratedParentProductTypeID(productType: object): void {
  hydratedParentProductTypeIds.delete(productType);
}

/* ================================================================================================
 * RULE 3c — A HYDRATED SKU'S PRESERVED SUBSCRIPTION-TERM KEY AND ITS OWNED-LINK LOAD STATE
 * ================================================================================================
 * ⭐ THE DEFECT THIS CLOSES (finding F7). {@link mapSkuRow} produces a SKU carrying no
 * `subscriptionTerm` association and four EMPTY owned link collections, and
 * `MySqlSkuRepository.persistSku` then writes `subscriptionTerm?.subscriptionTermID ?? null` and
 * DELETE-replaces all four link tables whenever the SKU row pre-existed. Put together, ANY save of a
 * database-loaded SKU nulled its subscription term and deleted every one of its `SwSkuOption`,
 * `SwSkuAccessContent`, `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit` rows. Three in-scope service
 * members reach that write on an existing SKU — `processProductAddOptionGroup`,
 * `processProductAddOption` (both through `processProductUpdateDefaultImageFileNames`) and
 * `processProductUpdateSkus` — so an ordinary catalog edit destroyed relationships it never mentioned,
 * and answered successfully.
 *
 * ⭐ WHAT THE LEGACY DID INSTEAD, WHICH IS THE BEHAVIOUR BEING RESTORED. Hibernate hydrated a SKU with
 * LAZY collections and a LAZY many-to-one. A collection the request never touched was never loaded, and
 * the flush therefore emitted NO statement for its link table — the rows simply stayed. A many-to-one
 * that was never dereferenced kept its foreign key, because the column value came from the row, not from
 * a resolved object. So "untouched means unchanged" was free, and reproducing it in a port with no
 * session means saying it explicitly. That is what these two mechanisms do.
 *
 * ⚠️ WHY BOTH LIVE BESIDE THE ENTITY RATHER THAN INSIDE IT, exactly as RULE 3b's parent key does. A
 * `subscriptionTermLoaded` flag or a `loadedCollections` set on `Sku` would be a field the legacy entity
 * does not declare, visible to `populate()`, to validation and to every read path — and
 * `src/domain/sku/Sku.ts` is a port of `model/entity/Sku.cfc`, whose surface is fixed. Provenance is a
 * fact about a HYDRATION, not a property of a SKU, so it is recorded where hydration happens.
 *
 * ⚠️ WEAK AND OBJECT-KEYED, WHICH IS WHAT MAKES BOTH LEGAL UNDER S8/M7 — the same argument RULE 3b
 * makes at length. Neither table is a cache: no entry is reachable without already holding the exact
 * instance it describes, a later invocation on a warm container constructs different instances and can
 * therefore reach nothing, and each entry dies with its entity.
 *
 * ⚠️ AND ABSENCE MEANS AUTHORITATIVE, NOT UNKNOWN. A SKU this module never mapped — every SKU the
 * combination engine mints in `src/services/SkuService.ts`, and every hand-built one in a test — has no
 * entry in either table, and its collections and associations are taken at face value. That is required
 * rather than convenient: `createSkus` builds a SKU whose empty collections ARE the intended state, and
 * a design that treated "no provenance" as "unknown" would refuse to write it.
 * ============================================================================================== */

/**
 * The four collections `model/entity/Sku.cfc` declares as OWNED many-to-many link tables, named by the
 * entity's own property names at `:L76` through `:L79`.
 *
 * Owned is the operative word: these are the four whose link rows `MySqlSkuRepository.persistSku`
 * writes, so they are exactly the four whose load state that member has to consult. The six INVERSE
 * collections at `:L81-L86` are owned by their far side and are never written from a SKU, so they carry
 * no load state and appear nowhere in this table.
 */
export const SKU_OWNED_LINK_COLLECTIONS = Object.freeze([
  'options',
  'accessContents',
  'subscriptionBenefits',
  'renewalSubscriptionBenefits',
] as const);

/** One of the four owned link collection names of {@link SKU_OWNED_LINK_COLLECTIONS}. */
export type SkuOwnedLinkCollection = (typeof SKU_OWNED_LINK_COLLECTIONS)[number];

/**
 * For each SKU hydrated from a row, the subset of its owned link collections that has since been LOADED.
 *
 * A SKU present in this table with an empty set is one hydrated from a row whose link tables were not
 * read — the state {@link mapSkuRow} leaves it in. A SKU ABSENT from the table was never hydrated here at
 * all, which is the authoritative case the section header describes.
 */
const hydratedSkuLoadedOwnedLinks = new WeakMap<object, Set<SkuOwnedLinkCollection>>();

/** For each SKU hydrated from a row, the `subscriptionTermID` that row carried. */
const hydratedSkuSubscriptionTermIds = new WeakMap<object, string>();

/**
 * Records that a SKU came from a row, with none of its owned link collections loaded yet.
 *
 * Called by {@link mapSkuRow} only, and unconditionally — including for a row whose link tables happen
 * to hold nothing, because "no rows" and "not read" are different facts and only the reader knows which
 * one it established.
 *
 * @param sku - the instance just hydrated from the row.
 */
function recordHydratedSkuOwnedLinks(sku: object): void {
  hydratedSkuLoadedOwnedLinks.set(sku, new Set<SkuOwnedLinkCollection>());
}

/**
 * Declares that one owned link collection of a hydrated SKU now holds what the database holds.
 *
 * Called by every loader that reads a SKU's link table — `attachSkuOptions` and
 * `attachFetchedSkuAssociations` in `./SmartListQueryBuilder`, and the product aggregate loader through
 * them. After this call the collection is authoritative and `persistSku` replaces its rows exactly as it
 * always did, which is what keeps removal working: emptying a LOADED collection and saving clears it.
 *
 * ⚠️ A NO-OP FOR A SKU WITH NO PROVENANCE, deliberately. Such a SKU is already authoritative, so there
 * is no state to promote and nothing to record; making it an error would force every constructor of a
 * transient SKU to know about this table.
 *
 * @param sku - a SKU, hydrated or not.
 * @param collection - the collection whose rows were just read.
 */
export function markSkuOwnedLinkLoaded(sku: object, collection: SkuOwnedLinkCollection): void {
  hydratedSkuLoadedOwnedLinks.get(sku)?.add(collection);
}

/**
 * Whether a SKU's owned link collection may be taken as the complete intended contents.
 *
 * THE PERSISTENCE DECISION, AND THE ONLY QUESTION `persistSku` ASKS. `true` means the collection is
 * either on an entity this module never hydrated, or on one whose rows for that collection were read —
 * in both cases what the entity holds is what the database should hold. `false` means the rows were
 * never read, so the in-memory collection describes nothing and must not be written over them.
 *
 * @param sku - a SKU, hydrated or not.
 * @param collection - the collection being written.
 * @returns `true` when the collection may be replaced; `false` when its stored rows must be preserved.
 */
export function isSkuOwnedLinkAuthoritative(
  sku: object,
  collection: SkuOwnedLinkCollection,
): boolean {
  const loaded = hydratedSkuLoadedOwnedLinks.get(sku);
  return loaded === undefined || loaded.has(collection);
}

/**
 * The `subscriptionTermID` this SKU was hydrated with, if it was hydrated from a row at all.
 *
 * THE WRITE PATH'S FALLBACK, AND ONLY EVER A FALLBACK — the same shape as
 * {@link readHydratedParentProductTypeID}. `persistSku` resolves the column as
 * `sku.subscriptionTerm?.subscriptionTermID ?? readHydratedSkuSubscriptionTermID(sku) ?? null`, so a
 * resolved association always wins and this value is consulted only where the previous code wrote `NULL`
 * over a term it had simply never loaded.
 *
 * The association is left ABSENT rather than filled with an identifier-only reference because
 * `SubscriptionTerm` is out of scope (AAP §0.2.2.1) and has no domain module to construct: the port
 * models the slot as an out-of-scope reference, and inventing one here would put an object with no
 * behaviour where a read path expects a term.
 *
 * @param sku - any SKU. One never mapped here yields `undefined`, and `NULL` is then the correct column
 *   value because the entity genuinely carries no term.
 * @returns the preserved identifier, or `undefined` when none was recorded or it has been forgotten.
 */
export function readHydratedSkuSubscriptionTermID(sku: object): string | undefined {
  return hydratedSkuSubscriptionTermIds.get(sku);
}

/**
 * Discards the preserved `subscriptionTermID`, so a subsequent write stores `NULL` and the detach is
 * durable.
 *
 * THE DECLARED WAY TO DETACH A HYDRATED SKU'S TERM, for the same reason
 * {@link forgetHydratedParentProductTypeID} exists: after a detach the association slot is ABSENT, which
 * is indistinguishable from one that was never resolved, and the write fallback reads absence as "never
 * resolved". A caller that means `NULL` says so here. A no-op when nothing was recorded.
 *
 * @param sku - the SKU whose preserved term key should be dropped.
 */
export function forgetHydratedSkuSubscriptionTermID(sku: object): void {
  hydratedSkuSubscriptionTermIds.delete(sku);
}

/**
 * A `defaultSku` slot value that also reports the identifier the delegate interface hides.
 *
 * `ProductDefaultSkuDelegate` declares nine price, currency and image reads and DELIBERATELY no
 * identifier accessor — `src/domain/sku/Sku.ts` records why, and supplies
 * {@link DefaultSkuIdReader} as the injected read for that reason. A reference has to carry the
 * identifier somehow, so it is carried as an own `skuID` property: exactly the shape a
 * `(defaultSku: object) => string` reader was designed to consume, and readable here through
 * {@link readProductDefaultSkuId} without a cast.
 */
export interface IdentifiedProductDefaultSku extends ProductDefaultSkuDelegate {
  readonly skuID: string;
}

/**
 * Raises for a member of an UNRESOLVED default-SKU reference.
 *
 * One helper rather than nine bodies, so the message is stated once and every member fails
 * identically. The member name is reported so a log reader learns WHICH read escaped the assembler,
 * and the identifier is reported so the row is findable.
 */
function refuseUnresolvedDefaultSku(skuID: string, member: string): never {
  throw new DomainError(
    "A product's default SKU was read before the reference to it had been resolved, so no value " +
      'could be produced for it.',
    { context: { skuID, member } },
  );
}

/**
 * A `defaultSku` reference carrying only `skuID` — the resolved form of the `defaultSkuID` foreign
 * key at `model/entity/Product.cfc:L70`.
 *
 * ⛔ EVERY ONE OF THE NINE MEMBERS RAISES, AND THAT IS THE POINT. An identifier-only `Sku` would
 * report `price` as the `0` that `model/entity/Sku.cfc:L55` declares as its default, and
 * `Product.getPrice` falls back to the default SKU's price — so the Google feed's `g:price` would
 * advertise a free product with nothing failing anywhere. Raising converts that silent wrong answer
 * into a diagnosable one. The reference is replaced by the aggregate-loader resolution
 * `createCatalogAggregateLoaders` in `./QueryRunner` performs, before any consumer reads it.
 * (This sentence previously pointed at `ProductFeedRelationshipAssembler`, which was withdrawn; see
 * the rule 3a account above.)
 *
 * @param skuID - The foreign-key value, already narrowed to a present string.
 * @returns A frozen delegate reporting the identifier and refusing every value read.
 */
export function defaultSkuReference(skuID: string): IdentifiedProductDefaultSku {
  return Object.freeze({
    skuID,
    getCurrencyCode: (): never => refuseUnresolvedDefaultSku(skuID, 'getCurrencyCode'),
    getPrice: (): never => refuseUnresolvedDefaultSku(skuID, 'getPrice'),
    getRenewalPrice: (): never => refuseUnresolvedDefaultSku(skuID, 'getRenewalPrice'),
    getListPrice: (): never => refuseUnresolvedDefaultSku(skuID, 'getListPrice'),
    getImageDirectory: (): never => refuseUnresolvedDefaultSku(skuID, 'getImageDirectory'),
    getImagePath: (): never => refuseUnresolvedDefaultSku(skuID, 'getImagePath'),
    getImage: (): never => refuseUnresolvedDefaultSku(skuID, 'getImage'),
    getResizedImagePath: (): never => refuseUnresolvedDefaultSku(skuID, 'getResizedImagePath'),
    getImageExistsFlag: (): never => refuseUnresolvedDefaultSku(skuID, 'getImageExistsFlag'),
  });
}

/*
 * ⛔ `resolvedProductDefaultSku` WAS REMOVED FROM THIS MODULE, AND THE CAPABILITY IS INJECTED INSTEAD.
 * A companion to {@link defaultSkuReference} once stood here: given a LOADED `Sku` it returned a
 * delegate whose three price members forwarded and whose other six RAISED. It had no caller anywhere in
 * `src/` or `test/` — inside this module or outside it — and it could not have acquired one honestly,
 * because the six it could not answer are the whole difficulty. `Sku.getCurrencyCode` needs a
 * `SettingResolverPort`, and the five image members are ASYNCHRONOUS on `Sku` and take an `ImagePathPort`,
 * while the delegate declares them synchronous and argument-free.
 *
 * ✅ `./QueryRunner.ts` ALREADY OWNS THIS ADAPTATION AND DECLARES IT AS A DEPENDENCY, for exactly
 * that reason: `CatalogAggregateDependencies.bindDefaultSkuDelegate` is `(sku: Sku) => ProductDefaultSkuDelegate`,
 * and its own note says assembling one "needs the setting, pricing and image ports, none of which belong
 * to this layer, so it arrives as the function it is". That is the same judgement, made one layer up where
 * the ports are reachable. A second, half-capable copy here would be a competing mechanism for a question
 * the folder has already answered, and the raising members would surface as runtime failures rather than
 * as the declared boundary they are.
 *
 * The reference factory above stays because it serves rule 3a: it keeps a foreign key ALIVE through
 * hydration without pretending to resolve anything, and every one of its value reads refuses.
 */

/**
 * Reads the identifier off a `defaultSku` slot value, whether it is a reference or a resolved wrapper.
 *
 * THE CANONICAL READ FOR THE `DefaultSkuIdReader` SEAM. `src/domain/sku/Sku.ts` declares that seam as
 * `(defaultSku: object) => string` precisely because the delegate interface exposes no identifier, and
 * `MySqlProductRepository.saveProduct` and `MySqlProductPersistence.saveProduct` consume it when writing
 * the `defaultSkuID` column. Both
 * factories above populate an own `skuID` property, so this function serves both.
 *
 * The `in` test is what keeps this module free of assertions: it narrows the argument to one carrying
 * an `unknown` `skuID`, which the `typeof` test then narrows to `string`. No cast, no non-null
 * operator and no `any` appears here (S1).
 *
 * @param defaultSku - A `defaultSku` slot value.
 * @returns The identifier, or `undefined` when the value carries none — which is the state of a
 *   delegate assembled by some other collaborator, not an error this module can adjudicate.
 */
export function readProductDefaultSkuId(defaultSku: object): string | undefined {
  if ('skuID' in defaultSku) {
    const candidate: unknown = defaultSku.skuID;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
  }
  return undefined;
}

/**
 * Hydrates a `SwProduct` row into a {@link Product}.
 *
 * Columns read, in declaration order: the eight persistent properties at
 * `model/entity/Product.cfc:L51-L58`; the four persisted calculated columns at `:L62-L65`; the remote
 * identifier at `:L93`; and the four audit columns at `:L96-L99` via {@link assignAuditColumns}.
 *
 * ALSO READ, AS RULE 3a IDENTIFIER-ONLY REFERENCES: the three many-to-one foreign keys at `:L68-L70`
 * — `brandID`, `productTypeID` and `defaultSkuID`. Each becomes a reference carrying nothing but the
 * identifier, and each is OMITTED ENTIRELY when its column is absent or NULL, so an unassociated
 * product still reports a genuinely absent field rather than one present holding `undefined`.
 *
 * Not read, and deliberately so: every collection at `:L73-L89`, per RULE 3 above; and the twenty
 * non-persistent properties at `:L102-L123`, which have no column, per AAP 0.2.2.6.
 *
 * @param row - One `SwProduct` row.
 * @returns A MANAGED product (RULE 5) carrying every persistent column the row supplied, its three
 *   many-to-one fields holding RULE 3a references where the row carried the foreign key, and its
 *   collections empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 * @throws {DataIntegrityError} When an exact-decimal column holds a value a JavaScript number
 *   cannot carry without loss, or the driver delivered it pre-converted (F16).
 *
 * @example
 * ```ts
 * const product = mapProductRow({ productID: 'a'.repeat(32), productName: 'Test Product' });
 * product.productName; // 'Test Product'
 * 'urlTitle' in product; // false — the column was absent, so the field is too
 * 'brand' in product; // false — the foreign key was absent, so no reference was attached
 * ```
 */
export function mapProductRow(row: MySqlRow): ManagedEntity<Product> {
  const product = manageEntity(new Product(), PRODUCT_ENTITY_METADATA);

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
  /*
   * ⚠️ F16 — `calculatedSalePrice` is `ormtype="big_decimal"` at [model/entity/Product.cfc:L62], the
   * same exact type as the three Sku monetary columns and carrying the same loss if converted
   * unchecked. It is read through the exact reader for that reason; the finding named the Sku three,
   * but the defect is the ormtype, not the entity, so fixing only the named three would have left the
   * identical bug one file away. It stays `assignOptional` because it declares no legacy default.
   */
  assignOptional(
    product,
    'calculatedSalePrice',
    readOptionalExactDecimal(row, 'calculatedSalePrice'),
  );
  assignOptional(product, 'calculatedQATS', readOptionalNumber(row, 'calculatedQATS'));
  assignOptional(
    product,
    'calculatedAllowBackorderFlag',
    readOptionalBoolean(row, 'calculatedAllowBackorderFlag'),
  );
  assignOptional(product, 'calculatedTitle', readOptionalString(row, 'calculatedTitle'));

  assignOptional(product, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(product, row);

  /* RULE 3a — the three many-to-one foreign keys at [model/entity/Product.cfc:L68-L70], each read as
   * an identifier and attached as a reference. `assignOptional` is not used: these are not scalar
   * fields, so the presence test is written out and the field is simply left untouched — and therefore
   * absent, since all three are declared with `declare` — when the column supplies nothing. */
  const brandID = readOptionalString(row, 'brandID');
  if (brandID !== undefined) {
    product.brand = brandReference(brandID);
  }

  const productTypeID = readOptionalString(row, 'productTypeID');
  if (productTypeID !== undefined) {
    product.productType = productTypeReference(productTypeID);
  }

  const defaultSkuID = readOptionalString(row, 'defaultSkuID');
  if (defaultSkuID !== undefined) {
    product.defaultSku = defaultSkuReference(defaultSkuID);
  }

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
 * ALSO READ, AS A RULE 3a IDENTIFIER-ONLY REFERENCE: the `productID` foreign key at `:L63`. It becomes
 * a `Product` reference carrying nothing but that identifier, and the field is left ABSENT when the
 * column is absent or NULL. This is what `MySqlSkuRepository.persistSku` reads back when it writes the
 * `productID` column, and what the Google feed's assembler resolves into a loaded product.
 *
 * ALSO READ, AS A RULE 3c PRESERVED FOREIGN KEY: the `subscriptionTermID` foreign key at `:L64`. Its
 * related component is out of scope (AAP §0.2.2.1), so the ASSOCIATION SLOT IS STILL LEFT ABSENT — no
 * read path gains a term object — while the key itself is recorded beside the instance for the write
 * path. Before that, `MySqlSkuRepository.persistSku` wrote `NULL` into this column on every save of a
 * loaded SKU, silently detaching the term (finding F7).
 *
 * ALSO RECORDED, AS RULE 3c LOAD STATE: that NONE of the four OWNED link collections at `:L76-L79` has
 * been read. They are left empty and live exactly as before, but `persistSku` can now tell "empty
 * because nothing is linked" from "empty because nobody looked", and preserves the stored rows in the
 * second case instead of deleting them.
 *
 * Not read: the five collections at `:L67-L71` and the six INVERSE many-to-many collections at
 * `:L81-L86`, which are owned by their far side and are never written from a SKU. The four owned
 * collections' CONTENTS are likewise not read here — `options` lives in the `SwSkuOption` link table and
 * is resolved by `./SmartListQueryBuilder`'s loaders and by `MySqlSkuRepository.ts`. The twenty-three
 * non-persistent properties at `:L99-L121` have no column.
 *
 * Note that the return type is also what `SkuRow` denotes: the SKU port declares `SkuRow` as an alias
 * of the entity precisely so that no second description of the physical row exists to drift from this
 * one.
 *
 * @param row - One `SwSku` row.
 * @returns A MANAGED SKU (RULE 5) carrying every persistent column the row supplied, its `product`
 *   field holding a RULE 3a reference where the row carried the foreign key, its four owned link
 *   collections empty, live and marked NOT LOADED (RULE 3c), and its `subscriptionTermID` preserved
 *   beside it where the row carried one.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 * @throws {DataIntegrityError} When an exact-decimal column holds a value a JavaScript number
 *   cannot carry without loss, or the driver delivered it pre-converted (F16).
 */
export function mapSkuRow(row: MySqlRow): ManagedEntity<Sku> {
  const sku = manageEntity(new Sku(), SKU_ENTITY_METADATA);

  assignDefaulted(sku, 'skuID', readOptionalString(row, 'skuID'));
  assignDefaulted(sku, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(sku, 'skuCode', readOptionalString(row, 'skuCode'));
  /*
   * ⚠️ F16 — the three `ormtype="big_decimal"` columns of [model/entity/Sku.cfc:L55-L57] are read
   * through {@link readOptionalExactDecimal}, NOT the general numeric reader, so a value the double
   * cannot carry raises instead of being silently replaced by the nearest one. Their legacy
   * `default="0"` is what `assignDefaulted` supplies when the column is absent or NULL.
   */
  assignDefaulted(sku, 'listPrice', readOptionalExactDecimal(row, 'listPrice'));
  assignDefaulted(sku, 'price', readOptionalExactDecimal(row, 'price'));
  assignDefaulted(sku, 'renewalPrice', readOptionalExactDecimal(row, 'renewalPrice'));
  assignOptional(sku, 'imageFile', readOptionalString(row, 'imageFile'));
  assignDefaulted(sku, 'userDefinedPriceFlag', readOptionalBoolean(row, 'userDefinedPriceFlag'));

  assignOptional(sku, 'calculatedQATS', readOptionalNumber(row, 'calculatedQATS'));

  assignOptional(sku, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(sku, row);

  /* RULE 3a — the `productID` foreign key at [model/entity/Sku.cfc:L63]. `setProduct` is deliberately
   * NOT called: the legacy many-to-one population branch assigned through the framework's own property
   * writer rather than through the hand-written bidirectional helper, so the product's own `skus`
   * collection was NOT updated by a hydration pass either. */
  const productID = readOptionalString(row, 'productID');
  if (productID !== undefined) {
    sku.product = productReference(productID);
  }

  /* RULE 3c — the subscription-term foreign key at [model/entity/Sku.cfc:L64]. Recorded BESIDE the
   * instance, never attached: `SubscriptionTerm` is out of scope (AAP §0.2.2.1) and the slot stays absent,
   * so every read path sees exactly what it saw before while the write path stops nulling the column. */
  const subscriptionTermID = readOptionalString(row, 'subscriptionTermID');
  if (subscriptionTermID !== undefined) {
    hydratedSkuSubscriptionTermIds.set(sku, subscriptionTermID);
  }

  /* RULE 3c — and none of the four owned link collections has been read. Recorded UNCONDITIONALLY,
   * including when the tables hold nothing, because "no rows" and "not read" are different facts and this
   * mapper established neither. `persistSku` consults it before replacing any link table. */
  recordHydratedSkuOwnedLinks(sku);

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
 * Not assigned: the three collections at `:L65-L67` and the eight inverse many-to-many collections at
 * `:L70-L77`. They are left empty and live.
 *
 * ⭐ THE PARENT ASSOCIATION IS STILL LEFT ABSENT, BUT ITS FOREIGN KEY IS NOW PRESERVED (RULE 3b). The
 * `parentProductTypeID` column at `:L62` is read and recorded against this instance for the write
 * paths, while the `parentProductType` slot itself is untouched — so every READ path sees exactly what
 * it saw before, including `ProductType.getSimpleRepresentation`, and no rendered field changes. The
 * header's RULE 3b states why the two have to be separated: attaching an identifier-only parent would
 * empty the feed's `g:product_type`, and writing `NULL` over an unloaded parent detached the child.
 * All three seeded rows carry a null parent, so nothing is recorded for them and absence remains the
 * ordinary state for a root. The absence is genuine either way: `parentProductType` is declared with
 * `declare`, so a mapped product type carries no such own key at all, per RULE 3.
 *
 * @param row - One `SwProductType` row.
 * @returns A MANAGED product type (RULE 5) carrying every persistent column the row supplied, with its
 *   parent association unresolved, its parent foreign key preserved beside it, and its collections
 *   empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapProductTypeRow(row: MySqlRow): ManagedEntity<ProductType> {
  const productType = manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA);

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

  /* RULE 3b — the self-referencing foreign key at [model/entity/ProductType.cfc:L62]. Recorded BESIDE
   * the entity rather than assigned into `parentProductType`, because the association is what read
   * paths render from and an identifier-only parent would empty `getSimpleRepresentation`. A null
   * column records nothing, which is the ordinary state for a root. */
  const parentProductTypeID = readOptionalString(row, 'parentProductTypeID');
  if (parentProductTypeID !== undefined) {
    recordHydratedParentProductTypeID(productType, parentProductTypeID);
  }

  return productType;
}

/**
 * Hydrates one row of the product-type tree projection into a {@link ProductTypeTreeRow}.
 *
 * The legacy query at `model/dao/ProductTypeDAO.cfc:L52-L62` projects every column of the product-type
 * table — hence the full column set, delegated to {@link mapProductTypeRow} rather than duplicated —
 * plus two correlated count sub-selects, ordered by product-type name.
 *
 * `isAssigned` IS A COUNT, NOT A FLAG. It is `count(...)` over the products of this product type,
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
 * THE RETURN TYPE IS DELIBERATELY WIDER THAN THE PORT'S. `ProductTypeRepository.findAllForTree`
 * promises `ProductTypeTreeRow[]`, and `ManagedEntity<ProductTypeTreeRow>` is assignable to that, so
 * the port contract is satisfied without the port having to change. Declaring the narrower type here
 * would be worse than redundant: the object genuinely carries the RULE 5 surface at run time, and a
 * return type that hides a capability the value really has is the same class of silent divergence
 * between the static and runtime shapes that this module exists to eliminate. The port stays narrow
 * because nothing validates or saves a tree row — it is a read-only projection for the admin tree —
 * and widening it would advertise a capability its consumers have no reason to want.
 *
 * @param row - One row of the product-type tree projection.
 * @returns A MANAGED product type (RULE 5) carrying its two derived counts, and the SAME object
 *   {@link mapProductTypeRow} produced rather than a copy of it.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field, or
 *   when either count is missing or not numeric.
 */
export function mapProductTypeTreeRow(row: MySqlRow): ManagedEntity<ProductTypeTreeRow> {
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
 * ⚠️⚠️ F05 — THE HYDRATED BRAND IS A FULLY MANAGED ENTITY, AND THAT IS ENFORCED BY THE COMPILER, NOT
 * BY THIS COMMENT. The finding reported that `new Brand()` lacked the framework-inherited members
 * `../../services/BaseService.ts` and `../../validation/Validator.ts` require, so a hydrated brand
 * could not legally be handed to the save path — a gap type bivariance had hidden rather than
 * surfaced.
 *
 * It is closed at the SOURCE of the gap rather than papered over here. `Brand` now declares
 * `implements AuditableEntity, ManagedEntity` and implements all seven members the legacy entity
 * inherited: `getClassName` [org/Hibachi/HibachiObject.cfc:L135], `getEntityName`
 * [org/Hibachi/HibachiEntity.cfc:L287], `getPrimaryIDPropertyName` [:L249], `getPrimaryIDValue`
 * [:L244], `hasProperty` [org/Hibachi/HibachiTransient.cfc:L763], `getPropertyMetaData` [:L738] and
 * `getValueByPropertyIdentifier` [:L466].
 *
 * SO THIS MAPPER NEEDS NO ADAPTER, NO WRAPPER AND NO CAST — and deliberately has none. Constructing a
 * separate "managed facade" around the entity was one option the finding offered; it was rejected
 * because it would have left the domain object itself still unable to satisfy its own contract, and
 * every other producer of a `Brand` would have needed the same wrapper. Because the guarantee lives
 * in the `implements` clause, deleting one of those members is a compile error in `Brand.ts` rather
 * than a runtime failure discovered here.
 *
 * @param row - One `SwBrand` row.
 * @returns A MANAGED brand (RULE 5) carrying every persistent column the row supplied, with its
 *   collections empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapBrandRow(row: MySqlRow): ManagedEntity<Brand> {
  const brand = manageEntity(new Brand(), BRAND_ENTITY_METADATA);

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
 * `:L66`, whose rows live in the `SwSkuOption` link table. The unresolved group is genuinely absent
 * rather than present holding `undefined`: `optionGroup` is declared with `declare`, per RULE 3 in the
 * module header. The domain declares neither the image association at `:L60` nor the image collection
 * at `:L63` nor the four promotion collections at `:L67-L70`, all of which reach out-of-scope
 * entities, so no column of theirs is read either.
 *
 * THIS MAPPER IS COMPLETE, NOT ABBREVIATED. `model/entity/Option.cfc` declares no non-persistent
 * property at all.
 *
 * THAT IS NOT CONTRADICTED BY `OPTION_ENTITY_METADATA` CARRYING SIX `declaredNonFieldProperties`, and
 * the distinction is worth stating because the two look alike from a distance. Those six —
 * `defaultImage` [model/entity/Option.cfc:L60], `images` [:L63], `promotionRewards` [:L67],
 * `promotionRewardExclusions` [:L68], `promotionQualifiers` [:L69] and `promotionQualifierExclusions`
 * [:L70] — are PERSISTENT associations that reach explicitly out-of-scope domains (AAP 0.2.2.1), so
 * `src/domain/option/Option.ts` models no field for them; they are listed in the declaration purely so
 * `hasProperty` keeps answering `true` the way the legacy `getPropertiesStruct()` did. Option is the
 * one in-scope entity whose declared property set is wider than its field set, and neither set has
 * anything to do with `persistent="false"`. Nothing here maps them: they have no column on `SwOption`
 * in the first place, being collections and a many-to-one.
 *
 * @param row - One `SwOption` row.
 * @returns A MANAGED option (RULE 5) carrying every persistent column the row supplied, with its
 *   group unresolved and its SKU collection empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapOptionRow(row: MySqlRow): ManagedEntity<Option> {
  const option = manageEntity(new Option(), OPTION_ENTITY_METADATA);

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
 * @returns A MANAGED option group (RULE 5) carrying every persistent column the row supplied, with
 *   its options collection empty and live.
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapOptionGroupRow(row: MySqlRow): ManagedEntity<OptionGroup> {
  const optionGroup = manageEntity(new OptionGroup(), OPTION_GROUP_ENTITY_METADATA);

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
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 *   which means the SQL projection and this mapper have drifted (F17).
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
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 *   which means the SQL projection and this mapper have drifted (F17).
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
 * THE LABEL IS NOT BUILT HERE. `model/dao/OptionDAO.cfc:L88` composes `name` from the option
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
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 *   which means the SQL projection and this mapper have drifted (F17).
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
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 *   which means the SQL projection and this mapper have drifted (F17).
 */
export function mapUnusedOptionGroupRow(row: MySqlRow): UnusedOptionGroupRow {
  return {
    name: readRequiredString(row, 'optionGroupName', 'name'),
    value: readRequiredString(row, 'optionGroupID', 'value'),
  };
}
