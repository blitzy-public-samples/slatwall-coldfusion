// Product repository port: the domain-side persistence and query contract for `Product`, plus the
// brand save the brand service reaches through.
//
// Ported from `model/dao/ProductDAO.cfc` (441 lines, cfscript throughout, the largest of the six
// in-scope DAOs).

/**
 * Product repository port - the domain-side persistence and query contract for `Product`.
 *
 * Ported from `model/dao/ProductDAO.cfc` (441 lines, cfscript throughout, the largest of the six
 * in-scope DAOs).
 *
 * Every element of every one of those collections must be bound as its own prepared-statement
 * parameter, and must never be interpolated into SQL text.
 *
 * @see model /dao/ProductDAO.cfc - the ported DAO.
 */

/*
 * The only import this file may have, and it is type-only.
 *
 * `src/domain/entities/product.ts` is on the branch, so this specifier resolves and `tsc` reports
 * nothing.
 *
 * The asymmetry that justifies publishing ports before entities: an entity body actually calls
 * port methods - the legacy locator sites at [model/entity/Product.cfc:L341] and
 * [model/entity/Product.cfc:L367] are exactly those calls.
 */
import type { Product } from '../entities/product.js';

/**
 * One attribute-set row as `getAttributeSets` returns it.
 *
 * This is a READ PROJECTION of the rows that DAO call produces - it is not an `AttributeSet`
 * entity.
 *
 * Requiredness follows one rule, applied uniformly: a member is required only where the legacy
 * declaration or the DAO's own filter guarantees a value - the generated identifier.
 */
export interface AttributeSetSummary {
  /**
   * Generated identifier [model/entity/AttributeSet.cfc:L52].
   */
  readonly attributeSetID: string;

  /**
   * Attribute-set type system code, flattened from `attributeSetType.systemCode`
   * [model/dao/ProductDAO.cfc:L55].
   */
  readonly attributeSetTypeSystemCode: string;

  /**
   * Global flag [model/entity/AttributeSet.cfc:L57]; drives the product-type predicate.
   */
  readonly globalFlag: boolean;

  /**
   * Number of attributes in the set, from `getAttributeCount()`
   * [model/entity/AttributeSet.cfc:L91]. The attributes themselves are not projected.
   */
  readonly attributeCount: number;

  /**
   * Display name [model/entity/AttributeSet.cfc:L54]; nullable in the legacy schema.
   */
  readonly attributeSetName?: string;

  /**
   * Code [model/entity/AttributeSet.cfc:L55]; nullable in the legacy schema.
   */
  readonly attributeSetCode?: string;

  /**
   * Description [model/entity/AttributeSet.cfc:L56]; nullable in the legacy schema.
   */
  readonly attributeSetDescription?: string;

  /**
   * Active flag [model/entity/AttributeSet.cfc:L53]; nullable in the legacy schema.
   */
  readonly activeFlag?: boolean;

  /**
   * Required flag [model/entity/AttributeSet.cfc:L58]; nullable in the legacy schema.
   */
  readonly requiredFlag?: boolean;

  /**
   * Secondary ordering key [model/entity/AttributeSet.cfc:L61]; nullable in the legacy schema.
   */
  readonly sortOrder?: number;
}

// No brand save appears on this port: `src/services/brandService.ts` resolves the unique URL title
// as [model/dao/ProductDAO.cfc:L68-L74] does, writes it into the payload, populates the entity from
// it and enforces the three save-context rules in `model/validation/Brand.json` - all of which the
// brand's own port already carries.

/**
 * The resolved fields a product save populates from before it writes.
 *
 * This type exists because `super.save(entity, data)` took two arguments, and the second one did
 * work.
 *
 * It is not the only channel, and it is not a workaround for a missing setter.
 */
export interface ProductSavePayload {
  /**
   * The resolved URL title [model/service/ProductService.cfc:L269].
   */
  readonly urlTitle?: string | undefined;

  /**
   * The product name [model/entity/Product.cfc:L55], when the caller supplies one.
   */
  readonly productName?: string | undefined;
}
/**
 * A window over a matched row list.
 *
 * Both members are zero-based and counted, matching `ProductQueryCriteria.pageRecordsStart` and
 * `pageRecordsShow` in `src/services/productService.ts`.
 *
 * The adapter is entitled to assume both are non-negative safe integers, because the service
 * checks them - and refuses - before any statement runs.
 */
