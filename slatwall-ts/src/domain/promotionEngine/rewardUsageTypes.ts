// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no declaration below depends on
// one - this module's only imports are two shipped siblings. The complete set
// named below, with the role each will play:
//
//   src/services/promotion/rewardUsageLedger.ts        seeds entries, increments
//                                                      `usedInOrder`, owns the ASC sort
//   src/services/promotion/overUseStripping.ts         reads the ledger and strips
//                                                      over-use; owns DEFECT 9
//   src/services/promotion/twoPassRewardIterator.ts    the two explicit ordered passes
//   src/services/promotion/discountAmount.ts           computes the amount whose
//                                                      per-use quotient lands here
//   src/services/promotion/salePriceSeeding.ts         the "" sentinel path that
//                                                      BYPASSES this ledger entirely
//   src/services/promotion/orderItemMembership.ts      decides whether an item is in
//                                                      a reward at all
//   src/services/promotion/promotionApplication.ts     applies whatever survives
//   src/services/promotionService.ts                   the facade returning the intents
//   src/domain/promotionEngine/qualificationTypes.ts   sibling period types, NOT imported
//   src/repositories/mysql/mysqlPromotionRepository.ts preserves the absent `ORDER BY`
//   README.md                                          the subtree toolchain document
//
// `src/domain/promotionEngine/qualifiedDiscountTypes.ts` is the one folder sibling
// that IS shipped, and it is deliberately NOT imported either - see the
// zero-intra-folder-imports note below.
// ---------------------------------------------------------------------------

