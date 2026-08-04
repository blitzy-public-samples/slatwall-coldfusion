/*
 * MySqlBrandRepository — the MySQL implementation of the brand persistence surface.
 *
 * There is no legacy file this was translated from, and that is the point (ir-1). Every sibling in
 * this folder has a legacy counterpart on disk; this file has none. A repository-wide filename search
 * for a brand data-access component returns zero hits in any casing, and `model/dao/` contains
 * twenty-five components, none of them a brand one. The consuming service corroborates the absence from
 * the other side: `model/service/BrandService.cfc` declares exactly one property, `dataService` at
 * `:L51`, so there was never a brand data-access injection for a generated accessor to reach.
 *
 * So where did `brandService.newBrand()`, `brandService.getBrand(id)` and
 * `brandService.deleteBrand(entity)` come from? They were fabricated at call time.
 */

import { manageEntity } from '../../domain/base/populate';
import type { ManagedEntity } from '../../domain/base/populate';
import { BRAND_ENTITY_METADATA, Brand } from '../../domain/product/Brand';
import { DataIntegrityError } from '../../errors/DomainError';
import type { BrandRepository } from '../../ports/repositories/BrandRepository';
import { createSlatwallUUID } from '../../util/uuid';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../domain/base/AuditableEntity';
import type { AccountContextPort } from '../../ports/AccountContextPort';
import type { SqlExecutor } from './QueryRunner';
import { assertColumnName, assertTableName } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import { mapBrandRow } from './rowMappers';

const BRAND_TABLE = assertTableName('SwBrand');

const BRAND_COLUMN = Object.freeze({
  brandID: assertColumnName(BRAND_TABLE, 'brandID'),
  activeFlag: assertColumnName(BRAND_TABLE, 'activeFlag'),
  publishedFlag: assertColumnName(BRAND_TABLE, 'publishedFlag'),
  urlTitle: assertColumnName(BRAND_TABLE, 'urlTitle'),
  brandName: assertColumnName(BRAND_TABLE, 'brandName'),
  brandWebsite: assertColumnName(BRAND_TABLE, 'brandWebsite'),
  remoteID: assertColumnName(BRAND_TABLE, 'remoteID'),
  createdDateTime: assertColumnName(BRAND_TABLE, 'createdDateTime'),
  createdByAccountID: assertColumnName(BRAND_TABLE, 'createdByAccountID'),
  modifiedDateTime: assertColumnName(BRAND_TABLE, 'modifiedDateTime'),
  modifiedByAccountID: assertColumnName(BRAND_TABLE, 'modifiedByAccountID'),
});

/**
 * The columns the write path assigns, in `model/entity/Brand.cfc` declaration order — which is also the
 * bind order (TR-4). The primary key is deliberately absent: the insert names it first and the update
 * matches on it, so it is handled separately at both call sites.
 */
const BRAND_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  BRAND_COLUMN.activeFlag,
  BRAND_COLUMN.publishedFlag,
  BRAND_COLUMN.urlTitle,
  BRAND_COLUMN.brandName,
  BRAND_COLUMN.brandWebsite,
  BRAND_COLUMN.remoteID,
  BRAND_COLUMN.createdDateTime,
  BRAND_COLUMN.createdByAccountID,
  BRAND_COLUMN.modifiedDateTime,
  BRAND_COLUMN.modifiedByAccountID,
]);

const BIND_PLACEHOLDER = '?';

const CLAUSE_JOINER = ', ';

const BRAND_COLUMN_LIST = [BRAND_COLUMN.brandID, ...BRAND_WRITABLE_COLUMNS].join(CLAUSE_JOINER);

/** `SwProduct`, and the two of its columns the products guard reads. */
const PRODUCT_TABLE = assertTableName('SwProduct');

/**
 * The two `SwProduct` columns the products guard reads: the key it counts and the key it filters on.
 */
const PRODUCT_COLUMN = Object.freeze({
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  brandID: assertColumnName(PRODUCT_TABLE, 'brandID'),
});

export interface BrandStatementExecutor extends SqlExecutor {
  /** Runs a data-modifying statement and returns the number of rows it affected. */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

export class MySqlBrandRepository implements BrandRepository {
  private readonly executor: BrandStatementExecutor;

  /** @see MySqlBrandRepository.constructor. */
  private readonly accountContext: AccountContextPort;

  /**
   * @param executor - Issues every statement this adapter composes. Typed at the interface rather than
   * at the concrete runner, so a hand-written double satisfies it with a plain object literal — which
   * the legacy suite could never do, having no mocking library at all and booting the whole framework
   * application instead (AAP §0.7.3).
   */
  public constructor(executor: BrandStatementExecutor, accountContext: AccountContextPort) {
    this.executor = executor;
    this.accountContext = accountContext;
  }

