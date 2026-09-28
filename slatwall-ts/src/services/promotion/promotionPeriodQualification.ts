/**
 * Promotion period qualification: whether a promotion period may be applied to an order at all,
 * which of the order's fulfillments it permits, and - for the two orphaned period-level helpers
 * hosted here.
 *
 * LEGACY-NOTE: the folder's no-intra-folder-imports discipline is DIRECTIONAL - a composing facade
 * may import all nine modules, and nothing here may import such a facade back. Sibling imports
 * among the nine are permitted while the graph stays acyclic.
 *
 * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L109-L113]: `rewardMatchingType` was cited as
 * the four-value vocabulary `sku | product | productType | brand`; the entity declares five select
 * options and the first is `any`.
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
// not let me write inline.

/**
 * A narrowing wrapper over the shared `isNullish()` port of CFML `isNull()`, in the POSITIVE
 * polarity the source writes as `!isNull(...)`.
 *
 * CFML parity [model/service/PromotionService.cfc:L566, L574, L575, L769, L771, L830]: the six
 * `!isNull(...)` tests this module reproduces - the two period use-count overrides, the account
 * presence test, the two fulfillment weight bounds.
 */
function isPresent<TValue>(value: TValue | undefined): value is TValue {
  return !isNullish(value);
}

/**
 * The same wrapper in the NEGATIVE polarity the source writes as `isNull(...)`.
 *
 * CFML parity [model/service/PromotionService.cfc:L814, L816]: the two brand-absence clauses of
 * the exclusion disjunction, the only bare `isNull(...)` tests in the three ported ranges.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Does the qualifier's type select the given branch, with case folded as CFML folds it?
 *
 * @param qualifierType the qualifier's type, already coerced to `''` when absent.
 * @param branch the branch being tested, in the source's canonical spelling.
 * @returns `true` when the two are equal with case folded.
 */
function matchesQualifierType(qualifierType: string, branch: string): boolean {
  return cfEquals(qualifierType, branch);
}

/**
 * Does the qualifier's reward-matching type select the given exclusion clause, with case folded?
 *
 * @param rewardMatchingType the qualifier's reward-matching type, which may be absent.
 * @param clause the clause being tested, in the source's canonical spelling.
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
 * @param list the comma-delimited list to delete from.
 * @param position the 1-based position to delete.
 * @param delimiter a single delimiter character; defaults to a comma, as CFML does.
 * @returns the list with exactly that one element removed.
 */
