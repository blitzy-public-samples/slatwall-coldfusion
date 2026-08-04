/**
 * Sale-price seeding - the pass that enters sale prices into the discount competition.
 *
 * Ports [model/service/PromotionService.cfc:L144-L162]. Every order item whose SKU carries a sale
 * price strictly below the SKU's own price contributes one qualified-discount record to the
 * accumulator BEFORE the reward traversal at [model/service/PromotionService.cfc:L164] begins.
 * Seeding first is behavioural, not stylistic: it is what lets a sale price compete with reward
 * discounts in the descending insertion sort the facade performs afterwards.
 *
 * The pass adds nothing the legacy lacks. It does not sort, round, quantize or format - quantization
 * belongs to the reward path at [model/service/PromotionService.cfc:L1017] - and it adds no
 * non-negativity or presence guard. It also holds no state: the accumulator belongs to the caller
 * and lives for exactly one invocation, mirroring `var orderItemQulifiedDiscounts = {}` at
 * [model/service/PromotionService.cfc:L142]. Reusing one map across invocations on a warm container
 * would surface one customer's discount in another customer's order.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L142]: the accumulator is spelled
 * `orderItemQulifiedDiscounts` in the source - "Qulified", missing the `a`. The target uses the
 * corrected spelling because that identifier is a function-local accumulator rather than a column, a
 * JSON key or a parameter name. Identifiers that ARE contracts stay verbatim, such as
 * `hb_permission="promotionPeriod.promtionRewards"` at [model/entity/PromotionReward.cfc:L57].
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L121-L131]: the illustrative docblock there
 * promises five members on each accumulator record, while all three construction sites write only
 * `promotionRewardID`, `promotion` and `discountAmount`. The target follows the code and imports the
 * record type from `../../domain/promotionEngine/qualifiedDiscountTypes.js`, so the shape cannot
 * drift; the two extra names exist on the reward ledger's per-item usage rows instead.
 */

import type { Promotion } from '../../domain/entities/promotion.js';
import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import { structKeyExists } from '../../lib/cfml/struct.js';

/**
 * Resolves a {@link Promotion} from an opaque promotion identifier.
 *
 * Stands in for the framework accessor at [model/service/PromotionService.cfc:L157] -
 * `this.getPromotion(salePriceDetails.promotionID)` - an inherited `HibachiService` dynamic entity
 * getter resolved at request time, with no counterpart in the ported port set. The legacy name is
 * kept verbatim so the call site reads as the source line it replaces.
 *
 * JUDGMENT CALL: the framework accessor becomes a constructor-injected collaborator typed to this
 * local interface rather than a fourteenth port or a new member on
 * `../../domain/ports/promotionRepository.js`, whose seven members are frozen reads and none of which
 * loads a `Promotion` by identifier. Declaring it under `src/domain/ports/` would create that
 * fourteenth port by another name, so it is declared beside its only consumer. A service locator, a
 * runtime scan or module-level state are all excluded outright.
 *
 * THE RETURN IS NON-NULLABLE, DELIBERATELY. The legacy assigns the result straight into the record
 * with no absence test and `QualifiedDiscount.promotion` is required, so
 *   `Promise<Promotion | undefined>`
 * would force a throw or a skip that the legacy never performs.
 *
 * The declaration is module-local and unexported: publishing it would make it an importable contract
 * any adapter may implement, which is a port in everything but the folder it sits in. Structural
 * typing means `src/handlers/bootstrap.ts` still wires the collaborator by passing any object with a
 * matching `getPromotion` to {@link SalePriceSeeder}'s constructor.
 */
interface SalePricePromotionResolver {
  getPromotion(promotionID: string): Promise<Promotion>;
}

