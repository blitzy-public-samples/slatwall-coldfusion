/**
 * Aggregate materialization — INT-02 and DATA-02.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/adapters/mysql/catalogAggregates.ts` and the hook it is invoked through in
 * `src/adapters/mysql/SmartListQueryBuilder.execute`.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * Two reported findings were one fault observed at two roots. `SmartListQueryBuilder` projects
 * `<baseAlias>.*` and the row mappers hydrate scalar columns only — `rowMappers.ts` RULE 3 leaves every
 * many-to-one association GENUINELY ABSENT, by design — so before this fix:
 *
 *   INT-02 — a SKU smart list produced SKUs with no `product`, and the Google feed's very first act,
 *            `requireProduct(sku)`, raised for every item. The feed emitted nothing at all.
 *   DATA-02 — an option smart list produced options with no `optionGroup`, and
 *            `SkuService.createSkus` raised at `requireOptionGroupID` for every merchandise product
 *            carrying options.
 *
 * The consumers' guards were never the defect and are not touched. What these cases assert is that the
 * data now arrives complete, so the guards no longer have anything to fire on.
 *
 * ⚠️ THE `defaultSku` CASES ARE THE INTERESTING ONES. `Product.defaultSku` is typed as
 * `ProductDefaultSkuDelegate`, which `Sku` is DELIBERATELY not assignable to — the domain layer records
 * that asymmetry rather than inventing a `getImageDirectory` the legacy `Sku.cfc` never declared. So the
 * loader binds through an injected adapter, and the case below asserts that the binder is actually the
 * thing consulted rather than the entity being quietly cast.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, which is how the sibling
 * adapter suites work and what AAP 0.7.3 standard 6 requires here: no CFML runtime exists and the `Sw*`
 * tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no legacy data-access test exists
 * for this slice, and none exists for the framework smart list either (AAP 0.8.3.7).
 */
import {
  attachSkuOptions,
  createCatalogAggregateLoaders,
} from '../../src/adapters/mysql/catalogAggregates';
import type { ExactDecimal } from '../../src/util/formatting';
import { toExactDecimal } from '../../src/util/formatting';
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';

import type { CatalogAggregateDependencies } from '../../src/adapters/mysql/catalogAggregates';
import { readProductDefaultSkuId } from '../../src/adapters/mysql/rowMappers';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type { Option } from '../../src/domain/option/Option';
import type { Product, ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type { Sku } from '../../src/domain/sku/Sku';
import type { SmartListRecord } from '../../src/ports/SmartListQueryPort';
import { buildSku } from '../support/inMemoryRepositories';
import { OptionService } from '../../src/services/OptionService';

/* ================================================================================================
 * MIN-01 — THE ELEMENT TYPE IS DERIVED FROM THE ROOT ENTITY, PINNED HERE RATHER THAN ASSUMED
 * ================================================================================================
 * Every `builder.execute(...)` below passes a query and NO element type, because
 * `SmartListQueryPort.execute` reads the pairing out of `query.entityName` through
 * `SmartListEntityRecordTypes`. These three aliases are what makes that a checked claim in this file:
 * each one fails to compile if a root's record type ever stops being the domain type the port pairs
 * with it — which is exactly what would happen if the signature were loosened back to a caller-chosen
 * parameter and the adapter resumed asserting its mapper's output into it.
 * ============================================================================================== */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;
type _SkuRootYieldsSku = AssertAssignable<SmartListRecord<'SlatwallSku'>, Sku>;
type _OptionRootYieldsOption = AssertAssignable<SmartListRecord<'SlatwallOption'>, Option>;
type _ProductRootYieldsProduct = AssertAssignable<SmartListRecord<'SlatwallProduct'>, Product>;

/** Distinct 32-character identifiers, so a crossed association is visible rather than coincidental. */
const ID = {
  sku: 'aaaaaaaa000000000000000000000001',
  siblingSku: 'aaaaaaaa000000000000000000000002',
  product: 'bbbbbbbb000000000000000000000001',
  productType: 'cccccccc000000000000000000000001',
  brand: 'dddddddd000000000000000000000001',
  defaultSku: 'eeeeeeee000000000000000000000001',
  option: 'ffffffff000000000000000000000001',
  optionGroup: '99999999000000000000000000000001',
} as const;

/** Every statement the builder and the loaders issued, in order. */
interface Journal {
  readonly statements: { readonly sql: string; readonly params: readonly unknown[] }[];
}

/**
 * An executor backed by a tiny in-memory table store that HONOURS THE WHERE CLAUSE.
 *
 * ⚠️ IT HAS TO HONOUR IT, AND THAT IS NOT GOLD-PLATING. Two different statements in these scenarios read
 * `SwSku`: the builder's own record projection, and the loader's `WHERE skuID IN (…)` lookup for a
 * product's DEFAULT SKU. A double that answered both with the same fixture rows would hand the
 * default-SKU lookup the wrong rows, the lookup would miss, and the case asserting that the delegate
 * binder is consulted would fail for a reason that has nothing to do with the code under test. Filtering
 * by the bound parameters is what keeps the double honest about which row a statement asked for.
 */
function makeExecutor(tables: Readonly<Record<string, readonly MySqlRow[]>>): {
  readonly executor: SqlExecutor;
  readonly journal: Journal;
} {
  const journal: Journal = { statements: [] };

  const executor: SqlExecutor = {
    execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      journal.statements.push({ sql, params: [...params] });

      /* The count statement answers with its count column, never with entity rows. */
      if (sql.includes('recordsCount')) {
        return Promise.resolve([{ recordsCount: 1 }]);
      }

      const table = Object.keys(tables).find((name) => new RegExp(`FROM ${name}\\b`).test(sql));
      if (table === undefined) {
        return Promise.resolve([]);
      }
      const rows = tables[table] ?? [];

      /* `WHERE <column> IN (?, …)` — the shape every loader lookup uses. */
      const filter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
      if (filter !== null) {
        const column = filter[1];
        if (column !== undefined) {
          return Promise.resolve(rows.filter((row) => params.includes(row[column])));
        }
      }

      return Promise.resolve([...rows]);
    },
  };

  return { executor, journal };
}

