/**
 * Product and product-type persistence — DATA-03.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/adapters/mysql/MySqlProductPersistence.ts` and the four `src/services/ProductService.ts` seams it
 * fills.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The reported finding had two halves, and they failed for unrelated reasons:
 *
 *   READ  — `ProductService.getProduct` answered a product with no `productType`, no `defaultSku`, no
 *           `brand` and no `skus`, because the smart-list builder projects `<baseAlias>.*` and
 *           `rowMappers.ts` RULE 3 leaves every many-to-one GENUINELY ABSENT by design.
 *   WRITE — the service declares `persistProduct` plus two composed base services and implements every
 *           member against them, but NOTHING in `src/` supplied a production implementation of any of
 *           the four capabilities behind them. A composition root could not have wired a working
 *           product flow without inventing SQL at the wiring site.
 *
 * The read half is now closed by `src/adapters/mysql/catalogAggregates.ts`; the cases at the end of
 * this file assert it THROUGH the real service rather than through the builder alone, because
 * "`getProduct` returns a scalar Product" is a statement about the service's answer.
 *
 * The write half is closed by the adapter under test. The statement-level cases assert what reaches the
 * driver; the seam cases assert that a real `ProductService` wired to the real adapter actually writes.
 *
 * ⚠️ THE ASSIGNABILITY OF ALL FOUR MEMBERS IS PROVEN HERE RATHER THAN IN THE ADAPTER. The adapter does
 * not import `EntityPersister` or `EntityRemover`, because an adapter that reached up into the service
 * layer's type surface would invert the dependency direction the hexagonal separation exists to fix
 * (AAP §0.7.3 S4). A test file is under no such constraint, so the four bindings below are where a
 * signature drift becomes a compile error.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, which is how the sibling
 * adapter suites work and what AAP 0.7.3 standard 6 requires here: no CFML runtime exists and the `Sw*`
 * tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no `ProductServiceTest` exists
 * and that no data-access test exists for this slice at all. `meta/tests/unit/IssuesTest.cfc:L51-L71`
 * (`issue_1097`) populates, saves and deletes a product with a nested product-type struct and is
 * TRACEABLE for the BEHAVIOUR these cases assert, but it asserts no statement, because no legacy
 * statement for either table exists — both entities were saved and deleted through the surface
 * `org/Hibachi/HibachiService.cfc:L255-L281` fabricated by prefix (IR-1).
 */
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/catalogAggregates';
import type { ExactDecimal } from '../../src/util/formatting';
import { toExactDecimal } from '../../src/util/formatting';
import { MySqlProductPersistence } from '../../src/adapters/mysql/MySqlProductPersistence';
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { Brand } from '../../src/domain/product/Brand';
import { PRODUCT_PROPERTY_DESCRIPTORS, Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import type { ManagedEntity } from '../../src/domain/base/populate';
import { Sku } from '../../src/domain/sku/Sku';
import { DataIntegrityError } from '../../src/errors/DomainError';
import { ProductService } from '../../src/services/ProductService';
import {
  createAccountContextDouble,
  createPopulationAuthorizationDouble,
  createSettingResolverDouble,
  createUrlTitleAvailabilityDouble,
} from '../support/inMemoryRepositories';

import type { UrlTitleTableName } from '../support/inMemoryRepositories';

import type {
  ProductDependencyCleanup,
  ProductPersistenceExecutor,
} from '../../src/adapters/mysql/MySqlProductPersistence';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type { EntityPersister, EntityRemover } from '../../src/services/BaseService';

/**
 * A collaborator this scenario never reaches needs no behaviour, and giving it one would suggest the
 * case depends on it. Same discipline as `test/services/SkuService.test.ts`.
 */
const UNREACHED_COLLABORATOR = {} as never;

/** Distinct 32-character identifiers, so a crossed binding is visible rather than coincidental. */
const ID = {
  product: 'aaaaaaaa000000000000000000000001',
  productType: 'bbbbbbbb000000000000000000000001',
  parentProductType: 'bbbbbbbb000000000000000000000002',
  brand: 'cccccccc000000000000000000000001',
  defaultSku: 'dddddddd000000000000000000000001',
  otherSku: 'dddddddd000000000000000000000002',
} as const;

/**
 * The URL-title availability probe, shared by every scenario that constructs a service.
 *
 * Declared once at module level because it holds no per-case state worth isolating: nothing below seeds
 * a collision, so every candidate is reported available and the derivation terminates on its first
 * attempt.
 */
const urlTitleProbe = createUrlTitleAvailabilityDouble();

/** One statement, as the driver saw it. */
interface Statement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** The recorded journal plus the executor that fills it. */
interface Journal {
  readonly statements: Statement[];
}

/**
 * A recording executor.
 *
 * `execute` answers with whatever rows the caller seeded for the table the statement reads, and
 * `executeMutation` answers with a configurable affected-row count — configurable BECAUSE the update
 * path must be shown not to read it.
 */
function makeExecutor(
  rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
  affectedRows = 1,
): { readonly executor: ProductPersistenceExecutor; readonly journal: Journal } {
  const journal: Journal = { statements: [] };

  const executor: ProductPersistenceExecutor = {
    execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      journal.statements.push({ sql, params: [...params] });

      const table = Object.keys(rowsByTable).find((name) =>
        new RegExp(`FROM ${name}\\b`).test(sql),
      );

      return Promise.resolve(table === undefined ? [] : [...(rowsByTable[table] ?? [])]);
    },
    executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
      journal.statements.push({ sql, params: [...params] });
      return Promise.resolve(affectedRows);
    },
  };

  return { executor, journal };
}

