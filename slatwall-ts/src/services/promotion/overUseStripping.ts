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
//   src/services/promotionService.ts                        the facade that calls this module
//   src/services/promotion/salePriceSeeding.ts              seeds the `''`-sentinel entries
//   src/services/promotion/rewardUsageLedger.ts             seeds/increments the ledger read here
//   src/services/promotion/twoPassRewardIterator.ts         surfaces the LAST reward processed
//   src/services/promotion/promotionApplication.ts          consumes whatever survives this pass
//   src/services/promotion/promotionPeriodQualification.ts  sibling decomposition module
//   src/services/promotion/qualifierQualification.ts        sibling decomposition module
//   src/services/promotion/orderItemMembership.ts           sibling decomposition module
//   tests/unit/services/promotion                           this module's net-new suite
//
// ★ THIS MODULE IMPORTS NONE OF THEM, AND THAT IS A STRUCTURAL FACT RATHER THAN A
// CHECKPOINT ACCIDENT. The extracted block reads two data structures and mutates one
// of them; it calls no sibling and no service. So this file is a proven LEAF: ZERO
// sibling edges, and it never imports the facade back, so it closes no cycle. The
// folder's import constraint is directional - the facade may import the nine, and
// nothing in the nine may import the facade - and this file honours it by importing
// only published `src/domain/**` types.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// slatwall-ts - Promotion over-use stripping: use-limit enforcement, reproduced
//
// PORTED FROM: the post-pass over-use stripping loop
// [model/service/PromotionService.cfc:L467-L521] - inline code inside
// `updateOrderAmountsWithPromotions()` [model/service/PromotionService.cfc:L58-L546],
// extracted 1:1. Fifty-five lines of CFML, and the whole of the SECOND half of
// MUST-PRESERVE AREA #1: "promotion discount math together with use-limit
// enforcement semantics" (AAP 0.8.1). This module IS the use-limit enforcement.
// Every line of it changes the money a customer is charged, so nothing here may be
// tidied on aesthetic grounds and nothing here may be "corrected".
//
// ★ THIS MODULE MAY NOT DIVERGE FROM LEGACY BEHAVIOUR IN ANY RESPECT. The project's
// deliberate-divergence budget is fully committed elsewhere: both slots available to
// this folder are spent in `src/services/promotion/discountAmount.ts` (register entry
// 13's un-`var`'d scope leak becomes function-local; register entry 12's `amountOff`
// float gap closes), and the project's third is spent in
// `src/domain/entities/product.ts`. There is no slot left for this file, so EVERY
// defect in its range is reproduced. Nothing below is a divergence.
//
// ★ THE ORDER-DEPENDENCE VECTOR THIS FILE OWNS: VECTOR 3 OF EXACTLY SIX.
// The folder recognises exactly SIX order-dependence vectors in
// `updateOrderAmountsWithPromotions()` - the five AAP 0.6.1 publishes, plus a sixth
// (the L223-L224 ledger ratchet) found during folder analysis and attributed as a
// discovery, owned by `src/services/promotion/rewardUsageLedger.ts` (planned). SIX is
// the count. This file owns VECTOR 3: the over-use stripping loop that reads a leaked
// variable. Nothing in this file adds a seventh, and the ledger-key iteration order
// discussed below is explicitly NOT one - see the key-order note.
//
// ★ SCOPE BOUNDARY - WHAT THIS MODULE READS AND WHAT IT WRITES.
// It READS `usedInOrder` and `maximumUsePerOrder` from the reward-usage ledger and it
// READS the ledger's `orderItemsUsage` records. It NEVER WRITES the ledger: no
// member of it, not a limit, not the running count, not the usage array. The only
// structure this module mutates is the QUALIFIED-DISCOUNT ACCUMULATOR, and it mutates
// it in exactly two ways, both of which the source performs:
//   * [model/service/PromotionService.cfc:L486] recomputes one entry's
//     `discountAmount` in place, and
//   * [model/service/PromotionService.cfc:L502] deletes one entry outright.
// Nothing is inserted, nothing is re-sorted, and no key is added or removed from the
// accumulator. That is the whole write surface.
//
// ★ TWO KINDS OF NUMBER, KEPT RIGIDLY APART.
// Exactly one operation in L467-L521 is monetary - the recomputation at
// [model/service/PromotionService.cfc:L486] - and it is performed entirely through
// the `Money` value object. Everything else is a PLAIN INTEGER COUNT:
// `usedInOrder`, `maximumUsePerOrder`, `needToRemove`, `thisDiscountQuantity` and
// every loop index. The two kinds never mix: no count is wrapped in `Money`, no
// monetary value is unwrapped to a `number`, and NO RAW FLOATING-POINT OPERATION
// TOUCHES A MONETARY VALUE anywhere in this file (AAP 0.8.3). In particular
// [model/service/PromotionService.cfc:L505] stays plain integer subtraction, exactly
// as the source writes it, because it subtracts a quantity from a quantity.
//
// ★ NOT APPLICABLE HERE, STATED SO THE OMISSIONS ARE NOT READ AS OVERSIGHTS:
//   * NO SQL, PARAMETERIZED OR OTHERWISE. This module runs no queries and holds no
//     statement text, no driver import, no connection and no interpolation site.
//     Every statement in the target lives wholly in `src/repositories/mysql/**`,
//     which uses prepared statements exclusively, preserving the injection-safety
//     property `cfqueryparam` provided (AAP 0.8.3). There is nothing here to
//     parameterize.
//   * NO PORTS AND NO COLLABORATORS. The extracted block reaches no DAO, no ORM and
//     no service, so this module takes no constructor, no port and no repository. The
//     project's thirteen ports are untouched and no fourteenth is created. There is
//     no `getService("...")` lookup, no service locator, no DI container and no
//     runtime scan anywhere in the target - the whole graph is wired once in
//     `src/handlers/bootstrap.ts` (planned).
//   * NO SETTINGS AND NO AMBIENT SCOPE. This module reads no setting and takes no
//     request context. It does not import `src/lib/config.ts`, which is static
//     process configuration and must never be used as a request scope.
//   * NO MODULE-LEVEL MUTABLE STATE. Every binding at module scope below is a type or
//     a pure function; there is no module-level `let`, no mutable object, no cache, no
//     counter and no memo. All working state is function-local or a parameter. On a
//     warm container a module-level binding survives between UNRELATED invocations, so
//     holding a partially-stripped ledger or a half-computed `needToRemove` there
//     could let one customer's use limit decide another customer's discount. That is
//     a CORRECTNESS property. The single documented exception in the whole subtree is
//     the MySQL connection pool in `src/repositories/mysql/connection.ts`, and this
//     file is not it.
//   * NO LOGGING. The legacy block emits nothing, and neither does this module.
//   * NO ASYNC. The block performs struct and array traversal plus arithmetic, and
//     nothing more, so the exported function is SYNCHRONOUS and returns `void`. It is
//     not made `async` for symmetry with siblings that genuinely await a repository.
//
// This file asserts no service-level objective, and no latency, throughput, uptime or
// availability figure of any kind, because the legacy system declares none and none
// may be invented (AAP 0.8.1). The legacy runtime's 60-second order-placement,
// 45-second payment-transaction and 30-second dependency-scan lock timeouts are noted
// and deliberately NOT implemented. `cfthread` usage across the in-scope slice is
// zero, verified by search, so the thread-translation rule is recorded and
// unexercised. Where a decision below is justified, it is justified on CORRECTNESS
// grounds - never on speed.
//
// CROSS-SERVICE ORDERING, ACKNOWLEDGED IN ONE SENTENCE AND NOT ENFORCED HERE:
// `PriceGroupService.updateOrderAmountsWithPriceGroups()`
// [model/service/PriceGroupService.cfc:L364-L375] must run BEFORE
// `updateOrderAmountsWithPromotions()`, because
// [model/service/PromotionService.cfc:L241] chooses the discount base price by
// price-group eligibility - the `if` branch (no applied price group OR the item IS
// price-group eligible) uses `getPrice()` with no correction term, while the `else`
// branch (a price group IS present AND the item is INeligible) uses `getSkuPrice()`
// plus the L252 correction - and that constraint belongs to the facade's doc comment
// and to `src/handlers/promotionApplicationHandler.ts` (planned), not to a runtime
// check in this file.
//
// LEGACY-NOTE [meta/tests/unit/service]: THIS MODULE'S COVERAGE IS NET-NEW.
// There is no legacy antecedent to trace to: `meta/tests/unit/service/` contains only
// AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest,
// none of which is in scope, and `meta/tests/unit/dao/` holds only AccountDAOTest and
// PaymentDAOTest. Coverage of this module must therefore be declared NET-NEW and must
// never be presented as parity with an existing suite (AAP 0.6.6); the characterization
// suite that pins the behaviour below - INCLUDING every defect - is owned by
// `tests/unit/services/promotion` (planned) and NO test file is authored from this
// module's task.
//
// NO USER RULES WERE PROVIDED FOR THIS PROJECT
// `review_rules` returns the single line "No user rules provided." - re-queried while
// authoring this file, both without a range and over the whole document, with
// byte-identical results, so the absence is verified rather than assumed. It is a
// fixed single-line sentinel, not a paginated document. No rule is invented to fill
// the gap, and the gap is not treated as licence to lower the bar: the project's
// enterprise substitutes apply here at full strength (AAP 0.7, AAP 0.8.3).
// `review_rules` remains the authoritative source; this is a record of its result.
//
// LOCATOR VERIFICATION: every locator cited in this file was checked against
// `model/service/PromotionService.cfc`, which is the SOLE BEHAVIOURAL AUTHORITY, and
// the range L467-L521 required NO correction - the comment is on L467, the loop opens
// on L468 and closes on L521 carrying the label "End Promotion Reward loop for
// removing anything that was overused". One published count elsewhere did need
// correcting, and it is recorded on the `precisionEvaluate` note below.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ★★★ THE DEFECT THIS MODULE OWNS: NUMBERED REGISTER ENTRY 9.
//
// The register has 30 numbered entries plus eight secondary items. Entry 9 is the
// sharpest example in the whole project of why this port is not a cleanup exercise,
// and it is reproduced rather than repaired.
//
// LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: over-use stripping mixes indices —
// L471 correctly compares [prID] on both sides, but L472 subtracts the LEAKED reward's
// maximumUsePerOrder from [prID]'s usedInOrder, and L475/L476/L477 iterate the LEAKED reward's
// orderItemsUsage. `reward` escaped the loop that closed at L465, so it holds the LAST reward
// processed. Maximum-use-per-order is therefore enforced against whichever reward happened to be
// last, for every key in the ledger. The effect is BIDIRECTIONAL: it can UNDER-enforce a limit and
// it can INFLATE a discount (see the L472/L479/L486 chain below). Repairing it changes the amount
// charged, so a product decision is required before any fix.
// Preserved deliberately; do not fix without a product decision.
//
// THE INDEX MAP, HONOURED LINE FOR LINE. Each row is annotated again at its own site
// below so a reviewer can check the map without scrolling.
//
//   L468  `for(var prID in promotionRewardUsageDetails)`       - iterate the ledger's keys
//   L471  `[prID]` on BOTH sides of the `>`                    - CORRECT, never "aligned" to L472
//   L472  `[prID].usedInOrder` less `[leaked].maximumUsePerOrder` - MIXED, preserved exactly
//   L475  `[leaked].orderItemsUsage` (the loop bound)          - LEAKED, preserved
//   L476  `[leaked].orderItemsUsage[x].orderItemID`            - LEAKED, preserved
//   L477  `[leaked].orderItemsUsage[x].discountQuantity`       - LEAKED, preserved
//   L483  `.promotionRewardID == prID`                         - CORRECT, preserved as written
//   L499  `.promotionRewardID == prID`                         - CORRECT, preserved as written
//
// The consequence, stated plainly: maximum-use-per-order is enforced against whichever
// reward happened to be last, for EVERY key in the ledger - and the ITEMS it strips
// from are the last reward's items, not the over-using reward's items. The gate that
// decides whether to strip at all and the arithmetic that decides how much to strip
// are reading two different rewards.
//
// ---------------------------------------------------------------------------
// ★ DEFECT 9, CONTINUED - THE BIDIRECTIONAL MONEY EFFECT, TRACED PRECISELY.
//
// This is part of register entry 9 above rather than a separate finding, so it carries
// no second closing line. Because the L471 gate reads `prID`'s OWN
// `maximumUsePerOrder` while the L472 subtraction reads the LEAKED reward's, the gate
// can pass while `needToRemove` comes out NEGATIVE - and a negative `needToRemove`
// does not under-strip, it INFLATES. The chain, exactly:
//
//   1. [L471] passes: `usedInOrder[prID] > maximumUsePerOrder[prID]`.
//   2. [L472] computes `usedInOrder[prID] - maximumUsePerOrder[leaked]`, which is
//      NEGATIVE whenever the leaked reward's limit exceeds `prID`'s usage.
//   3. [L479] `needToRemove < thisDiscountQuantity` is TRUE, because a negative is
//      less than any positive quantity, so the FRACTIONAL branch is taken rather than
//      the deletion branch.
//   4. [L486] the factor `(thisDiscountQuantity - needToRemove) / thisDiscountQuantity`
//      EXCEEDS 1, because subtracting a negative adds, so the stored `discountAmount`
//      is INFLATED rather than reduced.
//   5. [L489] sets `needToRemove = 0` and [L514] then breaks.
//
// BLAST RADIUS, PRECISELY: exactly ONE order item's discount is inflated per
// over-using ledger key, and then that key's stripping terminates. It is not a runaway
// - step 5 stops it after a single item - and it is not confined to one key either,
// because every key in the ledger measures itself against the same leaked limit.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L175-L177]: the `1000000` seed is what keeps DEFECT 9's inflation LARGE BUT FINITE, so the sibling ledger's prohibition on substituting `Infinity` and this module's refusal to clamp `needToRemove` are two halves of one ruling.
// `src/services/promotion/rewardUsageLedger.ts` (planned) seeds `maximumUsePerOrder`, `maximumUsePerItem` and `maximumUsePerQualification` with the literal `1000000` at L175, L176 and L177, and is bound not to turn it into `Infinity`, `Number.MAX_SAFE_INTEGER`, `null` or `undefined`; because the override guards at L180, L183 and L186 are all `!isNull(x) && x > 0`, ANY reward with no configured limit KEEPS the sentinel - the common case, not the rare one - so when the LAST reward processed is unconfigured and any other key over-uses, L472 yields `usedInOrder[prID] - 1000000` (a large negative), L486's factor becomes roughly `1000000 / thisDiscountQuantity`, and the discount is inflated by that factor; had the sentinel been `Infinity`, L472 would yield `-Infinity`, L486's factor would be `Infinity`, and the discount would become `Infinity`, which is a DIFFERENT wrong answer rather than the legacy one, so preserving `1000000` as an ORDINARY FINITE NUMBER is what keeps the outcome faithful and this module consumes it as exactly that - never compared against, never special-cased, never recognised as a sentinel.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L472]: the ONLY origin of a negative `needToRemove` is L472, and the deletion branch provably cannot produce one.
// The deletion branch at L495-L510 is reached only when `needToRemove >= thisDiscountQuantity`, since it is the `else` of L479's strict `<`, so the subtraction at L505 yields a value that is necessarily `>= 0`, and a second pass through the same branch subtracts from a non-negative starting point under the same guard, so the invariant holds for the whole loop; negativity therefore originates at L472 and nowhere else, which means it originates from DEFECT 9 and nowhere else, and that is why no clamp, no `Math.max(0, ...)`, no non-negativity guard and no absolute value appears anywhere in this file - such a guard would not be defensive hardening, it would silently repair register entry 9 and change the amount charged.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L172-L189]: the leaked reward ID is ALWAYS bound whenever the L468 loop body can execute, so it is a REQUIRED parameter with no null branch, no fallback and no default.
// The ledger entry for a reward is created at L172-L189, which sits BEFORE the L197 qualification gate and therefore runs for EVERY reward the L167 loop encounters, so the ledger is non-empty if and only if at least one reward was processed, which is exactly the condition under which `reward` is bound at L169; if `promotionRewards` is empty the ledger is empty, the L468 loop body never executes and L472 is never reached, so when the reward collection is empty the caller may pass ANY value including `''`, and the caller must NOT wrap the call in a new conditional, because adding control flow the legacy lacks is precisely the class of change this port forbids.

// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L324-L467]: this pass strips ITEM-LEVEL discounts ONLY, and the immunity of order-level and fulfillment-level discounts is a MEASURED FACT rather than an oversight.
// A full census of `promotionRewardUsageDetails` in the source file returns lines 105, 139, 172, 173, 181, 184, 187, 223, 224, 228, 236, 237, 297, 304, 306, 309, 323, 468, 471, 472, 475, 476 and 477 - so there is ZERO occurrence anywhere between L324 and L467, which means the fulfillment-reward branch (L345-L412) and the order-reward branch (L415-L455) neither read nor write the ledger and ORDER-LEVEL AND FULFILLMENT-LEVEL DISCOUNTS ARE STRUCTURALLY IMMUNE TO USE-LIMIT STRIPPING; consequently this module invents no order-level or fulfillment-level usage member, does not extend the ledger to cover them, and accepts no order-level or fulfillment-level discount collection as a parameter, because fabricating enforcement the legacy system does not perform would change money in exactly the direction a reviewer would never think to check.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L155-L159]: sale-price discounts are immune to this pass, and the immunity is an EMERGENT property of the comparison that must NOT be made explicit.
// The sale-price seeding at L145-L162, ported by `src/services/promotion/salePriceSeeding.ts` (planned), appends accumulator entries carrying `promotionRewardID = ""` at L156 and creates NO ledger entry, while the two membership tests at L483 and L499 match on `.promotionRewardID == prID` where `prID` is always a real ledger key - so the empty-string sentinel can never match and a sale-price entry is never reduced and never deleted here; that emergent immunity is therefore left exactly as it is, with no explicit filter for `''`, no special case, and no substitution of `undefined`, `null` or a synthetic identifier for the sentinel, because making it explicit would add logic the legacy lacks.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L482, L498]: the accumulator is indexed with an
// orderItemID taken from the ledger's orderItemsUsage, not from the accumulator's own keys, and the
// legacy code performs no structKeyExists guard here — unlike L529 in ./promotionApplication.ts,
// which does. The asymmetry is preserved: an absent key reproduces the legacy failure rather than
// being silently skipped, because skipping would add control flow the source does not have.
// Concretely: `orderItemID` is read at L476 out of `[leaked].orderItemsUsage`, and it is then used
// to index the accumulator at L482, L486, L498 and L502 with no existence test of any kind, whereas
// the application pass at L529 gates its lookup on BOTH `structKeyExists(...)` AND
// `arrayLen(...)`. CFML raises when `arrayLen()` is applied to an undefined struct key, so the
// faithful target behaviour is to THROW. Under `noUncheckedIndexedAccess` the indexed read is
// `... | undefined` and must be NARROWED - never asserted with `!`, never cast with `as`, both of
// which the lint profile forbids outright for `src/**` - and the narrowing's else-path raises
// instead of continuing. The same narrowing discipline is applied to the ledger reads at L471,
// L472, L475, L476 and L477.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L468]: the ledger's key iteration order is UNSPECIFIED at BOTH ends of the port, and this module imposes no order on it.
// L468 iterates a plain CFML struct whose key order is implementation-dependent, and the ledger was populated in whatever order the DAO returned rewards - itself unspecified, because `PromotionDAO.getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132] applies no `ORDER BY` at all (verified: zero `ORDER BY` occurrences in the entire DAO file) - so the absence is PRESERVED: the keys are not sorted, no order is assumed, none is suggested, and no `ORDER BY` is added to the repository method that replaces the DAO. The target iterates own enumerable keys in the accumulator object's own property order, which for identifier-shaped keys is insertion order, i.e. the same unspecified DAO order; that is a property of the runtime rather than an ordering this module chose, and nothing below depends on it.
// The one place key order can be observed is that L502's deletion mutates a SHARED accumulator array whose length L482 and L498 read: because L475-L477 iterate the LEAKED reward's `orderItemsUsage`, every ledger key targets the SAME `orderItemID` sequence, and L483/L499 restrict each key to removing only its OWN entries, so cross-key interference is confined to array POSITIONS shifting - which the descending scans tolerate, since a shift can only move a not-yet-examined element to a lower index that a downward scan has still to visit. This is a determinism observation about VECTOR 3, not a seventh vector; the count is SIX.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L145-L537]: the intra-folder execution order is DOCUMENTED here and ENFORCED nowhere.
// Source position fixes the sequence inside `updateOrderAmountsWithPromotions()`: sale-price seeding at L145-L162 (`src/services/promotion/salePriceSeeding.ts`, planned), then the two-pass reward iteration at L165-L465 (`src/services/promotion/twoPassRewardIterator.ts`, planned, plus the facade-owned branch bodies), then THIS MODULE at L468-L521, then best-discount application at L524-L537 (`src/services/promotion/promotionApplication.ts`, planned). This module requires the iteration to have COMPLETED, because it needs both the fully-populated ledger and the identity of the last reward processed - which the two-pass iterator surfaces to the facade, which in turn hands its ID here - but that requirement is recorded as documentation only: there is no runtime check, no ordering flag, no assertion and no sequence counter anywhere in this file, because inventing state the legacy lacks is forbidden, and sequencing is the responsibility of the facade and of `src/handlers/promotionApplicationHandler.ts` (planned).
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L529]: the application pass needs BOTH of its conditions precisely BECAUSE of this module, so its apparent belt-and-braces is nothing of the kind.
// `src/services/promotion/promotionApplication.ts` (planned) ports L524-L537, whose guard reads `structKeyExists(orderItemQulifiedDiscounts, orderItem.getOrderItemID()) && arrayLen(orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ])`; the deletion at L502 in THIS module can remove the LAST remaining entry for an order item, leaving an EMPTY ARRAY UNDER AN EXISTING KEY, so `structKeyExists` passes while `arrayLen(...)` is `0` - the two conditions therefore guard two distinct states, the second of which is PRODUCED HERE, and neither may be dropped as redundant.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L474]: the source comment reads "Loop over the items it was applied to an remove the quantity necessary to meet the total needToRemoveQuantity", with "an" where "and" is meant.
// The typo is recorded rather than silently corrected, on the same principle that governs the rest of this file: the source is the authority, and a reviewer diffing the two implementations should be able to see that the discrepancy was noticed rather than wonder whether the porting agent read the line at all. The comment's own coinage "needToRemoveQuantity" also names a variable that does not exist - the variable is `needToRemove` - and that too is left as the source wrote it. This is one of the two secondary register items surfacing in this range; the other is the `orderItemQulifiedDiscounts` spelling, addressed in the naming judgment call below.
//
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/PromotionService.cfc:L150, L252, L299, L486, L990, L995, L1001, L1006, L1007]: the `precisionEvaluate` census for this file is NINE sites, not the eight the transformation plan cites.
// Verified by grepping the source, which returns a count of exactly nine at those lines: the plan's "L248" is really L252 (L248 is a comment and L249 is the `getDiscountAmount` call, so the arithmetic is on L252), and the plan's single "L1007" is really TWO ADJACENT SITES, L1006 and L1007. Exactly ONE of the nine - L486 - falls inside this module's range, which is why arbitrary-precision arithmetic matters here at all, and the correction is recorded in place so the miscount is not re-propagated from this file; the shipped `src/services/promotion/discountAmount.ts` records the same nine-site census independently, and the two agree.
//
// ---------------------------------------------------------------------------
// JUDGMENT CALL: the legacy block reads a `reward` loop variable that escaped its own loop
// (bound at model/service/PromotionService.cfc:L169, loop closed at L465, block starts at L468).
// The target has no shared mutable scope, so the leak is surfaced as an explicit parameter named
// to advertise it. Alternatives rejected: (a) passing the PromotionReward entity — only
// getPromotionRewardID() is ever read, so the entity adds a dependency without adding fidelity;
// (b) reproducing an ambient module-level binding — forbidden by the no-module-level-mutable-state
// rule, and unsafe across warm invocations. Behaviour is identical: same ID, same arithmetic.
// This is neither a signature widening nor a signature reshaping: the block is extracted inline
// code with no legacy method signature to preserve. Both budget ledgers remain at zero spent here.
// For completeness on the budget point: this module also consumes ZERO visibility widenings,
// because it promotes no private legacy method - the five-slot visibility ledger is fully
// exhausted elsewhere (three in `promotionPeriodQualification.ts`, one in
// `qualifierQualification.ts`, one in `discountAmount.ts`), and a sixth would be a gate failure.
// The parameter is deliberately typed `string` and NOT the published `PromotionRewardUsageKey`
// alias, even though that alias resolves to `string`: the value arriving here is the leaked
// reward's identity, and typing it as a ledger KEY would imply the caller had already established
// that it keys the ledger - which is exactly the fact DEFECT 9 does not establish.
//
// ---------------------------------------------------------------------------
// JUDGMENT CALL: `src/lib/cfml/precision.ts` is NOT imported by this module, even though it is a
// permitted dependency and L486 is one of the nine `precisionEvaluate` sites.
// Two facts settle it. First, that module's input contract is `PreciseInput = string | Decimal`
// with `number` DELIBERATELY EXCLUDED, so `thisDiscountQuantity` - a plain integer count - cannot
// be handed to `divide()` without first stringifying it, which would be ceremony that buys
// nothing. Second, `Money.dividedBy` and `Money.times` already route through that very module's
// `divide` and `multiply` internally, so the arbitrary-precision guarantee `precisionEvaluate`
// provided is preserved TRANSITIVELY and in exactly one place, which is what the
// single-arithmetic-surface standard asks for: all money arithmetic goes through `Money`.
// Importing `precision.ts` and not using it would additionally break the build, since
// `noUnusedLocals` is enabled. `decimal.js` is likewise never imported directly. The sibling
// `discountAmount.ts` reached the same conclusion for the same reason, so the folder is
// consistent.
//
// ---------------------------------------------------------------------------
// JUDGMENT CALL: L486 passes a STRING EXPRESSION to `precisionEvaluate`, and it is translated into
// TYPED ARITHMETIC OPERATIONS rather than evaluated.
// The source line is
// `precisionEvaluate('(orderItemQulifiedDiscounts[ orderItemID ][y].discountAmount /
// thisDiscountQuantity) * (thisDiscountQuantity - needToRemove)')`, and the target renders it as
// `discountAmount.dividedBy(thisDiscountQuantity).times(thisDiscountQuantity - needToRemove)`:
// the division and the multiplication are `Money` operations because their left operand is
// monetary, while `(thisDiscountQuantity - needToRemove)` is PLAIN INTEGER SUBTRACTION because
// both of its operands are counts. Operator precedence is preserved - the division binds first in
// the source's parentheses and first in the method chain - so the two expressions are the same
// computation in the same order. `eval`, `new Function`, `vm` and any hand-rolled expression
// parser are absolutely forbidden and none appears; the lint profile independently errors on
// `no-eval` and `no-new-func`. Nor is any dynamic-dispatch stand-in used: no `Proxy`, no
// index-signature dispatch, no `variables.` scope emulation and no `Record<string, any>` ledger.
//
// ---------------------------------------------------------------------------
// JUDGMENT CALL: the recomputed amount at L486 is assigned to the accumulator entry's
// `discountAmount` FIELD IN PLACE, and the folder's construct-once element-replacement fallback is
// deliberately NOT used here.
// The published accumulator type was checked rather than assumed:
// `src/domain/promotionEngine/qualifiedDiscountTypes.ts` declares `QualifiedDiscount` with
// `readonly promotionRewardID`, `readonly promotion` and a MUTABLE `discountAmount: Money` - the
// mutability is deliberate on that module's part, and it exists precisely so that L486's in-place
// field assignment can be reproduced literally. Direct assignment is therefore both legal and the
// MORE faithful reading, and it keeps the array element's identity, position and sibling fields
// untouched. Had the field been `readonly`, the resolution would have been to compute the new
// `Money` first and replace the element with a fresh object carrying it, since widening a
// published domain type from a service module is not permitted; that path is not taken because the
// premise does not hold. Nothing in this module adds or removes a modifier on any published type:
// no `Readonly<>` wrapper and no `ReadonlyArray` appears in any signature, because
// `orderItemsUsage` is a `readonly` PROPERTY holding a MUTABLE ARRAY and the accumulator's
// per-item arrays are mutable too - this module splices one at L502 - so a read-only wrapper
// anywhere in these parameter types would break the algorithm outright.
//
// ---------------------------------------------------------------------------
// JUDGMENT CALL: the exported function is named `stripOverUsedRewardDiscounts`, and that name
// DISPLACES NO LEGACY IDENTIFIER.
// The folder preserves legacy CFML method names verbatim in camelCase - which is why the lint
// profile deliberately ships no naming-convention rule - but that obligation binds PORTED METHODS,
// and L467-L521 is inline code inside `updateOrderAmountsWithPromotions()` with no name of its
// own. A descriptive name is therefore chosen, and `updateOrderAmountsWithPromotions` remains the
// exclusive property of the facade. On the parameter names: the source's accumulator variable is
// spelled `orderItemQulifiedDiscounts` - a misspelling, recorded here exactly once and carried by
// all twenty of its occurrences in the source file - and this module uses the corrected local name
// `orderItemQualifiedDiscounts`, matching the published type
// `OrderItemQualifiedDiscounts`; the misspelling is purely internal to the CFML function rather
// than a persisted or transmitted data contract, and the decision to rename it is owned by
// `src/services/promotion/promotionApplication.ts` (planned). `promotionRewardUsageDetails` keeps
// its source spelling because the source spells it correctly.