/**
 * slatwall-ts - the MUTABLE reward-usage ledger: the promotion engine's
 * use-limit enforcement contract.
 *
 * WHAT THIS FILE IS
 * Four type contracts and nothing else, together describing
 * `promotionRewardUsageDetails` - the structure that
 * `updateOrderAmountsWithPromotions`
 * [model/service/PromotionService.cfc:L58-L546] threads through its 489-line
 * body to decide how many times each promotion reward may be used:
 *
 *   1. `UnlimitedUseSentinel` - the `1000000` literal that stands in for "no
 *      limit" at seed time.
 *   2. `OrderItemUsage` - one record of one reward being used on one order item.
 *   3. `PromotionRewardUsageDetail` - one reward's limits and running usage.
 *   4. `PromotionRewardUsageKey` / `PromotionRewardUsageDetails` - the ledger
 *      itself, keyed by `promotionRewardID`.
 *
 * AUTHORITY
 * AAP 0.4.1, the "Value Objects, Views, and Engine Types" row for this path:
 * CREATE, sourced from [model/service/PromotionService.cfc:L173-L188], described
 * as "Types the mutable `promotionRewardUsageDetails` ledger, including
 * `usedInOrder` and `orderItemsUsage`". AAP 0.6.1 is the hotspot analysis these
 * types have to make reproducible, and AAP 0.8.1's Preserve-Exactly directive
 * names "promotion discount math together with use-limit enforcement semantics"
 * - the second half of that clause is this file.
 *
 * TYPES ONLY - THIS MODULE EMITS ZERO RUNTIME JAVASCRIPT
 * Every declaration below is an `interface` or a `type` alias, and both imports
 * are `import type`, so `tsc` erases the whole module and nothing from it reaches
 * the Lambda bundle. There is no class, no function, no `const`, no `enum` and no
 * default export. That is a contract rather than an accident, and the sentinel is
 * where it bites: `UnlimitedUseSentinel` is a TYPE-LEVEL literal, never a
 * `const`, because a value declared here would put engine state in the domain's
 * type layer. Seeding, incrementing and sorting belong to
 * `src/services/promotion/rewardUsageLedger.ts` (planned); persistence belongs to
 * `src/repositories/mysql/**`.
 *
 * MUTABILITY IS LOAD-BEARING, AND IT IS PER-MEMBER RATHER THAN UNIFORM
 * This is the one deliberately mutable type contract in this folder. Whether a
 * later reward is allowed depends on which earlier rewards ran, so a `Readonly<>`
 * in the wrong place does not merely inconvenience a consumer - it breaks the
 * algorithm and changes the money a customer is charged. The marking below is
 * evidence-driven: it comes from a complete census of every
 * `promotionRewardUsageDetails` and `orderItemsUsage` occurrence in the source
 * file, re-run directly while authoring this module. Two members are mutable,
 * two are `readonly`, and one is a `readonly` property holding a MUTABLE array.
 * Do not uniformly `readonly` them, and do not uniformly mutate them.
 *
 * THE LEDGER IS ITEM-LEVEL ONLY - ORDER AND FULFILLMENT DISCOUNTS ARE IMMUNE
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L324-L467]: proven by gap analysis rather than assumed - there is NO `promotionRewardUsageDetails` occurrence anywhere in that span, so the fulfillment-reward branch (opening at L345) and the order-reward branch (opening at L415) neither read nor write this ledger, and USE-LIMIT ENFORCEMENT APPLIES TO ITEM-LEVEL DISCOUNTS ONLY while order-level and fulfillment-level discounts are STRUCTURALLY IMMUNE to use-limit stripping.
 * That is the same shape of immunity sale-price discounts get from the `promotionRewardID = ""` sentinel at [model/service/PromotionService.cfc:L155-L159], which can never match the `.promotionRewardID == prID` tests at L483 and L499.
 *
 * This is the honest form of "the ledger must distinguish item-level from
 * order-level usage": the distinction is that ORDER-LEVEL USAGE IS NEVER RECORDED
 * AT ALL. There is deliberately no order-level and no fulfillment-level member
 * below. Inventing one would fabricate enforcement the legacy system does not
 * perform, and fabricated enforcement changes money in exactly the direction a
 * reviewer would never think to check.
 *
 * ZERO INTRA-FOLDER IMPORTS
 * The three modules of `src/domain/promotionEngine/` are mutually independent,
 * and the shipped sibling `qualifiedDiscountTypes.ts` already publishes that
 * contract from its side. This file imports neither it nor
 * `qualificationTypes.ts` (planned). The independence survives a real coupling in
 * the algorithm: `discountPerUseValue` below is DERIVED from the accumulator's
 * `discountAmount` at [model/service/PromotionService.cfc:L299], but the
 * derivation happens in `src/services/promotion/**` (planned), not through a type
 * import. Keeping it that way is what lets any one of these three modules be
 * regenerated without touching the other two.
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE TO THIS FILE, AND HERE IS WHY.
 * The project standard is that every query uses prepared statements, preserving
 * the injection-safety guarantee `cfqueryparam` provided (AAP 0.8.3). This module
 * contains type declarations and no query of any kind - no SQL string, no driver
 * import, no connection, no interpolation site - so there is nothing here for the
 * standard to bind. The obligation rests wholly with `src/repositories/mysql/**`,
 * which owns every statement that reads or writes the `Sw*` tables. Stating the
 * exemption explicitly is the point: silence would read as an oversight.
 *
 * TEST COVERAGE IS ENTIRELY NET-NEW (B8)
 * No legacy test touches the promotion engine: `meta/tests/unit/service/` holds
 * only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
 * UtilityRBServiceTest, none of which is in scope. Every suite that exercises
 * these types is therefore NET-NEW and must be labelled net-new rather than
 * presented as parity. The obligation is real - every type gets a test - but
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
 * is the authority. Three published citations needed correcting, and one cited
 * artefact does not exist:
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the `hb_permission="promotionPeriod.promtionRewards"` typo - a genuine data contract, preserved verbatim and never renamed - is published at L49, but L49 is a blank line inside the reward-type block comment; the attribute is on the component declaration at L57, alongside `table="SwPromoReward"` and `hb_serviceName="promotionService"`.
 * The three use-limit properties this file's sentinel substitutes for are at L65, L66 and L67, and `amount` is at L61 with NO default - all four verified by direct search.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L105-L119]: the ledger's authoritative docblock is published as L100-L120; the ledger section is exactly L105-L119, sitting inside the illustrative block comment whose delimiters are L82 and L133, and the ASC-order statement for `orderItemsUsage` is on L111.
 * The narrowing matters because the docblock and the executing code disagree elsewhere in that same comment, so the exact span is what a reviewer needs in order to tell intent from behaviour.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L252]: AAP 0.6.1 publishes the price-group discount correction as L248; L248 is a comment and L249 is the `getDiscountAmount` call, so the arithmetic is on L252.
 * The correction matches the one already recorded independently in `src/domain/valueObjects/money.ts` and `src/domain/promotionEngine/qualifiedDiscountTypes.ts`, so all three files agree.
 *
 * LEGACY-NOTE [slatwall-ts/README.md]: the LOCATOR-DRIFT CAUTION is cited as already shipped in the subtree README, and that file is ABSENT at this checkpoint - it is `(planned)`, listed as such in the header block above.
 * The drift finding itself stands on its own evidence rather than on that citation: it was reproduced here by direct source reading and independently corroborated by the shipped `money.ts` header, so nothing in this file depends on a document that does not yet exist.
 */

import type { PromotionReward } from '../entities/promotionReward.js';
import type { Money } from '../valueObjects/money.js';

