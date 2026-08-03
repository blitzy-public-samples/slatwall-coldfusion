// slatwall-ts - Promotion over-use stripping: use-limit enforcement, reproduced.
//
// PORTED FROM the post-pass over-use stripping loop [model/service/PromotionService.cfc:L467-L521],
// inline code inside `updateOrderAmountsWithPromotions()`
// [model/service/PromotionService.cfc:L58-L546], extracted 1:1. Fifty-five lines of CFML, and the
// whole of the second half of must-preserve area #1, "promotion discount math together with
// use-limit enforcement semantics" (AAP 0.8.1). Every line here changes the money a customer is
// charged, so nothing may be tidied on aesthetic grounds and nothing may be "corrected"; every
// defect in the range is reproduced.
//
// SCOPE BOUNDARY - WHAT IS READ AND WHAT IS WRITTEN. It READS `usedInOrder` and
// `maximumUsePerOrder` from the reward-usage ledger and READS the ledger's `orderItemsUsage`. It
// NEVER WRITES the ledger. The only structure it mutates is the QUALIFIED-DISCOUNT ACCUMULATOR, in
// exactly the two ways the source performs: [model/service/PromotionService.cfc:L486] recomputes
// one entry's `discountAmount` in place, and [model/service/PromotionService.cfc:L502] deletes one
// entry outright. Nothing is inserted, nothing is re-sorted, no accumulator key is added or
// removed.
//
// TWO KINDS OF NUMBER, KEPT RIGIDLY APART. Exactly one operation in L467-L521 is monetary - the
// recomputation at [model/service/PromotionService.cfc:L486] - and it goes entirely through
// `Money`. `usedInOrder`, `maximumUsePerOrder`, `needToRemove`, `thisDiscountQuantity` and every
// loop index are PLAIN INTEGER COUNTS. The two never mix, and no raw floating-point operation
// touches a monetary value. [model/service/PromotionService.cfc:L505] stays plain integer
// subtraction because it subtracts a quantity from a quantity.
//
// ORDER-DEPENDENCE VECTOR 3 of the five AAP 0.6.1 publishes: the over-use stripping loop that reads
// a leaked variable. The ledger-key iteration order discussed below is not a further vector - see
// the key-order note.
//
// CROSS-SERVICE ORDERING, ACKNOWLEDGED AND NOT ENFORCED HERE:
// `PriceGroupService.updateOrderAmountsWithPriceGroups()`
// [model/service/PriceGroupService.cfc:L364-L375] must run BEFORE
// `updateOrderAmountsWithPromotions()`, because [model/service/PromotionService.cfc:L241] chooses
// the discount base price by price-group eligibility - the `if` arm uses `getPrice()` with no
// correction term while the `else` arm uses `getSkuPrice()` plus the L252 correction. Sequencing is
// an obligation on whichever caller composes the passes, not a runtime check in this file.

