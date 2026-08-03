// ---------------------------------------------------------------------------
// WHO CONSUMES THESE TYPES, AND THE ONE CONSUMER THAT IS STILL ABSENT
//
// Every module named in the commentary below is present in the subtree today and
// can be opened while reading this file - the six decomposition modules under
// `src/services/promotion/` that build and drain the accumulator
// (`salePriceSeeding`, `discountAmount`, `rewardUsageLedger`, `overUseStripping`,
// `promotionApplication`, `twoPassRewardIterator`) and the two sibling type
// modules `rewardUsageTypes.ts` and `qualificationTypes.ts`, which this file
// deliberately does not import.
//
// ONE NAMED CONSUMER IS STILL ABSENT: `src/services/promotionService.ts`, the
// facade that would return the intents this module types, is an AAP target the
// subtree does not yet contain. Nothing below depends on it - this module's only
// imports are two shipped siblings - so no declaration here asserts a capability
// that does not run.
//
// An earlier revision of this header listed all nine modules as forward
// references that "DO NOT EXIST YET". Eight of the nine had already shipped when
// it was written, and the claim is corrected rather than carried, because a
// header that misreports the folder it sits in is worse than no header.
// ---------------------------------------------------------------------------

/**
 * The qualified-discount accumulator and the promotion engine's write-side output contract. Two
 * type contracts and nothing else:
 *
 *   1. `QualifiedDiscount` / `OrderItemQualifiedDiscounts` - the internal, MUTABLE accumulator
 *      `updateOrderAmountsWithPromotions` builds while deciding which discount wins on each order
 *      item, from [model/service/PromotionService.cfc:L82-L133]; the legacy key typo
 *      `orderItemQulifiedDiscounts` is renamed here with its original spelling recorded below.
 *   2. `PromotionAppliedType` / `PromotionAppliedIntent` - the engine's write-side OUTPUT, the
 *      anti-corruption replacement for mutating an Order aggregate that stays in CFML. This is what
 *      makes the ported signature `updateOrderAmountsWithPromotions(order: OrderView):
 *      Promise<PromotionAppliedIntent[]>` possible.
 *
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58-L546] is 489 lines in
 * one function and is order-dependent in six independent ways, each of which can change the money a
 * customer is charged:
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
 * Every declaration below is an `interface` or a `type` alias, and both
 * imports are `import type`. There is no class, no function, no `const`, no
 * `enum` and no default export, so `tsc` erases the whole module and nothing
 * from it reaches the Lambda bundle. That is a contract, not an accident: the
 * accumulator's arithmetic belongs to `src/services/promotion/**` and
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
 *      `rewardUsageTypes.ts`, not here.
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
 *      [model/service/PriceGroupService.cfc:L364] must run FIRST; in the legacy that held only
 *      because `OrderService` called them in that sequence, so the consumer must order them
 *      explicitly.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: this range is the illustrative BLOCK
 * COMMENT, and the misspelled key appears inside it at L121. The LIVE declaration is L142,
 * populated at L152, L155 and L262. The docblock is the authority for the intended shape and the
 * executing lines for the actual one, and they disagree - see the two phantom keys below.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L252]: the arithmetic that corrects a price-group
 * discount is on L252, not L248 - L248 is a comment and L249 is the `getDiscountAmount` call.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L472, L475, L476, L477]: the leaked-variable
 * defect spans all four lines, each indexing the ledger by the stale `reward` rather than the loop
 * key `prID`. A consumer reproducing only L472 would still normalise three sites and change the
 * money.
 */
import type { Promotion } from '../entities/promotion.js';
import type { Money } from '../valueObjects/money.js';

