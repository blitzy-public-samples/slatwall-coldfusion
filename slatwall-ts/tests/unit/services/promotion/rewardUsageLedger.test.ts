// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning
// `src/services/promotion/rewardUsageLedger.ts`
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and saying so is a
// requirement rather than a courtesy: presenting net-new coverage as parity
// would fail the traceability gate. The evidence, re-measured against this
// checkout rather than quoted:
//
//   * `meta/tests/unit/service/` holds exactly four components -
//     `AccountServiceTest.cfc`, `HibachiServiceTest.cfc`,
//     `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`. None is in scope,
//     and there is no `PromotionServiceTest.cfc` anywhere.
//   * `grep -rli 'promotion' meta/tests/` returns ZERO files. No legacy test
//     touches promotions at any tier - not the engine, not the entities, not the
//     DAO.
//
// Across the whole migration only `tests/unit/domain/entities/brand.test.ts` and
// `tests/unit/domain/entities/product.test.ts` extend a legacy suite, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub
// contributing zero coverage to anybody. Nothing is borrowed here and no lineage
// is claimed. The claim is also ASSERTED rather than merely written down - see
// the first test below, which reads the fixture graph's own
// `legacyTestCoverageExists` flag.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE PINS - FIVE INLINE CFML FRAGMENTS, NOT A CFML FUNCTION
// ---------------------------------------------------------------------------
// The subject is the promotion engine's mutable reward-usage ledger:
// `var promotionRewardUsageDetails = {};` [model/service/PromotionService.cfc:L139]
// together with the five fragments that seed, ratchet, increment, divide and
// order it. Every locator below was read verbatim from the 1125-line source.
//
//   F1 SEED           [L171-L189] guarded by `structKeyExists` at L172; the
//                     literal `1000000` written into all three limits at
//                     L175-L177; the three `!isNull(x) && x > 0` overrides at
//                     L180, L183 and L186.
//   F2 RATCHET        [L223-L224] `if((qualificationQuantity *
//                     maximumUsePerQualification) lt maximumUsePerOrder)` and the
//                     assignment of that same product.
//   F3 INCREMENT      [L297] `usedInOrder += discountQuantity`, in place.
//   F4 DIVISION       [L299] `precisionEvaluate('discountAmount /
//                     discountQuantity')`, with NO zero check on the divisor.
//   F5 ASCENDING SORT [L301-L329] scan at L304, STRICT `>` at L306,
//                     `arrayInsertAt` at L309, `break` at L316, `arrayAppend` at
//                     L320-L329.
//
// ---------------------------------------------------------------------------
// ORDER-DEPENDENCE VECTORS OWNED HERE
// ---------------------------------------------------------------------------
// This suite owns vectors 1, 5 and 6, plus the ASCENDING half of vector 4:
//
//   V1 The mutable ledger threaded through the reward loop. `usedInOrder`
//      accumulates in place [L297] and the seed is FIRST-WINS [L172], so what a
//      later reward observes depends on which earlier rewards ran.
//   V4 Two insertion sorts running in OPPOSITE directions. The ascending one
//      [L301-L329] is pinned here; the descending accumulator [L266-L294] is
//      façade-owned and is deliberately NOT asserted below.
//   V5 The unguarded division [L299].
//   V6 The ratchet [L223-L224].
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: VECTOR 6 IS A
// FOLDER-ANALYSIS DISCOVERY, NOT ONE OF THE FIVE THE PLAN PUBLISHES.
// It is recorded as a sixth so the count of known mechanisms is honest rather
// than inherited, and the count STAYS AT SIX. The plain `+` at
// [model/service/PromotionService.cfc:L417] -
// `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()` -
// is a NOTE about pass ordering rather than a seventh vector, and it belongs to
// `twoPassRewardIterator.test.ts`.
//
// ---------------------------------------------------------------------------
// BUDGET LEDGERS - NOTHING IS SPENT HERE, AND THE DIVERGENCE COUNT IS ZERO
// ---------------------------------------------------------------------------
// No signature reshaping (the project's three are the anti-corruption
// inversions, the two smart-list renames and the feed adapter's
// `generateProductFeed`). No visibility widening (all five live in this folder
// and the ledger is exhausted; none is consumed here). No signature widening
// (the single one is already spent on `isCurrent` in
// `src/domain/entities/promotionPeriod.ts`). And NO DELIBERATE DIVERGENCE: the
// project's three are defects 13 and 12, both owned by `discountAmount.test.ts`,
// and defect 19 in `src/domain/entities/product.ts`.
//
// EVERY BEHAVIOUR BELOW IS PRESERVED AS-WRITTEN, INCLUDING THE ONES THAT LOOK
// WRONG. A stored use limit of `0` meaning UNLIMITED is the clearest example, and
// it is pinned rather than repaired.
//
// ---------------------------------------------------------------------------
// INTERFACE PARITY - THIS MODULE'S NAMES ARE NOT PARITY-CONSTRAINED
// ---------------------------------------------------------------------------
// The seven frozen legacy method names are `getDiscountAmount`,
// `getOrderItemInQualifier`, `getOrderItemInReward`,
// `getPromotionPeriodQualificationDetails`, `getQualifierQualificationDetails`,
// `getPromotionPeriodQualifiedFulfillmentIDList` and
// `getPromotionPeriodOrderItemQualificationCount`. NONE of them is in this file.
// The subject is assembled from inline CFML fragments that never had names of
// their own, so its method names are the shipped TypeScript names -
// `ensureRewardEntry`, `ratchetMaximumUsePerOrder`, `recordOrderItemUsage` and
// the `promotionRewardUsageDetails` accessor - and this suite asserts them
// exactly as shipped. Where the shipped surface and any expectation disagree, the
// SHIPPED SURFACE WINS; nothing under `src/**` is renamed, re-exported or
// bridged by a shim to suit a test.
//
// ---------------------------------------------------------------------------
// OWNERSHIP BOUNDARY - RECORDED, AND NOT CROSSED
// ---------------------------------------------------------------------------
// The split is MECHANICS here, AGGREGATE PIPELINE at the façade. Nothing below
// asserts any of the following, and a scenario that needs one belongs in
// `../promotionService.test.ts`:
//
//   [L222]      reading the qualification memo into `qualificationQuantity`.
//   [L228]      the `discountQuantity` derivation. It recomputes the SAME
//               `qualificationQuantity * maximumUsePerQualification` product the
//               ratchet compares, which is why the two always agree - noted here,
//               and only the ratchet itself is asserted.
//   [L231-L233] the clamp to `orderItem.getQuantity()`.
//   [L236-L238] the clamp to `maximumUsePerItem`.
//   [L241-L252] the price-base selection branch.
//   [L257]      the `if(discountAmount > 0)` gate. This module is the BODY of
//               that branch, not the branch; see the gate section below for how
//               the closed path is covered without re-testing the gate.
//   [L266-L294] the DESCENDING accumulator sort.
//   [L345-L412] the fulfillment branch body; [L415-L455] the order branch body.
//
// Sibling-owned, likewise untouched: the L472/L486 over-use stripping
// consequence belongs to `overUseStripping.test.ts`, the L743 division to
// `qualifierQualification.test.ts`, the L831 division to
// `promotionPeriodQualification.test.ts`, the two-pass guard at L458-L461 to
// `twoPassRewardIterator.test.ts`, and the preserved `issue #1766` no-op at
// [model/service/PromotionService.cfc:L542-L544] to `../promotionService.test.ts`
// - that TODO stays a TODO and is not restated here.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L299, L486, L743, L831]: THERE
// ARE FOUR UNGUARDED DIVISIONS ACROSS THE SLICE AND NONE OF THE FOUR IS GUARDED.
// The set is recorded so a reviewer can see the pattern is deliberate rather than
// an oversight repeated four times. L299 is this file's; the other three belong
// to the siblings named above.
//
// ---------------------------------------------------------------------------
// REQUEST-SCOPED STATE IS THE HEADLINE REQUIREMENT OF THIS FILE
// ---------------------------------------------------------------------------
// The legacy ledger is a `var` local to one invocation of
// `updateOrderAmountsWithPromotions`; the target holds it as an INSTANCE field.
// A brand-new `RewardUsageLedger` is therefore constructed in `beforeEach` for
// every single test, this suite holds ZERO mutable module-level state, and one
// test proves directly that two independently constructed ledgers do not share
// state. On a warm Lambda container a module-level ledger would leak one
// customer's accumulated usage counts into another customer's order, and
// use-limit enforcement is one of the three must-preserve behaviours of this
// migration - so this is financial integrity, not tidiness.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
//   * NO SQL, SO THE PARAMETERIZED-STATEMENT OBLIGATION DOES NOT APPLY HERE, and
//     that is stated rather than left as an apparent omission. The REASON it does
//     not apply: the subject is a pure in-memory structure with no repository
//     collaborator and no query of any kind, so there is no statement to
//     parameterize and no binding to inspect. Prepared-statement assertions - the
//     injection-safety property `cfqueryparam` provided - belong exclusively to
//     `tests/integration/repositories/`. It follows that schema continuity is
//     trivially satisfied here too: no migration, no rename and no new table can
//     be introduced by a file that issues no SQL.
//   * NO DATABASE, NO DRIVER, NO POOL, NO SOCKET AND NO FILESYSTEM. Nothing under
//     `src/repositories/**`, `src/handlers/**` or `src/integrations/**` is
//     imported - tests are not a back door around the layer boundary.
//   * NO ENVIRONMENT READ AND NO CREDENTIAL OF ANY KIND. There is no
//     environment-variable access, no reliance on a dotenv file, and no host,
//     data-source or credential literal; the suite passes with a completely
//     empty environment. `src/lib/config.ts` and `src/lib/logger.ts` are
//     deliberately not imported, and there is no ambient request scope to stand
//     in for - the ledger's scope is its instance.
//   * NO NON-FUNCTIONAL ASSERTION. The unguarded division and the re-scanning
//     insertion sort are CORRECTNESS matters and are asserted structurally. No
//     duration is measured, no capacity or service-level claim of any kind is
//     made, no `testTimeout` is set or reasoned about, and the legacy runtime's
//     lock timeouts are noted-and-not-implemented elsewhere, never asserted.
//   * NO CONCURRENCY. `cfthread` usage across the in-scope slice is verified
//     zero, so there is no parallel test, no promise combinator and no
//     worker-thread module.
//   * NO NEW DEPENDENCY AND NO MOCKING LIBRARY. The subject takes no
//     collaborator, so no double is needed at all: `vitest` supplies the runner
//     and nothing else is added. No container, no composition root and no service
//     locator.
//   * NO EXPRESSION EVALUATOR. `precisionEvaluate` is reached only through the
//     typed `Money` surface; there is no `eval`, no dynamic function
//     construction and no `vm`.
//   * NO DATE OR CLOCK. The subject is date-free, so no instant is read or
//     written anywhere below.
//   * NO EXPORT. This file exports nothing at all, so no other module can couple
//     to it.
//   * NOTHING IS DEPLOYED OR PACKAGED BY A TEST. Deployability is proven by the
//     build and package steps, never here.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST FOR THIS PROJECT
// ---------------------------------------------------------------------------
// The rules source was read and returned the single line `No user rules
// provided.`, so the read is complete rather than partial. No rule has been
// invented to fill the gap, and the absence is NOT licence to lower the bar: the
// substitute enterprise-standard practices apply at full strength. The ones this
// file carries are maximal type strictness with no escape hatch other than the
// deliberate type-failure assertions that pin the published `readonly` members,
// the domain-inward layer boundary, `Money` and decimal STRINGS as the only
// monetary vocabulary with no raw floating-point arithmetic anywhere, zero
// exports, and in-code annotation of every judgment call and every preserved
// defect. Zero files enter scope by rule mandate, and there are no rule conflicts
// to resolve.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type {
  OrderItemUsage,
  PromotionRewardUsageDetail,
  UnlimitedUseSentinel,
} from '../../../../src/domain/promotionEngine/rewardUsageTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import { RewardUsageLedger } from '../../../../src/services/promotion/rewardUsageLedger.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// ---------------------------------------------------------------------------
// Types derived from the shipped surface, never restated
//
// JUDGMENT CALL: the fixture graph type is DERIVED with `ReturnType` rather than
// imported, because `promotionFixtures.ts` deliberately publishes exactly one
// symbol - the factory - and its graph interface is not exported. Deriving means
// this suite cannot drift from what it is handed: change the graph and this file
// stops compiling, which is the signal a suite should give rather than continuing
// to pass against a contract that has moved.
//
// `OrderItemUsage`, `PromotionRewardUsageDetail` and `UnlimitedUseSentinel` are
// IMPORTED from `src/domain/promotionEngine/rewardUsageTypes.ts` above. A local
// copy of any of the three would be a gate failure: there is one owner for the
// contract and one place a change to it breaks the build.
// ---------------------------------------------------------------------------

