/**
 * The paging and ordering decisions `src/handlers/bootstrap.ts` composes into SQL.
 *
 * ★★★ TRACEABILITY - NET-NEW. `meta/tests/` carries no test of any kind against the CFML
 * framework's paging or against `OptionGroup`'s declared association order, so nothing here extends
 * legacy coverage. It is declared net-new rather than presented as parity, per AAP 0.6.6.
 *
 * WHY THIS FILE EXISTS. Two statement constants in the composition root each claimed to port a
 * legacy declaration and each diverged from it:
 *
 *   * `SELECT_PRICE_GROUP_PAGE_IDS_SQL` returned EVERY row of `SwPriceGroup` while the legacy smart
 *     list executes with `maxresults=10` [org/Hibachi/HibachiSmartList.cfc:L39, L759-L764].
 *   * `SELECT_OPTIONS_BY_OPTION_GROUP_ID_SQL` ordered by `sortOrder, optionID` while
 *     [model/entity/OptionGroup.cfc:L70] declares `orderby="sortOrder"` - one column, no
 *     tie-breaker.
 *
 * Both were unreachable from any suite, because `bootstrap.ts` had no test file. That is the reason
 * the divergences survived: nothing could observe them. This file closes that gap by driving the
 * REAL graph, through its published test seam, against a capturing executor - so the assertions are
 * about the statement the adapter actually emits rather than about text scraped from the source.
 *
 * HOW THE SEAM WORKS. `CompositionOverrides` documents itself as "the test seam, and the only way to
 * build a root that is not memoized": passing any override bypasses the module memo entirely, so no
 * pool is created, no database is contacted and no module state is patched. The executor override is
 * the whole mechanism - see `bootstrapCompositionRoot`.
 */

import { describe, expect, it } from 'vitest';

import { Money } from '../../../src/domain/valueObjects/money.js';
import {
  bootstrapCompositionRoot,
  type CompositionRoot,
  type RequestScope,
} from '../../../src/handlers/bootstrap.js';
import type { SqlMutationResult, SqlRow } from '../../../src/repositories/mysql/connection.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// The capturing executor
// ---------------------------------------------------------------------------

/** One statement the graph emitted, with what it bound. */
interface CapturedStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * A canned answer matched by SQL FRAGMENT rather than by exact text.
 *
 * The by-key statements the set-based loaders emit carry a placeholder run whose length depends on
 * the key set, so an exact-text key would have to be recomputed per case. Matching on the stable part
 * of the statement - the table and the predicate - keeps each case readable while still being
 * specific: the exact TEXT is asserted separately, by the cases that exist to assert it.
 *
 * Entries are tried IN ORDER, and the first whose fragment appears wins.
 */
interface ScriptedAnswer {
  readonly fragment: string;
  readonly rows: readonly SqlRow[];

  /**
   * How many times this entry may answer. Omit for "always".
   *
   * A finite budget models a row that is present for one read and gone for the next, which is the
   * only way to reach the composition root's refusal path for an intent naming a price group that
   * cannot be loaded.
   */
  readonly times?: number;
}

/**
 * A `PreparedStatementExecutor` that records every statement and answers from a canned script.
 *
 * Satisfied structurally, with no `implements` clause, because the interface lives in
 * `src/repositories/mysql/connection.ts` and this file has no business declaring a relationship to
 * it - the compiler checks the shape where the value is handed to `bootstrapCompositionRoot`.
 *
 * `resultsBySql` is consulted by an EXACT statement match and defaults to an empty result set. An
 * empty answer is the useful default here: every case below wants to observe the statement the graph
 * chose to emit, and returning no rows stops hydration before it reaches a second adapter whose
 * statement shape is another file's concern.
 */
class CapturingExecutor {
  readonly calls: CapturedStatement[] = [];

  /** Remaining answers per scripted entry, by index, so `times` can be spent down. */
  private readonly remainingAnswers: number[];

