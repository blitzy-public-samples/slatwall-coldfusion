/**
 * Promotion period qualification: whether a promotion period may be applied to an order at all,
 * which of the order's fulfillments it permits, and - for the two orphaned period-level helpers
 * hosted here - which fulfillment IDs survive a weight filter and how many times one order item
 * qualifies.
 *
 * A one-to-one port of THREE private CFML helpers, all from `model/service/PromotionService.cfc`,
 * which is the sole behavioural authority for every line below:
 *
 *   PRIMARY    `getPromotionPeriodQualificationDetails`        [L549-L627]  ASYNC
 *   ORPHAN #1  `getPromotionPeriodQualifiedFulfillmentIDList`  [L752-L781]  SYNCHRONOUS
 *   ORPHAN #2  `getPromotionPeriodOrderItemQualificationCount` [L783-L849]  SYNCHRONOUS
 *
 * THE ORPHANED-HELPER HOSTING RULING. Both orphans fall outside every other decomposition module's
 * cited source range, so they are hosted HERE and `L549-L627` is this module's PRIMARY extract
 * rather than an exhaustive one. The folder is exactly nine modules, so both orphans are public
 * members of the one class this file exports.
 *
 * WHY IT MATTERS. This sits directly beneath must-preserve area #1 - promotion discount math
 * together with use-limit enforcement semantics. Both use-count gates in the PRIMARY body ARE
 * use-limit enforcement, and their `qualificationsMeet` output gates whole branches of the engine
 * [model/service/PromotionService.cfc:L197, L1053]; ORPHAN #2's return flows into the ledger
 * ratchet at [model/service/PromotionService.cfc:L222-L224] and shapes `maximumUsePerOrder`. A
 * wrong answer here changes the money a customer is charged.
 *
 * THE ASYNC BOUNDARY, DERIVED RATHER THAN ASSUMED. The PRIMARY method is `async` for exactly one
 * reason: the legacy body reaches `getPromotionDAO()` twice, at
 * [model/service/PromotionService.cfc:L567] and [model/service/PromotionService.cfc:L576].
 * Everything else traverses already-materialized associations or compares plain integers, and BOTH
 * ORPHANS REACH NO DAO AND NO ORM, so both stay SYNCHRONOUS.
 *
 * No monetary value passes through this module, so `Money` and `../../lib/cfml/precision.js` are
 * deliberately not imported - every numeric is a plain integer count or a plain fulfillment weight,
 * and none of the component's nine `precisionEvaluate` sites (L150, L252, L299, L486, L990, L995,
 * L1001, L1006 and L1007) falls inside the three ported ranges. Nothing is persisted, and the two
 * `throw`s at [L774] and [L831] REPRODUCE failures the legacy raises rather than validating
 * anything the legacy does not.
 *
 * The `promotionPeriodQualifications` memo is NOT created here: it is an invocation-local `var` in
 * both legacy consumers [model/service/PromotionService.cfc:L136, L1038] and stays owned by them,
 * request-scoped. Module-level state would survive between unrelated warm-container invocations, so
 * a cached verdict could leak one customer's result into another's order. `OrderView`,
 * `OrderItemView` and `OrderFulfillmentView` are read-only projections whose ID values are OPAQUE
 * strings, carried verbatim and never parsed.
 *
 * TWO TRANSLATION HABITS APPLY THROUGHOUT, STATED ONCE HERE. (1) COLLECTIONS AND NULLABLE ACCESSORS
 * ARE CAPTURED ONCE - nothing in these three ranges mutates the order or a qualifier, so one
 * binding is observationally identical to the legacy's repeated accessor calls, and narrowing a
 * nullable accessor requires a stable binding at all. (2) THE 1-BASED-TO-0-BASED TRANSLATION IS
 * ELIMINATED, NOT PERFORMED - iterating the captured array means no index exists to get wrong, and
 * the one surviving 1-based position is the `listFindNoCase` result fed to `listDeleteAt`.
 *
 * THE TWO CONSUMERS OF THE PRIMARY METHOD, AND WHY BOTH ARE SERVED. Consumer #1 is the engine
 * `updateOrderAmountsWithPromotions`: memo at [model/service/PromotionService.cfc:L136], populate
 * at L192-L193, then it reads every live member - `qualificationsMeet` at L197,
 * `qualifiedFulfillmentIDs` at L209 and L351, `orderItems` at L212-L213, L217 and L222. Consumer #2
 * is `getShippingMethodOptionsDiscountAmountDetails` [model/service/PromotionService.cfc:L1032]:
 * memo at L1038, populate at L1048-L1049, reading ONLY `qualificationsMeet` at L1053. So the record
 * must be fully usable when only `qualificationsMeet` is consulted, and the order must arrive as a
 * PARAMETER.
 *
 * LEGACY-NOTE: the folder's no-intra-folder-imports discipline is DIRECTIONAL - a composing facade
 * may import all nine modules, and nothing here may import such a facade back. Sibling imports
 * among the nine are permitted while the graph stays acyclic. The legacy line numbers here are CALL
 * SITES in `model/service/PromotionService.cfc`, not import statements: this module needs
 * ./qualifierQualification.ts for the call at [L590] and ./orderItemMembership.ts for the call at
 * [L805], ./qualifierQualification.ts needs ./orderItemMembership.ts for the call at [L727], and
 * ./orderItemMembership.ts needs no sibling. No cycle.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L549, L752, L783]: all three methods are private
 * in legacy and exported here as project visibility widenings #1, #3 and #4 so the behaviour is
 * directly testable - visibility only, behaviour unchanged. #2 (`getQualifierQualificationDetails`
 * [L629]) is spent in ./qualifierQualification.ts and #5 (`getDiscountAmount` [L987]) in
 * ./discountAmount.ts, so the five-slot ledger is exhausted.
 *
 * --- THREE CORRECTIONS WHERE THE BRIEF AND THE SOURCE DISAGREED; THE SOURCE WON ---
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L569, L613, L614, L615]: cited as
 * L570/L614/L615/L616. The three `qualificationsMeet = false` writes are at L569, L578 and L613,
 * and the early-return reset writes `qualifiedFulfillmentIDs` at L614 and `qualifierDetails` at
 * L615 with the `return` itself at L616.
 *
 * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L109-L113]: `rewardMatchingType` was cited as
 * the four-value vocabulary `sku | product | productType | brand`; the entity declares FIVE select
 * options and the first is `any`. The published `RewardMatchingType` union agrees, so `any` is a
 * FIRST-CLASS CONFIGURED VALUE that takes the permissive fallthrough at
 * [model/service/PromotionService.cfc:L808-L818] by design, which makes the absence of a default
 * branch there deliberate.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L549, L752, L783]: the first parameter was cited
 * as `period`; the legacy declares `required any promotionPeriod` at all three sites and the three
 * published aliases in `../../domain/promotionEngine/qualificationTypes.ts` name it
 * `promotionPeriod` too, so that is the name used below.
 */

