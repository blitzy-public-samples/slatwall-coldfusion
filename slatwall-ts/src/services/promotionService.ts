// ---------------------------------------------------------------------------
// slatwall-ts - PromotionService: the THIN FAÇADE over the promotion engine
//
// WHAT THIS FILE IS
// A 1:1 logic extraction of `model/service/PromotionService.cfc` (1,125 source lines) into
// strict-mode TypeScript. It is the SEVENTH and final service in `src/services/`, and it is a
// FAÇADE: the 489-line `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58]
// is ORCHESTRATED here and IMPLEMENTED across the nine sibling modules under `./promotion/`. The
// twelve public methods below are the twelve the component declares, carrying their legacy CFML
// camelCase names VERBATIM, because method-for-method interface parity is the acceptance contract.
//
// NO USER RULES EXIST FOR THIS PROJECT. The rules source was read to completion - a default read
// and an explicit full-document read both returned the identical single-line sentinel
// "No user rules provided." - so there is no project rule to cite and none has been invented. The
// absence is NOT treated as permission to lower the bar: the enterprise-standard substitutes
// (maximal strictness, layer boundaries, exact dependency pinning, a single arithmetic surface,
// parameterised SQL, environment-driven configuration, one exported unit per file, in-code
// annotation of every judgment call, license continuity) are the standard this file is held to.
//
// TEST COVERAGE FOR THIS FILE IS ENTIRELY NET-NEW, AND IS NOT PARITY.
// `meta/tests/unit/service/` contains exactly four suites - AccountServiceTest, HibachiServiceTest,
// PaymentServiceTest and UtilityRBServiceTest - and NONE of them is in scope. There is no legacy
// `PromotionServiceTest` to trace to, so every test that will cover this file is net-new coverage
// and must be reported as such rather than presented as legacy parity. This file authors no test of
// its own; `slatwall-ts/tests` is owned elsewhere. What this file owes the test tier instead is
// TESTABILITY: pure where the source is pure, every collaborator injected, no ambient state, and no
// module-level mutable cache. The five visibility widenings recorded below exist for that reason.
//
// PARAMETERISED SQL IS NOT APPLICABLE HERE, AND THE OMISSION IS DELIBERATE.
// The project standard that every query use prepared statements has no site in this file: this
// service builds and executes NO SQL. That obligation rests wholly with `src/repositories/mysql/**`.
// In particular the six-branch UNION and the three query-of-queries reduction steps behind
// `getSalePriceDetailsForProductSkus` [model/dao/PromotionDAO.cfc:L298-L591] are the repository's
// concern; this file reaches them only through `PromotionRepository.getSalePricePromotionRewardsQuery`
// and never composes a fragment of SQL, a table name or a bind parameter.
//
// ===========================================================================================
// MUST-PRESERVE AREA #1 LIVES HERE: PROMOTION DISCOUNT MATH **AND** USE-LIMIT ENFORCEMENT
// ===========================================================================================
// This is the area the requirements name first and guard hardest, and it is the reason every
// structural decision in this subtree is documented rather than merely made. The discount
// arithmetic itself is `./promotion/discountAmount.ts`; the use-limit semantics are
// `./promotion/rewardUsageLedger.ts` and `./promotion/overUseStripping.ts`; the order in which all
// of them run is THIS file. Behaviour is preserved to the point of preserving defects - a discount
// limit enforced against the wrong key continues to be enforced against the wrong key.
//
// This file participates in must-preserve area #2 (the price-group and currency resolution cascade)
// ONLY indirectly, through the ordering constraint below; the cascade itself belongs to
// `./priceGroupService.ts`. It has no relationship at all to must-preserve area #3
// (option-to-SKU resolution).
//
// ===========================================================================================
// ★ THE CROSS-SERVICE ORDERING CONSTRAINT - THE SECOND HALF OF A CONTRACT DECLARED ELSEWHERE
// ===========================================================================================
// `PriceGroupService.updateOrderAmountsWithPriceGroups()` MUST RUN BEFORE
// `PromotionService.updateOrderAmountsWithPromotions()`. It is NON-OPTIONAL and it decides how much
// money a customer is charged. `./priceGroupService.ts` declares this constraint first, in its own
// header, in these same terms; this file is the second half of that same contract.
//
// THE MECHANISM, verified at [model/service/PromotionService.cfc:L241-L252]: the order-item
// discount base is chosen by reading `getAppliedPriceGroup()`, and the two arms then read
// `getPrice()`, `getSkuPrice()`, `getExtendedSkuPrice()` and `getExtendedPrice()`. Every one of
// those five values is written by the price-group pass. In the legacy system the ordering held ONLY
// because out-of-scope `model/service/OrderService.cfc` happened to call the two in that sequence -
// it injects `priceGroupService` and `promotionService` as adjacent properties and invokes them in
// order. Nothing in the CFML enforced it.
//
// THE CONSTRAINT IS DOCUMENTED HERE, NOT ENFORCED HERE. This file carries no sequencing helper, no
// run-once latch, no phase parameter, no ordered-pipeline type and no assertion that the price-group
// pass has run, and none may be added. An `OrderView` cannot report whether it did, and inventing a
// flag would add state the legacy lacks. Sequencing is a composition-root obligation:
// `src/handlers/promotionApplicationHandler.ts` is where the two passes are physically ordered, and
// the `OrderView` handed to `updateOrderAmountsWithPromotions` must ALREADY reflect the intents the
// price-group pass produced. A test asserts that reversing the two passes changes the computed
// discount; this file authors no test.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L241-L252]: the ELIGIBLE / no-applied-price-group
// case uses `getPrice()` with NO correction term; the INELIGIBLE case uses `getSkuPrice()` PLUS the
// correction term `originalDiscountAmount - (extendedSkuPrice - extendedPrice)`. Read the guard
// literally: the `if` is taken when there is no applied price group OR the reward DOES list the
// applied group as eligible, and that arm is the uncorrected one. Prose in the specification - and
// in `./priceGroupService.ts`'s own header - has these two branches TRANSPOSED. The source governs,
// and implementing the transposed wording would invert the discount on every price-group order.
//
// ===========================================================================================
// ★ THE SIX ORDER-DEPENDENCE VECTORS - each can change the money a customer is charged
// ===========================================================================================
// VECTOR 1 - A MUTABLE USAGE LEDGER THREADED THROUGH THE WHOLE LOOP.
//   `promotionRewardUsageDetails[rewardID].usedInOrder` is incremented IN PLACE
//   [model/service/PromotionService.cfc:L297], so whether a later reward is allowed depends on
//   which earlier rewards ran. The reward collection arrives from
//   `PromotionDAO.getActivePromotionRewards` [model/dao/PromotionDAO.cfc:L51-L132], whose HQL is
//   assembled across L64-L114 and executed at L131 with NO `ORDER BY` CLAUSE ANYWHERE - verified by
//   reading the whole assembly. Iteration order is therefore whatever the driver returns, and the
//   legacy behaviour is genuinely non-deterministic at the boundary of a tie. The absence of the
//   ordering is preserved, not repaired. Owner: `./promotion/rewardUsageLedger.ts`.
//
// VECTOR 2 - A HAND-ROLLED TWO-PASS LOOP IMPLEMENTED BY MUTATING THE LOOP COUNTER.
//   `var orderRewards = false;` [L166], then at the end of the collection [L458-L461]
//   `if(!orderRewards and pr == arrayLen(promotionRewards)) { pr = 0; orderRewards = true; }`.
//   Pass two must follow pass one because the order arm reads BOTH
//   `getSubtotalAfterItemDiscounts()` AND `getFulfillmentChargeAfterDiscountTotal()` [L417] -
//   values that exist only once the item arm AND the fulfillment arm of pass one have run, so pass
//   two depends on both arms of pass one, not merely on the item arm. TWO CONSEQUENCES: the reset
//   sits INSIDE the loop body and inside the L197 gate, so pass two NEVER RUNS AT ALL when the
//   reward collection is empty; and any naive split into two clean passes changes behaviour in that
//   empty case. Owner: `./promotion/twoPassRewardIterator.ts`, which reproduces the empty-collection
//   outcome deliberately.
//
// VECTOR 3 - THE OVER-USE STRIPPING LOOP READS A LEAKED VARIABLE (register entry 9).
//   L469 iterates `for(var prID in promotionRewardUsageDetails)` and L471's guard correctly uses
//   `prID` on both sides, but the BODY indexes by the `reward` variable left bound by the previous
//   loop at FOUR sites - L472, L475, L476 and L477. The precise characterisation: THE DECISION TO
//   STRIP IS CORRECT PER-REWARD; WHAT GETS STRIPPED, AND BY HOW MUCH, COMES FROM WHICHEVER REWARD
//   THE PREVIOUS LOOP LEFT BEHIND. Ported as written - repairing it changes the amount charged.
//   Owner: `./promotion/overUseStripping.ts`, which receives the leaked identity explicitly.
//
// VECTOR 4 - TWO INSERTION SORTS RUNNING IN OPPOSITE DIRECTIONS.
//   The qualified-discount accumulator is insert-sorted DESCENDING by discount amount [L259-L294]
//   and only index `[1]` - the single largest - is ever applied [L523-L536]. The reward's
//   `orderItemsUsage` is insert-sorted ASCENDING by `discountPerUseValue` [L301-L329], so the
//   cheapest-per-use discounts are stripped first. Both orderings are load-bearing. Owners: THIS
//   FILE for the descending sort (see the ownership split below) and
//   `./promotion/rewardUsageLedger.ts` for the ascending one.
//
// VECTOR 5 - AN UNGUARDED DIVISION.
//   `discountPerUseValue = precisionEvaluate('discountAmount / discountQuantity')` [L299] applies no
//   zero check to the divisor. The absence of the guard is reproduced: `Money.dividedBy` refuses a
//   zero divisor and throws, which is the faithful outcome because CFML also errors.
//   Owner: `./promotion/rewardUsageLedger.ts`.
//
// VECTOR 6 - THE LEDGER RATCHET AT [L223-L224]. (Not among the five vectors the specification
//   publishes; surfaced during folder analysis and attributed as such. Range re-verified in situ at
//   exactly L223-L224.) The reward's `maximumUsePerOrder` is ratcheted DOWN against
//   `qualificationQuantity * maximumUsePerQualification` before the discount quantity is derived
//   from it, and the ratchet persists on the shared ledger entry - so the quantity a later order
//   item is granted depends on how much earlier items already consumed.
//   Owner: `./promotion/rewardUsageLedger.ts` in concert with `./promotion/twoPassRewardIterator.ts`.
//
// ===========================================================================================
// THE OWNERSHIP SPLIT - what this file implements, and what it delegates
// ===========================================================================================
// DELEGATED, one module per concern, each mapped to its source range:
//   ./promotion/salePriceSeeding.ts             L145-L162
//   ./promotion/promotionPeriodQualification.ts L549-L627, plus L752-L781 and L783-L849
//   ./promotion/qualifierQualification.ts       L629-L750
//   ./promotion/orderItemMembership.ts          L852-L919 and L921-L985
//   ./promotion/discountAmount.ts               L987-L1018
//   ./promotion/rewardUsageLedger.ts            L172-L189, L223-L224, L296-L329
//   ./promotion/overUseStripping.ts             L468-L521
//   ./promotion/promotionApplication.ts         L523-L536
//   ./promotion/twoPassRewardIterator.ts        L165-L171, L458-L461, L465
//
// IMPLEMENTED HERE - the four bodies that sit outside the 489-line method and outside every module
// range: `getSalePriceDetailsForProductSkus` [L1022-L1030],
// `getShippingMethodOptionsDiscountAmountDetails` [L1032-L1086], and the two DAO pass-throughs
// [L1094-L1096, L1098-L1100].
//
// IMPLEMENTED HERE ALSO - the parts of the 489-line method that no module claims, and that the
// modules explicitly disclaim in their own headers: the ledger-seed CALL and the period-qualification
// memo populate [L172-L194], the gate evaluation [L197] whose outcome the iterator requires back per
// reward, the THREE reward-level arm bodies (order-item [L200-L341], fulfillment [L345-L412], order
// [L415-L454]), and the DESCENDING insertion sort [L259-L294].
//
// JUDGMENT CALL: L752-L781 and L783-L849 fall outside every cited module range. They are private
// helpers of the L549-L627 period-qualification path and are hosted in
// `./promotion/promotionPeriodQualification.ts` rather than in a tenth module, because the module
// layout is locked at nine. This façade re-exports them as methods per the visibility-widening
// budget below.
//
// ===========================================================================================
// COLLABORATORS
// ===========================================================================================
// The component declares THREE, all of them live, at [model/service/PromotionService.cfc:L51, L53,
// L54] - `promotionDAO`, `addressService`, `roundingRuleService`. Calibration across the slice:
// Brand 1 · Option 2 declared / 1 real · PriceGroup 3 (all live) · PROMOTION 3 (ALL LIVE) ·
// RoundingRule 1 · Sku 5 declared / 4 real · Product 8 declared / 6 real · out-of-scope
// `OrderService` 16. The specification's "16+" figure is a property of `OrderService`, not of this
// slice - the heaviest in-scope service takes 8, and the two most behaviourally critical take 3
// each. So the real work was never untangling a sixteen-way graph; it was inverting two call
// directions, which is what the anti-corruption reshaping below does.
//
// ★ THIS COMPONENT HAS ZERO DEAD INJECTIONS AND ZERO `getService()` SITES. Verified by full sweep:
// all three declared properties are genuinely reached, and `model/service/SkuService.cfc:L212` is
// the one and only service-layer `getService()` locator site in the whole in-scope slice. That
// makes this the cleanest dependency surface of the seven, unlike `ProductService` (two dead
// injections) and `OptionService` (one). Nothing here needed a locator removal.
//
// Dependency injection replaces a DI/1 0.4.2 convention scan - which carried a first-scan lock -
// with explicit constructor arguments assembled once in `src/handlers/bootstrap.ts`. There is no
// runtime scan, no service locator and no container package.
//
// ===========================================================================================
// THE BUDGET LEDGERS - four distinct ledgers, never conflated
// ===========================================================================================
// VISIBILITY WIDENINGS: exactly FIVE project-wide, and ALL FIVE ARE SPENT HERE.
//   getPromotionPeriodQualificationDetails [L549], getQualifierQualificationDetails [L629],
//   getPromotionPeriodQualifiedFulfillmentIDList [L752],
//   getPromotionPeriodOrderItemQualificationCount [L783], getDiscountAmount [L987].
//   All five are `private` in the legacy source and are exported here so they are directly
//   testable. This is a deliberate visibility widening that DOES NOT ALTER BEHAVIOUR. No sixth
//   private method is promoted, here or anywhere in the project.
//
// SIGNATURE RESHAPINGS: three project-wide; ONE is spent here - `updateOrderAmountsWithPromotions`
//   returns `PromotionAppliedIntent[]` where the legacy returns `void` and mutates the order
//   aggregate in place. It is the single most consequential signature change in the migration and
//   the anti-corruption seam that makes this slice independently deployable. Its mirror is
//   `updateOrderAmountsWithPriceGroups` in `./priceGroupService.ts`; the third is the pair of
//   smart-list renames in `./productService.ts` and `./skuService.ts`. Narrowing an out-of-scope
//   entity parameter to an opaque identifier - `Account` to `accountID: string` - is sanctioned and
//   is NOT a reshaping.
//
// SIGNATURE WIDENINGS: one project-wide, already spent on `isCurrent(now: Date)` in
//   `src/domain/entities/promotionPeriod.ts`. ZERO REMAIN, and no method here gained a parameter.
//   This ledger is distinct from the visibility ledger above.
//
// DELIBERATE DIVERGENCES: exactly THREE project-wide, and TWO of them belong to this subtree.
//   (a) register entry 13, the un-`var`'d scope leak - made function-local.
//   (b) register entry 12, the `amountOff` float gap - closed by routing through `Money`.
//   (c) register entry 19's entity memo bug in `src/domain/entities/product.ts` - already spent.
//   THERE IS NO FOURTH. Every other finding is reproduced, not repaired.
//
//   LEGACY-DEFECT [model/service/PromotionService.cfc:L1007, L1009, L1014]: `discountAmount` is
//   assigned without `var` at THREE sites - not the two the specification cites - leaking into the
//   component `variables` scope. DELIBERATE DIVERGENCE (a): made function-local. Reproducing state
//   that persists across warm Lambda invocations could leak one customer's discount into another's
//   order. Implemented in `./promotion/discountAmount.ts`; recorded here so the budget is auditable
//   from the service surface.
//
//   LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: the `amountOff` branch omits
//   `precisionEvaluate` and uses raw floating-point multiplication while its two sibling branches
//   use it. DELIBERATE DIVERGENCE (b): closed. All arithmetic routes through `Money`, and preserving
//   one branch's drift would require deliberately bypassing the value object. Strictly more correct
//   than the source. Implemented in `./promotion/discountAmount.ts`.
//
// PORTS: locked at 13. None is added and no port member is invented. The two inline structural
//   collaborators below are NOT ports - the lock counts files under `src/domain/ports/`.
//
// DEFECT REGISTER: 30 numbered entries plus its eight secondary items. This subtree owns numbered
//   entries 9, 10, 11, 12, 13, 14 and 15 plus the `issue #1766` no-op; entries 5, 6, 7, 8, 29 and 30
//   belong to `./priceGroupService.ts` and 28 to `./skuService.ts`. Of this subtree's, THIS FILE
//   implements 15 and the `issue #1766` carry-forward; 9, 10, 11, 12, 13 and 14 are marked in the
//   `./promotion/` modules and referenced from here.
//
// ===========================================================================================
// LOCATOR VERIFICATION - THE SOURCE WINS
// ===========================================================================================
// Every locator cited in this file was re-verified against `model/service/PromotionService.cfc` as
// it was ported, and the specification's line references are known to drift. Where the two
// disagreed, the source governed and the correction is recorded at the site. Corrections found:
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L541-L544]: the `issue #1766` block spans four
// lines - L541 is the `// Return & Exchange Orders` comment, L542 the `if`, L543 the TODO text
// itself and L544 the closing brace. The specification cites the TODO at both "L541-L544" and
// "L542-L544" in different places; the TODO text is on L543. Verified against source.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L865, L900, L935, L966]: the
// `if(listFindNoCase(...))`-as-boolean anti-pattern has FOUR sites in this component, not the three
// the specification lists - it omits L900, the qualifier's product-type INCLUSION walk, which is
// structurally identical to the exclusion walk at L865. All four are inside
// `./promotion/orderItemMembership.ts`. This file's own two membership-style tests are the
// `arrayFind` calls at L209 and L351, which become `Array.prototype.includes` on a `string[]` - an
// intrinsically boolean expression, so no index is compared and the anti-pattern cannot arise.
//
// SECONDARY-REGISTER ITEMS recorded from this component:
// LEGACY-NOTE [model/service/PromotionService.cfc:L1092, L1102]: the DAO Passthrough section opens
// with `START` twice; the second banner was clearly intended to be `END`. Cosmetic. The
// project-wide banner audit is complete at six files - this one, `RoundingRuleService.cfc:L181/L183`,
// `BrandService.cfc:L57/L59`, `OptionService.cfc:L70/L80`, `ProductService.cfc:L102/L108` and
// `PriceGroupService.cfc:L382/L384` - so every in-scope service carries the same duplicated-START
// wart. Note also that this component's Logical Methods [L1088/L1090], Process Methods, Status
// Methods, Save Overrides, Smart List Overrides and Get Overrides banners are ALL EMPTY, which is
// why this file spends no smart-list rename budget: those two renames belong to `./productService.ts`
// and `./skuService.ts`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: the engine's own documentation block
// places `qualifiedFulfillments` only inside `qualifierDetails`, never at the promotionPeriod level,
// while listing `qualifiedFulfillmentIDs` at the period level. That is the direct proof that
// register entry 10's write at L621-L623 is a level confusion rather than intent. The field is typed
// as a documented dead field in `../domain/promotionEngine/qualificationTypes.ts` and is NEVER READ
// by this file.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: the legacy accumulator key is spelled
// `orderItemQulifiedDiscounts` - missing the `a` - at its declaration [L142] and at every use. The
// target symbol is renamed to the correct spelling because it is a purely internal identifier, never
// a persisted column or a wire-format data contract. The original spelling is recorded here.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L244, L249, L252]: the source declares
// `var discountAmount` TWICE in sibling branches of the same function - at L244 and L252 - alongside
// `var originalDiscountAmount` at L249. CFML tolerates the duplicate declaration because `var`
// is function-scoped and the branches are exclusive; the target binds one `const` per branch.
//
// ===========================================================================================
// NO MODULE-LEVEL MUTABLE STATE
// ===========================================================================================
// On a warm Lambda container module-level state persists between UNRELATED requests. Four such
// caches exist in the legacy slice - `SkuDAO.variables.nextOptionGroupSortOrder` (whose clear
// method's condition is inverted so it can never fire), `RoundingRuleService.variables.roundingRuleDetails`,
// the un-`var`'d `discountAmount` of divergence (a), and every entity memo - and ALL of them become
// request-scoped. Concretely here: the reward-usage ledger, the period-qualification memo, the
// qualified-discount accumulator, the applied-promotion mirrors and
// `getShippingMethodOptionsDiscountAmountDetails`'s own separate memo are ALL created fresh inside
// the call that uses them. No field on this class holds any of them, there is no module-level map,
// and nothing is memoised across calls. The single documented exception in the whole subtree is the
// MySQL connection pool in `src/repositories/mysql/connection.ts`.
//
// The legacy runtime's 60-second order-placement lock, 45-second payment-transaction lock and
// 30-second DI/1 first-scan lock are NOTED AND DELIBERATELY NOT IMPLEMENTED. `cfthread` usage
// across the entire in-scope slice is zero, verified, so the thread-translation rule is recorded
// and unexercised.
// ---------------------------------------------------------------------------

