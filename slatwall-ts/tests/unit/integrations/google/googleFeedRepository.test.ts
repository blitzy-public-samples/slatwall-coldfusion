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
//   3. THE SALE PAIR IS RESOLVED, NOT EMPTY. An earlier reading of this file
//      recorded that `skuSalePrice` and `salePriceExpirationDateTime` were
//      "assigned nothing on every row" and that "their emptiness is the
//      contract". Both halves of that were wrong, and the second half was the
//      load-bearing one. It is true that neither field has a persisted column
//      [model/entity/Sku.cfc:L115, L118]; it does NOT follow that neither is
//      obtainable. The sale price is a CASE over persisted columns
//      [model/dao/PromotionDAO.cfc:L338-L342] and the expiration IS a persisted
//      column - `SwPromotionPeriod.endDateTime`, projected as
//      `salePriceExpirationDateTime` [model/dao/PromotionDAO.cfc:L344] and
//      carried through both query-of-queries stages [L552, L579]. The subject
//      therefore populates both, resolving them through an injected
//      sale-price-detail source once per DISTINCT PRODUCT, which is the
//      granularity the legacy memo itself used [model/entity/Product.cfc:L517-L522].
//      The cases below assert the population, the per-product resolution count,
//      and the fallback that stands in for the legacy accessor's own
//      `return getPrice()` [model/entity/Sku.cfc:L546-L551].
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
 * It implements the subject's executor contract STRUCTURALLY - three members,
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

  /**
   * Every entry into `transaction`, keyed by how many statements had been captured when
   * it happened. Expected to stay EMPTY: the feed only reads.
   */
  readonly transactionEntries: number[] = [];

  /** How many times a transaction was attempted. Expected to stay ZERO forever. */
  transactionAttempts = 0;

  /**
   * Refuse a transaction, for the same reason `executeMutation` refuses.
   *
   * The feed path is one read. A transaction is only ever opened around a write, so one
   * appearing here would mean a write path had grown, and refusing turns that into a
   * failing test at the moment it appears.
   *
   * ★ THE ALTERNATIVE WAS A WORKING NO-OP - `transactionEntries.push(...)` followed by
   * `return work(this)` - present so that this double stood in for the real executor
   * STRUCTURALLY, on the reasoning that the contract now carries `transaction`. The
   * contract is satisfied either way: refusing is still an implementation of it. What
   * refusing adds is that a write path appearing on a read-only adapter fails LOUDLY
   * instead of being recorded and passed over, and the recording it replaces was only
   * ever going to be read by a case nobody had written. BOTH counters are still updated
   * before the throw, so the two vocabularies the sibling suites use both resolve here.
   *
   * It is NOT a divergence from the shipped executor. `createConnectionExecutor` in
   * `src/repositories/mysql/connection.ts` joins a nested call and opens a real unit for
   * an outermost one; this double refuses BOTH, because the claim being pinned is that
   * this adapter has no write path at all, not anything about transaction semantics.
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

/**
 * ⚠ NO SECOND SALE-PRICE DOUBLE LIVES HERE, AND THIS RECORDS WHY.
 *
 * A `RecordingSalePriceSource` once stood at this position, primed per PRODUCT with
 * `SalePriceDetail` values and answering `getSalePriceDetailsForProductSkus(productID)`
 * - the shape of the service method the legacy view reaches lazily through the product
 * memo [model/entity/Product.cfc:L517-L522]. It was correct about WHAT the feed needs
 * and wrong about HOW MANY QUESTIONS it takes to get it: per-product resolution asks the
 * same reduction once per product in the catalog, which is the N+1 the legacy memo hid
 * behind lazy traversal and which a feed over the whole catalog cannot afford.
 *
 * The double that survived asks ONCE, for every product, and keys the winners per SKU -
 * `RecordingSalePriceSource` further down this file, built on
 * `SalePricePromotionRewardRow` and the `GoogleFeedSalePriceSource` port. It reproduces
 * the same eight lines of service code [model/service/PromotionService.cfc:L1022-L1030]
 * against the same statement, one call instead of N. Both doubles cannot coexist: they
 * share a name and the subject takes exactly one of them.
 *
 * The two cases the earlier double asserted that its successor did not are ported to the
 * successor's shape rather than dropped - a live sale with a NULL expiration, and two
 * SKUs of one product where only one is on sale. Both are in the sale-price describe.
 */

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
 * The three resolved setting values the subject's constructor takes.
 *
 * The image prefix is host-relative on purpose: the legacy view prepends the
 * scheme and host itself, so a repository that produced an absolute address
 * would be doing the renderer's job. `missingImagePath` is host-relative for the
 * same reason.
 *
 * ★ THIS FACTORY ONCE PRODUCED FOUR VALUES, TWO OF THEM SHIPPING WEIGHTS. They
 * are resolved PER SKU now, through `makeShippingWeightResolver` below, because
 * the legacy resolves them inside its row loop.
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

/** The default shipping weight this suite's resolver answers with. */
const FAKE_SHIPPING_WEIGHT = '3.500';

/** The default shipping-weight unit this suite's resolver answers with. */
const FAKE_SHIPPING_WEIGHT_UNIT = 'fakeunit';

/**
 * A shipping-weight resolver that records what it was asked and answers per SKU.
 *
 * `answers` maps a SKU identifier to the pair that SKU should receive; any SKU not
 * named there receives the two defaults above. Passing an explicit `undefined`
 * answer models a resolver that OMITS a SKU, which is the contract violation the
 * subject refuses to paper over.
 */