/**
 * Store `value` on `target` under `key` as an OWN, enumerable data property.
 *
 * ★ WHY THIS EXISTS INSTEAD OF `target[key] = value`, AND WHY IT IS A MONEY CONCERN. The key is an
 * opaque `orderItemID` that arrives from the out-of-scope order aggregate across the anti-corruption
 * boundary, so it is EXTERNALLY SOURCED and this module neither parses nor validates it. A plain
 * object inherits `Object.prototype`, whose legacy `__proto__` accessor intercepts
 * `target['__proto__'] = value`, so the bucket is silently DISCARDED - and because the value is an
 * array, the accumulator's own prototype is replaced as well. The application pass then finds no key
 * for that order item and applies NO sale-price discount to it, while the sale price it was entitled
 * to has already been computed. `Object.defineProperty` declares an own, enumerable, writable,
 * configurable data property, so the write cannot be intercepted.
 *
 * ★ IT WORKS ON AN ACCUMULATOR THIS MODULE DOES NOT OWN. The record is created by the caller, so
 * choosing a prototype-less container here is not available; the guarantee has to come from the WRITE
 * rather than from the construction, which is exactly what `defineProperty` provides regardless of
 * how the caller built the object.
 *
 * CFML parity [model/service/PromotionService.cfc:L152]: a CFML struct has no prototype chain and no
 * reserved keys, so `orderItemQulifiedDiscounts[ '__proto__' ]` held its array like any other order
 * item. The plain assignment this replaces was the divergence, and it is the ONLY thing changing
 * here - the unconditional assignment, the absence of a `structKeyExists` guard and the
 * assign-only-inside-the-gate placement are all preserved exactly as documented at the call site.
 *
 * The identical mechanism, for the identical reason, is used by `src/lib/logger.ts`
 * `redactPlainObject`, `src/domain/entities/sku.ts`, `src/domain/entities/product.ts`,
 * `src/repositories/mysql/mysqlSkuRepository.ts`, `src/services/priceGroupService.ts`,
 * `src/services/productService.ts` and `./rewardUsageLedger.ts`.
 *
 * @param target the caller's accumulator. Mutated in place.
 * @param key the opaque order-item identifier. Used verbatim, never normalised.
 * @param value the potential-discount array to store.
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
 * Seeds sale-price records into the qualified-discount accumulator.
 *
 * A class rather than a bare function so the promotion resolver arrives as an explicit,
 * compile-checked constructor argument - the replacement for the legacy convention-scanned bean
 * factory. No container, no locator, no runtime scan.
 *
 * INSTANCES CARRY NO MUTABLE STATE: the only field is the `readonly` resolver, and the accumulator
 * written into belongs to the caller.
 */
export class SalePriceSeeder {
  constructor(private readonly promotionResolver: SalePricePromotionResolver) {}

