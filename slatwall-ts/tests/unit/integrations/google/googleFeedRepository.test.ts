// ---------------------------------------------------------------------------
// slatwall-ts - tests/unit/integrations/google/googleFeedRepository.test.ts
//
// WHAT THIS SUITE PINS
//   src/integrations/google/googleFeedRepository.ts - the data-access half of
//   the Google product-feed adapter. Three exported units ship from that
//   module and all three are exercised here: the `GoogleFeedRepository` class,
//   the `GoogleProductFeedRow` read-only row projection, and the
//   `ResolvedFeedSettingValues` presentation contract its constructor takes.
//
//   The subject reads the existing `Sw*` schema and returns one flat row per
//   qualifying SKU. It renders nothing, orchestrates nothing and decides no
//   feed element. What it owns is exactly three things - the statement text,
//   the bound parameters, and the hydration of driver rows into the projection
//   - and those three are what this file asserts.
//
// ***************************************************************************
// ** COVERAGE HERE IS NET-NEW. IT HAS NO LEGACY ANTECEDENT, AND PRESENTING  **
// ** IT AS PARITY WITH A LEGACY TEST WOULD BE FALSE.                        **
// **                                                                        **
// ** Re-verified on disk before this file was written, not taken on trust:  **
// ** a case-insensitive search of meta/ for `google` matches ZERO lines,    **
// ** and a search for the feed DAO, its single method, the words            **
// ** productFeed or rss matches ZERO FILES. The legacy suite holds no       **
// ** controller test, no DAO test and no view test for this subsystem, so   **
// ** every assertion below owes its existence to this migration.            **
// **                                                                        **
// ** Exactly two suites in the whole migration extend legacy coverage -     **
// **   meta/tests/unit/entity/ProductTest.cfc  the URL-format case, whose   **
// **                                           nike-air-jorden fixture is   **
// **                                           retained verbatim            **
// **   meta/tests/unit/entity/BrandTest.cfc    an empty products array      **
// ** - and this file is neither of them. A third legacy file,               **
// ** meta/tests/functional/admin/entity/ProductTest.cfc, is an empty stub   **
// ** contributing nothing; it is acknowledged rather than counted.          **
// ***************************************************************************
//
// WHAT WAS VERIFIED ON DISK BEFORE A SINGLE IMPORT WAS WRITTEN
//   The expectations that reached this suite were a strong expectation and not
//   gospel, so the shipped module was read end to end first and every symbol
//   below is the symbol that actually shipped. Eight findings differ from
//   those expectations. Each one changed what is written here, the test was
//   adapted in every case, and NOT ONE LINE of the module was touched:
//
//   1. THE JOIN SET IS ONE INNER PLUS THREE OUTER, not "brand is the only
//      outer join". The shipped statement joins the product table INNER and
//      then joins the default SKU, the brand and the product type OUTER. The
//      module justifies that from the framework source, and the justification
//      was checked independently rather than accepted: the smart list rewrites
//      an EMPTY join type to `left` before emitting HQL
//      [org/Hibachi/HibachiSmartList.cfc:L538-L541, emitted at L549], so all
//      three joins at
//      [integrationServices/google/controllers/feed.cfc:L64-L66] were outer
//      joins and the explicit `"left"` on brand at L66 is redundant with the
//      default. The product table is INNER here because the three product
//      predicates in the WHERE clause reject every null-extended row anyway.
//      The SUBSTANCE of the original expectation still holds and is what is
//      asserted: both product-type values reach the caller as PROJECTION
//      FIELDS rather than as anything the renderer has to traverse.
//   2. THE SELECTION BINDS NOTHING. The four predicates are SQL literals by
//      documented decision, because none of them comes from a caller and
//      binding a module constant would model them as inputs. Positional
//      binding therefore appears only in the two follow-up statements, and
//      both halves of that are asserted separately below.
//   3. THE SALE PAIR IS ALWAYS ABSENT. `skuSalePrice` and
//      `salePriceExpirationDateTime` are declared on the projection and
//      assigned nothing on every row, because neither has a persisted column
//      [model/entity/Sku.cfc:L115, L118] and the legacy resolves both through
//      the promotion sale-price path, which is another module's capability.
//      The fields exist, and their emptiness is the contract.
//   4. FOUR FIELD NAMES DIFFER from the expectation: the product path is
//      `productUrlPath`, the SKU image path is `imageLinkPath`, the image
//      array is `additionalImageLinkPaths` and the breadcrumb is
//      `productTypeSimpleRepresentation`.
//   5. A SECOND INTERFACE, `ResolvedFeedSettingValues`, was not anticipated.
//      It is how the two shipping-weight values arrive as projection data
//      instead of through a settings port whose key union excludes them.
//   6. ONE PUBLIC QUERY METHOD, `fetchProductFeedRows`, taking NO ARGUMENT.
//      It is not named after the legacy DAO method, and interface parity does
//      not bind it to one: that method is dead (see the marker below).
//   7. THE MONEY SURFACE IS WIDER than expected - it also renders a
//      full-precision decimal string and names its comparisons individually -
//      but the property that matters is intact: there is NO construction from
//      a number, only from a decimal string.
//   8. A FIFTH TABLE, the image table, is legitimately read by the
//      additional-images statement. It is one of the verified entity-to-table
//      mappings, so it belongs.
//
// HOW THE SUBJECT IS ISOLATED
//   One hand-written recording double, declared structurally in this file, is
//   the only collaborator. No mocking library. No driver import of any kind,
//   no pool, no connection, no live server, no network, no filesystem, no
//   environment file and no credential. No composition root, no service
//   locator and no ambient request scope. Every case builds its own subject
//   and its own double, so nothing at module scope is mutable and nothing
//   carries between cases.
//
//   Executing real parameterized SQL is the integration tier's job, not this
//   one's. What is asserted here is query construction, parameter forwarding
//   and row hydration.
//
// CFML parity [meta/tests/unit/Helper.cfc:L51-L67]: the legacy harness is
// followed as a PATTERN and rejected as a MECHANISM. The pattern kept is a
// named factory holding obviously-fake defaults that a case overrides in one
// place. The mechanism dropped is all of it - the legacy factory built a real
// persistent entity, saved it through a runtime service locator and flushed
// the ORM, so every legacy "unit" test booted the application, the ORM and the
// dependency container. Nothing here boots anything.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: that factory declares its data
// structure without a local scope, leaking it into the component. It is a
// harness hygiene defect rather than preserved business logic, so it is
// deliberately not reproduced: every helper below scopes its own locals and
// the recording double keeps its captures per instance.
//
// NO PERFORMANCE CLAIM IS MADE OR ASSERTED ANYWHERE IN THIS FILE, and none may
// be added. No timing, no duration, no rate and no availability figure. The
// legacy view raises a request timeout at
// [integrationServices/google/views/feed/product.cfm:L9] and the runtime this
// port targets imposes ceilings of its own; all of those are platform facts
// and not one of them is a requirement of this system. Every justification
// below is a correctness or fidelity argument.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { GoogleFeedRepository } from '../../../../src/integrations/google/googleFeedRepository.js';
import type {
  GoogleProductFeedRow,
  ResolvedFeedSettingValues,
} from '../../../../src/integrations/google/googleFeedRepository.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';

// ---------------------------------------------------------------------------
// The row shape the double hands back
//
// Declared structurally rather than imported, which keeps this suite free of
// any dependency on the connection module and therefore free of the driver.
// It is deliberately the same shape that module publishes: every column
// arrives as `unknown`, so the subject has to narrow each one itself and this
// file can hand it a value of any legitimate driver representation.
// ---------------------------------------------------------------------------

type DriverRow = Readonly<Record<string, unknown>>;

/** One captured call, exactly as the subject made it. */
interface RecordedStatement {
  readonly sql: string;
  /** Absent when the subject bound nothing, which is itself an assertion below. */
  readonly params: readonly unknown[] | undefined;
}

/** Which of the subject's three statements a captured call is. */
type StatementKind = 'selection' | 'ancestry' | 'images';

/**
 * Classifies a captured statement by a fragment unique to it.
 *
 * The recursive ancestry statement is the only one that opens a common table
 * expression, and the image statement is the only one that reads the image
 * table, so two fragments separate all three without depending on the order
 * the subject issues them in - which is asserted independently.
 */
function classifyStatement(sql: string): StatementKind {
  if (sql.includes('WITH RECURSIVE')) {
    return 'ancestry';
  }

  if (sql.includes('FROM SwImage')) {
    return 'images';
  }

  return 'selection';
}

