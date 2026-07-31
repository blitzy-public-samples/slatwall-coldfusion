/**
 * The product importer's import-source policy gate — SEC-08.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/adapters/MySqlProductRepository.test.ts` | CREATE
 * | "**NET-NEW**", and the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS, AND WHAT IT DELIBERATELY DOES NOT
 * =============================================================================================
 * TWO SUITES, ADDED AT TWO DIFFERENT CHECKPOINTS, AND THE SPLIT IS RECORDED RATHER THAN TIDIED AWAY.
 *
 * [1] `product import source — SEC-08 policy gate` covers `validateProductImportSource` in
 *     `src/ports/repositories/ProductRepository.ts` — the gate the adapter's `importFromFile` is
 *     contracted to receive. It was written before the adapter existed and its note then read "the
 *     adapter itself does not exist yet"; it also recorded that the importer's own behaviour — the
 *     per-row transaction boundary (mismatch M3), the empty spreadsheet branch, the delimiter map and
 *     the `void` return contract — would "arrive with the adapter."
 *
 * [2] `MySqlProductRepository — the ported ProductDAO` is that arrival.
 *     `src/adapters/mysql/MySqlProductRepository.ts` now exists, so the deferred behaviour is covered
 *     here rather than left as a standing gap. It closes exactly the list suite [1] deferred, plus the
 *     declared exception D18, the D20 partial collapse, Discrepancy 6 and the identifier whitelist.
 *
 * Both suites live in this one file because AAP 0.4.1.12 enumerates it as the single home for coverage
 * of `model/dao/ProductDAO.cfc`, and inventing an un-enumerated `test/ports/**` file would be exactly
 * the scope drift the plan forbids.
 *
 * NOT COVERED HERE, because it is impossible here rather than merely omitted: every ADDRESS-level
 * defence the port states as an adapter obligation — resolving the approved host and refusing private,
 * loopback, link-local or instance-metadata addresses; connecting to the address that was vetted rather
 * than re-resolving; re-validating each redirect hop; and enforcing the byte and time bounds while
 * streaming. All four need a resolver or a live socket. They are NOT the repository's either: the
 * repository performs no network input or output at all (mismatch M4 — the single legacy `cfhttp` at
 * `model/dao/ProductDAO.cfc:L87` becomes an injected reader), so they belong to whichever collaborator
 * the composition root supplies as that reader. The gate closes the NAME half of CWE-918; that
 * collaborator must close the ADDRESS half.
 *
 * ALSO NOT COVERED, and deliberately: no test here touches a database. Every statement is asserted on
 * the text and the bound parameter array a recording double captured, which is what AAP 0.7.3 standard
 * 6 requires — the legacy suite has no mocking library at all and no CFML runtime is available here, so
 * assertability without a live engine is a design property of the adapter rather than a convenience.
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
import { validateProductImportSource } from '../../src/ports/repositories/ProductRepository';

import type {
  DelimitedImportRecordSet,
  MySqlProductRepositoryDependencies,
  ProductImportTransactionBoundary,
  ProductImportTransactionScope,
  ProductStatementExecutor,
} from '../../src/adapters/mysql/MySqlProductRepository';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { AccountContextPort } from '../../src/ports/AccountContextPort';
import type {
  ProductImportSource,
  ProductImportSourcePolicy,
  ProductRepository,
} from '../../src/ports/repositories/ProductRepository';

/**
 * A policy that permits exactly one scheme and one host.
 *
 * ⛔ EVERY VALUE HERE IS A TEST FIXTURE, NOT A RECOMMENDED DEFAULT. The port declares no default for any
 * of the five members precisely so that no figure in source can be mistaken for policy (AAP 0.7.3 S9,
 * IR-12), and these numbers exist only so the cases below have something concrete to refuse against.
 */
const POLICY: ProductImportSourcePolicy = {
  allowedSchemes: ['https'],
  allowedHosts: ['feeds.example'],
  maximumResponseBytes: 1_048_576,
  requestTimeoutMs: 30_000,
  maximumRedirects: 2,
};

const APPROVED = 'https://feeds.example/catalog/products.csv';

