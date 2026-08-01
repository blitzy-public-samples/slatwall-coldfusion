// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no declaration below depends on
// one - this module's only imports are four shipped siblings inside
// `src/domain/**`. The complete set named below, with the role each will play:
//
//   src/services/promotion/promotionPeriodQualification.ts  implements the period
//                                                           helper; consumer #1
//   src/services/promotion/qualifierQualification.ts        implements the
//                                                           qualifier helper;
//                                                           owns DEFECT 11 and the
//                                                           L774 delete hazard
//   src/services/promotionService.ts                        the facade carrying the
//                                                           shipping-discount
//                                                           surface; consumer #2
//   src/services/promotion/twoPassRewardIterator.ts         the two explicit
//                                                           ordered passes that
//                                                           read `qualificationsMeet`
//   src/services/promotion/promotionApplication.ts          applies whatever
//                                                           survives qualification
//   src/repositories/mysql/mysqlPromotionRepository.ts      supplies the two
//                                                           period use counts
//   src/handlers/bootstrap.ts                               wires the ports the
//                                                           helpers depend on
//
// SHIPPED, AND DELIBERATELY NOT IMPORTED: the two folder siblings
// `src/domain/promotionEngine/rewardUsageTypes.ts` and
// `src/domain/promotionEngine/qualifiedDiscountTypes.ts` both exist at this
// checkpoint. Neither is imported here - see the zero-intra-folder-imports note
// below. `rewardUsageTypes.ts` already publishes the same contract from its side
// and names this module as a sibling it does not import, so the independence is
// reciprocal and verified rather than asserted.
// ---------------------------------------------------------------------------

/**
 * slatwall-ts - the promotion-period and qualifier QUALIFICATION contracts: the
 * gate that decides whether any discount is computed at all.
 *
 * WHAT THIS FILE IS
 * Type contracts and nothing else, together describing
 * `promotionPeriodQualifications` and the per-qualifier result it is built from -
 * the structures that `updateOrderAmountsWithPromotions`
 * [model/service/PromotionService.cfc:L58-L546] consults before it computes a
 * single currency amount:
 *
 *   1. {@link QualifiedOrderItemDetail} - one order item's qualification count
 *      under one qualifier.
 *   2. {@link QualifierQualification} - one qualifier's verdict: how many times it
 *      qualifies, which fulfillments survived it, and which items it matched.
 *   3. {@link PeriodQualification} - one promotion period's verdict, and the type
 *      that carries DEFECT 10.
 *   4. {@link PromotionPeriodQualificationKey} / {@link PromotionPeriodQualifications}
 *      - the memo itself, keyed by `promotionPeriodID`.
 *   5. Four function-signature aliases naming the helpers that produce these
 *      values: {@link GetPromotionPeriodQualificationDetails},
 *      {@link GetQualifierQualificationDetails},
 *      {@link GetPromotionPeriodQualifiedFulfillmentIDList} and
 *      {@link GetPromotionPeriodOrderItemQualificationCount}.
 *
 * AUTHORITY
 * AAP 0.4.1, the "Value Objects, Views, and Engine Types" row for this path:
 * CREATE, sourced from [model/service/PromotionService.cfc:L549-L627], described
 * as "Types the `promotionPeriodQualifications` struct; preserves the never-read
 * `qualifiedFulfillments` key as a documented dead field". AAP 0.8.1's
 * Preserve-Exactly directive names "promotion discount math together with
 * use-limit enforcement semantics" as must-preserve behaviour, and qualification
 * is upstream of both: an order item that fails to qualify never reaches the
 * discount arithmetic, and a period that fails its use-count gate never reaches
 * the reward loop at all. Getting these shapes wrong does not produce a slightly
 * different discount - it produces no discount, or a discount that should not
 * exist.
 *
 * TYPES ONLY - THIS MODULE EMITS ZERO RUNTIME JAVASCRIPT
 * Every declaration below is an `interface` or a `type` alias, and all four
 * imports are `import type`, so `tsc` erases the whole module and nothing from it
 * reaches the Lambda bundle. There is no class, no function, no `const`, no
 * `enum` and no default export. The four helper aliases are the place where that
 * contract is easiest to break: they are FUNCTION-SIGNATURE TYPES, never function
 * declarations and never `declare function`, precisely so that naming the helper
 * surface here costs no emitted code. Producing these values belongs to
 * `src/services/promotion/**` (planned); persisting anything belongs to
 * `src/repositories/mysql/**`.
 *
 * MUTABILITY IS PER-MEMBER, AND IT IS EVIDENCE-DRIVEN
 * The qualification structures are built up in place by the legacy helpers and
 * then read - and in one case WRITTEN - by their callers, so a uniform
 * `Readonly<>` would make the legacy code inexpressible while a uniform mutable
 * would licence writes it never performs. Every marking below cites the exact
 * lines that justify it, taken from a complete census of the source file re-run
 * while authoring this module. The pattern used throughout is a `readonly`
 * PROPERTY holding a MUTABLE collection: the property is never reassigned to a
 * different object, but its contents are appended to, deleted from, or keyed
 * into. Two members are plainly mutable, three are `readonly` properties over
 * mutable contents, and one is an optional dead field.
 *
 * TWO INDEPENDENT CONSUMERS, NOT ONE - AND THE SHAPE MUST SERVE BOTH
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L136, L1038]: a whole-file census of `promotionPeriodQualifications` proves TWO separate consumers, each with its own memo declared as a method-local `var`. Consumer #1 is `updateOrderAmountsWithPromotions`: memo at L136, lazy populate at L192-L193, and it reads EVERY live member - `qualificationsMeet` at L197, `qualifiedFulfillmentIDs` at L209 and L351, `orderItems` at L212-L213, L217 and L222. Consumer #2 is `getShippingMethodOptionsDiscountAmountDetails` [model/service/PromotionService.cfc:L1032]: memo at L1038, lazy populate at L1048-L1049, and it reads ONLY `qualificationsMeet`, at L1053.
 * Two consequences bind these types. First, a `PeriodQualification` must be USABLE when only `qualificationsMeet` is consulted, so no member may be shaped in a way that forces a caller to consume or supply `orderItems`. Second, the `order` does not always arrive as the enclosing method's own parameter: consumer #2 derives it through `arguments.shippingMethodOption.getOrderFulfillment().getOrder()` at L1049, so the helper signatures take the order as an explicit parameter and assume nothing about its provenance.
 *
 * REQUEST-SCOPED, NEVER MODULE STATE. Both legacy memos are `var` locals, one per
 * invocation, and the port must keep them that way. A module-level memo would
 * persist between unrelated invocations on a warm Lambda container and leak one
 * customer's qualification verdict into another customer's order - a correctness
 * problem, not a housekeeping one. These are types, so they cannot enforce the
 * scoping by themselves; the obligation belongs to
 * `src/services/promotion/promotionPeriodQualification.ts` (planned) and
 * `src/services/promotionService.ts` (planned), and it is stated here because
 * this is where a reader looks for it.
 *
 * ZERO INTRA-FOLDER IMPORTS
 * The three modules of `src/domain/promotionEngine/` are mutually independent.
 * This file imports neither `rewardUsageTypes.ts` nor
 * `qualifiedDiscountTypes.ts`, both of which are shipped. The independence
 * survives real couplings in the algorithm - the qualification count this file
 * types is multiplied by the reward ledger's `maximumUsePerQualification` at
 * [model/service/PromotionService.cfc:L223-L224] and L228, and the resulting
 * discount lands in the qualified-discount accumulator - but every one of those
 * couplings happens in `src/services/promotion/**` (planned), not through a type
 * import. Keeping it that way is what lets any one of these three modules be
 * regenerated without touching the other two.
 *
 * NO MONEY, NO DECIMAL ARITHMETIC, AND THAT IS DELIBERATE
 * Not one member of this file is monetary. `qualificationCount`, the per-item
 * count keyed into `orderItems`, and the ten numeric gates on the qualifier
 * entity are COUNTS, THRESHOLDS and WEIGHTS, so `number` is the honest type and
 * `decimal.js` is neither imported nor needed. The project standard that all
 * money passes through the `Money` value object (AAP 0.8.3) is not weakened by
 * that - it is simply not engaged here. Where the qualifier's own gates ARE
 * monetary they are typed on the entity, not here:
 * `PromotionQualifier.getMinimumOrderSubtotal()` and its three siblings return
 * `Money | undefined`, and the comparisons against `OrderView.subtotal` at
 * [model/service/PromotionService.cfc:L648] and L650 happen inside
 * `src/services/promotion/qualifierQualification.ts` (planned). A `Money` member
 * introduced here would be inventing an amount the legacy structure does not
 * hold.
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE TO THIS FILE, AND HERE IS WHY.
 * The project standard is that every query uses prepared statements, preserving
 * the injection-safety guarantee `cfqueryparam` provided (AAP 0.8.3). This module
 * contains type declarations and no query of any kind - no SQL string, no driver
 * import, no connection, no interpolation site - so there is nothing here for the
 * standard to bind. Two of the values these types describe are genuinely
 * database-derived: the period use count and the period account use count read at
 * [model/service/PromotionService.cfc:L567] and L576. Both obligations rest
 * wholly with `src/repositories/mysql/mysqlPromotionRepository.ts`, which owns
 * every statement that reads the `Sw*` tables. Stating the exemption explicitly is
 * the point: silence would read as an oversight.
 *
 * SCHEMA CONTINUITY (B5): NOTHING HERE IS PERSISTED. These are engine-state
 * shapes computed per request and discarded. No table, no column, no migration,
 * no index. The only identifiers that cross the persistence boundary are the
 * opaque `promotionPeriodID`, `orderFulfillmentID` and `orderItemID` strings,
 * carried verbatim and never parsed.
 *
 * TEST COVERAGE IS ENTIRELY NET-NEW (B8)
 * No legacy test touches the promotion engine: `meta/tests/unit/service/` holds
 * only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
 * UtilityRBServiceTest, none of which is in scope, and the two legacy tests that
 * do touch this slice cover the Brand and Product entities. Every suite that
 * exercises these types is therefore NET-NEW and must be labelled net-new rather
 * than presented as parity. The obligation is real - every type gets a test - but
 * authoring those suites belongs to the test tier under `slatwall-ts/tests/**`;
 * this file authors none.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT
 * `review_rules` returns the single line "No user rules provided." - re-queried
 * while authoring this file, both without a range and over the whole document,
 * with byte-identical results. It is a fixed single-line sentinel rather than a
 * paginated document, so the absence is verified rather than assumed. No rule is
 * invented to fill it, and it is not treated as licence to lower the bar: the
 * project's enterprise substitutes apply at full strength here (AAP 0.7, AAP
 * 0.8.3). `review_rules` remains the authoritative source; this is a record of
 * its result.
 *
 * LOCATOR CORRECTIONS, RECORDED SO A REVIEWER CAN RECONCILE THEM
 * Every locator cited in this file was checked against the source, and the source
 * is the authority. Five published citations needed correcting. None of the five
 * changes a conclusion - each one moves a citation by a line or two, or corrects a
 * claim about a helper's behaviour - but an uncorrected locator is an unverifiable
 * claim, so all five are recorded.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L569, L578, L613]: `qualificationsMeet` is published as being cleared at "L570/L578/L614"; the three clearing writes are at L569 (the period use-count gate), L578 (the period account use-count gate) and L613 (the qualifier early return). L570 and L571 are closing braces and L614 is the `qualifiedFulfillmentIDs` reset.
 * The correction matters because these three lines are the entire set of places a period can be disqualified, and a reviewer checking that set needs to land on statements rather than on braces.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L614, L615, L616]: the early-return reset is published as resetting `qualifiedFulfillmentIDs` at L615 and `qualifierDetails` at L616; the resets are at L614 and L615 respectively, and L616 is the `return qualificationDetails;`. The enclosing block is L612-L617.
 * The published RANGE L613-L616 is accurate and is used as such below; only the two per-member citations inside it were off by one. The append that builds `qualifierDetails` is at L609, inside the qualifier loop L587-L618.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L632]: `QualifierQualification.qualificationCount` is published as being "set to 1 then zeroed"; the INITIALIZER seeds it to `0` at L632, and the `1` is written only in the `order` branch at L641 before the four gates at L644-L651 can zero it again at L652.
 * The distinction is load-bearing for the `fulfillment` and order-item branches, which never see a `1`: the fulfillment branch re-zeroes at L659 and then counts upward, and the order-item branch re-zeroes at L717 and then divides at L743.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L752-L781]: `getPromotionPeriodQualifiedFulfillmentIDList` is published as a helper this file must type, and it is typed below - but it is DEAD CODE in the legacy system. A repository-wide search across `model/`, `integrationServices/`, `admin/` and `frontend/` finds ZERO call sites; it is declared `private` and never invoked, so its own body is the only thing that has ever run its `ListDeleteAt` hazard, and that never happens either.
 * It is typed anyway, deliberately: the folder directive requires the helper surface to be named here, and a reviewer comparing the two implementations needs the signature to exist so the comma-list-versus-array distinction is impossible to miss. Its deadness is recorded so nobody mistakes it for the live fulfillment path, which is `PeriodQualification.qualifiedFulfillmentIDs`.
 *
 * LEGACY-NOTE [slatwall-ts/src/lib/cfml/list.ts:L477-L529]: the shipped `listGetAt` is published as non-throwing, "returns '' out of range"; it THROWS. It raises the exported `CfmlListIndexError` for a non-integer or `< 1` position at L487, and again at L528 when the scan runs past the end, reporting the true element count.
 * That correction is load-bearing rather than cosmetic: it means a ported consumer that feeds a `0` position into a list helper FAILS LOUDLY, which mirrors CFML's own `ListDeleteAt(list, 0)` raising rather than silently deleting or silently doing nothing. It is recorded here because the comma-list helper typed below is the one place in this file where that hazard is reachable.
 */