/** A cleanup collaborator that records the identifiers it was asked to clear. */
function makeCleanup(): {
  readonly cleanup: ProductDependencyCleanup;
  readonly productIds: string[];
  readonly productTypeIds: string[];
} {
  const productIds: string[] = [];
  const productTypeIds: string[] = [];

  return {
    productIds,
    productTypeIds,
    cleanup: {
      removeProductDependencies: (productID: string): Promise<void> => {
        productIds.push(productID);
        return Promise.resolve();
      },
      removeProductTypeDependencies: (productTypeID: string): Promise<void> => {
        productTypeIds.push(productTypeID);
        return Promise.resolve();
      },
    },
  };
}

/**
 * Reads the identifier of a default-SKU delegate.
 *
 * The delegate in these cases is a wrapper closing over a `Sku`, exactly as `src/domain/sku/Sku.ts`
 * records: `Sku` is DELIBERATELY not assignable to `ProductDefaultSkuDelegate`, so the value in
 * `Product.defaultSku` is never the entity itself and an `instanceof Sku` test against it is false.
 */
function makeDefaultSkuDelegate(skuID: string): {
  readonly delegate: ProductDefaultSkuDelegate;
  readonly skuID: string;
} {
  return {
    skuID,
    delegate: {
      getCurrencyCode: (): string | undefined => undefined,
      getPrice: (): ExactDecimal | undefined => undefined,
      getRenewalPrice: (): ExactDecimal | undefined => undefined,
      getListPrice: (): ExactDecimal | undefined => undefined,
      getImageDirectory: (): string => '',
      getImagePath: (): string => '',
      getImage: (): string => '',
      getResizedImagePath: (): string => '',
      getImageExistsFlag: (): boolean => false,
    },
  };
}

/** The delegate-to-identifier map these cases inject, keyed by delegate object identity. */
function makeDefaultSkuIdReader(): {
  readonly read: (defaultSku: object) => string;
  register(delegate: ProductDefaultSkuDelegate, skuID: string): void;
} {
  const identifiers = new Map<object, string>();

  return {
    register: (delegate: ProductDefaultSkuDelegate, skuID: string): void => {
      identifiers.set(delegate, skuID);
    },
    read: (defaultSku: object): string => identifiers.get(defaultSku) ?? '',
  };
}

/** The adapter under test, with everything it needs recorded. */
function makeAdapter(
  rowsByTable: Readonly<Record<string, readonly MySqlRow[]>> = {},
  affectedRows = 1,
): {
  readonly adapter: MySqlProductPersistence;
  readonly journal: Journal;
  readonly cleanup: ReturnType<typeof makeCleanup>;
  readonly defaultSkuIds: ReturnType<typeof makeDefaultSkuIdReader>;
} {
  const { executor, journal } = makeExecutor(rowsByTable, affectedRows);
  const cleanup = makeCleanup();
  const defaultSkuIds = makeDefaultSkuIdReader();

  return {
    journal,
    cleanup,
    defaultSkuIds,
    adapter: new MySqlProductPersistence(executor, cleanup.cleanup, defaultSkuIds.read),
  };
}

/** A saved product carrying all three of its many-to-one associations. */
function savedProduct(): Product {
  const product = new Product();
  product.productID = ID.product;
  product.productName = 'Feed Product';
  product.productCode = 'FP-1';
  product.urlTitle = 'feed-product';
  product.activeFlag = true;
  product.publishedFlag = true;

  const brand = new Brand();
  brand.brandID = ID.brand;
  product.brand = brand;

  const productType = new ProductType();
  productType.productTypeID = ID.productType;
  product.productType = productType;

  return product;
}

/** A saved product type carrying its self-referencing parent. */
function savedProductType(): ProductType {
  const productType = new ProductType();
  productType.productTypeID = ID.productType;
  productType.productTypeName = 'Merchandise';
  productType.urlTitle = 'merchandise';
  productType.productTypeIDPath = `${ID.parentProductType},${ID.productType}`;

  const parent = new ProductType();
  parent.productTypeID = ID.parentProductType;
  productType.parentProductType = parent;

  return productType;
}

/** Every statement whose text matches, in journal order. */
function matching(journal: Journal, pattern: RegExp): readonly Statement[] {
  return journal.statements.filter((statement) => pattern.test(statement.sql));
}

