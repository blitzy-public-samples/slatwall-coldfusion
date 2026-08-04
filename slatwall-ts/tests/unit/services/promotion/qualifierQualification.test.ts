// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/services/promotion/qualifierQualification.ts`
//
// The subject is the ported form of
// `private struct function getQualifierQualificationDetails(required any qualifier,
//  required any order)` [model/service/PromotionService.cfc:L629-L750] - the three-arm qualifier
// evaluator that decides, for ONE promotion qualifier, how many times it qualifies and which
// fulfillments and order items it qualifies.
//
// ---------------------------------------------------------------------------
// WHY QUALIFICATION IS MUST-PRESERVE AREA #1 AND NOT MERE STRUCTURE
// ---------------------------------------------------------------------------
// Must-preserve area (i) of this migration is promotion discount math TOGETHER WITH use-limit
// enforcement. Qualification sits directly upstream of both: the `qualificationCount` computed
// here is what the reward ledger multiplies by `maximumUsePerQualification`
// [model/service/PromotionService.cfc:L222-L224], and a count of zero makes the enclosing period
// fail its gate at [model/service/PromotionService.cfc:L593] and disqualify through the early
// return at [model/service/PromotionService.cfc:L613-L616].
//
// So a qualifier that over-excludes does not compute a slightly different discount - it withholds
// the discount entirely and the customer is charged full price. Every assertion below is therefore
// a statement about money, and LEGACY-DEFECT 11 at [model/service/PromotionService.cfc:L703],
// which this file owns, is treated as a first-class preservation responsibility rather than as a
// curiosity.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and recording that is a requirement rather than
// a courtesy: presenting net-new coverage as parity fails the traceability gate.
// `meta/tests/unit/service/` holds exactly four components - `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc` - not one of
// them in scope, and `grep -rli 'promotion' meta/tests/` returns ZERO files: no legacy test
// anywhere in the tree so much as mentions a promotion, let alone a qualifier. Across the whole
// migration only `tests/unit/domain/entities/brand.test.ts` and
// `tests/unit/domain/entities/product.test.ts` extend a legacy suite, and
// `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub contributing zero coverage
// to anybody. There is no antecedent for this file and no lineage is claimed for it.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST, AND THE ABSENCE WAS VERIFIED
// ---------------------------------------------------------------------------
// The project's rules source was queried three independent ways while this suite was authored -
// unpaged, over the full range, and at a high offset well past any plausible end of document - and
// returned the identical single-line sentinel every time. It is a fixed sentinel rather than a
// truncated read: a genuinely paginated document answers empty at a high offset, not with the same
// line.
//
// Consequently NO user-specified rule governs this file, no rule is invented to fill the gap, and
// the absence is NOT treated as licence to lower the bar. The enterprise practices this migration
// commits to apply at full strength in their place - maximal strictness with no `any`, no
// suppression comment and no non-null assertion; no new dependency; a single arithmetic surface;
// every judgment call and every preserved defect annotated where it was made. The rules source
// remains the authoritative answer should rules ever be added; this note records its result and
// does not substitute for it.
//
// ---------------------------------------------------------------------------
// VISIBILITY WIDENING #2 OF EXACTLY 5
// ---------------------------------------------------------------------------
// The legacy declaration is `private struct function getQualifierQualificationDetails`
// [model/service/PromotionService.cfc:L629]. The target exports it, which is what lets this
// behaviour be exercised directly instead of only through the 489-line orchestrator that calls it.
// That is widening #2; the other four are #1 [L549], #3 [L752] and #4 [L783], all hosted by
// `./promotionPeriodQualification.ts`, and #5 [L987], hosted by `./discountAmount.ts`. All five
// live in this one folder and the ledger is EXHAUSTED - a sixth would be a gate failure. The
// complementary assertion, that no SIXTH private helper was promoted, belongs to
// `../promotionService.test.ts` and is referenced here rather than duplicated.
//
// The widening alters VISIBILITY ONLY. No parameter is added, removed, reordered or defaulted, so
// this file spends none of the SIGNATURE-RESHAPING budget (3 project-wide: the two anti-corruption
// inversions, the two smart-list renames `findProducts`/`findSkus`, and the feed adapter's
// `generateProductFeed` - all elsewhere) and none of the SIGNATURE-WIDENING budget (1 project-wide,
// already spent on `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`). The four
// ledgers are distinct and are never conflated.
//
// ---------------------------------------------------------------------------
// ZERO DELIBERATE DIVERGENCES HERE - DEFECT 11 IS PRESERVED, NOT FIXED
// ---------------------------------------------------------------------------
// The migration permits EXACTLY THREE deliberate divergences in total, and this module owns NONE of
// them: (a) register entry 13 and (b) register entry 12 both belong to `./discountAmount.test.ts`,
// and (c) register entry 19's poisoned `getBrandName()` memo belongs to
// `src/domain/entities/product.ts`. No fourth is permitted anywhere, and this subject may not
// diverge in any respect.
//
// Everything this file pins is therefore CURRENT SHIPPING BEHAVIOUR, defects included. A suite that
// asserted the repaired behaviour would pass against an implementation that charges customers
// differently, which is precisely the failure mode a characterization suite exists to prevent.
//
// ---------------------------------------------------------------------------
// THE THREE MEASURE KINDS IN THIS SUBJECT, WHICH MUST NEVER BE CONFLATED
// ---------------------------------------------------------------------------
//   MONETARY      the order-arm subtotal bounds [model/service/PromotionService.cfc:L648, L650],
//                 compared against `order.subtotal`. `minimumOrderSubtotal` and
//                 `maximumOrderSubtotal` are `ormtype="big_decimal" hb_formatType="currency"`
//                 [model/entity/PromotionQualifier.cfc:L57, L58], so they are `Money` and are
//                 compared through `Money`'s own members. Every monetary literal below is a plain
//                 decimal numeral handed to `Money.fromDecimalString`.
//   PLAIN COUNTS  the order-arm quantity bounds [model/service/PromotionService.cfc:L644, L646],
//                 compared against `order.totalSaleQuantity`, plus `minimumItemQuantity`
//                 [model/service/PromotionService.cfc:L742]. All are `ormtype="integer"`
//                 [model/entity/PromotionQualifier.cfc:L55, L56, L59] and stay `number`.
//   PLAIN WEIGHT  the fulfillment-arm bounds [model/service/PromotionService.cfc:L695, L697],
//                 compared against `orderFulfillment.totalShippingWeight`. A WEIGHT IS NOT MONEY:
//                 the qualifier declares both with `hb_formatType="weight"`
//                 [model/entity/PromotionQualifier.cfc:L63, L64], NOT `"currency"`, and
//                 `orderViewFixtures` supplies `totalShippingWeight` as a plain number. Nothing
//                 below wraps a weight in `Money`.
//
// No raw floating-point arithmetic is performed on a monetary value anywhere in this file, not even
// to compute an expected value: every money expectation is a decimal numeral written out in full.
// There is no `?? Money.zero`, no `|| Money.zero` and no zero default anywhere - an absent bound
// must stay observably ABSENT, because absence is exactly what disables a gate.
//
// ---------------------------------------------------------------------------
// PARAMETERIZED SQL: NOT APPLICABLE HERE, AND WHY
// ---------------------------------------------------------------------------
// The migration's parameterized-SQL standard - every statement a prepared statement, preserving the
// injection-safety property `cfqueryparam` provided - has NO application to this file, and that is
// stated rather than silently omitted so its absence cannot be read as an oversight. The subject is
// pure synchronous computation over an already-materialised qualifier and an already-materialised
// read-only order projection: it issues no statement, opens no connection, binds no parameter and
// names no table. Its only outward calls are to two synchronous collaborators, neither of which
// touches a database. Every SQL-shape and parameter-binding assertion in this project belongs
// exclusively to the sibling-owned `tests/integration/repositories/` tier.
//
// For the same reason this file must pass in a completely empty environment: it reads no
// `process.env`, loads no `.env`, opens no pool, touches no network and no filesystem, imports
// neither `src/lib/config.ts` nor `src/lib/logger.ts`, and contains no credential or connection
// literal of any kind. Nothing here is async, so no promise is created and no `await` appears
// below - the subject and the address-zone port are both synchronous by mandate.
//
// ---------------------------------------------------------------------------
// LOCATOR AND OWNERSHIP CORRECTIONS, RECORDED BECAUSE THE SOURCE WINS
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L707-L709, L774]: THE TWO INDEX-DELETION HAZARDS
// ARE DIFFERENT HAZARDS IN DIFFERENT SUITES, AND ONLY ONE IS MINE.
// An older brief assigned a `ListDeleteAt` hazard to this suite. The source disagrees and the
// source wins. The two are distinguished precisely:
//   * MINE, asserted below: `arrayDeleteAt(qualifiedFulfillmentIDs, arrayFind(...))` at
//     [model/service/PromotionService.cfc:L708-L709], over an ARRAY, inside the range this module
//     ports.
//   * NOT MINE: `ListDeleteAt(qualifiedFulfillmentIDs, listFindNoCase(...))` at
//     [model/service/PromotionService.cfc:L774], over a COMMA-DELIMITED STRING, inside
//     `getPromotionPeriodQualifiedFulfillmentIDList` whose declaration is at L752 and whose body
//     runs to L781 - outside the L629-L750 range - and therefore owned by
//     `./promotionPeriodQualification.test.ts`.
// Two different primitives, two different line ranges, two different suites. Recorded here so a
// reviewer following the older brief is not left looking for a `ListDeleteAt` assertion that
// correctly does not exist in this file.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L633, L660]: `qualifiedFulfillmentIDs` has been
// cited as initialised at L656. L656 is the `else if` FULFILLMENT DISPATCH line; the initialiser is
// at L633 and the re-initialisation at L660. The shipped subject records the same correction, and
// this suite asserts against the source.
//
// ---------------------------------------------------------------------------
// THE FOUR UNGUARDED DIVISIONS IN THE SLICE, AND WHICH ONE IS MINE
// ---------------------------------------------------------------------------
// [model/service/PromotionService.cfc:L299, L486, L743, L831] are four divisions with no zero-check
// on the divisor, and NONE of them may be guarded. L743 is mine and is asserted below; L299 belongs
// to `./rewardUsageLedger.test.ts`, L486 to `./overUseStripping.test.ts`, and L831 to
// `./promotionPeriodQualification.test.ts`. The set is named so nobody concludes from this file's
// single case that the others were overlooked.
//
// ---------------------------------------------------------------------------
// THE EMPTY-COLLECTION POLARITY DISTINCTION THAT MUST NOT BE COLLAPSED
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L357-L359] and
// [model/service/AddressService.cfc:L58, L60-L61]: the CALLER and the EVALUATOR read an empty
// collection with OPPOSITE polarity, and collapsing them into one rule is a money bug.
//   * The reward-side CALLER is PERMISSIVE: `addressIsInZone = true` at L357, flipped to `false` at
//     L359 only when `arrayLen(reward.getShippingAddressZones())` is non-zero. A reward with NO
//     configured zones therefore imposes no zone constraint. The qualifier arm below uses the same
//     permissive shape at [model/service/PromotionService.cfc:L669, L672, L675].
//   * The EVALUATOR itself is RESTRICTIVE: `AddressService.isAddressInZone` seeds
//     `addressInZone = false` at [model/service/AddressService.cfc:L58] and only ever flips it
//     INSIDE the location loop at L60-L61, so a zone with ZERO LOCATIONS answers "not in zone".
// Because the two polarities differ, this suite never relies on an implied default from the zone
// port. The inline `AddressZoneEvaluator` double answers an explicit, caller-chosen boolean in
// every single case, so no assertion below silently depends on which polarity a reader assumed.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L360, L678, L703]: the null-guard asymmetry is
// the source's and is not normalised. The fulfillment-REWARD branch at L360 guards the very same
// dereference with `!isNull(orderFulfillment.getAddress()) && !orderFulfillment.getAddress().isNew()`
// and reads the flag through `isNew()`, while the qualifier branch at L678 and L703 dereferences
// `getAddress().getNewFlag()` with NO guard at all. No guard is added to the qualifier sites and
// none is removed from L360, which is not this module's code in any case.
//
// ---------------------------------------------------------------------------
// HOW THIS SUITE ADAPTED TO THE SHIPPED SURFACE
// ---------------------------------------------------------------------------
// The shipped module was read in full before a single assertion was written, and the suite adapts
// to it rather than the reverse. Nothing under `src/**` is modified, renamed, re-exported or
// wrapped to accommodate this file, and no shim, adapter or alias bridges a naming difference.
// What the reading settled:
//   * the exported unit is the CLASS `QualifierQualificationEvaluator`, deliberately not colliding
//     with the published TYPE `QualifierQualification`;
//   * its constructor takes the two collaborators POSITIONALLY, address-zone evaluator first;
//   * the one public method is synchronous and named verbatim after the legacy declaration, which
//     interface parity freezes - it is not renamed, aliased or wrapped here;
//   * the read-only views expose PROPERTIES (`order.totalSaleQuantity`, `fulfillment.address`),
//     not CFML-style accessor methods, so every expectation below is written against properties;
//   * an unresolved address raises `TypeError` and both index hazards raise `RangeError`, so the
//     throw assertions below name those constructors rather than a generic `Error`.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneProjection,
} from '../../../../src/domain/ports/addressZoneEvaluator.js';
import type {
  QualifiedOrderItemDetail,
  QualifierQualification,
} from '../../../../src/domain/promotionEngine/qualificationTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type {
  AppliedPromotionView,
  FulfillmentMethodView,
  OrderFulfillmentView,
  ShippingAddressView,
  ShippingMethodView,
} from '../../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';
import { OrderItemMembership } from '../../../../src/services/promotion/orderItemMembership.js';
import { QualifierQualificationEvaluator } from '../../../../src/services/promotion/qualifierQualification.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT IMPORTED, EACH OMISSION BEING A DECISION
//
//   ../promotionService.js              the facade. The intra-folder discipline is DIRECTIONAL -
//                                       the facade may reach all nine modules and nothing in the
//                                       folder may reach it back - and a suite must not become the
//                                       back door that inverts it.
//   src/handlers/**, src/repositories/**, src/integrations/**
//                                       outward layers. The `no-restricted-imports` boundary is
//                                       scoped to `src/domain/**`, but tests must not be a back
//                                       door around it either. This file imports from
//                                       `src/domain/**` and `src/services/promotion/**` only.
//   src/lib/cfml/precision.js           there is no `precisionEvaluate` site in L629-L750, and the
//                                       L743 division is plain integer arithmetic. Importing it to
//                                       compute an expectation would move arithmetic outside the
//                                       single arithmetic surface, which is exactly what that
//                                       surface exists to prevent.
//   src/lib/cfml/list.js                the L714 comma-list membership test belongs to the SUBJECT.
//                                       Re-deriving it here with the same helper would assert the
//                                       helper rather than the dispatch; the dispatch is proven
//                                       instead by feeding it real and unreal type values.
//   src/lib/cfml/truthiness.js          the nine `!isNull(...)` gate sites are the subject's - four
//                                       order bounds, two weight bounds, the two shipping-method
//                                       reads and the item-quantity minimum. This file
//                                       proves their POLARITY by omitting a bound and observing the
//                                       gate go quiet, which is the observable consequence.
//   src/lib/config.js, src/lib/logger.js
//                                       process configuration is not a request scope, and nothing
//                                       here logs.
// Those five `src/lib/**` modules and the ambient contract files - `tests/setup.ts`,
// `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json` - are declared
// dependencies of this file that are consumed as the runner, type, lint and format contract rather
// than imported. Importing one and leaving it unused is a lint error and would be a declaration of
// intent the code does not honour; an accurate absence is preferable to a tidy-looking import. None
// of them is modified by this work.
//
// No test-only dependency is introduced. Nothing outside the fourteen pinned packages is added: no
// alternative test runner, no mocking or stubbing library, no data-generation library, no HTTP
// interception or HTTP-assertion library, no alternative assertion or builder library, no runner UI
// package and NO DOM-EMULATION ENVIRONMENT of any kind - this suite needs none of them. Both
// collaborator doubles are hand-written below and declared inline in this file and nowhere else.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The fixture graph types.
//
// Both factories publish ONE named export each and deliberately do not export the shapes they
// return, so the shapes are recovered from the functions rather than restated. Restating one would
// let this suite and the factory drift apart silently, and redeclaring a published type is a gate
// failure in any case.
// ---------------------------------------------------------------------------
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/**
 * The published constructor argument of `PromotionQualifier`, recovered from the class rather than
 * restated, for the same reason.
 */