// LEGACY-DEFECT [model/service/PromotionService.cfc:L774]: `listFindNoCase`'s 0-on-miss result is
// fed straight into `ListDeleteAt` as a 1-based position, so two fulfillment-type qualifiers
// excluding the same fulfillment make the second delete throw. Unreachable in production only
// because L752 has no callers.
// Preserved deliberately; do not fix without a product decision.
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
 * `...getSku().getProduct()` at four sites inside the exclusion disjunction without a single null
 * guard.
 *
 * The ported `Sku.getProduct()` answers `Product | undefined` because the association can
 * genuinely be cleared.
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
 * `...getSku().getProduct().getProductType().getProductTypeID()` is dereferenced twice on one
 * line, once for the item being examined and once for the target, with no null guard on either.
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
 * The order item's brand, for the one clause that dereferences it.
 *
 * CFML parity [model/service/PromotionService.cfc:L814-L818]: unlike the two helpers above, this
 * raise is PROVABLY UNREACHABLE in the preserved clause order - L818 is only evaluated once L814
 * and L816 have both answered false.
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
 * one unit and three verbatim-named methods must coexist.
 *
 * All three collaborators replace a legacy DI/1 convention-scanned `property name="xService";`
 * declaration and are constructor-injected.
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
   * @param promotionPeriod the period whose qualification is being decided.
   * @param order the read-only order projection to decide it against.
   * @returns the period's verdict, in exactly the shape the legacy struct carried.
   */
  public async getPromotionPeriodQualificationDetails(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): Promise<PeriodQualification> {
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: the qualifier loop writes
    // `qualifiedFulfillments`, a key this seed never creates, documented as entities at L93 but
    // assigned ID strings, and read by nothing - every consumer reads `qualifiedFulfillmentIDs` at
    // L209 and L351. The dead key is not reproduced as a member; it is recorded here.
    // Preserved deliberately; do not fix without a product decision.

    // [model/service/PromotionService.cfc:L552-L557] The four-key seed, in source order.
    const qualificationDetails: PeriodQualification = {
      qualificationsMeet: true,
      qualifiedFulfillmentIDs: [],
      qualifierDetails: [],
      orderItems: {},
    };

    // [model/service/PromotionService.cfc:L559-L561] the default is "all fulfillments qualify":
    // every fulfillment ID on the order is appended before any qualification work happens.
    const orderFulfillments: readonly OrderFulfillmentView[] = order.orderFulfillments;
    for (const orderFulfillment of orderFulfillments) {
      qualificationDetails.qualifiedFulfillmentIDs.push(orderFulfillment.orderFulfillmentID);
    }
    const explicitlyQualifiedFulfillmentIDs: string[] = [];

    // [model/service/PromotionService.cfc:L566-L571] GATE 1: the period's own use count. Part of
    // must-preserve area #1.
    //
    // CFML parity [model/service/PromotionService.cfc:L566, L574]: a persisted maximum of exactly
    // 0 means UNLIMITED - the `gt 0` guard fails and the limit check is skipped entirely.
    const maximumUseCount = promotionPeriod.getMaximumUseCount();
    if (isPresent(maximumUseCount) && maximumUseCount > 0) {
      // [model/service/PromotionService.cfc:L567] The only reason this method is async. The call
      // is issued only when the guard above passed, exactly as the legacy issues it; the two
      // repository calls are neither parallelised, batched nor memoized.
      const periodUseCount =
        await this.promotionRepository.getPromotionPeriodUseCount(promotionPeriod);

      // [model/service/PromotionService.cfc:L568] the comparison is non-strict: reaching the
      // maximum use count exactly disqualifies../qualifierQualification.ts differs.
      if (periodUseCount >= maximumUseCount) {
        qualificationDetails.qualificationsMeet = false;
      }
    }

    // [model/service/PromotionService.cfc:L574-L581] GATE 2: this account's use count. Also
    // must-preserve area #1.
    const maximumAccountUseCount = promotionPeriod.getMaximumAccountUseCount();
    if (isPresent(maximumAccountUseCount) && maximumAccountUseCount > 0) {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L574-L581]: the `!isNull(getAccount())`
      // guard at L575 wraps the whole check, so an accountless guest order satisfies
      // `maximumAccountUseCount` unconditionally and can redeem a per-account-limited promotion
      // repeatedly. The general period limit at L566-L571 is the only ceiling such an order faces.
      // Preserved deliberately; do not fix without a product decision.
      //
      // JUDGMENT CALL: the legacy tests the out-of-scope `Account` ENTITY via
      // `!isNull(order.getAccount())` and no such entity exists in the target.
      const accountID = order.accountID;
      if (isPresent(accountID)) {
        // [model/service/PromotionService.cfc:L576] Issued only when both L574 and L575 passed.
        // That exact conditionality is preserved.
        const periodAccountUseCount =
          await this.promotionRepository.getPromotionPeriodAccountUseCount(
            promotionPeriod,
            accountID,
          );

        // [model/service/PromotionService.cfc:L577] Non-strict, as at L568.
        if (periodAccountUseCount >= maximumAccountUseCount) {
          qualificationDetails.qualificationsMeet = false;
        }
      }
    }

    // [model/service/PromotionService.cfc:L584] The qualifier loop runs only if both use-count
    // gates left the flag true.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L584]: there are two distinct failure shapes
    // and both are reproduced rather than normalised into one.
    if (qualificationDetails.qualificationsMeet) {
      // [model/service/PromotionService.cfc:L587] A materialized association, so plain synchronous
      // iteration.
      const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();

      for (const qualifier of promotionQualifiers) {
        // [model/service/PromotionService.cfc:L590] The sibling call.
        //
        // CFML parity [model/service/PromotionService.cfc:L590]: positional two-argument call form
        // preserved.
        const thisQualifierDetails: QualifierQualification =
          this.qualifierQualificationEvaluator.getQualifierQualificationDetails(qualifier, order);

        // [model/service/PromotionService.cfc:L593] The legacy writes a bare numeric truthiness
        // test.
        if (thisQualifierDetails.qualificationCount > 0) {
          // [model/service/PromotionService.cfc:L596] The fulfillment-type discriminator.
          //
          // The accessor is nullable, and CFML renders an unset string as the empty string in a
          // comparison, so the `?? ''` reproduces that coercion.
          const qualifierType = qualifier.getQualifierType() ?? '';

          if (matchesQualifierType(qualifierType, 'fulfillment')) {
            // [model/service/PromotionService.cfc:L599-L605] Union the qualifier's own qualified
            // fulfillment IDs into the local accumulator, skipping duplicates.
            for (const orderFulfillmentID of thisQualifierDetails.qualifiedFulfillmentIDs) {
              // CFML parity [model/service/PromotionService.cfc:L602]: arrayFind returns a 1-based
              // index or 0, so the negated form is a membership test - the only `!arrayFind` site
              // in the component.
              if (!explicitlyQualifiedFulfillmentIDs.includes(orderFulfillmentID)) {
                explicitlyQualifiedFulfillmentIDs.push(orderFulfillmentID);
              }
            }
          }

          // [model/service/PromotionService.cfc:L609] Attach the qualifier's verdict WHOLESALE -
          // the object exactly as returned, not cloned, filtered or projected.
          qualificationDetails.qualifierDetails.push(thisQualifierDetails);
        } else {
          // [model/service/PromotionService.cfc:L612-L616] A SINGLE non-qualifying qualifier
          // aborts the whole period, immediately.
          qualificationDetails.qualificationsMeet = false;
          qualificationDetails.qualifiedFulfillmentIDs.length = 0;
          qualificationDetails.qualifierDetails.length = 0;

          return qualificationDetails;
        }
      }
    }

    // [model/service/PromotionService.cfc:L621-L623] the orphaned write.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L563, L595-L606, L621-L623]: the entire
    // explicitlyQualifiedFulfillmentIDs computation feeds only the orphaned key.
    if (explicitlyQualifiedFulfillmentIDs.length > 0) {
      qualificationDetails.qualifiedFulfillments = explicitlyQualifiedFulfillmentIDs;
    }
    return qualificationDetails;
  }

  /**
   * Build the COMMA-DELIMITED list of fulfillment IDs a promotion period's fulfillment qualifiers
   * leave standing, filtering on weight bounds only.
   *
   * @param promotionPeriod the period whose fulfillment qualifiers are applied.
   * @param order the read-only order projection supplying the fulfillments.
   * @returns a comma-delimited list of the surviving fulfillment IDs.
   */
  public getPromotionPeriodQualifiedFulfillmentIDList(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): string {
    // [model/service/PromotionService.cfc:L753] The accumulator is a LIST, not an array.
    let qualifiedFulfillmentIDs = '';

    // [model/service/PromotionService.cfc:L755-L757] Seed with every fulfillment ID.
    //
    // CFML parity [model/service/PromotionService.cfc:L755, L767]: the loop variable `f` is
    // `var`'d twice in one CFML function scope - here and again in the inner loop below - and CFML
    // has one function scope, so the second declaration redeclares the same variable.
    const orderFulfillments: readonly OrderFulfillmentView[] = order.orderFulfillments;
    for (const orderFulfillment of orderFulfillments) {
      qualifiedFulfillmentIDs = listAppend(
        qualifiedFulfillmentIDs,
        orderFulfillment.orderFulfillmentID,
      );
    }

    // [model/service/PromotionService.cfc:L759-L760] The source comment above L760 says "Loop over
    // Qualifiers looking for fulfillment qualifiers", and here it is CORRECT - this loop really
    // does filter fulfillment qualifiers.
    const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();
    for (const qualifier of promotionQualifiers) {
      // [model/service/PromotionService.cfc:L764] Treated exactly as L596: a case-FOLDED
      // comparison against the lowercase literal, with the same audit and the same correction.
      const qualifierType = qualifier.getQualifierType() ?? '';

      if (matchesQualifierType(qualifierType, 'fulfillment')) {
        for (const orderFulfillment of orderFulfillments) {
          // [model/service/PromotionService.cfc:L769, L771] both BOUNDS are STRICT and both are
          // null-guarded, so boundary equality does not exclude: a fulfillment weighing exactly
          // the minimum, or exactly the maximum, survives.
          const minimumFulfillmentWeight = qualifier.getMinimumFulfillmentWeight();
          const maximumFulfillmentWeight = qualifier.getMaximumFulfillmentWeight();
          const totalShippingWeight = orderFulfillment.totalShippingWeight;

          if (
            (isPresent(minimumFulfillmentWeight) &&
              minimumFulfillmentWeight > totalShippingWeight) ||
            (isPresent(maximumFulfillmentWeight) && maximumFulfillmentWeight < totalShippingWeight)
          ) {
            // [model/service/PromotionService.cfc:L774] the list-index throw hazard, reproduced.
            //
            // LEGACY-NOTE [model/service/PromotionService.cfc:L774]: twin of the array-index
            // hazard at L708/L709, owned by./qualifierQualification.ts, which reproduces the
            // ARRAY-index form of `arrayFind` feeding `arrayDeleteAt`.
            qualifiedFulfillmentIDs = listDeleteAt(
              qualifiedFulfillmentIDs,
              listFindNoCase(qualifiedFulfillmentIDs, orderFulfillment.orderFulfillmentID),
            );
          }
        }
      }
    }
    return qualifiedFulfillmentIDs;
  }

  /**
   * Count how many times one order item qualifies under a promotion period's order-item
   * qualifiers.
   *
   * @param promotionPeriod the period whose qualifiers are applied.
   * @param orderItem the TARGET item whose qualification count is being computed.
   * @param order the read-only order projection supplying the seed and the items to examine.
   * @returns the number of times the target item qualifies.
   */
  public getPromotionPeriodOrderItemQualificationCount(
    promotionPeriod: PromotionPeriod,
    orderItem: OrderItemView,
    order: OrderView,
  ): number {
    // [model/service/PromotionService.cfc:L784-L785] the seed is the whole order's sale quantity,
    // not the target item's.
    let allQualifiersCount = order.totalSaleQuantity;

    // CFML parity [model/service/PromotionService.cfc:L787]: source comment says "fulfillment
    // qualifiers"; the loop filters order-item qualifiers. Copy-pasted from orphan #1's L759,
    // where it is accurate.
    const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();
    for (const qualifier of promotionQualifiers) {
      // [model/service/PromotionService.cfc:L791] Reset per qualifier, not accumulated across
      // them.
      let qualifierCount = 0;

      // [model/service/PromotionService.cfc:L793-L794] The order-item-type gate.
      //
      // CFML parity [model/service/PromotionService.cfc:L794]: `listFindNoCase` returns a 1-based
      // index or 0, so the result is compared explicitly against `0` and never used as a truthy
      // value. Same rule as L865, L900, L935 and L966 in./orderItemMembership.ts.
      const qualifierType = qualifier.getQualifierType() ?? '';

      if (listFindNoCase('merchandise,subscription,contentAccess', qualifierType) > 0) {
        // [model/service/PromotionService.cfc:L808-L818] read this six times inside the innermost
        // loop; captured once per qualifier.
        //
        // CFML parity [model/service/PromotionService.cfc:L808]: the accessor reads
        // "RewardMatchingType" but is invoked on a `PromotionQualifier`, not a `PromotionReward`.
        const rewardMatchingType: RewardMatchingType | undefined =
          qualifier.getRewardMatchingType();

        // [model/service/PromotionService.cfc:L796-L797] The element the legacy re-reads at L800
        // is the loop subject here.
        const orderItems: readonly OrderItemView[] = order.orderItems;

        for (const thisOrderItem of orderItems) {
          // [model/service/PromotionService.cfc:L801] Seeded to the FULL item quantity, not to 1.
          // A plain integer count, never `Money`.
          let orderItemQualifierCount = thisOrderItem.quantity;

          // [model/service/PromotionService.cfc:L803-L819] the seven-clause exclusion disjunction.
          // It asks "does this item fail to qualify for any reason", and a single true operand
          // zeroes the count.
          //
          // There is no default and no `else` for an unrecognised `rewardMatchingType`.
          if (
            // [model/service/PromotionService.cfc:L805] Clause 1: the sibling membership call,
            // NEGATED.
            //
            // CFML parity [model/service/PromotionService.cfc:L805]: keyword-argument call form,
            // negated; translated to a positional invocation on the injected collaborator with the
            // negation preserved. SYNCHRONOUS and deliberately not awaited.
            !this.orderItemMembership.getOrderItemInQualifier(qualifier, thisOrderItem) ||
            // [model/service/PromotionService.cfc:L808] Clause 2: sku identity. `sku` is
            // non-nullable on the view, matching the legacy site, which dereferences it without a
            // guard.
            (matchesRewardMatchingType(rewardMatchingType, 'sku') &&
              !cfEquals(thisOrderItem.sku.getSkuID(), orderItem.sku.getSkuID())) ||
            // [model/service/PromotionService.cfc:L810] Clause 3: product identity. Unguarded in
            // the legacy; raises on an absent product.
            (matchesRewardMatchingType(rewardMatchingType, 'product') &&
              !cfEquals(
                requireProduct(thisOrderItem).getProductID(),
                requireProduct(orderItem).getProductID(),
              )) ||
            // [model/service/PromotionService.cfc:L812] Clause 4: product-type identity. Unguarded
            // in the legacy at both dereferences.
            (matchesRewardMatchingType(rewardMatchingType, 'productType') &&
              !cfEquals(
                requireProductType(thisOrderItem).getProductTypeID(),
                requireProductType(orderItem).getProductTypeID(),
              )) ||
            // [model/service/PromotionService.cfc:L814] Clause 5: the examined item has no brand.
            // FIRST of the order-critical trio.
            (matchesRewardMatchingType(rewardMatchingType, 'brand') &&
              isAbsent(requireProduct(thisOrderItem).getBrand())) ||
            // [model/service/PromotionService.cfc:L816] Clause 6: the TARGET item has no brand.
            // SECOND of the trio.
            (matchesRewardMatchingType(rewardMatchingType, 'brand') &&
              isAbsent(requireProduct(orderItem).getBrand())) ||
            // [model/service/PromotionService.cfc:L818] Clause 7: brand identity. Its double
            // dereference is safe only because clauses 5 and 6 already answered false.
            (matchesRewardMatchingType(rewardMatchingType, 'brand') &&
              !cfEquals(
                requireBrand(thisOrderItem).getBrandID(),
                requireBrand(orderItem).getBrandID(),
              ))
          ) {
            orderItemQualifierCount = 0;
          }
          qualifierCount += orderItemQualifierCount;
        }

        // [model/service/PromotionService.cfc:L829-L832] The minimum-item-quantity division.
        //
        // LEGACY-NOTE [model/service/PromotionService.cfc:L830]: a null minimumItemQuantity leaves
        // the accumulated count intact (PERMISSIVE), while the structurally parallel guard at L742
        // in./qualifierQualification.ts has the opposite RESTRICTIVE polarity.
        const minimumItemQuantity = qualifier.getMinimumItemQuantity();
        if (isPresent(minimumItemQuantity)) {
          // CFML parity [model/service/PromotionService.cfc:L831]: CFML int(x/0) throws while
          // Math.trunc(x/0) yields Infinity, so the throw is reproduced explicitly - behaviour
          // reproduction, not added validation.
          if (minimumItemQuantity === 0) {
            throw new RangeError(
              `Division by zero computing the promotion period order-item qualification count: ` +
                `minimumItemQuantity is 0. Reproduces the CFML failure at ` +
                `model/service/PromotionService.cfc:L831, where a zero divisor raises rather than ` +
                `yielding Infinity.`,
            );
          }

          // [model/service/PromotionService.cfc:L831] `int()` truncates toward zero - it does not
          // round - so `Math.trunc` is the only correct translation: `Math.round` would grant an
          // extra qualification and therefore an extra discount, and `Math.floor` diverges on
          // negatives.
          qualifierCount = Math.trunc(qualifierCount / minimumItemQuantity);
        }

        // [model/service/PromotionService.cfc:L834-L837] Keep the LOWER of the running minimum and
        // this qualifier's count.
        if (qualifierCount < allQualifiersCount) {
          allQualifiersCount = qualifierCount;
        }

        // [model/service/PromotionService.cfc:L839-L842] The early return.
        //
        // CFML parity [model/service/PromotionService.cfc:L839]: the source comment misspells
        // "qualifications" as "qualifiacitons". Comment text rather than a data contract, so the
        // corrected spelling is used here.
        if (allQualifiersCount <= 0) {
          return 0;
        }
      }
    }
    return allQualifiersCount;
  }
}