/* =================================================================================================
 * THE `SwProduct` WRITE PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the SwProduct write path (DATA-03)', () => {
  it('NET-NEW — a transient product is INSERTed with a freshly minted 32-character identifier', async () => {
    const { adapter, journal } = makeAdapter();
    const product = new Product();
    product.productName = 'New Product';

    // `model/entity/Product.cfc:L52` declares `unsavedvalue=""`, which is what `isNew()` tests.
    expect(product.isNew()).toBe(true);

    await adapter.saveProduct(product);

    // IR-6: 32 lowercase hexadecimal characters, no dashes, never an auto-increment.
    expect(product.productID).toMatch(/^[0-9a-f]{32}$/);
    expect(product.isNew()).toBe(false);

    const inserts = matching(journal, /^INSERT INTO SwProduct/);
    expect(inserts).toHaveLength(1);
    // The identifier is bound FIRST, matching the column list's own ordering.
    expect(inserts[0]?.params[0]).toBe(product.productID);
  });

  it('NET-NEW — the insert names every SwProduct column and binds one value per column', async () => {
    const { adapter, journal } = makeAdapter();

    await adapter.saveProduct(new Product());

    const insert = matching(journal, /^INSERT INTO SwProduct/)[0];
    const columnList = /\(([^)]*)\) VALUES/.exec(insert?.sql ?? '')?.[1] ?? '';
    const columns = columnList.split(', ');

    // Twenty columns: the primary key plus the nineteen writable ones. `model/entity/Product.cfc`
    // declares eight scalars (:L52-L59), four persisted calculated columns (:L62-L65), three
    // many-to-one foreign keys (:L68-L70), a remote identifier (:L93) and four audit members
    // (:L96-L99). Its twenty NON-persistent properties (:L102-L123) are not columns and are absent.
    expect(columns).toHaveLength(20);
    expect(columns).toContain('productID');
    expect(columns).toContain('calculatedTitle');
    expect(columns).toContain('brandID');
    expect(columns).toContain('productTypeID');
    expect(columns).toContain('defaultSkuID');
    // The crossed audit pairing: the COLUMNS carry the `ID` suffix, the fields do not.
    expect(columns).toContain('createdByAccountID');
    expect(columns).toContain('modifiedByAccountID');
    // A non-persistent property must never appear as a column.
    expect(columns).not.toContain('price');
    expect(columns).not.toContain('optionGroups');

    expect(insert?.params).toHaveLength(columns.length);
  });

  it('NET-NEW — the three foreign keys come from the ASSOCIATION OBJECTS, not from scalars', async () => {
    // "Preserve association identity" in practice: `rowMappers.ts` RULE 3 leaves every many-to-one
    // absent, so there is no `product.brandID` field anywhere in the domain to copy out. A stale
    // scalar cannot drift out of step with the graph because no stale scalar exists.
    const { adapter, journal, defaultSkuIds } = makeAdapter();
    const product = savedProduct();
    const { delegate } = makeDefaultSkuDelegate(ID.defaultSku);
    product.defaultSku = delegate;
    defaultSkuIds.register(delegate, ID.defaultSku);

    await adapter.saveProduct(product);

    const update = matching(journal, /^UPDATE SwProduct SET/)[0];
    expect(update?.params).toContain(ID.brand);
    expect(update?.params).toContain(ID.productType);
    // The default SKU arrives through the INJECTED READER, because the delegate exposes no
    // identifier accessor — `src/domain/sku/Sku.ts` mismatch M-ii.
    expect(update?.params).toContain(ID.defaultSku);
  });

  it('NET-NEW — a saved product is UPDATEd with the primary key bound LAST and no identifier minted', async () => {
    const { adapter, journal } = makeAdapter();
    const product = savedProduct();

    await adapter.saveProduct(product);

    // The identity is the entity's own answer, not a probe's: no existence read is issued.
    expect(matching(journal, /^SELECT/)).toHaveLength(0);
    expect(product.productID).toBe(ID.product);

    const updates = matching(journal, /^UPDATE SwProduct SET/);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.sql).toContain('WHERE productID = ?');
    // Nineteen assignments plus the key: the key is the LAST bound value, matching its position in
    // the statement text.
    expect(updates[0]?.params).toHaveLength(20);
    expect(updates[0]?.params[19]).toBe(ID.product);
  });

  it('NET-NEW — the update path does NOT read the affected-row count', async () => {
    // Measured against MySQL 8.4.11 through mysql2 3.23.2: re-saving unchanged data reports 1 with
    // `CLIENT_FOUND_ROWS` and 0 without, and `src/config/database.ts` pins no capability flags. So a
    // zero count must NOT be treated as a failure — otherwise correctness would depend on an
    // unpinned connection negotiation detail.
    const { adapter } = makeAdapter({}, 0);
    const product = savedProduct();

    await expect(adapter.saveProduct(product)).resolves.toBe(product);
  });

  it('NET-NEW — an absent field binds as SQL null rather than being omitted', async () => {
    // The domain expresses a legacy null by the ABSENCE of a property. A bind position cannot express
    // absence, so the translation happens exactly at this seam and nowhere earlier. Omitting the
    // column instead would let the database apply a default, which is a different outcome.
    const { adapter, journal } = makeAdapter();
    const product = new Product();
    product.productName = 'Sparse';

    await adapter.saveProduct(product);

    const insert = matching(journal, /^INSERT INTO SwProduct/)[0];
    expect(insert?.params).toContain(null);
    expect(insert?.params).toContain('Sparse');
    // Absence never reaches the driver as `undefined`.
    expect(insert?.params).not.toContain(undefined);
  });

  it('NET-NEW — no value is ever interpolated into statement text', async () => {
    // The structural reason the D18 class of flaw cannot occur here: the statement text is a function
    // of the whitelist alone.
    const { adapter, journal } = makeAdapter();
    const product = savedProduct();
    product.productName = "Bobby'); DROP TABLE SwProduct;--";

    await adapter.saveProduct(product);

    for (const statement of journal.statements) {
      expect(statement.sql).not.toContain('DROP TABLE');
      expect(statement.sql).not.toContain('Bobby');
    }
  });
});

/* =================================================================================================
 * THE `SwProductType` WRITE PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the SwProductType write path (DATA-03)', () => {
  it('NET-NEW — a transient product type is INSERTed with a minted identifier and all fourteen columns', async () => {
    const { adapter, journal } = makeAdapter();
    const productType = new ProductType();
    productType.productTypeName = 'Merchandise';

    await adapter.saveProductType(productType);

    expect(productType.productTypeID).toMatch(/^[0-9a-f]{32}$/);

    const insert = matching(journal, /^INSERT INTO SwProductType/)[0];
    const columns = (/\(([^)]*)\) VALUES/.exec(insert?.sql ?? '')?.[1] ?? '').split(', ');

    // Fourteen: eight scalars (`model/entity/ProductType.cfc:L52-L59`), the self-referencing foreign
    // key (:L62), a remote identifier (:L80) and four audit members (:L83-L86).
    expect(columns).toHaveLength(14);
    expect(columns).toContain('productTypeID');
    expect(columns).toContain('productTypeIDPath');
    expect(columns).toContain('systemCode');
    expect(columns).toContain('parentProductTypeID');
    expect(insert?.params).toHaveLength(14);
  });

  it('NET-NEW — the parent key comes from the self-referencing association object', async () => {
    const { adapter, journal } = makeAdapter();

    await adapter.saveProductType(savedProductType());

    const update = matching(journal, /^UPDATE SwProductType SET/)[0];
    expect(update?.sql).toContain('WHERE productTypeID = ?');
    expect(update?.params).toContain(ID.parentProductType);
    // The key is bound last; the parent key is one of the thirteen assignments before it.
    expect(update?.params[13]).toBe(ID.productType);
  });

  it('NET-NEW — productTypeIDPath is written as held and is NOT derived at this boundary', async () => {
    // `model/entity/ProductType.cfc:L53` declares it a plain persistent column and
    // `model/service/ProductService.cfc:L294-L310` never recomputes it on save. Deriving it here
    // would add behaviour the legacy save path does not have (AAP §0.7.3 S9).
    const { adapter, journal } = makeAdapter();
    const productType = savedProductType();
    const held = productType.productTypeIDPath;

    await adapter.saveProductType(productType);

    expect(productType.productTypeIDPath).toBe(held);
    expect(matching(journal, /^UPDATE SwProductType SET/)[0]?.params[0]).toBe(held);
  });
});

/* =================================================================================================
 * THE PRODUCT REMOVAL PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the product removal path (DATA-03)', () => {
  /** A product whose two SKU rows the cascade will find. */
  function productWithSkus(): Readonly<Record<string, readonly MySqlRow[]>> {
    return { SwSku: [{ skuID: ID.defaultSku }, { skuID: ID.otherSku }] };
  }

  it('NET-NEW — the six steps run in the legacy order, with the SKU cascade before the product row', async () => {
    const { adapter, journal, cleanup } = makeAdapter(productWithSkus());

    await adapter.deleteProduct(savedProduct());

    const shapes = journal.statements.map((statement) =>
      statement.sql.replace(/\s+/g, ' ').slice(0, 46),
    );

    // Step 2 first: the self-reference must be broken before either row can go.
    expect(shapes[0]).toContain('UPDATE SwProduct SET defaultSkuID = NULL');
    // Step 4 next — step 3 is the collaborator, which issues no statement of its own here.
    expect(shapes[1]).toContain('DELETE FROM SwRelatedProduct');
    // Step 5: read the identifiers, clear the four link tables, then the SKU rows.
    expect(shapes[2]).toContain('SELECT skuID FROM SwSku');
    expect(shapes[3]).toContain('DELETE FROM SwSkuOption');
    expect(shapes[4]).toContain('DELETE FROM SwSkuAccessContent');
    expect(shapes[5]).toContain('DELETE FROM SwSkuSubsBenefit');
    expect(shapes[6]).toContain('DELETE FROM SwSkuRenewalSubsBenefit');
    expect(shapes[7]).toContain('DELETE FROM SwSku WHERE');
    // Step 6 last.
    expect(shapes[8]).toContain('DELETE FROM SwProduct WHERE');
    expect(shapes).toHaveLength(9);

    // Step 3 ran, and ran BEFORE the product row went — `org/Hibachi/HibachiService.cfc:L61`
    // precedes `:L64`.
    expect(cleanup.productIds).toEqual([ID.product]);
  });

  it('NET-NEW — all FOUR SKU link tables are cleared, not just the option one', async () => {
    // Leaving three out would leave orphan link rows pointing at a `skuID` that no longer exists,
    // which no error anywhere would report. `model/entity/Sku.cfc:L76-L79` declares all four.
    const { adapter, journal } = makeAdapter(productWithSkus());

    await adapter.deleteProduct(savedProduct());

    for (const table of [
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
    ]) {
      const statements = matching(journal, new RegExp(`^DELETE FROM ${table} WHERE skuID IN`));
      expect(statements).toHaveLength(1);
      // One placeholder per identifier, each value bound rather than interpolated.
      expect(statements[0]?.sql).toContain('IN (?, ?)');
      expect(statements[0]?.params).toEqual([ID.defaultSku, ID.otherSku]);
    }
  });

  it('NET-NEW — SwRelatedProduct is cleared on the OWNER side only', async () => {
    // `model/entity/Product.cfc:L81` carries NO `inverse="true"`, so this product owns the rows whose
    // `productID` is its own and does not own the rows whose `relatedProductID` is.
    // `org/Hibachi/HibachiEntity.cfc:L277` iterates only this entity's own collection, so the legacy
    // left the reverse rows too. Widening the predicate would remove rows the legacy keeps.
    const { adapter, journal } = makeAdapter(productWithSkus());

    await adapter.deleteProduct(savedProduct());

    const statements = matching(journal, /^DELETE FROM SwRelatedProduct/);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain('WHERE productID = ?');
    expect(statements[0]?.sql).not.toContain('relatedProductID');
    expect(statements[0]?.params).toEqual([ID.product]);
  });

  it('NET-NEW — a product with no SKUs issues no SKU statement at all', async () => {
    // An empty identifier list would compose `IN ()`, which is a syntax error rather than an empty
    // match — the same rule `catalogAggregates.ts` records for its loaders.
    const { adapter, journal } = makeAdapter({ SwSku: [] });

    await adapter.deleteProduct(savedProduct());

    expect(matching(journal, /IN \(\)/)).toHaveLength(0);
    expect(matching(journal, /^DELETE FROM SwSku\b/)).toHaveLength(0);
    expect(matching(journal, /^DELETE FROM SwSkuOption/)).toHaveLength(0);
    // The product itself still goes.
    expect(matching(journal, /^DELETE FROM SwProduct WHERE/)).toHaveLength(1);
  });

  it('NET-NEW — a transient product is refused and NOTHING is issued', async () => {
    // Every statement would be keyed on `''`, a predicate that matches nothing in a sound table and
    // an arbitrary row in an unsound one. The mapping layer would have raised on the same input.
    const { adapter, journal, cleanup } = makeAdapter();

    await expect(adapter.deleteProduct(new Product())).rejects.toBeInstanceOf(DataIntegrityError);

    expect(journal.statements).toHaveLength(0);
    expect(cleanup.productIds).toHaveLength(0);
  });

  it('NET-NEW — a SKU row with an unusable identifier is refused rather than skipped', async () => {
    // Skipping it would leave that SKU's link rows behind AND then fail the product removal on a
    // foreign-key constraint, with nothing anywhere naming the cause.
    const { adapter } = makeAdapter({ SwSku: [{ skuID: 42 }] });

    await expect(adapter.deleteProduct(savedProduct())).rejects.toBeInstanceOf(DataIntegrityError);
  });
});

