/**
 * The smart-list SQL-emission seam — INT-07.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/test/**` | CREATE. The subject of this file is
 * `src/adapters/mysql/SmartListQueryBuilder.ts` — the port of the dynamic paginated query builder
 * `org/Hibachi/HibachiSmartList.cfc` (AAP 0.3.3, pattern row "Query builder", and AAP 0.4.1.7).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * Before this file the builder had no suite of its own. Coverage reached it only incidentally, through
 * consumers: `test/integrations/ProductFeedQuery.test.ts` asserts the statement the FEED happens to
 * emit, and `test/adapters/catalogAggregates.test.ts` drives `execute()` to reach the hydration hook.
 * Neither owns the builder's own contract, so the properties below could all have been broken without
 * a single delivered test going red:
 *
 *   - the THREE statements one `build()` produces, and which clauses each may and may not carry;
 *   - the DISTINCT asymmetry between the record projection and the count projection, which
 *     `SMARTLIST_DISTINCT_ASYMMETRY` declares and which AAP 0.7.3 standard 7 forbids repairing;
 *   - the pagination arithmetic and the legacy defaults it starts from;
 *   - which statements `execute()` and `executeRecords()` actually issue, and in what order;
 *   - that an identifier the extracted schema does not declare is refused BEFORE any statement text
 *     is assembled, so no rejected identifier can ever reach a driver;
 *   - the emitted form of every operator the slice uses.
 *
 * ⚠️ THE JOIN ARITHMETIC IS ASSERTED TWICE, ON PURPOSE. Six declared joins reach the feed and five are
 * emitted. Two independent mechanisms produce that, and each is asserted separately, because either one
 * alone would make the other's failure invisible:
 *   1. `mergeSmartListJoins` de-duplicates on `parentEntityName.relatedProperty` before `build()` ever
 *      sees the array (`src/util/smartListInput.ts`);
 *   2. the builder's own existence guard — the port of
 *      `org/Hibachi/HibachiSmartList.cfc:L270` — appends no entity, no alias and no FROM fragment for a
 *      key already registered, so even six UN-merged joins still emit five.
 *
 * ⚠️ NOTHING MAY RENDER AS AN INNER JOIN. `joinRelatedProperty` defaults its join kind to the empty
 * string (`org/Hibachi/HibachiSmartList.cfc:L212`) and `:L539-L541` rewrites an empty kind to `left`, so
 * an omitted kind and an explicit `'left'` emit the SAME keyword. The observable guarantee is therefore
 * the ABSENCE of an eliminating join rather than the presence of the word `left` on any one row — which
 * is what keeps a brandless product in the Google feed.
 *
 * NO DATABASE, NO NETWORK. A recording executor double records every `{ sql, params }` pair and answers
 * by queue, exactly as the sibling adapter suites do. AAP 0.8.4 records that no CFML runtime exists here
 * and that the `Sw*` tables are absent from this repository, so a live comparison is impossible and is
 * not implied.
 *
 * TEST PROVENANCE: every case in this file is **NET-NEW**. AAP 0.6.5.2 records that no legacy DAO test
 * exists for this slice — no `SkuDAOTest`, no `OptionDAOTest` — and none exists for the framework smart
 * list either. AAP 0.8.3.7 requires that absence be flagged rather than implied away, which is why every
 * title below is labelled and none claims parity with a legacy test.
 *
 * TRACEABILITY IS DOCUMENTARY, NEVER EMPIRICAL. `meta/tests/readme.txt:L4-L5` requires an external
 * MXUnit mapping that is not vendored, and `meta/docker/slatwall-local-dev/` — cited by the prompt —
 * does not exist. Every legacy locator below was therefore read from source, per AAP 0.6.5.3 and
 * AAP 0.8.4.
 *
 * SCOPE. This file asserts what the builder EMITS and REFUSES. It does not re-assert row hydration
 * (`test/adapters/catalogAggregates.test.ts`), the feed's filter and join SELECTION
 * (`test/integrations/ProductFeedQuery.test.ts`), or feed field mapping
 * (`test/integrations/ProductFeedBuilder.test.ts`).
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import {
  SMARTLIST_DISTINCT_ASYMMETRY,
  SmartListQueryBuilder,
  describePropertyScopedSmartList,
} from '../../src/adapters/mysql/SmartListQueryBuilder';
import { DomainError } from '../../src/errors/DomainError';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/catalogAggregates';
import { PRODUCT_FEED_JOINS } from '../../src/integrations/google/ProductFeedQuery';
import { mergeSmartListJoins } from '../../src/util/smartListInput';
import {
  createFanningSqlExecutorDouble,
  createSqlExecutorDouble,
  sqlRows,
} from '../support/inMemoryRepositories';

import type { CompiledSmartListQuery } from '../../src/adapters/mysql/SmartListQueryBuilder';
import type { CatalogAggregateLoader } from '../../src/adapters/mysql/catalogAggregates';
import type { ProductDefaultSkuDelegate } from '../../src/domain/product/Product';
import type { Sku } from '../../src/domain/sku/Sku';
import type {
  SmartListEntityName,
  SmartListJoin,
  SmartListQuery,
  SmartListQueryPort,
} from '../../src/ports/SmartListQueryPort';
import type { SqlExecutorCall } from '../support/inMemoryRepositories';

/* =================================================================================================
 * COMPILE-TIME CLAIMS
 * ================================================================================================*/

type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/** The builder IS the port. AAP 0.3.3 wires `SmartListQueryPort` to this one implementation. */
type _BuilderImplementsPort = AssertAssignable<SmartListQueryBuilder, SmartListQueryPort>;

/** Every compiled query carries three statements, and each carries sql plus positional params. */
type _CompiledCarriesThreeStatements = AssertAssignable<
  CompiledSmartListQuery,
  {
    readonly records: { readonly sql: string; readonly params: readonly unknown[] };
    readonly pageRecords: { readonly sql: string; readonly params: readonly unknown[] };
    readonly recordsCount: { readonly sql: string; readonly params: readonly unknown[] };
  }
>;

/* =================================================================================================
 * FIXTURES — frozen literals only at module scope; every builder is built fresh per case.
 * ================================================================================================*/

/**
 * The three joins `getSkuSmartList` declares, transcribed from
 * `model/service/SkuService.cfc:L314-L316`.
 *
 * The port holds these in a module-private constant inside `src/services/SkuService.ts`, so the LEGACY
 * declaration is the oracle this file reads rather than a re-export. Transcribing rather than importing
 * is deliberate: if the port's private copy ever drifts from `SkuService.cfc`, the feed-composition case
 * below stops matching the statement `ProductFeedQuery.test.ts` observes end-to-end, and one of the two
 * suites goes red.
 */
