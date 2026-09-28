// slatwall-ts - tests/unit/integrations/google/googleFeedRepository.test.ts.
//
// src/integrations/google/googleFeedRepository.ts - the data-access half of the Google
// product-feed adapter.
//
// CFML parity [meta/tests/unit/Helper.cfc:L51-L67]: the legacy harness is followed as a PATTERN
// and rejected as a MECHANISM. The pattern kept is a named factory holding obviously-fake defaults
// that a case overrides in one place.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: that factory declares its data structure without a
// local scope, leaking it into the component.

import { describe, expect, it } from 'vitest';

import { GoogleFeedRepository } from '../../../../src/integrations/google/googleFeedRepository.js';
import type { PreparedStatementExecutor } from '../../../../src/repositories/mysql/connection.js';
import { SQL_TUPLE_ROW_LIMIT } from '../../../../src/repositories/mysql/connection.js';
import type {
  GoogleFeedSalePriceSource,
  GoogleFeedValueRounder,
  GoogleProductFeedRow,
  ResolvedFeedSettingValues,
  ResolvedSkuShippingWeightSetting,
  SkuFeedSettingResolver,
  SkuFeedSettingSubject,
} from '../../../../src/integrations/google/googleFeedRepository.js';
import type { SalePricePromotionRewardRow } from '../../../../src/domain/ports/promotionRepository.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';

// The row shape the double hands back.
//
// Declared structurally rather than imported, which keeps this suite free of any dependency on the
// connection module and therefore free of the driver.

type DriverRow = Readonly<Record<string, unknown>>;

/**
 * One captured call, exactly as the subject made it.
 */
interface RecordedStatement {
  readonly sql: string;
  /**
   * Absent when the subject bound nothing, which is itself an assertion below.
   */
  readonly params: readonly unknown[] | undefined;
}

/**
 * Which of the subject's three statements a captured call is.
 */
type StatementKind = 'selection' | 'ancestry' | 'images';

/**
 * Classifies a captured statement by a fragment unique to it.
 *
 * The recursive ancestry statement is the only one that opens a common table expression, and the
 * image statement is the only one that reads the image table.
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

/**
 * What the double answers for each of the three statements.
 */
interface StatementResponses {
  readonly selection: readonly DriverRow[];
  readonly ancestry: readonly DriverRow[];
  readonly images: readonly DriverRow[];
}

/**
 * The only collaborator any case here uses: a recording test double that captures every statement
 * and every bound array and answers with canned rows.
 *
 * It implements the subject's executor contract STRUCTURALLY - three members, matching signatures
 * so nothing from the connection module is imported and no pool.
 */
class RecordingExecutor {
  /**
   * Every captured call, in the order the subject made them.
   */
  readonly captured: RecordedStatement[] = [];

  /**
   * Every data-modifying statement attempted. Expected to stay empty.
   */
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

  /**
   * Every entry into `transaction`, keyed by how many statements had been captured when it
   * happened. Expected to stay EMPTY: the feed only reads.
   */
  readonly transactionEntries: number[] = [];

  /**
   * How many times a transaction was attempted. Expected to stay ZERO forever.
   */
  transactionAttempts = 0;

  /**
   * Refuse a transaction, for the same reason `executeMutation` refuses.
   *
   * A working no-op - `transactionEntries.push(...)` then `return work(this)` - would make this
   * double structurally interchangeable with the real executor and hide the fact that the
   * product-feed repository never opens one.
   */
  transaction(): Promise<never> {
    this.transactionEntries.push(this.captured.length);
    this.transactionAttempts += 1;

    throw new Error(
      'the product-feed repository must never open a transaction: it performs one read and ' +
        'issues no data-modifying statement for a transaction to protect',
    );
  }
}

// Fixtures, declared inline. The one sale-price double this file needs is
// `RecordingSalePriceSource`, declared further down: it asks once for every product and keys the
// winners per SKU, which is the shape the subject consumes.
//
//
// No sibling fixture module applies: the five that exist build entities and order views, and not
// one of them produces a feed-row projection or a driver row.

/**
 * The three resolved setting values the subject's constructor takes.
 *
 * The image prefix is host-relative on purpose: the legacy view prepends the scheme and host itself,
 * so a repository that produced an absolute address would be doing the renderer's job.
 *
 * Shipping weights are NOT among them. They resolve per SKU through `makeShippingWeightResolver`
 * below, because the legacy resolves them inside its own row loop.
 */
function makeSettingValues(
  overrides: Partial<ResolvedFeedSettingValues> = {},
): ResolvedFeedSettingValues {
  return {
    globalURLKeyProduct: overrides.globalURLKeyProduct ?? 'fake-url-key',
    baseImageURL: overrides.baseImageURL ?? '/fake-image-base',
    missingImagePath: overrides.missingImagePath ?? '/fake-missing-image.jpg',
  };
}

/**
 * The default shipping weight this suite's resolver answers with.
 */
const FAKE_SHIPPING_WEIGHT = '3.500';

/**
 * The default shipping-weight unit this suite's resolver answers with.
 */
const FAKE_SHIPPING_WEIGHT_UNIT = 'fakeunit';

/**
 * A shipping-weight resolver that records what it was asked and answers per SKU.
 *
 * `answers` maps a SKU identifier to the pair that SKU should receive; any SKU not named there
 * receives the two defaults above.
 */
class RecordingShippingWeightResolver implements SkuFeedSettingResolver {
  readonly calls: (readonly SkuFeedSettingSubject[])[] = [];

  private readonly answers: ReadonlyMap<string, ResolvedSkuShippingWeightSetting | undefined>;

  constructor(
    answers: ReadonlyMap<string, ResolvedSkuShippingWeightSetting | undefined> = new Map(),
  ) {
    this.answers = answers;
  }

  async resolveSkuShippingWeightSettings(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, ResolvedSkuShippingWeightSetting>> {
    this.calls.push(subjects);

    const resolved = new Map<string, ResolvedSkuShippingWeightSetting>();

    for (const subject of subjects) {
      if (this.answers.has(subject.skuID)) {
        const answer = this.answers.get(subject.skuID);

        if (answer !== undefined) {
          resolved.set(subject.skuID, answer);
        }

        continue;
      }

      resolved.set(subject.skuID, {
        skuShippingWeight: FAKE_SHIPPING_WEIGHT,
        skuShippingWeightUnitCode: FAKE_SHIPPING_WEIGHT_UNIT,
      });
    }

    return await Promise.resolve(resolved);
  }
}

/**
 * A sale-price source that records its arguments and answers with canned rows.
 */
class RecordingSalePriceSource implements GoogleFeedSalePriceSource {
  /**
   * One entry per call, holding the `productID` argument as received.
   */
  readonly calls: (string | undefined)[] = [];

  private readonly rows: readonly SalePricePromotionRewardRow[];

  constructor(rows: readonly SalePricePromotionRewardRow[] = []) {
    this.rows = rows;
  }

  async getSalePricePromotionRewardsQuery(
    productID?: string,
  ): Promise<SalePricePromotionRewardRow[]> {
    this.calls.push(productID);

    return await Promise.resolve([...this.rows]);
  }
}

/**
 * A rounder that records every rounding it was asked to perform.
 *
 * It answers with a fixed, obviously-different value so that a case can tell a ROUNDED price from
 * an unrounded one without reimplementing the rounding algorithm.
 */
class RecordingValueRounder implements GoogleFeedValueRounder {
  /**
   * One entry per call: the value handed in and the rule identifier.
   */
  readonly calls: { readonly value: string; readonly roundingRuleID: string }[] = [];

  private readonly result: Money;

  constructor(result: Money = Money.fromDecimalString('9.99')) {
    this.result = result;
  }