import type { PromotionPeriod } from '../entities/promotionPeriod.js';
import type { PromotionQualifier } from '../entities/promotionQualifier.js';
import type { OrderItemView } from '../views/orderItemView.js';
import type { OrderView } from '../views/orderView.js';

// LEGACY-NOTE [model/service/PromotionService.cfc:L554, L560, L633, L666]: `src/domain/views/orderFulfillmentView.ts` is shipped and is deliberately NOT imported here. Every fulfillment-related member of every type below is an OPAQUE ID STRING, because that is what the legacy structures hold: L554 and L633 seed empty arrays, and L560 and L666 append `orderFulfillment.getOrderFulfillmentID()` into them. No qualification structure ever holds a fulfillment object.
// The omission is mechanical as well as faithful - `noUnusedLocals` makes an import that appears only in prose a COMPILE ERROR, so an `OrderFulfillmentView` import added "for completeness" would break the build. The fulfillment view is still the right type for the code that PRODUCES these IDs, and `src/services/promotion/qualifierQualification.ts` (planned) imports it there; it is simply not part of this contract. The same reasoning excludes `src/lib/cfml/list.ts`, referenced in comments below and imported nowhere, because this module declares no logic.

/**
 * One order item's qualification count under ONE qualifier.
 *
 * EXACTLY TWO MEMBERS. The single construction site builds exactly these two keys
 * and no others [model/service/PromotionService.cfc:L722-L725], and the
 * illustrative docblock at [model/service/PromotionService.cfc:L95-L98] lists the
 * same two. A third member would be inventing engine state - and the temptation is
 * real, because the surrounding loop also computes `qualifiedItemsQuantity`
 * [model/service/PromotionService.cfc:L718, L730], which is an accumulator OUTSIDE
 * this record rather than a field of it.
 *
 * BOTH MEMBERS ARE `readonly`, ON THE EVIDENCE. The record is constructed fresh
 * per order item at [model/service/PromotionService.cfc:L722], its
 * `qualificationCount` is written once at
 * [model/service/PromotionService.cfc:L729], and it is appended to the containing
 * array at [model/service/PromotionService.cfc:L733]. No line ever revisits a
 * record already in the array. Marking it `readonly` is therefore the faithful
 * reading rather than a preference, and it keeps this file's mutable surface down
 * to the places the legacy engine genuinely mutates.
 *
 * CFML parity [model/service/PromotionService.cfc:L722-L735]: the record is built BEFORE the membership test and appended only INSIDE it, so a non-matching order item leaves a fully-constructed record that is silently discarded - it is never appended with a count of zero.
 * The consequence for a consumer is that `qualifiedOrderItemDetails` contains ONLY matching items, so its length is a count of matches rather than a count of order items, and an absent order item means "did not match" rather than "matched zero times". Reproduce the construct-then-conditionally-append order; hoisting the append would add zero-count entries the legacy array never contains.
 */
export interface QualifiedOrderItemDetail {
  /**
   * The order item this count belongs to.
   *
   * THE WHOLE VIEW, NOT AN ID. This is the one place in this file where a
   * fulfillment-or-item association is held as an object rather than as an opaque
   * identifier, and it is deliberate: [model/service/PromotionService.cfc:L723]
   * assigns `orderItem = orderItem`, the loop variable itself, so the legacy
   * record holds the entity. `OrderItemView` is the read-only anti-corruption
   * projection of that entity - the Order aggregate is out of scope, so the view is
   * what crosses the boundary.
   *
   * Contrast `qualifiedFulfillmentIDs` on {@link QualifierQualification}, which
   * holds ID STRINGS because [model/service/PromotionService.cfc:L666] appends
   * `orderFulfillment.getOrderFulfillmentID()` rather than the fulfillment. The
   * asymmetry is the legacy structure's, not the port's, and it is preserved.
   */
  readonly orderItem: OrderItemView;