const SKU_SMART_LIST_JOINS_AS_DECLARED: readonly SmartListJoin[] = Object.freeze([
  Object.freeze({ parentEntityName: 'SlatwallSku', relatedProperty: 'product' }),
  Object.freeze({ parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' }),
  Object.freeze({
    parentEntityName: 'SlatwallSku',
    relatedProperty: 'alternateSkuCodes',
    joinType: 'left',
  }),
] satisfies SmartListJoin[]);

/** 32-character identifiers, per IR-6: application-generated, undashed, string-typed. */
const ID = Object.freeze({
  brandAlpha: 'aa11bb22cc33dd44ee55ff6677889900',
  brandBeta: 'bb22cc33dd44ee55ff6677889900aa11',
  optionGroup: 'cc33dd44ee55ff6677889900aa11bb22',
  product: 'dd44ee55ff6677889900aa11bb22cc33',
});

/**
 * The binder the aggregate loaders take. Every case in this file either compiles a statement without
 * executing it, or executes against `SlatwallBrand` — for which `createCatalogAggregateLoaders`
 * supplies no loader and `hydrateAssociations` returns immediately. So this binder must never run, and
 * throwing is how that expectation is enforced rather than assumed.
 */
function refuseDefaultSkuBinding(_sku: Sku): ProductDefaultSkuDelegate {
  throw new Error(
    'The default-SKU binder ran, which means a case in this file executed against an entity that ' +
      'loads aggregates. Statement-shape cases must not, because the loader issues further statements.',
  );
}

function makeAggregateLoaders(): Readonly<
  Record<SmartListEntityName, CatalogAggregateLoader | undefined>
> {
  return createCatalogAggregateLoaders({ bindDefaultSkuDelegate: refuseDefaultSkuBinding });
}

interface BuilderScenario {
  readonly builder: SmartListQueryBuilder;
  readonly calls: readonly SqlExecutorCall[];
}

/** A builder over an executor that answers nothing, for the cases that only compile statements. */
function compileOnly(): BuilderScenario {
  const { executor, calls } = createSqlExecutorDouble({});

  return { builder: new SmartListQueryBuilder(executor, makeAggregateLoaders()), calls };
}

/** Compile one query and return the three statements plus the executor call log. */
function compile(query: SmartListQuery): {
  readonly compiled: CompiledSmartListQuery;
  readonly calls: readonly SqlExecutorCall[];
} {
  const scenario = compileOnly();

  return { compiled: scenario.builder.build(query), calls: scenario.calls };
}

/** Every statement of a compiled query, for the sweeps that must hold across all three. */
function allStatements(compiled: CompiledSmartListQuery): readonly string[] {
  return [compiled.records.sql, compiled.pageRecords.sql, compiled.recordsCount.sql];
}

/** The feed's own composition: the service's three joins, then the feed's three, de-duplicated. */
function feedJoins(): readonly SmartListJoin[] {
  return mergeSmartListJoins(SKU_SMART_LIST_JOINS_AS_DECLARED, PRODUCT_FEED_JOINS);
}

/**
 * The query the Google feed compiles, transcribed from `integrationServices/google/controllers/feed.cfc`
 * — three activity and publication filters and the inclusive availability range.
 */
function feedQuery(joins: readonly SmartListJoin[]): SmartListQuery<'SlatwallSku'> {
  return {
    entityName: 'SlatwallSku',
    joins,
    whereGroups: [
      {
        filters: [
          { propertyIdentifier: 'activeFlag', value: 1 },
          { propertyIdentifier: 'product.activeFlag', value: 1 },
          { propertyIdentifier: 'product.publishedFlag', value: 1 },
        ],
        ranges: [{ propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' }],
      },
    ],
  };
}

/** Two brand rows. `SlatwallBrand` is the one root entity that loads no aggregate and hydrates none. */
const BRAND_ROWS = Object.freeze([
  Object.freeze({ brandID: ID.brandAlpha, brandName: 'Alpha' }),
  Object.freeze({ brandID: ID.brandBeta, brandName: 'Beta' }),
]);

/* =================================================================================================
 * THE STATEMENT TRIPLE
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — the three statements one build() produces (INT-07)', () => {
  it('[NET-NEW] the record statement is select, from, where and order — with no bound at all', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* `org/Hibachi/HibachiSmartList.cfc:L748` composes select + from + where + order, and `:L753`
     * executes it with NO offset and NO maxresults. The unpaged collection is genuinely unbounded. */
    expect(compiled.records.sql.startsWith('SELECT aslatwallsku.* FROM SwSku aslatwallsku ')).toBe(
      true,
    );
    expect(compiled.records.sql).toContain(' WHERE ');
    expect(compiled.records.sql.endsWith(' ORDER BY aslatwallsku.createdDateTime ASC')).toBe(true);
    expect(compiled.records.sql).not.toContain('LIMIT');
    expect(compiled.records.sql).not.toContain('OFFSET');
  });

  it('[NET-NEW] the page statement is the record statement plus LIMIT ? OFFSET ? and nothing else', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* `:L762` reuses the SAME HQL and supplies offset and maxresults as execution options, so the only
     * difference between the two statements is the bound. Asserting equality of the prefix — rather
     * than two independently spelled expectations — is what makes a divergence impossible to miss. */
    expect(compiled.pageRecords.sql).toBe(`${compiled.records.sql} LIMIT ? OFFSET ?`);
  });

  it('[NET-NEW] the counting statement carries no ORDER BY and no bound', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* `:L777` composes select(countOnly) + from(allowFetch=false) + where. Ordering a scalar aggregate
     * would be pointless and bounding it would change the answer, so neither clause appears. */
    expect(compiled.recordsCount.sql).not.toContain('ORDER BY');
    expect(compiled.recordsCount.sql).not.toContain('LIMIT');
    expect(compiled.recordsCount.sql).not.toContain('OFFSET');
    expect(compiled.recordsCount.sql).toContain(' WHERE ');
  });

  it('[NET-NEW] all three statements share one FROM clause, so no view can filter differently', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    const fromClause =
      ' FROM SwSku aslatwallsku ' +
      'LEFT JOIN SwProduct aslatwallproduct ON aslatwallproduct.productID = aslatwallsku.productID ' +
      'LEFT JOIN SwProductType aslatwallproducttype ' +
      'ON aslatwallproducttype.productTypeID = aslatwallproduct.productTypeID ' +
      'LEFT JOIN SwAlternateSkuCode aslatwallalternateskucode ' +
      'ON aslatwallalternateskucode.skuID = aslatwallsku.skuID ' +
      'LEFT JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID ' +
      'LEFT JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID';

    for (const sql of allStatements(compiled)) {
      expect(sql).toContain(fromClause);
    }
  });

  it('[NET-NEW] records and recordsCount bind the identical parameter array', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* `:L753`, `:L762` and `:L778` all pass `getHQLParams()` — one accumulated array, three uses. A
     * count that bound different values would report a total the record view could never produce. */
    expect(compiled.recordsCount.params).toEqual(compiled.records.params);
    expect(compiled.records.params).toEqual([1, 1, 1, '1']);
  });

  it('[NET-NEW] the page statement appends exactly two bindings, and they are the bound', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    expect(compiled.pageRecords.params).toHaveLength(compiled.records.params.length + 2);
    expect(compiled.pageRecords.params.slice(0, compiled.records.params.length)).toEqual([
      ...compiled.records.params,
    ]);
    /* The row-count bindings are STRINGS. `toRowCountBinding` validates a whole non-negative number and
     * then stringifies it, which is what keeps `LIMIT`/`OFFSET` parameterised instead of interpolated
     * — `?` binds values only, so a numeric literal spliced into the text would be the alternative. */
    expect(compiled.pageRecords.params.slice(-2)).toEqual(['10', '0']);
  });

  it('[NET-NEW] build() compiles without issuing a single statement', () => {
    const { calls } = compile(feedQuery(feedJoins()));

    /* Compilation is pure. `execute` is the only member that reaches the executor, which is what lets
     * every refusal case below assert `calls` is empty and mean "before any statement text ran". */
    expect(calls).toHaveLength(0);
  });

  it('[NET-NEW] the compiled query reports the base table and alias it actually emitted', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    expect(compiled.entityName).toBe('SlatwallSku');
    expect(compiled.baseTable).toBe('SwSku');
    expect(compiled.baseAlias).toBe('aslatwallsku');
    expect(compiled.records.sql).toContain(`${compiled.baseTable} ${compiled.baseAlias} `);
  });

  it('[NET-NEW] a query with no filters emits no WHERE clause and binds nothing', () => {
    const { compiled } = compile({ entityName: 'SlatwallBrand' });

    expect(compiled.records.sql).toBe(
      'SELECT aslatwallbrand.* FROM SwBrand aslatwallbrand ORDER BY aslatwallbrand.createdDateTime ASC',
    );
    expect(compiled.records.params).toEqual([]);
    expect(compiled.recordsCount.sql).not.toContain('WHERE');
  });

  it('[NET-NEW] a where group that composes no predicate is dropped rather than emitted empty', () => {
    /* A range with neither bound composes nothing (`composeRange` returns undefined), which leaves the
     * group with no predicates. The legacy appends nothing for such a group, so an empty `()` — which
     * MySQL would reject outright — must not appear. */
    const { compiled } = compile({
      entityName: 'SlatwallBrand',
      whereGroups: [{ ranges: [{ propertyIdentifier: 'sortOrder' }] }],
    });

    expect(compiled.records.sql).not.toContain('WHERE');
    expect(compiled.records.sql).not.toContain('()');
    expect(compiled.records.params).toEqual([]);
  });
});

/* =================================================================================================
 * THE DISTINCT ASYMMETRY — CARRIED, NOT REPAIRED
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — the DISTINCT asymmetry it carries (INT-07)', () => {
  it('[NET-NEW] the asymmetry is declared explicitly and frozen, so it reads as a decision', () => {
    /* AAP 0.7.3 standard 7 — preserve and annotate, do not repair. The constant is the annotation. */
    expect(SMARTLIST_DISTINCT_ASYMMETRY).toEqual({
      recordProjectionHonoursFlag: true,
      countProjectionIsAlwaysDistinct: true,
    });
    expect(Object.isFrozen(SMARTLIST_DISTINCT_ASYMMETRY)).toBe(true);
  });

  it('[NET-NEW] an unstated flag leaves the record projection NON-distinct', () => {
    const { compiled } = compile({ entityName: 'SlatwallProduct' });

    /* `org/Hibachi/HibachiSmartList.cfc:L59` seeds the flag with zero, so silence means non-distinct.
     * This is the half of the asymmetry `issue_1296` is numerically sensitive to. */
    expect(compiled.selectDistinct).toBe(false);
    expect(compiled.records.sql.startsWith('SELECT aslatwallproduct.*')).toBe(true);
    expect(compiled.records.sql).not.toContain('SELECT DISTINCT');
  });

  it('[NET-NEW] a set flag makes the record projection distinct', () => {
    const { compiled } = compile({ entityName: 'SlatwallProduct', selectDistinctFlag: true });

    /* `:L508` and `:L519` — the record branch consults the flag. `model/entity/Product.cfc:L254` and
     * `:L341` are the two consumers that set it, which is why the seeded FALSE is safe for the rest. */
    expect(compiled.selectDistinct).toBe(true);
    expect(compiled.records.sql.startsWith('SELECT DISTINCT aslatwallproduct.*')).toBe(true);
  });

  it('[NET-NEW] the count projection is distinct with the flag OFF — the asymmetry itself', () => {
    const { compiled } = compile({ entityName: 'SlatwallProduct' });

    /* `:L504` is unconditional: `count(distinct <alias>.<primaryID>)` regardless of any flag. So a
     * fan-out query with the flag left alone reports a DISTINCT count over NON-DISTINCT records. */
    expect(compiled.selectDistinct).toBe(false);
    expect(
      compiled.recordsCount.sql.startsWith('SELECT COUNT(DISTINCT aslatwallproduct.productID)'),
    ).toBe(true);
  });

  it('[NET-NEW] the count projection is unchanged when the flag is ON', () => {
    const withFlag = compile({ entityName: 'SlatwallProduct', selectDistinctFlag: true });
    const withoutFlag = compile({ entityName: 'SlatwallProduct' });

    expect(withFlag.compiled.recordsCount.sql).toBe(withoutFlag.compiled.recordsCount.sql);
  });

  it('[NET-NEW] the count projection names each entity’s own primary key, and aliases it recordsCount', () => {
    /* `:L504` resolves the primary identifier by entity name. Per IR-6 every one is a 32-character
     * application-generated string, which is why none of these is an auto-increment surrogate. */
    const expected: ReadonlyArray<readonly [SmartListEntityName, string, string]> = [
      ['SlatwallSku', 'aslatwallsku', 'skuID'],
      ['SlatwallProduct', 'aslatwallproduct', 'productID'],
      ['SlatwallProductType', 'aslatwallproducttype', 'productTypeID'],
      ['SlatwallBrand', 'aslatwallbrand', 'brandID'],
      ['SlatwallOption', 'aslatwalloption', 'optionID'],
      ['SlatwallOptionGroup', 'aslatwalloptiongroup', 'optionGroupID'],
      ['SlatwallAlternateSkuCode', 'aslatwallalternateskucode', 'alternateSkuCodeID'],
    ];

    for (const [entityName, alias, primaryKey] of expected) {
      const { compiled } = compile({ entityName });

      expect(compiled.recordsCount.sql).toContain(
        `SELECT COUNT(DISTINCT ${alias}.${primaryKey}) AS recordsCount`,
      );
    }
  });
});

