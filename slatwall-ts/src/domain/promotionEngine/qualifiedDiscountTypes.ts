// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no declaration below depends on
// one - this module's only imports are three shipped siblings. The complete set
// named below, with the role each will play:
//
//   src/services/promotion/salePriceSeeding.ts       seeds the "" sentinel record
//   src/services/promotion/discountAmount.ts         computes `discountAmount`
//   src/services/promotion/rewardUsageLedger.ts      the opposing ASC usage sort
//   src/services/promotion/overUseStripping.ts       mutates then deletes records
//   src/services/promotion/promotionApplication.ts   reads index [1], emits intents
//   src/services/promotion/twoPassRewardIterator.ts  the two ordered passes
//   src/services/promotionService.ts                 the facade returning the intents
//   src/domain/promotionEngine/rewardUsageTypes.ts   sibling ledger types, NOT imported
//   src/domain/promotionEngine/qualificationTypes.ts sibling period types, NOT imported
// ---------------------------------------------------------------------------

/**
 * slatwall-ts - the qualified-discount accumulator and the promotion engine's
 * write-side output contract.
 *
 * WHAT THIS FILE IS
 * Two type contracts, and nothing else:
 *
 *   1. `QualifiedDiscount` / `OrderItemQualifiedDiscounts` - the INTERNAL,
 *      MUTABLE accumulator that `updateOrderAmountsWithPromotions` builds while
 *      it decides which discount wins on each order item.
 *   2. `PromotionAppliedType` / `PromotionAppliedIntent` - the engine's
 *      write-side OUTPUT, the anti-corruption replacement for mutating an Order
 *      aggregate that stays in CFML.
 *
 * AUTHORITY
 * AAP 0.4.1, the "Value Objects, Views, and Engine Types" row for this path:
 * CREATE, sourced from [model/service/PromotionService.cfc:L82-L133], described
 * as "Types the qualified-discount accumulator; the legacy key typo
 * `orderItemQulifiedDiscounts` is renamed with a comment recording the original
 * spelling". AAP 0.4.2 gates the consumer signature
 * `async updateOrderAmountsWithPromotions(order: OrderView):
 * Promise<PromotionAppliedIntent[]>`, which is why `PromotionAppliedIntent`
 * exists here by exactly that name. AAP 0.6.1 is the hotspot analysis these
 * types have to make reproducible.
 *
 * TYPES ONLY - THIS MODULE EMITS ZERO RUNTIME JAVASCRIPT
 * Every declaration below is an `interface` or a `type` alias, and all three
 * imports are `import type`. There is no class, no function, no `const`, no
 * `enum` and no default export, so `tsc` erases the whole module and nothing
 * from it reaches the Lambda bundle. That is a contract, not an accident: the
 * accumulator's arithmetic belongs to `src/services/promotion/**` (planned) and
 * its persistence to `src/repositories/mysql/**`, and a value declared here
 * would put engine behaviour in the domain's type layer.
 *
 * WHY THE ENGINE IS ORDER-DEPENDENT, AND WHY THAT LANDS ON THESE TYPES
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58-L546]
 * is 489 lines in one function and is order-dependent in six independent ways,
 * every one of which can change the money a customer is charged. All six were
 * re-verified against the source while authoring this file:
 *
 *   1. A MUTABLE USAGE LEDGER threaded through the whole loop. `usedInOrder` is
 *      incremented in place at :L297, so whether a later reward is allowed
 *      depends on which earlier rewards ran - and `getActivePromotionRewards`
 *      [model/dao/PromotionDAO.cfc:L51-L132] applies NO `ORDER BY` (verified by
 *      direct search of that range), so the iteration order is whatever the ORM
 *      returns. The ledger itself is typed by the sibling
 *      `rewardUsageTypes.ts` (planned), not here.
 *   2. A HAND-ROLLED TWO-PASS LOOP implemented by mutating the loop counter
 *      (:L166 declares the flag, :L458-L461 resets `pr` to 0 and flips it).
 *   3. OVER-USE STRIPPING READS A LEAKED VARIABLE (:L468-L521) - see the
 *      LEGACY-DEFECT marker on `discountAmount` below.
 *   4. TWO INSERTION SORTS RUNNING IN OPPOSITE DIRECTIONS (:L269-L294 descending
 *      here, :L304-L329 ascending on the ledger) - see the marker on
 *      `OrderItemQualifiedDiscounts`.
 *   5. AN UNGUARDED DIVISION at :L299, and a SECOND one at :L486 that no
 *      published citation names - see the marker on `discountAmount`.
 *   6. A CROSS-SERVICE ORDERING CONSTRAINT the legacy code leaves implicit:
 *      :L241 branches on `orderItem.getAppliedPriceGroup()` and :L252 corrects
 *      the discount by `getExtendedSkuPrice() - getExtendedPrice()`, so the
 *      promotion pass READS state the price-group pass WRITES.
 *      `PriceGroupService.updateOrderAmountsWithPriceGroups`
 *      [model/service/PriceGroupService.cfc:L364] must run FIRST. In the legacy
 *      system that held only because `OrderService` happened to call them in
 *      that sequence; the target orders them explicitly. Enforcing it is the
 *      consumer's obligation, not something a type can express.
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE TO THIS FILE, AND HERE IS WHY.
 * The project standard is that every query uses prepared statements, preserving
 * the injection-safety guarantee `cfqueryparam` provided (AAP 0.8.3). This
 * module contains type declarations and no query of any kind - no SQL string, no
 * driver import, no connection, no interpolation site - so there is nothing here
 * for the standard to bind. The obligation rests wholly with
 * `src/repositories/mysql/**`, which owns every statement that reads or writes
 * the `Sw*` tables. Stating the exemption explicitly is the point: silence would
 * read as an oversight.
 *
 * TEST COVERAGE IS ENTIRELY NET-NEW (B8)
 * No legacy test touches the promotion engine: `meta/tests/unit/service/` holds
 * only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
 * UtilityRBServiceTest, none of which is in scope, and `1766` appears nowhere
 * under `meta/tests/` (both verified by direct search). Every suite that
 * exercises these types is therefore NET-NEW and must be labelled net-new
 * rather than presented as parity. Authoring those suites belongs to the test
 * tier under `slatwall-ts/tests/**`; this file authors none.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT
 * `review_rules` returns the single line "No user rules provided." - re-queried
 * while authoring this file, both without a range and over the whole document,
 * with byte-identical results. The absence is verified rather than assumed, no
 * rule is invented to fill it, and it is not treated as licence to lower the
 * bar: the project's enterprise substitutes apply at full strength here (AAP
 * 0.7, AAP 0.8.3). `review_rules` remains the authoritative source; this is a
 * record of its result.
 *
 * LOCATOR CORRECTIONS, RECORDED SO A REVIEWER CAN RECONCILE THEM
 * Every locator cited in this file was checked against the source, and the
 * source is the authority. Three published citations needed correcting:
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: the published range for the accumulator is the illustrative BLOCK COMMENT - its opening delimiter is on L82 and its closing delimiter on L133 - and the misspelled key appears inside it at L121. The LIVE declaration is L142, populated at L152, L155 and L262.
 * Both facts are recorded because the docblock is the authority for the intended shape while the executing lines are the authority for the actual one, and they disagree - see the two phantom keys below.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L252]: AAP 0.6.1 publishes this `precisionEvaluate` site as L248; L248 is a comment and L249 is the `getDiscountAmount` call, so the arithmetic that corrects a price-group discount is on L252.
 * The correction matches the one already recorded independently in `src/domain/valueObjects/money.ts`, so the two files agree.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L472, L475, L476, L477]: AAP 0.6.1 registers the leaked-variable defect at L472 alone; the leak is BROADER than published - all four of those lines index the ledger by the stale `reward` variable rather than by the loop key `prID`.
 * Recorded here because a consumer reproducing only L472 would still normalise three sites and change the money.
 */