  /**
   * Runs the sale-price seeding pass over one order.
   *
   * Ports [model/service/PromotionService.cfc:L144-L162] whole. The name is idiomatic TypeScript
   * because the source fragment is inline code inside a much larger function with no method name to
   * preserve; interface parity binds the named service methods, and this is not one of them.
   *
   * THE ACCUMULATOR IS SUPPLIED BY THE CALLER, NOT RETURNED. Legacy declares it at
   * [model/service/PromotionService.cfc:L142] and this loop writes into it in place. That also
   * keeps L152's semantics observable: an unconditional assignment can only be seen to REPLACE
   * something if the map it writes into might already hold it.
   *
   * JUDGMENT CALL: this method is `async` because the promotion resolution at
   * [model/service/PromotionService.cfc:L157] reaches persistent storage, and for no other reason.
   * The sale-price detail read at L146 also reaches a DAO transitively, but
   * `src/domain/entities/sku.ts` resolved that reach at the repository boundary by
   * pre-materializing the detail row during hydration, so the accessor is synchronous and is
   * deliberately not awaited. Items are processed strictly in sequence, as the legacy loop is:
   * batching the resolver calls would change the order in which the accumulator is written.
   *
   * ONE PROMOTION INSTANCE PER IDENTIFIER, FOR THE LIFETIME OF ONE CALL. An invocation-local
   * identity map stands in for the ORM session's own, so two order items discounted by the same
   * promotion receive the SAME entity instance rather than two equal copies — which is what the
   * legacy did, and what makes reference comparison behave the same way here as it did there. The
   * map is a local, never a field: see the annotation at its declaration for why that placement is
   * load-bearing rather than incidental. It changes nothing about item order.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294]: this module APPENDS ONLY. The
   * descending insertion sort establishing the "index [1] is the best discount" invariant that the
   * application pass at L529-L534 depends on lives at L266-L294, outside this range. Two
   * consequences of seeding running FIRST: a seeded record occupies position 1 the moment it is
   * appended, and the displacement test at L271 is a STRICT `<`, so a reward discount of exactly
   * equal value does NOT displace an incumbent sale price. The two sorts must never be unified -
   * the reward-usage ledger at L301-L329 is insert-sorted ASCENDING by discount-per-use while the
   * accumulator is sorted DESCENDING by discount amount, and one shared comparator would change the
   * money.
   *
   * @param order the order to seed, as the read-only anti-corruption view. Never mutated.
   * @param orderItemQualifiedDiscounts the caller's accumulator, written in place.
   */
  public async seedSalePriceDiscounts(
    order: OrderView,
    orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  ): Promise<void> {
    const orderItems: readonly OrderItemView[] = order.orderItems;

    // CFML parity [model/service/PromotionService.cfc:L157]: `this.getPromotion(id)` resolves through the ORM SESSION, whose IDENTITY MAP answers the second request for an identifier with THE VERY SAME ENTITY INSTANCE it answered the first with. This map reproduces that, and it is a correctness property rather than a shortcut.
    // Two order items whose winning sale prices come from the same promotion is an ordinary
    // situation — a promotion that discounts a product line puts one row in the sale-price
    // projection per SKU, all carrying one `promotionID`. The legacy engine placed ONE object in
    // both accumulator records. Without this map the target places TWO distinct objects that merely
    // compare equal field by field, and reference identity is observable: entity removal helpers
    // elsewhere in this port fall back to comparing instances when identifiers are empty, so
    // "equal but not the same" is a state the legacy could not reach and this port should not
    // manufacture. Resolving an identifier twice and getting two answers is also a state the legacy
    // could not reach, and it is the one this map rules out.
    //
    // ★ THE MAP IS INVOCATION-LOCAL, NOT AN INSTANCE FIELD, AND THAT PLACEMENT IS THE WHOLE POINT.
    // A field on the seeder would survive between unrelated requests on a warm container, because
    // the composition root builds this class once — so one order's resolved promotions would answer
    // another order's lookups, and a promotion edited between the two requests would go unseen. The
    // ORM session it stands in for is created and discarded per request, so per-invocation is the
    // faithful lifetime as well as the safe one. Legacy declares every accumulator in this function
    // with `var` for the same reason. It is declared here rather than inside the loop so that it
    // spans the whole pass, and it is the only mutable structure this method owns besides the
    // caller's accumulator.
    const resolvedPromotions = new Map<string, Promotion>();

    for (const orderItem of orderItems) {
      const salePriceDetails = orderItem.sku.getSalePriceDetails();

      const skuPrice = orderItem.sku.getPrice();

      // CFML parity [model/service/PromotionService.cfc:L148]: the gate is a CONJUNCTION of two
      // independent tests joined by a SHORT-CIRCUITING `&&`, and both halves are reproduced in
      // order - key presence first, comparison second, and the comparison is never reached when the
      // key is absent. Test one is `structKeyExists(salePriceDetails, "salePrice")`, routed through
      // the CFML struct helper because CFML struct keys match CASE-INSENSITIVELY while TypeScript
      // keys do not. It is a presence test and nothing more: no default-value lookup, because
      // substituting a default for an absent price is precisely how a zero reaches a money path. A
      // value-fetching lookup is also avoided because the row's members have different types, so
      // fetching through the helper would widen the result to their union and force a runtime type
      // test the legacy never performs. The leading `!== undefined` term is the same test one level
      // up, written as an explicit comparison because the nullish helper answers a boolean without
      // narrowing. Test two is `salePriceDetails.salePrice < orderItem.getSku().getPrice()`, a
      // STRICT less than: a sale price EQUAL to the SKU price seeds nothing at all. It is expressed
      // through the money value object's comparison surface, never as a raw numeric comparison.
      if (
        salePriceDetails !== undefined &&
        structKeyExists(salePriceDetails, 'salePrice') &&
        salePriceDetails.salePrice.isLessThan(skuPrice)
      ) {
        const salePrice = salePriceDetails.salePrice;
        const quantity = orderItem.quantity;
        const orderItemID = orderItem.orderItemID;

        const discountAmount = skuPrice.times(quantity).minus(salePrice.times(quantity));

        const potentialDiscounts: QualifiedDiscount[] = [];
        // `putOwnStructKey`, not `orderItemQualifiedDiscounts[orderItemID] = …`: the key is an
        // opaque identifier from the order view, and a plain assignment for `__proto__` would
        // store nothing - leaving the application pass with no key and no discount for an item
        // whose sale price has already been computed. The assignment's UNCONDITIONAL nature and
        // its placement inside the gate are unchanged; only the write mechanism differs.
        putOwnStructKey(orderItemQualifiedDiscounts, orderItemID, potentialDiscounts);

        // CFML parity [model/service/PromotionService.cfc:L157]: a `Promotion` reaches the accumulator by
        // TWO DIFFERENT ROUTES - this one and the reward path at L276 and L290 - and only this one is a
        // lookup.
        // Here the winning detail row carries a promotion identifier and the promotion is resolved
        // FROM it. On the reward path the promotion is reached by pure association traversal —
        // `reward.getPromotionPeriod().getPromotion()` — with no lookup at all. Both yield the same
        // entity type and the accumulator record is identical either way, which is why the record
        // type needs no discriminator. The identifier is OPAQUE: it is passed straight through,
        // never parsed, never validated and never transformed.
        // Resolution happens after the array has been stored, matching the source order in which
        // L152 completes before the L155 record literal is evaluated.
        //
        // The identity map declared at the top of the pass is consulted FIRST, exactly as the ORM
        // session consults its own before reaching storage. A hit answers with the instance already
        // resolved in this pass; a miss delegates to the collaborator and records the answer. Item
        // ORDER IS UNAFFECTED: items are processed sequentially, and each async miss is awaited to
        // completion before the next item is visited. What changes is only how many distinct
        // instances exist for one identifier — one, as in the legacy — and it is written with an
        // explicit `undefined` narrowing rather than `Map.has` followed by an indexed read, because a
        // non-null assertion is not available in this subtree.
        const memoizedPromotion = resolvedPromotions.get(salePriceDetails.promotionID);
        let promotion: Promotion;

        if (memoizedPromotion !== undefined) {
          promotion = memoizedPromotion;
        } else {
          promotion = await this.promotionResolver.getPromotion(salePriceDetails.promotionID);
          resolvedPromotions.set(salePriceDetails.promotionID, promotion);
        }

        // [L154-L159] `arrayAppend` of exactly ONE record, into the array created one line above.
        // The record has EXACTLY THREE members; see the header note on the L121-L131 docblock,
        // which promises five. The type is imported, so the shape cannot drift.
        //
        // CFML parity [model/service/PromotionService.cfc:L156]: `promotionRewardID = ""` - the
        // EMPTY STRING is an in-band SENTINEL, not a placeholder, and it is what makes a sale-price
        // record STRUCTURALLY IMMUNE to use-limit stripping. The over-use stripping pass at
        // L468-L521 iterates the reward-usage ledger's keys and matches records with
        // `.promotionRewardID == prID` at L483 and L499; every `prID` is a real reward identifier
        // and the ledger never holds a key for the empty string, so a seeded record can never be
        // matched, scaled down or deleted. Reward-path records carry the reward's REAL identifier
        // (`reward.getPromotionRewardID()` at L275 and L289), which is what makes them strippable
        // and this one not. Substituting `undefined`, `null`, a synthetic identifier, a symbol or a
        // discriminant tag - or modelling sale-price records as a separate union member - would
        // erase the immunity along with the sentinel and change the amount a customer is charged.
        // `./overUseStripping.ts` must likewise not be extended to reach these records.
        potentialDiscounts.push({
          promotionRewardID: '',
          promotion,
          discountAmount,
        });
      }
    }
  }
}
