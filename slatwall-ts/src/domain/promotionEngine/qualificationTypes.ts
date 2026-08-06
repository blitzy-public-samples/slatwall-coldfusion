/**
 * Promotion-period and qualifier QUALIFICATION contracts: the gate that decides whether any
 * discount is computed at all. Type declarations only, from
 * [model/service/PromotionService.cfc:L549-L627], including the never-read `qualifiedFulfillments`
 * key preserved as a documented dead field.
 *
 * Qualification sits upstream of the money: an order item that fails to qualify never reaches the
 * discount arithmetic, and a period that fails its use-count gate never reaches the reward loop.
 *
 * Mutability is per-member and evidence-driven - a uniform `Readonly<>` would make the legacy code
 * inexpressible and a uniform mutable would licence writes it never performs - so every marking
 * below cites the lines that justify it. The recurring shape is a `readonly` PROPERTY holding a
 * MUTABLE collection. Nothing here is monetary: the counts and thresholds are genuinely `number`,
 * and the qualifier's monetary gates are typed on the entity instead. Nothing here is persisted
 * either: `promotionPeriodID`, `orderFulfillmentID` and `orderItemID` are opaque strings, carried
 * verbatim and never parsed.
 *
 * The three `src/domain/promotionEngine/` modules import nothing from each other, which is what
 * lets any one be regenerated without touching the other two. Real couplings in the algorithm - the
 * qualification count typed here is multiplied by the ledger's `maximumUsePerQualification` at
 * [model/service/PromotionService.cfc:L223-L224, L228] - happen in `src/services/promotion/**`, not
 * through a type import.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L136, L1038]: there are TWO consumers, each with
 * its own method-local memo. `updateOrderAmountsWithPromotions` declares its memo at L136,
 * populates at L192-L193 and reads every live member (L197, L209, L212-L213, L217, L222, L351);
 * `getShippingMethodOptionsDiscountAmountDetails` [L1032] declares its own at L1038, populates at
 * L1048-L1049 and reads ONLY `qualificationsMeet`, at L1053. Two consequences bind these types: a
 * `PeriodQualification` must be usable when only `qualificationsMeet` is consulted, and the order
 * does not always arrive as the enclosing method's parameter - consumer #2 derives it through
 * `getOrderFulfillment().getOrder()` at L1049 - so the helper signatures take it explicitly and
 * assume nothing about its provenance.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L569, L578, L613]: these three statements are the
 * entire set of places a period can be disqualified. L570-L571 are closing braces and L614 is the
 * `qualifiedFulfillmentIDs` reset, so a reviewer checking the set must land on the statements
 * rather than the braces beside them.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L752-L781]:
 * `getPromotionPeriodQualifiedFulfillmentIDList` is DEAD CODE - declared `private` and never
 * invoked anywhere in `model/`, `integrationServices/`, `admin/` or `frontend/` - so its
 * `ListDeleteAt` hazard has never run. It is typed below anyway, so the comma-list versus array
 * distinction stays visible; its deadness is recorded so nobody mistakes it for the live
 * fulfillment path, `PeriodQualification.qualifiedFulfillmentIDs`.
 *
 * LEGACY-NOTE [slatwall-ts/src/lib/cfml/list.ts:L271-L316]: the shipped `listGetAt` THROWS
 * `CfmlListIndexError` - declared at [slatwall-ts/src/lib/cfml/list.ts:L137-L159] - rather than
 * returning `''` out of range, mirroring CFML's own `ListDeleteAt(list, 0)`. Recorded here because
 * the comma-list helper typed below is the one place in this file where that hazard is reachable.
 *
 * (These locators read `L477-L529`, past the end of a 464-line file, until a review checked them
 * against disk. The referent had not moved; the citation had never matched it.)
 */
import type { PromotionPeriod } from '../entities/promotionPeriod.js';
import type { PromotionQualifier } from '../entities/promotionQualifier.js';
import type { OrderItemView } from '../views/orderItemView.js';
import type { OrderView } from '../views/orderView.js';

