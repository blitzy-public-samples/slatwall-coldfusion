/**
 * The MUTABLE reward-usage ledger: the promotion engine's use-limit enforcement contract. Four type
 * contracts and nothing else, together describing `promotionRewardUsageDetails` - the structure
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58-L546] threads through
 * its 489-line body to decide how many times each promotion reward may be used:
 *
 *   1. `UnlimitedUseSentinel` - the `1000000` literal that stands in for "no limit" at seed time.
 *   2. `OrderItemUsage` - one record of one reward being used on one order item.
 *   3. `PromotionRewardUsageDetail` - one reward's limits and running usage.
 *   4. `PromotionRewardUsageKey` / `PromotionRewardUsageDetails` - the ledger itself, keyed by
 *      `promotionRewardID`.
 *
 * Sourced from [model/service/PromotionService.cfc:L173-L188]. This is the use-limit enforcement
 * half of the must-preserve promotion behaviour.
 *
 * Mutability is load-bearing and per-member rather than uniform. This is the one deliberately
 * mutable type contract in this folder: whether a later reward is allowed depends on which earlier
 * rewards ran, so a `Readonly<>` in the wrong place breaks the algorithm and changes the money
 * charged. Two members are mutable, two are `readonly`, and one is a `readonly` property holding a
 * MUTABLE array. `UnlimitedUseSentinel` is a type-level literal and never a `const`, because a
 * value declared here would put engine state in the domain's type layer.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L324-L467]: the ledger is ITEM-LEVEL ONLY. There
 * is no `promotionRewardUsageDetails` occurrence anywhere in that span, so the fulfillment-reward
 * branch (opening at L345) and the order-reward branch (L415) neither read nor write it:
 * order-level and fulfillment-level discounts are STRUCTURALLY IMMUNE to use-limit stripping, the
 * same shape of immunity sale-price discounts get from the `promotionRewardID = ''` sentinel at
 * L155-L159. So the honest form of "the ledger must distinguish item-level from order-level usage"
 * is that order-level usage is never recorded at all; there is deliberately no order-level and no
 * fulfillment-level member below.
 *
 * The three `src/domain/promotionEngine/` modules import nothing from each other, which is what
 * lets any one be regenerated without touching the other two. The independence survives a real
 * coupling: `discountPerUseValue` below is DERIVED from the accumulator's `discountAmount` at
 * [model/service/PromotionService.cfc:L299], but the derivation happens in
 * `src/services/promotion/**`.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the
 * `hb_permission="promotionPeriod.promtionRewards"` typo - a genuine data contract, preserved
 * verbatim and never renamed - is on the component declaration at L57 alongside
 * `table="SwPromoReward"`, NOT at L49, which is a blank line inside the reward-type block comment.
 * The three use-limit properties this file's sentinel substitutes for are at L65, L66 and L67, and
 * `amount` is at L61 with no default.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L105-L119]: the ledger's authoritative docblock
 * is exactly this span, sitting inside the illustrative block comment delimited by L82 and L133,
 * and the ASC-order statement for `orderItemsUsage` is on L111. The exact span is what lets a
 * reviewer tell intent from behaviour, because the docblock and the executing code disagree
 * elsewhere inside that same comment.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L252]: the price-group discount correction is on
 * L252, not L248 - L248 is a comment and L249 is the `getDiscountAmount` call.
 */
import type { PromotionReward } from '../entities/promotionReward.js';
import type { Money } from '../valueObjects/money.js';

