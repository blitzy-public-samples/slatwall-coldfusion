/**
 * `MySqlBrandRepository` — the brand persistence adapter. **NET-NEW** in its entirety.
 *
 * AAP authority: the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. AAP 0.4.1.12
 * enumerates four adapter test files and does NOT name this one, which is precisely the gap this file
 * closes: AAP 0.4.1.7 lists `src/adapters/mysql/MySqlBrandRepository.ts` | CREATE, and AAP 0.7.3
 * standard 6 requires one test per converted method, so five converted members with no test file at all
 * was a standing shortfall against the AAP's own standard rather than a boundary the AAP had drawn. Two
 * sibling files already sit outside the 0.4.1.12 enumeration under the same wildcard —
 * `MySqlProductPersistence.test.ts` and `catalogAggregates.test.ts` — so this placement follows
 * established practice in this subtree rather than inventing one.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS — AND WHAT WAS UNVERIFIED BEFORE IT
 * =================================================================================================
 * ⚠️ BEFORE THIS FILE, NOTHING IN THE REPOSITORY IMPORTED `MySqlBrandRepository`. A repository-wide
 * search found the name in exactly three places, and all three were PROSE: two comments in
 * `test/support/inMemoryRepositories.ts` and one in `test/services/BrandService.test.ts`, each
 * describing what the real adapter does while testing a double that stands in for it. Its five port
 * members and every SQL path it composes had never been executed once.
 *
 * ⭐ AND THE DOUBLE COULD NOT HAVE COVERED THEM, WHICH IS THE POINT. `test/services/BrandService.test.ts`
 * exercises the SERVICE against an in-memory brand repository; that proves the service's behaviour and
 * says nothing about statement text, bound parameters, row mapping, or the two guards this adapter
 * raises. One of those comments even concedes the gap in passing, at
 * `test/services/BrandService.test.ts:2337` — "a deliberate limitation of the double, since the real
 * `MySqlBrandRepository` answers from the table itself".
 *
 * PROVENANCE — EVERY CASE HERE IS **NET-NEW**
 * No legacy `BrandDAO` exists at all: `model/service/BrandService.cfc` relies entirely on the CRUD
 * surface `org/Hibachi/HibachiService.cfc:L255-L281` fabricates through `onMissingMethod`, which is
 * implicit requirement IR-1 and the reason this adapter had to be declared explicitly in the first
 * place. There is therefore no legacy `BrandDAOTest` either, so nothing below extends a legacy
 * assertion and every `describe` and `it` carries **NET-NEW** (AAP 0.8.3.7).
 *
 * TRACEABILITY IS DOCUMENTARY, AND THE CONSTRAINT IS STATED RATHER THAN IMPLIED. MXUnit and CFSelenium
 * are not vendored in this repository; `meta/docker/slatwall-local-dev/` does not exist; and no
 * ColdFusion, Railo or Lucee engine is available here. The CFML runtime is therefore not reproducible
 * and the legacy suite cannot be executed at all. Every expectation below was derived by INSPECTING
 * `src/adapters/mysql/MySqlBrandRepository.ts` against `model/entity/Brand.cfc` and
 * `model/service/BrandService.cfc`, and **no runtime behavioural comparison against the legacy system
 * was performed**.
 *
 * =================================================================================================
 * WHAT THIS FILE COVERS
 * =================================================================================================
 *   1. `newBrand()` — the transient factory, and the managed surface it returns.
 *   2. `getBrand(brandID)` — the empty-identifier short circuit, the single-row read, the no-row null,
 *      and the ambiguity guard that refuses to hydrate from several rows.
 *   3. `saveBrand(brand)` — both arms, the IR-6 identifier mint, the audit block, and the identifier's
 *      move from FIRST on the insert to LAST on the update.
 *   4. `deleteBrand(brand)` — the affected-row boolean, and the transient guard that issues nothing.
 *   5. `isUrlTitleAvailable(urlTitle)` — the polarity, which is the one member whose name and return
 *      value point in opposite directions and therefore the one most likely to be inverted by mistake.
 *   6. `withExecutor(executor)` — the rebind seam, and the account context it must carry across.
 * ===============================================================================================*/