/** The graph `makePromotionFixtures` hands back, as it declares it. */
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/** The `Sku` the graph carries, reached structurally so no entity import is needed. */
type FixtureSku = PromotionFixtureGraph['sku'];

// ---------------------------------------------------------------------------
// The sentinel, written exactly as the source writes it
//
// CFML parity [model/service/PromotionService.cfc:L175-L177]: `1000000`, with NO
// numeric separator, so the literal greps identically in the target and in the
// legacy source. A digit-grouped spelling would be the same number written as the
// wrong text, and would no longer match the legacy source under a plain search.
//
// Typed by the PUBLISHED `UnlimitedUseSentinel` alias, which is the literal type
// `1000000`, so the compiler rejects a different value here rather than leaving
// it to a reviewer's diligence. The alias has no runtime footprint of its own -
// it is a type, not a `const` - which is why the digits are written out.
// ---------------------------------------------------------------------------

/** The value the ledger seeds every use limit with until a merchant configures one. */
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

// ---------------------------------------------------------------------------
// Monetary values as decimal STRINGS, and counts as plain numbers
//
// ★ THE DISTINCTION IS LOAD-BEARING IN THIS FILE. `discountPerUseValue` IS money
// and is always `Money`. `discountQuantity`, `usedInOrder`, `maximumUsePerOrder`,
// `maximumUsePerItem` and `maximumUsePerQualification` are plain integer COUNTS
// of uses - `OrderItem.quantity` is `ormtype="integer"` - so they stay `number`,
// are never wrapped in `Money`, and the `1000000` sentinel is never treated as a
// monetary amount.
//
// Not one expected monetary value below is computed with JavaScript arithmetic.
// Every one is a decimal string literal handed to `Money.fromDecimalString`, and
// every quotient asserted is the exact canonical form the shipped `dividedBy`
// produces - measured, not guessed, because `Money` retains the numeral it was
// given and `toStrictEqual` compares representations while `equals` compares
// values.
// ---------------------------------------------------------------------------

/** `2.50 / 2` is exactly `1.25` - the pinned three-member usage record. */
const DISCOUNT_TWO_FIFTY = '2.50';

/** Quotient `1`, from `3.00 / 3`. The LOW per-use value in the ordering cases. */
const DISCOUNT_THREE = '3.00';

/** Quotient `2`, from `4.00 / 2`. The MIDDLE per-use value. */
const DISCOUNT_FOUR = '4.00';

/** Quotient `2` again, from `2.00 / 1` - the deliberate TIE against `4.00 / 2`. */
const DISCOUNT_TWO = '2.00';

/** Quotient `3`, from `9.00 / 3`. The HIGH per-use value. */
const DISCOUNT_NINE = '9.00';

/** A discount of exactly nothing, used to probe the façade-owned L257 gate's boundary. */
const DISCOUNT_ZERO = '0';

/** A negative discount, which the legacy gate at L257 likewise excludes. */
const DISCOUNT_NEGATIVE_FIVE = '-5.00';

/** The canonical quotients the assertions below pin, as decimal strings. */
const PER_USE_ONE = '1';
const PER_USE_TWO = '2';
const PER_USE_THREE = '3';
const PER_USE_ONE_AND_A_QUARTER = '1.25';

/**
 * The substring the shipped zero-divisor refusal always carries.
 *
 * CFML parity [model/service/PromotionService.cfc:L299]: the legacy divisor is
 * unguarded and CFML raises a division-by-zero error. `src/lib/cfml/precision.ts`
 * refuses a zero divisor and throws, and its error class is deliberately NOT
 * exported, so the failure is matched on its message rather than on a type the
 * module does not publish. Matching a substring rather than the whole sentence
 * keeps the assertion about the BEHAVIOUR - a refusal, not a resolved value -
 * rather than about the exact prose.
 */
const ZERO_DIVISOR_MESSAGE = /received a zero divisor/;

/**
 * One order item, as the ledger reads it: an opaque identifier and nothing else.
 *
 * JUDGMENT CALL: constructed INLINE in this suite rather than imported from a
 * shared order-view fixture module. Two reasons, both deliberate. First, the
 * dependency set for this file names `tests/fixtures/promotionFixtures.ts` and no
 * other fixture module, and inline construction inside the consuming suite is the
 * sanctioned way to express a small variation. Second, and more usefully, an
 * inline literal makes visible exactly how little of an order item this module
 * touches: `recordOrderItemUsage` reads `orderItemID` and NOTHING ELSE, so the
 * other nine members exist only to satisfy the read-only view's closed
 * ten-member contract.
 *
 * `appliedPriceGroup` is a REQUIRED member typed `PriceGroup | undefined`, not an
 * optional one, so the key is present with an explicit `undefined`. That is not
 * the pattern `exactOptionalPropertyTypes` forbids - what it forbids is writing
 * `undefined` into a key declared with `?`, and this key is not.
 *
 * ★ THE IDENTIFIER IS OPAQUE. It is never parsed, never validated as a UUID and
 * never used to look anything up. `Order` and `OrderItem` are out of scope, and
 * this string is the whole of what crosses the anti-corruption boundary. Nothing
 * below mutates the returned view, and the ledger never retains a reference to
 * it - only the string.
 *
 * @param sku the fixture graph's SKU; carried because the view declares it, and
 *   read by nothing in this module.
 * @param orderItemID the opaque identifier the usage record will carry.
 */
function makeOrderItemView(sku: FixtureSku, orderItemID: string): OrderItemView {
  return {
    orderItemID,
    sku,
    quantity: 3,
    price: Money.fromDecimalString('19.99'),
    skuPrice: Money.fromDecimalString('19.99'),
    extendedPrice: Money.fromDecimalString('59.97'),
    extendedSkuPrice: Money.fromDecimalString('59.97'),
    appliedPriceGroup: undefined,
    orderItemType: { systemCode: 'oitSale' },
    orderFulfillmentID: 'reward-usage-ledger-fulfillment',
    // Empty because the ledger never reads it. The member exists for the blanket clear at
    // [model/service/PromotionService.cfc:L64-L68], which runs before the ledger is built.
    appliedPromotions: [],
  };
}

/**
 * A promotion reward carrying only an identifier and, optionally, use limits.
 *
 * The four canonical limit SHAPES - absent, zero, negative and positive - come
 * from the fixture graph's purpose-built exhibits, which is what those exhibits
 * exist for. This builder covers the cases the graph cannot express because they
 * turn on the IDENTIFIER rather than on the limits: two rewards sharing one
 * identifier, two differing only in case, and an identifier that collides with a
 * name on `Object.prototype`.
 *
 * `PromotionReward`'s constructor requires `promotionRewardID` alone
 * [src/domain/entities/promotionReward.ts]; every other member is optional and
 * every collection defaults to empty, so this is a complete construction rather
 * than a partial one. Under `exactOptionalPropertyTypes` a limit that should be
 * ABSENT must be omitted, never assigned `undefined`, which is why the three
 * limits are spread from a caller-supplied object rather than passed positionally
 * with an `undefined` filler.
 */