// ---------------------------------------------------------------------------
// THE DEFECT THIS MODULE OWNS: numbered register entry 9, reproduced rather than repaired.
//
// SECURITY REVIEW DISPOSITION - RAISED AS S-01, DECLINED ON A CITED MANDATE.
//
// A security review raised the defect below as finding S-01, CRITICAL, CWE-682
// (Incorrect Calculation) and CWE-840 (Business Logic Errors), with runtime
// evidence that an original discount of 10 became 9,999,990. Its suggested
// resolution was to resolve the limit and the order-item usages exclusively from
// the iterated `prIDUsage`, reject negative removal counts, and clamp the
// adjusted discount into `[0, originalDiscount]`.
//
// THAT RESOLUTION IS DECLINED, AND THE DECLINE IS MANDATED RATHER THAN CHOSEN:
//
//   * AAP 0.6.1 Vector 3 states of this exact block that it "MUST be ported as
//     written, because the prompt's must-preserve directive covers promotion
//     discount math and use-limit enforcement, and 'fixing' this changes the
//     amount charged."
//   * AAP 0.4.1 specifies this module as "Reproduces the leaked-`reward` key
//     defect exactly, with a prominent flagged TODO - repairing it changes money."
//   * AAP 0.9.3 makes the inverse a failing gate: "A defect that is silently
//     fixed fails this gate; so does one that is neither reproduced nor
//     documented."
//   * AAP 0.9.3 enumerates the ONLY three sanctioned divergences in the whole
//     port - register entries 13, 12 and 17/18/19. This is entry 9, which is not
//     among them.
//
// The review's severity assessment is not disputed: the inflation is real, it is
// financial, and it is reachable. What is disputed is that this file is the place
// to correct it. Correcting it here would change the amount charged relative to
// the system being migrated, silently, inside a strangler-fig seam whose entire
// purpose is that the two implementations agree. It is a PRODUCT decision with a
// money impact, not a code-hygiene fix, and the plan reserves it as one.
//
// So the outcome is pinned instead of repaired. `tests/unit/domain/entities/promotionReward.test.ts`
// carries adversarial characterization cases that drive the inflation deliberately
// and assert the inflated figure, so the defect can never be "fixed" by accident
// and can never be rediscovered as a surprise - the suite fails the moment the
// behaviour changes, in either direction.
//
// LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: over-use stripping mixes indices —
// L471 correctly compares [prID] on both sides, but L472 subtracts the LEAKED reward's
// maximumUsePerOrder from [prID]'s usedInOrder, and L475/L476/L477 iterate the LEAKED reward's
// orderItemsUsage. `reward` escaped the loop that closed at L465, so it holds the LAST reward
// processed. Maximum-use-per-order is therefore enforced against whichever reward happened to be
// last, for every key in the ledger. The effect is BIDIRECTIONAL: it can UNDER-enforce a limit and
// it can INFLATE a discount (see the L472/L479/L486 chain below). Repairing it changes the amount
// charged, so a product decision is required before any fix.
//
// Preserved deliberately; do not fix without a product decision.
//
// THE INDEX MAP, HONOURED LINE FOR LINE. Each row is annotated again at its own site below.
//
//   L468  `for(var prID in promotionRewardUsageDetails)`          - iterate the ledger's keys
//   L471  `[prID]` on BOTH sides of the `>`                       - CORRECT, never aligned to L472
//   L472  `[prID].usedInOrder` less `[leaked].maximumUsePerOrder`  - MIXED, preserved exactly
//   L475  `[leaked].orderItemsUsage` (the loop bound)             - LEAKED, preserved
//   L476  `[leaked].orderItemsUsage[x].orderItemID`               - LEAKED, preserved
//   L477  `[leaked].orderItemsUsage[x].discountQuantity`          - LEAKED, preserved
//   L483  `.promotionRewardID == prID`                            - CORRECT, preserved as written
//   L499  `.promotionRewardID == prID`                            - CORRECT, preserved as written
//
// THE BIDIRECTIONAL MONEY EFFECT, part of entry 9 rather than a separate finding. Because the L471
// gate reads `prID`'s OWN `maximumUsePerOrder` while the L472 subtraction reads the LEAKED
// reward's, the gate can pass while `needToRemove` comes out NEGATIVE - and a negative
// `needToRemove` does not under-strip, it INFLATES:
//
//   1. [L471] passes: `usedInOrder[prID] > maximumUsePerOrder[prID]`.
//   2. [L472] computes `usedInOrder[prID] - maximumUsePerOrder[leaked]`, NEGATIVE whenever the
//      leaked reward's limit exceeds `prID`'s usage.
//   3. [L479] `needToRemove < thisDiscountQuantity` is TRUE, so the FRACTIONAL branch is taken
//      rather than the deletion branch.
//   4. [L486] the factor `(thisDiscountQuantity - needToRemove) / thisDiscountQuantity` EXCEEDS 1,
//      so the stored `discountAmount` is INFLATED rather than reduced.
//   5. [L489] sets `needToRemove = 0` and [L514] then breaks.
//
// Blast radius: exactly ONE order item's discount is inflated per over-using ledger key, and then
// that key's stripping terminates - not a runaway, but not confined to one key either, because
// every key measures itself against the same leaked limit.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L175-L177]: the `1000000` seed is what keeps the
// inflation LARGE BUT FINITE. `maximumUsePerOrder`, `maximumUsePerItem` and
// `maximumUsePerQualification` are seeded with the literal `1000000` at L175, L176 and L177, and
// the override guards at L180, L183 and L186 are all `!isNull(x) && x > 0`, so ANY reward with no
// configured limit KEEPS the sentinel - the common case. When the last reward processed is
// unconfigured and another key over-uses, L472 yields `usedInOrder[prID] - 1000000` and L486's
// factor becomes roughly `1000000 / thisDiscountQuantity`. Had the seed been `Infinity` the factor
// would be `Infinity` and the discount `Infinity`, a DIFFERENT wrong answer. This module therefore
// consumes the seed as an ORDINARY FINITE NUMBER: never compared against, never special-cased,
// never recognised as a sentinel.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L472]: L472 is the ONLY origin of a negative
// `needToRemove`. The deletion branch at L495-L510 is reached only when
//   `needToRemove >= thisDiscountQuantity`
// (the `else` of L479's strict `<`), so L505's subtraction necessarily yields `>= 0` and the
// invariant holds for the whole loop. Negativity therefore originates from register entry 9 and
// nowhere else, which is why no clamp, `Math.max(0, ...)`, non-negativity guard or absolute value
// appears anywhere in this file: such a guard would silently repair entry 9 and change the amount
// charged.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L172-L189]: the leaked reward ID is ALWAYS bound
// whenever the L468 loop body can execute, so it is a REQUIRED parameter with no null branch, no
// fallback and no default. The ledger entry is created at L172-L189, BEFORE the L197 qualification
// gate, so it runs for every reward the L167 loop encounters: the ledger is non-empty if and only
// if at least one reward was processed, which is exactly when `reward` is bound at L169. If
// `promotionRewards` is empty the ledger is empty, the L468 body never executes and L472 is never
// reached. The caller must NOT wrap the call in a new conditional; adding control flow the legacy
// lacks is the class of change this port forbids.

// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L324-L467]: this pass strips ITEM-LEVEL discounts
// ONLY, and the immunity of order-level and fulfillment-level discounts is MEASURED rather than
// assumed - a census of `promotionRewardUsageDetails` across the source file returns ZERO
// occurrences between L324 and L467, the span holding the fulfillment-reward branch (L345-L412) and
// the order-reward branch (L415-L455), so neither branch reads or writes the ledger. This module
// therefore invents no order-level or fulfillment-level usage member, does not extend the ledger to
// cover them, and accepts no such collection as a parameter.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L155-L159]: sale-price discounts are immune to
// this pass, and the immunity is EMERGENT and must not be made explicit. `./salePriceSeeding.ts`
// appends accumulator entries carrying `promotionRewardID = ""` at L156 and creates no ledger
// entry, while the two membership tests at L483 and L499 match on `.promotionRewardID == prID`
// where `prID` is always a real ledger key - so the empty-string sentinel can never match. No
// explicit filter for `''`, no special case, and no substitution of `undefined`, `null` or a
// synthetic identifier: making the immunity explicit would add logic the legacy lacks.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L482, L498]: the accumulator is indexed with an
// orderItemID taken from the ledger's `orderItemsUsage`, not from the accumulator's own keys, and
// the legacy performs NO `structKeyExists` guard here - unlike L529 in ./promotionApplication.ts,
// which gates on both `structKeyExists` and `arrayLen`. CFML raises when `arrayLen()` is applied to
// an undefined struct key, so the faithful target behaviour is to THROW; the asymmetry is preserved
// rather than smoothed away by skipping. Under `noUncheckedIndexedAccess` the indexed read is
//   `... | undefined`
// and is NARROWED - never `!`, never `as`, both forbidden for `src/**` - with the else-path
// raising. The same discipline covers the ledger reads at L471, L472, L475, L476 and L477.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L468]: the ledger's key iteration order is
// UNSPECIFIED at BOTH ends of the port and this module imposes none. L468 iterates a plain CFML
// struct whose key order is implementation-dependent, and the ledger was populated in whatever
// order the DAO returned rewards - itself unspecified, because
// `PromotionDAO.getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132] applies no
// `ORDER BY` at all. The absence is PRESERVED: keys are not sorted, no order is assumed, and no
// `ORDER BY` is added to the repository method that replaces the DAO. The one place key order can
// be observed is that L502's deletion mutates a SHARED accumulator array whose length L482 and L498
// read; because L475-L477 iterate the LEAKED reward's `orderItemsUsage`, every ledger key targets
// the SAME `orderItemID` sequence, and L483/L499 restrict each key to its OWN entries, so
// interference is confined to array POSITIONS shifting - which the descending scans tolerate, a
// shift only moving a not-yet-examined element to a lower index the downward scan has still to
// visit.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L145-L537]: the intra-folder execution order is
// DOCUMENTED here and ENFORCED nowhere. Source position fixes the sequence inside
// `updateOrderAmountsWithPromotions()`: sale-price seeding at L145-L162 (`./salePriceSeeding.ts`),
// the two-pass reward iteration at L165-L465 (`./twoPassRewardIterator.ts` plus the branch bodies),
// THIS MODULE at L468-L521, then best-discount application at L524-L537
// (`./promotionApplication.ts`). This module requires the iteration to have COMPLETED, because it
// needs both the fully-populated ledger and the identity of the last reward processed. That
// requirement is documentation only - no runtime check, no ordering flag, no assertion, no sequence
// counter - because inventing state the legacy lacks is forbidden; sequencing is an obligation on
// whichever caller composes the passes.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L529]: the application pass needs BOTH of its
// conditions precisely BECAUSE of this module. `./promotionApplication.ts` ports L524-L537, whose
// guard reads `structKeyExists(...) && arrayLen(...)`; the deletion at L502 here can remove the
// LAST remaining entry for an order item, leaving an EMPTY ARRAY UNDER AN EXISTING KEY, so
// `structKeyExists` passes while `arrayLen(...)` is `0`. The two conditions guard two distinct
// states, the second of which is produced here, and neither may be dropped as redundant.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L474]: the source comment reads "Loop over the
// items it was applied to an remove the quantity necessary to meet the total needToRemoveQuantity":
// "an" where "and" is meant, and a coinage naming a variable that does not exist, the variable
// being `needToRemove`. Both are recorded rather than corrected: the source is the authority, and a
// reviewer should see that the discrepancy was noticed.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L486]: the `precisionEvaluate` census for the
// source file is NINE sites - L150, L252, L299, L486, L990, L995, L1001, L1006 and L1007 - not the
// eight the transformation plan cites. The plan's "L248" is really L252 (L248 is a comment, L249
// the `getDiscountAmount` call, so the arithmetic is on L252), and its single "L1007" is really TWO
// ADJACENT SITES, L1006 and L1007. Exactly ONE of the nine - L486 - falls inside this module's
// range, which is why arbitrary-precision arithmetic matters here at all.
//
// JUDGMENT CALL: the legacy block reads a `reward` loop variable that escaped its own loop (bound
// at [model/service/PromotionService.cfc:L169], loop closed at L465, block starts at L468). The
// target has no shared mutable scope, so the leak is surfaced as an explicit parameter named to
// advertise it. Alternatives rejected: (a) passing the `PromotionReward` entity - only
// `getPromotionRewardID()` is ever read, so the entity adds a dependency without adding fidelity;
// (b) reproducing an ambient module-level binding - unsafe across warm invocations. Behaviour is
// identical: same ID, same arithmetic. The parameter is typed `string` and NOT the published
// `PromotionRewardUsageKey` alias, even though that alias resolves to `string`: typing it as a
// ledger KEY would imply the caller had established that it keys the ledger, which is exactly the
// fact register entry 9 does not establish.
//
// JUDGMENT CALL: `src/lib/cfml/precision.ts` is NOT imported, even though it is a permitted
// dependency and L486 is one of the nine `precisionEvaluate` sites. That module's input contract is
// `PreciseInput = string | Decimal` with `number` deliberately excluded, so `thisDiscountQuantity`
// (a plain integer count) cannot reach `divide()` without stringification that buys nothing; and
// `Money.dividedBy`/`Money.times` already route through its `divide` and `multiply` internally, so
// the arbitrary-precision guarantee `precisionEvaluate` provided is preserved TRANSITIVELY and in
// one place. `decimal.js` is likewise never imported directly.
//
// JUDGMENT CALL: L486 passes a STRING EXPRESSION to `precisionEvaluate`, and it is translated into
// TYPED ARITHMETIC rather than evaluated. The source is
// `precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount /
// thisDiscountQuantity) * (thisDiscountQuantity - needToRemove)')`, rendered as
// `discountAmount.dividedBy(thisDiscountQuantity).times(thisDiscountQuantity - needToRemove)`: the
// division and multiplication are `Money` operations because their left operand is monetary, while
// `(thisDiscountQuantity - needToRemove)` is plain integer subtraction of two counts. Operator
// precedence is preserved, so the two expressions are the same computation in the same order.
// `eval`, `new Function`, `vm` and hand-rolled expression parsers are forbidden and none appears.
//
// JUDGMENT CALL: the recomputed amount at L486 is assigned to the accumulator entry's
// `discountAmount` FIELD IN PLACE. `src/domain/promotionEngine/qualifiedDiscountTypes.ts` declares
// `QualifiedDiscount` with `readonly promotionRewardID`, `readonly promotion` and a MUTABLE
// `discountAmount: Money`, and that mutability exists precisely so L486's in-place assignment can
// be reproduced literally; direct assignment is therefore both legal and the more faithful reading,
// and it keeps the element's identity, position and sibling fields untouched. Nothing here adds or
// removes a modifier on a published type: `orderItemsUsage` is a `readonly` PROPERTY holding a
// MUTABLE ARRAY and the accumulator's per-item arrays are mutable too - this module splices one at
// L502 - so a read-only wrapper in these parameter types would break the algorithm outright.
//
// JUDGMENT CALL: the exported function is named `stripOverUsedRewardDiscounts`, and that name
// DISPLACES NO LEGACY IDENTIFIER. The folder preserves legacy CFML method names verbatim in
// camelCase, but that obligation binds PORTED METHODS, and L467-L521 is inline code inside
// `updateOrderAmountsWithPromotions()` with no name of its own. On the parameter names: the
// source's accumulator variable is spelled `orderItemQulifiedDiscounts` - a misspelling carried by
// all twenty of its occurrences in the source file - and this module uses the corrected local name
// `orderItemQualifiedDiscounts`, matching the published type `OrderItemQualifiedDiscounts`; the
// misspelling is purely internal to the CFML function rather than a persisted or transmitted
// contract. `promotionRewardUsageDetails` keeps its source spelling because the source spells it
// correctly.

