/**
 * `MySqlProductRepository` — the ported `model/dao/ProductDAO.cfc`.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/adapters/MySqlProductRepository.test.ts` | CREATE
 * | "**NET-NEW**", and the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS, AND WHAT IT DELIBERATELY DOES NOT
 * =============================================================================================
 * ONE SUITE, COVERING THE ADAPTER'S OWN BEHAVIOUR: the per-row transaction boundary (mismatch M3), the
 * empty spreadsheet branch, the delimiter map, the `void` return contract, the declared exception D18,
 * the D20 partial collapse, Discrepancy 6 and the identifier whitelist.
 *
 * ⛔ A SECOND SUITE USED TO LIVE HERE AND IS WITHDRAWN WITH THE BEHAVIOUR IT ASSERTED. It was called
 * `product import source — SEC-08 policy gate` and it exercised a `validateProductImportSource` scheme
 * and host allowlist over a branded `ProductImportSource`. That gate is withdrawn:
 * `model/dao/ProductDAO.cfc:L73-L87` performs NO check of any kind before retrieving, so refusing a
 * location would change an outcome the legacy produces, which AAP §0.8.2 guideline 4 forbids and which
 * the D18 precedent of §0.6.7.7 does NOT license — parameterising a statement returns exactly the rows
 * interpolated text returned, whereas a refusal returns nothing. The five policy figures the gate needed
 * were also invented configuration (§0.7.3 standard 9, IR-12). The residual CWE-918 exposure — including
 * every ADDRESS-level concern the withdrawn suite documented as an adapter obligation — is carried on
 * the register as mismatch M4, "remote file fetch inside the request", for the operator to close (S8).
 * `src/ports/repositories/ProductRepository.ts` states the withdrawal in full.
 *
 * ⛔ WHAT IS GENUINELY NOT COVERED, AND WHY NEITHER GAP CAN BE CLOSED FROM A TEST. Two register entries
 * this adapter carries have no assertable form here:
 *
 *   - **M4, the remote retrieval itself.** The only reader implementation the subtree delivers is
 *     `unresolvableProductImportSourceReader` (`src/adapters/mysql/MySqlProductRepository.ts:1287`), and
 *     it REFUSES rather than fetching. Every case below therefore supplies retrieved content directly,
 *     which exercises the import loop but asserts nothing about a network fetch. The suite proves the
 *     ORDERING that matters instead — "retrieves ONCE, before the first boundary opens" — so no wait can
 *     sit inside a transaction, which is the part M4 makes reviewable.
 *   - **M1, the one-hour request budget** at `model/service/ProductService.cfc:L65-L68`. It has no
 *     single-invocation form to assert against; it is flagged, not resolved.
 *
 * ⚠️ AN EARLIER REVISION OF THIS HEADER SAID THE OPPOSITE, AND THE CORRECTION IS RECORDED RATHER THAN
 * SWEPT UP. It listed "the per-row transaction boundary (mismatch M3), the empty spreadsheet branch, the
 * delimiter map and the `void` return contract" as NOT covered, adding that "those arrive with the
 * adapter" — true while the importer lived elsewhere, and false now. All four are covered, by the
 * `importFromFile — mismatch M3 and the void contract` suite below and its per-row-body companion, and
 * the paragraph above this one already lists them. The stale sentence contradicted its own file, which
 * is precisely the failure a reader uses this header to avoid.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 verified that no legacy DAO test exists at
 * all — "**No** `SkuDAOTest` or `OptionDAOTest` exists" — and there is likewise no `ProductDAOTest`.
 * Nothing here extends a legacy assertion, and none is labelled as though it did (AAP 0.8.3.7).
 */
import {
  composeAttributeSetSelection,
  composeExistenceLookup,
  composeImportInsert,
  composeImportUpdate,
  composeProductSearch,
  MySqlProductRepository,
} from '../../src/adapters/mysql/MySqlProductRepository';
import { assertTableName } from '../../src/adapters/mysql/QueryRunner';
import { DomainError } from '../../src/errors/DomainError';
import { DEPRECATED_SETTING_DEFAULTS } from '../../src/adapters/settings/StaticSettingResolver';