/** What the double answers for each of the three statements. */
interface StatementResponses {
  readonly selection: readonly DriverRow[];
  readonly ancestry: readonly DriverRow[];
  readonly images: readonly DriverRow[];
}

/**
 * The only collaborator any case here uses: a recording test double that
 * captures every statement and every bound array and answers with canned rows.
 *
 * It implements the subject's executor contract STRUCTURALLY - two methods,
 * matching signatures - so nothing from the connection module is imported and
 * no pool, connection or driver ever exists in this process. That the subject
 * accepts it at all is the compiler proving the collaborator is
 * constructor-injected.
 *
 * The data-modifying method records its argument and then refuses, because a
 * feed repository issuing one would be a defect and a silent success would
 * hide it.
 */
class RecordingExecutor {
  /** Every captured call, in the order the subject made them. */
  readonly captured: RecordedStatement[] = [];

  /** Every data-modifying statement attempted. Expected to stay empty. */
  readonly mutationAttempts: string[] = [];

  private readonly responses: StatementResponses;

  constructor(responses: Partial<StatementResponses> = {}) {
    this.responses = {
      selection: responses.selection ?? [],
      ancestry: responses.ancestry ?? [],
      images: responses.images ?? [],
    };
  }

  execute(sql: string, params?: readonly unknown[]): Promise<readonly DriverRow[]> {
    this.captured.push({ sql, params });

    return Promise.resolve(this.responses[classifyStatement(sql)]);
  }

  executeMutation(sql: string): Promise<never> {
    this.mutationAttempts.push(sql);

    throw new Error(
      'the product-feed repository must never issue a data-modifying statement: it reads the ' +
        'existing schema unchanged, with no migration, rename or column change',
    );
  }
}

// ---------------------------------------------------------------------------
// Fixtures, declared inline
//
// No sibling fixture module applies: the five that exist build entities and
// order views, and not one of them produces a feed-row projection or a driver
// row. Importing one would also be an unused import, which the strict profile
// rejects outright. So every value a case needs is declared here, and every
// default is obviously fake so that a real-looking value in a failure message
// is immediately suspicious.
// ---------------------------------------------------------------------------

/**
 * The four resolved setting values the subject's constructor takes.
 *
 * The image prefix is host-relative on purpose: the legacy view prepends the
 * scheme and host itself, so a repository that produced an absolute address
 * would be doing the renderer's job.
 */
function makeSettingValues(
  overrides: Partial<ResolvedFeedSettingValues> = {},
): ResolvedFeedSettingValues {
  return {
    globalURLKeyProduct: overrides.globalURLKeyProduct ?? 'fake-url-key',
    baseImageURL: overrides.baseImageURL ?? '/fake-image-base',
    skuShippingWeight: overrides.skuShippingWeight ?? '3.500',
    skuShippingWeightUnitCode: overrides.skuShippingWeightUnitCode ?? 'fakeunit',
  };
}

/**
 * One driver row for the feed selection, carrying EVERY column the subject
 * reads.
 *
 * Completeness is not optional here. The subject proves each key exists before
 * reading it and raises a distinct fault for an absent one, so a factory that
 * omitted a column would fail for the wrong reason and hide whatever the case
 * meant to assert. Overrides replace individual columns, including with `null`
 * to model SQL NULL.
 */
function makeSelectionRow(overrides: DriverRow = {}): DriverRow {
  return {
    skuID: 'fake-sku-id-1',
    skuCode: 'FAKE-SKU-1',
    skuActiveFlag: 1,
    skuPrice: '19.99',
    skuImageFile: 'fake-sku-image.jpg',
    productID: 'fake-product-id-1',
    productCode: 'FAKE-PRODUCT-1',
    calculatedTitle: 'Fake Product Title',
    productDescription: 'Fake product description.',
    productUrlTitle: 'fake-product-url-title',
    productActiveFlag: 1,
    productPublishedFlag: 1,
    productCalculatedQATS: 7,
    productTypeID: 'fake-product-type-id-1',
    productPrice: '24.50',
    brandName: 'Fake Brand',
    productTypeDescription: 'Fake product type description.',
    ...overrides,
  };
}

/** One driver row for the recursive product-type ancestry statement. */
function makeAncestryRow(overrides: DriverRow = {}): DriverRow {
  return {
    leafProductTypeID: 'fake-product-type-id-1',
    productTypeName: 'Fake Leaf Type',
    ancestorDistance: 0,
    ...overrides,
  };
}

/** One driver row for the additional-images statement. */
function makeImageRow(overrides: DriverRow = {}): DriverRow {
  return {
    productID: 'fake-product-id-1',
    imageDirectory: 'fake-directory',
    imageFile: 'fake-image.jpg',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Narrowing helpers
//
// The strict profile treats every indexed read as possibly absent, and this
// suite honours that the same way the subject does: by NARROWING, never by
// asserting an index away. There is no postfix `!` anywhere in this file, and
// each helper below raises a message naming what was missing rather than
// letting a failure surface as a property access on nothing.
// ---------------------------------------------------------------------------

/** The single captured statement of one kind, proving there is exactly one. */
function statementOfKind(recorder: RecordingExecutor, kind: StatementKind): RecordedStatement {
  const matches = recorder.captured.filter((call) => classifyStatement(call.sql) === kind);
  const first = matches[0];

  if (first === undefined) {
    throw new Error(`the subject issued no ${kind} statement, so there is nothing to assert on`);
  }

  if (matches.length > 1) {
    throw new Error(
      `the subject issued ${String(matches.length)} ${kind} statements where exactly one was ` +
        'expected: one complete result set in one pass',
    );
  }

  return first;
}

/** The captured statement at an ordinal, for asserting the order of the three. */
function statementAt(recorder: RecordingExecutor, index: number): RecordedStatement {
  const call = recorder.captured[index];

  if (call === undefined) {
    throw new Error(`the subject issued no statement at position ${String(index)}`);
  }

  return call;
}

/** The bound array of a statement, proving the subject bound something at all. */
function boundParameters(statement: RecordedStatement): readonly unknown[] {
  const { params } = statement;

  if (params === undefined) {
    throw new Error('the statement bound nothing, so there is no parameter array to assert on');
  }

  return params;
}

/** One projected row, narrowed from a possibly-shorter result than expected. */
function rowAt(rows: readonly GoogleProductFeedRow[], index: number): GoogleProductFeedRow {
  const row = rows[index];

  if (row === undefined) {
    throw new Error(
      `the subject projected ${String(rows.length)} rows, so there is none at position ` +
        String(index),
    );
  }

  return row;
}

/** One resolved image path, narrowed the same way. */
function imagePathAt(paths: readonly string[], index: number): string {
  const path = paths[index];

  if (path === undefined) {
    throw new Error(
      `the row carries ${String(paths.length)} image paths, so there is none at position ` +
        String(index),
    );
  }

  return path;
}

// ---------------------------------------------------------------------------
// Statement-text helpers
//
// The subject's statements are module constants and are deliberately NOT
// exported, so the only honest way to assert them is to read what the double
// captured. That is also the stronger assertion: it pins what the subject
// actually sent rather than what a constant happens to say.
// ---------------------------------------------------------------------------

/** Non-overlapping occurrences of a plain fragment. */
function occurrencesOf(text: string, fragment: string): number {
  let count = 0;
  let index = text.indexOf(fragment);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(fragment, index + fragment.length);
  }

  return count;
}

/** Matches of a global pattern, with no match counted as zero rather than nothing. */
function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Every distinct physical table identifier a statement names, sorted. */
function schemaIdentifiers(sql: string): readonly string[] {
  return [...new Set(sql.match(/\bSw[A-Za-z]+\b/g) ?? [])].sort();
}

/**
 * Every identifier standing in a table position, whatever it is named. Unlike
 * {@link schemaIdentifiers} this deliberately does not presuppose the physical
 * prefix, so an object-store entity name transcribed out of the live controller's
 * join arguments [integrationServices/google/controllers/feed.cfc:L64-L66] would
 * show up here and fail an allow-list comparison.
 */
function tableReferences(sql: string): readonly string[] {
  const matches = sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi);
  const names: string[] = [];

  for (const match of matches) {
    const [, identifier] = match;

    if (identifier !== undefined) {
      names.push(identifier);
    }
  }

  return [...new Set(names)].sort();
}

/** The subject's whole issued statement text, for suite-wide absence checks. */
function allStatements(recorder: RecordingExecutor): string {
  return recorder.captured.map((call) => call.sql).join('\n');
}

