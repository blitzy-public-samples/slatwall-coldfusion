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
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/catalogAggregates';
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

    const productLookups = journal.statements.filter((statement) =>
      statement.sql.startsWith('SELECT productID'),
    );
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
    expect(journal.statements.filter((s) => s.sql.startsWith('SELECT productID'))).toHaveLength(0);
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
    expect(journal.statements.some((s) => s.sql.startsWith('SELECT productID'))).toBe(false);
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
