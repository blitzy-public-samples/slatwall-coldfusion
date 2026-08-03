/**
 * SALE-PRICE SEEDING - the pass that enters sale prices into the discount competition.
 *
 * Port of [model/service/PromotionService.cfc:L144-L162], the first loop inside
 * `updateOrderAmountsWithPromotions`. It walks the order's items and, for every item whose SKU
 * carries a sale price strictly below the SKU's own price, seeds one qualified-discount record into
 * the accumulator BEFORE the main reward iteration at [model/service/PromotionService.cfc:L164]
 * begins. Running first is what lets a sale price compete on equal footing with reward discounts in
 * the descending insertion sort that happens later and elsewhere.
 *
 * `model/service/PromotionService.cfc` is the sole behavioural authority for this module;
 * `model/entity/Sku.cfc` is consulted only as the accessor contract behind
 * `orderItem.getSku().getSalePriceDetails()`.
 *
 * WHAT THIS MODULE MUST NOT DO, each prohibition being a money decision rather than a style
 * preference:
 *
 *   * It does NOT sort. The descending insertion sort establishing "index [1] is best" lives at
 *     [model/service/PromotionService.cfc:L266-L294] and belongs to the promotion facade.
 *   * It does NOT round, quantize, clamp or format. The seeded amount is a raw extended-price
 *     delta; quantization belongs to the reward path alone
 *     ([model/service/PromotionService.cfc:L1017], ported in `./discountAmount.ts`).
 *   * It does NOT add a guard the legacy lacks - no non-negativity test on the sale price, no
 *     presence test on the promotion identifier, no throw on a malformed detail row.
 *   * It holds NO state. The accumulator is supplied by the caller and lives for exactly one
 *     invocation, mirroring `var orderItemQulifiedDiscounts = {}` at
 *     [model/service/PromotionService.cfc:L142]. Reusing one map across invocations on a warm
 *     container would surface one customer's discount in another customer's order.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L142]: the accumulator is spelled
 * `orderItemQulifiedDiscounts` in the source - "Qulified", missing the `a` - and the target uses
 * the corrected `orderItemQualifiedDiscounts`. The rename is permitted because the identifier is a
 * function-local accumulator, never a column, a JSON key or a parameter name, and interface parity
 * binds public method names. Identifiers that ARE contracts stay verbatim wherever they surface -
 * `hb_permission="promotionPeriod.promtionRewards"` at [model/entity/PromotionReward.cfc:L57] chief
 * among them. One is renamed with a comment, the other preserved with a comment.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L138]: the neighbouring declaration - the
 * reward-usage ledger this module deliberately does NOT touch - carries the comment "This is a
 * structure of promotionRewards that will hold information reguarding maximum usages". "reguarding"
 * is the source's own spelling, quoted unaltered.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L150, L252, L299, L486, L990, L995, L1001, L1006,
 * L1007]: the `precisionEvaluate` census for this component is NINE sites, not the eight the
 * published plan lists. The plan's "L248" is a comment line and the arithmetic it means is on L252;
 * the plan's single "L1007" is really two adjacent sites, L1006 and L1007. This module owns exactly
 * one of the nine - L150 - and routes it through the `Money` value object.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L121-L131]: the illustrative docblock promises
 * FIVE members on each accumulator record - `promotionRewardID`, `promotion`, `discountAmount`,
 * `discountQuantity` and `discountPerUseValue` - while all three construction sites write only the
 * first three (L156-L158 here, L275-L277 and L289-L291 on the reward path). The target follows the
 * CODE, and the record type is imported from
 * `../../domain/promotionEngine/qualifiedDiscountTypes.js` rather than redeclared. A same-named
 * `discountQuantity` and `discountPerUseValue` do exist, but on the reward ledger's per-item usage
 * rows at L311-L312 and L325-L326; the docblock conflates two structures.
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
 * `../../domain/ports/promotionRepository.js`, whose eight members are frozen and none of which
 * loads a `Promotion` by identifier. Declaring it under `src/domain/ports/` would create that
 * fourteenth port by another name, so it is declared beside its only consumer. A service locator, a
 * runtime scan or module-level state are all excluded outright.
 *
 * THE RETURN IS NON-NULLABLE, DELIBERATELY. The legacy assigns the result straight into the record
 * with no absence test and `QualifiedDiscount.promotion` is required, so
 *   `Promise<Promotion | undefined>`
 * would force a throw or a skip that the legacy never performs.
 *
 * ★ NOT EXPORTED, AND AN EARLIER REVISION EXPORTED IT.
 *
 * This declaration is deliberately MODULE-LOCAL. Exporting it makes it an importable contract that
 * any module may depend on and any adapter may implement — which is a port in everything but the
 * folder it sits in, and the port set is CLOSED AT THIRTEEN. The alternative rejected above was
 * "declare this in `src/domain/ports/`, creating the fourteenth port by another name"; publishing it
 * from here reaches the same place by a shorter route, so the export was removed rather than the
 * declaration moved. The instruction it now satisfies is literal: declare the contract as a LOCAL
 * type alias in this file, attached to the one class that consumes it.
 *
 * Nothing outside this file referenced it, so removing the export narrows a surface without
 * changing a single behaviour. `src/handlers/bootstrap.ts` wires the collaborator by passing a value
 * to {@link SalePriceSeeder}'s constructor, which is a structural check against the parameter type —
 * it never needed the name, and TypeScript's structural typing means it still does not. Any object
 * with a matching `getPromotion` satisfies the constructor whether or not the type is importable.
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
    // CFML parity [model/service/PromotionService.cfc:L145]:
    //   `for(var orderItem in arguments.order.getOrderItems())`
    // iterates an ARRAY, and CFML's for-in over an array yields the ELEMENTS rather than indices -
    // so this is a plain for-of, with no 1-based index emulation and no index arithmetic. The
    // collection expression is evaluated once, as CFML evaluates it once.
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
      // [L146] The sale-price detail row for this item's SKU. `undefined` is how the target spells
      // the legacy's "no sale-price row": `Product.getSkuSalePriceDetails` guards on key existence
      // at [model/entity/Product.cfc:L183-L184] with NO `else`, so a SKU with no winning sale price
      // yields an absent or empty structure - which is why the presence test below is necessary
      // rather than merely defensive. In CFML `salePrice` is an optional KEY on a struct that may
      // itself be empty and both states answer the same `structKeyExists` test; the ported
      // projection makes the RECORD optional and `salePrice` a required member of a record that
      // exists, so both halves of the legacy test must be reproduced.
      const salePriceDetails = orderItem.sku.getSalePriceDetails();

      // CFML parity [model/service/PromotionService.cfc:L148, L150]:
      // `orderItem.getSku().getPrice()` is evaluated TWICE in the source - once in the gate at L148
      // and again inside the arithmetic at L150. Each value is read ONCE here so the gate and the
      // arithmetic provably test and multiply the same value. Both accessors are plain field reads
      // over already-materialized state ([model/entity/Sku.cfc:L56] declares `default="0"`, so the
      // price is never absent), so hoisting them cannot be observed.
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
        // [L150] and [L152-L159] read these three values; each is captured once. The quantity is a
        // COUNT rather than money - the column is `ormtype="integer"` - so it stays a number and
        // enters the arithmetic as a multiplier.
        const salePrice = salePriceDetails.salePrice;
        const quantity = orderItem.quantity;
        const orderItemID = orderItem.orderItemID;

        // CFML parity [model/service/PromotionService.cfc:L150]: the legacy computes TWO EXTENDED
        // AMOUNTS AND SUBTRACTS THEM - `(price * quantity) - (salePrice * quantity)` - and that
        // shape is reproduced exactly: two multiplications, then one subtraction. It is
        // deliberately NOT simplified to `(price - salePrice) * quantity`; the two forms agree in
        // exact decimal arithmetic, so the reason is the acceptance contract, which is that a
        // reviewer can diff the target against the cited source line. This is `precisionEvaluate`
        // site L150 of the nine recorded in the module header. All of it runs through the money
        // value object; nothing is rounded, quantized, clamped or formatted, and the two-decimal
        // presentation step belongs to the reward path alone.
        const discountAmount = skuPrice.times(quantity).minus(salePrice.times(quantity));

        // CFML parity [model/service/PromotionService.cfc:L152]: a FRESH empty array is assigned
        // UNCONDITIONALLY - there is no `structKeyExists` guard here - and only INSIDE the gate
        // above. The asymmetry with the reward path is reproduced rather than normalised: L260-L263
        // wraps the identical assignment in `if(!structKeyExists(...))`, so it preserves an
        // existing bucket where this one would replace it. Assigning only inside the gate is
        // load-bearing downstream: the application pass at L529 tests `structKeyExists` on this
        // map, so an item with no qualifying sale price must genuinely have NO key. Pre-seeding
        // every item with an empty array would change which items are considered. The array is held
        // in a local as well as stored because L155 appends into the very array L152 created.
        const potentialDiscounts: QualifiedDiscount[] = [];
        // `putOwnStructKey`, not `orderItemQualifiedDiscounts[orderItemID] = …`: the key is an
        // opaque identifier from the order view, and a plain assignment for `__proto__` would
        // store nothing - leaving the application pass with no key and no discount for an item
        // whose sale price has already been computed. The assignment's UNCONDITIONAL nature and
        // its placement inside the gate are unchanged; only the write mechanism differs.
        putOwnStructKey(orderItemQualifiedDiscounts, orderItemID, potentialDiscounts);

        // CFML parity [model/service/PromotionService.cfc:L157 versus L276 and L290]: a `Promotion` reaches the accumulator by TWO DIFFERENT ROUTES, and only this one is a lookup.
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
        // ORDER IS UNAFFECTED: the lookup is synchronous, the items are still visited in sequence,
        // and each item still completes before the next begins. What changes is only how many
        // distinct instances exist for one identifier — one, as in the legacy — and it is written
        // with an explicit `undefined` narrowing rather than `Map.has` followed by an indexed read,
        // because a non-null assertion is not available in this subtree.
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