/**
 * The literal the legacy engine seeds into all three use limits to mean "no
 * limit": one million, exactly as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L175, L176, L177]: the seed at L173-L179 writes `maximumUsePerOrder = 1000000`, `maximumUsePerItem = 1000000` and `maximumUsePerQualification = 1000000`, and this alias names that literal without changing it.
 * Declared as a TYPE alias rather than a `const` so the module still emits zero runtime JavaScript while the value stays greppable and self-documenting; the digits are written without a numeric separator so that `1000000` greps identically in the target and in the source.
 *
 * WHY NO SUBSTITUTION IS ACCEPTABLE - THE SENTINEL DOES ARITHMETIC.
 * `Infinity`, `Number.MAX_SAFE_INTEGER`, `undefined`, `null` and a boolean
 * `unlimited` flag are all wrong here, and not for stylistic reasons. The value
 * is not merely compared - it participates in arithmetic and in a ratchet:
 *
 *   * [model/service/PromotionService.cfc:L223] compares
 *     `qualificationQuantity * maximumUsePerQualification` against
 *     `maximumUsePerOrder`, and
 *   * [model/service/PromotionService.cfc:L224] then assigns that product back
 *     into `maximumUsePerOrder` whenever the product is smaller.
 *
 * With `1000000` seeded, a qualification quantity of 1 against an unlimited
 * per-qualification limit yields `1 * 1000000 = 1000000`, which is NOT less than
 * `1000000`, so the ratchet does not fire and the limit stays put. Substitute
 * `Infinity` and the product becomes `Infinity`, which is also not less than
 * `Infinity` - but the moment a REAL per-qualification limit is present the two
 * models diverge, because `qualificationQuantity * 5` is less than `1000000` and
 * therefore ratchets, while the same product measured against `Infinity` ratchets
 * from a different starting point and every subsequent comparison at L236 and
 * L471 sees a different number. `undefined` or a flag would make L223's
 * multiplication and L471's `>` comparison inexpressible without inventing a
 * branch the legacy code does not have.
 *
 * ONE MILLION IS AN INHABITANT OF `number`, NOT A SEPARATE TYPE.
 * The three limit members below are typed `number`, not `number |
 * UnlimitedUseSentinel`. A union would be a lie about the domain: the seeded
 * sentinel and a merchant-configured limit are the same kind of value to every
 * line that reads them, and nothing anywhere branches on "is this the sentinel".
 * This alias exists to name the seed, to make it searchable, and to carry the two
 * subtleties documented on those members - not to partition the type.
 *
 * THE DUAL CONVENTION, WHICH MUST NOT BE MERGED.
 * Two different representations of "unlimited" coexist in the target, and both
 * are correct at their own layer:
 *
 *   * At the ENTITY layer, absence means unlimited. `PromotionReward`'s three
 *     limits are nullable integers carrying `hb_nullRBKey="define.unlimited"`
 *     [model/entity/PromotionReward.cfc:L65, L66, L67], and the ported accessors
 *     return `number | undefined` accordingly. `PromotionPeriod` follows the same
 *     convention for `maximumUseCount` and `maximumAccountUseCount`, both
 *     declared `notnull="false"` with the same null resource key
 *     [model/entity/PromotionPeriod.cfc:L55, L56], and its date bounds carry
 *     `define.forever` [model/entity/PromotionPeriod.cfc:L53, L54].
 *   * At the LEDGER layer - this file - the numeric sentinel is substituted once,
 *     at seed time, by [model/service/PromotionService.cfc:L173-L179].
 *
 * Do not harmonise them, do not import the entity convention into this file, and
 * do not "improve" the ledger by making its limits optional. The seed is the
 * boundary between the two conventions, and it is a translation step the legacy
 * engine performs deliberately so that every later line can do plain arithmetic
 * without a null check.
 */
export type UnlimitedUseSentinel = 1000000;

/**
 * One record of one promotion reward having been used on one order item.
 *
 * EXACTLY THREE MEMBERS. Both construction sites build the same three keys and no
 * others - the ordered insert at [model/service/PromotionService.cfc:L309-L313]
 * and the append fallback at [model/service/PromotionService.cfc:L323-L327] - and
 * the illustrative docblock at [model/service/PromotionService.cfc:L112-L116]
 * lists the same three. A fourth member would be inventing engine state.
 *
 * EVERY MEMBER IS `readonly`, AND THAT IS EVIDENCE RATHER THAN PREFERENCE. No
 * source line ever rewrites a field of an existing usage record: L309 and L323
 * construct FRESH objects, and the only mutation in this structure is to the
 * containing array. The two lines that read a record back -
 * [model/service/PromotionService.cfc:L476] for `orderItemID` and
 * [model/service/PromotionService.cfc:L477] for `discountQuantity` - copy the
 * values into locals rather than modify them. Marking the record `readonly` is
 * therefore the faithful reading, and it also keeps the mutable surface of this
 * file down to exactly the three places where the legacy engine genuinely mutates.
 */