import { MySqlBrandRepository } from '../../src/adapters/mysql/MySqlBrandRepository';
import { assertColumnName, assertTableName } from '../../src/adapters/mysql/QueryRunner';
import {
  createAbsentAccountContextDouble,
  createAccountContextDouble,
  createManagedBrand,
  createSqlExecutorDouble,
  sqlAffectedRows,
  sqlRows,
  TEST_ADMIN_ACCOUNT_ID,
} from '../support/inMemoryRepositories';

import { DomainError } from '../../src/errors/DomainError';

import type { BrandStatementExecutor } from '../../src/adapters/mysql/MySqlBrandRepository';
import type { BrandRepository } from '../../src/ports/repositories/BrandRepository';
import type { SqlExecutorCall } from '../support/inMemoryRepositories';

/* =================================================================================================
 * IDENTIFIERS, RESOLVED THROUGH THE PRODUCTION WHITELIST RATHER THAN SPELLED BY HAND
 * =================================================================================================
 * Every table and column named below is resolved through the same two validators the adapter itself
 * uses. A typo becomes a thrown `DomainError` at module load rather than an expectation that quietly
 * matches nothing, and a column renamed in the whitelist breaks this file loudly instead of leaving it
 * asserting against a name the adapter no longer emits.
 * ===============================================================================================*/

const BRAND_TABLE = assertTableName('SwBrand');
const BRAND_ID = assertColumnName(BRAND_TABLE, 'brandID');
const BRAND_NAME = assertColumnName(BRAND_TABLE, 'brandName');
const BRAND_URL_TITLE = assertColumnName(BRAND_TABLE, 'urlTitle');

/** The 32-character lowercase hexadecimal identifier form of IR-6. */
const HEX_32 = /^[0-9a-f]{32}$/;

/* =================================================================================================
 * THE HARNESS
 * ===============================================================================================*/

/** One exercised adapter and the double that recorded what it issued. */
interface Harness {
  readonly repository: MySqlBrandRepository;
  readonly calls: readonly SqlExecutorCall[];
  readonly executor: BrandStatementExecutor;
  /** How many times the adapter read the current-account context. */
  accountReads(): number;
}

/**
 * Build the adapter over the suite's recording executor double.
 *
 * ⚠️ THE SEAM IS TYPED AS THE PRODUCTION INTERFACE. `BrandStatementExecutor` is what the constructor
 * accepts, so naming it here proves the double satisfies the real read-and-write seam rather than some
 * convenient shape, and it keeps a half-matching call from type-checking here and failing in production.
 *
 * @param outcomes - queued answers, consumed in issue order; omit for the double's own defaults.
 * @param authenticated - whether an administrative actor is present, which decides the audit columns.
 * @returns the harness.
 */
function harness(
  outcomes: readonly ReturnType<typeof sqlRows>[] = [],
  authenticated = true,
): Harness {
  const double = createSqlExecutorDouble(outcomes.length === 0 ? {} : { outcomes });
  const accountDouble = authenticated
    ? createAccountContextDouble()
    : createAbsentAccountContextDouble();
  const executor: BrandStatementExecutor = double.executor;

  return {
    repository: new MySqlBrandRepository(executor, accountDouble.accountContext),
    calls: double.calls,
    executor,
    accountReads: () => accountDouble.callCount(),
  };
}

/** The single statement the adapter issued, or a failure naming what it actually issued. */
function soleCall(subject: Harness): SqlExecutorCall {
  const [first, ...rest] = subject.calls;

  if (first === undefined) {
    throw new Error('the adapter issued no statement at all');
  }
  if (rest.length > 0) {
    throw new Error(`the adapter issued ${String(subject.calls.length)} statements, expected one`);
  }

  return first;
}