import type { Promotion } from '../entities/promotion.js';
import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { Money } from '../valueObjects/money.js';

/**
 * One potential discount on one order item, as the engine accumulates it.
 *
 * EXACTLY THREE MEMBERS. Both construction sites build the same three keys and
 * no others - the ordered insert at [model/service/PromotionService.cfc:L274-L278]
 * and the append fallback at [model/service/PromotionService.cfc:L288-L292] - and
 * so does the sale-price seed at [model/service/PromotionService.cfc:L155-L159].
 * A fourth member would be inventing engine state; see the two phantom keys
 * documented on `discountAmount` below.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: the legacy accumulator this record lives in is spelled `orderItemQulifiedDiscounts`, missing the `a` in "Qualified"; the target uses the corrected spelling `orderItemQualifiedDiscounts` (`OrderItemQualifiedDiscounts` in type position).
 * The rename is permitted precisely because the key never crosses a boundary: all 20 source lines that mention it (L121, L142, L152, L155, L259, L260, L262, L269, L271, L274, L288, L482, L483, L486, L498, L499, L502, L529, L532, L534 - verified by census) are local-variable references inside one CFML function, so it is never a column, never a JSON key, never a URL parameter and never a persisted or transported name, and the interface-parity obligation binds public method names rather than function-local state.
 *
 * CONTRAST - the legacy identifiers that ARE genuine contracts and are therefore
 * preserved verbatim wherever they surface, never corrected:
 * `promotionPeriod.promtionRewards` (an `hb_permission` attribute string),
 * `getSalePricExpirationDateTime`, `singlularname`, `subsciptionUsageBenefit`.
 * None of them appears in this file; they are named so the asymmetry between
 * "renamed with a comment" and "preserved with a comment" reads as a decision.
 */