// LEGACY-NOTE [model/service/PromotionService.cfc:L554, L560, L633, L666]: every
// fulfillment-related member below is an OPAQUE ID STRING, because that is what the legacy
// structures hold - L554 and L633 seed empty arrays, L560 and L666 append
// `orderFulfillment.getOrderFulfillmentID()`. No qualification structure holds a fulfillment
// object, so `orderFulfillmentView.ts` is deliberately not imported; the fulfillment view remains
// the right type for the code that PRODUCES these IDs, and `qualifierQualification.ts` imports it
// there.

/**
 * One order item's qualification count under ONE qualifier.
 *
 * Exactly two members: the single construction site [model/service/PromotionService.cfc:L722-L725]
 * builds these two keys and no others. Both are `readonly` on the evidence - constructed fresh per
 * item at L722, count written once at L729, appended at L733, and never revisited once in the
 * array.
 *
 * CFML parity [model/service/PromotionService.cfc:L722-L735]: the record is built BEFORE the
 * membership test and appended only INSIDE it, so a non-matching item leaves a fully-constructed
 * record that is silently discarded rather than appended with a count of zero.
 * `qualifiedOrderItemDetails` therefore holds only matching items, and an absent order item means
 * "did not match" rather than "matched zero times". Hoisting the append would add entries the
 * legacy array never contains.
 */
export interface QualifiedOrderItemDetail {
  /**
   * The order item this count belongs to.
   *
   * The whole view, not an ID - the one place in this file where an association is held as an
   * object, because [model/service/PromotionService.cfc:L723] assigns the loop variable itself.
   * Contrast `qualifiedFulfillmentIDs`, which holds ID strings because L666 appends
   * `getOrderFulfillmentID()`. The asymmetry is the legacy structure's.
   */
  readonly orderItem: OrderItemView;

  /**
   * How many units of this order item qualified under this qualifier.
   *
   * A count, so `number` rather than `Money`: [model/service/PromotionService.cfc:L729] assigns
   * `orderItem.getQuantity()` verbatim once the membership test at L727 passes.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L730, L743]: this is NOT what
   * `QualifierQualification.qualificationCount` holds. The per-item counts are summed into a
   * separate accumulator at L730, and the qualifier's own count is that SUM divided by the minimum
   * item quantity at L743 - so the two members share a name and a type while measuring different
   * things. Both legacy names are kept for interface parity.
   */
  readonly qualificationCount: number;
}

/**
 * ONE qualifier's verdict on an order.
 *
 * Exactly four members, from the initializer at [model/service/PromotionService.cfc:L630-L635]. The
 * illustrative docblock at L90-L100 lists four too, but not the same four - it names
 * `qualifiedFulfillments` where the code creates `qualifiedFulfillmentIDs`, which is the defect
 * documented on {@link PeriodQualification}. The code is the authority.
 *
 * Three branches write this record and they write DIFFERENT members, so which members end up
 * meaningful depends entirely on which branch ran:
 *
 *   * `order` [model/service/PromotionService.cfc:L638] sets the count to `1` at L641 and zeroes
 *     it at L652 if any of the four order-level gates at L644-L651 fails. It touches neither
 *     collection.
 *   * `fulfillment` [model/service/PromotionService.cfc:L656] re-zeroes at L659, re-empties the
 *     ID array at L660, counts upward and appends at L665-L666, then decrements and deletes at
 *     L707-L709 per fulfillment that fails the composite gate. It never touches
 *     `qualifiedOrderItemDetails`.
 *   * the order-item family, gated at [model/service/PromotionService.cfc:L714], re-zeroes at
 *     L717, appends matching items at L733 and derives the count by integer division at L743. It
 *     never touches `qualifiedFulfillmentIDs`.
 *
 * A consumer cannot infer the branch from the members: an empty `qualifiedFulfillmentIDs` means "no
 * fulfillment qualified" after one branch and "not a fulfillment qualifier" after the others. The
 * legacy structure carries no discriminant and none is invented here.
 *
 * CFML parity [model/service/PromotionService.cfc:L638, L656, L714, L747]: the dispatch has no
 * `else`. An unrecognised - or absent - qualifier type returns the record exactly as initialized,
 * count still `0`, which fails the caller's bare test at L593 and disqualifies the WHOLE period
 * through the early return at L613-L616. Silently fatal rather than ignored, so a permissive
 * default branch would grant discounts the legacy engine withholds.
 *
 * The qualifier type is not redeclared here: `PromotionQualifier.getQualifierType()` returns
 * `string | undefined`, un-narrowed because the column carries no check constraint and the
 * component declares no options accessor. A competing union here would be a second source of truth
 * and would make the no-`else` behaviour unreachable in the type system while it stays reachable at
 * runtime.
 */