/**
 * The literal the legacy engine seeds into all three use limits to mean "no limit": one million,
 * exactly as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L175, L176, L177]: the seed at L173-L179 writes
 * `1000000` into `maximumUsePerOrder`, `maximumUsePerItem` and `maximumUsePerQualification`, and
 * this alias names that literal without changing it. Declared as a TYPE alias rather than a `const`
 * so the module still emits zero runtime JavaScript, with the digits written without a numeric
 * separator so `1000000` greps identically in the target and in the source.
 *
 * No substitution is acceptable, because the sentinel does ARITHMETIC rather than only being
 * compared: [model/service/PromotionService.cfc:L223] compares
 *   `qualificationQuantity * maximumUsePerQualification`
 * against `maximumUsePerOrder`, and L224 assigns that product back whenever it is smaller. With
 * `1000000` seeded, a qualification quantity of 1 against an unlimited per-qualification limit
 * yields `1000000`, which is not less than `1000000`, so the ratchet does not fire. Substitute
 * `Infinity` and the two models diverge as soon as a real per-qualification limit is present,
 * because `qualificationQuantity * 5` is less than `1000000` and therefore ratchets from a
 * different starting point, changing every subsequent comparison at L236 and L471. `undefined` or a
 * boolean flag would make the L223 multiplication and the L471 comparison inexpressible without
 * inventing a branch the legacy code does not have.
 *
 * One million is an inhabitant of `number`, not a separate type: the three limit members below are
 * `number`, not `number | UnlimitedUseSentinel`. Nothing anywhere branches on "is this the
 * sentinel", so a union would be a lie about the domain. This alias exists to name the seed and
 * make it searchable.
 *
 * Two representations of "unlimited" coexist, and both are correct at their own layer. At the
 * ENTITY layer absence means unlimited - `PromotionReward`'s three limits are nullable integers
 * carrying `hb_nullRBKey="define.unlimited"` [model/entity/PromotionReward.cfc:L65, L66, L67], and
 * `PromotionPeriod` follows the same convention for its two use counts
 * [model/entity/PromotionPeriod.cfc:L55, L56] with `define.forever` on its date bounds [L53, L54].
 * At the LEDGER layer the numeric sentinel is substituted once, at seed time
 * [model/service/PromotionService.cfc:L173-L179]. Do not harmonise them and do not make the
 * ledger's limits optional: the seed is the boundary between the two conventions, and it is what
 * lets every later line do plain arithmetic without a null check.
 */
export type UnlimitedUseSentinel = 1000000;

/**
 * One record of one promotion reward having been used on one order item.
 *
 * Exactly three members: both construction sites build the same three keys and no others - the
 * ordered insert at [model/service/PromotionService.cfc:L309-L313] and the append fallback at
 * L323-L327 - and the illustrative docblock at L112-L116 lists the same three.
 *
 * Every member is `readonly`, on the evidence: no source line ever rewrites a field of an existing
 * usage record - L309 and L323 construct FRESH objects, and the two lines that read a record back,
 * L476 and L477, copy values into locals. The only mutation in this structure is to the containing
 * array.
 */
export interface OrderItemUsage {
  /**
   * Which order item this usage was recorded against.
   *
   * OPAQUE: the value of `orderItem.getOrderItemID()` [model/service/PromotionService.cfc:L310,
   * L324], never branded, never parsed and never resolved back to an OrderItem. It exists only so
   * the stripping pass can look up the matching bucket of qualified discounts at L482 and L498.
   */
  readonly orderItemID: string;

  /**
   * How many units of that order item this reward was applied to.
   *
   * A count, so genuinely `number` and never `Money`: derived at
   * [model/service/PromotionService.cfc:L228] as
   *   `qualificationQuantity * maximumUsePerQualification`,
   * then clamped twice - to the order item's own quantity at L231-L233 and to `maximumUsePerItem`
   * at L236-L238 - before being stored here. Every operand is a unit count, and `Money` is the
   * arithmetic surface for currency only.
   *
   * It is the same value L297 adds into `usedInOrder`, which is what makes that member a count too,
   * and the quantity over-use stripping measures against at L479.
   */
  readonly discountQuantity: number;

  /**
   * The discount this usage bought, per unit - the sort key of the ledger's ascending insert-sort.
   * `Money`, never `number`: it is a currency amount, and all money in the target passes through
   * the one arithmetic surface. LEGACY-DEFECT [model/service/PromotionService.cfc:L299]:
   *   `var discountPerUseValue = precisionEvaluate('discountAmount / discountQuantity');`
   * divides with NO zero check on the divisor - no guard, no default and no branch protects it
   * anywhere on the path from L228 to L299.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * The target reproduces the unguarded division through `Money.dividedBy`, which refuses a zero
   * divisor and lets that refusal PROPAGATE: returning `0` would invent money out of an arithmetic
   * fault, and returning `undefined` would push a null check onto every consumer of every
   * arithmetic result. LEGACY-NOTE [model/service/PromotionService.cfc:L486]: there is a second
   * unguarded division that no published citation names - only L299 is registered - dividing the
   * accumulated `discountAmount` by `thisDiscountQuantity` inside the partial-strip branch. It gets
   * the same treatment, recorded together with L299 because a consumer that guarded one and not the
   * other would produce two behaviours for the same class of fault. Whether either call site wants
   * a guard is owned by `src/services/promotion/rewardUsageLedger.ts` for L299 and
   * `src/services/promotion/overUseStripping.ts` for L486 - not by this file and not by the value
   * object, which documents the same hand-off from its side. Nothing in this folder may add a
   * guard, a `0` fallback or a `NaN` return.
   */
  readonly discountPerUseValue: Money;
}

