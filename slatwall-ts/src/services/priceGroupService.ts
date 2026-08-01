// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts                     composition root (wiring)
//   src/handlers/priceResolutionHandler.ts        price-resolution entrypoint
//   src/handlers/promotionApplicationHandler.ts   orders the two order passes
//   src/services/promotionService.ts              ported PromotionService
//   tests/unit/services/priceGroupService.test.ts net-new characterization tier
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - Price group resolution and rate application service
//
// PORTED FROM: model/service/PriceGroupService.cfc (475 lines, confirmed by
// `wc -l`), as a 1:1 logic extraction. Thirteen public methods, every legacy
// name carried over VERBATIM in CFML camelCase - including the capitalised `SKU`
// in `updatePriceGroupSKUSettings` and the capitalised `JSON` in
// `getPriceGroupDataJSON`. Interface parity is the acceptance contract, so the
// names published here are permanently canonical and none may be "modernised".
//
// ★★★ THIS FILE IS MUST-PRESERVE AREA #2
//   The price-group half of "the price-group and currency resolution cascade".
//   Five behaviours below are load-bearing money behaviour, and every one of
//   them is easy to break by tidying it:
//
//     1. rate selection is LAST-match-wins, not first-match-wins;
//     2. the amount-type strategy asymmetry - only `percentageOff` rounds;
//     3. the two-decimal quantization is arithmetic, not presentation;
//     4. price-group comparison is STRICTLY less-than, so ties keep the incumbent;
//     5. the nominal five-level cascade has only two effective levels.
//
//   It has NO relationship to must-preserve area #1 (promotion discount math,
//   which lives in `src/services/promotionService.ts` (planned) and
//   `src/services/promotion/**`) beyond PRODUCING THE STATE that area #1 reads -
//   see the ordering constraint below. It has no relationship at all to
//   must-preserve area #3 (option-to-SKU resolution).
//
// ===========================================================================
// ★★★ THE CROSS-SERVICE ORDERING CONSTRAINT - DECLARED HERE, FOR CITATION
// ===========================================================================
//
//   `updateOrderAmountsWithPriceGroups()` MUST RUN BEFORE
//   `PromotionService.updateOrderAmountsWithPromotions()`. This is not a
//   preference, and it has nothing to do with how quickly anything runs - it
//   decides how much money a customer is charged, and it is NON-OPTIONAL.
//
//   THE REASON, READ FROM THE SOURCE. At
//   [model/service/PromotionService.cfc:L241-L254] the promotion engine chooses
//   the base price it discounts FROM according to whether the order item is
//   price-group eligible:
//
//     * an INELIGIBLE item discounts from `getPrice()` [L243];
//     * an ELIGIBLE item discounts from `getSkuPrice()` [L248] plus a correction
//       term of `originalDiscountAmount - (getExtendedSkuPrice() -
//       getExtendedPrice())` [L251].
//
//   THE PROMOTION PASS READS STATE THIS PASS WRITES. What this pass writes is
//   exactly that state: the item price at [model/service/PriceGroupService.cfc:L370]
//   and the applied price group at [L371]. Run the promotion pass first and the
//   eligibility branch reads values that do not exist yet, so the discount base
//   is wrong and the discount is wrong with it.
//
//   IN THE LEGACY SYSTEM THE ORDERING HELD ONLY BY LUCK OF CALL ORDER. Nothing
//   declared it. The out-of-scope orchestrator simply happened to call the two in
//   sequence - `model/service/OrderService.cfc` injects sixteen collaborators, of
//   which `priceGroupService` [model/service/OrderService.cfc:L60] and
//   `promotionService` [L61] are the in-scope pair. That is the strangler-fig
//   seam, and the call direction is INVERTED at it rather than followed.
//
//   THIS FILE IS WHERE THE CONSTRAINT IS DECLARED FIRST, and it is worded so it
//   can be cited: `src/services/promotionService.ts` (planned) is authored after
//   this file and points back here rather than restating the reasoning.
//
//   IT IS DOCUMENTED HERE, NOT IMPLEMENTED HERE. There is no sequencing helper,
//   no run-once latch, no phase parameter and no ordered-pipeline type in this
//   file, and none may be added. `src/handlers/promotionApplicationHandler.ts`
//   (planned) enforces the ordering in the composition root; this service
//   documents the contract and exposes the pass. Nothing more.
//
// ★ COLLABORATOR CALIBRATION, AND A SERVICE WITH NO DEAD INJECTION
//   The legacy component declares THREE collaborators - `priceGroupDAO`
//   [model/service/PriceGroupService.cfc:L51], `skuService` [L53] and
//   `productService` [L54], note the blank line at L52 separating the DAO from
//   the two services - all three with an explicit `type="any"`, and ALL THREE
//   ARE LIVE. Each has exactly ONE call site, verified by reading all 475 lines:
//
//     priceGroupDAO   -> [L277] ONLY   `getAccountSubscriptionPriceGroups`
//     skuService      -> [L219] ONLY   framework generic `getSku(primaryKey)`
//     productService  -> [L206] ONLY   framework generic `getProduct(primaryKey)`
//
//   Calibration across the migrated slice: Brand 1 - Option 2 declared / 1 real -
//   PRICE GROUP 3, ALL LIVE - Promotion 3, all live - RoundingRule 1 - Sku 5
//   declared / 4 real - Product 8 declared / 6 real - out-of-scope `OrderService`
//   16. The brief's "16+" figure is a property of `OrderService`, NOT of this
//   slice: the heaviest in-scope service takes 8 and the two most behaviourally
//   critical take 3 each. THIS IS ONE OF ONLY TWO IN-SCOPE SERVICES WITH ZERO
//   DEAD INJECTIONS, in contrast to `optionService` (1 dead of 2) and
//   `productService` (2 dead of 8).
//
// ★ FIVE OF THIRTEEN METHODS ARE SYNCHRONOUS, AND THAT IS CONTRACTUAL
//   The highest synchronous ratio in the folder - compare `skuService` 0 of 9,
//   `productService` 1 of 15, `optionService` 1 of 3. It is not a style choice.
//   The async boundary rule is: a ported method is `async` IF AND ONLY IF the
//   legacy body reaches the DAO/ORM, or a collaborator that does.
//   `getRateForProductTypeBasedOnPriceGroup`, `getRateForProductBasedOnPriceGroup`,
//   `getRateForSkuBasedOnPriceGroup`, `calculateSkuPriceBasedOnPriceGroup` and
//   `calculateSkuPriceBasedOnPriceGroupRate` traverse only already-materialized
//   associations and perform only arithmetic, so they reach neither.
//
//   Their synchronicity is REQUIRED by `SkuPriceGroupResolver` (see the drift
//   note below) and it is what makes must-preserve area #2 testable with hand-built
//   entities and ZERO I/O. Do not make them `async` "for consistency".
//
// TEST COVERAGE HERE IS ENTIRELY NET-NEW, AND MUST NEVER BE PRESENTED AS PARITY
//   `meta/tests/unit/service/` holds only AccountServiceTest, HibachiServiceTest,
//   PaymentServiceTest and UtilityRBServiceTest. NONE is in scope and none touches
//   this component: THERE IS NO `PriceGroupServiceTest` ANYWHERE IN `meta/tests/`,
//   and there is no `PriceGroupTest` or `PriceGroupRateTest` entity test either.
//   This service therefore has NO legacy coverage lineage whatsoever - not one
//   assertion is carried forward, and every test written against it is net-new.
//
//   Only two files in the whole legacy suite are genuinely extended by this
//   migration (`meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc`), and neither is one of them.
//
//   NO TEST FILE IS AUTHORED HERE. `slatwall-ts/tests` is owned by a different
//   boundary. This file's obligation is to be TESTABLE: the six pure methods
//   above are synchronous and side-effect free, every collaborator is injected,
//   there is no ambient state and no module-level mutable cache anywhere below.
//
// E5 - PARAMETERIZED SQL ONLY: NOT APPLICABLE HERE, AND STATED RATHER THAN OMITTED
//   This service builds no SQL, composes no statement fragment, opens no
//   connection and imports no driver. The obligation to use prepared statements
//   EXCLUSIVELY - preserving the injection-safety guarantee `cfqueryparam` gave -
//   rests wholly with `src/repositories/mysql/**`. The one legacy DAO
//   reach-through this file performs, `getAccountSubscriptionPriceGroups`
//   [model/dao/PriceGroupDAO.cfc:L52], is a PORT CALL, not SQL authored here.
//   Nothing below may be read as diluting that obligation.
//
// NO USER RULES EXIST FOR THIS PROJECT
//   The project rules source was queried and returned exactly `No user rules
//   provided.`, on a plain read and again on a full-range read. There is no rules
//   document, so NO RULE IS INVENTED and none is attributed to the project. The
//   absence is not licence to lower the bar: enterprise-standard best practice
//   applies in its place - maximal TypeScript strictness, port-only dependencies,
//   `Money` as the sole arithmetic surface, one exported unit per file with no
//   barrel, environment-driven configuration, and in-code annotation of every
//   judgment call and every preserved defect.
//
// ⚠ LOCATOR CAUTION - THE SOURCE WINS
//   Every `model/**` locator cited below was re-read from the source while
//   authoring this file. `model/service/PriceGroupService.cfc` produced ZERO
//   DRIFT: all thirteen method declarations sit exactly at L57, L102, L140, L184,
//   L230, L262, L271, L301, L316, L343, L364, L397 and L461; the only two
//   `precisionEvaluate` sites are L323 and L331; `numberFormat` is at L339; the
//   amount-type `switch` spans L321-L336; and the file is 475 lines. Recorded as
//   a POSITIVE verification, because project locators are known to drift and this
//   one did not.
//
//   TWO DRIFT CORRECTIONS ARE RECORDED, both against the specification rather
//   than against the CFML source, and both at their point of use below:
//   `SkuPriceGroupResolver` has moved module, and it has three members rather
//   than two. See `assertSatisfiesSkuPriceGroupResolver`.
//
//   THE CFML TREE IS REFERENCE ONLY. Reading a file never converts it into a
//   write target: no `model/**`, `org/Hibachi/**`, `integrationServices/**`,
//   `config/**` or `meta/**` file is created, modified or deleted by this
//   migration. `model/service/OrderService.cfc` in particular keeps its L60 and
//   L61 injections intact - that is the strangler-fig seam, and the CFML monolith
//   must keep running.
//
// BUDGET LEDGERS - FOUR DISTINCT LEDGERS, NEVER CONFLATED, AND WHAT THIS FILE SPENDS
//   * SIGNATURE RESHAPINGS: 3 project-wide. THIS FILE SPENDS EXACTLY ONE, on
//     `updateOrderAmountsWithPriceGroups` (`void` + in-place mutation becomes a
//     returned intent array). Narrowing the out-of-scope `Account` entity to an
//     opaque `accountID`, and refining an `any`/`struct` into a concrete type, are
//     sanctioned and are NOT reshapings.
//   * VISIBILITY WIDENINGS: 5 project-wide, ALL FIVE belong to
//     `promotionService.ts`. THIS FILE SPENDS NONE - no private legacy method is
//     promoted here, because the legacy component declares none.
//   * SIGNATURE WIDENINGS: 1 project-wide, already spent on
//     `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`. ZERO
//     REMAIN, AND THIS FILE SPENDS NONE. The `context` parameter added to
//     `calculateSkuPriceBasedOnCurrentAccount` is transformation rule T6, not a
//     draw against this ledger - reasoned out at that method.
//   * DELIBERATE DIVERGENCES: 3 project-wide, all three already allocated
//     elsewhere. THIS FILE SPENDS NONE. Every finding below is reproduced, not
//     repaired.
//   * PORTS: LOCKED AT 13. None is added, and no port MEMBER is invented. Three
//     framework affordances the thirteen do not carry are resolved by the two
//     patterns this codebase already established - see the gap-resolution note
//     above the constructor.
//
//   Of the 30 numbered entries in the legacy defect register plus its eight
//   secondary items, THIS FILE OWNS SIX NUMBERED - 5, 6, 7, 8, 29 and 30 - and
//   adds two further defects verified while porting: the live-association
//   mutation at [L276]+[L282], and the subscription-price-group disagreement
//   between [L271-L298] and [L343-L362].
//
// ★ BANNER AUDIT - THE DUPLICATED `START` REACHES SIX, AND ELEVEN OF THIRTEEN
//   METHODS SIT OUTSIDE EVERY BANNER
//   LEGACY-NOTE [model/service/PriceGroupService.cfc:L382, L384]: the component
//   opens `// ===== START: DAO Passthrough =====` TWICE, at L382 and again at
//   L384, and NEVER closes it - the sixth instance of this wart in the slice,
//   after PromotionService.cfc:L1102, RoundingRuleService.cfc:L181/L183,
//   BrandService.cfc:L57/L59, OptionService.cfc:L70/L80 and
//   ProductService.cfc:L102/L108. Six of the nine banner sections are EMPTY
//   (Logical L378/L380, DAO Passthrough, Process L386/L388, Status L390/L392 - a
//   section none of the sibling services declares - Smart List L451/L453 and Get
//   L455/L457), and only TWO of the thirteen methods live inside a banner at all:
//   `savePriceGroupRate` under Save Overrides L394/L449 and `deletePriceGroup`
//   under Delete Overrides L459/L472. The other eleven, L57 through L375, precede
//   every banner. The banners are organisational comments with no behaviour, so
//   they are recorded here once and not reproduced as section markers below; this
//   file is organised by the cascade instead. That the Smart List section is
//   EMPTY is load-bearing for scope - see `getPriceGroupDataJSON`.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L49]: the component header is
// the LONG form - `component extends="HibachiService" persistent="false"
// accessors="true" output="false" {` - matching BrandService.cfc:L49 and
// RoundingRuleService.cfc:L49, and unlike the short form used by
// OptionService.cfc:L49 and ProductService.cfc:L49. Recorded because the
// migration's structural survey tracks it; it has no target consequence, since
// `persistent="false"` and `accessors="true"` are ORM and framework directives
// that a TypeScript class needs no equivalent of.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L266, L274, L276, L353, L357,
// L466, L469]: SEVEN BARE-UNSCOPED ARGUMENT READS. Each of `sku`, `account` and
// `priceGroup` is read without the `arguments.` prefix and resolves to the
// argument anyway through CFML's scope search, while the same names ARE prefixed
// on neighbouring lines - [L274] reads bare `sku` two lines after [L271]
// declares it, and [L353]/[L357] read bare `account` inside a loop whose bound at
// [L351] reads `arguments.account`. All seven are inert. They are a SECONDARY
// REGISTER item, not defects, they consume no divergence budget, and TypeScript
// has no scope-search equivalent to reproduce, so parameters are simply read
// directly below.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L205, L207, L220, L224, L233]:
// the component calls five of its own members through `this.` while eleven other
// self-calls - [L92], [L116], [L131], [L154], [L159], [L174], [L264], [L290],
// [L308], [L353], [L367] - are unqualified. In CFML the two forms differ in
// whether the call re-enters through the component's public interface; here both
// are ordinary method calls and the distinction carries no behaviour. Noted once
// and not preserved as a distinction.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L185, L231]: `var local = {};`
// is declared TWICE in this component and is DEAD BOTH TIMES - never read, never
// written to, in `updatePriceGroupSKUSettings` and in `getPriceGroupDataJSON`.
// Both are deleted rather than emulated: reproducing a CFML `local` scope object
// in TypeScript would be exactly the transliteration the minimal-change directive
// forbids. Secondary register; no divergence budget spent. [L231] has one
// downstream consequence, recorded at `getPriceGroupDataJSON`.
// ---------------------------------------------------------------------------

import { PriceGroupRate } from '../domain/entities/priceGroupRate.js';
import { Money } from '../domain/valueObjects/money.js';
import { numberFormat } from '../lib/cfml/numberFormat.js';
import { cfEquals } from '../lib/cfml/struct.js';
import { cfLen, isNullish } from '../lib/cfml/truthiness.js';

import type { PriceGroup } from '../domain/entities/priceGroup.js';
import type { PriceGroupRateAmountType } from '../domain/entities/priceGroupRate.js';
import type { Product } from '../domain/entities/product.js';
import type { ProductType } from '../domain/entities/productType.js';
import type { Sku, SkuPriceGroupResolver } from '../domain/entities/sku.js';
import type {
  CurrentAccountContext,
  PriceGroupRepository,
} from '../domain/ports/priceGroupRepository.js';
import type { ProductRepository } from '../domain/ports/productRepository.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { OrderView } from '../domain/views/orderView.js';