/* =================================================================================================
 * THE PRODUCT-TYPE REMOVAL PATH
 * ============================================================================================== */

describe('MySqlProductPersistence — the product-type removal path (DATA-03)', () => {
  it('NET-NEW — the excluded-family rows are cleared before the product-type row', async () => {
    const { adapter, journal, cleanup } = makeAdapter();

    await adapter.deleteProductType(savedProductType());

    expect(cleanup.productTypeIds).toEqual([ID.productType]);
    const statements = matching(journal, /^DELETE FROM SwProductType/);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.params).toEqual([ID.productType]);
  });

  it('NET-NEW — no cascade is attempted over products or child product types', async () => {
    // Not an omission: `model/validation/ProductType.json` bounds BOTH at `maxCollection 0` for the
    // delete context, so a product type carrying either is refused before any removal is attempted
    // and the `cascade="all"` at `model/entity/ProductType.cfc:L65-L66` is unreachable. Implementing
    // it would add behaviour the legacy cannot reach.
    const { adapter, journal } = makeAdapter();

    await adapter.deleteProductType(savedProductType());

    expect(matching(journal, /DELETE FROM SwProduct\b/)).toHaveLength(0);
    expect(matching(journal, /parentProductTypeID/)).toHaveLength(0);
    expect(journal.statements).toHaveLength(1);
  });

  it('NET-NEW — a transient product type is refused and NOTHING is issued', async () => {
    const { adapter, journal, cleanup } = makeAdapter();

    await expect(adapter.deleteProductType(new ProductType())).rejects.toBeInstanceOf(
      DataIntegrityError,
    );

    expect(journal.statements).toHaveLength(0);
    expect(cleanup.productTypeIds).toHaveLength(0);
  });
});