  /**
   * How many units of this order item qualified under this qualifier.
   *
   * A COUNT, so `number` rather than `Money`. It is the order item's own quantity:
   * [model/service/PromotionService.cfc:L729] assigns
   * `orderItem.getQuantity()` verbatim once the membership test at
   * [model/service/PromotionService.cfc:L727] passes. It is never a currency
   * amount and never a fraction of one.
   *
   * NO INITIAL VALUE IS DECLARED HERE. The construction site seeds `0`
   * [model/service/PromotionService.cfc:L724]; a default in a type would be a
   * value, and this module emits none.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L730, L743]: this per-item count is NOT what `QualifierQualification.qualificationCount` ends up holding. The per-item counts are summed into a separate local accumulator at L730, and the qualifier's own count is then derived from that SUM divided by the minimum item quantity at L743 - so the two `qualificationCount` members share a name and a type while measuring different things.
   * The shared name is preserved because both are legacy member names and interface parity is the acceptance contract; the difference is recorded here so a consumer does not read one where it means the other.
   */
  readonly qualificationCount: number;
}

/**
 * ONE qualifier's verdict on an order.
 *
 * EXACTLY FOUR MEMBERS, from the initializer at
 * [model/service/PromotionService.cfc:L630-L635] inside
 * `getQualifierQualificationDetails(qualifier, order)`
 * [model/service/PromotionService.cfc:L629]. The illustrative docblock at
 * [model/service/PromotionService.cfc:L90-L100] lists four too - but NOT the same
 * four, which is the subject of DEFECT 10 documented on
 * {@link PeriodQualification}: the docblock names `qualifiedFulfillments` where
 * the code creates `qualifiedFulfillmentIDs`. The CODE is the authority.
 *
 * THREE BRANCHES WRITE THIS RECORD, AND THEY WRITE DIFFERENT MEMBERS. The
 * qualifier type dispatches three ways, and which members end up meaningful
 * depends entirely on which branch ran:
 *
 *   * `order` [model/service/PromotionService.cfc:L638] - sets
 *     `qualificationCount` to `1` at L641 and zeroes it at L652 if any of the four
 *     order-level gates at L644-L651 fails. It touches NEITHER collection, so both
 *     stay empty.
 *   * `fulfillment` [model/service/PromotionService.cfc:L656] - re-zeroes the count
 *     at L659 and re-empties the ID array at L660, then counts upward and appends
 *     per fulfillment at L665-L666, and decrements plus deletes at L707-L709 for
 *     each fulfillment that fails the composite gate. It never touches
 *     `qualifiedOrderItemDetails`.
 *   * the order-item family, gated by
 *     `listFindNoCase("contentAccess,merchandise,subscription", getQualifierType())`
 *     [model/service/PromotionService.cfc:L714] - re-zeroes the count at L717,
 *     appends matching items at L733, and derives the count by integer division at
 *     L743. It never touches `qualifiedFulfillmentIDs`.
 *
 * A consumer therefore cannot infer the branch from the members, and must not try:
 * an empty `qualifiedFulfillmentIDs` means "no fulfillment qualified" after the
 * fulfillment branch and "not a fulfillment qualifier" after either other branch.
 * The two states are indistinguishable in the legacy structure and are left
 * indistinguishable here, because collapsing them would require inventing a
 * discriminant the legacy code does not carry.
 *
 * CFML parity [model/service/PromotionService.cfc:L638, L656, L714, L747]: THE DISPATCH HAS NO `else`. When `getQualifierType()` matches none of the three branches - including when it is absent entirely, which the ported entity permits since `getQualifierType(): string | undefined` - the record is returned exactly as initialized at L630-L635, with `qualificationCount` still `0`.
 * That zero then fails the caller's bare truthiness test at L593 and disqualifies the WHOLE PERIOD through the early return at L613-L616. An unrecognised qualifier type is therefore silently fatal to the promotion rather than ignored, and a consumer that adds a permissive default branch would grant discounts the legacy engine withholds.
 *
 * THE QUALIFIER TYPE IS NOT REDECLARED HERE. `PromotionQualifier.getQualifierType()`
 * returns `string | undefined`, deliberately un-narrowed because the legacy column
 * carries no check constraint and there is no `getQualifierTypeOptions()` anywhere
 * in the component - the entity documents that decision at its own accessor. This
 * file consumes that decision and does NOT publish a competing union: a union here
 * would be a second, divergent source of truth for the same column, and it would
 * make the no-`else` behaviour above unreachable in the type system while it stays
 * perfectly reachable at runtime.
 */
export interface QualifierQualification {
  /**
   * The qualifier this verdict is about.
   *
   * `readonly`, and it is the identity of the record rather than part of its state:
   * [model/service/PromotionService.cfc:L631] assigns
   * `qualifier = arguments.qualifier` and no line ever reassigns it.
   *
   * THE WHOLE ENTITY, BY DESIGN. The caller reads it back to decide whether an
   * explicit fulfillment qualification happened -
   * [model/service/PromotionService.cfc:L596] tests
   * `qualifier.getQualifierType() == "fulfillment"` - and the reward-side
   * membership walk needs the same entity's thirteen include and exclude
   * collections. An identifier would force a second load of an entity the caller
   * already has.
   *
   * THIS IS ALSO WHERE DEFECT 11 STAYS EXPRESSIBLE, and it is the reason this
   * member is the entity rather than a narrowed projection. The composite gate at
   * [model/service/PromotionService.cfc:L693-L704] reads FIVE distinct qualifier
   * concerns - the two fulfillment-weight bounds, the fulfillment-method
   * collection, the shipping-method collection and the shipping-address-zone
   * collection - and the port must keep the last two DISTINGUISHABLE. The shipped
   * entity does: `getShippingMethodIDs()` and `getShippingAddressZoneIDs()` are
   * separate accessors over separate link tables
   * [model/entity/PromotionQualifier.cfc:L74, L75]. Holding the entity here
   * inherits that separation for free; a "shipping eligibility" projection would
   * destroy it.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the SHIPPING-ADDRESS-ZONES clause of the composite gate RE-TESTS THE SHIPPING METHOD instead of testing the zone condition. Verbatim: `( arrayLen(arguments.qualifier.getShippingAddressZones()) && (orderFulfillment.getAddress().getNewFlag() || !arguments.qualifier.hasShippingMethod(orderFulfillment.getShippingMethod())) )`. The clause is entered only when address zones ARE configured, and it then duplicates the `!hasShippingMethod(...)` test that the immediately preceding clause at L701 already performs - so a fulfillment whose shipping method is not in the qualifier's shipping-method collection is disqualified TWICE while the zone membership the clause is named for is never consulted at all. The genuine zone evaluation happens earlier and separately, at L672-L690, and lands in the local `addressZoneOk` flag that L693 tests.
   * Preserved deliberately; do not fix without a product decision - repairing it changes which fulfillments qualify, and therefore the money. Reproduction is owned by `src/services/promotion/qualifierQualification.ts` (planned); this member's obligation is narrower and absolute: keep the two shipping concerns separately addressable so the defect can be written down as it stands, rather than collapsing them into one predicate, one flag or one "shipping eligibility" member.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L360, L678, L703]: A NULL-GUARD ASYMMETRY THAT MUST NOT BE NORMALISED. Three lines dereference the fulfillment's address and only ONE of them guards it. L360, in the fulfillment-REWARD branch, tests `!isNull(orderFulfillment.getAddress()) && !orderFulfillment.getAddress().isNew()`. L678 and L703, both in this qualifier branch, dereference `orderFulfillment.getAddress().getNewFlag()` with NO null check - a latent legacy null-reference failure whenever no address has been resolved. The three lines also use TWO different accessors for the same flag, `isNew()` at L360 and `getNewFlag()` at L678 and L703.
   * This asymmetry is exactly why `src/domain/views/orderFulfillmentView.ts` types `address` as `ShippingAddressView | undefined` and records the same finding on its `isNew` member - the two files agree, independently. Reproduction belongs to `src/services/**`; do not harmonise the guard, and do not add one to the qualifier branch to make the types tidier.
   */
  readonly qualifier: PromotionQualifier;

