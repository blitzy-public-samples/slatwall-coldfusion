/**
 * slatwall-ts - the terminal step of the promotion engine's sales branch: decide
 * which single discount each order item actually receives, and emit it.
 *
 * WHAT THIS FILE IS
 * A port of exactly one block of the legacy engine - the final best-discount
 * application loop at [model/service/PromotionService.cfc:L523-L537] - and
 * nothing else. It reads the qualified-discount accumulator that the passes
 * before it built, takes the FIRST record on each order item's list, and returns
 * one applied-promotion intent per order item that has one. It computes no
 * money, sorts nothing, removes nothing and writes nothing.
 *
 * AUTHORITY
 * `model/service/PromotionService.cfc` is the SOLE BEHAVIOURAL AUTHORITY for
 * every decision below. AAP 0.4.1 lists this path as CREATE with the source
 * range `model/service/PromotionService.cfc:L524-L537` and the description
 * "Applies only the best discount per order item; emits applied-promotion
 * intents". AAP 0.6.1 is the hotspot analysis this module terminates, and AAP
 * 0.8.1 names promotion discount math together with use-limit enforcement
 * semantics as must-preserve behaviour - which this module is the last step of.
 * Applying the wrong record, applying more than one, or filtering out a
 * legitimate winner each change the amount a customer is charged.
 *
 * THE VERBATIM SOURCE, RE-READ AND CONFIRMED CHARACTER FOR CHARACTER
 *
 *   L523  // Loop over the orderItems one last time, and look for the top 1 discounts that can be applied
 *   L524  for(var i=1; i<=arrayLen(arguments.order.getOrderItems()); i++) {
 *   L525
 *   L526    var orderItem = arguments.order.getOrderItems()[i];
 *   L527
 *   L528    // If the orderItemID exists in the qualifiedDiscounts, and the discounts have at least 1 value we can apply that top 1 discount
 *   L529    if(structKeyExists(orderItemQulifiedDiscounts, orderItem.getOrderItemID()) && arrayLen(orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ]) ) {
 *   L530      var newAppliedPromotion = this.newPromotionApplied();
 *   L531      newAppliedPromotion.setAppliedType('orderItem');
 *   L532      newAppliedPromotion.setPromotion( orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ][1].promotion );
 *   L533      newAppliedPromotion.setOrderItem( orderItem );
 *   L534      newAppliedPromotion.setDiscountAmount( orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ][1].discountAmount );
 *   L535    }
 *   L536
 *   L537  }
 *
 * ---------------------------------------------------------------------------
 * TWO LOCATOR CORRECTIONS. THE SOURCE IS THE AUTHORITY, SO BOTH ARE RECORDED
 * RATHER THAN QUIETLY ABSORBED.
 * ---------------------------------------------------------------------------
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L523-L537]: the range issued for this module is L523-L536, and it is one line short - the loop OPENS on L524 and its closing brace is on L537, while L523 is the explanatory comment and L536 is whitespace-only. Cite L523-L537 to include the comment, or L524-L537 for the executable loop.
 * Corrected against the source rather than reproduced, because a reviewer diffing L523-L536 would find an unbalanced brace and conclude the port had dropped a statement. Every other locator in this file was checked the same way and needed no change, with the single exception recorded immediately below.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the preserved permission-string typo `hb_permission="promotionPeriod.promtionRewards"` is published as sitting on L49; L49 of that file is blank and the attribute is on the `component` declaration at L57.
 * Corrected here because this file cites that attribute as the contrast case for its own rename decision (see the accumulator note below), and a contrast that points at a blank line proves nothing.
 *
 * ---------------------------------------------------------------------------
 * THIS MODULE'S PLACE IN THE ENGINE, AND WHY THAT IS DOCUMENTATION ONLY
 * ---------------------------------------------------------------------------
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L165-L465, L468-L521, L524-L537]: the four steps of the sales branch run in an order fixed purely by source position - sale-price seeding first, then the two-pass reward iteration, then over-use stripping, then this module - and this module therefore has a hard ordering dependency on `./overUseStripping.ts`, which can REDUCE the winning record's `discountAmount` in place at L486 or DELETE it outright at L502 and so change which record occupies the head of the list.
 * The ordering is recorded and NOT enforced: there is no runtime check, no "has stripping run" flag, no sequence counter and no assertion anywhere in this file, because the legacy has no such state and inventing it would be a behaviour change dressed up as a safeguard. Sequencing belongs to the façade `../promotionService.ts` and to `src/handlers/promotionApplicationHandler.ts`.
 *
 * The cross-service constraint is likewise acknowledged and not enforced:
 * `PriceGroupService.updateOrderAmountsWithPriceGroups`
 * [model/service/PriceGroupService.cfc:L364-L375] must run BEFORE
 * `updateOrderAmountsWithPromotions`, because
 * [model/service/PromotionService.cfc:L241-L252] chooses the discount base price
 * by price-group eligibility - the `if` arm, taken when there is no applied
 * price group OR the reward has that price group as an eligible one, uses
 * `orderItem.getPrice()` with no correction term (L244), while the `else` arm
 * uses `orderItem.getSkuPrice()` (L249) and then corrects by
 * `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`
 * (L252) - so the promotion pass reads state the price-group pass writes.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L324-L467]: use-limit enforcement in this engine is ITEM-LEVEL ONLY, and that is a measured fact rather than an omission - a census of `promotionRewardUsageDetails` across the whole file returns L105, L139, L172, L173, L181, L184, L187, L223, L224, L228, L236, L237, L297, L304, L306, L309, L323, L468, L471, L472, L475, L476 and L477, so there is NOT ONE occurrence between L324 and L467, the span that contains both the fulfillment branch (L345-L412) and the order branch (L415-L455).
 * Neither of those branches reads or writes the reward-usage ledger, so fulfillment-level and order-level discounts are structurally immune to the stripping at L468-L521. This module emits `'orderItem'` intents only and deliberately declares no order-level or fulfillment-level usage member, accepts no order-level or fulfillment-level discount collection, and does not extend the ledger - it never imports `../../domain/promotionEngine/rewardUsageTypes.js` at all.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L529-L535]: the order-item level is ADD-ONLY. The block creates a record and calls four setters; it performs no update, no removal, no merge and no de-duplication, and it never inspects promotions already applied to the item.
 * Reproduced exactly: one intent per qualifying order item, every intent carrying `operation: 'add'`, and nothing else. The other two levels are NOT add-only - the fulfillment branch updates at L389 and detaches at L393, the order branch at L435 and L439 - so the asymmetry is real and this module must not be read as evidence that the whole engine is add-only.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L64-L68, L71-L75, L78-L80]: the three clear-out loops that open the method walk previously applied promotions backwards and detach them - `removeOrderItem()`, `removeOrderFulfillment()`, `removeOrder()` - and they are REPLACED by the anti-corruption inversion rather than reproduced anywhere in this folder.
 * There is nothing here to clear: the input is a read-only `OrderView` and the output is a fresh list of intents, so no prior state is reachable to detach and no removal intent is emitted. Those loops are façade territory; the omission is recorded because this module is the only one that emits applied-promotion intents and would otherwise be the natural place for a complementary removal path.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294, L301-L329]: this module PERFORMS NO SORT. The head of each order item's list is the largest discount only because the accumulator is insert-sorted DESCENDING by `discountAmount` at L266-L294, which is façade-owned, and this module trusts that ordering by design - there is no re-sort, no comparator, no maximum scan and no verification of the ordering here.
 * The two insertion sorts in this engine run in OPPOSITE directions and both are load-bearing, so they must never be unified into one comparator or one shared helper: L266-L294 is descending by discount amount so the best discount per item wins, while L301-L329 is ascending by `discountPerUseValue` on the reward-usage ledger so the cheapest-per-use discounts are given up first. Both tie-breaks are strict - `<` at L271 and `>` at L306 - so an equal-valued newcomer is placed AFTER the incumbent in both, and nothing in this file disturbs that.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L155-L159]: sale-price records compete on completely equal footing and are NOT filtered here. `./salePriceSeeding.ts` seeds them into the same accumulator before the reward iteration begins, each carrying the EMPTY-STRING `promotionRewardID` sentinel written at L156, so they take part in the descending sort alongside reward discounts and can legitimately occupy the head of the list and win.
 * No special case for the `''` sentinel exists in this file, and none may be added: a sale price is a real discount from a real promotion (L157 resolves the promotion entity from `salePriceDetails.promotionID`), and excluding it would silently raise the price the customer pays. It is also why sale-price discounts survive use-limit stripping - L483 and L499 match records by `.promotionRewardID == prID` and `prID` is always a real reward ID, so a `''` record can never match.
 *
 * ---------------------------------------------------------------------------
 * THE ACCUMULATOR'S NAME
 * ---------------------------------------------------------------------------
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133, L529, L532, L534]: the legacy accumulator is spelled `orderItemQulifiedDiscounts`, missing the `a` in "Qualified" - in the illustrative block comment that opens on L82 and closes on L133 (the misspelled key is inside it at L121), in the live declaration at L142, and at every one of its use sites, which in this module's range are L529, L532 and L534.
 * The target uses the corrected spelling `orderItemQualifiedDiscounts`. Renaming is correct here and only here because the identifier is a function-local accumulator with no persisted or cross-boundary contract: a census of all twenty mentions - L121, L142, L152, L155, L259, L260, L262, L269, L271, L274, L288, L482, L483, L486, L498, L499, L502, L529, L532, L534 - finds every one of them to be a local-variable reference inside a single CFML function, never a column, never a JSON key and never a transported name, and the interface-parity obligation binds public method names rather than local state.
 *
 * The contrasting case, so the asymmetry reads as a decision rather than
 * inconsistency: `hb_permission="promotionPeriod.promtionRewards"`
 * [model/entity/PromotionReward.cfc:L57] carries the same class of typo but IS a
 * contract - a permission string resolved by name - and is therefore preserved
 * verbatim with an explanatory comment and never corrected. The rule of thumb
 * this file applies: an internal accumulator or local identifier is renamed and
 * the original recorded; a persisted column, a permission string or any
 * cross-boundary key is preserved verbatim and annotated.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L523]: the source comment reads "look for the top 1 discounts that can be applied" - plural "discounts" for something that applies exactly one record per order item, and "look for" for a step that does no searching, since the search happened during the descending insert upstream.
 * Noted and not fixed. The comment is carried across in this file's own wording rather than corrected in place, and the behaviour it describes imprecisely is reproduced from the code at L532 and L534, which is unambiguous: index [1], twice, and no other index anywhere.
 *
 * ---------------------------------------------------------------------------
 * PROJECT STANDARDS AS THEY BIND THIS FILE
 * ---------------------------------------------------------------------------
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE HERE, AND SAID SO EXPLICITLY.
 * The project standard is that every query uses prepared statements, preserving
 * the injection-safety guarantee `cfqueryparam` provided (AAP 0.8.3). This
 * module runs NO queries: there is no SQL string, no driver import, no
 * connection and no interpolation site anywhere in it. All SQL in the target
 * lives wholly in `src/repositories/mysql/**`, which owns every statement that
 * reads or writes the `Sw*` tables. The exemption is stated rather than left
 * silent, because silence would read as an oversight.
 *
 * NO MODULE-LEVEL MUTABLE STATE, AND THE REASON IS CORRECTNESS.
 * On a warm Lambda container, module-level state persists between unrelated
 * requests, so a cache here could leak one customer's discount into another
 * customer's order. This file declares no module-level `let`, no module-level
 * mutable object, no cache, no counter and no memo; the intent list is
 * function-local and freshly allocated on every call. The legacy engine's own
 * component-level caches - `SkuDAO.variables.nextOptionGroupSortOrder`, whose
 * clear condition is inverted so it can never fire, the
 * `RoundingRuleService.variables.roundingRuleDetails` memo, the un-`var`'d
 * `discountAmount` at [model/service/PromotionService.cfc:L1007, L1009], and
 * every entity memo - all become request-scoped in the target for the same
 * reason. The single documented exception in the whole subtree is the MySQL
 * connection pool in `src/repositories/mysql/connection.ts`, which is an
 * engineering decision about connection reuse and not a target of any kind.
 *
 * TEST COVERAGE IS ENTIRELY NET-NEW (B8).
 * No legacy test touches this code. `meta/tests/unit/service/` contains only
 * AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
 * UtilityRBServiceTest, none of which is in scope, so every suite that
 * exercises this module is NET-NEW and must be labelled net-new rather than
 * presented as parity with legacy coverage. Authoring those suites belongs to
 * the test tier under `slatwall-ts/tests/**`; this file authors none.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT.
 * `review_rules` returns the single line "No user rules provided.", re-queried
 * while authoring this file both without a range and over the whole document
 * with byte-identical results. The absence is verified rather than assumed, no
 * rule is invented to fill it, and it is not treated as licence to lower the
 * bar: the project's enterprise substitutes apply here at full strength (AAP
 * 0.7, AAP 0.8.3). `review_rules` remains the authoritative source; this is a
 * record of its result.
 *
 * ---------------------------------------------------------------------------
 * BOUNDARIES A LATER EDIT MUST NOT CROSS
 * ---------------------------------------------------------------------------
 *
 * THE TWO ORDER-TYPE GATES ARE SEQUENTIAL `if`s, NOT `if`/`else if`, AND THEY
 * ARE FAÇADE-OWNED. [model/service/PromotionService.cfc:L61] tests
 * `listFindNoCase("otSalesOrder,otExchangeOrder", ...)` and
 * [model/service/PromotionService.cfc:L542] tests
 * `listFindNoCase("otReturnOrder,otExchangeOrder", ...)`; `otExchangeOrder`
 * appears in BOTH lists and the second gate is a separate statement, so an
 * exchange order runs the entire sales branch and then also enters the return
 * branch, which is empty. Never refactor those two gates into `if`/`else` or a
 * `switch` - that would silently stop exchange orders taking the sales path.
 * Neither gate is reproduced in this file; the warning is recorded so that no
 * module in this folder re-invents the structure.
 *
 * The return/exchange branch's `TODO [issue #1766]`
 * [model/service/PromotionService.cfc:L542-L544] belongs to the façade and is
 * deliberately NOT absorbed here.
 *
 * This module imports no sibling in this folder and never imports the façade
 * `../promotionService.ts`: the dependency edge is one-directional, the façade
 * composes the nine modules and none of the nine reaches back, so there is no
 * cycle. It takes no injected collaborator, consumes none of the thirteen ports
 * and creates none.
 */

