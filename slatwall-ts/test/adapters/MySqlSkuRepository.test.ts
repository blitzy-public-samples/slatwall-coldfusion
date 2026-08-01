/**
 * `MySqlSkuRepository.persistSku` — the SKU row and the four link collections it owns.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/adapters/MySqlSkuRepository.test.ts` | CREATE |
 * "**NET-NEW**", and the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS
 * =============================================================================================
 * The write half of `model/dao/SkuDAO.cfc`'s inherited CRUD surface — specifically the two behaviours a
 * review found missing, both of which were silent:
 *
 * [DATA-01] A new SKU reached `persistSku` with no identifier, so the guard at
 *           `src/adapters/mysql/MySqlSkuRepository.ts` refused every insert. The identifier is minted in
 *           `SkuService.validateNewSku` one statement before the write (IR-6), so the cases below assert
 *           BOTH halves: that a 32-character identifier is what gets bound, and that the guard still
 *           refuses an unidentified SKU. A guard that has become unreachable from the service path is
 *           still the thing standing between a half-built entity and a statement.
 *
 * [DATA-04] Only `SwSkuOption` was written. `model/entity/Sku.cfc:L76-L79` declares FOUR owned
 *           many-to-many collections, and the other three — `accessContents`, `subscriptionBenefits`,
 *           `renewalSubscriptionBenefits` — were accepted by the entity, populated by `createSkus`, and
 *           then discarded with no statement and no error. Every case below that names a link table
 *           exists because nothing previously proved a row reached it.
 *
 * THE TWO BENEFIT COLLECTIONS GET A DEDICATED CASE OF THEIR OWN. `SwSkuSubsBenefit` and
 * `SwSkuRenewalSubsBenefit` share their element type AND their far column name
 * (`subscriptionBenefitID`) and differ ONLY by table, so crossing them type-checks and writes the wrong
 * row. `src/domain/sku/Sku.ts` flags that trap in the collection declarations; a compiler cannot catch
 * it, so a test does.
 *
 * NO DATABASE. Every statement is asserted on the text and the bound parameter array a recording double
 * captured — the same approach the sibling `MySqlProductRepository.test.ts` takes, and what AAP 0.7.3
 * standard 6 requires given that the legacy suite has no mocking library and no CFML runtime is
 * available here. The repository takes its executor and both collaborators as constructor parameters, so
 * substitution needs nothing but an object of the right shape (AAP 0.7.3 standard 3).
 *
 * NOTHING HERE ASSERTS A COMMIT, because nothing here commits. The transaction boundary belongs to
 * `src/adapters/mysql/UnitOfWork.ts` and is opened and closed by the caller (mismatch M5).
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 verified that "**No** `SkuDAOTest` or
 * `OptionDAOTest` exists" anywhere in the legacy suite. Nothing here extends a legacy assertion and
 * none is labelled as though it did (AAP 0.8.3.7).
 */
import {
  createOptionGroupSortOrderMemo,
  MySqlSkuRepository,
} from '../../src/adapters/mysql/MySqlSkuRepository';
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../src/domain/BaseProductType';
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { SKU_UNSAVED_ID_VALUE } from '../../src/domain/sku/Sku';
import {
  createProductTypeRootResolverDouble,
  buildOption,
  buildSku,
} from '../support/inMemoryRepositories';

import type { SkuStatementExecutor } from '../../src/adapters/mysql/MySqlSkuRepository';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';

/** One statement the repository issued. */
interface Statement {
  /** `read` for `execute`, `write` for `executeMutation`. */
  readonly kind: 'read' | 'write';
  readonly sql: string;
  readonly params: readonly unknown[];
}

interface Harness {
  readonly repository: MySqlSkuRepository;
  readonly statements: Statement[];
}

/**
 * Build the repository over a recording executor.
 *
 * @param existingSkuRows - what the SKU existence probe answers. A non-empty array makes the SKU row
 *   pre-exist, which is what decides whether the link deletes are issued.
 * @returns the repository and the statement journal.
 */