  /**
   * How many times this qualifier qualifies.
   *
   * MUTABLE, AND THE MUTABILITY IS LOAD-BEARING. Do NOT mark this `readonly`. Six
   * lines write it, and two of them are in-place arithmetic on the existing value:
   * L641 sets `1`, L652 zeroes, L659 re-zeroes, L665 INCREMENTS (`++`), L707
   * DECREMENTS (`--`), and L717 re-zeroes before L743 assigns the divided result.
   * A `readonly` marking would make the increment-then-decrement pattern of the
   * fulfillment loop inexpressible and force a consumer to rebuild the record,
   * which is precisely the class of change that silently alters money.
   *
   * A COUNT, so `number` rather than `Money`, and it is never a currency amount at
   * any point in its life. Its arithmetic partner is the reward ledger's
   * `maximumUsePerQualification`, which multiplies it at
   * [model/service/PromotionService.cfc:L223-L224] and L228 - a count times a
   * count.
   *
   * CFML parity [model/service/PromotionService.cfc:L593]: the caller's test is BARE NUMERIC TRUTHINESS - `if(thisQualifierDetails.qualificationCount)` - which relies on CFML treating `0` as false. The ported consumer MUST write an explicit `> 0`; a JavaScript `if (count)` would coincidentally agree for `0`, but writing the comparison is what makes the intent auditable and what keeps the reading correct if the value ever becomes optional.
   * The stakes are the whole promotion: a falsy count sends control to the early return at L613-L616 which disqualifies the entire period, while a truthy one appends this record at L609 and continues to the next qualifier.
   *
   * CFML parity [model/service/PromotionService.cfc:L743, L830-L831]: the order-item branch derives this count with `int(qualifiedItemsQuantity / qualifier.getMinimumItemQuantity())`, and CFML's `int()` TRUNCATES TOWARD ZERO rather than rounding - so 7 items against a minimum of 2 yields 3, not 4.
   * The port must truncate, not round. `Math.trunc` is the faithful operator here and `Math.floor` only coincides because both operands are non-negative in practice; `Math.round` would grant an extra qualification and therefore an extra discount. The same truncation appears in the per-item helper at L830-L831, so both sites must use the same operator.
   *
   * CFML parity [model/service/PromotionService.cfc:L740-L745]: the division is GUARDED BY THE WRONG CONDITION for divide-by-zero purposes. L740 tests `qualifiedItemsQuantity gt 0` - the NUMERATOR - and L742 then tests only `!isNull(getMinimumItemQuantity())` before dividing by it at L743. A stored minimum item quantity of `0` is non-null and passes that test.
   * The legacy column permits it: `minimumItemQuantity` is a nullable integer carrying `hb_nullRBKey="define.0"` [model/entity/PromotionQualifier.cfc:L59], so `0` and absent are DIFFERENT stored states and only absence is guarded. Recorded rather than repaired - the guard is reproduced as written, and the divisor's provenance is the qualifier entity, not this type.
   */
  qualificationCount: number;

  /**
   * The fulfillments that survived this qualifier, as OPAQUE IDs.
   *
   * A `readonly` PROPERTY HOLDING A MUTABLE ARRAY - and the distinction is exact.
   * The property is reassigned exactly once, at
   * [model/service/PromotionService.cfc:L660], and that reassignment writes a fresh
   * empty array over the empty array the initializer already created at L633, so it
   * is a no-op in every observable respect. Its CONTENTS are then mutated twice per
   * loop iteration in the worst case: `arrayAppend` at
   * [model/service/PromotionService.cfc:L666] and `arrayDeleteAt` at
   * [model/service/PromotionService.cfc:L709].
   *
   * So the type is `readonly qualifiedFulfillmentIDs: string[]`, NOT
   * `ReadonlyArray<string>` and not a mutable property. `ReadonlyArray` would make
   * both mutation sites inexpressible; a mutable property would licence
   * whole-array replacement, which the legacy code performs only in the
   * indistinguishable-from-nothing case above.
   *
   * CFML parity [model/service/PromotionService.cfc:L707-L709]: the delete is positional and its position comes from `arrayFind`, which returns a 1-BASED INDEX OR `0`, NEVER A BOOLEAN. L708 stores it in `di` and L709 passes it straight to `arrayDeleteAt`. The code is safe here only because L666 appended the very ID being searched for, two statements earlier in the same iteration.
   * The port must not translate `arrayFind` as a predicate. `Array.prototype.indexOf` returns `-1` for absent and is 0-based, so a faithful port either converts explicitly or uses `findIndex` and tests `>= 0` - and it must keep the "position `0` is invalid" property, because that is what makes the same pattern at L774 a genuine hazard rather than a harmless no-op.
   *
   * AN ARRAY CAN LEGITIMATELY BE EMPTY, so it is not typed as non-empty: the
   * initializer creates it empty, the `order` and order-item branches never touch
   * it, and the fulfillment branch can delete every entry it appended.
   *
   * Read back by the caller at [model/service/PromotionService.cfc:L599], which
   * iterates it to build the explicitly-qualified list that DEFECT 10 then
   * misfiles - see {@link PeriodQualification.qualifiedFulfillments}.
   */
  readonly qualifiedFulfillmentIDs: string[];

  /**
   * The order items this qualifier matched, one record each.
   *
   * A `readonly` PROPERTY HOLDING A MUTABLE ARRAY. The property is created empty at
   * [model/service/PromotionService.cfc:L634] and never reassigned - unlike
   * `qualifiedFulfillmentIDs`, it has no L660-style redundant re-empty. Its
   * contents are mutated by exactly one line, the `arrayAppend` at
   * [model/service/PromotionService.cfc:L733].
   *
   * ONLY MATCHING ITEMS APPEAR, and only the order-item branch populates it at all
   * - see the construct-then-conditionally-append parity note on
   * {@link QualifiedOrderItemDetail}. An empty array after the order-item branch
   * means no item matched, which is a different fact from the emptiness the other
   * two branches leave behind, and the legacy structure does not distinguish them.
   *
   * NOT ORDERED, AND NO ORDER MAY BE ASSUMED. Entries arrive in the iteration order
   * of `arguments.order.getOrderItems()` [model/service/PromotionService.cfc:L720],
   * with no sort anywhere. That is a deliberate contrast with the two hand-rolled
   * insertion sorts in the reward pipeline, which the shipped siblings
   * `rewardUsageTypes.ts` and `qualifiedDiscountTypes.ts` document from their own
   * sides; there is no third sort here, and adding one would impose determinism the
   * legacy engine does not have.
   */
  readonly qualifiedOrderItemDetails: QualifiedOrderItemDetail[];
}

/**
 * ONE promotion period's verdict on an order: the gate every discount passes
 * through.
 *
 * FIVE MEMBERS - FOUR LIVE, ONE DEAD. The initializer at
 * [model/service/PromotionService.cfc:L552-L557] creates FOUR keys, and the
 * illustrative docblock at [model/service/PromotionService.cfc:L86-L102] documents
 * only THREE of them. The fourth, `orderItems`, is undocumented and nevertheless
 * live. The fifth member below, `qualifiedFulfillments`, is never created by that
 * initializer at all and is the dead field DEFECT 10 consists of.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L556]: THE INITIALIZATION HAS FOUR KEYS, NOT THREE, AND THE DOCBLOCK IS INCOMPLETE. L553 seeds `qualificationsMeet = true`, L554 `qualifiedFulfillmentIDs = []`, L555 `qualifierDetails = []` and L556 `orderItems = {}` - but the authoritative docblock at L86-L102 lists only the first three, so `orderItems` exists in the code and nowhere in the documentation.
 * Omitting it from this type would not merely lose a comment: it would break the per-item qualification-count path ENTIRELY, because L212-L213 populate it, L217 gates on it and L222 reads it into the `qualificationQuantity` that sizes every item-level discount. The docblock is treated as intent and the code as behaviour, and where they disagree the code wins - which is the same rule DEFECT 10 below is resolved by.
 *
 * BUILT ONCE PER PERIOD, THEN MEMOIZED. Both consumers guard construction with
 * `structKeyExists` [model/service/PromotionService.cfc:L192, L1048] so a period
 * that appears on several rewards is evaluated once. That is why the members
 * document mutability against the whole enclosing invocation rather than against a
 * single statement: the same record is read - and in one member's case written -
 * repeatedly, across the entire reward loop.
 *
 * THE STRUCTURE IS ORDER-INDEPENDENT EXCEPT THROUGH `orderItems`. Nothing else
 * here accumulates: the three other live members are computed by
 * `getPromotionPeriodQualificationDetails` and then only read. `orderItems`
 * accumulates entries across the reward loop, which is why it is the one member of
 * this type whose contents outlive the helper that created it.
 */