import type { Brand } from '../../domain/entities/brand.js';
import type { Product } from '../../domain/entities/product.js';
import type { ProductType } from '../../domain/entities/productType.js';
import type { PromotionPeriod } from '../../domain/entities/promotionPeriod.js';
import type {
  PromotionQualifier,
  RewardMatchingType,
} from '../../domain/entities/promotionQualifier.js';
import type { PromotionRepository } from '../../domain/ports/promotionRepository.js';
import type {
  GetPromotionPeriodOrderItemQualificationCount,
  GetPromotionPeriodQualificationDetails,
  GetPromotionPeriodQualifiedFulfillmentIDList,
  PeriodQualification,
  QualifierQualification,
} from '../../domain/promotionEngine/qualificationTypes.js';
import type { OrderFulfillmentView } from '../../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import type { OrderItemMembership } from './orderItemMembership.js';
import type { QualifierQualificationEvaluator } from './qualifierQualification.js';
import { listAppend, listFindNoCase, listLen, listToArray } from '../../lib/cfml/list.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

// MODULE-LOCAL HELPERS. None is exported; each reproduces a CFML semantic the strict profile will
// not let me write inline. All are pure functions and none holds state.

/**
 * A narrowing wrapper over the shared `isNullish()` port of CFML `isNull()`, in the POSITIVE
 * polarity the source writes as `!isNull(...)`. Wrapping the shared `(value: unknown) => boolean`
 * predicate keeps ONE definition of "nullish" in the subtree while letting strict mode narrow;
 * every nullable value below is NARROWED, never asserted.
 *
 * CFML parity [model/service/PromotionService.cfc:L566, L574, L575, L769, L771, L830]: the six
 * `!isNull(...)` tests this module reproduces - the two period use-count overrides, the account
 * presence test, the two fulfillment weight bounds, and the minimum item quantity.
 */
function isPresent<TValue>(value: TValue | undefined): value is TValue {
  return !isNullish(value);
}

/**
 * The same wrapper in the NEGATIVE polarity the source writes as `isNull(...)`.
 *
 * CFML parity [model/service/PromotionService.cfc:L814, L816]: the two brand-absence clauses of the
 * exclusion disjunction, the only bare `isNull(...)` tests in the three ported ranges. Reading
 * `!isPresent(...)` where the source writes `isNull(...)` would invert the reader's model at
 * precisely the two clauses whose ORDER is load-bearing.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Does the qualifier's type select the given branch, with case folded as CFML folds it?
 *
 * CFML parity [model/service/PromotionService.cfc:L596, L764]: both sites test `==`, which on strings
 * is CASE-INSENSITIVE in CFML, and `SwPromoQual.qualifierType` is a plain string with no check
 * constraint - so a qualifier persisting `'Fulfillment'` takes the branch in the legacy engine and must
 * take it here. Both call sites coerce the nullable accessor with `?? ''` first, reproducing CFML's
 * rendering of an unset string, and `cfEquals` treats `''` as an ordinary string - so an absent type
 * matches no branch, exactly as before.
 *
 * @param qualifierType - the qualifier's type, already coerced to `''` when absent.
 * @param branch - the branch being tested, in the source's canonical spelling.
 * @returns `true` when the two are equal with case folded.
 */
function matchesQualifierType(qualifierType: string, branch: string): boolean {
  return cfEquals(qualifierType, branch);
}

/**
 * Does the qualifier's reward-matching type select the given exclusion clause, with case folded?
 *
 * CFML parity [model/service/PromotionService.cfc:L808, L810, L812, L814, L816, L818]: all six clauses
 * test `==` and `SwPromoQual.rewardMatchingType` carries no check constraint, so the fold is required
 * for parity rather than added defensively.
 *
 * ABSENCE MUST ANSWER FALSE, AND THAT IS THE WHOLE REASON THIS WRAPPER EXISTS RATHER THAN A BARE
 * `cfEquals` CALL. The accessor is genuinely nullable and is NOT coerced at the call site, unlike
 * `qualifierType` above. `cfEquals` RAISES on a nullish operand, which would turn the legacy's
 * permissive fall-through - where an absent or `any` value fires none of clauses 2-7 and the item
 * qualifies on clause 1 alone - into a thrown request. The guard preserves the fall-through.
 *
 * ★ WHY BOTH HELPERS ARE DEFINED HERE. The home is prescribed rather than chosen:
 * `src/lib/cfml/struct.ts` declares its export surface CLOSED and directs that a translation need none
 * of its primitives covers "belongs inside the consuming module with a documented annotation - not as a
 * new export here and not as a new file in this folder". `cfEquals` IS the primitive; what these two
 * add is the per-site ABSENCE POLICY, and the fact that this module needs two different ones - coerced
 * at one pair of sites, guarded at the other six - is precisely why a single shared export would have
 * been the wrong shape.
 *
 * @param rewardMatchingType - the qualifier's reward-matching type, which may be absent.
 * @param clause - the clause being tested, in the source's canonical spelling.
 * @returns `true` only when the value is present and equals the clause with case folded.
 */
function matchesRewardMatchingType(
  rewardMatchingType: RewardMatchingType | undefined,
  clause: string,
): boolean {
  return !isAbsent(rewardMatchingType) && cfEquals(rewardMatchingType, clause);
}

/**
 * CFML `ListDeleteAt` over a comma-delimited list, 1-BASED, RAISING on an unusable position.
 *
 * JUDGMENT CALL: implemented module-locally because `lib/cfml/list.ts` is locked at five exports
 * and `lib/cfml` at five files, and a tenth module in this folder is a gate failure. It composes
 * two of the locked five - `listLen` and `listToArray` - so the delimiter semantics are the shared
 * module's, not a second private notion of what a list is.
 *
 * CFML parity [model/service/PromotionService.cfc:L774]: the raise REPRODUCES a legacy failure
 * rather than validating anything of my own. CFML's `ListDeleteAt` raises when handed a position of
 * `0` or one past the end, and `listFindNoCase` hands it exactly `0` for an absent element; see the
 * defect marker at the call site for how that position becomes reachable.
 *
 * @param list - the comma-delimited list to delete from.
 * @param position - the 1-based position to delete. `0` and out-of-range values raise.
 * @param delimiter - a single delimiter character; defaults to a comma, as CFML does. Only a single
 *   character keeps the split-and-rejoin exact.
 * @returns the list with exactly that one element removed.
 */
function listDeleteAt(list: string, position: number, delimiter: string = ','): string {
  const length = listLen(list, delimiter);

  if (!Number.isInteger(position) || position < 1 || position > length) {
    throw new RangeError(
      `ListDeleteAt received the position ${String(position)}, which is not an integer in ` +
        `1..${String(length)}; the list has ${String(length)} element(s). Reproduces the CFML ` +
        `failure at model/service/PromotionService.cfc:L774, where listFindNoCase answers 0 for an ` +
        `absent element and ListDeleteAt raises on position 0.`,
    );
  }

  const elements = listToArray(list, delimiter);

  // The one 1-based-to-0-based conversion in this module, performed immediately after the bounds
  // check that made it safe rather than at the call site, where the position is still 1-based.
  elements.splice(position - 1, 1);

  return elements.join(delimiter);
}

