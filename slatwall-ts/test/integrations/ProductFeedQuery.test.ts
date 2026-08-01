/**
 * Google product-feed record selection — INT-01.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/ProductFeedQuery.ts` and the two layers its declaration has to survive:
 * `translateSmartListInput` in `src/ports/SmartListQueryPort.ts`, and the SQL emitter in
 * `src/adapters/mysql/SmartListQueryBuilder.ts`.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * `integrationServices/google/controllers/feed.cfc:L63-L72` makes SEVEN additions to the SKU smart
 * list: three related-property joins (`:L64-L66`), three equality filters (`:L68-L70`) and one range
 * (`:L72`). Before this fix the four DATA additions crossed into the target and THE THREE JOINS DID
 * NOT — they were transcribed into an exported constant and then never handed to anything, so the
 * emitted SQL named neither the product's default SKU nor its brand. The feed's own field mapping reads
 * both.
 *
 * The cases below assert the three things that have to hold for that to be genuinely fixed rather than
 * merely plumbed:
 *
 *   1. the transcription still matches `feed.cfc:L64-L66` exactly — right pairs, right order, and the
 *      `left` kind on the brand join present while the other two omit the kind entirely;
 *   2. all seven additions arrive in ONE call, and the three joins land AFTER the three the SKU service
 *      declares for every smart list, because two of the feed's name `SlatwallProduct` as their parent
 *      and that entity is in the registry only because a service join put it there;
 *   3. the joins reach the emitted statement, the duplicated one is absorbed rather than doubled, and
 *      nothing renders as an inner join — an inner join on brand would silently drop every brandless
 *      product out of a merchant feed.
 *
 * ⚠️ EVERY JOIN RENDERS AS `LEFT JOIN`, AND THAT IS THE LEGACY BEHAVIOUR RATHER THAN A BUG IN THESE
 * ASSERTIONS. `org/Hibachi/HibachiSmartList.cfc:L212` defaults the join kind to the EMPTY STRING and
 * `:L537-L540` rewrites an empty kind to `left`, so an omitted kind and an explicit `left` emit the same
 * keyword. Asserting that no statement contains `INNER JOIN` is therefore the assertion that carries
 * the meaning here: it is what proves no row can be eliminated by any of the six joins.
 *
 * NO DATABASE. A recording executor double answers each statement by shape, exactly as the sibling
 * adapter suites do: no CFML runtime exists here and the `Sw*` tables are absent from this repository.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * feed controller at all, and AAP §0.8.3.7 requires that absence to be flagged rather than implied away.
 */
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import type { ExactDecimal } from '../../src/util/formatting';
import { toExactDecimal } from '../../src/util/formatting';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/catalogAggregates';
import { Sku } from '../../src/domain/sku/Sku';
import {
  PRODUCT_FEED_JOINS,
  ProductFeedQuery,
} from '../../src/integrations/google/ProductFeedQuery';
import { SkuService } from '../../src/services/SkuService';