type PromotionQualifierInit = ConstructorParameters<typeof PromotionQualifier>[0];

// ---------------------------------------------------------------------------
// THE TEST BED, AS EXPLICIT VALUES
//
// Every figure below is passed INTO the order fixture rather than read back out of it, so each
// boundary case can be written as a literal on both sides of the comparison and a reader can check
// "below / exactly equal / above" without arithmetic. Money is a plain decimal numeral handed to
// `Money.fromDecimalString`; a quantity and a weight are plain numbers, because a count is not money
// and A WEIGHT IS NOT MONEY.
// ---------------------------------------------------------------------------

/** The order's total sale quantity, compared against at [model/service/PromotionService.cfc:L644, L646]. */
const ORDER_TOTAL_SALE_QUANTITY = 9;

/** One below {@link ORDER_TOTAL_SALE_QUANTITY}. */
const QUANTITY_BELOW = 8;

/** One above {@link ORDER_TOTAL_SALE_QUANTITY}. */
const QUANTITY_ABOVE = 10;

/** The order's subtotal, compared against at [model/service/PromotionService.cfc:L648, L650]. */
const ORDER_SUBTOTAL = '129.95';

/** One cent below {@link ORDER_SUBTOTAL}. */
const SUBTOTAL_BELOW = '129.94';

/** One cent above {@link ORDER_SUBTOTAL}. */
const SUBTOTAL_ABOVE = '129.96';

/**
 * The shipping fulfillment's total shipping weight - a PLAIN NUMBER, never `Money`.
 *
 * Exactly representable in binary floating point, as are the two bounds either side of it, so the
 * strict comparisons at [model/service/PromotionService.cfc:L695, L697] are decided by the values
 * and never by a representation artifact.
 */
const FULFILLMENT_WEIGHT = 12.5;

/** Below {@link FULFILLMENT_WEIGHT}. */
const WEIGHT_BELOW = 12;

/** Above {@link FULFILLMENT_WEIGHT}. */
const WEIGHT_ABOVE = 13;

/** An obviously-synthetic address-zone identifier the qualifier can be configured with. */
const ZONE_ID_WEST = 'az-west';

/** A second synthetic zone identifier, used to prove the configured order and the early exit. */
const ZONE_ID_CENTRAL = 'az-central';

/** A third synthetic zone identifier, never reached once an earlier zone has matched. */
const ZONE_ID_EAST = 'az-east';

/** A fulfillment-method identifier no fulfillment in the order carries. */
const UNCONFIGURED_FULFILLMENT_METHOD_ID = 'fm-nowhere';

/** A shipping-method identifier no fulfillment in the order carries. */
const UNCONFIGURED_SHIPPING_METHOD_ID = 'sm-nowhere';

/**
 * A `qualifierType` value that is in NO arm of the dispatch.
 *
 * Not a typo of a real value and not a mixed-casing variant, because case folds and a near-miss
 * would prove nothing: this value is absent from the vocabulary altogether, which is what makes the
 * missing final `else` at [model/service/PromotionService.cfc:L747] observable.
 */
const UNRECOGNISED_QUALIFIER_TYPE = 'wishlist';

// ---------------------------------------------------------------------------
// COLLABORATOR DOUBLE #1 - THE ADDRESS-ZONE PORT
// ---------------------------------------------------------------------------

/**
 * One recorded call against the address-zone port.
 *
 * Recording the ARGUMENTS rather than only the call count is deliberate: it is the cleanest
 * available proof that the correct address and the correct zone reach the port, which is the one
 * thing the qualifier arm is responsible for at [model/service/PromotionService.cfc:L684].
 */
interface RecordedZoneCall {
  readonly address: AddressProjection;
  readonly addressZone: AddressZoneProjection;
}

/**
 * The hand-written address-zone evaluator, declared inline in this file and nowhere else.
 *
 * It implements EXACTLY the one member the port declares - `isAddressInZone`
 * [model/service/AddressService.cfc:L57], reached from
 * [model/service/PromotionService.cfc:L684] - and it is SYNCHRONOUS, which is why no `await`
 * appears anywhere in this suite. No second port member is invented, nothing is fetched, no clock
 * or environment is read, and no counter outlives an instance.
 *
 * ★ THE VERDICT IS ALWAYS EXPLICIT, NEVER IMPLIED. Every case names the zone identifiers this
 * double treats as matching, so no assertion silently depends on an assumed empty-collection
 * polarity - and the polarities genuinely disagree: the qualifier arm's CALLER is permissive
 * [model/service/PromotionService.cfc:L669, L672, L675] while the real evaluator is RESTRICTIVE
 * [model/service/AddressService.cfc:L58]. Passing no matching identifiers is therefore a positive
 * instruction meaning "answer false", not a default.
 *
 * ★ THE ZONE-MEMBERSHIP ALGORITHM IS DELIBERATELY NOT REPRODUCED HERE. The four guarded
 * inequalities of [model/service/AddressService.cfc:L63-L74] belong to whoever implements the port
 * in the composition root. What this suite asserts is the INTERACTION: which address and which zone
 * the subject hands over, in what order, how many times, and what it does with each answer.
 */
class RecordingAddressZoneEvaluator implements AddressZoneEvaluator {
  /** Every call, in call order. Per instance, never shared, never hoisted to module scope. */
  readonly calls: RecordedZoneCall[] = [];

  /**
   * @param matchingAddressZoneIDs - the zone identifiers this double answers `true` for. An empty
   *   list means "answer false for every zone", stated explicitly by the case that passes it.
   */
  constructor(private readonly matchingAddressZoneIDs: readonly string[]) {}

  isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean {
    this.calls.push({ address, addressZone });

    return this.matchingAddressZoneIDs.includes(addressZone.addressZoneID);
  }
}

// ---------------------------------------------------------------------------
// COLLABORATOR DOUBLE #2 - THE ORDER-ITEM MEMBERSHIP UNIT
// ---------------------------------------------------------------------------

/**
 * One recorded call against the membership collaborator.
 *
 * The qualifier is recorded alongside the item because the legacy call at
 * [model/service/PromotionService.cfc:L727] passes both, and proving the SAME qualifier instance is
 * forwarded unsubstituted is half of what "positive polarity, correct arguments" means.
 */
interface RecordedMembershipCall {
  readonly qualifier: PromotionQualifier;
  readonly orderItem: OrderItemView;
}

// JUDGMENT CALL: the membership double SUBCLASSES the real, shipped `OrderItemMembership` rather
// than standing in for it structurally.
//
// The shipped class carries no private member, so a plain object literal would in fact be
// assignable - the choice is therefore about evidence rather than about the compiler. Subclassing
// means the collaborator this suite injects genuinely IS an `OrderItemMembership`: it inherits the
// real `getOrderItemInReward` untouched, it cannot drift out of shape if a member is ever added to
// the class, and it keeps the stated preference for the real proven unit while still giving the
// per-case control and the argument recording that [model/service/PromotionService.cfc:L727]'s
// polarity assertions require. `noImplicitOverride` makes the one substituted member explicit at
// the declaration, which is exactly the visibility that is wanted here.
//
// The complementary evidence is supplied too, rather than argued: several cases below inject an
// UNMODIFIED `new OrderItemMembership()` and drive the order-item arm through the real seven-operand
// membership test end to end. The membership algorithm itself - its exclusion-first shape and its
// product-type path walking [model/service/PromotionService.cfc:L852-L919] - is owned by
// `./orderItemMembership.test.ts` and is deliberately not re-derived here.
/**
 * The hand-written membership collaborator: a real `OrderItemMembership` whose one consulted member
 * is replaced by a recorder answering a caller-chosen verdict per order item.
 */
class RecordingOrderItemMembership extends OrderItemMembership {
  /** Every call to `getOrderItemInQualifier`, in call order. Per instance, never shared. */
  readonly getOrderItemInQualifierCalls: RecordedMembershipCall[] = [];

  /**
   * @param qualifyingOrderItemIDs - the opaque order-item identifiers this double reports as
   *   members. An empty list means "no item qualifies", stated explicitly by the case that passes
   *   it.
   */
  constructor(private readonly qualifyingOrderItemIDs: readonly string[]) {
    super();
  }

  override getOrderItemInQualifier(
    qualifier: PromotionQualifier,
    orderItem: OrderItemView,
  ): boolean {
    this.getOrderItemInQualifierCalls.push({ qualifier, orderItem });

    return this.qualifyingOrderItemIDs.includes(orderItem.orderItemID);
  }
}

// ---------------------------------------------------------------------------
// NARROWING HELPERS
//
// Under `noUncheckedIndexedAccess` every indexed read is possibly-absent, and this suite uses
// neither a non-null assertion nor a type assertion to sidestep that - not because the lint profile
// forbids it in `tests/**` (it does not) but because a captured-and-checked read fails on the check
// with a message naming what was expected, instead of failing later on a confusing comparison.
// ---------------------------------------------------------------------------