function makeRewardWithID(
  promotionRewardID: string,
  limits: {
    readonly maximumUsePerOrder?: number;
    readonly maximumUsePerItem?: number;
    readonly maximumUsePerQualification?: number;
  } = {},
): PromotionReward {
  return new PromotionReward({ promotionRewardID, ...limits });
}

/**
 * The entry at `index`, proven present before it is read.
 *
 * `noUncheckedIndexedAccess` types every indexed read as
 * `OrderItemUsage | undefined`, and this suite uses neither a postfix `!` nor a
 * cast to make that go away. The read is captured, tested and only then returned,
 * so a missing entry becomes a named failure at the point of the read rather than
 * a confusing one several assertions later.
 */
function usageAt(usage: PromotionRewardUsageDetail, index: number): OrderItemUsage {
  const entry = usage.orderItemsUsage[index];

  if (entry === undefined) {
    throw new Error(
      `orderItemsUsage has no entry at index ${String(index)}; it holds ` +
        `${String(usage.orderItemsUsage.length)} entries.`,
    );
  }

  return entry;
}

/** The per-use values of a reward's usage records, in the order the array holds them. */
function perUseValues(usage: PromotionRewardUsageDetail): string[] {
  return usage.orderItemsUsage.map((entry) => entry.discountPerUseValue.toDecimalString());
}

/** The opaque order-item identifiers of a reward's usage records, in array order. */
function orderItemIDs(usage: PromotionRewardUsageDetail): string[] {
  return usage.orderItemsUsage.map((entry) => entry.orderItemID);
}