  constructor(
    private readonly resultsBySql: ReadonlyMap<string, readonly SqlRow[]> = new Map(),
    private readonly scriptedAnswers: readonly ScriptedAnswer[] = [],
  ) {
    this.remainingAnswers = scriptedAnswers.map(
      (answer) => answer.times ?? Number.POSITIVE_INFINITY,
    );
  }

  execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: params ?? [] });

    const exact = this.resultsBySql.get(sql);

    if (exact !== undefined) {
      return Promise.resolve(exact);
    }

    for (const [index, answer] of this.scriptedAnswers.entries()) {
      if (!sql.includes(answer.fragment)) {
        continue;
      }

      const remaining = this.remainingAnswers[index] ?? 0;

      if (remaining <= 0) {
        // Deliberately falls through to the empty default rather than to a later entry: a spent
        // budget means "this statement no longer matches anything", which is how a row disappearing
        // between two reads is modelled.
        return Promise.resolve([]);
      }

      this.remainingAnswers[index] = remaining - 1;

      return Promise.resolve(answer.rows);
    }

    return Promise.resolve([]);
  }

  executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    this.calls.push({ sql, params: params ?? [] });

    return Promise.resolve({ affectedRows: 0, warningStatus: 0 });
  }

  /**
   * Runs the work against THIS executor, so a statement issued inside a transaction is recorded on
   * the same list as one issued outside it.
   *
   * No commit or rollback is simulated. Nothing below opens a transaction, and a fake that pretended
   * to would be asserting the driver's semantics rather than the graph's statement choices.
   */
  transaction<T>(work: (tx: CapturingExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }
}

/**
 * The five environment keys `appConfig.load` requires with no default.
 *
 * No credential is real and none is read by anything: the executor override means no pool is ever
 * constructed, so these values only have to satisfy validation. `DB_TLS_MODE` and `DB_DIALECT` are
 * closed vocabularies, so their values are the documented literals rather than placeholders.
 */
const TEST_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.freeze({
  DB_HOST: '127.0.0.1',
  DB_USER: 'test-user',
  DB_PASSWORD: 'test-password',
  DB_TLS_MODE: 'disabled',
  DB_DIALECT: 'MySQL',
});

/** Build a non-memoized root over the supplied executor. */
async function makeRoot(executor: CapturingExecutor): Promise<CompositionRoot> {
  return bootstrapCompositionRoot({ executor, environment: TEST_ENVIRONMENT });
}

/** Build a root and open one request scope over it. */
async function makeScope(executor: CapturingExecutor): Promise<RequestScope> {
  const root = await makeRoot(executor);

  return root.createRequestScope();
}

/** The one statement whose text contains `fragment`, or a failure naming what was emitted. */
function requireStatementContaining(
  executor: CapturingExecutor,
  fragment: string,
): CapturedStatement {
  const matches = executor.calls.filter((call) => call.sql.includes(fragment));
  const [first] = matches;

  if (first === undefined) {
    throw new Error(
      `no emitted statement contains ${JSON.stringify(fragment)}; emitted: ` +
        JSON.stringify(executor.calls.map((call) => call.sql)),
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `${String(matches.length)} emitted statements contain ${JSON.stringify(fragment)}, expected one`,
    );
  }

  return first;
}

// ===========================================================================
// M2 - the price-group page
// ===========================================================================