  async roundValueByRoundingRuleID(value: Money, roundingRuleID: string): Promise<Money> {
    this.calls.push({ value: value.toFixed2(), roundingRuleID });

    return await Promise.resolve(this.result);
  }
}

/**
 * One winning sale-price reward row, carrying every member the subject reads.
 */
function makeSalePriceRewardRow(
  overrides: Partial<SalePricePromotionRewardRow> = {},
): SalePricePromotionRewardRow {
  return {
    skuID: overrides.skuID ?? 'fake-sku-id-1',
    discountLevel: overrides.discountLevel ?? 'sku',
    salePriceDiscountType: overrides.salePriceDiscountType ?? 'amount',
    salePrice: overrides.salePrice ?? Money.fromDecimalString('12.34'),
    promotionID: overrides.promotionID ?? 'fake-promotion-id-1',
    ...(Object.hasOwn(overrides, 'roundingRuleID')
      ? { roundingRuleID: overrides.roundingRuleID }
      : {}),
    ...(Object.hasOwn(overrides, 'salePriceExpirationDateTime')
      ? { salePriceExpirationDateTime: overrides.salePriceExpirationDateTime }
      : {}),
    ...(Object.hasOwn(overrides, 'originalPrice')
      ? { originalPrice: overrides.originalPrice }
      : {}),
  };
}

/**
 * One driver row for the feed selection, carrying every column the subject reads.
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
    // `brandID` is `SwProduct.brandID`, the FOREIGN KEY as the product row carries it, and it is
    // what the setting-lookup path `product.brand.brandID` [model/service/SettingService.cfc:L519]
    // needs.
    //
    // The default models a MATCHED left join
    // [integrationServices/google/controllers/feed.cfc:L66], so all three are populated.
    brandID: 'fake-brand-id-1',
    joinedBrandID: 'fake-brand-id-1',
    brandName: 'Fake Brand',
    ...overrides,
  };
}

/**
 * One driver row for the recursive product-type ancestry statement.
 *
 * It carries `productTypeDescription` now, and the selection row no longer does.
 */
function makeAncestryRow(overrides: DriverRow = {}): DriverRow {
  const named: DriverRow = {
    leafProductTypeID: 'fake-product-type-id-1',
    productTypeName: 'Fake Leaf Type',
    productTypeDescription: 'Fake product type description.',
    ancestorDistance: 0,
    ...overrides,
  };

  // `ancestorProductTypeID` DEFAULTS from the DISTANCE, so an ordinary multi-row fixture reads as
  // a chain of distinct ancestors rather than as a cycle.
  return { ancestorProductTypeID: `fake-ancestor-id-${String(named.ancestorDistance)}`, ...named };
}

/**
 * One driver row for the additional-images statement.
 */
function makeImageRow(overrides: DriverRow = {}): DriverRow {
  return {
    productID: 'fake-product-id-1',
    imageDirectory: 'fake-directory',
    imageFile: 'fake-image.jpg',
    ...overrides,
  };
}

// The strict profile treats every indexed read as possibly absent, and this suite honours that the
// same way the subject does: by NARROWING, never by asserting an index away.

/**
 * The single captured statement of one kind, proving there is exactly one.
 */
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

/**
 * The captured statement at an ordinal, for asserting the order of the three.
 */
function statementAt(recorder: RecordingExecutor, index: number): RecordedStatement {
  const call = recorder.captured[index];

  if (call === undefined) {
    throw new Error(`the subject issued no statement at position ${String(index)}`);
  }

  return call;
}

/**
 * The bound array of a statement, proving the subject bound something at all.
 */
function boundParameters(statement: RecordedStatement): readonly unknown[] {
  const { params } = statement;

  if (params === undefined) {
    throw new Error('the statement bound nothing, so there is no parameter array to assert on');
  }

  return params;
}

/**
 * One projected row, narrowed from a possibly-shorter result than expected.
 */
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

/**
 * One resolved image path, narrowed the same way.
 */
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

// The subject's statements are module constants and are deliberately not exported, so the only
// honest way to assert them is to read what the double captured.

/**
 * Non-overlapping occurrences of a plain fragment.
 */
function occurrencesOf(text: string, fragment: string): number {
  let count = 0;
  let index = text.indexOf(fragment);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(fragment, index + fragment.length);
  }

  return count;
}

/**
 * Matches of a global pattern, with no match counted as zero rather than nothing.
 */
function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Every distinct physical table identifier a statement names, sorted.
 */
function schemaIdentifiers(sql: string): readonly string[] {
  return [...new Set(sql.match(/\bSw[A-Za-z]+\b/g) ?? [])].sort();
}
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

/**
 * The subject's whole issued statement text, for suite-wide absence checks.
 */
function allStatements(recorder: RecordingExecutor): string {
  return recorder.captured.map((call) => call.sql).join('\n');
}

/**
 * The three non-executor collaborators a case may want to pre-build.
 *
 * Each is optional because most cases care about the statements the subject issues and not about
 * the collaborators at all.
 */
interface FeedCollaborators {
  readonly shippingWeights?: RecordingShippingWeightResolver;
  readonly salePrices?: RecordingSalePriceSource;
  readonly rounder?: RecordingValueRounder;
}

/**
 * Runs the subject once against a double primed with the given responses.
 *
 * This helper once constructed the subject with two arguments.
 */
async function runFeed(
  responses: Partial<StatementResponses> = {},
  settingOverrides: Partial<ResolvedFeedSettingValues> = {},
  collaborators: FeedCollaborators = {},
): Promise<{
  readonly recorder: RecordingExecutor;
  readonly rows: readonly GoogleProductFeedRow[];
  readonly shippingWeights: RecordingShippingWeightResolver;
  readonly salePrices: RecordingSalePriceSource;
  readonly rounder: RecordingValueRounder;
}> {
  const recorder = new RecordingExecutor(responses);
  const shippingWeights = collaborators.shippingWeights ?? new RecordingShippingWeightResolver();
  const salePrices = collaborators.salePrices ?? new RecordingSalePriceSource();
  const rounder = collaborators.rounder ?? new RecordingValueRounder();
  const repository = new GoogleFeedRepository(
    recorder,
    makeSettingValues(settingOverrides),
    shippingWeights,
    salePrices,
    rounder,
  );
  const rows = await repository.fetchProductFeedRows();

  return { recorder, rows, shippingWeights, salePrices, rounder };
}

/**
 * Constructs the subject with throwaway collaborators, for cases that ignore them.
 */
function makeRepository(
  executor: PreparedStatementExecutor,
  settingOverrides: Partial<ResolvedFeedSettingValues> = {},
): GoogleFeedRepository {
  return new GoogleFeedRepository(
    executor,
    makeSettingValues(settingOverrides),
    new RecordingShippingWeightResolver(),
    new RecordingSalePriceSource(),
    new RecordingValueRounder(),
  );
}

// The legacy statement this port could not transcribe.
//
// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75]: the feed DAO's only
// method was never executed even once, and could not have been.
// Preserved deliberately; do not fix without a product decision.
//
// CFML parity [integrationServices/google/model/dao/FeedDAO.cfc:L53]: the unscoped result variable
// is deliberately not reproduced.
//
// CFML parity [integrationServices/google/model/dao/FeedDAO.cfc:L55]: the missing datasource
// attribute is deliberately not reproduced either.

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

    // Eighteen aliased columns in the select list, against the dead statement's two. The list is
    // bounded explicitly so the one table alias further down the statement is not counted as a
    // column.
    //
    // The count was seventeen and is eighteen: `SwBrand.brandID` was added so the brand element
    // can be gated on the ASSOCIATION rather than on the name.
    const selectList = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM SwSku'));

    expect(countMatches(selectList, /\bAS\s+\w+/g)).toBe(18);

    // Both columns the dead statement did name are present, so nothing was lost by declining to
    // transcribe it.
    expect(sql).toContain('SwSku.skuCode');
    expect(sql).toContain('SwProduct.calculatedTitle');
  });

  it("carries no trace of the dead statement's own predicate spelling", async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });

    // [integrationServices/google/model/dao/FeedDAO.cfc:L71] spelled the quantity test `> 0`. The
    // live path did not, and the live path is what ran.
    expect(allStatements(recorder)).not.toContain('> 0');
  });

  it('hydrates a complete row from the live column set, which the dead one could not', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // The dead statement offered a code and a title. The projection offers the whole feed
    // vocabulary, which is the practical measure of the difference.
    expect(row.skuCode).toBe('FAKE-SKU-1');
    expect(row.calculatedTitle).toBe('Fake Product Title');
    expect(Object.keys(row)).toHaveLength(23);
  });
});

// The collaborator the legacy controller never used.

