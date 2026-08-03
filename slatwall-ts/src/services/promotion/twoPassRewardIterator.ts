// slatwall-ts - The two-pass promotion-reward iteration mechanism.
//
// PORTED FROM `model/service/PromotionService.cfc`, the reward-collection fetch and the hand-rolled
// two-pass iteration inside
//   `public void function updateOrderAmountsWithPromotions(required any order)`
// [L58]:
//
//   L164        the source comment introducing the loop
//   L165        the DAO call - three KEYWORD arguments, `qualificationRequired=true`
//   L166        `var orderRewards = false;` - the pass flag
//   L167        `for(var pr=1; pr<=arrayLen(promotionRewards); pr++) {` - the traversal
//   L169        `var reward = promotionRewards[pr];` - the binding that LEAKS
//   L457-L461   the loop-counter reset that manufactures the second pass
//   L465        the close of the reward loop
//
// with L197 (the qualification gate) and L463 (its close) as load-bearing context that this module
// does not own but must not lose - see EDGE OUTCOME 2 below.
//
// THIS MODULE OWNS ORDER-DEPENDENCE VECTOR 2 - the hand-rolled two-pass loop implemented by
// mutating the loop counter - and claims no other. It sits inside must-preserve area #1 (AAP
// 0.8.1), promotion discount math together with use-limit enforcement semantics: running pass two
// when the legacy would not, or skipping it when the legacy would run it, changes the amount
// charged. Nothing here may be tidied on aesthetic grounds.
//
// ---------------------------------------------------------------------------
// THE MECHANISM, AND WHY IT IS NOT TRANSLITERATED
//
// The legacy author needed item-level and fulfillment-level rewards processed FIRST and order-level
// rewards SECOND. Rather than write two loops, they wrote one loop and mutated its counter: on
// reaching the last element during the first pass, `pr` is set to `0` and the pass flag flips, so
// the `pr++` increment produces `pr = 1` and the entire collection is traversed again.
//
// The Minimal Change Clause scopes the FUNCTIONAL SURFACE, not the code style, so reproducing
//   `pr = 0`
// literally - a mutated loop index, 1-based emulation - is exactly the transliteration that is
// forbidden, while a "clean two-pass rewrite" that loses either edge outcome below breaks behaviour
// preservation. Both constraints are satisfied by two literal sequential traversals gated on a flag
// that can be set at most once.
//
// EXACTLY TWO EDGE OUTCOMES EXIST, BOTH ARE LOAD-BEARING, AND THERE IS NO THIRD:
//
//   OUTCOME 1 - AN EMPTY REWARD COLLECTION MEANS PASS TWO NEVER RUNS. `arrayLen(promotionRewards)`
//   is `0`, so the L167 loop body never executes, so the L458 condition is never evaluated, so no
//   reset occurs. A naive "always run two passes" rewrite would run an empty second pass.
//
//   OUTCOME 2 - THE LAST REWARD'S PROMOTION PERIOD FAILING QUALIFICATION ALSO MEANS PASS TWO NEVER
//   RUNS. The L458-L461 reset sits INSIDE the L197 qualification gate, which closes at L463, so if
//   the final element's period does not qualify control never reaches L458. This is the harder
//   consequence and the one most easily lost in a clean rewrite, so the reset below is nested
//   inside the gate report exactly as the source nests it inside the gate.
//
// A single-element collection collapses into these two, and no third case is fabricated.
//
// This module handles NO monetary value, so `../../domain/valueObjects/money.js` is not imported;
// the only numbers in range are the collection length and a traversal index, both plain integer
// counts. It neither creates, reads nor mutates the reward-usage ledger or the qualified-discount
// accumulator. All working state is a per-invocation local rather than instance or module state,
// which on a warm container is a CORRECTNESS requirement: a module-level binding survives between
// UNRELATED invocations, so holding reward state there could let one customer's discount answer
// another customer's order. The two passes are strictly ordered and the ledger the callback mutates
// is mutated in place, so the traversals are sequential - no `Promise.all` over rewards, no
// `worker_threads`, no parallelism of any kind.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L165-L167, L458-L461]: this module's cited range
// was reconciled from two disagreeing specifications. The AAP's Promotion Engine Decomposition
// table cites the module as `L166 + L458-L461`; the folder specification additionally assigns L165
// (the DAO call, with its keyword-argument shape and `qualificationRequired=true`) and L167 (the
// reward loop). The SOURCE plus the more specific folder specification win, so this module owns
// FOUR anchors: L165, L166, L167 and L458-L461. Owning L165 is what makes the iteration entry point
// `async` and what gives this class its `promotionRepository` port.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L454-L461]: the reset region's placement was
// corrected against the source, and the correction changes which lines a reviewer diffs. Some
// briefs cite the region as beginning at L454. It does not: L454 is the closing brace of the
// chained reward-arm construct, carrying the trailing label "END ALL REWARD TYPES", L455 and L456
// are whitespace, L457 carries the comment "This forces the loop to repeat looking for 'order'
// discounts", L458 is the `if`, L459 and L460 are its two assignments, and L461 closes the block.
// Where the source and a brief disagree the SOURCE WINS.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L200-L341, L345-L412, L415-L455]: the three
// reward-level branch bodies are FACADE-OWNED and are not reproduced in this file. Verified
// boundaries: the order-item arm opens at L200 and its order-item loop closes at L341, five nested
// gate levels deep; the fulfillment arm opens at L345 and closes at L412, four levels deep; the
// order arm opens at L415 and computes `totalDiscountableAmount` at L417; the chained construct
// closes at L454. This module reproduces only the ITERATION MECHANISM and hands each reward to a
// callback so the caller can dispatch. The order-item arm's five gate levels run outer to inner -
// sale-item type, then fulfillment-in-qualified-list, then qualification count greater than zero,
// then item-in-reward - each short-circuiting the ones inside it, and they must never be reordered.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L61, L542]: the two order-type gates are
// SEQUENTIAL `if` statements, not an `if`/`else if` pair, and both are facade-owned. L61 tests
// `listFindNoCase("otSalesOrder,otExchangeOrder", ...)` and closes at L539; L542 then opens a
// SEPARATE `if` testing `listFindNoCase("otReturnOrder,otExchangeOrder", ...)`, so
// `otExchangeOrder` appears in BOTH and an exchange order runs both blocks. Refactoring the pair
// into `if`/`else` or a `switch` would silently drop one of those two executions. By deliberate
// contrast the three reward-level arms at L200, L345 and L415 ARE a chained `else if` construct.
// The BODY of the L542 gate, at L542-L544, is the `issue #1766` return/exchange no-op, which the
// facade ports verbatim under the TODO carry-forward rule; the three backwards clear-out loops at
// L64-L68, L71-L75 and L78-L80 are facade territory on the same footing.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L192-L194, L197]:
// `./promotionPeriodQualification.ts` is deliberately NOT imported here, and neither is any other
// sibling in this folder. L192-L193 lazily populates the period-qualification memo and L197 reads
// `.qualificationsMeet` off it. Both fall OUTSIDE this module's cited range, so this module neither
// owns the memo, nor populates it, nor evaluates the gate. What it does own is the gate's
// CONSEQUENCE - the L197 gate closes at L463 and therefore encloses the L458-L461 reset, which is
// precisely why EDGE OUTCOME 2 exists - so the gate outcome is reported back per reward through
// {@link RewardVisitOutcome} instead of being computed here.