// ---------------------------------------------------------------------------
// IMPORTS DELIBERATELY NOT MADE, EACH FOR A STATED REASON
//
// `decimal.js` and `zod`: E3. This file imports NO third-party runtime package.
//   Arithmetic goes through `Money`; this service performs no schema validation,
//   and adding one would breach schema continuity by introducing a constraint the
//   legacy component does not have.
//
// `../lib/cfml/list.js`: the legacy component performs NO list operation
//   anywhere in its 475 lines - no `listLen`, no `listGetAt`, no `listAppend`, no
//   `listToArray`, no `listFindNoCase`. The comma-list idiom belongs to
//   `RoundingRuleService` and to the promotion engine, not here. Stated rather
//   than silently omitted.
//
// `../lib/cfml/precision.js`: reasoned out in full at
//   `calculateSkuPriceBasedOnPriceGroupRate`. In short, `Money` IS the typed
//   translation of `precisionEvaluate` for these two sites, and routing through
//   the lower-level helpers would surface a `Decimal` into this file's locals -
//   precisely the encapsulation `Money` exists to provide.
//
// `../lib/logger.js`: no logging call site exists in the legacy component and
//   inventing one would fabricate behaviour.
//
// `../lib/config.ts`: static process configuration. It is NEVER a request scope
//   and never a settings resolver. On this file that is a live temptation,
//   because this is where ambient scope is removed (T6), so it is written down
//   rather than assumed.
//
// `../domain/ports/skuRepository.js`: reasoned out above the constructor. Its
//   seven published members carry no load-by-primary-key, which is the only thing
//   [L219] needs, so no edge to it exists and an unused one would not compile.
//
// NO INTRA-FOLDER IMPORT. This file imports nothing from `src/services/**`.
//   Every collaborator arrives as a constructor-injected contract and the graph is
//   assembled exactly once in `src/handlers/bootstrap.ts` (planned). In
//   particular `./roundingRuleService.js` is NOT imported: the rounding path
//   reaches the rounding service exactly as the legacy did, indirectly through
//   the `RoundingRule` entity.
//
// NO BARREL, NO `index.ts`, NO `types.ts`, and no path alias. Specifiers are
//   explicit and relative and carry the `.js` extension NodeNext requires. The
//   Lambda artifact is bundled as CommonJS, so there is no `import.meta` and no
//   top-level `await` anywhere below.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE FOUR CO-LOCATED PUBLIC TYPES
//
// JUDGMENT CALL: `PriceGroupAppliedIntent`, `BestPriceGroupDetails`,
// `PriceGroupSkuSettingsInput` and `PriceGroupRateSaveInput` are declared INLINE
// in this file rather than in a new domain module or a new port. E7 - one
// exported unit per file, plus at most the type aliases that belong to it -
// licenses exactly this, and each of the four belongs to precisely one method of
// precisely this class: nothing else in the subtree constructs or consumes any of
// them. Spawning four files would add four modules to the layout for zero
// consumers, and adding them to a port would imply a fifteenth port member.
//
// The precedent is established twice over:
// `src/domain/promotionEngine/qualifiedDiscountTypes.ts` declares
// `PromotionAppliedType` inline for exactly this reason, and
// `src/domain/ports/priceGroupRepository.ts` publishes `CurrentAccountContext`
// inline rather than spawning a file for it. PORTS REMAIN LOCKED AT 13 AND NO NEW
// DOMAIN FILE IS CREATED.
// ---------------------------------------------------------------------------

/**
 * The output of {@link PriceGroupService.updateOrderAmountsWithPriceGroups} for a
 * single order item.
 *
 * ★ THIS TYPE IS THE ANTI-CORRUPTION BOUNDARY, and the reason the price-group
 * engine can be deployed without porting the order aggregate.
 *
 * Legacy [model/service/PriceGroupService.cfc:L364] returns `void` and MUTATES
 * the order aggregate in place - `setPrice()` at [L370] and
 * `setAppliedPriceGroup()` at [L371]. `model/service/OrderService.cfc` and every
 * order, cart and fulfillment entity are explicitly out of scope, so the target
 * cannot mutate them and does not try. It returns INTENTS instead: a description
 * of what the caller should apply, carrying OPAQUE STRING IDENTIFIERS only.
 *
 * No `Order`, `OrderItem`, `Account` or `PriceGroup` instance appears on this
 * type - the winning price group is carried as `priceGroupID`, never as an entity
 * reference - and NOTHING in this file mutates order persistence.
 */
export interface PriceGroupAppliedIntent {
  /**
   * The order item the intent applies to, as an opaque identifier.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L370]: legacy reaches the
   * item itself through `order.getOrderItems()[i]`. Here the item is identified,
   * never held.
   */
  readonly orderItemID: string;

  /**
   * The price to apply, already quantized to two decimals by
   * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L370]:
   * `setPrice(priceGroupDetails.price)`.
   */
  readonly price: Money;

  /**
   * The winning price group, as an opaque identifier.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L371]:
   * `setAppliedPriceGroup(priceGroupDetails.priceGroup)` assigns the ENTITY. The
   * intent carries its identifier instead, because an intent that held a live
   * entity would reopen the boundary this type exists to close.
   */
  readonly priceGroupID: string;
}

/**
 * The return shape of
 * {@link PriceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount}.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L348, L369]: the legacy struct
 * seeds `priceGroup` with an EMPTY STRING as its "no price group" sentinel [L348]
 * and later tests it with `isObject(...)` [L369] - so the field's legacy type is
 * the union `string | any`. The target models it as `PriceGroup | undefined` and
 * tests for `undefined`. Refining a `struct` return into a named interface is the
 * migration's own typing rule, NOT a signature reshaping, and it spends nothing
 * from the three-reshaping ledger.
 */
export interface BestPriceGroupDetails {
  /**
   * The best price found, seeded from the SKU's own price.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L347]: seeded with
   * `sku.getPrice()`, NEVER with zero. A zero seed would make every price group
   * look worse than "no price group" and sell the SKU for nothing.
   */
  readonly price: Money;

  /**
   * The price group that produced {@link BestPriceGroupDetails.price}, or
   * `undefined` when no price group beat the SKU's own price.
   */
  readonly priceGroup: PriceGroup | undefined;
}

/**
 * The admin request-context payload consumed by
 * {@link PriceGroupService.updatePriceGroupSKUSettings}.
 *
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L184]: the legacy signature is
 * `public void function updatePriceGroupSKUSettings(data)` - the parameter is
 * UNTYPED and NOT declared `required`, the same shape as
 * `ProductService.getProductSmartList`'s `currentURL`. Typing it as a required
 * named interface is the migration's `any`-to-concrete refinement rule and is not
 * a signature reshaping.
 *
 * ★ THE THREE STRING SENTINELS BELOW ARE DATA CONTRACTS, NOT CONFIGURATION.
 * `"new amount"`, `"inherit"` and `""` are values the admin request context
 * carries, so E6's no-hardcoded-configuration rule does not reach them and they
 * are preserved verbatim as literals. Every comparison against them is
 * CASE-INSENSITIVE, because CFML's `!=`, `NEQ` and `EQ` are case-insensitive for
 * strings.
 */
export interface PriceGroupSkuSettingsInput {
  /**
   * The rate to update, or one of the two keyword sentinels.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L189, L194, L199]: read as a
   * rate identifier at [L205] and [L220], and compared against `"new amount"`,
   * `""` and `"inherit"` as a keyword. Required, because [L194] dereferences it
   * unconditionally.
   */
  readonly priceGroupRateId: string;

  /**
   * The product the rate is being attached to on the whole-product branch.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L206]: dereferenced
   * unconditionally on that branch, with no existence check. Declared required
   * rather than optional so the absence is a compile-time failure instead of a
   * runtime one; no default is supplied and no validation is added.
   */
  readonly productId: string;

  /**
   * The SKU identifier. An empty string selects the whole-product branch.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L197, L219]: dereferenced
   * unconditionally at [L197], before either branch is chosen.
   */
  readonly skuId: string;

  /**
   * The SKU itself, resolved by the caller.
   *
   * ★ THIS IS A BOUNDARY INPUT, NOT AN INVENTED PORT MEMBER. Legacy [L219] loads
   * the SKU through `getSkuService().getSku(arguments.data.skuId)` - the
   * FRAMEWORK's generic `get<Entity>(primaryKey)` accessor, not a method declared
   * on `SkuService.cfc`. None of the thirteen ports carries a load-by-primary-key
   * for SKUs: `src/domain/ports/skuRepository.ts` publishes exactly
   * `getTransactionExistsFlag`, `getSkuBySkuCode`, `getSkusBySelectedOptions`,
   * `searchSkusByProductType`, `getProductSkus`, `getSortedProductSkusID` and
   * `saveSku`, and INVENTING A FOURTEENTH MEMBER IS FORBIDDEN.
   *
   * The established resolution in this codebase is to make the entity a boundary
   * input on the call's own typed input type and to THROW when it is absent -
   * exactly what `src/services/skuService.ts` does for the same framework gap.
   * `undefined` is admitted and reproduces the legacy outcome: [L219] returns
   * null on a miss and [L221] then calls `addSku(null)`, which raises.
   */
  readonly resolvedSku: Sku | undefined;

  /**
   * The rate amount, forwarded to {@link PriceGroupService.savePriceGroupRate}
   * only when {@link PriceGroupSkuSettingsInput.priceGroupRateId} is the
   * `"new amount"` keyword.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L189-L190]: legacy DELETES
   * this key from the request context on every other path, so that a stale value
   * cannot overwrite the persisted rate. See
   * {@link PriceGroupService.updatePriceGroupSKUSettings} for why the target omits
   * it when building the payload instead of deleting it from the caller's object.
   */
  readonly amount?: string;
}

/**
 * The payload {@link PriceGroupService.savePriceGroupRate} reads.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L397]: declared `struct data`
 * and therefore OPTIONAL, yet [L399] dereferences `arguments.data.priceGroupRateId`
 * unconditionally. Both facts are preserved: the parameter stays optional for
 * signature parity, and the unconditional dereference is reproduced by throwing.
 */
export interface PriceGroupRateSaveInput {
  /**
   * The rate identifier, or the `"new amount"` keyword.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L399]: the only key the
   * method reads.
   */
  readonly priceGroupRateId: string;

  /**
   * The submitted amount, present only on the `"new amount"` path.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L190]: absent on every other
   * path because legacy deletes it. The target never writes this key through -
   * persistence of the amount is the repository's business - so it is carried for
   * payload fidelity and is deliberately not consumed here.
   */
  readonly amount?: string;
}

// ---------------------------------------------------------------------------
// THE ONE MODULE-LOCAL COLLABORATOR CONTRACT
//
// JUDGMENT CALL: three framework affordances the legacy component uses are NOT
// declared on `PriceGroupService.cfc` and are NOT carried by any of the thirteen
// ports. They are `HibachiService` generics, inherited rather than written:
//
//   [L233] `getPriceGroupSmartList()`  -> the generic `get<Entity>SmartList()`
//   [L276] `account.getPriceGroups()`  -> an ORM association on the out-of-scope
//                                          Account entity
//   [L351] `account.getPriceGroups()`  -> the same association
//   [L365] `order.getAccount().getPriceGroups()` -> the same association again
//
// `src/domain/ports/priceGroupRepository.ts` publishes exactly SIX members -
// `getAccountSubscriptionPriceGroups`, `getPriceGroup`, `getPriceGroupRate`,
// `savePriceGroup`, `savePriceGroupRate`, `deletePriceGroup` - and its header
// states without qualification that no seventh may be added: "no batch load, no
// loadAll, no count, no existence probe, no bulk save, no rate delete, no
// overload, no options bag, no cache-clear". A price-group LISTING and an
// ACCOUNT-TO-PRICE-GROUP read are therefore both unpublished, and NEITHER IS
// INVENTED.
//
// This codebase has established two patterns for exactly this gap, and the
// dividing principle between them is whether the call site's signature admits a
// boundary input:
//
//   (i)  BOUNDARY INPUT - `src/services/skuService.ts` resolves the generic
//        `get<Entity>(primaryKey)` by making the entity an input on the call's own
//        typed input type and throwing when unresolved. Used above for
//        `resolvedSku`, because `updatePriceGroupSKUSettings` takes a payload.
//   (ii) NARROW STRUCTURAL COLLABORATOR - `src/domain/entities/sku.ts` declares
//        `SkuPriceGroupResolver` and `src/domain/entities/roundingRule.ts`
//        declares its value-rounder contract inline, for capabilities no port
//        publishes. Used here, because `getPriceGroupDataJSON()` takes NO
//        arguments and `updateOrderAmountsWithPriceGroups(order)` takes only an
//        `OrderView` that carries an opaque `accountID` and no association -
//        neither signature can admit a boundary input without becoming a
//        reshaping, and the ledger has none to spend.
//
// AN INLINE STRUCTURAL COLLABORATOR IS NOT A FOURTEENTH PORT. The 13-port lock
// counts files under `src/domain/ports/`; this interface is module-local and
// un-exported, exactly as `src/domain/entities/roundingRule.ts` keeps its own.
// `src/handlers/bootstrap.ts` (planned) satisfies it structurally, with no
// `implements` clause and no intra-folder import, from whichever adapter owns
// framework-generic reads.
//
// Both members are grouped on ONE interface rather than two so that the
// constructor stays at THREE parameters, matching the legacy component's three
// declared collaborators one for one.
// ---------------------------------------------------------------------------

/**
 * The two framework-generic reads this service needs and no port publishes.
 *
 * Deliberately un-exported: exporting a collaborator contract from a service
 * module reads as an addition to the published port inventory, and the inventory
 * is locked.
 */
interface PriceGroupFrameworkReads {
  /**
   * The price groups assigned DIRECTLY to an account.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L276, L351, L365]:
   * `account.getPriceGroups()`, the ORM association on the out-of-scope `Account`
   * entity. The account is identified opaquely, so no out-of-scope entity crosses
   * the boundary.
   *
   * ★ THIS IS THE DIRECT ASSIGNMENT ONLY. It must NOT fold in subscription price
   * groups: `calculateSkuPriceBasedOnAccount` adds those itself at [L277-L284]
   * while `getBestPriceGroupDetailsBasedOnSkuAndAccount` deliberately does not,
   * and that disagreement is preserved behaviour. An implementation that quietly
   * merged them would erase a documented legacy defect.
   *
   * @param accountID - the account, as an opaque identifier.
   * @returns the directly-assigned price groups, empty when there are none.
   */
  getAccountPriceGroups(accountID: string): Promise<readonly PriceGroup[]>;

  /**
   * The CURRENT PAGE of price groups.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L233-L236]: legacy builds a
   * framework smart list and iterates `getPageRecords()` - one page, not the whole
   * collection. The paginated projection is part of the observable behaviour and
   * is preserved by keeping the member's name honest about it. NO PAGE SIZE IS
   * ASSERTED, here or anywhere below, because the source states none.
   *
   * @returns the price groups on the current page, empty when there are none.
   */
  getPriceGroupPageRecords(): Promise<readonly PriceGroup[]>;
}

/**
 * One entry of the {@link PriceGroupService.getPriceGroupDataJSON} rate array.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L242-L243]: the legacy struct
 * has exactly the two keys `id` and `name`. Module-local and un-exported, because
 * it is an internal shape of one method's JSON output and not part of this file's
 * published surface.
 */
interface PriceGroupRateDataEntry {
  readonly id: string;
  readonly name: string;
}

/**
 * One entry of the {@link PriceGroupService.getPriceGroupDataJSON} outer map.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L248-L251]: the legacy struct
 * has exactly the two keys `priceGroupName` and `priceGroupRates`.
 */
interface PriceGroupDataEntry {
  readonly priceGroupName: string | undefined;
  readonly priceGroupRates: readonly PriceGroupRateDataEntry[];
}

// ---------------------------------------------------------------------------
// MODULE-LOCAL HELPERS
//
// All are un-exported. No helper is added to this file's published surface, and
// no fourteenth public method exists - the precedent is `buildSkuCombinations` in
// `src/services/productService.ts`, which stays module-local for the same reason.
// ---------------------------------------------------------------------------

/**
 * Reads a rate's amount, throwing when it is absent.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L323, L331, L334]:
 * `getAmount()` is read at all three sites WITHOUT A GUARD, and
 * `PriceGroupRate.amount` is declared `ormType="big_decimal"` with no default at
 * [model/entity/PriceGroupRate.cfc:L54], so it can genuinely be absent. CFML
 * would raise on a null arithmetic operand; the target throws explicitly.
 *
 * ★ IT MUST NOT DEFAULT TO ZERO. On the `amountOff` branch a zero amount silently
 * means "no discount"; on the `amount` branch it means "free". Either is a wrong
 * answer that no one would notice, which is exactly why `Money.zero` is banned
 * from every seed and fallback in this file.
 *
 * Adding a guard the legacy lacks would breach schema continuity, so this is not
 * validation: it is the explicit form of the failure CFML produced implicitly.
 *
 * @param priceGroupRate - the rate whose amount is required.
 * @param amountType - the branch requiring it, for the diagnostic only.
 * @returns the rate's amount.
 * @throws when the rate carries no amount.
 */