/** A binder that records what it was handed and returns a delegate reporting a known price. */
function makeBinderSpy(price: number): {
  readonly dependencies: CatalogAggregateDependencies;
  readonly boundSkuIds: string[];
} {
  const boundSkuIds: string[] = [];

  return {
    boundSkuIds,
    dependencies: {
      bindDefaultSkuDelegate: (sku: Sku): ProductDefaultSkuDelegate => {
        boundSkuIds.push(sku.skuID);
        return {
          getCurrencyCode: (): string | undefined => undefined,
          /* F07 — `Sku.price` is exact-decimal text, so the spy's numeric literal is adopted at this
           * boundary rather than handed through as a double. */
          getPrice: (): ExactDecimal | undefined => toExactDecimal(price),
          getRenewalPrice: (): ExactDecimal | undefined => undefined,
          getListPrice: (): ExactDecimal | undefined => undefined,
          getImageDirectory: (): string => '',
          getImagePath: (): string => '',
          getImage: (): string => '',
          getResizedImagePath: (): string => '',
          getImageExistsFlag: (): boolean => false,
        };
      },
    },
  };
}

/**
 * Identifies the product-load statement the SKU and option roots' loaders issue.
 *
 * ⚠️ MATCHED ON THE QUALIFIED PROJECTION, AND WRITTEN ONCE FOR A REASON THE TWO NEGATIVE ASSERTIONS
 * BELOW DEPEND ON. `catalogAggregates.projectionFor` qualifies every projected column with its
 * whitelisted table name, so the product load now opens `SELECT SwProduct.productID`. Three inline
 * `startsWith` calls against a stale prefix would leave the two NEGATIVE assertions passing vacuously —
 * a predicate that can never match proves nothing about the statement it claims is absent — so the
 * prefix lives here, where the POSITIVE assertion breaks first and forces the others to stay honest.
 */
function isProductLoad(sql: string): boolean {
  return sql.startsWith('SELECT SwProduct.productID');
}