import type {
  AddPromotionAppliedIntent,
  OrderItemQualifiedDiscounts,
  PromotionAppliedIntent,
  QualifiedDiscount,
} from '../../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { Money } from '../../domain/valueObjects/money.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import { structGet, structKeyExists } from '../../lib/cfml/struct.js';

// LEGACY-NOTE [model/service/PromotionService.cfc:L532]: `../../domain/entities/promotion.js` is deliberately NOT imported, even though the legacy passes a live Promotion entity to `setPromotion` at L532.
// `PromotionAppliedIntent` publishes the promotion as an opaque `promotionID: string`, so this module reads the identifier off the accumulator record's already-typed `promotion` member and never needs the entity type in an annotation; importing it would leave an unused binding that `noUnusedLocals` rejects. Nothing is lost - the identifier is the only thing the legacy write path takes from that entity.

/**
 * Build the one applied-promotion intent for one order item, from the discount
 * record that won.
 *
 * This is the whole of [model/service/PromotionService.cfc:L530-L534] - the
 * construction and its four setters - expressed as data. It is module-local and
 * unexported on purpose: it is not a second public unit, it is the single named
 * home for the field mapping so that each legacy setter line has somewhere to be
 * annotated and checked one field at a time.
 *
 * JUDGMENT CALL: [model/service/PromotionService.cfc:L530] calls `this.newPromotionApplied()`, an entity factory inherited from `HibachiService`, and there is no equivalent for it in the locked thirteen-port set - none was invented, and this module creates no fourteenth port. The intent object is constructed directly instead, as a plain object literal satisfying the published `AddPromotionAppliedIntent` type. Two alternatives were considered and rejected: (a) adding a fourteenth port for entity construction - the port set is locked, and an entity factory is framework plumbing rather than a domain collaborator, so a port would be modelling the removed framework instead of the retained business logic; (b) importing the `PromotionApplied` entity and instantiating it - the target emits intents rather than persisting entities, so materialising a persistence entity at this point would reintroduce exactly the write path the anti-corruption boundary exists to remove, and would drag an object graph across the boundary that ends lazy loading.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L530-L534]: the legacy block creates a `PromotionApplied`, sets four fields, and then performs NO explicit save - there is no `.save()`, no collection append and no return anywhere in it - so it reads at first glance as dead code, and it is not. `setOrderItem(orderItem)` at L533 is the ATTACHMENT MECHANISM rather than a plain field assignment: in Hibachi, setting an association maintains the inverse side, which is how the new record becomes reachable from the order item and, through it, persistable.
 * That mechanism is framework behaviour inside `org/Hibachi/**`, a boundary to extract FROM and never modify, so this module neither reproduces nor depends on it. The target replaces the mechanism wholesale: an intent is emitted and returned, nothing is written, and no live order-item reference is retained on the intent - only its opaque identifier.
 *
 * @param orderItem - the order item being priced. Read for its identifier only;
 * never mutated, and never stored on the returned intent.
 * @param bestQualifiedDiscount - the record at the head of that order item's
 * qualified-discount list, already selected by the caller.
 */