/**
 * Capture the {@link DomainError} a rejecting call produced, narrowed by a real `instanceof` test.
 *
 * ⚠️ WHY NOT `expect.objectContaining`. That matcher is typed `any`, so passing it to `toThrow` trips
 * `no-unsafe-argument` and — more importantly — would let an assertion about `context` type-check while
 * inspecting a value the compiler knows nothing about. Narrowing first means every `context` read below
 * is checked, which is the same discipline the landed adapters use on their own row reads.
 *
 * @param call - the promise expected to reject.
 * @returns the captured error.
 * @throws {Error} when the call resolved, or rejected with something that is not a `DomainError`.
 */
async function captureDomainError(call: Promise<unknown>): Promise<DomainError> {
  try {
    await call;
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the call to reject with a DomainError, but it resolved.');
}

/** Collapses runs of whitespace so a statement matches without depending on its indentation. */
function collapse(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** The column list of an INSERT, split on the adapter's own joiner. */
function insertedColumns(sql: string): readonly string[] {
  return (/\(([^)]*)\) VALUES/.exec(collapse(sql))?.[1] ?? '').split(', ');
}

/** A complete brand row as the table would return it. */
function brandRow(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    brandID: 'brand-1',
    activeFlag: 1,
    publishedFlag: 1,
    urlTitle: 'acme',
    brandName: 'Acme',
    brandWebsite: 'https://acme.test',
    remoteID: '',
    createdDateTime: new Date('2024-01-01T00:00:00.000Z'),
    createdByAccountID: TEST_ADMIN_ACCOUNT_ID,
    modifiedDateTime: new Date('2024-01-02T00:00:00.000Z'),
    modifiedByAccountID: TEST_ADMIN_ACCOUNT_ID,
    ...overrides,
  };
}

/* =================================================================================================
 * 1. newBrand — the transient factory
 * ===============================================================================================*/

describe('NET-NEW — newBrand, the transient factory', () => {
  it('NET-NEW — returns a transient managed brand and issues no statement', () => {
    const subject = harness();

    const brand = subject.repository.newBrand();

    /*
     * `newBrand()` is one of the members `onMissingMethod` fabricated in the legacy (IR-1), and its whole
     * job is to hand back an unsaved entity. It reaches no database: a factory that pre-inserted would
     * make `saveBrand`'s own insert arm unreachable and would persist brands a caller then abandoned.
     */
    expect(brand.isNew()).toBe(true);
    expect(brand.brandID).toBe('');
    expect(subject.calls).toEqual([]);
  });

  it('NET-NEW — returns a DISTINCT instance on each call, so two callers cannot share one draft', () => {
    const subject = harness();

    expect(subject.repository.newBrand()).not.toBe(subject.repository.newBrand());
  });

  it('NET-NEW — returns a MANAGED entity, so the validation surface is present from the start', () => {
    const subject = harness();

    const brand = subject.repository.newBrand();

    /* The managed wrapper carries the error surface `BaseService.save` attaches findings to — the F1
     * contract. An unmanaged entity would type-check at this seam and fail inside the save path. */
    expect(typeof brand.getClassName).toBe('function');
    expect(brand.getClassName()).toBe('Brand');
  });
});

/* =================================================================================================
 * 2. getBrand — the primary-identifier read
 * ===============================================================================================*/