/* =================================================================================================
 * THE SAME ASYMMETRY, OBSERVED IN RESULTS RATHER THAN IN STATEMENT TEXT
 *
 * ⚠️ WHY A SECOND BLOCK ON ONE BEHAVIOUR. Every case above reads `compiled.records.sql` and asserts the
 * presence or absence of the word `DISTINCT`. That is a real assertion, but it is an assertion about a
 * STRING, and a string assertion cannot show what the string DOES. The asymmetry only matters because it
 * changes how many objects a caller receives from a fanning join, and no case above receives any object
 * at all.
 *
 * The gap is not hypothetical. A projection that emitted `SELECT DISTINCTROW` — or one that emitted the
 * keyword and then had its rows re-expanded downstream — would satisfy every text case above while
 * returning duplicates. Conversely a projection that dropped the keyword entirely would fail the text
 * cases loudly, which is good, but the text cases still would not say what a caller LOSES: they name a
 * missing substring, not a duplicated brand.
 *
 * So these cases execute. Rows are answered from the emitted statement's OWN projection — the fanning
 * executor picks the collapsed row set only when the statement it was handed actually says
 * `SELECT DISTINCT` — which makes each count below a genuine consequence of the builder's choice rather
 * than of a queue position.
 *
 * ⚠️ THIS BLOCK IS DELIBERATELY FALSIFIABLE IN BOTH DIRECTIONS, and that pairing is the point:
 *   - remove DISTINCT from the record projection and the flag-ON cases fail;
 *   - make the record projection UNCONDITIONALLY distinct — the instinctive "repair" of an asymmetry
 *     that looks like a bug — and the flag-OFF case fails instead.
 * AAP §0.7.3 standard 7 forbids that repair, so the second half is as load-bearing as the first. An
 * asymmetry asserted in one direction only is an asymmetry half of which can be silently removed.
 *
 * THE FAN IS REAL, NOT CONTRIVED. `SlatwallBrand.products` is a declared one-to-many
 * (`model/entity/Brand.cfc:L61`, `fkcolumn="brandID" inverse="true"`), so a brand filtered by a property
 * of its products joins one brand row per matching product and fans exactly as the legacy does. Brand is
 * also the one root entity that loads no aggregates and hydrates no associations, so every statement
 * counted below is a root statement and none is hydration noise.
 * ================================================================================================*/

/** One brand carrying two matching products, another carrying one. Three rows, two owners. */
const FANNED_BRAND_ROWS = Object.freeze([
  Object.freeze({ brandID: ID.brandAlpha, brandName: 'Alpha' }),
  Object.freeze({ brandID: ID.brandAlpha, brandName: 'Alpha' }),
  Object.freeze({ brandID: ID.brandBeta, brandName: 'Beta' }),
]);

/**
 * A brand root filtered through its products — the shape that fans.
 *
 * `selectDistinctFlag` is passed through untouched so one query definition serves both halves of the
 * asymmetry and no other difference can account for a divergence between them.
 */
function fanningBrandQuery(
  overrides: Partial<SmartListQuery<'SlatwallBrand'>> = {},
): SmartListQuery<'SlatwallBrand'> {
  return {
    entityName: 'SlatwallBrand',
    joins: [{ parentEntityName: 'SlatwallBrand', relatedProperty: 'products' }],
    whereGroups: [{ filters: [{ propertyIdentifier: 'products.activeFlag', value: 1 }] }],
    ...overrides,
  };
}

/** A builder over the fanning executor, with no budget wired. */
function fanningScenario(): {
  readonly builder: SmartListQueryBuilder;
  readonly fanning: ReturnType<typeof createFanningSqlExecutorDouble>;
} {
  const fanning = createFanningSqlExecutorDouble({
    rootRows: FANNED_BRAND_ROWS,
    rootIdentityColumn: 'brandID',
  });

  return {
    builder: new SmartListQueryBuilder(fanning.executor, makeAggregateLoaders()),
    fanning,
  };
}

describe('NET-NEW SmartListQueryBuilder — the DISTINCT asymmetry, observed in results (INT-07)', () => {
  it('[NET-NEW] with the flag OFF the records DIVERGE from the count — the carried defect, executed', async () => {
    const { builder, fanning } = fanningScenario();

    const result = await builder.execute(fanningBrandQuery());

    /* THREE records for TWO brands. `org/Hibachi/HibachiSmartList.cfc:L59` seeds the flag with zero and
     * `:L504` counts distinct unconditionally, so a caller that states nothing gets a record collection
     * measured one way and a total measured another. This is the divergence `issue_1296` was filed
     * against, reproduced here at the layer that causes it.
     *
     * ⛔ DO NOT "FIX" THIS CASE. AAP §0.7.3 standard 7 and AAP §0.8.2 guideline 4 both forbid repairing a
     * carried legacy defect, and making the record projection unconditionally distinct is exactly that
     * repair. This assertion exists so the repair cannot be made quietly. */
    expect(result.records).toHaveLength(3);
    expect(result.recordsCount).toBe(2);
    expect(fanning.distinctRootCount()).toBe(2);
  });

  it('[NET-NEW] with the flag ON the records AGREE with the count', async () => {
    const { builder, fanning } = fanningScenario();

    const result = await builder.execute(fanningBrandQuery({ selectDistinctFlag: true }));

    /* Same rows, same join, same fan — only the flag differs, and now the two measurements agree. The
     * count could not have produced this change, because the previous case already established that the
     * counting statement is byte-identical either way. */
    expect(result.records).toHaveLength(2);
    expect(result.recordsCount).toBe(2);
    expect(result.records.map((brand) => brand.brandID)).toStrictEqual([
      ID.brandAlpha,
      ID.brandBeta,
    ]);
    expect(fanning.distinctRootCount()).toBe(2);
  });

  it('[NET-NEW] the divergence is entirely on the record side — one identical counting statement', async () => {
    const withoutFlag = fanningScenario();
    const withFlag = fanningScenario();

    await withoutFlag.builder.execute(fanningBrandQuery());
    await withFlag.builder.execute(fanningBrandQuery({ selectDistinctFlag: true }));

    const countOf = (statements: readonly string[]): string | undefined =>
      statements.find((sql) => sql.includes('COUNT(DISTINCT '));

    /* The strongest available statement of "the asymmetry lives in one projection": the counting
     * statement is identical text in both runs, so nothing about the count can explain three records
     * becoming two. Only the record projection changed, and it changed because the flag changed. */
    expect(countOf(withFlag.fanning.statements())).toBe(countOf(withoutFlag.fanning.statements()));
    expect(countOf(withoutFlag.fanning.statements())).toContain(
      'COUNT(DISTINCT aslatwallbrand.brandID)',
    );
  });

  it('[NET-NEW] a duplicate consumes a PAGE SLOT when the flag is off, and does not when it is on', async () => {
    const withoutFlag = fanningScenario();
    const withFlag = fanningScenario();
    /* Record TWO of a one-per-page window. In the fanned set that position is Alpha AGAIN; in the
     * collapsed set it is Beta. The window arithmetic is identical in both runs, so the row that lands in
     * it is decided purely by whether the duplicate was ever emitted. */
    const pagination = { pageRecordsStart: 2, pageRecordsShow: 1 } as const;

    const fanned = await withoutFlag.builder.execute(fanningBrandQuery({ pagination }));
    const collapsed = await withFlag.builder.execute(
      fanningBrandQuery({ pagination, selectDistinctFlag: true }),
    );

    /* This is the user-visible consequence, and it is why the asymmetry is worth a block of its own: a
     * caller paging a fanning smart list with the flag unstated sees the same brand twice and never
     * reaches Beta at all, while the total it is shown alongside says there are two. */
    expect(fanned.pageRecords.map((brand) => brand.brandID)).toStrictEqual([ID.brandAlpha]);
    expect(collapsed.pageRecords.map((brand) => brand.brandID)).toStrictEqual([ID.brandBeta]);

    /* The page statement really was issued in both runs — the window could not be reused, because two
     * records do not fit a one-record page — and it binds limit and offset LAST, after the filter value,
     * as digit strings. */
    for (const scenario of [withoutFlag, withFlag]) {
      const pageCall = scenario.fanning.calls.find((call) =>
        call.sql.includes(' LIMIT ? OFFSET ?'),
      );

      expect(pageCall?.params).toStrictEqual([1, '1', '1']);
    }
  });

  it('[NET-NEW] executeRecords carries the same asymmetry, since it shares the record projection', async () => {
    const withoutFlag = fanningScenario();
    const withFlag = fanningScenario();

    const fanned = await withoutFlag.builder.executeRecords(fanningBrandQuery());
    const collapsed = await withFlag.builder.executeRecords(
      fanningBrandQuery({ selectDistinctFlag: true }),
    );

    /* The records-only member emits the SAME unpaged statement `execute()` does, so it inherits the same
     * asymmetry rather than having one of its own. That matters for the Google feed, which reads through
     * this member: a feed built over a fanning join would emit one `<item>` per duplicated row. The feed
     * itself states no flag — `integrationServices/google/controllers/feed.cfc` sets none — which is why
     * the flag-OFF number here is the number that reaches production, and why it is asserted rather than
     * only described. */
    expect(fanned).toHaveLength(3);
    expect(collapsed).toHaveLength(2);

    /* With no budget wired, neither reading issues a counting statement, so the divergence above is
     * observed with exactly one statement per run and cannot be an artefact of a count. */
    expect(withoutFlag.fanning.calls).toHaveLength(1);
    expect(withFlag.fanning.calls).toHaveLength(1);
  });
});