/** Runs the subject once against a double primed with the given responses. */
async function runFeed(
  responses: Partial<StatementResponses> = {},
  settingOverrides: Partial<ResolvedFeedSettingValues> = {},
): Promise<{
  readonly recorder: RecordingExecutor;
  readonly rows: readonly GoogleProductFeedRow[];
}> {
  const recorder = new RecordingExecutor(responses);
  const repository = new GoogleFeedRepository(recorder, makeSettingValues(settingOverrides));
  const rows = await repository.fetchProductFeedRows();

  return { recorder, rows };
}

// ---------------------------------------------------------------------------
// The legacy statement this port could not transcribe
//
// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75]: the feed DAO's
// only method was never executed even once, and could not have been. Two independent parse
// faults sit in the one statement: the select list ends on a comma at L58 with a blank L59
// before `FROM` at L60, leaving the final select item empty; and the inner join at L62 names
// its second table at L63 and reaches `WHERE` at L64 having never declared an `ON` condition.
// It was also unreachable: the method name occurs exactly ONCE in the whole repository, at its
// own declaration, and the component itself is never constructed, injected or wired anywhere -
// the live controller builds its selection from a smart list instead. A third fact settles it
// beyond the syntax: the statement names TWO columns where the view renders about thirteen
// values, so no repair of it could have fed the renderer. This suite therefore asserts that the
// target reproduces the INTENT OF THE LIVE PATH, and explicitly refuses to describe a working
// query as a transcription of dead invalid SQL.
// Preserved deliberately; do not fix without a product decision.
//
// Two further findings from the same 76 lines are HYGIENE rather than behaviour, so neither
// carries a defect marker and neither is reproduced:
//
// CFML parity [integrationServices/google/model/dao/FeedDAO.cfc:L53]: the unscoped result
// variable is deliberately not reproduced. The legacy declaration omits a local scope and so
// leaks into the component, which on a warm execution container would carry one request's rows
// into another's. Every local in this file is properly scoped, the recording double keeps its
// captures per instance, and there is no mutable module-scope state here at all.
//
// CFML parity [integrationServices/google/model/dao/FeedDAO.cfc:L55]: the missing datasource
// attribute is deliberately not reproduced either. The legacy statement relied on an
// application-wide default that this port has no equivalent of; the executor arrives through
// the constructor and owns that entirely, which is why every case below can hand over a double
// and never name a connection.
// ---------------------------------------------------------------------------

describe('the dead legacy statement is not transcribed, and the live path is what is reproduced', () => {
  it('emits a join carrying the condition the dead statement never declared', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // The dead statement's second parse fault: a join with no condition at all.
    expect(countMatches(sql, /\bJOIN\b/g)).toBeGreaterThan(0);
    expect(countMatches(sql, /\bON\b/g)).toBe(countMatches(sql, /\bJOIN\b/g));
    expect(sql).toContain('ON SwProduct.productID = SwSku.productID');
  });

  it("emits no empty select item, which was the dead statement's other parse fault", async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // A comma whose next non-blank content is `FROM` is exactly the L58-L60 shape.
    expect(sql).not.toMatch(/,\s*FROM\b/);
    expect(sql).not.toMatch(/,\s*,/);
    expect(sql).not.toMatch(/SELECT\s*,/);
  });

  it('selects far more than the two columns the dead statement named', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // Seventeen aliased columns in the select list, against the dead statement's
    // two. The list is bounded explicitly so the one table alias further down the
    // statement is not counted as a column.
    const selectList = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM SwSku'));

    expect(countMatches(selectList, /\bAS\s+\w+/g)).toBe(17);

    // Both columns the dead statement did name are present, so nothing was lost
    // by declining to transcribe it.
    expect(sql).toContain('SwSku.skuCode');
    expect(sql).toContain('SwProduct.calculatedTitle');
  });

  it("carries no trace of the dead statement's own predicate spelling", async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });

    // [integrationServices/google/model/dao/FeedDAO.cfc:L71] spelled the quantity
    // test `> 0`. The live path did not, and the live path is what ran.
    expect(allStatements(recorder)).not.toContain('> 0');
  });

  it('hydrates a complete row from the live column set, which the dead one could not', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // The dead statement offered a code and a title. The projection offers the
    // whole feed vocabulary, which is the practical measure of the difference.
    expect(row.skuCode).toBe('FAKE-SKU-1');
    expect(row.calculatedTitle).toBe('Fake Product Title');
    expect(Object.keys(row)).toHaveLength(22);
  });
});

// ---------------------------------------------------------------------------
// The collaborator the legacy controller never used
// ---------------------------------------------------------------------------

describe('the never-read legacy collaborator is flagged and no use is invented for it', () => {
  it('takes exactly two collaborators, neither of them a product service', () => {
    // [integrationServices/google/controllers/feed.cfc:L51] declares a product
    // service alongside the SKU service at L52, and the body at L58-L73 reads
    // ONLY the SKU service, at L63. The declaration is dead. Interface parity
    // binds METHODS, not unused injections, so it is not carried forward - and no
    // purpose has been invented for it either.
    expect(GoogleFeedRepository.length).toBe(2);

    const repository = new GoogleFeedRepository(new RecordingExecutor(), makeSettingValues());

    expect(Object.getOwnPropertyNames(repository).sort()).toStrictEqual([
      'executor',
      'settingValues',
    ]);
  });

  it('exposes no member named after a catalog service the feed never needed', () => {
    const members = Object.getOwnPropertyNames(GoogleFeedRepository.prototype);

    for (const member of members) {
      expect(member).not.toMatch(/service/i);
      expect(member).not.toMatch(/locator/i);
    }
  });
});

// ---------------------------------------------------------------------------
// What the live entrypoint was, and what was deliberately not invented from it
//
// The legacy entrypoint is PUBLIC AND UNAUTHENTICATED. Its controller declares
// the feed member public at
// [integrationServices/google/controllers/feed.cfc:L54] and leaves both of the
// protection lists empty at L55 and L56, so no access control existed. That fact
// is RECORDED here and nothing is invented from it: this port adds no key check,
// no signature verification, no allow-list and no request-rate limit, because
// adding one would be a new requirement rather than a ported behaviour, and
// deciding it belongs is a product decision. Access control, if it is ever
// wanted, belongs at the routing edge and not inside a repository.
//
// The legacy member also returns nothing and MUTATES A REQUEST CONTEXT
// [integrationServices/google/controllers/feed.cfc:L58, L63], with the layout
// switched off at L60 so a view could render straight to the response. Neither a
// request context nor a layout exists here, so the port answers with DATA - which
// is the one reshaping this boundary needs, and it is asserted below rather than
// assumed.
// ---------------------------------------------------------------------------

