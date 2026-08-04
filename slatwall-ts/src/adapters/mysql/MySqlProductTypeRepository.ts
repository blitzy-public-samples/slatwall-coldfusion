/*
 * `MySqlProductTypeRepository` — the MySQL adapter for the Catalog's product-type tree projection.
 *
 * Legacy origin: `model/dao/ProductTypeDAO.cfc`, whose whole body is one member declared at
 * `model/dao/ProductTypeDAO.cfc:L52`, assembled at `:L54-L62` and executed at `:L64`. AAP §0.4.1.7
 * mandates this file in one line — "The tree-sorted query with its `isAssigned` and `childCount`
 * subselects" — and AAP §0.4.2.6 fixes the target name: `getProductTypeQuery` becomes
 * `findAllForTree` on `ProductTypeRepository`, which this class implements and does not extend.
 *
 * This is the smallest of the four repository translations and the one with the least code to get
 * wrong. One member, one statement, no branch, no loop, no bound value and no caller. What it has
 * instead is an unusual density of misleading source: two of the four comment-bearing lines in the
 * legacy component state things that are false about the code beneath them, one column alias names
 * something other than what it holds, and the member that would consume all of it does not exist.
 * Preserving that faithfully while making every falsehood visible is the deliverable here, which is
 * why the annotation below is long relative to the eight lines of statement text it explains
 * (AAP §0.8.2 Guideline 6 — document the technology-specific judgment calls where they are made).
 *
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] `model/dao/ProductTypeDAO.cfc:L54-L62` — the legacy statement names its tables
 * with logical entity names, inside native SQL
 * Every table reference in the legacy statement — at `:L55`, `:L56`, `:L57`, `:L59`, `:L60` and
 * `:L61` — is a logical ORM entity name, and the statement around it is native SQL rather than HQL:
 *
 * Legacy `SlatwallProductType` -> emitted `SwProductType` [model/entity/ProductType.cfc:L49]
 * legacy `SlatwallProduct` -> emitted `SwProduct` [model/entity/Product.cfc:L49]
 *
 * TODO(parity) inaccuracy #1 — `model/dao/ProductTypeDAO.cfc:L51` advertises caching that does not
 * exist, and this file adds none
 * The legacy hint, preserved verbatim:
 *
 * //@hint for caching product types as a tree-sorted query
 *
 * TODO(parity) inaccuracy #2 — `model/dao/ProductTypeDAO.cfc:L63` calls the result a tree. The
 * ordering is flat and alphabetical
 * The legacy trailing comment, preserved verbatim:
 *
 * // return query sorted product type tree
 *
 * TODO(parity) `isAssigned` is a COUNT, not a flag — `model/dao/ProductTypeDAO.cfc:L55-L57`
 * The alias is a misnomer inherited from the legacy source and preserved exactly, because callers
 * observe it. What it holds is `count(...)` over the products of the product type — a value from
 * zero through N. It is not coerced here, not renamed here, and the statement does not compare it
 * against zero to produce a two-state answer. `ProductTypeRepository` declares it `number` for this
 * reason, and the row mapper reads it as one.
 */

import { assertColumnName, assertTableName } from './QueryRunner';
import { createSlatwallUUID } from '../../util/uuid';
import { DomainError } from '../../errors/DomainError';
import { mapProductTypeTreeRow, mapRows, readHydratedParentProductTypeID } from './rowMappers';

import type { ProductType } from '../../domain/product/ProductType';
import type { SqlExecutor } from './QueryRunner';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../ports/repositories/ProductTypeRepository';
import type { AccountContextPort } from '../../ports/AccountContextPort';

/** The statement surface this repository needs, now that it writes as well as reads. */
export interface ProductTypeStatementExecutor extends SqlExecutor {
  /** Runs a data-modifying statement and returns the number of rows it affected. */
  executeMutation(sql: string, parameters: readonly unknown[]): Promise<number>;
}

/* The write-side table and column names. */

const PRODUCT_TYPE_WRITE_TABLE = assertTableName('SwProductType');