import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../domain/promotionEngine/qualifiedDiscountTypes.js';
import type {
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
} from '../../domain/promotionEngine/rewardUsageTypes.js';
import type { Money } from '../../domain/valueObjects/money.js';

/**
 * One accumulator entry located by a descending scan, paired with the array index it was found at.
 *
 * Module-local and unexported: it exists so the two branches of
 * [model/service/PromotionService.cfc:L479] can share a single search while acting differently on
 * the result - the fractional branch needs the ENTRY so it can recompute `discountAmount` in place
 * at L486, the deletion branch needs the INDEX so it can splice at L502. Both members are
 * `readonly` because the pair is a lookup result rather than state, and the entry it points at is
 * the live array element, so mutating `discount.discountAmount` mutates the accumulator exactly as
 * the source does.
 */
interface MatchedQualifiedDiscount {
  readonly index: number;
  readonly discount: QualifiedDiscount;
}

/**
 * Resolves one reward-usage ledger entry by `promotionRewardID`, narrowing the indexed read that
 * `noUncheckedIndexedAccess` widens to `... | undefined`.
 */
// CFML parity [model/service/PromotionService.cfc:L472, L475, L476, L477]: CFML raises when a
// struct is indexed by an absent key and a member is then read from the result, so an absent key
// raises here too rather than resolving to a default. No synthetic zero-usage entry is fabricated,
// no empty `orderItemsUsage` is invented, and the caller is not offered an `undefined` to branch
// on: a fabricated entry would let the loop proceed against limits nobody configured, which is a
// money change dressed up as robustness. `!` and `as` are unavailable by policy for `src/**`, and
// both would convert a raised error into a silent `undefined` dereference further down.
function resolveLedgerEntry(
  promotionRewardUsageDetails: PromotionRewardUsageDetails,
  promotionRewardID: string,
): PromotionRewardUsageDetail {
  const usageDetail: PromotionRewardUsageDetail | undefined =
    promotionRewardUsageDetails[promotionRewardID];

  if (usageDetail === undefined) {
    throw new Error(
      `The reward-usage ledger has no entry for promotionRewardID '${promotionRewardID}'. ` +
        'This reproduces the legacy runtime failure at ' +
        'model/service/PromotionService.cfc:L472, L475, L476 and L477, where the LEAKED `reward` ' +
        'variable indexes promotionRewardUsageDetails with no structKeyExists guard. The entry ' +
        'is seeded for every reward encountered at L172-L189, before the L197 qualification ' +
        'gate, so a miss here means the caller passed a reward ID that was never processed.',
    );
  }

  return usageDetail;
}