export interface QualifierQualification {
  /**
   * The qualifier this verdict is about.
   *
   * `readonly` - the identity of the record rather than part of its state:
   * [model/service/PromotionService.cfc:L631] assigns it and no line reassigns it.
   *
   * The WHOLE entity, by design. The caller reads it back to decide whether an explicit fulfillment
   * qualification happened [model/service/PromotionService.cfc:L596], and the reward-side
   * membership walk needs the same entity's thirteen include and exclude collections. Holding the
   * entity is also what keeps the defect below expressible: the composite gate at L693-L704 reads
   * five distinct qualifier concerns, and `getShippingMethodIDs()` and
   * `getShippingAddressZoneIDs()` are separate accessors over separate link tables
   * [model/entity/PromotionQualifier.cfc:L74, L75] that a "shipping eligibility" projection would
   * collapse.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zones clause of
   * the composite gate RE-TESTS THE SHIPPING METHOD instead of testing the zone condition - it is
   * entered only when address zones are configured and then duplicates the
   * `!hasShippingMethod(...)` test the preceding clause at L701 already performs, so a fulfillment
   * whose shipping method is absent from the collection is disqualified twice while the zone
   * membership the clause is named for is never consulted. The genuine zone evaluation happens
   * separately at L672-L690 and lands in the local flag L693 tests. Preserved deliberately; do not
   * fix without a product decision - repairing it changes which fulfillments qualify, and therefore
   * the money. Reproduction is owned by `src/services/promotion/qualifierQualification.ts`; this
   * member's narrower obligation is to keep the two shipping concerns separately addressable.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L360, L678, L703]: a null-guard asymmetry that
   * must not be normalised. L360, in the fulfillment-REWARD branch, guards
   * `!isNull(orderFulfillment.getAddress())`; L678 and L703, both in this qualifier branch,
   * dereference `getAddress().getNewFlag()` with no null check. The three lines also use two
   * accessors for the same flag, `isNew()` at L360 and `getNewFlag()` at L678 and L703. This is why
   * `src/domain/views/orderFulfillmentView.ts` types `address` as optional and records the same
   * finding independently. Do not harmonise the guard.
   */
  readonly qualifier: PromotionQualifier;

  /**
   * How many times this qualifier qualifies.
   *
   * Mutable, load-bearingly so: six lines write it and two are in-place arithmetic -
   * [model/service/PromotionService.cfc:L641] sets `1`, L652 zeroes, L659 re-zeroes, L665
   * increments, L707 decrements, and L717 re-zeroes before L743 assigns the divided result. A
   * `readonly` marking would make the increment-then-decrement pattern inexpressible.
   *
   * A count, so `number`. Its arithmetic partner is the reward ledger's
   * `maximumUsePerQualification`, which multiplies it at
   * [model/service/PromotionService.cfc:L223-L224, L228] - a count times a count.
   *
   * CFML parity [model/service/PromotionService.cfc:L593]: the caller's test is bare numeric
   * truthiness, so the ported consumer must write an explicit `> 0`. The stakes are the whole
   * promotion: a falsy count reaches the early return at L613-L616 and disqualifies the entire
   * period, while a truthy one appends this record at L609 and continues.
   *
   * CFML parity [model/service/PromotionService.cfc:L743, L830-L831]: the order-item branch derives
   * the count with `int(...)`, which TRUNCATES toward zero - 7 items against a minimum of 2 yields
   * 3, not 4. `Math.trunc` is faithful at both sites; `Math.round` would grant an extra
   * qualification and therefore an extra discount.
   *
   * CFML parity [model/service/PromotionService.cfc:L740-L745]: the division is guarded by the
   * wrong condition for divide-by-zero purposes - L740 tests the NUMERATOR and L742 tests only
   * `!isNull(getMinimumItemQuantity())`, so a stored `0` passes. The column permits it: nullable
   * integer with `hb_nullRBKey="define.0"` [model/entity/PromotionQualifier.cfc:L59], so `0` and
   * absent are different states and only absence is guarded. Reproduced as written.
   */
  qualificationCount: number;

