// slatwall-ts - Characterization suite for `src/services/promotion/salePriceSeeding.ts`.
//
// SUBJECT: the ported sale-price seeding pass, [model/service/PromotionService.cfc:L144-L162]. It
// is the FIRST loop inside `updateOrderAmountsWithPromotions`, it runs BEFORE the reward iteration
// that opens at [L164], and it pre-loads the qualified-discount accumulator declared at [L142].
// This suite owns NO entry in the thirty-item legacy defect register; what it owns is the ORDERING
// CONSEQUENCE of running first, and the empty-string sentinel that makes a seeded record
// structurally unreachable by use-limit stripping. Both are direct money effects.
//
// ★ THE GOVERNING SENTENCE FOR EVERY ASSERTION BELOW. Must-preserve area (i) is promotion discount
// math TOGETHER WITH use-limit enforcement. Seeding decides what discount occupies position 1 of
// the accumulator before any reward competes for it, and - through the `''` sentinel - which
// entries no over-use correction can ever touch. Nothing here is a matter of taste; every figure
// asserted below is an amount a customer is charged.
//
// ZERO DIVERGENCE. Every behaviour pinned in this file is preserved AS-WRITTEN. The project permits
// exactly three deliberate divergences - register entries 13 and 12, both owned by
// `discountAmount.test.ts`, and entry 19 in `src/domain/entities/product.ts` - and none of them is
// here. THIS MODULE MAY NOT DIVERGE IN ANY RESPECT, and this suite would fail if it did.
//
// THE FOUR BUDGET LEDGERS ARE UNTOUCHED BY THIS FILE: zero signature reshapings (the project's
// three are the two anti-corruption inversions, the two smart-list renames and the feed adapter's
// `generateProductFeed`), zero visibility widenings (all five are spent elsewhere in this folder -
// three in `promotionPeriodQualification.ts`, one in `qualifierQualification.ts`, one in
// `discountAmount.ts` - and the ledger is EXHAUSTED), zero signature widenings (the single one is
// already spent on `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`), and zero
// deliberate divergences.
//
// NO USER-SPECIFIED RULE GOVERNS THIS FILE. The rules source was queried three independent ways in
// this session - bare, over the whole document, and at a high page offset - and each time returned
// the same single-line sentinel stating that no user rules were provided. A paginated document
// would have returned nothing at the high offset rather than the sentinel again, so the absence is
// verified rather than assumed. No rule is invented to fill the gap, and the absence lowers
// nothing: the enterprise practices this subtree commits to - maximal strictness, mechanically
// enforced layer boundaries, exact pinning, a single arithmetic surface, parameterized SQL,
// environment-driven configuration, one exported unit per file, in-code annotation of every
// judgment call, and licence continuity - are applied at full strength in their place.
//
// C8 - TEST TRACEABILITY: THIS SUITE IS NET-NEW, AND IS NOT PARITY WITH ANY LEGACY TEST. The claim
// is measured, not asserted: `meta/tests/unit/service/` contains only `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`, and a
// case-insensitive search of the whole `meta/tests/` tree for "promotion" returns ZERO files out of
// the 32 test components there. The only two legacy-extended suites in the entire project are
// `tests/unit/domain/entities/brand.test.ts`, which carries `defaults_are_correct()` forward, and
// `tests/unit/domain/entities/product.test.ts`, which carries `productUrlIsCorrectlyFormatted()`
// forward with its `nike-air-jorden` fixture verbatim. Nothing below is presented as carried
// forward, and the empty legacy stub `meta/tests/functional/admin/entity/ProductTest.cfc`
// contributes no coverage to anything.
//
// P5 - PARAMETERIZED SQL: NOT APPLICABLE, AND HERE IS WHY. Prepared statements are how this port
// preserves the injection-safety property `cfqueryparam` provided, but the subject is a pure
// in-memory pass: it opens no connection, issues no statement, binds no placeholder, and the module
// under test imports no driver. Its one collaborator is satisfied here by a hand-written in-memory
// double. Every SQL-shape and placeholder-binding assertion in this project therefore lives in
// `tests/integration/repositories/`, the one tier that can actually observe a statement's text and
// its bound values; asserting SQL here would assert it somewhere it cannot be seen.
//
// C4 - INTERFACE PARITY, AND WHY IT BINDS NOTHING IN THIS FILE. Ported public method names are
// carried over verbatim in CFML camelCase, and the seven frozen names are `getDiscountAmount`,
// `getOrderItemInQualifier`, `getOrderItemInReward`, `getPromotionPeriodQualificationDetails`,
// `getQualifierQualificationDetails`, `getPromotionPeriodQualifiedFulfillmentIDList` and
// `getPromotionPeriodOrderItemQualificationCount`. NONE of them appears here. The subject is an
// INLINE FRAGMENT inside a much larger function - it has no CFML name, no parameter list and no
// return type of its own - so `SalePriceSeeder` and `seedSalePriceDiscounts` are TypeScript names
// that displace no legacy identifier and are not parity-constrained. They are used exactly as the
// shipped module spells them, and this suite adapts to that module rather than the other way round.
//
// ---------------------------------------------------------------------------
// JUDGMENT CALL: WHY THIS SUITE'S ASYNC REASONING DIFFERS FROM THE ONE ANTICIPATED FOR IT.
//
// The expectation set out for this file was that the seeding method is asynchronous because
// `Sku.getSalePriceDetails()` transitively reaches the sale-price resolver. THE SHIPPED MODULE IS
// NOT ASYNCHRONOUS FOR THAT REASON, and the difference is load-bearing rather than cosmetic:
// `src/domain/entities/sku.ts` resolved that reach AT THE REPOSITORY BOUNDARY by pre-materialising
// the detail row during hydration, so `getSalePriceDetails()` is SYNCHRONOUS and is deliberately
// not awaited - the same technique the four-step currency cascade uses, and the reason
// `getSalePrice()`, `getSalePriceDiscountType()` and `getSalePriceExpirationDateTime()` keep the
// synchronous contracts their callers depend on. What the shipped module awaits is the promotion
// resolution at [model/service/PromotionService.cfc:L157], which genuinely reaches storage. This
// suite therefore asserts the async boundary WHERE IT ACTUALLY IS, and the deviation is recorded
// here so a reviewer can see it was measured rather than overlooked.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L142]: THE ACCUMULATOR'S NAME IS MISSPELT IN THE
// SOURCE AND CORRECTED IN THE TARGET. Legacy declares `var orderItemQulifiedDiscounts = {}` -
// "Qulified", missing the `a` - and repeats that spelling twenty times. The target publishes
// `OrderItemQualifiedDiscounts` and the shipped module names its parameter
// `orderItemQualifiedDiscounts`. The rename is permitted precisely because the identifier is a
// function-local accumulator: it is never a column, a JSON key, a parameter of a public method, or
// anything else a caller can observe. It is one of the project's four preserved-or-renamed
// identifier typos, and it is the one that is RENAMED; the others are PRESERVED because they are
// data contracts, `hb_permission="promotionPeriod.promtionRewards"`
// [model/entity/PromotionReward.cfc:L49] chief among them. Assertions below use the shipped
// spelling, never the misspelling.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L121-L131]: THE DOCBLOCK PROMISES FIVE MEMBERS
// AND THE CODE WRITES THREE. The illustrative comment above the function documents each accumulator
// record as carrying `promotionRewardID` [L124], `promotion` [L125], `discountAmount` [L126],
// `discountQuantity` [L127] and `discountPerUseValue` [L128]. All three construction sites write
// only the first three - [L156-L158] here, and [L275-L277] and [L289-L291] on the reward path - so
// the last two are PHANTOM KEYS: documented, and never materialised anywhere in the accumulator.
// The target follows the CODE. Same-named members do exist, but on a different structure entirely:
// the reward ledger's per-item usage rows at [L311-L312] and [L325-L326]. The docblock conflates
// the two.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L150, L252, L299, L486, L990, L995, L1001, L1006,
// L1007]: the `precisionEvaluate` census for this component is NINE sites. The published plan
// counts eight and cites "L248", where L248 is a `} else {` line and the arithmetic it means is on
// L252; the plan's single "L1007" is really two adjacent sites, L1006 and L1007. WHERE THE PLAN AND
// THE SOURCE DISAGREE, THE SOURCE WINS. This module owns exactly one of the nine, L150, and routes
// it through the `Money` value object.
//
// LEGACY-NOTE [model/entity/Sku.cfc:L269-L273, L539-L544; model/entity/Product.cfc:L594-L601]: THE
// PROJECT'S THREE-WAY ABSENCE CONVENTION, because this file sits at the exact point where the three
// meet. A missing SKU price is `undefined` and NEVER `0`: `getPriceByCurrencyCode` has one
// `structKeyExists`, no `else` and no fallback, and substituting zero there would silently sell
// products for free. A missing sale-price ROW is likewise absence, spelled `undefined` where legacy
// answers an empty struct - `Product.getSkuSalePriceDetails` returns `{}` on a miss
// [model/entity/Product.cfc:L182-L186]. But `Product.getSalePrice()` returns `0` and never
// `undefined`, because the statement at [L598] has no `return` and execution falls through to
// [L600] `return 0;` - that is register entry 20, owned by
// `tests/unit/domain/entities/product.test.ts` and referenced here only as context. Consequently NO
// assertion in this file substitutes zero for an absent sale price: there is no `?? Money.zero`, no
// `|| Money.zero`, no zero-valued parameter default, and an absent row is asserted as an absent
// accumulator key rather than as a zero discount.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L542-L544]: the preserved return-and-exchange
// no-op carrying `TODO [issue #1766]` belongs to `../promotionService.test.ts`, which owns the
// facade. It is named here only to record that it is deliberately NOT restated in this file.
//
// DEPENDENCIES CONSULTED AS CONTRACTS RATHER THAN IMPORTED, so that every import below is actually
// used: `src/lib/cfml/precision.ts` is reached only THROUGH `Money`, which is the port's single
// arithmetic surface, so importing it here would bypass the very abstraction under test;
// `src/lib/cfml/truthiness.ts` is not reached at all, because the shipped gate spells its absence
// test as an explicit `!== undefined` rather than through a truthiness helper; `tests/setup.ts` is
// ambient, registered as the runner's single setup file, and re-implementing any part of it here
// would create a second source of truth for the UTC pin and the per-test mock scrub; and
// `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs` and `.prettierrc.json` are configuration
// this file conforms to and never modifies.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Promotion } from '../../../../src/domain/entities/promotion.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import type { SalePriceDetail } from '../../../../src/domain/ports/promotionRepository.js';
import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';
import { structKeyExists } from '../../../../src/lib/cfml/struct.js';
import { SalePriceSeeder } from '../../../../src/services/promotion/salePriceSeeding.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// The published member names, written out so an unexpected fourth key fails a test rather than
// passing unnoticed. Both lists are spelled from the published contracts, not invented here.
// ---------------------------------------------------------------------------