describe('NET-NEW — getBrand, the primary-identifier read', () => {
  it('NET-NEW — short-circuits an EMPTY identifier to null WITHOUT issuing a statement', async () => {
    const subject = harness();

    const found = await subject.repository.getBrand('');

    /*
     * ⭐ THE SHORT CIRCUIT IS THE LOAD-BEARING HALF, NOT THE NULL. An empty identifier is exactly what a
     * transient brand carries, so this path is reached whenever a caller looks up an entity it has not
     * saved. Without the guard the adapter would issue `WHERE brandID = ''`, which is a real query
     * against a real index that can only ever match nothing — so the guard is what keeps a routine
     * miss from becoming a round trip.
     */
    expect(found).toBeNull();
    expect(subject.calls).toEqual([]);
  });

  it('NET-NEW — binds the identifier as a VALUE and selects from SwBrand by primary key', async () => {
    const subject = harness([sqlRows([brandRow()])]);

    await subject.repository.getBrand('brand-1');

    const read = soleCall(subject);
    expect(collapse(read.sql)).toContain(`FROM ${BRAND_TABLE}`);
    expect(collapse(read.sql)).toContain(`WHERE ${BRAND_ID} = ?`);
    expect(read.params).toEqual(['brand-1']);
    /* The identifier never reaches the statement text — `?` binds values only. */
    expect(read.sql).not.toContain('brand-1');
  });

  it('NET-NEW — hydrates every mapped field from the row it read', async () => {
    const subject = harness([sqlRows([brandRow()])]);

    const found = await subject.repository.getBrand('brand-1');

    /* The mapper is the replacement for Hibernate hydration, so the fields are asserted rather than
     * assumed: an adapter that read the row and returned a blank entity would pass a null check. */
    expect(found?.brandID).toBe('brand-1');
    expect(found?.brandName).toBe('Acme');
    expect(found?.urlTitle).toBe('acme');
    expect(found?.brandWebsite).toBe('https://acme.test');
    /* And the hydrated entity is NOT transient, which is what routes a later save to the UPDATE arm. */
    expect(found?.isNew()).toBe(false);
  });

  it('NET-NEW — answers null for a real read that matched nothing', async () => {
    const subject = harness([sqlRows([])]);

    const found = await subject.repository.getBrand('absent-brand');

    /* "No such brand" is a legitimate answer, not an error — and it is reached by a real statement,
     * unlike the empty-identifier case above, which is why both deserve their own case. */
    expect(found).toBeNull();
    expect(subject.calls).toHaveLength(1);
  });

  it('NET-NEW — REFUSES to hydrate when a single-row read matched several, naming the count', async () => {
    const ambiguous = sqlRows([brandRow(), brandRow({ brandID: 'brand-2' })]);
    /* Queued outcomes are consumed one per statement, so the SAME answer is queued twice for the two
     * assertions below. Queuing it once would let the second read fall through to the double's default of
     * no rows, and the case would then be asserting a refusal against an empty result. */
    const subject = harness([ambiguous, ambiguous]);

    /*
     * ⚠️ IT REFUSES RATHER THAN TAKING THE FIRST ROW, AND THAT IS THE SAFE DIRECTION. A read on the
     * primary key cannot legitimately match twice, so two rows mean the data contradicts the schema.
     * Silently returning `rows[0]` would hide a corrupt table behind a plausible-looking brand and let
     * whichever row the engine happened to order first decide the answer.
     */
    await expect(subject.repository.getBrand('brand-1')).rejects.toThrow(
      /matched several, so the result is ambiguous/,
    );

    const raised = await captureDomainError(subject.repository.getBrand('brand-1'));
    expect(raised.context?.['table']).toBe(BRAND_TABLE);
    expect(raised.context?.['rowCount']).toBe(2);
  });
});

/* =================================================================================================
 * 3. saveBrand — both arms of the write
 * ===============================================================================================*/

