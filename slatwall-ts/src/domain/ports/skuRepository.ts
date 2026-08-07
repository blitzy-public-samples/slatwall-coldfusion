// SKU repository port: the reads and writes behind `SkuService` and the SKU side of the catalog.
//
// Replaces `model/dao/SkuDAO.cfc` (228 lines), which mixes cfscript with `<cffunction>` tag
// syntax.
//
// No class, no constant, no enum, no function body, no default parameter value, no driver type and
// no SQL of any kind.
//
// The consequence is deliberate and should not be "fixed": the two-line LEGACY-DEFECT marker below
// keeps the mandated `//` shape and its mandated position adjacent to the interface, and appears
// exactly once.

import type { Sku } from '../entities/sku.js';
import type { Product } from '../entities/product.js';
// LEGACY-DEFECT [model/service/SkuService.cfc:L281-L282]: `getSkuStocksDeletableFlag` calls a
// `SkuDAO` method that does not exist, so the service method throws at runtime.
// Preserved deliberately; do not fix without a product decision.

/**
 * The SKU repository port.
 *
 * Seven methods: the six public data-reading `SkuDAO` functions, plus one persistence method that
 * has no legacy antecedent on that component.
 *
 * Every method returns a promise because every legacy body reached the DAO or the ORM.
 */
export interface SkuRepository {
  // CFML parity [model/dao/SkuDAO.cfc:L53-L98]: the SKU identifier is preferred when both are
  // supplied, and existence is tested by ten `EXISTS` clauses joined with `OR` order items,
  // inventory, delivery and receiving items, physical counts, both sides of a stock adjustment.
  /**
   * Whether any transaction record references the SKU, or any SKU of the product.
   *
   * @param skuID SKU to test; takes precedence when both arguments are supplied.
   * @param productID product whose SKUs are tested when no SKU is supplied.
   * @returns true when at least one referencing record exists.
   */
  getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean>;

  // CFML parity [model/dao/SkuDAO.cfc:L102-L103]: the same value is matched against both the SKU
  // code and the alternate SKU codes, and the legacy call asks for a unique result rather than a
  // list, so it is not written to tolerate two matches.
  /**
   * Load a SKU by its code or one of its alternate codes.
   *
   * @param skuCode code to match.
   * @returns the SKU, or undefined when nothing matches.
   */
  getSkuBySkuCode(skuCode: string): Promise<Sku | undefined>;

  // CFML parity [model/dao/SkuDAO.cfc:L106-L128]: one `exists` clause is appended per selected
  // option and they are joined with `AND`, so a SKU must carry every option to match not any of
  // them.
  /**
   * SKUs carrying all of the selected options.
   *
   * @param selectedOptions comma-delimited option identifiers that must all be present.
   * @param productID optional product to restrict the search to.
   * @returns matching SKUs.
   */
  getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]>;

  // CFML parity [model/dao/SkuDAO.cfc:L130-L148]: the term is matched against the SKU code with a
  // leading and trailing wildcard, and the product-type filter is appended only for a non-blank
  // value.
  /**
   * Search SKUs by code.
   *
   * @param term substring matched anywhere in the SKU code.
   * @param productTypeID comma-delimited product types to restrict the search to.
   * @returns matching SKUs.
   */
  searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]>;

  // CFML parity [model/dao/SkuDAO.cfc:L150-L168]: the eager-fetch join is chosen from the
  // product's base type access contents, options or subscription benefits and all three branches
  // use an inner join.
  /**
   * Every SKU of a product.
   *
   * @param product product whose SKUs are loaded.
   * @param fetchOptions when true, eagerly load the children matching the product's base type.
   * @returns the product's SKUs, unordered.
   */
  getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]>;

  // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: ordering is a positional weighting each option's
  // sort order scaled by a power of ten derived from its option group's sort order so option
  // groups act as digits and the lowest-ordered group is the most significant.
  /**
   * SKU identifiers for a product, ordered by option group then option sort order.
   *
   * @param productID product whose SKUs are ordered.
   * @returns SKU identifiers in display order.
   */
  getSortedProductSkusID(productID: string): Promise<string[]>;

  // No legacy antecedent on `SkuDAO.cfc`, which declares no save of any kind.
  /**
   * Persist one SKU as its own unit of work.
   *
   * Insert versus update is decided by the entity's own `isNew()` rather than by probing the
   * database.
   *
   * The framework DERIVES the flag - `if(getPrimaryIDValue() == "") return true;` - whereas the
   * ported `Sku` returns a boolean supplied at construction.
   *
   * @param sku the SKU to persist.
   * @returns a new instance reflecting the persisted row.
   */
  saveSku(sku: Sku): Promise<Sku>;
}