export interface PeriodQualification {
  /**
   * Whether this promotion period qualifies at all.
   *
   * MUTABLE, AND THE MUTABILITY IS LOAD-BEARING. Do NOT mark this `readonly`. It is
   * seeded `true` at [model/service/PromotionService.cfc:L553] - OPTIMISTIC BY
   * DEFAULT - and cleared at three separate points, each of which disqualifies the
   * period for a different reason:
   *
   *   * [model/service/PromotionService.cfc:L569] - the period use count reached
   *     `getMaximumUseCount()`.
   *   * [model/service/PromotionService.cfc:L578] - this account's use count reached
   *     `getMaximumAccountUseCount()`.
   *   * [model/service/PromotionService.cfc:L613] - a qualifier returned a zero
   *     qualification count, which triggers the early return.
   *
   * THE TWO USE-COUNT GATES ARE ASYMMETRIC, AND THE ASYMMETRY IS DELIBERATE. Both
   * are guarded by `!isNull(...) && ... gt 0`
   * [model/service/PromotionService.cfc:L566, L574], so an absent maximum means
   * UNLIMITED - which matches the entity, where both columns are `notnull="false"`
   * with `hb_nullRBKey="define.unlimited"` [model/entity/PromotionPeriod.cfc:L55,
   * L56] - and a stored `0` ALSO means unlimited, because `0 gt 0` is false. The
   * account gate additionally requires an account: L575 tests
   * `!isNull(arguments.order.getAccount())`, so a guest order SKIPS the
   * account-use-count check entirely and can use an account-limited promotion
   * without ever consuming a per-account use. `OrderView.accountID` is
   * `string | undefined` for exactly this reason.
   *
   * A PLAIN `boolean`, NEVER AN ENUM OR A REASON CODE. The legacy value carries no
   * reason, and the caller never asks for one: both consumers test it and nothing
   * more. Enriching it would invent information the structure does not hold.
   *
   * CFML parity [model/service/PromotionService.cfc:L197, L1053]: both consumers read this member as a bare condition - `if(promotionPeriodQualifications[...].qualificationsMeet)` - and it is a genuine boolean, so `if (periodQualification.qualificationsMeet)` is the faithful port with no `> 0` conversion needed. It is the ONLY member of this type for which a bare truthiness test is correct.
   * The reason to say so explicitly is that its two sibling gates are NOT booleans and are nonetheless tested the same way in the source: `QualifierQualification.qualificationCount` at L593 and the `orderItems` entry at L217 are both numbers relying on CFML's falsy zero. Confusing the three is the most likely way to port this structure incorrectly.
   *
   * CFML parity [model/service/PromotionService.cfc:L584, L619-L623]: when this member is cleared by either use-count gate, the qualifier loop at L587-L618 is SKIPPED WHOLESALE - L584 tests it before entering - yet execution still falls through to L621 and returns normally at L626. So a use-count-disqualified period returns a record whose `qualifiedFulfillmentIDs` still holds EVERY fulfillment from the L559-L561 seed and whose `qualifierDetails` is empty.
   * A consumer must therefore test `qualificationsMeet` FIRST and never infer disqualification from an empty `qualifierDetails` or a populated `qualifiedFulfillmentIDs`, both of which are also the shapes a perfectly qualifying period with no qualifiers produces.
   */
  qualificationsMeet: boolean;

  /**
   * The fulfillments this period permits, as OPAQUE IDs. Seeded with ALL of them.
   *
   * A `readonly` PROPERTY HOLDING A MUTABLE ARRAY. The property is reassigned once,
   * by the early-return reset at [model/service/PromotionService.cfc:L614], which
   * writes a fresh empty array; its contents are mutated by the seeding
   * `arrayAppend` at [model/service/PromotionService.cfc:L560]. Typing it
   * `readonly qualifiedFulfillmentIDs: string[]` keeps both expressible - the reset
   * becomes an in-place clear, which is observably identical for a value that is
   * returned immediately afterwards and never aliased.
   *
   * CFML parity [model/service/PromotionService.cfc:L559-L561]: THE DEFAULT IS "ALL FULFILLMENTS QUALIFY". The loop at L559 appends EVERY `orderFulfillment.getOrderFulfillmentID()` on the order before any qualifier is evaluated, and no line anywhere ever appends to this array again - it is only ever NARROWED, never widened.
   * An empty array therefore means "NOTHING qualifies", NOT "no restriction". That inversion is the single most dangerous misreading available in this file: a consumer that treats emptiness as permissive would apply discounts to every fulfillment of an order the legacy engine grants none to, and it would do so silently because the resulting amounts are plausible. Seed from the order's fulfillments, then narrow.
   *
   * CFML parity [model/service/PromotionService.cfc:L209, L351]: both reads probe this array with `arrayFind`, which returns a 1-BASED INDEX OR `0` and is NOT a boolean. L209 gates the order-item reward branch on `arrayFind(...qualifiedFulfillmentIDs, orderItem.getOrderFulfillment().getOrderFulfillmentID())` and L351 gates the fulfillment reward branch on the same call for the fulfillment's own ID.
   * The ported consumer MUST write an explicit `> 0` when converting from a 1-based position, or use `Array.prototype.includes` / `findIndex(...) >= 0` with its own 0-based semantics stated at the call site. NEVER write `if (arrayFind(...))` and never port `arrayFind` as a predicate: the same value is consumed as an arithmetic POSITION elsewhere in this file - at L708-L709 and at L774 - so a boolean-returning translation would be wrong in one place while looking right in the other.
   *
   * CFML parity [model/service/PromotionService.cfc:L599-L605, L621-L623]: the narrowing that the qualifier loop computes DOES NOT LAND HERE. L599 iterates each fulfillment qualifier's own `qualifiedFulfillmentIDs` and L602-L603 accumulate the union into a LOCAL array, which L622 then writes to the dead field rather than to this member.
   * The consequence is that this member is NEVER actually narrowed by a fulfillment qualifier in the current code - it is either the complete seed or, after the early return, empty. That is behaviour, not a reading error, and it is what DEFECT 10 below causes. Do not "restore" the narrowing.
   */
  readonly qualifiedFulfillmentIDs: string[];

  /**
   * Each qualifier's verdict, in the order the qualifiers were evaluated.
   *
   * A `readonly` PROPERTY HOLDING A MUTABLE ARRAY. Created empty at
   * [model/service/PromotionService.cfc:L555], reassigned once by the early-return
   * reset at [model/service/PromotionService.cfc:L615], and appended to at
   * [model/service/PromotionService.cfc:L609] once per qualifier that survives.
   *
   * ONLY SURVIVING QUALIFIERS APPEAR, AND IF ANY QUALIFIER FAILS THE ARRAY IS
   * EMPTIED. The append at L609 sits in the truthy arm of the bare test at L593;
   * the falsy arm at L612-L617 clears this array and returns. So the array is
   * either complete - one entry per qualifier on the period - or empty. A partial
   * array is not a state this type can be in, which is why nothing here is typed as
   * possibly-partial and why a consumer must not treat a short array as "some
   * qualifiers matched".
   *
   * ORDERED BY THE PERIOD'S OWN QUALIFIER COLLECTION, with no sort applied: L587
   * iterates `arguments.promotionPeriod.getPromotionQualifiers()` directly. The
   * ordering is therefore whatever the persistence layer returns for that
   * one-to-many association [model/entity/PromotionPeriod.cfc:L63]. Because the
   * loop short-circuits on the first failure, that ordering decides WHICH
   * qualifier's failure disqualifies the period - though not WHETHER it is
   * disqualified, since any single failure is fatal. Do not impose an order here.
   *
   * AN EMPTY ARRAY IS ALSO THE NORMAL SHAPE FOR A PERIOD WITH NO QUALIFIERS, which
   * qualifies unconditionally: the loop body never runs, `qualificationsMeet` stays
   * `true`, and this array stays empty. Emptiness is thus ambiguous on its own and
   * must always be read alongside `qualificationsMeet` - the same caution the
   * L619-L623 note on that member records from the other direction.
   */
  readonly qualifierDetails: QualifierQualification[];

