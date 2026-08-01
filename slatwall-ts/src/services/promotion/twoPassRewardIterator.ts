// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file therefore
// names modules of the target layout that DO NOT EXIST YET. Every such name carries
// `(planned)` at its point of use, meaning exactly: a planned Agent Action Plan
// target that is ABSENT from the subtree at this checkpoint. Nothing here asserts
// that any of them exists now, and no behaviour in this file depends on one. The
// complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts                              composition root (wiring)
//   src/handlers/promotionApplicationHandler.ts             orders the two service passes
//   src/services/promotionService.ts                       the facade that calls this module
//   src/services/priceGroupService.ts                       the pass that MUST run first
//   src/services/promotion/salePriceSeeding.ts             sibling decomposition module
//   src/services/promotion/promotionPeriodQualification.ts  sibling decomposition module
//   src/services/promotion/qualifierQualification.ts        sibling decomposition module
//   src/services/promotion/promotionApplication.ts          sibling decomposition module
//   tests/unit/services/promotion                          this module's net-new suite
//
// ★ THIS MODULE IMPORTS NONE OF THEM, AND NONE OF ITS FOUR EXISTING SIBLINGS EITHER.
// The sibling-import count is ZERO by construction, not by checkpoint accident: the
// three anchors this module owns - the reward fetch [model/service/PromotionService.cfc:L165],
// the pass flag [L166] and the traversal [L167] together with its reset [L458-L461] -
// reference no other extracted block. Everything the loop BODY does belongs to the
// facade or to a sibling, and reaches this module through a callback parameter rather
// than through an import. So this file is a proven LEAF: it imports no sibling, it
// never imports the facade back, and it closes no cycle. The folder's import
// constraint is directional - the facade may import the nine; nothing in the nine may
// import the facade.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// slatwall-ts - The two-pass promotion-reward iteration mechanism
//
// PORTED FROM: `model/service/PromotionService.cfc`, the reward-collection fetch and
// the hand-rolled two-pass iteration inside
// `public void function updateOrderAmountsWithPromotions(required any order)` [L58]:
//
//   L164        the source comment introducing the loop
//   L165        the DAO call - three KEYWORD arguments, `qualificationRequired=true`
//   L166        `var orderRewards = false;` - the pass flag
//   L167        `for(var pr=1; pr<=arrayLen(promotionRewards); pr++) {` - the traversal
//   L169        `var reward = promotionRewards[pr];` - the binding that LEAKS
//   L457-L461   the loop-counter reset that manufactures the second pass
//   L465        the close of the reward loop
//
// with L197 (the qualification gate) and L463 (its close) as load-bearing context that
// this module does not own but must not lose - see EDGE OUTCOME 2 below.
//
// ★ THIS MODULE OWNS ORDER-DEPENDENCE VECTOR 2 - the hand-rolled two-pass loop
// implemented by mutating the loop counter. THE FOLDER RECOGNISES EXACTLY SIX
// order-dependence vectors, each of which can change the money a customer is charged:
// the AAP publishes five, and the sixth - the ledger ratchet at
// [model/service/PromotionService.cfc:L223-L224] - was discovered during folder
// analysis, is attributed as a discovery rather than as a published finding, and is
// owned by `./rewardUsageLedger.ts`. Vector 2 is this file's, and this file claims no
// other.
//
// ★ MUST-PRESERVE AREA #1 (AAP 0.8.1): promotion discount math together with
// use-limit enforcement semantics. Running pass two when the legacy code would not -
// or skipping it when the legacy code would run it - changes the amount charged.
// Nothing in this file may be tidied on aesthetic grounds.
//
// ---------------------------------------------------------------------------
// THE MECHANISM, AND WHY IT IS NOT TRANSLITERATED
//
// The legacy author needed item-level and fulfillment-level rewards processed FIRST
// and order-level rewards SECOND. Rather than write two loops, they wrote one loop and
// mutated its counter: on reaching the last element during the first pass, `pr` is set
// to `0` and the pass flag flips, so the `pr++` increment produces `pr = 1` and the
// entire collection is traversed again.
//
// The Minimal Change Clause scopes the FUNCTIONAL SURFACE, not the code style:
// idiomatic TypeScript is required, and a line-for-line CFML transliteration would
// violate the directive rather than satisfy it. Reproducing `pr = 0` literally - a
// mutated loop index, 1-based emulation - is exactly the transliteration that is
// forbidden. But a "clean two-pass rewrite" that loses either edge outcome below
// breaks behaviour preservation. BOTH constraints are satisfied here, by two literal
// sequential traversals gated on a flag that can be set at most once.
//
// ★★ EXACTLY TWO EDGE OUTCOMES EXIST, BOTH ARE LOAD-BEARING, AND THERE IS NO THIRD.
// Both are encoded deliberately below rather than left to emerge:
//
//   OUTCOME 1 - AN EMPTY REWARD COLLECTION MEANS PASS TWO NEVER RUNS.
//   `arrayLen(promotionRewards)` is `0`, so the L167 loop body never executes, so the
//   L458 condition is never evaluated, so no reset occurs. A naive "always run two
//   passes" rewrite would run an empty second pass and change behaviour in anything
//   that observes the pass having occurred.
//
//   OUTCOME 2 - THE LAST REWARD'S PROMOTION PERIOD FAILING QUALIFICATION ALSO MEANS
//   PASS TWO NEVER RUNS. The L458-L461 reset sits INSIDE the L197 qualification gate,
//   which closes at L463. If the final element's period does not qualify, control never
//   reaches L458. This is the harder consequence and the one most easily lost in a
//   clean rewrite, so the reset below is nested inside the gate report exactly as the
//   source nests it inside the gate.
//
// A single-element collection collapses into these two - the period qualifies and there
// are still exactly two passes, or it does not and Outcome 2 holds. No third case is
// fabricated.
//
// ---------------------------------------------------------------------------
// ★ NOT APPLICABLE HERE, STATED SO THE OMISSIONS ARE NOT READ AS OVERSIGHTS:
//
//   * NO MONETARY VALUE IS HANDLED, so the closed `Money` surface is not touched and
//     `../../domain/valueObjects/money.js` is deliberately not imported. The only
//     numbers in this module's range are the collection length and a traversal index,
//     and both are plain integer counts. NO raw floating-point operation on a monetary
//     value appears anywhere in this file, because no monetary value appears at all.
//     The discount arithmetic lives in `./discountAmount.ts`.
//   * NO SQL, PARAMETERIZED OR OTHERWISE. This module runs no queries and holds no
//     statement text; it calls a repository PORT. Every statement in the target lives
//     in `src/repositories/mysql/**`, where prepared statements are used exclusively,
//     preserving the injection-safety semantics that `cfqueryparam` gave the legacy
//     `<cfquery>` bodies. There is nothing to parameterize in this file.
//   * NO LEDGER. This module neither creates, reads nor mutates the reward-usage
//     ledger or the qualified-discount accumulator. It does not import
//     `../../domain/promotionEngine/*.js` and owns no engine struct.
//   * NO SETTINGS AND NO AMBIENT SCOPE. It reads no setting, takes no settings
//     provider and takes no request context. It does not import `../../lib/config.ts`,
//     which is static process configuration and must never be used as a request scope.
//   * NO MODULE-LEVEL MUTABLE STATE. The pass flag, the fetched collection, the
//     traversal index and the last-processed reward identifier are ALL per-invocation
//     locals. There is no module-level `let`, no cache, no counter and no memo, and the
//     fetched collection is never stored on the instance. On a warm container a
//     module-level or instance-level binding survives between UNRELATED invocations -
//     the instance itself is constructed once in `src/handlers/bootstrap.ts` (planned) -
//     so holding reward state there could let one customer's discount answer another
//     customer's order. That is a CORRECTNESS property. The subtree's single documented
//     exception is the connection pool in `src/repositories/mysql/connection.ts`, an
//     engineering decision about connection reuse and not a performance target.
//   * NO CONCURRENCY. The two passes are strictly ordered and the ledger the callback
//     mutates is mutated in place, so the traversals are sequential. No `Promise.all`
//     over rewards, no `worker_threads`, no parallelism of any kind. A census of the
//     in-scope slice found ZERO `cfthread` usages, so the `cfthread`-to-worker-threads
//     translation rule is recorded and deliberately unexercised.
//   * NO LOGGING. The legacy block emits nothing, and neither does this module.
//   * NO NUMBERED DEFECT REGISTER ENTRY IS OWNED HERE, so this file ships no
//     `LEGACY-DEFECT` marker at all. The register holds 30 numbered entries plus eight
//     secondary items; entry 9 is owned by `./overUseStripping.ts`, and this module
//     owns only the hand-off contract that makes entry 9 faithfully reproducible - see
//     the leaked-reward note on `TwoPassRewardIterationResult`.
//   * NO PER-FILE LICENSE HEADER. GPL v3.0 attribution is carried forward centrally in
//     `slatwall-ts/NOTICE-GPL.md`.
//
// ★ THIS MODULE'S COVERAGE IS NET-NEW, AND MUST NEVER BE PRESENTED AS PARITY.
// There is no legacy antecedent to trace it to. `meta/tests/unit/service/` holds only
// AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest,
// and not one of the four is in scope; `meta/tests/unit/dao/` holds only AccountDAOTest
// and PaymentDAOTest. All nine modules in this folder are in the same position, so
// coverage here is declared NET-NEW (AAP 0.6.6). The suite belongs to
// `tests/unit/services/promotion` (planned), where characterization tests pin current
// behaviour including every preserved defect and one golden-fixture test drives the
// whole pipeline end to end so the decomposition cannot silently change an outcome. NO
// TEST FILE IS AUTHORED FROM THIS MODULE'S TASK.
//
// This file asserts no service-level objective and no latency, throughput, uptime or
// availability figure of any kind, because the legacy system declares none and none may
// be invented (AAP 0.8.1). The legacy 60-second order-placement, 45-second
// payment-transaction and 30-second dependency-injection first-scan lock timeouts are
// noted and deliberately NOT implemented; the first-scan lock disappears as a
// STRUCTURAL CONSEQUENCE of explicit constructor injection (T1) rather than as a
// saving. Where a decision below is justified, it is justified on CORRECTNESS,
// DETERMINISM or READABILITY grounds and never on speed.
// ---------------------------------------------------------------------------