describe('the price-group page statement reproduces the smart list default page size', () => {
  it('★★★ emits MySQL `LIMIT 10`, because the source declares `pageRecordsShow=10`', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L233]: `getPriceGroupSmartList()` is called
    // with NO ARGUMENTS, so `HibachiSmartList.setup`'s declared defaults apply -
    // `pageRecordsStart=1, pageRecordsShow=10` [org/Hibachi/HibachiSmartList.cfc:L39] - and
    // `getPageRecords()` executes `{offset=getPageRecordsStart()-1, maxresults=getPageRecordsShow()}`
    // [L759-L764]. `getPageRecordsStart()` answers 1 before any page is declared [L793-L797], so the
    // executed query is offset 0, maxresults 10.
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    await scope.priceGroupService.getPriceGroupDataJSON();

    const statement = requireStatementContaining(executor, 'FROM SwPriceGroup');

    expect(statement.sql).toBe('SELECT priceGroupID FROM SwPriceGroup LIMIT 10');

    // ★★ AND IT IS NOT THE WHOLE TABLE. Asserted as its own negative because that is precisely the
    // shape this statement had: a method named `getPriceGroupPageRecords` that returned every row.
    expect(statement.sql).not.toBe('SELECT priceGroupID FROM SwPriceGroup');
    expect(statement.sql).toContain('LIMIT 10');
  });

  it('★★ imposes NO ordering, and that absence is faithful rather than an oversight', async () => {
    // The caller configures no sort and `HibachiSmartList` applies none unless one is configured, so
    // WHICH ten rows arrive is whatever the database volunteers. An unordered `LIMIT` is an unstable
    // page and the instability is the ported behaviour - the same treatment
    // `getActivePromotionRewards` receives [model/dao/PromotionDAO.cfc:L51-L132].
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    await scope.priceGroupService.getPriceGroupDataJSON();

    const statement = requireStatementContaining(executor, 'FROM SwPriceGroup');

    expect(statement.sql).not.toContain('ORDER BY');
  });

  it('★★ binds NOTHING: the ten is a literal, not a parameter', async () => {
    // MySQL does not accept a placeholder in `LIMIT` for a prepared statement in the general case,
    // and nothing in this slice reaches page two - `getPriceGroupDataJSON`
    // [model/service/PriceGroupService.cfc:L230-L260] never touches `pageRecordsStart`,
    // `currentPageDeclaration` or `pageRecordsShow`. So the statement is parameterless, which is how
    // the adapter already calls it.
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    await scope.priceGroupService.getPriceGroupDataJSON();

    expect(requireStatementContaining(executor, 'FROM SwPriceGroup').params).toStrictEqual([]);
  });
});

// ===========================================================================
// M3 - a group's options
// ===========================================================================

describe("the option statement reproduces OptionGroup's declared association order", () => {
  /** The twelve columns `hydrateOptionGroup` reads, for one group that has no options. */
  function optionGroupRow(optionGroupID: string): SqlRow {
    return {
      optionGroupID,
      optionGroupName: 'Size',
      optionGroupCode: 'size',
      optionGroupImage: undefined,
      optionGroupDescription: undefined,
      imageGroupFlag: 0,
      sortOrder: 1,
      remoteID: undefined,
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    };
  }

  /**
   * Drive `processProduct_addOptionGroup`, which is the public path that reaches
   * `getOptionGroup(id).getOptions()` [model/service/ProductService.cfc:L115].
   *
   * The group read must answer a row or the loader returns before the options statement is reached;
   * the options read then answers nothing, which leaves the group's collection empty and takes the
   * `arrayLen(options)` false arm at [L117] without touching a SKU.
   */
  async function readOptionsFor(optionGroupID: string): Promise<CapturingExecutor> {
    const executor = new CapturingExecutor(
      new Map([
        [
          'SELECT optionGroupID, optionGroupName, optionGroupCode, optionGroupImage, ' +
            'optionGroupDescription, imageGroupFlag, sortOrder, remoteID, createdDateTime, ' +
            'createdByAccountID, modifiedDateTime, modifiedByAccountID FROM SwOptionGroup ' +
            'WHERE optionGroupID = ?',
          [optionGroupRow(optionGroupID)],
        ],
      ]),
    );
    const scope = await makeScope(executor);

    await scope.productService.processProduct_addOptionGroup(makeProductFixture(), {
      optionGroup: optionGroupID,
    });

    return executor;
  }

  it('★★★ orders by `sortOrder` ALONE, with no `optionID` tie-breaker', async () => {
    // [model/entity/OptionGroup.cfc:L70] declares `orderby="sortOrder"` - one column - so Hibernate
    // emitted `ORDER BY sortOrder` and nothing more.
    const executor = await readOptionsFor('og-order-1');
    const statement = requireStatementContaining(executor, 'FROM SwOption WHERE optionGroupID = ?');

    expect(statement.sql.endsWith('ORDER BY sortOrder')).toBe(true);
    expect(statement.sql).not.toContain('ORDER BY sortOrder, optionID');
    expect(statement.params).toStrictEqual(['og-order-1']);
  });

  it('★★ leaves ties to the database, because the legacy did', async () => {
    // `sortOrder` is a nullable integer [model/entity/Option.cfc:L56], so ties and nulls are both
    // reachable in real data and the legacy resolved neither. Determinism across reads is a property
    // the source DID NOT HAVE; adding it would be a fourth deliberate divergence, and the AAP budgets
    // exactly three, all spent [AAP 0.6.7].
    const executor = await readOptionsFor('og-order-2');
    const statement = requireStatementContaining(executor, 'FROM SwOption WHERE optionGroupID = ?');

    // Exactly one ordering term: splitting on the comma that would introduce a second yields one part
    // after `ORDER BY`.
    const [, orderingClause] = statement.sql.split('ORDER BY ');

    expect(orderingClause).toBe('sortOrder');
    expect(orderingClause?.split(',')).toHaveLength(1);
  });
});