/* =================================================================================================
 * JOIN COMPOSITION — SIX DECLARED, FIVE EMITTED, NONE ELIMINATING
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — join composition for the feed (INT-07)', () => {
  it('[NET-NEW] the feed declares six joins across the two sources', () => {
    /* The service's three (`model/service/SkuService.cfc:L314-L316`) and the feed's three
     * (`integrationServices/google/controllers/feed.cfc:L64-L66`). The duplicate is the SKU-to-product
     * hop, which both sources name. */
    expect(SKU_SMART_LIST_JOINS_AS_DECLARED).toHaveLength(3);
    expect(PRODUCT_FEED_JOINS).toHaveLength(3);
    expect(
      [...SKU_SMART_LIST_JOINS_AS_DECLARED, ...PRODUCT_FEED_JOINS].filter(
        (join) => join.parentEntityName === 'SlatwallSku' && join.relatedProperty === 'product',
      ),
    ).toHaveLength(2);
  });

  it('[NET-NEW] mechanism 1 — mergeSmartListJoins absorbs the duplicate before build() sees it', () => {
    const merged = feedJoins();

    /* De-duplication is keyed on `parentEntityName.relatedProperty`, and the FIRST occurrence wins, so
     * the service's plain hop survives and the feed's repeat is dropped — not the reverse. */
    expect(merged).toHaveLength(5);
    expect(merged[0]).toEqual({ parentEntityName: 'SlatwallSku', relatedProperty: 'product' });
    expect(
      merged.filter(
        (join) => join.parentEntityName === 'SlatwallSku' && join.relatedProperty === 'product',
      ),
    ).toHaveLength(1);
  });

  it('[NET-NEW] mechanism 2 — six UN-merged joins still emit five, by the builder’s own guard', () => {
    const { compiled } = compile(
      feedQuery([...SKU_SMART_LIST_JOINS_AS_DECLARED, ...PRODUCT_FEED_JOINS]),
    );

    /* `org/Hibachi/HibachiSmartList.cfc:L270` finds the key already registered and appends nothing to
     * the join order, so the repeated hop contributes no entity, no alias and no FROM fragment. This is
     * asserted independently of mechanism 1 so that neither can mask the other's failure. */
    expect(compiled.records.sql.match(/ JOIN /g)).toHaveLength(5);
    expect(compiled.records.sql.match(/JOIN SwProduct\b/g)).toHaveLength(1);
  });

  it('[NET-NEW] both mechanisms together produce the identical FROM clause', () => {
    const merged = compile(feedQuery(feedJoins()));
    const unmerged = compile(
      feedQuery([...SKU_SMART_LIST_JOINS_AS_DECLARED, ...PRODUCT_FEED_JOINS]),
    );

    /* The strongest statement available: whether the duplicate is removed early or absorbed late, the
     * emitted statement is byte-identical. A regression in either mechanism breaks this equality. */
    expect(unmerged.compiled.records.sql).toBe(merged.compiled.records.sql);
    expect(unmerged.compiled.records.params).toEqual([...merged.compiled.records.params]);
  });

  it('[NET-NEW] NOTHING renders as an inner join, in any of the three statements', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* The assertion that carries the meaning. An omitted kind and an explicit `left` emit the same
     * keyword (`org/Hibachi/HibachiSmartList.cfc:L539-L541`), so the observable guarantee is the
     * absence of an eliminating join — which is what keeps a brandless product in the feed. */
    for (const sql of allStatements(compiled)) {
      expect(sql).not.toContain('INNER JOIN');
      expect(sql.match(/ JOIN /g)).toHaveLength(5);
      expect(sql.match(/LEFT JOIN /g)).toHaveLength(5);
    }
  });

  it('[NET-NEW] the brand join is present and left, so a brandless product survives the feed', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    expect(compiled.records.sql).toContain(
      'LEFT JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID',
    );
  });

  it('[NET-NEW] the five joins are emitted in declaration order', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    const positions = [
      compiled.records.sql.indexOf('JOIN SwProduct '),
      compiled.records.sql.indexOf('JOIN SwProductType '),
      compiled.records.sql.indexOf('JOIN SwAlternateSkuCode '),
      compiled.records.sql.indexOf('JOIN SwSku bslatwallsku'),
      compiled.records.sql.indexOf('JOIN SwBrand '),
    ];

    for (const position of positions) {
      expect(position).toBeGreaterThan(0);
    }
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('[NET-NEW] a second alias over the same physical table advances to the next letter', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* `org/Hibachi/HibachiSmartList.cfc:L251` supplies the twelve letters `a` through `l` and
     * `:L254-L256` advances through them, renaming the registry key on each advance. `SwSku` appears
     * twice — the base and the product's default SKU — so the second one must be `b`, not a collision. */
    expect(compiled.baseAlias).toBe('aslatwallsku');
    expect(compiled.records.sql).toContain(
      'LEFT JOIN SwSku bslatwallsku ON bslatwallsku.skuID = aslatwallproduct.defaultSkuID',
    );
    expect(compiled.records.sql.match(/\bbslatwallsku\b/g)).not.toBeNull();
  });

  it('[NET-NEW] a dotted filter path auto-joins the hop it needs, once, with no join type', () => {
    /* `resolvePropertyPath` walks every segment but the last as a hop. The feed declares the SKU-to-
     * product join anyway, so this case uses a query that declares NO joins and lets the path create it
     * — proving the auto-join exists rather than being supplied by the declaration. */
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [{ filters: [{ propertyIdentifier: 'product.productName', value: 'Widget' }] }],
    });

    expect(compiled.records.sql).toContain(
      'LEFT JOIN SwProduct aslatwallproduct ON aslatwallproduct.productID = aslatwallsku.productID',
    );
    expect(compiled.records.sql.match(/ JOIN /g)).toHaveLength(1);
    expect(compiled.records.sql).toContain('aslatwallproduct.productName = ?');
  });

  it('[NET-NEW] a many-to-many hop emits the link table first, then the far entity', () => {
    /* `SwSkuOption` is the link table declared at `model/entity/Sku.cfc:L76`. HQL names the association
     * and lets Hibernate supply both predicates; native SQL must state them, in that order. */
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [{ filters: [{ propertyIdentifier: 'options.optionCode', value: 'RED' }] }],
    });

    const linkPosition = compiled.records.sql.indexOf('SwSkuOption');
    const farPosition = compiled.records.sql.indexOf('JOIN SwOption ');

    expect(linkPosition).toBeGreaterThan(0);
    expect(farPosition).toBeGreaterThan(linkPosition);
    expect(compiled.records.sql).toContain('aslatwalloption.optionCode = ?');
  });

  it('[NET-NEW] no emitted statement carries a quoted literal or an interpolated identifier', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      joins: feedJoins(),
      whereGroups: [
        {
          filters: [{ propertyIdentifier: 'product', value: ID.product }],
          likeFilters: [{ propertyIdentifier: 'skuCode', value: "O'Brien" }],
        },
      ],
    });

    /* TR-4 — every value is bound positionally, never spliced. The apostrophe in the like value is the
     * adversarial half: if any value were interpolated, this statement would carry a quote and MySQL
     * would see a syntax error or an injection, whichever the attacker chose. */
    for (const sql of allStatements(compiled)) {
      expect(sql).not.toContain("'");
      expect(sql).not.toContain(ID.product);
      expect(sql).not.toContain('Brien');
    }
    expect(compiled.records.params).toEqual([ID.product, "O'Brien"]);
  });
});

/* =================================================================================================
 * PAGINATION ARITHMETIC
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — pagination arithmetic (INT-07)', () => {
  it('[NET-NEW] the legacy defaults are start 1, show 10 and page 1 — bound as "10" and "0"', () => {
    const { compiled } = compile({ entityName: 'SlatwallSku' });

    /* `org/Hibachi/HibachiSmartList.cfc` seeds all three, and `:L762` binds `pageRecordsStart - 1` as
     * the offset — so the first page is offset zero rather than one. */
    expect(compiled.pageRecordsStart).toBe(1);
    expect(compiled.pageRecordsShow).toBe(10);
    expect(compiled.currentPage).toBe(1);
    expect(compiled.pageRecords.params).toEqual(['10', '0']);
  });

  it('[NET-NEW] a declared page past the first overrides the declared start', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      pagination: { pageRecordsStart: 7, pageRecordsShow: 25, currentPageDeclaration: '3' },
    });

    /* `:L793-L794` — when the declaration is greater than one, the start is recomputed from it and the
     * supplied start is discarded. Page 3 at 25 a page begins at record 51, so the offset is 50. */
    expect(compiled.pageRecordsStart).toBe(51);
    expect(compiled.currentPage).toBe(3);
    expect(compiled.pageRecords.params).toEqual(['25', '50']);
  });

  it('[NET-NEW] a declaration of page 1 leaves an explicit start alone', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      pagination: { pageRecordsStart: 7, pageRecordsShow: 3, currentPageDeclaration: '1' },
    });

    /* The guard at `:L793` is strictly greater than one, so the first-page declaration is inert and the
     * explicit start survives. `currentPage` is then derived from the start, not from the declaration. */
    expect(compiled.pageRecordsStart).toBe(7);
    expect(compiled.pageRecords.params).toEqual(['3', '6']);
    // `:L808-L809` — ceiling(7 / 3) is 3.
    expect(compiled.currentPage).toBe(3);
  });

  it('[NET-NEW] currentPage is the ceiling of start over show, not a stored counter', () => {
    for (const [start, show, expected] of [
      [1, 10, 1],
      [10, 10, 1],
      [11, 10, 2],
      [20, 10, 2],
      [21, 10, 3],
    ] as ReadonlyArray<readonly [number, number, number]>) {
      const { compiled } = compile({
        entityName: 'SlatwallSku',
        pagination: { pageRecordsStart: start, pageRecordsShow: show },
      });

      expect(compiled.currentPage).toBe(expected);
    }
  });

  it('[NET-NEW] a page size below one is refused before any statement text is assembled', () => {
    const scenario = compileOnly();

    expect(() =>
      scenario.builder.build({ entityName: 'SlatwallSku', pagination: { pageRecordsShow: 0 } }),
    ).toThrow(/declared a page size that is not a whole number of at least one/);
    expect(scenario.calls).toHaveLength(0);
  });

  it('[NET-NEW] a fractional start is refused rather than silently floored', () => {
    const scenario = compileOnly();

    expect(() =>
      scenario.builder.build({ entityName: 'SlatwallSku', pagination: { pageRecordsStart: 2.5 } }),
    ).toThrow(/first record of the page/);
    expect(scenario.calls).toHaveLength(0);
  });

  it('[NET-NEW] a page declaration that is not a whole number of at least one is refused', () => {
    for (const declaration of ['0', '-1', 'abc', '', '2.5']) {
      const scenario = compileOnly();

      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallSku',
          pagination: { currentPageDeclaration: declaration },
        }),
      ).toThrow(/declared a current page that is not a whole number of at least one/);
      expect(scenario.calls).toHaveLength(0);
    }
  });

  it('[NET-NEW] totalPages and the clamped page end are derived from the counted total', async () => {
    const { executor } = createSqlExecutorDouble({
      outcomes: [
        sqlRows([{ recordsCount: 5 }]),
        sqlRows(BRAND_ROWS),
        sqlRows([BRAND_ROWS[0] ?? {}]),
      ],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    const result = await builder.execute({
      entityName: 'SlatwallBrand',
      pagination: { pageRecordsShow: 2 },
    });

    // `:L812-L813` — ceiling(5 / 2) is 3.
    expect(result.totalPages).toBe(3);
    expect(result.recordsCount).toBe(5);
    expect(result.pageRecordsStart).toBe(1);
    // `:L800-L803` — the window would end at record 2, and the total does not shorten it.
    expect(result.pageRecordsEnd).toBe(2);
  });

  it('[NET-NEW] a short final page reports its real end rather than the window’s end', async () => {
    const { executor } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 3 }]), sqlRows(BRAND_ROWS), sqlRows(BRAND_ROWS)],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    const result = await builder.execute({
      entityName: 'SlatwallBrand',
      pagination: { pageRecordsStart: 3, pageRecordsShow: 2 },
    });

    /* The window is records 3 and 4, but only three records exist, so the end clamps to 3 — the legacy
     * behaviour at `:L800-L803`. Reporting 4 would advertise a record that is not there. */
    expect(result.pageRecordsEnd).toBe(3);
    expect(result.totalPages).toBe(2);
  });
});