describe('the never-read legacy collaborator is flagged and no use is invented for it', () => {
  it('takes exactly five collaborators, none of them a product service', () => {
    // [integrationServices/google/controllers/feed.cfc:L51] declares a product service alongside
    // the SKU service at L52, and the body at L58-L73 reads only the SKU service, at L63. The
    // declaration is dead.
    expect(GoogleFeedRepository.length).toBe(5);

    const repository = new GoogleFeedRepository(
      new RecordingExecutor(),
      makeSettingValues(),
      new RecordingShippingWeightResolver(),
      new RecordingSalePriceSource(),
      new RecordingValueRounder(),
    );

    expect(Object.getOwnPropertyNames(repository).sort()).toStrictEqual([
      'executor',
      'salePriceSource',
      'settingValues',
      'skuSettingResolver',
      'valueRounder',
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

// What the live entrypoint was, and what was deliberately not invented from it.

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
    const repository = makeRepository(recorder);
    const rows = await repository.fetchProductFeedRows();

    // The legacy member's whole observable effect was an assignment onto the request context it
    // was handed. Here the result is the return value, so there is nothing to hand in and nothing
    // to inspect afterwards.
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('renders nothing, because rendering belongs to the renderer and not to a repository', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // No element name, no markup and no document reaches this layer. What it produces is the
    // values the renderer will need, each already resolved.
    for (const value of Object.values(row)) {
      expect(typeof value).not.toBe('function');
    }

    expect(row.calculatedTitle).not.toMatch(/</);
    expect(row.productUrlPath).not.toMatch(/</);
  });
});

describe("the three legacy joins are reproduced, with the framework's own join semantics", () => {
  it('joins the product table inner, and the other two tables outer', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // Verified against the framework source rather than inferred: an empty join type is rewritten
    // to `left` before HQL is emitted
    // [org/Hibachi/HibachiSmartList.cfc:L538-L541, emitted at L549].
    expect(occurrencesOf(sql, 'INNER JOIN')).toBe(1);
    expect(occurrencesOf(sql, 'LEFT JOIN')).toBe(2);
    expect(occurrencesOf(sql, 'JOIN')).toBe(3);
    expect(sql).toContain('INNER JOIN SwProduct');
  });

  it('joins the default SKU as an outer self-join, which is what makes a product price absent', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // [integrationServices/google/controllers/feed.cfc:L65] joins `defaultSku`, not a product
    // type. The alias is what lets one table serve both roles.
    expect(sql).toContain('LEFT JOIN SwSku AS defaultSku');
    expect(sql).toContain('ON defaultSku.skuID = SwProduct.defaultSkuID');
    expect(sql).toContain('defaultSku.price');
  });

  it("joins the brand outer, which is the legacy's one explicit join type", async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // [integrationServices/google/controllers/feed.cfc:L66] passes `"left"` as the third
    // positional argument, which the framework signature names `joinType`
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
    // [integrationServices/google/views/feed/product.cfm:L19, L21].
    expect(row.productTypeDescription).toBe('Fake product type description.');
    expect(row.productTypeSimpleRepresentation).toBe('Fake Leaf Type');
  });

  it('resolves both product-type values from the ancestry statement, not from a fourth join', async () => {
    const withoutAncestry = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [],
    });
    const { recorder, rows } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow({ productTypeDescription: 'From the ancestry walk.' })],
    });

    // An absent ancestry row leaves both product-type projections undefined; a present one
    // supplies both. The two runs are separated on exactly that basis.
    expect(withoutAncestry.rows[0]?.productTypeDescription).toBeUndefined();
    expect(withoutAncestry.rows[0]?.productTypeSimpleRepresentation).toBeUndefined();
    expect(rowAt(rows, 0).productTypeDescription).toBe('From the ancestry walk.');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Fake Leaf Type');
    expect(statementOfKind(recorder, 'selection').sql).not.toContain('SwProductType');
    expect(statementOfKind(recorder, 'ancestry').sql).toContain('SwProductType');
  });
});

// The four predicates.

describe('exactly four predicates are reproduced, and no fifth is invented', () => {
  it('constrains the selection with one WHERE clause holding four conditions', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // Three filters and one range, from [integrationServices/google/controllers/feed.cfc:L68-L72].
    // Four conditions are joined by three conjunctions, and there is no disjunction at all.
    expect(countMatches(sql, /\bWHERE\b/g)).toBe(1);
    expect(countMatches(sql, /\bAND\b/g)).toBe(3);
    expect(countMatches(sql, /\bOR\b/g)).toBe(0);
  });

  it('requires an active SKU, from the first legacy filter', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwSku.activeFlag = 1');
  });

  it('requires an active product, from the second legacy filter', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwProduct.activeFlag = 1');
  });

  it('requires a published product, from the third legacy filter', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    expect(statementOfKind(recorder, 'selection').sql).toContain('SwProduct.publishedFlag = 1');
  });
  it('requires a positive quantity available to sell, spelled as the live path spelled it', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    expect(sql).toContain('SwProduct.calculatedQATS >= 1');
    expect(sql).not.toContain('SwProduct.calculatedQATS > 0');
  });

  it('adds no predicate on anything the legacy chain never tested', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // The legacy chain tested four things and nothing else. A brand condition, a product-type
    // condition, a date window or a code condition would each be a fifth predicate the feed never
    // had.
    //
    // The product-type half of this is now true for a second reason.
    expect(sql).not.toMatch(/WHERE[\s\S]*SwBrand\./);
    expect(sql).not.toMatch(/WHERE[\s\S]*SwProductType\./);
    expect(sql).toContain('SwProduct.productTypeID');
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

    // No post-filtering pass exists. Whatever the four conditions admitted is what the caller
    // receives, one projected row per selected row.
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

    // The four filtered columns are projected as well as filtered, which is what lets a consumer
    // verify the invariant from the data and not only from the statement text.
    expect(row.skuActiveFlag).toBe(true);
    expect(row.productActiveFlag).toBe(true);
    expect(row.productPublishedFlag).toBe(true);
    expect(row.productCalculatedQATS).toBe(7);
  });
});

// Nothing the legacy did not have.

describe('the four filters are hard-coded, and the query surface offers no way to widen them', () => {
  it('accepts no argument at all on the one public query method', async () => {
    const recorder = new RecordingExecutor({ selection: [makeSelectionRow()] });
    const repository = makeRepository(recorder);

    // The type-level half of the guarantee.
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

    // [integrationServices/google/controllers/feed.cfc:L58-L73] never calls the ordering method,
    // so feed item order was whatever the store returned. Imposing an order would add behaviour
    // the legacy never had.
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

    // An empty selection is an ordinary state - the legacy rendered a feed with no items - and it
    // needs no follow-up statement. Neither lookup is issued, and no placeholder list is built for
    // zero keys.
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

    // The order is a data dependency rather than a preference: both follow-up lookups are keyed on
    // identifiers the selection produced, so neither can run before it.
    expect(recorder.captured.map((call) => classifyStatement(call.sql))).toStrictEqual([
      'selection',
      'ancestry',
      'images',
    ]);
  });
});

// Statement construction and parameter forwarding.
//
// The legacy source contains ZERO parameter declarations - the dead DAO inlines every literal at
// [integrationServices/google/model/dao/FeedDAO.cfc:L65-L71].

describe('every value is bound positionally, and no value is ever written into a statement', () => {
  it('binds nothing on the selection, because not one of its conditions comes from a caller', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const selection = statementOfKind(recorder, 'selection');

    // The four conditions are fixed by the feed contract.
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

    // Three SKUs of one product need one key, not three.
    expect(boundParameters(images)).toStrictEqual(['fake-shared-product']);
    expect(occurrencesOf(images.sql, '?')).toBe(boundParameters(images).length);
  });

  it('forwards a hostile identifier as a bound value and never as statement text', async () => {
    const hostileIdentifier = "fake-type'); DROP TABLE SwProduct; --";

    const { recorder } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: hostileIdentifier })],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // This is the whole substance of the hardening.
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

    // No member of the presentation contract reaches a WHERE clause, which is exactly why
    // accepting it cannot widen the four-filter invariant.
    expect(allStatements(second.recorder)).toBe(allStatements(first.recorder));
    expect(allStatements(first.recorder)).not.toContain('fake-key-one');
    expect(allStatements(second.recorder)).not.toContain('fake-base-two');
  });

  it('reads only through the injected collaborator, and never through a shared connection', async () => {
    const recorder = new RecordingExecutor({ selection: [makeSelectionRow()] });
    const repository = makeRepository(recorder);

    // Constructor injection is the mechanism, and this suite is the proof: a hand-written double
    // with exactly three members satisfies the collaborator contract outright, so nothing was
    // reached for beyond it.
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
    // [integrationServices/google/views/feed/product.cfm:L30].
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

    // Three in-scope legacy statements elsewhere do branch on the database product; this one does
    // not, so nothing dialect-specific may appear here.
    expect(sql).not.toContain('||');
    expect(sql).not.toContain('[');
    expect(sql).not.toMatch(/\bNVL\s*\(/i);
    expect(sql).not.toMatch(/\bISNULL\s*\(/i);
    expect(sql).not.toMatch(/\bGETDATE\s*\(/i);
  });
});

describe('the existing tables are read exactly as they are, with nothing added or renamed', () => {
  it('names only the five tables the feed genuinely needs', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    // Four for the selection and its joins, one for the product images. Every one is an existing
    // physical table and each corresponds to a verified entity-to-table mapping.
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

    // The dead DAO wrote a tag-syntax statement, so it correctly named physical tables too
    // [integrationServices/google/model/dao/FeedDAO.cfc:L61-L63].
    expect(sql).toContain('FROM SwSku');
    expect(tableReferences(sql)).toStrictEqual(['SwBrand', 'SwProduct', 'SwSku']);
  });

  it('issues no statement that could change the schema or its contents', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const sql = allStatements(recorder);

    // No migration, no rename and no column change: the port reads and writes the existing tables
    // unchanged, and this repository only reads.
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

    // Image rows can belong to something other than a product, so keying on the product identifier
    // selects exactly the association the view iterated
    // [integrationServices/google/views/feed/product.cfm:L24].
    expect(sql).toContain('WHERE SwImage.productID IN');
  });
});

/**
 * One amount, narrowed rather than asserted, with the field named on failure.
 */
function moneyOf(value: Money | undefined, label: string): Money {
  if (value === undefined) {
    throw new Error(`the projection carries no ${label}, so there is no amount to assert on`);
  }

  return value;
}

/**
 * A driver row with one column removed, for proving an absent KEY is not tolerated.
 */