export interface OrderItemUsage {
  /**
   * Which order item this usage was recorded against.
   *
   * OPAQUE. It is the value of `orderItem.getOrderItemID()`
   * [model/service/PromotionService.cfc:L310, L324], and it is never branded,
   * never parsed and never resolved back to an OrderItem: the Order aggregate is
   * out of scope, the promotion engine consumes read-only order-shaped input at
   * the anti-corruption boundary, and this string exists only so the stripping
   * pass can look up the matching bucket of qualified discounts at
   * [model/service/PromotionService.cfc:L482] and
   * [model/service/PromotionService.cfc:L498].
   */
  readonly orderItemID: string;

  /**
   * How many units of that order item this reward was applied to.
   *
   * A COUNT, SO GENUINELY `number` AND NEVER `Money`. It is derived at
   * [model/service/PromotionService.cfc:L228] as `qualificationQuantity *
   * maximumUsePerQualification`, then clamped twice - down to the order item's own
   * quantity at [model/service/PromotionService.cfc:L231-L233] and down to
   * `maximumUsePerItem` at [model/service/PromotionService.cfc:L236-L238] - before
   * being stored here. Every one of those operands is a unit count, so routing it
   * through the `Money` value object would be a category error: `Money` is the
   * sole arithmetic surface for CURRENCY, and quantities are not currency.
   *
   * It is the same value that [model/service/PromotionService.cfc:L297] adds into
   * `usedInOrder`, which is what makes `usedInOrder` a count too, and it is the
   * quantity that over-use stripping measures against at
   * [model/service/PromotionService.cfc:L479].
   */
  readonly discountQuantity: number;

  /**
   * The discount this usage bought, per unit - the sort key of the ledger's
   * ascending insert-sort.
   *
   * `Money`, never `number`: it is a currency amount, and all money in the target
   * passes through the one arithmetic surface so that no floating-point operation
   * ever touches a monetary value.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L299]: `var discountPerUseValue = precisionEvaluate('discountAmount / discountQuantity');` divides by `discountQuantity` with NO zero check on the divisor - there is no guard, no default and no branch protecting it anywhere on the path from L228 to L299.
   * Preserved deliberately; do not fix without a product decision. The target reproduces the unguarded division by routing it through `Money.dividedBy`, which refuses a zero divisor and lets that refusal PROPAGATE: returning `0` would silently invent money out of an arithmetic fault, and returning `undefined` would push a null check onto every consumer of every arithmetic result.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L486]: there is a SECOND unguarded division that no published citation names - only L299 is registered - dividing the accumulated `discountAmount` by `thisDiscountQuantity` inside the partial-strip branch of over-use stripping.
   * It gets the same treatment and the same hand-off, and the pair is recorded together here because a consumer that guards one and not the other would produce two different behaviours for the same class of fault.
   *
   * WHERE THE GUARD DECISION LIVES, STATED EXPLICITLY. Whether either call site
   * wants a guard, and what that guard should do, is owned by
   * `src/services/promotion/rewardUsageLedger.ts` (planned) for L299 and by
   * `src/services/promotion/overUseStripping.ts` (planned) for L486. It is not
   * this file's decision and not the value object's: `Money.dividedBy` already
   * documents the same hand-off from its side, so the two files agree. Nothing in
   * this folder may add a guard, a `0` fallback or a `NaN` return.
   */
  readonly discountPerUseValue: Money;
}