/** Every `SwProductType` column the port writes, keyed by its legacy property name. */
const PRODUCT_TYPE_WRITE_COLUMN = Object.freeze({
  productTypeID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeID'),
  productTypeIDPath: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeIDPath'),
  activeFlag: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'activeFlag'),
  publishedFlag: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'publishedFlag'),
  urlTitle: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'urlTitle'),
  productTypeName: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeName'),
  productTypeDescription: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'productTypeDescription'),
  systemCode: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'systemCode'),
  parentProductTypeID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'parentProductTypeID'),
  remoteID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'remoteID'),
  createdDateTime: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'createdDateTime'),
  createdByAccountID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'createdByAccountID'),
  modifiedDateTime: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'modifiedDateTime'),
  modifiedByAccountID: assertColumnName(PRODUCT_TYPE_WRITE_TABLE, 'modifiedByAccountID'),
} as const);

/** The writable columns, in one fixed order, excluding the identifier. */
const PRODUCT_TYPE_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  /** `:L53` — the materialised ancestry path, comma-delimited, root first and self last. */
  PRODUCT_TYPE_WRITE_COLUMN.productTypeIDPath,
  /** `:L54`. */
  PRODUCT_TYPE_WRITE_COLUMN.activeFlag,
  /** `:L55`. */
  PRODUCT_TYPE_WRITE_COLUMN.publishedFlag,
  /**
   * `:L56` — `unique="true"`; the constraint is the column's, and IR-5 checks it in code as well.
   */
  PRODUCT_TYPE_WRITE_COLUMN.urlTitle,
  /** `:L57`. */
  PRODUCT_TYPE_WRITE_COLUMN.productTypeName,
  /** `:L58`. */
  PRODUCT_TYPE_WRITE_COLUMN.productTypeDescription,
  /** `:L59` — the discriminator whose three seeded values IR-7 pins. */
  PRODUCT_TYPE_WRITE_COLUMN.systemCode,
  /** `:L62` — the `fkcolumn` of the `parentProductType` many-to-one. */
  PRODUCT_TYPE_WRITE_COLUMN.parentProductTypeID,
  /** `:L79`. */
  PRODUCT_TYPE_WRITE_COLUMN.remoteID,
  /** `:L82`. */
  PRODUCT_TYPE_WRITE_COLUMN.createdDateTime,
  /** `:L83` — field `createdByAccount`, column `createdByAccountID`; the pairing is crossed. */
  PRODUCT_TYPE_WRITE_COLUMN.createdByAccountID,
  /** `:L84`. */
  PRODUCT_TYPE_WRITE_COLUMN.modifiedDateTime,
  /** `:L85` — field `modifiedByAccount`, column `modifiedByAccountID`. */
  PRODUCT_TYPE_WRITE_COLUMN.modifiedByAccountID,
]);

/**
 * The bound-parameter placeholder. `?` binds values only and can never carry an identifier (R4).
 */
const PRODUCT_TYPE_BIND_PLACEHOLDER = '?';

/** The separator for a column list and for a `SET` clause. */
const PRODUCT_TYPE_CLAUSE_JOINER = ', ';

/* The two derived-column aliases, pinned to the port's field names at compile time. */

/**
 * The alias the assigned-product count is projected under — `as isAssigned` at
 * `model/dao/ProductTypeDAO.cfc:L57`.
 */
const IS_ASSIGNED_ALIAS = 'isAssigned' satisfies keyof ProductTypeTreeRow;

/**
 * The alias the immediate-child count is projected under — `as childCount` at
 * `model/dao/ProductTypeDAO.cfc:L60`. Pinned to the port's field name for the reason given on
 * {@link IS_ASSIGNED_ALIAS}, and likewise not a column of any table.
 */
const CHILD_COUNT_ALIAS = 'childCount' satisfies keyof ProductTypeTreeRow;

/**
 * The correlation alias the legacy statement gives its self-reference — `spt` at
 * `model/dao/ProductTypeDAO.cfc:L59`.
 */
const SELF_REFERENCE_ALIAS = 'spt';

/* The statement. */

/**
 * Composes the product-type tree statement once, from identifiers the schema whitelist has approved.
 *
 * @returns The complete statement text, with a physical table name at every table position, a
 * validated column name at every column position, and no value placeholder anywhere.
 *
 * @throws {DomainError} From the whitelists, at module evaluation, if an identifier below ever falls
 * outside the extracted catalog schema.
 */