/**
 * The order item's product, reproducing the legacy UNGUARDED dereference.
 *
 * CFML parity [model/service/PromotionService.cfc:L810, L814, L816, L818]: the legacy walks
 * `...getSku().getProduct()` at four sites inside the exclusion disjunction WITHOUT A SINGLE NULL
 * GUARD, while it does guard the BRAND two hops further out at L814 and L816. That asymmetry is the
 * behaviour and it is preserved exactly.
 *
 * The ported `Sku.getProduct()` answers `Product | undefined` because the association can genuinely
 * be cleared, and an absent product RAISES here exactly as CFML raises on a dereference of nothing.
 * It must never be softened into a silent non-match, which would withhold a discount for which a
 * data fault - not a business rule - is responsible.
 *
 * CALL THIS AT THE CLAUSE POSITION, NEVER HOISTED. The disjunction short-circuits, so a `sku` match
 * decided at L808 must never pay for a product dereference that L810 would have performed.
 */
function requireProduct(orderItem: OrderItemView): Product {
  const product = orderItem.sku.getProduct();

  if (isAbsent(product)) {
    throw new TypeError(
      `OrderItem '${orderItem.orderItemID}': the promotion period order-item qualification count ` +
        `requires the sku's owning product, which ` +
        `model/service/PromotionService.cfc:L810, L814, L816 and L818 dereference unconditionally.`,
    );
  }

  return product;
}

/**
 * The order item's product type, reproducing the legacy UNGUARDED dereference.
 *
 * CFML parity [model/service/PromotionService.cfc:L812]: the four-hop chain
 * `...getSku().getProduct().getProductType().getProductTypeID()` is dereferenced twice on one line,
 * once for the item being examined and once for the target, with no null guard on either.
 */
function requireProductType(orderItem: OrderItemView): ProductType {
  const productType = requireProduct(orderItem).getProductType();

  if (isAbsent(productType)) {
    throw new TypeError(
      `OrderItem '${orderItem.orderItemID}': the promotion period order-item qualification count ` +
        `requires the product's product type, which ` +
        `model/service/PromotionService.cfc:L812 dereferences unconditionally.`,
    );
  }

  return productType;
}

/**
 * The order item's brand, for the ONE clause that dereferences it.
 *
 * CFML parity [model/service/PromotionService.cfc:L814-L818]: unlike the two helpers above, this
 * raise is PROVABLY UNREACHABLE in the preserved clause order - L818 is only evaluated once L814
 * and L816 have both answered false, which means both brands are present. Routing L818 through a
 * raising accessor makes the order-criticality MECHANICAL rather than merely commented: any
 * reordering that put L818 first would surface as this raise rather than as a wrong discount.
 */
function requireBrand(orderItem: OrderItemView): Brand {
  const brand = requireProduct(orderItem).getBrand();

  if (isAbsent(brand)) {
    throw new TypeError(
      `OrderItem '${orderItem.orderItemID}': the promotion period order-item qualification count ` +
        `reached model/service/PromotionService.cfc:L818 with no brand, which is only possible if ` +
        `the L814/L816 short-circuit cascade was reordered.`,
    );
  }

  return brand;
}

/**
 * The public surface this module must keep, expressed by REFERENCE to the published signature
 * aliases, not by restating their shapes.
 *
 * JUDGMENT CALL: the three methods are bound to the published aliases through a module-local
 * `implements` interface so that interface parity - the project's acceptance contract - is checked
 * by the compiler instead of by review. Each member is the imported alias NAMED, so nothing is
 * redeclared, widened or re-derived and this declaration cannot drift from a published type.
 */
interface PromotionPeriodQualificationSurface {
  getPromotionPeriodQualificationDetails: GetPromotionPeriodQualificationDetails;
  getPromotionPeriodQualifiedFulfillmentIDList: GetPromotionPeriodQualifiedFulfillmentIDList;
  getPromotionPeriodOrderItemQualificationCount: GetPromotionPeriodOrderItemQualificationCount;
}

/**
 * The promotion-period qualification evaluator: one period in, one verdict out - plus the two
 * orphaned period-level helpers that live nowhere else.
 *
 * JUDGMENT CALL: exported as a class rather than three free functions, because this file exports
 * one unit and three verbatim-named methods must coexist. The `...Evaluator` suffix follows
 * `QualifierQualificationEvaluator` and avoids colliding with the published `PeriodQualification`.
 *
 * All three collaborators replace a legacy DI/1 convention-scanned `property name="xService";`
 * declaration and are constructor-injected, to be wired once in a composition root (transformation
 * rule T1): no service locator, no `getService("...")` lookup and no runtime scan. All three fields
 * are `readonly` and every value the algorithms compute lives on the stack for one call, so one
 * instance is safe to reuse and cannot carry one order's verdict into another's.
 *
 * ORDERING, DOCUMENTED AND DELIBERATELY NOT ENFORCED HERE.
 * `PriceGroupService.updateOrderAmountsWithPriceGroups()`
 * [model/service/PriceGroupService.cfc:L364-L375] must run BEFORE
 * `PromotionService.updateOrderAmountsWithPromotions()`, because the discount base price at
 * [model/service/PromotionService.cfc:L241-L252] is chosen differently depending on price-group
 * eligibility - the promotion pass reads state the price-group pass writes. In legacy that held
 * only because `OrderService` happened to call them in that sequence. Ordering the two passes is an
 * obligation on whichever caller composes them; nothing in this class depends on it, and no runtime
 * check or ordering flag is added here.
 */
export class PromotionPeriodQualificationEvaluator implements PromotionPeriodQualificationSurface {
  public constructor(
    /**
     * The promotion repository port, replacing the legacy `getPromotionDAO()` accessor at
     * [model/service/PromotionService.cfc:L567] and [model/service/PromotionService.cfc:L576].
     */
    private readonly promotionRepository: PromotionRepository,

    /**
     * The per-qualifier evaluator, replacing the same-component call at
     * [model/service/PromotionService.cfc:L590]. Its single public method is SYNCHRONOUS, which is
     * why the qualifier loop below introduces no await.
     */
    private readonly qualifierQualificationEvaluator: QualifierQualificationEvaluator,

    /**
     * Order-item membership, replacing the same-component call at
     * [model/service/PromotionService.cfc:L805]. Both of its membership twins are SYNCHRONOUS.
     */
    private readonly orderItemMembership: OrderItemMembership,
  ) {}