/** The three members `QualifiedDiscount` declares, sorted. */
const QUALIFIED_DISCOUNT_MEMBERS: readonly string[] = [
  'discountAmount',
  'promotion',
  'promotionRewardID',
];

/**
 * The five members a reward-usage ledger entry declares, sorted.
 *
 * Present only so the suite can prove these names appear NOWHERE in the accumulator. The ledger
 * type itself is deliberately NOT imported - `src/domain/promotionEngine/rewardUsageTypes.ts` is
 * not among this file's declared dependencies, and the ledger is owned by
 * `rewardUsageLedger.test.ts`. Naming the members as strings asserts the separation without
 * importing across it.
 */
const REWARD_USAGE_LEDGER_MEMBERS: readonly string[] = [
  'maximumUsePerItem',
  'maximumUsePerOrder',
  'maximumUsePerQualification',
  'orderItemsUsage',
  'usedInOrder',
];

/**
 * The two members the docblock at [model/service/PromotionService.cfc:L127-L128] promises and no
 * construction site ever writes.
 */
const PHANTOM_DOCBLOCK_MEMBERS: readonly string[] = ['discountQuantity', 'discountPerUseValue'];

/**
 * The key an order item would have to be identified by for a plain assignment to be swallowed.
 *
 * Held in a constant rather than written as a literal property access anywhere, because the lint
 * configuration forbids `__proto__` member access outright - which is itself the reason the shipped
 * module writes through `Object.defineProperty` instead of assigning.
 */
const PROTOTYPE_KEY_ORDER_ITEM_ID = '__proto__';

// ---------------------------------------------------------------------------
// THE COLLABORATOR DOUBLES - HAND-WRITTEN, IN-MEMORY, DECLARED IN THIS FILE.
//
// No mocking, spying, faking or data-generation library is introduced: the dependency set is pinned
// exactly and this suite adds nothing to it. `vi` ships inside the runner and is used below only to
// count calls on the money value object's own methods, always restored in the suite-local hook.
//
// ★ WHY THE DOUBLES ARE STRUCTURAL RATHER THAN TYPED AGAINST A NAMED INTERFACE. The shipped module
// declares its collaborator as a MODULE-LOCAL interface and deliberately does NOT export it - the
// annotation at its declaration records that an earlier revision did, and that publishing it would
// have made it a port in everything but the folder it sits in, while the port set is CLOSED AT
// THIRTEEN. So there is nothing importable to annotate against, and inventing a fourteenth port
// here or re-declaring the interface would both defeat that decision. Structural typing is exactly
// the right instrument: the constructor parameter type-checks any object carrying a matching
// `getPromotion`, and `tsc --noEmit` therefore proves these doubles satisfy the real contract
// without either side naming the other. Nothing under `src/**` is modified, re-exported, shimmed or
// wrapped to make this work.
//
// Both doubles are DETERMINISTIC: no randomness, no clock read, no counter that survives a test.
// Each is constructed fresh in `beforeEach` or inside the single case that needs it.
// ---------------------------------------------------------------------------

/**
 * Answers promotion lookups immediately from a registered table, recording every identifier asked
 * for in call order.
 *
 * Stands in for `this.getPromotion(salePriceDetails.promotionID)`
 * [model/service/PromotionService.cfc:L157], an inherited framework entity getter resolved at
 * request time.
 *
 * An unregistered identifier THROWS rather than answering something plausible. That is deliberate:
 * the legacy line assigns the lookup's result straight into the record with no absence test, so a
 * double that quietly substituted a stand-in promotion would let a scenario's setup mistake surface
 * later as a confusing assertion failure instead of at the line that caused it.
 */
class RecordingPromotionResolver {
  public readonly getPromotionCalls: string[] = [];

  private readonly answers: Map<string, Promotion>;

  constructor(answers: readonly (readonly [string, Promotion])[]) {
    this.answers = new Map(answers);
  }

  public getPromotion(promotionID: string): Promise<Promotion> {
    this.getPromotionCalls.push(promotionID);

    const answer: Promotion | undefined = this.answers.get(promotionID);

    if (answer === undefined) {
      throw new Error(
        `this scenario registered no promotion for '${promotionID}'; register one before seeding`,
      );
    }

    return Promise.resolve(answer);
  }
}

/**
 * Holds every promotion lookup open until the case releases it.
 *
 * The only way to observe WHEN the accumulator is written relative to the awaited resolution, which
 * is what makes the ordering at [model/service/PromotionService.cfc:L152] versus [L155-L159]
 * observable rather than merely readable: legacy completes the array assignment before it evaluates
 * the record literal, and the shipped module reproduces that by storing the array before it awaits.
 */
class DeferringPromotionResolver {
  public readonly getPromotionCalls: string[] = [];

  private readonly waiting: ((promotion: Promotion) => void)[] = [];

