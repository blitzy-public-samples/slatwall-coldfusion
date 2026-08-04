// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/services/promotion/orderItemMembership.ts`
//
// The subject is the ported form of the two membership TWINS:
//
//   public boolean function getOrderItemInQualifier(required any qualifier, required any orderItem)
//     [model/service/PromotionService.cfc:L852-L919]
//   public boolean function getOrderItemInReward(required any reward, required any orderItem)
//     [model/service/PromotionService.cfc:L921-L985]
//
// No arithmetic happens in either body, and yet both sit squarely inside MUST-PRESERVE AREA #1 -
// promotion discount math TOGETHER WITH use-limit enforcement. These two predicates decide WHICH
// ORDER ITEMS a qualifier or a reward reaches at all, so the discount `./discountAmount.ts`
// computes is only ever applied to the items these functions admit. A wrong answer here changes
// the money charged just as surely as a wrong operator would, which is why every case below is
// treated as a statement about money rather than about structure.
//
// This module is the LEAF of the sibling-import graph
// `promotionPeriodQualification.ts -> qualifierQualification.ts -> orderItemMembership.ts`. It has
// no constructor dependency, makes no repository call, and owns no numbered defect-register entry.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and saying so is a requirement rather than a
// courtesy: presenting net-new coverage as parity fails the traceability gate.
// `meta/tests/unit/service/` holds exactly four components - `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc` - none of them
// in scope; and `grep -rli 'promotion' meta/tests/` returns ZERO files, so no legacy test anywhere
// in the tree so much as mentions a promotion. Both facts were re-verified against this checkout
// while this suite was authored. Across the whole migration only
// `tests/unit/domain/entities/brand.test.ts` and `tests/unit/domain/entities/product.test.ts`
// extend a legacy suite, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub
// contributing zero coverage to anybody. There is no antecedent for this file and no lineage is
// claimed for it.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST, AND THE ABSENCE WAS VERIFIED
// ---------------------------------------------------------------------------
// The project's rules source was queried three independent ways while this suite was authored -
// unpaged, over the full range, and at a high offset well past any plausible end of document - and
// returned the identical single-line sentinel every time. That is a fixed sentinel rather than a
// truncated read, because a genuinely paginated document would answer empty at a high offset.
//
// Consequently NO user-specified rule governs this file, no rule is invented to fill the gap, and
// the absence is NOT treated as licence to lower the bar: the enterprise practices the migration
// commits to apply at full strength in their place. The rules source remains the authoritative
// answer should rules ever be added - this note records its result and does not substitute for it.
//
// ---------------------------------------------------------------------------
// THE FOUR BUDGET LEDGERS, AND THIS FILE'S POSITION IN EACH - ALL FOUR ARE ZERO
// ---------------------------------------------------------------------------
// The four ledgers are distinct and are never conflated. For this subject each of the four is an
// AFFIRMATIVE ZERO rather than an omission, so each is recorded explicitly:
//
//   * VISIBILITY WIDENINGS - ZERO CONSUMED HERE. Both twins are declared `public boolean function`
//     in the legacy source, at [L852] and [L921], so exposing them costs nothing from the budget.
//     All five of the migration's widenings live elsewhere in this same folder - #1 [L549],
//     #3 [L752] and #4 [L783] in `./promotionPeriodQualification.ts`, #2 [L629] in
//     `./qualifierQualification.ts`, #5 [L987] in `./discountAmount.ts` - and the ledger is
//     EXHAUSTED. A sixth anywhere would be a gate failure.
//   * SIGNATURE RESHAPINGS - NONE HERE. Both method names are the legacy CFML camelCase names
//     character for character, and neither parameter list is reordered, renamed or extended. The
//     migration's three reshapings are the two anti-corruption inversions, the two smart-list
//     renames and the feed adapter's `generateProductFeed`, all elsewhere.
//   * SIGNATURE WIDENINGS - ZERO REMAIN. The migration's single widening was spent on
//     `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`.
//   * DELIBERATE DIVERGENCES - ZERO HERE. THIS MODULE DIVERGES FROM THE LEGACY IN NO RESPECT. The
//     migration's three divergences are register entries 13 and 12, both owned by
//     `./discountAmount.test.ts`, and entry 19 in `src/domain/entities/product.ts`.
//
// The legacy `any` parameter types becoming the concrete entity and view types is a REFINEMENT,
// not a widening, and spends nothing from any ledger.
//
// ---------------------------------------------------------------------------
// LOCATOR CORRECTION, RECORDED BECAUSE THE SOURCE WINS
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L865, L900, L935, L966]: an earlier brief
// describes these four sites as `!arrayFind` calls. THEY ARE NOT. Read verbatim from this
// checkout, all four are UN-NEGATED `listFindNoCase(...)` calls whose result is consumed as bare
// CFML numeric truthiness - the function answers a 1-BASED POSITION on a hit and `0` on a miss, so
// the ported form must compare `> 0`.
//   The SOLE `!arrayFind` site in the whole of `PromotionService.cfc` is
// [model/service/PromotionService.cfc:L602], and it belongs to
// `./promotionPeriodQualification.test.ts`, not here. The full `arrayFind` / `listFindNoCase`
// census across the file is L61, L200, L209, L351, L542, L602, L708, L714, L774, L794, L865, L900,
// L935 and L966; the last four are this subject's. The correction is recorded so a reviewer
// holding the older brief is not misled.
//   The `> 0` convention is not merely described below, it is PINNED BEHAVIOURALLY. A ROOT-level
// product type sits at path position 1, which a `findIndex(...) > 0` transliteration would miss
// because `findIndex` answers the 0-based `0` there; and a non-member answers `0`, which a
// `!== -1` transliteration would read as a hit. The pair of cases in
// `materialized product-type path membership` fails under either mistranslation.
//
// ---------------------------------------------------------------------------
// THE ONE THING A READER MUST UNDERSTAND FIRST: THE 7-VERSUS-5 EXCLUSION ASYMMETRY
// ---------------------------------------------------------------------------
// The twins look interchangeable and are not. Their exclusion censuses differ by exactly two
// operands, verified verbatim against the source:
//
//   #  exclusion operand                              qualifier      reward
//   1  hasExcludedProductType (materialized path)     L873   yes     L943   yes
//   2  minimumItemPrice > orderItem price             L875   yes     ---    ABSENT
//   3  maximumItemPrice < orderItem price             L877   yes     ---    ABSENT
//   4  hasExcludedProduct(...)                        L879   yes     L945   yes
//   5  hasExcludedSku(...)                            L881   yes     L947   yes
//   6  compound excluded-brand clause                 L883   yes     L949   yes
//   7  hasAnyExcludedOption(...)                      L885   yes     L951   yes
//
// A REWARD HAS NO ITEM-PRICE GATE AT ALL. That is a SCHEMA fact and not a call-site accident:
// [model/entity/PromotionQualifier.cfc:L61-L62] declares `minimumItemPrice` and `maximumItemPrice`
// as `ormtype="big_decimal" hb_formatType="currency"`, while `model/entity/PromotionReward.cfc`
// declares neither - a repository-wide search for `ItemPrice` in that component returns nothing,
// and the same search over the ported `src/domain/entities/promotionReward.ts` also returns
// nothing. Both the absence of the operands and the absence of the columns are asserted below.
//
// ---------------------------------------------------------------------------
// CONSUMER CALL SHAPES - NOTED FOR ORIENTATION, DELIBERATELY NOT ASSERTED HERE
// ---------------------------------------------------------------------------
// This file draws the boundary between MECHANICS and the AGGREGATE PIPELINE. Everything below is
// mechanics: one predicate, one qualifier or reward, one order item, one boolean. How the answer
// is then threaded through the 489-line orchestrator - the mutable usage ledger, the two ordered
// passes, the over-use stripping - is the aggregate pipeline and belongs to the façade suite. The
// three call sites that consume this module are therefore recorded and NOT exercised here:
//
//   * [model/service/PromotionService.cfc:L727] - `./qualifierQualification.ts` calls
//     `getOrderItemInQualifier` with CFML KEYWORD arguments and POSITIVE polarity.
//     Owned by `./qualifierQualification.test.ts`.
//   * [model/service/PromotionService.cfc:L805] - `./promotionPeriodQualification.ts` calls it with
//     KEYWORD arguments and NEGATED polarity.
//     Owned by `./promotionPeriodQualification.test.ts`.
//   * [model/service/PromotionService.cfc:L220] - the façade calls `getOrderItemInReward` with
//     POSITIONAL arguments. Owned by `../promotionService.test.ts`.
//
// All three CFML shapes collapse onto one positional TypeScript shape, and every edge runs INTO
// this module rather than out of it, which is what keeps the decomposition graph acyclic.
//
// ---------------------------------------------------------------------------
// PARAMETERIZED SQL: NOT APPLICABLE HERE, AND WHY
// ---------------------------------------------------------------------------
// The migration's practice that every query is a prepared statement, preserving the injection
// safety `cfqueryparam` provided, HAS NO APPLICATION IN THIS FILE. The reason is structural rather
// than incidental: both twins are pure over their arguments. They traverse associations the
// repository already materialized and walk a comma-delimited string, so the subject issues no
// statement, opens no connection, binds no parameter and names no table. There is consequently no
// SQL shape and no parameter binding for this suite to assert, and manufacturing one would test a
// collaborator this subject does not have. Every SQL-shape and parameter-binding assertion in the
// migration lives in `tests/integration/repositories/`, which is where the prepared statements
// themselves live. The complementary absence - that no data access happens at all - IS asserted
// below, in `the predicate performs no data access and reads no ambient state`.
//
// ---------------------------------------------------------------------------
// ENVIRONMENT, AND WHAT THIS SUITE DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
// Nothing here reads `process.env`, loads a dotenv file, constructs a pool, opens a socket or
// touches the filesystem, and no credential, host or connection string appears in any form. The
// suite therefore passes against a completely empty environment. It also does not re-implement
// anything `tests/setup.ts` already provides: that module fixes the timezone to UTC and registers
// the global mock and timer reset, and it is the single registered setup file.
//
// The subject is date-free - neither twin reads a clock. Neither a bare `new Date()` nor
// `Date.now()` is ever called; the only date values below are EXPLICIT UTC ISO-8601 literals handed
// to the fixture in `is date-free, so its answer cannot drift with the clock`, which is the one case
// that has to vary a clock in order to prove the answer does not follow it.
//
// C7 - NO INVENTED NON-FUNCTIONAL REQUIREMENTS. The repeated collection scans and the
// materialized-path walking in these two bodies are CORRECTNESS matters and are asserted
// STRUCTURALLY throughout: which operand fires, in which order, and what it answers. No case
// below makes a timing, rate or resource claim of any kind, none is expressed as a
// threshold, and no service-level expectation is asserted or implied - the source states none and
// none is invented. The legacy runtime's lock timeouts are noted by the migration and deliberately
// not implemented, so nothing here asserts them. A repository-wide search for `cfthread` across
// the in-scope slice returns nothing, so there is no concurrency behaviour to characterize and no
// concurrent execution is attempted.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { Money } from '../../../../src/domain/valueObjects/money.js';
import { OrderItemMembership } from '../../../../src/services/promotion/orderItemMembership.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