// ===========================================================================
// M4 - set-based identifier loading at the three fetch-shape sites
// ===========================================================================

/**
 * The stable part of the by-key price-group statement, and of the per-key form it replaced.
 *
 * `BY_KEY_SET` matches the set-based predicate and `BY_KEY_SINGULAR` matches the one-at-a-time
 * predicate the loops used to emit. Asserting the ABSENCE of the second is what makes each case
 * below a proof rather than a description: a per-identifier loop would still emit a correct-looking
 * answer, and only the statement sequence tells the two implementations apart.
 */
const PRICE_GROUP_BY_KEY_SET = 'FROM SwPriceGroup pg\nWHERE pg.priceGroupID IN (';
const PRICE_GROUP_BY_KEY_SINGULAR = 'FROM SwPriceGroup pg\nWHERE pg.priceGroupID = ?';

/**
 * Any read of `SwOption` by key, and then each predicate on its own.
 *
 * The set-based and the singular statement share their projection and their join verbatim - only the
 * predicate differs - so `OPTION_READ` counts reads of the table regardless of which form emitted
 * them. That is the count the cases below assert on: "how many times was `SwOption` read" is the
 * question M4 is about, and matching on the shared part is what makes a per-identifier loop visible
 * rather than merely differently-shaped.
 */
const OPTION_READ = 'FROM SwOption swOption LEFT JOIN SwOptionGroup optionGroup';
const OPTION_BY_KEY_SET = 'WHERE swOption.optionID IN (';
const OPTION_BY_KEY_SINGULAR = 'WHERE swOption.optionID = ?';

const ACCOUNT_PRICE_GROUP_LINK_SQL =
  'SELECT priceGroupID FROM SwAccountPriceGroup WHERE accountID = ?';

const M4_ACCOUNT_ID = 'acct-m4';

/** The ten `SwPriceGroup` columns `hydratePriceGroup` reads, for a root-level active group. */
function m4PriceGroupRow(priceGroupID: string): SqlRow {
  return {
    priceGroupID,
    priceGroupIDPath: priceGroupID,
    // Numeric, because MySQL reports a `bit`/`tinyint` that way and the adapter passes it through
    // uncoerced so the entity can apply CFML boolean semantics.
    activeFlag: 1,
    priceGroupName: priceGroupID,
    priceGroupCode: priceGroupID,
    parentPriceGroupID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
  };
}

/** One `SwPriceGroupRate` row with no rounding rule joined, owned by `priceGroupID`. */
function m4RateRow(priceGroupRateID: string, priceGroupID: string, amount: string): SqlRow {
  return {
    priceGroupRateID,
    globalFlag: 0,
    amount,
    amountType: 'percentageOff',
    remoteID: null,
    priceGroupID,
    roundingRuleID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    roundingRule_roundingRuleID: null,
  };
}