describe('NET-NEW — saveBrand, the SwBrand write seam', () => {
  it('NET-NEW — mints a 32-hex identifier on the INSERT arm and binds it FIRST', async () => {
    const subject = harness();
    const { brand } = createManagedBrand({ brandName: 'Acme' });

    expect(brand.isNew()).toBe(true);

    const returned = await subject.repository.saveBrand(brand);

    /* IR-6 — 32 lowercase hexadecimal characters, no dashes, never an auto-increment. */
    expect(brand.brandID).toMatch(HEX_32);
    expect(brand.isNew()).toBe(false);
    /* The SAME instance is returned, so a caller keeps the entity whose findings it is holding. */
    expect(returned).toBe(brand);

    const insert = soleCall(subject);
    expect(collapse(insert.sql)).toContain(`INSERT INTO ${BRAND_TABLE}`);
    expect(insert.params[0]).toBe(brand.brandID);
  });

  it('NET-NEW — takes the UPDATE arm on a persisted brand and binds the identifier LAST', async () => {
    const subject = harness();
    const { brand } = createManagedBrand({ brandID: 'brand-1', brandName: 'Acme' });

    await subject.repository.saveBrand(brand);

    const update = soleCall(subject);
    /*
     * ⭐ THE IDENTIFIER MOVES FROM FIRST TO LAST BETWEEN THE ARMS. On the insert it leads the column
     * list; on the update it is the WHERE predicate rather than a written column. Both positions hold
     * strings, so a swap between the arms type-checks perfectly and would update the wrong row — or
     * every row — which is why each arm is pinned separately.
     */
    expect(collapse(update.sql)).toContain(`UPDATE ${BRAND_TABLE} SET`);
    expect(collapse(update.sql)).toContain(`WHERE ${BRAND_ID} = ?`);
    expect(update.params[update.params.length - 1]).toBe('brand-1');
    expect(update.sql).not.toContain('INSERT');
    /* Nothing re-mints an identifier on an update. */
    expect(brand.brandID).toBe('brand-1');
  });

  it('NET-NEW — is idempotent across two saves: one INSERT, then one UPDATE', async () => {
    const subject = harness();
    const { brand } = createManagedBrand({ brandName: 'Acme' });

    await subject.repository.saveBrand(brand);
    const mintedOnce = brand.brandID;
    await subject.repository.saveBrand(brand);

    const [first, second] = subject.calls;
    expect(collapse(first?.sql ?? '')).toContain('INSERT INTO');
    expect(collapse(second?.sql ?? '')).toContain('UPDATE');
    /* A second save must not duplicate the row, and must not re-mint the identifier. */
    expect(brand.brandID).toBe(mintedOnce);
  });

  it('NET-NEW — stamps the audit block through the FREE functions, taking one instant on an insert', async () => {
    const subject = harness();
    const { brand } = createManagedBrand({ brandName: 'Acme' });

    await subject.repository.saveBrand(brand);

    /*
     * ⭐ THE FREE-FUNCTION ROUTE IS CORRECT HERE, AND IT IS THE OPPOSITE OF THE PRODUCT-TYPE ADAPTER.
     * `model/entity/Brand.cfc` does not override `preInsert`/`preUpdate`, so a brand received only the
     * framework audit block at `org/Hibachi/HibachiEntity.cfc:L598-L649` — which is what
     * `src/domain/base/AuditableEntity.ts` ports. `model/entity/ProductType.cfc:L305-L313` DOES override
     * both, which is why `MySqlProductTypeRepository` calls the entity's own hooks instead. Same-looking
     * adapters, deliberately different mechanisms, and the difference is legacy-faithful.
     */
    const insert = soleCall(subject);
    const columns = insertedColumns(insert.sql);
    const created = insert.params[columns.indexOf('createdDateTime')];
    const modified = insert.params[columns.indexOf('modifiedDateTime')];

    expect(created).toBeDefined();
    expect(created).toEqual(modified);
    /* The account context was consulted, which is how the actor columns were decided at all. */
    expect(subject.accountReads()).toBeGreaterThan(0);
    expect(insert.params[columns.indexOf('createdByAccountID')]).toBe(TEST_ADMIN_ACCOUNT_ID);
  });

  it('NET-NEW — leaves both account columns unwritten when nobody is authenticated', async () => {
    const subject = harness([], false);
    const { brand } = createManagedBrand({ brandName: 'Acme' });

    await subject.repository.saveBrand(brand);

    /* An absent actor is a legitimate state and no system account is substituted (AAP 0.7.3 S9). */
    const insert = soleCall(subject);
    const columns = insertedColumns(insert.sql);

    for (const column of ['createdByAccountID', 'modifiedByAccountID']) {
      const index = columns.indexOf(column);
      expect(index).toBeGreaterThan(-1);
      expect(insert.params[index] ?? null).toBeNull();
    }
    /* The timestamps still moved, so "no actor" did not become "no audit". */
    expect(insert.params[columns.indexOf('createdDateTime')]).toBeDefined();
    /* And the admin identifier appears nowhere, so nothing quietly fell back to it. */
    expect(insert.params).not.toContain(TEST_ADMIN_ACCOUNT_ID);
  });

  it('NET-NEW — binds one value per named column on the insert', async () => {
    const subject = harness();

    await subject.repository.saveBrand(createManagedBrand().brand);

    const insert = soleCall(subject);
    const columns = insertedColumns(insert.sql);
    const markers = (/VALUES \(([^)]*)\)/.exec(collapse(insert.sql))?.[1] ?? '').split(', ');

    /* TR-4 — positional, one for one. A count mismatch shifts every later value by one silently. */
    expect(markers).toHaveLength(columns.length);
    expect(insert.params).toHaveLength(columns.length);
    expect(markers.every((marker) => marker === '?')).toBe(true);
  });

  it('NET-NEW — never lets a quote-bearing brand name reach the statement text', async () => {
    const subject = harness();
    const hostile = "Ac'me; DROP TABLE SwBrand; --";
    const { brand } = createManagedBrand({ brandName: hostile });

    await subject.repository.saveBrand(brand);

    /* D18's value/identifier separation, applied to the brand write path. */
    const insert = soleCall(subject);
    expect(insert.sql).not.toContain('DROP TABLE SwBrand;');
    expect(insert.sql).not.toContain("'");
    expect(insert.params).toContain(hostile);
    /* The column name still appears, so the assertion above did not pass by emitting nothing. */
    expect(insertedColumns(insert.sql)).toContain(BRAND_NAME);
  });

  it('NET-NEW — opens no transaction of its own, leaving the boundary to the caller', async () => {
    const subject = harness();

    await subject.repository.saveBrand(createManagedBrand().brand);

    /* `UnitOfWork` owns the boundary; a bare save composes one statement and nothing else. */
    expect(subject.calls).toHaveLength(1);
    expect(collapse(soleCall(subject).sql)).not.toContain('BEGIN');
  });
});