  /**
   * Returns an equivalent {@link MySqlBrandRepository} bound to a different statement executor.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns a new instance identical in every other respect.
   */
  public withExecutor(executor: BrandStatementExecutor): MySqlBrandRepository {
    return new MySqlBrandRepository(executor, this.accountContext);
  }

  /**
   * Instantiates a new, unpersisted brand. Replaces the `new` branch at
   * `org/Hibachi/HibachiService.cfc:L264`, which reached `new` at
   * `org/Hibachi/HibachiDAO.cfc:L38-L45` — a member whose whole body is an in-memory instantiation.
   */
  public newBrand(): ManagedEntity<Brand> {
    return manageEntity(new Brand(), BRAND_ENTITY_METADATA);
  }

  public async getBrand(brandID: string): Promise<ManagedEntity<Brand> | null> {
    if (brandID.length === 0) {
      return null;
    }

    const sql =
      `SELECT ${BRAND_COLUMN_LIST} FROM ${BRAND_TABLE} ` +
      `WHERE ${BRAND_COLUMN.brandID} = ${BIND_PLACEHOLDER}`;

    const rows = await this.executor.execute(sql, [brandID]);

    const row = this.readAtMostOneRow(rows, 'primary identifier');
    if (row === null) {
      return null;
    }

    return mapBrandRow(row);
  }

  /**
   * Persists an already-populated, already-validated brand, inserting or updating as its identity
   * requires. Replaces the `save` branch at `org/Hibachi/HibachiService.cfc:L268`, which reached
   * `save` at `org/Hibachi/HibachiDAO.cfc:L48-L67`.
   *
   * @param brand - The fully populated, already-validated, already-managed brand to persist.
   * @returns The same brand instance, still managed, carrying its identifier. Never null.
   */
  public async saveBrand(brand: ManagedEntity<Brand>): Promise<ManagedEntity<Brand>> {
    const isInsert = brand.isNew();

    if (isInsert) {
      brand.brandID = createSlatwallUUID();
    }

    /*
     * The lifecycle hook, invoked because nothing else fires it — see the audit note above. Stamp first,
     * collect second: `collectWritableValues` reads the four audit fields off the entity, so stamping
     * afterwards would compose the statement from the previous write's values and persist a row whose
     * audit columns lag one save behind, silently.
     */
    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      applyPreInsertAudit(brand, auditActor);
    } else {
      applyPreUpdateAudit(brand, auditActor);
    }

    const writableValues = this.collectWritableValues(brand);

    if (isInsert) {
      const placeholders = [BRAND_COLUMN.brandID, ...BRAND_WRITABLE_COLUMNS]
        .map(() => BIND_PLACEHOLDER)
        .join(CLAUSE_JOINER);

      await this.executor.executeMutation(
        `INSERT INTO ${BRAND_TABLE} (${BRAND_COLUMN_LIST}) VALUES (${placeholders})`,
        [brand.brandID, ...writableValues],
      );

      return brand;
    }

    const assignments = BRAND_WRITABLE_COLUMNS.map(
      (column) => `${column} = ${BIND_PLACEHOLDER}`,
    ).join(CLAUSE_JOINER);

    await this.executor.executeMutation(
      `UPDATE ${BRAND_TABLE} SET ${assignments} ` +
        `WHERE ${BRAND_COLUMN.brandID} = ${BIND_PLACEHOLDER}`,
      [...writableValues, brand.brandID],
    );

    return brand;
  }

  /**
   * Removes a brand. Replaces the `delete` branch at `org/Hibachi/HibachiService.cfc:L270`, which
   * reached `delete` at `org/Hibachi/HibachiDAO.cfc:L69-L77`. The legacy primitive is declared `void`
   * and takes the entity (`:L69`), branching at `:L70-L73` to recurse over an array. The port declares
   * the single-entity form taking the entity — narrowing the parameter to an identifier string would
   * look tidier and would silently offer callers an entry point the legacy never had.
   *
   * @returns `true` when the row was removed, `false` when no row matched. Never null.
   * @throws {DataIntegrityError} When the brand was never persisted and therefore has no row.
   */
  public async deleteBrand(brand: ManagedEntity<Brand>): Promise<boolean> {
    if (brand.isNew()) {
      throw new DataIntegrityError(
        'A brand that has never been persisted was handed to the removal path, so there is no row ' +
          'to identify and no statement was issued.',
        { context: { brandID: brand.brandID, className: brand.getClassName() } },
      );
    }

    const removedRows = await this.executor.executeMutation(
      `DELETE FROM ${BRAND_TABLE} WHERE ${BRAND_COLUMN.brandID} = ${BIND_PLACEHOLDER}`,
      [brand.brandID],
    );

    return removedRows > 0;
  }