import type {
  DelimitedImportRecordSet,
  MySqlProductRepositoryDependencies,
  ProductImportTransactionBoundary,
  ProductImportTransactionScope,
  ProductStatementExecutor,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { AccountContextPort } from '../../src/ports/AccountContextPort';
import type { ProductRepository } from '../../src/ports/repositories/ProductRepository';
import { Product } from '../../src/domain/product/Product';
import { toExactDecimal } from '../../src/util/formatting';

/* ================================================================================================
 * THE ADAPTER. A RECORDING HARNESS, AND NO DATABASE.
 * ==============================================================================================
 * Every double below is a plain object literal or a small closure. There is no mocking library in this
 * subtree and none is added: the adapter takes its execution surfaces and its three collaborators as
 * constructor parameters, so substitution needs nothing more than an object of the right shape. That is
 * the whole reason AAP 0.7.3 standard 3 replaces the legacy's dynamic `getService()` lookups with
 * constructor injection — the legacy DAO reads a datasource, a username and a password off the
 * application's own configuration object and cannot be exercised without one.
 * ============================================================================================== */

/** One statement the adapter issued, with the region it was issued from. */
interface JournalEntry {
  /** `row#1`, `row#2`, `pool` or `no-tx` — which execution region the statement travelled through. */
  readonly region: string;
  /** `read` for `execute`, `write` for `executeMutation`. */
  readonly kind: 'read' | 'write';
  /** The classification of the statement. See {@link classify}. */
  readonly what: string;
  /** The statement text exactly as the adapter composed it. */
  readonly sql: string;
  /** The bound parameters, in the adapter's own order. */
  readonly params: readonly unknown[];
}

/** Collapses whitespace so a statement can be matched without depending on its indentation. */
function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Names each statement the adapter can issue.
 *
 * Deliberately exhaustive with an explicit fallthrough: an unrecognised statement is reported as
 * `UNCLASSIFIED` and carried into the assertions rather than silently bucketed, so a statement the
 * adapter starts issuing cannot slip past these tests unnoticed.
 */
function classify(sql: string): string {
  const s = norm(sql);

  if (s.startsWith('SELECT sas.*')) return 'attributeSetSelection';
  if (s.startsWith('SELECT productID, productName FROM SwProduct')) return 'productSearch';
  if (s.startsWith('SELECT optionGroupID FROM SwOptionGroup')) return 'optionGroupLookup';
  if (s.startsWith('SELECT brandID FROM SwBrand')) return 'brandLookup';
  if (s.startsWith('SELECT productTypeID FROM SwProductType')) return 'productTypeLookup';
  if (s.includes('LEFT JOIN SwOption')) return 'optionLookup';
  // Both existence probes project a constant and stop at the first match, so they are recognised by
  // their table rather than by a projected column. See the ⚠️ paragraphs on
  // `SKU_OPTION_EXISTENCE_STATEMENT` and `URL_TITLE_PROBE_STATEMENT` for why the projections changed.
  // The `urlTitle` arm must stay ABOVE `productExistence`: that arm still projects `productID`, whose
  // value `saveImportData` genuinely reads, so the two are no longer confusable — but keeping the
  // narrower test first preserves the ordering guarantee if either projection ever converges again.
  if (s.startsWith('SELECT 1 FROM SwSkuOption')) return 'skuOptionExistence';
  if (s.startsWith('SELECT 1 FROM SwProduct WHERE urlTitle')) return 'urlTitleProbe';
  if (s.startsWith('SELECT productID FROM SwProduct WHERE')) return 'productExistence';
  if (s.startsWith('SELECT skuID FROM SwSku WHERE')) return 'skuExistence';
  if (s.startsWith('INSERT INTO SwProduct')) return 'productInsert';
  if (s.startsWith('INSERT INTO SwSku (')) return 'skuInsert';
  if (s.startsWith('INSERT INTO SwOption (')) return 'optionInsert';
  if (s.startsWith('INSERT INTO SwSkuOption')) return 'skuOptionInsert';
  if (s.startsWith('INSERT INTO SwAttributeValue')) return 'attributeValueInsert';
  if (s.startsWith('UPDATE SwAttributeValue')) return 'attributeValueUpdate';
  if (s.startsWith('UPDATE SwProduct INNER JOIN SwSku')) return 'defaultSkuBackfill';
  if (s.startsWith('UPDATE SwSku INNER JOIN SwProduct')) return 'imageFileBackfill';
  if (s.startsWith('UPDATE SwProduct SET defaultSkuID = NULL')) return 'defaultSkuDetach';
  if (s.startsWith('UPDATE SwProduct SET')) return 'productUpdate';
  if (s.startsWith('DELETE FROM SwSkuOption')) return 'skuOptionDelete';
  if (s.startsWith('DELETE FROM SwSku ')) return 'skuDelete';
  if (s.startsWith('DELETE FROM SwProduct')) return 'productDelete';
  if (s.startsWith('UPDATE SwSku SET')) return 'skuUpdate';

  return `UNCLASSIFIED: ${s.slice(0, 70)}`;
}

/** What a fake statement surface should answer with, keyed by {@link classify}. */
type ReplyTable = Readonly<Record<string, MySqlRow[] | number>>;

/** Everything one harness records, plus the pieces a test needs to drive it. */
interface Harness {
  /** Every statement, in issue order. */
  readonly journal: JournalEntry[];
  /** Transaction lifecycle events, in order: `begin#1`, `commit#1`, `no-tx:enter`, … */
  readonly events: string[];
  /** The dependency bundle to construct the adapter with. */
  readonly dependencies: MySqlProductRepositoryDependencies;
  /** Every source the retrieval collaborator was asked for, with the delimiter and qualifier. */
  readonly retrievals: { source: string; delimiter: string; textQualifier: string }[];
}

/**
 * Builds a recording harness.
 *
 * @param recordSet - what the retrieval collaborator returns.
 * @param replies - per-classification answers. A missing read answers with no rows and a missing write
 *   reports zero affected rows, which is the "nothing exists yet" shape most cases want.
 * @returns the harness.
 */
function makeHarness(recordSet: DelimitedImportRecordSet, replies: ReplyTable = {}): Harness {
  const journal: JournalEntry[] = [];
  const events: string[] = [];
  const retrievals: { source: string; delimiter: string; textQualifier: string }[] = [];

  const surfaceFor = (region: string): ProductStatementExecutor => ({
    execute: (sql, params) => {
      const what = classify(sql);
      journal.push({ region, kind: 'read', what, sql, params });
      const reply = replies[what];
      return Promise.resolve(Array.isArray(reply) ? reply : []);
    },
    executeMutation: (sql, params) => {
      const what = classify(sql);
      journal.push({ region, kind: 'write', what, sql, params });
      const reply = replies[what];
      return Promise.resolve(typeof reply === 'number' ? reply : 0);
    },
  });

  const transactions: ProductImportTransactionBoundary = {
    /*
     * The non-collecting per-row boundary. It retains nothing for the same reason the real one does not:
     * the row body produces no value, so an array of one discarded entry per row would be memory
     * proportional to the file's row count. The event log is what this double exists to record, and it
     * is unchanged — one `begin#n`/`commit#n` pair per row, strictly in order (M3).
     *
     * ⚠️ IT CONSUMES THE ITEM SOURCE WITH `for await`, EXACTLY AS `UnitOfWork.runEachItem` DOES, and that
     * is not a formality. The importer now feeds rows in lazily so it does not hold the whole file, so a
     * synchronous `for...of` here would model a boundary production does not have — and would fail on the
     * very source production supplies. `for await` consumes a materialised array and a lazy source through
     * one statement, so this double cannot accept a source the real boundary would reject, or vice versa.
     *
     * ⚠️ AND IT STILL ADVANCES THE SOURCE STRICTLY BETWEEN "TRANSACTIONS", never concurrently and never
     * ahead: the next item is pulled only after the previous row's `commit#n` is recorded. That ordering
     * is what M3 (independent ordered commits) and M6 (write order is behaviour) both rest on, and it is
     * what makes the recorded event sequence a faithful witness to it.
     */
    runPerItemWithoutResults: async <TItem>(
      items: readonly TItem[] | AsyncIterable<TItem>,
      work: (item: TItem, scope: ProductImportTransactionScope) => Promise<void>,
    ): Promise<void> => {
      let ordinal = 0;

      for await (const item of items) {
        ordinal += 1;
        events.push(`begin#${ordinal}`);
        await work(item, { executor: surfaceFor(`row#${ordinal}`) });
        events.push(`commit#${ordinal}`);
      }
    },
    runWithoutTransaction: async <T>(
      work: (executor: ProductStatementExecutor) => Promise<T>,
    ): Promise<T> => {
      events.push('no-tx:enter');
      const result = await work(surfaceFor('no-tx'));
      events.push('no-tx:leave');
      return result;
    },
  };

  const accountContext: AccountContextPort = {
    getCurrentAccount: () => ({
      accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      newFlag: false,
      adminAccountFlag: true,
    }),
  };

  return {
    journal,
    events,
    retrievals,
    dependencies: {
      executor: surfaceFor('pool'),
      transactions,
      sourceReader: {
        read: (source, delimiter, textQualifier) => {
          retrievals.push({ source, delimiter, textQualifier });
          return Promise.resolve(recordSet);
        },
      },
      accountContext,
      urlTitleFilter: (productName) => productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      /*
       * F03 — reads the identifier of a product's default SKU for the `defaultSkuID` foreign key.
       * `Product.defaultSku` is typed against a nine-member behavioural delegate that deliberately
       * exposes no identifier accessor, so the read arrives as a function. This double answers from a
       * `skuID` property when one is present, which is what the entity the production reader receives
       * carries, and answers the unsaved empty value otherwise — the same value
       * `src/domain/sku/Sku.ts` initialises `skuID` to.
       */
      readDefaultSkuId: (defaultSku: object): string => {
        const candidate: unknown = (defaultSku as { readonly skuID?: unknown }).skuID;
        return typeof candidate === 'string' ? candidate : '';
      },
    },
  };
}

/** Builds a record set from a heading list and row tuples, mirroring a delimited file. */
function fileWith(
  columnList: readonly string[],
  ...rows: readonly string[][]
): DelimitedImportRecordSet {
  return {
    columnList,
    rows: rows.map((cells) => {
      const record: Record<string, string> = {};
      columnList.forEach((heading, index) => {
        record[heading] = cells[index] ?? '';
      });
      return record;
    }),
  };
}

/**
 * The three headings the legacy importer reads with NO guard, and therefore effectively requires.
 *
 * ⚠️ THIS IS A LEGACY PROPERTY, NOT A FIXTURE CONVENIENCE, AND IT IS WORTH STATING BECAUSE NOTHING IN
 * THE SOURCE DOCUMENTS IT. `model/dao/ProductDAO.cfc:L180` and `:L184` read `data['brand_brandname'][r]`
 * and `data['productType_productTypeName'][r]` unconditionally at the top of every row, and `:L399`
 * reads `data['product_productName'][…]` unconditionally on every product INSERT. A CFML query raises on
 * a column it does not have, so a file missing any of the three fails on its FIRST row in the legacy
 * exactly as it does here — which is why the port keeps the reads unguarded and flags them rather than
 * making them optional. An importer that tolerated their absence would accept files the legacy rejects.
 */
const MANDATORY_HEADINGS: readonly (readonly [string, string])[] = [
  ['product_productName', 'A Product Name'],
  ['brand_brandname', 'Acme'],
  ['productType_productTypeName', 'Merchandise'],
];

/**
 * Builds a record set that is actually importable — the headings under test plus any of
 * {@link MANDATORY_HEADINGS} the caller did not already supply.
 *
 * A heading the caller supplied is left exactly as given, so a test can still control its cell.
 *
 * @param columnList - the headings under test, in file order.
 * @param rows - the cells for those headings, one array per row.
 * @returns the record set.
 */
function importable(
  columnList: readonly string[],
  ...rows: readonly string[][]
): DelimitedImportRecordSet {
  const missing = MANDATORY_HEADINGS.filter(
    ([heading]) => !columnList.some((supplied) => supplied.toLowerCase() === heading.toLowerCase()),
  );

  return fileWith(
    [...columnList, ...missing.map(([heading]) => heading)],
    ...rows.map((cells) => [...cells, ...missing.map(([, value]) => value)]),
  );
}

/**
 * The locations the suite imports from.
 *
 * A plain `string`, because the port takes a plain `string`. An earlier revision minted a branded
 * `ProductImportSource` through a scheme-and-host gate; that gate is withdrawn (see the file header), so
 * a fixture location is now exactly what a caller supplies. The absolute form is retained because
 * `model/dao/ProductDAO.cfc:L74` derives the file type from the last dot-delimited segment of whatever
 * it is given, and an absolute URL is the shape the legacy is written against.
 */
function importLocation(fileName: string): string {
  return `https://feeds.example/catalog/${fileName}`;
}

/** Every statement of one classification, in issue order. */
function entriesOf(harness: Harness, what: string): JournalEntry[] {
  return harness.journal.filter((entry) => entry.what === what);
}

const HEX_32 = /^[0-9a-f]{32}$/;

/** The single statement of one classification, or a failure naming what was missing. */
function onlyOf(harness: Harness, what: string): JournalEntry {
  const matches = entriesOf(harness, what);

  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${what} statement, saw ${String(matches.length)}`);
  }

  const [entry] = matches;

  if (entry === undefined) {
    throw new Error(`expected exactly one ${what} statement, saw none`);
  }

  return entry;
}

/** A file whose headings key on the product CODE and carry no SKU, option or attribute columns. */
const SIMPLE_FILE = fileWith(
  ['product_productCode', 'product_productName', 'brand_brandname', 'productType_productTypeName'],
  ['CODE-1', 'First Product', 'Acme', 'Merchandise'],
  ['CODE-2', 'Second Product', 'Acme', 'Merchandise'],
  ['CODE-3', 'Third Product', 'Acme', 'Merchandise'],
);

describe('MySqlProductRepository — the ported ProductDAO', () => {
  describe('statement composition — the D18 declared exception', () => {
    it('NET-NEW — composes every statement as static text plus a bound parameter array', () => {
      /*
       * The single most important assertion in the file. `model/dao/ProductDAO.cfc` interpolates
       * file-supplied values directly into statement text at :L164, :L179, :L183, :L385, :L393, :L401
       * and :L411 and throughout the per-row body :L200-L280. Every one of those becomes a `?`. A
       * quotation mark around a value in composed text would mean the interpolation had survived.
       */
      const composed = [
        composeAttributeSetSelection(2, 3),
        composeAttributeSetSelection(1, 0),
        composeExistenceLookup('SwProduct', 'productID', 'productCode'),
        composeImportUpdate('SwSku', ['skuCode', 'price'], 'skuID'),
        composeImportInsert('SwProduct', ['productName', 'productCode', 'productID']),
        composeProductSearch(0),
        composeProductSearch(2),
      ].join('\n');

      expect(composed).not.toContain("'");
      expect(composed).not.toContain('"');
    });

    it('NET-NEW — translates :L385-L387 as three whitelisted identifiers and one bound value', () => {
      expect(norm(composeExistenceLookup('SwProduct', 'productID', 'productCode'))).toBe(
        'SELECT productID FROM SwProduct WHERE productCode = ?',
      );
    });

    it('NET-NEW — refuses an unwhitelisted table, so :L385-L387 has no injection surface left', () => {
      /*
       * `tContent` is Mura CMS's, reached by `model/dao/ProductDAO.cfc:L261-L264`, and is deliberately
       * absent from the whitelist: admitting it would extend this port into an external CMS schema.
       *
       * Two layers refuse it, and the stronger one cannot be asserted at run time at all.
       * `PhysicalTableName` is a closed union of the eight in-scope names, so
       * `composeExistenceLookup('tContent', ...)` does not COMPILE — an assertion that it throws would
       * need a cast to write, and casting to prove a guard works proves nothing. What is asserted here
       * is the run-time layer the composers delegate to, which is what a JavaScript caller reaching past
       * the types would meet.
       */
      expect(() => assertTableName('tContent')).toThrow();
      expect(() => assertTableName('mura_tcontent')).toThrow();
      // The eight in-scope names pass, and a logical name resolves to its physical form (D22).
      expect(assertTableName('SlatwallProduct')).toBe('SwProduct');
      expect(assertTableName('SwProduct')).toBe('SwProduct');
    });

    it('NET-NEW — refuses a runtime-derived column that is not declared on the table', () => {
      // `listLast(lookupColumn,'_')` derives the column from an uploaded heading, so the derived name
      // has to be checked against the schema before it can be emitted.
      expect(() => composeExistenceLookup('SwProduct', 'productID', 'skuCode')).toThrow();
      expect(() => composeExistenceLookup('SwProduct', 'productID', '')).toThrow();
      expect(() =>
        composeExistenceLookup('SwProduct', 'productID', 'x; DROP TABLE SwProduct--'),
      ).toThrow();
    });

    it('NET-NEW — rebuilds the :L393-L395 SET clause as bound pairs, never as raw text', () => {
      expect(norm(composeImportUpdate('SwSku', ['skuCode', 'price'], 'skuID'))).toBe(
        'UPDATE SwSku SET skuCode = ?, price = ? WHERE skuID = ?',
      );
      // The legacy injected an entire hand-built clause here. A clause-shaped column is refused.
      expect(() => composeImportUpdate('SwSku', ['skuCode', '1=1'], 'skuID')).toThrow();
      expect(() => composeImportUpdate('SwSku', [], 'skuID')).toThrow();
    });

    it('NET-NEW — replaces the butted :L411-L413 interpolations with matched column and marker lists', () => {
      expect(
        norm(composeImportInsert('SwProduct', ['productName', 'productCode', 'productID'])),
      ).toBe('INSERT INTO SwProduct (productName, productCode, productID) VALUES (?, ?, ?)');
      expect(() => composeImportInsert('SwProduct', [])).toThrow();
    });

    it('NET-NEW — restores each column to the casing its entity declares', () => {
      // CFML compared identifiers case-insensitively, so `{name="skucode"}` at :L204 reached the engine
      // unchanged. The whitelist normalises it to the `model/entity/Sku.cfc:L54` spelling instead.
      expect(norm(composeImportInsert('SwSku', ['skucode', 'PRICE', 'skuid']))).toBe(
        'INSERT INTO SwSku (skuCode, price, skuID) VALUES (?, ?, ?)',
      );
    });
  });

  describe('findAttributeSets — the D20 partial collapse', () => {
    it('NET-NEW — preserves the :L56-L61 disjunctive shape when product types are supplied', () => {
      const sql = norm(composeAttributeSetSelection(2, 3));
      expect(sql).toContain('globalFlag = 1 OR EXISTS');
      expect(sql).toContain('asa.productTypeID IN (?, ?, ?)');
      expect(sql).toContain('ast.systemCode IN (?, ?)');
    });

    it('NET-NEW — preserves the :L60 global-only shape when the product-type list is empty', () => {
      const sql = norm(composeAttributeSetSelection(1, 0));
      expect(sql).toContain('AND sas.globalFlag = 1');
      expect(sql).not.toContain('OR EXISTS');
      expect(sql).not.toContain('SwAttributeSetProductType');
    });

    it('NET-NEW — preserves the :L62 ordering', () => {
      expect(norm(composeAttributeSetSelection(1, 1))).toContain(
        'ORDER BY ast.systemCode ASC, sas.sortOrder ASC',
      );
    });

    it('NET-NEW — binds through ONE path, which is all the :L64 TODO legitimately collapses', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.findAttributeSets(['productAttributeSet'], ['pt-1', 'pt-2']);

      const entry = onlyOf(harness, 'attributeSetSelection');
      // :L66 bound a delimited LIST and :L68 bound an ARRAY, to the same named parameter, purely to
      // work around a CFML-engine divergence. Positionally there is one shape: type codes then
      // product types, in statement-text order.
      expect(entry.params).toEqual(['productAttributeSet', 'pt-1', 'pt-2']);
      expect(entry.region).toBe('pool');
    });

    it('NET-NEW — an empty type-code list still binds exactly one marker, never zero', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.findAttributeSets([], []);

      // `arrayToList([])` is the empty STRING — one value, not an absent one. Zero markers would emit
      // `IN ()`, which no engine parses.
      expect(onlyOf(harness, 'attributeSetSelection').params).toEqual(['']);
    });

    it('NET-NEW — returns rows unnarrowed, because Attribute* is an excluded family', async () => {
      const rows: MySqlRow[] = [{ attributeSetID: 'as-1', anythingElse: 42 }];
      const harness = makeHarness(SIMPLE_FILE, { attributeSetSelection: rows });
      const repository = new MySqlProductRepository(harness.dependencies);

      const result = await repository.findAttributeSets(['code'], []);

      expect(result).toEqual(rows);
      // The declared element type is `unknown`, so reading a field needs a narrowing the CALLER owns.
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('importFromFile — mismatch M3 and the void contract', () => {
    it('NET-NEW — opens one INDEPENDENT transaction per row, never one around the import', async () => {
      /*
       * ⭐ `model/dao/ProductDAO.cfc:L176` opens the record loop and :L177 opens `transaction{` INSIDE
       * it. Wrapping the loop in a single transaction is a two-line change any engineer would make to a
       * new importer, and it destroys M3 — the legacy leaves a PARTIALLY IMPORTED catalogue on failure.
       */
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(importLocation('products.csv'));

      expect(harness.events.filter((event) => event.startsWith('begin#'))).toEqual([
        'begin#1',
        'begin#2',
        'begin#3',
      ]);
      expect(harness.events.filter((event) => event.startsWith('commit#'))).toEqual([
        'commit#1',
        'commit#2',
        'commit#3',
      ]);
      // Strictly interleaved: each row commits before the next begins.
      expect(harness.events.slice(0, 6)).toEqual([
        'begin#1',
        'commit#1',
        'begin#2',
        'commit#2',
        'begin#3',
        'commit#3',
      ]);
    });

    it('NET-NEW — runs both :L287-L325 back-fills OUTSIDE every boundary, after the last commit', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(importLocation('products.csv'));

      expect(harness.events).toEqual([
        'begin#1',
        'commit#1',
        'begin#2',
        'commit#2',
        'begin#3',
        'commit#3',
        'no-tx:enter',
        'no-tx:leave',
      ]);
      expect(onlyOf(harness, 'defaultSkuBackfill').region).toBe('no-tx');
      expect(onlyOf(harness, 'imageFileBackfill').region).toBe('no-tx');
    });

    it('NET-NEW — keeps the :L291 LIMIT 1 and adds no ORDER BY to make "first sku" deterministic', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(importLocation('products.csv'));

      const backfill = onlyOf(harness, 'defaultSkuBackfill');
      expect(norm(backfill.sql)).toContain('LIMIT 1');
      expect(norm(backfill.sql)).not.toContain('ORDER BY');
      // :L302 executes it with zero parameters, because :L289 interpolates nothing at all.
      expect(backfill.params).toEqual([]);
    });

    it('NET-NEW — binds the image extension rather than interpolating it, and invents no default', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(importLocation('products.csv'));

      const backfill = onlyOf(harness, 'imageFileBackfill');
      expect(norm(backfill.sql)).toContain('concat(productCode, ?)');
      // Both the separator and the extension travel INSIDE the one bound value, exactly as :L307
      // composed them into one literal.
      expect(backfill.params).toEqual([`.${DEPRECATED_SETTING_DEFAULTS.globalImageExtension}`]);
    });

    it('NET-NEW — resolves to undefined, reporting nothing at all', async () => {
      /*
       * :L73 declares `public void function loadDataFromFile(...)`. A mid-file failure is invisible to
       * the caller and that silence IS the contract: no summary object, no row count, no rejected-row
       * list. Adding one would change what every existing caller observes.
       */
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await expect(
        repository.importFromFile(importLocation('products.csv')),
      ).resolves.toBeUndefined();
    });

    it('NET-NEW — maps .csv to a comma and .txt to a tab, and passes the default text qualifier', async () => {
      const csv = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(csv.dependencies).importFromFile(importLocation('a.csv'));
      expect(csv.retrievals).toEqual([
        {
          source: 'https://feeds.example/catalog/a.csv',
          delimiter: ',',
          textQualifier: '',
        },
      ]);

      const txt = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(txt.dependencies).importFromFile(
        importLocation('a.txt'),
        '"',
      );
      expect(txt.retrievals).toEqual([
        {
          source: 'https://feeds.example/catalog/a.txt',
          delimiter: '\t',
          textQualifier: '"',
        },
      ]);
    });

    it('NET-NEW — leaves the delimiter EMPTY for an unrecognised extension, and does not raise', async () => {
      // :L76 declares `var delimiter = ""` and only the csv and txt branches assign it. Nothing
      // validates the type and nothing reports, so rejecting one here would be an enhancement.
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('feed.dat'),
      );

      expect(harness.retrievals[0]?.delimiter).toBe('');
    });

    it('NET-NEW — reaches the empty :L83-L85 spreadsheet branch: nothing retrieved, nothing imported', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await expect(
        repository.importFromFile(importLocation('catalog.xls')),
      ).resolves.toBeUndefined();

      // The branch is empty in the source, so no retrieval happens and no row is imported...
      expect(harness.retrievals).toEqual([]);
      expect(harness.events.filter((event) => event.startsWith('begin#'))).toEqual([]);
      expect(entriesOf(harness, 'productInsert')).toEqual([]);
      // ...but :L288 and :L304 sit OUTSIDE that branch, so both back-fills still run. The observable
      // legacy property is that nothing is IMPORTED, not that nothing HAPPENS.
      expect(harness.events).toEqual(['no-tx:enter', 'no-tx:leave']);
      expect(entriesOf(harness, 'defaultSkuBackfill')).toHaveLength(1);
      expect(entriesOf(harness, 'imageFileBackfill')).toHaveLength(1);
    });

    it('NET-NEW — an empty file drives zero transactions and still runs both back-fills', async () => {
      const harness = makeHarness(fileWith([]));
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('empty.csv'),
      );

      expect(harness.events).toEqual(['no-tx:enter', 'no-tx:leave']);
    });

    it('NET-NEW — retrieves ONCE, before the first boundary opens, so no wait sits in a transaction', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      expect(harness.retrievals).toHaveLength(1);
    });

    it('NET-NEW — resolves a repeated brand and product type ONCE per import, not once per row', async () => {
      // All three rows of SIMPLE_FILE carry brand `Acme` and product type `Merchandise`.
      const harness = makeHarness(SIMPLE_FILE, {
        brandLookup: [{ brandID: 'b-1' }],
        productTypeLookup: [{ productTypeID: 'pt-1' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Three rows, three transactions — the per-row boundary is untouched.
      expect(entriesOf(harness, 'productInsert')).toHaveLength(3);

      // But one statement each, because the resolutions are remembered for the import.
      expect(entriesOf(harness, 'brandLookup')).toHaveLength(1);
      expect(entriesOf(harness, 'productTypeLookup')).toHaveLength(1);

      // And the resolved identifiers still reach EVERY row's insert, not just the first.
      for (const insert of entriesOf(harness, 'productInsert')) {
        expect(insert.params).toContain('b-1');
        expect(insert.params).toContain('pt-1');
      }

      // The one probe issued ran inside a row's own transaction, never on the pool (M6).
      expect(entriesOf(harness, 'brandLookup')[0]?.region).toBe('row#1');
    });

    it('NET-NEW — an UNRESOLVED brand is re-probed on every row, because a miss is never remembered', async () => {
      // No `brandLookup` reply, so every probe comes back empty — the legacy's own unmatched-brand path.
      const harness = makeHarness(SIMPLE_FILE, { productTypeLookup: [{ productTypeID: 'pt-1' }] });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Once per row, exactly as :L179-L182 issues it. Remembering a miss would have hidden a brand
      // created concurrently between two rows — which the legacy WOULD have seen.
      expect(entriesOf(harness, 'brandLookup')).toHaveLength(3);

      // The resolved product type is still remembered, so the two behaviours coexist in one import.
      expect(entriesOf(harness, 'productTypeLookup')).toHaveLength(1);
    });

    it('NET-NEW — remembers a resolved option per (group, code), and still probes every link', async () => {
      const withOptions = importable(
        ['product_productCode', 'option_colour'],
        ['CODE-1', 'RED'],
        ['CODE-2', 'RED'],
        ['CODE-3', 'BLUE'],
      );
      const harness = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
        optionLookup: [{ optionID: 'o-1', optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Two distinct codes over three rows: RED resolves once and is reused, BLUE resolves on its own row.
      expect(entriesOf(harness, 'optionLookup')).toHaveLength(2);
      expect(entriesOf(harness, 'optionLookup').map((entry) => entry.params[0])).toEqual([
        'RED',
        'BLUE',
      ]);

      // The link probe is asked afresh for EVERY row, because its key carries the per-row SKU (M6).
      expect(entriesOf(harness, 'skuOptionExistence')).toHaveLength(3);
    });

    it('NET-NEW — TWO imports on ONE instance share no lookup memory (mismatch M7)', async () => {
      const harness = makeHarness(SIMPLE_FILE, { brandLookup: [{ brandID: 'b-1' }] });
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(importLocation('products.csv'));
      await repository.importFromFile(importLocation('again.csv'));

      /*
       * Six rows across two imports, all carrying brand `Acme`. Within one import the resolution is
       * remembered, so each import issues exactly ONE brand statement — but the memory dies with its
       * plan, so the SECOND import issues its own rather than inheriting the first's. Two statements
       * total, not one and not six: one is the M7 leak this guards against, six is the N+1 P4 removes.
       */
      expect(entriesOf(harness, 'productInsert')).toHaveLength(6);
      expect(entriesOf(harness, 'brandLookup')).toHaveLength(2);
      expect(entriesOf(harness, 'brandLookup').map((entry) => entry.params)).toEqual([
        ['Acme'],
        ['Acme'],
      ]);
    });

    it('NET-NEW — deferBackfills suppresses the two back-fills WITHOUT touching the row loop', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
        undefined,
        { deferBackfills: true },
      );

      // Three rows, three independent transactions — unchanged.
      expect(harness.events).toEqual([
        'begin#1',
        'commit#1',
        'begin#2',
        'commit#2',
        'begin#3',
        'commit#3',
      ]);

      // And no untransacted region at all, because the caller took the obligation.
      expect(entriesOf(harness, 'defaultSkuBackfill')).toEqual([]);
      expect(entriesOf(harness, 'imageFileBackfill')).toEqual([]);
    });

    it('NET-NEW — the deferred back-fills run identically when invoked as their own step', async () => {
      const deferred = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(deferred.dependencies);
      await repository.importFromFile(importLocation('products.csv'), undefined, {
        deferBackfills: true,
      });
      await repository.backfillImportDerivedColumns();

      const inline = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(inline.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Same two statements, same order, same parameters, same untransacted region — the only difference
      // is WHEN the caller asked for them. That is the whole of the P16 resolution.
      expect(norm(onlyOf(deferred, 'defaultSkuBackfill').sql)).toBe(
        norm(onlyOf(inline, 'defaultSkuBackfill').sql),
      );
      expect(norm(onlyOf(deferred, 'imageFileBackfill').sql)).toBe(
        norm(onlyOf(inline, 'imageFileBackfill').sql),
      );
      expect(onlyOf(deferred, 'imageFileBackfill').params).toEqual(
        onlyOf(inline, 'imageFileBackfill').params,
      );
      expect(deferred.events.slice(-2)).toEqual(['no-tx:enter', 'no-tx:leave']);
    });

    it('NET-NEW — an already-aborted signal stops the import before it retrieves anything', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const controller = new AbortController();
      controller.abort();

      await expect(
        new MySqlProductRepository(harness.dependencies).importFromFile(
          importLocation('products.csv'),
          undefined,
          { signal: controller.signal },
        ),
      ).rejects.toThrow(/cancelled/i);

      // Nothing retrieved, no transaction opened, and — deliberately — no back-fill either: the import
      // never reached the point at which :L288 runs.
      expect(harness.retrievals).toHaveLength(0);
      expect(harness.events).toEqual([]);
    });

    it('NET-NEW — cancelling mid-file leaves earlier rows committed, exactly as a mid-file failure does', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const controller = new AbortController();

      // Abort once the first row has committed. The signal is read at the NEXT row boundary, never
      // inside a transaction, so row 1 is whole and row 2 is not begun at all.
      const original = harness.dependencies.transactions.runPerItemWithoutResults.bind(
        harness.dependencies.transactions,
      );
      const transactions = harness.dependencies.transactions as {
        runPerItemWithoutResults: typeof original;
      };
      transactions.runPerItemWithoutResults = <TItem>(
        items: readonly TItem[] | AsyncIterable<TItem>,
        work: (item: TItem, scope: ProductImportTransactionScope) => Promise<void>,
      ): Promise<void> =>
        original(items, async (item, scope) => {
          await work(item, scope);
          controller.abort();
        });

      await expect(
        new MySqlProductRepository(harness.dependencies).importFromFile(
          importLocation('products.csv'),
          undefined,
          { signal: controller.signal },
        ),
      ).rejects.toThrow(/cancelled/i);

      // Row 1 committed; row 2 was entered by the boundary and abandoned before its first statement.
      expect(harness.events).toEqual(['begin#1', 'commit#1', 'begin#2']);
      expect(entriesOf(harness, 'productInsert')).toHaveLength(1);

      // And the back-fills did NOT run, because the import did not reach them.
      expect(entriesOf(harness, 'defaultSkuBackfill')).toEqual([]);
    });
  });

  describe('importFromFile — lookup-column precedence and the per-row body', () => {
    it('NET-NEW — picks product_productCode over product_productName (:L100 order, :L107 break)', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // The existence lookup names the column the priority walk chose. `productCode` sits at index 2
      // of :L100's array and `productName` at index 3, and the walk `break`s on the first match.
      const lookups = entriesOf(harness, 'productExistence');
      expect(norm(lookups[0]?.sql ?? '')).toBe(
        'SELECT productID FROM SwProduct WHERE productCode = ?',
      );
      expect(lookups.map((entry) => entry.params[0])).toEqual(['CODE-1', 'CODE-2', 'CODE-3']);
    });

    it('NET-NEW — falls back through the priority order when earlier candidates are absent', async () => {
      const nameOnly = fileWith(
        ['product_productName', 'brand_brandname', 'productType_productTypeName'],
        ['Only A Name', 'Acme', 'Merchandise'],
      );
      const harness = makeHarness(nameOnly);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      expect(norm(onlyOf(harness, 'productExistence').sql)).toBe(
        'SELECT productID FROM SwProduct WHERE productName = ?',
      );
    });

    it('NET-NEW — prefers product_remoteID over every later candidate', async () => {
      const remote = importable(
        ['product_productCode', 'product_remoteID', 'product_productName'],
        ['CODE-1', 'R-1', 'A Name'],
      );
      const harness = makeHarness(remote);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      const lookup = onlyOf(harness, 'productExistence');
      expect(norm(lookup.sql)).toBe('SELECT productID FROM SwProduct WHERE remoteID = ?');
      expect(lookup.params).toEqual(['R-1']);
    });

    it('NET-NEW — runs every per-row statement on that row\u2019s own transaction scope', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Mismatch M6: the SKU save reads back the product identifier the product save has just
      // written, so a read on the pool-bound surface would not see it.
      const perRow = harness.journal.filter((entry) => entry.region.startsWith('row#'));
      expect(perRow.length).toBeGreaterThan(0);
      expect(
        harness.journal.filter(
          (entry) => entry.what === 'productInsert' && entry.region !== 'row#1',
        ),
      ).toHaveLength(2);
      expect(entriesOf(harness, 'brandLookup').map((entry) => entry.region)).toEqual([
        'row#1',
        'row#2',
        'row#3',
      ]);
    });

    it('NET-NEW — reads the brand and product-type headings exactly as :L180 and :L184 spell them', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // :L180 spells the brand heading all-lowercase and :L184 spells the product-type heading in
      // camel case. Both resolve, because heading keys are normalised on ingest.
      expect(entriesOf(harness, 'brandLookup')[0]?.params).toEqual(['Acme']);
      expect(entriesOf(harness, 'productTypeLookup')[0]?.params).toEqual(['Merchandise']);
    });

    it('NET-NEW — carries an unmatched brand through as an empty identifier, as the legacy does', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Both lookups answer with no rows here. :L182 and :L186 read the column unguarded and CFML
      // yields the empty string from an empty query column, so the empty value reaches the insert.
      const insert = entriesOf(harness, 'productInsert')[0];
      expect(norm(insert?.sql ?? '')).toContain('brandID');
      expect(insert?.params).toContain('');
    });

    it('NET-NEW — inserts a 32-character lowercase hex identifier (IR-6), never a dashed UUID', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      for (const what of ['productInsert', 'skuInsert']) {
        for (const entry of entriesOf(harness, what)) {
          const identifier = entry.params[entry.params.length - 1];
          expect(typeof identifier).toBe('string');
          expect(identifier).toMatch(HEX_32);
        }
      }
    });

    it('NET-NEW — appends the identifier column LAST, exactly as :L411-L413 assembles it', async () => {
      const harness = makeHarness(
        importable(['product_productCode', 'product_productName'], ['CODE-1', 'First Product']),
      );
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      const insert = onlyOf(harness, 'productInsert');
      // The legacy butted `#insertColumns#` against `#arguments.idColumn#` with no separator, relying
      // on the accumulated string already ending in a comma. Here the identifier is simply the last
      // element of an explicit column array, and its bound value is the last parameter.
      expect(norm(insert.sql)).toContain('productID) VALUES');
      expect(insert.params[insert.params.length - 1]).toMatch(HEX_32);
      // One marker per column, always.
      const markerCount = (norm(insert.sql).match(/\?/g) ?? []).length;
      expect(markerCount).toBe(insert.params.length);
    });

    it('NET-NEW — sets all four audit columns on insert and only the modified pair on update', async () => {
      const inserting = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(inserting.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const insertSql = norm(entriesOf(inserting, 'productInsert')[0]?.sql ?? '');
      expect(insertSql).toContain('createdDateTime');
      expect(insertSql).toContain('createdByAccountID');
      expect(insertSql).toContain('modifiedDateTime');
      expect(insertSql).toContain('modifiedByAccountID');

      const updating = makeHarness(SIMPLE_FILE, {
        productExistence: [{ productID: 'p-existing' }],
        skuExistence: [{ skuID: 's-existing' }],
      });
      await new MySqlProductRepository(updating.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const updateSql = norm(entriesOf(updating, 'productUpdate')[0]?.sql ?? '');
      expect(updateSql).toContain('modifiedDateTime = ?');
      expect(updateSql).toContain('modifiedByAccountID = ?');
      // An update must never rewrite the created columns, and :L363-L364 never appends them.
      expect(updateSql).not.toContain('createdDateTime');
      expect(updateSql).not.toContain('createdByAccountID');
    });

    it('NET-NEW — an UPDATE writes no extra data, so a re-import leaves the brand as it was', async () => {
      const harness = makeHarness(SIMPLE_FILE, {
        productExistence: [{ productID: 'p-existing' }],
        skuExistence: [{ skuID: 's-existing' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // :L368-L378 appends extra data to the INSERT lists only. Substantial behaviour, two lines away
      // from being "fixed", and preserved.
      const updateSql = norm(entriesOf(harness, 'productUpdate')[0]?.sql ?? '');
      expect(updateSql).not.toContain('brandID');
      expect(updateSql).not.toContain('productTypeID');
      expect(updateSql).not.toContain('activeFlag');
      expect(updateSql).not.toContain('urlTitle');
      // And no identifier is generated on the update path.
      expect(entriesOf(harness, 'productInsert')).toEqual([]);
    });

    it('NET-NEW — probes for a urlTitle collision and, on a hit, appends the code ONCE (:L404-L406)', async () => {
      const clean = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(clean.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const cleanInsert = entriesOf(clean, 'productInsert')[0];
      expect(cleanInsert?.params).toContain('first-product');

      // One row shaped as the driver returns a constant projection: the probe reads nothing off it but
      // its presence, so the cell is the literal `1` rather than an identifier the statement no longer
      // selects.
      const colliding = makeHarness(SIMPLE_FILE, { urlTitleProbe: [{ '1': 1 }] });
      await new MySqlProductRepository(colliding.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const collidedInsert = entriesOf(colliding, 'productInsert')[0];
      // ONE append, with the product code, and NO second probe. A second collision is unhandled.
      expect(collidedInsert?.params).toContain('first-product_CODE-1');
      // Exactly one probe per row, never two.
      expect(entriesOf(colliding, 'urlTitleProbe')).toHaveLength(3);
      // And this is deliberately NOT `src/util/urlTitle.ts`'s incrementing strategy, whose first
      // collision suffix is `-2`.
      expect(collidedInsert?.params).not.toContain('first-product-2');
    });

    it('NET-NEW — resolves a urlTitle for the product table only, never for the SKU table', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      expect(norm(entriesOf(harness, 'skuInsert')[0]?.sql ?? '')).not.toContain('urlTitle');
    });

    it('NET-NEW — generates the SKU code from the lookup cell plus one segment per option group', async () => {
      const withOptions = importable(
        ['product_productCode', 'product_productName', 'option_colour', 'option_size'],
        ['CODE-1', 'First Product', 'RED', 'LG'],
      );
      const harness = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // :L200 seeds from the lookup cell and :L202 appends `"-" & cell` per SURVIVING group, in file
      // order. Both groups resolve here, so both contribute.
      expect(onlyOf(harness, 'skuExistence').params).toEqual(['CODE-1-RED-LG']);
    });

    it('NET-NEW — drops an unresolved option group from the code AND from the assignment loop', async () => {
      const withOptions = importable(
        ['product_productCode', 'product_productName', 'option_colour'],
        ['CODE-1', 'First Product', 'RED'],
      );
      // The group lookup answers with no rows, so :L169 deletes the heading.
      const harness = makeHarness(withOptions);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      expect(onlyOf(harness, 'skuExistence').params).toEqual(['CODE-1']);
      expect(entriesOf(harness, 'optionLookup')).toEqual([]);
    });

    it('NET-NEW — resolves each option group ONCE, before the first row boundary opens', async () => {
      const withOptions = importable(
        ['product_productCode', 'option_colour'],
        ['CODE-1', 'RED'],
        ['CODE-2', 'BLUE'],
      );
      const harness = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      const groupLookups = entriesOf(harness, 'optionGroupLookup');
      expect(groupLookups).toHaveLength(1);
      // :L161-L173 sits BEFORE `transaction{` opens at :L177, so it runs on the pool-bound surface.
      expect(groupLookups[0]?.region).toBe('pool');
      // One value, three markers: :L164-L166 matches the key against the name, the code and the id.
      expect(groupLookups[0]?.params).toEqual(['colour', 'colour', 'colour']);
    });

    it('NET-NEW — links an existing option once, and creates then links a missing one', async () => {
      const withOptions = importable(['product_productCode', 'option_colour'], ['CODE-1', 'RED']);

      const existing = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
        optionLookup: [{ optionID: 'o-1', optionGroupID: 'og-1' }],
        // A constant-projection row: the link probe reads only whether anything came back, so the cell
        // is the literal `1`. `optionLookup` above keeps its identifiers, because `:L216-L217` really
        // does read them.
        skuOptionExistence: [{ '1': 1 }],
      });
      await new MySqlProductRepository(existing.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      // The link already exists, so :L230 declines to insert it and :L222 never runs.
      expect(entriesOf(existing, 'optionInsert')).toEqual([]);
      expect(entriesOf(existing, 'skuOptionInsert')).toEqual([]);

      const missing = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
        optionLookup: [{ optionID: null, optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(missing.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      // The outer join returned a row for the group with a NULL option, so :L222 creates the option
      // and :L228 sets the existence flag false so the link is always written.
      const optionInsert = onlyOf(missing, 'optionInsert');
      expect(optionInsert.params[0]).toMatch(HEX_32);
      expect(optionInsert.params[1]).toBe('og-1');
      // :L226 writes the CODE into the name column as well.
      expect(optionInsert.params[2]).toBe('RED');
      expect(optionInsert.params[3]).toBe('RED');
      expect(entriesOf(missing, 'skuOptionInsert')).toHaveLength(1);
    });

    it('NET-NEW — skips an option group whose cell is empty (:L211), while the code keeps a separator', async () => {
      const withOptions = importable(['product_productCode', 'option_colour'], ['CODE-1', '']);
      const harness = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // The asymmetry is real and is preserved: the generated code gains a bare separator...
      expect(onlyOf(harness, 'skuExistence').params).toEqual(['CODE-1-']);
      // ...and the SKU gains no option at all.
      expect(entriesOf(harness, 'optionLookup')).toEqual([]);
      expect(entriesOf(harness, 'skuOptionInsert')).toEqual([]);
    });

    it('NET-NEW — updates a custom attribute, then inserts only when zero rows were AFFECTED', async () => {
      const withAttribute = importable(
        ['product_productCode', 'attribute_attr-1'],
        ['CODE-1', 'a value'],
      );

      const noRowsAffected = makeHarness(withAttribute);
      await new MySqlProductRepository(noRowsAffected.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const update = onlyOf(noRowsAffected, 'attributeValueUpdate');
      // Bind order follows statement TEXT order: value, attribute, product. :L246 bound the value by
      // NAME after `setSql`, which positional binding has no equivalent for.
      expect(update.params[0]).toBe('a value');
      expect(update.params[1]).toBe('attr-1');
      const insert = onlyOf(noRowsAffected, 'attributeValueInsert');
      expect(insert.params[0]).toMatch(HEX_32);
      expect(insert.params[1]).toBe('Product');
      expect(insert.params[2]).toBe('a value');

      const rowsAffected = makeHarness(withAttribute, { attributeValueUpdate: 1 });
      await new MySqlProductRepository(rowsAffected.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      expect(entriesOf(rowsAffected, 'attributeValueInsert')).toEqual([]);
    });

    it('NET-NEW — skips a custom attribute whose cell is empty (:L242)', async () => {
      const withAttribute = importable(['product_productCode', 'attribute_attr-1'], ['CODE-1', '']);
      const harness = makeHarness(withAttribute);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      expect(entriesOf(harness, 'attributeValueUpdate')).toEqual([]);
      expect(entriesOf(harness, 'attributeValueInsert')).toEqual([]);
    });

    it('NET-NEW — raises the declared boundary only when a content-page cell carries content', async () => {
      const empty = importable(['product_productCode', 'productcontent_page'], ['CODE-1', '']);
      const emptyHarness = makeHarness(empty);
      // :L259 splits the cell and `listToArray("")` yields zero elements, so :L260 iterates zero
      // times. A no-op in the source stays a no-op here rather than failing an import the legacy
      // completes.
      await expect(
        new MySqlProductRepository(emptyHarness.dependencies).importFromFile(
          importLocation('products.csv'),
        ),
      ).resolves.toBeUndefined();

      const populated = importable(
        ['product_productCode', 'productcontent_page'],
        ['CODE-1', 'a-page'],
      );
      const populatedHarness = makeHarness(populated);
      // A row that genuinely asks for an assignment raises rather than silently discarding it: the
      // step resolves pages in a separate content-management schema this port does not read.
      await expect(
        new MySqlProductRepository(populatedHarness.dependencies).importFromFile(
          importLocation('products.csv'),
        ),
      ).rejects.toThrow();

      // ⭐ AND THE REFUSAL PRECEDES EVERY WRITE, WHICH IS THE PROPERTY M3 MAKES LOAD-BEARING. The step
      // sits LAST in the legacy row body, so refusing there would commit each earlier row and abandon
      // the file half-imported — a partial catalogue the legacy never produces, because the legacy
      // completes the step. The check is a preflight over the whole record set, so no statement is
      // issued and no boundary is opened.
      expect(populatedHarness.journal).toEqual([]);
      expect(populatedHarness.events).toEqual([]);
    });

    it('NET-NEW — preflights the content refusal even when the offending cell is on a LATER row', async () => {
      // The offending cell is on row three. Under a per-row check, rows one and two would already be
      // durable when row three raised; under the preflight, neither is attempted.
      const late = makeHarness(
        importable(
          ['product_productCode', 'productcontent_page'],
          ['CODE-1', ''],
          ['CODE-2', ''],
          ['CODE-3', 'late-page'],
        ),
      );

      await expect(
        new MySqlProductRepository(late.dependencies).importFromFile(
          importLocation('products.csv'),
        ),
      ).rejects.toThrow();

      expect(late.journal).toEqual([]);
      expect(late.events).toEqual([]);
    });

    it('NET-NEW — imports to completion when the content column is present but every cell is empty', async () => {
      // `:L258` is TRUE and `:L260` iterates zero times for every row, so the legacy completes the
      // import. Refusing here would fail a file the legacy imports, which is why the preflight counts
      // non-empty cells rather than testing for the heading alone.
      const allEmpty = makeHarness(
        importable(['product_productCode', 'productcontent_page'], ['CODE-1', ''], ['CODE-2', '']),
      );

      await expect(
        new MySqlProductRepository(allEmpty.dependencies).importFromFile(
          importLocation('products.csv'),
        ),
      ).resolves.toBeUndefined();

      expect(allEmpty.events.filter((event) => event.startsWith('commit#'))).toEqual([
        'commit#1',
        'commit#2',
      ]);
    });

    it('NET-NEW — never classifies productcontent_page as a product column', async () => {
      const harness = makeHarness(
        importable(['product_productCode', 'productcontent_page'], ['CODE-1', '']),
      );
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      // Its first underscore-delimited segment is `productcontent`, which matches none of :L131-L138's
      // four prefixes. A looser prefix test would write a content path into SwProduct.
      expect(norm(entriesOf(harness, 'productInsert')[0]?.sql ?? '')).not.toContain('page');
    });

    it('NET-NEW — supplies the :L143-L148 flag defaults only when the HEADING is absent', async () => {
      const withoutFlags = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(withoutFlags.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const defaulted = norm(entriesOf(withoutFlags, 'productInsert')[0]?.sql ?? '');
      expect(defaulted).toContain('activeFlag');
      expect(defaulted).toContain('publishedFlag');

      const withEmptyFlagCell = makeHarness(
        importable(['product_productCode', 'product_activeFlag'], ['CODE-1', '']),
      );
      await new MySqlProductRepository(withEmptyFlagCell.dependencies).importFromFile(
        importLocation('products.csv'),
      );
      const carried = entriesOf(withEmptyFlagCell, 'productInsert')[0];
      // The default covers a missing COLUMN, not a missing VALUE, so the empty cell travels as itself.
      // Under the legacy's per-column quoting branch at :L350-L354 this produced malformed text; a
      // bound parameter has no quoting decision to make, which is the one behavioural consequence of
      // the declared exception.
      expect(carried?.params).toContain('');
      expect(norm(carried?.sql ?? '')).toContain('activeFlag');
      expect((norm(carried?.sql ?? '').match(/activeFlag/g) ?? []).length).toBe(1);
    });

    it('NET-NEW — shares ONE timestamp and one account identifier across every option it creates', async () => {
      const withOptions = importable(
        ['product_productCode', 'option_colour'],
        ['CODE-1', 'RED'],
        ['CODE-2', 'BLUE'],
      );
      const harness = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
        optionLookup: [{ optionID: null, optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        importLocation('products.csv'),
      );

      const inserts = entriesOf(harness, 'optionInsert');
      expect(inserts).toHaveLength(2);
      // :L152 calls `now()` ONCE before the loop, so every option of the import shares it however long
      // the import runs.
      expect(inserts[0]?.params[4]).toBe(inserts[1]?.params[4]);
      expect(inserts[0]?.params[6]).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    it('NET-NEW — writes an empty audit account when there is no authenticated account', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const unauthenticated: MySqlProductRepositoryDependencies = {
        ...harness.dependencies,
        accountContext: { getCurrentAccount: () => undefined },
      };
      await new MySqlProductRepository(unauthenticated).importFromFile(
        importLocation('products.csv'),
      );

      // The legacy accessor always returns an account object — a NEW, unpersisted one when nobody is
      // authenticated — whose identifier property declares `unsavedvalue=""`. So `''` is the legacy
      // value, not an invented default: no system account is substituted and no import is refused.
      expect(entriesOf(harness, 'productInsert')[0]?.params).toContain('');
    });
  });

  describe('searchByProductType — Discrepancy 6', () => {
    it('NET-NEW — applies the %term% wildcard INSIDE the repository, not at the caller', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).searchByProductType('widget');

      expect(onlyOf(harness, 'productSearch').params).toEqual(['%widget%']);
    });

    it('NET-NEW — INCLUDES the product-type predicate for a whitespace-only list (len(), not trim())', async () => {
      /*
       * ⚠️ THE ASYMMETRY IS THE POINT. `model/dao/ProductDAO.cfc:L423` guards with
       * `structKeyExists(...) && len(...)`, which a whitespace string PASSES, while
       * `model/dao/SkuDAO.cfc:L130`'s equivalent guards with `trim(...) != ""`, which it FAILS. Both
       * guard strictnesses are carried across as written.
       */
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).searchByProductType('x', '   ');

      const search = onlyOf(harness, 'productSearch');
      expect(norm(search.sql)).toContain('AND productTypeID IN (?)');
      expect(search.params).toEqual(['%x%', '   ']);
    });

    it('NET-NEW — omits the predicate for an absent or empty product-type list', async () => {
      const absent = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(absent.dependencies).searchByProductType('x');
      expect(norm(onlyOf(absent, 'productSearch').sql)).not.toContain('productTypeID');

      const empty = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(empty.dependencies).searchByProductType('x', '');
      expect(norm(onlyOf(empty, 'productSearch').sql)).not.toContain('productTypeID');
    });

    it('NET-NEW — binds the term FIRST and the product-type list SECOND, matching :L427', async () => {
      // :L427 calls `setSQL` AFTER both `addParam` calls, which is what fixes this order. Nothing in a
      // type system catches a transposition of two same-typed parameters, so it is asserted here.
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).searchByProductType('x', 'pt-1,pt-2');

      expect(onlyOf(harness, 'productSearch').params).toEqual(['%x%', 'pt-1', 'pt-2']);
    });

    it('NET-NEW — filters productTypeID DIRECTLY, with no nested subquery (:L424)', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).searchByProductType('x', 'pt-1');

      const sql = norm(onlyOf(harness, 'productSearch').sql);
      expect(sql).toBe(
        'SELECT productID, productName FROM SwProduct WHERE productName LIKE ? AND productTypeID IN (?)',
      );
      // `model/dao/SkuDAO.cfc:L135` nests a subquery for the same filter; this side does not, and the
      // two are not harmonised.
      expect(sql).not.toContain('SELECT productID FROM SwProduct WHERE productTypeID');
    });

    it('NET-NEW — renames each row to the lower-cased {id, value} keys of :L430-L434', async () => {
      const harness = makeHarness(SIMPLE_FILE, {
        productSearch: [{ productID: 'p-1', productName: 'A Product' }],
      });

      await expect(
        new MySqlProductRepository(harness.dependencies).searchByProductType('x'),
      ).resolves.toEqual([{ id: 'p-1', value: 'A Product' }]);
    });

    it('NET-NEW — raises for an omitted term rather than searching for a stringified nothing', async () => {
      // :L419 declares `string term` as OPTIONAL and :L422 interpolates it unconditionally, so the
      // legacy raises too. Supplying a default would be an enhancement.
      const harness = makeHarness(SIMPLE_FILE);
      await expect(
        new MySqlProductRepository(harness.dependencies).searchByProductType(),
      ).rejects.toThrow();
      expect(harness.journal).toEqual([]);
    });

    it('NET-NEW — declares no ORDER BY, because :L421 declares none', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).searchByProductType('x');

      expect(norm(onlyOf(harness, 'productSearch').sql)).not.toContain('ORDER BY');
      expect(norm(onlyOf(harness, 'productSearch').sql)).not.toContain('LIMIT');
    });
  });

  describe('structure — the port contract and the absence of shared state', () => {
    it('NET-NEW — an instance satisfies ProductRepository through its seven declared members', () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository: ProductRepository = new MySqlProductRepository(harness.dependencies);

      // Three are the legacy's own public DAO members; the other FOUR are additive and each is
      // documented at its declaration — the windowed search companion, the back-fill step the
      // out-of-band M1 workflow invokes once per logical import instead of once per invocation, and the
      // two F03 write members covered immediately below. The count in this case's name is the count
      // asserted in its body: seven.
      expect(typeof repository.findAttributeSets).toBe('function');
      expect(typeof repository.importFromFile).toBe('function');
      expect(typeof repository.searchByProductType).toBe('function');
      expect(typeof repository.searchByProductTypeBounded).toBe('function');
      expect(typeof repository.backfillImportDerivedColumns).toBe('function');
      /*
       * F03 — the two write members. The port carried only the three read members before, so
       * `ProductService`'s save and delete paths had no persister to be wired to and terminated in the
       * object graph. Asserting their presence here is what keeps the port and the adapter from drifting
       * apart again.
       */
      expect(typeof repository.saveProduct).toBe('function');
      expect(typeof repository.removeProduct).toBe('function');
    });

    it('NET-NEW — a plain object literal also satisfies ProductRepository, so doubles need no library', () => {
      const double: ProductRepository = {
        findAttributeSets: () => Promise.resolve([]),
        importFromFile: () => Promise.resolve(),
        searchByProductType: () => Promise.resolve([]),
        searchByProductTypeBounded: () => Promise.resolve({ rows: [], hasMore: false }),
        backfillImportDerivedColumns: () => Promise.resolve(),
        saveProduct: (product) => Promise.resolve(product),
        removeProduct: () => Promise.resolve(),
      };

      expect(typeof double.importFromFile).toBe('function');
      expect(typeof double.saveProduct).toBe('function');
      expect(typeof double.removeProduct).toBe('function');
    });

    it('NET-NEW — exposes no member beyond the port, so saveImportData stays private', () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);
      const surface = Object.getOwnPropertyNames(
        Object.getPrototypeOf(repository) as object,
      ).filter((name) => name !== 'constructor');

      // The legacy census is closed at four members, three of them public. Everything else here is a
      // private helper, and `saveImportData` is private in both.
      expect(surface).toContain('findAttributeSets');
      expect(surface).toContain('importFromFile');
      expect(surface).toContain('searchByProductType');

      // The back-fill step is now public — not because the legacy exposed it, but because the two
      // statements it runs must be invocable once per logical import by a workflow that spans several
      // invocations (M1). It adds no behaviour; see its declaration.
      expect(surface).toContain('backfillImportDerivedColumns');
    });

    it('NET-NEW — two instances in one container share no state (mismatch M7)', async () => {
      const first = makeHarness(
        importable(['product_productCode', 'option_colour'], ['CODE-1', 'RED']),
        { optionGroupLookup: [{ optionGroupID: 'og-1' }] },
      );
      const second = makeHarness(
        importable(['product_productCode', 'option_size'], ['CODE-2', 'LG']),
        { optionGroupLookup: [{ optionGroupID: 'og-2' }] },
      );

      await new MySqlProductRepository(first.dependencies).importFromFile(importLocation('a.csv'));
      await new MySqlProductRepository(second.dependencies).importFromFile(importLocation('b.csv'));

      // The option-group resolution of the first import must not leak into the second. Each import's
      // plan is local to the call, never a field, so the second resolves its own heading from scratch.
      expect(entriesOf(first, 'optionGroupLookup')[0]?.params).toEqual([
        'colour',
        'colour',
        'colour',
      ]);
      expect(entriesOf(second, 'optionGroupLookup')[0]?.params).toEqual(['size', 'size', 'size']);
      expect(onlyOf(second, 'skuExistence').params).toEqual(['CODE-2-LG']);
    });

    it('NET-NEW — the same instance can import twice without carrying state between imports', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(importLocation('products.csv'));
      const firstPass = harness.journal.length;
      harness.events.length = 0;
      await repository.importFromFile(importLocation('products.csv'));

      expect(harness.journal.length).toBe(firstPass * 2);
      expect(harness.events).toEqual([
        'begin#1',
        'commit#1',
        'begin#2',
        'commit#2',
        'begin#3',
        'commit#3',
        'no-tx:enter',
        'no-tx:leave',
      ]);
    });
  });

  /* ==============================================================================================
   * SEC-14 — WHICH COLUMNS AN IMPORTED FILE MAY ASSIGN
   *
   * NET-NEW, like everything in this file (AAP §0.6.5.2 — the legacy ships no DAO test at all).
   *
   * The finding was that the heading classifier at `model/dao/ProductDAO.cfc:L130-L140` accepts ANY
   * heading prefixed `product` or `sku`, and the only downstream check was the identifier whitelist,
   * which answers "is this a real column" and not "may a remote file WRITE it" — CWE-915.
   *
   * These cases are written to fail in BOTH directions. The refusals prove the mutation targets are
   * closed; the ACCEPTANCE cases prove the allowlist did not close a column the legacy legitimately
   * imports, which is the half that would turn a security fix into a regression. Every refusal is
   * additionally asserted to have written NOTHING, because M3 commits each row on its own — a control
   * that refused halfway through would leave a partially imported catalog no rollback undoes.
   * ============================================================================================ */

  describe('importable-column authorization — SEC-14', () => {
    /** Imports a file and returns the failure it raised, or undefined when it succeeded. */
    async function importFailure(recordSet: DelimitedImportRecordSet): Promise<{
      readonly raised: unknown;
      readonly harness: Harness;
    }> {
      const harness = makeHarness(recordSet);

      try {
        await new MySqlProductRepository(harness.dependencies).importFromFile(
          importLocation('products.csv'),
        );
      } catch (error: unknown) {
        return { raised: error, harness };
      }

      return { raised: undefined, harness };
    }

    it.each([
      ['product_productID', 'the product primary key'],
      ['product_createdDateTime', 'a created audit column'],
      ['product_modifiedByAccountID', 'a modified-by audit column'],
      ['product_calculatedQATS', 'the calculated availability column the public feed ranges on'],
      ['product_calculatedTitle', 'a calculated column the back-fill owns'],
      ['product_brandID', 'a relationship-control foreign key'],
      ['product_productTypeID', 'a relationship-control foreign key'],
      ['product_defaultSkuID', 'a relationship-control foreign key'],
      ['product_urlTitle', 'the server-generated url title'],
    ])('NET-NEW — REFUSES %s, which is %s', async (heading) => {
      const { raised, harness } = await importFailure(
        importable(['product_productCode', heading], ['CODE-1', 'x']),
      );

      expect(raised).toBeInstanceOf(DomainError);
      /* Refused before the first row boundary opened, so nothing was written and nothing was read. */
      expect(harness.events).toEqual([]);
      expect(harness.journal).toEqual([]);
    });

    it.each([
      ['sku_skuID', 'the sku primary key'],
      ['sku_productID', 'the relationship-control foreign key back to the product'],
      ['sku_subscriptionTermID', 'a relationship-control foreign key'],
      ['sku_calculatedQATS', 'a calculated column'],
      ['sku_modifiedDateTime', 'an audit column'],
      ['sku_remoteID', 'an integration identifier with no sku-side lookup requirement'],
    ])('NET-NEW — REFUSES %s, which is %s', async (heading) => {
      const { raised, harness } = await importFailure(
        importable(['product_productCode', 'sku_skucode', heading], ['CODE-1', 'SKU-1', 'x']),
      );

      expect(raised).toBeInstanceOf(DomainError);
      expect(harness.events).toEqual([]);
      expect(harness.journal).toEqual([]);
    });

    it('NET-NEW — names the refused heading and column, and never echoes the cell value', async () => {
      const { raised } = await importFailure(
        importable(['product_productCode', 'product_productID'], ['CODE-1', 'HIJACKED-VALUE']),
      );

      expect(raised).toBeInstanceOf(DomainError);
      const failure = raised as DomainError;
      const rendered = `${failure.message} ${JSON.stringify(failure.context)}`;
      expect(rendered).toContain('product_productID');
      expect(rendered).toContain('SwProduct');
      /* The heading came from the file and travels as context so an operator can act on the refusal;
       * the row's DATA never does, because this failure is destined for a log. */
      expect(rendered).not.toContain('HIJACKED-VALUE');
    });

    it('NET-NEW — refuses regardless of the casing the file happened to use', async () => {
      const { raised } = await importFailure(
        importable(['product_productCode', 'PRODUCT_DEFAULTSKUID'], ['CODE-1', 'x']),
      );

      expect(raised).toBeInstanceOf(DomainError);
    });

    it('NET-NEW — ACCEPTS product_remoteID, which :L100 lists FIRST in the lookup priority walk', async () => {
      /* The one asymmetry between the two tables, and it is a source requirement rather than a
       * convenience: an import keyed on the integration identifier cannot work if the identifier may
       * never be stored. */
      const { raised, harness } = await importFailure(
        importable(['product_remoteID', 'product_productName'], ['REMOTE-1', 'A Product Name']),
      );

      expect(raised).toBeUndefined();
      expect(harness.events).toContain('begin#1');
      const insert = onlyOf(harness, 'productInsert');
      expect(insert.sql).toContain('remoteID');
      expect(insert.params).toContain('REMOTE-1');
    });

    it('NET-NEW — ACCEPTS every plain persistent scalar of both tables in one file', async () => {
      const { raised, harness } = await importFailure(
        importable(
          [
            'product_productCode',
            'product_productName',
            'product_productDescription',
            'product_activeFlag',
            'product_publishedFlag',
            'product_sortOrder',
            'sku_skucode',
            'sku_price',
            'sku_listPrice',
            'sku_renewalPrice',
            'sku_imageFile',
            'sku_activeFlag',
            'sku_userDefinedPriceFlag',
          ],
          [
            'CODE-1',
            'A Product Name',
            'Described',
            '1',
            '1',
            '3',
            'SKU-1',
            '10',
            '12',
            '9',
            'shoe.png',
            '1',
            '0',
          ],
        ),
      );

      expect(raised).toBeUndefined();
      expect(harness.events).toContain('commit#1');
    });

    it('NET-NEW — still refuses a heading naming no column at all, as a schema fault', async () => {
      /* The allowlist is a strict SUBSET of the schema whitelist, so an unknown column is refused too.
       * The point of the case is that nothing became permissive: `product_nonsense` did not start
       * importing merely because a second, narrower check was added in front of the first. */
      const { raised, harness } = await importFailure(
        importable(['product_productCode', 'product_nonsense'], ['CODE-1', 'x']),
      );

      expect(raised).toBeInstanceOf(DomainError);
      expect(harness.journal).toEqual([]);
    });

    it('NET-NEW — leaves the author-controlled extraData path untouched', async () => {
      /* `:L368-L378` supplies `brandID`, `productTypeID` and the defaulted flags itself, and those are
       * exactly the columns a FILE may not name. The insert must therefore still carry them. */
      const { raised, harness } = await importFailure(
        importable(['product_productCode'], ['CODE-1']),
      );

      expect(raised).toBeUndefined();
      const insert = onlyOf(harness, 'productInsert');
      expect(insert.sql).toContain('brandID');
      expect(insert.sql).toContain('productTypeID');
      expect(insert.sql).toContain('activeFlag');
      expect(insert.sql).toContain('publishedFlag');
    });
  });
});