/** Every by-key price-group statement the graph emitted, set-based or singular. */
function byKeyPriceGroupStatements(executor: CapturingExecutor): readonly CapturedStatement[] {
  return executor.calls.filter(
    (call) =>
      call.sql.includes(PRICE_GROUP_BY_KEY_SET) || call.sql.includes(PRICE_GROUP_BY_KEY_SINGULAR),
  );
}

function statementAtIndex(
  statements: readonly CapturedStatement[],
  index: number,
): CapturedStatement {
  const statement = statements[index];

  if (statement === undefined) {
    throw new Error(
      `expected a statement at index ${String(index)}, but only ${String(statements.length)} were captured`,
    );
  }

  return statement;
}

describe("the account's price-group association is loaded as a SET, never one member at a time", () => {
  // ★★★ NET-NEW COVERAGE (AAP 0.6.6). There is no legacy antecedent for the loader itself -
  // `model/dao/PriceGroupDAO.cfc` declares no load function - but the shape being restored is
  // traceable: `PriceGroup.accounts` is a many-to-many over `SwAccountPriceGroup`
  // [model/entity/PriceGroup.cfc:L67], and Hibernate answered `account.getPriceGroups()` with ONE
  // association fetch. Reading the members one at a time was a target-only shape.

  it('★★★ emits ONE keyed statement for a three-row association, and no per-key statement at all', async () => {
    const sku = makeSkuFixture();

    // Three link rows naming two distinct price groups: the repeat is what the ORM association could
    // not contain, so it is collapsed rather than fetched twice.
    const executor = new CapturingExecutor(
      new Map([
        [
          ACCOUNT_PRICE_GROUP_LINK_SQL,
          [{ priceGroupID: 'pg-a' }, { priceGroupID: 'pg-b' }, { priceGroupID: 'pg-a' }],
        ],
      ]),
      [
        {
          fragment: PRICE_GROUP_BY_KEY_SET,
          rows: [m4PriceGroupRow('pg-a'), m4PriceGroupRow('pg-b')],
        },
      ],
    );
    const scope = await makeScope(executor);

    await scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, M4_ACCOUNT_ID);

    const byKey = byKeyPriceGroupStatements(executor);

    expect(byKey).toHaveLength(1);
    expect(statementAtIndex(byKey, 0).sql).toContain('WHERE pg.priceGroupID IN (?, ?)');

    // ★★ THE BINDING ORDER IS THE LINK-TABLE ROW ORDER, and the repeat is gone.
    expect(statementAtIndex(byKey, 0).params).toStrictEqual(['pg-a', 'pg-b']);

    // The negative that distinguishes the two implementations. A per-identifier loop would have
    // emitted this statement twice and this one never.
    expect(
      executor.calls.filter((call) => call.sql.includes(PRICE_GROUP_BY_KEY_SINGULAR)),
    ).toHaveLength(0);
  });

  it('collapses two spellings of one identifier to a single placeholder', async () => {
    const executor = new CapturingExecutor(
      new Map([
        [ACCOUNT_PRICE_GROUP_LINK_SQL, [{ priceGroupID: 'pg-a' }, { priceGroupID: 'PG-A' }]],
      ]),
      [{ fragment: PRICE_GROUP_BY_KEY_SET, rows: [m4PriceGroupRow('pg-a')] }],
    );
    const scope = await makeScope(executor);

    await scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
      makeSkuFixture(),
      M4_ACCOUNT_ID,
    );

    const byKey = byKeyPriceGroupStatements(executor);

    // CFML identifiers are case-INSENSITIVE and MySQL's default collation matches them that way, so
    // the two spellings name ONE stored row and must yield ONE entity - which is what Hibernate's
    // session identity guaranteed. The FIRST spelling seen is what is bound.
    expect(byKey).toHaveLength(1);
    expect(statementAtIndex(byKey, 0).sql).toContain('WHERE pg.priceGroupID IN (?)');
    expect(statementAtIndex(byKey, 0).params).toStrictEqual(['pg-a']);
  });

  it('★★ emits NO keyed statement at all for an account with no price groups', async () => {
    // The link read answers nothing, so there is no key set - and an empty key set must issue no
    // statement, because N members used to mean N statements and zero members meant zero. It also
    // prevents `IN ()`, a MySQL syntax error.
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    await scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
      makeSkuFixture(),
      M4_ACCOUNT_ID,
    );

    expect(byKeyPriceGroupStatements(executor)).toHaveLength(0);
    expect(executor.calls.map((call) => call.sql)).toContain(ACCOUNT_PRICE_GROUP_LINK_SQL);
  });

  it('★★★ preserves the association ORDER, which is observable through the tie rule', async () => {
    // [model/service/PriceGroupService.cfc:L355] compares STRICTLY less-than, so among candidates
    // that compute the SAME price the FIRST in the association wins. That makes the rebuilt order
    // observable end to end: two price groups with identical rates, and whichever the link table
    // named first is the answer. A loader that published the database's `IN (...)` row order instead
    // of the caller's list order could not pass both halves of this case.
    const sku = makeSkuFixture();

    function makeExecutorForLinkOrder(linkOrder: readonly string[]): CapturingExecutor {
      return new CapturingExecutor(
        new Map([
          [ACCOUNT_PRICE_GROUP_LINK_SQL, linkOrder.map((priceGroupID) => ({ priceGroupID }))],
        ]),
        [
          {
            fragment: PRICE_GROUP_BY_KEY_SET,
            // Deliberately returned in a FIXED order that is not the requested one, so the answer
            // cannot come from the statement's row order.
            rows: [m4PriceGroupRow('pg-first'), m4PriceGroupRow('pg-second')],
          },
          {
            fragment: 'FROM SwPriceGroupRate pgr',
            rows: [
              m4RateRow('pgr-first', 'pg-first', '25.00'),
              m4RateRow('pgr-second', 'pg-second', '25.00'),
            ],
          },
          {
            fragment: 'FROM SwPriceGroupRateSku',
            rows: [
              { priceGroupRateID: 'pgr-first', skuID: sku.getSkuID() },
              { priceGroupRateID: 'pgr-second', skuID: sku.getSkuID() },
            ],
          },
        ],
      );
    }

    const forwardScope = await makeScope(makeExecutorForLinkOrder(['pg-first', 'pg-second']));
    const forward =
      await forwardScope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
        sku,
        M4_ACCOUNT_ID,
      );

    const reversedScope = await makeScope(makeExecutorForLinkOrder(['pg-second', 'pg-first']));
    const reversed =
      await reversedScope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
        sku,
        M4_ACCOUNT_ID,
      );

    expect(forward.priceGroup?.getPriceGroupID()).toBe('pg-first');
    expect(reversed.priceGroup?.getPriceGroupID()).toBe('pg-second');
  });

  it('★★ still REFUSES a link row naming a price group SwPriceGroup does not contain', async () => {
    // A dangling link identifier is a foreign-key violation the `Sw*` schema forbids, and skipping it
    // would silently price an order as though the account had fewer price groups than it does. The
    // set-based loader reports nothing for a miss - by design, because each caller decides - so this
    // proves the refusal still lives at THIS caller.
    const executor = new CapturingExecutor(
      new Map([[ACCOUNT_PRICE_GROUP_LINK_SQL, [{ priceGroupID: 'pg-ghost' }]]]),
    );
    const scope = await makeScope(executor);

    await expect(
      scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount(
        makeSkuFixture(),
        M4_ACCOUNT_ID,
      ),
    ).rejects.toThrow(/pg-ghost/);
  });
});

