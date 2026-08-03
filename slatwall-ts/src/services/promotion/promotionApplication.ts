/**
 * PROMOTION APPLICATION - the terminal step of the promotion engine's sales branch: decide which
 * single discount each order item receives, and emit it.
 *
 * A port of exactly one block of the legacy engine, the final best-discount application loop at
 * [model/service/PromotionService.cfc:L523-L537], and nothing else. It reads the qualified-discount
 * accumulator the passes before it built, takes the FIRST record on each order item's list, and
 * returns one applied-promotion intent per order item that has one. It computes no money, sorts
 * nothing, removes nothing and writes nothing. Applying the wrong record, applying more than one,
 * or filtering out a legitimate winner each change the amount a customer is charged.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L523-L537]: the range issued for this module is
 * L523-L536 and it is one line short - the loop OPENS on L524 and its closing brace is on L537,
 * while L523 is the explanatory comment and L536 is whitespace-only. Corrected rather than
 * reproduced, because a reviewer diffing L523-L536 would find an unbalanced brace and conclude the
 * port had dropped a statement.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the preserved permission-string typo
 * `hb_permission="promotionPeriod.promtionRewards"` is published as sitting on L49; L49 of that
 * file is blank and the attribute is on the `component` declaration at L57. Corrected here because
 * this file cites that attribute as the contrast case for its own rename decision below.
 *
 * ORDERING, RECORDED AND NOT ENFORCED
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L165-L465, L468-L521, L524-L537]: the
 * four steps of the sales branch run in an order fixed purely by source position - sale-price
 * seeding, the two-pass reward iteration, over-use stripping, then this module - so this module has
 * a hard ordering dependency on `./overUseStripping.ts`, which can REDUCE the winning record's
 * `discountAmount` in place at L486 or DELETE it outright at L502 and so change which record
 * occupies the head of the list. There is no runtime check, no "has stripping run" flag, no
 * sequence counter and no assertion here, because the legacy has no such state and inventing it
 * would be a behaviour change dressed up as a safeguard. Sequencing is an obligation on whichever
 * caller composes the passes; no such composing module exists in this subtree yet.
 *
 * The cross-service constraint is likewise acknowledged and not enforced:
 * `PriceGroupService.updateOrderAmountsWithPriceGroups`
 * [model/service/PriceGroupService.cfc:L364-L375] must run BEFORE
 * `updateOrderAmountsWithPromotions`, because [model/service/PromotionService.cfc:L241-L252]
 * chooses the discount base price by price-group eligibility - the `if` arm uses
 * `orderItem.getPrice()` with no correction term (L244) while the `else` arm uses
 * `orderItem.getSkuPrice()` (L249) and corrects by
 *   `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`
 * (L252) - so the promotion pass reads state the price-group pass writes.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L324-L467]: use-limit enforcement in this engine
 * is ITEM-LEVEL ONLY, and that is measured rather than assumed - a census of
 * `promotionRewardUsageDetails` across the whole file returns L105, L139, L172, L173, L181, L184,
 * L187, L223, L224, L228, L236, L237, L297, L304, L306, L309, L323, L468, L471, L472, L475, L476
 * and L477, so there is NOT ONE occurrence between L324 and L467, the span containing both the
 * fulfillment branch (L345-L412) and the order branch (L415-L455). Neither branch reads or writes
 * the ledger, so fulfillment-level and order-level discounts are structurally immune to the
 * stripping at L468-L521. This module emits `'orderItem'` intents only, declares no order-level or
 * fulfillment-level usage member and never imports
 * `../../domain/promotionEngine/rewardUsageTypes.js`.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L529-L535]: the order-item level is ADD-ONLY -
 * the block creates a record and calls four setters, performing no update, removal, merge or
 * de-duplication, and never inspecting promotions already applied to the item. Reproduced exactly:
 * one intent per qualifying order item, every intent carrying `operation: 'add'`. The other two
 * levels are NOT add-only - the fulfillment branch updates at L389 and detaches at L393, the order
 * branch at L435 and L439 - so the asymmetry is real and this module must not be read as evidence
 * that the whole engine is add-only.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L64-L68, L71-L75, L78-L80]: the three clear-out
 * loops that open the method walk previously applied promotions backwards and detach them -
 * `removeOrderItem()`, `removeOrderFulfillment()`, `removeOrder()` - and are REPLACED by the
 * anti-corruption inversion rather than reproduced anywhere in this folder. There is nothing here
 * to clear: the input is a read-only `OrderView` and the output a fresh list of intents, so no
 * prior state is reachable to detach and no removal intent is emitted.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294, L301-L329]: this module PERFORMS NO
 * SORT. The head of each list is the largest discount only because the accumulator is insert-sorted
 * DESCENDING by `discountAmount` at L266-L294, and this module trusts that ordering - no re-sort,
 * no comparator, no maximum scan, no verification. The two insertion sorts run in OPPOSITE
 * directions and both are load-bearing, so they must never be unified: L266-L294 is descending by
 * discount amount so the best discount per item wins, while L301-L329 is ascending by
 * `discountPerUseValue` so the cheapest-per-use discounts are given up first. Both tie-breaks are
 * strict - `<` at L271 and `>` at L306 - so an equal-valued newcomer is placed AFTER the incumbent
 * in both.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L155-L159]: sale-price records compete
 * on equal footing and are NOT filtered here. `./salePriceSeeding.ts` seeds them into the same
 * accumulator before the reward iteration, each carrying the EMPTY-STRING `promotionRewardID`
 * sentinel written at L156, so they take part in the descending sort and can legitimately win. No
 * special case for the `''` sentinel exists here and none may be added: a sale price is a real
 * discount from a real promotion (L157 resolves the entity from `salePriceDetails.promotionID`) and
 * excluding it would silently raise the price the customer pays. It is also why sale-price
 * discounts survive use-limit stripping - L483 and L499 match by `.promotionRewardID == prID` and
 * `prID` is always a real reward ID.
 *
 * THE ACCUMULATOR'S NAME
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133, L529, L532, L534]: the legacy
 * accumulator is spelled `orderItemQulifiedDiscounts`, missing the `a` in "Qualified" - in the
 * illustrative block comment spanning L82-L133 (the misspelled key is at L121), in the live
 * declaration at L142, and at every use site, which in this module's range are L529, L532 and L534.
 * The target uses the corrected spelling. Renaming is correct here because a census of all twenty
 * mentions - L121, L142, L152, L155, L259, L260, L262, L269, L271, L274, L288, L482, L483, L486,
 * L498, L499, L502, L529, L532, L534 - finds every one to be a local-variable reference inside a
 * single CFML function, never a column, a JSON key or a transported name, and interface parity
 * binds public method names rather than local state. The contrasting case is
 * `hb_permission="promotionPeriod.promtionRewards"` [model/entity/PromotionReward.cfc:L57], which
 * carries the same class of typo but IS a contract - a permission string resolved by name - and is
 * therefore preserved verbatim. An internal accumulator is renamed and the original recorded; a
 * persisted column, a permission string or any cross-boundary key is preserved and annotated.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L523]: the source comment reads "look for the top
 * 1 discounts that can be applied" - plural "discounts" for something that applies exactly one
 * record per order item, and "look for" for a step that does no searching, the search having
 * happened during the descending insert upstream. Noted and not fixed; the code at L532 and L534 is
 * unambiguous: index [1], twice, and no other index anywhere.
 *
 * BOUNDARIES A LATER EDIT MUST NOT CROSS
 *
 * THE TWO ORDER-TYPE GATES ARE SEQUENTIAL `if`s, NOT `if`/`else if`.
 * [model/service/PromotionService.cfc:L61] tests
 *   `listFindNoCase("otSalesOrder,otExchangeOrder", ...)`
 * and [model/service/PromotionService.cfc:L542] tests
 * `listFindNoCase("otReturnOrder,otExchangeOrder", ...)`; `otExchangeOrder` appears in BOTH lists
 * and the second gate is a separate statement, so an exchange order runs the entire sales branch
 * and then also enters the return branch, which is empty. Refactoring those two gates into
 * `if`/`else` or a `switch` would silently stop exchange orders taking the sales path. Neither gate
 * is reproduced here; the warning is recorded so no module in this folder re-invents the structure.
 * The return/exchange branch's `TODO [issue #1766]` [model/service/PromotionService.cfc:L542-L544]
 * is not absorbed here either.
 *
 * MODULE-LEVEL MUTABLE STATE IS FORBIDDEN HERE. On a warm Lambda container module-level state
 * persists between unrelated requests, so a cache, counter or memo added to this module could leak
 * one customer's discount into another customer's order. The intent list is function-local and
 * freshly allocated on every call.
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

// LEGACY-NOTE [model/service/PromotionService.cfc:L532]: `../../domain/entities/promotion.js` is
// deliberately NOT imported, even though the legacy passes a live Promotion entity to
// `setPromotion` at L532. `PromotionAppliedIntent` publishes the promotion as an opaque
// `promotionID: string`, so this module reads the identifier off the accumulator record's
// already-typed `promotion` member and never needs the entity type in an annotation; importing it
// would leave an unused binding that `noUnusedLocals` rejects. The identifier is the only thing the
// legacy write path takes from that entity.

/**
 * Build the one applied-promotion intent for one order item, from the discount record that won.
 *
 * The whole of [model/service/PromotionService.cfc:L530-L534] - the construction and its four
 * setters - expressed as data. Module-local and unexported on purpose: it is the single named home
 * for the field mapping, so each legacy setter line has somewhere to be annotated and checked.
 *
 * JUDGMENT CALL: [model/service/PromotionService.cfc:L530] calls `this.newPromotionApplied()`, an
 * entity factory inherited from `HibachiService`, and there is no equivalent in the locked
 * thirteen-port set; none was invented. The intent is constructed directly as a plain object
 * literal satisfying `AddPromotionAppliedIntent`. A fourteenth port would model removed framework
 * plumbing rather than retained business logic, and instantiating the `PromotionApplied` entity
 * would reintroduce the write path the anti-corruption boundary exists to remove.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L530-L534]: the legacy block creates a
 * `PromotionApplied`, sets four fields and performs NO explicit save - no `.save()`, no collection
 * append, no return - so it reads as dead code and is not. `setOrderItem(orderItem)` at L533 is the
 * ATTACHMENT MECHANISM rather than a field assignment: in Hibachi, setting an association maintains
 * the inverse side, which is how the record becomes reachable from the order item and persistable.
 * That mechanism lives in `org/Hibachi/**`, a boundary to extract FROM and never modify, so this
 * module neither reproduces nor depends on it: an intent is emitted and returned, nothing is
 * written, and only the opaque identifier is retained.
 *
 * @param orderItem - the order item being priced. Read for its identifier only; never mutated.
 * @param bestQualifiedDiscount - the record at the head of that order item's qualified-discount
 * list, already selected by the caller.
 */