export interface QualifiedDiscount {
  /**
   * The reward that produced this discount, or the empty string for a sale
   * price.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L155-L159]: the sale-price seed appends a record whose `promotionRewardID` is the EMPTY STRING (L156), because a sale price comes from a promotion but from no reward; the same `"" / 0` seeding idiom recurs on the shipping surface at [model/service/PromotionService.cfc:L1033-L1036].
   * The consequence is a money consequence and must survive the port: over-use stripping matches records with `.promotionRewardID == prID` at L483 and L499, and `prID` is always a real reward ID, so a `""` record can NEVER match and sale-price discounts are structurally IMMUNE to use-limit stripping.
   *
   * Typed as a plain `string` that admits `''`, deliberately: not branded, not
   * optional, and not `string | undefined`. The sentinel is a value the engine
   * writes and compares, so erasing it into an absence would erase the immunity
   * with it.
   */
  readonly promotionRewardID: string;

  /**
   * The promotion this discount belongs to - the ENTITY, not an identifier.
   *
   * The engine reads it back at [model/service/PromotionService.cfc:L532] to
   * populate the applied-promotion record, and it arrives from two different
   * places: `this.getPromotion(salePriceDetails.promotionID)` on the sale-price
   * path (L157) and `reward.getPromotionPeriod().getPromotion()` on the reward
   * paths (L276, L290). Both yield a Promotion, so the accumulator holds one.
   *
   * `readonly`: no source line ever rewrites this member.
   */
  readonly promotion: Promotion;

  /**
   * The discount amount. `Money`, never `number`, and MUTABLE.
   *
   * CFML parity [model/service/PromotionService.cfc:L486]: the mutability is LOAD-BEARING and must not be tightened to `readonly`. The partial-strip branch of over-use stripping REWRITES this member in place - `orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount = precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount / thisDiscountQuantity) * (thisDiscountQuantity - needToRemove)')` - scaling the discount down to the fraction of the quantity that survives the use limit.
   * A `readonly` here would make that branch inexpressible, and a consumer forced to rebuild the record instead would have to re-derive `promotionRewardID` and `promotion`, which is exactly the class of change that silently alters money. It is the ONLY mutable member in this file.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L472, L475, L476, L477]: the loop that decides how much to strip iterates `for(var prID in promotionRewardUsageDetails)` but reads `maximumUsePerOrder`, `orderItemsUsage`, `orderItemID` and `discountQuantity` from `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]` - the `reward` variable LEFT OVER from the preceding reward loop - so maximum-use-per-order is enforced against whichever reward happened to be last, for every key in the ledger.
   * Preserved deliberately; do not fix without a product decision. This type keeps the defect expressible: the stripping module (planned) selects records by `prID` at L483/L499 while sizing the strip from the leaked reward, and nothing here couples the two.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L486]: this rewrite divides by `thisDiscountQuantity` with NO zero check, a SECOND unguarded division that no published citation names - only the `discountAmount / discountQuantity` at L299 is registered.
   * Both must route through `Money.dividedBy`, letting the substrate's zero-divisor error PROPAGATE: a guard, a `0` fallback or a `NaN` return would invent money out of an arithmetic fault. Adding the guard is not this file's decision to make and not the consumer's either - it is a hand-off note for `src/services/promotion/overUseStripping.ts` (planned).
   *
   * SCHEMA AUTHORITY, AND WHY THERE IS NO ZERO DEFAULT.
   * [model/entity/PromotionApplied.cfc:L53] declares `discountAmount
   * ormtype="big_decimal"` with NO default - one of exactly four no-default
   * money columns in the slice, alongside `SkuCurrency.price`
   * [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
   * [model/entity/PriceGroupRate.cfc:L54] and `PromotionReward.amount`
   * [model/entity/PromotionReward.cfc:L61] (all four verified). The ORM schema
   * itself encodes the asymmetry: absence is NOT zero. So this member is
   * declared REQUIRED - a `QualifiedDiscount` without an amount is not a
   * discount - and `Money.zero` is never a substitute for an absent amount:
   * no `?? Money.zero`, no `|| Money.zero`, no `orZero()`, no parameter
   * default. Substituting 0 for a missing price is the mechanism that would
   * silently sell products for free.
   *
   * THE TWO PHANTOM DOCBLOCK KEYS. The docblock promises five members; the
   * executing code builds three. Both extra keys are documented immediately
   * below and NEITHER is materialised here.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L127]: the docblock documents a `discountQuantity` member on this record, and no line of the executing engine ever builds or reads one - neither L274-L278, nor L288-L292, nor L155-L159.
   * Preserved deliberately as an annotation rather than as a member; do not fix without a product decision. A same-named member does genuinely exist, but on the reward-usage ledger's `orderItemsUsage` entries (L311, L325, typed by the sibling `rewardUsageTypes.ts` (planned)) - the docblock conflates the two structures.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L128]: the docblock likewise documents a `discountPerUseValue` member here, and the executing engine never builds or reads one on this record either.
   * Preserved deliberately as an annotation rather than as a member; do not fix without a product decision. It too lives on the ledger's `orderItemsUsage` entries (L312, L326), where it is the sort key of the OPPOSING ascending sort.
   *
   * Omitting the phantoms rather than typing them optional is what
   * `exactOptionalPropertyTypes` makes meaningful: "absent" and
   * "present-but-undefined" are different states, and these keys are absent.
   */
  discountAmount: Money;
}