describe('SmartListQueryBuilder aggregate materialization — INT-02, the SKU root', () => {
  /** A SKU result set whose rows name a product, plus that product's own row and its associations. */
  function skuScenario(): Readonly<Record<string, readonly MySqlRow[]>> {
    return {
      /* ⚠️ THE THREE MONEY COLUMNS ARE STRINGS, NOT NUMBERS, AND THAT IS THE DRIVER CONTRACT RATHER
       * THAN A FIXTURE QUIRK. `model/entity/Sku.cfc:L55-L57` declares them `ormtype="big_decimal"`, and
       * `rowMappers.ts` reads them through `readOptionalExactDecimal`, which REFUSES a JavaScript number
       * because by the time one arrives the exact digits are already gone (F16). Handing a number here
       * would be asserting against a result set the configured pool cannot produce. */
      SwSku: [
        { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
        { skuID: ID.siblingSku, skuCode: 'SKU-2', price: '20.00', productID: ID.product },
        /* The product's default SKU, which the loader fetches by identifier. */
        { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
      ],
      SwProduct: [
        {
          productID: ID.product,
          productName: 'Feed Product',
          productCode: 'FP',
          productTypeID: ID.productType,
          brandID: ID.brand,
          defaultSkuID: ID.defaultSku,
        },
      ],
      SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
      SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
    };
  }

  it('attaches the product every SKU names, so requireProduct no longer has anything to refuse', async () => {
    const { executor } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });

    /* All three rows in the store belong to this product — the two ordinary SKUs and the default one. */
    expect(result.records).toHaveLength(3);
    for (const sku of result.records) {
      /* Before the fix this key was absent on every record, which is exactly what the feed's guard
       * reported — once per item, for every item. */
      expect(sku.product).toBeDefined();
      expect(sku.product?.productID).toBe(ID.product);
    }
  });

  it('attaches the product type and the brand the product names', async () => {
    const { executor } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });
    const product = result.records[0]?.product;

    expect(product?.productType?.productTypeID).toBe(ID.productType);
    expect(product?.brand?.brandID).toBe(ID.brand);
  });

  /*
   * THE CASE THAT PROVES THE BINDER IS REAL. `Sku` is not assignable to `ProductDefaultSkuDelegate`, so
   * a loader that "attached the default SKU" by casting would compile only with a suppression and would
   * hand the product an object missing four of the nine members the delegate promises. Asserting that
   * the binder was consulted, and that the price reaches the product through it, is what distinguishes a
   * real binding from a cast.
   */
  it('binds the default SKU through the injected adapter, and product.getPrice reads through it', async () => {
    const { executor } = makeExecutor(skuScenario());
    const binder = makeBinderSpy(1234);
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(binder.dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });
    const product = result.records[0]?.product;

    expect(binder.boundSkuIds).toContain(ID.defaultSku);
    /* `Product.getPrice()` falls through to `defaultSku.getPrice()`, which is the whole reason the
     * default SKU is loaded — the feed's `g:price` reads it. */
    expect(product?.getPrice()).toBe(toExactDecimal(1234));
  });

  it('gives sibling SKUs of one product the SAME product instance', async () => {
    const { executor } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });

    /* ⚠️ DEFINEDNESS IS ASSERTED FIRST, AND DELIBERATELY. `toBe` alone would be satisfied by two
     * `undefined`s, so with the loader removed this case would pass vacuously while asserting nothing —
     * the exact failure mode a mutation check exists to expose. */
    const first = result.records[0]?.product;
    const second = result.records[1]?.product;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    /* Identity, not equality: the mapping layer's semantics, and what lets a consumer compare by
     * reference. It is also the evidence that one statement served every sibling. */
    expect(first).toBe(second);
  });

  it('issues ONE product statement for a batch that names one product twice', async () => {
    const { executor, journal } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    await builder.execute({ entityName: 'SlatwallSku' });

    const productLookups = journal.statements.filter((statement) => isProductLoad(statement.sql));
    /* Two SKUs naming one product, and the builder materialises `records` and `pageRecords` separately —
     * so a naive implementation would issue up to four. De-duplication across the whole invocation is
     * what makes it one. */
    expect(productLookups).toHaveLength(1);
    expect(productLookups[0]?.params).toEqual([ID.product]);
  });

  it('leaves the brand absent when the product names none, without raising', async () => {
    const scenario = {
      ...skuScenario(),
      SwProduct: [
        {
          productID: ID.product,
          productName: 'Unbranded',
          productTypeID: ID.productType,
          brandID: null,
          defaultSkuID: null,
        },
      ],
    };
    const { executor } = makeExecutor(scenario);
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });
    const product = result.records[0]?.product;

    /* The legacy feed LEFT-joins brand and guards the read, so absence is ordinary data. */
    expect(product).toBeDefined();
    expect(product?.brand).toBeUndefined();
  });

  it('issues no association statement at all for an empty result set', async () => {
    const { executor, journal } = makeExecutor({ SwSku: [] });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallSku' });

    expect(result.records).toEqual([]);
    /* `IN ()` is not legal SQL and there is nothing to ask for. */
    expect(journal.statements.some((statement) => statement.sql.includes('IN ()'))).toBe(false);
    expect(journal.statements.filter((s) => isProductLoad(s.sql))).toHaveLength(0);
  });

  it('binds every identifier positionally and interpolates none', async () => {
    const { executor, journal } = makeExecutor(skuScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    await builder.execute({ entityName: 'SlatwallSku' });

    for (const statement of journal.statements) {
      expect(statement.sql).not.toContain(ID.product);
      expect(statement.sql).not.toContain(ID.brand);
      expect(statement.sql).not.toContain(ID.productType);
      expect(statement.sql).not.toContain("'");
    }
  });
});

describe('SmartListQueryBuilder aggregate materialization — DATA-02, the option root', () => {
  it('attaches the required option group, so requireOptionGroupID no longer refuses', async () => {
    const { executor } = makeExecutor({
      SwOption: [{ optionID: ID.option, optionName: 'Large', optionGroupID: ID.optionGroup }],
      SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupCode: 'size' }],
    });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallOption' });

    /* `model/entity/Option.cfc:L59` declares this relationship REQUIRED. Before the fix it was absent on
     * every hydrated option, so every merchandise SKU creation carrying options raised. */
    expect(result.records[0]?.optionGroup).toBeDefined();
    expect(result.records[0]?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
    expect(result.records[0]?.optionGroup?.optionGroupCode).toBe('size');
  });

  it('needs no delegate binder to resolve, since an option group is loaded whole', async () => {
    const { executor, journal } = makeExecutor({
      SwOption: [{ optionID: ID.option, optionGroupID: ID.optionGroup }],
      SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupCode: 'size' }],
    });
    const binder = makeBinderSpy(42);
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(binder.dependencies),
    );

    await builder.execute({ entityName: 'SlatwallOption' });

    /* The option root touches no product and therefore no default SKU. */
    expect(binder.boundSkuIds).toEqual([]);
    expect(journal.statements.some((s) => isProductLoad(s.sql))).toBe(false);
  });

  it('leaves the group absent when the column is empty, deferring to the consumer guard', async () => {
    const { executor } = makeExecutor({
      SwOption: [{ optionID: ID.option, optionGroupID: '' }],
    });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallOption' });

    /* `unsavedvalue=""` means the empty string spells absence, so no `WHERE id = ''` is issued. The
     * consumer's own guard reports it with the option identifier and the legacy locator, which is a
     * better error than this loader could produce. */
    expect(result.records[0]).toBeDefined();
    expect(result.records[0]?.optionGroup).toBeUndefined();
  });
});

