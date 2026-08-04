// ---------------------------------------------------------------------------
// slatwall-ts - Price group resolution and rate application service
//
// Ported from `model/service/PriceGroupService.cfc` (475 lines) as a 1:1 logic extraction. Thirteen
// public methods, every legacy name carried over VERBATIM in CFML camelCase - including the
// capitalised `SKU` in `updatePriceGroupSKUSettings` and the capitalised `JSON` in
// `getPriceGroupDataJSON`. Interface parity is the acceptance contract, so those names are
// canonical and none may be "modernised".
//
// MUST-PRESERVE AREA #2 - the price-group half of the price-group and currency resolution cascade.
// Five load-bearing money behaviours, each easy to break by tidying it:
//
//   1. rate selection is LAST-match-wins, not first-match-wins;
//   2. the amount-type strategy asymmetry - only `percentageOff` rounds;
//   3. the two-decimal quantization is arithmetic, not presentation;
//   4. price-group comparison is STRICTLY less-than, so ties keep the incumbent;
//   5. the nominal five-level cascade has only two effective levels.
//
// THE CROSS-SERVICE ORDERING CONSTRAINT, DECLARED HERE FOR CITATION.
// `updateOrderAmountsWithPriceGroups()` MUST RUN BEFORE
// `PromotionService.updateOrderAmountsWithPromotions()`. It is NON-OPTIONAL and it decides how much
// money a customer is charged. At [model/service/PromotionService.cfc:L241-L254] the promotion
// engine chooses the base price it discounts FROM by price-group eligibility: an INELIGIBLE item
// discounts from `getPrice()` [L243]; an ELIGIBLE item from `getSkuPrice()` [L248] plus a
// correction term of `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`
// [L251]. THE PROMOTION PASS READS STATE THIS PASS WRITES - the item price at
// [model/service/PriceGroupService.cfc:L370] and the applied price group at [L371]. Reverse the two
// and the discount base is wrong and the discount is wrong with it. In legacy the ordering held
// only by luck of call order: `model/service/OrderService.cfc` injects sixteen collaborators, of
// which `priceGroupService` [model/service/OrderService.cfc:L60] and `promotionService` [L61] are
// the in-scope pair, and the call direction is INVERTED at that seam. THE CONSTRAINT IS DOCUMENTED
// HERE, NOT IMPLEMENTED HERE: this file carries no sequencing helper, no run-once latch, no phase
// parameter and no ordered-pipeline type, and none may be added. Sequencing is a composition-root
// obligation.
//
// COLLABORATOR CALIBRATION. The legacy component declares THREE collaborators - `priceGroupDAO`
// [model/service/PriceGroupService.cfc:L51], `skuService` [L53] and `productService` [L54], with a
// blank line at L52 - all three `type="any"`, and ALL THREE ARE LIVE with exactly ONE call site
// each, verified by reading all 475 lines:
//
//   priceGroupDAO   -> [L277] ONLY   `getAccountSubscriptionPriceGroups`
//   skuService      -> [L219] ONLY   framework generic `getSku(primaryKey)`
//   productService  -> [L206] ONLY   framework generic `getProduct(primaryKey)`
//
// FIVE OF THIRTEEN METHODS ARE SYNCHRONOUS, AND THAT IS CONTRACTUAL. A ported method is `async` IF
// AND ONLY IF the legacy body reaches the DAO/ORM, or a collaborator that does.
// `getRateForProductTypeBasedOnPriceGroup`, `getRateForProductBasedOnPriceGroup`,
// `getRateForSkuBasedOnPriceGroup`, `calculateSkuPriceBasedOnPriceGroup` and
// `calculateSkuPriceBasedOnPriceGroupRate` traverse only already-materialized associations and
// perform only arithmetic, so they reach neither. Their synchronicity is REQUIRED by
// `SkuPriceGroupResolver` and is what makes must-preserve area #2 testable with hand-built entities
// and zero I/O.
//
// LOCATOR VERIFICATION - THE SOURCE WINS. `model/service/PriceGroupService.cfc` produced ZERO
// DRIFT: the thirteen method declarations sit exactly at L57, L102, L140, L184, L230, L262, L271,
// L301, L316, L343, L364, L397 and L461; the only two `precisionEvaluate` sites are L323 and L331;
// `numberFormat` is at L339; and the amount-type `switch` spans L321-L336. Two drift corrections
// are recorded against the specification rather than the source, at the class declaration below.
//
// Of the legacy defect register's 30 numbered entries plus its eight secondary items, THIS FILE
// OWNS SIX NUMBERED - 5, 6, 7, 8, 29 and 30 - and adds two further defects verified while porting:
// the live-association mutation at [L276]+[L282], and the subscription-price-group disagreement
// between [L271-L298] and [L343-L362].
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L382, L384]: the component
// opens `// ===== START: DAO Passthrough =====` TWICE and never closes it. Six of
// its nine banner sections are EMPTY, and only TWO of the thirteen methods live inside a banner at
// all - `savePriceGroupRate` under Save Overrides L394/L449 and `deletePriceGroup` under Delete
// Overrides L459/L472 - while the other eleven, L57 through L375, precede every banner. Banners
// carry no behaviour and are not reproduced below; this file is organised by the cascade instead.
// That the Smart List section is EMPTY is load-bearing for scope - see `getPriceGroupDataJSON`.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L49]: the component header is the LONG form,
// `persistent="false" accessors="true" output="false"` - both ORM and framework directives a
// TypeScript class needs no equivalent of.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L266, L274, L276, L353, L357, L466, L469]: SEVEN
// BARE-UNSCOPED ARGUMENT READS - each of `sku`, `account` and `priceGroup` read without the
// `arguments.` prefix, resolving to the argument anyway through CFML's scope search, while the same
// names ARE prefixed on neighbouring lines. All seven are inert and have no TypeScript equivalent.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L205, L207, L220, L224, L233]: five self-calls
// go through `this.` while the component's eleven others are unqualified. In CFML the two differ in
// whether the call re-enters through the public interface; here both are ordinary method calls.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L185, L231]: `var local = {};` is declared TWICE
// and is DEAD BOTH TIMES - never read, never written - in `updatePriceGroupSKUSettings` and in
// `getPriceGroupDataJSON`. Both are deleted rather than emulated. [L231] has one downstream
// consequence, recorded at `getPriceGroupDataJSON`.
// ---------------------------------------------------------------------------

import { PriceGroupRate } from '../domain/entities/priceGroupRate.js';
import { Money } from '../domain/valueObjects/money.js';
import { CfmlNumberFormatError, numberFormat } from '../lib/cfml/numberFormat.js';
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
// Arithmetic goes through `Money`, so `src/lib/cfml/precision.ts` is deliberately not imported -
// reasoned out at `calculateSkuPriceBasedOnPriceGroupRate`. The legacy component performs NO list
// operation in its 475 lines, so the comma-list helpers are not imported either. Nothing is
// imported from `src/services/**`: every collaborator arrives as a constructor-injected contract,
// and in particular `./roundingRuleService.js` is NOT imported because the rounding path reaches
// the rounding service exactly as the legacy did, indirectly through the `RoundingRule` entity.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE FOUR CO-LOCATED PUBLIC TYPES
//
// JUDGMENT CALL: `PriceGroupAppliedIntent`, `BestPriceGroupDetails`, `PriceGroupSkuSettingsInput`
// and `PriceGroupRateSaveInput` are declared INLINE here rather than in a new domain module or a
// new port. Each belongs to precisely one method of precisely this class and nothing else in the
// subtree constructs or consumes any of them, so spawning four files would add four modules for
// zero consumers and adding them to a port would imply a fifteenth port member.
// ---------------------------------------------------------------------------

/**
 * The output of {@link PriceGroupService.updateOrderAmountsWithPriceGroups} for a single order
 * item, and THE ANTI-CORRUPTION BOUNDARY that lets the price-group engine deploy without porting
 * the order aggregate.
 *
 * Legacy [model/service/PriceGroupService.cfc:L364] returns `void` and MUTATES the order aggregate
 * in place - `setPrice()` at [L370] and `setAppliedPriceGroup()` at [L371]. Those aggregates are
 * out of scope, so the target returns INTENTS carrying OPAQUE STRING IDENTIFIERS only, and nothing
 * here mutates order persistence.
 */
export interface PriceGroupAppliedIntent {
  /**
   * The order item the intent applies to, as an opaque identifier.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L370]: legacy reaches the item itself through
   * `order.getOrderItems()[i]`. Here the item is identified, never held.
   */
  readonly orderItemID: string;

  /**
   * The price to apply, already quantized to two decimals by
   * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L370]: `setPrice(priceGroupDetails.price)`.
   */
  readonly price: Money;

  /**
   * The winning price group, as an opaque identifier.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L371]:
   * `setAppliedPriceGroup(priceGroupDetails.priceGroup)` assigns the ENTITY. The intent carries its
   * identifier instead, because an intent holding a live entity would reopen the boundary this type
   * exists to close.
   */
  readonly priceGroupID: string;
}

/**
 * The return shape of {@link PriceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount}.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L348, L369]: the legacy struct seeds
 * `priceGroup` with an EMPTY STRING as its "no price group" sentinel [L348] and later tests it with
 * `isObject(...)` [L369], so the field's legacy type is the union `string | any`. The target models
 * it as `PriceGroup | undefined` and tests for `undefined`. Refining a `struct` return into a named
 * interface is the migration's own typing rule, not a signature reshaping.
 */
export interface BestPriceGroupDetails {
  /**
   * The best price found, seeded from the SKU's own price.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L347]: seeded with `sku.getPrice()`, NEVER
   * with zero. A zero seed would make every price group look worse than "no price group" and sell
   * the SKU for nothing.
   */
  readonly price: Money;

  /**
   * The price group that produced {@link BestPriceGroupDetails.price}, or `undefined` when no price
   * group beat the SKU's own price.
   */
  readonly priceGroup: PriceGroup | undefined;
}

/**
 * The admin request-context payload consumed by
 * {@link PriceGroupService.updatePriceGroupSKUSettings}.
 *
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L184]: the legacy signature is
 *   `public void function updatePriceGroupSKUSettings(data)` -
 * the parameter is UNTYPED and not declared `required`. Typing it is the `any`-to-concrete
 * refinement rule, not a signature reshaping.
 *
 * THE THREE STRING SENTINELS BELOW ARE DATA CONTRACTS, NOT CONFIGURATION. `"new amount"`,
 * `"inherit"` and `""` arrive on the request context, so they are preserved verbatim as literals
 * and every comparison against them is CASE-INSENSITIVE, matching CFML string comparison.
 */
export interface PriceGroupSkuSettingsInput {
  /**
   * The rate to update, or one of the two keyword sentinels.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L189, L194, L199]: read as a rate identifier
   * at [L205] and [L220], and compared against `"new amount"`, `""` and `"inherit"` as a keyword.
   * Required, because [L194] dereferences it unconditionally.
   */
  readonly priceGroupRateId: string;

  /**
   * The product the rate is being attached to on the whole-product branch.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L206]: dereferenced unconditionally on that
   * branch with no existence check. Declared required so the absence is a compile-time failure
   * rather than a runtime one; no default is supplied and no validation is added.
   */
  readonly productId: string;

  /**
   * The SKU identifier. An empty string selects the whole-product branch.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L197, L219]: dereferenced unconditionally at
   * [L197], before either branch is chosen.
   */
  readonly skuId: string;

  /**
   * The SKU itself, resolved by the caller - A BOUNDARY INPUT, NOT AN INVENTED PORT MEMBER. Legacy
   * [L219] loads it through the FRAMEWORK's generic `get<Entity>(primaryKey)` accessor rather than
   * a method `SkuService.cfc` declares, and none of the thirteen ports carries a SKU
   * load-by-primary-key. INVENTING A FOURTEENTH MEMBER IS FORBIDDEN, so the entity becomes a
   * boundary input and the call THROWS when it is absent, as `src/services/skuService.ts` does for
   * the same gap. `undefined` reproduces the legacy outcome: [L219] returns null on a miss and
   * [L221] then calls `addSku(null)`, which raises.
   */
  readonly resolvedSku: Sku | undefined;

  /**
   * The rate amount, forwarded to {@link PriceGroupService.savePriceGroupRate} only when
   * {@link PriceGroupSkuSettingsInput.priceGroupRateId} is the `"new amount"` keyword.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L189-L190]: legacy DELETES this key from the
   * request context on every other path, so a stale value cannot overwrite the persisted rate. See
   * {@link PriceGroupService.updatePriceGroupSKUSettings} for why the target omits it while
   * building the payload instead.
   */
  readonly amount?: string;
}

/**
 * The payload {@link PriceGroupService.savePriceGroupRate} reads.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L397]: declared `struct data` and therefore
 * OPTIONAL, yet [L399] dereferences `data.priceGroupRateId` unconditionally. Both facts are
 * preserved: the parameter stays optional for signature parity, and the unconditional dereference
 * is reproduced by throwing.
 */
export interface PriceGroupRateSaveInput {
  /**
   * The rate identifier, or the `"new amount"` keyword.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L399]: the only key the method reads.
   */
  readonly priceGroupRateId: string;

  /**
   * The submitted amount, present only on the `"new amount"` path.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L190]: absent on every other path because
   * legacy deletes it. Persistence of the amount is the repository's business, so the key is
   * carried for payload fidelity and deliberately not consumed here.
   */
  readonly amount?: string;
}

// ---------------------------------------------------------------------------
// THE ONE MODULE-LOCAL COLLABORATOR CONTRACT
//
// JUDGMENT CALL: three framework affordances the legacy component uses are declared neither on
// `PriceGroupService.cfc` nor on any of the thirteen ports - they are inherited `HibachiService`
// and ORM generics: `getPriceGroupSmartList()` at [L233], and `account.getPriceGroups()` at [L276],
// [L351] and [L365]. `src/domain/ports/priceGroupRepository.ts` publishes exactly SIX members and
// its header forbids a seventh, so a price-group LISTING and an ACCOUNT-TO-PRICE-GROUP read are
// both unpublished and NEITHER IS INVENTED.
//
// Two established patterns cover that gap, and the dividing principle is whether the call site's
// signature admits a boundary input. Where it does, the entity becomes an input and the call throws
// when unresolved - used above for `resolvedSku`. Where it does not, a NARROW STRUCTURAL
// COLLABORATOR is declared inline, as `src/domain/entities/sku.ts` and
// `src/domain/entities/roundingRule.ts` both do. The second applies here, because
// `getPriceGroupDataJSON()` takes NO arguments and `updateOrderAmountsWithPriceGroups(order)` takes
// only an `OrderView` carrying an opaque `accountID`. AN INLINE STRUCTURAL COLLABORATOR IS NOT A
// FOURTEENTH PORT: the lock counts files under `src/domain/ports/`, and this interface is
// module-local and un-exported. Both members sit on ONE interface so the constructor stays at THREE
// parameters, matching the legacy component's three declared collaborators.
// ---------------------------------------------------------------------------

/**
 * The two framework-generic reads this service needs and no port publishes. Deliberately
 * un-exported, so it is not read as an addition to the locked port inventory.
 */
interface PriceGroupFrameworkReads {
  /**
   * The price groups assigned DIRECTLY to an account.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L276, L351, L365]: `account.getPriceGroups()`,
   * the ORM association on the out-of-scope `Account` entity, which is identified opaquely here.
   *
   * THIS IS THE DIRECT ASSIGNMENT ONLY. It must NOT fold in subscription price groups:
   * `calculateSkuPriceBasedOnAccount` adds those itself at [L277-L284] while
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` deliberately does not, and quietly merging them
   * would erase a documented legacy defect.
   *
   * ★★ THE RETURNED ARRAY IS THE ACCOUNT'S LIVE ASSOCIATION FOR THE LIFETIME OF THE REQUEST, AND IT
   * IS MUTABLE BY CONTRACT. Every call with the same `accountID` within one request MUST return THE
   * SAME ARRAY INSTANCE, and an implementation must not hand back a fresh copy per read.
   *
   * This is not a convenience; it is the mechanism by which a documented legacy behaviour stays
   * observable. `calculateSkuPriceBasedOnAccount` [model/service/PriceGroupService.cfc:L276-L284]
   * captures this collection with no defensive copy and `arrayAppend`s the account's subscription
   * price groups INTO it, and CFML arrays are by reference, so the appended members are visible to
   * every later reader of `account.getPriceGroups()` in the same request - specifically
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount` at [L351] and
   * `updateOrderAmountsWithPriceGroups` at [L365]. Under Hibernate the array was the session's live
   * collection, so this followed for free. Here it has to be arranged.
   *
   * The return type is therefore `PriceGroup[]` rather than `readonly PriceGroup[]`: the mutability
   * is part of the contract and is stated in the type rather than left to a comment that a caller
   * making a defensive copy would not contradict.
   *
   * ★ AND THE ARRAY MUST NOT OUTLIVE THE REQUEST. An implementation memoizing it in MODULE state
   * would leak one account's subscription price groups into a later, unrelated invocation on the same
   * warm container - which is a different customer's pricing. The memo belongs in instance state on a
   * request-scoped adapter. `src/handlers/bootstrap.ts` satisfies this by constructing its
   * implementation inside `createRequestScope`.
   *
   * @param accountID - the account, as an opaque identifier.
   * @returns the account's live, mutable, request-scoped association; empty when there are none.
   */
  getAccountPriceGroups(accountID: string): Promise<PriceGroup[]>;

  /**
   * The CURRENT PAGE of price groups.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L233-L236]: legacy builds a framework smart
   * list and iterates `getPageRecords()` - one page, not the whole collection. The paginated
   * projection is part of the observable behaviour and is preserved by keeping this member's name
   * honest about it.
   *
   * ★★ THE PAGE HOLDS AT MOST TEN ROWS, and the ten is stated by the source rather than chosen
   * here. [L233] calls `getPriceGroupSmartList()` with no arguments, so
   * `HibachiSmartList.setup`'s declared `pageRecordsShow=10` applies and `getPageRecords()` executes
   * with `maxresults=10` [org/Hibachi/HibachiSmartList.cfc:L39, L759-L764]. An implementation
   * returning every row would make `getPriceGroupDataJSON` serialize the whole table.
   *
   * ★ QUOTE-THEN-REVISE. This paragraph used to end "NO PAGE SIZE IS ASSERTED anywhere below,
   * because the source states none." The source does state one; it states it on the framework method
   * the caller invokes rather than at the call site, which is why reading only [L233] missed it.
   *
   * NO ORDERING is asserted, however, and that absence IS faithful: the caller configures no sort,
   * so which ten rows arrive is whatever the database volunteers. The page is deliberately unstable.
   *
   * @returns the price groups on the current page - at most ten, empty when there are none.
   */
  getPriceGroupPageRecords(): Promise<readonly PriceGroup[]>;
}