/* =================================================================================================
 * 4. deleteBrand — the removal path and its affected-row answer
 * ===============================================================================================*/

describe('NET-NEW — deleteBrand, the SwBrand removal seam', () => {
  it('NET-NEW — deletes by bound identifier and reports true when a row went', async () => {
    const subject = harness([sqlAffectedRows(1)]);
    const { brand } = createManagedBrand({ brandID: 'brand-1' });

    const removed = await subject.repository.deleteBrand(brand);

    expect(removed).toBe(true);
    const remove = soleCall(subject);
    expect(collapse(remove.sql)).toContain(`DELETE FROM ${BRAND_TABLE} WHERE ${BRAND_ID} = ?`);
    expect(remove.params).toEqual(['brand-1']);
    expect(remove.sql).not.toContain('brand-1');
  });

  it('NET-NEW — reports FALSE when the statement removed nothing, rather than raising', async () => {
    const subject = harness([sqlAffectedRows(0)]);
    const { brand } = createManagedBrand({ brandID: 'already-gone' });

    const removed = await subject.repository.deleteBrand(brand);

    /*
     * ⭐ THE BOOLEAN IS DERIVED FROM THE AFFECTED-ROW COUNT, AND BOTH ANSWERS ARE REAL.
     * `model/service/HibachiService.cfc:L68` returns a flag rather than raising, so a brand that was
     * already removed reports `false` and is not an error. A single case asserting only the `true` path
     * would pass against an implementation that returned `true` unconditionally, which is why the zero
     * case is pinned beside it.
     */
    expect(removed).toBe(false);
    expect(subject.calls).toHaveLength(1);
  });

  it('NET-NEW — refuses a transient brand and issues NOTHING AT ALL', async () => {
    const subject = harness();
    const { brand } = createManagedBrand({ brandName: 'Never Saved' });

    await expect(subject.repository.deleteBrand(brand)).rejects.toThrow(
      /never been persisted was handed to the removal path/,
    );

    /*
     * ⚠️ THE REFUSAL IS ONLY HALF THE CONTRACT. A guard that raised AFTER issuing the DELETE would
     * satisfy a `rejects` assertion having already run `WHERE brandID = ''` against the table. The
     * load-bearing half is that nothing ran — which the adapter's own message asserts too, so the
     * statement count is what proves the message honest.
     */
    expect(subject.calls).toEqual([]);
  });

  it('NET-NEW — names the class in the refusal, since a transient brand has no identifier', async () => {
    const subject = harness();
    const { brand } = createManagedBrand({ brandName: 'Never Saved' });

    const raised = await captureDomainError(subject.repository.deleteBrand(brand));
    expect(raised.context?.['brandID']).toBe('');
    expect(raised.context?.['className']).toBe('Brand');
  });
});