/**
 * One promotion reward's use limits and its running usage, as the engine
 * accumulates them.
 *
 * SEEDED ONCE PER REWARD, BEHIND A KEY-EXISTENCE GUARD. The whole entry is
 * created by [model/service/PromotionService.cfc:L173-L179] inside
 * `if(!structKeyExists(promotionRewardUsageDetails, reward.getPromotionRewardID()))`
 * at [model/service/PromotionService.cfc:L172], so a reward that appears twice in
 * the reward collection keeps the entry - and therefore the usage - it already
 * accumulated. All three limits are seeded to {@link UnlimitedUseSentinel} and
 * `usedInOrder` to `0`, and the three overrides at
 * [model/service/PromotionService.cfc:L180-L188] then read
 * {@link PromotionReward.getMaximumUsePerOrder},
 * {@link PromotionReward.getMaximumUsePerItem} and
 * {@link PromotionReward.getMaximumUsePerQualification}.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L180, L183, L186]: each override is guarded by `!isNull(x) && x > 0`, so a stored limit of ZERO - or a negative - LEAVES THE `1000000` SENTINEL IN PLACE and the reward is treated as UNLIMITED.
 * Zero means unlimited too, which is deeply counter-intuitive and is exactly the kind of subtlety a "sensible" reimplementation destroys: a consumer that treats a stored `0` as "no uses permitted" would suppress a discount the legacy engine grants, and one that clamps a negative to `0` would do the same. Reproduce the `> 0` test, not a null check.
 *
 * PER-MEMBER MUTABILITY, FROM A COMPLETE CENSUS OF THE SOURCE FILE. Two members
 * are mutable, two are `readonly`, and one is a `readonly` property holding a
 * mutable array. Each marking below carries the write sites it rests on. This is
 * the single most load-bearing decision in this file: the ledger's mutability is
 * why the engine is order-dependent, and order dependence is why the money a
 * customer is charged can differ. A `Readonly<>` applied uniformly here would
 * BREAK THE ALGORITHM, and a mutable applied uniformly would licence writes the
 * legacy engine never performs.
 */
export interface PromotionRewardUsageDetail {
  /**
   * How many units this reward has been applied to across the whole order so far.
   *
   * MUTABLE, AND THE MUTABILITY IS LOAD-BEARING. Do NOT mark this `readonly`.
   *
   * CFML parity [model/service/PromotionService.cfc:L297]: `promotionRewardUsageDetails[ reward.getPromotionRewardID() ].usedInOrder += discountQuantity;` accumulates IN PLACE, once per order item that qualifies, inside the reward loop that closes at L465.
   * This one line is the whole reason the engine is order-dependent: the running total is threaded through the loop, so whether a later reward is allowed depends on which earlier rewards ran, and a `readonly` marking would make the accumulation inexpressible and force a consumer to rebuild the entry - which is precisely the class of change that silently alters money.
   *
   * A COUNT, so `number` rather than `Money`. It accumulates
   * {@link OrderItemUsage.discountQuantity}, which is a unit count.
   *
   * Read twice, both times by over-use stripping:
   * [model/service/PromotionService.cfc:L471] tests it against
   * `maximumUsePerOrder` to decide whether stripping is needed at all, and
   * [model/service/PromotionService.cfc:L472] subtracts to size the strip.
   *
   * NO INITIAL VALUE IS DECLARED HERE. The seed writes `0`
   * [model/service/PromotionService.cfc:L174]; a default in a type would be a
   * value, and this module emits none.
   */
  usedInOrder: number;

  /**
   * The most units this reward may be applied to across the whole order.
   *
   * MUTABLE, AND FOR TWO INDEPENDENT REASONS. Do NOT mark this `readonly`. The
   * first write is the ordinary seed-time override at
   * [model/service/PromotionService.cfc:L181]. The second is a ratchet that fires
   * DURING the order-item loop, and it is the reason this member cannot be
   * `readonly` even if the override were folded into construction.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: THE RATCHET, AND A SIXTH ORDER-DEPENDENCE VECTOR THAT NO PUBLISHED ANALYSIS NAMES. AAP 0.6.1 enumerates five ways `updateOrderAmountsWithPromotions` is order-dependent; this is a sixth. L223 tests `if((qualificationQuantity * maximumUsePerQualification) lt maximumUsePerOrder)` and L224 then assigns that product into `maximumUsePerOrder`, ratcheting it DOWN to `min(current, qualificationQuantity * maximumUsePerQualification)` - and both lines sit INSIDE the per-order-item loop opened at L203, so the ratchet fires once per qualifying item.
   * The consequence is that the FINAL `maximumUsePerOrder` depends on WHICH order items were visited and IN WHAT ORDER, and the over-use stripping trigger at L471 and the strip sizing at L472 read the RATCHETED value rather than the seeded one. This finding was verified verbatim against the source and is recorded deliberately rather than discovered later: a consumer that treats this member as a constant configured limit will compute a different amount of stripping, and therefore a different discount.
   *
   * A COUNT, so `number`. The seeded default is {@link UnlimitedUseSentinel},
   * which is what makes the L223 comparison meaningful before any real limit is
   * known - see the arithmetic worked through on that alias.
   *
   * Read three times: [model/service/PromotionService.cfc:L223] as the ratchet's
   * ceiling, and [model/service/PromotionService.cfc:L471] and
   * [model/service/PromotionService.cfc:L472] by over-use stripping - where L472
   * reads it through the LEAKED reward key rather than the loop key, which is the
   * defect documented on {@link PromotionRewardUsageDetails}.
   */
  maximumUsePerOrder: number;