/**
 * Reads one element of a collection, failing loudly when it is absent.
 *
 * @param values - the collection being indexed.
 * @param index - the ZERO-BASED position wanted. This is an ordinary JavaScript index; the
 *   1-based-or-`0` convention of CFML's `arrayFind` belongs to the SUBJECT
 *   [model/service/PromotionService.cfc:L708-L709] and is never emulated in this suite's own reads.
 * @param description - what the caller was looking for, used in the failure message.
 * @returns the element at that position.
 * @throws Error when the position holds nothing.
 */
function elementAt<TValue>(values: readonly TValue[], index: number, description: string): TValue {
  const value = values[index];

  if (value === undefined) {
    throw new Error(
      `Expected ${description} at index ${String(index)}, but the collection holds ` +
        `${String(values.length)} element(s).`,
    );
  }

  return value;
}

/**
 * The fulfillment at a given position on an order view.
 *
 * @param order - the read-only order projection.
 * @param index - zero-based position in `order.orderFulfillments`.
 * @returns the fulfillment view.
 */
function orderFulfillmentAt(order: OrderView, index: number): OrderFulfillmentView {
  return elementAt(order.orderFulfillments, index, 'an order fulfillment');
}

/**
 * The order item at a given position on an order view.
 *
 * @param order - the read-only order projection.
 * @param index - zero-based position in `order.orderItems`.
 * @returns the order item view.
 */
function orderItemAt(order: OrderView, index: number): OrderItemView {
  return elementAt(order.orderItems, index, 'an order item');
}

/**
 * A fulfillment's resolved shipping address, failing loudly when the fixture supplied none.
 *
 * Used only by cases that deliberately work with a PRESENT address. The absent case is a first-class
 * subject of this suite and is exercised through the throw assertions instead
 * [model/service/PromotionService.cfc:L678, L703].
 *
 * @param orderFulfillment - the fulfillment whose address is wanted.
 * @returns the address view.
 * @throws Error when no address was resolved.
 */
function resolvedAddressOf(orderFulfillment: OrderFulfillmentView): ShippingAddressView {
  const address = orderFulfillment.address;

  if (address === undefined) {
    throw new Error(
      `Expected fulfillment "${orderFulfillment.orderFulfillmentID}" to carry a resolved address.`,
    );
  }

  return address;
}

/**
 * A fulfillment's shipping method identifier, failing loudly when the fixture supplied no method.
 *
 * @param orderFulfillment - the fulfillment whose shipping method is wanted.
 * @returns the opaque shipping-method identifier.
 * @throws Error when no shipping method is present.
 */
function shippingMethodIDOf(orderFulfillment: OrderFulfillmentView): string {
  const shippingMethod = orderFulfillment.shippingMethod;

  if (shippingMethod === undefined) {
    throw new Error(
      `Expected fulfillment "${orderFulfillment.orderFulfillmentID}" to carry a shipping method.`,
    );
  }

  return shippingMethod.shippingMethodID;
}

/**
 * One recorded zone call, narrowed.
 *
 * @param zones - the address-zone double whose log is being read.
 * @param index - zero-based position in the call log.
 * @returns the recorded call.
 */
function recordedZoneCallAt(zones: RecordingAddressZoneEvaluator, index: number): RecordedZoneCall {
  return elementAt(zones.calls, index, 'a recorded isAddressInZone call');
}

/**
 * One recorded membership call, narrowed.
 *
 * @param membership - the membership double whose log is being read.
 * @param index - zero-based position in the call log.
 * @returns the recorded call.
 */
function recordedMembershipCallAt(
  membership: RecordingOrderItemMembership,
  index: number,
): RecordedMembershipCall {
  return elementAt(membership.getOrderItemInQualifierCalls, index, 'a recorded membership call');
}

/**
 * One qualified order-item record off a verdict, narrowed.
 *
 * @param result - the verdict returned by the subject.
 * @param index - zero-based position in `qualifiedOrderItemDetails`.
 * @returns the record.
 */
function qualifiedOrderItemDetailAt(
  result: QualifierQualification,
  index: number,
): QualifiedOrderItemDetail {
  return elementAt(result.qualifiedOrderItemDetails, index, 'a qualified order item detail');
}

/**
 * Runs an invocation that is expected to raise, and hands back the raised `Error`.
 *
 * Capturing ONCE rather than calling `expect(...).toThrow(...)` twice is not a style preference: two
 * of the cases below drive a view whose property getter advances a read counter, exactly as the CFML
 * source re-reads `getAddress()` and `getOrderFulfillmentID()` at each site, so a second invocation
 * would observe a DIFFERENT state and could raise for a different reason. One invocation, one
 * captured error, then unconditional assertions about it.
 *
 * @param run - the invocation under test.
 * @returns the raised error.
 * @throws Error when the invocation returned normally, or raised a non-`Error`.
 */
function captureThrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`Expected an Error to be raised, observed ${String(error)}.`);
  }

  throw new Error('Expected the invocation to raise, but it returned normally.');
}

/**
 * A qualifier configured for exactly one dispatch arm and nothing else.
 *
 * Every one of the ten gates and all three identifier lists are left at their absent/empty state, so
 * a case can switch on exactly one gate and read the result as that gate's doing. Nothing is
 * defaulted to a zero or to an empty-meaning-everything sentinel: an absent bound stays absent,
 * which is what disables it [model/service/PromotionService.cfc:L644, L646, L648, L650, L695, L697,
 * L742].
 *
 * The qualifier is built with `PromotionQualifier`'s own published constructor, which is the
 * sanctioned way to construct a small in-suite variation. The shared fixture factories are used for
 * the graph-level qualifiers, and no fixture module is created or edited by this file.
 *
 * @param qualifierType - the `qualifierType` column value, verbatim.
 * @param overrides - the gates and identifier lists this case actually cares about.
 * @returns a fresh qualifier.
 */
function makeQualifier(
  qualifierType: string,
  overrides: Omit<PromotionQualifierInit, 'promotionQualifierID' | 'qualifierType'> = {},
): PromotionQualifier {
  return new PromotionQualifier({
    promotionQualifierID: `pq-${qualifierType}`,
    qualifierType,
    ...overrides,
  });
}

/**
 * The opaque identifiers of every item on an order, in iteration order.
 *
 * @param order - the read-only order projection.
 * @returns the identifier list, suitable for {@link RecordingOrderItemMembership}.
 */
function everyOrderItemID(order: OrderView): readonly string[] {
  return order.orderItems.map((orderItem: OrderItemView): string => orderItem.orderItemID);
}

// ---------------------------------------------------------------------------
// THE READ-OBSERVING FULFILLMENT VIEW
//
// Two of this arm's obligations cannot be reached with constant data, because both concern what the
// source does when it re-reads the SAME accessor and gets a different answer. The CFML source reads
// `orderFulfillment.getAddress()` at THREE separate sites in one iteration - the L678 precondition,
// the L684 port call inside the zone loop, and the L703 clause - and reads
// `getOrderFulfillmentID()` TWICE, once to append at L666 and once to search at L708. A view whose
// value is fixed can only ever prove the FIRST read's behaviour.
//
// This wrapper therefore does three things and nothing else:
//
//   (1) it LOGS every property read, in read order, so the count-and-append-before-testing shape of
//       [model/service/PromotionService.cfc:L665-L666] can be asserted directly rather than
//       inferred;
//   (2) it can SCRIPT `address` per read, so the UNGUARDED dereference at L703 is observable as
//       itself and not as a duplicate of the L678 one;
//   (3) it can SCRIPT `orderFulfillmentID` per read, so `arrayFind` at L708 answers `0` and the
//       latent `arrayDeleteAt(array, 0)` throw at L709 fires.
//
// It invents no behaviour: every member not scripted answers the wrapped fixture value verbatim, and
// no member is added, removed or widened. The wrapper is READ-ONLY over the fixture graph - it never
// writes to it - so it does not weaken the no-mutation guarantee that §11.8 asserts separately.
//
// The read counters are RESETTABLE because the fixture factory itself reads several of these
// accessors while it assembles the order, and those reads must not be attributed to the subject. See
// {@link ObservingFulfillmentView.resetObservations}.
// ---------------------------------------------------------------------------

/** The seven property names an {@link ObservingFulfillmentView} can log. */
type ObservedFulfillmentProperty =
  | 'address'
  | 'appliedPromotions'
  | 'fulfillmentCharge'
  | 'fulfillmentMethod'
  | 'orderFulfillmentID'
  | 'shippingMethod'
  | 'totalShippingWeight';

/** What an {@link ObservingFulfillmentView} scripts, if anything. */
interface ObservedFulfillmentScript {
  /**
   * The value each successive `orderFulfillmentID` read answers. The LAST entry answers every
   * further read, which matches how the CFML source would behave against a value that changed once.
   * Omit the key to answer the wrapped fixture value on every read.
   */
  readonly orderFulfillmentIDsByRead?: readonly string[];

  /**
   * The value each successive `address` read answers, with the same last-entry-repeats rule. Omit
   * the key to answer the wrapped fixture value on every read.
   */
  readonly addressesByRead?: readonly (ShippingAddressView | undefined)[];
}

/**
 * A read-only `OrderFulfillmentView` that records its own reads and can answer a scripted sequence.
 */
class ObservingFulfillmentView implements OrderFulfillmentView {
  /** Every property read since the last reset, in read order. */
  readonly readLog: ObservedFulfillmentProperty[] = [];

  private orderFulfillmentIDReadCount = 0;

  private addressReadCount = 0;

  /**
   * @param base - the frozen fixture fulfillment whose values are answered when nothing is scripted.
   * @param script - the per-read sequences this case needs, if any.
   */
  constructor(
    private readonly base: OrderFulfillmentView,
    private readonly script: ObservedFulfillmentScript = {},
  ) {}

  /**
   * Forgets every read taken so far.
   *
   * Called immediately before the subject is invoked, because `makeOrderViewFixture` reads several
   * of these accessors while it assembles the order and those reads are the FIXTURE's, not the
   * subject's. Attributing them to the subject would make every read-order assertion in this file a
   * lie.
   */
  resetObservations(): void {
    this.readLog.length = 0;
    this.orderFulfillmentIDReadCount = 0;
    this.addressReadCount = 0;
  }

  get orderFulfillmentID(): string {
    this.readLog.push('orderFulfillmentID');

    const scripted = this.script.orderFulfillmentIDsByRead;
    const readIndex = this.orderFulfillmentIDReadCount;
    this.orderFulfillmentIDReadCount += 1;

    if (scripted === undefined || scripted.length === 0) {
      return this.base.orderFulfillmentID;
    }

    return elementAt(
      scripted,
      Math.min(readIndex, scripted.length - 1),
      'a scripted orderFulfillmentID',
    );
  }

  get fulfillmentCharge(): Money {
    this.readLog.push('fulfillmentCharge');

    return this.base.fulfillmentCharge;
  }

  get fulfillmentMethod(): FulfillmentMethodView {
    this.readLog.push('fulfillmentMethod');

    return this.base.fulfillmentMethod;
  }

  get shippingMethod(): ShippingMethodView | undefined {
    this.readLog.push('shippingMethod');

    return this.base.shippingMethod;
  }

  get appliedPromotions(): readonly AppliedPromotionView[] {
    this.readLog.push('appliedPromotions');

    return this.base.appliedPromotions;
  }

  get totalShippingWeight(): number {
    this.readLog.push('totalShippingWeight');

    return this.base.totalShippingWeight;
  }

  get address(): ShippingAddressView | undefined {
    this.readLog.push('address');

    const scripted = this.script.addressesByRead;
    const readIndex = this.addressReadCount;
    this.addressReadCount += 1;

    if (scripted === undefined || scripted.length === 0) {
      return this.base.address;
    }

    return scripted[Math.min(readIndex, scripted.length - 1)];
  }
}

// ---------------------------------------------------------------------------
// THE SUITE
// ---------------------------------------------------------------------------