/**
 * One potential discount on one order item, as the engine accumulates it.
 *
 * Exactly three members: both construction sites build the same three keys and no others - the
 * ordered insert at [model/service/PromotionService.cfc:L274-L278] and the append fallback at
 * L288-L292 - and so does the sale-price seed at L155-L159. See the two phantom docblock keys on
 * `discountAmount` below.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: the legacy accumulator this record
 * lives in is spelled `orderItemQulifiedDiscounts`, missing the `a` in "Qualified"; the target uses
 * the corrected spelling. The rename is permitted precisely because the key never crosses a
 * boundary - all 20 source lines that mention it (L121, L142, L152, L155, L259, L260, L262, L269,
 * L271, L274, L288, L482, L483, L486, L498, L499, L502, L529, L532, L534) are local-variable
 * references inside one CFML function, so it is never a column, a JSON key, a URL parameter or a
 * transported name, and interface parity binds public method names rather than function-local
 * state. By contrast the legacy identifiers that ARE genuine contracts are preserved verbatim
 * wherever they surface: `promotionPeriod.promtionRewards`, `getSalePricExpirationDateTime`,
 * `singlularname`, `subsciptionUsageBenefit`. None appears in this file; they are named so the
 * asymmetry between "renamed with a comment" and "preserved with a comment" reads as a decision.
 */
export interface QualifiedDiscount {
  /**
   * The reward that produced this discount, or the empty string for a sale price.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L155-L159]: the sale-price seed appends a
   * record whose `promotionRewardID` is the EMPTY STRING (L156), because a sale price comes from a
   * promotion but from no reward; the same `'' / 0` seeding idiom recurs on the shipping surface at
   * L1033-L1036. The consequence is monetary and must survive the port: over-use stripping matches
   * records with `.promotionRewardID == prID` at L483 and L499, and `prID` is always a real reward
   * ID, so a `''` record can never match and sale-price discounts are structurally IMMUNE to
   * use-limit stripping.
   *
   * Typed as a plain `string` that admits `''` - not branded, not optional, not
   *   `string | undefined`.
   * The sentinel is a value the engine writes and compares, so erasing it into an absence would
   * erase the immunity with it.
   */
  readonly promotionRewardID: string;

  /**
   * The promotion this discount belongs to - the ENTITY, not an identifier.
   *
   * Read back at [model/service/PromotionService.cfc:L532] to populate the applied-promotion
   * record. It arrives from two places: `getPromotion(salePriceDetails.promotionID)` on the
   * sale-price path (L157) and `reward.getPromotionPeriod().getPromotion()` on the reward paths
   * (L276, L290). `readonly`: no line rewrites it.
   */
  readonly promotion: Promotion;

  /**
   * The discount amount. `Money`, never `number`, and MUTABLE. CFML parity
   * [model/service/PromotionService.cfc:L486]: the mutability is load-bearing and must not be
   * tightened to `readonly`. The partial-strip branch of over-use stripping rewrites this member in
   * place, scaling the discount down to the fraction of the quantity that survives the use limit. A
   * `readonly` here would make that branch inexpressible, and a consumer forced to rebuild the
   * record would have to re-derive `promotionRewardID` and `promotion`. It is the only mutable
   * member in this file. LEGACY-DEFECT [model/service/PromotionService.cfc:L472, L475, L476, L477]:
   * the loop that decides how much to strip iterates `for(var prID in promotionRewardUsageDetails)`
   * but reads `maximumUsePerOrder`, `orderItemsUsage`, `orderItemID` and `discountQuantity` from
   * `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]` - the `reward` variable left
   * over from the preceding reward loop - so maximum-use-per-order is enforced against whichever
   * reward happened to be last, for every key in the ledger.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * This type keeps the defect expressible: the stripping module selects records by `prID` at L483
   * and L499 while sizing the strip from the leaked reward, and nothing here couples the two.
   * LEGACY-NOTE [model/service/PromotionService.cfc:L486]: this rewrite divides by
   * `thisDiscountQuantity` with NO zero check - a second unguarded division, where only the
   * `discountAmount / discountQuantity` at L299 is registered. Both route through
   * `Money.dividedBy`, letting the substrate's zero-divisor error propagate; a guard, a `0`
   * fallback or a `NaN` return would invent money out of an arithmetic fault. Whether to guard is a
   * decision for `src/services/promotion/overUseStripping.ts`. There is no zero default, on schema
   * authority: [model/entity/PromotionApplied.cfc:L53] declares
   *   `discountAmount ormtype="big_decimal"`
   * with NO default - one of exactly four no-default money columns in the slice, with
   * `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
   * [model/entity/PriceGroupRate.cfc:L54] and `PromotionReward.amount`
   * [model/entity/PromotionReward.cfc:L61]. Absence is not zero, so this member is REQUIRED and
   * `Money.zero` is never a substitute for an absent amount. The docblock promises five members
   * while the executing code builds three; both extra keys are documented here and neither is
   * materialised. LEGACY-DEFECT [model/service/PromotionService.cfc:L127]: the docblock documents a
   * `discountQuantity` member on this record, and no line of the executing engine builds or reads
   * one - neither L274-L278, nor L288-L292, nor L155-L159. Preserved deliberately as an annotation
   * rather than as a member; do not fix without a product decision. A same-named member does exist,
   * but on the ledger's `orderItemsUsage` entries (L311, L325) - the docblock conflates the two
   * structures. LEGACY-DEFECT [model/service/PromotionService.cfc:L128]: the docblock likewise
   * documents a `discountPerUseValue` member here, which the executing engine never builds or reads
   * either. Preserved deliberately as an annotation rather than as a member; do not fix without a
   * product decision. It too lives on the ledger's `orderItemsUsage` entries (L312, L326), where it
   * is the sort key of the opposing ascending sort. Omitting the phantoms rather than typing them
   * optional is what `exactOptionalPropertyTypes` makes meaningful: absent and
   * present-but-undefined are different states, and these are absent.
   */
  discountAmount: Money;
}