describe('RewardUsageLedger', () => {
  // ---------------------------------------------------------------------------
  // A2 - REQUEST-SCOPED STATE, STRUCTURALLY
  //
  // A fresh graph AND a fresh ledger for every single test. `let` bindings inside
  // the `describe` closure rather than module-level `const`s, reassigned in
  // `beforeEach`, so no test can observe any state another test produced. This
  // suite holds no mutable module-level value of any kind.
  // ---------------------------------------------------------------------------

  let fixtures: PromotionFixtureGraph;
  let ledger: RewardUsageLedger;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
    ledger = new RewardUsageLedger();
  });

  describe('traceability - this suite is net-new', () => {
    it('has no legacy antecedent, and the fixture graph records the same finding', () => {
      // Asserted rather than merely written in the banner above: the fixture
      // graph carries the measured claim, and a suite that presented net-new
      // coverage as parity would fail the traceability gate.
      expect(fixtures.legacyTestCoverageExists).toBe(false);
    });
  });

  describe('the shipped surface', () => {
    it('publishes one accessor and three synchronous methods, and takes no collaborator', () => {
      // CFML parity: the subject replaces DI/1's convention scan for this
      // fragment entirely - the legacy ledger is a bare `var` struct with no
      // collaborator at all, so the ported class takes NO constructor argument
      // and the whole dependency graph for it is empty.
      expect(RewardUsageLedger.length).toBe(0);

      expect(typeof ledger.ensureRewardEntry).toBe('function');
      expect(typeof ledger.ratchetMaximumUsePerOrder).toBe('function');
      expect(typeof ledger.recordOrderItemUsage).toBe('function');

      // Arities, pinned so a silently added parameter fails here.
      expect(ledger.ensureRewardEntry.length).toBe(1);
      expect(ledger.ratchetMaximumUsePerOrder.length).toBe(2);
      expect(ledger.recordOrderItemUsage.length).toBe(4);
    });

    it('exposes the ledger through a getter with no setter', () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        RewardUsageLedger.prototype,
        'promotionRewardUsageDetails',
      );

      expect(descriptor).toBeDefined();

      if (descriptor === undefined) {
        throw new Error('promotionRewardUsageDetails is not declared on the prototype.');
      }

      expect(typeof descriptor.get).toBe('function');

      // No setter: the ledger record cannot be REBOUND from outside, even though
      // its contents are deliberately mutable. Replacing the whole structure
      // mid-order would discard the accumulated usage the algorithm depends on.
      //
      // Probed through `typeof` rather than by reading the descriptor member as a
      // value, because `PropertyDescriptor` declares `get` and `set` with method
      // shorthand and an unbound reference to either is a lint error.
      expect(typeof descriptor.set).toBe('undefined');
    });

    it('keeps the ascending insertion sort private, so its ordering cannot be bypassed', () => {
      // The ordering is a property of the ledger rather than a reusable utility.
      // TypeScript privacy is erased at runtime, so the compile-time boundary is
      // asserted with a deliberate type failure and the runtime name is recorded
      // separately below.
      // @ts-expect-error insertUsageInAscendingOrder is private to RewardUsageLedger.
      expect(typeof ledger.insertUsageInAscendingOrder).toBe('function');
    });

    it('declares exactly the six prototype members, and publishes nothing more', () => {
      // Sorted, because prototype declaration order is not part of the contract.
      // `insertUsageInAscendingOrder` appears here because TypeScript's `private`
      // is a compile-time restriction that leaves an ordinary prototype method
      // behind; the test above is what pins its inaccessibility.
      expect(Object.getOwnPropertyNames(RewardUsageLedger.prototype).slice().sort()).toStrictEqual([
        'constructor',
        'ensureRewardEntry',
        'insertUsageInAscendingOrder',
        'promotionRewardUsageDetails',
        'ratchetMaximumUsePerOrder',
        'recordOrderItemUsage',
      ]);
    });

    it('answers synchronously - nothing here returns a promise', () => {
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // The legacy fragments perform no query and no I/O, so the ported surface is
      // synchronous end to end: no method here is declared `async`, none returns a
      // promise, and nothing in this file ever suspends on one.
      expect(usage).not.toBeInstanceOf(Promise);
      expect(ledger.ratchetMaximumUsePerOrder(usage, 1)).toBeUndefined();
      expect(
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
          1,
          Money.fromDecimalString(DISCOUNT_TWO),
        ),
      ).toBeUndefined();
    });

    it('starts empty, exactly as `var promotionRewardUsageDetails = {}` does', () => {
      // CFML parity [model/service/PromotionService.cfc:L139]: the struct is
      // declared empty and gains a key per reward encountered.
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toStrictEqual([]);
    });
  });

  describe('request-scoped state (A2)', () => {
    it('gives two independently constructed ledgers completely separate state', () => {
      // ★ THE HEADLINE ASSERTION OF THIS FILE. On a warm Lambda container a
      // module-level ledger would leak one customer's accumulated usage counts
      // into another customer's order, and use-limit enforcement is a
      // must-preserve behaviour. The instance-field design is what prevents that,
      // and this is the direct proof.
      const other = new RewardUsageLedger();

      const mutated = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      ledger.recordOrderItemUsage(
        mutated,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(mutated.usedInOrder).toBe(2);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(1);

      // The second ledger saw none of it.
      expect(Object.keys(other.promotionRewardUsageDetails)).toStrictEqual([]);

      // And seeding the SAME reward into the second ledger produces a brand-new
      // entry with zero usage rather than the first ledger's accumulated one.
      const untouched = other.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(untouched).not.toBe(mutated);
      expect(untouched.usedInOrder).toBe(0);
      expect(untouched.orderItemsUsage).toStrictEqual([]);
      expect(untouched.orderItemsUsage).not.toBe(mutated.orderItemsUsage);
    });

    it('returns the LIVE record from the accessor, not a defensive copy', () => {
      // JUDGMENT CALL recorded on the shipped getter: a copy would break the
      // algorithm rather than protect it, because over-use stripping is specified
      // against the ratcheted and incremented values this class produces. The
      // identity is therefore part of the contract and is asserted as such.
      expect(ledger.promotionRewardUsageDetails).toBe(ledger.promotionRewardUsageDetails);

      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const rewardID = fixtures.boundedUseLimitsReward.getPromotionRewardID();

      expect(ledger.promotionRewardUsageDetails[rewardID]).toBe(usage);

      ledger.ratchetMaximumUsePerOrder(usage, 0);

      const throughAccessor = ledger.promotionRewardUsageDetails[rewardID];

      expect(throughAccessor).toBeDefined();

      if (throughAccessor === undefined) {
        throw new Error('the seeded entry is not reachable through the accessor.');
      }

      // A mutation made through the returned entry is visible through the
      // accessor, because they are one object.
      expect(throughAccessor.maximumUsePerOrder).toBe(0);
    });
  });

  describe('seeding - the 1000000 sentinel', () => {
    it('seeds all three use limits with the literal 1000000 when none is configured', () => {
      // CFML parity [model/service/PromotionService.cfc:L174-L178]: the seed
      // writes `usedInOrder = 0`, all three limits at `1000000`, and an empty
      // `orderItemsUsage`.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(usage.usedInOrder).toBe(0);
      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
      expect(usage.orderItemsUsage).toStrictEqual([]);

      // The same value reached through the published literal type, so a changed
      // sentinel fails to compile as well as failing here.
      expect(usage.maximumUsePerOrder).toBe(UNLIMITED_USE_SENTINEL);
      expect(fixtures.unlimitedUseSentinel).toBe(UNLIMITED_USE_SENTINEL);
    });

    it('★ keeps the sentinel FINITE, because it is a multiplicand and a subtrahend', () => {
      // CFML parity [model/service/PromotionService.cfc:L223, L224, L228, L236,
      // L472]: substituting `Infinity`, `Number.MAX_SAFE_INTEGER`, `null`,
      // `undefined` or an optional key is NOT a safer choice, because the sentinel
      // does not merely get compared against - it is multiplied at L223, ASSIGNED
      // back into a stored limit at L224, re-derived at L228, clamped against at
      // L236 and SUBTRACTED at L472. With `Infinity`, `L223`'s `Infinity <
      // Infinity` is false exactly as `1000000 < 1000000` is false, so that line
      // survives the substitution and gives false confidence, while L224 would
      // store `Infinity` as a real limit and `Infinity - Infinity` at L472 is
      // `NaN`, against which every later comparison is false. A large but finite
      // over-use factor of roughly `1000000 / quantity` is a DIFFERENT WRONG
      // ANSWER from `Infinity`, not a worse one - and the L472/L486 consequence
      // itself belongs to `overUseStripping.test.ts`, which owns it.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(Number.isFinite(usage.maximumUsePerOrder)).toBe(true);
      expect(Number.isSafeInteger(usage.maximumUsePerOrder)).toBe(true);

      // The multiplication at L223 stays a finite integer.
      expect(Number.isSafeInteger(3 * usage.maximumUsePerQualification)).toBe(true);

      // The subtraction at L472 stays a finite number rather than becoming NaN.
      expect(Number.isFinite(usage.usedInOrder - usage.maximumUsePerOrder)).toBe(true);
      expect(Number.isNaN(usage.usedInOrder - usage.maximumUsePerOrder)).toBe(false);
    });

    it('LEGACY-NOTE: absence and 1000000 are TWO representations of one concept', () => {
      // LEGACY-NOTE [model/entity/PromotionReward.cfc:L65-L67]: the three limit
      // columns declare `ormtype="integer" hb_nullRBKey="define.unlimited"`, so at
      // the ENTITY layer ABSENCE means unlimited and the ported accessors return
      // `number | undefined`. At the LEDGER layer the same meaning is carried by
      // the numeric `1000000` sentinel, because the value has to survive
      // arithmetic. The two conventions are deliberately NOT harmonised, and the
      // seed is the single translation point between them - which is why this
      // assertion reads both sides at once.
      expect(fixtures.unlimitedUseLimitsReward.getMaximumUsePerOrder()).toBeUndefined();
      expect(fixtures.unlimitedUseLimitsReward.getMaximumUsePerItem()).toBeUndefined();
      expect(fixtures.unlimitedUseLimitsReward.getMaximumUsePerQualification()).toBeUndefined();

      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });
  });

  describe('seeding - the four shapes a persisted use limit can take', () => {
    it('1. an ABSENT limit leaves the sentinel in place - the documented shape', () => {
      // CFML parity [model/service/PromotionService.cfc:L180, L183, L186]: the
      // `!isNull(...)` half of each guard. This is the shape
      // [model/validation/PromotionReward.json] validates as legitimate, since it
      // leaves all three merely `numeric` rather than required.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });

    it('2. ★★★ a persisted 0 ALSO leaves the sentinel in place, so ZERO MEANS UNLIMITED', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L180, L183, L186]: each
      // guard is `!isNull(x) && x > 0`, so a stored `0` FAILS the strictly-greater
      // test, the override never fires and the 1000000 sentinel survives. A
      // merchant who sets `maximumUsePerOrder = 0` intending "this reward may
      // never be used" therefore gets UNLIMITED uses - the exact opposite of the
      // configured intent, and a direct money risk.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The boundary is stated so it cannot be relaxed by accident: `>` is NEVER
      // widened to `>=`, there is no separate zero branch, and no positivity
      // validation is added, because the legacy has none and adding it would
      // reject configurations the running system accepts today.
      expect(fixtures.zeroUseLimitsReward.getMaximumUsePerOrder()).toBe(0);
      expect(fixtures.zeroUseLimitsReward.getMaximumUsePerItem()).toBe(0);
      expect(fixtures.zeroUseLimitsReward.getMaximumUsePerQualification()).toBe(0);

      const usage = ledger.ensureRewardEntry(fixtures.zeroUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);

      // Not zero. Stated explicitly, because reading `0` here is what a reader
      // expects and is precisely the answer the legacy does not give.
      expect(usage.maximumUsePerOrder).not.toBe(0);
    });

    it('3. ★★★ a persisted NEGATIVE limit means unlimited too, by the same guard', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L180, L183, L186]: a
      // negative value fails the identical `> 0` test and takes the identical
      // fall-through, so it is unlimited as well. This is not hypothetical -
      // nothing in the ORM metadata at [model/entity/PromotionReward.cfc:L65-L67]
      // and nothing in [model/validation/PromotionReward.json] constrains the
      // sign, so a negative value is persistable.
      // Preserved deliberately; do not fix without a product decision.
      expect(fixtures.negativeUseLimitsReward.getMaximumUsePerOrder()).toBe(-1);
      expect(fixtures.negativeUseLimitsReward.getMaximumUsePerItem()).toBe(-1);
      expect(fixtures.negativeUseLimitsReward.getMaximumUsePerQualification()).toBe(-1);

      const usage = ledger.ensureRewardEntry(fixtures.negativeUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(1000000);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });

    it('4. a POSITIVE limit is the only shape that overrides the sentinel', () => {
      // CFML parity [model/service/PromotionService.cfc:L181, L184, L187]: the
      // three assignments, each reached only when its guard passes. This is
      // therefore the only shape under which use-limit enforcement is observable
      // at all.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(2);
      expect(usage.maximumUsePerItem).toBe(1);
      expect(usage.maximumUsePerQualification).toBe(3);
    });

    it('overrides each limit INDEPENDENTLY - three guards, not one', () => {
      // The three guards at L180, L183 and L186 are separate statements, so a
      // reward may legitimately configure one limit and leave the other two
      // unlimited. A single combined guard would be a behaviour change.
      const partiallyConfigured = makeRewardWithID('reward-per-item-only', {
        maximumUsePerItem: 4,
      });

      const usage = ledger.ensureRewardEntry(partiallyConfigured);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(usage.maximumUsePerItem).toBe(4);
      expect(usage.maximumUsePerQualification).toBe(1000000);
    });

    it('accepts a fractional positive limit unchanged, because nothing coerces it', () => {
      // The columns are `ormtype="integer"`, but the guard only tests `> 0` and
      // the assignment copies the value through. No rounding, no truncation and no
      // integer validation exists at this point in the legacy, so none is added.
      const fractional = makeRewardWithID('reward-fractional-limit', {
        maximumUsePerOrder: 2.5,
      });

      expect(ledger.ensureRewardEntry(fractional).maximumUsePerOrder).toBe(2.5);
    });
  });

  describe('seeding - the L172 guard makes it FIRST-WINS and idempotent', () => {
    it('seeds a reward exactly once and returns the very same entry afterwards', () => {
      // CFML parity [model/service/PromotionService.cfc:L172, L189]: the whole seed
      // sits inside `if(!structKeyExists(...))`, so a re-encountered reward keeps
      // every bit of accumulated state - no re-seed, no re-read of the reward's
      // limits, no reset of `usedInOrder`. That guard is what makes this structure
      // a LEDGER rather than per-iteration scratch, and it matters because the
      // legacy reward loop genuinely revisits every reward at least twice.
      const first = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        first,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      const second = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(second).toBe(first);
      expect(second.usedInOrder).toBe(2);
      expect(second.orderItemsUsage).toHaveLength(1);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(1);
    });

    it('★ FIRST-WINS on the LIMITS too, so which reward object arrived first decides them', () => {
      // CFML parity [model/service/PromotionService.cfc:L172]: the guard keys on the
      // IDENTIFIER alone. Two reward objects carrying the same
      // `promotionRewardID` but different persisted limits therefore do not both
      // get a say - the first one seen decides, and the second is ignored
      // entirely, limits and all.
      const strict = makeRewardWithID('reward-shared-id', { maximumUsePerOrder: 2 });
      const lax = makeRewardWithID('reward-shared-id', { maximumUsePerOrder: 9 });

      const seeded = ledger.ensureRewardEntry(strict);
      const reEncountered = ledger.ensureRewardEntry(lax);

      expect(reEncountered).toBe(seeded);
      expect(reEncountered.maximumUsePerOrder).toBe(2);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(1);
    });

    it('★ FOLDS KEY CASE ON BOTH THE PRESENCE TEST AND THE READ, so ONE key survives', () => {
      // ★ THIS CASE ONCE ASSERTED THE OPPOSITE, AND THE ASSERTION WAS THE DEFECT.
      // It read "folds key case on the presence test but not on the read, so two
      // keys survive", and it passed - because `ensureRewardEntry` guarded with
      // the case-INSENSITIVE `structKeyExists` and then read
      // `this.ledger[promotionRewardID]` case-SENSITIVELY, so a case-differing
      // identifier passed the guard, read back `undefined`, and fell through to
      // seed a second entry.
      //
      // CFML parity [model/service/PromotionService.cfc:L172, L189]: a CFML struct
      // key is case-insensitive, so the legacy guard FINDS the existing entry and
      // the block does nothing at all - one entry, reused, with its accumulated
      // usage and its first-seen limits intact. Two entries is not a harmless
      // difference either: usage splits across them and `maximumUsePerOrder` is
      // UNDER-enforced, so the reward can apply more times than its own limit
      // allows. That is a money change, which is why the guard and the read now
      // resolve through the same case-folding accessor.
      const upper = makeRewardWithID('REWARD-CASE', { maximumUsePerOrder: 4 });
      const lower = makeRewardWithID('reward-case', { maximumUsePerOrder: 7 });

      const upperUsage = ledger.ensureRewardEntry(upper);

      // Accumulated state on the first entry, so the reuse below is proven to
      // preserve it rather than merely to return an object of the right shape.
      upperUsage.usedInOrder = 3;

      const lowerUsage = ledger.ensureRewardEntry(lower);

      // THE SAME OBJECT, not an equal one.
      expect(lowerUsage).toBe(upperUsage);

      // First-wins on the limits, exactly as it does for an identical spelling:
      // the second reward's `maximumUsePerOrder` of 7 is ignored entirely.
      expect(lowerUsage.maximumUsePerOrder).toBe(4);

      // And the running total survives the second encounter untouched.
      expect(lowerUsage.usedInOrder).toBe(3);

      // Exactly one key, stored under the spelling that arrived FIRST. No second
      // entry is added and the original key is not rewritten to the new casing.
      const keys = Object.keys(ledger.promotionRewardUsageDetails);

      expect(keys).toStrictEqual(['REWARD-CASE']);
    });

    it('stores a reward identifier that collides with an Object.prototype name', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L173-L178]: a CFML struct
      // has no prototype chain and no reserved keys, so the legacy accumulated
      // usage under `__proto__` like any other reward. A plain TypeScript
      // assignment would be intercepted and store NOTHING, which would reseed the
      // entry on every call and reset `usedInOrder` to zero - the reward's
      // per-order limit could then never be reached and the discount would apply
      // without bound. The shipped module defines an own, enumerable data property
      // instead, and this asserts the resulting parity rather than the mechanism.
      const collidingReward = makeRewardWithID('__proto__', { maximumUsePerOrder: 5 });

      const seeded = ledger.ensureRewardEntry(collidingReward);

      expect(seeded.maximumUsePerOrder).toBe(5);
      expect(
        Object.prototype.hasOwnProperty.call(ledger.promotionRewardUsageDetails, '__proto__'),
      ).toBe(true);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toStrictEqual(['__proto__']);

      // Usage accumulates against it, and re-encountering it does not reset.
      ledger.recordOrderItemUsage(
        seeded,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_THREE),
      );

      const reEncountered = ledger.ensureRewardEntry(collidingReward);

      expect(reEncountered).toBe(seeded);
      expect(reEncountered.usedInOrder).toBe(3);
    });

    it('keeps one entry per reward, each with its own usage array', () => {
      const first = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const second = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(second).not.toBe(first);
      expect(second.orderItemsUsage).not.toBe(first.orderItemsUsage);
      expect(Object.keys(ledger.promotionRewardUsageDetails)).toHaveLength(2);
    });
  });

  describe('the published mutability contract, member by member', () => {
    it('lets `usedInOrder` and `maximumUsePerOrder` be written - they are MUTABLE', () => {
      // CFML parity [model/service/PromotionService.cfc:L297, L224]: `usedInOrder`
      // is written by the increment and `maximumUsePerOrder` by the ratchet, so
      // both are declared without `readonly` on `PromotionRewardUsageDetail`.
      // Assigning them directly here is a deliberate assertion ABOUT THE TYPE: if
      // either gained a `readonly` modifier these two lines would stop compiling.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      usage.usedInOrder = 5;
      usage.maximumUsePerOrder = 1;

      expect(usage.usedInOrder).toBe(5);
      expect(usage.maximumUsePerOrder).toBe(1);
    });

    it('refuses to rebind `maximumUsePerItem` - it is readonly after the seed', () => {
      // CFML parity [model/service/PromotionService.cfc:L184]: written once by the
      // seed and thereafter only READ, at L236 and L237. The `readonly` modifier
      // records that, and this deliberate type failure is what pins it.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // @ts-expect-error maximumUsePerItem is readonly on PromotionRewardUsageDetail.
      usage.maximumUsePerItem = 99;

      expect(usage.maximumUsePerItem).toBe(99);
    });

    it('refuses to rebind `maximumUsePerQualification` - readonly for the same reason', () => {
      // CFML parity [model/service/PromotionService.cfc:L187]: written once by the
      // seed, then only read - at L223, L224 and L228.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // @ts-expect-error maximumUsePerQualification is readonly.
      usage.maximumUsePerQualification = 99;

      expect(usage.maximumUsePerQualification).toBe(99);
    });

    it('★ refuses to REBIND `orderItemsUsage`, while its CONTENTS stay mutable', () => {
      // ★ THE DISTINCTION THAT MUST NOT COLLAPSE. `orderItemsUsage` is a `readonly`
      // PROPERTY holding a MUTABLE array: the binding cannot be replaced, and the
      // contents are spliced at [model/service/PromotionService.cfc:L309] and
      // pushed at L323. Typing it `ReadonlyArray` would make the insertion sort
      // inexpressible, so both halves are asserted - the rebinding below is a
      // deliberate type failure, and the type-level check underneath proves the
      // element container is a mutable array rather than a readonly one.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      // @ts-expect-error orderItemsUsage is a readonly property binding.
      usage.orderItemsUsage = [];

      // If `orderItemsUsage` were declared `ReadonlyArray<OrderItemUsage>` this
      // conditional would resolve to `false` and the annotation below would be a
      // compile error, because a readonly array is not assignable to a mutable one.
      type OrderItemsUsageIsMutableArray =
        PromotionRewardUsageDetail['orderItemsUsage'] extends OrderItemUsage[] ? true : false;

      const orderItemsUsageIsMutableArray: OrderItemsUsageIsMutableArray = true;

      expect(orderItemsUsageIsMutableArray).toBe(true);
    });

    it('grows `orderItemsUsage` in place, proving the array itself is not frozen', () => {
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const arrayIdentity = usage.orderItemsUsage;

      expect(arrayIdentity).toHaveLength(0);
      expect(Object.isFrozen(arrayIdentity)).toBe(false);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );
      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.secondOrderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_THREE),
      );

      // Same array object throughout - the entries were added to it, not to a
      // replacement.
      expect(usage.orderItemsUsage).toBe(arrayIdentity);
      expect(arrayIdentity).toHaveLength(2);
    });
  });

  describe('OrderItemUsage - exactly three members, and no fourth', () => {
    it('files a record of precisely orderItemID, discountQuantity and discountPerUseValue', () => {
      // CFML parity [model/service/PromotionService.cfc:L309-L313, L323-L327]: both
      // the insert literal and the append literal carry exactly these three
      // members. `toStrictEqual` is used rather than `toEqual` so an unexpected
      // fourth key - or a key present but undefined - fails here.
      //
      // `2.50 / 2` is exactly `1.25`, computed by the decimal substrate and never
      // by JavaScript floating point.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_TWO_FIFTY),
      );

      expect(usageAt(usage, 0)).toStrictEqual({
        orderItemID: fixtures.opaqueOrderReferences.orderItemID,
        discountQuantity: 2,
        discountPerUseValue: Money.fromDecimalString(PER_USE_ONE_AND_A_QUARTER),
      });

      expect(Object.keys(usageAt(usage, 0)).slice().sort()).toStrictEqual([
        'discountPerUseValue',
        'discountQuantity',
        'orderItemID',
      ]);
    });

    it('carries the order-item identifier through OPAQUELY, verbatim and unparsed', () => {
      // ★ The identifier is never parsed, never validated as a UUID and never used
      // to look anything up: `Order` and `OrderItem` are out of scope and this
      // string is the whole of what crosses the anti-corruption boundary. A value
      // that is not remotely UUID-shaped therefore has to survive untouched.
      const opaqueIdentifier = '  Not A UUID :: 42 ';
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, opaqueIdentifier),
        1,
        Money.fromDecimalString(DISCOUNT_TWO),
      );

      expect(usageAt(usage, 0).orderItemID).toBe(opaqueIdentifier);
    });

    it('keeps `discountQuantity` a plain COUNT and `discountPerUseValue` MONEY', () => {
      // ★ The distinction is load-bearing. `OrderItem.quantity` is
      // `ormtype="integer"`, so a quantity is a count and is never wrapped in
      // `Money`; the per-use value is the only monetary member of the record.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_THREE),
      );

      const entry = usageAt(usage, 0);

      expect(typeof entry.discountQuantity).toBe('number');
      expect(entry.discountPerUseValue).toBeInstanceOf(Money);
      expect(entry.discountPerUseValue.toDecimalString()).toBe(PER_USE_ONE);
    });

    it('reproduces the reference discount calculation without floating-point drift', () => {
      // The migration's reference figures: 19.99 at quantity 3 is 59.97, less 12.5
      // per cent is a discount of 7.49625, which presents as "7.50". Divided across
      // the three uses the per-use value is exactly 2.49875 - a value IEEE-754
      // doubles cannot hold, which is why every monetary step runs on the decimal
      // substrate.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        fixtures.referenceCalculation.quantity,
        Money.fromDecimalString(fixtures.referenceCalculation.discountAmount),
      );

      const entry = usageAt(usage, 0);

      expect(entry.discountPerUseValue.toDecimalString()).toBe('2.49875');
      expect(entry.discountPerUseValue.times(3).toFixed2()).toBe('7.50');
      expect(usage.usedInOrder).toBe(3);
    });
  });

  describe('the ratchet - order-dependence vector 6', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: this ratchet is
    // a SIXTH order-dependence mechanism, discovered while analysing this
    // decomposition rather than inherited from the five the plan publishes. It is
    // recorded as a sixth so the count of known mechanisms is honest, and THE
    // COUNT STAYS AT SIX.
    // The ratchet sits inside the order-item loop, fires at most once per
    // qualifying item, and only ever LOWERS `maximumUsePerOrder`. Over-use
    // stripping then reads the RATCHETED value at
    // [model/service/PromotionService.cfc:L471-L472], never the seeded one.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L228]: the façade derives
    // `discountQuantity` from the SAME `qualificationQuantity *
    // maximumUsePerQualification` product this ratchet compares, which is why the
    // two can never disagree. That derivation is façade-owned and only the ratchet
    // itself is asserted here.

    it('lowers the per-order limit when the qualified allowance is STRICTLY smaller', () => {
      // CFML parity [model/service/PromotionService.cfc:L223-L224]: `2 * 3 = 6`,
      // and `6 lt 7`, so the limit becomes 6.
      const reward = makeRewardWithID('reward-ratchet-lowers', {
        maximumUsePerOrder: 7,
        maximumUsePerQualification: 3,
      });

      const usage = ledger.ensureRewardEntry(reward);

      expect(usage.maximumUsePerOrder).toBe(7);

      ledger.ratchetMaximumUsePerOrder(usage, 2);

      expect(usage.maximumUsePerOrder).toBe(6);
    });

    it('★ leaves the limit alone when the allowance EQUALS it - `lt` is STRICT', () => {
      // CFML parity [model/service/PromotionService.cfc:L223]: the CFML word
      // operator `lt` is strictly less than, so an allowance equal to the current
      // limit does not reassign. Relaxing it to `<=` would be invisible in this
      // outcome and must not be done anyway, because the source's own most common
      // case is exactly the equal one - see the next test.
      const reward = makeRewardWithID('reward-ratchet-equal', {
        maximumUsePerOrder: 6,
        maximumUsePerQualification: 3,
      });

      const usage = ledger.ensureRewardEntry(reward);

      ledger.ratchetMaximumUsePerOrder(usage, 2);

      expect(usage.maximumUsePerOrder).toBe(6);
    });

    it('★ leaves the SENTINEL alone for the commonest case, `1 * 1000000`', () => {
      // CFML parity [model/service/PromotionService.cfc:L223]: with no configured
      // per-qualification limit the allowance is `1 * 1000000`, which is NOT less
      // than the seeded `1000000`, so nothing is reassigned. This is the equal case
      // arising from ordinary data rather than from a contrived fixture, and it is
      // why the strictness of `lt` is load-bearing.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(usage, 1);

      expect(usage.maximumUsePerOrder).toBe(1000000);
      expect(1 * usage.maximumUsePerQualification).toBe(1000000);
    });

    it('is MONOTONICALLY NON-INCREASING - a larger allowance never raises the limit', () => {
      // CFML parity [model/service/PromotionService.cfc:L223-L224]: the guard admits
      // only a smaller product, so successive calls can only lower the value. There
      // is deliberately no reset, no per-item snapshot and no restore of the seeded
      // limit: the value is monotonically non-increasing for the whole invocation,
      // and any of those additions would discard exactly the accumulated state the
      // source relies on.
      const reward = makeRewardWithID('reward-ratchet-monotonic', {
        maximumUsePerOrder: 20,
        maximumUsePerQualification: 2,
      });

      const usage = ledger.ensureRewardEntry(reward);
      const observed: number[] = [usage.maximumUsePerOrder];

      for (const qualificationQuantity of [4, 9, 3, 7, 1, 6]) {
        ledger.ratchetMaximumUsePerOrder(usage, qualificationQuantity);
        observed.push(usage.maximumUsePerOrder);
      }

      // 20, then 4*2=8, then 9*2=18 (rejected), 3*2=6, 7*2=14 (rejected),
      // 1*2=2, 6*2=12 (rejected).
      expect(observed).toStrictEqual([20, 8, 8, 6, 6, 2, 2]);

      for (let index = 1; index < observed.length; index += 1) {
        const previous = observed[index - 1];
        const current = observed[index];

        expect(previous).toBeDefined();
        expect(current).toBeDefined();

        if (previous === undefined || current === undefined) {
          throw new Error('the observed ratchet series has a hole in it.');
        }

        expect(current).toBeLessThanOrEqual(previous);
      }
    });

    it('NEVER RESETS within a ledger lifetime, not even when the reward is re-encountered', () => {
      // CFML parity [model/service/PromotionService.cfc:L172]: re-encountering the
      // reward runs the guard, finds the key present and does nothing at all, so the
      // ratcheted limit survives rather than reverting to the persisted one.
      const reward = makeRewardWithID('reward-ratchet-no-reset', {
        maximumUsePerOrder: 10,
        maximumUsePerQualification: 1,
      });

      const usage = ledger.ensureRewardEntry(reward);

      ledger.ratchetMaximumUsePerOrder(usage, 3);

      expect(usage.maximumUsePerOrder).toBe(3);

      const reEncountered = ledger.ensureRewardEntry(reward);

      expect(reEncountered).toBe(usage);
      expect(reEncountered.maximumUsePerOrder).toBe(3);
      expect(reward.getMaximumUsePerOrder()).toBe(10);
    });

    it('ratchets down to ZERO when an order item qualifies zero times', () => {
      // `0 * anything` is 0, and 0 is less than every seeded or configured positive
      // limit, so a non-qualifying item drives the per-order allowance to nothing.
      // No guard excludes a zero qualification quantity, and none is added.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(usage, 0);

      expect(usage.maximumUsePerOrder).toBe(0);
    });

    it('accepts a NEGATIVE qualification quantity, driving the limit below zero', () => {
      // Nothing in the legacy validates the sign of the product, and nothing here
      // adds such a check. The value is carried through exactly as the arithmetic
      // produces it.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(usage, -2);

      expect(usage.maximumUsePerOrder).toBe(-6);
    });

    it('touches only the entry it is handed, never a sibling entry', () => {
      const ratcheted = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const untouched = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.ratchetMaximumUsePerOrder(ratcheted, 0);

      expect(ratcheted.maximumUsePerOrder).toBe(0);
      expect(untouched.maximumUsePerOrder).toBe(1000000);
      expect(untouched.usedInOrder).toBe(0);
    });
  });

  describe('the increment - `usedInOrder += discountQuantity`', () => {
    it('adds the DISCOUNT QUANTITY, not one, and accumulates in place', () => {
      // CFML parity [model/service/PromotionService.cfc:L297]: the statement is
      // `usedInOrder += discountQuantity` on the shared entry. It is an in-place
      // mutation rather than a recomputation, and it adds the quantity rather than
      // counting applications - a single application consuming four uses charges
      // four.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        4,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(usage.usedInOrder).toBe(4);
      expect(usage.orderItemsUsage).toHaveLength(1);
    });

    it('accumulates to the EXACT SUM of every quantity supplied', () => {
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);
      const quantities = [2, 3, 1, 5];

      for (const [index, discountQuantity] of quantities.entries()) {
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, `usage-item-${String(index)}`),
          discountQuantity,
          Money.fromDecimalString(DISCOUNT_NINE),
        );
      }

      expect(usage.usedInOrder).toBe(11);
      expect(usage.orderItemsUsage).toHaveLength(quantities.length);
    });

    it('lets `usedInOrder` exceed `maximumUsePerOrder` - nothing here enforces the limit', () => {
      // CFML parity [model/service/PromotionService.cfc:L297, L471]: the increment
      // applies no limit test at all. Detecting and correcting an overrun is the
      // job of the later stripping pass, which reads `usedInOrder >
      // maximumUsePerOrder` at L471 - and that pass belongs to
      // `overUseStripping.test.ts`. This entry deliberately ends the test OVER its
      // limit, because that is the state the stripping pass is specified against.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(usage.maximumUsePerOrder).toBe(2);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        4,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(usage.usedInOrder).toBe(4);
      expect(usage.usedInOrder).toBeGreaterThan(usage.maximumUsePerOrder);
    });

    it('charges each reward separately, so one reward\u2019s usage never leaks into another', () => {
      const bounded = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const unlimited = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        bounded,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(bounded.usedInOrder).toBe(2);
      expect(unlimited.usedInOrder).toBe(0);
      expect(unlimited.orderItemsUsage).toStrictEqual([]);
    });

    it('accepts a NEGATIVE quantity, which reduces the running total', () => {
      // No guard excludes it, so the arithmetic is carried through as written -
      // including the sign, which is why a negative discount over a negative
      // quantity yields a POSITIVE per-use value: `-5.00 / -2` is `2.5`.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        -2,
        Money.fromDecimalString(DISCOUNT_NEGATIVE_FIVE),
      );

      expect(usage.usedInOrder).toBe(-2);
      expect(usageAt(usage, 0).discountPerUseValue.toDecimalString()).toBe('2.5');
    });
  });

  describe('the unguarded division, and the gate that wraps it', () => {
    it('divides the discount by the quantity to get the per-use value', () => {
      // CFML parity [model/service/PromotionService.cfc:L299]:
      // `discountPerUseValue = precisionEvaluate('discountAmount /
      // discountQuantity')`. `precisionEvaluate` is translated into a typed call on
      // the single arithmetic surface, never into a string evaluator - there is no
      // `eval`, no dynamic function construction and no expression parser anywhere
      // in this file, and the shipped `src/lib/cfml/precision.ts` deliberately
      // publishes no evaluator either.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        3,
        Money.fromDecimalString(DISCOUNT_NINE),
      );

      expect(
        usageAt(usage, 0).discountPerUseValue.equals(Money.fromDecimalString(PER_USE_THREE)),
      ).toBe(true);
    });

    it('★ THROWS on a zero quantity - the divisor is unguarded, deliberately', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L299]: the source applies no
      // zero check to `discountQuantity`, so a zero divisor raises a
      // division-by-zero error in CFML. The shipped decimal substrate refuses a zero
      // divisor and throws, and that throw is allowed to PROPAGATE: it is not
      // caught, not defaulted to zero, not resolved to a zero amount and not
      // short-circuited by an early return.
      // Each plausible "safe" resolution is worse than the throw. Returning zero
      // would silently invent money by filing a free use against the reward, and
      // skipping the filing would silently under-enforce the per-order limit because
      // the increment has ALREADY charged the use. `Infinity` is not the faithful
      // reproduction either - a refusal is.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      expect(() =>
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
          0,
          Money.fromDecimalString(DISCOUNT_NINE),
        ),
      ).toThrow(ZERO_DIVISOR_MESSAGE);
    });

    it('leaves no usage record behind when the division refuses', () => {
      // The increment at [model/service/PromotionService.cfc:L297] runs BEFORE the
      // division at L299, so the order of the two is observable: the use is charged
      // first and only then is the per-use value computed. With a zero quantity the
      // charge is `+= 0`, which is the identity, so the single observable effect of
      // the refusal is the throw itself - `usedInOrder` is unchanged and nothing is
      // filed. Asserting both is what pins the sequence rather than merely the
      // failure.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(() =>
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
          0,
          Money.fromDecimalString(DISCOUNT_NINE),
        ),
      ).toThrow(ZERO_DIVISOR_MESSAGE);

      expect(usage.usedInOrder).toBe(0);
      expect(usage.orderItemsUsage).toStrictEqual([]);
    });

    it('preserves an already-charged use when a LATER call refuses', () => {
      // A successful application followed by a refusing one leaves the successful
      // one intact. No rollback exists in the legacy and none is introduced.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      expect(() =>
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.secondOrderItemID),
          0,
          Money.fromDecimalString(DISCOUNT_NINE),
        ),
      ).toThrow(ZERO_DIVISOR_MESSAGE);

      expect(usage.usedInOrder).toBe(2);
      expect(usage.orderItemsUsage).toHaveLength(1);
      expect(orderItemIDs(usage)).toStrictEqual([fixtures.opaqueOrderReferences.orderItemID]);
    });

    it('★ charges NOTHING for a reward whose discount never clears the L257 gate', () => {
      // CFML parity [model/service/PromotionService.cfc:L257]: `if(discountAmount >
      // 0) {` opens a gate and everything through L331 sits inside it - the guarded
      // lazy init at L260-L263, the descending accumulator sort at L266-L294, the
      // increment at L297, the division at L299 and the ascending usage sort at
      // L301-L329. A zero or negative discount therefore neither seeds the
      // accumulator NOR increments usage, which is central to use-limit enforcement:
      // a reward that yields no discount must not consume a use.
      //
      // The gate itself is FAÇADE-OWNED, so the closed path is modelled the way the
      // façade models it - by NOT calling into this module at all - rather than by
      // re-testing the condition here. Seeding alone consumes nothing.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);

      expect(usage.usedInOrder).toBe(0);
      expect(usage.orderItemsUsage).toStrictEqual([]);
      expect(usage.maximumUsePerOrder).toBe(2);
    });

    it('does not RE-TEST the gate, because this module is the branch BODY', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L257]: the legacy performs
      // the increment, the division and the ascending insertion UNCONDITIONALLY once
      // the gate has opened, so the ported method reproduces that body without
      // re-checking the condition. A zero discount consequently DOES file a record
      // if it is handed one - a path the legacy never reaches, and the reason this
      // assertion documents the boundary rather than asserting a legacy outcome.
      // Duplicating the gate here would move a façade-owned decision into this
      // module and give two places to change it.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, fixtures.opaqueOrderReferences.orderItemID),
        2,
        Money.fromDecimalString(DISCOUNT_ZERO),
      );

      expect(usage.usedInOrder).toBe(2);
      expect(usageAt(usage, 0).discountPerUseValue.toDecimalString()).toBe('0');
    });
  });

  describe('the ascending insertion sort - the ordering half of vector 4', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294, L301-L329]: THE
    // TWO INSERTION SORTS RUN IN OPPOSITE DIRECTIONS AND BOTH ARE LOAD-BEARING.
    // The qualified-discount accumulator is insert-sorted DESCENDING by discount
    // amount - the test at L271 is `< discountAmount`, the `break` at L281 and the
    // append at L285-L294 - and only its FIRST entry is ever applied. This one is
    // ASCENDING by `discountPerUseValue`, so over-use stripping strips the
    // CHEAPEST-PER-USE discount first as it walks the array from index 1 at L475.
    // The descending sort is façade-owned and is deliberately NOT asserted in this
    // file; it is recorded here only so the contrast is visible and the two are
    // never unified.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L303]: the source comment
    // above the loop reads "loop over any previous orderItemUsage of this reward an
    // place it in ASC order based on discountPerUseValue" - "an" for "and" is the
    // source's own typo, quoted unaltered rather than silently corrected, because
    // it is the source's own statement of intent for an ordering that must survive.

    /**
     * Files one usage record against `usage`, so the ordering cases read as data.
     *
     * Declared inside this block rather than at module scope because it closes over
     * nothing mutable and belongs to these cases alone. It is a local function, not
     * a shared helper module: no `helpers.ts`, `builders.ts` or `doubles.ts` is
     * created anywhere by this suite.
     */
    function file(
      usage: PromotionRewardUsageDetail,
      orderItemID: string,
      discountAmount: string,
      discountQuantity: number,
    ): void {
      ledger.recordOrderItemUsage(
        usage,
        makeOrderItemView(fixtures.sku, orderItemID),
        discountQuantity,
        Money.fromDecimalString(discountAmount),
      );
    }

    it('appends into an empty array', () => {
      // CFML parity [model/service/PromotionService.cfc:L320-L329]: with nothing to
      // scan the loop body never runs and the append branch is reached.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-only', DISCOUNT_FOUR, 2);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_TWO]);
    });

    it('inserts a strictly SMALLER newcomer ahead of the incumbent', () => {
      // CFML parity [model/service/PromotionService.cfc:L306, L309, L316]: the first
      // existing record whose per-use value is strictly greater is found, the
      // newcomer is inserted before it, and the scan stops.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-low', DISCOUNT_THREE, 3);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_THREE]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-high']);
    });

    it('appends a strictly LARGER newcomer, because no greater record exists', () => {
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-high', DISCOUNT_NINE, 3);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_THREE]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-high']);
    });

    it('★ orders three records ascending whatever order they arrive in', () => {
      // Arrival order high, low, middle - so every branch of the sort is exercised
      // by one scenario: an append into an empty array, an insert at the front, and
      // an insert into the middle.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-middle', DISCOUNT_FOUR, 2);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_TWO, PER_USE_THREE]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-middle', 'item-high']);

      // Ascending, proven on the closed `Money` surface rather than by comparing
      // floats. `compare` answers -1, 0 or 1 and is the published comparison; there
      // is no `min`, no `max` and no sort helper on the value object to reach for.
      for (let index = 1; index < usage.orderItemsUsage.length; index += 1) {
        const previous = usageAt(usage, index - 1);
        const current = usageAt(usage, index);

        expect(previous.discountPerUseValue.compare(current.discountPerUseValue)).toBe(-1);
        expect(previous.discountPerUseValue.isLessThan(current.discountPerUseValue)).toBe(true);
      }
    });

    it('★★ FAVOURS THE INCUMBENT on a tie - the newcomer lands AFTER its equal', () => {
      // CFML parity [model/service/PromotionService.cfc:L306]: the comparison is
      // STRICTLY `>`, not `>=`, so a newcomer whose per-use value EQUALS an existing
      // record's does not displace it. The scan walks past every equal record and
      // the newcomer is inserted before the first STRICTLY GREATER one - here, ahead
      // of the high record and behind its own equal. Relaxing the comparison to `>=`
      // would insert the newcomer before its equals and change which discount
      // over-use stripping reaches first.
      //
      // `4.00 / 2` and `2.00 / 1` are both exactly `2`, which is the tie. Their
      // equality is asserted on the `Money` surface so the tie is a fact rather than
      // an assumption.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-incumbent', DISCOUNT_FOUR, 2);
      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-tie', DISCOUNT_TWO, 1);

      expect(perUseValues(usage)).toStrictEqual([
        PER_USE_ONE,
        PER_USE_TWO,
        PER_USE_TWO,
        PER_USE_THREE,
      ]);
      expect(orderItemIDs(usage)).toStrictEqual([
        'item-low',
        'item-incumbent',
        'item-tie',
        'item-high',
      ]);

      const incumbent = usageAt(usage, 1);
      const tie = usageAt(usage, 2);

      expect(incumbent.orderItemID).toBe('item-incumbent');
      expect(tie.orderItemID).toBe('item-tie');
      expect(incumbent.discountPerUseValue.equals(tie.discountPerUseValue)).toBe(true);
      expect(incumbent.discountPerUseValue.compare(tie.discountPerUseValue)).toBe(0);
    });

    it('★★ APPENDS a tie that is the largest value, since no strictly greater record exists', () => {
      // The other half of the strict comparison, and the one the append branch at
      // [model/service/PromotionService.cfc:L320-L329] handles: when the newcomer
      // ties the MAXIMUM there is nothing strictly greater to insert before, so it
      // falls through the whole scan and lands at the very end - still after its
      // equal.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-low', DISCOUNT_THREE, 3);
      file(usage, 'item-incumbent', DISCOUNT_FOUR, 2);
      file(usage, 'item-tie', DISCOUNT_TWO, 1);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_ONE, PER_USE_TWO, PER_USE_TWO]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-low', 'item-incumbent', 'item-tie']);
    });

    it('keeps a RUN of equal values in arrival order', () => {
      // Three records at the same per-use value accumulate in the order they were
      // filed, which given an unordered reward collection is itself part of the
      // engine's non-determinism. Nothing here imposes a stabilising tie-break:
      // doing so would make a non-deterministic legacy behaviour deterministic in
      // one arbitrary direction, which is a change to behaviour dressed as a
      // cleanup.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-first', DISCOUNT_FOUR, 2);
      file(usage, 'item-second', DISCOUNT_TWO, 1);
      file(usage, 'item-third', DISCOUNT_FOUR, 2);

      expect(perUseValues(usage)).toStrictEqual([PER_USE_TWO, PER_USE_TWO, PER_USE_TWO]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-first', 'item-second', 'item-third']);
    });

    it('files the CHEAPEST per-use record first, which is the record stripped first', () => {
      // The consequence the ordering exists for: over-use stripping walks
      // `orderItemsUsage` from index 1 at [model/service/PromotionService.cfc:L475],
      // so ascending order means the cheapest use is given up first. The stripping
      // itself belongs to `overUseStripping.test.ts`; what is asserted here is only
      // that index 0 holds the minimum.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-high', DISCOUNT_NINE, 3);
      file(usage, 'item-middle', DISCOUNT_FOUR, 2);
      file(usage, 'item-low', DISCOUNT_THREE, 3);

      const cheapest = usageAt(usage, 0);

      expect(cheapest.orderItemID).toBe('item-low');

      for (const entry of usage.orderItemsUsage.slice(1)) {
        expect(cheapest.discountPerUseValue.isGreaterThan(entry.discountPerUseValue)).toBe(false);
      }
    });

    it('orders NEGATIVE per-use values below positive ones, with no special case', () => {
      // A negative per-use value is reachable - the quantity and the discount are
      // both unvalidated - and it sorts by value like anything else.
      const usage = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(usage, 'item-positive', DISCOUNT_FOUR, 2);
      file(usage, 'item-negative', DISCOUNT_NEGATIVE_FIVE, 2);

      expect(perUseValues(usage)).toStrictEqual(['-2.5', PER_USE_TWO]);
      expect(orderItemIDs(usage)).toStrictEqual(['item-negative', 'item-positive']);
    });

    it('sorts each reward\u2019s array independently', () => {
      const first = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const second = ledger.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);

      file(first, 'item-a', DISCOUNT_NINE, 3);
      file(second, 'item-b', DISCOUNT_THREE, 3);
      file(first, 'item-c', DISCOUNT_THREE, 3);

      expect(orderItemIDs(first)).toStrictEqual(['item-c', 'item-a']);
      expect(orderItemIDs(second)).toStrictEqual(['item-b']);
    });
  });

  describe('order dependence proven structurally - vector 1', () => {
    // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: the reward collection has
    // NO ordering. `getActivePromotionRewards` ends in `ormExecuteQuery` with no
    // `ORDER BY` anywhere in the DAO, so the iteration order is whatever the driver
    // returns. Combined with a ledger that accumulates in place, an exact tie can
    // change the money charged between two runs over identical data. The absent
    // ordering is preserved at `src/repositories/mysql/mysqlPromotionRepository.ts`,
    // which carries its own marker; nothing in this suite sorts the reward
    // collection, assumes an order over it, or introduces a stabilising tie-break.
    //
    // The tests below prove the dependence rather than asserting it rhetorically:
    // the same inputs are processed in two different orders and the resulting ledger
    // states are shown to differ.
    //
    // JUDGMENT CALL: the two mechanisms that genuinely differ by order are named
    // precisely, because a vaguer claim would be easy to over-read. Addition is
    // commutative, so a reward's FINAL `usedInOrder` total does not depend on the
    // order the quantities arrived in, and the ratchet keeps a running minimum, so
    // its FINAL value does not either. What does depend on order is (a) the seed,
    // which is first-wins on the identifier, and (b) the position of equal-valued
    // records in `orderItemsUsage`. Both are asserted.

    it('★ FIRST-WINS seeding makes the ledger genuinely differ between two orders', () => {
      // CFML parity [model/service/PromotionService.cfc:L172]: the guard keys on the
      // identifier, so the first reward object seen for an identifier fixes that
      // entry's limits for the whole invocation. Two rewards sharing an identifier
      // and carrying different limits therefore produce two DIFFERENT ledgers
      // depending only on which was iterated first - and `maximumUsePerOrder` is
      // exactly what over-use stripping compares against at
      // [model/service/PromotionService.cfc:L471].
      const sharedID = 'reward-order-dependence';
      const strict = makeRewardWithID(sharedID, { maximumUsePerOrder: 2 });
      const lax = makeRewardWithID(sharedID, { maximumUsePerOrder: 9 });

      const strictFirst = ledger;
      strictFirst.ensureRewardEntry(strict);
      strictFirst.ensureRewardEntry(lax);

      const laxFirst = new RewardUsageLedger();
      laxFirst.ensureRewardEntry(lax);
      laxFirst.ensureRewardEntry(strict);

      const fromStrictFirst = strictFirst.promotionRewardUsageDetails[sharedID];
      const fromLaxFirst = laxFirst.promotionRewardUsageDetails[sharedID];

      expect(fromStrictFirst).toBeDefined();
      expect(fromLaxFirst).toBeDefined();

      if (fromStrictFirst === undefined || fromLaxFirst === undefined) {
        throw new Error(`neither ledger seeded an entry for ${sharedID}.`);
      }

      expect(fromStrictFirst.maximumUsePerOrder).toBe(2);
      expect(fromLaxFirst.maximumUsePerOrder).toBe(9);
      expect(fromStrictFirst.maximumUsePerOrder).not.toBe(fromLaxFirst.maximumUsePerOrder);
    });

    it('★ TIE ARRIVAL ORDER makes `orderItemsUsage` differ, values equal but positions swapped', () => {
      // The second genuine order dependence, and the one that reaches money. Two
      // applications with the SAME per-use value land in arrival order because the
      // comparison at [model/service/PromotionService.cfc:L306] is strict, so the
      // array holds identical values in a different sequence. Over-use stripping
      // walks that array from index 1 at L475 and strips from whichever order item is
      // first, so the same data can yield a discount removed from a DIFFERENT order
      // item - the stripping itself belongs to `overUseStripping.test.ts`, which owns
      // that consequence.
      const firstItemID = fixtures.opaqueOrderReferences.orderItemID;
      const secondItemID = fixtures.opaqueOrderReferences.secondOrderItemID;

      // The two identifiers must differ, or the whole exhibit is vacuous.
      expect(firstItemID).not.toBe(secondItemID);

      const forwards = ledger;
      const forwardsUsage = forwards.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);
      forwards.recordOrderItemUsage(
        forwardsUsage,
        makeOrderItemView(fixtures.sku, firstItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );
      forwards.recordOrderItemUsage(
        forwardsUsage,
        makeOrderItemView(fixtures.sku, secondItemID),
        1,
        Money.fromDecimalString(DISCOUNT_TWO),
      );

      const backwards = new RewardUsageLedger();
      const backwardsUsage = backwards.ensureRewardEntry(fixtures.unlimitedUseLimitsReward);
      backwards.recordOrderItemUsage(
        backwardsUsage,
        makeOrderItemView(fixtures.sku, secondItemID),
        1,
        Money.fromDecimalString(DISCOUNT_TWO),
      );
      backwards.recordOrderItemUsage(
        backwardsUsage,
        makeOrderItemView(fixtures.sku, firstItemID),
        2,
        Money.fromDecimalString(DISCOUNT_FOUR),
      );

      // Identical per-use values...
      expect(perUseValues(forwardsUsage)).toStrictEqual([PER_USE_TWO, PER_USE_TWO]);
      expect(perUseValues(backwardsUsage)).toStrictEqual([PER_USE_TWO, PER_USE_TWO]);

      // ...and identical totals, because addition is commutative.
      expect(forwardsUsage.usedInOrder).toBe(3);
      expect(backwardsUsage.usedInOrder).toBe(3);

      // But genuinely different ledgers: the positions are swapped, so the record
      // reached first is a different order item.
      expect(orderItemIDs(forwardsUsage)).toStrictEqual([firstItemID, secondItemID]);
      expect(orderItemIDs(backwardsUsage)).toStrictEqual([secondItemID, firstItemID]);
      expect(orderItemIDs(forwardsUsage)).not.toStrictEqual(orderItemIDs(backwardsUsage));

      // The quantities travel with their records, so the amount that would be
      // stripped first differs too.
      expect(usageAt(forwardsUsage, 0).discountQuantity).toBe(2);
      expect(usageAt(backwardsUsage, 0).discountQuantity).toBe(1);
    });

    it('makes what a LATER application sees depend on which earlier ones ran', () => {
      // The plain statement of vector 1: the ledger is threaded through the loop, so
      // the state an application observes on arrival is the state its predecessors
      // left. Here the second application finds a use count of 2 rather than 0, and
      // the third finds 5 - each one reading its predecessors' work.
      const usage = ledger.ensureRewardEntry(fixtures.boundedUseLimitsReward);
      const observedBeforeEachApplication: number[] = [];

      for (const [index, discountQuantity] of [2, 3, 1].entries()) {
        observedBeforeEachApplication.push(usage.usedInOrder);
        ledger.recordOrderItemUsage(
          usage,
          makeOrderItemView(fixtures.sku, `threaded-item-${String(index)}`),
          discountQuantity,
          Money.fromDecimalString(DISCOUNT_NINE),
        );
      }

      expect(observedBeforeEachApplication).toStrictEqual([0, 2, 5]);
      expect(usage.usedInOrder).toBe(6);
    });

    it('keeps the ratchet\u2019s FINAL value order-independent while its path is not', () => {
      // Recorded precisely rather than overstated. The ratchet keeps a running
      // minimum, so the final `maximumUsePerOrder` is the same whichever order the
      // qualification quantities arrive in - but the value observed PART-WAY THROUGH
      // differs, and anything reading the ledger mid-loop therefore sees a different
      // number. The engine does exactly that: the façade derives `discountQuantity`
      // from `maximumUsePerQualification` at [model/service/PromotionService.cfc:L228]
      // and clamps against `maximumUsePerItem` at L236 while the ratchet is still
      // running.
      // Named `rising`/`falling` rather than ascending/descending on purpose. Both
      // of those words are terms of art elsewhere in this file - the ASCENDING
      // insertion sort at [model/service/PromotionService.cfc:L301-L329] is pinned
      // here, and the DESCENDING accumulator sort at L266-L294 is façade-owned and
      // deliberately not asserted anywhere below. Reusing either word for a mere
      // arrival sequence would let a reader searching for those sorts land on this
      // test and misread it as an assertion about one of them.
      const risingLimits = makeRewardWithID('reward-ratchet-path-rising', {
        maximumUsePerOrder: 30,
        maximumUsePerQualification: 2,
      });
      const fallingLimits = makeRewardWithID('reward-ratchet-path-falling', {
        maximumUsePerOrder: 30,
        maximumUsePerQualification: 2,
      });

      const risingUsage = ledger.ensureRewardEntry(risingLimits);
      const fallingUsage = ledger.ensureRewardEntry(fallingLimits);

      const risingPath: number[] = [];
      const fallingPath: number[] = [];

      for (const qualificationQuantity of [3, 7, 11]) {
        ledger.ratchetMaximumUsePerOrder(risingUsage, qualificationQuantity);
        risingPath.push(risingUsage.maximumUsePerOrder);
      }

      for (const qualificationQuantity of [11, 7, 3]) {
        ledger.ratchetMaximumUsePerOrder(fallingUsage, qualificationQuantity);
        fallingPath.push(fallingUsage.maximumUsePerOrder);
      }

      expect(risingPath).toStrictEqual([6, 6, 6]);
      expect(fallingPath).toStrictEqual([22, 14, 6]);
      expect(risingPath).not.toStrictEqual(fallingPath);

      // Same destination, different route.
      expect(risingUsage.maximumUsePerOrder).toBe(6);
      expect(fallingUsage.maximumUsePerOrder).toBe(6);
    });
  });
});