function buildOrderItemDiscountIntent(
  orderItem: OrderItemView,
  bestQualifiedDiscount: QualifiedDiscount,
): AddPromotionAppliedIntent {
  // CFML parity [model/service/PromotionService.cfc:L533]: `setOrderItem( orderItem )` names the
  // target by passing the live entity; the intent names it by opaque identifier, because the Order
  // aggregate is out of scope and the anti-corruption boundary forbids both holding a live view on
  // the output and mutating order persistence.
  const orderItemID: string = orderItem.orderItemID;

  // CFML parity [model/service/PromotionService.cfc:L532]: `setPromotion( ...[1].promotion )`
  // passes the Promotion entity; the intent carries `promotionID`, resolved from that same entity,
  // because a write-side instruction must not transport a domain entity across the repository
  // boundary. The accumulator still holds the entity - the engine reads more than an identifier
  // from it while deciding - and nothing else is taken from it here.
  const promotionID: string = bestQualifiedDiscount.promotion.getPromotionID();

  // CFML parity [model/service/PromotionService.cfc:L534]:
  //   `setDiscountAmount( ...[1].discountAmount )`
  // hands the accumulated amount straight through, and so does this. The `Money` is COPIED
  // VERBATIM: no arithmetic, no rounding, no re-formatting, no `toFixed2`, no comparison, no
  // default. The explicit annotation makes that pass-through compile-checked - the amount was
  // computed by `./discountAmount.ts` and possibly scaled down by `./overUseStripping.ts` at L486,
  // and this module's only job is not to disturb it.
  const discountAmount: Money = bestQualifiedDiscount.discountAmount;

  return {
    // CFML parity [model/service/PromotionService.cfc:L531]: `setAppliedType('orderItem')` - the
    // exact literal, single-quoted lowercase-camel, neither derived nor uppercased nor replaced by
    // an enum. The engine writes exactly three such literals and this is the only one this module
    // emits: `'orderItem'` here (L531), `'orderFulfillment'` at L402 and `'order'` at L448.
    appliedType: 'orderItem',

    // The order-item level is add-only; see the ADD-ONLY note in this file's header.
    operation: 'add',

    promotionID,
    orderItemID,
    discountAmount,

    // `orderID` and `orderFulfillmentID` are OMITTED because the order-item
    // variant of `AddPromotionAppliedIntent` FORBIDS them - both are typed
    // `?: never` on that variant, so under `exactOptionalPropertyTypes` neither an
    // identifier nor an explicit `undefined` would compile here. An order-item
    // intent names its target by `orderItemID` and by nothing else.
    //
    // There is no `currencyCode` to omit: the member is declared nowhere on the
    // intent surface, because the legacy engine never calls `setCurrencyCode` -
    // zero occurrences in model/service/PromotionService.cfc - so synthesising a
    // currency here would invent a value the engine never chose, and the type now
    // makes that unrepresentable rather than merely discouraged.
  };
}