/**
 * The accumulator itself: every potential discount on every order item, keyed by
 * order item.
 *
 * The corrected spelling of the legacy `orderItemQulifiedDiscounts` key is
 * `orderItemQualifiedDiscounts`, and this alias publishes it in type position as
 * `OrderItemQualifiedDiscounts`. Consumers MUST use the camelCase form
 * `orderItemQualifiedDiscounts` for variables and fields - the type name is
 * PascalCase only because that is what TypeScript type positions read as, and
 * the project deliberately enables no naming-convention lint rule so that
 * legacy camelCase member names survive verbatim everywhere they are members.
 * The full rename ruling and its evidence are on `QualifiedDiscount` above.
 *
 * THE KEY IS AN OPAQUE `orderItemID`. It is the value of
 * `orderItem.getOrderItemID()` [model/service/PromotionService.cfc:L152, L260,
 * L262, L269, L529] and it is never branded, never parsed and never resolved
 * back to an OrderItem: the Order aggregate is out of scope, and the engine only
 * ever uses this string to look a bucket up and to name a target on its output.
 *
 * MUTABLE, IN FOUR DISTINCT MODES - which is why neither the record nor its
 * arrays is `readonly`. All four were verified against the source:
 *
 *   1. UNCONDITIONAL ASSIGNMENT in the sale-price pass
 *      [model/service/PromotionService.cfc:L152]:
 *      `orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ] = []`.
 *   2. GUARDED LAZY INIT in the main reward pass
 *      [model/service/PromotionService.cfc:L260-L263]: the same assignment, but
 *      wrapped in `if(!structKeyExists(...))`.
 *   3. INSERT or APPEND of a `QualifiedDiscount`
 *      [model/service/PromotionService.cfc:L274-L278, L288-L292].
 *   4. REMOVAL of a whole record via `arrayDeleteAt`
 *      [model/service/PromotionService.cfc:L502].
 *
 * CFML parity [model/service/PromotionService.cfc:L152, L260-L263]: the ASSIGN-vs-LAZY-INIT ASYMMETRY between modes 1 and 2 is reproduced as written and must not be normalised into one idiom.
 * It is load-bearing in one direction: because L152 assigns unconditionally, a second sale-price seed for the same order item would DISCARD an already-accumulated bucket, whereas L260-L263 would preserve it. The sale-price pass runs once per order item before any reward pass, so the discard does not fire today - but the two idioms are not interchangeable and collapsing them would change that.
 *
 * AN ARRAY CAN LEGITIMATELY BE EMPTY, so it is not typed as non-empty. Mode 1
 * creates an empty array before anything is appended to it, and mode 4 can empty
 * a populated one. That is exactly why the apply loop guards twice at
 * [model/service/PromotionService.cfc:L529] -
 * `structKeyExists(orderItemQulifiedDiscounts, orderItem.getOrderItemID()) &&
 * arrayLen(orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ])` - with the
 * second test being CFML `arrayLen`-as-boolean truthiness.
 *
 * SORTED DESCENDING BY `discountAmount`, BY HAND, ON INSERT.
 * [model/service/PromotionService.cfc:L269-L283] walks the existing array and
 * tests `if(orderItemQulifiedDiscounts[...][d].discountAmount < discountAmount)`
 * at L271, inserting before the first smaller entry and breaking out at L281;
 * L285-L294 appends when no such entry was found. The docblock states the
 * invariant twice, at L122 and again at L130.
 *
 * CFML parity [model/service/PromotionService.cfc:L271]: the comparison is STRICTLY `<`, so on an exact tie the INCUMBENT keeps its earlier position and the newcomer lands after it - first-in wins a tie.
 * Reproduce the strict comparison exactly; a `<=` would reverse tie handling, and because only index [1] is ever applied, a reversed tie at the head of the array changes which promotion the customer receives.
 *
 * CFML parity [model/service/PromotionService.cfc:L269-L294, L304-L329]: THE TWO SORTS RUN IN OPPOSITE DIRECTIONS AND BOTH ARE LOAD-BEARING - NEVER UNIFY THEM. This array is insert-sorted DESCENDING by `discountAmount` so that the largest discount per item wins; the reward-usage ledger's `orderItemsUsage` is insert-sorted ASCENDING by `discountPerUseValue` (L306, whose tie-break is also strict - `>` - and therefore also favours the incumbent) so that the cheapest-per-use discounts are stripped first.
 * The two orderings answer different questions - "which discount is best for this item" versus "which discount is cheapest to give up" - and a shared comparator would silently change the money. `orderItemsUsage` is typed by the sibling `rewardUsageTypes.ts` (planned), which this module does NOT import: the three modules in this folder are mutually independent.
 *
 * ONLY INDEX [1] IS EVER APPLIED. The final loop reads
 * `[1].promotion` [model/service/PromotionService.cfc:L532] and
 * `[1].discountAmount` [model/service/PromotionService.cfc:L534] and applies
 * that one record; every other qualified discount on the item is computed,
 * sorted, possibly stripped - and then discarded. In TypeScript's 0-based
 * indexing that is element `[0]`.
 *
 * THE CONSUMER MUST NARROW, NOT ASSERT. `noUncheckedIndexedAccess` types
 * `bucket[0]` as `QualifiedDiscount | undefined`, and `@typescript-eslint/
 * no-non-null-assertion` is an error across `src/**`, so no `!` and no `as` is
 * available. This is not friction to work around - the legacy double guard at
 * L529 maps exactly onto TypeScript narrowing, so read the element into a local
 * and test it, and the compiler then proves what the CFML only asserted. The
 * consumer must REPRODUCE the single-winner assumption, not defensively
 * generalise it into applying more than one discount per item.
 *
 * CFML parity [model/service/PromotionService.cfc:L482, L498]: both stripping search loops iterate this array BACKWARDS - `for(var y=arrayLen(...); y>=1; y--)` - walking from the worst discount toward the best, so the FIRST match found is the LAST matching record.
 * Do not normalise the direction: backwards iteration selects a different record when one reward contributed more than once to an item, and it is also what makes the `arrayDeleteAt` at L502 safe, since deleting at an index never disturbs the not-yet-visited lower indices.
 */