  /**
   * Decide whether a promotion period qualifies for an order, and collect what qualified.
   *
   * Ported from `private struct function getPromotionPeriodQualificationDetails(required any
   * promotionPeriod, required any order)` [model/service/PromotionService.cfc:L549-L627]. The
   * legacy `any` parameters become the concrete `PromotionPeriod` entity and the read-only
   * `OrderView`, and the legacy `struct` return becomes `PeriodQualification`. ASYNC only because
   * of the two repository reaches at [model/service/PromotionService.cfc:L567] and
   * [model/service/PromotionService.cfc:L576].
   *
   * @param promotionPeriod - the period whose qualification is being decided. Its promotion must
   *   already be materialized, because the repository reaches through it for the promotion
   *   identifier.
   * @param order - the read-only order projection to decide it against.
   * @returns the period's verdict, in exactly the shape the legacy struct carried.
   */
  public async getPromotionPeriodQualificationDetails(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): Promise<PeriodQualification> {
    // [L552-L557] The FOUR-KEY seed, in source order. `orderItems` is a live member of the contract
    // even though nothing in this method writes it - the engine populates it at
    // [model/service/PromotionService.cfc:L213] after the record has been memoized - so it is
    // seeded empty and is neither omitted nor made optional. The published type declares
    // `qualifiedFulfillmentIDs` and `qualifierDetails` as `readonly` PROPERTIES holding MUTABLE
    // arrays and `qualificationsMeet` as a plain mutable boolean: bindings fixed, contents mutated.
    const qualificationDetails: PeriodQualification = {
      qualificationsMeet: true,
      qualifiedFulfillmentIDs: [],
      qualifierDetails: [],
      orderItems: {},
    };

    // [L559-L561] THE DEFAULT IS "ALL FULFILLMENTS QUALIFY": every fulfillment ID on the order is
    // appended before any qualification work happens.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L554, L560, L614]: qualifiedFulfillmentIDs is
    // all-or-nothing, never incrementally narrowed; empty means "nothing qualifies", not "no
    // restriction". Cited as "only ever narrowed"; it is not narrowed at all - the array is touched
    // at exactly three places, initialized empty at L554, filled with every fulfillment ID at L560,
    // and replaced with an empty array at L614 on the early-return path. That inverts the
    // exclude-list semantics used elsewhere in the engine, where an empty configured collection is
    // PERMISSIVE: a consumer reading emptiness as permissive would discount every fulfillment of an
    // order the legacy grants none to.
    const orderFulfillments: readonly OrderFulfillmentView[] = order.orderFulfillments;
    for (const orderFulfillment of orderFulfillments) {
      qualificationDetails.qualifiedFulfillmentIDs.push(orderFulfillment.orderFulfillmentID);
    }

    // [L563] The accumulator for the explicit-qualification sub-computation. See the defect marker
    // and the escalation note at L621-L623 for why everything it collects is discarded.
    const explicitlyQualifiedFulfillmentIDs: string[] = [];

    // [L566-L571] GATE 1: the period's own use count. Part of must-preserve area #1.
    //
    // CFML parity [model/service/PromotionService.cfc:L566, L574]: a persisted maximum of exactly 0
    // means UNLIMITED - the `gt 0` guard fails and the limit check is skipped entirely. The shape
    // `!isNull(x) && x > 0` is preserved verbatim at BOTH gates; it is counter-intuitive and
    // trivially "fixed" by accident.
    const maximumUseCount = promotionPeriod.getMaximumUseCount();
    if (isPresent(maximumUseCount) && maximumUseCount > 0) {
      // [L567] The only reason this method is async. The call is issued ONLY when the guard above
      // passed, exactly as the legacy issues it; the two repository calls are neither parallelised,
      // batched nor memoized.
      const periodUseCount =
        await this.promotionRepository.getPromotionPeriodUseCount(promotionPeriod);

      // [L568] THE COMPARISON IS NON-STRICT: reaching the maximum use count EXACTLY disqualifies.
      // ./qualifierQualification.ts differs - its four order-level bounds at
      // [model/service/PromotionService.cfc:L644, L646, L648, L650] are all STRICT. Neither module
      // is normalised toward the other.
      //
      // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L177, L244]: THIS IS WHERE THE DUPLICATED
      // start-date GUARD BECOMES A MONEY DECISION, and it is noted at the decision rather than only
      // at the statement because the statement is where the defect lives and this is where it pays
      // out. The count arriving above is produced by a query whose upper date bound is gated on the
      // period's START date while binding its END date, so:
      //   * a period with a START and NO END binds a null into `createdDateTime < ?`, which SQL
      //     evaluates as UNKNOWN for every row, so `periodUseCount` is 0, the comparison below can
      //     never fire, and `maximumUseCount` NEVER BINDS however many times the promotion was used;
      //   * a period with NO START and an END emits neither bound, so applied promotions created
      //     after the period ended are counted and the limit binds SOONER than intended.
      // Both period states are reachable - [model/entity/PromotionPeriod.cfc:L53-L54] declare both
      // dates nullable with hb_nullRBKey="define.forever". The disposition for the security finding
      // this raises, with its AAP citations, is stated once at
      // `src/repositories/mysql/sql/promotionUseCounts.sql.ts` beside the guard itself and governs
      // this site too; it is not restated here, because two copies of a ruling drift. The public
      // façade the finding names for this path is
      // `PromotionService.getPromotionPeriodQualificationDetails`, which delegates straight to the
      // method containing this gate.
      // Preserved deliberately; do not fix without a product decision.
      if (periodUseCount >= maximumUseCount) {
        // [L569]
        qualificationDetails.qualificationsMeet = false;
      }
    }

    // [L574-L581] GATE 2: this account's use count. Also must-preserve area #1.
    const maximumAccountUseCount = promotionPeriod.getMaximumAccountUseCount();
    if (isPresent(maximumAccountUseCount) && maximumAccountUseCount > 0) {
      // CFML parity [model/service/PromotionService.cfc:L575]: an order with no account skips the
      // account use-limit check entirely; the limit is never enforced for accountless orders. This
      // PERMISSIVE path is load-bearing: a guest order is never blocked by
      // `maximumAccountUseCount`, however high the count, and no fallback account is substituted.
      //
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L574-L581]: the per-account use limit is
      // enforced only when the order HAS an account. The guard is `if(!isNull(arguments.order.getAccount()))`
      // at L575, wrapping the whole check, so an accountless (guest) order satisfies
      // `maximumAccountUseCount` unconditionally and can redeem a per-account-limited promotion
      // repeatedly. The general period limit at L566-L571 still applies - it is the ONLY ceiling a
      // guest order faces.
      // Preserved deliberately; do not fix without a product decision.
      //
      // SECURITY REVIEW DISPOSITION - RAISED AS S-04, DECLINED ON A CITED MANDATE.
      //
      // A security review raised this as a HIGH finding: an unauthenticated caller can omit the
      // account identifier and redeem a per-account-limited promotion an unbounded number of times.
      // Its suggested resolution was to refuse qualification, or to fall back to a per-session or
      // per-order identity, whenever `maximumAccountUseCount` is set and no account is present.
      //
      // THAT RESOLUTION IS DECLINED, AND THE DECLINE IS MANDATED RATHER THAN CHOSEN:
      //
      //   * AAP 0.8.1 Preserve-Exactly names "promotion discount math TOGETHER WITH use-limit
      //     enforcement semantics" as must-preserve area #1. This gate IS use-limit enforcement, and
      //     the skip is one of its semantics rather than an accident of it.
      //   * AAP 0.6.7 governs latent defects with the same force as explicit TODOs: they are
      //     "reproduced, not repaired", and AAP 0.9.3 makes the inverse a failing gate - "A defect
      //     that is silently fixed fails this gate."
      //   * AAP 0.9.3 enumerates the ONLY three sanctioned divergences in the whole port - register
      //     entries 13, 12 and 17/18/19. This gate is none of them, and the budget is closed.
      //   * Substituting an identity the legacy does not have would be worse than either option: it
      //     would enforce a limit against a per-session key the persisted use counts were never
      //     recorded under, so the count read at L576 would not correspond to the identity being
      //     limited. That is inventing behaviour, which AAP 0.8.1 forbids outright.
      //
      // The review's severity assessment is not disputed. What is disputed is that this file may fix
      // it: tightening the gate here would refuse promotions the migrated system grants today,
      // silently, inside a strangler-fig seam whose whole purpose is that the two implementations
      // agree. The remedy belongs upstream of this port - either a product decision to change the
      // rule in both systems, or an authentication requirement on the promotion endpoint that stops
      // an accountless order reaching this gate at all. `tests/unit/services/promotionService.test.ts`
      // pins the current outcome adversarially so it cannot change by accident in either direction.
      //
      // JUDGMENT CALL: the legacy tests the out-of-scope `Account` ENTITY via
      // `!isNull(order.getAccount())` and no such entity exists in the target. `OrderView`
      // publishes `accountID: string | undefined` instead - the anti-corruption boundary's
      // reduction of that aggregate to an opaque identifier - and the repository port's second
      // parameter is the same opaque `accountID`, because the legacy DAO immediately reduces the
      // entity to `account.getAccountID()` [model/dao/PromotionDAO.cfc:L193]. An empty-string
      // identifier is PRESENT under this reading, matching the legacy, where a present account with
      // an empty identifier would have reached the query unchanged.
      const accountID = order.accountID;
      if (isPresent(accountID)) {
        // [L576] Issued only when BOTH L574 and L575 passed. That exact conditionality is
        // preserved.
        const periodAccountUseCount =
          await this.promotionRepository.getPromotionPeriodAccountUseCount(
            promotionPeriod,
            accountID,
          );

        // [L577] Non-strict, as at L568.
        if (periodAccountUseCount >= maximumAccountUseCount) {
          // [L578]
          qualificationDetails.qualificationsMeet = false;
        }
      }
    }