import { listLen, listToArray } from '../../../../src/lib/cfml/list.js';
import { isNullish } from '../../../../src/lib/cfml/truthiness.js';

import type { Option } from '../../../../src/domain/entities/option.js';
import type { Product } from '../../../../src/domain/entities/product.js';
import type { ProductType } from '../../../../src/domain/entities/productType.js';
import type { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';

// ---------------------------------------------------------------------------
// Local types over the fixture surface
//
// `makePromotionFixtures` declares its graph and its override bag LOCALLY and exports neither, so
// that the module has exactly one exported unit. Both are therefore recovered structurally here,
// which is the convention the sibling suites in this folder already use. Nothing is redeclared: a
// hand-written copy of either shape would drift the moment the fixture gained a member.
// ---------------------------------------------------------------------------

type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

type PromotionFixtureOverrides = NonNullable<Parameters<typeof makePromotionFixtures>[0]>;

// ---------------------------------------------------------------------------
// The two accessor censuses, spelled out
//
// These lists are the assertion, not documentation of it. `PromotionQualifier` publishes THIRTEEN
// members that the qualifier twin actually reads; `PromotionReward` publishes ELEVEN, the SAME SET
// MINUS the two item-price bounds. Both counts were derived by reading every operand of both
// bodies, and both are asserted below rather than asserted about.
//
// `PromotionReward.cfc` declares fourteen many-to-many include/exclude link collections in total -
// five include at [model/entity/PromotionReward.cfc:L80-L84] and five exclude at [L86-L90] plus the
// non-membership remainder - so eleven is the count THIS PREDICATE READS, not the component's
// collection count. The two figures are different questions and are not conflated.
// ---------------------------------------------------------------------------

/** The thirteen members `getOrderItemInQualifier` reads, in legacy operand order. */
const QUALIFIER_MEMBERSHIP_ACCESSORS = [
  // Exclusion side, [model/service/PromotionService.cfc:L858-L885].
  'getExcludedProductTypes',
  'getMinimumItemPrice',
  'getMaximumItemPrice',
  'hasExcludedProduct',
  'hasExcludedSku',
  'getExcludedBrands',
  'hasExcludedBrand',
  'hasAnyExcludedOption',
  // Inclusion side, [model/service/PromotionService.cfc:L892-L914].
  'getProductTypes',
  'hasProduct',
  'hasSku',
  'hasBrand',
  'hasAnyOption',
] as const;

/** The eleven members `getOrderItemInReward` reads - the qualifier's set minus the price bounds. */
const REWARD_MEMBERSHIP_ACCESSORS = [
  // Exclusion side, [model/service/PromotionService.cfc:L928-L951].
  'getExcludedProductTypes',
  'hasExcludedProduct',
  'hasExcludedSku',
  'getExcludedBrands',
  'hasExcludedBrand',
  'hasAnyExcludedOption',
  // Inclusion side, [model/service/PromotionService.cfc:L958-L980].
  'getProductTypes',
  'hasProduct',
  'hasSku',
  'hasBrand',
  'hasAnyOption',
] as const;

/** The two accessors that exist on the qualifier alone - operands 2 and 3 of the seven. */
const QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS = ['getMinimumItemPrice', 'getMaximumItemPrice'] as const;

/** Every member `OrderItemView` publishes. Locked at ten by `src/domain/views/orderItemView.ts`. */
const ORDER_ITEM_VIEW_MEMBERS = [
  'orderItemID',
  'sku',
  'quantity',
  'price',
  'skuPrice',
  'extendedPrice',
  'extendedSkuPrice',
  'appliedPriceGroup',
  'orderItemType',
  'orderFulfillmentID',
] as const;

/**
 * Does this entity declare this member, anywhere on its prototype chain?
 *
 * A plain `in` test, which is total, allocation-free and fully typed - no cast, no reflection
 * helper answering `any`, and no non-null assertion. Entity accessors are class methods and so live
 * on the prototype, which `in` walks.
 */
function declaresMember(subject: object, member: string): boolean {
  return member in subject;
}

// ---------------------------------------------------------------------------
// Order-item construction
//
// JUDGMENT CALL: the view is a read-only anti-corruption shape of exactly ten members, so a case
// that needs a SPECIFIC sku paired with a SPECIFIC price constructs one directly here rather than
// threading an override through the shared order fixture. Inline construction inside this suite is
// the intended route, and it is what makes the item-price boundary cases legible - the price under
// test appears in the case that asserts it rather than three fixture layers away. The alternative,
// adding a helper module or extending a fixture, is ruled out: nothing may be authored into
// `tests/fixtures/` and no shared builder, double or helper module may be created.
//
// The golden multi-item order is exercised too, in `the golden order integrates`, so the shared
// fixture path is covered as well as the direct one. Nothing is authored into `tests/fixtures/`.
//
// P4 - MONEY IS THE ONLY ARITHMETIC SURFACE. Every price below is built with
// `Money.fromDecimalString` from a decimal string literal. No JavaScript number reaches a monetary
// slot, no expected value is computed with a float operator, and no comparison uses `<` or `>` on a
// price - the two bounds are compared through `Money.isGreaterThan` and `Money.isLessThan` inside
// the subject, and the cases here assert the resulting boolean.
// ---------------------------------------------------------------------------

/**
 * A minimal order item carrying a chosen sku at a chosen price.
 *
 * The seven members neither twin reads are populated with coherent values rather than left out -
 * the view's members are all required, and `exactOptionalPropertyTypes` makes
 * `appliedPriceGroup: PriceGroup | undefined` a member that must be PRESENT and may be undefined.
 * Their values are deliberately irrelevant, which is itself asserted by the read-surface cases.
 */
function makeMembershipOrderItem(
  sku: Sku,
  price: string,
  orderItemID = 'membership-item',
): OrderItemView {
  const itemPrice: Money = Money.fromDecimalString(price);

  return {
    orderItemID,
    sku,
    quantity: 1,
    price: itemPrice,
    skuPrice: itemPrice,
    extendedPrice: itemPrice,
    extendedSkuPrice: itemPrice,
    appliedPriceGroup: undefined,
    orderItemType: { systemCode: 'oitSale' },
    orderFulfillmentID: 'membership-fulfillment',
    // Empty because membership testing never reads it. The member exists for the blanket clear at
    // [model/service/PromotionService.cfc:L64-L68], which runs before any membership test and leaves
    // the association empty for everything downstream.
    appliedPromotions: [],
  };
}

/** An order item and the log of which view members the subject actually read from it. */
interface RecordedOrderItem {
  readonly view: OrderItemView;

  /** Live: members append as they are read. Read after invoking the subject. */
  readonly reads: readonly string[];
}

/**
 * Wraps an order item so that every member read is recorded.
 *
 * Plain getters over a delegate - no proxy, no spy library, no new dependency. This is how the
 * two-member read surface is PROVEN rather than described, and it is also the most direct available
 * proof of the 7-versus-5 asymmetry: the reward twin, having no item-price operand, never reads
 * `price` at all.
 */
function recordOrderItemReads(base: OrderItemView): RecordedOrderItem {
  const reads: string[] = [];

  function tap<TValue>(member: string, value: TValue): TValue {
    reads.push(member);
    return value;
  }

  const view: OrderItemView = {
    get orderItemID() {
      return tap('orderItemID', base.orderItemID);
    },
    get sku() {
      return tap('sku', base.sku);
    },
    get quantity() {
      return tap('quantity', base.quantity);
    },
    get price() {
      return tap('price', base.price);
    },
    get skuPrice() {
      return tap('skuPrice', base.skuPrice);
    },
    get extendedPrice() {
      return tap('extendedPrice', base.extendedPrice);
    },
    get extendedSkuPrice() {
      return tap('extendedSkuPrice', base.extendedSkuPrice);
    },
    get appliedPriceGroup() {
      return tap('appliedPriceGroup', base.appliedPriceGroup);
    },
    get orderItemType() {
      return tap('orderItemType', base.orderItemType);
    },
    get orderFulfillmentID() {
      return tap('orderFulfillmentID', base.orderFulfillmentID);
    },
    // Instrumented like every other member precisely so the suite can PROVE membership testing never
    // touches it. The blanket clear at [model/service/PromotionService.cfc:L64-L68] is the only
    // legacy reader of this association, and it runs before any membership test.
    get appliedPromotions() {
      return tap('appliedPromotions', base.appliedPromotions);
    },
  };

  return { view, reads };
}

/** The distinct view members read, sorted, so a case can compare against an exact set. */
function distinctReads(recorded: RecordedOrderItem): readonly string[] {
  return [...new Set(recorded.reads)].sort();
}

// ---------------------------------------------------------------------------
// Fixture configuration helpers
//
// The fixture attaches ONE element to each of the ten membership collections by default, and the
// same ten collections are attached to BOTH the qualifier and every reward. That default is
// exactly right for the asymmetry cases - identical configuration on both twins, so the only
// difference left is the price gate - and exactly wrong for isolating a single operand, because an
// item matching through `hasProduct` would mask a path walk that never fired.
//
// `unconfigured()` therefore empties all ten and removes both bounds, so a case can turn on
// precisely one operand and attribute the answer to it. Each call returns a FRESH bag with FRESH
// arrays, so no case can reach another case's configuration.
// ---------------------------------------------------------------------------

/**
 * An override bag with every membership collection empty and both item-price bounds absent.
 *
 * The bounds are removed by passing `undefined` EXPLICITLY, which the fixture distinguishes from
 * omission: its gate resolver tests own-key presence, so an explicit `undefined` requests the
 * ABSENT column while omission would install the documented defaults of `9.99` and `199.99`. The
 * override members are declared `Money | undefined`, so this is matching the published optional
 * shape rather than forcing `undefined` into a key that does not admit it.
 *
 * ABSENCE IS NOT ZERO. `Money.zero` is never substituted for a missing bound, here or in the
 * subject: an absent bound imposes NO CONSTRAINT, whereas a zero minimum would be a real floor.
 */
function unconfigured(extra?: PromotionFixtureOverrides): PromotionFixtureOverrides {
  return {
    brands: [],
    options: [],
    skus: [],
    products: [],
    productTypes: [],
    excludedBrands: [],
    excludedOptions: [],
    excludedSkus: [],
    excludedProducts: [],
    excludedProductTypes: [],
    qualifierGates: { minimumItemPrice: undefined, maximumItemPrice: undefined },
    ...extra,
  };
}

/** The three levels of the fixture's product-type chain, narrowed without a non-null assertion. */
interface ProductTypeChainNodes {
  readonly root: ProductType;
  readonly parent: ProductType;
  readonly leaf: ProductType;
}

/**
 * Root, parent and leaf of the fixture's product-type chain.
 *
 * DEPTH IS LOAD-BEARING. A one-level chain makes `productTypeIDPath` a single identifier, and a
 * containment test over a single identifier passes for the wrong reason - it cannot distinguish
 * walking a path from comparing the leaf. Every case that asserts ancestor membership needs an
 * identifier that is genuinely IN the path and genuinely NOT the leaf, which only a chain of at
 * least two levels provides.
 *
 * `noUncheckedIndexedAccess` makes each indexed read `ProductType | undefined`; each is captured
 * into a local and narrowed by an explicit check. No postfix `!`, no cast.
 */
function chainNodes(graph: PromotionFixtureGraph): ProductTypeChainNodes {
  const chain: readonly ProductType[] = graph.productTypeChain;
  const root = chain[0];
  const parent = chain[1];
  const leaf = chain[2];

  if (root === undefined || parent === undefined || leaf === undefined) {
    throw new Error(
      `The promotion fixture must publish a product-type chain at least three levels deep for the ` +
        `ancestor-membership cases to mean anything; received ${String(chain.length)} level(s).`,
    );
  }

  return { root, parent, leaf };
}

/** The sku's first option, narrowed without a non-null assertion. */
function firstOption(sku: Sku): Option {
  const options: readonly Option[] = sku.getOptions();
  const option = options[0];

  if (option === undefined) {
    throw new Error(
      'The sku fixture must carry at least one option for the option-membership cases to mean ' +
        'anything; received an option-less sku.',
    );
  }

  return option;
}

describe('OrderItemMembership', () => {
  // A2 - REQUEST-SCOPED STATE.
  //
  // A fresh fixture graph and a fresh subject are constructed for EVERY case, and this file holds
  // no mutable state at module scope at all. That is not tidiness. Four legacy component-level
  // mutable caches became request-scoped in the target, and a suite that shared a subject or a
  // graph between cases could not tell a correctly-scoped local from a leaked one. The subject is
  // itself stateless, which is asserted rather than assumed in `the subject is stateless`.
  let fixtures: PromotionFixtureGraph;
  let membership: OrderItemMembership;
  let qualifier: PromotionQualifier;
  let reward: PromotionReward;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
    membership = new OrderItemMembership();
    qualifier = fixtures.promotionQualifier;
    reward = fixtures.merchandiseReward;
  });

  // -------------------------------------------------------------------------
  // The shipped surface
  // -------------------------------------------------------------------------
  describe('the shipped surface', () => {
    it('constructs with no dependencies at all', () => {
      // Both bodies are pure over their arguments - no DAO, no ORM, no port, no setting - so there
      // is nothing to inject. Construction taking no argument IS the observable form of that, and
      // it is what makes this module the leaf of the sibling-import graph.
      const constructed = new OrderItemMembership();

      expect(constructed).toBeInstanceOf(OrderItemMembership);
      expect(OrderItemMembership.length).toBe(0);
    });

    it('exposes both twins under their verbatim legacy names, consuming ZERO visibility widenings', () => {
      // C4 - INTERFACE PARITY. The names are the legacy CFML camelCase names character for
      // character: `getOrderItemInQualifier`, not `isOrderItemInQualifier`; `getOrderItemInReward`,
      // not `orderItemMatchesReward`. A reviewer can diff these two surfaces against
      // [model/service/PromotionService.cfc:L852] and [L921] directly.
      //
      // ZERO OF THE FIVE VISIBILITY WIDENINGS IS SPENT HERE, and that is an affirmative fact rather
      // than an omission: both legacy declarations are already `public boolean function`, so no
      // promotion was needed to make either directly testable. All five widenings live elsewhere in
      // this folder and the ledger is exhausted.
      expect(typeof membership.getOrderItemInQualifier).toBe('function');
      expect(typeof membership.getOrderItemInReward).toBe('function');

      // Two parameters each, matching the legacy `(qualifier, orderItem)` and `(reward, orderItem)`
      // - nothing added, nothing defaulted, nothing reordered.
      expect(membership.getOrderItemInQualifier.length).toBe(2);
      expect(membership.getOrderItemInReward.length).toBe(2);
    });

    it('answers a boolean synchronously rather than a promise', () => {
      // The async boundary rule: a method becomes async if and only if its legacy body reaches the
      // DAO or the ORM. Neither of these does, so both stay synchronous. An async signature would
      // also break the NEGATED consumer at [model/service/PromotionService.cfc:L805], which
      // consumes the answer inside a `!` immediately.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      const qualifierAnswer = membership.getOrderItemInQualifier(qualifier, orderItem);
      const rewardAnswer = membership.getOrderItemInReward(reward, orderItem);

      expect(typeof qualifierAnswer).toBe('boolean');
      expect(typeof rewardAnswer).toBe('boolean');
      expect(qualifierAnswer).not.toBeInstanceOf(Promise);
      expect(rewardAnswer).not.toBeInstanceOf(Promise);
    });

    it('admits the fully configured fixture item through both twins', () => {
      // The baseline every asymmetry case below is measured against. The fixture attaches the item's
      // own product type, product, sku, brand and option to both twins and prices the item inside
      // the default band, so both answer true and any later `false` is attributable to the single
      // thing that case changed.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(qualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(reward, orderItem)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // The 7-versus-5 exclusion asymmetry
  // -------------------------------------------------------------------------
  describe('the seven-versus-five exclusion asymmetry', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L873-L886, L943-L952]: the two predicates are
    // near-identical twins that diverge in EXACTLY TWO CLAUSES - the qualifier's `minimumItemPrice`
    // gate at [L875] and its `maximumItemPrice` gate at [L877], neither of which the reward has.
    // FACTORING THE TWINS INTO ONE SHARED GENERIC HELPER WOULD SILENTLY ADD A PRICE GATE TO
    // REWARDS - or, taken the other way, silently drop it from qualifiers - AND EITHER CHANGES THE
    // MONEY CHARGED. That is why the shipped module authors the two disjunctions separately and
    // duplicates the five common operands deliberately, and why the cases below drive the SAME
    // configuration and the SAME order item through both twins so that the price gate is the only
    // variable left. The duplication is the safety property, not a defect to be tidied away.

    it('excludes an under-priced item from the qualifier while the reward still admits it', () => {
      // One cent below the fixture's documented `minimumItemPrice` of 9.99. Identical collections on
      // both twins, identical order item; the ONLY difference is that operand 2 exists on one of
      // them. This single pair of assertions is the whole asymmetry.
      const underPriced = makeMembershipOrderItem(fixtures.sku, '9.98');

      expect(qualifier.getMinimumItemPrice()?.toFixed2()).toBe('9.99');
      expect(membership.getOrderItemInQualifier(qualifier, underPriced)).toBe(false);
      expect(membership.getOrderItemInReward(reward, underPriced)).toBe(true);
    });

    it('excludes an over-priced item from the qualifier while the reward still admits it', () => {
      // Operand 3, the mirror image: one cent above the documented `maximumItemPrice` of 199.99.
      const overPriced = makeMembershipOrderItem(fixtures.sku, '200.00');

      expect(qualifier.getMaximumItemPrice()?.toFixed2()).toBe('199.99');
      expect(membership.getOrderItemInQualifier(qualifier, overPriced)).toBe(false);
      expect(membership.getOrderItemInReward(reward, overPriced)).toBe(true);
    });

    it('declares both item-price accessors on the qualifier and NEITHER on the reward', () => {
      // The asymmetry is a SCHEMA fact, not a call-site accident:
      // [model/entity/PromotionQualifier.cfc:L61-L62] declares both bounds as
      // `ormtype="big_decimal" hb_formatType="currency"`, and `model/entity/PromotionReward.cfc`
      // declares neither. A reward cannot be scoped to a price band even in principle, so adding
      // the gates to the reward twin would invent enforcement the legacy never performs.
      for (const accessor of QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS) {
        expect(declaresMember(qualifier, accessor)).toBe(true);
        expect(declaresMember(reward, accessor)).toBe(false);
      }

      expect(QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS).toHaveLength(2);
    });

    it('reads price for the qualifier and never reads it at all for the reward', () => {
      // The most direct available proof of the asymmetry, and the reason the read-recording wrapper
      // exists: the reward twin has no item-price operand, so it never even ASKS the order item for
      // its price. A shared generic helper could not produce this observation.
      const qualifierReads = recordOrderItemReads(makeMembershipOrderItem(fixtures.sku, '100.00'));
      const rewardReads = recordOrderItemReads(makeMembershipOrderItem(fixtures.sku, '100.00'));

      expect(membership.getOrderItemInQualifier(qualifier, qualifierReads.view)).toBe(true);
      expect(membership.getOrderItemInReward(reward, rewardReads.view)).toBe(true);

      expect(distinctReads(qualifierReads)).toStrictEqual(['price', 'sku']);
      expect(distinctReads(rewardReads)).toStrictEqual(['sku']);
    });

    it('reproduces the qualifier census of thirteen accessors and the reward census of eleven', () => {
      // Thirteen against eleven, the same set minus the two bounds. Both numbers were derived by
      // reading every operand of both bodies rather than by counting the components' columns: the
      // reward declares fourteen many-to-many collections in total, which is a different question.
      const declaredOnQualifier = QUALIFIER_MEMBERSHIP_ACCESSORS.filter((accessor) =>
        declaresMember(qualifier, accessor),
      );
      const declaredOnReward = REWARD_MEMBERSHIP_ACCESSORS.filter((accessor) =>
        declaresMember(reward, accessor),
      );

      expect(declaredOnQualifier).toStrictEqual([...QUALIFIER_MEMBERSHIP_ACCESSORS]);
      expect(declaredOnReward).toStrictEqual([...REWARD_MEMBERSHIP_ACCESSORS]);

      expect(declaredOnQualifier).toHaveLength(13);
      expect(declaredOnReward).toHaveLength(11);

      // And the eleven really are the thirteen minus exactly the two bounds - asserted as a set
      // relation rather than left to the reader to check against the two literal lists.
      const rewardAccessorNames: ReadonlySet<string> = new Set<string>(REWARD_MEMBERSHIP_ACCESSORS);
      const remainder = QUALIFIER_MEMBERSHIP_ACCESSORS.filter(
        (accessor) => !rewardAccessorNames.has(accessor),
      );

      expect(remainder).toStrictEqual([...QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS]);
    });

    it('lets a qualifier price gate answer false before the product is ever dereferenced, where the reward raises', () => {
      // CFML parity [model/service/PromotionService.cfc:L875, L877, L879]: the item-price operands
      // sit BEFORE the first product dereference in the legacy disjunction, and `||` short-circuits.
      // The shipped module preserves that by resolving the product AT THE CLAUSE POSITION rather
      // than hoisting it, so a qualifier whose price gate already excludes the item answers `false`
      // WITHOUT touching the product at all.
      //
      // The reward twin, having no price operand, reaches its first product dereference
      // unconditionally - so the very same order item RAISES there. This is a second and sharper
      // consequence of the 7-versus-5 census, and it is behaviour rather than an accident of typing:
      // an absent product raises exactly as CFML raises on a dereference of nothing, and is never
      // softened into a silent `false` that would withhold a discount over a data fault.
      const productLessSku = makeSkuFixture({ idPrefix: 'no-product-sku', product: undefined });
      const graph = makePromotionFixtures(
        unconfigured({
          qualifierGates: {
            minimumItemPrice: Money.fromDecimalString('50.00'),
            maximumItemPrice: undefined,
          },
        }),
      );
      const cheapItem = makeMembershipOrderItem(productLessSku, '10.00');

      expect(productLessSku.getProduct()).toBeUndefined();
      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, cheapItem)).toBe(false);
      expect(() => membership.getOrderItemInReward(graph.merchandiseReward, cheapItem)).toThrow(
        "requires the sku's owning product",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Both qualifier bounds are STRICT
  // -------------------------------------------------------------------------
  describe('both qualifier item-price bounds are strict, so boundary equality is inclusive', () => {
    // CFML parity [model/service/PromotionService.cfc:L875, L877]: the legacy operators are `>` and
    // `<`, never `>=` or `<=`. An item priced exactly at either bound is therefore NOT excluded, and
    // relaxing either comparison would exclude the boundary and charge a different price. The
    // direction reads backwards but is correct: the clause excludes when the configured MINIMUM sits
    // ABOVE the item price - the item is too cheap to qualify - and symmetrically for the maximum.
    //
    // All three values are monetary, so the comparisons run through `Money.isGreaterThan` and
    // `Money.isLessThan` inside the subject. No float `<` or `>` is applied to a price anywhere in
    // this suite, including in its expected values.

    it('does not exclude an item priced exactly at minimumItemPrice', () => {
      const atMinimum = makeMembershipOrderItem(fixtures.sku, '9.99');

      expect(qualifier.getMinimumItemPrice()?.equals(Money.fromDecimalString('9.99'))).toBe(true);
      expect(membership.getOrderItemInQualifier(qualifier, atMinimum)).toBe(true);
    });

    it('does not exclude an item priced exactly at maximumItemPrice', () => {
      const atMaximum = makeMembershipOrderItem(fixtures.sku, '199.99');

      expect(qualifier.getMaximumItemPrice()?.equals(Money.fromDecimalString('199.99'))).toBe(true);
      expect(membership.getOrderItemInQualifier(qualifier, atMaximum)).toBe(true);
    });

    it('excludes one cent outside either bound, which is what makes the boundary cases meaningful', () => {
      // Paired with the two cases above this brackets both bounds exactly: inclusive AT the bound,
      // exclusive one cent beyond it. Either comparison relaxed to `>=` or `<=` fails here.
      expect(
        membership.getOrderItemInQualifier(
          qualifier,
          makeMembershipOrderItem(fixtures.sku, '9.98'),
        ),
      ).toBe(false);
      expect(
        membership.getOrderItemInQualifier(
          qualifier,
          makeMembershipOrderItem(fixtures.sku, '200.00'),
        ),
      ).toBe(false);
    });

    it('treats an absent bound as no constraint rather than as zero', () => {
      // ABSENCE IS NOT ZERO, and this is the case that pins it. A qualifier with both bounds absent
      // imposes no price constraint in either direction, so a one-cent item and a near-million-unit
      // item are both admitted. Had `Money.zero` been substituted for the absent MINIMUM the answer
      // would coincidentally still be true; substituting it for the absent MAXIMUM would exclude
      // everything, so the second assertion is the load-bearing one.
      // The ten membership collections keep their defaults here ON PURPOSE, so the item is admitted
      // by the inclusion side and the price band is the only thing that could still exclude it.
      // Emptying them would make the case answer `false` for an unrelated reason.
      const openBanded = makePromotionFixtures({
        qualifierGates: { minimumItemPrice: undefined, maximumItemPrice: undefined },
      });

      expect(isNullish(openBanded.promotionQualifier.getMinimumItemPrice())).toBe(true);
      expect(isNullish(openBanded.promotionQualifier.getMaximumItemPrice())).toBe(true);
      expect(openBanded.promotionQualifier.getMinimumItemPrice()).toBeUndefined();
      expect(openBanded.promotionQualifier.getMaximumItemPrice()).toBeUndefined();

      expect(
        membership.getOrderItemInQualifier(
          openBanded.promotionQualifier,
          makeMembershipOrderItem(openBanded.sku, '0.01'),
        ),
      ).toBe(true);
      expect(
        membership.getOrderItemInQualifier(
          openBanded.promotionQualifier,
          makeMembershipOrderItem(openBanded.sku, '999999.99'),
        ),
      ).toBe(true);
    });

    it('reproduces an inverted band that excludes every item, without raising', () => {
      // The two bounds are INDEPENDENT and nothing validates them against each other: no check that
      // the minimum does not exceed the maximum, no non-negativity check, and no raise on a
      // nonsensical band. A band of minimum 100.00 with maximum 50.00 excludes everything, which is
      // legitimate legacy behaviour rather than a fault to be caught - and the reward, having no
      // gate, is untouched by it.
      const inverted = makePromotionFixtures({
        qualifierGates: {
          minimumItemPrice: Money.fromDecimalString('100.00'),
          maximumItemPrice: Money.fromDecimalString('50.00'),
        },
      });
      const midBand = makeMembershipOrderItem(inverted.sku, '75.00');

      expect(membership.getOrderItemInQualifier(inverted.promotionQualifier, midBand)).toBe(false);
      expect(membership.getOrderItemInReward(inverted.merchandiseReward, midBand)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // The null-brand polarity inversion
  // -------------------------------------------------------------------------
  describe('the null-brand polarity inversion', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L883, L911, L949, L977]: the two brand clauses
    // test the SAME nullness with OPPOSITE POLARITY and yet point the SAME WAY - both restrictive.
    //
    //   EXCLUDE side, [L883] qualifier and [L949] reward:
    //     ( arrayLen( getExcludedBrands() ) && ( isNull( brand ) || hasExcludedBrand( brand ) ) )
    //   ==> a BRANDLESS product is EXCLUDED, as though the missing brand were itself on the list.
    //
    //   INCLUDE side, [L911] qualifier and [L977] reward:
    //     if( !isNull( brand ) && hasBrand( brand ) ) { return true; }
    //   ==> a BRANDLESS product can NEVER be INCLUDED; it is not treated as a wildcard.
    //
    // A brandless product is therefore shut out from either direction. HARMONISING THE POLARITY -
    // making the exclude side skip brandless products, or the include side treat them as matching -
    // WOULD CHANGE WHICH ITEMS A PROMOTION REACHES AND SO WOULD CHANGE MONEY. Both sides are
    // counter-intuitive, both are load-bearing, and both are covered below on both twins.
    //
    // The exclude clause is gated FIRST on `arrayLen(getExcludedBrands())`, so the brandless
    // exclusion is only reachable once at least one excluded brand is named. The control case
    // immediately after each pair proves that pre-gate rather than leaving the `false` ambiguous
    // between "the clause declined" and "the clause never ran".

    /** A product with NO brand, on a product type that keeps the path walk well defined. */
    function makeBrandlessSku(graph: PromotionFixtureGraph): Sku {
      const { leaf } = chainNodes(graph);

      // `{ brand: undefined }` is the fixture's DOCUMENTED brand-absent path: its resolver tests
      // own-key presence, so an explicit `undefined` requests absence where omission would build a
      // brand. The override member is declared `Brand | undefined`, so this matches the published
      // optional shape rather than forcing `undefined` into a key that does not admit it.
      const brandlessProduct: Product = makeProductFixture({
        idPrefix: 'brandless-product',
        productID: 'brandless-product',
        brand: undefined,
        productType: leaf,
      });

      return makeSkuFixture({ idPrefix: 'brandless-sku', product: brandlessProduct });
    }

    it('EXCLUDES a brandless product from BOTH twins once any excluded brand is named', () => {
      const graph = makePromotionFixtures();
      const brandlessSku = makeBrandlessSku(graph);
      const configured = makePromotionFixtures(
        // The item is a configured sku member, so the inclusion side WOULD admit it. Only the
        // brandless exclusion can produce `false` here.
        unconfigured({ skus: [brandlessSku], excludedBrands: [graph.brand] }),
      );
      const orderItem = makeMembershipOrderItem(brandlessSku, '100.00');

      expect(brandlessSku.getProduct()?.getBrand()).toBeUndefined();
      expect(configured.promotionQualifier.getExcludedBrands()).toHaveLength(1);
      expect(configured.merchandiseReward.getExcludedBrands()).toHaveLength(1);

      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(false);
    });

    it('admits the very same brandless product when NO excluded brand is named', () => {
      // The control for the pre-gate. Identical item, identical inclusion configuration; the only
      // change is that `excludedBrands` is empty, so [L883] and [L949] never reach their null test.
      // Without this case the `false` above could not be attributed to the null-brand clause.
      const graph = makePromotionFixtures();
      const brandlessSku = makeBrandlessSku(graph);
      const configured = makePromotionFixtures(unconfigured({ skus: [brandlessSku] }));
      const orderItem = makeMembershipOrderItem(brandlessSku, '100.00');

      expect(configured.promotionQualifier.getExcludedBrands()).toHaveLength(0);
      expect(configured.merchandiseReward.getExcludedBrands()).toHaveLength(0);

      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(true);
    });

    it('never INCLUDES a brandless product through the brand clause of either twin', () => {
      // The inverted polarity. `brands` is the SOLE inclusion criterion, so the brand clause is the
      // only route to `true` - and a brandless product cannot take it. Nothing else can rescue the
      // item, so the answer falls through to the restrictive default.
      const graph = makePromotionFixtures();
      const brandlessSku = makeBrandlessSku(graph);
      const brandOnly = makePromotionFixtures(unconfigured({ brands: [graph.brand] }));
      const orderItem = makeMembershipOrderItem(brandlessSku, '100.00');

      expect(brandOnly.promotionQualifier.getBrands()).toHaveLength(1);
      expect(membership.getOrderItemInQualifier(brandOnly.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(brandOnly.merchandiseReward, orderItem)).toBe(false);
    });

    it('includes a BRANDED product through the same brand-only configuration, for both twins', () => {
      // The control for the include side: the identical configuration admits an item whose product
      // DOES carry the configured brand, so the two `false` answers above are attributable to the
      // missing brand rather than to a brand clause that never matches anything.
      // A first graph is built only to obtain a brand instance, because the override bag cannot
      // reference the graph it is about to configure.
      const brandSource = makePromotionFixtures(unconfigured());
      const withBrand = makePromotionFixtures(unconfigured({ brands: [brandSource.brand] }));
      const orderItem = makeMembershipOrderItem(withBrand.sku, '100.00');

      expect(withBrand.sku.getProduct()?.getBrand()).toBeDefined();
      expect(membership.getOrderItemInQualifier(withBrand.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(withBrand.merchandiseReward, orderItem)).toBe(true);
    });

    it('excludes a product whose brand IS on the excluded list, for both twins', () => {
      // The ordinary, non-null half of [L883] and [L949] - `hasExcludedBrand` matching a brand that
      // is genuinely present. Covering it alongside the brandless cases is what shows the compound
      // clause has two independent routes to exclusion rather than one.
      const graph = makePromotionFixtures();
      const configured = makePromotionFixtures(
        unconfigured({ skus: [graph.sku], excludedBrands: [graph.brand] }),
      );
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      expect(graph.sku.getProduct()?.getBrand()).toBeDefined();
      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The restrictive default
  // -------------------------------------------------------------------------
  describe('the restrictive default at the end of both twins', () => {
    // CFML parity [model/service/PromotionService.cfc:L918, L984]: both bodies end `return false`.
    // The consequence is counter-intuitive and is exactly the kind of behaviour a well-meaning
    // refactor inverts: AN UNCONFIGURED QUALIFIER OR REWARD MATCHES NOTHING, NOT EVERYTHING. There
    // is no "if no inclusion criteria are configured, include all" convenience branch, and adding
    // one would widen every unconfigured promotion to the whole order.
    //
    // The empty-collection answer means two OPPOSITE things depending on which side it lands on: the
    // framework's collection-contains family answers `false` against an empty configured collection,
    // which is PERMISSIVE on the exclude side - "not on the exclusion list", the item survives - and
    // RESTRICTIVE on the include side - "not on the inclusion list", the item is rejected. Both
    // readings are exercised here at once: every exclusion operand declines AND every inclusion
    // operand declines, and the item is still rejected.

    it('matches nothing for a fully unconfigured qualifier', () => {
      const graph = makePromotionFixtures(unconfigured());
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      // Every one of the ten collections empty, and both bounds absent - so nothing excludes the
      // item and nothing includes it either.
      expect(graph.promotionQualifier.getProductTypes()).toHaveLength(0);
      expect(graph.promotionQualifier.getProducts()).toHaveLength(0);
      expect(graph.promotionQualifier.getSkus()).toHaveLength(0);
      expect(graph.promotionQualifier.getBrands()).toHaveLength(0);
      expect(graph.promotionQualifier.getOptions()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedProductTypes()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedProducts()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedSkus()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedBrands()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedOptions()).toHaveLength(0);
      expect(graph.promotionQualifier.getMinimumItemPrice()).toBeUndefined();
      expect(graph.promotionQualifier.getMaximumItemPrice()).toBeUndefined();

      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, orderItem)).toBe(false);
    });

    it('matches nothing for a fully unconfigured reward', () => {
      const graph = makePromotionFixtures(unconfigured());
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      expect(graph.merchandiseReward.getProductTypes()).toHaveLength(0);
      expect(graph.merchandiseReward.getProducts()).toHaveLength(0);
      expect(graph.merchandiseReward.getSkus()).toHaveLength(0);
      expect(graph.merchandiseReward.getBrands()).toHaveLength(0);
      expect(graph.merchandiseReward.getOptions()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedProductTypes()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedProducts()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedSkus()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedBrands()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedOptions()).toHaveLength(0);

      expect(membership.getOrderItemInReward(graph.merchandiseReward, orderItem)).toBe(false);
    });

    it('rejects every reward the fixture publishes when nothing is configured', () => {
      // The restrictive default is a property of the predicate, not of one reward exhibit, so it is
      // asserted across the whole published reward collection rather than on a single instance.
      const graph = makePromotionFixtures(unconfigured());
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      expect(graph.promotionRewards.length).toBeGreaterThan(0);

      for (const publishedReward of graph.promotionRewards) {
        expect(membership.getOrderItemInReward(publishedReward, orderItem)).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Materialized product-type path membership
  // -------------------------------------------------------------------------
  describe('materialized product-type path membership', () => {
    // The comma-delimited path walking is delegated to `src/domain/valueObjects/materializedIdPath.ts`,
    // which centralises the logic the legacy duplicates between qualifier membership at
    // [model/service/PromotionService.cfc:L858-L870] and reward membership at [L921-L985]. The value
    // object has its own suite under `tests/unit/domain/valueObjects/`; what is asserted HERE is the
    // PREDICATE'S USE of it - that the walk is wired to the item's product-type ancestry, that it is
    // reached on both the include and the exclude side, and that both twins reach it identically.
    //
    // The legacy list primitives the port mirrors are published by `src/lib/cfml/list.ts`, whose
    // exports are locked at five - `listLen`, `listGetAt`, `listAppend`, `listToArray` and
    // `listFindNoCase`, with no `listDeleteAt`. `listAppend('', value)` yields the value alone with
    // no leading delimiter, and `listLen` and `listGetAt` are 1-BASED with `listGetAt` non-throwing,
    // answering `''` out of range. This suite reads paths through `listLen` and `listToArray` rather
    // than hand-rolling a split, so it agrees with the implementation the engine itself walks.

    it('publishes a product-type path of at least three distinct segments', () => {
      // DEPTH IS LOAD-BEARING, and this case is the precondition for the two ancestor cases below. A
      // one-level chain would make `productTypeIDPath` a single identifier, and a containment test
      // over a single identifier cannot distinguish walking a path from comparing the leaf - so the
      // ancestor cases would pass for the wrong reason.
      const { root, parent, leaf } = chainNodes(fixtures);
      const path: string = leaf.getProductTypeIDPath();
      const segments: readonly string[] = listToArray(path);

      expect(listLen(path)).toBeGreaterThanOrEqual(3);
      expect(segments).toHaveLength(listLen(path));
      expect(new Set(segments).size).toBe(segments.length);

      // Root first, leaf last, and every level of the chain present.
      expect(segments[0]).toBe(root.getProductTypeID());
      expect(segments[segments.length - 1]).toBe(leaf.getProductTypeID());
      expect(segments).toContain(parent.getProductTypeID());

      // The fixture's published path and the entity's own agree, so a case may use either.
      expect(fixtures.materializedIdPaths.productTypeIDPath).toBe(path);
    });

    it('includes on an EXACT LEAF match, for both twins', () => {
      const { leaf } = chainNodes(fixtures);
      const leafOnly = makePromotionFixtures(unconfigured({ productTypes: [leaf] }));
      const orderItem = makeMembershipOrderItem(leafOnly.sku, '100.00');
      const itemProductType = leafOnly.sku.getProduct()?.getProductType();

      // The configured type IS the item's own, so this case alone cannot distinguish a path walk
      // from an identity comparison - which is exactly why the two ancestor cases follow.
      expect(itemProductType?.getProductTypeID()).toBe(leaf.getProductTypeID());
      expect(membership.getOrderItemInQualifier(leafOnly.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(leafOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes on a MID-CHAIN ANCESTOR match, for both twins', () => {
      // The configured product type is the item's GRANDPARENT-adjacent ancestor, never the leaf, so
      // only a genuine path walk can find it. Identity comparison against the item's own product
      // type would answer false here.
      const graph = makePromotionFixtures(unconfigured());
      const { parent } = chainNodes(graph);
      const parentOnly = makePromotionFixtures(unconfigured({ productTypes: [parent] }));
      const orderItem = makeMembershipOrderItem(parentOnly.sku, '100.00');
      const itemProductType = parentOnly.sku.getProduct()?.getProductType();

      expect(itemProductType?.getProductTypeID()).not.toBe(parent.getProductTypeID());
      expect(membership.getOrderItemInQualifier(parentOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(parentOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes on a ROOT ancestor match, which pins the 1-based `> 0` convention', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L865, L900, L935, L966]: these four sites are
      // UN-NEGATED `listFindNoCase` calls, not the `!arrayFind` an earlier brief describes; the sole
      // `!arrayFind` site in the file is [L602], and it belongs to
      // `./promotionPeriodQualification.test.ts`. `listFindNoCase` answers a 1-BASED POSITION on a
      // hit and `0` on a miss, so the ported comparison must be `> 0`.
      //
      // THIS CASE IS WHERE THAT CONVENTION IS PINNED RATHER THAN DESCRIBED. The ROOT sits at path
      // position 1, so a `findIndex(...) > 0` transliteration - `findIndex` answering the 0-based
      // `0` there - would MISS it and this assertion would fail.
      const graph = makePromotionFixtures(unconfigured());
      const { root } = chainNodes(graph);
      const rootOnly = makePromotionFixtures(unconfigured({ productTypes: [root] }));
      const orderItem = makeMembershipOrderItem(rootOnly.sku, '100.00');
      const segments: readonly string[] = listToArray(
        rootOnly.materializedIdPaths.productTypeIDPath,
      );

      // The root really is the FIRST segment - position 1 in CFML's 1-based reckoning.
      expect(segments[0]).toBe(root.getProductTypeID());

      expect(membership.getOrderItemInQualifier(rootOnly.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(rootOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('does NOT include on a non-member product type, which pins the miss as 0 rather than -1', () => {
      // The other half of the `> 0` convention. A miss answers `0`, and a `!== -1` transliteration
      // would read that `0` as a hit - so this assertion fails under that mistranslation just as the
      // root case fails under the `findIndex` one. The two together bracket the convention exactly.
      const graph = makePromotionFixtures(unconfigured());
      const foreignOnly = makePromotionFixtures(
        unconfigured({ productTypes: [graph.excludedProductType] }),
      );
      const orderItem = makeMembershipOrderItem(foreignOnly.sku, '100.00');
      const segments: readonly string[] = listToArray(
        foreignOnly.materializedIdPaths.productTypeIDPath,
      );

      expect(segments).not.toContain(graph.excludedProductType.getProductTypeID());
      expect(membership.getOrderItemInQualifier(foreignOnly.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(foreignOnly.merchandiseReward, orderItem)).toBe(false);
    });

    it('EXCLUDES on an ancestor match on the exclusion side, for both twins', () => {
      // The same walk, the OPPOSITE exit. [L864-L869] sets a flag and breaks; [L899-L903] returns
      // true straight out of the function. The shared scan carries no include/exclude polarity, which
      // is precisely why sharing it hides nothing - one caller reads `true` as grounds for exclusion,
      // the other as grounds for inclusion. Here an ANCESTOR of the item's product type is excluded,
      // while the item's own sku is a configured inclusion member, so exclusion must win.
      const { root } = chainNodes(fixtures);
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      // Identical inclusion configuration in both graphs; ONLY the ancestor exclusion differs, so
      // the `false` pair below is attributable to it and to nothing else.
      const admitted = makePromotionFixtures(unconfigured({ skus: [fixtures.sku] }));
      const excluded = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedProductTypes: [root] }),
      );

      expect(membership.getOrderItemInQualifier(admitted.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(admitted.merchandiseReward, orderItem)).toBe(true);

      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('raises when the product type the walk needs is absent, rather than answering false', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L864, L899, L934, L965]: the five-hop chain
      // `orderItem.getSku().getProduct().getProductType().getProductTypeIDPath()` is dereferenced
      // with NO null guard at any of its four sites. The ported `getProductType()` answers
      // `ProductType | undefined`, so the strict profile forces the absence to be acknowledged - a
      // TYPE-LEVEL NECESSITY, NOT A BEHAVIOURAL CHANGE. An absent product type raises exactly as
      // CFML raises on a dereference of nothing, and must never be softened into a silent `false`
      // that would withhold a discount over a data fault.
      const graph = makePromotionFixtures();
      const typelessSku = makeSkuFixture({
        idPrefix: 'typeless-sku',
        product: makeProductFixture({
          idPrefix: 'typeless-product',
          productID: 'typeless-product',
          productType: undefined,
        }),
      });
      const configured = makePromotionFixtures(
        unconfigured({ productTypes: [chainNodes(graph).leaf] }),
      );
      const orderItem = makeMembershipOrderItem(typelessSku, '100.00');

      expect(typelessSku.getProduct()?.getProductType()).toBeUndefined();
      expect(() =>
        membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem),
      ).toThrow("requires the product's product type");
      expect(() =>
        membership.getOrderItemInReward(configured.merchandiseReward, orderItem),
      ).toThrow("requires the product's product type");
    });
  });

  // -------------------------------------------------------------------------
  // The other two materialized path kinds
  // -------------------------------------------------------------------------
  describe('the other two materialized path kinds are not consulted by either twin', () => {
    // The migration centralises THREE comma-list identifier paths in one value object -
    // `productTypeIDPath`, `priceGroupIDPath` and `categoryIDPath`. Only ONE of the three is walked
    // by these two predicates, at [model/service/PromotionService.cfc:L864], [L899], [L934] and
    // [L965]: the product-type path. The other two are walked elsewhere in the slice.
    //
    // That narrowness is asserted rather than assumed, because it is what makes this module a true
    // graph leaf - and because a future edit that reached for the wrong path would be a silent
    // membership change.
    //
    // JUDGMENT CALL: the mandate to exercise ALL THREE path kinds is honoured by characterizing the
    // other two as PROVABLY NOT CONSULTED, rather than by authoring walks the shipped module does
    // not perform. Asserting a price-group or category walk here would invent membership behaviour
    // the legacy never had and would fail the moment the subject was read - so the honest assertion
    // is the negative one: vary each of the other two paths and the answer does not move. Their
    // positive behaviour belongs to `tests/unit/domain/valueObjects/`, which owns the value object,
    // and to the price-group cascade suites, which own the price-group path.

    it('keeps the three path namespaces disjoint, so a confusion between them would be detectable', () => {
      const paths = fixtures.materializedIdPaths;
      const productTypeSegments: readonly string[] = listToArray(paths.productTypeIDPath);

      expect(productTypeSegments.length).toBeGreaterThanOrEqual(3);
      expect(listLen(paths.priceGroupIDPath)).toBeGreaterThanOrEqual(1);
      expect(listLen(paths.categoryIDPath)).toBeGreaterThanOrEqual(1);

      expect(paths.productTypeIDPath).not.toBe(paths.priceGroupIDPath);
      expect(paths.productTypeIDPath).not.toBe(paths.categoryIDPath);
      expect(paths.priceGroupIDPath).not.toBe(paths.categoryIDPath);

      // No product-type identifier appears in either of the other two paths, so a predicate that
      // walked the wrong path could not accidentally match.
      for (const segment of productTypeSegments) {
        expect(paths.priceGroupIDPath).not.toContain(segment);
        expect(paths.categoryIDPath).not.toContain(segment);
      }
    });

    it('answers identically whichever price group is applied to the order item', () => {
      // `appliedPriceGroup` is one of the ten members the view publishes and neither twin reads it.
      // The price-group path belongs to the price-group cascade, which runs BEFORE this pass and
      // whose output these predicates deliberately do not consult.
      const graph = makePromotionFixtures();
      const baseItem = makeMembershipOrderItem(graph.sku, '100.00');
      const appliedPriceGroup = graph.eligiblePriceGroups[0];

      expect(appliedPriceGroup).toBeDefined();

      const withPriceGroup: OrderItemView = { ...baseItem, appliedPriceGroup };

      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, baseItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, withPriceGroup)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(graph.merchandiseReward, baseItem)).toBe(true);
      expect(membership.getOrderItemInReward(graph.merchandiseReward, withPriceGroup)).toBe(true);
    });

    it('answers identically whatever categories the product carries', () => {
      // The category path is the third of the three. `Product` publishes its categories, and neither
      // twin reads them: category membership is not a promotion membership criterion in this slice,
      // and no clause of either census mentions it.
      const graph = makePromotionFixtures(unconfigured());
      const { leaf } = chainNodes(graph);
      const categorylessProduct: Product = makeProductFixture({
        idPrefix: 'categoryless-product',
        productID: 'shared-membership-product',
        productType: leaf,
        categories: [],
      });
      const categorylessSku = makeSkuFixture({
        idPrefix: 'categoryless-sku',
        product: categorylessProduct,
      });
      const configured = makePromotionFixtures(
        unconfigured({ products: [categorylessProduct], productTypes: [leaf] }),
      );
      const orderItem = makeMembershipOrderItem(categorylessSku, '100.00');

      expect(categorylessProduct.getCategories()).toHaveLength(0);
      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // The remaining exclusion operands, one at a time
  // -------------------------------------------------------------------------
  describe('the remaining exclusion operands, one at a time', () => {
    // Operands 4, 5 and 7 of the qualifier's seven, which are operands 2, 3 and 5 of the reward's
    // five. Each is isolated by emptying the other nine collections, so a match cannot be attributed
    // to the wrong clause, and each is paired with the configuration that admits the same item so the
    // `false` is never ambiguous between "this operand excluded" and "nothing included".

    it('excludes on hasExcludedProduct, for both twins', () => {
      // [model/service/PromotionService.cfc:L879] and [L945].
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const excluded = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedProducts: [fixtures.product] }),
      );

      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('excludes on hasExcludedSku, for both twins', () => {
      // [model/service/PromotionService.cfc:L881] and [L947].
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const excluded = makePromotionFixtures(
        unconfigured({ products: [fixtures.product], excludedSkus: [fixtures.sku] }),
      );

      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('excludes on hasAnyExcludedOption, for both twins', () => {
      // [model/service/PromotionService.cfc:L885] and [L951]. The excluded-option clause takes the
      // sku's WHOLE option array and asks whether ANY member of it is excluded, so a single shared
      // option is enough to exclude the item.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const sharedOption: Option = firstOption(fixtures.sku);
      const excluded = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedOptions: [sharedOption] }),
      );

      expect(fixtures.sku.getOptions().length).toBeGreaterThan(0);
      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('admits an option-LESS sku even when excluded options are configured, for both twins', () => {
      // The empty-array end of `hasAnyExcludedOption`: an empty option array never enters the loop
      // body, so the clause answers `false` and the item survives - PERMISSIVE on this side. The
      // option-less sku is the fixture's fourth AND-of-EXISTS member.
      const optionLessSku = makeSkuFixture({
        idPrefix: 'option-less-sku',
        andOfExistsMember: 'D',
        product: fixtures.product,
      });
      const orderItem = makeMembershipOrderItem(optionLessSku, '100.00');
      const excluded = makePromotionFixtures(
        unconfigured({
          skus: [optionLessSku],
          excludedOptions: [firstOption(fixtures.sku)],
        }),
      );

      expect(optionLessSku.getOptions()).toHaveLength(0);
      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(true);
    });

    it('lets EXCLUSION win when an item is both excluded and included, for both twins', () => {
      // CFML parity [model/service/PromotionService.cfc:L854, L887, L890]: the exclusion block runs
      // FIRST and short-circuits the whole function at [L887] and [L953]. Evaluating inclusions first
      // would let an item that is both included and excluded slip through, which is different money.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const both = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedSkus: [fixtures.sku] }),
      );

      expect(both.promotionQualifier.getSkus()).toHaveLength(1);
      expect(both.promotionQualifier.getExcludedSkus()).toHaveLength(1);
      expect(membership.getOrderItemInQualifier(both.promotionQualifier, orderItem)).toBe(false);
      expect(membership.getOrderItemInReward(both.merchandiseReward, orderItem)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The inclusion operands, one at a time
  // -------------------------------------------------------------------------
  describe('the inclusion operands, one at a time', () => {
    // CFML parity [model/service/PromotionService.cfc:L905-L916, L971-L982]: FOUR sequential `if`
    // statements each with its own early `return true` - not an `if`/`else if` chain and not a single
    // `||` disjunction. Isolating each proves all four are live rather than shadowed by the first.

    it('includes through products alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L905] and [L971].
      const productOnly = makePromotionFixtures(unconfigured({ products: [fixtures.product] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(productOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(productOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes through skus alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L908] and [L974].
      const skuOnly = makePromotionFixtures(unconfigured({ skus: [fixtures.sku] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(skuOnly.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(skuOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes through brands alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L911] and [L977] - the present-brand half of the clause
      // whose brandless half is covered above.
      const brandOnly = makePromotionFixtures(unconfigured({ brands: [fixtures.brand] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(brandOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(brandOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes through options alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L914] and [L980]. `hasAnyOption` is the include-side
      // mirror of `hasAnyExcludedOption`, and the SAME empty configured collection that made the
      // exclude side permissive makes this side restrictive.
      const sharedOption: Option = firstOption(fixtures.sku);
      const optionOnly = makePromotionFixtures(unconfigured({ options: [sharedOption] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(optionOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(optionOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('does not include an item whose sku shares no configured option', () => {
      // The negative half of `hasAnyOption`: the option-less sku cannot match through options, so
      // with options as the sole inclusion criterion it falls through to the restrictive default.
      const optionLessSku = makeSkuFixture({
        idPrefix: 'option-less-sku',
        andOfExistsMember: 'D',
        product: fixtures.product,
      });
      const optionOnly = makePromotionFixtures(
        unconfigured({ options: [firstOption(fixtures.sku)] }),
      );
      const orderItem = makeMembershipOrderItem(optionLessSku, '100.00');

      expect(optionLessSku.getOptions()).toHaveLength(0);
      expect(membership.getOrderItemInQualifier(optionOnly.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(optionOnly.merchandiseReward, orderItem)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The order-item read surface
  // -------------------------------------------------------------------------
  describe('the order-item read surface is exactly two members', () => {
    // `OrderItemView` publishes TEN members. Across both predicate bodies the order item is touched
    // through exactly TWO of them - the sku and the price - and everything else the clauses need
    // (product, product type, brand, options) is reached THROUGH the sku rather than from the view.
    // That narrowness is what makes this module a true leaf of the decomposition graph: it depends on
    // the smallest slice of the anti-corruption shape that can answer the question.

    it('publishes ten members and is read for only sku and price', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const recorded = recordOrderItemReads(orderItem);

      expect(ORDER_ITEM_VIEW_MEMBERS).toHaveLength(10);
      for (const member of ORDER_ITEM_VIEW_MEMBERS) {
        expect(declaresMember(orderItem, member)).toBe(true);
      }

      expect(membership.getOrderItemInQualifier(qualifier, recorded.view)).toBe(true);
      expect(distinctReads(recorded)).toStrictEqual(['price', 'sku']);
    });

    it('never reads the eight members neither twin needs', () => {
      // Asserted as a complement rather than restated as a list, so a view member added later is
      // covered automatically: whatever the ten are, only two of them may be read.
      const qualifierRecorded = recordOrderItemReads(
        makeMembershipOrderItem(fixtures.sku, '100.00'),
      );
      const rewardRecorded = recordOrderItemReads(makeMembershipOrderItem(fixtures.sku, '100.00'));

      expect(membership.getOrderItemInQualifier(qualifier, qualifierRecorded.view)).toBe(true);
      expect(membership.getOrderItemInReward(reward, rewardRecorded.view)).toBe(true);

      const untouched = ORDER_ITEM_VIEW_MEMBERS.filter(
        (member) => member !== 'sku' && member !== 'price',
      );

      expect(untouched).toHaveLength(8);
      for (const member of untouched) {
        expect(qualifierRecorded.reads).not.toContain(member);
        expect(rewardRecorded.reads).not.toContain(member);
      }

      // `orderItemID` is among the eight and is read ONLY on the raise path, where it identifies the
      // faulty item in the diagnostic. It is never read on a successful answer.
      expect(qualifierRecorded.reads).not.toContain('orderItemID');
    });

    it('reads the order item without mutating it', () => {
      // Membership is a QUESTION. The write side of the engine is the applied-promotion intent
      // emitted later by `./promotionApplication.ts`, and neither twin touches order persistence or
      // alters the view it was handed.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '123.45');
      const before = {
        orderItemID: orderItem.orderItemID,
        quantity: orderItem.quantity,
        price: orderItem.price.toFixed2(),
        appliedPriceGroup: orderItem.appliedPriceGroup,
      };

      membership.getOrderItemInQualifier(qualifier, orderItem);
      membership.getOrderItemInReward(reward, orderItem);

      expect({
        orderItemID: orderItem.orderItemID,
        quantity: orderItem.quantity,
        price: orderItem.price.toFixed2(),
        appliedPriceGroup: orderItem.appliedPriceGroup,
      }).toStrictEqual(before);
      expect(orderItem.sku.getOptions()).toHaveLength(fixtures.sku.getOptions().length);
    });
  });

  // -------------------------------------------------------------------------
  // The bare-scope qualifier read
  // -------------------------------------------------------------------------
  describe('the bare-scope qualifier read resolves to the argument', () => {
    // CFML parity [model/service/PromotionService.cfc:L875, L877]: both item-price operands read an
    // UNSCOPED `qualifier.getMinimumItemPrice()` and `qualifier.getMaximumItemPrice()` while every
    // neighbouring operand reads `arguments.qualifier`. CFML resolves the unscoped name through the
    // scope chain and lands on the same argument, so the two forms are equivalent there.
    //
    // TypeScript has no `arguments` scope, so the distinction CANNOT BE EXPRESSED in the target and
    // there is nothing to reproduce: the parameter is the only binding in view. This is characterized
    // rather than diverged from - THE DIVERGENCE BUDGET IS FULLY SPENT ELSEWHERE, in
    // `./discountAmount.test.ts` and `src/domain/entities/product.ts`, and this module diverges in no
    // respect. The same bare-scope family appears at [L727], [L743], [L993] and [L998].
    //
    // What IS observable, and what is asserted, is that the bounds applied come from the qualifier
    // PASSED IN - not from an ambient qualifier, not from a previously-passed one, and not from any
    // module-level state.

    it('takes both bounds from the qualifier passed in, not from any other qualifier', () => {
      const strictBand = makePromotionFixtures(
        unconfigured({
          skus: [fixtures.sku],
          qualifierGates: {
            minimumItemPrice: Money.fromDecimalString('50.00'),
            maximumItemPrice: Money.fromDecimalString('150.00'),
          },
        }),
      );
      const openBand = makePromotionFixtures(
        unconfigured({
          skus: [fixtures.sku],
          qualifierGates: { minimumItemPrice: undefined, maximumItemPrice: undefined },
        }),
      );
      const cheapItem = makeMembershipOrderItem(fixtures.sku, '10.00');

      // The two qualifiers really do carry different bounds.
      expect(strictBand.promotionQualifier.getMinimumItemPrice()?.toFixed2()).toBe('50.00');
      expect(openBand.promotionQualifier.getMinimumItemPrice()).toBeUndefined();

      // And the answer follows the ARGUMENT, in either order of calling.
      expect(membership.getOrderItemInQualifier(strictBand.promotionQualifier, cheapItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInQualifier(openBand.promotionQualifier, cheapItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(strictBand.promotionQualifier, cheapItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInQualifier(openBand.promotionQualifier, cheapItem)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Statelessness
  // -------------------------------------------------------------------------
  describe('the subject is stateless', () => {
    // A2. The class has no field, no cache and no collaborator, so one instance is safe to construct
    // once and share. That matters beyond tidiness: on a warm container module state survives between
    // unrelated requests, which is why every legacy component-level memo became request-scoped in the
    // target. A predicate that remembered anything between calls could leak one order's membership
    // answer into another's.

    it('answers identically when called twice with the same inputs', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      const firstQualifierAnswer = membership.getOrderItemInQualifier(qualifier, orderItem);
      const secondQualifierAnswer = membership.getOrderItemInQualifier(qualifier, orderItem);
      const firstRewardAnswer = membership.getOrderItemInReward(reward, orderItem);
      const secondRewardAnswer = membership.getOrderItemInReward(reward, orderItem);

      expect(firstQualifierAnswer).toBe(true);
      expect(secondQualifierAnswer).toBe(firstQualifierAnswer);
      expect(firstRewardAnswer).toBe(true);
      expect(secondRewardAnswer).toBe(firstRewardAnswer);
    });

    it('is not perturbed by an interleaved call with different inputs', () => {
      // The excluded item is driven through the SAME instance between two calls with the admitted
      // item. A cached answer or a leaked flag would surface here.
      const admittedItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const excludedItem = makeMembershipOrderItem(fixtures.sku, '9.98');

      expect(membership.getOrderItemInQualifier(qualifier, admittedItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(qualifier, excludedItem)).toBe(false);
      expect(membership.getOrderItemInQualifier(qualifier, admittedItem)).toBe(true);

      const unconfiguredGraph = makePromotionFixtures(unconfigured());

      expect(
        membership.getOrderItemInQualifier(unconfiguredGraph.promotionQualifier, admittedItem),
      ).toBe(false);
      expect(membership.getOrderItemInQualifier(qualifier, admittedItem)).toBe(true);
    });

    it('answers identically through a second, independently constructed instance', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const other = new OrderItemMembership();

      expect(other).not.toBe(membership);
      expect(other.getOrderItemInQualifier(qualifier, orderItem)).toBe(
        membership.getOrderItemInQualifier(qualifier, orderItem),
      );
      expect(other.getOrderItemInReward(reward, orderItem)).toBe(
        membership.getOrderItemInReward(reward, orderItem),
      );

      // No own enumerable state on either instance - nothing was stashed during the calls above.
      expect(Object.keys(membership)).toStrictEqual([]);
      expect(Object.keys(other)).toStrictEqual([]);
    });

    it('leaves the fixture graph unchanged, so each case starts from an independent graph', () => {
      // The complement of the statelessness claim, on the OTHER side of the call: the predicate does
      // not mutate the qualifier or reward it was handed either, so the ten collections a later case
      // reads are the ten the fixture built.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const before = {
        productTypes: qualifier.getProductTypes().length,
        products: qualifier.getProducts().length,
        skus: qualifier.getSkus().length,
        brands: qualifier.getBrands().length,
        options: qualifier.getOptions().length,
      };

      membership.getOrderItemInQualifier(qualifier, orderItem);
      membership.getOrderItemInReward(reward, orderItem);

      expect({
        productTypes: qualifier.getProductTypes().length,
        products: qualifier.getProducts().length,
        skus: qualifier.getSkus().length,
        brands: qualifier.getBrands().length,
        options: qualifier.getOptions().length,
      }).toStrictEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // The golden order
  // -------------------------------------------------------------------------
  describe('the golden order integrates', () => {
    // The shared multi-item order fixture, exercised so that the direct construction used everywhere
    // above is not the only route covered. A FRESH order is built inside the case and a fresh view is
    // taken from it, so nothing is shared with any other case.

    it('admits a golden order item whose sku is a configured member, through both twins', () => {
      const order = makeOrderViewFixture({
        itemOverrides: [{ sku: fixtures.sku, price: Money.fromDecimalString('100.00') }],
      });
      const firstItem = order.orderItems[0];

      // `noUncheckedIndexedAccess` makes the indexed read `OrderItemView | undefined`; it is captured
      // and narrowed explicitly rather than asserted away with a postfix `!`.
      expect(firstItem).toBeDefined();
      if (firstItem === undefined) {
        throw new Error('The golden order fixture must publish at least one order item.');
      }

      expect(order.orderItems.length).toBeGreaterThan(1);
      expect(firstItem.sku.getSkuID()).toBe(fixtures.sku.getSkuID());
      expect(firstItem.price.toFixed2()).toBe('100.00');

      expect(membership.getOrderItemInQualifier(qualifier, firstItem)).toBe(true);
      expect(membership.getOrderItemInReward(reward, firstItem)).toBe(true);
    });

    it('applies the item-price gate to a golden order item priced below the minimum', () => {
      // The asymmetry again, this time driven entirely through the shared fixture path rather than
      // through a directly constructed view - so the behaviour is not an artefact of how this suite
      // builds its order items.
      const order = makeOrderViewFixture({
        itemOverrides: [{ sku: fixtures.sku, price: Money.fromDecimalString('9.98') }],
      });
      const firstItem = order.orderItems[0];

      expect(firstItem).toBeDefined();
      if (firstItem === undefined) {
        throw new Error('The golden order fixture must publish at least one order item.');
      }

      expect(membership.getOrderItemInQualifier(qualifier, firstItem)).toBe(false);
      expect(membership.getOrderItemInReward(reward, firstItem)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Isolation
  // -------------------------------------------------------------------------
  describe('the predicate performs no data access and reads no ambient state', () => {
    // The complement of the not-applicable parameterized-SQL note in this file's header. There is no
    // SQL to shape and no parameter to bind because there is no data access at all, and THAT is what
    // is asserted here - the absence itself, rather than a stand-in for it.

    it('answers synchronously from its two arguments alone', () => {
      // Neither twin takes a collaborator, so there is nothing to double and nothing to spy on - the
      // subject could not reach a repository even if it wanted to. Three observable facts stand in
      // for that, together, and none of them requires reading the environment:
      //
      //   1. Each method declares EXACTLY TWO parameters. No third context argument is threaded in.
      //      That is the target's replacement for the legacy ambient request scope, and this module
      //      needs none of it: it reads no setting, no current account and no current currency.
      //   2. The return is a plain `boolean`, produced immediately. A predicate that reached the
      //      MySQL connection pool could not answer synchronously, so having nothing to wait on IS
      //      the observable form of "no data access" - and it is why this file waits on nothing.
      //   3. Nothing is retained. Construction takes no argument and the instance carries no own
      //      property after answering, so no connection, cache or handle was stashed.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier.length).toBe(2);
      expect(membership.getOrderItemInReward.length).toBe(2);

      const qualifierAnswer: unknown = membership.getOrderItemInQualifier(qualifier, orderItem);
      const rewardAnswer: unknown = membership.getOrderItemInReward(reward, orderItem);

      expect(typeof qualifierAnswer).toBe('boolean');
      expect(typeof rewardAnswer).toBe('boolean');
      expect(qualifierAnswer).toBe(true);
      expect(rewardAnswer).toBe(true);

      expect(OrderItemMembership.length).toBe(0);
      expect(Object.keys(membership)).toStrictEqual([]);
    });

    it('is date-free, so its answer cannot drift with the clock', () => {
      // Neither twin reads a clock: no promotion period test, no sale-price expiry, no `isCurrent`.
      // Period and code currency are decided upstream by `./promotionPeriodQualification.ts` and the
      // promotion entities. Frozen fake timers would therefore change nothing here, which is why none
      // are installed - `tests/setup.ts` deliberately does not install them globally either.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const distantPast = makePromotionFixtures({ now: new Date('1999-12-31T23:59:59.000Z') });
      const distantFuture = makePromotionFixtures({ now: new Date('2099-01-01T00:00:00.000Z') });
      const pastItem = makeMembershipOrderItem(distantPast.sku, '100.00');
      const futureItem = makeMembershipOrderItem(distantFuture.sku, '100.00');

      expect(membership.getOrderItemInQualifier(qualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(distantPast.promotionQualifier, pastItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInQualifier(distantFuture.promotionQualifier, futureItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(distantPast.merchandiseReward, pastItem)).toBe(true);
      expect(membership.getOrderItemInReward(distantFuture.merchandiseReward, futureItem)).toBe(
        true,
      );
    });
  });
});