function withoutColumn(row: DriverRow, columnName: string): DriverRow {
  const kept: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key !== columnName) {
      kept[key] = value;
    }
  }

  return kept;
}

/**
 * Every member the projection contract names, sorted for a stable comparison.
 *
 * The renderer gates `<g:brand>` on brand PRESENCE
 * [integrationServices/google/views/feed/product.cfm:L32] and the name is only the body, so
 * presence needs a carrier of its own.
 */
const PROJECTION_MEMBERS: readonly string[] = [
  'additionalImageLinkPaths',
  'brandID',
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

    // Reproducing four entity classes with their injected ports, just to read about seventeen
    // scalars off them.
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

    // [integrationServices/google/views/feed/product.cfm:L27] emits the PRODUCT's price, while L28
    // gates the sale block on the SKU's own price against the SKU's sale price.
    expect(moneyOf(row.productPrice, 'product price').toDecimalString()).toBe('24.5');
    expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('19.99');
    expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('19.99');

    // And with no promotion the two members hold the same value object, which is stated rather
    // than worked around: the fallback hands the SKU price straight through, and `Money` is
    // immutable.
    expect(row.skuSalePrice).toBe(row.skuPrice);

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

    // The driver hands back an exact decimal string and it goes straight into the value object.
    // Every digit survives, which is the property a float cannot offer at this boundary.
    expect(row.productPrice).toBeInstanceOf(Money);
    expect(row.skuPrice).toBeInstanceOf(Money);
    expect(moneyOf(row.productPrice, 'product price').toDecimalString()).toBe('1000000.005');
    expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('0.01');
  });

  it('refuses a price that arrives as a number rather than absorbing it', async () => {
    // Accepting a number here would route currency through a float, silently, at the one boundary
    // that must never do so. It is refused instead, so a changed driver option surfaces rather
    // than corrupting money.
    await expect(runFeed({ selection: [makeSelectionRow({ skuPrice: 19.99 })] })).rejects.toThrow(
      /must arrive as a decimal string/,
    );
  });

  it('carries both shipping-weight values as plain strings, because a weight is not money', async () => {
    // This case once passed both values as setting overrides.
    const shippingWeights = new RecordingShippingWeightResolver(
      new Map([
        ['fake-sku-id-1', { skuShippingWeight: '12.750', skuShippingWeightUnitCode: 'fakeunit' }],
      ]),
    );
    const { rows } = await runFeed({ selection: [makeSelectionRow()] }, {}, { shippingWeights });
    const row = rowAt(rows, 0);

    // [integrationServices/google/views/feed/product.cfm:L58] emits the two halves separated by
    // one space. They are a measure, not an amount, so neither becomes a money value and neither
    // becomes a number.
    expect(row.skuShippingWeight).toBe('12.750');
    expect(row.skuShippingWeightUnitCode).toBe('fakeunit');
    expect(typeof row.skuShippingWeight).toBe('string');
    expect(typeof row.skuShippingWeightUnitCode).toBe('string');
    expect(row.skuShippingWeight).not.toBeInstanceOf(Money);
  });

  it('takes the weight values from the resolved contract rather than from a column', async () => {
    const shippingWeights = new RecordingShippingWeightResolver(
      new Map([
        ['fake-sku-id-1', { skuShippingWeight: '99.001', skuShippingWeightUnitCode: 'fakeother' }],
      ]),
    );
    const { recorder, rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      {},
      { shippingWeights },
    );

    // Projection data instead." Both halves of that were true and the conclusion it drew - resolve
    // them once, outside, and hand them in as constructor data - was not.
    expect(rowAt(rows, 0).skuShippingWeight).toBe('99.001');
    expect(allStatements(recorder)).not.toContain('99.001');
    expect(allStatements(recorder)).not.toContain('skuShippingWeight');
  });

  it('treats the brand name as genuinely optional, matching the outer join', async () => {
    const withBrand = await runFeed({
      selection: [makeSelectionRow({ brandName: 'Fake Brand Name' })],
    });
    const withoutBrand = await runFeed({ selection: [makeSelectionRow({ brandName: null })] });

    // The outer join at [integrationServices/google/controllers/feed.cfc:L66] is what makes the
    // view's brand guard at [integrationServices/google/views/feed/product.cfm:L32] meaningful: a
    // product with no brand still appears in the feed.
    expect(rowAt(withBrand.rows, 0).brandName).toBe('Fake Brand Name');
    expect(rowAt(withoutBrand.rows, 0).brandName).toBeUndefined();
    expect(withoutBrand.rows).toHaveLength(1);
  });

  it('keeps the quantity a number and the three flags booleans', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productCalculatedQATS: 42, productPublishedFlag: 0 })],
    });
    const row = rowAt(rows, 0);

    // The quantity column is a non-monetary integer, so it stays a number and never becomes a
    // money value.
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

    // A boolean-mapped column can arrive as a bit buffer, a number, a string or null depending on
    // how the column and the driver are configured.
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
    // An absent key and a null value are different faults.
    await expect(
      runFeed({ selection: [withoutColumn(makeSelectionRow(), 'brandName')] }),
    ).rejects.toThrow(/carries no column named "brandName"/);
  });
});

// Absence is modelled as absence.

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
          // Both brand columns, because they are two columns and only the joined one reaches
          // `row.brandID`. Nulling the raw foreign key alone would leave the join resolved and the
          // member populated.
          brandID: null,
          joinedBrandID: null,
          brandName: null,
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
    expect(row.productPrice).toBeUndefined();
    expect(row.skuPrice).toBeUndefined();
    expect(row.brandID).toBeUndefined();
    expect(row.brandName).toBeUndefined();
    expect(row.productCode).toBeUndefined();
    expect(row.imageLinkPath).toBe('/fake-missing-image.jpg');
  });

  it('never substitutes zero for an absent price', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productPrice: null, skuPrice: null })],
    });
    const row = rowAt(rows, 0);

    // The shared zero constant exists for a different purpose entirely, and using it as a fallback
    // anywhere in this path would sell products for free.
    expect(row.productPrice).not.toBe(Money.zero);
    expect(row.productPrice).not.toBeInstanceOf(Money);
    expect(row.skuPrice).not.toBe(Money.zero);
    expect(row.skuPrice).not.toBeInstanceOf(Money);
    expect(row.productPrice).toBeUndefined();
    expect(row.skuPrice).toBeUndefined();
  });

  it('never substitutes an empty string for an absent text column', async () => {
    // The nulled `productTypeDescription` override is gone from this call.
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productDescription: null })],
      ancestry: [makeAncestryRow({ productTypeDescription: null })],
    });
    const row = rowAt(rows, 0);

    // The renderer's description gate tests length
    // [integrationServices/google/views/feed/product.cfm:L19], so manufacturing an empty string
    // here would make that decision for it.
    expect(row.productDescription).not.toBe('');
    expect(row.productTypeDescription).not.toBe('');
    expect(row.productDescription).toBeUndefined();
    expect(row.productTypeDescription).toBeUndefined();
  });

  it('leaves an empty string alone, because only null suppresses a value', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow({ productUrlTitle: '' })] });
    const row = rowAt(rows, 0);

    // CFML parity [model/entity/Product.cfc:L207-L209]: the legacy interpolated an empty title
    // into the path without complaint and the feed carried the result. Adding an emptiness guard
    // here would be a repair, and a repair needs a product decision.
    expect(row.productUrlPath).toBe('/fake-url-key//');
  });

  it('leaves the expiration absent, and the sale price equal to the price, when no promotion applies', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow(), makeSelectionRow({ skuID: 'fake-sku-id-2' })],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    // The sale price falls back to the SKU price, because that is what the legacy accessor itself
    // returns [model/entity/Sku.cfc:L546-L551]; - the expiration stays absent.
    //
    // That asymmetry is exactly what keeps the block coherent: the gate at
    // [integrationServices/google/views/feed/product.cfm:L28] compares equal.
    for (const row of rows) {
      expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('19.99');
      expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('19.99');
      expect(row.salePriceExpirationDateTime).toBeUndefined();
    }

    expect(rows).toHaveLength(2);
  });

  it('declares both sale members on every row, populated or not', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);
    expect('skuSalePrice' in row).toBe(true);
    expect('salePriceExpirationDateTime' in row).toBe(true);
  });

  it('reads no ambient clock for the expiration, and inlines no date', async () => {
    const { recorder, rows } = await runFeed({ selection: [makeSelectionRow()] });

    // With no promotion primed the expiration is absent, and - the point of the case - the subject
    // did not reach for a clock to decide that.
    expect(rowAt(rows, 0).salePriceExpirationDateTime).toBeUndefined();
    expect(allStatements(recorder)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// The sale pair, when a promotion does apply.
//
// The premise that survived is the important one: neither half is a persisted column on the sku
// [model/entity/Sku.cfc:L115, L118], and both are still carryable.

describe('the sale pair carries states the whole-catalog resolution must still answer', () => {
  it('populates the price and leaves the expiration absent for a sale with no end date', async () => {
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('12.34'),
      }),
    ]);
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuPrice: '19.99' })] },
      {},
      { salePrices },
    );
    const row = rowAt(rows, 0);

    // Promotion period whose `endDateTime` is null still qualifies as current
    // [model/dao/PromotionDAO.cfc:L319] and projects a null expiration at L344, so the price is
    // populated and the interval is not.
    expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('12.34');
    expect(row.salePriceExpirationDateTime).toBeUndefined();

    // And the sale price wins over the column while the column itself survives untouched.
    expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('19.99');
  });

  it("keys the winners by SKU, so one product's SKUs can differ", async () => {
    const salePrices = new RecordingSalePriceSource([
      // Only the FIRST SKU is on sale, which is the ordinary case for a product whose promotion
      // targets one variant.
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('9.99'),
      }),
    ]);
    const { rows } = await runFeed(
      {
        selection: [
          makeSelectionRow({ skuID: 'fake-sku-id-1', productID: 'fake-shared', skuPrice: '19.99' }),
          makeSelectionRow({ skuID: 'fake-sku-id-2', productID: 'fake-shared', skuPrice: '29.99' }),
        ],
      },
      {},
      { salePrices },
    );

    expect(moneyOf(rowAt(rows, 0).skuSalePrice, 'first sale price').toDecimalString()).toBe('9.99');

    // The unmatched SKU falls through to its own price rather than borrowing its sibling's
    // discount or losing its value entirely - and it is a SIBLING.
    expect(moneyOf(rowAt(rows, 1).skuSalePrice, 'second sale price').toDecimalString()).toBe(
      '29.99',
    );
  });

  it('issues no statement of its own for the sale pair', async () => {
    const salePrices = new RecordingSalePriceSource([makeSalePriceRewardRow()]);
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] }, {}, { salePrices });

    // The resolution is DELEGATED, so this subject still owns exactly three statements. It reaches
    // no promotion table itself, which is what keeps the sale-price statement's ownership where it
    // already was.
    expect(recorder.captured).toHaveLength(3);
    expect(allStatements(recorder)).not.toMatch(/SwPromotion/i);
  });
});