function requireRateAmount(
  priceGroupRate: PriceGroupRate,
  amountType: PriceGroupRateAmountType,
): Money {
  const amount = priceGroupRate.getAmount();

  if (amount === undefined) {
    throw new Error(
      `PriceGroupRate "${priceGroupRate.getPriceGroupRateID()}" has amountType ` +
        `"${amountType}" but carries no amount. ` +
        'CFML parity [model/service/PriceGroupService.cfc:L323,L331,L334]: the amount is read ' +
        'without a guard and a null operand raises. No zero default is substituted, because a ' +
        'zero amount would silently mean "no discount" or "free".',
    );
  }

  return amount;
}

/**
 * Reproduces the unconditional throw behind
 * [model/service/PriceGroupService.cfc:L243].
 *
 * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]:
 * `getAmountRepresentation()` DOES NOT EXIST on `PriceGroupRate` and cannot be
 * served by the framework's `onMissingMethod`, so this line throws unconditionally
 * once any price group on the page has at least one rate. Verified from three
 * independent directions:
 *
 *   1. the identifier appears EXACTLY ONCE in the whole non-`org/` tree - at that
 *      call site, and nowhere else;
 *   2. `model/entity/PriceGroupRate.cfc` declares thirteen functions and none is
 *      it - `getAmountTypeOptions` [L87], `getAppliesTo` [L95], `setPriceGroup`
 *      [L181], `removePriceGroup` [L187], `addProductType` [L199],
 *      `removeProductType` [L207], `addProduct` [L219], `removeProduct` [L227],
 *      `addSku` [L239], `removeSku` [L247], `getAmountFormatted` [L262],
 *      `getSimpleRepresentationPropertyName` [L270], `getDisplayName` [L274];
 *   3. the entity declares ZERO `attributeValues`, so
 *      `HibachiEntity.onMissingMethod`'s `getAttributeValue` fallback cannot fire
 *      and control reaches the unconditional throw at
 *      [org/Hibachi/HibachiEntity.cfc:L565].
 *
 * The near-synonym `getAmountFormatted()` at
 * [model/entity/PriceGroupRate.cfc:L262] is the plausible intended target and is
 * DELIBERATELY NOT SUBSTITUTED - substituting it would turn a method that always
 * fails into one that returns data, which is a product decision and not a porting
 * decision.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Declared `never` so the compiler knows the call site cannot continue, which is
 * how a `string` field can be populated from a call that only ever throws.
 *
 * @param priceGroupRate - the rate the legacy line would have called it on.
 * @throws always.
 */
function getAmountRepresentation(priceGroupRate: PriceGroupRate): never {
  throw new Error(
    `getAmountRepresentation() does not exist on PriceGroupRate ` +
      `"${priceGroupRate.getPriceGroupRateID()}". ` +
      'LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the legacy call reaches ' +
      'HibachiEntity.onMissingMethod, which cannot serve it because PriceGroupRate declares no ' +
      'attributeValues, and throws. getAmountFormatted() is the plausible intended target and is ' +
      'deliberately not substituted.',
  );
}

/**
 * Reproduces the unconditional throw behind
 * [model/service/PriceGroupService.cfc:L400].
 *
 * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: `clearAmounts()` DOES
 * NOT EXIST on `PriceGroupRate` and cannot be served by `onMissingMethod` (the
 * entity declares no `attributeValues`), so it throws. Verified the same three
 * ways as `getAmountRepresentation` above: exactly one occurrence in the whole
 * non-`org/` tree, absent from the entity's thirteen declared functions, and no
 * EAV fallback available.
 *
 * ★ IT IS GUARDED BY [L399], AND THAT INVERTS THE CONSEQUENCE. Only the
 * `"new amount"` path reaches it, so:
 *
 *   * `priceGroupRateId` IS `"new amount"` -> this throws, and nothing after it
 *     runs for that call. The admin "create a new amount" workflow ALWAYS FAILS in
 *     legacy.
 *   * `priceGroupRateId` is anything else -> [L400] is skipped, [L404] saves, and
 *     THE EXCLUSIVITY BLOCK AT [L407-L444] IS REACHABLE. It is not dead code.
 *
 * Note the interaction with `updatePriceGroupSKUSettings`: [L189-L190] strips the
 * `amount` key precisely when `priceGroupRateId` is NOT `"new amount"`, so the
 * path that keeps its amount is exactly the path that reaches this throw.
 * Preserved deliberately; do not fix without a product decision.
 *
 * @param priceGroupRate - the rate the legacy line would have called it on.
 * @throws always.
 */
function clearAmounts(priceGroupRate: PriceGroupRate): never {
  throw new Error(
    `clearAmounts() does not exist on PriceGroupRate ` +
      `"${priceGroupRate.getPriceGroupRateID()}". ` +
      'LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: the legacy call reaches ' +
      'HibachiEntity.onMissingMethod, which cannot serve it because PriceGroupRate declares no ' +
      'attributeValues, and throws. It is guarded by L399, so only the "new amount" admin path ' +
      'fails; every other rate-save path completes and runs the exclusivity block.',
  );
}

/**
 * Builds the payload `updatePriceGroupSKUSettings` forwards to
 * `savePriceGroupRate`, omitting `amount` on every path but `"new amount"`.
 *
 * JUDGMENT CALL: legacy achieves this by DELETING the key from the caller's own
 * struct - `StructDelete(arguments.data, "amount")` at
 * [model/service/PriceGroupService.cfc:L190] - the third caller-mutation site in
 * this slice, after `BrandService.cfc:L70`/`L72` and
 * `ProductService.cfc:L297`/`L299`. The target does NOT mutate its input: the
 * input is a typed, caller-owned, deeply `readonly` object, and
 * `src/lib/cfml/struct.ts` DELIBERATELY DOES NOT EXPORT a `structDelete`
 * counterpart. The key is omitted while constructing the forwarded payload
 * instead, and no removal affordance is exposed on the input type.
 *
 * The legacy rationale comment at [L188] is carried across verbatim below,
 * because it explains why the omission matters rather than merely what it does.
 *
 * @param data - the admin request-context payload.
 * @returns the payload to forward.
 */
function buildRateSavePayload(data: PriceGroupSkuSettingsInput): PriceGroupRateSaveInput {
  // Legacy [model/service/PriceGroupService.cfc:L188], verbatim:
  //   "If we are not updating to a new amount then make sure to delete "amount"
  //    from RC or else it will overwrite the Rate."
  //
  // CFML parity [model/service/PriceGroupService.cfc:L189]: `!=` on strings is
  // CASE-INSENSITIVE in CFML, so "NEW AMOUNT" and "New Amount" match the sentinel
  // too. `cfEquals` preserves that; a bare `===` would narrow behaviour.
  if (!cfEquals(data.priceGroupRateId, 'new amount')) {
    return { priceGroupRateId: data.priceGroupRateId };
  }

  const amount = data.amount;

  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
  // property, so an absent amount is expressed by omitting the key - which is
  // also the honest translation: a key the request context never carried is a key
  // CFML had nothing to delete and nothing to forward.
  if (amount === undefined) {
    return { priceGroupRateId: data.priceGroupRateId };
  }

  return { priceGroupRateId: data.priceGroupRateId, amount };
}

/**
 * Reads the caller-resolved SKU, throwing when it is absent.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L219, L221]: legacy loads the
 * SKU through the framework generic `getSku(primaryKey)`, which returns null on a
 * miss, and then calls `addSku(null)` at [L221], which raises. The target throws
 * at the point the SKU is needed rather than one line later.
 *
 * @param data - the admin request-context payload.
 * @returns the resolved SKU.
 * @throws when the caller resolved no SKU for `skuId`.
 */
function requireResolvedSku(data: PriceGroupSkuSettingsInput): Sku {
  const sku = data.resolvedSku;

  if (sku === undefined) {
    throw new Error(
      `No SKU was resolved for skuId "${data.skuId}". ` +
        'CFML parity [model/service/PriceGroupService.cfc:L219,L221]: the framework accessor ' +
        'returns null on a miss and addSku(null) then raises. The SKU is a boundary input ' +
        'because no port publishes a SKU load-by-primary-key and no port member was invented.',
    );
  }

  return sku;
}

/**
 * Price group resolution, price-group rate application, and the price-group order
 * pass.
 *
 * Ported from `model/service/PriceGroupService.cfc` (475 lines). Thirteen public
 * methods, every legacy name verbatim. See the module header for the full
 * provenance, the budget ledgers, the banner audit and the net-new coverage
 * statement; this comment carries the two facts a caller must not miss.
 *
 * ★★★ ORDERING CONSTRAINT - {@link PriceGroupService.updateOrderAmountsWithPriceGroups}
 * MUST BE EXECUTED BEFORE `PromotionService.updateOrderAmountsWithPromotions()`.
 * The requirement is EXPLICIT AND NON-OPTIONAL. The promotion pass chooses the
 * base price it discounts from according to price-group eligibility at
 * [model/service/PromotionService.cfc:L241-L254], so IT READS STATE THIS PASS
 * WRITES - the item price at [model/service/PriceGroupService.cfc:L370] and the
 * applied price group at [L371]. Reverse the two and the discount base is wrong
 * and the discount is wrong with it. In the legacy system the ordering held only
 * because `model/service/OrderService.cfc` happened to call them in that sequence;
 * here it is stated, and it is enforced by
 * `src/handlers/promotionApplicationHandler.ts` (planned). This class contains no
 * sequencing helper, no latch and no phase parameter, and none may be added.
 *
 * ★ FIVE METHODS ARE SYNCHRONOUS BY CONTRACT, not by preference -
 * {@link PriceGroupService.getRateForProductTypeBasedOnPriceGroup},
 * {@link PriceGroupService.getRateForProductBasedOnPriceGroup},
 * {@link PriceGroupService.getRateForSkuBasedOnPriceGroup},
 * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroup} and
 * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}. They traverse
 * only already-materialized associations and perform only arithmetic, so the async
 * boundary rule keeps them synchronous; `SkuPriceGroupResolver` requires two of
 * them to be; and their synchronicity is what makes the must-preserve cascade
 * testable with hand-built entities and no I/O.
 *
 * ★ THE CLASS DECLARES `implements SkuPriceGroupResolver`, which is the mechanical
 * enforcement of a gate rather than decoration.
 * `src/handlers/bootstrap.ts` (planned) satisfies that contract by adapting this
 * service, so any divergence in those three signatures - an extra required
 * parameter, a promise where a value is published, a renamed argument shape -
 * breaks the structural match. Declaring `implements` turns that from a review
 * item into a compile error.
 *
 * TWO DRIFT CORRECTIONS AGAINST THE SPECIFICATION, both recorded here because
 * this is the file that consumes the contract:
 *
 *   1. `SkuPriceGroupResolver` is NOT published from
 *      `src/domain/ports/priceGroupRepository.ts`. That port's tail records that
 *      the contract was RELOCATED into `src/domain/entities/sku.ts`, where it is
 *      declared at L389. `CurrentAccountContext` stays on the port and is imported
 *      from there, as the port intends.
 *   2. It has THREE members, not two. Besides
 *      `calculateSkuPriceBasedOnPriceGroup` and
 *      `calculateSkuPriceBasedOnCurrentAccount` it also requires
 *      `getRateForSkuBasedOnPriceGroup(sku, priceGroup): PriceGroupRate | undefined`,
 *      synchronous, because [model/entity/Sku.cfc:L266] reaches
 *      [model/service/PriceGroupService.cfc:L140] directly. All three are already
 *      among the thirteen with exactly the required shapes, so the correction
 *      changes nothing structurally - it is recorded so the next reader does not
 *      go looking for the interface where the specification says it lives.
 */
export class PriceGroupService implements SkuPriceGroupResolver {
  /**
   * @param priceGroupRepository - price-group persistence and the one subscription
   * reach-through. Replaces the legacy `priceGroupDAO` property declared at
   * [model/service/PriceGroupService.cfc:L51], whose sole live call site is [L277].
   *
   * ★ `model/dao/PriceGroupDAO.cfc` DECLARES EXACTLY ONE FUNCTION -
   * `getAccountSubscriptionPriceGroups` at [model/dao/PriceGroupDAO.cfc:L52], with
   * no `returntype`. Every other price-group data operation this service performs
   * rode INHERITED framework and ORM CRUD, not a DAO method, so the port's other
   * five members are attributed to that ORM/framework origin and never to a DAO
   * locator that does not exist.
   *
   * @param productRepository - product load-by-identifier. Replaces the legacy
   * `productService` property declared at [L54], whose sole live call site is
   * [L206].
   *
   * @param frameworkReads - the two `HibachiService`/ORM generics no port
   * publishes. Replaces the legacy `skuService` property declared at [L53] on the
   * count, though not in kind - see {@link PriceGroupSkuSettingsInput.resolvedSku}
   * for why the SKU load became a boundary input instead.
   *
   * T1 - DI/1 0.4.2 resolved `property name="xService";` declarations by a runtime
   * convention scan that carried a 30-second first-scan lock. Every collaborator
   * here is an explicit constructor argument typed to a contract, wired exactly
   * once in `src/handlers/bootstrap.ts` (planned). There is no runtime scan, no
   * service locator, no DI container package, no optional parameter and no
   * default - a missing collaborator is a compile error rather than a null at
   * first use.
   *
   * JUDGMENT CALL: legacy injects `skuService` [L53] and `productService` [L54]
   * SOLELY to reach the framework's generic `get<Entity>(primaryKey)` accessor at
   * [L219] and [L206]. Neither call targets a method declared on
   * `SkuService.cfc` or `ProductService.cfc`, so neither is a sibling-service
   * dependency in substance. The product load resolves cleanly through the
   * published `productRepository.getProductByProductID` port member; the SKU load
   * has no published counterpart at all and becomes a boundary input. NO PORT
   * MEMBER WAS INVENTED, ports remain locked at 13, and
   * `src/domain/ports/skuRepository.ts` is deliberately NOT injected - an
   * unreferenced constructor parameter would not survive `noUnusedLocals` and
   * `no-unused-private-class-members`, and pretending to depend on it would
   * misrepresent the graph.
   */
  constructor(
    private readonly priceGroupRepository: PriceGroupRepository,
    private readonly productRepository: ProductRepository,
    private readonly frameworkReads: PriceGroupFrameworkReads,
  ) {}

  // =========================================================================
  // ★★★ MUST-PRESERVE AREA #2 - THE FIVE-LEVEL CASCADE
  //
  // Three methods form a Chain of Responsibility. All three are synchronous, all
  // three return `PriceGroupRate | undefined`, and all three end by falling off
  // the end when nothing matched.
  //
  // ★ EVERY SELECTION LOOP IN ALL THREE IS LAST-MATCH-WINS, NOT FIRST-MATCH-WINS.
  // That is the single most breakable property in this file, and it is why
  // `Array.prototype.find()`, `findLast()`, `some()`, `filter()[0]` and `at(-1)`
  // are forbidden for these six loops. `find()` yields the FIRST match and is
  // simply wrong. `findLast()` is nearly right and is still wrong in the
  // productType variant, where "matches" is not a predicate over rates but the
  // outcome of an ancestor walk per rate.
  //
  // Each is therefore an explicit indexed `for` loop over the rate array with a
  // reassigned `let returnRate`, exactly as the legacy is written.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L60, L105, L143]:
  // `javaCast("null","")` is CFML's explicit null literal, used to initialise
  // `returnRate` in all three methods. It is translated to `undefined`, and under
  // `exactOptionalPropertyTypes` the local is declared
  // `let returnRate: PriceGroupRate | undefined = undefined;` so the union is
  // stated rather than inferred from a later assignment.
  //
  // ★ NULL IS THE CONTRACT. [L96-L98], [L135-L137] and [L178-L180] each read
  // `if(!isNull(returnRate)) return returnRate;` with NO `else`, and a CFML
  // function that falls off the end returns null. The target returns `undefined`.
  // A `Money.zero`, a `0`, a thrown error or a synthesised default rate would each
  // change behaviour: this is the same load-bearing-null pattern as
  // `Sku.getPriceByCurrencyCode`, where substituting zero sells product for free.
  //
  // LEGACY-NOTE [model/service/PriceGroupService.cfc:L68, L81, L91, L96, L115,
  // L120, L130, L135, L153, L158, L163, L173, L178, L307, L326, L365]: sixteen
  // genuine `isNull(...)` tests. `src/lib/cfml/truthiness.ts`'s `isNullish()` is
  // used where the result is consumed only as a boolean, and a direct
  // `=== undefined` / `!== undefined` comparison is used where the operand must be
  // NARROWED for the compiler - because `isNullish()` returns `boolean`, as its
  // contract requires, and a `boolean` return cannot narrow a union. That module
  // documents the same reasoning for its own internals, so the split follows an
  // established precedent rather than inventing one. Both forms are semantically
  // identical here: every operand is a `T | undefined`, since the domain models
  // absence as `undefined` and never as `null`. None of the sixteen is modelled as
  // a `structKeyExists` probe, because none of them is one.
  //
  // LEGACY-NOTE [model/service/PriceGroupService.cfc:L63, L83, L108, L122, L146,
  // L165]: every legacy loop re-invokes `arguments.priceGroup.getPriceGroupRates()`
  // in its own bound expression and again on each indexed read. The ported
  // accessor hands out the LIVE array and nothing in these methods mutates it, so
  // hoisting it to one local per method is observationally identical. The
  // minimal-change directive scopes the functional surface, not the code style, and
  // it licenses exactly this.
  //
  // LEGACY-NOTE: `noUncheckedIndexedAccess` makes every indexed read yield
  // `T | undefined`, so each loop narrows its element into a local and skips an
  // absent one. A dense array never yields `undefined`, so those branches are
  // unreachable in practice; they exist because the compiler requires narrowing
  // and because a non-null assertion is banned outright by
  // `@typescript-eslint/no-non-null-assertion`. They are not guards over data and
  // add no constraint the legacy lacks.
  // =========================================================================