/**
 * The accumulator itself: every potential discount on every order item, keyed by order item.
 *
 * The corrected spelling of the legacy `orderItemQulifiedDiscounts` key is
 * `orderItemQualifiedDiscounts`, published here in type position as `OrderItemQualifiedDiscounts`;
 * consumers use the camelCase form for variables and fields. The rename ruling and its evidence are
 * on `QualifiedDiscount` above.
 *
 * The key is an opaque `orderItemID` [model/service/PromotionService.cfc:L152, L260, L262, L269,
 * L529], never branded, never parsed and never resolved back to an OrderItem.
 *
 * Mutable in four distinct modes, which is why neither the record nor its arrays is `readonly`:
 *
 *   1. UNCONDITIONAL ASSIGNMENT in the sale-price pass
 *      [model/service/PromotionService.cfc:L152].
 *   2. GUARDED LAZY INIT in the main reward pass
 *      [model/service/PromotionService.cfc:L260-L263].
 *   3. INSERT or APPEND of a `QualifiedDiscount`
 *      [model/service/PromotionService.cfc:L274-L278, L288-L292].
 *   4. REMOVAL of a whole record via `arrayDeleteAt`
 *      [model/service/PromotionService.cfc:L502].
 *
 * CFML parity [model/service/PromotionService.cfc:L152, L260-L263]: the assign-versus-lazy-init
 * asymmetry between modes 1 and 2 is reproduced as written. It is load-bearing in one direction -
 * because L152 assigns unconditionally, a second sale-price seed for the same order item would
 * DISCARD an accumulated bucket where L260-L263 would preserve it. The sale-price pass runs once
 * per item before any reward pass, so the discard does not fire today, but the two idioms are not
 * interchangeable.
 *
 * An array can legitimately be empty, so it is not typed non-empty: mode 1 creates one empty and
 * mode 4 can empty a populated one. That is why the apply loop guards twice at
 * [model/service/PromotionService.cfc:L529], the second test being `arrayLen`-as-boolean.
 *
 * Sorted DESCENDING by `discountAmount`, by hand, on insert:
 * [model/service/PromotionService.cfc:L269-L283] inserts before the first smaller entry and breaks
 * at L281, and L285-L294 appends when none was found.
 *
 * CFML parity [model/service/PromotionService.cfc:L271]: the comparison is strictly `<`, so on an
 * exact tie the incumbent keeps its earlier position - first-in wins. A `<=` would reverse tie
 * handling, and because only index [1] is ever applied, a reversed tie at the head changes which
 * promotion the customer receives.
 *
 * CFML parity [model/service/PromotionService.cfc:L269-L294, L304-L329]: the two sorts run in
 * OPPOSITE directions and both are load-bearing - never unify them. This array is descending by
 * `discountAmount` so the largest discount per item wins; the ledger's `orderItemsUsage` is
 * ascending by `discountPerUseValue` (L306, tie-break also strict) so the cheapest-per-use
 * discounts are stripped first. They answer different questions and a shared comparator would
 * change the money.
 *
 * ONLY INDEX [1] IS EVER APPLIED - `[1].promotion` [model/service/PromotionService.cfc:L532] and
 * `[1].discountAmount` [L534]; every other qualified discount is computed, sorted, possibly
 * stripped, then discarded. That is element `[0]` in TypeScript, typed
 *   `QualifiedDiscount | undefined`
 * under `noUncheckedIndexedAccess`, so the consumer narrows rather than asserts - the legacy double
 * guard at L529 maps exactly onto that. Do not generalise the single-winner assumption.
 *
 * CFML parity [model/service/PromotionService.cfc:L482, L498]: both stripping search loops iterate
 * this array BACKWARDS, from the worst discount toward the best, so the first match found is the
 * last matching record. Do not normalise the direction: it selects a different record when one
 * reward contributed twice to an item, and it is what makes the `arrayDeleteAt` at L502 safe.
 */