export type OrderItemQualifiedDiscounts = Record<string, QualifiedDiscount[]>;

/**
 * Which level of the order a promotion was applied to.
 *
 * Exactly three literals, and they are the only three the engine ever writes:
 * `'orderFulfillment'` [model/service/PromotionService.cfc:L402], `'order'`
 * [model/service/PromotionService.cfc:L448] and `'orderItem'`
 * [model/service/PromotionService.cfc:L531]. A case-insensitive census of the
 * whole file returns exactly those three `setAppliedType` calls and no others, so
 * there is no fourth value and no sentinel. The persisted column behind it is
 * `appliedType ormtype="string"` [model/entity/PromotionApplied.cfc:L54], with no
 * database-side constraint - the union is the target's constraint.
 *
 * JUDGMENT CALL: this union is declared INLINE here rather than imported from `src/domain/entities/promotionApplied.js`, and the reason is a dependency boundary, not a duplication oversight. `PromotionAppliedIntent` is the engine's WRITE-SIDE INSTRUCTION, not the ORM entity: it carries opaque identifiers, a `Money` and this literal union, and the entity is materialised later by the repository from an intent. `promotionApplied.ts` is not among this module's declared dependencies, so importing it would breach the dependency whitelist that keeps this folder's compile surface minimal and its three modules mutually independent.
 * The duplication is provably harmless, and this was verified rather than assumed: `promotionApplied.ts` does export a `PromotionAppliedType` and its members are the same three literals in the same order, and TypeScript treats structurally identical string-literal unions as the same type - so the two aliases are mutually assignable at every call site and a consumer may import either. Nothing needs reconciling later, which matters because names published here cannot be renamed once the nine consumer modules are authored against them.
 */
export type PromotionAppliedType = 'order' | 'orderItem' | 'orderFulfillment';

/**
 * The members every applied-promotion intent carries, whatever its operation.
 *
 * Deliberately NOT exported: consumers work with `PromotionAppliedIntent` and its
 * three variants, and the project keeps its exported surface to exactly what a
 * consumer needs. This interface exists only so the shared members are declared
 * once and cannot drift between the variants.
 */
interface PromotionAppliedIntentTarget {
  /** Which level of the order this intent addresses. */
  readonly appliedType: PromotionAppliedType;