describe('no access control is invented, and the entrypoint answers with data rather than mutating', () => {
  it('declares no member concerned with authentication, authorisation or rate limiting', () => {
    const members = Object.getOwnPropertyNames(GoogleFeedRepository.prototype);

    for (const member of members) {
      expect(member).not.toMatch(/auth|credential|permission|secure|public|private/i);
      expect(member).not.toMatch(/signature|allowlist|throttle|quota/i);
    }
  });

  it('answers with the rows themselves, taking no context to mutate and returning no view', async () => {
    const recorder = new RecordingExecutor({ selection: [makeSelectionRow()] });
    const repository = new GoogleFeedRepository(recorder, makeSettingValues());
    const rows = await repository.fetchProductFeedRows();

    // The legacy member's whole observable effect was an assignment onto the
    // request context it was handed. Here the result IS the return value, so there
    // is nothing to hand in and nothing to inspect afterwards.
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('renders nothing, because rendering belongs to the renderer and not to a repository', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // No element name, no markup and no document reaches this layer. What it
    // produces is the values the renderer will need, each already resolved.
    for (const value of Object.values(row)) {
      expect(typeof value).not.toBe('function');
    }

    expect(row.calculatedTitle).not.toMatch(/</);
    expect(row.productUrlPath).not.toMatch(/</);
  });
});

// ---------------------------------------------------------------------------
// The joins
// ---------------------------------------------------------------------------

describe("the three legacy joins are reproduced, with the framework's own join semantics", () => {
  it('joins the product table inner, and the other three tables outer', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // Verified against the framework source rather than inferred: an empty join
    // type is rewritten to `left` before HQL is emitted
    // [org/Hibachi/HibachiSmartList.cfc:L538-L541, emitted at L549], so all three
    // calls at [integrationServices/google/controllers/feed.cfc:L64-L66] were
    // outer joins. The product table is inner here only because the three product
    // predicates reject every null-extended row regardless.
    expect(occurrencesOf(sql, 'INNER JOIN')).toBe(1);
    expect(occurrencesOf(sql, 'LEFT JOIN')).toBe(3);
    expect(sql).toContain('INNER JOIN SwProduct');
  });

  it('joins the default SKU as an outer self-join, which is what makes a product price absent', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // [integrationServices/google/controllers/feed.cfc:L65] joins `defaultSku`,
    // NOT a product type. The alias is what lets one table serve both roles.
    expect(sql).toContain('LEFT JOIN SwSku AS defaultSku');
    expect(sql).toContain('ON defaultSku.skuID = SwProduct.defaultSkuID');
    expect(sql).toContain('defaultSku.price');
  });

  it("joins the brand outer, which is the legacy's one explicit join type", async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // [integrationServices/google/controllers/feed.cfc:L66] passes `"left"` as the
    // third positional argument, which the framework signature names `joinType`
    // [org/Hibachi/HibachiSmartList.cfc:L212].
    expect(sql).toContain('LEFT JOIN SwBrand');
    expect(sql).toContain('ON SwBrand.brandID = SwProduct.brandID');
  });

  it('delivers both product-type values as projection fields, not as anything to traverse', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const row = rowAt(rows, 0);

    // The legacy view reached the product type by lazy traversal
    // [integrationServices/google/views/feed/product.cfm:L19, L21]. There is no
    // laziness here, so both values it read are resolved once and handed over as
    // plain fields - which is the substance of the original expectation.
    expect(row.productTypeDescription).toBe('Fake product type description.');
    expect(row.productTypeSimpleRepresentation).toBe('Fake Leaf Type');
  });

  it('resolves the breadcrumb from its own statement rather than from the product-type join', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [],
    });
    const row = rowAt(rows, 0);

    // With the joined description present and the ancestry statement empty, the
    // two values separate cleanly: the description comes from the join, and the
    // breadcrumb does not.
    expect(row.productTypeDescription).toBe('Fake product type description.');
    expect(row.productTypeSimpleRepresentation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The four predicates
// ---------------------------------------------------------------------------

describe('exactly four predicates are reproduced, and no fifth is invented', () => {
  it('constrains the selection with one WHERE clause holding four conditions', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // Three filters and one range, from
    // [integrationServices/google/controllers/feed.cfc:L68-L72]. Four conditions
    // are joined by three conjunctions, and there is no disjunction at all.
    expect(countMatches(sql, /\bWHERE\b/g)).toBe(1);
    expect(countMatches(sql, /\bAND\b/g)).toBe(3);
    expect(countMatches(sql, /\bOR\b/g)).toBe(0);
  });

  it('requires an active SKU, from the first legacy filter', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });

    // [integrationServices/google/controllers/feed.cfc:L68]
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwSku.activeFlag = 1');
  });

  it('requires an active product, from the second legacy filter', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });

    // [integrationServices/google/controllers/feed.cfc:L69]
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwProduct.activeFlag = 1');
  });

  it('requires a published product, from the third legacy filter', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });

    // [integrationServices/google/controllers/feed.cfc:L70]
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwProduct.publishedFlag = 1');
  });

  // JUDGMENT CALL: the quantity condition is asserted as `>= 1`, taken from the LIVE path at
  // [integrationServices/google/controllers/feed.cfc:L72] in preference to the dead DAO's
  // `SwProduct.calculatedQATS > 0` at [integrationServices/google/model/dao/FeedDAO.cfc:L71].
  // The two sources genuinely disagree in spelling, so one had to be selected and the selection
  // recorded. The live spelling is authoritative because it is the code that ran, and because it
  // is a BOUND value: `addRange('product.calculatedQATS', '1^')` takes the lower-bound-only
  // branch, since the value ends with the range delimiter declared at
  // [org/Hibachi/HibachiSmartList.cfc:L36], and that branch binds the text before the delimiter
  // as a parameter and emits `>= :param` [org/Hibachi/HibachiSmartList.cfc:L642-L646]. The dead
  // DAO inlined its literal with no parameter of any kind. On an integer column the two forms
  // select the same rows; they are still not the same statement, and the one that ran is the one
  // reproduced. This is a selection between two sources, not a preserved defect.
  it('requires a positive quantity available to sell, spelled as the live path spelled it', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    expect(sql).toContain('SwProduct.calculatedQATS >= 1');
    expect(sql).not.toContain('SwProduct.calculatedQATS > 0');
  });

  it('adds no predicate on anything the legacy chain never tested', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // The legacy chain tested four things and nothing else. A brand condition, a
    // product-type condition, a date window or a code condition would each be a
    // fifth predicate the feed never had.
    expect(sql).not.toMatch(/WHERE[\s\S]*SwBrand\./);
    expect(sql).not.toMatch(/WHERE[\s\S]*SwProductType\./);
    expect(sql).not.toMatch(/\bBETWEEN\b/);
    expect(sql).not.toMatch(/\bLIKE\b/);
    expect(sql).not.toMatch(/\bIS\s+NOT\s+NULL\b/);
  });

  it('returns every selected row, because the predicates live in the statement and not in code', async () => {
    const { rows } = await runFeed({
      selection: [
        makeSelectionRow({ skuID: 'fake-sku-id-1' }),
        makeSelectionRow({ skuID: 'fake-sku-id-2' }),
        makeSelectionRow({ skuID: 'fake-sku-id-3' }),
      ],
    });

    // No post-filtering pass exists. Whatever the four conditions admitted is
    // what the caller receives, one projected row per selected row.
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.skuID)).toStrictEqual([
      'fake-sku-id-1',
      'fake-sku-id-2',
      'fake-sku-id-3',
    ]);
  });

  it('carries each filtered column through to the projection, so the invariant is checkable', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // The four filtered columns are projected as well as filtered, which is what
    // lets a consumer verify the invariant from the data and not only from the
    // statement text.
    expect(row.skuActiveFlag).toBe(true);
    expect(row.productActiveFlag).toBe(true);
    expect(row.productPublishedFlag).toBe(true);
    expect(row.productCalculatedQATS).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Nothing the legacy did not have
// ---------------------------------------------------------------------------

describe('the four filters are hard-coded, and the query surface offers no way to widen them', () => {
  it('accepts no argument at all on the one public query method', async () => {
    const recorder = new RecordingExecutor({ selection: [makeSelectionRow()] });
    const repository = new GoogleFeedRepository(recorder, makeSettingValues());

    // The type-level half of the guarantee. Every option a caller might reach for
    // to widen the selection - an inactive-inclusive flag, an unpublished-inclusive
    // flag, an out-of-stock-inclusive flag, a minimum quantity, a filter array, a
    // predicate callback, an options bag, paging, a cursor, a sort, a locale, a
    // currency selector, a format discriminator, a destination, a store selector,
    // an updated-after marker, a chunk size, a cancellation handle or a deadline -
    // is rejected by the compiler, because the method declares no parameter for any
    // of them to arrive through.
    // @ts-expect-error the query surface declares no parameter, so no option can widen the filters
    const rows = await repository.fetchProductFeedRows({ includeInactive: true });

    // And the runtime half: an argument forced past the compiler changes nothing.
    expect(rows).toHaveLength(1);
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwSku.activeFlag = 1');
  });

  it('declares no member named after an option, a page or a limit', () => {
    const members = Object.getOwnPropertyNames(GoogleFeedRepository.prototype);

    for (const member of members) {
      expect(member).not.toMatch(/limit|offset|cursor|page|sort|order|filter|option/i);
      expect(member).not.toMatch(/stream|chunk|abort|timeout|deadline|retry/i);
    }
  });

  it('imposes no ordering, because the legacy chain ordered nothing', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    // [integrationServices/google/controllers/feed.cfc:L58-L73] never calls the
    // ordering method, so feed item order was whatever the store returned.
    // Imposing an order would add behaviour the legacy never had.
    expect(sql).not.toMatch(/\bORDER\s+BY\b/i);
  });

  it('imposes no row limit, no offset and no paging of any kind', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect(sql).not.toMatch(/\bOFFSET\b/i);
    expect(sql).not.toMatch(/\bFETCH\s+FIRST\b/i);
    expect(sql).not.toMatch(/\bTOP\s+\d/i);
    expect(sql).not.toMatch(/\bROWNUM\b/i);
  });

  it('answers one complete result set in one pass, whatever the row count', async () => {
    const manyRows = Array.from({ length: 25 }, (_unused, index) =>
      makeSelectionRow({
        skuID: `fake-sku-id-${String(index)}`,
        productID: `fake-product-id-${String(index)}`,
        productTypeID: `fake-product-type-id-${String(index)}`,
      }),
    );

    const { recorder, rows } = await runFeed({ selection: manyRows });

    // Twenty-five rows are read by the same three statements one row is read by:
    // one selection, one ancestry lookup, one image lookup. A paging
    // implementation would issue more as the count grew.
    expect(rows).toHaveLength(25);
    expect(recorder.captured).toHaveLength(3);
  });

  it('answers a plain array rather than anything a caller has to iterate lazily', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });

    expect(Array.isArray(rows)).toBe(true);
    expect(Symbol.asyncIterator in rows).toBe(false);
  });

  it('issues the ancestry and image lookups only when there are keys to look up', async () => {
    const { recorder } = await runFeed({ selection: [] });

    // An empty selection is an ordinary state - the legacy rendered a feed with no
    // items - and it needs no follow-up statement. Neither lookup is issued, and
    // no placeholder list is built for zero keys.
    expect(recorder.captured).toHaveLength(1);
    expect(classifyStatement(statementAt(recorder, 0).sql)).toBe('selection');
  });

  it('skips only the lookup whose keys are all absent, and still issues the other', async () => {
    const { recorder, rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: null })],
      images: [makeImageRow()],
    });

    expect(recorder.captured).toHaveLength(2);
    expect(classifyStatement(statementAt(recorder, 1).sql)).toBe('images');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBeUndefined();
  });

  it('issues the three statements in the order the follow-up keys require', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    // The order is a data dependency rather than a preference: both follow-up
    // lookups are keyed on identifiers the selection produced, so neither can run
    // before it.
    expect(recorder.captured.map((call) => classifyStatement(call.sql))).toStrictEqual([
      'selection',
      'ancestry',
      'images',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Statement construction and parameter forwarding
//
// The legacy source contains ZERO parameter declarations - the dead DAO inlines
// every literal at [integrationServices/google/model/dao/FeedDAO.cfc:L65-L71] -
// so positional binding here is a HARDENING rather than a port. What it
// preserves is the property the legacy engine's parameter tag provided
// everywhere else in the slice, and what it removes is the one shape in which a
// value could ever alter a statement's structure.
// ---------------------------------------------------------------------------

describe('every value is bound positionally, and no value is ever written into a statement', () => {
  it('binds nothing on the selection, because not one of its conditions comes from a caller', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const selection = statementOfKind(recorder, 'selection');

    // The four conditions are fixed by the feed contract. Binding a constant would
    // model them as inputs and leave a seam a caller could reach, so the statement
    // carries no placeholder and the call carries no parameter array at all.
    expect(selection.params).toBeUndefined();
    expect(occurrencesOf(selection.sql, '?')).toBe(0);
  });

  it('binds one placeholder per product-type key on the ancestry lookup', async () => {
    const { recorder } = await runFeed({
      selection: [
        makeSelectionRow({ skuID: 'fake-sku-id-1', productTypeID: 'fake-type-a' }),
        makeSelectionRow({ skuID: 'fake-sku-id-2', productTypeID: 'fake-type-b' }),
        makeSelectionRow({ skuID: 'fake-sku-id-3', productTypeID: 'fake-type-c' }),
      ],
      ancestry: [makeAncestryRow()],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    expect(occurrencesOf(ancestry.sql, '?')).toBe(3);
    expect(boundParameters(ancestry)).toStrictEqual(['fake-type-a', 'fake-type-b', 'fake-type-c']);
  });

  it('binds one placeholder per product key on the image lookup', async () => {
    const { recorder } = await runFeed({
      selection: [
        makeSelectionRow({ skuID: 'fake-sku-id-1', productID: 'fake-product-a' }),
        makeSelectionRow({ skuID: 'fake-sku-id-2', productID: 'fake-product-b' }),
      ],
      images: [makeImageRow({ productID: 'fake-product-a' })],
    });
    const images = statementOfKind(recorder, 'images');

    expect(occurrencesOf(images.sql, '?')).toBe(2);
    expect(boundParameters(images)).toStrictEqual(['fake-product-a', 'fake-product-b']);
  });

  it('collapses repeated keys, so the placeholder count always matches the bound array', async () => {
    const { recorder } = await runFeed({
      selection: [
        makeSelectionRow({ skuID: 'fake-sku-id-1', productID: 'fake-shared-product' }),
        makeSelectionRow({ skuID: 'fake-sku-id-2', productID: 'fake-shared-product' }),
        makeSelectionRow({ skuID: 'fake-sku-id-3', productID: 'fake-shared-product' }),
      ],
      images: [makeImageRow({ productID: 'fake-shared-product' })],
    });
    const images = statementOfKind(recorder, 'images');

    // Three SKUs of one product need one key, not three. A mismatch between the
    // placeholder count and the bound length is the classic way a parameterized
    // statement fails at the server, so the two are asserted together.
    expect(boundParameters(images)).toStrictEqual(['fake-shared-product']);
    expect(occurrencesOf(images.sql, '?')).toBe(boundParameters(images).length);
  });

  it('forwards a hostile identifier as a bound value and never as statement text', async () => {
    const hostileIdentifier = "fake-type'); DROP TABLE SwProduct; --";

    const { recorder } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: hostileIdentifier })],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // This is the whole substance of the hardening. The value reaches the driver
    // through the parameter array, the statement text is untouched by it, and the
    // statement therefore has exactly the structure it had before.
    expect(boundParameters(ancestry)).toStrictEqual([hostileIdentifier]);
    expect(ancestry.sql).not.toContain(hostileIdentifier);
    expect(ancestry.sql).not.toContain('DROP');
    expect(occurrencesOf(ancestry.sql, '?')).toBe(1);
  });

  it('leaves every statement free of a quoted literal, so nothing was interpolated', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    expect(sql).not.toContain("'");
    expect(sql).not.toContain('"');
    expect(sql).not.toContain('${');
  });

  it('keeps every statement identical whatever the resolved setting values are', async () => {
    const first = await runFeed(
      { selection: [makeSelectionRow()], ancestry: [makeAncestryRow()], images: [makeImageRow()] },
      { globalURLKeyProduct: 'fake-key-one', baseImageURL: '/fake-base-one' },
    );
    const second = await runFeed(
      { selection: [makeSelectionRow()], ancestry: [makeAncestryRow()], images: [makeImageRow()] },
      { globalURLKeyProduct: 'fake-key-two', baseImageURL: '/fake-base-two' },
    );

    // No member of the presentation contract reaches a WHERE clause, which is
    // exactly why accepting it cannot widen the four-filter invariant. Two
    // repositories built with different values issue byte-identical statements.
    expect(allStatements(second.recorder)).toBe(allStatements(first.recorder));
    expect(allStatements(first.recorder)).not.toContain('fake-key-one');
    expect(allStatements(second.recorder)).not.toContain('fake-base-two');
  });

  it('reads only through the injected collaborator, and never through a shared connection', async () => {
    const recorder = new RecordingExecutor({ selection: [makeSelectionRow()] });
    const repository = new GoogleFeedRepository(recorder, makeSettingValues());

    // Constructor injection is the mechanism, and this suite is the proof: a
    // hand-written double with exactly two methods satisfies the collaborator
    // contract outright, so nothing was reached for beyond it. The double exposes
    // no unprepared execution route, no connection handle and no pool handle - and
    // the subject works anyway, which makes the prepared-statement guarantee
    // structural rather than advisory.
    expect('query' in recorder).toBe(false);
    expect('getConnection' in recorder).toBe(false);
    expect('pool' in recorder).toBe(false);
    expect('end' in recorder).toBe(false);

    await expect(repository.fetchProductFeedRows()).resolves.toHaveLength(1);
    expect(recorder.captured).toHaveLength(3);
  });

  it('never attempts a data-modifying statement, so the schema is read unchanged', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    expect(recorder.mutationAttempts).toStrictEqual([]);
  });

  it('inlines no server clock, so nothing in a statement varies between two runs', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    // The legacy view read the ambient clock while rendering
    // [integrationServices/google/views/feed/product.cfm:L30]. That is a rendering
    // concern; a repository that reached for the server's clock instead would make
    // its own output irreproducible.
    expect(sql).not.toMatch(/\bNOW\s*\(/i);
    expect(sql).not.toMatch(/CURRENT_TIMESTAMP/i);
    expect(sql).not.toMatch(/\bSYSDATE\b/i);
    expect(sql).not.toMatch(/\bCURDATE\s*\(/i);
  });

  it('branches on no database product, because the legacy statement branched on none', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    // Three in-scope legacy statements elsewhere do branch on the database product;
    // this one does not, so nothing dialect-specific may appear here. Bracket
    // quoting, the alternative concatenation operator and the two vendor-specific
    // null functions are each a sign that one had crept in.
    expect(sql).not.toContain('||');
    expect(sql).not.toContain('[');
    expect(sql).not.toMatch(/\bNVL\s*\(/i);
    expect(sql).not.toMatch(/\bISNULL\s*\(/i);
    expect(sql).not.toMatch(/\bGETDATE\s*\(/i);
  });
});

// ---------------------------------------------------------------------------
// Schema continuity
// ---------------------------------------------------------------------------

describe('the existing tables are read exactly as they are, with nothing added or renamed', () => {
  it('names only the five tables the feed genuinely needs', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    // Four for the selection and its joins, one for the product images. Every one
    // is an existing physical table and each corresponds to a verified
    // entity-to-table mapping.
    expect(schemaIdentifiers(allStatements(recorder))).toStrictEqual([
      'SwBrand',
      'SwImage',
      'SwProduct',
      'SwProductType',
      'SwSku',
    ]);
  });

  it('names the physical tables rather than the object-store entity names', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // The dead DAO wrote a tag-syntax statement, so it correctly named physical
    // tables too [integrationServices/google/model/dao/FeedDAO.cfc:L61-L63]. The
    // object-store entity names appear only in the live controller's arguments
    // [integrationServices/google/controllers/feed.cfc:L64-L66], because a smart
    // list traverses the object graph rather than the schema. The realistic way a
    // port goes wrong here is transcribing those arguments straight into a FROM or
    // JOIN clause, so the check enumerates every identifier standing in a table
    // position and pins the set exactly. An entity name reaching a join slot would
    // appear in this set and fail, which is a stricter test than searching the text
    // for one particular spelling.
    expect(sql).toContain('FROM SwSku');
    expect(tableReferences(sql)).toStrictEqual(['SwBrand', 'SwProduct', 'SwProductType', 'SwSku']);
  });

  it('issues no statement that could change the schema or its contents', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    // No migration, no rename and no column change: the port reads and writes the
    // existing tables unchanged, and this repository only reads.
    expect(sql).not.toMatch(/\bCREATE\b/i);
    expect(sql).not.toMatch(/\bALTER\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/\bINSERT\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it('reads the image table by the association the legacy view walked, and no other', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      images: [makeImageRow()],
    });
    const { sql } = statementOfKind(recorder, 'images');

    // Image rows can belong to something other than a product, so keying on the
    // product identifier selects exactly the association the view iterated
    // [integrationServices/google/views/feed/product.cfm:L24].
    expect(sql).toContain('WHERE SwImage.productID IN');
  });
});

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/** One amount, narrowed rather than asserted, with the field named on failure. */
function moneyOf(value: Money | undefined, label: string): Money {
  if (value === undefined) {
    throw new Error(`the projection carries no ${label}, so there is no amount to assert on`);
  }

  return value;
}