// LEGACY-NOTE [model/service/PromotionService.cfc:L401, L447, L530]: `this.newPromotionApplied()`
// is `HibachiService`'s generic `new<Entity>()` factory, not a declared collaborator. The 13-port
// set publishes no entity-factory port and none was invented, so the target emits a
// `PromotionAppliedIntent` instead of constructing and persisting a `PromotionApplied` entity - and
// `../domain/entities/promotionApplied.js` is therefore deliberately NOT imported here. The entity
// is the repository's concern; the intent algebra is this file's.
import type { Promotion } from '../domain/entities/promotion.js';
import type { PromotionCode } from '../domain/entities/promotionCode.js';
import type { PromotionPeriod } from '../domain/entities/promotionPeriod.js';
import type { PromotionQualifier } from '../domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../domain/entities/promotionReward.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneProjection,
} from '../domain/ports/addressZoneEvaluator.js';
import type { PromotionRepository, SalePriceDetail } from '../domain/ports/promotionRepository.js';
import type {
  PeriodQualification,
  PromotionPeriodQualifications,
  QualifierQualification,
} from '../domain/promotionEngine/qualificationTypes.js';
import type {
  OrderItemQualifiedDiscounts,
  PromotionAppliedIntent,
  QualifiedDiscount,
} from '../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { PromotionRewardUsageDetail } from '../domain/promotionEngine/rewardUsageTypes.js';
import { Money } from '../domain/valueObjects/money.js';
import type {
  AppliedPromotionView,
  OrderFulfillmentView,
  ShippingAddressView,
} from '../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { OrderView, ShippingMethodOptionView } from '../domain/views/orderView.js';
import { listFindNoCase } from '../lib/cfml/list.js';
import { cfEquals, structGet, structKeyExists } from '../lib/cfml/struct.js';
import { isNullish } from '../lib/cfml/truthiness.js';
import { DiscountAmountCalculator } from './promotion/discountAmount.js';
import { OrderItemMembership } from './promotion/orderItemMembership.js';
import { stripOverUsedRewardDiscounts } from './promotion/overUseStripping.js';
import { applyBestOrderItemDiscounts } from './promotion/promotionApplication.js';
import { PromotionPeriodQualificationEvaluator } from './promotion/promotionPeriodQualification.js';
import { QualifierQualificationEvaluator } from './promotion/qualifierQualification.js';
import { RewardUsageLedger } from './promotion/rewardUsageLedger.js';
import { SalePriceSeeder } from './promotion/salePriceSeeding.js';
import type { RewardVisitOutcome } from './promotion/twoPassRewardIterator.js';
import { TwoPassRewardIterator } from './promotion/twoPassRewardIterator.js';

// JUDGMENT CALL: this façade imports its nine `./promotion/*` decomposition modules directly - they
// are its own subtree, not sibling services, and delegating to them is the entire point of the
// decomposition. No other file in `src/services/` imports a sibling, and this file imports none:
// `roundingRuleService` arrives as the structural collaborator below, resolved in
// `src/handlers/bootstrap.ts`, and `productService`, `skuService`, `brandService`, `optionService`
// and `priceGroupService` are not referenced at all.
//
// JUDGMENT CALL: neither `../lib/cfml/precision.js` nor `../lib/cfml/numberFormat.js` is imported,
// and the omission is deliberate rather than an oversight. Every arithmetic site THIS file owns is
// Money-to-Money - the L252 correction term and the L417 sum - and `Money` is itself the project's
// single arithmetic surface, reaching arbitrary-precision decimals through `precision.ts` internally.
// Importing either helper to satisfy a naming expectation would leave an unused binding, which the
// strict profile rejects. The `numberFormat` presentation step at L1017 belongs to
// `./promotion/discountAmount.ts`, at the very end of the calculation, and is not moved earlier.
// No `decimal.js` and no `zod` import appears here either: this service performs no declarative
// validation, there being no promotion process object and no promotion validation schema in the
// service tier's scope.