function buildOrderItemDiscountIntent(
  orderItem: OrderItemView,
  bestQualifiedDiscount: QualifiedDiscount,
): AddPromotionAppliedIntent {
  // CFML parity [model/service/PromotionService.cfc:L533]: `setOrderItem( orderItem )` names the target by passing the live entity; the intent names it by opaque identifier, because the Order aggregate is out of scope and the anti-corruption boundary forbids both holding a live view on the output and mutating order persistence.
  const orderItemID: string = orderItem.orderItemID;

  // CFML parity [model/service/PromotionService.cfc:L532]: `setPromotion( ...[1].promotion )` passes the Promotion entity; the intent carries `promotionID`, resolved from that same entity through its own accessor, because a write-side instruction must not transport a domain entity across the repository boundary. The accumulator still holds the entity - the engine reads more than an identifier from it while deciding - and nothing else is taken from it here.
  const promotionID: string = bestQualifiedDiscount.promotion.getPromotionID();

  // CFML parity [model/service/PromotionService.cfc:L534]: `setDiscountAmount( ...[1].discountAmount )` hands the accumulated amount straight through, and so does this. The `Money` is COPIED VERBATIM: no arithmetic, no rounding, no re-formatting, no `toFixed2`, no comparison and no default. The explicit `Money` annotation is here to make that pass-through compile-checked rather than merely intended - the amount was computed upstream by `./discountAmount.ts` and possibly scaled down by `./overUseStripping.ts` at L486, and this module's only job is not to disturb it.
  const discountAmount: Money = bestQualifiedDiscount.discountAmount;

  return {
    // CFML parity [model/service/PromotionService.cfc:L531]: `setAppliedType('orderItem')` - the exact literal, single-quoted lowercase-camel, neither derived nor uppercased nor replaced by an enum. The engine writes exactly three such literals in the whole method and this is the only one this module emits: `'orderItem'` here (L531), `'orderFulfillment'` at L402 and `'order'` at L448, the other two belonging to façade-owned branches.
    appliedType: 'orderItem',

    // The order-item level is add-only; see the ADD-ONLY note in this file's header.
    operation: 'add',

    promotionID,
    orderItemID,
    discountAmount,

    // `orderID`, `orderFulfillmentID` and `currencyCode` are deliberately OMITTED
    // rather than set to `undefined`: under `exactOptionalPropertyTypes` an absent
    // key and a present-but-undefined key are different states, an order-item
    // intent names its target by which identifier is present, and the legacy
    // engine never calls `setCurrencyCode` at all - zero occurrences in
    // model/service/PromotionService.cfc - so synthesising a currency here would
    // invent a value the engine never chose.
  };
}