function composeProductTypeTreeStatement(): string {
  /*
   * The physical form is passed rather than the legacy logical form. The whitelist would normalise
   * either — see the naming-divergence annotation in the file header for why the emitted form is written here.
   */
  const productTypeTable = assertTableName('SwProductType');
  const productTable = assertTableName('SwProduct');

  const productTypeId = assertColumnName(productTypeTable, 'productTypeID');
  const parentProductTypeId = assertColumnName(productTypeTable, 'parentProductTypeID');
  const productTypeName = assertColumnName(productTypeTable, 'productTypeName');

  /*
   * Two columns of the product table, validated against that table. `productTypeID` exists on both
   * tables, which is exactly why the whitelist is keyed per table: the correlation predicate compares
   * one table's column against the other's, and each side is checked against the table it belongs to.
   */
  const productId = assertColumnName(productTable, 'productID');
  const productProductTypeId = assertColumnName(productTable, 'productTypeID');

  /*
   * `model/dao/ProductTypeDAO.cfc:L55-L57` — the assigned-product count, as a correlated scalar
   * subquery. The counted column, the scanned table and the correlation predicate are all the legacy's,
   * with only the two table names translated to their physical form per the naming-divergence annotation. The
   * predicate reaches out to the outer query's product-type identifier, which is what makes it
   * correlated and what makes it evaluate once per outer row.
   */
  const assignedProductCount =
    `(SELECT count(${productTable}.${productId})\n` +
    `      FROM ${productTable}\n` +
    `     WHERE ${productTable}.${productProductTypeId} =` +
    ` ${productTypeTable}.${productTypeId})`;

  /*
   * `model/dao/ProductTypeDAO.cfc:L58-L60` — the immediate-child count, likewise correlated. The
   * legacy's own self-reference alias is carried verbatim, and the predicate compares the aliased
   * inner reference's parent key against the outer row's identifier. One generation only: nothing here
   * walks the hierarchy transitively.
   */
  const childProductTypeCount =
    `(SELECT count(${SELF_REFERENCE_ALIAS}.${productTypeId})\n` +
    `      FROM ${productTypeTable} ${SELF_REFERENCE_ALIAS}\n` +
    `     WHERE ${SELF_REFERENCE_ALIAS}.${parentProductTypeId} =` +
    ` ${productTypeTable}.${productTypeId})`;

  return (
    `SELECT ${productTypeTable}.*,\n` +
    `  ${assignedProductCount} as ${IS_ASSIGNED_ALIAS},\n` +
    `  ${childProductTypeCount} as ${CHILD_COUNT_ALIAS}\n` +
    `FROM ${productTypeTable}\n` +
    `ORDER BY ${productTypeName} ASC`
  );
}

/** The one statement this adapter runs, composed once and never rebuilt. */
export const PRODUCT_TYPE_TREE_STATEMENT: string = composeProductTypeTreeStatement();

/**
 * The bound-value list for {@link PRODUCT_TYPE_TREE_STATEMENT}: empty, and passed rather than omitted.
 */
export const PRODUCT_TYPE_TREE_BOUND_VALUES: readonly unknown[] = Object.freeze([]);

/*
 * A second copy of the persistence identifiers stood here and has been removed.
 * It declared `PRODUCT_TYPE_TABLE`, `PRODUCT_TYPE_ID_COLUMN` and a second
 * `PRODUCT_TYPE_WRITABLE_COLUMNS` listing the same thirteen columns in the same order, spelled as
 * `assertColumnName(PRODUCT_TYPE_TABLE, ...)` rather than through {@link PRODUCT_TYPE_WRITE_COLUMN}.
 */

/*
 * `PRODUCT_TYPE_MANY_TO_MANY_FIELDS` and `clearProductTypeManyToManyCollections` were removed.
 * They ported `org/Hibachi/HibachiService.cfc:L61` `removeAllManyToManyRelationships()` as an in-memory
 * sweep, and nothing called either of them — `removeProductType` below issues its DELETE and does not.
 */

/* The adapter. */