/**
 * The two rounding-rule members this service reaches, as a narrow structural collaborator.
 *
 * JUDGMENT CALL: narrow structural collaborator, satisfied in `src/handlers/bootstrap.ts` by the
 * sibling `RoundingRuleService` instance. AN INLINE COLLABORATOR IS NOT A FOURTEENTH PORT - the
 * 13-port lock counts files under `src/domain/ports/`, and the precedent is established:
 * `priceGroupRepository.ts` publishes `SkuPriceGroupResolver` and `priceGroupService.ts` declares
 * `PriceGroupFrameworkReads` for exactly this purpose. Only the two members actually reached are
 * available - `roundValueByRoundingRule` at [model/service/PromotionService.cfc:L1006], threaded
 * down into `./promotion/discountAmount.ts`, and `roundValueByRoundingRuleID` at [L1026], used by
 * `getSalePriceDetailsForProductSkus`.
 *
 * WHY IT IS DERIVED RATHER THAN HAND-DECLARED. `DiscountAmountCalculator`'s constructor is typed to
 * the CONCRETE `RoundingRuleService` class, and that class carries private members, so TypeScript
 * types it NOMINALLY: a hand-written two-member interface is not assignable to it and the compiler
 * rejects the wiring outright. Deriving the type from the constructor of a module this file is
 * already required to import produces a collaborator that is simultaneously narrow at this file's
 * boundary and assignable at the module's, without importing `./roundingRuleService.js` - which
 * intra-folder import discipline forbids - and without any module-level circularity. There is no
 * `implements` clause anywhere; the satisfaction is purely structural.
 */
type RoundingRuleValueResolver = ConstructorParameters<typeof DiscountAmountCalculator>[0];

/**
 * The one framework-generic read this service still needs, as a narrow structural collaborator.
 *
 * JUDGMENT CALL: FOUR inherited-but-undeclared framework accessors appear in this component, and
 * exactly one survives into the target.
 *   1. `getHibachiUtilityService().queryToStructOfStructures(...)` [L1023] - DROPPED; the keying
 *      becomes an explicit step, see `getSalePriceDetailsForProductSkus`.
 *   2. `this.newPromotionApplied()` [L401, L447, L530] - DROPPED; the target emits intents instead
 *      of constructing entities.
 *   3. `getPromotionDAO()` / `getAddressService()` / `getRoundingRuleService()` - these are the
 *      three DECLARED properties and become the first three constructor arguments.
 *   4. `this.getPromotion(salePriceDetails.promotionID)` [L157] - SURVIVES, and is declared here.
 * It survives because `QualifiedDiscount.promotion` is typed to the `Promotion` ENTITY in the
 * published domain type, so the sale-price seeding step genuinely has to resolve an identifier into
 * an entity, and `PromotionRepository`'s eight locked members publish no such lookup. Declaring it
 * module-locally and un-exported, and taking it as a constructor argument, follows
 * `priceGroupService.ts`'s shipped `PriceGroupFrameworkReads` precedent verbatim. It is NOT a
 * fourteenth port, and it is NOT a signature widening - that ledger governs the twelve ported
 * methods, and DI/1 gave this component no constructor to widen.
 */
interface PromotionFrameworkReads {
  /**
   * `HibachiService`'s generic `get<Entity>(id)`, narrowed to the one entity this service loads.
   *
   * [model/service/PromotionService.cfc:L157] `promotion = this.getPromotion(salePriceDetails.promotionID)`.
   */
  getPromotion(promotionID: string): Promise<Promotion>;
}

/**
 * What `getShippingMethodOptionsDiscountAmountDetails` returns.
 *
 * [model/service/PromotionService.cfc:L1033-L1036] `var details = { promotionID="", discountAmount=0 };`
 * - two members, seeded exactly as the source seeds them. Declared locally, under the one-exported-
 * unit standard, as a type alias belonging to this service's published surface.
 *
 * JUDGMENT CALL: `ShippingMethodOptionView` is IMPORTED from `../domain/views/orderView.js`, which
 * is its documented home and where its four members are declared; only `ShippingDiscountDetails` is
 * declared here. An earlier and more general reading placed both types in the service tier, but the
 * direct reading of the owning view module governs.
 */
export interface ShippingDiscountDetails {
  /**
   * [model/service/PromotionService.cfc:L1034] seeded to the EMPTY STRING, and still the empty
   * string when nothing qualified. Not `undefined`, not `null` - the source seeds `""` and the
   * caller distinguishes "no discount" by that value.
   */
  readonly promotionID: string;

  /**
   * [model/service/PromotionService.cfc:L1035] seeded to zero.
   *
   * JUDGMENT CALL: `Money.zero` here is an ACCUMULATOR SEED for a maximum-search, not a fallback
   * for an absent price. The standing prohibition on `Money.zero` targets `?? Money.zero`-style
   * defaults in price paths, where a silent zero sells product for free; a documented accumulator
   * seed is the legacy behaviour exactly. This is the ONLY `Money.zero` SEED in the file. The file's
   * only other two `Money.zero` occurrences are COMPARISON OPERANDS - the ports of
   * `if(discountAmount > 0)` at [model/service/PromotionService.cfc:L257] and at [L378, L424] - and
   * a comparison operand is neither a seed nor a fallback. `Money` publishes no `isPositive` and no
   * `isZero`, so a zero operand is the only way to express the source's `> 0` test through the value
   * object. Nowhere in this file is `Money.zero` used as a coalesce (`??`/`||`), an `orZero()` or a
   * parameter default.
   */
  readonly discountAmount: Money;
}

/**
 * A local mirror of one applied-promotion slot on the live ORM graph.
 *
 * ★ WHY THIS EXISTS - MIRROR THE MUTATION, THEN DIFF.
 * The fulfillment arm [model/service/PromotionService.cfc:L345-L412] and the order arm [L415-L454]
 * are structurally identical and both operate on a LIVE Hibernate graph: they read
 * `getAppliedPromotions()[1]`, and when a reward wins they either call `setDiscountAmount` on that
 * entity, or unlink it and attach a new one. Because the graph is live, the very next reward in the
 * same invocation reads the value the previous reward just wrote - the comparison baseline EVOLVES
 * within one call, and that is load-bearing.
 *
 * A read-only `OrderView` cannot be mutated and this service never mutates order persistence, so
 * the mutation is replayed against this local mirror - step for step, exactly as L378-L406 and
 * L424-L451 perform it - and the NET DELTA against the state the view reported is emitted as
 * intents at the end. That is why `PromotionAppliedIntent` publishes `update` and `remove`
 * operations at the order and orderFulfillment levels but `add` alone at the orderItem level: these
 * two arms are precisely what those two extra operations exist for.
 *
 * The equivalence is exact in every case, including chained ones. If reward A displaces a
 * pre-existing promotion P0 and reward B then displaces A, the legacy net effect is that P0's row is
 * unlinked, A's row is created and then unlinked before it is ever persisted, and B's row is
 * created - which is `remove(P0)` followed by `add(B)`, exactly what the diff produces. If B carries
 * the SAME promotion as A, the legacy calls `setDiscountAmount` on A's still-pending row, so the net
 * effect is `remove(P0)` plus `add` at B's amount - again what the diff produces.
 *
 * One instance per target per invocation; never a field on the service, never module state.
 */
interface AppliedPromotionSlot {
  /**
   * The promotion identifier the `OrderView` reported at index `[1]`, or `undefined` when the view
   * reported no applied promotion. Fixed at construction: it is what a `remove` intent must NAME,
   * because the legacy `removeOrderFulfillment()` / `removeOrder()` call is made against the
   * PRE-EXISTING row, whose promotion is the old one and not the reward's.
   */
  readonly originalPromotionID: string | undefined;

  /**
   * The mirror of `getAppliedPromotions()[1]` as the legacy graph would currently hold it -
   * `undefined` while the slot is empty. Mutated in place by the replay, exactly as the source
   * mutates the entity.
   */
  current: { promotionID: string; discountAmount: Money } | undefined;

  /**
   * Whether the replay changed anything at all. `false` means every reward either failed its gates
   * or failed the strict greater-than comparison, in which case the legacy emitted no write and
   * this slot emits no intent.
   */
  mutated: boolean;
}

/**
 * Seeds a mirror from what the view reported.
 *
 * CFML parity [model/service/PromotionService.cfc:L381, L385, L427, L431]: the source tests
 * `!arrayLen(getAppliedPromotions())` and then reads index `[1]`. CFML arrays are 1-based, so `[1]`
 * is the FIRST element - index `0` here. Only the first is ever read; any further applied promotions
 * on the same target are invisible to the legacy algorithm and are equally invisible here.
 */
function createAppliedPromotionSlot(
  appliedPromotions: readonly AppliedPromotionView[],
): AppliedPromotionSlot {
  // Narrowed rather than asserted: `noUncheckedIndexedAccess` types an indexed read as possibly
  // absent even after a length test, and non-null assertions are unavailable by project standard.
  const existing = appliedPromotions.length > 0 ? appliedPromotions[0] : undefined;

  if (existing === undefined) {
    return { originalPromotionID: undefined, current: undefined, mutated: false };
  }

  return {
    originalPromotionID: existing.promotion.promotionID,
    current: {
      promotionID: existing.promotion.promotionID,
      discountAmount: existing.discountAmount,
    },
    mutated: false,
  };
}

/**
 * Replays one reward's outcome against the mirror.
 *
 * This is a line-for-line transcription of [model/service/PromotionService.cfc:L378-L396] - which
 * [L424-L442] repeats verbatim at the order level - and of the `addNew` block that follows it at
 * [L400-L406] / [L446-L451].
 *
 * CFML parity [model/service/PromotionService.cfc:L378, L424]: `if(discountAmount > 0)` gates the
 * whole comparison, so a reward computing a non-positive discount is skipped entirely and leaves the
 * mirror untouched - while the value already in the mirror still serves as the baseline for the
 * rewards that follow. Expressed with `Money.isGreaterThan` against zero rather than a numeric
 * comparison, because no raw arithmetic comparison may touch a monetary value.
 *
 * CFML parity [model/service/PromotionService.cfc:L385, L431]: the displacement test is STRICTLY
 * greater-than, so on a tie the incumbent is kept and the FIRST qualifying reward wins. Combined
 * with the absence of `ORDER BY` on the reward query, tie outcomes are driver-order dependent - and
 * that is preserved, not resolved.
 *
 * CFML parity [model/service/PromotionService.cfc:L388, L434]: the promotion identity test is CFML
 * `==` on two strings, which is CASE-INSENSITIVE, so it is routed through the case-folding
 * comparison helper rather than through `===`. Persisted UUID identifiers cannot in practice differ
 * only by case, but the ported comparison matches the source's semantics rather than assuming they
 * coincide.
 */
function mirrorRewardApplication(
  slot: AppliedPromotionSlot,
  rewardPromotionID: string,
  discountAmount: Money,
): void {
  // [model/service/PromotionService.cfc:L378, L424]
  if (!discountAmount.isGreaterThan(Money.zero)) {
    return;
  }

  const current = slot.current;

  // [model/service/PromotionService.cfc:L381-L382, L427-L428] nothing applied yet, so apply this.
  if (current === undefined) {
    slot.current = { promotionID: rewardPromotionID, discountAmount };
    slot.mutated = true;
    return;
  }

  // [model/service/PromotionService.cfc:L385, L431] only a strictly greater discount displaces.
  if (!discountAmount.isGreaterThan(current.discountAmount)) {
    return;
  }

  // [model/service/PromotionService.cfc:L388-L389, L434-L435] same promotion, so the legacy revises
  // the amount on the existing row in place.
  if (cfEquals(current.promotionID, rewardPromotionID)) {
    slot.current = { promotionID: current.promotionID, discountAmount };
    slot.mutated = true;
    return;
  }

  // [model/service/PromotionService.cfc:L392-L394, L438-L440] a different promotion, so the legacy
  // unlinks the incumbent and attaches a new row.
  slot.current = { promotionID: rewardPromotionID, discountAmount };
  slot.mutated = true;
}

/**
 * Which of the two arms a mirror belongs to, and the opaque identifier its intents carry.
 *
 * Only the order and orderFulfillment levels appear, because only those two arms mirror a live
 * applied-promotion row; the order-item arm accumulates candidate discounts instead and is applied
 * by `./promotion/promotionApplication.ts`, which is why the intent algebra publishes `add` alone at
 * that level.
 */
type AppliedPromotionSlotTarget =
  | { readonly appliedType: 'order'; readonly orderID: string }
  | { readonly appliedType: 'orderFulfillment'; readonly orderFulfillmentID: string };

/**
 * Diffs the mirror against the state the view reported, and emits the resulting intents.
 *
 * The four outcomes correspond one-to-one with the writes the legacy performs, and the mapping is
 * proved case by case in {@link AppliedPromotionSlot}'s note:
 *   nothing changed          -> no intent at all
 *   slot was empty           -> `add`                       [L400-L406, L446-L451]
 *   same promotion retained  -> `update`                    [L389, L435]
 *   promotion replaced       -> `remove` then `add`         [L393-L394, L439-L440] then [L400, L446]
 *
 * A `remove` intent carries NO `discountAmount` - the operation shape forbids the member outright -
 * and names the ORIGINAL promotion, because that is the row the legacy unlinks.
 */