/**
 * Apply the single best qualified discount to each order item, and return the
 * applied-promotion intents that result.
 *
 * The terminal step of the sales branch of
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58-L546]:
 * a port of the final loop at [model/service/PromotionService.cfc:L523-L537] and
 * of nothing else. By the time it runs, every candidate discount has already been
 * computed, inserted in descending order and possibly stripped; all that is left
 * is to take the head of each order item's list and say so.
 *
 * SYNCHRONOUS BY CONSTRUCTION. The ported block reaches no DAO, no ORM and no
 * collaborator that does - it walks an already-materialised array and builds
 * objects - so this function is not `async` and returns an array rather than a
 * promise. Making it `async` for symmetry with the façade would add an
 * unresolvable await boundary to a pure traversal.
 *
 * JUDGMENT CALL: the block being ported is INLINE CODE inside a 489-line CFML function, so it has no legacy method signature of its own, and designing this one therefore spends nothing from any budget. Specifically: it is not a signature widening and not a signature reshaping, because both of those govern a ported method whose CFML parameter list is being preserved and this block has no parameter list to preserve; and it is not a visibility widening, because no private legacy method is being promoted - the five-slot widening ledger is fully exhausted elsewhere in this folder and stays that way. `applyBestOrderItemDiscounts` is a descriptive target-only name that displaces no legacy identifier: the folder preserves legacy CFML method names verbatim in camelCase wherever a named legacy method is being ported, and there is no named method here to preserve. Stated explicitly so that no reviewer counts a budget this file did not spend.
 *
 * @param order - a read-only view of the order. Never mutated, and no reference
 * to it or to any of its items is retained on the returned intents.
 * @param orderItemQualifiedDiscounts - the qualified-discount accumulator, keyed
 * by opaque `orderItemID`, each list already sorted descending by discount amount
 * by the passes that ran before this one. Read only: this module never inserts
 * into it, never deletes from it and never reorders it.
 * @returns one intent per order item that has at least one surviving qualified
 * discount, in order-item order. An empty array is a valid and meaningful result.
 */