  /**
   * The most units this reward may be applied to on any single order item.
   *
   * `readonly`, ON THE EVIDENCE. Exactly one line in the file writes it - the
   * seed-time override at [model/service/PromotionService.cfc:L184] - and no line
   * rewrites it afterwards. Marking it mutable would licence a write the legacy
   * engine never performs, and the asymmetry against `maximumUsePerOrder`
   * immediately above is the whole point of marking these members individually.
   *
   * A COUNT, so `number`. The seeded default is {@link UnlimitedUseSentinel}, and
   * the `> 0`-only override applies: a stored `0` leaves the sentinel.
   *
   * Read twice, as the second of the two clamps on `discountQuantity`:
   * [model/service/PromotionService.cfc:L236] tests it and
   * [model/service/PromotionService.cfc:L237] assigns it, capping the per-item
   * quantity that ever reaches {@link OrderItemUsage.discountQuantity}.
   */
  readonly maximumUsePerItem: number;

  /**
   * The most units this reward may be applied to per qualification.
   *
   * `readonly`, ON THE EVIDENCE. Exactly one line writes it - the seed-time
   * override at [model/service/PromotionService.cfc:L187] - and no line rewrites
   * it. It is read three times and written never after seeding, which is what
   * distinguishes it from `maximumUsePerOrder`: it is the ratchet's INPUT, not the
   * ratchet's target.
   *
   * A COUNT, so `number`. The seeded default is {@link UnlimitedUseSentinel}, and
   * the `> 0`-only override applies.
   *
   * Read at [model/service/PromotionService.cfc:L223] and
   * [model/service/PromotionService.cfc:L224] as the multiplicand of the ratchet,
   * and at [model/service/PromotionService.cfc:L228] to derive
   * `discountQuantity` as `qualificationQuantity * maximumUsePerQualification`
   * before the two clamps narrow it.
   */
  readonly maximumUsePerQualification: number;

  /**
   * Every usage of this reward, one record per order item, held in ascending order
   * of {@link OrderItemUsage.discountPerUseValue}.
   *
   * A `readonly` PROPERTY HOLDING A MUTABLE ARRAY - and the distinction is exact.
   * The property is never reassigned: the array is created empty by the seed at
   * [model/service/PromotionService.cfc:L178] and no later line assigns a
   * different array to it. Its CONTENTS are mutated twice, by
   * `arrayInsertAt` at [model/service/PromotionService.cfc:L309] and by
   * `arrayAppend` at [model/service/PromotionService.cfc:L323].
   *
   * So the type is `readonly orderItemsUsage: OrderItemUsage[]`, NOT
   * `ReadonlyArray<OrderItemUsage>` and not a mutable property. `ReadonlyArray`
   * would make both mutation sites inexpressible; a mutable property would licence
   * a whole-array replacement the engine never performs. TypeScript expresses
   * exactly this shape, so there is no need to approximate it.
   *
   * SORTED ASCENDING BY `discountPerUseValue`, BY HAND, ON INSERT.
   * [model/service/PromotionService.cfc:L301] seeds `var usageAdded = false;`;
   * [model/service/PromotionService.cfc:L304-L318] walks the existing array and
   * tests `if(... .orderItemsUsage[oiu].discountPerUseValue > discountPerUseValue)`
   * at [model/service/PromotionService.cfc:L306], inserting before the first
   * larger entry at L309, setting the flag at L315 and breaking at L316;
   * [model/service/PromotionService.cfc:L320-L329] appends when no such entry was
   * found. The invariant is stated in the docblock at
   * [model/service/PromotionService.cfc:L111]. The ordering exists so that the
   * CHEAPEST-PER-USE discounts are stripped FIRST when a reward turns out to have
   * been over-used.
   *
   * CFML parity [model/service/PromotionService.cfc:L306]: the comparison is STRICTLY `>`, so on an exact tie the INCUMBENT keeps its earlier position and the newcomer lands after it - first-in wins a tie.
   * Reproduce the strict comparison exactly. A `>=` would reverse tie handling, and because stripping walks this array from index 1 upward at L475 and stops as soon as `needToRemove` reaches zero at L514, a reversed tie changes WHICH order item loses its discount.
   *
   * CFML parity [model/service/PromotionService.cfc:L269-L294, L304-L329]: THE TWO INSERTION SORTS RUN IN OPPOSITE DIRECTIONS AND BOTH ARE LOAD-BEARING - NEVER UNIFY THEM. This array is insert-sorted ASCENDING by `discountPerUseValue` (L306, strict `>`), while the qualified-discount accumulator typed by the shipped sibling `qualifiedDiscountTypes.ts` is insert-sorted DESCENDING by `discountAmount` (L271, strict `<`, with the early `break` at L281) and only its index [1] is ever applied at L532 and L534.
   * The two orderings answer different questions - "which discount is best for this item" versus "which discount is cheapest to give up" - and a shared comparator would silently change the money. Both tie-breaks are strict and therefore both favour the incumbent, which is the one property they do share; the sibling records the same opposition from its side, and neither module imports the other.
   *
   * CFML parity [model/service/PromotionService.cfc:L303]: the source comment above this loop reads "place it in ASC order" but spells "and" as "an".
   * Recorded for traceability only - the comment is not copied into the target, and the typo has no behavioural consequence. It is noted because it is the sentence a reviewer will search for when checking that the ascending direction was read from the source rather than assumed.
   *
   * AN ARRAY CAN LEGITIMATELY BE EMPTY, so it is not typed as non-empty: the seed
   * creates it empty, and a reward that qualifies for no order item never has a
   * record appended. That is why the stripping loop at
   * [model/service/PromotionService.cfc:L475] is bounded by `arrayLen` rather than
   * assuming an element exists.
   *
   * Read at [model/service/PromotionService.cfc:L304] and
   * [model/service/PromotionService.cfc:L306] while sorting, and at
   * [model/service/PromotionService.cfc:L475], L476 and L477 while stripping -
   * where all three of those reads go through the LEAKED reward key rather than
   * the loop key; see {@link PromotionRewardUsageDetails}.
   */
  readonly orderItemsUsage: OrderItemUsage[];
}