export type OrderItemQualifiedDiscounts = Record<string, QualifiedDiscount[]>;

/**
 * Which level of the order a promotion was applied to.
 *
 * Exactly three literals, the only three the engine ever writes: `'orderFulfillment'`
 * [model/service/PromotionService.cfc:L402], `'order'` [L448] and `'orderItem'` [L531] - the only
 * three `setAppliedType` calls in the component. The persisted column is
 *   `appliedType ormtype="string"`
 * [model/entity/PromotionApplied.cfc:L54] with no database-side constraint, so the union is the
 * target's constraint.
 *
 * JUDGMENT CALL: declared inline rather than imported from `promotionApplied.ts`, because an intent
 * is the engine's write-side instruction rather than the ORM entity, and importing the entity
 * module would breach the boundary that keeps this folder's three modules mutually independent. The
 * duplication is harmless - `promotionApplied.ts` exports the same three literals in the same
 * order, and structurally identical literal unions are the same type.
 */
export type PromotionAppliedType = 'order' | 'orderItem' | 'orderFulfillment';

/**
 * The one member every applied-promotion intent carries, whatever its target
 * level and whatever its operation.
 *
 * Deliberately NOT exported: consumers work with `PromotionAppliedIntent` and the
 * three operation unions below, and the project keeps its exported surface to
 * exactly what a consumer needs. This interface exists only so the promotion
 * identifier is declared once and cannot drift between the seven variants.
 */
interface PromotionAppliedIntentPromotion {
  /**
   * The promotion being applied, as an OPAQUE identifier.
   *
   * JUDGMENT CALL: the legacy calls `setPromotion(entity)` with a live Promotion
   * [model/service/PromotionService.cfc:L403, L449, L532], but a write-side instruction crossing
   * into the repository layer must not carry a live domain entity - it would drag an object graph,
   * and lazy-load expectations with it, across the boundary whose purpose is to end them. The
   * intent carries `promotion.getPromotionID()` and the repository re-materialises the association,
   * which is all the legacy write path does with the entity: establish the foreign key at
   * [model/entity/PromotionApplied.cfc:L58]. The accumulator above still holds the ENTITY, because
   * the engine reads more than an ID from it while deciding.
   */
  readonly promotionID: string;
}

// ---------------------------------------------------------------------------
// THE THREE TARGET SHAPES
//
// Each pairs one `appliedType` literal with the ONE opaque identifier that
// names a target at that level, and forbids the other two identifiers
// outright by typing them `?: never`.
//
// WHY `?: never` AND NOT MERELY OPTIONAL. With `exactOptionalPropertyTypes`
// enabled, `orderItemID?: never` means "this key may be absent, and cannot be
// present" - not even as an explicit `undefined`. Declaring the inapplicable
// identifiers this way, rather than leaving all three optional on one shared
// interface, is what makes the three malformed intents the reviewer named
// UNREPRESENTABLE instead of merely discouraged:
//
//   * NO TARGET - `{ appliedType: 'order', operation: 'add', promotionID,
//     discountAmount }` no longer compiles, because `orderID` is required on the
//     `'order'` shape.
//   * WRONG TARGET - `{ appliedType: 'order', orderItemID, ... }` no longer
//     compiles, because the `'order'` shape both requires `orderID` and forbids
//     `orderItemID`.
//   * MULTIPLE TARGETS - `{ appliedType: 'order', orderID, orderFulfillmentID,
//     ... }` no longer compiles, for the same reason.
//
// That matters because the repository consuming these intents resolves the row
// it writes FROM the identifier: an intent that named no target, or named the
// wrong one, would previously have type-checked and then written a
// `SwPromotionApplied` row attached to nothing - or to the wrong thing - which
// changes what a customer is charged. `appliedType` and the identifier are one
// fact about one target, so they are declared as one shape.
//
// The identifiers stay OPAQUE strings. Order, OrderItem and OrderFulfillment are
// out-of-scope entity types; the engine names a target and never mutates order
// persistence, which is the whole substance of the anti-corruption inversion.
//
// None of the three is exported. They exist to be intersected with the three
// operation shapes below, and a consumer that needs to name a single variant
// names it through the operation union that contains it.
// ---------------------------------------------------------------------------