describe('product import source — SEC-08 policy gate', () => {
  it('NET-NEW — approves an allowlisted host on an allowlisted scheme', () => {
    expect(validateProductImportSource(APPROVED, POLICY)).toBe(APPROVED);
  });

  it('NET-NEW — returns the candidate BYTE-FOR-BYTE, normalising nothing', () => {
    /*
     * The WHATWG parse lower-cases the scheme and host internally, and a normalising validator would
     * hand back that rewritten form. It must not: the value that was checked has to be the value that
     * gets fetched, or the check applies to a different URL than the request does.
     */
    const asTyped = 'HTTPS://Feeds.Example/Catalog/Products.csv';
    expect(validateProductImportSource(asTyped, POLICY)).toBe(asTyped);
  });

  it('NET-NEW — matches scheme and host case-insensitively and tolerates padded policy entries', () => {
    const padded: ProductImportSourcePolicy = {
      ...POLICY,
      allowedSchemes: [' HTTPS '],
      allowedHosts: [' Feeds.Example '],
    };
    expect(validateProductImportSource(APPROVED, padded)).toBe(APPROVED);
  });

  it('NET-NEW — refuses every scheme outside the policy, including the non-HTTP SSRF reach', () => {
    for (const candidate of [
      'file:///etc/passwd',
      'ftp://feeds.example/products.csv',
      'gopher://feeds.example/1',
      'dict://feeds.example:2628/show',
      'sftp://feeds.example/products.csv',
      'data:text/csv,productCode',
      'http://feeds.example/products.csv',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses embedded credentials, whose visible host is NOT the parsed host', () => {
    /*
     * `https://feeds.example@evil.test/x` reads as the approved host to a human and parses to
     * `evil.test`. The userinfo form is refused outright rather than parsed and trusted — the assertion
     * below pins the parse so the reason stays visible to a future reader.
     */
    expect(new URL('https://feeds.example@evil.test/x').hostname).toBe('evil.test');

    for (const candidate of [
      'https://feeds.example@evil.test/x.csv',
      'https://feeds.example:secret@evil.test/x.csv',
      'https://user:pass@feeds.example/x.csv',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses suffix-confusion and sibling-subdomain hosts', () => {
    // Exactly the failures a wildcard or suffix rule would have admitted, which is why
    // `allowedHosts` offers neither.
    for (const candidate of [
      'https://feeds.example.attacker.test/x.csv',
      'https://notfeeds.example/x.csv',
      'https://evil.feeds.example/x.csv',
      'https://feeds.example./x.csv',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses the internal targets an unbounded fetch would have reached', () => {
    /*
     * These are refused HERE only because they are not allowlisted names. That is NOT the same as an
     * address check: an approved name that RESOLVES to one of these addresses still reaches the adapter,
     * which is why the port makes address vetting an adapter obligation rather than implying this case
     * closed it.
     */
    for (const candidate of [
      'https://169.254.169.254/latest/meta-data/',
      'http://169.254.169.254/latest/meta-data/',
      'https://127.0.0.1/admin',
      'https://localhost/admin',
      'https://[::1]/admin',
      'https://10.0.0.5/internal',
      'https://metadata.google.internal/computeMetadata/v1/',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses a candidate that is not an absolute URL, rather than resolving it', () => {
    for (const candidate of [
      '',
      '   ',
      '/catalog/products.csv',
      'products.csv',
      'https://',
      '://x',
    ]) {
      expect(validateProductImportSource(candidate, POLICY)).toBeUndefined();
    }
  });

  it('NET-NEW — an empty scheme or host allowlist refuses everything', () => {
    // Treated as a deliberate "imports disabled" policy, not as a misconfiguration to second-guess:
    // guessing would mean inventing a fallback scheme or host.
    expect(
      validateProductImportSource(APPROVED, { ...POLICY, allowedSchemes: [] }),
    ).toBeUndefined();
    expect(validateProductImportSource(APPROVED, { ...POLICY, allowedHosts: [] })).toBeUndefined();
  });

  it('NET-NEW — refuses to approve anything when a bound is not a positive safe integer', () => {
    /*
     * A `NaN`, `Infinity`, zero or negative bound degrades silently to "no bound at all", so an
     * unbounded policy must approve nothing however sound the URL is. The bounds are checked BEFORE the
     * URL for exactly that reason.
     */
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5]) {
      expect(
        validateProductImportSource(APPROVED, { ...POLICY, maximumResponseBytes: bad }),
      ).toBeUndefined();
      expect(
        validateProductImportSource(APPROVED, { ...POLICY, requestTimeoutMs: bad }),
      ).toBeUndefined();
    }
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(
        validateProductImportSource(APPROVED, { ...POLICY, maximumRedirects: bad }),
      ).toBeUndefined();
    }
  });

  it('NET-NEW — a host-less URL is refused even if its scheme is misguidedly allowlisted', () => {
    /*
     * DEFENCE IN DEPTH, and the only way to reach the empty-host guard. `file:` URLs parse with an empty
     * host, so an operator who allowlisted `file` would otherwise have a candidate that satisfies the
     * scheme clause and then vacuously "matches" no host at all. The guard refuses it outright: a URL
     * with no host can never be a member of a host allowlist, so approving one would mean approving a
     * location the policy never named. This is deliberately not reachable through the fixture policy —
     * it is asserted against a policy no operator should write, precisely because they might.
     */
    expect(new URL('file:///etc/passwd').hostname).toBe('');

    const misguided: ProductImportSourcePolicy = {
      ...POLICY,
      allowedSchemes: ['file'],
      allowedHosts: ['feeds.example', ''],
    };
    expect(validateProductImportSource('file:///etc/passwd', misguided)).toBeUndefined();
  });

  it('NET-NEW — zero redirects is a valid policy, not an unset one', () => {
    expect(validateProductImportSource(APPROVED, { ...POLICY, maximumRedirects: 0 })).toBe(
      APPROVED,
    );
  });

  it('NET-NEW — refusal carries no reason, so no caller can use it as a policy oracle', () => {
    /*
     * Every refusal is the same single `undefined`. A per-clause reason code would tell a remote caller
     * which schemes and hosts are configured — the reconnaissance half of the SSRF this gate closes.
     */
    const refusals = [
      validateProductImportSource('file:///etc/passwd', POLICY),
      validateProductImportSource('https://evil.test/x.csv', POLICY),
      validateProductImportSource('https://feeds.example@evil.test/x.csv', POLICY),
      validateProductImportSource('not a url', POLICY),
    ];
    expect(new Set(refusals)).toEqual(new Set([undefined]));
  });
});

/* ================================================================================================
 * SUITE [2] — THE ADAPTER. A RECORDING HARNESS, AND NO DATABASE.
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
  if (s.startsWith('SELECT optionID FROM SwSkuOption')) return 'skuOptionExistence';
  if (s.startsWith('SELECT productID FROM SwProduct WHERE urlTitle')) return 'urlTitleProbe';
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
  if (s.startsWith('UPDATE SwProduct SET')) return 'productUpdate';
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
  /** How many times the image-extension resolver was called. */
  readonly extensionCalls: () => number;
}

/**
 * Builds a recording harness.
 *
 * @param recordSet - what the retrieval collaborator returns.
 * @param replies - per-classification answers. A missing read answers with no rows and a missing write
 *   reports zero affected rows, which is the "nothing exists yet" shape most cases want.
 * @param imageExtension - what the image-extension resolver returns. NOT a default the adapter carries:
 *   the adapter has no default, which is the annotated gap, so the value has to be supplied here.
 * @returns the harness.
 */
function makeHarness(
  recordSet: DelimitedImportRecordSet,
  replies: ReplyTable = {},
  imageExtension = 'TEST_EXT',
): Harness {
  const journal: JournalEntry[] = [];
  const events: string[] = [];
  const retrievals: { source: string; delimiter: string; textQualifier: string }[] = [];
  let extensionCalls = 0;

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
    runPerItem: async <TItem, TResult>(
      items: readonly TItem[],
      work: (item: TItem, scope: ProductImportTransactionScope) => Promise<TResult>,
    ): Promise<TResult[]> => {
      const results: TResult[] = [];
      let ordinal = 0;

      for (const item of items) {
        ordinal += 1;
        events.push(`begin#${ordinal}`);
        results.push(await work(item, { executor: surfaceFor(`row#${ordinal}`) }));
        events.push(`commit#${ordinal}`);
      }

      return results;
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
    extensionCalls: () => extensionCalls,
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
      globalImageExtension: () => {
        extensionCalls += 1;
        return imageExtension;
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

/** The policy-approved sources the suite imports from. Branded through the real gate, never forged. */
function approvedSource(fileName: string): ProductImportSource {
  const branded = validateProductImportSource(`https://feeds.example/catalog/${fileName}`, POLICY);

  if (branded === undefined) {
    throw new Error(`the fixture source ${fileName} was refused by the policy gate`);
  }

  return branded;
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

      await repository.importFromFile(approvedSource('products.csv'));

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

      await repository.importFromFile(approvedSource('products.csv'));

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

      await repository.importFromFile(approvedSource('products.csv'));

      const backfill = onlyOf(harness, 'defaultSkuBackfill');
      expect(norm(backfill.sql)).toContain('LIMIT 1');
      expect(norm(backfill.sql)).not.toContain('ORDER BY');
      // :L302 executes it with zero parameters, because :L289 interpolates nothing at all.
      expect(backfill.params).toEqual([]);
    });

    it('NET-NEW — binds the image extension rather than interpolating it, and invents no default', async () => {
      const harness = makeHarness(SIMPLE_FILE, {}, 'TEST_EXT');
      const repository = new MySqlProductRepository(harness.dependencies);

      await repository.importFromFile(approvedSource('products.csv'));

      const backfill = onlyOf(harness, 'imageFileBackfill');
      expect(norm(backfill.sql)).toContain('concat(productCode, ?)');
      // Both the separator and the extension travel INSIDE the one bound value, exactly as :L307
      // composed them into one literal.
      expect(backfill.params).toEqual(['.TEST_EXT']);
      // Resolved per import and never cached, so a warm container cannot serve one caller's
      // configuration to the next (mismatch M7).
      expect(harness.extensionCalls()).toBe(1);
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
        repository.importFromFile(approvedSource('products.csv')),
      ).resolves.toBeUndefined();
    });

    it('NET-NEW — maps .csv to a comma and .txt to a tab, and passes the default text qualifier', async () => {
      const csv = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(csv.dependencies).importFromFile(approvedSource('a.csv'));
      expect(csv.retrievals).toEqual([
        {
          source: 'https://feeds.example/catalog/a.csv',
          delimiter: ',',
          textQualifier: '',
        },
      ]);

      const txt = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(txt.dependencies).importFromFile(
        approvedSource('a.txt'),
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
        approvedSource('feed.dat'),
      );

      expect(harness.retrievals[0]?.delimiter).toBe('');
    });

    it('NET-NEW — reaches the empty :L83-L85 spreadsheet branch: nothing retrieved, nothing imported', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository = new MySqlProductRepository(harness.dependencies);

      await expect(
        repository.importFromFile(approvedSource('catalog.xls')),
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
        approvedSource('empty.csv'),
      );

      expect(harness.events).toEqual(['no-tx:enter', 'no-tx:leave']);
    });

    it('NET-NEW — retrieves ONCE, before the first boundary opens, so no wait sits in a transaction', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        approvedSource('products.csv'),
      );

      expect(harness.retrievals).toHaveLength(1);
    });
  });

  describe('importFromFile — lookup-column precedence and the per-row body', () => {
    it('NET-NEW — picks product_productCode over product_productName (:L100 order, :L107 break)', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
      );

      const lookup = onlyOf(harness, 'productExistence');
      expect(norm(lookup.sql)).toBe('SELECT productID FROM SwProduct WHERE remoteID = ?');
      expect(lookup.params).toEqual(['R-1']);
    });

    it('NET-NEW — runs every per-row statement on that row\u2019s own transaction scope', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
      );

      // :L180 spells the brand heading all-lowercase and :L184 spells the product-type heading in
      // camel case. Both resolve, because heading keys are normalised on ingest.
      expect(entriesOf(harness, 'brandLookup')[0]?.params).toEqual(['Acme']);
      expect(entriesOf(harness, 'productTypeLookup')[0]?.params).toEqual(['Merchandise']);
    });

    it('NET-NEW — carries an unmatched brand through as an empty identifier, as the legacy does', async () => {
      const harness = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
      );
      const cleanInsert = entriesOf(clean, 'productInsert')[0];
      expect(cleanInsert?.params).toContain('first-product');

      const colliding = makeHarness(SIMPLE_FILE, { urlTitleProbe: [{ productID: 'p-other' }] });
      await new MySqlProductRepository(colliding.dependencies).importFromFile(
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        skuOptionExistence: [{ optionID: 'o-1' }],
      });
      await new MySqlProductRepository(existing.dependencies).importFromFile(
        approvedSource('products.csv'),
      );
      // The link already exists, so :L230 declines to insert it and :L222 never runs.
      expect(entriesOf(existing, 'optionInsert')).toEqual([]);
      expect(entriesOf(existing, 'skuOptionInsert')).toEqual([]);

      const missing = makeHarness(withOptions, {
        optionGroupLookup: [{ optionGroupID: 'og-1' }],
        optionLookup: [{ optionID: null, optionGroupID: 'og-1' }],
      });
      await new MySqlProductRepository(missing.dependencies).importFromFile(
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
      );
      expect(entriesOf(rowsAffected, 'attributeValueInsert')).toEqual([]);
    });

    it('NET-NEW — skips a custom attribute whose cell is empty (:L242)', async () => {
      const withAttribute = importable(['product_productCode', 'attribute_attr-1'], ['CODE-1', '']);
      const harness = makeHarness(withAttribute);
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        approvedSource('products.csv'),
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
          approvedSource('products.csv'),
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
          approvedSource('products.csv'),
        ),
      ).rejects.toThrow();
    });

    it('NET-NEW — never classifies productcontent_page as a product column', async () => {
      const harness = makeHarness(
        importable(['product_productCode', 'productcontent_page'], ['CODE-1', '']),
      );
      await new MySqlProductRepository(harness.dependencies).importFromFile(
        approvedSource('products.csv'),
      );

      // Its first underscore-delimited segment is `productcontent`, which matches none of :L131-L138's
      // four prefixes. A looser prefix test would write a content path into SwProduct.
      expect(norm(entriesOf(harness, 'productInsert')[0]?.sql ?? '')).not.toContain('page');
    });

    it('NET-NEW — supplies the :L143-L148 flag defaults only when the HEADING is absent', async () => {
      const withoutFlags = makeHarness(SIMPLE_FILE);
      await new MySqlProductRepository(withoutFlags.dependencies).importFromFile(
        approvedSource('products.csv'),
      );
      const defaulted = norm(entriesOf(withoutFlags, 'productInsert')[0]?.sql ?? '');
      expect(defaulted).toContain('activeFlag');
      expect(defaulted).toContain('publishedFlag');

      const withEmptyFlagCell = makeHarness(
        importable(['product_productCode', 'product_activeFlag'], ['CODE-1', '']),
      );
      await new MySqlProductRepository(withEmptyFlagCell.dependencies).importFromFile(
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
        approvedSource('products.csv'),
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
    it('NET-NEW — an instance satisfies ProductRepository through its three declared members', () => {
      const harness = makeHarness(SIMPLE_FILE);
      const repository: ProductRepository = new MySqlProductRepository(harness.dependencies);

      expect(typeof repository.findAttributeSets).toBe('function');
      expect(typeof repository.importFromFile).toBe('function');
      expect(typeof repository.searchByProductType).toBe('function');
    });

    it('NET-NEW — a plain object literal also satisfies ProductRepository, so doubles need no library', () => {
      const double: ProductRepository = {
        findAttributeSets: () => Promise.resolve([]),
        importFromFile: () => Promise.resolve(),
        searchByProductType: () => Promise.resolve([]),
      };

      expect(typeof double.importFromFile).toBe('function');
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

      await new MySqlProductRepository(first.dependencies).importFromFile(approvedSource('a.csv'));
      await new MySqlProductRepository(second.dependencies).importFromFile(approvedSource('b.csv'));

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

      await repository.importFromFile(approvedSource('products.csv'));
      const firstPass = harness.journal.length;
      harness.events.length = 0;
      await repository.importFromFile(approvedSource('products.csv'));

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
});