/**
 * Resolves one order item's bucket of qualified discounts, narrowing the indexed read that
 * `noUncheckedIndexedAccess` widens to `... | undefined`.
 */
// CFML parity [model/service/PromotionService.cfc:L482, L498]: the legacy applies `arrayLen()`
// directly to `orderItemQulifiedDiscounts[ orderItemID ]` with NO `structKeyExists` guard, and CFML
// raises when that key is absent - so this raises too rather than skipping the order item.
// `continue`-ing past a missing key would add control flow the source does not have and would mask
// the one condition under which the two structures have genuinely fallen out of step. The asymmetry
// against the application pass at L529, which DOES guard on both tests, is deliberate.
function resolveQualifiedDiscountsForOrderItem(
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  orderItemID: string,
): QualifiedDiscount[] {
  const qualifiedDiscounts: QualifiedDiscount[] | undefined =
    orderItemQualifiedDiscounts[orderItemID];

  if (qualifiedDiscounts === undefined) {
    throw new Error(
      `The qualified-discount accumulator has no bucket for orderItemID '${orderItemID}'. ` +
        'This reproduces the legacy runtime failure at ' +
        'model/service/PromotionService.cfc:L482 and L498, where the accumulator is indexed ' +
        "with an orderItemID taken from the ledger's orderItemsUsage rather than from the " +
        "accumulator's own key set, and no structKeyExists guard is performed - unlike L529, " +
        'which guards. Silently skipping would add control flow the source does not have.',
    );
  }

  return qualifiedDiscounts;
}