/**
 * The ORDER level: `appliedType: 'order'`, addressed by `orderID`.
 *
 * CFML parity [model/service/PromotionService.cfc:L448, L450]: `setAppliedType('order')`
 * is immediately followed by `setOrder( arguments.order )`, so the literal and the
 * target arrive together and neither is meaningful without the other.
 */
interface OrderTargetedIntent {
  readonly appliedType: 'order';

  /** The order this intent addresses. Required at this level. */
  readonly orderID: string;

  readonly orderItemID?: never;
  readonly orderFulfillmentID?: never;
}

/**
 * The ORDER-ITEM level: `appliedType: 'orderItem'`, addressed by `orderItemID`.
 *
 * CFML parity [model/service/PromotionService.cfc:L531, L533]: `setAppliedType('orderItem')`
 * is paired with `setOrderItem( orderItem )` in the same construction block.
 */
interface OrderItemTargetedIntent {
  readonly appliedType: 'orderItem';

  /** The order item this intent addresses. Required at this level. */
  readonly orderItemID: string;

  readonly orderID?: never;
  readonly orderFulfillmentID?: never;
}

/**
 * The FULFILLMENT level: `appliedType: 'orderFulfillment'`, addressed by
 * `orderFulfillmentID`.
 *
 * CFML parity [model/service/PromotionService.cfc:L402, L404]: `setAppliedType('orderFulfillment')`
 * is paired with `setOrderFulfillment( orderFulfillment )`.
 */
interface OrderFulfillmentTargetedIntent {
  readonly appliedType: 'orderFulfillment';

  /** The fulfillment this intent addresses. Required at this level. */
  readonly orderFulfillmentID: string;

  readonly orderID?: never;
  readonly orderItemID?: never;
}

// ---------------------------------------------------------------------------
// THE THREE OPERATION SHAPES
//
// Each carries the `operation` discriminant and settles whether an amount is
// part of the instruction. `Money` is required on `'add'` and `'update'` and
// FORBIDDEN on `'remove'`, so the amount's presence is a consequence of the
// operation rather than an independent decision a consumer could get wrong.
//
// `currencyCode` IS DECLARED NOWHERE ON THE INTENT SURFACE, AT ANY LEVEL OR ANY
// OPERATION.
//
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L55]: `currencyCode ormtype="string" length="3"` is a real persisted column, yet `setCurrencyCode` has ZERO occurrences in the whole of model/service/PromotionService.cfc (verified by census), so every row the promotion engine writes leaves it null.
// A member the writer never populates is not part of the writer's contract, and
// exposing it invited exactly one kind of mistake: a consumer synthesising a
// currency to make the row "look complete", which would write a value the legacy
// engine never chose. Removing the member makes that unrepresentable rather than
// merely discouraged. Nothing is lost: the column still exists on the entity
// [src/domain/entities/promotionApplied.ts] and is still writable by whoever
// legitimately owns it, and the discount is denominated by whatever `Money` the
// engine already computed. Do not reintroduce the member here.
// ---------------------------------------------------------------------------

/**
 * Create a new applied-promotion record. The engine's only operation at the ORDER-ITEM level, and
 * one of three at the other two: [model/service/PromotionService.cfc:L400-L405] (fulfillment),
 * L446-L451 (order), L529-L535 (order item).
 */
interface AddOperationIntent {
  readonly operation: 'add';