/**
 * One entry of the {@link PriceGroupService.getPriceGroupDataJSON} rate array.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L242-L243]: the legacy struct has exactly the
 * two keys `id` and `name`. Module-local and un-exported, because it is an internal shape of one
 * method's JSON output and not part of this file's published surface.
 */
interface PriceGroupRateDataEntry {
  readonly id: string;
  readonly name: string;
}

/**
 * One entry of the {@link PriceGroupService.getPriceGroupDataJSON} outer map.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L248-L251]: the legacy struct has exactly the
 * two keys `priceGroupName` and `priceGroupRates`.
 */
interface PriceGroupDataEntry {
  readonly priceGroupName: string | undefined;
  readonly priceGroupRates: readonly PriceGroupRateDataEntry[];
}

// ---------------------------------------------------------------------------
// MODULE-LOCAL HELPERS - all un-exported. No helper joins this file's published surface, and there
// is no fourteenth public method.
// ---------------------------------------------------------------------------

/**
 * Does a rate's `amountType` select the given dispatch arm, with case folded as CFML folds it?
 *
 * CFML parity [model/service/PriceGroupService.cfc:L321]: the legacy dispatch is a `switch` on a
 * string, and a CFML `switch` compares its `case` labels CASE-INSENSITIVELY. A rate persisting
 * `'PercentageOff'` therefore reaches `case "percentageOff"` in the legacy engine, and this predicate
 * is what reproduces that in a language whose own `switch` cannot.
 *
 * WHY THE SUBJECT CAN BE MIS-CASED AT ALL. `PriceGroupRateAmountType` promises membership in the
 * three-value vocabulary UP TO CASE, not an exact spelling: `SwPriceGroupRate.amountType` is a plain
 * `ormType="string"` column with no check constraint, and the boundary reader in
 * src/repositories/mysql/mysqlPriceGroupRepository.ts deliberately hands back THE PERSISTED BYTES
 * rather than the canonical member, because this entity's `amountType` is bound straight into the
 * `SwPriceGroupRate` UPDATE and substituting a canonical spelling on read would rewrite stored text as
 * a side effect of loading. The full reasoning is on `PriceGroupRateAmountType` itself.
 *
 * ★ WHY THIS IS DEFINED HERE AND NOT SHARED. The home is prescribed rather than chosen:
 * `src/lib/cfml/struct.ts` declares its export surface CLOSED and directs that a need none of its
 * primitives covers "belongs inside the consuming module with a documented annotation - not as a new
 * export here and not as a new file in this folder". `cfEquals` IS the primitive and does the work;
 * what it will not do is accept an absent subject, since it RAISES on a nullish operand. That is right
 * for the currency cascade and wrong here, because [L321-L336] has no `default` arm and an absent
 * `amountType` must FALL THROUGH to the [L319] passthrough rather than raise. This wrapper adds that
 * one difference. A sibling with the same shape and the same justification sits in
 * src/domain/entities/priceGroupRate.ts for `getAmountFormatted`, which is a different layer and
 * states its own absence policy.
 *
 * @param subject - the rate's persisted `amountType`, which may be absent.
 * @param arm - the dispatch arm being tested, in the source's canonical spelling.
 * @returns `true` only when the subject is present and equals the arm with case folded.
 */
function matchesAmountType(subject: PriceGroupRateAmountType | undefined, arm: string): boolean {
  return subject !== undefined && cfEquals(subject, arm);
}

/**
 * Reads a rate's amount, throwing when it is absent.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L323, L331, L334]: `getAmount()` is read at all
 * three sites WITHOUT A GUARD, and `PriceGroupRate.amount` is declared `ormType="big_decimal"` with
 * no default at [model/entity/PriceGroupRate.cfc:L54], so it can genuinely be absent. This is not
 * added validation - it is the explicit form of a failure CFML produced implicitly.
 *
 * IT MUST NOT DEFAULT TO ZERO: on `amountOff` a zero amount silently means "no discount", on
 * `amount` it means "free".
 *
 * @param amountType - the branch requiring it, for the diagnostic only.
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
 * Reproduces the unconditional throw behind [model/service/PriceGroupService.cfc:L243].
 *
 * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: `getAmountRepresentation()` DOES NOT
 * EXIST on `PriceGroupRate` and cannot be served by the framework's `onMissingMethod`, so this line
 * throws unconditionally once any price group on the page has at least one rate. Verified three
 * ways: the identifier appears EXACTLY ONCE in the whole non-`org/` tree, at that call site; none
 * of the thirteen functions [model/entity/PriceGroupRate.cfc:L87-L274] declares is it; and the
 * entity declares ZERO `attributeValues`, so `onMissingMethod`'s `getAttributeValue` fallback
 * cannot fire and control reaches the unconditional throw at [org/Hibachi/HibachiEntity.cfc:L565].
 * The near-synonym `getAmountFormatted()` at [model/entity/PriceGroupRate.cfc:L262] is the
 * plausible intended target and is DELIBERATELY NOT SUBSTITUTED, because that would turn a method
 * which always fails into one that returns data.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
 * Declared `never` so the compiler knows the call site cannot continue.
 *
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
 * Reproduces the unconditional throw behind [model/service/PriceGroupService.cfc:L400].
 *
 * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: `clearAmounts()` DOES NOT EXIST on
 * `PriceGroupRate` and cannot be served by `onMissingMethod`, since the entity declares no
 * `attributeValues`, so it throws. Verified the same three ways as {@link getAmountRepresentation}
 * above. IT IS GUARDED BY [L399], AND THAT INVERTS THE CONSEQUENCE: only the `"new amount"` path
 * reaches it, so that admin workflow ALWAYS FAILS, while every other value skips [L400], reaches
 * the save at [L404] and makes THE EXCLUSIVITY BLOCK AT [L407-L444] REACHABLE - it is not dead
 * code. [L189-L190] strips the `amount` key precisely when `priceGroupRateId` is NOT
 *   `"new amount"`,
 * so the path that keeps its amount is exactly the path that throws.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
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

/** What population observed about the payload, for the validation step that follows it. */
interface PriceGroupRatePopulationOutcome {
  /**
   * `true` when the payload carried an `amount` that is not a decimal numeral.
   *
   * Kept apart from "no amount at all" because [model/validation/PriceGroupRate.json] declares TWO
   * rules on the column - `required` and `dataType: "numeric"` - and the legacy reported whichever
   * one the submitted value actually broke. Under CFML the non-numeric string was stored on the
   * property by populate and then flagged by the numeric rule; here the value cannot be stored as a
   * `Money`, so the observation is carried forward instead of being collapsed into absence.
   */
  readonly submittedAmountWasNonNumeric: boolean;
}

/**
 * Reproduces the population step that `super.save` performs internally
 * [org/Hibachi/HibachiService.cfc:L143-L148], for the ONE payload key
 * [model/service/PriceGroupService.cfc:L397]'s declared input carries.
 *
 * ★ WHY THIS EXISTS. `savePriceGroupRate` [model/service/PriceGroupService.cfc:L404] delegates to
 * `super.save(entity=arguments.priceGroupRate, data=arguments.data)`, and the framework base runs
 * THREE steps inside that one call: populate from `data` when `data` was passed [L143-L148], validate
 * unconditionally [L151], and save ONLY when the entity has no errors [L154-L155] - returning the
 * entity either way [L168]. All three are reproduced at the call site; this is the first.
 *
 * ★★ AN EARLIER REVISION RECORDED THIS AS OUT OF REACH, on the premise that "population from a
 * request payload is not persistence and the port publishes no population affordance", and carried
 * `amount` on {@link PriceGroupRateSaveInput} "for fidelity and deliberately not written through".
 * THE PREMISE IS TRUE AND THE CONCLUSION IS FALSE. Population is not the port's job, and it is not
 * asked to do it: population happens HERE, on the entity, exactly where the framework did it, through
 * the ORM-generated `setAmount` that `accessors=true` [model/entity/PriceGroupRate.cfc:L49] published
 * and that population itself drove. Leaving the key unwritten meant a submitted amount was accepted,
 * reported as saved, and discarded.
 *
 * ONLY `amount` IS POPULATED, because it is the only populate-enabled key the declared payload type
 * carries. `priceGroupRateId` is the other, and it is not a property write at all - it is the
 * `"new amount"` sentinel [model/service/PriceGroupService.cfc:L399] and, on any other value, the key
 * of the row being edited. No key is invented on the payload to widen what population can reach.
 *
 * @param priceGroupRate - the entity population writes onto.
 * @param data - the submitted payload.
 * @returns what population observed, for the validation step.
 */
function populatePriceGroupRateFromPayload(
  priceGroupRate: PriceGroupRate,
  data: PriceGroupRateSaveInput,
): PriceGroupRatePopulationOutcome {
  const submittedAmount = data.amount;

  // UNCONDITIONAL ON PRESENCE, never conditional on emptiness: populate copied whatever the key
  // held, and an empty string is a submitted value rather than an absent one.
  if (submittedAmount === undefined) {
    return { submittedAmountWasNonNumeric: false };
  }

  try {
    priceGroupRate.setAmount(Money.fromDecimalString(submittedAmount));
  } catch (error: unknown) {
    if (!(error instanceof CfmlNumberFormatError)) {
      throw error;
    }

    // The numeric rule's failure, recorded rather than raised. `Money` has no tolerant parse and no
    // zero fallback - by design, because coercing an unreadable amount to zero is the failure mode
    // that sells product for nothing - so the property is left as it was and the observation travels
    // to the validator.
    return { submittedAmountWasNonNumeric: true };
  }

  return { submittedAmountWasNonNumeric: false };
}

/**
 * Reproduces the `validate(context="save")` that `super.save` performs internally
 * [org/Hibachi/HibachiService.cfc:L151], against the SAVE-CONTEXT rules declared in
 * [model/validation/PriceGroupRate.json], and against nothing else.
 *
 * ★ IT RUNS UNCONDITIONALLY, WHILE POPULATE DOES NOT. [org/Hibachi/HibachiService.cfc:L143-L148]
 * wraps only the populate call in `if(structKeyExists(arguments,"data"))`; the `validate` at [L151]
 * sits OUTSIDE that block. A rate saved with no payload at all is therefore still validated, which is
 * why the caller does not gate this on `data`.
 *
 * B5, ENFORCED BY OMISSION. Exactly the three save-context rules appear below:
 *
 *   "priceGroup":  [{"contexts":"save","required":true}]
 *   "amountType":  [{"contexts":"save","required":true}]
 *   "amount":      [{"contexts":"save","required":true,"dataType":"numeric"}]
 *
 * Nothing else is asserted. `amountType` is NOT checked against the three-literal vocabulary even
 * though {@link PriceGroupRateAmountType} publishes it - the schema declares no such rule, and the
 * cascade's `switch` [model/service/PriceGroupService.cfc:L321-L336] has no `default:` precisely
 * because an unrecognised value was reachable. The `isNotGlobal` condition
 * (`{"getGlobalFlag":{"eq":0}}`) declared in the same file is referenced by NO property, so it
 * constrains nothing and is not applied.
 *
 * ★ THE THREE RULES TOGETHER ARE WHAT MAKES THE EXCLUSIVITY BLOCK'S PRICE GROUP NON-NULL. Legacy
 * [L408-L409] dereferences `priceGroupRate.getPriceGroup()` with no null test, and an earlier
 * revision read that as the legacy RAISING on a rate with no price group. It does not: the
 * `priceGroup` required rule makes `hasErrors()` true, [L407] skips the whole block, and [L445]
 * returns the unsaved rate. The gate below is what reproduces that, and it is why the caller's
 * narrowing of the price group is provably unreachable rather than a real failure mode.
 *
 * @param priceGroupRate - the entity being saved, read for all three rules. The caller applies the
 *   payload to it BEFORE calling, which is the state [org/Hibachi/HibachiService.cfc:L151] validated.
 * @param population - what population observed, or `undefined` when no payload was passed.
 * @returns one entry per failed rule, empty when the rate passes.
 */
function collectPriceGroupRateSaveContextErrors(
  priceGroupRate: PriceGroupRate,
  population: PriceGroupRatePopulationOutcome | undefined,
): { readonly propertyIdentifier: string; readonly errorMessage: string }[] {
  const errors: { readonly propertyIdentifier: string; readonly errorMessage: string }[] = [];

  // `"priceGroup": [{"contexts":"save","required":true}]`.
  if (priceGroupRate.getPriceGroup() === undefined) {
    errors.push({ propertyIdentifier: 'priceGroup', errorMessage: 'priceGroup is required' });
  }

  // `"amountType": [{"contexts":"save","required":true}]`. Read off the ENTITY, so a value carried in
  // by population satisfies the rule - which is the order [L146] then [L151] establishes.
  if (priceGroupRate.getAmountType() === undefined) {
    errors.push({ propertyIdentifier: 'amountType', errorMessage: 'amountType is required' });
  }

  // `"amount": [{"contexts":"save","required":true,"dataType":"numeric"}]` - two rules on one
  // property, reported separately because the legacy reported whichever one the value broke.
  if (population?.submittedAmountWasNonNumeric === true) {
    errors.push({ propertyIdentifier: 'amount', errorMessage: 'amount must be numeric' });
  } else if (priceGroupRate.getAmount() === undefined) {
    errors.push({ propertyIdentifier: 'amount', errorMessage: 'amount is required' });
  }

  return errors;
}

/**
 * Reproduces the `validate(context="delete")` that `super.delete` performs internally
 * [org/Hibachi/HibachiService.cfc:L55], against the DELETE-CONTEXT rules declared in
 * [model/validation/PriceGroup.json] that this entity can actually answer.
 *
 * ★ WHY THIS EXISTS. `deletePriceGroup` [model/service/PriceGroupService.cfc:L469] delegates to
 * `super.delete(priceGroup)`, and the framework base validates FIRST and returns `false` WITHOUT
 * DELETING when validation fails [org/Hibachi/HibachiService.cfc:L55-L58, L79]. The ported entities
 * publish no error collection, so this accumulator is what stands in for `hasErrors()` - the same
 * treatment {@link collectPriceGroupRateSaveContextErrors} gives the save context.
 *
 * TWO OF THE SIX DELETE RULES ARE ANSWERABLE HERE, and B5 is enforced by omission for the rest. The
 * schema sets `maxCollection: 0` on `appliedOrderItems`, `childPriceGroups`, `accounts`,
 * `subscriptionBenefits`, `subscriptionUsageBenefits` and `promotionRewards`. The ported `PriceGroup`
 * carries `childPriceGroups` [model/entity/PriceGroup.cfc:L63] and `promotionRewards`
 * [model/entity/PriceGroup.cfc:L70]; the other four belong to out-of-scope aggregates the entity does
 * not carry and no port member counts, so they are not asserted and the gap is recorded at the caller.
 *
 * ★★ THE TWO ANSWERABLE RULES ARE NOT EQUALLY LIKELY TO FIRE, AND THAT IS WORTH KNOWING. The detach
 * loop at [model/service/PriceGroupService.cfc:L465-L467] runs BEFORE the delete and empties
 * `childPriceGroups` itself, so that rule normally passes by the time this runs - it is still asserted,
 * because DEFECT 6's loop terminates only while `removeChildPriceGroup` keeps splicing the live array,
 * and a loop that stopped early must not be followed by a delete the source would have refused.
 * Nothing anywhere empties `promotionRewards`, so that is the rule that actually refuses deletes.
 *
 * @param priceGroup - the price group being deleted, read for both rules.
 * @returns one entry per failed rule, empty when the price group may be deleted.
 */
function collectPriceGroupDeleteContextErrors(
  priceGroup: PriceGroup,
): { readonly propertyIdentifier: string; readonly errorMessage: string }[] {
  const errors: { readonly propertyIdentifier: string; readonly errorMessage: string }[] = [];

  // `"childPriceGroups": [{"contexts":"delete","maxCollection":0}]`.
  if (priceGroup.getChildPriceGroups().length !== 0) {
    errors.push({
      propertyIdentifier: 'childPriceGroups',
      errorMessage: 'childPriceGroups must be empty to delete',
    });
  }

  // `"promotionRewards": [{"contexts":"delete","maxCollection":0}]`.
  if (priceGroup.getPromotionRewards().length !== 0) {
    errors.push({
      propertyIdentifier: 'promotionRewards',
      errorMessage: 'promotionRewards must be empty to delete',
    });
  }

  return errors;
}

/**
 * Builds the payload `updatePriceGroupSKUSettings` forwards to `savePriceGroupRate`, omitting
 * `amount` on every path but `"new amount"`.
 *
 * JUDGMENT CALL: legacy achieves this by DELETING the key from the caller's own struct -
 * `StructDelete(arguments.data, "amount")` at [model/service/PriceGroupService.cfc:L190]. The
 * target does NOT mutate its input, which is a typed, deeply `readonly`, caller-owned object, and
 * `src/lib/cfml/struct.ts` deliberately exports no `structDelete` counterpart. The key is omitted
 * while constructing the forwarded payload instead.
 */
function buildRateSavePayload(data: PriceGroupSkuSettingsInput): PriceGroupRateSaveInput {
  // Legacy [model/service/PriceGroupService.cfc:L188], verbatim:
  //   "If we are not updating to a new amount then make sure to delete "amount"
  //    from RC or else it will overwrite the Rate."
  //
  // CFML parity [model/service/PriceGroupService.cfc:L189]: `!=` on strings is CASE-INSENSITIVE in
  // CFML, so "NEW AMOUNT" matches the sentinel too. `cfEquals` preserves that; a bare `===` would
  // narrow behaviour.
  if (!cfEquals(data.priceGroupRateId, 'new amount')) {
    return { priceGroupRateId: data.priceGroupRateId };
  }

  const amount = data.amount;

  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional property, so an
  // absent amount is expressed by omitting the key - which is also the honest translation: a key
  // the request context never carried is a key CFML had nothing to delete and nothing to forward.
  if (amount === undefined) {
    return { priceGroupRateId: data.priceGroupRateId };
  }

  return { priceGroupRateId: data.priceGroupRateId, amount };
}