/**
 * Finds the HIGHEST-INDEXED accumulator entry belonging to `promotionRewardID`, or `undefined` when
 * the bucket holds none.
 */
// CFML parity [model/service/PromotionService.cfc:L482, L498]: both legacy scans run `y` from
// `arrayLen(...)` DOWN to `1` and break on the first match, selecting the highest-indexed matching
// entry; because the insertion sort at L266-L294 keeps each bucket DESC-sorted by discount amount,
// the highest index holds the SMALLEST discount for that reward, so stripping reduces or deletes
// the smallest-discount entry first - coherent with the ledger's ASC-by-`discountPerUseValue` order
// at L301-L329, which strips the cheapest-per-use first. THE DIRECTION IS LOAD-BEARING AND
// `findIndex` IS FORBIDDEN: an ascending first-match would select the LARGEST discount for that
// reward and change the money. `findLastIndex` would express the intent directly but is ES2023 and
// this project compiles against `lib: ["ES2022"]`, so the descending scan is written out, 0-based.
// The two insertion sorts run in OPPOSITE directions and must never be unified with each other or
// with this search.
//
// CFML parity [model/service/PromotionService.cfc:L483, L499]: the legacy tests use CFML `==`,
// loose and case-insensitive on strings; the target uses strict `===`, safe here because BOTH
// operands are `getPromotionRewardID()` values produced within a single invocation (the accumulator
// entry's `promotionRewardID`, written at L275 and L289, against the ledger's own key, written at
// L173), so there is no path by which their casing could diverge.
//
// The `undefined` check inside the loop is a type narrowing, not a behavioural branch: `y` is
// always within `[0, length)` and both buckets are dense, so the element can never be absent.
function findLastRewardDiscount(
  qualifiedDiscounts: QualifiedDiscount[],
  promotionRewardID: string,
): MatchedQualifiedDiscount | undefined {
  for (let y = qualifiedDiscounts.length - 1; y >= 0; y -= 1) {
    const candidate: QualifiedDiscount | undefined = qualifiedDiscounts[y];

    if (candidate !== undefined && candidate.promotionRewardID === promotionRewardID) {
      return { index: y, discount: candidate };
    }
  }

  return undefined;
}

/**
 * Strips qualified discounts that exceeded their reward's maximum-use-per-order, reproducing
 * [model/service/PromotionService.cfc:L467-L521] exactly - INCLUDING numbered register entry 9, the
 * leaked-variable index mix documented at the top of this module.
 *
 * Runs AFTER the two-pass reward iteration has completed and BEFORE best-discount application.
 * Neither ordering is enforced here; both are the caller's responsibility.
 *
 * @param promotionRewardUsageDetails - the reward-usage ledger, keyed by `promotionRewardID`. READ
 *   ONLY IN EFFECT: `usedInOrder`, `maximumUsePerOrder` and `orderItemsUsage` are read and no
 *   member is written. Not typed `Readonly<>`, because the published contract is deliberately
 *   mutable for the sibling that owns seeding and incrementing.
 * @param orderItemQualifiedDiscounts - the qualified-discount accumulator, keyed by opaque
 *   `orderItemID`. MUTATED IN PLACE: an entry's `discountAmount` is recomputed (L486) or the entry
 *   is deleted (L502). Nothing is inserted, nothing is re-sorted, no key is added or removed.
 * @param leakedLastProcessedRewardID - the `promotionRewardID` of the LAST reward the L165-L465
 *   iteration processed. This parameter IS register entry 9 made visible: the four reads at L472,
 *   L475, L476 and L477 all resolve through it rather than through the key being iterated.
 *   Required, never optional - see the always-bound proof above - and the caller must not guard the
 *   call site.
 * @returns nothing. The legacy block returns nothing and emits nothing; the surviving discounts are
 *   read back out of the accumulator by the application pass.
 * @throws Error when the ledger has no entry for `leakedLastProcessedRewardID`, or when the
 *   accumulator has no bucket for an `orderItemID` the ledger names. Both raise because CFML
 *   raises, and neither is added validation.
 */