/* =================================================================================================
 * WHICH STATEMENTS execute() AND executeRecords() ACTUALLY ISSUE
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — statement issue and the three-view result (INT-07)', () => {
  it('[NET-NEW] execute counts first, then reads the unpaged collection', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    await builder.execute({ entityName: 'SlatwallBrand' });

    /* The count comes first because the materialisation budget must be able to refuse before a row is
     * read. Reading first and counting afterwards would defeat the guard asserted below. */
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql.startsWith('SELECT COUNT(DISTINCT aslatwallbrand.brandID)')).toBe(true);
    expect(calls[1]?.sql.startsWith('SELECT aslatwallbrand.*')).toBe(true);
    expect(calls[1]?.sql).not.toContain('LIMIT');
  });

  it('[NET-NEW] the bounded statement is skipped when the first page already covers every record', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    const result = await builder.execute({ entityName: 'SlatwallBrand' });

    /* Two rows against a ten-row window starting at record one: the bounded statement could only return
     * the same rows, so it is not issued and the page view reuses the record view by identity. Sending
     * it anyway would be a second full scan for an answer already in hand. */
    expect(calls).toHaveLength(2);
    expect(result.records).toBe(result.pageRecords);
    expect(result.records).toHaveLength(2);
  });

  it('[NET-NEW] the bounded statement IS issued when the window does not cover every record', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [
        sqlRows([{ recordsCount: 2 }]),
        sqlRows(BRAND_ROWS),
        sqlRows([BRAND_ROWS[0] ?? {}]),
      ],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    const result = await builder.execute({
      entityName: 'SlatwallBrand',
      pagination: { pageRecordsShow: 1 },
    });

    expect(calls).toHaveLength(3);
    expect(calls[2]?.sql.endsWith(' LIMIT ? OFFSET ?')).toBe(true);
    expect(calls[2]?.params).toEqual(['1', '0']);
    expect(result.records).toHaveLength(2);
    expect(result.pageRecords).toHaveLength(1);
    expect(result.records).not.toBe(result.pageRecords);
  });

  it('[NET-NEW] a start past the first page also forces the bounded statement', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [
        sqlRows([{ recordsCount: 2 }]),
        sqlRows(BRAND_ROWS),
        sqlRows([BRAND_ROWS[1] ?? {}]),
      ],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    /* The reuse test is start-one AND rows-within-window. A later start fails the first half even when
     * the row count would fit, because the window no longer begins at the first record. */
    await builder.execute({
      entityName: 'SlatwallBrand',
      pagination: { pageRecordsStart: 2 },
    });

    expect(calls).toHaveLength(3);
    expect(calls[2]?.params).toEqual(['10', '1']);
  });

  it('[NET-NEW] executeRecords issues exactly ONE statement when NO budget is wired', async () => {
    const { executor, calls } = createSqlExecutorDouble({ outcomes: [sqlRows(BRAND_ROWS)] });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    const records = await builder.executeRecords({ entityName: 'SlatwallBrand' });

    /* This is the member the Google feed reaches through `getSkuSmartList`. It needs neither a total
     * nor a page, and with no budget wired there is nothing for a count to be compared against — so
     * counting or bounding would be work the feed then discards. ONE statement is also exactly what
     * `getRecords()` issues at `org/Hibachi/HibachiSmartList.cfc:L751-L755`, so this is the parity
     * shape. The budgeted shape is asserted separately below; the two differ ONLY by the count.
     *
     * ⚠️ THE MEMBER NAMED HERE USED TO BE `getSkuSmartListRecords`, AND THAT NAME NO LONGER EXISTS.
     * It was an additive records-only sibling; AAP §0.4.2.2 fixes `SkuService` at nine ported members
     * plus `newSku`, so it was withdrawn from the service. The SHAPE this case asserts is unchanged —
     * it is the builder's, not the service's — and `getSkuSmartList` is the surviving route to it. */
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).not.toContain('COUNT(');
    expect(calls[0]?.sql).not.toContain('LIMIT');
    expect(records).toHaveLength(2);
    expect(records[0]?.brandName).toBe('Alpha');
    expect(records[1]?.brandName).toBe('Beta');
  });

  it('[NET-NEW] a counting statement that returns no row is refused, not read as zero', async () => {
    const { executor } = createSqlExecutorDouble({ outcomes: [sqlRows([])] });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    /* Treating an absent row as zero would report an empty smart list for a populated table. */
    await expect(builder.execute({ entityName: 'SlatwallBrand' })).rejects.toThrow(
      /returned no row, so the total record count could not be read/,
    );
  });

  it('[NET-NEW] a numeric string count is accepted, and a non-numeric one is refused', async () => {
    const accepted = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: '7' }]), sqlRows(BRAND_ROWS)],
    });
    const acceptedResult = await new SmartListQueryBuilder(
      accepted.executor,
      makeAggregateLoaders(),
    ).execute({ entityName: 'SlatwallBrand' });

    /* Drivers may hand back a count as a string or a bigint depending on column width, so the numeric
     * string is a real shape rather than a hypothetical one. Anything genuinely unparseable is not. */
    expect(acceptedResult.recordsCount).toBe(7);

    const refused = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 'not-a-number' }])],
    });
    await expect(
      new SmartListQueryBuilder(refused.executor, makeAggregateLoaders()).execute({
        entityName: 'SlatwallBrand',
      }),
    ).rejects.toThrow(/returned a value that is not a number/);
  });

  it('[NET-NEW] the materialisation budget refuses after the count and before any row is read', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 9 }])],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
      maximumRecordsPerQuery: 5,
    });

    await expect(builder.execute({ entityName: 'SlatwallBrand' })).rejects.toThrow(
      /matched more records than the configured materialisation budget admits/,
    );
    /* Exactly one statement ran: the count. Refusing after reading nine rows would already have paid the
     * cost the budget exists to avoid — and a silently shortened result would be worse still. */
    expect(calls).toHaveLength(1);
  });

  it('[NET-NEW] a budget within reach does not interfere', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
      maximumRecordsPerQuery: 2,
    });

    // The comparison is strictly greater-than, so a count exactly at the budget is admitted.
    const result = await builder.execute({ entityName: 'SlatwallBrand' });

    expect(result.recordsCount).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it('[NET-NEW] the constructor refuses a budget that is not a positive whole number', () => {
    for (const maximum of [0, -1, 1.5, Number.NaN]) {
      const { executor } = createSqlExecutorDouble({});

      expect(
        () =>
          new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
            maximumRecordsPerQuery: maximum,
          }),
      ).toThrow(/materialisation budget must be a positive safe integer/);
    }
  });
});