/**
 * The MySQL implementation of `ProductTypeRepository`.
 *
 * @example
 * ```ts
 * // Wired in the composition root, which supplies the executor it already built.
 * Const productTypes = new MySqlProductTypeRepository(executor, accountContext);
 * For (const row of await productTypes.findAllForTree) {
 * // `row.isAssigned` is how many products use this product type, 0..N — never a yes-or-no answer.
 * ```
 */
export class MySqlProductTypeRepository implements ProductTypeRepository {
  /** The injected execution contract. */
  private readonly executor: ProductTypeStatementExecutor;

  /** @see MySqlProductTypeRepository.constructor. */
  private readonly accountContext: AccountContextPort;

  /**
   * @param executor - the contract every statement in this folder runs through, supplied by the
   * composition root. This class never builds a pool, never reads a credential and never resolves a
   * connection target.
   */
  /**
   * @param executor - Issues every statement this adapter composes.
   * @param accountContext - Resolves the acting account for the audit block the write seam stamps.
   */
  public constructor(executor: ProductTypeStatementExecutor, accountContext: AccountContextPort) {
    this.executor = executor;
    this.accountContext = accountContext;
  }

  /**
   * Returns an equivalent {@link MySqlProductTypeRepository} bound to a different statement executor.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns a new instance identical in every other respect.
   */
  public withExecutor(executor: ProductTypeStatementExecutor): MySqlProductTypeRepository {
    return new MySqlProductTypeRepository(executor, this.accountContext);
  }

  /**
   * Returns every product type, each carrying its assigned-product count and its immediate-child
   * count.
   *
   * Legacy origin: `model/dao/ProductTypeDAO.cfc:L52`, whose statement is assembled at `:L54-L62` and
   * executed at `:L64`. The translation is one-for-one and the whole method is visible below, which is
   * the honest shape of this port: the legacy member is a statement and a return, and so is this one.
   *
   * TODO(parity) `model/dao/ProductTypeDAO.cfc:L51` and `:L63` — two legacy comments misdescribe what
   * this returns, and both are carried rather than corrected. The hint advertises caching that the
   * component does not perform, and the trailing comment calls a flat alphabetical ordering a tree.
   * Both are annotated in full in the file header. The two consequences for anyone editing this
   * method: it must issue a statement on every call, and it must not touch the ordering.
   *
   * TODO(parity) `model/dao/ProductTypeDAO.cfc:L55-L57` — `isAssigned` is a COUNT and not a flag. The
   * rows this method resolves carry a number from zero through N in that field. It is not coerced,
   * compared or renamed anywhere on this path. Full reasoning in the file header.
   *
   * @returns Every product type in flat alphabetical order by name, each row carrying its two derived
   * counts. Possibly empty; never null and never undefined. The array is a snapshot of one read —
   * nothing retains it, and two calls are two independent reads that need not agree.
   *
   * @throws {DomainError} When the execution boundary or the row mapper rejects what it was given, per
   * the ownership list above.
   */
  public async findAllForTree(): Promise<ProductTypeTreeRow[]> {
    const rows = await this.executor.execute(
      PRODUCT_TYPE_TREE_STATEMENT,
      PRODUCT_TYPE_TREE_BOUND_VALUES,
    );

    return mapRows(rows, mapProductTypeTreeRow);
  }

  /**
   * The writable column values, in exactly the order {@link PRODUCT_TYPE_WRITABLE_COLUMNS} lists them.
   */
  private collectWritableValues(productType: ProductType): readonly unknown[] {
    return [
      productType.productTypeIDPath ?? null,
      productType.activeFlag ?? null,
      productType.publishedFlag ?? null,
      productType.urlTitle ?? null,
      productType.productTypeName ?? null,
      productType.productTypeDescription ?? null,
      productType.systemCode ?? null,
      /*
       * The hierarchy lives in this key. The association comes first, mirroring the mapping
       * declaration at `model/entity/ProductType.cfc:L62`.
       */
      productType.parentProductType?.productTypeID ??
        readHydratedParentProductTypeID(productType) ??
        null,
      productType.remoteID ?? null,
      productType.createdDateTime ?? null,
      productType.createdByAccount ?? null,
      productType.modifiedDateTime ?? null,
      productType.modifiedByAccount ?? null,
    ];
  }