export function stripOverUsedRewardDiscounts(
  promotionRewardUsageDetails: PromotionRewardUsageDetails,
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  leakedLastProcessedRewardID: string,
): void {
  // [model/service/PromotionService.cfc:L467-L468] Now that all the potential discounts for
  // orderItems are set up sorted by best price, strip out any discount that would exceed the
  // maximum order use counts.
  //
  // CFML parity [model/service/PromotionService.cfc:L468]: the legacy
  //   `for(var prID in promotionRewardUsageDetails)`
  // walks a plain struct's keys in implementation-dependent order; own enumerable keys are walked
  // here in the ledger object's own property order, and NO sort is applied - see the key-order note
  // above.
  for (const [prID, prIDUsage] of Object.entries(promotionRewardUsageDetails)) {
    // [model/service/PromotionService.cfc:L470-L471] If this promotion reward was used more than it
    // should have been, start stripping out from the arrays in order.
    //
    // L471 IS CORRECT AND MUST NOT BE "FIXED": it indexes `[prID]` on BOTH sides of the comparison:
    // `prID`'s own running usage against `prID`'s own per-order limit. The temptation, on seeing
    // L472 immediately below, is to make this line match it; doing so would change which ledger
    // keys enter the stripping body at all, and therefore change the money. `prIDUsage` IS the
    // `[prID]` entry, taken straight from the iteration rather than re-looked-up.
    if (prIDUsage.usedInOrder > prIDUsage.maximumUsePerOrder) {
      // L472 MIXES INDICES, AND THE MIX IS PRESERVED EXACTLY. The left operand is
      // `[prID].usedInOrder`; the right operand is `[leaked].maximumUsePerOrder`. This is register
      // entry 9: the subtrahend belongs to whichever reward happened to be processed last. When the
      // leaked reward's limit exceeds `prID`'s usage the result is NEGATIVE, which drives the
      // inflation chain traced above.
      //
      // The leaked lookup is performed HERE, inside the L471 gate, and is deliberately NOT hoisted
      // above the loop: L472 is where the source performs it, so a ledger lacking the leaked key
      // must raise only when some key actually over-uses. A hoisted lookup would raise even when
      // nothing over-uses, which is different behaviour.
      const leakedUsage: PromotionRewardUsageDetail = resolveLedgerEntry(
        promotionRewardUsageDetails,
        leakedLastProcessedRewardID,
      );

      // Plain integer count, never `Money`. It can be negative (see the bidirectional chain above)
      // and it is neither clamped nor floored nor guarded.
      let needToRemove: number = prIDUsage.usedInOrder - leakedUsage.maximumUsePerOrder;

      // [model/service/PromotionService.cfc:L474-L475] "Loop over the items it was applied to an
      // remove the quantity necessary to meet the total needToRemoveQuantity" - the source comment,
      // quoted with its typo and its reference to a variable name that does not exist. L475
      // ITERATES THE LEAKED REWARD'S `orderItemsUsage`, NOT `prID`'S, so the ITEMS stripped are the
      // last reward's items. Preserved.
      //
      // CFML parity [model/service/PromotionService.cfc:L475, L482, L498, L502]: CFML arrays are
      // 1-based and TypeScript arrays 0-based, and every translated index below is idiomatic
      // 0-based rather than 1-based emulation - L475's ascending counted `for` becomes a `for...of`
      // in the same order, L482's and L498's `y=arrayLen(...); y>=1; y--` become a descending loop
      // from `length - 1` down to `0`, and L502's `arrayDeleteAt(array, y)` becomes `splice(y, 1)`.
      // `arrayDeleteAt` operates on a CFML ARRAY rather than a comma-delimited list, so it is not a
      // `src/lib/cfml/list.ts` concern.
      for (const usageEntry of leakedUsage.orderItemsUsage) {
        // L476 and L477 BOTH read from the LEAKED reward's usage record. Preserved.
        const orderItemID: string = usageEntry.orderItemID;
        const thisDiscountQuantity: number = usageEntry.discountQuantity;

        // Both L479 branches begin by resolving this same bucket, so it is resolved once here. The
        // intervening comparison at L479 is side-effect-free and cannot raise, so resolving before
        // the branch is observationally identical - and it keeps the unguarded lookup, and the
        // raise it can produce, in exactly one place. The bucket is held by reference: L486 mutates
        // one of its elements and L502 splices it, and both act on the live array.
        const qualifiedDiscounts: QualifiedDiscount[] = resolveQualifiedDiscountsForOrderItem(
          orderItemQualifiedDiscounts,
          orderItemID,
        );

        // [model/service/PromotionService.cfc:L479] Strict `<`. When `needToRemove` is negative
        // this is TRUE for any positive quantity, which is how the inflation path reaches the
        // fractional branch.
        if (needToRemove < thisDiscountQuantity) {
          // [model/service/PromotionService.cfc:L481-L483] Descending scan for this reward's entry.
          // L483's `== prID` IS CORRECT - the match is against the key being iterated, not against
          // the leaked ID - and is preserved as written.
          const match: MatchedQualifiedDiscount | undefined = findLastRewardDiscount(
            qualifiedDiscounts,
            prID,
          );

          if (match !== undefined) {
            // [model/service/PromotionService.cfc:L485-L486] Set the discountAmount as some
            // fraction of the original discountAmount.
            //
            // CFML parity [model/service/PromotionService.cfc:L486]: `precisionEvaluate` raises on
            // a zero divisor. The divisor is reproduced unguarded - one of four unguarded divisions
            // in this folder, the others being L299, L743 and L831 - and the error propagates
            // rather than being caught, defaulted or short-circuited; `Money.zero` is never used as
            // a fallback anywhere in this folder.
            //
            // The factor `(thisDiscountQuantity - needToRemove) / thisDiscountQuantity` EXCEEDS 1
            // whenever `needToRemove` is negative, so this line can INFLATE the stored amount
            // rather than reduce it. That is register entry 9's money effect, reproduced and not
            // corrected - hence the neutral name below. The two `Money` operations carry all of the
            // monetary arithmetic; `(thisDiscountQuantity - needToRemove)` is plain integer
            // subtraction of two counts and is never wrapped in `Money`.
            const recomputedDiscountAmount: Money = match.discount.discountAmount
              .dividedBy(thisDiscountQuantity)
              .times(thisDiscountQuantity - needToRemove);

            match.discount.discountAmount = recomputedDiscountAmount;

            // [model/service/PromotionService.cfc:L488-L489] Update the needToRemove.
            needToRemove = 0;

            // [model/service/PromotionService.cfc:L491-L492] Break out of the item discount loop.
            // Expressed by the scan having already returned its single match: the legacy `break`
            // leaves the descending loop after acting on the first match found, which is precisely
            // what `findLastRewardDiscount` returning one match does.
          }
        } else {
          // [model/service/PromotionService.cfc:L497-L499] Descending scan for this reward's entry.
          // L499's `== prID` IS CORRECT and is preserved as written.
          const match: MatchedQualifiedDiscount | undefined = findLastRewardDiscount(
            qualifiedDiscounts,
            prID,
          );

          if (match !== undefined) {
            // [model/service/PromotionService.cfc:L501-L502] Remove from the array. This is the
            // mutation that can leave an EMPTY ARRAY UNDER AN EXISTING KEY, which is the state the
            // application pass's second condition at L529 guards.
            qualifiedDiscounts.splice(match.index, 1);

            // [model/service/PromotionService.cfc:L504-L505] Update the needToRemove. PLAIN INTEGER
            // SUBTRACTION of a count from a count: the source uses no `precisionEvaluate` here, so
            // this routes through neither `Money` nor the precise-arithmetic helpers. Reached only
            // when `needToRemove >= thisDiscountQuantity`, so the result is `>= 0`.
            needToRemove = needToRemove - thisDiscountQuantity;

            // [model/service/PromotionService.cfc:L507-L508] Break out of the item discount loop -
            // again expressed by the single-match scan.
          }
        }

        // [model/service/PromotionService.cfc:L513-L514] If we don't need to remove any more.
        //
        // CFML parity [model/service/PromotionService.cfc:L514]: the legacy test is an EQUALITY
        // test, `needToRemove == 0`, reproduced as strict `=== 0` rather than "improved" to `<= 0`.
        // The distinction is behavioural: if `needToRemove` were ever negative here the legacy loop
        // CONTINUES to the next usage record instead of breaking, and `<= 0` would break instead -
        // stripping fewer items and paying out different money.
        if (needToRemove === 0) {
          break;
        }
      }
    }
    // [model/service/PromotionService.cfc:L519-L521] End of the promotion reward loop for removing
    // anything that was overused.
  }
}