describe('the SKU-creation option list is loaded as a SET, never one option at a time', () => {
  // ★★★ NET-NEW COVERAGE (AAP 0.6.6). `meta/tests/` carries no ProductService or SkuService test.

  /** Drive `saveProduct` on a NEW product, which is what reaches `createSkus` [L279]. */
  async function resolveOptions(optionIDList: string): Promise<CapturingExecutor> {
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    // `createSkus` raises on the first option the loader could not resolve, which every case here
    // provokes because no option row is scripted. That is the point of the assertion below: the
    // failure must come from `SkuService`, at the legacy locator, and not from the loader.
    await scope.productService
      .saveProduct(makeProductFixture({ productID: '' }), {
        options: optionIDList,
        price: Money.fromDecimalString('19.99'),
      })
      .catch(() => undefined);

    return executor;
  }

  it('★★★ emits ONE keyed statement for a four-element list, and no per-key statement at all', async () => {
    // `opt-b` appears twice and `OPT-A` differs from `opt-a` only in casing, so four elements reduce
    // to two placeholders - bound in FIRST-APPEARANCE order, which is the order
    // [model/service/SkuService.cfc:L73] iterates.
    const executor = await resolveOptions('opt-b,opt-a,opt-b,OPT-A');

    // `SwOption` is read ONCE in total - not once per element, and not once per distinct element.
    const optionReads = executor.calls.filter((call) => call.sql.includes(OPTION_READ));

    expect(optionReads).toHaveLength(1);
    expect(statementAtIndex(optionReads, 0).sql).toContain(OPTION_BY_KEY_SET);
    expect(statementAtIndex(optionReads, 0).sql).toContain('WHERE swOption.optionID IN (?, ?)');
    expect(statementAtIndex(optionReads, 0).params).toStrictEqual(['opt-b', 'opt-a']);

    // The negative. A per-identifier loop emitted the singular predicate twice; the set-based loader
    // never emits it at all from this path.
    expect(executor.calls.filter((call) => call.sql.includes(OPTION_BY_KEY_SINGULAR))).toHaveLength(
      0,
    );
  });

  it('★★ leaves an unresolvable option for SkuService to reject at the legacy locator', async () => {
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    // The loader answers no row and reports nothing; the identifier is simply absent from
    // `resolvedOptions`. `SkuService.resolveOptionByID` is what raises, citing
    // [model/service/SkuService.cfc:L74] - reporting the miss in the composition root instead would
    // move a documented failure away from the line that documents it.
    await expect(
      scope.productService.saveProduct(makeProductFixture({ productID: '' }), {
        options: 'opt-missing',
        price: Money.fromDecimalString('19.99'),
      }),
    ).rejects.toThrow(/model\/service\/SkuService\.cfc:L74/);
  });

  it('★★ emits NO keyed statement when the payload names no option', async () => {
    const executor = new CapturingExecutor();
    const scope = await makeScope(executor);

    await scope.productService
      .saveProduct(makeProductFixture({ productID: '' }), {
        price: Money.fromDecimalString('19.99'),
      })
      .catch(() => undefined);

    // An empty key set issues no statement, which is both faithful - zero members used to mean zero
    // reads - and necessary, because `IN ()` is a MySQL syntax error.
    expect(executor.calls.filter((call) => call.sql.includes(OPTION_READ))).toHaveLength(0);
  });
});