class RecordingShippingWeightResolver implements SkuFeedSettingResolver {
  /** Every subject list handed over, in call order. Length proves the batching. */
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
 *
 * The recorded argument list is what proves the subject asks for the WHOLE catalog:
 * the port's `productID` is optional, and omitting it means every product.
 */
class RecordingSalePriceSource implements GoogleFeedSalePriceSource {
  /** One entry per call, holding the `productID` argument as received. */
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
 * It answers with a fixed, obviously-different value so that a case can tell a
 * ROUNDED price from an unrounded one without reimplementing the rounding
 * algorithm - which has nine characterised outcomes of its own and is exercised by
 * `tests/unit/services/roundingRuleService.test.ts`, not here.
 */
class RecordingValueRounder implements GoogleFeedValueRounder {
  /** One entry per call: the value handed in and the rule identifier. */
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

/** One winning sale-price reward row, carrying every member the subject reads. */
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
    // ★ THE BRAND ARRIVES AS THREE COLUMNS, AND EACH ANSWERS A DIFFERENT QUESTION.
    // `brandID` is `SwProduct.brandID`, the FOREIGN KEY as the product row carries it,
    // and it is what the setting-lookup path `product.brand.brandID`
    // [model/service/SettingService.cfc:L519] needs. `joinedBrandID` is
    // `SwBrand.brandID` AS THE LEFT JOIN RESOLVED IT, and it is the EMISSION GATE,
    // because the legacy guards on `not isNull(...getBrand())`
    // [integrationServices/google/views/feed/product.cfm:L32] - a test on the resolved
    // ASSOCIATION, not on the column. `brandName` is the body.
    //
    // The default models a MATCHED left join
    // [integrationServices/google/controllers/feed.cfc:L66], so all three are populated.
    // `joinedBrandID: null` WITH a `brandID` is the dangling key - a product naming a
    // brand row that no longer exists, which the legacy omitted the element for;
    // `brandName: null` with both ids is the brand that records no name.
    brandID: 'fake-brand-id-1',
    joinedBrandID: 'fake-brand-id-1',
    brandName: 'Fake Brand',
    ...overrides,
  };
}

/**
 * One driver row for the recursive product-type ancestry statement.
 *
 * ★ IT CARRIES `productTypeDescription` NOW, AND THE SELECTION ROW NO LONGER DOES.
 * The locked selection has exactly three joins
 * [integrationServices/google/controllers/feed.cfc:L64-L66] and `SwProductType` is
 * not one of them, so the description is read by this statement - the same walk the
 * legacy performed lazily, per row
 * [integrationServices/google/views/feed/product.cfm:L19].
 */
function makeAncestryRow(overrides: DriverRow = {}): DriverRow {
  const named: DriverRow = {
    leafProductTypeID: 'fake-product-type-id-1',
    productTypeName: 'Fake Leaf Type',
    productTypeDescription: 'Fake product type description.',
    ancestorDistance: 0,
    ...overrides,
  };

  // `ancestorProductTypeID` DEFAULTS FROM THE DISTANCE, so an ordinary multi-row
  // fixture reads as a chain of distinct ancestors rather than as a cycle. It is
  // derived after the overrides are merged, so a case that moves a row to another
  // distance gets the matching default, and a case that names the identifier itself -
  // which is how the cyclic-data cases below are written - keeps its own value.
  return { ancestorProductTypeID: `fake-ancestor-id-${String(named.ancestorDistance)}`, ...named };
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

/**
 * The three non-executor collaborators a case may want to pre-build.
 *
 * Each is optional because most cases care about the statements the subject
 * issues and not about the collaborators at all; those cases let {@link runFeed}
 * build defaults and never look at them. A case that DOES care - one asserting
 * the batching, the whole-catalog sale-price call, or the rounding gate - hands
 * over a primed double and then reads its recording back out of the result.
 */
interface FeedCollaborators {
  readonly shippingWeights?: RecordingShippingWeightResolver;
  readonly salePrices?: RecordingSalePriceSource;
  readonly rounder?: RecordingValueRounder;
}

/**
 * Runs the subject once against a double primed with the given responses.
 *
 * ★ THIS HELPER ONCE CONSTRUCTED THE SUBJECT WITH TWO ARGUMENTS. The constructor
 * takes FIVE now: the executor and the resolved setting values as before, plus a
 * per-SKU shipping-weight resolver, a sale-price source and a value rounder. All
 * three are handed back alongside the recorder so a case can assert on what the
 * subject asked them, which is the only way to prove the batching and the
 * whole-catalog sale-price call from outside.
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
 *
 * Every case that asserts on the STATEMENTS the subject issues needs the three
 * non-executor collaborators present and needs nothing from them, so each would
 * otherwise repeat the same three constructions. Cases that DO assert on a
 * collaborator use {@link runFeed} and read the recording out of its result, or
 * construct the subject in full themselves.
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

    // Eighteen aliased columns in the select list, against the dead statement's
    // two. The list is bounded explicitly so the one table alias further down the
    // statement is not counted as a column.
    //
    // The count was seventeen and is eighteen: `SwBrand.brandID` was added so the
    // brand element can be gated on the ASSOCIATION rather than on the name, which
    // is what the legacy conditional tests
    // [integrationServices/google/views/feed/product.cfm:L32]. The join it reads was
    // already there [integrationServices/google/controllers/feed.cfc:L66] - only the
    // projection widened, so no table was added and no predicate changed.
    const selectList = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM SwSku'));

    expect(countMatches(selectList, /\bAS\s+\w+/g)).toBe(18);

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
    //
    // ★ THIS COUNT WAS 22 AND IS 23 NOW. `brandID` joined the projection so the
    // renderer can gate `<g:brand>` on brand PRESENCE rather than on the nullable
    // name [integrationServices/google/views/feed/product.cfm:L32], and it costs no
    // extra join: it is `SwBrand.brandID` as the LEFT join resolved it, and `SwBrand`
    // was already joined for the name
    // [integrationServices/google/controllers/feed.cfc:L66].
    expect(row.skuCode).toBe('FAKE-SKU-1');
    expect(row.calculatedTitle).toBe('Fake Product Title');
    expect(Object.keys(row)).toHaveLength(23);
  });
});

// ---------------------------------------------------------------------------
// The collaborator the legacy controller never used
// ---------------------------------------------------------------------------

describe('the never-read legacy collaborator is flagged and no use is invented for it', () => {
  it('takes exactly five collaborators, none of them a product service', () => {
    // [integrationServices/google/controllers/feed.cfc:L51] declares a product
    // service alongside the SKU service at L52, and the body at L58-L73 reads
    // ONLY the SKU service, at L63. The declaration is dead. Interface parity
    // binds METHODS, not unused injections, so it is not carried forward - and no
    // purpose has been invented for it either.
    //
    // ★ THIS CASE ONCE ASSERTED A CONSTRUCTOR ARITY OF TWO, AND NAMED TWO FIELDS.
    // The arity is five now, and the three additions are not a product service and
    // not a service locator: they are a per-SKU shipping-weight resolver, a
    // sale-price source and a value rounder. Each exists because the legacy resolved
    // that value INSIDE its row loop - the settings per SKU
    // [integrationServices/google/views/feed/product.cfm:L58] and the sale price off
    // a per-product memo [model/entity/Product.cfc:L517-L522] - so a constructor
    // holding one pre-resolved value per feed could not answer them. The point this
    // case has always made survives the growth intact: not one of the five is a
    // catalog service, and the next case proves that by name.
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
    const repository = makeRepository(recorder);
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
  it('joins the product table inner, and the other two tables outer', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // Verified against the framework source rather than inferred: an empty join
    // type is rewritten to `left` before HQL is emitted
    // [org/Hibachi/HibachiSmartList.cfc:L538-L541, emitted at L549], so all three
    // calls at [integrationServices/google/controllers/feed.cfc:L64-L66] were
    // outer joins. The product table is inner here only because the three product
    // predicates reject every null-extended row regardless.
    //
    // ★ THIS CASE ONCE EXPECTED THREE OUTER JOINS AND WAS TITLED "THE OTHER THREE
    // TABLES". The third was a `SwProductType` join that the controller never asked
    // for: the live entrypoint declares its joins one call at a time and makes
    // exactly three [integrationServices/google/controllers/feed.cfc:L64-L66], so a
    // fourth was this port's own addition. The selection has three joins now - one
    // inner and two outer - and the product-type description travels on the recursive
    // ancestry statement that already walked that table.
    expect(occurrencesOf(sql, 'INNER JOIN')).toBe(1);
    expect(occurrencesOf(sql, 'LEFT JOIN')).toBe(2);
    expect(occurrencesOf(sql, 'JOIN')).toBe(3);
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

  it('resolves both product-type values from the ancestry statement, not from a fourth join', async () => {
    const withoutAncestry = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [],
    });
    const { recorder, rows } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow({ productTypeDescription: 'From the ancestry walk.' })],
    });

    // ★ THIS CASE ONCE READ "THE DESCRIPTION COMES FROM THE JOIN, AND THE BREADCRUMB
    // DOES NOT", AND SEPARATED THE TWO VALUES ON THAT BASIS. The separation was real
    // but the carrier was wrong: the description was arriving from a `SwProductType`
    // join the controller never declared
    // [integrationServices/google/controllers/feed.cfc:L64-L66]. Both values come
    // from the recursive ancestry statement now, which already walks that table, so
    // with the ancestry empty BOTH are absent and with it present BOTH arrive. The
    // selection names the product type only as a foreign key.
    expect(withoutAncestry.rows[0]?.productTypeDescription).toBeUndefined();
    expect(withoutAncestry.rows[0]?.productTypeSimpleRepresentation).toBeUndefined();
    expect(rowAt(rows, 0).productTypeDescription).toBe('From the ancestry walk.');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Fake Leaf Type');
    expect(statementOfKind(recorder, 'selection').sql).not.toContain('SwProductType');
    expect(statementOfKind(recorder, 'ancestry').sql).toContain('SwProductType');
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
    //
    // ★ THE PRODUCT-TYPE HALF OF THIS IS NOW TRUE FOR A SECOND REASON. The table is
    // no longer joined at all, so a qualified predicate on it is unwritable rather
    // than merely absent; the selection names the product type only as the foreign
    // key column it projects, which the third assertion pins so the case does not
    // pass by having nothing to look at.
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
    const repository = makeRepository(recorder);

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
    const repository = makeRepository(recorder);

    // Constructor injection is the mechanism, and this suite is the proof: a
    // hand-written double with exactly three members satisfies the collaborator
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
    //
    // ★ THIS SET ONCE HELD `SwProductType` AS WELL. It was there because the
    // selection carried a fourth join the controller never declared
    // [integrationServices/google/controllers/feed.cfc:L64-L66]; the set is the
    // three tables the three declared joins reach, and `SwSku` appears once for
    // both of its roles because the self-join is aliased rather than renamed.
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

/**
 * Every member the projection contract names, sorted for a stable comparison.
 *
 * ★ `brandID` JOINED THIS LIST, AND IT IS THE JOINED KEY RATHER THAN A BOOLEAN.
 * The renderer gates `<g:brand>` on brand PRESENCE
 * [integrationServices/google/views/feed/product.cfm:L32] and the name is only the
 * body, so presence needs a carrier of its own. Two carriers were possible - a
 * reduced `brandPresent` flag, or the brand key AS THE LEFT JOIN RESOLVED IT - and
 * the key is what the projection carries, because it answers the same question
 * without discarding information at the boundary. `SwBrand` is joined for the name
 * already [integrationServices/google/controllers/feed.cfc:L66], so reading one more
 * of its columns costs no join.
 *
 * ⚠ IT IS NOT `SwProduct.brandID`. The selection carries that column too, under its
 * own label, for the setting-lookup path `product.brand.brandID`
 * [model/service/SettingService.cfc:L519] - but the raw foreign key is present even
 * when the brand row it names has been deleted, and gating on it would emit an empty
 * `<g:brand>` for a product with no resolvable brand.
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

    // This line previously asserted `skuSalePrice` was undefined, and it is inverted
    // rather than deleted because the property under test is unchanged: the three
    // quantities stay APART. With no qualifying promotion the sale price equals the
    // SKU price, and that is the legacy accessor's own answer - `getSalePrice()` falls
    // through to `return getPrice()` [model/entity/Sku.cfc:L546-L551]. It is a
    // separate member holding an equal value, not the same member read twice, which
    // is precisely why the gate at L28 then compares equal and emits nothing.
    expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('19.99');

    // And with no promotion the two members hold the SAME value object, which is
    // stated rather than worked around: the fallback hands the SKU price straight
    // through, and `Money` is immutable, so nothing downstream can mutate one member
    // by holding the other. What matters is that they are separate MEMBERS - a
    // promotion populates one and leaves the other alone, as the case below shows.
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
    // ★ THIS CASE ONCE PASSED BOTH VALUES AS SETTING OVERRIDES. They are resolved
    // PER SKU now, so they arrive through the resolver double instead - the
    // assertion about their carrier TYPE is unchanged and is what the case is for.
    const shippingWeights = new RecordingShippingWeightResolver(
      new Map([
        ['fake-sku-id-1', { skuShippingWeight: '12.750', skuShippingWeightUnitCode: 'fakeunit' }],
      ]),
    );
    const { rows } = await runFeed({ selection: [makeSelectionRow()] }, {}, { shippingWeights });
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

    // ★ THIS CASE ONCE READ "THE SETTINGS PORT ... IS LOCKED TO A KEY UNION THAT
    // EXCLUDES BOTH WEIGHT KEYS, AND THE PORT SET IS CLOSED, SO THE VALUES ARRIVE AS
    // PROJECTION DATA INSTEAD." Both halves of that were true and the conclusion it
    // drew - resolve them once, outside, and hand them in as constructor data - was
    // not, because the legacy resolves them INSIDE its row loop and a SKU-level
    // setting overrides its product's [model/service/SettingService.cfc:L517-L519].
    // One value per feed cannot express that. They arrive per SKU now, through a
    // dedicated resolver; the point this case makes is unchanged, and is the one
    // below: whatever the carrier, neither value is ever selection input.
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
          // Both brand columns, because they are two columns and only the joined one
          // reaches `row.brandID`. Nulling the raw foreign key alone would leave the
          // join resolved and the member populated.
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

    // ★ THIS CASE ONCE ASSERTED `imageLinkPath` WAS UNDEFINED TOO, AND LISTED
    // `productTypeDescription` AMONG THE NULLED SELECTION COLUMNS. Neither survives:
    // the description is no longer a selection column at all - it travels with the
    // ancestry statement, which this case leaves unanswered, so it is absent for that
    // reason instead - and an absent image is NOT absence. The legacy image resolver's
    // final branch is unconditional [model/service/ImageService.cfc:L88], so a SKU
    // with no image file still rendered a path; leaving this undefined made the
    // renderer emit a bare scheme and host. The fallback belongs here, and it is
    // asserted rather than merely allowed.
    expect(row.imageLinkPath).toBe('/fake-missing-image.jpg');
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
    // ★ THE NULLED `productTypeDescription` OVERRIDE IS GONE FROM THIS CALL. It is
    // not a selection column any more; the ancestry statement carries it, and this
    // case answers that statement with nothing, so the value is absent for that
    // reason. What is asserted about it is unchanged.
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productDescription: null })],
      ancestry: [makeAncestryRow({ productTypeDescription: null })],
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

  it('leaves the expiration absent, and the sale price equal to the price, when no promotion applies', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow(), makeSelectionRow({ skuID: 'fake-sku-id-2' })],
      ancestry: [makeAncestryRow()],
      images: [makeImageRow()],
    });

    // This case previously asserted BOTH members were absent on every row, and gave
    // as its reason that "the legacy resolves both through the promotion sale-price
    // path, which is another module's capability". The premise about the persisted
    // columns [model/entity/Sku.cfc:L115, L118] is true; the conclusion drawn from it
    // was not. The subject now resolves the pair through an injected detail source,
    // so the state under test is the NO-PROMOTION state rather than every state, and
    // the two members answer it differently:
    //
    //   - the sale price falls back to the SKU price, because that is what the legacy
    //     accessor itself returns [model/entity/Sku.cfc:L546-L551];
    //   - the expiration stays absent, because the legacy accessor answers with an
    //     EMPTY STRING [model/entity/Sku.cfc:L560-L565] and there is no interval.
    //
    // That asymmetry is exactly what keeps the block coherent: the gate at
    // [integrationServices/google/views/feed/product.cfm:L28] compares equal, so
    // neither element is emitted and the half-formed block is impossible.
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

    // The members are present rather than missing whichever way they resolved, so a
    // consumer reads a documented value or a documented absence instead of finding
    // nothing at all.
    expect('skuSalePrice' in row).toBe(true);
    expect('salePriceExpirationDateTime' in row).toBe(true);
  });

  it('reads no ambient clock for the expiration, and inlines no date', async () => {
    const { recorder, rows } = await runFeed({ selection: [makeSelectionRow()] });

    // With no promotion primed the expiration is absent, and - the point of the case -
    // the subject did not reach for a clock to decide that. The legacy's own currency
    // test lives inside the sale-price query, which captures `now()` itself
    // [model/dao/PromotionDAO.cfc:L306] and compares it against the period boundaries
    // at L317-L319, so the instant belongs to the resolving statement rather than to
    // this one. No date literal appears in any statement this subject issues.
    expect(rowAt(rows, 0).salePriceExpirationDateTime).toBeUndefined();
    expect(allStatements(recorder)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// The sale pair, when a promotion does apply
//
// ★★ THIS SECTION ONCE RESOLVED THE PAIR PER PRODUCT, AND THE SUPERSESSION IS
// RECORDED HERE RATHER THAN ERASED. Seven cases lived below, built on a
// `SalePriceDetail` source asked once per DISTINCT product - a faithful copy of the
// legacy granularity, because the legacy memoizes the reduction on the product
// [model/entity/Product.cfc:L517-L522] and every SKU of that product reads the same
// struct, its two accessors picking their own key out of it
// [model/entity/Sku.cfc:L546-L551, L560-L565].
//
// The premise that survived is the important one: NEITHER HALF IS A PERSISTED COLUMN
// ON THE SKU [model/entity/Sku.cfc:L115, L118], and both are still carryable - the
// price is a CASE over persisted columns [model/dao/PromotionDAO.cfc:L338-L342] and
// the expiration is `SwPromotionPeriod.endDateTime`, projected under exactly this
// name at L344 and carried through both query-of-queries stages at L552 and L579.
//
// What changed is the number of questions. The memo made per-product resolution look
// free; it is not, once the caller is a feed over the WHOLE catalog rather than one
// product page - it is one reduction per product, which is the N+1 the lazy traversal
// hid. The port therefore asks ONCE, without naming a product, and keys the winners
// per SKU. That is strictly fewer round trips for the same answers, and it cannot
// disagree with itself the way N separate resolutions can: the resolving statement
// captures `now()` itself [model/dao/PromotionDAO.cfc:L306] and compares it against
// the period boundaries at L317-L319, so two resolutions straddling a boundary
// answered differently.
//
// The cases proving the whole-catalog call, the per-SKU keying, the rounding gate and
// the duplicate-key rule live in the sale-price describe further down, against the
// collaborator that survived. The two assertions the earlier block made that its
// successor did not make are ported HERE, in the successor's shape, because each pins
// a real state rather than a mechanism.
// ---------------------------------------------------------------------------

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

    // ⚠ A LIVE SALE WITH NO END DATE IS A REAL STATE, NOT A DEFENSIVE BRANCH. A
    // promotion period whose `endDateTime` is null still qualifies as current
    // [model/dao/PromotionDAO.cfc:L319] and projects a null expiration at L344, so the
    // price is populated and the interval is not. Substituting an end - or refusing the
    // sale for want of one - would both be inventions.
    expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('12.34');
    expect(row.salePriceExpirationDateTime).toBeUndefined();

    // And the sale price wins over the column while the column itself survives
    // untouched, which is the whole point of the accessor: `getSalePrice()` answers the
    // reduction's value when there is one and falls through to `getPrice()` when there
    // is not.
    expect(moneyOf(row.skuPrice, 'SKU price').toDecimalString()).toBe('19.99');
  });

  it("keys the winners by SKU, so one product's SKUs can differ", async () => {
    const salePrices = new RecordingSalePriceSource([
      // Only the FIRST SKU is on sale, which is the ordinary case for a product whose
      // promotion targets one variant.
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

    // The unmatched SKU falls through to its own price rather than borrowing its
    // sibling's discount or losing its value entirely - and it is a SIBLING, so a
    // resolution keyed on the shared product rather than on the SKU would have handed
    // it the discount.
    expect(moneyOf(rowAt(rows, 1).skuSalePrice, 'second sale price').toDecimalString()).toBe(
      '29.99',
    );
  });

  it('issues no statement of its own for the sale pair', async () => {
    const salePrices = new RecordingSalePriceSource([makeSalePriceRewardRow()]);
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] }, {}, { salePrices });

    // The resolution is DELEGATED, so this subject still owns exactly three
    // statements. It reaches no promotion table itself, which is what keeps the
    // sale-price statement's ownership where it already was.
    expect(recorder.captured).toHaveLength(3);
    expect(allStatements(recorder)).not.toMatch(/SwPromotion/i);
  });
});

// ---------------------------------------------------------------------------
// The brand, projected as two independent questions
//
// [integrationServices/google/views/feed/product.cfm:L32] guards on
// `not isNull(local.sku.getProduct().getBrand())` and interpolates
// `getBrandName()` into the body. An association test and a value read are two
// questions, and the join that answers the first is LEFT
// [integrationServices/google/controllers/feed.cfc:L66], so an unmatched row and
// a matched row with a null name are genuinely different states.
//
// ★★ THE CARRIER FOR THE FIRST QUESTION WAS ONCE A BOOLEAN `brandPresent`, AND IT IS
// THE JOINED KEY NOW. Three cases below read `row.brandPresent` and asserted `true`,
// `true` and `false`; each is rewritten to read `row.brandID`, which is
// `SwBrand.brandID` as the LEFT join resolved it. Nothing about the three STATES
// changed - matched with a name, matched with no name, unmatched - and the reduction
// to a boolean was the only thing lost, which cost information for no gain.
//
// ⚠ AND THE GATE IS THE JOINED KEY, NOT THE FOREIGN KEY. `SwProduct.brandID` is
// selected too, under its own label, because the setting-lookup path
// `product.brand.brandID` [model/service/SettingService.cfc:L519] needs the column.
// A product whose `brandID` names a row that no longer exists has a foreign key and
// NO BRAND: the legacy conditional tested the resolved association and emitted
// nothing for it, so the third case below hands over exactly that row - a populated
// `brandID` with an unmatched join - and asserts the element's carrier is absent.
// ---------------------------------------------------------------------------

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

    // THE STATE THE FINDING WAS ABOUT. A brand row exists, so the legacy conditional
    // was true and the element was emitted; its body was empty because CFML
    // stringifies a null name to nothing. Reading the name alone cannot see this,
    // which is why the key is carried separately.
    expect(row.brandID).toBe('fake-brand-id-1');
    expect(row.brandName).toBeUndefined();
  });

  it('reports the association absent when the join did not match, DESPITE a foreign key', async () => {
    const { rows } = await runFeed({
      selection: [
        makeSelectionRow({
          // The product still names a brand...
          brandID: 'fake-brand-id-1',
          // ...and no `SwBrand` row answers to it.
          joinedBrandID: null,
          brandName: null,
        }),
      ],
    });
    const row = rowAt(rows, 0);

    // ⚠ THIS IS THE CASE THAT DISTINGUISHES THE TWO COLUMNS, AND IT IS THE REASON THE
    // GATE IS NOT THE FOREIGN KEY. `not isNull(...getBrand())` asks the ORM to RESOLVE
    // the association, and a dangling key resolves to nothing - so the legacy emitted
    // no `<g:brand>` here. Gating on `SwProduct.brandID` would have emitted an empty
    // one, filled from a name the join never supplied.
    expect(row.brandID).toBeUndefined();
    expect(row.brandName).toBeUndefined();

    // And the row still appears: a product with no resolvable brand is in the feed,
    // simply without that element.
    expect(rows).toHaveLength(1);
  });

  it('selects the brand id from the join the live path already declared', async () => {
    const { recorder } = await runFeed({ selection: [makeSelectionRow()] });
    const { sql } = statementOfKind(recorder, 'selection');

    // The projection widened; the FROM clause did not. The brand join was already
    // there [integrationServices/google/controllers/feed.cfc:L66] and is still the
    // only place the brand table is reached, so no row can be lost by reading one
    // more of its columns.
    expect(sql).toContain('SwBrand.brandID');
    expect(sql).toContain('SwBrand.brandName');
    expect(countMatches(sql, /SwBrand/g)).toBe(4);

    // Both brand keys are projected, under DIFFERENT labels, which is what lets one
    // gate the element and the other key the setting lookup.
    expect(sql).toContain('SwProduct.brandID                    AS brandID');
    expect(sql).toContain('SwBrand.brandID                      AS joinedBrandID');
  });

  it('carries the brand id as a key the renderer never emits', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow()] });
    const row = rowAt(rows, 0);

    // ★ THIS CASE ONCE ASSERTED `'brandID' in row` WAS FALSE, under the title 'never
    // emits the brand id, which exists only to answer the gate', on the grounds that
    // "the column is reduced to a boolean at the projection boundary rather than
    // carried onward as an identifier a consumer might be tempted to use."
    //
    // THE PREMISE ABOUT THE RENDERER IS STILL EXACTLY RIGHT and the reduction is what
    // went. There is no brand-id element in the view
    // [integrationServices/google/views/feed/product.cfm], so nothing downstream may
    // interpolate this - but withholding the value to enforce that is the projection
    // policing its consumer, and the renderer's own suite asserts the absence of the
    // element directly. What is asserted here is that the member IS the key, so a
    // reader can tell the gate from a boolean at a glance.
    expect(row.brandID).toBe('fake-brand-id-1');
    expect(PROJECTION_MEMBERS).toContain('brandID');
    expect(typeof row.brandID).toBe('string');
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

  it('falls back to the resolved missing-image path when the SKU stores no image file', async () => {
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: null })] },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-assets/fake-missing.jpg' },
    );

    // ★ THIS CASE ONCE ASSERTED `imageLinkPath` WAS UNDEFINED, UNDER THE TITLE
    // "PERFORMS NO MISSING-IMAGE SUBSTITUTION", AND REASONED THAT "THERE IS NO
    // SANCTIONED FALLBACK TO NAME INSTEAD". Two of its three premises hold: resizing
    // is genuinely out of scope, and the settings port's key union genuinely excludes
    // the missing-image key. The conclusion does not follow from them. The legacy
    // resolver's chain ends in an UNCONDITIONAL else
    // [model/service/ImageService.cfc:L82-L88], so every SKU rendered SOME path and
    // none rendered nothing; the accessor the view calls even names the setting to
    // use [model/entity/Sku.cfc:L199]. Carrying nothing made the renderer emit a bare
    // scheme and host as the image address. The effective fallback is resolved once,
    // outside, and handed in with the other setting values - which is how the port's
    // key union stays closed and the behaviour is still reproduced.
    expect(rowAt(rows, 0).imageLinkPath).toBe('/fake-assets/fake-missing.jpg');
  });

  it('★★★ falls back for a STORED-BUT-UNUSABLE image file, not only for a NULL one (F41)', async () => {
    // THE GAP F41 NAMES. The legacy substitutes on `!fileExists(expandPath(imagePath))`
    // [model/service/ImageService.cfc:L81], and `''` or `'   '` in `SwSku.imageFile` interpolates to
    // `#baseImageURL#/product/default/` [model/entity/Sku.cfc:L145-L147] - a path ending in a
    // separator, which no file can satisfy. Those are STORED values whose asset is absent, and the
    // NULL-only test let them through: the feed published `g:image_link` pointing at a DIRECTORY,
    // which Google Merchant Center rejects the item on.
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
    // The blankness test decides whether to substitute and rewrites nothing. A stored name that
    // merely carries surrounding space still addresses whatever the storefront serves under that
    // exact name, and silently normalizing it here would change the URL the legacy published.
    const { rows } = await runFeed(
      { selection: [makeSelectionRow({ skuImageFile: ' fake-padded.jpg ' })] },
      { baseImageURL: '/fake-assets', missingImagePath: '/fake-missing.jpg' },
    );

    expect(rowAt(rows, 0).imageLinkPath).toBe('/fake-assets/product/default/ fake-padded.jpg ');
  });

  it('★★★ applies the same trigger to BOTH components of an additional image path (F41)', async () => {
    // The image path interpolates TWO stored components [model/entity/Image.cfc:L79-L81], so either
    // one being unusable collapses it. A blank `directory` yields `base//file.jpg`, which addresses
    // something other than what was stored even where a filesystem would collapse the double
    // separator - so it takes the fallback, exactly as a blank `imageFile` does.
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

    // FOUR rows in, FOUR elements out - one per image row, as the legacy loop emitted.
    expect(rowAt(rows, 0).additionalImageLinkPaths).toStrictEqual([
      '/fake-missing.jpg',
      '/fake-missing.jpg',
      '/fake-missing.jpg',
      '/fake-assets/fake-dir/fake-usable.jpg',
    ]);
  });

  it('publishes a WELL-FORMED stored path unprobed, which is the declared residual gap (F41)', async () => {
    // ⚠ ASSERTED SO THE LIMIT IS VISIBLE RATHER THAN IMPLIED. A path that names a file is published
    // even though the file may have been deleted, where the legacy `fileExists` probe would have
    // substituted. Closing it needs an asset store to interrogate, and there is none to ask: a
    // Lambda has no `expandPath` filesystem and a per-row HTTP probe would issue one network call
    // per SKU and make the feed depend on the storefront being reachable. Registered in
    // `tests/traceability/legacyTestMap.ts` as an acknowledged gap, not as parity.
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
    // [model/service/ImageService.cfc:L83-L88] and never has the product-default
    // segments interpolated around it, so neither the base prefix nor the literal
    // middle segment may appear.
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

    // CFML parity [model/entity/Image.cfc:L79-L81]: unlike the SKU path, the middle
    // segment is the image row's own directory column.
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

    // ★ THIS CASE ONCE EXPECTED ONE PATH FROM THREE ROWS, TITLED "CONTRIBUTES
    // NOTHING FOR AN IMAGE ROW MISSING A PATH COMPONENT". Skipping the row was the
    // wrong reproduction: the legacy loop iterates the product's images and calls the
    // resizing accessor once per image
    // [integrationServices/google/views/feed/product.cfm:L24], and that accessor's
    // fallback chain ends in an unconditional else
    // [model/service/ImageService.cfc:L88], so a row with an unusable component still
    // produced an element - the FALLBACK path, not nothing. One image row means one
    // additional-image element, always, and the ORDER is the selection's.
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

    // ★ THIS CASE ONCE ASSERTED THAT A PRODUCT WITH ONE UNUSABLE IMAGE ROW AND A
    // PRODUCT WITH NO IMAGE ROW AT ALL WERE "INDISTINGUISHABLE DOWNSTREAM, WHICH
    // MATCHES A LEGACY LOOP THAT SIMPLY HAD NO ROWS TO EMIT." The second clause is
    // the error: the legacy loop had a row and therefore emitted an element. The two
    // states are distinguishable and the distinction is asserted, which is the honest
    // reading of a loop over rows rather than over usable rows.
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
// The product-type ancestry bound (S-18)
//
// A `parentProductTypeID` cycle is corrupt data, not a business rule, and neither
// legacy walk guards against it: `getSimpleRepresentation()`
// [model/entity/ProductType.cfc:L273-L278] recurses with no visited set, and
// `buildIDPathList()` [org/Hibachi/HibachiEntity.cfc:L308-L324] is a
// `do...while(hasParent)` loop with no visited set either. Reproducing the behaviour
// exactly would mean reproducing a failure, so the port bounds the walk in two
// layers, and these are the cases that hold each layer to its claim.
//
//   * THE DEPTH CEILING is in the statement, because the resource it bounds is the
//     server's recursion. It was verified against a live MySQL 8.0.46: the emitted
//     statement over a three-node cycle returns exactly 121 rows and exits 0, while
//     the same statement with the predicate removed fails with
//     `ERROR 3636 ... Recursive query aborted after 1001 iterations` - which is the
//     feed-wide failure the finding names. The cases here pin the ceiling's presence
//     and its derivation; the termination itself is not observable through a fake
//     executor and was measured out of band.
//   * THE VISITED-IDENTIFIER PREDICATE is in `buildProductTypeBreadcrumb`, which is
//     where the rows become a value, and IS observable here - the recorder can hand
//     back cyclic rows whatever the statement said. That is what the finding's
//     "test cyclic legacy data" asks for, and it is defence in depth besides.
// ---------------------------------------------------------------------------

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

    // Root-first, every segment kept, the separator carried verbatim
    // [model/entity/ProductType.cfc:L275]. This is the case that proves the bound is
    // invisible to data the legacy schema can actually hold.
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Root &raquo; Middle &raquo; Leaf');
  });

  it('★★ renders a self-referencing product type once rather than once per recursion step', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'self-parent' })],
      // What the statement returns for `parentProductTypeID = productTypeID`: the same
      // ancestor at every distance, up to the ceiling. Two rows are enough to
      // distinguish "stops at the repeat" from "renders them all".
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
      // Exactly the shape a live MySQL 8.0.46 returned for a -> b -> c -> a, trimmed
      // to two laps: distinct at distances 0-2, then the first lap repeats.
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

    // Three segments, not six: the walk is leaf-first and stops the moment it meets an
    // identifier it has already passed through, so the breadcrumb is the acyclic
    // prefix rendered root-first.
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe(
      'Cycle C &raquo; Cycle B &raquo; Cycle A',
    );
  });

  it('rejects the repeat wherever the driver happens to order the rows', async () => {
    const { rows } = await runFeed({
      selection: [makeSelectionRow({ productTypeID: 'cycle-a' })],
      // The statement carries no ORDER BY, so row order is the server's to choose. The
      // assembler sorts by distance itself; this case proves the rejection does not
      // depend on the arrival order.
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

    // The description is read from the `ancestorDistance === 0` row, which the
    // truncation never removes, so the fallback `description` survives a cycle even
    // though the breadcrumb shortened.
    expect(rowAt(rows, 0).productTypeDescription).toBe('The leaf description.');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe('Cycle A');
  });

  it('carries the ancestor identity in the projection, which is what makes a repeat recognisable', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // Both members supply it - the anchor from the requested type, the recursive member
    // from the ancestor it just reached - and the outer projection returns it.
    expect(occurrencesOf(ancestry.sql, 'ancestorProductTypeID')).toBe(2);
    expect(ancestry.sql).toContain('ancestor.productTypeID');
  });

  it('★★ bounds the statement own recursion with a depth ceiling derived from the legacy path column', async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const ancestry = statementOfKind(recorder, 'ancestry');

    // 120 is the greatest distance the recursive member may PRODUCE, so a chain is at
    // most 121 rows. The number is derived, not chosen: `productTypeID` is
    // `length="32"` [model/entity/ProductType.cfc:L52] and `productTypeIDPath` is
    // `length="4000"` [:L53], so N identifiers plus N-1 delimiters occupy 33N - 1
    // characters.
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

    // The ceiling is part of the statement's structure. The only bound value is the
    // key list, so nothing reaching this adapter from outside can widen the walk.
    expect(boundParameters(ancestry)).toStrictEqual(['fake-type-a']);
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
    const repository = makeRepository(recorder);

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

  it('holds only the five collaborators it was constructed with', () => {
    const repository = makeRepository(new RecordingExecutor());

    // No configuration field, no cache field, no connection field and no clock. The
    // whole of what the subject knows arrived through its constructor, which is what
    // makes it assertable without an environment of any kind.
    //
    // ★ THIS COUNT WAS TWO AND IS FIVE. The three additions are collaborators, not
    // state: a per-SKU shipping-weight resolver, a sale-price source and a value
    // rounder. The property this case protects is unchanged - nothing is held that did
    // not arrive through the constructor.
    expect(Object.getOwnPropertyNames(repository)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// The two product-type values, and where they now come from
//
// NET-NEW COVERAGE, declared as such per AAP 0.6.6. No legacy test touches the
// Google subsystem at all: a case-insensitive search of meta/ for `google`
// matches zero lines, so nothing below extends a legacy antecedent.
//
// The live entrypoint declares its joins one call at a time and makes EXACTLY
// THREE [integrationServices/google/controllers/feed.cfc:L64-L66]. The view then
// reads two product-type values by lazy traversal - the description as the
// second description candidate [integrationServices/google/views/feed/product.cfm:L19]
// and the breadcrumb [L21] - and a lazy traversal after the selection is not a
// fourth join. Both values therefore travel on the recursive ancestry statement,
// which already walks `SwProductType`.
// ---------------------------------------------------------------------------

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

    // The anchor is the requested type's own row, so its description is the requested
    // type's own description and its provenance is visible in the statement.
    expect(sql).toContain('leaf.productTypeDescription AS productTypeDescription');
    expect(sql).toContain('FROM SwProductType AS leaf');
  });

  it("carries the anchor's description up the chain unchanged, never an ancestor's", async () => {
    const { recorder } = await runFeed({
      selection: [makeSelectionRow()],
      ancestry: [makeAncestryRow()],
    });
    const { sql } = statementOfKind(recorder, 'ancestry');

    // The recursive member takes the name from the ANCESTOR and the description from
    // the DESCENDANT. Taking both from the ancestor would silently answer with the root
    // type's description for every leaf.
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

    // The rows come back flat and unordered, and only the distance-zero row is the
    // requested type. Reading an arbitrary member of the group would be correct only
    // while the recursion happens to repeat the value.
    expect(rowAt(rows, 0).productTypeDescription).toBe('The leaf own description.');
    expect(rowAt(rows, 0).productTypeSimpleRepresentation).toBe(
      'Fake Root Type &raquo; Fake Leaf Type',
    );
  });
});

// ---------------------------------------------------------------------------
// The per-SKU shipping weight
//
// NET-NEW COVERAGE, declared as such per AAP 0.6.6.
//
// [integrationServices/google/views/feed/product.cfm:L58] calls `setting()` on the
// SKU, INSIDE the row loop, for both halves of the shipping weight. The lookup
// order for a SKU begins with a setting bound to the SKU ITSELF and then walks
// product, product-type path and brand [model/service/SettingService.cfc:L102-L106,
// L517-L519], so two SKUs of one product can legitimately resolve to different
// weights. One value per feed cannot express that, which is why the pair is
// resolved per SKU - batched, so the legacy's own per-row lookup is not reproduced
// as a per-row round trip.
// ---------------------------------------------------------------------------

/** The resolver's single recorded subject list, narrowed rather than asserted. */
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

/** One recorded subject at an ordinal, narrowed the same way. */
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

    // This is the whole finding: the two SKUs share a product, and one value per feed
    // would have copied one weight onto both.
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

    // The legacy called `setting()` inside its row loop. Reproducing the RESULT is
    // required; reproducing the N+1 is not, and the repository boundary is where that
    // choice is made once.
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

    // [model/service/SettingService.cfc:L104] names three relationship paths for a SKU
    // subject: the product, the product-type path combined with the brand, and the
    // product-type path alone. Every identifier those paths start from is handed over,
    // so expanding the path is the resolver's step and not a second selection here.
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
    // [integrationServices/google/controllers/feed.cfc:L66] - and neither is defaulted
    // into a placeholder identifier that would resolve the wrong setting.
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
    // [model/service/SettingService.cfc:L232-L233]. A resolver that omits a SKU is
    // broken, and publishing a weight the merchant never configured is worse than
    // failing.
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

// ---------------------------------------------------------------------------
// The sale price
//
// NET-NEW COVERAGE, declared as such per AAP 0.6.6.
//
// [integrationServices/google/views/feed/product.cfm:L28-L31] compares the SKU
// price against its sale price and, when the sale price is lower, emits both the
// sale price and an effective-date range whose far end is the expiration. Both
// values come from a per-product memo the view reaches lazily
// [model/entity/Sku.cfc:L539-L551, L560-L565; model/entity/Product.cfc:L517-L522],
// and the reduction behind that memo is eight lines of service code
// [model/service/PromotionService.cfc:L1022-L1030]. Those eight lines are what is
// reproduced here, at the seam, through two narrow collaborators.
// ---------------------------------------------------------------------------

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

    // The port's `productID` is optional and its PRESENCE is what each union branch
    // tests, so omitting it genuinely means every product. One statement answers a
    // whole-catalog feed; asking per product would be one statement per row.
    expect(salePrices.calls).toStrictEqual([undefined]);
  });

  it('falls the price back to the SKU price and leaves the expiration absent when no reward wins', async () => {
    const { rows } = await runFeed({ selection: [makeSelectionRow({ skuPrice: '19.99' })] });
    const row = rowAt(rows, 0);

    // ★ THIS CASE ONCE ASSERTED BOTH MEMBERS WERE ABSENT, titled 'leaves both sale
    // members absent for a SKU no reward wins', reasoning that "absent means 'no sale'
    // and never zero: a zero sale price would advertise a free product."
    //
    // THE ZERO HALF IS RIGHT AND STILL ASSERTED. The absence half is not: the accessor
    // the view calls does not answer with an absence. `Sku.getSalePrice()` ends in
    // `return getPrice()` [model/entity/Sku.cfc:L546-L551], so a SKU with no sale
    // reports its own price - and that is what makes the view's gate
    // `getPrice() gt getSalePrice()` [integrationServices/google/views/feed/product.cfm:L28]
    // compare EQUAL and emit nothing. Projecting `undefined` would have made the
    // renderer's suppression rest on a presence test the source never performed.
    //
    // The EXPIRATION genuinely has no fallback - it answers with an empty string
    // [model/entity/Sku.cfc:L560-L565], which is no instant at all - so the asymmetry
    // below is the source's own.
    expect(moneyOf(row.skuSalePrice, 'SKU sale price').toDecimalString()).toBe('19.99');
    expect(row.salePriceExpirationDateTime).toBeUndefined();

    // Never zero, in either direction: a NULL price column carries no sale price
    // either, rather than a free one.
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

    // The legacy gate is `roundingRuleID != ""`
    // [model/service/PromotionService.cfc:L1025] - an emptiness test, because a query
    // renders a null column that way. An absent identifier and an empty one are
    // therefore both "no rounding", and sending `''` to a rule lookup would find no row.
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

    // Not a choice made here. `queryToStructOfStructures` assigns into the structure
    // while walking rows in order [model/service/HibachiUtilityService.cfc:L545-L551],
    // so a later row silently overwrites an earlier one - and the reward query
    // deliberately does not disambiguate a tie. The HIGHER price winning is the point:
    // a minimum, a sort or a recency preference would each be this port's invention.
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
    // [model/service/PromotionService.cfc:L1024-L1028], so the overwritten row is never
    // rounded. Rounding before keying would issue a rule lookup per reward row.
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
    // Asking for the whole catalog in one statement is the shape a whole-catalog feed
    // needs, and filtering to the selection is what keeps the RESULT the same.
    //
    // The unselected reward names a rounding rule, which is what makes the DROP
    // observable rather than merely invisible: an unfiltered reduction would round it
    // and so would issue a rule lookup for a SKU this feed never selected.
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

    // Three statements, as before: the selection, the ancestry walk and the images. The
    // sale-price reduction reaches its own repository through the collaborator, which is
    // what keeps the six-branch union in the module that owns it.
    expect(recorder.captured).toHaveLength(3);
    expect(allStatements(recorder)).not.toContain('salePrice');
  });
});