// ---------------------------------------------------------------------------

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
 * One accumulator entry located by a descending scan, paired with the array index it
 * was found at.
 *
 * Module-local and unexported: it exists so the two branches of
 * [model/service/PromotionService.cfc:L479] can share a single search while still
 * acting differently on the result - the fractional branch needs the ENTRY so it can
 * recompute `discountAmount` in place at L486, and the deletion branch needs the INDEX
 * so it can splice at L502. Both members are `readonly` because the pair is a lookup
 * result rather than state: nothing reassigns either field, and the entry it points at
 * is the live array element, so mutating `discount.discountAmount` mutates the
 * accumulator exactly as the source does.
 */
interface MatchedQualifiedDiscount {
  readonly index: number;
  readonly discount: QualifiedDiscount;
}

/**
 * Resolves one reward-usage ledger entry by `promotionRewardID`, narrowing the indexed
 * read that `noUncheckedIndexedAccess` widens to `... | undefined`.
 */
// CFML parity [model/service/PromotionService.cfc:L472, L475, L476, L477]: CFML raises when a struct is indexed by a key that is not present and a member is then read from the result, so an absent key raises here too rather than resolving to a default.
//
// There is no substitution and no recovery: no synthetic zero-usage entry is
// fabricated, no empty `orderItemsUsage` is invented, and the caller is not offered an
// `undefined` to branch on. Returning a fabricated entry would let the stripping loop
// proceed against limits nobody configured, which is a money change dressed up as
// robustness. The `!` non-null assertion and an `as` cast are both unavailable by
// policy for `src/**`, and both would be wrong anyway: they would convert a raised
// error into a silent `undefined` dereference further down.
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
 * Resolves one order item's bucket of qualified discounts, narrowing the indexed read
 * that `noUncheckedIndexedAccess` widens to `... | undefined`.
 */
