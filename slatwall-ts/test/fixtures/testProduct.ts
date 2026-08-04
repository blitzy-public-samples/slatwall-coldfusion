/**
 * Merchandise-product test fixture — the data contract of the legacy MXUnit fixture helper.
 *
 * Provenance: TRACEABLE — meta/tests/unit/Helper.cfc:L51-L75, comprising the two fixture members
 * `getTestMerchandiseProduct()` (:L51-L67) and `destroyTestMerchandiseProduct()` (:L69-L75). Every
 * literal in this file is transcribed from that span; none is generated, derived or invented.
 *
 * The label is deliberately scoped. This is contract-traceability, not exercised-coverage. The legacy
 * helper component is instantiated at meta/tests/unit/SlatwallUnitTestBase.cfc:L55 but no legacy test
 * ever invokes either member: the legacy entity tests build their subjects through the product and
 * brand services instead, and meta/tests/unit/IssuesTest.cfc:L55 inlines its own struct. What crosses
 * over is therefore the fixture's declared contract, not a body of coverage this file inherits, and a
 * reader must not conclude that the legacy suite ever exercised this data.
 */

/*
 * Legacy tests were integration tests; target tests are unit tests — BY design
 * meta/tests/unit/SlatwallUnitTestBase.cfc extends the MXUnit test case at :L49, creates the whole
 * FW/1 application at :L52, boots it before every test at :L60 and elevates the acting account to
 * superuser at :L62, then resolves collaborators through the DI/1 container at run time. Every legacy
 * "unit" test consequently stands up the entire application.
 *
 * TODO(parity) D17 — the unscoped `productData` assignment cannot be reproduced
 * meta/tests/unit/Helper.cfc:L53 reads `productData = {` — an assignment carrying no `var` and no
 * scope prefix. In CFML that leaks the variable into the component's shared `variables` scope, so
 * concurrent callers of `getTestMerchandiseProduct()` would contend over one struct. It is the same
 * defect class as the unscoped loop variables at model/service/ProductService.cfc:L73 and :L75 and the
 * instance at model/service/OptionService.cfc:L58, and meta/tests/unit/IssuesTest.cfc:L55 repeats it.
 */

/* The single import this module is permitted, and the only one it needs. */
import { MERCHANDISE_PRODUCT_TYPE_ID } from './productTypes';

/** `productName` of the merchandise fixture — `meta/tests/unit/Helper.cfc:L54`. */
export const TEST_MERCHANDISE_PRODUCT_NAME = 'Test Product';

/** `price` of the merchandise fixture — `meta/tests/unit/Helper.cfc:L55`. */
export const TEST_MERCHANDISE_PRODUCT_PRICE = 100;

/** `productCode` of the merchandise fixture — `meta/tests/unit/Helper.cfc:L56`. */
export const TEST_MERCHANDISE_PRODUCT_CODE = 'TESTPRODUCTXXX';

/**
 * The nested product-type reference carried by the fixture — `meta/tests/unit/Helper.cfc:L57-L59`.
 */
export interface TestMerchandiseProductTypeReference {
  readonly productTypeID: string;
}

/**
 * Shape of the merchandise fixture data — the four fields of `meta/tests/unit/Helper.cfc:L53-L60`
 * and no others.
 */
export interface TestMerchandiseProductData {
  readonly productName: string;
  readonly price: number;
  readonly productCode: string;
  readonly productType: TestMerchandiseProductTypeReference;
}

/** Optional per-call overrides for {@link createTestMerchandiseProductData}. */
export interface TestMerchandiseProductDataOverrides {
  readonly productName?: string;
  readonly price?: number;
  readonly productCode?: string;
  readonly productType?: TestMerchandiseProductTypeReference;
}

/**
 * Build the merchandise-product fixture data — the ported half of
 * `getTestMerchandiseProduct()` (`meta/tests/unit/Helper.cfc:L51-L67`).
 *
 * @param overrides fields to replace on this call. Omit it, or pass `{}`, for the byte-exact
 * legacy defaults.
 *
 * @returns a frozen, independent fixture value.
 *
 * @example
 * ```ts
 * const data = createTestMerchandiseProductData;
 * // data.productName === TEST_MERCHANDISE_PRODUCT_NAME
 * // data.price === 100 (a number)
 * // data.productType.productTypeID (the seeded merchandise identifier)
 * ```
 */
export function createTestMerchandiseProductData(
  overrides: TestMerchandiseProductDataOverrides = {},
): TestMerchandiseProductData {
  /*
   * Defaults first, overrides second, so a supplied field wins. Both the outer object and the
   * nested product-type reference are constructed fresh on every call and then frozen, which
   * makes the returned graph immutable at runtime as well as in the type system — the object
   * is shallow apart from that one nested member, so freezing both is a complete deep freeze.
   */
  const merged = {
    productName: TEST_MERCHANDISE_PRODUCT_NAME,
    price: TEST_MERCHANDISE_PRODUCT_PRICE,
    productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    productType: { productTypeID: MERCHANDISE_PRODUCT_TYPE_ID },
    ...overrides,
  };

  return Object.freeze({
    ...merged,
    productType: Object.freeze({ productTypeID: merged.productType.productTypeID }),
  });
}

/**
 * The two teardown operations of `destroyTestMerchandiseProduct()`
 * (`meta/tests/unit/Helper.cfc:L69-L75`), supplied by the caller.
 */
export interface TestMerchandiseProductTeardownOperations {
  /**
   * Clear the product's default-SKU reference — `meta/tests/unit/Helper.cfc:L70`,
   * `arguments.product.setDefaultSku( javaCast("null", "") );`.
   */
  readonly clearDefaultSkuReference: () => void;

  /** Delete the product — `meta/tests/unit/Helper.cfc:L72`, `entityDelete(arguments.product);`. */
  readonly deleteProduct: () => void;
}

/**
 * Run the fixture teardown in the mandated order — the ported half of
 * `destroyTestMerchandiseProduct()` (meta/tests/unit/Helper.cfc:L69-L75).
 *
 * @param operations the caller's two teardown operations.
 *
 * @example
 * ```ts
 * tearDownTestMerchandiseProduct({
 * clearDefaultSkuReference: => { product.defaultSku = null; },
 * deleteProduct: => products.delete(product.productID),
 * });
 * ```
 */
export function tearDownTestMerchandiseProduct(
  operations: TestMerchandiseProductTeardownOperations,
): void {
  operations.clearDefaultSkuReference();
  operations.deleteProduct();
}