// The brand, projected as two independent questions.
//
// [integrationServices/google/views/feed/product.cfm:L32] guards on
// `not isNull(local.sku.getProduct().getBrand())` and interpolates `getBrandName()` into the body.
//
// The carrier for the first question was once a boolean `brandPresent`, and it is the joined key
// now.

describe('the brand association and the brand name are carried separately', () => {
  it('reports the association present when the left join matched', async () => {
    const { rows } = await runFeed({
      selection: [
        makeSelectionRow({
          brandID: 'fake-brand-id-1',
          joinedBrandID: 'fake-brand-id-1',
          brandName: 'Fake Brand Name',
        }),
      ],
    });
    const row = rowAt(rows, 0);

    expect(row.brandID).toBe('fake-brand-id-1');
    expect(row.brandName).toBe('Fake Brand Name');
  });

  it('reports the association present even when the brand records no name', async () => {
    const { rows } = await runFeed({
      selection: [
        makeSelectionRow({
          brandID: 'fake-brand-id-1',
          joinedBrandID: 'fake-brand-id-1',
          brandName: null,
        }),
      ],
    });
    const row = rowAt(rows, 0);
    expect(row.brandID).toBe('fake-brand-id-1');
    expect(row.brandName).toBeUndefined();
  });

  it('reports the association absent when the join did not match, DESPITE a foreign key', async () => {
    const { rows } = await runFeed({
      selection: [
        makeSelectionRow({
          // The product still names a brand...
          brandID: 'fake-brand-id-1',
          // and no `SwBrand` row answers to it.
          joinedBrandID: null,
          brandName: null,
        }),
      ],
    });
    const row = rowAt(rows, 0);

    // GATE is not the FOREIGN KEY. `not isNull(...getBrand())` asks the ORM to RESOLVE the
    // association, and a dangling key resolves to nothing - so the legacy emitted no `<g:brand>`
    // here.
    expect(row.brandID).toBeUndefined();
    expect(row.brandName).toBeUndefined();

    // And the row still appears: a product with no resolvable brand is in the feed, simply without
    // that element.
    expect(rows).toHaveLength(1);
  });

  it('selects the brand id from the join the live path already declared', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // The projection widened; the from clause did not.
    expect(sql).toContain('SwBrand.brandID');
    expect(sql).toContain('SwBrand.brandName');
    expect(countMatches(sql, /SwBrand/g)).toBe(4);

    // Both brand keys are projected, under DIFFERENT labels, which is what lets one gate the
    // element and the other key the setting lookup.
    expect(sql).toContain('SwProduct.brandID                    AS brandID');
    expect(sql).toContain('SwBrand.brandID                      AS joinedBrandID');
  });

  it('carries the brand id as a key the renderer never emits', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // This case once asserted `'brandID' in row` was false, under the title 'never emits the brand
    // id, which exists only to answer the gate'.
    //
    // The premise about the renderer is still exactly right and the reduction is what went.
    expect(row.brandID).toBe('fake-brand-id-1');
    expect(PROJECTION_MEMBERS).toContain('brandID');
    expect(typeof row.brandID).toBe('string');
  });
});

// The derived values.
//
// Four values arrive resolved rather than as columns, so the renderer never reaches for a setting
// or issues a second lookup of its own.