  /**
   * REQUIRED on an add: the legacy calls `setDiscountAmount` on all three construction paths (L405,
   * L451, L534), so an add without an amount is not expressible - which is why the union is split
   * rather than this member weakened to optional everywhere.
   */
  readonly discountAmount: Money;
}

/**
 * Raise the discount on the applied-promotion record already on the target, because the same
 * promotion now yields more.
 *
 * CFML parity [model/service/PromotionService.cfc:L389, L435]: the legacy does this in place via
 * `getAppliedPromotions()[1].setDiscountAmount(...)`, having first checked that the existing
 * discount is smaller (L385, L431) and that the promotion is the SAME one (L388, L434). There is no
 * order-item counterpart.
 */
interface UpdateOperationIntent {
  readonly operation: 'update';

  /** REQUIRED on an update: raising the discount is the entire operation. */
  readonly discountAmount: Money;
}

/**
 * Detach the applied-promotion record already on the target, because a DIFFERENT promotion now
 * yields more and will be added in its place.
 *
 * CFML parity [model/service/PromotionService.cfc:L393, L439]: `removeOrderFulfillment()` at the
 * fulfillment level and `removeOrder()` at the order level, both followed by `addNew = true` (L394,
 * L440), so a remove is always followed by an add in the same pass. There is no order-item
 * counterpart, and no remove is unconditional - each is the else-arm of the same-promotion test at
 * L388 and L434.
 *
 * `discountAmount` IS FORBIDDEN on this operation, declared `?: never` rather
 * than simply left out. Detaching a record needs no amount, and the `never`
 * typing means a remove intent carrying one does not compile at all - narrowing
 * to `'remove'` and then supplying or reading an amount is a compile error, which
 * is the guarantee a uniformly optional member could not give. The member is
 * named rather than absent so that the forbidding is visible in the type and a
 * consumer spreading a wider object into a remove is caught.
 */
interface RemoveOperationIntent {
  readonly operation: 'remove';

  readonly discountAmount?: never;
}

/**
 * Create a new applied-promotion record at one of the three levels.
 *
 * THREE exact variants, one per level. Each requires its own opaque identifier,
 * forbids the other two, and requires `Money`.
 */
export type AddPromotionAppliedIntent = PromotionAppliedIntentPromotion &
  AddOperationIntent &
  (OrderTargetedIntent | OrderItemTargetedIntent | OrderFulfillmentTargetedIntent);

/**
 * Raise the discount on an existing applied-promotion record.
 *
 * TWO exact variants - order and fulfillment. There is deliberately no
 * order-item variant: the item level is add-only
 * [model/service/PromotionService.cfc:L529-L535], so
 * `{ appliedType: 'orderItem', operation: 'update', ... }` does not compile, and
 * that is the type carrying the asymmetry rather than a comment asking a
 * consumer to remember it.
 */
export type UpdatePromotionAppliedIntent = PromotionAppliedIntentPromotion &
  UpdateOperationIntent &
  (OrderTargetedIntent | OrderFulfillmentTargetedIntent);

/**
 * Detach an existing applied-promotion record.
 *
 * TWO exact variants - order and fulfillment - for the same reason `update` has
 * two, and carrying no amount at any of them.
 */
export type RemovePromotionAppliedIntent = PromotionAppliedIntentPromotion &
  RemoveOperationIntent &
  (OrderTargetedIntent | OrderFulfillmentTargetedIntent);