/**
 * Apply the single best qualified discount to each order item, and return the resulting
 * applied-promotion intents.
 *
 * The terminal step of the sales branch of `updateOrderAmountsWithPromotions`
 * [model/service/PromotionService.cfc:L58-L546]: a port of the final loop at
 * [model/service/PromotionService.cfc:L523-L537] and of nothing else. By the time it runs every
 * candidate discount has been computed, inserted in descending order and possibly stripped; all
 * that is left is to take the head of each order item's list and say so.
 *
 * SYNCHRONOUS BY CONSTRUCTION. The ported block reaches no DAO, no ORM and no collaborator that
 * does, so this function is not `async` and returns an array rather than a promise.
 *
 * JUDGMENT CALL: the block being ported is INLINE CODE inside a 489-line CFML function with no
 * legacy method signature of its own, so naming this one spends nothing from any budget - it is
 * neither a signature widening nor a reshaping (both govern a ported method whose CFML parameter
 * list is preserved) nor a visibility widening (no private legacy method is promoted).
 * `applyBestOrderItemDiscounts` is a target-only name that displaces no legacy identifier.
 *
 * @param order - a read-only view of the order. Never mutated, and no reference to it or to any of
 * its items is retained on the returned intents.
 * @param orderItemQualifiedDiscounts - the qualified-discount accumulator, keyed by opaque
 * `orderItemID`, each list already sorted descending by discount amount by the passes that ran
 * before this one. Read only: never inserted into, deleted from or reordered here.
 * @returns one intent per order item that has at least one surviving qualified discount, in
 * order-item order. An empty array is a valid and meaningful result.
 */