  /**
   * The per-order-item qualification count, keyed by opaque `orderItemID`.
   *
   * THE UNDOCUMENTED FOURTH KEY. Created as `{}` at
   * [model/service/PromotionService.cfc:L556] and absent from the authoritative
   * docblock at [model/service/PromotionService.cfc:L86-L102] - see the
   * `LEGACY-NOTE` on this interface. It is emphatically NOT the dead field: it is
   * written, gated on, and read, all by the caller.
   *
   * A LIVE MUTABLE MEMO, POPULATED BY THE CALLER RATHER THAN THE PRODUCER. This is
   * the member that makes this type different from every other structure in this
   * folder: `getPromotionPeriodQualificationDetails` creates it EMPTY and never
   * fills it. The filling happens in `updateOrderAmountsWithPromotions`, inside the
   * reward loop, one order item at a time:
   *
   *   * [model/service/PromotionService.cfc:L212] guards with
   *     `if(!structKeyExists(...orderItems, orderItem.getOrderItemID()))`.
   *   * [model/service/PromotionService.cfc:L213] assigns
   *     `getPromotionPeriodOrderItemQualificationCount(promotionPeriod=..., orderItem=..., order=...)`.
   *   * [model/service/PromotionService.cfc:L217] gates the reward on the stored
   *     value.
   *   * [model/service/PromotionService.cfc:L222] reads it into
   *     `qualificationQuantity`, which then sizes the discount.
   *
   * A `readonly` PROPERTY HOLDING A MUTABLE RECORD, and the mutability is
   * load-bearing: the property is never reassigned, but keys are ADDED to it across
   * the reward loop and the added entries must survive for the next reward that
   * visits the same order item. Marking it `Readonly<Record<...>>` would make L213
   * inexpressible and force a rebuild per reward, which would change the money -
   * because it CACHES A COMPUTED COUNT that the caller then uses to size a
   * discount, and recomputing it per reward would multiply the DAO-free but
   * order-wide work at L783-L849 while leaving the guard at L212 pointless. It is a
   * behavioural memo, not a tuning device.
   *
   * `Record<string, number>` - A COUNT, NOT MONEY AND NOT A BOOLEAN. The stored
   * value is whatever
   * {@link GetPromotionPeriodOrderItemQualificationCount} returned: a unit count
   * derived from order quantities and integer division
   * [model/service/PromotionService.cfc:L830-L831], floored at `0` by the early
   * return at [model/service/PromotionService.cfc:L840-L842]. The key is the opaque
   * `orderItemID`, never parsed and never resolved back to an entity.
   *
   * CFML parity [model/service/PromotionService.cfc:L217]: THE GATE IS A BARE NUMERIC TRUTHINESS TEST - `if(promotionPeriodQualifications[...].orderItems[ orderItemID ])` - relying on CFML treating `0` as false. THE PORTED CONSUMER MUST WRITE AN EXPLICIT `> 0`.
   * Under `noUncheckedIndexedAccess` the indexed read types as `number | undefined`, so the consumer must NARROW rather than assert - read the entry into a local and test it - and `@typescript-eslint/no-non-null-assertion` is an error across `src/**`, so neither `!` nor `as` is available. That is not friction to route around: the legacy `structKeyExists` guard at L212 maps exactly onto TypeScript narrowing, and the compiler then proves what the CFML only assumed.
   *
   * CFML parity [model/service/PromotionService.cfc:L613-L616]: THE EARLY-RETURN RESET SPARES THIS MEMBER. When a qualifier fails, L613 clears `qualificationsMeet`, L614 empties `qualifiedFulfillmentIDs` and L615 empties `qualifierDetails` - and NOTHING clears `orderItems`, which keeps whatever it had accumulated.
   * Reproduce the asymmetry; do NOT normalise the reset to cover all four keys. In the current code the surviving contents are unobservable, because the reset runs inside the producer before the caller has had any chance to add a key - but the reset is also the ONLY place any of these members is cleared, so a port that "tidies" it establishes a different invariant than the one the legacy structure has, and the next change to the caller would then behave differently for a reason nobody could see.
   */
  readonly orderItems: Record<string, number>;

  /**
   * DEAD FIELD. Written once, never initialized, never read.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: A THREE-WAY MISMATCH. `if(arrayLen(explicitlyQualifiedFulfillmentIDs)) { qualificationDetails.qualifiedFulfillments = explicitlyQualifiedFulfillmentIDs; }` is wrong in three independent ways at once. (1) WRONG LEVEL - the docblock at [model/service/PromotionService.cfc:L93] places `qualifiedFulfillments` INSIDE a `qualifierDetails` entry, one nesting level down, while L622 writes it on `qualificationDetails` itself, the PERIOD level, which the L552-L557 initializer never gave that key; the qualifier-level initializer at L630-L635 does not create it either, so the name exists at no level in any initializer. (2) WRONG TYPE - the docblock promises entities, `qualifiedFulfillments = [ entity ]`, while the assigned local holds ID STRINGS: it is created empty at L563 and L602-L603 append `orderFulfillmentID` values taken from each qualifier's own `qualifiedFulfillmentIDs`. (3) ORPHANED - a whole-file search proves `qualifiedFulfillments`, WITHOUT the `IDs` suffix, appears EXACTLY TWICE in the entire component: the L93 docblock line and this L622 write. It is never initialized and never read, and the caller reads `qualifiedFulfillmentIDs` instead, at L209 and L351.
   * Preserved deliberately; do not fix without a product decision. Repairing it would silently alter WHICH FULFILLMENTS QUALIFY - the fulfillment-qualifier narrowing this local computed would begin reaching the caller for the first time, so orders that currently discount every fulfillment would discount only the explicitly-qualified subset. That is a change in the money, arrived at by making the code look tidier, which is the exact failure mode the defect register exists to prevent.
   *
   * WHY IT IS DECLARED AT ALL, RATHER THAN OMITTED. Its presence on this type is
   * the auditable record that the defect was found deliberately rather than missed.
   * An omitted dead field is indistinguishable from an overlooked one, and a
   * reviewer checking the register entry for L621-L623 against the port needs
   * something to check. Declaring it also keeps the reproduction WRITABLE:
   * `src/services/promotion/promotionPeriodQualification.ts` (planned) reproduces
   * the L621-L623 write, and a type without this member would reject it.
   *
   * OPTIONAL, AND `exactOptionalPropertyTypes` IS LOAD-BEARING HERE. The field is
   * written only when `arrayLen(explicitlyQualifiedFulfillmentIDs)` is non-zero -
   * that is, only when at least one fulfillment qualifier explicitly qualified at
   * least one fulfillment - so in normal operation it is genuinely ABSENT, which is
   * a DIFFERENT STATE from present-but-`undefined`. `exactOptionalPropertyTypes`
   * keeps those two states distinct, exactly as it keeps a `structKeyExists` miss
   * distinct from a stored null elsewhere in the target. Hence `?:` with no
   * `undefined` in the union: writing `qualifiedFulfillments: string[] | undefined`
   * would make the field REQUIRED and force every producer to mention it, including
   * the L613-L616 early-return path that never reaches L621.
   *
   * TYPED AS ID STRINGS BECAUSE THAT IS WHAT THE CODE ASSIGNS. The docblock's
   * `[ entity ]` promise is not honoured by any line that runs, so the type follows
   * the assignment rather than the comment - the same source-over-docblock rule that
   * resolves the undocumented `orderItems` key above, applied in the opposite
   * direction.
   *
   * DO NOT make it required, DO NOT delete it, and DO NOT rename it to
   * `qualifiedFulfillmentIDs` - the near-identical live member is the second
   * property of this interface, three positions above, and the two are NOT
   * interchangeable. Renaming would merge a dead field into a live one and thereby
   * perform the very repair this marker forbids.
   *
   * THIS IS A REPRODUCTION, NOT A DIVERGENCE. This folder's divergence budget is
   * ZERO and stays ZERO. The project's three documented divergences are the
   * un-`var`'d discount leak and the `amountOff` float gap, both belonging to
   * `src/services/**`, and the entity memo bugs, belonging to
   * `src/domain/entities/**`. There is no fourth, and neither this defect nor the
   * `hasShippingMethod` re-test documented on {@link QualifierQualification.qualifier}
   * spends one.
   */
  qualifiedFulfillments?: string[];
}

/**
 * The memo's key: a `promotionPeriodID`, and specifically whatever
 * {@link PromotionPeriod.getPromotionPeriodID} returns.
 *
 * `string` by construction, so `Record<PromotionPeriodQualificationKey, T>` is
 * exactly `Record<string, T>` - the alias names the key's provenance without
 * narrowing it, and no consumer needs to convert anything.
 *
 * JUDGMENT CALL: the key is DERIVED from the entity accessor rather than written as a bare `string`, because every one of the four memo operations reaches it through the same accessor chain and the type should say so. [model/service/PromotionService.cfc:L192] and L193 guard and populate with `reward.getPromotionPeriod().getPromotionPeriodID()`, L197, L209, L212, L213, L217 and L222 all read through it, and consumer #2 repeats the pattern at L1048, L1049 and L1053. Anchoring the alias to the accessor's return type makes that compile-checked: if the entity's identifier shape ever changed, this alias changes with it and every consumer is forced to reconcile rather than silently coercing.
 * It also gives the `PromotionPeriod` import a load-bearing type position instead of a decorative one, which matters under `noUnusedLocals`: the entity is genuinely part of this contract - it supplies the key AND the two use-count limits the producer reads at L566, L568, L574 and L577 - and an import that only appeared in prose would be an import this file does not need. The same reasoning is used by the shipped sibling `rewardUsageTypes.ts` for its own reward key, so the two agree by construction rather than by coincidence.
 */
export type PromotionPeriodQualificationKey = ReturnType<PromotionPeriod['getPromotionPeriodID']>;