/* =================================================================================================
 * THE FOUR SEAMS — THE FINDING'S ACTUAL CLAIM
 * ============================================================================================== */

describe('the four ProductService seams the adapter fills (DATA-03)', () => {
  it('NET-NEW — all four members satisfy the service layer\u2019s persister and remover contracts', () => {
    // ⚠️ THIS IS A COMPILE-TIME ASSERTION WEARING A RUNTIME COAT. The adapter deliberately does not
    // import these two function types (S4 — an adapter must not reach up into the service layer), so
    // the assignability is unproven inside it. Binding all four here makes a signature drift a
    // compile error in this suite rather than a run-time surprise at the wiring site.
    const { adapter } = makeAdapter();

    const persistProduct: EntityPersister<Product> = (product) => adapter.saveProduct(product);
    const removeProduct: EntityRemover<Product> = (product) => adapter.deleteProduct(product);
    const persistProductType: EntityPersister<ProductType> = (productType) =>
      adapter.saveProductType(productType);
    const removeProductType: EntityRemover<ProductType> = (productType) =>
      adapter.deleteProductType(productType);

    expect([persistProduct, removeProduct, persistProductType, removeProductType]).toHaveLength(4);
  });

  /**
   * A real `ProductService` wired to the real adapter for exactly the seams a scenario reaches.
   *
   * Everything else is `UNREACHED_COLLABORATOR`: `getProduct` touches only the query port, and the
   * three write members below touch only the collaborators named here. A collaborator that is never
   * called needs no behaviour, and giving it one would suggest these cases depend on it.
   */
  function makeService(
    adapter: MySqlProductPersistence,
    smartListQueryPort: ProductService['smartListQueryPort'] = UNREACHED_COLLABORATOR,
  ): ProductService {
    return new ProductService({
      productRepository: UNREACHED_COLLABORATOR,
      skuRepository: UNREACHED_COLLABORATOR,
      skuService: UNREACHED_COLLABORATOR,
      optionService: UNREACHED_COLLABORATOR,
      /* `ProductBaseService` is `Pick<BaseService<Product, …>, 'delete'>`. The real base service's
       * delete runs the delete-context rules and then its `remove` collaborator; what matters to
       * DATA-03 is that the collaborator it would call is the real adapter, so the seam is exercised
       * with the real statements rather than with a recorder. */
      baseService: {
        delete: async (product: Product): Promise<boolean> => {
          await adapter.deleteProduct(product);
          return true;
        },
      },
      /* `ProductTypeBaseService` is `Pick<BaseService<ProductType, …>, 'save'>`, whose contract
       * populates, validates and then persists. The persistence step is the real adapter. */
      productTypeBaseService: {
        /* ⚠️ TYPED OVER `ManagedEntity<ProductType>`, NOT OVER A BARE `ProductType`, AND THE REASON IS
         * F22 ON `src/domain/product/ProductType.ts`. `BaseService.save` is declared over the managed
         * form, and this entity DELIBERATELY does not declare the seven managed-entity members as class
         * methods — `manageEntity` attaches them, which is what `rowMappers.ts` already does to every
         * hydrated product type. A bare `ProductType` is therefore NOT assignable to the slot, and
         * widening the double here is the honest fix rather than reinstating methods the domain module
         * decided against. `MySqlProductPersistence.saveProductType` returns THE SAME INSTANCE on both
         * of its branches, so forwarding the argument back preserves the identity the contract promises
         * while keeping the managed type. */
        save: async (
          productType: ManagedEntity<ProductType>,
          data?: Record<string, unknown>,
        ): Promise<ManagedEntity<ProductType>> => {
          const urlTitle = data?.['urlTitle'];
          if (typeof urlTitle === 'string') {
            productType.urlTitle = urlTitle;
          }
          await adapter.saveProductType(productType);
          return productType;
        },
      },
      validator: {
        validate: () => Promise.resolve({ getErrors: () => ({}) }),
        validateProcess: UNREACHED_COLLABORATOR,
      } as never,
      settings: createSettingResolverDouble({ fallback: '' }).resolver,
      accountContext: createAccountContextDouble().accountContext,
      smartListQueryPort,
      subscriptionTermPort: UNREACHED_COLLABORATOR,
      productTypeRootResolver: (() => undefined) as never,
      productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
      /* `UniqueValueProbe` takes the table name as a plain string, exactly as
       * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
       * The double's own probe narrows that first parameter to its table union, so it is adapted here
       * rather than the utility's contract being widened. */
      isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
        urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
      persistProduct: (product: Product) => adapter.saveProduct(product),
      /* Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
       * calls. Made LOUD rather than plausible: a reader answering `''` would let a case pass while
       * silently resolving the wrong SKU. */
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
    });
  }

  it('NET-NEW — ProductService.saveProduct now reaches SwProduct through the real persister', async () => {
    // The finding, restated: before this adapter existed, `persistProduct` had no production
    // implementation, so this path could not write anything at all.
    const { adapter, journal } = makeAdapter();
    const service = makeService(adapter);
    const product = savedProduct();

    const saved = await service.saveProduct(product, { productName: 'Renamed' });

    expect(saved).toBe(product);
    expect(matching(journal, /^UPDATE SwProduct SET/)).toHaveLength(1);
    // Population ran first, so the payload's value is what reached the driver.
    expect(matching(journal, /^UPDATE SwProduct SET/)[0]?.params).toContain('Renamed');
  });

  it('NET-NEW — ProductService.deleteProduct now removes the rows through the real remover', async () => {
    const { adapter, journal } = makeAdapter({ SwSku: [{ skuID: ID.defaultSku }] });
    const service = makeService(adapter);
    const product = savedProduct();
    const { delegate } = makeDefaultSkuDelegate(ID.defaultSku);
    product.defaultSku = delegate;

    await expect(service.deleteProduct(product)).resolves.toBe(true);

    // `:L323` clears the relationship in memory; the adapter's step 2 is what makes the stored
    // column agree, because this port has no flush.
    expect(product.defaultSku).toBeUndefined();
    expect(matching(journal, /^UPDATE SwProduct SET defaultSkuID = NULL/)).toHaveLength(1);
    expect(matching(journal, /^DELETE FROM SwProduct WHERE/)).toHaveLength(1);
    expect(matching(journal, /^DELETE FROM SwSku WHERE/)).toHaveLength(1);
  });

  it('NET-NEW — ProductService.saveProductType now reaches SwProductType through the real persister', async () => {
    const { adapter, journal } = makeAdapter();
    const service = makeService(adapter);
    const productType = new ProductType();

    await service.saveProductType(productType, { productTypeName: 'Merchandise' });

    // A transient type takes the insert path and is minted here and only here.
    expect(productType.productTypeID).toMatch(/^[0-9a-f]{32}$/);
    expect(matching(journal, /^INSERT INTO SwProductType/)).toHaveLength(1);
    // `:L297` writes the derived title INTO THE PAYLOAD, and it only reaches the entity because the
    // base service populates from that same struct.
    expect(matching(journal, /^INSERT INTO SwProductType/)[0]?.params).toContain('merchandise');
  });
});