describe('the derived paths reproduce the legacy interpolations exactly', () => {
  it('builds the product path with a leading slash, both segments and a trailing slash', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ productUrlTitle: 'fake-nike-air-jorden' })] },
      { globalURLKeyProduct: 'fakekey' },
    );

    // CFML parity [model/entity/Product.cfc:L207-L209]: the legacy accessor interpolates the
    // resolved key and the URL title between three slashes.
    expect(rowAt(rows, 0).productUrlPath).toBe('/fakekey/fake-nike-air-jorden/');
  });

  it('leaves the product path host-relative, because the view prepends the host itself', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const { productUrlPath } = rowAt(rows, 0);

    // [integrationServices/google/views/feed/product.cfm:L22] prepends the scheme and host.
    expect(productUrlPath).toMatch(/^\//);
    expect(productUrlPath).not.toMatch(/:\/\//);
  });

  it('builds the SKU image path around the literal segment the legacy hard-coded', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: 'fake-sku-photo.jpg' })] },
      { baseImageURL: '/fake-assets/images' },
    );

    // CFML parity [model/entity/Sku.cfc:L145-L147]: the middle segment is a literal of the legacy
    // source rather than a configured value, so it is a constant here and only the prefix is
    // resolved.
    expect(rowAt(rows, 0).imageLinkPath).toBe(
      '/fake-assets/images/product/default/fake-sku-photo.jpg',
    );
  });

  it('falls back to the resolved missing-image path when the SKU stores no image file', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: null })] },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-assets/fake-missing.jpg' },
    );

    // This case once asserted `imageLinkPath` was undefined, under the title "performs no
    // missing-image substitution", and reasoned that "there is no sanctioned fallback to name
    // instead".
    expect(rowAt(rows, 0).imageLinkPath).toBe('/fake-assets/fake-missing.jpg');
  });

  it('★★★ falls back for a STORED-BUT-UNUSABLE image file, not only for a NULL one', async () => {
    for (const storedButUnusable of ['', ' ', '   ', '\t', '\n']) {
      const { rows } = await runFeed(
        { selection: [makeSelectionRow({ skuImageFile: storedButUnusable })] },
        { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
      );

      expect(rowAt(rows, 0).imageLinkPath).toBe('/fake-missing.jpg');
      expect(rowAt(rows, 0).imageLinkPath).not.toContain('/product/default/');
    }
  });

  it('does not TRIM a usable image file, because the legacy interpolated the column verbatim', async () => {
    // The blankness test decides whether to substitute and rewrites nothing.
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: ' fake-padded.jpg ' })] },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
    );

    expect(rowAt(rows, 0).imageLinkPath).toBe('/fake-assets/product/default/ fake-padded.jpg ');
  });

  it('★★★ applies the same trigger to BOTH components of an additional image path', async () => {
    // The image path interpolates two stored components [model/entity/Image.cfc:L79-L81], so
    // either one being unusable collapses it.
    const { rows } = await runFeed(
      {
        selection: [makeSelectionRow()],
        images: [
          makeImageRow({ imageDirectory: '   ', imageFile: 'fake-one.jpg' }),
          makeImageRow({ imageDirectory: 'fake-dir', imageFile: '' }),
          makeImageRow({ imageDirectory: '', imageFile: '  ' }),
          makeImageRow({ imageDirectory: 'fake-dir', imageFile: 'fake-usable.jpg' }),
        ],
      },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
    );

    // Four rows in, four elements out - one per image row, as the legacy loop emitted.
    expect(rowAt(rows, 0).additionalImageLinkPaths).toStrictEqual([
      '/fake-missing.jpg',
      '/fake-missing.jpg',
      '/fake-missing.jpg',
      '/fake-assets/fake-dir/fake-usable.jpg',
    ]);
  });

  it('publishes a WELL-FORMED stored path unprobed, which is the declared residual gap', async () => {
    // Asserted so the limit is visible rather than implied. A path that names a file is published
    // even though the file may have been deleted, where the legacy `fileExists` probe would have
    // substituted.
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: 'fake-deleted-asset.jpg' })] },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
    );

    expect(rowAt(rows, 0).imageLinkPath).toBe(
      '/fake-assets/product/default/fake-deleted-asset.jpg',
    );
  });

  it('does not route the fallback through the stored-path shape, because it is already a path', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: null })] },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
    );

    // The legacy fallback is a complete path in its own right
    // [model/service/ImageService.cfc:L83-L88] and never has the product-default segments
    // interpolated around it.
    expect(rowAt(rows, 0).imageLinkPath).toBe('/fake-missing.jpg');
    expect(rowAt(rows, 0).imageLinkPath).not.toContain('/product/default/');
    expect(rowAt(rows, 0).imageLinkPath).not.toContain('/fake-assets/fake-missing');
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

    // CFML parity [model/entity/Image.cfc:L79-L81]: unlike the SKU path, the middle segment is the
    // image row's own directory column.
    expect(additionalImageLinkPaths).toStrictEqual([
      '/fake-assets/fake-dir-one/fake-one.jpg',
      '/fake-assets/fake-dir-two/fake-two.jpg',
    ]);
  });

  it('contributes one fallback entry per image row missing a path component, dropping none', async () => {
    const { rows } = await runFeed(
      {
        selection: [makeSelectionRow()],
        images: [
          makeImageRow({ imageDirectory: null, imageFile: 'fake-orphan.jpg' }),
          makeImageRow({ imageDirectory: 'fake-dir', imageFile: null }),
          makeImageRow({ imageDirectory: 'fake-dir', imageFile: 'fake-usable.jpg' }),
        ],
      },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
    );
    const { additionalImageLinkPaths } = rowAt(rows, 0);

    // Nothing for an image row missing a path component".
    expect(additionalImageLinkPaths).toStrictEqual([
      '/fake-missing.jpg',
      '/fake-missing.jpg',
      '/fake-assets/fake-dir/fake-usable.jpg',
    ]);
  });

  it('answers an empty array for a product with no image row at all', async () => {
    const withNoRows = await runFeed({ selection: [makeSelectionRow()], images: [] });
    const withOneUnusableRow = await runFeed(
      {
        selection: [makeSelectionRow()],
        images: [makeImageRow({ imageDirectory: null, imageFile: null })],
      },
      { missingImagePath: '/fake-missing.jpg' },
    );

    // Matches a legacy loop that simply had no rows to emit." The second clause is the error: the
    // legacy loop had a row and therefore emitted an element.
    expect(rowAt(withNoRows.rows, 0).additionalImageLinkPaths).toStrictEqual([]);
    expect(rowAt(withOneUnusableRow.rows, 0).additionalImageLinkPaths).toStrictEqual([
      '/fake-missing.jpg',
    ]);
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

    // The association belongs to the product, not to the SKU, so both rows read the same paths -
    // and neither sorts or mutates what the other holds.
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

    // CFML parity [model/entity/ProductType.cfc:L273-L278]: the legacy override recurses to the
    // parent FIRST and appends its own name after the separator, so the result is root-first.
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

    // CFML interpolated a null name as an empty string and still emitted its separator, so
    // dropping the segment would shorten the breadcrumb the legacy produced.
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

// A `parentProductTypeID` cycle is corrupt data, not a business rule, and neither legacy walk
// guards against it: `getSimpleRepresentation()` [model/entity/ProductType.cfc:L273-L278] recurses
// with no visited set.

describe('a cyclic product-type ancestry is bounded rather than allowed to run away', () => {
  it('renders a full acyclic chain unchanged, so the guard costs an ordinary hierarchy nothing', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'fake-leaf' })],
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          ancestorProductTypeID: 'fake-leaf',
          productTypeName: 'Leaf',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          ancestorProductTypeID: 'fake-middle',
          productTypeName: 'Middle',
          ancestorDistance: 1,
        }),
        makeAncestryRow({
          leafProductTypeID: 'fake-leaf',
          ancestorProductTypeID: 'fake-root',
          productTypeName: 'Root',
          ancestorDistance: 2,
        }),
      ],
    });
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Root &raquo; Middle &raquo; Leaf');
  });

  it('★★ renders a self-referencing product type once rather than once per recursion step', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'self-parent' })],
      // What the statement returns for `parentProductTypeID = productTypeID`: the same ancestor at
      // every distance, up to the ceiling. Two rows are enough to distinguish "stops at the
      // repeat" from "renders them all".
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'self-parent',
          ancestorProductTypeID: 'self-parent',
          productTypeName: 'Loops To Itself',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'self-parent',
          ancestorProductTypeID: 'self-parent',
          productTypeName: 'Loops To Itself',
          ancestorDistance: 1,
        }),
      ],
    });

    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Loops To Itself');
  });

  it('★★ renders the acyclic prefix of a three-node cycle and discards everything from the repeat on', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'cycle-a' })],
      // Exactly the shape a live MySQL 8.0.46 returned for a -> b -> c -> a, trimmed to two laps:
      // distinct at distances 0-2, then the first lap repeats.
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-a',
          productTypeName: 'Cycle A',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-b',
          productTypeName: 'Cycle B',
          ancestorDistance: 1,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-c',
          productTypeName: 'Cycle C',
          ancestorDistance: 2,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-a',
          productTypeName: 'Cycle A',
          ancestorDistance: 3,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-b',
          productTypeName: 'Cycle B',
          ancestorDistance: 4,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-c',
          productTypeName: 'Cycle C',
          ancestorDistance: 5,
        }),
      ],
    });

    // Three segments, not six: the walk is leaf-first and stops the moment it meets an identifier
    // it has already passed through, so the breadcrumb is the acyclic prefix rendered root-first.
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe(
      'Cycle C &raquo; Cycle B &raquo; Cycle A',
    );
  });

  it('rejects the repeat wherever the driver happens to order the rows', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'cycle-a' })],
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-b',
          productTypeName: 'Cycle B',
          ancestorDistance: 3,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-b',
          productTypeName: 'Cycle B',
          ancestorDistance: 1,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-a',
          productTypeName: 'Cycle A',
          ancestorDistance: 2,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-a',
          productTypeName: 'Cycle A',
          ancestorDistance: 0,
        }),
      ],
    });

    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Cycle B &raquo; Cycle A');
  });

  it("still answers the leaf's own description when a cycle truncated the breadcrumb", async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'cycle-a' })],
      ancestry: [
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-a',
          productTypeName: 'Cycle A',
          productTypeDescription: 'The leaf description.',
          ancestorDistance: 0,
        }),
        makeAncestryRow({
          leafProductTypeID: 'cycle-a',
          ancestorProductTypeID: 'cycle-a',
          productTypeName: 'Cycle A',
          productTypeDescription: 'The leaf description.',
          ancestorDistance: 1,
        }),
      ],
    });

    // The description is read from the `ancestorDistance === 0` row, which the truncation never
    // removes, so the fallback `description` survives a cycle even though the breadcrumb
    // shortened.
    expect(rowAt(rows, 0).productTypeDescription).toBe('The leaf description.');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Cycle A');
  });

  it('carries the ancestor identity in the projection, which is what makes a repeat recognisable', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // Both members supply it - the anchor from the requested type, the recursive member from the
    // ancestor it just reached - and the outer projection returns it.
    expect(occurrencesOf(ancestry.sql, 'ancestorProductTypeID')).toBe(2);
    expect(ancestry.sql).toContain('ancestor.productTypeID');
  });

  it('★★ bounds the statement own recursion with a depth ceiling derived from the legacy path column', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // 120 is the greatest distance the recursive member may PRODUCE, so a chain is at most 121
    // rows.
    expect(ancestry.sql).toContain('descendant.ancestorDistance < 120');
    expect(33 * 121 - 1).toBeLessThanOrEqual(4000);
    expect(33 * 122 - 1).toBeGreaterThan(4000);
  });

  it('keeps the ceiling out of the bound parameters, so no caller can raise it', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'fake-type-a' })],
      ancestry: [makeAncestryRow()],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // The ceiling is part of the statement's structure. The only bound value is the key list, so
    // nothing reaching this adapter from outside can widen the walk.
    expect(boundParameters(ancestry)).toStrictEqual(['fake-type-a']);
  });
});

// Isolation and freshness.
//
// A warm execution container reuses a loaded module between unrelated requests, so a cache at
// module scope would be state shared between them.