/**
 * The memo itself: every promotion period's verdict, keyed by `promotionPeriodID`.
 *
 * MUTABLE, DELIBERATELY. Not `Readonly<Record<...>>`: keys are ADDED lazily during
 * the reward pass, by the guarded assignments at
 * [model/service/PromotionService.cfc:L192-L193] and
 * [model/service/PromotionService.cfc:L1048-L1049], to structures that start life
 * as `{}` at [model/service/PromotionService.cfc:L136] and
 * [model/service/PromotionService.cfc:L1038]. A `Readonly` wrapper would make both
 * populate sites inexpressible, and freezing the value type would collide with the
 * two mutable members and the mutable `orderItems` record documented on
 * {@link PeriodQualification}.
 *
 * REQUEST-SCOPED, NEVER MODULE STATE. Both legacy memos are method-local `var`s,
 * and the port must keep them that way - a module-level memo on a warm Lambda
 * container would leak one customer's qualification verdict into another
 * customer's order. This type is a shape, so it cannot enforce the scoping by
 * itself; the obligation belongs to
 * `src/services/promotion/promotionPeriodQualification.ts` (planned) and
 * `src/services/promotionService.ts` (planned).
 *
 * ONE MEMO PER INVOCATION, NOT ONE PER PROCESS AND NOT ONE SHARED BETWEEN THE TWO
 * CONSUMERS. The two legacy memos are independent structures that never see each
 * other, so the same period can be evaluated twice within one request - once by
 * each consumer - and that is the faithful behaviour. Do not "optimise" by sharing
 * a memo across them: consumer #2 populates from an order it derived through a
 * fulfillment [model/service/PromotionService.cfc:L1049], and a shared memo would
 * let one consumer's order silently answer the other consumer's question.
 *
 * THE CONSUMER MUST NARROW, NOT ASSERT. `noUncheckedIndexedAccess` types every
 * indexed read of this record as `PeriodQualification | undefined`, and
 * `@typescript-eslint/no-non-null-assertion` is an error across `src/**`, so
 * neither `!` nor `as` is available. The legacy `structKeyExists` guards at
 * [model/service/PromotionService.cfc:L192] and
 * [model/service/PromotionService.cfc:L1048] map exactly onto TypeScript
 * narrowing: read the entry into a local and test it. Consumer #1 in particular
 * re-indexes this record SIX more times after populating it - at L197, L209, L212,
 * L213, L217 and L222 - and every one of those becomes a narrowing site rather
 * than an assertion site.
 */
export type PromotionPeriodQualifications = Record<
  PromotionPeriodQualificationKey,
  PeriodQualification
>;

/**
 * The signature of the period-qualification producer.
 *
 * Implementing function: `getPromotionPeriodQualificationDetails`, in
 * `src/services/promotion/promotionPeriodQualification.ts` (planned). Legacy
 * original: `private struct function getPromotionPeriodQualificationDetails(required any promotionPeriod, required any order)`
 * [model/service/PromotionService.cfc:L549].
 *
 * ASYNC, AND THE `Promise` IS NOT OPTIONAL. The async boundary rule for this port
 * is that a method becomes asynchronous if and only if its legacy body reaches the
 * DAO or the ORM. This one does, twice:
 * [model/service/PromotionService.cfc:L567] calls
 * `getPromotionDAO().getPromotionPeriodUseCount(promotionPeriod = ...)` and
 * [model/service/PromotionService.cfc:L576] calls
 * `getPromotionDAO().getPromotionPeriodAccountUseCount(promotionPeriod = ..., account = ...)`.
 * Both become repository-port calls over prepared statements in
 * `src/repositories/mysql/mysqlPromotionRepository.ts`, so the ported helper is
 * `async` and returns `Promise<PeriodQualification>`. Note that the DAO is reached
 * CONDITIONALLY - each call sits behind a `!isNull(...) && ... gt 0` guard at L566
 * and L574, and the account call behind a further account-presence test at L575 -
 * so a period with no configured limits performs no query at all. The signature is
 * asynchronous regardless, because a conditionally-asynchronous function is not a
 * thing.
 *
 * PARAMETER NAMES MIRROR THE LEGACY ARGUMENT NAMES VERBATIM: `promotionPeriod` and
 * `order`, in that order. The legacy call sites are named-argument invocations
 * [model/service/PromotionService.cfc:L193, L1049], so the names are part of the
 * surface a reviewer diffs.
 *
 * TYPES REPLACE THE LEGACY `any`. `required any promotionPeriod` becomes
 * `PromotionPeriod` and `required any order` becomes `OrderView` - the read-only
 * anti-corruption projection, because the Order aggregate is out of scope. The
 * `struct` return becomes the named {@link PeriodQualification} interface rather
 * than an untyped bag.
 *
 * JUDGMENT CALL: this alias is named in PascalCase while the function it types keeps the legacy camelCase name, and that is a COMPILER CONSTRAINT rather than a style choice. A type alias named `getPromotionPeriodQualificationDetails` could not be imported by the module that must also export a function of that name: tsc 5.9.3 under this project's NodeNext strict profile rejects the pair with `error TS2395: Individual declarations in merged declaration '...' must be all exported or all local`, verified directly with a throwaway probe while authoring this file. The implementing module MUST export the legacy camelCase name to satisfy interface parity, so the alias yields.
 * No name is lost and no rename budget is spent: the legacy METHOD name survives verbatim on the implementing function, the legacy ARGUMENT names survive verbatim as the parameter names here, and every member name in this file is the legacy member name. ESLint deliberately enables no naming-convention rule, so nothing in the lint configuration forces this either way - only the type checker does.
 *
 * VISIBILITY IS WIDENED FROM `private` TO EXPORTED, AND THAT BUDGET IS SPENT
 * ELSEWHERE. The legacy method is `private`; the target promotes it so it can be
 * tested directly, which is one of exactly five permitted visibility widenings.
 * The widening is spent by the implementing module in `src/services/**`, not by
 * this file: naming a signature is not promoting anything, and this folder spends
 * none of the five.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L192-L193, L1048-L1049]: the helper is invoked from exactly two places and BOTH memoize the result behind `structKeyExists`, so the implementation must be safe to call once per period per invocation and must not assume it is called once per reward.
 * It must also tolerate an order with no fulfillments and no items: L559 and L587 both iterate collections that can be empty, in which case the returned record is `qualificationsMeet: true` with two empty arrays and an empty record - a period that qualifies vacuously.
 */
export type GetPromotionPeriodQualificationDetails = (
  promotionPeriod: PromotionPeriod,
  order: OrderView,
) => Promise<PeriodQualification>;

/**
 * The signature of the per-qualifier producer.
 *
 * Implementing function: `getQualifierQualificationDetails`, in
 * `src/services/promotion/qualifierQualification.ts` (planned). Legacy original:
 * `private struct function getQualifierQualificationDetails(required any qualifier, required any order)`
 * [model/service/PromotionService.cfc:L629].
 *
 * SYNCHRONOUS - DO NOT MAKE IT ASYNC. The body reaches no DAO and no ORM. It
 * traverses already-materialized associations on the qualifier and the order
 * views, and its one outward call is the address-zone evaluator
 * [model/service/PromotionService.cfc:L684], which the target models as the
 * `addressZoneEvaluator` port - a pure predicate over an address and a zone. The
 * ported port is therefore synchronous too, and the whole helper stays
 * synchronous. Making it `async` would be a signature reshaping, and the project's
 * three permitted reshapings are all spent: the promotion pass returning intents,
 * the two smart lists becoming typed queries, and the feed adapter returning a
 * string. There is no fourth.
 *
 * PARAMETER NAMES MIRROR THE LEGACY ARGUMENT NAMES VERBATIM: `qualifier` then
 * `order`. The single call site passes them POSITIONALLY -
 * `getQualifierQualificationDetails(qualifier, arguments.order)`
 * [model/service/PromotionService.cfc:L590] - which is a departure from the
 * named-argument style the rest of the component uses, so the ORDER of these two
 * parameters is load-bearing and must not be swapped for readability.
 *
 * TYPES REPLACE THE LEGACY `any`: `PromotionQualifier` and `OrderView`, returning
 * the named {@link QualifierQualification} interface instead of a `struct`.
 *
 * See {@link GetPromotionPeriodQualificationDetails} for why this alias is
 * PascalCase while the implementing function keeps the legacy camelCase name, and
 * for why the `private`-to-exported widening is spent in `src/services/**` rather
 * than here.
 *
 * CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: THE COMMA-LIST TOKEN-ORDER TRAP. The same three order-item type tokens are written in TWO DIFFERENT ORDERS in this component - `"merchandise,subscription,contentAccess"` at L200 and L794, and `"contentAccess,merchandise,subscription"` at L714 - and all three sites are membership tests, so the order is behaviourally irrelevant at every one of them.
 * It is recorded because it proves NO SET-ORDERING ASSUMPTION IS EVER SAFE across these lists: a port that canonicalised the token order, sorted it, or hoisted one shared constant would be making a claim the source does not support, and a port that inferred a PRIORITY from either ordering would be inventing behaviour. Test membership with `listFindNoCase(...) > 0` at each site independently, preserving each literal exactly as written.
 */
export type GetQualifierQualificationDetails = (
  qualifier: PromotionQualifier,
  order: OrderView,
) => QualifierQualification;