// LEGACY-NOTE [model/service/PromotionService.cfc:L165-L167, L458-L461]: this module's
// cited range was reconciled from two disagreeing specifications before a line was written.
// The AAP's Promotion Engine Decomposition table cites the module as `L166 + L458-L461`; the
// folder specification additionally and explicitly assigns L165 (the DAO call, with its
// keyword-argument shape and `qualificationRequired=true`) and L167 (the reward loop). The
// SOURCE plus the more specific folder specification win, so this module owns FOUR anchors:
// L165, L166, L167 and L458-L461. Owning L165 is what makes the iteration entry point `async`
// and what gives this class its `promotionRepository` port; without it the module would be a
// pure function and the fetch would have no home. Recorded rather than re-litigated.

// LEGACY-NOTE [model/service/PromotionService.cfc:L454-L461]: the reset region's placement was
// corrected against the source, and the correction changes which lines a reviewer diffs.
// Some briefs cite the region as beginning at L454. It does not: L454 is
// `} // ============= END ALL REWARD TYPES`, the closing brace of the chained reward-arm
// construct, L455 and L456 are whitespace, L457 carries the explanatory comment "This forces
// the loop to repeat looking for 'order' discounts", L458 is the `if`, L459 and L460 are its
// two assignments, and L461 closes the block. Verified by reading the source; where the source
// and a brief disagree the SOURCE WINS.