// ---------------------------------------------------------------------------
// Whole-catalog materialization - the ceiling, inverted
//
// A security review raised finding S-08, MEDIUM, CWE-400: whole-catalog feed materialization can
// exhaust database or container resources. It is right about the shape - the selection statement
// carries no row bound of any kind, deliberately, because the legacy controller narrowed by four
// predicates and nothing else [integrationServices/google/controllers/feed.cfc:L58-L70], so the
// selection is as large as the catalog.
//
// ★★ AN EARLIER REVISION ANSWERED IT WITH A 25,000-ROW REFUSAL, AND THIS BLOCK USED TO PIN IT. A
// later review found the refusal to be the defect. The legacy feed has no row bound, so a merchant
// whose catalog crossed the invented threshold would have had a WORKING feed replaced by an error, on
// correct data, with no legacy antecedent and no AAP authorization. The earlier disposition conceded
// as much by resting on what "could not have been DELIVERED however this adapter behaved" - a
// prediction about the runtime, not a property of the contract.
//
// SO THE REFUSAL CASES ARE NOW THEIR INVERSE, and the at-the-limit case is kept unchanged. What
// bounds the follow-up statements instead is batching: each binds one placeholder per key, and
// `sqlPlaceholderList` refuses a count above the driver's protocol limit, so the ancestry walk and
// the image read chunk their key lists. The final two cases pin that, one above the batch limit and
// one below it.
//
// THE DEPTH CEILING ON THE RECURSIVE ANCESTRY WALK IS UNAFFECTED and stays exactly where it is: it
// guards against MySQL error 3636 on cyclic legacy data, which is a platform limit rather than an
// invented one, and its own block above holds it to its claim.
// ---------------------------------------------------------------------------

describe('a whole catalog is materialized rather than refused', () => {
  /** `count` selection rows, distinct in every key the follow-up statements are keyed on. */
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

    // THE INVERTED CASE. This used to reject with `returned 25001 qualifying SKUs and at most 25000`
    // after issuing only the selection. Every qualifying SKU now reaches the feed.
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

    // WHAT REPLACED THE CEILING. Every captured statement binds at most one batch of keys, so an
    // uncapped selection cannot produce a statement the driver refuses to carry.
    for (const captured of recorder.captured) {
      expect(captured.params?.length ?? 0).toBeLessThanOrEqual(SQL_TUPLE_ROW_LIMIT);
    }

    // 2,500 distinct product identifiers become three image batches; the ancestry walk is keyed on
    // the ONE product type the selection fixture carries, so it stays a single statement.
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

    // THE EMITTED SQL IS UNCHANGED FOR EVERY REALISTIC CATALOG, which is what keeps the batching
    // invisible to every other case in this file: the selection, the ancestry walk and the images.
    expect(recorder.captured).toHaveLength(3);
  });
});