/* =================================================================================================
 * 5. isUrlTitleAvailable — the member whose polarity is easiest to invert
 * ===============================================================================================*/

describe('NET-NEW — isUrlTitleAvailable, and the polarity it must keep', () => {
  it('NET-NEW — reports TRUE when NO row holds the title, which is what "available" means', async () => {
    const subject = harness([sqlRows([])]);

    const available = await subject.repository.isUrlTitleAvailable('acme');

    /*
     * ⭐ THE POLARITY IS THE WHOLE POINT OF THIS BLOCK, AND IT RUNS OPPOSITE TO THE ROW COUNT.
     * The statement asks whether the title is TAKEN; the member answers whether it is FREE. So an empty
     * result means available, and `return rows.length === 0` is correct rather than a bug. Inverting it
     * would compile, would return a boolean, and would break IR-5's application-side uniqueness check in
     * the most confusing possible direction: every FREE title would be reported as taken, so
     * `BrandService.saveBrand` would append `-2`, `-3`, `-4` … to titles nobody was using, and the
     * defect would look like a URL-slug bug rather than a predicate inversion. Both directions are
     * therefore asserted, because either one alone is satisfied by a constant.
     */
    expect(available).toBe(true);
  });

  it('NET-NEW — reports FALSE when a row already holds the title', async () => {
    const subject = harness([sqlRows([{ 1: 1 }])]);

    const available = await subject.repository.isUrlTitleAvailable('acme');

    expect(available).toBe(false);
  });

  it('NET-NEW — probes for existence only: SELECT 1 with LIMIT 1, and no column list', async () => {
    const subject = harness([sqlRows([])]);

    await subject.repository.isUrlTitleAvailable('acme');

    const probe = soleCall(subject);
    /*
     * One row is complete evidence for an existence question, and the projection is a literal rather
     * than a column list because nothing about the matching brand is read. Hydrating a whole row to
     * answer a boolean would also make the ambiguity guard of `getBrand` relevant here, which it is not.
     */
    expect(collapse(probe.sql)).toBe(
      `SELECT 1 FROM ${BRAND_TABLE} WHERE ${BRAND_URL_TITLE} = ? LIMIT 1`,
    );
    expect(probe.params).toEqual(['acme']);
  });

  it('NET-NEW — binds a quote-bearing title as a value, so a title cannot alter the probe', async () => {
    const subject = harness([sqlRows([])]);
    const hostile = "acme' OR '1'='1";

    await subject.repository.isUrlTitleAvailable(hostile);

    /*
     * The classic always-true injection, aimed at the one predicate whose answer decides whether a
     * uniqueness check passes. Bound as a value it can only ever be a title nobody owns.
     */
    const probe = soleCall(subject);
    expect(probe.sql).not.toContain("OR '1'='1");
    expect(probe.sql).not.toContain("'");
    expect(probe.params).toEqual([hostile]);
  });

  it('NET-NEW — treats the EMPTY title as a real question rather than short-circuiting it', async () => {
    const subject = harness([sqlRows([])]);

    const available = await subject.repository.isUrlTitleAvailable('');

    /*
     * ⚠️ DELIBERATELY UNLIKE `getBrand`, WHICH DOES SHORT-CIRCUIT ITS EMPTY ARGUMENT. There the empty
     * string is the transient sentinel and can match nothing by construction; here it is an ordinary
     * candidate value that a row could genuinely hold, so refusing to ask would invent an answer. The
     * asymmetry between the two members is intentional and is asserted so it cannot be "tidied".
     */
    expect(available).toBe(true);
    expect(subject.calls).toHaveLength(1);
    expect(soleCall(subject).params).toEqual(['']);
  });
});