// LEGACY-NOTE [model/service/PromotionService.cfc:L200-L341, L345-L412, L415-L455]: the three
// reward-level branch bodies are FACADE-OWNED and are not reproduced in this file.
// Verified boundaries, so that any comment written here about them is accurate: the order-item arm
// opens at L200 with `if( !orderRewards and listFindNoCase("merchandise,subscription,contentAccess",
// reward.getRewardType()) )` and its order-item loop closes at L341, five nested gate levels deep;
// the fulfillment arm carries its banner at L344, opens at L345 with
// `} else if (!orderRewards and reward.getRewardType() eq "fulfillment" )` and closes at L412, four
// levels deep - and its L406 closing brace carries no label while its three siblings at L408, L410
// and L412 do, a wart the facade annotates rather than normalises; the order arm carries its banner
// at L414 and opens at L415 with `} else if (orderRewards and reward.getRewardType() eq "order" )`,
// computing `totalDiscountableAmount` at L417. The chained construct closes at L454. This module
// reproduces only the ITERATION MECHANISM and hands each reward to a callback so the caller can
// dispatch; the order-item arm's five gate levels run outer to inner - sale-item type, then
// fulfillment-in-qualified-list, then qualification count greater than zero, then item-in-reward -
// each short-circuiting the ones inside it, and they must never be reordered.

// LEGACY-NOTE [model/service/PromotionService.cfc:L61, L542]: the two order-type gates are
// SEQUENTIAL `if` statements, not an `if`/`else if` pair, and both are facade-owned.
// L61 tests `listFindNoCase("otSalesOrder,otExchangeOrder", ...)` and closes at L539; L542 then
// opens a SEPARATE `if` testing `listFindNoCase("otReturnOrder,otExchangeOrder", ...)`, so
// `otExchangeOrder` appears in BOTH and an exchange order runs both blocks. Refactoring the pair
// into `if`/`else` or a `switch` would silently drop one of those two executions. By deliberate
// contrast the three reward-level arms at L200, L345 and L415 ARE a chained `else if` construct;
// the two situations must not be conflated. Neither belongs to this module - recorded so that no
// module re-invents the distinction.
// The BODY of the L542 gate, at L542-L544, is the `issue #1766` return/exchange no-op, and the
// facade ports it verbatim - source typos `isn't import` and `ordersItems` included - under the
// TODO carry-forward rule. The three backwards clear-out loops at L64-L68, L71-L75 and L78-L80 are
// facade territory on the same footing. This module absorbs none of the four and authors no test
// for any of them; the omission is deliberate and is recorded here so it cannot read as an
// oversight.

// LEGACY-NOTE [model/service/PromotionService.cfc:L192-L194, L197]: ★ `./promotionPeriodQualification.ts`
// (planned) is deliberately NOT imported here, and neither is any other sibling in this folder.
// L192-L193 lazily populates the period-qualification memo by calling
// `getPromotionPeriodQualificationDetails(promotionPeriod=..., order=...)`, and L197 reads
// `.qualificationsMeet` off that memo. Both fall OUTSIDE this module's cited range of L165-L167 and
// L458-L461, so both are the CALLER's responsibility: this module neither owns the memo, nor
// populates it, nor evaluates the gate. What it does own is the gate's CONSEQUENCE - the L197 gate
// closes at L463 and therefore encloses the L458-L461 reset, which is precisely why EDGE OUTCOME 2
// exists - so the gate outcome is reported back per reward through {@link RewardVisitOutcome}
// instead of being computed here. Importing the sibling would move a caller obligation into this
// module and create the first sibling edge in a folder that has none.

import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import type { PromotionRepository } from '../../domain/ports/promotionRepository.js';
import type { OrderView } from '../../domain/views/orderView.js';