  /**
   * The fulfillments that survived this qualifier, as OPAQUE IDs.
   *
   * A `readonly` property holding a MUTABLE array. The property is reassigned exactly once, at
   * [model/service/PromotionService.cfc:L660], writing a fresh empty array over the empty one the
   * initializer created at L633 - observably a no-op - while its CONTENTS are mutated twice per
   * iteration in the worst case, by `arrayAppend` at L666 and `arrayDeleteAt` at L709.
   * `ReadonlyArray<string>` would make both mutations inexpressible.
   *
   * CFML parity [model/service/PromotionService.cfc:L707-L709]: the delete is positional and its
   * position comes from `arrayFind`, a 1-based index or `0`, never a boolean; it is safe here only
   * because L666 appended the very ID being searched for two statements earlier. Do not translate
   * `arrayFind` as a predicate - `indexOf` returns `-1` and is 0-based - and keep the "position `0`
   * is invalid" property, which is what makes the same pattern at L774 a genuine hazard.
   *
   * The array can legitimately be empty. It is read back at
   * [model/service/PromotionService.cfc:L599] to build the explicitly-qualified list that the
   * defect on {@link PeriodQualification.qualifiedFulfillments} then misfiles.
   */
  readonly qualifiedFulfillmentIDs: string[];

  /**
   * The order items this qualifier matched, one record each.
   *
   * A `readonly` property holding a MUTABLE array: created empty at
   * [model/service/PromotionService.cfc:L634], never reassigned, contents mutated by exactly one
   * line, the `arrayAppend` at L733.
   *
   * Only MATCHING items appear, and only the order-item branch populates it at all - see the
   * construct-then-conditionally-append note on {@link QualifiedOrderItemDetail}. An empty array
   * after that branch means no item matched, which the legacy structure does not distinguish from
   * the emptiness the other two branches leave behind.
   *
   * No order may be assumed: entries arrive in the iteration order of `getOrderItems()`
   * [model/service/PromotionService.cfc:L720] with no sort anywhere, deliberately unlike the two
   * insertion sorts in the reward pipeline.
   */
  readonly qualifiedOrderItemDetails: QualifiedOrderItemDetail[];
}

/**
 * ONE promotion period's verdict on an order: the gate every discount passes through.
 *
 * Five members - four live, one dead. The initializer at
 * [model/service/PromotionService.cfc:L552-L557] creates four keys while the docblock at L86-L102
 * documents three; the fifth member below is never created by any initializer.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L556]: the initialization has FOUR keys, not
 * three - L553 `qualificationsMeet`, L554 `qualifiedFulfillmentIDs`, L555 `qualifierDetails`, L556
 * `orderItems` - and the docblock omits the last. Omitting it here would break the per-item
 * qualification path entirely, since L212-L213 populate it, L217 gates on it and L222 reads it into
 * the `qualificationQuantity` that sizes every item-level discount. The docblock is intent, the
 * code is behaviour, and the code wins.
 *
 * Built once per period then memoized behind `structKeyExists`
 * [model/service/PromotionService.cfc:L192, L1048], so the mutability notes below describe the
 * whole enclosing invocation rather than one statement. The structure is order-independent except
 * through `orderItems`, whose contents outlive the helper that created it.
 */
export interface PeriodQualification {
  /**
   * Whether this promotion period qualifies at all.
   *
   * Mutable, load-bearingly so. Seeded `true` at [model/service/PromotionService.cfc:L553] -
   * optimistic by default - and cleared at exactly three points: L569 (the period use count reached
   * `getMaximumUseCount()`), L578 (this account's use count reached `getMaximumAccountUseCount()`)
   * and L613 (a qualifier returned a zero count, triggering the early return).
   *
   * The two use-count gates are asymmetric, deliberately. Both are guarded by
   *   `!isNull(...) && ... gt 0`
   * [model/service/PromotionService.cfc:L566, L574], so an absent maximum means UNLIMITED -
   * matching `notnull="false"` with `hb_nullRBKey="define.unlimited"`
   * [model/entity/PromotionPeriod.cfc:L55, L56] - and a stored `0` also means unlimited. The
   * account gate additionally requires an account (L575), so a guest order skips it entirely and
   * can use an account-limited promotion without consuming a per-account use; `OrderView.accountID`
   * is `string | undefined` for that reason.
   *
   * A plain `boolean`, never a reason code: the legacy value carries no reason and both consumers
   * only test it.
   *
   * CFML parity [model/service/PromotionService.cfc:L197, L1053]: this is the ONLY member of this
   * type for which a bare truthiness test is the faithful port. Its two sibling gates are numbers
   * tested the same way in the source - `QualifierQualification.qualificationCount` at L593 and the
   * `orderItems` entry at L217 - and confusing the three is the likeliest way to port this
   * structure wrongly.
   *
   * CFML parity [model/service/PromotionService.cfc:L584, L619-L623]: when a use-count gate clears
   * this member the qualifier loop is skipped wholesale, yet execution still returns normally - so
   * a disqualified period returns `qualifiedFulfillmentIDs` still holding the full L559-L561 seed
   * and an empty `qualifierDetails`. Test this member FIRST; never infer disqualification from
   * either collection, since both shapes also describe a qualifying period with no qualifiers.
   */
  qualificationsMeet: boolean;