describe('SmartListQueryBuilder aggregate materialization — DATA-03, the product root', () => {
  /** A single product row plus every row its four associations need. */
  function productScenario(): Readonly<Record<string, readonly MySqlRow[]>> {
    return {
      SwProduct: [
        {
          productID: ID.product,
          productName: 'Feed Product',
          productCode: 'FP',
          productTypeID: ID.productType,
          brandID: ID.brand,
          defaultSkuID: ID.defaultSku,
        },
      ],
      SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
      SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
      /* Money columns are strings for the reason stated on the SKU scenario above (F16). */
      SwSku: [
        { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
        { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
      ],
    };
  }

  it('attaches the productType, brand, defaultSku and skus a product aggregate needs', async () => {
    const { executor } = makeExecutor(productScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    const product = result.records[0];

    /* The four associations DATA-03 named as missing from `ProductService.getProduct`. */
    expect(product?.productType?.productTypeID).toBe(ID.productType);
    expect(product?.brand?.brandID).toBe(ID.brand);
    expect(product?.defaultSku?.getPrice()).toBe(toExactDecimal(99));
    expect(product?.getSkus()).toHaveLength(2);
  });

  it('gives every SKU in the collection a back-reference to the product that owns it', async () => {
    const { executor } = makeExecutor(productScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });
    const product = result.records[0];
    const skus = product?.getSkus() ?? [];

    expect(product).toBeDefined();
    expect(skus).toHaveLength(2);
    for (const member of skus) {
      /* Definedness asserted first, so `toBe` cannot be satisfied by two `undefined`s. */
      expect((member as Sku).product).toBeDefined();
      expect((member as Sku).product).toBe(product);
    }
  });

  /*
   * ⭐ THE IDENTITY CASE, AND ITS PREMISE WAS REVERSED ON PURPOSE. It was written when `records` and
   * `pageRecords` were materialised into DISTINCT objects for the same row, and it asserted that no SKU
   * object was shared between the two graphs — the mistake it policed being a loader that pushed one
   * SKU instance onto both collections, leaving `records[0].getSkus()[0].product` pointing at
   * `pageRecords[0]`.
   *
   * Materialisation now runs both result sets through ONE identity map, so a row seen twice yields ONE
   * instance — which is what a single Hibernate session guaranteed, and which matters here because
   * `manageEntity` installs a FRESH error bag per mapping: two instances for one row would split the
   * findings §0.6.2's validation reads back. Sharing is therefore the CONTRACT now, not the defect.
   *
   * The case keeps its real subject by inverting the assertion. What must not happen is an owner that
   * appears in BOTH collections having its aggregate loaded TWICE: the loader mutates what it is handed,
   * so a product offered once per collection came back holding FOUR SKUs instead of two. That is the
   * defect this now fails on, and on no other.
   */
  it('loads a shared owner ONCE, even when it appears in both collections', async () => {
    const { executor } = makeExecutor(productScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
    );

    /*
     * ⚠️ THE PAGE IS ASKED FOR FROM THE SECOND ROW ON PURPOSE, AND THAT IS WHAT MAKES THIS CASE MEAN
     * ANYTHING. The builder skips the page statement and reuses the unpaged collection when the page
     * window provably covers every row in hand — `pageRecordsStart === 1 && recordCount <= show` — and
     * this scenario has a single product row, so a default query would take that path and hand back the
     * SAME array for both collections — the loader would then be offered the owner ONCE and the
     * double-append this case polices could not occur, so the case would pass while proving nothing. A
     * start of two puts the page on its own statement, which is the situation the loader has to get
     * right: two offers of one owner, one aggregate.
     */
    const result = await builder.execute({
      entityName: 'SlatwallProduct',
      pagination: { pageRecordsStart: 2 },
    });
    const fromRecords = result.records[0];
    const fromPageRecords = result.pageRecords[0];

    expect(fromRecords).toBeDefined();
    expect(fromPageRecords).toBeDefined();
    /* ONE instance for one row, across both result sets. The identity map's contract. */
    expect(fromRecords).toBe(fromPageRecords);

    /*
     * ⭐ TWO, NOT FOUR. The scenario holds two SKU rows for this product, and the product was offered to
     * the loader from the unpaged collection AND from the page. Appending per offer would double the
     * collection while every other assertion here still passed.
     */
    expect(fromRecords?.getSkus()).toHaveLength(2);

    /* And the SKUs are the SAME instances through either handle, since there is only one graph. */
    const recordSkus = fromRecords?.getSkus() ?? [];
    const pageSkus = fromPageRecords?.getSkus() ?? [];
    expect(recordSkus).toStrictEqual(pageSkus);
    for (const member of recordSkus) {
      expect((member as Sku).product).toBeDefined();
      expect((member as Sku).product).toBe(fromRecords);
    }
  });

  it('issues ONE SKU collection statement for the whole invocation', async () => {
    const { executor, journal } = makeExecutor(productScenario());
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
    );

    await builder.execute({ entityName: 'SlatwallProduct' });

    const collectionReads = journal.statements.filter((statement) =>
      /FROM SwSku WHERE productID IN \(/.test(statement.sql),
    );
    /* One product named twice — once by `records`, once by `pageRecords` — is still one identifier. */
    expect(collectionReads).toHaveLength(1);
    expect(collectionReads[0]?.params).toEqual([ID.product]);
  });

  it('leaves a product with no SKU rows carrying an empty collection, without raising', async () => {
    const scenario = { ...productScenario(), SwSku: [] };
    const { executor, journal } = makeExecutor(scenario);
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallProduct' });

    expect(result.records[0]?.getSkus()).toEqual([]);

    /* ⚠️ THE SLOT IS NOT EMPTY, AND THE ASSERTION THAT IT WAS DESCRIBED A DIFFERENT FIXTURE.
     * This scenario keeps `productScenario()`'s product row — which CARRIES `defaultSkuID` — and empties
     * `SwSku`. That is a DANGLING foreign key, not "a product with no SKUs yet"; a product with no SKUs
     * yet has `defaultSkuID` NULL, and for that row the slot genuinely is absent.
     *
     * `rowMappers.ts` rule 3a fills the slot with an identifier-only REFERENCE whenever the row names
     * one, and the loader above assigns a bound delegate only when it actually resolved a SKU — so an
     * unresolvable identifier leaves the reference in place. That is the safe outcome and the one this
     * suite wants: the identifier survives, so writing the product back cannot NULL the column, while
     * every VALUE read refuses instead of answering a fabricated price. `Product.getPrice()` falls
     * through to this delegate, so an empty slot here would let a corrupt row render as a free product.
     */
    const unresolved = result.records[0]?.defaultSku;
    expect(unresolved).toBeDefined();
    expect(readProductDefaultSkuId(unresolved ?? {})).toBe(ID.defaultSku);
    expect(() => unresolved?.getPrice()).toThrow();

    expect(journal.statements.some((statement) => statement.sql.includes('IN ()'))).toBe(false);
  });
});

describe('SmartListQueryBuilder aggregate materialization — the roots that declare no loader', () => {
  it('hydrates a brand root with no extra statement, because Brand declares no many-to-one', async () => {
    const { executor, journal } = makeExecutor({
      SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
    });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    const result = await builder.execute({ entityName: 'SlatwallBrand' });

    expect(result.records).toHaveLength(1);
    /*
     * TWO statements and no more, and the point of the case is the "no more". A root with nothing to
     * resolve declares no loader — a decision per root rather than a fallback — so NO aggregate
     * statement is issued on top of the query's own.
     *
     * Why two rather than three: the page statement is legitimately skipped here. This root returns a
     * single row and the page window starts at one, so the window provably covers every row already in
     * hand and the builder reuses the unpaged collection as the page instead of re-reading it. The count
     * is still counted through its own dedicated statement, never inferred from the collection's length,
     * which is the asymmetry the port's contract insists on.
     */
    expect(journal.statements).toHaveLength(2);
  });
});

/*
 * ===================================================================================================
 * F2 — THE JOINED OPTION FETCH, ASSERTED ON ITS STATEMENT TEXT RATHER THAN ON ITS OBJECTS
 * ===================================================================================================
 * These cases exist because a whole class of defect was invisible to this suite. Every case above
 * asserts on hydrated OBJECTS, and an in-memory double answers whatever shape it is asked for, so a
 * statement no server would accept still produced a green run. `attachSkuOptions` — the port of
 * `model/dao/SkuDAO.cfc:L157`'s `INNER JOIN FETCH sku.options`, and the only JOIN in the module — was
 * emitting `SELECT link.skuID, optionID, …` with the option's own columns UNQUALIFIED. Both joined
 * tables declare `optionID`, so MySQL refused the statement outright:
 *
 *   ER_NON_UNIQ_ERROR (1052): Column 'optionID' in field list is ambiguous
 *
 * That made `SkuRepository.findByProduct(product, true)` — and through it `SkuService.getProductSkus`
 * with the fetch flag raised, an AAP 0.4.2.2 public member — non-functional against the real `Sw*`
 * schema on EVERY invocation, while 779 tests stayed green.
 *
 * So these cases read the SQL rather than the objects, which is the half of the gate a suite with no
 * database can hold. The other half was executed against MySQL 8.4.11 in a disposable schema shaped
 * from the legacy column declarations, where the same statement failed before this fix and succeeds
 * after it.
 *
 * ⚠️ THE LAST CASE IS THE ONE THAT CLOSES THE CLASS. The `*_PROJECTION` constants are shared across
 * every loader in the module, so qualifying only the join would leave the next join to be written
 * carrying the same fault. It asserts that NO projection this module emits is bare, wherever it
 * appears — which is the property {@link projectionFor} now guarantees by construction.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 records that no legacy data-access test
 * exists for this slice.
 */
describe('F2 — the joined option fetch emits a statement a real server accepts', () => {
  /**
   * Runs the joined option fetch for two SKUs that share one option.
   *
   * ⚠️ THE `SwSkuOption` FIXTURE ROWS CARRY THE OPTION'S COLUMNS TOO, and that is the join being
   * modelled rather than a fixture shortcut: the double resolves a statement to ONE table by its `FROM`
   * clause, so for a joined read the row it returns has to be the JOINED row — the link table's `skuID`
   * alongside the option's own columns, which is exactly what the server hands back.
   */
  async function fetchOptions(): Promise<{
    readonly journal: Journal;
    readonly skus: readonly Sku[];
  }> {
    const { executor, journal } = makeExecutor({
      SwSkuOption: [
        { skuID: ID.sku, optionID: ID.option, optionName: 'Small', optionGroupID: ID.optionGroup },
        {
          skuID: ID.siblingSku,
          optionID: ID.option,
          optionName: 'Small',
          optionGroupID: ID.optionGroup,
        },
      ],
      SwOptionGroup: [{ optionGroupID: ID.optionGroup, optionGroupCode: 'size' }],
    });

    const skus = [buildSku({ skuID: ID.sku }), buildSku({ skuID: ID.siblingSku })];
    await attachSkuOptions(executor, skus);

    return { journal, skus };
  }

  /** The one joined statement in the module, located by its `INNER JOIN` rather than by position. */
  function joinedStatement(journal: Journal): {
    readonly sql: string;
    readonly params: readonly unknown[];
  } {
    const statement = journal.statements.find((candidate) =>
      candidate.sql.includes('INNER JOIN SwOption'),
    );
    if (statement === undefined) {
      throw new Error('the joined option fetch was never issued');
    }
    return statement;
  }

  /** The projected identifier list of a statement, or an empty string when it projects none. */
  function projectionOf(sql: string): string {
    return /^SELECT (.*?) FROM /.exec(sql)?.[1] ?? '';
  }

  it('qualifies EVERY projected column, so the field list carries no bare identifier', async () => {
    const { journal } = await fetchOptions();
    const projected = projectionOf(joinedStatement(journal).sql).split(', ');

    /*
     * Read off the statement rather than compared against a literal list, so the assertion stays true
     * as the option's column set grows: `link.` is the link table's alias and `SwOption.` is the
     * whitelisted table name, and those are the only two qualifiers this statement may carry.
     */
    expect(projected.length).toBeGreaterThan(1);
    for (const column of projected) {
      expect(column).toMatch(/^(?:link|SwOption)\.[A-Za-z]+$/);
    }
  });

  it('never projects a bare `optionID`, the column both joined tables declare', async () => {
    const { journal } = await fetchOptions();
    const projection = projectionOf(joinedStatement(journal).sql);

    /* The exact shape MySQL rejected: `optionID` with nothing in front of it. */
    expect(projection.split(', ')).not.toContain('optionID');
    expect(projection).toContain('SwOption.optionID');
    expect(projection).toContain('link.skuID');
  });

  it('binds one placeholder per requested SKU and interpolates no value', async () => {
    const { journal } = await fetchOptions();
    const statement = joinedStatement(journal);

    /* TR-4 — placeholder count equals parameter count, and every value travels as a parameter. */
    expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
    expect(statement.params).toEqual([ID.sku, ID.siblingSku]);
    expect(statement.sql).not.toContain(ID.sku);
    expect(statement.sql).not.toContain(ID.siblingSku);
    expect(statement.sql).not.toContain("'");
  });

  it('hydrates the options AND their groups onto every SKU that owns them', async () => {
    const { skus } = await fetchOptions();

    expect(skus).toHaveLength(2);
    for (const sku of skus) {
      expect(sku.options).toHaveLength(1);
      /* The group comes with the option because the members that matter read through it:
       * `Sku.generateImageFileName` reads `option.getOptionGroup().getImageGroupFlag()`
       * [model/entity/Sku.cfc:L134]. */
      expect(sku.options[0]?.optionGroup?.optionGroupCode).toBe('size');
    }
  });

  it('qualifies the single-table loaders too, so no shared projection is a join hazard', async () => {
    const { executor, journal } = makeExecutor({
      SwProduct: [
        {
          productID: ID.product,
          productName: 'Feed Product',
          productTypeID: ID.productType,
          brandID: ID.brand,
          defaultSkuID: ID.defaultSku,
        },
      ],
      SwProductType: [{ productTypeID: ID.productType, productTypeName: 'Merchandise' }],
      SwBrand: [{ brandID: ID.brand, brandName: 'Nike' }],
      SwSku: [
        { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
      ],
    });
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(99).dependencies),
    );

    await builder.execute({ entityName: 'SlatwallProduct' });

    /*
     * The product root exercises four of the module's five projection constants in one pass. The
     * builder's own record statement projects the base alias with a star and the count statement
     * projects an aggregate, so neither names a column and both are excluded — what remains is exactly
     * the loader statements, every one of which must qualify.
     */
    const projections = journal.statements
      .map((statement) => projectionOf(statement.sql))
      .filter((projection) => projection !== '' && !projection.includes('*'))
      .filter((projection) => !projection.includes('recordsCount'));

    expect(projections.length).toBeGreaterThan(0);
    for (const projection of projections) {
      for (const column of projection.split(', ')) {
        expect(column).toMatch(/^[A-Za-z]+\.[A-Za-z]+$/);
      }
    }
  });
});

/* =================================================================================================
 * RELATIONSHIP HYDRATION REACHED THROUGH THE SYNTHESIZED SERVICE MEMBERS — REVIEW FINDING 15
 * -------------------------------------------------------------------------------------------------
 * RESTORED COVERAGE. Four hydration/identity-map cases were dropped when the suite was reorganised and
 * the review found no replacement for them. They are restored here because this file owns hydration;
 * the eight builder cases dropped alongside them are restored in
 * `test/adapters/SmartListQueryBuilder.test.ts`.
 *
 * WHY THEY ARE NOT COVERED BY THE `DATA-02` BLOCK ABOVE. That block drives `builder.execute()` directly
 * and asserts the INJECTED loader for the option root. These four enter through
 * `OptionService.getOption`, `getOptionGroup` and `getOptionSmartList` — synthesized CRUD members
 * (AAP §0.1.1.3 IR-1) with no declaration anywhere in the legacy source — and they exercise the
 * builder's OWN built-in relationship pass, which is a different mechanism reached by a different code
 * path. `createCatalogAggregateLoaders` declares `SlatwallOptionGroup: undefined` deliberately, so the
 * option-group root's `options` collection is loaded by `hydrateOptionGroupOptions` and by nothing in
 * this file's other blocks. Two of the four assert the INVERSE direction and the identity map, neither
 * of which appears anywhere above.
 *
 * ⚠️ NO SMART-LIST DOUBLE IS USED, AND THAT IS THE POINT. A double can model correct relationships while
 * the production adapter does not, and would then report success no matter what the adapter did. A REAL
 * {@link SmartListQueryBuilder} is constructed over a one-method executor, so production statement
 * composition, production row mappers and the production hydrator all run. The executor routes on the
 * owner-key alias — a projection only an association statement carries — so the routing itself is what
 * asserts that a SECOND statement was issued at all.
 * ================================================================================================*/

describe('OptionService relationship hydration through the real builder (finding 15)', () => {
  const OPTION_GROUP_ROW = Object.freeze({
    optionGroupID: ID.optionGroup,
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    imageGroupFlag: 1,
    sortOrder: 1,
  });

  /** The option repository is genuinely unreached by these members, so it refuses rather than pretends. */
  const UNREACHED_OPTION_REPOSITORY = {
    findUnusedOptions: (): never => {
      throw new Error('the option repository is not reached by a synthesized get member');
    },
    findUnusedOptionGroups: (): never => {
      throw new Error('the option repository is not reached by a synthesized get member');
    },
  } as unknown as ConstructorParameters<typeof OptionService>[0];

  /**
   * Routes statements by SHAPE, because the two roots these cases exercise are hydrated by two DIFFERENT
   * mechanisms and a fixture that conflated them would prove nothing about either.
   *
   * ⭐ THIS IS THE ONE PLACE THE RESTORED CASES HAD TO BE ADAPTED TO THE CURRENT API SURFACE, so it is
   * worth naming precisely. When these cases were originally written, BOTH roots went through the
   * builder's built-in relationship pass, and one route on the owner-key alias served both. Today:
   *
   *   • `SlatwallOption` is hydrated by the INJECTED loader `loadOptionAggregates`, which collects the
   *     `optionGroupID` foreign key off the option rows and issues
   *     `SELECT … FROM SwOptionGroup WHERE optionGroupID IN (…)` — no owner-key alias anywhere.
   *   • `SlatwallOptionGroup` declares `undefined` in `createCatalogAggregateLoaders`, so its `options`
   *     collection is loaded by the builder's own `hydrateOptionGroupOptions`, whose statement DOES
   *     project `smartListAssociationOwnerKey`.
   *
   * Both are still a SECOND statement issued to resolve a relationship the row mapper left absent, which
   * is what the restored cases assert; only the statement's shape differs. Routing on both shapes keeps
   * every original assertion intact instead of weakening one to fit the other.
   */
  function makeService(spec: {
    readonly entityRows: readonly MySqlRow[];
    /** Answers the built-in pass — the OptionGroup root's `options` collection. */
    readonly associationRows?: readonly MySqlRow[];
    /** Answers the injected loader's foreign-key lookup — the Option root's `optionGroup`. */
    readonly optionGroupRows?: readonly MySqlRow[];
  }): { readonly service: OptionService; readonly statements: string[] } {
    const statements: string[] = [];
    const executor: SqlExecutor = {
      execute: (sql: string): Promise<MySqlRow[]> => {
        statements.push(sql);
        if (sql.includes('smartListAssociationOwnerKey')) {
          return Promise.resolve([...(spec.associationRows ?? [])]);
        }
        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: spec.entityRows.length }]);
        }
        /* The injected loader's lookup. The ` IN (` test is what separates it from the OptionGroup root's
         * own BASE record statement, which also reads `FROM SwOptionGroup` but carries no WHERE clause —
         * without that test, case three's base statement would be answered with group-association rows. */
        if (/FROM SwOptionGroup\b/.test(sql) && sql.includes(' IN (')) {
          return Promise.resolve([...(spec.optionGroupRows ?? [])]);
        }
        return Promise.resolve([...spec.entityRows]);
      },
    };
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders(makeBinderSpy(42).dependencies),
    );

    return { service: new OptionService(UNREACHED_OPTION_REPOSITORY, builder), statements };
  }

  /** The second statement, whichever mechanism issued it. */
  function issuedARelationshipStatement(statements: readonly string[]): boolean {
    return statements.some(
      (sql) =>
        sql.includes('smartListAssociationOwnerKey') ||
        (/FROM SwOptionGroup\b/.test(sql) && sql.includes(' IN (')),
    );
  }

  it('getOption hydrates optionGroup, and a SECOND statement is issued to do it', async () => {
    const { service, statements } = makeService({
      entityRows: [
        {
          optionID: ID.option,
          optionName: 'Small',
          optionCode: 'sm',
          sortOrder: 1,
          optionGroupID: ID.optionGroup,
        },
      ],
      optionGroupRows: [{ ...OPTION_GROUP_ROW }],
    });

    const option = await service.getOption(ID.option);

    /* `model/entity/Option.cfc:L59` declares the relationship, and `rowMappers.ts` RULE 3 deliberately
     * leaves it unresolved — so without the hydration pass this is `undefined` and every merchandise SKU
     * creation carrying options raises at `requireOptionGroupID`. */
    expect(option?.optionGroup).toBeDefined();
    expect(option?.optionGroup?.optionGroupID).toBe(ID.optionGroup);
    expect(option?.optionGroup?.optionGroupName).toBe('Size');
    /* The chain `Sku.hasOneOptionPerOptionGroup` walks — `model/entity/Sku.cfc:L772-L784`. The port reads
     * the FIELD rather than an accessor, because `Option` declares `setOptionGroup` and no getter: the
     * CFML accessor is one the ORM synthesizes. */
    expect(issuedARelationshipStatement(statements)).toBe(true);
    /* And it really is a SECOND statement, not the base one doing double duty. */
    expect(statements.length).toBeGreaterThan(1);
  });

  it('a NULL foreign key leaves optionGroup ABSENT rather than stubbed', async () => {
    /* `SwOption.optionGroupID` carries no `notnull` in the mapping, so a row with no value is possible.
     * RULE 3 forbids a stub precisely because `option.getOptionGroup().getImageGroupFlag()` would read a
     * CLASS DEFAULT off one — the association must be absent, not an object answering `false`.
     *
     * ⭐ THE COLUMN IS OMITTED ENTIRELY HERE, which is a different input from the empty string the
     * `DATA-02` block above exercises. An INNER join returns no row for either, so both must reach the
     * same absent outcome by the same path — and asserting only one of the two would leave the other
     * free to start stubbing. */
    const { service, statements } = makeService({
      entityRows: [{ optionID: ID.option, optionName: 'Small', optionCode: 'sm', sortOrder: 1 }],
    });

    const option = await service.getOption(ID.option);

    expect(option).not.toBeNull();
    /* No key was collected, so no lookup was even attempted — the absence costs nothing. */
    expect(issuedARelationshipStatement(statements)).toBe(false);
    expect(option?.optionGroup).toBeUndefined();
  });

  it("getOptionGroup hydrates options in the declared sortOrder, and sets each option's group back", async () => {
    /* `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"`, so ORDER IS BEHAVIOUR here —
     * unlike `Sku.options`, which declares no `orderby` at all. The statement asks the database for that
     * order, so the rows arrive in it; this asserts the collection preserves what it was given. */
    const { service } = makeService({
      entityRows: [{ ...OPTION_GROUP_ROW }],
      associationRows: [
        {
          smartListAssociationOwnerKey: ID.optionGroup,
          optionID: 'ffffffff000000000000000000000011',
          optionName: 'Small',
          optionCode: 'sm',
          sortOrder: 1,
        },
        {
          smartListAssociationOwnerKey: ID.optionGroup,
          optionID: 'ffffffff000000000000000000000012',
          optionName: 'Medium',
          optionCode: 'md',
          sortOrder: 2,
        },
      ],
    });

    const group = await service.getOptionGroup(ID.optionGroup);

    /* The D14 site indexes `options[1]` — `model/service/ProductService.cfc:L115-L119`. With an empty
     * collection that carried-over defect is not even reproducible, which is why this assertion is on the
     * ORDER and not merely on the length. */
    expect(group?.options.map((option) => option.optionID)).toEqual([
      'ffffffff000000000000000000000011',
      'ffffffff000000000000000000000012',
    ]);
    /* Both directions consistent, as one Hibernate session would give — and BY REFERENCE, so what is
     * asserted is the identity map rather than a value copy. */
    expect(group?.options[0]?.optionGroup).toBe(group);
    expect(group?.options[1]?.optionGroup).toBe(group);
  });

  it('two options of one group share ONE OptionGroup instance (the identity map)', async () => {
    /* One instance per identifier per read is what a single Hibernate session gives, and it is what makes
     * `===` between two references to the same row meaningful. Two separate instances would also mean the
     * row had been managed twice, which installs a FRESH error bag and discards anything already
     * accumulated on it. */
    const { service } = makeService({
      entityRows: [
        {
          optionID: ID.option,
          optionName: 'Small',
          optionCode: 'sm',
          sortOrder: 1,
          optionGroupID: ID.optionGroup,
        },
        {
          optionID: 'ffffffff000000000000000000000002',
          optionName: 'Medium',
          optionCode: 'md',
          sortOrder: 2,
          optionGroupID: ID.optionGroup,
        },
      ],
      /* ONE group row for TWO options, which is what makes the identity assertion meaningful: the loader
       * de-duplicates the foreign keys into a single `IN (…)` lookup and must hand both options the same
       * instance built from that one row. */
      optionGroupRows: [{ ...OPTION_GROUP_ROW }],
    });

    const result = await service.getOptionSmartList();

    expect(result.records).toHaveLength(2);
    const [first, second] = result.records;
    expect(first?.optionGroup).toBeDefined();
    expect(first?.optionGroup).toBe(second?.optionGroup);
  });
});