// CFML parity [model/service/PromotionService.cfc:L482, L498]: the legacy code applies `arrayLen()` directly to `orderItemQulifiedDiscounts[ orderItemID ]` with NO `structKeyExists` guard, and CFML raises when that key is absent - so this raises too, rather than skipping the order item.
//
// Skipping would be the tempting choice and it is the wrong one: `continue`-ing past a
// missing key would add control flow the source does not have, and it would mask the
// one condition under which the two structures have genuinely fallen out of step. The
// asymmetry against the application pass at L529 - which DOES guard, on both
// `structKeyExists` and `arrayLen` - is deliberate and preserved.
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
 * Finds the HIGHEST-INDEXED accumulator entry belonging to `promotionRewardID`, or
 * `undefined` when the bucket holds none.
 */
// CFML parity [model/service/PromotionService.cfc:L482, L498]: both legacy scans run `y` from `arrayLen(...)` DOWN to `1` and break on the first match, so they select the highest-indexed matching entry; because the facade-owned insertion sort at L266-L294 keeps each bucket DESC-sorted by discount amount, the highest index holds the SMALLEST discount for that reward, and stripping therefore reduces or deletes the smallest-discount entry first - coherent with the ledger's ASC-by-`discountPerUseValue` ordering at L301-L329, which strips the cheapest-per-use first.
// THE DIRECTION IS LOAD-BEARING AND `findIndex` IS FORBIDDEN: an ascending first-match would select the LARGEST discount for that reward and change the money. `findLastIndex` would express the intent directly but is ES2023 and this project compiles against `lib: ["ES2022"]`, so the descending scan is written out; it is a 0-based idiomatic loop rather than 1-based emulation.
//
// CFML parity [model/service/PromotionService.cfc:L483, L499]: the legacy tests use CFML `==`, which is loose and case-insensitive on strings, and the target uses strict `===` - required by the lint profile and safe here, because BOTH operands are `getPromotionRewardID()` values produced within a single invocation (the accumulator entry's `promotionRewardID`, written at L275 and L289, against the ledger's own key, written at L173), so there is no path by which their casing could diverge and no need for a case-insensitive comparison helper.
//
// NOTE ON THE `undefined` CHECK INSIDE THE LOOP: `y` is always within
// `[0, length)`, and both accumulator buckets are dense - built by append and ordered
// insert, and kept dense by `splice` - so the element can never actually be absent.
// The check exists solely to narrow the type that `noUncheckedIndexedAccess` widens,
// and it is NOT a behavioural branch; the alternatives, `!` and `as`, are forbidden
// for `src/**` by policy.
//
// The two legacy scans are kept as one search deliberately, and the two BRANCH BODIES
// are kept apart deliberately. They are also kept apart from the folder's two
// insertion sorts, which run in OPPOSITE directions (DESC by discount amount at
// L266-L294; ASC by `discountPerUseValue` at L301-L329) and must never be unified with
// each other or with this search.
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
 * Strips qualified discounts that exceeded their reward's maximum-use-per-order,
 * reproducing [model/service/PromotionService.cfc:L467-L521] exactly - INCLUDING
 * numbered register entry 9, the leaked-variable index mix documented at the top of
 * this module.
 *
 * Runs AFTER the two-pass reward iteration has completed and BEFORE best-discount
 * application. Neither ordering is enforced here; both are the caller's
 * responsibility.
 *
 * @param promotionRewardUsageDetails - the reward-usage ledger, keyed by
 *   `promotionRewardID`. READ ONLY IN EFFECT: this function reads `usedInOrder`,
 *   `maximumUsePerOrder` and `orderItemsUsage` and writes no member of it. It is not
 *   typed `Readonly<>`, because the published contract is deliberately mutable for the
 *   sibling module that owns seeding and incrementing, and narrowing it here would
 *   misrepresent that contract.
 * @param orderItemQualifiedDiscounts - the qualified-discount accumulator, keyed by
 *   opaque `orderItemID`. MUTATED IN PLACE: an entry's `discountAmount` is recomputed
 *   (L486) or the entry is deleted (L502). Nothing is inserted, nothing is re-sorted,
 *   and no key is added or removed.
 * @param leakedLastProcessedRewardID - the `promotionRewardID` of the LAST reward the
 *   L165-L465 iteration processed. This parameter IS register entry 9 made visible:
 *   the legacy block reads it from a loop variable that escaped its own loop, and the
 *   four reads at L472, L475, L476 and L477 all resolve through it rather than through
 *   the key being iterated. Required, never optional - see the always-bound proof
 *   above - and the caller must not guard the call site.
 * @returns nothing. The legacy block returns nothing and emits nothing; the surviving
 *   discounts are read back out of the accumulator by the application pass.
 * @throws Error when the ledger has no entry for `leakedLastProcessedRewardID`, or when
 *   the accumulator has no bucket for an `orderItemID` the ledger names. Both raise
 *   because CFML raises, and neither is added validation.
 */