import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import type { PromotionRepository } from '../../domain/ports/promotionRepository.js';
import type { OrderView } from '../../domain/views/orderView.js';

// JUDGMENT CALL: the three imports above are the complete dependency set. `../../lib/cfml/list.js`
// is NOT imported: L165's `rewardTypeList` is a LITERAL STRING ARGUMENT passed straight through to
// the port, not a list operation, and the splitting happens inside the adapter that binds it.
// `../../lib/cfml/precision.js` and `../../lib/cfml/numberFormat.js` are NOT imported: the in-scope
// slice has NINE `precisionEvaluate` sites - L150, L252, L299, L486, L990, L995, L1001, L1006 and
// L1007 - and not one falls in L165-L167 or L458-L461, and there is no `numberFormat` site in range
// either. `../../lib/cfml/struct.js` and `../../lib/cfml/truthiness.js` are NOT imported: the
// `structKeyExists` guards at L172 and L192 belong to `./rewardUsageLedger.ts` and to the caller
// respectively, and this module tests no CFML truthiness. `../priceGroupService.ts` appears in the
// ordering documentation on {@link TwoPassRewardIterator.iterate} and is deliberately NOT imported,
// because documenting an ordering requirement is not the same as depending on the module that
// satisfies it.
//
// JUDGMENT CALL: this module hosts NO legacy method signature, so its new signature displaces no
// legacy identifier. The block being extracted is INLINE CODE inside
// `updateOrderAmountsWithPromotions` [L58]: L165 is a local variable assignment, L166 a local flag,
// L167 a `for` header and L458-L461 an `if` body, so there is no CFML parameter list to preserve.
// The class name below is descriptive and new; `updateOrderAmountsWithPromotions` stays on the
// facade, and the legacy local names `promotionRewards`, `orderRewards` and `reward` are carried
// over verbatim inside the implementation.
//
// JUDGMENT CALL: the CFML KEYWORD-ARGUMENT call at L165 becomes a POSITIONAL call, and the port is
// what forces that. `../../domain/ports/promotionRepository.js` declares
// `getActivePromotionRewards(rewardTypeList: string, promotionCodeList: string,
// qualificationRequired?: boolean): Promise<PromotionReward[]>`, in the legacy declaration order
// [model/dao/PromotionDAO.cfc:L52-L54], with the legacy `default="false"` [L54] recorded in prose
// rather than written as a default value because that port module emits no runtime JavaScript. The
// port is authoritative for the CALL SHAPE while the source stays authoritative for the ARGUMENT
// VALUES; reconciled with a note rather than by editing the port or adding a member.