    // [L584] The qualifier loop runs ONLY if both use-count gates left the flag true.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L584]: THERE ARE TWO DISTINCT FAILURE SHAPES
    // and both are reproduced rather than normalised into one. A USE-COUNT failure (L569 or L578)
    // falls through here, skips the qualifier loop wholesale, and returns at L626 with
    // `qualificationsMeet: false` but `qualifiedFulfillmentIDs` STILL FULL from the L560 seed and
    // `qualifierDetails` empty. A QUALIFIER failure (L613-L616) returns with
    //   `qualificationsMeet: false`
    // and `qualifiedFulfillmentIDs` EMPTIED. A consumer must therefore never infer disqualification
    // from an empty `qualifierDetails` or a populated `qualifiedFulfillmentIDs`.
    if (qualificationDetails.qualificationsMeet) {
      // [L587] A materialized association, so plain synchronous iteration.
      const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();

      for (const qualifier of promotionQualifiers) {
        // [L590] The sibling call.
        //
        // CFML parity [model/service/PromotionService.cfc:L590]: positional two-argument call form
        // preserved. SYNCHRONOUS and deliberately not awaited, and reached through the injected
        // evaluator rather than a same-component method call - what T1 replaces the convention scan
        // with.
        const thisQualifierDetails: QualifierQualification =
          this.qualifierQualificationEvaluator.getQualifierQualificationDetails(qualifier, order);

        // [L593] The legacy writes a bare numeric truthiness test.
        //
        // CFML parity [model/service/PromotionService.cfc:L593]: CFML numeric truthiness means
        // "non-zero"; qualificationCount is provably non-negative on every path - the order arm
        // yields 1 or 0 [model/service/PromotionService.cfc:L641, L652], the fulfillment arm
        // increments at L665 before any decrement at L707, the order-item arm yields 0 at L717 or a
        // truncated non-negative quotient at L743 - so `> 0` is exact.
        if (thisQualifierDetails.qualificationCount > 0) {
          // [L596] The fulfillment-type discriminator.
          //
          // CFML parity [model/service/PromotionService.cfc:L596]: CFML `==` on strings is
          // CASE-INSENSITIVE, so a qualifier persisting `'Fulfillment'` reaches this branch in the
          // legacy engine. The comparison therefore folds case, through
          // {@link matchesQualifierType}.
          //
          // ★ AN EARLIER REVISION ASSERTED THE OPPOSITE - that `qualifierType` "is a fixed persisted
          // lowercase-camel vocabulary, so strict `===` is exact" - and that premise does not hold.
          // The five legal values ARE written `order`, `fulfillment`, `merchandise`, `subscription`
          // and `contentAccess` [model/entity/PromotionQualifier.cfc:L53], but that column is a plain
          // string with no check constraint: `select` constrains the admin FORM, not the schema. A
          // mis-cased token made this branch miss, the qualifier's fulfillment IDs were never unioned
          // into the accumulator, and the period lost fulfillment qualification that the legacy engine
          // would have granted - a silent full-price charge. The same correction is applied at [L764]
          // below and, with the same reasoning, in ./qualifierQualification.ts.
          //
          // The accessor is nullable, and CFML renders an unset string as the empty string in a
          // comparison, so the `?? ''` reproduces that coercion; an absent type equals no literal
          // under either reading. `cfEquals` treats `''` as an ordinary string, so that outcome is
          // unchanged by the fold.
          const qualifierType = qualifier.getQualifierType() ?? '';

          if (matchesQualifierType(qualifierType, 'fulfillment')) {
            // [L599-L605] Union the qualifier's own qualified fulfillment IDs into the local
            // accumulator, skipping duplicates.
            for (const orderFulfillmentID of thisQualifierDetails.qualifiedFulfillmentIDs) {
              // CFML parity [model/service/PromotionService.cfc:L602]: arrayFind returns a 1-based
              // index or 0, so the negated form is a membership test - the ONLY `!arrayFind` site
              // in the component - translated as `includes` because that IS the membership question
              // the negation asks. A raw `findIndex` would answer -1 on a miss.
              if (!explicitlyQualifiedFulfillmentIDs.includes(orderFulfillmentID)) {
                // [L603]
                explicitlyQualifiedFulfillmentIDs.push(orderFulfillmentID);
              }
            }
          }

          // [L609] Attach the qualifier's verdict WHOLESALE - the object exactly as returned, not
          // cloned, filtered or projected. Its own `qualifiedFulfillmentIDs`, already narrowed
          // inside ./qualifierQualification.ts, travels with it.
          qualificationDetails.qualifierDetails.push(thisQualifierDetails);
        } else {
          // [L612-L616] A SINGLE non-qualifying qualifier aborts the whole period, immediately. The
          // `else` binds to the L593 test, and the return is preserved as an immediate return -
          // never a flag-and-continue, which would let later qualifiers keep appending.
          //
          // LEGACY-NOTE [model/service/PromotionService.cfc:L613-L616]: the early-return reset
          // clears three of the four keys and spares orderItems; orderItems is never written in
          // this function, so the sparing is structurally inert here. Reproduced as-is, because a
          // fourth reset line would be behaviour the legacy does not have.
          //
          // CFML parity [model/service/PromotionService.cfc:L614, L615]: the legacy REBINDS each
          // key to a fresh empty array, while the published type fixes the binding and leaves the
          // contents mutable, so the reset empties the arrays IN PLACE. Observationally identical:
          // the record is returned on the next line and nothing holds a prior reference to either
          // array - the only earlier reader, the L599 loop, reads a DIFFERENT array belonging to
          // the qualifier's own verdict.
          qualificationDetails.qualificationsMeet = false;
          qualificationDetails.qualifiedFulfillmentIDs.length = 0;
          qualificationDetails.qualifierDetails.length = 0;

          return qualificationDetails;
        }
      }
    }