  /**
   * The fulfillments this period permits, as OPAQUE IDs. Seeded with ALL of them.
   *
   * A `readonly` property holding a MUTABLE array: reassigned once by the early-return reset at
   * [model/service/PromotionService.cfc:L614], contents mutated by the seeding `arrayAppend` at
   * L560, so the reset becomes an in-place clear on a value returned immediately afterwards.
   *
   * CFML parity [model/service/PromotionService.cfc:L559-L561]: the default is "all fulfillments
   * qualify" - the loop appends every fulfillment ID before any qualifier is evaluated, and no line
   * ever appends again, so the array is only ever NARROWED. An empty array therefore means NOTHING
   * qualifies, not "no restriction"; a consumer that read emptiness as permissive would discount
   * every fulfillment of an order the legacy engine grants none to, silently, because the resulting
   * amounts look plausible.
   *
   * CFML parity [model/service/PromotionService.cfc:L209, L351]: both reads probe with `arrayFind`,
   * a 1-based position or `0`, never a boolean. Write an explicit `> 0`, or use `includes` /
   * `findIndex(...) >= 0` with its 0-based semantics stated. Never port `arrayFind` as a predicate:
   * the same value is consumed as an arithmetic POSITION at L708-L709 and L774.
   *
   * CFML parity [model/service/PromotionService.cfc:L599-L605, L621-L623]: the narrowing the
   * qualifier loop computes does NOT land here - it accumulates into a local that L622 writes to
   * the dead field instead. So this member is either the complete seed or, after the early return,
   * empty. That is behaviour caused by the defect on
   * {@link PeriodQualification.qualifiedFulfillments}; do not "restore" the narrowing.
   */
  readonly qualifiedFulfillmentIDs: string[];

  /**
   * Each qualifier's verdict, in the order the qualifiers were evaluated.
   *
   * A `readonly` property holding a MUTABLE array: created empty at
   * [model/service/PromotionService.cfc:L555], reassigned once by the early-return reset at L615,
   * appended to at L609 once per qualifier that survives.
   *
   * Either COMPLETE - one entry per qualifier - or EMPTY, never partial: the append sits in the
   * truthy arm of the bare test at L593 and the falsy arm at L612-L617 clears the array and
   * returns. An empty array is also the normal shape for a period with no qualifiers, so emptiness
   * is ambiguous alone and must be read alongside `qualificationsMeet`.
   *
   * Ordered by the period's own association [model/entity/PromotionPeriod.cfc:L63] with no sort
   * applied, which decides WHICH qualifier's failure disqualifies the period, though not whether it
   * is disqualified. Do not impose an order here.
   */
  readonly qualifierDetails: QualifierQualification[];