// JUDGMENT CALL: the three imports above are the complete dependency set, and every other
// candidate was considered and rejected on evidence rather than left unmentioned.
// `../../lib/cfml/list.js` is NOT imported: L165's `rewardTypeList` is a LITERAL STRING ARGUMENT
// passed straight through to the port, not a list operation, so none of that module's five exports
// - `listLen`, `listGetAt`, `listAppend`, `listToArray`, `listFindNoCase` - is reached, and the
// splitting of the list happens inside the adapter that binds it. `../../lib/cfml/precision.js` and
// `../../lib/cfml/numberFormat.js` are NOT imported: the in-scope slice has NINE
// `precisionEvaluate` sites - L150, L252, L299, L486, L990, L995, L1001, L1006 and L1007 - and not
// one of them falls in L165-L167 or L458-L461, and there is no `numberFormat` site in range either.
// `../../lib/cfml/struct.js` and `../../lib/cfml/truthiness.js` are NOT imported: the
// `structKeyExists` guards at L172 and L192 belong to `./rewardUsageLedger.ts` and to the caller
// respectively, and this module tests no CFML truthiness - the only boolean it reads is a reported
// gate outcome. `../priceGroupService.ts` (planned) appears in the ordering documentation on
// {@link TwoPassRewardIterator.iterate} and is deliberately NOT imported, because documenting an
// ordering requirement is not the same as depending on the module that satisfies it.

// JUDGMENT CALL: this module hosts NO legacy method signature, so its new signature spends nothing
// from any budget - and stating that explicitly is the point, so that no reviewer miscounts one.
// The block being extracted is INLINE CODE inside `updateOrderAmountsWithPromotions` [L58]: L165 is
// a local variable assignment, L166 a local flag, L167 a `for` header and L458-L461 an `if` body.
// There is no CFML function declaration anywhere in the range, therefore no CFML parameter list to
// preserve, therefore nothing that the prohibition on adding, removing, reordering or defaulting a
// parameter can bite on. Concretely: ZERO visibility widenings are consumed here - the project's
// five-slot ledger is fully exhausted, with three spent in `./promotionPeriodQualification.ts`
// (planned), one in `./qualifierQualification.ts` (planned) and one in `./discountAmount.ts` - and
// ZERO signature widenings and ZERO signature reshapings are consumed, both of those ledgers
// standing at zero remaining project-wide. No legacy identifier is displaced either: the class name
// below is descriptive and new, consistent with the folder's `OrderItemMembership`,
// `RewardUsageLedger`, `DiscountAmountCalculator` and `stripOverUsedRewardDiscounts`, and it
// renames nothing - `updateOrderAmountsWithPromotions` stays on the facade, and the legacy local
// names `promotionRewards`, `orderRewards` and `reward` are carried over verbatim inside the
// implementation. The folder ships no lint naming-convention rule precisely because ported method
// names are preserved in CFML camelCase; this module ports no method name.

// JUDGMENT CALL: the CFML KEYWORD-ARGUMENT call at L165 becomes a POSITIONAL call, and the port is
// what forces that - not a preference.
// `../../domain/ports/promotionRepository.js` declares
// `getActivePromotionRewards(rewardTypeList: string, promotionCodeList: string,
// qualificationRequired?: boolean): Promise<PromotionReward[]>`, in the legacy declaration order
// [model/dao/PromotionDAO.cfc:L52-L54], with the legacy `default="false"` [L54] recorded in prose
// rather than written as a default value because that port module emits no runtime JavaScript.
// Ports are locked at thirteen and the promotion port at seven members, so the port is authoritative
// for the CALL SHAPE while the source stays authoritative for the ARGUMENT VALUES; reconciled here
// with a note rather than by editing the port, adding a fourteenth port, or adding a member.

/**
 * What the caller reports back about ONE reward it was handed.
 *
 * The single member mirrors the legacy gate read at
 * [model/service/PromotionService.cfc:L197] -
 * `promotionPeriodQualifications[ ... ].qualificationsMeet` - and carries that struct member's
 * spelling verbatim, so a reviewer diffing against the source sees the same word. It is NOT a
 * member of any published type in `../../domain/promotionEngine/`: nothing there is redeclared,
 * extended or shadowed by this file. It is a small named result type belonging to the exported unit
 * below, which is why it lives here.
 *
 * WHY THE ITERATOR NEEDS THIS AT ALL. The reset at L458-L461 sits inside the L197 gate, which
 * closes at L463, so the reset is reachable only when a reward's promotion period qualified. The
 * iterator does not evaluate that gate - see the note above on why
 * `./promotionPeriodQualification.ts` (planned) is not imported - so the caller must tell it the
 * outcome, one reward at a time. That is the whole purpose of this type, and EDGE OUTCOME 2 is what
 * depends on it.
 *
 * @see {@link RewardVisitor} for the callback that returns this.
 */
export interface RewardVisitOutcome {
  /**
   * Whether the reward's promotion period met its general use-count qualification -
   * [model/service/PromotionService.cfc:L197].
   *
   * `true` means control entered the gate for this reward, so the facade's reward-level branch bodies
   * ran and the L458-L461 reset is reachable for it. `false` means control skipped straight to L463,
   * so nothing ran for this reward and no reset can occur on it. Reported, never validated: this
   * module adds no check that the caller populated the memo first, because the legacy code has none.
   */
  readonly qualificationsMeet: boolean;
}