import type { SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type {
  SmartListQuery,
  SmartListQueryPort,
  SmartListResult,
} from '../../src/ports/SmartListQueryPort';

/**
 * A collaborator no case on this path reaches.
 *
 * The discipline `test/services/SkuService.test.ts` established: a collaborator that must exist to
 * construct the service but is never called is spelled `{} as never`, so a case that unexpectedly
 * reaches one fails LOUDLY on a missing member rather than quietly succeeding against a stub that
 * answered something plausible.
 */
const UNREACHED_COLLABORATOR = {} as never;

/** Larger than anything these cases generate; the constructor rejects a non-positive budget. */

/** Distinct 32-character identifiers, so a crossed association is visible rather than coincidental. */
const ID = {
  sku: 'aaaaaaaa000000000000000000000001',
  product: 'bbbbbbbb000000000000000000000001',
  productType: 'cccccccc000000000000000000000001',
  brand: 'dddddddd000000000000000000000001',
  defaultSku: 'eeeeeeee000000000000000000000001',
} as const;

/** One statement, as the driver saw it. */
interface Statement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Builds a `ProductFeedQuery` over a real `SkuService`, with only the query port live.
 *
 * ⚠️ THE SERVICE IS REAL AND IS NOT DOUBLED, AND THAT IS THE POINT OF THIS HARNESS. The finding is
 * about what survives the trip from the integration, through the service's own declarations, into the
 * translated query — so a doubled service would assert the one link in that chain that was never in
 * doubt. Nine of the ten collaborators are unreachable on this path; the tenth is supplied by the
 * caller.
 */
function makeFeedQuery(port: SmartListQueryPort): ProductFeedQuery {
  const service = new SkuService(
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    port,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
  );

  return new ProductFeedQuery(service);
}

/** A port that records the description it was handed and answers with an empty result. */
function makeCapturingPort(): {
  readonly port: SmartListQueryPort;
  readonly queries: SmartListQuery[];
} {
  const queries: SmartListQuery[] = [];

  return {
    queries,
    port: {
      /*
       * The records-only reading is part of the port, and the feed is the caller that uses it: the feed
       * loops the unpaged collection and reads no count, so it goes through `executeRecords`. Both
       * members record into the SAME list, because every case here asserts on the DESCRIPTION the feed
       * composed rather than on which of the two readings issued it.
       */
      executeRecords: <T>(query: SmartListQuery): Promise<T[]> => {
        queries.push(query);
        return Promise.resolve([]);
      },
      execute: <T>(query: SmartListQuery): Promise<SmartListResult<T>> => {
        queries.push(query);
        return Promise.resolve({
          records: [],
          pageRecords: [],
          recordsCount: 0,
          pageRecordsStart: 1,
          pageRecordsEnd: 0,
          currentPage: 1,
          totalPages: 0,
        });
      },
    },
  };
}

/**
 * A recording executor over a tiny table store that honours `WHERE <column> IN (…)`.
 *
 * The table is read from the statement's FIRST `FROM`, so the root projection's own joins cannot be
 * mistaken for the table it selects from. Honouring the `IN` form matters for the same reason it does
 * in `test/adapters/catalogAggregates.test.ts`: two different statements read `SwSku` on this path — the
 * feed's record projection and the aggregate loader's default-SKU lookup by identifier — and a double
 * that answered both with the same rows would hand the lookup rows it never asked for.
 */
function makeRecordingExecutor(tables: Readonly<Record<string, readonly MySqlRow[]>>): {
  readonly executor: SqlExecutor;
  readonly statements: Statement[];
} {
  const statements: Statement[] = [];

  return {
    statements,
    executor: {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        statements.push({ sql, params: [...params] });

        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: 1 }]);
        }

        const table = / FROM (\w+)/.exec(sql)?.[1];
        const rows = table === undefined ? undefined : tables[table];
        if (rows === undefined) {
          return Promise.resolve([]);
        }

        const inFilter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
        const column = inFilter?.[1];
        if (column !== undefined) {
          return Promise.resolve(rows.filter((row) => params.includes(row[column])));
        }

        return Promise.resolve([...rows]);
      },
    },
  };
}

/** A delegate binder that answers a known price, so a bound default SKU is observable. */
function bindDelegate(sku: Sku): ProductDefaultSkuDelegate {
  return {
    getCurrencyCode: (): string | undefined => undefined,
    getPrice: (): ExactDecimal | undefined => sku.price,
    getRenewalPrice: (): ExactDecimal | undefined => undefined,
    getListPrice: (): ExactDecimal | undefined => undefined,
    getImageDirectory: (): string => '',
    getImagePath: (): string => '',
    getImage: (): string => '',
    getResizedImagePath: (): string => '',
    getImageExistsFlag: (): boolean => false,
  };
}

/** Every row the feed's records and their aggregate need. Money columns are strings (F16). */
const FEED_TABLES: Readonly<Record<string, readonly MySqlRow[]>> = {
  SwSku: [
    { skuID: ID.sku, skuCode: 'SKU-1', price: '10.00', productID: ID.product },
    { skuID: ID.defaultSku, skuCode: 'SKU-DEFAULT', price: '99.00', productID: ID.product },
  ],
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
};