/* ================================================================================================
 * F03 / F04 — THE ENTITY WRITE SEAM
 * ================================================================================================
 * `ProductService` declares a `persistProduct` collaborator and reaches product deletion through
 * `BaseService`, and before these two members existed NO adapter implemented `SwProduct`
 * INSERT/UPDATE/DELETE at all — the importer's `composeImportInsert`/`composeImportUpdate` compose
 * statements for a delimited-file row, not for a domain entity, so the save path terminated in the object
 * graph. These cases pin the parts that fail silently rather than loudly: the identifier shape, the
 * circular-foreign-key write order, the audit stamp, and the forced removal sequence.
 *
 * TEST PROVENANCE: **NET-NEW**, like every case in this file. AAP 0.6.5.2 records that no legacy DAO test
 * exists for any DAO in the slice.
 * ============================================================================================== */
describe('MySqlProductRepository — entity persistence (F03 / F04)', () => {
  /** IR-6: 32 lowercase hexadecimal characters, no dashes, never an auto-increment. */
  const IDENTIFIER_SHAPE = /^[0-9a-f]{32}$/;

  /** A transient product carrying enough to make the foreign keys observable. */
  function transientProduct(): Product {
    const product = new Product();
    product.productName = 'Test Product';
    product.productCode = 'TESTPRODUCTXXX';
    product.urlTitle = 'test-product';
    return product;
  }

  function repositoryFor(harness: Harness): MySqlProductRepository {
    return new MySqlProductRepository(harness.dependencies);
  }

  it('NET-NEW — mints a 32-character lowercase hex identifier on the insert branch, and only there', async () => {
    const harness = makeHarness(SIMPLE_FILE);
    const product = transientProduct();
    expect(product.isNew()).toBe(true);

    await repositoryFor(harness).saveProduct(product);
    const minted = product.productID;

    expect(minted).toMatch(IDENTIFIER_SHAPE);
    expect(minted).not.toContain('-');
    expect(product.isNew()).toBe(false);

    /* A second save must NOT re-mint: the stored row is keyed on the first value, and step 5 of the
     * write order depends on this call updating rather than inserting a duplicate. */
    await repositoryFor(harness).saveProduct(product);
    expect(product.productID).toBe(minted);
  });

  it('NET-NEW — the first save INSERTs with defaultSkuID null, and the second UPDATEs carrying it', async () => {
    const harness = makeHarness(SIMPLE_FILE);
    const product = transientProduct();
    const repository = repositoryFor(harness);

    /* STEP 4a — the product row, before any SKU row exists. */
    await repository.saveProduct(product);

    const insert = onlyOf(harness, 'productInsert');
    expect(insert.kind).toBe('write');
    expect(norm(insert.sql)).toContain('INSERT INTO SwProduct (productID,');
    expect(insert.params[0]).toBe(product.productID);
    /* `defaultSkuID` is bound, and bound as null: `model/entity/Product.cfc:L71` and
     * `model/entity/Sku.cfc:L65` reference each other, so neither row can carry its reference on
     * insert. */
    const columnCount = norm(insert.sql).split('VALUES')[0]?.split(',').length ?? 0;
    expect(insert.params.length).toBe(columnCount);
    expect(insert.params).toContain(null);

    /* STEP 5 — the SKU now exists, so the back-reference can be written. */
    product.defaultSku = {
      getCurrencyCode: () => 'USD',
      /* F07 — the delegate's monetary members are `ExactDecimal`, so the literals are exact text. */
      getPrice: () => toExactDecimal(1),
      getRenewalPrice: () => toExactDecimal(1),
      getListPrice: () => toExactDecimal(1),
      getImageDirectory: () => '',
      getImagePath: () => '',
      getImage: () => '',
      getResizedImagePath: () => '',
      getImageExistsFlag: () => false,
    };

    await repository.saveProduct(product);

    const update = onlyOf(harness, 'productUpdate');
    expect(norm(update.sql)).toContain('UPDATE SwProduct SET');
    expect(norm(update.sql)).toContain('defaultSkuID = ?');
    expect(norm(update.sql)).toContain('WHERE productID = ?');
    /* The predicate binds last, so the identifier is the final parameter. */
    expect(update.params[update.params.length - 1]).toBe(product.productID);
    /* And the injected reader supplied the default SKU's identifier, because the delegate exposes no
     * identifier accessor of its own. */
    expect(update.params).toContain('');
  });

  it('NET-NEW — stamps the audit block on insert, both timestamps to the identical instant', async () => {
    const harness = makeHarness(SIMPLE_FILE);
    const product = transientProduct();
    expect(product.createdDateTime).toBeUndefined();

    await repositoryFor(harness).saveProduct(product);

    const created = product.createdDateTime;
    const modified = product.modifiedDateTime;
    expect(created).toBeInstanceOf(Date);
    expect(modified).toBeInstanceOf(Date);
    /* `org/Hibachi/HibachiEntity.cfc:L613` and `:L618` read the clock once, so the two are equal. */
    expect(modified?.getTime()).toBe(created?.getTime());
    /* The harness's account is persisted and administrative, so both foreign keys are written. */
    expect(product.createdByAccount).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(product.modifiedByAccount).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('NET-NEW — on update moves only modifiedDateTime and never re-writes createdByAccount', async () => {
    const harness = makeHarness(SIMPLE_FILE);
    const product = transientProduct();
    const repository = repositoryFor(harness);

    await repository.saveProduct(product);
    const createdAt = product.createdDateTime?.getTime();

    product.createdByAccount = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    await repository.saveProduct(product);

    expect(product.createdDateTime?.getTime()).toBe(createdAt);
    expect(product.createdByAccount).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(product.modifiedDateTime?.getTime()).toBeGreaterThanOrEqual(createdAt ?? 0);
  });

  it('NET-NEW — removal emits four statements in the order the foreign keys force', async () => {
    const harness = makeHarness(SIMPLE_FILE);
    const product = transientProduct();
    const repository = repositoryFor(harness);

    await repository.saveProduct(product);
    const identifier = product.productID;
    harness.journal.length = 0;

    await repository.removeProduct(product);

    expect(harness.journal.map((entry) => entry.what)).toEqual([
      'defaultSkuDetach',
      'skuOptionDelete',
      'skuDelete',
      'productDelete',
    ]);
    /* Every statement is keyed on the product identifier and nothing else. */
    for (const entry of harness.journal) {
      expect(entry.kind).toBe('write');
      expect(entry.params).toEqual([identifier]);
    }
    /* The link rows are removed through a sub-select on the SKU table, because the link table carries no
     * product column of its own — `model/entity/Sku.cfc:L76`. */
    expect(norm(onlyOf(harness, 'skuOptionDelete').sql)).toContain(
      'DELETE FROM SwSkuOption WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
    );
  });

  it('NET-NEW — refuses to remove a transient product rather than composing a predicate on the unsaved value', async () => {
    const harness = makeHarness(SIMPLE_FILE);

    await expect(repositoryFor(harness).removeProduct(transientProduct())).rejects.toThrow(
      /cannot be removed before it has been persisted/,
    );
    expect(harness.journal).toEqual([]);
  });
});