/**
 * One promotion reward's use limits and its running usage, as the engine accumulates them.
 *
 * Seeded once per reward, behind a key-existence guard: the entry is created by
 * [model/service/PromotionService.cfc:L173-L179] inside the `structKeyExists` test at L172, so a
 * reward appearing twice in the collection keeps the usage it already accumulated. All three limits
 * are seeded to {@link UnlimitedUseSentinel} and `usedInOrder` to `0`, and the three overrides at
 * L180-L188 then read the reward entity's own limits.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L180, L183, L186]: each override is guarded by
 * `!isNull(x) && x > 0`, so a stored limit of ZERO - or a negative - leaves the `1000000` sentinel
 * in place and the reward is treated as UNLIMITED. A consumer that treats a stored `0` as "no uses
 * permitted" would suppress a discount the legacy engine grants, and one that clamps a negative to
 * `0` would do the same. Reproduce the `> 0` test, not a null check.
 *
 * Mutability is per-member and each marking below carries the write sites it rests on: two members
 * are mutable, two are `readonly`, and one is a `readonly` property holding a mutable array. A
 * uniform `Readonly<>` here would break the algorithm; a uniform mutable would licence writes the
 * engine never performs.
 */
export interface PromotionRewardUsageDetail {
  /**
   * How many units this reward has been applied to across the whole order so far.
   *
   * MUTABLE, and the mutability is load-bearing.
   *
   * CFML parity [model/service/PromotionService.cfc:L297]: `usedInOrder += discountQuantity`
   * accumulates IN PLACE, once per order item that qualifies, inside the reward loop that closes at
   * L465. This one line is the whole reason the engine is order-dependent: the running total is
   * threaded through the loop, so whether a later reward is allowed depends on which earlier
   * rewards ran. A `readonly` marking would force a consumer to rebuild the entry - precisely the
   * class of change that silently alters money.
   *
   * A count, so `number`: it accumulates {@link OrderItemUsage.discountQuantity}. Read twice, both
   * by over-use stripping - [model/service/PromotionService.cfc:L471] tests it against
   * `maximumUsePerOrder` and L472 subtracts to size the strip. No initial value is declared here;
   * the seed writes `0` at L174.
   */
  usedInOrder: number;

  /**
   * The most units this reward may be applied to across the whole order.
   *
   * MUTABLE, for two independent reasons. The first write is the ordinary seed-time override at
   * [model/service/PromotionService.cfc:L181]. The second is a ratchet that fires DURING the
   * order-item loop, which is why this member cannot be `readonly` even if the override were folded
   * into construction.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: the ratchet is a sixth way
   * `updateOrderAmountsWithPromotions` is order-dependent, beyond the five recorded on
   * `qualifiedDiscountTypes.ts`. L223 tests
   *   `(qualificationQuantity * maximumUsePerQualification) lt maximumUsePerOrder`
   * and L224 assigns that product back, ratcheting the limit DOWN, and both lines sit inside the
   * per-order-item loop opened at L203, so the ratchet fires once per qualifying item. The FINAL
   * limit therefore depends on which order items were visited and in what order, and the stripping
   * trigger at L471 and strip sizing at L472 read the RATCHETED value. A consumer that treats this
   * member as a constant configured limit computes a different amount of stripping, and therefore a
   * different discount.
   *
   * A count, so `number`. The seeded default is {@link UnlimitedUseSentinel}, which is what makes
   * the L223 comparison meaningful before any real limit is known. Read three times: L223 as the
   * ratchet's ceiling, and L471 and L472 by over-use stripping - where L472 reads it through the
   * LEAKED reward key, the defect documented on {@link PromotionRewardUsageDetails}.
   */
  maximumUsePerOrder: number;

  /**
   * The most units this reward may be applied to on any single order item.
   *
   * `readonly` on the evidence: exactly one line writes it, the seed-time override at
   * [model/service/PromotionService.cfc:L184]. Marking it mutable would licence a write the engine
   * never performs, and the asymmetry against `maximumUsePerOrder` above is why these members are
   * marked individually.
   *
   * A count, so `number`. The seeded default is {@link UnlimitedUseSentinel} and the `> 0`-only
   * override applies, so a stored `0` leaves the sentinel. Read as the second of the two clamps on
   * `discountQuantity`, at [model/service/PromotionService.cfc:L236-L237].
   */
  readonly maximumUsePerItem: number;