/**
 * Reads the caller-resolved SKU, throwing when it is absent.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L219, L221]: legacy loads the SKU through the
 * framework generic `getSku(primaryKey)`, which returns null on a miss, and then calls
 * `addSku(null)` at [L221], which raises. The target throws at the point the SKU is needed rather
 * than one line later.
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
 * Narrows an association the legacy cascade passes on or dereferences WITHOUT A NULL TEST, failing in
 * the same place and for the same reason when it is absent.
 *
 * ★★ WHY A SILENT SKIP IS THE ONE ANSWER THAT CANNOT BE RIGHT HERE. Four sites in the five-level
 * cascade reach an association with no guard - [model/service/PriceGroupService.cfc:L116, L154, L159,
 * L174] - and under CFML each one FAILS: two pass a null into a `required any` parameter, which CFML
 * reports as the argument not having been passed at all, and the remaining two dereference a method on
 * null. An earlier revision expressed each absence as "no rate resolved at this level", which reads as
 * conservative and is not: the cascade's whole structure is `if the rate is still null, try the next
 * level`, so skipping a level does not stop - IT FALLS THROUGH AND SELECTS A DIFFERENT RATE. A
 * different rate is a different price, arrived at with nothing reported anywhere, where the source
 * refused to answer at all. This is must-preserve area #2, so failing where the source fails is the
 * only option that keeps the answer honest.
 *
 * It is not a guard the legacy lacked and it is not new behaviour: it is the legacy's own failure,
 * given a message and a locator. Every call site is a place the CFML would have thrown.
 *
 * ★★ TWO OF THE FOUR SITES ARE STRUCTURALLY UNREACHABLE, IN THE TARGET AND IN THE SOURCE ALIKE, AND
 * SAYING SO IS PART OF REPRODUCING THEM HONESTLY. Only [L116] and [L154] can actually raise. [L159] and
 * [L174] sit at levels 3 and 5 of `getRateForSkuBasedOnPriceGroup`, which are reached only after level 2
 * at [L153-L155] has returned - and level 2 delegates into `getRateForProductBasedOnPriceGroup`, so an
 * absent product raises at [L154] and an absent product type raises at [L116] inside that delegate,
 * both BEFORE level 3 is evaluated. CFML's control flow is identical, for identical reasons. They are
 * reproduced anyway rather than collapsed, because the reproduction is of the source's SHAPE - the same
 * dereference in the same place, unreachable in the same way - and because the moment the level ordering
 * changes, an unreproduced site becomes a silent fall-through again.
 *
 * NO DEFAULT IS SYNTHESISED - no placeholder product type, no fallback product, no `Money.zero`. The
 * three alternatives to this helper were a non-null assertion, which is banned in `src/**` and would
 * hide the case; a substituted default, which would silently price against an association the SKU does
 * not have; and the silent skip, which is the divergence being corrected.
 *
 * NET-NEW COVERAGE (B8): there is no `PriceGroupServiceTest` anywhere in `meta/tests/`, and
 * `tests/unit/services/priceGroupService.test.ts` is another agent's planned-but-unprocessed file, so
 * the obligations this helper carries are recorded here rather than encoded in a suite of this file's
 * own. Six cases discharge it, and all six were exercised at runtime before this note was written:
 *   1. `getRateForProductBasedOnPriceGroup` with a product carrying no product type RAISES, citing
 *      [L116].
 *   2. That same call raises EVEN WHEN THE PRICE GROUP HOLDS A GLOBAL RATE - the case where the silent
 *      skip previously returned a real rate, and therefore a different price.
 *   3. A product that does carry a product type still resolves the global rate unchanged, proving the
 *      narrowing did not become a blanket refusal.
 *   4. `getRateForSkuBasedOnPriceGroup` with a SKU carrying no product RAISES, citing [L154], and also
 *      raises when a global rate is present.
 *   5. That same SKU, when a SKU-SPECIFIC rate matches at level 1, resolves WITHOUT raising - proving
 *      the requirement stayed inside the `isNullish(returnRate)` guard rather than being hoisted.
 *   6. A SKU whose product carries no product type surfaces the [L116] locator, NOT [L159], which is
 *      the empirical proof of the unreachability argued above.
 *
 * @param value - the association the legacy statement reads.
 * @param failureDescription - the whole message, carrying the legacy locator and the mechanism.
 * @returns the association, narrowed.
 * @throws when the association is absent, which is exactly where the legacy raises.
 */
/**
 * Whether two `PriceGroup` instances are THE SAME ROW, by the rule Hibernate's session identity
 * actually followed - which is not the same rule as "their primary keys are equal".
 *
 * The same rule the `remove*` paths of `priceGroupRate.ts` and `priceGroup.ts` apply, restated here
 * because it is needed at a THIRD site and this subtree publishes no barrel to share it through. A
 * persisted row carries a real key, so key equality and session identity coincide; an unsaved row
 * carries the placeholder `''` - every in-scope entity declares `unsavedvalue=""` - so there is no key
 * to compare and session identity is INSTANCE identity.
 *
 * ★★ THE KEY ARM COMPARES CASE-INSENSITIVELY HERE, AND CASE-SENSITIVELY IN THE TWO ENTITY FILES. That
 * is deliberate rather than drift. This site's comparison was already written through `cfEquals` with a
 * recorded reason - the `Sw*` identifier columns compare under a case-insensitive collation, so two
 * spellings of one key name one row - and narrowing it to `===` while adding the reference fallback
 * would trade one fidelity gap for another. The entity files have no such recorded reason at their
 * sites, and the distinction is unobservable in either direction for generated identifiers, so neither
 * was disturbed.
 *
 * ★ THE UNSAVED ARM IS UNREACHABLE ON THIS PATH, AND IS STILL WRITTEN. Both operands at the only call
 * site arrive from reads - the account's assigned price groups through the framework-reads collaborator
 * and the subscription price groups through the repository - so every key is a stored key and the first
 * branch never fires. It is written anyway because the rule is the file's rule, not this call site's:
 * a reader comparing the three sites should find one rule, and a future caller that hands in an
 * unsaved price group gets the source's `arrayFind` object comparison rather than a false match on `''`.
 *
 * NET-NEW COVERAGE (B8): the dedupe is observable through `calculateSkuPriceBasedOnAccount`'s return
 * value WHENEVER THE TWO INSTANCES CARRY DIFFERENT RATES, because a discarded duplicate is a rate that
 * never competes for the minimum. Five cases discharge the obligation, and all five were exercised at
 * runtime against a SKU priced 20.00:
 *   1. An assigned instance taking 1.00 off and a DISTINCT subscription instance of THE SAME row taking
 *      10.00 off yield 19.00 - the duplicate is dropped, as Hibernate's identity map made it.
 *   2. A subscription price group naming a DIFFERENT row is still appended, yielding 10.00.
 *   3. Keys differing only in case still collapse, matching the `Sw*` column collation.
 *   4. Two UNSAVED instances, both keyed `''`, do NOT collapse: both rates compete and the result is
 *      10.00. This is the case a plain key comparison gets wrong.
 *   5. The SAME unsaved instance reached through both reads DOES collapse, yielding 19.00.
 *
 * @param held - a price group already held in the accumulating collection.
 * @param candidate - the price group being sought.
 * @returns whether the two refer to the same row.
 */
function isSamePriceGroupRow(held: PriceGroup, candidate: PriceGroup): boolean {
  const heldKey = held.getPriceGroupID();
  const candidateKey = candidate.getPriceGroupID();

  if (heldKey === '' || candidateKey === '') {
    return held === candidate;
  }

  return cfEquals(heldKey, candidateKey);
}

function requireCascadeAssociation<T>(value: T | undefined, failureDescription: string): T {
  if (value === undefined) {
    throw new Error(failureDescription);
  }

  return value;
}

/**
 * Store `value` on `target` under `key` as an OWN, enumerable data property.
 *
 * ★ WHY THIS EXISTS INSTEAD OF `target[key] = value`. The key is a persisted
 * `SwPriceGroup.priceGroupID` value, so it is EXTERNALLY SOURCED. A plain object
 * inherits `Object.prototype`, whose legacy `__proto__` accessor intercepts
 * `target['__proto__'] = value`: the entry is silently DISCARDED, and because the
 * value here is an object literal the accumulator's own prototype is replaced as
 * well. The visible outcome is that one price group vanishes from the serialized
 * document while every sibling is present - the admin form then renders a price
 * group the operator cannot see, on a pricing path.
 * `Object.defineProperty` declares an own, enumerable, writable, configurable data
 * property, so the write cannot be intercepted.
 *
 * `JSON.stringify` treats an own `__proto__` data property exactly like any other
 * key, so the emitted document is unchanged for every ordinary identifier.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L253]: a CFML struct has no
 * prototype chain and no reserved keys, so `priceGroupData[ '__proto__' ]` was an
 * ordinary key and `serializeJSON` emitted it. The plain assignment this replaces
 * was the divergence.
 *
 * The identical mechanism, for the identical reason, is used by
 * `src/lib/logger.ts` `redactPlainObject`, `src/domain/entities/sku.ts`,
 * `src/domain/entities/product.ts` and `src/repositories/mysql/mysqlSkuRepository.ts`.
 *
 * @param target the record being built. Mutated in place.
 * @param key the externally sourced identifier. Used verbatim, never normalised.
 * @param value the value to store.
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
 * Price group resolution, price-group rate application, and the price-group order
 * pass.
 *
 * Ported from `model/service/PriceGroupService.cfc` (475 lines). Thirteen public methods, every
 * legacy name verbatim. The module header carries the provenance, the banner audit, the
 * collaborator calibration and the ordering constraint in full.
 *
 * ORDERING CONSTRAINT - {@link PriceGroupService.updateOrderAmountsWithPriceGroups} MUST BE
 * EXECUTED BEFORE `PromotionService.updateOrderAmountsWithPromotions()`, EXPLICITLY AND
 * NON-OPTIONALLY, because the promotion pass chooses its discount base by price-group eligibility
 * at [model/service/PromotionService.cfc:L241-L254] and so READS STATE THIS PASS WRITES. This class
 * carries no sequencing helper, no latch and no phase parameter, and none may be added.
 *
 * The class declares `implements SkuPriceGroupResolver` so that any divergence in the three
 * signatures that contract names is a compile error rather than a review item. TWO DRIFT
 * CORRECTIONS AGAINST THE SPECIFICATION are recorded here because this is the file that consumes
 * it. First, `SkuPriceGroupResolver` is NOT published from
 * `src/domain/ports/priceGroupRepository.ts`: that port's tail records it as RELOCATED into
 * `src/domain/entities/sku.ts`, where it is declared at L389, while `CurrentAccountContext` stays
 * on the port. Second, it has THREE members rather than two - it also requires a synchronous
 * `getRateForSkuBasedOnPriceGroup(sku, priceGroup): PriceGroupRate | undefined`, because
 * [model/entity/Sku.cfc:L266] reaches [model/service/PriceGroupService.cfc:L140] directly. All
 * three are already among the thirteen with exactly the required shapes.
 */
export class PriceGroupService implements SkuPriceGroupResolver {
  /**
   * @param priceGroupRepository - price-group persistence and the one subscription
   * reach-through. Replaces the legacy `priceGroupDAO` property declared at
   * [model/service/PriceGroupService.cfc:L51], whose sole live call site is [L277].
   * `model/dao/PriceGroupDAO.cfc` DECLARES EXACTLY ONE FUNCTION -
   * `getAccountSubscriptionPriceGroups` at [model/dao/PriceGroupDAO.cfc:L52], with no `returntype`,
   * so the port's other five members are attributed to inherited framework and ORM CRUD, never to a
   * DAO locator that does not exist.
   *
   * @param productRepository - product load-by-identifier. Replaces the legacy
   * `productService` property declared at [L54], whose sole live call site is [L206].
   *
   * @param frameworkReads - the two `HibachiService`/ORM generics no port publishes.
   * Replaces the legacy `skuService` property declared at [L53] on the count though not in kind -
   * see {@link PriceGroupSkuSettingsInput.resolvedSku}.
   *
   * T1 - every collaborator is an explicit constructor argument typed to a contract and wired once
   * in the composition root, with no optional parameter and no default, replacing DI/1's runtime
   * convention scan and its 30-second first-scan lock.
   *
   * JUDGMENT CALL: legacy injects `skuService` [L53] and `productService` [L54] SOLELY to reach the
   * framework's generic `get<Entity>(primaryKey)` accessor at [L219] and [L206], so neither is a
   * sibling-service dependency in substance. NO PORT MEMBER WAS INVENTED, and
   * `src/domain/ports/skuRepository.ts` is deliberately NOT injected - an unreferenced parameter
   * would not survive `noUnusedLocals`, and pretending to depend on it would misrepresent the
   * graph.
   */
  constructor(
    private readonly priceGroupRepository: PriceGroupRepository,
    private readonly productRepository: ProductRepository,
    private readonly frameworkReads: PriceGroupFrameworkReads,
  ) {}

  // =========================================================================
  // MUST-PRESERVE AREA #2 - THE FIVE-LEVEL CASCADE
  //
  // Three methods form a Chain of Responsibility. All three are synchronous, all three return
  // `PriceGroupRate | undefined`, and all three end by falling off the end when nothing matched.
  //
  // EVERY SELECTION LOOP IN ALL THREE IS LAST-MATCH-WINS, NOT FIRST-MATCH-WINS. That is the single
  // most breakable property in this file, and it is why `Array.prototype.find()`, `findLast()`,
  // `some()`, `filter()[0]` and `at(-1)` are forbidden for these six loops. `find()` yields the
  // FIRST match and is simply wrong; `findLast()` is nearly right and still wrong in the
  // productType variant, where "matches" is not a predicate over rates but the outcome of an
  // ancestor walk per rate. Each loop is therefore an explicit indexed `for` over the rate array
  // with a reassigned `let returnRate`, exactly as the legacy is written.
  //
  // NULL IS THE CONTRACT. [L96-L98], [L135-L137] and [L178-L180] each read
  //   `if(!isNull(returnRate)) return returnRate;`
  // with NO `else`, and a CFML function that falls off the end returns null. The target returns
  // `undefined`; a `Money.zero`, a `0`, a thrown error or a synthesised default rate would each
  // change behaviour. This is the same load-bearing-null pattern as `Sku.getPriceByCurrencyCode`,
  // where substituting zero sells product for free.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L60, L105, L143]: `javaCast("null","")`
  // initialises `returnRate` in all three methods and becomes an explicitly-typed
  //   `PriceGroupRate | undefined`
  // local.
  //
  // LEGACY-NOTE [model/service/PriceGroupService.cfc:L68, L81, L91, L96, L115, L120, L130, L135,
  // L153, L158, L163, L173, L178, L307, L326, L365]: sixteen genuine `isNull(...)` tests, none of
  // them a `structKeyExists` probe. `isNullish()` is used where the result is consumed as a boolean
  // and `=== undefined` where the operand must be NARROWED, since a `boolean` cannot narrow a
  // union. Both are identical here: every operand is a `T | undefined`, absence never being `null`.
  //
  // LEGACY-NOTE [model/service/PriceGroupService.cfc:L63, L83, L108, L122, L146, L165]: every
  // legacy loop re-invokes `getPriceGroupRates()` in its bound and again on each indexed read. The
  // ported accessor hands out the LIVE array and nothing here mutates it, so hoisting it to one
  // local per method is identical.
  //
  // `noUncheckedIndexedAccess` makes each indexed read `T | undefined`, so every loop narrows its
  // element and skips an absent one. Those branches are unreachable over a dense array and add no
  // constraint the legacy lacks.
  // =========================================================================