  /**
   * The per-order-item qualification count, keyed by opaque `orderItemID`.
   *
   * The undocumented fourth key: created as `{}` at [model/service/PromotionService.cfc:L556] and
   * absent from the docblock at L86-L102 - see the LEGACY-NOTE on this interface. It is
   * emphatically not the dead field; it is written, gated on and read, all by the CALLER rather
   * than the producer, inside the reward loop one order item at a time: L212 guards with
   * `structKeyExists`, L213 assigns the counted value, L217 gates the reward on it, and L222 reads
   * it into the `qualificationQuantity` that sizes the discount.
   *
   * A `readonly` property holding a MUTABLE record, load-bearingly so: keys are added across the
   * reward loop and must survive for the next reward that visits the same order item, so
   * `Readonly<Record<...>>` would make L213 inexpressible. This is a behavioural memo, not a tuning
   * device - it caches a count that sizes money.
   *
   * `Record<string, number>`: a count, not money and not a boolean, floored at `0` by the early
   * return at [model/service/PromotionService.cfc:L840-L842]. The key is the opaque `orderItemID`,
   * never parsed.
   *
   * CFML parity [model/service/PromotionService.cfc:L217]: the gate is bare numeric truthiness, so
   * the ported consumer must write an explicit `> 0`, and under `noUncheckedIndexedAccess` must
   * narrow the `number | undefined` read rather than assert it - the L212 `structKeyExists` guard
   * maps exactly onto that narrowing.
   *
   * CFML parity [model/service/PromotionService.cfc:L613-L616]: the early-return reset clears
   * `qualificationsMeet`, `qualifiedFulfillmentIDs` and `qualifierDetails` and spares this member.
   * Reproduce the asymmetry rather than normalising the reset to cover all four keys: the surviving
   * contents are unobservable today only because the reset runs before the caller can add a key.
   */
  readonly orderItems: Record<string, number>;

  /**
   * DEAD FIELD. Written once, never initialized, never read.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: a three-way mismatch.
   * `qualificationDetails.qualifiedFulfillments = explicitlyQualifiedFulfillmentIDs;` is wrong in
   * three independent ways at once. (1) WRONG LEVEL - the docblock at L93 places the key inside a
   * `qualifierDetails` entry while L622 writes it at the PERIOD level, and neither initializer
   * (L552-L557, L630-L635) creates the name at either level. (2) WRONG TYPE - the docblock promises
   * entities while the assigned local holds ID strings, appended from each qualifier's own
   * `qualifiedFulfillmentIDs` at L602-L603. (3) ORPHANED - the name without the `IDs` suffix
   * appears exactly twice in the component, at the L93 docblock and this L622 write, and the caller
   * reads `qualifiedFulfillmentIDs` instead, at L209 and L351.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * Repairing it would let the fulfillment-qualifier narrowing reach the caller for the first time,
   * so orders that currently discount every fulfillment would discount only the
   * explicitly-qualified subset - a change in the money arrived at by making the code look tidier.
   * Declared rather than omitted, because an omitted dead field is indistinguishable from an
   * overlooked one and because `src/services/promotion/promotionPeriodQualification.ts` must be
   * able to reproduce the L621-L623 write. Optional with no `undefined` in the union, and
   * `exactOptionalPropertyTypes` is load-bearing: the field is written only when the local array is
   * non-empty, so absent and present-but-`undefined` are different states, and a required member
   * would force every producer to mention it - including the L613-L616 early-return path that never
   * reaches L621. Do NOT make it required, delete it, or rename it to `qualifiedFulfillmentIDs`:
   * the near-identical live member sits three positions above and the two are not interchangeable.
   */
  qualifiedFulfillments?: string[];
}

/**
 * The memo's key: whatever {@link PromotionPeriod.getPromotionPeriodID} returns, which is `string`,
 * so `Record<PromotionPeriodQualificationKey, T>` is exactly `Record<string, T>`.
 *
 * JUDGMENT CALL: derived from the entity accessor rather than written as a bare `string`, because
 * every memo operation reaches the key through that accessor chain
 * [model/service/PromotionService.cfc:L192-L193, L197, L209, L212, L213, L217, L222, L1048-L1053].
 * Anchoring the alias makes a change to the identifier's shape a compile error rather than a silent
 * coercion, and gives the `PromotionPeriod` import a load-bearing type position under
 * `noUnusedLocals`.
 */
export type PromotionPeriodQualificationKey = ReturnType<PromotionPeriod['getPromotionPeriodID']>;

