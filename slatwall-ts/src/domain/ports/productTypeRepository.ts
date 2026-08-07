/**
 * Product-type repository port - the domain-side persistence and query contract for `ProductType`.
 *
 * Ported from `model/dao/ProductTypeDAO.cfc` (68 lines, cfscript, body L45-L68 - the smallest of
 * the six in-scope DAOs).
 */
import type { ProductType } from '../entities/productType.js';

/**
 * The resolved fields a product-type save populates from before it writes.
 *
 * For this aggregate the payload is the legacy's own carrier, not a workaround for an immutable
 * field.
 *
 * Both members are `?: string | undefined` rather than `?: string` so that an explicit
 * `urlTitle: undefined` stays expressible under `exactOptionalPropertyTypes`.
 */
export interface ProductTypeSavePayload {
  /**
   * The resolved URL title [model/service/ProductService.cfc:L297, L299].
   *
   * Absent means "use the entity's value"; present-and-`undefined` means "write SQL NULL".
   */
  readonly urlTitle?: string | undefined;

  /**
   * The product-type name the gate reads at [model/service/ProductService.cfc:L296].
   */
  readonly productTypeName?: string | undefined;
}

/**
 * One row of the cached product-type listing.
 */
export interface ProductTypeTreeRow {
  readonly productTypeID: string;

  // CFML parity [model/dao/ProductTypeDAO.cfc:L54-L61]: both counts are correlated subqueries
  // selected alongside `SELECT *` `isAssigned` counts products of this type and `childCount`
  // counts its immediate child types so they are counts, not flags.
  readonly isAssigned: number;

  readonly childCount: number;

  // These three arrive from the `SELECT *`, so their presence depends on the columns the table
  // actually has.
  readonly productTypeName?: string;

  readonly productTypeIDPath?: string;

  readonly parentProductTypeID?: string;
}

/**
 * The product-type repository port.
 *
 * Four methods, locked: the single public function of `model/dao/ProductTypeDAO.cfc` plus the
 * three entity read and save methods the service tier needs now that Hibernate is gone.
 *
 * A method's home is the aggregate it returns, not the argument it filters on.
 */
export interface ProductTypeRepository {
  // LEGACY-NOTE [model/dao/ProductTypeDAO.cfc:L51-L64]: the hint and the trailing comment both
  // call this a tree-sorted query, but the statement orders by productTypeName ascending.
  /**
   * The full product-type listing with per-row product and child counts.
   *
   * @returns every product type, ordered by name.
   */
  getProductTypeQuery(): Promise<readonly ProductTypeTreeRow[]>;

  getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined>;

  /**
   * Load every product type named in a materialized identifier path, which is how the promotion
   * qualifier and reward membership tests walk a type's ancestry.
   *
   * @param productTypeIDPath comma-delimited product type identifiers, root first.
   * @returns the product types the path names; absent identifiers are simply not returned.
   */
  getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]>;

  /**
   * Persist one product type, populating it from a resolved payload first.
   *
   * The target of AAP rule T3 for `super.save(arguments.productType, arguments.data)`
   * [model/service/ProductService.cfc:L303] - the framework save that delegated populate.
   *
   * @param productType The product type to persist.
   * @param data The resolved payload to populate from before writing.
   * @returns The persisted product type, carrying the populated column values.
   */
  saveProductType(productType: ProductType, data: ProductTypeSavePayload): Promise<ProductType>;
}