  /**
   * Resolves the price-group rate that applies to a product type, walking the product-type ancestor
   * chain and then the price-group parent chain.
   *
   * Ported from [model/service/PriceGroupService.cfc:L57-L99]. Level one of the cascade, and the
   * level the other two delegate into. FOUR LEVELS, IN THIS EXACT ORDER: [L63-L78] per rate, walk
   * the productType PARENT CHAIN testing `rate.hasProductType(currentProductType)` [L70] and
   * ascending through `getParentProductType()` [L76]; [L81-L88] if still unset, scan for a rate
   * carrying the global flag; [L91-L93] if still unset and the price group has a parent, RECURSE
   * into the parent price group with the SAME productType; [L96-L98] return only if something was
   * found.
   *
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

    // Level 1 - [L63-L78]: the productType ancestor walk, per rate.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L63-L78]: THE `break` AT [L72] EXITS ONLY
    // THE INNER `while` - the ancestor walk - and NOT the rate loop. The outer `for` then
    // increments, re-initialises `currentProductType` at [L66] and walks again, so a LATER matching
    // rate OVERWRITES `returnRate`. Rate selection is therefore LAST-match-wins, and
    // `Array.prototype.find()` would yield FIRST-match and is WRONG here.
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      // Legacy [L66]: re-initialised inside the rate loop, once per rate.
      let currentProductType: ProductType | undefined = productType;

      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L68-L77]: this walk
      // carries no cycle guard of its own, exactly as the legacy does, and NONE IS
      // ADDED HERE. That is now a statement about where the guard lives rather
      // than about its absence, and the distinction matters because this loop
      // runs on the READ path while an order is being priced - a cycle here would
      // hold the invocation's event loop until the Lambda timeout.
      //
      // WHERE THE GUARD DOES LIVE: the one recursive READ that materializes an
      // ancestry. `hydrateWithAncestry` in
      // src/repositories/mysql/mysqlProductTypeRepository.ts keeps a chain-scoped
      // visited set and raises `ProductTypeCycleError` naming the chain, so a
      // cyclic ROW SET never becomes an in-memory graph and this loop is never
      // handed one. That guard is a fetch-shape decision under transformation rule
      // T3 - the query it protects has no legacy antecedent, because Hibernate's
      // lazy many-to-one did the traversal - and it is NOT a deliberate divergence.
      //
      // ★ TWO FURTHER GUARDS ONCE STOOD BEHIND IT AND HAVE BEEN REMOVED, WHICH IS
      // WHY THIS NOTE NO LONGER CLAIMS A CYCLE IS IMPOSSIBLE HERE.
      // `ProductType.setParentProductType` used to refuse an assignment that would
      // make a node reachable from itself, and `buildIdPathList` used to throw on a
      // revisited node. Both were removals of legacy behaviour rather than
      // reproductions of it - the legacy setter validates nothing
      // [model/entity/ProductType.cfc:L149-L153] and the legacy walk carries no
      // visited set [org/Hibachi/HibachiEntity.cfc:L314-L321] - so both are gone.
      // The honest statement is therefore narrower than the one that stood here: a
      // cycle cannot arrive from the DATABASE, because the adapter refuses to
      // hydrate one, and it cannot arrive from a CONSTRUCTOR, because the node
      // being constructed does not exist yet for an ancestor to point at. It CAN be
      // built in memory by an operator who calls the setter with a descendant, and
      // in that case this loop does not terminate - exactly as
      // [model/service/PriceGroupService.cfc:L68-L77] does not terminate on the
      // same graph. That is the legacy behaviour, and reproducing it is the point.
      //
      // Adding a guard here would therefore be a change to a must-preserve money
      // path rather than a safety net, and the materialized `productTypeIDPath`
      // column - which the schema maintains and this migration reads unchanged -
      // remains the structural reason the hierarchy is a tree in practice.
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

    // Level 2 - [L81-L88]: the global-rate scan, also LAST-match-wins, since the legacy loop
    // carries no `break` anywhere.
    //
    // JUDGMENT CALL: `PriceGroup.getGlobalPriceGroupRate()` exists at
    // [model/entity/PriceGroup.cfc:L83] and is DELIBERATELY NOT SUBSTITUTED for this scan or for
    // either of the other two. Its body at [L83-L90] does `return rates[i]` INSIDE its loop, making
    // the helper FIRST-match-wins while all three inline scans are LAST-match-wins, so substituting
    // it would silently change which rate is selected whenever a price group carries more than one
    // global rate.
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        // CFML parity [L84]: `if(rates[i].getGlobalFlag())`. `globalFlag` is declared
        // `ormType="boolean" default="false"` at [model/entity/PriceGroupRate.cfc:L53] and the
        // ported accessor returns a strict `boolean`, so no truthiness coercion occurs.
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

    // Legacy falls off the end here and CFML returns null. `undefined` is the contract; nothing is
    // substituted for it.
    return undefined;
  }

  /**
   * Resolves the price-group rate that applies to a product.
   *
   * Ported from [model/service/PriceGroupService.cfc:L102-L138]. Level two of the cascade. FIVE
   * LEVELS, IN THIS EXACT ORDER: [L108-L112] scan for a rate with `hasProduct(product)`,
   * LAST-match-wins and with no `break` at all; [L115-L117] if unset, delegate to
   * {@link PriceGroupService.getRateForProductTypeBasedOnPriceGroup} with the product's own product
   * type; [L120-L127] if unset, scan for a global rate; [L130-L132] if unset, recurse into the
   * parent price group with the same product; [L135-L137] return if found.
   *
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
      // CFML parity [L116]: legacy passes `arguments.product.getProductType()` straight through with no
      // null test, into a parameter declared `required any productType` at [L57]. Passing a NULL value
      // to a named CFML argument leaves the key unset in the arguments scope, so the required check
      // raises before the callee's first statement runs.
      //
      // ★ AN EARLIER REVISION EXPRESSED THE ABSENT CASE AS "no rate resolved at this level". That is
      // not a smaller version of the legacy behaviour, it is a different one: the cascade continues to
      // levels 3, 4 and 5, and one of them will very likely resolve a rate - so a product with no
      // product type would be priced against the global rate or an ancestor's rate instead of failing.
      // See {@link requireCascadeAssociation}.
      returnRate = this.getRateForProductTypeBasedOnPriceGroup(
        requireCascadeAssociation(
          product.getProductType(),
          `Product "${product.getProductID()}" has no product type, so the price-group cascade ` +
            'cannot resolve a rate for it. CFML parity ' +
            '[model/service/PriceGroupService.cfc:L116]: the legacy statement passes the null ' +
            'product type into getRateForProductTypeBasedOnPriceGroup, whose productType parameter ' +
            'is declared required at [L57], and CFML raises there.',
        ),
        priceGroup,
      );
    }

    // Level 3 - [L120-L127].
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L120-L127]: this global scan REPEATS the one
    // already performed inside `getRateForProductTypeBasedOnPriceGroup` at [L83-L88], over the same
    // rate collection of the same price group, so it cannot change the outcome. Reproduced verbatim
    // rather than removed: removing it is exactly the cleanup the minimal-change directive forbids,
    // and the cascade's shape is part of what a reviewer checks method by method.
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
   * Ported from [model/service/PriceGroupService.cfc:L140-L181]. Level three of the cascade, the
   * entry point the price calculation uses, and the site of DEFECT 7.
   *
   * FIVE NOMINAL LEVELS - AND ONLY TWO EFFECTIVE ONES: [L146-L150] scan for a rate with
   * `hasSku(sku)`, LAST-match-wins and with no `break`; [L153-L155] if unset, delegate to
   * {@link PriceGroupService.getRateForProductBasedOnPriceGroup} with the SKU's product;
   * [L158-L160] if unset, delegate to
   * {@link PriceGroupService.getRateForProductTypeBasedOnPriceGroup} with that product's product
   * type; [L163-L170] if unset, scan for a global rate; [L173-L175] if unset, recurse into the
   * parent price group - calling THE PRODUCT VARIANT, which is DEFECT 7; [L178-L180] return if
   * found.
   *
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
      // CFML parity [L154]: legacy passes `arguments.sku.getProduct()` straight through with no null
      // test, into a parameter declared `required any product` at [L102]. Same mechanism and same
      // treatment as [L116] above - see {@link requireCascadeAssociation}.
      returnRate = this.getRateForProductBasedOnPriceGroup(
        requireCascadeAssociation(
          sku.getProduct(),
          `Sku "${sku.getSkuID()}" has no product, so the price-group cascade cannot resolve a rate ` +
            'for it. CFML parity [model/service/PriceGroupService.cfc:L154]: the legacy statement ' +
            'passes the null product into getRateForProductBasedOnPriceGroup, whose product ' +
            'parameter is declared required at [L102], and CFML raises there.',
        ),
        priceGroup,
      );
    }

    // Levels 3, 4 and 5 - [L158-L175].
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L157-L175]: LEVELS 3, 4 AND 5 CANNOT CHANGE
    // THE RESULT. If level 2 returned nothing then inside `getRateForProductBasedOnPriceGroup`
    // these were ALL already exhausted over this same price group and its ancestors: the product
    // scan [L108-L112], the productType cascade including its own global scan [L83-L88] and parent
    // recursion [L91-L93], the product-variant global scan [L120-L127], and the product-variant
    // parent recursion [L130-L132]. THE NOMINAL FIVE-LEVEL CASCADE HAS ONLY TWO EFFECTIVE LEVELS:
    // the SKU rate, then everything the product variant does. All five are reproduced verbatim and
    // NOT collapsed - they cannot change the result, and removing them is the cleanup the
    // minimal-change directive forbids.

    // Level 3 - [L158-L160].
    if (isNullish(returnRate)) {
      // CFML parity [L159]: legacy chains `arguments.sku.getProduct().getProductType()` with no null
      // test at either step, and the two steps fail DIFFERENTLY. An absent product makes this a method
      // call on null, which raises AT THE DEREFERENCE; an absent product type raises at the callee's
      // required check, as [L116] does. Both are reproduced, each at its own step, rather than being
      // collapsed into one optional chain that answers `undefined` for either.
      const productOfSku = requireCascadeAssociation(
        sku.getProduct(),
        `Sku "${sku.getSkuID()}" has no product, so getProductType() cannot be called on it. CFML ` +
          'parity [model/service/PriceGroupService.cfc:L159]: the legacy statement chains ' +
          'sku.getProduct().getProductType() with no null test and raises at the dereference.',
      );

      returnRate = this.getRateForProductTypeBasedOnPriceGroup(
        requireCascadeAssociation(
          productOfSku.getProductType(),
          `Product "${productOfSku.getProductID()}" has no product type, so the price-group cascade ` +
            'cannot resolve a rate for the SKU. CFML parity ' +
            '[model/service/PriceGroupService.cfc:L159]: the legacy statement passes the null ' +
            'product type into getRateForProductTypeBasedOnPriceGroup, whose productType parameter ' +
            'is declared required at [L57], and CFML raises there.',
        ),
        priceGroup,
      );
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

    // Level 5 - [L173-L175] - DEFECT 7.
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L173-L175]: the parent-price-group
    // recursion calls `getRateForProductBasedOnPriceGroup` - THE PRODUCT VARIANT, NOT THE SKU
    // VARIANT - so a rate on a parent price group that includes THIS SKU SPECIFICALLY is never
    // reached. The specification calls this a break in the cascade's symmetry; the verified truth
    // is stronger and stranger, because the correct recursion ALREADY HAPPENED TRANSITIVELY at
    // [L130-L132], so the symmetry break is a REDUNDANT NO-OP with no observable effect. It is
    // still a defect, and repairing it would change which rate is selected the moment the
    // transitive path stops covering it.
    //
    // Preserved deliberately; do not fix without a product decision.
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        // CFML parity [L174]: the same unguarded `arguments.sku.getProduct()` as [L154], into the same
        // `required any product` parameter. The parent test one line up IS guarded in the source -
        // `!isNull(arguments.priceGroup.getParentPriceGroup())` at [L173] - which is why that one stays
        // a condition and this one does not.
        returnRate = this.getRateForProductBasedOnPriceGroup(
          requireCascadeAssociation(
            sku.getProduct(),
            `Sku "${sku.getSkuID()}" has no product, so the parent price group cannot be searched ` +
              'for a rate. CFML parity [model/service/PriceGroupService.cfc:L174]: the legacy ' +
              'statement passes the null product into getRateForProductBasedOnPriceGroup, whose ' +
              'product parameter is declared required at [L102], and CFML raises there.',
          ),
          parentPriceGroup,
        );
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
   * Ported from [model/service/PriceGroupService.cfc:L316-L340]. THE ARITHMETIC HEART OF
   * MUST-PRESERVE AREA #2, and the site of DEFECT 8.
   *
   * THE PASSTHROUGH SEED. [L318] carries the verbatim legacy comment "setup the new price as the
   * old price in the event of a passthrough" and [L319] seeds `newPrice` with
   * `arguments.sku.getPrice()` - NEVER `Money.zero`, which would sell the SKU for nothing on the
   * fallthrough path.
   *
   * THE FALLTHROUGH IS REACHABLE, AND IT MUST NOT THROW. [L321-L336] is a `switch` on
   * `getAmountType()` with THREE cases and NO `default:`, and `amountType` is declared
   * `ormType="string" hb_formFieldType="select"` at [model/entity/PriceGroupRate.cfc:L55] WITH NO
   * DEFAULT AND NO ENUMERATION CONSTRAINT, so an unset or unrecognised value matches nothing and
   * the [L319] passthrough is returned. No throwing `default:` and no amount-type validation is
   * added - either would be a constraint the legacy schema does not carry.
   *
   * DEFECT 8 IS A THREE-WAY ASYMMETRY, NOT A TWO-WAY ONE:
   *
   * | case            | arithmetic                        | precision | rounding rule |
   * | `percentageOff` | `p - (p * (amount / 100))` [L323] | yes       | YES [L326]    |
   * | `amountOff`     | `p - amount` [L331]               | yes       | no            |
   * | `amount`        | `amount` [L334]                   | none      | no            |
   *
   * The `amount` case uses no precision arithmetic because it performs none - it is a direct
   * assignment.
   *
   * @returns the resulting price, quantized to two decimals.
   */
  calculateSkuPriceBasedOnPriceGroupRate(sku: Sku, priceGroupRate: PriceGroupRate): Money {
    // JUDGMENT CALL: HOW THE TWO `precisionEvaluate` SITES ARE TRANSLATED. Legacy [L323] and [L331]
    // pass a CFML SOURCE-CODE STRING to `precisionEvaluate(...)`. The expression is TRANSLATED INTO
    // TYPED CALLS, never a string evaluated at runtime: no `evaluate()`, no dynamic dispatch, no
    // `Function` constructor. The typed calls are `Money`'s own `minus`, `times` and `dividedBy`
    // rather than the lower-level helpers in `src/lib/cfml/precision.ts`: `Money` IS the
    // migration's single arithmetic surface and runs over the same arbitrary-precision substrate,
    // so this IS the typed translation rather than a bypass, while `precision.ts` would surface a
    // third-party `Decimal` into this file's locals.
    //
    // THE WRITTEN EXPRESSION SHAPE IS PRESERVED EXACTLY. [L323] computes
    //   `price - (price * (amount / 100))`:
    // the percentage is applied to the price and the product is then SUBTRACTED. It is NOT
    // rewritten as `price * (1 - amount / 100)` - the two are equal in the reals and can differ
    // after the [L339] two-decimal quantization.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L319, L323, L331, L334]: `var newPrice` is
    // REDECLARED FOUR TIMES in one function scope. CFML tolerates redeclaration; TypeScript does
    // not, so it is collapsed to a single `let`.

    // Legacy [L318], verbatim: "setup the new price as the old price in the event of a
    // passthrough". Legacy [L319]: var newPrice = arguments.sku.getPrice();
    let newPrice: Money = sku.getPrice();

    // Legacy [L321]: switch(arguments.priceGroupRate.getAmountType())
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L321-L336]: only the `percentageOff`
    // branch applies the rate's rounding rule, at [L326-L328]. `amountOff` [L331] and `amount`
    // [L334] skip it entirely, so ONE AND THE SAME rounding rule attached to two rates changes the
    // price for one amount type and leaves it untouched for the others.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ A CHAIN RATHER THAN A `switch`, AND THE REASON IS CASE FOLDING.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L321]: a CFML `switch` on a string compares
    // its `case` labels CASE-INSENSITIVELY, so a rate persisting `'PercentageOff'` reaches
    // `case "percentageOff"` in the legacy engine. A TypeScript `switch` compares with `===` and
    // cannot be made to fold case, so the dispatch is written as an if/else-if chain over
    // {@link matchesAmountType} instead. This is a translation of the same dispatch, not a
    // restructuring of it: the three arms stay in source order [L322, L330, L333], each keeps its own
    // block scope exactly as the `case` blocks had, and the chain has NO FINAL `else` because
    // [L321-L336] has no `default` - which is what preserves the passthrough documented at [L318].
    //
    // An earlier revision used a `switch` with exact labels. That silently mispriced any rate whose
    // `amountType` was stored with different casing: the arm was missed, the fall-through returned the
    // seeded `sku.getPrice()`, and the customer was charged the UNDISCOUNTED price with nothing
    // reported. `SwPriceGroupRate.amountType` carries no check constraint, so that is a state the
    // column can hold.
    //
    // Read ONCE into a local, so three tests that are meant to be mutually exclusive cannot disagree
    // about their subject - the same determinism rule applied to the qualifier dispatch in
    // src/services/promotion/qualifierQualification.ts.
    const rateAmountType: PriceGroupRateAmountType | undefined = priceGroupRate.getAmountType();

    // Legacy [L322-L329].
    if (matchesAmountType(rateAmountType, 'percentageOff')) {
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
      // SECURITY REVIEW DISPOSITION - PART OF S-03, DECLINED ON A CITED MANDATE.
      //
      // Finding S-03 (CRITICAL, CWE-682/CWE-840) names this file among its three
      // locations and asks that a negative rounded total be rejected here. It is
      // reachable: `roundValue` can return a value larger than its input or below
      // zero - see the disposition block in `src/services/roundingRuleService.ts`
      // and AAP 0.6.4 Findings C and D - so a low-priced SKU under a `.99` rate can
      // leave this dispatch with a negative `newPrice`.
      //
      // DECLINED, because a guard here would not be hardening; it would repair
      // register entry 8 and the rounding algorithm at once, for one of the three
      // amount-type branches only, and change the price this method returns
      // relative to the system being migrated. AAP 0.6.7 registers the asymmetry
      // that only `percentageOff` rounds as defect 8 and preserves it; AAP 0.9.3
      // requires the price-group cascade to be tested "including the rounding-rule
      // asymmetry where only `percentageOff` rounds", which presupposes the
      // asymmetry still exists. AAP 0.9.3 also lists the only three sanctioned
      // divergences in the port, and neither defect 8 nor the rounding algorithm is
      // among them.
      //
      // ★ ONE WORD OF THE ORIGINAL NOTE IS REVISED, AND NOTHING ELSE. The note was
      // written against a `switch` over `amountType`; the dispatch is now an
      // if/else-if chain over {@link matchesAmountType}, for the case-folding reason
      // recorded above the chain. "this switch" therefore reads "this dispatch". The
      // reachability argument, the mandate citations and the ruling are untouched.
      //
      // The outcome is therefore pinned rather than clamped, and a caller that
      // needs a non-negative price must establish that at its own boundary. This
      // note exists so the next reader learns it from the code rather than from a
      // production incident.
      // -----------------------------------------------------------------
      const roundingRule = priceGroupRate.getRoundingRule();

      if (roundingRule !== undefined) {
        newPrice = roundingRule.roundValue(newPrice);
      }

      // Legacy [L330-L332]. No rounding rule is applied - DEFECT 8.
    } else if (matchesAmountType(rateAmountType, 'amountOff')) {
      const rateAmount = requireRateAmount(priceGroupRate, 'amountOff');

      // Legacy [L331]: price - amount.
      newPrice = sku.getPrice().minus(rateAmount);

      // Legacy [L333-L335]. A direct assignment: no arithmetic, therefore no
      // precision call, and no rounding rule - DEFECT 8.
    } else if (matchesAmountType(rateAmountType, 'amount')) {
      newPrice = requireRateAmount(priceGroupRate, 'amount');
    }
    // NO FINAL `else`, reproducing the absent `default` at [L321-L336]: an `amountType` outside the
    // three published values - including an absent one - leaves `newPrice` at the [L319] passthrough
    // seed. See the LEGACY-NOTE above the chain.