// LEGACY-NOTE [model/service/PromotionService.cfc:L169-L197]: the caller carries three obligations
// that this module DOCUMENTS and deliberately does NOT ENFORCE.
// Between the traversal head at L167 and the gate at L197 the legacy body does three things that
// fall outside this module's cited range, and each stays with the caller: it initialises the
// reward-usage ledger entry [L172-L189], which is `./rewardUsageLedger.ts`'s block; it lazily
// populates the period-qualification memo [L192-L194] before the gate reads it; and it evaluates
// the gate itself [L197] and reports the outcome back per reward through
// {@link RewardVisitOutcome} so the reset condition can honour EDGE OUTCOME 2. There is no runtime
// check, no assertion and no flag in this file verifying that any of the three happened -
// manufacturing state the legacy code does not have would be added validation, which is forbidden.
// The caller is the facade, `src/services/promotionService.ts` (planned).

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
 * queries. So the callback's return type admits both a promise and a plain value, and the iterator
 * awaits it either way. A synchronous caller is not forced to wrap its result.
 *
 * @param reward One reward from the fetched collection, in the order the collection arrived -
 *   [model/service/PromotionService.cfc:L169] `var reward = promotionRewards[pr];`.
 * @param isOrderRewardsPass The legacy `orderRewards` flag [L166] as the source would see it on
 *   this visit: `false` throughout pass one and `true` throughout pass two. It is what the three
 *   reward-level guards at L200, L345 and L415 test, so the caller must pass it through to them
 *   unchanged - the item and fulfillment arms guard on `!orderRewards` and the order arm on
 *   `orderRewards`, which is what makes the order arm the only reachable arm in pass two.
 * @returns The gate outcome for this reward, awaited by the iterator.
 */
export type RewardVisitor = (
  reward: PromotionReward,
  isOrderRewardsPass: boolean,
) => Promise<RewardVisitOutcome> | RewardVisitOutcome;

// LEGACY-NOTE [model/service/PromotionService.cfc:L169, L472, L475, L476, L477]: ★★★ the
// last-processed reward identifier is surfaced SOLELY so that register entry 9 can be reproduced
// faithfully - never to repair it.
// L169's `var reward = promotionRewards[pr];` is bound inside the loop but, CFML function scope
// having no block scoping, it survives the loop's close at L465. The over-use stripping block that
// begins at L468 then iterates `for(var prID in promotionRewardUsageDetails)` while reading
// `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]` at L472, L475, L476 and L477 - so
// maximum-use-per-order is enforced against whichever reward happened to be LAST, for every key in
// the ledger. That is register entry 9, it is PRESERVED, and repairing it changes the amount
// charged. The target has no leaked function scope, so the identity must travel explicitly: this
// module owns the loop, so this module surfaces it, and `./overUseStripping.ts` receives it as its
// required `leakedLastProcessedRewardID` argument. The hand-off is the mechanism of faithful
// reproduction, not a fix.

// LEGACY-NOTE [model/service/PromotionService.cfc:L172-L189]: the ledger initialisation block
// belongs to `./rewardUsageLedger.ts`, and it is referenced here for exactly one reason - its
// POSITION.
// It sits BEFORE the L197 gate, so it runs for EVERY reward the traversal encounters, qualified or
// not. That is the safety proof for the identifier above: the ledger is non-empty if and only if at
// least one reward was processed, which is exactly the condition under which the legacy `reward`
// variable is bound. When the collection is empty the ledger is empty too and the stripping block's
// loop body never runs, so the identifier is never read. The identifier is therefore typed as a
// plain `string` with NO undefined branch, NO null check and NO fallback, and the caller must not
// wrap the stripping call in a new conditional - both would be added validation. When the collection
// is empty the caller may legitimately hand on the empty string.

/**
 * What one full invocation of the iteration reports back.
 *
 * EXACTLY ONE MEMBER, AND THE OMISSIONS ARE DELIBERATE. There is no pass-two-ran flag, no pass
 * count, no visited count and no collection length here. The legacy block publishes none of them,
 * and an assertion that pass two ran is explicitly the kind of state that must not be invented; a
 * caller that wanted to branch on it would be writing a check the source does not have. The single
 * member is the one value the legacy code genuinely leaks across the loop boundary.
 */
export interface TwoPassRewardIterationResult {
  /**
   * The `promotionRewardID` of the LAST reward this invocation processed -
   * [model/service/PromotionService.cfc:L169] made explicit.
   *
   * A plain `string`, never optional, for the reason proved in the note above. The EMPTY STRING when
   * the fetched collection was empty, which is precisely the case in which the reward-usage ledger
   * is also empty and `./overUseStripping.ts` therefore never reads it. Hand it straight to
   * `stripOverUsedRewardDiscounts` as its `leakedLastProcessedRewardID` argument, unguarded.
   *
   * Note which reward this is after a two-pass invocation: pass two re-traverses the whole
   * collection, so the value that survives is the final element as seen by pass two - the same
   * element pass one ended on, which is what the legacy single mutated loop also leaves bound.
   */
  readonly lastProcessedRewardID: string;
}

// LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L165-L465, L468-L521, L524-L537]: the
// intra-folder execution order is DOCUMENTED here and ENFORCED nowhere.
// The legacy method runs four blocks in a fixed sequence, and the decomposition preserves it:
// sale-price seeding [L145-L162] in `./salePriceSeeding.ts` (planned), then the two-pass reward
// iteration [L165-L465] in this module together with the facade-owned branch bodies, then over-use
// stripping [L468-L521] in `./overUseStripping.ts`, then best-discount application [L524-L537] in
// `./promotionApplication.ts` (planned). Sequencing is the facade's responsibility: this module adds
// no runtime check, no ordering flag, no assertion and no sequence counter, because the legacy code
// carries none and inventing one would be added validation.

/**
 * The two-pass promotion-reward iteration mechanism - ORDER-DEPENDENCE VECTOR 2.
 *
 * Fetches the active reward collection [model/service/PromotionService.cfc:L165] and traverses it
 * TWICE in a fixed order, handing each reward to a caller-supplied visitor along with the pass flag
 * [L166] that the facade's three reward-level guards test. It reproduces the legacy loop-counter
 * reset [L457-L461] without reproducing the loop-counter mutation, and it reproduces both of the
 * mechanism's edge outcomes deliberately. It owns no branch body, no ledger and no memo.
 *
 * ★★★ THE CROSS-SERVICE ORDERING CONSTRAINT - THE ONE DEPENDENCY THE LEGACY CODE LEAVES IMPLICIT.
 * `PriceGroupService.updateOrderAmountsWithPriceGroups()`
 * [model/service/PriceGroupService.cfc:L364-L375] MUST RUN BEFORE
 * `PromotionService.updateOrderAmountsWithPromotions()` [model/service/PromotionService.cfc:L58].
 * The price-group pass writes each order item's price and applied price group
 * [model/service/PriceGroupService.cfc:L370-L371]; the promotion pass then READS that state when it
 * chooses the base price a discount is computed against [model/service/PromotionService.cfc:L241-L252]:
 *
 *   * the `if` branch [L241] - taken when there is NO applied price group, OR when the reward has
 *     the applied price group as an ELIGIBLE one - computes the discount from `getPrice()` [L244],
 *     with NO correction term; and
 *   * the `else` branch [L246] - taken when a price group IS present AND the item is INELIGIBLE -
 *     computes from `getSkuPrice()` [L249] and then applies the L252 correction
 *     `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`.
 *
 * That orientation is taken from the source and is authoritative. Some briefs transpose the two
 * branches, and implementing the transposed version inverts the discount on every price-group order.
 * In the legacy system the ordering held ONLY because the out-of-scope `OrderService` happened to
 * call the two services in that sequence; in the target it is stated explicitly and
 * `src/handlers/promotionApplicationHandler.ts` (planned) orders the two passes, with
 * `../priceGroupService.ts` (planned) running first. A test in the net-new suite asserts that
 * reversing them changes the computed discount; no test file is authored from this module.
 *
 * ★ NOTHING BELOW ENFORCES ANY OF THAT. There is no runtime check, no ordering flag and no
 * assertion for the cross-service constraint, for the intra-folder order, or for the caller
 * obligations. Documented, never policed.
 *
 * DEPENDENCY INJECTION IS EXPLICIT AND SINGULAR (T1). The one collaborator arrives as a `readonly`
 * constructor parameter typed to a PORT INTERFACE, wired once in `src/handlers/bootstrap.ts`
 * (planned). This replaces the legacy runtime bean-factory convention scan over
 * `property name="xService";` declarations - `PromotionService` declares exactly three of them,
 * `promotionDAO` [model/service/PromotionService.cfc:L51], `addressService` [L53] and
 * `roundingRuleService` [L54] - and it replaces the `getService("xService")` locator calls with a
 * graph a compiler can check. No service locator, no dependency-injection container package, no
 * runtime scan; the scan's first-scan lock disappears as a structural consequence.
 *
 * THIS CLASS IS STATELESS BETWEEN INVOCATIONS. It holds the port and nothing else - no fetched
 * collection, no pass flag, no counter, no cache. See the header on why that is a correctness
 * requirement on a warm container rather than a style preference.
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
   * else here is asynchronous, and no helper is made asynchronous for consistency.
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
   * @param order The read-only order view. Read for exactly one value - its promotion-code list, for
   *   L165's second argument. NEVER MUTATED, and no order persistence is written from this module.
   * @param onReward The per-reward visitor. Invoked once per reward per pass, sequentially, and
   *   awaited before the next reward is visited.
   * @returns The last-processed reward identifier, for the register-entry-9 hand-off.
   */
  async iterate(order: OrderView, onReward: RewardVisitor): Promise<TwoPassRewardIterationResult> {
    // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: ★★ `getActivePromotionRewards` applies NO
    // `ORDER BY`, and THE ABSENCE IS PRESERVED.
    // Verified by census rather than asserted: a case-insensitive search for "order by" across the
    // whole of `model/dao/PromotionDAO.cfc` returns ZERO OCCURRENCES - not in this function, not in the
    // other five, not anywhere in the file - and the function ends by handing back
    // `ormExecuteQuery(hql, params)` [L131] under `returntype="Array"` [L51]. Iteration order is
    // therefore whatever the engine returns, and because the traversal below threads a mutable usage
    // ledger through it [model/service/PromotionService.cfc:L297], WHICH reward is allowed depends on
    // WHICH earlier rewards ran: the legacy behaviour is genuinely non-deterministic at the boundary of
    // a tie, and that non-determinism is Vector 1, owned by `./rewardUsageLedger.ts`. This module must
    // not sort the collection, must not assume an order, must not suggest one, and must not permit
    // `promotionRepository.getActivePromotionRewards` to acquire one - the port already carries its own
    // marker saying so. Reproducibility of the legacy outcome is the reason; nothing here is a claim
    // about speed.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L1040]: TWO DISTINCT CALL SHAPES REACH THE
    // SAME DAO METHOD, and they must NOT be normalised into one.
    // L165 - this module's call - passes all three arguments and states `qualificationRequired=true`
    // explicitly. L1040, inside the facade's shipping-method-option path, calls
    // `getActivePromotionRewards( rewardTypeList="fulfillment", promotionCodeList=...
    // .getOrderFulfillment().getOrder().getPromotionCodeList() )` and OMITS `qualificationRequired`
    // entirely, relying on the DAO's own `default="false"` [model/dao/PromotionDAO.cfc:L54]. Both
    // branches of that flag are live, so no shared wrapper is introduced, no default is added that
    // would make the two shapes identical, and neither site is rewritten in terms of the other. A
    // reviewer diffing against the source must see two distinct call shapes.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L165, L200, L714, L794]: the reward-type comma
    // list appears at three sites in three different forms, and each literal stays exactly where and
    // as it is written.
    // L165 - here - uses the FIVE-token `"merchandise,subscription,contentAccess,order,fulfillment"`;
    // L200 and L794 use the three-token `"merchandise,subscription,contentAccess"`; and L714 uses
    // `"contentAccess,merchandise,subscription"`, the same three tokens in a DIFFERENT ORDER. Verified
    // against the source. No shared constant is extracted, no token order is normalised or sorted, and
    // no literal is built from another, so that a reviewer sees the same strings in the same places.
    // Only L165 lives in this module; the others belong to `./qualifierQualification.ts` (planned),
    // `./promotionPeriodQualification.ts` (planned) and the facade.

    // [model/service/PromotionService.cfc:L164] Loop over all Potential Discounts that require
    // qualifications.
    //
    // [L165] The three argument VALUES are reproduced exactly: the five-token reward-type list in
    // source order, the order's promotion-code list, and `qualificationRequired` explicitly `true`.
    // The keyword-to-positional reconciliation is recorded above. The result is typed
    // `readonly PromotionReward[]` because the legacy collection is NEVER MUTATED anywhere inside
    // the loop - no append, no delete, no reassignment - and the type is where that fact is best
    // stated. No sort, no de-duplication, no ordering assumption is applied to it, here or below.
    const promotionRewards: readonly PromotionReward[] =
      await this.promotionRepository.getActivePromotionRewards(
        'merchandise,subscription,contentAccess,order,fulfillment',
        order.promotionCodeList,
        true,
      );

    // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L458]: `arrayLen(promotionRewards)` is
    // re-evaluated on every loop-condition check AND again inside the reset condition; the bound is
    // captured ONCE here instead.
    // The two are equivalent because the collection is never mutated during iteration, as the
    // `readonly` type above records, so every re-evaluation in the source returns the same number.
    // Capturing it once names the value the reset condition actually depends on and lets the
    // final-element test below read as a single comparison rather than as a repeated call. That is a
    // determinism and readability judgment and nothing else.
    const rewardCount: number = promotionRewards.length;

    // [model/service/PromotionService.cfc:L169] made explicit. Per-invocation local, never instance
    // or module state. The EMPTY STRING is the value that survives an empty collection - see the
    // safety proof on {@link TwoPassRewardIterationResult.lastProcessedRewardID}; it is not a
    // fallback and not a sentinel for "missing", because in that case nothing ever reads it.
    let lastProcessedRewardID = '';

    // [model/service/PromotionService.cfc:L166] `var orderRewards = false;` - the legacy identifier
    // carried over verbatim. Per-invocation local.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L458-L461]: ★ THE EXACTLY-TWO-PASSES PROOF,
    // encoded rather than inherited.
    // L458's condition is compound - `!orderRewards and pr == arrayLen(promotionRewards)` - and
    // L460 sets `orderRewards = true` inside the body it guards. After that assignment
    // `orderRewards` is `true` for the remainder of the invocation, because NOTHING anywhere in the
    // method ever clears it, so `!orderRewards` is permanently `false` and L458 short-circuits on
    // every subsequent evaluation. At most ONE reset can therefore ever occur, which yields EXACTLY
    // TWO passes and never three. Below, that proof is structural rather than incidental: the flag
    // is assigned at exactly one site, only from `false` to `true`, and pass two contains no reset
    // site at all - so a third pass is not merely unreached, it is unexpressible.
    let orderRewards = false;

    // ============ PASS ONE - item-level and fulfillment-level rewards ============
    //
    // CFML parity [model/service/PromotionService.cfc:L167]: the legacy `for(var pr=1;
    // pr<=arrayLen(promotionRewards); pr++)` is 1-based over a CFML array; this is an idiomatic
    // 0-based traversal in the same ascending order, and `entries()` supplies the index the
    // final-element test needs without an indexed element read - so nothing is asserted, no `!` and
    // no `as` appears, and the reward is a `PromotionReward` rather than a possibly-absent one.
    for (const [index, reward] of promotionRewards.entries()) {
      // [model/service/PromotionService.cfc:L169] `var reward = promotionRewards[pr];` - the binding
      // whose survival past L465 is register entry 9's mechanism. Recorded on every visit so that
      // what survives this method is the last reward actually processed.
      lastProcessedRewardID = reward.getPromotionRewardID();

      // The caller's block: the ledger initialisation [L172-L189], the memo populate [L192-L194],
      // the gate evaluation [L197] and the facade's reward-level branch bodies. Awaited before the
      // next reward, never run concurrently - the ledger it mutates is mutated in place.
      const outcome: RewardVisitOutcome = await onReward(reward, orderRewards);

      // [model/service/PromotionService.cfc:L197] `if(promotionPeriodQualifications[ ... ]
      // .qualificationsMeet) {` - the gate, which closes at L463. It is reproduced HERE as an
      // enclosing condition, not merged into the reset test, because the source NESTS the reset
      // inside it and that nesting IS EDGE OUTCOME 2: a final reward whose period fails
      // qualification never reaches L458.
      if (outcome.qualificationsMeet) {
        // [model/service/PromotionService.cfc:L457] This forces the loop to repeat looking for
        // "order" discounts.
        //
        // [L458] `if(!orderRewards and pr == arrayLen(promotionRewards)) {` - the compound condition
        // reproduced in full. `!orderRewards` is retained deliberately even though pass one is the
        // only place this site is reached: it is the operand that carries the exactly-two-passes
        // proof above, and dropping it would delete the proof from the code.
        //
        // CFML parity [model/service/PromotionService.cfc:L459]: `pr = 0` does not skip an element.
        // It relies on the `pr++` increment firing immediately afterwards, so `pr` becomes `1` - and
        // 1 is the FIRST element of a 1-based CFML array. The reset therefore restarts the traversal
        // from the beginning rather than resuming it, which is why pass two below is a fresh
        // traversal of the whole collection and not a continuation. No loop index is mutated here to
        // express that; the second traversal expresses it directly.
        if (!orderRewards && index === rewardCount - 1) {
          // [model/service/PromotionService.cfc:L460] `orderRewards = true;` - the only assignment
          // to the flag, and it is never undone.
          orderRewards = true;
        }
      }
      // [model/service/PromotionService.cfc:L463] END Promotion Period OK IF.
    }
    // [model/service/PromotionService.cfc:L465] END of PromotionReward Loop.

    // LEGACY-NOTE [model/service/PromotionService.cfc:L167, L197, L458-L461]: ★★ BOTH EDGE OUTCOMES
    // are encoded by the guard below, and there is no third.
    // OUTCOME 1 - an EMPTY collection: `rewardCount` is 0, the pass-one body never executes, the
    // L458 condition is never evaluated, the flag stays `false`, and PASS TWO NEVER RUNS - whereas a
    // naive unconditional two-pass rewrite would run an empty second pass. OUTCOME 2 - the LAST
    // reward's promotion period FAILING qualification: the reset sits inside the L197 gate that
    // closes at L463, so control never reaches it, the flag stays `false`, and again PASS TWO NEVER
    // RUNS - even if every earlier reward qualified, because the reset also requires the final
    // element. A single-element collection collapses into these two and no further case is
    // fabricated.
    if (orderRewards) {
      // ============ PASS TWO - order-level rewards ============
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L200, L415, L459]: pass two is a COMPLETE
      // RE-TRAVERSAL of the same collection in the same order, not a continuation of pass one.
      // Because L459's `pr = 0` plus `pr++` lands on element 1, the legacy loop walks the entire
      // array again with `orderRewards == true`, and that changes which arm can execute rather than
      // where the walk starts: the item arm at L200 is blocked by its own `!orderRewards` guard and
      // the fulfillment arm at L345 by the identical guard, leaving the order arm at L415 - guarded
      // on `orderRewards` - as the only reward-level branch that can run. Blocking is structural, in
      // the caller's guards, and this module adds no filter of its own: every reward is offered
      // again, exactly as the source offers it.
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L417]: pass two depends on the output of
      // BOTH of pass one's arms, and this is a note rather than a seventh vector.
      // The order arm's first statement is `var totalDiscountableAmount =
      // arguments.order.getSubtotalAfterItemDiscounts() +
      // arguments.order.getFulfillmentChargeAfterDiscountTotal();`, so it sums a value that only
      // exists once ITEM discounts have been applied and a value that only exists once FULFILLMENT
      // discounts have been applied. That is why pass two must follow pass one, and why it must
      // follow the whole of pass one rather than only its item arm. The folder recognises exactly SIX
      // order-dependence vectors and this observation does not add a seventh - it is a consequence of
      // Vector 2, which this module owns.
      for (const reward of promotionRewards) {
        // [model/service/PromotionService.cfc:L169] again - the same binding, on the same elements,
        // in the same order.
        lastProcessedRewardID = reward.getPromotionRewardID();

        // The gate is still evaluated per reward by the caller in pass two [L197], and its outcome
        // is still reported - but the reset is unreachable now, because `!orderRewards` is
        // permanently `false`. So the outcome is deliberately not consumed here. That is the
        // short-circuit of the exactly-two-passes proof, expressed as the absence of a reset site.
        await onReward(reward, orderRewards);
      }
    }

    return { lastProcessedRewardID };
  }
}