  /**
   * The promotion being applied, as an OPAQUE identifier.
   *
   * JUDGMENT CALL: the legacy calls `setPromotion(entity)` with a live Promotion - `reward.getPromotionPeriod().getPromotion()` at [model/service/PromotionService.cfc:L403, L449] and the accumulator's `[1].promotion` at [model/service/PromotionService.cfc:L532] - but a write-side instruction that crosses into the repository layer must not carry a live domain entity: it would drag an object graph, and with it lazy-load expectations, across a boundary whose whole purpose is to end them. The intent therefore carries `promotion.getPromotionID()` and the repository re-materialises the association from it.
   * Nothing is lost: the only thing the legacy write path does with the entity is establish the foreign key declared at [model/entity/PromotionApplied.cfc:L58]. The accumulator above still holds the ENTITY, because the engine reads more than an ID from it while deciding.
   */
  readonly promotionID: string;

  /**
   * The order this intent addresses, when `appliedType` is `'order'`.
   *
   * Opaque, like all three target identifiers: the engine names a target and
   * never mutates order persistence. The correspondence is exact - `'order'` uses
   * `orderID`, `'orderItem'` uses `orderItemID`, `'orderFulfillment'` uses
   * `orderFulfillmentID` - and under `exactOptionalPropertyTypes` the inapplicable
   * keys are OMITTED rather than set to `undefined`, so an intent states its
   * target by which key is present.
   */
  readonly orderID?: string;

  /** The order item this intent addresses, when `appliedType` is `'orderItem'`. */
  readonly orderItemID?: string;

  /**
   * The fulfillment this intent addresses, when `appliedType` is
   * `'orderFulfillment'`.
   */
  readonly orderFulfillmentID?: string;

  /**
   * The currency of `discountAmount` - optional, and the engine NEVER populates
   * it.
   *
   * LEGACY-NOTE [model/entity/PromotionApplied.cfc:L55]: `currencyCode ormtype="string" length="3"` is a real persisted column, yet `setCurrencyCode` has ZERO occurrences in the whole of model/service/PromotionService.cfc (verified by census), so every row the promotion engine writes leaves it null.
   * The member is therefore optional and the engine deliberately leaves it unset: under `exactOptionalPropertyTypes` the key being ABSENT is meaningfully different from its being present-but-undefined, and absent is the honest model of a column the writer never touches. Do not synthesise a value here to make the row look complete - inferring a currency the engine never chose is a behaviour change, and the discount is denominated by whatever `Money` the engine already computed.
   */
  readonly currencyCode?: CurrencyCode;
}

/**
 * Create a new applied-promotion record.
 *
 * The engine's only operation at the ORDER-ITEM level, and one of three at the
 * other two levels. Sites: [model/service/PromotionService.cfc:L400-L405]
 * (fulfillment), [model/service/PromotionService.cfc:L446-L451] (order) and
 * [model/service/PromotionService.cfc:L529-L535] (order item).
 */
export interface AddPromotionAppliedIntent extends PromotionAppliedIntentTarget {
  readonly operation: 'add';

  /**
   * REQUIRED on an add: the legacy calls `setDiscountAmount` on every one of the
   * three construction paths (L405, L451, L534), so an add without an amount is
   * not expressible - which is the point of splitting the union rather than
   * weakening this member to optional everywhere.
   */
  readonly discountAmount: Money;
}

/**
 * Raise the discount on the applied-promotion record already on the target,
 * because the same promotion now yields more.
 *
 * CFML parity [model/service/PromotionService.cfc:L389, L435]: the legacy performs this in place with `getAppliedPromotions()[1].setDiscountAmount(discountAmount)` - at the fulfillment level (L389) and the order level (L435) - having first checked that the existing discount is smaller (L385, L431) and that the promotion is the SAME one (L388, L434).
 * There is no order-item counterpart; see the ADD-ONLY note on `PromotionAppliedIntent` below.
 */
export interface UpdatePromotionAppliedIntent extends PromotionAppliedIntentTarget {
  readonly operation: 'update';

  /** REQUIRED on an update: raising the discount is the entire operation. */
  readonly discountAmount: Money;
}

/**
 * Detach the applied-promotion record already on the target, because a DIFFERENT
 * promotion now yields more and will be added in its place.
 *
 * CFML parity [model/service/PromotionService.cfc:L393, L439]: `getAppliedPromotions()[1].removeOrderFulfillment()` at the fulfillment level and `.removeOrder()` at the order level; both then set `addNew = true` (L394, L440), so a remove is always followed by an add of the winning promotion in the same pass.
 * There is no order-item counterpart, and no remove at any level is unconditional - each is the else-arm of the same-promotion test at L388 and L434.
 *
 * `discountAmount` IS DELIBERATELY NOT DECLARED on this variant. Detaching a
 * record needs no amount, and omitting the member rather than typing it optional
 * makes the absence structural: narrowing an intent to `'remove'` and then
 * reaching for `discountAmount` is a compile error, which is the guarantee a
 * uniformly optional member could not give.
 */