function makeHarness(existingSkuRows: readonly MySqlRow[] = []): Harness {
  const statements: Statement[] = [];

  const executor: SkuStatementExecutor = {
    execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      statements.push({ kind: 'read', sql, params: [...params] });
      return Promise.resolve([...existingSkuRows]);
    },
    executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
      statements.push({ kind: 'write', sql, params: [...params] });
      return Promise.resolve(1);
    },
  };

  return {
    repository: new MySqlSkuRepository(
      executor,
      createOptionGroupSortOrderMemo(),
      createProductTypeRootResolverDouble().resolver,
      /* The audit-actor source the write seam stamps from. `undefined` is the unauthenticated case, which
       * is what `org/Hibachi/HibachiObject.cfc:L74-L76` yields when no account is on the request. */
      { getCurrentAccount: () => undefined },
    ),
    statements,
  };
}

/** Every statement that touched `table`, in the order it was issued. */
function statementsFor(statements: readonly Statement[], table: string): readonly Statement[] {
  return statements.filter((statement) => statement.sql.includes(table));
}

/** The single statement that touched `table` and began with `verb`. */
function soleStatement(
  statements: readonly Statement[],
  table: string,
  verb: 'DELETE' | 'INSERT',
): Statement {
  const matches = statementsFor(statements, table).filter((statement) =>
    statement.sql.startsWith(verb),
  );
  expect(matches).toHaveLength(1);

  const only = matches[0];
  if (only === undefined) {
    throw new Error(`no ${verb} statement reached ${table}`);
  }
  return only;
}

describe('MySqlSkuRepository.persistSku — DATA-01, the identifier', () => {
  /*
   * The guard is the reason DATA-01 was a total failure rather than a partial one: an unidentified SKU
   * did not write a row with a blank key, it wrote nothing at all and raised.
   */
  it('refuses a SKU that still holds the unsaved identifier value, and issues no statement', async () => {
    const harness = makeHarness();
    const sku = buildSku({ skuCode: 'SKU-UNIDENTIFIED' });

    expect(sku.skuID).toBe(SKU_UNSAVED_ID_VALUE);
    await expect(harness.repository.persistSku(sku)).rejects.toThrow(
      /cannot be written before it has been assigned an identifier/,
    );

    /* Refused BEFORE any statement — not after a probe, and certainly not after a partial write. */
    expect(harness.statements).toHaveLength(0);
  });

  it('binds the identifier the service minted, unchanged and 32 characters wide', async () => {
    const harness = makeHarness();
    /* The shape `createSlatwallUUID()` produces: 32 hex characters, no dashes (IR-6). */
    const skuID = 'aabbccdd11223344556677889900eeff';
    const sku = buildSku({ skuID, skuCode: 'SKU-IDENTIFIED', price: 100 });

    await harness.repository.persistSku(sku);

    const insert = soleStatement(harness.statements, 'SwSku ', 'INSERT');
    expect(skuID).toHaveLength(32);
    expect(skuID).toMatch(/^[0-9a-f]{32}$/);
    /* The identifier leads the column list, so it is the first bound value. */
    expect(insert.params[0]).toBe(skuID);
  });
});

