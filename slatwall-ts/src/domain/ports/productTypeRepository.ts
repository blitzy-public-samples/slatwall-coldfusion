/**
 * Product-type repository port - the domain-side persistence and query contract for `ProductType`.
 *
 * Ported from `model/dao/ProductTypeDAO.cfc` (68 lines, cfscript, body L45-L68 - the smallest of
 * the six in-scope DAOs), with the entity read and save methods the service tier needs now that the
 * ORM is gone.
 *
 * This file declares interfaces only and contains no SQL, so the prepared-statement obligation that
 * preserves `cfqueryparam`'s injection-safety guarantee transfers wholly to
 * `src/repositories/mysql/**`. Associations arrive materialized; laziness is never simulated, and
 * the fetch shape of each method is decided and documented at the corresponding adapter method.
 */
import type { ProductType } from '../entities/productType.js';

/**
 * The resolved fields a product-type save populates from before it writes.
 *
 * ★ FOR THIS AGGREGATE THE PAYLOAD IS THE LEGACY'S OWN CARRIER, not a workaround for an immutable
 * field. [model/service/ProductService.cfc:L297] and [L299] assign `data.urlTitle` and never call a
 * setter on the product type, and `super.save(arguments.productType, arguments.data)` at [L303] then
 * populated the entity from that struct before flushing. Reproducing [L295-L301] therefore requires a
 * payload to reach the adapter; there is no entity write to mirror instead.
 *
 * Both members are `?: string | undefined` rather than `?: string` so that an explicit
 * `urlTitle: undefined` stays expressible under `exactOptionalPropertyTypes`, and both are nullable
 * in the schema: `urlTitle` [model/entity/ProductType.cfc:L55] and `productTypeName`
 * [model/entity/ProductType.cfc:L54].
 *
 * ⚠ NOT A GENERAL POPULATE STRUCT. `super.save` applied every key a caller sent, driven by framework
 * metadata that is not ported. This carries what [L295-L301] reads and resolves, and nothing else.
 */
export interface ProductTypeSavePayload {
  /**
   * The resolved URL title [model/service/ProductService.cfc:L297, L299].
   *
   * Absent means "use the entity's value"; present-and-`undefined` means "write SQL NULL". The
   * adapter distinguishes the two with `Object.hasOwn`.
   */
  readonly urlTitle?: string | undefined;

  /** The product-type name the gate reads at [model/service/ProductService.cfc:L296]. */
  readonly productTypeName?: string | undefined;
}

/**
 * One row of the cached product-type listing.
 */
export interface ProductTypeTreeRow {
  readonly productTypeID: string;

  // CFML parity [model/dao/ProductTypeDAO.cfc:L54-L61]: both counts are correlated subqueries
  // selected alongside `SELECT *` — `isAssigned` counts products of this type and `childCount`
  // counts its immediate child types — so they are counts, not flags, despite the first name.
  readonly isAssigned: number;

  readonly childCount: number;

  // These three arrive from the `SELECT *`, so their presence depends on the columns the table
  // actually has. The CFML ORM mapping does not declare them required, so the target projection
  // permits undefined for each of them.
  readonly productTypeName?: string;

  readonly productTypeIDPath?: string;

  readonly parentProductTypeID?: string;
}

/**
 * The product-type repository port.
 *
 * Four methods, locked: the single public function of `model/dao/ProductTypeDAO.cfc` plus the three
 * entity read and save methods the service tier needs now that Hibernate is gone. The arithmetic
 * behind that count is in this file's header. Each method returns a promise because each one
 * reaches persistence.
 *
 * TWO METHODS THAT LOOK LIKE THEY BELONG HERE, AND DO NOT. Both are declared on sibling ports, and
 * the boundary is drawn deliberately rather than by accident:
 *
 *   * `searchProductsByProductType` belongs to `productRepository`, from
 *     [model/dao/ProductDAO.cfc:L419]. It is keyed by product type but it returns products, so it
 *     is a product read.
 *   * `searchSkusByProductType` belongs to `skuRepository`, from [model/dao/SkuDAO.cfc:L130]. Same
 *     reasoning: keyed by product type, returns SKUs.
 *
 * A method's home is the aggregate it returns, not the argument it filters on. Neither is declared
 * below, and neither may be added.
 *
 * THE IMPLEMENTING ADAPTER IS `src/repositories/mysql/mysqlProductTypeRepository.ts`, and exactly
 * four obligations transfer to it:
 *
 *   1. Prepared statements exclusively (E5), preserving the injection-safety guarantee that
 *      `cfqueryparam` provided. Every caller-supplied value is bound as its own parameter and
 *      never interpolated into statement text.
 *   2. The tree read's ordering - by product-type name ascending
 *      [model/dao/ProductTypeDAO.cfc:L62] - preserved verbatim, and no different sort substituted.
 *   3. The row-to-entity factory, port injection and association materialization, with the fetch
 *      shape decided and commented at each repository method (T3). Laziness is not simulated.
 *   4. Explicit materialized-path maintenance wherever the ORM previously used persistence
 *      lifecycle hooks. [model/entity/PriceGroup.cfc:L206] and [model/entity/PriceGroup.cfc:L211]
 *      are the documented precedent for that pattern; the product type carries the same kind of
 *      path [model/entity/ProductType.cfc:L53], maintained at
 *      [model/entity/ProductType.cfc:L305-L313] in the legacy source, so the same discipline
 *      applies to any path this adapter writes.
 *
 * The composition root wires that adapter to this interface. Nothing here names a driver, a pool, a
 * connection, a row packet, a statement or a table.
 */
export interface ProductTypeRepository {
  // LEGACY-NOTE [model/dao/ProductTypeDAO.cfc:L51-L64]: the hint and the trailing comment both call
  // this a tree-sorted query, but the statement orders by productTypeName ascending, so rows come
  // back in name order and tree order has to be rebuilt from productTypeIDPath by the caller.
  //
  // Retained to preserve the cited legacy behavior.
  //
  // The legacy statement is raw SQL naming `SlatwallProductType`, the ORM entity name, while the
  // entity maps to table `SwProductType` [model/entity/ProductType.cfc:L49].
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
   * [model/service/ProductService.cfc:L303] - the framework save that delegated populate, validate
   * and flush in one call. Populate and flush land here; validation does not, because the framework
   * validation service is not ported and `model/validation/ProductType.json` was enforced by it.
   *
   * ★ IT TAKES A PAYLOAD, AND FOR THIS AGGREGATE THE LEGACY ITSELF DEMANDS IT. Unlike the product
   * save - where [L269] wrote the resolved title onto the entity - [L297] and [L299] write
   * `data.urlTitle`, THE STRUCT, and never touch the product type. The value reached the row only
   * because `super.save` populated the entity from that struct before flushing
   * [org/Hibachi/HibachiService.cfc:L146]. So the payload is not an alternative route to the column
   * here; it is the ONLY route the source ever used, and a save taking the entity alone could not
   * express the legacy behaviour at all.
   *
   * That is what made the earlier one-argument form silently wrong: the service resolved a title into
   * a payload nobody read, the adapter persisted `productType.getUrlTitle()` - still absent - and the
   * gate at [L295] then fired again on the next save, generating a fresh title every time and
   * persisting none of them.
   *
   * @param productType The product type to persist.
   * @param data The resolved payload to populate from before writing. Pass an empty object when the
   *   caller has nothing to resolve.
   * @returns The persisted product type, carrying the populated column values.
   */
  saveProductType(productType: ProductType, data: ProductTypeSavePayload): Promise<ProductType>;
}