/**
 * What the caller reports back about ONE reward it was handed.
 *
 * The single member mirrors the legacy gate read at [model/service/PromotionService.cfc:L197] -
 * `promotionPeriodQualifications[ ... ].qualificationsMeet` - and carries that struct member's
 * spelling verbatim. It is a small named result type belonging to the exported unit below, not a
 * member of any published type in `../../domain/promotionEngine/`.
 *
 * WHY THE ITERATOR NEEDS THIS AT ALL. The reset at L458-L461 sits inside the L197 gate, which
 * closes at L463, so the reset is reachable only when a reward's promotion period qualified. The
 * iterator does not evaluate that gate - see the note above on why
 * `./promotionPeriodQualification.ts` is not imported - so the caller must tell it the outcome, one
 * reward at a time. EDGE OUTCOME 2 is what depends on it.
 *
 * @see {@link RewardVisitor} for the callback that returns this.
 */
export interface RewardVisitOutcome {
  /**
   * Whether the reward's promotion period met its general use-count qualification -
   * [model/service/PromotionService.cfc:L197]. `true` means control entered the gate, so the
   * facade's reward-level branch bodies ran and the L458-L461 reset is reachable for this reward;
   * `false` means control skipped straight to L463. Reported, never validated.
   */
  readonly qualificationsMeet: boolean;
}

// LEGACY-NOTE [model/service/PromotionService.cfc:L169-L197]: the caller carries three obligations
// that this module DOCUMENTS and deliberately does NOT ENFORCE. Between the traversal head at L167
// and the gate at L197 the legacy body initialises the reward-usage ledger entry [L172-L189],
// lazily populates the period-qualification memo [L192-L194], and evaluates the gate itself [L197],
// reporting the outcome back per reward through {@link RewardVisitOutcome} so the reset condition
// can honour EDGE OUTCOME 2. No runtime check, assertion or flag in this file verifies that any of
// the three happened.

/**
 * The per-reward callback the iterator drives.
 *
 * Everything the legacy loop BODY does lives behind this one parameter. The body's three
 * reward-level branch bodies - the order-item arm [model/service/PromotionService.cfc:L200-L341],
 * the fulfillment arm [L345-L412] and the order arm [L415-L455] - are facade-owned and are not
 * reproduced in this file, so the iterator hands over each reward and the current pass flag and
 * lets the caller dispatch on them exactly as the source does.
 *
 * MAY RETURN A PROMISE, AND THAT IS DELIBERATE. The caller's per-reward work reaches persistence:
 * the memo populate at [L192-L193] resolves period qualification, which itself consumes use-count
 * queries. The return type therefore admits both a promise and a plain value, and the iterator
 * awaits it either way.
 *
 * @param reward One reward from the fetched collection, in the order the collection arrived -
 *   [model/service/PromotionService.cfc:L169] `var reward = promotionRewards[pr];`.
 * @param isOrderRewardsPass The legacy `orderRewards` flag [L166] as the source would see it on
 *   this visit: `false` throughout pass one and `true` throughout pass two. It is what the three
 *   reward-level guards at L200, L345 and L415 test, so the caller must pass it through unchanged -
 *   the item and fulfillment arms guard on `!orderRewards` and the order arm on `orderRewards`,
 *   which is what makes the order arm the only reachable arm in pass two.
 * @returns The gate outcome for this reward, awaited by the iterator.
 */