/**
 * The memo itself: every promotion period's verdict, keyed by `promotionPeriodID`.
 *
 * Mutable, deliberately - keys are ADDED lazily during the reward pass by the guarded assignments
 * at [model/service/PromotionService.cfc:L192-L193, L1048-L1049] onto structures that start as `{}`
 * at L136 and L1038, so a `Readonly` wrapper would make both populate sites inexpressible.
 *
 * ONE memo per invocation, request-scoped: the two legacy memos are method-local `var`s that never
 * see each other, so the same period can be evaluated twice in one request and consumer #2
 * populates from an order it derived through a fulfillment
 * [model/service/PromotionService.cfc:L1049]. Sharing a memo would let one consumer's order answer
 * the other's question, and a module-level memo on a warm container would leak one customer's
 * verdict into another's order. Enforcing the scoping belongs to
 * `src/services/promotion/promotionPeriodQualification.ts`.
 *
 * Consumers must NARROW, not assert: `noUncheckedIndexedAccess` types every indexed read as
 * `PeriodQualification | undefined`, and the legacy `structKeyExists` guards at
 * [model/service/PromotionService.cfc:L192, L1048] map exactly onto narrowing. Consumer #1
 * re-indexes six more times, at L197, L209, L212, L213, L217 and L222.
 */
export type PromotionPeriodQualifications = Record<
  PromotionPeriodQualificationKey,
  PeriodQualification
>;

/**
 * The signature of the period-qualification producer. Implemented by
 * `getPromotionPeriodQualificationDetails` in
 * `src/services/promotion/promotionPeriodQualification.ts`, from
 * [model/service/PromotionService.cfc:L549]. The legacy method is `private`; the target promotes it
 * so it can be tested directly, and that widening belongs to the implementing module.
 *
 * Async, because the legacy body reaches the DAO twice - `getPromotionPeriodUseCount` at
 * [model/service/PromotionService.cfc:L567] and `getPromotionPeriodAccountUseCount` at L576 - both
 * behind `!isNull(...) && ... gt 0` guards at L566 and L574, so a period with no configured limits
 * performs no query while the signature stays asynchronous.
 *
 * Parameter names and order mirror the legacy argument names, which the named-argument call sites
 * [model/service/PromotionService.cfc:L193, L1049] make part of the diffable surface.
 *   `required any order`
 * becomes `OrderView`, the read-only projection, because the Order aggregate is out of scope.
 *
 * JUDGMENT CALL: the alias is PascalCase while the implementing function keeps the legacy camelCase
 * name, because tsc rejects a type alias and a function of the same name in one module (TS2395).
 * Interface parity is satisfied on the function; no legacy name is lost.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L192-L193, L1048-L1049]: both call sites memoize
 * behind `structKeyExists`, so the implementation must be safe to call once per period per
 * invocation and must not assume one call per reward. It must also tolerate an order with no
 * fulfillments and no items, which returns `qualificationsMeet: true` with two empty collections -
 * a period that qualifies vacuously.
 */
export type GetPromotionPeriodQualificationDetails = (
  promotionPeriod: PromotionPeriod,
  order: OrderView,
) => Promise<PeriodQualification>;

/**
 * The signature of the per-qualifier producer. Implemented by `getQualifierQualificationDetails` in
 * `src/services/promotion/qualifierQualification.ts`, from
 * [model/service/PromotionService.cfc:L629].
 *
 * Synchronous - do NOT make it async. The body reaches no DAO and no ORM; its one outward call is
 * the address-zone evaluation at [model/service/PromotionService.cfc:L684], modelled as the
 * synchronous `addressZoneEvaluator` port.
 *
 * The single call site passes both parameters POSITIONALLY
 * [model/service/PromotionService.cfc:L590], departing from the component's named-argument style,
 * so their order must not be swapped. See {@link GetPromotionPeriodQualificationDetails} for why
 * this alias is PascalCase while the implementing function keeps the legacy camelCase name.
 *
 * CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: the same three order-item type
 * tokens are written in two different orders - `'merchandise,subscription,contentAccess'` at L200
 * and L794, `'contentAccess,merchandise,subscription'` at L714 - and all three sites are membership
 * tests, so order is behaviourally irrelevant. Recorded because it proves no set-ordering or
 * priority assumption is safe: test membership with `listFindNoCase(...) > 0` at each site and
 * preserve each literal exactly as written.
 */
export type GetQualifierQualificationDetails = (
  qualifier: PromotionQualifier,
  order: OrderView,
) => QualifierQualification;