export interface ProductSearchWindow {
  /**
   * Zero-based index of the first matched row to return.
   */
  readonly start: number;

  /**
   * How many matched rows to return from `start`.
   */
  readonly count: number;
}

/**
 * One matched product row: the two columns [model/dao/ProductDAO.cfc:L421] selects, and nothing
 * else.
 *
 * [model/dao/ProductDAO.cfc:L429-L436] loops the two-column result and builds
 * `result[i] = {"id" = records.productID[i], "value" = records.productName[i]}`.
 *
 * `value` is OPTIONAL because `SwProduct.productName` is a nullable column
 * [model/entity/Product.cfc:L55] and absence is never substituted with an empty string.
 */
export interface ProductSearchRow {
  /**
   * `SwProduct.productID`, the legacy `"id"` key.
   */
  readonly id: string;

  /**
   * `SwProduct.productName`, the legacy `"value"` key; omitted when the column is NULL.
   */
  readonly value?: string;
}

/**
 * What a product search answers.
 */
export interface ProductSearchMatches {
  /**
   * The matched rows: the window when one was supplied, every match otherwise.
   */
  readonly records: readonly ProductSearchRow[];

  /**
   * How many rows matched, before any window was applied.
   */
  readonly matchedCount: number;
}

/**
 * The product repository port.
 *
 * Six methods, locked: the three public functions of `model/dao/ProductDAO.cfc` and the three
 * product entity-lifecycle methods the service tier needs now that Hibernate is gone.
 *
 * The implementing adapter is `src/repositories/mysql/mysqlProductRepository.ts`; the composition
 * root wires it.
 */
export interface ProductRepository {
  /**
   * Attribute sets for a set of attribute-set type system codes, narrowed by product type.
   *
   * @param attributeSetTypeCode Attribute-set type system codes to match; required in the legacy
   * signature.
   * @param productTypeIDs Product-type identifiers to narrow by; required in the legacy signature,
   * and empty means "global sets only" rather than "no filter".
   * @returns The matching attribute-set read projections, in the legacy order.
   */
  getAttributeSets(
    attributeSetTypeCode: readonly string[],
    productTypeIDs: readonly string[],
  ): Promise<AttributeSetSummary[]>;

  /**
   * Bulk product/SKU import from a delimited file.
   *
   * Legacy:
   * `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`
   * [model/dao/ProductDAO.cfc:L73].
   *
   * @param fileURL Location of the delimited file, as the legacy signature names it.
   * @param textQualifier Optional text qualifier; legacy default is the empty string.
   */
  loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void>;

  /**
   * Product search by name fragment, optionally narrowed to a list of product types.
   *
   * @param term Optional name fragment, as the legacy signature names it.
   * @param productTypeIDs Optional comma-delimited product-type identifiers.
   * @param window Optional window applied to the matched rows.
   * @returns The matched rows - windowed when a window was supplied - together with how many
   * matched BEFORE the window, which is the count a paged caller has to publish.
   */
  searchProductsByProductType(
    term?: string,
    productTypeIDs?: string,
    window?: ProductSearchWindow,
  ): Promise<ProductSearchMatches>;

  /**
   * Load one product by its identifier.
   *
   * @param productID Identifier of the product to load.
   * @returns The materialized product, or `undefined` when there is none.
   */
  getProductByProductID(productID: string): Promise<Product | undefined>;

  /**
   * Persist one product.
   *
   * Generation and validation remain at the service tier: the adapter derives no title and
   * enforces no rule.
   *
   * @param product The product to persist.
   * @param data The resolved payload to populate from before writing.
   * @returns The persisted product, carrying the populated column values.
   */
  saveProduct(product: Product, data: ProductSavePayload): Promise<Product>;

  /**
   * Delete one product.
   *
   * This method name has no legacy antecedent on the DAO; deletion ran through the ORM as
   * `super.delete(...)` [model/service/ProductService.cfc:L326].
   *
   * @param product The product to delete.
   * @returns True when the product was deleted, false when it was not.
   */
  deleteProduct(product: Product): Promise<boolean>;
}