  /**
   * Reports whether a candidate URL title is still free for a brand.
   *
   * TODO(parity) `model/dao/DataDAO.cfc:L126-L130` — inverting this is completely silent. It produces no
   * compile error, no type error and no lint finding, because both directions are `Promise<boolean>` and
   * the member name reads plausibly either way. The damage lands in the consumer:
   * `model/service/DataService.cfc:L62` probes once and `:L64` then loops `while(!unique)` with no
   * iteration ceiling, re-probing at `:L67`. Invert the polarity and you get exactly one of two outcomes
   * — the loop never runs and duplicate URL titles reach a column declared `unique="true"` at
   * `model/entity/Brand.cfc:L55`, or every candidate is reported taken and the loop never terminates.
   * Neither raises anything. The polarity is carried, annotated and asserted by test in both directions.
   *
   * @returns `true` when no brand row already carries the value — it is available — and `false` when one
   * does. Never null.
   */
  public async isUrlTitleAvailable(urlTitle: string): Promise<boolean> {
    /*
     * A constant projection and a one-row stop, where the legacy projected the column and read the
     * whole match set. Structural, and provably answer-preserving from the legacy body rather than by
     * argument: `model/dao/DataDAO.cfc:L123` runs the read and `:L126` is the only thing that ever
     * touches the result — `rs.recordCount`, tested for non-zero. The projected column is never read,
     * no row is handed back, and the magnitude of the count is never consulted, so one matching row is
     * complete evidence and every further row the legacy transferred was discarded. This is the one
     * departure from the star-projection reasoning recorded on {@link BRAND_COLUMN_LIST}: that
     * paragraph is about reads whose columns are hydrated, and this read hydrates nothing.
     */
    const sql =
      `SELECT 1 FROM ${BRAND_TABLE} ` +
      `WHERE ${BRAND_COLUMN.urlTitle} = ${BIND_PLACEHOLDER} LIMIT 1`;

    const rows = await this.executor.execute(sql, [urlTitle]);

    /*
     * The inversion, in one place: a match means not available. `model/dao/DataDAO.cfc:L126` tests
     * the record count and returns false; `:L130` returns true when it did not. No self-exclusion
     * clause appears here because the legacy probe has none either — its caller derives a candidate
     * for an entity that does not yet own one, so there is no row to exclude. That contrasts with the
     * general predicate at `org/Hibachi/HibachiDAO.cfc:L140`, which does exclude by identifier and
     * whose exclusion is a no-op on insert anyway; that member's owner is `UniquePropertyChecker.ts`.
     */
    return rows.length === 0;
  }

  private readAtMostOneRow(rows: readonly MySqlRow[], matchedOn: string): MySqlRow | null {
    if (rows.length > 1) {
      throw new DataIntegrityError(
        'A brand read that can match at most one row matched several, so the result is ambiguous ' +
          'and no brand was hydrated from it.',
        { context: { table: BRAND_TABLE, matchedOn, rowCount: rows.length } },
      );
    }

    const row = rows[0];
    return row === undefined ? null : row;
  }

  /**
   * Collects the column values for the write path, in the exact order of
   * {@link BRAND_WRITABLE_COLUMNS} — `model/entity/Brand.cfc`'s own declaration order (TR-4). A value
   * and a column that disagreed on position would bind a URL title into a brand name with nothing to
   * report it, so the pairing is stated once, here, rather than at each statement.
   */
  /**
   * Reads the identifiers of every product this brand owns — the delete guard's live read.
   *
   * @param brandID - The brand whose owned products are counted. Bound, never interpolated.
   * @returns One identifier per owned product row, in server order. Empty for an unsaved or unowned brand.
   */
  public async findProductIdentifiersByBrand(brandID: string): Promise<string[]> {
    /*
     * An unsaved brand cannot own a row, and probing for one would issue a statement the legacy's lazy
     * load never issued either — Hibernate does not query a collection of a transient instance.
     */
    if (brandID.length === 0) {
      return [];
    }

    const sql =
      `SELECT ${PRODUCT_COLUMN.productID} FROM ${PRODUCT_TABLE} ` +
      `WHERE ${PRODUCT_COLUMN.brandID} = ${BIND_PLACEHOLDER}`;

    const rows = await this.executor.execute(sql, [brandID]);

    return rows.map((row): string => {
      const productID = row[PRODUCT_COLUMN.productID];

      if (typeof productID !== 'string' || productID.length === 0) {
        throw new DataIntegrityError(
          'A product row owned by this brand answered no usable identifier, so the brand delete ' +
            'guard cannot count the collection it is required to count.',
          { context: { brandID, received: typeof productID } },
        );
      }

      return productID;
    });
  }

  private collectWritableValues(brand: ManagedEntity<Brand>): readonly unknown[] {
    return [
      brand.activeFlag ?? null,
      brand.publishedFlag ?? null,
      brand.urlTitle ?? null,
      brand.brandName ?? null,
      brand.brandWebsite ?? null,
      brand.remoteID ?? null,
      brand.createdDateTime ?? null,
      brand.createdByAccount ?? null,
      brand.modifiedDateTime ?? null,
      brand.modifiedByAccount ?? null,
    ];
  }
}