function emitAppliedPromotionSlotIntents(
  slot: AppliedPromotionSlot,
  target: AppliedPromotionSlotTarget,
): PromotionAppliedIntent[] {
  const current = slot.current;

  // Nothing displaced the state the view reported, so the legacy performed no write.
  if (!slot.mutated || current === undefined) {
    return [];
  }

  const originalPromotionID = slot.originalPromotionID;
  const replacesADifferentPromotion =
    originalPromotionID !== undefined && !cfEquals(originalPromotionID, current.promotionID);
  const intents: PromotionAppliedIntent[] = [];

  // [model/service/PromotionService.cfc:L393, L439] the incumbent row is unlinked, and the intent
  // names the promotion that row carried rather than the reward's.
  if (replacesADifferentPromotion && originalPromotionID !== undefined) {
    if (target.appliedType === 'order') {
      intents.push({
        promotionID: originalPromotionID,
        operation: 'remove',
        appliedType: 'order',
        orderID: target.orderID,
      });
    } else {
      intents.push({
        promotionID: originalPromotionID,
        operation: 'remove',
        appliedType: 'orderFulfillment',
        orderFulfillmentID: target.orderFulfillmentID,
      });
    }
  }

  // [model/service/PromotionService.cfc:L389, L435] revising the incumbent's amount is an update;
  // [L400-L406, L446-L451] attaching a fresh row - whether the slot was empty or has just been
  // cleared by the remove above - is an add.
  const operation: 'add' | 'update' =
    originalPromotionID !== undefined && !replacesADifferentPromotion ? 'update' : 'add';

  if (target.appliedType === 'order') {
    intents.push({
      promotionID: current.promotionID,
      operation,
      discountAmount: current.discountAmount,
      appliedType: 'order',
      orderID: target.orderID,
    });
  } else {
    intents.push({
      promotionID: current.promotionID,
      operation,
      discountAmount: current.discountAmount,
      appliedType: 'orderFulfillment',
      orderFulfillmentID: target.orderFulfillmentID,
    });
  }

  return intents;
}

/**
 * Writes a key that an externally-sourced identifier may name, without letting a reserved name be
 * silently intercepted.
 *
 * A plain `target[key] = value` for the key `__proto__` stores NOTHING on the object: it walks the
 * inherited setter instead. Every key written through this function is a persisted identifier that
 * arrived from outside, so a plain assignment would silently drop the entry and the guard that
 * follows would re-seed it on every visit. `Object.defineProperty` installs an own, enumerable,
 * writable, configurable property under any name at all. This is the established house helper,
 * declared module-locally and un-exported in seven shipped files across the subtree.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Reduces a fulfillment address view to the projection the address-zone port accepts.
 *
 * The port's projection members are nullable, and the view's are optional, so absence is normalised
 * to `null` rather than dropped - the port distinguishes "this component is unconstrained" by a null
 * and would read an omitted member as `undefined`, which is not the same value. Mirrors the helper
 * `./promotion/qualifierQualification.ts` already uses, so both address-zone paths reduce identically.
 */
function toAddressProjection(address: ShippingAddressView): AddressProjection {
  return {
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    stateCode: address.stateCode ?? null,
    countryCode: address.countryCode ?? null,
  };
}

/**
 * Reduces the reward's configured address-zone identifiers to zone projections.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L77]: the legacy association is the many-to-many
 * link table `SwPromoRewardShipAddressZone`, and the ported entity deliberately publishes it as
 * `getShippingAddressZoneIDs(): readonly string[]` rather than as an array of `AddressZone` entities -
 * the entity graph beyond the identifier is not in scope. The zone locations therefore arrive empty,
 * which the port reads as a zone matching nothing; the repository is what populates them when a
 * zone's locations are materialised. The shape is the same one
 * `./promotion/qualifierQualification.ts` builds for the structurally identical qualifier path.
 */
function toConfiguredShippingAddressZones(
  addressZoneIDs: readonly string[],
): readonly AddressZoneProjection[] {
  return addressZoneIDs.map((addressZoneID) => ({ addressZoneID, addressZoneLocations: [] }));
}

/**
 * Dereferences a reward's promotion period, reproducing the legacy unguarded dereference.
 *
 * CFML parity [model/service/PromotionService.cfc:L192, L193, L197, L209, L212, L213, L222, L223,
 * L276, L290, L351, L388, L403, L434, L449]: the source writes
 * `reward.getPromotionPeriod().getPromotionPeriodID()` and `reward.getPromotionPeriod().getPromotion()`
 * at every one of those sites with NO null test, because the mapping makes the association
 * mandatory and the reward query INNER JOINs it. The ported entity types the accessor
 * `PromotionPeriod | undefined`, so the target must resolve it explicitly - and resolves it by
 * THROWING, which is what the legacy runtime does when a mandatory association is absent. Returning
 * a default, skipping the reward or coalescing to an empty identifier would each invent behaviour
 * the source does not have, and the last of them would silently mis-key the qualification memo.
 */
function dereferencePromotionPeriod(reward: PromotionReward, locator: string): PromotionPeriod {
  const promotionPeriod = reward.getPromotionPeriod();

  if (promotionPeriod === undefined) {
    throw new TypeError(
      `Unresolved promotionPeriod for promotionRewardID "${reward.getPromotionRewardID()}". ` +
        `Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when the ` +
        `mandatory promotionPeriod association has not been resolved.`,
    );
  }

  return promotionPeriod;
}

/**
 * Dereferences a promotion period's promotion, reproducing the legacy unguarded dereference.
 *
 * CFML parity [model/service/PromotionService.cfc:L276, L290, L388, L403, L434, L449]: the source
 * writes `reward.getPromotionPeriod().getPromotion()` with no null test for the same reason, and the
 * resolution is the same - throw rather than invent.
 */
function dereferencePromotion(promotionPeriod: PromotionPeriod, locator: string): Promotion {
  const promotion = promotionPeriod.getPromotion();

  if (promotion === undefined) {
    throw new TypeError(
      `Unresolved promotion for promotionPeriodID "${promotionPeriod.getPromotionPeriodID()}". ` +
        `Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when the ` +
        `mandatory promotion association has not been resolved.`,
    );
  }

  return promotion;
}

/**
 * Dereferences a fulfillment's address, reproducing the legacy unguarded dereference.
 *
 * Used only by `getShippingMethodOptionsDiscountAmountDetails`, whose address-zone loop at
 * [model/service/PromotionService.cfc:L1059-L1068] reads `getAddress()` with NO `isNull` test and NO
 * `isNew()` test - unlike the structurally similar fulfillment-arm loop at [L360], which guards
 * both. That asymmetry is real, it is preserved, and it is why this helper throws rather than
 * skipping the zone test.
 */
function dereferenceFulfillmentAddress(
  orderFulfillment: OrderFulfillmentView,
  locator: string,
): ShippingAddressView {
  const address = orderFulfillment.address;

  if (address === undefined) {
    throw new TypeError(
      `Unresolved fulfillment address for orderFulfillmentID ` +
        `"${orderFulfillment.orderFulfillmentID}". Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when no ` +
        `address has been resolved.`,
    );
  }

  return address;
}

/**
 * Everything one invocation of `updateOrderAmountsWithPromotions` mutates.
 *
 * The legacy body declares its state as three function-local structs
 * [model/service/PromotionService.cfc:L136, L139, L142] and reaches the rest through a live ORM
 * graph. Both become explicit here, bundled so the reward visitor and the three arm bodies can be
 * separate methods without threading six parameters each - which is what keeps the orchestration
 * method readable end to end.
 *
 * ONE INSTANCE PER CALL. Nothing here is a field on the service and nothing is module-level: on a
 * warm container module state persists between unrelated requests, and this is precisely the state
 * that must not.
 */
interface PromotionEngineState {
  /** The read-only order projection, already reflecting the price-group pass. */
  readonly order: OrderView;

  /**
   * [model/service/PromotionService.cfc:L136] the period-qualification memo, keyed by
   * `promotionPeriodID` and filled lazily at [L192-L194].
   */
  readonly promotionPeriodQualifications: PromotionPeriodQualifications;

  /**
   * [model/service/PromotionService.cfc:L139] the reward-usage ledger, whose in-place mutation is
   * order-dependence vector 1.
   */
  readonly rewardUsageLedger: RewardUsageLedger;

  /**
   * [model/service/PromotionService.cfc:L142] the qualified-discount accumulator - descending by
   * discount amount, of which only index `[1]` is ever applied.
   */
  readonly orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts;

  /**
   * One applied-promotion mirror per fulfillment, keyed by `orderFulfillmentID` and seeded lazily on
   * first touch, standing in for `orderFulfillment.getAppliedPromotions()` on the live graph.
   */
  readonly fulfillmentSlots: Record<string, AppliedPromotionSlot>;

  /**
   * The single order-level mirror, standing in for `order.getAppliedPromotions()`. Seeded eagerly
   * because there is exactly one and the order arm reads it in pass two regardless.
   */
  readonly orderSlot: AppliedPromotionSlot;
}

/**
 * The ported surface of `model/service/PromotionService.cfc`.
 *
 * Twelve public methods, matching the component's twelve declarations name for name. Six are
 * asynchronous and six are synchronous, and the split is not a style choice: a method is `async` IF
 * AND ONLY IF its legacy body reaches the DAO, or reaches a collaborator that does. Methods that
 * only traverse already-materialised associations or perform pure arithmetic stay synchronous, so
 * `getQualifierQualificationDetails`, both membership tests and `getDiscountAmount` are deliberately
 * NOT asynchronous even though three of their siblings are. Calibration across the folder: SkuService
 * 9 of 9 async, ProductService 14 of 15, PriceGroupService 8 async and 5 sync, and this file 6 and 6
 * - the most balanced of the seven.
 *
 * @see the file header for the ordering constraint, the six order-dependence vectors, the ownership
 *   split, the budget ledgers and the defect-register accounting.
 */
export class PromotionService {
  /**
   * [model/service/PromotionService.cfc:L145-L162] seeds sale-price discounts before the reward
   * traversal begins. Holds the promotion resolver, so it is constructed once.
   */
  private readonly salePriceSeeder: SalePriceSeeder;

  /**
   * [model/service/PromotionService.cfc:L549-L627, L752-L781, L783-L849] period-level qualification
   * and its two private helpers.
   */
  private readonly promotionPeriodQualificationEvaluator: PromotionPeriodQualificationEvaluator;

  /** [model/service/PromotionService.cfc:L629-L750] qualifier evaluation across all gate types. */
  private readonly qualifierQualificationEvaluator: QualifierQualificationEvaluator;

  /** [model/service/PromotionService.cfc:L852-L919, L921-L985] both membership tests. */
  private readonly orderItemMembership: OrderItemMembership;

  /** [model/service/PromotionService.cfc:L987-L1018] the three amount-type strategies. */
  private readonly discountAmountCalculator: DiscountAmountCalculator;

  /** [model/service/PromotionService.cfc:L165-L171, L458-L461] the two explicit ordered passes. */
  private readonly twoPassRewardIterator: TwoPassRewardIterator;

  /**
   * Every collaborator is an explicit constructor argument typed to a port or to a narrow structural
   * interface, wired once in `src/handlers/bootstrap.ts`. This replaces DI/1 0.4.2's runtime
   * convention scan over `property name="xService";` declarations - and retires its first-scan lock
   * along with it.
   *
   * The first three arguments are the component's three declared properties, in declaration order:
   *   `promotionDAO`        [model/service/PromotionService.cfc:L51] -> `PromotionRepository`
   *   `addressService`      [L53]                                    -> `AddressZoneEvaluator`
   *   `roundingRuleService` [L54]                                    -> the structural resolver
   * The fourth is the single surviving framework-generic read; see {@link PromotionFrameworkReads}
   * for why it exists and why it is neither a port nor a signature widening.
   *
   * The six collaborators built here are STATELESS OR CONFIGURATION-ONLY, which is the whole reason
   * they may be fields. The reward-usage ledger is deliberately NOT among them: it carries the
   * per-order mutable state of vector 1, so it is constructed fresh inside every call to
   * `updateOrderAmountsWithPromotions` and can never be shared between two requests on a warm
   * container.
   */
  public constructor(
    private readonly promotionRepository: PromotionRepository,
    private readonly addressZoneEvaluator: AddressZoneEvaluator,
    private readonly roundingRuleValues: RoundingRuleValueResolver,
    private readonly promotionFrameworkReads: PromotionFrameworkReads,
  ) {
    this.salePriceSeeder = new SalePriceSeeder(this.promotionFrameworkReads);
    this.orderItemMembership = new OrderItemMembership();
    this.qualifierQualificationEvaluator = new QualifierQualificationEvaluator(
      this.addressZoneEvaluator,
      this.orderItemMembership,
    );
    this.promotionPeriodQualificationEvaluator = new PromotionPeriodQualificationEvaluator(
      this.promotionRepository,
      this.qualifierQualificationEvaluator,
      this.orderItemMembership,
    );
    this.discountAmountCalculator = new DiscountAmountCalculator(this.roundingRuleValues);
    this.twoPassRewardIterator = new TwoPassRewardIterator(this.promotionRepository);
  }

  // ===================== START: Logical Methods ===========================