export type RewardVisitor = (
  reward: PromotionReward,
  isOrderRewardsPass: boolean,
) => Promise<RewardVisitOutcome> | RewardVisitOutcome;

// LEGACY-NOTE [model/service/PromotionService.cfc:L169, L472, L475, L476, L477]: the last-processed
// reward identifier is surfaced SOLELY so that register entry 9 can be reproduced faithfully -
// never to repair it. L169's `var reward = promotionRewards[pr];` is bound inside the loop but,
// CFML function scope having no block scoping, it survives the loop's close at L465, and the
// over-use stripping block from L468 then reads
//   `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]`
// at L472, L475, L476 and L477 - so maximum-use-per-order is enforced against whichever reward
// happened to be LAST. The target has no leaked function scope, so the identity must travel
// explicitly: this module owns the loop, so this module surfaces it, and `./overUseStripping.ts`
// receives it as its required `leakedLastProcessedRewardID` argument. The hand-off is the mechanism
// of faithful reproduction.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L172-L189]: the ledger initialisation block
// belongs to `./rewardUsageLedger.ts` and is referenced here for one reason - its POSITION. It sits
// BEFORE the L197 gate, so it runs for EVERY reward the traversal encounters, qualified or not.
// That is the safety proof for the identifier above: the ledger is non-empty if and only if at
// least one reward was processed, which is exactly when the legacy `reward` variable is bound. When
// the collection is empty the ledger is empty too and the stripping block's loop body never runs,
// so the identifier is never read. It is therefore typed as a plain `string` with NO undefined
// branch, NO null check and NO fallback, and the caller must not wrap the stripping call in a new
// conditional.

/**
 * What one full invocation of the iteration reports back.
 *
 * EXACTLY ONE MEMBER, AND THE OMISSIONS ARE DELIBERATE. There is no pass-two-ran flag, no pass
 * count, no visited count and no collection length here. The legacy block publishes none of them,
 * and an assertion that pass two ran is exactly the kind of state that must not be invented.
 */
export interface TwoPassRewardIterationResult {
  /**
   * The `promotionRewardID` of the LAST reward this invocation processed -
   * [model/service/PromotionService.cfc:L169] made explicit.
   *
   * A plain `string`, never optional, for the reason proved in the note above. The EMPTY STRING
   * when the fetched collection was empty, which is precisely the case in which the reward-usage
   * ledger is also empty and `./overUseStripping.ts` therefore never reads it. Hand it straight to
   * `stripOverUsedRewardDiscounts` as its `leakedLastProcessedRewardID` argument, unguarded.
   *
   * Which reward this is after a two-pass invocation: pass two re-traverses the whole collection,
   * so the value that survives is the final element as seen by pass two - the same element pass one
   * ended on, which is what the legacy single mutated loop also leaves bound.
   */
  readonly lastProcessedRewardID: string;
}

// LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L165-L465, L468-L521, L524-L537]: the
// intra-folder execution order is DOCUMENTED here and ENFORCED nowhere. The legacy method runs four
// blocks in a fixed sequence and the decomposition preserves it: sale-price seeding [L145-L162] in
// `./salePriceSeeding.ts`, then the two-pass reward iteration [L165-L465] in this module together
// with the facade-owned branch bodies, then over-use stripping [L468-L521] in
// `./overUseStripping.ts`, then best-discount application [L524-L537] in
// `./promotionApplication.ts`. Sequencing is an obligation on whichever caller composes the passes:
// this module adds no runtime check, no ordering flag, no assertion and no sequence counter,
// because the legacy code carries none and inventing one would be added validation.