/* =================================================================================================
 * 6. withExecutor — the rebind seam, and the port surface as a whole
 * ===============================================================================================*/

describe('NET-NEW — withExecutor, the rebind seam UnitOfWork uses', () => {
  it('NET-NEW — returns a DIFFERENT instance and issues the work on the NEW executor', async () => {
    const subject = harness();
    const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    const rebound = subject.repository.withExecutor(second.executor);

    /*
     * ⭐ THE IDENTITY ASSERTION IS THE SAFETY PROPERTY, NOT A STYLE PREFERENCE. The composition root
     * builds ONE adapter and shares it; `UnitOfWork` rebinds a transaction-scoped executor per boundary.
     * Were the rebind to mutate in place and return `this`, two concurrent boundaries would fight over
     * one executor field and statements would cross transactions — a fault that appears only under
     * concurrency and never in a single-threaded test of either path alone.
     */
    expect(rebound).not.toBe(subject.repository);

    await rebound.isUrlTitleAvailable('acme');

    expect(second.calls).toHaveLength(1);
    /* And the original saw nothing, so the rebind leaked nothing back onto it. */
    expect(subject.calls).toEqual([]);
  });

  it('NET-NEW — leaves the original bound to its own executor', async () => {
    const subject = harness([sqlRows([])]);
    const second = createSqlExecutorDouble({ outcomes: [sqlRows([])] });

    await subject.repository.withExecutor(second.executor).isUrlTitleAvailable('rebound-title');
    await subject.repository.isUrlTitleAvailable('original-title');

    /* Asserted from both sides, with the parameters proving which statement went where. A leak would
     * put both on one double, and a count alone could not say which. */
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]?.params).toEqual(['rebound-title']);
    expect(subject.calls).toHaveLength(1);
    expect(subject.calls[0]?.params).toEqual(['original-title']);
  });

  it('NET-NEW — carries the ACCOUNT CONTEXT across the rebind, so audit survives a transaction', async () => {
    const subject = harness();
    const second = createSqlExecutorDouble({});

    const { brand } = createManagedBrand({ brandName: 'Acme' });
    await subject.repository.withExecutor(second.executor).saveBrand(brand);

    /*
     * ⭐ THE REBIND TAKES A NEW EXECUTOR AND MUST KEEP EVERYTHING ELSE. The account context is the other
     * constructor argument, and it is the one a rebind could plausibly drop — the signature only mentions
     * the executor. Dropping it would compile only if something were substituted for it, and the
     * observable consequence would be an audit block written with no actor INSIDE a transaction while
     * the same save outside one recorded the actor correctly. Asserted on the rebound instance's own
     * statement rather than on the original's.
     */
    const [insert] = second.calls;
    expect(insert).toBeDefined();
    const columns = insertedColumns(insert?.sql ?? '');
    expect(insert?.params[columns.indexOf('createdByAccountID')]).toBe(TEST_ADMIN_ACCOUNT_ID);
  });

  it('NET-NEW — satisfies the BrandRepository port across ALL FIVE declared members', () => {
    const asPort: BrandRepository = harness().repository;

    /*
     * Keyed off the port's own member set, so a sixth method breaks compilation here until it is named.
     * `withExecutor` is deliberately absent: the port is what a service depends on, and a service never
     * rebinds, so the seam is asserted on the concrete adapter in the cases above instead.
     */
    const everyPortMember: Record<keyof BrandRepository, true> = {
      newBrand: true,
      getBrand: true,
      saveBrand: true,
      deleteBrand: true,
      isUrlTitleAvailable: true,
    };

    const declared = Object.keys(everyPortMember) as readonly (keyof BrandRepository)[];

    expect(declared).toHaveLength(5);
    for (const member of declared) {
      expect(typeof asPort[member]).toBe('function');
    }

    expect(typeof harness().repository.withExecutor).toBe('function');
  });
});