/**
 * One instruction from the promotion engine to whatever owns applied-promotion
 * persistence - the write-side output of
 * `updateOrderAmountsWithPromotions(order: OrderView):
 * Promise<PromotionAppliedIntent[]>`.
 *
 * The legacy method returns `void` and mutates the Order aggregate in place
 * [model/service/PromotionService.cfc:L58-L546]; Order, OrderItem and OrderFulfillment are out of
 * scope, so the ported engine consumes read-only views and returns instructions instead. That
 * inversion is what makes the slice independently deployable, and it is why every member is
 * `readonly` - an intent is immutable output.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L389, L393, L400-L405, L435, L439, L446-L451, L529-L535]: `operation` is the ONE member name in this file with NO legacy antecedent, and it is named here rather than left to inference. Every other member - `promotionRewardID`, `promotion`, `discountAmount`, `appliedType`, `promotionID`, `orderID`, `orderItemID`, `orderFulfillmentID` - mirrors a legacy name in verbatim camelCase, and the single documented rename is the accumulator key.
 * There is no legacy field to mirror because the legacy expresses the three operations as three DIFFERENT CFML calls on an ORM entity - `setDiscountAmount`, `removeOrderFulfillment` / `removeOrder`, and `newPromotionApplied` plus its setters - rather than as data. Turning "which mutation" into a discriminant is the whole substance of the anti-corruption inversion, so the discriminant is target-only by necessity, and interface parity is unaffected: it binds public method names, and this is a field on an output value the legacy had no equivalent of.
 *
 * All three operations must stay expressible, but the three levels are NOT symmetric:
 *
 *   | level            | update | remove | add        |
 *   | ---------------- | ------ | ------ | ---------- |
 *   | orderFulfillment | L389   | L393   | L400-L405  |
 *   | order            | L435   | L439   | L446-L451  |
 *   | orderItem        | none   | none   | L529-L535  |
 *
 * THE UNION HAS EXACTLY SEVEN VARIANTS, WHICH ARE EXACTLY THE SEVEN CELLS ABOVE
 * THAT ARE NOT `none`: three adds, two updates and two removes. That count is not
 * a documentation claim a reader has to trust - it is what the type
 * ALGEBRAICALLY IS, because each operation shape is intersected only with the
 * target shapes its level table row permits. The two `none` cells are therefore
 * uninhabited: `{ appliedType: 'orderItem', operation: 'update' }` and
 * `{ appliedType: 'orderItem', operation: 'remove' }` do not compile.
 *
 * CFML parity [model/service/PromotionService.cfc:L529-L535]: the order-item level is ADD-ONLY -
 * that block constructs a new applied promotion and calls four setters, with no update and no
 * removal. It needs none: the engine cleared every previously applied item promotion up front at
 * L64-L68, and the descending sort already resolved competing discounts to one winner. So do not
 * describe the port as a uniform three-way inversion, and equally do not assume add-only
 * everywhere; dropping update and remove would lose L389, L393, L435 and L439 and change the money
 * at the other two levels.
 *
 * HOW A CONSUMER READS AN INTENT. Narrowing works on either discriminant, and on
 * both together. `switch (intent.operation)` selects the operation and, with it,
 * whether `discountAmount` is available; `switch (intent.appliedType)` selects the
 * level and, with it, WHICH identifier is a `string` rather than absent. Reading
 * `intent.orderID` off the un-narrowed union still type-checks and still yields
 * `string | undefined`, so a repository may branch on presence exactly as before -
 * what changed is that the malformed combinations can no longer reach it. No `!`
 * and no `as` is needed anywhere in that reading, which matters because
 * `@typescript-eslint/no-non-null-assertion` is an error across `src/**`.
 *
 * Identity for update and remove is `(appliedType, target ID, promotionID)`, reproducing a legacy
 * assumption rather than choosing one: there is no `promotionAppliedID` on the read side, and the
 * legacy simply indexes `getAppliedPromotions()[1]` [model/service/PromotionService.cfc:L385-L393,
 * L427-L439]. Do not generalise it into addressing the nth applied promotion.
 *
 * TODO [issue #1766]: In the future allow for return Items to have negative promotions applied.  This isn't import right now because you can determine how much you would like to refund ordersItems
 *
 * That TODO is carried forward verbatim from [model/service/PromotionService.cfc:L543] - wording,
 * both source typos and the two spaces after the first sentence - and is NOT silently completed. In
 * the legacy source it is the entire body of the return/exchange branch at L542-L544: for an
 * `otReturnOrder` or `otExchangeOrder` the engine does nothing. These types keep that no-op
 * expressible: an EMPTY intent array is a valid result and, for a return or exchange order, the
 * correct one. No negative-discount concept is encoded here; inventing one would complete the TODO
 * rather than carry it. The gap is tracked by a regression test named `issue_1766`, following the
 * `issue_<ticket#>` convention of [meta/tests/unit/IssuesTest.cfc].
 */
export type PromotionAppliedIntent =
  AddPromotionAppliedIntent | UpdatePromotionAppliedIntent | RemovePromotionAppliedIntent;