describe('nothing is held between calls, between instances or at module scope', () => {
  it('reads the store again on a second call rather than answering from a cache', async () => {
    const recorder = new RecordingExecutor({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });
    const repository = makeRepository(recorder);

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

    // Each run captured its own three statements, and neither recorder saw the other's.
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
    const repository = makeRepository(recorder);

    const first = await repository.fetchProductFeedRows();
    const second = await repository.fetchProductFeedRows();

    expect(rowAt(second, 0)).not.toBe(rowAt(first, 0));
  });

  it('answers an empty result without failing, which is an ordinary feed state', async () => {
    const { rows } = await runFeed({ selection: [] });

    // The legacy rendered a feed with no items, so nothing here treats an empty selection as a
    // fault.
    expect(rows).toStrictEqual([]);
  });

  it('holds only the five collaborators it was constructed with', () => {
    const repository = makeRepository(new RecordingExecutor());

    // No configuration field, no cache field, no connection field and no clock.
    expect(Object.getOwnPropertyNames(repository)).toHaveLength(5);
  });
});

// The two product-type values, and where they now come from.
//
// The live entrypoint declares its joins one call at a time and makes EXACTLY three
// [integrationServices/google/controllers/feed.cfc:L64-L66].

describe('the selection keeps exactly three joins, and the product type is read separately', () => {
  it('names SwProductType in no clause of the selection except the projected foreign key', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    expect(sql).not.toContain('SwProductType');
    expect(sql).not.toContain('productTypeDescription');
    expect(sql).toMatch(/SwProduct\.productTypeID\s+AS productTypeID/);
  });

  it('selects the description on the ancestry statement, from the anchor member', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const { sql } = statementOfKind(recorder, 'ancestry');

    // The anchor is the requested type's own row, so its description is the requested type's own
    // description and its provenance is visible in the statement.
    expect(sql).toContain('leaf.productTypeDescription AS productTypeDescription');
    expect(sql).toContain('FROM SwProductType AS leaf');
  });

  it("carries the anchor's description up the chain unchanged, never an ancestor's", async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const { sql } = statementOfKind(recorder, 'ancestry');

    // The recursive member takes the name from the ANCESTOR and the description from the
    // DESCENDANT. Taking both from the ancestor would silently answer with the root type's
    // description for every leaf.
    expect(sql).toContain('ancestor.productTypeName');
    expect(sql).toContain('descendant.productTypeDescription');
    expect(sql).not.toContain('ancestor.productTypeDescription');
  });

  it('reads the description from the requested type own row and not from an ancestor row', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [
        makeAncestryRow({
          ancestorDistance: 1,
          productTypeName: 'Fake Root Type',
          productTypeDescription: 'An ancestor row that repeats nothing useful.',
        }),
        makeAncestryRow({
          ancestorDistance: 0,
          productTypeName: 'Fake Leaf Type',
          productTypeDescription: 'The leaf own description.',
        }),
      ],
    });

    // The rows come back flat and unordered, and only the distance-zero row is the requested type.
    // Reading an arbitrary member of the group would be correct only while the recursion happens
    // to repeat the value.
    expect(rowAt(rows, 0).productTypeDescription).toBe('The leaf own description.');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe(
      'Fake Root Type &raquo; Fake Leaf Type',
    );
  });
});

// The per-SKU shipping weight.
//
// [integrationServices/google/views/feed/product.cfm:L58] calls `setting()` on the SKU, INSIDE the
// row loop, for both halves of the shipping weight.

/**
 * The resolver's single recorded subject list, narrowed rather than asserted.
 */
function soleSubjectList(
  resolver: RecordingShippingWeightResolver,
): readonly SkuFeedSettingSubject[] {
  const first = resolver.calls[0];

  if (first === undefined) {
    throw new Error('the subject never consulted the shipping-weight resolver');
  }

  if (resolver.calls.length > 1) {
    throw new Error(
      `the subject consulted the shipping-weight resolver ${String(resolver.calls.length)} ` +
        'times where exactly one batched call was expected',
    );
  }

  return first;
}

/**
 * One recorded subject at an ordinal, narrowed the same way.
 */
function subjectAt(
  subjects: readonly SkuFeedSettingSubject[],
  index: number,
): SkuFeedSettingSubject {
  const subject = subjects[index];

  if (subject === undefined) {
    throw new Error(
      `the resolver was handed ${String(subjects.length)} subjects, so there is none at ` +
        `position ${String(index)}`,
    );
  }

  return subject;
}

describe('the shipping weight is resolved per SKU, and asked for once', () => {
  it('gives two SKUs of one product the weights the resolver answered for each', async () => {
    const shippingWeights = new RecordingShippingWeightResolver(
      new Map([
        ['fake-sku-id-1', { skuShippingWeight: '0.250', skuShippingWeightUnitCode: 'fakeoz' }],
        ['fake-sku-id-2', { skuShippingWeight: '44.000', skuShippingWeightUnitCode: 'fakekg' }],
      ]),
    );
    const { rows } = await runFeed(
      {
        selection: [
          makeSelectionRow({ skuID: 'fake-sku-id-1', productID: 'fake-shared-product' }),
          makeSelectionRow({ skuID: 'fake-sku-id-2', productID: 'fake-shared-product' }),
        ],
      },
      {},
      { shippingWeights },
    );
    expect(rowAt(rows, 0).skuShippingWeight).toBe('0.250');
    expect(rowAt(rows, 0).skuShippingWeightUnitCode).toBe('fakeoz');
    expect(rowAt(rows, 1).skuShippingWeight).toBe('44.000');
    expect(rowAt(rows, 1).skuShippingWeightUnitCode).toBe('fakekg');
  });

  it('asks the resolver exactly once for the whole selection, never once per row', async () => {
    const shippingWeights = new RecordingShippingWeightResolver();
    await runFeed(
      {
        selection: [
          makeSelectionRow({ skuID: 'fake-sku-id-1' }),
          makeSelectionRow({ skuID: 'fake-sku-id-2' }),
          makeSelectionRow({ skuID: 'fake-sku-id-3' }),
        ],
      },
      {},
      { shippingWeights },
    );

    // The legacy called `setting()` inside its row loop. Reproducing the RESULT is required;
    // reproducing the N+1 is not, and the repository boundary is where that choice is made once.
    expect(shippingWeights.calls).toHaveLength(1);
    expect(soleSubjectList(shippingWeights).map((subject) => subject.skuID)).toStrictEqual([
      'fake-sku-id-1',
      'fake-sku-id-2',
      'fake-sku-id-3',
    ]);
  });

  it('hands over the product, product type and brand the lookup order walks', async () => {
    const shippingWeights = new RecordingShippingWeightResolver();
    await runFeed({ selection: [makeSelectionRow()] }, {}, { shippingWeights });

    // [model/service/SettingService.cfc:L104] names three relationship paths for a SKU subject:
    // the product, the product-type path combined with the brand, and the product-type path alone.
    expect(subjectAt(soleSubjectList(shippingWeights), 0)).toStrictEqual({
      skuID: 'fake-sku-id-1',
      productID: 'fake-product-id-1',
      productTypeID: 'fake-product-type-id-1',
      brandID: 'fake-brand-id-1',
    });
  });

  it('hands over an absent product type and an absent brand as absent', async () => {
    const shippingWeights = new RecordingShippingWeightResolver();
    await runFeed(
      { selection: [makeSelectionRow({ productTypeID: null, brandID: null })] },
      {},
      { shippingWeights },
    );

    // Both columns are genuinely nullable - the brand is joined outer
    // [integrationServices/google/controllers/feed.cfc:L66].
    const subject = subjectAt(soleSubjectList(shippingWeights), 0);

    expect(subject.productTypeID).toBeUndefined();
    expect(subject.brandID).toBeUndefined();
    expect(subject.skuID).toBe('fake-sku-id-1');
  });

  it('raises rather than substituting a weight when the resolver omits a SKU', async () => {
    const shippingWeights = new RecordingShippingWeightResolver(
      new Map([['fake-sku-id-2', undefined]]),
    );

    // `setting()` could not fail to answer: the declared default closed the lookup
    // [model/service/SettingService.cfc:L232-L233].
    await expect(
      runFeed(
        {
          selection: [
            makeSelectionRow({ skuID: 'fake-sku-id-1' }),
            makeSelectionRow({ skuID: 'fake-sku-id-2' }),
          ],
        },
        {},
        { shippingWeights },
      ),
    ).rejects.toThrow(/the first unanswered identifier is "fake-sku-id-2"/);
  });

  it('consults neither per-SKU collaborator when nothing qualifies', async () => {
    const shippingWeights = new RecordingShippingWeightResolver();
    const salePrices = new RecordingSalePriceSource([makeSalePriceRewardRow()]);
    const { rows } = await runFeed({ selection: [] }, {}, { shippingWeights, salePrices });

    // An empty feed is an ordinary state, and it costs no collaborator call at all.
    expect(rows).toStrictEqual([]);
    expect(shippingWeights.calls).toStrictEqual([]);
    expect(salePrices.calls).toStrictEqual([]);
  });
});

// [integrationServices/google/views/feed/product.cfm:L28-L31] compares the SKU price against its
// sale price and, when the sale price is lower.