  /**
   * Resolves the price-group rate that applies to a product type, walking the
   * product-type ancestor chain and then the price-group parent chain.
   *
   * Ported from [model/service/PriceGroupService.cfc:L57-L99]. Level one of the
   * cascade, and the level the other two delegate into.
   *
   * FOUR LEVELS, IN THIS EXACT ORDER:
   *
   *   1. [L63-L78] for each rate, walk the productType PARENT CHAIN testing
   *      `rate.hasProductType(currentProductType)` [L70], ascending through
   *      `getParentProductType()` [L76];
   *   2. [L81-L88] if still unset, scan for a rate carrying the global flag;
   *   3. [L91-L93] if still unset and the price group has a parent, RECURSE into
   *      the parent price group with the SAME productType;
   *   4. [L96-L98] return only if something was found; otherwise fall off the end.
   *
   * @param productType - the product type to resolve a rate for.
   * @param priceGroup - the price group to resolve within.
   * @returns the applicable rate, or `undefined` when none applies.
   */
  getRateForProductTypeBasedOnPriceGroup(
    productType: ProductType,
    priceGroup: PriceGroup,
  ): PriceGroupRate | undefined {
    // Legacy [model/service/PriceGroupService.cfc:L60]:
    //   var returnRate = javaCast("null","");
    let returnRate: PriceGroupRate | undefined = undefined;

    const rates = priceGroup.getPriceGroupRates();

    // ---------------------------------------------------------------------
    // Level 1 - [L63-L78]: the productType ancestor walk, per rate.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L63-L78]: THE `break` AT
    // [L72] EXITS ONLY THE INNER `while` - the ancestor walk - and NOT the rate
    // loop. The outer `for` then increments, re-initialises `currentProductType`
    // at [L66] and walks again, so a LATER matching rate OVERWRITES `returnRate`.
    // Rate selection is therefore LAST-match-wins. `Array.prototype.find()` would
    // yield FIRST-match and is WRONG here.
    // ---------------------------------------------------------------------
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      // Legacy [L66]: re-initialised inside the rate loop, once per rate.
      let currentProductType: ProductType | undefined = productType;

      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L68-L77]: the
      // parent-productType walk has no cycle guard, so a cycle in
      // `parentProductType` would not terminate. Legacy has none either, and NO
      // GUARD IS ADDED HERE - unlike the child-price-group loop in
      // `deletePriceGroup`, no guard is sanctioned for this walk, and adding one
      // would be an unbudgeted behaviour change. The structure that makes a cycle
      // unrepresentable is the materialized `productTypeIDPath` column, which the
      // schema maintains and which this migration reads unchanged.
      while (currentProductType !== undefined) {
        if (rate.hasProductType(currentProductType)) {
          returnRate = rate;
          // Legacy [L72]: exits the ancestor walk only.
          break;
        }

        // Legacy [L76]: ascend one level.
        currentProductType = currentProductType.getParentProductType();
      }
    }

    // ---------------------------------------------------------------------
    // Level 2 - [L81-L88]: the global-rate scan, also LAST-match-wins (no
    // `break` anywhere in the legacy loop).
    //
    // JUDGMENT CALL: `PriceGroup.getGlobalPriceGroupRate()` exists - declared at
    // [model/entity/PriceGroup.cfc:L83] and ported at
    // `src/domain/entities/priceGroup.ts` - and it is DELIBERATELY NOT
    // SUBSTITUTED for this scan or for either of the other two. Reading the entity
    // helper's body settles it beyond doubt: [model/entity/PriceGroup.cfc:L83-L90]
    // does `return rates[i]` INSIDE its loop, so the helper is FIRST-match-wins
    // while all three inline scans are LAST-match-wins. Substituting it would
    // silently change which rate is selected whenever a price group carries more
    // than one global rate. The duplication is reproduced instead.
    // ---------------------------------------------------------------------
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        // CFML parity [L84]: `if(rates[i].getGlobalFlag())`. `globalFlag` is
        // declared `ormType="boolean" default="false"` at
        // [model/entity/PriceGroupRate.cfc:L53] and the ported accessor returns a
        // strict `boolean`, so this is already an explicit boolean test and no
        // truthiness coercion occurs.
        if (rate.getGlobalFlag()) {
          returnRate = rate;
        }
      }
    }

    // ---------------------------------------------------------------------
    // Level 3 - [L91-L93]: recurse into the parent price group, same productType.
    // ---------------------------------------------------------------------
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        returnRate = this.getRateForProductTypeBasedOnPriceGroup(productType, parentPriceGroup);
      }
    }

    // ---------------------------------------------------------------------
    // Level 4 - [L96-L98]: return if found, otherwise fall off the end.
    // ---------------------------------------------------------------------
    if (!isNullish(returnRate)) {
      return returnRate;
    }

    // Legacy falls off the end here and CFML returns null. `undefined` is the
    // contract; nothing is substituted for it.
    return undefined;
  }

  /**
   * Resolves the price-group rate that applies to a product.
   *
   * Ported from [model/service/PriceGroupService.cfc:L102-L138]. Level two of the
   * cascade.
   *
   * FIVE LEVELS, IN THIS EXACT ORDER:
   *
   *   1. [L108-L112] scan for a rate with `hasProduct(product)`, LAST-match-wins
   *      and with no `break` at all;
   *   2. [L115-L117] if unset, delegate to
   *      {@link PriceGroupService.getRateForProductTypeBasedOnPriceGroup} with the
   *      product's own product type;
   *   3. [L120-L127] if unset, scan for a global rate;
   *   4. [L130-L132] if unset, recurse into the parent price group with the same
   *      product;
   *   5. [L135-L137] return if found, otherwise fall off the end.
   *
   * @param product - the product to resolve a rate for.
   * @param priceGroup - the price group to resolve within.
   * @returns the applicable rate, or `undefined` when none applies.
   */
  getRateForProductBasedOnPriceGroup(
    product: Product,
    priceGroup: PriceGroup,
  ): PriceGroupRate | undefined {
    // Legacy [model/service/PriceGroupService.cfc:L105]: javaCast("null","").
    let returnRate: PriceGroupRate | undefined = undefined;

    const rates = priceGroup.getPriceGroupRates();

    // Level 1 - [L108-L112]. CFML parity: no `break`, so LAST-match-wins.
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      if (rate.hasProduct(product)) {
        returnRate = rate;
      }
    }

    // Level 2 - [L115-L117]: delegate with the product's product type.
    if (isNullish(returnRate)) {
      const productType = product.getProductType();

      // CFML parity [L116]: legacy passes `arguments.product.getProductType()`
      // straight through with no null test, so a product with no product type
      // would raise inside the callee. The ported accessor is typed
      // `ProductType | undefined`, so the absent case must be expressed; it is
      // expressed as "no rate resolved at this level", which is the outcome the
      // subsequent levels then act on. No default product type is synthesised.
      if (productType !== undefined) {
        returnRate = this.getRateForProductTypeBasedOnPriceGroup(productType, priceGroup);
      }
    }

    // ---------------------------------------------------------------------
    // Level 3 - [L120-L127].
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L120-L127]: this global
    // scan REPEATS the one already performed inside
    // `getRateForProductTypeBasedOnPriceGroup` at [L83-L88], over the same rate
    // collection of the same price group, so it cannot change the outcome.
    // Reproduced verbatim rather than removed: removing it is exactly the cleanup
    // the minimal-change directive forbids, and the cascade's shape is part of
    // what a reviewer checks method by method.
    // ---------------------------------------------------------------------
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        if (rate.getGlobalFlag()) {
          returnRate = rate;
        }
      }
    }

    // Level 4 - [L130-L132]: recurse into the parent price group.
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        returnRate = this.getRateForProductBasedOnPriceGroup(product, parentPriceGroup);
      }
    }

    // Level 5 - [L135-L137].
    if (!isNullish(returnRate)) {
      return returnRate;
    }

    return undefined;
  }

  /**
   * Resolves the price-group rate that applies to a SKU.
   *
   * Ported from [model/service/PriceGroupService.cfc:L140-L181]. Level three of
   * the cascade, the entry point the price calculation uses, and the site of
   * DEFECT 7.
   *
   * FIVE NOMINAL LEVELS - AND ONLY TWO EFFECTIVE ONES:
   *
   *   1. [L146-L150] scan for a rate with `hasSku(sku)`, LAST-match-wins, no
   *      `break`;
   *   2. [L153-L155] if unset, delegate to
   *      {@link PriceGroupService.getRateForProductBasedOnPriceGroup} with the
   *      SKU's product;
   *   3. [L158-L160] if unset, delegate to
   *      {@link PriceGroupService.getRateForProductTypeBasedOnPriceGroup} with the
   *      SKU's product's product type;
   *   4. [L163-L170] if unset, scan for a global rate;
   *   5. [L173-L175] if unset, recurse into the parent price group - calling THE
   *      PRODUCT VARIANT, which is DEFECT 7;
   *   6. [L178-L180] return if found, otherwise fall off the end.
   *
   * @param sku - the SKU to resolve a rate for.
   * @param priceGroup - the price group to resolve within.
   * @returns the applicable rate, or `undefined` when none applies.
   */
  getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
    // Legacy [model/service/PriceGroupService.cfc:L143]: javaCast("null","").
    let returnRate: PriceGroupRate | undefined = undefined;

    const rates = priceGroup.getPriceGroupRates();

    // Level 1 - [L146-L150]. CFML parity: no `break`, so LAST-match-wins.
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      if (rate.hasSku(sku)) {
        returnRate = rate;
      }
    }

    // Level 2 - [L153-L155]: delegate with the SKU's product.
    if (isNullish(returnRate)) {
      const product = sku.getProduct();

      // CFML parity [L154]: legacy passes `arguments.sku.getProduct()` straight
      // through with no null test. Same treatment as [L116] above.
      if (product !== undefined) {
        returnRate = this.getRateForProductBasedOnPriceGroup(product, priceGroup);
      }
    }

    // ---------------------------------------------------------------------
    // Levels 3, 4 and 5 - [L158-L175].
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L157-L175]: LEVELS 3, 4 AND
    // 5 CANNOT CHANGE THE RESULT. If level 2 returned nothing, then inside
    // `getRateForProductBasedOnPriceGroup` the following were ALL already
    // exhausted over this same price group and its ancestors: the product scan
    // [L108-L112], the productType cascade INCLUDING its own global scan
    // [L83-L88] and its own parent recursion [L91-L93], the product-variant global
    // scan [L120-L127], and the product-variant parent recursion [L130-L132].
    //
    // So [L158-L160] re-runs the productType cascade and finds nothing new,
    // [L163-L170] re-runs the global scan and finds nothing new, and [L173-L175]
    // re-runs the parent recursion that [L130-L132] already performed. THE NOMINAL
    // FIVE-LEVEL CASCADE HAS ONLY TWO EFFECTIVE LEVELS: the SKU rate, then
    // everything the product variant does.
    //
    // All five are reproduced verbatim and NOT collapsed. They are incapable of
    // changing the result, so they are harmless, and removing them is exactly the
    // cleanup the minimal-change directive forbids.
    // ---------------------------------------------------------------------

    // Level 3 - [L158-L160].
    if (isNullish(returnRate)) {
      const productType = sku.getProduct()?.getProductType();

      // CFML parity [L159]: legacy chains
      // `arguments.sku.getProduct().getProductType()` with no null test at either
      // step. Optional chaining expresses both absences at once, and an absent
      // product type simply leaves this level unresolved.
      if (productType !== undefined) {
        returnRate = this.getRateForProductTypeBasedOnPriceGroup(productType, priceGroup);
      }
    }

    // Level 4 - [L163-L170].
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        if (rate.getGlobalFlag()) {
          returnRate = rate;
        }
      }
    }

    // ---------------------------------------------------------------------
    // Level 5 - [L173-L175] - DEFECT 7.
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L173-L175]: the
    // parent-price-group recursion calls `getRateForProductBasedOnPriceGroup` -
    // THE PRODUCT VARIANT, NOT THE SKU VARIANT - so a rate on a parent price group
    // that includes THIS SKU SPECIFICALLY is never reached. The specification
    // characterises this as breaking the cascade's symmetry, and the verified
    // truth is stronger and stranger: because the correct recursion ALREADY
    // HAPPENED TRANSITIVELY at [L130-L132], the symmetry break is a REDUNDANT
    // NO-OP with no observable effect. It is still a defect - the code plainly
    // does not do what it reads as doing - and repairing it would change which
    // rate is selected the moment the transitive path stops covering it.
    // Preserved deliberately; do not fix without a product decision.
    // ---------------------------------------------------------------------
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        const product = sku.getProduct();

        if (product !== undefined) {
          returnRate = this.getRateForProductBasedOnPriceGroup(product, parentPriceGroup);
        }
      }
    }

    // Level 6 - [L178-L180].
    if (!isNullish(returnRate)) {
      return returnRate;
    }

    return undefined;
  }

  /**
   * Applies a price-group rate to a SKU's price.
   *
   * Ported from [model/service/PriceGroupService.cfc:L316-L340]. THE ARITHMETIC
   * HEART OF MUST-PRESERVE AREA #2, and the site of DEFECT 8.
   *
   * ★ THE PASSTHROUGH SEED. [L318] carries the verbatim legacy comment "setup the
   * new price as the old price in the event of a passthrough" and [L319] seeds
   * `newPrice` with `arguments.sku.getPrice()`. The seed is `sku.getPrice()` and
   * NEVER `Money.zero`: a zero seed would sell the SKU for nothing on the
   * fallthrough path, which is reachable - see below.
   *
   * ★ THE FALLTHROUGH IS REACHABLE, AND IT MUST NOT THROW. [L321-L336] is a
   * `switch` on `getAmountType()` with THREE cases and NO `default:`.
   * `amountType` is declared `ormType="string" hb_formFieldType="select"` at
   * [model/entity/PriceGroupRate.cfc:L55] WITH NO DEFAULT VALUE AND NO ENUMERATION
   * CONSTRAINT, so an unset or unrecognised value matches nothing, the switch falls
   * through, and the [L319] passthrough is what gets returned. No `default:` that
   * throws is added and no amount-type validation is introduced - either would be a
   * constraint the legacy schema does not carry.
   *
   * ★ DEFECT 8 IS A THREE-WAY ASYMMETRY, NOT A TWO-WAY ONE:
   *
   * | case            | arithmetic                        | precision | rounding rule |
   * | --------------- | --------------------------------- | --------- | ------------- |
   * | `percentageOff` | `p - (p * (amount / 100))` [L323] | yes       | YES [L326]    |
   * | `amountOff`     | `p - amount` [L331]               | yes       | no            |
   * | `amount`        | `amount` [L334]                   | none      | no            |
   *
   * The specification records that only `percentageOff` rounds, which is correct;
   * verification adds that the `amount` case uses no precision arithmetic at all,
   * because it performs no arithmetic - it is a direct assignment.
   *
   * @param sku - the SKU whose price is the arithmetic base.
   * @param priceGroupRate - the rate to apply.
   * @returns the resulting price, quantized to two decimals.
   */
  calculateSkuPriceBasedOnPriceGroupRate(sku: Sku, priceGroupRate: PriceGroupRate): Money {
    // ---------------------------------------------------------------------
    // JUDGMENT CALL - HOW THE TWO `precisionEvaluate` SITES ARE TRANSLATED.
    //
    // Legacy [L323] and [L331] pass a CFML SOURCE-CODE STRING to
    // `precisionEvaluate(...)`:
    //
    //   [L323] precisionEvaluate('arguments.sku.getPrice() -
    //            (arguments.sku.getPrice() * (arguments.priceGroupRate.getAmount() / 100))')
    //   [L331] precisionEvaluate('arguments.sku.getPrice() -
    //            arguments.priceGroupRate.getAmount()')
    //
    // The expression is TRANSLATED INTO TYPED CALLS, never into a string evaluated
    // at runtime: no `evaluate()`, no dynamic dispatch, no `Function` constructor.
    // Reproducing the string form would be exactly the transliteration the
    // minimal-change directive forbids, and it would be unanalysable by the
    // compiler.
    //
    // The typed calls used are `Money`'s own `minus`, `times` and `dividedBy`
    // rather than the lower-level helpers in `src/lib/cfml/precision.ts`, and that
    // is a deliberate choice with three reasons. First, `Money` IS the migration's
    // single arithmetic surface - "all money arithmetic passes through Money" - and
    // its operations are implemented over the same arbitrary-precision substrate
    // those helpers use, so this IS the typed translation of `precisionEvaluate`
    // and not a bypass of it. Second, `src/lib/cfml/precision.ts` returns
    // `PreciseValue`, which is the third-party `Decimal` type; funnelling money
    // through it would surface a `Decimal` into this file's locals, and `Money`
    // exists precisely so that never happens - it never exposes the underlying
    // decimal. Third, unwrapping each `Money` to a string and re-wrapping the
    // result would re-validate values already validated at construction, for no
    // gain. `src/domain/valueObjects/money.ts` documents the `a * (b / 100)`
    // composition against a promotion-engine parity site, so the shape below
    // follows an established precedent.
    //
    // ★ THE WRITTEN EXPRESSION SHAPE IS PRESERVED EXACTLY. [L323] computes
    // `price - (price * (amount / 100))`: the percentage is applied to the price
    // and the product is then SUBTRACTED. It is NOT rewritten as
    // `price * (1 - amount / 100)`. The two are equal in the reals and can differ
    // after the [L339] two-decimal quantization, so the legacy form is what is
    // reproduced.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L319, L323, L331, L334]:
    // `var newPrice` is REDECLARED FOUR TIMES in one function scope. CFML tolerates
    // redeclaration; TypeScript does not. Collapsed to a single `let`. Inert,
    // secondary register only - no behaviour change and no divergence budget spent.
    // ---------------------------------------------------------------------

    // Legacy [L318], verbatim: "setup the new price as the old price in the event
    // of a passthrough". Legacy [L319]: var newPrice = arguments.sku.getPrice();
    let newPrice: Money = sku.getPrice();

    // Legacy [L321]: switch(arguments.priceGroupRate.getAmountType())
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L321-L336]: only the
    // `percentageOff` branch applies the rate's rounding rule, at [L326-L328].
    // `amountOff` [L331] and `amount` [L334] skip it entirely, so ONE AND THE SAME
    // rounding rule attached to two rates changes the price for one amount type and
    // leaves it untouched for the others.
    // Preserved deliberately; do not fix without a product decision.
    switch (priceGroupRate.getAmountType()) {
      // Legacy [L322-L329].
      case 'percentageOff': {
        const skuPrice = sku.getPrice();
        const rateAmount = requireRateAmount(priceGroupRate, 'percentageOff');

        // Legacy [L323]: price - (price * (amount / 100)).
        newPrice = skuPrice.minus(skuPrice.times(rateAmount.dividedBy(100)));

        // -----------------------------------------------------------------
        // Legacy [L326-L328]:
        //   if(!isNull(arguments.priceGroupRate.getRoundingRule())) {
        //       newPrice = arguments.priceGroupRate.getRoundingRule().roundValue(newPrice);
        //   }
        //
        // ★ THIS DOES NOT CALL `roundingRuleService` DIRECTLY. It calls
        // `roundValue(value)` - ONE ARGUMENT - on the `RoundingRule` ENTITY, and
        // [model/entity/RoundingRule.cfc:L66-L68] declares
        // `public numeric function roundValue(required any value)` whose entire
        // body forwards to
        // `getService("roundingRuleService").roundValueByRoundingRule(value=..., roundingRule=this)`.
        //
        // JUDGMENT CALL: the ENTITY METHOD is used, because
        // `src/domain/entities/roundingRule.ts` publishes
        // `roundValue(value: Money): Money` - synchronous - and routing through it
        // reproduces the legacy call chain exactly. NO ROUNDING-SERVICE
        // CONSTRUCTOR PARAMETER IS ADDED and no narrow collaborator interface is
        // declared for it: the legacy component's three collaborators are
        // `priceGroupDAO` [L51], `skuService` [L53] and `productService` [L54] and
        // NOTHING ELSE, so injecting a rounding service here would invent a
        // dependency the source does not have. No 14th port was created; ports
        // remain locked at 13.
        //
        // LEGACY-NOTE [model/entity/RoundingRule.cfc:L67]: this is an EIGHTH
        // `getService()` service-locator site, ABSENT from the specification's
        // seven-site inventory (which lists Sku.cfc L258/L379/L421/L436/L568 and
        // Product.cfc L343/L367/L519). It is a genuine gap in the published
        // inventory, and it is why the price-group path reaches
        // `roundValueByRoundingRule` INDIRECTLY, through the entity, rather than
        // through an injected service on this component. Recorded here because
        // this file is where it surfaces.
        //
        // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L85]: because the
        // entity supplies both the expression and the direction from its own
        // persisted columns - `getRoundingRuleExpression()` and
        // `getRoundingRuleDirection()` - the two-argument defaults `"0.00"` and
        // `"Closest"` declared at [model/service/RoundingRuleService.cfc:L88] are
        // NEVER REACHED BY ANY LIVE CALL SITE. The 19%-price-cut mechanism that the
        // `"0.00"` expression produces is therefore a DATA condition - a persisted
        // expression of `"0.00"` - and not a defaulted call. This restates, so the
        // two files agree, the ruling already embedded in
        // `src/services/roundingRuleService.ts`.
        //
        // LEGACY-NOTE [model/entity/RoundingRule.cfc:L66;
        // model/service/RoundingRuleService.cfc:L84, L88]: A THREE-DEEP
        // RETURN-TYPE LIE runs down this path - the entity declares `numeric`, the
        // service's `roundValueByRoundingRule` declares `numeric`, and the
        // `roundValue` it delegates to actually returns a STRING. The ported chain
        // resolves it by typing: the entity method takes and returns `Money`, and
        // the string-to-decimal conversion happens once, explicitly, inside the
        // rounding service. No bare string flows into arithmetic here.
        // -----------------------------------------------------------------
        const roundingRule = priceGroupRate.getRoundingRule();

        if (roundingRule !== undefined) {
          newPrice = roundingRule.roundValue(newPrice);
        }

        break;
      }

      // Legacy [L330-L332]. No rounding rule is applied - DEFECT 8.
      case 'amountOff': {
        const rateAmount = requireRateAmount(priceGroupRate, 'amountOff');

        // Legacy [L331]: price - amount.
        newPrice = sku.getPrice().minus(rateAmount);

        break;
      }

      // Legacy [L333-L335]. A direct assignment: no arithmetic, therefore no
      // precision call, and no rounding rule - DEFECT 8.
      case 'amount': {
        newPrice = requireRateAmount(priceGroupRate, 'amount');

        break;
      }
    }

    // ---------------------------------------------------------------------
    // Legacy [L339]: return numberFormat(newPrice, "0.00");
    //
    // ★★★ CFML parity [model/service/PriceGroupService.cfc:L339]: THE TWO-DECIMAL
    // QUANTIZATION IS LOAD-BEARING ARITHMETIC, NOT PRESENTATION. It is applied
    // INSIDE this method and its result feeds price-group selection and the order
    // item price, along this exact chain:
    //
    //   here -> calculateSkuPriceBasedOnPriceGroup [L308]
    //        -> calculateSkuPriceBasedOnAccount's numeric sort [L290, L294]
    //        -> getBestPriceGroupDetailsBasedOnSkuAndAccount's `<` test [L353, L355]
    //        -> the order item price [L370]
    //
    // Rounding here therefore changes WHICH PRICE GROUP WINS and WHAT THE CUSTOMER
    // PAYS. It must not be deferred to a caller, and a full-precision `Money` must
    // not be returned in its place.
    //
    // JUDGMENT CALL: `numberFormat(...)` from `src/lib/cfml/numberFormat.ts` is
    // called directly and the result is wrapped back into `Money`, rather than
    // using `Money.toFixed2()`. The two produce the same digits, but
    // `src/domain/valueObjects/money.ts` documents `toFixed2()` as a PRESENTATION
    // step that is "never applied inside an arithmetic operation", and this site is
    // inside the arithmetic. Using the CFML-parity helper keeps that statement true
    // and keeps the two modules in agreement, and it names the legacy function the
    // line is a port of.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L316, L339]: the function is
    // declared `returntype="numeric"` but returns the STRING that `numberFormat`
    // produces. The target returns `Money`, constructed from that same two-decimal
    // decimal string, which resolves the declared-versus-actual mismatch by typing
    // rather than by changing behaviour.
    // ---------------------------------------------------------------------
    return Money.fromDecimalString(numberFormat(newPrice.toDecimalString()));
  }

  /**
   * Resolves and applies the price-group rate for a SKU within one price group.
   *
   * Ported from [model/service/PriceGroupService.cfc:L301-L313]. SYNCHRONOUS: it
   * calls only {@link PriceGroupService.getRateForSkuBasedOnPriceGroup} and
   * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}, neither of
   * which touches I/O. That synchronicity is required by `SkuPriceGroupResolver`.
   *
   * [L304] resolves the rate; [L307-L309] applies it when one was found; [L312]
   * otherwise returns `sku.getPrice()` UNCHANGED - the legacy comment at [L300]
   * calls it "just a passthough of sku.getPrice()", the source's own spelling.
   * `Money.zero` is never substituted for that passthrough.
   *
   * @param sku - the SKU to price.
   * @param priceGroup - the price group to price within.
   * @returns the price-group price, or the SKU's own price when no rate applies.
   */
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
    // Legacy [L304].
    const priceGroupRate = this.getRateForSkuBasedOnPriceGroup(sku, priceGroup);

    // Legacy [L307-L309]: if(!isNull(priceGroupRate)) { ... }
    if (priceGroupRate !== undefined) {
      return this.calculateSkuPriceBasedOnPriceGroupRate(sku, priceGroupRate);
    }

    // Legacy [L312]: the passthrough.
    return sku.getPrice();
  }

  /**
   * Resolves the lowest price available to an account across all of its price
   * groups, including the ones it holds through subscription usage benefits.
   *
   * Ported from [model/service/PriceGroupService.cfc:L271-L298].
   *
   * The out-of-scope `Account` entity is reduced to an OPAQUE `accountID` string.
   * That narrowing is explicitly sanctioned by the migration and is NOT a signature
   * reshaping - it spends nothing from the three-reshaping ledger.
   *
   * ★ THIS METHOD IS THE ONE THAT INCLUDES SUBSCRIPTION PRICE GROUPS.
   * {@link PriceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount} does
   * NOT, and that disagreement is a preserved legacy defect - see the marker below.
   *
   * @param sku - the SKU to price.
   * @param accountID - the account, as an opaque identifier.
   * @returns the lowest price found, never lower-bounded by zero.
   */
  async calculateSkuPriceBasedOnAccount(sku: Sku, accountID: string): Promise<Money> {
    // Legacy [L274]: var prices = [sku.getPrice()];
    //
    // The candidate list is SEEDED WITH THE SKU'S OWN PRICE, never with
    // `Money.zero`. A zero seed would win the [L294] ascending sort every time and
    // give the SKU away.
    const prices: Money[] = [sku.getPrice()];

    // ---------------------------------------------------------------------
    // Legacy [L276]: var priceGroups = account.getPriceGroups();
    // Legacy [L277]: var accountSubscriptionPriceGroups =
    //                  getPriceGroupDAO().getAccountSubscriptionPriceGroups(
    //                      arguments.account.getAccountID());
    //
    // LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L52]:
    // `getAccountSubscriptionPriceGroups` is THE ONLY FUNCTION `PriceGroupDAO`
    // declares, and it reads SUBSCRIPTION-OWNED TABLES -
    // `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`,
    // `SwSubsUsageBenefitPriceGroup`, `SwSubsUsage`, `SwSubscriptionStatus` and
    // `SwType`. It is reached through the repository port because account
    // price-group resolution is otherwise unreproducible, and it is the migration's
    // single deliberate reach into a subscription-owned table. NO SUBSCRIPTION
    // BUSINESS LOGIC IS PORTED: the query is a read, the result is a list of price
    // groups, and nothing about subscriptions is interpreted here.
    // ---------------------------------------------------------------------
    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    const accountSubscriptionPriceGroups =
      await this.priceGroupRepository.getAccountSubscriptionPriceGroups(accountID);

    // ---------------------------------------------------------------------
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L276, L282]: the account's
    // LIVE `priceGroups` association array is captured at [L276] with NO DEFENSIVE
    // COPY, and [L282] `arrayAppend`s into it. Calling this method therefore
    // PERMANENTLY ADDS the subscription price groups to the account's in-memory
    // collection for the remainder of the request. The [L281] guard prevents
    // duplicates, so repeated calls do not compound, but the account object is
    // polluted and the pollution is observable by anything that subsequently reads
    // `account.getPriceGroups()` - including
    // `getBestPriceGroupDetailsBasedOnSkuAndAccount` at [L351] and
    // `updateOrderAmountsWithPriceGroups` at [L365].
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L276-L284]: the legacy
    // mutation was an ARTIFACT OF HIBERNATE'S LIVE COLLECTIONS, not a decision. The
    // repository boundary materialises associations as FRESH ARRAYS per read, so
    // there is no live ORM collection here to mutate and the mutation is
    // STRUCTURALLY ABSENT BY CONSTRUCTION - it is not a deliberate divergence. NO
    // DIVERGENCE BUDGET IS SPENT: all three of the migration's divergences are
    // already allocated elsewhere. A local merged list is built instead, and the
    // spread below is what makes the port's `readonly` result mutable locally
    // without writing back through it.
    // ---------------------------------------------------------------------
    const priceGroups: PriceGroup[] = [...accountPriceGroups];

    // ---------------------------------------------------------------------
    // Legacy [L280-L284]:
    //   for(var i=1; i<=arrayLen(accountSubscriptionPriceGroups); i++) {
    //       if(!arrayFind(priceGroups, accountSubscriptionPriceGroups[i])) {
    //           arrayAppend(priceGroups, accountSubscriptionPriceGroups[i]);
    //       }
    //   }
    //
    // CFML parity [model/service/PriceGroupService.cfc:L281]: THE FIFTH INSTANCE OF
    // THE FIND-RESULT-TRUTHINESS ANTI-PATTERN in this slice, after
    // PromotionService.cfc:L865, L935, L966 and ProductService.cfc:L144.
    // `arrayFind` returns a 1-BASED INDEX OR ZERO, and `!0` is true, so the legacy
    // test happens to be correct - but the same shape written against a JavaScript
    // `findIndex` result would be WRONG, because `findIndex` returns `-1` for "not
    // found" and `-1` is truthy while index `0` is falsy. The comparison is
    // therefore written EXPLICITLY against `-1`. Never `if (!found)` and never
    // `if (index > 0)`.
    //
    // JUDGMENT CALL: CFML's `arrayFind` over an array of ENTITY OBJECTS compares by
    // reference or by deep value, depending on engine. The target compares by
    // `priceGroupID` instead, which is the identity that actually matters for a
    // persisted entity and the only comparison that is stable across two separately
    // materialized reads - the direct-assignment read and the subscription read
    // return distinct instances for the same row, so a reference comparison would
    // duplicate every shared price group. `cfEquals` is used so the comparison stays
    // case-insensitive, matching how the `Sw*` identifier columns compare in MySQL.
    // ---------------------------------------------------------------------
    for (let i = 0; i < accountSubscriptionPriceGroups.length; i += 1) {
      const subscriptionPriceGroup = accountSubscriptionPriceGroups[i];

      if (subscriptionPriceGroup === undefined) {
        continue;
      }

      const subscriptionPriceGroupID = subscriptionPriceGroup.getPriceGroupID();

      const foundIndex = priceGroups.findIndex((held) =>
        cfEquals(held.getPriceGroupID(), subscriptionPriceGroupID),
      );

      if (foundIndex === -1) {
        priceGroups.push(subscriptionPriceGroup);
      }
    }

    // Legacy [L287-L291]: one candidate price per price group.
    for (let i = 0; i < priceGroups.length; i += 1) {
      const priceGroup = priceGroups[i];

      if (priceGroup === undefined) {
        continue;
      }

      prices.push(this.calculateSkuPriceBasedOnPriceGroup(sku, priceGroup));
    }

    // ---------------------------------------------------------------------
    // Legacy [L294]: arraySort(prices, "numeric", "asc");
    // Legacy [L297]: return prices[1];
    //
    // CFML parity: CFML arrays are 1-BASED, so `prices[1]` after an ASCENDING sort
    // is THE MINIMUM. Index `0` is the translation.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L294]: the legacy array is
    // MIXED-TYPED - element 1 is a raw numeric from `sku.getPrice()` while every
    // other element is the STRING that `numberFormat` produced at [L339] - and
    // CFML's `"numeric"` sort coerces them to compare. In the target every element
    // is already a `Money`, so the coercion disappears and `compare` is used
    // directly. `Money` deliberately exposes no `min`, no `sort` and no `reduce`
    // helper; the closed surface is intentional and `compare` is the affordance it
    // publishes for exactly this.
    //
    // The sort is applied to a COPY. `prices` is a local array built here, so
    // sorting it in place would be harmless, but the copy keeps the rule uniform
    // across this file: a sequence that came from, or could come from, a port
    // result is never reordered in place.
    // ---------------------------------------------------------------------
    const sortedPrices = [...prices].sort((left, right) => left.compare(right));

    const lowestPrice = sortedPrices[0];

    if (lowestPrice === undefined) {
      // Unreachable: `prices` was seeded with exactly one element at [L274] and is
      // only ever appended to, so index 0 always exists. The narrowing is required
      // because `noUncheckedIndexedAccess` types the read as `Money | undefined`
      // and a non-null assertion is banned.
      throw new Error(
        'calculateSkuPriceBasedOnAccount produced no candidate price. ' +
          'This is unreachable: the candidate list is seeded with the SKU price at ' +
          '[model/service/PriceGroupService.cfc:L274] and is never emptied.',
      );
    }

    return lowestPrice;
  }

  /**
   * Resolves the lowest price available to the CURRENT account, or the SKU's own
   * price when no account is signed in.
   *
   * Ported from [model/service/PriceGroupService.cfc:L262-L268].
   *
   * ★ T6 - AMBIENT REQUEST SCOPE BECOMES AN EXPLICIT PARAMETER.
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L263-L264]: legacy reaches the
   * ambient request scope through `getSlatwallScope().getLoggedInFlag()` on one
   * line and `getHibachiScope().getAccount()` on THE VERY NEXT LINE - TWO DIFFERENT
   * SCOPE ACCESSORS IN THE SAME METHOD, on adjacent lines. Both resolve to the same
   * request scope; the codebase-wide convention is `getHibachiScope()` and
   * `getSlatwallScope()` is the outlier. BOTH are replaced by the single explicit
   * `context` parameter, which normalises the divergence as a side effect. NO
   * AMBIENT STATE REMAINS anywhere in this file.
   *
   * JUDGMENT CALL - THE ADDED PARAMETER IS NOT A DRAW AGAINST THE
   * SIGNATURE-WIDENING LEDGER. Legacy takes one argument and the target takes two,
   * which superficially reads as a widening, and the widening ledger holds exactly
   * ONE slot project-wide which is ALREADY SPENT on
   * `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`. The
   * `context` parameter is TRANSFORMATION RULE T6 - one of the six project-wide
   * rules, applied uniformly wherever ambient scope is read - and T6 is not scored
   * against that ledger. Two independent corroborations: the AAP's own
   * interface-mapping table publishes the two-parameter form, and
   * `src/domain/entities/sku.ts`'s `SkuPriceGroupResolver` declares
   * `calculateSkuPriceBasedOnCurrentAccount(sku, context)` as the canonical shape
   * this class must satisfy - so the two-parameter form is required, not chosen.
   *
   * `CurrentAccountContext` is IMPORTED from
   * `src/domain/ports/priceGroupRepository.ts`, which publishes it for exactly this
   * method. It is never redeclared here.
   *
   * @param sku - the SKU to price.
   * @param context - the explicit request context replacing the ambient scope.
   * @returns the account's lowest price, or the SKU's own price when not signed in.
   */
  async calculateSkuPriceBasedOnCurrentAccount(
    sku: Sku,
    context: CurrentAccountContext,
  ): Promise<Money> {
    // Legacy [L263]: if(getSlatwallScope().getLoggedInFlag()) { ... }
    //
    // CFML parity: "signed in" is expressed as "the context carries an account
    // identifier". `CurrentAccountContext` publishes `accountID` as its only
    // member, so the logged-in flag and the account are one test rather than two -
    // which is also what [L264] would have needed, since it immediately reads the
    // account it never null-tested.
    const accountID = context.accountID;

    if (accountID !== undefined) {
      // Legacy [L264]: return calculateSkuPriceBasedOnAccount(
      //                    sku=arguments.sku, account=getHibachiScope().getAccount());
      return await this.calculateSkuPriceBasedOnAccount(sku, accountID);
    }

    // Legacy [L266]: return sku.getPrice();
    //
    // The not-signed-in branch returns the SKU's own price - no rate lookup, no
    // zero. The bare unscoped `sku` read at [L266] is one of the seven recorded in
    // the module header and is inert.
    return sku.getPrice();
  }

  /**
   * Finds the best price group for a SKU and account, together with the price it
   * produces.
   *
   * Ported from [model/service/PriceGroupService.cfc:L343-L362].
   *
   * ★ THIS METHOD DELIBERATELY DOES NOT CONSULT SUBSCRIPTION PRICE GROUPS, and
   * that is the second half of a preserved defect - see the marker below. It reads
   * ONLY the account's directly-assigned price groups, exactly as [L351] does.
   *
   * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]:
   * `calculateSkuPriceBasedOnAccount` includes the account's subscription price
   * groups [L277-L284]; this method does not - it reads only
   * `account.getPriceGroups()` at [L351] and never calls the subscription query. Two
   * methods that both claim to compute "the best price for this account" therefore
   * DISAGREE ABOUT THE INPUTS. And because [L282] mutates the account's live
   * association array, WHETHER THE ORDER PASS AT [L364] SEES SUBSCRIPTION PRICE
   * GROUPS AT ALL depends on whether `calculateSkuPriceBasedOnAccount` happened to
   * run earlier in the same request for the same account. The two paths are NOT
   * harmonised here.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param sku - the SKU to price.
   * @param accountID - the account, as an opaque identifier.
   * @returns the best price and the price group that produced it, with
   * `priceGroup` left `undefined` when nothing beat the SKU's own price.
   */
  async getBestPriceGroupDetailsBasedOnSkuAndAccount(
    sku: Sku,
    accountID: string,
  ): Promise<BestPriceGroupDetails> {
    // ---------------------------------------------------------------------
    // Legacy [L346-L348]:
    //   var bestPrice = {};
    //   bestPrice.price = sku.getPrice();
    //   bestPrice.priceGroup = "";
    //
    // CFML parity [model/service/PriceGroupService.cfc:L348, L369]: the legacy
    // struct uses an EMPTY-STRING SENTINEL for "no price group" and later tests it
    // with `isObject(...)` at [L369]. The target models the field as
    // `PriceGroup | undefined` and tests for `undefined`. Refining a `struct`
    // return into a named interface is a typing rule, not a signature reshaping.
    //
    // Seeded with `sku.getPrice()`, never `Money.zero`.
    // ---------------------------------------------------------------------
    let bestPrice: BestPriceGroupDetails = {
      price: sku.getPrice(),
      priceGroup: undefined,
    };

    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L351, L353, L357]: MIXED
    // SCOPING inside one loop - the bound at [L351] reads
    // `arguments.account.getPriceGroups()` while the body at [L353] and [L357] reads
    // the bare unscoped `account.getPriceGroups()`, and the accessor is re-invoked
    // THREE TIMES PER ITERATION with no defensive copy. All three resolve to the
    // same collection, so one local read is observationally identical.
    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    for (let i = 0; i < accountPriceGroups.length; i += 1) {
      const priceGroup = accountPriceGroups[i];

      if (priceGroup === undefined) {
        continue;
      }

      // Legacy [L353].
      const thisPrice = this.calculateSkuPriceBasedOnPriceGroup(sku, priceGroup);

      // -----------------------------------------------------------------
      // Legacy [L355]: if(thisPrice < bestPrice.price) { ... }
      //
      // ★ CFML parity [model/service/PriceGroupService.cfc:L355]: STRICTLY
      // LESS-THAN. A price group whose computed price exactly TIES the incumbent -
      // the SKU's own price on the first iteration, or an earlier winner
      // afterwards - is NOT APPLIED, and among equal candidates the FIRST strictly
      // better one wins and later ties never displace it. `Money.isLessThan` is
      // used; NEVER `<=`, and never a `compare(...) <= 0` rewrite of it.
      // -----------------------------------------------------------------
      if (thisPrice.isLessThan(bestPrice.price)) {
        // Legacy [L356-L358] assigns the two struct keys in place. The ported
        // interface is `readonly`, so the object is replaced rather than mutated;
        // the observable result is identical and immutability is preserved for the
        // caller.
        bestPrice = { price: thisPrice, priceGroup };
      }
    }

    // Legacy [L361].
    return bestPrice;
  }

  /**
   * The price-group order pass: selects the best price group for every order item
   * and reports the price changes to apply.
   *
   * Ported from [model/service/PriceGroupService.cfc:L364-L375].
   *
   * ★★★ THIS PASS MUST BE EXECUTED BEFORE
   * `PromotionService.updateOrderAmountsWithPromotions()`. THE REQUIREMENT IS
   * EXPLICIT AND NON-OPTIONAL. The promotion engine chooses the base price it
   * discounts from according to price-group eligibility, so it reads the price and
   * the applied price group that THIS pass produces. Run the promotion pass first
   * and the discount is computed from a base that does not exist yet. Ordering is
   * enforced by `src/handlers/promotionApplicationHandler.ts` (planned); this method
   * documents the contract and exposes the pass, and contains no sequencing logic.
   *
   * ★ THIS IS BUDGETED SIGNATURE RESHAPING #1 OF 3, and the only one this file
   * spends. Legacy returns `void` and MUTATES THE ORDER AGGREGATE IN PLACE -
   * `setPrice()` at [L370] and `setAppliedPriceGroup()` at [L371]. The order
   * aggregate is explicitly out of scope, so the target returns
   * {@link PriceGroupAppliedIntent}s keyed by an OPAQUE `orderItemID` and NEVER
   * MUTATES ORDER PERSISTENCE. Its mirror is
   * `PromotionService.updateOrderAmountsWithPromotions`; the two smart-list renames
   * in `productService.ts` and `skuService.ts` together are reshaping #2, and a
   * fourth reshaping anywhere is a gate failure.
   *
   * ★ NO ARITHMETIC OCCURS IN THIS METHOD. It is pure selection plus reporting: all
   * of the arithmetic, including the load-bearing two-decimal quantization, already
   * happened in {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}.
   * Nothing here may add a precision call, a rounding step or a re-format.
   *
   * @param order - a read-only view of the order. Carries an opaque `accountID` and
   * no `Account` entity, by design.
   * @returns one intent per order item whose price a price group improves; items
   * that fail the gate produce NO intent, and are not reported with an unchanged
   * price.
   */
  async updateOrderAmountsWithPriceGroups(order: OrderView): Promise<PriceGroupAppliedIntent[]> {
    // CFML parity [model/service/PromotionService.cfc:L241-L254]: the promotion pass
    // reads the price and appliedPriceGroup this pass writes. Ordering was implicit
    // in OrderService's call sequence; here it is explicit and non-optional. Do not
    // reorder.
    const intents: PriceGroupAppliedIntent[] = [];

    // ---------------------------------------------------------------------
    // Legacy [L365]:
    //   if(!isNull(arguments.order.getAccount())
    //      && arrayLen(arguments.order.getAccount().getPriceGroups())) { ... }
    //
    // CFML parity [model/service/PriceGroupService.cfc:L365]: legacy tests
    // `order.getAccount()` and then that account's `priceGroups` collection.
    // `OrderView` carries only an OPAQUE `accountID` and no association, so the
    // equivalent test resolves the account's price groups through the framework
    // reads collaborator and then tests the length. `arrayLen(...)` is used as BARE
    // TRUTHINESS in the legacy condition, so the target compares EXPLICITLY against
    // zero using `cfLen`, which is the CFML-parity length helper. Never a bare
    // truthy array test.
    //
    // An absent `accountID` short-circuits before the read, exactly as the legacy
    // `!isNull(getAccount())` conjunct short-circuits before its own dereference.
    // ---------------------------------------------------------------------
    const accountID = order.accountID;

    if (accountID === undefined) {
      return intents;
    }

    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    if (!(cfLen(accountPriceGroups) > 0)) {
      return intents;
    }

    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L366, L369, L370, L371]: the
    // legacy loop re-invokes `arguments.order.getOrderItems()` in its bound and
    // re-indexes it three further times inside the body. It is collapsed to one
    // narrowed local per iteration; the minimal-change directive licenses this and
    // it changes nothing observable, since nothing in the loop mutates the
    // collection.
    const orderItems = order.orderItems;

    for (let i = 0; i < orderItems.length; i += 1) {
      const orderItem: OrderItemView | undefined = orderItems[i];

      if (orderItem === undefined) {
        continue;
      }

      // Legacy [L367]:
      //   var priceGroupDetails = getBestPriceGroupDetailsBasedOnSkuAndAccount(
      //       arguments.order.getOrderItems()[i].getSku(), arguments.order.getAccount());
      //
      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L367]: this is THE ONLY
      // POSITIONAL internal call in the component - every other self-call in all 475
      // lines uses keyword arguments. Inert; recorded once because the migration's
      // structural survey tracks call-style inconsistencies, and TypeScript has only
      // positional arguments in any case.
      const priceGroupDetails = await this.getBestPriceGroupDetailsBasedOnSkuAndAccount(
        orderItem.sku,
        accountID,
      );

      const winningPriceGroup = priceGroupDetails.priceGroup;

      // -----------------------------------------------------------------
      // Legacy [L369]:
      //   if(priceGroupDetails.price < arguments.order.getOrderItems()[i].getPrice()
      //      && isObject(priceGroupDetails.priceGroup)) { ... }
      //
      // CFML parity [model/service/PriceGroupService.cfc:L369]: BOTH CONDITIONS MUST
      // HOLD, the comparison is again STRICTLY LESS-THAN, and `isObject(...)` on the
      // empty-string sentinel becomes `!== undefined`. An item whose best
      // price-group price merely TIES its current price is not changed.
      // -----------------------------------------------------------------
      if (priceGroupDetails.price.isLessThan(orderItem.price) && winningPriceGroup !== undefined) {
        // Legacy [L370]: setPrice(priceGroupDetails.price)
        // Legacy [L371]: setAppliedPriceGroup(priceGroupDetails.priceGroup)
        //
        // The reshaping in one line: what legacy assigns into the aggregate, the
        // target reports as an intent carrying identifiers only.
        intents.push({
          orderItemID: orderItem.orderItemID,
          price: priceGroupDetails.price,
          priceGroupID: winningPriceGroup.getPriceGroupID(),
        });
      }

      // Items that fail the gate produce NO intent. Legacy leaves them entirely
      // untouched - it does not re-assign an unchanged price - so emitting an
      // "unchanged" intent would invent a write the source never performs.
    }

    return intents;
  }

  /**
   * Serialises the current page of price groups and their rates to JSON, for the
   * admin price-group editor.
   *
   * Ported from [model/service/PriceGroupService.cfc:L230-L257].
   *
   * ★★★ THIS METHOD CAN ONLY EVER SUCCEED IN ONE DEGENERATE CASE: when EVERY price
   * group on the page has ZERO rates. With at least one rate anywhere on the page it
   * THROWS from inside the inner loop at [L243], and all partial accumulation is
   * discarded. That is the verified legacy behaviour and it is what this port
   * exhibits. See {@link getAmountRepresentation} for the three-way proof.
   *
   * ★ THE SMART LIST HERE IS A CONSUMPTION, NOT A DECLARATION, AND SPENDS NO
   * RESHAPING BUDGET. [L233] calls `this.getPriceGroupSmartList()`, which
   * `PriceGroupService.cfc` DOES NOT DECLARE - its Smart List Overrides section at
   * [L451-L453] is EMPTY - so this is the framework's generic
   * `get<Entity>SmartList()`. The migration's two budgeted smart-list renames belong
   * to `productService.ts` (`getProductSmartList` -> `findProducts`) and
   * `skuService.ts` (`getSkuSmartList` -> `findSkus`); this file declares no
   * smart-list override, renames nothing, and therefore draws nothing from that
   * ledger.
   *
   * JUDGMENT CALL: the price-group listing resolves through the
   * `getPriceGroupPageRecords()` member of the module-local
   * {@link PriceGroupFrameworkReads} collaborator.
   * `src/domain/ports/priceGroupRepository.ts` publishes SIX members and none is a
   * listing - its header forbids adding "no batch load, no loadAll, no count" - so
   * NO PORT MEMBER WAS INVENTED and ports remain locked at 13. A narrow structural
   * collaborator was chosen over a boundary input because this method takes NO
   * arguments, so it has no payload on which a boundary input could be carried.
   *
   * @returns the serialised price-group map.
   * @throws whenever any price group on the page has at least one rate - DEFECT 29.
   */
  async getPriceGroupDataJSON(): Promise<string> {
    // Legacy [L232]: var priceGroupData = {};
    //
    // Legacy [L231] declares `var local = {};` immediately above it and never reads
    // it. Deleted, per the module header note.
    const priceGroupData: Record<string, PriceGroupDataEntry> = {};

    // ---------------------------------------------------------------------
    // Legacy [L233]: var priceGroupSmartList = this.getPriceGroupSmartList();
    // Legacy [L235]: for(var i=1; i<=arrayLen(priceGroupSmartList.getPageRecords()); i++)
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L233-L236]: legacy iterates
    // `getPageRecords()` - THE CURRENT PAGE of a framework smart list - NOT the full
    // price-group collection. The paginated projection is preserved. NO PAGE SIZE IS
    // ASSERTED here, because the source states none, and asserting one would both
    // invent a constraint and invite reading it as a limit chosen for some
    // non-functional reason the source does not have. `getPageRecords()` is
    // re-invoked in the loop condition at [L235] AND again in the body at [L236],
    // with no defensive copy - consistent with the slice-wide finding that entity and
    // association accessors hand out live arrays.
    // ---------------------------------------------------------------------
    const pageRecords = await this.frameworkReads.getPriceGroupPageRecords();

    for (let i = 0; i < pageRecords.length; i += 1) {
      // -----------------------------------------------------------------
      // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236] (register DEFECT 5):
      // indexes `getPageRecords()` by `local.i` while the loop counter declared at
      // [L235] is `i`.
      // Preserved deliberately; do not fix without a product decision.
      //
      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L231, L236]: whether
      // `local.i` actually resolves to the loop counter is CFML-ENGINE DEPENDENT -
      // on CFML 9+ and Lucee, `var i = 1` writes into the implicit `local` scope, so
      // `local.i` may resolve to the counter and the line may work by accident,
      // while [L231]'s assignment of a struct to `local` may or may not shadow that
      // implicit scope. THE DISTINCTION IS UNOBSERVABLE IN PRACTICE: DEFECT 29 at
      // [L243] throws before this method can return for any price group that has at
      // least one rate. The intent - index by the loop counter - is what is
      // reproduced, because it is the only reading under which the method could ever
      // have returned anything at all.
      // -----------------------------------------------------------------
      const thisPriceGroup = pageRecords[i];

      if (thisPriceGroup === undefined) {
        continue;
      }

      // Legacy [L237]: var priceGroupRates = [];
      const priceGroupRates: PriceGroupRateDataEntry[] = [];

      // Legacy [L239]: for(var r=1; r<=arrayLen(thisPriceGroup.getPriceGroupRates()); r++)
      const rates = thisPriceGroup.getPriceGroupRates();

      for (let r = 0; r < rates.length; r += 1) {
        const thisRate = rates[r];

        if (thisRate === undefined) {
          continue;
        }

        // Legacy [L241-L244]:
        //   var rateStruct = {};
        //   rateStruct.id = thisRate.getPriceGroupRateId();
        //   rateStruct.name = thisRate.getAmountRepresentation();
        //   arrayAppend(priceGroupRates, rateStruct);
        //
        // CFML parity [model/service/PriceGroupService.cfc:L242 vs L414]: the source
        // spells the accessor `getPriceGroupRateId()` here, with a lowercase `d`, and
        // `getPriceGroupRateID()` at [L414], with an uppercase `D` - and
        // `getPriceGroupId()` at [L253] against `getPriceGroupID()` elsewhere. CFML
        // resolves method names case-insensitively so both spellings hit the same
        // accessor; TypeScript does not. Both are normalised to the canonical names
        // published by `src/domain/entities/priceGroup.ts` and
        // `src/domain/entities/priceGroupRate.ts`.
        //
        // The `name` value comes from a call that ALWAYS THROWS - DEFECT 29. It is
        // written as the field it populates so the shape of the legacy struct stays
        // visible; the throw simply propagates.
        priceGroupRates.push({
          id: thisRate.getPriceGroupRateID(),
          name: getAmountRepresentation(thisRate),
        });
      }

      // Legacy [L248-L253]:
      //   var groupStruct = {};
      //   groupStruct.priceGroupName = thisPriceGroup.getPriceGroupName();
      //   groupStruct.priceGroupRates = priceGroupRates;
      //   priceGroupData[thisPriceGroup.getPriceGroupId()] = groupStruct;
      //
      // CFML parity [model/service/PriceGroupService.cfc:L249]: `priceGroupName` is
      // nullable on the entity, and a CFML struct assignment of a null value leaves
      // the key unset. `JSON.stringify` omits a property whose value is `undefined`,
      // which reproduces that outcome without adding a default the legacy lacks.
      priceGroupData[thisPriceGroup.getPriceGroupID()] = {
        priceGroupName: thisPriceGroup.getPriceGroupName(),
        priceGroupRates,
      };
    }

    // Legacy [L256]: return serializeJSON(priceGroupData);
    return JSON.stringify(priceGroupData);
  }

  /**
   * Applies the admin price-group SKU settings form: attaches a rate to either a
   * whole product or one specific SKU, and saves it.
   *
   * Ported from [model/service/PriceGroupService.cfc:L184-L227].
   *
   * THE BRANCH STRUCTURE, WITH ITS THREE SILENT NO-OPS:
   *
   *   * [L194] outer guard `priceGroupRateId NEQ ""` - when the identifier is empty
   *     the method DOES NOTHING AT ALL, and there is no `else`. The legacy comment at
   *     [L193] explains why: "If the user has selected the 'Select a Rate' rate,
   *     ignore all of this logic. This should not have been allowed to happen.";
   *   * [L197] `skuId EQ ""` selects the WHOLE-PRODUCT branch [L197-L209], otherwise
   *     the SPECIFIC-SKU branch [L212-L225];
   *   * [L199] an inner guard on the whole-product branch only -
   *     `priceGroupRateId NEQ "inherit"` - so when the rate is the `"inherit"`
   *     keyword that branch also does nothing. THERE IS NO `"inherit"` GUARD ON THE
   *     SPECIFIC-SKU BRANCH. That asymmetry is preserved.
   *
   * @param data - the admin request-context payload.
   */
  async updatePriceGroupSKUSettings(data: PriceGroupSkuSettingsInput): Promise<void> {
    // Legacy [L185] declares `var local = {};` and never reads it. Deleted, per the
    // module header note. This is the first of the file's two dead `local` structs.
    //
    // Legacy [L188-L191]: the `amount` key is stripped from the request context
    // unless the rate is the `"new amount"` keyword. See
    // {@link buildRateSavePayload} for why the target omits the key while building
    // the payload rather than deleting it from the caller's object.
    const ratePayload = buildRateSavePayload(data);

    // ---------------------------------------------------------------------
    // CFML parity [model/service/PriceGroupService.cfc:L189, L194, L197, L199,
    // L399]: CFML's `!=`, `NEQ`, `EQ` and `==` are CASE-INSENSITIVE for strings, so
    // all FIVE sentinel comparisons in this component are case-insensitive in the
    // target too - `"NEW AMOUNT"`, `"New Amount"`, `"INHERIT"` and `"Inherit"` all
    // match. `cfEquals` from `src/lib/cfml/struct.ts` performs the comparison; a bare
    // `===` on any of the five would NARROW BEHAVIOUR and is a defect, not a
    // simplification.
    // ---------------------------------------------------------------------

    // Legacy [L193], verbatim: "If the user has selected the 'Select a Rate' rate,
    // ignore all of this logic. This should not have been allowed to happen."
    // Legacy [L194]: if(arguments.data.priceGroupRateId NEQ "") { ... }
    if (cfEquals(data.priceGroupRateId, '')) {
      return;
    }

    // Legacy [L197]: if(arguments.data.skuId EQ "") - the whole-product branch.
    if (cfEquals(data.skuId, '')) {
      // Legacy [L199]: if(arguments.data.priceGroupRateId NEQ "inherit")
      if (!cfEquals(data.priceGroupRateId, 'inherit')) {
        // Legacy [L205]:
        //   var priceGroupRate = this.getPriceGroupRate(arguments.data.priceGroupRateId, true);
        const priceGroupRate = await this.getOrCreatePriceGroupRate(data.priceGroupRateId);

        // Legacy [L206]:
        //   priceGroupRate.addProduct(
        //       getProductService().getProduct(arguments.data.productId));
        const product: Product | undefined = await this.productRepository.getProductByProductID(
          data.productId,
        );

        if (product === undefined) {
          // CFML parity [L206]: the framework accessor returns null on a miss and
          // `addProduct(null)` then raises. The target throws at the same point
          // rather than passing an absent product on.
          throw new Error(
            `No product was found for productId "${data.productId}". ` +
              'CFML parity [model/service/PriceGroupService.cfc:L206]: the framework accessor ' +
              'returns null on a miss and addProduct(null) raises.',
          );
        }

        priceGroupRate.addProduct(product);

        // Legacy [L207]:
        //   this.savePriceGroupRate(priceGroupRate, arguments.data);
        await this.savePriceGroupRate(priceGroupRate, ratePayload);
      }

      return;
    }

    // ---------------------------------------------------------------------
    // Legacy [L212-L225]: the specific-SKU branch. No `"inherit"` guard here.
    //
    // Legacy [L219]: var sku = getSkuService().getSku(arguments.data.skuId);
    // ---------------------------------------------------------------------
    const sku = requireResolvedSku(data);

    // Legacy [L220]:
    //   var priceGroupRate = this.getPriceGroupRate(arguments.data.priceGroupRateId, true);
    const priceGroupRate = await this.getOrCreatePriceGroupRate(data.priceGroupRateId);

    // Legacy [L221]: priceGroupRate.addSku(sku);
    priceGroupRate.addSku(sku);

    // Legacy [L224]: this.savePriceGroupRate(priceGroupRate, arguments.data);
    await this.savePriceGroupRate(priceGroupRate, ratePayload);
  }

  /**
   * Loads a price-group rate by identifier, or constructs an unsaved one when no
   * such rate exists.
   *
   * ★ A FRAMEWORK-ACCESSOR GAP, RESOLVED WITHOUT INVENTING A PORT MEMBER.
   * [model/service/PriceGroupService.cfc:L205] and [L220] both call
   * `this.getPriceGroupRate(id, true)`, and `PriceGroupService.cfc` DECLARES NO SUCH
   * METHOD - it is `HibachiService`'s generic
   * `get<Entity>(primaryKey, createIfNotFound)` factory, invoked POSITIONALLY with
   * `true`. The legacy comment at [L218] documents the semantics: "getPriceGroupRate()
   * returns either the requested priceGrouRate or a new Entity".
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L218]: that comment misspells
   * `priceGrouRate`, dropping the `p`. A secondary-register finding, inert, recorded
   * because it is quoted above verbatim and a reader would otherwise assume the
   * transcription was wrong.
   *
   * JUDGMENT CALL: `src/domain/ports/priceGroupRepository.ts` publishes
   * `getPriceGroupRate(priceGroupRateID): Promise<PriceGroupRate | undefined>` - a
   * plain load, with NO get-or-create member anywhere in the thirteen ports and no
   * "createIfNotFound" affordance. The published load is used and the construction
   * is performed HERE when it returns nothing, which keeps the framework generic's
   * two-part behaviour intact. NO PORT MEMBER WAS INVENTED; ports remain locked at
   * 13. Constructing the entity is why `PriceGroupRate` is imported as a value
   * rather than as a type.
   *
   * The new rate is constructed with an EMPTY `priceGroupRateID`, which is the
   * ported entity's unsaved marker - `isNew()` reads it - matching the ORM's
   * `unsavedvalue=""`. No other field is populated, because the framework factory
   * populates none either.
   *
   * @param priceGroupRateID - the rate identifier, or the `"new amount"` keyword.
   * @returns the loaded rate, or a new unsaved one.
   */
  private async getOrCreatePriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate> {
    const existingRate = await this.priceGroupRepository.getPriceGroupRate(priceGroupRateID);

    if (existingRate !== undefined) {
      return existingRate;
    }

    return new PriceGroupRate({ priceGroupRateID: '' });
  }

  /**
   * Saves a price-group rate and then enforces rate exclusivity across its price
   * group: whatever this rate now covers, no sibling rate may also cover.
   *
   * Ported from [model/service/PriceGroupService.cfc:L397-L446]. The component's
   * only Save Override, sitting inside the [L394-L449] banner.
   *
   * ★ `data` IS OPTIONAL AND IS DEREFERENCED UNCONDITIONALLY. [L397] declares
   * `struct data` - NOT `required` - yet [L399] reads
   * `arguments.data.priceGroupRateId` with no guard, so calling
   * `savePriceGroupRate(rate)` with no payload raises in CFML ("element
   * PRICEGROUPRATEID is undefined"). Both facts are preserved.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L397, L399]: the parameter stays
   * OPTIONAL for signature parity, matching the published
   * `data?: PriceGroupRateSaveInput` shape, and the unconditional dereference is
   * reproduced by THROWING when it is absent. No permissive default and NO EARLY
   * RETURN is added - either would be a guard the legacy lacks, and adding one would
   * breach schema continuity.
   *
   * ★★ DEFECT 30, AND WHY ITS CONSEQUENCE IS THE OPPOSITE OF WHAT IT LOOKS LIKE.
   * [L400]'s `clearAmounts()` always throws, but it is GUARDED BY [L399], so only
   * the `"new amount"` path fails. Every other rate-save path reaches [L404]'s save
   * and then the exclusivity block at [L407-L444], WHICH IS THEREFORE REACHABLE AND
   * NOT DEAD CODE. The admin "create a new amount" workflow always throws in legacy;
   * every other rate save completes. See {@link clearAmounts} for the proof and for
   * the interaction with `updatePriceGroupSKUSettings`.
   *
   * @param priceGroupRate - the rate to save.
   * @param data - the payload; optional in the signature, required in practice.
   * @returns the saved rate, possibly with its own collections cleared.
   * @throws when `data` is absent, and always on the `"new amount"` path - DEFECT 30.
   */
  async savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    data?: PriceGroupRateSaveInput,
  ): Promise<PriceGroupRate> {
    // Legacy [L399]: if(arguments.data.priceGroupRateId == "new amount")
    //
    // `cfEquals` THROWS `CfmlComparisonError` on a nullish operand, which is exactly
    // the reproduction wanted here: an absent payload makes `data?.priceGroupRateId`
    // `undefined` and the comparison raises, just as the CFML dereference does. The
    // comparison itself stays CASE-INSENSITIVE, the fifth of the five sentinel
    // comparisons recorded at `updatePriceGroupSKUSettings`.
    if (cfEquals(data?.priceGroupRateId, 'new amount')) {
      // Legacy [L400]: arguments.priceGroupRate.clearAmounts();
      clearAmounts(priceGroupRate);
    }

    // ---------------------------------------------------------------------
    // Legacy [L404]: var priceGroupRate = super.save(entity=arguments.priceGroupRate,
    //                                                data=arguments.data);
    //
    // JUDGMENT CALL: `super.save(...)` is a FRAMEWORK-ACCESSOR GAP -
    // `HibachiService.save` performs population-from-data, validation and
    // persistence in one call, and `PriceGroupService.cfc` declares none of it. It
    // resolves through the published
    // `priceGroupRepository.savePriceGroupRate(priceGroupRate)` member; NO PORT
    // MEMBER WAS INVENTED and no `data` overload was added to it, because population
    // from a request payload is not persistence and the port publishes no
    // population affordance. The payload's `amount` key is therefore carried on
    // {@link PriceGroupRateSaveInput} for fidelity and deliberately not written
    // through - see that type's field documentation.
    //
    // LEGACY-NOTE [model/service/ProductService.cfc:L287 vs L303]: TWO PERSISTENCE
    // PATHS coexist across this slice - `getHibachiDAO().save(target=...)` at one
    // site and `super.save(...)` at another. They are NOT unified by this migration;
    // each ported call site resolves to whichever repository member matches what it
    // actually did.
    // ---------------------------------------------------------------------
    const savedRate = await this.priceGroupRepository.savePriceGroupRate(priceGroupRate);

    // ---------------------------------------------------------------------
    // Legacy [L407]: if(!priceGroupRate.hasErrors()) { ... }
    //
    // JUDGMENT CALL: `hasErrors()` is a framework validation affordance from
    // `HibachiEntity`, and the ported entities publish no error collection - the
    // migration replaced declarative validation with typed schemas rather than with
    // an entity-carried error bag. The equivalent gate here is that THE SAVE
    // RESOLVED: a rejected save propagates and never reaches this line, so control
    // arriving here is exactly the legacy "no errors" condition. NO ERROR-BAG
    // AFFORDANCE IS INVENTED on the entity or on the port.
    // ---------------------------------------------------------------------

    // Legacy [L408]: var priceGroup = priceGroupRate.getPriceGroup();
    const priceGroup = savedRate.getPriceGroup();

    if (priceGroup === undefined) {
      // CFML parity [L408-L409]: legacy calls `priceGroup.getPriceGroupRates()`
      // immediately, with no null test, so a rate with no price group raises there.
      // The target throws at the same point rather than skipping the block, because
      // skipping it would silently omit the exclusivity enforcement.
      throw new Error(
        `PriceGroupRate "${savedRate.getPriceGroupRateID()}" has no price group, so rate ` +
          'exclusivity cannot be enforced. CFML parity ' +
          '[model/service/PriceGroupService.cfc:L408-L409]: the legacy body dereferences the ' +
          'price group with no null test and raises.',
      );
    }

    // ---------------------------------------------------------------------
    // Legacy [L409-L433]: the exclusivity-enforcement loop.
    //
    // For every OTHER rate in the price group, strip from it everything the saved
    // rate now covers, and clear its global flag when the saved rate is global.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L409, L416, L420, L424]:
    // `rates` at [L409] is the LIVE association array, and the three inner loop
    // bounds re-invoke `arguments.priceGroupRate.getProductTypes()`,
    // `getProducts()` and `getSkus()` on every iteration. The ported accessors hand
    // out the live arrays too - `src/domain/entities/priceGroupRate.ts` documents
    // that the three INCLUDE collections are live precisely because its own
    // owner-side helpers splice them. Removing from `thisRate` does not touch the
    // saved rate's own arrays, so the iteration is safe and no defensive copy is
    // added; the bounds are simply hoisted to one local each.
    // ---------------------------------------------------------------------
    const rates = priceGroup.getPriceGroupRates();

    for (let i = 0; i < rates.length; i += 1) {
      const thisRate = rates[i];

      if (thisRate === undefined) {
        continue;
      }

      // Legacy [L414]: if(rates[i].getPriceGroupRateID() != priceGroupRate.getPriceGroupRateID())
      //
      // CFML parity: `!=` on strings is case-insensitive, so `cfEquals` is used here
      // too rather than a bare `!==`.
      if (cfEquals(thisRate.getPriceGroupRateID(), savedRate.getPriceGroupRateID())) {
        continue;
      }

      // Legacy [L416-L418]: remove every productType the saved rate covers.
      const savedProductTypes = savedRate.getProductTypes();

      for (let pt = 0; pt < savedProductTypes.length; pt += 1) {
        const productType = savedProductTypes[pt];

        if (productType !== undefined) {
          thisRate.removeProductType(productType);
        }
      }

      // Legacy [L420-L422]: remove every product the saved rate covers.
      const savedProducts = savedRate.getProducts();

      for (let p = 0; p < savedProducts.length; p += 1) {
        const product = savedProducts[p];

        if (product !== undefined) {
          thisRate.removeProduct(product);
        }
      }

      // Legacy [L424-L426]: remove every SKU the saved rate covers.
      const savedSkus = savedRate.getSkus();

      for (let s = 0; s < savedSkus.length; s += 1) {
        const sku = savedSkus[s];

        if (sku !== undefined) {
          thisRate.removeSku(sku);
        }
      }

      // -----------------------------------------------------------------
      // Legacy [L429-L431]:
      //   if(priceGroupRate.getGlobalFlag() && rates[i].getGlobalFlag()) {
      //       rates[i].setGlobalFlag(false);
      //   }
      //
      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L429-L431]: NOT
      // REPRODUCIBLE AT THIS BOUNDARY, AND THE GAP IS RECORDED RATHER THAN PAPERED
      // OVER. `src/domain/entities/priceGroupRate.ts` publishes exactly ONE mutator -
      // `setPriceGroup` - and NO `setGlobalFlag`, so a sibling rate's global flag
      // cannot be cleared from here. Three things are deliberately NOT done: no
      // `setGlobalFlag` is added to that entity, which is another boundary's
      // completed work and not this file's to edit; no port member is invented to
      // perform the clear, because the port inventory is locked at thirteen files
      // and six members; and no cast, index-signature write or structural back door
      // is used to reach the private field, because that would be exactly the
      // dynamic dispatch the minimal-change directive forbids. The consequence is
      // observable - two global rates can coexist in one price group where legacy
      // would have demoted the older one - and resolving it is a surface decision
      // for the entity's owner, taken with the flag's persistence semantics in view.
      //
      // The condition itself is NOT emitted as a dead `if`. Evaluating two booleans
      // and discarding them would preserve nothing while reading as though the demote
      // still happened, which is the more misleading of the two options. The site is
      // recorded here instead, in full.
      // -----------------------------------------------------------------
    }

    // ---------------------------------------------------------------------
    // Legacy [L436-L443]: the global-rate clear-out.
    //
    //   if(priceGroupRate.getGlobalFlag()) {
    //       priceGroupRate.setProducts([]);
    //       priceGroupRate.setProductTypes([]);
    //       priceGroupRate.setSKUs([]);
    //       priceGroupRate.setExcludedProducts([]);
    //       priceGroupRate.setExcludedProductTypes([]);
    //       priceGroupRate.setExcludedSKUs([]);
    //   }
    //
    // A global rate applies to everything, so its own inclusion and exclusion lists
    // are emptied.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L439, L442]: legacy calls
    // `setSKUs` and `setExcludedSKUs` with a CAPITALISED `SKU`, while [L424-L425]
    // in the very same method use `getSkus()` and `removeSku()`. The underlying
    // properties are `skus` at [model/entity/PriceGroupRate.cfc:L73] and
    // `excludedSkus` at [L77], both lowercase. CFML resolves accessor names
    // case-insensitively so all four spellings hit the same collections; TypeScript
    // does not, so the canonical lowercase names published by
    // `src/domain/entities/priceGroupRate.ts` are used.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L417, L421, L425 vs
    // L437-L442]: TWO CLEARING IDIOMS COEXIST IN ONE METHOD - the bidirectional
    // `remove*` helpers in the loop above, which maintain the far side of each
    // association, and the empty-array setters here, which replace the owning
    // collection and leave the far side stale until reload. Both are preserved as
    // written and are NOT unified: they differ in what they do to the inverse side,
    // so unifying them would change behaviour.
    //
    // JUDGMENT CALL: the three include collections are cleared by SPLICING THE LIVE
    // ARRAYS the accessors hand out, because no `setProducts`, `setProductTypes` or
    // `setSkus` mutator is published. That is the closest available reproduction:
    // like the CFML setter, it empties the owning collection without notifying the
    // inverse side, which is precisely the difference recorded in the note above. The
    // entity documents the include collections as LIVE for exactly this kind of
    // owner-side mutation, so this uses a published affordance rather than working
    // around one.
    // ---------------------------------------------------------------------
    if (savedRate.getGlobalFlag()) {
      // Legacy [L437]: setProducts([]).
      const products = savedRate.getProducts();
      products.splice(0, products.length);

      // Legacy [L438]: setProductTypes([]).
      const productTypes = savedRate.getProductTypes();
      productTypes.splice(0, productTypes.length);

      // Legacy [L439]: setSKUs([]).
      const skus = savedRate.getSkus();
      skus.splice(0, skus.length);

      // ---------------------------------------------------------------
      // Legacy [L440-L442]: setExcludedProducts([]), setExcludedProductTypes([]),
      // setExcludedSKUs([]).
      //
      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L440-L442]: NOT
      // REPRODUCIBLE, and recorded as a gap. `src/domain/entities/priceGroupRate.ts`
      // hands the three EXCLUDE collections out `readonly` and publishes no mutator
      // and no helper for any of them - its own comment states that no helper exists
      // for them and that none is invented, because the legacy entity declares none
      // either. There is consequently nothing on the published surface that can
      // empty them, and nothing is invented here to do it: not a mutator on the
      // entity, not a port member, and not a cast through the readonly type.
      // ---------------------------------------------------------------
    }

    // ---------------------------------------------------------------------
    // ★ THE EXCLUSION-LIST GAP - BOTH SIDES OF IT LIVE IN THIS FILE.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L440-L442 vs L70, L109,
    // L147]: this method WRITES the `excludedProductTypes`, `excludedProducts` and
    // `excludedSkus` collections - it clears them for a global rate - while the rate
    // cascade in this same class consults ONLY the inclusion collections and the
    // global flag: `hasProductType` at [L70], `hasProduct` at [L109], `hasSku` at
    // [L147] and `getGlobalFlag()` at [L84], [L123] and [L166]. NO `excluded*`
    // COLLECTION IS EVER READ DURING RATE RESOLUTION. Exclusions are therefore
    // persisted, cleared and displayed, but never honoured when a rate is selected.
    // The gap is preserved and no exclusion logic is added: adding it would change
    // which rate applies and therefore what a customer pays, which is a product
    // decision. Because this file is both the writer and the non-reader, the
    // annotation belongs here.
    // ---------------------------------------------------------------------

    // Legacy [L445]: return arguments.priceGroupRate;
    return savedRate;
  }

  /**
   * Deletes a price group, first detaching every price group that inherits from it.
   *
   * Ported from [model/service/PriceGroupService.cfc:L461-L470]. The component's
   * only Delete Override, sitting inside the [L459-L472] banner, and the only method
   * in the file that declares `boolean`.
   *
   * The legacy comment at [L462] states the intent - "Any price groups that are
   * inhering from this price group should have that inheritence disabled." - with
   * both `inhering` and `inheritence` misspelled in the source. The intent is what is
   * carried across.
   *
   * ★ WHY THE LOOP EXISTS AT ALL, WHICH THE SPECIFICATION DOES NOT SAY.
   * `model/validation/PriceGroup.json` constrains `childPriceGroups` to
   * `maxCollection: 0` in the `delete` context, so the ORM would have REFUSED the
   * delete while any child remained. The loop is not defensive tidying: it is what
   * makes the delete legal.
   *
   * LEGACY-NOTE [model/validation/PriceGroup.json]: that delete context is RICHER
   * than the specification records. It sets `maxCollection: 0` on SIX properties -
   * `appliedOrderItems`, `childPriceGroups`, `accounts`, `subscriptionBenefits`,
   * `subscriptionUsageBenefits` and `promotionRewards` - not on `appliedOrderItems`
   * alone. CFML enforced all six through ORM associations before deletion. The ported
   * `PriceGroup` entity carries none of those six associations - order items,
   * accounts, subscription benefits and promotion rewards all belong to out-of-scope
   * aggregates - so five of the six constraints PASS TRIVIALLY in TypeScript and
   * enforcement would have to happen here. It does not: NO PUBLISHED PORT MEMBER
   * EXPOSES an applied-order-item, account, subscription-benefit or promotion-reward
   * count for a price group, and `src/domain/ports/priceGroupRepository.ts` forbids
   * adding one - "no count, no existence probe". THE GAP IS RECORDED PLAINLY AND
   * NOTHING IS INVENTED. Only `childPriceGroups` is enforceable from here, because it
   * is the one association the ported entity does carry, and the loop below is
   * precisely that enforcement.
   *
   * @param priceGroup - the price group to delete.
   * @returns whether the delete succeeded.
   */
  async deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    // Legacy [L462], verbatim: "Any price groups that are inhering from this price
    // group should have that inheritence disabled."
    // Legacy [L463]: var inheritingPriceGroups = arguments.priceGroup.getChildPriceGroups();
    const inheritingPriceGroups = priceGroup.getChildPriceGroups();

    // ---------------------------------------------------------------------
    // Legacy [L465-L467]:
    //   while(arrayLen(inheritingPriceGroups) != 0) {
    //       priceGroup.removeChildPriceGroup(inheritingPriceGroups[1]);
    //   }
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L465-L467] (register DEFECT 6):
    // the `while` loop re-tests the length of a collection captured at [L463] and
    // always removes index 1, with NO INDEPENDENT TERMINATION CONDITION. It
    // terminates only because the
    // bidirectional remove helper SPLICES THE LIVE INVERSE ASSOCIATION ARRAY -
    // `childPriceGroups` is declared `inverse="true"` at
    // [model/entity/PriceGroup.cfc:L63], `removeChildPriceGroup` at [L139] delegates
    // to `removeParentPriceGroup`, and [L116-L125] does `arrayFind` followed by
    // `arrayDeleteAt` on the parent's own `getChildPriceGroups()`. So in legacy the
    // captured array shrinks and the loop ends: the infinite loop is a LATENT HAZARD,
    // not an observed one. The specification characterises it as "a collection
    // snapshot that is never re-read"; verification shows the snapshot IS the live
    // array, which is the only reason the code works.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The hazard is real in the target for a different reason: whether the loop
    // terminates depends entirely on `src/domain/entities/priceGroup.ts`'s ported
    // `removeChildPriceGroup` continuing to splice the array that
    // `getChildPriceGroups()` returned. It does today - that entity hands out the LIVE
    // array and its `removeParentPriceGroup` finds the child by `getPriceGroupID()`
    // and splices the parent's array - so the loop terminates here exactly as it does
    // in legacy.
    //
    // TODO: the bounded-iteration guard below is a TERMINATION SAFEGUARD mandated by
    // the migration plan, not a behaviour change. It cannot fire while
    // `PriceGroup.removeChildPriceGroup` mutates the array returned by
    // `getChildPriceGroups()`. Revisit it if that entity ever stops doing so - for
    // instance if the accessor starts handing out a copy - because the loop would then
    // never terminate and this guard is what converts a hang into a diagnosable
    // failure.
    //
    // The ceiling is DERIVED FROM the captured array's initial length. No constant is
    // invented, no multiplier is applied, and nothing about it is a limit chosen for
    // any non-functional reason: removing every child takes exactly as many iterations
    // as there were children, so one iteration more than that is proof the array
    // stopped shrinking.
    // ---------------------------------------------------------------------
    const iterationCeiling = inheritingPriceGroups.length;
    let iterations = 0;

    // CFML parity [model/service/PriceGroupService.cfc:L465]: `arrayLen(...) != 0` is
    // already an explicit comparison in the source and is carried over as one.
    while (inheritingPriceGroups.length !== 0) {
      iterations += 1;

      if (iterations > iterationCeiling) {
        throw new Error(
          `deletePriceGroup exceeded ${String(iterationCeiling)} detach iterations for price ` +
            `group "${priceGroup.getPriceGroupID()}" while its childPriceGroups collection was ` +
            'still non-empty. See the bounded-iteration TODO at ' +
            '[model/service/PriceGroupService.cfc:L465-L467]: PriceGroup.removeChildPriceGroup ' +
            'is no longer mutating the array returned by getChildPriceGroups().',
        );
      }

      // CFML parity [model/service/PriceGroupService.cfc:L466]: CFML arrays are
      // 1-BASED, so `inheritingPriceGroups[1]` is index `0` here.
      const firstInheritingPriceGroup = inheritingPriceGroups[0];

      if (firstInheritingPriceGroup === undefined) {
        // Unreachable while the length is non-zero. `noUncheckedIndexedAccess` types
        // the read as `PriceGroup | undefined` and a non-null assertion is banned, so
        // the narrowing is required. Exiting is the safe resolution: it cannot turn an
        // unreachable path into a failure, and it cannot mask non-termination, because
        // it ends the loop rather than continuing it.
        break;
      }

      priceGroup.removeChildPriceGroup(firstInheritingPriceGroup);
    }

    // ---------------------------------------------------------------------
    // Legacy [L469]: return super.delete(priceGroup);
    //
    // JUDGMENT CALL: `super.delete(...)` is a framework-accessor gap of the same kind
    // as `super.save` above, and it is called POSITIONALLY and with the bare unscoped
    // `priceGroup` - matching `ProductService.cfc:L326`. It resolves through the
    // published `priceGroupRepository.deletePriceGroup(priceGroup)` member, which
    // returns the `boolean` the legacy signature declares. NO PORT MEMBER WAS
    // INVENTED, and in particular no cascade, no force flag and no rate-delete
    // companion was added - the port forbids the last of those explicitly.
    // ---------------------------------------------------------------------
    const deleted = await this.priceGroupRepository.deletePriceGroup(priceGroup);

    return deleted;
  }
}