/**
 * The two-pass promotion-reward iteration mechanism - ORDER-DEPENDENCE VECTOR 2.
 *
 * Fetches the active reward collection [model/service/PromotionService.cfc:L165] and traverses it
 * TWICE in a fixed order, handing each reward to a caller-supplied visitor along with the pass flag
 * [L166] that the facade's three reward-level guards test. It reproduces the legacy loop-counter
 * reset [L457-L461] without reproducing the loop-counter mutation, and it reproduces both of the
 * mechanism's edge outcomes deliberately. It owns no branch body, no ledger and no memo.
 *
 * THE CROSS-SERVICE ORDERING CONSTRAINT - THE ONE DEPENDENCY THE LEGACY CODE LEAVES IMPLICIT.
 * `PriceGroupService.updateOrderAmountsWithPriceGroups()`
 * [model/service/PriceGroupService.cfc:L364-L375] MUST RUN BEFORE
 * `PromotionService.updateOrderAmountsWithPromotions()` [model/service/PromotionService.cfc:L58].
 * The price-group pass writes each order item's price and applied price group
 * [model/service/PriceGroupService.cfc:L370-L371]; the promotion pass then READS that state when it
 * chooses the base price a discount is computed against [model/service/PromotionService.cfc:L241] -
 * the `if` arm [L241], taken when there is NO applied price group OR the reward has it as an
 * ELIGIBLE one, computes from `getPrice()` [L244] with NO correction term, while the `else` arm
 * [L246], taken when a price group IS present AND the item is INELIGIBLE, computes from
 * `getSkuPrice()` [L249] and applies the L252 correction
 *   `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`.
 * That orientation comes from the source and is authoritative; some briefs transpose the two arms,
 * and implementing the transposed version inverts the discount on every price-group order. In the
 * legacy system the ordering held ONLY because the out-of-scope `OrderService` happened to call the
 * two services in that sequence; here it is an explicit obligation on whichever caller composes the
 * passes, with the price-group pass running first. Pinning it with a characterization test - one
 * asserting that reversing the two passes changes the computed discount - is a required and so far
 * unfulfilled test obligation for this module.
 *
 * NOTHING BELOW ENFORCES ANY OF THAT. There is no runtime check, no ordering flag and no assertion
 * for the cross-service constraint, for the intra-folder order, or for the caller obligations.
 *
 * DEPENDENCY INJECTION IS EXPLICIT AND SINGULAR (T1). The one collaborator arrives as a `readonly`
 * constructor parameter typed to a PORT INTERFACE, wired once in a composition root, replacing the
 * legacy bean-factory convention scan over `property name="xService";` declarations -
 * `PromotionService` declares exactly three, `promotionDAO`
 * [model/service/PromotionService.cfc:L51], `addressService` [L53] and `roundingRuleService` [L54].
 *
 * THIS CLASS IS STATELESS BETWEEN INVOCATIONS. It holds the port and nothing else - no fetched
 * collection, no pass flag, no counter, no cache.
 *
 * @see {@link RewardVisitor} for what the caller supplies.
 * @see {@link TwoPassRewardIterationResult} for the leaked-reward hand-off.
 */
export class TwoPassRewardIterator {
  /**
   * @param promotionRepository The promotion port, sole collaborator. Only
   *   `getActivePromotionRewards` is reached; the port's other six members are untouched here.
   */
  constructor(private readonly promotionRepository: PromotionRepository) {}