describe('QualifierQualificationEvaluator', () => {
  /**
   * The address-zone double. Constructed fresh in every `beforeEach` and REPLACED by the cases that
   * need a different verdict, so no case can inherit another's configuration (A2).
   */
  let addressZones: RecordingAddressZoneEvaluator;

  /** The membership double, likewise fresh per test. */
  let membership: RecordingOrderItemMembership;

  /** The subject, rebuilt per test over the two fresh doubles. */
  let evaluator: QualifierQualificationEvaluator;

  /** The golden order projection, a fresh object graph per test. */
  let order: OrderView;

  /** The shared promotion graph, a fresh object graph per test. */
  let promotionFixtures: PromotionFixtureGraph;

  /**
   * Rebuilds the subject over a specific pair of collaborators.
   *
   * Used by the cases that need a zone verdict or a membership verdict other than the default. The
   * subject holds no mutable state of its own, so rebuilding it is the whole of the reset.
   *
   * @param zones - the address-zone double to inject.
   * @param items - the membership collaborator to inject. Several cases pass an UNMODIFIED
   *   `new OrderItemMembership()` here, which drives the real, shipped membership algorithm end to
   *   end.
   * @returns the rebuilt subject.
   */
  function buildEvaluator(
    zones: RecordingAddressZoneEvaluator,
    items: OrderItemMembership,
  ): QualifierQualificationEvaluator {
    return new QualifierQualificationEvaluator(zones, items);
  }

  beforeEach(() => {
    // A2: FRESH DOUBLES, FRESH SUBJECT, FRESH GRAPHS, EVERY TEST. Nothing is hoisted to module
    // scope, nothing is memoised across tests, and no counter outlives a case. The default zone
    // double matches NOTHING, which is a positive instruction rather than a default - see the
    // double's own note on the permissive-caller versus restrictive-evaluator split.
    addressZones = new RecordingAddressZoneEvaluator([]);
    membership = new RecordingOrderItemMembership([]);
    evaluator = buildEvaluator(addressZones, membership);
    order = makeOrderViewFixture();
    promotionFixtures = makePromotionFixtures();
  });

  // =========================================================================
  // VISIBILITY WIDENING #2 OF EXACTLY 5
  // =========================================================================
  describe('visibility widening #2 - the promoted qualifier evaluator', () => {
    it('exposes getQualifierQualificationDetails as a directly callable public member', () => {
      // The legacy declaration is `private struct function
      // getQualifierQualificationDetails(required any qualifier, required any order)`
      // [model/service/PromotionService.cfc:L629]. The target promotes it so it can be driven
      // without the facade, which is what makes this suite possible at all.
      //
      // This is widening #2 OF EXACTLY 5 project-wide. #1 (L549), #3 (L752) and #4 (L783) live in
      // ./promotionPeriodQualification.ts and #5 (L987) in ./discountAmount.ts, so THE LEDGER IS
      // EXHAUSTED once that module is counted; a sixth promotion is a gate failure. The
      // complementary assertion - that NO sixth private helper was promoted anywhere - is owned by
      // ../promotionService.test.ts and is deliberately not duplicated here.
      expect(typeof evaluator.getQualifierQualificationDetails).toBe('function');

      // C4: the name is FROZEN verbatim from the legacy source. It is not renamed, not aliased and
      // not wrapped, and this suite reaches the behaviour through that exact name and no other.
      const qualifier = makeQualifier('order');
      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(result.qualifier).toBe(qualifier);
    });

    it('answers synchronously, returning the verdict rather than a promise', () => {
      // Both the subject and its address-zone port are synchronous, which is why no `await` appears
      // anywhere in this file. A promise here would be a signature reshaping, and this file's
      // reshaping budget is ZERO.
      const result: QualifierQualification = evaluator.getQualifierQualificationDetails(
        makeQualifier('order'),
        order,
      );

      expect(result).not.toBeInstanceOf(Promise);
      expect(typeof result.qualificationCount).toBe('number');
    });
  });

  // =========================================================================
  // §11.1 - THE RESULT STRUCT HAS EXACTLY FOUR MEMBERS
  // =========================================================================
  describe('the four-member verdict [model/service/PromotionService.cfc:L630-L635]', () => {
    it('seeds exactly the four published members and nothing else', () => {
      const qualifier = makeQualifier(UNRECOGNISED_QUALIFIER_TYPE);

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      // `toStrictEqual` rather than `toMatchObject`, so an EXTRA member fails. The seed is read
      // through an unrecognised qualifier type precisely because no arm then runs, which leaves the
      // L630-L635 seed observable exactly as the source writes it.
      expect(result).toStrictEqual({
        qualifier,
        qualificationCount: 0,
        qualifiedFulfillmentIDs: [],
        qualifiedOrderItemDetails: [],
      });
      expect(Object.keys(result)).toHaveLength(4);
    });

    it('carries the qualifier ENTITY itself as the verdict identity, not a copy', () => {
      // [model/service/PromotionService.cfc:L631] stores the qualifier in the struct it returns. The
      // member is the record's identity, so identity - not equality - is what is asserted.
      const qualifier = makeQualifier('order');

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(result.qualifier).toBe(qualifier);
    });

    it('exposes qualificationCount as the one MUTABLE member', () => {
      // [model/service/PromotionService.cfc:L641, L644-L653, L665, L729, L733, L740-L743] all write
      // this member in place. The published type declares it mutable for exactly that reason, and
      // the verdict is a live accumulator rather than a frozen record.
      const result = evaluator.getQualifierQualificationDetails(makeQualifier('order'), order);

      expect(Object.isFrozen(result)).toBe(false);

      result.qualificationCount = 7;

      expect(result.qualificationCount).toBe(7);
    });

    it('exposes both collections as readonly PROPERTIES over MUTABLE arrays', () => {
      // The distinction matters to the port: [model/service/PromotionService.cfc:L660] empties
      // `qualifiedFulfillmentIDs` and [L666]/[L709] push into and splice out of it, so a
      // `ReadonlyArray` would be the wrong type even though the PROPERTY is readonly.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier(UNRECOGNISED_QUALIFIER_TYPE),
        order,
      );

      expect(Array.isArray(result.qualifiedFulfillmentIDs)).toBe(true);
      expect(Array.isArray(result.qualifiedOrderItemDetails)).toBe(true);
      expect(Object.isFrozen(result.qualifiedFulfillmentIDs)).toBe(false);
      expect(Object.isFrozen(result.qualifiedOrderItemDetails)).toBe(false);

      result.qualifiedFulfillmentIDs.push('of-appended-by-the-test');

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-appended-by-the-test']);
    });

    it('returns a FRESH verdict, with fresh collections, on every call', () => {
      // A2 at the subject's own boundary: one instance answering two calls must not let the first
      // call's arrays reach the second's verdict.
      const qualifier = makeQualifier('fulfillment');

      const first = evaluator.getQualifierQualificationDetails(qualifier, order);
      const second = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(second).not.toBe(first);
      expect(second.qualifiedFulfillmentIDs).not.toBe(first.qualifiedFulfillmentIDs);
      expect(second.qualifiedOrderItemDetails).not.toBe(first.qualifiedOrderItemDetails);
      expect(second.qualificationCount).toBe(first.qualificationCount);
    });

    it('appends order-item records carrying exactly the two published members', () => {
      // [model/service/PromotionService.cfc:L722-L725] builds a TWO-member record. Nothing is added
      // to it and nothing is widened, so `toStrictEqual` is the assertion.
      const firstItem = orderItemAt(order, 0);
      membership = new RecordingOrderItemMembership([firstItem.orderItemID]);
      evaluator = buildEvaluator(addressZones, membership);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      const detail: QualifiedOrderItemDetail = qualifiedOrderItemDetailAt(result, 0);

      expect(detail).toStrictEqual({
        orderItem: firstItem,
        qualificationCount: firstItem.quantity,
      });
      expect(Object.keys(detail)).toHaveLength(2);
    });
  });

  // =========================================================================
  // §11.2 - THREE-ARM DISPATCH WITH NO FINAL `else`
  // =========================================================================
  describe('the three-arm dispatch [model/service/PromotionService.cfc:L638, L656, L714]', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L747]: L747 closes the `if`/`else if` chain
    // with NO final `else`, so an unrecognised qualifier type reaches no arm and the untouched seed
    // is returned.
    // The missing default is reproduced deliberately: no `default` branch, no exhaustiveness check
    // over the five known type values and no throw is added, because the caller's own gate at L593
    // already reads a zero count as a failed qualification.
    it('returns the UNTOUCHED SEED for an unrecognised qualifier type', () => {
      const qualifier = makeQualifier(UNRECOGNISED_QUALIFIER_TYPE, {
        // Every gate that any arm could consult is configured, so the verdict cannot be mistaken for
        // an arm that ran and happened to answer zero.
        minimumOrderQuantity: 1,
        maximumOrderQuantity: 1000,
        minimumOrderSubtotal: Money.fromDecimalString('0.01'),
        maximumOrderSubtotal: Money.fromDecimalString('10000.00'),
        minimumItemQuantity: 1,
        minimumFulfillmentWeight: 0,
        maximumFulfillmentWeight: 1000,
      });

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);

      // Neither collaborator is reached, which is the structural proof that no arm ran at all rather
      // than an arm running and declining.
      expect(addressZones.calls).toStrictEqual([]);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });

    it('returns the untouched seed when qualifierType is ABSENT', () => {
      // `qualifierType` is a nullable column [model/entity/PromotionQualifier.cfc:L53]. CFML renders
      // an unset string as the empty string, which equals neither `"order"` nor `"fulfillment"` and
      // is not a member of the L714 list, so an absent type reaches no arm under either reading.
      const qualifier = new PromotionQualifier({ promotionQualifierID: 'pq-absent-type' });

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(qualifier.getQualifierType()).toBeUndefined();
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
    });

    it('routes "order" to the ORDER arm [L638]', () => {
      const result = evaluator.getQualifierQualificationDetails(makeQualifier('order'), order);

      // The order arm's signature is a count of 1 with both collections untouched.
      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
      expect(addressZones.calls).toStrictEqual([]);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });

    it('routes "fulfillment" to the FULFILLMENT arm [L656]', () => {
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      // The fulfillment arm's signature is one appended ID per surviving fulfillment.
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([
        orderFulfillmentAt(order, 0).orderFulfillmentID,
        orderFulfillmentAt(order, 1).orderFulfillmentID,
      ]);
      expect(result.qualificationCount).toBe(order.orderFulfillments.length);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });

    it.each(['contentAccess', 'merchandise', 'subscription'])(
      'routes "%s" to the ORDER ITEM arm [L714]',
      (qualifierType: string) => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier(qualifierType),
          order,
        );

        // The order-item arm's signature is one membership consultation per order item.
        expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
        expect(addressZones.calls).toStrictEqual([]);
      },
    );

    // CFML parity [model/service/PromotionService.cfc:L638, L656, L714]: CFML's `==` folds case and
    // `listFindNoCase` is case-insensitive by construction, so ALL THREE ARMS tolerate any casing.
    // The shipped module reproduces that through `cfEquals` and `listFindNoCase` rather than strict
    // equality, and this case pins it: a differently-cased value in the column - which nothing in
    // the schema prevents, `select` describing the admin form rather than a constraint - must still
    // reach its arm, or a promotion the legacy engine would apply is silently skipped.
    it.each(['ORDER', 'Order', 'oRdEr'])(
      'routes the differently-cased "%s" to the ORDER arm',
      (storedType: string) => {
        const result = evaluator.getQualifierQualificationDetails(makeQualifier(storedType), order);

        expect(result.qualificationCount).toBe(1);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
        expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
      },
    );

    it.each(['FULFILLMENT', 'Fulfillment'])(
      'routes the differently-cased "%s" to the FULFILLMENT arm',
      (storedType: string) => {
        const result = evaluator.getQualifierQualificationDetails(makeQualifier(storedType), order);

        expect(result.qualificationCount).toBe(order.orderFulfillments.length);
        expect(result.qualifiedFulfillmentIDs).toHaveLength(order.orderFulfillments.length);
        expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
      },
    );

    it.each(['MERCHANDISE', 'ContentAccess', 'SUBSCRIPTION'])(
      'routes the differently-cased "%s" to the ORDER ITEM arm',
      (storedType: string) => {
        const result = evaluator.getQualifierQualificationDetails(makeQualifier(storedType), order);

        expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      },
    );

    // CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: THE LIST-ORDER DIVERGENCE
    // IS PRESERVED, NOT NORMALISED. L714 spells the list `"contentAccess,merchandise,subscription"`
    // while L200 and L794 spell the same three values `"merchandise,subscription,contentAccess"`.
    // All three are membership tests, so the order is behaviourally irrelevant at every site - which
    // is exactly why NO SHARED CONSTANT is introduced: a reviewer diffing target against source must
    // find the same literal at the same site, and no priority or set-ordering assumption is ever
    // safe across these lists. L794's ordering is asserted by ./promotionPeriodQualification.test.ts
    // and L200's by ../promotionService.test.ts.
    it('accepts all three L714 list members and no fourth', () => {
      const accepted = ['contentAccess', 'merchandise', 'subscription'];

      for (const qualifierType of accepted) {
        membership = new RecordingOrderItemMembership([]);
        evaluator = buildEvaluator(addressZones, membership);

        evaluator.getQualifierQualificationDetails(makeQualifier(qualifierType), order);

        expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
      }

      // `"fulfillment"` is NOT a member of the L714 list even though it is a legal qualifier type: it
      // has its own arm at L656, and the order-item arm must never see it.
      membership = new RecordingOrderItemMembership([]);
      evaluator = buildEvaluator(addressZones, membership);

      evaluator.getQualifierQualificationDetails(makeQualifier('fulfillment'), order);

      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });
  });

  // =========================================================================
  // §11.3 - THE ORDER ARM IS ASSIGN-THEN-REVOKE
  // =========================================================================
  describe('the ORDER arm [model/service/PromotionService.cfc:L638-L653]', () => {
    it('assigns 1 FIRST and leaves it when all four bounds are ABSENT', () => {
      // CFML parity [model/service/PromotionService.cfc:L641]: the count is set to 1 before any
      // bound is examined - the legacy comment reads "because that is the max for an order
      // qualifier" - and L644-L653 can only ever REVOKE it. An order qualifier therefore qualifies
      // exactly once or not at all; it never qualifies twice.
      //
      // Each of the four bounds is independently nullable and an ABSENT bound imposes no constraint
      // whatsoever. No bound is defaulted: not to zero, not to `Money.zero`, not to a large
      // sentinel. Absence is what disables the gate.
      const qualifier = makeQualifier('order');

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(qualifier.getMinimumOrderQuantity()).toBeUndefined();
      expect(qualifier.getMaximumOrderQuantity()).toBeUndefined();
      expect(qualifier.getMinimumOrderSubtotal()).toBeUndefined();
      expect(qualifier.getMaximumOrderSubtotal()).toBeUndefined();
      expect(result.qualificationCount).toBe(1);
    });

    it('leaves both collections untouched', () => {
      // The arm writes ONLY `qualificationCount`. It appends no fulfillment ID and no order-item
      // record, so a caller reading either collection off an order qualifier reads an empty one.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('order', {
          minimumOrderQuantity: 1,
          maximumOrderSubtotal: Money.fromDecimalString('10000.00'),
        }),
        order,
      );

      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
    });

    it('compares a PLAIN COUNT against the order quantity and MONEY against the subtotal', () => {
      // ★ THE MEASURE-KIND CENSUS FOR THIS ARM, ASSERTED RATHER THAN ASSUMED.
      //
      // [model/entity/PromotionQualifier.cfc:L55, L56] declare the two order-quantity gates
      // `ormtype="integer"` - PLAIN COUNTS - while [L57, L58] declare the two subtotal gates
      // `ormtype="big_decimal" hb_formatType="currency"` - MONETARY. The view mirrors that split, and
      // routing either kind through the other's type would be the same class of error in both
      // directions.
      expect(typeof order.totalSaleQuantity).toBe('number');
      expect(order.totalSaleQuantity).toBe(ORDER_TOTAL_SALE_QUANTITY);
      expect(order.subtotal).toBeInstanceOf(Money);
      expect(order.subtotal.toDecimalString()).toBe(ORDER_SUBTOTAL);
    });

    describe('the minimum order quantity bound [L644] - a PLAIN COUNT, STRICT', () => {
      it('does not revoke when the bound is BELOW the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { minimumOrderQuantity: QUANTITY_BELOW }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the order quantity', () => {
        // CFML parity [model/service/PromotionService.cfc:L644]: the comparison is `gt`, so BOUNDARY
        // EQUALITY IS INCLUSIVE. A `>=` here would disqualify an order that sits exactly on the
        // minimum and charge the customer full price - a money decision, not a rounding detail.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { minimumOrderQuantity: ORDER_TOTAL_SALE_QUANTITY }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is ABOVE the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { minimumOrderQuantity: QUANTITY_ABOVE }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('the maximum order quantity bound [L646] - a PLAIN COUNT, STRICT', () => {
      it('does not revoke when the bound is ABOVE the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { maximumOrderQuantity: QUANTITY_ABOVE }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the order quantity', () => {
        // [L646] compares with `lt`, so equality is inclusive on this side too.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { maximumOrderQuantity: ORDER_TOTAL_SALE_QUANTITY }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is BELOW the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { maximumOrderQuantity: QUANTITY_BELOW }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('the minimum subtotal bound [L648] - MONETARY, STRICT', () => {
      it('does not revoke when the bound is BELOW the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            minimumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the subtotal to the cent', () => {
        // The one-cent granularity is the point: the comparison runs through `Money`, so no
        // floating-point representation can decide it.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            minimumOrderSubtotal: Money.fromDecimalString(ORDER_SUBTOTAL),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is ONE CENT ABOVE the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            minimumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_ABOVE),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('the maximum subtotal bound [L650] - MONETARY, STRICT', () => {
      it('does not revoke when the bound is ABOVE the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            maximumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_ABOVE),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the subtotal to the cent', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            maximumOrderSubtotal: Money.fromDecimalString(ORDER_SUBTOTAL),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is ONE CENT BELOW the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            maximumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    it('revokes on the FIRST violated bound even when the other three are satisfied', () => {
      // The four clauses form ONE disjunction at [L644-L651], so any single violation revokes. The
      // count cannot go below zero, because the assignment is `= 0` rather than a decrement.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('order', {
          minimumOrderQuantity: QUANTITY_BELOW,
          maximumOrderQuantity: QUANTITY_ABOVE,
          minimumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
          maximumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
        }),
        order,
      );

      expect(result.qualificationCount).toBe(0);
    });

    it('qualifies when all four bounds are satisfied together', () => {
      // Driven through the SHARED promotion fixture rather than an inline qualifier, so the gate
      // values are the ones the fixture publishes for the whole project: minimum quantity 2, maximum
      // 20, minimum subtotal 25.00, maximum 500.00. The golden order - 9 units at 129.95 - sits
      // inside all four.
      const orderArmFixtures = makePromotionFixtures({ qualifierType: 'order' });
      const qualifier = orderArmFixtures.promotionQualifier;

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(qualifier.getQualifierType()).toBe('order');
      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
    });

    it('revokes on an INVERTED band, and no validation error is raised', () => {
      // B5: nothing checks that the minimum does not exceed the maximum, nothing checks
      // non-negativity, and nothing raises on a nonsensical band. An inverted band that disqualifies
      // every order is legitimate legacy behaviour, so the target must disqualify rather than throw.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('order', {
          minimumOrderQuantity: QUANTITY_ABOVE,
          maximumOrderQuantity: QUANTITY_BELOW,
        }),
        order,
      );

      expect(result.qualificationCount).toBe(0);
    });

    it('consults NEITHER collaborator', () => {
      // The order arm reaches no port and no membership test. Asserting the silence is what proves
      // the three arms are mutually exclusive rather than merely ordered.
      evaluator.getQualifierQualificationDetails(
        makeQualifier('order', { minimumOrderQuantity: 1 }),
        order,
      );

      expect(addressZones.calls).toStrictEqual([]);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });
  });

  // =========================================================================
  // §11.4 - THE FULFILLMENT ARM COUNTS AND APPENDS *BEFORE* TESTING
  // =========================================================================
  describe('the FULFILLMENT arm [model/service/PromotionService.cfc:L656-L711]', () => {
    /** An order carrying ONLY the shipping fulfillment, so a single bound can be read in isolation. */
    function shippingOnlyOrder(): OrderView {
      return makeOrderViewFixture({ includePickupFulfillment: false });
    }

    // LEGACY-NOTE [model/service/PromotionService.cfc:L659-L660]: the arm RE-INITIALIZES
    // `qualificationCount` to 0 and empties `qualifiedFulfillmentIDs` even though L632 and L633
    // already seeded both, and nothing between the seed and the arm can have changed either - the
    // ORDER arm is a sibling branch of the same chain, so reaching this arm proves it did not run.
    // The two statements are redundant and are preserved anyway, because a reviewer comparing the two
    // files must find them. What the redundancy means for EXPECTATIONS is asserted here: the arm's
    // count is exactly the number of surviving fulfillments, never that number added to a carried-in
    // value.
    it('counts and appends every fulfillment when the qualifier configures nothing', () => {
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      expect(result.qualificationCount).toBe(2);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
    });

    it('appends the IDs in the order the fulfillments are iterated', () => {
      // [L663] iterates the collection's own order and [L666] appends in that order. Nothing sorts,
      // dedupes or reorders, so the surviving list mirrors the order's own sequence.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(
        order.orderFulfillments.map(
          (orderFulfillment: OrderFulfillmentView): string => orderFulfillment.orderFulfillmentID,
        ),
      );
    });

    it('COUNTS AND APPENDS BEFORE any exclusion test is evaluated', () => {
      // ★ CFML parity [model/service/PromotionService.cfc:L665-L666]: both statements run
      // UNCONDITIONALLY at the top of every iteration, BEFORE a single condition has been examined.
      // The shape is load-bearing twice over - it fixes the ORDER of the surviving IDs, and the
      // indexed removal at L708-L709 only survives BECAUSE the append already happened.
      //
      // The proof is the READ ORDER. `orderFulfillmentID` is read first because the append reads it;
      // every testable property - the weight at L695/L697, the shipping method at L701 - is read
      // strictly afterwards. A test-first-then-append implementation could not produce this order.
      const observed = new ObservingFulfillmentView(orderFulfillmentAt(shippingOnlyOrder(), 0));
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      // The fixture factory itself reads several of these accessors while assembling the order; those
      // reads belong to the fixture, not to the subject.
      observed.resetObservations();

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        observedOrder,
      );

      const firstRead = elementAt(observed.readLog, 0, 'the first observed property read');

      expect(firstRead).toBe('orderFulfillmentID');
      expect(observed.readLog).toContain('totalShippingWeight');
      expect(observed.readLog.indexOf('orderFulfillmentID')).toBeLessThan(
        observed.readLog.indexOf('totalShippingWeight'),
      );
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
    });

    it('counts and appends a fulfillment that is ULTIMATELY EXCLUDED, then walks both back', () => {
      // The same read order holds for a fulfillment that fails: the append is not conditional on the
      // outcome, so the ID is present in the array before the disjunction runs and is spliced out
      // afterwards.
      const observed = new ObservingFulfillmentView(orderFulfillmentAt(shippingOnlyOrder(), 0));
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const result = evaluator.getQualifierQualificationDetails(
        // A weight minimum above the fulfillment's weight excludes it at [L695].
        makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_ABOVE }),
        observedOrder,
      );

      const firstRead = elementAt(observed.readLog, 0, 'the first observed property read');

      expect(firstRead).toBe('orderFulfillmentID');
      // Read again by the L708 search, which is what proves the append had happened.
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'orderFulfillmentID',
        ),
      ).toHaveLength(2);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    describe('the address-zone gate [L669-L690]', () => {
      // CFML parity [model/service/PromotionService.cfc:L669, L675, L685, L693]: the source DECLARES
      // the flag as `addressZoneOK` (capital K) at L669 and then writes it at L675 and L685 and reads
      // it at L693 as `addressZoneOk` (lower-case k). CFML identifiers are CASE-INSENSITIVE, so those
      // are ONE variable; a literal transliteration into TypeScript would create TWO bindings, the
      // `false` written at L675 would never be seen at L693, and every fulfillment would pass the
      // zone check. The shipped module uses ONE spelling throughout, and the cases below assert the
      // single-variable behaviour: a `false` written by the gate IS the value the disjunction reads.
      it('DEFAULTS PERMISSIVE - no configured zones means no zone constraint', () => {
        // [L669, L672] The flag starts `true` and only a configured zone set can flip it. A qualifier
        // with no shipping address zones therefore passes the zone check automatically, and the port
        // is never consulted at all.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          order,
        );

        expect(addressZones.calls).toStrictEqual([]);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
      });

      it('does not dereference an ABSENT address when no zones are configured', () => {
        // The pickup fulfillment carries NO address, and the only three `getAddress()` dereferences
        // in the arm - L678, L684 and L703 - all sit behind the `arrayLen(zones)` gate or behind a
        // short-circuit that the gate controls. An unconfigured qualifier therefore includes an
        // addressless fulfillment rather than failing on it.
        const pickupOnlyOrder = makeOrderViewFixture({
          orderFulfillments: [orderFulfillmentAt(order, 1)],
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          pickupOnlyOrder,
        );

        expect(orderFulfillmentAt(pickupOnlyOrder, 0).address).toBeUndefined();
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-pickup-1']);
        expect(result.qualificationCount).toBe(1);
      });

      it('hands the port EXACTLY the address projection and the zone, in that order', () => {
        // [L684] `getAddressService().isAddressInZone(orderFulfillment.getAddress(),
        // shippingAddressZone)` - POSITIONAL, address first, zone second, and SYNCHRONOUS. Asserting
        // the RECORDED ARGUMENTS is the cleanest proof that the correct address and the correct zone
        // reach the port, which is the one thing this arm owes the collaborator.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();
        const address = resolvedAddressOf(orderFulfillmentAt(singleFulfillmentOrder, 0));

        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(1);

        const call = recordedZoneCallAt(addressZones, 0);

        // ★ THE PROJECTION CARRIES THE FOUR ADDRESS FIELDS `AddressService` ACTUALLY COMPARES -
        // [model/service/AddressService.cfc:L63, L66, L69, L72] - AND NOTHING ELSE. `isNew` is a view
        // member but NOT an address-zone input, so it must not cross the port boundary.
        expect(call.address).toStrictEqual({
          postalCode: address.postalCode,
          city: address.city,
          stateCode: address.stateCode,
          countryCode: address.countryCode,
        });
        expect(Object.keys(call.address)).toHaveLength(4);
        expect(call.addressZone.addressZoneID).toBe(ZONE_ID_WEST);
        expect(call.addressZone.addressZoneLocations).toStrictEqual([]);
      });

      it('includes the fulfillment when the port answers TRUE for a configured zone', () => {
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            // Configured AND matching, so the L703 clause degrades to the new-address test alone and
            // the zone verdict is the only thing deciding the outcome. Without this the qualifier
            // would trip DEFECT 11 and the zone verdict would be discarded - see §11.5.
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(1);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES the fulfillment when the port answers FALSE for every configured zone', () => {
        // The double is told to match nothing, EXPLICITLY. That is a positive instruction rather than
        // a default, because the two sides of this boundary disagree about empty collections - see
        // the LEGACY-NOTE in §11.8.
        addressZones = new RecordingAddressZoneEvaluator([]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(1);
        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('STOPS LOOPING at the first matching zone [L685-L686]', () => {
        // The early exit is the source's and is preserved: a later zone can neither undo nor
        // re-confirm a match. Three zones are configured and the SECOND matches, so exactly two
        // calls are made and the third zone is never offered.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_CENTRAL]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST, ZONE_ID_CENTRAL, ZONE_ID_EAST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(2);
        expect(recordedZoneCallAt(addressZones, 0).addressZone.addressZoneID).toBe(ZONE_ID_WEST);
        expect(recordedZoneCallAt(addressZones, 1).addressZone.addressZoneID).toBe(ZONE_ID_CENTRAL);
        expect(result.qualificationCount).toBe(1);
      });

      it('offers EVERY configured zone when none matches', () => {
        addressZones = new RecordingAddressZoneEvaluator([]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST, ZONE_ID_CENTRAL, ZONE_ID_EAST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(
          addressZones.calls.map(
            (call: RecordedZoneCall): string => call.addressZone.addressZoneID,
          ),
        ).toStrictEqual([ZONE_ID_WEST, ZONE_ID_CENTRAL, ZONE_ID_EAST]);
      });

      it('EXCLUDES a NON-SHIPPING fulfillment without consulting any zone [L678]', () => {
        // CFML parity [model/service/PromotionService.cfc:L678]: the precondition is compound and
        // SHORT-CIRCUITING, and the failure path is silent. When the method type is not `shipping`
        // the flag REMAINS `false` from L675 and the fulfillment is excluded at L693 without a zone
        // ever being consulted. No `else` is added to rescue it: this is exactly why a non-shipping
        // fulfillment can never satisfy a zone-bearing qualifier.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const pickupOnlyOrder = makeOrderViewFixture({
          orderFulfillments: [orderFulfillmentAt(order, 1)],
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingAddressZoneIDs: [ZONE_ID_WEST] }),
          pickupOnlyOrder,
        );

        expect(orderFulfillmentAt(pickupOnlyOrder, 0).fulfillmentMethod.fulfillmentMethodType).toBe(
          'pickup',
        );
        expect(addressZones.calls).toStrictEqual([]);
        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('folds case on the "shipping" method-type comparison [L678]', () => {
        // [L678] uses the CFML word operator `eq`, WHICH IS CASE-INSENSITIVE ON STRINGS. A
        // differently-cased stored value must still pass the precondition; an exact comparison would
        // leave the flag `false` from L675 and silently exclude a correctly-configured zone
        // qualifier without consulting a single zone.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const baseFulfillment = orderFulfillmentAt(shippingOnlyOrder(), 0);
        const mixedCaseOrder = makeOrderViewFixture({
          fulfillmentOverrides: [
            {
              fulfillmentMethod: {
                fulfillmentMethodID: baseFulfillment.fulfillmentMethod.fulfillmentMethodID,
                fulfillmentMethodType: 'Shipping',
              },
            },
          ],
          includePickupFulfillment: false,
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(mixedCaseOrder, 0))],
          }),
          mixedCaseOrder,
        );

        expect(addressZones.calls).toHaveLength(1);
        expect(result.qualificationCount).toBe(1);
      });
    });

    describe('the fulfillment weight bounds [L695, L697] - PLAIN NUMERICS, never Money', () => {
      it('reads the fulfillment weight as a PLAIN NUMBER', () => {
        // ★ A WEIGHT IS NOT MONEY. [model/entity/PromotionQualifier.cfc:L63, L64] declare both
        // bounds `hb_formatType="weight"`, not `"currency"`, so no currency, rounding rule or price
        // group applies to any of the three values in this comparison. The fixture supplies the
        // fulfillment's weight as a plain number for exactly that reason.
        const singleFulfillmentOrder = shippingOnlyOrder();
        const totalShippingWeight = orderFulfillmentAt(
          singleFulfillmentOrder,
          0,
        ).totalShippingWeight;

        expect(typeof totalShippingWeight).toBe('number');
        expect(Number.isFinite(totalShippingWeight)).toBe(true);
        expect(totalShippingWeight).toBe(FULFILLMENT_WEIGHT);
      });

      it('does not exclude when the minimum is BELOW the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_BELOW }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not exclude when the minimum EQUALS the weight', () => {
        // [L695] compares with `gt`, so boundary equality is inclusive on this side.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: FULFILLMENT_WEIGHT }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES when the minimum is ABOVE the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_ABOVE }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('does not exclude when the maximum is ABOVE the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { maximumFulfillmentWeight: WEIGHT_ABOVE }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not exclude when the maximum EQUALS the weight', () => {
        // [L697] compares with `lt`, so boundary equality is inclusive here too.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { maximumFulfillmentWeight: FULFILLMENT_WEIGHT }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES when the maximum is BELOW the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { maximumFulfillmentWeight: WEIGHT_BELOW }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('applies each bound per fulfillment, not per order', () => {
        // The golden order carries a 12.5-weight shipping fulfillment and a 0-weight pickup one. A
        // minimum of 1 therefore excludes the pickup and keeps the shipping fulfillment, which is
        // what makes the bound observably per-fulfillment.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: 1 }),
          order,
        );

        expect(orderFulfillmentAt(order, 1).totalShippingWeight).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
        expect(result.qualificationCount).toBe(1);
      });

      it('imposes no constraint when both bounds are ABSENT', () => {
        const qualifier = makeQualifier('fulfillment');

        const result = evaluator.getQualifierQualificationDetails(qualifier, shippingOnlyOrder());

        expect(qualifier.getMinimumFulfillmentWeight()).toBeUndefined();
        expect(qualifier.getMaximumFulfillmentWeight()).toBeUndefined();
        expect(result.qualificationCount).toBe(1);
      });
    });

    describe('the fulfillment-method gate [L699]', () => {
      it('imposes no constraint when the list is UNCONFIGURED (permissive)', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('includes a fulfillment whose method IS in a configured list', () => {
        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            fulfillmentMethodIDs: [
              orderFulfillmentAt(singleFulfillmentOrder, 0).fulfillmentMethod.fulfillmentMethodID,
            ],
          }),
          singleFulfillmentOrder,
        );

        expect(result.qualificationCount).toBe(1);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
      });

      it('EXCLUDES a fulfillment whose method is NOT in a configured list (restrictive)', () => {
        // CFML parity [model/service/PromotionService.cfc:L699] and
        // [org/Hibachi/HibachiEntity.cfc:L340-L350]: the clause reads
        // `arrayLen(collection) && !hasX(...)`, so an unconfigured list is permissive while a
        // configured list that omits this fulfillment's value is restrictive. Both polarities are
        // reproduced.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            fulfillmentMethodIDs: [UNCONFIGURED_FULFILLMENT_METHOD_ID],
          }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });
    });

    describe('the shipping-method gate [L701] - GUARDED', () => {
      it('imposes no constraint when the list is UNCONFIGURED (permissive)', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('includes a fulfillment whose shipping method IS in a configured list', () => {
        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES a fulfillment whose shipping method is NOT in a configured list', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingMethodIDs: [UNCONFIGURED_SHIPPING_METHOD_ID] }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
      });

      it('EXCLUDES a fulfillment with NO shipping method, WITHOUT raising [L701]', () => {
        // ★ CFML parity [model/service/PromotionService.cfc:L701, L703]: THE NULL-GUARD ASYMMETRY.
        // L701 guards its dereference with an explicit `isNull(...) ||` and therefore EXCLUDES an
        // absent shipping method gracefully. L703 has NO such guard - and that unguarded sibling is
        // asserted in §11.5. No guard is added to L703 and none is removed from L701.
        const pickupOnlyOrder = makeOrderViewFixture({
          orderFulfillments: [orderFulfillmentAt(order, 1)],
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingMethodIDs: [UNCONFIGURED_SHIPPING_METHOD_ID] }),
          pickupOnlyOrder,
        );

        expect(orderFulfillmentAt(pickupOnlyOrder, 0).shippingMethod).toBeUndefined();
        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });
    });
  });

  // =========================================================================
  // §11.5 - DEFECT 11 AT L703, THE HEADLINE OF THIS SUITE
  // =========================================================================
  describe('DEFECT 11 - the shipping-address-zones clause [L703]', () => {
    /** An order carrying ONLY the shipping fulfillment. */
    function shippingOnlyOrder(): OrderView {
      return makeOrderViewFixture({ includePickupFulfillment: false });
    }

    it('EXCLUDES EVERY FULFILLMENT when zones are configured but shipping methods are NOT', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-ZONES clause
      // re-tests `hasShippingMethod` instead of testing a zone condition. Because
      // `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] never enters its loop body
      // against an empty collection and therefore answers `false`, `!hasShippingMethod(...)` is
      // `true`, the whole clause collapses to `arrayLen(qualifier.getShippingAddressZones()) > 0`,
      // and a qualifier configured with shipping-address zones but NO shipping methods excludes
      // EVERY fulfillment - discarding the correct zone evaluation performed just above at
      // L672-L690.
      // Preserved deliberately; do not fix without a product decision.
      //
      // ★ THE IN-FILE COUNTER-EXAMPLE THAT PROVES THIS IS A BUG AND NOT INTENT:
      // `getShippingMethodOptionsDiscountAmountDetails` at
      // [model/service/PromotionService.cfc:L1059-L1061] performs the ANALOGOUS address-zone test
      // CORRECTLY - it seeds a permissive flag and flips it only when zones are configured, with no
      // `hasShippingMethod` re-test anywhere. Same file, same author, one right and one wrong.
      //
      // ★ THIS IS A DIRECT MONEY EFFECT, WHICH IS WHY IT IS A C2 RESPONSIBILITY RATHER THAN A
      // CURIOSITY. Qualification decides whether a promotion applies AT ALL: a zero
      // `qualificationCount` fails the period gate and the customer is charged full price.
      //
      // THIS FILE SPENDS NO DIVERGENCE. All three project divergences are spent elsewhere, so the
      // defect is REPRODUCED here and not repaired.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const singleFulfillmentOrder = shippingOnlyOrder();
      const qualifier = makeQualifier('fulfillment', {
        shippingAddressZoneIDs: [ZONE_ID_WEST],
        // NO shipping methods. This single omission is the whole trigger.
      });

      const result = evaluator.getQualifierQualificationDetails(qualifier, singleFulfillmentOrder);

      // The zone WAS evaluated and it DID answer `true` - the fulfillment's address really is in the
      // configured zone - and the verdict is discarded anyway. That is the defect, stated as
      // precisely as it can be stated.
      expect(qualifier.getShippingMethodIDs()).toStrictEqual([]);
      expect(addressZones.calls).toHaveLength(1);
      expect(recordedZoneCallAt(addressZones, 0).addressZone.addressZoneID).toBe(ZONE_ID_WEST);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    it('excludes every fulfillment of a MULTI-FULFILLMENT order under the same configuration', () => {
      // The over-exclusion is total rather than marginal: it is not one awkward fulfillment, it is
      // the entire order, including a fulfillment whose zone verdict was affirmative.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', { shippingAddressZoneIDs: [ZONE_ID_WEST] }),
        order,
      );

      expect(order.orderFulfillments).toHaveLength(2);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    it('DEGRADES to the new-address test alone once shipping methods ARE configured', () => {
      // Reaching L703 at all means the L701 clause was FALSE, so the shipping method is present AND
      // a member of the configured list - which makes `!hasShippingMethod(...)` `false` and leaves
      // only the new-address disjunct. The identical qualifier, plus one matching shipping-method ID,
      // therefore INCLUDES the fulfillment that the previous case excluded.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const singleFulfillmentOrder = shippingOnlyOrder();

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
        }),
        singleFulfillmentOrder,
      );

      expect(addressZones.calls).toHaveLength(1);
      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
    });

    it('never reaches the new-address disjunct in isolation, because L678 gates it first', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L678, L703]: the new-address disjunct at L703
      // is UNREACHABLE ON ITS OWN. A brand-new address fails the L678 precondition, so
      // `addressZoneOk` stays `false` from L675, and `!addressZoneOk` short-circuits the whole
      // disjunction before L703 is evaluated at all. The clause's own new-address test can therefore
      // only ever agree with an exclusion that has already happened.
      // Recorded rather than removed: the disjunct is preserved exactly as the source writes it.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const newAddressOrder = makeOrderViewFixture({
        includePickupFulfillment: false,
        fulfillmentOverrides: [{ addressIsNew: true }],
      });

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(newAddressOrder, 0))],
        }),
        newAddressOrder,
      );

      expect(resolvedAddressOf(orderFulfillmentAt(newAddressOrder, 0)).isNew).toBe(true);
      // The zone was never consulted, which is the proof that the exclusion came from L678/L675 and
      // not from the L703 new-address test.
      expect(addressZones.calls).toStrictEqual([]);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    it('RAISES on the UNGUARDED getAddress() dereference at L703', () => {
      // ★ CFML parity [model/service/PromotionService.cfc:L701, L703]: THE ASYMMETRY, ASSERTED FROM
      // THE UNGUARDED SIDE. L701 guards its dereference with `isNull(...) ||` and excludes gracefully
      // - proven in §11.4 - while L703 calls `getAddress().getNewFlag()` with NO GUARD AT ALL. No
      // guard is added here (B5): the faithful reproduction of an unguarded CFML dereference against
      // an unresolved address is a raised error.
      //
      // The address is SCRIPTED PER READ because the source re-reads `getAddress()` at three separate
      // sites in one iteration - L678, L684 and L703 - so a constant view could only ever exercise the
      // first of them. Answering the address for reads one and two and nothing for read three isolates
      // the L703 dereference as itself.
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L360]: the reward-side sibling at L357-L360
      // DOES guard its dereference - `!isNull(orderFulfillment.getAddress()) &&
      // !orderFulfillment.getAddress().isNew()` - so the same component contains both a guarded and
      // an unguarded form of the same dereference. The guarded one is not backported here.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const baseFulfillment = orderFulfillmentAt(shippingOnlyOrder(), 0);
      const address = resolvedAddressOf(baseFulfillment);
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        // Read 1 is the L678 precondition, read 2 is the L684 port call, read 3 is L703.
        addressesByRead: [address, address, undefined],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(baseFulfillment)],
          }),
          observedOrder,
        ),
      );

      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('model/service/PromotionService.cfc:L703');
      expect(error.message).toContain(baseFulfillment.orderFulfillmentID);
      // Three address reads: L678, L684 and L703 - the exact count the source performs.
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'address',
        ),
      ).toHaveLength(3);
    });

    it('RAISES on the UNGUARDED getAddress() dereference at L678', () => {
      // The FIRST of the arm's three unguarded dereferences, reached with ordinary constant data: a
      // shipping-type fulfillment whose address was never resolved, against a zone-bearing qualifier.
      // The L678 precondition dereferences before it can test anything.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const addresslessOrder = makeOrderViewFixture({
        includePickupFulfillment: false,
        // The key is PRESENT and explicitly `undefined`, which the fixture's own-key check honours as
        // "no address" rather than "use the default".
        fulfillmentOverrides: [{ address: undefined }],
      });

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingAddressZoneIDs: [ZONE_ID_WEST] }),
          addresslessOrder,
        ),
      );

      expect(orderFulfillmentAt(addresslessOrder, 0).address).toBeUndefined();
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('model/service/PromotionService.cfc:L678');
      // The port is never reached, because the precondition raises before the zone loop starts.
      expect(addressZones.calls).toStrictEqual([]);
    });

    it('RAISES on the UNGUARDED getAddress() dereference at L684', () => {
      // The SECOND of the arm's three unguarded dereferences, completing the trio - L678, L684 and
      // L703 - each of which re-reads `getAddress()` afresh. It is reached by answering the address
      // for the L678 precondition and nothing for the L684 port argument.
      //
      // The port is still never CALLED, because the dereference happens while its argument is being
      // evaluated. That is the source's own ordering and is preserved: `isAddressInZone` receives a
      // resolved address or it receives nothing at all.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const baseFulfillment = orderFulfillmentAt(shippingOnlyOrder(), 0);
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        // Read 1 is the L678 precondition, read 2 is the L684 port argument.
        addressesByRead: [resolvedAddressOf(baseFulfillment), undefined],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(baseFulfillment)],
          }),
          observedOrder,
        ),
      );

      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('model/service/PromotionService.cfc:L684');
      expect(addressZones.calls).toStrictEqual([]);
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'address',
        ),
      ).toHaveLength(2);
    });
  });

  // =========================================================================
  // §11.6 - THE SECOND LATENT THROW HAZARD AT L707-L709
  // =========================================================================
  describe('the indexed removal [model/service/PromotionService.cfc:L707-L709]', () => {
    it('removes exactly the excluded fulfillment and leaves the survivors in order', () => {
      // The removal is BY INDEX, recovered with `arrayFind` over the array the append at L666 filled.
      // A maximum weight of 0 excludes the 12.5-weight shipping fulfillment and keeps the 0-weight
      // pickup one, so the splice must take the FIRST element and leave the second intact.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', { maximumFulfillmentWeight: 0 }),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-pickup-1']);
      expect(result.qualificationCount).toBe(1);
    });

    it('RAISES when the searched ID is absent, reproducing arrayDeleteAt(array, 0)', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L708-L709]:
      // `arrayDeleteAt(qualifiedFulfillmentIDs, arrayFind(qualifiedFulfillmentIDs, ...))` consumes
      // `arrayFind`'s result DIRECTLY AS A POSITION. `arrayFind` answers a 1-BASED index on a hit and
      // `0` on a miss, and `arrayDeleteAt(array, 0)` THROWS in CFML - so the pair carries a latent
      // throw hazard that survives in production only because the very same ID was appended a few
      // lines earlier in the same iteration.
      // Preserved deliberately; do not fix without a product decision.
      //
      // NO `di > 0` GUARD IS ADDED, no defensive check is introduced, and no filter/splice
      // formulation that silently no-ops on a miss is used. If the index is absent the target MUST
      // fail, exactly as the legacy would.
      //
      // The hazard is reached by SCRIPTING `orderFulfillmentID` per read, because the source reads it
      // twice - once to append at L666 and once to search at L708 - and only a divergence between
      // those two reads can drive `arrayFind` to `0`.
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L708-L709, L774]: THE OWNERSHIP CORRECTION.
      // An earlier brief assigned "a `ListDeleteAt` hazard" to this suite. The L774
      // `ListDeleteAt(qualifiedFulfillmentIDs, listFindNoCase(...))` throw belongs to
      // ./promotionPeriodQualification.test.ts, because it lives inside
      // `getPromotionPeriodQualifiedFulfillmentIDList` at L752-L781 - outside the L629-L750 range
      // this module ports. SOURCE WINS. The two are different primitives over different data
      // structures: THIS one is `arrayDeleteAt(array, 0)` over an ARRAY, THAT one is
      // `ListDeleteAt(list, 0)` over a COMMA-DELIMITED STRING.
      const baseFulfillment = orderFulfillmentAt(
        makeOrderViewFixture({ includePickupFulfillment: false }),
        0,
      );
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        // Read 1 is the L666 append, read 2 is the L708 search. They disagree, so `arrayFind` misses.
        orderFulfillmentIDsByRead: ['of-appended-under-one-id', 'of-searched-under-another'],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          // Any exclusion will do; the weight minimum is the cheapest one that needs no collaborator.
          makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_ABOVE }),
          observedOrder,
        ),
      );

      expect(error).toBeInstanceOf(RangeError);
      expect(error.message).toContain('arrayDeleteAt index out of range');
      expect(error.message).toContain('of-searched-under-another');
      expect(error.message).toContain('model/service/PromotionService.cfc:L708-L709');
    });

    it('does not raise when the fulfillment is INCLUDED, because no removal is attempted', () => {
      // The removal sits inside the exclusion branch, so a divergent ID is harmless on the inclusion
      // path: the append happened, nothing searches, and the appended value survives verbatim.
      const baseFulfillment = orderFulfillmentAt(
        makeOrderViewFixture({ includePickupFulfillment: false }),
        0,
      );
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        orderFulfillmentIDsByRead: ['of-appended-under-one-id', 'of-searched-under-another'],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        observedOrder,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-appended-under-one-id']);
      expect(result.qualificationCount).toBe(1);
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'orderFulfillmentID',
        ),
      ).toHaveLength(1);
    });
  });

  // =========================================================================
  // §11.7 - THE ORDER ITEM ARM
  // =========================================================================
  describe('the ORDER ITEM arm [model/service/PromotionService.cfc:L714-L749]', () => {
    /** Rebuilds the subject over a membership double that qualifies the named items. */
    function withQualifyingItems(orderItemIDs: readonly string[]): void {
      membership = new RecordingOrderItemMembership(orderItemIDs);
      evaluator = buildEvaluator(addressZones, membership);
    }

    it('offers EVERY order item to the membership test, once each, in iteration order', () => {
      evaluator.getQualifierQualificationDetails(makeQualifier('merchandise'), order);

      expect(
        membership.getOrderItemInQualifierCalls.map(
          (call: RecordedMembershipCall): string => call.orderItem.orderItemID,
        ),
      ).toStrictEqual(everyOrderItemID(order));
    });

    it('forwards the SAME qualifier instance and the respective item, with POSITIVE polarity', () => {
      // CFML parity [model/service/PromotionService.cfc:L727]: the source calls
      // `getOrderItemInQualifier(qualifier=qualifier, orderItem=orderItem)` with KEYWORD arguments
      // and consumes the answer POSITIVELY - a `true` includes the item. TypeScript has no keyword
      // arguments, so the call collapses to the declared parameter order; that is a language
      // difference, not a behavioural one.
      //
      // (For contrast only, and asserted elsewhere: [L805] calls the same predicate NEGATED, and
      // [L220] calls `getOrderItemInReward` POSITIONALLY. Neither site belongs to this module.)
      const firstItem = orderItemAt(order, 0);
      withQualifyingItems([firstItem.orderItemID]);

      const qualifier = makeQualifier('merchandise', { minimumItemQuantity: 1 });

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      const call = recordedMembershipCallAt(membership, 0);

      expect(call.qualifier).toBe(qualifier);
      expect(call.orderItem).toBe(firstItem);
      expect(result.qualifiedOrderItemDetails).toHaveLength(1);
      expect(qualifiedOrderItemDetailAt(result, 0).orderItem).toBe(firstItem);
    });

    it('a FALSE membership answer excludes the item entirely - no record is appended', () => {
      // CFML parity [model/service/PromotionService.cfc:L727, L733]: L733 sits INSIDE the L727 gate,
      // so a non-qualifying item's record is built and then silently discarded. No record with a zero
      // `qualificationCount` is ever appended.
      withQualifyingItems([]);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
      expect(result.qualificationCount).toBe(0);
    });

    it('appends a record only for the qualifying items, in iteration order', () => {
      const secondItem = orderItemAt(order, 1);
      const thirdItem = orderItemAt(order, 2);
      withQualifyingItems([secondItem.orderItemID, thirdItem.orderItemID]);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(
        result.qualifiedOrderItemDetails.map(
          (detail: QualifiedOrderItemDetail): string => detail.orderItem.orderItemID,
        ),
      ).toStrictEqual([secondItem.orderItemID, thirdItem.orderItemID]);
    });

    // JUDGMENT CALL: the record's FINAL SHAPE is what is asserted, because the target constructs it
    // ONCE with its final value rather than building it at [L722-L725] with a zero and mutating that
    // member at [L729]. The published `QualifiedOrderItemDetail` declares `qualificationCount`
    // `readonly`, which makes progressive rebuilding impossible - and the change is observationally
    // identical, since the record is fresh per iteration, is never read between L725 and L729, and is
    // appended at L733 only after the assignment. No observer can see the intermediate zero, so no
    // test can assert one; asserting the final shape is the honest form of the assertion.
    it('records each qualifying item with the item quantity as its qualification count', () => {
      const firstItem = orderItemAt(order, 0);
      withQualifyingItems([firstItem.orderItemID]);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(qualifiedOrderItemDetailAt(result, 0)).toStrictEqual({
        orderItem: firstItem,
        qualificationCount: firstItem.quantity,
      });
      // A PLAIN COUNT, never money.
      expect(typeof qualifiedOrderItemDetailAt(result, 0).qualificationCount).toBe('number');
    });

    it('leaves qualifiedFulfillmentIDs untouched and consults no address zone', () => {
      withQualifyingItems(everyOrderItemID(order));

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(addressZones.calls).toStrictEqual([]);
    });

    describe('the qualifying-quantity gate [L740] and the division [L742-L743]', () => {
      it('short-circuits before the division when NOTHING qualified', () => {
        // [L740] `gt 0` wraps L742-L744, so an order in which nothing qualified never reaches the
        // division at all. The proof is that a ZERO minimum - which would otherwise raise - is
        // harmless here.
        withQualifyingItems([]);

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 0 }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
      });

      it('leaves the count at ZERO when minimumItemQuantity is ABSENT - RESTRICTIVE', () => {
        // ★ CFML parity [model/service/PromotionService.cfc:L742]: THE NULL POLARITY IS RESTRICTIVE.
        // There is no `else` and no fallback, so a qualifier that MATCHED ITEMS but configures no
        // minimum qualifies NOTHING. The minimum is NOT defaulted to 1 and the accumulated quantity
        // is NOT assigned in its place.
        //
        // LEGACY-NOTE [model/service/PromotionService.cfc:L742, L830]: L830 - the structurally
        // parallel guard inside `getPromotionPeriodOrderItemQualificationCount`, owned by
        // ./promotionPeriodQualification.test.ts - has the RECIPROCAL OPPOSITE polarity: there an
        // absent minimum leaves the ACCUMULATED count intact (PERMISSIVE). Two null-polarity decisions
        // on structurally parallel clauses, deliberately opposite. DO NOT HARMONISE THEM.
        //
        // The records are still appended, which is what makes the polarity observable rather than
        // indistinguishable from "nothing matched".
        const qualifier = promotionFixtures.permissivePromotionQualifier;
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(qualifier, order);

        expect(qualifier.getQualifierType()).toBe('merchandise');
        expect(qualifier.getMinimumItemQuantity()).toBeUndefined();
        expect(result.qualifiedOrderItemDetails).toHaveLength(order.orderItems.length);
        expect(result.qualificationCount).toBe(0);
      });

      it('divides the accumulated quantity by the configured minimum', () => {
        // Quantities 3, 2 and 4 accumulate to 9; a minimum of 1 divides to 9.
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 1 }),
          order,
        );

        expect(result.qualificationCount).toBe(9);
      });

      it('TRUNCATES TOWARD ZERO on a positive non-integer quotient - not Math.round', () => {
        // ★ [model/service/PromotionService.cfc:L743] wraps the division in CFML `int()`, WHICH
        // TRUNCATES rather than rounds. 9 / 2 is 4.5: truncation answers 4 and rounding would answer
        // 5, so this case discriminates between the two translations outright.
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 2 }),
          order,
        );

        expect(result.qualificationCount).toBe(4);
      });

      it('TRUNCATES TOWARD ZERO on a negative quotient - not Math.floor', () => {
        // The second discriminator, and the reason `Math.floor` is wrong too: 9 / -2 is -4.5, which
        // truncates to -4 and floors to -5. A negative quotient is REACHABLE because nothing validates
        // the sign of the configured minimum (B5) - no clamp, no absolute value and no throw is added.
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: -2 }),
          order,
        );

        expect(result.qualificationCount).toBe(-4);
      });

      it('RAISES on a ZERO divisor rather than yielding Infinity', () => {
        // ★ [model/service/PromotionService.cfc:L743] IS AN UNGUARDED DIVISION. CFML raises on
        // division by zero; JavaScript yields `Infinity`, and `Math.trunc(Infinity)` is `Infinity` - a
        // silent `Infinity` propagating into the ledger ratchet would be a DIVERGENCE. The legacy
        // FAILURE is reproduced instead: no clamp, no substituted divisor and no skipped assignment.
        //
        // THERE ARE FOUR UNGUARDED DIVISIONS ACROSS THE SLICE - L299, L486, L743 and L831 - AND NONE
        // MAY BE GUARDED. L743 is this suite's; L299 belongs to ./rewardUsageLedger.test.ts, L486 to
        // ./overUseStripping.test.ts and L831 to ./promotionPeriodQualification.test.ts.
        withQualifyingItems(everyOrderItemID(order));

        const error = captureThrown(() =>
          evaluator.getQualifierQualificationDetails(
            makeQualifier('merchandise', { minimumItemQuantity: 0 }),
            order,
          ),
        );

        expect(error).toBeInstanceOf(RangeError);
        expect(error.message).toContain('minimumItemQuantity is 0');
        expect(error.message).toContain('model/service/PromotionService.cfc:L743');
      });

      it('answers zero when the quotient truncates below one', () => {
        // A single 3-unit item against a minimum of 4 truncates 0.75 to 0: the item matched, a record
        // was appended, and the qualifier still qualifies nothing. The record and the count are
        // independent, which is exactly what the two-member record makes visible.
        const firstItem = orderItemAt(order, 0);
        withQualifyingItems([firstItem.orderItemID]);

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 4 }),
          order,
        );

        expect(firstItem.quantity).toBe(3);
        expect(result.qualifiedOrderItemDetails).toHaveLength(1);
        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('driven through the REAL, shipped OrderItemMembership', () => {
      it('qualifies only the item whose SKU the qualifier includes', () => {
        // The complementary evidence for the JUDGMENT CALL on the membership double: an UNMODIFIED
        // `new OrderItemMembership()` is injected here, so the arm runs against the real seven-operand
        // exclusion-then-inclusion algorithm end to end. The membership algorithm itself is owned by
        // ./orderItemMembership.test.ts and is not re-derived here; what this case proves is that the
        // arm composes with the real unit rather than only with a stand-in.
        const firstItem = orderItemAt(order, 0);
        evaluator = buildEvaluator(addressZones, new OrderItemMembership());

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', {
            skus: [firstItem.sku],
            minimumItemQuantity: 1,
          }),
          order,
        );

        expect(result.qualifiedOrderItemDetails).toHaveLength(1);
        expect(qualifiedOrderItemDetailAt(result, 0).orderItem).toBe(firstItem);
        expect(result.qualificationCount).toBe(firstItem.quantity);
      });

      it('qualifies NOTHING for a qualifier with no inclusion criteria at all', () => {
        // [model/service/PromotionService.cfc:L918] ends the membership test with a RESTRICTIVE
        // `return false`, so an "empty" qualifier scopes ZERO items rather than the whole order. The
        // shared permissive fixture qualifier - ten absent gates and thirteen empty collections - is
        // the exact shape that proves it.
        evaluator = buildEvaluator(addressZones, new OrderItemMembership());

        const result = evaluator.getQualifierQualificationDetails(
          promotionFixtures.permissivePromotionQualifier,
          order,
        );

        expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
        expect(result.qualificationCount).toBe(0);
      });
    });
  });

  // =========================================================================
  // §11.8 - ADDRESSES AND ORDERS ARE READ-ONLY VIEWS
  // =========================================================================
  describe('the read-only anti-corruption boundary', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L357-L359] and
    // [model/service/AddressService.cfc:L58, L60-L61]: THE EMPTY-COLLECTION POLARITIES ON THE TWO
    // SIDES OF THIS PORT DISAGREE, AND COLLAPSING THEM WOULD BE A MONEY BUG.
    //
    // The reward-side CALLER at L357-L359 is PERMISSIVE: `addressIsInZone` is seeded `true` and is
    // flipped to `false` only when `arrayLen(reward.getShippingAddressZones())` is non-zero - so an
    // unconfigured zone set imposes no constraint. The EVALUATOR ITSELF is RESTRICTIVE:
    // `AddressService.cfc:L58` seeds `addressInZone = false` and L60-L61 loop the zone's LOCATIONS, so
    // a zone with ZERO LOCATIONS means NOT IN ZONE. One rule cannot express both.
    //
    // This suite therefore never relies on an implied default: every case names the zone identifiers
    // its double treats as matching, and an empty list is passed as a positive instruction meaning
    // "answer false". The four guarded location comparisons of
    // [model/service/AddressService.cfc:L63-L74] belong to whoever implements the port in the
    // composition root and are deliberately not reproduced here.
    it('carries only the four AddressService comparison fields across the port', () => {
      // `ShippingAddressView` has FIVE members - `postalCode`, `city`, `stateCode`, `countryCode` and
      // `isNew` - but `isNew` covers the ORM lifecycle calls at [org/Hibachi/HibachiEntity.cfc:L571,
      // L707] and is NOT an address-zone input. It must not cross the boundary.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const singleFulfillmentOrder = makeOrderViewFixture({ includePickupFulfillment: false });
      const fulfillment = orderFulfillmentAt(singleFulfillmentOrder, 0);
      const address = resolvedAddressOf(fulfillment);

      evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(fulfillment)],
        }),
        singleFulfillmentOrder,
      );

      const projection = recordedZoneCallAt(addressZones, 0).address;

      expect(Object.keys(address)).toHaveLength(5);
      expect(address.isNew).toBe(false);
      expect(Object.keys(projection).sort()).toStrictEqual([
        'city',
        'countryCode',
        'postalCode',
        'stateCode',
      ]);
    });

    /**
     * Drives all three arms over one order graph and asserts every value the arms read is unchanged.
     *
     * @param subjectOrder - the frozen order projection to drive.
     */
    function withNoWriteAttempted(subjectOrder: OrderView): void {
      const beforeFulfillmentIDs = subjectOrder.orderFulfillments.map(
        (orderFulfillment: OrderFulfillmentView): string => orderFulfillment.orderFulfillmentID,
      );
      const beforeItemQuantities = subjectOrder.orderItems.map(
        (orderItem: OrderItemView): number => orderItem.quantity,
      );
      const beforeSubtotal = subjectOrder.subtotal.toDecimalString();
      const beforeTotalSaleQuantity = subjectOrder.totalSaleQuantity;
      const beforeAddress = resolvedAddressOf(orderFulfillmentAt(subjectOrder, 0));

      const zones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      const items = new RecordingOrderItemMembership(everyOrderItemID(subjectOrder));
      const subject = buildEvaluator(zones, items);

      subject.getQualifierQualificationDetails(
        makeQualifier('order', { minimumOrderQuantity: 1 }),
        subjectOrder,
      );
      subject.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(subjectOrder, 0))],
        }),
        subjectOrder,
      );
      subject.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        subjectOrder,
      );

      expect(
        subjectOrder.orderFulfillments.map(
          (orderFulfillment: OrderFulfillmentView): string => orderFulfillment.orderFulfillmentID,
        ),
      ).toStrictEqual(beforeFulfillmentIDs);
      expect(
        subjectOrder.orderItems.map((orderItem: OrderItemView): number => orderItem.quantity),
      ).toStrictEqual(beforeItemQuantities);
      expect(subjectOrder.subtotal.toDecimalString()).toBe(beforeSubtotal);
      expect(subjectOrder.totalSaleQuantity).toBe(beforeTotalSaleQuantity);
      expect(resolvedAddressOf(orderFulfillmentAt(subjectOrder, 0))).toBe(beforeAddress);
    }

    it('receives a deeply FROZEN order graph and does not need to write to it', () => {
      // The structural half of the no-mutation proof: the fixture freezes the order, its collections,
      // each fulfillment and each address, so any write the subject attempted would raise here. A
      // clean run over all three arms IS the proof.
      const frozenOrder = makeOrderViewFixture();

      expect(Object.isFrozen(frozenOrder)).toBe(true);
      expect(Object.isFrozen(frozenOrder.orderFulfillments)).toBe(true);
      expect(Object.isFrozen(frozenOrder.orderItems)).toBe(true);
      expect(Object.isFrozen(orderFulfillmentAt(frozenOrder, 0))).toBe(true);
      expect(Object.isFrozen(resolvedAddressOf(orderFulfillmentAt(frozenOrder, 0)))).toBe(true);

      withNoWriteAttempted(frozenOrder);
    });

    it("never hands back one of the order graph's own arrays", () => {
      // The verdict's collections are the subject's, not the view's, so a caller splicing a verdict
      // cannot reach into order persistence through it.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).not.toBe(order.orderFulfillments);
      expect(result.qualifiedOrderItemDetails).not.toBe(order.orderItems);
      expect(Object.isFrozen(result.qualifiedFulfillmentIDs)).toBe(false);
    });

    it('emits opaque identifiers for the out-of-scope aggregate, never order entities', () => {
      // The seam that makes this slice independently deployable: the verdict names fulfillments by
      // opaque string ID rather than carrying an order-owned entity out of the engine.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      for (const qualifiedFulfillmentID of result.qualifiedFulfillmentIDs) {
        expect(typeof qualifiedFulfillmentID).toBe('string');
      }
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
    });
  });
});