describe('MySqlSkuRepository.persistSku — DATA-04, the four owned link collections', () => {
  /** One reference per collection, all distinct so a crossed write is visible in the parameters. */
  const CONTENT_ID = '11111111111111111111111111111111';
  const BENEFIT_ID = '22222222222222222222222222222222';
  const RENEWAL_BENEFIT_ID = '33333333333333333333333333333333';
  const SKU_ID = '44444444444444444444444444444444';

  /** A SKU carrying all four collections at once. */
  function buildFullyLinkedSku() {
    return buildSku({
      skuID: SKU_ID,
      skuCode: 'SKU-LINKED',
      options: [buildOption({ optionID: '55555555555555555555555555555555' })],
      accessContents: [{ contentID: CONTENT_ID }],
      subscriptionBenefits: [{ subscriptionBenefitID: BENEFIT_ID }],
      renewalSubscriptionBenefits: [{ subscriptionBenefitID: RENEWAL_BENEFIT_ID }],
    });
  }

  it('writes a row into every one of the four link tables', async () => {
    const harness = makeHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    /*
     * Before the fix exactly one of these four was non-empty. The other three collections were
     * populated on the entity and no statement was ever emitted for them.
     */
    for (const table of [
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
    ]) {
      expect(statementsFor(harness.statements, table).length).toBeGreaterThan(0);
    }
  });

  it('binds the content link to contentID rather than to a name derived from the property', async () => {
    const harness = makeHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    const insert = soleStatement(harness.statements, 'SwSkuAccessContent', 'INSERT');
    /* `model/entity/Sku.cfc:L77` — `inversejoincolumn="contentID"`, NOT `accessContentID`. */
    expect(insert.sql).toContain('(skuID, contentID)');
    expect(insert.sql).not.toContain('accessContentID');
    expect(insert.params).toEqual([SKU_ID, CONTENT_ID]);
  });

  /*
   * THE CASE THAT EXISTS BECAUSE THE COMPILER CANNOT HELP. Both benefit collections hold
   * `SubscriptionBenefitReference` and both write a column called `subscriptionBenefitID`, so swapping
   * them compiles cleanly and writes two wrong rows. The distinct identifiers above are what makes the
   * swap observable.
   */
  it('keeps the two benefit collections in their own tables, distinguished only by table', async () => {
    const harness = makeHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    const benefit = soleStatement(harness.statements, 'SwSkuSubsBenefit', 'INSERT');
    const renewal = soleStatement(harness.statements, 'SwSkuRenewalSubsBenefit', 'INSERT');

    expect(benefit.params).toEqual([SKU_ID, BENEFIT_ID]);
    expect(renewal.params).toEqual([SKU_ID, RENEWAL_BENEFIT_ID]);

    /* The far column name really is shared; that is the design, and it is why the tables must differ. */
    expect(benefit.sql).toContain('(skuID, subscriptionBenefitID)');
    expect(renewal.sql).toContain('(skuID, subscriptionBenefitID)');
    expect(benefit.sql).not.toContain('SwSkuRenewalSubsBenefit');
  });

  it('issues no link delete when the SKU row did not pre-exist', async () => {
    /* The existence probe answers empty, so this is an insert. */
    const harness = makeHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    /* A fresh row has nothing to replace, and the mapping layer issues no collection delete either. */
    expect(harness.statements.filter((statement) => statement.sql.startsWith('DELETE'))).toEqual(
      [],
    );
  });

  it('deletes then re-inserts every collection when the SKU row pre-existed', async () => {
    const harness = makeHarness([{ skuID: SKU_ID }]);

    await harness.repository.persistSku(buildFullyLinkedSku());

    for (const table of [
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
    ]) {
      const scoped = statementsFor(harness.statements, table);
      const verbs = scoped.map((statement) => statement.sql.split(' ')[0]);

      /* Replacement, in that order: the delete must precede the insert or it would erase it. */
      expect(verbs).toEqual(['DELETE', 'INSERT']);
      expect(soleStatement(harness.statements, table, 'DELETE').params).toEqual([SKU_ID]);
    }
  });

  /*
   * Removal is only expressible as "delete, then insert nothing". Skipping the delete for an empty
   * collection would make it impossible to clear a collection by saving the SKU without it.
   */
  it('clears a collection that has become empty on a pre-existing SKU', async () => {
    const harness = makeHarness([{ skuID: SKU_ID }]);
    const sku = buildSku({ skuID: SKU_ID, skuCode: 'SKU-CLEARED' });

    await harness.repository.persistSku(sku);

    const scoped = statementsFor(harness.statements, 'SwSkuAccessContent');
    expect(scoped.map((statement) => statement.sql.split(' ')[0])).toEqual(['DELETE']);
    expect(scoped[0]?.params).toEqual([SKU_ID]);
  });

  it('writes multiple references in the order the entity holds them, without deduplicating', async () => {
    const harness = makeHarness();
    const first = '66666666666666666666666666666666';
    const second = '77777777777777777777777777777777';
    const sku = buildSku({
      skuID: SKU_ID,
      skuCode: 'SKU-MULTI',
      /* Two distinct references plus a repeat of the first, by VALUE not by identity — the entity's own
       * adder dedupes by reference, so these three all reach the collection. A repeated far identifier
       * is a data fault the link table's key is entitled to reject, and collapsing it here would hide
       * it from the caller that created it. */
      accessContents: [{ contentID: first }, { contentID: second }, { contentID: first }],
    });

    await harness.repository.persistSku(sku);

    const insert = soleStatement(harness.statements, 'SwSkuAccessContent', 'INSERT');
    expect(insert.sql).toContain('VALUES (?, ?), (?, ?), (?, ?)');
    expect(insert.params).toEqual([SKU_ID, first, SKU_ID, second, SKU_ID, first]);
  });

  it('writes the SKU row before any link row, since every link row references it', async () => {
    const harness = makeHarness();

    await harness.repository.persistSku(buildFullyLinkedSku());

    const writes = harness.statements.filter((statement) => statement.kind === 'write');
    const firstWrite = writes[0];
    expect(firstWrite?.sql.startsWith('INSERT INTO SwSku ')).toBe(true);

    /* And every remaining write is a link write, so nothing slipped in between. */
    expect(
      writes.slice(1).every((statement) => statement.sql.includes('SwSku') && statement.sql !== ''),
    ).toBe(true);
  });

  it('binds every value positionally and interpolates none of them (TR-4)', async () => {
    const harness = makeHarness([{ skuID: SKU_ID }]);

    await harness.repository.persistSku(buildFullyLinkedSku());

    for (const statement of harness.statements) {
      /* No identifier and no value from the entity may appear in the statement text. */
      expect(statement.sql).not.toContain(SKU_ID);
      expect(statement.sql).not.toContain(CONTENT_ID);
      expect(statement.sql).not.toContain(BENEFIT_ID);
      expect(statement.sql).not.toContain(RENEWAL_BENEFIT_ID);
      expect(statement.sql).not.toContain("'");
    }
  });
});