/**
 * The signature of the comma-delimited qualified-fulfillment list builder. Implemented by
 * `getPromotionPeriodQualifiedFulfillmentIDList` in
 * `src/services/promotion/qualifierQualification.ts`, from
 * [model/service/PromotionService.cfc:L752]. Synchronous: it iterates only the order's fulfillments
 * [L755] and the period's qualifiers [L760]. Returns a comma-delimited `string`, NOT an array, and
 * the parity matters because two similarly-named things coexist with two representations and two
 * 1-based hazards: {@link PeriodQualification.qualifiedFulfillmentIDs} is a `string[]` probed with
 * `arrayFind` [model/service/PromotionService.cfc:L209, L351], while this return value is
 * accumulated with `listAppend` [L753, L756] and searched with `listFindNoCase` [L774]. Consumers
 * parse it through the `src/lib/cfml/list.ts` helpers. CFML parity
 * [model/service/PromotionService.cfc:L774]: `listFindNoCase` returns a 1-based position or `0`,
 * never a boolean, and the shipped helper takes the list first, so `> 0` is mandatory. Do not
 * conflate it with `arrayFind` on the array member: one indexes a list held in a string, the other
 * a real array. The same expression spells `ListDeleteAt` and `listFindNoCase` with different
 * capitalisation, which CFML tolerates and TypeScript does not.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L774]: the `listFindNoCase` result is consumed
 * directly as a 1-based position with no test, and `ListDeleteAt(list, 0)` RAISES in CFML - so the
 * line is a latent failure for any fulfillment ID absent from the list, masked only because L756
 * appended every ID unconditionally moments earlier.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
 * Reproduction is owned by `src/services/promotion/qualifierQualification.ts`, since
 * `src/lib/cfml/list.ts` deliberately exports no `listDeleteAt`; this alias keeps the hazard
 * expressible by typing the return as a `string` rather than a parsed array. CFML parity
 * [model/service/PromotionService.cfc:L753, L756]: the accumulator starts as `''` and the first
 * `listAppend` must not emit a leading delimiter - the shipped helper satisfies
 *   `listAppend('', v) === v`.
 * The same pattern appears at L861, L896, L931 and L962. A leading comma would shift every
 * downstream position by one. LEGACY-NOTE [model/service/PromotionService.cfc:L864-L865, L899-L900,
 * L934-L935, L965-L966]: the membership walks pair `listLen` with 1-based `listGetAt`, and the
 * shipped helper THROWS `CfmlListIndexError` out of range rather than returning `''` - see the
 * `list.ts` note in this module's header.
 */
export type GetPromotionPeriodQualifiedFulfillmentIDList = (
  promotionPeriod: PromotionPeriod,
  order: OrderView,
) => string;

/**
 * The signature of the per-order-item qualification counter. Implemented by
 * `getPromotionPeriodOrderItemQualificationCount` in
 * `src/services/promotion/promotionPeriodQualification.ts`, from
 * [model/service/PromotionService.cfc:L783]. Synchronous: no DAO and no ORM, only
 * already-materialized associations plus `getOrderItemInQualifier` at L805.
 *
 * Returns a count, never `Money`, and both parameters are load-bearing: the single named-argument
 * call site [model/service/PromotionService.cfc:L213] passes one `orderItem` AND the whole `order`,
 * because L808-L818 compares every other item against the one being counted.
 *
 * Seeded permissively at [model/service/PromotionService.cfc:L785] with the order's total sale
 * quantity and only ever narrowed, inside the order-item-type branch at L794 - so a period whose
 * qualifiers are all `order` or `fulfillment` type returns that total unchanged.
 *
 * CFML parity [model/service/PromotionService.cfc:L830-L831]: `int()` TRUNCATES toward zero, so 7
 * units against a minimum of 2 yields 3. Use `Math.trunc`, the same operator as at L743; the
 * divisor is guarded only for null, so a stored `0` reaches the division as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L840-L842]: the early `return 0` fires as soon as
 * the running minimum reaches zero or below, so remaining qualifiers are never evaluated and the
 * return never propagates a negative. The caller's bare truthiness gate at L217 reads that zero as
 * false, which is why the ported consumer writes `> 0`.
 */
export type GetPromotionPeriodOrderItemQualificationCount = (
  promotionPeriod: PromotionPeriod,
  orderItem: OrderItemView,
  order: OrderView,
) => number;