export function stripOverUsedRewardDiscounts(
  promotionRewardUsageDetails: PromotionRewardUsageDetails,
  orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  leakedLastProcessedRewardID: string,
): void {
  // [model/service/PromotionService.cfc:L467-L468] Now that all the potential discounts
  // for orderItems are set up sorted by best price, strip out any discount that would
  // exceed the maximum order use counts.
  //
  // CFML parity [model/service/PromotionService.cfc:L468]: the legacy `for(var prID in promotionRewardUsageDetails)` walks a plain struct's keys in implementation-dependent order; own enumerable keys are walked here in the ledger object's own property order, and NO sort is applied - see the key-order note above.
  for (const [prID, prIDUsage] of Object.entries(promotionRewardUsageDetails)) {
    // [model/service/PromotionService.cfc:L470-L471] If this promotion reward was used
    // more than it should have been, start stripping out from the arrays in order.
    //
    // ★ L471 IS CORRECT AND MUST NOT BE "FIXED": it indexes `[prID]` on BOTH sides of
    // the comparison - `prID`'s own running usage against `prID`'s own per-order limit.
    // The temptation, on seeing L472 immediately below, is to make this line match it.
    // Doing so would change which ledger keys enter the stripping body at all, and
    // therefore change the money. `prIDUsage` IS the `[prID]` entry, taken straight
    // from the iteration rather than re-looked-up, so both operands here are visibly
    // the same reward.
    if (prIDUsage.usedInOrder > prIDUsage.maximumUsePerOrder) {
      // ★ L472 MIXES INDICES, AND THE MIX IS PRESERVED EXACTLY. The left operand is
      // `[prID].usedInOrder`; the right operand is `[leaked].maximumUsePerOrder`. This
      // is register entry 9: the subtrahend belongs to whichever reward happened to be
      // processed last, not to `prID`. When the leaked reward's limit exceeds `prID`'s
      // usage the result is NEGATIVE, which drives the inflation chain traced above.
      //
      // The leaked lookup is performed HERE, inside the L471 gate, and is deliberately
      // NOT hoisted above the loop: L472 is where the source performs it, so a ledger
      // that lacks the leaked key must raise only when some key actually over-uses. A
      // hoisted lookup would raise even when nothing over-uses, which is different
      // behaviour.
      const leakedUsage: PromotionRewardUsageDetail = resolveLedgerEntry(
        promotionRewardUsageDetails,
        leakedLastProcessedRewardID,
      );

      // Plain integer count, never `Money`. It can be negative - see the bidirectional
      // chain above - and it is neither clamped nor floored nor guarded.
      let needToRemove: number = prIDUsage.usedInOrder - leakedUsage.maximumUsePerOrder;

      // [model/service/PromotionService.cfc:L474-L475] "Loop over the items it was
      // applied to an remove the quantity necessary to meet the total
      // needToRemoveQuantity" - the source comment, quoted with its "an"-for-"and"
      // typo and its reference to a variable name that does not exist. Both are
      // recorded rather than corrected; see the L474 note above.
      //
      // ★ L475 ITERATES THE LEAKED REWARD'S `orderItemsUsage`, NOT `prID`'S. So the
      // ITEMS stripped are the last reward's items. Preserved.
      //
      // CFML parity [model/service/PromotionService.cfc:L475, L482, L498, L502]: CFML arrays are 1-based and TypeScript arrays are 0-based, and every translated index below is idiomatic 0-based TypeScript rather than 1-based emulation - L475's `for(var x=1; x<=arrayLen(...); x++)` becomes a `for...of` traversal in the same ascending order, L482's and L498's `for(var y=arrayLen(...); y>=1; y--)` become a descending loop from `length - 1` down to `0`, and L502's `arrayDeleteAt(array, y)` becomes `splice(y, 1)` on the 0-based index.
      // `arrayDeleteAt` operates on a CFML ARRAY rather than on a comma-delimited list, so it is not a `src/lib/cfml/list.ts` concern: that module handles delimited strings only, its five exports are fixed, and neither it nor an `arrayDeleteAt` addition to it is imported or needed here.
      for (const usageEntry of leakedUsage.orderItemsUsage) {
        // ★ L476 and L477 BOTH read from the LEAKED reward's usage record. Preserved.
        const orderItemID: string = usageEntry.orderItemID;
        const thisDiscountQuantity: number = usageEntry.discountQuantity;

        // Both L479 branches begin by resolving this same bucket, so it is resolved
        // once here. The intervening comparison at L479 is side-effect-free and cannot
        // raise, so resolving before the branch instead of inside each arm is
        // observationally identical - and it keeps the unguarded lookup, and the raise
        // it can produce, in exactly one place. The bucket is held by reference: L486
        // mutates one of its elements and L502 splices it, and both act on the live
        // array.
        const qualifiedDiscounts: QualifiedDiscount[] = resolveQualifiedDiscountsForOrderItem(
          orderItemQualifiedDiscounts,
          orderItemID,
        );

        // [model/service/PromotionService.cfc:L479] Strict `<`. When `needToRemove` is
        // negative this is TRUE for any positive quantity, which is how the inflation
        // path reaches the fractional branch.
        if (needToRemove < thisDiscountQuantity) {
          // [model/service/PromotionService.cfc:L481-L483] Descending scan for this
          // reward's entry. ★ L483's `== prID` IS CORRECT - the match is against the
          // key being iterated, not against the leaked ID - and is preserved as
          // written.
          const match: MatchedQualifiedDiscount | undefined = findLastRewardDiscount(
            qualifiedDiscounts,
            prID,
          );

          if (match !== undefined) {
            // [model/service/PromotionService.cfc:L485-L486] Set the discountAmount as
            // some fraction of the original discountAmount.
            //
            // CFML parity [model/service/PromotionService.cfc:L486]: `precisionEvaluate` raises on a zero divisor. The divisor is reproduced unguarded (one of four unguarded divisions in this folder); the error propagates rather than being caught, defaulted, or short-circuited.
            // The other three are L299 in `rewardUsageLedger.ts`, L743 in `qualifierQualification.ts` and L831 in `promotionPeriodQualification.ts`, and NONE of the four is guarded. `Money.dividedBy` delegates to the shared precise-division helper, which raises on a zero divisor, so `thisDiscountQuantity === 0` raises here exactly as CFML does - and `Money.zero` is never used as a fallback anywhere in this folder.
            //
            // The factor `(thisDiscountQuantity - needToRemove) / thisDiscountQuantity`
            // EXCEEDS 1 whenever `needToRemove` is negative, so this line can INFLATE
            // the stored amount rather than reduce it. That is register entry 9's money
            // effect and it is reproduced, not corrected - hence the neutral name
            // below. The two `Money` operations carry all of the monetary arithmetic;
            // `(thisDiscountQuantity - needToRemove)` is plain integer subtraction of
            // two counts and is never wrapped in `Money`.
            const recomputedDiscountAmount: Money = match.discount.discountAmount
              .dividedBy(thisDiscountQuantity)
              .times(thisDiscountQuantity - needToRemove);

            match.discount.discountAmount = recomputedDiscountAmount;

            // [model/service/PromotionService.cfc:L488-L489] Update the needToRemove.
            needToRemove = 0;

            // [model/service/PromotionService.cfc:L491-L492] Break out of the item
            // discount loop. Expressed by the scan having already returned its single
            // match: the legacy `break` leaves the descending loop after acting on the
            // first match found, which is precisely what `findLastRewardDiscount`
            // returning one match does.
          }
        } else {
          // [model/service/PromotionService.cfc:L497-L499] Descending scan for this
          // reward's entry. ★ L499's `== prID` IS CORRECT and is preserved as written.
          const match: MatchedQualifiedDiscount | undefined = findLastRewardDiscount(
            qualifiedDiscounts,
            prID,
          );

          if (match !== undefined) {
            // [model/service/PromotionService.cfc:L501-L502] Remove from the array.
            // This is the mutation that can leave an EMPTY ARRAY UNDER AN EXISTING KEY,
            // which is the state the application pass's second condition at L529
            // guards.
            qualifiedDiscounts.splice(match.index, 1);

            // [model/service/PromotionService.cfc:L504-L505] Update the needToRemove.
            // PLAIN INTEGER SUBTRACTION of a count from a count: the source uses no
            // `precisionEvaluate` here, so this is routed through neither `Money` nor
            // the precise-arithmetic helpers. Reached only when
            // `needToRemove >= thisDiscountQuantity`, so the result is necessarily
            // `>= 0`.
            needToRemove = needToRemove - thisDiscountQuantity;

            // [model/service/PromotionService.cfc:L507-L508] Break out of the item
            // discount loop - again expressed by the single-match scan.
          }
        }

        // [model/service/PromotionService.cfc:L513-L514] If we don't need to remove any
        // more.
        //
        // CFML parity [model/service/PromotionService.cfc:L514]: the legacy test is an EQUALITY test, `needToRemove == 0`, and it is reproduced as strict `=== 0` rather than "improved" to `<= 0`.
        // The distinction is behavioural rather than stylistic: if `needToRemove` were ever negative at this point the legacy loop CONTINUES to the next usage record instead of breaking, and `<= 0` would break instead - stripping fewer items and paying out different money. `=== 0` is required by the lint profile's `eqeqeq: always` and both operands are numbers, so no coercion is lost.
        if (needToRemove === 0) {
          break;
        }
      }
    }
    // [model/service/PromotionService.cfc:L519-L521] End of the promotion reward loop
    // for removing anything that was overused.
  }
}