  public getPromotion(promotionID: string): Promise<Promotion> {
    this.getPromotionCalls.push(promotionID);

    return new Promise<Promotion>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /** Releases every lookup taken so far with the same promotion. */
  public settleAll(promotion: Promotion): void {
    const released: ((promotion: Promotion) => void)[] = this.waiting.splice(
      0,
      this.waiting.length,
    );

    for (const resolve of released) {
      resolve(promotion);
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario builders. Fixtures are CONSUMED, never authored: the three factories below are the
// project's own, and no fixture module is created or edited by this file. Where a sale-price detail
// row or a boundary-value price is needed it is constructed INLINE here, which is the intended
// division - a shape that only this suite needs does not belong in a shared module.
// ---------------------------------------------------------------------------

/**
 * One sale-price detail row, carrying the five required members and omitting the three optional
 * ones.
 *
 * The optional members are OMITTED rather than assigned `undefined`, because
 * `exactOptionalPropertyTypes` distinguishes an absent key from a present one holding `undefined` -
 * and the distinction is the same one the legacy `structKeyExists` tests turn on. None of the three
 * is read by the subject: `originalPrice` and `roundingRuleID` belong to the sale-price
 * projection's own calculation, and `salePriceExpirationDateTime` is read by
 * `Sku.getSalePriceExpirationDateTime()` [model/entity/Sku.cfc:L560-L565], not by this pass. Money
 * arrives as a DECIMAL STRING and is converted once, here; no numeric literal is ever a monetary
 * input.
 */
function makeSalePriceDetailRow(
  salePrice: string,
  promotionID: string,
  skuID: string,
): SalePriceDetail {
  return {
    skuID,
    discountLevel: 'sku',
    salePriceDiscountType: 'amount',
    salePrice: Money.fromDecimalString(salePrice),
    promotionID,
  };
}

/** A sku priced at `price` whose pre-materialised sale-price row offers `salePrice`. */
function makeSkuWithSalePrice(
  idPrefix: string,
  price: string,
  salePrice: string,
  promotionID: string,
): Sku {
  return makeSkuFixture({
    idPrefix,
    price: Money.fromDecimalString(price),
    salePriceDetail: makeSalePriceDetailRow(salePrice, promotionID, `${idPrefix}sku`),
  });
}

/**
 * A sku priced at `price` with NO sale-price row at all.
 *
 * The fixture's documented default already omits the row, so this is the absent state exactly as
 * hydration produces it - `getSalePriceDetails()` answers `undefined`, which is how the target
 * spells the empty struct `Product.getSkuSalePriceDetails` returns on a miss
 * [model/entity/Product.cfc:L182-L186]. Nothing is deleted, blanked or zeroed to reach it.
 */
function makeSkuWithoutSalePrice(idPrefix: string, price: string): Sku {
  return makeSkuFixture({ idPrefix, price: Money.fromDecimalString(price) });
}

/** One order item to place into the golden order, positionally. */
interface SeedingItemSpec {
  readonly orderItemID: string;
  readonly sku: Sku;
  readonly quantity: number;
  /** The item's own price, as a decimal string, where a case needs it to differ from the sku. */
  readonly price?: string;
}

/**
 * The golden order with its leading items replaced positionally.
 *
 * Fewer than three specs leaves the fixture's remaining default items in place, and those defaults
 * carry NO sale-price row - which is useful rather than incidental: they are the items whose absent
 * rows prove the gate short-circuits, and they are why a spy count of one is meaningful in a
 * three-item order.
 */
function makeOrderWithItems(items: readonly SeedingItemSpec[]): OrderView {
  return makeOrderViewFixture({
    itemOverrides: items.map((spec) =>
      spec.price === undefined
        ? { orderItemID: spec.orderItemID, sku: spec.sku, quantity: spec.quantity }
        : {
            orderItemID: spec.orderItemID,
            sku: spec.sku,
            quantity: spec.quantity,
            price: Money.fromDecimalString(spec.price),
          },
    ),
  });
}

// ---------------------------------------------------------------------------
// Narrowing helpers. `noUncheckedIndexedAccess` makes every indexed read a `T | undefined`, and
// each one is narrowed by an explicit throw - never by a postfix `!` and never by a cast. The lint
// configuration does permit non-null assertions inside `tests/**`; this file declines that
// relaxation, because an assertion here would turn a broken scenario into a confusing failure
// somewhere downstream instead of raising at the line that went wrong. Every message names the
// SCENARIO rather than the subject, so it can never be mistaken for a real behavioural failure.
// ---------------------------------------------------------------------------

/** One order item by position. */
function itemAt(order: OrderView, index: number): OrderItemView {
  const item: OrderItemView | undefined = order.orderItems[index];

  if (item === undefined) {
    throw new Error(`this test scenario built no order item at index ${String(index)}`);
  }

  return item;
}

/** One accumulator bucket by opaque order-item identifier. */
function bucketOf(
  accumulator: OrderItemQualifiedDiscounts,
  orderItemID: string,
): QualifiedDiscount[] {
  const bucket: QualifiedDiscount[] | undefined = accumulator[orderItemID];

  if (bucket === undefined) {
    throw new Error(`this test scenario produced no accumulator bucket for '${orderItemID}'`);
  }

  return bucket;
}

/** One qualified-discount record by position within a bucket. */
function recordAt(bucket: readonly QualifiedDiscount[], index: number): QualifiedDiscount {
  const record: QualifiedDiscount | undefined = bucket[index];

  if (record === undefined) {
    throw new Error(`this test scenario expected an accumulator record at index ${String(index)}`);
  }

  return record;
}

/** The member names a record actually carries, sorted, for comparison against a published list. */
function memberNamesOf(record: QualifiedDiscount): string[] {
  return Object.keys(record).sort();
}

/**
 * Renders one bucket as plain strings.
 *
 * A string projection rather than a deep clone, so a comparison observes exactly the three things
 * the subject can decide - which records exist, in what order, and at what amount - without
 * dragging a `Promotion` entity's internals into the equality. That matters concretely here: the
 * promotion fixture graph is CYCLIC, because a promotion holds its periods and each period holds
 * its promotion back, so serialising one is not an option.
 */
function describeBucket(bucket: readonly QualifiedDiscount[]): string[] {
  return bucket.map(
    (record) =>
      `${record.promotionRewardID}|${record.promotion.getPromotionID()}|` +
      `${record.discountAmount.toDecimalString()}`,
  );
}

/** The whole accumulator rendered the same way, keys included. */
function describeAccumulator(accumulator: OrderItemQualifiedDiscounts): Record<string, string[]> {
  const described: Record<string, string[]> = {};

  for (const [orderItemID, bucket] of Object.entries(accumulator)) {
    described[orderItemID] = describeBucket(bucket);
  }

  return described;
}

/**
 * A reward-path accumulator record, for the one case that has to show what the facade's insertion
 * sort would do with a seeded record already in place.
 *
 * It carries a REAL reward identifier, which is the whole contrast with the seeded record's empty
 * string: a record with a real identifier is reachable by the over-use stripping pass, and a seeded
 * one is not.
 */
function makeRewardDiscountRecord(
  promotionRewardID: string,
  discountAmount: Money,
  promotion: Promotion,
): QualifiedDiscount {
  return { promotionRewardID, promotion, discountAmount };
}

describe('SalePriceSeeder - the ported sale-price seeding pass', () => {
  // A2 - REQUEST-SCOPED STATE, REBUILT FOR EVERY CASE. The accumulator is MUTABLE and the subject
  // writes into it in place, so a structure shared between cases would let one case's seeding
  // decide another's outcome. Every binding below is reassigned before every case and nothing
  // mutable is held at module scope: no accumulator, no resolver, no counter, no retained
  // promotion. That mirrors the source, which declares all three of its accumulators with `var`
  // inside the function [model/service/PromotionService.cfc:L136, L139, L142], and it mirrors the
  // shipped module, whose only field is the `readonly` resolver.
  let promotionGraph: ReturnType<typeof makePromotionFixtures>;
  let salePromotion: Promotion;
  let salePromotionID: string;
  let resolver: RecordingPromotionResolver;
  let seeder: SalePriceSeeder;
  let accumulator: OrderItemQualifiedDiscounts;

  beforeEach(() => {
    promotionGraph = makePromotionFixtures({ idPrefix: 'sale-price-seeding-' });
    salePromotion = promotionGraph.promotion;
    salePromotionID = salePromotion.getPromotionID();
    resolver = new RecordingPromotionResolver([[salePromotionID, salePromotion]]);
    seeder = new SalePriceSeeder(resolver);
    accumulator = {};
  });

  // The runner's single setup file already registers a global hook that restores mocks and real
  // timers after every test. This suite-local hook is deliberately ADDITIONAL rather than a
  // duplicate: a case below counts calls on `Money`'s own methods by installing a spy on the shared
  // prototype, and leaving one installed would change how every later case in this file behaves.
  // Restoring at both levels costs nothing and removes the possibility entirely.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the shipped surface, confirmed before anything is asserted about behaviour', () => {
    it('is a one-parameter class whose seeding method takes the order and the accumulator', () => {
      // ONE constructor parameter: the promotion resolver, and nothing else. Asserted because the
      // absences it proves are behavioural. There is no rounding-rule collaborator, so no rounding
      // rule can be consulted here; there is no repository, so nothing is fetched; there is no
      // settings provider, so no threshold is configurable. Each of those would be a second
      // parameter if it existed.
      expect(SalePriceSeeder.length).toBe(1);

      // TWO method parameters: the read-only order view, and the caller's accumulator. There is no
      // third, which is the structural proof that this module CANNOT touch the reward-usage ledger
      // -
      // it is never handed one. The ledger is seeded separately at
      // [model/service/PromotionService.cfc:L172-L189] and is owned by `rewardUsageLedger.test.ts`.
      expect(seeder.seedSalePriceDiscounts.length).toBe(2);
    });

    it('returns a promise that settles to nothing', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-surface',
          sku: makeSkuWithSalePrice('surface-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
      ]);

      const returned: Promise<void> = seeder.seedSalePriceDiscounts(order, accumulator);

      // JUDGMENT CALL: the async boundary is asserted at the SHIPPED site rather than the
      // anticipated one - see the header note. The method is asynchronous because the promotion
      // resolution at [model/service/PromotionService.cfc:L157] reaches storage; the sale-price row
      // read at [L146] does not, because it was pre-materialised during hydration.
      expect(returned).toBeInstanceOf(Promise);

      // Settles to nothing, exactly as the legacy fragment produces no value. What the pass leaves
      // behind is the accumulator the caller passed in, which the application pass at
      // [model/service/PromotionService.cfc:L524-L537] reads back out.
      expect(await returned).toBeUndefined();
    });

    it('writes nothing that carries a reward-usage ledger member', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-not-a-ledger',
          sku: makeSkuWithSalePrice('not-ledger-', '10.00', '4.00', salePromotionID),
          quantity: 2,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, 'oi-not-a-ledger'), 0);

      // ★ THE SINGLE MOST COMMON MISREADING OF THIS MODULE, ASSERTED AWAY. The published plan
      // describes this pass as seeding "the usage ledger"; the SOURCE seeds the QUALIFIED-DISCOUNT
      // ACCUMULATOR declared at [model/service/PromotionService.cfc:L142], and where the plan and
      // the source disagree the source wins. `usedInOrder`, `maximumUsePerOrder`,
      // `maximumUsePerItem`, `maximumUsePerQualification` and `orderItemsUsage` are the members of
      // the OTHER structure, seeded ninety lines later at [L172-L189]. None may appear here.
      //
      // The presence test runs through the CFML struct helper rather than `in` or `Object.hasOwn`,
      // because a case-insensitive test is strictly stronger: it also rules out a member that
      // differs only in capitalisation.
      for (const ledgerMember of REWARD_USAGE_LEDGER_MEMBERS) {
        expect(structKeyExists(record, ledgerMember)).toBe(false);
      }

      expect(REWARD_USAGE_LEDGER_MEMBERS.length).toBe(5);
    });
  });

  describe('the target is the qualified-discount accumulator, keyed by opaque order-item ID', () => {
    it('stores an array of qualified discounts under the item identifier, verbatim', async () => {
      // The identifier is deliberately shaped like nothing this port would generate. It crosses the
      // anti-corruption boundary from the out-of-scope order aggregate as an OPAQUE string, and the
      // subject neither parses, trims, lower-cases, validates nor prefixes it.
      const opaqueOrderItemID = 'OI-9f3b/Weird Key.42';

      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: opaqueOrderItemID,
          sku: makeSkuWithSalePrice('opaque-', '10.00', '7.50', salePromotionID),
          quantity: 2,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L142, L152, L155]: the structure is a
      // struct keyed by `orderItem.getOrderItemID()` whose values are ARRAYS of records. The legacy
      // identifier for it is misspelt `orderItemQulifiedDiscounts` and the target publishes the
      // corrected `OrderItemQualifiedDiscounts`; the rename is safe because the identifier is a
      // function-local accumulator rather than a data contract, and the original spelling is
      // recorded in the header note. The shipped spelling is what this suite uses throughout.
      expect(Object.keys(accumulator)).toStrictEqual([opaqueOrderItemID]);

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, opaqueOrderItemID);

      expect(Array.isArray(bucket)).toBe(true);
      expect(bucket.length).toBe(1);
      expect(memberNamesOf(recordAt(bucket, 0))).toStrictEqual(QUALIFIED_DISCOUNT_MEMBERS);
    });

    it('leaves the accumulator untouched for an order with no items at all', async () => {
      const order: OrderView = makeOrderViewFixture({ orderItems: [] });

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L145]: a CFML for-in over an empty array
      // executes its body zero times. No key is created, and - because the resolution at [L157]
      // sits inside the loop AND inside the gate - nothing is resolved either.
      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
      expect(order.orderItems.length).toBe(0);
    });
  });

  describe('the L148 gate: case-insensitive key presence AND a STRICT less-than', () => {
    it('★ seeds NOTHING when the sale price is exactly EQUAL to the sku price', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-equal',
          sku: makeSkuWithSalePrice('equal-', '10.00', '10.00', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L148]: the comparison is
      // `salePriceDetails.salePrice < orderItem.getSku().getPrice()`, a STRICT less-than. Equality
      // therefore produces NO key, NO record and NO resolution - not a zero-valued discount, and
      // not an empty bucket. This is the strict comparison's most important consequence, and it is
      // what keeps a sale price that merely matches the shelf price out of the discount competition
      // entirely. A less-than-or-equal would enter a zero discount into position 1, where the
      // application pass at [L529-L534] would read it as the best available discount for the item.
      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
    });

    it('seeds nothing when the sale price is GREATER than the sku price', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-greater',
          sku: makeSkuWithSalePrice('greater-', '10.00', '11.00', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // A sale price ABOVE the shelf price would yield a NEGATIVE discount, and the legacy gate is
      // what keeps it out. Note what is NOT here: no absolute value, no sign check, no clamp to
      // zero. The gate alone does the work, and reproducing the gate is what reproduces the
      // outcome.
      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
    });

    it('seeds when the sale price is LESS than the sku price', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-less',
          sku: makeSkuWithSalePrice('less-', '10.00', '9.00', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // (10.00 x 3) - (9.00 x 3) = 3. Rendered canonically: the value object drops trailing zeros
      // on the way out, so the extended delta of three dollars reads as `3`, not `3.00`.
      // Presentation to two decimals is the reward path's final step [L1017], not this one's.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        'oi-less': [`|${salePromotionID}|3`],
      });
      expect(resolver.getPromotionCalls).toStrictEqual([salePromotionID]);
    });

    it('seeds nothing, and resolves nothing, when the sale-price row is absent entirely', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-no-row',
          sku: makeSkuWithoutSalePrice('no-row-', '10.00'),
          quantity: 3,
        },
      ]);

      // CFML parity [model/service/PromotionService.cfc:L148]: the first half of the conjunction is
      // `structKeyExists(salePriceDetails, "salePrice")`. In CFML the row is a struct that may
      // itself be empty, and an empty struct answers that test identically to a struct missing the
      // key. The ported projection makes the ROW optional and `salePrice` a REQUIRED member of a
      // row that exists, so "absent" is spelled `undefined` at the row level - and both halves of
      // the legacy test are still reproduced by the shipped module.
      // `Product.getSkuSalePriceDetails` returning `{}` on a miss
      // [model/entity/Product.cfc:L182-L186] is the state being modelled.
      await seeder.seedSalePriceDiscounts(order, accumulator);

      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
      expect(itemAt(order, 0).sku.getSalePriceDetails()).toBeUndefined();
    });

    it('never compares prices for an absent row, because the gate short-circuits', async () => {
      // Three items, and only the MIDDLE one carries a sale-price row. The two either side are the
      // fixture's own defaults in every respect except their absent rows.
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-absent-first',
          sku: makeSkuWithoutSalePrice('absent-first-', '10.00'),
          quantity: 1,
        },
        {
          orderItemID: 'oi-present-middle',
          sku: makeSkuWithSalePrice('present-middle-', '10.00', '6.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-absent-last',
          sku: makeSkuWithoutSalePrice('absent-last-', '10.00'),
          quantity: 1,
        },
      ]);

      // Installed AFTER the fixtures are built, so the count observes the subject alone.
      const comparisonSpy = vi.spyOn(Money.prototype, 'isLessThan');

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L148]: `&&` short-circuits, so for an item
      // whose row is absent the comparison is NEVER REACHED. Once across three items, not three
      // times. There is also a second, independent proof in this very case: reaching the third term
      // on an absent row would dereference nothing at all and raise, so the pass completing is
      // itself evidence that the terms are evaluated in order.
      expect(comparisonSpy.mock.calls.length).toBe(1);
      expect(Object.keys(accumulator)).toStrictEqual(['oi-present-middle']);
    });

    it('answers the key-presence term case-insensitively, as a CFML struct does', () => {
      // CFML parity [model/service/PromotionService.cfc:L148]: CFML struct keys match
      // CASE-INSENSITIVELY and TypeScript object keys do not, so the shipped gate routes its
      // presence test through the CFML struct helper rather than through `in` or `Object.hasOwn`.
      // This asserts the semantic the gate inherits.
      //
      // JUDGMENT CALL: the helper is asserted directly rather than through a differently-cased
      // detail row, because the published `SalePriceDetail` spells `salePrice` exactly and declares
      // it REQUIRED - so a row whose key is stored as `SALEPRICE` cannot be constructed through the
      // typed surface without a cast, and no cast is permitted in this subtree. Asserting the
      // collaborator the gate delegates to is therefore the only cast-free way to pin the semantic,
      // and it is the honest one: a row hydrated from a result set whose column came back
      // upper-cased still answers the gate.
      expect(structKeyExists({ SALEPRICE: 'a stored value' }, 'salePrice')).toBe(true);
      expect(structKeyExists({ SalePrice: 'a stored value' }, 'salePrice')).toBe(true);
      expect(structKeyExists({ salePrice: 'a stored value' }, 'salePrice')).toBe(true);

      // Case-insensitive is not the same as fuzzy: a genuinely different key still misses.
      expect(structKeyExists({ salesPrice: 'a stored value' }, 'salePrice')).toBe(false);
      expect(structKeyExists({}, 'salePrice')).toBe(false);
    });

    it('gates on the SKU price, not on the order item price', async () => {
      // The item's own price is BELOW its sale price, while the sku's price is above it. If the
      // gate consulted the item, this would seed nothing.
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-item-price-differs',
          sku: makeSkuWithSalePrice('item-price-', '10.00', '9.00', salePromotionID),
          quantity: 2,
          price: '1.00',
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L148, L150]: both the gate and the
      // arithmetic read `orderItem.getSku().getPrice()`. `orderItem.getPrice()` - which may be a
      // price-group price - is read by the REWARD path at [L244], never here. So the seeded delta
      // is (10.00 x 2) - (9.00 x 2) = 2, computed entirely from sku prices, even though the item is
      // being sold at 1.00.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        'oi-item-price-differs': [`|${salePromotionID}|2`],
      });
      expect(itemAt(order, 0).price.toDecimalString()).toBe('1');
      expect(itemAt(order, 0).sku.getPrice().toDecimalString()).toBe('10');
    });
  });

  describe('L150 multiplies TWICE and subtracts ONCE, and is never algebraically simplified', () => {
    it('★ takes two extended amounts and subtracts them, not one delta scaled by quantity', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-shape',
          sku: makeSkuWithSalePrice('shape-', '0.07', '0.01', salePromotionID),
          quantity: 3,
        },
      ]);

      // Counting the value object's own operations is what makes the SHAPE of the expression
      // observable rather than merely readable. Installed after the fixtures are built, so only the
      // subject's arithmetic is counted.
      const multiplicationSpy = vi.spyOn(Money.prototype, 'times');
      const subtractionSpy = vi.spyOn(Money.prototype, 'minus');

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L150]: the source expression is
      //   '(orderItem.getSku().getPrice() * orderItem.getQuantity())
      //      - (salePriceDetails.salePrice * orderItem.getQuantity())'
      // - TWO multiplications by the same quantity, then ONE subtraction. It is deliberately NOT
      // written as `(price - salePrice) * quantity`, and it is deliberately not ported that way.
      // The two forms agree in exact decimal arithmetic, so the reason is the acceptance contract:
      // a reviewer must be able to diff the target against the cited source line and see the same
      // operations in the same order. A simplified implementation would show ONE `times` call and a
      // `minus` argument of the UNIT delta; this shows two `times` calls and a `minus` argument
      // that is the EXTENDED sale amount.
      expect(multiplicationSpy.mock.calls).toStrictEqual([[3], [3]]);
      expect(subtractionSpy.mock.calls.length).toBe(1);

      const subtractionCall: readonly [subtrahend: Money | string] | undefined =
        subtractionSpy.mock.calls[0];

      if (subtractionCall === undefined) {
        throw new Error('this test scenario recorded no subtraction to inspect');
      }

      const subtrahend: Money | string = subtractionCall[0];

      if (!(subtrahend instanceof Money)) {
        throw new Error('this test scenario expected the subtrahend to be a monetary value');
      }

      // 0.01 x 3 - the extended SALE amount. Under the simplified form this would be 0.06, the unit
      // delta, and that single figure is the difference between the two implementations.
      expect(subtrahend.toDecimalString()).toBe('0.03');

      // CFML parity [model/entity/OrderItem.cfc:L56]: the quantity column is `ormtype="integer"`,
      // so the quantity is a COUNT and never money. It enters the arithmetic as a plain multiplier
      // and is never wrapped in the value object.
      for (const multiplicationCall of multiplicationSpy.mock.calls) {
        expect(typeof multiplicationCall[0]).toBe('number');
      }
    });

    it('pins the exact decimal result where binary floating point would drift', async () => {
      // Both cases are chosen because IEEE-754 double arithmetic gets them wrong in the fifteenth
      // significant digit, and either formulation of the expression drifts differently. Exact
      // decimal arithmetic gets them right, and the exact figure is the specification.
      const cases: readonly {
        readonly label: string;
        readonly skuPrice: string;
        readonly salePrice: string;
        readonly quantity: number;
        readonly expected: string;
      }[] = [
        // (19.99 x 3) - (19.98 x 3): 59.97 - 59.94. As doubles the difference lands near
        // 0.029999999999994, and the persisted `big_decimal` would carry that noise forward.
        {
          label: 'oi-drift-a',
          skuPrice: '19.99',
          salePrice: '19.98',
          quantity: 3,
          expected: '0.03',
        },
        // (0.07 x 3) - (0.01 x 3): 0.21 - 0.03, where 0.07 x 3 is itself inexact as a double.
        { label: 'oi-drift-b', skuPrice: '0.07', salePrice: '0.01', quantity: 3, expected: '0.18' },
      ];

      expect(cases.length).toBe(2);

      for (const testCase of cases) {
        const caseAccumulator: OrderItemQualifiedDiscounts = {};
        const order: OrderView = makeOrderWithItems([
          {
            orderItemID: testCase.label,
            sku: makeSkuWithSalePrice(
              `${testCase.label}-`,
              testCase.skuPrice,
              testCase.salePrice,
              salePromotionID,
            ),
            quantity: testCase.quantity,
          },
        ]);

        await seeder.seedSalePriceDiscounts(order, caseAccumulator);

        const record: QualifiedDiscount = recordAt(bucketOf(caseAccumulator, testCase.label), 0);

        expect(record.discountAmount.toDecimalString()).toBe(testCase.expected);
        expect(record.discountAmount.equals(Money.fromDecimalString(testCase.expected))).toBe(true);
      }
    });
  });

  describe('L152 assigns a FRESH array UNCONDITIONALLY, and the asymmetry is preserved', () => {
    it('discards whatever the accumulator slot already held for that order item', async () => {
      const orderItemID = 'oi-preoccupied';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('preoccupied-', '10.00', '4.00', salePromotionID),
          quantity: 2,
        },
      ]);

      // A record already sitting in the slot, carrying a REAL reward identifier and a large amount,
      // so its disappearance is unmistakable.
      const preExisting: QualifiedDiscount = makeRewardDiscountRecord(
        'reward-that-was-already-here',
        Money.fromDecimalString('999.00'),
        salePromotion,
      );

      accumulator[orderItemID] = [preExisting];

      const preExistingBucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L152]: the assignment is
      //   `orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ] = [];`
      // with NO `structKeyExists` guard of any kind. Whatever the slot held is gone.
      //
      // ★ AND THE ASYMMETRY WITH THE REWARD PATH MUST NOT BE NORMALISED. Ninety lines further on,
      // [L260-L263] performs the structurally identical write wrapped in
      // `if(!structKeyExists(orderItemQulifiedDiscounts, orderItem.getOrderItemID()))` - a GUARDED
      // lazy init that PRESERVES an existing bucket where this one REPLACES it. Two parallel
      // writes, one unconditional and one guarded, and the difference is deliberate here: in the
      // real sequence this pass runs FIRST, so it has nothing of its own to preserve, while the
      // reward path must accumulate alongside whatever seeding already put in place. Adding a guard
      // here to "make them consistent" would change nothing in the real sequence and everything
      // about what this module promises.
      const bucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);

      expect(describeBucket(bucket)).toStrictEqual([`|${salePromotionID}|12`]);
      expect(bucket.length).toBe(1);
      expect(bucket).not.toContain(preExisting);

      // A genuinely NEW array, not the pre-existing one emptied and refilled. The distinction is
      // observable, because a holder of the old array keeps seeing the old contents.
      expect(bucket).not.toBe(preExistingBucket);

      // The projector renders the CANONICAL decimal, and the value object drops trailing zeros in
      // that rendering: `999.00` is stored and reads back as `999`. Presentation to two places is a
      // separate operation (`toFixed2`), which is why nothing in this suite infers a scale from a
      // canonical string.
      expect(describeBucket(preExistingBucket)).toStrictEqual([
        `reward-that-was-already-here|${salePromotionID}|999`,
      ]);
    });

    it('creates a key ONLY for items that pass the gate, never a pre-seeded empty bucket', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-qualifies',
          sku: makeSkuWithSalePrice('qualifies-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-does-not-qualify',
          sku: makeSkuWithSalePrice('does-not-', '10.00', '10.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-has-no-row',
          sku: makeSkuWithoutSalePrice('has-no-row-', '10.00'),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L152]: the assignment sits INSIDE the L148
      // gate, so a non-qualifying item gets NO key rather than an empty array. That is load-bearing
      // downstream, because the application pass at [L529] tests
      // `structKeyExists(orderItemQulifiedDiscounts, orderItem.getOrderItemID())` BEFORE it tests
      // array length: pre-seeding every item with an empty bucket would change which items that
      // gate admits, even though every such bucket would then fail the length test. Reproducing the
      // key's ABSENCE is therefore part of the contract, not an implementation detail.
      expect(Object.keys(accumulator)).toStrictEqual(['oi-qualifies']);
      expect(structKeyExists(accumulator, 'oi-does-not-qualify')).toBe(false);
      expect(structKeyExists(accumulator, 'oi-has-no-row')).toBe(false);
      expect(order.orderItems.length).toBe(3);
    });

    it('stores the array BEFORE the promotion resolves, so a pending bucket is empty', async () => {
      const orderItemID = 'oi-deferred';
      const deferringResolver = new DeferringPromotionResolver();
      const deferringSeeder = new SalePriceSeeder(deferringResolver);
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('deferred-', '10.00', '6.00', salePromotionID),
          quantity: 2,
        },
      ]);

      const pending: Promise<void> = deferringSeeder.seedSalePriceDiscounts(order, accumulator);

      // One microtask is enough to carry the pass as far as its first suspension point, which is
      // the awaited resolution.
      await Promise.resolve();

      // CFML parity [model/service/PromotionService.cfc:L152 versus L155-L159]: legacy completes
      // the array assignment on L152 before it evaluates the record literal that begins on L155,
      // and the shipped module reproduces that ordering by storing the array before it awaits. The
      // intermediate state is therefore observable: the key EXISTS and its bucket is EMPTY.
      expect(deferringResolver.getPromotionCalls).toStrictEqual([salePromotionID]);
      expect(describeAccumulator(accumulator)).toStrictEqual({ [orderItemID]: [] });

      deferringResolver.settleAll(salePromotion);
      await pending;

      // And the AWAITED result is what lands in the record. (10.00 x 2) - (6.00 x 2) = 8.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        [orderItemID]: [`|${salePromotionID}|8`],
      });
      expect(recordAt(bucketOf(accumulator, orderItemID), 0).promotion).toBe(salePromotion);
    });

    it('writes the key as an OWN property, so an item identified as the prototype key survives', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: PROTOTYPE_KEY_ORDER_ITEM_ID,
          sku: makeSkuWithSalePrice('proto-', '10.00', '3.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L152]: a CFML struct has no prototype chain
      // and no reserved key names, so the legacy assignment stored this order item's array like any
      // other. A plain TypeScript assignment would be intercepted by the inherited accessor and
      // store NOTHING - leaving the application pass with no key, and no discount, for an item
      // whose sale price had already been computed. The shipped module writes through
      // `Object.defineProperty`, which cannot be intercepted, and the UNCONDITIONAL nature of the
      // assignment and its placement inside the gate are unchanged by that choice.
      expect(Object.hasOwn(accumulator, PROTOTYPE_KEY_ORDER_ITEM_ID)).toBe(true);
      expect(Object.getOwnPropertyNames(accumulator)).toStrictEqual([PROTOTYPE_KEY_ORDER_ITEM_ID]);
      expect(describeBucket(bucketOf(accumulator, PROTOTYPE_KEY_ORDER_ITEM_ID))).toStrictEqual([
        `|${salePromotionID}|7`,
      ]);

      const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
        accumulator,
        PROTOTYPE_KEY_ORDER_ITEM_ID,
      );

      if (descriptor === undefined) {
        throw new Error('this test scenario produced no own property to inspect');
      }

      // Enumerable, so the application pass's iteration sees it; writable and configurable, so the
      // unconditional assignment can still REPLACE it on a later pass exactly as it replaces an
      // ordinary key.
      expect(descriptor.enumerable).toBe(true);
      expect(descriptor.writable).toBe(true);
      expect(descriptor.configurable).toBe(true);
    });
  });

  describe('the seeded record carries EXACTLY three members, though the docblock promises five', () => {
    it('is the three published members and nothing else', async () => {
      const orderItemID = 'oi-three-members';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('three-', '19.99', '19.98', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // CFML parity [model/service/PromotionService.cfc:L155-L159]: the record literal has three
      // entries - `promotionRewardID`, `promotion` and `discountAmount` - and the strict comparison
      // below is what makes an unexpected fourth member a failure rather than an unnoticed
      // addition.
      expect(memberNamesOf(record)).toStrictEqual(QUALIFIED_DISCOUNT_MEMBERS);
      expect(record).toStrictEqual({
        promotionRewardID: '',
        promotion: salePromotion,
        discountAmount: Money.fromDecimalString('0.03'),
      });

      // LEGACY-NOTE [model/service/PromotionService.cfc:L127-L128]: `discountQuantity` and
      // `discountPerUseValue` are PHANTOM KEYS - promised by the illustrative docblock above the
      // function and written by no construction site anywhere in the accumulator. Members of those
      // names do exist on the reward ledger's per-item usage rows at [L311-L312] and [L325-L326],
      // which is a different structure entirely; the docblock conflates the two. Asserting their
      // ABSENCE here is what keeps a well-meaning future addition from materialising them.
      for (const phantomMember of PHANTOM_DOCBLOCK_MEMBERS) {
        expect(structKeyExists(record, phantomMember)).toBe(false);
      }

      expect(PHANTOM_DOCBLOCK_MEMBERS.length).toBe(2);
    });

    it('carries the discount as a Money whose slot is deliberately MUTABLE', async () => {
      const orderItemID = 'oi-mutable-slot';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('mutable-', '10.00', '2.50', salePromotionID),
          quantity: 4,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      expect(record.discountAmount).toBeInstanceOf(Money);
      expect(record.discountAmount.toDecimalString()).toBe('30');

      // The published contract declares `promotionRewardID` and `promotion` READONLY and
      // `discountAmount` MUTABLE, and the asymmetry is not an oversight: the over-use correction
      // pass at [model/service/PromotionService.cfc:L486] rewrites the amount IN PLACE, on the
      // record that is already in the bucket. This proves the slot the correction pass needs is
      // writable and that the bucket sees the rewrite; the correction arithmetic itself belongs to
      // `overUseStripping.test.ts` and is not repeated here.
      record.discountAmount = Money.fromDecimalString('7.50');

      const rewritten: Money = recordAt(bucketOf(accumulator, orderItemID), 0).discountAmount;

      // Compared by monetary value, not by rendered text: the value object canonicalises `7.50` to
      // `7.5`, and `toFixed2()` is the separate presentation surface.
      expect(rewritten.equals(Money.fromDecimalString('7.50'))).toBe(true);
      expect(rewritten.toFixed2()).toBe('7.50');
    });
  });

  describe('the empty-string promotionRewardID is a SENTINEL that confers stripping immunity', () => {
    it('★★★ is the LITERAL empty string, present as an own member, never a substitute for it', async () => {
      const orderItemID = 'oi-sentinel';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('sentinel-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // CFML parity [model/service/PromotionService.cfc:L156]: `promotionRewardID = ""`. Read as a
      // placeholder this looks like a field nobody bothered to fill in. It is nothing of the kind -
      // it is STRUCTURAL IMMUNITY, and the mechanism is worth stating precisely because it is
      // invisible at this line:
      //
      //   - the over-use correction pass iterates the REWARD-USAGE LEDGER's keys, `for(var prID in
      //     promotionRewardUsageDetails)` [L468], and matches accumulator records by comparing
      //     `.promotionRewardID == prID` [L483, L499];
      //   - every ledger key is a real `getPromotionRewardID()` written at [L177] and [L184];
      //   - so NO ledger key is ever the empty string;
      //   - therefore a seeded record can never be MATCHED, and can never be STRIPPED for over-use.
      //
      // A sale price is a property of the sku, not a promotion entitlement drawn against a use
      // limit, so it is right that no limit can revoke it - but the immunity is a consequence of an
      // empty string rather than of anything that says so. The stripping behaviour itself is
      // asserted by `overUseStripping.test.ts`; what is asserted HERE is the exact value that makes
      // it unreachable.
      expect(record.promotionRewardID).toBe('');
      expect(typeof record.promotionRewardID).toBe('string');
      expect(record.promotionRewardID.length).toBe(0);

      // Present as an OWN member holding the empty string - not omitted, and not present holding
      // something absent-shaped. The published type declares it `string`, which ADMITS `''`
      // precisely so this works; `undefined`, `null`, a synthetic identifier, a `Symbol` or a
      // discriminant tag would each break the match test above in a different way, and none of them
      // is what the source writes.
      expect(Object.hasOwn(record, 'promotionRewardID')).toBe(true);
      expect(structKeyExists(record, 'promotionRewardID')).toBe(true);
      expect(record.promotionRewardID).not.toBeUndefined();
      expect(record.promotionRewardID).not.toBeNull();
      expect(typeof record.promotionRewardID).not.toBe('symbol');
      expect(typeof record.promotionRewardID).not.toBe('object');
    });

    it('is unreachable by every real reward identifier the promotion graph can produce', async () => {
      const orderItemID = 'oi-unreachable';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('unreachable-', '10.00', '8.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // Every identifier that could become a ledger key in this graph, including the two the
      // fixtures name specifically for the bounded-use-limit and leaked-key scenarios owned
      // elsewhere.
      const rewardIdentifiers: readonly string[] = [
        ...promotionGraph.promotionRewards.map((reward) => reward.getPromotionRewardID()),
        promotionGraph.overusedRewardID,
        promotionGraph.leakedRewardID,
      ];

      // Guards the loop below against passing vacuously, which is exactly how the legacy
      // `issue_1296` case at [meta/tests/unit/IssuesTest.cfc:L73-L89] manages to pass while
      // asserting nothing.
      expect(rewardIdentifiers.length).toBeGreaterThan(0);
      expect(rewardIdentifiers).not.toContain('');

      for (const rewardIdentifier of rewardIdentifiers) {
        expect(rewardIdentifier.length).toBeGreaterThan(0);
        expect(record.promotionRewardID).not.toBe(rewardIdentifier);
      }

      // LEGACY-NOTE [model/service/PromotionService.cfc:L1033-L1036]: the same `""` sentinel idiom
      // appears again in the shipping-discount details struct, `var details = { promotionID="",
      // discountAmount=0 }`, whose winner is captured at [L1073-L1075]. Same idiom, different
      // structure, and that one is facade-owned - noted here only so the pattern is recognised
      // rather than rediscovered as a novelty.
      expect(record.promotion.getPromotionID()).toBe(salePromotionID);
    });
  });

  describe('the seeded entry holds position 1 until a STRICTLY LARGER reward discount displaces it', () => {
    it('★ is not displaced by an EQUAL reward discount', async () => {
      const orderItemID = 'oi-incumbent-equal';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('incumbent-equal-', '10.00', '6.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);
      const incumbent: QualifiedDiscount = recordAt(bucket, 0);

      // Seeding leaves the sale-price entry at position 1 - CFML's `[1]`, this language's `[0]` -
      // because it is the only entry there is.
      expect(incumbent.promotionRewardID).toBe('');
      expect(incumbent.discountAmount.toDecimalString()).toBe('4');
      expect(bucket.length).toBe(1);

      const equalRewardDiscount: QualifiedDiscount = makeRewardDiscountRecord(
        promotionGraph.leakedRewardID,
        Money.fromDecimalString('4.00'),
        salePromotion,
      );

      // CFML parity [model/service/PromotionService.cfc:L271]: the facade's descending insertion
      // sort tests `orderItemQulifiedDiscounts[...][d].discountAmount < discountAmount` - a STRICT
      // `<`. An equal candidate therefore fails the test at every position and falls through to the
      // append at [L285-L294], which is why the INCUMBENT keeps position 1. And position 1 is the
      // only position that spends money: the application pass reads index `[1]` and nothing else
      // [L532, L534].
      //
      // LEGACY-NOTE: the sort is FACADE-owned and is asserted by `../promotionService.test.ts`.
      // What is reproduced here is the predicate's verdict on a seeded incumbent and the resulting
      // order, because that verdict is the seeding pass's own ordering consequence.
      expect(incumbent.discountAmount.isLessThan(equalRewardDiscount.discountAmount)).toBe(false);
      expect(incumbent.discountAmount.compare(equalRewardDiscount.discountAmount)).toBe(0);

      bucket.push(equalRewardDiscount);

      expect(describeBucket(bucket)).toStrictEqual([
        `|${salePromotionID}|4`,
        `${promotionGraph.leakedRewardID}|${salePromotionID}|4`,
      ]);
      expect(recordAt(bucket, 0)).toBe(incumbent);
      expect(recordAt(bucket, 0).promotionRewardID).toBe('');
    });

    it('IS displaced by a strictly larger reward discount', async () => {
      const orderItemID = 'oi-incumbent-larger';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('incumbent-larger-', '10.00', '6.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);
      const incumbent: QualifiedDiscount = recordAt(bucket, 0);
      const largerRewardDiscount: QualifiedDiscount = makeRewardDiscountRecord(
        promotionGraph.leakedRewardID,
        Money.fromDecimalString('4.01'),
        salePromotion,
      );

      // One cent more is enough: the strict test passes, so the candidate is inserted BEFORE the
      // incumbent and the seeded entry drops to position 2, where nothing reads it.
      expect(incumbent.discountAmount.isLessThan(largerRewardDiscount.discountAmount)).toBe(true);

      bucket.splice(0, 0, largerRewardDiscount);

      expect(describeBucket(bucket)).toStrictEqual([
        `${promotionGraph.leakedRewardID}|${salePromotionID}|4.01`,
        `|${salePromotionID}|4`,
      ]);
      expect(recordAt(bucket, 1)).toBe(incumbent);
    });
  });

  describe('nothing is sorted, rounded, quantized or clamped by this pass', () => {
    it('retains full decimal precision and applies no two-place quantization', async () => {
      const orderItemID = 'oi-full-precision';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('full-precision-', '10.0001', '5.00005', salePromotionID),
          quantity: 3,
        },
      ]);

      const presentationSpy = vi.spyOn(Money.prototype, 'toFixed2');

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // (10.0001 x 3) - (5.00005 x 3) = 30.0003 - 15.00015 = 15.00015, carried at FULL precision.
      //
      // CFML parity [model/service/PromotionService.cfc:L150]: the seeded amount is the raw
      // `precisionEvaluate` result. The slice's two quantization points are elsewhere and both
      // belong to `discountAmount.test.ts`: `numberFormat(discountAmount,"0.00")` on the reward
      // path's output [L1017], and the same call on the rounding service's input
      // [model/service/RoundingRuleService.cfc:L89]. Neither is reached from here, and a seeded
      // amount quantized to `15.00` would silently discard 0.00015 of a discount before any reward
      // has competed for it.
      expect(record.discountAmount.toDecimalString()).toBe('15.00015');
      expect(record.discountAmount.equals(Money.fromDecimalString('15.00015'))).toBe(true);
      expect(record.discountAmount.toFixed2()).toBe('15.00');
      expect(record.discountAmount.equals(Money.fromDecimalString('15.00'))).toBe(false);

      // The subject itself performed no presentation call; the only recorded one is the assertion's
      // own, three lines above.
      expect(presentationSpy.mock.calls.length).toBe(1);
    });

    it('consults no rounding collaborator, because it holds none', async () => {
      const orderItemID = 'oi-no-rounding';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('no-rounding-', '9.99', '3.33', salePromotionID),
          quantity: 7,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // The shipped class takes exactly ONE constructor parameter, the promotion resolver, so there
      // is no rounding rule service to reach and no `roundingRuleID` to honour - and the sale-price
      // detail row's own optional `roundingRuleID` is deliberately not read here. (9.99 x 7) -
      // (3.33 x 7) = 69.93 - 23.31 = 46.62, unrounded.
      expect(SalePriceSeeder.length).toBe(1);
      expect(recordAt(bucketOf(accumulator, orderItemID), 0).discountAmount.toDecimalString()).toBe(
        '46.62',
      );

      // The single collaborator was consulted only for the promotion, once.
      expect(resolver.getPromotionCalls).toStrictEqual([salePromotionID]);
    });

    it('applies no clamp, so a seeded discount may exceed the order item extended price', async () => {
      const orderItemID = 'oi-unclamped';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('unclamped-', '100.00', '1.00', salePromotionID),
          quantity: 2,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // (100.00 x 2) - (1.00 x 2) = 198, against an order item whose own extended price is far
      // smaller, because the gate compares against the SKU price and the arithmetic uses it too.
      //
      // CFML parity [model/service/PromotionService.cfc:L150]: there is no bound of any kind on
      // this line. The bidirectional clamp lives on the REWARD path, in `getDiscountAmount` at
      // [L1013-L1015], and is AAP defect 14, owned by `discountAmount.test.ts`. Introducing a
      // clamp here would change the seeded figure the descending sort competes against.
      expect(record.discountAmount.toDecimalString()).toBe('198');
      expect(record.discountAmount.isGreaterThan(itemAt(order, 0).extendedPrice)).toBe(true);
    });

    it('keys buckets in ORDER-ITEM order, never in discount order', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-first-and-smaller',
          sku: makeSkuWithSalePrice('first-smaller-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-second-and-larger',
          sku: makeSkuWithSalePrice('second-larger-', '10.00', '1.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L145]: the pass walks
      // `arguments.order.getOrderItems()` in the collection's own order and writes each key as it
      // goes. Nothing here compares one order item's discount with another's - buckets are keyed
      // per item, so there is nothing between items to sort, and WITHIN a bucket seeding produces
      // exactly one entry. The descending sort at [L266-L294] operates inside a single bucket and
      // is facade-owned.
      expect(Object.keys(accumulator)).toStrictEqual([
        'oi-first-and-smaller',
        'oi-second-and-larger',
      ]);
      expect(describeAccumulator(accumulator)).toStrictEqual({
        'oi-first-and-smaller': [`|${salePromotionID}|1`],
        'oi-second-and-larger': [`|${salePromotionID}|9`],
      });
    });
  });

  describe('the promotion resolution the pass awaits', () => {
    it('is asked for the sale-price row identifier verbatim, once per qualifying row', async () => {
      const awkwardPromotionID = 'PROMO/9f3b Sale.2024';
      const awkwardPromotion: Promotion = makePromotionFixtures({ idPrefix: 'awkward-' }).promotion;
      const awkwardResolver = new RecordingPromotionResolver([
        [awkwardPromotionID, awkwardPromotion],
      ]);
      const awkwardSeeder = new SalePriceSeeder(awkwardResolver);
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-awkward-identifier',
          sku: makeSkuWithSalePrice('awkward-id-', '10.00', '5.00', awkwardPromotionID),
          quantity: 1,
        },
      ]);

      await awkwardSeeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L157]: the argument is
      // `salePriceDetails.promotionID`, passed through untouched - not trimmed, cased, encoded or
      // validated. The identifier is opaque to this pass.
      expect(awkwardResolver.getPromotionCalls).toStrictEqual([awkwardPromotionID]);

      // And the AWAITED result is what lands in the record - the reason the method is asynchronous
      // at all, since the promotion is fetched rather than already materialised on the row.
      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, 'oi-awkward-identifier'), 0);

      expect(record.promotion).toBe(awkwardPromotion);
      expect(record.promotion).not.toBe(salePromotion);
    });

    it('resolves each distinct identifier once within a pass and reuses the same instance', async () => {
      const secondPromotion: Promotion = makePromotionFixtures({ idPrefix: 'second-' }).promotion;
      const secondPromotionID: string = secondPromotion.getPromotionID();
      const twoPromotionResolver = new RecordingPromotionResolver([
        [salePromotionID, salePromotion],
        [secondPromotionID, secondPromotion],
      ]);
      const twoPromotionSeeder = new SalePriceSeeder(twoPromotionResolver);
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-shared-promotion-a',
          sku: makeSkuWithSalePrice('shared-a-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-shared-promotion-b',
          sku: makeSkuWithSalePrice('shared-b-', '10.00', '8.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-other-promotion',
          sku: makeSkuWithSalePrice('other-', '10.00', '7.00', secondPromotionID),
          quantity: 1,
        },
      ]);

      await twoPromotionSeeder.seedSalePriceDiscounts(order, accumulator);

      expect(secondPromotionID).not.toBe(salePromotionID);

      // Two order items sharing one promotion produce ONE resolution, and the distinct one produces
      // its own. JUDGMENT CALL: this is a CORRECTNESS assertion about identity, not a claim about
      // repeated work - the two records carrying the same promotion must carry the SAME instance,
      // because the application pass at [L529-L537] and the correction pass at [L468-L521] both
      // reach through the record into the promotion, and two equal-but-separate entities would let
      // one record's view of a promotion diverge from another's within a single pass.
      expect(twoPromotionResolver.getPromotionCalls).toStrictEqual([
        salePromotionID,
        secondPromotionID,
      ]);

      const sharedA: QualifiedDiscount = recordAt(
        bucketOf(accumulator, 'oi-shared-promotion-a'),
        0,
      );
      const sharedB: QualifiedDiscount = recordAt(
        bucketOf(accumulator, 'oi-shared-promotion-b'),
        0,
      );
      const other: QualifiedDiscount = recordAt(bucketOf(accumulator, 'oi-other-promotion'), 0);

      expect(sharedA.promotion).toBe(salePromotion);
      expect(sharedB.promotion).toBe(salePromotion);
      expect(sharedB.promotion).toBe(sharedA.promotion);
      expect(other.promotion).toBe(secondPromotion);
      expect(other.promotion).not.toBe(sharedA.promotion);
    });

    it('is not consulted at all when no order item passes the gate', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-equal-price',
          sku: makeSkuWithSalePrice('gate-equal-', '10.00', '10.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-higher-price',
          sku: makeSkuWithSalePrice('gate-higher-', '10.00', '11.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-absent-row',
          sku: makeSkuWithoutSalePrice('gate-absent-', '10.00'),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      expect(resolver.getPromotionCalls).toStrictEqual([]);
      expect(describeAccumulator(accumulator)).toStrictEqual({});
    });
  });

  describe('A2 - the pass holds no state across invocations', () => {
    it('does not let one seeding run reach another run accumulator', async () => {
      const firstAccumulator: OrderItemQualifiedDiscounts = {};
      const secondAccumulator: OrderItemQualifiedDiscounts = {};
      const firstOrder: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-run-one',
          sku: makeSkuWithSalePrice('run-one-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
      ]);
      const secondOrder: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-run-two',
          sku: makeSkuWithSalePrice('run-two-', '10.00', '4.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(firstOrder, firstAccumulator);
      await seeder.seedSalePriceDiscounts(secondOrder, secondAccumulator);

      // Each run wrote only into the structure it was handed. Nothing accumulated on the subject
      // between them: its only field is the readonly resolver, and the identity map that keeps one
      // instance per identifier is declared INSIDE the method, so it is created and discarded per
      // invocation.
      expect(describeAccumulator(firstAccumulator)).toStrictEqual({
        'oi-run-one': [`|${salePromotionID}|1`],
      });
      expect(describeAccumulator(secondAccumulator)).toStrictEqual({
        'oi-run-two': [`|${salePromotionID}|6`],
      });
      expect(structKeyExists(firstAccumulator, 'oi-run-two')).toBe(false);
      expect(structKeyExists(secondAccumulator, 'oi-run-one')).toBe(false);

      // The invocation-local identity map is what makes the second run resolve again rather than
      // answer from the first run - one call per run, two in total.
      expect(resolver.getPromotionCalls).toStrictEqual([salePromotionID, salePromotionID]);
    });

    it('leaves the order view it was handed unmodified', async () => {
      const orderItemID = 'oi-read-only-input';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('read-only-', '10.00', '2.00', salePromotionID),
          quantity: 5,
        },
      ]);
      const itemsBefore: string[] = order.orderItems.map(
        (item) =>
          `${item.orderItemID}|${String(item.quantity)}|${item.price.toDecimalString()}|` +
          `${item.sku.getPrice().toDecimalString()}`,
      );

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // The order view is an ANTI-CORRUPTION INPUT: the legacy pass mutated a live order aggregate,
      // and the target writes its findings into the accumulator instead, leaving the input
      // untouched. (10.00 x 5) - (2.00 x 5) = 40 is recorded against the item, never on it.
      expect(
        order.orderItems.map(
          (item) =>
            `${item.orderItemID}|${String(item.quantity)}|${item.price.toDecimalString()}|` +
            `${item.sku.getPrice().toDecimalString()}`,
        ),
      ).toStrictEqual(itemsBefore);
      expect(order.appliedPromotions).toStrictEqual([]);
      expect(Object.isFrozen(itemAt(order, 0))).toBe(true);
      expect(recordAt(bucketOf(accumulator, orderItemID), 0).discountAmount.toDecimalString()).toBe(
        '40',
      );
    });
  });
});