/**
 * The signature of the comma-delimited qualified-fulfillment list builder.
 *
 * Implementing function: `getPromotionPeriodQualifiedFulfillmentIDList`, in
 * `src/services/promotion/qualifierQualification.ts` (planned). Legacy original:
 * `private string function getPromotionPeriodQualifiedFulfillmentIDList(required any promotionPeriod, required any order)`
 * [model/service/PromotionService.cfc:L752].
 *
 * RETURNS A COMMA-DELIMITED `string`, NOT AN ARRAY - AND THIS IS THE SINGLE
 * EASIEST WAY TO BREAK THIS FILE. Two similarly-named things coexist here, with
 * two different representations and two different 1-based hazards:
 *
 *   * {@link PeriodQualification.qualifiedFulfillmentIDs} is a `string[]`, probed
 *     with `arrayFind` at [model/service/PromotionService.cfc:L209] and L351.
 *   * THIS helper's return value is a `string` accumulated with `listAppend`
 *     [model/service/PromotionService.cfc:L753, L756] and searched with
 *     `listFindNoCase` [model/service/PromotionService.cfc:L774].
 *
 * The `string` return is preserved for interface parity - the legacy declaration is
 * `returntype="string"` and the value is genuinely a CFML list. Consumers parse it
 * through the shipped `src/lib/cfml/list.ts` helpers (`listToArray`,
 * `listFindNoCase`), which are referenced here in commentary only and imported
 * nowhere, because this module declares no logic.
 *
 * SYNCHRONOUS: the body reaches no DAO and no ORM, iterating only the order's
 * fulfillments [model/service/PromotionService.cfc:L755] and the period's
 * qualifiers [model/service/PromotionService.cfc:L760].
 *
 * CFML parity [model/service/PromotionService.cfc:L774]: `listFindNoCase` RETURNS A 1-BASED POSITION OR `0`, NOT A BOOLEAN, and the shipped helper takes the LIST FIRST - `listFindNoCase(list, value, delimiters)`. NEVER write `if (listFindNoCase(...))`; `> 0` IS MANDATORY.
 * The same caution applies to `arrayFind` on the array member above, and the two must not be conflated even though both return the same "1-based position or 0" shape: one indexes a CFML list held in a string, the other indexes a real array.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L774]: THE `ListDeleteAt(list, 0)` THROW HAZARD. Verbatim: `qualifiedFulfillmentIDs = ListDeleteAt(qualifiedFulfillmentIDs, listFindNoCase(qualifiedFulfillmentIDs, orderFulfillment.getOrderFulfillmentID()) );`. The `listFindNoCase` result is consumed DIRECTLY as a 1-based position with no test, and `ListDeleteAt(list, 0)` RAISES in CFML - so this line is a latent failure for any fulfillment ID absent from the list. It gets away with it only because every fulfillment ID was appended unconditionally at L756 moments earlier, which means the hazard is masked by an invariant established elsewhere in the same function rather than by any check on this line.
 * Preserved deliberately; do not fix without a product decision. Reproduction is owned by `src/services/promotion/qualifierQualification.ts` (planned) - the shipped `src/lib/cfml/list.ts` records the same hand-off in its own notes and deliberately does not export a `listDeleteAt`, so the annotated reproduction belongs at the call site. This alias's obligation is to record the hazard and keep it expressible by typing the return as a `string` rather than as a parsed array, which is what makes a positional delete writable at all.
 *
 * CFML parity [model/service/PromotionService.cfc:L774]: the same expression writes `ListDeleteAt` with a CAPITAL `L` and `listFindNoCase` with a lowercase `l`, because CFML identifiers are case-insensitive. TypeScript is case-sensitive, so the ported code must use the single canonical `src/lib/cfml/list.ts` spelling of each name and cannot mirror the source's inconsistency.
 * The same property is why a dedicated case-insensitive struct-key helper exists elsewhere in `src/lib/cfml/`: CFML's case-insensitivity is pervasive, not incidental, and every ported comparison and struct-keyed lookup was audited rather than assumed.
 *
 * CFML parity [model/service/PromotionService.cfc:L753, L756]: the accumulator starts as `""` and the FIRST `listAppend` MUST NOT EMIT A LEADING DELIMITER - the shipped `listAppend` is pure and satisfies `listAppend('', v) === v`. The same empty-accumulator pattern appears at L861, L896, L931 and L962 inside the membership walks.
 * A leading comma would corrupt every downstream `listFindNoCase` and `listGetAt` position by one, which is precisely the class of off-by-one that the 1-based helpers make hard to notice.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L864-L865, L899-L900, L934-L935, L965-L966]: the membership walks pair `listLen` with `listGetAt` over a 1-based index, and `listGetAt` is 1-BASED. The shipped `src/lib/cfml/list.ts` implements that faithfully AND THROWS `CfmlListIndexError` out of range - it does NOT return `''`, contrary to what a reader might assume from a permissive reading.
 * Recorded as a correction rather than a preference: a consumer written against a silently-empty-string helper would treat an out-of-range read as a non-match instead of as a failure, and the two behaviours diverge exactly where a 1-based loop bound is wrong. See the fifth locator correction in this module's header.
 */
export type GetPromotionPeriodQualifiedFulfillmentIDList = (
  promotionPeriod: PromotionPeriod,
  order: OrderView,
) => string;

/**
 * The signature of the per-order-item qualification counter.
 *
 * Implementing function: `getPromotionPeriodOrderItemQualificationCount`, in
 * `src/services/promotion/promotionPeriodQualification.ts` (planned). Legacy
 * original:
 * `private numeric function getPromotionPeriodOrderItemQualificationCount(required any promotionPeriod, required any orderItem, required any order)`
 * [model/service/PromotionService.cfc:L783].
 *
 * RETURNS A GENUINE `number` - A COUNT, NEVER `Money`. The value is built from
 * order-item quantities: it is seeded to `arguments.order.getTotalSaleQuantity()`
 * at [model/service/PromotionService.cfc:L785], accumulated per item at
 * [model/service/PromotionService.cfc:L825], divided at
 * [model/service/PromotionService.cfc:L831], and reduced to the minimum across
 * qualifiers at [model/service/PromotionService.cfc:L835-L837]. Its destination is
 * {@link PeriodQualification.orderItems}, and from there the `qualificationQuantity`
 * that sizes a discount [model/service/PromotionService.cfc:L222] - so it
 * MULTIPLIES a money amount without ever being one.
 *
 * SYNCHRONOUS: no DAO and no ORM. It walks the period's qualifiers
 * [model/service/PromotionService.cfc:L788] and the order's items
 * [model/service/PromotionService.cfc:L797] over already-materialized
 * associations, and calls `getOrderItemInQualifier` at
 * [model/service/PromotionService.cfc:L805], which is likewise synchronous
 * materialized-path work.
 *
 * PARAMETER NAMES AND ORDER MIRROR THE LEGACY SIGNATURE VERBATIM:
 * `promotionPeriod`, `orderItem`, `order`. The single call site is a
 * named-argument invocation [model/service/PromotionService.cfc:L213], and note
 * that BOTH an individual `orderItem` and the whole `order` are passed - the helper
 * compares every other item on the order against the one it is counting for, at
 * [model/service/PromotionService.cfc:L808-L818]. Neither parameter is redundant.
 *
 * SEEDED PERMISSIVELY, THEN NARROWED. Because L785 seeds the order's total sale
 * quantity, a period with NO order-item qualifiers returns that total unchanged -
 * "every item quantity qualifies". The narrowing only happens inside the
 * `listFindNoCase("merchandise,subscription,contentAccess", ...)` branch at
 * [model/service/PromotionService.cfc:L794], so a period whose qualifiers are all
 * `order` or `fulfillment` type never narrows this count at all. This mirrors the
 * all-fulfillments seed documented on
 * {@link PeriodQualification.qualifiedFulfillmentIDs}: both defaults are permissive
 * and both are only ever narrowed.
 *
 * CFML parity [model/service/PromotionService.cfc:L830-L831]: `qualifierCount = int(qualifierCount / qualifier.getMinimumItemQuantity() );` - CFML's `int()` TRUNCATES TOWARD ZERO, it does not round. 7 units against a minimum of 2 yields 3, not 4.
 * `Math.trunc` is the faithful operator. `Math.round` would grant an extra qualification and therefore an extra discount, and `Math.floor` only coincides because these operands are non-negative in practice - the same truncation is required at L743 on {@link QualifierQualification.qualificationCount}, so both sites must use one operator. As at L743, the divisor is guarded only for null [model/service/PromotionService.cfc:L830], so a stored `0` minimum item quantity is passed through to the division; the guard is reproduced as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L840-L842]: the EARLY `return 0` fires as soon as the running minimum reaches zero or below - `if(allQualifiersCount <= 0) { return 0; }` - so remaining qualifiers are NEVER EVALUATED once any qualifier disqualifies the item.
 * That short-circuit is observable through the qualifier-side work it skips, and it also means the returned `0` is a genuine zero rather than a negative: the test admits negatives but the return does not propagate one. The caller's bare truthiness gate at L217 then treats that zero as false, which is why the ported consumer must write `> 0` - see the parity note on {@link PeriodQualification.orderItems}.
 */
export type GetPromotionPeriodOrderItemQualificationCount = (
  promotionPeriod: PromotionPeriod,
  orderItem: OrderItemView,
  order: OrderView,
) => number;