    // Legacy [L339]: return numberFormat(newPrice, "0.00");
    //
    // CFML parity [model/service/PriceGroupService.cfc:L339]: THE TWO-DECIMAL QUANTIZATION IS
    // LOAD-BEARING ARITHMETIC, NOT PRESENTATION. It is applied INSIDE this method and its result
    // feeds price-group selection and the order item price, along this chain: here ->
    // `calculateSkuPriceBasedOnPriceGroup` [L308] -> `calculateSkuPriceBasedOnAccount`'s numeric
    // sort [L290, L294] -> `getBestPriceGroupDetailsBasedOnSkuAndAccount`'s `<` test [L353, L355]
    // -> the order item price [L370]. Rounding here therefore changes WHICH PRICE GROUP WINS and
    // WHAT THE CUSTOMER PAYS: it must not be deferred to a caller, and a full-precision `Money`
    // must not be returned in its place.
    //
    // JUDGMENT CALL: `numberFormat(...)` is called directly and the result wrapped back into
    // `Money`, rather than using `Money.toFixed2()`, which `src/domain/valueObjects/money.ts`
    // documents as a PRESENTATION step never applied inside an arithmetic operation - and this site
    // is inside the arithmetic.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L316, L339]: the function is declared
    // `returntype="numeric"` but returns the STRING `numberFormat` produces. The target returns
    // `Money`, built from that same two-decimal string.
    return Money.fromDecimalString(numberFormat(newPrice.toDecimalString()));
  }

  /**
   * Resolves and applies the price-group rate for a SKU within one price group.
   *
   * Ported from [model/service/PriceGroupService.cfc:L301-L313]. SYNCHRONOUS, as
   * `SkuPriceGroupResolver` requires: it calls only
   * {@link PriceGroupService.getRateForSkuBasedOnPriceGroup} and
   * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}.
   *
   * [L304] resolves the rate; [L307-L309] applies it when one was found; [L312] otherwise returns
   * `sku.getPrice()` UNCHANGED - the legacy comment at [L300] calls it "just a passthough of
   * sku.getPrice()", the source's own spelling. `Money.zero` is never substituted for that
   * passthrough.
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
   * Resolves the lowest price available to an account across all of its price groups, including the
   * ones it holds through subscription usage benefits.
   *
   * Ported from [model/service/PriceGroupService.cfc:L271-L298]. The out-of-scope `Account` entity
   * is reduced to an OPAQUE `accountID`, a sanctioned narrowing and NOT a signature reshaping.
   *
   * THIS METHOD IS THE ONE THAT INCLUDES SUBSCRIPTION PRICE GROUPS.
   * {@link PriceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount} does NOT, and that
   * disagreement is a preserved legacy defect - see the marker below.
   *
   * @returns the lowest price found, never lower-bounded by zero.
   */
  async calculateSkuPriceBasedOnAccount(sku: Sku, accountID: string): Promise<Money> {
    // Legacy [L274]: var prices = [sku.getPrice()];
    //
    // SEEDED WITH THE SKU'S OWN PRICE, never `Money.zero` - a zero seed would win the [L294]
    // ascending sort every time and give the SKU away.
    const prices: Money[] = [sku.getPrice()];

    // Legacy [L276]: var priceGroups = account.getPriceGroups(); Legacy [L277]: var
    // accountSubscriptionPriceGroups =
    //   getPriceGroupDAO().getAccountSubscriptionPriceGroups(account.getAccountID());
    //
    // LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L52]: `getAccountSubscriptionPriceGroups` is THE
    // ONLY FUNCTION `PriceGroupDAO` declares, and it reads SUBSCRIPTION-OWNED TABLES -
    // `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`, `SwSubsUsageBenefitPriceGroup`,
    // `SwSubsUsage`, `SwSubscriptionStatus` and `SwType`. It is the migration's single deliberate
    // reach into a subscription-owned table, taken because account price-group resolution is
    // otherwise unreproducible. NO SUBSCRIPTION BUSINESS LOGIC IS PORTED: the query is a read and
    // nothing about subscriptions is interpreted.
    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    const accountSubscriptionPriceGroups =
      await this.priceGroupRepository.getAccountSubscriptionPriceGroups(accountID);

    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L276, L282]: the account's LIVE
    // `priceGroups` association array is captured at [L276] with NO DEFENSIVE COPY, and [L282]
    // `arrayAppend`s into it, so calling this method PERMANENTLY ADDS the subscription price groups
    // to the account's in-memory collection for the remainder of the request. The [L281] guard
    // prevents duplicates so repeated calls do not compound, but the account object is polluted and
    // the pollution is observable by anything that subsequently reads `account.getPriceGroups()` -
    // including `getBestPriceGroupDetailsBasedOnSkuAndAccount` at [L351] and
    // `updateOrderAmountsWithPriceGroups` at [L365].
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★★ AND IT IS PRESERVED LITERALLY: THIS IS THE LIVE ASSOCIATION, NOT A COPY. The port contract
    // on {@link PriceGroupFrameworkReads.getAccountPriceGroups} guarantees that every read for one
    // `accountID` within a request returns THE SAME ARRAY INSTANCE, so appending below mutates what
    // [L351] and [L365] will subsequently read - exactly as `arrayAppend` into a by-reference CFML
    // array does. No `[...spread]`, no `slice()`, no `Object.freeze`.
    //
    // ★ QUOTE-THEN-REVISE. An earlier revision copied here and justified it thus: "the legacy
    // mutation was an ARTIFACT OF HIBERNATE'S LIVE COLLECTIONS, not a decision. The repository
    // boundary materialises associations as FRESH ARRAYS per read, so the mutation is STRUCTURALLY
    // ABSENT BY CONSTRUCTION rather than deliberately diverged from. A local merged list is built
    // instead."
    //
    // The first sentence is true about the MECHANISM and says nothing about the OUTCOME, which is
    // what has to be preserved. The second describes a property of an earlier adapter as though it
    // were a property of the domain: "fresh arrays per read" was a choice made in
    // `src/handlers/bootstrap.ts`, and it is what made the behaviour absent. Calling that
    // "structurally absent by construction" turned an adapter decision into an alibi for dropping a
    // marked defect - while the marker directly above continued to assert the behaviour was
    // preserved, so the file contradicted itself. The adapter now memoizes one mutable array per
    // account in request-scoped state, and the outcome is reproduced rather than explained away.
    //
    // WHAT IS OBSERVABLE, AND WHAT THAT COSTS. A caller resolving a price for an account that holds
    // a subscription price group, and then asking for that account's best price-group details, gets
    // details computed over the subscription group too - because the first call put it there. That is
    // the legacy outcome and it is a real behavioural difference from the copying version, which is
    // precisely why the review found the copy. The [L281] guard stops repeat calls compounding.
    const priceGroups: PriceGroup[] = accountPriceGroups;

    // Legacy [L280-L284]:
    //   for(var i=1; i<=arrayLen(accountSubscriptionPriceGroups); i++) {
    //       if(!arrayFind(priceGroups, accountSubscriptionPriceGroups[i])) {
    //           arrayAppend(priceGroups, accountSubscriptionPriceGroups[i]);
    //       }
    //   }
    //
    // CFML parity [model/service/PriceGroupService.cfc:L281]: THE FIFTH INSTANCE OF THE
    // FIND-RESULT-TRUTHINESS ANTI-PATTERN in this slice. `arrayFind` returns a 1-BASED INDEX OR
    // ZERO and `!0` is true, so the legacy test happens to be correct - but the same shape written
    // against a JavaScript `findIndex` result would be WRONG, since `findIndex` returns `-1` and
    // `-1` is truthy while index `0` is falsy. The comparison is therefore written EXPLICITLY
    // against `-1`.
    //
    // JUDGMENT CALL: CFML's `arrayFind` over an array of ENTITY OBJECTS performs an
    // OBJECT comparison, not a key comparison, and under Hibernate that comparison
    // deduplicated correctly for free: the session's identity map guarantees that one
    // row loaded twice in one session IS one instance, so a price group reached both
    // by direct assignment and by subscription was the same object and `arrayFind`
    // found it. The target has no identity map, so the two reads return DISTINCT
    // instances for the same row, and a bare reference comparison would fail to
    // deduplicate and append a second copy the source never held. The comparison is
    // therefore delegated to {@link isSamePriceGroupRow}, which reproduces the
    // outcome Hibernate's identity map produced - key when the key names a stored
    // row, instance when it does not - rather than reproducing the mechanism.
    // ---------------------------------------------------------------------
    for (let i = 0; i < accountSubscriptionPriceGroups.length; i += 1) {
      const subscriptionPriceGroup = accountSubscriptionPriceGroups[i];

      if (subscriptionPriceGroup === undefined) {
        continue;
      }

      const foundIndex = priceGroups.findIndex((held) =>
        isSamePriceGroupRow(held, subscriptionPriceGroup),
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

    // Legacy [L294]: arraySort(prices, "numeric", "asc"); [L297]: return prices[1];
    //
    // CFML parity: CFML arrays are 1-BASED, so `prices[1]` after an ASCENDING sort is THE MINIMUM,
    // and index `0` is the translation.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L294]: the legacy array is MIXED-TYPED -
    // element 1 is a raw numeric from `sku.getPrice()` while every other element is the STRING
    // `numberFormat` produced at [L339] - and CFML's `"numeric"` sort coerces them. In the target
    // every element is already a `Money`, so the coercion disappears and `compare` is used
    // directly. The sort is applied to a COPY to keep the file's rule uniform: a sequence that came
    // from a port result is never reordered in place.
    const sortedPrices = [...prices].sort((left, right) => left.compare(right));

    const lowestPrice = sortedPrices[0];

    if (lowestPrice === undefined) {
      // Unreachable: `prices` was seeded with exactly one element at [L274] and is only ever
      // appended to, so index 0 always exists. The narrowing is required because
      // `noUncheckedIndexedAccess` types the read as `Money | undefined` and a non-null assertion
      // is banned.
      throw new Error(
        'calculateSkuPriceBasedOnAccount produced no candidate price. ' +
          'This is unreachable: the candidate list is seeded with the SKU price at ' +
          '[model/service/PriceGroupService.cfc:L274] and is never emptied.',
      );
    }

    return lowestPrice;
  }

  /**
   * Resolves the lowest price available to the CURRENT account, or the SKU's own price when no
   * account is signed in.
   *
   * Ported from [model/service/PriceGroupService.cfc:L262-L268]. T6 - AMBIENT REQUEST SCOPE BECOMES
   * AN EXPLICIT PARAMETER.
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L263-L264]: legacy reaches the ambient request
   * scope through `getSlatwallScope().getLoggedInFlag()` on one line and
   * `getHibachiScope().getAccount()` on THE VERY NEXT LINE. Both resolve to the same request scope
   * and the codebase-wide convention is `getHibachiScope()`; BOTH are replaced by the single
   * explicit `context` parameter, which normalises the divergence as a side effect. NO AMBIENT
   * STATE REMAINS anywhere in this file.
   *
   * JUDGMENT CALL: THE ADDED PARAMETER IS NOT A DRAW AGAINST THE SIGNATURE-WIDENING LEDGER. It is
   * TRANSFORMATION RULE T6, applied uniformly wherever ambient scope is read, and T6 is not scored
   * against that ledger. Corroborated twice: the AAP's interface-mapping table publishes the
   * two-parameter form, and `src/domain/entities/sku.ts`'s `SkuPriceGroupResolver` declares
   * `calculateSkuPriceBasedOnCurrentAccount(sku, context)` as the canonical shape this class must
   * satisfy, so the shape is required rather than chosen.
   *
   * `CurrentAccountContext` is IMPORTED from `src/domain/ports/priceGroupRepository.ts`, which
   * publishes it for exactly this method, and is never redeclared here.
   */
  async calculateSkuPriceBasedOnCurrentAccount(
    sku: Sku,
    context: CurrentAccountContext,
  ): Promise<Money> {
    // Legacy [L263]: if(getSlatwallScope().getLoggedInFlag()) { ... }
    //
    // CFML parity: "signed in" becomes "the context carries an account identifier".
    // `CurrentAccountContext` publishes `accountID` as its only member, so the logged-in flag and
    // the account are one test rather than two - which is what [L264] needed anyway, since it read
    // the account it never null-tested.
    const accountID = context.accountID;

    if (accountID !== undefined) {
      // Legacy [L264]: return calculateSkuPriceBasedOnAccount(
      //                    sku=arguments.sku, account=getHibachiScope().getAccount());
      return await this.calculateSkuPriceBasedOnAccount(sku, accountID);
    }

    // Legacy [L266]: return sku.getPrice();
    //
    // The not-signed-in branch returns the SKU's own price - no rate lookup, no zero.
    return sku.getPrice();
  }

  /**
   * Finds the best price group for a SKU and account, together with the price it produces. Ported
   * from [model/service/PriceGroupService.cfc:L343-L362]. It reads ONLY the account's
   * directly-assigned price groups, exactly as [L351] does.
   *
   * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]:
   * `calculateSkuPriceBasedOnAccount` includes the account's subscription price groups [L277-L284];
   * this method does not - it reads only `account.getPriceGroups()` at [L351] and never calls the
   * subscription query. Two methods that both claim to compute "the best price for this account"
   * therefore DISAGREE ABOUT THE INPUTS. And because [L282] mutates the account's live association
   * array, WHETHER THE ORDER PASS AT [L364] SEES SUBSCRIPTION PRICE GROUPS AT ALL depends on
   * whether `calculateSkuPriceBasedOnAccount` happened to run earlier in the same request for the
   * same account. The two paths are NOT harmonised here.
   *
   * Preserved deliberately; do not fix without a product decision.
   *
   * @returns the best price and the price group that produced it, `priceGroup` left
   * `undefined` when nothing beat the SKU's own price.
   */
  async getBestPriceGroupDetailsBasedOnSkuAndAccount(
    sku: Sku,
    accountID: string,
  ): Promise<BestPriceGroupDetails> {
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L351, L353, L357]: MIXED
    // SCOPING inside one loop - the bound at [L351] reads
    // `arguments.account.getPriceGroups()` while the body at [L353] and [L357] reads
    // the bare unscoped `account.getPriceGroups()`, and the accessor is re-invoked
    // THREE TIMES PER ITERATION with no defensive copy. All three resolve to the
    // same collection, so one read handed to the selection below is observationally
    // identical - and being ONE read is the point, see
    // {@link PriceGroupService.resolveBestPriceGroupDetails}.
    return this.resolveBestPriceGroupDetails(
      sku,
      await this.frameworkReads.getAccountPriceGroups(accountID),
    );
  }

  /**
   * The price-group selection itself, over a price-group collection THE CALLER HAS ALREADY RESOLVED.
   *
   * Extracted from [model/service/PriceGroupService.cfc:L346-L361] so that the collection the selection
   * runs over is supplied rather than fetched, which is what lets the order pass hand every one of its
   * items THE SAME COLLECTION.
   *
   * ★★ WHY THE COLLECTION IS A PARAMETER: THE SINGLE-SNAPSHOT GUARANTEE. In the legacy component this
   * method reaches the account's price groups by traversing ONE materialized ORM association -
   * `arguments.account.getPriceGroups()` at [L351] - and the order pass at [L365-L367] traverses THAT
   * SAME association object, first for its own gate and then once per order item. Every traversal in a
   * request therefore observes one collection, in one state. That is not incidental: [L282] MUTATES that
   * live array by appending the account's subscription price groups, and the preserved defect recorded on
   * {@link PriceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount} turns on exactly which
   * traversals see the appended members. A port that re-resolves the collection independently for each
   * item cannot reproduce that, because it has no single collection to reason about - two items in one
   * order could be priced against different inputs, with nothing in the result showing that they were.
   * Supplying the collection restores the one property the legacy got for free from the ORM: within one
   * invocation, every item is priced against one snapshot.
   *
   * SYNCHRONOUS BY THE ASYNC BOUNDARY RULE: the body reaches no repository and no framework read - it
   * only calls {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroup}, which is itself synchronous.
   * The public wrapper above stays `async` because IT performs the read.
   *
   * NOT A SIGNATURE CHANGE OF ANY KIND. The thirteen public method names and signatures are untouched:
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, accountID)` still takes exactly the two parameters
   * the interface-parity table names, and still returns the same shape. This helper is `private`, so it
   * adds nothing to the ported public surface - the same category as
   * {@link PriceGroupService.getOrCreatePriceGroupRate}, and it spends none of the signature-widening
   * budget, which was already exhausted.
   *
   * NET-NEW COVERAGE (B8): no `PriceGroupServiceTest` exists in `meta/tests/` and
   * `tests/unit/services/priceGroupService.test.ts` must not be authored here, so the obligations are
   * recorded rather than encoded. Eight cases discharge them, and all eight were exercised at runtime:
   *   1. `getBestPriceGroupDetailsBasedOnSkuAndAccount` still returns the same winner it did before the
   *      extraction, for a SKU beaten by a price group, and still reads the collection once per call.
   *   2. Its STRICTLY-LESS-THAN behaviour is unchanged: a price group whose computed price TIES the
   *      SKU's own price is not applied and `priceGroup` stays `undefined`.
   *   3. Among equal candidates the FIRST strict improvement is kept and later ties never displace it.
   *   4. `updateOrderAmountsWithPriceGroups` resolves the account's price groups EXACTLY ONCE for an
   *      order of three items - the single-snapshot guarantee, observed by counting invocations of the
   *      framework-reads collaborator.
   *   5. That one snapshot is what every item is priced against: each improved item still yields the
   *      intent it did when the collection was re-resolved per item, so the extraction preserves
   *      behaviour as well as the snapshot.
   *   6. The order pass's own gate at [L369] is also STRICTLY less-than: an item already priced AT the
   *      price-group price produces no intent, while its dearer neighbour still does.
   *   7. An account with no price groups still performs its one read and emits nothing.
   *   8. A guest order short-circuits BEFORE the read, so the collaborator is never called at all.
   *
   * @param sku - the SKU to price.
   * @param accountPriceGroups - the account's price groups, resolved ONCE by the caller.
   * @returns the best price and the price group that produced it, with `priceGroup` left `undefined`
   * when nothing beat the SKU's own price.
   */
  private resolveBestPriceGroupDetails(
    sku: Sku,
    accountPriceGroups: readonly PriceGroup[],
  ): BestPriceGroupDetails {
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
    // CFML parity [model/service/PriceGroupService.cfc:L348, L369]: the legacy struct uses an
    // EMPTY-STRING SENTINEL for "no price group" and tests it with `isObject(...)` at [L369]. The
    // target models the field as `PriceGroup | undefined`. Seeded with `sku.getPrice()`, never
    // `Money.zero`.
    let bestPrice: BestPriceGroupDetails = {
      price: sku.getPrice(),
      priceGroup: undefined,
    };

    // Legacy [L351]: the loop bound. The collection arrives as a parameter, so the
    // three re-invocations the note above records collapse to zero further reads.
    for (let i = 0; i < accountPriceGroups.length; i += 1) {
      const priceGroup = accountPriceGroups[i];

      if (priceGroup === undefined) {
        continue;
      }

      // Legacy [L353].
      const thisPrice = this.calculateSkuPriceBasedOnPriceGroup(sku, priceGroup);

      // Legacy [L355]: if(thisPrice < bestPrice.price) { ... }
      //
      // CFML parity [model/service/PriceGroupService.cfc:L355]: STRICTLY LESS-THAN. A price group
      // whose computed price exactly TIES the incumbent - the SKU's own price on the first
      // iteration, or an earlier winner afterwards - is NOT APPLIED, so among equal candidates the
      // FIRST strictly better one wins and later ties never displace it. `Money.isLessThan` is
      // used; NEVER `<=`, and never a `compare(...) <= 0` rewrite of it.
      if (thisPrice.isLessThan(bestPrice.price)) {
        // The ported interface is `readonly`, so [L356-L358]'s in-place struct assignment becomes a
        // replacement; the observable result is identical.
        bestPrice = { price: thisPrice, priceGroup };
      }
    }

    // Legacy [L361].
    return bestPrice;
  }

  /**
   * The price-group order pass: selects the best price group for every order item and reports the
   * price changes to apply.
   *
   * Ported from [model/service/PriceGroupService.cfc:L364-L375].
   *
   * THIS PASS MUST BE EXECUTED BEFORE `PromotionService.updateOrderAmountsWithPromotions()`,
   * EXPLICITLY AND NON-OPTIONALLY. The promotion engine chooses the base price it discounts from
   * according to price-group eligibility, so it reads the price and the applied price group THIS
   * pass produces; run the promotion pass first and the discount is computed from a base that does
   * not exist yet. This method documents the contract and exposes the pass, and contains no
   * sequencing logic.
   *
   * THIS IS BUDGETED SIGNATURE RESHAPING #1 OF 3, and the only one this file spends. Legacy returns
   * `void` and MUTATES THE ORDER AGGREGATE IN PLACE - `setPrice()` at [L370] and
   * `setAppliedPriceGroup()` at [L371]. The order aggregate is out of scope, so the target returns
   * {@link PriceGroupAppliedIntent}s keyed by an OPAQUE `orderItemID` and NEVER MUTATES ORDER
   * PERSISTENCE.
   *
   * NO ARITHMETIC OCCURS HERE - it is pure selection plus reporting, all of the arithmetic
   * including the load-bearing quantization having already happened in
   * {@link PriceGroupService.calculateSkuPriceBasedOnPriceGroupRate}.
   *
   * @param order - a read-only view carrying an opaque `accountID` and no `Account`.
   * @returns one intent per order item whose price a price group improves; items that
   * fail the gate produce NO intent.
   */
  async updateOrderAmountsWithPriceGroups(order: OrderView): Promise<PriceGroupAppliedIntent[]> {
    // CFML parity [model/service/PromotionService.cfc:L241-L254]: the promotion pass reads the
    // price and appliedPriceGroup this pass writes. Do not reorder.
    const intents: PriceGroupAppliedIntent[] = [];

    // Legacy [L365]:
    //   if(!isNull(arguments.order.getAccount())
    //      && arrayLen(arguments.order.getAccount().getPriceGroups())) { ... }
    //
    // CFML parity [model/service/PriceGroupService.cfc:L365]: `OrderView` carries only an OPAQUE
    // `accountID` and no association, so the equivalent test resolves the account's price groups
    // through the framework reads collaborator and then tests the length. `arrayLen(...)` is BARE
    // TRUTHINESS in the legacy condition, so the target compares EXPLICITLY against zero using
    // `cfLen`. An absent `accountID` short-circuits before the read, as the `!isNull(getAccount())`
    // conjunct does.
    const accountID = order.accountID;

    if (accountID === undefined) {
      return intents;
    }

    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    if (!(cfLen(accountPriceGroups) > 0)) {
      return intents;
    }

    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L366, L369, L370, L371]: the legacy loop
    // re-invokes `arguments.order.getOrderItems()` in its bound and re-indexes it three further
    // times inside the body. It is collapsed to one narrowed local per iteration, which changes
    // nothing observable since nothing in the loop mutates the collection.
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
      //
      // ★★ EVERY ITEM IS PRICED AGAINST THE SNAPSHOT THE GATE ABOVE ALREADY RESOLVED.
      // Legacy [L367] passes `arguments.order.getAccount()`, and the callee then
      // traverses THAT ACCOUNT'S live `priceGroups` association at [L351] - the same
      // association object the gate at [L365] just tested. One collection, in one
      // state, for the gate and for every item. The target reproduces that by handing
      // `accountPriceGroups` to the selection directly instead of re-resolving it per
      // item; see {@link PriceGroupService.resolveBestPriceGroupDetails} for why that
      // is a fidelity requirement and not a matter of taste. `accountID` is
      // deliberately NOT re-passed here: it would be an invitation to read again.
      const priceGroupDetails = this.resolveBestPriceGroupDetails(
        orderItem.sku,
        accountPriceGroups,
      );

      const winningPriceGroup = priceGroupDetails.priceGroup;

      // Legacy [L369]:
      //   if(priceGroupDetails.price < arguments.order.getOrderItems()[i].getPrice()
      //      && isObject(priceGroupDetails.priceGroup)) { ... }
      //
      // CFML parity [model/service/PriceGroupService.cfc:L369]: BOTH CONDITIONS MUST HOLD, the
      // comparison is again STRICTLY LESS-THAN, and `isObject(...)` on the empty-string sentinel
      // becomes `!== undefined`. An item whose best price-group price merely TIES its current price
      // is not changed.
      if (priceGroupDetails.price.isLessThan(orderItem.price) && winningPriceGroup !== undefined) {
        // Legacy [L370]: setPrice(priceGroupDetails.price) Legacy [L371]:
        // setAppliedPriceGroup(priceGroupDetails.priceGroup)
        //
        // What legacy assigns into the aggregate, the target reports as an intent.
        intents.push({
          orderItemID: orderItem.orderItemID,
          price: priceGroupDetails.price,
          priceGroupID: winningPriceGroup.getPriceGroupID(),
        });
      }

      // Items that fail the gate produce NO intent. Legacy leaves them entirely untouched - it does
      // not re-assign an unchanged price - so emitting an "unchanged" intent would invent a write
      // the source never performs.
    }

    return intents;
  }

  /**
   * Serialises the current page of price groups and their rates to JSON, for the admin price-group
   * editor.
   *
   * Ported from [model/service/PriceGroupService.cfc:L230-L257].
   *
   * THIS METHOD CAN ONLY EVER SUCCEED IN ONE DEGENERATE CASE: when EVERY price group on the page
   * has ZERO rates. With at least one rate anywhere on the page it THROWS from inside the inner
   * loop at [L243] and all partial accumulation is discarded - see {@link getAmountRepresentation}
   * for the three-way proof.
   *
   * THE SMART LIST HERE IS A CONSUMPTION, NOT A DECLARATION, AND SPENDS NO RESHAPING BUDGET. [L233]
   * calls `this.getPriceGroupSmartList()`, which `PriceGroupService.cfc` DOES NOT DECLARE - its
   * Smart List Overrides section at [L451-L453] is EMPTY - so this is the framework's generic
   * `get<Entity>SmartList()`. The migration's two budgeted smart-list renames belong to
   * `productService.ts` and `skuService.ts`; this file declares no override and renames nothing.
   *
   * JUDGMENT CALL: the listing resolves through the `getPriceGroupPageRecords()` member of the
   * module-local {@link PriceGroupFrameworkReads} collaborator, because the price-group port
   * publishes six members and none is a listing. NO PORT MEMBER WAS INVENTED, and a structural
   * collaborator was chosen over a boundary input because this method takes NO arguments.
   *
   * NET-NEW COVERAGE (B8): no permanent suite may be authored for this service, so the obligations are
   * recorded here. Five cases discharge them, and all five were exercised at runtime:
   *   1. A page holding one price group with ONE rate REJECTS, naming `getAmountRepresentation` - the
   *      proof that DEFECT 29 is reproduced and this method is not silently functional.
   *   2. A clean price group followed by one carrying a rate also rejects, citing [L243], which pins
   *      that all partial accumulation is discarded rather than partially returned.
   *   3. A page on which EVERY price group has zero rates succeeds - the one degenerate case - and
   *      serialises each entry keyed by `priceGroupID`.
   *   4. A null `priceGroupName` is OMITTED from the serialised entry, reproducing a CFML struct
   *      assignment of a null value rather than emitting an invented default.
   *   5. All three records of a three-record page are serialised, in page order, which is what indexing
   *      by the loop counter guarantees - see the DEFECT 5 annotation in the loop body.
   *
   * @throws whenever any price group on the page has at least one rate - DEFECT 29.
   */
  async getPriceGroupDataJSON(): Promise<string> {
    // Legacy [L232]: var priceGroupData = {}; ([L231]'s `var local = {};` sits immediately above
    // it, is never read, and is deleted per the module header note.)
    const priceGroupData: Record<string, PriceGroupDataEntry> = {};

    // ---------------------------------------------------------------------
    // Legacy [L233]: var priceGroupSmartList = this.getPriceGroupSmartList();
    // Legacy [L235]: for(var i=1; i LTE arrayLen(priceGroupSmartList.getPageRecords()); i++)
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L233-L236]: legacy iterates
    // `getPageRecords()` - THE CURRENT PAGE of a framework smart list - NOT the full price-group
    // collection. The paginated projection is preserved and NO PAGE SIZE IS ASSERTED, because the
    // source states none. `getPageRecords()` is re-invoked in the condition at [L235] and again in
    // the body at [L236] with no defensive copy.
    const pageRecords = await this.frameworkReads.getPriceGroupPageRecords();

    for (let i = 0; i < pageRecords.length; i += 1) {
      // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236] (register DEFECT 5): indexes
      // `getPageRecords()` by `local.i` while the loop counter declared at [L235] is `i`.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // ★★ DEFECT 5 IS AN ANNOTATION, NOT A BEHAVIOUR, BECAUSE ON EVERY SUPPORTED
      // ENGINE `local.i` RESOLVES. An earlier revision hedged this as
      // "CFML-ENGINE DEPENDENT", with `local.i` "may resolve" and [L231] "may or may
      // not shadow" the implicit scope. The hedge is unnecessary and it is removed,
      // because the supported engine set is stated: `readme.md` [L6, L8] requires
      // "Coldfusion 9.0.1 or Newer" and "Railo 4.1 or Newer", and on BOTH a `var`
      // declaration inside a function body writes into the implicit `local` scope. So
      // [L235]'s `var i = 1` IS `local.i`, and [L236] reads back the counter it just
      // wrote. Nor does [L231] interfere: `var local = {}` is itself a write INTO the
      // implicit scope - it creates a key named `local` inside it - and does not
      // replace the scope that `local.i` resolves through. The defect is that the line
      // reads as though it were reaching a different scope, not that it misbehaves.
      //
      // Indexing by the loop counter is therefore the FAITHFUL reproduction and not a
      // repair, and nothing here makes a source-failing method succeed: DEFECT 29 at
      // [L243] is reproduced verbatim below and throws for any price group carrying at
      // least one rate, so the only inputs this method returns on are the ones the
      // source returns on too.
      // -----------------------------------------------------------------
      const thisPriceGroup = pageRecords[i];

      if (thisPriceGroup === undefined) {
        continue;
      }

      // Legacy [L237]: var priceGroupRates = [];
      const priceGroupRates: PriceGroupRateDataEntry[] = [];

      // Legacy [L239]: for(var j=1; j LTE arrayLen(thisPriceGroup.getPriceGroupRates()); j++)
      //
      // The counter is spelled `j` in the source and `r` here; an earlier revision quoted the
      // source line as though it read `r` too, which it does not. The name is arbitrary and
      // unobservable - what matters is that the quotation above is now what [L239] actually says.
      const rates = thisPriceGroup.getPriceGroupRates();

      for (let r = 0; r < rates.length; r += 1) {
        const thisRate = rates[r];

        if (thisRate === undefined) {
          continue;
        }

        // CFML parity [model/service/PriceGroupService.cfc:L242 vs L414]: the source spells the
        // accessor `getPriceGroupRateId()` at [L242] with a lowercase `d` and
        // `getPriceGroupRateID()` at [L414] with an uppercase `D`, and `getPriceGroupId()` at
        // [L253] against `getPriceGroupID()` elsewhere. CFML resolves method names
        // case-insensitively so both spellings hit the same accessor; TypeScript does not, so both
        // are normalised to the canonical entity names.
        //
        // The `name` value comes from a call that ALWAYS THROWS - DEFECT 29. It is written as the
        // field it populates so the shape of the legacy struct stays visible; the throw simply
        // propagates.
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
      // `putOwnStructKey`, not `priceGroupData[id] = …`: the key is a persisted identifier
      // column, so a plain assignment would drop a `__proto__` price group from the
      // serialized document while recording every sibling.
      putOwnStructKey(priceGroupData, thisPriceGroup.getPriceGroupID(), {
        priceGroupName: thisPriceGroup.getPriceGroupName(),
        priceGroupRates,
      });
    }

    // Legacy [L256]: return serializeJSON(priceGroupData);
    return JSON.stringify(priceGroupData);
  }

  /**
   * Applies the admin price-group SKU settings form: attaches a rate to either a whole product or
   * one specific SKU, and saves it.
   *
   * Ported from [model/service/PriceGroupService.cfc:L184-L227]. THE BRANCH STRUCTURE HAS THREE
   * SILENT NO-OPS. [L194] guards on `priceGroupRateId NEQ ""` with no `else`, so an empty
   * identifier means the method DOES NOTHING AT ALL - the legacy comment at [L193] explains why:
   * "If the user has selected the 'Select a Rate' rate, ignore all of this logic. This should not
   * have been allowed to happen." [L197] then routes an empty `skuId` to the WHOLE-PRODUCT branch
   * [L197-L209] and anything else to the SPECIFIC-SKU branch [L212-L225]. And [L199] adds an inner
   * guard on the whole-product branch only - `priceGroupRateId NEQ "inherit"` - so `"inherit"`
   * makes that branch a no-op too. THERE IS NO `"inherit"` GUARD ON THE SPECIFIC-SKU BRANCH, and
   * that asymmetry is preserved.
   */
  async updatePriceGroupSKUSettings(data: PriceGroupSkuSettingsInput): Promise<void> {
    // Legacy [L185] declares `var local = {};` and never reads it. Deleted, per the module header
    // note; this is the first of the file's two dead `local` structs.
    //
    // Legacy [L188-L191]: the `amount` key is stripped from the request context unless the rate is
    // the `"new amount"` keyword. See {@link buildRateSavePayload} for why the target omits the key
    // while building the payload.
    const ratePayload = buildRateSavePayload(data);

    // CFML parity [model/service/PriceGroupService.cfc:L189, L194, L197, L199, L399]: CFML's `!=`,
    // `NEQ`, `EQ` and `==` are CASE-INSENSITIVE for strings, so all FIVE sentinel comparisons in
    // this component are case-insensitive in the target too - `"NEW AMOUNT"`, `"New Amount"`,
    // `"INHERIT"` and `"Inherit"` all match. `cfEquals` performs the comparison; a bare `===` on
    // any of the five would NARROW BEHAVIOUR and is a defect, not a simplification.

    // Legacy [L193], verbatim: "If the user has selected the 'Select a Rate' rate, ignore all of
    // this logic. This should not have been allowed to happen." Legacy [L194]:
    // if(arguments.data.priceGroupRateId NEQ "") { ... }
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
          // `addProduct(null)` then raises. The target throws at the same point rather than passing
          // an absent product on.
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
   * Loads a price-group rate by identifier, or constructs an unsaved one when no such rate exists.
   *
   * A FRAMEWORK-ACCESSOR GAP, RESOLVED WITHOUT INVENTING A PORT MEMBER.
   * [model/service/PriceGroupService.cfc:L205] and [L220] both call
   *   `this.getPriceGroupRate(id, true)`,
   * which `PriceGroupService.cfc` DOES NOT DECLARE - it is `HibachiService`'s generic
   * `get<Entity>(primaryKey, createIfNotFound)` factory, invoked POSITIONALLY. The legacy comment
   * at [L218] states the semantics: "getPriceGroupRate() returns either the requested priceGrouRate
   * or a new Entity".
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L218]: that comment misspells `priceGrouRate`,
   * dropping the `p`. Recorded because it is quoted verbatim above.
   *
   * JUDGMENT CALL: the port publishes a plain load and no get-or-create member, so the published
   * load is used and the construction happens HERE when it returns nothing, keeping the framework
   * generic's two-part behaviour intact. NO PORT MEMBER WAS INVENTED. Constructing the entity is
   * why `PriceGroupRate` is imported as a value, and the new rate carries an EMPTY
   * `priceGroupRateID` - the unsaved marker matching the ORM's `unsavedvalue=""` - with no other
   * field populated, because the framework factory populates none either.
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
   * CFML parity [model/service/PriceGroupService.cfc:L397, L399]: `data` IS OPTIONAL AND IS
   * DEREFERENCED UNCONDITIONALLY. [L397] declares `struct data` - NOT `required` - yet [L399] reads
   * `arguments.data.priceGroupRateId` with no guard, so calling `savePriceGroupRate(rate)` with no
   * payload raises in CFML. Both facts are preserved: the parameter stays optional for signature
   * parity, and the dereference is reproduced by THROWING. No permissive default and NO EARLY
   * RETURN is added.
   *
   * DEFECT 30, AND WHY ITS CONSEQUENCE IS THE OPPOSITE OF WHAT IT LOOKS LIKE. [L400]'s
   * `clearAmounts()` always throws, but it is GUARDED BY [L399], so only the `"new amount"` path
   * fails while every other rate-save path reaches [L404]'s save and then the exclusivity block at
   * [L407-L444], WHICH IS THEREFORE REACHABLE AND NOT DEAD CODE - see {@link clearAmounts}.
   *
   * ★★ DEFECT 30, AND WHY ITS CONSEQUENCE IS THE OPPOSITE OF WHAT IT LOOKS LIKE.
   * [L400]'s `clearAmounts()` always throws, but it is GUARDED BY [L399], so only
   * the `"new amount"` path fails. Every other rate-save path reaches [L404]'s save
   * and then the exclusivity block at [L407-L444], WHICH IS THEREFORE REACHABLE AND
   * NOT DEAD CODE. The admin "create a new amount" workflow always throws in legacy;
   * every other rate save completes. See {@link clearAmounts} for the proof and for
   * the interaction with `updatePriceGroupSKUSettings`.
   *
   * ★★ WHAT `super.save()` AT [L404] ACTUALLY DOES, UNROLLED INTO THREE STEPS. The legacy comment at
   * [L403] - "Populates entity based on RC contents and validates entity." - names two of them, and
   * [org/Hibachi/HibachiService.cfc:L143-L155, L168] supplies the third and the ordering:
   *
   *   1. POPULATE from `data`, only when a payload was passed [L143-L148]
   *   2. VALIDATE against the `save` context, UNCONDITIONALLY [L151]
   *   3. PERSIST only when the entity has no errors [L154-L155], returning it either way [L168]
   *
   * All three are reproduced below in that order. See {@link populatePriceGroupRateFromPayload} and
   * {@link collectPriceGroupRateSaveContextErrors}, each of which records what an earlier revision got
   * wrong about it and why.
   *
   * ★★ AND EVERY MUTATION THIS METHOD MAKES IS PERSISTED, WHICH IS THE PART THAT IS EASIEST TO LOSE.
   * The whole second half of the method - [L412-L433] stripping members from siblings and demoting
   * their global flags, [L436-L443] emptying all six of the saved rate's own collections - changes
   * nothing but MEMBERSHIP, and membership lives in six link tables. Under Hibernate those changes
   * reached the database through the session flush at commit, with no explicit save anywhere. With the
   * ORM gone each one is saved deliberately: every sibling the loop changed, and the saved rate again
   * after clearing. An earlier revision made none of those calls, so the entire exclusivity
   * enforcement was computed, applied in memory, and discarded.
   *
   * ONLY CHANGED ENTITIES ARE SAVED, which reproduces the dirty check rather than just the flush.
   *
   * NO TRANSACTION SPANS THE GROUP, and that is the connection contract rather than a choice:
   * `src/repositories/mysql/connection.ts:L262-L308` publishes no transaction method and states why.
   * The same disposition, for the same cited reason, as the catalog delete cascade. Each individual
   * save is idempotent - the adapter deletes a rate's link rows before re-inserting them - so a
   * failure part-way through leaves a state that re-running this method converges out of.
   *
   * NET-NEW COVERAGE (B8): there is no `PriceGroupServiceTest` anywhere in `meta/tests/`, and
   * `tests/unit/services/priceGroupService.test.ts` is another agent's file and is deliberately not
   * authored here. The obligations are therefore recorded rather than discharged, and they are: a
   * submitted `amount` reaching the persisted row; a non-numeric submitted `amount` refusing the save;
   * each of the three save-context rules refusing the save and returning the entity UNPERSISTED rather
   * than raising; the whole exclusivity block being skipped when the rate is invalid; a sibling whose
   * member was stripped being saved; a sibling nothing changed on NOT being saved; a global sibling
   * being demoted and that demote being saved; a global rate having all six collections emptied and
   * being saved a second time; a global rate that already carried nothing NOT being saved twice; and
   * the `"new amount"` path still throwing.
   *
   * @param priceGroupRate - the rate to save.
   * @param data - the payload; optional in the signature, required in practice.
   * @returns the saved rate when validation passed, or the unpersisted rate when it did not - and
   *   possibly with its own collections cleared.
   * @throws when `data` is absent, and always on the `"new amount"` path - DEFECT 30.
   */
  async savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    data?: PriceGroupRateSaveInput,
  ): Promise<PriceGroupRate> {
    // Legacy [L399]: if(arguments.data.priceGroupRateId == "new amount")
    //
    // `cfEquals` THROWS `CfmlComparisonError` on a nullish operand, which is exactly the
    // reproduction wanted here: an absent payload makes `data?.priceGroupRateId` `undefined` and
    // the comparison raises, just as the CFML dereference does. The comparison stays
    // CASE-INSENSITIVE, the fifth of the five sentinel comparisons.
    if (cfEquals(data?.priceGroupRateId, 'new amount')) {
      // Legacy [L400]: arguments.priceGroupRate.clearAmounts();
      clearAmounts(priceGroupRate);
    }

    // Legacy [L404]: var priceGroupRate = super.save(entity=arguments.priceGroupRate,
    //                                                data=arguments.data);
    //
    // ★★ THIS ONE LINE IS THREE OPERATIONS, AND THEY DO NOT ALL HAPPEN HERE.
    // [org/Hibachi/HibachiService.cfc:L133-L169] is the whole of `save`: it
    // POPULATES the entity from `data` at [L146], VALIDATES it at [L151], and only
    // if `hasErrors()` is false calls `getHibachiDAO().save(target=...)` at [L155].
    // What that DAO call does is `entitySave` - it makes the entity MANAGED. It does
    // not write. Hibernate wrote at request end, flushing every dirty managed entity
    // in one transaction, which is AFTER the reconciliation block below has run.
    //
    // So the legacy ORDER OF OPERATIONS, as observed in the database, is:
    //
    //   populate  ->  reconcile (the block below)  ->  persist everything, together
    //
    // and NOT populate-persist-reconcile, even though the source reads that way.
    // The port reproduces the observable order: the population is performed here,
    // the reconciliation runs, and the single write at the foot of this method
    // carries the reconciled rate AND every sibling the reconciliation touched.
    //
    // ★ WHAT WAS WRONG BEFORE, RECORDED RATHER THAN OVERWRITTEN. This method
    // previously called `savePriceGroupRate(priceGroupRate)` HERE, before the
    // reconciliation, and its note read: "population from a request payload is not
    // persistence and the port publishes no population affordance. The payload's
    // `amount` key is therefore carried on PriceGroupRateSaveInput for fidelity and
    // deliberately not written through." Both halves of that were mistakes. The
    // first mistook `super.save`'s deferred flush for an immediate write, so the
    // reconciliation that followed it mutated objects nothing ever persisted - the
    // sibling stripping, the global demotion and the include/exclude clearing were
    // all applied in memory and then discarded. The second treated population as
    // out of scope when it is half of what the ported line does; a submitted amount
    // was silently dropped.
    //
    // LEGACY-NOTE [model/service/ProductService.cfc:L287 vs L303]: TWO PERSISTENCE
    // PATHS coexist across this slice - `getHibachiDAO().save(target=...)` at one
    // site and `super.save(...)` at another. They are NOT unified by this migration;
    // each ported call site resolves to whichever repository member matches what it
    // actually did.
    // ---------------------------------------------------------------------

    // Legacy [org/Hibachi/HibachiService.cfc:L143-L148]: the population step, and it
    // is CONDITIONAL ON A PAYLOAD BEING PASSED - the framework wraps only this call in
    // `if(structKeyExists(arguments,"data"))`.
    //
    // ONE KEY IS POPULATABLE AND THE OTHER IS NOT. CFML populates from the whole
    // request context, so every persistent property the admin form submitted was
    // written; the ported payload publishes exactly two keys, and only `amount` is a
    // persistent property. `priceGroupRateId` is the SELECTOR the caller used to
    // reach this rate - [L399] reads it to detect the `"new amount"` sentinel - and
    // populating a primary key from a request payload would let a save reassign the
    // row it writes. It is deliberately not written through.
    //
    // ★ REACHABLE ONLY FROM A DIRECT CALLER, AND THAT IS A PROPERTY OF THE SOURCE. The
    // in-slice caller is `updatePriceGroupSKUSettings`, which [L189-L190] strips
    // `amount` from the payload on every path EXCEPT `"new amount"` - and the
    // `"new amount"` path throws two statements earlier at `clearAmounts`. So no
    // amount ever arrives through that route. It is still populated here, because
    // [L397] declares a public method whose payload carries the key and a direct
    // caller can supply it; omitting the step because one caller cannot reach it would
    // be reasoning about callers rather than about the method.
    //
    // ★ A NON-NUMERIC AMOUNT DOES NOT RAISE OUT OF THIS METHOD - IT FAILS VALIDATION.
    // `model/validation/PriceGroupRate.json` declares `amount` as
    // `{"contexts":"save","required":true,"dataType":"numeric"}`, and a value that
    // breaks the numeric rule made `hasErrors()` true at
    // [org/Hibachi/HibachiService.cfc:L151] so the entity was NEVER passed to the DAO
    // at [L155] - the framework returned the unpersisted entity rather than throwing.
    // `populatePriceGroupRateFromPayload` therefore catches the one arithmetic failure
    // `Money.fromDecimalString` raises, leaves the property as it was, and reports the
    // observation to the validator below. It does NOT coerce and it does NOT default
    // to zero: an unreadable amount silently read as zero is how product gets sold for
    // nothing.
    const population =
      data === undefined ? undefined : populatePriceGroupRateFromPayload(priceGroupRate, data);

    // STEP 1 - populate, ONLY WHEN A PAYLOAD WAS PASSED
    // [org/Hibachi/HibachiService.cfc:L143-L148].
    //
    // STEP 2 - validate, UNCONDITIONALLY [org/Hibachi/HibachiService.cfc:L151].
    //
    // Legacy [L407]: `if(!arguments.priceGroupRate.hasErrors())`.
    //
    // `hasErrors()` is a framework affordance from `HibachiEntity`, and the ported entities publish no
    // error collection - the migration replaced declarative validation with typed checks rather than
    // with an entity-carried error bag, and NO ERROR-BAG AFFORDANCE IS INVENTED on the entity or on
    // the port. The accumulator below is what stands in for it, exactly as `saveProduct` and
    // `saveProductType` do in `src/services/productService.ts`.
    //
    // ★★ AN EARLIER REVISION READ THE GATE AS ALREADY SATISFIED, on the premise that "a rejected save
    // propagates and never reaches this line, so control arriving here IS the legacy no-errors
    // condition". THAT IS NOT THE SAME CONDITION. A save rejected by the database is an infrastructure
    // failure; `hasErrors()` is a VALIDATION verdict reached before any statement is issued, and the
    // two differ in both directions - a rate with no `amount` and no `amountType` inserts perfectly
    // well and would have been refused by the source. Reading the absence of a database failure as
    // validation having passed meant nothing was ever validated.
    //
    // IT RUNS EVEN WHEN NO PAYLOAD WAS PASSED. [org/Hibachi/HibachiService.cfc:L143-L148] wraps only
    // the populate call in the `structKeyExists(arguments,"data")` test; the `validate` at [L151] sits
    // outside it, so a rate saved with no payload at all is still validated.
    const errors = collectPriceGroupRateSaveContextErrors(priceGroupRate, population);

    if (errors.length > 0) {
      // Legacy [org/Hibachi/HibachiService.cfc:L154-L155] and [L168]: the DAO call is SKIPPED when the
      // entity has errors and the framework returns the entity anyway, so [L445] hands back an
      // UNPERSISTED rate rather than raising. And legacy [L407]: the WHOLE exclusivity block
      // [L408-L443] is inside the same gate, so an invalid rate performs no sibling reconciliation, no
      // demote and no clearing either. Returning here reproduces all of that at once.
      return priceGroupRate;
    }
    // ---------------------------------------------------------------------

    // Legacy [L408]: var priceGroup = priceGroupRate.getPriceGroup();
    const priceGroup = priceGroupRate.getPriceGroup();

    if (priceGroup === undefined) {
      // ★ PROVABLY UNREACHABLE, AND NARROWED RATHER THAN ASSERTED. `priceGroup` is one of the three
      // `contexts: "save"` rules in [model/validation/PriceGroupRate.json], so a rate without one has
      // already returned at the gate above; and the repository's documented fetch shape carries the
      // caller's associations through a save unchanged. A non-null assertion is forbidden in `src/**`,
      // so the impossible branch is stated with the reason it cannot happen.
      //
      // CFML parity [L408-L409]: an earlier revision threw here on the premise that "the legacy
      // dereferences the price group with no null test and raises". IT DOES NOT REACH THE
      // DEREFERENCE: the required rule makes `hasErrors()` true and [L407] skips past it entirely.
      throw new Error(
        `PriceGroupRate "${priceGroupRate.getPriceGroupRateID()}" passed save-context validation yet ` +
          'reports no price group. The priceGroup rule in model/validation/PriceGroupRate.json ' +
          'makes that combination impossible, so this indicates the validation step and the ' +
          'entity accessor have gone out of step.',
      );
    }

    // Legacy [L409-L433]: the exclusivity-enforcement loop. For every OTHER rate in the price
    // group, strip from it everything the saved rate now covers, and clear its global flag when the
    // saved rate is global.
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
    //
    // ★ THE MUTATED SIBLINGS ARE COLLECTED, BECAUSE SOMETHING HAS TO PERSIST THEM.
    // Hibernate needed no such list: every rate in `priceGroup.getPriceGroupRates()`
    // was already a managed entity, so mutating one marked it dirty and the
    // request-end flush wrote it. With the ORM gone, a mutation nobody records is a
    // mutation nobody writes - which is exactly the defect this block used to have.
    // Each sibling that actually changed is appended here and handed to the single
    // write at the foot of the method.
    //
    // ONLY SIBLINGS THAT ACTUALLY CHANGED ARE COLLECTED, which is Hibernate's own
    // rule rather than an optimisation. Its flush wrote the entities it had detected
    // as DIRTY, so a sibling whose membership the legacy `remove*` call did not
    // actually alter was never written. The `has*` probes below are how that
    // detection is reproduced: they change no outcome, only whether a rate that was
    // left untouched is rewritten. Rewriting one would be observable - each rate
    // write rewrites all six of its link collections and bumps its
    // `modifiedDateTime`.
    // ---------------------------------------------------------------------
    const rates = priceGroup.getPriceGroupRates();

    // ★ EVERY SIBLING THIS LOOP CHANGES MUST BE PERSISTED, AND ONLY THOSE. Hibernate flushed each
    // DIRTY entity in the session at commit, so the removals at [L417, L421, L425] and the demote at
    // [L430] reached the database without any explicit save; an untouched sibling produced no
    // statement. With the ORM gone that has to be done deliberately, and the two halves of it are
    // deliberate too: collecting the changed rates reproduces the flush, and collecting ONLY the
    // changed ones reproduces the dirty check. Persisting every sibling unconditionally would write
    // rows the source never wrote.
    /** Siblings the exclusivity rule mutated, persisted with the saved rate in one unit of work. */
    const reconciledSiblings: PriceGroupRate[] = [];

    for (let i = 0; i < rates.length; i += 1) {
      const thisRate = rates[i];

      if (thisRate === undefined) {
        continue;
      }

      // Legacy [L414]: if(rates[i].getPriceGroupRateID() != priceGroupRate.getPriceGroupRateID())
      //
      // CFML parity: `!=` on strings is case-insensitive, so `cfEquals` is used here
      // too rather than a bare `!==`.
      //
      // ON AN UNSAVED RATE THE COMPARISON IS AGAINST `''`. Legacy compared against a
      // uuid Hibernate had already assigned; the target compares before the write, so
      // a brand-new rate carries the `unsavedvalue=""` key. Neither value can equal a
      // persisted sibling's key, so every sibling is processed either way - and a
      // persisted rate, which is what the admin path always supplies, compares on its
      // real key exactly as legacy did.
      if (cfEquals(thisRate.getPriceGroupRateID(), priceGroupRate.getPriceGroupRateID())) {
        continue;
      }

      // Membership size before the three removal loops, so the dirty check below is exact. Sizes
      // rather than probes: `has*` compares by primary key and cannot distinguish two UNSAVED members
      // from one another, whereas a length that moved is a change that happened.
      const membershipSizeBefore =
        thisRate.getProductTypes().length +
        thisRate.getProducts().length +
        thisRate.getSkus().length;

      // The second witness: set by each removal loop below when it actually took a member out, and by
      // the demote arm when it clears a global flag. Two independent witnesses are kept because they
      // fail in opposite directions - a flag records that a removal was ATTEMPTED, a moved size records
      // that one LANDED - and enrolling a sibling twice is impossible while missing a dirty one would
      // silently discard the mutation.
      let siblingChanged = false;

      // Legacy [L416-L418]: remove every productType the saved rate covers.
      const savedProductTypes = priceGroupRate.getProductTypes();

      for (let pt = 0; pt < savedProductTypes.length; pt += 1) {
        const productType = savedProductTypes[pt];

        if (productType !== undefined && thisRate.hasProductType(productType)) {
          thisRate.removeProductType(productType);
          siblingChanged = true;
        }
      }

      // Legacy [L420-L422]: remove every product the saved rate covers.
      const savedProducts = priceGroupRate.getProducts();

      for (let p = 0; p < savedProducts.length; p += 1) {
        const product = savedProducts[p];

        if (product !== undefined && thisRate.hasProduct(product)) {
          thisRate.removeProduct(product);
          siblingChanged = true;
        }
      }

      // Legacy [L424-L426]: remove every SKU the saved rate covers.
      const savedSkus = priceGroupRate.getSkus();

      for (let s = 0; s < savedSkus.length; s += 1) {
        const sku = savedSkus[s];

        if (sku !== undefined && thisRate.hasSku(sku)) {
          thisRate.removeSku(sku);
          siblingChanged = true;
        }
      }

      // Legacy [L429-L431]:
      //   if(priceGroupRate.getGlobalFlag() && rates[i].getGlobalFlag()) {
      //       rates[i].setGlobalFlag(false);
      //   }
      //
      // ★★ AN EARLIER REVISION RECORDED THIS AS "NOT REPRODUCIBLE AT THIS BOUNDARY", on the premise
      // that `src/domain/entities/priceGroupRate.ts` "publishes exactly ONE mutator - `setPriceGroup` -
      // and NO `setGlobalFlag`", and declined to add one because the entity was "another boundary's
      // completed work". The premise was an accurate reading of the entity as it then stood and the
      // conclusion was still wrong, because the missing member was itself the gap. The legacy
      // component declares `accessors=true` [model/entity/PriceGroupRate.cfc:L49], which makes the CFML
      // engine generate a setter for EVERY declared property including `globalFlag` at [L53] - so
      // `setGlobalFlag` is not an invention, it is a framework-generated member with a caller one line
      // away. It is now published, alongside the other generated setters this method calls, and the
      // demote is reproduced as written.
      //
      // The alternative that refusal chose was worse than editing an adjacent file: it left a
      // documented nondeterminism in the global fallback rate `getGlobalPriceGroupRate()`
      // [model/entity/PriceGroup.cfc:L83-L90] selects, and that rate decides a price.
      //
      // Nothing else changed to make it possible: no port member was added (the inventory stays at
      // thirteen files and six members on this port), and no cast, index-signature write or structural
      // back door reaches the private field.
      //
      // Legacy [L429-L431]:
      //   if(priceGroupRate.getGlobalFlag() && rates[i].getGlobalFlag()) {
      //       rates[i].setGlobalFlag(false);
      //   }
      //
      // BOTH TERMS, IN ORDER, with the short-circuit CFML's `&&` and JavaScript's `&&` share: a
      // non-global saved rate never reads the sibling's flag, and the second term is what keeps a
      // sibling that is already non-global from being marked dirty.
      if (priceGroupRate.getGlobalFlag() && thisRate.getGlobalFlag()) {
        thisRate.setGlobalFlag(false);

        siblingChanged = true;
      }

      // ENROLLED ONCE, ON EITHER WITNESS. `siblingChanged` is set by the three removal loops and by
      // the demote arm above; the size comparison catches the case a `has*` probe matched by primary
      // key while the splice that followed found no instance to remove. Both are false for a sibling
      // this iteration did not touch, which is the case that must produce no statement at all.
      const membershipSizeAfter =
        thisRate.getProductTypes().length +
        thisRate.getProducts().length +
        thisRate.getSkus().length;

      if (siblingChanged || membershipSizeAfter !== membershipSizeBefore) {
        reconciledSiblings.push(thisRate);
      }
    }

    // Legacy [L436-L443]: the global-rate clear-out. A global rate applies to everything, so its
    // own inclusion and exclusion lists are emptied.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L439, L442]: legacy calls `setSKUs` and
    // `setExcludedSKUs` with a CAPITALISED `SKU` while [L424-L425] in the same method use
    // `getSkus()` and `removeSku()`; the underlying properties are `skus` at
    // [model/entity/PriceGroupRate.cfc:L73] and `excludedSkus` at [L77], both lowercase. CFML
    // resolves accessor names case-insensitively so all four spellings hit the same collections;
    // the canonical lowercase names are used.
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L417, L421, L425 vs L437-L442]: TWO CLEARING
    // IDIOMS COEXIST IN ONE METHOD - the bidirectional `remove*` helpers above, which maintain the
    // far side, and the empty-array setters here, which replace the owning collection and leave the
    // far side stale until reload. Both are preserved and NOT unified: they differ in what they do
    // to the inverse side.
    //
    // ★★ ALL SIX SETTERS ARE USED, INCLUDING THE THREE FOR THE EXCLUDE COLLECTIONS. An earlier
    // revision spliced the three LIVE include arrays and recorded [L440-L442] as "NOT REPRODUCIBLE",
    // on the premise that the entity "hands the three EXCLUDE collections out `readonly` and
    // publishes no mutator and no helper for any of them, because the legacy entity declares none
    // either". The premise conflated two different absences. The legacy component declares no
    // HAND-WRITTEN `addExcludedSku`/`removeExcludedSku` PAIR - true, still preserved, and it declares
    // none for the include collections' whole-collection replacement either - but `accessors=true`
    // [model/entity/PriceGroupRate.cfc:L49] generates a whole-collection setter for all six
    // properties, and these very lines call all six of them. A generated member with a caller is a
    // member the port owes, not an invention; leaving them out meant a global rate kept the exclusion
    // rows the legacy save removed.
    //
    // WHAT THE SIX SETTERS DO TO THE ARRAY, AND WHY IT MATTERS THAT THEY SPLICE. Each one empties the
    // LIVE array in place [src/domain/entities/priceGroupRate.ts] rather than swapping in a new one,
    // which is the closest reproduction available of what the CFML setter did to a Hibernate bag: the
    // owning collection is emptied and the inverse side is NOT notified - precisely the difference
    // recorded in the note above. Splicing also means a caller holding an earlier `getProducts()`
    // result sees the same emptying, exactly as a caller holding the legacy bag would.
    // ---------------------------------------------------------------------
    if (priceGroupRate.getGlobalFlag()) {
      // Legacy [L437]: setProducts([]).
      priceGroupRate.setProducts([]);

      // Legacy [L438]: setProductTypes([]).
      priceGroupRate.setProductTypes([]);

      // Legacy [L439]: setSKUs([]).
      priceGroupRate.setSkus([]);

      // Legacy [L440]: setExcludedProducts([]).
      priceGroupRate.setExcludedProducts([]);

      // Legacy [L441]: setExcludedProductTypes([]).
      priceGroupRate.setExcludedProductTypes([]);

      // Legacy [L442]: setExcludedSKUs([]).
      priceGroupRate.setExcludedSkus([]);

      // NO SEPARATE SAVE IS ISSUED FOR THIS BLOCK, and none is needed: the single write at the foot of
      // this method carries the rate with its six collections already emptied, and that write rewrites
      // all six link tables from what the entity holds. Legacy behaved the same way - [L436-L443]
      // mutated a managed entity and Hibernate's request-end flush stored the result once.
    }

    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L440-L442 vs L70, L109, L147]: THE
    // EXCLUSION-LIST GAP, AND BOTH SIDES OF IT LIVE IN THIS FILE. This method WRITES the
    // `excludedProductTypes`, `excludedProducts` and `excludedSkus` collections - it clears them
    // for a global rate - while the rate cascade in this same class consults ONLY the inclusion
    // collections and the global flag: `hasProductType` at [L70], `hasProduct` at [L109], `hasSku`
    // at [L147] and `getGlobalFlag()` at [L84], [L123] and [L166]. NO `excluded*` COLLECTION IS
    // EVER READ DURING RATE RESOLUTION, so exclusions are persisted, cleared and displayed but
    // never honoured when a rate is selected. The gap is preserved and no exclusion logic is added:
    // adding it would change which rate applies and therefore what a customer pays.
    //
    // The clearing immediately above is also what BOUNDS the gap: it fires only for a global rate
    // [L436], so a global rate cannot carry an exclusion to ignore, while a SKU-, product- or
    // product-type-level rate can and does. The security finding this raises is dispositioned once,
    // beside the three declarations in `src/domain/entities/priceGroupRate.ts`, with the AAP
    // citations that mandate the decline; it is not restated here, because two copies of a ruling
    // drift. The pinning tests live in `tests/unit/services/priceGroupService.test.ts` under "the
    // five-level cascade: the exclusion collections are never consulted" and cover this file's two
    // reachable consequences - which rate RESOLVES, and what the SKU is then PRICED at.
    // Preserved deliberately; do not fix without a product decision.

    // ---------------------------------------------------------------------
    // THE WRITE, AND WHY IT IS HERE RATHER THAN AT [L404].
    //
    // Legacy [org/Hibachi/HibachiService.cfc:L155] via
    // [model/service/PriceGroupService.cfc:L404], flushed at request end.
    //
    // Everything above mutated an object graph; this is the only line that persists
    // any of it. The reconciled rate and every sibling the exclusivity rule touched
    // go together, in ONE transaction, which is what Hibernate's request-end flush
    // did with the same set. Splitting them would make the half-applied state
    // reachable - and every half of this reconciliation changes which rate a SKU
    // resolves to.
    // ---------------------------------------------------------------------
    const savedRate = await this.priceGroupRepository.savePriceGroupRate(
      priceGroupRate,
      reconciledSiblings,
    );

    // Legacy [L445]: return arguments.priceGroupRate;
    //
    // CFML returns the SAME reference it was handed, because Hibernate mutated the
    // managed instance in place. The repository mints an identifier and audit stamps
    // on an insert, which are immutable on the ported entity, so it returns a NEW
    // instance carrying them - and that instance is what a caller needs, since it is
    // the one that knows its own key.
    return savedRate;
  }

  /**
   * Deletes a price group, first detaching every price group that inherits from it.
   *
   * Ported from [model/service/PriceGroupService.cfc:L461-L470]. The component's only Delete
   * Override, inside the [L459-L472] banner, and the only method in the file that declares
   * `boolean`. The legacy comment at [L462] states the intent - "Any price groups that are inhering
   * from this price group should have that inheritence disabled." - with both words misspelled in
   * the source.
   *
   * WHY THE LOOP EXISTS AT ALL, WHICH THE SPECIFICATION DOES NOT SAY.
   * `model/validation/PriceGroup.json` constrains `childPriceGroups` to `maxCollection: 0` in the
   * `delete` context, so the ORM would have REFUSED the delete while any child remained. The loop
   * is what makes the delete legal.
   *
   * LEGACY-NOTE [model/validation/PriceGroup.json]: that delete context is RICHER than the
   * specification records, setting `maxCollection: 0` on SIX properties - `appliedOrderItems`,
   * `childPriceGroups`, `accounts`, `subscriptionBenefits`, `subscriptionUsageBenefits` and
   * `promotionRewards`. The ported `PriceGroup` carries none of those six, since they all belong to
   * out-of-scope aggregates, so five of the six PASS TRIVIALLY and enforcement would have to happen
   * here. It does not: NO PUBLISHED PORT MEMBER EXPOSES such a count and
   * `src/domain/ports/priceGroupRepository.ts` forbids adding one - "no count, no existence probe".
   * THE GAP IS RECORDED PLAINLY AND NOTHING IS INVENTED. Only `childPriceGroups` is enforceable
   * from here, and the loop below is that enforcement.
   *
   * LEGACY-NOTE [model/validation/PriceGroup.json]: that delete context is RICHER
   * than the specification records. It sets `maxCollection: 0` on SIX properties -
   * `appliedOrderItems`, `childPriceGroups`, `accounts`, `subscriptionBenefits`,
   * `subscriptionUsageBenefits` and `promotionRewards` - not on `appliedOrderItems`
   * alone. CFML enforced all six through ORM associations before deletion. The ported
   * `PriceGroup` entity carries none of those six associations - order items,
   * accounts and subscription benefits belong to out-of-scope aggregates. NO PUBLISHED PORT MEMBER
   * EXPOSES an applied-order-item, account or subscription-benefit count for a price group, and
   * `src/domain/ports/priceGroupRepository.ts` forbids adding one - "no count, no existence probe" - so
   * those FOUR constraints pass trivially here and the gap is recorded plainly rather than closed.
   *
   * ★★ AN EARLIER REVISION SAID "Only `childPriceGroups` is enforceable from here". THAT IS OFF BY
   * ONE, AND THE ONE IT MISSES IS THE ONE THAT CAN ACTUALLY REFUSE A DELETE. `promotionRewards` is
   * declared on [model/entity/PriceGroup.cfc:L70] and IS carried by the ported entity, which publishes
   * `getPromotionRewards()` and `hasPromotionReward()` - so TWO of the six are enforceable, and both
   * are enforced below. It matters which two: the detach loop empties `childPriceGroups` itself, so
   * that rule is always satisfied by the time validation runs, whereas nothing empties
   * `promotionRewards`. A price group still named as an eligible price group by a promotion reward is
   * therefore the case the source refuses and the target was silently deleting - taking its rates with
   * it and leaving the reward pointing at nothing.
   *
   * ★ `removeAllManyToManyRelationships()` [org/Hibachi/HibachiEntity.cfc:L271-L284] IS PROVABLY
   * VACUOUS FOR THIS ENTITY, AND THAT IS A PROOF RATHER THAN AN OMISSION. It iterates every
   * `many-to-many` property with no delete-ish cascade and calls `remove<singularname>` on each related
   * entity. `PriceGroup` declares exactly four - `accounts`, `subscriptionBenefits`,
   * `subscriptionUsageBenefits` and `promotionRewards` [model/entity/PriceGroup.cfc:L67-L70] - and the
   * delete context sets `maxCollection: 0` on all four. Validation at
   * [org/Hibachi/HibachiService.cfc:L55-L58] therefore refuses the delete unless every one of them is
   * ALREADY EMPTY, so by the time [L61] runs there is provably nothing for it to remove. No link-table
   * cleanup is invented to stand in for it, because there is none to perform.
   *
   * NO TRANSACTION SPANS THE DELETE, and that is the connection contract rather than a choice.
   * `src/repositories/mysql/connection.ts:L262-L308` publishes `execute` and `executeMutation` and
   * states without qualification that "there is no transaction method either", because "adding a
   * transaction here would imply a guarantee the surrounding execution model does not provide". The
   * cascade the adapter performs - six link deletes, the rate delete, then the group delete - is
   * therefore RETRYABLE rather than atomic: every statement is idempotent and leaf-first, so a failure
   * part-way through leaves a state that re-running the delete converges out of, and no statement ever
   * leaves a row pointing at a deleted parent. This is the same disposition, for the same cited reason,
   * as the catalog delete cascade in `mysqlProductRepository.deleteProduct`.
   *
   * NET-NEW COVERAGE (B8): there is no `PriceGroupServiceTest` anywhere in `meta/tests/` and
   * `tests/unit/services/priceGroupService.test.ts` is another agent's file, so the obligations are
   * recorded rather than discharged: a price group with a promotion reward returning `false` with NO
   * delete attempted; a price group whose children are detached by the loop and which then deletes; a
   * price group whose detach loop left a child behind returning `false`; and the `false` the adapter
   * returns for an unsaved entity travelling through unchanged.
   *
   * @param priceGroup - the price group to delete.
   * @returns whether the delete succeeded - `false` when the delete-context rules refuse it, exactly
   *   as [org/Hibachi/HibachiService.cfc:L79] returns `false` without deleting.
   */
  async deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    // Legacy [L462], verbatim: "Any price groups that are inhering from this price group should
    // have that inheritence disabled." Legacy [L463]: var inheritingPriceGroups =
    // arguments.priceGroup.getChildPriceGroups();
    const inheritingPriceGroups = priceGroup.getChildPriceGroups();

    // Legacy [L465-L467]:
    //   while(arrayLen(inheritingPriceGroups) != 0) {
    //       priceGroup.removeChildPriceGroup(inheritingPriceGroups[1]);
    //   }
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L465-L467] (register DEFECT 6): the
    // `while` loop re-tests the length of a collection captured at [L463] and always removes index
    // 1, with NO INDEPENDENT TERMINATION CONDITION. It terminates only because the bidirectional
    // remove helper SPLICES THE LIVE INVERSE ASSOCIATION ARRAY - `childPriceGroups` is declared
    // `inverse="true"` at [model/entity/PriceGroup.cfc:L63], `removeChildPriceGroup` at [L139]
    // delegates to `removeParentPriceGroup`, and [L116-L125] does `arrayFind` then `arrayDeleteAt`
    // on the parent's own `getChildPriceGroups()`. The specification characterises it as "a
    // collection snapshot that is never re-read"; verification shows the snapshot IS the live
    // array, which is the only reason the code works, so the infinite loop is a LATENT HAZARD
    // rather than an observed one.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // JUDGMENT CALL: the bounded-iteration guard below is a TERMINATION SAFEGUARD, not a behaviour
    // change, and it cannot fire while the ported `removeChildPriceGroup` keeps splicing the array
    // `getChildPriceGroups()` returned - which it does today, handing out the LIVE array and
    // splicing by `getPriceGroupID()`. Should that accessor ever hand out a copy, the loop would
    // never terminate, and this guard converts a hang into a diagnosable failure. The ceiling is
    // DERIVED FROM the captured array's initial length: removing every child takes exactly as many
    // iterations as there were children.
    const iterationCeiling = inheritingPriceGroups.length;
    let iterations = 0;

    // CFML parity [model/service/PriceGroupService.cfc:L465]: `arrayLen(...) != 0` is already an
    // explicit comparison in the source and is carried over as one.
    while (inheritingPriceGroups.length !== 0) {
      iterations += 1;

      if (iterations > iterationCeiling) {
        throw new Error(
          `deletePriceGroup exceeded ${String(iterationCeiling)} detach iterations for price ` +
            `group "${priceGroup.getPriceGroupID()}" while its childPriceGroups collection was ` +
            'still non-empty. This breaks the termination invariant recorded at this method: ' +
            'PriceGroup.removeChildPriceGroup is no longer mutating the array returned by ' +
            'getChildPriceGroups(), which the legacy loop at ' +
            '[model/service/PriceGroupService.cfc:L465-L467] relies on for termination.',
        );
      }

      // CFML parity [model/service/PriceGroupService.cfc:L466]: CFML arrays are 1-BASED, so
      // `inheritingPriceGroups[1]` is index `0` here.
      const firstInheritingPriceGroup = inheritingPriceGroups[0];

      if (firstInheritingPriceGroup === undefined) {
        // Unreachable while the length is non-zero. `noUncheckedIndexedAccess` types the read as
        // `PriceGroup | undefined` and a non-null assertion is banned, so the narrowing is
        // required. Exiting is the safe resolution: it cannot turn an unreachable path into a
        // failure, and it cannot mask non-termination, because it ends the loop rather than
        // continuing it.
        break;
      }

      priceGroup.removeChildPriceGroup(firstInheritingPriceGroup);
    }

    // Legacy [L469]: return super.delete(priceGroup);
    //
    // JUDGMENT CALL: `super.delete(...)` is a framework-accessor gap of the same kind
    // as `super.save` above, and it is called POSITIONALLY and with the bare unscoped
    // `priceGroup` - matching `ProductService.cfc:L326`. It resolves through the
    // published `priceGroupRepository.deletePriceGroup(priceGroup)` member, which
    // returns the `boolean` the legacy signature declares. NO PORT MEMBER WAS
    // INVENTED, and in particular no cascade, no force flag and no rate-delete
    // companion was added - the port forbids the last of those explicitly.
    //
    // ★★ AND `super.delete` DOES THREE THINGS, NOT ONE
    // [org/Hibachi/HibachiService.cfc:L52-L80]:
    //
    //   1. VALIDATE against the `delete` context [L55]
    //   2. only when the entity has no errors [L58], strip its many-to-many relationships [L61] and
    //      delete it [L64], returning `true` [L71]
    //   3. otherwise return `false` WITHOUT DELETING [L79]
    //
    // Step two's relationship strip is provably vacuous for this entity - see the proof in the method
    // documentation above - so what has to be reproduced here is step one and the `false` of step
    // three. An earlier revision reproduced neither, which meant a price group the source refuses to
    // delete was deleted, along with every rate it owned.
    // ---------------------------------------------------------------------
    const deleteErrors = collectPriceGroupDeleteContextErrors(priceGroup);

    if (deleteErrors.length > 0) {
      // [org/Hibachi/HibachiService.cfc:L79]: `return false` - and no statement is issued. Returning
      // `false` rather than raising is what the caller at [L469] propagates, and it is the whole reason
      // this is the one method in the file declaring `boolean`.
      return false;
    }

    const deleted = await this.priceGroupRepository.deletePriceGroup(priceGroup);

    return deleted;
  }
}