    // [L621-L623] THE ORPHANED WRITE.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: writes `qualifiedFulfillments`,
    // a key the L552-L557 initializer never creates, typed as entities in the L93 docblock but
    // assigned ID strings, and read by nothing - every consumer reads `qualifiedFulfillmentIDs` at
    // L209 and L351.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L563, L595-L606, L621-L623]: the entire
    // explicitlyQualifiedFulfillmentIDs computation feeds only the orphaned key, so the expected
    // narrowing of qualifiedFulfillmentIDs never occurs and the L209/L351 probes match every
    // fulfillment. Reproduced in full; wiring it up would change which fulfillments are discounted.
    if (explicitlyQualifiedFulfillmentIDs.length > 0) {
      // [L622]
      qualificationDetails.qualifiedFulfillments = explicitlyQualifiedFulfillmentIDs;
    }

    // [L626]
    return qualificationDetails;
  }

  /**
   * Build the COMMA-DELIMITED list of fulfillment IDs a promotion period's fulfillment qualifiers
   * leave standing, filtering on weight bounds only.
   *
   * Ported from `private string function getPromotionPeriodQualifiedFulfillmentIDList(required any
   * promotionPeriod, required any order)` [model/service/PromotionService.cfc:L752-L781].
   * SYNCHRONOUS: the body reaches no DAO and no ORM.
   *
   * THE RETURN IS A COMMA-DELIMITED STRING, NOT AN ARRAY - seeded `''` at
   * [model/service/PromotionService.cfc:L753], built with `listAppend` at L756, mutated by
   * `ListDeleteAt` at L774 and returned as a string at L780. It must not be conflated with the
   * `string[]` member `qualifiedFulfillmentIDs` of `PeriodQualification`; the comma-list shape is
   * retained for signature parity.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L752]: this helper has zero call sites anywhere
   * in the non-Hibachi codebase - a search of every non-Hibachi `.cfc` and `.cfm` for the method
   * name returns exactly one hit, its own declaration line. Ported for surface completeness.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L769-L772]: orphan #1 excludes on weight bounds
   * only, while the live path in ./qualifierQualification.ts (L693-L704) applies six clauses - it
   * adds the address-zone flag, the fulfillment-methods gate, the shipping-methods gate and the
   * shipping-address-zones clause carrying DEFECT 11 - so this helper qualifies fulfillments the
   * live path excludes. Ported as written; reconciling them would invent behaviour.
   *
   * @param promotionPeriod - the period whose fulfillment qualifiers are applied.
   * @param order - the read-only order projection supplying the fulfillments.
   * @returns a comma-delimited list of the surviving fulfillment IDs.
   */
  public getPromotionPeriodQualifiedFulfillmentIDList(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): string {
    // [L753] The accumulator is a LIST, not an array. The shared `listAppend` satisfies
    // `listAppend('', v) === v`, so the first append emits NO leading delimiter - a leading comma
    // would shift every later `listFindNoCase` position by one.
    let qualifiedFulfillmentIDs = '';

    // [L755-L757] Seed with every fulfillment ID.
    //
    // CFML parity [model/service/PromotionService.cfc:L755, L767]: the loop variable `f` is `var`'d
    // TWICE in one CFML function scope - here and again in the inner loop below - and CFML has one
    // function scope, so the second declaration redeclares the same variable. In TypeScript the two
    // `for` bodies are distinct block scopes, so the artifact disappears.
    const orderFulfillments: readonly OrderFulfillmentView[] = order.orderFulfillments;
    for (const orderFulfillment of orderFulfillments) {
      // [L756]
      qualifiedFulfillmentIDs = listAppend(
        qualifiedFulfillmentIDs,
        orderFulfillment.orderFulfillmentID,
      );
    }

    // [L759-L760] The source comment above L760 says "Loop over Qualifiers looking for fulfillment
    // qualifiers", and here it is CORRECT - this loop really does filter fulfillment qualifiers.
    // The same comment is copy-pasted above the ORDER-ITEM loop at L787, where it is wrong; see the
    // annotation there.
    const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();
    for (const qualifier of promotionQualifiers) {
      // [L764] Treated exactly as L596: a case-FOLDED comparison against the lowercase literal, with
      // the same audit and the same correction - see the block at L596 for why the earlier
      // strict-equality reading was wrong and what it cost.
      //
      // CFML parity [model/service/PromotionService.cfc:L764]: CFML `==` on strings is
      // case-insensitive, and `SwPromoQual.qualifierType` carries no check constraint, so the fold is
      // required rather than defensive.
      const qualifierType = qualifier.getQualifierType() ?? '';

      if (matchesQualifierType(qualifierType, 'fulfillment')) {
        // [L766-L768] The inner loop. Index eliminated as at L755; the element the legacy re-reads at
        // L768 is the loop subject here.
        for (const orderFulfillment of orderFulfillments) {
          // [L769, L771] BOTH BOUNDS ARE STRICT and both are null-guarded, so boundary equality
          // does NOT exclude: a fulfillment weighing exactly the minimum, or exactly the maximum,
          // survives. The weights are PLAIN NUMERICS, never `Money` - shipping weights, not
          // currency.
          const minimumFulfillmentWeight = qualifier.getMinimumFulfillmentWeight();
          const maximumFulfillmentWeight = qualifier.getMaximumFulfillmentWeight();
          const totalShippingWeight = orderFulfillment.totalShippingWeight;

          if (
            // [L769]
            (isPresent(minimumFulfillmentWeight) &&
              minimumFulfillmentWeight > totalShippingWeight) ||
            // [L771]
            (isPresent(maximumFulfillmentWeight) && maximumFulfillmentWeight < totalShippingWeight)
          ) {
            // [L774] THE LIST-INDEX THROW HAZARD, REPRODUCED.
            //
            // LEGACY-DEFECT [model/service/PromotionService.cfc:L774]: listFindNoCase's 0-on-miss
            // result is fed straight into ListDeleteAt as a 1-based position, so two
            // fulfillment-type qualifiers excluding the same fulfillment make the second delete
            // throw. Unreachable in production only because L752 has no callers.
            //
            // Preserved deliberately; do not fix without a product decision.
            //
            // The hazard is REACHABLE BY CONFIGURATION, not merely latent: the outer qualifier loop
            // at L760 can encounter several fulfillment-type qualifiers, and if two exclude the
            // SAME fulfillment on weight the first deletes the ID and the second's `listFindNoCase`
            // answers 0. Within one qualifier's inner loop each fulfillment is visited once, so a
            // single qualifier cannot double-delete. No zero-position guard is added and the error
            // is not swallowed.
            //
            // LEGACY-NOTE [model/service/PromotionService.cfc:L774]: twin of the array-index hazard
            // at L708/L709, owned by ./qualifierQualification.ts, which reproduces the ARRAY-index
            // form of `arrayFind` feeding `arrayDeleteAt`. Ownership corrected against source per
            // the locator-drift rule.
            //
            // CFML parity [model/service/PromotionService.cfc:L774]: the source writes
            // `ListDeleteAt` with a capital L and `listFindNoCase` with a lowercase l in one
            // expression, because CFML function names are case-insensitive. TypeScript's are not,
            // so each appears below in its one canonical spelling.
            qualifiedFulfillmentIDs = listDeleteAt(
              qualifiedFulfillmentIDs,
              listFindNoCase(qualifiedFulfillmentIDs, orderFulfillment.orderFulfillmentID),
            );
          }
        }
      }
    }

    // [L780]
    return qualifiedFulfillmentIDs;
  }

  /**
   * Count how many times ONE order item qualifies under a promotion period's order-item qualifiers.
   *
   * Ported from `private numeric function getPromotionPeriodOrderItemQualificationCount(required
   * any promotionPeriod, required any orderItem, required any order)`
   * [model/service/PromotionService.cfc:L783-L849]. SYNCHRONOUS: the body reaches no DAO and no
   * ORM, and the legacy parameter order is not rearranged.
   *
   * TWO ORDER ITEMS ARE IN PLAY AND THE DISTINCTION IS LOAD-BEARING. The `orderItem` PARAMETER is
   * the TARGET, whose qualification count is being computed. `thisOrderItem`, declared inside the
   * inner loop and named exactly as the legacy names it at
   * [model/service/PromotionService.cfc:L800], is the item currently being examined. Every clause
   * of the exclusion disjunction compares one against the other.
   *
   * @param promotionPeriod - the period whose qualifiers are applied.
   * @param orderItem - the TARGET item whose qualification count is being computed.
   * @param order - the read-only order projection supplying the seed and the items to examine.
   * @returns the number of times the target item qualifies. Never negative on any returning path.
   */
  public getPromotionPeriodOrderItemQualificationCount(
    promotionPeriod: PromotionPeriod,
    orderItem: OrderItemView,
    order: OrderView,
  ): number {
    // [L784-L785] THE SEED IS THE WHOLE ORDER'S SALE QUANTITY, NOT THE TARGET ITEM'S.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L785, L848]: with no order-item qualifiers
    // this returns the WHOLE ORDER's total sale quantity as a single item's qualification count;
    // that value feeds the L223-L224 ratchet in ./rewardUsageLedger.ts and therefore shapes
    // use-limit enforcement. Neither the L794 gate nor the L840 early return can fire when a period
    // declares no order-item qualifier, so control reaches L848 with the seed untouched - a number
    // that has nothing to do with the item that was asked about. The facade reads it at L222 as
    // `qualificationQuantity` and the ratchet drives `maximumUsePerOrder` down to
    //   `min(current, qualificationQuantity * maximumUsePerQualification)`,
    // so this seed reaches the money.
    let allQualifiersCount = order.totalSaleQuantity;

    // [L787-L788]
    //
    // CFML parity [model/service/PromotionService.cfc:L787]: source comment says "fulfillment
    // qualifiers"; the loop filters order-item qualifiers. Copy-pasted from orphan #1's L759, where
    // it is accurate. The misleading wording is recorded, not reproduced.
    const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();
    for (const qualifier of promotionQualifiers) {
      // [L791] Reset per qualifier, not accumulated across them.
      let qualifierCount = 0;

      // [L793-L794] The order-item-type gate.
      //
      // CFML parity [model/service/PromotionService.cfc:L794]: `listFindNoCase` returns a 1-based
      // index or 0, so the result is compared explicitly against `0` and never used as a truthy
      // value. Same rule as L865, L900, L935 and L966 in ./orderItemMembership.ts.
      //
      // THE COMMA-LIST TOKEN ORDER DIFFERS BY SITE AND IS PRESERVED VERBATIM PER SITE. This site
      // and the facade's L200 both write `"merchandise,subscription,contentAccess"`, while L714 in
      // ./qualifierQualification.ts writes `"contentAccess,merchandise,subscription"`. All three
      // are membership tests, so the order is behaviourally irrelevant; hence no shared constant is
      // extracted and no order is normalised: inferring a PRIORITY from either ordering would
      // invent behaviour.
      const qualifierType = qualifier.getQualifierType() ?? '';

      if (listFindNoCase('merchandise,subscription,contentAccess', qualifierType) > 0) {
        // [L808-L818] read this SIX times inside the innermost loop; captured once per qualifier.
        //
        // CFML parity [model/service/PromotionService.cfc:L808]: the accessor reads
        // "RewardMatchingType" but is invoked on a `PromotionQualifier`, not a `PromotionReward`.
        // The property genuinely lives on the qualifier [model/entity/PromotionQualifier.cfc:L65];
        // the name is a naming artifact, carried over verbatim because the accessor name is part of
        // the ported surface.
        const rewardMatchingType: RewardMatchingType | undefined =
          qualifier.getRewardMatchingType();

        // [L796-L797] The element the legacy re-reads at L800 is the loop subject here.
        const orderItems: readonly OrderItemView[] = order.orderItems;

        for (const thisOrderItem of orderItems) {
          // [L801] Seeded to the FULL item quantity, not to 1. A plain integer count, never
          // `Money`.
          let orderItemQualifierCount = thisOrderItem.quantity;

          // [L803-L819] THE SEVEN-CLAUSE EXCLUSION DISJUNCTION. It asks "does this item fail to
          // qualify for any reason", and a single true operand zeroes the count.
          //
          // CFML parity [model/service/PromotionService.cfc:L814-L818]: the brand cascade is
          // order-critical - L818's double dereference is null-safe only because L814 and L816
          // short-circuit first. Do not reorder, merge, or collapse these three clauses.
          //
          // THE `sku`, `product` AND `productType` CLAUSES ARE NOT NULL-GUARDED AT ALL: L810 and
          // L812 dereference through to the product and the product type with no guard at all, so a
          // SKU whose product has no product type raises at L812, and only `brand` receives null
          // handling. THE ASYMMETRY IS PRESERVED and no guard is added - see the `requireProduct`,
          // `requireProductType` and `requireBrand` helpers.
          //
          // THERE IS NO DEFAULT AND NO `else` FOR AN UNRECOGNISED `rewardMatchingType`. The
          // vocabulary is `any | sku | product | productType | brand`
          // [model/entity/PromotionQualifier.cfc:L109-L113], and `any` - the FIRST option the admin
          // is offered - matches none of the six literal comparisons, so none of clauses 2-7 fires
          // and the item qualifies on clause 1 alone. An absent value behaves identically, and that
          // PERMISSIVE FALLTHROUGH is designed, not accidental, so nothing is validated and no
          // default branch is added.
          //
          // ★ ALL SIX COMPARISONS FOLD CASE, AND HERE THE POLARITY MAKES THE BUG THE OPPOSITE SHAPE.
          //
          // CFML parity [model/service/PromotionService.cfc:L808, L810, L812, L814, L816, L818]: every
          // one of these tests is `==`, case-insensitive in CFML, and `SwPromoQual.rewardMatchingType`
          // is a plain string with no check constraint - so a qualifier persisting `'Brand'` selects
          // the brand clauses in the legacy engine. They are matched through
          // {@link matchesRewardMatchingType}.
          //
          // Note what an exact comparison did HERE, because it is not the silent-no-discount failure of
          // the other C12 sites. These clauses are EXCLUSIONS: a mis-cased `'Sku'` made clause 2 miss,
          // so the item was NOT excluded, and it qualified for a reward it should never have received.
          // The customer was OVER-discounted. Both directions are wrong and both are money; the fold
          // fixes them together.
          //
          // The fold does NOT disturb the `any` fall-through above: `any` is not one of the six
          // literals under case folding either, so it still matches nothing and still qualifies the
          // item on clause 1 alone. Nor does it disturb the order-critical brand trio below - folding
          // changes which values match, never the short-circuit order that keeps clause 7's double
          // dereference safe.
          if (
            // [L805] Clause 1: the sibling membership call, NEGATED.
            //
            // CFML parity [model/service/PromotionService.cfc:L805]: keyword-argument call form,
            // negated; translated to a positional invocation on the injected collaborator with the
            // negation preserved. SYNCHRONOUS and deliberately not awaited.
            !this.orderItemMembership.getOrderItemInQualifier(qualifier, thisOrderItem) ||
            // [L808] Clause 2: sku identity. `sku` is non-nullable on the view, matching the legacy
            // site, which dereferences it without a guard.
            (matchesRewardMatchingType(rewardMatchingType, 'sku') &&
              thisOrderItem.sku.getSkuID() !== orderItem.sku.getSkuID()) ||
            // [L810] Clause 3: product identity. Unguarded in the legacy; raises on an absent product.
            (matchesRewardMatchingType(rewardMatchingType, 'product') &&
              requireProduct(thisOrderItem).getProductID() !==
                requireProduct(orderItem).getProductID()) ||
            // [L812] Clause 4: product-type identity. Unguarded in the legacy at both dereferences.
            (matchesRewardMatchingType(rewardMatchingType, 'productType') &&
              requireProductType(thisOrderItem).getProductTypeID() !==
                requireProductType(orderItem).getProductTypeID()) ||
            // [L814] Clause 5: the examined item has no brand. FIRST of the order-critical trio.
            (matchesRewardMatchingType(rewardMatchingType, 'brand') &&
              isAbsent(requireProduct(thisOrderItem).getBrand())) ||
            // [L816] Clause 6: the TARGET item has no brand. SECOND of the trio.
            (matchesRewardMatchingType(rewardMatchingType, 'brand') &&
              isAbsent(requireProduct(orderItem).getBrand())) ||
            // [L818] Clause 7: brand identity. Its double dereference is safe only because clauses 5
            // and 6 already answered false.
            (matchesRewardMatchingType(rewardMatchingType, 'brand') &&
              requireBrand(thisOrderItem).getBrandID() !== requireBrand(orderItem).getBrandID())
          ) {
            // [L821]
            orderItemQualifierCount = 0;
          }

          // [L825] Added in UNCONDITIONALLY, after the `if` closes at L823. The order is
          // seed-then-maybe-zero-then-always-add and it is not restructured into
          // add-only-when-qualifying: the arithmetic would agree, but the structure is what a
          // reviewer diffs against the source.
          qualifierCount += orderItemQualifierCount;
        }

        // [L829-L832] The minimum-item-quantity division.
        //
        // LEGACY-NOTE [model/service/PromotionService.cfc:L830]: a null minimumItemQuantity leaves
        // the accumulated count intact (PERMISSIVE), while the structurally parallel guard at L742
        // in ./qualifierQualification.ts has the opposite RESTRICTIVE polarity, leaving
        // `qualificationCount` at 0. Do not normalise either.
        const minimumItemQuantity = qualifier.getMinimumItemQuantity();
        if (isPresent(minimumItemQuantity)) {
          // CFML parity [model/service/PromotionService.cfc:L831]: CFML int(x/0) throws while
          // Math.trunc(x/0) yields Infinity, so the throw is reproduced explicitly - behaviour
          // reproduction, not added validation. The divisor passes only `!isNull`; there is NO
          //   `> 0`
          // check here, in deliberate contrast with the `gt 0` overrides at L566 and L574, so a
          // persisted `0` reaches the division, where `Math.trunc(x / 0)` is `Infinity` and
          // `Math.trunc(0 / 0)` is `NaN` and either would propagate silently into the ratchet.
          if (minimumItemQuantity === 0) {
            throw new RangeError(
              `Division by zero computing the promotion period order-item qualification count: ` +
                `minimumItemQuantity is 0. Reproduces the CFML failure at ` +
                `model/service/PromotionService.cfc:L831, where a zero divisor raises rather than ` +
                `yielding Infinity.`,
            );
          }

          // [L831] `int()` TRUNCATES TOWARD ZERO - it does not round - so `Math.trunc` is the only
          // correct translation: `Math.round` would grant an extra qualification and therefore an
          // extra discount, and `Math.floor` diverges on negatives, which are reachable because
          // neither operand is validated for sign. Both operands are plain integer counts, so this
          // is deliberately NOT routed through `Money` or `../../lib/cfml/precision.js`.
          //
          // THE FOLDER-WIDE UNGUARDED-DIVISION REGISTER, AND NONE OF THE FOUR IS GUARDED: L299
          // belongs to ./rewardUsageLedger.ts, L486 to ./overUseStripping.ts, L743 to
          // ./qualifierQualification.ts, and L831 to this module.
          qualifierCount = Math.trunc(qualifierCount / minimumItemQuantity);
        }

        // [L834-L837] Keep the LOWER of the running minimum and this qualifier's count. The
        // comparison is STRICT, so an EQUAL count does not replace the incumbent - this folder's
        // incumbent-favouring tie-break family, alongside the strict order-level bounds in
        // ./qualifierQualification.ts and both of the engine's opposed insertion sorts.
        if (qualifierCount < allQualifiersCount) {
          // [L836]
          allQualifiersCount = qualifierCount;
        }

        // [L839-L842] The early return.
        //
        // CFML parity [model/service/PromotionService.cfc:L839]: the source comment misspells
        // "qualifications" as "qualifiacitons". Comment text rather than a data contract, so the
        // corrected spelling is used here.
        //
        // THE STRICTNESS IS MIXED IN ADJACENT LINES AND BOTH FORMS ARE REPRODUCED, NOT HARMONISED:
        // L835 is strict `<` while L840 is NON-STRICT `<=`. The test admits negatives but the
        // return does not propagate one, so a returning zero is a genuine zero. This return sits
        // INSIDE the L794 gate and INSIDE the qualifier loop.
        if (allQualifiersCount <= 0) {
          // [L841]
          return 0;
        }
      }
    }

    // [L848]
    return allQualifiersCount;
  }
}