/** A driver row with one column removed, for proving an absent KEY is not tolerated. */
function withoutColumn(row: DriverRow, columnName: string): DriverRow {
  const kept: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key !== columnName) {
      kept[key] = value;
    }
  }

  return kept;
}

/** Every member the projection contract names, sorted for a stable comparison. */
const PROJECTION_MEMBERS: readonly string[] = [
  'additionalImageLinkPaths',
  'brandName',
  'calculatedTitle',
  'imageLinkPath',
  'productActiveFlag',
  'productCalculatedQATS',
  'productCode',
  'productDescription',
  'productID',
  'productPrice',
  'productPublishedFlag',
  'productTypeDescription',
  'productTypeSimpleRepresentation',
  'productUrlPath',
  'salePriceExpirationDateTime',
  'skuActiveFlag',
  'skuCode',
  'skuID',
  'skuPrice',
  'skuSalePrice',
  'skuShippingWeight',
  'skuShippingWeightUnitCode',
];

describe('the projection carries exactly what the renderer needs, and no broader catalog shape', () => {
  it('names every member the contract declares, and not one more', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const row: GoogleProductFeedRow = rowAt(rows, 0);

    expect(Object.keys(row).sort()).toStrictEqual(PROJECTION_MEMBERS);
  });

  it('is a flat row rather than an entity, and offers no accessor to walk', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // Reproducing four entity classes with their injected ports, just to read
    // about seventeen scalars off them, would drag the whole domain into a feed
    // query and leave the renderer walking an object graph to find each value.
    // The contract is named for what it is - a feed ROW - so it cannot be mistaken
    // for an entity, and the typed binding in the case above is the compiler
    // confirming that name rather than prose asserting it.
    expect(row.constructor).toBe(Object);
    expect('getSkuCode' in row).toBe(false);
    expect('getPriceByCurrencyCode' in row).toBe(false);
    expect('getProductURL' in row).toBe(false);
    expect('save' in row).toBe(false);
  });

  it('keeps three prices apart, because the renderer reads two different objects', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productPrice: '24.50', skuPrice: '19.99' })],
    });
    const row = rowAt(rows, 0);

    // [integrationServices/google/views/feed/product.cfm:L27] emits the PRODUCT's
    // price, while L28 gates the sale block on the SKU's own price against the
    // SKU's sale price. Three distinct quantities on two distinct objects; folding
    // any pair together would change which items advertise a sale.
    expect(moneyOf(row.productPrice, 'product price').toDecimalString()).toBe('24.5');
    expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('19.99');
    expect(row.skuSalePrice).toBeUndefined();

    // Three separate members, so no consumer can mistake one for another.
    expect(PROJECTION_MEMBERS).toContain('productPrice');
    expect(PROJECTION_MEMBERS).toContain('skuPrice');
    expect(PROJECTION_MEMBERS).toContain('skuSalePrice');
  });

  it('carries each price as a money value built from the driver decimal string', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productPrice: '1000000.005', skuPrice: '0.01' })],
    });
    const row = rowAt(rows, 0);

    // The driver hands back an exact decimal string and it goes straight into the
    // value object. Every digit survives, which is the property a float cannot
    // offer at this boundary.
    expect(row.productPrice).toBeInstanceOf(Money);
    expect(row.skuPrice).toBeInstanceOf(Money);
    expect(moneyOf(row.productPrice, 'product price').toDecimalString()).toBe('1000000.005');
    expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('0.01');
  });

  it('refuses a price that arrives as a number rather than absorbing it', async () => {
    // Accepting a number here would route currency through a float, silently, at
    // the one boundary that must never do so. It is refused instead, so a changed
    // driver option surfaces rather than corrupting money.
    await expect(runFeed({ selection: [makeSelectionRow({ skuPrice: 19.99 })] })).rejects.toThrow(
      /must arrive as a decimal string/,
    );
  });

  it('carries both shipping-weight values as plain strings, because a weight is not money', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      { skuShippingWeight: '12.750', skuShippingWeightUnitCode: 'fakeunit' },
    );
    const row = rowAt(rows, 0);

    // [integrationServices/google/views/feed/product.cfm:L58] emits the two halves
    // separated by one space. They are a measure, not an amount, so neither becomes
    // a money value and neither becomes a number.
    expect(row.skuShippingWeight).toBe('12.750');
    expect(row.skuShippingWeightUnitCode).toBe('fakeunit');
    expect(typeof row.skuShippingWeight).toBe('string');
    expect(typeof row.skuShippingWeightUnitCode).toBe('string');
    expect(row.skuShippingWeight).not.toBeInstanceOf(Money);
  });

  it('takes the weight values from the resolved contract rather than from a column', async () => {
    const { recorder, rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      { skuShippingWeight: '99.001', skuShippingWeightUnitCode: 'fakeother' },
    );

    // The settings port this migration ships is locked to a key union that excludes
    // both weight keys, and the port set is closed, so the values arrive as
    // projection data instead. Neither appears in a statement, which confirms they
    // are presentation data and not selection input.
    expect(rowAt(rows, 0).skuShippingWeight).toBe('99.001');
    expect(allStatements(recorder)).not.toContain('99.001');
    expect(allStatements(recorder)).not.toContain('skuShippingWeight');
  });

  it('treats the brand name as genuinely optional, matching the outer join', async () => {
    const withBrand = await runFeed({
      selection: [makeSelectionRow({ brandName: 'Fake Brand Name' })],
    });
    const withoutBrand = await runFeed({ selection: [makeSelectionRow({ brandName: null })] });

    // The outer join at [integrationServices/google/controllers/feed.cfc:L66] is
    // what makes the view's brand guard at
    // [integrationServices/google/views/feed/product.cfm:L32] meaningful: a product
    // with no brand still appears in the feed, simply without that element.
    expect(rowAt(withBrand.rows, 0).brandName).toBe('Fake Brand Name');
    expect(rowAt(withoutBrand.rows, 0).brandName).toBeUndefined();
    expect(withoutBrand.rows).toHaveLength(1);
  });

  it('keeps the quantity a number and the three flags booleans', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productCalculatedQATS: 42, productPublishedFlag: 0 })],
    });
    const row = rowAt(rows, 0);

    // The quantity column is a non-monetary integer, so it stays a number and never
    // becomes a money value.
    expect(row.productCalculatedQATS).toBe(42);
    expect(typeof row.productCalculatedQATS).toBe('number');
    expect(row.productCalculatedQATS).not.toBeInstanceOf(Money);

    expect(row.skuActiveFlag).toBe(true);
    expect(row.productActiveFlag).toBe(true);
    expect(row.productPublishedFlag).toBe(false);
  });

  it('resolves a flag from any representation the driver may hand back', async () => {
    const asBits = await runFeed({
      selection: [
        makeSelectionRow({
          skuActiveFlag: Uint8Array.of(1),
          productActiveFlag: '1',
          productPublishedFlag: true,
        }),
      ],
    });
    const row = rowAt(asBits.rows, 0);

    // A boolean-mapped column can arrive as a bit buffer, a number, a string or
    // null depending on how the column and the driver are configured. All of them
    // reach one shared decision table, which is what keeps these three columns in
    // agreement with every other flag in the port.
    expect(row.skuActiveFlag).toBe(true);
    expect(row.productActiveFlag).toBe(true);
    expect(row.productPublishedFlag).toBe(true);
  });

  it('carries the image paths as a read-only array of already-resolved strings', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow()],
      images: [makeImageRow(), makeImageRow({ imageFile: 'fake-second.jpg' })],
    });
    const { additionalImageLinkPaths } = rowAt(rows, 0);

    expect(Array.isArray(additionalImageLinkPaths)).toBe(true);
    expect(additionalImageLinkPaths).toHaveLength(2);
    expect(typeof imagePathAt(additionalImageLinkPaths, 0)).toBe('string');
  });

  it('refuses a row whose column the statement no longer selects', async () => {
    // An absent KEY and a NULL VALUE are different faults. A null becomes absence;
    // a missing key means the statement and the reader have diverged, and defaulting
    // it would let a renamed alias masquerade as an empty column.
    await expect(
      runFeed({ selection: [withoutColumn(makeSelectionRow(), 'brandName')] }),
    ).rejects.toThrow(/carries no column named "brandName"/);
  });
});