  /**
   * The most units this reward may be applied to per qualification.
   *
   * `readonly` on the evidence: exactly one line writes it, the seed-time override at
   * [model/service/PromotionService.cfc:L187]. It is the ratchet's INPUT rather than its target,
   * which is what distinguishes it from `maximumUsePerOrder`.
   *
   * A count, so `number`. The seeded default is {@link UnlimitedUseSentinel} and the `> 0`-only
   * override applies. Read at [model/service/PromotionService.cfc:L223-L224] as the ratchet's
   * multiplicand and at L228 to derive `discountQuantity` before the two clamps narrow it.
   */
  readonly maximumUsePerQualification: number;

  /**
   * Every usage of this reward, one record per order item, held in ascending order of
   * {@link OrderItemUsage.discountPerUseValue}.
   *
   * A `readonly` PROPERTY holding a MUTABLE array: the property is never reassigned - the array is
   * created empty by the seed at [model/service/PromotionService.cfc:L178] - while its CONTENTS are
   * mutated twice, by `arrayInsertAt` at L309 and `arrayAppend` at L323. `ReadonlyArray` would make
   * both mutations inexpressible; a mutable property would licence a whole-array replacement the
   * engine never performs.
   *
   * Sorted ASCENDING by `discountPerUseValue`, by hand, on insert:
   * [model/service/PromotionService.cfc:L301] seeds the flag, L304-L318 walks the array and tests
   * `> discountPerUseValue` at L306, inserting before the first larger entry at L309 and breaking
   * at L316, and L320-L329 appends when none was found. The invariant is stated in the docblock at
   * L111. The ordering exists so the CHEAPEST-PER-USE discounts are stripped first.
   *
   * CFML parity [model/service/PromotionService.cfc:L306]: the comparison is strictly `>`, so on an
   * exact tie the incumbent keeps its earlier position - first-in wins. A `>=` would reverse tie
   * handling, and because stripping walks this array from index 1 upward at L475 and stops as soon
   * as `needToRemove` reaches zero at L514, a reversed tie changes WHICH order item loses its
   * discount.
   *
   * CFML parity [model/service/PromotionService.cfc:L269-L294, L304-L329]: the two insertion sorts
   * run in OPPOSITE directions and both are load-bearing - never unify them. This array is
   * ascending by `discountPerUseValue` (L306, strict `>`), while the qualified-discount accumulator
   * typed by the sibling `qualifiedDiscountTypes.ts` is descending by `discountAmount` (L271,
   * strict `<`, with the early break at L281) and only its index [1] is ever applied, at L532 and
   * L534. The two answer different questions and a shared comparator would silently change the
   * money; both tie-breaks favour the incumbent, which is the one property they share.
   *
   * CFML parity [model/service/PromotionService.cfc:L303]: the source comment above this loop reads
   * "place it in ASC order" but spells "and" as "an". Recorded for traceability only - the comment
   * is not copied into the target - because it is the sentence a reviewer searches for to confirm
   * the ascending direction was read from the source rather than assumed.
   *
   * The array can legitimately be empty: a reward that qualifies for no order item never has a
   * record appended, which is why the stripping loop at [model/service/PromotionService.cfc:L475]
   * is bounded by `arrayLen`. It is read at L304 and L306 while sorting and at L475, L476 and L477
   * while stripping - where all three reads go through the LEAKED reward key; see
   * {@link PromotionRewardUsageDetails}.
   */
  readonly orderItemsUsage: OrderItemUsage[];
}

/**
 * The ledger's key: whatever {@link PromotionReward.getPromotionRewardID} returns, which is
 * `string`, so `Record<PromotionRewardUsageKey, T>` is exactly `Record<string, T>`.
 *
 * JUDGMENT CALL: derived from the entity accessor rather than written as a bare `string`, because
 * the ledger is reached by two routes and the type should say so -
 * [model/service/PromotionService.cfc:L468] iterates by struct key (`prID`) while L173, L181, L184,
 * L187, L223, L224, L228, L236, L237, L297, L304, L309, L323, L472, L475, L476 and L477 index by
 * `reward.getPromotionRewardID()`. Anchoring the alias makes the second route compile-checked, and
 * gives the `PromotionReward` import a load-bearing type position under `noUnusedLocals` - the
 * entity supplies the key AND the three limits the seed reads.
 */
export type PromotionRewardUsageKey = ReturnType<PromotionReward['getPromotionRewardID']>;