describe('the feed joins transcribed from feed.cfc:L64-L66 (INT-01)', () => {
  it('NET-NEW — the three pairs are transcribed exactly, in source order', () => {
    /* Spelled out rather than compared against itself, so a drift in the constant is a failing
     * assertion rather than a self-consistent one. */
    expect(PRODUCT_FEED_JOINS).toEqual([
      // feed.cfc:L64 — a deliberate duplicate of model/service/SkuService.cfc:L314.
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      // feed.cfc:L65 — `defaultSku`, NOT a second `product` join.
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      // feed.cfc:L66 — the one call that states a kind.
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
  });

  it('NET-NEW — the first two OMIT the join kind rather than spelling it inner', () => {
    /* org/Hibachi/HibachiSmartList.cfc:L212 defaults the kind to the empty string, and :L537-L540
     * rewrites empty to `left`. Writing `inner` here would be a behaviour change wearing a cleanup's
     * clothes, so absence is asserted as absence. */
    expect(PRODUCT_FEED_JOINS[0]).not.toHaveProperty('joinType');
    expect(PRODUCT_FEED_JOINS[1]).not.toHaveProperty('joinType');
    expect(PRODUCT_FEED_JOINS[2]?.joinType).toBe('left');
  });

  it('NET-NEW — the sequence and every entry are frozen, so no invocation can rewrite them', () => {
    /* Module-scope state on a warm container is M7's concern; a frozen constant is the answer. */
    expect(Object.isFrozen(PRODUCT_FEED_JOINS)).toBe(true);
    for (const join of PRODUCT_FEED_JOINS) {
      expect(Object.isFrozen(join)).toBe(true);
    }
  });
});

describe('all seven feed additions arrive in one described query (INT-01)', () => {
  it('NET-NEW — the query carries SIX joins: the service’s three, then the feed’s three', async () => {
    const { port, queries } = makeCapturingPort();

    await makeFeedQuery(port).getFeedSkus();

    expect(queries).toHaveLength(1);
    /* ORDER IS THE ASSERTION. The controller cannot add to a smart list it does not hold, so
     * model/service/SkuService.cfc:L314-L316 has always run before feed.cfc:L64-L66 — and it has to be
     * that way round, because feed joins #2 and #3 name `SlatwallProduct`, which the service's first
     * join is what registers. */
    expect(queries[0]?.joins).toEqual([
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
  });

  it('NET-NEW — the duplicate is passed through rather than de-duplicated on the way', async () => {
    const { port, queries } = makeCapturingPort();

    await makeFeedQuery(port).getFeedSkus();

    /* feed.cfc:L64 repeats model/service/SkuService.cfc:L314 verbatim. Collapsing it here would be a
     * repair; the adapter absorbs it instead, and proves against
     * org/Hibachi/HibachiSmartList.cfc:L258 and :L269 that the legacy absorbs it too. */
    const productJoins = (queries[0]?.joins ?? []).filter(
      (join) => join.parentEntityName === 'SlatwallSku' && join.relatedProperty === 'product',
    );
    expect(productJoins).toHaveLength(2);
  });

  it('NET-NEW — the three filters and the one range travel in the same call, with the legacy values', async () => {
    const { port, queries } = makeCapturingPort();

    await makeFeedQuery(port).getFeedSkus();

    const group = queries[0]?.whereGroups?.[0];
    expect(group?.filters).toEqual([
      // feed.cfc:L68-L70. The value is the NUMBER 1, as all three legacy call sites pass it.
      { propertyIdentifier: 'activeFlag', value: 1 },
      { propertyIdentifier: 'product.activeFlag', value: 1 },
      { propertyIdentifier: 'product.publishedFlag', value: 1 },
    ]);
    /* feed.cfc:L72 — `1^` is a LOWER bound with no upper bound, per
     * org/Hibachi/HibachiSmartList.cfc:L642-L646. */
    expect(group?.ranges).toEqual([
      { propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' },
    ]);
  });

  it('NET-NEW — the service’s five keyword properties are inherited, not re-derived by the feed', async () => {
    const { port, queries } = makeCapturingPort();

    await makeFeedQuery(port).getFeedSkus();

    /* model/service/SkuService.cfc:L318-L322, all at weight 1. The feed layers onto the service's
     * smart list rather than replacing it, so these arrive without the integration restating them. */
    expect(queries[0]?.keywordProperties).toHaveLength(5);
    expect(queries[0]?.entityName).toBe('SlatwallSku');
  });

  it('NET-NEW — no ordering, paging, keyword or saved state is invented', async () => {
    const { port, queries } = makeCapturingPort();

    await makeFeedQuery(port).getFeedSkus();

    /* feed.cfc:L63 passes nothing at all, so a default here would change every one of the six
     * in-repository callers invisibly. */
    expect(queries[0]?.orders).toBeUndefined();
    expect(queries[0]?.pagination).toBeUndefined();
    expect(queries[0]?.keywords).toBeUndefined();
  });
});

describe('the feed joins reach the emitted statement (INT-01)', () => {
  function runFeed(): {
    /* The feed reads the unpaged collection alone, so this is the records array, not the three-view
     * result — see `ProductFeedQuery.getFeedSkus`, which routes through `getSkuSmartListRecords`. */
    readonly result: Promise<Sku[]>;
    readonly statements: Statement[];
  } {
    const { executor, statements } = makeRecordingExecutor(FEED_TABLES);
    const builder = new SmartListQueryBuilder(
      executor,
      createCatalogAggregateLoaders({ bindDefaultSkuDelegate: bindDelegate }),
    );

    return { result: makeFeedQuery(builder).getFeedSkus(), statements };
  }

  /** The record projection — the first statement the builder issues. */
  async function recordsSql(): Promise<string> {
    const { result, statements } = runFeed();
    await result;
    return statements[0]?.sql ?? '';
  }

  it('NET-NEW — the default-SKU and brand joins are named, which before this fix they were not', async () => {
    const sql = await recordsSql();

    /* feed.cfc:L65 — the product's default SKU, a second alias over the same physical table. */
    expect(sql).toContain(
      'JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID',
    );
    /* feed.cfc:L66 — the brand. The feed's `g:brand` field reads it. */
    expect(sql).toContain(
      'JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID',
    );
  });

  it('NET-NEW — NOTHING renders as an inner join, so no brandless product can be dropped', async () => {
    const { result, statements } = runFeed();
    await result;

    /* The assertion that carries the meaning. An omitted kind and an explicit `left` emit the same
     * keyword (org/Hibachi/HibachiSmartList.cfc:L537-L540), so the observable guarantee is the absence
     * of an eliminating join rather than the presence of the word `left` on one of the six. */
    for (const statement of statements) {
      expect(statement.sql).not.toContain('INNER JOIN');
    }
    expect(statements[0]?.sql).toContain('LEFT JOIN SwBrand');
  });

  it('NET-NEW — the six declared joins emit FIVE, because the duplicate is absorbed', async () => {
    const sql = await recordsSql();

    /* org/Hibachi/HibachiSmartList.cfc:L269 finds the key already registered and appends nothing, so
     * the repeated `("SlatwallSku","product")` contributes no entity, no alias and no FROM fragment. */
    expect(sql.match(/JOIN SwProduct\b/g)).toHaveLength(1);
    expect(sql.match(/ JOIN /g)).toHaveLength(5);
  });

  it('NET-NEW — the joins are emitted in declaration order', async () => {
    const sql = await recordsSql();

    const order = [
      sql.indexOf('JOIN SwProduct '),
      sql.indexOf('JOIN SwProductType '),
      sql.indexOf('JOIN SwAlternateSkuCode '),
      sql.indexOf('JOIN SwSku bslatwallsku'),
      sql.indexOf('JOIN SwBrand '),
    ];
    for (const position of order) {
      expect(position).toBeGreaterThan(0);
    }
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it('NET-NEW — every value is bound positionally and none is interpolated', async () => {
    const { result, statements } = runFeed();
    await result;

    /* Three equality predicates bound to the number 1, then the inclusive lower bound. The bound value
     * is the STRING `1`: it is the first element of the two-character range value, carried as the
     * legacy carries it rather than coerced. */
    expect(statements[0]?.params).toEqual([1, 1, 1, '1']);
    expect(statements[0]?.sql).toContain('>= ?');
    for (const statement of statements) {
      expect(statement.sql).not.toContain("'");
      expect(statement.sql).not.toContain(ID.product);
    }
  });

  it('NET-NEW — the feed’s records carry their product aggregate, so the builder can shape them', async () => {
    const { result } = runFeed();
    const feed = await result;

    /* The other half of the feed's contract: `ProductFeedBuilder` reads `sku.product`, then that
     * product's `productType`, `brand` and — through `getPrice()` — its `defaultSku`. */
    expect(feed).toHaveLength(2);
    const first = feed[0];
    expect(first).toBeInstanceOf(Sku);
    expect(first?.product).toBeDefined();
    expect(first?.product?.productType?.productTypeID).toBe(ID.productType);
    expect(first?.product?.brand?.brandID).toBe(ID.brand);
    expect(first?.product?.defaultSku?.getPrice()).toBe(toExactDecimal('99.00'));
    /* '99.00', not 99: F07 preserves the digits AND the scale the row carried — the fixture row spells
     * `price: '99.00'`, and keeping that spelling is the whole point of the exact-decimal type. */
  });
});