// ---------------------------------------------------------------------------
// Absence is modelled as absence
//
// This is the highest-consequence group in the file. Substituting zero for an
// absent price would advertise a free product, and substituting an empty string
// for an absent description would make the renderer's own choice on its behalf.
// ---------------------------------------------------------------------------

describe('an absent value stays absent, and is never defaulted to zero or to empty', () => {
  it('resolves every nullable column to nothing when the row carries null', async () => {
    const { rows } = await runFeed({
      selection: [
        makeSelectionRow({
          skuCode: null,
          skuPrice: null,
          skuImageFile: null,
          productCode: null,
          calculatedTitle: null,
          productDescription: null,
          productUrlTitle: null,
          productTypeID: null,
          productPrice: null,
          brandName: null,
          productTypeDescription: null,
        }),
      ],
    });
    const row = rowAt(rows, 0);

    expect(row.skuCode).toBeUndefined();
    expect(row.calculatedTitle).toBeUndefined();
    expect(row.productDescription).toBeUndefined();
    expect(row.productTypeDescription).toBeUndefined();
    expect(row.productTypeSimpleRepresentation).toBeUndefined();
    expect(row.productUrlPath).toBeUndefined();
    expect(row.imageLinkPath).toBeUndefined();
    expect(row.productPrice).toBeUndefined();
    expect(row.skuPrice).toBeUndefined();
    expect(row.brandName).toBeUndefined();
    expect(row.productCode).toBeUndefined();
  });

  it('never substitutes zero for an absent price', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productPrice: null, skuPrice: null })],
    });
    const row = rowAt(rows, 0);

    // The shared zero constant exists for a different purpose entirely, and using
    // it as a fallback anywhere in this path would sell products for free.
    expect(row.productPrice).not.toBe(Money.zero);
    expect(row.productPrice).not.toBeInstanceOf(Money);
    expect(row.skuPrice).not.toBe(Money.zero);
    expect(row.skuPrice).not.toBeInstanceOf(Money);
    expect(row.productPrice).toBeUndefined();
    expect(row.skuPrice).toBeUndefined();
  });

  it('never substitutes an empty string for an absent text column', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productDescription: null, productTypeDescription: null })],
    });
    const row = rowAt(rows, 0);

    // The renderer's description gate tests length
    // [integrationServices/google/views/feed/product.cfm:L19], so manufacturing an
    // empty string here would make that decision for it.
    expect(row.productDescription).not.toBe('');
    expect(row.productTypeDescription).not.toBe('');
    expect(row.productDescription).toBeUndefined();
    expect(row.productTypeDescription).toBeUndefined();
  });

  it('leaves an empty string alone, because only null suppresses a value', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow({ productUrlTitle: '' })] });
    const row = rowAt(rows, 0);

    // CFML parity [model/entity/Product.cfc:L207-L209]: the legacy interpolated an
    // empty title into the path without complaint and the feed carried the result.
    // Adding an emptiness guard here would be a repair, and a repair needs a
    // product decision.
    expect(row.productUrlPath).toBe('/fake-url-key//');
  });

  it('leaves the sale pair absent on every row, however complete the row is', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow(), makeSelectionRow({ skuID: 'fake-sku-id-2' })],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    // Neither value has a persisted column [model/entity/Sku.cfc:L115, L118], and
    // the legacy resolves both through the promotion sale-price path, which is
    // another module's capability. The view emits the price and the effective-date
    // range together inside one conditional
    // [integrationServices/google/views/feed/product.cfm:L28-L31], so resolving one
    // alone could only ever produce a half-formed sale block. Absent together is
    // the coherent answer.
    for (const row of rows) {
      expect(row.skuSalePrice).toBeUndefined();
      expect(row.salePriceExpirationDateTime).toBeUndefined();
    }

    expect(rows).toHaveLength(2);
  });

  it('declares the sale pair even though it never populates it', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // The members are present and empty rather than missing, so a consumer reads a
    // documented emptiness instead of finding nothing at all.
    expect('skuSalePrice' in row).toBe(true);
    expect('salePriceExpirationDateTime' in row).toBe(true);
  });

  it('reads no ambient clock for the absent expiration, and inlines no date', async () => {
    const { recorder, rows } = await runFeed({ selection: [makeSelectionRow()] });

    expect(rowAt(rows, 0).salePriceExpirationDateTime).toBeUndefined();
    expect(allStatements(recorder)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// The derived values
//
// Four values arrive resolved rather than as columns, so the renderer never
// reaches for a setting or issues a second lookup of its own. Each one
// reproduces a specific legacy interpolation, and none of them adds a guard the
// legacy did not have.
// ---------------------------------------------------------------------------

describe('the derived paths reproduce the legacy interpolations exactly', () => {
  it('builds the product path with a leading slash, both segments and a trailing slash', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ productUrlTitle: 'fake-nike-air-jorden' })] },
      { globalURLKeyProduct: 'fakekey' },
    );

    // CFML parity [model/entity/Product.cfc:L207-L209]: the legacy accessor
    // interpolates the resolved key and the URL title between three slashes.
    expect(rowAt(rows, 0).productUrlPath).toBe('/fakekey/fake-nike-air-jorden/');
  });

  it('leaves the product path host-relative, because the view prepends the host itself', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const { productUrlPath } = rowAt(rows, 0);

    // [integrationServices/google/views/feed/product.cfm:L22] prepends the scheme
    // and host. A repository that produced an absolute address would be doing the
    // renderer's job and would bake a deployment detail into a query result.
    expect(productUrlPath).toMatch(/^\//);
    expect(productUrlPath).not.toMatch(/:\/\//);
  });

  it('builds the SKU image path around the literal segment the legacy hard-coded', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: 'fake-sku-photo.jpg' })] },
      { baseImageURL: '/fake-assets/images' },
    );

    // CFML parity [model/entity/Sku.cfc:L145-L147]: the middle segment is a literal
    // of the legacy source rather than a configured value, so it is a constant here
    // and only the prefix is resolved.
    expect(rowAt(rows, 0).imageLinkPath).toBe(
      '/fake-assets/images/product/default/fake-sku-photo.jpg',
    );
  });

  it('carries the stored image path and performs no missing-image substitution', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow({ skuImageFile: null })] });

    // The legacy view calls the resizing accessor, which additionally reads a
    // missing-image setting and delegates to an image service that is out of scope
    // here. Inventing a resizing implementation is forbidden and the settings
    // contract does not admit that key, so what is carried is the STORED path - and
    // when there is none, there is no sanctioned fallback to name instead.
    expect(rowAt(rows, 0).imageLinkPath).toBeUndefined();
  });

  it('builds one additional path per image row, from that row own directory', async () => {
    const { rows } = await runFeed(
      {
        selection: [makeSelectionRow()],
        images: [
          makeImageRow({ imageDirectory: 'fake-dir-one', imageFile: 'fake-one.jpg' }),
          makeImageRow({ imageDirectory: 'fake-dir-two', imageFile: 'fake-two.jpg' }),
        ],
      },
      { baseImageURL: '/fake-assets' },
    );
    const { additionalImageLinkPaths } = rowAt(rows, 0);

    // CFML parity [model/entity/Image.cfc:L79-L81]: unlike the SKU path, the middle
    // segment is the image row's own directory column.
    expect(additionalImageLinkPaths).toStrictEqual([
      '/fake-assets/fake-dir-one/fake-one.jpg',
      '/fake-assets/fake-dir-two/fake-two.jpg',
    ]);
  });

  it('contributes nothing for an image row missing a path component', async () => {
    const { rows } = await runFeed(
      {
        selection: [makeSelectionRow()],
        images: [
          makeImageRow({ imageDirectory: null, imageFile: 'fake-orphan.jpg' }),
          makeImageRow({ imageDirectory: 'fake-dir', imageFile: null }),
          makeImageRow({ imageDirectory: 'fake-dir', imageFile: 'fake-usable.jpg' }),
        ],
      },
      { baseImageURL: '/fake-assets' },
    );
    const { additionalImageLinkPaths } = rowAt(rows, 0);

    expect(additionalImageLinkPaths).toHaveLength(1);
    expect(imagePathAt(additionalImageLinkPaths, 0)).toBe('/fake-assets/fake-dir/fake-usable.jpg');
  });

  it('answers an empty array for a product with no usable image, which is an ordinary state', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow()],
      images: [makeImageRow({ imageDirectory: null, imageFile: null })],
    });

    // A product with no usable image and a product with no image row at all are
    // indistinguishable downstream, which matches a legacy loop that simply had no
    // rows to emit.
    expect(rowAt(rows, 0).additionalImageLinkPaths).toStrictEqual([]);
  });

  it('shares one image array between every SKU of the same product', async () => {
    const { rows } = await runFeed(
      {
        selection: [
          makeSelectionRow({ skuID: 'fake-sku-id-1', productID: 'fake-shared' }),
          makeSelectionRow({ skuID: 'fake-sku-id-2', productID: 'fake-shared' }),
        ],
        images: [makeImageRow({ productID: 'fake-shared', imageFile: 'fake-shared.jpg' })],
      },
      { baseImageURL: '/fake-assets' },
    );

    // The association belongs to the product, not to the SKU, so both rows read the
    // same paths - and neither sorts or mutates what the other holds.
    expect(rowAt(rows, 0).additionalImageLinkPaths).toStrictEqual([
      '/fake-assets/fake-directory/fake-shared.jpg',
    ]);
    expect(rowAt(rows, 1).additionalImageLinkPaths).toStrictEqual(
      rowAt(rows, 0).additionalImageLinkPaths,
    );
  });

  it('assembles the breadcrumb root-first, with the separator carried verbatim', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'fake-leaf' })],
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          productTypeName: 'Fake Leaf Type',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          productTypeName: 'Fake Middle Type',
          ancestorDistance: 1,
        }),
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          productTypeName: 'Fake Root Type',
          ancestorDistance: 2,
        }),
      ],
    });

    // CFML parity [model/entity/ProductType.cfc:L273-L278]: the legacy override
    // recurses to the parent FIRST and appends its own name after the separator, so
    // the result is root-first. The separator keeps its HTML entity and both spaces;
    // escaping it is the renderer's business.
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe(
      'Fake Root Type &raquo; Fake Middle Type &raquo; Fake Leaf Type',
    );
  });

  it('contributes an empty name rather than dropping a segment with no name', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'fake-leaf' })],
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          productTypeName: 'Fake Leaf Type',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          productTypeName: null,
          ancestorDistance: 1,
        }),
      ],
    });

    // CFML interpolated a null name as an empty string and still emitted its
    // separator, so dropping the segment would shorten the breadcrumb the legacy
    // produced.
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe(' &raquo; Fake Leaf Type');
  });

  it('resolves one breadcrumb per product type from a single ancestry statement', async () => {
    const { recorder, rows } = await runFeed({
      selection: [
        makeSelectionRow({ skuID: 'fake-sku-id-1', productTypeID: 'fake-leaf-a' }),
        makeSelectionRow({ skuID: 'fake-sku-id-2', productTypeID: 'fake-leaf-b' }),
      ],
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf-a',
          productTypeName: 'Fake Type A',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf-b',
          productTypeName: 'Fake Type B',
          ancestorDistance: 0,
        }),
      ],
    });

    expect(
      recorder.captured.filter((call) => classifyStatement(call.sql) === 'ancestry'),
    ).toHaveLength(1);
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Fake Type A');
    expect(rowAt(rows, 1).productTypeSimpleRepresentation).toBe('Fake Type B');
  });
});