describe('the sale price is resolved for the whole catalog and keyed per SKU', () => {
  it('carries the winning sale price and its expiration onto the row', async () => {
    const expiration = new Date('2024-12-31T23:59:59.000Z');
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('7.50'),
        salePriceExpirationDateTime: expiration,
      }),
    ]);
    const { rows } = await runFeed({ selection: [makeSelectionRow()] }, {}, { salePrices });
    const row = rowAt(rows, 0);

    expect(row.skuSalePrice).toBeInstanceOf(Money);
    expect(moneyOf(row.skuSalePrice, 'sale price').toFixed2()).toBe('7.50');
    expect(row.salePriceExpirationDateTime).toBe(expiration);
  });

  it('asks for the whole catalog, naming no product identifier', async () => {
    const salePrices = new RecordingSalePriceSource();
    await runFeed({ selection: [makeSelectionRow()] }, {}, { salePrices });

    // The port's `productID` is optional and its PRESENCE is what each union branch tests, so
    // omitting it genuinely means every product.
    expect(salePrices.calls).toStrictEqual([undefined]);
  });

  it('falls the price back to the SKU price and leaves the expiration absent when no reward wins', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow({ skuPrice: '19.99' })] });
    const row = rowAt(rows, 0);

    // This case once asserted both members were absent, titled 'leaves both sale members absent
    // for a sku no reward wins'.
    //
    // The EXPIRATION genuinely has no fallback - it answers with an empty string
    // [model/entity/Sku.cfc:L560-L565], which is no instant at all - so the asymmetry below is the
    // source's own.
    expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('19.99');
    expect(row.salePriceExpirationDateTime).toBeUndefined();

    // Never zero, in either direction: a NULL price column carries no sale price either, rather
    // than a free one.
    expect(row.skuSalePrice).not.toBe(Money.zero);

    const withNullPrice = await runFeed({ selection: [makeSelectionRow({ skuPrice: null })] });

    expect(rowAt(withNullPrice.rows, 0).skuSalePrice).toBeUndefined();
  });

  it('rounds the sale price when the winning reward names a rounding rule', async () => {
    const rounder = new RecordingValueRounder(Money.fromDecimalString('9.99'));
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({
        salePrice: Money.fromDecimalString('10.37'),
        roundingRuleID: 'fake-rounding-rule-id-1',
      }),
    ]);
    const { rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      {},
      { salePrices, rounder },
    );

    expect(rounder.calls).toStrictEqual([
      { value: '10.37', roundingRuleID: 'fake-rounding-rule-id-1' },
    ]);
    expect(moneyOf(rowAt(rows, 0).skuSalePrice, 'sale price').toFixed2()).toBe('9.99');
  });

  it('applies no rounding when the reward names no rule at all', async () => {
    const rounder = new RecordingValueRounder();
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({ salePrice: Money.fromDecimalString('10.37') }),
    ]);
    const { rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      {},
      { salePrices, rounder },
    );

    expect(rounder.calls).toStrictEqual([]);
    expect(moneyOf(rowAt(rows, 0).skuSalePrice, 'sale price').toFixed2()).toBe('10.37');
  });

  it('applies no rounding when the reward names an empty rule identifier', async () => {
    const rounder = new RecordingValueRounder();
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({ salePrice: Money.fromDecimalString('10.37'), roundingRuleID: '' }),
    ]);
    const { rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      {},
      { salePrices, rounder },
    );

    // The legacy gate is `roundingRuleID != ""` [model/service/PromotionService.cfc:L1025] - an
    // emptiness test, because a query renders a null column that way.
    expect(rounder.calls).toStrictEqual([]);
    expect(moneyOf(rowAt(rows, 0).skuSalePrice, 'sale price').toFixed2()).toBe('10.37');
  });

  it('lets the last row win for a duplicate SKU, exactly as the legacy keying did', async () => {
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('4.00'),
      }),
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('6.00'),
      }),
    ]);
    const { rows } = await runFeed({ selection: [makeSelectionRow()] }, {}, { salePrices });

    // Not a choice made here.
    expect(moneyOf(rowAt(rows, 0).skuSalePrice, 'sale price').toFixed2()).toBe('6.00');
  });

  it('rounds only the surviving row of a duplicate, because keying happens first', async () => {
    const rounder = new RecordingValueRounder();
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('4.00'),
        roundingRuleID: 'fake-losing-rule',
      }),
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('6.00'),
        roundingRuleID: 'fake-winning-rule',
      }),
    ]);
    await runFeed({ selection: [makeSelectionRow()] }, {}, { salePrices, rounder });

    // The legacy rounds by walking the ALREADY-KEYED structure
    // [model/service/PromotionService.cfc:L1024-L1028], so the overwritten row is never rounded.
    expect(rounder.calls).toStrictEqual([{ value: '6.00', roundingRuleID: 'fake-winning-rule' }]);
  });

  it('drops a reward for a SKU this feed did not select', async () => {
    const rounder = new RecordingValueRounder();
    const salePrices = new RecordingSalePriceSource([
      makeSalePriceRewardRow({
        skuID: 'fake-sku-id-1',
        salePrice: Money.fromDecimalString('7.50'),
      }),
      makeSalePriceRewardRow({
        skuID: 'fake-unselected-sku',
        salePrice: Money.fromDecimalString('1.00'),
        roundingRuleID: 'fake-unselected-rule',
      }),
    ]);
    const { rows } = await runFeed(
      { selection: [makeSelectionRow()] },
      {},
      { salePrices, rounder },
    );

    // The legacy asked per product and so never saw a reward for a SKU outside it.
    expect(rows).toHaveLength(1);
    expect(moneyOf(rowAt(rows, 0).skuSalePrice, 'sale price').toFixed2()).toBe('7.50');
    expect(rounder.calls).toStrictEqual([]);
  });

  it('issues no additional statement of its own to resolve a sale price', async () => {
    const salePrices = new RecordingSalePriceSource([makeSalePriceRewardRow()]);
    const { recorder } = await runFeed(
      { selection: [makeSelectionRow()], ancestry: [makeAncestryRow()], images: [makeImageRow()] },
      {},
      { salePrices },
    );

    // Three statements, as before: the selection, the ancestry walk and the images.
    expect(recorder.captured).toHaveLength(3);
    expect(allStatements(recorder)).not.toContain('salePrice');
  });
});

// Whole-catalog materialization - the ceiling, inverted.
//
// So the refusal cases are now their inverse, and the at-the-limit case is kept unchanged.
//
// The depth ceiling on the recursive ancestry walk is unaffected and stays exactly where it is: it
// guards against MySQL error 3636 on cyclic legacy data.

describe('a whole catalog is materialized rather than refused', () => {
  /**
   * `count` selection rows, distinct in every key the follow-up statements are keyed on.
   */
  function selectionRowsOf(count: number): readonly DriverRow[] {
    return Array.from({ length: count }, (_unused, index) =>
      makeSelectionRow({
        skuID: `fake-sku-id-${String(index)}`,
        productID: `fake-product-id-${String(index)}`,
      }),
    );
  }

  it('★★ materializes a selection ABOVE the old ceiling instead of refusing it', async () => {
    const recorder = new RecordingExecutor({
      selection: selectionRowsOf(25_001),
      ancestry: [],
      images: [],
    });
    const repository = makeRepository(recorder);

    const rows = await repository.fetchProductFeedRows();

    // ABOVE the old qualifying-row ceiling, and still answered in full.
    expect(rows).toHaveLength(25_001);
    expect(recorder.captured.length).toBeGreaterThan(1);
  });

  it('materializes a selection at the old ceiling, unchanged', async () => {
    const recorder = new RecordingExecutor({
      selection: selectionRowsOf(25_000),
      ancestry: [],
      images: [],
    });
    const repository = makeRepository(recorder);

    const rows = await repository.fetchProductFeedRows();

    expect(rows).toHaveLength(25_000);
    expect(recorder.captured.length).toBeGreaterThan(1);
  });

  it('★★ batches the follow-up statements so no single bind exceeds the tuple row limit', async () => {
    const recorder = new RecordingExecutor({
      selection: selectionRowsOf(2_500),
      ancestry: [],
      images: [],
    });
    const repository = makeRepository(recorder);

    await repository.fetchProductFeedRows();

    // What REPLACED the CEILING. Every captured statement binds at most one batch of keys, so an
    // uncapped selection cannot produce a statement the driver refuses to carry.
    for (const captured of recorder.captured) {
      expect(captured.params?.length ?? 0).toBeLessThanOrEqual(SQL_TUPLE_ROW_LIMIT);
    }

    // 2,500 distinct product identifiers become three image batches; the ancestry walk is keyed on
    // the one product type the selection fixture carries, so it stays a single statement.
    expect(recorder.captured.length).toBeGreaterThan(3);
  });

  it('emits one statement per follow-up when the key sets fit a single batch', async () => {
    const recorder = new RecordingExecutor({
      selection: selectionRowsOf(3),
      ancestry: [],
      images: [],
    });
    const repository = makeRepository(recorder);

    await repository.fetchProductFeedRows();

    // The emitted SQL is unchanged for every realistic catalog, which is what keeps the batching
    // invisible to every other case in this file: the selection, the ancestry walk and the images.
    expect(recorder.captured).toHaveLength(3);
  });
});