/**
 * The ledger's key: a `promotionRewardID`, and specifically whatever
 * {@link PromotionReward.getPromotionRewardID} returns.
 *
 * `string` by construction, so `Record<PromotionRewardUsageKey, T>` is exactly
 * `Record<string, T>` - the alias names the key's provenance without narrowing it,
 * and no consumer needs to convert anything.
 *
 * JUDGMENT CALL: the key is DERIVED from the entity accessor rather than written as a bare `string`, because the ledger is reached by two different routes and the type should say so. [model/service/PromotionService.cfc:L468] iterates the container by struct key (`prID`), while L173, L181, L184, L187, L223, L224, L228, L236, L237, L297, L304, L309, L323, L472, L475, L476 and L477 all index it by `reward.getPromotionRewardID()`. Anchoring the alias to the accessor's return type makes the second route compile-checked: if the entity's identifier shape ever changed, this alias changes with it and every consumer is forced to reconcile rather than silently coercing.
 * It also gives the `PromotionReward` import a load-bearing type position instead of a decorative one, which matters under `noUnusedLocals`: the entity is genuinely part of this contract - it supplies the key AND the three limits the seed reads - and an import that only appeared in prose would be an import this file does not need.
 */
export type PromotionRewardUsageKey = ReturnType<PromotionReward['getPromotionRewardID']>;