  /**
   * Fetch the active rewards and traverse them in two ordered passes.
   *
   * `async` for exactly one reason: L165 reaches persistence through the repository port. Nothing
   * else here is asynchronous.
   *
   * THE SEQUENCE, against the source:
   *
   *   1. Fetch [L165] - three arguments, values reproduced exactly, result order untouched.
   *   2. PASS ONE - traverse every reward with the pass flag `false` [L166, L167]. The item arm
   *      [L200] and the fulfillment arm [L345] are the reachable ones.
   *   3. On the FINAL element only, and only if the caller reported the L197 gate as met, authorise
   *      pass two [L458-L461]. The flag is set at most once and never cleared.
   *   4. PASS TWO, if and only if it was authorised - traverse the WHOLE collection again, in the
   *      same order, with the pass flag `true`. The order arm [L415] is the only reachable arm.
   *
   * @param order The read-only order view. Read for exactly one value - its promotion-code list,
   *   for L165's second argument. NEVER MUTATED.
   * @param onReward The per-reward visitor. Invoked once per reward per pass, sequentially, and
   *   awaited before the next reward is visited.
   * @returns The last-processed reward identifier, for the register-entry-9 hand-off.
   */
  async iterate(order: OrderView, onReward: RewardVisitor): Promise<TwoPassRewardIterationResult> {
    // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: `getActivePromotionRewards` applies NO
    // `ORDER BY`, and THE ABSENCE IS PRESERVED. Verified by census: a case-insensitive search for
    // "order by" across the whole of `model/dao/PromotionDAO.cfc` returns ZERO OCCURRENCES.
    // Iteration order is therefore whatever the engine returns, and because the traversal below
    // threads a mutable usage ledger through it [model/service/PromotionService.cfc:L297], WHICH
    // reward is allowed depends on WHICH earlier rewards ran: the legacy behaviour is genuinely
    // non-deterministic at the boundary of a tie, and that non-determinism is Vector 1, owned by
    // `./rewardUsageLedger.ts`. This module must not sort the collection, must not assume an order,
    // and must not permit the port method to acquire one.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L1040]: TWO DISTINCT CALL SHAPES REACH
    // THE SAME DAO METHOD, and they must NOT be normalised into one. L165 - this module's call -
    // passes all three arguments and states `qualificationRequired=true` explicitly. L1040, inside
    // the facade's shipping-method-option path, passes only `rewardTypeList="fulfillment"` and a
    // promotion-code list, relying on the DAO's own `default="false"`
    // [model/dao/PromotionDAO.cfc:L54]. Both branches of that flag are live, so no shared wrapper
    // is introduced and no default is added that would make the two shapes identical.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L200, L714, L794]: the reward-type
    // comma list appears at three sites in three different forms, and each literal stays exactly
    // where and as it is written. L165 - here - uses the FIVE-token
    // `"merchandise,subscription,contentAccess,order,fulfillment"`; L200 and L794 use the
    // three-token `"merchandise,subscription,contentAccess"`; and L714 uses
    // `"contentAccess,merchandise,subscription"`, the same three tokens in a DIFFERENT ORDER. No
    // shared constant is extracted, no token order is normalised, and no literal is built from
    // another.

    // [model/service/PromotionService.cfc:L164] Loop over all Potential Discounts that require
    // qualifications.
    //
    // [L165] The three argument VALUES are reproduced exactly: the five-token reward-type list in
    // source order, the order's promotion-code list, and `qualificationRequired` explicitly `true`.
    // The result is typed `readonly PromotionReward[]` because the legacy collection is NEVER
    // MUTATED anywhere inside the loop - no append, no delete, no reassignment. No sort, no
    // de-duplication and no ordering assumption is applied to it, here or below.
    const promotionRewards: readonly PromotionReward[] =
      await this.promotionRepository.getActivePromotionRewards(
        'merchandise,subscription,contentAccess,order,fulfillment',
        order.promotionCodeList,
        true,
      );

    // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L458]: `arrayLen(promotionRewards)` is
    // re-evaluated on every loop-condition check AND again inside the reset condition; the bound is
    // captured ONCE here instead. The two are equivalent because the collection is never mutated
    // during iteration, as the `readonly` type above records, so every re-evaluation in the source
    // returns the same number. Capturing it once names the value the reset condition actually
    // depends on and lets the final-element test below read as a single comparison.
    const rewardCount: number = promotionRewards.length;

    // [model/service/PromotionService.cfc:L169] made explicit. Per-invocation local. The EMPTY
    // STRING is the value that survives an empty collection - see the safety proof on
    // {@link TwoPassRewardIterationResult.lastProcessedRewardID}.
    let lastProcessedRewardID = '';

    // [model/service/PromotionService.cfc:L166] `var orderRewards = false;` - the legacy identifier
    // carried over verbatim. Per-invocation local.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L458-L461]: THE EXACTLY-TWO-PASSES PROOF,
    // encoded rather than inherited. L458's condition is compound -
    //   `!orderRewards and pr == arrayLen(promotionRewards)` -
    // and L460 sets `orderRewards = true` inside the body it guards. After that assignment
    // `orderRewards` is `true` for the remainder of the invocation, because NOTHING anywhere in the
    // method ever clears it, so `!orderRewards` is permanently `false` and L458 short-circuits on
    // every subsequent evaluation. At most ONE reset can therefore ever occur, which yields EXACTLY
    // TWO passes and never three. Below, that proof is structural: the flag is assigned at exactly
    // one site, only from `false` to `true`, and pass two contains no reset site at all - so a
    // third pass is not merely unreached, it is unexpressible.
    let orderRewards = false;

    // --- PASS ONE - item-level and fulfillment-level rewards ---
    //
    // CFML parity [model/service/PromotionService.cfc:L167]: the legacy
    //   `for(var pr=1; pr<=arrayLen(promotionRewards); pr++)`
    // is 1-based over a CFML array; this is an idiomatic 0-based traversal in the same ascending
    // order, and `entries()` supplies the index the final-element test needs without an indexed
    // element read - so nothing is asserted, no `!` and no `as` appears, and the reward is a
    // `PromotionReward` rather than a possibly-absent one.
    for (const [index, reward] of promotionRewards.entries()) {
      // [model/service/PromotionService.cfc:L169] `var reward = promotionRewards[pr];` - the
      // binding whose survival past L465 is register entry 9's mechanism. Recorded on every visit
      // so that what survives this method is the last reward actually processed.
      lastProcessedRewardID = reward.getPromotionRewardID();

      // The caller's block: the ledger initialisation [L172-L189], the memo populate [L192-L194],
      // the gate evaluation [L197] and the facade's reward-level branch bodies. Awaited before the
      // next reward - the ledger it mutates is mutated in place.
      const outcome: RewardVisitOutcome = await onReward(reward, orderRewards);

      // [model/service/PromotionService.cfc:L197] the gate, which closes at L463. Reproduced HERE
      // as an enclosing condition rather than merged into the reset test, because the source NESTS
      // the reset inside it and that nesting IS EDGE OUTCOME 2.
      if (outcome.qualificationsMeet) {
        // [model/service/PromotionService.cfc:L457] This forces the loop to repeat looking for
        // "order" discounts.
        //
        // [L458] `if(!orderRewards and pr == arrayLen(promotionRewards)) {` - the compound
        // condition reproduced in full. `!orderRewards` is retained deliberately even though pass
        // one is the only place this site is reached: it carries the exactly-two-passes proof
        // above.
        //
        // CFML parity [model/service/PromotionService.cfc:L459]: `pr = 0` does not skip an element.
        // It relies on the `pr++` increment firing immediately afterwards, so `pr` becomes `1` -
        // the FIRST element of a 1-based CFML array - so the reset restarts the traversal rather
        // than resuming it, which is why pass two below is a fresh traversal and not a
        // continuation.
        if (!orderRewards && index === rewardCount - 1) {
          // [model/service/PromotionService.cfc:L460] `orderRewards = true;` - the only assignment
          // to the flag, and it is never undone.
          orderRewards = true;
        }
      }
      // [model/service/PromotionService.cfc:L463] END Promotion Period OK IF.
    }
    // [model/service/PromotionService.cfc:L465] END of PromotionReward Loop.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L197, L458-L461]: both EDGE OUTCOMES
    // from the header are encoded by this guard, and there is no third - an EMPTY collection leaves
    // `rewardCount` at 0 so the L458 condition is never evaluated, and the LAST reward's period
    // FAILING qualification leaves the reset unreached inside the L197 gate that closes at L463.
    // Either way the flag stays `false` and PASS TWO NEVER RUNS.
    if (orderRewards) {
      // --- PASS TWO - order-level rewards ---
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L200, L415, L459]: pass two is a COMPLETE
      // RE-TRAVERSAL of the same collection in the same order, not a continuation of pass one.
      // Because L459's `pr = 0` plus `pr++` lands on element 1, the legacy loop walks the entire
      // array again with `orderRewards == true`, which changes which arm can execute rather than
      // where the walk starts: the item arm at L200 and the fulfillment arm at L345 are blocked by
      // their own `!orderRewards` guards, leaving the order arm at L415 - guarded on `orderRewards`
      // - as the only reward-level branch that can run. Blocking is structural, in the caller's
      // guards, and this module adds no filter of its own.
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L417]: pass two depends on the output of
      // BOTH of pass one's arms, because the order arm's first statement sums
      // `getSubtotalAfterItemDiscounts()` and `getFulfillmentChargeAfterDiscountTotal()` - a value
      // that only exists once ITEM discounts have been applied and one that only exists once
      // FULFILLMENT discounts have been applied. That is why pass two must follow the WHOLE of pass
      // one rather than only its item arm.
      for (const reward of promotionRewards) {
        // [model/service/PromotionService.cfc:L169] again - the same binding, on the same elements,
        // in the same order.
        lastProcessedRewardID = reward.getPromotionRewardID();

        // The gate is still evaluated per reward by the caller in pass two [L197] and its outcome
        // is still reported, but the reset is unreachable now because `!orderRewards` is
        // permanently `false`, so the outcome is deliberately not consumed here.
        await onReward(reward, orderRewards);
      }
    }

    return { lastProcessedRewardID };
  }
}