describe('the price-group projection between the two passes loads its intents as a SET', () => {
  // ★★★ NET-NEW COVERAGE (AAP 0.6.6). The projection step itself has no legacy antecedent - it stands
  // in for the in-place writes at [model/service/PriceGroupService.cfc:L370-L371] that the
  // anti-corruption inversion cannot perform - so everything asserted here is new.

  const PROJECTION_ACCOUNT_ID = 'acct-projection';

  /**
   * Two account price groups, each with a rate that matches exactly one of the golden order's SKUs,
   * so pass one emits two intents naming two DIFFERENT price groups. One distinct group would prove
   * nothing: the superseded loop de-duplicated too, and would also have issued one statement.
   */
  function makeProjectionExecutor(
    firstSkuID: string,
    secondSkuID: string,
    byKeySetTimes?: number,
  ): CapturingExecutor {
    return new CapturingExecutor(
      new Map([
        [ACCOUNT_PRICE_GROUP_LINK_SQL, [{ priceGroupID: 'pg-one' }, { priceGroupID: 'pg-two' }]],
      ]),
      [
        {
          fragment: PRICE_GROUP_BY_KEY_SET,
          rows: [m4PriceGroupRow('pg-one'), m4PriceGroupRow('pg-two')],
          ...(byKeySetTimes === undefined ? {} : { times: byKeySetTimes }),
        },
        {
          fragment: 'FROM SwPriceGroupRate pgr',
          rows: [m4RateRow('pgr-one', 'pg-one', '50.00'), m4RateRow('pgr-two', 'pg-two', '40.00')],
        },
        {
          fragment: 'FROM SwPriceGroupRateSku',
          rows: [
            { priceGroupRateID: 'pgr-one', skuID: firstSkuID },
            { priceGroupRateID: 'pgr-two', skuID: secondSkuID },
          ],
        },
      ],
    );
  }

  it('★★★ emits ONE keyed statement for two distinct intent price groups', async () => {
    const order = makeOrderViewFixture({ accountID: PROJECTION_ACCOUNT_ID });
    const firstSkuID = order.orderItems[0]?.sku.getSkuID() ?? '';
    const secondSkuID = order.orderItems[1]?.sku.getSkuID() ?? '';

    const executor = makeProjectionExecutor(firstSkuID, secondSkuID);
    const scope = await makeScope(executor);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    // Pass one really did emit two intents naming two different groups; without that the assertion
    // below would be vacuous.
    expect(result.priceGroupIntents).toHaveLength(2);
    expect(new Set(result.priceGroupIntents.map((intent) => intent.priceGroupID))).toStrictEqual(
      new Set(['pg-one', 'pg-two']),
    );

    const byKey = byKeyPriceGroupStatements(executor);

    // Two by-key statements in total, and BOTH are set-based: the association read that opened pass
    // one, and the projection read between the passes. Neither is a per-identifier read.
    expect(byKey).toHaveLength(2);
    expect(statementAtIndex(byKey, 1).sql).toContain('WHERE pg.priceGroupID IN (?, ?)');
    expect(statementAtIndex(byKey, 1).params).toStrictEqual(['pg-one', 'pg-two']);
    expect(
      executor.calls.filter((call) => call.sql.includes(PRICE_GROUP_BY_KEY_SINGULAR)),
    ).toHaveLength(0);

    // And the projection did its job: both items carry the price and the entity pass two reads at
    // [model/service/PromotionService.cfc:L241].
    const projectedFirst = result.pricedOrder.orderItems[0];

    expect(projectedFirst?.appliedPriceGroup?.getPriceGroupID()).toBe('pg-one');
  });

  it('★★ still REFUSES an intent whose price group cannot be loaded', async () => {
    // The by-key answer is budgeted to ONE read, so the association read at the start of pass one
    // succeeds and the projection read between the passes finds nothing - a row deleted in between.
    // Dropping the intent instead of refusing would move the L241 discriminator to the other arm and
    // change the discount, so the refusal is load-bearing.
    const order = makeOrderViewFixture({ accountID: PROJECTION_ACCOUNT_ID });
    const firstSkuID = order.orderItems[0]?.sku.getSkuID() ?? '';
    const secondSkuID = order.orderItems[1]?.sku.getSkuID() ?? '';

    const scope = await makeScope(makeProjectionExecutor(firstSkuID, secondSkuID, 1));

    // Matched on the PROJECTION's own wording, not merely on "it threw". `hydrateByIdentifier`
    // refuses a miss too, with a different message, so a loose matcher could pass on the wrong
    // refusal - which is exactly what a per-identifier loop here would produce.
    await expect(scope.updateOrderAmountsWithPriceGroupsThenPromotions(order)).rejects.toThrow(
      /named by a price-group intent could not be loaded/,
    );
  });
});