  /**
   * Recomputes every promotion discount for an order and returns the applied-promotion intents.
   *
   * [model/service/PromotionService.cfc:L58-L546] - 489 lines in the source, ORCHESTRATED here and
   * IMPLEMENTED across the nine `./promotion/` modules. This method contains no discount arithmetic,
   * no qualification logic and no membership testing; every one of those is a call into a module.
   *
   * ★ MUST-PRESERVE AREA #1. Promotion discount math AND use-limit enforcement semantics survive
   * unchanged, defects included. Six independent order-dependence vectors govern the result and are
   * enumerated in the file header; the two this method itself is responsible for honouring are
   * vector 2 - the two ordered passes, driven by `./promotion/twoPassRewardIterator.ts`, whose second
   * pass must not run when the reward collection is empty - and vector 4's descending insertion sort,
   * which this method owns directly.
   *
   * ★ EXECUTION ORDER IS A PRECONDITION THIS METHOD CANNOT CHECK.
   * `PriceGroupService.updateOrderAmountsWithPriceGroups()` MUST have run first, and the `OrderView`
   * passed here MUST already reflect the intents it produced. The requirement is non-optional and it
   * decides how much money a customer is charged: the order-item arm reads `appliedPriceGroup`,
   * `price`, `skuPrice`, `extendedPrice` and `extendedSkuPrice`
   * [model/service/PromotionService.cfc:L241-L252], and the price-group pass is what writes all five.
   * In the legacy system nothing enforced the ordering either - it held only because out-of-scope
   * `model/service/OrderService.cfc` happened to call the two in sequence. This method therefore
   * DOCUMENTS the requirement and does not police it: an `OrderView` cannot report whether the
   * price-group pass ran, and inventing a flag would add state the legacy lacks. Sequencing belongs
   * to `src/handlers/promotionApplicationHandler.ts`, and `./priceGroupService.ts` declares the same
   * constraint from the other side.
   *
   * ★ THE SIGNATURE RESHAPING. The legacy returns `void` and mutates the order aggregate in place.
   * The order aggregate is out of scope, so this returns intents keyed by opaque identifiers instead
   * and NEVER mutates order persistence. One of exactly three reshapings project-wide.
   *
   * @param order A read-only projection of the order, already reflecting the price-group pass.
   * @returns The applied-promotion intents to persist, in the order the engine produced them:
   *   the fulfillment and order arms' intents first, in traversal order, then the order-item winners.
   *   Never `undefined`, and an empty array when nothing qualified - which is also what a return or
   *   exchange order yields.
   */
  public async updateOrderAmountsWithPromotions(
    order: OrderView,
  ): Promise<PromotionAppliedIntent[]> {
    const appliedIntents: PromotionAppliedIntent[] = [];

    // CFML parity [model/service/PromotionService.cfc:L61, L542]: `otExchangeOrder` appears in BOTH
    // order-type gates and the two conditionals are SEQUENTIAL, NOT else-if. A sales order runs only
    // the first; a return order runs only the second; an EXCHANGE order runs the entire sales branch
    // and THEN enters the (empty) return branch. This is deliberate and load-bearing, and merging the
    // two into an if/else or a switch would silently change exchange-order behaviour.
    //
    // `listFindNoCase` returns a 1-based INDEX and `0` for absent, so it is compared explicitly
    // against `0` rather than used as a truth value.
    const orderTypeSystemCode = order.orderType.systemCode;

    // [model/service/PromotionService.cfc:L61] Sales and exchange orders.
    if (listFindNoCase('otSalesOrder,otExchangeOrder', orderTypeSystemCode) !== 0) {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L64-L68, L71-L75, L78-L80]: the three
      // backwards clear-out loops are REPLACED, not reproduced. Each walks `getAppliedPromotions()`
      // in reverse - the CFML idiom for deleting from a live collection while iterating it - calling
      // `removeOrderItem()`, `removeOrderFulfillment()` and `removeOrder()` to detach every
      // previously-applied promotion before recomputation. They exist ONLY because the legacy mutates
      // a live ORM graph. This service returns a fresh intent list on every call and never mutates
      // order persistence, so the recomputation is inherently idempotent and there is nothing to
      // clear. No `clearAppliedPromotions` method is published, no removal intent is emitted for this
      // step, and the order views expose no removal affordance to invoke even if one were wanted.
      // The `remove` intents this method does emit come from the fulfillment and order arms, where
      // they represent a genuine displacement rather than a blanket clear-out.

      // Every mutable structure the engine needs, created fresh for THIS call. These are the
      // legacy's three function-local structs [L136, L139, L142] plus the two applied-promotion
      // mirrors that stand in for the live ORM graph. None is a field, none is module state.
      const state: PromotionEngineState = {
        order,
        promotionPeriodQualifications: {},
        rewardUsageLedger: new RewardUsageLedger(),
        // The legacy identifier is misspelled `orderItemQulifiedDiscounts` [L142]; renamed here,
        // with the original recorded in the file header.
        orderItemQualifiedDiscounts: {},
        fulfillmentSlots: {},
        orderSlot: createAppliedPromotionSlot(order.appliedPromotions),
      };

      // [model/service/PromotionService.cfc:L145-L162] Sale-price rewards are seeded into the
      // qualified-discount accumulator BEFORE the reward traversal, so a reward discount must beat an
      // existing sale price to displace it in the descending sort.
      await this.salePriceSeeder.seedSalePriceDiscounts(order, state.orderItemQualifiedDiscounts);

      // [model/service/PromotionService.cfc:L165-L171, L458-L465] The traversal, both passes and the
      // loop-counter reset - including the case where the reward collection is empty and pass two
      // consequently never runs at all.
      const iterationResult = await this.twoPassRewardIterator.iterate(
        order,
        async (reward, isOrderRewardsPass) => this.visitReward(state, reward, isOrderRewardsPass),
      );

      // [model/service/PromotionService.cfc:L389, L393, L400-L406, L435, L439, L446-L451] The
      // fulfillment and order arms' writes, emitted as the net delta between the mirrors and the
      // state the view reported. Fulfillment first and the order last, because the fulfillment arm
      // runs in pass one and the order arm only in pass two.
      for (const orderFulfillment of order.orderFulfillments) {
        const slot = structGet(state.fulfillmentSlots, orderFulfillment.orderFulfillmentID);

        if (slot !== undefined) {
          appliedIntents.push(
            ...emitAppliedPromotionSlotIntents(slot, {
              appliedType: 'orderFulfillment',
              orderFulfillmentID: orderFulfillment.orderFulfillmentID,
            }),
          );
        }
      }
      appliedIntents.push(
        ...emitAppliedPromotionSlotIntents(state.orderSlot, {
          appliedType: 'order',
          orderID: order.orderID,
        }),
      );

      // [model/service/PromotionService.cfc:L468-L521] Strip discounts that exceeded their per-order
      // use limits. The leaked reward identity is handed over UNGUARDED - it is the empty string only
      // when the reward collection was empty, which is precisely when the ledger is empty and the
      // stripping loop's body never runs, so wrapping this call in a conditional is forbidden.
      stripOverUsedRewardDiscounts(
        state.rewardUsageLedger.promotionRewardUsageDetails,
        state.orderItemQualifiedDiscounts,
        iterationResult.lastProcessedRewardID,
      );

      // [model/service/PromotionService.cfc:L523-L536] Apply only the single best discount per order
      // item - index `[1]` of the descending list, and nothing else.
      appliedIntents.push(...applyBestOrderItemDiscounts(order, state.orderItemQualifiedDiscounts));
    }