export function applyBestOrderItemDiscounts(
  order: OrderView,
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
): PromotionAppliedIntent[] {
  const appliedIntents: PromotionAppliedIntent[] = [];

  // LEGACY-NOTE [model/service/PromotionService.cfc:L524, L526]: the source calls
  // `arguments.order.getOrderItems()` TWICE per iteration - once in the loop condition and once to
  // bind the element - and the collection it returns is live, since neither entity nor view
  // accessors produce defensive copies. The target reads it once into a local, so the collection
  // the guard reasons about is provably the collection the body iterates. The captured reference is
  // not cloned, sorted or mutated, and the view publishes it as `readonly`.
  const orderItems = order.orderItems;

  // CFML parity [model/service/PromotionService.cfc:L524, L526]: the source is a 1-based counted
  // `for` that indexes the collection by `i`; the target iterates the captured array directly. CFML
  // arrays are 1-based and TypeScript arrays are 0-based, and 1-based emulation is forbidden in the
  // target, so the translation is an idiomatic `for...of`. Iteration order is unchanged and no
  // index variable survives, nothing in the block reading `i` for anything but indexing.
  for (const orderItem of orderItems) {
    const orderItemID = orderItem.orderItemID;

    // LEGACY-NOTE [model/service/PromotionService.cfc:L529, L532, L534]: the source looks the same
    // key up FOUR times per qualifying iteration - inside `structKeyExists`, as the argument to
    // `arrayLen`, and once each at L532 and L534 - and the target performs ONE indexed lookup into
    // a local instead, so the guard cannot have tested one list and the body read another.
    // `structGet` is used for its CFML-matching case-insensitive key semantics and returns
    // `QualifiedDiscount[] | undefined` with NO default of any kind (no `?? 0`, no `?? Money.zero`)
    // because substituting a value for an absent key is how a zero reaches a price path.
    const qualifiedDiscounts = structGet(orderItemQualifiedDiscounts, orderItemID);

    // CFML parity [model/service/PromotionService.cfc:L529]: the guard reproduces BOTH of the
    // source's conditions, in the source's order, joined by short-circuiting `&&`. The first
    // conjunct is the source's `structKeyExists`, routed through the case-insensitive key access of
    // `../../lib/cfml/struct.js` because CFML struct keys are not case-sensitive and TypeScript
    // object keys are. The third is the source's `arrayLen(...)`, which the source uses BARE as a
    // boolean; numeric truthiness is forbidden in the target, so it becomes an explicit `> 0`.
    // LEGACY-NOTE [model/service/PromotionService.cfc:L529, L502]: NEITHER of those conditions is
    // redundant - they guard two different states produced by two different upstream modules.
    // `structKeyExists` guards ABSENCE: an order item that qualified for no reward discount and
    // received no sale-price seed has no key at all. The `> 0` test guards EMPTINESS UNDER AN
    // EXISTING KEY: `./overUseStripping.ts` removes records with `arrayDeleteAt` at L502 and can
    // remove the LAST surviving record, leaving an empty list under a key that is still present.
    // Collapsing them would change behaviour in one of those two cases. The middle conjunct is
    // neither: it is the narrowing this file owes the compiler for the single captured lookup, and
    // it is behaviour-neutral, the accumulator's value type being `QualifiedDiscount[]` and never
    // `undefined`. It is written as a test rather than an assertion because `!` and `as` are
    // unavailable by project standard.
    if (
      structKeyExists(orderItemQualifiedDiscounts, orderItemID) &&
      qualifiedDiscounts !== undefined &&
      qualifiedDiscounts.length > 0
    ) {
      // CFML parity [model/service/PromotionService.cfc:L532, L534]: both reads index `[1]`, and
      // CFML arrays are 1-based, so `[1]` is the FIRST element - index `0` here. Only the first
      // element is ever read, at both sites and nowhere else in the block: every other qualified
      // discount was computed, inserted in descending order, possibly stripped, and is then
      // silently discarded. That single-winner rule is reproduced, not defensively generalised.
      const bestQualifiedDiscount = qualifiedDiscounts[0];

      // Narrowed rather than asserted, for the same reason as the conjunct above:
      // `noUncheckedIndexedAccess` types an array element read as possibly absent even after a
      // length test, and the project forbids `!` and `as`. Like that conjunct this cannot fail once
      // the guard has held.
      if (bestQualifiedDiscount !== undefined) {
        appliedIntents.push(buildOrderItemDiscountIntent(orderItem, bestQualifiedDiscount));
      }
    }
  }

  return appliedIntents;
}