/* =================================================================================================
 * THE BUDGET ON THE RECORDS-ONLY MEMBER — SEC-12's UNGUARDED HALF
 *
 * ⚠️ WHY THIS BLOCK EXISTS AS ITS OWN SECTION. The budget guarded `execute()` alone, and `execute()` is
 * the SMALLER of the two materialisations: its unpaged statement is the same statement, but a caller
 * reaching it has also asked for a page and a count and is therefore reading a bounded window as well.
 * `executeRecords()` returns the WHOLE collection with no `LIMIT` of any kind, and it is the member the
 * Google product feed — the one anonymously reachable surface in this slice — reads the entire catalogue
 * through. So the bound protected the guarded half and left the exposed half open.
 *
 * Every case below would have PASSED before the fix, because a member that consults no budget cannot
 * refuse and cannot count. That is the point: they are written so the unguarded behaviour fails them.
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — the budget bounds executeRecords too (INT-07)', () => {
  it('[NET-NEW] counts FIRST and refuses before the unpaged statement is issued', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 9 }])],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
      maximumRecordsPerQuery: 5,
    });

    const rejection: unknown = await builder.executeRecords({ entityName: 'SlatwallBrand' }).then(
      () => undefined,
      (failure: unknown) => failure,
    );

    /*
     * ⛔ THE REFUSAL *REPORTS* RATHER THAN TRUNCATES, AND IT NAMES THE FIGURES. Truncation is expressly
     * ruled out: feed ORDER and MEMBERSHIP are observable behaviour (AAP §0.4.1.10), so a quietly
     * shortened feed would publish a catalog that does not exist while reporting success. Pinning the
     * error TYPE and its context is what makes the bound diagnosable rather than merely enforced — an
     * operator who sees the refusal learns which entity, how many records matched and what the budget
     * was, without which the only remedy is guesswork.
     */
    expect(rejection).toBeInstanceOf(DomainError);
    expect((rejection as DomainError).message).toMatch(
      /matched more records than the configured materialisation budget admits/,
    );
    expect((rejection as DomainError).context).toMatchObject({
      entityName: 'SlatwallBrand',
      recordsCount: 9,
      maximumRecordsPerQuery: 5,
    });

    /* EXACTLY ONE statement, and it is the count. Nine rows were never read, so nothing was hydrated and
     * nothing was retained — which is the whole value of counting first rather than measuring a
     * collection already in memory. The refusal text is the SAME text the paged path raises, because
     * both readings reach it through one private member; two messages for one bound would let the two
     * paths drift apart unnoticed, which is how the records-only path lost its bound in the first place. */
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql.startsWith('SELECT COUNT(DISTINCT aslatwallbrand.brandID)')).toBe(true);
  });

  it('[NET-NEW] bounds the FEED\u2019s own compiled query, not merely a stand-in for it', async () => {
    /*
     * ⭐ THE EXPOSED HALF IS THE ONE THAT MATTERS, so it is exercised with the feed's real query rather
     * than a convenient one. `?slatAction=google:feed.product` is the single anonymously reachable
     * surface in this slice and it reads the whole catalogue through the records-only member — asserting
     * the bound on a brand query alone would leave the finding open on the path that motivated it. The
     * same merged joins, activity and publication filters and inclusive availability range the controller
     * declares are compiled here.
     *
     * ⛔ NO FIGURE IS INVENTED. `maximumRecordsPerQuery` is supplied by the case as an operator would
     * supply it; the port declares no default and the legacy states no maximum anywhere (AAP §0.7.3 S9,
     * IR-12), which is why the unwired path is asserted unchanged further below.
     */
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 5000 }])],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
      maximumRecordsPerQuery: 250,
    });

    const rejection: unknown = await builder.executeRecords(feedQuery(feedJoins())).then(
      () => undefined,
      (failure: unknown) => failure,
    );

    expect(rejection).toBeInstanceOf(DomainError);
    expect((rejection as DomainError).context).toMatchObject({
      entityName: 'SlatwallSku',
      recordsCount: 5000,
      maximumRecordsPerQuery: 250,
    });

    /* ONE statement — the count — and it carried the feed's own joins and filters, so the figure gated
     * the population the feed would have materialised rather than some looser one. */
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('COUNT(DISTINCT aslatwallsku.skuID)');
  });

  it('[NET-NEW] a budget within reach issues the count and then the unpaged statement, in that order', async () => {
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [sqlRows([{ recordsCount: 2 }]), sqlRows(BRAND_ROWS)],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
      maximumRecordsPerQuery: 2,
    });

    const records = await builder.executeRecords({ entityName: 'SlatwallBrand' });

    /* TWO statements when a budget is wired, ONE when it is not, and the difference is precisely the
     * count — so the parity claim above is exact rather than approximate. A count exactly AT the budget
     * is admitted, because the comparison is strictly greater-than on both paths. */
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toContain('COUNT(DISTINCT');
    expect(calls[1]?.sql.startsWith('SELECT aslatwallbrand.*')).toBe(true);
    expect(calls[1]?.sql).not.toContain('LIMIT');
    expect(records).toHaveLength(2);
  });

  it('[NET-NEW] a row set that widened after the count is refused before hydration', async () => {
    /* The count and the row statement are separate reads. Inside a transaction-scoped executor they
     * observe one snapshot and agree; in autocommit a concurrent insert between them can return more
     * rows than the count promised. Two rows were promised and three arrived. */
    const { executor, calls } = createSqlExecutorDouble({
      outcomes: [
        sqlRows([{ recordsCount: 2 }]),
        sqlRows([
          ...BRAND_ROWS,
          { brandID: 'ee55ff6677889900aa11bb22cc33dd44', brandName: 'Gamma' },
        ]),
      ],
    });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders(), {
      maximumRecordsPerQuery: 2,
    });

    await expect(builder.executeRecords({ entityName: 'SlatwallBrand' })).rejects.toThrow(
      /returned more rows than the configured materialisation budget/,
    );

    /* Two statements ran and no third: the overshoot is refused rather than served, so it never becomes
     * domain objects, never reaches an association load, and never reaches a rendered feed. Nothing
     * locks, retries or waits — this port introduces no such semantics (AAP §0.7.3 S9). */
    expect(calls).toHaveLength(2);
  });

  it('[NET-NEW] with no budget wired an arbitrarily wide row set is materialised, not refused', async () => {
    const wideRows = Object.freeze(
      Array.from({ length: 25 }, (_unused, index) => ({
        brandID: `brand${String(index).padStart(27, '0')}`,
        brandName: `Brand ${String(index)}`,
      })),
    );
    const { executor, calls } = createSqlExecutorDouble({ outcomes: [sqlRows(wideRows)] });
    const builder = new SmartListQueryBuilder(executor, makeAggregateLoaders());

    const records = await builder.executeRecords({ entityName: 'SlatwallBrand' });

    /* ⛔ THE UNBOUNDED DEFAULT IS DELIBERATE AND IS ASSERTED, NOT MERELY DOCUMENTED. The legacy names no
     * maximum anywhere, and IR-12 with AAP §0.7.3 S9 forbid inventing one — so an operator who wires no
     * figure gets exactly what `org/Hibachi/HibachiSmartList.cfc` gives. This case is what stops a later
     * revision from quietly introducing a default: any default at all under twenty-five fails here. */
    expect(records).toHaveLength(25);
    expect(calls).toHaveLength(1);
  });
});

/* =================================================================================================
 * IDENTIFIER SAFETY — REFUSAL BEFORE ANY STATEMENT TEXT
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — identifier safety (INT-07)', () => {
  it('[NET-NEW] a declared property that names no physical column is refused, with nothing executed', () => {
    /* `SwSku` declares these as ORM associations that the smart-list graph does not traverse, so they
     * are legal property names with no column behind them. `?` binds VALUES only — an identifier can
     * never be parameterised — so the whitelist is the entire defence and it must fire here. */
    for (const propertyIdentifier of ['orderItems', 'stocks', 'skuCurrencies'] as const) {
      const scenario = compileOnly();

      expect(() =>
        scenario.builder.build({
          entityName: 'SlatwallSku',
          whereGroups: [{ filters: [{ propertyIdentifier, value: 'x' }] }],
        }),
      ).toThrow(/named a column that the extracted Catalog schema does not declare/);
      expect(scenario.calls).toHaveLength(0);
    }
  });

  it('[NET-NEW] the refusal says it happened before any statement text was assembled', () => {
    const scenario = compileOnly();

    /* The wording is the contract: a caller reading this message knows nothing partial was emitted and
     * nothing reached a driver, so there is no half-built statement to reason about. */
    expect(() =>
      scenario.builder.build({
        entityName: 'SlatwallSku',
        whereGroups: [{ filters: [{ propertyIdentifier: 'orderItems', value: 'x' }] }],
      }),
    ).toThrow(/refused before any statement text was assembled/);
  });

  it('[NET-NEW] an ORDER BY over an undeclared column is refused on the same path', () => {
    const scenario = compileOnly();

    /* Ordering is composed from the same resolver as filtering, so the whitelist covers it too. An
     * unguarded order clause would be the easiest injection surface of the three. */
    expect(() =>
      scenario.builder.build({
        entityName: 'SlatwallSku',
        orders: [{ propertyIdentifier: 'orderItems', direction: 'ASC' }],
      }),
    ).toThrow(/named a column that the extracted Catalog schema does not declare/);
    expect(scenario.calls).toHaveLength(0);
  });

  it('[NET-NEW] a path that ENDS at a collection association is refused with its own message', () => {
    const scenario = compileOnly();

    /* A distinct refusal, because the fix is different: a collection has no column on the table that
     * owns it, so the caller must extend the path rather than pick another column. The message says so. */
    expect(() =>
      scenario.builder.build({
        entityName: 'SlatwallSku',
        whereGroups: [{ filters: [{ propertyIdentifier: 'options', value: 'x' }] }],
      }),
    ).toThrow(/ended at a collection association/);
    expect(scenario.calls).toHaveLength(0);
  });

  it('[NET-NEW] a many-to-one association named as a LEAF resolves to its foreign key, adding no join', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [{ filters: [{ propertyIdentifier: 'product', value: ID.product }] }],
    });

    /* HQL compares against the association itself (`sku.product.id = ?`); native SQL reads the foreign
     * key already on `SwSku`. Both answer the same question, and the SQL form needs no join at all —
     * which is why the statement below carries none. */
    expect(compiled.records.sql).toContain('WHERE ((aslatwallsku.productID = ?))');
    expect(compiled.records.sql).not.toContain(' JOIN ');
    expect(compiled.records.params).toEqual([ID.product]);
  });

  it('[NET-NEW] a property-scoped smart list refuses a property that is not a collection', () => {
    /* `describePropertyScopedSmartList` takes plain strings, so this is the one refusal path a caller can
     * reach without a declared property type — and it is refused just as firmly. */
    expect(() => describePropertyScopedSmartList('SlatwallSku', 'product', ID.product)).toThrow(
      /named a property that is not a collection on the entity that owns it/,
    );
    expect(() =>
      describePropertyScopedSmartList('SlatwallSku', 'notARelationship', ID.product),
    ).toThrow(/named a property that is not a collection on the entity that owns it/);
  });
});