export interface RemovePromotionAppliedIntent extends PromotionAppliedIntentTarget {
  readonly operation: 'remove';
}

/**
 * One instruction from the promotion engine to whatever owns applied-promotion
 * persistence - the write-side output of
 * `updateOrderAmountsWithPromotions(order: OrderView):
 * Promise<PromotionAppliedIntent[]>`.
 *
 * WHY AN INTENT AND NOT A MUTATION. The legacy method returns `void` and mutates
 * the Order aggregate in place [model/service/PromotionService.cfc:L58-L546]; the
 * Order, OrderItem and OrderFulfillment entities are explicitly out of scope, so
 * the ported engine consumes read-only order views and returns these instructions
 * instead. That inversion is what makes the slice independently deployable, and
 * it is the reason every member above is `readonly`: an intent is immutable
 * output. Only the accumulator has load-bearing mutability, and only in the one
 * member documented there.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L389, L393, L400-L405, L435, L439, L446-L451, L529-L535]: `operation` is the ONE member name in this file with NO legacy antecedent, and it is named here rather than left to inference. Every other member - `promotionRewardID`, `promotion`, `discountAmount`, `appliedType`, `promotionID`, `orderID`, `orderItemID`, `orderFulfillmentID`, `currencyCode` - mirrors a legacy name in verbatim camelCase, and the single documented rename is the accumulator key.
 * There is no legacy field to mirror because the legacy expresses the three operations as three DIFFERENT CFML calls on an ORM entity - `setDiscountAmount`, `removeOrderFulfillment` / `removeOrder`, and `newPromotionApplied` plus its setters - rather than as data. Turning "which mutation" into a discriminant is the whole substance of the anti-corruption inversion, so the discriminant is target-only by necessity, and interface parity is unaffected: it binds public method names, and this is a field on an output value the legacy had no equivalent of.
 *
 * ALL THREE OPERATIONS MUST STAY EXPRESSIBLE, BUT THE THREE LEVELS ARE NOT
 * SYMMETRIC. Verified per level against the source:
 *
 *   | level            | update | remove | add        |
 *   | ---------------- | ------ | ------ | ---------- |
 *   | orderFulfillment | L389   | L393   | L400-L405  |
 *   | order            | L435   | L439   | L446-L451  |
 *   | orderItem        | none   | none   | L529-L535  |
 *
 * CFML parity [model/service/PromotionService.cfc:L529-L535]: THE ORDER-ITEM LEVEL IS ADD-ONLY. That block constructs `this.newPromotionApplied()` and calls exactly four setters - `setAppliedType('orderItem')`, `setPromotion`, `setOrderItem`, `setDiscountAmount` - with no update and no removal anywhere in it.
 * It needs none: the engine cleared every previously applied item promotion up front at [model/service/PromotionService.cfc:L64-L68], and the descending sort already resolved competing discounts to a single winner before this loop runs. So do NOT describe the port as a uniform three-way inversion at all three levels - that is wrong at the item level - and equally do NOT assume add-only everywhere, because dropping update and remove would lose L389, L393, L435 and L439 and change the money at the other two levels.
 *
 * IDENTITY FOR UPDATE AND REMOVE IS `(appliedType, target ID, promotionID)`, and
 * that is a reproduction of a legacy assumption rather than a design choice.
 * There is no `promotionAppliedID` on the read side to address a record by - the
 * order views carry an applied promotion as exactly two members, its
 * `discountAmount` and its `promotion.promotionID` - and the legacy simply
 * indexes `getAppliedPromotions()[1]` at [model/service/PromotionService.cfc:L385-L393]
 * and [model/service/PromotionService.cfc:L427-L439], which is a
 * single-promotion-per-target assumption. Reproduce it; do not generalise it into
 * addressing the nth applied promotion.
 *
 * TODO [issue #1766]: In the future allow for return Items to have negative promotions applied.  This isn't import right now because you can determine how much you would like to refund ordersItems
 *
 * That TODO is carried forward VERBATIM from
 * [model/service/PromotionService.cfc:L543] - its wording, its two source typos
 * ("isn't import" for "isn't important", and "ordersItems"), and the two spaces
 * after its first sentence are reproduced exactly as written, byte for byte. It
 * is NOT silently completed. In the legacy source it is the entire body of the
 * return/exchange branch at [model/service/PromotionService.cfc:L542-L544]: for
 * an `otReturnOrder` or `otExchangeOrder` the engine does nothing at all.
 *
 * These types keep that no-op expressible and meaningful: an EMPTY
 * `PromotionAppliedIntent[]` is a valid result, and for a return or exchange
 * order it is the CORRECT result. No "negative discount" concept is encoded
 * anywhere here - `Money` is not constrained to be positive, but nothing in this
 * contract invites a negative discount into existence, and inventing one would be
 * completing the TODO rather than carrying it. A placeholder regression test
 * named `issue_1766` documents the gap, following the `issue_<ticket#>`
 * convention of [meta/tests/unit/IssuesTest.cfc] (which also carries
 * `_2`-suffixed variants such as `issue_1690_2` at
 * [meta/tests/unit/IssuesTest.cfc:L203]); `1766` appears nowhere under
 * `meta/tests/`, so that test is net-new. Authoring it belongs to the test tier,
 * not to this file.
 *
 * THE MONEY SEMANTICS A CONSUMER OF THESE TYPES MUST GET RIGHT. Documented here
 * because `discountAmount` is where the results land; implemented nowhere in this
 * file.
 *
 *   * THE SURFACE THE ENGINE ACTUALLY NEEDS, and nothing more: `times`
 *     [model/service/PromotionService.cfc:L990, L995, L1001], `dividedBy`
 *     [model/service/PromotionService.cfc:L299, L486, L995], `minus`
 *     [model/service/PromotionService.cfc:L1001, L1006, L1007], `plus`
 *     [model/service/PromotionService.cfc:L417] - the ONLY addition site in the
 *     whole in-scope slice, and a plain `+` with no `precisionEvaluate` around it
 *     - comparison [model/service/PromotionService.cfc:L257, L1013], a zero
 *     constant [model/service/PromotionService.cfc:L988, L989] and `toFixed2`
 *     [model/service/PromotionService.cfc:L1017]. No float arithmetic touches
 *     currency anywhere in the target.
 *   * `toFixed2` IS PRESENTATION, NOT A ROUNDING POLICY. The verified reference
 *     calculation: 19.99 times 3 is 59.97; 12.5 per cent of that is 7.49625; the
 *     discounted total is 52.47375; `toFixed2` renders "52.47". The full
 *     precision survives the arithmetic and is narrowed only at the edge, which
 *     is what `numberFormat(discountAmount, "0.00")` at
 *     [model/service/PromotionService.cfc:L1017] does.
 *   * THE ROUNDING RULE SHAPES THE FINAL PRICE, AND THE DISCOUNT IS DERIVED BACK
 *     OUT OF IT. [model/service/PromotionService.cfc:L1006] hands
 *     `originalAmount - discountAmountPreRounding` - what the customer would PAY -
 *     to `roundValueByRoundingRule`, and L1007 then computes
 *     `originalAmount - roundedFinalAmount`. The rule never rounds the discount
 *     directly. Getting this backwards changes money.
 *   * TWO DEFAULTLESS SWITCHES WITH OPPOSITE FALL-THROUGH VALUES, both of which
 *     must remain distinctly expressible. The `amountType` switch at
 *     [model/service/PromotionService.cfc:L993-L1003] has no `default:` case, so
 *     an unrecognised amount type leaves the L988 seed of zero and yields no
 *     discount; the switch at [model/service/PriceGroupService.cfc:L321-L336] is
 *     also defaultless but its seed at
 *     [model/service/PriceGroupService.cfc:L319] is `arguments.sku.getPrice()`,
 *     so an unrecognised type there yields the UNDISCOUNTED price. Neither is
 *     implemented here.
 *
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L319, L321-L336]: the price-group contrast above is published as the range L300-L340, which is a SUPERSET - it opens on a comment 16 lines before the function that holds the switch, and spans the whole of the preceding `calculateSkuPriceBasedOnPriceGroup` (L301-L313).
 * Cited precisely here instead, because a reviewer following the published range lands in the wrong function: `calculateSkuPriceBasedOnPriceGroupRate` begins at L316, its passthrough seed is L319, its defaultless switch runs L321-L336, and its presentation step is L339.
 *   * DEFECTS 12, 13 AND 14 ARE OWNED BY `src/services`, NOT CLAIMED HERE - the
 *     `amountOff` branch's raw-float multiplication
 *     [model/service/PromotionService.cfc:L998], the un-`var`'d `discountAmount`
 *     that leaks into component scope
 *     [model/service/PromotionService.cfc:L1007, L1009], and the clamp that
 *     compares the pre-rounding value but overwrites the post-rounding one
 *     [model/service/PromotionService.cfc:L1013-L1015]. They are named as context
 *     so a reader of these types knows where the arithmetic's known hazards live;
 *     this file reproduces none of them and diverges from none of them.
 */
export type PromotionAppliedIntent =
  AddPromotionAppliedIntent | UpdatePromotionAppliedIntent | RemovePromotionAppliedIntent;