  /**
   * Write one product type. See {@link ProductTypeRepository.saveProductType} for the contract and for
   * why this member has to exist at all.
   */
  public async saveProductType(productType: ProductType): Promise<ProductType> {
    const isInsert = productType.isNew();

    /*
     * The identifier `generator="uuid"` used to produce at flush time — assigned only while the entity
     * is transient, so an update keeps the identifier its stored row is keyed on.
     */
    if (isInsert) {
      productType.productTypeID = createSlatwallUUID();
    }

    /*
     * The ORM lifecycle hook is invoked here, which discharges a declared boundary item
     * `src/domain/product/ProductType.ts` carries a `TODO(boundary)` on these two hooks stating
     * that in the legacy they fire themselves and here they must be called, "immediately before the
     * corresponding insert and update". This is that call site. Hibernate invoked them as part of
     * the flush the framework triggered at request end (`org/Hibachi/Hibachi.cfc`, double
     * `ormFlush()` gated on the ORM reporting no errors, with `flushAtRequestEnd=false`); a
     * stateless Lambda invocation has no ORM session, no automatic flush and no request-end hook
     * (mismatch M5, AAP §0.6.6), and `src/services/BaseService.ts` explicitly declines the job and
     * places it behind `EntityPersister`, which is this adapter.
     */
    /*
     * Rule 3b, second half — the hook rebuilds the ancestry path from the association this adapter
     * deliberately leaves unresolved, so the rebuild has to be allowed to fail safe.
     */
    const hydratedProductTypeIDPath = productType.productTypeIDPath;
    const preservedParentProductTypeID = readHydratedParentProductTypeID(productType);

    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      productType.preInsert(auditActor);
    } else {
      productType.preUpdate(undefined, auditActor);
    }

    if (
      productType.parentProductType === undefined &&
      preservedParentProductTypeID !== undefined &&
      hydratedProductTypeIDPath !== undefined
    ) {
      productType.productTypeIDPath = hydratedProductTypeIDPath;
    }

    const writableValues = this.collectWritableValues(productType);

    if (isInsert) {
      const columnList = [
        PRODUCT_TYPE_WRITE_COLUMN.productTypeID,
        ...PRODUCT_TYPE_WRITABLE_COLUMNS,
      ].join(PRODUCT_TYPE_CLAUSE_JOINER);
      const placeholders = [
        PRODUCT_TYPE_WRITE_COLUMN.productTypeID,
        ...PRODUCT_TYPE_WRITABLE_COLUMNS,
      ]
        .map(() => PRODUCT_TYPE_BIND_PLACEHOLDER)
        .join(PRODUCT_TYPE_CLAUSE_JOINER);

      await this.executor.executeMutation(
        `INSERT INTO ${PRODUCT_TYPE_WRITE_TABLE} (${columnList}) VALUES (${placeholders})`,
        [productType.productTypeID, ...writableValues],
      );

      return productType;
    }

    const assignments = PRODUCT_TYPE_WRITABLE_COLUMNS.map(
      (column) => `${column} = ${PRODUCT_TYPE_BIND_PLACEHOLDER}`,
    ).join(PRODUCT_TYPE_CLAUSE_JOINER);

    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TYPE_WRITE_TABLE} SET ${assignments} ` +
        `WHERE ${PRODUCT_TYPE_WRITE_COLUMN.productTypeID} = ${PRODUCT_TYPE_BIND_PLACEHOLDER}`,
      [...writableValues, productType.productTypeID],
    );

    return productType;
  }

  /**
   * Remove one product type. See {@link ProductTypeRepository.removeProductType} for the contract.
   */
  public async removeProductType(productType: ProductType): Promise<void> {
    if (productType.isNew()) {
      throw new DomainError('A product type cannot be removed before it has been persisted.', {
        context: { productTypeName: productType.productTypeName },
      });
    }

    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TYPE_WRITE_TABLE} ` +
        `WHERE ${PRODUCT_TYPE_WRITE_COLUMN.productTypeID} = ${PRODUCT_TYPE_BIND_PLACEHOLDER}`,
      [productType.productTypeID],
    );
  }
}