/* =================================================================================================
 * OPERATOR EMISSION
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — operator emission (INT-07)', () => {
  it('[NET-NEW] an equality filter emits "= ?" and binds the value positionally', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [{ filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] }],
    });

    expect(compiled.records.sql).toContain('WHERE ((aslatwallsku.activeFlag = ?))');
    expect(compiled.records.params).toEqual([1]);
  });

  it('[NET-NEW] a like filter emits "LIKE ?" and does NOT wrap the value itself', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [{ likeFilters: [{ propertyIdentifier: 'skuCode', value: '%RED%' }] }],
    });

    /* The wildcards belong to the caller here. Only the KEYWORD path wraps a value in `%…%`
     * (`org/Hibachi/HibachiSmartList.cfc:L683`); an explicit like filter is bound verbatim. */
    expect(compiled.records.sql).toContain('aslatwallsku.skuCode LIKE ?');
    expect(compiled.records.params).toEqual(['%RED%']);
  });

  it('[NET-NEW] an IN filter emits exactly one placeholder per value', () => {
    const { compiled } = compile({
      entityName: 'SlatwallOption',
      whereGroups: [{ inFilters: [{ propertyIdentifier: 'optionCode', value: 'RED,BLUE,GREEN' }] }],
    });

    /* The single most important line of the operator set. A list rendered as one `?` would bind the whole
     * comma string as a single value and match nothing; interpolating the list would reopen D18's
     * injection surface in a second place. One placeholder per value is the only correct form. */
    expect(compiled.records.sql).toContain('aslatwalloption.optionCode IN (?, ?, ?)');
    expect(compiled.records.params).toEqual(['RED', 'BLUE', 'GREEN']);
  });

  it('[NET-NEW] a single-valued IN filter emits one placeholder, not a degenerate list', () => {
    const { compiled } = compile({
      entityName: 'SlatwallOption',
      whereGroups: [{ inFilters: [{ propertyIdentifier: 'optionCode', value: 'RED' }] }],
    });

    expect(compiled.records.sql).toContain('aslatwalloption.optionCode IN (?)');
    expect(compiled.records.params).toEqual(['RED']);
  });

  it('[NET-NEW] the three range forms emit >=, <= and both, in that fixed order', () => {
    const both = compile({
      entityName: 'SlatwallOption',
      whereGroups: [
        { ranges: [{ propertyIdentifier: 'sortOrder', lowerBound: 1, upperBound: 9 }] },
      ],
    });
    const upperOnly = compile({
      entityName: 'SlatwallOption',
      whereGroups: [{ ranges: [{ propertyIdentifier: 'sortOrder', upperBound: 9 }] }],
    });
    const lowerOnly = compile({
      entityName: 'SlatwallOption',
      whereGroups: [{ ranges: [{ propertyIdentifier: 'sortOrder', lowerBound: 1 }] }],
    });

    /* Every bound is INCLUSIVE. The feed's availability gate is the lower-only form, and an exclusive
     * `>` there would silently drop every product with exactly one unit available. */
    expect(both.compiled.records.sql).toContain(
      'aslatwalloption.sortOrder >= ? AND aslatwalloption.sortOrder <= ?',
    );
    expect(both.compiled.records.params).toEqual([1, 9]);
    expect(upperOnly.compiled.records.sql).toContain('aslatwalloption.sortOrder <= ?');
    expect(upperOnly.compiled.records.sql).not.toContain('>=');
    expect(upperOnly.compiled.records.params).toEqual([9]);
    expect(lowerOnly.compiled.records.sql).toContain('aslatwalloption.sortOrder >= ?');
    expect(lowerOnly.compiled.records.sql).not.toContain('<=');
    expect(lowerOnly.compiled.records.params).toEqual([1]);
  });

  it('[NET-NEW] the feed’s availability gate is the inclusive lower-bound form', () => {
    const { compiled } = compile(feedQuery(feedJoins()));

    /* `integrationServices/google/controllers/feed.cfc` passes `'1^'` — a lower bound of one and no
     * upper bound. The bound value is the STRING `1`, carried as the legacy carries it rather than
     * coerced to a number on the way through. */
    expect(compiled.records.sql).toContain('aslatwallproduct.calculatedQATS >= ?');
    // Not the EXCLUSIVE form: `> ?` would drop every product with exactly one unit available.
    expect(compiled.records.sql).not.toContain('calculatedQATS > ?');
    expect(compiled.records.sql).not.toContain('calculatedQATS <=');
    expect(compiled.records.params[3]).toBe('1');
  });

  it('[NET-NEW] predicates within one group are ANDed and the group is parenthesised', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [
        {
          filters: [{ propertyIdentifier: 'activeFlag', value: 1 }],
          likeFilters: [{ propertyIdentifier: 'skuCode', value: 'R%' }],
        },
      ],
    });

    expect(compiled.records.sql).toContain(
      'WHERE ((aslatwallsku.activeFlag = ? AND aslatwallsku.skuCode LIKE ?))',
    );
  });

  it('[NET-NEW] separate groups are ORed, and the whole disjunction is wrapped', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [
        { filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] },
        { filters: [{ propertyIdentifier: 'skuCode', value: 'RED' }] },
      ],
    });

    /* The outer parentheses matter as much as the inner ones: without them, a later ANDed clause — the
     * keyword clause, for instance — would bind more tightly than the OR and change the result set. */
    expect(compiled.records.sql).toContain(
      'WHERE ((aslatwallsku.activeFlag = ?) OR (aslatwallsku.skuCode = ?))',
    );
    expect(compiled.records.params).toEqual([1, 'RED']);
  });

  it('[NET-NEW] each keyword wraps in %…%, ORs across every keyword property, and ANDs per keyword', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      joins: [{ parentEntityName: 'SlatwallSku', relatedProperty: 'product' }],
      keywords: ['red', 'large'],
      keywordProperties: [
        { propertyIdentifier: 'skuCode', weight: 1 },
        { propertyIdentifier: 'product.productName', weight: 1 },
      ],
    });

    /* `org/Hibachi/HibachiSmartList.cfc:L683` wraps the value; `:L687` ORs the properties. Every keyword
     * gets its own parenthesised disjunction and the disjunctions are ANDed, so a two-word search
     * requires BOTH words to appear somewhere — the legacy narrowing behaviour, not a widening one. */
    expect(compiled.records.sql).toContain(
      '(aslatwallsku.skuCode LIKE ? OR aslatwallproduct.productName LIKE ?) AND ' +
        '(aslatwallsku.skuCode LIKE ? OR aslatwallproduct.productName LIKE ?)',
    );
    expect(compiled.records.params).toEqual(['%red%', '%red%', '%large%', '%large%']);
  });

  it('[NET-NEW] keywords with no keyword properties emit no clause at all', () => {
    const { compiled } = compile({ entityName: 'SlatwallSku', keywords: ['red'] });

    /* There is nothing to compare against, so the legacy appends nothing. Emitting a bare `LIKE` over an
     * invented default column would be a fabricated search rule. */
    expect(compiled.records.sql).not.toContain('LIKE');
    expect(compiled.records.sql).not.toContain('WHERE');
    expect(compiled.records.params).toEqual([]);
  });

  it('[NET-NEW] a filter group and a keyword clause are ANDed, each independently parenthesised', () => {
    const { compiled } = compile({
      entityName: 'SlatwallSku',
      whereGroups: [{ filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] }],
      keywords: ['red'],
      keywordProperties: [{ propertyIdentifier: 'skuCode', weight: 1 }],
    });

    /* The group disjunction keeps its own wrapper — `((activeFlag = ?))` — and the keyword clause is a
     * SIBLING conjunct outside it rather than a member of it. That nesting is what makes the earlier
     * `A OR B` case safe: an added conjunct binds outside the disjunction, never inside it. */
    expect(compiled.records.sql).toContain(
      'WHERE ((aslatwallsku.activeFlag = ?)) AND (aslatwallsku.skuCode LIKE ?)',
    );
    /* Binding order is filters first, then keywords — the order the clauses are composed in. */
    expect(compiled.records.params).toEqual([1, '%red%']);
  });

  it('[NET-NEW] a property-scoped smart list constrains the collection to one owner', () => {
    const query = describePropertyScopedSmartList('SlatwallOptionGroup', 'options', ID.optionGroup);
    const { compiled } = compile(query);

    /* The inverse association is resolved rather than assumed: `SwOption` carries the foreign key, so the
     * constraint lands on `optionGroupID` on the option table and needs no join back to the group. */
    expect(query.entityName).toBe('SlatwallOption');
    expect(compiled.records.sql).toContain('WHERE ((aslatwalloption.optionGroupID = ?))');
    expect(compiled.records.sql).not.toContain(' JOIN ');
    expect(compiled.records.params).toEqual([ID.optionGroup]);
  });
});

/* =================================================================================================
 * COUNT AND RECORDS UNDER A FANNING JOIN, AND THE MATERIALISATION BUDGET — REVIEW FINDING 15
 * -------------------------------------------------------------------------------------------------
 * RESTORED COVERAGE. Twelve cases were dropped when the suite was reorganised and the review found no
 * replacement for them: four relationship-hydration/identity-map cases, four SEC-12 materialisation-
 * budget cases and four F-20 projection/count/paging cases. The eight belonging to the BUILDER are
 * restored here; the four hydration cases are restored in `test/adapters/catalogAggregates.test.ts`,
 * which owns hydration for this subtree.
 *
 * WHY HERE AND NOT WHERE THEY WERE. The dropped cases lived in `test/services/OptionService.test.ts`,
 * and their own header explained why: at the time "AAP §0.4.1.12 declares no `SmartListQueryBuilder`
 * test file, and NF1 forbids creating a file the AAP does not declare". That constraint is gone — THIS
 * file now exists under the same AAP §0.4.4 `slatwall-ts/test/**` authority — so the builder's own
 * contract belongs in the builder's own suite. That is precisely what the review's resolution asks for.
 *
 * ⚠️ THREE OF THE EIGHT HAVE PARTIAL EQUIVALENTS ALREADY IN THIS FILE, AND ARE STILL RESTORED. Where
 * that is so it is stated on the case, together with the assertion the existing one does not make, so
 * neither reads as duplication:
 *
 *   • "the materialisation budget refuses after the count…" (above) asserts the refusal and the
 *     one-statement cost. It cannot see the PARITY half — that an UNWIRED budget materialises whatever
 *     it matches — and would still pass if the parameter had stayed mandatory. Restored below.
 *   • "the constructor refuses a budget that is not a positive whole number" (above) checks
 *     `[0, -1, 1.5, NaN]`. It omits `Infinity`, which is the one mis-wiring that would compare as
 *     "never over budget" rather than throwing, and it has no positive control, so it would still pass
 *     if the guard rejected EVERYTHING. Restored below with both.
 *   • "an unstated flag leaves the record projection NON-distinct" (above) asserts the asymmetry over a
 *     query with no join at all — where there is nothing for DISTINCT to collapse. Restored below over
 *     a REAL fan-out, which is the only configuration in which the asymmetry has observable meaning.
 *
 * WHY A FAN-OUT AT ALL, AND WHY THIS ONE. `model/entity/OptionGroup.cfc:L70` declares
 * `options` as a genuine one-to-many inside the in-scope slice with `orderby="sortOrder"`, so joining it
 * multiplies group rows by their options using real in-scope metadata rather than an invented
 * relationship. `SmartListInput` declares no join member and no distinct flag, so no service member can
 * express this shape; the query is therefore built directly, exactly as the two relocated product
 * queries in `src/services/OptionService.ts` do.
 * ================================================================================================*/