/* =================================================================================================
 * THE READ HALF — `getProduct` MUST ANSWER AN AGGREGATE
 * ============================================================================================== */

describe('ProductService.getProduct returns a materialised aggregate (DATA-03)', () => {
  /** A product row plus every row its associations need. */
  const READ_TABLES: Readonly<Record<string, readonly MySqlRow[]>> = {
    SwProduct: [
      {
        productID: ID.product,
        productName: 'Feed Product',
        productCode: 'FP-1',
        productTypeID: ID.productType,
        brandID: ID.brand,
        defaultSkuID: ID.defaultSku,
      },
    ],
    SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
    SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
    /* ⚠️ THE MONEY COLUMN IS A STRING, NOT A NUMBER, AND THAT IS THE DRIVER CONTRACT RATHER THAN A
     * FIXTURE QUIRK. `model/entity/Sku.cfc:L56` declares `price` `ormtype="big_decimal"`, and
     * `rowMappers.ts` reads it through the exact-decimal reader, which REFUSES a JavaScript number
     * because by the time one arrives the exact digits are already gone (F16). */
    SwSku: [
      { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
      { skuID: ID.otherSku, skuCode: 'SKU-2', price: '20.00', productID: ID.product },
    ],
  };

  /**
   * An executor that HONOURS BOTH `WHERE <column> IN (…)` AND `WHERE <alias>.<column> = ?`.
   *
   * ⚠️ IT HAS TO HONOUR THE `IN` FORM. Two different statements read `SwSku` on this path — the aggregate
   * loader's product-scoped collection read and its default-SKU lookup by identifier — and a double that
   * answered both with the same rows would hand the lookup rows it never asked for.
   *
   * ⚠️ IT HAS TO HONOUR THE EQUALITY FORM TOO, and for a sharper reason: `getProduct` is a primary-key
   * lookup expressed as a single-filter dynamic query, which the builder compiles to
   * `WHERE ((<alias>.productID = ?))`. A double that ignored that predicate would answer EVERY
   * identifier with the seeded row, so the case asserting that an unmatched identifier yields `null`
   * could never fail and would be asserting nothing at all.
   */
  function readExecutor(): ProductService['smartListQueryPort'] {
    const executor = {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: 1 }]);
        }

        const table = Object.keys(READ_TABLES).find((name) =>
          new RegExp(`FROM ${name}\\b`).test(sql),
        );
        if (table === undefined) {
          return Promise.resolve([]);
        }
        const rows = READ_TABLES[table] ?? [];

        const inFilter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
        const inColumn = inFilter?.[1];
        if (inColumn !== undefined) {
          return Promise.resolve(rows.filter((row) => params.includes(row[inColumn])));
        }

        /* The builder's own filter form. The first bound value is the filter's, because the paging
         * placeholders are appended after the WHERE parameters. */
        const equalityFilter = /WHERE \(+(?:\w+\.)?(\w+) = \?/.exec(sql);
        const equalityColumn = equalityFilter?.[1];
        if (equalityColumn !== undefined) {
          return Promise.resolve(rows.filter((row) => row[equalityColumn] === params[0]));
        }

        return Promise.resolve([...rows]);
      },
    };

    return new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders({
        bindDefaultSkuDelegate: (sku: Sku): ProductDefaultSkuDelegate => ({
          getCurrencyCode: (): string | undefined => undefined,
          getPrice: (): ExactDecimal | undefined => sku.price,
          getRenewalPrice: (): ExactDecimal | undefined => undefined,
          getListPrice: (): ExactDecimal | undefined => undefined,
          getImageDirectory: (): string => '',
          getImagePath: (): string => '',
          getImage: (): string => '',
          getResizedImagePath: (): string => '',
          getImageExistsFlag: (): boolean => false,
        }),
      }),
    );
  }

  /** The same service shape as above, with only the query port live. */
  function readService(): ProductService {
    const { adapter } = makeAdapter();
    return new ProductService({
      productRepository: UNREACHED_COLLABORATOR,
      skuRepository: UNREACHED_COLLABORATOR,
      skuService: UNREACHED_COLLABORATOR,
      optionService: UNREACHED_COLLABORATOR,
      baseService: UNREACHED_COLLABORATOR,
      productTypeBaseService: UNREACHED_COLLABORATOR,
      validator: UNREACHED_COLLABORATOR,
      settings: createSettingResolverDouble({ fallback: '' }).resolver,
      accountContext: createAccountContextDouble().accountContext,
      smartListQueryPort: readExecutor(),
      subscriptionTermPort: UNREACHED_COLLABORATOR,
      productTypeRootResolver: (() => undefined) as never,
      productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
      /* `UniqueValueProbe` takes the table name as a plain string, exactly as
       * `model/service/DataService.cfc:L53` declares `createUniqueURLTitle(titleString, tableName)`.
       * The double's own probe narrows that first parameter to its table union, so it is adapted here
       * rather than the utility's contract being widened. */
      isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> =>
        urlTitleProbe.probe.isUrlTitleAvailable(tableName as UrlTitleTableName, value),
      persistProduct: (product: Product) => adapter.saveProduct(product),
      /* Reached only by `requireDefaultSkuEntity`, which only the subscription-term process member
       * calls. Made LOUD rather than plausible: a reader answering `''` would let a case pass while
       * silently resolving the wrong SKU. */
      defaultSkuIdReader: (): string => {
        throw new Error('defaultSkuIdReader is not reached by these cases.');
      },
    });
  }

  it('NET-NEW — the product carries its productType, brand, defaultSku and skus', async () => {
    const product = await readService().getProduct(ID.product);

    expect(product).not.toBeNull();
    // All four associations the finding named as missing.
    expect(product?.productType?.productTypeID).toBe(ID.productType);
    expect(product?.brand?.brandID).toBe(ID.brand);
    expect(product?.defaultSku).toBeDefined();
    expect(product?.getSkus()).toHaveLength(2);
  });

  it('NET-NEW — the default SKU answers a price, so Product.getPrice has something to fall through to', async () => {
    // `Product.getPrice()` delegates to the default SKU when the product declares no local override,
    // which is why an unresolved `defaultSku` made the Google feed emit an empty `<g:price>` for
    // every item rather than raising.
    const product = await readService().getProduct(ID.product);

    expect(product?.defaultSku?.getPrice()).toBe(toExactDecimal('99.00'));
    /* '99.00', not 99: F07 preserves the digits AND the scale the row carried — the fixture row spells
     * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type. */
  });

  it('NET-NEW — every SKU back-references the same product instance', async () => {
    const product = await readService().getProduct(ID.product);
    const skus = product?.getSkus() ?? [];

    expect(skus).toHaveLength(2);
    for (const sku of skus) {
      // Definedness asserted FIRST, so this cannot pass vacuously as `undefined === undefined`.
      expect(sku).toBeInstanceOf(Sku);
      expect((sku as Sku).product).toBeDefined();
      expect((sku as Sku).product).toBe(product);
    }
  });

  it('NET-NEW — an identifier that matches no row still answers null', async () => {
    // `entityLoadByPK` yields null and the callers test it with `isNull()`, so `null` rather than
    // `undefined` is the legacy answer shape.
    const product = await readService().getProduct('00000000000000000000000000000000');

    expect(product).toBeNull();
  });
});
