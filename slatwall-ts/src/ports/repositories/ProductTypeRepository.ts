/**
 * `ProductTypeRepository` — the repository port for the Catalog's product-type tree query.
 *
 * Legacy origin: `model/dao/ProductTypeDAO.cfc`, whose entire body is one member. AAP §0.4.1.6
 * mandates this file with a single instruction — "The tree-sorted query's projection typed" — and
 * AAP §0.4.2.6 fixes the target name: `getProductTypeQuery`
 * (`model/dao/ProductTypeDAO.cfc:L52`) becomes {@link ProductTypeRepository.findAllForTree}.
 * The DAO is in scope as an implicit addition (AAP §0.2.1.3), though for this one the claim is
 * narrower than for its three siblings: the member has no branch, no loop and no business rule. What
 * it has is a projection — two derived counts that appear nowhere else in the slice — and no service
 * layer above it to restate them, because `hb_serviceName="productService"`
 * [model/entity/ProductType.cfc:L49] routes product types through `productService` while the property
 * that would reach this DAO [model/service/ProductService.cfc:L54] is never used. Typing the
 * projection here is therefore the only place it can be typed.
 */

import type { ProductType } from '../../domain/product/ProductType';

/**
 * One row of {@link ProductTypeRepository.findAllForTree} — a product type together with the two
 * counts the legacy query derives for it.
 *
 * TODO(parity): the legacy statement at `model/dao/ProductTypeDAO.cfc:L54` through
 * `model/dao/ProductTypeDAO.cfc:L62` names its tables with the stale logical entity names, and it
 * is native statement text rather than HQL — the query object is created at
 * `model/dao/ProductTypeDAO.cfc:L53` and executed at `model/dao/ProductTypeDAO.cfc:L64`, with no
 * ORM layer in between to translate a logical name. In release 3.1.39 the physical tables are
 * `SwProductType` and `SwProduct`, declared at `model/entity/ProductType.cfc:L49` and
 * `model/entity/Product.cfc:L49` respectively, and this component contains zero physical names
 * anywhere — so the statement is stale from the pre-3.x table rename and unexecutable as written.
 */
export type ProductTypeTreeRow = ProductType & {
  /**
   * How many products are assigned to this product type — `count(SlatwallProduct.productID)` at
   * `model/dao/ProductTypeDAO.cfc:L55-L57`. A count, never a yes-or-no flag; zero when the product
   * type has no products.
   */
  readonly isAssigned: number;

  /**
   * How many product types name this one as their parent — `count(spt.productTypeID)` at
   * `model/dao/ProductTypeDAO.cfc:L58-L60`. Immediate children only, never a transitive subtree
   * size; zero for a leaf.
   */
  readonly childCount: number;
};

/**
 * Port for the one member of `model/dao/ProductTypeDAO.cfc`, implemented against MySQL in
 * `src/adapters/mysql/**`.
 */
export interface ProductTypeRepository {
  /**
   * Returns every product type, each carrying its assigned-product count and its immediate-child
   * count.
   *
   * Legacy origin: `model/dao/ProductTypeDAO.cfc:L52`, whose statement is assembled at
   * `model/dao/ProductTypeDAO.cfc:L54-L62` and executed at `model/dao/ProductTypeDAO.cfc:L64`.
   *
   * TODO(parity): the two legacy comments misdescribe that ordering, and the divergence is recorded
   * rather than resolved. The hint at `model/dao/ProductTypeDAO.cfc:L51` calls the result a
   * "tree-sorted query" and the trailing comment at `model/dao/ProductTypeDAO.cfc:L63` calls it a
   * "sorted Product Type tree", yet `model/dao/ProductTypeDAO.cfc:L62` performs a flat alphabetical
   * sort and nothing else. AAP §0.4.1.6's own phrase "the tree-sorted query" inherits that same
   * legacy vocabulary; the ordering is in fact flat. This method name, its return type and this
   * documentation therefore promise no hierarchical ordering, and none must be introduced: adding a
   * tree sort would change observable output, which AAP §0.7.3 ("preserve and annotate, do not
   *
   * TODO(parity): the same hint at `model/dao/ProductTypeDAO.cfc:L51` also advertises caching —
   * "for caching product types as a tree-sorted query" — and nothing in the component caches
   * anything. A fresh query object is created at `model/dao/ProductTypeDAO.cfc:L53` and executed at
   * `model/dao/ProductTypeDAO.cfc:L64` on every single call, and the component declares no property
   * to hold a result in (`model/dao/ProductTypeDAO.cfc:L49`). Contrast `model/dao/SkuDAO.cfc:L51`,
   * which declares exactly such a property and genuinely memoizes. Implementations must not add
   * caching, memoization, invalidation or a time-to-live to satisfy the hint: it would be inventing
   * behaviour (AAP §0.7.3, AAP §0.7.3) and enhancing beyond what the migration requires (AAP §0.8.2,
   *
   * @returns Every product type in the flat alphabetical order described above, each row carrying
   * the two derived counts. Possibly empty; never null or undefined. The array is a snapshot of
   * one read — nothing here caches it, and nothing here promises that two calls agree.
   */
  findAllForTree(): Promise<ProductTypeTreeRow[]>;

  /**
   * Write one product type — insert when it is transient, update when it is not.
   *
   * @param productType - The product type to write. Mutated when transient: it receives its
   * 32-character identifier, because `model/entity/ProductType.cfc:L52` declares
   * `fieldtype="id" generator="uuid"` — an instruction to the mapping layer to produce the value at
   * save time — and the legacy generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`.
   *
   * @returns The same product type, so the member satisfies `EntityPersister<ProductType>` directly.
   */
  saveProductType(productType: ProductType): Promise<ProductType>;

  /**
   * Remove one product type.
   *
   * @param productType - The product type to remove. Must carry a persistent identifier.
   * @returns Nothing, so the member satisfies `EntityRemover<ProductType>` directly.
   */
  removeProductType(productType: ProductType): Promise<void>;
}