describe('NET-NEW SmartListQueryBuilder — count and records under a fanning join (finding 15)', () => {
  /** One group row, returned three times, as a join to a three-option group really would. */
  const FANNED_GROUP_ROW = Object.freeze({
    optionGroupID: ID.optionGroup,
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    imageGroupFlag: 1,
    sortOrder: 1,
  });

  /**
   * A fanning query whose page is DELIBERATELY NARROWER than the row count.
   *
   * The builder skips the paged statement when the first page already covers every row it read, so with
   * the legacy default of ten (`org/Hibachi/HibachiSmartList.cfc:L39`) three fanned rows would be
   * covered and the paged statement these cases inspect would never be emitted. Asking for two of three
   * puts the read back on the three-statement path. The elision itself is pinned by its own case at the
   * foot of this block, so both behaviours are asserted and neither masks the other.
   */
  const FANNING_QUERY: SmartListQuery<'SlatwallOptionGroup'> = {
    entityName: 'SlatwallOptionGroup',
    joins: [{ parentEntityName: 'SlatwallOptionGroup', relatedProperty: 'options' }],
    pagination: { pageRecordsShow: 2 },
  };

  /** The same fan-out with paging left alone, so the first page covers all three rows. */
  const FANNING_QUERY_WHOLE_PAGE: SmartListQuery<'SlatwallOptionGroup'> = {
    entityName: 'SlatwallOptionGroup',
    joins: [{ parentEntityName: 'SlatwallOptionGroup', relatedProperty: 'options' }],
  };

  /**
   * Routes by statement SHAPE rather than by queue position, so a case that asserts ORDER is asserting
   * the builder's choice and not the fixture's. The counting statement answers the DISTINCT total — one
   * group — while the record statements answer three rows, which is what the fan-out returns.
   */
  function makeFanningBuilder(options?: {
    readonly materialisationBudget?: { readonly maximumRecordsPerQuery: number };
    readonly recordsCount?: number;
  }): BuilderScenario {
    const countedTotal = options?.recordsCount ?? 1;
    const { executor, calls } = createSqlExecutorDouble({
      respond: (call) => {
        if (call.sql.includes('smartListAssociationOwnerKey')) {
          return sqlRows([]);
        }
        if (call.sql.includes('recordsCount')) {
          return sqlRows([{ recordsCount: countedTotal }]);
        }
        return sqlRows([{ ...FANNED_GROUP_ROW }, { ...FANNED_GROUP_ROW }, { ...FANNED_GROUP_ROW }]);
      },
    });

    return {
      builder: new SmartListQueryBuilder(
        executor,
        makeAggregateLoaders(),
        options?.materialisationBudget,
      ),
      calls,
    };
  }

  /** The statement text of every call the executor received, in issue order. */
  function issued(scenario: BuilderScenario): readonly string[] {
    return scenario.calls.map((call) => call.sql);
  }

  it('[NET-NEW] SEC-12: with NO budget wired, a query materialises whatever it matches', async () => {
    /*
     * The parity default, and the reason the constructor parameter is OPTIONAL. `HibachiSmartList.cfc`
     * states no maximum anywhere, so an unwired builder must behave exactly as it did before the budget
     * existed — here a counted total far above any figure this suite configures, materialised without
     * complaint.
     *
     * ⚠️ THIS IS THE HALF THE SIBLING REFUSAL CASE CANNOT SEE. Together the two say: absent means
     * unbounded, present means fail-closed. The refusal case alone would still pass if the budget had
     * stayed a REQUIRED parameter, which is the shape AAP §0.8.2 guideline 4 forbids — a required finite
     * ceiling converts work the legacy performs into a bounded failure.
     */
    const scenario = makeFanningBuilder({ recordsCount: 1_000_000 });

    const result = await scenario.builder.execute(FANNING_QUERY);

    expect(result.recordsCount).toBe(1_000_000);
    expect(result.records).toHaveLength(3);
    expect(issued(scenario)).toHaveLength(4);
  });

  it('[NET-NEW] SEC-12: an over-budget query is refused after the count and before any row is read', async () => {
    /*
     * Restored with the fan-out fixture, where the gate's placement is load-bearing in a way a
     * join-free query cannot show: the count returns ONE row whatever the catalog holds, so it is safe
     * to issue first, and the refusal then lands with exactly one statement spent and the unbounded
     * record statement never composed. A gate placed after the record read would leave two statements
     * behind and would already have materialised the collection it exists to prevent.
     */
    const scenario = makeFanningBuilder({
      recordsCount: 5,
      materialisationBudget: { maximumRecordsPerQuery: 4 },
    });

    await expect(scenario.builder.execute(FANNING_QUERY)).rejects.toThrow(
      /matched more records than the configured materialisation budget admits/,
    );

    expect(issued(scenario)).toHaveLength(1);
    expect(issued(scenario)[0]).toContain('recordsCount');
    /* ⛔ AND NOTHING WAS READ. Asserted on the statement text rather than only on the count, because a
     * refusal that had already composed the record statement would still leave one call behind if the
     * count had been skipped. */
    for (const sql of issued(scenario)) {
      expect(sql).not.toMatch(/^SELECT [A-Za-z0-9_]+\.\*/);
    }
  });

  it('[NET-NEW] SEC-12: a query exactly AT the budget is admitted, so the bound is not off by one', async () => {
    /* The comparison is strictly greater-than. Restored over the fan-out so the admitted query goes on
     * to issue all four statements, which an equality-boundary case over a bare query cannot show. */
    const scenario = makeFanningBuilder({
      recordsCount: 4,
      materialisationBudget: { maximumRecordsPerQuery: 4 },
    });

    const result = await scenario.builder.execute(FANNING_QUERY);

    expect(result.recordsCount).toBe(4);
    expect(issued(scenario)).toHaveLength(4);
  });

  it('[NET-NEW] SEC-12: a mis-wired budget is refused when the graph is built, not on first use', () => {
    /*
     * Fail fast at construction, for the reason the constructor records: a `NaN` comparison would
     * silently admit EVERY query and leave the finding open, so a wiring error must not be allowed to
     * surface later as a data error.
     *
     * ⭐ `Infinity` IS THE ONE THAT MATTERS MOST, and it is the one the sibling case omits. It is the
     * only value in this list that would not throw on comparison and would not read as absurd at a
     * composition root — `recordsCount > Infinity` is simply always false, so a builder wired this way
     * would report itself budgeted while admitting everything. `Number.isSafeInteger` rejects it.
     */
    for (const maximumRecordsPerQuery of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        makeFanningBuilder({ materialisationBudget: { maximumRecordsPerQuery } }),
      ).toThrow(/materialisation budget must be a positive safe integer/);
    }

    /* The positive control, without which this case would still pass if the guard rejected everything. */
    expect(() =>
      makeFanningBuilder({ materialisationBudget: { maximumRecordsPerQuery: 1 } }),
    ).not.toThrow();
  });

  it('[NET-NEW] F-20: the record projection is NOT distinct while the count ALWAYS is', async () => {
    /* `org/Hibachi/HibachiSmartList.cfc:L502` counts `count(distinct …)` unconditionally, while the
     * record branch at `:L505-L521` consults a flag seeded false at `:L59`. Both rules are asserted on
     * the emitted SQL, because the asymmetry is the legacy's and AAP §0.7.3 standard 7 forbids repairing
     * it. */
    const scenario = makeFanningBuilder();

    await scenario.builder.execute(FANNING_QUERY);

    const [countSql, recordsSql, pageRecordsSql] = issued(scenario);
    expect(recordsSql).toMatch(/^SELECT [A-Za-z0-9_]+\.\*/);
    expect(recordsSql).not.toContain('DISTINCT');
    expect(countSql).toMatch(
      /^SELECT COUNT\(DISTINCT [A-Za-z0-9_]+\.optionGroupID\) AS recordsCount/,
    );
    /* ⭐ THE FAN-OUT REALLY IS PRESENT — without the join there would be nothing to be distinct about,
     * which is exactly why the join-free sibling case cannot stand in for this one. */
    expect(recordsSql).toContain('JOIN SwOption ');
    expect(pageRecordsSql).toContain('JOIN SwOption ');
    /* The declared contract, so a future edit to either composer trips a test rather than silently
     * aligning the two branches. */
    expect(SMARTLIST_DISTINCT_ASYMMETRY).toStrictEqual({
      recordProjectionHonoursFlag: true,
      countProjectionIsAlwaysDistinct: true,
    });
  });

  it('[NET-NEW] F-20: the fanned record count and the distinct total DISAGREE, and the counted total wins', async () => {
    /* The numeric consequence `meta/tests/unit/IssuesTest.cfc:L73-L89` (`issue_1296`) is sensitive to:
     * three rows for one group. The port reports the COUNTED total rather than inferring it from the
     * array length — the ambiguity `org/Hibachi/HibachiSmartList.cfc:L783-L785` leaves open and
     * `src/ports/SmartListQueryPort.ts` resolves. */
    const scenario = makeFanningBuilder();

    const result = await scenario.builder.execute(FANNING_QUERY);

    expect(result.records).toHaveLength(3);
    expect(result.recordsCount).toBe(1);
    /* One instance per identifier per read: the three fanned rows are the SAME object, not three. Two
     * instances would also mean the row was managed twice, which installs a fresh error bag and discards
     * anything already accumulated. */
    const [first, second, third] = result.records;
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('[NET-NEW] F-20: THREE base statements are issued, in order, on one executor', async () => {
    /* The eager three-statement shape, pinned so the open performance question cannot be resolved by
     * accident. The unpaged projection carries no bound, the paged one carries the legacy's own
     * offset/maximum pair from `:L762`, and the count carries neither bound nor ordering. */
    const scenario = makeFanningBuilder();

    await scenario.builder.execute(FANNING_QUERY);

    const [countSql, recordsSql, pageRecordsSql] = issued(scenario);
    expect(recordsSql).not.toContain('LIMIT');
    expect(pageRecordsSql).toContain('LIMIT ? OFFSET ?');
    expect(countSql).not.toContain('LIMIT');
    expect(countSql).not.toContain('ORDER BY');
    /* Count FIRST — SEC-12's gate order — then the two row statements, then the association pass the
     * hydrator adds. Four statements on ONE executor, which is what makes the order observable. */
    expect(issued(scenario)).toHaveLength(4);
    expect(countSql).toContain('recordsCount');
    expect(issued(scenario)[3]).toContain('smartListAssociationOwnerKey');
  });

  it('[NET-NEW] F-20: when the page covers every record the paged statement is NOT issued', async () => {
    /*
     * The other half of the three-statement question, and the reason the fixture above asks for a narrow
     * page. When the first page already covers every row the unpaged statement returned, the paged
     * statement could only return those same rows in that same order, so it is not issued and the
     * unpaged collection IS the page. `build` still composes it with its bound `LIMIT ? OFFSET ?`, which
     * is what keeps the case above able to inspect it.
     *
     * Asserted so neither behaviour can regress silently: the shape assertions above would still pass if
     * the elision were removed, and this one would still pass if the page were ALWAYS elided.
     */
    const scenario = makeFanningBuilder();

    const result = await scenario.builder.execute(FANNING_QUERY_WHOLE_PAGE);

    /* Count, the unpaged records, the association pass — and no paged statement anywhere. */
    expect(issued(scenario)).toHaveLength(3);
    expect(issued(scenario)[0]).toContain('recordsCount');
    expect(issued(scenario)[1]).not.toContain('LIMIT');
    expect(issued(scenario)[2]).toContain('smartListAssociationOwnerKey');
    for (const sql of issued(scenario)) {
      expect(sql).not.toContain('OFFSET');
    }

    /* The page IS the unpaged collection, BY IDENTITY — not a second array holding equal values. */
    expect(result.pageRecords).toBe(result.records);
    /* And the paging figures still come from the COUNTED total, never inferred from the fanned rows. */
    expect(result.recordsCount).toBe(1);
  });
});