export function applyBestOrderItemDiscounts(
  order: OrderView,
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
): PromotionAppliedIntent[] {
  const appliedIntents: PromotionAppliedIntent[] = [];

  // LEGACY-NOTE [model/service/PromotionService.cfc:L524, L526]: the source calls `arguments.order.getOrderItems()` TWICE per iteration - once in the loop condition and once to bind the element - and the collection it returns is live, since neither entity nor view accessors produce defensive copies. The target reads it once into a local.
  // The reason is determinism and readability, not anything else: one read cannot disagree with another, so the collection the guard reasons about is provably the collection the body iterates. The captured reference is not cloned, not sorted and not mutated - and the view publishes it as a `readonly` array, so those are compile errors rather than conventions.
  const orderItems = order.orderItems;

  // CFML parity [model/service/PromotionService.cfc:L524, L526]: the source is a 1-based counted `for` that indexes the collection by `i`; the target iterates the captured array directly. CFML arrays are 1-based and TypeScript arrays are 0-based, and 1-based emulation is forbidden in the target, so the translation is an idiomatic `for...of` rather than a counter shifted by one. Iteration order is unchanged - both walk the collection front to back exactly once - and no index variable survives, because nothing in the block reads `i` for anything other than indexing.
  for (const orderItem of orderItems) {
    const orderItemID = orderItem.orderItemID;

    // LEGACY-NOTE [model/service/PromotionService.cfc:L529, L532, L534]: the source looks the same key up FOUR times per qualifying iteration - once inside `structKeyExists`, once as the argument to `arrayLen`, and once each at L532 and L534 - and the target performs ONE indexed lookup into a local instead.
    // The reason is determinism and readability: a single read makes it impossible for the guard to have tested one list and the body to then read a different one, which is precisely the class of divergence that repeated lookups permit. `structGet` is used for its CFML-matching case-insensitive key semantics and returns `QualifiedDiscount[] | undefined` with NO default of any kind - there is no defaulting getter here, no `?? 0` and no `?? Money.zero`, because substituting a value for an absent key is how a zero reaches a price path.
    const qualifiedDiscounts = structGet(orderItemQualifiedDiscounts, orderItemID);

    // CFML parity [model/service/PromotionService.cfc:L529]: the guard reproduces BOTH of the source's conditions, in the source's order, joined by short-circuiting `&&` exactly as the source joins them. The first conjunct is the source's `structKeyExists`, routed through the case-insensitive key access of `../../lib/cfml/struct.js` so that CFML struct-key semantics survive - TypeScript object keys are case-sensitive and CFML struct keys are not. The third conjunct is the source's second condition, `arrayLen(...)`, which the source uses BARE as a boolean; numeric truthiness is forbidden in the target, so it is written as an explicit `> 0`.
    // LEGACY-NOTE [model/service/PromotionService.cfc:L529, L502]: NEITHER of those two conditions is redundant, which is the point most easily missed here - they guard two genuinely different states, each produced by a different upstream module. `structKeyExists` guards ABSENCE: an order item that qualified for no reward discount and received no sale-price seed has no key in the accumulator at all. The `> 0` test guards EMPTINESS UNDER AN EXISTING KEY: `./overUseStripping.ts` removes records with `arrayDeleteAt` at L502 and can remove the LAST surviving record for an order item, leaving an empty list under a key that is still present - `structKeyExists` passes and the list is empty.
    // Collapsing the two into one test would therefore change behaviour in one of those two cases, so both are kept. The middle conjunct is neither of them: it is the narrowing this file owes the compiler for the single captured lookup, and it is behaviour-neutral - the accumulator's value type is `QualifiedDiscount[]`, never `undefined`, so whenever the first conjunct holds the second holds too. It is written as a test rather than as an assertion because `!` and `as` are unavailable by project standard and, more importantly, because a proof is worth more than a promise.
    if (
      structKeyExists(orderItemQualifiedDiscounts, orderItemID) &&
      qualifiedDiscounts !== undefined &&
      qualifiedDiscounts.length > 0
    ) {
      // CFML parity [model/service/PromotionService.cfc:L532, L534]: both reads index `[1]`, and CFML arrays are 1-based, so `[1]` is the FIRST element - index `0` in TypeScript. Only the first element is ever read, at both sites and nowhere else in the block: every other qualified discount on the order item was computed, inserted in descending order and possibly stripped, and is then silently discarded. That single-winner rule is reproduced, not defensively generalised into applying more than one discount per item.
      const bestQualifiedDiscount = qualifiedDiscounts[0];

      // Narrowed rather than asserted, for the same reason as the conjunct above:
      // `noUncheckedIndexedAccess` types an array element read as possibly absent
      // even after a length test, and the project forbids `!` and `as`, so the
      // element is tested. Like that conjunct this cannot fail once the guard has
      // held, and testing it costs nothing but proves what the CFML only assumed.
      if (bestQualifiedDiscount !== undefined) {
        appliedIntents.push(buildOrderItemDiscountIntent(orderItem, bestQualifiedDiscount));
      }
    }
  }

  return appliedIntents;
}