// ---------------------------------------------------------------------------
// Isolation and freshness
//
// A warm execution container reuses a loaded module between unrelated requests,
// so a cache at module scope would be state shared between them. The subject
// holds none, and these cases are what prove it from the outside.
// ---------------------------------------------------------------------------

describe('nothing is held between calls, between instances or at module scope', () => {
  it('reads the store again on a second call rather than answering from a cache', async () => {
    const recorder = new RecordingExecutor({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const repository = new GoogleFeedRepository(recorder, makeSettingValues());

    const first = await repository.fetchProductFeedRows();
    const second = await repository.fetchProductFeedRows();

    expect(recorder.captured).toHaveLength(6);
    expect(second).not.toBe(first);
    expect(rowAt(second, 0).skuID).toBe(rowAt(first, 0).skuID);
  });

  it('keeps two independently constructed repositories entirely separate', async () => {
    const firstRun = await runFeed({
      selection: [makeSelectionRow({ skuID: 'fake-sku-id-a' })],
    });
    const secondRun = await runFeed({
      selection: [makeSelectionRow({ skuID: 'fake-sku-id-b' })],
    });

    // Each run captured its own three statements, and neither recorder saw the
    // other's. Nothing at module scope could carry a row, a key or a breadcrumb
    // across, which is what a warm execution container makes essential.
    expect(rowAt(firstRun.rows, 0).skuID).toBe('fake-sku-id-a');
    expect(rowAt(secondRun.rows, 0).skuID).toBe('fake-sku-id-b');
    expect(firstRun.recorder.captured).toHaveLength(3);
    expect(secondRun.recorder.captured).toHaveLength(3);
    expect(secondRun.recorder).not.toBe(firstRun.recorder);
  });

  it('issues the same statement text from every instance, so no statement is stateful', async () => {
    const firstRun = await runFeed({ selection: [makeSelectionRow()] });
    const secondRun = await runFeed({ selection: [makeSelectionRow()] });

    expect(statementOfKind(secondRun.recorder, 'selection').sql).toBe(
      statementOfKind(firstRun.recorder, 'selection').sql,
    );
  });

  it('builds every returned row fresh, so no row is shared between calls', async () => {
    const recorder = new RecordingExecutor({ selection: [makeSelectionRow()] });
    const repository = new GoogleFeedRepository(recorder, makeSettingValues());

    const first = await repository.fetchProductFeedRows();
    const second = await repository.fetchProductFeedRows();

    expect(rowAt(second, 0)).not.toBe(rowAt(first, 0));
  });

  it('answers an empty result without failing, which is an ordinary feed state', async () => {
    const { rows } = await runFeed({ selection: [] });

    // The legacy rendered a feed with no items, so nothing here treats an empty
    // selection as a fault.
    expect(rows).toStrictEqual([]);
  });

  it('holds only the two collaborators it was constructed with', () => {
    const repository = new GoogleFeedRepository(new RecordingExecutor(), makeSettingValues());

    // No configuration field, no cache field, no connection field and no clock. The
    // whole of what the subject knows arrived through its constructor, which is what
    // makes it assertable without an environment of any kind.
    expect(Object.getOwnPropertyNames(repository)).toHaveLength(2);
  });
});