/**
 * The ledger itself: every promotion reward's limits and usage, keyed by `promotionRewardID`.
 *
 * MUTABLE, deliberately. Keys are ADDED during the reward pass by the guarded seed at
 * [model/service/PromotionService.cfc:L172-L179], to a structure that starts as `{}` at L139, so a
 * `Readonly` wrapper would make the seed inexpressible and freezing the value type would collide
 * with the two mutable members on {@link PromotionRewardUsageDetail}.
 *
 * Request-scoped, never module state: the legacy structure is a `var` local to one invocation of
 * `updateOrderAmountsWithPromotions`. A module-level ledger would persist between unrelated
 * invocations on a warm container and leak one customer's accumulated usage into another's order. A
 * type cannot enforce that; the obligation belongs to
 * `src/services/promotion/rewardUsageLedger.ts`.
 *
 * Both access modes must stay available, which is a hard requirement on the shape: a plain mutable
 * `Record` keyed by {@link PromotionRewardUsageKey} supports iteration over its own keys AND lookup
 * by a reward-derived key, and the legacy correction loop uses the two interchangeably - wrongly. A
 * `Map`, a branded key or an interface with named lookup helpers would make the defect below
 * inexpressible.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: over-use stripping iterates
 * `for(var prID in promotionRewardUsageDetails)` at L468 but reads the ledger by the WRONG KEY on
 * four lines inside that loop. L471 correctly uses `[prID]` on both sides; L472 MIXES the two,
 * computing `needToRemove` as
 *   `[prID].usedInOrder - [reward.getPromotionRewardID()] .maximumUsePerOrder`;
 * and L475, L476 and L477 all read `orderItemsUsage`, `orderItemID` and `discountQuantity` through
 * `reward.getPromotionRewardID()`. `reward` is the loop variable of the reward loop that already
 * CLOSED at L465, so it holds that loop's LAST reward, and maximum-use-per-order is enforced
 * against whichever reward happened to be last, for every key in the ledger. The search loops at
 * L483 and L499 then match on `.promotionRewardID == prID`, correctly, so the strip is sized from
 * one reward and applied to another.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
 * Reproduction is owned by `src/services/promotion/overUseStripping.ts`; this file's narrower
 * obligation is to keep the defect EXPRESSIBLE, which is why the container stays a plain keyed
 * record.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L472, L479, L486]: the defect can INCREASE a
 * discount, not only under-enforce one. Because L472 subtracts a limit belonging to a different
 * reward, `needToRemove` can come out negative; a negative satisfies
 *   `if(needToRemove < thisDiscountQuantity)`
 * at L479, so the partial-strip branch runs and its factor
 *   `(thisDiscountQuantity - needToRemove) / thisDiscountQuantity`
 * at L486 exceeds 1, INFLATING the stored discount instead of scaling it down.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
 * "Repairing it changes money" is therefore bidirectional, which is why this direction is
 * registered as its own marker.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L51-L132]: `getActivePromotionRewards` returns
 * `ormExecuteQuery(hql, params)` at L131 with NO `ORDER BY` anywhere in the DAO, so the reward
 * iteration order is whatever the driver returns. Combined with a mutable ledger threaded through
 * that iteration, an exact tie can change the money charged, and it also decides which reward the
 * stale `reward` variable holds when the defect above fires. The absent `ORDER BY` is preserved at
 * `src/repositories/mysql/mysqlPromotionRepository.ts`; do not add an ordering assumption here.
 *
 * Consumers must NARROW, not assert: `noUncheckedIndexedAccess` types every indexed read as
 * `PromotionRewardUsageDetail | undefined`, and the legacy `structKeyExists` guard at
 * [model/service/PromotionService.cfc:L172] maps exactly onto narrowing - including in the
 * stripping loop, where the leaked key genuinely might not be present at all.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L166, L458-L461]: the two-pass reward iteration
 * is implemented by mutating the loop counter, and because the reset sits INSIDE the loop body
 * (closing at L465) THE SECOND PASS NEVER RUNS when `promotionRewards` is empty. The target's two
 * explicit passes must reproduce that deliberately, and pass two must stay second because it reads
 * `getSubtotalAfterItemDiscounts()` at L417, which only has meaning once pass one has applied the
 * item discounts. Reproduction is owned by `src/services/promotion/twoPassRewardIterator.ts`.
 */
export type PromotionRewardUsageDetails = Record<
  PromotionRewardUsageKey,
  PromotionRewardUsageDetail
>;