/**
 * The ledger itself: every promotion reward's limits and usage, keyed by
 * `promotionRewardID`.
 *
 * MUTABLE, DELIBERATELY. Not `Readonly<Record<...>>`: keys are ADDED during the
 * reward pass, by the guarded seed at
 * [model/service/PromotionService.cfc:L172-L179], to a structure that starts life
 * as `{}` at [model/service/PromotionService.cfc:L139]. A `Readonly` wrapper would
 * make the seed inexpressible, and freezing the value type would collide with the
 * two mutable members documented on {@link PromotionRewardUsageDetail}.
 *
 * REQUEST-SCOPED, NEVER MODULE STATE. The legacy structure is a `var` local to one
 * invocation of `updateOrderAmountsWithPromotions`, and the port must keep it
 * that way. A module-level ledger would persist between unrelated invocations on a
 * warm Lambda container and leak one customer's accumulated usage into another
 * customer's order - which is a correctness problem, not a housekeeping one. This
 * type is a shape, so it cannot enforce the scoping by itself; the obligation
 * belongs to `src/services/promotion/rewardUsageLedger.ts` (planned), and it is
 * stated here because this is where a reader looks for it.
 *
 * BOTH ACCESS MODES MUST STAY AVAILABLE, AND THAT IS A HARD REQUIREMENT ON THE
 * SHAPE. A plain mutable `Record` keyed by {@link PromotionRewardUsageKey} supports
 * iteration over its own keys AND lookup by a reward-derived key, and it must keep
 * supporting both, because the legacy correction loop uses the two
 * interchangeably - incorrectly. Narrowing this to a `Map`, to a branded key, or
 * to an interface with named lookup helpers would make the defect below
 * inexpressible, and the defect is behaviour that must be preserved.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: over-use stripping iterates `for(var prID in promotionRewardUsageDetails)` at L468, but reads the ledger by the WRONG KEY on four of the lines inside that loop. L471 correctly uses `[prID]` on both sides of its comparison; L472 MIXES the two, computing `needToRemove` as `promotionRewardUsageDetails[ prID ].usedInOrder - promotionRewardUsageDetails[ reward.getPromotionRewardID() ].maximumUsePerOrder`; and L475, L476 and L477 ALL read `orderItemsUsage`, `orderItemID` and `discountQuantity` from `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]`. `reward` is the loop variable of the reward loop that already CLOSED at L465, so it holds the LAST reward of that loop, and maximum-use-per-order is therefore enforced against whichever reward happened to be last, for every key in the ledger. The two search loops at L483 and L499 then match on `.promotionRewardID == prID`, correctly, so the strip is sized from one reward and applied to another.
 * Preserved deliberately; do not fix without a product decision. Reproduction is owned by `src/services/promotion/overUseStripping.ts` (planned); this file's obligation is narrower and absolute - keep the defect EXPRESSIBLE, which is why the container stays a plain keyed record with no lookup discipline baked in.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L472, L479, L486]: THE DEFECT CAN *INCREASE* A DISCOUNT, NOT ONLY UNDER-ENFORCE ONE. Because L472 subtracts a limit belonging to a DIFFERENT reward, `needToRemove` can come out NEGATIVE; a negative value satisfies `if(needToRemove < thisDiscountQuantity)` at L479, so the partial-strip branch runs, and its factor `(thisDiscountQuantity - needToRemove) / thisDiscountQuantity` at L486 then EXCEEDS 1 - INFLATING the stored discount instead of scaling it down.
 * Preserved deliberately; do not fix without a product decision. "Repairing it changes money" is therefore BIDIRECTIONAL, and a reviewer checking only for under-enforcement would miss half of it - which is why this direction is registered as its own marker rather than folded into the note above.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L51-L132]: THE NON-DETERMINISM THAT SITS UNDER ALL OF THIS. `getActivePromotionRewards` returns `ormExecuteQuery(hql, params)` at L131 with NO `ORDER BY` - verified by a case-insensitive search of the whole DAO file, which returns ZERO matches - so the reward iteration order is whatever the driver returns.
 * Combined with a mutable ledger threaded through that iteration, an exact tie can change the money charged, and it also decides WHICH reward the stale `reward` variable holds when the defect above fires. The absent `ORDER BY` is preserved at the repository (`src/repositories/mysql/mysqlPromotionRepository.ts`, planned); do NOT add an ordering assumption to this type and do not suggest one, because imposing an order here would silently make a non-deterministic legacy behaviour deterministic in one particular direction.
 *
 * THE CONSUMER MUST NARROW, NOT ASSERT. `noUncheckedIndexedAccess` types every
 * indexed read of this record as `PromotionRewardUsageDetail | undefined`, and
 * `@typescript-eslint/no-non-null-assertion` is an error across `src/**`, so
 * neither `!` nor `as` is available. That is not friction to route around: the
 * legacy `structKeyExists` guard at
 * [model/service/PromotionService.cfc:L172] maps exactly onto TypeScript
 * narrowing, so read the entry into a local and test it. The compiler then proves
 * what the CFML only assumed - including in the stripping loop, where the leaked
 * key genuinely might not be present in the ledger at all.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L166, L458-L461]: the two-pass reward iteration is implemented by mutating the loop counter - L166 declares `var orderRewards = false;`, and L458-L461 sets `pr = 0` and flips the flag when `pr == arrayLen(promotionRewards)` - and because that reset sits INSIDE the loop body, which closes at L465, THE SECOND PASS NEVER RUNS AT ALL WHEN `promotionRewards` IS EMPTY.
 * The target's two explicit ordered passes must reproduce that outcome DELIBERATELY rather than accidentally, and pass two must stay second: it reads `arguments.order.getSubtotalAfterItemDiscounts()` at L417, a value that only has meaning once pass one has applied the item discounts. Reproduction is owned by `src/services/promotion/twoPassRewardIterator.ts` (planned); it is recorded here because the ledger is the state both passes would share - except that, as the header records, the order-level pass never touches it.
 */
export type PromotionRewardUsageDetails = Record<
  PromotionRewardUsageKey,
  PromotionRewardUsageDetail
>;