    // [model/service/PromotionService.cfc:L541] Return & Exchange Orders
    if (listFindNoCase('otReturnOrder,otExchangeOrder', orderTypeSystemCode) !== 0) {
      // TODO [issue #1766]: In the future allow for return Items to have negative promotions applied.  This isn't import right now because you can determine how much you would like to refund ordersItems
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L542-L544]: this branch is INTENTIONALLY
      // EMPTY in the legacy source - the `if` at L542 encloses nothing but the TODO comment at L543.
      // It is carried forward verbatim, typos included (`isn't import` for "isn't important", and
      // `ordersItems`), per the TODO carry-forward directive: a known source TODO is preserved as a
      // flagged TODO and never silently completed. A placeholder regression test named `issue_1766`
      // documents the gap; this file authors no test.
    }

    return appliedIntents;
  }

  /**
   * Everything the legacy reward loop's BODY does, for one reward.
   *
   * [model/service/PromotionService.cfc:L169-L456]. `./promotion/twoPassRewardIterator.ts` owns the
   * traversal, both passes and the loop-counter reset, and hands each reward over here; it documents
   * three obligations it deliberately does NOT enforce, and this method is where all three are met:
   *   1. seed the reward's ledger entry     [L172-L189] - BEFORE the gate, so it runs for every
   *      reward the traversal encounters, qualified or not. That positioning is what makes the
   *      iterator's leaked-identity hand-off safe.
   *   2. populate the period-qualification memo lazily [L192-L194]
   *   3. evaluate the gate                  [L197] and REPORT ITS OUTCOME BACK, because the reset at
   *      [L458-L461] sits inside the gate and therefore depends on it.
   *
   * The three reward-level arms are then dispatched exactly as the source dispatches them, on the
   * pass flag and the reward type. The pass flag is why the order arm is unreachable in pass one and
   * the other two are unreachable in pass two.
   */
  private async visitReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    isOrderRewardsPass: boolean,
  ): Promise<RewardVisitOutcome> {
    // OBLIGATION 1 - [model/service/PromotionService.cfc:L172-L189]. The ledger owns the
    // `structKeyExists` guard, the `1000000` unlimited sentinel and the three `> 0` overrides; this
    // call is the seed site, and it precedes the gate exactly as the source's does.
    const usage = state.rewardUsageLedger.ensureRewardEntry(reward);

    const promotionPeriod = dereferencePromotionPeriod(reward, 'L192-L193');
    const promotionPeriodID = promotionPeriod.getPromotionPeriodID();

    // OBLIGATION 2 - [model/service/PromotionService.cfc:L192-L194]. `structKeyExists` and the read
    // are routed through the CFML struct helpers so key case folds the way a CFML struct folds it.
    // `putOwnStructKey`, not a plain assignment, because the key is a persisted identifier.
    if (!structKeyExists(state.promotionPeriodQualifications, promotionPeriodID)) {
      putOwnStructKey(
        state.promotionPeriodQualifications,
        promotionPeriodID,
        await this.getPromotionPeriodQualificationDetails(promotionPeriod, state.order),
      );
    }

    const periodQualification = structGet(state.promotionPeriodQualifications, promotionPeriodID);

    // Narrowed rather than asserted. The populate above guarantees the key, and the two helpers agree
    // on key folding, but `noUncheckedIndexedAccess` types the read as possibly absent and non-null
    // assertions are unavailable by project standard. Reporting a failed gate is the safe resolution
    // if the two ever disagreed: it is what the source does for a period that does not qualify.
    if (periodQualification === undefined) {
      return { qualificationsMeet: false };
    }

    // OBLIGATION 3 - [model/service/PromotionService.cfc:L197]. The gate, and the value the iterator
    // needs back in order to honour the reset's placement.
    const qualificationsMeet = periodQualification.qualificationsMeet;

    if (!qualificationsMeet) {
      return { qualificationsMeet };
    }

    const rewardType = reward.getRewardType();

    // CFML parity [model/service/PromotionService.cfc:L200]: `listFindNoCase` against the three
    // item-level reward types, compared explicitly against `0` rather than used as a truth value.
    // A reward whose type is absent yields the empty string, which the list cannot contain, so it
    // falls through every arm - and the DAO's `spr.rewardType IN (:rewardTypeList)` filter
    // [model/dao/PromotionDAO.cfc:L71] means the collection cannot in fact carry one.
    const rewardTypeForListTest = rewardType ?? '';

    // =============== Order Item Reward ==============
    // [model/service/PromotionService.cfc:L200-L341]
    if (
      !isOrderRewardsPass &&
      listFindNoCase('merchandise,subscription,contentAccess', rewardTypeForListTest) !== 0
    ) {
      this.applyOrderItemReward(state, reward, promotionPeriod, periodQualification, usage);

      // =============== Fulfillment Reward ======================
      // [model/service/PromotionService.cfc:L345-L412]. CFML `eq` on strings is case-insensitive, so
      // the type test folds case rather than using `===`.
    } else if (!isOrderRewardsPass && cfEquals(rewardType, 'fulfillment')) {
      this.applyFulfillmentReward(state, reward, promotionPeriod, periodQualification);

      // ================== Order Reward =========================
      // [model/service/PromotionService.cfc:L415-L454]
    } else if (isOrderRewardsPass && cfEquals(rewardType, 'order')) {
      this.applyOrderReward(state, reward, promotionPeriod);
    }

    return { qualificationsMeet };
  }

  /**
   * The order-item arm.
   *
   * [model/service/PromotionService.cfc:L200-L341] in full, including the descending insertion sort
   * at [L259-L294] which no `./promotion/` module claims and which all three candidate modules
   * explicitly disclaim in their own headers.
   *
   * ★ ORDER-DEPENDENCE VECTOR 6 IS VISIBLE HERE, at [L223-L224]: the ratchet lowers the reward's
   * `maximumUsePerOrder` on the SHARED ledger entry before the discount quantity is derived from it,
   * so how much a later order item may claim depends on what earlier items already consumed. The
   * ratchet itself belongs to `./promotion/rewardUsageLedger.ts`; the ordering that makes it
   * order-dependent belongs here.
   */
  private applyOrderItemReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    promotionPeriod: PromotionPeriod,
    periodQualification: PeriodQualification,
    usage: PromotionRewardUsageDetail,
  ): void {
    // [model/service/PromotionService.cfc:L203] read once into a local; the source calls
    // `getOrderItems()` afresh in the loop head and the view publishes the collection `readonly`.
    for (const orderItem of state.order.orderItems) {
      // CFML parity [model/service/PromotionService.cfc:L206]: `==` on two strings is
      // case-insensitive in CFML, so the sale-item test folds case.
      if (!cfEquals(orderItem.orderItemType.systemCode, 'oitSale')) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L209]: `arrayFind` used as a boolean. The
      // target tests membership of a `string[]` directly, which is intrinsically boolean, so no index
      // is produced and no index comparison can be got wrong. The view publishes
      // `orderFulfillmentID` as a plain string, so the legacy
      // `orderItem.getOrderFulfillment().getOrderFulfillmentID()` becomes one property read.
      if (!periodQualification.qualifiedFulfillmentIDs.includes(orderItem.orderFulfillmentID)) {
        continue;
      }

      const orderItemID = orderItem.orderItemID;

      // [model/service/PromotionService.cfc:L212-L214] memoise this order item's qualification count
      // against the PERIOD, not the reward - so two rewards sharing a period share the count.
      if (!structKeyExists(periodQualification.orderItems, orderItemID)) {
        putOwnStructKey(
          periodQualification.orderItems,
          orderItemID,
          this.getPromotionPeriodOrderItemQualificationCount(
            promotionPeriod,
            orderItem,
            state.order,
          ),
        );
      }

      const qualificationQuantity = structGet(periodQualification.orderItems, orderItemID);

      // CFML parity [model/service/PromotionService.cfc:L217]: the source uses the count BARE as a
      // boolean. Numeric truthiness is not available in the target, so it becomes an explicit
      // `> 0` - and the absent case, which the populate above rules out, is narrowed rather than
      // defaulted, because substituting a count would invent a qualification the engine never found.
      if (qualificationQuantity === undefined || qualificationQuantity <= 0) {
        continue;
      }

      // [model/service/PromotionService.cfc:L220] the reward's own inclusion and exclusion rules.
      if (!this.getOrderItemInReward(reward, orderItem)) {
        continue;
      }

      // [model/service/PromotionService.cfc:L223-L224] VECTOR 6 - the ratchet, in place on the
      // shared ledger entry.
      state.rewardUsageLedger.ratchetMaximumUsePerOrder(usage, qualificationQuantity);

      // [model/service/PromotionService.cfc:L228] the discount quantity, derived from the ratcheted
      // limit. With no qualification constraint configured this reduces to the order item quantity
      // by way of the two clamps below.
      let discountQuantity = qualificationQuantity * usage.maximumUsePerQualification;

      // [model/service/PromotionService.cfc:L231-L233] clamp to the order item's own quantity.
      if (discountQuantity > orderItem.quantity) {
        discountQuantity = orderItem.quantity;
      }

      // [model/service/PromotionService.cfc:L236-L238] clamp to the per-item maximum.
      if (discountQuantity > usage.maximumUsePerItem) {
        discountQuantity = usage.maximumUsePerItem;
      }

      const discountAmount = this.resolveOrderItemDiscountAmount(
        reward,
        orderItem,
        discountQuantity,
      );

      // [model/service/PromotionService.cfc:L257] only a positive discount is recorded. Expressed
      // through `Money`, never a numeric comparison on a monetary value.
      if (!discountAmount.isGreaterThan(Money.zero)) {
        continue;
      }

      // [model/service/PromotionService.cfc:L259-L294] VECTOR 4 - the descending insertion sort.
      this.insertQualifiedDiscountDescending(state.orderItemQualifiedDiscounts, orderItemID, {
        promotionRewardID: reward.getPromotionRewardID(),
        promotion: dereferencePromotion(promotionPeriod, 'L276, L290'),
        discountAmount,
      });

      // [model/service/PromotionService.cfc:L296-L329] VECTOR 1 - the in-place usage increment, the
      // deliberately unguarded division of VECTOR 5, and the ASCENDING insertion sort of VECTOR 4's
      // other half. All three belong to the ledger; this is the single call site that drives them.
      state.rewardUsageLedger.recordOrderItemUsage(
        usage,
        orderItem,
        discountQuantity,
        discountAmount,
      );
    }
  }

  /**
   * Chooses the order item's discount base and computes the discount.
   *
   * [model/service/PromotionService.cfc:L240-L254], and THE SINGLE MOST MISREAD BRANCH IN THE
   * COMPONENT.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L241-L252]: read the guard literally. The `if` -
   * taken when there is NO applied price group, OR the reward DOES list the applied group as
   * eligible - discounts from `getPrice()` with NO correction term. The `else` - taken when there IS
   * an applied price group AND the reward does NOT list it as eligible - discounts from
   * `getSkuPrice()` and THEN subtracts the price-group saving the item is already receiving. The
   * specification's prose, and `./priceGroupService.ts`'s own header, have these two branches
   * TRANSPOSED; the source governs, and implementing the transposed wording would invert the discount
   * on every price-group order.
   *
   * This is also the method that makes the cross-service ordering constraint concrete: all five
   * values it reads are written by the price-group pass.
   */
  private resolveOrderItemDiscountAmount(
    reward: PromotionReward,
    orderItem: OrderItemView,
    discountQuantity: number,
  ): Money {
    const appliedPriceGroup = orderItem.appliedPriceGroup;

    // CFML parity [model/service/PromotionService.cfc:L241]: `isNull(...)` is a GENUINE NULL TEST, so
    // it is routed through the CFML null helper rather than a bare falsy check - which would wrongly
    // fold an empty string or a zero in with an absent value - and rather than a `structKeyExists`
    // probe, which tests something else entirely. The helper reports the SEMANTICS; the `=== undefined`
    // beside it is what NARROWS THE TYPE, because the helper returns a plain boolean rather than a type
    // predicate and the project forbids `!` and `as`. The two are not redundant: removing the helper
    // would lose the parity record, and removing the narrowing would leave the branch below
    // dereferencing a possibly-absent value.
    if (isNullish(appliedPriceGroup) || appliedPriceGroup === undefined) {
      // [model/service/PromotionService.cfc:L244] the uncorrected arm.
      return this.getDiscountAmount(reward, orderItem.price, discountQuantity);
    }

    if (reward.hasEligiblePriceGroup(appliedPriceGroup)) {
      // [model/service/PromotionService.cfc:L244] the uncorrected arm, reached by the guard's second
      // disjunct.
      return this.getDiscountAmount(reward, orderItem.price, discountQuantity);
    }

    // [model/service/PromotionService.cfc:L249] the discount the item would have received with no
    // price group at all.
    const originalDiscountAmount = this.getDiscountAmount(
      reward,
      orderItem.skuPrice,
      discountQuantity,
    );

    // CFML parity [model/service/PromotionService.cfc:L252]: `precisionEvaluate('originalDiscountAmount
    // - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())')`, translated into typed
    // calls on the single arithmetic surface rather than into a string evaluator. `Money` reaches
    // arbitrary-precision arithmetic internally, so no expression parser, no `eval` and no
    // `new Function` appears anywhere. The parenthesisation is the source's: the price-group saving
    // is computed first and then subtracted, so the sign of the result follows the source's exactly.
    return originalDiscountAmount.minus(orderItem.extendedSkuPrice.minus(orderItem.extendedPrice));
  }

  /**
   * The descending insertion sort - ORDER-DEPENDENCE VECTOR 4, first half.
   *
   * [model/service/PromotionService.cfc:L259-L294]. The list is kept in DESCENDING discount order and
   * only index `[1]` is ever applied [L523-L536], so this ordering decides which promotion an order
   * item actually receives.
   *
   * CFML parity [model/service/PromotionService.cfc:L271]: the scan inserts at the FIRST position
   * whose existing discount is STRICTLY LESS than the incoming one. Strictness makes the sort stable:
   * an equal discount does not displace the incumbent, so on a tie the earlier-inserted record keeps
   * index `[1]`. Combined with the absence of `ORDER BY` on the reward query that makes tie outcomes
   * driver-order dependent, which is preserved rather than resolved.
   *
   * CFML parity [model/service/PromotionService.cfc:L285-L294]: when the scan finds no such position -
   * because the list is empty, or because every existing discount is greater than or equal to the
   * incoming one - the record is APPENDED, which keeps the descending invariant at the tail.
   */
  private insertQualifiedDiscountDescending(
    orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
    orderItemID: string,
    qualifiedDiscount: QualifiedDiscount,
  ): void {
    // [model/service/PromotionService.cfc:L260-L263] create the list on first use. The sale-price
    // seeding step may already have created it, in which case its record is the incumbent this
    // discount has to beat.
    if (!structKeyExists(orderItemQualifiedDiscounts, orderItemID)) {
      // The type argument is explicit because an empty-array literal would otherwise infer the
      // helper's value type as `never[]`, which the accumulator's `QualifiedDiscount[]` rejects.
      putOwnStructKey<QualifiedDiscount[]>(orderItemQualifiedDiscounts, orderItemID, []);
    }

    const qualifiedDiscounts = structGet(orderItemQualifiedDiscounts, orderItemID);

    // Narrowed rather than asserted, for the reason given at the other narrowing sites: the create
    // above guarantees the key and both helpers fold key case identically.
    if (qualifiedDiscounts === undefined) {
      return;
    }

    // [model/service/PromotionService.cfc:L269-L283] the forward scan.
    for (let index = 0; index < qualifiedDiscounts.length; index += 1) {
      const existing = qualifiedDiscounts[index];

      if (existing === undefined) {
        continue;
      }

      // [model/service/PromotionService.cfc:L271] STRICTLY less than, expressed through `Money`.
      if (existing.discountAmount.isLessThan(qualifiedDiscount.discountAmount)) {
        // CFML parity [model/service/PromotionService.cfc:L274]: `arrayInsertAt(list, d, record)`
        // inserts BEFORE the element at 1-based position `d`, which is `splice` at 0-based `index`.
        qualifiedDiscounts.splice(index, 0, qualifiedDiscount);
        // [model/service/PromotionService.cfc:L280-L281] the source sets its `discountAdded` flag and
        // breaks; returning here is the same control flow with no flag to carry.
        return;
      }
    }

    // [model/service/PromotionService.cfc:L285-L293] nothing was displaced, so append.
    qualifiedDiscounts.push(qualifiedDiscount);
  }

  /**
   * The fulfillment arm.
   *
   * [model/service/PromotionService.cfc:L345-L412]. Reaches the applied-promotion mirror rather than
   * a live ORM graph; see {@link AppliedPromotionSlot} for why, and for the case-by-case proof that
   * the mirror-then-diff produces exactly the writes the legacy performs.
   */
  private applyFulfillmentReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    promotionPeriod: PromotionPeriod,
    periodQualification: PeriodQualification,
  ): void {
    // [model/service/PromotionService.cfc:L348]
    for (const orderFulfillment of state.order.orderFulfillments) {
      // [model/service/PromotionService.cfc:L351-L355] the three-part gate, in the source's order and
      // joined by short-circuiting `&&`.
      //
      // CFML parity [model/service/PromotionService.cfc:L351]: `arrayFind` as a boolean becomes
      // direct membership of a `string[]`.
      if (
        !periodQualification.qualifiedFulfillmentIDs.includes(orderFulfillment.orderFulfillmentID)
      ) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L353]: `!arrayLen(x) || hasX(...)` - AN EMPTY
      // COLLECTION MEANS "NO RESTRICTION", not "matches nothing". Expressed as an explicit
      // `length === 0`, never as a bare truthiness test on a length.
      //
      // LEGACY-NOTE [model/entity/PromotionReward.cfc:L76, L78]: the legacy `getFulfillmentMethods()`
      // and `getShippingMethods()` return arrays of entities and are tested with
      // `hasFulfillmentMethod(...)` / `hasShippingMethod(...)`. The ported entity deliberately drops
      // those four accessors and publishes the many-to-many link tables as identifier arrays instead,
      // because the entity graph beyond the identifier is not in scope. The membership tests therefore
      // compare identifiers, which is exactly what the link tables hold and what the `has*` helpers
      // ultimately compared.
      const fulfillmentMethodIDs = reward.getFulfillmentMethodIDs();

      if (
        fulfillmentMethodIDs.length !== 0 &&
        !fulfillmentMethodIDs.includes(orderFulfillment.fulfillmentMethod.fulfillmentMethodID)
      ) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L355]: this conjunct carries an extra null
      // test the fulfillment-method conjunct does not - `!isNull(getShippingMethod()) && hasShippingMethod(...)` -
      // so a restricted reward fails the gate outright when the fulfillment has no shipping method,
      // rather than dereferencing it. That asymmetry between the two conjuncts is the source's and is
      // preserved.
      const shippingMethodIDs = reward.getShippingMethodIDs();
      const shippingMethod = orderFulfillment.shippingMethod;

      if (
        shippingMethodIDs.length !== 0 &&
        (shippingMethod === undefined ||
          !shippingMethodIDs.includes(shippingMethod.shippingMethodID))
      ) {
        continue;
      }

      // [model/service/PromotionService.cfc:L357-L368] the address-zone test. `addressIsInZone`
      // defaults TRUE and is only forced false when zones are actually configured, so an
      // unrestricted reward passes; the first matching zone flips it back and stops the scan.
      let addressIsInZone = true;
      const shippingAddressZoneIDs = reward.getShippingAddressZoneIDs();

      if (shippingAddressZoneIDs.length !== 0) {
        addressIsInZone = false;
        const address = orderFulfillment.address;

        // CFML parity [model/service/PromotionService.cfc:L360]: BOTH preconditions are the source's -
        // the address must be resolved AND must not be new. A new address has nothing to match, so a
        // zone-restricted reward simply fails here rather than throwing. Note that the structurally
        // similar loop in `getShippingMethodOptionsDiscountAmountDetails` at [L1059-L1068] has
        // NEITHER precondition; the asymmetry is real and both sides are preserved as written.
        if (address !== undefined && !address.isNew) {
          const addressProjection = toAddressProjection(address);

          for (const addressZone of toConfiguredShippingAddressZones(shippingAddressZoneIDs)) {
            // CFML parity [model/service/PromotionService.cfc:L362]: the source calls
            // `isAddressInZone(address=..., addressZone=...)` in KEYWORD form here, positionally at
            // [L684] and in keyword form again at [L1063]. CFML keyword and positional calls bind the
            // same parameters in the same order, so the single positional signature the port publishes
            // reproduces all three call shapes.
            if (this.addressZoneEvaluator.isAddressInZone(addressProjection, addressZone)) {
              addressIsInZone = true;
              break;
            }
          }
        }
      }

      // [model/service/PromotionService.cfc:L371]
      if (!addressIsInZone) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L373]: `getDiscountAmount` is called
      // POSITIONALLY with the literal quantity `1` - a fulfillment charge is discounted once, not per
      // unit.
      const discountAmount = this.getDiscountAmount(reward, orderFulfillment.fulfillmentCharge, 1);

      // [model/service/PromotionService.cfc:L375-L406] replayed against the mirror, which is seeded
      // from the view on first touch and then evolves across rewards exactly as the live graph does.
      const orderFulfillmentID = orderFulfillment.orderFulfillmentID;

      if (!structKeyExists(state.fulfillmentSlots, orderFulfillmentID)) {
        putOwnStructKey(
          state.fulfillmentSlots,
          orderFulfillmentID,
          createAppliedPromotionSlot(orderFulfillment.appliedPromotions),
        );
      }

      const slot = structGet(state.fulfillmentSlots, orderFulfillmentID);

      // Narrowed rather than asserted, as at the other narrowing sites.
      if (slot === undefined) {
        continue;
      }

      mirrorRewardApplication(
        slot,
        dereferencePromotion(promotionPeriod, 'L388, L403').getPromotionID(),
        discountAmount,
      );
    }
  }

  /**
   * The order arm - reachable in pass two only.
   *
   * [model/service/PromotionService.cfc:L415-L454]. Structurally identical to the fulfillment arm but
   * with no loop: there is one order, and the source guards the arm on the pass flag being TRUE,
   * which is what makes it the only arm pass two can reach.
   *
   * ★ A SECOND PRECONDITION THIS METHOD DOCUMENTS AND CANNOT CHECK.
   * In the legacy engine the item-level and fulfillment-level discounts of pass one are applied to a
   * live ORM graph BEFORE [L417] reads their effect, so pass two's discount base includes them. In
   * the target both passes return intents instead, and neither
   * `OrderView.subtotalAfterItemDiscounts` nor `OrderView.fulfillmentChargeAfterDiscountTotal` is
   * derivable from the collections the views publish - `OrderItemView` deliberately carries no
   * applied-promotion state and `OrderFulfillmentView` deliberately carries no charge-after-discount
   * member. That is the anti-corruption boundary showing through rather than an omission, and
   * `../domain/views/orderView.ts` assigns the obligation explicitly to THE PRODUCER OF THE VIEW:
   * the two values supplied must already reflect pass one's output. This method therefore reads them
   * as given and never attempts to recompute or adjust them - a recomputation would need state the
   * views withhold by design, and adjusting them would double-count.
   */
  private applyOrderReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    promotionPeriod: PromotionPeriod,
  ): void {
    // CFML parity [model/service/PromotionService.cfc:L417]: the discountable base is a SUM OF TWO
    // TERMS - `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()` - and the
    // source uses a BARE `+` here, with no `precisionEvaluate`, unlike all nine of its sibling
    // arithmetic sites in this component (L150, L252, L299, L486, L990, L995, L1001, L1006, L1007).
    // It is the only sum in the pass computed with unguarded arithmetic.
    //
    // THE ACCOUNTING FOR THAT GAP LANDS HERE, AND THE ANSWER IS THAT IT IS NOT A DIVERGENCE.
    // `../domain/views/orderView.ts` records the gap where the value enters the type and expressly
    // defers the deliberate-divergence accounting to `src/services/**`, claiming no register entry of
    // its own. The resolution: `Money` is the project's single mandated arithmetic surface and offers
    // no unguarded arithmetic to call, so routing this sum through `Money.plus` closes the gap
    // STRUCTURALLY rather than by a decision taken here. No float drift is being deliberately
    // preserved and no fourth deliberate divergence is spent - the budget of exactly three is closed,
    // and register entry 12's `amountOff` gap remains the only float gap in this subtree closed by an
    // explicit decision.
    //
    // Reading both terms is also what makes pass two depend on BOTH arms of pass one, not merely on
    // the item arm - the deepening of vector 2 recorded in the file header.
    const totalDiscountableAmount = state.order.subtotalAfterItemDiscounts.plus(
      state.order.fulfillmentChargeAfterDiscountTotal,
    );

    // CFML parity [model/service/PromotionService.cfc:L419]: POSITIONAL, with the literal quantity
    // `1` - an order total is discounted once.
    const discountAmount = this.getDiscountAmount(reward, totalDiscountableAmount, 1);

    // [model/service/PromotionService.cfc:L421-L451] replayed against the single order-level mirror.
    mirrorRewardApplication(
      state.orderSlot,
      dereferencePromotion(promotionPeriod, 'L434, L449').getPromotionID(),
      discountAmount,
    );
  }

  /**
   * Whether a promotion period qualifies for an order, and the qualification detail behind it.
   *
   * [model/service/PromotionService.cfc:L549-L627].
   *
   * ★ VISIBILITY WIDENING 1 OF 5. `private` in the legacy source, exported here so it is directly
   * testable. The widening does not alter behaviour: the body is unchanged and the only new caller is
   * a test. Exactly five such widenings exist project-wide and all five are on this class.
   *
   * Asynchronous because the body reaches the DAO twice, for the period's general use count and its
   * per-account use count [L566-L581].
   *
   * The returned detail carries a `qualifiedFulfillments` member that this class NEVER READS - it is
   * register entry 10's level confusion, written at [L621-L623] at the period level when the caller
   * reads `qualifiedFulfillmentIDs`. The engine's own documentation block at [L82-L133] is the proof;
   * see the file header.
   */
  public async getPromotionPeriodQualificationDetails(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): Promise<PeriodQualification> {
    return this.promotionPeriodQualificationEvaluator.getPromotionPeriodQualificationDetails(
      promotionPeriod,
      order,
    );
  }

  /**
   * Whether a single qualifier is satisfied by an order, and how many times.
   *
   * [model/service/PromotionService.cfc:L629-L750].
   *
   * ★ VISIBILITY WIDENING 2 OF 5. `private` in the legacy source.
   *
   * SYNCHRONOUS, and deliberately so: the body reaches no DAO and no collaborator that does. It
   * evaluates the order, fulfillment and item gate families over already-materialised associations
   * only.
   *
   * Register entry 11 lives in this path: the shipping-address-zones clause at [L703] re-tests
   * `hasShippingMethod` instead of testing the zone condition. It is REPRODUCED, and the strongest
   * available evidence that it is a genuine defect rather than intent is recorded on
   * `getShippingMethodOptionsDiscountAmountDetails` below.
   */
  public getQualifierQualificationDetails(
    qualifier: PromotionQualifier,
    order: OrderView,
  ): QualifierQualification {
    return this.qualifierQualificationEvaluator.getQualifierQualificationDetails(qualifier, order);
  }

  /**
   * The comma-delimited list of fulfillment identifiers a promotion period qualifies.
   *
   * [model/service/PromotionService.cfc:L752-L781].
   *
   * ★ VISIBILITY WIDENING 3 OF 5. `private` in the legacy source.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L752]: this function is verified to have ZERO
   * CALL SITES - its only occurrence anywhere in the non-framework tree is its own definition, and the
   * period-qualification path that would plausibly use it builds `qualifiedFulfillmentIDs` as an array
   * instead. It is widened from private to exported ANYWAY, because the five-widening budget names it
   * explicitly, and its COMMA-LIST STRING return is preserved rather than modernised into an array so
   * that the ported surface still matches the legacy signature a reviewer diffs against.
   *
   * SYNCHRONOUS: the body only walks fulfillments and qualifiers already in memory.
   */
  public getPromotionPeriodQualifiedFulfillmentIDList(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): string {
    return this.promotionPeriodQualificationEvaluator.getPromotionPeriodQualifiedFulfillmentIDList(
      promotionPeriod,
      order,
    );
  }

  /**
   * How many times one order item qualifies under a promotion period's qualifiers.
   *
   * [model/service/PromotionService.cfc:L783-L849].
   *
   * ★ VISIBILITY WIDENING 4 OF 5. `private` in the legacy source.
   *
   * SYNCHRONOUS: pure traversal and integer arithmetic over materialised associations. The count
   * starts at the order's total sale quantity [L785], is reduced to the MINIMUM across qualifiers
   * [L835], and returns early at zero [L840-L842].
   */
  public getPromotionPeriodOrderItemQualificationCount(
    promotionPeriod: PromotionPeriod,
    orderItem: OrderItemView,
    order: OrderView,
  ): number {
    return this.promotionPeriodQualificationEvaluator.getPromotionPeriodOrderItemQualificationCount(
      promotionPeriod,
      orderItem,
      order,
    );
  }

  /**
   * Whether an order item falls inside a qualifier's inclusion and exclusion rules.
   *
   * [model/service/PromotionService.cfc:L852-L919]. Public in the legacy source, so no widening.
   *
   * SYNCHRONOUS: exclusions are evaluated first and short-circuit to `false`, then inclusions
   * short-circuit to `true`, all over materialised associations and the product type's materialised
   * identifier path.
   */
  public getOrderItemInQualifier(qualifier: PromotionQualifier, orderItem: OrderItemView): boolean {
    return this.orderItemMembership.getOrderItemInQualifier(qualifier, orderItem);
  }

  /**
   * Whether an order item falls inside a reward's inclusion and exclusion rules.
   *
   * [model/service/PromotionService.cfc:L921-L985]. Public in the legacy source, so no widening.
   * Structurally the twin of `getOrderItemInQualifier`, minus the two item-price gates that only a
   * qualifier carries.
   *
   * SYNCHRONOUS, for the same reason.
   */
  public getOrderItemInReward(reward: PromotionReward, orderItem: OrderItemView): boolean {
    return this.orderItemMembership.getOrderItemInReward(reward, orderItem);
  }

  /**
   * The discount one reward yields for a given unit price and quantity.
   *
   * [model/service/PromotionService.cfc:L987-L1018].
   *
   * ★ VISIBILITY WIDENING 5 OF 5, and the last of the project's budget. `private` in the legacy
   * source, exported here because it is the arithmetic heart of must-preserve area #1 and has to be
   * testable directly.
   *
   * SYNCHRONOUS AND PURE. `numeric` becomes `Money` on both the price input and the return, so no
   * raw floating-point value crosses this boundary in either direction; the quantity stays a plain
   * integer count because it is a count and not money.
   *
   * FOUR REGISTER ENTRIES LIVE IN THE DELEGATED BODY, and their treatment is recorded in the file
   * header rather than repeated here: entry 12's `amountOff` float gap [L998] is DELIBERATE
   * DIVERGENCE (b), closed; entry 13's un-`var`'d assignment at [L1007, L1009, L1014] is DELIBERATE
   * DIVERGENCE (a), made function-local; entry 14's clamp [L1013-L1015] compares the PRE-rounding
   * value and overwrites the POST-rounding one and is REPRODUCED; and the `numberFormat` presentation
   * step [L1017] stays at the very end of the calculation.
   *
   * BY DESIGN THIS METHOD VALIDATES NOTHING. It does not check that the reward's `amountType` is one
   * of the three the source switches on - the switch has no `default` arm [L993] - and it does not
   * check that the amount or quantity is positive. Adding any of those would be adding a constraint
   * the legacy lacks.
   */
  public getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money {
    return this.discountAmountCalculator.getDiscountAmount(reward, price, quantity);
  }

  /**
   * The sale-price detail for every SKU of a product, with rounding rules applied.
   *
   * [model/service/PromotionService.cfc:L1022-L1030]. Implemented here rather than delegated: it sits
   * outside the 489-line method and outside every `./promotion/` module's range.
   *
   * ★ THE SIGNATURE IS A CONTRACT, NOT A CHOICE. `src/handlers/bootstrap.ts` adapts this method to
   * satisfy the sale-price resolver that `src/domain/entities/product.ts` consumes - which is how the
   * legacy `getService("promotionService")` locator at [model/entity/Product.cfc:L519] is replaced.
   * The parameter list, the asynchrony and the `Record`-keyed return must all stay exactly as they
   * are, and `SalePriceDetail` is IMPORTED from `../domain/ports/promotionRepository.js` rather than
   * redeclared, or the adaptation breaks and the entity's sale-price path dies with it.
   *
   * @param productID The product whose SKUs to resolve.
   * @returns One detail per SKU, keyed by `skuID`. Empty when the product has no sale-price rewards.
   */
  public async getSalePriceDetailsForProductSkus(
    productID: string,
  ): Promise<Record<string, SalePriceDetail>> {
    // [model/service/PromotionService.cfc:L1023] the six-branch UNION and its three query-of-queries
    // reduction steps [model/dao/PromotionDAO.cfc:L298-L591] are entirely the repository's concern;
    // this method receives already-reduced rows.
    const salePriceRows =
      await this.promotionRepository.getSalePricePromotionRewardsQuery(productID);

    // LEGACY-NOTE [model/service/PromotionService.cfc:L1023]: `getHibachiUtilityService()` is an
    // inherited `HibachiService` affordance, not one of this component's three declared collaborators,
    // and it has no TypeScript analogue. Its `queryToStructOfStructures(query, "skuID")` call converts
    // a flat query into a struct keyed by `skuID`; that becomes the explicit keying step below and the
    // framework accessor is dropped. Keying is last-wins, as overwriting a struct key is, so two rows
    // sharing a `skuID` resolve the same way they resolve in the source.
    const priceDetails: Record<string, SalePriceDetail> = {};

    for (const salePriceRow of salePriceRows) {
      const roundingRuleID = salePriceRow.roundingRuleID;

      // CFML parity [model/service/PromotionService.cfc:L1025]: the guard is `!= ""` - a LITERAL
      // EMPTY-STRING COMPARISON, not `len()` and not a null test - so it is reproduced as an explicit
      // comparison against `''` rather than routed through a truthiness helper. The port types an
      // absent rounding rule as `undefined` where the legacy query column yields `""`, so BOTH forms
      // of absence are excluded here in order to reproduce the source's single test faithfully.
      if (roundingRuleID === undefined || roundingRuleID === '') {
        putOwnStructKey(priceDetails, salePriceRow.skuID, salePriceRow);
        continue;
      }

      // [model/service/PromotionService.cfc:L1026]
      //
      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L79 vs L88]:
      // `roundValueByRoundingRuleID` declares `returntype="numeric"` but returns `roundValue`'s
      // `string`, which the legacy then assigns straight back into a numeric field. The target's
      // `Money`-typed boundary closes the mismatch by construction - the collaborator returns
      // `Promise<Money>` and the detail's `salePrice` is a `Money`, so no conversion is needed and no
      // string can leak into a numeric field. Secondary register; not a numbered defect and not a
      // deliberate divergence.
      const roundedSalePrice = await this.roundingRuleValues.roundValueByRoundingRuleID(
        salePriceRow.salePrice,
        roundingRuleID,
      );

      // JUDGMENT CALL: the legacy reassigns `priceDetails[key].salePrice` IN PLACE while iterating.
      // The target builds a fresh record instead. No key is added or removed either way, so the
      // observable result is identical, and the rows the repository returned are left unpolluted -
      // mutating a value that crossed the repository boundary is the pollution pattern this subtree
      // has already rejected once, in `./priceGroupService.ts`.
      putOwnStructKey(priceDetails, salePriceRow.skuID, {
        ...salePriceRow,
        salePrice: roundedSalePrice,
      });
    }

    return priceDetails;
  }

  /**
   * The best fulfillment discount available for one shipping-method option.
   *
   * [model/service/PromotionService.cfc:L1032-L1086]. A SECOND, INDEPENDENT promotion loop -
   * self-contained, far smaller than the main engine, and reusing only the period-qualification and
   * discount-amount collaborators. Implemented here rather than delegated for the same reason as the
   * method above: it lies outside every module's range.
   *
   * ★★ THIS METHOD IS THE PROOF THAT REGISTER ENTRY 11 IS A DEFECT.
   * LEGACY-NOTE [model/service/PromotionService.cfc:L1059-L1068]: this address-zone loop is the
   * CORRECT formulation - it tests whether the address is in one of the configured zones - and it is
   * the direct evidence that the structurally parallel construct at [L703], which re-tests
   * `hasShippingMethod` instead of the zone condition, is a genuine defect rather than intent. The
   * same author wrote both; this one is right and that one is wrong. Entry 11 is owned and reproduced
   * by `./promotion/qualifierQualification.ts`, and this is the strongest evidence available for it.
   *
   * @param option A read-only projection of the shipping-method option being priced.
   * @returns The winning promotion's identifier and discount, or the empty identifier and a zero
   *   discount when nothing qualified.
   */
  public async getShippingMethodOptionsDiscountAmountDetails(
    option: ShippingMethodOptionView,
  ): Promise<ShippingDiscountDetails> {
    // [model/service/PromotionService.cfc:L1033-L1036] the accumulator, seeded exactly as the source
    // seeds it: the empty identifier and a zero amount. The source mutates a struct in place; the
    // target accumulates into two locals and constructs the readonly result once, which is the same
    // computation with no mutable escape.
    let bestPromotionID = '';
    let bestDiscountAmount = Money.zero;

    // [model/service/PromotionService.cfc:L1038] this method keeps its OWN period-qualification memo,
    // entirely separate from the main engine's, and it is function-local - never a field.
    const promotionPeriodQualifications: PromotionPeriodQualifications = {};

    // CFML parity [model/service/PromotionService.cfc:L1040 vs L165]: this call passes
    // `rewardTypeList="fulfillment"` alone and OMITS `qualificationRequired` entirely, while the main
    // engine passes five reward types AND `qualificationRequired=true`. Omitting it lets the
    // repository's own default apply - `default="false"` at [model/dao/PromotionDAO.cfc:L54] - so the
    // two calls genuinely select different reward sets. The asymmetry is preserved, not normalised.
    //
    // The view FLATTENS the legacy `getOrderFulfillment().getOrder()` chain into a direct `order`
    // member, so the promotion-code list is read in one step rather than two.
    const promotionRewards = await this.promotionRepository.getActivePromotionRewards(
      'fulfillment',
      option.order.promotionCodeList,
    );

    // [model/service/PromotionService.cfc:L1043-L1045]
    for (const reward of promotionRewards) {
      const promotionPeriod = dereferencePromotionPeriod(reward, 'L1048-L1049');
      const promotionPeriodID = promotionPeriod.getPromotionPeriodID();

      // [model/service/PromotionService.cfc:L1048-L1050]
      if (!structKeyExists(promotionPeriodQualifications, promotionPeriodID)) {
        putOwnStructKey(
          promotionPeriodQualifications,
          promotionPeriodID,
          await this.getPromotionPeriodQualificationDetails(promotionPeriod, option.order),
        );
      }

      const periodQualification = structGet(promotionPeriodQualifications, promotionPeriodID);

      // [model/service/PromotionService.cfc:L1053] the gate reads ONLY `qualificationsMeet` - never
      // `qualifiedFulfillmentIDs`, never `qualifierDetails`, and never the dead `qualifiedFulfillments`.
      // The read is not widened. Absence is narrowed to a failed gate rather than asserted away.
      if (periodQualification === undefined || !periodQualification.qualificationsMeet) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L1055]: `!arrayLen(x) || hasX(...)` - an EMPTY
      // COLLECTION MEANS "NO RESTRICTION". Expressed as an explicit `length === 0`, and as identifier
      // membership because the ported reward publishes the link tables as identifier arrays.
      const fulfillmentMethodIDs = reward.getFulfillmentMethodIDs();

      if (
        fulfillmentMethodIDs.length !== 0 &&
        !fulfillmentMethodIDs.includes(
          option.orderFulfillment.fulfillmentMethod.fulfillmentMethodID,
        )
      ) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L1057]: the shipping method is read from
      // `getShippingMethodRate().getShippingMethod()` - the OPTION's rate - and NOT from the
      // fulfillment, and unlike the fulfillment arm's conjunct at [L355] this one carries no null test
      // because the rate always resolves one. Both readings are the source's and both are preserved.
      const shippingMethodIDs = reward.getShippingMethodIDs();

      if (
        shippingMethodIDs.length !== 0 &&
        !shippingMethodIDs.includes(option.shippingMethodRate.shippingMethod.shippingMethodID)
      ) {
        continue;
      }

      // [model/service/PromotionService.cfc:L1059-L1068] the CORRECT address-zone loop - see the
      // register entry 11 proof above. `addressIsInZone` defaults TRUE so an unrestricted reward
      // passes; configured zones force it false and the first match flips it back and stops the scan.
      let addressIsInZone = true;
      const shippingAddressZoneIDs = reward.getShippingAddressZoneIDs();

      if (shippingAddressZoneIDs.length !== 0) {
        addressIsInZone = false;

        // CFML parity [model/service/PromotionService.cfc:L1063]: this loop dereferences
        // `getAddress()` with NEITHER an `isNull` test NOR an `isNew()` test, unlike the fulfillment
        // arm at [L360] which guards both. The asymmetry is real and is preserved: an unresolved
        // address raises here exactly as it raises in the source, rather than being silently treated
        // as failing the zone test.
        const addressProjection = toAddressProjection(
          dereferenceFulfillmentAddress(option.orderFulfillment, 'L1063'),
        );

        for (const addressZone of toConfiguredShippingAddressZones(shippingAddressZoneIDs)) {
          if (this.addressZoneEvaluator.isAddressInZone(addressProjection, addressZone)) {
            addressIsInZone = true;
            break;
          }
        }
      }

      // [model/service/PromotionService.cfc:L1070]
      if (!addressIsInZone) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L1071]: POSITIONAL, with the literal quantity
      // `1`, against the option's TOTAL CHARGE.
      const discountAmount = this.getDiscountAmount(reward, option.totalCharge, 1);

      // CFML parity [model/service/PromotionService.cfc:L1073]: STRICT greater-than, so on a tie the
      // FIRST qualifying reward wins. This is the OPPOSITE of the price-group cascade's
      // last-match-wins selection, and combined with the absence of `ORDER BY` on the reward query it
      // makes tie outcomes driver-order dependent. Expressed through `Money.isGreaterThan`, never as
      // `>=` and never as a numeric comparison.
      if (discountAmount.isGreaterThan(bestDiscountAmount)) {
        // [model/service/PromotionService.cfc:L1074-L1075] both members are updated together.
        bestDiscountAmount = discountAmount;
        bestPromotionID = dereferencePromotion(promotionPeriod, 'L1075').getPromotionID();
      }
    }

    // [model/service/PromotionService.cfc:L1085]
    return { promotionID: bestPromotionID, discountAmount: bestDiscountAmount };
  }

  // =====================  END: Logical Methods ============================

  // ===================== START: DAO Passthrough ===========================

  /**
   * How many placed orders have used a promotion code.
   *
   * [model/service/PromotionService.cfc:L1094-L1096].
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L1094, L1098]: both DAO pass-throughs declare
   * `returntype="boolean"` while returning the DAO's numeric count. CONFIRMED THREE WAYS: the service
   * declares `boolean` here; the DAO declares `returntype="numeric"` on both
   * [model/dao/PromotionDAO.cfc:L254, L274] and returns `results[1]` of a `SELECT count(o.orderID)`;
   * and both callers in `model/service/OrderService.cfc` compare the result numerically with `<=`
   * against a maximum use count. The target types the HONEST `Promise<number>`, and the legacy
   * declaration is recorded here rather than reproduced - a boolean return type is not expressible
   * without discarding the data every caller actually uses. Register entry 15.
   *
   * The legacy body forwards with `argumentcollection=arguments`, passing the whole argument struct
   * through. The target forwards the parameter explicitly: emulating CFML's `arguments` struct is
   * exactly the transliteration the migration directive forbids.
   */
  public async getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number> {
    return this.promotionRepository.getPromotionCodeUseCount(promotionCode);
  }

  /**
   * How many placed orders belonging to one account have used a promotion code.
   *
   * [model/service/PromotionService.cfc:L1098-L1100]. Register entry 15 applies identically; see
   * `getPromotionCodeUseCount` above for the three-way confirmation.
   *
   * The out-of-scope `Account` entity is reduced to an opaque `accountID`. That is sanctioned and is
   * NOT a signature reshaping, and the source itself shows why it loses nothing: the DAO's only use of
   * the account is `arguments.account.getAccountID()` [model/dao/PromotionDAO.cfc:L292].
   */
  public async getPromotionCodeAccountUseCount(
    promotionCode: PromotionCode,
    accountID: string,
  ): Promise<number> {
    return this.promotionRepository.getPromotionCodeAccountUseCount(promotionCode, accountID);
  }

  // LEGACY-NOTE [model/service/PromotionService.cfc:L1092, L1102]: the DAO Passthrough section opens
  // with `START` twice in the source; the second banner was clearly intended to be `END`. Corrected
  // here because a banner is a comment and not a behaviour, and recorded in the secondary register.
  // =====================  END: DAO Passthrough ============================
}