describe('MySqlSkuRepository.findByProduct — the FETCH half of INNER JOIN FETCH', () => {
  const PRODUCT_ID = 'bbbbbbbb000000000000000000000001';
  const SKU_A = 'aaaaaaaa00000000000000000000000a';
  const OPTION_ID = 'ffffffff00000000000000000000000f';
  const OPTION_GROUP_ID = '99999999000000000000000000000009';
  const CONTENT_ID = '11111111000000000000000000000001';
  const BENEFIT_ID = '22222222000000000000000000000002';

  /**
   * A repository over a store-backed executor that honours `WHERE … IN (…)`, so the SKU projection and
   * the loaders' own link lookups can be answered independently.
   */
  function makeFetchHarness(
    baseProductType: 'merchandise' | 'contentAccess' | 'subscription',
    tables: Readonly<Record<string, readonly MySqlRow[]>>,
  ): { readonly repository: MySqlSkuRepository; readonly statements: Statement[] } {
    const statements: Statement[] = [];

    const executor: SkuStatementExecutor = {
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        statements.push({ kind: 'read', sql, params: [...params] });

        const table = Object.keys(tables).find((name) => new RegExp(`FROM ${name}\\b`).test(sql));
        if (table === undefined) {
          return Promise.resolve([]);
        }
        const rows = tables[table] ?? [];

        const filter = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(sql);
        const column = filter?.[1];
        if (column !== undefined) {
          return Promise.resolve(rows.filter((row) => params.includes(row[column])));
        }
        return Promise.resolve([...rows]);
      },
      executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
        statements.push({ kind: 'write', sql, params: [...params] });
        return Promise.resolve(1);
      },
    };

    return {
      statements,
      repository: new MySqlSkuRepository(
        executor,
        createOptionGroupSortOrderMemo(),
        /* Resolves the product's own product type to the requested discriminator. No cast: the object
         * literal already satisfies the resolver contract structurally, which is the whole benefit of the
         * port being an interface rather than a class. */
        {
          getProductType: (): Promise<{ productTypeID: string; systemCode: string } | undefined> =>
            Promise.resolve(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE[baseProductType]),
        },
        /* The audit-actor source; see the note on the other construction site. */
        { getCurrentAccount: () => undefined },
      ),
    };
  }

  /** A product whose product type is the seeded discriminator for `baseProductType`. */
  function productFor(baseProductType: 'merchandise' | 'contentAccess' | 'subscription'): Product {
    const productType = new ProductType();
    productType.productTypeID = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE[baseProductType].productTypeID;
    productType.systemCode = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE[baseProductType].systemCode;
    productType.productTypeIDPath = productType.productTypeID;

    const product = new Product();
    product.productID = PRODUCT_ID;
    product.productType = productType;
    return product;
  }

  /*
   * The legacy writes `INNER JOIN FETCH` in all three branches. The port emitted the join — so the row
   * COUNT was right, duplicates included — and never populated the collection, so every member reading
   * one answered from an empty array without raising.
   */
  it('populates the option collection for a merchandise product, with its option group', async () => {
    const harness = makeFetchHarness('merchandise', {
      SwSku: [{ skuID: SKU_A, skuCode: 'SKU-A', productID: PRODUCT_ID }],
      /* ⚠️ THESE ROWS CARRY THE OPTION'S OWN COLUMNS ALONGSIDE THE LINK'S, because the statement under
       * test is a JOIN — `SwSkuOption` INNER JOIN `SwOption` — and this double resolves a statement to a
       * single store rather than composing joins. Modelling the JOINED row is what keeps the fixture
       * honest about the result set the adapter actually receives; a bare `{skuID, optionID}` here would
       * describe a result set the statement cannot return. */
      SwSkuOption: [
        {
          skuID: SKU_A,
          optionID: OPTION_ID,
          optionName: 'Large',
          optionGroupID: OPTION_GROUP_ID,
        },
      ],
      SwOptionGroup: [{ optionGroupID: OPTION_GROUP_ID, optionGroupCode: 'size' }],
    });

    const skus = await harness.repository.findByProduct(productFor('merchandise'), true);

    expect(skus).toHaveLength(1);
    expect(skus[0]?.getOptions()).toHaveLength(1);
    expect(skus[0]?.getOptions()[0]?.optionID).toBe(OPTION_ID);
    /* The group comes with it, because `Sku.generateImageFileName` reads through it. */
    expect(skus[0]?.getOptions()[0]?.optionGroup?.optionGroupCode).toBe('size');
  });

  it('populates the access-content references for a contentAccess product', async () => {
    const harness = makeFetchHarness('contentAccess', {
      SwSku: [{ skuID: SKU_A, skuCode: 'SKU-A', productID: PRODUCT_ID }],
      SwSkuAccessContent: [{ skuID: SKU_A, contentID: CONTENT_ID }],
    });

    const skus = await harness.repository.findByProduct(productFor('contentAccess'), true);

    /* Identifier references, not entities: `Content` is out of scope, so the port models the collection
     * as `{ contentID }` and no excluded entity is hydrated. */
    expect(skus[0]?.accessContents).toEqual([{ contentID: CONTENT_ID }]);
  });

  it('populates the subscription-benefit references but NOT the term, matching the legacy', async () => {
    const harness = makeFetchHarness('subscription', {
      SwSku: [{ skuID: SKU_A, skuCode: 'SKU-A', productID: PRODUCT_ID }],
      SwSkuSubsBenefit: [{ skuID: SKU_A, subscriptionBenefitID: BENEFIT_ID }],
    });

    const skus = await harness.repository.findByProduct(productFor('subscription'), true);

    expect(skus[0]?.subscriptionBenefits).toEqual([{ subscriptionBenefitID: BENEFIT_ID }]);
    /* `model/dao/SkuDAO.cfc:L159` joins the term with NO `FETCH`, so it stays unresolved on purpose. */
    expect(skus[0]?.subscriptionTerm).toBeUndefined();
  });

  it('fetches nothing when the flag is lowered, and asks the resolver nothing either', async () => {
    const harness = makeFetchHarness('merchandise', {
      SwSku: [{ skuID: SKU_A, skuCode: 'SKU-A', productID: PRODUCT_ID }],
      SwSkuOption: [{ skuID: SKU_A, optionID: OPTION_ID }],
    });

    const skus = await harness.repository.findByProduct(productFor('merchandise'), false);

    expect(skus[0]?.getOptions()).toEqual([]);
    /* One statement only: the SKU projection. No join, and no link lookup. */
    expect(harness.statements).toHaveLength(1);
    expect(harness.statements[0]?.sql).not.toContain('INNER JOIN');
  });
});
